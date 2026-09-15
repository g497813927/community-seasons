# QA 与测试指南

[English](QA.md) | [简体中文](QA.zh-CN.md)

## 自动化回归与模糊测试

使用 Node.js 24（见仓库根目录的 `.nvmrc`），在仓库根目录执行：

```sh
npm run setup
npm run build
npm test
npm run test:types
npm run test:fuzz
```

`npm test` 运行确定性回归测试。`npm run test:types` 检查带类型约束的属性生成器，`npm run test:fuzz` 运行一轮有明确终点的快速测试，包括种子矩阵、属性测试和渲染器检查。所有测试均引用 `src/` 下的当前源码。

需要可复现且轮数有限的测试时，执行：

```sh
node tests/fuzz/run.mjs quick --rounds 2 --seed 3231321585 --no-tui
```

在 `results/summary.json` 中查看结果、源码哈希和每个测试套件的种子设置；套件输出位于 `results/<suite>.log`。失败报告和日志还会保存到 `results/failure/`。重新运行前，请一起保留失败种子、收缩路径、源码哈希和依赖锁文件。每次调用都会写入相同的结果路径，因此同一份检出目录中同时只能运行一个模糊测试会话。

工作量设置和失败用例的精确重放方法见 [FUZZING.zh-CN.md](FUZZING.zh-CN.md)。`snapshot.json` 是导入时的历史基线；运行器会记录当前源码哈希，并在测试过程中源码发生变化时停止。启动测试前应先完成源码修改。持续压力测试需要显式添加 `--forever`，仅在明确要求时运行。

## 维护 QA 运行器

| 文件 / 部分 | 职责 |
| --- | --- |
| `tests/unit/run.mjs` | 查找并排序 `tests/unit/*.test.mjs` 中的确定性测试，排除模糊测试套件，然后调用 Node 测试运行器。 |
| `tests/fuzz/run.mjs`：命令行与工作量设置 | 校验命令行选项，应用默认工作量，为每个套件推导可复现的种子。 |
| `tests/fuzz/run.mjs`：依赖与进程管理 | 按需安装锁定版本的依赖，管理子进程，限制日志大小并执行超时控制。 |
| `tests/fuzz/run.mjs`：源码跟踪与报告 | 记录被测源码，维护报告格式并保留失败产物。 |
| `tests/fuzz/run.mjs`：套件与轮次执行 | 执行选定套件，遇到首个未成功结果时停止，并完成会话汇总。 |
| `tests/fuzz/terminal-dashboard.mjs` | 显示进度，不参与测试选择，也不改变执行行为。 |

重构时应保持套件顺序、种子推导常量、环境变量名和报告格式稳定。通过轮次、失败轮次、中断、运行时间上限和源码变化各有独立计数；未完成的工作不能计为通过。

## 网页、Android 与 iOS QA

当前浏览器与设备检查使用[跨平台 QA 框架](../tests/qa/README.zh-CN.md)：

```sh
npm run qa:build
npm run qa:test
npm run qa:all
npm run qa:preview
```

`qa:web`、`qa:android`、`qa:ios` 可单独运行浏览器组合。网页和 Android 使用 Chromium，iOS 使用 WebKit。手机组合属于模拟，不是真机性能测量。每组使用全新浏览器上下文、隔离存档、外部请求拦截，报告保存于 `results/qa/` 下带时间戳的目录。

浏览器游戏流程使用 Playwright 可控时钟，在真实输入事件之间按有限步长推进时间。暂停与继续的断言也会推进时钟，防止仅因时钟停止而误判暂停功能正常。Android 英文用例包含六秒主机延迟回归检查。因此浏览器计时和帧数据属于模拟结果；性能观察应使用正常时钟的交互预览及明确选定的真机检查。

真机检查时，在普通 Safari/Chrome 中打开指定的构建预览，通过 `qa:device` 明确指定完整地址与检查器目标。设备指南涵盖 Android USB 转发及 iOS Web Inspector 桥接。测量要求设备解锁、页面可见且聚焦，并已真实触摸页面。通用预览在当前游戏加载前隔离存档，并禁用全部 Toy SDK/云访问；既可本地运行，也可使用已获授权的独立托管预览。

## 历史场景

原 `work/*-qa/` 目录已移到 [`tests/qa/archive/`](../tests/qa/archive/)，保留原专项场景与测试。重现旧问题时，可运行 `qa:archive:licenses`、`qa:archive:android`、`qa:archive:phone:build`、`qa:archive:iphone:build`；配套服务器命令及隔离要求见框架指南。

归档场景不得在玩家的生产来源上运行：部分会清空自身页面存储，带日期的 iPhone 云端场景使用独立测试键。预览配置、截图和原始设备报告仍由 Git 忽略。历史性能结果不代表当前真机验证。
