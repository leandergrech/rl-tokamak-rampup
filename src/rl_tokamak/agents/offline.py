"""Offline RL on logged PI-controller data: behaviour cloning, TD3+BC and MOPO.

* TD3+BC (Fujimoto & Gu 2021, arXiv 2106.06860): actor maximises
  lambda * Q(s, pi(s)) - (pi(s) - a)^2 with lambda = alpha / mean|Q|, alpha = 2.5,
  states normalised with dataset statistics.
* BC is the same actor trained on the squared-error term alone.
* MOPO (Yu et al. 2020, arXiv 2005.13239): fit the ensemble on the dataset, then
  run SAC on short model rollouts whose reward is r - lambda * max_i ||sigma_i(s, a)||.

The question these answer: can an offline learner beat a *deterministic* classical
behaviour policy from its own logs? With one deterministic trajectory the data has
no action coverage, so any improvement must come from extrapolation.
"""

from __future__ import annotations

import copy
import time
from dataclasses import asdict, dataclass

import numpy as np
import torch
import torch.nn.functional as F

from .ensemble import Ensemble
from .mbpo import TimeAdvance, _branch
from .sac_core import SAC, Buffer, mlp


def load_dataset(path: str) -> dict[str, np.ndarray]:
    d = np.load(path)
    return {k: d[k] for k in d.files}


class TD3BC:
    def __init__(self, obs_dim: int, act_dim: int, alpha: float = 2.5, bc_only: bool = False, hidden=(256, 256),
                 lr: float = 3e-4, gamma: float = 0.995, tau: float = 0.005, policy_noise: float = 0.2,
                 noise_clip: float = 0.5, policy_freq: int = 2, seed: int = 0):
        torch.manual_seed(seed)
        self.actor = torch.nn.Sequential(mlp(obs_dim, act_dim, hidden), torch.nn.Tanh())
        self.actor_t = copy.deepcopy(self.actor)
        self.q1, self.q2 = mlp(obs_dim + act_dim, 1, hidden), mlp(obs_dim + act_dim, 1, hidden)
        self.q1_t, self.q2_t = copy.deepcopy(self.q1), copy.deepcopy(self.q2)
        self.pi_opt = torch.optim.Adam(self.actor.parameters(), lr=lr)
        self.q_opt = torch.optim.Adam(list(self.q1.parameters()) + list(self.q2.parameters()), lr=lr)
        self.alpha, self.bc_only, self.gamma, self.tau = alpha, bc_only, gamma, tau
        self.policy_noise, self.noise_clip, self.policy_freq = policy_noise, noise_clip, policy_freq
        self.it = 0
        self.mu = np.zeros(obs_dim, np.float32)
        self.sd = np.ones(obs_dim, np.float32)

    def set_norm(self, obs: np.ndarray) -> None:
        self.mu, self.sd = obs.mean(0), obs.std(0) + 1e-3

    def _n(self, o):
        return (o - self.mu) / self.sd

    @torch.no_grad()
    def act(self, o: np.ndarray, deterministic: bool = True) -> np.ndarray:
        return self.actor(torch.as_tensor(self._n(o), dtype=torch.float32).unsqueeze(0)).squeeze(0).numpy()

    def update(self, o, a, r, o2, d) -> None:
        self.it += 1
        o, o2 = self._n(o), self._n(o2)
        o, a, r, o2, d = (torch.as_tensor(x, dtype=torch.float32) for x in (o, a, r, o2, d))
        if not self.bc_only:
            with torch.no_grad():
                noise = (torch.randn_like(a) * self.policy_noise).clamp(-self.noise_clip, self.noise_clip)
                a2 = (self.actor_t(o2) + noise).clamp(-1, 1)
                x2 = torch.cat([o2, a2], -1)
                y = r + self.gamma * (1 - d) * torch.min(self.q1_t(x2), self.q2_t(x2)).squeeze(-1)
            x = torch.cat([o, a], -1)
            q_loss = F.mse_loss(self.q1(x).squeeze(-1), y) + F.mse_loss(self.q2(x).squeeze(-1), y)
            self.q_opt.zero_grad()
            q_loss.backward()
            self.q_opt.step()
        if self.it % self.policy_freq == 0 or self.bc_only:
            pi = self.actor(o)
            bc = F.mse_loss(pi, a)
            if self.bc_only:
                loss = bc
            else:
                q = self.q1(torch.cat([o, pi], -1))
                lmbda = self.alpha / q.abs().mean().detach()
                loss = -lmbda * q.mean() + bc
            self.pi_opt.zero_grad()
            loss.backward()
            self.pi_opt.step()
            with torch.no_grad():
                for net, tgt in ((self.q1, self.q1_t), (self.q2, self.q2_t), (self.actor, self.actor_t)):
                    for p, pt in zip(net.parameters(), tgt.parameters()):
                        pt.mul_(1 - self.tau).add_(self.tau * p)


@dataclass
class OfflineConfig:
    algo: str = "td3bc"  # td3bc | bc | mopo
    steps: int = 60_000
    batch: int = 256
    alpha: float = 2.5
    gamma: float = 0.995
    # MOPO
    penalty_lambda: float = 1.0
    rollout_k: int = 5
    rollout_batch: int = 1000
    rollout_every: int = 250
    real_ratio: float = 0.05
    ensemble_size: int = 5
    max_minutes: float = 50.0
    eval_every: int = 20_000
    seed: int = 0


def train_offline(data: dict[str, np.ndarray], cfg: OfflineConfig, eval_fn=None, env=None, log=print) -> dict:
    """Train on a dataset of (obs, action, reward, next_obs, done); ``eval_fn(policy) -> return``."""
    rng = np.random.default_rng(cfg.seed)
    torch.manual_seed(cfg.seed)
    o, a, r, o2, d = data["obs"], data["action"], data["reward"], data["next_obs"], data["done"]
    od, ad = o.shape[1], a.shape[1]
    t0 = time.time()
    curve = []
    buf = Buffer(od, ad, len(o))
    buf.add_batch(o, a, r, o2, d)
    extra: dict = {}
    if cfg.algo in ("td3bc", "bc"):
        agent = TD3BC(od, ad, alpha=cfg.alpha, bc_only=cfg.algo == "bc", gamma=cfg.gamma, seed=cfg.seed)
        agent.set_norm(o)
        mbuf = model = advance = None
    else:
        agent = SAC(od, ad, gamma=cfg.gamma, seed=cfg.seed)
        model = Ensemble(od, ad, cfg.ensemble_size, seed=cfg.seed)
        extra["model_fit"] = model.fit(o, a, r, o2, rng=rng)
        mbuf = Buffer(od, ad, cfg.rollout_batch * cfg.rollout_k * 20)
        advance = TimeAdvance(env)
    for it in range(1, cfg.steps + 1):
        if model is not None:
            if it % cfg.rollout_every == 1:
                _branch(agent, model, buf, mbuf, advance, cfg.rollout_k, cfg.rollout_batch, rng,
                        cfg.penalty_lambda, 10.0)
            nr = int(cfg.batch * cfg.real_ratio)
            b1, b2 = buf.sample(nr, rng), mbuf.sample(cfg.batch - nr, rng)
            agent.update(*(np.concatenate([u, v]) for u, v in zip(b1, b2)))
        else:
            agent.update(*buf.sample(cfg.batch, rng))
        minutes = (time.time() - t0) / 60
        if eval_fn is not None and (it % cfg.eval_every == 0 or it == cfg.steps or minutes > cfg.max_minutes):
            ret = eval_fn(lambda x: agent.act(x, deterministic=True))
            row = {"step": it, "minutes": minutes, "eval_return": ret}
            curve.append(row)
            log(row)
        if minutes > cfg.max_minutes:
            break
    return {"agent": agent, "curve": curve, "config": asdict(cfg), "minutes": (time.time() - t0) / 60, **extra}
