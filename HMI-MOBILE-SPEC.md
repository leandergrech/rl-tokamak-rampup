# The Ramp-up Lab on phones: HMI and UX specification

**Status:** implemented and validated in three rounds (automated acceptance, two rounds of independent expert
evaluation); results in [§7](#7-validation-results). A usability test with people (§6.3) has not been run yet.
**Scope:** the Ramp-up Lab (`docs/primer/7-lab.md`, `docs/javascripts/lab.js`, `docs/stylesheets/theme.css`) on phones and
other small viewports. The desktop layout is out of scope except where it must stay unchanged (M14).
**Tests:** `scripts/check_lab_mobile.mjs` (automated acceptance, also run in CI); the independent evaluation and the
usability-test protocol are in §6.

## 1. Problem

On a phone the Lab stacked everything a desktop shows side by side: scenario switch, 18 presets, the story, a side pane
with about 30 controls, then 11 panels. The plasma view, which is what the reader is watching, scrolled out of sight as
soon as they reached the controls, and the playback controls were several screens away from both. The page scroll and
the Lab's own scrolling areas fought each other, and the experience depended on how far the reader had scrolled.

## 2. Goals

1. **The simulator and playback are always in view** while the Lab is in use on a phone.
2. **Playback is one compressed line** with minimal labels, in the thumb zone.
3. **The Lab is used in full screen only** on phones: a contained, app-like session with a known, calibrated viewport,
   entered on purpose and left with the system's Back gesture.
4. **Nothing is lost:** every desktop feature stays reachable (as a tab or a menu item), and state survives entering,
   leaving and rotating.

## 3. Users and contexts of use

- **Readers of the review on a phone**, upright, often one-handed with the thumb (Hoober, "How do users really hold
  mobile devices?", UXmatters 2013: one-handed use is the most common grip). Primary controls therefore sit at the
  bottom; rarely used ones go into a menu at the top.
- **The same readers on their side**, for a wider plasma view and plots.
- **Tablets**: upright tablets narrower than 760 CSS px behave as phones; wider tablets get the desktop layout.
- **Assistive technology and keyboards** (external keyboards on tablets): every control has an accessible name and is
  reachable by keyboard; Esc leaves.

## 4. Design principles and standards

| Source | What we take from it |
|---|---|
| ISO 9241-110:2020, interaction principles | Suitability for the task (the plasma and the time are the task: always visible); self-descriptiveness (status chip, narration, labelled icons); conformity with expectations (close top-left, Back leaves, tap the track to jump); controllability (pause, scrub, leave at any time); use-error robustness (leaving keeps state; nothing destructive in one tap) |
| ANSI/ISA-101.01, HMI for process automation | Overview first, then detail; status at a glance; colour reserved for meaning (red only for limits and alarms); consistent placement of the same element in every mode |
| WCAG 2.2 AA | 1.3.4 orientation (both work); 1.4.3 and 1.4.11 contrast (text ≥ 4.5:1, icons and boundaries ≥ 3:1); 1.4.10 reflow (no two-dimensional scrolling); 2.5.7 dragging (the scrubber also jumps on a tap); 2.5.8 target size (≥ 24 × 24 CSS px, or spaced) |
| Apple Human Interface Guidelines; Material Design | Primary hit targets ≥ 44 × 44 pt (Apple) / 48 × 48 dp (Material); a top app bar with close and overflow; a bottom control bar for the primary action |
| Fitts's law | The most frequent actions (play, scrub) are the largest and nearest the thumb; the scrubber spans the screen width |

## 5. Requirements

Each requirement has acceptance checks in `scripts/check_lab_mobile.mjs`, labelled with its ID; parts marked *review* are
judged by the expert evaluation (§6).

### Modes

**M1 · Launch card on small viewports.** *Small viewport* means a viewport narrower than 760 CSS px, or a coarse pointer
with the shorter side under 500 px (a phone on its side). There, the page shows only a launch card where the Lab would be:
a live preview of the plasma, the title, one sentence on what the Lab does, the preset it opens with, one primary button
**Open the Lab** (full width, ≥ 48 px tall) and the hint "Opens full screen · upright or sideways". No other Lab controls
appear inline. *Why:* the full workspace does not fit; a deliberate, contained session avoids nested scrolling and gives
every reader the same calibrated layout.

**M2 · Entering and leaving.** The button, or a Lab link in the page text (M11), opens the full-screen layout. Where the
browser supports the Fullscreen API (Android browsers) it is used; otherwise (iPhone Safari) the Lab covers the viewport.
Entering adds a history entry, so the system Back gesture leaves the Lab, not the page. Leaving (Close, Back, Esc) returns
to the page at exactly the scroll position it was entered from and pauses playback.

**M14 · Desktop unchanged.** On viewports of 760 px and wider with a fine pointer, the inline Lab and its full-screen
layout behave as before; no launch card.

### Layout in full screen (phone)

```
 upright                                   on its side
┌──────────────────────────────┐           ┌──────────────────────────┬──────────────────────┐
│ ✕  [ PI controller · bench ▾] ⋯│  app bar  │ ✕ [ PI controller · bench ▾]              ⋯│
├──────────────────────────────┤           ├──────────────────────────┬──────────────────────┤
│ [T_e j q]                    │           │ [T_e j q]                │ Controls Numbers …   │
│ ● FLAT-TOP · PAID AS H-MODE  │  status   │ ● FLAT-TOP · H-MODE      │──────────────────────│
│        (plasma view)         │  plasma   │      (plasma view)       │                      │
│                              │  ~⅓ height│                          │  tab content         │
│ ● narration, two lines …     │           │ ● narration …            │  (scrolls)           │
├──────────────────────────────┤           ├──────────────────────────┴──────────────────────┤
│ Controls  Numbers  Heating … │  tabs     │ ▶ ⏮ ━━━━━●━━━━━━━━━ 110 s  1×  📌               │
│                              │           └─────────────────────────────────────────────────┘
│   tab content (scrolls)      │
│                              │
├──────────────────────────────┤
│ ▶  ⏮ ━━━━━━●━━━━━━━ 110 s 1× 📌│  playback
└──────────────────────────────┘
```

**M3 · The simulator stays visible.** The plasma view with its status chip, and the playback line, never scroll: whatever
tab is open and however far its content is scrolled, both stay entirely inside the viewport. Upright, the plasma takes
about a third of the height (200–300 px); on its side, the left half.

**M4 · A compressed playback line.** One row at the bottom, ≤ 56 px tall plus the safe-area inset. Contents, left to right:
Play/Pause (icon), back to the start (icon), the time line (all remaining width), the time, speed (a button cycling
0.5×, 1×, 2×, 4× that shows its value) and Pin (icon, with the number of pins as a badge). No other text. Icons have
accessible names and tooltips. In the sandbox, Play runs and pauses the drive.
- **The time line** is the Lab's own control (the same on every browser): a tap anywhere jumps there (WCAG 2.5.7), and a
  tap within 6 px of an event tick snaps to that event and names it in a bubble ("100 s · Heating on"); a drag scrubs
  through every second; dragging with the finger lifted 40 px above the bar scrubs five times finer. Ticks are coloured
  by kind: heating orange, H-mode green, q_min < 1 amber, limits and losses red, the rest grey. The played part is
  filled. Keyboard: arrows ±1 s, Page Up/Down ±10 s, Home, End.
- **The time** is a button: it opens a stepper (−10 s, −1 s, the time, +1 s, +10 s; 44 px buttons) for an exact second.

**M5 · A one-row app bar.** ≤ 52 px: Close (left), the preset picker (both scenarios, grouped by scenario and by who
turns the knobs), More (⋯, right). More opens a menu of ≥ 44 px rows: Story, Labels, Acronyms, About, Scoreboard,
Clear pins, the other scenario. The scenario of the current preset is visible in the picker.

**M6 · Instruments as tabs.** Under the plasma (upright) or beside it (on its side): Controls, Numbers, Heating waves, Knobs,
Traces, Profiles, Operating space, Maps, Power, Reward, Set-up, Reward design. The strip scrolls sideways and keeps the
selected tab in view, fading at an edge with more tabs behind it; only the tab content scrolls, with contained overscroll
(no page bounce, no pull-to-refresh). A rotation keeps the open tab; a new session opens on the tab last used in that
orientation. The Controls tab scrolls with a finger like every other tab. On touch, content reacts only to deliberate
gestures: a number's history opens on a tap (never on a swipe, never following its label's link) and closes on a scroll;
a plot moves the time only on a tap or a sideways drag, never on a vertical swipe.

### Ergonomics and legibility

**M7 · Touch targets.** Primary controls (Close, the preset picker, More, Play, back to start, speed, Pin, the tabs) are
≥ 44 × 44 CSS px. Every other target is ≥ 24 × 24 or has 24 px of clear space (WCAG 2.5.8). The time line's touch area
is ≥ 44 px tall. **Sliders on touch** change only with a sideways drag (12 px, at least twice as sideways as vertical);
a vertical swipe that starts on one scrolls and leaves it alone, and so does a tap on its track (it may only be stopping
a scroll). A slider's value is a button that opens the same stepper as the time, for exact values (one step, ten steps).

**M8 · Legibility.** Text in the app bar, playback line and tabs is ≥ 12 px; elsewhere ≥ 11 px, except the window
labels of the averages (≥ 9 px; 10–11 px on phones). Contrast as WCAG 1.4.3 and 1.4.11, in light and dark themes:
accent-filled controls use a darker accent under white text in the light theme and dark text on the bright accent in
the dark one; status chips and limit pills use fills dark enough for white text; pass/fail values carry a sign (✗) as
well as a colour.

**M9 · Orientation and safe areas.** Both orientations work and the layout follows a rotation without losing state; bars
respect the safe-area insets; neither the page nor the layout scrolls sideways.

**M10 · Status at a glance.** The status chip (phase · confinement) stays on the plasma, with a pill for each limit that
is violated at the cursor (f_GW > 1 red, q_min < 1 amber, l_i outside its window red); red is used only for limits and
alarms; the narration under the plasma is clamped to two lines, marked "more ▾" when it continues, and expands on a tap.
What differs from the calibrated plasma and the trained controller is shown as amber tags with a *reset* (and Undo).

### Behaviour

**M11 · Deep links into the Lab.** A link in the page text that opens the Lab in a state (the guided experiments) does
not reload the page. On a phone it opens the full-screen Lab in that state; leaving returns to the link. On desktop it
loads the state and scrolls the Lab into view. Arriving from another page with a Lab state in the address (for example
`7-lab/?preset=phys_pi&threshold=1.15` from the physics chapter) opens the full-screen Lab directly on a phone, with the
page behind it.

**M12 · Robustness.** Leaving keeps the preset, time, pins and parameters; entering again resumes them. Rotating keeps
them. **Back and Esc close the innermost layer first**: a stepper, the menu or a card, then the Lab; never the page. A
tap outside a card closes it and does nothing else; ✕ leaves in one tap even with a card open. Pins say what differs,
duplicates are refused, the fourth replaces the first with a message, and Clear pins can be undone. Toasts never block
the content under them.

**M13 · Responsiveness.** Playback stays smooth in full screen: the Lab's script time per animation frame has a median
under 33 ms (a 30 frames-per-second budget) with the CPU slowed four times, as Chrome's mid-tier-phone emulation does;
on a phone the plasma and the heating strip redraw at 30 frames per second, on alternate frames, and the inline preview
at 15. The layout opens in under 300 ms. Both are checked strictly on an idle machine (`--strict-timing`) and reported as
advisory elsewhere, since a busy or shared machine measures itself rather than the Lab.

## 6. Validation plan

1. **Automated acceptance** (`node scripts/check_lab_mobile.mjs`): a headless browser with touch emulation runs every
   check in §5 on six device profiles, light and dark: 360 × 780, 375 × 667, 390 × 844, 412 × 915 upright; 844 × 390
   and 667 × 375 on their side; plus the desktop at 1440 × 900 for M14. Runs in CI on every push.
2. **Independent expert evaluation**: a reviewer who did not build the layout runs a heuristic evaluation (Nielsen's
   ten heuristics) and a cognitive walkthrough of the tasks below on the phone profiles, and rates each problem 0–4
   (Nielsen's severity scale). Severity 3–4 problems are fixed before release; the rest are listed in §7.
3. **Usability test with people** (protocol; not yet run): five participants who know the review's subject, on their
   own phones, think-aloud, one session each. Tasks below. Measures: task success (target ≥ 80 % per task), time on
   task, errors, the Single Ease Question after each task, and the System Usability Scale at the end (target ≥ 68, the
   commonly used average).

**Tasks**

| ID | Task |
|---|---|
| U1 | From the Lab page, open the Lab and play the PI controller to the end. |
| U2 | Find the second when the heating comes on, and read T_e(0) there. |
| U3 | Switch to the physics environment's randomised-training preset and find when it reaches H-mode. |
| U4 | Pin the run, set the true L-H threshold to 1.15 × in the Controls tab, and compare the two runs. |
| U5 | From guided experiment 12 in the text, open the Lab in that state, then return to the text. |
| U6 | Leave the Lab with the phone's Back gesture. |

## 7. Validation results

### 7.1 Automated acceptance (`scripts/check_lab_mobile.mjs`)

| Round | What it ran | Result |
|---|---|---|
| 1, first build | 55 checks per phone profile, scrolling with `scrollTop`, tapping by selector | 45 of 52 on the first profile. It found: the page jumping by the Lab's height on leaving (scroll anchoring while the browser's full screen ended), selected tabs scrolled out of view, playback not paused until Back landed, a phone on its side given the desktop layout, the plasma 11 px over its budget, the menu taller than a phone on its side, the speed label lagging a frame |
| 2, after the expert evaluation | real touch gestures through the DevTools protocol added (the evaluation showed scripted scrolling hides touch defects), contrast computed, overlays, stepper, pins | 473 of 473 in CI |
| 3, after the second evaluation | regression checks for its findings (reset and sliders, a slightly sideways swipe on a slider, drags past ticks, ✕ with a card open) | 74 checks per phone profile; see the latest CI run. It found two more defects: Esc left the Lab with the stepper open, and ✕ with a card open could step back past the page (two history steps racing), both fixed |

**Timing (M13)**, on GitHub's runner (idle, four virtual CPUs): the full-screen layout opens in 47–76 ms on every phone
profile; during playback with the CPU slowed four times the Lab's script time per frame has a median of 4.9 ms and a
90th percentile of 18.2 ms (budget: median 33 ms). On the development machine, busy with unrelated jobs, the same checks
are reported as advisory.

### 7.2 Independent expert evaluation, round 1 (`hmi/mobile-evaluation-round1.md`)

A reviewer who had not built the layout ran a cognitive walkthrough of U1–U6 and a heuristic evaluation on three phone
profiles, light and dark, with real touch input. **27 findings: 1 severity 4, 7 severity 3, 10 severity 2, 9 severity 1.**
Task verdicts: U1 yes; U2, U3 partly; U4 no; U5 yes with friction; U6 yes.

The severity 4 finding: the Controls tab could not be scrolled by a finger (it kept the desktop side pane's own scroll
box), so the plasma parameters, the sandbox's knobs and the outcome were out of reach. The severity 3 findings: stale
controls in the Controls tab; swipes changing sliders; a tap on a number's name leaving the Lab; swipes opening
histories; finding an exact second; contrast below AA for accent fills and status chips; and tap-to-jump depending on
the browser's native slider. **All 8 were fixed.** Of the 19 lower-severity findings, 17 were addressed (F09 in part: ticks
coloured, named and snapped to, but clusters not merged); F22 was left and F27 accepted.

### 7.3 Independent expert evaluation, round 2 (`hmi/mobile-evaluation-round2.md`)

The same reviewer re-checked the build with the fixes. **12 of the 13 re-checked findings fixed, F03 partly fixed.**
Task verdicts: **all six succeed** (U3 with some friction: five events within 4 px around the L-H transition). New
findings: N1 (severity 3: the what-if reset left the controller's sliders showing old values), N2–N4 (severity 2: a
slightly sideways start on a slider still changed it; drags snapped past seconds near ticks; two contrast failures in
the Controls tab now reachable on phones), N5–N11 (severity 1). **N1–N7, N9 and N10 were fixed**, N8 was a wording fix in
the page; N11 (some tick colours similar) remains.

### 7.4 Open, and not yet validated

- **Not fixed:** labels on the 3-D plasma can still collide (round 1 F22, severity 1); some tick colours are similar
  (round 2 N11, severity 1); the preset picker sits at the top, out of one thumb's easy reach (F27, accepted).
- **Not validated on real devices:** iPhone Safari (the time line and gestures use standard pointer events and should
  behave the same, but this was only tested in a Chromium-based browser), the real Fullscreen API on Android phones,
  safe-area insets on phones with a notch or rounded corners, and momentum scrolling.
- **Not run:** the usability test with people (§6, item 3). It is the next step: the automated and expert rounds show
  the design meets its requirements and has no known problem above severity 1; only people show whether it is easy to
  use for them.
