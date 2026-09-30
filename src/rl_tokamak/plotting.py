"""Plots used by the notebooks and the docs: episode trajectories and learning curves."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

PANELS = [
    ("Ip_MA", "I_p [MA]"),
    ("P_NBI_MW", "P_NBI [MW]"),
    ("P_ECRH_MW", "P_ECRH [MW]"),
    ("q_min", "q_min"),
    ("q95", "q95"),
    ("fgw_n_e_line_avg", "Greenwald fraction"),
    ("T_e0", "T_e(0) [keV]"),
    ("Q_fusion", "Q"),
    ("r_bench", "benchmark reward per step"),
]


def load_episode(path: str | Path) -> pd.DataFrame:
    return pd.read_csv(path)


def plot_episodes(episodes: dict[str, pd.DataFrame | str | Path], out: str | Path | None = None, title: str = ""):
    """One panel per key quantity, one line per policy. ``episodes`` maps label -> DataFrame or CSV path."""
    dfs = {k: (v if isinstance(v, pd.DataFrame) else load_episode(v)) for k, v in episodes.items()}
    fig, axes = plt.subplots(3, 3, figsize=(13, 9), sharex=True)
    for ax, (col, label) in zip(axes.flat, PANELS):
        for name, df in dfs.items():
            if col in df:
                ax.plot(df["t"], df[col], label=name, lw=1.4)
        ax.set_ylabel(label)
        ax.axvline(100, color="grey", lw=0.8, ls=":")
        if col == "q_min":
            ax.axhline(1.0, color="k", lw=0.8, ls="--")
        if col == "fgw_n_e_line_avg":
            ax.axhline(1.0, color="k", lw=0.8, ls="--")
    for ax in axes[-1]:
        ax.set_xlabel("t [s]")
    axes[0, 0].legend(fontsize=8)
    if title:
        fig.suptitle(title)
    fig.tight_layout()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=120)
    return fig


def learning_curve(run_dir: str | Path) -> pd.DataFrame:
    """Deterministic-evaluation curve of a run: columns env_steps (or real_steps / step), minutes, eval_return."""
    d = json.loads((Path(run_dir) / "curve.json").read_text())
    df = pd.DataFrame([r for r in d["eval"] if "eval_return" in r])
    if "real_steps" in df:
        df = df.rename(columns={"real_steps": "env_steps"})
    return df


def plot_learning_curves(runs: dict[str, str | Path], x: str = "env_steps", out: str | Path | None = None,
                         references: dict[str, float] | None = None, ylim=(1.5, None)):
    fig, ax = plt.subplots(figsize=(7, 4.2))
    for label, rd in runs.items():
        df = learning_curve(rd)
        if x in df and len(df):
            ax.plot(df[x], df["eval_return"].clip(lower=ylim[0]), marker="o", ms=3, label=label)
    for name, val in (references or {}).items():
        ax.axhline(val, ls="--", lw=1, color="grey")
        ax.text(ax.get_xlim()[0], val, f" {name} {val:.2f}", va="bottom", fontsize=8)
    ax.set_xlabel({"env_steps": "simulator steps used for training", "minutes": "wall-clock minutes"}.get(x, x))
    ax.set_ylabel("benchmark return (deterministic policy)")
    ax.set_ylim(*ylim)
    ax.legend(fontsize=8)
    fig.tight_layout()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=120)
    return fig
