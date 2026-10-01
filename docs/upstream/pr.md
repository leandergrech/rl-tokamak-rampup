# Add IterHybridAudited-v0: capped fusion gain and L-H power check in the ITER hybrid reward

<!-- Draft PR description for https://github.com/antoine-mouchamps/gymtorax, from leandergrech:fix/audited-iter-hybrid-reward into main. Not opened. Refers to issue: ISSUE_LINK -->

## What changed

- `gymtorax/envs/iter_hybrid_audited_env.py`: new `IterHybridAuditedEnv(IterHybridEnv)`, registered as `gymtorax/IterHybridAudited-v0`. It reuses the `IterHybridEnv` configuration, actions, observations and time discretization and overrides only `_compute_reward` (plus an `_is_H_mode` helper it calls). Two differences from `IterHybrid-v0`:
  1. the fusion-gain term is `min(Q / 10, 1)`, capped like the H98, q_min and q95 terms (Q = P_fusion / P_aux diverges as the auxiliary power goes to zero);
  2. a step counts as H-mode only if `T_e[0] > 10` and `T_i[0] > 10` keV **and** `P_SOL_total >= P_LH`, both taken from the TORAX outputs (H-mode is only sustained while the power crossing the separatrix exceeds the L-H threshold).
  No penalties are added and no weights change; trajectories with Q <= 10 and P_SOL >= P_LH in H-mode get exactly the `IterHybrid-v0` reward. The cap is a class attribute (`fusion_gain_cap = 1.0`) so the two changes can be tested separately.
- `gymtorax/rewards.py`: `get_P_SOL` and `get_P_LH` getters, in the style of the existing ones.
- `examples/reward_exploit.py`: deterministic reproduction (open-loop reference with NBI and ECRH off from t = 105 s) on both environments.
- `examples/baselines_audited.py` and `examples/baselines_audited.md`: baseline returns on both environments, with the commands to regenerate them.
- `docs/example/iter_env_audited.rst` (in the example toctree) and a `CHANGELOG.md` entry under `[Unreleased]`.
- Tests: `tests/test_audited_env.py`; the new ID added to `ALL_ENV_IDS` (so the registration and environment-checker tests cover it) and to `ENV_CLASSES`.

## Why

In `IterHybrid-v0` the uncapped fusion-gain term, the temperature-only H-mode check and the time-prescribed pedestal together reward switching the heating off after the pedestal: Q rises to 244–270 and the open-loop reference's return goes from 3.41 to 22.74. Details and the reinforcement-learning runs that found this are in ISSUE_LINK.

## `IterHybrid-v0` is unchanged

`gymtorax/envs/iter_hybrid_env.py` and `iter_hybrid.json` are not touched (`git diff main -- gymtorax/envs/iter_hybrid_env.py` is empty), so the results published with `IterHybrid-v0` stand. With gymtorax 1.0.0 / TORAX 1.0.3 the PI controller still returns 3.79 on `IterHybrid-v0` (checked by `test_v0_pi_return_matches_paper`).

## Baselines

Undiscounted returns; random policy = mean ± std over seeds 0–19. Produced with `python examples/baselines_audited.py --seeds 20 --workers 8` (and `python examples/reward_exploit.py`).

gymtorax 1.0.0 / TORAX 1.0.3 (branch `fix/audited-iter-hybrid-reward-v1.0` = `v1.0.0` + these commits, `poetry.lock`: JAX 0.7.1):

| Policy | IterHybrid-v0 | IterHybridAudited-v0 |
|---|---|---|
| PI controller (k_p = 0.700, k_i = 34.257) | 3.79 | 3.50 |
| Open-loop reference | 3.41 | 3.41 |
| Random (20 seeds) | 3.23 ± 0.06 (0/20 failed) | 2.16 ± 0.06 (0/20 failed) |
| Open-loop, NBI and ECRH off from t = 105 s | 22.74 | 1.91 |
| TD3+BC trained offline on noisy PI logs ¹ | 4.01 | 3.56 |
| MBPO, full observation, seed 1 ¹ | 5.63 | 3.69 |

gymtorax 1.1.1 / TORAX 1.4.2 (this branch, `poetry.lock`):

| Policy | IterHybrid-v0 | IterHybridAudited-v0 |
|---|---|---|
| PI controller (k_p = 0.700, k_i = 34.257) | -998.67 (failed) | -998.67 (failed) |
| Open-loop reference | 3.26 | 3.18 |
| Random (20 seeds) | 3.15 ± 0.06 (0/20 failed) | 2.09 ± 0.05 (0/20 failed) |
| Open-loop, NBI and ECRH off from t = 105 s | 20.96 | 1.83 |

¹ Policies from [rl-tokamak-rampup](https://github.com/leandergrech/rl-tokamak-rampup), trained on gymtorax 1.0.0 (the MBPO one on the `IterHybrid-v0` reward), scored with `scripts/score_upstream_envs.py` there; only scored at the 1.0.0 pin.

## Tests

`tests/test_audited_env.py`:

- reward on synthetic states: identical to `IterHybrid-v0` below the cap and above the threshold, and in L-mode; fusion gain capped at Q = 10; gated terms zero when `P_SOL_total < P_LH`;
- full episodes: the heating-cut sequence more than doubles the `IterHybrid-v0` return relative to the open-loop reference; the audited environment scores it below the open-loop reference; the Q cap alone and the P_SOL gate alone each lower the exploit's score by more than 1;
- TORAX 1.0 only (skipped otherwise): `IterHybrid-v0` PI return = 3.79 ± 0.01, `IterHybridAudited-v0` PI return = 3.50 ± 0.1 and above the exploit's.

Results:

- this branch (TORAX 1.4.2), the CI commands: `ruff check .` and `ruff format --check .` pass; `pytest tests/ --ignore=tests/test_docs.py`: 100 passed, 13 skipped (main before the change: 87 passed, 11 skipped); `pytest tests/test_docs.py --docs`: 3 passed; `pytest tests/test_scenarios.py --test-scenarios`: 4 passed.
- `v1.0.0` + these commits (TORAX 1.0.3), `pytest tests/ --ignore=tests/test_docs.py`: 78 passed, 1 failed. The failure is `test_environment_creation_with_kwargs`, which creates a `render_mode="human"` environment when `CI` is unset and fails because the `v1.0.0` lock file has no Qt binding; with `CI=1` (as in the workflow) `tests/test_environment_registration.py` passes, 7/7. All new tests pass on this branch, including the two TORAX 1.0 ones.

## Notes for review

- `P_SOL_total` is defined differently in the two TORAX versions: 1.0.3 does not subtract dW/dt, 1.4.x subtracts the smoothed dW/dt; `P_LH` is the Martin 2008 scaling with a low-density branch in both, implemented as a maximum in 1.0.3 and as a density-dependent switch in 1.4.x. The gate therefore uses whatever TORAX reports; it does not recompute either quantity.
- The audited environment still counts L-mode steps with a hot core and `P_SOL >= P_LH` as H-mode, because the pedestal remains prescribed in time. Removing that would need a pedestal model driven by power, which is outside the scope of a reward change.
- Happy to rename the environment, target `dev` instead of `main`, or move the docs page if you prefer another place.
