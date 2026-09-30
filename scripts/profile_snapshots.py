"""Record full radial profiles (j, q, T_e, n_e) of the PI and open-loop runs at a few times.

python scripts/profile_snapshots.py   ->  data/trajectories/profiles.npz  (used by make_figures.py)
"""

import numpy as np

from rl_tokamak.controllers import OpenLoopController, PIController
from rl_tokamak.env import EnvConfig, RampupEnv

TIMES = (5, 20, 40, 60, 100, 150)


def main():
    env = RampupEnv(EnvConfig())
    out = {"times": np.array(TIMES)}
    for name, ctrl in (("pi", PIController()), ("open_loop", OpenLoopController())):
        ctrl.reset()
        obs, _ = env.inner.reset()
        t, done = 0, False
        snaps = {k: [] for k in ("j_total", "q", "T_e", "n_e")}
        while not done:
            obs, _, term, trunc, _ = env.inner.step(ctrl.act(obs))
            t += 1
            done = term or trunc
            if t in TIMES:
                for k in snaps:
                    snaps[k].append(np.ravel(obs["profiles"][k]).astype(float))
        for k, v in snaps.items():
            out[f"{name}_{k}"] = np.array(v)
    np.savez_compressed("data/trajectories/profiles.npz", **out)
    print({k: v.shape for k, v in out.items()})


if __name__ == "__main__":
    main()
