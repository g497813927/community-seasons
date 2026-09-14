# 持续集成

[English](CI.md) | [简体中文](CI.zh-CN.md)

[Build and QA 工作流](../.github/workflows/ci.yml) 会检查拉取请求、推送到 `main` 的提交，以及从 GitHub Actions 页面手动触发的运行。其 **Compile and test** 任务使用 Ubuntu 24.04 和 Node.js 24.14.1，限时 20 分钟。同一拉取请求或分支产生新运行时，会取消尚未完成的旧运行。

## 检查内容

1. `npm run setup` 按仓库根目录和游戏目录的锁文件安装精确版本依赖。npm 下载缓存同时使用这两个锁文件作为缓存依据。
2. `npm --prefix src run questions:validate` 会在构建重新生成题库数据之前，检查已提交的数据是否一致。随后通过 `npm run build`、`npm test` 和 `npm run test:types` 编译生产游戏，并运行确定性回归测试与属性测试生成器的类型检查。
3. `node run.mjs quick --rounds 1 --seed 20260914 --no-tui` 执行一轮可复现、有明确上限的模糊测试，并记录当前源码哈希。
4. `npm run qa:build` 和 `npm run qa:test` 构建并检查通用隔离 QA 预览及设备检查工具。
5. 构建两个已归档的手机预览，再执行小车、探针和套件测试。归档后的工具仍可针对当前游戏源码运行。
6. Playwright 安装 Chromium、WebKit 及其 Linux 系统依赖。`npm run qa:all` 运行六种冒烟测试：Web、Android 模拟和 iOS 模拟，每种均覆盖英文与简体中文。

浏览器检查会创建独立的本地夹具服务器和全新浏览器上下文，验证启动、许可面板、操作、暂停/继续、存档隔离以及外部请求拦截。Android 和 iOS 项目属于浏览器模拟；工作流通过并不代表已验证真机性能或原生 Safari 行为。连接真机后的检查方式见 [QA 指南](QA.zh-CN.md)。

生产构建会在编译前重新生成题库数据和依赖许可声明。不同操作系统安装的可选包可能不同，因此 Linux 执行器生成的声明可能与 macOS 安装结果不同。CI 验证内容和生成结果是否最新，但不要求生成后 Git 差异为空。

## 排查失败

在 GitHub Actions 中打开失败步骤。命令也会将日志写入 `results/ci/`；Bash 的 `pipefail` 会确保通过 `tee` 保存输出时仍能正确报告失败。

步骤失败时，`qa-failure-<运行 ID>-<重试次数>` 产物会保留已有日志、模糊测试报告、反例、源码哈希、浏览器截图和 QA 结果，保存期限为七天。上传时排除设备报告、Vercel 访问报告及隐藏文件。CI 不生成真机报告，也不读取本地预览配置、密码或 Toy 凭据。

有界快速模糊测试步骤失败时，CI 还会上传一个小型 `fuzz-feedback-<运行 ID>-<重试次数>` JSON 产物。独立的[反馈工作流](../.github/workflows/fuzz-feedback.yml) 会以 **techzjc-bot** 身份在关联的未关闭 PR 中发表评论，提供测试套件、基础种子和派生种子、已记录的失败用例种子及收缩路径、源码哈希摘要、有界复现命令和原始运行链接。仅安装或构建失败、尚未发生模糊测试失败时，不会发布此类评论。PR 的最新提交已变化时会跳过。重复运行发布器时，只更新该机器人自己为相同提交、运行和重试次数创建的带标记评论。

反馈工作流合并到仓库默认分支后才会生效。它只检出可信的默认分支提交，不安装依赖，也不执行 PR 代码。只读 `GITHUB_TOKEN` 负责核对工作流和运行身份、失败步骤、关联 PR 的最新提交及双方仓库 ID，再从对应运行的产物中下载不超过 64 KiB 的 JSON。对于事件载荷未列出的 Fork PR，会通过 GitHub 的提交与 PR 关联查询补充候选，再核对仓库和提交。产物中的文件路径不会被解压到磁盘；自由格式错误、产物提供的复现命令及反例正文不会复制到评论中。

只读准备任务仅通过任务输出，将大小受限且已验证的数据传给独立的发布任务。发布器使用 **ci-comments** 环境，只能从 `main` 运行，并检出相同的可信默认分支提交。机器人凭据仅在最后的评论步骤中作为进程变量 `PAT_COMMENTS` 提供。该步骤先确认令牌账户为 `techzjc-bot`，然后读取评论，并仅创建或更新该账户自己带有对应标记的评论。构建、模糊测试、产物下载与解析及依赖安装均无法访问此令牌；日志中不输出令牌或 API 错误响应正文。GitHub 会在日志中遮盖仓库密钥，但真正的边界是让不可信执行过程始终无法取得密钥。

启用评论前，必须在仓库设置中完成以下迁移：

1. 创建 `ci-comments` 环境，并将允许部署的分支限制为 `main`。可通过必需审查者添加人工批准关卡。
2. 将机器人凭据保存为**仅位于该环境中的 CI_COMMENT_TOKEN 密钥**，不要创建同名仓库级密钥。使用不同名称可以防止环境尚未配置时，工作流静默回退到旧的仓库级 `PAT_COMMENTS` 密钥。
3. 保存环境凭据后，删除旧的仓库级 `PAT_COMMENTS` 密钥。只要它仍位于仓库级别，其他同仓库工作流仍可能取得它，即使此发布器已不再读取它。

环境凭据缺失时，发布器会停止。GitHub Actions 的执行者名称本身不能作为授权依据；可信默认分支代码、受保护环境，以及运行和 PR 身份核对共同构成访问边界。

目前机器人作为协作者参与另一个个人账户拥有的仓库。GitHub 的[细粒度 PAT 限制](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)不允许外部协作者使用此类令牌写入该仓库。若保留该机器人身份并对这个公开仓库使用经典 PAT，应选择适用的最小 `public_repo` 范围并设置过期时间。该范围仍大于评论权限；隔离工作流并不会缩小令牌本身的权限。GitHub 没有仅限评论的 PAT 权限。仓库所有权支持细粒度令牌时，[评论 API](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment)接受仓库 `Issues: write`，无需 Contents、Actions 或管理权限。只有令牌所有者才能在 GitHub 设置中修改范围或替换令牌；此工作流不能读回或缩小已保存的 Actions 密钥权限。

本地复现时，使用 Node.js 24.14.1 并先执行 `npm run setup`，再运行失败的命令。浏览器检查需要先执行：

```sh
npx --no-install playwright install chromium webkit
npm run qa:build
npm run qa:all
```

在 Linux 上，为浏览器安装命令添加 `--with-deps`，以安装所需系统库。重新运行失败的模糊测试前，应保留原始随机种子、收缩路径和源码哈希；详见[模糊测试指南](FUZZING.zh-CN.md)。

## 维护工作流

官方 `actions/checkout`、`actions/setup-node` 和 `actions/upload-artifact` 均固定为完整提交哈希，旁边注明发行版本。更新固定版本前，先核实上游发行版及对应提交。Node 版本应与支持的本地工具保持一致，依赖安装应继续使用锁文件。

Build and QA 仅授予 `contents: read` 权限，不保留检出凭据，使用普通 `pull_request` 事件。独立且可信的 `workflow_run` 发布器为内置令牌授予 contents、Actions 和拉取请求的只读权限；仅最后受环境限制的评论步骤会收到机器人凭据。两个工作流均不会部署、发布 Toy 预览或更改密码。发布仍是[发布指南](RELEASE.zh-CN.md)中需要单独授权的步骤。这些工作流不会修改仓库的分支保护设置；首次运行后，维护者可以将 **Compile and test** 设为必需检查。
