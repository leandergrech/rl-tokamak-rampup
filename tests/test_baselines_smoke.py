"""Every baseline trains for a few steps and writes a loadable, re-evaluable run directory."""

import json

import pytest

import train  # scripts/train.py


def _run(tmp_path, *args, minutes="0.05"):
    out = tmp_path / "run"
    res = train.main(["--out", str(out), "--max-steps", "8", "--minutes", minutes, *args])
    assert (out / "config.json").exists() and (out / "result.json").exists()
    assert res["benchmark_return"] > 0 and not res["failed"]
    return json.loads((out / "config.json").read_text())


@pytest.mark.parametrize("algo", ["ppo", "sac"])
def test_sb3(tmp_path, algo):
    cfg = _run(tmp_path, "--algo", algo, "--n-envs", "1")
    assert cfg["env_steps"] > 0


def test_mbpo(tmp_path):
    cfg = _run(tmp_path, "--algo", "mbpo", "--real-episodes", "2", "--utd", "1", minutes="10")
    assert cfg["env_steps"] == 16


@pytest.mark.parametrize("algo", ["ppo", "mbpo"])
def test_residual_on_pi(tmp_path, algo):
    extra = ["--n-envs", "1", "--norm-reward"] if algo == "ppo" else ["--real-episodes", "2", "--utd", "1"]
    cfg = _run(tmp_path, "--algo", algo, "--residual", "pi", "--reward-mode", "patched", *extra,
               minutes="10" if algo == "mbpo" else "0.05")
    assert cfg["env_config"]["extra"]["residual"]["scale"] == [1.0, 2.0, 2.0]
    if algo == "mbpo":
        assert cfg["algo_config"]["residual_init"] and cfg["algo_config"]["failure_rule"]


@pytest.mark.parametrize("algo", ["bc", "td3bc", "mopo"])
def test_offline(tmp_path, tiny_dataset, algo):
    cfg = _run(tmp_path, "--algo", algo, "--dataset", tiny_dataset, "--steps", "20")
    assert cfg["dataset_transitions"] == 24


def test_cem_schedule_controller(short_env):
    from rl_tokamak.agents.cem import ScheduleController
    from rl_tokamak.evaluate import run_controller

    r = run_controller(short_env, ScheduleController([0.5] * 9))
    assert r["steps"] == 8 and not r["failed"]
