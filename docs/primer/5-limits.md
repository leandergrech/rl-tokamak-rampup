---
icon: rt/limits
---

# :rt-limits: Limits and the operating space

!!! abstract "The question"

    Which plasmas would an operator refuse to run, and how many of those limits does the benchmark enforce?

## The limits, one by one

**Greenwald density limit.**

$$
n_G\,[10^{20}\,\mathrm{m^{-3}}] = \frac{I_p\,[\mathrm{MA}]}{\pi a^2\,[\mathrm{m^2}]}
$$

([R28](../07-references.md#r28)). Line-averaged density above n_G (Greenwald fraction f_GW > 1) tends to end in a radiative collapse and a disruption ([R28](../07-references.md#r28) reviews the evidence). For ITER at 15 MA and a = 2.0 m, n_G = 15/(π·4) ≈ 1.19 × 10²⁰ m⁻³. The Gym-TORAX reward has no density term; the PI rollout ends at f_GW = 1.19. Density is not an action here: it follows the Greenwald-fraction boundary conditions of the config and rises with the H-mode pedestal and with beam fuelling.

**Edge safety factor.** q95 below about 2 is the classic current limit (external kink; textbook value, unverified here), and operation is usually planned at q95 ≥ 3. The reward pays min(q95/3, 1) per second but never terminates on low q95.

**Normalised beta.** β = 2μ₀⟨p⟩/B² is plasma pressure relative to magnetic pressure. Its normalised form

$$
\beta_N = \beta_t\,\frac{a B_T}{I_p}\quad (\text{with } I_p \text{ in MA},\ a \text{ in m},\ B_T \text{ in T}; \text{ β in \%})
$$

([R28](../07-references.md#r28)) is what ideal-MHD pressure limits (the Troyon limit) are expressed in. The environment's reward docstring mentions β_N but the implemented reward does not use it ([R3](../07-references.md#r3)). In the TORAX episodes β_N peaks around 2.2 (PI), so this limit is not the binding one here.

**L–H power threshold.** H-mode needs P_SOL, the power crossing the plasma edge, above a threshold P_LH that grows with density, field and surface area (Martin scaling, <span class="rt-eqref" data-eq="plh"></span>). In the PI episode P_LH rises from about 33 MW to 100 MW as the density builds. The benchmark ignores it: its pedestal is scheduled and its H-mode test is a temperature threshold ([Heat, confinement and fusion](4-heat-and-fusion.md#l-mode-h-mode-and-the-pedestal)). The audited reward of this repo adds P_SOL ≥ P_LH to the gate.

## The operating space

Plot every TORAX trajectory on a map whose axes are the two limits that matter most here: Greenwald fraction to the right, 1/q95 (current) upwards. Real tokamaks disrupt in the shaded regions.

<div class="rt-widget" data-widget="opspace" data-title="Interactive: TORAX episodes on the operating-space map"></div>

## Instabilities the simulator does not have

A **sawtooth** is a periodic crash of the core when q on axis is below 1: the core temperature and current are flattened inside a mixing radius every few seconds. TORAX 1.0.3 has a simple sawtooth model, but the Gym-TORAX config does not enable it. The Lab has a Kadomtsev-style version you can switch on (<span class="rt-eqref" data-eq="sawtooth"></span>): watch the central temperature trace turn into a saw and q_min clamp near 1.

A **tearing mode** is a magnetic island that grows on a rational surface (q = 3/2, 2) and degrades confinement; large ones lock to the wall and end in disruptions. No tearing physics is in TORAX.

A **disruption** is the sudden loss of confinement and current: a thermal quench followed by a current quench, both on millisecond timescales (textbook values, unverified here). In a machine the size of ITER it deposits large heat loads, induces eddy-current forces on the vessel, and can create beams of runaway electrons. Common triggers are exactly the regions the benchmark does not police: density above the Greenwald limit, low q95, large tearing modes, and vertical instability. Disruption *prediction* by deep learning is mature enough to transfer across machines (median warning times of 500–700 ms on DIII-D and about 1,000 ms on JET; [R15a](../07-references.md#r15-timeline-sources)). Disruption *avoidance by control* is the open frontier ([Gaps and status](8-field.md) and [Open questions](../06-open-questions.md)).

[PI with sawteeth on](7-lab.md?preset=pi&t=120&tab=T&sawtooth=1){ .rt-try }

## The ITER hybrid scenario

ITER's research plan has two main burning-plasma goals: Q = 10 at 15 MA for 300–500 s, and Q = 5 for about 1000 s at lower current, "based on the hybrid/improved H-mode scenario at q95 ~ 4" at 11.2 MA/5.3 T ([R27](../07-references.md#r27)). A **hybrid scenario** runs at reduced current with a broad, low-shear central q profile held just above 1, so there are no sawteeth, confinement is better than standard H-mode, and more current is non-inductive, which stretches the flux budget. Getting there is largely a ramp-up problem: the q profile has to be shaped during the ramp with heating timing and current-drive placement, before the current profile relaxes. The non-RL state of the art on real machines is model-based optimisation of the ramp with RAPTOR, e.g. reaching "a stationary state with q_min > 1 at the beginning of the flat-top phase" on ASDEX Upgrade ([R15h](../07-references.md#r15-timeline-sources)); the Gym-TORAX config says it is based "roughly" on that group's ITER hybrid work ([R3](../07-references.md#r3)).

Hold that definition against the benchmark: its reference trajectory ramps to 12.5 MA, and the PI policy that sets the published baseline ramps to 15 MA and runs with q_min below 1 for the last 100 s, ending at 0.41. By this environment's reward that is the better plasma; by the definition of a hybrid scenario it is not a hybrid scenario. [Limitations](../05-limitations.md) quantifies this.

[A hybrid-style ramp on the Lab: 10 MA, early heating](7-lab.md?preset=early_heat&t=120&tab=q&color=q){ .rt-try }

## What the benchmark enforces

| Limit | Physical consequence | Gym-TORAX 1.0 | Audited reward (this repo) |
|---|---|---|---|
| actuator bounds, I_p ≤ 0.2 MA/s | hardware | enforced by the action space | same |
| state outside the bounds file | numerical failure / unphysical state | −1000, episode ends | same |
| q_min < 1 | sawteeth; not a hybrid scenario | reward term loses up to 1/150 per second | same |
| q95 < 3 | disruption risk rises (q95 < 2 is the hard limit) | reward term would lose up to 1/150 per second, but q95 ≥ 3.2 even at the 15 MA ceiling | same |
| f_GW > 1 | density-limit disruption | nothing | nothing |
| P_SOL < P_LH while "H-mode" | back-transition to L-mode | nothing (pedestal scheduled) | gated terms not paid |
| β_N above the Troyon limit | ideal-MHD disruption | nothing | nothing |
| solenoid flux budget | pulse ends early | not modelled | not modelled |

The Lab's benchmark designer lets you add penalties or terminations for these and see what each recorded policy would have scored.

!!! tip "What it means for the agent"

    - **Most physical limits are absent from both the reward and the termination rule.** An agent optimising the benchmark has no reason to respect f_GW < 1 or q_min ≥ 1, and the best published baseline violates both.
    - **These are the "separation minima" of a ramp-up.** Treating them as hard constraints (constrained RL, safety layers, shielding) is a natural contribution; the reward currently shapes only two of them, softly.

??? question "Check yourself"

    1. At 10 MA, what line-averaged density is the Greenwald limit? *10/(π·4) ≈ 0.80 × 10²⁰ m⁻³.*
    2. Which policies end beyond f_GW = 1 in the operating-space map? *PI and the open-loop reference among others; switch the chips on and drag time to 151 s.*
    3. Why does a lower-current ramp help keep q_min above 1? *Less current means higher q everywhere ([The safety factor q](2-safety-factor.md)), and the 1 crossing in the core comes later or not at all.*
