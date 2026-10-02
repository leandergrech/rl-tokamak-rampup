# Physics environment: robustness to the measured uncertainty

33 test plasmas (seed 20261002), one deterministic episode per policy and plasma. Scale s shrinks the uncertainty box towards the nominal plasma (s = 1: threshold factor 0.54-1.85, hysteresis 0.35-0.8, pedestal 2.4-3.6 keV). Mean and minimum over completed episodes; failures end on a limit.

| Policy group | s | Episodes | Failures | Mean return | Min return | Beats PI on the same plasma | H-mode paid [s] |
|---|---|---|---|---|---|---|---|
| PI, re-tuned | 0 | 1 | 0 | 3.242 | 3.242 | 0/1 | 49.0 |
| PI, re-tuned | 0.25 | 8 | 0 | 2.461 | 1.676 | 0/8 | 24.5 |
| PI, re-tuned | 0.5 | 8 | 0 | 2.071 | 1.676 | 0/8 | 12.2 |
| PI, re-tuned | 0.75 | 8 | 0 | 2.638 | 1.676 | 0/8 | 30.6 |
| PI, re-tuned | 1 | 8 | 0 | 2.635 | 1.676 | 0/8 | 30.6 |
| PPO on PI, randomised training | 0 | 5 | 0 | 2.569 | 2.000 | 0/5 | 25.8 |
| PPO on PI, randomised training | 0.25 | 40 | 0 | 2.351 | 2.000 | 20/40 | 15.2 |
| PPO on PI, randomised training | 0.5 | 40 | 0 | 2.188 | 1.966 | 31/40 | 8.5 |
| PPO on PI, randomised training | 0.75 | 40 | 0 | 2.580 | 1.966 | 17/40 | 27.0 |
| PPO on PI, randomised training | 1 | 40 | 0 | 2.476 | 1.966 | 17/40 | 22.2 |
| PPO on PI | 0 | 5 | 0 | 3.788 | 3.597 | 5/5 | 52.2 |
| PPO on PI | 0.25 | 40 | 4 | 2.912 | 1.801 | 35/40 | 29.1 |
| PPO on PI | 0.5 | 40 | 1 | 2.375 | 1.801 | 39/40 | 15.9 |
| PPO on PI | 0.75 | 40 | 5 | 2.964 | 1.801 | 34/40 | 27.9 |
| PPO on PI | 1 | 40 | 2 | 3.003 | 1.801 | 38/40 | 31.4 |
