# RL for tokamak current ramp-up

A literature review and a runnable CPU codebase for reinforcement learning on the **Gym-TORAX ITER hybrid ramp-up** benchmark (Mouchamps, Malherbe, Bolland, Ernst, University of Liège; [arXiv 2510.11283](https://arxiv.org/abs/2510.11283)), which wraps Google DeepMind's TORAX transport simulator. The agent sets the plasma current and the NBI and ECRH heating power once per second for 150 s; the published baselines are a PI controller (3.79), the open-loop reference (3.40) and a random policy (−10.79), and no RL result had been published on it.

Code: <https://github.com/leandergrech/rl-tokamak-rampup>. Written for Leander Grech (RL for physical control; new to fusion); everything is checkable against the linked sources and the files in `data/`.

## Headline results

INDEX_RESULTS_PLACEHOLDER

## How to read this site

| If you want to… | Read |
|---|---|
| get oriented from an RL background, with a two-week plan | [For Leander](for-leander.md) |
| see the task as an MDP, and what "solved" should mean | [1. The control problem](01-problem.md) |
| learn the physics you need (q, β_N, Greenwald limit, H-mode, current diffusion) | [2. Domain primer](02-primer.md) |
| see who did what, 2019–2026 | [3. Timeline](03-timeline.md) |
| compare published designs, and see this repo's baseline numbers | [4. Designs and results](04-designs.md) |
| know what fails and by how much | [5. Limitations](05-limitations.md) |
| pick a research direction | [6. Open questions](06-open-questions.md) |
| check a source | [7. References](07-references.md) |

## Reproduce

```bash
git clone https://github.com/leandergrech/rl-tokamak-rampup && cd rl-tokamak-rampup
python3.12 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest
bash scripts/reproduce.sh
```

`reproduce.sh` checks the PI and open-loop numbers against the paper, re-evaluates every stored checkpoint (the environment is deterministic, so each must match its stored return exactly) and rebuilds `data/results/summary.md`. `bash scripts/reproduce.sh --full` retrains everything.
