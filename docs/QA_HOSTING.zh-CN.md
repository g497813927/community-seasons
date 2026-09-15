# 受保护的 QA 托管

[English](QA_HOSTING.md) | [简体中文](QA_HOSTING.zh-CN.md)

使用独立的 Vercel 项目 **community-seasons-qa** 进行临时远程测试。它托管[通用 QA 预览](QA.zh-CN.md)，隔离浏览器测试存档，并禁用 Toy 云端访问。这个流程不依赖 Toy，不发布正式游戏，也不修改任何玩家存档键。

## 首次配置

在目标 Vercel 团队内创建名为 `community-seasons-qa` 的空项目。上传文件之前，将 **Deployment Protection → Vercel Authentication → All Deployments** 配置为保护所有部署。触发脚本会核对项目名称、项目 ID、团队 ID 和 `ssoProtection.deploymentType: "all"`；任何不匹配都会在上传前停止。请将该项目与公开网站分开，不要为它启用自动 Git 部署。

空项目的首次部署可能被 Vercel 归类为生产部署，即使请求的是预览（见[上游问题](https://github.com/vercel/vercel/issues/17069)）。因此，脚本还要求该受保护 QA 项目已有一个 **READY 状态的生产初始化部署**。如果已有，请保留它并跳过以下步骤；否则，通过已安装并登录的 Vercel CLI，仅上传一次简单占位页：

```sh
mkdir -p /tmp/community-seasons-qa-bootstrap
printf '%s\n' '<!doctype html><title>Protected QA hosting</title><p>QA environment initialized.</p>' > /tmp/community-seasons-qa-bootstrap/index.html
vercel link --cwd /tmp/community-seasons-qa-bootstrap
vercel deploy --cwd /tmp/community-seasons-qa-bootstrap --prod
```

执行 `link` 时选择目标团队和**现有的 `community-seasons-qa` 项目**。执行 `deploy` 前，确认已开启 All Deployments 保护。这次初始化有意在独立 QA 项目的生产部署位置放置占位页；不要上传游戏源码、密钥或玩家数据。等待 READY，并在未登录的浏览器中确认访问需要 Vercel 身份验证，然后保留该初始化部署。常规触发脚本只请求预览；若返回的部署被归类为生产部署，脚本会拒绝生成分享链接。

本地运行时，通过密码管理器或终端环境提供以下变量：

| 变量 | 内容 |
| --- | --- |
| `VERCEL_TOKEN` | 限定于 QA 项目所属团队、设有过期时间的 Vercel API 令牌 |
| `VERCEL_PROJECT_ID` | QA 项目的 `prj_…` 标识符 |
| `VERCEL_ORG_ID` | 所属团队的 `team_…` 标识符 |

Vercel 访问令牌[按团队限定范围](https://vercel.com/kb/guide/how-do-i-use-a-vercel-api-access-token)。脚本会核对指定的 QA 项目，但这一检查不会缩小令牌本身对团队中其他项目的访问权限。

不要将令牌放入命令参数、受版本控制的文件、截图、Issue 或 PR。脚本使用 Node 内置的 HTTP 客户端，无须安装 Vercel CLI。安装 CLI 并登录可用于管理账户，但不能替代这里明确指定的部署变量。

在 GitHub Actions 中创建名为 **qa-preview** 的环境，将允许部署的分支限制为 **main**。将 `VERCEL_TOKEN` 配置为环境密钥，两个 ID 配置为环境变量。团队如需人工审批，可另设环境审核人。工作流和部署脚本也会拒绝其他分支；不要改成向不受信任的 PR 代码提供部署凭据。

## 本地触发

使用 [.nvmrc](../.nvmrc) 指定的 Node.js 版本，在仓库根目录运行：

```sh
npm run setup
npx --no-install playwright install chromium webkit
npm run qa:build
npm run qa:all
npm run qa:deploy
```

最后一条命令要求 Web、Android 和 iOS 浏览器模拟的英文、简体中文场景全部通过，且报告中的源码与构建产物哈希必须与待上传文件一致。构建时生成的 `qa-build-info.json` 也必须与当前游戏、预览源码及根目录的包配置文件一致。这些测试不能证明真机表现。修改源码或重新构建出不同产物后，需要再次运行 QA。

访问链接默认有效期为 **1 小时**。如需调整：

```sh
npm run qa:deploy -- --ttl-seconds 7200
```

仓库允许 60–82,800 秒，最长 23 小时。脚本始终发送有效期参数；如果调用 Vercel 分享链接 API 时省略 TTL，链接将永不过期。

脚本只上传 `qa/preview/dist/` 中明确允许的静态文件，并将其部署到指定项目的预览环境。随后再次核对部署就绪状态、项目身份、预览类型及访问保护，并确认匿名请求遭到拒绝，才申请分享链接。API 响应不符合预期时会停止，且不打印原始响应。内联上传请求上限设为 4 MiB；超过后需重新评估上传方案。

## 访问与设备选择

终端只打印受身份验证保护的部署地址、过期时间，以及 `results/qa/vercel-*/` 下的本地 `access.json` 路径。申请分享密钥之前，脚本会创建唯一目录和独占空文件，并核实 POSIX 权限分别为 `0700` 和 `0600`。写入前再次检查隐私权限，然后通过同一打开的文件句柄写入；失败时清理本次新建的文件，不覆盖已有文件。所在目录已被 Git 忽略。在本地打开文件，将链接用于测试设备。完整链接等同于密码；测试结束后删除本地文件。

生成私密链接需要真正执行 POSIX 权限的文件系统，例如 macOS/Linux 的本地文件系统。Windows 下会拒绝生成链接，因为 [Node 的模式检查无法确认 Windows ACL 的隐私保护](https://nodejs.org/api/fs.html#file-modes)。忽略所需权限的文件系统会在申请密钥前被拒绝；如果存储采用不同的访问控制机制，仅凭报告的模式位不能证明文件私密性。`qa:deploy -- --deploy-only` 不需要私密文件支持，仍可运行；请通过 Vercel 身份验证访问，或在支持的文件系统上运行 `qa:share`。若申请链接后发生失败，远端链接可能仍有效直至过期；必要时使用下文的撤销控件。

访问链接会建立 Vercel 身份验证 Cookie。重定向后，为[设备检查工具](QA.zh-CN.md)指定终端打印的**不含查询参数**的部署地址。Vercel 可能缩短项目前缀，因此允许 `community-seasons-qa-….vercel.app` 和 `community-seasons-<build>-<team>.vercel.app` 两种形式，但必须使用 HTTPS，路径为 `/` 或 `/index.html`，且不含查询字符串。检查工具要求 URL 和所选目标 ID 精确匹配，然后验证独立 QA 标记及云端禁用状态。不要把带 `_vercel_share` 的链接传给设备命令，以免访问密钥进入命令记录或报告。

运行设备检查时，使用构建该托管预览的同一份源码。设备状态会显示页面内嵌的不可变构建记录是否与当前源码一致；未构建或过期的页面无法开始测量，需要部署当前构建并重新加载页面。

若要提前撤销链接，可使用部署页面的 **Share** 控件或团队的 Deployment Protection 访问管理页面。API 也支持撤销指定分享密钥而不生成替代链接。不要为了测试而关闭项目访问保护。

如需为已有预览申请新的一小时链接，无须重新构建或上传，使用不含密钥的部署 ID 即可：

```sh
npm run qa:share -- --deployment dpl_YOUR_QA_DEPLOYMENT
```

该命令会先验证项目、触发器元数据、READY 状态、预览类型、访问保护和匿名拒绝状态，再生成链接。也可用 `--ttl-seconds` 调整有效期；链接只写入私密本地文件。

## 手动 GitHub 触发

工作流合并后，打开 **Actions → Protected QA preview → Run workflow**，选择 `main`。工作流安装锁定依赖，运行框架测试及六个双语浏览器场景，然后部署。凭据仅提供给部署步骤。

CI 使用 `qa:deploy -- --deploy-only`，只打印需要身份验证的部署地址和部署 ID，不在运行器中生成访问密钥。团队成员可通过 Vercel 身份验证访问部署。如需在未登录 Vercel 的设备上使用临时链接，在本地用该 ID 运行 `qa:share` 即可。也可通过 Vercel 连接器的 `get_access_to_vercel_url` 工具私下申请 23 小时链接。访问链接不得出现在 CI 日志、工作流产物或 PR 中。

脚本不会请求提升部署，也不会更改项目保护。若返回的部署类型不符合预期，脚本会停止且不生成分享链接。如果上传结果不确定，请先在 Vercel 中根据不含密钥的部署 ID 检查状态，再决定是否重试。保留受保护的初始化部署，确保后续上传仍为预览。

## API 参考

- [Vercel 身份验证](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)
- [关联现有项目](https://vercel.com/docs/cli/link)及[部署受保护的初始化页面](https://vercel.com/docs/cli/deploy)
- [创建部署](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)：预览部署省略 target，响应中对应值为 `null`；上面的初始化检查用于处理空项目例外。
- [限时分享链接与撤销](https://vercel.com/docs/rest-api/aliases/update-the-protection-bypass-for-a-url)
- [Vercel MCP 访问工具](https://vercel.com/docs/agent-resources/vercel-mcp/tools)
