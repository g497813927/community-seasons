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
