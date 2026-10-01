"""Residual RL on top of the paper's PI controller.

The agent does not choose the action; it chooses a *correction* to what the PI controller would do:

    a = clip(a_PI(s) + scale * u,  -1, 1),    u = pi_theta(s) in [-1, 1]^3

in the wrapped env's normalised action space ([I_p ramp rate, P_NBI, P_ECRH]). With u = 0 the episode is
exactly the PI episode (benchmark 3.79, audited 3.50), so learning starts from the published bar instead of
from the "hold 3 MA, no heating" basin that model-free agents fall into here.

The PI controller keeps its state (step counter, integral of the j(0) error). Two things make the
problem Markov for the agent:

* the PI's rate limit is taken from the *applied* current after every step (bumpless transfer), so the only
  hidden PI state is the integral;
* the observation gets four extra features after the usual ones: the PI's proposed action for this step
  (3 values in [-1, 1]) and ki * integral / 10 MA (the integral's share of the I_p request, in units of 10 MA).

The per-step log gains ``base_*`` (the PI proposal) and ``res_*`` (the agent's correction) columns, so the
episode CSV shows which part of each knob movement came from PI and which from the learned policy.
"""

from __future__ import annotations

import gymnasium as gym
import numpy as np

from .controllers import HEAT_ON_STEP, RAMP_END, PIController
from .env import EnvConfig, RampupEnv

N_EXTRA = 4  # base action (3) + scaled integral (1)
DEFAULT_SCALE = (1.0, 2.0, 2.0)  # I_p rate: +-0.2 MA/s; powers: the full range is reachable from either PI level


class ResidualEnv(RampupEnv):
    def __init__(self, config: EnvConfig | None = None, inner: gym.Env | None = None):
        super().__init__(config, inner)
        spec = self.cfg.extra.get("residual") or {}
        assert spec.get("base", "pi") == "pi", spec
        assert self.cfg.ip_mode == "delta" and self.cfg.action_set == "powers", "residual mode needs delta I_p and 3 actions"
        self.scale = np.asarray(spec.get("scale", DEFAULT_SCALE), dtype=np.float64)
        self.pi = PIController(**spec.get("pi_gains", {}))
        self._base = np.zeros(3)
        dim = self.observation_space.shape[0] + N_EXTRA
        high = self.observation_space.high[0]
        self.observation_space = gym.spaces.Box(-high, high, shape=(dim,), dtype=np.float32)

    # ----------------------------------------------------------------- PI side
    def _update_base(self, obs: dict) -> None:
        """Ask PI for its action at the current state (advances its step counter and integral)."""
        self.pi.ip = self._ip  # rate-limit against the applied current, not PI's own last request
        act = self.pi.act(obs)
        self._base = self.from_gymtorax_action(act, self._ip).astype(np.float64)

    def _extras(self) -> np.ndarray:
        return np.array([*self._base, self.pi.ki * self.pi.integral / 1e7], dtype=np.float32)

    def _features(self, obs: dict) -> np.ndarray:
        return np.concatenate([super()._features(obs), self._extras()]).astype(np.float32)

    def total_action(self, u: np.ndarray) -> np.ndarray:
        u = np.clip(np.asarray(u, dtype=np.float64), -1.0, 1.0)
        return np.clip(self._base + self.scale * u, -1.0, 1.0)

    # ------------------------------------------------------------------ gym API
    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed, options=options)
        self.pi.reset()
        self._update_base(self._last_obs)
        return self._features(self._last_obs), {"t": 0.0}

    def step(self, action):
        u = np.clip(np.asarray(action, dtype=np.float64), -1.0, 1.0)
        base = self._base.copy()
        total = self.total_action(u)
        obs, reward, terminated, truncated, info = self.step_gymtorax(self.to_gymtorax_action(total))
        if self._episode:
            self._episode[-1].update({"base_ip": base[0], "base_nbi": base[1], "base_ecrh": base[2],
                                      "res_ip": u[0], "res_nbi": u[1], "res_ecrh": u[2]})
        if not info.get("failed", False):
            self._update_base(obs)
        return self._features(obs), float(reward), bool(terminated), bool(truncated), info


class ResidualAdvance:
    """Exact parts of the PI features for MBPO's model rollouts (used after ``TimeAdvance``).

    The heating proposal is a pure function of the step index (off before step 99, full from it) and after
    step 100 PI holds the current, so its I_p proposal is 0. Only the I_p proposal during the ramp and the
    integral are left to the learned model.
    """

    def __init__(self, env: ResidualEnv, time_advance):
        self.t = time_advance
        self.i0 = env.observation_space.shape[0] - N_EXTRA

    def __call__(self, x: np.ndarray, x_next: np.ndarray) -> np.ndarray:
        done = self.t(x, x_next)
        step = np.rint((x_next[:, 0] * self.t.sd + self.t.mu) * (self.t.h - 1))
        heat = np.where(step >= HEAT_ON_STEP, 1.0, -1.0)
        i = self.i0
        x_next[:, i] = np.where(step >= RAMP_END, 0.0, np.clip(x_next[:, i], -1.0, 1.0))
        x_next[:, i + 1] = heat
        x_next[:, i + 2] = heat
        return done
