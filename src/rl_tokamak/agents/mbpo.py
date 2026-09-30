"""Small MBPO (Janner et al. 2019, arXiv 1906.08253) for the Gym-TORAX ramp-up.

Loop, per real environment step:
  1. act in TORAX with the current SAC policy and store the transition (real buffer);
  2. every ``rollout_every`` steps, branch ``rollout_batch`` short rollouts of length k
     from real states through the learned ensemble (model buffer);
  3. do ``utd`` SAC updates on minibatches mixing ``real_ratio`` real and model data.
The ensemble is refit after every real episode. The time feature is advanced exactly
(it is known), so the model only has to learn the plasma response and the reward.

Everything that matters for the data-efficiency question is logged: real simulator
steps used for training, wall time, and the benchmark return of the deterministic
policy after each evaluation.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass

import numpy as np
import torch

from ..env import RampupEnv
from ..evaluate import run_policy
from .ensemble import Ensemble
from .sac_core import SAC, Buffer


@dataclass
class MBPOConfig:
    real_episodes: int = 40
    max_minutes: float = 55.0
    ensemble_size: int = 5
    model_hidden: int = 200
    rollout_every: int = 50
    rollout_batch: int = 1000
    k_min: int = 1
    k_max: int = 5
    k_ramp_episodes: tuple[int, int] = (4, 20)
    model_retain_rollouts: int = 12  # model buffer holds this many rollout phases
    utd: int = 10
    real_ratio: float = 0.1
    batch: int = 256
    hidden: tuple[int, ...] = (256, 256)
    gamma: float = 0.995
    lr: float = 3e-4
    eval_every_episodes: int = 2
    seed: int = 0


class TimeAdvance:
    """Exact update of the (normalised) time feature and the episode-end test."""

    def __init__(self, env: RampupEnv):
        self.h = env.horizon
        if env._stats is not None:
            self.mu, self.sd = float(env._stats[0][0]), float(env._stats[1][0])
        else:
            self.mu, self.sd = 0.0, 1.0

    def __call__(self, x: np.ndarray, x_next: np.ndarray) -> np.ndarray:
        t_frac = x[:, 0] * self.sd + self.mu
        step = np.rint(t_frac * (self.h - 1)) + 1
        x_next[:, 0] = (step / (self.h - 1) - self.mu) / self.sd
        return (step >= self.h).astype(np.float32)


def k_for_episode(cfg: MBPOConfig, ep: int) -> int:
    a, b = cfg.k_ramp_episodes
    if ep <= a:
        return cfg.k_min
    if ep >= b:
        return cfg.k_max
    return int(round(cfg.k_min + (ep - a) / (b - a) * (cfg.k_max - cfg.k_min)))


def train_mbpo(env: RampupEnv, cfg: MBPOConfig, log=print, eval_env: RampupEnv | None = None,
               penalty_lambda: float = 0.0) -> dict:
    rng = np.random.default_rng(cfg.seed)
    torch.manual_seed(cfg.seed)
    eval_env = eval_env or env
    od, ad = env.observation_space.shape[0], env.action_space.shape[0]
    agent = SAC(od, ad, cfg.hidden, cfg.lr, cfg.gamma, seed=cfg.seed)
    model = Ensemble(od, ad, cfg.ensemble_size, cfg.model_hidden, seed=cfg.seed)
    real = Buffer(od, ad, cfg.real_episodes * env.horizon + 10)
    model_cap = cfg.rollout_batch * cfg.k_max * cfg.model_retain_rollouts
    mbuf = Buffer(od, ad, model_cap)
    advance = TimeAdvance(env)
    t0 = time.time()
    curve, real_steps, model_fitted = [], 0, False
    train_returns = []
    for ep in range(cfg.real_episodes):
        x, _ = env.reset()
        done, ep_ret = False, 0.0
        while not done:
            a = agent.act(x) if real_steps > 0 or model_fitted else env.action_space.sample()
            x2, r, term, trunc, info = env.step(a)
            done = term or trunc
            ep_ret += info["benchmark_reward"]
            real.add_batch([x], [a], [r], [x2], [float(term)])
            x = x2
            real_steps += 1
            if model_fitted and real_steps % cfg.rollout_every == 0:
                _branch(agent, model, real, mbuf, advance, k_for_episode(cfg, ep), cfg.rollout_batch, rng,
                        penalty_lambda, env.cfg.clip_obs)
            if model_fitted and mbuf.n > cfg.batch:
                for _ in range(cfg.utd):
                    nr = int(cfg.batch * cfg.real_ratio)
                    b1, b2 = real.sample(nr, rng), mbuf.sample(cfg.batch - nr, rng)
                    agent.update(*(np.concatenate([u, v]) for u, v in zip(b1, b2)))
        train_returns.append(ep_ret)
        o_, a_, r_, o2_, _ = real.all()
        fit = model.fit(o_, a_, r_, o2_, rng=rng)
        model_fitted = True
        _branch(agent, model, real, mbuf, advance, k_for_episode(cfg, ep), cfg.rollout_batch, rng,
                penalty_lambda, env.cfg.clip_obs)
        minutes = (time.time() - t0) / 60
        row = {"episode": ep + 1, "real_steps": real_steps, "minutes": minutes, "train_return": ep_ret,
               "model_holdout_mse": fit["holdout_mse_norm"], "k": k_for_episode(cfg, ep)}
        if (ep + 1) % cfg.eval_every_episodes == 0 or ep == cfg.real_episodes - 1 or minutes > cfg.max_minutes:
            ev = run_policy(eval_env, lambda o: agent.act(o, deterministic=True))
            row.update({"eval_return": ev["benchmark_return"], "eval_failed": ev["failed"]})
        curve.append(row)
        log(row)
        if minutes > cfg.max_minutes:
            break
    return {"agent": agent, "model": model, "curve": curve, "config": asdict(cfg), "real_steps": real_steps,
            "minutes": (time.time() - t0) / 60, "train_returns": train_returns}


def _branch(agent: SAC, model: Ensemble, real: Buffer, mbuf: Buffer, advance: TimeAdvance, k: int, n: int,
            rng: np.random.Generator, penalty_lambda: float, clip: float) -> None:
    o = real.sample(n, rng)[0]
    alive = np.ones(n, dtype=bool)
    for _ in range(k):
        with torch.no_grad():
            a, _ = agent.actor(torch.as_tensor(o, dtype=torch.float32))
        a = a.numpy()
        o2, r, unc = model.predict(o, a, rng)
        o2 = np.clip(o2, -clip, clip)
        d = advance(o, o2)
        r = r - penalty_lambda * unc
        mbuf.add_batch(o[alive], a[alive], r[alive], o2[alive], d[alive])
        alive &= d < 0.5
        if not alive.any():
            break
        o = o2
