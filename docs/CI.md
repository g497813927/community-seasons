# Continuous integration

[English](CI.md) | [简体中文](CI.zh-CN.md)

The [Build and QA workflow](../.github/workflows/ci.yml) checks pull requests, pushes to `main`, and manual runs from GitHub's Actions tab. Its **Compile and test** job uses Ubuntu 24.04 and Node.js 24.14.1, with a 20-minute limit. A new run cancels an older run for the same pull request or branch.

## What runs

1. `npm run setup` installs the exact root and game lockfiles. The npm download cache is keyed by both lockfiles.
2. `npm run build`, `npm test` and `npm run test:types` compile the production game and run deterministic regressions and property-generator type checks.
3. `node run.mjs quick --rounds 1 --seed 20260914 --no-tui` runs one reproducible, bounded fuzz round and records current source hashes.
4. `npm run qa:build` and `npm run qa:test` compile and test the general isolated QA preview and device-inspection helpers.
5. Both archived phone previews are built, then their cart, probe and suite tests run. Archiving a harness keeps it runnable against current game source.
6. Playwright installs Chromium, WebKit and their Linux system dependencies. `npm run qa:all` runs six smoke scenarios: Web, Android emulation and iOS emulation, each in English and Simplified Chinese.

Browser checks create their own local fixture server and fresh browser contexts. They verify startup, licenses, controls, pause/resume, storage isolation and blocked external requests. Android and iOS entries are browser simulations; a passing workflow does not establish physical-device performance or native Safari behavior. Follow the [QA guide](QA.md) for connected-device checks.

The production build regenerates question data and dependency notices before compiling. Optional packages vary by operating system, so generated notices from the Linux runner can differ from a macOS installation. CI validates their content and freshness without requiring a clean Git diff after generation.

## Investigating a failure

Open the failed step in GitHub Actions. Commands also write logs under `results/ci/`; Bash's `pipefail` preserves failures when output is captured with `tee`.

When a step fails, the `qa-failure-<run ID>-<attempt>` artifact retains available logs, fuzz reports, source hashes, browser screenshots and QA results for seven days. The upload excludes device-report directories and hidden files. CI does not create physical-device reports or read local preview configuration, passwords or Toy credentials.

Reproduce the failed command locally with Node.js 24.14.1 and `npm run setup`. For browser checks, first run:

```sh
npx --no-install playwright install chromium webkit
npm run qa:build
npm run qa:all
```

On Linux, add `--with-deps` to the browser-install command to install required system libraries. Preserve the original seed, shrink path and source hashes before rerunning fuzz failures; see [FUZZING.md](FUZZING.md).

## Maintaining the workflow

Official `actions/checkout`, `actions/setup-node` and `actions/upload-artifact` releases are pinned to full commit hashes, with their release versions alongside them. Verify the upstream release and its commit before updating a pin. Keep the Node version aligned with supported local tooling and keep dependency installation locked.

The workflow grants only `contents: read`, does not persist checkout credentials, and uses the ordinary `pull_request` event. It does not deploy, publish Toy previews, change passwords or run privileged pull-request events. Release work remains a separate authorized step in the [release guide](RELEASE.md). Repository branch-protection settings are not changed by this workflow; a maintainer can choose **Compile and test** as a required check after its first run.
