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

`npm test` runs deterministic regressions. `npm run test:types` checks the typed property generators, and `npm run test:fuzz` runs one bounded quick pass of the seed matrices, property tests and renderer checks. All tests import the current source under `outputs/community-seasons/`.

For a reproducible, bounded run:

```sh
node run.mjs quick --rounds 2 --seed 3231321585 --no-tui
```

Read `results/summary.json` for the outcome, source hashes and each suite's seed settings; suite output is in `results/<suite>.log`. Failure reports and logs are also saved in `results/failure/`. Preserve the failing seed, shrink path, source hashes and dependency lockfile together before rerunning. Each invocation writes the same result paths, so run only one fuzz session at a time in this checkout.

See [FUZZING.md](FUZZING.md) for workload settings and exact failure replay. `snapshot.json` is a historical import baseline; the runner records current source hashes and stops if source changes during a session. Finish source edits before starting tests. Continuous stress requires the explicit `--forever` flag and should only be run when requested.

## Maintaining the QA runners

| File / function | Responsibility |
| --- | --- |
| `scripts/test.mjs` | Find and sort deterministic `work/community-tests/*.test.mjs` files, excluding fuzz suites, then run Node's test runner. |
| `run.mjs`: `parseOptions`, `createBaseEnvironment`, `createRoundEnvironment` | Validate CLI options, apply workload defaults and derive reproducible per-suite seeds. |
| `run.mjs`: `runChild`, `ensureDependencies` | Install exact locked dependencies when needed, manage child processes, cap logs and enforce timeouts. |
| `run.mjs`: `readSourceHashes`, `createReport`, `preserveFailure` | Record the tested source, maintain the report schema and retain failure artifacts. |
| `run.mjs`: `runSuite`, `runRound`, `main` | Run the selected suites, stop on the first unsuccessful result and finalize the session summary. |
| `terminal-dashboard.mjs` | Display progress; it does not select tests or change their execution. |

Keep suite order, seed derivation constants, environment variable names and the report format stable when refactoring. Passed rounds, failed rounds, interruptions, runtime limits and changed source each have a separate counter; incomplete work must not count as passing.

## Browser layout checks

Install the browser once:

```sh
npx playwright install chromium
```

Start a fixture server in one terminal and its tests in another, both from the repository root:

```sh
npm run qa:licenses:serve
npm run qa:licenses
```

```sh
npm run qa:android:serve
npm run qa:android
```

Licenses QA uses port 3029; Android large-text QA uses 3028. Tests write screenshots and JSON under their fixture directory. Text scaling is simulated in Chromium, not native Android hardware. The licenses suite checks lazy loading, original notices, no hyperlinks, focus, pause, retry and responsive layouts. Android QA checks result/pause layouts and high numeric values.

The local fixtures may clear storage **on their own local origin**; use their dedicated ports and clean browser profiles, not a player's production origin. Fixtures are not release builds.

## Physical iPhone / cart QA

`work/phone-cart-fix-qa/` is the focused cart harness; `work/iphone-qa/` retains the extended rendering/performance harness. Their bootstrap and SDK wrappers isolate test state from game saves. Build the focused harness with `npm run qa:phone:build`. Build the extended harness with `npm run qa:iphone:build`. Never upload either output as a production release. Obsolete font/DPR experiment scripts were not imported.

To run through Toy, upload a separate test preview when authorized. Create `work/phone-cart-fix-qa/preview.json` locally with `{"preview_url":"THE_ACTUAL_TOY_PREVIEW_URL"}`. For the extended harness, use `work/iphone-qa/preview-20260910.json`. These configuration files are Git-ignored; none contains an inherited preview or password.

The USB scripts require an independently configured Web Inspector/CDP bridge at `http://127.0.0.1:9223`; it is not bundled or automatically launched. Keep the wired iPhone unlocked, with normal Safari showing the exact isolated preview. A real tap on Start/Begin run is necessary for reliable Safari timing. Avoid a Safari Remote Automation session when the user needs to touch the page, since its testing popup interferes.

Run `node work/phone-cart-fix-qa/usb.mjs status` to inspect the selected preview. The script validates the exact preview and isolated QA context before actions. Read the script's supported commands before arming a test. Physical-device results must be freshly collected; historical device identifiers, recordings and raw outputs were not imported.

Manual checks should include all seasons, turning, boost expiry, cart approach/questions/exit, wrong-answer falls, share open/close, enlarged text, orientation, pause/resume and cloud-save conflict choices. Do not write real cloud saves merely to exercise a layout.
