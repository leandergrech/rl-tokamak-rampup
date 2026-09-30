"""Log PI-controller rollouts as offline-RL datasets (in the wrapped env's action/observation space).

pi_det.npz          one episode of the deterministic PI controller (the environment is deterministic,
                    so more episodes would be identical copies)
pi_noisy_<s>.npz    N episodes of PI with Gaussian action noise s (Ip noise in units of the 0.2 MA/s
                    ramp limit, power noise in units of max power)
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np


def _collect(args):
    sigma, seed = args
    from rl_tokamak.env import EnvConfig, RampupEnv, set_single_thread

    set_single_thread()
    from rl_tokamak.controllers import PIController
    from rl_tokamak.evaluate import run_controller
    from rl_tokamak.stats import NoisyController

    env = RampupEnv(EnvConfig())
    ctrl = PIController() if sigma == 0 else NoisyController(PIController(), sigma, seed=seed)
    r = run_controller(env, ctrl, collect=True)
    return r["transitions"], r["benchmark_return"], r["failed"]


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default="data/offline")
    p.add_argument("--sigmas", type=float, nargs="*", default=[0.1, 0.3])
    p.add_argument("--episodes", type=int, default=20)
    p.add_argument("--workers", type=int, default=8)
    a = p.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    jobs = {"pi_det": [(0.0, 0)]}
    for s in a.sigmas:
        jobs[f"pi_noisy_{s}"] = [(s, 1000 * int(10 * s) + i) for i in range(a.episodes)]
    flat = [(name, j) for name, js in jobs.items() for j in js]
    with ProcessPoolExecutor(a.workers) as ex:
        results = list(ex.map(_collect, [j for _, j in flat]))
    summary = {}
    for name in jobs:
        rs = [r for (n, _), r in zip(flat, results) if n == name]
        data = {k: np.concatenate([r[0][k] for r in rs]) for k in rs[0][0]}
        np.savez_compressed(out / f"{name}.npz", **data)
        rets = [r[1] for r in rs]
        summary[name] = {"episodes": len(rs), "transitions": int(len(data["obs"])),
                         "behaviour_mean_return": float(np.mean(rets)), "behaviour_std_return": float(np.std(rets)),
                         "behaviour_max_return": float(np.max(rets)), "failures": int(sum(r[2] for r in rs))}
        print(name, summary[name], flush=True)
    (out / "datasets.json").write_text(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
