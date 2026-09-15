# README thumbnails

[English](README.md) | [简体中文](README.zh-CN.md)

The Chinese README uses a WebP conversion of the original 1200 × 900 [Toy cover](https://i0.hdslb.com/bfs/static/toy/app/community-seasons/poster_13585.png), saved as `docs/images/community-seasons-zh-CN.webp`. The English version adapts the original Canvas cover generator with localized text and the current game renderer. No image-generation service is used.

From the repository root, after `npm run setup`:

```sh
npx --no-install playwright install chromium
node scripts/readme-thumbnail/generate.mjs --locale en
```

This writes `docs/images/community-seasons-en.webp` using Canvas WebP encoding at quality `0.9`. The generator compiles the current game modules into a temporary directory, renders seeded scenes in an isolated local browser, and removes the temporary files afterward. It reads no player saves and performs no deployment. The question and answer text comes from the game's `respectful-disagreement` question.

Edit `poster.mjs` to change the layout or translated copy. Check the resulting WebP at full size and README width before committing it. Fonts can vary by operating system; the original cover and English version were rendered on macOS. Passing `--locale zh-CN` explicitly regenerates the Chinese asset with current artwork; otherwise the converted Toy cover stays intact.
