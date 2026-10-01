"""Train one baseline on the Gym-TORAX ITER hybrid ramp-up and store everything needed to re-evaluate it.

Examples
--------
python scripts/train.py --algo ppo  --out data/runs/ppo_s0  --minutes 45 --n-envs 12
python scripts/train.py --algo sac  --out data/runs/sac_s0  --minutes 45 --n-envs 8
python scripts/train.py --algo mbpo --out data/runs/mbpo_s0 --minutes 50 --real-episodes 40
python scripts/train.py --algo td3bc --dataset data/offline/pi_noisy_0.1.npz --out data/runs/td3bc_noisy01_s0
python scripts/train.py --algo mopo  --dataset data/offline/pi_det.npz --out data/runs/mopo_det_s0

Residual RL on the PI controller, trained and checkpointed on the audited reward:
python scripts/train.py --algo ppo  --residual pi --reward-mode patched --norm-reward --out data/runs/ppo_res_s0 --n-envs 6
python scripts/train.py --algo mbpo --residual pi --reward-mode patched --out data/runs/mbpo_res_s0 --real-episodes 25

Each run directory gets config.json, policy.{zip,pt}, curve.json, result.json and
final_episode.csv (the deterministic evaluation episode, one row per second).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path

from rl_tokamak.env import EnvConfig, gymtorax_version, make_env, set_single_thread


def _host_info() -> dict:
    import os
    import platform

    cpu = platform.processor()
    try:
        with open("/proc/cpuinfo") as f:
            cpu = next((ln.split(":", 1)[1].strip() for ln in f if ln.startswith("model name")), cpu)
    except OSError:
        pass
    return {"hostname": platform.node(), "cpu": cpu, "logical_cpus": os.cpu_count()}


def parse(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--algo", required=True, choices=["ppo", "sac", "mbpo", "td3bc", "bc", "mopo"])
    p.add_argument("--out", required=True)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--minutes", type=float, default=45.0, help="wall-clock training budget")
    p.add_argument("--obs-set", default="profiles", choices=["scalars", "profiles", "full"])
    p.add_argument("--action-set", default="powers", choices=["powers", "full"])
    p.add_argument("--ip-mode", default="delta", choices=["delta", "absolute"])
    p.add_argument("--reward-mode", default="scaled", choices=["benchmark", "scaled", "qmin_safe", "patched"])
    p.add_argument("--n-envs", type=int, default=None, help="PPO/SAC worker processes")
    p.add_argument("--real-episodes", type=int, default=40, help="MBPO simulator-episode budget")
    p.add_argument("--utd", type=int, default=10, help="MBPO SAC updates per real step")
    p.add_argument("--dataset", help="offline .npz (td3bc, bc, mopo)")
    p.add_argument("--steps", type=int, default=60_000, help="offline gradient steps")
    p.add_argument("--penalty-lambda", type=float, default=1.0, help="MOPO uncertainty penalty")
    p.add_argument("--ip-min-ma", type=float, default=3.0, help="floor of the I_p command [MA]")
    p.add_argument("--residual", default="none", choices=["none", "pi"],
                   help="pi: the agent outputs a correction added to the PI controller's action (ppo, sac, mbpo)")
    p.add_argument("--residual-scale", type=float, nargs=3, default=None, metavar=("IP", "NBI", "ECRH"),
                   help="correction range in normalised action units (default 1 2 2)")
    p.add_argument("--log-std-init", type=float, default=None, help="initial log std of the PPO / residual-MBPO policy")
    p.add_argument("--norm-reward", action="store_true", help="PPO/SAC: normalise the training reward (VecNormalize)")
    p.add_argument("--failure-rule", action="store_true",
                   help="MBPO: end model rollouts that leave Gym-TORAX's bounds (always on with --residual)")
    p.add_argument("--known-reward", action="store_true",
                   help="MBPO: score model rollouts with the reward formula on the predicted state (always on with --residual)")
    p.add_argument("--ppo-n-steps", type=int, default=None, help="PPO rollout length per worker (default 128)")
    p.add_argument("--ppo-batch", type=int, default=None, help="PPO minibatch size (default 256)")
    p.add_argument("--max-steps", type=int, default=None, help=argparse.SUPPRESS)  # smoke tests only
    return p.parse_args(argv)


def main(argv=None) -> dict:
    set_single_thread()
    import torch

    torch.set_num_threads(2)
    args = parse(argv)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    extra = {}
    if args.residual != "none":
        from rl_tokamak.residual import DEFAULT_SCALE

        extra["residual"] = {"base": args.residual, "scale": list(args.residual_scale or DEFAULT_SCALE)}
    env_cfg = EnvConfig(obs_set=args.obs_set, action_set=args.action_set, ip_mode=args.ip_mode,
                        reward_mode=args.reward_mode, max_steps=args.max_steps, ip_min=args.ip_min_ma * 1e6,
                        extra=extra)
    log_f = open(out / "train.log", "a")

    def log(row):
        line = json.dumps(row, default=float)
        print(line, flush=True)
        log_f.write(line + "\n")
        log_f.flush()

    meta = {"algo": args.algo, "seed": args.seed, "env_config": asdict(env_cfg), "args": vars(args),
            "gymtorax": gymtorax_version(), "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "host": _host_info()}
    t0 = time.time()
    if args.algo in ("ppo", "sac"):
        from rl_tokamak.agents.sb3_runner import SB3Config, train_sb3

        cfg = SB3Config(algo=args.algo, max_minutes=args.minutes, seed=args.seed,
                        n_envs=args.n_envs or (12 if args.algo == "ppo" else 8),
                        net_arch=(64, 64) if args.algo == "ppo" else (256, 256), norm_reward=args.norm_reward)
        if args.log_std_init is not None:
            cfg.ppo["log_std_init"] = args.log_std_init
        if args.ppo_n_steps:
            cfg.ppo["n_steps"] = args.ppo_n_steps
        if args.ppo_batch:
            cfg.ppo["batch_size"] = args.ppo_batch
        res = train_sb3(env_cfg, cfg, log, best_path=out / "policy_best.zip")
        res["model"].save(out / "policy.zip")
        from rl_tokamak.policies import compact_sb3

        for stem in ("policy", "policy_best"):  # small actor-only copies that get committed; zips stay local
            if (out / f"{stem}.zip").exists():
                compact_sb3(out / f"{stem}.zip", args.algo, out / f"{stem}.pt")
        curve = {"eval": res["callback"].curve, "train_episodes": res["callback"].train_episodes}
        meta["algo_config"] = res["config"]
        eval_env = res["eval_env"]
        meta["env_steps"] = int(res["model"].num_timesteps)
    elif args.algo == "mbpo":
        from rl_tokamak.agents.mbpo import MBPOConfig, train_mbpo
        from rl_tokamak.policies import save_torch_actor

        env = make_env(env_cfg)
        cfg = MBPOConfig(real_episodes=args.real_episodes, max_minutes=args.minutes, seed=args.seed, utd=args.utd,
                         residual_init=args.residual != "none", init_alpha=0.1 if args.residual != "none" else 1.0,
                         failure_rule=args.residual != "none" or args.failure_rule,
                         known_reward=args.residual != "none" or args.known_reward)
        if args.log_std_init is not None:
            cfg.init_log_std = args.log_std_init
        od, ad = env.observation_space.shape[0], env.action_space.shape[0]
        res = train_mbpo(env, cfg, log, on_best=lambda ag: save_torch_actor(out / "policy_best.pt", "sac_actor",
                                                                            ag.actor, od, ad, cfg.hidden))
        a = res["agent"]
        save_torch_actor(out / "policy.pt", "sac_actor", a.actor, od, ad, cfg.hidden)
        curve = {"eval": res["curve"]}
        meta["algo_config"] = res["config"]
        meta["env_steps"] = res["real_steps"]
        eval_env = env
    else:
        import numpy as np

        from rl_tokamak.agents.offline import OfflineConfig, load_dataset, train_offline
        from rl_tokamak.evaluate import run_policy
        from rl_tokamak.policies import save_torch_actor

        if not args.dataset:
            sys.exit("--dataset is required for offline algorithms")
        data = load_dataset(args.dataset)
        env = make_env(env_cfg)
        cfg = OfflineConfig(algo=args.algo, steps=args.steps, max_minutes=args.minutes, seed=args.seed,
                            penalty_lambda=args.penalty_lambda)
        res = train_offline(data, cfg, eval_fn=lambda pi: run_policy(env, pi)["benchmark_return"], env=env, log=log)
        a = res["agent"]
        od, ad = env.observation_space.shape[0], env.action_space.shape[0]
        if args.algo == "mopo":
            save_torch_actor(out / "policy.pt", "sac_actor", a.actor, od, ad, (256, 256))
        else:
            save_torch_actor(out / "policy.pt", "td3bc_actor", a.actor, od, ad, (256, 256),
                             mu=np.asarray(a.mu).tolist(), sd=np.asarray(a.sd).tolist())
        curve = {"eval": res["curve"]}
        meta["algo_config"] = res["config"]
        meta["dataset"] = args.dataset
        meta["dataset_transitions"] = int(len(data["obs"]))
        meta["env_steps"] = 0
        if "model_fit" in res:
            meta["model_fit"] = res["model_fit"]
        eval_env = env
    meta["train_minutes"] = (time.time() - t0) / 60
    (out / "config.json").write_text(json.dumps(meta, indent=2, default=float))
    (out / "curve.json").write_text(json.dumps(curve, default=float))

    from rl_tokamak.evaluate import evaluate_run

    result = evaluate_run(out, env=eval_env)
    result["total_minutes"] = (time.time() - t0) / 60
    (out / "result.json").write_text(json.dumps(result, indent=2, default=float))
    log({"final": result})
    return result


if __name__ == "__main__":
    main()
