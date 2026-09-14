# Community Seasons / 四季共建

[English](README.md) | [简体中文](README.zh-CN.md)

A bilingual, keyboard-and-swipe learning runner through four seasonal communities. Keep moving, collect coins, and learn how to recognize inappropriate posts.

## Run and build

Use Node.js 22.13+ (Node 24 recommended). Run these commands from the repository’s `src/` directory:

```sh
npm ci
npm run dev -- --port 3001
npm run build
npm run preview
```

Upload every file inside `dist/` to any static web server. The build uses relative asset URLs and works in a subdirectory with a trailing slash. `vercel.json` configures the Vite build; `deploy/nginx.conf` is an example for your own server. No server, API key, or database is required for gameplay.

## Learning flow

Obstacles are labeled comment cards: jump over low cards, slide under banners, and change lanes around tall stacks. Disruptive commenters chase the player after mistakes. Hitting a post opens a paused checkpoint with a fictional, redacted example, an explanation, a constructive response, and a more respectful rewrite. A protected collision consumes the shield normally; a fatal collision still ends the run after the lesson. A collision does not mean the player agrees with a post.

The lesson's reference links open public Bilibili moderation cases in a separate tab. A related real case is distinct from the fictional example; when no matching case has been verified, the link clearly points to the general archive. Live source pages can change and may require sign-in. This independent educational game does not represent Bilibili or predict moderation decisions.

The first launch follows the browser’s preferred supported language (English or Simplified Chinese). A manually selected language is remembered and takes priority on later visits.

## Saved progress

The game's browser storage keys use the `community-seasons-*` prefix. Builds on the same origin share these keys; use the [dedicated QA fixtures](../docs/QA.md) on their own origins when testing.

On Toy, signed-in players can sync their coin wallet, purchased booster inventory, skill unlocks, upgrade levels, equipped skill, best score, and last season across devices using the same account. Existing browser progress is kept until the player chooses which save to use. If local and cloud saves differ, the comparison dialog offers **Use cloud save**, **Use this device’s save**, or **Keep playing on this device only**. If cloud storage is empty, uploading existing browser progress also requires a choice. Choosing a save replaces the other complete save; balances and purchases are not added together.

The browser copy remains available when cloud storage or sign-in is unavailable. The home screen reports sync status and offers Retry or Enable cloud. Before a new run, the game checks for cloud changes; a late response cannot replace an active run. Local-only mode stays selected until the player enables cloud again. Standalone builds, including self-hosted copies, use browser storage and do not load the Toy SDK.

Current runs, run coin counters, distance, temporary boost timers, and skill charge are not resumed on another device. Language, sound, and onboarding preferences stay on each device.

Toy implementation notes: the SDK stores one versioned JSON value under `community-seasons-save-v1`, within the 1,024-byte value limit. Local changes are coalesced for about three seconds, and writes are serialized. Unique revisions and a read before each write detect changed cloud saves and request another choice when needed. Toy does not provide an atomic compare-and-swap operation, so truly simultaneous writes on separate devices can still race.

## Controls

- Arrow keys / WASD: change lane, jump, slide. Space also jumps.
- Phone: swipe left/right/up/down. Tap the skill button or double-tap the path to use a charged skill.
- E: permanent skill. P: pause. M: mute/unmute. B: store.
- Tap the booster icon buttons or use 1: Fresh Start; 2: Boundary Shield; 3: Shared Rewards; 4: Season Pass. Shield and Shared Rewards stay available throughout the run; Fresh Start and Season Pass work only in the first five seconds.

Each season has its own background score. Normal speed builds to 5.5×, short coin trails offer routes across multiple lanes, and a short celebration appears when you beat your previous best score. Review pauses freeze all run timers. See `GAMEPLAY.md` for details.

Road forks turn left or right, and occasional Community Express cart rides replace dodging with 3–4 lane-choice questions. Gates preview the next activity; after the final correct answer, the cart continues through the same exit gate and a tunnel in the season’s colors returns the player to running. Cart pace and rewards scale with normal run progression while question reading time stays unchanged. Distance and score continue accumulating on the railway. Each season has its own landmarks and structures. Obstacle spacing mixes irregular bursts and breathing room, with shorter clearances around turns and stations. Road power-ups are farther apart, with randomized spacing that accounts for running speed. Edge mistakes use an inward recoil and a half-second protection window. See GAMEPLAY.md for the full rules.

The railway draws from 47 bilingual teaching questions using a session deck that avoids recent repeats, including across deck refills and retries. Edit `lib/game/rail-questions.json` to review questions, choices, correct answers, and explanations. See [QUESTION_BANK.md](QUESTION_BANK.md) for the field guide and validation commands. The development server and production build synchronize this JSON into the game before starting.

## Project license

The game's own source code is licensed under the repository's [MIT License](../LICENSE). Every production build copies that notice verbatim into `dist/LICENSE` and embeds it as an inert text block in `dist/index.html`. The HTML copy preserves the notice on hosts such as Toy that do not serve standalone license files. Include the complete build when distributing the game; maintain the root `LICENSE` as the single source for both copies.

## Dependency licenses

The Open-source licenses button sits below the game and controls. Its searchable panel loads `public/open-source-licenses.json` only when opened and shows original notices inline, with no hyperlinks or external navigation. URLs within the original license texts remain plain text. Opening it pauses an active run. `public/THIRD-PARTY-NOTICES.txt` also contains the complete notices as a developer/distribution artifact. Both files cover installed packages in this project's npm lockfile, including transitive dependencies and development tools. The production/development labels describe npm dependency classification; they do not claim every listed package is included in the browser bundle. Optional platform packages that were not installed are listed separately. External platform services and tools in the separate fuzz/phone-test workspaces are outside this inventory.

After `npm ci` or a dependency update, run `npm run licenses:generate`; `npm run licenses:check` verifies freshness. Production builds generate the inventory before type checking and bundling. Missing mandatory packages, unresolved licenses, changed pinned supplements, or stale output fail validation. Generation does not use the network and keeps copyright lines and nested third-party notices verbatim.

Rolldown npm archives can omit native-package license files and referenced third-party notices. Verified upstream originals are retained in version-specific directories under `scripts/license-supplements/`, with source URLs in the generated notices and pinned SHA-256 checks in `scripts/licenses.mjs`. Check `package-lock.json` for the installed version and the generator for supported supplement versions. Keep earlier verified directories when adding a new release; do not substitute generic license templates.

The generator is reusable without installing additional tools. See [LICENSE_GENERATOR.md](scripts/LICENSE_GENERATOR.md) for standalone usage against another npm project, custom output folders, and validation in CI.
