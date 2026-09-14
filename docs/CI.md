# Continuous integration

[English](CI.md) | [简体中文](CI.zh-CN.md)

The [Build and QA workflow](../.github/workflows/ci.yml) checks pull requests, pushes to `main`, and manual runs from GitHub's Actions tab. Its **Compile and test** job uses Ubuntu 24.04 and Node.js 24.14.1, with a 20-minute limit. A new run cancels an older run for the same pull request or branch.

## What runs

1. `npm run setup` installs root and game dependencies at the exact versions recorded in their lockfiles. The npm download cache is keyed by both lockfiles.
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

When the bounded quick-fuzz step fails, CI also uploads a small `fuzz-feedback-<run ID>-<attempt>` JSON artifact. The separate [feedback workflow](../.github/workflows/fuzz-feedback.yml) adds a **techzjc-bot** comment to the associated open PR with the suite, base and derived seeds, per-case failing seed and shrink path when recorded, a source-hash summary, a bounded replay command and the original run link. A setup/build failure without a fuzz failure does not create a fuzz comment. A PR whose head has changed since the failed run is skipped. Repeating the publisher updates only its own marked comment for that commit, run and attempt.

The feedback workflow becomes active after it is merged into the repository's default branch. It checks out that trusted default-branch commit, installs no dependencies, and never runs PR code. A read-only `GITHUB_TOKEN` verifies the workflow/run identity, failed step, associated PR head and repository IDs, then downloads at most 64 KiB of JSON from the matching run artifact. Fork PRs use GitHub's commit-to-PR association when the workflow payload omits them. Artifact paths are never extracted; free-form errors, supplied replay commands and counterexamples are never copied into comments.

The read-only preparation job passes only bounded, validated data to a separate publishing job through a job output. The publisher uses the **ci-comments** environment, runs only from `main`, and checks out the same trusted default-branch commit. The bot credential is supplied only to its final comment step as the process variable `PAT_COMMENTS`. That step verifies its account is `techzjc-bot`, lists comments and creates or updates only that account's matching comment. The token is absent from builds, fuzzing, artifact download/parsing and dependency installation; neither token nor API error bodies are logged. GitHub masks repository secrets in logs, but keeping the secret out of untrusted execution is the primary boundary.

Before enabling comments, complete this required migration in repository settings:

1. Create the `ci-comments` environment and restrict deployment branches to `main` only. Required reviewers can add a manual approval gate.
2. Save the bot credential as **CI_COMMENT_TOKEN in that environment only**. Do not create a repository secret with this name. The different name prevents the workflow from silently falling back to the older repository-level `PAT_COMMENTS` secret if the environment is not configured.
3. Delete the old repository-level `PAT_COMMENTS` secret after saving the environment credential. Leaving it in the repository still exposes it to other same-repository workflows, even though this publisher does not read it.

The publisher fails closed when its environment credential is missing. A GitHub Actions actor name alone is not treated as authorization; default-branch code, the protected environment and run/PR identity checks define the boundary.

The bot currently collaborates on another personal account's repository. GitHub's [fine-grained PAT limitations](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) prevent a fine-grained token from writing to that repository as an outside collaborator. If retaining this bot identity with a classic PAT on this public repository, use the minimum applicable `public_repo` scope and an expiry. This scope still grants more than comment access; workflow isolation does not narrow the token's underlying permissions. GitHub has no comment-only PAT permission. Where a fine-grained token is supported by the repository ownership, the [issue-comment API](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment) accepts repository `Issues: write`, without Contents, Actions or administration permissions. Only the token owner can change its scopes or replace it in GitHub settings; a saved Actions secret cannot be retrieved or narrowed by this workflow.

Reproduce the failed command locally with Node.js 24.14.1 and `npm run setup`. For browser checks, first run:

```sh
npx --no-install playwright install chromium webkit
npm run qa:build
npm run qa:all
```

On Linux, add `--with-deps` to the browser-install command to install required system libraries. Preserve the original seed, shrink path and source hashes before rerunning fuzz failures; see [FUZZING.md](FUZZING.md).

## Maintaining the workflow

Official `actions/checkout`, `actions/setup-node` and `actions/upload-artifact` releases are pinned to full commit hashes, with their release versions alongside them. Verify the upstream release and its commit before updating a pin. Keep the Node version aligned with supported local tooling and keep dependency installation locked.

Build and QA grants only `contents: read`, does not persist checkout credentials, and uses the ordinary `pull_request` event. The separate trusted `workflow_run` publisher grants its built-in token read access to contents, Actions and pull requests; only its final, environment-gated comment step receives the bot credential. Neither workflow deploys, publishes Toy previews or changes passwords. Release work remains a separate authorized step in the [release guide](RELEASE.md). Repository branch-protection settings are not changed by these workflows; a maintainer can choose **Compile and test** as a required check after its first run.
