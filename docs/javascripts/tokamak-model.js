/* Reduced ramp-up model for the primer's interactive Lab ("toy TORAX").
 *
 * One radial dimension, an ITER-sized elongated cylinder, the same actuators and the same reward as
 * Gym-TORAX's IterHybridEnv, and roughly TORAX-like numbers. It is a teaching model, not a simulator:
 * every equation is listed in docs/primer/equations.md together with what TORAX does instead, and the
 * constants were fitted to this repo's TORAX episodes (scripts/calibrate_lab_model.mjs).
 *
 * State (on nodes rho_j = j/N, j = 0..N):
 *   I[j]   enclosed plasma current [A]                -> j(rho), q(rho)
 *   Te[j]  electron temperature [keV]                 (solved on rho <= rho_ped, pedestal is a boundary value)
 *   Ti[j]  ion temperature [keV]
 *   nbar   line-averaged electron density [1e20 m^-3] (0-D, relaxes to a Greenwald-scaled target)
 *   hped   pedestal state 0 (L-mode) .. 1 (H-mode)
 *
 * Works in the browser (window.RTModel) and in Node (module.exports) so it can be calibrated offline.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RTModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MU0 = 4e-7 * Math.PI;
  const KEV = 1.602176634e-16; // J per keV
  const E_FUS = 17.59e3 * KEV; // J per D-T reaction
  const E_ALPHA = 3.52e3 * KEV;

  const DEFAULTS = {
    // machine (ITER-like, as in the Gym-TORAX config)
    R: 6.2, a: 2.0, B: 5.3, kappa: 1.7, M: 2.5,
    // numerics
    N: 50, substeps: 4,
    // geometry factor in q = G(rho) * 2 pi r^2 B / (mu0 R I(r)); G ~ (1 + kappa^2)/2 with triangularity
    g0: 1.79, g2: 1.49, sPol: 1.04,
    // resistivity: Spitzer x neoclassical trapped-particle correction
    Zeff: 1.6, lnL: 17, cTrap: 1.27, etaMul: 0.62,
    // heat transport: chi = mul * [chi0 + chiS * T^gbExp * (R/L_T - kc)^+] (+ core / edge patches)
    chi0: 0.0685, chiS: 0.15, kc: 7.45, gbExp: 1.43, chiCore: 1.0, rhoCore: 0.1, chiPer: 3.0, fChiI: 1.58, transportMul: 1.0,
    // pedestal: T(rho_ped) boundary value, L-mode and H-mode heights
    rhoPed: 0.91, TpedL: 0.5, TpedH: 3.0, Tedge: 0.2,
    pedMode: "scheduled", pedOn: 100, pedRise: 2, pedTau: 2.0, pedHyst: 0.8,
    // density: d nbar/dt = (target - nbar)/tauN, target = f(h) n_G(Ip) + cNBI * P_NBI[MW]
    fL: 0.603, fH: 1.0, cNBI: 0.00928, tauN: 21.6, dil: 0.95, nPeak: 0.35,
    // heating and current drive
    nbiLoc: 0.25, nbiWidth: 0.25, ecrhLoc: 0.35, ecrhWidth: 0.05,
    nbiCD: 1e6 / 16e6, // A per W (the open-loop code's 1 MA per 16 MW)
    eccdEff: 0.000852, // A per W per (keV / 1e20 m^-3), T/n capped at 15
    nbiToE: 0.9, alphaToE: 0.616, cRad: 0.0696, cBS: 0.343,
    // optional physics
    sawtooth: false, sawPeriod: 6,
    // initial state
    Ip0: 3.0e6, Te0init: 3.7, nbar0: 0.222, jPeak0: 1.92,
  };

  // ------------------------------------------------------------------ physics helpers
  function sigmavDT(T) {
    // Bosch & Hale (1992) D-T reactivity, T in keV, returns m^3/s
    if (T < 0.2) return 0;
    const BG = 34.3827, mrc2 = 1124656, C1 = 1.17302e-9, C2 = 1.51361e-2, C3 = 7.51886e-2, C4 = 4.60643e-3,
      C5 = 1.35e-2, C6 = -1.0675e-4, C7 = 1.366e-5;
    const Tc = Math.min(T, 100);
    const th = Tc / (1 - (Tc * (C2 + Tc * (C4 + Tc * C6))) / (1 + Tc * (C3 + Tc * (C5 + Tc * C7))));
    const xi = Math.cbrt((BG * BG) / (4 * th));
    return C1 * th * Math.sqrt(xi / (mrc2 * Tc * Tc * Tc)) * Math.exp(-3 * xi) * 1e-6;
  }
  const greenwald = (IpMA, a) => IpMA / (Math.PI * a * a); // 1e20 m^-3
  function tauIPB98(IpMA, B, n19, PMW, R, kappa, eps, M) {
    return 0.0562 * Math.pow(IpMA, 0.93) * Math.pow(B, 0.15) * Math.pow(n19, 0.41) * Math.pow(Math.max(PMW, 1e-3), -0.69) *
      Math.pow(R, 1.97) * Math.pow(kappa, 0.78) * Math.pow(eps, 0.58) * Math.pow(M, 0.19);
  }
  function pLH(n20, B, S) {
    // Martin (2008) threshold, MW, with the low-density branch held at its minimum
    return 0.0488 * Math.pow(Math.max(n20, 0.25), 0.717) * Math.pow(B, 0.803) * Math.pow(S, 0.941);
  }

  function tridiag(a, b, c, d, n) {
    // solves a[i] x[i-1] + b[i] x[i] + c[i] x[i+1] = d[i], i = 0..n-1 (in place on b, d)
    for (let i = 1; i < n; i++) {
      const m = a[i] / b[i - 1];
      b[i] -= m * c[i - 1];
      d[i] -= m * d[i - 1];
    }
    const x = new Float64Array(n);
    x[n - 1] = d[n - 1] / b[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = (d[i] - c[i] * x[i + 1]) / b[i];
    return x;
  }

  // ------------------------------------------------------------------ model
  function create(overrides) {
    const p = Object.assign({}, DEFAULTS, overrides || {});
    const N = p.N, a = p.a, R = p.R, dr = a / N;
    const r = Float64Array.from({ length: N + 1 }, (_, j) => j * dr);
    const rho = Float64Array.from({ length: N + 1 }, (_, j) => j / N);
    const rf = Float64Array.from({ length: N }, (_, j) => (j + 0.5) * dr); // faces j+1/2
    const jp = Math.round(p.rhoPed * N);
    const vol = new Float64Array(N + 1); // node control volumes [m^3]
    for (let j = 0; j <= N; j++) {
      const lo = j === 0 ? 0 : r[j] - dr / 2, hi = j === N ? a : r[j] + dr / 2;
      vol[j] = 2 * Math.PI * R * Math.PI * p.kappa * (hi * hi - lo * lo);
    }
    const V = vol.reduce((s, v) => s + v, 0);
    const S = 4 * Math.PI * Math.PI * R * a * Math.sqrt((1 + p.kappa * p.kappa) / 2) * 0.73; // ~ TORAX surface, m^2
    const G = (x) => p.g0 + p.g2 * x * x;
    const nShape = (x) => (1 - p.nPeak * x * x) / (1 - p.nPeak / 3);

    let st;
    function reset() {
      const I = new Float64Array(N + 1), Te = new Float64Array(N + 1), Ti = new Float64Array(N + 1);
      for (let j = 0; j <= N; j++) {
        I[j] = p.Ip0 * (1 - Math.pow(1 - rho[j] * rho[j], p.jPeak0 + 1));
        Te[j] = p.Tedge + (p.Te0init - p.Tedge) * (1 - Math.pow(rho[j], 1.15));
        Ti[j] = Te[j] * 0.97;
      }
      st = {
        t: 0, I, Te, Ti, Ip: p.Ip0, nbar: p.nbar0, hped: 0, chiE: new Float64Array(N), chiI: new Float64Array(N),
        W: 0, flux: 0, sawTimer: 0, crashes: [], last: null, failed: false,
        act: { Ip: p.Ip0, nbi: 0, ecrh: 0, ecrhLoc: p.ecrhLoc, nbiLoc: p.nbiLoc },
      };
      st.W = thermalEnergy();
      st.last = diagnostics(0);
      return st.last;
    }

    // ---------------------------------------------------------- profiles derived from the state
    const nAt = (j) => st.nbar * nShape(rho[j]); // 1e20
    function jProfile(I) {
      const jj = new Float64Array(N + 1);
      for (let j = 1; j < N; j++) jj[j] = (I[j + 1] - I[j - 1]) / (2 * dr) / (2 * Math.PI * p.kappa * r[j]);
      jj[0] = I[1] / (Math.PI * p.kappa * dr * dr);
      jj[N] = (I[N] - I[N - 1]) / dr / (2 * Math.PI * p.kappa * r[N]);
      return jj;
    }
    function qProfile(I, jj) {
      const q = new Float64Array(N + 1);
      for (let j = 1; j <= N; j++) q[j] = (G(rho[j]) * 2 * Math.PI * r[j] * r[j] * p.B) / (MU0 * R * Math.max(I[j], 1));
      q[0] = (G(0) * 2 * p.B) / (MU0 * R * p.kappa * Math.max(jj[0], 1));
      return q;
    }
    function eta(j) {
      const T = Math.max(st.Te[j], 0.05);
      const eps = r[j] / R;
      const neo = Math.max(0.2, 1 - p.cTrap * Math.sqrt(eps));
      return (p.etaMul * 1.65e-9 * p.Zeff * p.lnL) / Math.pow(T, 1.5) / neo;
    }
    const gauss = (x, loc, w) => Math.exp(-((x - loc) * (x - loc)) / (2 * w * w));
    function depositionProfile(loc, w) {
      // Gaussian in rho, normalised so that sum(prof * vol) = 1 (per m^3)
      const prof = new Float64Array(N + 1);
      let s = 0;
      for (let j = 0; j <= N; j++) {
        prof[j] = gauss(rho[j], loc, w);
        s += prof[j] * vol[j];
      }
      for (let j = 0; j <= N; j++) prof[j] /= s || 1;
      return prof;
    }
    function areaProfile(loc, w) {
      // Gaussian in rho normalised so that sum(prof * dA) = 1 (per m^2), for driven current densities
      const prof = new Float64Array(N + 1);
      let s = 0;
      for (let j = 0; j <= N; j++) {
        prof[j] = gauss(rho[j], loc, w);
        s += prof[j] * (vol[j] / (2 * Math.PI * R));
      }
      for (let j = 0; j <= N; j++) prof[j] /= s || 1;
      return prof;
    }
    function bootstrap(q) {
      const jbs = new Float64Array(N + 1);
      for (let j = 1; j < N; j++) {
        const ne = nAt(j) * 1e20, dn = ((nAt(j + 1) - nAt(j - 1)) * 1e20) / (2 * dr);
        const dTe = ((st.Te[j + 1] - st.Te[j - 1]) * KEV) / (2 * dr), dTi = ((st.Ti[j + 1] - st.Ti[j - 1]) * KEV) / (2 * dr);
        const Bth = (r[j] * p.B) / (Math.max(q[j], 0.3) * R);
        const grad = 2.44 * (st.Te[j] + st.Ti[j]) * KEV * dn + 0.69 * ne * dTe - 0.42 * ne * dTi;
        jbs[j] = Math.max(0, (-p.cBS * Math.sqrt(r[j] / R) * grad) / Bth);
      }
      return jbs;
    }
    function pedestalT() {
      return p.TpedL + (p.TpedH - p.TpedL) * st.hped;
    }
    function thermalEnergy() {
      let W = 0;
      for (let j = 0; j <= N; j++) W += 1.5 * nAt(j) * 1e20 * KEV * (st.Te[j] + p.dil * st.Ti[j]) * vol[j];
      return W;
    }

    // ---------------------------------------------------------- one sub-step
    function substep(dt, IpNew, act) {
      const n = Float64Array.from({ length: N + 1 }, (_, j) => nAt(j));
      const jj = jProfile(st.I), q = qProfile(st.I, jj);
      // ---- sources [W/m^3]
      const nbiP = depositionProfile(act.nbiLoc, p.nbiWidth), ecP = depositionProfile(act.ecrhLoc, p.ecrhWidth);
      const nbiA = areaProfile(act.nbiLoc, p.nbiWidth), ecA = areaProfile(act.ecrhLoc, p.ecrhWidth);
      const jEc0 = Math.round(act.ecrhLoc * N);
      const Iec = p.eccdEff * Math.min(Math.max(st.Te[Math.min(jEc0, N)], 0.1) / Math.max(n[Math.min(jEc0, N)], 0.05), 15) * act.ecrh;
      const Inb = p.nbiCD * act.nbi;
      const jbs = bootstrap(q);
      const jni = new Float64Array(N + 1);
      for (let j = 0; j <= N; j++) jni[j] = jbs[j] + Inb * nbiA[j] + Iec * ecA[j];
      const etaN = Float64Array.from({ length: N + 1 }, (_, j) => eta(j));
      const Qe = new Float64Array(N + 1), Qi = new Float64Array(N + 1), kei = new Float64Array(N + 1);
      let Pfus = 0, Pohm = 0, Prad = 0;
      for (let j = 0; j <= N; j++) {
        const ne = n[j] * 1e20, nD = (p.dil * ne) / 2;
        const pf = nD * nD * sigmavDT(st.Ti[j]) * E_FUS;
        const pa = (pf * E_ALPHA) / E_FUS;
        const E = etaN[j] * (jj[j] - jni[j]);
        const poh = Math.max(0, E * jj[j]);
        const prad = p.cRad * 5.35e-37 * p.Zeff * ne * ne * Math.sqrt(Math.max(st.Te[j], 0.01));
        Qe[j] = poh + p.alphaToE * pa + p.nbiToE * act.nbi * nbiP[j] + act.ecrh * ecP[j] - prad;
        Qi[j] = (1 - p.alphaToE) * pa + (1 - p.nbiToE) * act.nbi * nbiP[j];
        const TeEV = Math.max(st.Te[j], 0.05) * 1000;
        const tauEq = (((p.M * 1836) / 2) * 3.44e5 * Math.pow(TeEV, 1.5)) / ((ne / 1e6) * p.lnL);
        kei[j] = (1.5 * ne * KEV) / tauEq; // W/m^3 per keV
        Pfus += pf * vol[j];
        Pohm += poh * vol[j];
        Prad += prad * vol[j];
      }
      // ---- heat transport (implicit, chi lagged and under-relaxed)
      const Tped = pedestalT();
      const solveT = (T, Q, nS, chiArr, mulChi, other, isIon) => {
        const m = jp; // unknowns j = 0..jp-1, T[jp] = Tped
        const A = new Float64Array(m), Bd = new Float64Array(m), C = new Float64Array(m), D = new Float64Array(m);
        const Df = new Float64Array(N);
        for (let f = 0; f < jp; f++) {
          const Tf = Math.max(0.5 * (T[f] + T[f + 1]), 0.05);
          const rlt = (-R * (T[f + 1] - T[f])) / dr / Tf;
          const x = rho[f] + 0.5 / N;
          let chi = p.chi0 + p.chiS * Math.pow(Tf, p.gbExp) * Math.max(0, rlt - p.kc);
          if (x < p.rhoCore) chi = Math.max(chi, p.chiCore);
          chi *= p.transportMul * mulChi;
          chiArr[f] = chiArr[f] > 0 ? 0.5 * chiArr[f] + 0.5 * chi : chi;
          Df[f] = 0.5 * (nS[f] + nS[f + 1]) * 1e20 * KEV * chiArr[f];
        }
        // Pereverzev-style stabilisation (as in TORAX): extra diffusion implicit, removed explicitly
        const Dp = new Float64Array(N);
        for (let f = 0; f < jp; f++) Dp[f] = 0.5 * (nS[f] + nS[f + 1]) * 1e20 * KEV * p.chiPer;
        for (let j = 0; j < m; j++) {
          const c = 1.5 * nS[j] * 1e20 * KEV;
          let lo = 0, hi = 0;
          let plo = 0, phi = 0;
          if (j === 0) {
            hi = (4 * (Df[0] + Dp[0])) / (dr * dr);
            phi = (4 * Dp[0]) / (dr * dr);
          } else {
            lo = (rf[j - 1] * (Df[j - 1] + Dp[j - 1])) / (dr * dr * r[j]);
            hi = (rf[j] * (Df[j] + Dp[j])) / (dr * dr * r[j]);
            plo = (rf[j - 1] * Dp[j - 1]) / (dr * dr * r[j]);
            phi = (rf[j] * Dp[j]) / (dr * dr * r[j]);
          }
          const explicitP = phi * (T[j + 1] - T[j]) - (j > 0 ? plo * (T[j] - T[j - 1]) : 0);
          A[j] = -lo * dt;
          C[j] = -hi * dt;
          Bd[j] = c + (lo + hi + kei[j]) * dt;
          D[j] = c * T[j] + (Q[j] + kei[j] * other[j] - explicitP) * dt;
          if (j === m - 1) D[j] -= C[j] * Tped;
        }
        const x = tridiag(A, Bd, C, D, m);
        const out = new Float64Array(N + 1);
        for (let j = 0; j < m; j++) out[j] = Math.max(0.05, x[j]);
        for (let j = jp; j <= N; j++) out[j] = Tped + ((p.Tedge - Tped) * (rho[j] - rho[jp])) / (1 - rho[jp]);
        return out;
      };
      const nI = Float64Array.from(n, (v) => v * p.dil);
      const TeNew = solveT(st.Te, Qe, n, st.chiE, 1, st.Ti, false);
      const TiNew = solveT(st.Ti, Qi, nI, st.chiI, p.fChiI, TeNew, true);
      // ---- current diffusion (implicit in I)
      const etaF = new Float64Array(N), jniF = new Float64Array(N);
      for (let f = 0; f < N; f++) {
        etaF[f] = 0.5 * (etaN[f] + etaN[f + 1]);
        jniF[f] = 0.5 * (jni[f] + jni[f + 1]);
      }
      const m = N - 1;
      const A = new Float64Array(m), Bd = new Float64Array(m), C = new Float64Array(m), D = new Float64Array(m);
      for (let k = 0; k < m; k++) {
        const j = k + 1;
        const Aj = (2 * Math.PI * r[j] * p.sPol) / (MU0 * dr);
        const gm = etaF[j - 1] / (dr * 2 * Math.PI * p.kappa * rf[j - 1]);
        const gp = etaF[j] / (dr * 2 * Math.PI * p.kappa * rf[j]);
        A[k] = -dt * Aj * gm;
        C[k] = -dt * Aj * gp;
        Bd[k] = 1 + dt * Aj * (gm + gp);
        D[k] = st.I[j] - dt * Aj * (etaF[j] * jniF[j] - etaF[j - 1] * jniF[j - 1]);
        if (j === N - 1) D[k] -= C[k] * IpNew;
      }
      const x = tridiag(A, Bd, C, D, m);
      const Inew = new Float64Array(N + 1);
      Inew[0] = 0;
      for (let k = 0; k < m; k++) Inew[k + 1] = Math.max(0, x[k]);
      Inew[N] = IpNew;
      // edge electric field -> loop voltage
      const jEdge = (Inew[N] - Inew[N - 1]) / dr / (2 * Math.PI * p.kappa * rf[N - 1]);
      const Vloop = 2 * Math.PI * R * etaF[N - 1] * (jEdge - jniF[N - 1]);
      // ---- commit
      st.I = Inew;
      st.Te = TeNew;
      st.Ti = TiNew;
      st.Ip = IpNew;
      st.flux += Vloop * dt;
      // density
      const fT = p.fL + (p.fH - p.fL) * st.hped;
      const nTarget = fT * greenwald(IpNew / 1e6, a) + p.cNBI * (act.nbi / 1e6);
      st.nbar += ((nTarget - st.nbar) * dt) / p.tauN;
      // pedestal
      const Paux = act.nbi + act.ecrh;
      const Palpha = Pfus / 5.03;
      const Psol = Pohm + Paux + Palpha - Prad;
      const PLH = pLH(st.nbar, p.B, S) * 1e6;
      if (p.pedMode === "scheduled") {
        st.hped = Math.min(1, Math.max(0, (st.t + dt - p.pedOn) / p.pedRise));
      } else {
        const on = Psol >= PLH ? 1 : Psol < p.pedHyst * PLH ? 0 : st.hped > 0.5 ? 1 : 0;
        st.hped += ((on - st.hped) * dt) / (on ? p.pedTau : p.pedTau / 2);
        st.hped = Math.min(1, Math.max(0, st.hped));
      }
      // sawteeth (optional)
      st.crashed = false;
      if (p.sawtooth) {
        const q2 = qProfile(st.I, jProfile(st.I));
        st.sawTimer += dt;
        if (q2[0] < 1 && st.sawTimer >= p.sawPeriod) {
          st.sawTimer = 0;
          sawtoothCrash(q2);
        }
      }
      st.t += dt;
      return { Pfus, Pohm, Prad, Paux, Palpha, Psol, PLH, Vloop, Inb, Iec, jbs, jni };
    }

    function sawtoothCrash(q) {
      let j1 = 0;
      for (let j = 1; j <= N; j++)
        if (q[j] >= 1) {
          j1 = j;
          break;
        }
      if (!j1) return;
      const jm = Math.min(Math.round(j1 * Math.SQRT2), jp - 2);
      for (const T of [st.Te, st.Ti]) {
        let e = 0, vv = 0;
        for (let j = 0; j <= jm; j++) {
          e += T[j] * nAt(j) * vol[j];
          vv += nAt(j) * vol[j];
        }
        for (let j = 0; j <= jm; j++) T[j] = e / vv;
      }
      const Im = st.I[jm];
      for (let j = 0; j < jm; j++) st.I[j] = Im * (r[j] / r[jm]) ** 2;
      st.crashes.push(+st.t.toFixed(2));
    }

    // ---------------------------------------------------------- diagnostics for one recorded second
    function diagnostics(t, src) {
      const jj = jProfile(st.I), q = qProfile(st.I, jj);
      let qmin = Infinity, jq = 0;
      for (let j = 0; j <= N; j++)
        if (q[j] < qmin) {
          qmin = q[j];
          jq = j;
        }
      const j95 = Math.round(0.95 * N);
      const W = thermalEnergy();
      const IpMA = st.Ip / 1e6;
      const n19 = st.nbar * 10;
      const s = src || { Pfus: 0, Pohm: 0, Prad: 0, Paux: 0, Palpha: 0, Psol: 0, PLH: pLH(st.nbar, p.B, S) * 1e6, Vloop: 0, Inb: 0, Iec: 0, jbs: new Float64Array(N + 1), jni: new Float64Array(N + 1) };
      const dWdt = st.last ? (W - st.last.W) / Math.max(1e-6, t - st.last.t) : 0;
      const Pheat = s.Pohm + s.Paux + s.Palpha;
      const Ploss = Math.max(Pheat - dWdt, 1e5);
      const tauE = W / Ploss;
      const tau98 = tauIPB98(IpMA, p.B, n19, Ploss / 1e6, R, p.kappa, a / R, p.M);
      const pAvg = W / (1.5 * V);
      const betaT = (2 * MU0 * pAvg) / (p.B * p.B) * 100;
      // internal inductance li(3)-like, cylinder: 2 * int(Bth^2 dV) / (mu0^2 Ip^2 R) ... normalised
      let num = 0;
      for (let j = 1; j <= N; j++) {
        const Bth = (MU0 * st.I[j]) / (2 * Math.PI * r[j] * p.sPol);
        num += Bth * Bth * vol[j];
      }
      const BthA = (MU0 * st.Ip) / (2 * Math.PI * a * p.sPol);
      const li = num / (BthA * BthA * V);
      let Ibs = 0;
      for (let j = 0; j <= N; j++) Ibs += s.jbs[j] * (vol[j] / (2 * Math.PI * R));
      const Qfus = s.Pfus / Math.max(s.Paux + s.Pohm, 1e5);
      const fgw = st.nbar / greenwald(IpMA, a);
      return {
        t, Ip: IpMA, Pnbi: st.act.nbi / 1e6, Pecrh: st.act.ecrh / 1e6, ecrhLoc: st.act.ecrhLoc,
        Te0: st.Te[0], Ti0: st.Ti[0], j0: jj[0] / 1e6, qmin, rhoQmin: rho[jq], q95: q[j95], q0: q[0],
        Q: Qfus, H98: tauE / tau98, tauE, tau98, W, fgw, nbar: st.nbar, Pfus: s.Pfus / 1e6, Palpha: s.Palpha / 1e6,
        Pohm: s.Pohm / 1e6, Prad: s.Prad / 1e6, Paux: s.Paux / 1e6, Psol: s.Psol / 1e6, PLH: s.PLH / 1e6,
        psolPlh: s.Psol / s.PLH, betaN: (betaT * a * p.B) / Math.max(IpMA, 0.1), li, Vloop: s.Vloop, flux: st.flux,
        Ibs: Ibs / 1e6, Inb: s.Inb / 1e6, Iec: s.Iec / 1e6, hped: st.hped, Tped: pedestalT(), crashes: st.crashes.length,
        prof: {
          Te: Array.from(st.Te), Ti: Array.from(st.Ti), j: Array.from(jj, (v) => v / 1e6), q: Array.from(q),
          jni: Array.from(s.jni, (v) => v / 1e6), jbs: Array.from(s.jbs, (v) => v / 1e6),
          n: Array.from({ length: N + 1 }, (_, j) => nAt(j)),
        },
      };
    }

    // ---------------------------------------------------------- one action second (Gym-TORAX step)
    function step(action) {
      // action: {Ip [A] set-point (rate-limited here), nbi [W], ecrh [W], ecrhLoc?, nbiLoc?}
      const target = Math.min(15e6, Math.max(3e6, action.Ip));
      const IpEnd = Math.min(st.Ip + 0.2e6, Math.max(st.Ip - 0.2e6, target));
      st.act = {
        Ip: IpEnd,
        nbi: Math.min(33e6, Math.max(0, action.nbi || 0)),
        ecrh: Math.min(20e6, Math.max(0, action.ecrh || 0)),
        ecrhLoc: action.ecrhLoc !== undefined ? action.ecrhLoc : p.ecrhLoc,
        nbiLoc: action.nbiLoc !== undefined ? action.nbiLoc : p.nbiLoc,
      };
      const ns = p.substeps, dt = 1 / ns, Ip0 = st.Ip;
      let src;
      for (let k = 1; k <= ns; k++) src = substep(dt, Ip0 + ((IpEnd - Ip0) * k) / ns, st.act);
      const d = diagnostics(Math.round(st.t), src);
      if (!isFinite(d.Te0) || !isFinite(d.qmin)) {
        st.failed = true;
        d.failed = true;
      }
      st.last = d;
      return d;
    }

    function snapshot() {
      return JSON.parse(JSON.stringify({ ...st, I: Array.from(st.I), Te: Array.from(st.Te), Ti: Array.from(st.Ti), chiE: Array.from(st.chiE), chiI: Array.from(st.chiI) }));
    }
    function restore(s) {
      st = JSON.parse(JSON.stringify(s));
      st.I = Float64Array.from(s.I);
      st.Te = Float64Array.from(s.Te);
      st.Ti = Float64Array.from(s.Ti);
      st.chiE = Float64Array.from(s.chiE);
      st.chiI = Float64Array.from(s.chiI);
    }

    reset();
    return { params: p, rho: Array.from(rho), reset, step, snapshot, restore, get state() { return st; }, volume: V };
  }

  // ------------------------------------------------------------------ rewards (pure functions of a record)
  const REWARD_PRESETS = {
    benchmark: { label: "IterHybrid-v0 (benchmark)", qCap: Infinity, gate: "temp", wQ: 1 / 50, wH: 1 / 50, wQmin: 1 / 150, wQ95: 1 / 150, pFgw: 0, pQmin: 0, pFlux: 0, fluxBudget: Infinity, endFgw: Infinity, endQ95: 0, endPenalty: -1000 },
    audited: { label: "Audited (Q ≤ 10, P_SOL ≥ P_LH)", qCap: 10, gate: "temp+plh", wQ: 1 / 50, wH: 1 / 50, wQmin: 1 / 150, wQ95: 1 / 150, pFgw: 0, pQmin: 0, pFlux: 0, fluxBudget: Infinity, endFgw: Infinity, endQ95: 0, endPenalty: -1000 },
  };
  function rewardTerms(d, cfg) {
    let gated = d.Te0 > 10 && d.Ti0 > 10;
    if (cfg.gate === "temp+plh") gated = gated && d.psolPlh >= 1;
    if (cfg.gate === "pedestal") gated = d.hped > 0.5 && d.psolPlh >= 1;
    const terms = {
      fusion: gated ? (cfg.wQ * Math.min(d.Q, cfg.qCap)) / 10 : 0,
      h98: gated ? cfg.wH * Math.min(d.H98, 1) : 0,
      qmin: cfg.wQmin * Math.min(d.qmin, 1),
      q95: cfg.wQ95 * Math.min(d.q95 / 3, 1),
      penalty: -(cfg.pFgw * Math.max(0, d.fgw - 1) + cfg.pQmin * Math.max(0, 1 - d.qmin) + (cfg.pFlux && d.flux > cfg.fluxBudget ? cfg.pFlux : 0)),
    };
    terms.total = terms.fusion + terms.h98 + terms.qmin + terms.q95 + terms.penalty;
    return terms;
  }
  function scoreEpisode(records, cfg) {
    // records: list of per-second diagnostics (t = 1..). Applies termination rules post hoc.
    let ret = 0, endT = null, why = null;
    const per = [];
    for (const d of records) {
      if (d.failed) {
        ret += cfg.endPenalty;
        per.push({ total: cfg.endPenalty, fusion: 0, h98: 0, qmin: 0, q95: 0, penalty: cfg.endPenalty });
        endT = d.t;
        why = "numerical failure";
        break;
      }
      if (d.fgw > cfg.endFgw || d.q95 < cfg.endQ95) {
        ret += cfg.endPenalty;
        per.push({ total: cfg.endPenalty, fusion: 0, h98: 0, qmin: 0, q95: 0, penalty: cfg.endPenalty });
        endT = d.t;
        why = d.fgw > cfg.endFgw ? `Greenwald fraction ${d.fgw.toFixed(2)} > ${cfg.endFgw}` : `q95 ${d.q95.toFixed(2)} < ${cfg.endQ95}`;
        break;
      }
      const tr = rewardTerms(d, cfg);
      ret += tr.total;
      per.push(tr);
    }
    return { ret, per, endT, why };
  }

  // ------------------------------------------------------------------ reference policies (on the model)
  const POLICIES = {
    openLoop: () => (t) => ({ Ip: t < 99 ? 3e6 + ((t + 1) * 9.5e6) / 100 : 12.5e6, nbi: t >= 99 ? 33e6 : 0, ecrh: t >= 99 ? 20e6 : 0 }),
    pi: (kp = 0.7, ki = 34.257) => {
      let integ = 0, ip = 0;
      return (t, last) => {
        if (t < 100) {
          const target = 0.2e6 + 0.4e6 + (1.4e6 * t) / 100;
          const err = target - last.j0 * 1e6;
          const desired = 3e6 + kp * err + ki * integ;
          let lim = desired, rl = false;
          if (t > 0 && Math.abs(desired - ip) > 0.2e6) {
            rl = true;
            lim = ip + Math.sign(desired - ip) * 0.2e6;
          }
          const fin = Math.min(15e6, Math.max(1e3, lim));
          if (!(rl || fin !== lim)) integ += err;
          ip = fin;
        }
        return { Ip: ip, nbi: t >= 99 ? 33e6 : 0, ecrh: t >= 99 ? 20e6 : 0 };
      };
    },
  };

  function runEpisode(overrides, policy, steps) {
    const m = create(overrides);
    const recs = [];
    let last = m.state.last;
    for (let t = 0; t < (steps || 151); t++) {
      last = m.step(policy(t, last));
      recs.push(last);
      if (last.failed) break;
    }
    return recs;
  }

  return { create, DEFAULTS, REWARD_PRESETS, rewardTerms, scoreEpisode, POLICIES, runEpisode, sigmavDT, tauIPB98, pLH, greenwald, MU0 };
});
