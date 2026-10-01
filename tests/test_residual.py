"""Residual RL on the PI controller, and the exact rules MBPO applies inside model rollouts."""

import numpy as np
import pytest

from rl_tokamak.env import EnvConfig
from rl_tokamak.residual import N_EXTRA, ResidualAdvance, ResidualEnv

SPEC = {"residual": {"base": "pi", "scale": [1.0, 2.0, 2.0]}}


@pytest.fixture(scope="module")
def res_env(short_env):
    """A residual env sharing the session's compiled TORAX simulator (8-step episodes)."""
    return ResidualEnv(EnvConfig(max_steps=8, extra=SPEC), inner=short_env.inner)


def test_spaces(res_env, short_env):
    assert res_env.observation_space.shape == (short_env.observation_space.shape[0] + N_EXTRA,)
    assert res_env.action_space.shape == (3,)


def test_zero_correction_is_the_pi_episode(res_env, short_env):
    from rl_tokamak.controllers import PIController
    from rl_tokamak.evaluate import run_controller, run_policy

    pi = run_controller(short_env, PIController())["log"]
    res = run_policy(res_env, lambda x: np.zeros(3))["log"]
    for a, b in zip(pi, res):
        for k in ("Ip_MA", "P_NBI_MW", "P_ECRH_MW", "r_bench"):
            assert b[k] == pytest.approx(a[k], rel=1e-7)  # PI's proposal passes through the float32 action vector
        assert b["res_ip"] == 0.0 and b["base_nbi"] == -1.0  # heating off before 99 s


def test_correction_range(res_env):
    x, _ = res_env.reset()
    base = x[-N_EXTRA:-1].astype(float)
    np.testing.assert_allclose(res_env.total_action(np.zeros(3)), base, atol=1e-6)
    total = res_env.total_action(np.array([-1.0, 1.0, 1.0]))
    assert total[1] == 1.0 and total[2] == 1.0  # scale 2 reaches full power from PI's "off"
    assert total[0] == pytest.approx(max(-1.0, base[0] - 1.0))


def test_residual_advance_sets_known_pi_features(res_env):
    from rl_tokamak.agents.mbpo import TimeAdvance

    adv = ResidualAdvance(res_env, TimeAdvance(res_env))
    x, _ = res_env.reset()
    mu, sd, h = adv.t.mu, adv.t.sd, adv.t.h
    xs = np.repeat(x[None], 3, 0)
    xs[:, 0] = (np.array([10, 98, 120]) / (h - 1) - mu) / sd  # steps 10, 98, 120 -> next 11, 99, 121
    x2 = xs.copy()
    x2[:, adv.i0] = 0.7
    adv(xs, x2)
    np.testing.assert_allclose(x2[:, adv.i0 + 1], [-1, 1, 1])  # heating proposal from step 99
    np.testing.assert_allclose(x2[:, adv.i0], [0.7, 0.7, 0.0])  # I_p held from step 100


def test_failure_rule_reads_the_bounds(short_env):
    from rl_tokamak.agents.mbpo import FailureRule

    rule = FailureRule(short_env)
    assert rule.active and rule.penalty == short_env.cfg.failure_penalty
    x, _ = short_env.reset()
    hot = x.copy()
    hot[rule.idx[0]] = (36.0 - rule.mu[0]) / rule.sd[0]  # T_e(0) = 36 keV > 35
    flags = rule(np.stack([x, hot]))
    assert flags.tolist() == [False, True]


@pytest.mark.parametrize("mode", ["patched", "scaled"])
def test_known_reward_matches_the_env(short_env, mode):
    from rl_tokamak.agents.mbpo import KnownReward

    env = ResidualEnv(EnvConfig(max_steps=8, reward_mode=mode, extra=SPEC), inner=short_env.inner)
    known = KnownReward(env)
    assert known.active
    env.reset()
    rng = np.random.default_rng(0)
    for _ in range(8):
        x2, r, term, trunc, _ = env.step(rng.uniform(-0.5, 0.5, 3))
        assert known(x2[None])[0] == pytest.approx(r, abs=1e-5)
        if term or trunc:
            break
