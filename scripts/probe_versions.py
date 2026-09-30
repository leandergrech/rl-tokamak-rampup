"""Run the paper's three policies on whichever gymtorax is installed and write the returns to JSON.

Used to compare gymtorax 1.0.0 (the benchmark) with 1.1.1 (current release). Only depends on gymtorax:
    .venv-v11/bin/python scripts/probe_versions.py --out data/results/probe_gymtorax_1.1.1.json
"""

import argparse
import json
import time
from importlib.metadata import version

from gymtorax import IterHybridAgent, IterHybridEnv, PIDAgent, RandomAgent


def run(env, agent):
    obs, _ = env.reset()
    ret, n, done, t0 = 0.0, 0, False, time.time()
    while not done:
        obs, r, term, trunc, _ = env.step(agent.act(obs))
        ret, n, done = ret + r, n + 1, term or trunc
    return {"return": float(ret), "steps": n, "failed": bool(r == -1000.0), "wall_s": time.time() - t0}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    a = p.parse_args()
    env = IterHybridEnv(render_mode=None, log_level="critical")
    j_target = lambda t: 0.2e6 + 0.4e6 + 1.4e6 * t / 100  # noqa: E731
    res = {"gymtorax": version("gymtorax"), "torax": version("torax")}
    res["open_loop"] = run(env, IterHybridAgent(env.action_space))
    res["pi_paper_gains"] = run(env, PIDAgent(env.action_space, j_target, 0.2e6, kp=0.700, ki=34.257, kd=0.0))
    env.action_space.seed(0)
    res["random_seed0"] = run(env, RandomAgent(env.action_space))
    print(json.dumps(res, indent=2))
    with open(a.out, "w") as f:
        json.dump(res, f, indent=2)


if __name__ == "__main__":
    main()
