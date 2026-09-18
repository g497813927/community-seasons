# Working on Community Seasons

[English](AGENTS.md) | [简体中文](AGENTS.zh-CN.md)

- This is the canonical source tree for work started in this folder. Edit `src/` and keep source changes within this repository.
- Read the root README, `docs/QA.md`, and the game README/GAMEPLAY.md before changing behavior.
- Preserve English/Simplified Chinese, keyboard/WASD, touch/swipe/double-tap, accessibility and enlarged-text layouts.
- Keep Toy cloud saves and all QA save namespaces separate. Do not overwrite user saves during QA.
- Production cannot expose debug globals, QA presets, autoplay test controls, or scene/speed overrides via URL parameters. Only ship the game's production dist.
- Keep the question deck's recent-question protection across retries and reshuffles. Edit the JSON bank, then synchronize generated data.
- Run relevant regression tests and the production build. Fuzz tests use current source; record failures with seed/path/source hashes. Do not run infinite stress tests unless requested.
- No deployment, GitHub push or publication-setting change without user authorization. Preserve existing publication settings through content-only updates. Never commit or print credentials.
- Browser QA needs its own fixture server; phone QA requires a connected, unlocked device and an explicitly selected test preview. Do not claim native-device performance based on desktop simulation.
- Before requesting manual interaction, identify and report whether Safari is under WebDriver automation. Its [Glass Pane](https://developer.apple.com/documentation/webkit/about-webdriver-for-safari#Glass-Panes) blocks manual input; breaking it interrupts and permanently disconnects the session. Use WebDriver; never ask the user to tap, click, resize, or break the pane. `qa:device measure` requires an ordinary manual preview; preserve its focus/activation guards. Label the installed iOS CDP bridge's JavaScript-based `Input.dispatchMouseEvent` as scripted functional input, not manual input or native-input performance evidence.
- Keep dependency versions locked and regenerate third-party notices after changing them. License notices remain inline with no hyperlinks in the game.
