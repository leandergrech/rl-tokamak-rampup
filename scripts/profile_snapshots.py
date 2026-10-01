"""Record full radial profiles of three reference episodes at every second, for the docs' animations.

Policies: the PI controller, the open-loop reference, and the open-loop reference with NBI and ECRH
switched off from t = 105 s (the reward loophole). Saved to data/trajectories/profiles.npz as
<policy>_<field> arrays of shape (steps, radial points), plus <policy>_time; the heating-cut episode
log is also written to data/trajectories/heating_cut.csv.

Stored policies can be added to the same file (the Lab draws their TORAX space-time maps):

python scripts/profile_snapshots.py
python scripts/profile_snapshots.py --add ppo_res=data/runs/ppo_res_s0:final mbpo_res=data/runs/mbpo_res_s0:best
"""

import argparse
from pathlib import Path

import numpy as np

from rl_tokamak.controllers import OpenLoopController, PIController
from rl_tokamak.env import EnvConfig, RampupEnv
from rl_tokamak.evaluate import write_episode_csv

FIELDS = ("j_total", "q", "T_e", "T_i", "n_e")


class HeatingCut(OpenLoopController):
    def act(self, obs):
        t = self.step_idx
        a = super().act(obs)
        if t >= 105:
            a["NBI"][0] = 0.0
            a["ECRH"][0] = 0.0
        return a


def record_policy(run_dir: str, which: str) -> dict:
    """One deterministic episode of a stored policy, with its profiles at every second."""
    from rl_tokamak.env import make_env
    from rl_tokamak.policies import load_policy

    cfg, pi = load_policy(run_dir, which)
    env = make_env(cfg)
    x, _ = env.reset()
    snaps, times, t, done = {k: [] for k in FIELDS}, [], 0, False
    while not done:
        x, _, term, trunc, _ = env.step(pi(x))
        t += 1
        done = term or trunc
        times.append(t)
        for k in FIELDS:
            snaps[k].append(np.ravel(env._last_obs["profiles"][k]).astype(np.float32))
    return {"time": np.array(times), **{k: np.array(v) for k, v in snaps.items()}}


def add(specs: list[str]) -> None:
    path = Path("data/trajectories/profiles.npz")
    out = dict(np.load(path)) if path.exists() else {}
    for spec in specs:
        key, rest = spec.split("=", 1)
        run_dir, _, which = rest.partition(":")
        for k, v in record_policy(run_dir, which or "final").items():
            out[f"{key}_{k}"] = v
        print(key, out[f"{key}_T_e"].shape, flush=True)
    np.savez_compressed(path, **out)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--add", nargs="*", default=None, metavar="KEY=RUN_DIR[:final|best]")
    a = p.parse_args()
    if a.add:
        return add(a.add)
    env = RampupEnv(EnvConfig())
    out = {}
    for name, ctrl in (("pi", PIController()), ("open_loop", OpenLoopController()), ("heating_cut", HeatingCut())):
        ctrl.reset()
        env.reset()
        obs = env._last_obs
        t, done = 0, False
        snaps = {k: [] for k in FIELDS}
        times = []
        while not done:
            obs, _, term, trunc, info = env.step_gymtorax(ctrl.act(obs))
            t += 1
            done = term or trunc
            times.append(t)
            for k in FIELDS:
                snaps[k].append(np.ravel(obs["profiles"][k]).astype(np.float32))
        if name == "heating_cut":
            write_episode_csv(info["episode_log"], "data/trajectories/heating_cut.csv")
        out[f"{name}_time"] = np.array(times)
        for k, v in snaps.items():
            out[f"{name}_{k}"] = np.array(v)
    np.savez_compressed("data/trajectories/profiles.npz", **out)
    print({k: v.shape for k, v in out.items()})


if __name__ == "__main__":
    main()
