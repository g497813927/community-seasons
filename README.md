# Community Seasons / 四季共建 — maintenance workspace

This folder is a self-contained source and QA workspace prepared on 2026-09-11. Open **this folder** in your editor or a future coding conversation. All game changes belong in `outputs/community-seasons/`; tests and QA import that same source. The original working folders remain untouched.

## Setup

Install Node.js 24 (see `.nvmrc`) and Python 3.8+ if using the optional Python fuzz launcher.

```sh
npm run setup
npm run dev -- --port 3001
```

`setup` installs exact locked dependencies in the workspace and the game. No symlink to the original machine is required. Run commands from this workspace root unless specified otherwise.

## Layout

- `outputs/community-seasons/` — complete production React/TypeScript/Vite game, translations, question bank, assets, license generator and deployment configuration.
- `work/community-tests/` — deterministic engine, renderer, layout logic, question bank, licenses and production-boundary regressions.
- `work/property-tests/` — fast-check generators and malformed gameplay/local/cloud-save tests.
- `work/renderer-fuzz.mjs` — randomized canvas/scene checks.
- `run.mjs`, `fuzz_game.py`, `terminal-dashboard.mjs` — bounded/infinite fuzz runner, optional Python launcher and live TUI.
- `work/licenses-ui-qa/`, `work/android-large-text-qa/` — browser fixtures and automated layout checks.
- `work/phone-cart-fix-qa/`, `work/iphone-qa/` — isolated phone/cart and extended-performance fixtures; see `docs/QA.md`.
- `docs/` — maintenance, QA, fuzzing and release notes.
- `snapshot.json` — import baseline for fuzz reproducibility; current source hashes are recorded on every run.

The `outputs/` and `work/` names preserve existing relative test imports. They are intentional source directories, not disposable build output. There is no duplicate frozen game source inside a separate fuzz kit.

## Build and tests

```sh
npm run build
npm test
npm run test:types
npm run test:fuzz
```

Only `outputs/community-seasons/dist/` is a production artifact. QA code and URL switches must never be included in it.

```sh
# Repeat until stopped or a failure is found; shows a TUI in a suitable terminal.
node run.mjs full --forever --tui
# Reproducible bounded run
node run.mjs quick --seed 3231321585
# Optional Python wrapper with a time limit
python3 fuzz_game.py quick --forever --duration 600 --tui
```

See `docs/FUZZING.md` for suites, workload controls, failure replay and limitations. Results and generated compilers are ignored by Git. Preserve a failure log, seed, shrink path and source hashes together before rerunning.

## Future maintenance

Read `AGENTS.md`, `docs/QA.md` and `docs/RELEASE.md`. The editable question bank is `outputs/community-seasons/lib/game/rail-questions.json`; run the project's question synchronization command after edits (build/dev also synchronize it). The licenses panel generates from installed locked dependencies and has no hyperlinks.

This import does not choose a license for your own game code. Third-party notices are retained separately. Before making the repository public, choose the license you want for your own work.

## Upload to GitHub later

This folder is ready to use as the repository root. No GitHub repository or remote has been created, and nothing has been pushed. `.gitignore` excludes installed dependencies, builds, local credentials, QA previews and device/test output. Authentication, the Toy access password, user saves, device identifiers and old raw recordings were not copied.
