"""Save and reload trained policies so evaluation never needs the training code path."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import numpy as np
import torch

from .env import EnvConfig


def save_torch_actor(path: Path, kind: str, actor: torch.nn.Module, obs_dim: int, act_dim: int, hidden, **extra) -> None:
    torch.save({"kind": kind, "state_dict": actor.state_dict(), "obs_dim": obs_dim, "act_dim": act_dim,
                "hidden": list(hidden), **extra}, path)


def load_policy(run_dir: str | Path) -> tuple[EnvConfig, Callable[[np.ndarray], np.ndarray]]:
    run_dir = Path(run_dir)
    meta = json.loads((run_dir / "config.json").read_text())
    env_cfg = EnvConfig(**{**meta["env_config"], "log_dir": None})
    if (run_dir / "policy.zip").exists():
        from stable_baselines3 import PPO, SAC

        cls = {"ppo": PPO, "sac": SAC}[meta["algo"]]
        model = cls.load(run_dir / "policy.zip", device="cpu")
        return env_cfg, lambda x: model.predict(x, deterministic=True)[0]
    ckpt = torch.load(run_dir / "policy.pt", map_location="cpu", weights_only=False)
    from .agents.sac_core import Actor, mlp

    if ckpt["kind"] == "sac_actor":
        actor = Actor(ckpt["obs_dim"], ckpt["act_dim"], tuple(ckpt["hidden"]))
        actor.load_state_dict(ckpt["state_dict"])

        def pi(x):
            with torch.no_grad():
                return actor(torch.as_tensor(x, dtype=torch.float32).unsqueeze(0), True)[0].squeeze(0).numpy()

        return env_cfg, pi
    if ckpt["kind"] == "td3bc_actor":
        actor = torch.nn.Sequential(mlp(ckpt["obs_dim"], ckpt["act_dim"], tuple(ckpt["hidden"])), torch.nn.Tanh())
        actor.load_state_dict(ckpt["state_dict"])
        mu, sd = np.asarray(ckpt["mu"]), np.asarray(ckpt["sd"])

        def pi(x):
            with torch.no_grad():
                return actor(torch.as_tensor((x - mu) / sd, dtype=torch.float32).unsqueeze(0)).squeeze(0).numpy()

        return env_cfg, pi
    raise ValueError(ckpt["kind"])
