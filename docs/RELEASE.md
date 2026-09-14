# Release handoff

[English](RELEASE.md) | [简体中文](RELEASE.zh-CN.md)

Existing Toy: 四季共建 · Community Seasons
Toy ID: 30703115016192
Slug: community-seasons
Access: PASSWORD. Original password is intentionally not stored here.

The latest content update was submitted on 2026-09-14: repeated jump inputs now preserve one uninterrupted jump arc without restarting or queuing another jump. A fresh input after landing starts the next jump; slide repeats and switching between jump and slide retain their existing behavior. Toy accepted the submission with status `auditing`, and a follow-up query confirmed PASSWORD access. Title, slug, cover, icon and the existing password were preserved by omitting metadata/password flags.

Before submission, the production build, 248 regression tests, type checks and two rounds of all six full fuzz suites passed. Run `node run.mjs full --rounds 2 --seed 20260914 --no-tui` to reproduce the full rounds (round seeds `20260914` and `2674696675`, 224 renderer seeds each, 48,129 rendered frames total). Production source hashes stayed unchanged. Four isolated local production-browser smoke checks covered English/Chinese and phone/desktop sizes. The hosted game assets matched the tested build; the HTML differed only by Toy's wrapper redirect. Local reports and exact build hashes are under `results/publish-validation-jump-2026-09-14T06-40-25Z/` (Git-ignored).

Build only the main project. Review production-boundary tests and run Toy's content preflight using the current Toy CLI/skill instructions. Content-only updates preserve the existing title, slug, cover, icon and password when those fields are omitted. Do not create a new public Toy or change visibility to work around a missing password.

The complete licenses JSON is required at the same relative asset path as the game. Toy's preview served that JSON but returned 404 for the separate THIRD-PARTY-NOTICES.txt export; the previous Toy upload omitted that unused TXT file. Keep it in local/self-hosted distributions. The UI has no download link and reads all notices from the JSON.

No automatic deployment or GitHub publishing workflow is configured. Source, test harnesses, QA URL controls, generated recordings and authentication files must not enter a production upload.
