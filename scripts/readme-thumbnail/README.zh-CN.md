# README 缩略图

[English](README.md) | [简体中文](README.zh-CN.md)

Toy 封面采用 1200 × 900（4:3）的 Canvas 布局，所有主要内容位于居中的 1200 × 675（16:9）安全区域内。仓库根目录的中英文 README 均使用该安全区域裁切后导出的 1200 × 675 WebP。Toy 动态页可能裁掉顶部和底部各 112.5 像素，因此这两个区域只绘制背景。文字与安全区域边缘额外保持至少 24 像素间距，并使用实际字形边界进行检查。中英文版本均使用当前游戏渲染器，不使用图像生成服务。

引用封面时请使用已纳入版本控制的[中文](../../docs/images/community-seasons-zh-CN.webp)或[英文](../../docs/images/community-seasons-en.webp) WebP；Toy CDN 链接在外部访问时可能返回 HTTP 403。

在仓库根目录执行 `npm run setup` 后运行：

```sh
npx --no-install playwright install chromium
node scripts/readme-thumbnail/generate.mjs --locale en
node scripts/readme-thumbnail/generate.mjs --locale zh-CN
```

每次运行输出 1200 × 675 的 `docs/images/community-seasons-<locale>.webp`，使用 Canvas WebP 编码，质量参数为 `0.9`。中英文 README 已引用这些路径。同时在 Git 忽略的 `results/readme-thumbnail/` 目录输出用于 Toy 上传的完整 PNG、用于检查居中裁切效果的 `-16x9.png`，以及 `-bounds.json` 布局报告。上传完整的 1200 × 900 PNG；`-16x9.png` 仅供检查。脚本将当前游戏模块编译到临时目录，在独立的本地浏览器中绘制固定种子的场景，结束后清理临时文件。整个过程不读取玩家存档，也不会部署作品。题目及选项文案来自游戏题库中的 `respectful-disagreement`。

修改布局或翻译时，编辑 `poster.mjs`。内容坐标以安全区域顶部 y = 112.5 为起点。提交前按原尺寸及缩略图宽度检查完整封面与 16:9 裁切图。字体可能因操作系统而异；这些图片在 macOS 上绘制。默认语言为英语。发布需要授权；只更新已获授权的封面或图标元数据，不传可见性或密码参数，以保留现有发布设置。

两个命令还会输出 `docs/images/community-seasons-icon.png`（500 × 500，小于 Toy 的 512 KB 限制）。图标、封面与 [`src/public/favicon.svg`](../../src/public/favicon.svg) 均采用游戏顶部与分享海报中使用的 Lucide Flower2 精确轮廓，以深青色衬托金色线条。修改时请保持 favicon 与 Toy 图标的轮廓、颜色及占画布 80% 的居中视口一致。封面右上角和左下角的装饰涟漪不承载主要内容。请在小尺寸及圆形遮罩下检查图标，并且只在获得授权后随封面一起发布。
