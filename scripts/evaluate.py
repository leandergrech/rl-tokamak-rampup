"""Score policies on the Gym-TORAX benchmark (undiscounted episode return, gamma = 1).

python scripts/evaluate.py --classical            # PI, open-loop, Gym-TORAX's own PIDAgent, random (N seeds)
python scripts/evaluate.py --runs data/runs/*     # re-evaluate stored RL checkpoints
python scripts/evaluate.py --summary              # collect everything into data/results/summary.{json,md}

Outputs go to data/results/ and per-episode trajectories to data/trajectories/.
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

RESULTS = Path("data/results")
TRAJ = Path("data/trajectories")
PAPER = {"pi": 3.79, "open_loop": 3.40, "random": -10.79}


def _random_episode(seed: int) -> dict:
    from rl_tokamak.env import EnvConfig, RampupEnv, set_single_thread

    set_single_thread()
    from rl_tokamak.controllers import RandomController
    from rl_tokamak.evaluate import run_controller

    env = RampupEnv(EnvConfig())
    r = run_controller(env, RandomController(env.inner.action_space, seed=seed))
    return {"seed": seed, "benchmark_return": r["benchmark_return"], "failed": r["failed"], "steps": r["steps"]}


def classical(n_random: int, workers: int) -> dict:
    from rl_tokamak.controllers import OpenLoopController, PIController
    from rl_tokamak.env import EnvConfig, RampupEnv
    from rl_tokamak.evaluate import final_log_summary, run_controller, write_episode_csv

    TRAJ.mkdir(parents=True, exist_ok=True)
    env = RampupEnv(EnvConfig())
    out = {}
    for name, ctrl in [("pi", PIController()), ("open_loop", OpenLoopController())]:
        r = run_controller(env, ctrl)
        write_episode_csv(r["log"], TRAJ / f"{name}.csv")
        comps = {k: float(sum(row.get(k, 0.0) for row in r["log"])) for k in ("r_fusion_gain", "r_h98", "r_q_min", "r_q95")}
        out[name] = {"benchmark_return": r["benchmark_return"], "failed": r["failed"], "steps": r["steps"],
                     "paper": PAPER[name], "reward_components": comps, **final_log_summary(r["log"])}
        print(name, json.dumps(out[name], default=float), flush=True)

    # Cross-check against the PIDAgent shipped inside Gym-TORAX (same gains as the paper).
    from gymtorax import PIDAgent

    from rl_tokamak.controllers import PAPER_KI, PAPER_KP, j_target

    agent = PIDAgent(env.inner.action_space, j_target, 0.2e6, kp=PAPER_KP, ki=PAPER_KI, kd=0.0)
    obs, _ = env.inner.reset()
    ret, done = 0.0, False
    while not done:
        obs, r, term, trunc, _ = env.inner.step(agent.act(obs))
        ret += r
        done = term or trunc
    out["pi_gymtorax_agent"] = {"benchmark_return": ret, "paper": PAPER["pi"]}
    print("pi_gymtorax_agent", ret, flush=True)

    with ProcessPoolExecutor(workers, mp_context=mp.get_context("spawn")) as ex:
        eps = list(ex.map(_random_episode, range(n_random)))
    rets = np.array([e["benchmark_return"] for e in eps])
    out["random"] = {"n_episodes": n_random, "mean_return": float(rets.mean()), "std_return": float(rets.std()),
                     "median_return": float(np.median(rets)), "min_return": float(rets.min()),
                     "max_return": float(rets.max()), "failure_rate": float(np.mean([e["failed"] for e in eps])),
                     "paper": PAPER["random"], "episodes": eps}
    print("random", {k: v for k, v in out["random"].items() if k != "episodes"}, flush=True)
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "classical.json").write_text(json.dumps(out, indent=2, default=float))
    return out


def runs(paths: list[str], tol: float = 1e-6) -> None:
    """Re-evaluate stored checkpoints and check they reproduce their stored result.json (the env is deterministic)."""
    from rl_tokamak.evaluate import evaluate_run

    mismatches = []
    for p in paths:
        p = Path(p)
        if not (p / "config.json").exists() or not (p / "result.json").exists():
            continue
        stored = json.loads((p / "result.json").read_text())["benchmark_return"]
        res = evaluate_run(p)
        ok = abs(res["benchmark_return"] - stored) <= tol * max(1.0, abs(stored))
        print(f"{p.name}: stored {stored:.6f}  re-evaluated {res['benchmark_return']:.6f}  {'OK' if ok else 'MISMATCH'}",
              flush=True)
        if not ok:
            mismatches.append(p.name)
    if mismatches:
        raise SystemExit(f"re-evaluation mismatch: {mismatches}")


LABELS = {
    "ppo": "PPO (SB3)", "sac": "SAC (SB3)", "mbpo": "MBPO (ensemble + SAC)",
    "bc": "Behaviour cloning", "td3bc": "TD3+BC", "mopo": "MOPO",
}


def _audited_csv(f: Path):
    import pandas as pd

    from rl_tokamak.evaluate import audited_return

    return audited_return(pd.read_csv(f).to_dict("records")) if f.exists() else None


def _audited(run_dir: Path):
    """Audited score of a run's final evaluation episode (recomputed from final_episode.csv)."""
    import pandas as pd

    from rl_tokamak.evaluate import audited_return

    f = run_dir / "final_episode.csv"
    return audited_return(pd.read_csv(f).to_dict("records")) if f.exists() else None


def summary() -> None:
    rows = []
    cl = json.loads((RESULTS / "classical.json").read_text()) if (RESULTS / "classical.json").exists() else {}
    for key, label in [("pi", "PI controller (paper gains)"), ("open_loop", "Open-loop reference")]:
        if key in cl:
            rows.append({"policy": label, "group": "classical", "return": cl[key]["benchmark_return"],
                         "paper": PAPER[key], "env_steps": None, "minutes": None, "failed": cl[key]["failed"],
                         "q_min_final": cl[key].get("q_min_final"), "fGW_max": cl[key].get("fGW_max"),
                         "Q_final": cl[key].get("Q_final"), "Ip_final_MA": cl[key].get("Ip_final_MA"),
                         "t_q_min_below_1_s": cl[key].get("t_q_min_below_1_s"),
                         "audited": _audited_csv(TRAJ / f"{key}.csv")})
    if "random" in cl:
        r = cl["random"]
        rows.append({"policy": f"Random (mean of {r['n_episodes']})", "group": "classical", "return": r["mean_return"],
                     "return_std": r["std_return"], "paper": PAPER["random"], "env_steps": None, "minutes": None,
                     "failed": r["failure_rate"]})
    for res_path in sorted(Path("data/runs").glob("*/result.json")):
        res = json.loads(res_path.read_text())
        cfg = json.loads((res_path.parent / "config.json").read_text())
        offline = cfg["algo"] in ("bc", "td3bc", "mopo")
        group = "offline" if offline else "online"
        tag = f" on {Path(cfg['dataset']).stem}" if cfg.get("dataset") else ""
        ec = cfg["env_config"]
        variant = []
        if ec["obs_set"] != "profiles":
            variant.append(f"obs={ec['obs_set']}")
        if ec["reward_mode"] != "scaled":
            variant.append(f"reward={ec['reward_mode']}")
        if ec["ip_mode"] != "delta":
            variant.append(f"ip={ec['ip_mode']}")
        if not offline and abs(ec.get("ip_min", 3e6) - 3e6) > 1:
            variant.append(f"I_p floor {ec['ip_min'] / 1e6:.0f} MA")
        if variant:
            group = "ablation"
            tag += " [" + ", ".join(variant) + "]"
        best, beat_pi = None, None
        curve_path = res_path.parent / "curve.json"
        if curve_path.exists():
            ev = [r for r in json.loads(curve_path.read_text())["eval"] if "eval_return" in r]
            if ev:
                best = max(r["eval_return"] for r in ev)
                xk = "env_steps" if "env_steps" in ev[0] else "real_steps" if "real_steps" in ev[0] else None
                if xk:
                    pi_ret = cl["pi"]["benchmark_return"] if "pi" in cl else PAPER["pi"]
                    beat_pi = next((r[xk] for r in ev if r["eval_return"] > pi_ret), None)
        rows.append({"policy": LABELS.get(cfg["algo"], cfg["algo"]) + tag + f" (seed {cfg['seed']})", "group": group,
                     "run": res_path.parent.name, "return": res["benchmark_return"], "paper": None,
                     "best_during_training": best, "steps_to_beat_pi": beat_pi,
                     "env_steps": cfg.get("env_steps"), "dataset_transitions": cfg.get("dataset_transitions"),
                     "minutes": res.get("total_minutes", cfg.get("train_minutes")),
                     "failed": res["failed"], "q_min_final": res.get("q_min_final"), "fGW_max": res.get("fGW_max"),
                     "Q_final": res.get("Q_final"), "Ip_final_MA": res.get("Ip_final_MA"),
                     "t_q_min_below_1_s": res.get("t_q_min_below_1_s"), "audited": _audited(res_path.parent),
                     "first_hmode_proxy_s": res.get("first_hmode_proxy_s")})
    for tag, label in (("", "benchmark"), ("_audited", "audited score")):
        cem = RESULTS / f"cem_open_loop{tag}.json"
        if cem.exists():
            c = json.loads(cem.read_text())
            rows.append({"policy": f"CEM open-loop schedule search, objective: {label}", "group": "reference",
                         "return": c["best_rescored"], "paper": None, "env_steps": c["episodes"] * 151,
                         "minutes": c["minutes"], "failed": False, "q_min_final": c.get("q_min_final"),
                         "fGW_max": c.get("fGW_max"), "Q_final": c.get("Q_final"), "Ip_final_MA": c.get("Ip_final_MA"),
                         "t_q_min_below_1_s": c.get("t_q_min_below_1_s"),
                         "audited": _audited_csv(TRAJ / f"cem_best{tag}.csv")})
    (RESULTS / "summary.json").write_text(json.dumps(rows, indent=2, default=float))

    def f(x, nd=2):
        return "" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{nd}f}"

    def n(x):
        return "" if x is None else f"{int(x):,}"

    lines = ["| Policy | Group | Return (final policy) | Audited score | Best during training | Sim. steps to beat PI "
             "| Sim. steps used | Wall time (min) | I_p end (MA) | q_min end | s with q_min<1 | max f_GW | Q end |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        ret = f(r["return"]) + (f" ± {f(r['return_std'])}" if "return_std" in r else "")
        if r.get("paper") is not None:
            ret += f" (paper {f(r['paper'])})"
        used = n(r.get("env_steps")) if not r.get("dataset_transitions") else f"0 online, {n(r['dataset_transitions'])} logged"
        lines.append(f"| {r['policy']} | {r['group']} | {ret} | {f(r.get('audited'))} | {f(r.get('best_during_training'))} | "
                     f"{n(r.get('steps_to_beat_pi'))} | {used} | {f(r['minutes'], 1)} | {f(r.get('Ip_final_MA'), 1)} | "
                     f"{f(r.get('q_min_final'))} | {n(r.get('t_q_min_below_1_s'))} | {f(r.get('fGW_max'))} | "
                     f"{f(r.get('Q_final'), 1)} |")
    (RESULTS / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--classical", action="store_true")
    p.add_argument("--n-random", type=int, default=20)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--runs", nargs="*", default=None)
    p.add_argument("--summary", action="store_true")
    a = p.parse_args(argv)
    if a.classical:
        classical(a.n_random, a.workers)
    if a.runs:
        runs(a.runs)
    if a.summary:
        summary()


if __name__ == "__main__":
    main()
