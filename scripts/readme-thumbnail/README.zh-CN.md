# README 缩略图

[English](README.md) | [简体中文](README.zh-CN.md)

中文 README 使用原始 1200 × 900 [Toy 封面](https://i0.hdslb.com/bfs/static/toy/app/community-seasons/poster_13585.png)转为 WebP 后的图片，保存为 `docs/images/community-seasons-zh-CN.webp`。英文版沿用原封面的 Canvas 绘制方式，替换文案并使用当前游戏渲染器生成画面，不使用图像生成服务。

在仓库根目录执行 `npm run setup` 后运行：

```sh
npx --no-install playwright install chromium
node scripts/readme-thumbnail/generate.mjs --locale en
```

输出文件为 `docs/images/community-seasons-en.webp`，使用 Canvas WebP 编码，质量参数为 `0.9`。脚本将当前游戏模块编译到临时目录，在独立的本地浏览器中绘制固定种子的场景，结束后清理临时文件。整个过程不读取玩家存档，也不会部署作品。题目及选项文案来自游戏题库中的 `respectful-disagreement`。

修改布局或翻译时，编辑 `poster.mjs`。提交前按原尺寸及 README 的显示宽度检查 WebP。字体可能因操作系统而异；原封面和英文版均在 macOS 上绘制。显式传入 `--locale zh-CN` 会用当前画面重新生成中文图片；默认保留转换后的 Toy 封面。
