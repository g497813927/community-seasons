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

`npm test` 运行确定性回归测试。`npm run test:types` 检查带类型约束的属性生成器，`npm run test:fuzz` 运行一轮有明确终点的快速测试，包括种子矩阵、属性测试和渲染器检查。所有测试均引用 `outputs/community-seasons/` 下的当前源码。

需要可复现且轮数有限的测试时，执行：

```sh
node run.mjs quick --rounds 2 --seed 3231321585 --no-tui
```

在 `results/summary.json` 中查看结果、源码哈希和每个测试套件的种子设置；套件输出位于 `results/<suite>.log`。失败报告和日志还会保存到 `results/failure/`。重新运行前，请一起保留失败种子、收缩路径、源码哈希和依赖锁文件。每次调用都会写入相同的结果路径，因此同一份检出目录中同时只能运行一个模糊测试会话。

工作量设置和失败用例的精确重放方法见 [FUZZING.zh-CN.md](FUZZING.zh-CN.md)。`snapshot.json` 是导入时的历史基线；运行器会记录当前源码哈希，并在测试过程中源码发生变化时停止。启动测试前应先完成源码修改。持续压力测试需要显式添加 `--forever`，仅在明确要求时运行。

## 维护 QA 运行器

| 文件 / 函数 | 职责 |
| --- | --- |
| `scripts/test.mjs` | 查找并排序 `work/community-tests/*.test.mjs` 中的确定性测试，排除模糊测试套件，然后调用 Node 测试运行器。 |
| `run.mjs`：`parseOptions`、`createBaseEnvironment`、`createRoundEnvironment` | 校验命令行选项，应用默认工作量，为每个套件推导可复现的种子。 |
| `run.mjs`：`runChild`、`ensureDependencies` | 按需安装锁定版本的依赖，管理子进程，限制日志大小并执行超时控制。 |
| `run.mjs`：`readSourceHashes`、`createReport`、`preserveFailure` | 记录被测源码，维护报告格式并保留失败产物。 |
| `run.mjs`：`runSuite`、`runRound`、`main` | 执行选定套件，遇到首个未成功结果时停止，并完成会话汇总。 |
| `terminal-dashboard.mjs` | 显示进度，不参与测试选择，也不改变执行行为。 |

重构时应保持套件顺序、种子推导常量、环境变量名和报告格式稳定。通过轮次、失败轮次、中断、运行时间上限和源码变化各有独立计数；未完成的工作不能计为通过。

## 浏览器布局检查

首次使用时安装浏览器：

```sh
npx playwright install chromium
```

在一个终端启动测试专用服务器，再在另一个终端运行对应测试。两个终端都从仓库根目录执行：

```sh
npm run qa:licenses:serve
npm run qa:licenses
```

```sh
npm run qa:android:serve
npm run qa:android
```

许可面板 QA 使用端口 3029；Android 大字体 QA 使用端口 3028。测试会将截图和 JSON 写入各自的测试目录。文字缩放是在 Chromium 中模拟的，并非原生 Android 硬件测试。许可套件检查延迟加载、原始声明、无超链接、焦点、暂停、重试和响应式布局。Android QA 检查结算/暂停布局和较大的数值。

本地测试页面可能清除**自身本地来源**中的存储；请使用它们的专用端口和干净的浏览器配置，不要使用玩家的生产站点来源。这些测试页面不是发布构建。

## 实体 iPhone / 小车 QA

`work/phone-cart-fix-qa/` 是专门检查小车流程的测试工具；`work/iphone-qa/` 保留扩展渲染与性能测试工具。它们的启动代码和 SDK 包装层会将测试状态与游戏存档隔离。使用 `npm run qa:phone:build` 构建小车测试工具，使用 `npm run qa:iphone:build` 构建扩展测试工具。两者的输出都不能作为生产版本上传。旧的字体/DPR 实验脚本未导入此仓库。

通过 Toy 测试时，获得授权后应上传独立的测试预览。在本地创建 `work/phone-cart-fix-qa/preview.json`，内容为 `{"preview_url":"THE_ACTUAL_TOY_PREVIEW_URL"}`。扩展测试工具使用 `work/iphone-qa/preview-20260910.json`。这些配置文件已被 Git 忽略，不含继承的预览地址或密码。

USB 脚本依赖单独配置的 Web Inspector/CDP 桥接服务，地址为 `http://127.0.0.1:9223`；仓库未附带该服务，也不会自动启动它。通过数据线连接 iPhone 并保持解锁，在普通 Safari 中打开明确选定的隔离测试预览。为使 Safari 计时可靠，需要在设备上真实点击 Start/Begin run。用户需要触摸页面时，请避免 Safari Remote Automation 会话，因为其测试弹窗会干扰操作。

运行 `node work/phone-cart-fix-qa/usb.mjs status` 查看选定预览。脚本会在执行操作前校验预览地址完全一致，且页面处于隔离的 QA 环境。启用测试前，先阅读脚本支持的命令。实体设备结果必须重新采集；历史设备标识、录屏和原始输出未导入此仓库。

人工检查应覆盖所有季节、转弯、加速结束、小车进站/答题/出站、答错坠落、分享面板打开/关闭、大字体、屏幕方向、暂停/继续和云存档冲突选择。不要仅为验证布局而写入真实云存档。
