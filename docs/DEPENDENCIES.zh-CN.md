# 依赖维护

[English](DEPENDENCIES.md) | [简体中文](DEPENDENCIES.zh-CN.md)

[Dependabot 配置](../.github/dependabot.yml)安排每周一 `America/New_York` 时区 09:00 检查新版本，并随该时区切换夏令时。配置合并到默认分支后生效。

| 生态 | 检查范围 | 同时打开的版本更新 PR 上限 |
| --- | --- | --- |
| npm | 根目录工作区、`src/`、`qa/archive/phone-cart-fix-qa/` | 5 |
| GitHub Actions | `.github/workflows/` 与根目录的 Action 清单 | 3 |

当版本约束兼容时，同一个 npm 依赖在多个目录中的更新会放入一个 PR。无关依赖保留独立 PR；约束不兼容时可能拆分 PR。`increase` 策略会提高现有版本要求；审查时仍须保留本仓库的精确版本锁定。GitHub Actions 更新也保持独立。字段说明见 [GitHub 配置参考](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)。

## 安全更新

请在仓库安全设置中保持 **Dependabot alerts**（漏洞告警）和 **Dependabot security updates**（安全更新）开启。安全更新由漏洞告警触发，不必等到周一。如果存在兼容的修复版本，Dependabot 会提出升级 PR；否则请阅读告警中的原因并手动处理。每周版本更新的 PR 上限不会阻止安全 PR。详见 [GitHub 安全更新说明](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates)。

此配置只创建供审查的 PR，不会自动合并、部署或修改 Toy 的访问设置。

## 审查依赖 PR

在 PR 分支中使用 Node.js 24。先阅读更新说明并检查兼容性，再安装锁定的依赖并验证：

```sh
npm run setup
npm ci --prefix qa/archive/phone-cart-fix-qa --ignore-scripts
npm --prefix qa/archive/phone-cart-fix-qa run build
npm --prefix src run licenses:generate
npm run build
npm test
npm run test:types
npm run test:fuzz
npm run qa:build
npm run qa:test
```

将重新生成的游戏许可声明与依赖更新一并提交，不得用链接替代原始声明。每次依赖更新都须先重新构建隔离预览，再运行框架测试。涉及浏览器、React、Vite 或渲染的更新，还应执行对应的 [Web、Android、iOS QA](QA.zh-CN.md)。Playwright 的锁定版本改变后，请同步更新本机安装的测试浏览器。

对受影响的锁文件运行对应审计，并检查剩余问题：

```sh
npm audit
npm audit --prefix src
npm audit --prefix qa/archive/phone-cart-fix-qa
```

修复验证失败后再请求审查和合并。依赖更新通过验证后，仍须遵循正常的[发布流程](RELEASE.zh-CN.md)才能发布。
