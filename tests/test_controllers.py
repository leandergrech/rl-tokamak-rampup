"""The re-implemented PI and open-loop controllers must act exactly like Gym-TORAX's own agents."""

import numpy as np

from rl_tokamak.controllers import PAPER_KI, PAPER_KP, OpenLoopController, PIController, j_target


def _compare(env, ours, theirs, n=6):
    ours.reset()
    obs, _ = env.inner.reset()
    for _ in range(n):
        a, b = ours.act(obs), theirs.act(obs)
        for k in ("Ip", "NBI", "ECRH"):
            np.testing.assert_allclose(np.ravel(a[k]), np.ravel(b[k]), rtol=1e-12)
        obs, *_ = env.inner.step(a)


def test_pi_matches_gymtorax_agent(short_env):
    from gymtorax import PIDAgent

    _compare(short_env, PIController(), PIDAgent(short_env.inner.action_space, j_target, 0.2e6,
                                                 kp=PAPER_KP, ki=PAPER_KI, kd=0.0))


def test_open_loop_matches_gymtorax_agent(short_env):
    from gymtorax import IterHybridAgent

    _compare(short_env, OpenLoopController(), IterHybridAgent(short_env.inner.action_space))
