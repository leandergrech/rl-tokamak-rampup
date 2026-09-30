# The control problem

This page states the Gym-TORAX ITER hybrid ramp-up task as an MDP, exactly as the code implements it, then says what is and is not modelled and what "solved" should mean. Physics background is in the [primer](02-primer.md); sources are in [References](07-references.md).

## In one paragraph

A plasma is started at 3 MA in an ITER-sized tokamak (R = 6.2 m, a = 2.0 m, B₀ = 5.3 T; [R3](07-references.md#r3)). Over 150 simulated seconds, one decision per second, the controller chooses the plasma-current set-point and the power (and optionally deposition location and width) of two heating systems: neutral-beam injection (NBI, up to 33 MW, which also drives current) and electron-cyclotron heating (ECRH, up to 20 MW). TORAX integrates four coupled 1D transport PDEs between decisions. The reward pays for fusion gain and confinement quality once the core is hot enough to count as H-mode, and pays a small amount every second for keeping the safety factor above 1 in the core and above 3 at the edge. A numerical failure or a state outside the environment's bounds file ends the episode with −1000. The benchmark score is the undiscounted return of one episode.

## Which version is the benchmark

The only published scores (PI 3.79, open-loop 3.40, random −10.79; [R1](07-references.md#r1)) were produced with Gym-TORAX 1.0 on TORAX 1.0. Gym-TORAX 1.1 (July 2026) moved to TORAX 1.4 and changed the action semantics from "hold the set-point for the whole step" to "ramp linearly to the set-point over the step"; its maintainers say the published numbers "are therefore no longer up to date" ([R3](07-references.md#r3)). This repo measured both:

| Policy | Paper (v1.0) | This repo, gymtorax 1.0.0 + torax 1.0.3 | gymtorax 1.1.1 + torax 1.4.3 |
|---|---|---|---|
| PI controller, k_p = 0.700, k_i = 34.257 | 3.79 | **3.7919** | −998.67 (fails at step 105) |
| Open-loop reference | 3.40 | **3.4086** | 3.2629 |
| Random, one episode, seed 0 | −10.79 (mean) | 3.1693 | 3.1028 |

The v1.0 stack reproduces the paper to the second decimal, so **every number in this repo is on gymtorax 1.0.0 / torax 1.0.3 / jax 0.11.2** (pinned in `pyproject.toml`). The random-policy mean over 20 seeds is in [Designs and results](04-designs.md#classical-baselines-reproduced). The v1.1.1 column is produced by `scripts/probe_versions.py` run in a separate virtual environment with gymtorax 1.1.1 (output in `data/results/probe_gymtorax_1.1.1.json`); porting the baselines to v1.1 is listed as an opening in [Open questions](06-open-questions.md).

## State

TORAX evolves four radial profiles on a 25-cell grid in the normalised toroidal-flux coordinate ρ̂ ∈ [0, 1] ([R4b](07-references.md#r4b)):

- ion temperature T_i(ρ̂) and electron temperature T_e(ρ̂) [keV],
- electron density n_e(ρ̂) [m⁻³],
- poloidal flux ψ(ρ̂) [Wb], from which the current density j(ρ̂) and the safety factor q(ρ̂) follow.

Everything else in the observation (q, magnetic shear, bootstrap current, powers, Q, H98, β_N, ...) is a deterministic function of these four profiles, the geometry and the actuator settings. The exogenous schedule matters too: the pedestal temperature is prescribed as 0.5 keV until t = 100 s, rising to 3 keV at t = 105 s ([R3](07-references.md#r3)), which is how this environment imposes the L-H transition. The MDP is therefore non-stationary unless time is in the state. The wrapper in this repo adds t/150 as the first feature.

**Observation.** Gym-TORAX returns a nested dict: in gymtorax 1.0.0, 63 profile variables and 77 scalars, 1,735 numbers in total (counted in this repo). It is "fully observed" in the sense that the PDE state is included; the actuator variables themselves are removed from the observation by Gym-TORAX, so the wrapper appends the applied I_p, P_NBI and P_ECRH. `rl_tokamak.env.RampupEnv` offers three flattened sets, all normalised with fixed statistics from reference rollouts (`src/rl_tokamak/obs_stats.json`):

| Set | Dim | Content |
|---|---|---|
| `scalars` | 25 | time, applied actions, 18 scalars (q95, q_min, ρ(q_min), β_N, H98, Q, l_i(3), Greenwald fraction, line density, ⟨T_e⟩, ⟨T_i⟩, W_th, τ_E, V_loop, I_bs, P_ohm, P_SOL, P_LH), and T_e(0), T_i(0), j(0) |
| `profiles` (default) | 60 | `scalars` plus T_e, T_i, n_e, q, j at 7 radii (ρ̂ ≈ 0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.95) |
| `full` | 1,739 | time, applied actions, every Gym-TORAX profile and scalar |

## Action

Gym-TORAX action (dict), with the bounds of `IterHybridEnv` ([R3](07-references.md#r3)):

| Actuator | Components | Bounds | Rate limit |
|---|---|---|---|
| `Ip` | total plasma current set-point [A] | 10³ … 15 × 10⁶ | 0.2 MA per 1 s step |
| `NBI` | power [W], Gaussian deposition centre ρ̂, width | [0, 33 MW] × [0, 1] × [0.01, 1] | none |
| `ECRH` | power [W], Gaussian deposition centre ρ̂, width | [0, 20 MW] × [0, 1] × [0.01, 1] | none |

NBI current drive is tied to its power (the open-loop code uses 1 MA per 16 MW). The wrapper exposes `Box(-1, 1)^3` by default: a₀ is the **current ramp rate** (a₀ = 1 means +0.2 MA/s, so the rate limit holds by construction), a₁ and a₂ are NBI and ECRH power; deposition is fixed at the reference values (NBI ρ̂ = 0.25, width 0.25; ECRH ρ̂ = 0.35, width 0.05). `--action-set full` exposes all 7 components, `--ip-mode absolute` makes a₀ an absolute set-point instead.

## Dynamics

Between decisions TORAX integrates, with a fixed 1 s time step and a linear solver with predictor-corrector and Pereverzev terms ([R3](07-references.md#r3)):

- ion and electron heat transport with QLKNN turbulent diffusivities, prescribed inner (ρ̂ < 0.1) and outer (ρ̂ > 0.95) patches, fusion power, ohmic heating, ion-electron exchange, bremsstrahlung and cyclotron radiation;
- electron particle transport with a Greenwald-fraction boundary condition (0.35 at the edge, 0.85 at the pedestal top);
- current diffusion (the ψ equation), with neoclassical conductivity, bootstrap current, NBI and ECCD current drive, and I_p entering as the edge boundary condition.

Equilibrium geometry is fixed (a CHEASE equilibrium file), so shape and position are not part of the problem. The dynamics are deterministic and the initial state is fixed: every reset produces the same plasma.

## Reward and objective

Per step, with H = 1 if T_e(0) > 10 keV and T_i(0) > 10 keV, else 0 ([R3](07-references.md#r3)):

$$
r_t = \underbrace{\tfrac{1}{50}\,H\,\tfrac{Q}{10}}_{\text{fusion gain}}
+ \underbrace{\tfrac{1}{50}\,H\,\min(H_{98},1)}_{\text{confinement}}
+ \underbrace{\tfrac{1}{150}\min(q_{\min},1)}_{\text{no } q<1}
+ \underbrace{\tfrac{1}{150}\min(q_{95}/3,1)}_{\text{edge } q}
$$

and r_t = −1000 (episode ends) if TORAX fails or the observation leaves the bounds in `iter_hybrid.json`. The objective is J(π) = Σ_t r_t over one episode with γ = 1. The two q terms can add at most 2/150 ≈ 0.0133 per second, 2.0 over an episode; the H-mode terms have no upper bound through Q.

For training, the wrapper can rescale the reward (`reward_mode=scaled`: ×100, failure → −100) or add a physics penalty (`qmin_safe`: −(1 − q_min)⁺ per step on top of `scaled`). Evaluation always reports the unmodified Gym-TORAX return, carried in `info["benchmark_reward"]`.

## Constraints and horizon

- Hard, enforced by the environment: actuator bounds, I_p ramp rate 0.2 MA/s, and the observation bounds (violations end the episode with −1000).
- Physical, **not** enforced and not in the reward: the Greenwald density limit (f_GW < 1), q_min ≥ 1 in a hybrid scenario, the L-H power threshold (P_SOL > P_LH), central-solenoid flux consumption, and heating-system duty limits. [Limitations](05-limitations.md) shows the PI baseline violates the first two.
- Horizon: t_final = 150 s with 1 s steps. gymtorax 1.0.0 takes 151 actions (it terminates when t > 150 s); gymtorax 1.1.1 takes 150.

## What "solved" would mean

Three levels, in increasing order of usefulness:

1. **Benchmark level.** Beat the PI controller's 3.79 with a learned policy, reported with seeds and compute. Because the environment is deterministic with a fixed initial state, any deterministic policy has exactly one return, and the best achievable return is the value of the best *open-loop* action sequence. So a benchmark win says "RL found a better trajectory", not "RL found a better feedback law".
2. **Optimality level.** Close the gap to that open-loop optimum, which can be estimated directly with trajectory optimisation (CMA-ES, or gradients through TORAX, which is written in JAX). This gives the upper bound the paper does not report.
3. **Control level.** Show that the learned policy keeps its advantage under perturbations the open-loop optimum cannot anticipate (initial profiles, transport multipliers, actuator faults, pedestal timing), while respecting q_min ≥ 1 and f_GW < 1. Only this level says something about feedback control of a real ramp-up, and it needs environment changes that Gym-TORAX 1.0 does not offer out of the box; see [Open questions](06-open-questions.md).
