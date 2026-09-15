# Community Seasons — 模糊测试

[English](FUZZING.md) | [简体中文](FUZZING.zh-CN.md)

这些测试直接运行本仓库中的当前游戏源码，不需要 Toy/Vercel 账号、浏览器、手机、AI 服务或 API 密钥，也不会发布游戏。

## 开始运行

安装 **Node.js 22.13 或更高版本**（推荐 Node 24，需包含 npm），在仓库根目录打开终端并运行：

```sh
node tests/fuzz/run.mjs quick
```

如果根目录依赖缺失或与固定版本不一致，运行器会执行 `npm ci --ignore-scripts`。安装范围包含测试工具（**fast-check 4.9.0**、**TypeScript 5.9.3**，以及 fast-check 锁定的依赖 **pure-rand 8.4.2**）和根目录的浏览器测试工具。安装后，模糊测试可离线运行。首次下载耗时不计入下文的测试时间。要安装完整工作区，包括构建游戏所需的独立依赖，请运行 `npm run setup`。

运行一次有界的完整测试：

```sh
node tests/fuzz/run.mjs full
```

## Python 启动器（可选）

安装 **Python 3.8+** 后，可用仅依赖标准库的启动器运行同一套测试：

```sh
python3 tests/fuzz/fuzz_game.py quick
python3 tests/fuzz/fuzz_game.py full --forever
python3 tests/fuzz/fuzz_game.py quick --forever --duration 60 --seed 12345
```

实际执行 TypeScript/JavaScript 游戏测试仍需要 Node.js/npm，无需安装 pip 包。Python 负责协调进程，fast-check 负责生成属性测试用例，不依赖 AFL。Node 运行器的选项会透传；可用 `--node PATH` 指定 Node 可执行文件。`--duration SECONDS` 设置总运行时间上限，不会把单次运行自动改为循环；需要限时压力测试时，必须明确添加 `--forever`。

启动器会把停止信号转发给 Node，并写入 `results/python-summary.json`，区分测试失败、手动中断和达到指定时间上限。达到时间上限不代表尚未完成的轮次通过。Node 日志和复现文件仍会保留。

## 终端实时面板

交互式终端自动显示当前轮次、已完成的**通过/失败轮数**、当前套件、耗时、主种子、当前轮种子和日志位置。长时间测试时计时器持续更新。无限运行显示 `Round N / ∞`。这些数字统计的是轮次，不是生成的单个测试用例。

```sh
node tests/fuzz/run.mjs full --forever --tui
python3 tests/fuzz/fuzz_game.py quick --rounds 2 --tui
node tests/fuzz/run.mjs quick --no-tui
```

中断、超时和源码变更有独立计数，不计为通过或失败。Ctrl+C 会恢复终端并保存摘要。重定向输出、`TERM=dumb`，或终端小于 44 列/14 行时，即使指定 `--tui` 也只输出普通日志；运行中缩小到该尺寸以下也会切换为普通日志。面板每秒刷新四次，不影响测试执行。

## 连续压力测试（可选）

以下命令会一直运行，直到首次失败或按下 **Ctrl+C**：

```sh
node tests/fuzz/run.mjs full --forever
```

需要较短轮次时使用 `node tests/fuzz/run.mjs quick --forever`。默认不会启用连续模式。要按固定种子执行指定轮数：

```sh
node tests/fuzz/run.mjs quick --rounds 2 --seed 12345
```

每轮会为**所有**测试类别生成新的确定性种子，包括引擎、经济系统、渲染器、两套属性测试和类型化生成器。主种子会输出并记录；`--seed` 可显式指定它。各轮派生种子和各类别的准确设置记录在 `results/summary.json`。每个套件前后都会校验游戏源码哈希。测试期间修改源码会以 `inputs-changed` 停止，不会记为游戏故障；完成修改后重新启动即可。要单独重跑某轮，将该轮记录的种子用作 `--seed`，并保持工作量选项一致。

首个失败套件会阻止后续套件和轮次，但当前 Node 测试套件可能继续完成其剩余属性。该套件的输出和种子设置保存在 `results/failure/`；生成的反例、收缩路径和确定性轨迹保存在 `tests/fuzz/` 和 `tests/property/` 下。Ctrl+C 会停止子进程并保存 `interrupted` 摘要（退出码 130），不会报告成游戏错误。只有完整成功的轮次计为通过。`roundCounts` 分别统计通过、失败、中断、超时和输入变更；`completedRounds` 仍表示通过的轮数。

成功日志每轮覆盖，每个套件最多保留 1 MiB。运行器只保留最新一轮及累计计数，长时间成功运行不会不断积累结果文件。开始下一次排查前，应把需要的失败文件另行保存。每次会话开始前检查依赖，仅在需要时重新安装。

精确复现环境变量不能与 `--forever`、`--rounds` 或 `--seed` 同时使用；请先清除它们。已收缩用例请使用下文的单项复现命令。

开发用 Mac 上，quick 模式约需 10–20 秒，full 模式约需两分钟；较慢设备可能耗时更长。渲染器默认有 170 秒上限。如果日志明确提示达到时间预算，可提高限制：

```sh
node tests/fuzz/run.mjs full --budget-seconds 300
```

macOS/Linux 还支持 `./tests/fuzz/run.sh quick` 和 `./tests/fuzz/run.sh full`。`npm run test:fuzz` 运行 quick 模糊测试；`npm test` 运行独立的确定性回归测试。有界完整模糊测试使用 `node tests/fuzz/run.mjs full`；`npm run test:stress` 会明确启动无界的 full 运行。

## 测试范围

| 套件 | 覆盖内容 | Quick | Full |
| --- | --- | --- | --- |
| `engine` | 动作打断、边界、暂停、重复输入、加速到期、岔路辅助及障碍保护、两侧岔路、铁路答题与返回、站台接近时机、季节过渡、固定场景几何 | 768 个种子的回归矩阵、64 次自然站台接近，以及岔路/铁路/场景专项回归 | 相同矩阵 |
| `economy` | 购买、余额、升级、仅持有一个传送道具、只结算一次的奖励、技能充能、本地/云端序列化、异常存档 | 32 个种子 × 400 个动作，另含固定边界检查 | 1,024 个种子 × 400 个动作，另含固定检查 |
| `engine-properties` | fast-check 随机数值边界、无效动作/跑道、异常等级与输入序列，以及反例收缩 | 每个属性 200 个用例 | 原始 21,000 个用例的矩阵 |
| `save-properties` | fast-check 任意/损坏/旧版存档、规范化、云存档封装与数值保留 | 每个属性 200 个用例 | 原始 50,000 个用例的矩阵 |
| `typed-generators` | 使用真实游戏接口并经过类型检查的工厂；有效存档字段关联、刻意构造的无效字段、结构化命令 | 每个属性 200 个用例 | 4,000 个用例 |
| `renderer` | 四季、中英文、八种视口、岔路、铁路结果/坠落/返回、加速、暂停、目的地预览 | 16 个种子 | 224 个种子，约 24,000 帧 |

`engine` 除岔路/镜头检查外还运行固定几何回归：秋冬屋顶可见性使用独立射线相交计算；夏季灯柱支撑结构覆盖直路、弯曲岔路、铁路平台和目的地预览。

随机 `renderer` 套件通过 Canvas2D 适配器校验有限数值几何、裁剪与绘图参数、透明度恢复，以及面数/缓存数量上限。它**不能**测量原生 Safari/GPU 性能，也不能替代目视检查和真机测试。通过仅表示这些检查未发现失败，不代表游戏不存在任何缺陷。

## 调整测试工作量

```sh
node tests/fuzz/run.mjs quick --suite renderer --renderer-seeds 8
node tests/fuzz/run.mjs full --renderer-seeds 64 --renderer-offset 224
node tests/fuzz/run.mjs quick --suite economy --store-seeds 100 --actions 600
node tests/fuzz/run.mjs full --suite save-properties --runs 1000
node tests/fuzz/run.mjs --help
```

`--suite` 可选 `all`、`engine`、`economy`、`renderer`、`engine-properties`、`save-properties` 或 `typed-generators`。`--runs` 覆盖所选 fast-check 属性的用例数。少于 16 个渲染器种子属于小规模结构冒烟检查，不要求覆盖所有季节和效果。quick 模式仍保留固定引擎回归矩阵，因为它只需数秒。

## 结果与复现

运行器在首个套件失败后停止，返回非零退出码。先查看 `results/summary.json` 和 `results/<suite>.log`。详细报告和失败轨迹放在 `tests/fuzz/` 和 `tests/property/` 下对应脚本旁。请一并保存失败种子、收缩路径、源码哈希和依赖锁文件。

首次安装依赖后，可在 macOS/Linux 使用以下命令复现单个用例：

```sh
# 保存的确定性引擎轨迹：替换为失败日志中给出的实际路径
ENGINE_FUZZ_REPLAY=tests/fuzz/engine-fuzz-failures-20260910/EXAMPLE.json node tests/fuzz/run.mjs quick --suite engine

# 经济系统动作序列
STORE_FUZZ_SEED=5349376 node tests/fuzz/run.mjs quick --suite economy

# 渲染器种子/场景：使用 tests/fuzz/renderer-fuzz/repro.json 中的值
RENDERER_FUZZ_SEED=4182 RENDERER_FUZZ_SCENARIO=fork--1 node tests/fuzz/run.mjs quick --suite renderer

# fast-check：使用失败报告中的准确属性名、种子和收缩路径
FC_PROPERTY=direct-malformed-level FC_SEED=123 FC_PATH='0:1' node tests/fuzz/run.mjs quick --suite engine-properties
FC_SAVE_CASE='PROPERTY_NAME_FROM_REPORT' FC_SAVE_SEED=123 FC_SAVE_PATH='0:1' node tests/fuzz/run.mjs quick --suite save-properties
```

示例路径是占位符，必须复制实际生成的复现参数；任意收缩路径无法定位同一用例。PowerShell 可先用 `$env:NAME = "value"` 设置同名变量，再执行 `node` 命令，之后移除变量。开始新的完整运行前请清除复现变量。

套件包含 `activateBoost` 的防御性等级规范化回归，同时覆盖异常直接调用和正常存档解码路径。引擎套件还检查加速期间的岔路辅助：渐进式默认左转、保留右转选择、基于真实进入姿态的最后时刻激活、到期、暂停，以及铁路答案仍由玩家选择。rush、head-start、portal 加速还会检查边缘障碍：不得启动或延长追逐/回弹；普通边缘行为和护盾行为应保持不变。

## 类型化生成器

`tests/property/typed-arbitraries.ts` 导入游戏的真实 TypeScript 接口。完整字段映射用 `satisfies` 检查，缺失字段或类型不兼容会导致编译失败。它使用 fast-check 收缩器生成一致的有效存档、带独立标签的无效变体和结构化命令。跨字段约束（例如最多一个传送道具且目的地匹配）会明确维护。

这是经过类型检查的工厂，不会在运行时反射并猜测任意接口的数据。导出辅助函数和示例见 [typed-arbitraries.zh-CN.md](../tests/property/typed-arbitraries.zh-CN.md)。

```sh
node tests/fuzz/run.mjs quick --suite typed-generators
npm run test:types
```

类型化属性失败时，会记录复现所需的准确 `FC_TYPED_SEED`、`FC_TYPED_PATH` 和 Node 测试名称过滤条件。首次安装依赖后，复制生成的命令即可复现。

## 源码与可复现性

`snapshot.json` 保存工作区导入时的历史 SHA-256 哈希；每次摘要还会记录当前哈希。游戏源码位于 `src/lib/game/`，`tests/` 中的套件导入当前源码。修改后与导入基线不同是正常现象。

请在启动测试会话前直接修改规范游戏源码，不需要同步任何独立的冻结副本。运行器会对基线文件列表及当前游戏 TypeScript/JSON 模块计算哈希，并在每个套件前后检查变更。复现收缩后的失败用例时，保持依赖版本锁定。

仓库也包含部署配置和隔离的浏览器/手机测试夹具；模糊测试不会运行或发布它们。测试输出、生成的 `.mjs` 模块、`.npm-cache` 和 `node_modules` 都在本地生成且由 Git 忽略。只有 `src/dist/` 是生产产物。夹具隔离要求见 [QA.zh-CN.md](QA.zh-CN.md)，发布约束见 [RELEASE.zh-CN.md](RELEASE.zh-CN.md)。
