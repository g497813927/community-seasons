# In-run booster controls QA

[English](README.md) | [简体中文](README.zh-CN.md)

This fixture loads the real game on a dedicated local origin, seeds purchases in a fresh context, disables Toy access, and freezes the run clock for deterministic UI checks. It must never be deployed or used against player saves.

From the repository root, run the fixture server and then the check in a second terminal:

```sh
npx vite work/boost-controls-qa --config work/boost-controls-qa/vite.config.ts
node work/boost-controls-qa/check.mjs
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing Chrome/Chromium executable if the Playwright browser has not been installed. `QA_QUICK=1` checks only the narrowest phone viewport. The full suite covers English and Simplified Chinese, two phone sizes, desktop, and normal/200% computed text sizes. It checks opening timing, persistent touch controls, consumption, active/empty states, accidental drag/double-tap isolation, keyboard shortcuts, pause, railway restrictions, permanent skills, target sizing, clipping, and overlap.

Screenshots and `results.json` are ignored by Git. Results include source hashes and are browser simulations, not physical-phone performance claims.
