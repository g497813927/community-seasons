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
