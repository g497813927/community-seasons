# Dependency maintenance

[English](DEPENDENCIES.md) | [简体中文](DEPENDENCIES.zh-CN.md)

The [Dependabot configuration](../.github/dependabot.yml) requests version checks every Monday at 09:00 in `America/New_York`, including daylight-saving changes. It becomes active after merging into the default branch.

| Ecosystem | Manifests checked | Open version PR limit |
| --- | --- | --- |
| npm | Root workspace, `src/`, `qa/archive/phone-cart-fix-qa/` | 5 |
| GitHub Actions | `.github/workflows/` and root action manifests | 3 |

An npm PR updates one dependency across matching directories when constraints are compatible. Unrelated packages stay in separate PRs; incompatible constraints may require separate PRs. The `increase` strategy updates the existing version requirement; keep this repository's exact pins when reviewing. GitHub Actions updates remain separate. See the [GitHub options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

## Security updates

Keep **Dependabot alerts** and **Dependabot security updates** enabled in repository security settings. Security updates respond to vulnerability alerts rather than waiting for Monday. When a compatible fix exists, Dependabot proposes a patched version; otherwise inspect the alert's explanation and handle it manually. The weekly PR limits do not suppress security PRs. See [how security updates work](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates).

This configuration opens reviewable PRs. It does not merge, deploy, or change Toy access settings automatically.

## Reviewing a dependency PR

Use the PR branch and Node.js 24 from the repository root [`.nvmrc`](../.nvmrc). Run this checklist from the repository root; `src/.nvmrc` is a separate, older game-directory pin. Check release notes and compatibility, then install the locked packages and validate:

```sh
npm run setup
npm ci --prefix qa/archive/phone-cart-fix-qa --ignore-scripts
npm --prefix qa/archive/phone-cart-fix-qa run build
npm --prefix src run licenses:generate
npm run build
npm test
npm run test:types
npm run test:fuzz
npm run qa:build
npm run qa:test
```

Commit regenerated game license notices with the dependency update. Do not replace original notices with links. Every dependency update rebuilds the isolated preview before its framework tests. For browser, React, Vite, or rendering changes, also run the relevant [web/Android/iOS QA](QA.md). Refresh Playwright's installed browsers when its pinned version changes.

For each affected lockfile, run the corresponding audit and inspect any remaining findings:

```sh
npm audit
npm audit --prefix src
npm audit --prefix qa/archive/phone-cart-fix-qa
```

Resolve failures before requesting review and merging. A successful dependency update still needs the normal [release process](RELEASE.md) before publication.
