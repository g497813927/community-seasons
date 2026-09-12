# Release handoff

Existing Toy: 四季共建 · Community Seasons
Toy ID: 30703115016192
Slug: community-seasons
Access: PASSWORD. Original password is intentionally not stored here.

The last update in the originating conversation submitted the footer licenses panel on 2026-09-11; status at submission was auditing, not proof of current approval. Query Toy before a future release.

Build only the main project. Review production-boundary tests and run Toy's content preflight using the current Toy CLI/skill instructions. Content-only updates preserve the existing title, slug, cover, icon and password when those fields are omitted. Do not create a new public Toy or change visibility to work around a missing password.

The complete licenses JSON is required at the same relative asset path as the game. Toy's preview served that JSON but returned 404 for the separate THIRD-PARTY-NOTICES.txt export; the previous Toy upload omitted that unused TXT file. Keep it in local/self-hosted distributions. The UI has no download link and reads all notices from the JSON.

No automatic deployment or GitHub publishing workflow is configured. Source, test harnesses, QA URL controls, generated recordings and authentication files must not enter a production upload.
