---
icon: rt/fusion
---

# :rt-fusion: Heat, confinement and fusion

!!! abstract "The question"

    Heating is two of the three actions, and the reward pays for fusion gain Q and confinement quality H98. How does injected power become temperature, and temperature become fusion power?

## Stiff transport: the core rides on the edge

The heat equations of [How the current gets in](3-current-diffusion.md#four-profiles-four-transport-equations) are diffusion equations with a diffusivity χ that is not a constant: turbulence switches on when the normalised temperature gradient R/L_T = −R ∂(ln T)/∂r exceeds a critical value, and then χ rises steeply. Push more power in and the gradient barely steepens; the turbulence carries the extra heat away. Temperature profiles are therefore **stiff**: pushing more power in raises T less than you would expect, and the core temperature is set mostly by the temperature at the edge of the core region multiplied by a nearly fixed factor. The Lab captures this with a critical-gradient model (<span class="rt-eqref" data-eq="heat"></span>); TORAX uses QLKNN ([R4](../07-references.md#r4)).

You can see it in the TORAX data: with 53 MW of heating and the H-mode pedestal (3 keV), T_e(0) settles near 27 keV in the PI episode; in the heating-cut episode, with no auxiliary heating, about 32 MW of alpha heating just after the cut (rising to 55 MW) and the same pedestal, it still sits near 20 keV.

## L-mode, H-mode and the pedestal

Above a threshold heating power P_LH (which scales with density, field and size), a tokamak plasma spontaneously forms a thin edge transport barrier: the **pedestal**. Confinement improves markedly (by about a factor of two in typical cases; textbook value, unverified here); this is **H-mode**, as opposed to L-mode. The core temperature profile is stiff, so the core temperature largely rides on top of the pedestal: pedestal height sets core performance.

TORAX 1.0 does not predict the pedestal. It imposes it through "an adaptive source term which sets a desired value (pedestal height)" at a chosen radius ([R4b](../07-references.md#r4b)). The Gym-TORAX ITER config prescribes pedestal temperatures of 0.5 keV until t = 100 s, rising to 3 keV at 105 s ([R3](../07-references.md#r3)). Consequences for RL:

- the L-H transition happens at t = 100–105 s whatever the agent does, even if the heating is off (P_SOL < P_LH);
- the reward's "H-mode" test is not the pedestal but T_e(0) > 10 keV and T_i(0) > 10 keV. A policy that heats the core above 10 keV early is paid as if it were in H-mode, even with a 0.5 keV L-mode pedestal.

In the PI rollout the heating switches on in the step from 99 to 100 s, the H-mode test first passes at t = 102 s, T_e(0) settles near 27 keV and Q reaches 14.6 by t = 150 s. In the Lab the pedestal is a boundary value at ρ̂ = 0.91 (<span class="rt-eqref" data-eq="pedestal"></span>), and you can switch it from *scheduled* to *power-triggered* to see what a physical L–H transition would do to each policy.

[PI: heating on and the pedestal rising](7-lab.md?preset=pi&t=103&tab=T&color=Te){ .rt-try } [Heating cut, scheduled pedestal](7-lab.md?preset=heating_cut&t=130&tab=T){ .rt-try } [Heating cut, power-triggered pedestal](7-lab.md?preset=heating_cut&t=130&tab=T&pedestal=power){ .rt-try }

## Energy confinement time and H98

**τ_E = W_th / P_loss**, the time the plasma would take to lose its thermal energy with the heating switched off. It is compared with an empirical scaling from a multi-machine database, IPB98(y,2) ([R29](../07-references.md#r29)):

$$
\tau_{E}^{\mathrm{IPB98(y,2)}} = 0.0562\, I_p^{0.93} B^{0.15} n^{0.41} P^{-0.69} R^{1.97} \kappa^{0.78} \varepsilon^{0.58} M^{0.19}
$$

(I_p in MA, B in T, n in 10¹⁹ m⁻³, P in MW, R in m, κ elongation, ε = a/R, M ion mass in amu). **H98 = τ_E / τ_E^IPB98**. H98 ≈ 1 is standard H-mode; the hybrid scenario aims somewhat above 1. The reward pays min(H98, 1) in "H-mode". Note the I_p^0.93: more current, better confinement. That is why the PI controller and the policies that imitate it drive I_p to the 15 MA ceiling (the exploiting policies of [Limitations](../05-limitations.md#the-q-loophole-found-by-rl) do not need to). Note also P^−0.69: confinement *degrades* with heating power, the empirical face of stiffness.

<div class="rt-widget" data-widget="scalings" data-title="Interactive: Greenwald limit and the IPB98(y,2) confinement time"></div>

## Fusion power and the gain Q

D-T fusion releases 17.6 MeV per reaction, 3.5 MeV of it in the alpha particle that stays in the plasma and heats it. The reaction rate per volume is n_D n_T ⟨σv⟩(T_i), and the reactivity ⟨σv⟩ rises steeply with temperature up to tens of keV (Bosch–Hale fit: 1.1 × 10⁻²² m³/s at 10 keV, 4.3 × 10⁻²² at 20 keV; <span class="rt-eqref" data-eq="fusion"></span>). Because density is capped by the Greenwald limit ([Limits and the operating space](5-limits.md)), the way to more fusion power is temperature and confinement.

**Fusion gain** Q = P_fusion / P_heating. ITER's goal is Q ≥ 10 at 500 MW of fusion power for 50 MW injected ([R26](../07-references.md#r26)); its long-pulse hybrid goal is Q = 5 for 1000 s ([R27](../07-references.md#r27)). In TORAX's output the denominator is the injected plus ohmic power, Q = P_fus/(P_aux + P_ohm): in the heating-cut episode P_alpha ≈ 54.6 MW (so P_fus ≈ 275 MW) over P_ohm ≈ 1.0 MW gives the recorded Q ≈ 270. The reward pays (Q/10)/50 per second in "H-mode", which is uncapped.

A 0-D power balance makes the consequence visible. Losses follow IPB98 × H98; heating is P_aux plus alpha power plus a little ohmic power, minus radiation. Where the two curves cross is where the plasma sits. Press *cut the heating*: with H98 ≈ 1 the plasma cools and collapses; raise H98 to about 1.2 and alpha heating alone holds it, while Q shoots up because its denominator has gone. The scheduled pedestal of Gym-TORAX plays the role of that extra confinement: it cannot collapse.

<div class="rt-widget" data-widget="power" data-title="Interactive: 0-D power balance and the fusion gain"></div>

!!! tip "What it means for the agent"

    - **Heating buys temperature, but with diminishing returns** (stiffness; τ_E ∝ P^−0.69), and early heating also changes the current profile ([How the current gets in](3-current-diffusion.md)).
    - **Q rewards a small denominator.** Any policy that keeps the core hot with less injected power is paid more, and under a scheduled pedestal "less" can mean zero. This is the loophole PPO, SAC and MBPO found ([Limitations](../05-limitations.md#the-q-loophole-found-by-rl)).
    - **The H-mode gate is a temperature threshold**, not the physics of H-mode. In the Lab, the badge on the plasma view turns red when the reward counts a state as H-mode while P_SOL < P_LH.

??? question "Check yourself"

    1. Doubling P_aux from 50 to 100 MW at fixed W: by how much does τ_E^98 change? *By 2^−0.69 ≈ 0.62: confinement time drops 38 %.*
    2. Why does the heating-cut plasma stay near 20 keV in TORAX? *The pedestal is held at 3 keV by schedule, transport is stiff, and alpha heating (32 MW just after the cut, 55 MW by the end) replaces the 53 MW of auxiliary power.*
    3. What happens to the heating-cut episode's return if the pedestal needs P_SOL ≥ P_LH? *In the Lab it falls from about 34 to about 2: the plasma drops to L-mode, cools below 10 keV and loses the gated terms.*
