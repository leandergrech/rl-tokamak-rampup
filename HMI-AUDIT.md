# HMI audit: hover history, view switches, moving averages and labels

Where the pattern asked for on the Lab's *Numbers at the cursor* panel should spread across the site, and what is broken
in the labelling today. It is written for whoever implements it: every item names the file and function, and has
checks a reviewer can tick off.

**Audited:** `origin/main` at `516e0cb`. I also looked at the in-progress branch `hmi/numbers-panel` at `0a093ad`,
which already implements R1 to R3 on the Numbers panel and the side pane's sparklines. Notes on it are under HMI-01 and HMI-02.
**How:** every page with a `data-widget` (index, ch. 1 problem, ch. 4 designs, ch. 5 limitations, primer 1 to 7), the Lab's
side pane, all eleven panels, the four cards and the full-screen layout in its three modes. I used a headless browser at
1440 × 900 (light and dark), 390 × 844 at 2× (a phone held upright) and 844 × 390 (a phone on its side), with
`?preset=pi&t=110` (two runs pinned) and `?preset=phys_ppo_dr&t=101`.

**The rules (from the owner's request), as they apply site-wide**

- **R1 Numbers:** label with unit, value large, trailing 5/20/60 s means in small print, TORAX's value in small print.
- **R2 Hover history:** hovering a number (tapping it on a phone) shows a small plot of its history: the run solid, TORAX dashed, pins in their colours, a cursor, axes with units.
- **R3 Numbers | Plots:** a switch in the panel header flips to small multiples over the whole episode. Clicking a plot moves the time. The choice is remembered.
- **R4 Labelling:** a unit on every number, a label and unit on every axis, a legend or direct label on every series, one small-print style, nothing overlapping or cut, in light, dark and on a phone.

**Verdict in one paragraph.** R1 (trailing means) belongs on the Numbers panel only. Nowhere else on the site shows
a value that changes second by second without already plotting its history. R3 (a Numbers | Plots switch) also
belongs there only. The Lab already pairs every "at the cursor" view with a "through the episode" view: profiles and
maps, the power bars and the fractions plot, the reward bars and the reward area. A switch would hide one half of each
pair. The two rules worth spreading are **R2** and **R4**. R2 spreads as one shared history popup, and as hover readouts
and click-to-scrub on every plot with a time axis. R4 matters most for phones: four primer widgets have overlapping
titles there, and several Lab plots clip or overprint their own axis labels.

---

## Summary

| ID | P | Page | Widget / panel | Change | Effort |
|----|---|------|----------------|--------|--------|
| HMI-01 | P1 | Primer 7, Lab | Numbers at the cursor (`drawReadout`) | Finish R1–R4 (in progress). Fix the five issues from review: taps on the tile label, small print below 9 px, means of a cumulative quantity, partial windows unmarked, "hover" hint on touch screens | S (remaining) |
| HMI-02 | P1 | Lab | Side pane, Outcome sparklines (`drawSpark`) | The shared history popup (in progress), plus click or drag to scrub and labelled thresholds | S |
| HMI-03 | P1 | Lab | Maps, Reward area, Power fractions, sparklines | Every time axis scrubs on click or drag and draws the cursor line (one shared handler) | S |
| HMI-04 | P1 | All pages | Shared canvas helpers (`widgets.js` `frame`, `line`, new `legend`) | Titles fitted to the plot, legends that wrap, room kept for the x label, series clipped to the box, at least 3 ticks | M |
| HMI-05 | P1 | Lab | Traces (`drawTraces`) | "time [s]" no longer cut; the pin legend no longer prints over it; colours named in the "heating" and "return" titles | S |
| HMI-06 | P1 | Lab | The knobs, strips (`drawKnobStrips`) | Legend clear of "time [s]"; pins labelled "pinned:" as in Traces | S |
| HMI-07 | P1 | Lab | Radial profiles (`drawProfiles`) | Clip q to the box (today a curve runs through the title); name the t = 0 curve; make the 3/2 and 2 labels legible | S |
| HMI-08 | P1 | Lab | Power and current (`drawBalance`) | Fitted titles; a legend for segments too narrow to label; the pinned series named; a cursor line | S |
| HMI-09 | P1 | Lab | Reward (`drawReward`, `drawRewardArea`) | Penalty in the legend; legend wraps on a phone; "return so far" kept visible | S |
| HMI-10 | P1 | Primer 1, 3, 4, 6; ch. 1 | diffusion, profiles, scalings, power, reward explorer | On a phone, stack side-by-side panels (their titles overprint today); reward explorer margins scale with width | M |
| HMI-11 | P2 | Lab | Traces | R2 variant: a crosshair and readout of every series in the hovered row at the hovered time (Lab, TORAX, pins, with units) | M |
| HMI-12 | P2 | Lab | Operating space (`drawOps`) | Hover the trajectory for t, f_GW, q95, β_N; click to jump there; legend (Lab, TORAX dashed, pins); q95 ticks on the right | M |
| HMI-13 | P2 | Lab | Space-time maps (`drawMaps`) | Hover reads the value at (t, ρ̂) for the Lab and TORAX | S |
| HMI-14 | P2 | Lab | Power and current | Hover a segment for its name, value and share, then its history in the shared popup (R2 reuse) | M |
| HMI-15 | P2 | Lab | Radial profiles | Hover readout at ρ̂ (Lab, TORAX, t = 0, pins); pinned runs' profiles at the cursor | M |
| HMI-16 | P2 | Lab | Side pane score tiles (`drawScores`) | Hover a return for its cumulative history (R2 reuse); the TORAX tile names its reward | S |
| HMI-17 | P2 | Lab | Segmented switches | Remember colour-by, profile tab, map tab and reward slot per viewer, as R3 does; URL parameters still win | S |
| HMI-18 | P2 | Lab | The plasma, live (`makeTorus`) | The q = 1 and q = 2 labels collide with the NBI label on the right cut face: avoid the collision | M |
| HMI-19 | P2 | Ch. 4, ch. 5, primer 6 | Episode replay (`wReplay`) | Click or drag to scrub; the tooltip shows the hovered row's quantity, with units, for each policy | M |
| HMI-20 | P2 | Primer 5 | Operating space widget (`wOpspace`) | Hover the trajectories; Play toggles to Pause; a palette that does not reuse the limit red and follows the theme | S |
| HMI-21 | P2 | Primer 4 | Power balance (`wPower`) | Mark clipped curves instead of drawing flat lines; break the Q curve where no equilibrium exists | S |
| HMI-22 | P2 | Primer 1 | The machine (`wMachine` via `makeTorus`) | "B_θ (from I_p)" overprints the ECRH label; "I_p" sits on the plasma | S |
| HMI-23 | P2 | Lab | Traces vs the new Plots view | Decide the overlap: keep Traces as the grouped view, draw both with the shared `plotHist` | S |
| HMI-24 | P3 | Index, ch. 4 | Results scatter (`wResults`) | Label PI's vertical line; add squares (ablations) to the legend | S |
| HMI-25 | P3 | Primer 4 | Scalings (`wScalings`) | One density unit (10²⁰ m⁻³); slider value does not wrap | S |
| HMI-26 | P3 | Primer 2 | Safety factor (`wQ`) | Phone: fit the "poloidal cross-section" title; size the canvas to its drawing | S |
| HMI-27 | P3 | Site | ρ̂ on canvas and in notes | The hat renders displaced to the right; draw it explicitly on canvas | S |
| HMI-28 | P3 | Lab | Side pane timeline (`drawTimeline`) | Label the pedestal-onset mark; hover a lane for its value at that time | S |
| HMI-29 | P3 | Lab | The knobs on a phone (`drawKnobs`) | Remove the ~130 px blank band; stop truncating the controller box | S |
| HMI-30 | P3 | Lab | Reward area | Hover reads each term at the hovered second | S |

Effort: S under half a day, M about a day, L more than two days.

---

## P1: do now

### HMI-01 · Lab · Numbers at the cursor: finish R1–R4

**Where.** `docs/javascripts/lab.js` `drawReadout()` (l. 2578 on main), `.lab-ro` rules in `docs/stylesheets/theme.css`
(l. 119–124, 190–193). On the branch: `QTY()`, `maAt()`, `buildReadout()`, `plotHist()`, `drawNumPlots()`, `showPopAt()`.

**State on the branch.** Done well: averages in small print, TORAX small print (now also for heating), a "-0.00" guard,
a hover popup with the run solid, TORAX dashed, pins, the cursor, "t [s]" and the unit in the title. The Plots view has
titles with units, the value at the cursor, click to scrub, and the choice remembered (`store "numview"`). The popup
is placed inside the Lab root, so it also shows in the browser's full screen.

**Still to fix (found on the branch):**
1. **Touch:** each tile's label is a link to the equation sheet. On a phone, tapping the tile where the label is opens
   the equation sheet instead of the history (reproduced at 390 px). On coarse pointers (`matchMedia("(hover: none)")`),
   the first tap anywhere on a tile should open the popup, and the popup's title should carry the "∑" link.
2. **Hint text:** "hover a number for its history" should read "tap a number…" on touch screens.
3. **Small print size:** `.ro-ma i` is 0.4rem (8 px) and `.ro-ma` 0.48rem (9.6 px). Make the window labels at least
   9 px, or drop them from each tile and keep the one legend line "5 s · 20 s · 60 s" (already above the grid).
4. **Meaningless means:** trailing means of *resistive flux* (a running total) mean nothing. Mark it `noma` as `t` is,
   or show its rate in Wb/s. *True threshold ÷ scaling* is already `noma`.
5. **Partial windows:** before t = 20 s and t = 60 s, `maAt()` silently averages fewer seconds. Show those values muted,
   with "over the first N s" in the popup or as a title attribute.
6. **Units convention (R4):** pure numbers (q, Q, H98, β_N, l_i) show no unit. For ratios, the unit slot can name the
   reference, "× n_G" for f_GW and "× P_LH" for P_SOL/P_LH. Either way, the popup's y label should say "(dimensionless)".
7. **Q's average (consider):** the arithmetic mean of Q is dominated by spikes when the heating is low. The gain over a
   window, Σ P_fus / Σ (P_aux + P_ohm), is the physically meaningful one.

**Why.** The panel is the Lab's main readout. A reader comparing a run with TORAX needs the trend (averages) and the
path (history) without leaving it.

**Accept.**
- At 1440 × 900, 390 × 844 and 844 × 390, light and dark: every tile shows label, value and unit, three means, and TORAX where recorded. No wrapped unit, no text cut.
- A phone tap on any part of a tile, label included, opens the popup. A second tap or a tap elsewhere closes it. The equation link is reachable from the popup.
- Tab focuses a tile and shows its popup; Esc hides it.
- Small print is ≥ 9 px.
- No means on t, resistive flux or true threshold ÷ scaling. Partial windows are visibly marked.
- `?preset=phys_ppo_dr&t=101` shows "TORAX 0.00" for H98, never "-0.00".
- The Numbers | Plots choice survives a reload, and in full screen the switch sits in the Numbers tab's panel header.

### HMI-02 · Lab · side pane, Outcome sparklines

**Where.** `drawSpark()` (l. 3411), canvas `sv`. Branch: "the Outcome sparklines use" the shared popup.

**Change.** Keep the popup (R2). Also: click or drag on a sparkline moves the time, the same rule as Traces. On touch, a
tap opens the popup and a horizontal drag scrubs. In the popup, label the dashed threshold with its value ("limit 1",
"knee 3", "paid 1.2 ×"), as `QTY().ref` already does for the Plots view.

**Why.** The sparklines have no axis, no unit except T_e(0), and no TORAX. They read as status lights. The popup turns
them into the same instrument as the Numbers tiles. Scrubbing from them is what a reader tries first.

**Accept.** Hover (or tap) any sparkline row: the popup shows that quantity's history with units, TORAX dashed and the
labelled threshold. Clicking at x moves the cursor to the matching second. On a phone, a tap does not scroll the side pane.

### HMI-03 · Lab · every time axis scrubs and shows the cursor

**Where.** Generalise `scrubFrom(ev, cv)` (l. 2696). Today it reads `cv.rows[0]` and is attached to `xv` (Traces) and
`ks` (knob strips) only. Each draw function should store its time box as `cv.tbox = {x0, x1, t1}`, and one handler
serves `mv` (`drawMaps`), `ra` (`drawRewardArea`), `bv` (`drawBalance`, fractions box only), `sv` (`drawSpark`) and the
branch's Plots view.

**Change.** Pointer down or drag on any time axis sets `S.cursor`, pauses playback and updates the Play button.
`drawBalance` also gets the accent cursor line the other plots have.

**Why.** "Clicking a plot scrubs time" is part of R3. Today a reader can click Traces but not the maps or the reward
area, two plots of the same episode.

**Accept.** In each listed plot, clicking at the x of second N sets the side pane's time slider to N (±1). Dragging
scrubs. Clicks outside the time box do nothing. Every time plot shows the cursor line.

### HMI-04 · Site · shared label helpers in `widgets.js`

**Where.** `docs/javascripts/widgets.js`: `frame()` (l. 131), `line()` (l. 198), `RT` export (l. 982). `fitText()` is in
`lab.js` (l. 3039) and should move to `RT`.

**Change.**
1. `frame(…, {title, short})`: draw `title` if it fits `box.w`, otherwise `short`, otherwise an ellipsis via `fitText`.
   Today titles run past the canvas or over the next panel (D13, D17, D23–D26, D30, D33).
2. `RT.legend(ctx, col, items, x, y, maxW)`: draws swatch + label entries, wraps to new lines and returns the height
   used, so callers keep room for it. It replaces four hand-written legend loops (Traces, knob strips, Lab reward bars,
   primer reward explorer).
3. When `o.xlabel` is set, keep 30 px under the box. Callers that compute boxes from `h` (Traces, knob strips, power
   fractions) must leave that margin.
4. Clip series to the box (`ctx.save(); ctx.rect(box); ctx.clip()` in `line()` when a box is passed). Where a series
   leaves the top, draw a small "▲" at the box edge instead of a flat line along it.
5. At least 3 ticks per axis (today `max(2, …)`; the phone maps show only 0 and 100).

**Why.** Most of the R4 defects below come from the same few lines. Fixing them once fixes every widget.

**Accept.** No canvas title on any page overprints another title or leaves its canvas at 390 px. No x label is cut.
No series is drawn outside its box. Every axis shows ≥ 3 ticks.

### HMI-05 · Lab · Traces: labelling

**Where.** `drawTraces()` (l. 2598).

**Change.** Use HMI-04's margin and `legend()`. The last box ends at `h − 24`, so "time [s]" (drawn from `h − 6`) is cut
off, and the pin legend at `h − 5` prints over it. Name the colours in the two titles that do not:
"heating [MW]: NBI (orange), ECRH (cyan); dashed: TORAX total" and
"return: benchmark (blue), audited (green), custom (pink); dashed: TORAX".
In the physics environment, use the slot names.

**Accept.** At all three sizes, with 0 and 3 pins: "time [s]" is fully visible, the pin legend sits on its own line(s)
below it, and every coloured series in every row is named in its title or the legend.

### HMI-06 · Lab · The knobs: strip legend

**Where.** `drawKnobStrips()` (l. 3192).

**Change.** The legend (baseline `h − 9`) overlaps "time [s]" by about 3 px. On a phone it prints over it (seen at 390 px).
Use `legend()` with a reserved row. Prefix pins with "pinned:", as Traces does.

**Accept.** "time [s]" and the legend never touch. Pins read "pinned: …" in both Traces and the knob strips.

### HMI-07 · Lab · Radial profiles: labelling

**Where.** `drawProfiles()` (l. 2720).

**Change.**
- In the q tab, the t = 0 curve and TORAX's q are clamped at 6.3 on a 0–6 axis. Both are drawn above the box and through
  the title (desktop and phone). Clip to the box (HMI-04).
- Name the t = 0 curve in each title ("dotted: t = 0"). In the T tab it is drawn in the grid colour and is near
  invisible, so use `col.muted`.
- The "3/2" and "2" labels use `col.grid` and cannot be read in light or dark. Use `col.muted`.

**Accept.** In all four tabs, every line is named in the title. Nothing is drawn above the box. The 3/2 and 2 labels
are readable in both themes.

### HMI-08 · Lab · Power and current: labelling

**Where.** `drawBalance()` (l. 3604), `stackBar()` (l. 3581).

**Change.**
- The three titles are plain `fillText` at x = 0 and are cut: "…radiated (grey)" on desktop, all three on a phone and in
  full screen. Give each a short form and fit it (HMI-04).
- Segments under 44 px drop their label, and there is no legend: ohmic, radiated, stored or "into W", ECCD, bootstrap,
  and on a phone ECRH. Add a one-line legend of segment colours under the "out" bar, or label small segments outside
  the bar with a leader line.
- Pinned runs draw only the non-inductive fraction, unnamed. Either say so in the title ("pins: non-inductive") or
  draw all four.
- Add the cursor line (HMI-03).

**Accept.** At 390 px and in full screen, no title is cut. Every colour on the bars can be named from the panel.
Pinned lines are explained.

### HMI-09 · Lab · Reward: labelling

**Where.** `drawReward()` (l. 2847), `drawRewardArea()` (l. 3663).

**Change.** Add "penalty" (red) to the legend; the custom row draws it. Wrap the legend (`legend()`): on a phone,
"q95" falls off the end. The area title carries the number a reader wants ("return so far 1.52 of 3.46") and is cut
on a phone. Put the number first or on its own line.

**Accept.** At 390 px, all five legend entries and the "return so far" figure are visible.

### HMI-10 · Primer · multi-panel widgets on a phone

**Where.** `widgets.js` `wDiffusion()` (2 panels, l. 391), `wProfiles()` (3 panels, l. 496), `wScalings()` (2 panels, l. 809),
`lab.js` `wPower()` (2 panels, l. 3885). Also `wReward()` (l. 595): `box = {x: 130, w: w − 230}`.

**Change.** Add a small helper, `RT.panels(w, n)`. At or above 560 px it returns the side-by-side boxes; below 560 px it
stacks them, and the widget sets `cv.h` and calls `cv.fit()` in its `resize()`. This is allowed: `canvas()` already
reads `st.h` on `fit()`. For `wReward`, scale the margins with width (`x = min(130, 0.3 w)`, right margin
`min(100, 0.25 w)`) and wrap the legend.

**Why.** At 390 px every one of these figures has titles printed over each other (D23–D27). In `wPower` the in-plot
legend also runs into the other panel. These are the primer's first figures, and many readers open them on a phone.

**Accept.** At 390 × 844: each panel has its own full-width row, every title is readable, and the reward explorer's bars
are at least 220 px long with all four legend entries visible. At 1440 px nothing changes.

---

## P2: next

### HMI-11 · Lab · Traces: hover readout (R2 variant)

**Where.** `drawTraces()`, canvas `xv`. A `pointermove` without a button pressed (scrubbing keeps its current meaning).

**Change.** A thin vertical hover line across all rows, and a tooltip for the row under the pointer listing each
series at the hovered second: "t = 87 s · T_e(0): Lab 9.8 keV, TORAX 10.4 keV, pin 1 9.6 keV". Use `cv.showTip`, which
already exists. On touch, a long press shows it.

**Why.** Today the only way to read a trace value is to scrub and look at the Numbers panel. R2 in reverse: from the
plot to the number.

**Accept.** Hovering any row shows the values of every series drawn in that row, with units, at the hovered second.
Moving off the canvas hides it.

### HMI-12 · Lab · Operating space: hover, jump, legend

**Where.** `drawOps()` (l. 2806), canvas `ov`.

**Change.** Hover finds the nearest point of the Lab, TORAX or pinned trajectory and shows "Lab, t = 101 s: f_GW 0.82,
q95 3.34, β_N 1.28". A click moves the cursor to that t. This is the natural scrub for a phase plot, which has no time
axis. Add a legend line: "solid: Lab · dashed: TORAX · pins". Add q95 ticks (2, 3, 5, 10) on the right axis, since
readers think in q95, not 1/q95. Move "β_N = …" out of the shaded band into the legend line.

**Accept.** Each trajectory's identity and time can be read by hovering. Clicking a point moves the side pane time to
that point's second. The legend names every line style.

### HMI-13 · Lab · Space-time maps: hover readout

**Where.** `drawMaps()` (l. 3489), canvas `mv`.

**Change.** Hover over either map: "t = 104 s, ρ̂ = 0.42: T_e 12.3 keV (TORAX 13.1)". Read the values from the same
`labMap`/`tor` accessors that build the images. Scrubbing comes from HMI-03.

**Accept.** Hover values match the Radial profiles panel at the same t and ρ̂ (±1 grid cell).

### HMI-14 · Lab · Power and current: hover a segment for its history

**Where.** `drawBalance()`, `stackBar()`. Reuse the branch's `showPopAt()` and `plotHist()` with ad-hoc quantities
(`{k: "Palpha", lab: "P_α", unit: "MW"}`).

**Change.** Hover a bar segment to see its name, value, unit and share ("α heating 67 MW, 39 % of the input"), then the
same history popup as the Numbers tiles. On phones, tap. This also fixes the unlabelled small segments (D14) for
readers who look closer.

**Accept.** Every segment, including ones narrower than 10 px, can be identified by hovering. The popup shows its
history with units and pins.

### HMI-15 · Lab · Radial profiles: hover readout and pins

**Where.** `drawProfiles()`, canvas `pv`. The primer's `wProfiles()` already does the readout (l. 557–578), so copy that.

**Change.** Hover shows "ρ̂ = 0.40: Lab 1.12, TORAX 1.18, t = 0: 3.9, pin 1: 1.05". Draw each pin's profile at the
cursor time in its pin colour, since `pn.recs[t].prof` is stored already.

**Accept.** With two pins, all four tabs show the pins' profiles and name them in the readout.

### HMI-16 · Lab · side pane score tiles

**Where.** `drawScores()` (l. 2892), `.lab-scores-side` in `theme.css` (l. 184–188).

**Change.** Hovering a tile shows the cumulative return of that reward through the cursor, as the shared popup:
Lab solid, TORAX dashed for the column it was recorded under, pins. The TORAX tile's small print is hidden in the side
pane, so its label should say which return: "TORAX · benchmark" or "TORAX · physics env".

**Accept.** Each tile's label alone tells which reward it is. Hovering any tile shows a history with the y label "return".

### HMI-17 · Lab · remember the segmented switches

**Where.** The colour-by `cbBtns` (l. 1514), profile `tabBtns` (l. 1571), map `mapBtns` (l. 1590) and reward `rewBtns`
(l. 1610), with the existing `store`.

**Change.** Store each choice the way the branch stores `numview`. On boot, the URL (`?tab=`, `?color=`) overrides
the stored value.

**Accept.** Choose the j tab and the n_e map, reload: both are restored. `?tab=q` still opens q.

### HMI-18 · Lab · The plasma, live: label collisions

**Where.** `makeTorus()` `draw()`: rational-surface labels (l. ~500–518) at `surfPoint(rq, −0.6, phi)`, the NBI label
(l. ~705) and the ECRH label (l. ~712).

**Change.** Collect label boxes as they are drawn. If a rational-surface label intersects a beam label, move it to the
other side of its surface (θ = +0.6) or drop it.

**Accept.** With `?preset=pi&t=110` at 1440, 390 and 844 × 390, "q = 1", "q = 2", "NBI 33 MW" and "ECRH 20 MW" never overlap.

### HMI-19 · Primer · episode replay

**Where.** `widgets.js` `wReplay()` (l. 684), on ch. 4 designs, ch. 5 limitations and primer 6.

**Change.** Clicking or dragging on a plot moves the time slider, the same rule as in the Lab. Today hover moves the
cursor line but clicking does nothing. Make the tooltip specific to the hovered row: "Q at t = 120 s: PI 9.8 ·
PPO seed 1 141 · …". Today one long line per policy lists every quantity. Give the I_p row a third y tick (HMI-04).

**Accept.** Clicking at second N sets the slider to N. The tooltip shows only the hovered row's quantity, with its unit.

### HMI-20 · Primer 5 · operating space widget

**Where.** `lab.js` `wOpspace()` (l. 4009).

**Change.** Hover shows the nearest point's policy, t, f_GW and q95. The Play button toggles to Pause and back; today it
can only start. `PAL[8]` is `#e34948`, the same red as the limit shading and the "q95 = 2" label, and PPO seed 1 gets
it. Use `colors().series` plus theme-aware extras and keep red for limits only.

**Accept.** No trajectory uses the limit red. Pause pauses. Hovering a line names it.

### HMI-21 · Primer 4 · power balance

**Where.** `wPower()` `draw()` (l. 3941).

**Change.** The loss curve is drawn with `Math.min(loss, ymax)`, so above 29 keV it runs flat along the top and looks
like a plateau. Clip it (HMI-04) and mark it with "▲". At P_aux = 0, `balance()` can return null, which is plotted as
Q = 0.001 (clamped to 0.01). That gives a vertical line at the left edge which contradicts the note ("ignited… Q
limited by the ohmic megawatt"). Plot nulls as gaps.

**Accept.** No flat line along the top of either panel. "cut the heating" shows a gap or a real point, not a drop to 0.01.

### HMI-22 · Primer 1 · the machine: label collisions

**Where.** `makeTorus()` arrows (l. 811–816) against the ECRH label (l. ~712), as drawn by `wMachine()`.

**Change.** "B_θ (from I_p)" overprints "ECRH 20 MW / 170 GHz microwaves" at the default view, on desktop and phone.
"I_p 3.0 MA" sits on the plasma cut, blue on purple, and is hard to read in dark mode. Move the B_θ arrow to the far
side of the cut (or offset its label below the ECRH box). Draw the arrow labels with a 2 px halo in `col.panel`.

**Accept.** At the default yaw, at 1440 and 390 px in both themes, no two labels overlap and each is readable.

### HMI-23 · Lab · Traces and the Plots view: one renderer

**Where.** `drawTraces()` and the branch's `drawNumPlots()` / `plotHist()`.

**Decision.** Keep both. Traces groups quantities with their limits (q_min with q95, f_GW with P_SOL/P_LH) and shows the
pedestal band. The Plots view is one quantity each. Draw both with `plotHist()` so ticks, cursor, TORAX dashing and pin
colours look the same. Then Traces only adds the grouping.

**Accept.** The same quantity in Traces and in Plots has the same colours, dash pattern and cursor style.

---

## P3: when convenient

- **HMI-24 · Index and ch. 4 · results scatter** (`wResults`, l. 867). Label the vertical dashed line ("PI, benchmark
  3.79"), as the horizontal one is. Add "■ ablation, ● run" to the legend chips row; today it is only in the note. On a
  phone, "PI, audited 3.50" sits under a cluster of points, so place it at the right end. *Accept:* both PI lines are
  labelled in the figure; marker shapes are explained in the figure.
- **HMI-25 · Primer 4 · scalings** (`wScalings`). The slider and left axis use 10¹⁹ m⁻³, the note 10²⁰ m⁻³. Use 10²⁰ m⁻³,
  as the Lab does. The slider value wraps to two lines on a phone, so add `white-space: nowrap` on `.rt-ctl-val`.
  *Accept:* one density unit across the widget.
- **HMI-26 · Primer 2 · safety factor** (`wQ`). At 390 px, "poloidal cross-section" is cut at the right, and the
  330 px canvas leaves ~150 px empty above and below the torus. Fit the title (HMI-04) and size `cv.h` from the width.
- **HMI-27 · Site · ρ̂.** U+0302 after ρ renders with the hat displaced to the right on the canvas axis labels
  (primer profiles, Lab profiles, Lab maps) and in the maps note, in the browser used here. Add `RT.rhoHat(ctx, x, y)`
  that draws ρ and a small caret. Check the HTML notes on other systems. *Accept:* the hat sits over the ρ on every canvas.
- **HMI-28 · Lab · side pane timeline** (`drawTimeline`, l. 3305). The dotted pedestal-onset mark has no label: add a
  "ped." tick label or a title attribute. Hovering a lane can show "q_min < 1 from 57 s". The lanes already scrub.
- **HMI-29 · Lab · the knobs on a phone** (`drawKnobs`, l. 3095). The two 318 px canvases stack, which leaves a ~130 px
  blank band under the dials, and the controller box truncates ("heating on the clock (ope…"). In the narrow layout,
  set `kv.h` from the content and let the box text wrap to three lines.
- **HMI-30 · Lab · reward area** (`drawRewardArea`). Hover reads each term at the hovered second ("t = 120 s: fusion
  0.021, H98 0.019, q_min 0.003, q95 0.007").

## Leave as is

- **Safety factor, current-diffusion toy, reward explorer, scalings, power balance (primer).** Their numbers are set by
  sliders, not a running time series, so averages, hover history and a Plots view have nothing to show. Only the R4
  fixes above apply.
- **Results scatter.** No time axis; the existing point tooltip is the right R2.
- **The plasma, live: status chip, narration, heating strip.** These are glance views. The Numbers panel sits next to
  them and the plasma has its own hover. A history popup on the chip would duplicate the Numbers panel.
- **Knob dials.** The strips beside them are the history; averages belong in the Numbers panel's heating tile.
- **Simulation parameters, reward designer, scoreboard, Labels / A–Z / About cards.** Inputs and tables, not readouts.
  The About card should get one line on the Numbers panel ("small numbers: 5, 20, 60 s averages; hover or tap a number
  for its history; Numbers | Plots switches the view"); fold that into HMI-01.
- **Full-screen layout.** It needs no change of its own. The checks are in HMI-01 (the switch inside the Numbers tab,
  the popup inside the Lab root so the browser's full screen shows it) and HMI-10 (phone sizes).

---

## Labelling and layout defects found

Mode: L light, D dark, P phone 390 × 844, S phone on its side 844 × 390. "All" means seen in every mode tried.

| # | Page | Widget / panel | Where in the figure | Code | Mode | Fixed by |
|---|------|----------------|---------------------|------|------|----------|
| D01 | Primer 7 | Lab · Numbers | H98 tile at `?preset=phys_ppo_dr&t=101`: "TORAX -0.00" (the data hold −7 × 10⁻⁶) | `drawReadout` `f()` | All | HMI-01 (fixed on branch) |
| D02 | Primer 7 | Lab · Numbers | j(0) tile: unit wraps, "²" alone on the next line; "P_NBI + P_ECRH" and "P_SOL / P_LH" wrap and tiles are uneven | `.lab-ctl .lab-readout` 3 columns, `.lab-ro em` | P | HMI-01 (2 columns on branch) |
| D03 | Primer 7 | Lab · Numbers (branch) | Tapping a tile on its label opens the equation sheet instead of the history; hint says "hover" | `buildReadout` label `<a>` | P | HMI-01 |
| D04 | Primer 7 | Lab · Numbers (branch) | Average labels 0.4rem ≈ 8 px | `.lab-ro .ro-ma i` | All | HMI-01 |
| D05 | Primer 7 | Lab · Numbers (branch) | Means of the cumulative "resistive flux"; partial windows not marked | `QTY()` flux entry, `maAt()` | All | HMI-01 |
| D06 | Primer 7 | Lab · Traces | Bottom: "time [s]" cut by the canvas edge | `drawTraces` box layout | All | HMI-05 |
| D07 | Primer 7 | Lab · Traces | Bottom: the pin legend prints over "time [s]"; second pin label cut ("pinned: Heating cu") | `drawTraces` legend loop | All with pins; cut on P | HMI-05 |
| D08 | Primer 7 | Lab · Traces | "return" row: blue/green/pink and the dashed TORAX line unnamed; "heating" row: orange/cyan unnamed | `drawTraces` `rows` titles | All | HMI-05 |
| D09 | Primer 7 | Lab · Knobs strips | Bottom: legend overlaps "time [s]"; pins lack "pinned:" | `drawKnobStrips` legend | Visible on P and D | HMI-06 |
| D10 | Primer 7 | Lab · Radial profiles, q tab | Top: t = 0 and TORAX q clamped at 6.3 run through the title | `drawProfiles` `Math.min(v, 6.3)` | All | HMI-07 |
| D11 | Primer 7 | Lab · Radial profiles, q tab | Right: "3/2" and "2" in the grid colour, unreadable | `hline(..., col.grid, ...)` | L, D | HMI-07 |
| D12 | Primer 7 | Lab · Radial profiles | The t = 0 curve is named nowhere; in the T tab it is drawn in the grid colour | `drawProfiles` | All | HMI-07 |
| D13 | Primer 7 | Lab · Power and current | All three titles: "…radiated (grey)" cut on desktop; all cut on a phone and in full screen | `drawBalance` `fillText` at x = 0 | All | HMI-04, HMI-08 |
| D14 | Primer 7 | Lab · Power and current | Bars: segments < 44 px (ohmic, radiated, into W, ECCD, bootstrap, ECRH on P) have no label and no legend | `stackBar` | All | HMI-08, HMI-14 |
| D15 | Primer 7 | Lab · Power and current | Fractions plot: pins draw one of four series, unnamed; "time [s]" cut on P; no cursor line | `drawBalance` | All | HMI-03, HMI-08 |
| D16 | Primer 7 | Lab · Reward | Legend lacks "penalty"; on P the legend loses "q95" and the area title loses "return so far …" | `drawReward`, `drawRewardArea` | All; cut on P | HMI-09 |
| D17 | Primer 7 | Lab · Operating space | Dashed TORAX line and pins have no legend; title cut on P ("(a Hugill-") | `drawOps` | All | HMI-04, HMI-12 |
| D18 | Primer 7 | Lab · The plasma, live | Right cut face: "q = 1"/"q = 2" collide with "NBI 33 MW" | `makeTorus` l. ~500 vs ~705 | L, P, S | HMI-18 |
| D19 | Primer 7 | Lab · The knobs | ~130 px blank band under the dials; controller box text cut "(ope…" | `drawKnobs` narrow layout | P | HMI-29 |
| D20 | Primer 7 | Lab · side pane Outcome | "TORAX" tile does not say which return (small print hidden in the side pane) | `.lab-scores-side small {display:none}` | All | HMI-16 |
| D21 | Primer 7 | Lab · side pane sparklines | No units except T_e(0); thresholds unlabelled; no TORAX | `drawSpark` | All | HMI-02 |
| D22 | Primer 7 | Lab · Space-time maps | Only two time ticks (0, 100) | `frame` tick count | P | HMI-04 |
| D23 | Primer 3 | TORAX profiles | Top: three panel titles overprint each other | `wProfiles` | P | HMI-10 |
| D24 | Primer 3 | Current-diffusion toy | Top: "current density j [MA/m²]" and "safety factor q" overprint | `wDiffusion` | P | HMI-10 |
| D25 | Primer 4 | Greenwald and IPB98 | Top: the two titles overprint | `wScalings` | P | HMI-10 |
| D26 | Primer 4 | Power balance | Titles overprint; the left panel's in-plot legend runs into the right panel; "ITER goal Q = 10" crosses the curve | `wPower` | P | HMI-10 |
| D27 | Ch. 1, primer 6 | Reward explorer | 230 px fixed margins leave ~130 px for bars; legend cut after "H98 (ga" | `wReward` `box` | P | HMI-10 |
| D28 | Primer 3, 4 | Diffusion toy, TORAX profiles, power balance | Clipped series drawn as flat lines along the top edge look like data (q at 6–6.3; losses above 29 keV) | `Math.min(v, …)` in each | All | HMI-04, HMI-21 |
| D29 | Primer 4 | Power balance | Right panel, P_aux 0–2 MW: Q drops to 0.01 (a null equilibrium plotted as 0.001) | `wPower` `QQ.push(… 0.001)` | All | HMI-21 |
| D30 | Ch. 4, ch. 5, primer 6 | Episode replay | Bottom row title cut: "…audited (" | `wReplay` panel titles | P | HMI-04 |
| D31 | Primer 5 | Operating space widget | PPO seed 1 drawn in the limit red (`#e34948`); palette fixed, not theme-aware | `wOpspace` `PAL` | L, D | HMI-20 |
| D32 | Primer 5 | Operating space widget | Play never becomes Pause and cannot pause | `wOpspace` button | All | HMI-20 |
| D33 | Primer 5 | Operating space widget | Title cut: "…TORAX episc" | `wOpspace` `frame` title | P | HMI-04 |
| D34 | Primer 1 | The machine | "B_θ (from I_p)" overprints the ECRH label; "I_p 3.0 MA" on the plasma, low contrast in dark | `makeTorus` arrows l. 811–816 | All | HMI-22 |
| D35 | Primer 2 | Safety factor | "poloidal cross-section" cut at the right; ~150 px empty above and below | `wQ` | P | HMI-26 |
| D36 | Index, ch. 4 | Results scatter | PI's vertical dashed line unlabelled; squares only explained in the note; PI label under a cluster on P | `wResults` | All | HMI-24 |
| D37 | Primer 4 | Greenwald and IPB98 | Densities in 10¹⁹ and 10²⁰ m⁻³ in one widget; slider value wraps | `wScalings` | All; wrap on P | HMI-25 |
| D38 | Primer 3, 7 | TORAX profiles, Lab profiles and maps | ρ̂ renders with the hat displaced right (canvas axis labels, maps note) | canvas `fillText("ρ̂")` | All, this browser | HMI-27 |
| D39 | Primer 7 | Lab · side pane timeline | Dotted pedestal-onset mark unlabelled | `drawTimeline` | All | HMI-28 |
| D40 | Ch. 4, ch. 5, primer 6 | Episode replay | The I_p row shows two y ticks only (0, 10) | `frame` tick count | All | HMI-04 |

**Dark mode.** Nothing became illegible in dark mode apart from D11 (both themes) and the "I_p" arrow label in D34.
Theme colours come from `colors()` throughout, except `wOpspace`'s `PAL` and the Lab's fixed `TONE_COLOR` (which works
on both backgrounds).

**No horizontal page scroll** was found on any page at 390 px. The full-screen tab strip scrolls inside itself, by design.
