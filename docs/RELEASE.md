# Release handoff

Existing Toy: 四季共建 · Community Seasons
Toy ID: 30703115016192
Slug: community-seasons
Access: PASSWORD. Original password is intentionally not stored here.

The latest content update was submitted on 2026-09-14: persistent touch buttons for in-run boosters, compact short-screen controls, and bilingual instructions. Toy accepted the submission with status `auditing`; query Toy for the current approval status. Title, slug, cover, icon and PASSWORD access were preserved by omitting metadata/password flags.

Before submission, the production build, 246 regression tests, type checks and all six full fuzz suites passed (seed `3231321585`, including 24,054 rendered frames). Production source hashes stayed unchanged. The uploaded assets matched the tested build, and the hosted preview passed a fresh mobile-browser smoke check. Local reports and exact build hashes are under `results/publish-validation-2026-09-14T06-23-05-441Z/` (Git-ignored).

Build only the main project. Review production-boundary tests and run Toy's content preflight using the current Toy CLI/skill instructions. Content-only updates preserve the existing title, slug, cover, icon and password when those fields are omitted. Do not create a new public Toy or change visibility to work around a missing password.

The complete licenses JSON is required at the same relative asset path as the game. Toy's preview served that JSON but returned 404 for the separate THIRD-PARTY-NOTICES.txt export; the previous Toy upload omitted that unused TXT file. Keep it in local/self-hosted distributions. The UI has no download link and reads all notices from the JSON.

No automatic deployment or GitHub publishing workflow is configured. Source, test harnesses, QA URL controls, generated recordings and authentication files must not enter a production upload.
