# Type-checked fast-check factories

[English](typed-arbitraries.md) | [简体中文](typed-arbitraries.zh-CN.md)

`typed-arbitraries.ts` is a small **typed factory**, not TypeScript reflection or an AST-based generator. It imports the real game `Progress`, `SaveSnapshot`, booster/skill/scene and movement types using `import type`. Exhaustive property maps use `satisfies Fields<T>` and exported valid factories use `satisfies fc.Arbitrary<T>`, so missing required fields and incompatible field types fail compilation.

Valid progress factories also preserve constraints that TypeScript cannot express: a portal has at most one item and a matching destination; the equipped skill is unlocked; portal level is fixed at one. Invalid factories return `unknown` with explicit mutation metadata, never falsely label damaged input as a valid save. Structured command factories retain a discriminant separating valid commands and deliberate invalid values.

Run just the generator typecheck from the workspace root:

```sh
node node_modules/typescript/bin/tsc -p work/property-tests/typed-arbitraries.tsconfig.json
```

Run the small property demonstration (also performs the typecheck before generating):

```sh
node --test work/property-tests/typed-arbitraries.test.mjs
```

Defaults: 1,000 cases each for four properties. `FC_TYPED_RUNS`, `FC_TYPED_SEED`, and `FC_TYPED_PATH` can change bounded run count/replay. Failures record seed, minimized counterexample and path in `typed-arbitraries-failure-*.json`. The valid-save property calls the actual production cloud encoder/decoder; invalid-save properties exercise strict normalization. Command demonstrations verify generator contracts; they do not replace the engine state-machine tests.

Dependencies are the existing TypeScript and fast-check development tools. Generated runtime modules stay in `typed-arbitraries-compiled/`. No production files, real saved data, cloud requests or game hooks are used.

From the repository root, `npm run test:types` runs the same typecheck. The helpers and tests import the current game source under `outputs/community-seasons/`; there is no separate frozen game snapshot to synchronize.
