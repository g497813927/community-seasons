# Community Seasons — fuzz tests

[English](FUZZING.md) | [简体中文](FUZZING.zh-CN.md)

These tests run against the current game source in this repository. They need no Toy/Vercel account, browser, phone, AI service, or API key and cannot publish anything.

## Run

Install **Node.js 22.13 or newer** (Node 24 recommended, with npm), open a terminal at the repository root, and run:

```sh
node run.mjs quick
```

If the root dependencies are missing or differ from the pinned versions, the runner installs them with `npm ci --ignore-scripts`. This includes the test tools (**fast-check 4.9.0**, **TypeScript 5.9.3**, and fast-check's locked dependency **pure-rand 8.4.2**) and the root's browser-fixture tools. After installation, fuzz tests work offline. First-run download time is additional to the test timings below. Use `npm run setup` for the complete workspace, including the separate game dependencies needed to build it.

For the full bounded test set:

```sh
node run.mjs full
```

## Python launcher (optional)

With **Python 3.8+**, the standard-library launcher runs the same tests:

```sh
python3 fuzz_game.py quick
python3 fuzz_game.py full --forever
python3 fuzz_game.py quick --forever --duration 60 --seed 12345
```

Python still needs Node.js/npm to execute the actual TypeScript/JavaScript game tests. No pip packages are required. Python coordinates the runs; fast-check generates the property-test cases, with no AFL dependency. All Node-runner options pass through; `--node PATH` can select a Node executable. `--duration SECONDS` adds a wall-clock ceiling and does not turn a single pass into a loop—include `--forever` explicitly for timed stress testing.

The wrapper forwards stop signals to the Node runner and writes `results/python-summary.json`, distinguishing failures, manual interruption, and a requested time limit. Reaching a time limit does not mean an unfinished round passed. The existing Node logs and replay artifacts remain available.

## Live terminal dashboard

Interactive terminals automatically show the current round, completed **passed / failed rounds**, active suite, elapsed time, master and current round seeds, and log location. The elapsed timer keeps updating during long tests. Infinite runs show `Round N / ∞`. These are round counts, not individual generated test cases.

```sh
node run.mjs full --forever --tui
python3 fuzz_game.py quick --rounds 2 --tui
node run.mjs quick --no-tui
```

Interrupted rounds, runtime limits, and source changes have separate counters and never count as passed or failed. Ctrl+C restores the terminal and saves the summary. Output redirected to a file, `TERM=dumb`, and terminals smaller than 44 columns or 14 rows use plain progress logs, even with `--tui`; resizing below that size switches to plain logs. The dashboard updates four times per second and does not change test execution.

## Optional continuous stress mode

Run until the first failure or until you press **Ctrl+C**:

```sh
node run.mjs full --forever
```

For shorter rounds, use `node run.mjs quick --forever`. Continuous mode is never enabled by default. To run a fixed number of stress rounds reproducibly:

```sh
node run.mjs quick --rounds 2 --seed 12345
```

Each round uses fresh deterministic seeds for **every** test family: engine, economy, renderer, both property suites, and typed generators. A master seed is printed and recorded; `--seed` sets it explicitly. Each round's derived seed and exact family settings are recorded in `results/summary.json`. Game-source hashes are checked before and after suites. If you edit the game while tests are running, the session stops as `inputs-changed`, not as a gameplay failure; restart after completing your edits. To repeat a particular round directly, use its recorded round seed as `--seed` with the same workload options.

The first failed suite stops further suites and rounds; the current Node test suite may finish its remaining properties. Its output and seed settings are retained in `results/failure/`; generated counterexamples, shrink paths, and deterministic traces remain under `work/`. Ctrl+C stops the active child process and saves an `interrupted` summary (exit code 130), rather than reporting a gameplay bug. Only completed successful rounds count as passed. `roundCounts` records passed, failed, interrupted, time-budget, and inputs-changed outcomes separately; `completedRounds` remains the passed-round total.

Program-created success logs are overwritten each round and capped at 1 MiB per suite. Only the latest round and cumulative counts are kept, so a long successful stress session does not create a growing collection of result files. Preserve failure files elsewhere before beginning another investigation. Dependencies are checked before each session and reinstalled only when needed.

Exact-replay environment variables cannot be combined with `--forever`, `--rounds`, or `--seed`; unset them first. Use the individual replay commands below for a shrunk case.

On the development Mac, quick mode is about 10–20 seconds; full mode is about two minutes. Slower computers may take longer. The renderer has a 170-second guard; raise it if the log explicitly says the time budget was reached:

```sh
node run.mjs full --budget-seconds 300
```

macOS/Linux also support `./run.sh quick` and `./run.sh full`. `npm run test:fuzz` runs the quick fuzz suite; `npm test` runs the separate deterministic regressions. Use `node run.mjs full` for a bounded full fuzz run. `npm run test:stress` explicitly starts an unbounded full run.

## What's tested

| Suite | Coverage | Quick | Full |
| --- | --- | --- | --- |
| `engine` | Movement interruption, edges, pauses, repeated inputs, boost expiry, fork assistance and barrier protection, both forks, railway answers/return, station approach timing, season transitions, fixed scenery geometry | 768-seed regression matrix, 64 natural station approaches, and focused fork/railway/scenery regressions | Same matrix |
| `economy` | Purchases, balances, upgrades, one-portal ownership, bank-once rewards, skill charging, local/cloud serialization and invalid saved data | 32 seeds × 400 actions, plus fixed boundary checks | 1,024 seeds × 400 actions, plus fixed checks |
| `engine-properties` | fast-check randomized numeric boundaries, invalid actions/lanes, malformed levels and input sequences; counterexample shrinking | 200 cases per property | Original 21,000-case matrix |
| `save-properties` | fast-check arbitrary/corrupt/legacy saves, normalization, cloud envelope and value preservation | 200 cases per property | Original 50,000-case matrix |
| `typed-generators` | Typechecked factories using actual game interfaces; valid save coupling, deliberate invalid fields, and structured commands | 200 cases per property | 4,000 cases |
| `renderer` | Four seasons, English/Chinese, eight viewport sizes, forks, railway results/falls/return, boosts, pauses and destination previews | 16 seeds | 224 seeds / approximately 24,000 frames |

The `engine` suite also runs fixed geometry regressions alongside its fork/camera checks: autumn/winter roof visibility uses independent ray intersections, and summer lamp supports are checked on straight roads, curved forks, railway decks and destination previews.

The randomized `renderer` suite validates finite geometry, clipping and canvas arguments, restored transparency, and bounded face/cache counts using a Canvas2D adapter. It does **not** measure native Safari/GPU performance or replace visual and physical-phone testing. Passing means no failure was found in these checks, not proof that no bug exists.

## Customize

```sh
node run.mjs quick --suite renderer --renderer-seeds 8
node run.mjs full --renderer-seeds 64 --renderer-offset 224
node run.mjs quick --suite economy --store-seeds 100 --actions 600
node run.mjs full --suite save-properties --runs 1000
node run.mjs --help
```

`--suite` accepts `all`, `engine`, `economy`, `renderer`, `engine-properties`, `save-properties`, or `typed-generators`. `--runs` overrides cases per selected fast-check property. Renderer runs below 16 seeds are small structural smoke checks; they do not require complete season/effect coverage. The fixed engine regression matrix stays intact in quick mode because it takes only a few seconds.

## Results and replay

The runner stops on the first failed suite and returns a nonzero exit code. Start with `results/summary.json` and `results/<suite>.log`. Detailed reports and failure traces are beside their scripts under `work/`. Keep the failing seed, shrink path, source hashes and dependency lockfile together.

On macOS/Linux, these examples replay individual cases after the first dependency install:

```sh
# A saved deterministic engine trace (use the path printed in its failure log)
ENGINE_FUZZ_REPLAY=work/community-tests/engine-fuzz-failures-20260910/EXAMPLE.json node run.mjs quick --suite engine

# An economy sequence
STORE_FUZZ_SEED=5349376 node run.mjs quick --suite economy

# Renderer seed/scenario; use the values in work/renderer-fuzz/repro.json
RENDERER_FUZZ_SEED=4182 RENDERER_FUZZ_SCENARIO=fork--1 node run.mjs quick --suite renderer

# fast-check: use the exact property, seed and shrink path from its failure report
FC_PROPERTY=direct-malformed-level FC_SEED=123 FC_PATH='0:1' node run.mjs quick --suite engine-properties
FC_SAVE_CASE='PROPERTY_NAME_FROM_REPORT' FC_SAVE_SEED=123 FC_SAVE_PATH='0:1' node run.mjs quick --suite save-properties
```

The example paths are placeholders. Copy the actual generated replay values; arbitrary shrink paths do not identify the same test case. On PowerShell, set the same variables using `$env:NAME = "value"` before the `node` command, then remove them afterwards. Unset replay variables before a fresh complete run.

The defensive `activateBoost` level-normalization regression is included. It covers malformed direct calls as well as the normal decoded-save path. The engine suite also checks speed-boost fork assistance: gradual default-left steering, preserved right choices, last-moment activation with the actual entry pose, expiry, pause behavior, and railway answers remaining manual. Active rush, head-start and portal boosts are also checked against edge barriers: they must not start or extend a chase or recoil, while ordinary edge and shield behavior remains unchanged.

## Typed generators

`work/property-tests/typed-arbitraries.ts` imports the game's actual TypeScript interfaces. Its exhaustive field maps are checked with `satisfies`, so missing fields or incompatible types fail compilation. It generates coherent valid saves, separately tagged invalid mutations, and structured commands with fast-check shrinkers. Cross-field rules (such as one portal with a matching destination) are preserved explicitly.

This is a typechecked factory, not runtime reflection that guesses arbitrary data from any interface. See [typed-arbitraries.md](../work/property-tests/typed-arbitraries.md) for the exported helpers and examples.

```sh
node run.mjs quick --suite typed-generators
npm run test:types
```

Typed-property failures include the exact `FC_TYPED_SEED`, `FC_TYPED_PATH`, and Node test-name filter needed to replay that property. Copy that generated command after the first dependency install.

## Included code and reproducibility

`snapshot.json` contains historical SHA-256 hashes from the workspace import. The test runner records current hashes in each summary. Source lives under `outputs/community-seasons/lib/game/`; the `work/` layout preserves the test imports. Differences from the import baseline are expected after edits.

Edit the canonical game source directly before starting a test session. There is no separate frozen game copy to synchronize. The runner hashes the baseline file list plus current TypeScript and JSON game modules, and checks for changes before and after each suite. Keep dependencies pinned when replaying a shrunk failure.

The repository also contains deployment configuration and isolated browser/phone fixtures; fuzzing does not run or publish them. Test output, generated `.mjs` modules, `.npm-cache`, and `node_modules` are created locally and ignored by Git. Only `outputs/community-seasons/dist/` is a production artifact. See [QA.md](QA.md) for fixture isolation and [RELEASE.md](RELEASE.md) for release constraints.
