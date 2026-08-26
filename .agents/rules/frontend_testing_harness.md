# Zero-Token Frontend Testing & Debugging Standards

## Core Principles

1. **Avoid Blind Visual/Pixel Subagents for Debugging**:
   - Never rely on repetitive browser screenshotting and coordinate guessing to debug functional UI bugs. This wastes tens of thousands of LLM tokens and is slow and nondeterministic.

2. **Mandatory In-Browser Test Harness (`window.__TEST_API__`)**:
   - All interactive web apps must expose a programmatic test API on `window.__TEST_API__` in client scripts.
   - Essential methods:
     - State setters & getters (e.g. `switchSessionById`, `setInteractionMode`)
     - Modal triggers (e.g. `openSentenceEditor`)
     - Self-diagnostics (e.g. `runSelfDiagnostics()`)
   - The application must support URL query parameters like `?self-test=1` to run automated in-browser verification on page load and print clear diagnostic JSON reports to the console.

3. **Explicit `data-testid` Attributes**:
   - Every primary interactive element (sidebar items, toolbar buttons, inputs, modal triggers, action buttons) must have a unique, descriptive `data-testid="..."` attribute.

4. **Fast CLI E2E Verification Scripts**:
   - Build lightweight Node/JSDOM/Python scripts (e.g. `scripts/test_browser_e2e.py`) to execute end-to-end DOM assertion flows in < 2 seconds with **zero LLM token consumption**.
