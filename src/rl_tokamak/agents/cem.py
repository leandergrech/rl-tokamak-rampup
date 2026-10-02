"""Open-loop reference: cross-entropy search over a 9-parameter actuator schedule.

The ITER hybrid environment is deterministic with a fixed initial state, so the best
open-loop schedule is also the best any policy can do on the benchmark. This search
gives a cheap lower bound on that optimum, which the paper does not report. It is not
RL and uses many more simulator episodes than the RL baselines; that cost is logged.

Parameters, all in [0, 1]:
  0 ramp rate before t_switch (x 0.2 MA/s)   1 t_switch in [20, 100] s
  2 ramp rate after t_switch (x 0.2 MA/s)    3 I_p ceiling in [8, 15] MA
  4 NBI power before 99 s (x 33 MW)          5 pre-heating start time in [0, 99] s
  6 ECRH power before 99 s (x 20 MW)         7 NBI power from 99 s (x 33 MW)
  8 ECRH power from 99 s (x 20 MW)
"""

from __future__ import annotations

import multiprocessing as mp
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass

import numpy as np

from ..controllers import HEAT_ON_STEP
from ..env import ECRH_LOC, ECRH_WIDTH, IP_RAMP, IP_START, NBI_LOC, NBI_WIDTH

N_PARAMS = 9


class ScheduleController:
    def __init__(self, p):
        self.p = np.clip(np.asarray(p, dtype=float), 0, 1)
        self.reset()

    def reset(self) -> None:
        self.step_idx, self.ip = 0, IP_START

    def act(self, obs) -> dict:
        p, t = self.p, self.step_idx
        t_switch = 20 + 80 * p[1]
        rate = p[0] if t < t_switch else p[2]
        self.ip = min(self.ip + rate * IP_RAMP, 8e6 + 7e6 * p[3])
        if t >= HEAT_ON_STEP:
            p_nbi, p_ec = 33e6 * p[7], 20e6 * p[8]
        elif t >= 99 * p[5]:
            p_nbi, p_ec = 33e6 * p[4], 20e6 * p[6]
        else:
            p_nbi, p_ec = 0.0, 0.0
        self.step_idx += 1
        return {"Ip": [self.ip], "NBI": [p_nbi, NBI_LOC, NBI_WIDTH], "ECRH": [p_ec, ECRH_LOC, ECRH_WIDTH]}


_ENV = None


def _init_worker(physics: dict | None = None) -> None:
    global _ENV
    from ..env import EnvConfig, RampupEnv, set_single_thread

    set_single_thread()
    _ENV = RampupEnv(EnvConfig(extra={} if physics is None else {"physics": physics}))


def _score(args) -> tuple[float, bool]:
    from ..evaluate import audited_return, run_controller

    p, objective = args
    r = run_controller(_ENV, ScheduleController(p))
    score = r["benchmark_return"] if objective == "benchmark" else audited_return(r["log"])
    return float(score), bool(r["failed"])


@dataclass
class CEMConfig:
    population: int = 16
    elites: int = 4
    generations: int = 12
    init_std: float = 0.3
    min_std: float = 0.03
    workers: int = 8
    max_minutes: float = 50.0
    seed: int = 0
    objective: str = "benchmark"  # or "audited" (see rl_tokamak.evaluate.audited_return)
    physics: dict | None = None  # PhysicsConfig overrides: search the physics environment (its own return)


def run_cem(cfg: CEMConfig, log=print) -> dict:
    rng = np.random.default_rng(cfg.seed)
    # Start from the open-loop reference: 0.095 MA/s to 12.5 MA, heating 33 + 20 MW from 99 s.
    mean = np.array([0.475, 1.0, 0.475, (12.5 - 8) / 7, 0.0, 1.0, 0.0, 1.0, 1.0])
    std = np.full(N_PARAMS, cfg.init_std)
    best = (-np.inf, None)
    curve, episodes, t0 = [], 0, time.time()
    with ProcessPoolExecutor(cfg.workers, mp_context=mp.get_context("spawn"), initializer=_init_worker,
                             initargs=(cfg.physics,)) as ex:
        for g in range(cfg.generations):
            pop = np.clip(mean + std * rng.standard_normal((cfg.population, N_PARAMS)), 0, 1)
            pop[0] = mean  # always re-score the current mean
            scores = list(ex.map(_score, [(q, cfg.objective) for q in pop]))
            episodes += len(pop)
            ret = np.array([s[0] for s in scores])
            elite = pop[np.argsort(ret)[-cfg.elites:]]
            if ret.max() > best[0]:
                best = (float(ret.max()), pop[int(np.argmax(ret))].tolist())
            mean, std = elite.mean(0), np.maximum(elite.std(0), cfg.min_std)
            row = {"generation": g + 1, "episodes": episodes, "minutes": (time.time() - t0) / 60,
                   "best": best[0], "gen_mean": float(ret.mean()), "gen_max": float(ret.max()),
                   "failures": int(sum(s[1] for s in scores))}
            curve.append(row)
            log(row)
            if row["minutes"] > cfg.max_minutes:
                break
    return {"best_return": best[0], "best_params": best[1], "curve": curve, "episodes": episodes,
            "config": asdict(cfg), "minutes": (time.time() - t0) / 60}
