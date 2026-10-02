"""Does a power-triggered pedestal change what the Gym-TORAX ITER hybrid ramp-up rewards?

Gym-TORAX's ITER hybrid scenario prescribes the pedestal in time (T_ped = 0.5 keV until 100 s, 3 keV
from 105 s), whatever the heating. TORAX >= 1.4 can instead form the pedestal only when the power
crossing the separatrix exceeds the L-H threshold (Martin 2008 scaling) and drop it again when the
power falls below a hysteresis fraction of it (pedestal.use_formation_model_with_adaptive_source).
This script runs the same action sequences under both pedestal models and records when the
pedestal is up, the heating, P_SOL / P_LH, Q and the Gym-TORAX reward.

Needs gymtorax 1.1.1 / TORAX 1.4.x (the repo's .venv, not the pinned .venv-v10):
    .venv/bin/python scripts/probe_pedestal_formation.py --out data/results/pedestal_formation_probe.json
(about 2 min; the per-second traces go to --rows if given)
"""

from __future__ import annotations

import argparse
import copy
import json
import time
from importlib.metadata import version

import numpy as np
from gymtorax import IterHybridAgent, IterHybridEnv, PIDAgent

FORMATION = {
    "model_name": "set_T_ped_n_ped",
    "set_pedestal": True,
    "use_formation_model_with_adaptive_source": True,  # L-H when P_SOL > P_LH, H-L when P_SOL < h P_LH
    "formation_model": {"model_name": "martin_scaling"},
    "P_LH_hysteresis_factor": 0.8,
    "transition_time_width": 0.5,
    "T_i_ped": 3.0,  # H-mode target: the scheduled value after 105 s
    "T_e_ped": 3.0,
    "n_e_ped_is_fGW": True,
    "n_e_ped": 0.85,
    "rho_norm_ped_top": 0.95,
}


class FormationEnv(IterHybridEnv):
    """IterHybrid-v0 with the time-scheduled pedestal replaced by TORAX's power-triggered one."""

    def _get_torax_config(self):
        cfg = copy.deepcopy(super()._get_torax_config())
        cfg["config"]["pedestal"] = copy.deepcopy(FORMATION)
        return cfg


class HeatingCut:
    """Open-loop reference, NBI and ECRH off from step `cut` (the exploit of the scheduled pedestal)."""

    def __init__(self, action_space, cut=105):
        self.ref, self.cut, self.k = IterHybridAgent(action_space), cut, 0

    def act(self, obs):
        a = self.ref.act(obs)
        if self.k >= self.cut:
            a["NBI"][0] = 0.0
            a["ECRH"][0] = 0.0
        self.k += 1
        return a


class Unheated(HeatingCut):
    def __init__(self, action_space):
        super().__init__(action_space, cut=0)


def ped_top_index(obs, rho_ped=0.95):
    """Index of the pedestal-top cell in an observed profile ([left face, n cell centres, right face])."""
    n = len(obs["profiles"]["T_e"]) - 2
    rho = np.concatenate([[0.0], (np.arange(n) + 0.5) / n, [1.0]])
    return int(np.argmin(np.abs(rho - rho_ped)))


def _f(x):
    return float(np.asarray(x, dtype=float).ravel()[-1])


def run(env, agent):
    obs, _ = env.reset()
    rows, ret, done, t0, k = [], 0.0, False, time.time(), 0
    i95 = ped_top_index(obs)
    while not done:
        action = agent.act(obs)
        obs, r, term, trunc, _ = env.step(action)
        s, p = obs["scalars"], obs["profiles"]
        k += 1
        if not (term and r == -1000.0):
            rows.append({
                "t": k, "Ip_MA": _f(p["Ip_profile"]) / 1e6, "P_aux_MW": _f(s["P_aux_total"]) / 1e6,
                "P_SOL_MW": _f(s["P_SOL_total"]) / 1e6, "P_heat_MW": _f(s["P_heat_total"]) / 1e6,
                "P_LH_MW": _f(s["P_LH"]) / 1e6, "T_e_ped": float(np.asarray(p["T_e"])[i95]),
                "T_e0": float(np.asarray(p["T_e"])[0]), "Q": _f(s["Q_fusion"]), "q_min": _f(s["q_min"]),
                "q95": _f(s["q95"]), "fgw": _f(s["fgw_n_e_line_avg"]), "beta_N": _f(s["beta_N"]),
                "li3": _f(s["li3"]), "H98": _f(s["H98"]), "r": float(r),
            })
        ret += r
        done = term or trunc
    return {"return": float(ret), "failed": bool(r == -1000.0), "steps": k, "wall_s": time.time() - t0, "rows": rows}


def summarise(res: dict) -> dict:
    """Per-episode numbers: pedestal timing (pedestal-top T_e > 1.5 keV), Q, and the operating limits."""
    rows = res["rows"]
    ped = [x["t"] for x in rows if x["T_e_ped"] > 1.5]
    ramp = [x for x in rows if x["t"] <= 100]
    return {
        "return": res["return"], "failed": res["failed"], "steps": res["steps"], "wall_s": round(res["wall_s"], 1),
        "pedestal_s": len(ped), "first_pedestal_t": ped[0] if ped else None,
        "Q_max": max((x["Q"] for x in rows), default=None),
        "q_min_below_1_s": sum(x["q_min"] < 1 for x in rows),
        "fGW_max": max((x["fgw"] for x in rows), default=None), "fGW_above_1_s": sum(x["fgw"] > 1 for x in rows),
        "beta_N_max": max((x["beta_N"] for x in rows), default=None),
        "li3_ramp_range": [min(x["li3"] for x in ramp), max(x["li3"] for x in ramp)] if ramp else None,
    }


def report(name: str, s: dict) -> None:
    print(f"{name:30s} return {s['return']:8.2f}{' FAILED' if s['failed'] else '       '} steps {s['steps']:3d}  "
          f"pedestal {s['pedestal_s']:3d} s (from {s['first_pedestal_t'] or '-'})  max Q {s['Q_max']:6.1f}  "
          f"q_min<1 {s['q_min_below_1_s']:3d} s  f_GW max {s['fGW_max']:.2f}  {s['wall_s']:.0f} s", flush=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, help="summary JSON (one entry per environment/policy)")
    p.add_argument("--rows", help="optional JSON with the per-second traces")
    a = p.parse_args()
    out = {"gymtorax": version("gymtorax"), "torax": version("torax"), "formation_config": FORMATION, "runs": {}}
    rows = {}
    j_target = lambda t: 0.2e6 + 0.4e6 + 1.4e6 * t / 100  # noqa: E731
    for env_name, env in (("scheduled", IterHybridEnv(render_mode=None, log_level="critical")),
                          ("formation", FormationEnv(render_mode=None, log_level="critical"))):
        for pol_name, make in (("open_loop", IterHybridAgent), ("heating_cut_105", HeatingCut),
                               ("unheated", Unheated),
                               ("pi_paper_gains", lambda s: PIDAgent(s, j_target, 0.2e6, kp=0.700, ki=34.257, kd=0.0))):
            key = f"{env_name}/{pol_name}"
            res = run(env, make(env.action_space))
            out["runs"][key], rows[key] = summarise(res), res["rows"]
            report(key, out["runs"][key])
    with open(a.out, "w") as f:
        json.dump(out, f, indent=1)
    if a.rows:
        with open(a.rows, "w") as f:
            json.dump(rows, f)


if __name__ == "__main__":
    main()
