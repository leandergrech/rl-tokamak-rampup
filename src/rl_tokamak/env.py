"""Thin RL-facing wrapper around the official Gym-TORAX ITER hybrid ramp-up environment.

The physics, the benchmark reward and the failure rule all stay inside
``gymtorax.IterHybridEnv``. This module only changes the *interface*:

* the nested ``Dict`` observation becomes a flat, normalised ``float32`` vector
  built from a named observation set (``scalars``, ``profiles`` or ``full``);
* the nested ``Dict`` action becomes a ``Box(-1, 1)`` vector, with the plasma
  current either commanded as a rate (``delta``, the default: one unit equals the
  0.2 MA/s ramp limit) or as an absolute set-point (``absolute``);
* the training reward can be rescaled or shaped, while the unmodified benchmark
  reward is always passed through in ``info["benchmark_reward"]`` so evaluation
  reports the benchmark's own score.

Nothing here edits TORAX or Gym-TORAX code; see docs/01-problem.md for the MDP.
"""

from __future__ import annotations

import csv
import json
import os
from dataclasses import asdict, dataclass, field
from importlib import resources
from pathlib import Path
from typing import Any

import gymnasium as gym
import numpy as np

# Reference actuator settings from the Gym-TORAX open-loop policy (IterHybridAgent).
NBI_LOC, NBI_WIDTH = 0.25, 0.25
ECRH_LOC, ECRH_WIDTH = 0.35, 0.05
IP_START = 3.0e6  # A, initial plasma current in the ITER hybrid config
IP_RAMP = 0.2e6  # A per 1 s action step, Gym-TORAX ramp-rate limit
FAILURE_REWARD = -1000.0  # what Gym-TORAX returns on solver failure / out-of-bounds state

# Scalars used by every compact observation set. Units as in TORAX output.
SCALAR_KEYS = (
    "q95",
    "q_min",
    "rho_q_min",
    "beta_N",
    "H98",
    "Q_fusion",
    "li3",
    "fgw_n_e_line_avg",
    "n_e_line_avg",
    "T_e_volume_avg",
    "T_i_volume_avg",
    "W_thermal_total",
    "tau_E",
    "v_loop_lcfs",
    "I_bootstrap",
    "P_ohmic_e",
    "P_SOL_total",
    "P_LH",
)
# Profiles sampled on a coarse radial grid for the ``profiles`` set.
PROFILE_KEYS = ("T_e", "T_i", "n_e", "q", "j_total")
PROFILE_IDX = (0, 4, 8, 13, 17, 21, 25)  # cell-grid indices, rho_norm ~ 0 .. 0.96

OBS_SETS = ("scalars", "profiles", "full")
ACTION_SETS = ("powers", "full")
REWARD_MODES = ("benchmark", "scaled", "qmin_safe", "patched")


@dataclass
class EnvConfig:
    """Everything that defines the RL-facing interface. Stored with every run."""

    obs_set: str = "profiles"
    action_set: str = "powers"  # "powers": [Ip, P_NBI, P_ECRH]; "full": + deposition loc/width
    ip_mode: str = "delta"  # "delta" (rate command) or "absolute" (set-point)
    ip_min: float = 3.0e6  # A, floor of the current command (= the initial 3 MA; below ~4 MA the bounds file
    # rejects edge q > 100 and Gym-TORAX ends the episode with -1000)
    reward_mode: str = "scaled"
    reward_scale: float = 100.0  # used by "scaled" and "qmin_safe"
    failure_penalty: float = -100.0  # replaces -1000 in the *training* reward (scaled units)
    qmin_weight: float = 1.0  # extra penalty per step and per unit of (1 - q_min)+ in "qmin_safe"
    normalize: bool = True
    clip_obs: float = 10.0
    log_dir: str | None = None  # write one CSV per episode here if set
    max_steps: int | None = None  # truncate episodes early (smoke tests only; the benchmark is 151 steps)
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def gymtorax_version() -> str:
    from importlib.metadata import version

    return version("gymtorax")


def _scalar(d: dict, key: str) -> float:
    return float(np.ravel(d[key])[0])


def extract_features(obs: dict, obs_set: str, t_frac: float, last_action: np.ndarray) -> np.ndarray:
    """Flatten a Gym-TORAX observation dict into a feature vector (un-normalised)."""
    s, p = obs["scalars"], obs["profiles"]
    parts: list[np.ndarray] = [np.array([t_frac], dtype=np.float64), last_action.astype(np.float64)]
    if obs_set == "full":
        for k in sorted(p):
            parts.append(np.ravel(np.asarray(p[k], dtype=np.float64)))
        for k in sorted(s):
            parts.append(np.ravel(np.asarray(s[k], dtype=np.float64)))
        return np.nan_to_num(np.concatenate(parts), nan=0.0, posinf=0.0, neginf=0.0)
    parts.append(np.array([_scalar(s, k) for k in SCALAR_KEYS]))
    parts.append(np.array([p["T_e"][0], p["T_i"][0], p["j_total"][0]], dtype=np.float64))
    if obs_set == "profiles":
        for k in PROFILE_KEYS:
            arr = np.ravel(np.asarray(p[k], dtype=np.float64))
            parts.append(arr[[min(i, len(arr) - 1) for i in PROFILE_IDX]])
    return np.nan_to_num(np.concatenate(parts), nan=0.0, posinf=0.0, neginf=0.0)


def benchmark_components(obs: dict) -> dict[str, float]:
    """Recompute the four Gym-TORAX reward terms (same formulas as IterHybridEnv)."""
    s, p = obs["scalars"], obs["profiles"]
    h_mode = p["T_e"][0] > 10 and p["T_i"][0] > 10
    q = _scalar(s, "Q_fusion")
    h98 = _scalar(s, "H98")
    qmin = _scalar(s, "q_min")
    q95 = _scalar(s, "q95")
    return {
        "r_fusion_gain": (q / 10 if h_mode else 0.0) / 50,
        "r_h98": (min(h98, 1.0) if h_mode else 0.0) / 50,
        "r_q_min": min(qmin, 1.0) / 150,
        "r_q95": min(q95 / 3, 1.0) / 150,
    }


def audited_components(q: float, h98: float, qmin: float, q95: float, te0: float, ti0: float,
                       p_sol: float, p_lh: float) -> dict[str, float]:
    """Benchmark reward with two loopholes closed (this repo's audit, not part of Gym-TORAX).

    * Q is capped at 10 (ITER's design goal), so cutting auxiliary power cannot inflate Q = P_fus/P_aux without bound;
    * the "H-mode" gate additionally requires P_SOL >= P_LH, the L-H threshold power TORAX reports, so a hot core
      under the time-scheduled pedestal no longer counts as H-mode when the heating is off.
    """
    h_mode = te0 > 10 and ti0 > 10 and p_sol >= p_lh
    return {
        "a_fusion_gain": (min(q / 10, 1.0) if h_mode else 0.0) / 50,
        "a_h98": (min(h98, 1.0) if h_mode else 0.0) / 50,
        "a_q_min": min(qmin, 1.0) / 150,
        "a_q95": min(q95 / 3, 1.0) / 150,
    }


def bounds_violations(space: gym.spaces.Dict, obs: dict, limit: int = 3) -> list[str]:
    """Which observation variables left Gym-TORAX's observation space (the -1000 rule), e.g. 'profiles.T_e max 36.2 > 35'."""
    out: list[str] = []
    for group, sub in space.spaces.items():
        for key, box in getattr(sub, "spaces", {}).items():
            v = np.ravel(np.asarray(obs.get(group, {}).get(key, np.nan), dtype=np.float64))
            lo, hi = np.ravel(box.low), np.ravel(box.high)
            if v.size == 0:
                continue
            if not np.all(np.isfinite(v)):
                out.append(f"{group}.{key} not finite")
            elif np.any(v > hi):
                out.append(f"{group}.{key} max {v.max():.4g} > {hi.max():.4g}")
            elif np.any(v < lo):
                out.append(f"{group}.{key} min {v.min():.4g} < {lo.min():.4g}")
            if len(out) >= limit:
                return out
    return out


def audited_reward_from_obs(obs: dict) -> float:
    s, p = obs["scalars"], obs["profiles"]
    return sum(audited_components(_scalar(s, "Q_fusion"), _scalar(s, "H98"), _scalar(s, "q_min"), _scalar(s, "q95"),
                                  float(p["T_e"][0]), float(p["T_i"][0]), _scalar(s, "P_SOL_total"),
                                  _scalar(s, "P_LH")).values())


def _stats_path() -> Path:
    return Path(str(resources.files("rl_tokamak"))) / "obs_stats.json"


def load_obs_stats(obs_set: str) -> tuple[np.ndarray, np.ndarray] | None:
    path = _stats_path()
    if not path.exists():
        return None
    stats = json.loads(path.read_text())
    key = f"{gymtorax_version()}/{obs_set}"
    if key not in stats:
        return None
    return np.array(stats[key]["mean"]), np.array(stats[key]["std"])


class RampupEnv(gym.Env):
    """Flat-vector view of ``gymtorax.IterHybridEnv`` (ITER hybrid ramp-up, 150 s, 1 s steps)."""

    metadata = {"render_modes": []}

    def __init__(self, config: EnvConfig | None = None, inner: gym.Env | None = None):
        self.cfg = config or EnvConfig()
        assert self.cfg.obs_set in OBS_SETS, self.cfg.obs_set
        assert self.cfg.action_set in ACTION_SETS, self.cfg.action_set
        assert self.cfg.reward_mode in REWARD_MODES, self.cfg.reward_mode
        assert self.cfg.ip_mode in ("delta", "absolute"), self.cfg.ip_mode
        if inner is None:
            from gymtorax import IterHybridEnv

            inner = IterHybridEnv(render_mode=None, log_level="critical")
        self.inner = inner
        ispace = inner.action_space.spaces
        self.ip_max = float(ispace["Ip"].high[0])
        self.nbi_max = float(ispace["NBI"].high[0])
        self.ecrh_max = float(ispace["ECRH"].high[0])
        self.horizon = int(round(inner.T / inner.delta_t_a)) + 1  # v1.0: 151 steps, v1.1: 150

        n_act = 3 if self.cfg.action_set == "powers" else 7
        self.action_space = gym.spaces.Box(-1.0, 1.0, shape=(n_act,), dtype=np.float32)
        self._stats = load_obs_stats(self.cfg.obs_set) if self.cfg.normalize else None
        # Build the observation space from one reset (the dimension depends on the TORAX version).
        obs, _ = self.inner.reset()
        self._t = 0
        self._ip = IP_START
        self._applied = np.zeros(3)
        dim = extract_features(obs, self.cfg.obs_set, 0.0, self._applied).shape[0]
        if self._stats is not None and self._stats[0].shape[0] != dim:
            self._stats = None  # stale stats file, fall back to raw features
        high = self.cfg.clip_obs if self._stats is not None else np.inf
        self.observation_space = gym.spaces.Box(-high, high, shape=(dim,), dtype=np.float32)
        self._episode: list[dict[str, float]] = []
        self._episode_idx = 0

    # ----------------------------------------------------------------- helpers
    def _features(self, obs: dict) -> np.ndarray:
        applied = self._applied / np.array([self.ip_max, self.nbi_max, self.ecrh_max])
        x = extract_features(obs, self.cfg.obs_set, self._t / (self.horizon - 1), applied)
        if self._stats is not None:
            mean, std = self._stats
            x = np.clip((x - mean) / std, -self.cfg.clip_obs, self.cfg.clip_obs)
        return np.nan_to_num(x).astype(np.float32)

    def to_gymtorax_action(self, a: np.ndarray) -> dict[str, list[float]]:
        """Map a vector in [-1, 1]^d to the Gym-TORAX action dict (and track the Ip command)."""
        a = np.clip(np.asarray(a, dtype=np.float64), -1.0, 1.0)
        if self.cfg.ip_mode == "delta":
            ip = self._ip + a[0] * IP_RAMP
        else:
            ip = self.cfg.ip_min + (a[0] + 1) / 2 * (self.ip_max - self.cfg.ip_min)
            ip = np.clip(ip, self._ip - IP_RAMP, self._ip + IP_RAMP)
        ip = float(np.clip(ip, self.cfg.ip_min, self.ip_max))
        p_nbi = float((a[1] + 1) / 2 * self.nbi_max)
        p_ecrh = float((a[2] + 1) / 2 * self.ecrh_max)
        if self.cfg.action_set == "full":
            nbi = [p_nbi, (a[3] + 1) / 2, 0.01 + (a[4] + 1) / 2 * 0.99]
            ecrh = [p_ecrh, (a[5] + 1) / 2, 0.01 + (a[6] + 1) / 2 * 0.99]
        else:
            nbi = [p_nbi, NBI_LOC, NBI_WIDTH]
            ecrh = [p_ecrh, ECRH_LOC, ECRH_WIDTH]
        return {"Ip": [ip], "NBI": nbi, "ECRH": ecrh}

    def from_gymtorax_action(self, action: dict, ip_prev: float) -> np.ndarray:
        """Inverse map, used to express PI / open-loop actions in this env's action space."""
        ip = float(np.ravel(action["Ip"])[0])
        if self.cfg.ip_mode == "delta":
            a_ip = (ip - ip_prev) / IP_RAMP
        else:
            a_ip = 2 * (ip - self.cfg.ip_min) / (self.ip_max - self.cfg.ip_min) - 1
        nbi, ecrh = np.ravel(action["NBI"]), np.ravel(action["ECRH"])
        a = [a_ip, 2 * nbi[0] / self.nbi_max - 1, 2 * ecrh[0] / self.ecrh_max - 1]
        if self.cfg.action_set == "full":
            a += [2 * nbi[1] - 1, 2 * (nbi[2] - 0.01) / 0.99 - 1, 2 * ecrh[1] - 1, 2 * (ecrh[2] - 0.01) / 0.99 - 1]
        return np.clip(np.array(a, dtype=np.float32), -1, 1)

    def training_reward(self, r_bench: float, obs: dict | None) -> float:
        cfg = self.cfg
        if cfg.reward_mode == "benchmark":
            return r_bench
        if r_bench == FAILURE_REWARD or obs is None:
            return cfg.failure_penalty
        if cfg.reward_mode == "patched":
            return cfg.reward_scale * audited_reward_from_obs(obs)
        r = cfg.reward_scale * r_bench
        if cfg.reward_mode == "qmin_safe":
            qmin = _scalar(obs["scalars"], "q_min")
            r -= cfg.qmin_weight * max(0.0, 1.0 - qmin)
        return r

    # --------------------------------------------------------------- gym API
    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        obs, info = self.inner.reset(seed=seed)
        self._t, self._ip, self._applied = 0, IP_START, np.array([IP_START, 0.0, 0.0])
        self._last_obs = obs
        self._episode = []
        self._bench_return = 0.0
        return self._features(obs), {"t": 0.0}

    def step_gymtorax(self, action: dict):
        """Step with a raw Gym-TORAX action dict (used by the PI / open-loop baselines)."""
        obs, r_bench, terminated, truncated, info = self.inner.step(action)
        if self.cfg.max_steps is not None and self._t + 1 >= self.cfg.max_steps:
            truncated = True
        applied = self.inner.torax_app.config.get_current_action_values() if hasattr(self.inner, "torax_app") else action
        self._ip = float(np.ravel(applied["Ip"])[0])
        self._applied = np.array([self._ip, float(np.ravel(applied["NBI"])[0]), float(np.ravel(applied["ECRH"])[0])])
        self._t += 1
        failed = bool(r_bench == FAILURE_REWARD)
        self._bench_return += r_bench
        comps = benchmark_components(obs) if not failed else {}
        row = {"t": float(self._t), "Ip_MA": self._ip / 1e6, "P_NBI_MW": self._applied[1] / 1e6,
               "P_ECRH_MW": self._applied[2] / 1e6, "r_bench": r_bench, **comps}
        if not failed:
            s, p = obs["scalars"], obs["profiles"]
            row.update({k: _scalar(s, k) for k in ("Q_fusion", "H98", "q_min", "q95", "beta_N", "li3", "fgw_n_e_line_avg", "P_LH", "P_SOL_total",
                                          "P_alpha_total", "P_ohmic_e", "P_aux_total")})
            row.update({"T_e0": float(p["T_e"][0]), "T_i0": float(p["T_i"][0]), "j0_MA_m2": float(p["j_total"][0]) / 1e6})
        else:
            try:
                row["fail_reason"] = "; ".join(bounds_violations(self.inner.observation_space, obs)) or "solver"
            except Exception:  # diagnostics only; never let them break an episode
                row["fail_reason"] = "unknown"
        self._episode.append(row)
        reward = self.training_reward(r_bench, None if failed else obs)
        info = dict(info)
        info.update({"benchmark_reward": r_bench, "failed": failed, "t": float(self._t), **comps})
        done = terminated or truncated
        if done:
            info["benchmark_return"] = self._bench_return
            info["episode_log"] = self._episode
            self._write_log()
        self._last_obs = obs
        return obs, reward, terminated, truncated, info

    def step(self, action):
        gt_action = self.to_gymtorax_action(action)
        obs, reward, terminated, truncated, info = self.step_gymtorax(gt_action)
        return self._features(obs), float(reward), bool(terminated), bool(truncated), info

    def _write_log(self) -> None:
        if not self.cfg.log_dir or not self._episode:
            return
        os.makedirs(self.cfg.log_dir, exist_ok=True)
        keys = sorted({k for row in self._episode for k in row})
        path = Path(self.cfg.log_dir) / f"episode_{self._episode_idx:05d}.csv"
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(self._episode)
        self._episode_idx += 1

    def close(self):
        self.inner.close()


def make_env(config: EnvConfig | dict | None = None) -> RampupEnv:
    """Build the env a config describes: ``extra["residual"]`` selects the residual-on-PI variant."""
    if isinstance(config, dict):
        config = EnvConfig(**config)
    if config is not None and config.extra.get("residual"):
        from .residual import ResidualEnv

        return ResidualEnv(config)
    return RampupEnv(config)


def set_single_thread() -> None:
    """Keep XLA / torch to one thread per process so vectorised envs scale across cores."""
    os.environ.setdefault("XLA_FLAGS", "--xla_cpu_multi_thread_eigen=false intra_op_parallelism_threads=1")
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("MKL_NUM_THREADS", "1")
    os.environ.setdefault("JAX_PLATFORMS", "cpu")
