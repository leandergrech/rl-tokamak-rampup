# Limitations: what fails, and by how much

Four kinds of limitation matter for anyone building on this benchmark: what the benchmark rewards that it should not, what the simulator cannot represent, what the published RL results do not cover, and what this repo's CPU-bounded baselines cannot tell you. Numbers from this repo come from `data/trajectories/*.csv`, `data/results/*.json` and `data/runs/*/`; literature numbers link to [References](07-references.md).

## 1. The benchmark rewards plasmas that would not be operated

The PI controller that sets the published bar (3.79) produces this plasma (`data/trajectories/pi.csv`, `data/results/classical.json`):

| Quantity | PI controller | Open-loop reference | What an operator would require |
|---|---|---|---|
| I_p at the end | 15.0 MA (reached at t = 60 s) | 12.5 MA | hybrid scenario: 11.2–12.5 MA at q95 ≈ 4 ([R27](07-references.md#r27)) |
| q95 at the end | 3.31 | 4.09 | ≈ 4 for the hybrid scenario ([R27](07-references.md#r27)) |
| q_min, lowest | 0.41 | 0.62 | just above 1: that is the definition of a hybrid scenario ([primer §5](02-primer.md#5-the-iter-hybrid-scenario)) |
| seconds with q_min < 1 | 101 of 151 | 83 of 151 | 0 |
| peak Greenwald fraction | 1.19 | 1.19 | < 1 ([R28](07-references.md#r28)) |
| Q at the end | 14.6 | 7.7 | ITER design goals: Q ≥ 10 at 15 MA, Q = 5 in the hybrid scenario ([R26](07-references.md#r26), [R27](07-references.md#r27)) |

Why the reward allows it: the q_min term is worth at most 1/150 per second, so running the whole episode at q_min = 0.41 costs (1 − 0.41) × 151/150 ≈ 0.59 of return, while the extra current buys more fusion gain (the PI episode collects 1.19 from the Q term against 0.60 for the open-loop reference; `data/results/classical.json`). Nothing in the reward sees density. Nothing ends the episode at q < 1 or f_GW > 1, because the simulator has no sawtooth or disruption model enabled ([R4b](07-references.md#r4b)).

The **H-mode test is a temperature threshold**, T_e(0) > 10 keV and T_i(0) > 10 keV ([R3](07-references.md#r3)), while the pedestal (the actual H-mode) is scheduled in time at 100–105 s. A policy can collect the gated reward terms before t = 100 s by heating the core in L-mode. The behaviour data already show the incentive: adding Gaussian noise to the PI actions, which clips to positive heating power during the ramp, raises the mean return from 3.79 to 3.85 (σ = 0.1) and 4.01 (σ = 0.3) over 20 episodes each (`data/offline/datasets.json`).

**The environment is deterministic with a fixed initial state.** Any deterministic policy has one return; "expected return" in the paper's table is only an expectation for the random policy. A learned policy that beats PI has found a better trajectory, not a better feedback law.

**The random-policy number is fragile.** The paper's −10.79 is a mean dominated by the −1000 failure penalty: with successful random episodes near +3, a failure rate of about 1.4 % reproduces it. This repo's 20-seed estimate is in [Designs and results](04-designs.md#classical-baselines-reproduced).

**Version drift.** On gymtorax 1.1.1 / torax 1.4.3 the same PI gains fail at step 105 with −998.67 and the open-loop reference scores 3.26 instead of 3.40 (`data/results/probe_gymtorax_1.1.1.json`). Results on the two versions are not comparable.

## 2. What the simulator cannot represent

From the Gym-TORAX config ([R3](07-references.md#r3)) and the TORAX paper and docs ([R4](07-references.md#r4), [R4b](07-references.md#r4b)):

- **Pedestal and L-H transition** are prescribed in time, so the most consequential event of the scenario is not controllable.
- **No sawteeth, tearing modes or disruptions** in this configuration, so the plasma never pays for q < 1 or f_GW > 1.
- **Fixed equilibrium geometry**: no shape, position or vertical-stability control; I_p changes do not reshape the plasma.
- **No central-solenoid flux budget or coil current limits**, so the ramp rate costs nothing but what the 0.2 MA/s limit imposes.
- **Transport is a surrogate.** QLKNN is a neural approximation of a quasilinear model; TORAX agrees with RAPTOR to about 1 % at steady state and within 5 % in dynamic phases ([R4](07-references.md#r4)), which is agreement between codes, not with experiment.
- **No noise, no delays, full state.** Real diagnostics see a small fraction of the 1,735 numbers the agent gets.

The Gym-TORAX authors summarise this as TORAX's hypotheses limiting it "to preliminary investigations" ([R1](07-references.md#r1)).

## 3. What the published RL results do not cover

| Limitation | Evidence |
|---|---|
| **Start-up and early ramp-up are handed to classical control.** | TCV policies take over at a "handover" time after plasma formation ([R6](07-references.md#r6)). |
| **No disruption guarantees.** | "they are not guaranteed to avoid plasma disruptions" ([R6](07-references.md#r6)); DIII-D tearing avoidance is "a proof-of-concept study" ([R8](07-references.md#r8)). |
| **Simulators are expensive or closed.** | TCV's FGE and LIUQE are "available subject to license agreement" ([R6](07-references.md#r6)); PopDownGym has no licence file ([R12](07-references.md#r12)). |
| **Compute.** | 5,000 actors and 1–3 days per TCV policy ([R6](07-references.md#r6)); about 11 GPU-hours for MOPO on the RL4F benchmark, 1.2 days for COMBO ([R13](07-references.md#r13)). |
| **Evaluation on learned simulators.** | RL4F's 13 algorithms are scored on a learned DIII-D model, not on the machine ([R13](07-references.md#r13)); the SPARC ramp-down study is simulation-only ([R10](07-references.md#r10)). |
| **One machine per result.** | Every control result in the [timeline](03-timeline.md) is trained for one device; only disruption *prediction* has shown cross-machine transfer ([R15a](07-references.md#r15-timeline-sources)). |
| **Data.** | The largest open fusion-control dataset in this review is 5,882 DIII-D shots ([R13](07-references.md#r13)); machines produce thousands of shots per year, and ITER will produce none before operation. |

## 4. What this repo's baselines cannot tell you

RESULTS_LIMITATIONS_PLACEHOLDER
