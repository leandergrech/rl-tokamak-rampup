"""Export the data behind the primer's Ramp-up Lab to docs/assets/widgets/lab.json.

For each recorded TORAX episode: the action sequence (I_p set-point, P_NBI, P_ECRH per 1 s step), so the Lab
can replay it on its reduced model, and the TORAX traces, so the Lab can draw them as dashed "ghost" lines.
Residual agents (an RL correction on top of PI) also get the PI proposal and the correction at every step, in
normalised action units, so the Lab's knobs panel can show which part of each knob movement came from which.
No simulation here; everything comes from CSVs under data/.

python scripts/make_lab_data.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pandas as pd

OUT = Path("docs/assets/widgets/lab.json")
EPISODES = {  # key: (label, csv)
    "open_loop": ("Open-loop reference", "data/trajectories/open_loop.csv"),
    "pi": ("PI controller", "data/trajectories/pi.csv"),
    "heating_cut": ("Heating cut at 105 s", "data/trajectories/heating_cut.csv"),
    "cem_audited": ("CEM schedule, audited objective", "data/trajectories/cem_best_audited.csv"),
    "td3bc": ("TD3+BC on noisy PI logs", "data/runs/td3bc_pi_noisy_0.3_s0/final_episode.csv"),
    "mbpo_s1": ("MBPO seed 1 (exploit)", "data/runs/mbpo_s1/final_episode.csv"),
    "ppo_s1": ("PPO seed 1 (exploit)", "data/runs/ppo_s1/final_episode.csv"),
    "ppo_res": ("PPO on PI (residual, audited reward)", "data/runs/ppo_res_s0/final_episode.csv"),
    "mbpo_res": ("MBPO on PI (residual, audited reward, best checkpoint)", "data/runs/mbpo_res_s0/best_episode.csv"),
}
# The physics environment (rl_tokamak.physics, gymtorax 1.1.1 / TORAX 1.4.3): keys start with "phys_"
PHYSICS_EPISODES = {
    "phys_open_loop": ("Open-loop reference", "data/physics/trajectories/open_loop.csv"),
    "phys_pi": ("PI controller, re-tuned", "data/physics/trajectories/pi.csv"),
    "phys_heating_cut": ("Heating cut at 105 s", "data/physics/trajectories/heating_cut.csv"),
    "phys_cem": ("Best open-loop schedule (CEM)", "data/physics/trajectories/cem_best.csv"),
    "phys_ppo_res": ("PPO on PI, seed 3", "data/physics/runs/ppo_res_s3/final_episode.csv"),
    "phys_ppo_long": ("PPO on PI, 120k steps, seed 3", "data/physics/runs/ppo_res_long_s3/final_episode.csv"),
    "phys_ppo_dr": ("PPO on PI, randomised training, seed 4", "data/physics/runs/ppo_dr_long_s4/final_episode.csv"),
    "phys_ppo_dr_low": ("PPO on PI, randomised training, seed 2 (stays at 3 MA)", "data/physics/runs/ppo_dr_long_s2/final_episode.csv"),
    "phys_mbpo_res": ("MBPO on PI, seed 2", "data/physics/runs/mbpo_res_s2/final_episode.csv"),
}
J0_INITIAL = 0.38294746  # MA/m^2, TORAX's j_total(rho=0) at reset (the ITER hybrid initial state is fixed)
J0_INITIAL_PHYSICS = 0.38595163  # the same on gymtorax 1.1.1 / TORAX 1.4.3
TRACES = {
    "Ip": "Ip_MA", "Pnbi": "P_NBI_MW", "Pecrh": "P_ECRH_MW", "Te0": "T_e0", "Ti0": "T_i0", "j0": "j0_MA_m2",
    "qmin": "q_min", "q95": "q95", "Q": "Q_fusion", "H98": "H98", "fgw": "fgw_n_e_line_avg", "betaN": "beta_N",
}


def _r(x: float, nd: int = 5):
    return None if x is None or math.isnan(x) or math.isinf(x) else float(f"{x:.{nd}g}")


def main() -> None:
    out = {}
    for key, (label, path) in {**EPISODES, **PHYSICS_EPISODES}.items():
        if not Path(path).exists():
            continue
        d = pd.read_csv(path)
        d = d[d["q_min"].notna()]
        physics = key.startswith("phys_")
        entry = {
            "label": label,
            "benchmark": _r(float(d["r_bench"].sum())),
            "actions": {
                "Ip": [_r(v, 6) for v in d["Ip_MA"]],
                "nbi": [_r(v, 5) for v in d["P_NBI_MW"]],
                "ecrh": [_r(v, 5) for v in d["P_ECRH_MW"]],
            },
            "torax": {k: [_r(float(v)) for v in d[c]] for k, c in TRACES.items()},
        }
        # the physics environment compares the heating power (radiation subtracted, no dW/dt) with the threshold
        entry["torax"]["psolPlh"] = [_r(float(v)) for v in (d["P_heat_total"] if physics else d["P_SOL_total"]) / d["P_LH"]]
        entry["torax"]["cum"] = [_r(float(v)) for v in d["r_bench"].cumsum()]
        if physics:
            entry["scenario"] = "physics"
            entry["torax"]["li"] = [_r(float(v)) for v in d["li3"]]
            entry["torax"]["mode"] = [int(v) for v in d["confinement_mode"]]
        entry["j0_initial"] = J0_INITIAL_PHYSICS if physics else J0_INITIAL
        if "base_ip" in d:
            cfg = json.loads((Path(path).parent / "config.json").read_text())
            entry["scale"] = cfg["env_config"]["extra"]["residual"]["scale"]
            entry["actions"]["base"] = [[_r(float(r[f"base_{k}"]), 5) for k in ("ip", "nbi", "ecrh")] for _, r in d.iterrows()]
            entry["actions"]["res"] = [[_r(float(r[f"res_{k}"]), 5) for k in ("ip", "nbi", "ecrh")] for _, r in d.iterrows()]
        out[key] = entry
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e3:.0f} kB, {len(out)} episodes)")


if __name__ == "__main__":
    main()
