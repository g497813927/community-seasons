# Tests and QA

[English](README.md) | [简体中文](README.zh-CN.md)

Run commands from the repository root with Node.js 24. These suites load the current game under `src/`; compiled test modules and saved reports are generated evidence, not a second game source tree.

## Choose a suite

| Directory | Purpose | Command |
| --- | --- | --- |
| `unit/` | Deterministic engine, rendering, layout, question-bank, license and production-boundary regressions | `npm test` |
| `fuzz/` | Bounded runner, seeded engine/economy tests, renderer checks, terminal dashboard and optional Python/shell launchers | `npm run test:fuzz` |
| `property/` | Fast-check gameplay/save properties and typechecked generators | `npm run test:types`; select a property suite with the fuzz runner |
| `helpers/` | Shared compilation of current TypeScript game modules for Node tests | Loaded by the suites |
| `qa/` | Isolated web/Android/iOS preview, browser checks, device inspection and archived scenarios | See the [QA framework guide](qa/README.md) |

The deterministic runner sorts its test files and leaves randomized suites to the fuzz runner. The six fuzz suite names remain `engine`, `economy`, `engine-properties`, `save-properties`, `typed-generators` and `renderer`; their seed settings and replay controls are unchanged.

## Run the checks

```sh
npm run setup
npm run build
npm test
npm run test:types
node tests/fuzz/run.mjs quick --rounds 1 --seed 20260914 --no-tui
```

Use `--suite engine-properties` or another suite name to narrow the bounded run. The optional Python entry point is `python3 tests/fuzz/fuzz_game.py`; the shell entry point is `sh tests/fuzz/run.sh`. Both forward the same runner options and write aggregate results at the repository root.

For browser QA, build the separate preview before testing:

```sh
npm run qa:build
npm run qa:test
npm run qa:all
```

Install the browser engines as described in the [QA framework guide](qa/README.md). Browser emulation does not establish native-device performance; device checks require an unlocked, connected device and an explicitly selected QA preview. Keep QA saves separate from player and Toy cloud saves.

## Preserve failure evidence

Aggregate fuzz status and current source hashes are in `results/summary.json`, with one `results/<suite>.log` per suite. The first failure also preserves its logs and summary in `results/failure/`. Detailed traces and counterexamples retain their filenames beside the relevant suite:

- `tests/fuzz/engine-fuzz-failures-*/` and `tests/fuzz/store-economy-fuzz-failure.json`
- `tests/property/*-failure-*.json`
- `tests/fuzz/renderer-fuzz/repro.json` and `results.json`

Keep the seed, shrink path, source hashes and dependency lockfile together before rerunning. Earlier saved traces need not be moved: point the existing replay option, such as `ENGINE_FUZZ_REPLAY`, at the file's actual location. Generated caches, reports and browser evidence are ignored by Git. `snapshot.json` remains the historical import baseline.

See the [test and QA guide](../docs/QA.md), [fuzzing and replay guide](../docs/FUZZING.md), and [typed generator guide](property/typed-arbitraries.md) for detailed workflows.
