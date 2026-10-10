// Acceptance tests for the Ramp-up Lab on phones (HMI-MOBILE-SPEC.md). Every check names the requirement it covers.
//   mkdocs build && node scripts/check_lab_mobile.mjs [--site site] [--shots DIR] [--report FILE] [--only 390x844]
//                                                     [--strict-timing]
// The two timing checks (M13) are advisory unless --strict-timing: on a shared or busy machine they measure the
// machine, not the Lab. Run them strict on an idle machine.
// Needs a Chromium-based browser and Playwright: the `playwright-core` package (npm), or the module named in
// PLAYWRIGHT_MODULE; the browser from CHROME, else /usr/bin/google-chrome or chromium.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SITE = path.resolve(arg("--site", "site"));
const SHOTS = arg("--shots", null);
const REPORT = arg("--report", null);
const ONLY = arg("--only", null);
const STRICT_TIMING = args.includes("--strict-timing");

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, "playwright-core", "playwright", path.join(process.env.HOME || "", ".cache/ms-playwright-go/1.50.1/package/index.js")].filter(Boolean);
  for (const t of tries) {
    try {
      return require(t);
    } catch (e) {
      /* next */
    }
  }
  throw new Error("Playwright not found: npm install --no-save playwright-core, or set PLAYWRIGHT_MODULE");
}
const CHROME = [process.env.CHROME, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && fs.existsSync(p));

// ---------------------------------------------------------------- a static server for the built site
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
function serve(root) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = path.join(root, p);
    if (!f.startsWith(root)) return res.writeHead(403).end();
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

// ---------------------------------------------------------------- results
const results = [];
let profile = "";
function check(req, name, cond, detail, timing) {
  const soft = !!timing && !STRICT_TIMING;
  results.push({ profile, req, name, ok: !!cond, advisory: soft, detail: detail === undefined ? "" : String(detail) });
  console.log(`${cond ? "ok  " : soft ? "WARN" : "FAIL"} [${profile}] ${req} ${name}${detail !== undefined ? ` (${detail})` : ""}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- helpers run in the page
const rect = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight };
}, sel);
const inView = (r) => r && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= r.vh + 0.5 && r.right <= r.vw + 0.5 && r.w > 0 && r.h > 0;
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const cls = (page) => page.$eval(".rt-lab", (e) => e.className);
const wait = (page, ms) => page.waitForTimeout(ms);

// a finger: touch events through the DevTools protocol, so the browser's own touch pipeline runs (scroll latching,
// overscroll, pointer events), as on an Android phone
async function swipe(page, x, y, dx, dy, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(400);
}
async function setTime(page, t) {
  await page.focus(".pb-scrub");
  await page.keyboard.press("Home");
  for (let i = 0; i < Math.floor(t / 10); i++) await page.keyboard.press("PageUp");
  for (let i = 0; i < t % 10; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
}
// WCAG contrast of an element's text (or icon) colour against its own opaque background
const contrastOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const cs = getComputedStyle(e), fg = rgb(cs.color), bg = rgb(cs.backgroundColor);
  if (bg.length === 4 && bg[3] < 1) return null;
  const a = L(fg), b = L(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}, sel);

async function openLab(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector(".rt-lab") && (document.querySelector(".lab-launch-preset")?.textContent || document.querySelector(".lab-hud .lab-hud-chip")?.textContent));
  await wait(page, 400);
}

// script time per animation frame: every requestAnimationFrame callback is timed (window.__frames)
const FRAME_PROBE = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__frames = [];
  window.requestAnimationFrame = (cb) => raf((ts) => { const t0 = performance.now(); cb(ts); window.__frames.push(performance.now() - t0); if (window.__frames.length > 600) window.__frames.shift(); });
})();`;
async function frameCost(ctx, page, playSel, rate) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.evaluate((sel) => { window.__frames = []; document.querySelector(sel).click(); }, playSel);
  await page.waitForTimeout(2500);
  const r = await page.evaluate((sel) => { document.querySelector(sel).click(); const f = window.__frames.slice().sort((a, b) => a - b); return { med: f[f.length >> 1], p90: f[Math.floor(f.length * 0.9)], n: f.length }; }, playSel);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return r;
}

// ---------------------------------------------------------------- the phone suite
async function phoneSuite(browser, base, w, h, scheme) {
  profile = `${w}x${h}${scheme === "dark" ? " dark" : ""}`;
  const upright = h > w;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
  await ctx.addInitScript(FRAME_PROBE);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const lab = `${base}/primer/7-lab/`;
  await openLab(page, lab);
  if (scheme === "dark") await page.evaluate(() => document.body.setAttribute("data-md-color-scheme", "slate"));
  const shot = async (tag) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${profile.replace(" ", "-")}-${tag}.png`) });

  // M1 the launch card
  await page.evaluate(() => document.querySelector(".rt-lab").scrollIntoView({ block: "start" }));
  check("M1", "inline the Lab is a launch card", (await cls(page)).includes("lab-small"));
  const hidden = await page.evaluate(() => [".lab-top", ".lab-main", ".lab-bar"].every((s) => getComputedStyle(document.querySelector(s)).display === "none"));
  check("M1", "no other Lab controls inline", hidden);
  const go = await rect(page, ".lab-launch-go"), card = await rect(page, ".lab-launch");
  check("M1", "Open button ≥ 48 px tall and ≥ 80 % of the card's width", go && go.h >= 47.5 && go.w >= 0.8 * card.w, go && `${go.w.toFixed(0)} × ${go.h.toFixed(0)}`);
  check("M1", "the card names the preset it opens with", /Opens with/.test((await text(page, ".lab-launch-preset")) || ""));
  check("M9", "no sideways page scroll inline", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await shot("1-card");

  // M2, M13 entering
  const y0 = await page.evaluate(() => scrollY);
  await wait(page, 600);
  const tEnter = await page.evaluate(async () => {
    const t0 = performance.now();
    document.querySelector(".lab-launch-go").click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t0;
  });
  check("M13", "the full-screen layout opens in < 300 ms", tEnter < 300, `${tEnter.toFixed(0)} ms`, true);
  await wait(page, 300);
  const c1 = await cls(page);
  check("M2", "full screen, phone layout", c1.includes("lab-fs") && c1.includes(upright ? "fs-phone" : "fs-land"), c1);
  check("M2", "a history entry for the Back gesture", await page.evaluate(() => !!(history.state && history.state.labFs)));
  check("M9", "no sideways scroll in full screen", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector(".lab-fsgrid").scrollWidth <= innerWidth + 1));
  await shot("2-fullscreen");

  // M3 the plasma and the playback line stay in view, whatever the tab and its scroll
  const plasma0 = await rect(page, ".fs-stage .lab-torus .rt-canvas-wrap"), play0 = await rect(page, ".fs-pb");
  check("M3", "the plasma view is inside the screen", inView(plasma0), plasma0 && `${plasma0.top.toFixed(0)}–${plasma0.bottom.toFixed(0)} of ${plasma0.vh}`);
  if (upright) check("M3", "upright, the plasma takes 200–300 px (about a third)", plasma0 && plasma0.h >= 199 && plasma0.h <= 301, plasma0 && plasma0.h.toFixed(0));
  else check("M3", "on its side, the plasma is on the left half", plasma0 && plasma0.right <= plasma0.vw * 0.62, plasma0 && `${plasma0.left.toFixed(0)}–${plasma0.right.toFixed(0)}`);
  check("M4", "the playback line is inside the screen", inView(play0));
  const tabs = await page.$$eval(".fs-tabs button", (b) => b.map((x) => x.dataset.tab));
  check("M6", "twelve instrument tabs", tabs.length === 12, tabs.join(","));
  let stable = true, detail = "";
  for (const id of tabs) {
    await page.tap(`.fs-tabs button[data-tab="${id}"]`);
    await wait(page, 120);
    await page.evaluate(() => { const b = document.querySelector(".fs-body"); b.scrollTop = b.scrollHeight; });
    await wait(page, 60);
    const p = await rect(page, ".fs-stage .lab-torus .rt-canvas-wrap"), q = await rect(page, ".fs-pb");
    const sel = await rect(page, `.fs-tabs button[data-tab="${id}"]`), strip = await rect(page, ".fs-tabs");
    if (!(inView(p) && inView(q) && near(p.top, plasma0.top, 1) && near(q.top, play0.top, 1))) (stable = false), (detail += ` ${id}: plasma/playback moved`);
    if (!(sel.left >= strip.left - 1 && sel.right <= strip.right + 1)) (stable = false), (detail += ` ${id}: tab not in view`);
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))) (stable = false), (detail += ` ${id}: sideways scroll`);
  }
  check("M3", "plasma and playback fixed on every tab, scrolled to its end", stable, detail.trim() || undefined);
  check("M6", "the selected tab is kept in view; no sideways scroll", stable);
  await page.tap('.fs-tabs button[data-tab="controls"]');
  check("M6", "the tab is remembered per orientation", await page.evaluate((m) => localStorage.getItem("rt-lab-fs-tab-" + m) === '"controls"', upright ? "phone" : "land"));

  // M4 the playback line
  const pbItems = await page.$$eval(".fs-pb > *", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { c: e.className, cy: r.top + r.height / 2, h: r.height }; }));
  const row = pbItems.every((i) => near(i.cy, pbItems[0].cy, 4));
  check("M4", "one row: play, start, scrubber, time, speed, pin", row && pbItems.length === 6, pbItems.map((i) => i.c.split(" ").pop()).join(" "));
  check("M4", "≤ 56 px tall", play0.h <= 56.5, play0.h.toFixed(0));
  const labelled = await page.$$eval(".fs-pb button, .fs-pb [role=slider]", (els) => els.every((e) => (e.getAttribute("aria-label") || "").length > 2));
  check("M4", "every control has an accessible name", labelled);
  const words = await page.$eval(".fs-pb", (e) => e.innerText.replace(/\s+/g, " ").trim());
  check("M4", "minimal text: only the time and the speed", /^\d+ s ?± \d(\.\d)?×( \d)?$/.test(words), words);
  await page.tap(".pb-play");
  await wait(page, 1500);
  const tPlay = parseInt((await text(page, ".pb-time")) || "0", 10);
  check("M4", "Play advances the time", tPlay > 3, `${tPlay} s after 1.5 s`);
  await page.tap(".pb-play");
  const tA = parseInt(await text(page, ".pb-time"), 10);
  await wait(page, 600);
  check("M4", "Pause stops it", parseInt(await text(page, ".pb-time"), 10) === tA);
  const tr = await rect(page, ".pb-scrub");
  await page.touchscreen.tap(tr.x + 12 + (tr.w - 24) * 0.5, tr.y + tr.h / 2);
  await wait(page, 150);
  const tMid = parseInt(await text(page, ".pb-time"), 10);
  check("M4", "a tap on the track jumps there (no drag needed)", near(tMid, 75, 10), `${tMid} s at the middle`);
  // a tap next to an event tick snaps to it and names it (F09); a drag scrubs
  // the tick farthest from its neighbours, tapped 3 px beside it
  const tick = await page.evaluate(() => {
    const xs = [...document.querySelectorAll(".pb-ticks i")].map((i) => { const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, t: i.title }; });
    xs.forEach((a) => (a.gap = Math.min(...xs.filter((b) => b !== a).map((b) => Math.abs(b.x - a.x)), 1e9)));
    return xs.sort((a, b) => b.gap - a.gap)[0] || null;
  });
  if (tick) {
    await page.touchscreen.tap(tick.x + 3, tr.y + tr.h / 2);
    await wait(page, 150);
    const bub = await text(page, ".pb-bubble");
    check("M4", "a tap near an event tick snaps to it and names it", bub && tick.t.startsWith(bub.split(" · ")[1] || "§") && tick.t.endsWith(`at ${parseInt(bub, 10)} s`), `${bub} | ${tick.t}`);
  }
  await swipe(page, tr.x + 12 + (tr.w - 24) * 0.2, tr.y + tr.h / 2, (tr.w - 24) * 0.4, 0, 6);
  const tDrag = parseInt(await text(page, ".pb-time"), 10);
  check("M4", "dragging along the track scrubs", near(tDrag, 91, 12), `${tDrag} s after a drag from 20 % to 60 %`);
  // the time is a button: a stepper of ±1 s and ±10 s (F06)
  await wait(page, 300);
  await page.tap(".pb-time");
  const stepOpen = await page.waitForSelector(".lab-step:not([hidden])", { timeout: 3000 }).then(() => true, () => false);
  check("M4", "tapping the time opens its stepper", stepOpen, stepOpen ? undefined : await page.evaluate(() => `stepper hidden; active ${document.activeElement && document.activeElement.className}; state ${JSON.stringify(history.state)}`));
  if (stepOpen) {
    const t0s = parseInt(await text(page, ".pb-time"), 10);
    await page.tap(".lab-step button:nth-of-type(3)");
    await wait(page, 150);
    check("M4", "the time's stepper moves by exactly 1 s", parseInt(await text(page, ".pb-time"), 10) === t0s + 1, `${t0s} → ${await text(page, ".pb-time")}`);
    check("M7", "stepper buttons ≥ 44 × 44", await page.$$eval(".lab-step button", (b) => b.every((x) => x.getBoundingClientRect().height >= 43.5 && x.getBoundingClientRect().width >= 43.5)));
    await page.evaluate(() => history.back()); // Back closes the stepper first (F12)
    await wait(page, 300);
    check("M12", "Back closes the stepper and stays in the Lab", (await page.$eval(".lab-step", (e) => e.hidden)) && (await cls(page)).includes("lab-fs"));
  }
  const speeds = [];
  for (let i = 0; i < 4; i++) {
    await page.tap(".pb-speed");
    speeds.push(await text(page, ".pb-speed"));
  }
  check("M4", "speed cycles 2×, 4×, 0.5×, 1×", speeds.join(" ") === "2× 4× 0.5× 1×", speeds.join(" "));
  await page.tap(".pb-pin");
  await wait(page, 100);
  check("M4", "Pin shows the number of pins", (await text(page, ".pb-badge")) === "1");
  await page.tap(".pb-pin");
  await wait(page, 100);
  check("M12", "pinning the same run twice is refused, and says so", (await text(page, ".pb-badge")) === "1" && /already pinned/.test((await text(page, ".lab-toast")) || ""));
  const ticks = await page.$$eval(".pb-ticks i", (t) => t.length);
  check("M4", "event ticks on the track", ticks > 0, `${ticks} ticks`);

  // M7 targets
  const PRIMARY = [".fs-close", ".fs-pick", ".fs-more", ".pb-play", ".pb-start", ".pb-speed", ".pb-pin", ".fs-tabs button"];
  const small = await page.evaluate((sels) => sels.flatMap((s) => [...document.querySelectorAll(s)].map((e) => {
    const r = e.getBoundingClientRect();
    return r.width < 43.5 || r.height < 43.5 ? `${s} ${r.width.toFixed(0)}×${r.height.toFixed(0)}` : null;
  })).filter(Boolean), PRIMARY);
  check("M7", "primary controls ≥ 44 × 44", small.length === 0, small.join(", ") || undefined);
  check("M7", "the time line's touch area ≥ 44 px tall", tr.h >= 43.5, tr.h.toFixed(0));
  const sec = await page.evaluate(() => [...document.querySelectorAll(".fs-stage button, .fs-body .lab-side button, .fs-body .lab-side input[type=range]")].filter((e) => e.offsetParent).map((e) => {
    const r = e.getBoundingClientRect();
    return r.height < 23.5 || r.width < 23.5 ? `${e.className || e.type} ${r.width.toFixed(0)}×${r.height.toFixed(0)}` : null;
  }).filter(Boolean));
  check("M7", "other targets ≥ 24 × 24", sec.length === 0, sec.slice(0, 4).join(", ") || undefined);

  // M5 the app bar and its menu
  const bar = await rect(page, ".fs-top");
  check("M5", "the app bar is one row ≤ 52 px", bar.h <= 52.5, bar.h.toFixed(0));
  await page.tap(".fs-more");
  await wait(page, 150);
  const menu = await rect(page, ".fs-menu");
  const items = await page.$$eval(".fs-mi", (b) => b.map((x) => [x.textContent, x.getBoundingClientRect().height]));
  check("M5", "More opens a menu inside the screen", inView(menu), menu && `${menu.top.toFixed(0)}–${menu.bottom.toFixed(0)}`);
  check("M5", "menu: story, labels, acronyms, about, scoreboard, clear pins, scenario", items.length === 7 && /Story/.test(items[0][0]) && /physics|benchmark/.test(items[6][0]));
  check("M7", "menu rows ≥ 44 px", items.every(([, hh]) => hh >= 43.5));
  await page.tap(".fs-mi:nth-child(3)");
  await wait(page, 150);
  const acr = await rect(page, '.lab-card:not([hidden])');
  check("M5", "a card opens inside the screen", inView(acr), acr && `${acr.top.toFixed(0)}–${acr.bottom.toFixed(0)}`);
  await shot("3-card-open");
  await page.keyboard.press("Escape");
  await wait(page, 100);
  check("M5", "Esc closes the card and stays in the Lab", (await page.$$('.lab-card:not([hidden])')).length === 0 && (await cls(page)).includes("lab-fs"));
  await page.tap(".fs-more");
  await wait(page, 150);
  await page.evaluate(() => history.back());
  await wait(page, 300);
  check("M12", "Back with the menu open closes the menu, not the Lab", (await page.$eval(".fs-menu", (e) => e.hidden)) && (await cls(page)).includes("lab-fs"));
  await page.selectOption(".fs-pick select", "physics|phys_ppo_dr");
  await wait(page, 300);
  check("M5", "the picker switches preset and scenario, and shows both", (await text(page, ".fs-pick-name")) === "Randomised training" && (await text(page, ".fs-pick-scen")) === "physics environment", `${await text(page, ".fs-pick-name")} · ${await text(page, ".fs-pick-scen")}`);

  // M13 smooth playback: the script time per frame, with the CPU slowed 4× as for a mid-range phone, during heating
  if (upright && w === 390 && scheme === "light") {
    await setTime(page, 98);
    const fc = await frameCost(ctx, page, ".pb-play", 4);
    check("M13", "playback: median script time per frame < 33 ms with the CPU slowed 4×", fc.med < 33, `median ${fc.med.toFixed(1)} ms, 90th percentile ${fc.p90.toFixed(1)} ms, ${fc.n} frames`, true);
  }

  // real touch on the tab content (the evaluation's F01, F03, F04, F05)
  const body = await rect(page, ".fs-body");
  await page.tap('.fs-tabs button[data-tab="controls"]');
  await wait(page, 200);
  await page.evaluate(() => (document.querySelector(".fs-body").scrollTop = 0));
  await swipe(page, body.x + body.w * 0.15, body.y + body.h * 0.8, 0, -body.h * 0.6);
  const sc1 = await page.evaluate(() => document.querySelector(".fs-body").scrollTop);
  check("M6", "a finger scrolls the Controls tab", sc1 > 40, `scrolled ${sc1.toFixed(0)} px`);
  await page.tap('.fs-tabs button[data-tab="setup"]');
  await wait(page, 200);
  const sl = await page.evaluate(() => { const i = [...document.querySelectorAll(".fs-body .lab-params input[type=range]")].find((x) => { const r = x.getBoundingClientRect(); return r.top > document.querySelector(".fs-body").getBoundingClientRect().top + 20 && r.bottom < document.querySelector(".fs-pb").getBoundingClientRect().top - 20; }); if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.x + r.width * 0.75, y: r.y + r.height / 2, v: i.value, id: [...document.querySelectorAll("input[type=range]")].indexOf(i) }; });
  if (sl) {
    const sb0 = await page.evaluate(() => document.querySelector(".fs-body").scrollTop);
    await swipe(page, sl.x, sl.y, 0, -120);
    const after = await page.evaluate((id) => document.querySelectorAll("input[type=range]")[id].value, sl.id);
    const sb1 = await page.evaluate(() => document.querySelector(".fs-body").scrollTop);
    check("M7", "a vertical swipe that starts on a slider scrolls and leaves its value alone", after === sl.v && sb1 > sb0 + 20, `value ${sl.v} → ${after}, scrolled ${(sb1 - sb0).toFixed(0)} px`);
  }
  await page.tap('.fs-tabs button[data-tab="numbers"]');
  await wait(page, 200);
  await page.evaluate(() => { const e = document.querySelector('.lab-ro[data-k="Te0"]'), b = document.querySelector(".fs-body"); b.scrollTop += e.getBoundingClientRect().top - b.getBoundingClientRect().top - 12; });
  await wait(page, 150);
  const tile = await rect(page, '.lab-ro[data-k="Te0"] .ro-l');
  if (tile && inView(tile)) {
    const url0 = page.url();
    await page.touchscreen.tap(tile.x + 8, tile.y + tile.h / 2);
    await wait(page, 300);
    check("M6", "a tap on a number's name opens its history, not another page", page.url() === url0 && (await page.$eval(".lab-histpop", (e) => !e.hidden)), page.url() === url0 ? "" : page.url());
    await page.touchscreen.tap(tile.x + 8, tile.y + tile.h / 2);
    await wait(page, 200);
    const nb = await rect(page, ".fs-body");
    await swipe(page, nb.x + nb.w * 0.3, nb.y + nb.h * 0.7, 0, -nb.h * 0.4);
    check("M6", "swiping through the numbers opens no history", await page.$eval(".lab-histpop", (e) => e.hidden));
  }
  await page.tap('.fs-tabs button[data-tab="traces"]');
  await wait(page, 200);
  const tBefore = await text(page, ".pb-time"), tv0 = await rect(page, ".fs-body .lab-traces canvas");
  await swipe(page, tv0.x + tv0.w * 0.5, Math.min(tv0.y + 120, body.y + body.h - 20), 0, -100);
  check("M6", "a vertical swipe over a plot scrolls without moving the time", (await text(page, ".pb-time")) === tBefore, `${tBefore} → ${await text(page, ".pb-time")}`);
  await page.tap('.fs-tabs button[data-tab="controls"]');

  // M8 contrast of the filled controls and the status chip (both themes)
  const lowC = [];
  for (const [sel, min] of [[".fs-tabs .rt-chip.on", 4.5], [".fs-pb .pb-play", 3], [".fs-stage .lab-hud-chip", 4.5], [".fs-stage .lab-seg .rt-chip.on", 4.5]]) {
    const c = await contrastOf(page, sel);
    if (c !== null && c < min) lowC.push(`${sel} ${c.toFixed(2)}:1`);
  }
  check("M8", "filled controls and the status chip meet WCAG AA", lowC.length === 0, lowC.join(", ") || undefined);

  // M10 status
  check("M10", "the status chip sits on the plasma", inView(await rect(page, ".fs-stage .lab-hud-chip")));
  const narrLines = await page.$eval(".fs-stage .lab-narr > span", (e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
  check("M10", `the narration is clamped to ${upright ? "two lines" : "one line"}`, narrLines <= (upright ? 2 : 1), `${narrLines} lines`);

  // M8 legibility of the visible text
  const tiny = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.querySelector(".lab-fsgrid"), NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const n = walk.currentNode, e = n.parentElement;
      if (!n.textContent.trim() || !e || !e.offsetParent || e.closest("select, option")) continue;
      const r = e.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const fsz = parseFloat(getComputedStyle(e).fontSize), chrome = e.closest(".fs-top, .fs-pb, .fs-tabs");
      const min = e.closest(".ro-ma i") ? 9 : chrome ? 12 : 11;
      if (fsz < min - 0.05) out.push(`${(e.className || e.tagName).toString().slice(0, 24)} "${n.textContent.trim().slice(0, 14)}" ${fsz.toFixed(1)}px`);
    }
    return [...new Set(out)];
  });
  check("M8", "text ≥ 12 px in the bars and tabs, ≥ 11 px elsewhere", tiny.length === 0, tiny.slice(0, 5).join("; ") || undefined);

  // M12 state survives leaving and entering; leaving pauses
  await setTime(page, 80);
  await page.tap(".fs-close");
  await wait(page, 500);
  const c2 = await cls(page);
  check("M2", "Close leaves full screen and shows the card again", !c2.includes("lab-fs") && c2.includes("lab-small"), c2);
  check("M2", "the page is where it was", near(await page.evaluate(() => scrollY), y0, 2), `${await page.evaluate(() => scrollY)} vs ${y0}`);
  check("M12", "a second Back does not leave the page", await page.evaluate(() => location.pathname.endsWith("/primer/7-lab/")));
  await page.tap(".lab-launch-go");
  await wait(page, 400);
  const tKeep = parseInt(await text(page, ".pb-time"), 10);
  check("M12", "entering again keeps the preset and the time", tKeep === 80 && (await text(page, ".fs-pick-name")) === "Randomised training", `${tKeep} s, left at 80 s`);
  await page.tap(".pb-play");
  await wait(page, 300);
  await page.tap(".fs-close");
  await wait(page, 400);
  const tStop = await page.$eval(".lab-launch-preset", (e) => e.textContent);
  await wait(page, 600);
  check("M2", "leaving pauses the playback", tStop === (await page.$eval(".lab-launch-preset", (e) => e.textContent)), tStop.replace(/.*· /, ""));
  await page.tap(".lab-launch-go");
  await wait(page, 400);
  const tKeep2 = parseInt(await text(page, ".pb-time"), 10);

  // M9 rotation keeps the state and the open tab; layouts switch
  await page.tap('.fs-tabs button[data-tab="numbers"]');
  await page.setViewportSize({ width: h, height: w });
  await wait(page, 500);
  const c3 = await cls(page);
  check("M9", "rotation switches the layout", c3.includes(upright ? "fs-land" : "fs-phone"), c3);
  check("M9", "after rotation the plasma and playback are in view", inView(await rect(page, ".fs-stage .lab-torus .rt-canvas-wrap")) && inView(await rect(page, ".fs-pb")));
  check("M9", "rotation keeps the time and the preset", parseInt(await text(page, ".pb-time"), 10) === tKeep2 && (await text(page, ".fs-pick-name")) === "Randomised training");
  check("M9", "rotation keeps the open tab", (await page.$eval(".fs-tabs .rt-chip.on", (b) => b.dataset.tab)) === "numbers");
  await shot("4-rotated");
  await page.setViewportSize({ width: w, height: h });
  await wait(page, 400);

  // M2 the system Back gesture leaves the Lab
  await page.evaluate(() => history.back());
  await wait(page, 500);
  check("M2", "Back leaves the Lab, not the page", !(await cls(page)).includes("lab-fs") && (await page.evaluate(() => location.pathname.endsWith("/primer/7-lab/"))));

  // M11 a link in the text opens the Lab in its state; Back returns to the link
  const link = 'a[href*="preset=phys_heating_cut"]';
  await page.evaluate((s) => document.querySelector(".md-content " + s).scrollIntoView({ block: "center" }), link);
  await wait(page, 200);
  const yLink = await page.evaluate(() => scrollY);
  const nav0 = await page.evaluate(() => performance.getEntriesByType("navigation").length + ":" + performance.timeOrigin);
  await page.tap(".md-content " + link);
  await wait(page, 700);
  check("M11", "the link opens the full-screen Lab without reloading", (await cls(page)).includes("lab-fs") && nav0 === (await page.evaluate(() => performance.getEntriesByType("navigation").length + ":" + performance.timeOrigin)));
  check("M11", "in the link's state", (await text(page, ".fs-pick-name")) === "Heating cut at 105 s" && parseInt(await text(page, ".pb-time"), 10) === 106, `${await text(page, ".fs-pick-name")} at ${await text(page, ".pb-time")}`);
  await page.evaluate(() => history.back());
  await wait(page, 500);
  check("M11", "Back returns to the link in the text", near(await page.evaluate(() => scrollY), yLink, 2) && inView(await rect(page, ".md-content " + link)));

  // M11 arriving from another page with a Lab state in the address opens the Lab directly
  if (upright && w === 390 && scheme === "light") {
    await page.goto(`${lab}?preset=phys_pi&threshold=1.15&tab=T`);
    await page.waitForFunction(() => document.querySelector(".rt-lab")?.classList.contains("lab-fs"), null, { timeout: 15000 }).catch(() => {});
    await wait(page, 500);
    check("M11", "a Lab address from another page opens the full-screen Lab in that state", (await cls(page)).includes("lab-fs") && (await text(page, ".fs-pick-name")) === "PI controller, re-tuned");
    await page.evaluate(() => history.back());
    await wait(page, 500);
    check("M11", "…and Back shows the page behind it", !(await cls(page)).includes("lab-fs") && (await page.evaluate(() => location.search.includes("preset=phys_pi"))));
  }

  check("—", "no script errors", errors.length === 0, errors.slice(0, 2).join(" | ") || undefined);
  await ctx.close();
}

// ---------------------------------------------------------------- M14 desktop unchanged, M13 smoothness
async function desktopSuite(browser, base) {
  profile = "1440x900 desktop";
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openLab(page, `${base}/primer/7-lab/?preset=pi&t=60`);
  const c = await cls(page);
  check("M14", "no launch card on a desktop", !c.includes("lab-small") && (await page.$eval(".lab-launch", (e) => getComputedStyle(e).display)) === "none");
  check("M14", "the inline Lab is shown", (await page.$eval(".lab-main", (e) => getComputedStyle(e).display)) !== "none");
  await page.click('.lab-bar [title^="Full screen"]');
  await wait(page, 400);
  const c2 = await cls(page);
  check("M14", "full screen keeps the desktop layout", c2.includes("fs-desk") && (await page.$$(".fs-pb")).length === 0 && (await page.$$(".fs-play .lab-sec-play")).length === 1, c2);
  await page.mouse.move(2, 2); // off any number (a hovered number's popup is the first thing Esc closes)
  await wait(page, 200);
  await page.keyboard.press("Escape");
  await wait(page, 800);
  check("M14", "Esc leaves; the page is restored", !(await cls(page)).includes("lab-fs"));
  check("—", "no script errors", errors.length === 0, errors.slice(0, 2).join(" | ") || undefined);
  await ctx.close();
}

// ---------------------------------------------------------------- run
const pw = loadPlaywright();
if (!CHROME) throw new Error("no Chrome or Chromium found; set CHROME");
if (!fs.existsSync(path.join(SITE, "primer/7-lab/index.html"))) throw new Error(`no built site at ${SITE} (run mkdocs build)`);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const srv = await serve(SITE);
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const PHONES = [[360, 780], [375, 667], [390, 844], [412, 915], [844, 390], [667, 375]];
// one profile's crash is recorded as a failure and does not stop the others
const guarded = async (name, f) => {
  try {
    await f();
  } catch (e) {
    check("—", `the ${name} run completed`, false, e.message.split("\n")[0]);
  }
};
try {
  for (const [w, h] of PHONES) if (!ONLY || ONLY === `${w}x${h}`) await guarded(`${w}x${h}`, () => phoneSuite(browser, base, w, h, "light"));
  if (!ONLY || ONLY === "dark") await guarded("dark", () => phoneSuite(browser, base, 390, 844, "dark"));
  if (!ONLY || ONLY === "desktop") await guarded("desktop", () => desktopSuite(browser, base));
} finally {
  await browser.close();
  srv.close();
}
const failed = results.filter((r) => !r.ok && !r.advisory), warned = results.filter((r) => !r.ok && r.advisory);
console.log(`\n${results.filter((r) => r.ok).length} of ${results.length} checks passed across ${new Set(results.map((r) => r.profile)).size} profiles` +
  (warned.length ? `; ${warned.length} timing check(s) over budget (advisory; --strict-timing to enforce)` : ""));
if (REPORT) fs.writeFileSync(REPORT, JSON.stringify({ when: new Date().toISOString(), results }, null, 1));
process.exit(failed.length ? 1 : 0);
