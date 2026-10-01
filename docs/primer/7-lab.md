---
hide:
  - toc
icon: rt/lab
---

# :rt-lab: The Ramp-up Lab

!!! abstract "What this is"

    A reduced model of the Gym-TORAX ITER hybrid ramp-up that runs in your browser: the same actuators, the same 151 one-second steps, the same reward, and physics that follows the equations of the physics chapters in simplified form. Presets **replay the recorded actions of real TORAX episodes** on the Lab model and overlay TORAX as dashed lines, so you always see how far the toy is from the real thing. The sandbox lets you be the agent. The benchmark designer lets you change the reward and the simulator assumptions and see what every policy would have scored. It is a thinking tool, not a substitute for TORAX: confirm anything interesting there.

<div class="rt-widget" data-widget="lab" data-title="The Ramp-up Lab"></div>

## How to use it

- **Pick a preset** to replay a recorded episode, then press **Play** or click the time stamps in the story. Dashed lines are TORAX; solid lines are the Lab.
- **Take the controls from here** at any moment to continue from that state yourself: one action per second, *Run* for real time or *Step 1 s* to act like `env.step(a)`. The sandbox preset starts you at t = 0.
- **Pin this run** to keep it as a grey line while you try something else (up to three).
- **∑ equations** on any panel opens the equations behind it, with links to the [equation sheet](equations.md) and the chapter.
- **Simulator assumptions** change the physics and replay the same actions open-loop: the pedestal can be triggered by power instead of a clock, sawteeth can be switched on, transport and impurity content can be perturbed.
- **Reward and benchmark designer**: the benchmark and audited returns are always shown; the *custom* column is yours (Q cap, gate, penalties, termination rules). The physics audit lists what the benchmark does not check.
- Links can open the Lab in a given state: `?preset=heating_cut&t=110&tab=T&color=q&pedestal=power&sawtooth=1`.

## Guided experiments

Each one takes a few minutes. Predict first, then look.

1. **Current penetration.** [PI at 40 s](7-lab.md?preset=pi&t=40&tab=j&color=j), then [play on](7-lab.md?preset=pi&t=40&tab=q&color=q&play=1). *Predict:* when does q on axis cross 1? (TORAX: 51 s.) Then open [early heating](7-lab.md?preset=early_heat&t=80&tab=q&color=q): what did heating from 10 s do to the q profile?
2. **The scheduled pedestal.** [Heating cut at 106 s](7-lab.md?preset=heating_cut&t=106&tab=T). Note the badge on the plasma view: the reward still counts this as H-mode. Now switch *pedestal: power-triggered* in the assumptions panel. *Predict* the benchmark return before you look. Then load PPO's exploit with the same switch: it heated from the first second, so on the Lab it enters H-mode early and keeps it on alpha power. Whether TORAX would agree is exactly the kind of question the Lab is for.
3. **Be the agent.** [Sandbox](7-lab.md?preset=sandbox&tab=q). Ramp at full rate with no heating until 100 s, then full heating. Pin it. Reset, and this time give 20 MW of ECRH from t = 10 s. Compare q_min at 100 s and both returns.
4. **Exploit the benchmark yourself.** From [PI at 104 s](7-lab.md?preset=pi&t=104&tab=T), take the controls, press *Heating off* and *Run*. Watch Q, the per-second reward bars, and the audit list. Then set the custom gate to *pedestal up and P_SOL ≥ P_LH*.
5. **Steer the ECRH.** In the sandbox, put 20 MW of ECRH at ρ̂ = 0.1 and then at ρ̂ = 0.6 during the ramp. Which keeps q_min higher, and why? ([How the current gets in](3-current-diffusion.md): heating where the current would otherwise penetrate.)
6. **Robustness, the "control level".** Load the [best audited schedule](7-lab.md?preset=cem_audited&tab=T) and set *transport ×* to 1.5, then 0.7. A fixed schedule cannot react; how much of its score survives? Try the same with PI. This is the experiment [Open question 3](../06-open-questions.md#3-does-feedback-matter-a-randomised-gym-torax) proposes on TORAX.
7. **Sawteeth.** Switch the sawtooth model on for [PI](7-lab.md?preset=pi&t=120&tab=T&sawtooth=1). How do T_e(0), q_min and the benchmark return change? Would the heating cut still pay with sawteeth on?
8. **Design a reward.** Open the custom reward, add a Greenwald penalty and an end-of-episode rule at f_GW > 1.2. Go through the presets and write down the ranking. Does any honest policy beat PI? Does any exploit survive?

## Model card {#model-card}

**What it is.** A 1D model on 51 radial nodes of an elongated cylinder with ITER's dimensions (R = 6.2 m, a = 2.0 m, B = 5.3 T, κ = 1.7). It evolves the enclosed current I(r) (current diffusion with Spitzer–neoclassical resistivity, bootstrap and driven currents), the electron and ion temperatures (critical-gradient transport with ohmic, NBI, ECRH and alpha heating, radiation and electron–ion exchange, the pedestal as a boundary value at ρ̂ = 0.91), and a 0-D line density that relaxes towards a Greenwald-scaled target. The reward and the audited reward are computed with exactly the formulas of Gym-TORAX and this repo. Every equation is on the [equation sheet](equations.md); the code is `docs/javascripts/tokamak-model.js` (about 500 lines, no dependencies).

**How it was calibrated.** About twenty constants (transport, resistivity and geometry factors, heating split, density response, bootstrap and ECCD efficiency) were fitted by random search to the per-second TORAX traces of six recorded episodes, minimising the error in T_e(0), T_i(0), q_min, q95, j(0), Q, H98, Greenwald fraction and P_SOL/P_LH. Re-run with `node scripts/calibrate_lab_model.mjs` (add `--fit 300` to search again). The recorded actions come from `docs/assets/widgets/lab.json`, written by `python scripts/make_lab_data.py`.

**How close it is.** Same actions, TORAX against the Lab (end values at t = 151 s, TORAX / Lab):

| Episode (recorded actions) | TORAX benchmark | Lab benchmark | Lab audited | q_min < 1 from (TORAX) | (Lab) | q_min | T_e(0) [keV] | Q | f_GW |
|---|---|---|---|---|---|---|---|---|---|
| Open-loop reference | 3.41 | 3.41 | 3.41 | 69 | 68 | 0.63 / 0.61 | 23.2 / 22.2 | 7.7 / 10.4 | 1.19 / 1.23 |
| PI controller | 3.79 | 3.45 | 3.32 | 51 | 57 | 0.41 / 0.39 | 27.5 / 22.9 | 14.6 / 14.6 | 1.19 / 1.19 |
| Heating cut at 105 s | 22.74 | 34.43 | 2.30 | 69 | 68 | 0.60 / 0.58 | 21.4 / 21.2 | 270 / 446 | 1.01 / 0.96 |
| CEM schedule, audited objective | 3.87 | 3.67 | 3.50 | 59 | 62 | 0.52 / 0.50 | 24.9 / 21.4 | 14.2 / 14.5 | 1.19 / 1.16 |
| TD3+BC on noisy PI logs | 4.01 | 3.61 | 3.40 | 56 | 65 | 0.43 / 0.41 | 27.3 / 20.2 | 16.9 / 14.7 | 1.20 / 1.17 |
| MBPO seed 1 (exploit) | 18.42 | 12.84 | 1.85 | 53 | 70 | 0.67 / 0.60 | 22.5 / 16.1 | 123 / 125 | 1.06 / 1.12 |
| PPO seed 1 (exploit) | 48.98 | 35.92 | 3.62 | 93 | 96 | 0.71 / 0.78 | 27.3 / 21.0 | 755 / 415 | 1.23 / 1.13 |

The table was computed with Node.js (`scripts/calibrate_lab_model.mjs` uses the same model file). Browsers implement `exp` and `pow` slightly differently, and the stiff transport amplifies that on the exploit episodes, so the Lab may show returns about 1 % different from the table there.

**Where it is wrong, and why.**

- **The flat-top core runs cooler than TORAX on the highest-current trajectories** (PI: 23 keV against 27.5 keV at the end), while Q stays close (14.6 on both) because density and ion temperature compensate. Treat absolute temperatures as ±20 %.
- **q_min crosses 1 a few seconds late** for the fastest ramps (PI: 57 s against 51 s) and much later for MBPO seed 1 (70 s against 53 s).
- **Heating during the ramp** (PPO, MBPO, TD3+BC heat from the first seconds): the Lab keeps the current out of the core longer than TORAX (PPO at 99 s: j(0) = 0.9 against 1.5 MA/m²), so q_min stays high for longer. Bootstrap and ECCD at low current are the least constrained parts of the model.
- **The low-current exploit is only partly reproduced.** MBPO seed 1 ends at 3 MA with the heating off, and TORAX still reports T_e(0) ≈ 22 keV and H98 ≈ 4.2: its turbulent transport nearly vanishes at low current and power. The Lab keeps a floor diffusivity, so this episode scores 12.8 there instead of 18.4. An H98 of 4 is itself a reason to distrust that corner of the benchmark.
- **Exploit returns differ in size but not in rank**: the heating cut scores 34.4 on the Lab against 22.7 on TORAX, PPO's episode 35.9 against 49.0. On both simulators every exploit scores far above every honest policy on the benchmark reward, and between 1.9 and 3.6 on the audited one.
- **Not modelled at all:** particle transport (density is 0-D), rotation, fast-ion physics, impurity transport, the low-density branch of the L–H threshold, and the TORAX bounds file (the Lab never returns −1000 unless the custom reward's termination rules say so).

**What it is good for.** Building intuition for the mechanisms (current penetration, stiffness, the pedestal, the reward's leaks), ranking the effect of a benchmark change on the recorded policies before implementing it, and generating hypotheses to test on TORAX. **What it is not good for:** reporting a number. Every result in [Designs and results](../04-designs.md) comes from TORAX.

[← From physics to reward](6-reward.md) · [Equation sheet](equations.md) · [Gaps, status and glossary →](8-field.md)
