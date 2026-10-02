"""A physics-consistent version of the Gym-TORAX ITER hybrid ramp-up (gymtorax >= 1.1, TORAX >= 1.4).

``IterHybridPhysicsEnv`` keeps IterHybrid-v0's machine, sources, transport, actions (I_p, NBI, ECRH) and
observations, and changes three things. The reasons and sources are in docs/04b-physics-env.md.

1. **Pedestal.** TORAX's formation model replaces the time schedule: an L-H transition starts when the
   power crossing the separatrix exceeds the L-H threshold (Martin 2008 scaling, as TORAX computes it), the
   pedestal top ramps to its H-mode values over ``transition_time_width``, and the plasma returns to L-mode
   when that power falls below ``P_LH_hysteresis_factor`` times the threshold. In L-mode there is no
   pedestal; the edge follows the transport model.
2. **Density.** IterHybrid-v0 has no particle source: its density is held by the prescribed pedestal. Here a
   plant-level density controller (the machine's own, not the agent's) tracks a line-averaged Greenwald
   fraction reference: gas puffing in L-mode, the pedestal-top density (pellet fuelling) in H-mode.
3. **Limits and reward.** The episode ends with Gym-TORAX's failure value (-1000) when the line-averaged
   density exceeds the Greenwald limit, or when the internal inductance l_i(3) leaves [0.65, 1.2] during the
   ramp-up. The reward is IterHybrid-v0's with Q capped at 10 and the two H-mode terms paid only while
   TORAX's confinement state is H-mode with P_SOL >= 1.2 P_LH.
"""

from __future__ import annotations

import copy
from dataclasses import asdict, dataclass

import numpy as np

FAILURE_REWARD = -1000.0
L_MODE, H_MODE, TO_H, TO_L = 0, 1, 2, 3  # TORAX ConfinementMode
# The paper's PI structure re-tuned on this environment (scripts/tune_pi.py, data/physics/results/pi_tuning.json):
# the paper's gains (0.700, 34.257, j(0) target ending at 2.0 MA/m^2) break the l_i window at t = 9 s.
PHYSICS_PI = {"kp": 0.1, "ki": 0.3, "j_end": 3.75e6}


@dataclass
class PhysicsConfig:
    """Everything that differs from IterHybrid-v0. Stored with every run (EnvConfig.extra["physics"])."""

    # pedestal formation (TORAX pedestal model "set_T_ped_n_ped" with use_formation_model_with_adaptive_source)
    scaling: str = "martin_scaling"  # or "delabie_scaling"
    P_LH_prefactor: float = 1.0
    hysteresis: float = 0.8  # H-L back transition when P_SOL < hysteresis * P_LH (TORAX default)
    transition_s: float = 0.5  # duration of the L-H and H-L ramps of the pedestal top
    T_ped_H: float = 3.0  # keV, H-mode pedestal-top temperature (IterHybrid-v0's value after 105 s)
    rho_ped: float = 0.95
    # density control (plant level): line-averaged Greenwald fraction references
    fgw_ref_L: float = 0.6  # about IterHybrid-v0's L-mode line-averaged density
    fgw_ref_H: float = 0.85  # ITER's operating density
    puff_max: float = 2.0e23  # particles/s
    puff_decay: float = 0.1  # normalised radius over which puffed gas is ionised
    puff_gain: float = 2.0e23  # particles/s per unit of Greenwald-fraction error (integral, per second)
    n_ped_init: float = 0.6  # pedestal-top density target at the first L-H transition, in units of n_GW
    n_ped_min: float = 0.3
    n_ped_max: float = 0.85  # IterHybrid-v0's pedestal density
    n_ped_gain: float = 0.5  # pedestal-density change per unit of Greenwald-fraction error per second
    # limits (the episode ends with FAILURE_REWARD)
    fgw_max: float = 1.0  # Greenwald density limit, line-averaged
    li_min: float = 0.65  # internal inductance l_i(3) window during the ramp-up (lowest values obtained, Sips 2015)
    li_max: float = 1.2  # where ITER's vertical control is at risk (Humphreys 2008; design basis assumed 1.0)
    li_until_s: float = 100.0
    # reward
    q_cap: float = 10.0
    h_margin: float = 1.2  # H-mode terms need P_SOL >= h_margin * P_LH

    def to_dict(self) -> dict:
        return asdict(self)


def _scalar(d: dict, key: str) -> float:
    return float(np.ravel(d[key])[-1])


def physics_components(obs: dict, confinement: int, cfg: PhysicsConfig) -> dict[str, float]:
    """The four reward terms of the physics environment (same weights as IterHybrid-v0)."""
    s = obs["scalars"]
    h_mode = confinement == H_MODE and _scalar(s, "P_heat_total") >= cfg.h_margin * _scalar(s, "P_LH")
    q = _scalar(s, "Q_fusion")
    return {
        "p_fusion_gain": (min(q / cfg.q_cap, 1.0) if h_mode else 0.0) / 50,
        "p_h98": (min(_scalar(s, "H98"), 1.0) if h_mode else 0.0) / 50,
        "p_q_min": min(_scalar(s, "q_min"), 1.0) / 150,
        "p_q95": min(_scalar(s, "q95") / 3, 1.0) / 150,
    }


def limit_violation(obs: dict, t: float, cfg: PhysicsConfig) -> str | None:
    """Which operating limit the state breaks, if any (e.g. 'f_GW 1.02 > 1')."""
    s = obs["scalars"]
    fgw = _scalar(s, "fgw_n_e_line_avg")
    if fgw > cfg.fgw_max:
        return f"f_GW {fgw:.3f} > {cfg.fgw_max:g}"
    li = _scalar(s, "li3")
    if t <= cfg.li_until_s and not cfg.li_min <= li <= cfg.li_max:
        return f"l_i(3) {li:.3f} outside [{cfg.li_min:g}, {cfg.li_max:g}] at t = {t:g} s"
    return None


def _actions():
    from gymtorax.action_handler import Action

    class PedestalDensityAction(Action):
        """Pedestal-top electron density in units of the Greenwald density (pellet fuelling of the pedestal)."""

        name = "PedestalDensity"
        dimension = 1
        default_min = [0.0]
        default_max = [1.5]
        default_ramp_rate = [None]
        config_mapping = {("pedestal", "n_e_ped"): (0, 1)}
        state_var = {}

    return PedestalDensityAction


def make_physics_env(cfg: PhysicsConfig | dict | None = None, **kwargs):
    """Build ``IterHybridPhysicsEnv`` (imported lazily: it needs gymtorax >= 1.1)."""
    from gymtorax import IterHybridEnv
    from gymtorax.action_handler import GasPuffAction

    PedestalDensityAction = _actions()
    pcfg = PhysicsConfig(**cfg) if isinstance(cfg, dict) else (cfg or PhysicsConfig())

    class IterHybridPhysicsEnv(IterHybridEnv):
        physics = pcfg

        def _get_torax_config(self):
            c = copy.deepcopy(super()._get_torax_config())
            p = self.physics
            c["config"]["pedestal"] = {
                "model_name": "set_T_ped_n_ped",
                "set_pedestal": True,
                "use_formation_model_with_adaptive_source": True,
                "formation_model": {"model_name": p.scaling, "P_LH_prefactor": p.P_LH_prefactor},
                "P_LH_hysteresis_factor": p.hysteresis,
                "transition_time_width": p.transition_s,
                "T_i_ped": p.T_ped_H,
                "T_e_ped": p.T_ped_H,
                "n_e_ped_is_fGW": True,
                "n_e_ped": p.n_ped_init,
                "rho_norm_ped_top": p.rho_ped,
            }
            c["config"]["sources"]["gas_puff"] = {"S_total": 0.0, "puff_decay_length": p.puff_decay}
            return c

        def _define_action_space(self):
            p = self.physics
            return super()._define_action_space() + [
                GasPuffAction(min=[0.0, p.puff_decay], max=[p.puff_max, p.puff_decay]),
                PedestalDensityAction(min=[p.n_ped_min], max=[p.n_ped_max]),
            ]

        # ------------------------------------------------------------------ plant-level density control
        def confinement_mode(self) -> int:
            st = getattr(self.torax_app.current_sim_state, "pedestal_transition_state", None)
            return int(np.asarray(st.confinement_mode)) if st is not None else L_MODE

        def _density_commands(self) -> tuple[float, float]:
            p, s = self.physics, self.observation["scalars"]
            fgw = _scalar(s, "fgw_n_e_line_avg")
            mode = self.confinement_mode()
            ref = p.fgw_ref_L if mode == L_MODE else p.fgw_ref_H
            err = ref - fgw
            self._puff = float(np.clip(self._puff + p.puff_gain * err * self.delta_t_a, 0.0, p.puff_max))
            if mode != L_MODE:  # the pedestal density only acts while a pedestal exists
                self._n_ped = float(np.clip(self._n_ped + p.n_ped_gain * err * self.delta_t_a,
                                            p.n_ped_min, p.n_ped_max))
            return self._puff, self._n_ped

        def reset(self, *, seed=None, options=None):
            self._puff, self._n_ped = 0.0, self.physics.n_ped_init
            self.last_limit = None
            return super().reset(seed=seed, options=options)

        def step(self, action):
            action = {k: np.asarray(v, dtype=float).copy() for k, v in action.items()}
            puff, n_ped = self._density_commands()
            action["GasPuff"] = np.array([puff, self.physics.puff_decay])
            action["PedestalDensity"] = np.array([n_ped])
            t_next = self.current_time + self.delta_t_a
            obs, reward, terminated, truncated, info = super().step(action)
            info["confinement_mode"] = self.confinement_mode()
            info["gas_puff"], info["n_e_ped_fGW"] = puff, n_ped
            if reward != FAILURE_REWARD:
                self.last_limit = limit_violation(obs, t_next, self.physics)
                if self.last_limit is not None:
                    reward, terminated = FAILURE_REWARD, True
                    self.terminated = True
                    info["limit"] = self.last_limit
            return obs, reward, terminated, truncated, info

        def _compute_reward(self, state, next_state, action):
            return sum(physics_components(self.observation, self.confinement_mode(), self.physics).values())

    return IterHybridPhysicsEnv(**{"render_mode": None, "log_level": "critical", **kwargs})
