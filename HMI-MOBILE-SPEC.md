# The Ramp-up Lab on phones: HMI and UX specification

**Status:** implemented; validation results in [§7](#7-validation-results).
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
Play/Pause (icon), back to the start (icon), the scrubber (all remaining width) with event ticks (heating changes, L-H
transitions, q_min < 1, limits and the end of the episode) and the time ("110 s"), speed (a button cycling 0.5×, 1×, 2×,
4× that shows its value) and Pin (icon, with the number of pins as a badge). No other text. Icons have accessible names
and tooltips. Tapping anywhere on the track jumps there. In the sandbox, Play runs and pauses the drive.

**M5 · A one-row app bar.** ≤ 52 px: Close (left), the preset picker (both scenarios, grouped by scenario and by who
turns the knobs), More (⋯, right). More opens a menu of ≥ 44 px rows: Story, Labels, Acronyms, About, Scoreboard,
Clear pins, the other scenario. The scenario of the current preset is visible in the picker.

**M6 · Instruments as tabs.** Under the plasma (upright) or beside it (on its side): Controls, Numbers, Heating, Knobs,
Traces, Profiles, Operating space, Maps, Power, Reward, Set-up, Reward design. The strip scrolls sideways and keeps the
selected tab in view; only the tab content scrolls, with contained overscroll (no page bounce, no pull-to-refresh). The
last tab is remembered per orientation.

### Ergonomics and legibility

**M7 · Touch targets.** Primary controls (Close, the preset picker, More, Play, back to start, speed, Pin, the tabs) are
≥ 44 × 44 CSS px. Every other target is ≥ 24 × 24 or has 24 px of clear space (WCAG 2.5.8). The scrubber's track is
≥ 32 px tall.

**M8 · Legibility.** Text in the app bar, playback line and tabs is ≥ 12 px; elsewhere ≥ 11 px, except the window
labels of the averages (≥ 9 px). Contrast as WCAG 1.4.3 and 1.4.11, in light and dark themes. *review*

**M9 · Orientation and safe areas.** Both orientations work and the layout follows a rotation without losing state; bars
respect the safe-area insets; neither the page nor the layout scrolls sideways.

**M10 · Status at a glance.** The status chip (phase · confinement) stays on the plasma; red is used only for limits and
alarms; the narration under the plasma is clamped to two lines and expands on a tap. *review*

### Behaviour

**M11 · Deep links into the Lab.** A link in the page text that opens the Lab in a state (the guided experiments) does
not reload the page. On a phone it opens the full-screen Lab in that state; leaving returns to the link. On desktop it
loads the state and scrolls the Lab into view. Arriving from another page with a Lab state in the address (for example
`7-lab/?preset=phys_pi&threshold=1.15` from the physics chapter) opens the full-screen Lab directly on a phone, with the
page behind it.

**M12 · Robustness.** Leaving keeps the preset, time, pins and parameters; entering again resumes them. Rotating keeps
them. A second Close or Back does not leave the page.

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

*Filled in after each validation round.*
