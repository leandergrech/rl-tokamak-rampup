# Uncapped fusion-gain term in `IterHybrid-v0` reward can be increased by switching the heating off

<!-- Draft for https://github.com/antoine-mouchamps/gymtorax/issues. Not opened. -->

## Summary

In `IterHybridEnv._compute_reward` the H98, q_min and q95 terms are capped at 1, but the fusion-gain term `Q / 10 / 50` is not. H-mode is detected from core temperature only (`T_e[0] > 10` and `T_i[0] > 10` keV), and the pedestal is prescribed in time (`T_i_ped`, `T_e_ped` = 0.5 keV until t = 100 s, 3.0 keV from t = 105 s), so the H-mode condition stays true when the auxiliary heating is removed. Setting NBI and ECRH power to zero from t = 105 s in the open-loop reference policy raises its return from 3.41 to 22.74 (gymtorax 1.0.0, TORAX 1.0.3) and from 3.26 to 20.96 (gymtorax 1.1.1, TORAX 1.4.2), with Q = P_fus / P_aux reaching 270 and 244. In those episodes P_SOL_total < P_LH on 92 % and 100 % of the steps the reward counts as H-mode. RL agents find this without being pointed at it: in [rl-tokamak-rampup](https://github.com/leandergrech/rl-tokamak-rampup) (gymtorax 1.0.0, CPU-sized runs) MBPO, SAC and PPO reached returns of 18.42, 27.08 and 48.98 with auxiliary power near zero after the pedestal (commands and logs under [Learned agents](#learned-agents)).

## Reproduction

Branch [`fix/audited-iter-hybrid-reward`](https://github.com/leandergrech/gymtorax/tree/fix/audited-iter-hybrid-reward) of a fork (the same script is on [`fix/audited-iter-hybrid-reward-v1.0`](https://github.com/leandergrech/gymtorax/tree/fix/audited-iter-hybrid-reward-v1.0), which is `v1.0.0` plus the same commits):

```bash
python examples/reward_exploit.py
```

No learned policy is involved: it runs `IterHybridAgent` unchanged and with `action["NBI"][0] = action["ECRH"][0] = 0.0` from step 105. Output on gymtorax 1.0.0 / TORAX 1.0.3 (JAX 0.7.1, from the `v1.0.0` lock file):

```
gymtorax 1.0.0, torax 1.0.3
environment                     policy                      score   max Q  H-mode steps  with P_SOL < P_LH
gymtorax/IterHybrid-v0          open-loop reference          3.41     7.7            50                0%
gymtorax/IterHybrid-v0          heating off from 105 s      22.74   270.3            50               92%
gymtorax/IterHybridAudited-v0   open-loop reference          3.41     7.7            50                0%
gymtorax/IterHybridAudited-v0   heating off from 105 s       1.91   270.3             4                0%
```

Output on gymtorax 1.1.1 / TORAX 1.4.2 (from the `main` lock file):

```
gymtorax 1.1.1, torax 1.4.2
environment                     policy                      score   max Q  H-mode steps  with P_SOL < P_LH
gymtorax/IterHybrid-v0          open-loop reference          3.26     6.9            48                8%
gymtorax/IterHybrid-v0          heating off from 105 s      20.96   244.4            48              100%
gymtorax/IterHybridAudited-v0   open-loop reference          3.18     6.9            44                0%
gymtorax/IterHybridAudited-v0   heating off from 105 s       1.83   244.4             0                0%
```

"H-mode steps" counts the steps on which the environment's reward treats the plasma as H-mode; the last column is the fraction of those with `P_SOL_total < P_LH`, both read from the TORAX outputs in the observation.

## Mechanism

1. `_r_fusion_gain` returns `Q / 10` without a ceiling, so a single term can exceed the sum of the other three.
2. Q = P_fusion / P_aux, so it grows without bound as P_NBI + P_ECRH go to zero while alpha heating keeps the core hot.
3. `_is_H_mode` checks core temperatures only, and the pedestal comes from the `pedestal` schedule of the config, not from the heating power. After the heating is removed the core stays above 10 keV and the gated terms keep being paid, although P_SOL_total falls well below P_LH (a real plasma would return to L-mode).

## Learned agents

Trained with the [rl-tokamak-rampup](https://github.com/leandergrech/rl-tokamak-rampup) wrapper on gymtorax 1.0.0 / TORAX 1.0.3, reward = 100 × the `IterHybrid-v0` reward (failure -100), one deterministic evaluation episode of the final policy; run directories with config, learning curve and checkpoint are in `data/runs/`. MBPO ran on a laptop CPU; SAC and PPO on a 48-core cloud CPU, which is why they saw more simulator steps within the same 45-minute budget:

| Agent | Command (in rl-tokamak-rampup) | Simulator steps | Return | Q at end |
|---|---|---|---|---|
| MBPO, seed 1 | `python scripts/train.py --algo mbpo --out data/runs/mbpo_s1 --real-episodes 20 --minutes 50 --seed 1` | 1,510 | 18.42 | 123 |
| SAC, seed 1 | `python scripts/train.py --algo sac --out data/runs/sac_s1 --minutes 45 --n-envs 8 --seed 1` | 74,872 | 27.08 | 284 |
| PPO, seed 1 | `python scripts/train.py --algo ppo --out data/runs/ppo_s1 --minutes 45 --n-envs 8 --seed 1` | 112,136 | 48.98 | 755 |

## Two reproducibility observations (separate from the reward)

- **Random policy.** The paper reports an expected return of -10.79 for the random policy. With gymtorax 1.0.0 / TORAX 1.0.3 I get 3.23 ± 0.06 over 20 seeds (`env.action_space.seed(s)`, `env.reset(seed=s)`, s = 0-19) with no episode ending in the -1000 failure reward; with gymtorax 1.1.1 / TORAX 1.4.2, 3.15 ± 0.06, also without failures. A mean of -10.79 requires failures in roughly 1.4 % of episodes if the others score near 3.2; the number of episodes behind the published value is not stated.
- **PI controller on v1.1.** With gymtorax 1.1.1 / TORAX 1.4.2 the PI controller with the published gains (k_p = 0.700, k_i = 34.257) ends at step 105 with the failure reward (return -998.67); PI 3.79 and open-loop 3.40 reproduce only with gymtorax 1.0.0 / TORAX 1.0.3 (3.79 and 3.41 here). The results page already says the v1.0 numbers and gains are out of date for v1.1; this gives the concrete values.

Commands for both: `python examples/baselines_audited.py --seeds 20 --workers 8` on each branch; full table in [`examples/baselines_audited.md`](https://github.com/leandergrech/gymtorax/blob/fix/audited-iter-hybrid-reward/examples/baselines_audited.md).

## Proposed fix (additive)

A new environment `gymtorax/IterHybridAudited-v0` (`IterHybridAuditedEnv(IterHybridEnv)`) with the same configuration, actions and observations and two reward changes:

1. cap the fusion-gain term at `min(Q / 10, 1)`, as the other three terms are capped;
2. count a step as H-mode only if the temperature condition holds and `P_SOL_total >= P_LH` (both computed by TORAX).

`IterHybrid-v0` stays unchanged, so the published baselines remain valid. On gymtorax 1.0.0 / TORAX 1.0.3 the audited environment gives PI 3.50, open-loop 3.41 and the heating-cut sequence 1.91. A branch with the change, tests and docs is at [`fix/audited-iter-hybrid-reward`](https://github.com/leandergrech/gymtorax/tree/fix/audited-iter-hybrid-reward); I can open a PR if this direction is acceptable.
