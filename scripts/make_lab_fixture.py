"""Write a fixture for scripts/check_lab_control.mjs: a few TORAX states of the PI episode as Lab-style records
(the quantities docs/javascripts/lab-control.js reads, on TORAX's own radial grids) together with the observation
vector src/rl_tokamak/env.py builds from them, so the JavaScript observation can be checked feature by feature.

python scripts/make_lab_fixture.py /tmp/lab_feature_fixture.json      # one TORAX episode, about 1 min idle
python scripts/make_lab_fixture.py /tmp/lab_physics_fixture.json --physics   # the physics environment (.[dev-physics])
node scripts/check_lab_control.mjs /tmp/lab_feature_fixture.json /tmp/lab_physics_fixture.json --robustness
"""

from __future__ import annotations

import json
import sys

import numpy as np

CELL = [0.0] + [(k + 0.5) / 25 for k in range(25)] + [1.0]  # TORAX cell grid plus both boundaries (27 points)
FACE = [k / 25 for k in range(26)]  # face grid (q)
STEPS = (0, 1, 30, 75, 99, 100, 120, 150)
SCALARS = {  # Lab name: (TORAX scalar, divide by)
    "q95": ("q95", 1), "qmin": ("q_min", 1), "rhoQmin": ("rho_q_min", 1), "betaN": ("beta_N", 1), "H98": ("H98", 1),
    "Q": ("Q_fusion", 1), "li": ("li3", 1), "fgw": ("fgw_n_e_line_avg", 1), "nbar": ("n_e_line_avg", 1e20),
    "TeVol": ("T_e_volume_avg", 1), "TiVol": ("T_i_volume_avg", 1), "W": ("W_thermal_total", 1), "tauE": ("tau_E", 1),
    "Vloop": ("v_loop_lcfs", 1), "Ibs": ("I_bootstrap", 1e6), "Pohm": ("P_ohmic_e", 1e6), "Psol": ("P_SOL_total", 1e6),
    "PLH": ("P_LH", 1e6),
}
PROFILES = {"Te": ("T_e", 1, CELL), "Ti": ("T_i", 1, CELL), "n": ("n_e", 1e20, CELL), "q": ("q", 1, FACE),
            "j": ("j_total", 1e6, CELL)}


def record(env, obs: dict, x: np.ndarray, t: int) -> dict:
    from rl_tokamak.env import _scalar

    s, p = obs["scalars"], obs["profiles"]
    rec = {"t": t, "Ip": env._applied[0] / 1e6, "Pnbi": env._applied[1] / 1e6, "Pecrh": env._applied[2] / 1e6,
           "Te0": float(p["T_e"][0]), "Ti0": float(p["T_i"][0]), "j0": float(p["j_total"][0]) / 1e6}
    rec.update({k: _scalar(s, name) / u for k, (name, u) in SCALARS.items()})
    rec["prof"] = {k: [float(v) / u for v in p[name]] for k, (name, u, _) in PROFILES.items()}
    if env.physics is not None:  # the physics environment also observes the confinement mode and P_heat
        rec["mode"] = int(env._mode)
        rec["Pheat"] = _scalar(s, "P_heat_total") / 1e6
    rec["grid"] = {k: grid for k, (_, _, grid) in PROFILES.items()}
    rec["x"] = [float(v) for v in x]
    return rec


def main(out: str, physics: bool = False) -> None:
    from rl_tokamak.env import EnvConfig, make_env, set_single_thread

    set_single_thread()
    extra = {"residual": {"base": "pi", "scale": [1, 2, 2]}}
    if physics:
        from rl_tokamak.physics import PHYSICS_PI

        extra = {"physics": {}, "residual": {**extra["residual"], "pi_gains": dict(PHYSICS_PI)}}
    env = make_env(EnvConfig(extra=extra))
    x, _ = env.reset()
    recs = []
    for t in range(env.horizon):
        if t in STEPS:
            recs.append(record(env, env._last_obs, x, t))
        x, _, term, trunc, _ = env.step(np.zeros(3))  # zero correction: the PI episode
        if term or trunc:
            break
    with open(out, "w") as f:
        json.dump(recs, f)
    print(f"wrote {out}: {len(recs)} records, observation dimension {len(recs[0]['x'])}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--physics"]
    main(args[0] if args else "lab_feature_fixture.json", physics="--physics" in sys.argv)
