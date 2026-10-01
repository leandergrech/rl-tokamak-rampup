---
icon: rt/books
---

# :rt-books: References

Every source cited anywhere on this site is listed here with the URL that was actually opened, the facts taken from it, and a verification status. Sources were opened on 30 September 2026.

- **verified**: the page was opened and the fact was read on it.
- **partially verified**: the page was opened, but only part of the fact could be confirmed there (the rest is said explicitly).
- **unverified**: the page could not be opened (paywall, bot wall) or the fact was not found on it. Unverified facts are marked "unverified" wherever they appear in the docs.

Where the task brief that started this project stated a fact that the source contradicts, the correction is recorded in [Corrections to the brief](#corrections-to-the-brief).

## Software and exact versions

The benchmark numbers in this repo come from the stack below, installed with `uv` into a fresh Python 3.12.3 virtual environment on 30 September 2026.

| Package | Version | Role | Licence | Source |
|---|---|---|---|---|
| gymtorax | 1.0.0 (released 2025-10-09) | benchmark environment, the version the Gym-TORAX paper's table was produced with | MIT | [PyPI](https://pypi.org/project/gymtorax/1.0.0/), [CHANGELOG](https://github.com/antoine-mouchamps/gymtorax/blob/main/CHANGELOG.md), [LICENSE](https://github.com/antoine-mouchamps/gymtorax/blob/main/LICENSE) |
| torax | 1.0.3 | 1D core-transport simulator under gymtorax 1.0.0 (`torax==1.0.*`) | Apache-2.0 | [PyPI](https://pypi.org/project/torax/1.0.3/), [LICENSE](https://github.com/google-deepmind/torax/blob/main/LICENSE) |
| jax / jaxlib | 0.11.2 | array backend of TORAX (CPU build) | Apache-2.0 | [PyPI](https://pypi.org/project/jax/) |
| gymnasium | 1.3.0 | RL interface | MIT | [GitHub](https://github.com/Farama-Foundation/Gymnasium) |
| stable-baselines3 | 2.9.0 | PPO and SAC | MIT | [GitHub](https://github.com/DLR-RM/stable-baselines3) |
| torch | 2.14.1+cpu | networks for SB3, MBPO, TD3+BC, MOPO | BSD-3-Clause | [pytorch.org](https://pytorch.org/) |
| numpy | 2.5.3 | | BSD-3-Clause | |
| mkdocs-material | 9.7.7 | this site | MIT | [GitHub](https://github.com/squidfunk/mkdocs-material) |

A second environment with the current release, **gymtorax 1.1.1 (2026-07-11) + torax 1.4.3 (2026-07-03)**, was installed for comparison only. The Gym-TORAX documentation itself warns that the published returns were obtained with v1.0/TORAX 1.0 and "are therefore no longer up to date" under v1.1 ([results page source](https://github.com/antoine-mouchamps/gymtorax/blob/main/docs/example/results.rst)). Why this repo pins 1.0.0 is explained in [The control problem](01-problem.md#which-version-is-the-benchmark).

Third-party code is used unmodified as installed dependencies; nothing from Gym-TORAX or TORAX is vendored. Licences of other works referenced but not used as code: PopDownGym has no licence file (see [R12](#r12)); the RL4F kit is MIT (see [R13](#r13)); FGE/LIUQE (the TCV simulator behind Degrave et al.) are available only under licence from the Swiss Plasma Center (see [R6](#r6)).

## Anchor benchmark and simulator

### R1
**Mouchamps A., Malherbe A., Bolland A., Ernst D.** "Gym-TORAX: Open-source software for integrating reinforcement learning with plasma control simulators in tokamak research." arXiv:2510.11283 (v1 13 Oct 2025, v2 19 Mar 2026); published in *Software Impacts* 27 (2026) 100829.
Opened: <https://arxiv.org/abs/2510.11283>, <https://arxiv.org/html/2510.11283>. Status: **verified** (the Software Impacts month is unverified, see R2).

- Affiliation: Montefiore Institute, University of Liège, Belgium.
- Scenario: "a power ramp-up phase of 100 seconds, followed by a nominal phase lasting 50 seconds" (L-mode then H-mode).
- Reward (their Eq. 2): a weighted sum of fusion gain Q, q_min, q95 and H98 terms; the paper gives no numerical weights (the code does, see R3).
- Results table, "Expected return of the three studied policies, using a discount factor γ=1": open-loop π_OL = 3.40, random π_R = −10.79, PI controller π_PI = 3.79.
- Limitation, verbatim: "Even though the hypotheses inherent to the TORAX plasma simulator limit its use to preliminary investigations, its simplicity and fast execution make it a suitable starting point for advanced studies." The paper does not name which hypotheses (the words "pedestal" and "sawtooth" do not occur in it); the specific physics gaps listed in [Limitations](05-limitations.md) are this repo's reading of the TORAX paper (R4) and the environment config (R3).
- No wall-clock runtime is reported. arXiv licence of the paper: CC BY-NC-ND 4.0.

### R2
**Gym-TORAX, Software Impacts version.** DOI [10.1016/j.simpa.2026.100829](https://doi.org/10.1016/j.simpa.2026.100829) (resolves to ScienceDirect PII S2665963826000199).
Opened: the DOI resolver and the authors' citation file <https://github.com/antoine-mouchamps/gymtorax/blob/main/docs/citing.rst> (BibTeX: *Software Impacts*, vol. 27, 100829, 2026). Status: **partially verified**. The ScienceDirect page returned a Cloudflare bot challenge (HTTP 403), so the publication month (February 2026 in the brief) is **unverified**.

### R3
**Gym-TORAX source code and documentation.** <https://github.com/antoine-mouchamps/gymtorax> (tags v1.0.0 and v1.1.1 read directly after `git clone`), docs <https://gymtorax.readthedocs.io>. Status: **verified** (read from the source).

- `envs/iter_hybrid_env.py`: actions `IpAction(max=[15e6], ramp_rate=[0.2e6])`, `NbiAction(max=[33e6, 1.0, 1.0])`, `EcrhAction(max=[20e6, 1.0, 1.0])`; TORAX config with `t_final: 150`, `fixed_dt: 1`, R = 6.2 m, a = 2.0 m, B_0 = 5.3 T, QLKNN transport, prescribed pedestal `T_i_ped = T_e_ped = {0: 0.5, 100: 0.5, 105: 3.0}` keV at ρ = 0.95, Greenwald-fraction density boundary condition 0.35 and pedestal 0.85; config docstring "ITER hybrid scenario based (roughly) on van Mulders Nucl. Fusion 2021".
- Reward code: `r = (Q/10)/50·[H] + min(H98,1)/50·[H] + min(q_min,1)/150 + min(q95/3,1)/150` with `[H] = 1` if T_e(0) > 10 keV and T_i(0) > 10 keV (the "H-mode" test), weights `[1, 1, 1, 1]`.
- `envs/base_env.py`: "reward = -1000.0  # Large negative reward on failure" when the TORAX step fails or the observation leaves the bounds file `iter_hybrid.json`, and the episode terminates.
- `docs/example/policies.rst`: the PI controller tracks the central current density on a linear target "from 0.6 MA/m² to 2 MA/m²" over 100 s, holds its last output for the rest of the episode, and uses gains k_p = 0.700, k_i = 34.257 found by maximising the expected return.
- `CHANGELOG.md`: v1.1.0 (2026-07-11) moved to TORAX 1.4 and changed "Action semantics: ramp-to-setpoint - action values now ramp linearly from the current value to the setpoint over each action window, instead of being applied as a constant hold".

### R4
**Citrin J., Goodfellow I., Raju A., Chen J., Degrave J., Donner C., Felici F., Hamel P., Huber A., Nikulin D., Pfau D., Tracey B., Riedmiller M., Kohli P.** "TORAX: A Fast and Differentiable Tokamak Transport Simulator in JAX." arXiv:2406.06718 (2024).
Opened: <https://arxiv.org/abs/2406.06718>, <https://arxiv.org/html/2406.06718>. Status: **verified**.

- Solves four coupled 1D PDEs in the normalised toroidal-flux coordinate: ion heat, electron heat, electron density, and poloidal-flux (current) diffusion.
- Turbulent transport: constant, critical-gradient (CGM) and QLKNN (QLKNN-hyper-10D neural-network surrogate of QuaLiKiz, with separate networks for ITG, TEM and ETG modes).
- Pedestal: "can be mimicked in TORAX through an adaptive source term which sets a desired value (pedestal height) of Te, Ti and ne, at a user-configurable location".
- Sawteeth and neoclassical tearing modes listed as future "MHD models"; not in the paper version.
- Verification: agreement with RAPTOR of about 1 % NRMSD at stationary state and below 5 % in dynamic phases.
- Timing (their Table 1, ITER ramp-up, 80 s simulated, 25 cells, QLKNN): Newton-Raphson 15.6 s compile + 22 s run; predictor-corrector 4.5 s compile + 6.5 s run.
- Benchmark ITER hybrid case: I_p 11.5 MA, B_0 5.3 T, R 6.2 m, a 2.0 m, 50 MW heating, Z_eff 2.0.

### R4b
**TORAX 1.0.3 documentation.** Equation summary <https://torax.readthedocs.io/en/v1.0.3/equation_summary.html> and physics models <https://torax.readthedocs.io/en/v1.0.3/physics_models.html>. Status: **verified** (opened directly).

- The four transport PDEs as used in this repo's [primer](02-primer.md), including the current-diffusion equation for the poloidal flux ψ with neoclassical conductivity σ_∥ and non-inductive current ⟨B·j_ni⟩.
- Boundary conditions: zero derivative at ρ̂ = 0; Dirichlet T_i, T_e, n_e at ρ̂ = 1; for ψ a Neumann condition "which sets the total plasma current" I_p (so the I_p action is a boundary condition of a diffusion equation).
- Pedestal: "set up in TORAX through an adaptive source term which sets a desired value (pedestal height) of T_e, T_i and n_e, at a user-configurable location (pedestal width)".
- Sawteeth: "Currently only a sawtooth model is implemented" among MHD models, with "simple Trigger and Redistribution models". The Gym-TORAX ITER hybrid config (R3) does not enable it: its TORAX config has no `mhd` section (checked in the installed source of gymtorax 1.0.0 and 1.1.1).

### R5
**TORAX source, releases and discussion #1625.** <https://github.com/google-deepmind/torax>, releases <https://github.com/google-deepmind/torax/releases>, <https://github.com/google-deepmind/torax/discussions/1625>. Status: **verified**.

- Licence Apache-2.0; latest release v1.4.3 published 2026-07-03; PyPI `requires_python >= 3.11` (the brief says 3.12+; the PyPI metadata says 3.11+).
- Discussion #1625 (opened 6 Oct 2025 by a user asking for an RL environment): maintainer reply of 7 Oct 2025, "We are looking to expose a more advanced control-oriented API in the near future which should be quite useful for a RL use case"; a UKAEA contributor on 8 Oct 2025, "One of our goals at UKAEA is to work towards a set of public benchmark cases for ML problems on the STEP tokamak. There are some developments on this front soon to be announced." No date is committed.

## RL and ML for tokamak control (primary results)

### R6
**Degrave J., Felici F., Buchli J., Neunert M., Tracey B., Carpanese F., Ewalds T., Hafner R., Abdolmaleki A., de las Casas D., et al. (31 authors)** "Magnetic control of tokamak plasmas through deep reinforcement learning." *Nature* 602, 414–419 (16 Feb 2022). Open access.
Opened: <https://www.nature.com/articles/s41586-021-04301-9> (full text fetched directly). Status: **verified**.

- Algorithm MPO; the policy "consumes the magnetic and current sensors of TCV at a 10-kHz control rate" and actuates "the 19 TCV control coils".
- Observation: "34 of the wire loops that measure magnetic flux, 38 probes that measure the local magnetic field and 19 measurements of the current in active control coils (augmented with an explicit measure of the difference in current between the ohmic coils)", i.e. 91 measurements plus one derived difference.
- Hardware accuracy (shape RMSE of the last closed flux surface): 0.78 cm limited phase and 0.53 cm diverted phase of the first demonstration (0.75 cm over the full window, I_p RMSE 0.62 kA); 1.6 cm for elongation 1.9; 1.4 cm with β_p rising to 1.12 under heating; 1.3 cm for triangularity −0.8; 0.65 cm during a snowflake transition.
- Handover: "At a prespecified time, termed the 'handover', control is switched to our control policy"; plasma formation (breakdown and early current rise) stays with the conventional controller.
- Simulator: "FGE and LIUQE are available subject to license agreement from the Swiss Plasma Center at EPFL".
- Compute: "We used 5,000 actors in parallel for our experiments, generally resulting in training times of 1-3 days".
- Safety: "they are not guaranteed to avoid plasma disruptions".

### R7
**Tracey B. D., Michi A., Chervonyi Y., Davies I., Paduraru C., Lazic N., Felici F., Ewalds T., Donner C., Galperti C., et al., and the TCV Team** "Towards practical reinforcement learning for tokamak magnetic control." arXiv:2307.11546 (21 Jul 2023).
Opened: <https://arxiv.org/abs/2307.11546>. Status: **verified** (abstract); the journal venue (*Fusion Engineering and Design* 200, 114161, 2024) is **unverified**.

- "up to 65% improvement in shape accuracy"; training time for new tasks reduced "by a factor of 3 or more"; new experiments on TCV.

### R8
**Seo J., Kim S., Jalalvand A., Conlin R., Rothstein A., Abbate J., Erickson K., Wai J., Shousha R., Kolemen E.** "Avoiding fusion plasma tearing instability with deep reinforcement learning." *Nature* 626, 746–751 (21 Feb 2024).
Opened: <https://pmc.ncbi.nlm.nih.gov/articles/PMC10881383/> (PMC full text). Status: **verified**; the number of shots used to train the underlying dynamics model is **unverified** (the paper defers to its ref. 5).

- DDPG ("implemented using Keras-RL") trained against a learned dynamic model that predicts β_N and "tearability" 25 ms ahead.
- Observation: five profiles (electron density, electron temperature, ion rotation, safety factor, pressure) on 33 grid points; actions: total beam power and plasma-boundary triangularity.
- DIII-D discharges named: 193277, 193280, 193281, 193282.
- "Our work is a proof-of-concept study on tearing avoidance using RL and is still in the early stages of fine-tuning."

### R9
**PACMAN (Prediction And Control using MAchiNe learning), PPPL/Princeton.** News: ScienceDaily, 6 Sep 2026, <https://www.sciencedaily.com/releases/2026/09/260903064215.htm>. Paper: **Rothstein A., Farre-Kaga H. J., Butt J., Shousha R., Erickson K., Wakatsuki T., Steiner P., Kim S. K., Jalalvand A., Kolemen E.** "Enabling integrated AI control on DIII-D: a control system design with state-of-the-art experiments." *Nuclear Fusion* 66(7) 076050 (July 2026), [doi:10.1088/1741-4326/ae7f9d](https://doi.org/10.1088/1741-4326/ae7f9d).
Opened: both URLs. Status: **verified** from the news page and the IOP abstract.

- A real-time ML control framework on DIII-D: about 20 ms control cycle, tearing mode predicted about 200 ms ahead, tested in five experiments, coordinating all six DIII-D gyrotrons (numbers from the news page).

### R10
**Wang A. M., Rea C., So O., Dawson C., Garnier D. T., Fan C.** "Active ramp-down control and trajectory design for tokamaks with neural differential equations and reinforcement learning." *Communications Physics* 8, 231 (4 Jun 2025).
Opened: <https://www.nature.com/articles/s42005-025-02146-6>. Status: **verified**.

- PPO trained on PopDownGym, a differentiable neural-ODE dynamics model, then transferred to the RAPTOR simulator; target device SPARC (primary reference discharge: 8.7 MA H-mode, projected Q ≈ 11); 8-dimensional observation, 4-dimensional action; goal: ramp I_p below 2 MA; model trained on 336 of 481 RAPTOR ramp-down simulations. This is a simulation study: SPARC is not operating.

### R11
**Wang A. M., Pau A., Rea C., So O., Dawson C., Sauter O., Boyer M. D., et al.** "Learning plasma dynamics and robust rampdown trajectories with predict-first experiments at TCV." *Nature Communications* (6 Oct 2025), [doi:10.1038/s41467-025-63917-x](https://doi.org/10.1038/s41467-025-63917-x).
Opened: <https://www.nature.com/articles/s41467-025-63917-x>. Status: **verified**.

- Neural state-space model plus RL trajectory design, tested in TCV experiments: "increasing the plasma current by 20%, from 140 to 170 kA" in a predict-first ramp-down.

### R12
**PopDownGym repository.** <https://github.com/MIT-PSFC/PopDownGym> now redirects (HTTP 301) to <https://github.com/allen-adastra/PopDownGym>. Opened via the GitHub API. Status: **verified**: no licence file (`license: null`), README empty at the time of access.

### R13
**Fu Y., Bao H., Sonker R., Hu X., Venugopal A., Schneider J., Chen J.** "Offline Reinforcement Learning for Plasma Control in Nuclear Fusion: Codebase and Benchmark." arXiv:2606.07550 (the PDF header reads 19 May 2026). Code: <https://github.com/LucasCJYSDL/Offline-RL-Kit-for-Nuclear-Fusion> (MIT).
Opened: <https://arxiv.org/abs/2606.07550>, <https://arxiv.org/pdf/2606.07550>, the repository README and LICENSE. Status: **verified**.

- Data: "the benchmark contains 5,882 shots and 945,828 timesteps" of DIII-D; 5,282 train / 300 validation / 300 test shots.
- Tasks: tracking of rotation, density, temperature and pressure profiles, evaluated in closed loop on a learned DIII-D dynamics model.
- Algorithms: PPO, CQL, IQL, EDAC, MCQ, TD3+BC, COMBO, MOBILE, MOPO, BAMBRL/BAMCTS, RAMBO, ROMBRL, plus goal-conditioned imitation learning.
- Result: "offline model-based RL methods obtain the best average performance on most objectives, although no single method dominates all tasks"; MOPO is the most consistent (temperature RMSE 0.193 vs PPO 0.240; pressure 5198.6 vs RAMBO 5358.2), COMBO is best on density (0.691 vs MOPO 0.727), RAMBO on rotation (8.03).
- Compute: MOPO about 11 GPU-hours, TD3+BC about 6 h, COMBO about 1.2 days.

### R14
**Google DeepMind and Commonwealth Fusion Systems partnership (SPARC), 16 Oct 2025.**
Opened: <https://deepmind.google/blog/bringing-ai-to-the-next-generation-of-fusion-energy/> and <https://blog.cfs.energy/with-ai-alliance-google-deepmind-and-cfs-take-fusion-to-the-next-level/>. Status: **verified** for the date and scope; the 200 MW power-purchase figure is **unverified** (reported by a fetch summary only).

- TORAX is used to simulate SPARC; RL and optimisation are to be applied to operating SPARC's control knobs and to steering exhaust heat.

### R15 Timeline sources

All opened on the publisher or arXiv page (IOP pages sit behind a bot wall, so titles, volumes and article numbers for IOP papers were read from the Crossref record of the DOI, `https://api.crossref.org/works/<doi>`, and the facts from the page or abstract by a research subagent). Status: **verified** unless noted.

| Ref | Citation | URL |
|---|---|---|
| R15a | Kates-Harbeck J., Svyatkovskiy A., Tang W., "Predicting disruptive instabilities in controlled fusion plasmas through deep learning", *Nature* 568, 526 (Apr 2019). "Median alarm times are about 500–700 ms on DIII-D and around 1,000 ms on JET." | <https://www.nature.com/articles/s41586-019-1116-4> |
| R15b | Wakatsuki T., Suzuki T., Hayashi N., Oyama N., Ide S., "Safety factor profile control with reduced central solenoid flux consumption during plasma current ramp-up phase using a reinforcement learning technique", *Nucl. Fusion* 59, 066022 (May 2019). RL on a transport model of a DEMO-class device: "resistive flux consumption less than 60% of the empirical estimation … using the Ejima constant of 0.45". | <https://doi.org/10.1088/1741-4326/ab1571> |
| R15c | Seo J., Na Y.-S., Kim B., et al., "Feedforward beta control in the KSTAR tokamak by deep reinforcement learning", *Nucl. Fusion* 61, 106010 (Sep 2021). RL on an LSTM simulator, validated in KSTAR experiments. | <https://doi.org/10.1088/1741-4326/ac121b> |
| R15d | Abbate J., Conlin R., Shousha R., Erickson K., Kolemen E., "A general infrastructure for data-driven control design and implementation in tokamaks", *J. Plasma Phys.* 89, 895890102 (Jan 2023). NN model plus finite-set MPC on DIII-D. | <https://doi.org/10.1017/S0022377822001040> |
| R15e | Char I., Abbate J., Bardóczi L., Boyer M., et al., "Offline Model-Based Reinforcement Learning for Tokamak Control", L4DC, PMLR 211, 1357 (Jun 2023). PPO on a learned DIII-D model; β_N = 1.75 and rotation targets reached in experiment ("hitting the β_N target remarkably well"). | <https://proceedings.mlr.press/v211/char23a.html> |
| R15f | Wakatsuki T., Yoshida M., Narita E., Suzuki T., Hayashi N., "Simultaneous control of safety factor profile and normalized beta for JT-60SA using reinforcement learning", *Nucl. Fusion* 63, 076017 (May 2023). Simulation: q_min held at 2–3 and β_N at 3 in ITB plasmas. | <https://doi.org/10.1088/1741-4326/acd393> |
| R15g | Dubbioso S., De Tommasi G., Mele A., Tartaglione G., Ariola M., Pironti A., "A Deep Reinforcement Learning approach for Vertical Stabilization of tokamak plasmas", *Fusion Eng. Des.* 194, 113725 (Sep 2023). DDPG on a linearised ITER model; lower voltage effort than the model-based controller early in the transient. | <http://wpage.unina.it/adriano.mele/docs/2023%20FED%20-%20A%20Deep%20Reinforcement%20Learning%20approach%20for%20VS.pdf> |
| R15h | Van Mulders S., Sauter O., Bock A., Burckhart A., Contré C., Felici F., et al., "Inter-discharge optimization for fast, reliable access to ASDEX Upgrade advanced tokamak scenario", *Nucl. Fusion* 64, 026021 (Jan 2024). Non-RL RAPTOR optimisation of ramp-up heating, reaching "a stationary state with q_min > 1 at the beginning of the flat-top phase". | <https://doi.org/10.1088/1741-4326/ad1a55> |
| R15i | Kim S. K., Shousha R., Yang S. M., Hu Q., et al., "Highest fusion performance without harmful edge energy bursts in tokamak", *Nat. Commun.* 15, 3990 (May 2024). ML surrogate plus real-time 3D-field optimisation on DIII-D and KSTAR; fusion figure of merit up to +90 %. | <https://www.nature.com/articles/s41467-024-48415-w> |
| R15j | Kerboua-Benlarbi S., Nouailletas R., Faugeras B., Nardon E., Moreau P., "Magnetic Control of WEST Plasmas Through Deep Reinforcement Learning", *IEEE Trans. Plasma Sci.* 52 (Sep 2024), doi:10.1109/TPS.2024.3377811. Actor-critic trained on the NICE free-boundary code. The IEEE page returned an empty response; content from the Crossref record and a subagent's summary: **partially verified**. | <https://ieeexplore.ieee.org/document/10482855/> |
| R15k | Wu N., Yang Z., Li R., Wei N., et al., "High-fidelity data-driven dynamics model for reinforcement learning-based control in HL-3 tokamak", *Commun. Phys.* 8, 393 (Oct 2025). PPO on a data-driven model: "the agent maintains a 400-ms, 1 kHz control trajectory on the HL-3 tokamak"; current tracking error 2.55 kA (0.85 % of 300 kA). | <https://www.nature.com/articles/s42005-025-02302-y> |
| R15l | Zhang et al. (ASIPP), "Isoflux plasma shape control under large transient disturbances on EAST via reinforcement learning", *Nucl. Fusion* 66, 086012 (Jul 2026). RL controller compared with PID under disturbances. | <https://doi.org/10.1088/1741-4326/ae8313> |

## RL methods

### R16
**Schulman J., Wolski F., Dhariwal P., Radford A., Klimov O.** "Proximal Policy Optimization Algorithms." arXiv:1707.06347 (2017). <https://arxiv.org/abs/1707.06347>. **verified**.

### R17
**Haarnoja T., Zhou A., Abbeel P., Levine S.** "Soft Actor-Critic: Off-Policy Maximum Entropy Deep Reinforcement Learning with a Stochastic Actor." arXiv:1801.01290 (2018), and Haarnoja et al., "Soft Actor-Critic Algorithms and Applications", arXiv:1812.05905 (2018, automatic temperature tuning). <https://arxiv.org/abs/1801.01290>, <https://arxiv.org/abs/1812.05905>. **verified**.

### R18
**Abdolmaleki A., Springenberg J. T., Tassa Y., Munos R., Heess N., Riedmiller M.** "Maximum a Posteriori Policy Optimisation." arXiv:1806.06920 (2018). <https://arxiv.org/abs/1806.06920>. **verified**.

### R19
**Janner M., Fu J., Zhang M., Levine S.** "When to Trust Your Model: Model-Based Policy Optimization." NeurIPS 2019, arXiv:1906.08253. <https://arxiv.org/abs/1906.08253>. **verified**: ensemble of 7 models; model-rollout length k scheduled per task (k = 1 on HalfCheetah, ramped 1 → 15 or 1 → 25 on others); "MBPO's performance on the Ant task at 300 thousand steps matches that of SAC at 3 million steps."

### R20
**Yu T., Thomas G., Yu L., Ermon S., Zou J., Levine S., Finn C., Ma T.** "MOPO: Model-based Offline Policy Optimization." NeurIPS 2020, arXiv:2005.13239. <https://arxiv.org/abs/2005.13239>. **verified**: penalised reward r̃(s,a) = r̂(s,a) − λ max_i ‖Σ_i(s,a)‖_F.

### R21
**Fujimoto S., Gu S. S.** "A Minimalist Approach to Offline Reinforcement Learning." NeurIPS 2021, arXiv:2106.06860. <https://arxiv.org/abs/2106.06860>. **verified**: π = argmax E[λQ(s,π(s)) − (π(s) − a)²], λ = α / mean|Q|, "We use α = 2.5", states normalised with dataset mean and standard deviation (ε = 10⁻³).

### R22
**Kumar A., Hong J., Singh A., Levine S.** "When Should We Prefer Offline Reinforcement Learning Over Behavioral Cloning?" ICLR 2022, arXiv:2204.05618. <https://arxiv.org/abs/2204.05618>. **verified**: "policies trained on sufficiently noisy suboptimal data can attain better performance than even BC algorithms with expert data, especially on long-horizon problems."

### R23
**Fu J., Kumar A., Nachum O., Tucker G., Levine S.** "D4RL: Datasets for Deep Data-Driven Reinforcement Learning." arXiv:2004.07219 (2020). <https://arxiv.org/abs/2004.07219>. **verified**: "medium" data come from an early-stopped SAC policy (1M samples).

### R24
**Raffin A., Hill A., Gleave A., Kanervisto A., Ernestus M., Dormann N.** "Stable-Baselines3: Reliable Reinforcement Learning Implementations." *JMLR* 22(268):1–8 (2021). <https://jmlr.org/papers/v22/20-1364.html>. **verified**; MIT licence at <https://github.com/DLR-RM/stable-baselines3>.

### R25
**Towers M., Kwiatkowski A., Terry J., et al.** "Gymnasium: A Standard Interface for Reinforcement Learning Environments." arXiv:2407.17032 (2024). <https://arxiv.org/abs/2407.17032>. **verified**; MIT licence.

## Tokamak physics background

### R26
**ITER Organization, facts and figures.** <https://www.iter.org/facts-figures>, <https://www.iter.org/components>, <https://www.iter.org/machine/magnets>. **verified**: "For 50 MW of power injected … it will produce 500 MW of fusion power for periods of 400 to 600 seconds. This tenfold return is expressed by Q ≥ 10"; plasma major radius 6.2 m; plasma volume 830 m³ (840 m³ on the components page); "will initiate and sustain a plasma current of 15 MA for durations of 300-500 seconds". The minor radius 2.0 m and field 5.3 T were not found as bare numbers on iter.org; they are taken from the Gym-TORAX config (R3) and the TORAX paper (R4).

### R27
**ITER Organization, "ITER Research Plan within the Staged Approach", ITER Technical Report ITR-18-003 (2018).** <https://www.iter.org/sites/default/files/ITER-Research-Plan_final_ITR_FINAL-Cover_High-Res.pdf>. **verified**: operation "culminating in 12 - 15 MA/5.3 T DT H-mode operation"; the long-pulse goal is developed "at 11.2 MA/5.3 T to demonstrate the final Q = 5, 1000 s goal … based on the hybrid/improved H-mode scenario at q95 ~ 4"; "Operation at 15 MA/5.3 T requires the full capabilities of the central solenoid and optimization of the current ramp-up/down together with the use of additional heating"; ramp-up/down is to be optimised "to minimize flux consumption".

### R28
**Greenwald M.** "Density limits in toroidal plasmas." *Plasma Phys. Control. Fusion* 44 (2002) R27. Opened (open copy): <https://courses.physics.ucsd.edu/2021/Spring/physics218c/AA_%20Greenwald_2002_Plasma_Phys._Control._Fusion_44_R27.pdf>. **verified**: n_G = I_p/(πa²) with n in 10²⁰ m⁻³, I_p in MA, a in m; β_N ≡ (aB_T/I_p)β with I_p in MA, B_T in T, a in m.

### R29
**ITER Physics Expert Groups, "ITER Physics Basis, Chapter 2: Plasma confinement and transport."** *Nucl. Fusion* 39 (1999) 2175; preprint JET-P(98)17 opened at <https://scipub.euro-fusion.org/wp-content/uploads/2014/11/JETP980172.pdf>. **verified**: IPB98(y,2) scaling τ_E = 0.0562 I_p^0.93 B^0.15 n^0.41 P^−0.69 R^1.97 κ^0.78 ε^0.58 M^0.19 (Table 2.6.4-I).

### R30
**ITER Physics Basis, Chapter 8: Plasma operation and control.** *Nucl. Fusion* 39 (1999) 2577, <https://iopscience.iop.org/article/10.1088/0029-5515/39/12/308>. Only the abstract could be opened: **unverified** for any specific ramp-up statement; not used for numbers.

## Corrections to the brief

The brief that started this project stated several facts that the opened sources contradict or could not confirm:

| Brief said | Source says | Where |
|---|---|---|
| RL4F uses "~18,000 DIII-D shots" | 5,882 shots, 945,828 timesteps | [R13](#r13) |
| RL4F: "MOPO best overall" | MOPO most robust across tasks, but "no single method dominates all tasks" (COMBO best on density, RAMBO on rotation) | [R13](#r13) |
| PopDownGym: "PPO on neural ODEs" for ramp-down | correct, but it is a SPARC *simulation* study; the TCV experiments are a separate *Nat. Commun.* 2025 paper | [R10](#r10), [R11](#r11) |
| PopDownGym at github.com/MIT-PSFC/PopDownGym | redirects to allen-adastra/PopDownGym; no licence file | [R12](#r12) |
| Software Impacts 27:100829, Feb 2026 | volume and article number confirmed; DOI is 10.1016/j.simpa.**2026**.100829; month unverified | [R2](#r2) |
| TORAX "needs Python 3.12+" | PyPI metadata: `>=3.11` | [R5](#r5) |
| TCV: "91 sensors … 0.6–1.6 cm shape error" | 34 + 38 + 19 = 91 measurements plus one derived ohmic-current difference; shape RMSE 0.53–1.6 cm across the reported experiments | [R6](#r6) |
| Published baselines 3.79 / 3.40 / −10.79 | correct for Gym-TORAX 1.0 / TORAX 1.0 only; the maintainers state they are out of date for v1.1 | [R1](#r1), [R3](#r3) |
