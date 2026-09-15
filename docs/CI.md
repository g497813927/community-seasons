# Continuous integration

[English](CI.md) | [简体中文](CI.zh-CN.md)

The [Build and QA workflow](../.github/workflows/ci.yml) checks pull requests, pushes to `main`, and manual runs from GitHub's Actions tab. Its **Compile and test** job uses Ubuntu 24.04 and Node.js 24.14.1, with a 20-minute limit. A new run cancels an older run for the same pull request or branch.

## What runs

1. `node scripts/check-committed-notices.mjs` checks committed license notices before installing dependencies or generating files. Then `npm run setup` installs root and game dependencies at the exact versions recorded in their lockfiles. The archived cart harness installs from its own lockfile; all three lockfiles key the npm download cache.
2. Railway issue parser regressions and `npm --prefix src run questions:validate` check the submission tooling and committed question data before the build can regenerate it. Then `npm run build`, `npm test` and `npm run test:types` compile the production game and run deterministic regressions (including the issue parser) and property-generator type checks.
3. `node tests/fuzz/run.mjs quick --rounds 1 --seed 20260914 --no-tui` runs one reproducible, bounded fuzz round and records current source hashes.
4. `npm run qa:build` and `npm run qa:test` compile and test the general isolated QA preview and device-inspection helpers.
5. Both archived phone previews are built, then their cart, probe and suite tests run. Archiving a harness keeps it runnable against current game source.
6. Playwright installs Chromium, WebKit and their Linux system dependencies. `npm run qa:all` runs six smoke scenarios: Web, Android emulation and iOS emulation, each in English and Simplified Chinese.

Browser checks create their own local fixture server and fresh browser contexts. They verify startup, licenses, controls, pause/resume, storage isolation and blocked external requests. Android and iOS entries are browser simulations; a passing workflow does not establish physical-device performance or native Safari behavior. Follow the [QA guide](QA.md) for connected-device checks.

The production build regenerates question data and dependency notices before compiling. The earlier read-only notice check compares the committed JSON inventory's `generatedFromLockfile` SHA-256 with `src/package-lock.json`, and checks that the committed text notice matches that inventory. A stale snapshot fails before prebuild can replace it. This check needs no installed packages: optional packages vary by operating system, so a valid macOS inventory can differ from the later Linux-generated inventory. Regression tests validate the regenerated content without requiring a clean Git diff.

## Railway question submissions

The [railway question issue form](https://github.com/g497813927/community-seasons/issues/new?template=rail-question.yml) lets contributors submit a complete bilingual question or correction without editing the bank. The separate [Check rail question workflow](../.github/workflows/rail-question.yml) runs when issues are opened, edited or reopened, and skips unrelated issues. It becomes active after merging into the default branch and runs the checker from that trusted branch.

The checker validates required form fields, lowercase hyphen-separated IDs and topics, both translations, three choices with individual explanations, and a correct option from 1–3. New IDs must be unused; corrections must match an existing ID. It reuses the bank validator to check duplicate prompts and choices, answer indexes, and text limits: prompts 180/90 characters, labels 72/36 and explanations 240/120, in English/Simplified Chinese respectively.

The workflow writes an Actions summary and creates or updates only its own marked GitHub Actions bot feedback comment. Contributors can correct errors by editing the issue body while keeping the field headings. Passing means the structure is valid, not that the answer, translation or source has been approved. Optional notes and references remain for human review; no issue is automatically imported, committed or deployed. Maintainers follow the [question-bank guide](../src/QUESTION_BANK.md) to review and integrate accepted content, synchronize generated data, run regressions and build.

To validate a saved issue body offline from the repository root:

```sh
node scripts/check-rail-question.mjs --body /path/to/issue.md
```

The issue checker needs no dependency installation. Its parser regressions also run in `npm test` and in Build and QA before question generation.

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

Build and QA grants only `contents: read`, does not persist checkout credentials, and uses the ordinary `pull_request` event. The separate trusted `workflow_run` preparation job grants read access to contents, Actions and pull requests; its publishing job adds only `issues: write` to `contents: read` for the automatic token. The railway issue workflow uses `contents: read` and `issues: write` to check submissions and publish feedback from the trusted default branch. These workflows do not deploy, publish Toy previews or change passwords. Release work remains a separate authorized step in the [release guide](RELEASE.md). Repository branch-protection settings are not changed by these workflows; a maintainer can choose **Compile and test** as a required check after its first run.
