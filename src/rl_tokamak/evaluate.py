"""Episode runners and the benchmark score.

The benchmark score is the one reported in the Gym-TORAX paper: the undiscounted
(gamma = 1) sum of the environment's own reward over one episode, including the
-1000 failure reward. The ITER hybrid environment has a fixed initial state and
deterministic TORAX dynamics, so a deterministic policy has exactly one return;
stochastic policies (random, noisy PI) are averaged over seeds.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

import numpy as np

from .env import RampupEnv, make_env


def run_controller(env: RampupEnv, controller, collect: bool = False) -> dict[str, Any]:
    """Roll out a controller that speaks the raw Gym-TORAX dict interface."""
    controller.reset()
    env.reset()
    obs = env._last_obs
    ret, steps, done = 0.0, 0, False
    feats, acts, rews, bench = [env._features(obs)], [], [], []
    t0 = time.time()
    info: dict = {}
    while not done:
        ip_prev = env._ip
        action = controller.act(obs)
        a_vec = env.from_gymtorax_action(action, ip_prev)
        obs, r_train, term, trunc, info = env.step_gymtorax(action)
        done = term or trunc
        ret += info["benchmark_reward"]
        steps += 1
        if collect:
            acts.append(a_vec)
            rews.append(r_train)
            bench.append(info["benchmark_reward"])
            feats.append(env._features(obs))
    out = {
        "benchmark_return": ret,
        "failed": bool(info.get("failed", False)),
        "steps": steps,
        "wall_s": time.time() - t0,
        "log": info.get("episode_log", []),
    }
    if collect:
        out["transitions"] = {
            "obs": np.array(feats[:-1], dtype=np.float32),
            "next_obs": np.array(feats[1:], dtype=np.float32),
            "action": np.array(acts, dtype=np.float32),
            "reward": np.array(rews, dtype=np.float32),
            "benchmark_reward": np.array(bench, dtype=np.float32),
            "done": np.array([0.0] * (steps - 1) + [1.0], dtype=np.float32),
        }
    return out


def run_policy(env: RampupEnv, policy: Callable[[np.ndarray], np.ndarray]) -> dict[str, Any]:
    """Roll out a policy on the flat vector interface (RL agents)."""
    x, _ = env.reset()
    ret, steps, done = 0.0, 0, False
    t0 = time.time()
    info: dict = {}
    while not done:
        x, _, term, trunc, info = env.step(policy(x))
        done = term or trunc
        ret += info["benchmark_reward"]
        steps += 1
    log = info.get("episode_log", [])
    return {
        "benchmark_return": ret,
        "audited_return": audited_return(log),
        "failed": bool(info.get("failed", False)),
        "steps": steps,
        "wall_s": time.time() - t0,
        "log": log,
    }


def summarise(name: str, episodes: list[dict[str, Any]], **extra) -> dict[str, Any]:
    rets = np.array([e["benchmark_return"] for e in episodes])
    return {
        "policy": name,
        "n_episodes": len(episodes),
        "mean_return": float(rets.mean()),
        "std_return": float(rets.std()),
        "min_return": float(rets.min()),
        "max_return": float(rets.max()),
        "failure_rate": float(np.mean([e["failed"] for e in episodes])),
        "returns": [float(r) for r in rets],
        **extra,
    }


def save_json(obj: Any, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, default=float))


def audited_return(log: list[dict[str, float]]) -> float:
    """Episode return under the audited reward (Q capped at 10, H-mode gate needs P_SOL >= P_LH); failure = -1000."""
    from .env import FAILURE_REWARD, audited_components

    total = 0.0
    for r in log:
        if "q_min" not in r or r["q_min"] != r["q_min"]:  # missing or NaN: the failure step
            total += FAILURE_REWARD
            continue
        total += sum(audited_components(r["Q_fusion"], r["H98"], r["q_min"], r["q95"], r["T_e0"], r["T_i0"],
                                        r["P_SOL_total"], r["P_LH"]).values())
    return float(total)


def final_log_summary(log: list[dict[str, float]]) -> dict[str, float]:
    """Physics numbers worth reporting next to the score (end of episode and extremes)."""
    ok = [r for r in log if "q_min" in r]
    if not ok:
        return {}
    last = ok[-1]
    return {
        "audited_return": audited_return(log),
        "t_fGW_above_1_s": float(sum(1 for r in ok if r["fgw_n_e_line_avg"] > 1.0)),
        "Q_max": max(r["Q_fusion"] for r in ok),
        "P_aux_flattop_MW": float(np.mean([r["P_NBI_MW"] + r["P_ECRH_MW"] for r in log if r["t"] > 110] or [np.nan])),
        "Ip_final_MA": last["Ip_MA"],
        "Q_final": last["Q_fusion"],
        "H98_final": last["H98"],
        "q_min_final": last["q_min"],
        "q95_final": last["q95"],
        "fGW_max": max(r["fgw_n_e_line_avg"] for r in ok),
        "q_min_lowest": min(r["q_min"] for r in ok),
        "t_q_min_below_1_s": float(sum(1 for r in ok if r["q_min"] < 1.0)),
        "first_hmode_proxy_s": next((r["t"] for r in ok if r["T_e0"] > 10 and r["T_i0"] > 10), float("nan")),
        "E_aux_GJ": float(sum(r["P_NBI_MW"] + r["P_ECRH_MW"] for r in log) / 1e3),
    }


def write_episode_csv(log: list[dict[str, float]], path: str | Path) -> None:
    import csv

    if not log:
        return
    keys = sorted({k for row in log for k in row})
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(log)


def evaluate_run(run_dir: str | Path, env: RampupEnv | None = None, which: str = "final") -> dict[str, Any]:
    """Reload a stored policy (final or best-during-training) and score one deterministic episode on the benchmark.

    The episode goes to ``final_episode.csv`` or ``best_episode.csv`` in the run directory."""
    from dataclasses import asdict

    from .policies import load_policy

    run_dir = Path(run_dir)
    env_cfg, pi = load_policy(run_dir, which)
    if env is None or asdict(env.cfg) | {"log_dir": None} != asdict(env_cfg) | {"log_dir": None}:
        env = make_env(env_cfg)
    ep = run_policy(env, pi)
    write_episode_csv(ep["log"], run_dir / f"{which}_episode.csv")
    meta = json.loads((run_dir / "config.json").read_text())
    return {
        "run": run_dir.name,
        "checkpoint": which,
        "algo": meta["algo"],
        "seed": meta["seed"],
        "benchmark_return": ep["benchmark_return"],
        "failed": ep["failed"],
        "env_steps_used": meta.get("env_steps"),
        "train_minutes": meta.get("train_minutes"),
        **final_log_summary(ep["log"]),
    }
