| Policy | Group | Return (final policy) | Best during training | Sim. steps to beat PI | Sim. steps used | Wall time (min) | I_p end (MA) | q_min end | s with q_min<1 | max f_GW | Q end |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PI controller (paper gains) | classical | 3.79 (paper 3.79) |  |  |  |  | 15.0 | 0.41 | 101 | 1.19 | 14.6 |
| Open-loop reference | classical | 3.41 (paper 3.40) |  |  |  |  | 12.5 | 0.63 | 83 | 1.19 | 7.7 |
| Random (mean of 20) | classical | 3.23 ± 0.06 (paper -10.79) |  |  |  |  |  |  |  |  |  |
| Behaviour cloning on pi_det (seed 0) | offline | 3.79 | 3.79 |  | 0 online, 151 logged | 16.3 | 15.0 | 0.41 | 101 | 1.19 | 14.6 |
| Behaviour cloning on pi_noisy_0.1 (seed 0) | offline | 3.85 | 3.85 |  | 0 online, 3,020 logged | 11.8 | 15.0 | 0.41 | 101 | 1.19 | 15.1 |
| MBPO (ensemble + SAC) [I_p floor 1 MA] (seed 0) | ablation | 3.15 | 3.95 | 1,364 | 2,119 | 55.8 | 6.9 | 1.28 | 0 | 1.05 | 1.6 |
| MBPO (ensemble + SAC) (seed 0) | online | 2.98 | 2.98 |  | 1,783 | 62.7 | 3.0 | 2.26 | 0 | 1.19 | 0.2 |
| MOPO on pi_det (seed 0) | offline | 3.94 | 3.94 |  | 0 online, 151 logged | 32.4 | 15.0 | 0.69 | 59 | 1.04 | 15.9 |
| MOPO on pi_noisy_0.1 (seed 0) | offline | 2.88 | 2.88 |  | 0 online, 3,020 logged | 24.1 | 3.6 | 2.49 | 0 | 0.88 | 1.2 |
| PPO (SB3) (seed 0) | online | 2.99 | 2.99 |  | 14,128 | 47.2 | 4.3 | 3.58 | 0 | 1.21 | 0.5 |
| SAC (SB3) [I_p floor 1 MA] (seed 0) | ablation | 2.99 | 3.02 |  | 10,712 | 51.0 | 3.1 | 3.67 | 0 | 1.32 | 0.2 |
| SAC (SB3) (seed 0) | online | 2.92 | 3.20 |  | 11,192 | 47.2 | 3.3 | 2.46 | 0 | 1.28 | 1.5 |
| TD3+BC on pi_det (seed 0) | offline | -998.05 | -998.05 |  | 0 online, 151 logged | 34.3 | 8.5 | 0.46 | 68 | 1.16 | 6.8 |
| TD3+BC on pi_noisy_0.1 (seed 0) | offline | 3.79 | 3.79 |  | 0 online, 3,020 logged | 25.0 | 14.5 | 0.43 | 99 | 1.20 | 13.8 |
