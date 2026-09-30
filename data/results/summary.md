| Policy | Group | Return (final policy) | Best during training | Sim. steps to beat PI | Sim. steps used | Wall time (min) | I_p end (MA) | q_min end | s with q_min<1 | max f_GW | Q end |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PI controller (paper gains) | classical | 3.79 (paper 3.79) |  |  |  |  | 15.0 | 0.41 | 101 | 1.19 | 14.6 |
| Open-loop reference | classical | 3.41 (paper 3.40) |  |  |  |  | 12.5 | 0.63 | 83 | 1.19 | 7.7 |
| Random (mean of 20) | classical | 3.23 ± 0.06 (paper -10.79) |  |  |  |  |  |  |  |  |  |
| Behaviour cloning on pi_det (seed 0) | offline | 3.79 | 3.79 |  | 0 online, 151 logged | 16.3 | 15.0 | 0.41 | 101 | 1.19 | 14.6 |
| MBPO (ensemble + SAC) [I_p floor 1 MA] (seed 0) | ablation | 3.15 | 3.95 | 1,364 | 2,119 | 55.8 | 6.9 | 1.28 | 0 | 1.05 | 1.6 |
| SAC (SB3) [I_p floor 1 MA] (seed 0) | ablation | 2.99 | 3.02 |  | 10,712 | 51.0 | 3.1 | 3.67 | 0 | 1.32 | 0.2 |
| TD3+BC on pi_det (seed 0) | offline | -998.05 | -998.05 |  | 0 online, 151 logged | 34.3 | 8.5 | 0.46 | 68 | 1.16 | 6.8 |
