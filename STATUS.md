# STATUS
repo: https://github.com/leandergrech/rl-tokamak-rampup
pages: https://leandergrech.github.io/rl-tokamak-rampup/
step: 7
state: done
updated: 2026-10-01T08:38:36Z
blockers: none
next: Leander reviews the site and docs/upstream drafts; first experiment = randomised Gym-TORAX on the audited reward (notebooks/03)
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
- 2026-09-30T23:20:24Z vast.ai instance 53597337 (EPYC 7R13, 48 cores, $0.161/h) ran 12 jobs 00:29-01:20 CEST, destroyed; total vast spend ~$0.15. Idle-machine runs: PPO s1 48.98 and SAC s1 27.08 (both Q-farming, audited 3.53/..), MBPO s4 10.82 (exploit), MBPO obs=full s1 final 5.63 raw / 3.69 audited, audited-reward MBPO s0-s2 -998/2.98/3.16; CEM open-loop 4.08 raw (3.57 audited), CEM on audited objective 3.63 audited
- 2026-10-01T01:21:52Z step 5-6 done: docs 04-06, for-leander, index, README with final numbers, 14 diagrams/figures, theme A (Plasma); notebooks 01-03 executed; pytest 15 passed; reproduce.sh 32/32 checkpoints OK (55 min, busy laptop); mkdocs --strict clean; tracked data 19.0 MB
- 2026-10-01T08:38:36Z docs pass: 7 interactive widgets (q field lines, current-diffusion toy, TORAX profile player, reward explorer, episode replay, Greenwald/IPB98 calculator, results explorer), In-short boxes, figure captions, home hero + cards, logo, 'how every number is checked' section; audit fixes (random seed-0 value, MBPO/CEM settings, 61 s, heating step convention)
- 2026-10-01T12:00:00Z primer restructured: docs/02-primer.md is now a hub; 8 chapters + equation sheet under docs/primer/; new widgets machine (3D torus), power (0-D balance), opspace (TORAX trajectories), lab (Ramp-up Lab: reduced model docs/javascripts/tokamak-model.js calibrated to 6 TORAX episodes via scripts/calibrate_lab_model.mjs; presets replay TORAX actions from docs/assets/widgets/lab.json, sandbox, benchmark designer). mkdocs build --strict passes
- 2026-10-01T15:00:00Z docs theme: custom stroke-icon family overrides/.icons/rt (18 icons: tokamak, flux surfaces, cutaway, field line, current, fusion, gauge, reward, lab flask, ...) used for page icons in the navigation, page headings, home and primer cards and chapter links; numbering removed from nav and headings; home page no longer hides the navigation

## Fork task
repo: https://github.com/leandergrech/gymtorax (branch fix/audited-iter-hybrid-reward; pinned backport branch fix/audited-iter-hybrid-reward-v1.0 off tag v1.0.0)
step: 7
state: done
updated: 2026-10-01T00:13:53Z
blockers: none (one pre-existing v1.0.0 test needs a Qt binding outside CI; passes with CI=1)
next: Leander reviews docs/upstream/issue.md and pr.md, then opens the issue and PR himself
log:
- 2026-09-30T22:41:19Z step 0: fork task started; rl-tokamak-rampup runs still going (vast.ai instance 53597337, 12 jobs, until ~01:20 CEST)
- 2026-09-30T23:20:24Z step 1 done: forked, branch fix/audited-iter-hybrid-reward off main (v1.1.1; upstream dev is behind main), .venv via poetry.lock (torax 1.4.2). Clean checkout: ruff ok, 87 passed/11 skipped, docs 3 passed, scenarios 4 passed
- 2026-09-30T23:20:24Z steps 2-3: IterHybridAuditedEnv + gymtorax/IterHybridAudited-v0, get_P_SOL/get_P_LH getters, examples/reward_exploit.py (OL ref, heating off from 105 s): HEAD v0 20.96 (max Q 244, 100% of H-mode steps P_SOL<P_LH) vs audited 1.83; tests/test_audited_env.py: 8 passed, 2 skipped on HEAD. Backport branch off v1.0.0 (poetry lock: torax 1.0.3, jax 0.7.1)
- 2026-10-01T00:13:53Z step 4: baselines (examples/baselines_audited.md). 1.0.0/torax 1.0.3: PI 3.79->3.50, OL 3.41->3.41, random 3.23+-0.06 (0/20 fail)->2.16+-0.06, heating-cut 22.74->1.91, TD3+BC 4.01->3.56, MBPO full-obs s1 5.63->3.69. 1.1.1/torax 1.4.2: PI -998.67 (fails) both, OL 3.26->3.18, random 3.15+-0.06->2.09+-0.05, heating-cut 20.96->1.83
- 2026-10-01T00:13:53Z steps 5-7: docs/example/iter_env_audited.rst + CHANGELOG; branches pushed to https://github.com/leandergrech/gymtorax (fix/audited-iter-hybrid-reward, fix/audited-iter-hybrid-reward-v1.0). HEAD CI commands: ruff ok, 100 passed/13 skipped, docs 3 passed, scenarios 4 passed. v1.0 branch: 78 passed, 1 failed (pre-existing Qt test, passes with CI=1). Drafts: docs/upstream/issue.md, docs/upstream/pr.md (not opened). Time: HEAD tests+table 21 min; pinned 48 min; 69 min combined on a CPU at load 25-35
