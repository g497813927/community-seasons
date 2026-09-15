# QA and test guide

[English](QA.md) | [简体中文](QA.zh-CN.md)

## Automated regression and fuzzing

Use Node.js 24 (see the root `.nvmrc`) and run these commands from the repository root:

```sh
npm run setup
npm run build
npm test
npm run test:types
npm run test:fuzz
```

`npm test` runs deterministic regressions. `npm run test:types` checks the typed property generators, and `npm run test:fuzz` runs one bounded quick pass of the seed matrices, property tests and renderer checks. All tests import the current source under `src/`.

For a reproducible, bounded run:

```sh
node tests/fuzz/run.mjs quick --rounds 2 --seed 3231321585 --no-tui
```

Read `results/summary.json` for the outcome, source hashes and each suite's seed settings; suite output is in `results/<suite>.log`. Failure reports and logs are also saved in `results/failure/`. Preserve the failing seed, shrink path, source hashes and dependency lockfile together before rerunning. Each invocation writes the same result paths, so run only one fuzz session at a time in this checkout.

See [FUZZING.md](FUZZING.md) for workload settings and exact failure replay. `snapshot.json` is a historical import baseline; the runner records current source hashes and stops if source changes during a session. Finish source edits before starting tests. Continuous stress requires the explicit `--forever` flag and should only be run when requested.

## Maintaining the QA runners

| File / area | Responsibility |
| --- | --- |
| `tests/unit/run.mjs` | Find and sort deterministic `tests/unit/*.test.mjs` files, excluding fuzz suites, then run Node's test runner. |
| `tests/fuzz/run.mjs`: CLI and workload setup | Validate CLI options, apply workload defaults and derive reproducible per-suite seeds. |
| `tests/fuzz/run.mjs`: dependency and process management | Install exact locked dependencies when needed, manage child processes, cap logs and enforce timeouts. |
| `tests/fuzz/run.mjs`: source tracking and reports | Record the tested source, maintain the report schema and retain failure artifacts. |
| `tests/fuzz/run.mjs`: suite and round execution | Run the selected suites, stop on the first unsuccessful result and finalize the session summary. |
| `tests/fuzz/terminal-dashboard.mjs` | Display progress; it does not select tests or change their execution. |

Keep suite order, seed derivation constants, environment variable names and the report format stable when refactoring. Passed rounds, failed rounds, interruptions, runtime limits and changed source each have a separate counter; incomplete work must not count as passing.

## Web, Android and iOS QA

Use the [cross-platform QA framework](../tests/qa/README.md) for current browser and device checks:

```sh
npm run qa:build
npm run qa:test
npm run qa:all
npm run qa:preview
```

`qa:web`, `qa:android`, and `qa:ios` run individual browser profiles. The web and Android profiles use Chromium; iOS uses WebKit. Mobile profiles are simulations, not native performance measurements. Each uses clean browser contexts, isolated saves, blocked external requests, and timestamped reports under `results/qa/`.

Browser gameplay checks use Playwright's controlled clock, with bounded advances between real input events. Pause and resume assertions advance that clock too, so stopping the clock cannot falsely satisfy the pause test. Android/English includes a six-second host-delay regression. Browser timer/frame samples are therefore synthetic; use the normal-clock interactive preview and selected physical-device checks for performance observations.

For a physical device, open the exact built preview in normal Safari/Chrome and use `qa:device` with an explicitly selected URL and inspector target. The device guide covers Android USB forwarding and the iOS Web Inspector bridge. Measurement requires the unlocked, visible, focused preview and a real tap. The generic preview disables all Toy SDK/cloud access and maps saves before the current game loads. It works locally or as an authorized isolated hosted preview.

## Historical scenarios

The former `work/*-qa/` directories are preserved in [`tests/qa/archive/`](../tests/qa/archive/) with their existing targeted scenarios and tests. Use `qa:archive:licenses`, `qa:archive:android`, `qa:archive:phone:build`, and `qa:archive:iphone:build` when reproducing those issues; see the framework guide for paired server commands and safety boundaries.

Do not run archived fixtures on a player's production origin: some clear their own local storage, while the dated iPhone cloud harness uses separate test keys. Preview configuration, screenshots and raw device reports remain Git-ignored. Historical performance results are not current physical-device validation.
