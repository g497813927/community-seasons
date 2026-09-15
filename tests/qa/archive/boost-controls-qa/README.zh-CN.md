# 跑酷中道具按钮的 QA

[English](README.md) | [简体中文](README.zh-CN.md)

此夹具在专用本地源中加载真实游戏，在全新的浏览器上下文里设置测试购买状态，禁用 Toy 访问，并冻结跑酷时钟，以进行确定性的界面检查。启动时要求使用 `http://127.0.0.1:3030`，并在重置测试进度前将游戏存档映射到 `qa-archive-boost-controls:` 命名空间，保留玩家及其他应用的数据。不得部署此夹具，也不得让它访问玩家存档。

在仓库根目录启动夹具服务器，再在另一个终端运行检查：

```sh
npx vite tests/qa/archive/boost-controls-qa --config tests/qa/archive/boost-controls-qa/vite.config.ts
node tests/qa/archive/boost-controls-qa/check.mjs
```

如果没有安装 Playwright 浏览器，可将 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 设为已安装的 Chrome/Chromium 可执行文件路径。`QA_QUICK=1` 仅检查最窄手机视口。完整套件覆盖英文、简体中文、两种手机尺寸、桌面，以及正常和 200% 计算字号。检查内容包括开局使用时限、持续可用的触控按钮、道具消耗、激活/用尽状态、避免误触拖动或双击、键盘快捷键、暂停、铁路限制、永久技能、触控目标大小、裁剪和重叠。

截图和 `results.json` 由 Git 忽略。结果包含源码哈希，属于浏览器模拟，不能视为手机真机性能结论。
