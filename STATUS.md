# STATUS
repo: https://github.com/leandergrech/rl-tokamak-rampup
pages: https://leandergrech.github.io/rl-tokamak-rampup/
step: 7
state: done
updated: 2026-10-02T12:30:04Z
blockers: none
next: physics-consistent environment on gymtorax 1.1.1 / TORAX 1.4.3 (see '## Physics environment task
repo: https://github.com/leandergrech/rl-tokamak-rampup
step: 6
state: done
updated: 2026-10-02T14:48:59Z
blockers: none
next: Leander reviews docs/04b-physics-env.md; randomise the physics parameters within their measured uncertainty (open question 3)
log:
- 2026-10-02T13:10:00Z decisions (Leander): new environment with 1.0 results frozen; recommended limits (terminate on Greenwald f_GW > 1 and l_i window; 1.2 x P_LH margin in the reward; no termination on H-L back-transition); vast.ai up to ~$5; checkpoints to a GitHub release; 2 h per run
- 2026-10-02T13:40:00Z rl_tokamak.physics (gymtorax 1.1.1 / TORAX 1.4.3): TORAX pedestal formation model (Martin 2008, hysteresis 0.8, 0.5 s ramp, H-mode T_ped 3 keV), plant density control (gas puff L-mode f_GW 0.6, pedestal fuelling H-mode 0.85), limits f_GW > 1 and l_i(3) outside [0.65, 1.2] to 100 s (upper limit 1.2 = vertical-control risk, Humphreys 2008; Leander chose it over the 1.0 design value), reward Q cap 10 + H-mode terms only in TORAX H-mode with P_heat >= 1.2 P_LH. pyproject extras paper/physics, CI on both stacks, 14 verified sources R34-R47
- 2026-10-02T13:40:00Z PI re-tuned (155 candidates): kp 0.1, ki 0.3, j(0) target to 3.75 MA/m^2 -> 3.2418; paper gains fail at 9 s (l_i 0.647). Open loop 3.0889, heating cut 1.81, no heating 1.70, random 20/20 terminated on l_i, CEM 3.2601 (160 episodes). Earlier statement that no PI passes the 1.0 limit was wrong (incomplete first grid): the re-tuned PI peaks at l_i 0.977
- 2026-10-02T14:48:59Z vast.ai (personal account, instance 53868046, EPYC 7742 64 cores, $0.30/h, $0.26 total, destroyed): batch 1 PPO on PI 3.56 +- 0.10 (5/5 > PI), MBPO on PI 1/5 > PI (trims flat-top heating below P_LH; learned model keeps H-mode) -> kept in .runs/vast6/attempt1. ConfinementAdvance applies TORAX's L-H rule in model rollouts (exact on 2,086 logged steps), mode flags encode L/H/L->H/H->L exactly. Batch 2: PPO on PI 3.486 +- 0.143 (5/5 > PI, 3.25-3.63), MBPO on PI 3.24/3.31/3.47/-999.59 (l_i at 32 s)/3.46. Laptop re-evaluation exact; policies in release checkpoints-physics-v1; docs/04b-physics-env.md

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
