---
icon: rt/reward
---

# :rt-reward: From physics to reward

!!! abstract "The question"

    Each reward term is a proxy for a piece of physics from the physics chapters. Which proxies hold, which leak, and what can a benchmark designer change?

## The reward, term by term

Per step, with H = 1 if T_e(0) > 10 keV and T_i(0) > 10 keV, else 0 ([R3](../07-references.md#r3); full statement in [The control problem](../01-problem.md#reward-and-objective)):

$$
r_t = \underbrace{\tfrac{1}{50}\,H\,\tfrac{Q}{10}}_{\text{fusion gain}}
+ \underbrace{\tfrac{1}{50}\,H\,\min(H_{98},1)}_{\text{confinement}}
+ \underbrace{\tfrac{1}{150}\min(q_{\min},1)}_{\text{no } q<1}
+ \underbrace{\tfrac{1}{150}\min(q_{95}/3,1)}_{\text{edge } q}
$$

| Term | Physics it stands for | Chapter | Where the proxy leaks |
|---|---|---|---|
| H gate: T_e(0), T_i(0) > 10 keV | being in H-mode | [:rt-fusion:](4-heat-and-fusion.md#l-mode-h-mode-and-the-pedestal "Heat, confinement and fusion") | a hot core is not H-mode; under the scheduled pedestal the gate passes with the heating off |
| (Q/10)/50 | fusion performance | [:rt-fusion:](4-heat-and-fusion.md#fusion-power-and-the-gain-q "Heat, confinement and fusion") | uncapped, and Q's denominator is the injected power: less heating, more reward |
| min(H98, 1)/50 | confinement quality | [:rt-fusion:](4-heat-and-fusion.md#energy-confinement-time-and-h98 "Heat, confinement and fusion") | capped at 1, so it saturates; fine as a proxy |
| min(q_min, 1)/150 | no sawteeth, hybrid q profile | [:rt-q:](2-safety-factor.md "The safety factor q"), [:rt-limits:](5-limits.md#the-iter-hybrid-scenario "Limits and the operating space") | soft: PI spends 101 s below q = 1 (down to 0.41) and loses only 0.32 of return for it |
| min(q95/3, 1)/150 | distance from the current limit | [:rt-q:](2-safety-factor.md#two-numbers-summarise-the-profile "The safety factor q") | saturates at q95 = 3, so it does not push towards the hybrid q95 ≈ 4 |
| (absent) | density limit, L–H threshold, flux budget, β limit | [:rt-limits:](5-limits.md#what-the-benchmark-enforces "Limits and the operating space") | not represented |

Move the sliders below to price one second of plasma; the presets are real TORAX states.

<div class="rt-widget" data-widget="reward" data-title="Interactive: what one second of plasma is worth"></div>

## Watching the loophole happen

The same reward, summed over real TORAX episodes. The exploits heat early, cut the heating after the scheduled pedestal, and collect Q in the hundreds:

<div class="rt-widget" data-widget="replay" data-title="Interactive: replay the PI controller against three exploits" data-select="pi,heating_cut,mbpo_s1,ppo_s1"></div>

[The heating cut in the Lab](7-lab.md?preset=heating_cut&t=110){ .rt-try } […and with a power-triggered pedestal](7-lab.md?preset=heating_cut&t=110&pedestal=power){ .rt-try } [PPO's exploit](7-lab.md?preset=ppo_s1&t=106){ .rt-try }

## The audited reward

This repo's audit closes the two leaks that RL found, and nothing else (<span class="rt-eqref" data-eq="audited"></span>): Q is capped at 10, ITER's design goal, and the gate also requires P_SOL ≥ P_LH. Under it the best learned policy scores 3.69 against PI's 3.50; the heating cut and MBPO's exploit fall to about 1.9, and PPO's 48.98 episode to 3.53, level with PI ([Designs and results](../04-designs.md#what-the-numbers-say)). The audit deliberately leaves q_min, density and flux alone, so its numbers remain comparable with the benchmark's.

## Levers for a better benchmark

A benchmark is a reward, a termination rule, a simulator configuration and a protocol. The Lab exposes each lever so you can see what it does to every recorded policy before you implement it in Gym-TORAX:

| Lever | In the Lab | What it tests | Cost in Gym-TORAX |
|---|---|---|---|
| Cap Q, or pay P_fus instead of Q | custom reward: Q cap | removes the denominator exploit | a reward change |
| Gate on P_SOL ≥ P_LH or on the pedestal | custom reward: gate | pays only for real H-mode | a reward change (P_LH is already in the observation) |
| Penalise f_GW > 1, q_min < 1 | custom reward: penalties | physical constraints as costs | a reward change |
| Terminate on f_GW or q95 limits | custom reward: end episode if… | constraints as disruptions | a termination rule |
| Predict the pedestal from power | assumptions: power-triggered pedestal | removes the scheduled L–H transition | a wrapper or config change (the pedestal height is a config value); not tried here |
| Enable sawteeth | assumptions: sawtooth model | makes q < 1 cost temperature | enable TORAX's sawtooth model in the config |
| Randomise transport, pedestal timing, Z_eff | assumptions: transport ×, onset, Z_eff | the "control level": feedback vs schedules | a reset distribution; see [Open questions](../06-open-questions.md#3-does-feedback-matter-a-randomised-gym-torax) |
| Charge for solenoid flux | audit: resistive flux | the volt-second budget | needs a flux estimate in the wrapper |

!!! tip "What it means for the agent"

    - **An optimiser finds every leak.** PPO, SAC and MBPO all found the Q loophole without being told; any new term will be stress-tested the same way.
    - **Design the reward against the exploit catalogue.** A useful check for a proposed reward: score PI, the open-loop reference, the heating cut and the RL exploits under it. A good reward should rank the exploits below PI and leave the honest policies' ordering intact. The Lab's benchmark designer does exactly this, approximately, in a second.

??? question "Check yourself"

    1. Why does capping Q at 10 alone not close the loophole? *A capped Q still pays 1/50 per second once Q ≥ 10, and the gated H98 term still pays; the plasma with no heating still counts as H-mode. The gate has to change too.*
    2. Which lever would make the PI baseline itself score worse? *A q_min < 1 or Greenwald penalty, or a termination on f_GW > 1: PI violates both.*
    3. Which lever turns the benchmark into a feedback-control problem? *Randomising the plasma (transport, pedestal timing, initial state): only then can a policy that reacts beat the best fixed schedule.*
