"""Score two learned policies of this repo on gymtorax's IterHybrid-v0 and IterHybridAudited-v0.

Needs a gymtorax that registers ``gymtorax/IterHybridAudited-v0`` (the fork branch
fix/audited-iter-hybrid-reward-v1.0 at https://github.com/leandergrech/gymtorax) installed next to this
package. Prints one row per (policy, environment) and writes data/results/upstream_envs.json.
"""

import json
from importlib.metadata import version
from pathlib import Path

import gymnasium as gym

import gymtorax  # noqa: F401  (registers the environments)
from rl_tokamak.env import RampupEnv
from rl_tokamak.evaluate import run_policy
from rl_tokamak.policies import load_policy

ROOT = Path(__file__).resolve().parents[1]
RUNS = {
    "td3bc_pi_noisy_0.3_s0": "TD3+BC on noisy PI logs (sigma 0.3)",
    "mbpo_obs-full_s1": "MBPO, full observation, seed 1 (final policy)",
}


def main():
    out = {"gymtorax": version("gymtorax"), "torax": version("torax"), "jax": version("jax"), "results": []}
    for run, label in RUNS.items():
        cfg, pi = load_policy(ROOT / "data" / "runs" / run)
        for env_id in ("gymtorax/IterHybrid-v0", "gymtorax/IterHybridAudited-v0"):
            env = RampupEnv(cfg, inner=gym.make(env_id, log_level="critical").unwrapped)
            ep = run_policy(env, pi)
            row = {"run": run, "label": label, "env_id": env_id, "return": float(ep["benchmark_return"]),
                   "failed": bool(ep["failed"])}
            out["results"].append(row)
            print(row, flush=True)
    (ROOT / "data" / "results" / "upstream_envs.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
