"""Small MBPO (Janner et al. 2019, arXiv 1906.08253) for the Gym-TORAX ramp-up.

Loop, per real environment step:
  1. act in TORAX with the current SAC policy and store the transition (real buffer);
  2. every ``rollout_every`` steps, branch ``rollout_batch`` short rollouts of length k
     from real states through the learned ensemble (model buffer);
  3. do ``utd`` SAC updates on minibatches mixing ``real_ratio`` real and model data.
The ensemble is refit after every real episode. The time feature is advanced exactly
(it is known), so the model only has to learn the plasma response and the reward.

Everything that matters for the data-efficiency question is logged: real simulator
steps used for training, wall time, and the benchmark and audited returns of the
deterministic policy after each evaluation. The best checkpoint is chosen by the
audited return when the training reward is the audited one (``reward_mode="patched"``).

In residual mode (``ResidualEnv``: the agent corrects the PI controller) the actor's
output layer starts at zero mean and a small spread, so the first episodes are PI
episodes with small perturbations rather than uniform random actions, and the PI
features of model rollouts are advanced exactly where they are known.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass

import numpy as np
import torch

from ..env import RampupEnv
from ..evaluate import run_policy
from ..residual import ResidualAdvance, ResidualEnv
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
    residual_init: bool = False  # zero-mean actor output and log_std = init_log_std; no uniform-random first episode
    init_log_std: float = -1.0
    init_alpha: float = 1.0  # SAC entropy weight at the start (residual runs: 0.1, so entropy does not push far from PI)
    failure_rule: bool = False  # end model rollouts that leave Gym-TORAX's bounds, with the failure reward
    known_reward: bool = False  # score model rollouts with the reward formula on the predicted state (KnownReward)
    seed: int = 0


class FailureRule:
    """Gym-TORAX's bounds file (envs/iter_hybrid.json) inside model rollouts: T_e, T_i <= 35 keV and q <= 100,
    otherwise the step returns -1000 and the episode ends. The observation set "profiles" carries T_e(0), T_i(0)
    and q at the edge, so a model rollout can end the same way a real episode does. Other observation sets: no rule.
    """

    def __init__(self, env: RampupEnv):
        from ..env import PROFILE_IDX, SCALAR_KEYS

        self.active = env.cfg.obs_set == "profiles" and env._stats is not None
        n0 = 1 + 3 + len(SCALAR_KEYS)  # time, last action, scalars
        k = len(PROFILE_IDX)
        self.idx = np.array([n0, n0 + 1, n0 + 3 + 4 * k - 1])  # T_e(0), T_i(0), q(rho=1)
        self.limit = np.array([35.0, 35.0, 100.0])
        if self.active:
            self.mu, self.sd = env._stats[0][self.idx], env._stats[1][self.idx]
        self.penalty = -1000.0 if env.cfg.reward_mode == "benchmark" else env.cfg.failure_penalty
        # physics environment: also its operating limits (Greenwald fraction; l_i(3) window during the ramp-up)
        self.physics = getattr(env.inner, "physics", None) if getattr(env, "physics", None) is not None else None
        if self.active and self.physics is not None:
            self.p_idx = np.array([0, 1 + 3 + SCALAR_KEYS.index("fgw_n_e_line_avg"), 1 + 3 + SCALAR_KEYS.index("li3")])
            self.p_mu, self.p_sd = env._stats[0][self.p_idx], env._stats[1][self.p_idx]
            self.h = env.horizon

    def __call__(self, x: np.ndarray) -> np.ndarray:
        if not self.active:
            return np.zeros(len(x), dtype=bool)
        bad = (x[:, self.idx] * self.sd + self.mu > self.limit).any(axis=1)
        if self.physics is not None:
            t_frac, fgw, li = (x[:, self.p_idx] * self.p_sd + self.p_mu).T
            t, p = np.rint(t_frac * (self.h - 1)), self.physics
            bad |= fgw > p.fgw_max
            bad |= (t <= p.li_until_s) & ((li < p.li_min) | (li > p.li_max))
        return bad


class KnownReward:
    """The training reward is a known function of the next observation: Gym-TORAX's four reward terms, or the audited
    ones, times ``reward_scale``. Model rollouts can therefore score their predicted states exactly instead of using
    the learned reward head, which cannot represent the H-mode gate (a step in T_e(0), T_i(0) and, audited,
    P_SOL - P_LH) and gets exploited. Needs the observation sets "profiles" or "scalars", which carry every input.
    """

    KEYS = ("Q_fusion", "H98", "q_min", "q95", "P_SOL_total", "P_LH")

    def __init__(self, env: RampupEnv):
        from ..env import SCALAR_KEYS

        cfg = env.cfg
        self.active = (env._stats is not None and cfg.obs_set in ("profiles", "scalars")
                       and cfg.reward_mode in ("scaled", "patched", "benchmark"))
        n0 = 1 + 3  # time, last action
        self.idx = np.array([n0 + SCALAR_KEYS.index(k) for k in self.KEYS] + [n0 + len(SCALAR_KEYS), n0 + len(SCALAR_KEYS) + 1])
        # physics environment: H-mode is TORAX's confinement state (a feature) with P_heat >= margin * P_LH
        self.physics = env.inner.physics if getattr(env, "physics", None) is not None else None
        if self.physics is not None:
            assert cfg.reward_mode != "patched", "the physics environment's own reward is already the audited form"
            self.idx[4] = env.physics_idx + 2  # P_heat_total in place of P_SOL_total
            self.idx[6] = env.physics_idx  # is_H_mode in place of T_e(0)
        if self.active:
            self.mu, self.sd = env._stats[0][self.idx], env._stats[1][self.idx]
        self.audited = cfg.reward_mode == "patched"
        self.scale = 1.0 if cfg.reward_mode == "benchmark" else cfg.reward_scale

    def __call__(self, x: np.ndarray) -> np.ndarray:
        q, h98, qmin, q95, p_sol, p_lh, te0, ti0 = (x[:, self.idx] * self.sd + self.mu).T
        if self.physics is not None:  # p_sol is P_heat, te0 is the H-mode flag here
            p = self.physics
            h = (te0 > 0.5) & (p_sol >= p.h_margin * p_lh)
            q = np.minimum(q, p.q_cap)
            r = (np.where(h, q / p.q_cap, 0.0) + np.where(h, np.minimum(h98, 1.0), 0.0)) / 50
            r += (np.minimum(qmin, 1.0) + np.minimum(q95 / 3, 1.0)) / 150
            return (self.scale * r).astype(np.float32)
        h = (te0 > 10) & (ti0 > 10)
        if self.audited:
            h &= p_sol >= p_lh
            q = np.minimum(q, 10.0)
        r = (np.where(h, q / 10, 0.0) + np.where(h, np.minimum(h98, 1.0), 0.0)) / 50
        r += (np.minimum(qmin, 1.0) + np.minimum(q95 / 3, 1.0)) / 150
        return (self.scale * r).astype(np.float32)


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
               penalty_lambda: float = 0.0, on_best=None) -> dict:
    rng = np.random.default_rng(cfg.seed)
    torch.manual_seed(cfg.seed)
    eval_env = eval_env or env
    od, ad = env.observation_space.shape[0], env.action_space.shape[0]
    agent = SAC(od, ad, cfg.hidden, cfg.lr, cfg.gamma, seed=cfg.seed)
    with torch.no_grad():
        agent.log_alpha.fill_(float(np.log(cfg.init_alpha)))
    if cfg.residual_init:
        head = agent.actor.net[-1]
        with torch.no_grad():
            head.weight.zero_()
            head.bias.zero_()
            head.bias[ad:] = cfg.init_log_std
    model = Ensemble(od, ad, cfg.ensemble_size, cfg.model_hidden, seed=cfg.seed)
    real = Buffer(od, ad, cfg.real_episodes * env.horizon + 10)
    model_cap = cfg.rollout_batch * cfg.k_max * cfg.model_retain_rollouts
    mbuf = Buffer(od, ad, model_cap)
    advance = TimeAdvance(env)
    if isinstance(env, ResidualEnv):
        advance = ResidualAdvance(env, advance)
    select = "audited_return" if env.cfg.reward_mode == "patched" else "benchmark_return"
    rule = FailureRule(env) if cfg.failure_rule else None
    reward_fn = KnownReward(env) if cfg.known_reward else None
    if reward_fn is not None and not reward_fn.active:
        reward_fn = None
    t0 = time.time()
    curve, real_steps, model_fitted = [], 0, False
    best_eval = -np.inf
    train_returns = []
    for ep in range(cfg.real_episodes):
        x, _ = env.reset()
        done, ep_ret = False, 0.0
        while not done:
            a = agent.act(x) if real_steps > 0 or model_fitted or cfg.residual_init else env.action_space.sample()
            x2, r, term, trunc, info = env.step(a)
            done = term or trunc
            ep_ret += info["benchmark_reward"]
            real.add_batch([x], [a], [r], [x2], [float(term)])
            x = x2
            real_steps += 1
            if model_fitted and real_steps % cfg.rollout_every == 0:
                _branch(agent, model, real, mbuf, advance, k_for_episode(cfg, ep), cfg.rollout_batch, rng,
                        penalty_lambda, env.cfg.clip_obs, rule, reward_fn)
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
                penalty_lambda, env.cfg.clip_obs, rule, reward_fn)
        minutes = (time.time() - t0) / 60
        row = {"episode": ep + 1, "real_steps": real_steps, "minutes": minutes, "train_return": ep_ret,
               "model_holdout_mse": fit["holdout_mse_norm"], "k": k_for_episode(cfg, ep)}
        if (ep + 1) % cfg.eval_every_episodes == 0 or ep == cfg.real_episodes - 1 or minutes > cfg.max_minutes:
            ev = run_policy(eval_env, lambda o: agent.act(o, deterministic=True))
            row.update({"eval_return": ev["benchmark_return"], "eval_audited": ev["audited_return"],
                        "eval_failed": ev["failed"]})
            if ev[select] > best_eval:
                best_eval = ev[select]
                if on_best is not None:
                    on_best(agent)
        curve.append(row)
        log(row)
        if minutes > cfg.max_minutes:
            break
    return {"agent": agent, "model": model, "curve": curve, "config": asdict(cfg), "real_steps": real_steps,
            "minutes": (time.time() - t0) / 60, "train_returns": train_returns}


def _branch(agent: SAC, model: Ensemble, real: Buffer, mbuf: Buffer, advance: TimeAdvance, k: int, n: int,
            rng: np.random.Generator, penalty_lambda: float, clip: float, rule: FailureRule | None = None,
            reward_fn: KnownReward | None = None) -> None:
    o = real.sample(n, rng)[0]
    alive = np.ones(n, dtype=bool)
    for _ in range(k):
        with torch.no_grad():
            a, _ = agent.actor(torch.as_tensor(o, dtype=torch.float32))
        a = a.numpy()
        o2, r, unc = model.predict(o, a, rng)
        o2 = np.clip(o2, -clip, clip)
        d = advance(o, o2)
        if reward_fn is not None:
            r = reward_fn(o2)
        r = r - penalty_lambda * unc
        if rule is not None:
            fail = rule(o2)
            r = np.where(fail, rule.penalty, r)
            d = np.maximum(d, fail.astype(np.float32))
        mbuf.add_batch(o[alive], a[alive], r[alive], o2[alive], d[alive])
        alive &= d < 0.5
        if not alive.any():
            break
        o = o2
