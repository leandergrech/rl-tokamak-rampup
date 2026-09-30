"""Which observation leaves the Gym-TORAX bounds file when an episode ends with -1000?

Runs uniform-random wrapper actions (I_p ramp rate, NBI, ECRH) with the first-protocol I_p floor of 1 MA and,
for every failed episode, lists the observation variables outside their bounds.
python scripts/failure_probe.py > data/results/failure_probe.log
"""

import numpy as np

from rl_tokamak.env import EnvConfig, RampupEnv

env = RampupEnv(EnvConfig(ip_min=1.0e6))
space = env.inner.observation_space
rng = np.random.default_rng(1)
for ep in range(4):
    env.reset()
    done, t = False, 0
    while not done:
        _, _, term, trunc, info = env.step(rng.uniform(-1, 1, 3).astype(np.float32))
        done, t = term or trunc, t + 1
    if not info["failed"]:
        print(f"episode {ep}: ok, return {info['benchmark_return']:.4f}", flush=True)
        continue
    obs = env._last_obs
    bad = []
    for cat in ("profiles", "scalars"):
        for k, sp in space.spaces[cat].spaces.items():
            v = np.asarray(obs[cat][k])
            if not sp.contains(v.astype(sp.dtype)):
                bad.append(f"{cat}/{k} range [{np.nanmin(v):.3g}, {np.nanmax(v):.3g}] vs bounds [{np.min(sp.low):.3g}, {np.max(sp.high):.3g}]")
    last = info["episode_log"][-2]
    print(f"episode {ep}: FAILED at step {t}, I_p {env._ip / 1e6:.2f} MA, previous step: P_NBI {last['P_NBI_MW']:.1f} MW, "
          f"P_ECRH {last['P_ECRH_MW']:.1f} MW, q95 {last['q95']:.1f}; out of bounds: {bad}", flush=True)
