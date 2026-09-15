# 持续集成

[English](CI.md) | [简体中文](CI.zh-CN.md)

[Build and QA 工作流](../.github/workflows/ci.yml) 会检查拉取请求、推送到 `main` 的提交，以及从 GitHub Actions 页面手动触发的运行。其 **Compile and test** 任务使用 Ubuntu 24.04 和 Node.js 24.14.1，限时 20 分钟。同一拉取请求或分支产生新运行时，会取消尚未完成的旧运行。

## 检查内容

1. `node scripts/check-committed-notices.mjs` 在安装依赖或生成文件前检查已提交的许可声明。随后，`npm run setup` 按仓库根目录和游戏目录的锁文件安装精确版本依赖。已归档的小车测试工具使用自己的锁文件安装依赖；npm 下载缓存以这三个锁文件为依据。
2. `npm --prefix src run questions:validate` 会在构建重新生成题库数据之前，检查已提交的数据是否一致。随后通过 `npm run build`、`npm test` 和 `npm run test:types` 编译生产游戏，并运行确定性回归测试与属性测试生成器的类型检查。
3. `node tests/fuzz/run.mjs quick --rounds 1 --seed 20260914 --no-tui` 执行一轮可复现、有明确上限的模糊测试，并记录当前源码哈希。
4. `npm run qa:build` 和 `npm run qa:test` 构建并检查通用隔离 QA 预览及设备检查工具。
5. 构建两个已归档的手机预览，再执行小车、探针和套件测试。归档后的工具仍可针对当前游戏源码运行。
6. Playwright 安装 Chromium、WebKit 及其 Linux 系统依赖。`npm run qa:all` 运行六种冒烟测试：Web、Android 模拟和 iOS 模拟，每种均覆盖英文与简体中文。

浏览器检查会创建独立的本地夹具服务器和全新浏览器上下文，验证启动、许可面板、操作、暂停/继续、存档隔离以及外部请求拦截。Android 和 iOS 项目属于浏览器模拟；工作流通过并不代表已验证真机性能或原生 Safari 行为。连接真机后的检查方式见 [QA 指南](QA.zh-CN.md)。

生产构建会在编译前重新生成题库数据和依赖许可声明。前面的只读声明检查会将已提交 JSON 清单的 `generatedFromLockfile` SHA-256 与 `src/package-lock.json` 比较，并确认已提交的文本声明与该清单一致。过期快照会在 prebuild 覆盖它之前导致检查失败。这项检查无需安装依赖：不同操作系统安装的可选包可能不同，因此有效的 macOS 清单可以与随后在 Linux 生成的清单不同。回归测试会验证重新生成的内容，但不要求生成后 Git 差异为空。

## 排查失败

在 GitHub Actions 中打开失败步骤。命令也会将日志写入 `results/ci/`；Bash 的 `pipefail` 会确保通过 `tee` 保存输出时仍能正确报告失败。

步骤失败时，`qa-failure-<运行 ID>-<重试次数>` 产物会保留已有日志、模糊测试报告、反例、源码哈希、浏览器截图和 QA 结果，保存期限为七天。上传时排除设备报告、Vercel 访问报告及隐藏文件。CI 不生成真机报告，也不读取本地预览配置、密码或 Toy 凭据。

有界快速模糊测试步骤失败时，CI 会上传小型 `fuzz-feedback-<运行 ID>-<重试次数>` JSON 产物，并将 `results/fuzz-feedback/report.md` 纳入完整失败产物。Markdown 与 JSON 报告保留测试套件、基础种子和派生种子、已记录的用例种子及收缩路径、源码哈希和有界复现命令。原始日志和反例仍保存在完整失败产物中。请在七天保留期结束前下载保存。

独立的[反馈工作流](../.github/workflows/fuzz-feedback.yml) 会以 **github-actions[bot]** 身份在关联的未关闭 PR 中发布简短评论，提供失败套件、已记录的种子，以及运行记录和详细产物的链接。完整失败产物不可用时，链接会指向 JSON 报告。仅安装或构建失败、尚未发生模糊测试失败时，不会发布此类评论。PR 的最新提交已经变化时会跳过。重复运行发布器时，只更新 GitHub Actions 机器人自己为相同提交、运行和重试次数创建的带标记评论，不会编辑其他评论。

无需个人令牌、机器人账户配置、环境密钥或额外凭据。反馈工作流合并到仓库默认分支后才会生效。两个任务都只能从 `main` 运行，只检出可信的默认分支提交，不安装依赖，也不执行 PR 代码。只读准备任务负责核对工作流和运行身份、失败步骤、关联 PR 的最新提交及双方仓库 ID，再从对应运行下载大小受限且只含一个 JSON 文件的产物。对于事件载荷未列出的 Fork PR，会通过 GitHub 的提交与 PR 关联查询补充候选。产物中的路径不会被解压到磁盘；自由格式错误、产物提供的复现命令及反例正文不会进入评论。

准备任务仅将大小受限且已验证的数据传给独立发布任务。发布任务为 GitHub 自动提供、仅作用于当前仓库的 `GITHUB_TOKEN` 授予 `issues: write` 和 `contents: read`，并仅在评论步骤中显式提供该令牌。构建与产物准备任务保持只读权限。发布器先核对 GitHub Actions 机器人的公开身份，再查询评论，并只创建或更新该机器人自己带有对应标记的评论。日志中不输出 API 凭据或错误响应正文。

在仓库根目录中使用 Node.js 24.14.1 复现 CI，先执行 `npm run setup`，再运行失败的命令。根目录 `.nvmrc` 选择 Node 24；`src/.nvmrc` 是较早的独立游戏版本配置，复现 CI 时请勿使用它。通过 `nvm install 24.14.1` 和 `nvm use 24.14.1` 可选择与 CI 完全相同的版本。浏览器检查需要先执行：

```sh
npx --no-install playwright install chromium webkit
npm run qa:build
npm run qa:all
```

在 Linux 上，为浏览器安装命令添加 `--with-deps`，以安装所需系统库。重新运行失败的模糊测试前，应保留原始随机种子、收缩路径和源码哈希；详见[模糊测试指南](FUZZING.zh-CN.md)。

## 维护工作流

官方 `actions/checkout`、`actions/setup-node` 和 `actions/upload-artifact` 均固定为完整提交哈希，旁边注明发行版本。更新固定版本前，先核实上游发行版及对应提交。Node 版本应与支持的本地工具保持一致，依赖安装应继续使用锁文件。

Build and QA 仅授予 `contents: read` 权限，不保留检出凭据，使用普通 `pull_request` 事件。独立且可信的 `workflow_run` 准备任务具有 contents、Actions 和拉取请求的只读权限；发布任务仅在 `contents: read` 基础上为自动令牌增加 `issues: write`。两个工作流均不会部署、发布 Toy 预览或更改密码。发布仍是[发布指南](RELEASE.zh-CN.md)中需要单独授权的步骤。这些工作流不会修改仓库的分支保护设置；首次运行后，维护者可以将 **Compile and test** 设为必需检查。
