# Reusable license generator

[English](LICENSE_GENERATOR.md) | [简体中文](LICENSE_GENERATOR.zh-CN.md)

`licenses.mjs` uses only built-in Node.js modules. It collects actual LICENSE, NOTICE, COPYRIGHT and nested third-party notices from the installed versions recorded in an npm version-3 lockfile. It preserves their text, deduplicates package versions, and writes:

- `open-source-licenses.json`: structured data for a searchable licenses panel.
- `THIRD-PARTY-NOTICES.txt`: the same original notices in a distributable text file.

## In this game

From the repository’s `src/` directory:

```sh
npm ci
npm run licenses:generate
npm run licenses:check
```

`npm run build` regenerates notices automatically, then checks them before bundling. The panel has no hyperlinks. Keep the generated files with the rest of the static build when distributing it.

CI checks the committed notices against the lockfile before building. Dependabot-originated PR events in the same repository targeting `main` on `dependabot/**` branches first run the tiny `Dependabot license refresh intake` workflow, with no checkout, dependencies or credentials. Their ordinary PR `Compile and test` job is skipped. A successful intake starts the trusted `Refresh Dependabot license notices` workflow, which refreshes stale notices and atomically commits both public files as `github-actions[bot]` before dispatching full `Build and QA`.

The refresher verifies the source workflow and its attempt, the original Dependabot event actor, the Dependabot PR author, repository, branch, open state and target. Notice generation additionally requires a changed game lockfile and a complete diff containing only supported dependency manifests, lockfiles and notice files. Other PRs retain their normal CI. Trusted default-branch tools install exact locked packages with dependency scripts disabled and no credentials; only a separate publisher has contents write access. It never force-pushes or merges. Missing original license text or invalid metadata requires manual correction. When updating dependencies locally, regenerate and commit both public notice files as usual.

An isolated dispatcher runs after generation/publication, including when notices are already current, the update does not qualify for regeneration (for example GitHub Actions or QA-only dependencies), or generation fails. It validates the current PR and the actual Git branch ref, so a lagging PR API head after a notice commit does not suppress CI. If the final checks observe an unrelated newer head or a closed PR, the stale intake skips dispatch; the newer update needs its own intake. GitHub dispatches by branch rather than by an atomic expected SHA, so a push between the final ref check and dispatch can still select the newer head. Check the resulting run SHA when diagnosing concurrent updates. Full CI still enforces the committed-notice check, so failed regeneration cannot silently pass.

The workflow uses the built-in `GITHUB_TOKEN`; no personal token or extra secret is needed. GitHub can require approval for PR runs triggered by this token, so the refresher uses an explicit workflow dispatch instead of relying on the push event. See [GitHub's workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). These workflows must first be merged into `main`. Existing Dependabot branches need to be updated/rebased onto that version so their PR event runs the new intake; rerunning an old `Build and QA` run no longer starts the refresher. Repository rules must allow the GitHub Actions bot to update the Dependabot branch.

Generated commits include `[dependabot skip]` so [Dependabot can replace them during rebases](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/manage-dependabot-prs); the next dependency intake refreshes notices again. This marker does not skip CI. If publication succeeds but dispatch fails, use **Re-run failed jobs** on the refresh workflow. The dispatcher verifies the generated commit's author, parent, marker, notice-only changes and valid notice contents, then retries CI without creating a duplicate commit.

## In another npm project

Requires Node.js 22.13+ and installed dependencies, including development dependencies (`npm ci --include=dev`). Run the existing script with an explicit project root:

```sh
node /path/to/licenses.mjs --root "/path/to/another project" --write
node /path/to/licenses.mjs --root "/path/to/another project" --check
```

Alternatively, copy `licenses.mjs` and its neighboring `license-supplements/` folder into the new project's `scripts/` directory. No package installation is needed for the generator itself.

Without `--root`, the project root is the parent directory of the script's folder. A relative `--root` resolves from your current working directory. Output defaults to the project's `public/` directory. Set a different folder with `--out-dir`, relative to the project root or absolute:

```sh
node scripts/licenses.mjs --write --out-dir "artifacts/open source"
node scripts/licenses.mjs --check --out-dir "artifacts/open source"
node scripts/licenses.mjs --help
```

`--check` is the default and never writes. It exits nonzero if generated files are absent or stale, making it suitable for CI. `--write` replaces only the two named output files. A failed collection leaves the previous output intact. Both commands work offline.

## Coverage and missing notices

This inventories installed direct, transitive and build dependencies, not just modules included in the browser bundle. Uninstalled optional platform packages are reported separately. It requires npm lockfile version 3 and does not support workspace links, pnpm or Yarn lockfiles. External services and separately installed tools are outside its scope.

Missing mandatory packages, conflicting versions/licenses, missing original license text, and unrecognized license declarations fail validation. Check the package's original release and supply its authentic notices when needed; do not replace them with guessed license templates.

Rolldown npm archives can omit native-package license files and referenced third-party notices. Verified upstream originals are retained in version-specific directories under `scripts/license-supplements/`, with source URLs in the generated notices and pinned SHA-256 checks in `scripts/licenses.mjs`. Check the target project's `package-lock.json` for the installed version and the generator for supported supplement versions. The generator first checks the target project's `scripts/license-supplements/`, then the folder beside itself. Copy that folder with the script to retain these verified originals. Review new upstream notices and keep earlier verified directories when adding a new release; do not substitute generic license templates.

Some Linux installs also include the optional WASI helpers `@napi-rs/wasm-runtime@1.2.3` and `@tybys/wasm-util@0.10.3`, whose npm archives omit license text. Their version-specific supplements preserve upstream MIT notices, check repository identity and SHA-256, and retain immutable source URLs. The NAPI-RS notice comes from its npm `gitHead` commit `70c149321ca4e361f6726349cf9b2258467fb24f`. The wasm-util notice comes from the maintainer's `add LICENSE` commit `a16b188d44ae43cc91edb71996ba2b43ff0996d9`, where `package.json` still identifies version 0.10.3; the earlier npm `gitHead` has no LICENSE. These are original upstream texts, not generated templates. New versions require a separate review.
