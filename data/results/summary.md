| Policy | Group | Return (final policy) | Audited score | Best during training | Sim. steps to beat PI | Sim. steps used | Wall time (min) | I_p end (MA) | q_min end | s with q_min<1 | max f_GW | Q end |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PI controller (paper gains) | classical | 3.79 (paper 3.79) | 3.50 |  |  |  |  | 15.0 | 0.41 | 101 | 1.19 | 14.6 |
| Open-loop reference | classical | 3.41 (paper 3.40) | 3.41 |  |  |  |  | 12.5 | 0.63 | 83 | 1.19 | 7.7 |
| Random (mean of 20) | classical | 3.23 ± 0.06 (paper -10.79) |  |  |  |  |  |  |  |  |  |  |
| Behaviour cloning on pi_det (seed 0) | offline | 3.79 | 3.50 | 3.79 |  | 0 online, 151 logged | 16.3 | 15.0 | 0.41 | 101 | 1.19 | 14.6 |
| Behaviour cloning on pi_noisy_0.1 (seed 0) | offline | 3.85 | 3.52 | 3.85 |  | 0 online, 3,020 logged | 11.8 | 15.0 | 0.41 | 101 | 1.19 | 15.1 |
| Behaviour cloning on pi_noisy_0.3 (seed 0) | offline | 3.99 | 3.56 | 3.99 |  | 0 online, 3,020 logged | 17.8 | 15.0 | 0.43 | 98 | 1.19 | 16.1 |
| MBPO (ensemble + SAC) [I_p floor 1 MA] (seed 0) | ablation | 3.15 | 3.13 | 3.95 | 1,364 | 2,119 | 55.8 | 6.9 | 1.28 | 0 | 1.05 | 1.6 |
| MBPO (ensemble + SAC) [obs=full] (seed 0) | ablation | 3.12 | 2.01 | 3.12 |  | 735 | 55.8 | 14.2 | 1.22 | 0 | 1.20 | 2.6 |
| MBPO (ensemble + SAC) [obs=full] (seed 1) | ablation | 5.63 | 3.69 | 21.29 | 906 | 2,177 | 29.0 | 15.0 | 0.58 | 79 | 1.18 | 36.6 |
| MBPO (ensemble + SAC) [obs=scalars] (seed 0) | ablation | -999.32 |  | 3.04 |  | 1,524 | 52.9 | 3.0 | 2.97 | 0 | 1.27 | 0.0 |
| MBPO (ensemble + SAC) [obs=scalars] (seed 1) | ablation | 2.97 | 2.01 | 3.00 |  | 2,239 | 13.3 | 3.0 | 3.51 | 0 | 1.27 | 0.2 |
| MBPO (ensemble + SAC) [reward=patched] (seed 0) | ablation | -997.92 |  | 3.23 |  | 3,658 | 21.3 | 3.0 | 1.28 | 0 | 1.13 | 0.9 |
| MBPO (ensemble + SAC) [reward=patched] (seed 1) | ablation | 2.98 | 2.98 | 5.05 | 3,020 | 3,775 | 21.7 | 3.3 | 2.08 | 0 | 1.26 | 0.2 |
| MBPO (ensemble + SAC) [reward=patched] (seed 2) | ablation | 3.16 | 3.12 | 3.16 |  | 3,753 | 21.8 | 9.1 | 0.80 | 67 | 1.13 | 3.1 |
| MBPO (ensemble + SAC) [reward=benchmark] (seed 0) | ablation | 2.24 | 2.01 | 8.85 | 594 | 1,500 | 53.2 | 3.0 | 2.56 | 0 | 1.23 | 4.2 |
| MBPO (ensemble + SAC) [reward=benchmark] (seed 1) | ablation | 3.06 | 2.05 | 3.07 |  | 2,265 | 14.0 | 3.6 | 2.77 | 0 | 1.26 | 0.3 |
| MBPO (ensemble + SAC) [reward=benchmark] (seed 2) | ablation | 2.27 | 2.01 | 2.76 |  | 2,235 | 13.7 | 4.4 | 2.71 | 0 | 1.27 | 9.0 |
| MBPO (ensemble + SAC) [reward=qmin_safe] (seed 0) | ablation | 3.00 | 2.72 | 3.00 |  | 1,451 | 53.0 | 3.0 | 2.47 | 0 | 1.22 | 0.2 |
| MBPO (ensemble + SAC) (seed 0) | online | 2.98 | 2.96 | 2.98 |  | 1,783 | 62.7 | 3.0 | 2.26 | 0 | 1.19 | 0.2 |
| MBPO (ensemble + SAC) (seed 1) | online | 18.42 | 1.89 | 18.42 | 1,510 | 1,510 | 53.7 | 3.0 | 0.67 | 99 | 1.80 | 123.2 |
| MBPO (ensemble + SAC) (seed 2) | online | 2.08 | 2.05 | 2.97 |  | 1,480 | 53.3 | 3.3 | 2.76 | 0 | 1.27 | 0.2 |
| MBPO (ensemble + SAC) (seed 3) | online | 3.01 | 2.64 | 6.02 | 2,416 | 3,775 | 22.2 | 3.5 | 2.63 | 0 | 1.14 | 0.3 |
| MBPO (ensemble + SAC) (seed 4) | online | 10.82 | 2.01 | 10.82 | 1,789 | 3,752 | 22.0 | 6.3 | 1.29 | 0 | 1.11 | 109.8 |
| MBPO (ensemble + SAC) (seed 5) | online | 3.45 | 2.07 | 3.45 |  | 3,727 | 21.3 | 9.2 | 0.90 | 49 | 1.17 | 6.0 |
| MOPO on pi_det (seed 0) | offline | 3.94 | 2.29 | 3.94 |  | 0 online, 151 logged | 32.4 | 15.0 | 0.69 | 59 | 1.04 | 15.9 |
| MOPO on pi_noisy_0.1 (seed 0) | offline | 2.88 | 2.01 | 2.88 |  | 0 online, 3,020 logged | 24.1 | 3.6 | 2.49 | 0 | 0.88 | 1.2 |
| MOPO on pi_noisy_0.3 (seed 0) | offline | 2.01 | 2.01 | 2.01 |  | 0 online, 3,020 logged | 21.5 | 13.0 | 2.68 | 0 | 0.89 | 1.8 |
| PPO (SB3) (seed 0) | online | 2.99 | 2.01 | 2.99 |  | 14,128 | 47.2 | 4.3 | 3.58 | 0 | 1.21 | 0.5 |
| SAC (SB3) [I_p floor 1 MA] (seed 0) | ablation | 2.99 | 2.58 | 3.02 |  | 10,712 | 51.0 | 3.1 | 3.67 | 0 | 1.32 | 0.2 |
| SAC (SB3) (seed 0) | online | 2.92 | 2.01 | 3.20 |  | 11,192 | 47.2 | 3.3 | 2.46 | 0 | 1.28 | 1.5 |
| TD3+BC on pi_det (seed 0) | offline | -998.05 |  | -998.05 |  | 0 online, 151 logged | 34.3 | 8.5 | 0.46 | 68 | 1.16 | 6.8 |
| TD3+BC on pi_noisy_0.1 (seed 0) | offline | 3.79 | 3.54 | 3.79 |  | 0 online, 3,020 logged | 25.0 | 14.5 | 0.43 | 99 | 1.20 | 13.8 |
| TD3+BC on pi_noisy_0.3 (seed 0) | offline | 4.01 | 3.56 | 4.01 |  | 0 online, 3,020 logged | 18.8 | 14.8 | 0.43 | 96 | 1.20 | 16.9 |
| CEM open-loop schedule search, objective: benchmark | reference | 4.08 | 3.57 |  |  | 14,496 | 45.8 | 14.6 | 0.48 | 94 | 1.20 | 18.5 |
| CEM open-loop schedule search, objective: audited score | reference | 3.87 | 3.63 |  |  | 24,160 | 41.4 | 13.2 | 0.52 | 93 | 1.19 | 14.2 |
