# GloveFlow hands-on test plan

## Repeatable task

Reset. Open Reference files, open Touchless interaction reference, advance to page 2, mark reviewed. Perform the same task with mouse/keyboard, bare-hand gestures, then your chosen glove. Do not compare the guided demo's scripted timing with human results.

## Record the conditions

- Date, browser/version, device, camera resolution, room lighting, background.
- Glove material/color, fit, and hand used.
- Whether this is the first attempt or a practiced attempt.

## Collect observations

| Condition | Trial | Completed? | Time (s) | Missed selections | Accidental selections | Tracking losses | Comfort notes |
|---|---|---|---|---|---|---|---|
| Mouse/keyboard | 1 | | | | | | |
| Bare hand | 1 | | | | | | |
| Glove | 1 | | | | | | |

Repeat enough times to observe consistency. Describe results as exploratory prototype observations. If only you participated, say so.

## Recovery checks

- Decline camera permission: useful message and guided demo remain available.
- Move hand out of view while pinching: no selection when it returns until release.
- Hold a pinch: one click.
- Two-finger scroll: no click or large initial scroll jump.
- Pause and resume: pointer is cleared and selection requires re-arming.
- Hold a closed fist for one second to pause selections; hold an open palm for one second to resume. Verify briefly passing through either pose does not toggle the state.
- Escape, Stop camera, or hiding the tab: camera track ends.
- Keyboard: Tab reaches controls; arrow keys navigate record tabs; Enter/Space activates the focused control.
- Phone/narrow browser: readable content, no clipped controls, touch fallback works.

## Current validation

29 synthetic gesture and interaction tests pass, including pinch drift, threshold noise, closed-fist safety, scrolling jitter, recovery, visible cursor bounds, and interrupted pose holds. JavaScript syntax checks pass. Yahya reported first-version issues with selection, scroll/pause, and layout; version 0.2 addresses the identified code defects. Actual camera/glove reliability and participant testing remain unverified until a recorded retest.


## Browser verification for v0.2

Verified in the Codex browser on 2026-10-07:

- Full manual reference-review workflow reaches 3/3 and disables duplicate review.
- Guided playback reaches 3/3, labels timing as simulated, exits demo mode, and offers replay.
- Manual tab navigation cancels playback; the pending scripted step does not run afterward.
- Keyboard ArrowRight moves from Overview to Reference files.
- WebMCP valid navigation and state reading succeed; an invalid section is rejected.
- Desktop 1168×849 and emulated 970×600 keep the reference action buttons visible.
- Emulated 390×844 has no horizontal overflow or clipped button widths, and guided playback completes. This is a browser emulation check, not a test on a physical phone.

Camera permissions, real pinch recognition, gloved performance, and pause/resume pose recognition were not exercised by the agent. Synthetic controller tests establish the changed logic; Yahya should repeat the hands-on task with the actual camera and glove.
