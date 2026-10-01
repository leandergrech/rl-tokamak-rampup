/* Primer widgets built on the reduced ramp-up model (tokamak-model.js):
 *   lab      the Ramp-up Lab: presets that replay recorded TORAX actions, a sandbox you drive, a benchmark designer
 *   machine  the tokamak as a 3D picture: coils, plasma current, field lines, actuators
 *   power    0-D power balance: heating vs losses, fusion gain, and why Q explodes when P_aux -> 0
 *   opspace  the operating space (Greenwald fraction vs 1/q95) with recorded TORAX trajectories
 * Registers into window.RT (widgets.js) and reuses its drawing helpers. No dependencies. */
(function () {
  "use strict";
  const RT = window.RT, M = window.RTModel;
  if (!RT || !M) return;
  const { colors, el, controls, slider, button, chip, note, canvas, frame, line, hline, player, getJSON, FONT, FONT_SMALL } = RT;
  const RC = window.RTControl;
  const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;
  const SITE_ROOT = new URL("../", SCRIPT_URL);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ------------------------------------------------------------------ links into the docs
  function pageURL(path) {
    // path like "primer/equations" -> works with and without mkdocs directory URLs
    const flat = /\.html$/.test(location.pathname);
    return new URL(flat ? path + ".html" : path + "/", SITE_ROOT).href;
  }
  const eqLink = (id) => pageURL("primer/equations") + "#eq-" + id;

  function typeset(node) {
    let tries = 0;
    const go = () => {
      if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([node]).catch(() => {});
      else if (tries++ < 40) setTimeout(go, 300);
    };
    go();
  }

  // ------------------------------------------------------------------ equation catalogue (shown in drawers)
  // tex: display equation; lab: what the Lab model does; torax: what TORAX / Gym-TORAX does; ch: primer chapter
  const EQ = {
    q: {
      title: "Safety factor",
      tex: String.raw`q(\hat\rho) \approx G(\hat\rho)\,\frac{2\pi r^{2} B_\varphi}{\mu_0 R\, I(r)}`,
      lab: "G = 1.79 + 1.49 ρ̂² stands in for elongation and triangularity; calibrated so that q on axis and q95 match TORAX.",
      torax: "q from the poloidal flux ψ and the full CHEASE equilibrium geometry.",
      ch: ["primer/2-safety-factor", "Safety factor"],
    },
    diffusion: {
      title: "Current diffusion (the ψ equation)",
      tex: String.raw`\frac{\partial I}{\partial t} = \frac{2\pi r\,s}{\mu_0}\,\frac{\partial}{\partial r}\Big[\eta\,\big(j - j_{\rm ni}\big)\Big], \qquad j = \frac{1}{2\pi\kappa r}\frac{\partial I}{\partial r}, \qquad I(a,t) = I_p(t)`,
      lab: "Enclosed current I(r) on 51 radial nodes, implicit in time; the I_p action is the edge boundary value.",
      torax: "The poloidal-flux equation with neoclassical conductivity σ∥ and ⟨B·j_ni⟩ (bootstrap + NBI + ECCD).",
      ch: ["primer/3-current-diffusion", "Current diffusion"],
    },
    eta: {
      title: "Resistivity and the resistive time",
      tex: String.raw`\eta = \frac{1.65\times10^{-9}\,Z_{\rm eff}\ln\Lambda}{T_e^{3/2}\,\big(1 - c\sqrt{r/R}\big)}\ \Omega\,\mathrm{m}, \qquad \tau_R \sim \frac{\mu_0 a^2}{\eta}`,
      lab: "Spitzer resistivity with a trapped-particle correction; hot plasma conducts well, so current penetrates slowly.",
      torax: "Sauter neoclassical conductivity.",
      ch: ["primer/3-current-diffusion", "Current diffusion"],
    },
    bootstrap: {
      title: "Bootstrap current",
      tex: String.raw`j_{\rm bs} \approx -\frac{\sqrt{\varepsilon}}{B_\theta}\Big(2.44\,(T_e+T_i)\frac{\partial n}{\partial r} + 0.69\,n\frac{\partial T_e}{\partial r} - 0.42\,n\frac{\partial T_i}{\partial r}\Big)`,
      lab: "Textbook large-aspect-ratio form, scaled by 0.34 in the calibration.",
      torax: "Sauter bootstrap model.",
      ch: ["primer/3-current-diffusion", "Current diffusion"],
    },
    heat: {
      title: "Heat transport with a critical gradient",
      tex: String.raw`\tfrac32\, n_s\frac{\partial T_s}{\partial t} = \frac{1}{r}\frac{\partial}{\partial r}\Big(r\,n_s\chi_s\frac{\partial T_s}{\partial r}\Big) + Q_s, \qquad \chi = \chi_0 + \chi_1\,T^{1.4}\Big(\frac{R}{L_T} - 7.5\Big)_{+}`,
      lab: "Above the critical gradient R/L_T ≈ 7.5 transport shoots up, so profiles are stiff: the core temperature rides on the pedestal.",
      torax: "QLKNN neural-network surrogate of quasilinear gyrokinetic transport.",
      ch: ["primer/4-heat-and-fusion", "Heat, confinement and fusion"],
    },
    sources: {
      title: "Heat sources and sinks",
      tex: String.raw`Q_e = \underbrace{E_\parallel j}_{\rm ohmic} + \underbrace{P_{\rm EC}\,g_{\rm EC}}_{\rm ECRH} + 0.9\,P_{\rm NB}\,g_{\rm NB} + 0.62\,p_\alpha - p_{\rm rad} - Q_{ei}, \qquad Q_i = 0.1\,P_{\rm NB}\,g_{\rm NB} + 0.38\,p_\alpha + Q_{ei}`,
      lab: "g are Gaussian deposition profiles (NBI at ρ̂ = 0.25, width 0.25; ECRH at ρ̂ = 0.35, width 0.05); Q_ei is electron–ion exchange.",
      torax: "The same source families with physics-based deposition and fast-ion slowing down.",
      ch: ["primer/4-heat-and-fusion", "Heat, confinement and fusion"],
    },
    pedestal: {
      title: "Pedestal: a boundary condition",
      tex: String.raw`T(\hat\rho_{\rm ped}=0.91,\,t) = T_{\rm ped}(t) = \begin{cases} 0.5\ \text{keV} & t < 100\ \text{s}\\ \to 3\ \text{keV} & 100 \le t \le 105\ \text{s}\end{cases}`,
      lab: "‘Scheduled’ copies Gym-TORAX. ‘Power-triggered’ raises the pedestal only while P_SOL ≥ P_LH (a physics-based alternative).",
      torax: "Prescribed in time by the Gym-TORAX ITER hybrid config.",
      ch: ["primer/4-heat-and-fusion", "Heat, confinement and fusion"],
    },
    fusion: {
      title: "Fusion power and gain",
      tex: String.raw`P_{\rm fus} = \int n_D n_T\,\langle\sigma v\rangle(T_i)\,E_{\rm fus}\,dV, \qquad Q = \frac{P_{\rm fus}}{P_{\rm aux} + P_{\rm ohm}}`,
      lab: "Bosch–Hale D-T reactivity; 50/50 D-T with dilution 0.95; E_fus = 17.6 MeV, 3.5 MeV of it in the alpha.",
      torax: "Same definition of Q (the heating-cut episode's Q ≈ 270 is P_fus over the ≈ 1 MW of ohmic power left).",
      ch: ["primer/4-heat-and-fusion", "Heat, confinement and fusion"],
    },
    ipb98: {
      title: "Confinement time and H98",
      tex: String.raw`\tau_E = \frac{W_{\rm th}}{P_{\rm loss}}, \qquad \tau_E^{98} = 0.0562\, I_p^{0.93} B^{0.15} \bar n^{0.41} P^{-0.69} R^{1.97} \kappa^{0.78} \varepsilon^{0.58} M^{0.19}, \qquad H_{98} = \frac{\tau_E}{\tau_E^{98}}`,
      lab: "Computed from the Lab's own stored energy and P_loss = P_heat − dW/dt.",
      torax: "Same IPB98(y,2) scaling.",
      ch: ["primer/4-heat-and-fusion", "Heat, confinement and fusion"],
    },
    greenwald: {
      title: "Greenwald density limit",
      tex: String.raw`n_G\,[10^{20}\,\mathrm{m^{-3}}] = \frac{I_p\,[\mathrm{MA}]}{\pi a^2}, \qquad f_{GW} = \frac{\bar n_e}{n_G}`,
      lab: "The line density relaxes (τ ≈ 22 s) towards 0.60 n_G in L-mode, 1.0 n_G in H-mode, plus beam fuelling.",
      torax: "Density boundary conditions are set as Greenwald fractions; nothing stops f_GW > 1.",
      ch: ["primer/5-limits", "Limits and the operating space"],
    },
    plh: {
      title: "L–H threshold power",
      tex: String.raw`P_{LH} = 0.0488\,\bar n_{e,20}^{0.717} B^{0.803} S^{0.941}\ \mathrm{MW}, \qquad P_{SOL} = P_{\rm ohm} + P_{\rm aux} + P_\alpha - P_{\rm rad}`,
      lab: "Martin (2008) scaling. Used by the audited reward and by the power-triggered pedestal.",
      torax: "Reported as a diagnostic; the Gym-TORAX reward does not use it.",
      ch: ["primer/5-limits", "Limits and the operating space"],
    },
    betaN: {
      title: "Normalised beta",
      tex: String.raw`\beta_t = \frac{2\mu_0\langle p\rangle}{B^2}, \qquad \beta_N = \beta_t[\%]\,\frac{a\,B}{I_p[\mathrm{MA}]}`,
      lab: "From the stored thermal energy.",
      torax: "Same definition; not in the reward.",
      ch: ["primer/5-limits", "Limits and the operating space"],
    },
    sawtooth: {
      title: "Sawtooth crash (optional)",
      tex: String.raw`q(0) < 1:\quad r_{\rm mix} \approx \sqrt2\, r_{q=1}, \quad T\ \text{and}\ j\ \text{flattened for}\ r < r_{\rm mix}\ \text{every}\ 6\ \text{s}`,
      lab: "A Kadomtsev-style reconnection, off by default (the Gym-TORAX config has none).",
      torax: "TORAX 1.0.3 has a simple sawtooth model; the environment does not enable it.",
      ch: ["primer/5-limits", "Limits and the operating space"],
    },
    reward: {
      title: "Benchmark reward (IterHybrid-v0)",
      tex: String.raw`r_t = \tfrac{1}{50}\,H\,\tfrac{Q}{10} + \tfrac{1}{50}\,H\min(H_{98},1) + \tfrac{1}{150}\min(q_{\min},1) + \tfrac{1}{150}\min\!\big(\tfrac{q_{95}}{3},1\big), \qquad H = [T_e(0) > 10] \wedge [T_i(0) > 10]`,
      lab: "Evaluated on the Lab's state with exactly this formula.",
      torax: "Gym-TORAX 1.0 IterHybridEnv; −1000 and the episode ends on solver failure or a bounds violation.",
      ch: ["primer/6-reward", "From physics to reward"],
    },
    audited: {
      title: "Audited reward (this repo)",
      tex: String.raw`H' = H\cdot[P_{SOL} \ge P_{LH}], \qquad Q' = \min(Q, 10)`,
      lab: "Same four terms with the gate and the cap changed.",
      torax: "IterHybridAudited-v0 on the repo's Gym-TORAX fork.",
      ch: ["primer/6-reward", "From physics to reward"],
    },
    density: {
      title: "Density (0-D)",
      tex: String.raw`\frac{d\bar n}{dt} = \frac{f(h)\, n_G(I_p) + c_{\rm NB}P_{\rm NBI} - \bar n}{\tau_n}, \qquad n(\hat\rho) = \bar n\,\frac{1 - 0.35\hat\rho^2}{1 - 0.35/3}`,
      lab: "h is the pedestal state (0 = L-mode, 1 = H-mode).",
      torax: "A full particle-transport equation with Greenwald-fraction boundary conditions.",
      ch: ["primer/5-limits", "Limits and the operating space"],
    },
    flux: {
      title: "Loop voltage and resistive flux",
      tex: String.raw`V_{\rm loop} = 2\pi R\,E_\parallel(a), \qquad \Psi_{\rm res}(t) = \int_0^t V_{\rm loop}\,dt'`,
      lab: "The central solenoid has to supply this (plus the inductive flux L I_p); the benchmark charges nothing for it.",
      torax: "Not modelled in Gym-TORAX: I_p is a commanded boundary condition.",
      ch: ["primer/3-current-diffusion", "Current diffusion"],
    },
  };
  function eqDrawer(parent, ids) {
    const d = el("div", "rt-eqdrawer");
    d.hidden = true;
    d.innerHTML = ids
      .map((id) => {
        const e = EQ[id];
        return (
          `<div class="rt-eq"><div class="rt-eq-title">${e.title} <a href="${eqLink(id)}" title="Open in the equation sheet">sheet ↗</a>` +
          ` <a href="${pageURL(e.ch[0])}" title="Read the chapter">${e.ch[1]} ↗</a></div>` +
          `<div class="arithmatex">\\[${e.tex}\\]</div>` +
          `<div class="rt-eq-note"><b>Lab:</b> ${e.lab}<br><b>TORAX:</b> ${e.torax}</div></div>`
        );
      })
      .join("");
    parent.appendChild(d);
    let done = false;
    return {
      el: d,
      toggle() {
        d.hidden = !d.hidden;
        if (!d.hidden && !done) {
          done = true;
          typeset(d);
        }
      },
      set(idsNew) {
        ids = idsNew;
        d.innerHTML = "";
        done = false;
        const tmp = eqDrawer(document.createElement("div"), idsNew).el;
        d.innerHTML = tmp.innerHTML;
        if (!d.hidden) {
          done = true;
          typeset(d);
        }
      },
    };
  }

  // ------------------------------------------------------------------ colour maps
  const CMAPS = {
    plasma: [[13, 8, 135], [84, 2, 163], [139, 10, 165], [185, 50, 137], [219, 92, 104], [244, 136, 73], [254, 188, 43], [240, 249, 33]],
    ice: [[8, 29, 88], [37, 52, 148], [34, 94, 168], [29, 145, 192], [65, 182, 196], [127, 205, 187], [199, 233, 180]],
    qmap: [[214, 54, 56], [240, 140, 60], [250, 220, 120], [120, 200, 160], [60, 150, 200], [70, 90, 180], [60, 50, 130]],
  };
  function cmap(name, t, alpha) {
    const s = CMAPS[name];
    t = clamp(isFinite(t) ? t : 0, 0, 1) * (s.length - 1);
    const i = Math.min(s.length - 2, Math.floor(t)), f = t - i;
    const c = s[i].map((v, k) => Math.round(v + (s[i + 1][k] - v) * f));
    return alpha === undefined ? `rgb(${c})` : `rgba(${c},${alpha})`;
  }
  // value -> [0,1] for each colouring quantity
  const COLOR_BY = {
    Te: { label: "T_e [keV]", map: "plasma", norm: (v) => Math.sqrt(clamp(v / 30, 0, 1)), ticks: [0, 1, 5, 10, 20, 30] },
    j: { label: "j [MA/m²]", map: "ice", norm: (v) => clamp(v / 3.5, 0, 1), ticks: [0, 1, 2, 3] },
    q: { label: "q", map: "qmap", norm: (v) => clamp(Math.log(v / 0.4) / Math.log(6 / 0.4), 0, 1), ticks: [0.5, 1, 2, 3, 5] },
  };

  // ------------------------------------------------------------------ 3D torus renderer
  // Geometry in metres. Elongated, slightly triangular, Shafranov-shifted flux surfaces.
  const GEO = { R0: 6.2, a: 2.0, kappa: 1.7, delta: 0.33, shift: 0.25 };
  function surfPoint(rho, th, phi) {
    const Rr = GEO.R0 + GEO.shift * (1 - rho * rho) + rho * GEO.a * Math.cos(th + GEO.delta * Math.sin(th));
    return [Rr * Math.cos(phi), Rr * Math.sin(phi), GEO.kappa * rho * GEO.a * Math.sin(th)];
  }
  function interp(arr, x) {
    // arr sampled on rho = i/(n-1)
    const n = arr.length - 1, t = clamp(x, 0, 1) * n, i = Math.min(n - 1, Math.floor(t));
    return arr[i] + (arr[i + 1] - arr[i]) * (t - i);
  }
  function makeTorus(cv, opts) {
    const view = { yaw: opts.yaw !== undefined ? opts.yaw : 0.55, el: 0.42, phase: 0 };
    let dragging = null;
    cv.c.style.touchAction = "pan-y";
    cv.c.style.cursor = "grab";
    cv.c.addEventListener("pointerdown", (e) => {
      dragging = { x: e.clientX, yaw: view.yaw, el: view.el, y: e.clientY };
      cv.c.style.cursor = "grabbing";
    });
    window.addEventListener("pointerup", () => {
      dragging = null;
      cv.c.style.cursor = "grab";
    });
    cv.c.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      view.yaw = dragging.yaw - (e.clientX - dragging.x) * 0.01;
      view.el = clamp(dragging.el + (e.clientY - dragging.y) * 0.004, 0.12, 1.2);
      if (opts.onChange) opts.onChange();
    });

    function draw(S) {
      // S: {q:[], val:[], colorBy, nbi, ecrh, ecrhLoc, Ip, coils, beams, lines, labels, flash, title, hmode, flux}
      const col = colors();
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const ce = Math.cos(view.el), se = Math.sin(view.el), cy0 = Math.cos(view.yaw), sy0 = Math.sin(view.yaw);
      const ext = S.coils ? 10.6 : 8.9;
      const zext = S.coils ? 5.6 : 3.8;
      const sc = Math.min((w * 0.94) / (2 * ext), (h * 0.9) / (2 * (ext * se + zext * ce)));
      const cx = w / 2, cy = h / 2 + (S.coils ? 0 : 6);
      const P = (p) => {
        const xr = p[0] * cy0 - p[1] * sy0, yr = p[0] * sy0 + p[1] * cy0;
        return [cx + sc * xr, cy - sc * (yr * se + p[2] * ce), yr * ce - p[2] * se];
      };
      const prims = [];
      const phiFront = -Math.PI / 2 - view.yaw;
      const cutHalf = Math.PI / 4.2;
      const inCut = (phi) => {
        let d = ((phi - phiFront) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
        return Math.abs(d) < cutHalf;
      };
      const qAt = (rho) => Math.max(0.2, interp(S.q, rho));
      const cm = COLOR_BY[S.colorBy || "Te"];
      const colAt = (rho, a) => cmap(cm.map, cm.norm(interp(S.val, rho)), a);
      // --- plasma outer surface mesh (translucent), outside the cut
      const NT = 72, NP = 26;
      for (let i = 0; i < NT; i++) {
        const p0 = (i / NT) * 2 * Math.PI, p1 = ((i + 1) / NT) * 2 * Math.PI;
        if (inCut((p0 + p1) / 2)) continue;
        for (let k = 0; k < NP; k++) {
          const t0 = (k / NP) * 2 * Math.PI, t1 = ((k + 1) / NP) * 2 * Math.PI;
          const a = P(surfPoint(1, t0, p0)), b = P(surfPoint(1, t0, p1)), c = P(surfPoint(1, t1, p1)), d = P(surfPoint(1, t1, p0));
          const depth = (a[2] + b[2] + c[2] + d[2]) / 4;
          // simple shading: outward normal z-component and facing
          const tm = (t0 + t1) / 2, pm = (p0 + p1) / 2;
          const nx = Math.cos(tm) * Math.cos(pm), ny = Math.cos(tm) * Math.sin(pm), nz = Math.sin(tm) / GEO.kappa;
          const facing = -((nx * cy0 - ny * sy0) * 0 + (nx * sy0 + ny * cy0) * ce - nz * se);
          const light = 0.55 + 0.45 * clamp(nz * 0.6 + facing * 0.6, -1, 1);
          prims.push([depth, () => {
            ctx.fillStyle = colAt(0.96, facing > 0 ? 0.2 * light + 0.06 : 0.08);
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.lineTo(c[0], c[1]);
            ctx.lineTo(d[0], d[1]);
            ctx.closePath();
            ctx.fill();
          }]);
        }
      }
      // --- cut faces: nested flux surfaces coloured by the chosen quantity
      for (const sgn of [-1, 1]) {
        const phi = phiFront + sgn * cutHalf;
        const center = P(surfPoint(0, 0, phi));
        prims.push([center[2] - 0.5, () => {
          const NR = 26;
          for (let k = NR; k >= 1; k--) {
            const rho = k / NR;
            ctx.beginPath();
            for (let m = 0; m <= 48; m++) {
              const pt = P(surfPoint(rho, (m / 48) * 2 * Math.PI, phi));
              m ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
            }
            ctx.closePath();
            ctx.fillStyle = colAt(rho - 0.5 / NR, 0.95);
            ctx.fill();
          }
          ctx.strokeStyle = col.muted;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let m = 0; m <= 48; m++) {
            const pt = P(surfPoint(1, (m / 48) * 2 * Math.PI, phi));
            m ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
          }
          ctx.stroke();
          // rational surfaces
          for (const [qv, color, lab] of [[1, "#ff3b3b", "q = 1"], [2, "rgba(255,255,255,0.75)", "q = 2"]]) {
            let rq = null;
            for (let x = 0; x <= 1; x += 0.005)
              if ((qAt(x) - qv) * (qAt(Math.min(1, x + 0.005)) - qv) <= 0 && qAt(x) !== qAt(x + 0.005)) {
                rq = x;
                break;
              }
            if (rq === null || rq <= 0.005) continue;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = qv === 1 ? 2.2 : 1.2;
            ctx.setLineDash(qv === 1 ? [] : [3, 3]);
            ctx.beginPath();
            for (let m = 0; m <= 48; m++) {
              const pt = P(surfPoint(rq, (m / 48) * 2 * Math.PI, phi));
              m ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
            }
            ctx.stroke();
            if (sgn === 1 && S.labels !== false) {
              const pt = P(surfPoint(rq, -0.6, phi));
              ctx.fillStyle = color;
              ctx.font = FONT_SMALL;
              ctx.fillText(lab, pt[0] + 4, pt[1] + 10);
            }
            ctx.restore();
          }
          if (S.flash) {
            ctx.fillStyle = `rgba(255,255,255,${0.5 * S.flash})`;
            ctx.beginPath();
            for (let m = 0; m <= 48; m++) {
              const pt = P(surfPoint(0.45, (m / 48) * 2 * Math.PI, phi));
              m ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
            }
            ctx.fill();
          }
        }]);
      }
      // --- field lines on three flux surfaces
      if (S.lines !== false) {
        const surfaces = [[1.0, 3, 2.2], [0.62, 2, 1.6], [0.3, 2, 1.4]];
        surfaces.forEach(([rho, nl, lw], si) => {
          const q = qAt(rho);
          for (let l = 0; l < nl; l++) {
            const th0 = (l / nl) * 2 * Math.PI + si;
            const n = 520;
            let prev = null;
            for (let i = 0; i <= n; i++) {
              const phi = (i / n) * 2 * Math.PI;
              const th = th0 + (phi + view.phase) / q;
              const pt = P(surfPoint(rho * 0.995, th, phi));
              const hidden = inCut(phi);
              if (prev && !hidden && !prev.hidden) {
                const a = prev.pt, b = pt;
                const depth = (a[2] + b[2]) / 2 - 0.05;
                const nx = Math.cos(th) * Math.cos(phi), ny = Math.cos(th) * Math.sin(phi), nz = Math.sin(th) / GEO.kappa;
                const front = (nx * sy0 + ny * cy0) * ce - nz * se < 0;
                prims.push([depth, () => {
                  ctx.strokeStyle = si === 0 ? col.accent : si === 1 ? "#ffd166" : "#7fdfff";
                  ctx.globalAlpha = si === 0 ? (front ? 0.95 : 0.25) : 0.55;
                  ctx.lineWidth = lw;
                  ctx.beginPath();
                  ctx.moveTo(a[0], a[1]);
                  ctx.lineTo(b[0], b[1]);
                  ctx.stroke();
                  ctx.globalAlpha = 1;
                }]);
              }
              prev = { pt, hidden };
            }
          }
        });
      }
      // --- central solenoid
      const csR = 1.35, csH = S.coils ? 4.6 : 3.6;
      const csTop = P([0, 0, csH]), csBot = P([0, 0, -csH]);
      prims.push([0, () => {
        const rx = sc * csR, ry = sc * csR * se;
        ctx.fillStyle = col.panel;
        ctx.strokeStyle = col.muted;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(csTop[0] - rx, csTop[1]);
        ctx.lineTo(csBot[0] - rx, csBot[1]);
        ctx.ellipse(csBot[0], csBot[1], rx, ry, 0, Math.PI, 0, true);
        ctx.lineTo(csTop[0] + rx, csTop[1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // flux gauge
        if (S.flux !== undefined) {
          const frac = clamp(S.flux / 200, 0, 1);
          ctx.fillStyle = "rgba(42,120,214,0.45)";
          const yb = csBot[1], ytop = yb - (yb - csTop[1]) * frac;
          ctx.fillRect(csTop[0] - rx * 0.6, ytop, rx * 1.2, yb - ytop);
        }
        ctx.beginPath();
        ctx.ellipse(csTop[0], csTop[1], rx, ry, 0, 0, 2 * Math.PI);
        ctx.fillStyle = col.panel;
        ctx.fill();
        ctx.stroke();
        if (S.labels !== false) {
          ctx.fillStyle = col.muted;
          ctx.font = FONT_SMALL;
          ctx.textAlign = "center";
          ctx.fillText("central", csTop[0], csTop[1] - ry - 14);
          ctx.fillText("solenoid", csTop[0], csTop[1] - ry - 3);
          ctx.textAlign = "left";
        }
      }]);
      // --- toroidal field coils
      if (S.coils) {
        for (let k = 0; k < 18; k++) {
          const phi = (k / 18) * 2 * Math.PI + 0.09;
          let prev = null;
          for (let m = 0; m <= 40; m++) {
            const th = (m / 40) * 2 * Math.PI;
            const Rr = 7.2 + 3.6 * Math.cos(th + 0.25 * Math.sin(th)) - (Math.cos(th) < 0 ? 0.6 * Math.cos(th) : 0);
            const pt = P([Rr * Math.cos(phi), Rr * Math.sin(phi), 5.2 * Math.sin(th)]);
            if (prev) {
              const a = prev, b = pt;
              prims.push([(a[2] + b[2]) / 2, () => {
                ctx.strokeStyle = col.muted;
                ctx.globalAlpha = 0.2;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
                ctx.stroke();
                ctx.globalAlpha = 1;
              }]);
            }
            prev = pt;
          }
        }
      }
      // --- NBI (tangential beam) and ECRH (ray from an upper launcher)
      if (S.beams !== false) {
        if (S.nbi > 0.05) {
          const phiB = phiFront + Math.PI * 0.62, Rt = 5.3;
          const dir = [-Math.sin(phiB), Math.cos(phiB)];
          const tan = [Rt * Math.cos(phiB), Rt * Math.sin(phiB)];
          const n = 30;
          for (let i = 0; i < n; i++) {
            const s0 = -9 + (i / n) * 9, s1 = -9 + ((i + 1) / n) * 9;
            const a = P([tan[0] + dir[0] * s0, tan[1] + dir[1] * s0, -0.3]), b = P([tan[0] + dir[0] * s1, tan[1] + dir[1] * s1, -0.3]);
            const fade = i > n * 0.55 ? 1 - (i - n * 0.55) / (n * 0.45) : 1;
            prims.push([(a[2] + b[2]) / 2 - 0.1, () => {
              ctx.strokeStyle = `rgba(255,140,40,${0.85 * fade})`;
              ctx.lineWidth = 1.5 + (S.nbi / 33) * 6;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(a[0], a[1]);
              ctx.lineTo(b[0], b[1]);
              ctx.stroke();
              ctx.lineCap = "butt";
            }]);
          }
          if (S.labels !== false) {
            const pl = P([tan[0] - dir[0] * 8.6, tan[1] - dir[1] * 8.6, -0.3]);
            prims.push([-99, () => {
              ctx.fillStyle = "rgb(235,120,30)";
              ctx.font = FONT_SMALL;
              ctx.fillText(`NBI ${S.nbi.toFixed(0)} MW`, pl[0] - 20, pl[1] + 14);
            }]);
          }
        }
        if (S.ecrh > 0.05) {
          const phi = phiFront + cutHalf;
          const target = surfPoint(Math.max(0.02, S.ecrhLoc || 0.35), 1.05, phi);
          const launch = [ (GEO.R0 + 1.3) * Math.cos(phi), (GEO.R0 + 1.3) * Math.sin(phi), 4.6 ];
          const a = P(launch), b = P(target);
          prims.push([-50, () => {
            ctx.save();
            ctx.strokeStyle = "rgba(80,220,255,0.9)";
            ctx.lineWidth = 1 + (S.ecrh / 20) * 2.5;
            ctx.beginPath();
            const n = 60, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
            for (let i = 0; i <= n; i++) {
              const t = i / n, wig = Math.sin(t * 40 - view.phase * 6) * 3 * (1 - t);
              const x = a[0] + dx * t - (dy / L) * wig, y = a[1] + dy * t + (dx / L) * wig;
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.stroke();
            const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], 12);
            g.addColorStop(0, "rgba(160,240,255,0.95)");
            g.addColorStop(1, "rgba(160,240,255,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(b[0], b[1], 12, 0, 2 * Math.PI);
            ctx.fill();
            if (S.labels !== false) {
              ctx.fillStyle = "rgb(40,170,210)";
              ctx.font = FONT_SMALL;
              ctx.fillText(`ECRH ${S.ecrh.toFixed(0)} MW`, a[0] + 6, a[1] - 4);
            }
            ctx.restore();
          }]);
        }
      }
      // --- plasma current arrow on the outboard midplane
      if (S.arrows) {
        const phiA = phiFront - cutHalf - 0.25;
        prims.push([-80, () => arrowAlong(ctx, P, (u) => surfPoint(1.1, -0.15, phiA - 0.55 + u * 0.5), col.series[0], `I_p ${S.Ip.toFixed(1)} MA`)]);
        prims.push([-80, () => arrowAlong(ctx, P, (u) => surfPoint(1.1, -1.1, phiA - 0.55 + u * 0.5), col.fg, "B_φ (coils)")]);
        const phiF = phiFront + cutHalf;
        prims.push([-80, () => arrowAlong(ctx, P, (u) => surfPoint(1.18, 1.9 + u * 0.9, phiF), col.series[2], "B_θ (from I_p)")]);
      }
      prims.sort((x, y) => y[0] - x[0]);
      for (const [, f] of prims) f();
      // --- overlays
      ctx.font = FONT_SMALL;
      ctx.fillStyle = col.muted;
      ctx.textAlign = "left";
      if (S.overlay) S.overlay.forEach((t, i) => ctx.fillText(t, 8, 16 + 15 * i));
      // colour bar
      const bw = Math.min(150, w * 0.32), bx = w - bw - 12, by = h - 22;
      for (let i = 0; i < bw; i++) {
        ctx.fillStyle = cmap(cm.map, i / bw);
        ctx.fillRect(bx + i, by, 1.2, 8);
      }
      ctx.fillStyle = col.muted;
      ctx.textAlign = "center";
      for (const tv of cm.ticks) {
        const x = bx + bw * cm.norm(tv);
        ctx.fillText(String(tv), x, by + 19);
      }
      ctx.textAlign = "right";
      ctx.fillText(cm.label, bx - 6, by + 8);
      ctx.textAlign = "left";
      if (S.badge) {
        ctx.font = FONT;
        const tw = ctx.measureText(S.badge.text).width + 14;
        ctx.fillStyle = S.badge.color;
        ctx.globalAlpha = 0.9;
        const by0 = w < 560 ? 62 : 8;
        roundRect(ctx, w - tw - 10, by0, tw, 22, 11);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff";
        ctx.fillText(S.badge.text, w - tw - 3, by0 + 15);
      }
    }
    return { draw, view };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function arrowAlong(ctx, P, f, color, label) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    let last, prev;
    for (let i = 0; i <= 20; i++) {
      const p = P(f(i / 20));
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
      prev = last;
      last = p;
    }
    ctx.stroke();
    const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    ctx.beginPath();
    ctx.moveTo(last[0], last[1]);
    ctx.lineTo(last[0] - 10 * Math.cos(ang - 0.4), last[1] - 10 * Math.sin(ang - 0.4));
    ctx.lineTo(last[0] - 10 * Math.cos(ang + 0.4), last[1] - 10 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.font = FONT_SMALL;
    const mid = P(f(0.5));
    ctx.fillText(label, mid[0] + 6, mid[1] - 6);
    ctx.restore();
  }

  // ================================================================== presets and their stories
  // ctrl: "open" (a schedule: the clock turns the knobs), "feedback" (measurements turn the knobs), "human" (you).
  // live: how the Lab can run the controller itself on its own plasma ("pi", or "policy" = exported network).
  const PRESETS = [
    { key: "open_loop", label: "Open-loop reference", kind: "torax", ctrl: "open" },
    { key: "heating_cut", label: "Heating cut at 105 s", kind: "torax", ctrl: "open" },
    { key: "cem_audited", label: "Best audited schedule", kind: "torax", ctrl: "open" },
    { key: "early_heat", label: "Early heating, 10 MA", kind: "lab", ctrl: "open" },
    { key: "pi", label: "PI controller", kind: "torax", ctrl: "feedback", live: "pi" },
    { key: "ppo_res", label: "PPO on PI", kind: "torax", ctrl: "feedback", live: "policy" },
    { key: "mbpo_res", label: "MBPO on PI", kind: "torax", ctrl: "feedback", live: "policy" },
    { key: "ppo_s1", label: "PPO exploit", kind: "torax", ctrl: "feedback", live: "policy" },
    { key: "sandbox", label: "Sandbox: you drive", kind: "sandbox", ctrl: "human" },
  ];
  const EXTRA = {
    td3bc: { label: "TD3+BC on noisy PI logs", ctrl: "feedback", live: "policy" },
    mbpo_s1: { label: "MBPO seed 1 (exploit)", ctrl: "feedback", live: "policy" },
  };
  const presetOf = (key) => PRESETS.find((x) => x.key === key) || (EXTRA[key] && { key, kind: "torax", ...EXTRA[key] });
  const CTRL = {
    open: { tag: "open loop", cls: "open", what: "a schedule: the clock turns the knobs" },
    feedback: { tag: "feedback", cls: "fb", what: "measurements of the plasma turn the knobs" },
    human: { tag: "you", cls: "you", what: "you read the screen and turn the knobs" },
  };
  const LAB_ACTIONS = {
    early_heat: (t) => ({ Ip: Math.min(10e6, 3e6 + (t + 1) * 0.2e6), nbi: t >= 10 ? 33e6 : 0, ecrh: t >= 10 ? 20e6 : 0 }),
  };
  const STORIES = {
    open_loop: {
      intro: "The reference trajectory shipped with Gym-TORAX: I_p ramps linearly from 3 to 12.5 MA over 100 s with no heating, then 33 MW of NBI and 20 MW of ECRH switch on. TORAX return 3.41.",
      events: [
        [1, "Cold start: 3 MA, about 3.7 keV on axis, q above 3 everywhere. Watch the current density (profiles, j tab) fill in from the edge."],
        [30, "Ohmic phase: the current is the only heater (a few MW). At 3 keV the plasma is resistive, so the current soaks inward within tens of seconds."],
        [69, "q on axis falls below 1 (TORAX 69 s, the Lab 68 s). From here the q_min term pays less than its maximum."],
        [100, "Heating on and pedestal rising on schedule (100–105 s): the core goes from about 5 to 23 keV in five seconds."],
        [102, "Both T_e(0) and T_i(0) pass 10 keV: the gated fusion-gain and H98 terms switch on."],
        [116, "Greenwald fraction passes 1 (TORAX). Nothing in the reward notices."],
        [151, "End: Q ≈ 7.7, q_min ≈ 0.63, f_GW ≈ 1.19 on TORAX."],
      ],
    },
    pi: {
      intro: "The paper's PI baseline: it raises I_p to make the central current density track a rising target, rate-limited to 0.2 MA/s, and uses the same heating schedule as the reference. TORAX return 3.79, the published bar.",
      events: [
        [20, "The controller ramps at the 0.2 MA/s limit: the target for j(0) runs ahead of what diffusion delivers."],
        [51, "q_min drops below 1 (TORAX 51 s, the Lab 57 s): a sawtoothing core in a real machine, invisible here except through the q_min term."],
        [61, "I_p reaches the 15 MA ceiling. Confinement scales as I_p^0.93, which is why more current pays."],
        [100, "Heating on, pedestal rising on schedule."],
        [114, "f_GW passes 1 and ends at 1.19: above the Greenwald limit for the last 37 s (TORAX)."],
        [151, "End: Q ≈ 14.6 and q_min ≈ 0.41 on TORAX: the better plasma by this reward, not a hybrid scenario."],
      ],
    },
    heating_cut: {
      intro: "The open-loop reference, but all heating is switched off after 105 s. A fixed sequence, no learning involved. TORAX return 22.74: six times PI.",
      events: [
        [104, "Heating on, the scheduled pedestal is up, the core is hot. So far identical to the reference."],
        [106, "Heating off. Q = P_fus / (P_aux + P_ohm) loses its 53 MW denominator and jumps from about 3 to 158 (TORAX)."],
        [110, "The core stays near 20 keV: the pedestal is prescribed, not earned, and alpha heating carries the rest. P_SOL falls below P_LH, so a real plasma would drop back to L-mode."],
        [151, "Q ≈ 270 at the end on TORAX. Switch the pedestal to ‘power-triggered’ in the simulator assumptions and replay: the exploit collapses."],
      ],
    },
    ppo_s1: {
      intro: "The highest benchmark return in this repo (48.98 on TORAX), found by PPO seed 1 after 112k simulator steps. It heats from the first second, then cuts the heating at about 104 s and lets I_p sag.",
      events: [
        [2, "Full NBI from the start: Greenwald fraction near 1 already (beam fuelling at low current)."],
        [50, "Hot L-mode ramp (7–8 keV with a 0.5 keV pedestal). The Lab keeps the current out of the core longer than TORAX does here: one of its larger disagreements."],
        [105, "Heating cut, as in the hand-made exploit. Q passes 200 within two seconds on TORAX."],
        [151, "Q ≈ 755 at the end on TORAX. The audited score of this episode is 3.53, close to PI's 3.50."],
      ],
    },
    cem_audited: {
      intro: "The best 9-parameter open-loop schedule found by cross-entropy search on the audited objective: ramp to 13.2 MA, a little heating from 82 s, then partial power. TORAX benchmark 3.87, audited 3.63.",
      events: [
        [59, "q_min < 1 later than PI (59 s on TORAX), because the ramp stops at 13.2 MA."],
        [82, "Early, partial heating starts: a few MW slows the current penetration."],
        [100, "25 MW NBI + 11 MW ECRH instead of the full 53 MW: enough to keep P_SOL above P_LH, which the audited gate requires."],
        [151, "Q ≈ 14 with less heating than PI. Its benchmark return beats PI because the denominator of Q is smaller."],
      ],
    },
    ppo_res: {
      intro: "The PI controller plus a correction to all three knobs, learned by PPO on the audited reward (29,535 simulator steps, seed 0). It keeps PI's ramp, adds heating during it, and trims the flat-top heating once the core is hot. TORAX: benchmark 4.47 and audited 3.64, against PI's 3.79 and 3.50. Open the knobs panel: pink is the network's correction.",
      events: [
        [1, "From the first second the network adds a few MW of ECRH that PI would not use, and from 28 s NBI as well. PI still ramps I_p at its 0.2 MA/s limit."],
        [51, "PI's q_min crosses 1 here on TORAX. With the extra heating the plasma is hotter and conducts better, so the current reaches the core later: q_min stays above 1 until 61 s."],
        [100, "Full power for three seconds as the scheduled pedestal rises: it takes the core past 10 keV with P_SOL above P_LH, which the audited H-mode gate needs."],
        [105, "Then down to about 22 MW of NBI and 7 MW of ECRH: P_SOL stays above P_LH, and Q passes 10 with less power in its denominator."],
        [151, "End on TORAX: Q ≈ 20, q_min ≈ 0.49 (PI 0.41), f_GW ≈ 1.19 as for PI. Most of the gain over PI is the q_min term (later current penetration), the rest the fusion term."],
      ],
    },
    mbpo_res: {
      intro: "The PI controller plus a correction learned by MBPO on the audited reward: the best checkpoint of seed 0, reached after only 302 simulator steps (the same run's final policy scored 3.51). It switches on full heating at 50 s, as q_min is about to fall below 1, and ramps I_p down in the flat-top. TORAX: benchmark 3.92 and audited 3.72, against PI's 3.79 and 3.50.",
      events: [
        [49, "Full NBI and ECRH from 50 s, fifty seconds before PI heats. The current keeps diffusing inward, but slowly: q_min is 0.93 at 61 s, where PI's is about 0.8."],
        [102, "The scheduled pedestal rises into a plasma that is already hot: both core temperatures pass 10 keV and the gated terms switch on."],
        [109, "From here the network ramps I_p down at its 0.1 MA/s limit, to 11.4 MA at the end. H98 rises from 0.9 to 1.2, partly because its yardstick τ_98 ∝ I_p^0.93 shrinks with the current: not all of that is a better plasma."],
        [151, "End on TORAX: Q ≈ 10.6, H98 ≈ 1.22, q_min ≈ 0.57, T_e(0) ≈ 31 keV, 4 keV below the 35 keV bound that would end the episode."],
      ],
    },
    early_heat: {
      intro: "A hybrid-style idea tried only on the Lab model: stop the ramp at 10 MA and heat with full power from 10 s (33 MW NBI + 20 MW ECRH), so the hot core slows current penetration and q_min stays near 1. Not run on TORAX: a candidate experiment, not a result.",
      events: [
        [10, "Heating on during the ramp. Watch the q profile: hot plasma conducts well, so the current stays out of the core."],
        [60, "q_min still above 1 while PI's is already below it. Compare the j profiles of the two presets."],
        [100, "The scheduled pedestal rises; the heating was already on."],
        [151, "On the Lab: q_min ≥ 1 until about 140 s, audited 3.63 against PI's 3.32, benchmark 3.63 against 3.45. The price: beam fuelling drives the Greenwald fraction to 1.34, which no score here charges for. Whether TORAX agrees is open."],
      ],
    },
    sandbox: {
      intro: "You are the agent. One action per second: the I_p ramp rate (±0.2 MA/s), NBI and ECRH power, and where the ECRH deposits. Press Run for real time, or Step to act one second at a time, exactly like env.step().",
      events: [
        [1, "Try: full heating from the start and a slow ramp. Then try no heating and the fastest ramp. Compare q_min."],
        [100, "The scheduled pedestal rises at 100 s whatever you do (unless you switch to the power-triggered pedestal)."],
      ],
    },
  };
  const EXTRA_STORY = (lab) => ({ intro: `${lab}: a recorded TORAX episode. Dashed lines are TORAX; the knobs panel replays the knobs it set there, or runs its network live on the Lab.`, events: [] });

  // ================================================================== the Lab
  function wLab(root) {
    root.classList.add("rt-lab");
    const S = {
      key: null, kind: null, label: "", actions: [], recs: [], torax: null, toraxProf: null, cursor: 0, playing: false, speed: 1,
      ctrl: "feedback", live: false, livePref: false, recorded: [], recKnobs: [], knobs: [], needle: null, liveNote: "",
      mode: "watch", running: false, drive: { rate: 0.2, nbi: 0, ecrh: 0, loc: 0.35 }, model: null,
      as: { pedMode: "scheduled", pedOn: 100, sawtooth: false, transportMul: 1, Zeff: 1.6 },
      colorBy: "Te", tab: "T", coils: false, pins: [], dirty: true,
      custom: { label: "Custom (your design)", qCap: 10, gate: "temp+plh", wQ: 1 / 50, wH: 1 / 50, wQmin: 1 / 150, wQ95: 1 / 150, pFgw: 0.02, pQmin: 0.01, pFlux: 0, fluxBudget: Infinity, endFgw: Infinity, endQ95: 0, endPenalty: -1000 },
    };
    const params = new URLSearchParams(location.search);
    let LAB = {}, PROF = {};
    const POLICY = {}; // exported networks, fetched when live mode is first switched on

    // ------------------------------------------------ layout
    const top = el("div", "lab-top");
    root.appendChild(top);
    const presetBox = el("div", "lab-presets");
    top.appendChild(presetBox);
    const presetBtns = {}, groups = {};
    for (const c of ["open", "feedback", "human"]) {
      const g = el("div", `lab-group ${CTRL[c].cls}`);
      g.appendChild(el("div", "lab-group-label", `<b>${CTRL[c].tag}</b> ${CTRL[c].what}`));
      groups[c] = el("div", "lab-group-chips");
      g.appendChild(groups[c]);
      presetBox.appendChild(g);
    }
    PRESETS.forEach((p) => {
      presetBtns[p.key] = button(groups[p.ctrl], p.label, () => load(p.key), "rt-chip lab-preset" + (p.kind === "lab" ? " lab-only" : ""));
    });
    const more = document.createElement("select");
    more.className = "rt-select";
    more.innerHTML = `<option value="">more…</option>` + Object.entries(EXTRA).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
    more.addEventListener("change", () => more.value && load(more.value));
    groups.feedback.appendChild(more);
    const story = el("div", "lab-story");
    top.appendChild(story);

    const grid = el("div", "lab-grid");
    root.appendChild(grid);
    function panel(cls, title, eqIds, extraHead) {
      const p = el("section", "lab-panel " + cls);
      const head = el("div", "lab-head");
      head.appendChild(el("span", "lab-title", title));
      const tools = el("span", "lab-tools");
      head.appendChild(tools);
      p.appendChild(head);
      const body = el("div", "lab-body");
      p.appendChild(body);
      let drawer = null;
      if (eqIds) {
        drawer = eqDrawer(p, eqIds);
        const b = button(tools, "∑ equations", () => {
          drawer.toggle();
          b.classList.toggle("on", !drawer.el.hidden);
        }, "rt-chip lab-eqbtn");
      }
      grid.appendChild(p);
      return { p, head, tools, body, drawer };
    }

    // ---- torus
    const pT = panel("lab-torus", "The plasma, live", ["q", "diffusion", "heat"]);
    const cbRow = el("span", "lab-seg");
    pT.tools.prepend(cbRow);
    const cbBtns = {};
    for (const [k, lab] of [["Te", "T_e"], ["j", "j"], ["q", "q"]]) {
      cbBtns[k] = button(cbRow, lab, () => {
        S.colorBy = k;
        for (const kk in cbBtns) cbBtns[kk].classList.toggle("on", kk === k);
      }, "rt-chip");
    }
    const coilBtn = button(pT.tools, "coils", () => {
      S.coils = !S.coils;
      coilBtn.classList.toggle("on", S.coils);
    }, "rt-chip");
    const tv = canvas(pT.body, root.clientWidth < 560 ? 300 : 370);
    const torus = makeTorus(tv, {});
    note(pT.body, "Drag to rotate. Colours: the chosen profile on two cut faces; red ring: the q = 1 surface; field lines on three flux surfaces wind with the local q.");

    // ---- controls and readouts
    const pC = panel("lab-ctl", "Time, controls and readouts", ["reward", "flux"]);
    const tRow = controls(pC.body);
    const playBtn = button(tRow, "Play", () => togglePlay(), "rt-primary");
    const tSl = slider(tRow, "time", 0, 151, 1, 0, (v) => v + " s", (v) => {
      S.cursor = Math.min(v, S.recs.length - 1);
      S.playing = false;
      playBtn.textContent = "Play";
      S.dirty = true;
    });
    const spd = document.createElement("select");
    spd.className = "rt-select";
    spd.innerHTML = [0.5, 1, 2, 4].map((v) => `<option value="${v}" ${v === 1 ? "selected" : ""}>${v}× speed</option>`).join("");
    spd.addEventListener("change", () => (S.speed = +spd.value));
    tRow.appendChild(spd);
    const actRow = controls(pC.body);
    const takeBtn = button(actRow, "Take the controls from here", () => takeControl(), "rt-btn");
    const pinBtn = button(actRow, "Pin this run", () => pinRun(), "rt-btn");
    const unpinBtn = button(actRow, "Clear pins", () => {
      S.pins = [];
      S.dirty = true;
    }, "rt-btn");
    const driveBox = el("div", "lab-drive");
    pC.body.appendChild(driveBox);
    driveBox.appendChild(el("div", "lab-sub", "Actuators (one action per second, like <code>env.step(a)</code>)"));
    const dRow1 = controls(driveBox);
    const dRate = slider(dRow1, "I_p ramp", -0.2, 0.2, 0.01, S.drive.rate, (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + " MA/s", (v) => (S.drive.rate = v));
    const dNbi = slider(dRow1, "NBI", 0, 33, 0.5, 0, (v) => v.toFixed(1) + " MW", (v) => (S.drive.nbi = v));
    const dEc = slider(dRow1, "ECRH", 0, 20, 0.5, 0, (v) => v.toFixed(1) + " MW", (v) => (S.drive.ecrh = v));
    const dLoc = slider(dRow1, "ECRH at ρ̂", 0, 0.8, 0.01, 0.35, (v) => v.toFixed(2), (v) => (S.drive.loc = v));
    const dRow2 = controls(driveBox);
    const runBtn = button(dRow2, "Run", () => {
      S.running = !S.running;
      runBtn.textContent = S.running ? "Pause" : "Run";
    }, "rt-primary");
    button(dRow2, "Step 1 s", () => {
      S.running = false;
      runBtn.textContent = "Run";
      driveStep();
    }, "rt-btn");
    button(dRow2, "Heating off", () => {
      dNbi.set(0);
      dEc.set(0);
      S.drive.nbi = S.drive.ecrh = 0;
    }, "rt-btn");
    button(dRow2, "Full heating", () => {
      dNbi.set(33);
      dEc.set(20);
      S.drive.nbi = 33;
      S.drive.ecrh = 20;
    }, "rt-btn");
    button(dRow2, "Hold I_p", () => {
      dRate.set(0);
      S.drive.rate = 0;
    }, "rt-btn");
    const stepInfo = el("div", "rt-note lab-stepinfo");
    driveBox.appendChild(stepInfo);
    const readout = el("div", "lab-readout");
    pC.body.appendChild(readout);

    // ---- the knobs: who turns them, and what they read
    const pK = panel("lab-knobs", "The knobs: who turns them, and what they read");
    const liveSeg = el("span", "lab-seg");
    pK.tools.prepend(liveSeg);
    const liveBtns = {
      rec: button(liveSeg, "recorded on TORAX", () => setLive((S.livePref = false)), "rt-chip"),
      live: button(liveSeg, "controller live on the Lab", () => setLive((S.livePref = true)), "rt-chip"),
    };
    const kBanner = el("div", "lab-kbanner");
    pK.body.appendChild(kBanner);
    const kGrid = el("div", "lab-kgrid");
    pK.body.appendChild(kGrid);
    const kLeft = el("div", ""), kRight = el("div", "");
    kGrid.append(kLeft, kRight);
    const kv = canvas(kLeft, 318);
    const ks = canvas(kRight, 318);

    // ---- traces
    const pX = panel("lab-traces", "Traces: the episode so far (solid: Lab, dashed: TORAX)", ["fusion", "ipb98", "plh"]);
    const xv = canvas(pX.body, 560);
    // ---- profiles
    const pP = panel("lab-prof", "Radial profiles at the cursor", ["heat", "pedestal"]);
    const tabRow = el("span", "lab-seg");
    pP.tools.prepend(tabRow);
    const tabBtns = {};
    const TAB_EQ = { T: ["heat", "sources", "pedestal"], j: ["diffusion", "eta", "bootstrap"], q: ["q", "sawtooth"], n: ["density", "greenwald"] };
    for (const [k, lab] of [["T", "T"], ["j", "j"], ["q", "q"], ["n", "n"]]) {
      tabBtns[k] = button(tabRow, lab, () => {
        S.tab = k;
        for (const kk in tabBtns) tabBtns[kk].classList.toggle("on", kk === k);
        pP.drawer.set(TAB_EQ[k]);
        S.dirty = true;
      }, "rt-chip");
    }
    const pv = canvas(pP.body, 270);
    // ---- operating space
    const pO = panel("lab-ops", "Operating space", ["greenwald", "q", "betaN"]);
    const ov = canvas(pO.body, 270);
    // ---- reward / benchmark designer
    const pR = panel("lab-reward", "Reward and benchmark designer", ["reward", "audited"]);
    const scoreBox = el("div", "lab-scores");
    pR.body.appendChild(scoreBox);
    const rv = canvas(pR.body, 150);
    const custom = el("details", "lab-custom");
    custom.innerHTML = "<summary>Design your own reward (the ‘custom’ column)</summary>";
    pR.body.appendChild(custom);
    const cRow1 = controls(custom), cRow2 = controls(custom);
    function select(parent, label, opts, value, on) {
      const wrap = el("label", "rt-ctl");
      wrap.appendChild(el("span", "rt-ctl-label", label));
      const s = document.createElement("select");
      s.className = "rt-select";
      s.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
      s.value = String(value);
      s.addEventListener("change", () => on(s.value));
      wrap.appendChild(s);
      parent.appendChild(wrap);
      return s;
    }
    select(cRow1, "Q cap", [["Infinity", "none"], ["10", "10"], ["5", "5"]], S.custom.qCap, (v) => ((S.custom.qCap = +v), (S.dirty = true)));
    select(cRow1, "gate", [["temp", "T_e(0), T_i(0) > 10 keV"], ["temp+plh", "… and P_SOL ≥ P_LH"], ["pedestal", "pedestal up and P_SOL ≥ P_LH"]], S.custom.gate, (v) => ((S.custom.gate = v), (S.dirty = true)));
    slider(cRow2, "Greenwald penalty", 0, 0.05, 0.001, S.custom.pFgw, (v) => v.toFixed(3) + "/s", (v) => ((S.custom.pFgw = v), (S.dirty = true)));
    slider(cRow2, "q_min < 1 penalty", 0, 0.05, 0.001, S.custom.pQmin, (v) => v.toFixed(3) + "/s", (v) => ((S.custom.pQmin = v), (S.dirty = true)));
    const cRow3 = controls(custom);
    select(cRow3, "end episode if f_GW >", [["Infinity", "never"], ["1", "1.0"], ["1.1", "1.1"], ["1.2", "1.2"]], "Infinity", (v) => ((S.custom.endFgw = +v), (S.dirty = true)));
    select(cRow3, "or q95 <", [["0", "never"], ["2", "2"], ["2.5", "2.5"], ["3", "3"]], "0", (v) => ((S.custom.endQ95 = +v), (S.dirty = true)));
    select(cRow3, "with", [["-1000", "−1000"], ["-10", "−10"], ["-1", "−1"], ["0", "0"]], "-1000", (v) => ((S.custom.endPenalty = +v), (S.dirty = true)));
    const audit = el("div", "lab-audit");
    pR.body.appendChild(audit);
    // ---- assumptions
    const pA = panel("lab-assume", "Simulator assumptions (what the benchmark fixes)", ["pedestal", "sawtooth", "eta"]);
    const aRow1 = controls(pA.body), aRow2 = controls(pA.body);
    const pedBtns = {};
    for (const [k, lab] of [["scheduled", "pedestal: scheduled (Gym-TORAX)"], ["power", "pedestal: power-triggered"]]) {
      pedBtns[k] = button(aRow1, lab, () => {
        S.as.pedMode = k;
        for (const kk in pedBtns) pedBtns[kk].classList.toggle("on", kk === k);
        resim();
      }, "rt-chip");
    }
    const sawBtn = button(aRow1, "sawtooth model", () => {
      S.as.sawtooth = !S.as.sawtooth;
      sawBtn.classList.toggle("on", S.as.sawtooth);
      resim();
    }, "rt-chip");
    const aPed = slider(aRow2, "pedestal onset", 60, 140, 1, 100, (v) => v + " s", (v) => ((S.as.pedOn = v), resimSoon()));
    const aChi = slider(aRow2, "transport ×", 0.5, 2, 0.05, 1, (v) => v.toFixed(2), (v) => ((S.as.transportMul = v), resimSoon()));
    const aZ = slider(aRow2, "Z_eff", 1.2, 3, 0.05, 1.6, (v) => v.toFixed(2), (v) => ((S.as.Zeff = v), resimSoon()));
    button(aRow2, "Reset", () => {
      Object.assign(S.as, { pedMode: "scheduled", pedOn: 100, sawtooth: false, transportMul: 1, Zeff: 1.6 });
      aPed.set(100);
      aChi.set(1);
      aZ.set(1.6);
      for (const kk in pedBtns) pedBtns[kk].classList.toggle("on", kk === "scheduled");
      sawBtn.classList.remove("on");
      resim();
    }, "rt-btn");
    const aNote = note(pA.body, "Changing an assumption re-runs the episode. Open-loop presets, and feedback presets in <i>recorded</i> mode, replay the same knob sequence; a feedback preset switched to <i>controller live on the Lab</i> reads the changed plasma and turns its knobs differently (watch the knobs panel). Testing that difference on TORAX is the ‘control level’ of the benchmark.");

    // ------------------------------------------------ simulation
    const overrides = () => ({ pedMode: S.as.pedMode, pedOn: S.as.pedOn, sawtooth: S.as.sawtooth, transportMul: S.as.transportMul, Zeff: S.as.Zeff });
    function makeCtrl(key) {
      const p = presetOf(key);
      if (!RC || !p || !p.live) return null;
      if (p.live === "pi") return RC.piController();
      return POLICY[key] ? RC.learnedController(POLICY[key]) : null;
    }
    function simulate() {
      const m = M.create(overrides());
      const recs = [m.state.last];
      const ctrl = S.live && S.mode === "watch" ? makeCtrl(S.key) : null;
      if (ctrl) {
        // closed loop: the controller reads the Lab's plasma every second
        ctrl.reset();
        const acts = [], knobs = [];
        let d = m.state.last;
        for (let t = 0; t < 151; t++) {
          const a = ctrl.act(d);
          acts.push({ Ip: a.Ip, nbi: a.nbi, ecrh: a.ecrh });
          knobs.push(a.info);
          d = m.step(acts[t]);
          recs.push(d);
          if (d.failed) break;
        }
        S.actions = acts;
        S.knobs = knobs;
      } else {
        for (const a of S.actions) {
          const d = m.step(a);
          recs.push(d);
          if (d.failed) break;
        }
        S.knobs = S.recKnobs.slice(0, S.actions.length);
      }
      S.model = m;
      S.recs = recs;
      S.cursor = Math.min(S.cursor, recs.length - 1);
      S.dirty = true;
    }
    // What a recorded controller saw and proposed, where the recording allows it: PI's error and integral
    // (re-computed from TORAX's j(0), which is exactly what it read), residual agents' PI proposal and correction.
    function recordedKnobInfo(key, e) {
      if (!e || !RC) return [];
      if (key === "pi") {
        const pi = RC.makePI(), j0 = [null, ...e.torax.j0];
        j0[0] = e.j0_initial || e.torax.j0[0];
        return e.actions.Ip.map((_, t) => ({ pi: pi.act(j0[t] * 1e6).sig }));
      }
      if (e.actions.base) {
        const sc = e.scale;
        return e.actions.base.map((b, t) => {
          const u = e.actions.res[t];
          return { base: b, u, total: b.map((v, i) => clamp(v + sc[i] * u[i], -1, 1)), scale: sc };
        });
      }
      return [];
    }
    async function setLive(on) {
      const p = presetOf(S.key);
      if (on && (!p || !p.live || S.mode !== "watch")) return;
      if (on && p.live === "policy" && !POLICY[S.key]) {
        const key = S.key;
        S.liveNote = "loading the network…";
        S.dirty = true;
        try {
          POLICY[key] = await getJSON("policies/" + key);
          const err = RC.selfCheck(POLICY[key]);
          if (err > 1e-3) console.warn(`Lab: ${key} network differs from PyTorch by ${err}`);
        } catch (e) {
          S.liveNote = "could not load the network";
          S.dirty = true;
          return;
        }
        if (S.key !== key) return; // another preset was loaded meanwhile
      }
      S.liveNote = "";
      S.live = on;
      if (!on) S.actions = S.recorded.slice();
      simulate();
    }
    let rsT = null;
    function resimSoon() {
      clearTimeout(rsT);
      rsT = setTimeout(resim, 120);
    }
    function resim() {
      simulate();
      S.dirty = true;
    }
    function actionsFromTorax(e) {
      return e.actions.Ip.map((ip, i) => ({ Ip: ip * 1e6, nbi: (e.actions.nbi[i] || 0) * 1e6, ecrh: (e.actions.ecrh[i] || 0) * 1e6 }));
    }
    function load(key) {
      const p = presetOf(key);
      S.key = key;
      S.kind = p.kind;
      S.label = p.label;
      S.ctrl = p.ctrl;
      S.recKnobs = [];
      S.liveNote = "";
      if (!p.live) S.live = false;
      S.running = false;
      runBtn.textContent = "Run";
      for (const k in presetBtns) presetBtns[k].classList.toggle("on", k === key);
      more.value = EXTRA[key] ? key : "";
      more.classList.toggle("on", !!EXTRA[key]);
      S.torax = null;
      S.toraxProf = null;
      if (p.kind === "torax" && LAB[key]) {
        S.actions = actionsFromTorax(LAB[key]);
        S.torax = LAB[key];
        S.toraxProf = PROF[key] || null;
        S.recKnobs = recordedKnobInfo(key, LAB[key]);
        S.mode = "watch";
      } else if (p.kind === "lab") {
        S.actions = Array.from({ length: 151 }, (_, t) => LAB_ACTIONS[key](t));
        S.mode = "watch";
      } else {
        S.actions = [];
        S.mode = "drive";
        dRate.set(0.2);
        dNbi.set(0);
        dEc.set(0);
        dLoc.set(0.35);
        Object.assign(S.drive, { rate: 0.2, nbi: 0, ecrh: 0, loc: 0.35 });
      }
      S.recorded = S.actions.slice();
      const wantLive = S.livePref && p.live;
      S.live = false;
      simulate();
      if (wantLive) setLive(true); // keeps live mode across presets; replays until the network has loaded
      S.cursor = 0;
      S.playing = false;
      playBtn.textContent = "Play";
      driveBox.hidden = S.mode !== "drive";
      takeBtn.hidden = S.mode === "drive";
      renderStory(STORIES[key] || EXTRA_STORY(p.label));
      S.dirty = true;
    }
    function renderStory(st) {
      story.innerHTML = "";
      story.appendChild(el("p", "lab-intro", st.intro));
      if (st.events.length) {
        const ul = el("ol", "lab-events");
        st.events.forEach(([t, text]) => {
          const li = el("li", "");
          const b = el("button", "lab-t", `t = ${t} s`);
          b.type = "button";
          b.addEventListener("click", () => {
            S.cursor = Math.min(t, S.recs.length - 1);
            S.playing = false;
            playBtn.textContent = "Play";
            S.dirty = true;
          });
          li.append(b, document.createTextNode(" " + text));
          ul.appendChild(li);
        });
        story.appendChild(ul);
      }
    }
    function togglePlay() {
      if (S.mode === "drive") {
        S.running = !S.running;
        runBtn.textContent = S.running ? "Pause" : "Run";
        return;
      }
      if (S.cursor >= S.recs.length - 1) S.cursor = 0;
      S.playing = !S.playing;
      playBtn.textContent = S.playing ? "Pause" : "Play";
    }
    function takeControl() {
      const t = S.cursor;
      S.actions = S.actions.slice(0, t);
      S.recKnobs = S.knobs.slice(0, t);
      S.kind = "sandbox";
      S.ctrl = "human";
      S.live = false;
      S.mode = "drive";
      S.label = `${S.label} → you, from t = ${t} s`;
      simulate();
      S.cursor = S.recs.length - 1;
      const last = S.actions[t - 1] || { nbi: 0, ecrh: 0 };
      dRate.set(0);
      dNbi.set(last.nbi / 1e6);
      dEc.set(last.ecrh / 1e6);
      Object.assign(S.drive, { rate: 0, nbi: last.nbi / 1e6, ecrh: last.ecrh / 1e6 });
      driveBox.hidden = false;
      takeBtn.hidden = true;
      S.playing = false;
      playBtn.textContent = "Play";
      for (const k in presetBtns) presetBtns[k].classList.toggle("on", false);
      story.querySelector(".lab-intro").textContent = `You took over at t = ${t} s. Your actions are recorded; pin the run to compare it with the original.`;
      S.dirty = true;
    }
    function driveStep() {
      if (S.recs.length - 1 >= 151) {
        S.running = false;
        runBtn.textContent = "Run";
        return;
      }
      const ip = S.model.state.Ip;
      const a = { Ip: ip + S.drive.rate * 1e6, nbi: S.drive.nbi * 1e6, ecrh: S.drive.ecrh * 1e6, ecrhLoc: S.drive.loc };
      S.actions.push(a);
      S.knobs.push(null);
      const d = S.model.step(a);
      S.recs.push(d);
      S.cursor = S.recs.length - 1;
      const r = M.rewardTerms(d, M.REWARD_PRESETS.benchmark);
      stepInfo.innerHTML = `Last step: a = (ΔI_p ${S.drive.rate >= 0 ? "+" : ""}${S.drive.rate.toFixed(2)} MA, NBI ${S.drive.nbi.toFixed(1)} MW, ECRH ${S.drive.ecrh.toFixed(1)} MW) → r = <b>${r.total.toFixed(4)}</b> (benchmark)` + (S.recs.length - 1 >= 151 ? " · <b>episode over</b> (151 steps)" : "");
      if (d.failed || S.recs.length - 1 >= 151) {
        S.running = false;
        runBtn.textContent = "Run";
      }
      S.dirty = true;
    }
    const PIN_COLORS = ["#8f7fe0", "#9aa0a6", "#d47fb0"];
    function pinRun() {
      if (S.pins.length >= 3) S.pins.shift();
      S.pins.push({ label: S.label + (S.live ? " (live on the Lab)" : "") + (S.as.pedMode !== "scheduled" || S.as.transportMul !== 1 || S.as.sawtooth || S.as.pedOn !== 100 || S.as.Zeff !== 1.6 ? " (modified assumptions)" : ""), recs: S.recs.slice() });
      S.pins.forEach((p, i) => (p.color = PIN_COLORS[i]));
      S.dirty = true;
    }

    // ------------------------------------------------ drawing
    const ghostAt = (k, t) => (S.torax && S.torax.torax[k] && t >= 1 ? S.torax.torax[k][t - 1] : null);
    function scores(recs) {
      const rs = recs.slice(1);
      return {
        b: M.scoreEpisode(rs, M.REWARD_PRESETS.benchmark),
        a: M.scoreEpisode(rs, M.REWARD_PRESETS.audited),
        c: M.scoreEpisode(rs, S.custom),
      };
    }
    function drawTorus() {
      const d = S.recs[S.cursor] || S.recs[0];
      const val = S.colorBy === "Te" ? d.prof.Te : S.colorBy === "j" ? d.prof.j : d.prof.q;
      const crashRecent = d.crashes && S.cursor > 0 && S.recs[S.cursor - 1] && d.crashes > S.recs[S.cursor - 1].crashes;
      const gated = d.Te0 > 10 && d.Ti0 > 10;
      torus.draw({
        q: d.prof.q, val, colorBy: S.colorBy, nbi: d.Pnbi, ecrh: d.Pecrh, ecrhLoc: d.ecrhLoc, Ip: d.Ip, coils: S.coils, flux: d.flux,
        flash: crashRecent ? 1 : 0,
        overlay: [`t = ${d.t} s   I_p = ${d.Ip.toFixed(2)} MA`, `T_e(0) = ${d.Te0.toFixed(1)} keV   q_min = ${d.qmin.toFixed(2)}`, `Q = ${d.Q < 100 ? d.Q.toFixed(2) : d.Q.toFixed(0)}`],
        badge: gated ? (d.psolPlh >= 1 ? { text: "paid as H-mode", color: "#1baf7a" } : { text: "paid as H-mode, P_SOL < P_LH", color: "#e34948" }) : d.hped > 0.5 ? { text: "pedestal up", color: "#c98500" } : { text: "L-mode", color: "#6b6390" },
      });
    }
    function drawReadout() {
      const d = S.recs[S.cursor] || S.recs[0];
      const g = (k) => ghostAt(k, d.t);
      const cell = (lab, v, gv, unit, eq) =>
        `<div class="lab-ro"><span>${eq ? `<a href="${eqLink(eq)}">${lab}</a>` : lab}</span><b>${v}</b>${gv !== null && gv !== undefined ? `<i>TORAX ${gv}</i>` : ""}${unit ? `<em>${unit}</em>` : ""}</div>`;
      const f = (v, n) => (v === null || v === undefined ? null : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(n));
      readout.innerHTML =
        cell("t", d.t, null, "s") + cell("I_p", f(d.Ip, 2), f(g("Ip"), 2), "MA") + cell("P_NBI + P_ECRH", f(d.Pnbi + d.Pecrh, 1), null, "MW") +
        cell("T_e(0)", f(d.Te0, 1), f(g("Te0"), 1), "keV", "heat") + cell("T_i(0)", f(d.Ti0, 1), f(g("Ti0"), 1), "keV", "heat") +
        cell("j(0)", f(d.j0, 2), f(g("j0"), 2), "MA/m²", "diffusion") + cell("q_min", f(d.qmin, 2), f(g("qmin"), 2), "", "q") +
        cell("q95", f(d.q95, 2), f(g("q95"), 2), "", "q") + cell("Q", f(d.Q, 2), f(g("Q"), 2), "", "fusion") + cell("H98", f(d.H98, 2), f(g("H98"), 2), "", "ipb98") +
        cell("f_GW", f(d.fgw, 2), f(g("fgw"), 2), "", "greenwald") + cell("P_SOL / P_LH", f(d.psolPlh, 2), f(g("psolPlh"), 2), "", "plh") +
        cell("β_N", f(d.betaN, 2), f(g("betaN"), 2), "", "betaN") + cell("P_fus", f(d.Pfus, 0), null, "MW", "fusion") + cell("I_bootstrap", f(d.Ibs, 2), null, "MA", "bootstrap") +
        cell("V_loop", f(d.Vloop, 2), null, "V", "flux") + cell("resistive flux", f(d.flux, 0), null, "Wb", "flux") + cell("pedestal T", f(d.Tped, 2), null, "keV", "pedestal");
    }
    const cum = (per) => {
      let s = 0;
      return per.map((p) => (s += p.total));
    };
    function drawTraces(sc) {
      const col = colors();
      const { ctx, w, h } = xv;
      ctx.clearRect(0, 0, w, h);
      const rows = [
        { t: "plasma current I_p [MA]", yr: [0, 16], s: [["Ip", col.series[0]]], g: ["Ip"] },
        { t: "heating [MW]: NBI, ECRH", yr: [0, 56], heat: true },
        { t: "core T_e(0) (orange), T_i(0) (blue) [keV]", yr: [0, 32], s: [["Te0", col.series[1]], ["Ti0", col.series[0]]], g: ["Te0", "Ti0"], hl: [[10, col.bad]] },
        { t: "q_min (green), q95 (blue)", yr: [0, 7], s: [["qmin", col.series[2]], ["q95", col.series[0]]], g: ["qmin", "q95"], hl: [[1, col.bad], [3, col.muted]] },
        { t: "fusion gain Q (log)", yr: [0.01, 1000], log: true, s: [["Q", col.accent]], g: ["Q"] },
        { t: "f_GW (orange), P_SOL/P_LH (green)", yr: [0, 2.6], s: [["fgw", col.series[1]], ["psolPlh", col.series[2]]], g: ["fgw", "psolPlh"], hl: [[1, col.bad]] },
        { t: "return: benchmark, audited, custom", cum: true },
      ];
      const pad = 44, gap = 22, n = rows.length, rh = (h - 40 - gap * (n - 1)) / n;
      const T = 151;
      const recs = S.recs;
      const upto = S.cursor;
      const xs = (fr, k) => fr.sx(k);
      const cB = cum(sc.b.per), cA = cum(sc.a.per), cC = cum(sc.c.per);
      const maxCum = Math.max(4, ...cB, ...cC, ...(S.torax ? S.torax.torax.cum : [0])) * 1.08;
      const minCum = Math.min(0, ...cC, ...cB);
      xv.rows = [];
      rows.forEach((r, i) => {
        const box = { x: pad, y: 16 + i * (rh + gap), w: w - pad - 12, h: rh };
        const yr = r.cum ? [Math.max(minCum, -5), maxCum] : r.yr;
        const fr = frame(ctx, col, box, [0, T], yr, { title: r.t, logy: r.log, noXLabels: i !== n - 1, xlabel: i === n - 1 ? "time [s]" : "", yticks: r.log ? [0.01, 1, 100] : undefined });
        xv.rows.push([box, fr]);
        ctx.save();
        ctx.fillStyle = col.grid;
        ctx.fillRect(fr.sx(S.as.pedMode === "scheduled" ? S.as.pedOn : 0), box.y, S.as.pedMode === "scheduled" ? fr.sx(S.as.pedOn + 4) - fr.sx(S.as.pedOn) : 0, box.h);
        ctx.restore();
        (r.hl || []).forEach(([v, c]) => hline(ctx, box, fr.sy(v), c));
        const cl = (v) => (r.log ? clamp(v, yr[0], yr[1]) : clamp(v, yr[0] - 0.02 * (yr[1] - yr[0]), yr[1] * 1.02));
        // pinned runs
        S.pins.forEach((pn) => {
          if (r.heat) return;
          if (r.cum) {
            const c = cum(M.scoreEpisode(pn.recs.slice(1), M.REWARD_PRESETS.benchmark).per);
            line(ctx, c.map((v, k) => [fr.sx(k + 1), fr.sy(clamp(v, yr[0], yr[1]))]), pn.color, 1.4);
            return;
          }
          r.s.forEach(([k]) => line(ctx, pn.recs.map((d) => [fr.sx(d.t), fr.sy(cl(d[k]))]), pn.color, 1.3));
        });
        if (r.heat) {
          const top = (k, f) => recs.slice(0, upto + 1).map((d) => [fr.sx(d.t), fr.sy(f(d))]);
          const area = (pts, base, c) => {
            if (pts.length < 2) return;
            ctx.save();
            ctx.fillStyle = c;
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            for (let k = base.length - 1; k >= 0; k--) ctx.lineTo(base[k][0], base[k][1]);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          };
          const base0 = top(0, () => 0), nb = top(0, (d) => d.Pnbi), tot = top(0, (d) => d.Pnbi + d.Pecrh);
          area(nb, base0, "rgb(255,140,40)");
          area(tot, nb, "rgb(60,200,235)");
          if (S.torax) {
            const ga = S.torax.torax;
            line(ctx, ga.Pnbi.map((v, k) => [fr.sx(k + 1), fr.sy((v || 0) + (ga.Pecrh[k] || 0))]), col.muted, 1.2, [4, 3]);
          }
        } else if (r.cum) {
          if (S.torax) line(ctx, S.torax.torax.cum.map((v, k) => [fr.sx(k + 1), fr.sy(clamp(v, yr[0], yr[1]))]), col.muted, 1.4, [5, 4]);
          [[cB, col.series[0]], [cA, col.series[2]], [cC, col.accent]].forEach(([c, colr]) =>
            line(ctx, c.slice(0, upto).map((v, k) => [fr.sx(k + 1), fr.sy(clamp(v, yr[0], yr[1]))]), colr, 2));
        } else {
          r.s.forEach(([k, c], si) => {
            if (S.torax && r.g && r.g[si] && S.torax.torax[r.g[si]]) line(ctx, S.torax.torax[r.g[si]].map((v, j) => [fr.sx(j + 1), fr.sy(cl(v))]), c, 1.2, [4, 3]);
            line(ctx, recs.slice(0, upto + 1).map((d) => [fr.sx(d.t), fr.sy(cl(d[k]))]), c, 2);
          });
        }
        const xc = fr.sx(S.cursor);
        ctx.save();
        ctx.strokeStyle = col.accent;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(xc, box.y);
        ctx.lineTo(xc, box.y + box.h);
        ctx.stroke();
        ctx.restore();
      });
      if (S.pins.length) {
        ctx.font = FONT_SMALL;
        let x = pad;
        S.pins.forEach((pn) => {
          ctx.fillStyle = pn.color;
          ctx.fillRect(x, h - 10, 10, 3);
          ctx.fillStyle = col.muted;
          const lab = "pinned: " + pn.label;
          ctx.fillText(lab, x + 14, h - 5);
          x += ctx.measureText(lab).width + 30;
        });
      }
    }
    function scrubFrom(ev, cv) {
      const rect = cv.c.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const hit = (cv.rows || [])[0];
      if (!hit) return;
      const [box] = hit;
      const t = Math.round(((x - box.x) / box.w) * 151);
      S.cursor = clamp(t, 0, S.recs.length - 1);
      S.playing = false;
      playBtn.textContent = "Play";
      S.dirty = true;
    }
    let scrubbing = false;
    for (const cv of [xv, ks]) {
      cv.c.addEventListener("pointerdown", (e) => {
        scrubbing = cv;
        scrubFrom(e, cv);
      });
      cv.c.addEventListener("pointermove", (e) => {
        if (scrubbing === cv) scrubFrom(e, cv);
      });
    }
    window.addEventListener("pointerup", () => (scrubbing = false));

    function drawProfiles() {
      const col = colors();
      const { ctx, w, h } = pv;
      ctx.clearRect(0, 0, w, h);
      const d = S.recs[S.cursor] || S.recs[0], d0 = S.recs[0];
      const rho = S.model ? S.model.rho : d.prof.Te.map((_, i, a) => i / (a.length - 1));
      const box = { x: 46, y: 24, w: w - 62, h: h - 64 };
      const gp = S.toraxProf && d.t >= 1 ? S.toraxProf : null;
      const gIdx = d.t - 1;
      const gl = (arr) => {
        if (!gp || !arr || !arr[gIdx]) return;
        const row = arr[gIdx], m = row.length;
        return row.map((v, i) => [i / (m - 1), v]);
      };
      const tab = S.tab;
      let fr;
      if (tab === "T") {
        const ymax = Math.max(6, d.Te0 * 1.15, (ghostAt("Te0", d.t) || 0) * 1.1);
        fr = frame(ctx, col, box, [0, 1], [0, ymax], { title: "T_e (orange), T_i (blue) [keV]; dashed: TORAX T_e", xlabel: "ρ̂" });
        hline(ctx, box, fr.sy(10), col.muted, "10 keV");
        line(ctx, d0.prof.Te.map((v, i) => [fr.sx(rho[i]), fr.sy(v)]), col.grid, 1.2, [2, 3]);
        const g = gl(gp && gp.T_e);
        if (g) line(ctx, g.map(([x, v]) => [fr.sx(x), fr.sy(v)]), col.series[1], 1.3, [5, 4]);
        line(ctx, d.prof.Ti.map((v, i) => [fr.sx(rho[i]), fr.sy(v)]), col.series[0], 2.2);
        line(ctx, d.prof.Te.map((v, i) => [fr.sx(rho[i]), fr.sy(v)]), col.series[1], 2.4);
        ctx.save();
        ctx.strokeStyle = col.muted;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(fr.sx(0.91), box.y);
        ctx.lineTo(fr.sx(0.91), box.y + box.h);
        ctx.stroke();
        ctx.fillStyle = col.muted;
        ctx.font = FONT_SMALL;
        ctx.textAlign = "right";
        ctx.fillText(`pedestal ${d.Tped.toFixed(1)} keV`, fr.sx(0.9), box.y + 12);
        ctx.restore();
      } else if (tab === "j") {
        const ymax = Math.max(1, ...d.prof.j.slice(0, -1)) * 1.2;
        fr = frame(ctx, col, box, [0, 1], [0, ymax], { title: "j total (blue); shaded: bootstrap (green) + driven (orange) [MA/m²]", xlabel: "ρ̂" });
        const jbs = d.prof.jbs, jdr = d.prof.jni.map((v, i) => Math.max(0, v - jbs[i]));
        const fillBetween = (lo, hi, c) => {
          ctx.save();
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          hi.forEach((v, i) => (i ? ctx.lineTo(fr.sx(rho[i]), fr.sy(v)) : ctx.moveTo(fr.sx(rho[i]), fr.sy(v))));
          for (let i = lo.length - 1; i >= 0; i--) ctx.lineTo(fr.sx(rho[i]), fr.sy(lo[i]));
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        };
        const zeros = jbs.map(() => 0), stack = jbs.map((v, i) => v + jdr[i]);
        fillBetween(zeros, jbs, col.series[2]);
        fillBetween(jbs, stack, col.series[1]);
        line(ctx, d0.prof.j.map((v, i) => [fr.sx(rho[i]), fr.sy(v)]), col.muted, 1.2, [2, 3]);
        const g = gl(gp && gp.j_total);
        if (g) line(ctx, g.map(([x, v]) => [fr.sx(x), fr.sy(v)]), col.series[0], 1.3, [5, 4]);
        line(ctx, d.prof.j.map((v, i) => [fr.sx(rho[i]), fr.sy(v)]), col.series[0], 2.4);
      } else if (tab === "q") {
        fr = frame(ctx, col, box, [0, 1], [0, 6], { title: "safety factor q; dashed: TORAX; red: q = 1", xlabel: "ρ̂" });
        hline(ctx, box, fr.sy(1), col.bad, "q = 1 (sawteeth)");
        hline(ctx, box, fr.sy(1.5), col.grid, "3/2");
        hline(ctx, box, fr.sy(2), col.grid, "2");
        line(ctx, d0.prof.q.map((v, i) => [fr.sx(rho[i]), fr.sy(Math.min(v, 6.3))]), col.muted, 1.2, [2, 3]);
        const g = gl(gp && gp.q);
        if (g) line(ctx, g.map(([x, v]) => [fr.sx(x), fr.sy(Math.min(v, 6.3))]), col.series[1], 1.3, [5, 4]);
        line(ctx, d.prof.q.map((v, i) => [fr.sx(rho[i]), fr.sy(Math.min(v, 6.3))]), col.series[1], 2.4);
        ctx.fillStyle = col.accent;
        ctx.beginPath();
        ctx.arc(fr.sx(d.rhoQmin), fr.sy(Math.min(6, d.qmin)), 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(fr.sx(0.95), fr.sy(Math.min(6, d.q95)), 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.font = FONT_SMALL;
        ctx.fillText("q95", fr.sx(0.95) - 24, fr.sy(Math.min(6, d.q95)) - 6);
      } else {
        const nG = M.greenwald(d.Ip, 2);
        const ymax = Math.max(1.6, nG * 1.2, ...d.prof.n) * 1.05;
        fr = frame(ctx, col, box, [0, 1], [0, ymax], { title: "electron density n_e [10²⁰ m⁻³]; red: Greenwald density n_G", xlabel: "ρ̂" });
        hline(ctx, box, fr.sy(nG), col.bad, `n_G = I_p/πa² = ${nG.toFixed(2)}`);
        line(ctx, d.prof.n.map((v, i) => [fr.sx(rho[i]), fr.sy(v)]), col.series[1], 2.4);
        hline(ctx, box, fr.sy(d.nbar), col.series[1], `line average ${d.nbar.toFixed(2)} (f_GW ${d.fgw.toFixed(2)})`, true);
      }
    }
    function drawOps() {
      const col = colors();
      const { ctx, w, h } = ov;
      ctx.clearRect(0, 0, w, h);
      const box = { x: 46, y: 24, w: w - 62, h: h - 64 };
      const fr = frame(ctx, col, box, [0, 1.5], [0, 0.6], { title: "1/q95 against Greenwald fraction (a Hugill-style map)", xlabel: "Greenwald fraction f_GW = n̄ / n_G" });
      ctx.save();
      ctx.fillStyle = col.bad;
      ctx.globalAlpha = 0.1;
      ctx.fillRect(fr.sx(1), box.y, fr.sx(1.5) - fr.sx(1), box.h);
      ctx.fillRect(box.x, box.y, box.w, fr.sy(0.5) - box.y);
      ctx.restore();
      hline(ctx, box, fr.sy(1 / 3), col.muted, "q95 = 3: the reward's knee", true);
      hline(ctx, box, fr.sy(0.5), col.bad, "q95 = 2: disruptive", true);
      ctx.save();
      ctx.strokeStyle = col.bad;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(fr.sx(1), box.y);
      ctx.lineTo(fr.sx(1), box.y + box.h);
      ctx.stroke();
      ctx.fillStyle = col.bad;
      ctx.font = FONT_SMALL;
      ctx.fillText("density limit", fr.sx(1) + 4, box.y + box.h - 6);
      ctx.restore();
      const pts = (recs, upto) => recs.slice(0, upto + 1).map((d) => [fr.sx(clamp(d.fgw, 0, 1.5)), fr.sy(clamp(1 / d.q95, 0, 0.6))]);
      S.pins.forEach((pn) => line(ctx, pts(pn.recs, pn.recs.length), pn.color, 1.3));
      if (S.torax) {
        const g = S.torax.torax;
        line(ctx, g.fgw.map((v, k) => [fr.sx(clamp(v, 0, 1.5)), fr.sy(clamp(1 / g.q95[k], 0, 0.6))]), col.muted, 1.3, [5, 4]);
      }
      line(ctx, pts(S.recs, S.cursor), col.series[0], 2.2);
      const d = S.recs[S.cursor];
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(fr.sx(clamp(d.fgw, 0, 1.5)), fr.sy(clamp(1 / d.q95, 0, 0.6)), 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = col.muted;
      ctx.font = FONT_SMALL;
      ctx.fillText(`β_N = ${d.betaN.toFixed(2)}`, box.x + 6, box.y + 14);
    }
    function drawReward(sc) {
      const col = colors();
      const { ctx, w, h } = rv;
      ctx.clearRect(0, 0, w, h);
      const k = S.cursor - 1;
      const rows = [["benchmark", sc.b], ["audited", sc.a], ["custom", sc.c]];
      const vals = rows.map(([, s]) => (k >= 0 && s.per[k] ? s.per[k] : { fusion: 0, h98: 0, qmin: 0, q95: 0, penalty: 0, total: 0 }));
      const xmax = Math.max(0.05, ...vals.map((v) => v.fusion + v.h98 + v.qmin + v.q95)) * 1.15;
      const xmin = Math.min(0, ...vals.map((v) => v.penalty));
      const box = { x: 86, y: 26, w: w - 190, h: h - 56 };
      const fr = frame(ctx, col, box, [xmin, xmax], [0, 3], { xlabel: `reward in the second ending at t = ${Math.max(0, S.cursor)} s`, yticks: [] });
      const names = [["fusion", col.series[0], "fusion gain"], ["h98", col.series[1], "H98"], ["qmin", col.series[2], "q_min"], ["q95", col.series[3], "q95"]];
      vals.forEach((v, i) => {
        const y = box.y + 6 + i * (box.h / 3);
        const bh = box.h / 3 - 10;
        let x0 = 0;
        names.forEach(([key, c]) => {
          const xa = fr.sx(x0), xb = fr.sx(x0 + v[key]);
          ctx.fillStyle = c;
          ctx.fillRect(xa, y, Math.max(0, xb - xa - 1), bh);
          x0 += v[key];
        });
        if (v.penalty < 0) {
          ctx.fillStyle = col.bad;
          ctx.fillRect(fr.sx(v.penalty), y, fr.sx(0) - fr.sx(v.penalty), bh);
        }
        ctx.fillStyle = col.fg;
        ctx.font = FONT;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(rows[i][0], box.x - 8, y + bh / 2);
        ctx.textAlign = "left";
        ctx.fillText(v.total.toFixed(4), fr.sx(Math.max(x0, 0)) + 6, y + bh / 2);
        ctx.textBaseline = "alphabetic";
      });
      ctx.font = FONT_SMALL;
      let lx = box.x;
      names.forEach(([, c, nm]) => {
        ctx.fillStyle = c;
        ctx.fillRect(lx, 6, 10, 10);
        ctx.fillStyle = col.muted;
        ctx.fillText(nm, lx + 14, 15);
        lx += ctx.measureText(nm).width + 30;
      });
    }
    function drawScores(sc) {
      const full = S.recs.length - 1;
      const fmtR = (s) => (s.endT ? `${s.ret.toFixed(2)}<small>ended at ${s.endT} s: ${s.why}</small>` : s.ret.toFixed(2));
      const torWhat = S.kind === "sandbox" ? "the original episode, before you took over" : S.live ? "the same controller on the real simulator" : "same actions on the real simulator";
      const tor = S.torax ? `<div class="lab-score muted"><span>TORAX, benchmark</span><b>${S.torax.benchmark.toFixed(2)}</b><small>${torWhat}</small></div>` : "";
      scoreBox.innerHTML =
        `<div class="lab-score b"><span>benchmark</span><b>${fmtR(sc.b)}</b><small>IterHybrid-v0, ${full} of 151 s</small></div>` +
        `<div class="lab-score a"><span>audited</span><b>${fmtR(sc.a)}</b><small>Q ≤ 10, H-mode needs P_SOL ≥ P_LH</small></div>` +
        `<div class="lab-score c"><span>custom</span><b>${fmtR(sc.c)}</b><small>your design below</small></div>` + tor;
      const rs = S.recs.slice(1);
      const q1 = rs.filter((d) => d.qmin < 1), firstQ = rs.find((d) => d.qmin < 1);
      const fg = rs.filter((d) => d.fgw > 1), maxF = Math.max(0, ...rs.map((d) => d.fgw));
      const fake = rs.filter((d) => d.Te0 > 10 && d.Ti0 > 10 && d.psolPlh < 1);
      const maxQ = Math.max(0, ...rs.map((d) => d.Q));
      const last = rs[rs.length - 1];
      const item = (ok, text) => `<li class="${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"} ${text}</li>`;
      audit.innerHTML =
        `<div class="lab-sub">Physics audit of this run (things the benchmark reward does not check)</div><ul>` +
        item(q1.length === 0, `q_min < 1 for <b>${q1.length} s</b>${firstQ ? ` (from t = ${firstQ.t} s): sawteeth in a real machine; a hybrid scenario needs q_min just above 1` : ""}`) +
        item(fg.length === 0, `Greenwald fraction above 1 for <b>${fg.length} s</b>, peak ${maxF.toFixed(2)}`) +
        item(fake.length === 0, `paid as H-mode while P_SOL < P_LH for <b>${fake.length} s</b>`) +
        item(maxQ <= 30, `peak Q = <b>${maxQ < 100 ? maxQ.toFixed(1) : maxQ.toFixed(0)}</b>${maxQ > 30 ? ": a small denominator, not a better plasma" : ""}`) +
        `<li class="info">• resistive flux drawn from the solenoid: <b>${last ? last.flux.toFixed(0) : 0} Wb</b> (free in the benchmark)</li>` +
        (S.as.sawtooth ? `<li class="info">• sawtooth crashes: <b>${last ? last.crashes : 0}</b></li>` : "") +
        `</ul>`;
    }
    // ------------------------------------------------ the knobs panel
    const KCOL = () => {
      const dark = document.body.getAttribute("data-md-color-scheme") === "slate";
      return { open: dark ? "#e0a93a" : "#b07d1a", feedback: dark ? "#3cc0d6" : "#0e95ad", human: colors().accent };
    };
    const showRecordedKnobs = () => S.torax && (S.live || S.kind === "sandbox");
    // knob positions during the second that ends at the cursor (the action applied in it)
    function knobAt(c) {
      const d = S.recs[c], prev = S.recs[Math.max(0, c - 1)];
      if (!d) return null;
      const info = c >= 1 ? S.knobs[c - 1] || null : null;
      const k = { t: d.t, Ip: d.Ip, rate: c >= 1 ? d.Ip - prev.Ip : 0, nbi: d.Pnbi, ecrh: d.Pecrh, info, prop: null, rec: null };
      if (info && info.base)
        k.prop = { Ip: clamp(prev.Ip + info.base[0] * 0.2, 3, 15), rate: info.base[0] * 0.2, nbi: ((info.base[1] + 1) / 2) * 33, ecrh: ((info.base[2] + 1) / 2) * 20 };
      if (showRecordedKnobs() && c >= 1 && c <= S.torax.torax.Ip.length) {
        const g = S.torax.torax;
        k.rec = { Ip: g.Ip[c - 1], nbi: g.Pnbi[c - 1] || 0, ecrh: g.Pecrh[c - 1] || 0 };
      }
      return k;
    }
    function easeNeedles(k, dtMs) {
      const tgt = { Ip: k.Ip, nbi: k.nbi, ecrh: k.ecrh, pIp: k.prop && k.prop.Ip, pnbi: k.prop && k.prop.nbi, pecrh: k.prop && k.prop.ecrh };
      const a = 1 - Math.exp(-dtMs / 60);
      const n = S.needle || (S.needle = {});
      for (const key in tgt) n[key] = tgt[key] === null || n[key] === null || n[key] === undefined ? tgt[key] : n[key] + (tgt[key] - n[key]) * a;
      return n;
    }
    function dial(ctx, col, cx, cy, r, o) {
      // o: {max, val, prop, rec, color, label, unit, sub}
      const ang = (v) => Math.PI + clamp(v / o.max, 0, 1) * Math.PI;
      const arc = (a0, a1, width, color, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha || 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
        ctx.restore();
      };
      arc(Math.PI, 2 * Math.PI, 8, col.grid);
      arc(Math.PI, ang(o.val), 8, o.color, 0.85);
      if (o.prop !== null && o.prop !== undefined && Math.abs(o.prop - o.val) > o.max * 0.004) arc(ang(o.prop), ang(o.val), 14, col.accent, 0.45);
      ctx.save();
      ctx.font = FONT_SMALL;
      ctx.fillStyle = col.muted;
      ctx.strokeStyle = col.muted;
      ctx.lineWidth = 1;
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const a = Math.PI + f * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx + (r + 6) * Math.cos(a), cy + (r + 6) * Math.sin(a));
        ctx.lineTo(cx + (r + 10) * Math.cos(a), cy + (r + 10) * Math.sin(a));
        ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.fillText("0", cx - r - 2, cy + 13);
      ctx.fillText(String(o.max), cx + r + 2, cy + 13);
      if (o.rec !== null && o.rec !== undefined) {
        const a = ang(o.rec);
        ctx.strokeStyle = col.fg;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(cx + (r - 9) * Math.cos(a), cy + (r - 9) * Math.sin(a));
        ctx.lineTo(cx + (r + 12) * Math.cos(a), cy + (r + 12) * Math.sin(a));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const needle = (v, hollow) => {
        const a = ang(v), L = r - 12;
        ctx.save();
        ctx.strokeStyle = hollow ? col.accent : col.fg;
        ctx.lineWidth = hollow ? 1.6 : 3;
        if (hollow) ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + L * Math.cos(a), cy + L * Math.sin(a));
        ctx.stroke();
        ctx.restore();
      };
      if (o.prop !== null && o.prop !== undefined) needle(o.prop, true);
      needle(o.val, false);
      ctx.fillStyle = col.fg;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.font = '600 15px "Space Grotesk", Inter, sans-serif';
      ctx.fillText(`${o.val.toFixed(o.digits || 1)} ${o.unit}`, cx, cy + 28);
      ctx.font = FONT_SMALL;
      ctx.fillStyle = col.muted;
      ctx.fillText(o.label, cx, cy + 44);
      if (o.sub) {
        ctx.fillStyle = o.subColor || col.muted;
        ctx.fillText(o.sub, cx, cy + 59);
      }
      ctx.restore();
    }
    function box(ctx, col, b, stroke, title, lines) {
      ctx.save();
      roundRect(ctx, b.x, b.y, b.w, b.h, 9);
      ctx.fillStyle = col.panel;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = col.fg;
      ctx.font = '600 13px "Space Grotesk", Inter, sans-serif';
      ctx.textAlign = "left";
      fitText(ctx, title, b.x + 9, b.y + 18, b.w - 16);
      ctx.font = FONT_SMALL;
      ctx.fillStyle = col.muted;
      lines.forEach((t, i) => b.y + 35 + i * 14 <= b.y + b.h - 3 && fitText(ctx, t, b.x + 9, b.y + 35 + i * 14, b.w - 16));
      ctx.restore();
    }
    function fitText(ctx, t, x, y, maxW) {
      if (ctx.measureText(t).width <= maxW) return ctx.fillText(t, x, y);
      while (t.length > 3 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
      ctx.fillText(t + "…", x, y);
    }
    function arrow(ctx, pts, color, dash, width) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width || 1.8;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
      ctx.setLineDash([]);
      const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - 9 * Math.cos(ang - 0.42), b[1] - 9 * Math.sin(ang - 0.42));
      ctx.lineTo(b[0] - 9 * Math.cos(ang + 0.42), b[1] - 9 * Math.sin(ang + 0.42));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const sgn = (v, n, u) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(n)}${u ? " " + u : ""}`;
    // what the controller read and decided in the second ending at the cursor
    function controllerText(k) {
      const info = k.info, t = k.t;
      if (S.ctrl === "open") return { title: "schedule", meas: null, lines: [`knobs = f(t), t = ${Math.max(0, t - 1)} s`, "reads nothing from the plasma"] };
      if (S.ctrl === "human") return { title: "you", meas: ["your eyes on the screen"], lines: ["reading the plots,", "moving the sliders"] };
      const where = S.live ? "Lab" : "TORAX";
      if (S.key === "pi" || (info && info.pi && !info.base)) {
        const sg = info && info.pi;
        if (!sg) return { title: "PI controller", meas: [t < 1 ? "—" : "nothing after 100 s"], lines: [t < 1 ? "acts from t = 0 s" : "I_p held at its last value", "heating on the clock (open loop)"] };
        return {
          title: "PI controller",
          meas: [`j(0) = ${(sg.j0 / 1e6).toFixed(2)} MA/m² (${where})`, `target j* = ${(sg.target / 1e6).toFixed(2)}`],
          lines: [`e = j* − j(0) = ${sgn(sg.error / 1e6, 2)} MA/m²`, `I_p = 3 MA + kp·e + ki·∫e = ${(sg.desired / 1e6).toFixed(2)} MA${sg.sat ? " (limited)" : ""}`, "heating on the clock (open loop)"],
        };
      }
      const P = POLICY[S.key], nIn = P ? P.obs_dim : info && info.base ? 64 : 60;
      if (info && info.base) {
        const d = info.total.map((v, i) => v - info.base[i]);
        const pr = k.prop;
        return {
          title: "PI + learned correction",
          meas: [`${nIn} numbers from ${where}`],
          lines: [`PI proposes ${sgn(pr.rate, 2, "MA/s")}, NBI ${pr.nbi.toFixed(0)}, ECRH ${pr.ecrh.toFixed(0)} MW`, `network adds ${sgn(d[0] * 0.2, 2, "MA/s")}, ${sgn((d[1] / 2) * 33, 1)}, ${sgn((d[2] / 2) * 20, 1)} MW`],
        };
      }
      return { title: "neural network policy", meas: [`${nIn} numbers from ${where}`], lines: [`${nIn} numbers in, 3 knobs out`, "every second"] };
    }
    function drawKnobs(dtMs) {
      const col = colors(), c = KCOL()[S.ctrl] || col.fg;
      const { ctx, w, h } = kv;
      ctx.clearRect(0, 0, w, h);
      const k = knobAt(S.cursor);
      if (!k) return;
      const n = easeNeedles(k, dtMs);
      const ct = controllerText(k);
      // signal path: plasma -> (measurement) -> controller -> knobs -> plasma
      const narrow = w < 520; // phones: measurement text below the boxes, short labels, no secondary arrows
      const bh = narrow ? 64 : 76, y0 = 22;
      const pb = { x: 6, y: y0, w: narrow ? 80 : Math.max(92, Math.min(130, w * 0.24)), h: bh };
      const gapW = narrow ? 34 : Math.max(118, w * 0.27);
      const cb = { x: pb.x + pb.w + gapW, y: y0, w: w - (pb.x + pb.w + gapW) - 6, h: bh };
      const replayFb = S.ctrl === "feedback" && !S.live;
      const plasmaSub = narrow ? (replayFb ? ["TORAX,", "recorded"] : ["Lab model"]) : replayFb ? ["TORAX, recorded", "(the Lab replays", " the knobs)"] : ["Lab model", "(this page)"];
      box(ctx, col, pb, col.muted, "plasma", plasmaSub);
      box(ctx, col, cb, c, ct.title, ct.lines);
      const ym = y0 + bh / 2, x0 = pb.x + pb.w + 4, x1 = cb.x - 4;
      ctx.save();
      ctx.font = FONT_SMALL;
      ctx.textAlign = "center";
      if (!ct.meas) {
        arrow(ctx, [[x0, ym], [x1, ym]], col.grid, [4, 4], 1.4);
        ctx.fillStyle = col.bad;
        ctx.font = '700 15px Inter, sans-serif';
        ctx.fillText("✕", (x0 + x1) / 2, ym + 5);
        ctx.font = FONT_SMALL;
        ctx.fillStyle = col.muted;
        if (!narrow) ctx.fillText("not measured", (x0 + x1) / 2, ym + 22);
        // the schedule's only input: a clock
        const cx = cb.x + cb.w - 18, cy = cb.y + 16;
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - 5);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 4, cy + 1);
        ctx.stroke();
      } else {
        arrow(ctx, [[x0, ym], [x1, ym]], c, null, 2);
        ctx.fillStyle = col.fg;
        // where the measurement text and the input strip go: between the boxes, or below them on a phone
        const mx = narrow ? w / 2 : (x0 + x1) / 2, mw = narrow ? w - 12 : x1 - x0 - 6;
        const my = narrow ? y0 + bh + 14 : ym - 8 - (ct.meas.length - 1) * 13;
        ct.meas.forEach((t, i) => fitText(ctx, (narrow && !i ? "reads: " : "") + t, mx, my + i * 13, mw));
        const sy = narrow ? my + ct.meas.length * 13 - 6 : ym + 6;
        const x = k.info && k.info.x;
        if (x) {
          // what a network sees: its normalised input vector as a strip of cells
          const sx0 = mx - mw / 2 + 4, cw = (mw - 8) / x.length;
          x.forEach((v, i) => {
            const u = clamp(v / 3, -1, 1);
            ctx.fillStyle = u >= 0 ? `rgba(235,104,52,${0.15 + 0.85 * u})` : `rgba(42,120,214,${0.15 - 0.85 * u})`;
            ctx.fillRect(sx0 + i * cw, sy, Math.max(1, cw - 0.4), 11);
          });
          ctx.fillStyle = col.muted;
          fitText(ctx, "what it reads now", mx, sy + 24, mw);
        } else if (S.ctrl === "feedback" && !S.live && S.key !== "pi" && !narrow) {
          ctx.fillStyle = col.muted;
          ctx.fillText("live mode shows its inputs", mx, ym + 18);
        }
      }
      ctx.restore();
      // the dials
      const dy = y0 + bh + (narrow ? 112 : 92), r = Math.max(30, Math.min(58, w / 3 / 2 - 22));
      const third = w / 3;
      const rate = k.rate;
      dial(ctx, col, third * 0.5, dy, r, { max: 15, val: n.Ip, prop: n.pIp, rec: k.rec && k.rec.Ip, color: c, label: narrow ? "I_p" : "plasma current I_p", unit: "MA", digits: 2,
        sub: S.cursor < 1 ? "" : Math.abs(rate) > 0.005 ? `${narrow ? "" : "ramping "}${sgn(rate, 2, "MA/s")}` : "held", subColor: Math.abs(rate) > 0.005 ? c : col.muted });
      dial(ctx, col, third * 1.5, dy, r, { max: 33, val: n.nbi, prop: n.pnbi, rec: k.rec && k.rec.nbi, color: "rgb(235,120,30)", label: narrow ? "P_NBI" : "neutral beams P_NBI", unit: "MW" });
      dial(ctx, col, third * 2.5, dy, r, { max: 20, val: n.ecrh, prop: n.pecrh, rec: k.rec && k.rec.ecrh, color: "rgb(40,170,210)", label: narrow ? "P_ECRH" : "microwaves P_ECRH", unit: "MW" });
      if (narrow) return; // the arrows and the legend below need the width
      // command path: controller -> knobs -> back into the plasma
      arrow(ctx, [[cb.x + cb.w / 2, cb.y + cb.h + 2], [cb.x + cb.w / 2, dy - r - 22]], c, null, 1.8);
      ctx.save();
      ctx.font = FONT_SMALL;
      ctx.fillStyle = col.muted;
      ctx.textAlign = "right";
      ctx.fillText("sets the knobs every second", cb.x + cb.w / 2 - 6, cb.y + cb.h + 16);
      ctx.textAlign = "left";
      ctx.fillText("knobs act on the plasma", 22, pb.y + pb.h + 16);
      ctx.restore();
      arrow(ctx, [[third * 0.5 - r - 18, dy + 8], [14, dy + 8], [14, pb.y + pb.h + 3]], col.muted, null, 1.4);
      // legend
      ctx.save();
      ctx.font = FONT_SMALL;
      ctx.fillStyle = col.muted;
      ctx.textAlign = "left";
      const leg = ["needle: applied"];
      if (k.prop) leg.push("pink needle: PI's proposal, arc: the correction");
      if (k.rec) leg.push("tick: on TORAX");
      fitText(ctx, leg.join(" · "), 6, h - 6, w - 12);
      ctx.restore();
    }
    function drawKnobStrips() {
      const col = colors(), c = KCOL()[S.ctrl] || col.fg;
      const { ctx, w, h } = ks;
      ctx.clearRect(0, 0, w, h);
      const rows = [
        { t: "I_p ramp rate [MA/s] (the I_p knob)", yr: [-0.22, 0.22], f: (d, p) => d.Ip - p.Ip, g: (G, i) => G.Ip[i] - (i ? G.Ip[i - 1] : 3), p: (b) => b[0] * 0.2 },
        { t: "P_NBI [MW]", yr: [0, 34], f: (d) => d.Pnbi, g: (G, i) => G.Pnbi[i] || 0, p: (b) => ((b[1] + 1) / 2) * 33 },
        { t: "P_ECRH [MW]", yr: [0, 21], f: (d) => d.Pecrh, g: (G, i) => G.Pecrh[i] || 0, p: (b) => ((b[2] + 1) / 2) * 20 },
      ];
      const pad = 40, gap = 26, rh = (h - 58 - gap * 2) / 3;
      ks.rows = [];
      const upto = S.cursor;
      rows.forEach((r, i) => {
        const bx = { x: pad, y: 18 + i * (rh + gap), w: w - pad - 10, h: rh };
        const fr = frame(ctx, col, bx, [0, 151], r.yr, { title: r.t, noXLabels: i !== 2, xlabel: i === 2 ? "time [s]" : "" });
        ks.rows.push([bx, fr]);
        const P = (pts) => pts.map(([t, v]) => [fr.sx(t), fr.sy(clamp(v, r.yr[0], r.yr[1]))]);
        const series = (recs) => recs.slice(1).map((d, j) => [d.t, r.f(d, recs[j])]);
        S.pins.forEach((pn) => line(ctx, P(series(pn.recs)), pn.color, 1.3));
        if (showRecordedKnobs()) {
          const G = S.torax.torax;
          line(ctx, P(G.Ip.map((_, j) => [j + 1, r.g(G, j)])), col.muted, 1.3, [5, 4]);
        }
        const cur = series(S.recs.slice(0, upto + 1));
        const prop = S.knobs.slice(0, upto).map((info, j) => (info && info.base ? [j + 1, r.p(info.base)] : null));
        if (prop.some(Boolean)) {
          ctx.save();
          ctx.fillStyle = col.accent;
          ctx.globalAlpha = 0.28;
          for (let j = 0; j < Math.min(prop.length, cur.length); j++) {
            if (!prop[j]) continue;
            const xa = fr.sx(j + 0.5), xb = fr.sx(j + 1.5);
            const ya = fr.sy(clamp(prop[j][1], r.yr[0], r.yr[1])), yb = fr.sy(clamp(cur[j][1], r.yr[0], r.yr[1]));
            ctx.fillRect(xa, Math.min(ya, yb), xb - xa, Math.max(1, Math.abs(yb - ya)));
          }
          ctx.restore();
          line(ctx, P(prop.filter(Boolean)), col.accent, 1.2, [2, 2]);
        }
        line(ctx, P(cur), c, 2.2);
        const xc = fr.sx(S.cursor);
        ctx.save();
        ctx.strokeStyle = col.accent;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(xc, bx.y);
        ctx.lineTo(xc, bx.y + bx.h);
        ctx.stroke();
        ctx.restore();
      });
      ctx.save();
      ctx.font = FONT_SMALL;
      let x = pad;
      const leg = [[c, `this run (${(CTRL[S.ctrl] || CTRL.feedback).tag})`, null]];
      if (S.knobs.some((i) => i && i.base)) leg.push([col.accent, "PI's proposal; shaded: correction", [2, 2]]);
      if (showRecordedKnobs()) leg.push([col.muted, "on TORAX", [5, 4]]);
      S.pins.forEach((pn) => leg.push([pn.color, pn.label, null]));
      for (const [lc, lab, dash] of leg) {
        ctx.strokeStyle = lc;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash || []);
        ctx.beginPath();
        ctx.moveTo(x, h - 9);
        ctx.lineTo(x + 14, h - 9);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col.muted;
        const lw = Math.min(ctx.measureText(lab).width, 200);
        fitText(ctx, lab, x + 18, h - 5, 200);
        x += lw + 32;
        if (x > w - 60) break;
      }
      ctx.restore();
    }
    function updateKnobBanner() {
      const p = presetOf(S.key) || {}, c = CTRL[S.ctrl] || CTRL.feedback;
      let txt;
      if (S.ctrl === "open") txt = "A schedule: every knob is a function of time alone, fixed before the shot. Change the simulator assumptions below and the knobs stay where they are; only the plasma changes.";
      else if (S.ctrl === "human") txt = "You are the feedback controller: you read the plasma on this page and set the knobs once per second.";
      else if (S.live) {
        const reads = S.key === "pi" ? "j(0), the central current density, against a rising target" : `${POLICY[S.key] ? POLICY[S.key].obs_dim : 60} numbers describing the plasma`;
        txt = `<b>${S.label}, closed loop on the Lab:</b> every second it reads ${reads} from this plasma and sets the knobs from it, so they follow whatever the Lab does, including your changes to the assumptions. Dashed: what it did on TORAX.` +
          (S.key === "pi" ? " Its heating still follows the clock: PI is feedback on I_p only." : "");
      } else
        txt = `<b>${S.label}:</b> the knobs it set on TORAX, while reading TORAX's plasma, replayed here without feedback.` +
          (p.live ? " Switch to <i>controller live on the Lab</i> to let it read this plasma instead." : "");
      kBanner.innerHTML = `<span class="lab-cls ${c.cls}">${c.tag}</span>${txt}` + (S.liveNote ? ` <em>(${S.liveNote})</em>` : "");
      liveBtns.rec.classList.toggle("on", !S.live);
      liveBtns.live.classList.toggle("on", S.live);
      liveBtns.live.disabled = !p.live || S.mode !== "watch" || !RC;
      liveBtns.live.title = S.ctrl === "open" ? "A schedule reads nothing, so there is nothing to run live: its knobs are the same on any plasma." : "";
      liveSeg.hidden = S.ctrl !== "feedback";
    }

    function drawAll() {
      const sc = scores(S.recs);
      drawReadout();
      drawTraces(sc);
      drawProfiles();
      drawOps();
      drawReward(sc);
      drawScores(sc);
      updateKnobBanner();
      drawKnobStrips();
      tSl.set(S.cursor);
      tSl.input.max = 151;
    }

    // ------------------------------------------------ main loop (pauses when off-screen)
    let visible = true, acc = 0, lastTs = 0;
    if (window.IntersectionObserver) new IntersectionObserver((es) => (visible = es[0].isIntersecting)).observe(root);
    function frameLoop(ts) {
      const dt = lastTs ? Math.min(100, ts - lastTs) : 16;
      lastTs = ts;
      if (visible && S.recs.length) {
        torus.view.phase += dt * 0.0011;
        const stepsPerSec = 12 * S.speed;
        if (S.playing && S.mode === "watch") {
          acc += (dt / 1000) * stepsPerSec;
          while (acc >= 1) {
            acc -= 1;
            if (S.cursor < S.recs.length - 1) S.cursor++;
            else {
              S.playing = false;
              playBtn.textContent = "Replay";
            }
            S.dirty = true;
          }
        } else if (S.running && S.mode === "drive") {
          acc += (dt / 1000) * stepsPerSec * 0.6;
          while (acc >= 1) {
            acc -= 1;
            driveStep();
          }
        } else acc = 0;
        drawTorus();
        drawKnobs(dt);
        if (S.dirty) {
          S.dirty = false;
          drawAll();
        }
      }
      requestAnimationFrame(frameLoop);
    }

    // ------------------------------------------------ boot
    Promise.all([getJSON("lab"), getJSON("profiles").catch(() => ({}))]).then(([L, P]) => {
      LAB = L;
      PROF = P;
      const pk = params.get("preset");
      // presets whose recorded episode is not in lab.json yet are hidden
      PRESETS.forEach((p) => p.kind === "torax" && !LAB[p.key] && (presetBtns[p.key].hidden = true));
      if (params.get("live") === "1") S.livePref = true;
      load(pk && presetOf(pk) && (presetOf(pk).kind !== "torax" || LAB[pk]) ? pk : "pi");
      const t0 = +params.get("t");
      if (t0) S.cursor = clamp(t0, 0, S.recs.length - 1);
      const cb = params.get("color");
      cbBtns[cb && COLOR_BY[cb] ? cb : "Te"].click();
      const tb = params.get("tab");
      tabBtns[tb && TAB_EQ[tb] ? tb : "q"].click();
      const ped = params.get("pedestal");
      if (ped === "power") pedBtns.power.click();
      else pedBtns.scheduled.classList.add("on");
      if (params.get("sawtooth") === "1") sawBtn.click();
      const tm = +params.get("transport");
      if (tm) {
        S.as.transportMul = clamp(tm, 0.5, 2);
        aChi.set(S.as.transportMul);
        resim();
      }
      if (params.get("play") === "1") togglePlay();
      S.dirty = true;
      requestAnimationFrame(frameLoop);
    });
    return {
      redraw: () => (S.dirty = true),
      resize: () => {
        tv.fit();
        kv.fit();
        ks.fit();
        xv.fit();
        pv.fit();
        ov.fit();
        rv.fit();
        S.dirty = true;
      },
    };
  }
  RT.register("lab", wLab);

  // ================================================================== the machine (chapter 1)
  function wMachine(root) {
    const ctl = controls(root);
    const s = { Ip: 3, coils: true, lines: true, beams: true, colorBy: "q" };
    const out = slider(ctl, "plasma current I_p", 3, 15, 0.1, s.Ip, (v) => v.toFixed(1) + " MA", (v) => (s.Ip = v));
    const t2 = controls(root);
    const tg = (lab, key) => {
      const b = button(t2, lab, () => {
        s[key] = !s[key];
        b.classList.toggle("on", s[key]);
      }, "rt-chip" + (s[key] ? " on" : ""));
    };
    tg("coils", "coils");
    tg("field lines", "lines");
    tg("NBI and ECRH", "beams");
    for (const [k, lab] of [["q", "colour: q"], ["Te", "colour: T_e"]]) {
      const b = button(t2, lab, () => {
        s.colorBy = k;
        t2.querySelectorAll(".mc").forEach((x) => x.classList.toggle("on", x === b));
      }, "rt-chip mc" + (k === s.colorBy ? " on" : ""));
    }
    const cv = canvas(root, 380);
    const tor = makeTorus(cv, { yaw: 0.35 });
    const info = note(root, "");
    const N = 50, rho = Array.from({ length: N + 1 }, (_, i) => i / N);
    function profiles() {
      const Ip = s.Ip * 1e6, nu = 1.6;
      const q = rho.map((x) => {
        const r = x * 2.0;
        const I = Ip * (1 - Math.pow(1 - x * x, nu + 1));
        const G = 1.79 + 1.49 * x * x;
        return x === 0 ? (G * 2 * 5.3) / (M.MU0 * 6.2 * 1.7 * ((Ip * (nu + 1)) / (Math.PI * 1.7 * 4))) : (G * 2 * Math.PI * r * r * 5.3) / (M.MU0 * 6.2 * I);
      });
      const Te = rho.map((x) => 0.2 + (2 + s.Ip * 0.25) * Math.pow(1 - x * x, 1.3));
      return { q, Te };
    }
    const p = player((dt) => {
      tor.view.phase += dt * 0.0011;
      const pr = profiles();
      tor.draw({ q: pr.q, val: s.colorBy === "q" ? pr.q : pr.Te, colorBy: s.colorBy, nbi: s.beams ? 33 : 0, ecrh: s.beams ? 20 : 0, ecrhLoc: 0.35, Ip: s.Ip, coils: s.coils, lines: s.lines, arrows: true, overlay: [`I_p = ${s.Ip.toFixed(1)} MA`, `q95 ≈ ${pr.q[Math.round(0.95 * N)].toFixed(1)},  q on axis ≈ ${pr.q[0].toFixed(2)}`] });
      const q95 = pr.q[Math.round(0.95 * N)];
      info.innerHTML =
        `At <b>${s.Ip.toFixed(1)} MA</b> a field line on the edge surface goes about <b>${q95.toFixed(1)}</b> times the long way round for each time the short way round (q95 = ${q95.toFixed(1)}). ` +
        `More current, stronger poloidal field B_θ, faster twist, lower q. Drag to rotate. ` +
        `<span class="rt-dim">Drawn to scale for ITER-like dimensions (R = 6.2 m, a = 2.0 m, elongation 1.7), with a fixed current-profile shape; the Lab evolves the real thing.</span>`;
    });
    if (window.IntersectionObserver) new IntersectionObserver((es) => (es[0].isIntersecting ? p.play() : p.pause())).observe(root);
    else p.play();
    return { redraw: () => {}, resize: () => cv.fit() };
  }
  RT.register("machine", wMachine);

  // ================================================================== 0-D power balance (chapter 4)
  function wPower(root) {
    const ctl = controls(root);
    const s = { Ip: 15, f: 0.85, Paux: 50, H: 1.0 };
    const R = 6.2, a = 2.0, B = 5.3, kap = 1.7, V = 2 * Math.PI * R * Math.PI * a * a * kap, KEV = 1.602176634e-16, dil = 0.9;
    slider(ctl, "I_p", 5, 15, 0.1, s.Ip, (v) => v.toFixed(1) + " MA", (v) => ((s.Ip = v), draw()));
    slider(ctl, "Greenwald fraction", 0.3, 1.2, 0.01, s.f, (v) => v.toFixed(2), (v) => ((s.f = v), draw()));
    const pa = slider(ctl, "P_aux", 0, 120, 1, s.Paux, (v) => v.toFixed(0) + " MW", (v) => ((s.Paux = v), draw()));
    slider(ctl, "H98", 0.4, 1.6, 0.01, s.H, (v) => v.toFixed(2), (v) => ((s.H = v), draw()));
    const pre = controls(root);
    button(pre, "ITER-like point", () => {
      Object.assign(s, { Ip: 15, f: 0.85, Paux: 50, H: 1.0, Tprev: 0.5 });
      root.querySelectorAll("input[type=range]").forEach((inp, i) => {
        inp.value = [15, 0.85, 50, 1.0][i];
        inp.dispatchEvent(new Event("input"));
      });
    });
    button(pre, "cut the heating", () => {
      s.Paux = 0;
      pa.set(0);
      draw();
    });
    const cv = canvas(root, 300);
    const info = note(root, "");
    const NR = 24;
    function powers(T0) {
      const n = s.f * M.greenwald(s.Ip, a) * 1e20;
      let Pa = 0, Pbr = 0, W = 0;
      for (let k = 0; k < NR; k++) {
        const x = (k + 0.5) / NR, dV = 2 * x * (1 / NR) * V, T = T0 * (1 - x * x) + 0.1;
        const nD = (dil * n) / 2;
        Pa += nD * nD * M.sigmavDT(T) * 3.52e3 * KEV * dV;
        Pbr += 5.35e-37 * 1.6 * n * n * Math.sqrt(T) * dV;
        W += 1.5 * n * (1 + dil) * T * KEV * dV;
      }
      const C0 = M.tauIPB98(s.Ip, B, s.f * M.greenwald(s.Ip, a) * 10, 1, R, kap, a / R, 2.5);
      const Ploss = Math.pow(W / 1e6 / (s.H * C0), 1 / 0.31); // MW, from W = H tau98(P) P
      return { Pa: Pa / 1e6, Pbr: Pbr / 1e6, W: W / 1e6, Ploss, Pohm: 1 };
    }
    function balance(Paux, Tstart) {
      // relax dT/dt ~ net power from Tstart to the nearest stable equilibrium (what the plasma would do)
      const net = (T) => {
        const p = powers(T);
        return [Paux + p.Pa + p.Pohm - p.Pbr - p.Ploss, p];
      };
      let T = clamp(Tstart, 0.5, 60);
      let [n0] = net(T);
      const dir = n0 > 0 ? 0.1 : -0.1;
      for (let k = 0; k < 700; k++) {
        const Tn = T + dir;
        if (Tn < 0.5 || Tn > 60) return null;
        const [n1, p] = net(Tn);
        if (Math.sign(n1) !== Math.sign(n0)) return { T: Tn, ...p };
        T = Tn;
      }
      return null;
    }
    function draw() {
      const col = colors();
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const pad = 50, gap = 60, pw = (w - 2 * pad - gap) / 2;
      const b1 = { x: pad, y: 28, w: pw, h: h - 74 }, b2 = { x: pad + pw + gap, y: 28, w: pw, h: h - 74 };
      const op = balance(s.Paux, s.Tprev || 0.5);
      if (op) s.Tprev = op.T;
      else s.Tprev = 0.5;
      const Ts = [], loss = [], heat = [], alpha = [];
      let ymax = 50;
      for (let T = 1; T <= 50; T += 0.5) {
        const p = powers(T);
        Ts.push(T);
        loss.push(p.Ploss);
        heat.push(s.Paux + p.Pa + p.Pohm - p.Pbr);
        alpha.push(p.Pa);
      }
      ymax = Math.max(100, Math.min(600, Math.max(...heat) * 1.1));
      const f1 = frame(ctx, col, b1, [0, 50], [0, ymax], { title: "power [MW] vs central temperature", xlabel: "T(0) [keV]" });
      line(ctx, Ts.map((T, i) => [f1.sx(T), f1.sy(Math.min(loss[i], ymax))]), col.series[0], 2.2);
      line(ctx, Ts.map((T, i) => [f1.sx(T), f1.sy(Math.min(heat[i], ymax))]), col.series[1], 2.2);
      line(ctx, Ts.map((T, i) => [f1.sx(T), f1.sy(Math.min(alpha[i], ymax * 1.05))]), col.series[1], 1.2, [4, 4]);
      ctx.font = FONT_SMALL;
      ctx.fillStyle = col.series[0];
      ctx.fillText("losses W/τ_E (IPB98 × H)", b1.x + 6, b1.y + 12);
      ctx.fillStyle = col.series[1];
      ctx.fillText("heating P_aux + P_α + P_ohm − P_rad (dashed: P_α)", b1.x + 6, b1.y + 26);
      ctx.fillStyle = col.muted;
      ctx.fillText("right panel: the hot branch, approached from above", b2.x + 6, b2.y + 12);
      if (op) {
        ctx.fillStyle = col.accent;
        ctx.beginPath();
        ctx.arc(f1.sx(op.T), f1.sy(Math.min(op.Ploss, ymax)), 6, 0, 2 * Math.PI);
        ctx.fill();
      }
      // Q vs P_aux
      const PA = [], QQ = [];
      for (let P = 0; P <= 120; P += 2) {
        const o = balance(P, 40);
        PA.push(P);
        QQ.push(o ? (5.03 * o.Pa) / (P + o.Pohm) : 0.001);
      }
      const f2 = frame(ctx, col, b2, [0, 120], [0.01, 1000], { title: "fusion gain Q = P_fus/(P_aux + P_ohm), log", xlabel: "P_aux [MW]", logy: true, yticks: [0.01, 0.1, 1, 10, 100, 1000] });
      line(ctx, PA.map((P, i) => [f2.sx(P), f2.sy(clamp(QQ[i], 0.01, 1000))]), col.accent, 2.2);
      hline(ctx, b2, f2.sy(10), col.muted, "ITER goal Q = 10");
      if (op) {
        const Q = (5.03 * op.Pa) / (s.Paux + op.Pohm);
        ctx.fillStyle = col.accent;
        ctx.beginPath();
        ctx.arc(f2.sx(s.Paux), f2.sy(clamp(Q, 0.01, 1000)), 6, 0, 2 * Math.PI);
        ctx.fill();
        const ign = op.Pa > op.Ploss - op.Pohm + op.Pbr - 1e-9 && s.Paux < 1;
        info.innerHTML =
          `Operating point: <b>T(0) ≈ ${op.T.toFixed(1)} keV</b>, P_α = <b>${op.Pa.toFixed(0)} MW</b>, P_fus = <b>${(5.03 * op.Pa).toFixed(0)} MW</b>, ` +
          `<b>Q = ${Q < 100 ? Q.toFixed(1) : Q.toFixed(0)}</b>, so the benchmark's fusion term would pay <b>${(Q / 500).toFixed(3)}</b> per second. ` +
          (s.Paux < 1 && ign ? "With no heating, alpha heating alone balances the losses (ignited in this 0-D model) and Q is limited only by the ohmic megawatt in its denominator. " : "") +
          `<span class="rt-dim">0-D model: parabolic temperature, flat density, losses from IPB98(y,2) × H98, bremsstrahlung with Z_eff = 1.6, P_ohm fixed at 1 MW. In Gym-TORAX the pedestal is scheduled, so confinement cannot collapse when the heating goes: that is what keeps the exploited plasmas hot.</span>`;
      } else {
        info.innerHTML = `No hot equilibrium with these settings: starting from the previous state, losses exceed heating and the plasma cools down. Raise H98 or P_aux. <span class="rt-dim">0-D model; see the equation sheet.</span>`;
      }
    }
    draw();
    return { redraw: draw, resize: () => (cv.fit(), draw()) };
  }
  RT.register("power", wPower);

  // ================================================================== operating space with TORAX trajectories (chapter 5)
  function wOpspace(root) {
    const chips = controls(root);
    const ctl = controls(root);
    const cv = canvas(root, 330);
    const info = note(root, "Loading TORAX episodes…");
    getJSON("episodes").then((E) => {
      const keys = Object.keys(E);
      const on = { pi: true, open_loop: true, ppo_s1: true };
      const PAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#8f5fd6", "#d6368f", "#00a3a3", "#7a6a3a", "#e34948"];
      const colorOf = (k) => PAL[keys.indexOf(k) % PAL.length];
      let ti = 150;
      keys.forEach((k) => chip(chips, E[k].label, colorOf(k), !!on[k], (v) => ((on[k] = v), draw())));
      const ts = slider(ctl, "time", 1, 151, 1, 151, (v) => v + " s", (v) => ((ti = v - 1), draw()));
      const pl = player((dt) => {
        ti = Math.min(150, ti + Math.max(1, Math.round(dt / 50)));
        ts.set(ti + 1);
        draw();
        if (ti >= 150) return false;
      });
      button(ctl, "Play", () => {
        if (ti >= 150) ti = 0;
        pl.play();
      }, "rt-primary");
      function draw() {
        const col = colors();
        const { ctx, w, h } = cv;
        ctx.clearRect(0, 0, w, h);
        const box = { x: 50, y: 26, w: w - 66, h: h - 68 };
        const fr = frame(ctx, col, box, [0, 1.5], [0, 0.6], { title: "1/q95 against Greenwald fraction, TORAX episodes", xlabel: "Greenwald fraction f_GW" });
        ctx.save();
        ctx.fillStyle = col.bad;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(fr.sx(1), box.y, fr.sx(1.5) - fr.sx(1), box.h);
        ctx.fillRect(box.x, box.y, box.w, fr.sy(0.5) - box.y);
        ctx.restore();
        hline(ctx, box, fr.sy(1 / 3), col.muted, "q95 = 3 (the reward's knee)", true);
        hline(ctx, box, fr.sy(0.5), col.bad, "q95 = 2", true);
        ctx.fillStyle = col.bad;
        ctx.font = FONT_SMALL;
        ctx.fillText("f_GW > 1", fr.sx(1.02), box.y + box.h - 6);
        keys.forEach((k) => {
          if (!on[k]) return;
          const e = E[k];
          const upto = Math.min(ti + 1, e.t.length);
          const pts = e.fgw.slice(0, upto).map((v, i) => [fr.sx(clamp(v, 0, 1.5)), fr.sy(clamp(1 / e.q95[i], 0, 0.6))]);
          line(ctx, pts, colorOf(k), 2);
          const last = pts[pts.length - 1];
          if (last) {
            ctx.fillStyle = colorOf(k);
            ctx.beginPath();
            ctx.arc(last[0], last[1], 5, 0, 2 * Math.PI);
            ctx.fill();
          }
        });
        info.innerHTML = `Each trajectory starts near the bottom (3 MA, q95 ≈ 16, f_GW ≈ 0.9), swings left while the current rises faster than the density, climbs as I_p rises, and runs right once the H-mode pedestal and the beams build density. ` +
          `The shaded regions are where real tokamaks disrupt: q95 below about 2 and density above the Greenwald limit. ` +
          `PI and the open-loop reference both end beyond f_GW = 1; the benchmark has no term or limit for it. <span class="rt-dim">Data: data/trajectories and data/runs (TORAX 1.0.3).</span>`;
      }
      draw();
      root._redraw = draw;
    });
    return { redraw: () => root._redraw && root._redraw(), resize: () => (cv.fit(), root._redraw && root._redraw()) };
  }
  RT.register("opspace", wOpspace);

  // ================================================================== small inline equation chips: <span class="rt-eqref" data-eq="q"></span>
  function linkEqRefs() {
    document.querySelectorAll(".rt-eqref[data-eq]:not([data-done])").forEach((s) => {
      const e = EQ[s.dataset.eq];
      if (!e) return;
      s.dataset.done = "1";
      s.innerHTML = `<a href="${eqLink(s.dataset.eq)}">∑ ${e.title}</a>`;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", linkEqRefs);
  else linkEqRefs();
})();
