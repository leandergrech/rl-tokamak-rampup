"""Export trained policies for the Ramp-up Lab, so the browser can run them as live feedback controllers.

For each run: the actor network's layers (weights rounded to 6 significant digits), its activation and output
transform, the observation normalisation of the run's env, the action mapping (I_p floor, residual scales), and
a self-check: a few observation vectors from the run's recorded TORAX episode with the PyTorch actions, so the
JavaScript forward pass can be verified (node scripts/check_lab_control.mjs).

Writes docs/assets/widgets/policies/<key>.json; the Lab loads one only when its live mode is switched on.

python scripts/export_lab_policies.py                       # the default set (see POLICIES)
python scripts/export_lab_policies.py ppo_res=data/runs/ppo_res_s0:best   # only this one, best checkpoint
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import torch

OUT = Path("docs/assets/widgets/policies")
POLICIES = {  # Lab key: (run directory, checkpoint)
    "td3bc": ("data/runs/td3bc_pi_noisy_0.3_s0", "final"),
    "mbpo_s1": ("data/runs/mbpo_s1", "final"),
    "ppo_s1": ("data/runs/ppo_s1", "final"),
    "ppo_res": ("data/runs/ppo_res_s0", "final"),
    "mbpo_res": ("data/runs/mbpo_res_s0", "best"),
}
# the physics environment's runs: export them from the physics stack (.[dev-physics]), e.g.
#   python scripts/export_lab_policies.py --physics
PHYSICS_POLICIES = {
    "phys_ppo_res": ("data/physics/runs/ppo_res_s3", "final"),
    "phys_ppo_long": ("data/physics/runs/ppo_res_long_s3", "final"),
    "phys_ppo_dr": ("data/physics/runs/ppo_dr_long_s4", "final"),
    "phys_ppo_dr_low": ("data/physics/runs/ppo_dr_long_s2", "final"),
    "phys_mbpo_res": ("data/physics/runs/mbpo_res_s2", "final"),
}
SIG = 6


def _r(a) -> list:
    return [float(f"{v:.{SIG}g}") for v in np.ravel(np.asarray(a, dtype=np.float64))]


def _layers(pairs) -> list[dict]:
    return [{"out": int(w.shape[0]), "in": int(w.shape[1]), "W": _r(w), "b": _r(b)} for w, b in pairs]


def export(key: str, run_dir: Path, which: str) -> dict:
    from rl_tokamak.env import IP_RAMP, EnvConfig, load_obs_stats, nominal
    from rl_tokamak.policies import load_policy

    meta = json.loads((run_dir / "config.json").read_text())
    env_cfg = nominal(EnvConfig(**{**meta["env_config"], "log_dir": None}))  # randomised runs: the nominal plasma
    assert env_cfg.obs_set == "profiles" and env_cfg.action_set == "powers" and env_cfg.ip_mode == "delta", key
    physics = env_cfg.extra.get("physics") is not None
    from rl_tokamak.checkpoints import ensure

    stem = "policy" if which == "final" else "policy_best"
    ensure(run_dir / f"{stem}.pt")
    ckpt = torch.load(run_dir / f"{stem}.pt", map_location="cpu", weights_only=False)
    sd = {k: v.numpy() for k, v in ckpt["state_dict"].items()}
    spec: dict = {"key": key, "run": run_dir.name, "checkpoint": which, "algo": meta["algo"]}
    if ckpt["kind"] == "sb3_policy":
        assert ckpt["algo"] == "ppo", "only PPO's Gaussian mean is exported for SB3 policies"
        n = len(ckpt["net_arch"])
        pairs = [(sd[f"mlp_extractor.policy_net.{2 * i}.weight"], sd[f"mlp_extractor.policy_net.{2 * i}.bias"]) for i in range(n)]
        pairs.append((sd["action_net.weight"], sd["action_net.bias"]))
        spec.update(act="tanh", out="clip")
    elif ckpt["kind"] == "sac_actor":
        n = len(ckpt["hidden"])
        pairs = [(sd[f"net.{2 * i}.weight"], sd[f"net.{2 * i}.bias"]) for i in range(n + 1)]
        ad = ckpt["act_dim"]
        pairs[-1] = (pairs[-1][0][:ad], pairs[-1][1][:ad])  # the mean half of [mu, log_std]
        spec.update(act="relu", out="tanh")
    elif ckpt["kind"] == "td3bc_actor":
        n = len(ckpt["hidden"])
        pairs = [(sd[f"0.{2 * i}.weight"], sd[f"0.{2 * i}.bias"]) for i in range(n + 1)]
        spec.update(act="relu", out="tanh", in_mu=_r(ckpt["mu"]), in_sd=_r(ckpt["sd"]))
    else:
        raise ValueError(ckpt["kind"])
    spec["layers"] = _layers(pairs)
    mu, sdv = load_obs_stats("profiles", physics)
    # physics: the observation ends with TORAX's confinement flags and P_heat (env.PHYSICS_EXTRA)
    spec["obs"] = {"set": "profiles", "mean": _r(mu), "std": _r(sdv), "clip": env_cfg.clip_obs, "physics": physics}
    residual = env_cfg.extra.get("residual")
    res = None
    if residual:
        res = {"base": residual["base"], "scale": list(residual["scale"])}
        if residual.get("pi_gains"):
            res["pi_gains"] = residual["pi_gains"]  # the re-tuned PI of the physics environment
    spec["action"] = {"ip_min": env_cfg.ip_min, "ip_ramp": IP_RAMP, "residual": res}
    spec["scenario"] = "physics" if physics else "benchmark"
    spec["obs_dim"] = int(pairs[0][0].shape[1])

    # self-check: observations of the recorded TORAX episode, re-created from its own run, and PyTorch's actions
    _, pi = load_policy(run_dir, which)
    xs = _recorded_features(run_dir, env_cfg, pi)
    pick = [0, len(xs) // 3, 2 * len(xs) // 3, len(xs) - 1]
    spec["check"] = [{"x": _r(xs[i]), "a": _r(np.clip(pi(xs[i]), -1, 1))} for i in pick]
    return spec


def _recorded_features(run_dir: Path, env_cfg, pi) -> list[np.ndarray]:
    """Re-run the deterministic policy on TORAX and keep its observation vectors (151 steps, ~1 min)."""
    from rl_tokamak.env import make_env

    env = make_env(env_cfg)
    x, _ = env.reset()
    xs, done = [x], False
    while not done:
        x, _, term, trunc, _ = env.step(pi(x))
        done = term or trunc
        xs.append(x)
    return xs[:-1]


def main(argv: list[str]) -> None:
    from rl_tokamak.env import set_single_thread

    set_single_thread()
    jobs = dict(POLICIES)
    if argv and argv[0] == "--physics":
        jobs, argv = dict(PHYSICS_POLICIES), argv[1:]
    if argv:  # explicit key=run_dir[:final|best] arguments replace the default set
        jobs = {}
        for a in argv:
            key, rest = a.split("=", 1)
            path, _, which = rest.partition(":")
            jobs[key] = (path, which or "final")
    OUT.mkdir(parents=True, exist_ok=True)
    for key, (path, which) in jobs.items():
        spec = export(key, Path(path), which)
        f = OUT / f"{key}.json"
        f.write_text(json.dumps(spec, separators=(",", ":")))
        print(f"wrote {f} ({f.stat().st_size / 1e3:.0f} kB): {spec['algo']} {which}, "
              f"{' x '.join(str(L['out']) for L in spec['layers'])}, residual={spec['action']['residual']}")


if __name__ == "__main__":
    main(sys.argv[1:])
