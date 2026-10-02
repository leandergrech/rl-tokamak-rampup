"""Save and reload trained policies so evaluation never needs the training code path."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import numpy as np
import torch

from .checkpoints import ensure as ensure_checkpoint
from .env import EnvConfig


def save_torch_actor(path: Path, kind: str, actor: torch.nn.Module, obs_dim: int, act_dim: int, hidden, **extra) -> None:
    torch.save({"kind": kind, "state_dict": actor.state_dict(), "obs_dim": obs_dim, "act_dim": act_dim,
                "hidden": list(hidden), **extra}, path)


def compact_sb3(zip_path: str | Path, algo: str, out_path: str | Path) -> None:
    """Store only what deterministic evaluation needs from an SB3 checkpoint (SAC: the actor; PPO: the policy)."""
    from stable_baselines3 import PPO, SAC

    model = {"ppo": PPO, "sac": SAC}[algo].load(zip_path, device="cpu")
    sd = model.policy.state_dict()
    if algo == "sac":
        sd = {k: v for k, v in sd.items() if k.startswith("actor.")}
    torch.save({"kind": "sb3_policy", "algo": algo, "state_dict": sd,
                "net_arch": model.policy_kwargs.get("net_arch"),
                "log_std_init": model.policy_kwargs.get("log_std_init"),
                "obs_dim": int(model.observation_space.shape[0]), "act_dim": int(model.action_space.shape[0])},
               out_path)


def _load_sb3_policy(ckpt: dict):
    import gymnasium as gym

    obs_space = gym.spaces.Box(-np.inf, np.inf, (ckpt["obs_dim"],), np.float32)
    act_space = gym.spaces.Box(-1.0, 1.0, (ckpt["act_dim"],), np.float32)
    if ckpt["algo"] == "sac":
        from stable_baselines3.sac.policies import SACPolicy

        policy = SACPolicy(obs_space, act_space, lambda _: 0.0, net_arch=ckpt["net_arch"])
    else:
        from stable_baselines3.common.policies import ActorCriticPolicy

        kw = {"log_std_init": ckpt["log_std_init"]} if ckpt.get("log_std_init") is not None else {}
        policy = ActorCriticPolicy(obs_space, act_space, lambda _: 0.0, net_arch=ckpt["net_arch"], **kw)
    policy.load_state_dict(ckpt["state_dict"], strict=False)
    policy.set_training_mode(False)
    return lambda x: policy.predict(x, deterministic=True)[0]


def load_policy(run_dir: str | Path, which: str = "final") -> tuple[EnvConfig, Callable[[np.ndarray], np.ndarray]]:
    """Load the final (``policy.*``) or best-during-training (``policy_best.*``) policy of a run."""
    run_dir = Path(run_dir)
    stem = "policy" if which == "final" else "policy_best"
    meta = json.loads((run_dir / "config.json").read_text())
    env_cfg = EnvConfig(**{**meta["env_config"], "log_dir": None})
    ensure_checkpoint(run_dir / f"{stem}.pt")  # released policies are downloaded on first use
    if not (run_dir / f"{stem}.pt").exists() and (run_dir / f"{stem}.zip").exists():
        from stable_baselines3 import PPO, SAC

        cls = {"ppo": PPO, "sac": SAC}[meta["algo"]]
        model = cls.load(run_dir / f"{stem}.zip", device="cpu")
        return env_cfg, lambda x: model.predict(x, deterministic=True)[0]
    ckpt = torch.load(run_dir / f"{stem}.pt", map_location="cpu", weights_only=False)
    if ckpt["kind"] == "sb3_policy":
        return env_cfg, _load_sb3_policy(ckpt)
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
