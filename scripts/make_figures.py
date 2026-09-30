"""Figures for the docs, built only from files under data/ (run after training and evaluation).

python scripts/make_figures.py   ->  docs/figures/{trajectories,learning_curves,offline}.png
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

OUT = Path("docs/figures")
# Categorical slots 1-4 of the reference data-viz palette (light mode), fixed order; each series also
# gets its own line style and marker so identity does not rely on colour.
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
STYLES = ["-", "--", "-.", ":"]
MARKERS = ["o", "s", "^", "D"]
INK, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"
FLOOR = 1.5  # failed episodes (return about -1000) are drawn at the axis floor

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED, "ytick.color": MUTED,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.spines.top": False,
    "axes.spines.right": False, "font.size": 10, "lines.linewidth": 2.0, "legend.frameon": False,
})

PANELS = [("Ip_MA", "I_p [MA]"), ("P_NBI_MW", "P_NBI [MW]"), ("P_ECRH_MW", "P_ECRH [MW]"),
          ("q_min", "q_min"), ("q95", "q95"), ("fgw_n_e_line_avg", "Greenwald fraction"),
          ("T_e0", "T_e(0) [keV]"), ("Q_fusion", "fusion gain Q"), ("r_bench", "benchmark reward per s")]


def _best_online_run() -> Path | None:
    best, path = -1e9, None
    for p in Path("data/runs").glob("*/result.json"):
        cfg = json.loads((p.parent / "config.json").read_text())
        ec = cfg["env_config"]
        if cfg["algo"] not in ("ppo", "sac", "mbpo") or ec["obs_set"] != "profiles" or ec["reward_mode"] != "scaled":
            continue
        if abs(ec.get("ip_min", 3e6) - 3e6) > 1:
            continue
        r = json.loads(p.read_text())["benchmark_return"]
        if r > best:
            best, path = r, p.parent
    return path


def trajectories() -> None:
    eps = {"PI controller (3.79)": "data/trajectories/pi.csv", "open-loop reference (3.41)": "data/trajectories/open_loop.csv"}
    best = _best_online_run()
    if best is not None:
        r = json.loads((best / "result.json").read_text())["benchmark_return"]
        eps[f"{best.name} final policy ({r:.2f})"] = best / "final_episode.csv"
    if Path("data/trajectories/cem_best.csv").exists():
        c = json.loads(Path("data/results/cem_open_loop.json").read_text())["best_rescored"]
        eps[f"CEM open-loop schedule ({c:.2f})"] = "data/trajectories/cem_best.csv"
    dfs = {k: pd.read_csv(v) for k, v in eps.items() if Path(v).exists()}
    fig, axes = plt.subplots(3, 3, figsize=(12, 8.5), sharex=True)
    for ax, (col, label) in zip(axes.flat, PANELS):
        for i, (name, df) in enumerate(dfs.items()):
            if col in df:
                ax.plot(df["t"], df[col], color=SERIES[i], ls=STYLES[i], lw=1.8, label=name)
        ax.set_title(label, fontsize=10, color=INK, loc="left")
        ax.axvline(100, color=MUTED, lw=0.8, ls=":")
        if col in ("q_min", "fgw_n_e_line_avg"):
            ax.axhline(1.0, color=MUTED, lw=1.0, ls="--")
    for ax in axes[-1]:
        ax.set_xlabel("time [s]")
    handles, labels = axes[0, 0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=len(labels), fontsize=9)
    fig.tight_layout(rect=(0, 0.05, 1, 1))
    fig.savefig(OUT / "trajectories.png", dpi=110)
    plt.close(fig)


def learning_curves() -> None:
    cl = json.loads(Path("data/results/classical.json").read_text())
    runs = {"MBPO": "data/runs/mbpo_s0", "SAC": "data/runs/sac_s0", "PPO": "data/runs/ppo_s0"}
    fig, ax = plt.subplots(figsize=(8, 4.6))
    for i, (name, rd) in enumerate(runs.items()):
        cp = Path(rd) / "curve.json"
        if not cp.exists():
            continue
        ev = [r for r in json.loads(cp.read_text())["eval"] if "eval_return" in r]
        x = [r.get("env_steps", r.get("real_steps")) for r in ev]
        y = [max(r["eval_return"], FLOOR) for r in ev]
        ax.plot(x, y, color=SERIES[i], ls=STYLES[i], marker=MARKERS[i], ms=5, label=name)
        ax.annotate(name, (x[-1], y[-1]), xytext=(6, 0), textcoords="offset points", color=INK, fontsize=9, va="center")
    for name, val in (("PI controller", cl["pi"]["benchmark_return"]), ("open-loop reference", cl["open_loop"]["benchmark_return"])):
        ax.axhline(val, color=MUTED, lw=1.0, ls="--")
        ax.text(1.0, val, f"{name} {val:.2f} ", transform=ax.get_yaxis_transform(), ha="right", va="bottom",
                color=MUTED, fontsize=8)
    ax.set_xscale("log")
    ax.set_ylim(FLOOR - 0.1, None)
    ax.set_xlabel("simulator steps used for training (log scale)")
    ax.set_ylabel("benchmark return of the deterministic policy")
    ax.text(0.01, 0.01, f"episodes that ended in failure (about -1000) are drawn at {FLOOR}", transform=ax.transAxes,
            fontsize=8, color=MUTED)
    ax.legend(loc="upper left", fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT / "learning_curves.png", dpi=110)
    plt.close(fig)


def offline() -> None:
    ds_info = json.loads(Path("data/offline/datasets.json").read_text())
    datasets = ["pi_det", "pi_noisy_0.1", "pi_noisy_0.3"]
    algos = [("bc", "BC"), ("td3bc", "TD3+BC"), ("mopo", "MOPO")]
    fig, ax = plt.subplots(figsize=(8, 4.4))
    width = 0.24
    for j, (algo, label) in enumerate(algos):
        for i, ds in enumerate(datasets):
            p = Path(f"data/runs/{algo}_{ds}_s0/result.json")
            if not p.exists():
                continue
            r = json.loads(p.read_text())["benchmark_return"]
            x = i + (j - 1) * width
            h = max(r, FLOOR) - FLOOR
            ax.bar(x, h, width - 0.03, bottom=FLOOR, color=SERIES[j], label=label if i == 0 else None,
                   hatch=["", "//", ".."][j], edgecolor=SURFACE, linewidth=0)
            ax.text(x, max(r, FLOOR) + 0.02, "fails" if r < 0 else f"{r:.2f}", ha="center", va="bottom", fontsize=8,
                    color=INK)
    for i, ds in enumerate(datasets):
        b = ds_info[ds]["behaviour_mean_return"]
        ax.hlines(b, i - 0.42, i + 0.42, color=INK, lw=1.4)
        ax.text(i + 0.43, b, "behaviour", fontsize=7, color=MUTED, va="center")
    ax.set_xticks(range(len(datasets)))
    ax.set_xticklabels([f"{d}\n({ds_info[d]['transitions']:,} transitions)" for d in datasets])
    ax.set_ylim(FLOOR, None)
    ax.set_ylabel("benchmark return (final policy)")
    ax.legend(loc="upper left", fontsize=9, ncol=3)
    fig.tight_layout()
    fig.savefig(OUT / "offline.png", dpi=110)
    plt.close(fig)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    trajectories()
    learning_curves()
    offline()
    print("wrote", sorted(str(p) for p in OUT.glob("*.png")))


if __name__ == "__main__":
    main()
