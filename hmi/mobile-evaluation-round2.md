# Ramp-up Lab on phones: independent HMI evaluation, round 2 (verification)

> Kept in the repository as the record of the expert evaluation in `HMI-MOBILE-SPEC.md` §6–7. The screenshots and driver scripts it names were working files and are not included; the findings are reproducible with `scripts/check_lab_mobile.mjs`, which now covers them.

**Evaluator:** the same independent reviewer as in round 1. I made no changes to the repository.

**Build:** the frozen site in `site-eval2`, served locally on its own port. Its `lab.js` and `theme.css` are
byte-identical to commit 19ed28f.

**Method:** the same as round 1:

- Playwright 1.50 driving Chrome, emulating phones (`isMobile`, `hasTouch`, device pixel ratio 2).
- Taps with `touchscreen.tap`.
- Swipes and drags as raw touch sequences sent through the DevTools protocol (`Input.dispatchTouchEvent`), so Chrome's
  real gesture handling runs.

**Screenshots:** in `eval/shots2/`. File names are given with each finding.

**Not covered:**

- iPhone Safari.
- Real momentum scrolling (the emulation produces no fling).
- Safe-area insets.

**Date:** 2026-10-10.

## Summary

The round-1 fixes work.

- **All 13 findings I was asked to re-verify are fixed or partly fixed**: 12 fixed and 1 partly fixed (F03). None is
  unfixed. Among the fixed ones:
  - F16 is fully fixed upright but still cramped sideways.
  - F08 is fixed by construction but still unverified on iOS.
- **The severity 4 finding is gone.** The Controls tab now scrolls with a finger, upright and sideways.
- **All six tasks now succeed on 390 × 844.** U3 still has some friction.

The fixes introduced or exposed **11 new findings**:

- 1 at severity 3 (N1).
- 3 at severity 2 (N2, N3, N4).
- 7 at severity 1 (N5 to N11).

The severity 3 one is N1. The new "reset" button on the plasma resets the PI gains in the simulation but leaves their
sliders showing the old values. The run then uses k_p 1.00× while the Controls tab says 3.00×.

## 1. Re-verification of round-1 findings

| ID (round-1 severity) | Verdict | Evidence (390 × 844 unless noted) |
|---|---|---|
| F01 (4) Controls tab cannot be scrolled by touch | **Fixed** | Upright, three swipes starting on a label, on "Take the controls" and on a section title each scrolled the tab: 0 → 135 → 270 → 405 px. Swiping on reached the end (544 / 544 px). OUTCOME, the sparklines and the PLASMA section are all reachable (`r2-u1-04-outcome.png`). Sideways (844 × 390) one swipe scrolled 173 px. |
| F02 (3) Controls tab shows stale controls | **Fixed** | On first open "recorded on TORAX" is selected, and there is no "network correction" for plain PI (`r2-u1-02-open.png`). After picking presets in the app bar:<br>• "Randomised training": the header reads "FEEDBACK · Randomised training", with the PI-plus-network note.<br>• Physics "Heating cut at 105 s": "OPEN LOOP", with "A schedule reads nothing…" and no gains (`r2-f02-opencut.png`).<br>• "Sandbox": "YOU", with I_p ramp, NBI and ECRH (`r2-f02-sandbox.png`).<br>None of these needed a visit to Knobs. |
| F03 (3) A swipe that starts on a slider changes it | **Partly fixed** | Cases that now scroll without a change: straight vertical swipes on the track, a diagonal thumb arc (dx −48, dy −144), and swipes whose first move is up to 5 px sideways. Sideways a vertical swipe on a slider also scrolled (105 px) with no change. Cases that still change the value: three of eight start patterns (first move dx 7 / dy 4, dx 8 / dy 2, dx 10 / dy 6). They **both scrolled about 140 px and set k_p from 1.00× to 2.35×**, the point where the finger first touched. The change is now visible: "⚙ controller retuned", LIVE, "live on the Lab" selected (`r2-f03-after-wobble.png`). A plain tap on a track still jumps the value, by design. The remaining problem is **N2** (severity 2). |
| F04 (3) Tapping a quantity's name leaves the Lab | **Fixed** | Tapping the "T_e(0)" label opened its history pop-up; a second tap closed it. The URL stayed `/primer/7-lab/` (`r2-f04-label-tap.png`). |
| F05 (3) Swiping through Numbers opens pop-ups | **Fixed** | A swipe starting on the T_i(0) tile scrolled 219 px and opened no pop-up. A tap on a tile opens it (`r2-f05-tile-pop.png`), and a scroll closes it. Small remainder: the pop-up for a tile in the top rows can overlap the top 15 px of the playback bar (N7). |
| F06 (3) A given second is hard to find | **Fixed** | Three new ways to reach a given second:<br>• Tapping the time opens a stepper with −10 / −1 / +1 / +10 s (44 px buttons, `r2-f06-stepper.png`). +1 and −10 from 150 s gave 141 s, which matched the output.<br>• A tap within 5 px of a tick snaps to it and names it: "100 s · Heating on" (`r2-f09-event-bubble.png`).<br>• Fine scrubbing: with the finger held 88 px above the bar, 20 px of drag moved 25 → 30 s (0.25 s/px, bubble "30 s · fine").<br>Remainders:<br>• The time line is narrower than in round 1: 133 px at 390 and 103 px at 360, because the time button grew to 54 px. That is 1.4 and 1.9 s/px.<br>• Snapping swallows seconds while dragging (N3). |
| F07 (3) Contrast below AA | **Fixed** (for the listed elements) | Light: white on the accent fill #c42f82 is **5.15:1** (selected tab and chip, "Open the Lab", Play icon, badge). Dark: #160a26 on #ff5fb8 is **6.86:1**. Status chip, white 11 px bold, in both themes: green 4.69, amber 4.96, red 5.42, grey 5.51. Limit pills: 5.42 (red) and 4.96 (amber). What-if tag: 4.84 light, 8.16 dark. Elements outside this list still fail; see N4. |
| F08 (3, verify on device) No tap-to-jump on iOS | **Fixed by construction** | The scrubber is now a custom pointer-event control (`touch-action: none`, its own `pointerdown` and `pointermove`). Tap-to-jump and drag work in Chromium. It no longer depends on how WebKit handles a range input. Still to confirm on an iPhone. |
| F12 (2) Overlays do not behave like a phone | **Fixed** | Back with the ⋯ menu, a card or the stepper open closes it and stays in the Lab. A second Back leaves the Lab, upright and sideways. A tap outside a card closes it and does nothing else (time unchanged at 0 s). A Story time chip jumps there (t = 20 s) and closes the card. The chips are 32 px tall. Minor remainder: ✕ with a card open closes only the card (N9). |
| F13 (2) Pins are hard to tell apart and lose | **Fixed** | Pinning the same run twice says "This run is already pinned". Pins are named by what differs: "Pinned: PI controller (transport × 1.50×)". A fourth pin says "…; pin 1 (PI controller) was replaced". Legends read "pinned: PI controller (transport × 1.50×)" and so on (`r2-f13-legend2.png`). Pin colours are lavender, grey and brown, never the run's pink. "Clear pins (3)" shows "3 pins cleared · Undo" for 6 s, and Undo restored all three. Cosmetic remainder: the history pop-up names pins only "pin 1". |
| F14 (2) Rotating changes the open tab | **Fixed** | Numbers at 100 s, upright → sideways → upright: the tab, time and preset were all kept (`r2-f14-land.png`). |
| F15 (2) Limit violations missing from the chip | **Fixed** | At the end of the benchmark PI run, two pills sit next to the green "FLAT-TOP · PAID AS H-MODE" chip: "f_GW 1.19 > 1" (red) and "q_min 0.39 < 1" (amber) (`r2-u1-04-outcome.png`). The pills also show sideways and in dark mode. Cosmetic remainder at 360 px: see N10. |
| F16 (2) Small instrument area; Numbers wastes it | **Fixed upright, partly sideways** | Upright: two tile columns, the legend reduced to "tap a number for its history", and T_e(0) is the 4th tile, visible without scrolling (`r2-f16-numbers.png`). Averages are 11 px (italic values 10 px). Sideways the area is still 228 px tall, and only one row of two tiles shows below the heading. |

**Spot checks of the other changes:**

- **F10:** the tab is now "Heating waves", with a heading.
- **F11:** the experiment 12 link opens Profiles with T selected. The page gained a phone note: "Where the text below says
  side pane, look in the Controls tab".
- **F19:** "more ▾" appears on a clamped narration only.
- **F20:** off chips are dashed and at full contrast (16.7:1).
- **F23:** the poster is captioned "preview at t = 110 s" and refits to 356 px after leaving.
- **F24:** sideways, menu rows are 44 px and the menu fits.
- **F26:** "reset" works and offers Undo, but see N1.
- **F22** (label collisions on the torus) is unchanged, as stated.

## 2. Tasks on 390 × 844

| Task | Round 1 | Round 2 | Notes |
|---|---|---|---|
| U1: open the Lab and play PI to the end | yes | **yes** | Card → Open → ▶ → 151 s, ending on "Play again from the start". The chip and the limit pills show the end state. The scores are now reachable at the bottom of Controls. |
| U2: when does the heating come on; T_e(0) there | partly | **yes** | The ticks are coloured by kind; heating is orange. A tap on the orange tick showed "100 s · Heating on", and the "Heating on · 100 s" callout appeared on the plasma. The heating (100 s) and pedestal (102 s) ticks are 1.5 px apart, so a tap can land on "102 s · Pedestal on schedule". The bubble names it, and −1 s twice in the stepper reached 100 s ("Heating on: 0 → 53 MW"). In Numbers, T_e(0) reads 6.2 keV in the 4th tile without scrolling, with TORAX 8.7. |
| U3: physics randomised training; when does it reach H-mode | partly | **yes, with friction** | The picker is unchanged and good. The L-H tick is green, but it sits in a cluster of five events within 3.7 px (98–103 s). A tap exactly on it gives "101 s · L-H transition", and 2 px either side gives 98 s or 103 s ("More heating"). The bubble always says where the user landed, and the stepper walks the cluster one second at a time. The chip then reads L-H TRANSITION at 101 s, "below the 1.2× margin" at 102 s, and PAID after that. What "reaches H-mode" means remains open to interpretation, which is a content matter. A slow drag through the cluster cannot stop on 104–110 s (N3). |
| U4: pin, set the L-H threshold to 1.15× in Controls, compare | no | **yes** | Pin → "Pinned: Randomised training". The Controls tab scrolls to PLASMA. Tapping the threshold's value "1.00×" opens a stepper (−0.1 / −0.01 / +0.01 / +0.1). Then +0.1 and +0.01 × 5 gives exactly 1.15×, confirmed by the what-if tag (`r2-u4-03-set.png`). Traces and the history pop-ups show the pinned run against the current one (`r2-u4-04-traces.png`). Watch out: a swipe on the PLASMA sliders can still change one (N2). |
| U5: experiment 12, then back to the text | yes, with friction | **yes** | The link opens "Heating cut at 105 s · physics environment" at 106 s, on **Profiles with T**, and the Controls tab is correct (open loop). The status is amber, with a "q_min 0.44 < 1" pill and callouts (`r2-u5-02-opened.png`). ✕ returns with the link at the same place (screen y 398.8 → 399.1). |
| U6: leave with the Back gesture | yes | **yes** | With the About card open, Back closes the card and stays in the Lab. A second Back leaves the Lab: scroll restored (300 → 300 px), playback paused, and the card says "t = 41 s". Re-entering resumes at 41 s. A further Back goes to the previous page. |

## 3. New findings (introduced or exposed by the fixes)

| ID | Sev | Where | Problem | Heuristic / task | Suggested fix |
|---|---|---|---|---|---|
| N1 | **3** | "reset" on the what-if tag (F26), any PI-based preset | **Reset changes the simulation but not the gain sliders.** After k_p was raised to 3.00× (live), tapping "reset" removed the "⚙ controller retuned" tag, hid "Back to the trained controller" and brought the audited score back to the default (3.31 → 3.32). The k_p slider and its value **still read 3.00×**, and visiting other tabs does not refresh them. The user sees one gain while the run uses another. Editing any other gain afterwards brings back "retuned", with an unclear k_p. Cause: the reset handler sets `S.tune` but never calls `tKp/tKi/tJ/tCorr.set()`, which the "Back to the trained controller" button does. Undo has the same gap for the gains. Shots: `r2-n-reset-mismatch.png`, `r2-n1-controls-after-reset.png`. | H1 (visibility of system status), H4; guided experiment 11 | Let the HUD reset (and its Undo) go through the same routine as "Back to the trained controller": set the four tune sliders from `S.tune`. Add a test that the slider values equal `S.tune` after a reset and after an Undo. |
| N2 | 2 | Sliders in the Controls and Set-up tabs (F03 remainder) | **A swipe with a slightly sideways start still changes a slider.** The gesture guard decides on the first `pointermove` (\|dx\| > 6 and \|dx\| > \|dy\| means "slide"). A swipe whose first sample is 7–10 px sideways is treated as a slide: the value jumps to where the finger first touched (k_p 1.00 → 2.35×) and Chrome still scrolls the tab about 140 px. A plain tap on any 171–339 px track also jumps the value, by design, which risks the common tap-to-stop-scrolling habit (verify on a device with momentum scrolling). The change is now announced (tag, LIVE), and reset or Undo exists, so the severity drops from 3 to 2. | H5 (error prevention); U4 | Decide later and with more travel: about 12 px, with \|dx\| > 2·\|dy\|. Move the value only by dragging the thumb, not the track: on touch, ignore track taps or route them to the stepper. Or show a 2 s "transport × 2.35× · Undo" toast on every slider commit by touch. |
| N3 | 2 | Time line, dragging | **Snapping skips seconds while dragging.** A tick within 5 px captures the drag, and at 390 px that is about 7 s on each side. A slow drag through the 98–103 s cluster of "Randomised training" showed only 91 → 98 → 100 → 102 → 103 → 111 s. Seconds 92–97 and **104–110 cannot be reached by dragging**, which hurts experiment 12's "106 and 108 s" and U3. At 360 px it is worse (1.9 s/px). The stepper and fine mode work around it, but fine mode has no affordance. | H7, H3; U3 | Snap on tap only, or during a drag only when the finger pauses. Use a 3 px snap radius while dragging. Show a one-time hint "lift your finger above the bar to scrub finely" in the bubble. |
| N4 | 2 | Controls tab: outcome sparklines and the controller class label, light theme | **Contrast fails AA on elements the F07 fix did not cover.** The sparkline values are drawn on the canvas in green #1baf7a at **2.71:1** (q95, P_SOL/P_LH, T_e(0), Q) and red #e34948 at 3.81:1 on the light background, at 12 px. They also carry pass or fail by colour alone. The class labels are white 11 px on teal "FEEDBACK" 3.55:1, amber "OPEN LOOP" 3.62:1 and pink "YOU" 4.39:1. Dark mode passes (6.9 to 8.8:1). These existed before, but the F01 fix makes them reachable on phones. Shot: `r2-u1-04-outcome.png`. | WCAG 1.4.3, 1.4.1; M8 | Use darker value colours in light mode: green #11845b and red #c72f2e, the same fills as the chips. Add ✓ / ✕ or "ok" / "limit" glyphs. Darken the class-label fills, or use dark text on them as dark mode does. |
| N5 | 1 | Tab strip edge fade (F18) | **The fade dims the selected tab.** The mask fades 12 to 15 % of the strip at each edge, and the selected tab is only scrolled 12 px clear. So "Profiles", "Traces", or "Numbers" sideways, often sits half-faded at the edge (`r2-n-tabfade.png`, `r2-f14-land.png`). | H1, H8 | Scroll the selected tab fully clear of the fade (pad at least the fade width), or do not mask the selected tab. |
| N6 | 1 | Toast | **The toast is narrower than it needs to be.** It is positioned at `left: 50%` with a −50 % transform, so its box shrink-wraps to half the screen (about 195 px upright). "Back to the calibrated plasma and the trained controller" wraps to 5 lines, and the pin-replaced message to 4. It covers the Controls sliders for 3–6 s (`r2-f26-after-reset.png`). | H8 | Use `left: 12px; right: 12px; margin: auto; width: fit-content`, or `inset-inline: 12px`. |
| N7 | 1 | History pop-up | **The pop-up overlaps the top of the playback bar.** For tiles in the upper rows it extends about 15 px over the bar (bottom at 803 px, bar top at 788 px). The bar's buttons stay above it, but the badge area looks covered (`r2-u4-05-pop.png`). | H8 | Clamp the pop-up's bottom to the top of `.fs-pb` minus 4 px. |
| N8 | 1 | Phone note in the page text | **The note uses the old tab name.** It lists the tabs as "Controls, Numbers, Heating, Knobs…", but the tab is now "Heating waves". | H4 | Update the note. |
| N9 | 1 | ✕ (Close the Lab) with a card open | **The first tap on ✕ only closes the card.** This follows the outside-tap rule, but ✕ reads as "close", and the user must tap it again to leave. | H4 | Acceptable. Optionally exempt ✕ from the swallowed taps, or give it a pressed state on the first tap. |
| N10 | 1 | Status area at 360 × 780 | **The status stack covers the top of the plasma at 360 px.** With limit pills and a what-if tag, the chip, pills and tag form three rows (86 px) over the top of the torus. "reset" covers the "central solenoid" label (`r2-f15-hud-360.png`). | H8 | At under 380 px, put the what-if tag on the chip's row or shorten it ("⚙ 1 change · reset"). |
| N11 | 1 | Event ticks | **Several tick colours are hard to tell apart.** "Heating on", "Heating cut" and "More heating" share orange. L-H and "pedestal" share green. The q_min amber (#eda100) is close to heating orange (#eb6834) for colour-blind users. In dark mode, ticks in the played part contrast 1.0–1.4:1 with the pink fill and rely on a 1 px outline. The bubble names each tick, so the cost is small. | WCAG 1.4.11; H6 | Use a shape or height difference for limits and transitions (taller, or a dot cap), and a wider outline. |

## 4. Strengths added in this round

- **The time line works for both coarse and exact time-finding.** A tap jumps there. A tick-snapped tap names the event.
  The stepper reaches exact seconds. The bubble always says where the user is.
- **Exact values without precise dragging.** Tapping any slider's value opens a stepper, which made U4's 1.15× trivial.
- **Back behaves like a phone app.** It closes overlays first, then leaves, and the page and state are restored.
- **Changes are visible and reversible.** Pins are named and de-duplicated, a replaced pin is announced, and Clear pins and
  reset both offer Undo.
- **Limit pills put alarms at a glance**, next to the confinement chip, with AA contrast.
- **Deep links open the right tab.**

## Reproduction

- **Driver:** `eval/drv.cjs` (shots folder chosen with `SHOTDIR`). Gesture helpers are in
  `eval/boot.snip`.
- **Contrast:** computed by `eval/contrast.js`, with opacity and background composited.
- **N2 start patterns:** the first touch sample offset (dx, dy) was followed by ten 15 px vertical steps 20 ms apart.
