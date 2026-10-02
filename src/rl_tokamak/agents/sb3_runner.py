"""PPO and SAC from Stable-Baselines3 on the wrapped environment, with a wall-clock budget.

Each worker process builds its own TORAX simulator (JAX compiles once per process,
about 40 s for Gym-TORAX 1.0). The callback stops training when the budget is spent,
records the benchmark return of every finished training episode, and periodically
evaluates the deterministic policy on a separate environment. The best checkpoint is
chosen by the score the run trains for: the audited return for ``reward_mode="patched"``,
the benchmark return otherwise.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field

import numpy as np
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv, VecNormalize

from ..env import EnvConfig, RampupEnv, make_env, set_single_thread
from ..evaluate import audited_return, run_policy


@dataclass
class SB3Config:
    algo: str = "ppo"
    n_envs: int = 12
    max_minutes: float = 50.0
    eval_every_minutes: float = 5.0
    seed: int = 0
    gamma: float = 0.995
    net_arch: tuple[int, ...] = (64, 64)
    norm_reward: bool = False  # VecNormalize the training reward (keeps PPO's value loss from swamping the clipped gradient)
    total_timesteps: int = 10**9  # simulator-step cap (the wall-clock budget usually ends training first)
    ppo: dict = field(default_factory=lambda: {"n_steps": 128, "batch_size": 256, "n_epochs": 10,
                                               "learning_rate": 3e-4, "gae_lambda": 0.95, "clip_range": 0.2,
                                               "ent_coef": 0.0, "log_std_init": -0.5})
    sac: dict = field(default_factory=lambda: {"buffer_size": 300_000, "learning_starts": 3_000,
                                               "batch_size": 256, "learning_rate": 3e-4, "train_freq": 1,
                                               "gradient_steps": -1, "tau": 0.005})


def _env_fn(cfg_dict: dict, seed: int):
    def _f():
        set_single_thread()
        env = make_env(EnvConfig(**cfg_dict))
        env.reset(seed=seed)
        return env

    return _f


class BudgetCallback(BaseCallback):
    def __init__(self, max_minutes: float, eval_every_minutes: float, eval_env: RampupEnv, log=print,
                 best_path=None, select: str = "benchmark_return"):
        super().__init__()
        self.select = select
        self.best_path = best_path
        self.max_s, self.eval_s = max_minutes * 60, eval_every_minutes * 60
        self.eval_env, self.log_fn = eval_env, log
        self.t0 = self.last_eval = time.time()
        self.train_episodes: list[dict] = []
        self.curve: list[dict] = []
        self.best = (-np.inf, None)

    def _evaluate(self) -> None:
        ev = run_policy(self.eval_env, lambda x: self.model.predict(x, deterministic=True)[0])
        row = {"env_steps": int(self.num_timesteps), "minutes": (time.time() - self.t0) / 60,
               "eval_return": ev["benchmark_return"], "eval_audited": ev["audited_return"], "eval_failed": ev["failed"],
               "train_episodes": len(self.train_episodes)}
        recent = [e["benchmark_return"] for e in self.train_episodes[-24:]]
        row["train_return_recent_mean"] = float(np.mean(recent)) if recent else float("nan")
        self.curve.append(row)
        self.log_fn(row)
        if ev[self.select] > self.best[0]:
            self.best = (ev[self.select], None)
            if self.best_path is not None:
                self.model.save(self.best_path)
        self.last_eval = time.time()

    def _on_step(self) -> bool:
        for info in self.locals.get("infos", []):
            if "benchmark_return" in info:
                self.train_episodes.append({"env_steps": int(self.num_timesteps), "benchmark_return": info["benchmark_return"],
                                            "audited_return": audited_return(info.get("episode_log", [])),
                                            "failed": info.get("failed", False)})
        if time.time() - self.last_eval > self.eval_s:
            self._evaluate()
        return time.time() - self.t0 < self.max_s


def train_sb3(env_cfg: EnvConfig, cfg: SB3Config, log=print, best_path=None) -> dict:
    cfg_dict = asdict(env_cfg)
    cfg_dict["log_dir"] = None
    fns = [_env_fn(cfg_dict, cfg.seed * 1000 + i) for i in range(cfg.n_envs)]
    venv = SubprocVecEnv(fns, start_method="spawn") if cfg.n_envs > 1 else DummyVecEnv(fns)
    if cfg.norm_reward:
        venv = VecNormalize(venv, norm_obs=False, norm_reward=True, gamma=cfg.gamma)
    eval_env = make_env(EnvConfig(**cfg_dict), evaluation=True)
    if cfg.algo == "ppo":
        kw = dict(cfg.ppo)
        log_std_init = kw.pop("log_std_init")
        model = PPO("MlpPolicy", venv, gamma=cfg.gamma, seed=cfg.seed, verbose=0,
                    policy_kwargs={"net_arch": list(cfg.net_arch), "log_std_init": log_std_init}, **kw)
    elif cfg.algo == "sac":
        model = SAC("MlpPolicy", venv, gamma=cfg.gamma, seed=cfg.seed, verbose=0,
                    policy_kwargs={"net_arch": list(cfg.net_arch)}, **cfg.sac)
    else:
        raise ValueError(cfg.algo)
    select = "audited_return" if env_cfg.reward_mode == "patched" else "benchmark_return"
    cb = BudgetCallback(cfg.max_minutes, cfg.eval_every_minutes, eval_env, log, best_path=best_path, select=select)
    model.learn(total_timesteps=cfg.total_timesteps, callback=cb)
    cb._evaluate()  # final deterministic evaluation
    venv.close()
    return {"model": model, "callback": cb, "eval_env": eval_env, "config": asdict(cfg)}
