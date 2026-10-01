"""Record full radial profiles of three reference episodes at every second, for the docs' animations.

Policies: the PI controller, the open-loop reference, and the open-loop reference with NBI and ECRH
switched off from t = 105 s (the reward loophole). Saved to data/trajectories/profiles.npz as
<policy>_<field> arrays of shape (steps, radial points), plus <policy>_time; the heating-cut episode
log is also written to data/trajectories/heating_cut.csv.

python scripts/profile_snapshots.py
"""

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


def main():
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
