---
hide:
  - toc
icon: rt/lab
---

# :rt-lab: The Ramp-up Lab

!!! abstract "What this is"

    A reduced model of the Gym-TORAX ITER hybrid ramp-up that runs in your browser: the same actuators, the same 151 one-second steps, the same reward, and physics that follows the equations of the physics chapters in simplified form. Presets **replay the recorded actions of real TORAX episodes** on the Lab model and overlay TORAX as dashed lines, so you always see how far the toy is from the real thing. Every preset is labelled by **who turns the knobs**: a schedule (*open loop*), a controller that reads the plasma (*feedback*), or you. The knobs panel shows the three actuators move in real time and what the controller read to move them, and feedback controllers (PI and the learned policies) can also **run live on the Lab**, closing their loop on its plasma instead of replaying what they did on TORAX. The sandbox lets you be the agent. The benchmark designer lets you change the reward and the simulator assumptions and see what every policy would have scored. It is a thinking tool, not a substitute for TORAX: confirm anything interesting there.

<div class="rt-widget" data-widget="lab" data-title="The Ramp-up Lab"></div>

## How to use it

- **Pick a preset** to replay a recorded episode, then press **Play** or click the time stamps in the story. Dashed lines are TORAX; solid lines are the Lab. Presets are grouped by who turns the knobs: **open loop** (amber), **feedback** (teal), **you** (pink); see [Open loop and feedback](#open-loop-and-feedback).
- **The knobs panel** shows the three actuators as dials and as traces through the episode, with the signal path from the plasma to the controller: what it measured (PI: j(0) against its target; a network: its 60 or 64 inputs as a strip of cells), what it computed (PI's error and current request; a residual agent's PI proposal and the network's correction, in pink), and the knob settings that result.
- **Recorded or live.** For a feedback preset, *recorded on TORAX* replays the knobs it set while it was reading TORAX; *controller live on the Lab* runs the controller itself on the Lab's plasma, every second (PI in JavaScript, learned policies through their exported networks). Schedules have no live mode: they read nothing, so they are the same on any plasma.
- **Take the controls from here** at any moment to continue from that state yourself: one action per second, *Run* for real time or *Step 1 s* to act like `env.step(a)`. The sandbox preset starts you at t = 0.
- **Pin this run** to keep it as a grey line while you try something else (up to three).
- **∑ equations** on any panel opens the equations behind it, with links to the [equation sheet](equations.md) and the chapter.
- **Simulator assumptions** change the physics and re-run the episode: the pedestal can be triggered by power instead of a clock, sawteeth can be switched on, transport and impurity content can be perturbed. Schedules and recorded knobs are replayed unchanged; a controller running live reads the changed plasma and turns its knobs differently.
- **Reward and benchmark designer**: the benchmark and audited returns are always shown; the *custom* column is yours (Q cap, gate, penalties, termination rules). The physics audit lists what the benchmark does not check.
- Links can open the Lab in a given state: `?preset=heating_cut&t=110&tab=T&color=q&pedestal=power&sawtooth=1`, or with a controller live on a perturbed plasma: `?preset=pi&live=1&transport=1.5`.

## Open loop and feedback {#open-loop-and-feedback}

An **open-loop** controller fixes every knob setting before the shot: the knobs are a function of time alone, so they are the same whatever the plasma does. A **feedback** controller measures the plasma during the shot and computes the knobs from what it measures, so a different plasma gets different knobs. In this benchmark both kinds act once per second on the same three knobs: the I_p ramp rate (±0.2 MA/s), the NBI power (0–33 MW) and the ECRH power (0–20 MW).

| Preset | Who turns the knobs | What it reads each second | Live on the Lab |
|---|---|---|---|
| Open-loop reference, heating cut, early heating | a schedule | the clock | – |
| Best audited schedule | a schedule found by cross-entropy search (9 numbers) | the clock | – |
| PI controller | PI on I_p; heating on the reference schedule | j(0), against a target rising from 0.6 to 2.0 MA/m² | JavaScript port of `controllers.py` |
| PPO on PI, MBPO on PI | PI plus a learned correction to all three knobs | 64 numbers: the 60-number observation, PI's proposal and its integral | exported networks |
| PPO exploit, MBPO seed 1, TD3+BC | a learned policy | the 60-number observation (time, last action, 18 scalars, 5 profiles at 7 radii) | exported networks |
| Sandbox | you | the screen | – |

Three things the knobs panel makes visible:

- **A recorded feedback episode is open loop on the Lab.** In *recorded* mode, PI's knobs are the ones it set while reading TORAX's plasma; replayed on the Lab, nothing closes the loop, which is why changing an assumption moves the plasma but not the knobs. *Controller live on the Lab* closes the loop on the Lab's plasma.
- **PI is feedback on one knob, for two thirds of the shot.** It reads j(0) and sets I_p until t = 100 s, then holds I_p; its heating follows the same clock as the open-loop reference. The residual agents (PPO on PI, MBPO on PI) correct all three knobs throughout.
- **A learned policy reads the Lab's version of its inputs.** The Lab builds the same observation vector the RL wrapper builds from TORAX, from its own reduced physics, which differs from TORAX by up to about 20 %. A network trained on TORAX can act differently here. Live, PPO's exploit keeps 16 MW of NBI after 104 s instead of cutting it to zero, and TD3+BC turns on 16 MW of ECRH at 30 s, which it never did on TORAX. That is the sim-to-real gap in miniature: a policy learns what worked on one simulator, not a law that holds on every plasma.

**Feedback is not automatically robust.** Audited score on the Lab when the transport is scaled, for each recorded episode replayed as recorded (open loop) and with its controller running live:

ROBUSTNESS_TABLE

PI live does not protect its audited score against the transport change any better than its replayed knobs: PI regulates j(0), not the reward, so its corrections are right for j(0) and neutral or wrong for the score. Feedback helps when what it measures and regulates is what matters. Whether learned feedback policies keep their advantage across plasmas is [Open question 3](../06-open-questions.md#3-does-feedback-matter-a-randomised-gym-torax), to be answered on TORAX, not here.

**How the live controllers are checked** (`node scripts/check_lab_control.mjs fixture.json --robustness`, fixture from `python scripts/make_lab_fixture.py`): every exported network reproduces its PyTorch actions to 10⁻⁵; the PI port, fed TORAX's recorded j(0), reproduces the recorded TORAX PI commands to 4 × 10⁻⁵ MA; and the observation vector built in JavaScript from TORAX quantities matches `src/rl_tokamak/env.py` to 10⁻⁵, feature by feature. The networks are exported by `python scripts/export_lab_policies.py` and loaded only when live mode is first switched on (80–860 kB each).

## Guided experiments

Each one takes a few minutes. Predict first, then look.

1. **Current penetration.** [PI at 40 s](7-lab.md?preset=pi&t=40&tab=j&color=j), then [play on](7-lab.md?preset=pi&t=40&tab=q&color=q&play=1). *Predict:* when does q on axis cross 1? (TORAX: 51 s.) Then open [early heating](7-lab.md?preset=early_heat&t=80&tab=q&color=q): what did heating from 10 s do to the q profile?
2. **The scheduled pedestal.** [Heating cut at 106 s](7-lab.md?preset=heating_cut&t=106&tab=T). Note the badge on the plasma view: the reward still counts this as H-mode. Now switch *pedestal: power-triggered* in the assumptions panel. *Predict* the benchmark return before you look. Then load PPO's exploit with the same switch: it heated from the first second, so on the Lab it enters H-mode early and keeps it on alpha power. Whether TORAX would agree is exactly the kind of question the Lab is for.
3. **Be the agent.** [Sandbox](7-lab.md?preset=sandbox&tab=q). Ramp at full rate with no heating until 100 s, then full heating. Pin it. Reset, and this time give 20 MW of ECRH from t = 10 s. Compare q_min at 100 s and both returns.
4. **Exploit the benchmark yourself.** From [PI at 104 s](7-lab.md?preset=pi&t=104&tab=T), take the controls, press *Heating off* and *Run*. Watch Q, the per-second reward bars, and the audit list. Then set the custom gate to *pedestal up and P_SOL ≥ P_LH*.
5. **Steer the ECRH.** In the sandbox, put 20 MW of ECRH at ρ̂ = 0.1 and then at ρ̂ = 0.6 during the ramp. Which keeps q_min higher, and why? ([How the current gets in](3-current-diffusion.md): heating where the current would otherwise penetrate.)
6. **Robustness, the "control level".** Load the [best audited schedule](7-lab.md?preset=cem_audited&tab=T&transport=1.5) with *transport ×* 1.5, then try 0.7. Its knobs do not move: a schedule cannot react. Now [PI live at ×1.5](7-lab.md?preset=pi&live=1&tab=j&transport=1.5): watch the knobs panel as j(0) runs ahead of its target and PI ramps I_p back down, and compare with the dashed TORAX knobs. *Predict:* does reacting help PI's audited score? (See [the table above](#open-loop-and-feedback).) This is the experiment [Open question 3](../06-open-questions.md#3-does-feedback-matter-a-randomised-gym-torax) proposes on TORAX.
7. **Sawteeth.** Switch the sawtooth model on for [PI](7-lab.md?preset=pi&t=120&tab=T&sawtooth=1). How do T_e(0), q_min and the benchmark return change? Would the heating cut still pay with sawteeth on?
8. **Design a reward.** Open the custom reward, add a Greenwald penalty and an end-of-episode rule at f_GW > 1.2. Go through the presets and write down the ranking. Does any honest policy beat PI? Does any exploit survive?
9. **Same network, another plasma.** Load the [PPO exploit](7-lab.md?preset=ppo_s1&t=110&tab=T) and play it in *recorded* mode, then switch the knobs panel to *controller live on the Lab*. *Predict* before you switch: will it cut the heating at 104 s as it did on TORAX? Watch the strip of cells under "what it reads now" around 100 s and compare the two benchmark returns.

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

See also the [equation sheet](equations.md).
