# Physics environment: robustness to the measured uncertainty

33 test plasmas (seed 20261002), one deterministic episode per policy and plasma. Scale s shrinks the uncertainty box towards the nominal plasma (s = 1: threshold factor 0.54-1.85, hysteresis 0.35-0.8, pedestal 2.4-3.6 keV). Mean and minimum over completed episodes; failures end on a limit.

| Policy group | s | Episodes | Failures | Mean return | Min return | Beats PI on the same plasma | H-mode paid [s] |
|---|---|---|---|---|---|---|---|
| open-loop reference | 0 | 1 | 0 | 3.089 | 3.089 | 0/1 | 49.0 |
| open-loop reference | 0.25 | 8 | 0 | 3.052 | 2.966 | 4/8 | 47.8 |
| open-loop reference | 0.5 | 8 | 0 | 2.363 | 1.722 | 6/8 | 23.5 |
| open-loop reference | 0.75 | 8 | 0 | 2.847 | 1.722 | 3/8 | 41.0 |
| open-loop reference | 1 | 8 | 0 | 2.560 | 1.722 | 3/8 | 30.6 |
| PI, re-tuned | 0 | 1 | 0 | 3.242 | 3.242 | 0/1 | 49.0 |
| PI, re-tuned | 0.25 | 8 | 0 | 2.461 | 1.676 | 0/8 | 24.5 |
| PI, re-tuned | 0.5 | 8 | 0 | 2.071 | 1.676 | 0/8 | 12.2 |
| PI, re-tuned | 0.75 | 8 | 0 | 2.638 | 1.676 | 0/8 | 30.6 |
| PI, re-tuned | 1 | 8 | 0 | 2.635 | 1.676 | 0/8 | 30.6 |
| CEM schedule | 0 | 1 | 0 | 3.260 | 3.260 | 1/1 | 49.0 |
| CEM schedule | 0.25 | 8 | 0 | 2.045 | 1.643 | 2/8 | 12.2 |
| CEM schedule | 0.5 | 8 | 0 | 2.051 | 1.643 | 2/8 | 12.2 |
| CEM schedule | 0.75 | 8 | 0 | 2.635 | 1.643 | 5/8 | 30.6 |
| CEM schedule | 1 | 8 | 0 | 2.633 | 1.643 | 5/8 | 30.6 |
| MBPO on PI | 0 | 5 | 1 | 3.368 | 3.240 | 3/5 | 38.8 |
| MBPO on PI | 0.25 | 40 | 8 | 2.560 | 1.699 | 27/40 | 19.4 |
| MBPO on PI | 0.5 | 40 | 8 | 2.159 | 1.699 | 31/40 | 10.1 |
| MBPO on PI | 0.75 | 40 | 11 | 2.730 | 1.699 | 28/40 | 22.3 |
| MBPO on PI | 1 | 40 | 11 | 2.709 | 1.699 | 27/40 | 21.7 |
| PPO on PI, randomised training | 0 | 5 | 0 | 2.704 | 1.686 | 3/5 | 29.2 |
| PPO on PI, randomised training | 0.25 | 40 | 0 | 2.263 | 1.686 | 30/40 | 15.7 |
| PPO on PI, randomised training | 0.5 | 40 | 0 | 2.068 | 1.686 | 36/40 | 9.6 |
| PPO on PI, randomised training | 0.75 | 40 | 0 | 2.694 | 1.686 | 35/40 | 29.3 |
| PPO on PI, randomised training | 1 | 40 | 0 | 2.617 | 1.686 | 33/40 | 27.1 |
| PPO on PI | 0 | 5 | 0 | 3.486 | 3.249 | 5/5 | 49.0 |
| PPO on PI | 0.25 | 40 | 0 | 2.739 | 1.810 | 38/40 | 26.9 |
| PPO on PI | 0.5 | 40 | 0 | 2.276 | 1.763 | 39/40 | 13.6 |
| PPO on PI | 0.75 | 40 | 2 | 2.811 | 1.763 | 38/40 | 28.4 |
| PPO on PI | 1 | 40 | 0 | 2.831 | 1.763 | 38/40 | 30.6 |
