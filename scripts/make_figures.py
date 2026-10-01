"""Figures for the docs, built only from files under data/ (run after training and evaluation).

python scripts/make_figures.py   ->  docs/figures/{trajectories,learning_curves,offline}.png
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

OUT = Path("docs/figures")
# Categorical slots 1-4 of the reference data-viz palette (light mode), fixed order; each series also
# gets its own line style and marker so identity does not rely on colour.
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
STYLES = ["-", "--", "-.", ":"]
MARKERS = ["o", "s", "^", "D"]
INK, MUTED, GRID, SURFACE = "#1b1633", "#4a4466", "#e3dcf5", "#fbfaff"  # site theme A "Plasma" (light)
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
    fig.savefig(OUT / "trajectories.png", dpi=150)
    plt.close(fig)


def learning_curves() -> None:
    """Deterministic-evaluation curves of every default-config PPO, SAC and MBPO run (one colour per algorithm)."""
    cl = json.loads(Path("data/results/classical.json").read_text())
    algos = {"mbpo": "MBPO", "sac": "SAC", "ppo": "PPO"}
    fig, ax = plt.subplots(figsize=(8.5, 4.8))
    for i, (algo, name) in enumerate(algos.items()):
        first = True
        for rd in sorted(Path("data/runs").glob(f"{algo}_s*")):
            cfg = json.loads((rd / "config.json").read_text())
            ec = cfg["env_config"]
            if ec["reward_mode"] != "scaled" or ec["obs_set"] != "profiles" or abs(ec.get("ip_min", 3e6) - 3e6) > 1:
                continue
            ev = [r for r in json.loads((rd / "curve.json").read_text())["eval"] if "eval_return" in r]
            x = [r.get("env_steps", r.get("real_steps")) for r in ev]
            y = [max(r["eval_return"], FLOOR) for r in ev]
            ax.plot(x, y, color=SERIES[i], ls=STYLES[i], marker=MARKERS[i], ms=4, lw=1.6,
                    label=name if first else None)
            ax.annotate(f"{name} s{cfg['seed']}", (x[-1], y[-1]), xytext=(5, 0), textcoords="offset points",
                        color=INK, fontsize=7, va="center")
            first = False
    for name, val in (("PI controller", cl["pi"]["benchmark_return"]), ("open-loop reference", cl["open_loop"]["benchmark_return"])):
        ax.axhline(val, color=MUTED, lw=1.0, ls="--")
        ax.text(0.0, val, f" {name} {val:.2f}", transform=ax.get_yaxis_transform(), ha="left", va="bottom",
                color=MUTED, fontsize=8)
    ax.set_xscale("log")
    ax.set_yscale("log")
    from matplotlib.ticker import FixedLocator, NullLocator, ScalarFormatter
    ax.yaxis.set_major_locator(FixedLocator([2, 3, 4, 6, 10, 20, 50]))
    ax.yaxis.set_minor_locator(NullLocator())
    ax.yaxis.set_major_formatter(ScalarFormatter())
    ax.set_ylim(FLOOR, 70)
    ax.set_xlabel("simulator steps used for training (log scale)")
    ax.set_ylabel("benchmark return, deterministic policy (log scale)")
    ax.text(0.99, 0.01, f"failed episodes (about -1000) drawn at {FLOOR}", transform=ax.transAxes, ha="right",
            fontsize=8, color=MUTED)
    ax.legend(loc="upper left", fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT / "learning_curves.png", dpi=150)
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
    fig.savefig(OUT / "offline.png", dpi=150)
    plt.close(fig)


def _audit(csv_path) -> float:
    from rl_tokamak.evaluate import audited_return

    return audited_return(pd.read_csv(csv_path).to_dict("records"))


def classical() -> None:
    """Dot plot: paper value (hollow) vs this repo (filled) for the three published baselines."""
    cl = json.loads(Path("data/results/classical.json").read_text())
    rows = [("PI controller", 3.79, cl["pi"]["benchmark_return"]),
            ("open-loop reference", 3.40, cl["open_loop"]["benchmark_return"]),
            ("random policy", -10.79, cl["random"]["mean_return"])]
    fig, ax = plt.subplots(figsize=(8, 2.8))
    for i, (name, paper, ours) in enumerate(rows):
        y = len(rows) - 1 - i
        if paper > 2.5:
            ax.plot(paper, y, "o", ms=11, mfc=SURFACE, mec=MUTED, mew=2, label="paper (Gym-TORAX 1.0)" if i == 0 else None)
        else:
            ax.annotate(f"paper: {paper:.2f}", xy=(2.95, y), xytext=(3.08, y + 0.28), color=MUTED, fontsize=9,
                        arrowprops=dict(arrowstyle="->", color=MUTED))
        ax.plot(ours, y, "o", ms=8, color=SERIES[0], label="this repo (gymtorax 1.0.0)" if i == 0 else None)
        ax.text(ours, y - 0.32, f"{ours:.2f}", ha="center", fontsize=9, color=INK)
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels([r[0] for r in rows][::-1])
    ax.set_xlim(2.9, 3.95)
    ax.set_ylim(-0.7, len(rows) - 0.3)
    ax.set_xlabel("benchmark return (undiscounted, one episode)")
    ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "classical.png", dpi=150)
    plt.close(fig)


POLICIES = [  # (label, episode csv)
    ("PI controller", "data/trajectories/pi.csv"),
    ("open-loop reference", "data/trajectories/open_loop.csv"),
    ("BC on noisy PI (σ 0.3)", "data/runs/bc_pi_noisy_0.3_s0/final_episode.csv"),
    ("TD3+BC on noisy PI (σ 0.3)", "data/runs/td3bc_pi_noisy_0.3_s0/final_episode.csv"),
    ("MOPO on one PI episode", "data/runs/mopo_pi_det_s0/final_episode.csv"),
    ("PPO seed 0 (14k steps)", "data/runs/ppo_s0/final_episode.csv"),
    ("SAC seed 0 (11k steps)", "data/runs/sac_s0/final_episode.csv"),
    ("PPO seed 1 (112k steps)", "data/runs/ppo_s1/final_episode.csv"),
    ("SAC seed 1 (75k steps)", "data/runs/sac_s1/final_episode.csv"),
    ("MBPO, full observation, seed 1", "data/runs/mbpo_obs-full_s1/final_episode.csv"),
    ("MBPO, raw reward (best)", "data/trajectories/mbpo_raw_reward_best.csv"),
    ("MBPO seed 1", "data/runs/mbpo_s1/final_episode.csv"),
]
for tag, lab in (("", "CEM schedule (benchmark)"), ("_audited", "CEM schedule (audited)")):
    POLICIES.append((lab, f"data/trajectories/cem_best{tag}.csv"))


def reward_components() -> None:
    """Stacked bars: where each policy's benchmark return comes from, with its audited score marked."""
    comps = [("r_fusion_gain", "fusion gain Q (gated)"), ("r_h98", "H98 (gated)"), ("r_q_min", "q_min"), ("r_q95", "q95")]
    rows = [(lab, pd.read_csv(f)) for lab, f in POLICIES if Path(f).exists()]
    rows = [(lab, d) for lab, d in rows if "r_q_min" in d and not d["r_bench"].lt(-100).any()]
    fig, ax = plt.subplots(figsize=(9, 0.5 * len(rows) + 1.4))
    for i, (lab, d) in enumerate(rows[::-1]):
        left = 0.0
        for j, (c, name) in enumerate(comps):
            v = float(d[c].sum())
            ax.barh(i, v, left=left, color=SERIES[j], edgecolor=SURFACE, linewidth=2, height=0.62,
                    label=name if i == 0 else None)
            left += v
        a = _audit(Path(dict(POLICIES)[lab]))
        ax.plot(a, i, marker="|", ms=18, mew=2.5, color=INK, label="audited score" if i == 0 else None)
        ax.text(left + 0.1, i, f"{left:.2f}  (audited {a:.2f})", va="center", fontsize=8, color=INK)
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels([r[0] for r in rows][::-1])
    ax.set_xlabel("benchmark return, split into its four reward terms")
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, 1.0), fontsize=8, ncol=5)
    ax.set_xlim(0, max(float(d["r_bench"].sum()) for _, d in rows) * 1.3)
    fig.tight_layout()
    fig.savefig(OUT / "reward_components.png", dpi=150)
    plt.close(fig)


def audit_scatter() -> None:
    """Benchmark return vs audited score for every non-failing final policy and classical baseline."""
    from matplotlib.ticker import FixedLocator, NullLocator, ScalarFormatter

    pts = []
    for lab, f in (("PI controller", "data/trajectories/pi.csv"), ("open-loop", "data/trajectories/open_loop.csv")):
        d = pd.read_csv(f)
        pts.append((lab, float(d["r_bench"].sum()), _audit(f), "classical"))
    for p in sorted(Path("data/runs").glob("*/final_episode.csv")):
        d = pd.read_csv(p)
        if d["r_bench"].lt(-100).any():
            continue
        algo = json.loads((p.parent / "config.json").read_text())["algo"]
        grp = "offline" if algo in ("bc", "td3bc", "mopo") else "online"
        pts.append((p.parent.name, float(d["r_bench"].sum()), _audit(p), grp))
    f = "data/trajectories/mbpo_raw_reward_best.csv"
    if Path(f).exists():
        pts.append(("mbpo_raw_reward_best", float(pd.read_csv(f)["r_bench"].sum()), _audit(f), "online"))
    for tag, lab in (("", "cem_benchmark"), ("_audited", "cem_audited")):
        fc = Path(f"data/trajectories/cem_best{tag}.csv")
        if fc.exists():
            pts.append((lab, float(pd.read_csv(fc)["r_bench"].sum()), _audit(fc), "reference"))
    names = {"PI controller": ("PI controller", (8, -12)), "open-loop": ("open-loop", (8, -4)),
             "td3bc_pi_noisy_0.3_s0": ("TD3+BC, noisy PI σ 0.3", (8, 6)),
             "mopo_pi_det_s0": ("MOPO, one PI episode", (8, -4)),
             "mbpo_raw_reward_best": ("MBPO raw reward (best)", (-40, 10)), "mbpo_s1": ("MBPO seed 1", (-30, 10)),
             "cem_benchmark": ("CEM, benchmark objective", (8, 4)), "cem_audited": ("CEM, audited objective", (8, 4))}
    fig, ax = plt.subplots(figsize=(8.5, 5))
    groups = {"classical": (SERIES[0], "o", 70), "online": (SERIES[1], "s", 45), "offline": (SERIES[2], "^", 50),
              "reference": (SERIES[3], "D", 55)}
    for g, (c, m, size) in groups.items():
        xs = [p[1] for p in pts if p[3] == g]
        ys = [p[2] for p in pts if p[3] == g]
        if xs:
            ax.scatter(xs, ys, s=size, color=c, marker=m, edgecolor=SURFACE, linewidth=1.2, label=g,
                       zorder=4 if g == "classical" else 3)
    for lab, x, y, g in pts:
        if lab in names:
            text, off = names[lab]
            ax.annotate(text, (x, y), xytext=off, textcoords="offset points", fontsize=8, color=INK)
    ax.plot([1.9, 4.3], [1.9, 4.3], color=MUTED, lw=1, ls="--")
    ax.text(2.05, 2.25, "audited = benchmark", fontsize=8, color=MUTED, rotation=38)
    ax.set_xscale("log")
    ticks = [2, 3, 4, 6, 10, 20]
    ax.xaxis.set_major_locator(FixedLocator(ticks))
    ax.xaxis.set_minor_locator(NullLocator())
    ax.xaxis.set_major_formatter(ScalarFormatter())
    ax.set_xlim(1.9, max(p[1] for p in pts) * 1.15)
    ax.set_xlabel("benchmark return (log scale)")
    ax.set_ylabel("audited score\n(Q capped at 10, H-mode needs P_SOL ≥ P_LH)")
    ax.legend(loc="upper right", fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "audit_scatter.png", dpi=150)
    plt.close(fig)


def exploit() -> None:
    """How the Q loophole works: auxiliary power, Q, P_SOL/P_LH and core temperature, exploit vs PI."""
    eps = {"PI controller": "data/trajectories/pi.csv", "MBPO raw reward, best (8.85)": "data/trajectories/mbpo_raw_reward_best.csv",
           "MBPO seed 1 (18.42)": "data/runs/mbpo_s1/final_episode.csv",
           "PPO seed 1 (48.98)": "data/runs/ppo_s1/final_episode.csv"}
    dfs = {k: pd.read_csv(v) for k, v in eps.items() if Path(v).exists()}
    panels = [("P_aux", "auxiliary heating P_NBI + P_ECRH [MW]"), ("Q_fusion", "fusion gain Q (reward term uncapped)"),
              ("psol_plh", "P_SOL / P_LH (H-mode needs ≥ 1)"), ("T_e0", "T_e(0) [keV] (reward's H-mode test: > 10)")]
    fig, axes = plt.subplots(2, 2, figsize=(11, 6.5), sharex=True)
    for ax, (col, title) in zip(axes.flat, panels):
        for i, (name, d) in enumerate(dfs.items()):
            if col == "P_aux":
                y = d["P_NBI_MW"] + d["P_ECRH_MW"]
            elif col == "psol_plh":
                if "P_SOL_total" not in d:
                    continue
                y = d["P_SOL_total"] / d["P_LH"]
            else:
                y = d[col]
            ax.plot(d["t"], y, color=SERIES[i], ls=STYLES[i], label=name)
        ax.set_title(title, fontsize=10, loc="left", color=INK)
        ax.axvspan(100, 105, color=GRID, alpha=0.8, lw=0)
        if col == "psol_plh":
            ax.axhline(1.0, color=MUTED, ls="--", lw=1)
        if col == "T_e0":
            ax.axhline(10.0, color=MUTED, ls="--", lw=1)
    for ax in axes[-1]:
        ax.set_xlabel("time [s] (shaded: scheduled pedestal rise, 100–105 s)")
    h, l = axes[0, 0].get_legend_handles_labels()
    fig.legend(h, l, loc="lower center", ncol=3, fontsize=9)
    fig.tight_layout(rect=(0, 0.06, 1, 1))
    fig.savefig(OUT / "exploit.png", dpi=150)
    plt.close(fig)


def profiles() -> None:
    """Current density and safety factor profiles over time: current diffuses in from the edge."""
    f = Path("data/trajectories/profiles.npz")
    if not f.exists():
        return
    z = np.load(f)
    times = np.array([5, 20, 40, 60, 100, 150])
    idx = [int(np.where(z["pi_time"] == t)[0][0]) for t in times]
    ramp = plt.get_cmap("Blues")(np.linspace(0.35, 1.0, len(times)))  # sequential: one hue, light -> dark = later
    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    for k, (key, title) in enumerate((("j_total", "current density j [MA/m²]"), ("q", "safety factor q"))):
        ax = axes[k]
        for i, t in enumerate(times):
            y = z[f"pi_{key}"][idx[i]] / (1e6 if key == "j_total" else 1)
            ax.plot(np.linspace(0, 1, len(y)), y, color=ramp[i], label=f"t = {t} s")
        ax.set_title(f"PI controller: {title}", fontsize=10, loc="left", color=INK)
        ax.set_xlabel("normalised radius ρ̂ (0 = axis, 1 = edge)")
        if key == "q":
            ax.axhline(1.0, color=MUTED, ls="--", lw=1)
            ax.set_ylim(0, 8)
    axes[0].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "profiles.png", dpi=150)
    plt.close(fig)


def reward_timeline() -> None:
    """Reward per second of the PI episode, stacked by term, with the scenario phases shaded."""
    d = pd.read_csv("data/trajectories/pi.csv")
    comps = [("r_q95", "q95"), ("r_q_min", "q_min"), ("r_h98", "H98 (gated)"), ("r_fusion_gain", "fusion gain Q (gated)")]
    colors = [SERIES[3], SERIES[2], SERIES[1], SERIES[0]]
    fig, ax = plt.subplots(figsize=(9, 3.6))
    ax.stackplot(d["t"], *[d[c] for c, _ in comps], labels=[n for _, n in comps], colors=colors,
                 edgecolor=SURFACE, linewidth=0.6)
    ax.axvspan(100, 105, color=GRID, alpha=0.9, lw=0)
    ax.text(50, ax.get_ylim()[1] * 0.92, "current ramp-up (L-mode)", ha="center", fontsize=9, color=MUTED)
    ax.text(127, ax.get_ylim()[1] * 0.92, "flat-top after the scheduled pedestal", ha="center", fontsize=9, color=MUTED)
    ax.set_xlabel("time [s]")
    ax.set_ylabel("benchmark reward per second")
    ax.set_xlim(0, 151)
    h, l = ax.get_legend_handles_labels()
    ax.legend(h[::-1], l[::-1], loc="upper left", bbox_to_anchor=(0.0, 0.85), fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "reward_timeline.png", dpi=150)
    plt.close(fig)


def physics_audit() -> None:
    """Per policy: seconds with q_min < 1, peak Greenwald fraction, flat-top P_SOL/P_LH."""
    rows = []
    for lab, f in POLICIES:
        if not Path(f).exists():
            continue
        d = pd.read_csv(f)
        if d["r_bench"].lt(-100).any() or "P_SOL_total" not in d:
            continue
        ft = d[d["t"] > 110]
        rows.append((lab, float((d["q_min"] < 1).sum()), float(d["fgw_n_e_line_avg"].max()),
                     float((ft["P_SOL_total"] / ft["P_LH"]).mean())))
    fig, axes = plt.subplots(1, 3, figsize=(12, 0.45 * len(rows) + 1.6), sharey=True)
    specs = [("seconds with q_min < 1", 1, 0.0, "0 in a hybrid scenario"), ("peak Greenwald fraction", 2, 1.0, "limit 1"),
             ("flat-top P_SOL / P_LH", 3, 1.0, "H-mode needs ≥ 1")]
    y = np.arange(len(rows))[::-1]
    for ax, (title, k, ref, note) in zip(axes, specs):
        vals = [r[k] for r in rows]
        ax.barh(y, vals, color=SERIES[0], height=0.6, edgecolor=SURFACE)
        for yi, v in zip(y, vals):
            ax.text(v, yi, f" {v:.0f}" if k == 1 else f" {v:.2f}", va="center", fontsize=8, color=INK)
        if ref > 0:
            ax.axvline(ref, color=INK, ls="--", lw=1)
        ax.set_title(f"{title}\n({note})", fontsize=9, loc="left", color=INK)
        ax.set_xlim(0, max(vals) * 1.25 + (0.1 if k > 1 else 5))
    axes[0].set_yticks(y)
    axes[0].set_yticklabels([r[0] for r in rows])
    fig.tight_layout()
    fig.savefig(OUT / "physics_audit.png", dpi=150)
    plt.close(fig)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    trajectories()
    learning_curves()
    offline()
    classical()
    reward_components()
    audit_scatter()
    exploit()
    profiles()
    reward_timeline()
    physics_audit()
    print("wrote", sorted(str(p) for p in OUT.glob("*.png")))


if __name__ == "__main__":
    main()
