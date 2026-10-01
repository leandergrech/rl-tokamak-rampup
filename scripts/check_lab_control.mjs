// Check the Lab's controllers (docs/javascripts/lab-control.js) against the Python side, then report how each
// exported policy behaves as a live feedback controller on the Lab model.
//   node scripts/check_lab_control.mjs [torax_fixture.json]
//
// 1. every exported network reproduces the PyTorch actions stored with it (max |difference| < 1e-4);
// 2. the PI port, fed the recorded TORAX j(0) sequence, reproduces the recorded PI I_p commands;
// 3. (with a fixture written from a TORAX episode) the observation vector built from TORAX quantities matches
//    src/rl_tokamak/env.py feature for feature;
// 4. for each policy: its recorded actions vs what it would command on the Lab state the replay produces
//    (how far the Lab's observations are from TORAX's, seen through the policy), and its live closed-loop
//    episode on the Lab next to its TORAX scores.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("../docs/javascripts/tokamak-model.js");
const C = require("../docs/javascripts/lab-control.js");

const LAB = JSON.parse(fs.readFileSync("docs/assets/widgets/lab.json", "utf8"));
const DIR = "docs/assets/widgets/policies";
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failed++;
};

// 1. networks
const specs = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8"))) : [];
for (const s of specs) ok(C.selfCheck(s) < 1e-4, `${s.key}: JS forward pass vs PyTorch, max |da| = ${C.selfCheck(s).toExponential(1)}`);

// 2. PI port on the recorded TORAX measurements
const fixture = process.argv[2] && fs.existsSync(process.argv[2]) ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : null;
if (fixture && LAB.pi) {
  const pi = C.makePI();
  const j0 = [fixture[0].j0, ...LAB.pi.torax.j0]; // MA/m^2 before each action
  let worst = 0;
  LAB.pi.actions.Ip.forEach((ip, t) => (worst = Math.max(worst, Math.abs(pi.act(j0[t] * 1e6).Ip / 1e6 - ip))));
  ok(worst < 1e-3, `PI port vs recorded TORAX PI commands: max |dI_p| = ${worst.toExponential(1)} MA`);
}

// 3. observation vector from TORAX quantities
if (fixture) {
  const ref = specs[0];
  let worst = 0, where = "";
  for (const r of fixture) {
    const x = C.normalise(C.rawFeatures(r), ref.obs);
    x.forEach((v, i) => {
      const d = Math.abs(v - r.x[i]);
      if (d > worst) [worst, where] = [d, `${C.FEATURE_NAMES[i]} at t = ${r.t}`];
    });
  }
  ok(worst < 2e-3, `observation built in JS vs env.py on TORAX states: max |dx| = ${worst.toExponential(1)} (${where})`);
}

// 4. policies on the Lab
const AUD = M.REWARD_PRESETS.audited, BEN = M.REWARD_PRESETS.benchmark;
const score = (recs, cfg) => M.scoreEpisode(recs, cfg).ret;
for (const s of specs) {
  const rec = LAB[s.key];
  const ctrl = C.learnedController(s);
  if (rec) {
    // replay the recorded TORAX actions on the Lab and ask the policy what it would have done at each state
    const m = M.create();
    let d = m.state.last;
    ctrl.reset();
    const err = [0, 0, 0];
    rec.actions.Ip.forEach((ip, t) => {
      const a = ctrl.act(d);
      err[0] += Math.abs(a.Ip / 1e6 - ip) / rec.actions.Ip.length;
      err[1] += Math.abs(a.nbi / 1e6 - rec.actions.nbi[t]) / rec.actions.Ip.length;
      err[2] += Math.abs(a.ecrh / 1e6 - rec.actions.ecrh[t]) / rec.actions.Ip.length;
      d = m.step({ Ip: ip * 1e6, nbi: rec.actions.nbi[t] * 1e6, ecrh: rec.actions.ecrh[t] * 1e6 });
    });
    console.log(`     ${s.key}: on the replayed Lab states it would command |dI_p| ${err[0].toFixed(2)} MA, |dP_NBI| ${err[1].toFixed(1)} MW, |dP_ECRH| ${err[2].toFixed(1)} MW from the recording (mean)`);
  }
  const recs = M.runEpisode({}, (t, last) => {
    if (t === 0) ctrl.reset();
    return ctrl.act(last);
  });
  const tor = rec ? ` | TORAX benchmark ${rec.benchmark.toFixed(2)}` : "";
  console.log(`     ${s.key}: live on the Lab: benchmark ${score(recs, BEN).toFixed(2)}, audited ${score(recs, AUD).toFixed(2)}, I_p end ${recs[recs.length - 1].Ip.toFixed(1)} MA${tor}`);
}
// PI live on the Lab, through lab-control.js and through tokamak-model.js's own copy
{
  const ctrl = C.piController();
  const a = M.runEpisode({}, (t, last) => (t === 0 && ctrl.reset(), ctrl.act(last)));
  const b = M.runEpisode({}, M.POLICIES.pi());
  ok(Math.abs(score(a, BEN) - score(b, BEN)) < 1e-9, `PI live on the Lab: benchmark ${score(a, BEN).toFixed(2)}, audited ${score(a, AUD).toFixed(2)} (same as tokamak-model.js's PI)`);
}
// 5. robustness on the Lab: audited score when the transport is perturbed, recorded knobs (open loop) vs live
if (process.argv.includes("--robustness")) {
  const MULS = [0.7, 1, 1.5];
  const rows = [];
  const live = (key) => (key === "pi" ? C.piController() : specs.find((s) => s.key === key) && C.learnedController(specs.find((s) => s.key === key)));
  for (const [key, e] of Object.entries(LAB)) {
    const acts = e.actions.Ip.map((ip, t) => ({ Ip: ip * 1e6, nbi: e.actions.nbi[t] * 1e6, ecrh: e.actions.ecrh[t] * 1e6 }));
    const rec = MULS.map((m) => score(M.runEpisode({ transportMul: m }, (t) => acts[Math.min(t, acts.length - 1)]), AUD));
    const ctrl = live(key);
    const lv = ctrl ? MULS.map((m) => score(M.runEpisode({ transportMul: m }, (t, last) => (t === 0 && ctrl.reset(), ctrl.act(last))), AUD)) : null;
    rows.push(`| ${e.label} | ${rec.map((v) => v.toFixed(2)).join(" | ")} | ${lv ? lv.map((v) => v.toFixed(2)).join(" | ") : "– | – | –"} |`);
  }
  console.log(`\n| Episode | recorded knobs, transport × ${MULS.join(" | × ")} | live controller, × ${MULS.join(" | × ")} |\n|---|${"---|".repeat(6)}`);
  console.log(rows.join("\n"));
}
process.exit(failed ? 1 : 0);
