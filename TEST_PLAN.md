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

JavaScript syntax checks and synthetic-landmark unit tests are automated. Actual camera/glove performance, browser rendering, and participant testing remain unverified until recorded here.
