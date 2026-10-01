/* Controllers for the Ramp-up Lab: what turns the knobs.
 *
 *   open loop  a schedule: the knobs are a function of the clock only, so they are the same on any plasma
 *   feedback   the knobs are a function of measurements, so they change when the plasma does
 *
 * The PI controller mirrors src/rl_tokamak/controllers.py line by line. Learned policies run their exported actor
 * networks (scripts/export_lab_policies.py) on observation vectors built from the Lab's state the way
 * src/rl_tokamak/env.py builds them from TORAX's (observation set "profiles"); residual policies add their
 * correction to the PI controller's proposal as src/rl_tokamak/residual.py does.
 * Works in the browser (window.RTControl) and in Node (scripts/check_lab_control.mjs checks it against PyTorch).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RTControl = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const IP_START = 3e6, IP_RAMP = 0.2e6, IP_MAX = 15e6, NBI_MAX = 33e6, ECRH_MAX = 20e6;
  const HEAT_ON_STEP = 99, RAMP_END = 100, HORIZON = 151;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const jTarget = (t) => 0.2e6 + 0.4e6 + (1.4e6 * t) / 100; // A/m^2, the PI's reference for j(0)

  // ------------------------------------------------------------------ PI (controllers.PIController)
  function makePI(kp = 0.7, ki = 34.257, ipMin = 1e3, ipMax = IP_MAX) {
    const pi = { kp, ki, step: 0, integral: 0, ip: 0 };
    pi.reset = () => Object.assign(pi, { step: 0, integral: 0, ip: 0 });
    // j0: measured central current density [A/m^2]. Returns the action dict and what the controller saw.
    pi.act = (j0) => {
      const t = pi.step;
      let sig = null;
      if (t < RAMP_END) {
        const target = jTarget(t), error = target - j0;
        const desired = IP_START + pi.kp * error + pi.ki * pi.integral;
        let limited = desired, rampLimited = false;
        if (t > 0 && Math.abs(desired - pi.ip) > IP_RAMP) {
          rampLimited = true;
          limited = pi.ip + Math.sign(desired - pi.ip) * IP_RAMP;
        }
        const fin = clamp(limited, ipMin, ipMax);
        const powerLimited = fin !== limited;
        if (powerLimited && rampLimited && Math.abs(fin - pi.ip) < IP_RAMP) rampLimited = false;
        if (!(rampLimited || powerLimited)) pi.integral += error;
        pi.ip = fin;
        sig = { j0, target, error, integral: pi.integral, desired, sat: rampLimited ? "ramp" : powerLimited ? "limit" : null };
      }
      const on = t >= HEAT_ON_STEP;
      pi.step += 1;
      return { Ip: pi.ip, nbi: on ? 33e6 : 0, ecrh: on ? 20e6 : 0, sig };
    };
    return pi;
  }

  // ------------------------------------------------------------------ observation (env.extract_features, "profiles")
  const PROFILE_IDX = [0, 4, 8, 13, 17, 21, 25];
  const CELL = [0, ...Array.from({ length: 25 }, (_, k) => (k + 0.5) / 25), 1]; // TORAX cell grid + boundaries
  const FACE = Array.from({ length: 26 }, (_, k) => k / 25);
  const RHO_CELL = PROFILE_IDX.map((i) => CELL[Math.min(i, CELL.length - 1)]);
  const RHO_FACE = PROFILE_IDX.map((i) => FACE[Math.min(i, FACE.length - 1)]);
  const SCALARS = [
    ["q95", "q95", 1], ["q_min", "qmin", 1], ["rho_q_min", "rhoQmin", 1], ["beta_N", "betaN", 1], ["H98", "H98", 1],
    ["Q_fusion", "Q", 1], ["li3", "li", 1], ["fgw_n_e_line_avg", "fgw", 1], ["n_e_line_avg", "nbar", 1e20],
    ["T_e_volume_avg", "TeVol", 1], ["T_i_volume_avg", "TiVol", 1], ["W_thermal_total", "W", 1], ["tau_E", "tauE", 1],
    ["v_loop_lcfs", "Vloop", 1], ["I_bootstrap", "Ibs", 1e6], ["P_ohmic_e", "Pohm", 1e6], ["P_SOL_total", "Psol", 1e6],
    ["P_LH", "PLH", 1e6],
  ];
  const PROFILES = [["T_e", "Te", 1, RHO_CELL], ["T_i", "Ti", 1, RHO_CELL], ["n_e", "n", 1e20, RHO_CELL], ["q", "q", 1, RHO_FACE], ["j_total", "j", 1e6, RHO_CELL]];
  const FEATURE_NAMES = ["t", "I_p (applied)", "P_NBI (applied)", "P_ECRH (applied)", ...SCALARS.map((s) => s[0]), "T_e(0)", "T_i(0)", "j(0)",
    ...PROFILES.flatMap(([n, , , rh]) => rh.map((r) => `${n}(${r.toFixed(2)})`))];
  const RESIDUAL_NAMES = ["PI: I_p rate", "PI: P_NBI", "PI: P_ECRH", "PI: integral"];

  function interpOn(arr, grid, x) {
    const n = arr.length;
    if (!grid) grid = Array.from({ length: n }, (_, i) => i / (n - 1));
    if (x <= grid[0]) return arr[0];
    for (let i = 1; i < n; i++)
      if (x <= grid[i]) return arr[i - 1] + ((arr[i] - arr[i - 1]) * (x - grid[i - 1])) / (grid[i] - grid[i - 1] || 1);
    return arr[n - 1];
  }
  // d: Lab diagnostics (tokamak-model.js) after d.t steps; d.grid optionally gives each profile's rho grid.
  function rawFeatures(d) {
    const x = [d.t / (HORIZON - 1), (d.Ip * 1e6) / IP_MAX, (d.Pnbi * 1e6) / NBI_MAX, (d.Pecrh * 1e6) / ECRH_MAX];
    for (const [, k, u] of SCALARS) x.push(d[k] * u);
    x.push(d.Te0, d.Ti0, d.j0 * 1e6);
    for (const [, k, u, rh] of PROFILES) for (const r of rh) x.push(interpOn(d.prof[k], d.grid && d.grid[k], r) * u);
    return x.map((v) => (isFinite(v) ? v : 0));
  }
  function normalise(raw, obs) {
    return raw.map((v, i) => clamp((v - obs.mean[i]) / obs.std[i], -obs.clip, obs.clip) || 0);
  }

  // ------------------------------------------------------------------ networks
  function forward(spec, x) {
    let h = spec.in_mu ? x.map((v, i) => (v - spec.in_mu[i]) / spec.in_sd[i]) : x.slice();
    const L = spec.layers;
    for (let l = 0; l < L.length; l++) {
      const { W, b, out } = L[l], inp = h.length, y = new Array(out);
      for (let o = 0; o < out; o++) {
        let s = b[o];
        for (let i = 0, r = o * inp; i < inp; i++) s += W[r + i] * h[i];
        y[o] = l < L.length - 1 ? (spec.act === "tanh" ? Math.tanh(s) : Math.max(0, s)) : s;
      }
      h = y;
    }
    return h.map((v) => (spec.out === "tanh" ? Math.tanh(v) : clamp(v, -1, 1)));
  }

  // ------------------------------------------------------------------ controllers
  // Interface: {kind: "open" | "feedback", reads, reset(), act(d) -> {Ip [A], nbi [W], ecrh [W], info}}
  // d is the Lab state after d.t seconds; the returned action is applied during the next second.
  function toPhysical(a, ipNow, ipMin) {
    return {
      Ip: clamp(ipNow + a[0] * IP_RAMP, ipMin, IP_MAX),
      nbi: ((clamp(a[1], -1, 1) + 1) / 2) * NBI_MAX,
      ecrh: ((clamp(a[2], -1, 1) + 1) / 2) * ECRH_MAX,
    };
  }
  function fromPhysical(act, ipNow) {
    return [clamp((act.Ip - ipNow) / IP_RAMP, -1, 1), (2 * act.nbi) / NBI_MAX - 1, (2 * act.ecrh) / ECRH_MAX - 1];
  }

  function piController() {
    const pi = makePI();
    return {
      kind: "feedback",
      reads: "j(0), the central current density",
      reset: () => pi.reset(),
      act(d) {
        const a = pi.act(d.j0 * 1e6);
        return { Ip: a.Ip, nbi: a.nbi, ecrh: a.ecrh, info: { pi: a.sig } };
      },
    };
  }

  function learnedController(spec) {
    const res = spec.action.residual, pi = res ? makePI() : null;
    return {
      kind: "feedback",
      reads: `${spec.obs_dim} numbers: time, the last action, 18 scalars and 5 profiles at 7 radii`,
      reset: () => pi && pi.reset(),
      act(d) {
        const ipNow = d.Ip * 1e6;
        let x = normalise(rawFeatures(d), spec.obs);
        let base = null, sig = null;
        if (res) {
          pi.ip = ipNow; // rate-limit against the applied current (residual.py)
          const p = pi.act(d.j0 * 1e6);
          sig = p.sig;
          base = fromPhysical(p, ipNow);
          x = x.concat(base, [(pi.ki * pi.integral) / 1e7]);
        }
        const u = forward(spec, x);
        const total = res ? u.map((v, i) => clamp(base[i] + res.scale[i] * v, -1, 1)) : u;
        const act = toPhysical(total, ipNow, spec.action.ip_min);
        return { ...act, info: { x, u, base, total, pi: sig, scale: res ? res.scale : null } };
      },
    };
  }

  function scheduleController(fn) {
    return { kind: "open", reads: "the clock", reset() {}, act: (d) => ({ ...fn(d.t), info: null }) };
  }

  // check exported networks against the PyTorch actions stored with them; returns the worst |difference|
  function selfCheck(spec) {
    let worst = 0;
    for (const c of spec.check || []) {
      const a = forward(spec, c.x);
      a.forEach((v, i) => (worst = Math.max(worst, Math.abs(v - c.a[i]))));
    }
    return worst;
  }

  return {
    makePI, piController, learnedController, scheduleController, rawFeatures, normalise, forward, selfCheck, jTarget,
    FEATURE_NAMES, RESIDUAL_NAMES, IP_RAMP, NBI_MAX, ECRH_MAX, IP_MAX, HEAT_ON_STEP, RAMP_END,
  };
});
