# Designs and results

Two parts: the published RL/ML control designs side by side, then this repo's baselines on Gym-TORAX with their numbers. Every literature number links to [References](07-references.md); every number of ours comes from a file under `data/`.

## Published designs side by side

| | DeepMind TCV magnetic control ([R6](07-references.md#r6), [R7](07-references.md#r7)) | DIII-D tearing avoidance ([R8](07-references.md#r8)) | MIT ramp-down ([R10](07-references.md#r10), [R11](07-references.md#r11)) | RL4F offline benchmark ([R13](07-references.md#r13)) | Gym-TORAX ([R1](07-references.md#r1), [R3](07-references.md#r3)) |
|---|---|---|---|---|---|
| Control problem | plasma current, position and boundary shape after handover | keep β_N high while keeping predicted tearability below a threshold | ramp I_p down safely | track rotation, density, temperature, pressure profiles | ramp-up to a high-performance flat-top |
| Algorithm | MPO (actor-critic), asymmetric: small feedforward actor, LSTM critic | DDPG (Keras-RL) | PPO | 13 offline algorithms incl. MOPO, COMBO, RAMBO, TD3+BC, CQL, IQL | none yet (PI, open-loop, random baselines) |
| Dynamics used for training | FGE free-boundary simulator, licensed from EPFL | learned model of β_N and tearability from DIII-D data | PopDownGym: neural ODE trained on 336 RAPTOR runs | learned DIII-D dynamics model from 5,282 training shots | TORAX 1D transport PDEs, QLKNN transport |
| Observation | 34 flux loops, 38 field probes, 19 coil currents (+1 derived) | 5 profiles × 33 grid points | 8-dimensional | profiles + scalars (per task) | full profiles and scalars (1,735 numbers) |
| Action | 19 coil voltages at 10 kHz | total beam power, boundary triangularity | 4-dimensional | per task | I_p set-point, NBI and ECRH power and deposition, 1 Hz |
| Reward | per-target error → [0, 1] via nonlinear map, weighted combination | β_N reward, penalty when predicted tearability exceeds k ∈ {0.2, 0.5, 0.7} | reach I_p < 2 MA while respecting limits | negative tracking error | fusion gain, H98 (both gated on T > 10 keV), q_min and q95 terms; −1000 on failure |
| Compute | 5,000 actors, 1–3 days per policy on a TPU learner | not stated on the opened page (unverified) | not stated on the opened page (unverified) | several to about 30 GPU-hours per method (MOPO about 11 h) | benchmark episode about 17 s on one CPU core in this repo |
| Reported result | shape RMSE 0.53–1.6 cm on hardware; up to 65 % more accurate and ≥ 3× faster training in the follow-up | tearing avoided in DIII-D discharges; "proof-of-concept" | SPARC simulation study; on TCV, a predict-first ramp-down raised I_p 20 % (140 → 170 kA) | model-based offline RL best on average; MOPO most robust; no single winner | PI 3.79 > open-loop 3.40 > random −10.79 |
| What transferred to hardware | yes, zero-shot from simulator | yes, from learned model | TCV experiments for the NSSM + RL design; SPARC not built | no (evaluated on a learned simulator) | no (simulation only) |


```mermaid
quadrantChart
    title Where published RL and ML controllers sit
    x-axis Learned dynamics model --> Physics simulator
    y-axis Simulation only --> Ran on a tokamak
    quadrant-1 Physics simulator, on hardware
    quadrant-2 Learned model, on hardware
    quadrant-3 Learned model, simulation only
    quadrant-4 Physics simulator, simulation only
    TCV magnetic 2022: [0.76, 0.93]
    TCV magnetic 2023: [0.7, 0.83]
    DIII-D tearing 2024: [0.2, 0.9]
    TCV ramp-down 2025: [0.26, 0.76]
    HL-3 current 2025: [0.17, 0.67]
    DIII-D offline MBRL 2023: [0.26, 0.57]
    SPARC ramp-down 2025: [0.3, 0.25]
    RL4F offline 2026: [0.17, 0.14]
    JT-60SA q and beta 2023: [0.72, 0.32]
    DEMO ramp-up 2019: [0.64, 0.12]
    Gym-TORAX this repo: [0.74, 0.07]
```

Placement is qualitative (from the table above and [the timeline](03-timeline.md)): the x-axis is what the policy was trained against, the y-axis whether a learned policy ran on a real machine. WEST and EAST are left out because the opened pages did not settle whether their policies ran on hardware.

Three design patterns stand out.

1. **Where a trustworthy simulator exists, model-free RL with massive parallelism works.** TCV's FGE is a free-boundary equilibrium code whose magnetic dynamics are close enough to reality for zero-shot transfer, and DeepMind paid for it with 5,000 actors.
2. **Where physics models are poor (tearing, profiles), every hardware result trains on a learned model.** DIII-D tearing avoidance, the TCV ramp-down and the offline DIII-D results all put a neural dynamics model between the data and the policy. This is why this repo's model-based baseline matters: it is the family that has reached hardware for profile-level problems.
3. **Rewards are shaped constraints.** Every design encodes limits (tearability, disruptivity, q, shape error) as reward terms or terminations rather than as hard constraints; none offers guarantees, and DeepMind says so explicitly.

## This repo's baselines

All runs use gymtorax 1.0.0 / torax 1.0.3 (the paper's stack, see [The control problem](01-problem.md#which-version-is-the-benchmark)), the wrapper defaults (60-dimensional `profiles` observation, 3-dimensional action [I_p ramp rate, P_NBI, P_ECRH], training reward = 100 × benchmark reward with failure → −100) unless an ablation says otherwise, and are scored with the benchmark's own undiscounted return of one deterministic episode.

### Classical baselines reproduced

`python scripts/evaluate.py --classical` (output `data/results/classical.json`):

| Policy | Paper (v1.0) | This repo | Notes |
|---|---|---|---|
| PI controller, k_p = 0.700, k_i = 34.257 (re-implemented in `rl_tokamak.controllers`) | 3.79 | **3.7919** | identical to Gym-TORAX's own `PIDAgent` (3.791923 both) |
| Open-loop reference (I_p 3 → 12.5 MA over 100 s, 33 MW NBI + 20 MW ECRH from 99 s) | 3.40 | **3.4086** | |
| Random (uniform over the Gym-TORAX action dict), 20 seeds | −10.79 | **3.23 ± 0.06**, 0 failures | **not reproduced**: see below |

The paper's random-policy mean is not reproduced. A uniform random policy never triggered the −1000 failure in 20 episodes here (returns 3.10–3.33). The paper's −10.79 would follow from a failure rate of about 1.4 % with otherwise similar returns; the number of episodes and seeds behind it is not stated in the paper ([R1](07-references.md#r1)), and small numerical differences in the JAX stack can decide whether a marginal state leaves the bounds file. Report random-policy numbers with their failure rate.

Where the PI controller's advantage over the open-loop reference comes from (sum of each reward term over the episode):

| Reward term | PI | Open-loop |
|---|---|---|
| fusion gain (H-mode gated) | 1.19 | 0.60 |
| H98 (H-mode gated) | 0.90 | 0.96 |
| q_min | 0.69 | 0.83 |
| q95 | 1.01 | 1.01 |
| **total** | **3.79** | **3.41** |

The PI policy wins entirely on fusion gain, by reaching 15 MA at t = 60 s, and pays for it with q_min (0.41 at the end).

![Paper versus this repo for the three published baselines](figures/classical.png)

### Baseline designs

All learned policies see the wrapper defaults unless an ablation says otherwise: 60-dimensional `profiles` observation with fixed normalisation, action [I_p ramp rate, P_NBI, P_ECRH] ∈ [−1, 1]³ (deposition fixed at the reference), I_p floor 3 MA, training reward 100 × benchmark reward with failure → −100, γ = 0.995.

| Baseline | Implementation | Networks | Key settings | Budget |
|---|---|---|---|---|
| PPO | Stable-Baselines3 2.9.0 | MLP 64-64 (actor and critic) | 8 envs, n_steps 128, batch 256, 10 epochs, lr 3e-4, GAE λ 0.95, clip 0.2, initial log σ −0.5 | 45 min wall clock |
| SAC | Stable-Baselines3 2.9.0 | MLP 256-256 | 8 envs, 1 gradient step per transition, buffer 300k, 3k warm-up steps, automatic entropy | 45 min wall clock |
| MBPO | `rl_tokamak.agents.mbpo` | ensemble of 5 Gaussian MLPs 3×200 (SiLU), bootstrapped, 10 % hold-out early stopping; SAC 256-256 | model refit after every episode; every 50 real steps branch 1,000 rollouts of length k = 1 → 5 (ramped over episodes 4–20); 10 SAC updates per real step on 10 % real + 90 % model data; time feature advanced exactly | 20–30 simulator episodes, 50–55 min cap |
| BC | `rl_tokamak.agents.offline` | MLP 256-256, tanh output | MSE to logged actions | 60k (pi_det) or 20k steps, 25 min cap |
| TD3+BC | `rl_tokamak.agents.offline` | 256-256 actor and twin critics | α = 2.5, policy noise 0.2, delay 2, dataset state normalisation ([R21](07-references.md#r21)) | same |
| MOPO | `rl_tokamak.agents.offline` | MBPO's ensemble and SAC | penalty λ = 1 on max-member predictive σ norm, horizon 5, 5 % real data ([R20](07-references.md#r20)) | same |
| CEM open-loop search | `rl_tokamak.agents.cem` | none | 9-parameter schedule (two ramp rates and switch time, I_p ceiling, pre-heating power and start, flat-top powers), population 12, 4 elites | 45 min, 4 workers |


How the MBPO baseline spends simulator steps:

```mermaid
flowchart TB
    ENV["TORAX via RampupEnv<br/>151 steps per episode"] -- "real transitions" --> RB[("real buffer")]
    RB -- "refit after every episode<br/>Gaussian NLL, bootstrap, hold-out" --> ENS["ensemble of 5 MLPs<br/>(x, a) → (Δx, r)"]
    RB -- "1,000 start states<br/>every 50 real steps" --> ROLL["branched rollouts<br/>k = 1 → 5 steps<br/>time feature advanced exactly"]
    ENS --> ROLL
    ROLL --> MB[("model buffer")]
    MB -- "90 % of each batch" --> SAC["SAC: 10 updates<br/>per real step"]
    RB -- "10 %" --> SAC
    SAC -- "acts in TORAX" --> ENV
```

And how the offline experiment is built:

```mermaid
flowchart TB
    PI["PI controller<br/>k_p 0.700, k_i 34.257"] --> D0["pi_det<br/>1 episode, 151 transitions"]
    PI --> N1["+ Gaussian action noise σ 0.1<br/>20 episodes"] --> D1["pi_noisy_0.1<br/>3,020 transitions"]
    PI --> N3["+ noise σ 0.3<br/>20 episodes"] --> D3["pi_noisy_0.3<br/>3,020 transitions"]
    D0 & D1 & D3 --> BC["BC"] & TD["TD3+BC"] & MO["MOPO<br/>ensemble + penalised SAC"]
    BC & TD & MO --> EV["one deterministic TORAX episode<br/>benchmark return + audited score"]
```

Offline datasets (`scripts/make_datasets.py`, summary in `data/offline/datasets.json`): `pi_det` is one deterministic PI episode (151 transitions; more episodes would be identical); `pi_noisy_0.1` and `pi_noisy_0.3` are 20 PI episodes each with Gaussian action noise of 0.1 or 0.3 (I_p noise in units of the 0.2 MA/s ramp limit, power noise in units of the maximum power), 3,020 transitions each. Their behaviour returns are 3.79, 3.85 ± 0.01 and 4.01 ± 0.03.

### Results

Generated by `python scripts/evaluate.py --summary` (`data/results/summary.md`). "Audited score" is the same episode scored with Q capped at 10 and H-mode counted only while P_SOL ≥ P_LH ([Limitations](05-limitations.md#the-q-loophole-found-by-rl)).

| Policy | Group | Return (final policy) | Audited score | Best during training | Sim. steps to beat PI | Sim. steps used | Wall time (min) | I_p end (MA) | q_min end | s with q_min<1 | max f_GW | Q end |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PI controller (paper gains) | classical | 3.79 (paper 3.79) | 3.50 |  |  |  |  | 15.0 | 0.41 | 101 | 1.19 | 14.6 |
| Open-loop reference | classical | 3.41 (paper 3.40) | 3.41 |  |  |  |  | 12.5 | 0.63 | 83 | 1.19 | 7.7 |
| Random (mean of 20) | classical | 3.23 ± 0.06 (paper -10.79) |  |  |  |  |  |  |  |  |  |  |
| Behaviour cloning on pi_det (seed 0) | offline | 3.79 | 3.50 | 3.79 |  | 0 online, 151 logged | 16.3 | 15.0 | 0.41 | 101 | 1.19 | 14.6 |
| Behaviour cloning on pi_noisy_0.1 (seed 0) | offline | 3.85 | 3.52 | 3.85 |  | 0 online, 3,020 logged | 11.8 | 15.0 | 0.41 | 101 | 1.19 | 15.1 |
| Behaviour cloning on pi_noisy_0.3 (seed 0) | offline | 3.99 | 3.56 | 3.99 |  | 0 online, 3,020 logged | 17.8 | 15.0 | 0.43 | 98 | 1.19 | 16.1 |
| MBPO (ensemble + SAC) [I_p floor 1 MA] (seed 0) | ablation | 3.15 | 3.13 | 3.95 | 1,364 | 2,119 | 55.8 | 6.9 | 1.28 | 0 | 1.05 | 1.6 |
| MBPO (ensemble + SAC) [obs=full] (seed 0) | ablation | 3.12 | 2.01 | 3.12 |  | 735 | 55.8 | 14.2 | 1.22 | 0 | 1.20 | 2.6 |
| MBPO (ensemble + SAC) [obs=full] (seed 1) | ablation | 5.63 | 3.69 | 21.29 | 906 | 2,177 | 29.0 | 15.0 | 0.58 | 79 | 1.18 | 36.6 |
| MBPO (ensemble + SAC) [obs=scalars] (seed 0) | ablation | -999.32 | -999.32 | 3.04 |  | 1,524 | 52.9 | 3.0 | 2.97 | 0 | 1.27 | 0.0 |
| MBPO (ensemble + SAC) [obs=scalars] (seed 1) | ablation | 2.97 | 2.01 | 3.00 |  | 2,239 | 13.3 | 3.0 | 3.51 | 0 | 1.27 | 0.2 |
| MBPO (ensemble + SAC) [reward=patched] (seed 0) | ablation | -997.92 | -997.96 | 3.23 |  | 3,658 | 21.3 | 3.0 | 1.28 | 0 | 1.13 | 0.9 |
| MBPO (ensemble + SAC) [reward=patched] (seed 1) | ablation | 2.98 | 2.98 | 5.05 | 3,020 | 3,775 | 21.7 | 3.3 | 2.08 | 0 | 1.26 | 0.2 |
| MBPO (ensemble + SAC) [reward=patched] (seed 2) | ablation | 3.16 | 3.12 | 3.16 |  | 3,753 | 21.8 | 9.1 | 0.80 | 67 | 1.13 | 3.1 |
| MBPO (ensemble + SAC) [reward=benchmark] (seed 0) | ablation | 2.24 | 2.01 | 8.85 | 594 | 1,500 | 53.2 | 3.0 | 2.56 | 0 | 1.23 | 4.2 |
| MBPO (ensemble + SAC) [reward=benchmark] (seed 1) | ablation | 3.06 | 2.05 | 3.07 |  | 2,265 | 14.0 | 3.6 | 2.77 | 0 | 1.26 | 0.3 |
| MBPO (ensemble + SAC) [reward=benchmark] (seed 2) | ablation | 2.27 | 2.01 | 2.76 |  | 2,235 | 13.7 | 4.4 | 2.71 | 0 | 1.27 | 9.0 |
| MBPO (ensemble + SAC) [reward=qmin_safe] (seed 0) | ablation | 3.00 | 2.72 | 3.00 |  | 1,451 | 53.0 | 3.0 | 2.47 | 0 | 1.22 | 0.2 |
| MBPO (ensemble + SAC) (seed 0) | online | 2.98 | 2.96 | 2.98 |  | 1,783 | 62.7 | 3.0 | 2.26 | 0 | 1.19 | 0.2 |
| MBPO (ensemble + SAC) (seed 1) | online | 18.42 | 1.89 | 18.42 | 1,510 | 1,510 | 53.7 | 3.0 | 0.67 | 99 | 1.80 | 123.2 |
| MBPO (ensemble + SAC) (seed 2) | online | 2.08 | 2.05 | 2.97 |  | 1,480 | 53.3 | 3.3 | 2.76 | 0 | 1.27 | 0.2 |
| MBPO (ensemble + SAC) (seed 3) | online | 3.01 | 2.64 | 6.02 | 2,416 | 3,775 | 22.2 | 3.5 | 2.63 | 0 | 1.14 | 0.3 |
| MBPO (ensemble + SAC) (seed 4) | online | 10.82 | 2.01 | 10.82 | 1,789 | 3,752 | 22.0 | 6.3 | 1.29 | 0 | 1.11 | 109.8 |
| MBPO (ensemble + SAC) (seed 5) | online | 3.45 | 2.07 | 3.45 |  | 3,727 | 21.3 | 9.2 | 0.90 | 49 | 1.17 | 6.0 |
| MOPO on pi_det (seed 0) | offline | 3.94 | 2.29 | 3.94 |  | 0 online, 151 logged | 32.4 | 15.0 | 0.69 | 59 | 1.04 | 15.9 |
| MOPO on pi_noisy_0.1 (seed 0) | offline | 2.88 | 2.01 | 2.88 |  | 0 online, 3,020 logged | 24.1 | 3.6 | 2.49 | 0 | 0.88 | 1.2 |
| MOPO on pi_noisy_0.3 (seed 0) | offline | 2.01 | 2.01 | 2.01 |  | 0 online, 3,020 logged | 21.5 | 13.0 | 2.68 | 0 | 0.89 | 1.8 |
| PPO (SB3) (seed 0) | online | 2.99 | 2.01 | 2.99 |  | 14,128 | 47.2 | 4.3 | 3.58 | 0 | 1.21 | 0.5 |
| PPO (SB3) (seed 1) | online | 48.98 | 3.53 | 48.98 | 48,008 | 112,136 | 46.0 | 10.8 | 0.71 | 59 | 1.23 | 755.1 |
| SAC (SB3) [I_p floor 1 MA] (seed 0) | ablation | 2.99 | 2.58 | 3.02 |  | 10,712 | 51.0 | 3.1 | 3.67 | 0 | 1.32 | 0.2 |
| SAC (SB3) (seed 0) | online | 2.92 | 2.01 | 3.20 |  | 11,192 | 47.2 | 3.3 | 2.46 | 0 | 1.28 | 1.5 |
| SAC (SB3) (seed 1) | online | 27.08 | 1.99 | 27.77 | 15,624 | 74,872 | 46.0 | 6.3 | 0.91 | 51 | 1.09 | 283.7 |
| TD3+BC on pi_det (seed 0) | offline | -998.05 | -998.06 | -998.05 |  | 0 online, 151 logged | 34.3 | 8.5 | 0.46 | 68 | 1.16 | 6.8 |
| TD3+BC on pi_noisy_0.1 (seed 0) | offline | 3.79 | 3.54 | 3.79 |  | 0 online, 3,020 logged | 25.0 | 14.5 | 0.43 | 99 | 1.20 | 13.8 |
| TD3+BC on pi_noisy_0.3 (seed 0) | offline | 4.01 | 3.56 | 4.01 |  | 0 online, 3,020 logged | 18.8 | 14.8 | 0.43 | 96 | 1.20 | 16.9 |
| CEM open-loop schedule search, objective: benchmark | reference | 4.08 | 3.57 |  |  | 14,496 | 45.8 | 14.6 | 0.48 | 94 | 1.20 | 18.5 |
| CEM open-loop schedule search, objective: audited score | reference | 3.87 | 3.63 |  |  | 24,160 | 41.4 | 13.2 | 0.52 | 93 | 1.19 | 14.2 |

Runs whose `config.json` lists host `AMD EPYC 7R13` (MBPO seeds 3–5, the audited-reward MBPO seeds, the seed-1 ablations, SAC and PPO seed 1) ran on a rented 48-core cloud CPU with one run per process and the same wall-clock caps; all others ran on the 16-thread laptop. Re-evaluating the cloud-trained checkpoints on the laptop reproduces their returns to within 4 × 10⁻⁶.

"Return" is the benchmark score of the final policy (one deterministic episode). "Best during training" is the highest deterministic evaluation seen during training; with a deterministic environment and no held-out test set, it is selected on the benchmark itself and should be read as an optimistic anytime number. "Sim. steps to beat PI" is the number of simulator steps used for training when a deterministic evaluation first exceeded 3.7919. Wall times were measured on a 16-thread laptop CPU that was **shared with two other heavy workloads** for most of the session (load average 20–40); on an idle machine the same runs are 3–10× faster, so the step counts, not the minutes, are the comparable quantity.

![Where each policy's return comes from, with its audited score](figures/reward_components.png)

![Learning curves](figures/learning_curves.png)

![Trajectories](figures/trajectories.png)

![Offline RL](figures/offline.png)

### What the numbers say

**1. Model-free RL: a low-current plateau with little data, the Q loophole with more.** On the shared laptop PPO (14,128 simulator steps) and SAC (11,192) ended at 2.99 and 2.92, below the random policy (3.23), by keeping I_p near 3–4 MA: that collects the q_min and q95 terms in full and the H98 term after the scheduled pedestal, but almost none of the fusion term. The same 45-minute budget on a 48-core cloud CPU gave SAC 74,872 and PPO 112,136 steps, and both then found the loophole of [Limitations](05-limitations.md#the-q-loophole-found-by-rl): SAC 27.08, PPO 48.98, with flat-top auxiliary power of 0.1–0.2 MW and Q up to 755. Their audited scores are 1.99 and 3.53.

**2. MBPO beats PI in a few thousand simulator steps, usually by the same loophole.** Across the seven MBPO runs with the default training reward (seeds 0–5 under the final protocol and one first-protocol run) the final returns are 2.98, 18.42, 2.08, 3.01, 10.82, 3.45 and 3.15. Four of the seven exceeded PI during training, after 1,364 to 2,416 simulator steps; the two highest final policies (18.42, 10.82) are exploits with audited scores of 1.89 and 2.01. With the full 1,739-dimensional observation, MBPO seed 1 ended at 5.63, audited 3.69: the best audited score of any learned policy here, above PI's 3.50, though its best checkpoint during training was a 21.29 exploit.

**3. Training on the audited reward removes the exploit, and the benefit with it.** MBPO trained on the `patched` reward (the audited score as training signal, 25 simulator episodes, three seeds) ended at −997.92 (a bounds failure in the final episode), 2.98 and 3.16, audited 2.98 and 3.12 for the two that finished. None exploited the reward; none reached PI's audited 3.50 within budget.

**4. Offline RL from PI logs: coverage decides.** Behaviour cloning reproduces whichever data it gets (3.79, 3.85, 3.99 on the three datasets, against behaviour means 3.79, 3.85, 4.01). TD3+BC fails on the single deterministic trajectory (−998: it drifts off the data and leaves the observation bounds) and matches the behaviour policy on the noisy data (3.79 and 4.01). MOPO beats PI on the single trajectory (3.94) by cutting flat-top heating to about 19 MW, which raises Q, and collapses to the low-current plateau on the noisy data (2.88, 2.01). After the audit, the imitation learners on the σ = 0.3 data (3.56) stay above PI (3.50): they copy a behaviour policy whose noise switches some heating on during the ramp.

**5. The open-loop optimum is not far above PI once the loophole is closed.** CEM over a 9-parameter schedule reached 4.08 on the benchmark objective (96 episodes, 45.8 min, audited 3.57) and 3.87 when optimising the audited score directly (160 episodes, 41.4 min, audited 3.63). Neither search found the Q loophole within its budget. On the audited score the ranking is MBPO full-observation seed 1 (3.69) > CEM (3.63) > imitation of noisy PI (3.56) > PI (3.50) > open-loop (3.41): a spread of 0.28, small next to the 1–45 points the loophole is worth.

**6. Ablations.** Observation set (MBPO): `scalars` failed (seed 0, −999.32) or plateaued (seed 1, 2.97); `full` reached 3.12 (seed 0, 735 steps on the loaded laptop) and 5.63 (seed 1). Reward: the raw benchmark reward led to the exploit in 594 steps on seed 0 (best 8.85) but not on seeds 1–2 (3.06, 2.27); `qmin_safe` kept q_min above 1 throughout and ended at 3.00. With one to three seeds each and returns inside the MBPO seed spread, only the reward effect (exploit or not) is clear.

**What longer training changes.** The cloud runs answer part of this already: 5–8× more simulator steps took PPO and SAC from the plateau straight into the loophole. On the benchmark reward, more compute makes the scores larger, not more meaningful. On the audited score, the room above PI appears to be a few tenths (CEM 3.63, best learned 3.69); finding out whether feedback policies can use more of it is the point of [opening 3](06-open-questions.md#3-does-feedback-matter-a-randomised-gym-torax).

