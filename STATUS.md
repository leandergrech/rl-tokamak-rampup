# STATUS
repo: https://github.com/leandergrech/rl-tokamak-rampup
pages: not yet live
step: 4
state: running
updated: 2026-09-30T16:56:18Z
blockers: none
next: finish MBPO/SAC/PPO/offline runs + ablations + CEM open-loop search, then write docs 04-06, for-leander, index, README
log:
- 2026-09-30T16:04:44Z step 0 done: gh logged in as leandergrech (repo, workflow scopes); git user.name "Leander Grech"; repo folder empty
- 2026-09-30T16:05:16Z step 1 done: skeleton committed, public repo created and pushed
- 2026-09-30T16:34:16Z step 2 done: gymtorax 1.0.0 + torax 1.0.3 + jax 0.11.2 (Python 3.12.3) in .venv-v10 reproduces paper: PI 3.7919 (paper 3.79), open-loop 3.4086 (paper 3.40). Current gymtorax 1.1.1/torax 1.4.3 in .venv differs (OL 3.26, paper PI gains fail at step 105). Benchmark pinned to 1.0.0.
- 2026-09-30T16:56:18Z step 3 done: docs/07-references (sources opened, Crossref-verified titles, corrections to brief), 01-problem, 02-primer, 03-timeline pushed
- 2026-09-30T16:56:18Z step 4 running: classical eval (PI 3.7919 == gymtorax PIDAgent), datasets (noisy PI sigma=0.3 scores 4.01), MBPO 3.95 after 1,364 sim steps (beats PI 3.79), SAC/offline chain training; CPU shared with rl-rocket-engine-control and rl-flatland-rescheduling sessions
