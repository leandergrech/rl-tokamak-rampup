// Fit / check the primer Lab's reduced model against this repo's TORAX episodes.
//   node scripts/calibrate_lab_model.mjs            -> report errors with the shipped constants
//   node scripts/calibrate_lab_model.mjs --fit N    -> random-search refinement (prints the best overrides)
//   node scripts/calibrate_lab_model.mjs --physics  -> the physics environment's episodes on M.PHYSICS (fits only its own constants)
//   node scripts/calibrate_lab_model.mjs --physics --table -> the Lab page's comparison table (every phys_ preset in lab.json)
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("../docs/javascripts/tokamak-model.js");

function csv(path) {
  const [h, ...rows] = fs.readFileSync(path, "utf8").trim().split(/\r?\n/);
  const keys = h.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [keys[i], v === "" ? NaN : +v])));
}
const PHYS = process.argv.includes("--physics");
const BENCH_EPISODES = {
  pi: "data/trajectories/pi.csv",
  open_loop: "data/trajectories/open_loop.csv",
  heating_cut: "data/trajectories/heating_cut.csv",
  cem_audited: "data/trajectories/cem_best_audited.csv",
  ppo_s1: "data/runs/ppo_s1/final_episode.csv",
  mbpo_s1: "data/runs/mbpo_s1/final_episode.csv",
};
const PHYS_EPISODES = {
  pi: "data/physics/trajectories/pi.csv",
  open_loop: "data/physics/trajectories/open_loop.csv",
  heating_cut: "data/physics/trajectories/heating_cut.csv",
  cem: "data/physics/trajectories/cem_best.csv",
  ppo_res: "data/physics/runs/ppo_res_s3/final_episode.csv",
  ppo_res_long: "data/physics/runs/ppo_res_long_s3/final_episode.csv",
  ppo_dr_long: "data/physics/runs/ppo_dr_long_s4/final_episode.csv",
};
export const EPISODES = PHYS ? PHYS_EPISODES : BENCH_EPISODES;
const BASE = PHYS ? M.PHYSICS : {};
const data = Object.fromEntries(Object.entries(EPISODES).filter(([, p]) => fs.existsSync(p)).map(([k, p]) => [k, csv(p).filter((r) => isFinite(r.q_min))]));

export function replay(rows, over) {
  const pol = (t) => ({ Ip: rows[Math.min(t, rows.length - 1)].Ip_MA * 1e6, nbi: rows[Math.min(t, rows.length - 1)].P_NBI_MW * 1e6, ecrh: rows[Math.min(t, rows.length - 1)].P_ECRH_MW * 1e6 });
  return M.runEpisode({ ...BASE, ...over }, pol, rows.length);
}
const FIELDS = [
  ["Te0", "T_e0", "lin", 2], ["Ti0", "T_i0", "lin", 1.5], ["qmin", "q_min", "log", 2], ["q95", "q95", "log", 1],
  ["j0", "j0_MA_m2", "lin", 1], ["Q", "Q_fusion", "log", 1.5], ["H98", "H98", "log", 1], ["fgw", "fgw_n_e_line_avg", "lin", 1], ["psolPlh", null, "log", 0.5],
  ...(PHYS ? [["li", "li3", "lin", 1], ["mode", "confinement_mode", "lin", 1]] : []),
];
function errors(over, verbose) {
  let total = 0;
  const report = {};
  for (const [k, rows] of Object.entries(data)) {
    const sim = replay(rows, over);
    const e = {};
    for (const [mk, dk, kind, w] of FIELDS) {
      let s = 0, c = 0;
      for (let i = 0; i < Math.min(sim.length, rows.length); i++) {
        const tv = dk ? rows[i][dk] : PHYS ? rows[i].P_heat_total / rows[i].P_LH : rows[i].P_SOL_total / rows[i].P_LH;
        const mv = sim[i][mk];
        if (!isFinite(tv) || !isFinite(mv)) continue;
        const d = kind === "log" ? Math.log(Math.max(mv, 1e-3) / Math.max(tv, 1e-3)) : (mv - tv) / Math.max(1, Math.abs(tv));
        s += d * d;
        c++;
      }
      e[mk] = Math.sqrt(s / Math.max(c, 1));
      total += w * e[mk];
    }
    const tb = rows.reduce((s, r) => s + r.r_bench, 0);
    if (PHYS) {
      const sp = M.scoreEpisode(sim, M.REWARD_PRESETS.physics);
      e.physics = `${sp.ret.toFixed(2)} (TORAX ${tb.toFixed(2)})${sp.why ? " ended: " + sp.why : ""}`;
      if (sp.why) total += 50;
    } else {
      const sb = M.scoreEpisode(sim, M.REWARD_PRESETS.benchmark).ret, sa = M.scoreEpisode(sim, M.REWARD_PRESETS.audited).ret;
      e.benchmark = `${sb.toFixed(2)} (TORAX ${tb.toFixed(2)})`;
      e.audited = sa.toFixed(2);
    }
    if (sim.length < rows.length) total += 100;
    report[k] = e;
  }
  if (verbose) for (const [k, e] of Object.entries(report)) console.log(k.padEnd(12), Object.entries(e).map(([a, b]) => `${a}=${typeof b === "number" ? b.toFixed(3) : b}`).join(" "));
  return total;
}
function show(over, key, times) {
  const rows = data[key], sim = replay(rows, over);
  console.log(`--- ${key}`);
  for (const t of times) {
    const s = sim[t - 1], r = rows[t - 1];
    console.log(`t=${t}`.padEnd(6), `Ip ${s.Ip.toFixed(1)} Te0 ${s.Te0.toFixed(1)}/${r.T_e0.toFixed(1)} Ti0 ${s.Ti0.toFixed(1)}/${r.T_i0.toFixed(1)} j0 ${s.j0.toFixed(2)}/${r.j0_MA_m2.toFixed(2)} qmin ${s.qmin.toFixed(2)}/${r.q_min.toFixed(2)} q95 ${s.q95.toFixed(2)}/${r.q95.toFixed(2)} Q ${s.Q.toFixed(2)}/${r.Q_fusion.toFixed(2)} H98 ${s.H98.toFixed(2)}/${r.H98.toFixed(2)} fgw ${s.fgw.toFixed(2)}/${r.fgw_n_e_line_avg.toFixed(2)} PsPl ${s.psolPlh.toFixed(2)}/${(r.P_SOL_total / r.P_LH).toFixed(2)} Pa ${s.Palpha.toFixed(0)}/${(r.P_alpha_total / 1e6).toFixed(0)} Poh ${s.Pohm.toFixed(1)}/${(r.P_ohmic_e / 1e6).toFixed(1)} bN ${s.betaN.toFixed(2)}/${r.beta_N.toFixed(2)}`);
  }
}
const args = process.argv.slice(2);
let best = {};
if (args[0] === "--over") best = JSON.parse(args[1]);
if (args.includes("--fit")) {
  const n = +args[args.indexOf("--fit") + 1] || 200;
  const KEYS = PHYS ? { TpedL: [0.15, 0.6], tauN: [3, 30], plhCal: [1.0, 1.5] } : { chi0: [0.01, 1.5], chiS: [0.005, 0.5], kc: [2, 14], gbExp: [0, 2], cNBI: [0.002, 0.01], fL: [0.5, 0.8], tauN: [5, 30], pedRise: [2, 6], cBS: [0.2, 1.5], eccdEff: [0.0002, 0.003], cTrap: [0.5, 1.8], etaMul: [0.2, 3], fChiI: [0.5, 3], nbiToE: [0.3, 0.9], alphaToE: [0.5, 0.9], cRad: [0, 1], dil: [0.7, 0.95], sPol: [0.8, 2.0], g0: [1.3, 2.0], g2: [1.2, 2.4] };
  const base = { ...M.DEFAULTS, ...BASE, ...best };
  let bestE = errors(best);
  let cur = { ...best };
  for (let i = 0; i < n; i++) {
    const cand = { ...cur };
    const ks = Object.keys(KEYS).sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
    for (const k of ks) {
      const [lo, hi] = KEYS[k];
      const v = cand[k] !== undefined ? cand[k] : base[k];
      cand[k] = +Math.min(hi, Math.max(lo, v * Math.exp(0.25 * (Math.random() * 2 - 1)))).toPrecision(3);
    }
    const e = errors(cand);
    if (e < bestE) {
      bestE = e;
      cur = cand;
      console.log(i, e.toFixed(3), JSON.stringify(cur));
    }
  }
  best = cur;
}
console.log("total", errors(best, true).toFixed(3));
if (args.includes("--show")) for (const k of Object.keys(data)) show(best, k, [1, 10, 30, 50, 80, 99, 101, 103, 106, 110, 120, 150]);
if (PHYS && args.includes("--table")) {
  // the model card's table: each physics preset's recorded actions, as the Lab replays them from lab.json
  const LAB = JSON.parse(fs.readFileSync("docs/assets/widgets/lab.json", "utf8"));
  const first = (arr, f) => { const i = arr.findIndex(f); return i < 0 ? "–" : i + 1; };
  console.log("| Episode (recorded actions) | TORAX return | Lab return | H-mode from (TORAX / Lab) | q_min < 1 from | lowest l_i to 100 s | T_e(0) [keV] | Q | f_GW |\n|---|---|---|---|---|---|---|---|---|");
  for (const [, e] of Object.entries(LAB).filter(([k]) => k.startsWith("phys_"))) {
    const acts = e.actions.Ip.map((ip, t) => ({ Ip: ip * 1e6, nbi: e.actions.nbi[t] * 1e6, ecrh: e.actions.ecrh[t] * 1e6 }));
    const sim = M.runEpisode({ ...M.PHYSICS, ...best }, (t) => acts[Math.min(t, acts.length - 1)], acts.length);
    const sc = M.scoreEpisode(sim, M.REWARD_PRESETS.physics);
    const T = e.torax, n = T.Ip.length, s = sim[sim.length - 1], end = sc.why ? "–" : null;
    const liT = Math.min(...T.li.slice(0, 100)), liL = Math.min(...sim.filter((d) => d.t <= 100).map((d) => d.li));
    const lab = sc.why ? `${sc.ret.toFixed(2)} (ends at ${sc.endT} s, ${sc.why.split(" at")[0]})` : sc.ret.toFixed(2);
    const hT = first(T.mode, (m) => m === 1 || m === 2), hL = first(sim, (d) => d.mode === 1 || d.mode === 2);
    console.log(`| ${e.label} | ${e.benchmark.toFixed(2)} | ${lab} | ${hT} / ${hL} | ${first(T.qmin, (v) => v < 1)} / ${first(sim, (d) => d.qmin < 1)} | ${liT.toFixed(2)} / ${liL.toFixed(2)} | ${T.Te0[n - 1].toFixed(1)} / ${end ?? s.Te0.toFixed(1)} | ${T.Q[n - 1].toFixed(1)} / ${end ?? s.Q.toFixed(1)} | ${T.fgw[n - 1].toFixed(2)} / ${end ?? s.fgw.toFixed(2)} |`);
  }
}
