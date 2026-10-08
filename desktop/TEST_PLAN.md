# Desktop hands-on verification

## Already checked

- 20 controller and IPC regression tests pass; native input was not exercised by the agent.
- JavaScript main/preload syntax checks pass.
- Bundled assets come from pinned MediaPipe 0.10.21 and Google's versioned hand model.

## Test on your Mac after granting permissions yourself

1. Preview with a bare hand; confirm mirrored movement and comfortable reach.
2. Enable control in a harmless app. Point into its corners, pinch to select a benign control, and hold the pinch: it should click once.
3. Raise two fingers and scroll. Lower the middle finger before pinching again.
4. Hold a fist one second: the cursor should pause without clicking. Open palm one second should resume and require re-arming.
5. Move your hand out of view while pinched; it should not click upon reappearing until fully released.
6. Switch to another app and confirm control continues while GloveFlow is in the background.
7. Press Command–Shift–G from the other app: camera and cursor control should stop. Re-enable must be explicit.
8. Close GloveFlow while tracking: camera indicator should turn off.
9. Repeat the same task with your glove. Record material/color, lighting, misses, accidental clicks, losses, and comfort.

No measured success rate or speed improvement is claimed. Physical macOS permission, hardware, and gesture verification is pending.

Packaged Apple Silicon bundle and local code-signature verification passed. The native framework bindings return valid primary-display bounds in a read-only check. Automated app-window inspection was unavailable; live camera, permission prompts, and actual input still require a hands-on test.

## Owner hands-on report

2026-10-07: Yahya reported granting macOS cursor-control access and successfully moving the cursor, clicking, and scrolling. He also reported many glitches. This establishes a reported basic end-to-end smoke test, not reliable or gloved performance. Video-based diagnosis and a recorded regression retest are pending.
