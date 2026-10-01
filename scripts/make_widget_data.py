"""Export the data behind the docs' interactive widgets to docs/assets/widgets/*.json.

Everything comes from files under data/ (no simulation here):
  episodes.json  per-second traces of reference and learned policies (I_p, heating, Q, temperatures,
                 q_min, q95, Greenwald fraction, P_SOL/P_LH, benchmark and audited reward per step)
  profiles.json  radial profiles of T_e, j and q every second for PI, open-loop and the heating cut
                 (from data/trajectories/profiles.npz, written by scripts/profile_snapshots.py)
  results.json   one row per policy from data/results/summary.json

python scripts/make_widget_data.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from rl_tokamak.env import audited_components

OUT = Path("docs/assets/widgets")
EPISODES = {  # key: (label, csv)
    "pi": ("PI controller", "data/trajectories/pi.csv"),
    "open_loop": ("Open-loop reference", "data/trajectories/open_loop.csv"),
    "heating_cut": ("Open-loop, heating off from 105 s", "data/trajectories/heating_cut.csv"),
    "td3bc": ("TD3+BC on noisy PI logs", "data/runs/td3bc_pi_noisy_0.3_s0/final_episode.csv"),
    "cem_audited": ("CEM schedule (audited objective)", "data/trajectories/cem_best_audited.csv"),
    "mbpo_full_s1": ("MBPO, full observation, seed 1", "data/runs/mbpo_obs-full_s1/final_episode.csv"),
    "ppo_s0": ("PPO seed 0 (14k steps)", "data/runs/ppo_s0/final_episode.csv"),
    "mbpo_s1": ("MBPO seed 1", "data/runs/mbpo_s1/final_episode.csv"),
    "ppo_s1": ("PPO seed 1 (112k steps)", "data/runs/ppo_s1/final_episode.csv"),
}


def _r(x, nd=4):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return float(f"{x:.{nd}g}")


def episodes() -> dict:
    out = {}
    for key, (label, path) in EPISODES.items():
        if not Path(path).exists():
            continue
        d = pd.read_csv(path)
        d = d[d["q_min"].notna()]
        audit = [sum(audited_components(r.Q_fusion, r.H98, r.q_min, r.q95, r.T_e0, r.T_i0, r.P_SOL_total,
                                        r.P_LH).values()) for r in d.itertuples()]
        cols = {
            "t": d["t"], "Ip": d["Ip_MA"], "Paux": d["P_NBI_MW"] + d["P_ECRH_MW"], "Q": d["Q_fusion"],
            "Te0": d["T_e0"], "Ti0": d["T_i0"], "qmin": d["q_min"], "q95": d["q95"],
            "fgw": d["fgw_n_e_line_avg"], "psol_plh": d["P_SOL_total"] / d["P_LH"], "H98": d["H98"],
            "r": d["r_bench"], "ra": pd.Series(audit, index=d.index),
        }
        out[key] = {"label": label, "benchmark": _r(float(d["r_bench"].sum())), "audited": _r(float(sum(audit))),
                    **{k: [_r(float(v)) for v in col] for k, col in cols.items()}}
    return out


def profiles() -> dict:
    z = np.load("data/trajectories/profiles.npz")
    out = {}
    for key in ("pi", "open_loop", "heating_cut", "ppo_res", "mbpo_res"):
        if f"{key}_time" not in z:
            continue
        entry = {"t": [int(t) for t in z[f"{key}_time"]]}
        for field, scale, nd in (("T_e", 1.0, 3), ("j_total", 1e-6, 3), ("q", 1.0, 3)):
            arr = z[f"{key}_{field}"] * scale
            entry[field] = [[_r(float(v), nd) for v in row] for row in arr]
        out[key] = entry
    return out


def results() -> list:
    rows = json.loads(Path("data/results/summary.json").read_text())
    keep = []
    for r in rows:
        if r.get("audited") is None or r["return"] < -100:
            continue
        keep.append({"policy": r["policy"], "group": r["group"], "benchmark": _r(r["return"]),
                     "audited": _r(r["audited"]), "steps": r.get("env_steps"), "run": r.get("run")})
    return keep


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, obj in (("episodes", episodes()), ("profiles", profiles()), ("results", results())):
        (OUT / f"{name}.json").write_text(json.dumps(obj, separators=(",", ":")))
        print(name, f"{(OUT / f'{name}.json').stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
