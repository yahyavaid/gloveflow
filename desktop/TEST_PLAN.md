# Desktop hands-on verification

## Already checked

- 55 desktop regression tests pass; native input was not exercised by the agent.
- JavaScript main/preload syntax checks pass.
- Bundled assets come from pinned MediaPipe 0.10.21 and Google's versioned hand model.

## Test on your Mac after granting permissions yourself

1. Preview with a bare hand; confirm mirrored movement and comfortable reach.
2. Enable control in a harmless app. Point into its corners, pinch to select a benign control, and hold the pinch: it should click once.
3. Raise two upright fingers and scroll. Briefly move the hand out of view, then return with two fingers: scrolling should resume after a short hold without a jump. Lower the middle finger and hold a point briefly before moving or pinching again.
4. Hold a fist one second: the cursor should pause without clicking. Open palm one second should resume and require re-arming.
5. Move your hand out of view while pinched; it should not click upon reappearing until fully released.
6. Switch to another app and confirm control continues while GloveFlow is in the background.
7. Press Command–Shift–G from the other app: camera and cursor control should stop. Re-enable must be explicit.
8. Close GloveFlow while tracking: camera indicator should turn off.
9. Repeat the same task with your glove. Record material/color, lighting, misses, accidental clicks, losses, and comfort.

No measured success rate or speed improvement is claimed. Physical macOS permission, hardware, and gesture verification is pending.

Packaged Apple Silicon bundle and local code-signature verification passed. The native framework bindings return valid primary-display bounds in a read-only check. A local 480-pixel browser preview was used for layout inspection only. Live camera, permission prompts, and actual input still require a hands-on test of version 0.2.0.

## Owner hands-on report

2026-10-07: Yahya reported granting macOS cursor-control access and successfully moving the cursor, clicking, and scrolling. He also reported many glitches. This establishes a reported basic end-to-end smoke test, not reliable or gloved performance. Sampled-frame review and code-level fixes were completed on 2026-10-08. The updated build still needs a recorded regression retest.

## Focused 0.2.0 retest

- Use one bare hand, upright fingers, and the whole hand in frame. Repeat with a glove separately.
- Point, briefly obscure the hand, then point again nearby. Check for a smooth recovery rather than a snap.
- Scroll, briefly fold the middle finger, then restore it. The cursor should stay on the scroll target during the brief ambiguity.
- After a lost/ambiguous pose, hold two fingers for at least 150 ms, then move vertically. Scrolling should recover.
- Lower the middle finger and hold a point for at least 150 ms. Cursor movement should resume.
- Check status text when pointing, scrolling, releasing a pinch, paused, and after Stop → Enable.
- Repeat fist/palm pause and emergency stop. Confirm that a fist cannot click.
- Record accidental clicks and failures, including fingers aimed toward the camera. Do not count synthetic tests as an accuracy result.
