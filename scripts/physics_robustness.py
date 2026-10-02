"""Robustness of every physics-environment policy to the plasma's measured uncertainty (held-out perturbations).

Test plasmas: the nominal one, then, for each scale s in 0.25, 0.5, 0.75, 1, `--per-scale` draws from the uncertainty
box of rl_tokamak.physics.UNCERTAINTY shrunk by s (L-H threshold factor, H-L hysteresis, pedestal height), with a
seed that training never uses. Policies: open-loop reference, re-tuned PI, the CEM schedule (all open loop or fixed
gains), and every run under data/physics/runs (final policies). One deterministic episode per (plasma, policy).

    python scripts/physics_robustness.py --workers 32
Writes data/physics/results/robustness.json and robustness.md.
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time
from pathlib import Path

import numpy as np

ROOT = Path("data/physics")
SCALES = (0.0, 0.25, 0.5, 0.75, 1.0)
TEST_SEED = 20261002  # never used for training (training seeds are 0-4 and their worker offsets)


def test_cases(per_scale: int) -> list[dict]:
    from rl_tokamak.physics import PhysicsConfig, sample_physics

    rng, nominal = np.random.default_rng(TEST_SEED), PhysicsConfig()
    cases = [{"case": 0, "scale": 0.0, **sample_physics(rng, 0.0, nominal)}]
    for s in SCALES[1:]:
        for _ in range(per_scale):
            cases.append({"case": len(cases), "scale": s, **sample_physics(rng, s, nominal)})
    return cases


def policies() -> list[tuple[str, str, str | None]]:
    """(name, group, run_dir or None for the fixed controllers)."""
    out = [("open_loop", "open-loop reference", None), ("pi", "PI, re-tuned", None), ("cem", "CEM schedule", None)]
    for d in sorted((ROOT / "runs").glob("*")):
        if (d / "config.json").exists():
            cfg = json.loads((d / "config.json").read_text())
            dr = cfg["env_config"]["extra"].get("physics", {}).get("randomize", 0)
            group = f"{cfg['algo'].upper()} on PI" + (", randomised training" if dr else "")
            out.append((d.name, group, str(d)))
    return out


def _worker(job: tuple[list[dict], list[tuple[str, str, str | None]]]) -> list[dict]:
    from rl_tokamak.agents.cem import ScheduleController
    from rl_tokamak.checkpoints import ensure
    from rl_tokamak.controllers import OpenLoopController, PIController
    from rl_tokamak.env import EnvConfig, RampupEnv, nominal, set_single_thread
    from rl_tokamak.evaluate import run_controller, run_policy
    from rl_tokamak.physics import PHYSICS_PI
    from rl_tokamak.policies import load_policy

    set_single_thread()
    cases, pols = job
    base = RampupEnv(EnvConfig(normalize=False, extra={"physics": {}}))
    inner = base.inner  # one TORAX simulator per worker, shared by every wrapper
    cem = json.loads((ROOT / "results/cem_open_loop.json").read_text())["best_params"]
    controllers = {"open_loop": OpenLoopController, "pi": lambda: PIController(**PHYSICS_PI),
                   "cem": lambda: ScheduleController(cem)}
    wrappers, loaded = {}, {}
    for name, _, run in pols:
        if run is None:
            continue
        ensure(Path(run) / "policy.pt")
        env_cfg, pi = load_policy(run)
        env_cfg = nominal(env_cfg)
        key = json.dumps({**env_cfg.to_dict(), "log_dir": None}, sort_keys=True)
        if key not in wrappers:
            wrappers[key] = _wrap(env_cfg, inner)
        loaded[name] = (wrappers[key], pi)
    rows = []
    for case in cases:
        inner.physics_override = {k: case[k] for k in ("P_LH_prefactor", "hysteresis", "T_ped_H")}
        for name, group, run in pols:
            ep = run_controller(base, controllers[name]()) if run is None else run_policy(*loaded[name])
            log = ep["log"]
            ok = [r for r in log if "confinement_mode" in r]
            rows.append({**case, "policy": name, "group": group, "return": ep["benchmark_return"], "failed": ep["failed"],
                         "fail_reason": log[-1].get("fail_reason") if ep["failed"] else None, "steps": len(log),
                         "h_mode_paid_s": int(sum(r.get("p_h98", 0) > 0 for r in ok)),
                         "first_h_t": next((r["t"] for r in ok if r["confinement_mode"] in (1, 2)), None),
                         "Q_final": ok[-1]["Q_fusion"] if ok else None})
    return rows


def _wrap(env_cfg, inner):
    from rl_tokamak.env import RampupEnv
    from rl_tokamak.residual import ResidualEnv

    return ResidualEnv(env_cfg, inner=inner) if env_cfg.extra.get("residual") else RampupEnv(env_cfg, inner=inner)


def summarise(rows: list[dict]) -> dict:
    pi = {r["case"]: r["return"] for r in rows if r["policy"] == "pi"}
    groups = sorted({r["group"] for r in rows}, key=lambda g: [r["group"] for r in rows].index(g))
    table = {}
    for g in groups:
        for s in SCALES:
            sel = [r for r in rows if r["group"] == g and r["scale"] == s]
            if not sel:
                continue
            ret = np.array([r["return"] for r in sel])
            done = np.array([not r["failed"] for r in sel])
            table[f"{g}|{s}"] = {
                "group": g, "scale": s, "n": len(sel), "failures": int((~done).sum()),
                "mean_completed": float(ret[done].mean()) if done.any() else None,
                "min_completed": float(ret[done].min()) if done.any() else None,
                "beats_pi": int(sum(r["return"] > pi.get(r["case"], np.inf) + 1e-9 for r in sel)),
                "h_mode_paid_s": float(np.mean([r["h_mode_paid_s"] for r in sel])),
            }
    return table


BANDS = (("≤ 1.06", 0.0, 1.07), ("1.09–1.16", 1.07, 1.17), ("≥ 1.18", 1.17, 99.0))  # threshold / scaling


def _label(r: dict) -> str:
    """Group label with the training budget (the 120,000-step runs share their group name with the 30,000-step ones)."""
    g = r["group"]
    if r["policy"].startswith("ppo"):
        return g + (", 120,000 steps" if "_long" in r["policy"] else ", 30,000 steps")
    return g


def report(stems: list[str]) -> str:
    """Markdown table by threshold band from saved results (no simulation): python scripts/physics_robustness.py --report"""
    rows, cases, seen = [], {}, set()
    for stem in stems:
        f = ROOT / f"results/{stem}.json"
        if f.exists():
            d = json.loads(f.read_text())
            for r in d["rows"]:
                if (r["case"], r["policy"]) not in seen:  # PI runs in every evaluation
                    seen.add((r["case"], r["policy"]))
                    rows.append({**r, "group": _label(r)})
            cases.update({c["case"]: c for c in d["cases"]})
    groups = list(dict.fromkeys(r["group"] for r in rows))
    pi = {r["case"]: r["return"] for r in rows if r["policy"] == "pi"}
    n_band = [sum(lo <= c["P_LH_prefactor"] < hi for c in cases.values()) for _, lo, hi in BANDS]
    head = " | ".join(f"threshold {b} ({n} plasmas)" for (b, _, _), n in zip(BANDS, n_band))
    lines = [f"| Policy | Episodes | {head} | Beats PI on the same plasma | Ended on a limit |",
             "|---|---|" + "---|" * len(BANDS) + "---|---|"]
    for g in groups:
        sel = [r for r in rows if r["group"] == g]
        cells = []
        for _, lo, hi in BANDS:
            band = [r for r in sel if lo <= cases[r["case"]]["P_LH_prefactor"] < hi]
            ok = [r["return"] for r in band if not r["failed"]]
            reach = np.mean([r["h_mode_paid_s"] > 0 for r in band])
            cells.append(f"{np.mean(ok):.2f}, H-mode {reach:.0%}" if ok else "–")
        beats = sum(r["return"] > pi[r["case"]] + 1e-9 for r in sel)
        lines.append(f"| {g} | {len(sel)} | " + " | ".join(cells) + f" | {beats}/{len(sel)} | {sum(r['failed'] for r in sel)} |")
    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--per-scale", type=int, default=8)
    p.add_argument("--max-cases", type=int, default=None, help=argparse.SUPPRESS)  # smoke tests
    p.add_argument("--only", nargs="*", default=None, help="evaluate only these policies (names)")
    p.add_argument("--out", default="robustness", help="file stem under data/physics/results")
    p.add_argument("--report", action="store_true", help="only write robustness_bands.md from the saved results")
    a = p.parse_args()
    if a.report:
        text = report(["robustness", "robustness_long"])
        (ROOT / "results/robustness_bands.md").write_text(
            "# Robustness by threshold band\n\nMean return over completed episodes and share reaching H-mode, by the "
            "plasma's true L-H threshold relative to the Martin 2008 scaling.\n\n" + text + "\n")
        print(text)
        return
    cases, pols = test_cases(a.per_scale)[: a.max_cases], policies()
    if a.only:  # PI always runs: every policy is compared with PI on the same plasma
        pols = [x for x in pols if x[0] in a.only or x[0] == "pi"]
    chunks = [cases[i::a.workers] for i in range(a.workers) if cases[i::a.workers]]
    t0 = time.time()
    with mp.get_context("spawn").Pool(len(chunks)) as pool:
        rows = [r for part in pool.map(_worker, [(c, pols) for c in chunks]) for r in part]
    rows.sort(key=lambda r: (r["case"], [x[0] for x in pols].index(r["policy"])))
    table = summarise(rows)
    out = {"cases": cases, "policies": [{"name": n, "group": g, "run": r} for n, g, r in pols], "rows": rows,
           "table": table, "wall_min": (time.time() - t0) / 60}
    (ROOT / "results").mkdir(parents=True, exist_ok=True)
    (ROOT / f"results/{a.out}.json").write_text(json.dumps(out, indent=1, default=float))
    f = lambda x: "" if x is None else f"{x:.3f}"  # noqa: E731
    lines = ["# Physics environment: robustness to the measured uncertainty", "",
             f"{len(cases)} test plasmas (seed {TEST_SEED}), one deterministic episode per policy and plasma. "
             "Scale s shrinks the uncertainty box towards the nominal plasma (s = 1: threshold factor 0.54-1.85, "
             "hysteresis 0.35-0.8, pedestal 2.4-3.6 keV). Mean and minimum over completed episodes; failures end on a limit.", "",
             "| Policy group | s | Episodes | Failures | Mean return | Min return | Beats PI on the same plasma | H-mode paid [s] |",
             "|---|---|---|---|---|---|---|---|"]
    for v in table.values():
        lines.append(f"| {v['group']} | {v['scale']:g} | {v['n']} | {v['failures']} | {f(v['mean_completed'])} | "
                     f"{f(v['min_completed'])} | {v['beats_pi']}/{v['n']} | {v['h_mode_paid_s']:.1f} |")
    (ROOT / f"results/{a.out}.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"{len(rows)} episodes in {out['wall_min']:.1f} min")


if __name__ == "__main__":
    main()
