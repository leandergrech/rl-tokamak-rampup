"""Sanity checks of the wrapper against the official Gym-TORAX environment."""

import numpy as np
import pytest

from rl_tokamak.env import IP_RAMP, IP_START, EnvConfig, RampupEnv, benchmark_components


def test_spaces(short_env):
    assert short_env.action_space.shape == (3,)
    assert short_env.observation_space.shape == (60,)
    assert short_env.horizon == 151  # gymtorax 1.0.0: t = 0 .. 150 s


def test_reset_and_step(short_env):
    x, info = short_env.reset()
    assert short_env.observation_space.contains(x)
    x2, r, term, trunc, info = short_env.step(np.zeros(3, dtype=np.float32))
    assert np.all(np.isfinite(x2))
    assert {"benchmark_reward", "failed", "r_q_min", "r_q95"} <= set(info)
    assert not info["failed"]
    comps = sum(info[k] for k in ("r_fusion_gain", "r_h98", "r_q_min", "r_q95"))
    assert info["benchmark_reward"] == pytest.approx(comps, rel=1e-9)
    assert r == pytest.approx(100 * info["benchmark_reward"])  # default reward_mode="scaled"


def test_episode_truncates(short_env):
    short_env.reset()
    done, n = False, 0
    while not done:
        _, _, term, trunc, info = short_env.step(short_env.action_space.sample())
        done, n = term or trunc, n + 1
    assert n == 8 and "benchmark_return" in info and len(info["episode_log"]) == 8


def test_delta_ip_respects_ramp_limit(short_env):
    short_env.reset()
    a = short_env.to_gymtorax_action(np.array([1.0, -1.0, -1.0]))
    assert a["Ip"][0] == pytest.approx(IP_START + IP_RAMP)
    assert a["NBI"][0] == 0.0 and a["ECRH"][0] == 0.0
    back = short_env.from_gymtorax_action(a, IP_START)
    np.testing.assert_allclose(back, [1.0, -1.0, -1.0], atol=1e-6)


def test_reward_modes():
    env = RampupEnv.__new__(RampupEnv)  # training_reward only needs cfg
    env.cfg = EnvConfig(reward_mode="benchmark")
    assert env.training_reward(-1000.0, None) == -1000.0
    env.cfg = EnvConfig(reward_mode="scaled")
    assert env.training_reward(-1000.0, None) == -100.0
    obs = {"scalars": {"q_min": np.array([0.5])}, "profiles": {}}
    env.cfg = EnvConfig(reward_mode="qmin_safe", qmin_weight=1.0)
    assert env.training_reward(0.01, obs) == pytest.approx(1.0 - 0.5)


def test_components_formula():
    obs = {"scalars": {"Q_fusion": [10.0], "H98": [1.2], "q_min": [0.5], "q95": [4.0]},
           "profiles": {"T_e": [12.0], "T_i": [11.0]}}
    c = benchmark_components(obs)
    assert c["r_fusion_gain"] == pytest.approx(1 / 50)
    assert c["r_h98"] == pytest.approx(1 / 50)
    assert c["r_q_min"] == pytest.approx(0.5 / 150)
    assert c["r_q95"] == pytest.approx(1 / 150)
