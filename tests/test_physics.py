"""The physics environment (rl_tokamak.physics): pedestal from P_SOL vs P_LH, density control, limits, reward.

Runs only on the physics stack (pip install -e .[dev-physics]: gymtorax 1.1.1 / TORAX 1.4.3); see conftest.py.
"""

import numpy as np
import pytest

from rl_tokamak.physics import H_MODE, L_MODE, PHYSICS_PI, PhysicsConfig, limit_violation, physics_components


def _obs(**scalars):
    base = {"Q_fusion": 5.0, "H98": 1.1, "q_min": 0.8, "q95": 4.0, "P_heat_total": 90e6, "P_LH": 60e6,
            "fgw_n_e_line_avg": 0.85, "li3": 0.9}
    base.update(scalars)
    return {"scalars": {k: np.array([v]) for k, v in base.items()}, "profiles": {}}


def test_reward_terms():
    cfg = PhysicsConfig()
    r = physics_components(_obs(), H_MODE, cfg)
    assert r["p_fusion_gain"] == pytest.approx(0.5 / 50) and r["p_h98"] == pytest.approx(1 / 50)
    assert r["p_q_min"] == pytest.approx(0.8 / 150) and r["p_q95"] == pytest.approx(1 / 150)
    assert physics_components(_obs(Q_fusion=300.0), H_MODE, cfg)["p_fusion_gain"] == pytest.approx(1 / 50)  # Q capped
    assert physics_components(_obs(), L_MODE, cfg)["p_h98"] == 0.0  # TORAX's confinement state decides H-mode
    assert physics_components(_obs(P_heat_total=1.1 * 60e6), H_MODE, cfg)["p_h98"] == 0.0  # below the 1.2 margin
    assert physics_components(_obs(P_heat_total=1.2 * 60e6), H_MODE, cfg)["p_h98"] > 0.0


def test_limits():
    cfg = PhysicsConfig()
    assert limit_violation(_obs(), 50, cfg) is None
    assert limit_violation(_obs(fgw_n_e_line_avg=1.01), 120, cfg).startswith("f_GW")
    assert limit_violation(_obs(li3=0.64), 50, cfg).startswith("l_i(3)")
    assert limit_violation(_obs(li3=1.21), 100, cfg).startswith("l_i(3)")
    assert limit_violation(_obs(li3=1.3), 101, cfg) is None  # the l_i window applies during the ramp-up only


@pytest.fixture(scope="module")
def phys_env():
    from rl_tokamak.env import EnvConfig, RampupEnv

    env = RampupEnv(EnvConfig(extra={"physics": {}}))
    yield env
    env.close()


def _episode(env, controller):
    from rl_tokamak.evaluate import run_controller

    return run_controller(env, controller)


def test_open_loop_episode(phys_env):
    """The reference schedule stays within the limits; the pedestal forms when the heating switches on."""
    from rl_tokamak.controllers import OpenLoopController

    ep = _episode(phys_env, OpenLoopController())
    log = ep["log"]
    assert not ep["failed"] and len(log) == 150
    mode = [r["confinement_mode"] for r in log]
    assert set(mode[:99]) == {L_MODE}  # no heating, no pedestal
    assert mode[100] in (H_MODE, 2) and set(mode[105:]) == {H_MODE}
    assert all(0.55 < r["fgw_n_e_line_avg"] < 0.65 for r in log[20:95])  # L-mode density held by gas puffing
    assert all(0.8 < r["fgw_n_e_line_avg"] < 0.9 for r in log[115:])  # H-mode density held by pedestal fuelling
    assert ep["benchmark_return"] == pytest.approx(3.0889, abs=2e-3)


def test_heating_cut_loses_h_mode(phys_env):
    """Switching the heating off after the L-H transition brings the plasma back to L-mode (IterHybrid-v0 does not)."""
    from rl_tokamak.controllers import OpenLoopController

    class Cut(OpenLoopController):
        def act(self, obs):
            k, a = self.step_idx, super().act(obs)
            if k >= 105:
                a["NBI"][0], a["ECRH"][0] = 0.0, 0.0
            return a

    ep = _episode(phys_env, Cut())
    assert [r["confinement_mode"] for r in ep["log"][110:]] == [L_MODE] * 40
    assert ep["benchmark_return"] < 2.0


def test_pi_retuned_and_paper_gains(phys_env):
    from rl_tokamak.controllers import PAPER_KI, PAPER_KP, PIController

    ep = _episode(phys_env, PIController(**PHYSICS_PI))
    assert not ep["failed"] and ep["benchmark_return"] == pytest.approx(3.2418, abs=2e-3)
    paper = _episode(phys_env, PIController(kp=PAPER_KP, ki=PAPER_KI))
    assert paper["failed"] and paper["log"][-1]["fail_reason"].startswith("l_i(3)")


def test_physics_features_and_mbpo_rules(phys_env):
    """The observation encodes TORAX's confinement mode; MBPO's known reward reproduces the env's reward, and its
    confinement rule reproduces the mode from the previous step (through the L-H transition and in H-mode)."""
    from rl_tokamak.agents.mbpo import ConfinementAdvance, FailureRule, KnownReward, TimeAdvance
    from rl_tokamak.controllers import OpenLoopController
    from rl_tokamak.env import SCALAR_KEYS

    env, c = phys_env, OpenLoopController()
    known, rule = KnownReward(env), FailureRule(env)
    adv = ConfinementAdvance(env, TimeAdvance(env))
    assert known.active and rule.active and rule.physics is not None
    env.reset()
    c.reset()
    obs, modes = env._last_obs, []
    x = env._features(obs)
    for _ in range(108):
        obs, r, term, trunc, info = env.step_gymtorax(c.act(obs))
        x_prev, x = x, env._features(obs)
        mode = info["confinement_mode"]
        modes.append(mode)
        flags = env._raw(obs)[env.physics_idx:env.physics_idx + 2]
        assert flags.tolist() == [float(mode in (1, 2)), float(mode in (2, 3))]
        assert known(x[None])[0] == pytest.approx(r, abs=1e-4)
        assert not rule(x[None])[0]
        pred = x.copy()[None]
        pred[:, env.physics_idx:env.physics_idx + 2] = 0.0  # forget the true flags; the rule must restore them
        adv(x_prev[None], pred)
        np.testing.assert_allclose(pred[0, env.physics_idx:env.physics_idx + 2], x[env.physics_idx:env.physics_idx + 2],
                                   atol=1e-6)
    assert 2 in modes and H_MODE in modes  # the window covers the L-H transition
    hot = x.copy()
    i = 1 + 3 + SCALAR_KEYS.index("fgw_n_e_line_avg")
    hot[i] = (1.05 - env._stats[0][i]) / env._stats[1][i]
    assert rule(hot[None])[0]


@pytest.mark.parametrize("algo", ["ppo", "mbpo"])
def test_residual_training_smoke(tmp_path, algo):
    import json

    from train import main

    extra = ["--n-envs", "1", "--norm-reward"] if algo == "ppo" else ["--real-episodes", "2", "--utd", "1"]
    main(["--algo", algo, "--out", str(tmp_path / algo), "--residual", "pi", "--physics", *extra,
          "--minutes", "10" if algo == "mbpo" else "0.05", "--max-steps", "6"])
    cfg = json.loads((tmp_path / algo / "config.json").read_text())
    assert cfg["env_config"]["extra"]["physics"] == {}
    assert cfg["env_config"]["extra"]["residual"]["pi_gains"] == PHYSICS_PI
