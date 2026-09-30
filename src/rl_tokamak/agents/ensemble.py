"""Probabilistic ensemble dynamics model (PETS / MBPO style), sized for a laptop CPU.

Each member maps (s, a) -> Gaussian over (s' - s, r). Members are trained on
bootstrap resamples with a Gaussian negative log-likelihood and learned
log-variance bounds; 10 % of the data is held out for early stopping.
"""

from __future__ import annotations

import time

import numpy as np
import torch
import torch.nn as nn


class EnsembleLinear(nn.Module):
    def __init__(self, n: int, inp: int, out: int):
        super().__init__()
        self.w = nn.Parameter(torch.randn(n, inp, out) * (1.0 / np.sqrt(inp)))
        self.b = nn.Parameter(torch.zeros(n, 1, out))

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # x: (n, batch, inp)
        return torch.baddbmm(self.b, x, self.w)


class Ensemble(nn.Module):
    def __init__(self, obs_dim: int, act_dim: int, n_members: int = 5, hidden: int = 200, n_layers: int = 3,
                 seed: int = 0):
        super().__init__()
        torch.manual_seed(seed)
        self.obs_dim, self.act_dim, self.n = obs_dim, act_dim, n_members
        self.out_dim = obs_dim + 1
        dims = [obs_dim + act_dim] + [hidden] * n_layers
        self.layers = nn.ModuleList(EnsembleLinear(n_members, a, b) for a, b in zip(dims[:-1], dims[1:]))
        self.head = EnsembleLinear(n_members, hidden, 2 * self.out_dim)
        self.max_logvar = nn.Parameter(torch.full((1, 1, self.out_dim), 0.5))
        self.min_logvar = nn.Parameter(torch.full((1, 1, self.out_dim), -10.0))
        self.register_buffer("in_mu", torch.zeros(obs_dim + act_dim))
        self.register_buffer("in_sd", torch.ones(obs_dim + act_dim))
        self.register_buffer("out_mu", torch.zeros(self.out_dim))
        self.register_buffer("out_sd", torch.ones(self.out_dim))
        self.act = nn.SiLU()

    def _raw(self, x: torch.Tensor):
        h = (x - self.in_mu) / self.in_sd
        for layer in self.layers:
            h = self.act(layer(h))
        mu, logvar = self.head(h).chunk(2, dim=-1)
        logvar = self.max_logvar - nn.functional.softplus(self.max_logvar - logvar)
        logvar = self.min_logvar + nn.functional.softplus(logvar - self.min_logvar)
        return mu, logvar

    def fit(self, o, a, r, o2, epochs: int = 200, batch: int = 256, lr: float = 1e-3, patience: int = 8,
            max_seconds: float = 120.0, rng: np.random.Generator | None = None) -> dict[str, float]:
        rng = rng or np.random.default_rng(0)
        x = np.concatenate([o, a], -1).astype(np.float32)
        y = np.concatenate([o2 - o, r[:, None]], -1).astype(np.float32)
        self.in_mu.copy_(torch.as_tensor(x.mean(0)))
        self.in_sd.copy_(torch.as_tensor(x.std(0) + 1e-6))
        self.out_mu.copy_(torch.as_tensor(y.mean(0)))
        self.out_sd.copy_(torch.as_tensor(y.std(0) + 1e-6))
        yn = (y - self.out_mu.numpy()) / self.out_sd.numpy()
        perm = rng.permutation(len(x))
        n_hold = max(1, int(0.1 * len(x)))
        hold, train = perm[:n_hold], perm[n_hold:]
        xh, yh = torch.as_tensor(x[hold]), torch.as_tensor(yn[hold])
        opt = torch.optim.Adam(self.parameters(), lr=lr, weight_decay=1e-5)
        best, best_state, bad, t0 = np.inf, None, 0, time.time()
        boot = [train[rng.integers(0, len(train), len(train))] for _ in range(self.n)]
        for ep in range(epochs):
            for b in range(0, len(train), batch):
                idx = np.stack([bi[b:b + batch] for bi in boot])  # (n, batch)
                xb = torch.as_tensor(x[idx])
                yb = torch.as_tensor(yn[idx])
                mu, logvar = self._raw(xb)
                nll = (((mu - yb) ** 2) * torch.exp(-logvar) + logvar).mean()
                loss = nll + 0.01 * (self.max_logvar.sum() - self.min_logvar.sum())
                opt.zero_grad()
                loss.backward()
                opt.step()
            with torch.no_grad():
                mu, _ = self._raw(xh.unsqueeze(0).expand(self.n, -1, -1))
                mse = ((mu - yh) ** 2).mean().item()
            if mse < best - 1e-4:
                best, bad = mse, 0
                best_state = {k: v.clone() for k, v in self.state_dict().items()}
            else:
                bad += 1
            if bad >= patience or time.time() - t0 > max_seconds:
                break
        if best_state is not None:
            self.load_state_dict(best_state)
        return {"holdout_mse_norm": float(best), "epochs": ep + 1, "n_train": int(len(train))}

    @torch.no_grad()
    def predict(self, o: np.ndarray, a: np.ndarray, rng: np.random.Generator, sample: bool = True):
        """Return next obs, reward, and the MOPO uncertainty max_i ||sigma_i|| for a batch."""
        x = torch.as_tensor(np.concatenate([o, a], -1), dtype=torch.float32)
        mu, logvar = self._raw(x.unsqueeze(0).expand(self.n, -1, -1))
        mu = mu * self.out_sd + self.out_mu
        std = torch.exp(0.5 * logvar) * self.out_sd
        member = torch.as_tensor(rng.integers(0, self.n, size=x.shape[0]))
        ar = torch.arange(x.shape[0])
        m, s = mu[member, ar], std[member, ar]
        y = m + s * torch.randn_like(s) if sample else m
        unc = torch.linalg.norm(std, dim=-1).max(0).values
        y = y.numpy()
        return o + y[:, :-1], y[:, -1], unc.numpy()
