# GloveFlow 0.2.0 recording review

Reviewed locally on 2026-10-08. The owner supplied a 97-second desktop recording of version 0.1.0. Selected frames were inspected across the clip, with denser one-second sampling around pause/resume and scrolling. Audio was not analyzed. The recording and extracted images are private working material and are not included in this repository.

## Visible observations

- Around 32–34 seconds, an open palm changes the app from paused to enabled; the re-arm instruction remains visible afterward. The same instruction is still present during subsequent pointing and scrolling.
- Around 69–88 seconds, changing finger orientation alternates the displayed label among pointing, two-finger scrolling, fist, and resting. This supports a problem with ambiguous poses and transitions, but does not establish the owner’s intended gesture in every frame.
- Around 52–57 seconds, the app window is hidden and the desktop is exposed. The sampled images do not establish whether that was an intentional click, a tracking error, or ordinary mouse input.

## Reproduced in code and fixed

| Problem | Change | Validation |
| --- | --- | --- |
| A missed detection erased pointer smoothing history | Keep history through losses up to 300 ms and cap the smoothing step after delays; disarm actions immediately | Synthetic dropout and cooldown regressions |
| None/rest/fist disarmed control but two fingers could never re-arm scrolling | Separate scroll readiness; restore it after 150 ms of stable two-finger detection; discard the recovery frame’s delta | Fake native-driver recovery, interruption, pause, and pinch-isolation tests |
| A fleeting pointing pose during scrolling could move the target | Require 150 ms of steady pointing before moving or arming a click again | Scroll-to-point transition regressions |
| Renderer showed stale enable/resume instructions | Send changed native status through a narrow preload callback and update the visible message | Main/preload and renderer tests, including Stop → Enable and late notifications |
| Preview cropped the camera frame | Contain the complete camera image; add upright-finger guidance | Local layout inspection |

## Remaining limits

The current finger-extension classifier uses two-dimensional landmarks. Fingers aimed toward the lens, a bent-index pinch, occlusion, and gloves can still be ambiguous. Fist protection remains conservative to avoid converting a pause gesture into an accidental click. A future classifier change needs recorded landmark sequences and real pose labels, rather than guessed thresholds.

All 55 desktop tests pass using synthetic landmarks and fake native input. The packaged local signature verifies. These checks establish the targeted software behavior, not reliable physical gesture accuracy. No new camera session or real mouse input was exercised by the coding agent. The owner needs to retest version 0.2.0 before any reliability or time-savings claim.
