---
hide:
  - navigation
  - toc
icon: rt/lab
---

# :rt-lab: The Ramp-up Lab

!!! abstract "What this is"

    A reduced model of the Gym-TORAX ITER hybrid ramp-up that runs in your browser, in two scenarios: **the benchmark** (Gym-TORAX 1.0, the pedestal on a clock) and **the [physics environment](../04b-physics-env.md)** (TORAX 1.4: H-mode earned by power, density control, episodes that end at the Greenwald and inductance limits). The same actuators, the same one-second steps, the same rewards, and physics that follows the equations of the physics chapters in simplified form. Presets **replay the recorded actions of real TORAX episodes** on the Lab model and overlay TORAX as dashed lines, so you always see how far the toy is from the real thing. Every preset is labelled by **who turns the knobs**: a schedule (*open loop*), a controller that reads the plasma (*feedback*), or you. The knobs panel shows the three actuators move in real time and what the controller read to move them, and feedback controllers (PI and the learned policies) can also **run live on the Lab**, closing their loop on its plasma instead of replaying what they did on TORAX. The sandbox lets you be the agent. The benchmark designer lets you change the reward and the simulator assumptions and see what every policy would have scored. It is a thinking tool, not a substitute for TORAX: confirm anything interesting there.

<div class="rt-widget" data-widget="lab" data-title="The Ramp-up Lab"></div>

## How to use it

The Lab has three layers: **who turns the knobs** above, **the workspace** in the middle, and **the simulation's set-up** below.

- **Above: choose the scenario, then a controller.** *Benchmark* or *Physics environment*: each has its own TORAX episodes, its own PI controller (the paper's gains, or the re-tuned ones), its own rewards and limits. Presets are grouped by who turns the knobs: **open loop** (amber), **feedback** (teal), **you** (pink); see [Open loop and feedback](#open-loop-and-feedback). The story under them explains the episode; click its time stamps to jump there.
- **The side pane stays in view** while the visuals scroll past it, so you can move a control and watch everything respond together. From the top:
    - *Playback*: Play, back to t = 0, speed, **Pin** (keep this run as a grey line in every plot, up to three) and Clear, the time slider, and the episode at a glance (when the heating is on, when the reward pays H-mode, when q_min < 1 and f_GW > 1): click or drag it to jump. Keys: space plays or pauses, ← and → step one second (with shift, ten).
    - *Controller*: for a feedback preset, *recorded on TORAX* (the knobs it set while reading TORAX, replayed) or *live on the Lab* (the controller itself, reading the Lab's plasma every second). Its **hyper-controls**: the PI gains k_p and k_i and the j(0) target of the PI controller, and for the RL agents on top of PI the size of the network's correction (0 is pure PI, 1 the trained agent). Moving any of them switches to live. *Take the controls from here* hands the knobs to you; in the sandbox the side pane holds the I_p ramp, NBI and ECRH sliders, *Run* and *Step 1 s*.
    - *Plasma*: the salient parameters. Benchmark: pedestal scheduled or power-triggered, its onset, sawteeth, transport, Z_eff. Physics environment: **the true L-H threshold relative to the Martin scaling** (its 95 % interval for ITER is 0.54–1.85 ×), the H-mode pedestal height, transport, Z_eff.
    - *Outcome*: three returns next to TORAX's (benchmark, audited and custom; in the physics environment its own return, the benchmark formula and custom), and sparklines of q_min, q95, f_GW, P_SOL/P_LH (P_heat/P_LH), T_e(0), Q, H98 and, in the physics environment, l_i, green or red by whether they sit on the right side of their limit.
- **The visuals**, from the top: the plasma in 3D and the numbers at the cursor; **the knobs panel** (the signal path from plasma to controller, what it measured and computed, dials and knob traces, the network's correction in pink); traces and radial profiles; the operating space; **space-time maps** of T_e, j, q and n_e over radius and time, with the q = 1 surface and where the heating goes, and TORAX's map underneath where it was recorded; **where the power and the current come from** (heating against losses with the P_LH mark; inductive, bootstrap and driven current); and **the reward**, per second and through the episode by term, with the physics audit.
- **Below: the simulation's set-up.** All the Lab's physics parameters (transport, pedestal, density, current, machine and losses), the salient ones shared with the side pane, with *Reset to calibrated*; and the reward designer, which defines the *custom* return. Every change re-runs the episode: schedules and recorded knobs replay unchanged, a controller running live turns its knobs differently.
- **∑ equations** on any panel opens the equations behind it, with links to the [equation sheet](equations.md) and the chapter.
- Links can open the Lab in a given state: `?preset=heating_cut&t=110&tab=T&color=q&pedestal=power&sawtooth=1`, with a controller live on a perturbed plasma: `?preset=pi&live=1&transport=1.5`, or in the physics environment with a higher threshold: `?preset=phys_pi&threshold=1.15`.

## Open loop and feedback {#open-loop-and-feedback}

An **open-loop** controller fixes every knob setting before the shot: the knobs are a function of time alone, so they are the same whatever the plasma does. A **feedback** controller measures the plasma during the shot and computes the knobs from what it measures, so a different plasma gets different knobs. In this benchmark both kinds act once per second on the same three knobs: the I_p ramp rate (±0.2 MA/s), the NBI power (0–33 MW) and the ECRH power (0–20 MW).

| Preset | Who turns the knobs | What it reads each second | Live on the Lab |
|---|---|---|---|
| Open-loop reference, heating cut, early heating | a schedule | the clock | – |
| Best audited schedule | a schedule found by cross-entropy search (9 numbers) | the clock | – |
| PI controller | PI on I_p; heating on the reference schedule | j(0), against a target rising from 0.6 to 2.0 MA/m² | JavaScript port of `controllers.py` |
| PPO on PI, MBPO on PI | PI plus a learned correction to all three knobs ([how](../04a-rl-on-pi.md)) | 64 numbers: the 60-number observation, PI's proposal and its integral | exported networks |
| PPO exploit, MBPO seed 1, TD3+BC | a learned policy | the 60-number observation (time, last action, 18 scalars, 5 profiles at 7 radii) | exported networks |
| *Physics environment:* open-loop reference, heating cut, best schedule | a schedule | the clock | – |
| *Physics environment:* PI controller, re-tuned | PI on I_p (k_p 0.1, k_i 0.3); heating on the clock | j(0), against a target rising from 0.6 to 3.75 MA/m² | JavaScript port with the re-tuned gains |
| *Physics environment:* PPO on PI (30k and 120k steps), randomised training, MBPO on PI | the re-tuned PI plus a learned correction | 67 numbers: the 60, TORAX's confinement state (two flags) and P_heat, PI's proposal and integral | exported networks |
| Sandbox | you | the screen | – |

Three things the knobs panel makes visible:

- **A recorded feedback episode is open loop on the Lab.** In *recorded* mode, PI's knobs are the ones it set while reading TORAX's plasma; replayed on the Lab, nothing closes the loop, which is why changing an assumption moves the plasma but not the knobs. *Controller live on the Lab* closes the loop on the Lab's plasma.
- **PI is feedback on one knob, for two thirds of the shot.** It reads j(0) and sets I_p until t = 100 s, then holds I_p; its heating follows the same clock as the open-loop reference. The residual agents (PPO on PI, MBPO on PI) correct all three knobs throughout.
- **A learned policy reads the Lab's version of its inputs.** The Lab builds the same observation vector the RL wrapper builds from TORAX, from its own reduced physics, which differs from TORAX by up to about 20 %. A network trained on TORAX can act differently here. Live, PPO's exploit keeps 16 MW of NBI after 104 s instead of cutting it to zero, and TD3+BC turns on 16 MW of ECRH at 30 s, which it never did on TORAX. That is the sim-to-real gap in miniature: a policy learns what worked on one simulator, not a law that holds on every plasma.

**Feedback is not automatically robust.** Audited score on the Lab when the transport is scaled, for each recorded episode replayed as recorded (open loop) and with its controller running live:

| Preset | Recorded knobs, transport × 0.7 | × 1 | × 1.5 | Controller live, × 0.7 | × 1 | × 1.5 |
|---|---|---|---|---|---|---|
| Open-loop reference | 3.52 | 3.41 | 3.29 | – | – | – |
| Best audited schedule | 3.56 | 3.50 | 3.40 | – | – | – |
| Heating cut at 105 s | 2.93 | 2.30 | 1.89 | – | – | – |
| PI controller | 3.39 | 3.32 | 3.22 | 3.40 | 3.33 | 3.14 |
| PPO on PI | 3.62 | 3.54 | 3.45 | 3.55 | 3.48 | 3.39 |
| MBPO on PI (best checkpoint) | 3.73 | 3.63 | 3.50 | 3.68 | 3.58 | 3.46 |
| TD3+BC on noisy PI logs | 3.48 | 3.40 | 3.30 | 3.33 | 3.30 | 3.30 |
| PPO exploit | 3.73 | 3.62 | 2.91 | 3.77 | 3.72 | 3.63 |
| MBPO seed 1 (exploit) | 1.89 | 1.85 | 1.83 | 2.04 | 2.06 | 2.06 |

Three readings. PI live does not protect its audited score against the transport change any better than its replayed knobs: PI regulates j(0), not the reward, so its corrections are right for j(0) and neutral or wrong for the score. The residual agents keep their margin over PI when they run live, 0.15–0.32 at every transport setting, so what they learned on TORAX (heat during the ramp) carries over to a different plant. But on the Lab they do not beat their own replayed TORAX knobs: their networks were trained on TORAX's plasma, and here they read a slightly different one. Feedback helps when what it measures and regulates is what matters, and when it was learned on the plant it runs on. Whether learned feedback policies keep their advantage across plasmas is [Open question 3](../06-open-questions.md#3-does-feedback-matter-a-randomised-gym-torax), to be answered on TORAX, not here.

**In the physics environment the uncertain input is the L-H threshold.** Physics-environment return on the Lab when the true threshold is scaled relative to the Martin scaling, recorded knobs against the controller live (`--robustness`, second table):

| Preset (physics environment) | Recorded knobs, threshold × 0.9 | × 1 | × 1.1 | × 1.2 | Controller live, × 0.9 | × 1 | × 1.1 | × 1.2 |
|---|---|---|---|---|---|---|---|---|
| Open-loop reference | 2.99 | 2.97 | 2.95 | 2.95 | – | – | – | – |
| Best open-loop schedule | 3.01 | 3.01 | 1.63 | 1.63 | – | – | – | – |
| PI controller, re-tuned | 3.04 | 3.02 | 1.67 | 1.67 | 3.04 | 3.03 | 3.01 | 1.67 |
| PPO on PI | 3.35 | 3.35 | 1.78 | 1.78 | 3.31 | 3.29 | 1.80 | 1.80 |
| PPO on PI, 120k steps | 4.18 | 4.15 | 1.77 | 1.77 | 4.05 | 3.76 | 2.70 | 1.89 |
| Randomised training, seed 4 | 3.27 | 3.27 | 3.25 | 2.95 | 3.24 | 3.29 | 3.27 | 3.01 |
| Randomised training, seed 2 (3 MA) | 2.01 | 2.01 | 2.01 | 2.01 | 2.01 | 2.01 | 2.01 | 2.01 |
| MBPO on PI | ended at 10 s | ended | ended | ended | 3.29 | 3.15 | 1.72 | 1.72 |

The same picture as on TORAX ([robustness on the physics environment](../04b-physics-env.md#robustness-to-the-measured-uncertainty)): whether H-mode happens decides about 1.5 of the score, the schedules and the 15 MA policies lose it about 10 % above the scaling, the open loop at 12.5 MA and the randomised seed 4 keep it, and the 3 MA policy never had it. PI live keeps H-mode at 1.1 × where its recorded knobs lose it: on the Lab's plasma, reading j(0), it ends at a slightly lower current. MBPO's recorded knobs end the episode at 10 s because the Lab's l_i runs 0.06 below TORAX's in its heated ramp; live, the network stays inside the window.

**How the live controllers are checked** (`node scripts/check_lab_control.mjs fixture.json physics_fixture.json --robustness`, fixtures from `python scripts/make_lab_fixture.py` and, on the physics stack, `python scripts/make_lab_fixture.py --physics`): every exported network reproduces its PyTorch actions to 10⁻⁵; the PI ports, fed TORAX's recorded j(0), reproduce the recorded TORAX PI commands to 4 × 10⁻⁵ MA (paper gains) and 1.3 × 10⁻⁴ MA (re-tuned); and the observation vector built in JavaScript from TORAX quantities matches `src/rl_tokamak/env.py` to 10⁻⁵ in both scenarios, feature by feature. The networks are exported by `python scripts/export_lab_policies.py` (physics runs: `--physics`, on the physics stack) and loaded only when live mode is first switched on (80–870 kB each).

## Guided experiments

Each one takes a few minutes. Predict first, then look.

1. **Current penetration.** [PI at 40 s](7-lab.md?preset=pi&t=40&tab=j&color=j), then [play on](7-lab.md?preset=pi&t=40&tab=q&color=q&play=1). *Predict:* when does q on axis cross 1? (TORAX: 51 s.) Then open [early heating](7-lab.md?preset=early_heat&t=80&tab=q&color=q): what did heating from 10 s do to the q profile?
2. **The scheduled pedestal.** [Heating cut at 106 s](7-lab.md?preset=heating_cut&t=106&tab=T). Note the badge on the plasma view: the reward still counts this as H-mode. Now switch the side pane to *power-triggered*. *Predict* the benchmark return before you look. Then load PPO's exploit with the same switch: it heated from the first second, so on the Lab it enters H-mode early and keeps it on alpha power. Whether TORAX would agree is exactly the kind of question the Lab is for.
3. **Be the agent.** [Sandbox](7-lab.md?preset=sandbox&tab=q). Ramp at full rate with no heating until 100 s, then full heating. Pin it. Reset, and this time give 20 MW of ECRH from t = 10 s. Compare q_min at 100 s and both returns.
4. **Exploit the benchmark yourself.** From [PI at 104 s](7-lab.md?preset=pi&t=104&tab=T), take the controls, press *Heating off* and *Run*. Watch Q, the per-second reward bars, and the audit list. Then set the custom gate to *pedestal up and P_SOL ≥ P_LH*.
5. **Steer the ECRH.** In the sandbox, put 20 MW of ECRH at ρ̂ = 0.1 and then at ρ̂ = 0.6 during the ramp. Which keeps q_min higher, and why? ([How the current gets in](3-current-diffusion.md): heating where the current would otherwise penetrate.)
6. **Robustness, the "control level".** Load the [best audited schedule](7-lab.md?preset=cem_audited&tab=T&transport=1.5) with *transport ×* 1.5, then try 0.7. Its knobs do not move: a schedule cannot react. Now [PI live at ×1.5](7-lab.md?preset=pi&live=1&tab=j&transport=1.5): watch the knobs panel as j(0) runs ahead of its target and PI ramps I_p back down, and compare with the dashed TORAX knobs. *Predict:* does reacting help PI's audited score? (See [the table above](#open-loop-and-feedback).) This is the experiment [Open question 3](../06-open-questions.md#3-does-feedback-matter-a-randomised-gym-torax) proposes on TORAX.
7. **Sawteeth.** Switch the sawtooth model on for [PI](7-lab.md?preset=pi&t=120&tab=T&sawtooth=1). How do T_e(0), q_min and the benchmark return change? Would the heating cut still pay with sawteeth on?
8. **Design a reward.** Open the custom reward, add a Greenwald penalty and an end-of-episode rule at f_GW > 1.2. Go through the presets and write down the ranking. Does any honest policy beat PI? Does any exploit survive?
9. **What RL adds to PI.** Load [PPO on PI](7-lab.md?preset=ppo_res&t=60&tab=q) and watch the pink correction in the knobs panel: where does it add heating, and what does that do to q_min compared with [PI at the same time](7-lab.md?preset=pi&t=60&tab=q)? Then slide the side pane's *network correction* from 0 (pure PI, live) to 1 (the trained agent) and watch the outcome sparklines and the audited score move between PI's and PPO's. Load [MBPO on PI](7-lab.md?preset=mbpo_res&t=135&tab=T): what does its I_p ramp-down after 109 s do to H98, and why should that make you wary of H98 as a reward term? ([RL on top of PI](../04a-rl-on-pi.md).)
10. **Same network, another plasma.** Load the [PPO exploit](7-lab.md?preset=ppo_s1&t=110&tab=T) and play it in *recorded* mode, then switch the side pane to *live on the Lab*. *Predict* before you switch: will it cut the heating at 104 s as it did on TORAX? Watch the strip of cells under "what it reads now" around 100 s and compare the two benchmark returns.
11. **Tune the PI controller.** Load [PI](7-lab.md?preset=pi&t=60&tab=q) and halve *PI gain k_i* in the side pane. *Predict* what I_p does after 60 s. (On the Lab, PI can no longer hold the current: its integral stopped growing while the ramp was rate-limited, so I_p drifts down to about 5 MA by 100 s and the audited score falls from 3.33 to 2.96.) Then reset and raise the *j(0) target* to 2.5 MA/m² instead: almost nothing changes, because PI already rides its 0.2 MA/s rate limit and then the 15 MA ceiling. Here the actuator limits, not the gains, set the ramp.

12. **Earn the H-mode.** Switch to the [physics environment's heating cut](7-lab.md?preset=phys_heating_cut&t=106&tab=T): the same sequence that scores 20.96 on the benchmark. Watch the badge and the T profile at 106 and 108 s. *Predict* the return before you look at the side pane.
13. **Raise the threshold.** Load [PI, re-tuned](7-lab.md?preset=phys_pi&t=101&tab=T) and move *true L-H threshold ÷ Martin scaling* in the side pane from 1.00 to 1.15. *Predict*: which presets still reach H-mode? Try the [open-loop reference](7-lab.md?preset=phys_open_loop&threshold=1.15&tab=T) and [randomised training](7-lab.md?preset=phys_ppo_dr&threshold=1.15&live=1&tab=T) at the same setting, and compare where each ends I_p: the threshold grows with density, and density with current.
14. **A limit at work.** Load [MBPO on PI](7-lab.md?preset=phys_mbpo_res&t=10&tab=j) in *recorded* mode: the episode ends at 10 s on the inductance window. Read l_i in the numbers panel against TORAX's, then switch to *live on the Lab*. What does the network do differently in the first ten seconds?

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
| PPO on PI, seed 0 | 4.47 | 4.02 | 3.54 | 61 | 69 | 0.49 / 0.49 | 26.8 / 21.0 | 19.6 / 18.4 | 1.19 / 1.15 |
| MBPO on PI, seed 0, best checkpoint | 3.92 | 3.73 | 3.63 | 52 | 73 | 0.57 / 0.58 | 31.4 / 21.7 | 10.6 / 11.4 | 1.19 / 1.41 |

The table was computed with Node.js (`scripts/calibrate_lab_model.mjs` uses the same model file; the last two rows were added after the calibration, which did not see them). Browsers implement `exp` and `pow` slightly differently, and the stiff transport amplifies that on the exploit episodes, so the Lab may show returns about 1 % different from the table there.

**Where it is wrong, and why.**

- **The flat-top core runs cooler than TORAX on the highest-current trajectories** (PI: 23 keV against 27.5 keV at the end), while Q stays close (14.6 on both) because density and ion temperature compensate. Treat absolute temperatures as ±20 %.
- **q_min crosses 1 a few seconds late** for the fastest ramps (PI: 57 s against 51 s) and much later for MBPO seed 1 (70 s against 53 s).
- **Heating during the ramp** (PPO, MBPO, TD3+BC and both residual agents heat before 100 s): the Lab keeps the current out of the core longer than TORAX (PPO at 99 s: j(0) = 0.9 against 1.5 MA/m²; MBPO on PI: q_min < 1 from 73 s against 52 s), so q_min stays high for longer. With full NBI from 50 s, MBPO on PI also shows the Lab's beam fuelling at its worst: f_GW 1.41 at the end against TORAX's 1.19. Bootstrap and ECCD at low current are the least constrained parts of the model.
- **The low-current exploit is only partly reproduced.** MBPO seed 1 ends at 3 MA with the heating off, and TORAX still reports T_e(0) ≈ 22 keV and H98 ≈ 4.2: its turbulent transport nearly vanishes at low current and power. The Lab keeps a floor diffusivity, so this episode scores 12.8 there instead of 18.4. An H98 of 4 is itself a reason to distrust that corner of the benchmark.
- **Exploit returns differ in size but not in rank**: the heating cut scores 34.4 on the Lab against 22.7 on TORAX, PPO's episode 35.9 against 49.0. On both simulators every exploit scores far above every honest policy on the benchmark reward, and between 1.9 and 3.6 on the audited one.
- **Not modelled at all:** particle transport (density is 0-D), rotation, fast-ion physics, impurity transport, and the TORAX bounds file (the Lab never returns −1000 on the benchmark unless the custom reward's termination rules say so; in the physics environment it ends the episode at the same limits as TORAX).

### The physics environment {#model-card-physics}

**What changes.** The same model with the [physics environment's](../04b-physics-env.md) rules (`PHYSICS` in the model file):

- **The pedestal is earned.** TORAX 1.4's state machine, evaluated once per one-second step from the state at its start: L-mode → L-H when P_heat exceeds the threshold, L-H → H at the next step, H → H-L when P_heat falls below 0.8 × the threshold, H-L → L. The pedestal top sits at 3 keV in L-H and H, and at the L-mode edge the transport gives (0.3 keV, fitted) otherwise. TORAX ramps the pedestal over 0.5 s; the Lab switches it at the step.
- **The threshold** is the Martin scaling with TORAX 1.4's low-density branch (below Ryter's n_min it rises as (n_min/n)²), times 1.1 to map the Lab's surface and density onto TORAX's, times the side pane's *true L-H threshold ÷ Martin scaling*.
- **Density follows the machine's controller,** 0.6 of the Greenwald density in L-mode and 0.85 in H-mode, with a 6.3 s response (fitted) and no beam fuelling.
- **l_i(3)** is the cylinder's internal inductance × 0.66 (least squares on 2,581 TORAX steps of the physics environment, rms error 0.04). The episode ends when f_GW > 1 or l_i leaves 0.65–1.2 before 100 s, as on TORAX.

Only the L-mode edge, the density response and the threshold factor were fitted (`node scripts/calibrate_lab_model.mjs --physics`, seven physics episodes); everything else is the benchmark calibration.

**How close it is.** Same actions, TORAX against the Lab (end values at t = 150 s; `node scripts/calibrate_lab_model.mjs --physics --table`):

| Episode (recorded actions) | TORAX return | Lab return | H-mode from (TORAX / Lab) | q_min < 1 from | lowest l_i to 100 s | T_e(0) [keV] | Q | f_GW |
|---|---|---|---|---|---|---|---|---|
| Open-loop reference | 3.09 | 2.94 | 101 / 101 | 50 / 49 | 0.73 / 0.73 | 25.6 / 22.4 | 4.7 / 4.9 | 0.85 / 0.85 |
| PI controller, re-tuned | 3.24 | 2.99 | 101 / 101 | 49 / 50 | 0.69 / 0.71 | 26.6 / 22.2 | 7.4 / 7.3 | 0.85 / 0.85 |
| Heating cut at 105 s | 1.81 | 1.74 | 101 / 101 | 50 / 49 | 0.73 / 0.73 | 5.2 / 4.4 | 0.1 / 0.1 | 0.60 / 0.60 |
| Best open-loop schedule (CEM) | 3.26 | 2.97 | 101 / 101 | 43 / 45 | 0.67 / 0.68 | 26.6 / 22.3 | 7.3 / 6.8 | 0.85 / 0.85 |
| PPO on PI, seed 3 | 3.63 | 3.31 | 101 / 101 | 74 / 73 | 0.69 / 0.69 | 26.0 / 21.6 | 9.0 / 8.7 | 0.85 / 0.85 |
| PPO on PI, 120k steps, seed 3 | 4.28 | 4.10 | 83 / 83 | 75 / 72 | 0.69 / 0.69 | 23.7 / 22.6 | 10.1 / 11.0 | 0.85 / 0.85 |
| Randomised training, seed 4 | 3.15 | 3.23 | 101 / 101 | – / – | 0.73 / 0.73 | 23.8 / 21.9 | 2.5 / 2.9 | 0.85 / 0.87 |
| Randomised training, seed 2 (stays at 3 MA) | 2.00 | 2.00 | – / – | – / – | 0.92 / 0.78 | 30.7 / 15.9 | 0.0 / 0.0 | 0.60 / 0.60 |
| MBPO on PI, seed 2 | 3.47 | ends at 10 s (l_i 0.65) | 2 / 2 | 75 / 74 | 0.69 / 0.63 | 25.1 / – | 6.7 / – | 0.85 / – |

The last two rows were not in the fit.

**Where it is wrong, and why.**

- **The H-mode timing is right, the margin less so.** Every preset enters H-mode in the same second on both simulators (MBPO at 2 s, when its early heating meets the low threshold at low density; the 120k-step PPO at 83 s). How far above the threshold a trajectory runs is reproduced to about 20 % (the P_heat/P_LH trace), so the threshold factor at which a schedule loses H-mode is close but not exact: open loop 1.23 on the Lab against about 1.18 on TORAX, PI 1.10 against 1.06–1.09, the best schedule 1.02 against 1.00–1.02.
- **The core runs cooler, as on the benchmark** (22 keV against 24–27 keV at the end), and most returns are 0.1–0.3 lower on the Lab for the same reason. Near-ties can swap: on TORAX PI edges out the randomised seed 4 (3.24 against 3.15), on the Lab seed 4 is ahead (3.23 against 2.99), and PI and the best schedule trade places.
- **l_i is the tightest limit and the least certain number.** In MBPO's heated ramp the Lab's l_i runs 0.06 below TORAX's and crosses 0.65 at 10 s, which ends that recorded episode; live, the network stays inside. At 3 MA with full heating (randomised seed 2) the Lab's core is half as hot as TORAX's and l_i 0.14 lower, the low-current corner where the benchmark calibration is also weakest.

**What it is good for.** Building intuition for the mechanisms (current penetration, stiffness, the pedestal, the reward's leaks), ranking the effect of a benchmark change on the recorded policies before implementing it, and generating hypotheses to test on TORAX. **What it is not good for:** reporting a number. Every result in [Designs and results](../04-designs.md) comes from TORAX.

See also the [equation sheet](equations.md).
