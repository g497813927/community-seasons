# Workspace validation — 2026-09-11

[English](VALIDATION.md) | [简体中文](VALIDATION.zh-CN.md)

Validated in this folder after installing its own locked dependencies:

- Production typecheck and build: passed.
- Deterministic regressions: 242/242 passed.
- Typed fast-check factories: passed.
- Quick fuzz pass: all six suites passed (engine, economy, engine properties, save properties, typed generators, renderer).
- Licenses browser QA: 15/15 scenarios passed, including EN/ZH, narrow screens, 200% panel text, lazy loading, focus, no hyperlinks and pause behavior.
- Focused cart and extended iPhone harness builds: passed.
- Cart helper and iPhone probe/suite unit tests: passed.
- Game implementation and assets compared byte-for-byte with the original workspace; hashes in WORKSPACE_IMPORT.json.

Browser checks used local Chrome through PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. The portable default uses Chromium installed by `npx playwright install chromium`. No physical phone session or remote publication was performed for this workspace preparation.

Builds retain the existing large-bundle advisory. One stale lazy-ref test fixture was extended to include the session question deck. Obsolete font/DPR experiments were omitted. Game behavior was not changed.
