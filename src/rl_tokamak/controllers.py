"""Classical reference policies for the ITER hybrid ramp-up, written against the raw Gym-TORAX action dict.

``PIController`` re-implements the PI policy of Mouchamps et al. (arXiv 2510.11283,
Section "Policies"; Gym-TORAX ``agents/pid_agent.py`` and ``examples/pid_optimization.py``):

* the controlled variable is the central current density j_total(rho=0);
* the target rises linearly from 0.6 MA/m^2 at t = 0 to 2.0 MA/m^2 at t = 100 s;
* the output is the plasma-current request Ip = 3 MA + kp*e + ki*integral(e),
  rate-limited to 0.2 MA/s and clipped to [Ip_min, 15 MA], with anti-windup
  (the integral freezes while the output is limited);
* after t = 100 s the last Ip is held;
* NBI (33 MW) and ECRH (20 MW) follow the open-loop schedule: off until step 98,
  on from step 99.

Published gains (Gym-TORAX v1.0 / TORAX 1.0): kp = 0.700, ki = 34.257.
"""

from __future__ import annotations

import numpy as np

from .env import ECRH_LOC, ECRH_WIDTH, IP_RAMP, IP_START, NBI_LOC, NBI_WIDTH

NBI_ON = 33.0e6  # W
ECRH_ON = 20.0e6  # W
HEAT_ON_STEP = 99  # heating switches on at this action index (t = 99 s)
RAMP_END = 100  # s, end of the current ramp-up phase

PAPER_KP, PAPER_KI = 0.700, 34.257


def heating_schedule(step: int) -> tuple[float, float]:
    """Open-loop NBI / ECRH powers used by both the reference and the PI policy."""
    if step >= HEAT_ON_STEP:
        return NBI_ON, ECRH_ON
    return 0.0, 0.0


def j_target(t: float, j_end: float = 2.0e6) -> float:
    """Central current-density target in A/m^2 (0.6 -> j_end MA/m^2 over 100 s; the paper uses 2.0)."""
    return 0.2e6 + 0.4e6 + (j_end - 0.6e6) * t / 100


class PIController:
    def __init__(self, kp: float = PAPER_KP, ki: float = PAPER_KI, ip_min: float = 1.0e3, ip_max: float = 15.0e6,
                 j_end: float = 2.0e6):
        self.kp, self.ki, self.j_end = kp, ki, j_end
        self.ip_min, self.ip_max = ip_min, ip_max
        self.reset()

    def reset(self) -> None:
        self.step_idx = 0
        self.integral = 0.0
        self.ip = 0.0

    def act(self, obs: dict) -> dict[str, list[float]]:
        t = self.step_idx
        if t < RAMP_END:
            error = j_target(t, self.j_end) - float(obs["profiles"]["j_total"][0])
            desired = IP_START + self.kp * error + self.ki * self.integral
            limited = desired
            ramp_limited = False
            if t > 0 and abs(desired - self.ip) > IP_RAMP:
                ramp_limited = True
                limited = self.ip + np.sign(desired - self.ip) * IP_RAMP
            final = float(np.clip(limited, self.ip_min, self.ip_max))
            power_limited = final != limited
            if power_limited and ramp_limited and abs(final - self.ip) < IP_RAMP:
                ramp_limited = False
            if not (ramp_limited or power_limited):
                self.integral += error * 1.0  # dt = 1 s
            self.ip = final
        p_nbi, p_ecrh = heating_schedule(t)
        self.step_idx += 1
        return {"Ip": [self.ip], "NBI": [p_nbi, NBI_LOC, NBI_WIDTH], "ECRH": [p_ecrh, ECRH_LOC, ECRH_WIDTH]}


class OpenLoopController:
    """The TORAX reference trajectory: Ip 3 -> 12.5 MA linearly over 100 s, heating on at 99 s."""

    def reset(self) -> None:
        self.step_idx = 0

    def __init__(self):
        self.reset()

    def act(self, obs: dict) -> dict[str, list[float]]:
        t = self.step_idx
        ip = IP_START + (t + 1) * (12.5e6 - IP_START) / 100 if t < 99 else 12.5e6
        p_nbi, p_ecrh = heating_schedule(t)
        self.step_idx += 1
        return {"Ip": [ip], "NBI": [p_nbi, NBI_LOC, NBI_WIDTH], "ECRH": [p_ecrh, ECRH_LOC, ECRH_WIDTH]}


class RandomController:
    """Uniform samples from the Gym-TORAX Dict action space (what the paper's random policy does)."""

    def __init__(self, action_space, seed: int = 0):
        self.space = action_space
        self.seed = seed
        self.reset()

    def reset(self) -> None:
        self.space.seed(self.seed)
        self.seed += 1

    def act(self, obs: dict) -> dict[str, list[float]]:
        return {k: list(np.ravel(v)) for k, v in self.space.sample().items()}
