# README thumbnails

[English](README.md) | [简体中文](README.zh-CN.md)

The Toy cover uses a 1200 × 900 (4:3) Canvas layout with all meaningful content inside a centered 1200 × 675 (16:9) safe area. Both root READMEs use the 1200 × 675 safe-area crop exported as WebP. Toy's dynamic feed can crop 112.5 pixels from both the top and bottom; these outer bands contain only background. Text has at least 24 pixels of additional inset inside the safe area, checked using actual glyph bounds. Both languages use the current game renderer. No image-generation service is used.

Use the checked-in [Chinese](../../docs/images/community-seasons-zh-CN.webp) or [English](../../docs/images/community-seasons-en.webp) WebP when linking to the cover; the Toy CDN URL can return HTTP 403 for external requests.

From the repository root, after `npm run setup`:

```sh
npx --no-install playwright install chromium
node scripts/readme-thumbnail/generate.mjs --locale en
node scripts/readme-thumbnail/generate.mjs --locale zh-CN
```

Each invocation writes the 1200 × 675 `docs/images/community-seasons-<locale>.webp` using Canvas WebP encoding at quality `0.9`. These paths are already referenced by the English and Chinese READMEs. It also exports a full-size PNG for Toy upload, a `-16x9.png` centered crop, and a `-bounds.json` layout report under the Git-ignored `results/readme-thumbnail/` directory. Upload the full 1200 × 900 PNG; the `-16x9.png` is for review only. The generator compiles the current game modules into a temporary directory, renders seeded scenes in an isolated local browser, and removes the temporary files afterward. It reads no player saves and performs no deployment. The question and answer text comes from the game's `respectful-disagreement` question.

Edit `poster.mjs` to change the layout or translated copy. Content coordinates are relative to the safe area's top edge at y = 112.5. Check the full cover and 16:9 crop at full size and thumbnail width before committing. Fonts can vary by operating system; these assets were rendered on macOS. The default locale is English. Publishing requires authorization; update only the authorized poster/icon metadata and preserve existing publication settings by omitting visibility and password flags.

Both commands also export `docs/images/community-seasons-icon.png` (500 × 500, below Toy's 512 KB limit). The icon, cover and [`src/public/favicon.svg`](../../src/public/favicon.svg) share the exact Lucide Flower2 geometry used in the game header and share posters, with a gold outline on dark teal. Keep the favicon's geometry, colors and 80% inset viewport aligned with the Toy icon. Decorative arcs at the cover's upper right and lower left remain outside the meaningful content. Review the icon at small sizes and with a circular mask; publish it with the cover only when authorized.
