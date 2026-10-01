#!/usr/bin/env bash
# Reproduce the numbers on the site.
#
#   bash scripts/reproduce.sh          # 55 min measured on a busy 16-thread laptop: classical baselines (PI must give 3.79),
#                                      # re-evaluate every stored checkpoint, rebuild data/results/summary.md
#   bash scripts/reproduce.sh --full   # also rebuild the offline datasets and retrain every baseline
#                                      # (each run < 1 h; about 8-10 h in total on one laptop)
#
# Run inside the environment where `pip install -e .[dev]` was done.
set -euo pipefail
cd "$(dirname "$0")/.."
export JAX_PLATFORMS=cpu
PY=${PYTHON:-python}
WORKERS=${WORKERS:-4}

echo "== classical baselines (PI, open-loop, Gym-TORAX PIDAgent, random x20)"
$PY scripts/evaluate.py --classical --n-random 20 --workers "$WORKERS"
$PY - <<'PYEOF'
import json
c = json.load(open("data/results/classical.json"))
pi, ol = c["pi"]["benchmark_return"], c["open_loop"]["benchmark_return"]
assert abs(pi - 3.79) < 0.01, f"PI return {pi} does not match the paper's 3.79"
assert abs(ol - 3.40) < 0.01, f"open-loop return {ol} does not match the paper's 3.40"
assert abs(c["pi_gymtorax_agent"]["benchmark_return"] - pi) < 1e-9
print(f"PI {pi:.4f} (paper 3.79), open-loop {ol:.4f} (paper 3.40): reproduced")
PYEOF

if [[ "${1:-}" == "--full" ]]; then
  echo "== offline datasets from the PI controller"
  $PY scripts/make_datasets.py --episodes 20 --sigmas 0.1 0.3 --workers 8
  echo "== online baselines (final protocol: I_p floor 3 MA)"
  $PY scripts/train.py --algo mbpo --out data/runs/mbpo_s0 --minutes 55 --real-episodes 30 --seed 0
  $PY scripts/train.py --algo mbpo --out data/runs/mbpo_s1 --minutes 50 --real-episodes 20 --seed 1
  $PY scripts/train.py --algo mbpo --out data/runs/mbpo_s2 --minutes 50 --real-episodes 20 --seed 2
  $PY scripts/train.py --algo sac  --out data/runs/sac_s0  --minutes 45 --n-envs 8 --seed 0
  $PY scripts/train.py --algo ppo  --out data/runs/ppo_s0  --minutes 45 --n-envs 8 --seed 0
  echo "== first-protocol runs (I_p floor 1 MA), kept as an ablation"
  $PY scripts/train.py --algo mbpo --out data/runs/mbpo_ipfloor1MA_s0 --ip-min-ma 1 --minutes 50 --real-episodes 40 --seed 0
  $PY scripts/train.py --algo sac  --out data/runs/sac_ipfloor1MA_s0  --ip-min-ma 1 --minutes 45 --n-envs 8 --seed 0
  echo "== ablations: observation set and reward (MBPO, 15 simulator episodes)"
  $PY scripts/train.py --algo mbpo --out data/runs/mbpo_obs-scalars_s0 --obs-set scalars --real-episodes 15 --minutes 50 --seed 0
  $PY scripts/train.py --algo mbpo --out data/runs/mbpo_obs-full_s0 --obs-set full --real-episodes 15 --minutes 50 --seed 0
  $PY scripts/train.py --algo mbpo --out data/runs/mbpo_reward-benchmark_s0 --reward-mode benchmark --real-episodes 15 --minutes 50 --seed 0
  $PY scripts/train.py --algo mbpo --out data/runs/mbpo_reward-qminsafe_s0 --reward-mode qmin_safe --real-episodes 15 --minutes 50 --seed 0
  echo "== residual RL on the PI controller, audited reward (PPO: 5 workers, 75 min; MBPO: 25 episodes)"
  for s in 0 1; do
    $PY scripts/train.py --algo ppo --residual pi --reward-mode patched --norm-reward --log-std-init -1.0 --n-envs 5 \
      --ppo-n-steps 64 --ppo-batch 64 --minutes 75 --seed $s --out data/runs/ppo_res_s$s
    $PY scripts/train.py --algo mbpo --residual pi --residual-scale 0.5 2 2 --reward-mode patched --real-episodes 25 \
      --minutes 75 --seed $s --out data/runs/mbpo_res_s$s
  done
  echo "== offline baselines"
  for ds in pi_det pi_noisy_0.1 pi_noisy_0.3; do
    for algo in bc td3bc mopo; do
      $PY scripts/train.py --algo $algo --dataset data/offline/$ds.npz --out data/runs/${algo}_${ds}_s0 --steps 20000 --minutes 25 --seed 0
    done
  done
  echo "== radial profiles for the animations (PI, open-loop, heating cut)"
  $PY scripts/profile_snapshots.py
  echo "== open-loop optimum estimate"
  $PY scripts/open_loop_search.py --workers 8 --population 16 --generations 10 --minutes 45 --objective benchmark
  $PY scripts/open_loop_search.py --workers 8 --population 16 --generations 10 --minutes 45 --objective audited
fi

echo "== re-evaluate stored checkpoints (deterministic: must match result.json)"
shopt -s nullglob
runs=(data/runs/*/)
if (( ${#runs[@]} )); then
  $PY scripts/evaluate.py --runs "${runs[@]}"
fi

echo "== summary table"
$PY scripts/evaluate.py --summary

echo "== figures and interactive-widget data"
$PY scripts/make_figures.py
$PY scripts/make_widget_data.py
$PY scripts/make_lab_data.py
