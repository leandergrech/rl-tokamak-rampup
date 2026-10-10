/* Primer widgets built on the reduced ramp-up model (tokamak-model.js):
 *   lab      the Ramp-up Lab: presets that replay recorded TORAX actions, a sandbox you drive, a benchmark designer.
 *            Around the plasma view: a status chip, event callouts, hover tooltips, one line of narration and the
 *            heating at human scale; a toolbar of cards (story, labels, acronyms, about, scoreboard) and full screen;
 *            every panel folds to a one-line summary.
 *   machine  the tokamak as a 3D picture: coils, plasma current, field lines, actuators
 *   power    0-D power balance: heating vs losses, fusion gain, and why Q explodes when P_aux -> 0
 *   opspace  the operating space (Greenwald fraction vs 1/q95) with recorded TORAX trajectories
 * Registers into window.RT (widgets.js) and reuses its drawing helpers. No dependencies. */
(function () {
  "use strict";
  const RT = window.RT, M = window.RTModel;
  if (!RT || !M) return;
  const { colors, el, controls, slider, button, chip, note, canvas, frame, line, hline, player, getJSON, FONT, FONT_SMALL, isDark, legend } = RT;
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
  // ------------------------------------------------------------------ heating, drawn at human scale
  // ECRH is a wave: 170 GHz microwaves (lambda = c / f = 1.76 mm), drawn 400x longer (0.7 m on the machine) and
  // slowed about 1e11x (to 1.2 cycles a second). NBI is not a wave but a beam of fast atoms: 1 MeV deuterium at
  // about 9,800 km/s, drawn slowed about 3e6x (3 m/s). Colours follow frequency on one log scale (SPECTRUM);
  // invisible bands get false colours, the visible band its real ones.
  const C_LIGHT = 2.998e8;
  const HEAT = {
    ecrh: { f: 170e9, lamDraw: 0.7, fDraw: 1.2 },
    nbi: { E: 1.0, v: 9.8e6, vDraw: 3.0 },
    dalpha: { lam: 656.1e-9 },
  };
  // frequency bands, log10(f / Hz): [from, to, label, colour at the band's start, colour at its end]
  const SPECTRUM = [
    [7, 9, "radio", [120, 128, 150], [110, 150, 190]],
    [9, 11.48, "microwave", [70, 170, 235], [80, 225, 255]],
    [11.48, 14.6, "infrared", [150, 60, 90], [200, 30, 40]],
    [14.6, 14.88, "visible", null, null],
    [14.88, 16, "ultraviolet", [150, 80, 220], [120, 90, 160]],
  ];
  // the colour of visible light of a given wavelength [nm] (piecewise fit to the CIE colours)
  function visibleRGB(nm) {
    const [r, g, b] = nm < 440 ? [(440 - nm) / 60, 0, 1] : nm < 490 ? [0, (nm - 440) / 50, 1] : nm < 510 ? [0, 1, (510 - nm) / 20]
      : nm < 580 ? [(nm - 510) / 70, 1, 0] : nm < 645 ? [1, (645 - nm) / 65, 0] : [1, 0, 0];
    const edge = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
    return [r, g, b].map((v) => Math.round(255 * Math.pow(clamp(v * edge, 0, 1), 0.8)));
  }
  function specRGB(logf) {
    for (const [a, b, , c0, c1] of SPECTRUM) {
      if (logf < a || logf > b) continue;
      if (!c0) return visibleRGB((C_LIGHT / Math.pow(10, logf)) * 1e9);
      const u = (logf - a) / (b - a);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * u));
    }
    return [128, 128, 128];
  }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const EC_RGB = specRGB(Math.log10(HEAT.ecrh.f)), DA_RGB = specRGB(Math.log10(C_LIGHT / HEAT.dalpha.lam)), NBI_RGB = [255, 150, 50];
  const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function distPoly(x, y, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const u = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
      best = Math.min(best, Math.hypot(x - ax - u * dx, y - ay - u * dy));
    }
    return best;
  }
  function wrapText(ctx, text, maxW) {
    const words = String(text).split(" "), lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function makeTorus(cv, opts) {
    const view = { yaw: opts.yaw !== undefined ? opts.yaw : 0.55, el: 0.42, phase: 0 };
    let dragging = null, last = null;
    cv.c.style.touchAction = "pan-y";
    cv.c.style.cursor = "grab";
    cv.c.addEventListener("pointerdown", (e) => {
      dragging = { x: e.clientX, yaw: view.yaw, el: view.el, y: e.clientY, moved: 0 };
      cv.c.style.cursor = "grabbing";
    });
    window.addEventListener("pointerup", (e) => {
      if (dragging && dragging.moved < 4 && e.target === cv.c) hover(e); // a tap: explain what is under it
      dragging = null;
      cv.c.style.cursor = "grab";
    });
    cv.c.addEventListener("pointermove", (e) => {
      if (!dragging) return hover(e);
      dragging.moved = Math.max(dragging.moved, Math.hypot(e.clientX - dragging.x, e.clientY - dragging.y));
      cv.hideTip();
      view.yaw = dragging.yaw - (e.clientX - dragging.x) * 0.01;
      view.el = clamp(dragging.el + (e.clientY - dragging.y) * 0.004, 0.12, 1.2);
      if (opts.onChange) opts.onChange();
    });
    cv.c.addEventListener("pointerleave", () => cv.hideTip());

    // ---- hover: what is under the pointer, with its live values
    function hover(e) {
      if (!last) return;
      const r = cv.c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const hit = hitTest(x, y);
      const html = hit && ((opts.describe && opts.describe(hit, last.S)) || describe(hit, last.S));
      if (html) cv.showTip(x, y, html);
      else cv.hideTip();
    }
    function rhoAt(x, y, phi) {
      const ring = (rho) => Array.from({ length: 49 }, (_, m) => last.P(surfPoint(rho, (m / 48) * 2 * Math.PI, phi)));
      if (!pointInPoly(x, y, ring(1))) return null;
      let lo = 0, hi = 1;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (pointInPoly(x, y, ring(mid))) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    function hitTest(x, y) {
      let best = null;
      const near = (pri) => {
        for (const h of last.hits) {
          if (h.pri !== pri) continue;
          const d = h.pt ? Math.hypot(x - h.pt[0], y - h.pt[1]) : h.poly ? distPoly(x, y, h.poly) : h.box && x >= h.box[0] && x <= h.box[2] && y >= h.box[1] && y <= h.box[3] ? 0 : Infinity;
          if (d <= h.r && (!best || d / h.r < best.score)) best = { ...h, score: d / h.r };
        }
        return best;
      };
      if (near(0)) return best;
      for (const phi of last.cuts) {
        const rho = rhoAt(x, y, phi);
        if (rho !== null) return { kind: "plasma", rho };
      }
      return near(1);
    }
    const fmt = (v, n) => (v === undefined || v === null || !isFinite(v) ? "–" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(n));
    function describe(hit, S) {
      const at = (arr, rho) => (arr ? interp(arr, rho) : null);
      switch (hit.kind) {
        case "plasma": {
          const pr = S.prof || {};
          const rows = [["T_e", at(pr.Te, hit.rho), 1, "keV"], ["j", at(pr.j, hit.rho), 2, "MA/m²"], ["q", at(S.q, hit.rho), 2, ""], ["n_e", at(pr.n, hit.rho), 2, "× 10²⁰ m⁻³"]]
            .filter((r) => r[1] !== null).map(([k, v, n, u]) => `${k} <b>${fmt(v, n)}</b> ${u}`);
          if (!pr.Te && S.val) rows.unshift(`${COLOR_BY[S.colorBy || "Te"].label} <b>${fmt(at(S.val, hit.rho), 2)}</b>`);
          const where = hit.rho > 0.97 ? "the plasma edge (last closed flux surface)" : hit.rho < 0.06 ? "the magnetic axis" : `the flux surface at ρ̂ = ${hit.rho.toFixed(2)}`;
          return `<b>Plasma</b>, ${where}<br>${rows.join(" · ")}<br><span class="rt-dim">A cut through the torus: each ring is a nested flux surface, coloured by the profile you chose.</span>`;
        }
        case "q1":
          return `<b>The q = 1 surface</b> at ρ̂ ≈ ${hit.rho.toFixed(2)}<br>Inside it a field line closes on itself after a single turn the long way round. Real plasmas then crash periodically (sawteeth); a hybrid scenario keeps q_min just above 1.`;
        case "cs":
          return `<b>Central solenoid</b><br>A transformer: changing its current induces the plasma current. Flux used so far: <b>${fmt(S.flux, 0)} Wb</b> (the blue fill), out of a budget that ends the pulse when it runs out.`;
        case "coils":
          return `<b>Toroidal field coils</b> (18)<br>Superconducting coils for the 5.3 T field the long way round. The plasma current adds the field the short way round; together they twist the field lines.`;
        case "ecrh":
        case "launcher":
          return `<b>ECRH: ${fmt(S.ecrh, 1)} MW of 170 GHz microwaves</b> (λ = 1.76 mm) from gyrotrons, aimed by a steerable mirror in the launcher.<br>` +
            `Electrons gyrate round the field lines at 28 GHz per tesla; where that matches the wave they absorb it, so the power lands in a thin layer and drives current there (ECCD).<br>` +
            `<span class="rt-dim">Drawn 400× longer and slowed about 10¹¹×; amplitude and brightness grow with the power. Microwaves are invisible: the cyan is a false colour (see the strip under the plasma).</span>`;
        case "dep":
          return `<b>ECRH absorbed at ρ̂ = ${fmt(S.ecrhLoc, 2)}</b><br>${fmt(S.ecrh, 1)} MW heats the electrons in a narrow layer here. The glow grows with the power.`;
        case "nbi":
        case "injector":
          return `<b>NBI: ${fmt(S.nbi, 1)} MW of 1 MeV deuterium atoms</b> from two injectors.<br>Neutral, so the magnetic field cannot turn them away; in the plasma they are ionised, caught by the field and slow down, heating it and driving current. Fewer survive the deeper they go, and fewer still in a denser plasma.<br>` +
            `<span class="rt-dim">Not a laser or a wave: drawn as atoms, slowed about 3 × 10⁶× (they fly at 9,800 km/s); more atoms, more power. The red glow is real light: Balmer-α (656 nm) from beam atoms excited in the plasma.</span>`;
        default:
          return null;
      }
    }

    function draw(S) {
      // S: {q:[], val:[], colorBy, nbi, ecrh, ecrhLoc, Ip, coils, beams, lines, labels, flash, title, hmode, flux,
      //     prof, ne20, spectrum, callouts:[{anchor, title, text, color}], alarm (0..1), overlay, badge}
      const col = colors();
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const tnow = REDUCED_MOTION ? 0.4 : performance.now() / 1000;
      const ce = Math.cos(view.el), se = Math.sin(view.el), cy0 = Math.cos(view.yaw), sy0 = Math.sin(view.yaw);
      const ext = S.coils ? 10.6 : 8.9;
      const zext = S.coils ? 5.6 : 3.8;
      const sc = Math.min((w * 0.94) / (2 * ext), (h * 0.9) / (2 * (ext * se + zext * ce)));
      const cx = w / 2, cy = h / 2 + (S.coils ? 0 : 6) + (opts.topPad || 0);
      const P = (p) => {
        const xr = p[0] * cy0 - p[1] * sy0, yr = p[0] * sy0 + p[1] * cy0;
        return [cx + sc * xr, cy - sc * (yr * se + p[2] * ce), yr * ce - p[2] * se];
      };
      const prims = [], hits = [], anchors = {};
      const phiFront = -Math.PI / 2 - view.yaw;
      const cutHalf = Math.PI / 4.2;
      const inCut = (phi) => {
        let d = ((phi - phiFront) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
        return Math.abs(d) < cutHalf;
      };
      const qAt = (rho) => Math.max(0.2, interp(S.q, rho));
      const cm = COLOR_BY[S.colorBy || "Te"];
      const colAt = (rho, a) => cmap(cm.map, cm.norm(interp(S.val, rho)), a);
      const rational = (qv) => {
        for (let x = 0; x <= 1; x += 0.005)
          if ((qAt(x) - qv) * (qAt(Math.min(1, x + 0.005)) - qv) <= 0 && qAt(x) !== qAt(x + 0.005)) return x > 0.005 ? x : null;
        return null;
      };
      const phiR = phiFront + cutHalf; // the right-hand cut face: anchors for callouts
      anchors.edge = P(surfPoint(1, 0.35, phiR));
      anchors.core = P(surfPoint(0, 0, phiR));
      const rq1 = rational(1);
      if (rq1 !== null) {
        anchors.q1 = P(surfPoint(rq1, -0.6, phiR));
        hits.push({ kind: "q1", pt: anchors.q1, r: 9, pri: 0, rho: rq1 });
      }
      // --- plasma outer surface mesh (translucent), outside the cut; a lighter mesh on small canvases
      const smallCv = w < 700, NT = smallCv ? 48 : 72, NP = smallCv ? 18 : 26;
      const surfRgb = cmap(cm.map, cm.norm(interp(S.val, 0.96))).slice(4, -1), alphaStr = {};
      const surfFill = (a) => alphaStr[(a = Math.round(a * 50) / 50)] || (alphaStr[a] = `rgba(${surfRgb},${a})`);
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
            ctx.fillStyle = surfFill(facing > 0 ? 0.2 * light + 0.06 : 0.08);
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
          const edgePath = () => {
            ctx.beginPath();
            for (let m = 0; m <= 48; m++) {
              const pt = P(surfPoint(1, (m / 48) * 2 * Math.PI, phi));
              m ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
            }
          };
          ctx.strokeStyle = col.muted;
          ctx.lineWidth = 1;
          edgePath();
          ctx.stroke();
          if (S.alarm) {
            // a limit is violated: the plasma edge pulses red
            ctx.save();
            ctx.strokeStyle = `rgba(235,60,60,${(0.45 + 0.4 * Math.sin(tnow * 7)) * S.alarm})`;
            ctx.lineWidth = 3.5;
            edgePath();
            ctx.stroke();
            ctx.restore();
          }
          // rational surfaces
          for (const [qv, color, lab] of [[1, "#ff3b3b", "q = 1"], [2, "rgba(255,255,255,0.75)", "q = 2"]]) {
            const rq = rational(qv);
            if (rq === null) continue;
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
        const n = w < 700 ? 300 : 520, CH = 6; // samples per toroidal turn; segments per drawn piece
        surfaces.forEach(([rho, nl, lw], si) => {
          const q = qAt(rho), color = si === 0 ? col.accent : si === 1 ? "#ffd166" : "#7fdfff";
          for (let l = 0; l < nl; l++) {
            const th0 = (l / nl) * 2 * Math.PI + si;
            let prev = null, run = null;
            const flush = () => {
              if (!run) return;
              const r = run;
              prims.push([r.depth / (r.pts.length - 1) - 0.05, () => {
                ctx.strokeStyle = color;
                ctx.globalAlpha = si === 0 ? (r.front ? 0.95 : 0.25) : 0.55;
                ctx.lineWidth = lw;
                ctx.beginPath();
                r.pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
                ctx.stroke();
                ctx.globalAlpha = 1;
              }]);
              run = null;
            };
            for (let i = 0; i <= n; i++) {
              const phi = (i / n) * 2 * Math.PI;
              const th = th0 + (phi + view.phase) / q;
              const pt = P(surfPoint(rho * 0.995, th, phi));
              const hidden = inCut(phi);
              if (prev && !hidden && !prev.hidden) {
                const nx = Math.cos(th) * Math.cos(phi), ny = Math.cos(th) * Math.sin(phi), nz = Math.sin(th) / GEO.kappa;
                const front = (nx * sy0 + ny * cy0) * ce - nz * se < 0;
                if (!run || run.front !== front || run.pts.length > CH) {
                  flush();
                  run = { pts: [prev.pt], front, depth: 0 };
                }
                run.pts.push(pt);
                run.depth += (prev.pt[2] + pt[2]) / 2;
              } else flush();
              prev = { pt, hidden };
            }
            flush();
          }
        });
      }
      // --- central solenoid
      const csR = 1.35, csH = S.coils ? 4.6 : 3.6;
      const csTop = P([0, 0, csH]), csBot = P([0, 0, -csH]);
      anchors.cs = [csTop[0], csTop[1] + 8];
      hits.push({ kind: "cs", box: [csTop[0] - sc * csR, csTop[1] - sc * csR * se, csTop[0] + sc * csR, csBot[1] + sc * csR * se], r: 1, pri: 1 });
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
          const poly = [];
          for (let m = 0; m <= 40; m++) {
            const th = (m / 40) * 2 * Math.PI;
            const Rr = 7.2 + 3.6 * Math.cos(th + 0.25 * Math.sin(th)) - (Math.cos(th) < 0 ? 0.6 * Math.cos(th) : 0);
            const pt = P([Rr * Math.cos(phi), Rr * Math.sin(phi), 5.2 * Math.sin(th)]);
            poly.push(pt);
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
          hits.push({ kind: "coils", poly, r: 5, pri: 1 });
        }
      }
      // --- heating: NBI (a tangential beam of fast atoms) and ECRH (a microwave beam from an upper launcher)
      if (S.beams !== false) {
        if (S.nbi > 0.05) {
          const Pn = clamp(S.nbi / 33, 0, 1.5);
          const phiB = phiFront + Math.PI * 0.62, Rt = 5.3, zB = -0.3;
          const dir = [-Math.sin(phiB), Math.cos(phiB)], rad = [Math.cos(phiB), Math.sin(phiB)];
          const tan = [Rt * Math.cos(phiB), Rt * Math.sin(phiB)];
          const at3 = (s, u = 0, v = 0) => [tan[0] + dir[0] * s + rad[0] * u, tan[1] + dir[1] * s + rad[1] * u, zB + v];
          const s0 = -9.6, s1 = 4.5;
          const sIn = -Math.sqrt((GEO.R0 + GEO.a) ** 2 - Rt * Rt); // where the beam crosses the plasma edge
          // fraction of atoms not yet ionised: a picture of beam stopping, faster in a denser plasma
          const lam = 3.0 / clamp(S.ne20 || 0.9, 0.25, 1.6);
          const surv = (s) => (s < sIn ? 1 : Math.exp(-(s - sIn) / lam));
          const n = 36;
          const axis = [];
          for (let i = 0; i <= n; i++) axis.push(P(at3(s0 + ((s1 - s0) * i) / n)));
          for (let i = 0; i < n; i++) {
            const sm = s0 + ((s1 - s0) * (i + 0.5)) / n, a = axis[i], b = axis[i + 1], f = surv(sm);
            // drawn a little in front of its true depth, so the translucent plasma surface does not hide it
            prims.push([(a[2] + b[2]) / 2 - 2.5, () => {
              ctx.strokeStyle = rgba(NBI_RGB, (0.14 + 0.18 * Math.min(1, Pn)) * f); // the beam's envelope
              ctx.lineWidth = sc * (0.3 + 0.25 * Pn);
              ctx.beginPath();
              ctx.moveTo(a[0], a[1]);
              ctx.lineTo(b[0], b[1]);
              ctx.stroke();
              if (sm > sIn) {
                ctx.strokeStyle = rgba(DA_RGB, 0.5 * Math.min(1, Pn) * f); // Balmer-alpha light where it meets the plasma
                ctx.lineWidth = sc * (0.16 + 0.12 * Pn);
                ctx.beginPath();
                ctx.moveTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
                ctx.stroke();
              }
            }]);
          }
          // the atoms: more of them for more power; each fades as it is ionised
          const N = Math.round(10 + 46 * Math.min(1, Pn)), span = s1 - s0, vD = HEAT.nbi.vDraw;
          for (let k = 0; k < N; k++) {
            const r1 = Math.sin(k * 12.9898) * 43758.5453, r2 = Math.sin(k * 78.233) * 12345.678;
            const u = (r1 - Math.floor(r1) - 0.5) * 0.42, v = (r2 - Math.floor(r2) - 0.5) * 0.42;
            const s = s0 + ((((tnow * vD + (k * span) / N + (r2 - Math.floor(r2)) * 0.4) % span) + span) % span);
            const f = surv(s);
            if (f < 0.04) continue;
            const a = P(at3(s - 0.55, u, v)), b = P(at3(s, u, v));
            prims.push([b[2] - 2.6, () => {
              const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
              g.addColorStop(0, rgba(NBI_RGB, 0));
              g.addColorStop(1, rgba(NBI_RGB, 0.9 * f));
              ctx.strokeStyle = g;
              ctx.lineWidth = 2;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(a[0], a[1]);
              ctx.lineTo(b[0], b[1]);
              ctx.stroke();
              ctx.lineCap = "butt";
              ctx.fillStyle = `rgba(255,244,214,${f})`;
              ctx.beginPath();
              ctx.arc(b[0], b[1], 2.2, 0, 2 * Math.PI);
              ctx.fill();
            }]);
          }
          const inj = P(at3(s0)), entry = P(at3(sIn));
          anchors.nbi = entry;
          hits.push({ kind: "nbi", poly: axis.slice(0, Math.round(n * 0.85)), r: 9, pri: 0 });
          hits.push({ kind: "injector", pt: inj, r: 12, pri: 0 });
          prims.push([inj[2] - 0.2, () => {
            ctx.fillStyle = col.panel;
            ctx.strokeStyle = col.muted;
            ctx.lineWidth = 1;
            roundRect(ctx, inj[0] - 9, inj[1] - 6, 18, 12, 3);
            ctx.fill();
            ctx.stroke();
            if (S.labels !== false) {
              ctx.font = FONT_SMALL;
              const lx = clamp(inj[0] - 22, 4, w - ctx.measureText("1 MeV D atoms").width - 6), ly = clamp(inj[1] + 20, 14, h - 18);
              ctx.fillStyle = "rgb(225,115,25)";
              ctx.fillText(`NBI ${S.nbi.toFixed(0)} MW`, lx, ly);
              ctx.fillStyle = col.muted;
              if (w >= 480) ctx.fillText("1 MeV D atoms", lx, ly + 13);
            }
          }]);
        }
        if (S.ecrh > 0.05) {
          const Pn = clamp(S.ecrh / 20, 0, 1.5);
          const phi = phiR;
          const T3 = surfPoint(Math.max(0.02, S.ecrhLoc || 0.35), 1.05, phi);
          const L3 = [(GEO.R0 + 1.3) * Math.cos(phi), (GEO.R0 + 1.3) * Math.sin(phi), 4.6];
          const len = Math.hypot(T3[0] - L3[0], T3[1] - L3[1], T3[2] - L3[2]);
          const n = 160, pts = [];
          for (let i = 0; i <= n; i++) {
            const u = i / n;
            pts.push(P([L3[0] + (T3[0] - L3[0]) * u, L3[1] + (T3[1] - L3[1]) * u, L3[2] + (T3[2] - L3[2]) * u]));
          }
          const a = pts[0], b = pts[n];
          anchors.ecrh = pts[Math.round(n * 0.3)];
          anchors.dep = b;
          hits.push({ kind: "ecrh", poly: pts, r: 9, pri: 0 });
          hits.push({ kind: "dep", pt: b, r: 11, pri: 0 });
          hits.push({ kind: "launcher", pt: a, r: 12, pri: 0 });
          prims.push([-50, () => {
            ctx.save();
            const k = (2 * Math.PI) / HEAT.ecrh.lamDraw, om = 2 * Math.PI * HEAT.ecrh.fDraw;
            const absorbed = (u) => (u < 0.8 ? 1 : Math.exp(-(((u - 0.8) / 0.11) ** 2)));
            const amp = sc * (0.12 + 0.24 * Math.sqrt(Math.min(Pn, 1.2))); // field amplitude ~ sqrt(power)
            const nrm = (i) => {
              const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n, i + 1)], dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
              return [-dy / L, dx / L];
            };
            // the beam's envelope (a focused Gaussian beam)
            ctx.lineCap = "round";
            for (const [wd, al] of [[2.6, 0.07], [1.4, 0.12]]) {
              ctx.strokeStyle = rgba(EC_RGB, al * (0.5 + Pn));
              ctx.lineWidth = amp * wd + 4;
              ctx.beginPath();
              pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
              ctx.stroke();
            }
            // the wave: the electric field oscillating across the beam, travelling into the plasma
            ctx.strokeStyle = rgba(EC_RGB, 0.5 + 0.5 * Math.min(1, Pn));
            ctx.lineWidth = 1.4 + 1.0 * Math.min(1, Pn);
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
              const u = i / n, ph = k * u * len - om * tnow, A = amp * absorbed(u) * Math.sin(ph), [nx, ny] = nrm(i);
              const x = pts[i][0] + nx * A, y = pts[i][1] + ny * A;
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.stroke();
            // wavefronts: one bright bar per wavelength, at each crest
            ctx.strokeStyle = rgba(EC_RGB, 0.5 + 0.45 * Math.min(1, Pn));
            ctx.lineWidth = 1.4;
            const m0 = Math.ceil((-om * tnow) / (2 * Math.PI)), m1 = Math.floor((k * len - om * tnow) / (2 * Math.PI));
            for (let m = m0; m <= m1; m++) {
              const u = (2 * Math.PI * m + om * tnow) / (k * len);
              if (u < 0 || u > 1) continue;
              const i = Math.round(u * n), A = (amp + 3) * absorbed(u), [nx, ny] = nrm(i);
              if (A < 1.5) continue;
              ctx.globalAlpha = absorbed(u);
              ctx.beginPath();
              ctx.moveTo(pts[i][0] - nx * A, pts[i][1] - ny * A);
              ctx.lineTo(pts[i][0] + nx * A, pts[i][1] + ny * A);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.lineCap = "butt";
            // where it is absorbed: a glow that grows with the power and pulses with the wave
            const rg = sc * (0.25 + 0.3 * Math.min(1, Pn)) * (1 + 0.12 * Math.sin(om * tnow));
            const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], rg);
            g.addColorStop(0, "rgba(235,250,255,0.95)");
            g.addColorStop(0.35, rgba(EC_RGB, 0.6));
            g.addColorStop(1, rgba(EC_RGB, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(b[0], b[1], rg, 0, 2 * Math.PI);
            ctx.fill();
            // the launcher: a mirror in an upper port
            ctx.fillStyle = col.panel;
            ctx.strokeStyle = col.muted;
            ctx.lineWidth = 1;
            roundRect(ctx, a[0] - 8, a[1] - 7, 16, 10, 2);
            ctx.fill();
            ctx.stroke();
            if (S.labels !== false) {
              ctx.font = FONT_SMALL;
              const lx = clamp(a[0] + 12, 4, w - ctx.measureText("170 GHz microwaves").width - 6);
              ctx.fillStyle = isDark() ? rgba(EC_RGB, 1) : `rgb(${EC_RGB.map((v) => Math.round(v * 0.55))})`;
              ctx.fillText(`ECRH ${S.ecrh.toFixed(0)} MW`, lx, a[1] - 6);
              ctx.fillStyle = col.muted;
              if (w >= 480) ctx.fillText("170 GHz microwaves", lx, a[1] + 7);
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
      // --- a limit was just crossed: the view flashes red at its edges
      if (S.redFlash > 0) {
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        g.addColorStop(0, "rgba(227,73,72,0)");
        g.addColorStop(1, `rgba(227,73,72,${0.45 * S.redFlash})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
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
      // --- callouts: what just happened, pinned to the part where it happens
      if (S.callouts && S.callouts.length) {
        ctx.font = FONT_SMALL;
        // stacked up from the bottom-left corner, over the left cut face (the right one shows the same profile),
        // each with a leader line to its part
        let yNext = h - 34;
        S.callouts.slice(-2).reverse().forEach((c) => {
          const an = anchors[c.anchor] || anchors.edge;
          const lines = wrapText(ctx, c.text || "", 190);
          const lw = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
          ctx.font = "600 " + FONT_SMALL;
          const tw = Math.max(ctx.measureText(c.title).width, lw);
          const bwc = tw + 16, bh = 18 + 13 * lines.length;
          const bx2 = 8, by2 = Math.max(6, yNext - bh);
          yNext = by2 - 6;
          const color = c.color || col.accent;
          ctx.save();
          ctx.globalAlpha = c.alpha === undefined ? 1 : c.alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(an[0], an[1]);
          ctx.lineTo(clamp(an[0], bx2, bx2 + bwc), clamp(an[1], by2, by2 + bh));
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(an[0], an[1], 3.5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = col.panel;
          ctx.globalAlpha *= 0.94;
          roundRect(ctx, bx2, by2, bwc, bh, 7);
          ctx.fill();
          ctx.globalAlpha = c.alpha === undefined ? 1 : c.alpha;
          ctx.strokeStyle = color;
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.fillRect(bx2, by2 + 4, 3, bh - 8);
          ctx.font = "600 " + FONT_SMALL;
          ctx.fillStyle = color;
          ctx.fillText(c.title, bx2 + 9, by2 + 14);
          ctx.font = FONT_SMALL;
          ctx.fillStyle = col.fg;
          lines.forEach((l, i) => ctx.fillText(l, bx2 + 9, by2 + 28 + 13 * i));
          ctx.restore();
        });
      }
      last = { S, P, cuts: [phiFront - cutHalf, phiFront + cutHalf], hits };
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
    { key: "sandbox", label: "Sandbox: you drive", kind: "sandbox", ctrl: "human", scen: "both" },
    // the physics environment (rl_tokamak.physics on TORAX 1.4): its own TORAX episodes and controllers
    { key: "phys_open_loop", label: "Open-loop reference", kind: "torax", ctrl: "open", scen: "physics" },
    { key: "phys_heating_cut", label: "Heating cut at 105 s", kind: "torax", ctrl: "open", scen: "physics" },
    { key: "phys_cem", label: "Best open-loop schedule", kind: "torax", ctrl: "open", scen: "physics" },
    { key: "phys_pi", label: "PI controller, re-tuned", kind: "torax", ctrl: "feedback", live: "pi", scen: "physics" },
    { key: "phys_ppo_res", label: "PPO on PI", kind: "torax", ctrl: "feedback", live: "policy", scen: "physics" },
    { key: "phys_ppo_long", label: "PPO on PI, 4× longer", kind: "torax", ctrl: "feedback", live: "policy", scen: "physics" },
    { key: "phys_ppo_dr", label: "Randomised training", kind: "torax", ctrl: "feedback", live: "policy", scen: "physics" },
    { key: "phys_mbpo_res", label: "MBPO on PI", kind: "torax", ctrl: "feedback", live: "policy", scen: "physics" },
  ];
  PRESETS.forEach((p) => (p.scen = p.scen || "benchmark"));
  const EXTRA = {
    td3bc: { label: "TD3+BC on noisy PI logs", ctrl: "feedback", live: "policy", scen: "benchmark" },
    mbpo_s1: { label: "MBPO seed 1 (exploit)", ctrl: "feedback", live: "policy", scen: "benchmark" },
    phys_ppo_dr_low: { label: "Randomised training, seed 2 (stays at 3 MA)", ctrl: "feedback", live: "policy", scen: "physics" },
  };
  const presetOf = (key) => PRESETS.find((x) => x.key === key) || (EXTRA[key] && { key, kind: "torax", ...EXTRA[key] });
  const isPI = (key) => key === "pi" || key === "phys_pi";
  const RESIDUAL_KEYS = ["ppo_res", "mbpo_res", "phys_ppo_res", "phys_ppo_long", "phys_ppo_dr", "phys_ppo_dr_low", "phys_mbpo_res"];
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
  Object.assign(STORIES, {
    phys_open_loop: {
      intro: "The physics environment (TORAX 1.4): the pedestal forms only when the heating power crosses the L-H threshold, the machine's density control holds 0.6 of the Greenwald density in L-mode and 0.85 in H-mode, and the episode ends at f_GW > 1 or l_i outside 0.65–1.2 during the ramp. The same open-loop schedule as the benchmark: TORAX return 3.09.",
      events: [
        [50, "q_min passes below 1 (TORAX 50 s). Without the benchmark's prescribed 0.5 keV edge the L-mode plasma is colder, so the current penetrates faster than on the benchmark (69 s)."],
        [100, "Heating on: 53 MW. P_heat jumps above P_LH; the plasma is still in L-mode for this second."],
        [101, "L-H transition (TORAX's state machine reacts at the start of the next second); the pedestal ramps to 3 keV."],
        [110, "H-mode, with P_heat at about 1.5 × P_LH: the H-mode terms are paid (the reward needs 1.2 ×). Try the threshold slider in the side pane: from about 1.2 × the scaling, this schedule never gets here."],
        [150, "End: Q ≈ 4.7 at 0.85 of the Greenwald density (the benchmark reached 7.7 at 1.19, above the limit)."],
      ],
    },
    phys_pi: {
      intro: "The paper's PI controller with re-tuned gains (k_p 0.1, k_i 0.3, target j(0) ending at 3.75 MA/m²): with the paper's gains it ramps so fast that l_i falls below 0.65 at 9 s and the episode ends. TORAX return 3.24.",
      events: [
        [49, "q_min passes below 1 (TORAX 49 s)."],
        [87, "I_p reaches 15 MA: more current, more density (the controller holds a fraction of the Greenwald density, which grows with I_p), and so a higher L-H threshold."],
        [101, "L-H transition with P_heat about 1.07 × P_LH: a thin margin. Move the threshold slider to 1.1 and replay: PI's recorded knobs no longer reach H-mode."],
        [150, "End: Q ≈ 7.4, H98 0.85."],
      ],
    },
    phys_heating_cut: {
      intro: "The benchmark's exploit on the physics environment: the open-loop reference with all heating off from 105 s. TORAX return 1.81, against 20.96 with the scheduled pedestal.",
      events: [
        [101, "L-H transition when the heating switches on, as in the reference."],
        [106, "Heating off. P_heat falls below 0.8 × P_LH: H-L back-transition."],
        [107, "L-mode again: the pedestal is gone and the core cools from about 24 keV towards 6 keV. Q spikes for one second, but no H-mode term is paid."],
        [150, "End: nothing left to exploit. Compare the same preset on the benchmark scenario."],
      ],
    },
    phys_cem: {
      intro: "The best 9-parameter open-loop schedule on the physics environment (cross-entropy search, 160 episodes): ramp to 14.2 MA with some heating from 89 s. TORAX return 3.26.",
      events: [
        [89, "A little heating before the scheduled switch-on."],
        [101, "H-mode, with less heating than PI and so a thinner margin: it is the first schedule to lose H-mode when the threshold rises (at about 1.02 × the scaling, on TORAX and on the Lab)."],
      ],
    },
    phys_ppo_res: {
      intro: "PPO on the re-tuned PI, seed 3 (30,000 simulator steps, trained on the physics environment). It heats from the first seconds of the ramp, so q_min stays above 1 until 74 s instead of 49 s. TORAX return 3.63, PI 3.24.",
      events: [
        [1, "Heating from the first second: a hotter plasma conducts better, so the current reaches the core later."],
        [74, "q_min passes below 1, 25 s later than under PI."],
        [101, "L-H transition; then the network trims the flat-top heating while keeping P_heat above 1.2 × P_LH."],
      ],
    },
    phys_ppo_long: {
      intro: "PPO on PI trained four times longer (120,000 steps), seed 3: TORAX return 4.28, the best here. It runs 20 MW of ECRH through the late ramp, adds the full 33 MW of NBI at 80–82 s, enters H-mode at 83 s, 18 s before PI, then switches the ECRH off and holds Q at the reward's cap of 10 with the beams alone.",
      events: [
        [83, "L-H transition before the end of the ramp: 65 s of paid H-mode against PI's 49."],
        [85, "ECRH off: Q is capped at 10 in the reward, so once the beams hold Q near 10 the extra 20 MW earns nothing."],
        [150, "End: Q ≈ 10. On perturbed plasmas it is fragile: on TORAX this seed ends 6 of the 33 held-out episodes above Gym-TORAX's 35 keV core-temperature bound."],
      ],
    },
    phys_ppo_dr: {
      intro: "PPO on PI trained on randomised plasmas (threshold, hysteresis and pedestal height drawn from their measured uncertainty; 120,000 steps), seed 4: the robust one. It ramps only to 12.3 MA, heats fully, then lowers the current to about 9.4 MA in the flat-top and keeps q_min above 1 throughout. TORAX return 3.15 on the nominal plasma; on TORAX it reaches H-mode on every held-out plasma up to 1.16 × the scaling, where PI fails from 1.09 ×.",
      events: [
        [100, "12.3 MA instead of PI's 15 MA: less density, a lower L-H threshold, a wider margin."],
        [101, "L-H transition."],
        [120, "The current is lowered in the flat-top, which keeps q_min above 1. The reward does not ask for 12.5 MA, so lowering the current costs nothing here; on ITER it would."],
      ],
    },
    phys_ppo_dr_low: {
      intro: "Randomised training, seed 2: the policy keeps the current at 3 MA for the whole episode. q_min never falls below 1, so the q_min and q95 terms pay in full (exactly 2.00 on TORAX), and no H-mode is risked. A safe answer to an uncertain threshold, and a reminder that this reward does not ask for the 12.5 MA flat-top.",
      events: [],
    },
    phys_mbpo_res: {
      intro: "MBPO on the re-tuned PI, seed 2 (20 simulator episodes; TORAX's L-H rule applied inside its model rollouts). TORAX return 3.47. On the Lab its recorded knobs end at 10 s: the Lab's l_i runs about 0.06 below TORAX's in this heated ramp (0.634 against 0.694) and the 0.65 limit catches it. Switch to live: the network reads the Lab's plasma and stays inside the window.",
      events: [],
    },
  });
  const EXTRA_STORY = (lab) => ({ intro: `${lab}: a recorded TORAX episode. Dashed lines are TORAX; the knobs panel replays the knobs it set there, or runs its network live on the Lab.`, events: [] });

  // ================================================================== the Lab
  function wLab(root) {
    root.classList.add("rt-lab");
    const S = {
      key: null, kind: null, label: "", actions: [], recs: [], torax: null, toraxProf: null, cursor: 0, playing: false, speed: 1,
      ctrl: "feedback", live: false, livePref: false, recorded: [], recKnobs: [], knobs: [], needle: null, liveNote: "",
      mode: "watch", running: false, drive: { rate: 0.2, nbi: 0, ecrh: 0, loc: 0.35 }, model: null,
      as: {},
      colorBy: "Te", tab: "T", coils: false, pins: [], dirty: true, scen: "benchmark", rewSlot: 0,
      custom: { label: "Custom (your design)", qCap: 10, gate: "temp+plh", wQ: 1 / 50, wH: 1 / 50, wQmin: 1 / 150, wQ95: 1 / 150, pFgw: 0.02, pQmin: 0.01, pFlux: 0, fluxBudget: Infinity, endFgw: Infinity, endQ95: 0, endPenalty: -1000 },
    };
    const params = new URLSearchParams(location.search);
    let LAB = {}, PROF = {};
    // small viewports (phones, upright or on their side): the Lab is used in full screen only; inline it is a
    // launch card (HMI-MOBILE-SPEC.md, M1)
    const TOUCH_DEV = !!(window.matchMedia && matchMedia("(hover: none)").matches);
    const SMALL = () => innerWidth < 760 || (!!window.matchMedia && matchMedia("(pointer: coarse)").matches && Math.min(innerWidth, innerHeight) < 500);
    // the two scenarios: the benchmark (Gym-TORAX 1.0, 151 steps) and the physics environment (TORAX 1.4, 150 steps)
    const PHYS = () => S.scen === "physics";
    const HOR = () => (PHYS() ? 150 : 151);
    // the three returns shown everywhere: [key, label, reward config (null: the custom one), short description]
    const SLOTS = () => PHYS()
      ? [["p", "physics env", M.REWARD_PRESETS.physics, "H-mode earned, P_heat ≥ 1.2 × P_LH, Q ≤ 10; f_GW > 1 or l_i outside 0.65–1.2 ends it"],
         ["b", "benchmark", M.REWARD_PRESETS.benchmark, "IterHybrid-v0's formula on this plasma"], ["c", "custom", null, "your design"]]
      : [["b", "benchmark", M.REWARD_PRESETS.benchmark, "IterHybrid-v0"], ["a", "audited", M.REWARD_PRESETS.audited, "Q ≤ 10, P_SOL ≥ P_LH"],
         ["c", "custom", null, "your design"]];
    // H-mode as the physics environment pays it: TORAX's state is H and P_heat ≥ 1.2 × the plasma's true threshold
    const physPaid = (d) => d.mode === 1 && d.Psol >= 1.2 * (d.plhMul || 1) * d.PLH;
    const POLICY = {}; // exported networks, fetched when live mode is first switched on
    // per-viewer conveniences (layers on the plasma, folded panels, the story's visibility); the Lab works without them
    const store = {
      get(k, d) {
        try {
          const v = localStorage.getItem("rt-lab-" + k);
          return v === null ? d : JSON.parse(v);
        } catch (e) {
          return d;
        }
      },
      set(k, v) {
        try {
          localStorage.setItem("rt-lab-" + k, JSON.stringify(v));
        } catch (e) {
          /* private window: keep it for this visit only */
        }
      },
    };
    const layers = Object.assign({ labels: true, lines: true, beams: true, callouts: true, narration: true, heatstrip: true }, store.get("layers", {}));

    // ------------------------------------------------ layout
    // Above: who turns the knobs (the presets) and the story. Below that a workspace: a side pane that stays in
    // view (playback, the controller's hyper-controls, the salient plasma parameters, live outcomes) next to the
    // visual panels. The full simulation parameters and the reward designer sit below the visuals.
    const launch = el("div", "lab-launch");
    root.appendChild(launch);
    const lPoster = el("div", "lab-launch-poster");
    launch.appendChild(lPoster);
    const lBody = el("div", "lab-launch-body");
    launch.appendChild(lBody);
    lBody.innerHTML = `<b class="lab-launch-title">The Ramp-up Lab</b>` +
      `<p>Replay real TORAX ramp-ups on a reduced plasma model, run the controllers live on it, or drive the plasma yourself.</p>` +
      `<p class="lab-launch-preset"></p>`;
    const lGo = el("button", "lab-launch-go", "Open the Lab");
    lGo.type = "button";
    lBody.append(lGo, el("p", "lab-launch-hint", "Opens full screen · upright or sideways"));
    const top = el("div", "lab-top");
    root.appendChild(top);
    const scenRow = el("div", "lab-seg lab-seg-wide lab-scen");
    top.appendChild(scenRow);
    const scenBtns = {
      benchmark: button(scenRow, "<b>Benchmark</b>: Gym-TORAX 1.0, the pedestal comes on a clock", () => setScenario("benchmark"), "rt-chip on"),
      physics: button(scenRow, "<b>Physics environment</b>: TORAX 1.4, H-mode earned by power, density control, limits", () => setScenario("physics"), "rt-chip"),
    };
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
    const fillMore = () => (more.innerHTML = `<option value="">more…</option>` + Object.entries(EXTRA).filter(([, v]) => v.scen === S.scen).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join(""));
    fillMore();
    more.addEventListener("change", () => more.value && load(more.value));
    groups.feedback.appendChild(more);
    const story = el("div", "lab-story");
    top.appendChild(story);
    story.hidden = store.get("story", true) === false;

    const main = el("div", "lab-main");
    root.appendChild(main);
    const side = el("aside", "lab-side");
    main.appendChild(side);
    const content = el("div", "lab-content");
    main.appendChild(content);
    const grid = el("div", "lab-grid");
    content.appendChild(grid);
    const below = el("div", "lab-grid lab-below");
    content.appendChild(below);
    // every panel folds to its title (click it) and then shows a one-line summary; the state is remembered
    const FOLDS = [];
    function panel(cls, title, eqIds, parent) {
      const p = el("section", "lab-panel " + cls);
      const head = el("div", "lab-head");
      const tbtn = el("button", "lab-title lab-fold", `<span class="lab-chev" aria-hidden="true"></span>${title}`);
      tbtn.type = "button";
      tbtn.title = "Fold or unfold this panel";
      tbtn.setAttribute("aria-expanded", "true");
      const sum = el("span", "lab-sum");
      head.append(tbtn, sum);
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
      (parent || grid).appendChild(p);
      const P = { p, head, tools, body, drawer, sum, cvs: [], open: true, summary: null, id: cls.split(" ")[0] };
      P.set = (open, byUser) => {
        P.open = open;
        p.classList.toggle("folded", !open);
        tbtn.setAttribute("aria-expanded", String(open));
        if (byUser) store.set("fold-" + P.id, open);
        if (open) P.cvs.forEach((c) => c.fit());
        S.dirty = true;
      };
      tbtn.addEventListener("click", () => isFull() || P.set(!P.open, true));
      FOLDS.push(P);
      return P;
    }
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
    const fmtX = (v) => v.toFixed(2) + "×";
    const f2 = (v) => v.toFixed(2);
    const keV = (v) => v.toFixed(2) + " keV";

    // ---- simulation parameters: one state, shown in the side pane (salient ones) and in full below
    const D = M.DEFAULTS;
    const PARAMS = [
      { g: "Transport", k: "transportMul", label: "transport ×", min: 0.5, max: 2, step: 0.05, def: 1, f: fmtX, side: true },
      { g: "Transport", k: "kc", label: "critical gradient R/L_T", min: 4, max: 12, step: 0.1, def: D.kc, f: (v) => v.toFixed(1) },
      { g: "Transport", k: "chiS", label: "stiffness above it", min: 0.03, max: 0.45, step: 0.01, def: D.chiS, f: f2 },
      { g: "Pedestal", k: "pedOn", label: "pedestal onset", min: 60, max: 140, step: 1, def: D.pedOn, f: (v) => v + " s", side: true, scen: "benchmark" },
      { g: "Pedestal", k: "plhMul", label: "true L-H threshold ÷ Martin scaling", min: 0.54, max: 1.85, step: 0.01, def: 1, f: fmtX, side: true, scen: "physics" },
      { g: "Pedestal", k: "pedHyst", label: "back to L-mode below … × threshold", min: 0.35, max: 0.8, step: 0.01, def: 0.8, f: f2, scen: "physics" },
      { g: "Pedestal", k: "TpedH", label: "H-mode pedestal T", min: 1, max: 5, step: 0.1, def: D.TpedH, f: keV, side: true, sideScen: "physics" },
      { g: "Pedestal", k: "TpedL", label: "L-mode pedestal T", min: 0.2, max: 1.5, step: 0.05, def: D.TpedL, defP: M.PHYSICS.TpedL, f: keV },
      { g: "Density", k: "fL", label: "L-mode density ÷ n_G", min: 0.3, max: 0.9, step: 0.01, def: D.fL, defP: M.PHYSICS.fL, f: f2 },
      { g: "Density", k: "fH", label: "H-mode density ÷ n_G", min: 0.6, max: 1.3, step: 0.01, def: D.fH, defP: M.PHYSICS.fH, f: f2 },
      { g: "Density", k: "fuelMul", label: "beam fuelling ×", min: 0, max: 3, step: 0.05, def: 1, defP: 0, f: fmtX, map: (v) => ({ cNBI: D.cNBI * v }) },
      { g: "Current", k: "Zeff", label: "Z_eff (resistivity, radiation)", min: 1.2, max: 3, step: 0.05, def: D.Zeff, f: f2, side: true },
      { g: "Current", k: "bsMul", label: "bootstrap ×", min: 0, max: 2, step: 0.05, def: 1, f: fmtX, map: (v) => ({ cBS: D.cBS * v }) },
      { g: "Current", k: "cdMul", label: "NBI and EC current drive ×", min: 0, max: 3, step: 0.05, def: 1, f: fmtX, map: (v) => ({ nbiCD: D.nbiCD * v, eccdEff: D.eccdEff * v }) },
      { g: "Machine and losses", k: "B", label: "toroidal field B", min: 4.5, max: 6, step: 0.05, def: D.B, f: (v) => v.toFixed(2) + " T" },
      { g: "Machine and losses", k: "radMul", label: "radiation ×", min: 0, max: 3, step: 0.05, def: 1, f: fmtX, map: (v) => ({ cRad: D.cRad * v }) },
      { g: "Machine and losses", k: "sawPeriod", label: "sawtooth period (when on)", min: 2, max: 20, step: 1, def: D.sawPeriod, f: (v) => v + " s" },
    ];
    const defOf = (p) => (PHYS() && p.defP !== undefined ? p.defP : p.def);
    const pedMode0 = () => (PHYS() ? "formation" : "scheduled");
    S.as = { pedMode: "scheduled", sawtooth: false, ...Object.fromEntries(PARAMS.map((p) => [p.k, p.def])) };
    const asModified = () => S.as.pedMode !== pedMode0() || S.as.sawtooth || PARAMS.some((p) => Math.abs(S.as[p.k] - defOf(p)) > 1e-9);
    const PUI = {}, PED_UI = [], SAW_UI = [];
    function paramSlider(parent, p) {
      const s = slider(parent, p.label, p.min, p.max, p.step, S.as[p.k], p.f, (v) => setParam(p.k, v));
      (PUI[p.k] = PUI[p.k] || []).push(s);
      return s;
    }
    function setParam(k, v, now) {
      S.as[k] = v;
      (PUI[k] || []).forEach((s) => s.set(v));
      now ? resim() : resimSoon();
    }
    function setPedMode(k) {
      S.as.pedMode = k;
      PED_UI.forEach((b) => b[k === "scheduled" ? "s" : "p"].classList.add("on") || b[k === "scheduled" ? "p" : "s"].classList.remove("on"));
      resim();
    }
    function setSaw(on) {
      S.as.sawtooth = on;
      SAW_UI.forEach((b) => b.classList.toggle("on", on));
      resim();
    }
    function pedChips(parent) {
      const row = el("div", "lab-seg lab-seg-wide");
      parent.appendChild(row);
      const b = { s: button(row, "pedestal: scheduled", () => setPedMode("scheduled"), "rt-chip on"), p: button(row, "power-triggered", () => setPedMode("power"), "rt-chip") };
      b.s.title = "As in Gym-TORAX: the pedestal rises at the onset time whatever the plasma does.";
      b.p.title = "The pedestal rises only while P_SOL ≥ P_LH.";
      PED_UI.push(b);
      return row;
    }
    function sawChip(parent) {
      const b = button(parent, "sawtooth model", () => setSaw(!S.as.sawtooth), "rt-chip");
      SAW_UI.push(b);
      return b;
    }
    function resetParams(noSim) {
      Object.assign(S.as, { pedMode: pedMode0(), sawtooth: false });
      PARAMS.forEach((p) => {
        S.as[p.k] = defOf(p);
        (PUI[p.k] || []).forEach((s) => s.set(S.as[p.k]));
      });
      PED_UI.forEach((b) => (b.s.classList.add("on"), b.p.classList.remove("on")));
      SAW_UI.forEach((b) => b.classList.remove("on"));
      if (!noSim) resim();
    }
    // sliders that belong to one scenario only; in the side pane, sideScen limits a shared slider to one scenario
    function applyScenarioUI() {
      PARAMS.forEach((p) => (PUI[p.k] || []).forEach((s, i) => {
        const inSide = p.side && i === 0;
        s.input.parentElement.hidden = (p.scen && p.scen !== S.scen) || (inSide && p.sideScen && p.sideScen !== S.scen);
      }));
      PED_UI.forEach((b) => (b.s.parentElement.hidden = PHYS()));
      PHYS_UI.forEach((n) => (n.hidden = !PHYS()));
    }
    const PHYS_UI = [];

    // ---- controller hyper-controls
    // controller hyper-controls, relative to the scenario's PI (the paper's gains, or the re-tuned ones)
    const tune0 = () => ({ kpMul: 1, kiMul: 1, jEnd: (PHYS() ? RC.PHYSICS_PI : RC.PAPER_PI).j_end, corrMul: 1 });
    S.tune = tune0();
    const tuneModified = () => Object.entries(tune0()).some(([k, v]) => S.tune[k] !== v);
    const usesPI = (key) => isPI(key) || RESIDUAL_KEYS.includes(key);
    const isResidual = (key) => RESIDUAL_KEYS.includes(key);
    function setTune(k, v) {
      S.tune[k] = v;
      const p = presetOf(S.key);
      if (p && p.live && !S.live && S.mode === "watch") setLive((S.livePref = true));
      else if (S.live) resimSoon();
      S.dirty = true;
    }

    // ================================================ the side pane
    function section(title, cls) {
      const s = el("section", "lab-sec" + (cls ? " " + cls : ""));
      if (title) s.appendChild(el("div", "lab-sec-title", title));
      side.appendChild(s);
      return s;
    }
    const sideHead = el("div", "lab-side-head");
    side.appendChild(sideHead);
    // playback
    const sPlay = section("Playback");
    sPlay.classList.add("lab-sec-play"); // on a phone in full screen the playback line replaces it
    const tRow = controls(sPlay);
    const playBtn = button(tRow, "Play", () => togglePlay(), "rt-primary");
    const rewBtn = button(tRow, "⏮", () => {
      S.cursor = 0;
      S.playing = false;
      playBtn.textContent = "Play";
      S.dirty = true;
    }, "rt-btn");
    rewBtn.title = "Back to t = 0";
    const spd = document.createElement("select");
    spd.className = "rt-select";
    spd.innerHTML = [0.5, 1, 2, 4].map((v) => `<option value="${v}" ${v === 1 ? "selected" : ""}>${v}× speed</option>`).join("");
    spd.addEventListener("change", () => (S.speed = +spd.value));
    tRow.appendChild(spd);
    button(tRow, "Pin", () => pinRun(), "rt-btn").title = "Keep this run as a grey line while you try something else (up to three)";
    const clearBtn = button(tRow, "Clear pins", () => clearPins(), "rt-btn");
    clearBtn.title = "Remove the pinned runs from every plot";
    const tSl = slider(sPlay, "time", 0, 151, 1, 0, (v) => v + " s", (v) => {
      S.cursor = Math.min(v, S.recs.length - 1);
      S.playing = false;
      playBtn.textContent = "Play";
      S.dirty = true;
    });
    const tl = canvas(sPlay, 58);
    tl.c.title = "The episode at a glance: click or drag to jump. Keys: space plays or pauses, ← → step 1 s (with shift 10 s).";
    // controller
    const sCtl = section("Controller");
    const liveSeg = el("div", "lab-seg lab-seg-wide");
    sCtl.appendChild(liveSeg);
    const liveBtns = {
      rec: button(liveSeg, "recorded on TORAX", () => setLive((S.livePref = false)), "rt-chip"),
      live: button(liveSeg, "live on the Lab", () => setLive((S.livePref = true)), "rt-chip"),
    };
    const ctlNote = el("div", "lab-side-note");
    sCtl.appendChild(ctlNote);
    const tuneBox = el("div", "lab-tune");
    sCtl.appendChild(tuneBox);
    const tKp = slider(tuneBox, "PI gain k_p", 0, 3, 0.05, 1, fmtX, (v) => setTune("kpMul", v));
    const tKi = slider(tuneBox, "PI gain k_i", 0, 3, 0.05, 1, fmtX, (v) => setTune("kiMul", v));
    const tJ = slider(tuneBox, "PI j(0) target", 1, 4.5, 0.05, 2, (v) => v.toFixed(2) + " MA/m²", (v) => setTune("jEnd", v * 1e6));
    tJ.input.parentElement.title = "The central current density PI steers towards at 100 s; its target rises linearly from 0.6 MA/m² at the start.";
    const corrWrap = el("div", "");
    tuneBox.appendChild(corrWrap);
    const tCorr = slider(corrWrap, "network correction", 0, 2, 0.05, 1, fmtX, (v) => setTune("corrMul", v));
    const tuneReset = button(tuneBox, "Back to the trained controller", () => {
      Object.assign(S.tune, tune0());
      tKp.set(1);
      tKi.set(1);
      tJ.set(S.tune.jEnd / 1e6);
      tCorr.set(1);
      if (S.live) resim();
      S.dirty = true;
    }, "rt-btn");
    const takeBtn = button(sCtl, "Take the controls from here", () => takeControl(), "rt-btn lab-take");
    const driveBox = el("div", "lab-drive");
    sCtl.appendChild(driveBox);
    const dRate = slider(driveBox, "I_p ramp", -0.2, 0.2, 0.01, S.drive.rate, (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + " MA/s", (v) => (S.drive.rate = v));
    const dNbi = slider(driveBox, "NBI", 0, 33, 0.5, 0, (v) => v.toFixed(1) + " MW", (v) => (S.drive.nbi = v));
    const dEc = slider(driveBox, "ECRH", 0, 20, 0.5, 0, (v) => v.toFixed(1) + " MW", (v) => (S.drive.ecrh = v));
    const dLoc = slider(driveBox, "ECRH deposited at ρ̂", 0, 0.8, 0.01, 0.35, (v) => v.toFixed(2), (v) => (S.drive.loc = v));
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
    const dRow3 = controls(driveBox);
    button(dRow3, "Heating off", () => {
      dNbi.set(0);
      dEc.set(0);
      S.drive.nbi = S.drive.ecrh = 0;
    }, "rt-btn");
    button(dRow3, "Full heating", () => {
      dNbi.set(33);
      dEc.set(20);
      S.drive.nbi = 33;
      S.drive.ecrh = 20;
    }, "rt-btn");
    button(dRow3, "Hold I_p", () => {
      dRate.set(0);
      S.drive.rate = 0;
    }, "rt-btn");
    const stepInfo = el("div", "rt-note lab-stepinfo");
    driveBox.appendChild(stepInfo);
    // plasma: the salient parameters
    const sPl = section("Plasma");
    pedChips(sPl);
    const physNote = el("div", "lab-side-note", "Pedestal <b>earned by power</b>, as in TORAX 1.4. The true threshold is uncertain: 0.54–1.85 × the Martin scaling (95 %).");
    sPl.appendChild(physNote);
    PHYS_UI.push(physNote);
    const plRow = controls(sPl);
    sawChip(plRow);
    const allParams = el("a", "lab-sec-link", "all parameters ↓");
    allParams.href = "#";
    allParams.addEventListener("click", (e) => {
      e.preventDefault();
      pA.p.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    plRow.appendChild(allParams);
    PARAMS.filter((p) => p.side).forEach((p) => paramSlider(sPl, p));
    // outcome
    const sOut = section("Outcome");
    const scoreBox = el("div", "lab-scores lab-scores-side");
    sOut.appendChild(scoreBox);
    const sv = canvas(sOut, 152);

    // ================================================ the visual panels
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
    const tv = canvas(pT.body, root.clientWidth < 560 ? 330 : 400);
    const torusOpts = { topPad: 24 }; // room for the status over the plasma
    tv.maxDpr = 2; // the plasma redraws every frame: 2× is sharp enough and a third cheaper than 3× on phones
    const torus = makeTorus(tv, torusOpts);
    // the status of the shot, over the plasma: phase and confinement, who drives, the key numbers
    const hud = el("div", "lab-hud");
    tv.c.parentElement.appendChild(hud);
    const hudChip = el("span", "lab-hud-chip"), hudText = el("div", "lab-hud-text"), hudTags = el("div", "lab-hud-tags"), hudAlarm = el("span", "lab-hud-alarm");
    hud.append(hudChip, hudAlarm, hudText, hudTags);
    hudTags.addEventListener("click", (e) => {
      if (!e.target.closest(".lab-hud-reset")) return;
      const before = { as: { ...S.as }, tune: { ...S.tune } };
      resetParams();
      Object.assign(S.tune, tune0());
      if (S.live) resim();
      toast("Back to the calibrated plasma and the trained controller", "Undo", () => {
        Object.keys(before.as).forEach((k) => (S.as[k] = before.as[k]));
        PARAMS.forEach((q) => (PUI[q.k] || []).forEach((sl) => sl.set(S.as[q.k])));
        Object.assign(S.tune, before.tune);
        resim();
      });
    });
    // one line on what is happening at the cursor
    const narr = el("div", "lab-narr");
    narr.setAttribute("aria-live", "polite");
    narr.addEventListener("click", () => narr.classList.toggle("open")); // on a phone in full screen it is clamped
    pT.body.appendChild(narr);
    // the two heating systems at human scale: frequency as colour and wavelength, power as brightness and height
    const hsBox = el("div", "lab-heatstrip");
    pT.body.appendChild(hsBox);
    hsBox.appendChild(el("div", "lab-sec-title lab-heat-title", "Heating at human scale: the microwave, the beam and its light, at the cursor"));
    const hsv = canvas(hsBox, 104);
    note(hsBox, "Heating at human scale. Wavelengths are compressed (10× the frequency draws 1.8× shorter) and the light is slowed about 10¹¹×; ECRH's cyan is a false colour, the beam's red Balmer-α light is real. Taller and brighter: more power. The atoms fly at 3 % of light speed, drawn faster than that.");
    note(pT.body, "Drag to rotate; hover any part for its name and live values (tap on a phone). <b>About</b>, top right, explains the colours.");
    pT.cvs.push(tv, hsv);
    const lCv = canvas(lPoster, 220);
    lCv.maxDpr = 2;
    const lTorus = makeTorus(lCv, { topPad: 8 });
    const lChip = el("span", "lab-hud-chip lab-launch-chip"), lCap = el("span", "lab-launch-cap");
    lPoster.append(lChip, lCap);
    let lVisible = true;
    if (window.IntersectionObserver) new IntersectionObserver((es) => (lVisible = es[0].isIntersecting)).observe(lPoster);
    // ---- numbers at the cursor
    const pN = panel("lab-ctl", "Numbers at the cursor", ["reward", "flux"]);
    // two views of the same quantities: numbers (the value, three trailing averages, TORAX) or plots (each one
    // through the whole episode); hovering a number shows its history up to the cursor
    const numSeg = el("span", "lab-seg lab-viewseg");
    numSeg.setAttribute("role", "tablist");
    pN.tools.prepend(numSeg);
    const numBtns = {
      numbers: button(numSeg, "Numbers", () => setNumView("numbers"), "rt-chip"),
      plots: button(numSeg, "Plots", () => setNumView("plots"), "rt-chip"),
    };
    numBtns.numbers.title = "The value at the cursor, its trailing averages and TORAX's value";
    numBtns.plots.title = "Every quantity through the whole episode, one small plot each";
    const numKey = el("div", "lab-numkey");
    pN.body.appendChild(numKey);
    const readout = el("div", "lab-readout");
    pN.body.appendChild(readout);
    const nvBox = el("div", "lab-numplots");
    pN.body.appendChild(nvBox);
    const nv = canvas(nvBox, 480);
    const numPop = el("div", "lab-histpop");
    numPop.hidden = true;
    root.appendChild(numPop);
    const npCv = el("canvas", "");
    const npKey = el("div", "lab-histpop-key");
    numPop.append(el("div", "lab-histpop-title"), npCv, npKey);

    // ---- the knobs: who turns them, and what they read
    const pK = panel("lab-knobs", "The knobs: who turns them, and what they read");
    const kBanner = el("div", "lab-kbanner");
    pK.body.appendChild(kBanner);
    const kGrid = el("div", "lab-kgrid");
    pK.body.appendChild(kGrid);
    const kLeft = el("div", ""), kRight = el("div", "");
    kGrid.append(kLeft, kRight);
    const kv = canvas(kLeft, 318);
    const ks = canvas(kRight, 318);
    pK.cvs.push(kv, ks);
    pN.cvs.push(nv);

    // ---- traces
    const pX = panel("lab-traces", "Traces: the episode so far (solid: Lab, dashed: TORAX)", ["fusion", "ipb98", "plh"]);
    const xv = canvas(pX.body, 560);
    pX.cvs.push(xv);
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
    pP.cvs.push(pv);
    // ---- operating space
    const pO = panel("lab-ops", "Operating space", ["greenwald", "q", "betaN"]);
    const ov = canvas(pO.body, 270);
    pO.cvs.push(ov);
    // ---- space-time maps
    const pM = panel("lab-maps", "Space-time maps: each profile through the whole episode", ["diffusion", "heat", "q"]);
    const mapRow = el("span", "lab-seg");
    pM.tools.prepend(mapRow);
    const mapBtns = {};
    for (const [k, lab] of [["T", "T_e"], ["j", "j"], ["q", "q"], ["n", "n_e"]]) {
      mapBtns[k] = button(mapRow, lab, () => {
        S.mapTab = k;
        for (const kk in mapBtns) mapBtns[kk].classList.toggle("on", kk === k);
        S.dirty = true;
      }, "rt-chip" + (k === "T" ? " on" : ""));
    }
    S.mapTab = "T";
    const mv = canvas(pM.body, 330);
    pM.cvs.push(mv);
    note(pM.body, "Time runs left to right, the minor radius ρ̂ bottom (axis) to top (edge). Red line: the q = 1 surface; dashed: the pedestal top; dots: where the NBI (orange) and ECRH (cyan) power goes. The part after the cursor is dimmed. Underneath: the same map from TORAX where its profiles were recorded (PI, open loop, heating cut, PPO on PI, MBPO on PI), otherwise a second quantity from the Lab.");
    // ---- power and current balance
    const pB = panel("lab-balance", "Where the power and the current come from", ["sources", "plh", "bootstrap"]);
    const bv = canvas(pB.body, 340);
    pB.cvs.push(bv);
    // ---- reward over time
    const pR = panel("lab-reward", "Reward: this second, and through the episode", ["reward", "audited"]);
    const rewRow = el("span", "lab-seg");
    pR.tools.prepend(rewRow);
    const rewBtns = {};
    [0, 1, 2].forEach((i) => {
      rewBtns[i] = button(rewRow, ["benchmark", "audited", "custom"][i], () => {
        S.rewSlot = i;
        for (const kk in rewBtns) rewBtns[kk].classList.toggle("on", +kk === i);
        S.dirty = true;
      }, "rt-chip" + (i === 0 ? " on" : ""));
    });
    const rv = canvas(pR.body, 150);
    const ra = canvas(pR.body, 190);
    pR.cvs.push(rv, ra);
    const audit = el("div", "lab-audit");
    pR.body.appendChild(audit);

    // ================================================ below the visuals: set up the simulation
    const pA = panel("lab-params", "Simulation parameters (the Lab's physics; Gym-TORAX fixes all of these)", ["pedestal", "density", "eta", "bootstrap", "sawtooth"], below);
    button(pA.tools, "Reset to calibrated", () => resetParams(), "rt-btn");
    const pTop = el("div", "lab-params-top");
    pA.body.appendChild(pTop);
    pedChips(pTop);
    sawChip(pTop);
    const pGrid = el("div", "lab-params-grid");
    pA.body.appendChild(pGrid);
    [...new Set(PARAMS.map((p) => p.g))].forEach((g) => {
      const box = el("div", "lab-pgroup");
      box.appendChild(el("div", "lab-sec-title", g));
      PARAMS.filter((p) => p.g === g).forEach((p) => paramSlider(box, p));
      pGrid.appendChild(box);
    });
    note(pA.body, "Every change re-runs the episode. Schedules, and feedback presets in <i>recorded</i> mode, replay the same knob sequence; a feedback preset running <i>live on the Lab</i> reads the changed plasma and turns its knobs differently (watch the knobs panel and the side pane). Calibrated values are the ones fitted to TORAX; anything else is a what-if on the reduced model.");
    // ---- reward designer
    const pDz = panel("lab-designer", "Reward and benchmark designer: the ‘custom’ column", ["reward", "audited"], below);
    const cRow1 = controls(pDz.body), cRow2 = controls(pDz.body), cRow3 = controls(pDz.body);
    select(cRow1, "Q cap", [["Infinity", "none"], ["10", "10"], ["5", "5"]], S.custom.qCap, (v) => ((S.custom.qCap = +v), (S.dirty = true)));
    select(cRow1, "H-mode gate", [["temp", "T_e(0), T_i(0) > 10 keV"], ["temp+plh", "… and P_SOL ≥ P_LH"], ["pedestal", "pedestal up and P_SOL ≥ P_LH"]], S.custom.gate, (v) => ((S.custom.gate = v), (S.dirty = true)));
    slider(cRow2, "Greenwald penalty", 0, 0.05, 0.001, S.custom.pFgw, (v) => v.toFixed(3) + "/s", (v) => ((S.custom.pFgw = v), (S.dirty = true)));
    slider(cRow2, "q_min < 1 penalty", 0, 0.05, 0.001, S.custom.pQmin, (v) => v.toFixed(3) + "/s", (v) => ((S.custom.pQmin = v), (S.dirty = true)));
    select(cRow3, "end episode if f_GW >", [["Infinity", "never"], ["1", "1.0"], ["1.1", "1.1"], ["1.2", "1.2"]], "Infinity", (v) => ((S.custom.endFgw = +v), (S.dirty = true)));
    select(cRow3, "or q95 <", [["0", "never"], ["2", "2"], ["2.5", "2.5"], ["3", "3"]], "0", (v) => ((S.custom.endQ95 = +v), (S.dirty = true)));
    select(cRow3, "with", [["-1000", "−1000"], ["-10", "−10"], ["-1", "−1"], ["0", "0"]], "-1000", (v) => ((S.custom.endPenalty = +v), (S.dirty = true)));
    note(pDz.body, "The benchmark and audited rewards are fixed; this one is yours. Its return appears in the side pane and as the third bar and curve of the reward panel.");


    // ---- a toast: one line at the bottom, an optional action (Undo), gone after 5 s
    const toastEl = el("div", "lab-toast");
    toastEl.setAttribute("role", "status");
    toastEl.hidden = true;
    root.appendChild(toastEl);
    let toastT = 0;
    function toast(msg, action, fn) {
      clearTimeout(toastT);
      toastEl.innerHTML = `<span>${msg}</span>`;
      if (action) {
        const b = el("button", "lab-toast-act", action);
        b.type = "button";
        b.addEventListener("click", () => ((toastEl.hidden = true), fn()));
        toastEl.appendChild(b);
      }
      toastEl.hidden = false;
      toastT = setTimeout(() => (toastEl.hidden = true), action ? 6000 : 3000);
    }

    // ================================================ toolbar and information cards (top right)
    // Story folds the story above; the other buttons open one card at a time. Keys: ? About, L labels, S scoreboard,
    // F full screen, Esc closes.
    const ICON = {
      story: "M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13",
      tag: "M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01",
      az: "M3 18l4-12 4 12M4.3 14h5.4M14 6h7l-7 12h7",
      help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4.5M12 17.5h.01",
      grid: "M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16",
      full: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
      exit: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
    };
    const svgIcon = (d) => `<svg class="lab-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const bar = el("div", "lab-bar");
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Lab tools");
    root.insertBefore(bar, root.firstChild);
    const cardBox = el("div", "lab-cards");
    bar.after(cardBox);
    const tools = {}, cards = {};
    let openCard = null;
    function tool(id, icon, text, title, on) {
      const b = el("button", "lab-tool", `${svgIcon(ICON[icon])}<span>${text}</span>`);
      b.type = "button";
      b.title = title;
      b.setAttribute("aria-label", title);
      b.addEventListener("click", on);
      bar.appendChild(b);
      return (tools[id] = b);
    }
    function card(id, title, wide) {
      const c = el("section", "lab-card" + (wide ? " wide" : ""));
      c.setAttribute("role", "dialog");
      c.setAttribute("aria-label", title);
      const h = el("div", "lab-card-head", `<b>${title}</b>`);
      const x = el("button", "lab-card-x", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Close");
      x.addEventListener("click", () => showCard(null));
      h.appendChild(x);
      const body = el("div", "lab-card-body");
      c.append(h, body);
      c.hidden = true;
      cardBox.appendChild(c);
      return (cards[id] = { c, body });
    }
    function showCard(id) {
      openCard = openCard === id ? null : id;
      for (const k in cards) cards[k].c.hidden = k !== openCard;
      for (const k in cards) if (tools[k]) tools[k].setAttribute("aria-pressed", String(k === openCard));
      if (openCard === "scores" && SB.scen !== S.scen && !SB.running) runScoreboard();
      tools.story.setAttribute("aria-pressed", String(isFull() ? openCard === "fsstory" : !story.hidden));
      if (typeof syncOverlayHistory === "function") syncOverlayHistory();
    }
    function setStory(on) {
      story.hidden = !on;
      tools.story.classList.remove("news");
      tools.story.setAttribute("aria-pressed", String(on));
      store.set("story", on);
    }
    tool("story", "story", "Story", "Show or hide the story of the preset", () => (isFull() ? showCard("fsstory") : setStory(story.hidden)));
    tools.story.setAttribute("aria-pressed", String(!story.hidden));
    tool("layers", "tag", "Labels", "What is drawn on the plasma (L)", () => showCard("layers"));
    tool("acr", "az", "A–Z", "Acronyms and symbols spelled out", () => showCard("acr"));
    tool("about", "help", "About", "How to read the plasma view, and the keys (?)", () => showCard("about"));
    tool("scores", "grid", "Scoreboard", "Every preset on the Lab against the uncertain input (S)", () => showCard("scores"));
    const fullBtn = tool("full", "full", "", "Full screen (F)", () => toggleFull());

    // ================================================ full screen: a layout of its own, for desktop and for phones
    // Desktop (wide): scenario, preset and tools on a top bar; the side pane on the left; the plasma in the middle,
    // as large as the screen allows; one instrument at a time on the right (tabs); playback along the bottom.
    // Phone (narrow or portrait): the plasma on top, tabs under it (the controls are one of them), playback at the
    // bottom. The Lab's own elements move into this layout and back. The browser's full screen is used where it
    // exists; elsewhere (iPhones) the Lab simply covers the page.
    const isFull = () => root.classList.contains("lab-fs");
    const fs = el("div", "lab-fsgrid");
    fs.hidden = true;
    root.appendChild(fs);
    const fsTop = el("div", "fs-top"), fsSide = el("div", "fs-side"), fsStage = el("div", "fs-stage"), fsInst = el("div", "fs-inst"), fsPlay = el("div", "fs-play");
    const fsTabs = el("div", "fs-tabs"), fsBody = el("div", "fs-body");
    fsTabs.setAttribute("role", "tablist");
    // fades at the strip's edges while more tabs are behind them (F18)
    const tabFade = () => {
      fsTabs.classList.toggle("more-l", fsTabs.scrollLeft > 4);
      fsTabs.classList.toggle("more-r", fsTabs.scrollLeft + fsTabs.clientWidth < fsTabs.scrollWidth - 4);
    };
    fsTabs.addEventListener("scroll", tabFade, { passive: true });
    fsInst.append(fsTabs, fsBody);
    fs.append(fsTop, fsSide, fsStage, fsInst, fsPlay);
    const fsScen = el("div", "lab-seg fs-scen");
    const fsScenBtns = {
      benchmark: button(fsScen, "Benchmark", () => setScenario("benchmark"), "rt-chip"),
      physics: button(fsScen, "Physics env.", () => setScenario("physics"), "rt-chip"),
    };
    const fsPreset = document.createElement("select");
    fsPreset.className = "rt-select fs-preset";
    fsPreset.setAttribute("aria-label", "Preset");
    fsPreset.addEventListener("change", () => fsPreset.value && load(fsPreset.value));
    fsTop.append(el("b", "fs-title", "Ramp-up Lab"), fsScen, fsPreset);
    const cFsStory = card("fsstory", "What this preset shows");

    // ---- phone: a one-row app bar (close, the preset picker for both scenarios, a menu) and a one-line playback bar
    const PICON = {
      close: "M6 6l12 12M18 6L6 18",
      more: "M5 12h.01M12 12h.01M19 12h.01",
      play: "M7 5l12 7-12 7z",
      pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
      replay: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4.5h4.5",
      start: "M5 5h3v14H5zM20 5L9 12l11 7z",
      pin: "M9 4h6l-1 5 3 3H7l3-3zM12 12v8",
      chev: "M7 10l5 5 5-5",
    };
    const picon = (d, fill) => `<svg class="lab-ic${fill ? " fill" : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const mbtn = (cls, d, label, on, fill) => {
      const b = el("button", "fs-ib " + cls, picon(d, fill));
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.addEventListener("click", on);
      return b;
    };
    const mClose = mbtn("fs-close", PICON.close, "Close the Lab", () => fsExit());
    const mPick = el("label", "fs-pick");
    const mPickName = el("span", "fs-pick-name"), mPickScen = el("span", "fs-pick-scen");
    const mPickSel = document.createElement("select");
    mPickSel.setAttribute("aria-label", "Preset");
    mPick.append(el("span", "fs-pick-text"), el("span", "fs-pick-chev", picon(PICON.chev)), mPickSel);
    mPick.firstChild.append(mPickName, mPickScen);
    mPickSel.addEventListener("change", () => {
      const [sc, key] = mPickSel.value.split("|");
      if (sc !== S.scen) setScenario(sc, true);
      load(key);
    });
    const mMore = mbtn("fs-more", PICON.more, "More: story, labels, acronyms, about, scoreboard", () => toggleMenu());
    mMore.setAttribute("aria-haspopup", "menu");
    mMore.setAttribute("aria-expanded", "false");
    const mBar = el("div", "fs-mbar");
    mBar.append(mClose, mPick, mMore);
    const mMenu = el("div", "fs-menu");
    mMenu.setAttribute("role", "menu");
    mMenu.hidden = true;
    function toggleMenu(force) {
      const on = force === undefined ? mMenu.hidden : force;
      const was = !mMenu.hidden;
      mMenu.hidden = !on;
      mMore.setAttribute("aria-expanded", String(on));
      if (was !== on) syncOverlayHistory();
      if (!on) return;
      showCard(null);
      const other = S.scen === "physics" ? "benchmark" : "physics";
      const items = [
        ["Story: what this preset shows", () => showCard("fsstory")],
        ["Labels on the plasma", () => showCard("layers")],
        ["Acronyms and symbols", () => showCard("acr")],
        ["About the plasma view", () => showCard("about")],
        ["Scoreboard: every preset", () => showCard("scores")],
        [`Clear pins${S.pins.length ? ` (${S.pins.length})` : ""}`, () => clearPins(), !S.pins.length],
        [other === "physics" ? "Switch to the physics environment" : "Switch to the benchmark", () => setScenario(other)],
      ];
      mMenu.innerHTML = "";
      items.forEach(([lab, fn, dis]) => {
        const b = el("button", "fs-mi", lab);
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.disabled = !!dis;
        b.addEventListener("click", () => (toggleMenu(false), fn()));
        mMenu.appendChild(b);
      });
      mMenu.firstChild.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", (e) => !mMenu.hidden && !mMenu.contains(e.target) && !mMore.contains(e.target) && toggleMenu(false));
    function mSync() {
      const opt = (sc, k, lab) => `<option value="${sc}|${k}">${lab}</option>`;
      const avail = (q) => q.kind !== "torax" || LAB[q.key];
      mPickSel.innerHTML = ["benchmark", "physics"].map((sc) => ["open", "feedback", "human"].map((c) => {
        const items = PRESETS.filter((q) => q.ctrl === c && (q.scen === sc || q.scen === "both") && avail(q)).map((q) => opt(sc, q.key, q.label));
        if (c === "feedback") items.push(...Object.entries(EXTRA).filter(([k, v]) => v.scen === sc && LAB[k]).map(([k, v]) => opt(sc, k, v.label)));
        return items.length ? `<optgroup label="${sc === "physics" ? "Physics env." : "Benchmark"} · ${CTRL[c].tag}">${items.join("")}</optgroup>` : "";
      }).join("")).join("");
      mPickSel.value = `${S.scen}|${S.key}`;
      mPickName.textContent = S.label;
      mPickScen.textContent = PHYS() ? "physics environment" : "benchmark";
    }

    // the playback line: play, back to the start, a scrubber with event ticks and the time, speed, pin
    const pb = el("div", "fs-pb");
    const pbPlay = mbtn("pb-play", PICON.play, "Play", () => togglePlay(), true);
    const pbStart = mbtn("pb-start", PICON.start, "Back to the start", () => {
      S.cursor = 0;
      S.playing = false;
      playBtn.textContent = "Play";
      S.dirty = true;
    }, true);
    // the time line: our own slider (a native one cannot jump on a tap on every phone). A tap jumps, snapping to an
    // event tick within 6 px and naming it; a drag scrubs; dragging with the finger lifted above the bar scrubs
    // five times finer; arrows step 1 s, Page Up/Down 10 s.
    const pbScrub = el("div", "pb-scrub");
    pbScrub.setAttribute("role", "slider");
    pbScrub.tabIndex = 0;
    pbScrub.setAttribute("aria-label", "Time in the episode");
    pbScrub.setAttribute("aria-valuemin", "0");
    const pbTrack = el("span", "pb-track"), pbFill = el("span", "pb-fill"), pbTicks = el("span", "pb-ticks"), pbThumb = el("span", "pb-thumb"), pbBubble = el("span", "pb-bubble");
    pbTicks.setAttribute("aria-hidden", "true");
    pbBubble.hidden = true;
    pbTrack.appendChild(pbFill);
    pbScrub.append(pbTrack, pbTicks, pbThumb, pbBubble);
    const pbRange = pbScrub; // the time control (kept under this name for the slider gesture guard)
    let pbEvents = [], pbDrag = null, pbBubbleT = 0;
    const PAD = 12; // the thumb's radius: the track runs from PAD to width - PAD
    const pbX2t = (x) => { const r = pbScrub.getBoundingClientRect(); return clamp(((x - r.left - PAD) / (r.width - 2 * PAD)) * HOR(), 0, S.recs.length - 1); };
    const pbT2x = (t) => { const r = pbScrub.getBoundingClientRect(); return r.left + PAD + (t / HOR()) * (r.width - 2 * PAD); };
    function pbSet(t, bubble) {
      S.cursor = clamp(Math.round(t), 0, S.recs.length - 1);
      S.playing = false;
      playBtn.textContent = "Play";
      S.dirty = true;
      if (bubble !== undefined) pbShowBubble(bubble);
    }
    function pbShowBubble(text) {
      clearTimeout(pbBubbleT);
      pbBubble.textContent = text;
      pbBubble.hidden = false;
      pbBubbleT = setTimeout(() => (pbBubble.hidden = true), 1600);
    }
    const pbNear = (x, px) => {
      let best = null;
      for (const e of pbEvents) {
        const d = Math.abs(pbT2x(e.t) - x);
        if (d <= px && (!best || d < best.d)) best = { d, e };
      }
      return best && best.e;
    };
    const pbLabel = (t) => { const ev = pbEvents.filter((e) => e.t === t).map((e) => e.title); return `${t} s` + (ev.length ? ` · ${ev.join(", ")}` : ""); };
    pbScrub.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pbScrub.setPointerCapture(e.pointerId);
      const ev = pbNear(e.clientX, 6), t = ev ? ev.t : pbX2t(e.clientX);
      pbDrag = { id: e.pointerId, x0: e.clientX, t0: t, fine: false, fx: 0, ft: 0 };
      pbSet(t, pbLabel(Math.round(t)));
    });
    pbScrub.addEventListener("pointermove", (e) => {
      if (!pbDrag || e.pointerId !== pbDrag.id) return;
      const r = pbScrub.getBoundingClientRect(), fine = e.clientY < r.top - 40;
      if (fine && !pbDrag.fine) Object.assign(pbDrag, { fine: true, fx: e.clientX, ft: S.cursor });
      if (!fine) pbDrag.fine = false;
      const t = pbDrag.fine ? pbDrag.ft + ((e.clientX - pbDrag.fx) / (r.width - 2 * PAD)) * HOR() * 0.2 : pbX2t(e.clientX);
      const ev = !pbDrag.fine && pbNear(e.clientX, 5);
      const tt = ev ? ev.t : Math.round(t);
      pbSet(tt, pbLabel(tt) + (pbDrag.fine ? " · fine" : ""));
    });
    const pbUp = () => (pbDrag = null);
    pbScrub.addEventListener("pointerup", pbUp);
    pbScrub.addEventListener("pointercancel", pbUp);
    pbScrub.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (d === undefined && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.key === "Home" ? 0 : e.key === "End" ? S.recs.length - 1 : S.cursor + d;
      pbSet(t, pbLabel(clamp(t, 0, S.recs.length - 1)));
    });
    // the time: tap for a stepper (±1 s, ±10 s), for an exact second
    const pbTime = el("button", "fs-ib pb-time");
    pbTime.type = "button";
    pbTime.addEventListener("click", () => openStepper(pbTime, { get: () => S.cursor, set: (t) => pbSet(t), small: 1, big: 10, fmt: (v) => `${v} s`, fmtStep: (d) => `${d} s`, label: "time" }));
    const SPEEDS = [0.5, 1, 2, 4];
    const pbSpeed = el("button", "fs-ib pb-speed", "1×");
    pbSpeed.type = "button";
    pbSpeed.addEventListener("click", () => {
      S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length];
      spd.value = String(S.speed);
      pbSpeed.textContent = `${S.speed}×`; // at once, not on the next frame
    });
    const pbPin = mbtn("pb-pin", PICON.pin, "Pin this run (keep it as a line in every plot)", () => pinRun());
    const pbBadge = el("span", "pb-badge");
    pbPin.appendChild(pbBadge);
    pb.append(pbPlay, pbStart, pbScrub, pbTime, pbSpeed, pbPin);
    let pbKey = "", pbTickKey = "";
    function pbSync() {
      const drive = S.mode === "drive", on = drive ? S.running : S.playing, end = !drive && S.cursor >= S.recs.length - 1 && S.recs.length > 1;
      const st = on ? "pause" : end ? "replay" : "play";
      const key = `${st}|${S.cursor}|${S.speed}|${S.pins.length}|${HOR()}`;
      if (key !== pbKey) {
        pbKey = key;
        pbPlay.innerHTML = picon(PICON[st], st !== "replay");
        const lab = drive ? (on ? "Pause the run" : "Run: you drive") : on ? "Pause" : end ? "Play again from the start" : "Play";
        pbPlay.title = lab;
        pbPlay.setAttribute("aria-label", lab);
        const frac = S.cursor / HOR();
        pbScrub.style.setProperty("--pb", frac.toFixed(4));
        pbScrub.setAttribute("aria-valuemax", String(HOR()));
        pbScrub.setAttribute("aria-valuenow", String(S.cursor));
        pbScrub.setAttribute("aria-valuetext", pbLabel(S.cursor));
        pbTime.innerHTML = `${S.cursor} s<span class="pb-pm">±</span>`;
        pbTime.title = "Step the time by 1 s or 10 s";
        pbTime.setAttribute("aria-label", `t = ${S.cursor} s; step the time`);
        if (!pbBubble.hidden) pbBubble.style.left = `calc(${PAD}px + ${frac.toFixed(4)} * (100% - ${2 * PAD}px))`;
        pbSpeed.textContent = `${S.speed}×`;
        pbSpeed.title = `Playback speed ${S.speed}× (tap to change)`;
        pbSpeed.setAttribute("aria-label", pbSpeed.title);
        pbBadge.textContent = S.pins.length ? String(S.pins.length) : "";
      }
      // event ticks on the track: heating, transitions, q_min < 1, limits, the end
      const tk = `${S.recsVersion}|${S.recs.length}|${S.scen}|${HOR()}`;
      if (tk !== pbTickKey) {
        pbTickKey = tk;
        pbEvents = eventsOf().list;
        pbTicks.innerHTML = pbEvents.map((e) => `<i style="left:calc(${PAD}px + ${(e.t / HOR()).toFixed(4)} * (100% - ${2 * PAD}px));background:${TICK_COLOR[e.kind] || TONE_COLOR[e.tone]}" title="${e.title} at ${e.t} s"></i>`).join("");
      }
    }

    // ---- a stepper popover for exact values (the time; any slider's value on a phone)
    const stepEl = el("div", "lab-step");
    stepEl.setAttribute("role", "group");
    stepEl.hidden = true;
    root.appendChild(stepEl);
    let stepCfg = null;
    function openStepper(anchor, cfg) {
      if (stepCfg && stepCfg.anchor === anchor && !stepEl.hidden) return closeStepper();
      stepCfg = { ...cfg, anchor };
      stepEl.setAttribute("aria-label", `Step the ${cfg.label}`);
      const b = (txt, d, lab) => `<button type="button" data-d="${d}" aria-label="${lab}">${txt}</button>`;
      stepEl.innerHTML = b("−" + cfg.fmtStep(cfg.big), -cfg.big, `minus ${cfg.fmtStep(cfg.big)}`) + b("−" + cfg.fmtStep(cfg.small), -cfg.small, `minus ${cfg.fmtStep(cfg.small)}`) +
        `<output></output>` + b("+" + cfg.fmtStep(cfg.small), cfg.small, `plus ${cfg.fmtStep(cfg.small)}`) + b("+" + cfg.fmtStep(cfg.big), cfg.big, `plus ${cfg.fmtStep(cfg.big)}`);
      stepEl.hidden = false;
      syncOverlayHistory();
      stepShow();
      const rr = root.getBoundingClientRect(), ar = anchor.getBoundingClientRect(), sw = stepEl.offsetWidth, sh = stepEl.offsetHeight;
      stepEl.style.left = clamp(ar.left + ar.width / 2 - sw / 2 - rr.left, 6, rr.width - sw - 6) + "px";
      const above = ar.top - rr.top - sh - 8;
      stepEl.style.top = (above > 4 ? above : ar.bottom - rr.top + 8) + "px";
    }
    function stepShow() {
      if (stepCfg) stepEl.querySelector("output").textContent = stepCfg.fmt(stepCfg.get());
    }
    function closeStepper() {
      if (stepEl.hidden) return;
      stepEl.hidden = true;
      stepCfg = null;
      syncOverlayHistory();
    }
    stepEl.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-d]");
      if (!b || !stepCfg) return;
      stepCfg.set(stepCfg.get() + +b.dataset.d);
      stepShow();
      requestAnimationFrame(stepShow);
    });
    document.addEventListener("pointerdown", (e) => !stepEl.hidden && !stepEl.contains(e.target) && !(stepCfg && stepCfg.anchor.contains(e.target)) && closeStepper(), true);
    // on a phone, a slider's value is a button that opens the stepper (fine steps; the slider stays for coarse moves)
    root.addEventListener("click", (e) => {
      const v = e.target.closest(".rt-ctl-val");
      if (!v || !phoneUI()) return;
      const inp = v.parentElement.querySelector('input[type="range"]');
      if (!inp) return;
      const st = +inp.step || 1, dec = (String(inp.step).split(".")[1] || "").length;
      openStepper(v, {
        label: (v.parentElement.querySelector(".rt-ctl-label") || {}).textContent || "value",
        get: () => +inp.value,
        set: (x) => {
          inp.value = clamp(+x.toFixed(dec), +inp.min, +inp.max);
          slideCommit = true;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          slideCommit = false;
        },
        small: st, big: st * 10, fmt: () => v.textContent, fmtStep: (d) => (+d.toFixed(dec)).toString(),
      });
    });

    // ---- sliders on touch (F03): a swipe that starts on a slider scrolls; the value changes only on a sideways drag
    // of the thumb or a tap. Input events are held back (in the capture phase) until the gesture is clear; a scroll
    // puts the slider back silently.
    let slideGest = null, slideCommit = false;
    root.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || !(e.target instanceof HTMLInputElement) || e.target.type !== "range") return;
      slideGest = { input: e.target, x: e.clientX, y: e.clientY, v0: e.target.value, mode: null };
    }, true);
    root.addEventListener("pointermove", (e) => {
      const g = slideGest;
      if (!g || g.mode) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        g.mode = "slide";
        slideCommit = true;
        g.input.dispatchEvent(new Event("input", { bubbles: true }));
        slideCommit = false;
      } else if (Math.abs(dy) > 6) g.mode = "scroll";
    }, true);
    const slideEnd = (e) => {
      const g = slideGest;
      slideGest = null;
      if (!g) return;
      if (e.type === "pointerup" && !g.mode && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 8 && g.input.value !== g.v0) {
        slideCommit = true; // a tap on the track: a deliberate jump
        g.input.dispatchEvent(new Event("input", { bubbles: true }));
        slideCommit = false;
      } else if (g.mode !== "slide") g.input.value = g.v0;
    };
    window.addEventListener("pointerup", slideEnd, true);
    window.addEventListener("pointercancel", slideEnd, true);
    root.addEventListener("input", (e) => {
      if (slideGest && e.target === slideGest.input && slideGest.mode !== "slide" && !slideCommit) e.stopPropagation();
    }, true);

    // ---- history: entering pushes an entry, so the system Back gesture leaves the Lab, not the page (M2)
    let fsPushed = false, fsScrollY = 0, fsThenHash = null, fsScrollMode = "auto";
    root.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || !isFull()) return;
      e.preventDefault();
      fsThenHash = a.getAttribute("href");
      fsExit();
    });
    window.addEventListener("popstate", () => {
      if (isFull() && !(history.state && history.state.labFs)) return fsExit(true);
      // Back with a card, the menu or a stepper open closes it first (a phone convention)
      if (isFull() && !(history.state && history.state.labOv) && (openCard || !mMenu.hidden || !stepEl.hidden)) {
        ovFromPop = true;
        toggleMenu(false);
        showCard(null);
        closeStepper();
        ovFromPop = false;
      }
    });
    // one history entry while any overlay is open on a phone; closing the last one takes it off again
    let ovFromPop = false, ovQueued = false;
    function syncOverlayHistory() {
      if (ovQueued) return;
      ovQueued = true;
      queueMicrotask(() => {
        ovQueued = false;
        if (!phoneUI()) return;
        const open = !!openCard || !mMenu.hidden || !stepEl.hidden, onOv = !!(history.state && history.state.labOv);
        if (open && !onOv) history.pushState({ ...(history.state || {}), labOv: true }, "");
        else if (!open && onOv && !ovFromPop) history.back();
      });
    }
    // on a phone a tap outside an open card closes it, and does nothing else
    let swallowClick = false;
    root.addEventListener("pointerdown", (e) => {
      if (!phoneUI() || !openCard) return;
      if (e.target.closest(".lab-card, .fs-menu, .fs-more, .lab-step")) return;
      e.stopPropagation();
      e.preventDefault();
      swallowClick = true;
      showCard(null);
    }, true);
    root.addEventListener("click", (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    story.addEventListener("click", (e) => e.target.closest(".lab-t") && phoneUI() && showCard(null));
    function fsSync() {
      for (const k in fsScenBtns) fsScenBtns[k].classList.toggle("on", k === S.scen);
      const opt = (k, lab) => `<option value="${k}">${lab}</option>`;
      fsPreset.innerHTML = ["open", "feedback", "human"].map((c) => {
        const items = PRESETS.filter((q) => q.ctrl === c && presetBtns[q.key] && !presetBtns[q.key].hidden).map((q) => opt(q.key, q.label));
        if (c === "feedback") items.push(...Object.entries(EXTRA).filter(([k, v]) => v.scen === S.scen && LAB[k]).map(([k, v]) => opt(k, v.label)));
        return items.length ? `<optgroup label="${CTRL[c].tag}">${items.join("")}</optgroup>` : "";
      }).join("");
      fsPreset.value = S.key;
    }
    // what goes into the tabs: in the desktop layout the controls and the heating strip have places of their own
    const FS_ITEMS = [
      { id: "controls", lab: "Controls", node: () => side, phone: true },
      { id: "numbers", lab: "Numbers", P: () => pN },
      { id: "heat", lab: "Heating waves", node: () => hsBox, phone: true },
      { id: "knobs", lab: "Knobs", P: () => pK },
      { id: "traces", lab: "Traces", P: () => pX },
      { id: "profiles", lab: "Profiles", P: () => pP },
      { id: "ops", lab: "Operating space", P: () => pO },
      { id: "maps", lab: "Maps", P: () => pM },
      { id: "power", lab: "Power", P: () => pB },
      { id: "reward", lab: "Reward", P: () => pR },
      { id: "setup", lab: "Set-up", P: () => pA },
      { id: "design", lab: "Reward design", P: () => pDz },
    ];
    const home = new Map(); // element -> [parent, next sibling] before it moved
    function place(node, parent) {
      if (!home.has(node)) home.set(node, [node.parentNode, node.nextSibling]);
      parent.appendChild(node);
    }
    function goHome() {
      // elements made for full screen only (the phone's app bar, menu and playback line) have no home: detach them
      [...home.entries()].reverse().forEach(([node, [parent, next]]) => (parent ? parent.insertBefore(node, next) : node.remove()));
      home.clear();
    }
    let fsMode = null, fsSaved = null, tvH0 = tv.h, fsTab = null;
    const fsItems = () => FS_ITEMS.filter((it) => (fsMode !== "desk" || !it.phone) && (it.id !== "heat" || layers.heatstrip));
    const itemNode = (it) => (it.P ? it.P().p : it.node());
    function fsLayout(force) {
      if (!isFull()) return;
      // desk: wide screens; land: a phone on its side (plasma left, tabs right); phone: upright
      const mode = !SMALL() && innerWidth >= 900 && innerWidth >= innerHeight * 0.9 ? "desk" : innerWidth > innerHeight ? "land" : "phone";
      if (mode !== fsMode || force) {
        goHome();
        fsMode = mode;
        root.classList.toggle("fs-desk", mode === "desk");
        root.classList.toggle("fs-phone", mode !== "desk");
        root.classList.toggle("fs-land", mode === "land");
        torusOpts.topPad = mode === "desk" ? 24 : 4;
        if (mode === "desk") {
          place(bar, fsTop);
          place(sPlay, fsPlay);
        } else {
          place(mBar, fsTop);
          place(mMenu, fsTop);
          place(pb, fsPlay);
          mSync();
        }
        place(pT.p, fsStage);
        place(story, cFsStory.body);
        if (mode === "desk") place(side, fsSide);
        fsTabs.innerHTML = "";
        for (const it of fsItems()) {
          place(itemNode(it), fsBody);
          const b = button(fsTabs, it.lab, () => fsShowTab(it.id), "rt-chip");
          b.dataset.tab = it.id;
          b.setAttribute("role", "tab");
        }
        story.hidden = false;
        pT.set(true);
        // a rotation keeps the open tab; a new session opens on the tab last used in this orientation
        fsShowTab(fsTab || store.get("fs-tab-" + mode, mode === "desk" ? "numbers" : "controls"));
      }
      requestAnimationFrame(fsFit);
    }
    function fsShowTab(id) {
      const items = fsItems();
      const cur = items.find((it) => it.id === id) || items[0];
      for (const it of items) {
        const on = it === cur;
        itemNode(it).classList.toggle("fs-on", on);
        if (it.P) it.P().set(on);
      }
      fsTabs.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("on", b.dataset.tab === cur.id);
        b.setAttribute("aria-selected", String(b.dataset.tab === cur.id));
        if (b.dataset.tab === cur.id) {
          const l = b.offsetLeft - fsTabs.offsetLeft, r = l + b.offsetWidth, pad = 12;
          if (l - pad < fsTabs.scrollLeft) fsTabs.scrollLeft = l - pad;
          else if (r + pad > fsTabs.scrollLeft + fsTabs.clientWidth) fsTabs.scrollLeft = r + pad - fsTabs.clientWidth;
        }
      });
      fsBody.scrollTop = 0;
      store.set("fs-tab-" + fsMode, cur.id);
      fsTab = cur.id;
      requestAnimationFrame(tabFade);
      if (cur.id === "heat") hsv.fit();
      if (cur.id === "controls") (sv.fit(), tl.fit());
      S.dirty = true;
    }
    // the plasma as large as the stage allows (desktop); about 40 % of the screen height on a phone
    function fsFit() {
      if (!isFull()) return;
      const others = pT.p.offsetHeight - tv.c.offsetHeight;
      tv.h = Math.round(fsMode === "phone" ? clamp(Math.min(innerHeight * 0.34, innerWidth * 0.95), 200, 300) : Math.max(fsMode === "land" ? 160 : 260, fsStage.clientHeight - others - 4));
      fitAll();
    }
    const fsHolder = el("div", "lab-fs-holder");
    fsHolder.setAttribute("aria-hidden", "true");
    function fsEnter() {
      if (isFull()) return;
      fsScrollY = window.scrollY;
      const cs = getComputedStyle(root);
      fsHolder.style.height = root.getBoundingClientRect().height + "px";
      fsHolder.style.margin = cs.margin;
      root.before(fsHolder);
      fsSaved = new Map(FOLDS.map((P) => [P, P.open]));
      tvH0 = tv.h;
      root.classList.remove("lab-small");
      root.classList.add("lab-fs");
      fs.hidden = false;
      document.documentElement.classList.add("lab-fs-lock");
      fsSync();
      fsLayout(true);
      fullBtn.innerHTML = `${svgIcon(ICON.exit)}<span></span>`;
      fullBtn.title = "Leave full screen (F or Esc)";
      fullBtn.setAttribute("aria-pressed", "true");
      if (!(history.state && history.state.labFs)) {
        fsScrollMode = history.scrollRestoration;
        history.scrollRestoration = "manual";
        history.pushState({ ...(history.state || {}), labFs: true }, "");
        fsPushed = true;
      }
      if (root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().catch(() => {});
      S.dirty = true;
    }
    // leaving: Close, Esc and the browser's own full-screen exit go back one history entry; the popstate does the rest
    function fsExit(fromPop) {
      if (!isFull()) return;
      S.playing = false;
      S.running = false;
      playBtn.textContent = "Play";
      runBtn.textContent = "Run";
      if (!fromPop && fsPushed && history.state && history.state.labFs) return history.state.labOv ? history.go(-2) : history.back();
      fsPushed = false;
      fsTab = null;
      toggleMenu(false);
      showCard(null);
      // back into the page in one step: the placeholder goes as the Lab returns, before anything forces a layout
      // (otherwise the page is briefly twice as tall and scroll anchoring moves it)
      document.documentElement.style.overflowAnchor = "none";
      fsHolder.remove();
      goHome();
      root.classList.remove("lab-fs", "fs-desk", "fs-phone", "fs-land");
      torusOpts.topPad = 24;
      narr.classList.remove("open");
      fs.hidden = true;
      fsMode = null;
      document.documentElement.classList.remove("lab-fs-lock");
      FOLDS.forEach((P) => P.set(fsSaved.get(P)));
      FS_ITEMS.forEach((it) => itemNode(it).classList.remove("fs-on"));
      story.hidden = store.get("story", true) === false;
      tv.h = tvH0;
      fullBtn.innerHTML = `${svgIcon(ICON.full)}<span></span>`;
      fullBtn.title = "Full screen (F)";
      fullBtn.setAttribute("aria-pressed", "false");
      applyMode();
      window.scrollTo(0, fsScrollY);
      // the page is restored once the Lab is back in its flow: after the browser's full screen has ended (it
      // ends asynchronously) and one frame; scroll anchoring stays off until then
      const done = () => requestAnimationFrame(() => {
        fitAll();
        applyMode();
        history.scrollRestoration = fsScrollMode;
        if (fsThenHash) {
          const target = document.getElementById(fsThenHash.slice(1));
          fsThenHash = null;
          if (target) target.scrollIntoView({ block: "start" });
        } else window.scrollTo(0, fsScrollY);
        document.documentElement.style.overflowAnchor = "";
      });
      if (document.fullscreenElement === root) document.exitFullscreen().then(done, done);
      else done();
    }
    // inline: the launch card on small viewports, the full Lab otherwise
    function applyMode() {
      const small = SMALL() && !isFull();
      if (root.classList.contains("lab-small") !== small) {
        root.classList.toggle("lab-small", small);
        if (!small) requestAnimationFrame(fitAll);
      }
      if (small) {
        lCv.fit();
        const p = presetOf(S.key);
        launch.querySelector(".lab-launch-preset").innerHTML = p ? `Opens with <b>${S.label}</b> · ${PHYS() ? "physics environment" : "benchmark"}${S.cursor ? ` · t = ${S.cursor} s` : ""}` : "";
      }
    }
    lGo.addEventListener("click", () => fsEnter());
    function toggleFull(force) {
      const on = force === undefined ? !isFull() : force;
      on ? fsEnter() : fsExit();
    }
    // leaving the browser's full screen (Esc) leaves the layout too
    document.addEventListener("fullscreenchange", () => !document.fullscreenElement && isFull() && fsExit());
    let fsRaf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(fsRaf);
      fsRaf = requestAnimationFrame(() => (isFull() ? fsLayout(false) : applyMode()));
    });

    // ---- labels: the layers drawn on the plasma
    const cLay = card("layers", "Labels on the plasma");
    const LAYER_TEXT = [
      ["labels", "Part names", "central solenoid, launcher, injector, rational surfaces"],
      ["lines", "Field lines", "on three flux surfaces, winding with the local q"],
      ["beams", "Heating beams", "the ECRH microwave and the NBI atoms in the machine"],
      ["callouts", "Event callouts", "heating on, transitions, q_min < 1, limits, as they happen"],
      ["narration", "Narration", "one line under the plasma on what is happening"],
      ["heatstrip", "Heating at human scale", "the two heating systems side by side: frequency, wavelength, power"],
    ];
    const layerChecks = {};
    LAYER_TEXT.forEach(([k, t, d]) => {
      const lab = el("label", "lab-check");
      const c = document.createElement("input");
      c.type = "checkbox";
      c.checked = !!layers[k];
      c.addEventListener("change", () => setLayer(k, c.checked));
      lab.append(c, el("span", "", `<b>${t}</b><small>${d}</small>`));
      cLay.body.appendChild(lab);
      layerChecks[k] = c;
    });
    cLay.body.appendChild(el("p", "lab-card-more", "Hover a part of the plasma (or tap it on a touch screen) for its name and live values. <kbd>L</kbd> toggles the part names."));
    function setLayer(k, on) {
      layers[k] = on;
      if (layerChecks[k]) layerChecks[k].checked = on;
      store.set("layers", layers);
      narr.hidden = !layers.narration;
      hsBox.hidden = !layers.heatstrip;
      if (layers.heatstrip) hsv.fit();
      S.dirty = true;
    }
    narr.hidden = !layers.narration;
    hsBox.hidden = !layers.heatstrip;

    // ---- acronyms
    const ACRONYMS = [
      ["Machine and heating", [["ITER", "the tokamak under construction in France; the scenario here is its hybrid ramp-up"], ["TORAX", "Google DeepMind's open-source transport simulator; Gym-TORAX wraps it as an RL environment"], ["CS", "central solenoid, the transformer that drives the current"], ["NBI", "neutral beam injection: 1 MeV deuterium atoms, 33 MW"], ["ECRH", "electron cyclotron resonance heating: 170 GHz microwaves, 20 MW"], ["ECCD", "electron cyclotron current drive"], ["Balmer-α (D-α)", "the red 656 nm line deuterium atoms emit when excited"]]],
      ["Plasma", [["I_p", "plasma current [MA]"], ["j(0)", "current density on the magnetic axis [MA/m²]"], ["q, q_min, q95", "safety factor: toroidal turns per poloidal turn of a field line; its minimum; its value at 95 % of the flux"], ["ρ̂", "normalised minor radius, 0 on axis, 1 at the edge"], ["T_e, T_i", "electron and ion temperature [keV]"], ["n_e, f_GW", "electron density; its ratio to the Greenwald limit"], ["P_LH", "the L-H threshold power (Martin 2008 scaling)"], ["P_SOL, P_heat", "power leaving across the edge; heating power as TORAX 1.4 compares it with P_LH"], ["L-mode, H-mode", "low and high confinement; H-mode has an edge pedestal"], ["H98", "confinement time relative to the IPB98(y,2) scaling"], ["Q", "fusion gain: fusion power over heating power"], ["β_N", "normalised plasma pressure"], ["l_i(3)", "internal inductance: how peaked the current is"], ["V_loop", "loop voltage"]]],
      ["Controllers and learning", [["PI", "proportional-integral feedback controller"], ["RL", "reinforcement learning"], ["PPO", "proximal policy optimisation (model-free RL)"], ["MBPO", "model-based policy optimisation"], ["TD3+BC", "offline RL: TD3 with a behaviour-cloning term"], ["CEM", "cross-entropy method, a search over schedules"]]],
    ];
    const cAcr = card("acr", "Acronyms and symbols");
    ACRONYMS.forEach(([g, items]) => {
      cAcr.body.appendChild(el("h4", "", g));
      cAcr.body.appendChild(el("dl", "lab-acr", items.map(([a, d]) => `<dt>${a}</dt><dd>${d}</dd>`).join("")));
    });
    cAcr.body.appendChild(el("p", "lab-card-more", `More in the <a href="${pageURL("primer/8-field")}#glossary">glossary</a>.`));

    // ---- about
    const cAbout = card("about", "About the plasma view");
    cAbout.body.innerHTML =
      `<p>An ITER-sized torus cut open twice. The <b>cut faces</b> show nested flux surfaces coloured by T_e, j or q (buttons above the view). The <b>red ring</b> is the q = 1 surface, the dashed one q = 2; <b>field lines</b> on three surfaces wind with the local q; the blue fill in the <b>central solenoid</b> is the flux used so far.</p>` +
      `<h4>Heating</h4><ul>` +
      `<li><b>ECRH</b> is a wave: 170 GHz microwaves (λ = 1.76 mm) from a launcher in an upper port, drawn 400× longer and slowed about 10¹¹×. Height and brightness grow with power; it fades where the electrons absorb it.</li>` +
      `<li><b>NBI</b> is not a wave but a beam of 1 MeV deuterium atoms, drawn as moving dots that thin out as the plasma ionises them; the red glow is the Balmer-α light they emit.</li>` +
      `<li>The <b>strip under the plasma</b> compares the two on one scale: frequency as colour and wavelength, power as height and brightness.</li></ul>` +
      `<h4>Status</h4><ul>` +
      `<li>The <b>chip</b> on the view: the phase of the shot and the confinement state as the reward sees it.</li>` +
      `<li><b>Callouts</b> pin events to the part where they happen; a <b>red pulsing edge</b> means a limit is violated, and the view flashes red when one is crossed during playback.</li>` +
      `<li>The <b>narration</b> under the view says what is happening and who is turning the knobs.</li></ul>` +
      `<h4>Numbers at the cursor</h4><p>Big: the value at the cursor. Small print: the averages over the last 5, 20 and 60 s (muted while a window has not filled yet; for Q, the gain over the window), and TORAX's value at the same time. Hover or tap a number for its history with TORAX and your pins; <b>Numbers | Plots</b> switches to one small plot per quantity.</p>` +
      `<h4>On a phone</h4><p>The playback bar: play, back to the start, the time line (tap to jump; a tap next to a tick snaps to that event and names it; drag to scrub, and lift your finger above the bar while dragging to scrub five times finer), the time (tap it to step by 1 s or 10 s), the speed and pin. Tap a slider's value to step it exactly. Back closes a card or the menu, then the Lab.</p>` +
      `<h4>Keys</h4><p><kbd>Space</kbd> play or pause · <kbd>←</kbd> <kbd>→</kbd> step 1 s (with <kbd>Shift</kbd> 10 s) · <kbd>F</kbd> full screen · <kbd>L</kbd> part names · <kbd>S</kbd> scoreboard · <kbd>?</kbd> this card · <kbd>Esc</kbd> close</p>` +
      `<p class="lab-card-more"><a href="#model-card">Model card</a>: what the reduced model is, how it was calibrated against TORAX and where it is wrong.</p>`;

    // ---- scoreboard: every preset on the Lab, with the uncertain input varied
    const cSB = card("scores", "Scoreboard: every preset on the Lab", true);
    const sbHead = el("div", "lab-sb-head");
    const sbTable = el("div", "lab-sb");
    cSB.body.append(sbHead, sbTable);
    const SB = { scen: null, running: false, rows: [] };
    const sbCols = () => (PHYS()
      ? { k: "plhMul", lab: "true L-H threshold ÷ Martin", vals: [0.9, 1, 1.1, 1.2], f: (v) => v.toFixed(1) + "×", cfg: M.REWARD_PRESETS.physics, ret: "physics-environment return" }
      : { k: "transportMul", lab: "transport ×", vals: [0.7, 1, 1.5], f: (v) => v.toFixed(1) + "×", cfg: M.REWARD_PRESETS.audited, ret: "audited return" });
    function sbPresets() {
      const keys = PRESETS.filter((p) => p.scen === S.scen && p.kind !== "sandbox" && (p.kind === "lab" || LAB[p.key])).map((p) => p.key);
      return keys.concat(Object.keys(EXTRA).filter((k) => EXTRA[k].scen === S.scen && LAB[k]));
    }
    function sbRun(key, k, v) {
      const p = presetOf(key), base = { ...(PHYS() ? M.PHYSICS : {}), pedMode: pedMode0(), sawtooth: false };
      for (const q of PARAMS) {
        const val = q.k === k ? v : defOf(q);
        Object.assign(base, q.map ? q.map(val) : { [q.k]: val });
      }
      const m = M.create(base), recs = [m.state.last];
      const ctrl = p.live === "pi" ? RC.piController(null, PHYS() ? RC.PHYSICS_PI : RC.PAPER_PI) : p.live === "policy" && POLICY[key] ? RC.learnedController(POLICY[key], null) : null;
      if (ctrl) {
        ctrl.reset();
        let d = m.state.last;
        for (let t = 0; t < HOR(); t++) {
          const a = ctrl.act(d);
          d = m.step({ Ip: a.Ip, nbi: a.nbi, ecrh: a.ecrh });
          recs.push(d);
          if (d.failed) break;
        }
      } else {
        const acts = p.kind === "lab" ? Array.from({ length: 151 }, (_, t) => LAB_ACTIONS[key](t)) : actionsFromTorax(LAB[key]);
        for (const a of acts) {
          const d = m.step(a);
          recs.push(d);
          if (d.failed) break;
        }
      }
      return recs;
    }
    async function runScoreboard() {
      const scen = S.scen, C = sbCols(), keys = sbPresets();
      SB.running = true;
      SB.scen = scen;
      SB.rows = keys.map((key) => ({ key, cells: [] }));
      const t0 = performance.now();
      let n = 0;
      for (const row of SB.rows) {
        if (presetOf(row.key).live === "policy" && !POLICY[row.key]) {
          drawScoreboard(`loading the ${presetOf(row.key).label} network…`);
          try {
            POLICY[row.key] = await getJSON("policies/" + row.key);
          } catch (e) {
            /* scored on its recorded knobs instead */
          }
        }
        for (const v of C.vals) {
          if (S.scen !== scen) return (SB.running = false), (SB.scen = null);
          const recs = sbRun(row.key, C.k, v), sc = M.scoreEpisode(recs.slice(1), C.cfg);
          const paid = recs.slice(1, sc.endT || undefined).filter((d) => (PHYS() ? physPaid(d) : d.Te0 > 10 && d.Ti0 > 10 && d.psolPlh >= 1)).length;
          row.cells.push({ v, ret: sc.ret, endT: sc.endT, why: sc.why, paid, live: presetOf(row.key).live && (presetOf(row.key).live === "pi" || POLICY[row.key]) });
          drawScoreboard(`running ${++n} of ${keys.length * C.vals.length} episodes…`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      SB.running = false;
      SB.secs = (performance.now() - t0) / 1000;
      drawScoreboard();
    }
    function drawScoreboard(status) {
      const C = sbCols();
      sbHead.innerHTML = `<p>Each cell is one ${HOR()} s episode on the Lab: <b>${C.ret}</b>, with <b>${C.lab}</b> set as in the column and every other parameter at its calibrated value. ` +
        `Controllers run <b>live</b>, reading the Lab's plasma; schedules replay their knobs. Small print: seconds paid as H-mode. ${TOUCH_DEV ? "Tap" : "Click"} a cell to open that run.</p>` +
        `<p class="lab-sb-status">${status || (SB.rows.length ? `Done in ${(SB.secs || 0).toFixed(1)} s, in your browser. The best preset in each column is outlined.` : "")}</p>`;
      if (!SB.rows.length) return (sbTable.innerHTML = "");
      const cols = C.vals.map((_, j) => SB.rows.map((r) => r.cells[j]).filter((c) => c && !c.endT).map((c) => c.ret));
      const lo = cols.map((c) => Math.min(...c)), hi = cols.map((c) => Math.max(...c));
      const tone = (c, j) => (c.endT ? "end" : hi[j] - lo[j] < 1e-6 ? "h1" : ["h5", "h4", "h3", "h2", "h1"][Math.min(4, Math.floor((5 * (c.ret - lo[j])) / (hi[j] - lo[j] + 1e-9)))]);
      sbTable.innerHTML = `<table class="lab-sb-t"><thead><tr><th>Preset</th>${C.vals.map((v) => `<th>${C.lab}<br><b>${C.f(v)}</b></th>`).join("")}</tr></thead><tbody>` +
        SB.rows.map((r) => {
          const p = presetOf(r.key);
          return `<tr><th><span class="lab-cls ${CTRL[p.ctrl].cls === "fb" ? "" : CTRL[p.ctrl].cls}">${CTRL[p.ctrl].tag}</span>${p.label}</th>` +
            C.vals.map((v, j) => {
              const c = r.cells[j];
              if (!c) return `<td class="pending">…</td>`;
              const best = !c.endT && Math.abs(c.ret - hi[j]) < 1e-9;
              return `<td class="${tone(c, j)}${best ? " best" : ""}" data-key="${r.key}" data-v="${v}" title="${c.endT ? `ended at ${c.endT} s: ${c.why}` : `${C.ret} ${c.ret.toFixed(3)}`}${c.live ? " (live)" : " (recorded knobs)"}">` +
                `<b>${c.endT ? "ended" : c.ret.toFixed(2)}</b><small>${c.endT ? `at ${c.endT} s` : `H ${c.paid} s`}</small></td>`;
            }).join("") + `</tr>`;
        }).join("") + `</tbody></table>`;
    }
    sbTable.addEventListener("click", (e) => {
      const td = e.target.closest("td[data-key]");
      if (!td) return;
      const key = td.dataset.key, v = +td.dataset.v, C = sbCols();
      resetParams(true);
      if (presetOf(key).live) S.livePref = true;
      load(key);
      setParam(C.k, v, true);
      showCard(null);
      pT.p.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    // ================================================ events, narration and the status over the plasma
    // What happens in this run, second by second: drives the callouts on the plasma, the narration and the flash.
    let EVC = { key: "", list: [], end: null };
    function physEnd() {
      return eventsOf().end;
    }
    function eventsOf() {
      const R = S.recs, key = `${S.recsVersion}|${R.length}|${S.scen}|${S.as.pedMode}`;
      if (EVC.key === key) return EVC;
      const list = [];
      const add = (t, kind, tone, anchor, title, text) => list.push({ t, kind, tone, anchor, title, text });
      let qDone = false, fDone = false, xDone = false, flatDone = false, pedDone = false, sawN = 0;
      for (let i = 1; i < R.length; i++) {
        const d = R[i], p = R[i - 1], P1 = d.Pnbi + d.Pecrh, P0 = p.Pnbi + p.Pecrh;
        if (P1 - P0 > 5) add(i, "heat", "event", d.Pnbi > 1 ? "nbi" : "ecrh", P0 < 1 ? "Heating on" : "More heating", `${P0.toFixed(0)} → ${P1.toFixed(0)} MW: NBI ${d.Pnbi.toFixed(0)}, ECRH ${d.Pecrh.toFixed(0)}`);
        else if (P0 - P1 > 5) add(i, "cut", "warn", "edge", P1 < 1 ? "Heating off" : "Heating cut", `${P0.toFixed(0)} → ${P1.toFixed(0)} MW`);
        if (!qDone && d.qmin < 1) {
          qDone = true;
          add(i, "q1", "warn", "q1", "q_min < 1", "a q = 1 surface appears: sawteeth in a real machine, and the reward's q_min term shrinks");
        }
        if (!fDone && d.fgw > 1 && !PHYS()) {
          fDone = true;
          add(i, "fgw", "bad", "edge", "Greenwald limit crossed", `f_GW ${d.fgw.toFixed(2)} > 1: a disruption risk the benchmark does not check`);
        }
        if (PHYS()) {
          if (d.mode === 2 && p.mode !== 2) add(i, "lh", "event", "edge", "L-H transition", `P_heat ${(p.Psol / (p.plhMul * p.PLH)).toFixed(2)} × the threshold: the pedestal forms and the density controller moves to 0.85 n_G`);
          if (d.mode === 3 && p.mode !== 3) add(i, "hl", "bad", "edge", "Back to L-mode", "P_heat fell below 0.8 × the threshold: the pedestal collapses");
        } else if (S.as.pedMode === "scheduled") {
          if (!pedDone && d.hped > 0.5) {
            pedDone = true;
            add(i, "ped", "event", "edge", "Pedestal on schedule", "Gym-TORAX raises it at its onset time, whatever the plasma does");
          }
        } else {
          if (d.hped > 0.5 && p.hped <= 0.5) add(i, "lh", "event", "edge", "Pedestal up", "P_SOL crossed P_LH (power-triggered)");
          if (d.hped < 0.5 && p.hped >= 0.5) add(i, "hl", "bad", "edge", "Pedestal lost", "P_SOL fell below 0.8 × P_LH");
        }
        if (!PHYS() && !xDone && d.Te0 > 10 && d.Ti0 > 10 && d.psolPlh < 1 && d.hped > 0.5) {
          xDone = true;
          add(i, "exploit", "bad", "edge", "Paid as H-mode below the threshold", `P_SOL is ${d.psolPlh.toFixed(2)} × P_LH, but the benchmark only checks core temperatures`);
        }
        if (!flatDone && i > 3 && Math.abs(d.Ip - p.Ip) < 0.004 && p.Ip - R[i - 2].Ip > 0.02) {
          flatDone = true;
          add(i, "flat", "event", "core", `Flat-top at ${d.Ip.toFixed(1)} MA`, "the current stops rising");
        }
        if (S.as.sawtooth && d.crashes > p.crashes && sawN++ < 2) add(i, "saw", "event", "q1", "Sawtooth crash", "the core inside q = 1 flattens in an instant");
      }
      let end = null;
      if (PHYS()) {
        const sc0 = M.scoreEpisode(R.slice(1), M.REWARD_PRESETS.physics);
        if (sc0.endT) {
          end = { t: sc0.endT, why: sc0.why.replace(/ at t = \d+ s$/, "") };
          add(sc0.endT, "end", "bad", /^l_i/.test(sc0.why) ? "core" : "edge", "Episode over", end.why + ": the physics environment stops here");
        }
      }
      list.sort((a, b) => a.t - b.t);
      EVC = { key, list, end };
      return EVC;
    }
    const TONE_COLOR = { event: "#2a78d6", warn: "#c98500", bad: "#e34948", ok: "#1baf7a", idle: "#8a84a8" };
    // the scrubber's ticks: heating orange, H-mode green, q_min < 1 amber, limits and losses red, the rest grey
    const TICK_COLOR = { heat: "#eb6834", cut: "#eb6834", lh: "#1baf7a", ped: "#1baf7a", q1: "#eda100", fgw: "#e34948", hl: "#e34948", exploit: "#e34948", end: "#e34948", flat: "#8a84a8", saw: "#8a84a8" };
    function statusAt(d) {
      // the chip over the plasma: phase of the shot and confinement as the reward sees it
      const end = PHYS() && physEnd();
      if (end && d.t >= end.t) return { text: `EPISODE OVER · ${end.why.split(" ")[0] === "Greenwald" ? "Greenwald limit" : "inductance window"}`, color: "#e34948" };
      const phase = d.t === 0 ? "START" : d.t <= 100 ? "RAMP-UP" : "FLAT-TOP";
      if (PHYS()) {
        const st = d.mode === 1 ? (physPaid(d) ? ["H-mode, paid", "#1baf7a"] : ["H-mode, below the 1.2× margin", "#c98500"]) : d.mode === 2 ? ["L-H transition", "#c98500"] : d.mode === 3 ? ["back to L-mode", "#e34948"] : ["L-mode", "#6b6390"];
        return { text: `${phase} · ${st[0]}`, color: st[1] };
      }
      const gated = d.Te0 > 10 && d.Ti0 > 10;
      const st = gated ? (d.psolPlh >= 1 ? ["paid as H-mode", "#1baf7a"] : ["paid as H-mode, P_SOL < P_LH", "#e34948"]) : d.hped > 0.5 ? ["pedestal up", "#c98500"] : ["L-mode", "#6b6390"];
      return { text: `${phase} · ${st[0]}`, color: st[1] };
    }
    // chip fills dark enough for white 11 px text (≥ 4.5:1)
    const CHIP_FILL = { "#1baf7a": "#11845b", "#c98500": "#9a6500", "#e34948": "#c72f2e" };
    const chipFill = (c) => CHIP_FILL[c] || c;
    let hudKey = "";
    function drawHud() {
      const d = S.recs[S.cursor] || S.recs[0];
      if (!d) return;
      const st = statusAt(d);
      const who = S.mode === "drive" || S.kind === "sandbox" ? "you drive" : S.ctrl === "open" ? "schedule" : S.live ? "live on the Lab" : "recorded on TORAX";
      // what differs from the calibrated plasma and the trained controller, as amber tags
      const tags = PARAMS.filter((q) => (!q.scen || q.scen === S.scen) && Math.abs(S.as[q.k] - defOf(q)) > 1e-9).map((q) => `${q.label} ${q.f(S.as[q.k])}`);
      if (S.as.pedMode !== pedMode0()) tags.unshift("pedestal: power-triggered");
      if (S.as.sawtooth) tags.unshift("sawtooth model on");
      if (S.live && tuneModified()) tags.push("controller retuned");
      // limits, at a glance next to the chip (ISA-101: abnormal states visible without reading)
      const alarms = [];
      if (d.fgw > 1) alarms.push(["bad", `f_GW ${d.fgw.toFixed(2)} > 1`]);
      if (d.qmin < 1) alarms.push(["warn", `q_min ${d.qmin.toFixed(2)} < 1`]);
      if (PHYS() && d.t <= 100 && (d.li < 0.65 || d.li > 1.2)) alarms.push(["bad", `l_i ${d.li.toFixed(2)} outside 0.65–1.2`]);
      const key = `${st.text}|${S.label}|${who}|${d.t}|${S.scen}|${tags.join(",")}|${alarms.map((a) => a[1]).join(",")}`;
      if (key === hudKey) return;
      hudKey = key;
      hudAlarm.innerHTML = alarms.map(([k, t]) => `<span class="${k}">${t}</span>`).join("");
      hudTags.innerHTML = tags.map((t) => `<span>⚙ ${t}</span>`).join("") + (tags.length ? `<button type="button" class="lab-hud-reset">reset</button>` : "");
      hudChip.textContent = st.text;
      hudChip.style.background = chipFill(st.color);
      hudText.innerHTML = `<b>${S.label}</b> <span>· ${who} · ${PHYS() ? "physics environment" : "benchmark"}</span><br>` +
        `<span>t = ${d.t} s · I_p ${d.Ip.toFixed(2)} MA · T_e(0) ${d.Te0.toFixed(1)} keV · q_min ${d.qmin.toFixed(2)} · Q ${d.Q < 100 ? d.Q.toFixed(2) : d.Q.toFixed(0)}</span>`;
    }
    function narrate(i) {
      const R = S.recs, d = R[i];
      if (!d) return ["idle", ""];
      const p = R[Math.max(0, i - 1)], dIp = d.Ip - p.Ip, Ph = d.Pnbi + d.Pecrh;
      const you = S.mode === "drive" || S.kind === "sandbox";
      const who = you ? "you" : S.ctrl === "open" ? "the schedule" : S.live ? "the controller, live on the Lab," : "the controller, as recorded on TORAX,";
      const ramp = dIp > 0.004 ? `raising I_p by ${dIp.toFixed(2)} MA/s${dIp > 0.198 ? " (the rate limit)" : ""}` : dIp < -0.004 ? `lowering I_p by ${(-dIp).toFixed(2)} MA/s` : `holding I_p at ${d.Ip.toFixed(1)} MA`;
      const act = i > 0 ? ` ${who[0].toUpperCase() + who.slice(1)} ${you ? "are" : "is"} ${ramp}, with ${Ph > 0.5 ? Ph.toFixed(0) + " MW of heating" : "no heating"}.` : "";
      const end = PHYS() ? physEnd() : null;
      if (end && i > end.t) return ["bad", `<b>The physics environment ended this episode at ${end.t} s</b> (${end.why}). From there on you see the Lab carrying on, for reference.`];
      if (i === 0 && you && S.mode === "drive")
        return ["idle", `t = 0: a ${d.Ip.toFixed(0)} MA ohmic plasma. <b>You drive</b>: set the I_p ramp, NBI and ECRH in ${SIDE()}, then press <b>${phoneUI() ? "▶" : "Run"}</b>${TOUCH ? "" : " (space)"} or <b>Step 1 s</b>. Each second earns the reward of that step.`];
      if (i === 0) return ["idle", `t = 0: a ${d.Ip.toFixed(0)} MA ohmic plasma, T_e(0) ${d.Te0.toFixed(1)} keV, q_min ${d.qmin.toFixed(1)}. Press <b>${phoneUI() ? "▶" : "Play"}</b>${TOUCH ? "" : " (space)"} to run the ${HOR()} s ramp-up, or ${TOUCH ? "tap the time line" : "drag the time"}.`];
      const ev = eventsOf().list.filter((e) => e.t <= i && i < e.t + 4).pop();
      if (ev) return [ev.tone, `<b>${ev.title}</b>${ev.t < i ? ` (${i - ev.t} s ago)` : ""}: ${ev.text}.${act}`];
      let tone = "ok", msg;
      if (PHYS()) {
        const r = d.Psol / (d.plhMul * d.PLH);
        if (d.mode === 1) [tone, msg] = physPaid(d) ? ["ok", `H-mode, paid: P_heat ${r.toFixed(2)} × the threshold (at least 1.2 needed). Q ${d.Q.toFixed(1)}, H98 ${d.H98.toFixed(2)}.`] : ["warn", `H-mode, but P_heat is only ${r.toFixed(2)} × the threshold: below the 1.2 × margin, so the H-mode terms are not paid.`];
        else if (Ph > 1) [tone, msg] = ["warn", `Still L-mode: P_heat is ${r.toFixed(2)} × the threshold (true threshold ${d.plhMul.toFixed(2)} × the Martin scaling). The pedestal needs P_heat above it.`];
      } else {
        const gated = d.Te0 > 10 && d.Ti0 > 10;
        if (gated && d.psolPlh < 1) [tone, msg] = ["bad", `Paid as H-mode with P_SOL only ${d.psolPlh.toFixed(2)} × P_LH: the benchmark checks core temperatures, not the threshold. The audited reward pays nothing here.`];
        else if (gated) msg = `Paid as H-mode: core above 10 keV and P_SOL ${d.psolPlh.toFixed(2)} × P_LH. Q ${d.Q.toFixed(1)}, H98 ${d.H98.toFixed(2)}.`;
        else if (d.t > 100 || Ph > 1) [tone, msg] = ["warn", `Not paid as H-mode: the reward needs T_e(0) and T_i(0) above 10 keV (now ${d.Te0.toFixed(1)} and ${d.Ti0.toFixed(1)}).`];
      }
      if (!msg) msg = `Ramp-up: the current soaks in from the edge; j(0) ${d.j0.toFixed(2)} MA/m², q_min ${d.qmin.toFixed(2)}${d.qmin < 1 ? " (below 1)" : ""}.`;
      else if (d.qmin < 1) msg += ` q_min ${d.qmin.toFixed(2)} < 1.`;
      if (d.qmin < 1 && tone === "ok") tone = "warn";
      if (d.fgw > 1 && !PHYS()) {
        msg += ` f_GW ${d.fgw.toFixed(2)}: above the Greenwald limit.`;
        tone = tone === "bad" ? "bad" : "warn";
      }
      return [tone, msg + act];
    }
    let narrKey = "";
    function drawNarration() {
      if (!layers.narration) return;
      const [tone, msg] = narrate(S.cursor);
      const key = tone + msg;
      if (key === narrKey) return;
      narrKey = key;
      narr.innerHTML = `<i class="lab-dot" style="background:${TONE_COLOR[tone]}"></i><span>${msg}</span>`;
      if (phoneUI()) requestAnimationFrame(() => { const sp = narr.querySelector("span"); narr.classList.toggle("more", !!sp && sp.scrollHeight > sp.clientHeight + 1); });
    }
    // the callouts at the cursor: events of the last eight seconds, the latest two
    function calloutsAt(i) {
      if (!layers.callouts) return [];
      return eventsOf().list.filter((e) => e.t <= i && i < e.t + 8).slice(-2)
        .map((e) => ({ anchor: e.anchor, title: `${e.title} · ${e.t} s`, text: e.text, color: TONE_COLOR[e.tone], alpha: i - e.t > 5 ? 0.55 : 1 }));
    }
    let flashT = -1e9, lastCur = 0;
    function noteCrossing() {
      // during playback, crossing a bad event flashes the plasma view red
      if (S.playing || S.running) for (const e of eventsOf().list) if (e.tone === "bad" && lastCur < e.t && S.cursor >= e.t) flashT = performance.now();
      lastCur = S.cursor;
    }

    // ---- heating at human scale
    function drawHeatStrip() {
      if (!layers.heatstrip || !pT.open) return;
      const d = S.recs[S.cursor] || S.recs[0];
      const col = colors(), { ctx, w, h } = hsv;
      ctx.clearRect(0, 0, w, h);
      const tnow = REDUCED_MOTION ? 0.4 : performance.now() / 1000;
      const narrow = w < 440;
      const x0 = narrow ? 92 : Math.min(150, w * 0.3), x1 = narrow ? w - 6 : w - Math.min(190, w * 0.32), lane = 24, top = 4;
      const ec = d ? d.Pecrh : 0, nb = d ? d.Pnbi : 0;
      const lam0 = 64, vpx = 70; // ECRH drawn wavelength [px] and the speed of light on screen [px/s]
      const lamOf = (f) => lam0 * Math.pow(f / HEAT.ecrh.f, -0.25);
      const rows = [
        { lab: "ECRH", val: `${ec.toFixed(1)} MW`, on: ec > 0.05, pn: ec / 20, rgb: EC_RGB, f: HEAT.ecrh.f, right: "170 GHz · λ 1.76 mm" },
        { lab: "NBI", val: `${nb.toFixed(1)} MW`, on: nb > 0.05, pn: nb / 33, rgb: NBI_RGB, atoms: true, right: "1 MeV D atoms · 9,800 km/s" },
        { lab: "beam light", val: "Balmer-α", on: nb > 0.05, pn: (0.3 * nb) / 33, rgb: DA_RGB, f: C_LIGHT / HEAT.dalpha.lam, right: "457 THz · λ 656 nm" },
      ];
      ctx.font = FONT_SMALL;
      ctx.textBaseline = "middle";
      rows.forEach((r, k) => {
        const y = top + lane * k + lane / 2;
        ctx.fillStyle = col.fg;
        ctx.font = "600 " + FONT_SMALL;
        ctx.fillText(narrow ? r.lab.replace("beam light", "Balmer-α") : r.lab, 4, narrow ? y - 5 : y);
        ctx.font = FONT_SMALL;
        ctx.fillStyle = col.muted;
        if (narrow) ctx.fillText(r.on ? (r.atoms || r.f === HEAT.ecrh.f ? r.val : "656 nm") : "off", 4, y + 6);
        else {
          ctx.fillText(r.on ? r.val : "off", 4 + Math.min(70, x0 * 0.48), y);
          ctx.fillText(r.right, x1 + 10, y);
        }
        ctx.strokeStyle = col.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        if (!r.on) return;
        const pn = clamp(r.pn, 0, 1.3), A = 3 + 7 * Math.sqrt(pn), alpha = 0.3 + 0.7 * Math.min(1, pn);
        if (r.atoms) {
          const N = Math.round(8 + 30 * Math.min(1, pn)), span = x1 - x0, v = vpx * 0.33;
          for (let j = 0; j < N; j++) {
            const r1 = Math.sin(j * 12.9898) * 43758.5453, jit = r1 - Math.floor(r1);
            const x = x0 + ((tnow * v + (j * span) / N + jit * 8) % span), yy = y + (jit - 0.5) * 8;
            const g = ctx.createLinearGradient(x - 14, yy, x, yy);
            g.addColorStop(0, rgba(r.rgb, 0));
            g.addColorStop(1, rgba(r.rgb, alpha));
            ctx.strokeStyle = g;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(Math.max(x0, x - 14), yy);
            ctx.lineTo(x, yy);
            ctx.stroke();
            ctx.fillStyle = `rgba(255,236,190,${Math.min(1, alpha + 0.2)})`;
            ctx.beginPath();
            ctx.arc(x, yy, 2.3, 0, 2 * Math.PI);
            ctx.fill();
          }
          return;
        }
        const lam = lamOf(r.f), kk = (2 * Math.PI) / lam, om = (2 * Math.PI * vpx) / lam;
        ctx.strokeStyle = rgba(r.rgb, alpha * 0.25);
        ctx.lineWidth = 2 * A + 4;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.strokeStyle = rgba(r.rgb, alpha);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 1) {
          const yy = y - A * Math.sin(kk * (x - x0) - om * tnow);
          x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        }
        ctx.stroke();
      });
      // the spectrum: one log scale of frequency, the bands in the colours used above
      const sy = top + lane * 3 + 8, f0 = 8, f1 = 16, X = (lf) => x0 + ((lf - f0) / (f1 - f0)) * (x1 - x0);
      for (let x = x0; x < x1; x++) {
        ctx.fillStyle = rgba(specRGB(f0 + ((f1 - f0) * (x - x0)) / (x1 - x0)), 0.9);
        ctx.fillRect(x, sy, 1.2, 6);
      }
      ctx.fillStyle = col.muted;
      ctx.fillText("frequency", 4, narrow ? sy + 10 : sy + 3);
      ctx.textAlign = "center";
      [[9, "1 GHz"], [12, "1 THz"], [15, "1 PHz"]].forEach(([lf, t]) => ctx.fillText(t, X(lf), sy + 15));
      ctx.fillText("visible", X(14.74), sy - 6);
      ctx.textAlign = "left";
      for (const [lf, rgb, on] of [[Math.log10(HEAT.ecrh.f), EC_RGB, ec > 0.05], [Math.log10(C_LIGHT / HEAT.dalpha.lam), DA_RGB, nb > 0.05]]) {
        ctx.fillStyle = rgba(rgb, on ? 1 : 0.35);
        ctx.beginPath();
        ctx.moveTo(X(lf), sy - 1);
        ctx.lineTo(X(lf) - 4, sy - 7);
        ctx.lineTo(X(lf) + 4, sy - 7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.textBaseline = "alphabetic";
    }

    // ------------------------------------------------ simulation
    function overrides() {
      const o = { ...(PHYS() ? M.PHYSICS : {}), pedMode: S.as.pedMode, sawtooth: S.as.sawtooth };
      for (const p of PARAMS) Object.assign(o, p.map ? p.map(S.as[p.k]) : { [p.k]: S.as[p.k] });
      return o;
    }
    function makeCtrl(key) {
      const p = presetOf(key);
      if (!RC || !p || !p.live) return null;
      if (p.live === "pi") return RC.piController(S.tune, PHYS() ? RC.PHYSICS_PI : RC.PAPER_PI);
      return POLICY[key] ? RC.learnedController(POLICY[key], S.tune) : null;
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
        for (let t = 0; t < HOR(); t++) {
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
      S.recsVersion = (S.recsVersion || 0) + 1;
      S.cursor = Math.min(S.cursor, recs.length - 1);
      S.dirty = true;
    }
    // What a recorded controller saw and proposed, where the recording allows it: PI's error and integral
    // (re-computed from TORAX's j(0), which is exactly what it read), residual agents' PI proposal and correction.
    function recordedKnobInfo(key, e) {
      if (!e || !RC) return [];
      if (isPI(key)) {
        const g = key === "phys_pi" ? RC.PHYSICS_PI : RC.PAPER_PI;
        const pi = RC.makePI(g.kp, g.ki, 1e3, RC.IP_MAX, g.j_end), j0 = [null, ...e.torax.j0];
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
    function presetVisibility() {
      for (const k in presetBtns) {
        const p = presetOf(k);
        presetBtns[k].hidden = (p.scen !== "both" && p.scen !== S.scen) || (p.kind === "torax" && !LAB[k]);
      }
    }
    function setScenario(sc, noLoad) {
      S.scen = sc;
      for (const k in scenBtns) scenBtns[k].classList.toggle("on", k === sc);
      presetVisibility();
      fillMore();
      Object.assign(S.tune, tune0());
      tKp.set(1);
      tKi.set(1);
      tJ.set(S.tune.jEnd / 1e6);
      tCorr.set(1);
      S.rewSlot = 0;
      SLOTS().forEach(([, lab], i) => {
        rewBtns[i].textContent = lab;
        rewBtns[i].classList.toggle("on", i === 0);
      });
      S.pins = [];
      resetParams(true);
      applyScenarioUI();
      if (!noLoad) load(S.key === "sandbox" ? "sandbox" : sc === "physics" ? "phys_pi" : "pi");
      else if (isFull()) (fsSync(), mSync());
    }
    function load(key) {
      const p = presetOf(key);
      if (p.scen !== "both" && p.scen !== S.scen) setScenario(p.scen, true); // a preset carries its scenario
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
      if (isFull()) (fsSync(), mSync());
      else if (story.hidden && tools.story) tools.story.classList.add("news");
      if (root.classList.contains("lab-small")) applyMode();
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
      if (S.recs.length - 1 >= HOR()) {
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
      const [, rLab, rCfg] = SLOTS()[0];
      const r = M.rewardTerms(d, rCfg);
      stepInfo.innerHTML = `Last step: a = (ΔI_p ${S.drive.rate >= 0 ? "+" : ""}${S.drive.rate.toFixed(2)} MA, NBI ${S.drive.nbi.toFixed(1)} MW, ECRH ${S.drive.ecrh.toFixed(1)} MW) → r = <b>${r.total.toFixed(4)}</b> (${rLab})` + (S.recs.length - 1 >= HOR() ? ` · <b>episode over</b> (${HOR()} steps)` : "");
      if (d.failed || S.recs.length - 1 >= HOR()) {
        S.running = false;
        runBtn.textContent = "Run";
      }
      S.dirty = true;
    }
    // pin colours: none of them the current run's pink
    const PIN_COLORS = ["#8f7fe0", "#9aa0a6", "#b08d57"];
    function pinRun() {
      // the label says what differs from the calibrated plasma and the trained controller
      const diffs = PARAMS.filter((q) => (!q.scen || q.scen === S.scen) && Math.abs(S.as[q.k] - defOf(q)) > 1e-9).map((q) => `${q.label} ${q.f(S.as[q.k])}`);
      if (S.as.pedMode !== pedMode0()) diffs.unshift("pedestal power-triggered");
      if (S.as.sawtooth) diffs.unshift("sawteeth");
      const tags = [S.live ? "live" : "", S.live && tuneModified() ? "retuned" : "", ...diffs].filter(Boolean);
      const label = S.label + (tags.length ? ` (${tags.join(", ")})` : "");
      const key = `${S.recsVersion}|${S.recs.length}|${label}`;
      if (S.pins.some((p) => p.key === key)) return toast("This run is already pinned");
      let note = "";
      if (S.pins.length >= 3) note = `; pin 1 (${S.pins.shift().label}) was replaced`;
      S.pins.push({ label, key, recs: S.recs.slice() });
      S.pins.forEach((p, i) => (p.color = PIN_COLORS[i]));
      toast(`Pinned: ${label}${note}`);
      S.dirty = true;
    }
    function clearPins() {
      if (!S.pins.length) return;
      const kept = S.pins.slice();
      S.pins = [];
      S.dirty = true;
      toast(`${kept.length} pin${kept.length > 1 ? "s" : ""} cleared`, "Undo", () => ((S.pins = kept), (S.dirty = true)));
    }

    // ------------------------------------------------ drawing
    const ghostAt = (k, t) => (S.torax && S.torax.torax[k] && t >= 1 ? S.torax.torax[k][t - 1] : null);
    function scores(recs) {
      const rs = recs.slice(1), o = {};
      for (const [k, , cfg] of SLOTS()) o[k] = M.scoreEpisode(rs, cfg || S.custom);
      return o;
    }
    function drawTorus(target, at, o) {
      o = o || {};
      const d = S.recs[at === undefined ? S.cursor : at] || S.recs[0];
      const val = S.colorBy === "Te" ? d.prof.Te : S.colorBy === "j" ? d.prof.j : d.prof.q;
      const crashRecent = d.crashes && S.cursor > 0 && S.recs[S.cursor - 1] && d.crashes > S.recs[S.cursor - 1].crashes;
      const gated = d.Te0 > 10 && d.Ti0 > 10;
      const end = PHYS() && physEnd();
      const alarm = (end && d.t >= end.t) || (!PHYS() && d.fgw > 1) ? 1 : !PHYS() && gated && d.psolPlh < 1 ? 0.6 : 0;
      (target || torus).draw({
        q: d.prof.q, val, colorBy: S.colorBy, nbi: d.Pnbi, ecrh: d.Pecrh, ecrhLoc: d.ecrhLoc, Ip: d.Ip, coils: S.coils, flux: d.flux,
        prof: d.prof, ne20: d.nbar, labels: o.labels === undefined ? layers.labels : o.labels, lines: layers.lines, beams: layers.beams,
        flash: crashRecent ? 1 : 0, alarm, redFlash: o.preview ? 0 : clamp(1 - (performance.now() - flashT) / 900, 0, 1),
        callouts: o.preview ? [] : calloutsAt(S.cursor),
      });
    }
    // ---- the quantities of the numbers panel: label, unit, how to read them from a record and from TORAX
    //   g: TORAX trace (lab.json) or a function of the traces and the index; ref: reference lines in plots
    const QTY = () => [
      { k: "t", lab: "t", unit: "s", n: 0, noma: true, noplot: true },
      { k: "Ip", lab: "I_p", unit: "MA", n: 2, g: "Ip" },
      { k: "Paux", lab: "P_NBI + P_ECRH", short: "heating", unit: "MW", n: 1, get: (d) => d.Pnbi + d.Pecrh, g: (T, i) => (T.Pnbi[i] || 0) + (T.Pecrh[i] || 0) },
      { k: "Te0", lab: "T_e(0)", unit: "keV", n: 1, g: "Te0", eq: "heat" },
      { k: "Ti0", lab: "T_i(0)", unit: "keV", n: 1, g: "Ti0", eq: "heat" },
      { k: "j0", lab: "j(0)", unit: "MA/m²", n: 2, g: "j0", eq: "diffusion" },
      { k: "qmin", lab: "q_min", n: 2, g: "qmin", eq: "q", ref: [[1, "1"]] },
      { k: "q95", lab: "q95", n: 2, g: "q95", eq: "q", ref: [[3, "3"]] },
      { k: "Q", lab: "Q", n: 2, g: "Q", eq: "fusion", log: true, ratio: (d) => [d.Pfus, d.Paux + d.Pohm] },
      { k: "H98", lab: "H98", n: 2, g: "H98", eq: "ipb98", ref: [[1, "1"]] },
      { k: "fgw", lab: "f_GW", n: 2, g: "fgw", eq: "greenwald", ref: [[1, "limit"]] },
      { k: "psolPlh", lab: PHYS() ? "P_heat / P_LH" : "P_SOL / P_LH", short: PHYS() ? "P_heat/P_LH" : "P_SOL/P_LH", n: 2, g: "psolPlh", eq: "plh", ref: PHYS() ? [[1.2 * (S.as.plhMul || 1), "paid"]] : [[1, "1"]] },
      ...(PHYS() ? [{ k: "li", lab: "l_i(3)", n: 2, g: "li", ref: [[0.65, "0.65"], [1.2, "1.2"]] }, { k: "plhMul", lab: "true threshold ÷ scaling", n: 2, noma: true, noplot: true, eq: "plh" }] : []),
      { k: "betaN", lab: "β_N", n: 2, g: "betaN", eq: "betaN" },
      { k: "Pfus", lab: "P_fus", unit: "MW", n: 0, eq: "fusion" },
      { k: "Ibs", lab: "I_bootstrap", short: "I_bs", unit: "MA", n: 2, eq: "bootstrap" },
      { k: "Vloop", lab: "V_loop", unit: "V", n: 2, eq: "flux" },
      { k: "flux", lab: "resistive flux", short: "flux", unit: "Wb", n: 0, eq: "flux", noma: true },
      { k: "Tped", lab: "pedestal T", unit: "keV", n: 2, eq: "pedestal" },
    ];
    const MA_WIN = [5, 20, 60]; // trailing averages [s]
    const qGet = (q, d) => (q.get ? q.get(d) : d[q.k]);
    const qTorax = (q, t) => {
      if (!S.torax || !q.g || t < 1) return null;
      const T = S.torax.torax, i = t - 1;
      const v = typeof q.g === "function" ? q.g(T, i) : T[q.g] && T[q.g][i];
      return v === undefined || v === null || !isFinite(v) ? null : v;
    };
    const qFmt = (q, v, less) => {
      if (v === null || v === undefined || !isFinite(v)) return "–";
      const n = Math.abs(v) >= 100 ? 0 : Math.max(0, q.n - (less && Math.abs(v) >= 1 ? 1 : 0));
      return (+v.toFixed(n) === 0 ? 0 : v).toFixed(n); // no "-0.00"
    };
    // running sums of every quantity over the run, for the trailing averages
    let MAC = { key: "", sums: {} };
    function maAt(q, i, win) {
      const key = `${S.recsVersion}|${S.recs.length}|${S.scen}`;
      if (MAC.key !== key) MAC = { key, sums: {} };
      let c = MAC.sums[q.k];
      if (!c) {
        // running sums (of the numerator and denominator for a ratio such as Q)
        c = [[], []];
        let a = 0, b = 0;
        S.recs.forEach((d, j) => {
          const [x, y] = q.ratio ? q.ratio(d) : [qGet(q, d), 1];
          c[0][j] = a += x;
          c[1][j] = b += y;
        });
        MAC.sums[q.k] = c;
      }
      const j0 = Math.max(0, i - win + 1), at = (k) => c[k][i] - (j0 > 0 ? c[k][j0 - 1] : 0);
      return at(0) / at(1);
    }
    // ---- numbers view: built once per scenario, updated in place (so hover and focus survive playback)
    let roKey = "", roCells = {};
    function buildReadout() {
      roCells = {};
      readout.innerHTML = "";
      for (const q of QTY()) {
        const c = el("div", "lab-ro");
        c.dataset.k = q.k;
        c.tabIndex = 0;
        const lab = el("span", "ro-l", q.eq ? `<a href="${eqLink(q.eq)}">${q.lab}</a>` : q.lab);
        const val = el("span", "ro-v");
        const v = el("b", ""), u = el("em", "", q.unit || ""), tr = el("span", "ro-tr");
        val.append(v, u, tr);
        const ma = el("span", "ro-ma");
        const mas = MA_WIN.map((w) => {
          const x = el("span", "");
          ma.append(el("i", "", `${w}s`), x);
          return x;
        });
        const tor = el("span", "ro-tor");
        c.append(lab, val);
        if (!q.noma) c.append(ma);
        c.append(tor);
        readout.appendChild(c);
        roCells[q.k] = { q, v, tr, mas, tor };
      }
    }
    function drawReadout() {
      const key = `${S.scen}|${QTY().length}`;
      if (key !== roKey) {
        roKey = key;
        buildReadout();
      }
      const i = Math.min(S.cursor, S.recs.length - 1), d = S.recs[i] || S.recs[0];
      for (const { q, v, tr, mas, tor } of Object.values(roCells)) {
        const x = qGet(q, d);
        v.textContent = qFmt(q, x);
        if (!q.noma) {
          const m = MA_WIN.map((w) => maAt(q, i, w));
          m.forEach((y, j) => {
            mas[j].textContent = qFmt(q, y, true); // one digit less in the small print
            const part = i + 1 < MA_WIN[j]; // the window has not filled yet: an average over the first i + 1 s
            mas[j].classList.toggle("part", part);
            mas[j].title = part ? `average over the first ${i + 1} s (the ${MA_WIN[j]} s window has not filled yet)` : `average over the last ${MA_WIN[j]} s`;
          });
          // the trend over the last few seconds, against the 5 s average
          const dv = x - m[0], tol = 0.015 * Math.max(Math.abs(m[0]), 1e-6);
          tr.textContent = i < 2 || Math.abs(dv) <= tol ? "" : dv > 0 ? "▲" : "▼";
        }
        const g = qTorax(q, d.t);
        tor.textContent = g === null ? "" : `TORAX ${qFmt(q, g)}`;
      }
      numKey.dataset.view = numView;
      numKey.innerHTML = numView === "plots"
        ? `<span><i class="k-run"></i>this run</span>${S.torax ? `<span><i class="k-tor"></i>TORAX</span>` : ""}${S.pins.map((p, j) => `<span title="${p.label}"><i style="background:${p.color}"></i>pin ${j + 1}</span>`).join("")}<span><i class="k-ref"></i>limit or reference</span><span class="k-hint">${TOUCH ? "tap or drag to move the time" : "click or drag to move the time; hover for values"}</span>`
        : `<span><b>big</b>: the value at t = ${d.t} s</span><span><b>5s 20s 60s</b>: trailing averages</span>${S.torax ? `<span><b>TORAX</b>: its value at the same time</span>` : ""}<span class="k-hint">${TOUCH ? "tap" : "hover"} a number for its history</span>`;
      if (numView === "plots") drawNumPlots();
    }

    // ---- one quantity through the episode: this run (solid, dimmed after the cursor), TORAX (dashed), the pins
    function histSeries(q) {
      const run = S.recs.map((d) => [d.t, qGet(q, d)]);
      const out = [];
      S.pins.forEach((p, j) => out.push({ pts: p.recs.map((d) => [d.t, qGet(q, d)]), color: p.color, width: 1.4, label: `pin ${j + 1}` }));
      if (S.torax && q.g) {
        const tor = [];
        for (let t = 1; t <= S.torax.torax.Ip.length; t++) tor.push([t, qTorax(q, t)]);
        out.push({ pts: tor, color: colors().muted, width: 1.3, dash: [4, 3], label: "TORAX" });
      }
      out.push({ pts: run, color: colors().accent, width: 2, run: true, label: "this run" });
      return out;
    }
    function plotHist(ctx, col, box, q, o) {
      const series = histSeries(q), cur = S.cursor, T = HOR();
      let lo = Infinity, hi = -Infinity;
      for (const sr of series) for (const [, v] of sr.pts) if (v !== null && isFinite(v) && (!q.log || v > 0)) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
      for (const [v] of q.ref || []) if (!q.log || v > 0) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
      if (!isFinite(lo)) (lo = 0), (hi = 1);
      if (q.log) {
        hi = Math.max(hi, 0.1);
        lo = Math.max(Math.min(lo, hi / 10), hi / 1e4, 1e-3);
      } else {
        const pad = (hi - lo) * 0.08 || Math.max(Math.abs(hi) * 0.1, 0.05);
        lo -= pad;
        hi += pad;
        if (lo < 0 && Math.min(...series.flatMap((sr) => sr.pts.map(([, v]) => (v === null ? Infinity : v)))) >= 0) lo = 0;
      }
      // two or three ticks: small plots stay legible
      let yt;
      if (q.log) {
        const e0 = Math.ceil(Math.log10(lo)), e1 = Math.floor(Math.log10(hi)), n = e1 - e0;
        yt = (n <= 2 ? Array.from({ length: n + 1 }, (_, j) => e0 + j) : [e0, Math.round((e0 + e1) / 2), e1]).map((e) => Math.pow(10, e));
      } else yt = [lo + (hi - lo) * 0.08, hi - (hi - lo) * 0.08].map((v) => +v.toPrecision(2));
      const fr = frame(ctx, col, box, [0, T], [lo, hi], { logy: q.log, yticks: o.yticks === false ? [] : yt, xticks: [0, 50, 100, 150].filter((v) => v <= T), noXLabels: !o.xlabels, xlabel: o.xlabels && o.xtitle ? "t [s]" : "" });
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
      ctx.clip();
      for (const [v, lab] of q.ref || []) {
        const y = fr.sy(v);
        ctx.strokeStyle = col.bad;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(box.x + box.w, y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (o.reflabels) {
          ctx.fillStyle = col.bad;
          ctx.font = FONT_SMALL;
          ctx.textAlign = "right";
          ctx.textBaseline = "bottom";
          ctx.fillText(lab, box.x + box.w - 2, y - 1);
        }
        ctx.globalAlpha = 1;
      }
      const P = (pts) => pts.map(([t, v]) => [fr.sx(t), v === null || (q.log && v <= 0) ? NaN : fr.sy(v)]);
      for (const sr of series) {
        const before = sr.pts.filter(([t]) => t <= cur), after = sr.pts.filter(([t]) => t >= cur);
        ctx.globalAlpha = 1;
        line(ctx, P(before), sr.color, sr.width, sr.dash);
        ctx.globalAlpha = sr.run ? 0.28 : 0.22;
        line(ctx, P(after), sr.color, sr.width, sr.dash);
        ctx.globalAlpha = 1;
      }
      // the cursor, and a hovered time
      const xc = fr.sx(cur);
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xc, box.y);
      ctx.lineTo(xc, box.y + box.h);
      ctx.stroke();
      const dv = S.recs[Math.min(cur, S.recs.length - 1)];
      if (dv) {
        const yv = qGet(q, dv);
        if (isFinite(yv) && (!q.log || yv > 0)) {
          ctx.fillStyle = col.accent;
          ctx.beginPath();
          ctx.arc(xc, fr.sy(yv), 2.8, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      if (o.hoverT !== null && o.hoverT !== undefined) {
        ctx.strokeStyle = col.fg;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(fr.sx(o.hoverT), box.y);
        ctx.lineTo(fr.sx(o.hoverT), box.y + box.h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      return { fr, series };
    }

    // ---- plots view: small multiples, one per quantity, a shared time axis along the bottom row
    let numView = store.get("numview", "numbers"), nvHover = null, nvLayout = null;
    function setNumView(v) {
      numView = v;
      store.set("numview", v);
      for (const k in numBtns) {
        numBtns[k].classList.toggle("on", k === v);
        numBtns[k].setAttribute("aria-selected", String(k === v));
      }
      readout.hidden = v !== "numbers";
      nvBox.hidden = v !== "plots";
      hidePop();
      if (v === "plots") nv.fit();
      S.dirty = true;
    }
    function drawNumPlots() {
      const qs = QTY().filter((q) => !q.noplot);
      const W = nvBox.clientWidth || nv.w;
      const cols = W >= 700 ? 4 : W >= 420 ? 3 : 2, rows = Math.ceil(qs.length / cols), cellH = 88, axisH = 30;
      const hNeed = rows * cellH + axisH;
      if (nv.h !== hNeed) {
        nv.h = hNeed;
        nv.fit();
      }
      const col = colors(), { ctx, w } = nv;
      ctx.clearRect(0, 0, w, nv.h);
      const cw = w / cols;
      nvLayout = { cols, cw, cellH, rows, qs, boxes: [] };
      qs.forEach((q, k) => {
        const r = Math.floor(k / cols), c = k % cols;
        const last = r === rows - 1 || k + cols >= qs.length;
        const box = { x: c * cw + 30, y: r * cellH + 20, w: cw - 38, h: cellH - 30 };
        nvLayout.boxes.push(box);
        plotHist(ctx, col, box, q, { xlabels: last, hoverT: nvHover, reflabels: false });
        // title with unit on the left, the value at the cursor (or at the hovered time) on the right
        const t = nvHover !== null ? nvHover : S.cursor, d = S.recs[Math.min(t, S.recs.length - 1)];
        const vs = d ? qFmt(q, qGet(q, d)) : "–";
        ctx.font = "600 " + FONT_SMALL;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "right";
        ctx.fillStyle = col.accent;
        ctx.fillText(vs, (c + 1) * cw - 8, r * cellH + 13);
        const room = cw - 18 - ctx.measureText(vs).width;
        ctx.fillStyle = col.fg;
        ctx.textAlign = "left";
        let title = (ctx.measureText(q.lab).width + 40 > room && q.short ? q.short : q.lab) + (q.unit ? ` [${q.unit}]` : "");
        while (title.length > 4 && ctx.measureText(title).width > room) title = title.slice(0, -2) + "…";
        ctx.fillText(title, c * cw + 4, r * cellH + 13);
      });
      ctx.font = FONT_SMALL;
      ctx.fillStyle = col.muted;
      ctx.textAlign = "right";
      ctx.fillText(nvHover !== null ? `values at t = ${nvHover} s (hover)` : `values at the cursor, t = ${S.cursor} s`, w - 6, nv.h - 3);
      ctx.textAlign = "left";
      ctx.fillText("t [s]", 4, nv.h - 3);
    }
    function nvTime(e) {
      if (!nvLayout) return null;
      const r = nv.c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const k = Math.min(nvLayout.cols - 1, Math.floor(x / nvLayout.cw)) + nvLayout.cols * Math.min(nvLayout.rows - 1, Math.floor(y / nvLayout.cellH));
      const b = nvLayout.boxes[Math.min(k, nvLayout.boxes.length - 1)];
      return clamp(Math.round(((x - b.x) / b.w) * HOR()), 0, S.recs.length - 1);
    }
    let nvDrag = false;
    nv.c.style.cursor = "crosshair";
    nv.c.addEventListener("pointerdown", (e) => {
      nvDrag = true;
      const t = nvTime(e);
      if (t !== null) (S.cursor = t), (S.playing = false), (playBtn.textContent = "Play"), (S.dirty = true);
    });
    nv.c.addEventListener("pointermove", (e) => {
      const t = nvTime(e);
      if (nvDrag && t !== null) (S.cursor = t), (S.playing = false), (playBtn.textContent = "Play");
      nvHover = nvDrag ? null : t;
      S.dirty = true;
    });
    nv.c.addEventListener("pointerleave", () => ((nvHover = null), (S.dirty = true)));
    window.addEventListener("pointerup", () => (nvDrag = false));

    // ---- hover a number: its history up to the cursor, with TORAX and the pins
    // the history popup is shared: number tiles, the side pane's sparklines (anything with a quantity of QTY)
    let popQ = null, popEl = null, popRect = null;
    function showPop(cell) {
      const c = roCells[cell.dataset.k];
      if (!c || c.q.noplot) return hidePop();
      showPopAt(c.q, cell, cell.getBoundingClientRect());
    }
    function showPopAt(q, anchor, cr) {
      popScroll = scrollPos();
      popQ = q;
      popEl = anchor;
      popRect = cr;
      numPop.hidden = false;
      const pr = root.getBoundingClientRect();
      const pw = Math.min(330, pr.width - 16);
      numPop.style.width = pw + "px";
      let left = cr.right - pr.left + 8;
      if (left + pw > pr.width - 4) left = cr.left - pr.left - pw - 8;
      if (left < 4) left = clamp(cr.left - pr.left, 4, pr.width - pw - 4);
      numPop.style.left = left + "px";
      // below the anchor's top if it fits on the screen, otherwise above its bottom
      const pbTop = isFull() && fsMode !== "desk" ? pb.getBoundingClientRect().top : innerHeight;
      const ph = numPop.offsetHeight || 230, top = cr.top + ph > pbTop - 8 ? Math.min(cr.bottom, pbTop - 8) - ph : cr.top - 10;
      numPop.style.top = Math.max(4, top - pr.top) + "px";
      drawPop();
    }
    function hidePop() {
      popQ = null;
      popEl = null;
      numPop.hidden = true;
    }
    function drawPop() {
      if (!popQ || !popEl || !popEl.isConnected || popEl.offsetParent === null) return hidePop();
      const q = popQ, col = colors(), dpr = window.devicePixelRatio || 1;
      const w = Math.max(220, numPop.clientWidth - 16), h = 150;
      if (npCv.width !== Math.round(w * dpr) || npCv.height !== Math.round(h * dpr)) {
        npCv.width = Math.round(w * dpr);
        npCv.height = Math.round(h * dpr);
        npCv.style.width = w + "px";
        npCv.style.height = h + "px";
      }
      const ctx = npCv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { series } = plotHist(ctx, col, { x: 40, y: 8, w: w - 50, h: h - 40 }, q, { xlabels: true, xtitle: true, reflabels: true });
      const d = S.recs[Math.min(S.cursor, S.recs.length - 1)];
      numPop.firstChild.innerHTML = `<b>${q.lab}</b>${q.unit ? ` [${q.unit}]` : " <span>(dimensionless)</span>"} <span>through t = ${d.t} s: ${qFmt(q, qGet(q, d))}${q.unit ? " " + q.unit : ""}${q.note ? `, ${q.note}` : ""}</span>`;
      npKey.innerHTML = series.slice().reverse().map((sr) => {
        const at = sr.pts.find(([t]) => t === d.t), v = at ? at[1] : null;
        return `<span><i style="background:${sr.color}${sr.dash ? ";opacity:.7" : ""}" class="${sr.dash ? "dash" : ""}"></i>${sr.label} <b>${qFmt(q, v)}</b></span>`;
      }).join("");
    }
    const TOUCH = !!(window.matchMedia && window.matchMedia("(hover: none)").matches);
    const phoneUI = () => isFull() && fsMode !== "desk";
    const SIDE = () => (phoneUI() ? "the Controls tab" : "the side pane");
    // touch: a tap (not a swipe) on a tile toggles its history; the label's equation link is not followed (the
    // panel's ∑ equations has them); a mouse opens it on hover
    readout.addEventListener("click", (e) => {
      const cell = e.target.closest(".lab-ro");
      if (!TOUCH || !cell) return;
      e.preventDefault();
      if (popEl === cell) hidePop();
      else showPop(cell);
    });
    readout.addEventListener("pointerover", (e) => {
      if (e.pointerType === "touch") return;
      const cell = e.target.closest(".lab-ro");
      if (cell && cell !== popEl) showPop(cell);
    });
    readout.addEventListener("pointerleave", (e) => e.pointerType !== "touch" && hidePop());
    document.addEventListener("pointerdown", (e) => popQ && !readout.contains(e.target) && e.target !== sv.c && e.target !== bv.c && hidePop()); // a tap elsewhere closes it
    // on touch, scrolling the content closes the history (it would stay where the tile was); a focus nudge of a few
    // pixels (a tapped tile scrolled into view) does not
    const scrollPos = () => window.scrollY + (isFull() ? fsBody.scrollTop : 0);
    let popScroll = 0;
    window.addEventListener("scroll", () => popQ && TOUCH && Math.abs(scrollPos() - popScroll) > 12 && hidePop(), true);
    readout.addEventListener("focusin", (e) => !TOUCH && e.target.closest(".lab-ro") && showPop(e.target.closest(".lab-ro")));
    readout.addEventListener("focusout", hidePop);
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
        { t: "heating [MW]: NBI (orange), ECRH (cyan); dashed: TORAX total", short: "heating [MW]: NBI orange, ECRH cyan", yr: [0, 56], heat: true },
        { t: "core T_e(0) (orange), T_i(0) (blue) [keV]; dashed: TORAX", short: "T_e(0) orange, T_i(0) blue [keV]", yr: [0, 32], s: [["Te0", col.series[1]], ["Ti0", col.series[0]]], g: ["Te0", "Ti0"], hl: [[10, col.bad]] },
        { t: "q_min (green), q95 (blue); red: q = 1, grey: q95 = 3", short: "q_min green, q95 blue", yr: [0, 7], s: [["qmin", col.series[2]], ["q95", col.series[0]]], g: ["qmin", "q95"], hl: [[1, col.bad], [3, col.muted]] },
        { t: "fusion gain Q (log scale); dashed: TORAX", short: "fusion gain Q (log)", yr: [0.01, 1000], log: true, s: [["Q", col.accent]], g: ["Q"] },
        PHYS() ? { t: "f_GW (orange), P_heat/P_LH (green), l_i (amber); red: 1, grey: 1.2", short: "f_GW orange, P_heat/P_LH green, l_i amber", yr: [0, 2.6], s: [["fgw", col.series[1]], ["psolPlh", col.series[2]], ["li", col.series[3]]], g: ["fgw", "psolPlh", "li"], hl: [[1, col.bad], [1.2, col.muted]] }
          : { t: "f_GW (orange), P_SOL/P_LH (green); red: 1", short: "f_GW orange, P_SOL/P_LH green", yr: [0, 2.6], s: [["fgw", col.series[1]], ["psolPlh", col.series[2]]], g: ["fgw", "psolPlh"], hl: [[1, col.bad]] },
        { t: "return: " + SLOTS().map((x, j) => `${x[1]} (${["blue", "green", "pink"][j]})`).join(", ") + (S.torax ? "; dashed: TORAX" : ""), short: "return: " + SLOTS().map((x) => x[1]).join(", "), cum: true },
      ];
      // room at the bottom for the time label and the pins' legend (which wraps)
      const pinItems = S.pins.map((pn) => ({ label: "pinned: " + pn.label, color: pn.color }));
      const legH = legend(ctx, col, pinItems, 44, 0, w - 56, { measure: true });
      const pad = 44, gap = 22, n = rows.length, rh = (h - 20 - 30 - (legH ? legH + 4 : 0) - gap * (n - 1)) / n;
      const T = 151;
      const recs = S.recs;
      const upto = S.cursor;
      const xs = (fr, k) => fr.sx(k);
      const [cB, cA, cC] = SLOTS().map(([k]) => cum(sc[k].per));
      const maxCum = Math.max(4, ...cB, ...cC, ...(S.torax ? S.torax.torax.cum : [0])) * 1.08;
      const minCum = Math.min(0, ...cC, ...cB);
      xv.rows = [];
      rows.forEach((r, i) => {
        const box = { x: pad, y: 20 + i * (rh + gap), w: w - pad - 12, h: rh };
        const yr = r.cum ? [Math.max(minCum, -5), maxCum] : r.yr;
        const fr = frame(ctx, col, box, [0, T], yr, { title: r.t, short: r.short, logy: r.log, noXLabels: i !== n - 1, xlabel: i === n - 1 ? "time [s]" : "", yticks: r.log ? [0.01, 1, 100] : undefined });
        xv.rows.push([box, fr]);
        if (i === 0) xv.tbox = { x: box.x, w: box.w };
        ctx.save();
        ctx.fillStyle = col.grid;
        ctx.fillRect(fr.sx(S.as.pedMode === "scheduled" ? S.as.pedOn : 0), box.y, S.as.pedMode === "scheduled" ? fr.sx(S.as.pedOn + 4) - fr.sx(S.as.pedOn) : 0, box.h);
        ctx.restore();
        (r.hl || []).forEach(([v, c]) => hline(ctx, box, fr.sy(v), c));
        const cl = (v) => (r.log ? Math.max(v, yr[0]) : v);
        // pinned runs
        S.pins.forEach((pn) => {
          if (r.heat) return;
          if (r.cum) {
            const c = cum(M.scoreEpisode(pn.recs.slice(1), SLOTS()[0][2]).per);
            line(ctx, c.map((v, k) => [fr.sx(k + 1), fr.sy(clamp(v, yr[0], yr[1]))]), pn.color, 1.4);
            return;
          }
          r.s.forEach(([k]) => line(ctx, pn.recs.map((d) => [fr.sx(d.t), fr.sy(cl(d[k]))]), pn.color, 1.3, null, box));
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
            if (S.torax && r.g && r.g[si] && S.torax.torax[r.g[si]]) line(ctx, S.torax.torax[r.g[si]].map((v, j) => [fr.sx(j + 1), fr.sy(cl(v))]), c, 1.2, [4, 3], box);
            line(ctx, recs.slice(0, upto + 1).map((d) => [fr.sx(d.t), fr.sy(cl(d[k]))]), c, 2, null, box);
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
      legend(ctx, col, pinItems, pad, h - legH - 2, w - pad - 12);
    }
    // every plot with a time axis moves the time: each draw function stores its time box as cv.tbox
    // ({x, w} for the axis from t = 0 to 151 s, and optionally y, h to limit the clickable band)
    function scrubFrom(ev, cv, start) {
      const b = cv.tbox;
      if (!b) return false;
      const rect = cv.c.getBoundingClientRect(), x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      if (start && (x < b.x - 6 || x > b.x + b.w + 6 || (b.h && (y < b.y - 8 || y > b.y + b.h + 8)))) return false;
      S.cursor = clamp(Math.round(((x - b.x) / b.w) * 151), 0, S.recs.length - 1);
      S.playing = false;
      playBtn.textContent = "Play";
      S.dirty = true;
      return true;
    }
    // a mouse scrubs on press and drag; a finger only on a sideways drag (a vertical one scrolls the page) or a tap,
    // and not at all on the sparklines and power bars, where a tap opens the history
    let scrubbing = false, touchScrub = null;
    for (const cv of [xv, ks, mv, ra, bv, sv]) {
      cv.c.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "touch") return (touchScrub = cv === sv || cv === bv ? null : { cv, x: e.clientX, y: e.clientY, ev: e, mode: null });
        if (scrubFrom(e, cv, true)) {
          scrubbing = cv;
          if (cv === sv) hidePop();
        }
      });
      cv.c.addEventListener("pointermove", (e) => {
        if (scrubbing === cv) return scrubFrom(e, cv);
        const t = touchScrub;
        if (!t || t.cv !== cv || t.mode === "scroll") return;
        const dx = e.clientX - t.x, dy = e.clientY - t.y;
        if (!t.mode && Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) t.mode = "scroll";
        else if (!t.mode && Math.abs(dx) > 8) t.mode = scrubFrom(t.ev, cv, true) ? "scrub" : "scroll";
        if (t.mode === "scrub") scrubFrom(e, cv);
      });
      cv.c.addEventListener("pointerup", (e) => {
        const t = touchScrub;
        if (t && t.cv === cv && !t.mode && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 8) scrubFrom(e, cv, true);
        touchScrub = null;
      });
      cv.c.addEventListener("pointercancel", () => (touchScrub = null));
    }
    window.addEventListener("pointerup", () => (scrubbing = false));

    // radial profiles at the cursor: this run, TORAX (dashed), t = 0 (dotted), the pins (their colours);
    // every line is named in the title or the hover readout, and lines are clipped to the plot
    let profHover = null, profLast = null;
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
        if (!gp || !arr || !arr[gIdx]) return null;
        const row = arr[gIdx], m = row.length;
        return row.map((v, i) => [i / (m - 1), v]);
      };
      const at = (arr) => arr.map((v, i) => [rho[i], v]);
      const pinsAt = (k) => S.pins.map((pn, j) => {
        const pd = pn.recs[Math.min(d.t, pn.recs.length - 1)];
        return pd && pd.prof && pd.prof[k] ? { lab: `pin ${j + 1}`, color: pn.color, width: 1.3, pts: at(pd.prof[k]) } : null;
      }).filter(Boolean);
      const tab = S.tab, unitOf = { T: "keV", j: "MA/m²", q: "", n: "10²⁰ m⁻³" }[tab];
      let fr, curves = [];
      if (tab === "T") {
        const ymax = Math.max(6, d.Te0 * 1.15, (ghostAt("Te0", d.t) || 0) * 1.1);
        fr = frame(ctx, col, box, [0, 1], [0, ymax], { title: "T_e (orange), T_i (blue) [keV]; dashed: TORAX T_e; dotted: t = 0", short: "T_e orange, T_i blue [keV]", xlabel: "ρ̂" });
        hline(ctx, box, fr.sy(10), col.muted, "10 keV");
        const g = gl(gp && gp.T_e);
        curves = [{ lab: "T_e, t = 0", color: col.muted, width: 1.2, dash: [2, 3], pts: at(d0.prof.Te) }, ...(g ? [{ lab: "TORAX T_e", color: col.series[1], width: 1.3, dash: [5, 4], pts: g }] : []),
          ...pinsAt("Te").map((c) => ({ ...c, lab: c.lab + " T_e" })), { lab: "T_i", color: col.series[0], width: 2.2, pts: at(d.prof.Ti) }, { lab: "T_e", color: col.series[1], width: 2.4, pts: at(d.prof.Te) }];
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
        fr = frame(ctx, col, box, [0, 1], [0, ymax], { title: "j total (blue); shaded: bootstrap (green) + driven (orange) [MA/m²]; dotted: t = 0", short: "j total (blue) [MA/m²]", xlabel: "ρ̂" });
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
        const g = gl(gp && gp.j_total);
        curves = [{ lab: "j, t = 0", color: col.muted, width: 1.2, dash: [2, 3], pts: at(d0.prof.j) }, ...(g ? [{ lab: "TORAX j", color: col.series[0], width: 1.3, dash: [5, 4], pts: g }] : []),
          ...pinsAt("j"), { lab: "bootstrap", color: col.series[2], width: 0, pts: at(jbs) }, { lab: "driven", color: col.series[1], width: 0, pts: at(jdr) }, { lab: "j", color: col.series[0], width: 2.4, pts: at(d.prof.j) }];
      } else if (tab === "q") {
        fr = frame(ctx, col, box, [0, 1], [0, 6], { title: "safety factor q; dashed: TORAX; dotted: t = 0; red: q = 1", short: "safety factor q", xlabel: "ρ̂" });
        hline(ctx, box, fr.sy(1), col.bad, "q = 1 (sawteeth)");
        hline(ctx, box, fr.sy(1.5), col.muted, "3/2");
        hline(ctx, box, fr.sy(2), col.muted, "2");
        const g = gl(gp && gp.q);
        curves = [{ lab: "q, t = 0", color: col.muted, width: 1.2, dash: [2, 3], pts: at(d0.prof.q) }, ...(g ? [{ lab: "TORAX q", color: col.series[1], width: 1.3, dash: [5, 4], pts: g }] : []),
          ...pinsAt("q"), { lab: "q", color: col.series[1], width: 2.4, pts: at(d.prof.q) }];
      } else {
        const nG = M.greenwald(d.Ip, 2);
        const ymax = Math.max(1.6, nG * 1.2, ...d.prof.n) * 1.05;
        fr = frame(ctx, col, box, [0, 1], [0, ymax], { title: "electron density n_e [10²⁰ m⁻³]; red: Greenwald density n_G", short: "n_e [10²⁰ m⁻³]", xlabel: "ρ̂" });
        hline(ctx, box, fr.sy(nG), col.bad, `n_G = I_p/πa² = ${nG.toFixed(2)}`);
        curves = [...pinsAt("n"), { lab: "n_e", color: col.series[1], width: 2.4, pts: at(d.prof.n) }];
        hline(ctx, box, fr.sy(d.nbar), col.series[1], `line average ${d.nbar.toFixed(2)} (f_GW ${d.fgw.toFixed(2)})`, true);
      }
      for (const c of curves) if (c.width) line(ctx, c.pts.map(([x, v]) => [fr.sx(x), fr.sy(v)]), c.color, c.width, c.dash, box);
      if (tab === "q") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y - 6, box.w, box.h + 6);
        ctx.clip();
        ctx.fillStyle = col.accent;
        ctx.beginPath();
        ctx.arc(fr.sx(d.rhoQmin), fr.sy(d.qmin), 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(fr.sx(0.95), fr.sy(d.q95), 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.font = FONT_SMALL;
        if (d.q95 < 6) ctx.fillText("q95", fr.sx(0.95) - 24, fr.sy(d.q95) - 6);
        ctx.restore();
      }
      if (S.pins.length) {
        ctx.font = FONT_SMALL;
        ctx.fillStyle = col.muted;
        ctx.textAlign = "right";
        ctx.fillText(`pins: ${S.pins.map((_, j) => `pin ${j + 1}`).join(", ")} at t = ${d.t} s`, box.x + box.w, box.y + box.h + 30);
        ctx.textAlign = "left";
      }
      // hover: a hairline and the value of every curve at that radius
      if (profHover !== null) {
        const x = fr.sx(profHover);
        ctx.save();
        ctx.strokeStyle = col.fg;
        ctx.globalAlpha = 0.4;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x, box.y);
        ctx.lineTo(x, box.y + box.h);
        ctx.stroke();
        ctx.restore();
      }
      profLast = { box, curves, unit: unitOf, t: d.t };
    }
    function profValue(pts, x) {
      for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
      }
      return pts[pts.length - 1][1];
    }
    pv.c.addEventListener("pointermove", (e) => {
      if (!profLast) return;
      const r = pv.c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, b = profLast.box;
      if (x < b.x || x > b.x + b.w) return (profHover = null), pv.hideTip(), (S.dirty = true);
      profHover = clamp((x - b.x) / b.w, 0, 1);
      const f = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
      const rows = profLast.curves.slice().reverse().map((c) => `<span style="color:${c.color}">●</span> ${c.lab} <b>${f(profValue(c.pts, profHover))}</b>`);
      pv.showTip(x, y, `<b>ρ̂ = ${profHover.toFixed(2)}</b>, t = ${profLast.t} s${profLast.unit ? ` [${profLast.unit}]` : ""}<br>${rows.join("<br>")}`);
      S.dirty = true;
    });
    pv.c.addEventListener("pointerleave", () => ((profHover = null), pv.hideTip(), (S.dirty = true)));
    function drawOps() {
      const col = colors();
      const { ctx, w, h } = ov;
      ctx.clearRect(0, 0, w, h);
      // a legend line for the line styles, then the map
      const leg = [{ label: "this run", color: col.series[0] }, ...(S.torax ? [{ label: "TORAX", color: col.muted, dash: [5, 4] }] : []), ...S.pins.map((pn, j) => ({ label: `pin ${j + 1}`, color: pn.color }))];
      const legH = legend(ctx, col, leg, 46, h - 16, w - 62, { measure: true });
      const box = { x: 46, y: 24, w: w - 62, h: h - 64 - legH };
      const fr = frame(ctx, col, box, [0, 1.5], [0, 0.6], { title: "1/q95 against Greenwald fraction (a Hugill-style map)", short: "1/q95 vs f_GW", xlabel: "Greenwald fraction f_GW = n̄ / n_G" });
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
      ctx.textAlign = "right";
      ctx.fillText(`t = ${d.t} s: f_GW ${d.fgw.toFixed(2)}, q95 ${d.q95.toFixed(2)}, β_N ${d.betaN.toFixed(2)}`, box.x + box.w - 4, box.y + box.h - 22);
      ctx.textAlign = "left";
      legend(ctx, col, leg, box.x, box.y + box.h + 34, box.w);
    }
    function drawReward(sc) {
      const col = colors();
      const { ctx, w, h } = rv;
      ctx.clearRect(0, 0, w, h);
      const k = S.cursor - 1;
      const rows = SLOTS().map(([k, lab]) => [lab, sc[k]]);
      const vals = rows.map(([, s]) => (k >= 0 && s.per[k] ? s.per[k] : { fusion: 0, h98: 0, qmin: 0, q95: 0, penalty: 0, total: 0 }));
      const xmax = Math.max(0.05, ...vals.map((v) => v.fusion + v.h98 + v.qmin + v.q95)) * 1.15;
      const xmin = Math.min(0, ...vals.map((v) => v.penalty));
      const names = [["fusion", col.series[0], "fusion gain"], ["h98", col.series[1], "H98"], ["qmin", col.series[2], "q_min"], ["q95", col.series[3], "q95"]];
      // the legend wraps on a narrow screen and pushes the bars down
      const legH = legend(ctx, col, names.map(([, c, nm]) => ({ label: nm, color: c, kind: "box" })).concat([{ label: "penalty", color: col.bad, kind: "box" }]), Math.min(86, w * 0.22), 4, w - Math.min(86, w * 0.22) - 8);
      const box = { x: Math.min(86, w * 0.22), y: 10 + legH, w: w - Math.min(86, w * 0.22) - Math.min(104, w * 0.24), h: h - 40 - legH };
      const fr = frame(ctx, col, box, [xmin, xmax], [0, 3], { xlabel: `reward in the second ending at t = ${Math.max(0, S.cursor)} s`, yticks: [] });
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
    }
    function drawScores(sc) {
      const full = S.recs.length - 1;
      const fmtR = (s) => (s.endT ? `${s.ret.toFixed(2)}<small>ended at ${s.endT} s: ${s.why}</small>` : s.ret.toFixed(2));
      const torWhat = S.kind === "sandbox" ? "the original episode, before you took over" : S.live ? "the same controller on the real simulator" : "same actions on the real simulator";
      const tor = S.torax ? `<div class="lab-score muted" title="${torWhat}"><span>TORAX</span><b>${S.torax.benchmark.toFixed(2)}</b><small>${PHYS() ? "physics env" : "benchmark"}, recorded</small></div>` : "";
      scoreBox.innerHTML = SLOTS().map(([k, lab, , what], i) =>
        `<div class="lab-score ${["b", "a", "c"][i]}" title="${what}"><span>${lab}</span><b>${fmtR(sc[k])}</b><small>${i === 0 ? `${full} of ${HOR()} s` : what.length < 26 ? what : ""}</small></div>`).join("") + tor;
      const rs = S.recs.slice(1);
      const q1 = rs.filter((d) => d.qmin < 1), firstQ = rs.find((d) => d.qmin < 1);
      const fg = rs.filter((d) => d.fgw > 1), maxF = Math.max(0, ...rs.map((d) => d.fgw));
      const fake = rs.filter((d) => d.Te0 > 10 && d.Ti0 > 10 && d.psolPlh < 1);
      const liOut = rs.filter((d) => d.t <= 100 && (d.li < 0.65 || d.li > 1.2)), firstLi = liOut[0];
      const hSec = rs.filter((d) => d.mode === 1).length, paid = rs.filter(physPaid).length;
      const maxQ = Math.max(0, ...rs.map((d) => d.Q));
      const last = rs[rs.length - 1];
      const item = (ok, text) => `<li class="${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"} ${text}</li>`;
      audit.innerHTML =
        (PHYS()
          ? `<div class="lab-sub">Physics checks of this run (the physics environment ends the episode on the first two)</div><ul>` +
            item(!firstLi, `l_i(3) outside 0.65–1.2 during the ramp for <b>${liOut.length} s</b>${firstLi ? ` (first at t = ${firstLi.t} s, l_i = ${firstLi.li.toFixed(2)}): vertical control at risk` : ""}`) +
            item(fg.length === 0, `Greenwald fraction above 1 for <b>${fg.length} s</b>, peak ${maxF.toFixed(2)}`) +
            item(hSec > 0, `H-mode for <b>${hSec} s</b>, paid (P_heat ≥ 1.2 × the true threshold) for <b>${paid} s</b>`) +
            item(q1.length === 0, `q_min < 1 for <b>${q1.length} s</b>${firstQ ? ` (from t = ${firstQ.t} s): a hybrid scenario needs q_min just above 1` : ""}`)
          : `<div class="lab-sub">Physics audit of this run (things the benchmark reward does not check)</div><ul>` +
            item(q1.length === 0, `q_min < 1 for <b>${q1.length} s</b>${firstQ ? ` (from t = ${firstQ.t} s): sawteeth in a real machine; a hybrid scenario needs q_min just above 1` : ""}`) +
            item(fg.length === 0, `Greenwald fraction above 1 for <b>${fg.length} s</b>, peak ${maxF.toFixed(2)}`) +
            item(fake.length === 0, `paid as H-mode while P_SOL < P_LH for <b>${fake.length} s</b>`)) +
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
    // a network's input size, before its file is loaded: 60 features (+3 in the physics environment: the two
    // confinement flags and P_heat), +4 on top of PI (its proposal and integral)
    const nInputs = () => (POLICY[S.key] ? POLICY[S.key].obs_dim : (isResidual(S.key) ? 64 : 60) + (PHYS() ? 3 : 0));
    function controllerText(k) {
      const info = k.info, t = k.t;
      if (S.ctrl === "open") return { title: "schedule", meas: null, lines: [`knobs = f(t), t = ${Math.max(0, t - 1)} s`, "reads nothing from the plasma"] };
      if (S.ctrl === "human") return { title: "you", meas: ["your eyes on the screen"], lines: ["reading the plots,", "moving the sliders"] };
      const where = S.live ? "Lab" : "TORAX";
      if (isPI(S.key) || (info && info.pi && !info.base)) {
        const sg = info && info.pi;
        if (!sg) return { title: "PI controller", meas: [t < 1 ? "—" : "nothing after 100 s"], lines: [t < 1 ? "acts from t = 0 s" : "I_p held at its last value", "heating on the clock (open loop)"] };
        return {
          title: "PI controller",
          meas: [`j(0) = ${(sg.j0 / 1e6).toFixed(2)} MA/m² (${where})`, `target j* = ${(sg.target / 1e6).toFixed(2)}`],
          lines: [`e = j* − j(0) = ${sgn(sg.error / 1e6, 2)} MA/m²`, `I_p = 3 MA + kp·e + ki·∫e = ${(sg.desired / 1e6).toFixed(2)} MA${sg.sat ? " (limited)" : ""}`, "heating on the clock (open loop)"],
        };
      }
      const nIn = nInputs();
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
      // the legend wraps and keeps its own rows under "time [s]"
      const leg = [{ color: c, label: `this run (${(CTRL[S.ctrl] || CTRL.feedback).tag})` }];
      if (S.knobs.some((i) => i && i.base)) leg.push({ color: col.accent, label: "PI's proposal; shaded: correction", dash: [2, 2] });
      if (showRecordedKnobs()) leg.push({ color: col.muted, label: "on TORAX", dash: [5, 4] });
      S.pins.forEach((pn) => leg.push({ color: pn.color, label: "pinned: " + pn.label }));
      const legH = legend(ctx, col, leg, 40, 0, w - 50, { measure: true });
      const pad = 40, gap = 26, rh = (h - 18 - 32 - legH - gap * 2) / 3;
      ks.rows = [];
      const upto = S.cursor;
      rows.forEach((r, i) => {
        const bx = { x: pad, y: 18 + i * (rh + gap), w: w - pad - 10, h: rh };
        const fr = frame(ctx, col, bx, [0, 151], r.yr, { title: r.t, noXLabels: i !== 2, xlabel: i === 2 ? "time [s]" : "" });
        ks.rows.push([bx, fr]);
        ks.tbox = { x: bx.x, w: bx.w };
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
      legend(ctx, col, leg, pad, h - legH - 2, w - pad - 10);
    }
    function updateKnobBanner() {
      const p = presetOf(S.key) || {}, c = CTRL[S.ctrl] || CTRL.feedback;
      let txt;
      if (S.ctrl === "open") txt = "A schedule: every knob is a function of time alone, fixed before the shot. Change the plasma parameters and the knobs stay where they are; only the plasma changes.";
      else if (S.ctrl === "human") txt = `You are the feedback controller: you read the plasma on this page and set the knobs once per second, from ${SIDE()}.`;
      else if (S.live) {
        const reads = isPI(S.key) ? "j(0), the central current density, against a rising target" : `${nInputs()} numbers describing the plasma`;
        txt = `<b>${S.label}, closed loop on the Lab:</b> every second it reads ${reads} from this plasma and sets the knobs from it, so they follow whatever the Lab does, including your changes to its parameters and gains. Dashed: what it did on TORAX.` +
          (isPI(S.key) ? " Its heating still follows the clock: PI is feedback on I_p only." : "");
      } else
        txt = `<b>${S.label}:</b> the knobs it set on TORAX, while reading TORAX's plasma, replayed here without feedback.` +
          (p.live ? ` Switch ${SIDE()} to <i>live on the Lab</i>, or move one of its gains, to let it read this plasma instead.` : "");
      kBanner.innerHTML = `<span class="lab-cls ${c.cls}">${c.tag}</span>${txt}` + (S.liveNote ? ` <em>(${S.liveNote})</em>` : "");
      syncSide();
    }
    // the side pane (the Controls tab on a phone): what is loaded, and the controls that apply to it
    function syncSide() {
      const p = presetOf(S.key) || {}, c = CTRL[S.ctrl] || CTRL.feedback;
      sideHead.innerHTML = `<span class="lab-cls ${c.cls}">${c.tag}</span><b>${S.label}</b>` + (S.live ? ` <span class="lab-live">live</span>` : "");
      liveBtns.rec.classList.toggle("on", !S.live);
      liveBtns.live.classList.toggle("on", S.live);
      liveBtns.live.disabled = !p.live || S.mode !== "watch" || !RC;
      liveSeg.hidden = S.ctrl !== "feedback";
      const tunable = S.ctrl === "feedback" && S.mode === "watch" && usesPI(S.key);
      tuneBox.hidden = !tunable;
      corrWrap.hidden = !isResidual(S.key);
      tuneReset.hidden = !tuneModified();
      driveBox.hidden = S.mode !== "drive";
      takeBtn.hidden = S.mode === "drive";
      ctlNote.innerHTML =
        S.ctrl === "open" ? "A schedule reads nothing, so there is nothing to tune: its knobs are fixed in time. Change the plasma below and watch only the plasma move."
        : S.ctrl === "human" ? "Set the knobs, then <b>Run</b> (one action per second) or <b>Step 1 s</b>, like <code>env.step(a)</code>."
        : tunable ? (isResidual(S.key) ? "PI plus a network. Moving a control runs it live; correction 0 is pure PI." : "Moving a gain runs PI live on the Lab.")
        : "A network trained on TORAX: run it live to see what it does on this plasma.";
      if (S.liveNote) ctlNote.innerHTML += ` <em>(${S.liveNote})</em>`;
    }

    // ------------------------------------------------ side pane: the episode at a glance
    const LANES = [
      ["heating", (d) => (d.Pnbi + d.Pecrh) / 53, "rgb(235,120,30)"],
      ["H-mode paid", (d) => (PHYS() ? (d.mode === 1 ? (physPaid(d) ? 1 : 0.5) : 0) : d.Te0 > 10 && d.Ti0 > 10 ? (d.psolPlh >= 1 ? 1 : 0.5) : 0), "#1baf7a"],
      ["q_min < 1", (d) => (d.qmin < 1 ? 1 : 0), "#e34948"],
      ["f_GW > 1", (d) => (d.fgw > 1 ? 1 : 0), "#c98500"],
    ];
    function drawTimeline() {
      const col = colors();
      const { ctx, w, h } = tl;
      ctx.clearRect(0, 0, w, h);
      const x0 = 66, x1 = w - 2, lh = 9, gap = 4, y0 = 4;
      const sx = (t) => x0 + ((x1 - x0) * t) / 151;
      const recs = S.recs.slice(1);
      LANES.forEach(([lab, f, c], i) => {
        const y = y0 + i * (lh + gap);
        ctx.fillStyle = col.grid;
        ctx.fillRect(x0, y, x1 - x0, lh);
        ctx.fillStyle = c;
        for (const d of recs) {
          const v = clamp(f(d), 0, 1);
          if (v <= 0) continue;
          ctx.globalAlpha = 0.25 + 0.75 * v;
          ctx.fillRect(sx(d.t - 1), y, Math.max(1, sx(d.t) - sx(d.t - 1)), lh);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = col.muted;
        ctx.font = FONT_SMALL;
        ctx.textBaseline = "middle";
        ctx.fillText(lab, 0, y + lh / 2);
      });
      if (S.as.pedMode === "scheduled") {
        ctx.strokeStyle = col.muted;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(sx(S.as.pedOn), y0 - 2);
        ctx.lineTo(sx(S.as.pedOn), h - 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(S.cursor), 0);
      ctx.lineTo(sx(S.cursor), h);
      ctx.stroke();
      tl.box = { x0, x1 };
    }
    let tlDrag = false;
    const tlScrub = (e) => {
      const r = tl.c.getBoundingClientRect(), b = tl.box || { x0: 66, x1: r.width };
      S.cursor = clamp(Math.round((151 * (e.clientX - r.left - b.x0)) / (b.x1 - b.x0)), 0, S.recs.length - 1);
      S.playing = false;
      playBtn.textContent = "Play";
      S.dirty = true;
    };
    tl.c.addEventListener("pointerdown", (e) => ((tlDrag = true), tlScrub(e)));
    tl.c.addEventListener("pointermove", (e) => tlDrag && tlScrub(e));
    window.addEventListener("pointerup", () => (tlDrag = false));
    // keys: space plays or pauses, arrows step (shift: 10 s), anywhere while the Lab is in view; the letter keys
    // (F full screen, L part names, S scoreboard, ? about) only after a click inside the Lab, since the site uses
    // F and S for its search. Ignored while typing in a control.
    let labActive = false;
    root.addEventListener("pointerdown", () => (labActive = true));
    root.addEventListener("focusin", () => (labActive = true));
    document.addEventListener("pointerdown", (e) => root.contains(e.target) || (labActive = false));
    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(tag) && e.key === " ") return;
      if (/SELECT|TEXTAREA/.test(tag) || !root.isConnected) return;
      if (!visible && !isFull()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        if (!mMenu.hidden) toggleMenu(false);
        else if (popQ) hidePop();
        else if (openCard) showCard(null);
        else if (isFull()) fsExit();
        return;
      }
      if (tag === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox") return;
      const k = e.key.toLowerCase(), letter = { f: () => toggleFull(), l: () => setLayer("labels", !layers.labels), s: () => showCard("scores"), "?": () => showCard("about") }[k];
      if (letter) {
        if (!labActive && !isFull()) return;
        e.preventDefault();
        e.stopPropagation(); // keep the site's search shortcuts out of it
        return letter();
      }
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (tag === "INPUT") return;
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * (e.key === "ArrowRight" ? 1 : -1);
        S.cursor = clamp(S.cursor + step, 0, S.recs.length - 1);
        S.playing = false;
        playBtn.textContent = "Play";
        S.dirty = true;
      }
    });

    // ------------------------------------------------ side pane: outcomes as sparklines
    const SPARK_BENCH = [
      { k: "qmin", lab: "q_min", yr: [0, 4], thr: 1, ok: (v) => v >= 1, f: (v) => v.toFixed(2) },
      { k: "q95", lab: "q95", yr: [0, 8], thr: 3, ok: (v) => v >= 3, f: (v) => v.toFixed(2) },
      { k: "fgw", lab: "f_GW", yr: [0, 1.6], thr: 1, ok: (v) => v <= 1, f: (v) => v.toFixed(2) },
      { k: "psolPlh", lab: "P_SOL/P_LH", yr: [0, 3], thr: 1, ok: (v) => v >= 1, f: (v) => v.toFixed(2) },
      { k: "Te0", lab: "T_e(0)", yr: [0, 36], thr: 10, ok: (v) => v >= 10 && v < 35, f: (v) => v.toFixed(1) + " keV" },
      { k: "Q", lab: "Q", yr: [0, 25], thr: 10, ok: (v) => v >= 10, f: (v) => (v < 100 ? v.toFixed(1) : v.toFixed(0)) },
      { k: "H98", lab: "H98", yr: [0, 1.6], thr: 1, ok: (v) => v >= 1, f: (v) => v.toFixed(2) },
    ];
    const SPARK_PHYS = SPARK_BENCH.map((r) => (r.k === "psolPlh"
      ? { k: "psolPlh", lab: "P_heat/P_LH", yr: [0, 3], thr: 1.2, ok: (v, d) => v >= 1.2 * (d.plhMul || 1), f: (v) => v.toFixed(2) } : r))
      .concat([{ k: "li", lab: "l_i(3)", yr: [0.4, 1.4], thr: 0.65, ok: (v, d) => d.t > 100 || (v >= 0.65 && v <= 1.2), f: (v) => v.toFixed(2) }]);
    const sparkRows = () => (PHYS() ? SPARK_PHYS : SPARK_BENCH);
    // hover a sparkline row: the same history popup as the numbers panel
    const sparkPop = (e) => {
      const r = sv.c.getBoundingClientRect(), rows = sparkRows(), rh = (sv.h - 4) / rows.length;
      const i = clamp(Math.floor((e.clientY - r.top - 2) / rh), 0, rows.length - 1);
      const q = QTY().find((x) => x.k === rows[i].k);
      if (!q) return hidePop();
      if (popQ !== q || popEl !== sv.c) showPopAt(q, sv.c, { left: r.left, right: r.right, top: r.top + 2 + i * rh, bottom: r.top + 2 + (i + 1) * rh });
      else if (e.type === "click") hidePop();
    };
    sv.c.addEventListener("pointermove", (e) => e.pointerType !== "touch" && scrubbing !== sv && sparkPop(e));
    sv.c.addEventListener("click", (e) => TOUCH && sparkPop(e));
    sv.c.addEventListener("pointerleave", (e) => e.pointerType !== "touch" && hidePop());
    sv.c.style.cursor = "help";
    sv.c.title = "";
    function drawSpark() {
      const col = colors();
      const { ctx, w, h } = sv;
      ctx.clearRect(0, 0, w, h);
      const SPARK = sparkRows();
      const rh = (h - 4) / SPARK.length, x0 = 72, x1 = w - 62;
      sv.tbox = { x: x0, w: x1 - x0 };
      const recs = S.recs, cur = Math.min(S.cursor, recs.length - 1);
      const sx = (t) => x0 + ((x1 - x0) * t) / 151;
      const good = "#1baf7a", bad = col.bad;
      SPARK.forEach((r, i) => {
        const y0 = 2 + i * rh, sy = (v) => y0 + rh - 4 - ((rh - 8) * (clamp(v, r.yr[0], r.yr[1]) - r.yr[0])) / (r.yr[1] - r.yr[0]);
        ctx.save();
        ctx.font = FONT_SMALL;
        ctx.textBaseline = "middle";
        ctx.fillStyle = col.muted;
        ctx.fillText(r.lab, 0, y0 + rh / 2);
        ctx.strokeStyle = col.grid;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x0, sy(r.thr));
        ctx.lineTo(x1, sy(r.thr));
        ctx.stroke();
        ctx.setLineDash([]);
        S.pins.forEach((pn) => line(ctx, pn.recs.slice(1).map((d) => [sx(d.t), sy(d[r.k])]), pn.color, 1));
        line(ctx, recs.slice(1).map((d) => [sx(d.t), sy(d[r.k])]), col.grid, 1.2);
        line(ctx, recs.slice(1, cur + 1).map((d) => [sx(d.t), sy(d[r.k])]), col.fg, 1.5);
        const d = recs[cur];
        if (d && cur > 0) {
          const ok = r.ok(d[r.k], d);
          ctx.fillStyle = ok ? good : bad;
          ctx.beginPath();
          ctx.arc(sx(d.t), sy(d[r.k]), 3, 0, 2 * Math.PI);
          ctx.fill();
          ctx.font = '600 12px Inter, sans-serif';
          ctx.textAlign = "right";
          ctx.fillText(r.f(d[r.k]), w - 2, y0 + rh / 2);
        }
        ctx.restore();
      });
    }

    // ------------------------------------------------ space-time maps
    const MAPS = {
      T: { title: "T_e [keV]", lab: (d) => d.prof.Te, tor: "T_e", cm: COLOR_BY.Te },
      j: { title: "j [MA/m²]", lab: (d) => d.prof.j, tor: "j_total", cm: COLOR_BY.j },
      q: { title: "q", lab: (d) => d.prof.q, tor: "q", cm: COLOR_BY.q },
      n: { title: "n_e [10²⁰ m⁻³]", lab: (d) => d.prof.n, tor: null, cm: { map: "ice", norm: (v) => clamp(v / 1.6, 0, 1), ticks: [0, 0.5, 1, 1.5] } },
    };
    // map images are rebuilt only when the episode changes, from 256-entry colour tables
    const LUT = {};
    function lut(name) {
      if (!LUT[name]) LUT[name] = Array.from({ length: 256 }, (_, i) => cmap(name, i / 255).match(/\d+/g).map(Number));
      return LUT[name];
    }
    function mapImage(cols, rows, valAt, cm) {
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, cols);
      cv.height = Math.max(1, rows);
      const g = cv.getContext("2d"), img = g.createImageData(cv.width, cv.height), tab = lut(cm.map);
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < rows; r++) {
          const v = valAt(c, rows - 1 - r), rgb = tab[Math.round(255 * clamp(cm.norm(v), 0, 1))] || tab[0];
          const o = 4 * (r * cols + c);
          img.data[o] = rgb[0];
          img.data[o + 1] = rgb[1];
          img.data[o + 2] = rgb[2];
          img.data[o + 3] = isFinite(v) ? 255 : 0;
        }
      g.putImageData(img, 0, 0);
      return cv;
    }
    let mapCache = { key: null, imgs: [] };
    function q1Radius(q) {
      // the q = 1 surface: first radius, from the axis, where q reaches 1 (none if q(0) >= 1)
      if (!(q[0] < 1)) return null;
      for (let i = 1; i < q.length; i++) if (q[i] >= 1) return (i - 1 + (1 - q[i - 1]) / (q[i] - q[i - 1])) / (q.length - 1);
      return null;
    }
    function drawMaps() {
      const col = colors();
      const { ctx, w, h } = mv;
      ctx.clearRect(0, 0, w, h);
      const m = MAPS[S.mapTab];
      const tor = S.toraxProf && m.tor && S.toraxProf[m.tor] ? S.toraxProf[m.tor] : null;
      const n = 2, padL = 44, padR = 74, top = 22, gap = 38;
      const mh = (h - top - 34 - gap * (n - 1)) / n;
      const recs = S.recs.slice(1), cur = S.cursor;
      const labMap = (mm) => ({ name: `Lab: ${mm.title}`, cols: recs.length, rows: recs.length ? mm.lab(recs[0]).length : 0, at: (c, r) => mm.lab(recs[c])[r], lab: true, cm: mm.cm });
      const maps = [labMap(m)];
      if (tor) maps.push({ name: `TORAX, the recorded episode: ${m.title}`, cols: tor.length, rows: tor[0].length, at: (c, r) => tor[c][r], lab: false, cm: m.cm });
      else maps.push(labMap(MAPS[{ T: "q", j: "q", q: "j", n: "T" }[S.mapTab]])); // no TORAX profiles: a companion map
      const ck = `${S.mapTab}|${S.key}|${S.recsVersion}|${recs.length}`;
      if (mapCache.key !== ck) mapCache = { key: ck, imgs: maps.map((mp) => (mp.cols && mp.rows ? mapImage(mp.cols, mp.rows, mp.at, mp.cm) : null)) };
      maps.forEach((mp, i) => {
        const box = { x: padL, y: top + i * (mh + gap), w: w - padL - padR, h: mh };
        const fr = frame(ctx, col, box, [0, 151], [0, 1], { title: mp.name, noXLabels: i < n - 1, xlabel: i === n - 1 ? "time [s]" : "", yticks: [0, 0.5, 1] });
        mv.tbox = { x: box.x, w: box.w };
        if (mp.cols && mp.rows) {
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          if (mapCache.imgs[i]) ctx.drawImage(mapCache.imgs[i], fr.sx(0.5), box.y, fr.sx(mp.cols + 0.5) - fr.sx(0.5), box.h);
          ctx.restore();
        }
        // q = 1 surface, from the Lab's or TORAX's own q profiles
        const qs = mp.lab ? recs.map((d) => d.prof.q) : S.toraxProf && S.toraxProf.q;
        if (qs) {
          ctx.save();
          ctx.strokeStyle = "#ff3b3b";
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          let pen = false;
          qs.forEach((q, k) => {
            const r1 = q1Radius(q);
            if (r1 === null) return (pen = false);
            const x = fr.sx(k + 1), y = fr.sy(r1);
            pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            pen = true;
          });
          ctx.stroke();
          ctx.restore();
        }
        hline(ctx, box, fr.sy(0.91), "rgba(255,255,255,0.75)");
        if (mp.lab) {
          // where the heating goes
          recs.forEach((d, k) => {
            if (d.Pnbi > 0.5) {
              ctx.fillStyle = `rgba(255,140,40,${0.25 + 0.6 * (d.Pnbi / 33)})`;
              ctx.fillRect(fr.sx(k + 1) - 1, fr.sy(0.25) - 1.5, 2, 3);
            }
            if (d.Pecrh > 0.5) {
              ctx.fillStyle = `rgba(80,220,255,${0.3 + 0.6 * (d.Pecrh / 20)})`;
              ctx.fillRect(fr.sx(k + 1) - 1, fr.sy(d.ecrhLoc || 0.35) - 1.5, 2, 3);
            }
          });
        }
        // the future, dimmed; the cursor
        ctx.save();
        ctx.fillStyle = col.panel;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(fr.sx(cur + 0.5), box.y, box.x + box.w - fr.sx(cur + 0.5), box.h);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = col.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fr.sx(cur), box.y);
        ctx.lineTo(fr.sx(cur), box.y + box.h);
        ctx.stroke();
        ctx.fillStyle = col.muted;
        ctx.font = FONT_SMALL;
        ctx.translate(12, box.y + box.h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText("ρ̂", 0, 0);
        ctx.restore();
        // its colour bar
        const bx = w - padR + 22;
        for (let k = 0; k < box.h; k++) {
          ctx.fillStyle = cmap(mp.cm.map, 1 - k / box.h);
          ctx.fillRect(bx, box.y + k, 12, 1.2);
        }
        ctx.save();
        ctx.fillStyle = col.muted;
        ctx.font = FONT_SMALL;
        ctx.textBaseline = "middle";
        for (const tv of mp.cm.ticks) ctx.fillText(String(tv), bx + 16, box.y + box.h * (1 - mp.cm.norm(tv)));
        ctx.restore();
      });
    }

    // ------------------------------------------------ power and current balance
    // a stacked bar; segments too narrow for their label are returned for the legend, every segment for hovering
    function stackBar(ctx, col, x0, y, hgt, scale, parts, label) {
      let x = x0;
      const small = [], segs = [];
      ctx.save();
      ctx.font = FONT_SMALL;
      ctx.textBaseline = "middle";
      ctx.fillStyle = col.fg;
      ctx.textAlign = "right";
      ctx.fillText(label, x0 - 8, y + hgt / 2);
      ctx.textAlign = "center";
      for (const part of parts) {
        const [v, c, name] = part;
        const wv = Math.max(0, v) * scale;
        if (wv <= 0) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, wv - 1, hgt);
        const txt = `${name} ${v < 10 ? v.toFixed(1) : v.toFixed(0)}`;
        if (wv > ctx.measureText(txt).width + 8) {
          ctx.fillStyle = "#fff";
          ctx.fillText(txt, x + wv / 2, y + hgt / 2);
        } else small.push({ label: txt, color: c, kind: "box" });
        segs.push({ x, y, w: Math.max(wv, 3), h: hgt, part });
        x += wv;
      }
      ctx.restore();
      return { x, small, segs };
    }
    let balSegs = [];
    function drawBalance() {
      const col = colors();
      const { ctx, w, h } = bv;
      ctx.clearRect(0, 0, w, h);
      const c = Math.min(S.cursor, S.recs.length - 1), d = S.recs[c], prev = S.recs[Math.max(0, c - 1)];
      const x0 = 70, x1 = w - 16;
      const ORANGE = "rgb(235,120,30)", CYAN = "rgb(40,170,210)", ALPHA = "#c98500", OHM = "#8f7fe0", RAD = "#9aa0a6";
      // power at the cursor; each part: [value, colour, name, a quantity for its history (null: none)]
      const dW = c > 0 ? (d.W - prev.W) / 1e6 : 0;
      const pq = (k, lab, get, g) => ({ k, lab, unit: "MW", n: 1, get, g });
      const pin = [[d.Pohm, OHM, "ohmic", pq("bPohm", "ohmic heating", (r) => r.Pohm)], [d.Pnbi, ORANGE, "NBI", pq("bPnbi", "NBI heating", (r) => r.Pnbi, "Pnbi")],
        [d.Pecrh, CYAN, "ECRH", pq("bPecrh", "ECRH heating", (r) => r.Pecrh, "Pecrh")], [d.Palpha, ALPHA, "α", pq("bPalpha", "α heating", (r) => r.Palpha)], [dW < 0 ? -dW : 0, col.grid, "stored", null]];
      const pout = [[d.Prad, RAD, "radiated", pq("bPrad", "radiated power", (r) => r.Prad)], [d.Psol, col.series[2], "P_SOL", pq("bPsol", "P_SOL, across the edge", (r) => r.Psol)], [dW > 0 ? dW : 0, col.muted, "into W", null]];
      const tot = Math.max(10, pin.reduce((s, p) => s + Math.max(0, p[0]), 0), pout.reduce((s, p) => s + Math.max(0, p[0]), 0)) * 1.08;
      const sc = (x1 - x0) / tot;
      const title = (t, short, y) => {
        ctx.save();
        ctx.fillStyle = col.fg;
        ctx.font = FONT;
        RT.fitText(ctx, ctx.measureText(t).width <= w - 4 ? t : short, 0, y, w - 4);
        ctx.restore();
      };
      title(`Power at t = ${d.t} s [MW]: what heats the plasma, and where it goes`, `Power at t = ${d.t} s [MW]: in and out`, 14);
      const bIn = stackBar(ctx, col, x0, 26, 22, sc, pin, "in");
      const bOut = stackBar(ctx, col, x0, 54, 22, sc, pout, "out");
      // P_LH: the out bar must reach this mark for P_SOL >= P_LH
      const xl = x0 + (Math.max(0, d.Prad) + d.PLH) * sc;
      ctx.save();
      ctx.strokeStyle = col.bad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xl, 50);
      ctx.lineTo(xl, 80);
      ctx.stroke();
      ctx.fillStyle = col.bad;
      ctx.font = FONT_SMALL;
      ctx.textAlign = "center";
      ctx.fillText(`P_LH ${d.PLH.toFixed(0)} MW`, clamp(xl, x0 + 30, x1 - 30), 90);
      ctx.restore();
      // segments too narrow to carry their name: a legend under the bars
      let y = 98;
      y += legend(ctx, col, bIn.small.concat(bOut.small), x0, y, x1 - x0) + 6;
      // current at the cursor
      const ni = Math.max(0, d.Ibs) + Math.max(0, d.Inb) + Math.max(0, d.Iec);
      const ind = d.Ip - ni;
      const isc = (x1 - x0) / Math.max(15, d.Ip, ni) / 1.04;
      const cq = (k, lab, get) => ({ k, lab, unit: "MA", n: 2, get });
      title(`Plasma current I_p = ${d.Ip.toFixed(2)} MA: driven by the solenoid (inductive) or not`, `I_p = ${d.Ip.toFixed(2)} MA: inductive or not`, y + 12);
      const bI = stackBar(ctx, col, x0, y + 22, 22, isc, [[ind, col.series[0], "inductive", cq("bInd", "inductive current", (r) => r.Ip - Math.max(0, r.Ibs) - Math.max(0, r.Inb) - Math.max(0, r.Iec))],
        [d.Ibs, col.series[2], "bootstrap", cq("bIbs", "bootstrap current", (r) => r.Ibs)], [d.Inb, ORANGE, "NBCD", cq("bInb", "NBI-driven current", (r) => r.Inb)], [d.Iec, CYAN, "ECCD", cq("bIec", "EC-driven current", (r) => r.Iec)]], "I_p");
      y += 22 + 22 + 6;
      y += legend(ctx, col, bI.small, x0, y, x1 - x0) + 4;
      balSegs = bIn.segs.concat(bOut.segs, bI.segs);
      // fractions through the episode
      const box = { x: x0, y: y + 22, w: x1 - x0, h: h - y - 22 - 30 };
      const fr = frame(ctx, col, box, [0, 151], [0, 1], { title: "fractions: bootstrap (green), non-inductive (blue), α heating (amber), radiated (grey)" + (S.pins.length ? "; pins: non-inductive" : ""), short: "fractions: bootstrap, non-inductive, α, radiated", xlabel: "time [s]", yticks: [0, 0.5, 1] });
      bv.tbox = { x: box.x, w: box.w, y: box.y, h: box.h };
      const rs = S.recs.slice(1, c + 1);
      const ser = [
        [(r) => r.Ibs / Math.max(r.Ip, 0.1), col.series[2]],
        [(r) => (Math.max(0, r.Ibs) + Math.max(0, r.Inb) + Math.max(0, r.Iec)) / Math.max(r.Ip, 0.1), col.series[0]],
        [(r) => r.Palpha / Math.max(r.Pohm + r.Paux + r.Palpha, 0.1), ALPHA],
        [(r) => r.Prad / Math.max(r.Pohm + r.Paux + r.Palpha, 0.1), RAD],
      ];
      S.pins.forEach((pn) => line(ctx, pn.recs.slice(1).map((r) => [fr.sx(r.t), fr.sy(ser[1][0](r))]), pn.color, 1.2, [3, 2], box));
      ser.forEach(([f, cc]) => line(ctx, rs.map((r) => [fr.sx(r.t), fr.sy(f(r))]), cc, 2, null, box));
      ctx.save();
      ctx.strokeStyle = col.accent;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(fr.sx(d.t), box.y);
      ctx.lineTo(fr.sx(d.t), box.y + box.h);
      ctx.stroke();
      ctx.restore();
    }
    // hover a bar segment: its history in the shared popup (with its share of the bar in the title)
    const balPop = (e) => {
      const r = bv.c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const seg = balSegs.find((g) => x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h);
      if (!seg) return popEl === bv.c && hidePop();
      const [v, , , q] = seg.part;
      if (!q) return popEl === bv.c && hidePop();
      const total = balSegs.filter((g) => g.y === seg.y).reduce((a, g) => a + Math.max(0, g.part[0]), 0);
      const qq = { ...q, note: `${((100 * v) / Math.max(total, 1e-9)).toFixed(0)} % of the bar` };
      if (popEl !== bv.c || !popQ || popQ.k !== q.k) showPopAt(qq, bv.c, { left: r.left + seg.x, right: r.left + seg.x + seg.w, top: r.top + seg.y, bottom: r.top + seg.y + seg.h });
      else if (e.type === "click") hidePop();
    };
    bv.c.addEventListener("pointermove", (e) => e.pointerType !== "touch" && scrubbing !== bv && balPop(e));
    bv.c.addEventListener("click", (e) => TOUCH && balPop(e));
    bv.c.addEventListener("pointerleave", (e) => e.pointerType !== "touch" && popEl === bv.c && hidePop());

    // ------------------------------------------------ reward through the episode (stacked terms)
    // hover the reward area: each term in the hovered second
    let raLast = null;
    ra.c.addEventListener("pointermove", (e) => {
      if (!raLast || scrubbing === ra) return;
      const r = ra.c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, b = raLast.box;
      if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return ra.hideTip();
      const t = clamp(Math.round(((x - b.x) / b.w) * 151), 1, raLast.per.length), p = raLast.per[t - 1];
      if (!p) return ra.hideTip();
      const f = (v) => v.toFixed(4);
      ra.showTip(x, y, `<b>${raLast.label}, the second ending at t = ${t} s</b><br>fusion gain ${f(p.fusion)} · H98 ${f(p.h98)} · q_min ${f(p.qmin)} · q95 ${f(p.q95)}${p.penalty ? ` · penalty ${f(p.penalty)}` : ""}<br>total <b>${f(p.total)}</b>`);
    });
    ra.c.addEventListener("pointerleave", () => ra.hideTip());
    function drawRewardArea(sc) {
      const col = colors();
      const { ctx, w, h } = ra;
      ctx.clearRect(0, 0, w, h);
      const slot = SLOTS()[S.rewSlot], s = sc[slot[0]], per = s.per, c = S.cursor;
      const names = [["q95", col.series[3]], ["qmin", col.series[2]], ["h98", col.series[1]], ["fusion", col.series[0]]];
      const ymax = Math.max(0.06, ...per.map((p) => p.fusion + p.h98 + p.qmin + p.q95)) * 1.1;
      const ymin = Math.min(0, ...per.map((p) => (p.penalty > -1 ? p.penalty : 0)));
      const box = { x: 46, y: 22, w: w - 62, h: h - 52 };
      const label = slot[1];
      const sofar = `return so far ${cum(per.slice(0, c)).pop()?.toFixed(2) ?? "0.00"} of ${s.ret.toFixed(2)}`;
      const fr = frame(ctx, col, box, [0, 151], [ymin, ymax], { title: `${sofar} · ${label} reward per second, by term`, short: `${label}: ${sofar}`, xlabel: "time [s]" });
      ra.tbox = { x: box.x, w: box.w };
      raLast = { fr, box, per, label };
      let base = per.map(() => 0);
      names.forEach(([k, cc]) => {
        const topv = per.map((p, i) => base[i] + Math.max(0, p[k]));
        ctx.save();
        ctx.fillStyle = cc;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        topv.forEach((v, i) => (i ? ctx.lineTo(fr.sx(i + 1), fr.sy(Math.min(v, ymax))) : ctx.moveTo(fr.sx(i + 1), fr.sy(Math.min(v, ymax)))));
        for (let i = base.length - 1; i >= 0; i--) ctx.lineTo(fr.sx(i + 1), fr.sy(Math.min(base[i], ymax)));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        base = topv;
      });
      if (ymin < 0) line(ctx, per.map((p, i) => [fr.sx(i + 1), fr.sy(Math.max(ymin, Math.min(0, p.penalty)))]), col.bad, 1.5);
      ctx.save();
      ctx.fillStyle = col.panel;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(fr.sx(c + 0.5), box.y, box.x + box.w - fr.sx(c + 0.5), box.h);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = col.accent;
      ctx.beginPath();
      ctx.moveTo(fr.sx(c), box.y);
      ctx.lineTo(fr.sx(c), box.y + box.h);
      ctx.stroke();
      ctx.restore();
    }

    function drawAll() {
      const sc = scores(S.recs);
      if (pN.open) drawReadout();
      if (pX.open) drawTraces(sc);
      if (pP.open) drawProfiles();
      if (pO.open) drawOps();
      if (pR.open) {
        drawReward(sc);
        drawRewardArea(sc);
      }
      drawScores(sc);
      if (pK.open) {
        updateKnobBanner();
        drawKnobStrips();
      } else syncSide();
      drawSpark();
      if (popQ) drawPop();
      drawTimeline();
      if (pM.open) drawMaps();
      if (pB.open) drawBalance();
      drawNarration();
      drawSums(sc);
      tSl.input.max = HOR();
      tSl.set(S.cursor);
    }
    // one line for each folded panel
    function drawSums(sc) {
      const d = S.recs[S.cursor] || S.recs[0];
      if (!d) return;
      const f = (v, n) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(n));
      const SUM = new Map([
        [pT, () => `t = ${d.t} s · ${statusAt(d).text.toLowerCase()}`],
        [pN, () => `t = ${d.t} s · I_p ${f(d.Ip, 2)} MA · T_e(0) ${f(d.Te0, 1)} keV · Q ${f(d.Q, 2)}`],
        [pK, () => `I_p ${f(d.Ip, 2)} MA · NBI ${f(d.Pnbi, 1)} MW · ECRH ${f(d.Pecrh, 1)} MW`],
        [pX, () => `q_min ${f(d.qmin, 2)} · f_GW ${f(d.fgw, 2)} · Q ${f(d.Q, 2)}`],
        [pP, () => `q_min ${f(d.qmin, 2)} · q95 ${f(d.q95, 2)} · T_e(0) ${f(d.Te0, 1)} keV`],
        [pO, () => `f_GW ${f(d.fgw, 2)} · 1/q95 ${f(1 / d.q95, 2)} · β_N ${f(d.betaN, 2)}`],
        [pM, () => "T_e, j, q and n_e over the whole episode"],
        [pB, () => `P_NBI + P_ECRH ${f(d.Pnbi + d.Pecrh, 0)} MW · bootstrap ${f(d.Ibs, 2)} MA`],
        [pR, () => SLOTS().map(([k, lab]) => `${lab} ${sc[k].ret.toFixed(2)}`).join(" · ")],
        [pA, () => (asModified() ? "modified: not the calibrated plasma" : "calibrated to TORAX")],
        [pDz, () => `custom return ${sc.c.ret.toFixed(2)}`],
      ]);
      for (const [P, fn] of SUM) P.sum.textContent = P.open ? "" : fn();
    }

    function fitAll() {
      [tv, hsv, kv, ks, sv, tl, mv, bv, ra, xv, pv, ov, rv, nv].forEach((c) => c.fit());
      S.dirty = true;
    }

    // ------------------------------------------------ main loop (pauses when off-screen)
    let visible = true, acc = 0, lastTs = 0, frameNo = 0;
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
        if (S.cursor !== lastCur) noteCrossing();
        frameNo++;
        if (root.classList.contains("lab-small")) {
          // inline on a phone: only the preview, a frame from the episode (the flat-top once played to it), at 15 fps
          if (lVisible && frameNo % 4 === 0) {
            const at = S.cursor > 0 ? S.cursor : Math.min(110, S.recs.length - 1);
            if (lCap.textContent !== `preview at t = ${at} s`) lCap.textContent = `preview at t = ${at} s`;
            drawTorus(lTorus, at, { preview: true, labels: false });
            const st = statusAt(S.recs[at]);
            if (lChip.textContent !== st.text) (lChip.textContent = st.text), (lChip.style.background = chipFill(st.color));
          }
          requestAnimationFrame(frameLoop);
          return;
        }
        // on a phone the plasma and the heating strip redraw at 30 fps, on alternate frames (M13)
        const phone = isFull() && fsMode !== "desk";
        if (phone) pbSync();
        if (pT.open) {
          if (!phone || frameNo % 2 === 0) drawTorus();
          drawHud();
          if (!phone || frameNo % 2 === 1) drawHeatStrip();
        }
        if (pK.open) drawKnobs(dt);
        if (S.dirty) {
          S.dirty = false;
          drawAll();
        }
      }
      requestAnimationFrame(frameLoop);
    }

    // ------------------------------------------------ state from an address (?preset=…&t=…): at boot and from links
    const LAB_PARAMS = ["preset", "scenario", "t", "live", "threshold", "transport", "tab", "color", "pedestal", "sawtooth", "play", "full"];
    function applyParams(q) {
      let pk = q.get("preset");
      if (!(pk && presetOf(pk) && (presetOf(pk).kind !== "torax" || LAB[pk]))) pk = null;
      // the scenario: ?scenario=physics, or the one the requested preset belongs to
      const scen = q.get("scenario") === "physics" || (pk && presetOf(pk).scen === "physics") ? "physics" : "benchmark";
      setScenario(scen, true); // also hides presets whose recorded episode is not in lab.json
      if (q.get("live") === "1") S.livePref = true;
      const th = +q.get("threshold");
      if (th && scen === "physics") setParam("plhMul", clamp(th, 0.54, 1.85), true);
      load(pk && (presetOf(pk).scen === scen || presetOf(pk).scen === "both") ? pk : scen === "physics" ? "phys_pi" : "pi");
      const t0 = +q.get("t");
      if (t0) S.cursor = clamp(t0, 0, S.recs.length - 1);
      const cb = q.get("color");
      cbBtns[cb && COLOR_BY[cb] ? cb : "Te"].click();
      const tb = q.get("tab");
      tabBtns[tb && TAB_EQ[tb] ? tb : "q"].click();
      const ped = q.get("pedestal");
      if (ped === "power") setPedMode("power");
      if (q.get("sawtooth") === "1") setSaw(true);
      const tm = +q.get("transport");
      if (tm) setParam("transportMul", clamp(tm, 0.5, 2), true);
      if (q.get("play") === "1" && !S.playing) togglePlay();
      fsTab = tb && TAB_EQ[tb] ? "profiles" : null; // ?tab=T: the profiles, the instrument the link is about
      S.dirty = true;
    }

    // ------------------------------------------------ boot
    Promise.all([getJSON("lab"), getJSON("profiles").catch(() => ({}))]).then(([L, P]) => {
      LAB = L;
      PROF = P;
      applyParams(params);
      FOLDS.forEach((P) => store.get("fold-" + P.id, true) === false && P.set(false));
      setNumView(numView);
      applyMode();
      // ?full=1, or on a phone any Lab state in the address (a link from another page): open the Lab directly
      if (params.get("full") === "1" || (SMALL() && LAB_PARAMS.some((k) => params.has(k)))) fsEnter();
      S.dirty = true;
      requestAnimationFrame(frameLoop);
    });
    // links in the page that open the Lab in a state (the guided experiments) apply it without reloading (M11)
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || root.contains(a)) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || u.pathname !== location.pathname || !LAB_PARAMS.some((k) => u.searchParams.has(k)) || !Object.keys(LAB).length) return;
      e.preventDefault();
      if (isFull()) fsExit(true);
      applyParams(u.searchParams);
      if (SMALL()) fsEnter();
      else root.scrollIntoView({ behavior: "smooth", block: "start" });
      if (u.searchParams.get("full") === "1" && !isFull()) fsEnter();
    });
    return {
      redraw: () => (S.dirty = true),
      resize: () => (isFull() ? fsFit() : fitAll()),
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
      // side by side, or stacked on a narrow screen; the curve labels sit in a legend above the left plot
      const narrow = cv.w < 560;
      const [b1, b2] = RT.grid(cv, 2, { pad: 50, gap: 60, h0: 300, hStack: 180, top: narrow ? 76 : 28 });
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
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
      // clipped to the plot (a small triangle where a curve leaves the top), not flattened along it
      line(ctx, Ts.map((T, i) => [f1.sx(T), f1.sy(loss[i])]), col.series[0], 2.2, null, b1);
      line(ctx, Ts.map((T, i) => [f1.sx(T), f1.sy(heat[i])]), col.series[1], 2.2, null, b1);
      line(ctx, Ts.map((T, i) => [f1.sx(T), f1.sy(alpha[i])]), col.series[1], 1.2, [4, 4], b1);
      const legItems = [{ label: "losses W/τ_E (IPB98 × H)", color: col.series[0] }, { label: "heating P_aux + P_α + P_ohm − P_rad", color: col.series[1] }, { label: "P_α", color: col.series[1], dash: [4, 4] }];
      if (narrow) legend(ctx, col, legItems, b1.x, 6, b1.w);
      else legend(ctx, col, legItems, b1.x + 6, b1.y + 2, b1.w - 12);
      ctx.font = FONT_SMALL;
      ctx.fillStyle = col.muted;
      if (!narrow) ctx.fillText("the hot branch, approached from above", b2.x + 6, b2.y + 12);
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
        QQ.push(o ? (5.03 * o.Pa) / (P + o.Pohm) : NaN); // no hot equilibrium: a gap in the curve
      }
      const f2 = frame(ctx, col, b2, [0, 120], [0.01, 1000], { title: "fusion gain Q = P_fus/(P_aux + P_ohm), log", short: "fusion gain Q (log)", xlabel: "P_aux [MW]", logy: true, yticks: [0.01, 0.1, 1, 10, 100, 1000] });
      line(ctx, PA.map((P, i) => [f2.sx(P), isFinite(QQ[i]) ? f2.sy(clamp(QQ[i], 0.01, 1000)) : NaN]), col.accent, 2.2, null, b2);
      hline(ctx, b2, f2.sy(10), col.muted, "ITER goal Q = 10", true);
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
      // the theme's series colours first; red is kept for the limits
      const PAL = () => colors().series.concat(isDark() ? ["#a58af0", "#ff5fb8", "#3cc0d6", "#c7b27a", "#9aa0a6"] : ["#8f5fd6", "#d6368f", "#00a3a3", "#7a6a3a", "#6b7280"]);
      const colorOf = (k) => PAL()[keys.indexOf(k) % PAL().length];
      let ti = 150;
      keys.forEach((k) => chip(chips, E[k].label, colorOf(k), !!on[k], (v) => ((on[k] = v), draw())));
      const ts = slider(ctl, "time", 1, 151, 1, 151, (v) => v + " s", (v) => ((ti = v - 1), draw()));
      const pl = player((dt) => {
        ti = Math.min(150, ti + Math.max(1, Math.round(dt / 50)));
        ts.set(ti + 1);
        draw();
        if (ti >= 150) {
          playBtn.textContent = "Replay";
          return false;
        }
      });
      const playBtn = button(ctl, "Play", () => {
        if (pl.running) {
          pl.pause();
          playBtn.textContent = "Play";
          return;
        }
        if (ti >= 150) ti = 0;
        pl.play();
        playBtn.textContent = "Pause";
      }, "rt-primary");
      // hover a trajectory: the nearest point's episode, time and coordinates
      let opHover = null;
      cv.c.addEventListener("pointermove", (e) => {
        if (!cv.fr) return;
        const r = cv.c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        let best = null;
        keys.forEach((k) => {
          if (!on[k]) return;
          const ep = E[k], upto = Math.min(ti + 1, ep.t.length);
          for (let i = 0; i < upto; i++) {
            const d = Math.hypot(cv.fr.sx(clamp(ep.fgw[i], 0, 1.5)) - x, cv.fr.sy(clamp(1 / ep.q95[i], 0, 0.6)) - y);
            if (d < 12 && (!best || d < best.d)) best = { d, k, i };
          }
        });
        opHover = best;
        if (!best) return cv.hideTip(), draw();
        const ep = E[best.k];
        cv.showTip(x, y, `<span class="rt-swatch" style="background:${colorOf(best.k)}"></span><b>${ep.label}</b>, t = ${ep.t[best.i]} s<br>f_GW <b>${ep.fgw[best.i].toFixed(2)}</b> · q95 <b>${ep.q95[best.i].toFixed(2)}</b> (1/q95 ${(1 / ep.q95[best.i]).toFixed(2)})`);
        draw();
      });
      cv.c.addEventListener("pointerleave", () => ((opHover = null), cv.hideTip(), draw()));
      function draw() {
        const col = colors();
        const { ctx, w, h } = cv;
        ctx.clearRect(0, 0, w, h);
        const box = { x: 50, y: 26, w: w - 66, h: h - 68 };
        const fr = frame(ctx, col, box, [0, 1.5], [0, 0.6], { title: "1/q95 against Greenwald fraction, TORAX episodes", short: "1/q95 vs f_GW, TORAX", xlabel: "Greenwald fraction f_GW" });
        cv.fr = fr;
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
          line(ctx, pts, colorOf(k), opHover && opHover.k === k ? 3.2 : 2);
          if (opHover && opHover.k === k && pts[opHover.i]) {
            ctx.strokeStyle = colorOf(k);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pts[opHover.i][0], pts[opHover.i][1], 6, 0, 2 * Math.PI);
            ctx.stroke();
          }
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
