# STATUS
repo: https://github.com/leandergrech/rl-tokamak-rampup
pages: https://leandergrech.github.io/rl-tokamak-rampup/
step: 4
state: running
updated: 2026-09-30T21:35:02Z
blockers: none
next: audited-reward MBPO seeds, MBPO seeds 3-4, CEM (benchmark + audited) running locally until ~00:30 CEST; waiting for Leander to pick a site theme (options A/B/C sent); then final docs, notebooks, reproduce.sh
log:
- 2026-09-30T16:04:44Z step 0 done: gh logged in as leandergrech (repo, workflow scopes); git user.name "Leander Grech"; repo folder empty
- 2026-09-30T16:05:16Z step 1 done: skeleton committed, public repo created and pushed
- 2026-09-30T16:34:16Z step 2 done: gymtorax 1.0.0 + torax 1.0.3 + jax 0.11.2 (Python 3.12.3) in .venv-v10 reproduces paper: PI 3.7919 (paper 3.79), open-loop 3.4086 (paper 3.40). Current gymtorax 1.1.1/torax 1.4.3 in .venv differs (OL 3.26, paper PI gains fail at step 105). Benchmark pinned to 1.0.0.
- 2026-09-30T16:56:18Z step 3 done: docs/07-references (sources opened, Crossref-verified titles, corrections to brief), 01-problem, 02-primer, 03-timeline pushed
- 2026-09-30T16:56:18Z step 4 running: classical eval (PI 3.7919 == gymtorax PIDAgent), datasets (noisy PI sigma=0.3 scores 4.01), MBPO 3.95 after 1,364 sim steps (beats PI 3.79), SAC/offline chain training; CPU shared with rl-rocket-engine-control and rl-flatland-rescheduling sessions
- 2026-09-30T17:56:21Z step 4: random policy 3.23+-0.06 over 20 seeds, 0 failures (paper -10.79 NOT reproduced); BC on 1 PI trajectory 3.79; TD3+BC on it fails (-998); exploration failures traced to edge q>100 at low I_p -> I_p floor raised to 3 MA; runs ~3-10x slower than idle because the CPU is shared with other sessions
- 2026-09-30T19:09:54Z step 4: PPO 2.99 (14.1k steps), SAC 2.92 (11.2k), MBPO final-protocol s0 2.98 (1.8k); first-protocol MBPO peaked 3.95 at 1,364 steps; MOPO on 1 PI trajectory 3.94 (cuts flat-top heating: Q-term loophole); BC 3.79/3.85; TD3+BC -998 (pi_det) / 3.79 (noisy); pytest 15 passed; CI + Pages workflows green; site live (drafts)
- 2026-09-30T21:35:02Z FINDING: benchmark reward is exploitable. MBPO reached 8.85 (raw reward) and 18.42 (seed 1) by cutting aux heating after the scheduled pedestal -> uncapped Q=P_fus/P_aux up to 210, P_SOL/P_LH~0.2. Added audited score (Q capped at 10, H-mode gate needs P_SOL>=P_LH): PI 3.50, exploits ~2.0, best learned TD3+BC(noisy PI) 3.56
- 2026-09-30T21:35:02Z vast.ai: rented instance 53588773 (approved offer 47588726, $0.21/h); image pull stalled ~20 min, destroyed; ~$0.003 spent; offer no longer listed, jobs moved back to the laptop. Diagrams + 10 figures added; 3 theme options sent for review
