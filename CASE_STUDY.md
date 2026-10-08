# GloveFlow: touchless document review

**Status:** Self-directed experimental prototype. Design and implementation assisted by an AI coding agent. Real glove testing and participant research have not yet been completed.

## Problem hypothesis

Someone with gloved or occupied hands may need to navigate information without touching a mouse or keyboard. The initial doctor scenario inspired this hypothesis; it is not based on a validated clinical research study.

## Focused task

Open a reference-file tab, open a sample document, advance to its second page, and mark it reviewed. This keeps the interaction understandable and gives testing a repeatable task. All data and documents are synthetic.

## Design decisions

1. **Visible intent:** Highlight the control under the virtual pointer before selection.
2. **Deliberate selection:** Require a sustained pinch and a release before the next click. Disarm on lost tracking rather than interpreting a reappearing pinched hand as a new selection.
3. **Limited control:** Restrict selections to designated controls in one simulated workspace.
4. **Recovery:** Provide pause, stop, Escape, camera error messages, and mouse/keyboard alternatives.
5. **Clear feedback:** Show tracking mode, current gesture, task progress, review state, and a temporary activity log.
6. **Local video:** Process camera frames in the browser. The app does not upload or record them.
7. **Readable demonstration:** A camera-free walkthrough lets reviewers inspect the workflow. Simulated timing is explicitly labeled and must not be presented as human performance.

## Implementation

HTML/CSS/JavaScript modules, MediaPipe hand landmarks, and an application-authored gesture engine. No account, backend, patient data, or native computer control is required. The initial architecture is intentionally small enough to inspect and explain.

## Evaluation status

The software tests use synthetic landmarks to check selection and recovery rules. They do not establish glove-recognition reliability. The next evaluation is the same task with mouse, bare hand, and glove, documenting lighting, hardware, missed actions, accidental clicks, completion rate, completion time, and participant comfort. See TEST_PLAN.md.

## What to say in an interview

“GloveFlow is a self-directed interaction prototype I developed with AI-agent assistance. It explores touchless navigation in a simulated workspace. I focused on deliberate selection, tracking-loss recovery, and transparent camera states. I can walk through the code and tests, and the next step is real glove evaluation.”

Use this statement only after personally reviewing and understanding the implementation. Replace it with your own explanation and actual contributions; do not claim unperformed tests or independent authorship.
