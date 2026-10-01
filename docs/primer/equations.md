# Equation sheet

Every equation the primer and the Lab use, in one place. Each entry says what TORAX / Gym-TORAX does, what the Lab's reduced model does instead, and where to see it. Symbols: ρ̂ normalised radius (0 axis, 1 edge), r = ρ̂a, R = 6.2 m, a = 2.0 m, B = 5.3 T, κ = 1.7, T in keV, n in m⁻³ unless stated.

## Geometry and the safety factor {#eq-q}

$$
q(\hat\rho) \approx G(\hat\rho)\,\frac{2\pi r^{2} B_\varphi}{\mu_0 R\, I(r)}, \qquad q(0) \approx G(0)\,\frac{2 B_\varphi}{\mu_0 R\,\kappa\, j(0)}
$$

- **TORAX:** q from the poloidal flux ψ on the CHEASE equilibrium.
- **Lab:** G(ρ̂) = 1.79 + 1.49 ρ̂², a stand-in for elongation and triangularity (G ≈ (1 + κ²)/2 near the axis), calibrated on TORAX's q on axis and q95. q95 is read at ρ̂ = 0.95.
- **Reward:** min(q_min, 1)/150 and min(q95/3, 1)/150.
- **See:** [chapter 2](2-safety-factor.md); [Lab, q colouring](7-lab.md?preset=pi&t=51&color=q&tab=q).

## Current diffusion {#eq-diffusion}

$$
\frac{\partial I}{\partial t} = \frac{2\pi r\,s}{\mu_0}\,\frac{\partial}{\partial r}\Big[\eta\,\big(j - j_{\rm ni}\big)\Big], \qquad j = \frac{1}{2\pi\kappa r}\frac{\partial I}{\partial r}, \qquad I(0,t)=0,\quad I(a,t) = I_p(t)
$$

- **TORAX:** the ψ equation of [chapter 3](3-current-diffusion.md#four-profiles-four-transport-equations), with neoclassical σ_∥ and ⟨B·j_ni⟩.
- **Lab:** the same physics in an elongated cylinder (s = 1.04 accounts for the longer poloidal path), 51 nodes, backward Euler with four sub-steps per action. The I_p action is ramped linearly over each 1 s step.
- **See:** [chapter 3](3-current-diffusion.md); [Lab, j tab](7-lab.md?preset=pi&t=80&tab=j&color=j).

## Resistivity and the resistive time {#eq-eta}

$$
\eta = \frac{1.65\times10^{-9}\,Z_{\rm eff}\ln\Lambda}{T_e^{3/2}\,\big(1 - c\sqrt{r/R}\big)}\ \Omega\,\mathrm{m}, \qquad \tau_R \sim \frac{\mu_0 a^2}{\eta}
$$

- **TORAX:** Sauter neoclassical conductivity.
- **Lab:** Spitzer with a trapped-particle reduction (c = 1.27), ln Λ = 17, Z_eff = 1.6 (adjustable), times a calibrated 0.62.
- **Meaning:** a 1 keV plasma lets current in about 30 times faster than a 10 keV one (T^{3/2}).

## Bootstrap current {#eq-bootstrap}

$$
j_{\rm bs} \approx -\frac{\sqrt{\varepsilon}}{B_\theta}\Big(2.44\,(T_e+T_i)\frac{\partial n}{\partial r} + 0.69\,n\frac{\partial T_e}{\partial r} - 0.42\,n\frac{\partial T_i}{\partial r}\Big), \qquad \varepsilon = r/R
$$

- **TORAX:** Sauter model.
- **Lab:** this large-aspect-ratio form (temperatures converted to joules), scaled by 0.34; driven currents add NBI (1 MA per 16 MW, Gaussian at ρ̂ = 0.25, width 0.25) and ECCD (≈ 0.0009 A/W × T_e/n₂₀, capped).

## Heat transport {#eq-heat}

$$
\tfrac32\, n_s\frac{\partial T_s}{\partial t} = \frac{1}{r}\frac{\partial}{\partial r}\Big(r\,n_s\chi_s\frac{\partial T_s}{\partial r}\Big) + Q_s, \qquad \chi = \chi_0 + \chi_1\,T^{1.4}\Big(\frac{R}{L_T} - 7.5\Big)_{+}, \qquad \frac{R}{L_T} = -R\,\frac{\partial \ln T}{\partial r}
$$

- **TORAX:** QLKNN turbulent transport plus prescribed patches near the axis and the edge.
- **Lab:** a critical-gradient model, χ₀ = 0.07 m²/s, χ₁ = 0.15 (T in keV, χ in m²/s), a core patch χ ≥ 1 m²/s for ρ̂ < 0.1, ions 1.58 × electrons; solved for ρ̂ ≤ 0.91 with the pedestal as boundary value, with a Pereverzev term (3 m²/s, added implicitly and removed explicitly) to keep the stiff equations from oscillating, as TORAX does. "Transport ×" in the Lab multiplies χ.
- **Meaning:** above R/L_T ≈ 7.5 χ rises steeply, so T(0)/T_ped is nearly fixed: stiffness.

## Heat sources {#eq-sources}

$$
Q_e = E_\parallel j + P_{\rm EC}\,g_{\rm EC} + 0.9\,P_{\rm NB}\,g_{\rm NB} + 0.62\,p_\alpha - p_{\rm rad} - Q_{ei}, \qquad Q_i = 0.1\,P_{\rm NB}\,g_{\rm NB} + 0.38\,p_\alpha + Q_{ei}
$$

$$
Q_{ei} = \tfrac32\,n_e\,\frac{T_e - T_i}{\tau_{eq}}, \qquad p_{\rm rad} = c\cdot 5.35\times10^{-37} Z_{\rm eff}\, n_e^2 \sqrt{T_e}\ \mathrm{W\,m^{-3}}
$$

- g are deposition profiles normalised to unit integral (NBI: centre 0.25, width 0.25; ECRH: centre 0.35 or your choice, width 0.05).
- **Lab:** the radiation coefficient is calibrated down (c = 0.070) because TORAX's radiated power in this config is a few MW.

## Pedestal {#eq-pedestal}

$$
T(\hat\rho_{\rm ped} = 0.91,\,t) = T_{\rm ped}(t) = 0.5\ \text{keV} + 2.5\ \text{keV}\cdot h(t)
$$

- **Gym-TORAX:** h rises from 0 to 1 between 100 and 105 s, whatever the plasma does.
- **Lab, scheduled:** the same onset (adjustable), with the rise compressed to 2 s by the calibration. **Lab, power-triggered:** h relaxes to 1 (τ = 2 s) while P_SOL ≥ P_LH, decays to 0 (τ = 1 s) when P_SOL < 0.8 P_LH, and holds its state in between.
- **See:** [chapter 4](4-heat-and-fusion.md#l-mode-h-mode-and-the-pedestal).

## Fusion power and gain {#eq-fusion}

$$
P_{\rm fus} = \int n_D n_T\,\langle\sigma v\rangle(T_i)\,E_{\rm fus}\,dV, \qquad P_\alpha = \frac{3.5}{17.6}P_{\rm fus}, \qquad Q = \frac{P_{\rm fus}}{P_{\rm aux} + P_{\rm ohm}}
$$

- ⟨σv⟩ is the Bosch–Hale D-T fit (1.1 × 10⁻²² m³/s at 10 keV, 4.3 × 10⁻²² at 20 keV).
- **Lab:** n_D = n_T = 0.475 n_e (dilution 0.95).
- **Reward:** (Q/10)/50 per second when gated; audited: min(Q, 10).

## Confinement time and H98 {#eq-ipb98}

$$
\tau_E = \frac{W_{\rm th}}{P_{\rm heat} - dW/dt}, \qquad \tau_E^{98} = 0.0562\, I_p^{0.93} B^{0.15} \bar n_{19}^{0.41} P^{-0.69} R^{1.97} \kappa^{0.78} \varepsilon^{0.58} M^{0.19}, \qquad H_{98} = \frac{\tau_E}{\tau_E^{98}}
$$

- ([R29](../07-references.md#r29)). **Reward:** min(H98, 1)/50 per second when gated.

## Greenwald density limit {#eq-greenwald}

$$
n_G\,[10^{20}\,\mathrm{m^{-3}}] = \frac{I_p\,[\mathrm{MA}]}{\pi a^2}, \qquad f_{GW} = \frac{\bar n_e}{n_G}
$$

- ([R28](../07-references.md#r28)). **Benchmark:** not in the reward or the termination rule.

## Density in the Lab {#eq-density}

$$
\frac{d\bar n}{dt} = \frac{f(h)\, n_G(I_p) + c_{\rm NB}P_{\rm NBI} - \bar n}{\tau_n}, \qquad f = 0.60\ (\text{L-mode}) \to 1.0\ (\text{H-mode}), \qquad \tau_n = 22\ \text{s}
$$

- c_NB = 0.009 × 10²⁰ m⁻³ per MW of beam power; profile n(ρ̂) ∝ 1 − 0.35 ρ̂².
- **TORAX:** a particle-transport equation with Greenwald-fraction boundary conditions (0.35 at the edge, 0.85 at the pedestal top).

## L–H threshold {#eq-plh}

$$
P_{LH} = 0.0488\,\bar n_{e,20}^{0.717}\, B^{0.803}\, S^{0.941}\ \mathrm{MW}, \qquad P_{SOL} = P_{\rm ohm} + P_{\rm aux} + P_\alpha - P_{\rm rad}
$$

- Martin (2008) scaling; S is the plasma surface area. **Audited reward:** the gate requires P_SOL ≥ P_LH.

## Normalised beta {#eq-betaN}

$$
\beta_t = \frac{2\mu_0\langle p\rangle}{B^2}, \qquad \beta_N = \beta_t[\%]\,\frac{a\,B}{I_p[\mathrm{MA}]}
$$

- ([R28](../07-references.md#r28)). Not in the reward.

## Sawtooth crash {#eq-sawtooth}

$$
q(0) < 1 \;\Rightarrow\; \text{every } 6\ \text{s}: \quad r_{\rm mix} = \sqrt2\, r_{q=1}, \quad T_{e,i}(r<r_{\rm mix}) \to \langle T\rangle_{r_{\rm mix}}, \quad j(r<r_{\rm mix}) \to \text{flat}
$$

- A Kadomtsev-style full reconnection, conserving energy and the enclosed current at r_mix. **Gym-TORAX:** off. **Lab:** off by default.

## Loop voltage and flux {#eq-flux}

$$
V_{\rm loop} = 2\pi R\,E_\parallel(a) = 2\pi R\,\eta(a)\big(j(a) - j_{\rm ni}(a)\big), \qquad \Psi_{\rm res}(t) = \int_0^t V_{\rm loop}\,dt'
$$

- The central solenoid supplies Ψ_res plus the inductive flux L·I_p. **Gym-TORAX:** not modelled; the Lab reports Ψ_res.

## Reward {#eq-reward}

$$
r_t = \tfrac{1}{50}\,H\,\tfrac{Q}{10} + \tfrac{1}{50}\,H\min(H_{98},1) + \tfrac{1}{150}\min(q_{\min},1) + \tfrac{1}{150}\min\!\big(\tfrac{q_{95}}{3},1\big), \qquad H = [T_e(0) > 10\ \text{keV}] \wedge [T_i(0) > 10\ \text{keV}]
$$

- −1000 and the episode ends on solver failure or a bounds violation. **See:** [The control problem](../01-problem.md#reward-and-objective), [chapter 6](6-reward.md).

## Audited reward {#eq-audited}

$$
H' = H \cdot [P_{SOL} \ge P_{LH}], \qquad r'_t = \tfrac{1}{50}\,H'\,\min\!\big(\tfrac{Q}{10}, 1\big) + \tfrac{1}{50}\,H'\min(H_{98},1) + \tfrac{1}{150}\min(q_{\min},1) + \tfrac{1}{150}\min\!\big(\tfrac{q_{95}}{3},1\big)
$$

- This repo's `audited_components` in `src/rl_tokamak/env.py`; `IterHybridAudited-v0` on the Gym-TORAX fork.
