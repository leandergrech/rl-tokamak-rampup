/* Interactive figures for the rl-tokamak-rampup docs.
 * Each <div class="rt-widget" data-widget="NAME"></div> is replaced by a small canvas app.
 * No dependencies. Data comes from docs/assets/widgets/*.json (scripts/make_widget_data.py).
 * Colours follow the page theme (light / dark) and the categorical palette used by the figures. */
(function () {
  "use strict";
  const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;
  const DATA_BASE = new URL("../assets/widgets/", SCRIPT_URL);
  const jsonCache = {};
  const getJSON = (name) =>
    (jsonCache[name] = jsonCache[name] || fetch(new URL(name + ".json", DATA_BASE)).then((r) => r.json()));

  // ------------------------------------------------------------------ theme
  const isDark = () => document.body.getAttribute("data-md-color-scheme") === "slate";
  function colors() {
    const dark = isDark();
    return {
      fg: dark ? "#e8e4ff" : "#1b1633",
      muted: dark ? "#b6aee0" : "#4a4466",
      grid: dark ? "rgba(200,190,255,0.13)" : "rgba(60,40,120,0.10)",
      panel: dark ? "#17132b" : "#ffffff",
      accent: dark ? "#ff5fb8" : "#d6368f",
      series: dark ? ["#3987e5", "#d95926", "#199e70", "#c98500"] : ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
      bad: dark ? "#e66767" : "#e34948",
    };
  }
  const FONT = '12px Inter, "Helvetica Neue", Arial, sans-serif';
  const FONT_SMALL = '11px Inter, "Helvetica Neue", Arial, sans-serif';

  // ------------------------------------------------------------------ dom helpers
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function controls(root) {
    const c = el("div", "rt-controls");
    root.appendChild(c);
    return c;
  }
  function slider(parent, label, min, max, step, value, fmt, onInput) {
    const wrap = el("label", "rt-ctl");
    wrap.appendChild(el("span", "rt-ctl-label", label));
    const inp = document.createElement("input");
    Object.assign(inp, { type: "range", min, max, step, value });
    const out = el("span", "rt-ctl-val", fmt(+value));
    inp.addEventListener("input", () => {
      out.textContent = fmt(+inp.value);
      onInput(+inp.value);
    });
    wrap.append(inp, out);
    parent.appendChild(wrap);
    return {
      input: inp,
      set(v) {
        inp.value = v;
        out.textContent = fmt(+v);
      },
    };
  }
  function button(parent, text, onClick, cls) {
    const b = el("button", "rt-btn" + (cls ? " " + cls : ""), text);
    b.type = "button";
    b.addEventListener("click", onClick);
    parent.appendChild(b);
    return b;
  }
  function chip(parent, text, color, on, onToggle) {
    const b = el("button", "rt-chip" + (on ? " on" : ""));
    b.type = "button";
    b.innerHTML = `<span class="rt-swatch" style="background:${color}"></span>${text}`;
    b.addEventListener("click", () => {
      b.classList.toggle("on");
      onToggle(b.classList.contains("on"));
    });
    parent.appendChild(b);
    return b;
  }
  function note(root, html) {
    const n = el("div", "rt-note", html);
    root.appendChild(n);
    return n;
  }

  // ------------------------------------------------------------------ canvas helpers
  function canvas(root, height) {
    const holder = el("div", "rt-canvas-wrap");
    const c = el("canvas", "rt-canvas");
    const tip = el("div", "rt-tip");
    holder.append(c, tip);
    root.appendChild(holder);
    const st = { c, tip, w: 0, h: height, ctx: c.getContext("2d") };
    st.fit = () => {
      const w = Math.max(280, holder.clientWidth);
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(w * dpr);
      c.height = Math.round(height * dpr);
      c.style.width = w + "px";
      c.style.height = height + "px";
      st.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.w = w;
      return st;
    };
    st.showTip = (x, y, html) => {
      tip.innerHTML = html;
      tip.style.display = "block";
      const tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(4, x + 14), st.w - tw - 4) + "px";
      tip.style.top = Math.max(4, y - 10) + "px";
    };
    st.hideTip = () => (tip.style.display = "none");
    return st.fit();
  }
  function niceStep(span, n) {
    const raw = span / n;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function fmtNum(v) {
    const a = Math.abs(v);
    if (a === 0) return "0";
    if (a >= 1000) return v.toFixed(0);
    if (a >= 10) return v.toFixed(0);
    if (a >= 1) return v.toFixed(1).replace(/\.0$/, "");
    if (a >= 0.1) return v.toFixed(2).replace(/0$/, "");
    return v.toPrecision(1);
  }
  // Draws axes into box and returns scale functions. o: {xlabel, ylabel, title, logx, logy, xticks}
  function frame(ctx, col, box, xr, yr, o) {
    o = o || {};
    const tx = o.logx ? Math.log10 : (v) => v;
    const ty = o.logy ? Math.log10 : (v) => v;
    const sx = (v) => box.x + ((tx(v) - tx(xr[0])) / (tx(xr[1]) - tx(xr[0]))) * box.w;
    const sy = (v) => box.y + box.h - ((ty(v) - ty(yr[0])) / (ty(yr[1]) - ty(yr[0]))) * box.h;
    const ticks = (r, log, n) => {
      if (log) {
        const out = [];
        const decades = Math.log10(r[1] / r[0]);
        const mults = decades >= 2.5 ? [1] : [1, 2, 5];
        for (let e = Math.floor(Math.log10(r[0])); e <= Math.ceil(Math.log10(r[1])); e++)
          for (const m of mults) {
            const v = m * Math.pow(10, e);
            if (v >= r[0] * 0.999 && v <= r[1] * 1.001) out.push(v);
          }
        return out;
      }
      const s = niceStep(r[1] - r[0], n);
      const out = [];
      for (let v = Math.ceil(r[0] / s) * s; v <= r[1] + 1e-9; v += s) out.push(+v.toFixed(10));
      return out;
    };
    ctx.save();
    ctx.font = FONT_SMALL;
    ctx.lineWidth = 1;
    ctx.strokeStyle = col.grid;
    ctx.fillStyle = col.muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const v of o.yticks || ticks(yr, o.logy, Math.max(2, Math.round(box.h / 38)))) {
      const y = sy(v);
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
      ctx.fillText(fmtNum(v), box.x - 5, y);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const v of o.xticks || ticks(xr, o.logx, Math.max(2, Math.round(box.w / 70)))) {
      const x = sx(v);
      ctx.beginPath();
      ctx.moveTo(x, box.y);
      ctx.lineTo(x, box.y + box.h);
      ctx.stroke();
      if (!o.noXLabels) ctx.fillText(fmtNum(v), x, box.y + box.h + 4);
    }
    ctx.strokeStyle = col.muted;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();
    if (o.xlabel) {
      ctx.fillStyle = col.muted;
      ctx.fillText(o.xlabel, box.x + box.w / 2, box.y + box.h + 18);
    }
    if (o.title) {
      ctx.fillStyle = col.fg;
      ctx.font = FONT;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(o.title, box.x, box.y - 6);
    }
    ctx.restore();
    return { sx, sy, inside: (x, y) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h };
  }
  function line(ctx, pts, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.lineJoin = "round";
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    let started = false;
    for (const [x, y] of pts) {
      if (!isFinite(x) || !isFinite(y)) {
        started = false;
        continue;
      }
      started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      started = true;
    }
    ctx.stroke();
    ctx.restore();
  }
  function hline(ctx, box, y, color, label, left) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.w, y);
    ctx.stroke();
    if (label) {
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = FONT_SMALL;
      ctx.textAlign = left ? "left" : "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, left ? box.x + 4 : box.x + box.w - 2, y - 2);
    }
    ctx.restore();
  }
  // play loop helper: calls step(dt_ms) until it returns false or paused
  function player(onFrame) {
    let running = false,
      last = 0;
    const loop = (ts) => {
      if (!running) return;
      const dt = last ? ts - last : 16;
      last = ts;
      if (onFrame(dt) === false) running = false;
      if (running) requestAnimationFrame(loop);
    };
    return {
      play() {
        if (!running) {
          running = true;
          last = 0;
          requestAnimationFrame(loop);
        }
      },
      pause() {
        running = false;
      },
      get running() {
        return running;
      },
    };
  }

  // ================================================================== 1. safety factor q
  function wQ(root) {
    const col0 = colors();
    const ctl = controls(root);
    let q = 2,
      phi = 0;
    const qs = slider(ctl, "safety factor q", 0.5, 4, 0.01, q, (v) => v.toFixed(2), (v) => {
      q = v;
      trail.length = 0;
    });
    for (const [lab, v] of [["q = 1", 1], ["q = 3/2", 1.5], ["q = 2", 2], ["q = 3", 3], ["irrational", Math.PI]]) {
      button(ctl, lab, () => {
        q = v;
        qs.set(v);
        trail.length = 0;
      });
    }
    const playBtn = button(ctl, "Pause", () => {
      p.running ? (p.pause(), (playBtn.textContent = "Play")) : (p.play(), (playBtn.textContent = "Pause"));
    }, "rt-primary");
    const cv = canvas(root, 330);
    note(root,
      "One toroidal turn (the long way round) moves the field line 1/q of a poloidal turn (the short way). " +
        "The right panel marks where the line crosses one poloidal cross-section, once per toroidal turn. " +
        "At rational q = m/n the crossings repeat after m turns: the line closes on itself and the surface is <em>resonant</em>, " +
        "which is where sawteeth (q = 1) and tearing modes (q = 3/2, 2) live. At irrational q the crossings fill the circle.");
    const R0 = 2.0, A = 0.72, tilt = 1.05;
    const trail = [];
    function proj(phiV, th, s, cx, cy) {
      const x = (R0 + A * Math.cos(th)) * Math.cos(phiV);
      const y = (R0 + A * Math.cos(th)) * Math.sin(phiV);
      const z = A * Math.sin(th);
      return [cx + s * x, cy + s * (y * Math.cos(tilt) - z * Math.sin(tilt)), y * Math.sin(tilt) + z * Math.cos(tilt)];
    }
    function draw() {
      const col = colors();
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const lw = w * 0.64;
      const s = Math.min(lw, h * 1.7) / (2 * (R0 + A)) * 0.92;
      const cx = lw / 2, cy = h / 2;
      // torus wireframe
      ctx.lineWidth = 1;
      ctx.strokeStyle = col.grid;
      for (let k = 0; k < 12; k++) {
        const th = (k / 12) * 2 * Math.PI;
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const [X, Y] = proj((i / 80) * 2 * Math.PI, th, s, cx, cy);
          i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.stroke();
      }
      for (let k = 0; k < 16; k++) {
        const ph = (k / 16) * 2 * Math.PI;
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const [X, Y] = proj(ph, (i / 40) * 2 * Math.PI, s, cx, cy);
          i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.stroke();
      }
      // field line: last 4 toroidal turns
      const span = 8 * Math.PI, n = 900;
      for (let i = 1; i <= n; i++) {
        const a0 = phi - span * (1 - (i - 1) / n), a1 = phi - span * (1 - i / n);
        if (a1 < 0) continue;
        const p0 = proj(a0, a0 / q, s, cx, cy), p1 = proj(a1, a1 / q, s, cx, cy);
        const front = (p0[2] + p1[2]) / 2 < 0;
        ctx.strokeStyle = col.series[1];
        ctx.globalAlpha = (front ? 0.95 : 0.3) * (0.25 + 0.75 * (i / n));
        ctx.lineWidth = front ? 2.4 : 1.3;
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const dot = proj(phi, phi / q, s, cx, cy);
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(dot[0], dot[1], 5, 0, 2 * Math.PI);
      ctx.fill();
      // poloidal cross-section with crossing points
      const pcx = lw + (w - lw) / 2, pcy = h / 2 + 8, pr = Math.min((w - lw) / 2 - 18, h / 2 - 40);
      ctx.strokeStyle = col.muted;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(pcx, pcy, pr, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col.fg;
      ctx.font = FONT;
      ctx.textAlign = "center";
      ctx.fillText("poloidal cross-section", pcx, pcy - pr - 14);
      trail.forEach((th, i) => {
        ctx.fillStyle = col.series[0];
        ctx.globalAlpha = 0.35 + 0.65 * ((i + 1) / trail.length);
        ctx.beginPath();
        ctx.arc(pcx + pr * Math.cos(th), pcy - pr * Math.sin(th), 4, 0, 2 * Math.PI);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      const th = phi / q;
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(pcx + pr * Math.cos(th), pcy - pr * Math.sin(th), 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = col.muted;
      ctx.font = FONT_SMALL;
      ctx.textAlign = "left";
      ctx.fillText(`toroidal turns: ${(phi / (2 * Math.PI)).toFixed(1)}`, 8, 18);
      ctx.fillText(`poloidal turns: ${(phi / (2 * Math.PI * q)).toFixed(2)}`, 8, 34);
    }
    const p = player((dt) => {
      const before = Math.floor(phi / (2 * Math.PI));
      phi += dt * 0.0035;
      if (Math.floor(phi / (2 * Math.PI)) > before) {
        trail.push((Math.floor(phi / (2 * Math.PI)) * 2 * Math.PI) / q);
        if (trail.length > 40) trail.shift();
      }
      draw();
    });
    p.play();
    return { redraw: draw, resize: () => (cv.fit(), draw()) };
  }

  // ================================================================== 2. current diffusion (toy)
  function wDiffusion(root) {
    const ctl = controls(root);
    let ramp = 0.2, T0 = 2.0, t = 0;
    const MU0 = 4e-7 * Math.PI, a = 2.0, R = 6.2, B = 5.3, N = 60, dr = a / N;
    // Shaping factor rising from 1 on axis to 2.9 at the edge: matches TORAX's PI run on axis (j0 = 3.0 MA/m2 <-> q0 = 0.41)
    // and at the edge (q95 = 3.3 at 15 MA). A cylinder alone would put q95 near 1.1.
    const SHAPE = (x) => 1 + 1.9 * (x / a) ** 2;
    const lnL = 17, Zeff = 2, Tedge = 0.2;
    let I = new Float64Array(N + 1), I0 = new Float64Array(N + 1), qmin1 = null;
    const r = Array.from({ length: N + 1 }, (_, i) => i * dr);
    const Te = (x) => Tedge + (T0 - Tedge) * Math.pow(Math.max(0, 1 - (x / a) ** 2), 1.5);
    const eta = (T) => (1.65e-9 * lnL * Zeff) / Math.pow(T, 1.5);
    const Ip = (tt) => Math.min(15e6, 3e6 + ramp * 1e6 * tt);
    function reset() {
      t = 0;
      qmin1 = null;
      for (let i = 0; i <= N; i++) I[i] = 3e6 * (1 - Math.pow(1 - (r[i] / a) ** 2, 3));
      I0 = I.slice();
      draw();
    }
    function step(dt) {
      // backward Euler for dI/dt = r d/dr( (D/r) dI/dr ),  D = eta/mu0;  I(0)=0, I(a)=Ip(t)
      const g = (rr) => eta(Te(rr)) / MU0 / Math.max(rr, dr / 2);
      const n = N - 1, A = new Float64Array(n), Bd = new Float64Array(n), C = new Float64Array(n), d = new Float64Array(n);
      const IpNew = Ip(t + dt);
      for (let k = 0; k < n; k++) {
        const i = k + 1, gm = g(r[i] - dr / 2), gp = g(r[i] + dr / 2), f = (dt * r[i]) / (dr * dr);
        A[k] = -f * gm;
        C[k] = -f * gp;
        Bd[k] = 1 + f * (gm + gp);
        d[k] = I[i];
        if (i === N - 1) d[k] -= C[k] * IpNew;
      }
      for (let k = 1; k < n; k++) {
        const m = A[k] / Bd[k - 1];
        Bd[k] -= m * C[k - 1];
        d[k] -= m * d[k - 1];
      }
      const x = new Float64Array(n);
      x[n - 1] = d[n - 1] / Bd[n - 1];
      for (let k = n - 2; k >= 0; k--) x[k] = (d[k] - C[k] * x[k + 1]) / Bd[k];
      I[0] = 0;
      for (let k = 0; k < n; k++) I[k + 1] = x[k];
      I[N] = IpNew;
      t += dt;
    }
    const jOf = (arr) =>
      r.map((rr, i) =>
        i === 0 ? arr[1] / (Math.PI * dr * dr) / 1e6 : (i === N ? (arr[N] - arr[N - 1]) / dr : (arr[i + 1] - arr[i - 1]) / (2 * dr)) / (2 * Math.PI * rr) / 1e6
      );
    const qOf = (arr) => {
      const j = jOf(arr);
      return r.map((rr, i) => (i === 0 ? (SHAPE(0) * 2 * B) / (MU0 * R * j[0] * 1e6) : (SHAPE(rr) * 2 * Math.PI * rr * rr * B) / (MU0 * R * arr[i])));
    };
    slider(ctl, "I_p ramp rate", 0.05, 0.2, 0.01, ramp, (v) => v.toFixed(2) + " MA/s", (v) => ((ramp = v), reset()));
    slider(ctl, "core T_e (heating)", 0.5, 8, 0.1, T0, (v) => v.toFixed(1) + " keV", (v) => ((T0 = v), reset()));
    const playBtn = button(ctl, "Play", () => {
      if (t >= 150) reset();
      p.running ? (p.pause(), (playBtn.textContent = "Play")) : (p.play(), (playBtn.textContent = "Pause"));
    }, "rt-primary");
    button(ctl, "Reset", () => {
      p.pause();
      playBtn.textContent = "Play";
      reset();
    });
    const cv = canvas(root, 300);
    const info = note(root, "");
    function draw() {
      const col = colors();
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const pad = 46, gap = 56, pw = (w - 2 * pad - gap) / 2;
      const j = jOf(I), j0 = jOf(I0), q = qOf(I), q0 = qOf(I0);
      const jmax = Math.max(1, ...j.slice(1, N), ...j0) * 1.15;
      const b1 = { x: pad, y: 26, w: pw, h: h - 70 }, b2 = { x: pad + pw + gap, y: 26, w: pw, h: h - 70 };
      const f1 = frame(ctx, col, b1, [0, 1], [0, jmax], { title: "current density j  [MA/m²]", xlabel: "r / a" });
      line(ctx, r.map((rr, i) => [f1.sx(rr / a), f1.sy(j0[i])]), col.muted, 1.2, [3, 3]);
      line(ctx, r.map((rr, i) => [f1.sx(rr / a), f1.sy(j[i])]), col.series[0], 2.4);
      const f2 = frame(ctx, col, b2, [0, 1], [0, 6], { title: "safety factor q", xlabel: "r / a" });
      hline(ctx, b2, f2.sy(1), col.bad, "q = 1");
      line(ctx, r.map((rr, i) => [f2.sx(rr / a), f2.sy(Math.min(6.2, q0[i]))]), col.muted, 1.2, [3, 3]);
      line(ctx, r.map((rr, i) => [f2.sx(rr / a), f2.sy(Math.min(6.2, q[i]))]), col.series[1], 2.4);
      const qm = Math.min(...q);
      if (qm < 1 && qmin1 === null) qmin1 = t;
      const tauR = (MU0 * a * a) / eta(T0);
      info.innerHTML =
        `t = <b>${t.toFixed(0)} s</b>, I_p = <b>${(Ip(t) / 1e6).toFixed(1)} MA</b>, q_min = <b>${qm.toFixed(2)}</b>` +
        (qmin1 !== null ? ` (below 1 since t = ${qmin1.toFixed(0)} s)` : "") +
        `. Resistive time at the core temperature, μ₀a²/η ≈ <b>${tauR.toFixed(0)} s</b>. Dashed: t = 0. ` +
        `<span class="rt-dim">Toy cylindrical model: textbook Spitzer resistivity (unverified here), fixed temperature profile, ` +
        `shaping factor 1 on axis to 2.9 at the edge, tuned to TORAX's PI run. The real TORAX profiles are in the next animation.</span>`;
    }
    const p = player((dt) => {
      for (let k = 0; k < 2; k++) if (t < 150) step(0.5);
      draw();
      if (t >= 150) {
        playBtn.textContent = "Replay";
        return false;
      }
    });
    reset();
    return { redraw: draw, resize: () => (cv.fit(), draw()) };
  }

  // ================================================================== 3. TORAX profiles (real data)
  function wProfiles(root) {
    const ctl = controls(root);
    const chips = controls(root);
    const cv = canvas(root, 300);
    const info = note(root, "Loading TORAX data…");
    Promise.all([getJSON("profiles"), getJSON("episodes")]).then(([P, E]) => {
      const keys = ["pi", "open_loop", "heating_cut"].filter((k) => P[k]);
      const on = Object.fromEntries(keys.map((k) => [k, true]));
      let ti = 0;
      const n = P[keys[0]].t.length;
      const ts = slider(ctl, "time", 1, n, 1, 1, (v) => v + " s", (v) => ((ti = v - 1), draw()));
      const playBtn = button(ctl, "Play", () => {
        if (ti >= n - 1) ti = 0;
        p.running ? (p.pause(), (playBtn.textContent = "Play")) : (p.play(), (playBtn.textContent = "Pause"));
      }, "rt-primary");
      keys.forEach((k, i) => chip(chips, E[k] ? E[k].label : k, colors().series[i], true, (v) => ((on[k] = v), draw())));
      let hoverRho = null;
      function draw() {
        const col = colors();
        const { ctx, w, h } = cv;
        ctx.clearRect(0, 0, w, h);
        const pad = 42, gap = 44, pw = (w - 2 * pad - 2 * gap) / 3;
        const panels = [
          ["T_e", "electron temperature  [keV]", [0, 30]],
          ["j_total", "current density  [MA/m²]", [0, 3.5]],
          ["q", "safety factor q", [0, 6]],
        ];
        const scales = [];
        panels.forEach(([f, title, yr], pi) => {
          const box = { x: pad + pi * (pw + gap), y: 26, w: pw, h: h - 70 };
          const fr = frame(ctx, col, box, [0, 1], yr, { title, xlabel: "ρ̂" });
          scales.push([box, fr, f]);
          if (f === "q") hline(ctx, box, fr.sy(1), col.bad, "q = 1");
          if (f === "T_e") hline(ctx, box, fr.sy(10), col.muted, "10 keV");
          keys.forEach((k, i) => {
            if (!on[k]) return;
            const prof = P[k][f][Math.min(ti, P[k][f].length - 1)];
            const m = prof.length;
            line(ctx, prof.map((v, ii) => [fr.sx(ii / (m - 1)), fr.sy(Math.min(v, yr[1] * 1.05))]), col.series[i], 2.2);
          });
          if (hoverRho !== null) {
            ctx.save();
            ctx.strokeStyle = col.muted;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(fr.sx(hoverRho), box.y);
            ctx.lineTo(fr.sx(hoverRho), box.y + box.h);
            ctx.stroke();
            ctx.restore();
          }
        });
        cv.scales = scales;
        const t = ti + 1;
        info.innerHTML =
          `TORAX 1.0.3 profiles at <b>t = ${t} s</b> (gymtorax 1.0.0). ` +
          keys
            .filter((k) => on[k] && E[k])
            .map((k) => `${E[k].label}: I_p ${E[k].Ip[ti].toFixed(1)} MA, heating ${E[k].Paux[ti].toFixed(0)} MW, Q ${E[k].Q[ti].toFixed(1)}`)
            .join(" · ") +
          `. <span class="rt-dim">Pedestal schedule: 0.5 keV until 100 s, rising to 3 keV at 105 s.</span>`;
      }
      cv.c.addEventListener("mousemove", (ev) => {
        const rect = cv.c.getBoundingClientRect();
        const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
        const hit = (cv.scales || []).find(([b]) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
        if (!hit) {
          hoverRho = null;
          cv.hideTip();
          return draw();
        }
        const [b, , f] = hit;
        hoverRho = (x - b.x) / b.w;
        const rows = keys
          .filter((k) => on[k])
          .map((k, i) => {
            const prof = P[k][f][ti];
            const v = prof[Math.round(hoverRho * (prof.length - 1))];
            return `<span class="rt-swatch" style="background:${colors().series[keys.indexOf(k)]}"></span>${E[k] ? E[k].label : k}: <b>${v.toFixed(2)}</b>`;
          });
        cv.showTip(x, y, `ρ̂ = ${hoverRho.toFixed(2)}<br>${rows.join("<br>")}`);
        draw();
      });
      cv.c.addEventListener("mouseleave", () => ((hoverRho = null), cv.hideTip(), draw()));
      const p = player((dt) => {
        ti = Math.min(n - 1, ti + Math.max(1, Math.round(dt / 60)));
        ts.set(ti + 1);
        draw();
        if (ti >= n - 1) {
          playBtn.textContent = "Replay";
          return false;
        }
      });
      draw();
      root._redraw = draw;
    });
    return { redraw: () => root._redraw && root._redraw(), resize: () => (cv.fit(), root._redraw && root._redraw()) };
  }

  // ================================================================== 4. reward explorer
  function wReward(root) {
    const ctl = controls(root);
    const pre = controls(root);
    const cv = canvas(root, 190);
    const info = note(root, "");
    const s = { logQ: 1, H98: 0.9, qmin: 0.8, q95: 3.3, T: 20, ratio: 2 };
    const terms = (Q, h98, qmin, q95, hmode) => [
      ((hmode ? Q / 10 : 0) / 50),
      ((hmode ? Math.min(h98, 1) : 0) / 50),
      Math.min(qmin, 1) / 150,
      Math.min(q95 / 3, 1) / 150,
    ];
    const sl = {
      logQ: slider(ctl, "fusion gain Q", -1, 2.5, 0.01, s.logQ, (v) => Math.pow(10, v).toFixed(v < 0 ? 2 : 1), (v) => ((s.logQ = v), draw())),
      H98: slider(ctl, "H98", 0, 2.5, 0.01, s.H98, (v) => v.toFixed(2), (v) => ((s.H98 = v), draw())),
      qmin: slider(ctl, "q_min", 0, 3, 0.01, s.qmin, (v) => v.toFixed(2), (v) => ((s.qmin = v), draw())),
      q95: slider(ctl, "q95", 1, 8, 0.01, s.q95, (v) => v.toFixed(2), (v) => ((s.q95 = v), draw())),
      T: slider(ctl, "core T_e = T_i", 0, 35, 0.1, s.T, (v) => v.toFixed(1) + " keV", (v) => ((s.T = v), draw())),
      ratio: slider(ctl, "P_SOL / P_LH", 0, 3, 0.01, s.ratio, (v) => v.toFixed(2), (v) => ((s.ratio = v), draw())),
    };
    getJSON("episodes").then((E) => {
      const at = (k, t) => {
        const e = E[k];
        const i = e.t.indexOf(t);
        return { logQ: Math.log10(Math.max(0.1, e.Q[i])), H98: e.H98[i], qmin: e.qmin[i], q95: e.q95[i], T: Math.min(e.Te0[i], e.Ti0[i]), ratio: e.psol_plh[i] };
      };
      for (const [k, lab] of [["pi", "PI at t = 140 s"], ["heating_cut", "heating cut at t = 140 s"], ["ppo_s1", "PPO seed 1 at t = 140 s"], ["pi", "PI at t = 50 s"]]) {
        if (!E[k]) continue;
        const t = lab.includes("50") ? 50 : 140;
        button(pre, lab, () => {
          Object.assign(s, at(k, t));
          for (const key in sl) sl[key].set(s[key]);
          draw();
        });
      }
    });
    const names = ["fusion gain (gated)", "H98 (gated)", "q_min", "q95"];
    function draw() {
      const col = colors();
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const Q = Math.pow(10, s.logQ);
      const hot = s.T > 10;
      const v0 = terms(Q, s.H98, s.qmin, s.q95, hot);
      const va = terms(Math.min(Q, 10), s.H98, s.qmin, s.q95, hot && s.ratio >= 1);
      const tot0 = v0.reduce((a, b) => a + b, 0), tota = va.reduce((a, b) => a + b, 0);
      const xmax = Math.max(0.1, tot0 * 1.15);
      const box = { x: 130, y: 30, w: w - 230, h: 110 };
      const fr = frame(ctx, col, box, [0, xmax], [0, 2], { xlabel: "reward for this one second", yticks: [] });
      [["IterHybrid-v0", v0, tot0, hot], ["audited", va, tota, hot && s.ratio >= 1]].forEach(([lab, v, tot, hm], row) => {
        const y = box.y + 14 + row * 52;
        let x0 = 0;
        v.forEach((val, k) => {
          ctx.fillStyle = col.series[k];
          const xa = fr.sx(x0), xb = fr.sx(x0 + val);
          ctx.fillRect(xa, y, Math.max(0, xb - xa - 2), 30);
          x0 += val;
        });
        ctx.fillStyle = col.fg;
        ctx.font = FONT;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(lab, box.x - 10, y + 15);
        ctx.textAlign = "left";
        ctx.fillText(`${tot.toFixed(4)}  (${hm ? "H-mode" : "not H-mode"})`, fr.sx(x0) + 6, y + 15);
      });
      ctx.font = FONT_SMALL;
      let lx = box.x;
      names.forEach((nm, k) => {
        ctx.fillStyle = col.series[k];
        ctx.fillRect(lx, 8, 10, 10);
        ctx.fillStyle = col.muted;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(nm, lx + 14, 13);
        lx += ctx.measureText(nm).width + 34;
      });
      const per = (x) => (x * 45).toFixed(2);
      info.innerHTML =
        `Over a 45 s flat-top at these values: <b>${per(tot0)}</b> (IterHybrid-v0) vs <b>${per(tota)}</b> (audited); ` +
        `the PI controller's whole episode is worth 3.79. The fusion-gain term pays Q/10/50 per second with no cap, ` +
        `and Q = P_fus / P_aux grows without bound as the heating P_aux goes to zero. The audited score caps Q at 10 and only counts ` +
        `H-mode while P_SOL ≥ P_LH. Move Q to 100+ and P_SOL/P_LH below 1 to see the loophole.`;
    }
    draw();
    return { redraw: draw, resize: () => (cv.fit(), draw()) };
  }

  // ================================================================== 5. episode replay
  function wReplay(root) {
    const ctl = controls(root);
    const chips = controls(root);
    const cv = canvas(root, 520);
    const info = note(root, "Loading episodes…");
    getJSON("episodes").then((E) => {
      const keys = Object.keys(E);
      const sel = (root.dataset.select ? root.dataset.select.split(",") : ["pi", "heating_cut", "ppo_s1", "td3bc"]).filter((k) => E[k]);
      let ti = 150, hoverT = null;
      const n = Math.max(...keys.map((k) => E[k].t.length));
      const tsl = slider(ctl, "time", 1, n, 1, n, (v) => v + " s", (v) => ((ti = v - 1), draw()));
      const playBtn = button(ctl, "Play", () => {
        if (ti >= n - 1) ti = 0;
        p.running ? (p.pause(), (playBtn.textContent = "Play")) : (p.play(), (playBtn.textContent = "Pause"));
      }, "rt-primary");
      const chipEls = {};
      const colorOf = (k) => colors().series[sel.indexOf(k)] || colors().muted;
      function refreshChips() {
        for (const k of keys) {
          const b = chipEls[k];
          const on = sel.includes(k);
          b.classList.toggle("on", on);
          b.querySelector(".rt-swatch").style.background = on ? colorOf(k) : "transparent";
        }
      }
      keys.forEach((k) => {
        chipEls[k] = chip(chips, `${E[k].label} (${E[k].benchmark.toFixed(2)} / ${E[k].audited.toFixed(2)})`, "transparent", false, (on) => {
          if (on && !sel.includes(k)) {
            if (sel.length >= 4) sel.shift();
            sel.push(k);
          } else if (!on) sel.splice(sel.indexOf(k), 1);
          refreshChips();
          draw();
        });
      });
      refreshChips();
      const cum = (arr) => {
        let s = 0;
        return arr.map((v) => (s += v));
      };
      const panels = [
        ["Ip", "plasma current I_p  [MA]", [0, 16], false],
        ["Paux", "auxiliary heating P_NBI + P_ECRH  [MW]", [0, 55], false],
        ["Q", "fusion gain Q = P_fus / P_aux (log)", [0.01, 1000], true],
        ["cum", "cumulative return: benchmark (solid), audited (dashed)", [0, 50], false],
      ];
      function draw() {
        const col = colors();
        const { ctx, w, h } = cv;
        ctx.clearRect(0, 0, w, h);
        const pad = 50, gapV = 34, ph = (h - 60 - 3 * gapV) / 4;
        const maxCum = Math.max(4.5, ...sel.map((k) => E[k].benchmark)) * 1.08;
        cv.boxes = [];
        panels.forEach(([f, title, yr, logy], pi) => {
          const box = { x: pad, y: 22 + pi * (ph + gapV), w: w - pad - 16, h: ph };
          const yrr = f === "cum" ? [0, maxCum] : yr;
          const fr = frame(ctx, col, box, [0, n], yrr, { title, logy, xlabel: pi === 3 ? "time [s]" : "", noXLabels: pi !== 3 });
          cv.boxes.push([box, fr]);
          ctx.save();
          ctx.fillStyle = col.grid;
          ctx.fillRect(fr.sx(100), box.y, fr.sx(105) - fr.sx(100), box.h);
          ctx.restore();
          sel.forEach((k) => {
            const e = E[k];
            const upto = Math.min(ti + 1, e.t.length);
            const xs = e.t.slice(0, upto);
            if (f === "cum") {
              const c1 = cum(e.r), c2 = cum(e.ra);
              line(ctx, xs.map((t, i) => [fr.sx(t), fr.sy(c1[i])]), colorOf(k), 2);
              line(ctx, xs.map((t, i) => [fr.sx(t), fr.sy(c2[i])]), colorOf(k), 1.6, [5, 4]);
            } else {
              const ys = e[f].slice(0, upto).map((v) => (logy ? Math.max(yr[0], Math.min(yr[1], v)) : v));
              line(ctx, xs.map((t, i) => [fr.sx(t), fr.sy(ys[i])]), colorOf(k), 2);
            }
          });
          const xT = fr.sx(hoverT !== null ? hoverT : ti + 1);
          ctx.save();
          ctx.strokeStyle = col.accent;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.moveTo(xT, box.y);
          ctx.lineTo(xT, box.y + box.h);
          ctx.stroke();
          ctx.restore();
        });
        info.innerHTML =
          `Chips show <b>benchmark / audited</b> episode returns. Shaded band: the scheduled pedestal rise (100–105 s). ` +
          `Up to four policies at a time. All traces are real TORAX 1.0.3 episodes from <code>data/</code>.`;
      }
      cv.c.addEventListener("mousemove", (ev) => {
        const rect = cv.c.getBoundingClientRect();
        const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
        const hit = (cv.boxes || []).find(([b]) => x >= b.x && x <= b.x + b.w && y >= b.y - 4 && y <= b.y + b.h);
        if (!hit) {
          hoverT = null;
          cv.hideTip();
          return draw();
        }
        const [b] = hit;
        hoverT = Math.max(1, Math.min(n, Math.round(((x - b.x) / b.w) * n)));
        const rows = sel.map((k) => {
          const e = E[k], i = Math.min(e.t.length - 1, hoverT - 1);
          const cb = e.r.slice(0, i + 1).reduce((a, c) => a + c, 0), ca = e.ra.slice(0, i + 1).reduce((a, c) => a + c, 0);
          return `<span class="rt-swatch" style="background:${colorOf(k)}"></span>${e.label}: I_p ${e.Ip[i].toFixed(1)} MA, P_aux ${e.Paux[i].toFixed(1)} MW, Q ${e.Q[i].toFixed(1)}, P_SOL/P_LH ${e.psol_plh[i].toFixed(2)}, return ${cb.toFixed(2)} / ${ca.toFixed(2)}`;
        });
        cv.showTip(x, y, `<b>t = ${hoverT} s</b><br>${rows.join("<br>")}`);
        draw();
      });
      cv.c.addEventListener("mouseleave", () => ((hoverT = null), cv.hideTip(), draw()));
      const p = player((dt) => {
        ti = Math.min(n - 1, ti + Math.max(1, Math.round(dt / 50)));
        tsl.set(ti + 1);
        draw();
        if (ti >= n - 1) {
          playBtn.textContent = "Replay";
          return false;
        }
      });
      draw();
      root._redraw = () => (refreshChips(), draw());
    });
    return { redraw: () => root._redraw && root._redraw(), resize: () => (cv.fit(), root._redraw && root._redraw()) };
  }

  // ================================================================== 6. Greenwald limit and IPB98(y,2)
  function wScalings(root) {
    const ctl = controls(root);
    const s = { Ip: 15, n: 9, P: 80 };
    const R = 6.2, a = 2.0, B = 5.3, kappa = 1.7, M = 2.5, eps = a / R;
    slider(ctl, "plasma current I_p", 3, 15, 0.1, s.Ip, (v) => v.toFixed(1) + " MA", (v) => ((s.Ip = v), draw()));
    slider(ctl, "line-average density n̄_e", 1, 14, 0.1, s.n, (v) => v.toFixed(1) + "×10¹⁹ m⁻³", (v) => ((s.n = v), draw()));
    slider(ctl, "loss power P", 10, 200, 1, s.P, (v) => v.toFixed(0) + " MW", (v) => ((s.P = v), draw()));
    const cv = canvas(root, 250);
    const info = note(root, "");
    const tau = (Ip, n, P) => 0.0562 * Math.pow(Ip, 0.93) * Math.pow(B, 0.15) * Math.pow(n, 0.41) * Math.pow(P, -0.69) * Math.pow(R, 1.97) * Math.pow(kappa, 0.78) * Math.pow(eps, 0.58) * Math.pow(M, 0.19);
    function draw() {
      const col = colors();
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const nG = (s.Ip / (Math.PI * a * a)) * 10; // in 1e19 m^-3
      const fgw = s.n / nG;
      const pad = 50, gap = 60, pw = (w - 2 * pad - gap) / 2;
      const b1 = { x: pad, y: 26, w: pw, h: h - 70 }, b2 = { x: pad + pw + gap, y: 26, w: pw, h: h - 70 };
      const f1 = frame(ctx, col, b1, [3, 15], [0, 14], { title: "Greenwald density n_G = I_p / (π a²)  [10¹⁹ m⁻³]", xlabel: "I_p [MA]" });
      ctx.save();
      ctx.fillStyle = col.bad;
      ctx.globalAlpha = 0.08;
      ctx.beginPath();
      ctx.moveTo(f1.sx(3), f1.sy((3 / (Math.PI * a * a)) * 10));
      for (let x = 3; x <= 15.001; x += 0.25) ctx.lineTo(f1.sx(x), f1.sy((x / (Math.PI * a * a)) * 10));
      ctx.lineTo(f1.sx(15), b1.y);
      ctx.lineTo(f1.sx(3), b1.y);
      ctx.fill();
      ctx.restore();
      line(ctx, [[f1.sx(3), f1.sy((3 / (Math.PI * a * a)) * 10)], [f1.sx(15), f1.sy((15 / (Math.PI * a * a)) * 10)]], col.bad, 2);
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(f1.sx(s.Ip), f1.sy(s.n), 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = col.muted;
      ctx.font = FONT_SMALL;
      ctx.textAlign = "left";
      ctx.fillText("above the line: f_GW > 1", f1.sx(3.3), b1.y + 12);
      const f2 = frame(ctx, col, b2, [3, 15], [0, 6], { title: "IPB98(y,2) confinement time τ_E  [s]", xlabel: "I_p [MA]" });
      const pts = [];
      for (let x = 3; x <= 15.001; x += 0.25) pts.push([f2.sx(x), f2.sy(tau(x, s.n, s.P))]);
      line(ctx, pts, col.series[0], 2.2);
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(f2.sx(s.Ip), f2.sy(tau(s.Ip, s.n, s.P)), 6, 0, 2 * Math.PI);
      ctx.fill();
      const t = tau(s.Ip, s.n, s.P);
      info.innerHTML =
        `n_G = <b>${(nG / 10).toFixed(2)}×10²⁰ m⁻³</b>, Greenwald fraction f_GW = <b>${fgw.toFixed(2)}</b>${fgw > 1 ? " (above the limit)" : ""}. ` +
        `τ_E(IPB98) = <b>${t.toFixed(2)} s</b>, so the scaling predicts W_th = τ_E·P ≈ <b>${(t * s.P).toFixed(0)} MJ</b>; ` +
        `H98 = (measured τ_E) / this value. Note I_p<sup>0.93</sup>: more current, better confinement, which is why policies push I_p up. ` +
        `<span class="rt-dim">ITER-like constants: R = 6.2 m, a = 2.0 m, B = 5.3 T, D-T mass 2.5; elongation κ = 1.7 is an assumption here.</span>`;
    }
    draw();
    return { redraw: draw, resize: () => (cv.fit(), draw()) };
  }

  // ================================================================== 7. results explorer
  function wResults(root) {
    const chips = controls(root);
    const cv = canvas(root, 380);
    const info = note(root, "Loading results…");
    getJSON("results").then((rows) => {
      const groupsOf = (g) => (g === "classical" || g === "reference" ? "reference" : g === "offline" || g === "residual" ? g : "online");
      const groups = ["reference", "online", "offline", "residual"].filter((g) => g !== "residual" || rows.some((r) => r.group === g));
      const on = { reference: true, online: true, offline: true, residual: true };
      const labels = { reference: "classical and open-loop search", online: "online RL (incl. ablations)", offline: "offline RL", residual: "RL on top of PI (residual)" };
      groups.forEach((g, i) => chip(chips, labels[g], colors().series[i], true, (v) => ((on[g] = v), draw())));
      let hover = null;
      function draw() {
        const col = colors();
        const { ctx, w, h } = cv;
        ctx.clearRect(0, 0, w, h);
        const box = { x: 56, y: 24, w: w - 76, h: h - 66 };
        const fr = frame(ctx, col, box, [1.8, 60], [1.7, 4.0], { logx: true, title: "benchmark return (log) vs audited score", xlabel: "benchmark return (IterHybrid-v0 reward)" });
        const pi = rows.find((r) => r.policy.startsWith("PI controller"));
        if (pi) {
          hline(ctx, box, fr.sy(pi.audited), col.muted, "PI, audited 3.50", true);
          ctx.save();
          ctx.strokeStyle = col.muted;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(fr.sx(pi.benchmark), box.y);
          ctx.lineTo(fr.sx(pi.benchmark), box.y + box.h);
          ctx.stroke();
          ctx.restore();
        }
        cv.pts = [];
        rows.forEach((r) => {
          const g = groupsOf(r.group);
          if (!on[g] || r.benchmark < 1.8) return;
          const x = fr.sx(r.benchmark), y = fr.sy(r.audited);
          const c = col.series[groups.indexOf(g)];
          ctx.fillStyle = c;
          ctx.strokeStyle = col.panel;
          ctx.lineWidth = 2;
          ctx.beginPath();
          if (r.group === "ablation") ctx.rect(x - 5, y - 5, 10, 10);
          else ctx.arc(x, y, hover === r ? 7.5 : 5.5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
          cv.pts.push([x, y, r]);
        });
        ctx.save();
        ctx.fillStyle = col.muted;
        ctx.font = FONT_SMALL;
        ctx.translate(14, box.y + box.h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText("audited score", 0, 0);
        ctx.restore();
        info.innerHTML =
          "Every evaluated policy (failed episodes omitted). Right of the dashed vertical line beats PI on the benchmark; " +
          "above the dashed horizontal line beats PI on the audited score. Squares are ablations. Hover a point for details.";
      }
      cv.c.addEventListener("mousemove", (ev) => {
        const rect = cv.c.getBoundingClientRect();
        const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
        let best = null, bd = 14;
        for (const [px, py, r] of cv.pts || []) {
          const d = Math.hypot(px - x, py - y);
          if (d < bd) (bd = d), (best = r);
        }
        hover = best;
        if (best)
          cv.showTip(x, y, `<b>${best.policy}</b><br>benchmark ${best.benchmark.toFixed(2)}, audited ${best.audited.toFixed(2)}` + (best.steps ? `<br>${best.steps.toLocaleString()} simulator steps` : ""));
        else cv.hideTip();
        draw();
      });
      cv.c.addEventListener("mouseleave", () => ((hover = null), cv.hideTip(), draw()));
      draw();
      root._redraw = draw;
    });
    return { redraw: () => root._redraw && root._redraw(), resize: () => (cv.fit(), root._redraw && root._redraw()) };
  }

  // ------------------------------------------------------------------ mount
  const WIDGETS = { q: wQ, diffusion: wDiffusion, profiles: wProfiles, reward: wReward, replay: wReplay, scalings: wScalings, results: wResults };
  const mounted = [];
  function mountAll() {
    document.querySelectorAll(".rt-widget[data-widget]:not([data-mounted])").forEach((root) => {
      const f = WIDGETS[root.dataset.widget];
      if (!f) return;
      root.dataset.mounted = "1";
      try {
        const m = f(root);
        mounted.push(m);
        // Refit when the widget's width changes (hidden at load, window or pane resizes); width only, to avoid loops.
        if (window.ResizeObserver && m && m.resize) {
          let lastW = root.clientWidth;
          new ResizeObserver(() => {
            const wNow = root.clientWidth;
            if (Math.abs(wNow - lastW) > 2) {
              lastW = wNow;
              m.resize();
            }
          }).observe(root);
        }
      } catch (e) {
        root.appendChild(el("div", "rt-note", "This interactive figure failed to load: " + e.message));
      }
    });
  }
  let rT;
  window.addEventListener("resize", () => {
    clearTimeout(rT);
    rT = setTimeout(() => mounted.forEach((m) => m && m.resize && m.resize()), 150);
  });
  new MutationObserver(() => mounted.forEach((m) => m && m.redraw && m.redraw())).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-md-color-scheme"],
  });
  // Shared toolkit for the widgets defined in other files (lab.js): they register here and reuse the helpers.
  window.RT = {
    register(name, fn) {
      WIDGETS[name] = fn;
      if (document.readyState !== "loading") mountAll();
    },
    mountAll, colors, el, controls, slider, button, chip, note, canvas, frame, line, hline, player, getJSON, fmtNum,
    FONT, FONT_SMALL, isDark,
  };
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(mountAll);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
})();
