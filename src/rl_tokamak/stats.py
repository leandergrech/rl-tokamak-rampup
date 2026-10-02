"""Observation normalisation statistics and noisy behaviour policies.

Statistics are computed once from reference rollouts (open-loop, PI, noisy PI,
random) and shipped in ``rl_tokamak/obs_stats.json`` keyed by Gym-TORAX version
and observation set, so every agent sees the same fixed affine normalisation.
"""

from __future__ import annotations

import json

import numpy as np

from .controllers import OpenLoopController, PIController, RandomController
from .env import IP_RAMP, OBS_SETS, EnvConfig, RampupEnv, _stats_path, extract_features, stats_key


class NoisyController:
    """Adds Gaussian noise to a dict-interface controller (Ip in units of the ramp limit, powers in units of max)."""

    def __init__(self, base, sigma: float, seed: int = 0, nbi_max: float = 33e6, ecrh_max: float = 20e6):
        self.base, self.sigma = base, sigma
        self.rng = np.random.default_rng(seed)
        self.nbi_max, self.ecrh_max = nbi_max, ecrh_max

    def reset(self) -> None:
        self.base.reset()

    def act(self, obs: dict) -> dict[str, list[float]]:
        a = self.base.act(obs)
        s = self.sigma
        a["Ip"] = [float(np.clip(a["Ip"][0] + self.rng.normal(0, s * IP_RAMP), 1e6, 15e6))]
        a["NBI"][0] = float(np.clip(a["NBI"][0] + self.rng.normal(0, s * self.nbi_max), 0, self.nbi_max))
        a["ECRH"][0] = float(np.clip(a["ECRH"][0] + self.rng.normal(0, s * self.ecrh_max), 0, self.ecrh_max))
        return a


def _record(env: RampupEnv, controller) -> list[np.ndarray]:
    """Return per-set feature rows for one rollout (un-normalised)."""
    controller.reset()
    env.reset()
    obs = env._last_obs
    rows: dict[str, list[np.ndarray]] = {k: [] for k in OBS_SETS}
    done = False
    while True:
        applied = env._applied / np.array([env.ip_max, env.nbi_max, env.ecrh_max])
        for k in OBS_SETS:
            rows[k].append(extract_features(obs, k, env._t / (env.horizon - 1), applied, env._physics_extra(obs)))
        if done:
            break
        obs, _, term, trunc, info = env.step_gymtorax(controller.act(obs))
        done = term or trunc
        if info["failed"]:
            break
    return rows


def compute_obs_stats(n_random: int = 3, noisy_sigmas=(0.1, 0.3, 0.5), physics: dict | None = None) -> dict:
    """``physics``: PhysicsConfig overrides for the physics environment (its PI uses the re-tuned gains)."""
    env = RampupEnv(EnvConfig(normalize=False, extra={} if physics is None else {"physics": physics}))
    if physics is None:
        pi_kw = {}
    else:
        from .physics import PHYSICS_PI

        pi_kw = PHYSICS_PI
    controllers = [OpenLoopController(), PIController(**pi_kw)]
    controllers += [NoisyController(PIController(**pi_kw), s, seed=i) for i, s in enumerate(noisy_sigmas)]
    controllers += [RandomController(env.inner.action_space, seed=100 + i) for i in range(n_random)]
    rows: dict[str, list[np.ndarray]] = {k: [] for k in OBS_SETS}
    for c in controllers:
        r = _record(env, c)
        for k in OBS_SETS:
            rows[k].extend(r[k])
    out = {}
    for k in OBS_SETS:
        x = np.array(rows[k])
        mean, std = x.mean(0), x.std(0)
        std = np.where(std < 1e-8 + 1e-6 * np.abs(mean), 1.0, std)  # constant features map to (x - mean)
        out[stats_key(k, physics is not None)] = {"mean": mean.tolist(), "std": std.tolist(), "n": int(x.shape[0])}
    env.close()
    return out


def write_obs_stats(stats: dict) -> None:
    path = _stats_path()
    old = json.loads(path.read_text()) if path.exists() else {}
    old.update(stats)
    path.write_text(json.dumps(old))
