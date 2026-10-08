# GloveFlow for Mac

A local desktop companion to the [GloveFlow browser prototype](https://github.com/yahyavaid/gloveflow). Designed and implemented with AI-agent assistance for Yahya Vaid's portfolio.

This version interprets webcam hand gestures and can move the real macOS cursor, left-click, and scroll across applications on the primary display. It uses a native Core Graphics driver behind an isolated Electron UI. It does not record video, upload landmarks, read other apps' content, or require Screen Recording access.

## Open the app

The prepared Apple Silicon bundle is `release/GloveFlow-darwin-arm64/GloveFlow.app`.

1. Open GloveFlow. Choose **Start camera** and respond to macOS's Camera prompt yourself.
2. Use preview mode to find a comfortable hand position. Keep one hand and fingertips visible.
3. Choose **Set up access** if Accessibility access is missing. In macOS System Settings → Privacy & Security → Accessibility, enable GloveFlow yourself, then return and choose **Check again**. macOS may require reopening the app.
4. Choose **Enable Mac control**. Show an open palm or a released pointing hand before moving. Point with one finger, hold a pinch briefly to left-click, and use two fingers to scroll.
5. Hold a fist for one second to pause, then an open palm for one second to resume. **Command–Shift–G** stops both camera and cursor from another app. Closing GloveFlow also stops everything. If tracking becomes unresponsive during a stop, the app closes to release the camera.

After Camera access has been granted, opening the app starts the local camera preview. Real cursor control always requires the explicit Enable button. The app keeps tracking when its window is in the background so you can use another application. Start, stop, and quit controls remain available in its own window/menu.

This is an experimental local development build, not an App Store or notarized release. It currently supports Apple Silicon Macs and the primary display only. Dragging, right-click, typing, and switching monitors are future work. First test in a harmless local workspace before using it for ordinary actions.

## Development

Node.js 24 and macOS are used for this build. Dependencies are pinned in the lockfile.

```sh
npm ci
npm run assets
npm test
npm run package
```

`assets` downloads Google's official hand model and copies the pinned MediaPipe WASM/runtime into the app. Runtime camera processing can then work offline. The assets manifest records the model source and SHA-256. Koffi loads Apple's built-in Core Graphics, Core Foundation, and Application Services frameworks; no helper server is needed.

## Architecture and stop behavior

- Renderer: camera capture, MediaPipe inference, GloveFlow gesture interpretation, visible preview, pose holds.
- Preload: a narrow API with context isolation and sandbox enabled; no arbitrary Node or shell access.
- Main process: validates sender origin/main frame and interpreted action payloads, checks Accessibility trust, bounds cursor movement to the primary display, and enforces a cooldown.
- Native driver: mouse move, paired mouse-down/up, and pixel scroll events with Core Foundation cleanup.
- Watchdog: a tracking heartbeat stall longer than 300ms stops desktop control and requires explicit restart. Losing the hand disarms actions. Emergency stop/closing the app releases the camera.

## Validation

20 controller and IPC tests pass. They exercise permission gating, disarming, malformed frames, bounds, click cooldown, pause, native-driver failures, and the watchdog without moving the real cursor. The shared browser controller has 29 gesture/interaction regression tests.

Yahya reported successful cursor movement, clicking, and scrolling after granting permissions, along with many glitches. Reliability and glove recognition still need diagnosis and a recorded retest. Synthetic tests and UI checks do not establish real glove accuracy, clinical suitability, or time savings. Record actual results in `TEST_PLAN.md`.

## Sources and attribution

[Electron system permissions](https://www.electronjs.org/docs/latest/api/system-preferences), [Apple Core Graphics events](https://developer.apple.com/documentation/coregraphics/cgevent), and [Koffi native bindings](https://koffi.dev/load) are the platform foundations. Preserve their dependency licenses and the MediaPipe notices in THIRD_PARTY_NOTICES.md.

Packaged Apple Silicon bundle and local code-signature verification passed. The native framework bindings return valid primary-display bounds in a read-only check. Automated app-window inspection was unavailable; live camera, permission prompts, and actual input still require a hands-on test.
