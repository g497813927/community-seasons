# Community Seasons / 四季共建

[English](README.md) | [简体中文](README.zh-CN.md)

一款使用 React、TypeScript 和 Vite 开发的双语学习跑酷游戏，带你穿越四季社区。支持英语和简体中文，可通过键盘/WASD 或触屏滑动操作。独立运行时，游玩无需服务器账号、API 密钥或数据库。

## 快速开始

安装 **Node.js 24**（版本见 [`.nvmrc`](.nvmrc)），然后运行：

```sh
git clone https://github.com/g497813927/community-seasons.git
cd community-seasons
npm run setup
npm run dev -- --port 3001
```

打开 [http://127.0.0.1:3001](http://127.0.0.1:3001)。如果已经克隆了仓库，请在仓库根目录从 `npm run setup` 开始执行。安装命令会为 QA 工作区和游戏安装锁文件中指定的精确依赖版本。

下文所有命令均在仓库根目录执行。游戏代码位于 `src/`，所有测试和 QA 测试页面都直接使用这份源码。

操作方式、存档和游戏规则请参阅[游戏说明](src/README.zh-CN.md)和[玩法指南](src/GAMEPLAY.zh-CN.md)。

## 测试与构建

```sh
npm test                # 确定性回归测试
npm run test:types      # 属性测试生成器的类型检查
npm run test:fuzz       # 执行一轮有限的快速模糊测试
npm run build           # 校验并构建正式版游戏
```

构建过程会同步题库、重新生成第三方许可声明、检查类型，并将产物写入 `src/dist/`。使用以下命令在本地预览构建结果：

```sh
npm --prefix src run preview -- --port 4173
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。只有 `src/dist/` 是正式发布产物；QA 测试页面、调试控制和 QA URL 参数开关不得进入发布版本。

需要可复现的模糊测试，或执行一轮完整测试时，可运行：

```sh
node run.mjs quick --seed 3231321585
node run.mjs full
```

浏览器与真机检查请参阅 [QA 指南](docs/QA.zh-CN.md)，测试套件选项及失败重放请参阅[模糊测试指南](docs/FUZZING.zh-CN.md)。浏览器 QA 使用独立的测试服务器和隔离存档。手机 QA 需要已连接且解锁的设备，并明确选定测试预览。仅在使用可选的 `fuzz_game.py` 启动器时才需要 Python 3.8+。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/` | 游戏源码、翻译、题库、资源和构建配置 |
| `work/community-tests/` | 引擎、渲染、布局、题库、许可和正式版本边界的确定性回归测试 |
| `work/property-tests/` | 使用生成数据测试玩法及本地/云端存档 |
| `work/renderer-fuzz.mjs` | 随机画布和场景检查 |
| `qa/` | 通用网页/Android/iOS 预览、浏览器检查、设备检查与历史场景 |
| `run.mjs`、`fuzz_game.py`、`terminal-dashboard.mjs` | 模糊测试运行器、可选 Python 启动器和终端仪表盘 |
| `docs/` | QA、模糊测试、验证记录和发布说明 |
| `snapshot.json` | 用于复现的历史导入基线；每次测试都会记录当前源码的哈希值 |

`src/` 保存游戏代码，`work/` 保存引擎和属性测试，`qa/` 保存浏览器与设备 QA。它们都是需要维护的源码目录。构建产物、已安装的依赖和 QA 结果均由 Git 忽略。

## 修改与维护

修改行为前，请阅读 [维护约定](AGENTS.zh-CN.md)、[QA 指南](docs/QA.zh-CN.md)和游戏文档。保留两种语言、键盘和触屏操作、无障碍支持及大字号布局。QA 存档的命名空间必须与玩家存档和 Toy 云存档隔离。

- **题库**：编辑 [`rail-questions.json`](src/lib/game/rail-questions.json)，然后运行 `npm --prefix src run questions:sync`。开发启动和构建也会自动同步。遵循[题库指南](src/QUESTION_BANK.zh-CN.md)，保留跨重试和重新洗牌的近期题目防重复机制。
- **依赖**：锁定依赖版本，更新后运行 `npm --prefix src run licenses:generate`。游戏内的许可声明须直接展示原文，不包含超链接；详见[许可生成器指南](src/scripts/LICENSE_GENERATOR.zh-CN.md)。
- **测试失败**：重新运行前，将失败日志、随机种子、收缩路径和源码哈希值一并保存。模糊测试使用当前源码，压力测试期间不要修改源码。
- **发布**：遵循[发布指南](docs/RELEASE.zh-CN.md)。部署和 GitHub 推送均需要授权。现有 Toy 作品使用密码访问，仅更新内容时必须保留原密码，且不得提交凭据。

游戏自身源码采用 [MIT 许可证](LICENSE)。第三方依赖仍遵循各自的许可证，其许可声明单独提供。
