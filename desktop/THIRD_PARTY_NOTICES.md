# Third-party notices

## MediaPipe Tasks Vision

Google MediaPipe, Apache License 2.0.

- Source: https://github.com/google-ai-edge/mediapipe
- License: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
- JavaScript package: `@mediapipe/tasks-vision@0.10.21`, loaded from jsDelivr.
- Hand Landmarker model: Google's published hand_landmarker/float16/1 asset.
- Documentation: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js

The dependency and model are fetched from public providers when live tracking starts. They are not bundled or claimed as original work.

## Optional typefaces

DM Sans and Manrope are loaded from Google Fonts and fall back to system fonts. Their respective upstream licenses are the SIL Open Font License. If self-hosting them in a future version, retain the accompanying upstream license files.

## Desktop dependencies

- Electron 44.7.0: MIT, https://github.com/electron/electron
- Koffi 3.3.2: MIT, https://github.com/Koromix/koffi
- Electron Packager 20.3.0 (build only): BSD-2-Clause, https://github.com/electron/packager

Their package licenses are retained in node_modules in the local build. The prepared app uses only built-in Apple frameworks for native cursor input.
