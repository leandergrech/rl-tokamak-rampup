# Ramp-up Lab on phones: independent HMI evaluation

> Kept in the repository as the record of the expert evaluation in `HMI-MOBILE-SPEC.md` §6–7. The screenshots and driver scripts it names were working files and are not included; the findings are reproducible with `scripts/check_lab_mobile.mjs`, which now covers them.

**Evaluator:** independent reviewer. I did not build the layout and did not change any file in the repository.
**Build:** frozen site in `site-eval`, served locally; Lab page `/primer/7-lab/`.
**Reference:** `HMI-MOBILE-SPEC.md` (requirements M1 to M14, tasks U1 to U6).
**Date:** 2026-10-10.

## Summary

The phone redesign gets the big structure right. The launch card is clear. The plasma view, status chip and playback line
stay in place on every tab. Back and Close return to the exact place in the text. Deep links open the Lab in the right
state without a reload. The layout on its side is especially good.

Real touch interaction, though, exposed problems the automated suite cannot see, because it scrolls by setting
`scrollTop` and taps through selectors:

- **The Controls tab cannot be scrolled with a finger (severity 4).** This is the default tab, on every profile, upright
  and on its side. Only its first 230 to 290 px can be reached. Out of reach: the plasma parameters (including the L-H
  threshold in U4), "Take the controls", the sandbox's drive knobs, and the outcome scores.
- **The Controls tab shows the wrong controls** unless the Knobs tab was opened first. For example, it shows PI gains for
  an open-loop schedule or for the sandbox, the header names "PI controller" while "Randomised training" is loaded, and no
  mode is selected.
- **Touch gestures have side effects nobody asked for:**
  - A vertical swipe that starts on a slider changes the parameter and re-runs the episode.
  - A swipe through the Numbers tab opens history pop-ups.
  - Tapping a quantity's name in a number tile leaves the Lab for the equation sheet.
- **Finding a given second is hard.** The scrubber is 114 to 144 px wide upright, so 1 px is 1.2 to 1.6 s. There is no
  ±1 s step.
- **Contrast:**
  - White on the accent colour is 2.77:1 in dark mode. This covers the selected tab, the selected chip, "Open the Lab",
    the Play icon and the pin badge.
  - White 11 px text on the green and amber status chips is 2.8:1 and 3.1:1, in both themes.

**Findings: 27 in total.**

| Severity | Count |
|---|---|
| 4 (catastrophe) | 1 |
| 3 (major) | 7 |
| 2 (minor) | 10 |
| 1 (cosmetic) | 9 |
| 0 | 0 |

**Task verdicts (390 × 844 upright unless noted):**

| Task | Verdict |
|---|---|
| U1 | yes on all three profiles |
| U2 | partly (sideways: likely yes) |
| U3 | partly: the moment is found approximately, and the answer is ambiguous |
| U4 | no as written (Controls tab); partly through the Set-up tab |
| U5 | yes, with friction |
| U6 | yes |

## Method and limits

- **Browser and emulation:** the installed Chromium-based browser (Chrome) driven by Playwright 1.50. Phones were
  emulated with `isMobile` and `hasTouch` at a device pixel ratio of 2.
- **How I acted:** taps with `touchscreen.tap` at on-screen coordinates. Swipes and drags were raw touch sequences sent
  through the DevTools protocol, so the browser's own touch pipeline ran (pointer events, scroll latching,
  `overscroll-behavior`), as on an Android phone.
- **Profiles:**
  - 390 × 844 upright: tasks U1 to U6.
  - 844 × 390 on its side: U1 to U3, plus the menu and cards.
  - 360 × 780: U1 to U3.
  - Rotation from upright to sideways.
  - Light and dark themes.
- **Screenshots:** everything I looked at is in `eval/shots/` (file names below).
- **What I could not test:**
  - iPhone Safari (WebKit).
  - The real Fullscreen API on Android.
  - Safe-area insets (they are 0 in emulation).
  - Native picker sheets (I chose options with `selectOption` after tapping the picker).
  - Smoothness (the machine was busy).

  Findings that depend on WebKit are marked "verify on device".

## Findings

Severity follows Nielsen's scale: 0 none, 1 cosmetic, 2 minor, 3 major (fix before release), 4 catastrophe.
H1 to H10 are Nielsen's heuristics:

- H1 visibility of status
- H2 match with the real world
- H3 user control
- H4 consistency
- H5 error prevention
- H6 recognition
- H7 flexibility
- H8 minimalist design
- H9 error recovery
- H10 help

| ID | Sev | Where | Problem | Heuristic / task | Suggested fix |
|---|---|---|---|---|---|
| F01 | **4** | Controls tab, every profile, upright and sideways, light and dark | **The Controls tab cannot be scrolled by touch.** The content is 887 px tall in a 294 px area (228 px sideways), and swipes starting anywhere in it leave `scrollTop` at 0. Other tabs scroll fine. Cause: `.lab-side` keeps its desktop rule `overflow-y: auto; overscroll-behavior: contain` (theme.css l.186). Its content fits, so it cannot scroll itself, and it blocks scroll chaining to `.fs-body`. In-page check: overriding `overscroll-behavior` makes the swipe scroll. Out of reach: "Take the controls from here", the PLASMA section (transport, true L-H threshold, pedestal, Z_eff), the sandbox's I_p ramp, NBI, ECRH and Run/Step, and the OUTCOME scores. Shots: `u4-390-07-controls-noscroll.png`, `sandbox-390-01-controls.png`. | H3, H7; U4 fails as written; the sandbox (guided experiments 3, 4, 5, 15) is unusable on phones | In the phone layout set `.fs-phone .lab-side { position: static; max-height: none; overflow: visible; overscroll-behavior: auto }`. Add an acceptance test that scrolls with synthesised touch (`Input.dispatchTouchEvent`), not `scrollTop`. |
| F02 | **3** | Controls tab (default tab) | **The Controls tab shows stale or wrong content.** `updateKnobBanner()`, which also syncs the side pane, runs only while the Knobs panel is open, and on a phone that is only while the Knobs tab is selected. Seen in testing:<br>• On first open, neither "recorded on TORAX" nor "live on the Lab" is selected, and "network correction" and "Back to the trained controller" show for the plain PI controller.<br>• After picking "Randomised training", the header still reads "FEEDBACK · PI controller".<br>• For the open-loop "Heating cut at 105 s" (U5), PI gains are shown.<br>• For "Sandbox: you drive", PI gains are shown instead of the drive knobs.<br>Opening Knobs and returning fixes it. Shots: `u1-390-03-open.png`, `u4-390-02-controls.png`, `u5-390-02-opened.png`, `sandbox-390-01-controls.png` versus `sandbox-390-02-controls-after-knobs.png`. | H1, H2; U4, U5 | Run the side-pane sync on every preset or mode change, whatever panel is open: split `updateKnobBanner` into the side-pane sync and the knobs banner. |
| F03 | **3** | Set-up and Controls tabs, Chromium/Android | **Scrolling changes parameters.** Touching a slider's track jumps its value at once, so a vertical swipe that starts on a slider changes the parameter and re-runs the episode. Set-up sliders span 339 of 390 px, so almost every swipe starts on one. Measured: one swipe moved transport × from 1.00 to 1.20; another moved PI gain k_i from 1.00 to 1.05. Only the small amber "⚙ transport × 1.20×" chip on the plasma tells the user. Shot: `u4-390-06-setup-after-swipe.png`. | H5; U4 (and any later comparison is silently wrong) | On coarse pointers, commit a slider change only on a horizontal drag of the thumb: ignore track taps, or require mostly horizontal movement before changing the value. Leave a 24 px gutter without sliders for scrolling. Consider ± step buttons. |
| F04 | **3** | Numbers tab, number tiles | **A tap on a quantity's name (the 15 px link "T_e(0)", "q_min", …) leaves the Lab.** It navigates to `/primer/equations/#…` and ends full screen. On touch, `pointerover` has already set `popEl` to that tile, so the click handler's `popEl !== cell` test fails and the link is followed. Back reloads the Lab page at the top (scroll 0), on the launch card, not in the Lab. Shots: `numbers-390-after-link-nav.png`. The legend invites exactly this tap: "tap a number for its history". | H3, H5; U2 | Inside the full-screen Lab, never follow these links on touch: show the history pop-up, and put the equation link inside the pop-up, opening in a card or a new tab. Base the "second tap" test on state captured at `pointerdown`. |
| F05 | **3** | Numbers tab (and the side pane's sparklines) | **Swiping through the Numbers tab opens history pop-ups.** `pointerover` fires at touchstart, before the browser knows it is a scroll, so any swipe that starts on a tile (tiles fill the width) opens that tile's pop-up. The pop-up stays where the tile was while the content scrolls under it. It covers the tiles being sought, and in one case the scrubber and time. Only a tap outside the readout closes it, and tapping another tile opens the next. Shots: `u2-390-08-numbers-swiped.png`, `u2-390-09-numbers-swipe2.png`, `numbers-390-tap-tile.png`. | H5, H8; U2 | On touch, open pop-ups on a tap without movement (pointerup), not on `pointerover`. Close them on scroll. Keep them inside `.fs-body`, never over `.fs-pb`. |
| F06 | **3** | Playback line, upright 390 and 360 | **A given second is hard to find.** The scrubber is 144 px wide at 390 and 114 px at 360, about 37 % and 32 % of the width; the spec's Fitts row says "spans the screen width". That is 1.2 to 1.6 s per pixel: taps 3 px off the "Heating on" tick gave 96 / 104 s at 390 and 95 / 105 s at 360, and 6 px gave ±10 s. At 1× playback runs about 12 s per second, so pausing on sight overshoots. There is no ±1 s step on the phone (desktop has ← and →). | H7; U2, U3 | Add fine control:<br>• ± 1 s step buttons, for example as a long-press on the time label or a small stepper that appears while the thumb is held;<br>• snap to an event tick within about 8 px;<br>• slow down when the finger moves vertically away from the track while dragging.<br>Or give the scrubber its own full-width row above the buttons. |
| F07 | **3** | Accent-filled controls and the status chip, both themes | **Contrast below WCAG AA.** White on the accent:<br>• light theme (#d6368f): 4.39:1, against the 4.5:1 needed for text;<br>• dark theme (#ff5fb8): **2.77:1**.<br>This applies to the selected tab, the selected T_e chip, "Open the Lab" (16 px bold is not large text), the pin badge (11 px), and the Play / Pause / Replay icon (below 3:1).<br>The status chip, white 11 px bold on its fill:<br>• green: **2.82:1**<br>• amber: 3.07:1<br>• red: 3.95:1<br>• grey: 5.51:1<br>The status chip is the status-at-a-glance element (M10), and M8 requires AA in both themes. Shots: `dark-02-fs.png`, `dark-05-amber-chip.png`. | Accessibility (WCAG 1.4.3, 1.4.11); H1 | In dark mode, use dark text and icons on the bright accent (#0d0b1a on #ff5fb8 is about 7:1), or a darker fill. For the chips, darken the fills until white reaches 4.5:1, or use dark text (#0d0b1a on the current green is about 6.9:1). |
| F08 | **3** (verify on device) | Playback scrubber on iPhone Safari | **Tap-to-jump probably does not work on iPhones.** The scrubber is a native `<input type=range>` with `touch-action: none` and no pointer handler of its own. iOS WebKit's range input does not move to a tapped point on the track, so on iPhones the user would have to grab the 22 px thumb. If so, M4 ("Tapping anywhere on the track jumps there") and the spec's WCAG 2.5.7 claim fail on iOS. I could not test WebKit here. | H4; WCAG 2.5.7; U2 | Handle `pointerdown` and `pointermove` on `.pb-scrub` and map x to time yourself (a custom scrubber), with a 44 px hit area for the thumb. |
| F09 | 2 | Event ticks on the scrubber | **The ticks cannot be decoded.** There is no legend, and the names live in `title` tooltips, which touch cannot show. Heating on, flat-top and L-H transition share the same blue. The ticks are 3 px wide and pile up: physics "Randomised training" puts five events between 98 and 103 s into about 6 px, and benchmark PI has 100 and 102 s 1.6 px apart. The thumb hides the ticks under it. Shot: `u3-390-04-ticks-zoom.png`. | H6; U2, U3 | Tapping near a tick should snap to it and show its name for 2 s above the bar. Use distinct colour or shape for H-mode transitions and limits. Merge clusters into one marker with a count. Explain the ticks in the About card. |
| F10 | 2 | "Heating" tab | **The tab's name and content do not match.** "Heating" shows the "heating at human scale" frequency strip at the cursor, without a heading. At t = 0 it reads "ECRH off, NBI off, Balmer-α off" over an empty strip. A user looking for when the heating comes on (U2) opens it first and finds no time history. Shot: `u2-390-01-heating-tab.png`. | H2; U2 | Rename it (for example "Wave and beam") and add the heading from the Labels card. Alternatively, add a heating-power history to this tab. |
| F11 | 2 | Narration, story, guided experiments, cards | **The text still refers to the desktop.** The text says "side pane", which does not exist on a phone:<br>• the sandbox narration: "set the I_p ramp, NBI and ECRH in the side pane";<br>• experiments 2, 4, 6, 9, 10, 11, 12 and 13.<br>Keyboard hints appear too: "Press Play (space)", "L toggles the part names", the Scoreboard's "Click a cell".<br>Deep link `tab=T` (experiment 12, "watch the T profile") opens the Controls tab, not Profiles. | H2, H10; U5 | On coarse pointers, write "the Controls tab" and drop the key hints. Map `tab=…` in deep links to the matching phone tab (Profiles with T selected). |
| F12 | 2 | Menu, cards, Back | **Overlays do not behave as on a phone.**<br>• Back with the ⋯ menu or a card open leaves the whole Lab; Android users expect Back to close the overlay first.<br>• Cards do not close when the user taps outside them.<br>• Such a tap on a plot also moved the time (101 to 70 s).<br>• The Story card's time chips jump the time, but the card stays over the plasma and status chip, so the user cannot see the result.<br>• The time chips are 21 px tall (allowed under WCAG 2.5.8 only because of spacing).<br>Shots: `card-390-02-after-chip.png`, `back-390-01-with-card.png`. | H3, H4 | Push a history entry for an open card or menu, so the first Back closes it. Close cards on an outside tap without passing the tap through. Close or shrink the card after a time-chip tap. Make the chips 32 px tall. |
| F13 | 2 | Pin, Clear pins, plot legends | **Pins are hard to tell apart and easy to lose.**<br>• A fourth Pin tap does nothing, with no message (the limit is 3).<br>• Pinning the same unchanged run three times makes three identical pins.<br>• Legends say only "pinned: PI controller" for each pin, so U4's 1.00× and 1.15× runs cannot be told apart.<br>• One pin's colour is close to the current run's pink.<br>• "Clear pins (n)" deletes them all in one tap, with no undo, although the spec promises "nothing destructive in one tap".<br>Shot: `pin-390-01-4pins.png`. | H1, H5, H9; U4 | Label pins by what differs ("threshold 1.15×, t ≤ 150 s"). Ignore duplicates, or say "already pinned". Show a message at the limit, or replace the oldest pin and say so. Offer undo for Clear pins. Reserve pink for "this run". |
| F14 | 2 | Rotation | **Rotating changes the open tab.** The tab is remembered per orientation (M6), so a user reading Numbers upright who turns the phone for a bigger view lands on Controls. Shot: `rotate-01-land.png`. | H4, H3 | Keep the current tab across a rotation. Remember per orientation only the tab a new session opens on. |
| F15 | 2 | Status chip and narration | **Limit violations are missing from the status chip.** At the end of the benchmark PI run the chip is green, "FLAT-TOP · PAID AS H-MODE", while f_GW is 1.19 (above the Greenwald limit) and q_min is 0.39 (below 1). These appear only in the narration. The two-line clamp cuts it just before "above the Greenwald limit" upright, and after one line sideways. ISA-101: alarms must be visible at a glance. Shot: `u1-390-06-end.png`. | H1; U1 | Add a red limit badge to the chip ("f_GW > 1"), or a second chip. Put limits first in the narration. |
| F16 | 2 | Tab content area | **The instrument area is small, and the Numbers tab uses it poorly.** The area is 294 px tall at 390 × 844, 252 px at 360 × 780 and 228 px sideways (from F01's measurement). Expanding the narration takes another 55 px. Numbers puts one tile per row behind a 4-line header and legend: T_e(0) is the 4th tile, and sideways only one tile row shows. Shots: `land-05-u2-numbers.png`, `u2-390-07-numbers.png`. | H8; U2 | On phones, use two tile columns. Fold the legend behind an (i). Sideways, hide the legend and heading. |
| F17 | 2 | Parameter sliders (Set-up, Controls) | **Exact values are fiddly to set.** The L-H threshold runs 0.54 to 1.85 in steps of 0.01 over about 317 px, about 2.4 px per step: a 2 px error turned 1.15 into 1.16. There is no ± button and no way to type a value. Shot: `u4-390-14-threshold-set.png`. | H7; U4 | Tapping the value could open a stepper or a numeric field. Add ± buttons, and snap to round values (0.05). |
| F18 | 2 | Tab strip | **Later tabs are hard to discover.** There are 12 tabs on a strip three screens wide. Set-up and Reward design are on the third screen, and the only hint is a chip cut off at the edge. Shots: `u4-390-11-tabs-swiped.png`, `u4-390-12-tabs-swiped2.png`. | H6; U4 | Add an edge fade and chevron, put a "More tabs" item in the ⋯ menu, or group the tabs: Plots (traces, profiles, ops, maps, power), Reward (reward, design), Set-up. |
| F19 | 1 | Narration | **Nothing shows that the narration expands.** Tapping it expands it (pointer cursor only), but the only hint is the ellipsis. | H6 | Add a small chevron or "more" at the end of the clamp. |
| F20 | 1 | Plasma chips "coils" and "∑ equations" | **Off toggles look disabled.** They are drawn at opacity 0.55, so they read as unavailable. "coils" is 3.87:1 in the light theme. | H4; WCAG 1.4.3 | Show the off state with an outline and full-contrast text, and the on state with fill. |
| F21 | 1 | Scrubber track | **The track is faint and shows no progress.** The track contrasts 1.45:1 with the bar (light) and 1.56:1 (dark), and no fill shows the part already played. The thumb alone carries the position. | WCAG 1.4.11; H1 | Make the track at least 3:1 and fill the played part in the accent colour. |
| F22 | 1 | Plasma labels and plots | **Labels collide.**<br>• "q = 1", "q = 2" and "NBI 33 MW" overlap at the lower right of the plasma (`narr-390-02-expanded-long.png`).<br>• The ECRH label runs into the launcher box.<br>• The Operating-space readout ("t = 151 s: f_GW …") is cut off under the plot title (`tab-390-ops.png`).<br>• The P_LH marker crosses the "P_SOL 199" label (`tab-390-power.png`).<br>• At 360 px the colourbar labels "20" and "30" touch. | H8 | Lay labels out to avoid collisions, give the readout its own line, and move the marker label outside the bar. |
| F23 | 1 | Launch card | **The poster does not match what opens.**<br>• The poster shows a late flat-top state (green "FLAT-TOP · PAID AS H-MODE") while the Lab opens at t = 0 ("START · L-MODE").<br>• After leaving the Lab, the poster canvas is 388 px wide in a 356 px card, so the colourbar is cut off (`back-390-01-with-card.png`). | H1, H8 | Render the poster at the time the Lab will open on. Refit the poster canvas after leaving. |
| F24 | 1 | Menu on its side (844 × 390) | **The menu barely overflows.** It is 18 px taller than its box, so its last item ("Switch to the physics environment") sits under the bottom edge and needs a scroll. The menu also covers the playback line. Shot: `land-07-menu.png`. | H8 | Sideways, use two columns or a smaller row height (44 px), or anchor the menu as a side sheet. |
| F25 | 1 | Number tiles | **The trailing-average labels are tiny.** "5s / 20s / 60s" and their values are 9.2 px (the spec's floor is 9 px), and some are italic and lighter. They are hard to read on a phone at arm's length. | H8 | Use 11 px on phones, or show averages only in the pop-up. |
| F26 | 1 | What-if chip | **The chip cannot reset what it reports.** The "⚙ … 1.16×" chip on the plasma is not tappable; resetting means finding Set-up → "Reset to calibrated". | H9 | Make the chip a button: tap it to list what changed and reset. |
| F27 | 1 | App bar | **The preset picker is out of the thumb's reach.** It is the most frequent app-bar action (U3, U5) and sits at the top edge, as does the card × at the top right. One-handed users must stretch or shift their grip. | Fitts / ergonomics | Acceptable as is. Optionally, let the narration area or a bottom sheet offer "Change preset". |

## Walkthrough by task

### U1: open the Lab and play the PI controller to the end

**390 × 844: success, yes.**

What works:

1. On arrival the launch card is already in the first screen (`u1-390-01-arrive.png`).
2. "Open the Lab" is obvious: 324 × 48 px, full width, in the accent colour.
3. It opens at once into "PI controller · benchmark" (`u1-390-03-open.png`).
4. The large Play button is where a video player has it.
5. The time counts up, the chip moves through START → RAMP-UP → FLAT-TOP, and at 151 s the icon becomes "Play again"
   (`u1-390-06-end.png`).

Friction:

- The narration's first line says "Press **Play** (space)", a keyboard hint (F11).
- The Controls tab shown during the run has no selected mode and offers irrelevant controls (F02).
- At the end the chip is green, while the narration's hidden third line says the run is above the Greenwald limit (F15).
- The run's score is in OUTCOME at the bottom of the Controls tab, out of reach (F01).
- The launch poster had promised a flat-top in H-mode, but the Lab opens at t = 0 (F23).

**844 × 390: yes.** Same flow. The button is 778 px wide. The scrubber is 598 px, plasma on the left and tabs on the
right (`land-03-open.png`, `land-04-end.png`).

**360 × 780: yes.** Same flow (`s360-03-open.png`, `s360-04-end.png`).

### U2: find the second the heating comes on and read T_e(0) there

**390 × 844: partly.** A first-time user would likely end on "about 100 s" and a T_e(0) value that may be a few seconds
off.

Finding the time:

- The Heating tab is the obvious first try. It shows an empty "off / off / off" frequency strip, not a time history
  (F10).
- The Knobs tab draws the knob traces only up to the cursor, so the heating step is not visible before the playback
  reaches it.
- Watching playback works, but at about 12 s per second, pausing on sight overshoots by several seconds (F06).
- The ticks on the scrubber are the fastest route. If the user lands exactly on 100 s, a callout "Heating on · 100 s"
  appears on the plasma and the narration says "Heating on: 0 → 53 MW". That is excellent feedback (`u2-390-05-tap-tick.png`).
  But the user has to guess that the ticks are events (no legend, no tooltips on touch, F09), and a finger lands ±1.2 s
  per pixel (F06).

Reading T_e(0):

- The Numbers tab shows T_e(0) in the 4th tile, so the user has to scroll the 294 px area (F16).
- Swiping opens pop-ups over the tiles (F05).
- Tapping the label "T_e(0)" throws the user out of the Lab to the equation sheet (F04).

**844 × 390: likely yes.** The 598 px scrubber gives about 0.25 s per px. Tapping the tick landed on 100 s and the
callout appeared (`land-05-u2-numbers.png`). Only one tile row shows in Numbers (F16).

**360 × 780: partly.** About 1.6 s per px; taps ±3 px landed on 95 or 105 s.

### U3: switch to the physics environment's randomised-training preset and find when it reaches H-mode

**390 × 844: partly.**

Switching:

1. The picker in the app bar is clearly a picker (name, scenario, chevron).
2. The native list groups options by scenario and controller type. "Randomised training" sits under "Physics env. ·
   feedback".
3. After the choice, the bar reads "Randomised training / physics environment" (`u3-390-01-after-pick.png`).

Finding the moment:

- Playing shows the chip turning amber at 101 s ("L-H TRANSITION"), then "H-MODE, BELOW THE 1.2× MARGIN" at 102 s, then
  green "H-MODE, PAID" a few seconds later.
- At 2× the 101 s frame was skipped altogether.
- Users will answer 101, 102 or about 105 s depending on which state they take as "reaches H-mode".
- The ticks do not help: five events in 6 px, all in the same blue (F09).
- Precision issues as in U2 (F06).
- The Story card (⋯ → Story) states "t = 101 s L-H transition", and its chip jumps there. But it is two taps away in the
  menu, and after the jump the card covers the plasma (F12).

**844 × 390: partly.** Same, with an easier scrubber.

**360 × 780: partly.**

### U4: pin the run, set the true L-H threshold to 1.15 × in the Controls tab, and compare the two runs

**390 × 844: no, as written; partly through Set-up.**

Pinning works:

- The pin icon is recognisable. Its background tints and a badge "1" appears (`u4-390-01z-pin.png`).
- What the pin does is not explained on screen.

The Controls tab fails:

- It shows a stale header ("PI controller") and nothing below the PI gains, because it cannot be scrolled (F01, F02).
- "true L-H threshold ÷ Martin scaling" sits about 250 px below the fold.
- Swipes that start on a slider silently change gains or transport (F03).

The workaround:

- The same slider is in the Set-up tab, the 11th of 12 tabs, two screens along the strip (F18).
- Getting exactly 1.15 needs a 1 to 2 px precise drag (F17).
- The amber what-if chip confirms the change on the plasma. That is good.

Comparing:

- Traces draws the pinned run as a lavender line labelled only "pinned: Randomised training". At 1.15× the two runs
  nearly overlap, and nothing names which line has which threshold (F13).
- Numbers pop-ups also show the pin, but opening them has the problems of F04 and F05.

### U5: open the Lab from guided experiment 12, then return to the text

**390 × 844: yes, with friction.**

What works:

1. Tapping "physics environment's heating cut" opens the full-screen Lab without a reload.
2. It opens in the right state: "Heating cut at 105 s · physics environment", t = 106 s, amber chip, callouts for 101 and
   106 s (`u5-390-02-opened.png`).
3. ✕ returns to the text with the link at the same place on screen (`u5-390-03-returned.png`).

Friction:

- The Lab opens on the Controls tab, which shows PI gains and "network correction" for an open-loop schedule (F02).
- The experiment asks the user to watch "the T profile" and to "look at the side pane". The phone has no side pane, and
  `tab=T` did not open Profiles (F11).

### U6: leave the Lab with the Back gesture

**390 × 844: yes.**

- Back leaves the Lab, restores the page scroll exactly (200 → 200 px) and pauses playback.
- Entering again resumes at the same time.
- A second Back goes to the previous page, as expected (`u6-390-01-after-back.png`).

Friction:

- With the ⋯ menu or a card open, Back closes the whole Lab rather than the overlay (F12).
- Leaving through F04's accidental link, then pressing Back, lands at the top of the page, not in the Lab.

## Spot checks against the spec

| Claim | Result |
|---|---|
| M1 launch card | Met. The button is 324 × 48 px at 390, the card names the preset, and it adds the time on return ("t = 70 s"). |
| M3 plasma and playback fixed | Met for scrolling. But history pop-ups and cards cover the playback line or the plasma (F05, F12). |
| M4 one row ≤ 56 px | Met: 56 px upright, 52 px sideways. "Tap the track to jump" works in Chromium, but likely not on iOS (F08). "The scrubber spans the screen width" is not met upright: 37 % of the width at 390, 32 % at 360 (F06). |
| M5 app bar ≤ 52 px, menu rows ≥ 44 px | Met: 52 px bar, 48 px rows. |
| M6 tabs scroll; only the content scrolls | Partly. The strip scrolls by swipe. Tab content scrolls, except Controls (F01). The tab is remembered per orientation, which causes F14. |
| M7 targets | Primary controls are 44 × 44. Secondary chips are 32 px. Under 24 px: Story time chips (21 px, saved by spacing), the "all parameters ↓" link (94 × 20) and the tile label links (as small as 9 × 15, and dangerous, F04). |
| M8 legibility and contrast | Sizes are met. Contrast fails for white on the accent in dark mode, for the status chips (F07), and for the faded chips and the track (F20, F21). |
| M9 orientation | Works without losing state, but the tab changes (F14). No sideways scroll anywhere. |
| M10 status at a glance | The chip is always on the plasma and the narration is clamped. But limits are not in the chip (F15), and the chip's contrast is low (F07). |
| M11, M12 | Met (U5, U6). |

## Strengths

- **A deliberate, contained session.** The launch card explains the Lab in one sentence, shows the preset it will open
  with, and remembers time and preset ("Opens with Randomised training · physics environment · t = 70 s").
- **The core of the screen is stable.** The plasma, the status chip and the playback line never moved on any tab or
  scroll position, upright or sideways.
- **The playback line is compact and readable.** Play changes to Pause and Replay with matching accessible names. Speed
  shows its value. The pin badge counts. Back-to-start is obvious.
- **Event feedback on the plasma is excellent.** Landing on an event shows a callout ("Heating on · 100 s, 0 → 53 MW"),
  the narration explains it, and the chip changes colour.
- **A what-if chip appears on the plasma** whenever a parameter leaves its calibrated value. This is good visibility of a
  non-default state.
- **Leaving is safe.** Back, ✕ and deep links return to the exact place in the text with state kept. Deep links do not
  reload the page.
- **The layout on its side is very good.** It has a 598 px scrubber, the plasma on the left and the instruments on the
  right.
- **The preset picker is well organised.** It covers both scenarios, grouped by scenario and by who turns the knobs, and
  uses the system's native picker.
- **The ⋯ menu is clean** (48 px rows, plain wording, "Clear pins" disabled when there are none). Cards fit the screen
  and have 44 px close buttons.
- **The history pop-ups are a strong learning aid.** They show this run against TORAX and the pins.
- **Dark mode is consistent across all elements**, apart from the contrast problems above.

## Reproduction notes

- **Driver and scripts:** `eval/drv.cjs`, a persistent Playwright driver, and `eval/contrast.js`,
  which computes contrast with opacity and backgrounds composited.
- **Touch swipes:** raw `Input.dispatchTouchEvent` start, move and end sequences, with 12 steps 16 ms apart.
- **F01 cause:** confirmed in the page only, by adding `.lab-side { overscroll-behavior: auto }`. After that, the same
  swipe scrolled the Controls tab (0 → 65 px).
