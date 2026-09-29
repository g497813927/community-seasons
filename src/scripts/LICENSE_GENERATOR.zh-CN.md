# 可复用的许可证生成器

[English](LICENSE_GENERATOR.md) | [简体中文](LICENSE_GENERATOR.zh-CN.md)

`licenses.mjs` 仅使用 Node.js 内置模块。它根据 npm 第 3 版锁文件记录的已安装版本，收集真实的 LICENSE、NOTICE、COPYRIGHT 和嵌套第三方声明文件，保留原始文本，合并重复的软件包版本，并生成：

- `open-source-licenses.json`：供可搜索许可证面板使用的结构化数据。
- `THIRD-PARTY-NOTICES.txt`：包含相同原始声明、可用于分发的文本文件。

## 在本游戏中使用

在仓库的 `src/` 目录执行：

```sh
npm ci
npm run licenses:generate
npm run licenses:check
```

`npm run build` 会自动重新生成声明，并在打包前进行校验。游戏内面板不包含超链接。分发时应将生成的文件与其余静态构建文件一起保留。

CI 会在构建前检查已提交的声明是否与锁文件一致。本仓库中由 Dependabot 发起、以 `main` 为目标且分支位于 `dependabot/**` 的 PR 事件，先运行轻量的 `Dependabot license refresh intake` 工作流，不检出代码、不安装依赖，也不使用凭据；普通 PR 的 `Compile and test` 作业会跳过。入口成功后，可信的 `Refresh Dependabot license notices` 工作流刷新过期声明，以 `github-actions[bot]` 身份原子提交两个 public 文件，再显式启动完整的 `Build and QA`。

刷新流程会验证源工作流及运行次数、原始事件的 Dependabot 发起者身份、Dependabot PR 作者身份、仓库、分支、开放状态和目标分支。生成声明还要求游戏锁文件发生变化，且完整差异只包含支持的依赖清单、锁文件和声明文件。其他拉取请求仍运行正常 CI。流程使用默认分支的可信工具，在没有凭据且禁用依赖脚本的环境中安装锁定的软件包；只有独立发布任务拥有内容写入权限，不会强制推送或合并。缺失许可证原文或元数据无效时，需要手动修正。本地更新依赖时，仍应重新生成并提交两个 public 声明文件。

独立调度任务会在生成和发布之后运行，即使声明已经最新、更新不符合自动生成条件（例如 GitHub Actions 或仅 QA 依赖），或生成失败，也会启动完整 CI。它校验当前 PR 和实际 Git 分支引用，避免声明提交后 PR API 的提交信息更新延迟导致 CI 被跳过。若最后检查发现分支已前进到无关的新提交，或 PR 已关闭，旧入口不会调度 CI；新更新需要自己的入口运行。GitHub 按分支调度，无法原子指定预期 SHA，因此最后检查与调度之间的推送仍可能使 CI 运行在新提交上；排查并发更新时应核对最终运行的 SHA。完整 CI 仍会检查已提交声明，生成失败不会被当作检查通过。

工作流使用内置 `GITHUB_TOKEN`，无需个人令牌或额外密钥。GitHub 可能要求手动批准由此令牌触发的 PR 运行，因此刷新流程显式调度工作流，不依赖推送事件。详见 [GitHub 的工作流触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。这些工作流需要先合入 `main`。现有 Dependabot 分支需要更新或变基到包含新工作流的版本，才能在 PR 事件中运行新入口；重新运行旧 `Build and QA` 不再触发刷新。仓库规则必须允许 GitHub Actions 机器人更新相应 Dependabot 分支。

自动生成的提交包含 `[dependabot skip]`，以便 [Dependabot 在变基时替换这些提交](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/manage-dependabot-prs)；下一次依赖入口运行会再次刷新声明。该标记不会跳过 CI。如果发布成功但调度失败，请在刷新工作流中选择 **Re-run failed jobs（重新运行失败的作业）**。调度任务会验证生成提交的作者、父提交、标记、仅声明文件的改动和声明内容，再重试 CI，不会重复创建提交。

## 在其他 npm 项目中使用

需要 Node.js 22.13 或更高版本，并已安装项目依赖，包括开发依赖（`npm ci --include=dev`）。运行现有脚本时，显式指定项目根目录：

```sh
node /path/to/licenses.mjs --root "/path/to/another project" --write
node /path/to/licenses.mjs --root "/path/to/another project" --check
```

也可以将 `licenses.mjs` 及其旁边的 `license-supplements/` 文件夹一并复制到新项目的 `scripts/` 目录。生成器本身不需要安装任何软件包。

不传入 `--root` 时，项目根目录默认为脚本所在文件夹的父目录。相对路径形式的 `--root` 从当前工作目录解析。默认输出到项目的 `public/` 目录。可使用 `--out-dir` 指定其他目录，路径可以相对于项目根目录，也可以是绝对路径：

```sh
node scripts/licenses.mjs --write --out-dir "artifacts/open source"
node scripts/licenses.mjs --check --out-dir "artifacts/open source"
node scripts/licenses.mjs --help
```

默认模式为 `--check`，不会写入文件。生成文件缺失或过期时，它以非零状态码退出，适合在 CI 中使用。`--write` 只替换上述两个指定输出文件。收集失败时，原有输出保持不变。两种命令都可离线运行。

## 覆盖范围与缺失声明

清单涵盖已安装的直接依赖、间接依赖和构建依赖，不限于浏览器产物中实际包含的模块。未安装的可选平台包会单独报告。生成器要求 npm 锁文件版本为 3，不支持工作区链接、pnpm 或 Yarn 锁文件。外部服务和单独安装的工具不在其范围内。

缺少必需包、版本或许可证冲突、缺失原始许可证文本，以及无法识别的许可证声明，都会导致校验失败。应检查软件包对应的原始发布版本，必要时补充其真实声明；不要使用猜测的许可证模板替代。

Rolldown 的 npm 归档可能遗漏原生包的许可证文件及引用的第三方声明。已核实的上游原始文件按版本保存在 `scripts/license-supplements/` 下的各个目录中；生成的声明包含来源 URL，`scripts/licenses.mjs` 使用固定的 SHA-256 进行校验。已安装版本以目标项目的 `package-lock.json` 为准，生成器支持的补充文件版本以脚本中的规则为准。生成器先检查目标项目的 `scripts/license-supplements/`，再检查脚本旁的同名文件夹。复制脚本时应一并复制该文件夹，以保留这些已核实的原始文件。添加新版本时应审阅新版上游声明，并保留此前已核实的目录，不得用通用许可证模板替代。

部分 Linux 安装还会包含可选的 WASI 辅助包 `@napi-rs/wasm-runtime@1.2.3` 和 `@tybys/wasm-util@0.10.3`，但其 npm 归档未包含许可证原文。针对这两个版本的补充文件保留上游 MIT 许可证，校验仓库信息和 SHA-256，并记录不可变的来源链接。NAPI-RS 原文来自 npm `gitHead` 指向的提交 `70c149321ca4e361f6726349cf9b2258467fb24f`。wasm-util 原文来自维护者的 `add LICENSE` 提交 `a16b188d44ae43cc91edb71996ba2b43ff0996d9`；该提交中的 `package.json` 仍为 0.10.3，而更早的 npm `gitHead` 没有 LICENSE 文件。这些都是上游原文，并非生成的许可证模板。支持新版本时需要重新核实。
