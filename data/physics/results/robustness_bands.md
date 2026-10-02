# Robustness by threshold band

Mean return over completed episodes and share reaching H-mode, by the plasma's true L-H threshold relative to the Martin 2008 scaling.

| Policy | Episodes | threshold ≤ 1.06 (17 plasmas) | threshold 1.09–1.16 (7 plasmas) | threshold ≥ 1.18 (9 plasmas) | Beats PI on the same plasma | Ended on a limit |
|---|---|---|---|---|---|---|
| open-loop reference | 33 | 3.07, H-mode 100% | 2.99, H-mode 100% | 1.83, H-mode 11% | 16/33 | 0 |
| PI, re-tuned | 33 | 3.23, H-mode 100% | 1.68, H-mode 0% | 1.68, H-mode 0% | 0/33 | 0 |
| CEM schedule | 33 | 3.05, H-mode 88% | 1.64, H-mode 0% | 1.64, H-mode 0% | 15/33 | 0 |
| MBPO on PI | 165 | 3.40, H-mode 73% | 1.74, H-mode 0% | 1.74, H-mode 0% | 116/165 | 39 |
| PPO on PI, randomised training, 30,000 steps | 165 | 3.05, H-mode 85% | 1.75, H-mode 0% | 1.75, H-mode 0% | 137/165 | 0 |
| PPO on PI, 30,000 steps | 165 | 3.46, H-mode 98% | 1.98, H-mode 26% | 1.82, H-mode 0% | 158/165 | 2 |
| PPO on PI, randomised training, 120,000 steps | 165 | 2.71, H-mode 71% | 2.19, H-mode 20% | 1.99, H-mode 0% | 85/165 | 0 |
| PPO on PI, 120,000 steps | 165 | 3.74, H-mode 94% | 1.92, H-mode 29% | 1.84, H-mode 9% | 151/165 | 12 |
