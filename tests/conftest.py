import os
import sys
from importlib.metadata import version
from pathlib import Path

import pytest

os.environ.setdefault("JAX_PLATFORMS", "cpu")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
PAPER_STACK = version("gymtorax").startswith("1.0.")  # pip install -e .[dev]; .[dev-physics] gives gymtorax 1.1


def pytest_collection_modifyitems(config, items):
    """Each simulator stack runs its own tests: test_physics*.py on gymtorax 1.1, everything else on 1.0.0."""
    for item in items:
        physics_test = Path(str(item.fspath)).name.startswith("test_physics")
        if physics_test and PAPER_STACK:
            item.add_marker(pytest.mark.skip(reason="physics environment: needs pip install -e .[dev-physics]"))
        elif not physics_test and not PAPER_STACK:
            item.add_marker(pytest.mark.skip(reason="benchmark (gymtorax 1.0.0): needs pip install -e .[dev]"))


@pytest.fixture(scope="session")
def short_env():
    """One truncated environment (8 steps) shared by the fast tests; building it compiles TORAX once."""
    from rl_tokamak.env import EnvConfig, RampupEnv

    env = RampupEnv(EnvConfig(max_steps=8))
    yield env
    env.close()


@pytest.fixture(scope="session")
def tiny_dataset(short_env, tmp_path_factory):
    import numpy as np

    from rl_tokamak.controllers import PIController
    from rl_tokamak.evaluate import run_controller
    from rl_tokamak.stats import NoisyController

    parts = [run_controller(short_env, NoisyController(PIController(), 0.2, seed=s), collect=True)["transitions"]
             for s in range(3)]
    data = {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
    path = tmp_path_factory.mktemp("offline") / "tiny.npz"
    np.savez(path, **data)
    return str(path)
