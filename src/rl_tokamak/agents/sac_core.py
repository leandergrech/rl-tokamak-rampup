"""Minimal SAC (twin critics, tanh-Gaussian actor, automatic entropy) used by MBPO and MOPO.

Model-free SAC in this repo is Stable-Baselines3's; this copy exists because MBPO/MOPO
need to control exactly which buffer each minibatch is drawn from.
"""

from __future__ import annotations

import copy

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


def mlp(inp: int, out: int, hidden: tuple[int, ...] = (256, 256), act=nn.ReLU) -> nn.Sequential:
    layers: list[nn.Module] = []
    d = inp
    for h in hidden:
        layers += [nn.Linear(d, h), act()]
        d = h
    layers.append(nn.Linear(d, out))
    return nn.Sequential(*layers)


class Buffer:
    def __init__(self, obs_dim: int, act_dim: int, capacity: int):
        self.cap, self.n, self.i = capacity, 0, 0
        self.o = np.zeros((capacity, obs_dim), np.float32)
        self.a = np.zeros((capacity, act_dim), np.float32)
        self.r = np.zeros((capacity,), np.float32)
        self.o2 = np.zeros((capacity, obs_dim), np.float32)
        self.d = np.zeros((capacity,), np.float32)

    def add_batch(self, o, a, r, o2, d) -> None:
        m = len(o)
        if m == 0:
            return
        idx = (self.i + np.arange(m)) % self.cap
        self.o[idx], self.a[idx], self.r[idx], self.o2[idx], self.d[idx] = o, a, r, o2, d
        self.i = int((self.i + m) % self.cap)
        self.n = min(self.n + m, self.cap)

    def sample(self, batch: int, rng: np.random.Generator):
        idx = rng.integers(0, self.n, size=batch)
        return self.o[idx], self.a[idx], self.r[idx], self.o2[idx], self.d[idx]

    def all(self):
        s = slice(0, self.n)
        return self.o[s], self.a[s], self.r[s], self.o2[s], self.d[s]


class Actor(nn.Module):
    def __init__(self, obs_dim: int, act_dim: int, hidden=(256, 256)):
        super().__init__()
        self.net = mlp(obs_dim, 2 * act_dim, hidden)

    def forward(self, o: torch.Tensor, deterministic: bool = False):
        mu, log_std = self.net(o).chunk(2, dim=-1)
        log_std = log_std.clamp(-5, 2)
        if deterministic:
            return torch.tanh(mu), None
        std = log_std.exp()
        u = mu + std * torch.randn_like(mu)
        a = torch.tanh(u)
        logp = (-0.5 * ((u - mu) / std) ** 2 - log_std - 0.5 * np.log(2 * np.pi)).sum(-1)
        logp = logp - (2 * (np.log(2) - u - F.softplus(-2 * u))).sum(-1)
        return a, logp


class SAC:
    def __init__(self, obs_dim: int, act_dim: int, hidden=(256, 256), lr: float = 3e-4, gamma: float = 0.995,
                 tau: float = 0.005, seed: int = 0):
        torch.manual_seed(seed)
        self.actor = Actor(obs_dim, act_dim, hidden)
        self.q1, self.q2 = mlp(obs_dim + act_dim, 1, hidden), mlp(obs_dim + act_dim, 1, hidden)
        self.q1_t, self.q2_t = copy.deepcopy(self.q1), copy.deepcopy(self.q2)
        self.log_alpha = torch.zeros(1, requires_grad=True)
        self.target_entropy = -float(act_dim)
        self.pi_opt = torch.optim.Adam(self.actor.parameters(), lr=lr)
        self.q_opt = torch.optim.Adam(list(self.q1.parameters()) + list(self.q2.parameters()), lr=lr)
        self.a_opt = torch.optim.Adam([self.log_alpha], lr=lr)
        self.gamma, self.tau = gamma, tau

    @torch.no_grad()
    def act(self, o: np.ndarray, deterministic: bool = False) -> np.ndarray:
        a, _ = self.actor(torch.as_tensor(o, dtype=torch.float32).unsqueeze(0), deterministic)
        return a.squeeze(0).numpy()

    def update(self, o, a, r, o2, d) -> dict[str, float]:
        o, a, r, o2, d = (torch.as_tensor(x, dtype=torch.float32) for x in (o, a, r, o2, d))
        alpha = self.log_alpha.exp().detach()
        with torch.no_grad():
            a2, logp2 = self.actor(o2)
            x2 = torch.cat([o2, a2], -1)
            q_t = torch.min(self.q1_t(x2), self.q2_t(x2)).squeeze(-1) - alpha * logp2
            y = r + self.gamma * (1 - d) * q_t
        x = torch.cat([o, a], -1)
        q_loss = F.mse_loss(self.q1(x).squeeze(-1), y) + F.mse_loss(self.q2(x).squeeze(-1), y)
        self.q_opt.zero_grad()
        q_loss.backward()
        self.q_opt.step()

        a_pi, logp = self.actor(o)
        xp = torch.cat([o, a_pi], -1)
        pi_loss = (alpha * logp - torch.min(self.q1(xp), self.q2(xp)).squeeze(-1)).mean()
        self.pi_opt.zero_grad()
        pi_loss.backward()
        self.pi_opt.step()

        a_loss = -(self.log_alpha * (logp.detach() + self.target_entropy)).mean()
        self.a_opt.zero_grad()
        a_loss.backward()
        self.a_opt.step()

        with torch.no_grad():
            for net, tgt in ((self.q1, self.q1_t), (self.q2, self.q2_t)):
                for p, pt in zip(net.parameters(), tgt.parameters()):
                    pt.mul_(1 - self.tau).add_(self.tau * p)
        return {"q_loss": q_loss.item(), "pi_loss": pi_loss.item(), "alpha": alpha.item()}

    def state_dict(self) -> dict:
        return {"actor": self.actor.state_dict(), "q1": self.q1.state_dict(), "q2": self.q2.state_dict(),
                "log_alpha": self.log_alpha.detach()}
