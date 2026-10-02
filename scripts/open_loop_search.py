"""Estimate the open-loop optimum of the benchmark with a cross-entropy search (see rl_tokamak.agents.cem).

python scripts/open_loop_search.py --workers 8 --generations 12
Writes data/results/cem_open_loop.json and data/trajectories/cem_best.csv.
"""

import argparse
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--population", type=int, default=16)
    p.add_argument("--generations", type=int, default=12)
    p.add_argument("--minutes", type=float, default=50.0)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--objective", default="benchmark", choices=["benchmark", "audited"])
    p.add_argument("--out", default=None)
    p.add_argument("--physics", nargs="?", const="{}", default=None, metavar="JSON",
                   help="search the physics environment (rl_tokamak.physics); results go under data/physics/")
    a = p.parse_args()
    physics = None if a.physics is None else json.loads(a.physics)
    root = Path("data/physics") if physics is not None else Path("data")
    a.out = a.out or str(root / f"results/cem_open_loop{'' if a.objective == 'benchmark' else '_audited'}.json")
    from rl_tokamak.agents.cem import CEMConfig, ScheduleController, run_cem
    from rl_tokamak.env import EnvConfig, RampupEnv
    from rl_tokamak.evaluate import final_log_summary, run_controller, write_episode_csv

    res = run_cem(CEMConfig(population=a.population, generations=a.generations, workers=a.workers,
                            max_minutes=a.minutes, seed=a.seed, objective=a.objective, physics=physics),
                  log=lambda r: print(json.dumps(r), flush=True))
    env = RampupEnv(EnvConfig(extra={} if physics is None else {"physics": physics}))
    ep = run_controller(env, ScheduleController(res["best_params"]))
    (root / "trajectories").mkdir(parents=True, exist_ok=True)
    tag = "" if a.objective == "benchmark" else "_audited"
    write_episode_csv(ep["log"], str(root / f"trajectories/cem_best{tag}.csv"))
    res["best_rescored"] = ep["benchmark_return"]
    res.update(final_log_summary(ep["log"]))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(res, indent=2, default=float))
    print(json.dumps({k: v for k, v in res.items() if k != "curve"}, default=float))


if __name__ == "__main__":
    main()
