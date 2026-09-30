# rl-tokamak-rampup

Reinforcement learning for the ITER hybrid-scenario current ramp-up in [Gym-TORAX](https://github.com/antoine-mouchamps/gymtorax) (Mouchamps, Malherbe, Bolland, Ernst; [arXiv 2510.11283](https://arxiv.org/abs/2510.11283)), built on Google DeepMind's [TORAX](https://github.com/google-deepmind/torax) transport simulator. The benchmark asks an agent to set the plasma current and the NBI and ECRH heating once per second for 150 s; its paper reports a PI controller (3.79), the open-loop reference (3.40) and a random policy (−10.79), and no RL result. This repo reproduces those baselines on the paper's exact software stack, adds CPU-sized PPO, SAC, MBPO, behaviour cloning, TD3+BC and MOPO baselines with every checkpoint and trajectory committed, and wraps it in a literature review written for an RL researcher new to fusion.

**Literature review and results: <https://leandergrech.github.io/rl-tokamak-rampup/>**

README_RESULTS_PLACEHOLDER

## Quick start

Python 3.11–3.13 (tested on 3.12.3), CPU only.

```bash
git clone https://github.com/leandergrech/rl-tokamak-rampup && cd rl-tokamak-rampup
python3.12 -m venv .venv && . .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu   # optional: avoids the CUDA wheels
pip install -e ".[dev]"
pytest                          # env sanity + a few-step smoke test of every baseline (~5 min)
bash scripts/reproduce.sh       # PI/open-loop vs the paper, re-evaluate all checkpoints, rebuild the table (~15 min)
bash scripts/reproduce.sh --full  # retrain everything (each run < 1 h on a laptop CPU)
```

Train one baseline:

```bash
python scripts/train.py --algo mbpo --out data/runs/my_mbpo --real-episodes 20 --minutes 50
python scripts/train.py --algo ppo  --out data/runs/my_ppo  --n-envs 8 --minutes 45
python scripts/train.py --algo td3bc --dataset data/offline/pi_noisy_0.3.npz --out data/runs/my_td3bc
python scripts/evaluate.py --summary
```

The environment wrapper is `rl_tokamak.env.RampupEnv` (flat 60-d observation, 3-d action [I_p ramp rate, P_NBI, P_ECRH], benchmark reward passed through in `info["benchmark_reward"]`). It changes only the interface; Gym-TORAX and TORAX are used unmodified.

## Pinned versions

`gymtorax==1.0.0`, `torax==1.0.3`, `jax==0.11.2`: the stack that reproduces the paper's numbers. The current gymtorax 1.1.1 (TORAX 1.4) changes the physics and the action semantics, and the paper's PI gains fail on it; see [the problem page](https://leandergrech.github.io/rl-tokamak-rampup/01-problem/#which-version-is-the-benchmark).

## Layout

```
docs/          the review (MkDocs Material), published to GitHub Pages
src/rl_tokamak env wrapper, PI/open-loop controllers, MBPO, TD3+BC, MOPO, SB3 runner, CEM, plotting
scripts/       train.py, evaluate.py, reproduce.sh, make_datasets.py, open_loop_search.py, make_figures.py
notebooks/     01-explore, 02-baseline, 03-first-experiment
data/          offline datasets, trajectories, results, every run's config/curve/checkpoint (< 20 MB)
tests/         env sanity tests and baseline smoke tests
```

## Licence

MIT for this repo's code and text. Gym-TORAX (MIT), TORAX (Apache-2.0), Stable-Baselines3 (MIT) and other dependencies keep their licences; see [References](https://leandergrech.github.io/rl-tokamak-rampup/07-references/).
