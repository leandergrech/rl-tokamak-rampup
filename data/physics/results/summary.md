# Physics environment: results

Return = the physics environment's own score (one deterministic episode). PI (re-tuned) = 3.2418.

| Policy | Return | Best during training | Steps to beat PI | Steps used | H-mode paid [s] | Q final | q_min lowest | f_GW max |
|---|---|---|---|---|---|---|---|---|
| PI controller, re-tuned | 3.2418 |  |  |  | 49 | 7.42 | 0.40 | 0.91 |
| Open-loop reference | 3.0889 |  |  |  | 49 | 4.69 | 0.48 | 0.91 |
| PI controller, paper's gains | -999.8933 (l_i(3) 0.647 outside [0.65, 1.2] at t = 9 s) |  |  |  | 0 | 0.00 | 2.44 | 0.65 |
| Open loop, heating off from 105 s | 1.8103 |  |  |  | 4 | 0.13 | 0.36 | 0.91 |
| Open loop, no heating | 1.6953 |  |  |  | 0 | 0.12 | 0.34 | 0.65 |
| Random policy, 20 seeds | -999.9047 ± 0.06 (20/20 terminated: {'l_i(3)': 20}) |  |  |  |  |  |  |  |
| Best open-loop schedule (CEM) | 3.2601 |  |  | 24000 |  | 7.31 | 0.39 | 0.90 |
| mbpo_res_s0 | 3.2397 | 3.289 | 180 | 2551 | 48 | 7.17 | 0.42 | 0.91 |
| mbpo_res_s1 | 3.3068 | 3.364 | 1180 | 2080 | 49 | 7.56 | 0.47 | 0.90 |
| mbpo_res_s2 | 3.4701 | 3.470 | 2205 | 2205 | 49 | 6.75 | 0.65 | 0.89 |
| mbpo_res_s3 | -999.5867 | 2.499 |  | 1474 | 0 | 0.02 | 2.64 | 0.65 |
| mbpo_res_s4 | 3.4555 | 3.456 | 1999 | 2599 | 48 | 9.43 | 0.47 | 0.91 |
| ppo_res_s0 | 3.5416 | 3.542 | 11230 | 30080 | 49 | 7.27 | 0.63 | 0.90 |
| ppo_res_s1 | 3.5251 | 3.525 | 10880 | 30080 | 49 | 9.33 | 0.51 | 0.90 |
| ppo_res_s2 | 3.2491 | 3.263 | 11125 | 30080 | 49 | 6.37 | 0.66 | 0.90 |
| ppo_res_s3 | 3.6294 | 3.651 | 11155 | 30080 | 49 | 9.03 | 0.59 | 0.90 |
| ppo_res_s4 | 3.4850 | 3.485 | 11090 | 30080 | 49 | 7.10 | 0.64 | 0.90 |

| Group | n | Mean ± std | Range | Above PI |
|---|---|---|---|---|
| mbpo on PI | 5 | -197.223 ± 448.535 | -999.587–3.470 | 3/5 |
| ppo on PI | 5 | 3.486 ± 0.143 | 3.249–3.629 | 5/5 |
