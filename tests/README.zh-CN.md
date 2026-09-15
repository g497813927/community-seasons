# 测试与 QA

[English](README.md) | [简体中文](README.zh-CN.md)

使用 Node.js 24，在仓库根目录执行命令。各套件都加载 `src/` 下的当前游戏源码；编译后的测试模块和保存的报告属于生成产物，不是另一份游戏源码。

## 选择测试套件

| 目录 | 用途 | 命令 |
| --- | --- | --- |
| `unit/` | 引擎、渲染、布局、题库、许可及生产构建边界的确定性回归测试 | `npm test` |
| `fuzz/` | 有限轮次运行器、带种子的引擎/经济测试、渲染检查、终端面板及可选 Python/shell 启动器 | `npm run test:fuzz` |
| `property/` | Fast-check 玩法/存档属性测试及经过类型检查的生成器 | `npm run test:types`；通过模糊测试运行器选择属性套件 |
| `helpers/` | 将当前 TypeScript 游戏模块编译为 Node 测试使用的共享模块 | 由测试套件加载 |
| `qa/` | 独立的网页/Android/iOS 预览、浏览器检查、设备检查及归档场景 | 参见 [QA 框架指南](qa/README.zh-CN.md) |

确定性测试运行器按文件名排序，随机测试由模糊测试运行器管理。六个模糊测试套件名称保持不变：`engine`、`economy`、`engine-properties`、`save-properties`、`typed-generators` 和 `renderer`；种子设置及重放控制也保持不变。

## 执行检查

```sh
npm run setup
npm run build
npm test
npm run test:types
node tests/fuzz/run.mjs quick --rounds 1 --seed 20260914 --no-tui
```

使用 `--suite engine-properties` 或其他套件名称可缩小有限测试的范围。可选 Python 入口为 `python3 tests/fuzz/fuzz_game.py`，shell 入口为 `sh tests/fuzz/run.sh`。两者均转发相同的运行器选项，并将汇总结果写入仓库根目录下。

运行浏览器 QA 前，先构建独立预览：

```sh
npm run qa:build
npm run qa:test
npm run qa:all
```

浏览器引擎的安装方法见 [QA 框架指南](qa/README.zh-CN.md)。浏览器模拟不能证明真机性能；设备检查需要已连接、已解锁的设备，以及明确选定的 QA 预览。QA 存档须与玩家及 Toy 云存档保持隔离。

## 保存失败证据

模糊测试的汇总状态和当前源码哈希保存在 `results/summary.json`，各套件的日志为 `results/<suite>.log`。首次失败还会将日志和摘要保存在 `results/failure/`。详细轨迹及反例保留原文件名，放在对应套件旁：

- `tests/fuzz/engine-fuzz-failures-*/` 和 `tests/fuzz/store-economy-fuzz-failure.json`
- `tests/property/*-failure-*.json`
- `tests/fuzz/renderer-fuzz/repro.json` 和 `results.json`

重新运行前，请一并保存种子、收缩路径、源码哈希和依赖锁文件。以前保存的轨迹无需移动：将现有重放选项（如 `ENGINE_FUZZ_REPLAY`）指向文件的实际位置即可。生成的缓存、报告及浏览器证据由 Git 忽略。`snapshot.json` 仍是历史导入基线。

详细流程参见 [测试与 QA 指南](../docs/QA.zh-CN.md)、[模糊测试与重放指南](../docs/FUZZING.zh-CN.md)及 [类型生成器指南](property/typed-arbitraries.zh-CN.md)。
