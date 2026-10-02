"""Re-tune the PI controller's gains on the physics environment (rl_tokamak.physics), grid then local refinement.

The controller keeps the paper's structure (rl_tokamak.controllers.PIController: I_p from the central current
density error against a target rising linearly from 0.6 MA/m^2 over 100 s, heating on a clock); k_p, k_i and the
target's end value (paper: 2.0 MA/m^2) are re-tuned.
Each candidate is one deterministic episode, scored by the physics environment's return.

    python scripts/tune_pi.py --workers 8 --out data/physics/results/pi_tuning.json
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time
from pathlib import Path

import numpy as np

_ENV = None
_PHYSICS: dict = {}


def _init(physics: dict) -> None:
    global _PHYSICS
    _PHYSICS = physics


def _score(args: tuple[float, float, float]) -> dict:
    global _ENV
    from rl_tokamak.controllers import PIController
    from rl_tokamak.env import EnvConfig, RampupEnv, set_single_thread
    from rl_tokamak.evaluate import run_controller

    if _ENV is None:
        set_single_thread()
        _ENV = RampupEnv(EnvConfig(normalize=False, extra={"physics": _PHYSICS}))
    kp, ki, j_end = args
    ep = run_controller(_ENV, PIController(kp=kp, ki=ki, j_end=j_end * 1e6))
    log = ep["log"]
    return {"kp": kp, "ki": ki, "j_end_MA_m2": j_end, "return": ep["benchmark_return"], "steps": len(log),
            "fail_reason": log[-1].get("fail_reason"), "Ip_final_MA": log[-1]["Ip_MA"]}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--out", default="data/physics/results/pi_tuning.json")
    p.add_argument("--physics", default="{}", help="PhysicsConfig overrides as JSON")
    a = p.parse_args()
    physics = json.loads(a.physics)
    t0 = time.time()
    # gains around the paper's (0.700, 34.257) and the end value of the j(0) target (paper: 2.0 MA/m^2)
    grid = [(kp, ki, j) for kp in (0.0, 0.3, 0.7, 1.5) for ki in (0.5, 1, 2, 8, 34.257)
            for j in (2.0, 2.5, 3.0, 3.5, 4.0, 4.5)]
    with mp.get_context("spawn").Pool(a.workers, initializer=_init, initargs=(physics,)) as pool:
        res = pool.map(_score, grid)
        best = max(res, key=lambda r: r["return"])
        kp0, ki0, j0 = best["kp"], best["ki"], best["j_end_MA_m2"]
        # local refinement around the best grid point
        fine = sorted({(round(max(kp0, 0.05) * f, 4) if f else 0.0, round(ki0 * g, 4), round(j0 + d, 3))
                       for f in (0, 0.5, 1, 2) for g in (0.6, 1, 1.6) for d in (-0.25, 0, 0.25)} - set(grid))
        res += pool.map(_score, fine)
    res.sort(key=lambda r: -r["return"])
    out = {"physics": physics, "best": res[0], "wall_min": (time.time() - t0) / 60, "candidates": res}
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(out, indent=1))
    for r in res[:8]:
        print(f"kp {r['kp']:<7g} ki {r['ki']:<8g} j_end {r['j_end_MA_m2']:<5g} return {r['return']:9.4f}  steps {r['steps']:3d}  I_p {r['Ip_final_MA']:.2f} MA  "
              f"{r['fail_reason'] or ''}")
    fails = {}
    for r in res:
        if r["fail_reason"]:
            key = r["fail_reason"].split(" ")[0]
            fails[key] = fails.get(key, 0) + 1
    print(f"{len(res)} candidates in {out['wall_min']:.1f} min; failures by limit: {fails}")


if __name__ == "__main__":
    main()
