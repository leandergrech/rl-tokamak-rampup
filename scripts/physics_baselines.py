"""Classical baselines on the physics environment (rl_tokamak.physics; gymtorax 1.1.1 / TORAX 1.4.3).

Open-loop reference, the PI controller with the paper's gains and re-tuned (scripts/tune_pi.py), the
heating cut that exploits IterHybrid-v0, no heating at all, and the random policy over 20 seeds.

    python scripts/physics_baselines.py --workers 8
Writes data/physics/results/classical.json and data/physics/trajectories/{open_loop,pi,heating_cut}.csv.
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time
from pathlib import Path

import numpy as np

ROOT = Path("data/physics")


def _env():
    from rl_tokamak.env import EnvConfig, RampupEnv, set_single_thread

    set_single_thread()
    return RampupEnv(EnvConfig(normalize=False, extra={"physics": {}}))


def _controller(name: str, seed: int = 0):
    from rl_tokamak.controllers import PAPER_KI, PAPER_KP, OpenLoopController, PIController, RandomController
    from rl_tokamak.physics import PHYSICS_PI

    class HeatingCut(OpenLoopController):
        """Open-loop reference with NBI and ECRH off from step `cut` (the IterHybrid-v0 exploit)."""

        def __init__(self, cut: int):
            self.cut = cut
            super().__init__()

        def act(self, obs):
            k = self.step_idx
            a = super().act(obs)
            if k >= self.cut:
                a["NBI"][0], a["ECRH"][0] = 0.0, 0.0
            return a

    if name == "open_loop":
        return OpenLoopController()
    if name == "pi":
        return PIController(**PHYSICS_PI)
    if name == "pi_paper_gains":
        return PIController(kp=PAPER_KP, ki=PAPER_KI)
    if name == "heating_cut":
        return HeatingCut(105)
    if name == "unheated":
        return HeatingCut(0)
    if name == "random":
        return None  # built against the env's action space in _run
    raise ValueError(name)


def _run(job: tuple[str, int]) -> dict:
    from rl_tokamak.controllers import RandomController
    from rl_tokamak.evaluate import final_log_summary, run_controller

    name, seed = job
    env = _env()
    c = RandomController(env.inner.action_space, seed=seed) if name == "random" else _controller(name)
    t0 = time.time()
    ep = run_controller(env, c)
    log = ep["log"]
    out = {"policy": name, "seed": seed, "return": ep["benchmark_return"], "failed": ep["failed"], "steps": len(log),
           "fail_reason": log[-1].get("fail_reason") if ep["failed"] else None, "wall_s": time.time() - t0,
           "h_mode_s": int(sum(r.get("confinement_mode") == 1 for r in log)),
           "h_mode_paid_s": int(sum(r.get("p_h98", 0) > 0 for r in log)),
           "first_h_mode_t": next((r["t"] for r in log if r.get("confinement_mode") in (1, 2)), None),
           **final_log_summary(log)}
    if name != "random":
        out["log"] = log
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--n-random", type=int, default=20)
    a = p.parse_args()
    from rl_tokamak.evaluate import write_episode_csv
    from rl_tokamak.physics import PHYSICS_PI, PhysicsConfig

    jobs = [(n, 0) for n in ("open_loop", "pi", "pi_paper_gains", "heating_cut", "unheated")]
    jobs += [("random", s) for s in range(a.n_random)]
    t0 = time.time()
    with mp.get_context("spawn").Pool(a.workers) as pool:
        res = pool.map(_run, jobs)
    (ROOT / "trajectories").mkdir(parents=True, exist_ok=True)
    out: dict = {"physics_config": PhysicsConfig().to_dict(), "pi_gains": PHYSICS_PI}
    for r in res:
        if r["policy"] == "random":
            continue
        log = r.pop("log")
        if r["policy"] in ("open_loop", "pi", "heating_cut"):
            write_episode_csv(log, str(ROOT / f"trajectories/{r['policy']}.csv"))
        out[r["policy"]] = r
    rnd = [r for r in res if r["policy"] == "random"]
    rets = np.array([r["return"] for r in rnd])
    ok = rets[[not r["failed"] for r in rnd]]
    reasons: dict[str, int] = {}
    for r in rnd:
        if r["failed"]:
            key = (r["fail_reason"] or "solver").split(" ")[0]
            reasons[key] = reasons.get(key, 0) + 1
    out["random"] = {"n": len(rnd), "mean": float(rets.mean()), "std": float(rets.std(ddof=1)) if len(rets) > 1 else 0.0,
                     "failures": int(sum(r["failed"] for r in rnd)), "failure_reasons": reasons,
                     "mean_of_completed": float(ok.mean()) if len(ok) else None, "returns": rets.tolist(),
                     "steps": [r["steps"] for r in rnd]}
    out["wall_min"] = (time.time() - t0) / 60
    (ROOT / "results").mkdir(parents=True, exist_ok=True)
    (ROOT / "results/classical.json").write_text(json.dumps(out, indent=1, default=float))
    for k in ("open_loop", "pi", "pi_paper_gains", "heating_cut", "unheated"):
        r = out[k]
        print(f"{k:15s} return {r['return']:9.4f}  steps {r['steps']:3d}  H-mode paid {r['h_mode_paid_s']:3d} s  "
              f"first H {r['first_h_mode_t']}  {r['fail_reason'] or ''}")
    rr = out["random"]
    print(f"random x{rr['n']}: {rr['mean']:.2f} +- {rr['std']:.2f}, {rr['failures']} failed {rr['failure_reasons']}")


if __name__ == "__main__":
    main()
