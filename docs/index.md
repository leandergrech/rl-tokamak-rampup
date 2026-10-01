# RL for tokamak current ramp-up

A literature review and a runnable CPU codebase for reinforcement learning on the **Gym-TORAX ITER hybrid ramp-up** benchmark (Mouchamps, Malherbe, Bolland, Ernst, University of Liège; [arXiv 2510.11283](https://arxiv.org/abs/2510.11283)), which wraps Google DeepMind's TORAX transport simulator. The agent sets the plasma current and the NBI and ECRH heating power once per second for 150 s; the published baselines are a PI controller (3.79), the open-loop reference (3.40) and a random policy (−10.79), and no RL result had been published on it.

Code: <https://github.com/leandergrech/rl-tokamak-rampup>. Written for Leander Grech (RL for physical control; new to fusion); everything is checkable against the linked sources and the files in `data/`.

## Headline results

| Policy | Benchmark return | Audited score | Simulator steps |
|---|---|---|---|
| PI controller (paper: 3.79) | 3.79 | 3.50 | – |
| Open-loop reference (paper: 3.40) | 3.41 | 3.41 | – |
| Random policy, 20 seeds (paper: −10.79) | 3.23 ± 0.06, 0 failures | – | – |
| PPO, seed 0 / seed 1 | 2.99 / **48.98** | 2.01 / 3.53 | 14,128 / 112,136 |
| SAC, seed 0 / seed 1 | 2.92 / **27.08** | 2.01 / 1.99 | 11,192 / 74,872 |
| MBPO, default reward, seeds 0–5 (final policies) | 2.08 – **18.42** | 1.89 – 2.96 | 1,480 – 3,775 |
| MBPO, full observation, seed 1 | 5.63 | **3.69** | 2,177 |
| MBPO trained on the audited reward, 3 seeds | −997.92, 2.98, 3.16 | −997.96, 2.98, 3.12 | ≈ 3,700 |
| TD3+BC on noisy PI logs (σ 0.3) | 4.01 | 3.56 | 0 online |
| CEM open-loop schedule, audited objective | 3.87 | 3.63 | 24,160 |

What this repo found:

1. **The published PI and open-loop numbers reproduce exactly on gymtorax 1.0.0 / TORAX 1.0.3; the random-policy number (−10.79) does not** (3.23 ± 0.06, no failures in 20 episodes), and the current gymtorax 1.1.1 changes all three ([details](01-problem.md#which-version-is-the-benchmark)).
2. **The benchmark reward is exploitable.** Its fusion-gain term Q/10 is uncapped and its H-mode test is a core-temperature threshold under a time-scheduled pedestal, so switching the heating off after t = 105 s sends Q = P_fus/P_aux into the hundreds. A fixed open-loop sequence scores 22.74; MBPO, SAC and PPO found variants of it on their own (18.42, 27.08, 48.98) ([mechanism](05-limitations.md#the-q-loophole-found-by-rl)).
3. **Under an audited score** (Q capped at 10, H-mode only while P_SOL ≥ P_LH), the best learned policy scores 3.69 against PI's 3.50 and the best open-loop schedule found 3.63: the real headroom above PI is a few tenths.
4. A fork of Gym-TORAX with an additive `IterHybridAudited-v0` environment, tests and a baseline table is on [`leandergrech/gymtorax`, branch `fix/audited-iter-hybrid-reward`](https://github.com/leandergrech/gymtorax/tree/fix/audited-iter-hybrid-reward).

![Where each policy's return comes from](figures/reward_components.png)


## How to read this site

| If you want to… | Read |
|---|---|
| get oriented from an RL background, with a two-week plan | [For Leander](for-leander.md) |
| see the task as an MDP, and what "solved" should mean | [1. The control problem](01-problem.md) |
| learn the physics you need (q, β_N, Greenwald limit, H-mode, current diffusion) | [2. Domain primer](02-primer.md) |
| see who did what, 2019–2026 | [3. Timeline](03-timeline.md) |
| compare published designs, and see this repo's baseline numbers | [4. Designs and results](04-designs.md) |
| know what fails and by how much | [5. Limitations](05-limitations.md) |
| pick a research direction | [6. Open questions](06-open-questions.md) |
| check a source | [7. References](07-references.md) |

## Reproduce

```bash
git clone https://github.com/leandergrech/rl-tokamak-rampup && cd rl-tokamak-rampup
python3.12 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest
bash scripts/reproduce.sh
```

`reproduce.sh` checks the PI and open-loop numbers against the paper, re-evaluates every stored checkpoint (the environment is deterministic, so each must match its stored return to a relative 10⁻⁶) and rebuilds `data/results/summary.md` and the figures; it took 55 min on a busy 16-thread laptop. `bash scripts/reproduce.sh --full` retrains everything.
