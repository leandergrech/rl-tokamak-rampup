"""Results table of the physics environment (rl_tokamak.physics): classical baselines, CEM and every run.

Reads data/physics/results/{classical,cem_open_loop}.json and data/physics/runs/*/{result,best_result,curve,config}.json
(no simulation). Writes data/physics/results/summary.json and summary.md.

    python scripts/physics_summary.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path("data/physics")
PI_RETURN = None  # set from classical.json


def _first_above(curve: dict, bar: float) -> int | None:
    for row in curve.get("eval", []):
        if "eval_return" in row and row["eval_return"] > bar:
            return int(row.get("env_steps", row.get("real_steps", 0)))
    return None


def _best(curve: dict) -> float | None:
    vals = [row["eval_return"] for row in curve.get("eval", []) if "eval_return" in row]
    return max(vals) if vals else None


def _group(cfg: dict) -> str:
    extra = cfg["env_config"]["extra"]
    g = cfg["algo"].upper() + (" on PI" if extra.get("residual") else "")
    if extra.get("physics", {}).get("randomize"):
        g += ", randomised training"
    steps = cfg["args"].get("total_steps")
    return g + (f", {steps:,} steps" if steps else "")


def main() -> None:
    classical = json.loads((ROOT / "results/classical.json").read_text())
    pi = classical["pi"]["return"]
    rows = []
    for key, label in (("pi", "PI controller, re-tuned"), ("open_loop", "Open-loop reference"),
                       ("pi_paper_gains", "PI controller, paper's gains"), ("heating_cut", "Open loop, heating off from 105 s"),
                       ("unheated", "Open loop, no heating")):
        r = classical[key]
        rows.append({"policy": label, "group": "classical", "return": r["return"], "failed": r["failed"],
                     "fail_reason": r["fail_reason"], "h_mode_paid_s": r["h_mode_paid_s"], "Q_final": r.get("Q_final"),
                     "q_min_lowest": r.get("q_min_lowest"), "fGW_max": r.get("fGW_max")})
    rnd = classical["random"]
    rows.append({"policy": f"Random policy, {rnd['n']} seeds", "group": "classical", "return": rnd["mean"],
                 "return_std": rnd["std"], "failed": rnd["failures"] == rnd["n"],
                 "fail_reason": f"{rnd['failures']}/{rnd['n']} terminated: {rnd['failure_reasons']}"})
    cem_f = ROOT / "results/cem_open_loop.json"
    if cem_f.exists():
        cem = json.loads(cem_f.read_text())
        rows.append({"policy": "Best open-loop schedule (CEM)", "group": "open-loop search", "return": cem["best_rescored"],
                     "env_steps": cem["episodes"] * 150, "episodes": cem["episodes"],  # at most: episodes can end early
                     "Q_final": cem.get("Q_final"), "q_min_lowest": cem.get("q_min_lowest"), "fGW_max": cem.get("fGW_max")})
    for d in sorted((ROOT / "runs").glob("*")):
        if not (d / "result.json").exists():
            continue
        res = json.loads((d / "result.json").read_text())
        cfg = json.loads((d / "config.json").read_text())
        curve = json.loads((d / "curve.json").read_text()) if (d / "curve.json").exists() else {}
        best = json.loads((d / "best_result.json").read_text()) if (d / "best_result.json").exists() else None
        log = (d / "final_episode.csv")
        h_paid = None
        if log.exists():
            import pandas as pd

            ep = pd.read_csv(log)
            h_paid = int((ep.get("p_h98", 0) > 0).sum()) if "p_h98" in ep else None
        rows.append({
            "policy": d.name, "group": _group(cfg),
            "run": d.name, "seed": cfg["seed"], "return": res["benchmark_return"], "failed": res["failed"],
            "best_during_training": _best(curve), "best_checkpoint_return": best["benchmark_return"] if best else None,
            "steps_to_beat_pi": _first_above(curve, pi), "env_steps": res.get("env_steps_used"),
            "train_minutes": res.get("train_minutes"), "host": (cfg.get("host") or {}).get("cpu"),
            "h_mode_paid_s": h_paid, "Q_final": res.get("Q_final"), "q_min_lowest": res.get("q_min_lowest"),
            "t_q_min_below_1_s": res.get("t_q_min_below_1_s"), "fGW_max": res.get("fGW_max"),
            "P_aux_flattop_MW": res.get("P_aux_flattop_MW"), "Ip_final_MA": res.get("Ip_final_MA"),
        })
    out = {"pi_return": pi, "rows": rows}
    groups: dict[str, list[float]] = {}
    for r in rows:
        if r.get("run"):
            groups.setdefault(r["group"], []).append(r["return"])
    out["groups"] = {g: {"n": len(v), "mean": float(np.mean(v)), "std": float(np.std(v, ddof=1)) if len(v) > 1 else 0.0,
                         "min": float(min(v)), "max": float(max(v)), "above_pi": int(sum(x > pi for x in v))}
                     for g, v in groups.items()}
    (ROOT / "results/summary.json").write_text(json.dumps(out, indent=1, default=float))
    f = lambda x, nd=3: "" if x is None else (f"{x:.{nd}f}" if isinstance(x, float) else str(x))  # noqa: E731
    lines = ["# Physics environment: results", "",
             f"Return = the physics environment's own score (one deterministic episode). PI (re-tuned) = {pi:.4f}.", "",
             "| Policy | Return | Best during training | Steps to beat PI | Steps used | H-mode paid [s] | Q final | q_min lowest | f_GW max |",
             "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        ret = f(r["return"], 4) + (f" ± {r['return_std']:.2f}" if "return_std" in r else "")
        if r.get("failed") and r.get("fail_reason"):
            ret += f" ({r['fail_reason']})"
        lines.append(f"| {r['policy']} | {ret} | {f(r.get('best_during_training'))} | {f(r.get('steps_to_beat_pi'))} | "
                     f"{f(r.get('env_steps'))} | {f(r.get('h_mode_paid_s'))} | {f(r.get('Q_final'), 2)} | "
                     f"{f(r.get('q_min_lowest'), 2)} | {f(r.get('fGW_max'), 2)} |")
    lines += ["", "| Group | n | Mean ± std | Range | Above PI |", "|---|---|---|---|---|"]
    for g, s in out["groups"].items():
        lines.append(f"| {g} | {s['n']} | {s['mean']:.3f} ± {s['std']:.3f} | {s['min']:.3f}–{s['max']:.3f} | {s['above_pi']}/{s['n']} |")
    (ROOT / "results/summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
