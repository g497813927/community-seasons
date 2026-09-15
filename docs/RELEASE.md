# Release handoff

[English](RELEASE.md) | [简体中文](RELEASE.zh-CN.md)

Existing Toy: 四季共建 · Community Seasons
Toy ID: 30703115016192
Slug: community-seasons

The latest content update was submitted on 2026-09-14: repeated jump inputs now preserve one uninterrupted jump arc without restarting or queuing another jump. A fresh input after landing starts the next jump; slide repeats and switching between jump and slide retain their existing behavior. Toy accepted the submission with status `auditing`. Title, slug, cover and icon were preserved by omitting metadata flags.

Before submission, the production build, 248 regression tests, type checks and two rounds of all six full fuzz suites passed. Run `node tests/fuzz/run.mjs full --rounds 2 --seed 20260914 --no-tui` to reproduce the full rounds (round seeds `20260914` and `2674696675`, 224 renderer seeds each, 48,129 rendered frames total). Production source hashes stayed unchanged. Four isolated local production-browser smoke checks covered English/Chinese and phone/desktop sizes. The hosted game assets matched the tested build; the HTML differed only by Toy's wrapper redirect. Local reports and exact build hashes are under `results/publish-validation-jump-2026-09-14T06-40-25Z/` (Git-ignored).

Build only the main project. Review production-boundary tests and run Toy's content preflight using the current Toy CLI/skill instructions. For content-only updates, omit metadata flags and verify that the submission changes only the tested game content. Changes to the title, slug, cover, icon or other publication settings require separate authorization.

The complete licenses JSON is required at the same relative asset path as the game. Toy's preview returns 404 for standalone `LICENSE` and `THIRD-PARTY-NOTICES.txt` files even when they are included in the upload. Keep both in the production build for other hosts. The project's MIT notice is also embedded verbatim in an inert `text/plain` block in `index.html`, so Toy distributes it with the page. The in-game panel reads all third-party notices from the JSON and has no download link. Before submission, verify that the hosted HTML contains the exact project notice and that the hosted JSON matches the tested build.

Production Toy publication remains a manual, authorized content-only update; the separate [protected Vercel QA workflow](QA_HOSTING.md) is manually triggered and deploys only the isolated QA preview. Source, test harnesses, QA URL controls, generated recordings and authentication files must not enter a production upload.
