# Continuous integration

[English](CI.md) | [简体中文](CI.zh-CN.md)

The [Build and QA workflow](../.github/workflows/ci.yml) checks pull requests, pushes to `main`, and manual runs from GitHub's Actions tab. Its **Compile and test** job uses Ubuntu 24.04 and Node.js 24.14.1, with a 20-minute limit. A new run cancels an older run for the same pull request or branch.

## What runs

1. `npm run setup` installs root and game dependencies at the exact versions recorded in their lockfiles. The archived cart harness installs from its own lockfile; all three lockfiles key the npm download cache.
2. `npm --prefix src run questions:validate` checks committed question data before the build can regenerate it. Then `npm run build`, `npm test` and `npm run test:types` compile the production game and run deterministic regressions and property-generator type checks.
3. `node run.mjs quick --rounds 1 --seed 20260914 --no-tui` runs one reproducible, bounded fuzz round and records current source hashes.
4. `npm run qa:build` and `npm run qa:test` compile and test the general isolated QA preview and device-inspection helpers.
5. Both archived phone previews are built, then their cart, probe and suite tests run. Archiving a harness keeps it runnable against current game source.
6. Playwright installs Chromium, WebKit and their Linux system dependencies. `npm run qa:all` runs six smoke scenarios: Web, Android emulation and iOS emulation, each in English and Simplified Chinese.

Browser checks create their own local fixture server and fresh browser contexts. They verify startup, licenses, controls, pause/resume, storage isolation and blocked external requests. Android and iOS entries are browser simulations; a passing workflow does not establish physical-device performance or native Safari behavior. Follow the [QA guide](QA.md) for connected-device checks.

The production build regenerates question data and dependency notices before compiling. Optional packages vary by operating system, so generated notices from the Linux runner can differ from a macOS installation. CI validates their content and freshness without requiring a clean Git diff after generation.

## Investigating a failure

Open the failed step in GitHub Actions. Commands also write logs under `results/ci/`; Bash's `pipefail` preserves failures when output is captured with `tee`.

When a step fails, the `qa-failure-<run ID>-<attempt>` artifact retains available logs, fuzz reports, counterexamples, source hashes, browser screenshots and QA results for seven days. The upload excludes device reports, Vercel access reports and hidden files. CI does not create physical-device reports or read local preview configuration, passwords or Toy credentials.

When the bounded quick-fuzz step fails, CI uploads a small `fuzz-feedback-<run ID>-<attempt>` JSON artifact and includes `results/fuzz-feedback/report.md` in the full failure artifact. The Markdown and JSON reports retain the suite, base and derived seeds, per-case seeds and shrink paths when recorded, source hashes and bounded replay instructions. Original logs and counterexamples remain in the full failure artifact. Download them before the seven-day retention period ends.

The separate [feedback workflow](../.github/workflows/fuzz-feedback.yml) posts a short **github-actions[bot]** comment on the associated open PR: failing suites, recorded seeds, and links to the run and its details artifact. If the full failure artifact is unavailable, the link points to the JSON report. A setup/build failure without a fuzz failure does not create a fuzz comment. A PR whose head has changed since the failed run is skipped. Repeating the publisher updates only the GitHub Actions bot's own marked comment for that commit, run and attempt; it does not edit other comments.

No personal token, bot account setup, environment secret or separate credential is required. The feedback workflow becomes active after it is merged into the repository's default branch. Both jobs run only from `main`, check out that trusted default-branch commit, install no dependencies and never execute PR code. The read-only preparation job verifies workflow/run identity, the failed step, associated PR head and both repository IDs, then downloads a bounded single-file JSON artifact from the matching run. Fork PRs use GitHub's commit-to-PR association when the workflow payload omits them. Archive paths are never extracted; free-form errors, supplied replay commands and counterexample text never enter the comment.

Preparation passes only bounded, validated data to a separate publishing job. That job grants GitHub's automatic, repository-scoped `GITHUB_TOKEN` `issues: write` plus `contents: read`, and supplies it explicitly only to the comment step. The build and artifact-preparation jobs retain read-only permissions. The publisher verifies the public GitHub Actions bot identity before deduplicating comments and uses only comment-listing and own-comment create/update operations. API credentials and response error bodies are never logged.

Run CI reproduction commands from the repository root with Node.js 24.14.1 and `npm run setup`. The root `.nvmrc` selects Node 24; `src/.nvmrc` is an older standalone-game pin, so do not use it for CI-parity runs. Use `nvm install 24.14.1` and `nvm use 24.14.1` for the exact CI version. For browser checks, first run:

```sh
npx --no-install playwright install chromium webkit
npm run qa:build
npm run qa:all
```

On Linux, add `--with-deps` to the browser-install command to install required system libraries. Preserve the original seed, shrink path and source hashes before rerunning fuzz failures; see [FUZZING.md](FUZZING.md).

## Maintaining the workflow

Official `actions/checkout`, `actions/setup-node` and `actions/upload-artifact` releases are pinned to full commit hashes, with their release versions alongside them. Verify the upstream release and its commit before updating a pin. Keep the Node version aligned with supported local tooling and keep dependency installation locked.

Build and QA grants only `contents: read`, does not persist checkout credentials, and uses the ordinary `pull_request` event. The separate trusted `workflow_run` preparation job grants read access to contents, Actions and pull requests; its publishing job adds only `issues: write` to `contents: read` for the automatic token. Neither workflow deploys, publishes Toy previews or changes passwords. Release work remains a separate authorized step in the [release guide](RELEASE.md). Repository branch-protection settings are not changed by these workflows; a maintainer can choose **Compile and test** as a required check after its first run.
