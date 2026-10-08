# GloveFlow

An experimental browser-based touchless workspace, created as a self-directed portfolio project for Yahya Vaid. It explores how someone wearing gloves could navigate a focused document-review task without touching a mouse or keyboard.

## Try it

- **Guided demo:** a clearly labeled scripted walkthrough; no camera required.
- **Live camera:** point with an index finger, pinch thumb and index to select, and raise index + middle fingers to scroll the document.
- **Pause/resume:** hold a closed fist for one second to pause selections; hold an open palm for one second to resume. The camera remains active while paused so it can detect the resume gesture. Visible controls and Space also work when a control is not focused.
- **Stop:** Stop camera or Escape releases the camera. Hiding the tab also releases it.
- Mouse, touch, and keyboard navigation remain available.

Only the simulated workspace is controlled. This does not move the operating system cursor or interact with other apps. The content is synthetic; the prototype is not validated for clinical use.

## Run locally

Requires Node.js 20 or later; there are no build dependencies.

```sh
npm start
```

Open `http://127.0.0.1:5173`. A deployed version must use HTTPS for camera access. The hand-tracking package/model and optional fonts download from their respective public providers. Camera video and landmarks are processed locally, never uploaded by this application.

```sh
npm test
npm run check
```

## What is implemented

- Responsive workspace with an accessible tab interface, reference files, document pagination, review state, and session activity.
- Hand landmark detection with MediaPipe, application-authored gesture interpretation, smoothing, bounded scrolling, pinch hysteresis, release-to-rearm, and a click cooldown.
- Lost-tracking disarming, camera cleanup, permission/error states, and a guided demonstration independent of camera support.
- Optional WebMCP state reading and workspace navigation when the browser supports it. This never starts the camera.

## What the tests establish

Synthetic-landmark tests cover repeated clicks, brief pinches, lost tracking, frame gaps, scrolling, invalid input, and pointer bounds. They validate gesture interpretation rules, not the accuracy of the underlying model or a real person's performance with gloves. Browser/device testing and actual glove sessions remain necessary.

## Portfolio evidence

See [CASE_STUDY.md](CASE_STUDY.md), [AGENTIC_WORK.md](AGENTIC_WORK.md), and [TEST_PLAN.md](TEST_PLAN.md). They distinguish implemented work, design hypotheses, and measurements still to collect. No clinical results, user-research findings, or business savings are claimed.

## Attribution

The UI and gesture-control layer were authored for this project with AI-agent assistance. It uses Google's [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe), an Apache-2.0 library, pinned to version 0.10.21. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The project is not a relabeled copy of an upstream demo.
