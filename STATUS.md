# STATUS
repo: https://github.com/leandergrech/rl-tokamak-rampup
pages: not yet live
step: 2
state: running
updated: 2026-09-30T16:34:16Z
blockers: none
next: step 3/4 in parallel: references + primer docs while baselines train on CPU
log:
- 2026-09-30T16:04:44Z step 0 done: gh logged in as leandergrech (repo, workflow scopes); git user.name "Leander Grech"; repo folder empty
- 2026-09-30T16:05:16Z step 1 done: skeleton committed, public repo created and pushed
- 2026-09-30T16:34:16Z step 2 done: gymtorax 1.0.0 + torax 1.0.3 + jax 0.11.2 (Python 3.12.3) in .venv-v10 reproduces paper: PI 3.7919 (paper 3.79), open-loop 3.4086 (paper 3.40). Current gymtorax 1.1.1/torax 1.4.3 in .venv differs (OL 3.26, paper PI gains fail at step 105). Benchmark pinned to 1.0.0.
