# 经过类型检查的 fast-check 工厂

[English](typed-arbitraries.md) | [简体中文](typed-arbitraries.zh-CN.md)

`typed-arbitraries.ts` 是一个小型**类型化工厂**，不使用 TypeScript 反射或 AST 生成器。它通过 `import type` 导入真实游戏的 `Progress`、`SaveSnapshot`、道具/技能/场景和动作类型。完整属性映射使用 `satisfies Fields<T>`，导出的有效值工厂使用 `satisfies fc.Arbitrary<T>`；缺失必需字段或字段类型不兼容会导致编译失败。

有效进度工厂还维护 TypeScript 无法表达的约束：传送道具最多一个且有匹配的目的地；装备的技能必须已解锁；传送道具等级固定为一。无效值工厂返回 `unknown` 并提供明确的变更元数据，不会把损坏输入错误标记为有效存档。结构化命令工厂保留判别字段，区分有效命令和刻意构造的无效值。

在仓库根目录只运行生成器类型检查：

```sh
node node_modules/typescript/bin/tsc -p work/property-tests/typed-arbitraries.tsconfig.json
```

运行小规模属性演示（生成用例前也会执行类型检查）：

```sh
node --test work/property-tests/typed-arbitraries.test.mjs
```

默认四个属性各运行 1,000 个用例。`FC_TYPED_RUNS`、`FC_TYPED_SEED` 和 `FC_TYPED_PATH` 可调整有界用例数或复现参数。失败时会将种子、最小化反例和路径写入 `typed-arbitraries-failure-*.json`。有效存档属性调用生产代码中的真实云存档编解码器；无效存档属性检查严格规范化。命令演示验证生成器契约，不能替代引擎状态机测试。

依赖仅为已有的 TypeScript 和 fast-check 开发工具。生成的运行时模块位于 `typed-arbitraries-compiled/`。不会使用生产文件、真实存档、云端请求或游戏调试钩子。

在仓库根目录执行 `npm run test:types` 可运行同一类型检查。辅助函数和测试导入 `outputs/community-seasons/` 中的当前游戏源码，不需要同步独立的冻结副本。
