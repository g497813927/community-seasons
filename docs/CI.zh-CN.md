# 持续集成

[English](CI.md) | [简体中文](CI.zh-CN.md)

[Build and QA 工作流](../.github/workflows/ci.yml) 会检查拉取请求、推送到 `main` 的提交，以及从 GitHub Actions 页面手动触发的运行。其 **Compile and test** 任务使用 Ubuntu 24.04 和 Node.js 24.14.1，限时 20 分钟。同一拉取请求或分支产生新运行时，会取消尚未完成的旧运行。

## 检查内容

1. `npm run setup` 按仓库根目录和游戏目录的锁文件安装精确版本依赖。npm 下载缓存同时使用这两个锁文件作为缓存依据。
2. `npm run build`、`npm test` 和 `npm run test:types` 编译生产游戏，并运行确定性回归测试与属性测试生成器的类型检查。
3. `node run.mjs quick --rounds 1 --seed 20260914 --no-tui` 执行一轮可复现、有明确上限的模糊测试，并记录当前源码哈希。
4. `npm run qa:build` 和 `npm run qa:test` 构建并检查通用隔离 QA 预览及设备检查工具。
5. 构建两个已归档的手机预览，再执行小车、探针和套件测试。归档后的工具仍可针对当前游戏源码运行。
6. Playwright 安装 Chromium、WebKit 及其 Linux 系统依赖。`npm run qa:all` 运行六种冒烟测试：Web、Android 模拟和 iOS 模拟，每种均覆盖英文与简体中文。

浏览器检查会创建独立的本地夹具服务器和全新浏览器上下文，验证启动、许可面板、操作、暂停/继续、存档隔离以及外部请求拦截。Android 和 iOS 项目属于浏览器模拟；工作流通过不代表已验证真机性能或原生 Safari 行为。连接真机后的检查方式见 [QA 指南](QA.zh-CN.md)。

生产构建会在编译前重新生成题库数据和依赖许可声明。不同操作系统安装的可选包可能不同，因此 Linux 执行器生成的声明可能与 macOS 安装结果不同。CI 验证内容和生成结果是否最新，但不要求生成后 Git 差异为空。

## 排查失败

在 GitHub Actions 中打开失败步骤。命令也会将日志写入 `results/ci/`；Bash 的 `pipefail` 会确保通过 `tee` 保存输出时仍能正确报告失败。

步骤失败时，`qa-failure-<运行 ID>-<重试次数>` 产物会保留已有日志、模糊测试报告、源码哈希、浏览器截图和 QA 结果，保存期限为七天。上传时排除设备报告目录及隐藏文件。CI 不生成真机报告，也不读取本地预览配置、密码或 Toy 凭据。

本地复现时，使用 Node.js 24.14.1 并先执行 `npm run setup`，再运行失败的命令。浏览器检查需要先执行：

```sh
npx --no-install playwright install chromium webkit
npm run qa:build
npm run qa:all
```

在 Linux 上，为浏览器安装命令添加 `--with-deps`，以安装所需系统库。重新运行失败的模糊测试前，应保留原始随机种子、收缩路径和源码哈希；详见[模糊测试指南](FUZZING.zh-CN.md)。

## 维护工作流

官方 `actions/checkout`、`actions/setup-node` 和 `actions/upload-artifact` 均固定为完整提交哈希，旁边注明发行版本。更新固定版本前，先核实上游发行版及对应提交。Node 版本应与支持的本地工具保持一致，依赖安装应继续使用锁文件。

工作流仅授予 `contents: read` 权限，不保留检出凭据，使用普通 `pull_request` 事件。它不会部署、发布 Toy 预览、更改密码或运行具有额外权限的拉取请求事件。发布仍是[发布指南](RELEASE.zh-CN.md)中需要单独授权的步骤。此工作流不会修改仓库的分支保护设置；首次运行后，维护者可以将 **Compile and test** 设为必需检查。
