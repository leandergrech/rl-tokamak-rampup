# 8. Gaps, status and glossary

!!! abstract "In short"

    - The simulator **prescribes the pedestal in time** and has no sawtooth, tearing or disruption model, no flux budget and no noise; each gap changes what an optimal policy looks like.
    - DeepMind solved **magnetic shape control on one machine**; start-up, disruptions, internal profile control and transfer are open.
    - Gym-TORAX is the first open, pip-installable ramp-up benchmark, and it has no published RL result.

## What the simulator leaves out

The Gym-TORAX paper says TORAX's hypotheses "limit its use to preliminary investigations" without listing them ([R1](../07-references.md#r1)). Reading the TORAX paper and docs ([R4](../07-references.md#r4), [R4b](../07-references.md#r4b)) and the environment config ([R3](../07-references.md#r3)), the gaps that matter for this task are:

| Missing or simplified | Effect on the RL problem | Try it in the Lab |
|---|---|---|
| Pedestal prescribed in time, not predicted from power and density | L-H timing is not controllable; early heating cannot trigger H-mode, yet the reward's H-mode test can be met by a hot core | [power-triggered pedestal](7-lab.md?preset=heating_cut&t=130&pedestal=power) |
| No sawtooth model enabled (TORAX 1.0.3 has a simple one; the env config does not use it) | q < 1 has no physical consequence; only the reward term min(q_min, 1)/150 notices | [sawtooth model on](7-lab.md?preset=pi&t=120&tab=T&sawtooth=1) |
| No tearing modes, no disruption model | nothing bad happens at f_GW > 1 or low q95 except via the bounds file | custom reward: end episode if f_GW > 1 |
| Fixed equilibrium geometry | shape and vertical position are not part of the problem; I_p changes do not change the shape | – |
| No central-solenoid flux budget or coil limits | the ramp costs nothing in volt-seconds | physics audit: resistive flux |
| Deterministic, fixed initial state, no sensor noise | no need for state estimation; closed loop and open loop are equivalent in value | assumptions: transport ×, pedestal onset, Z_eff |

## What has been solved, and what has not

**Solved, on one machine: magnetic shape and position control with RL.** DeepMind and EPFL trained a single MPO policy that maps 34 flux loops, 38 magnetic probes and 19 coil currents to the voltages of all 19 TCV control coils at 10 kHz, and ran it on the real machine ([R6](../07-references.md#r6)). Measured shape errors on hardware were 0.53–1.6 cm RMSE across the reported experiments, including an elongation of 1.9, negative triangularity −0.8, "droplet" double plasmas and a snowflake transition. Training used a licensed free-boundary simulator (FGE), 5,000 parallel actors and 1–3 days per policy. A follow-up improved shape accuracy by up to 65 % and cut training time for new tasks by a factor of 3 or more, again validated on TCV ([R7](../07-references.md#r7)). RL magnetic or current control has since been reported on WEST, HL-3 and EAST ([R15j–l](../07-references.md#r15-timeline-sources)).

**What that result did not do**, by its own account ([R6](../07-references.md#r6)):

- **Start-up.** Breakdown and the early current rise were handled by the conventional controller; the policy took over at a "handover" time from a reconstructed equilibrium.
- **Disruption guarantees.** The controllers "are not guaranteed to avoid plasma disruptions"; the authors recommend a fallback controller or interlock.
- **Profiles.** Magnetic control shapes the boundary; it does not control the internal current, pressure or density profiles, which set performance and most disruption risks.
- **Transfer.** Each policy is trained for TCV's coils, sensors and simulator.

**Open: internal profile control.** The results that exist are data-driven and early: DIII-D tearing avoidance with DDPG on a learned model, described by its authors as "a proof-of-concept study" ([R8](../07-references.md#r8)); feedforward β_N control on KSTAR ([R15c](../07-references.md#r15-timeline-sources)); offline model-based RL for β_N and rotation on DIII-D ([R15e](../07-references.md#r15-timeline-sources)); simulated q-profile and β_N control for JT-60SA ([R15f](../07-references.md#r15-timeline-sources)); an offline-RL benchmark on 5,882 DIII-D shots where model-based offline methods lead but "no single method dominates all tasks" ([R13](../07-references.md#r13)); and PPPL's PACMAN framework, which runs ML prediction and control in real time on DIII-D ([R9](../07-references.md#r9)).

**Open: ramp-up and ramp-down.** RL for current ramp-up was studied in simulation for a DEMO-class device in 2019 ([R15b](../07-references.md#r15-timeline-sources)); ramp-down trajectories designed with RL on learned dynamics have been tested on TCV ([R11](../07-references.md#r11)) and simulated for SPARC ([R10](../07-references.md#r10)). Gym-TORAX is the first open, pip-installable ramp-up benchmark, and it has no published RL result.

**Open: cross-device transfer and a common simulator.** Every control result above is trained on one machine's model. The open simulator (TORAX) is now used by DeepMind with Commonwealth Fusion Systems for SPARC ([R14](../07-references.md#r14)), its maintainers plan "a more advanced control-oriented API", and UKAEA plans public ML benchmark cases for STEP ([R5](../07-references.md#r5)). None of these was public on 30 September 2026.

## Glossary {#glossary}

| Term | Meaning | Chapter |
|---|---|---|
| ρ̂ | normalised toroidal-flux radius, 0 at the axis, 1 at the edge | [3](3-current-diffusion.md) |
| I_p | total plasma current [MA] | [1](1-machine.md) |
| B_φ, B_θ | toroidal field (from coils), poloidal field (from I_p) | [1](1-machine.md) |
| ψ | poloidal magnetic flux; its radial profile carries the current | [3](3-current-diffusion.md) |
| j(ρ̂), j(0) | current density profile, and its central value [MA/m²] | [3](3-current-diffusion.md) |
| j_ni, bootstrap | non-inductive current; the part driven by pressure gradients | [3](3-current-diffusion.md#current-the-solenoid-does-not-have-to-drive) |
| σ_∥, η, τ_R | parallel conductivity, resistivity, resistive diffusion time | [3](3-current-diffusion.md) |
| V_loop, volt-seconds | loop voltage; flux the solenoid supplies | [1](1-machine.md), [3](3-current-diffusion.md) |
| q, q95, q_min | safety factor; its value at 95 % poloidal flux; its minimum | [2](2-safety-factor.md) |
| rational surface | where q = m/n: field lines close on themselves | [2](2-safety-factor.md) |
| l_i(3) | internal inductance, a measure of how peaked the current profile is | [3](3-current-diffusion.md) |
| χ, stiffness, R/L_T | heat diffusivity; profiles pinned near a critical gradient; normalised gradient | [4](4-heat-and-fusion.md) |
| β_N | normalised beta, pressure relative to field, scaled by I_p/(aB) | [5](5-limits.md) |
| f_GW | Greenwald fraction n̄_e / n_G | [5](5-limits.md) |
| τ_E, H98 | energy confinement time; its ratio to the IPB98(y,2) scaling | [4](4-heat-and-fusion.md) |
| Q | fusion gain P_fus / (P_aux + P_ohm) | [4](4-heat-and-fusion.md) |
| P_LH, P_SOL | L-H threshold power; power crossing the separatrix | [5](5-limits.md) |
| NBI, ECRH, ECCD | neutral beam injection; electron cyclotron heating; electron cyclotron current drive | [1](1-machine.md) |
| L-mode, H-mode, pedestal | low and high confinement regimes; the edge transport barrier of H-mode | [4](4-heat-and-fusion.md) |
| sawtooth, tearing mode, disruption | core q < 1 relaxation; magnetic island at a rational surface; sudden loss of the plasma | [5](5-limits.md) |
| hybrid scenario | reduced-current H-mode with q_min just above 1 and broad low shear | [5](5-limits.md#the-iter-hybrid-scenario) |
| QLKNN | neural-network surrogate for turbulent transport used by TORAX | [4](4-heat-and-fusion.md) |
| RAPTOR, FGE | control-oriented transport code (EPFL); free-boundary equilibrium simulator used for TCV RL (licensed) | [5](5-limits.md) |

[← The Ramp-up Lab](7-lab.md) · [Back to the start](../02-primer.md)
