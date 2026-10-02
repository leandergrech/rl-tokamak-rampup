---
icon: rt/tokamak
---

<div class="rt-hero" markdown>

# RL for tokamak current ramp-up

<p>A literature review and a runnable CPU codebase for reinforcement learning on the <strong>Gym-TORAX ITER hybrid ramp-up</strong> benchmark (Mouchamps, Malherbe, Bolland, Ernst, University of Liège; <a href="https://arxiv.org/abs/2510.11283" style="color:#fff;text-decoration:underline">arXiv 2510.11283</a>), built on Google DeepMind's TORAX transport simulator. Once per second for 150 s the agent sets the plasma current and two heating powers; the paper's baselines are a PI controller (3.79), the open-loop reference (3.40) and a random policy (−10.79).</p>

<div class="rt-stats">
<div class="rt-stat"><b>3.79</b><span>PI controller, reproduced exactly on gymtorax 1.0.0 / TORAX 1.0.3</span></div>
<div class="rt-stat"><b>48.98</b><span>highest benchmark return, found by PPO through a reward loophole</span></div>
<div class="rt-stat"><b>3.69</b><span>best learned policy under the audited score (PI: 3.50)</span></div>
<div class="rt-stat"><b>32 / 32</b><span>stored checkpoints re-evaluate to their recorded return</span></div>
</div>

</div>

Code: <https://github.com/leandergrech/rl-tokamak-rampup>. Written for Leander Grech (RL for physical control; new to fusion). Every number links to a file in `data/` or to a source in [References](07-references.md).

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
| PPO on PI (residual, audited reward), 5 seeds | 4.02–4.48 | **3.632 ± 0.037** | ≈ 30,000 each |
| PPO on PI, 2 long runs | 12.66 / 5.70 | **3.73 / 3.74** | 120,000 each |
| MBPO on PI (residual, audited reward), 5 seeds, final (best checkpoints) | 3.88–8.77 | **3.619 ± 0.070** (3.66–3.76) | ≈ 3,000 each (302–604 to beat PI) |

<div class="rt-widget" data-widget="results" data-title="Interactive: every policy, benchmark return against audited score"></div>

What this repo found:

1. **The published PI and open-loop numbers reproduce exactly on gymtorax 1.0.0 / TORAX 1.0.3; the random-policy number (−10.79) does not** (3.23 ± 0.06, no failures in 20 episodes), and the current gymtorax 1.1.1 changes all three ([details](01-problem.md#which-version-is-the-benchmark)).
2. **The benchmark reward is exploitable.** Its fusion-gain term Q/10 is uncapped and its H-mode test is a core-temperature threshold under a time-scheduled pedestal, so switching the heating off after t = 105 s sends Q = P_fus/P_aux into the hundreds. A fixed open-loop sequence scores 22.74; MBPO, SAC and PPO found variants of it on their own (18.42, 27.08, 48.98) ([mechanism](05-limitations.md#the-q-loophole-found-by-rl)).
3. **Under an audited score** (Q capped at 10, H-mode only while P_SOL ≥ P_LH), the best policy learned from scratch scores 3.69 against PI's 3.50 and the best open-loop schedule found 3.63: the real headroom above PI is a few tenths.
4. **RL on top of PI beats it without the loophole.** With the agent outputting a correction to the PI controller's action, trained and checkpointed on the audited score, PPO ends at 3.63 ± 0.04 audited over five seeds (every seed above PI's 3.50) after about 30,000 simulator steps, and MBPO passes PI after 302–604 steps (final 3.62 ± 0.07, best checkpoints 3.66–3.76). Two runs with four times the PPO budget reach 3.73 and 3.74, the best final scores here. Every agent heats during the ramp, which keeps q_min above 1 for up to 16 s longer ([how it works and where the design comes from](04a-rl-on-pi.md); [results](04-designs.md#what-the-numbers-say)). The [Ramp-up Lab](primer/7-lab.md) shows every controller's knobs live, separates feedback from open-loop control, and runs PI and the learned policies closed-loop on its own plasma.
5. A fork of Gym-TORAX with an additive `IterHybridAudited-v0` environment, tests and a baseline table is on [`leandergrech/gymtorax`, branch `fix/audited-iter-hybrid-reward`](https://github.com/leandergrech/gymtorax/tree/fix/audited-iter-hybrid-reward).
6. **A physics-consistent environment removes the loophole at its source.** With TORAX 1.4's power-triggered pedestal, density control and two operating limits (Greenwald density; the inductance window ITER's vertical control needs), the heating cut scores 1.81 instead of 20.96. The paper's PI gains break the inductance window within 9 s; re-tuned, PI scores 3.24, and PPO on PI reaches 3.49 ± 0.14 over five seeds, every seed above it. MBPO needed TORAX's L-H rule inside its model before it stopped trimming the heating below the threshold. On 33 held-out plasmas drawn from the measured uncertainty, the true L-H threshold decides almost everything, and agents trained on randomised plasmas mostly learned to stay at low current, which the reward allows ([A physics-consistent ramp-up](04b-physics-env.md)).

![Where each policy's return comes from](figures/reward_components.png)


## How to read this site

<div class="grid cards" markdown>

-   :rt-onramp:{ .lg .middle } **For Leander**

    ---

    What transfers from your RL background, what is new, and a two-week plan.

    [:octicons-arrow-right-24: Start here](for-leander.md)

-   :rt-loop:{ .lg .middle } **The control problem**

    ---

    The task as an MDP, the reward term by term (with an interactive explorer), and what "solved" should mean.

    [:octicons-arrow-right-24: The MDP](01-problem.md)

-   :rt-primer:{ .lg .middle } **Domain primer**

    ---

    Eight short chapters from the machine to the reward, an equation sheet, and the **Ramp-up Lab**: replay TORAX episodes on a calibrated in-browser model, drive the plasma yourself, redesign the reward.

    [:octicons-arrow-right-24: The physics](02-primer.md) · [:rt-lab: The Lab](primer/7-lab.md)

-   :rt-timeline:{ .lg .middle } **Timeline 2018–2026**

    ---

    Who did what in ML and RL for tokamak control, with headline numbers and links.

    [:octicons-arrow-right-24: The field](03-timeline.md)

-   :rt-results:{ .lg .middle } **Designs and results**

    ---

    Published designs side by side, every baseline of this repo, and how each number is checked.

    [:octicons-arrow-right-24: The results](04-designs.md)

-   :rt-limits:{ .lg .middle } **A physics-consistent ramp-up**

    ---

    H-mode only when the heating earns it, density control, and episodes that end at the Greenwald and vertical-control limits. How realistic it is, piece by piece.

    [:octicons-arrow-right-24: The new environment](04b-physics-env.md)

-   :rt-warning:{ .lg .middle } **Limitations**

    ---

    What the benchmark rewards that it should not (the Q loophole), and what the simulator leaves out.

    [:octicons-arrow-right-24: The caveats](05-limitations.md)

-   :rt-idea:{ .lg .middle } **Open questions**

    ---

    Eight ranked research openings with effort estimates.

    [:octicons-arrow-right-24: What to do next](06-open-questions.md)

-   :rt-books:{ .lg .middle } **References**

    ---

    Every source, the URL actually opened, and what was verified.

    [:octicons-arrow-right-24: The sources](07-references.md)

</div>

## Reproduce

```bash
git clone https://github.com/leandergrech/rl-tokamak-rampup && cd rl-tokamak-rampup
python3.12 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest
bash scripts/reproduce.sh
```

`reproduce.sh` checks the PI and open-loop numbers against the paper, re-evaluates every stored checkpoint (the environment is deterministic, so each must match its stored return to a relative 10⁻⁶) and rebuilds `data/results/summary.md` and the figures; it took 55 min on a busy 16-thread laptop. `bash scripts/reproduce.sh --full` retrains everything.
