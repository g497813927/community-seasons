# Toy leaderboard

[English](LEADERBOARD.md) | [简体中文](LEADERBOARD.zh-CN.md)

Community Seasons uses Toy board **2** for the current difficulty rules. The game shows **Today** and **This week** only. Every list and personal-rank request supplies both the board and period explicitly; there is no all-time view, query or import of a saved personal best. Players join once for their Toy account before fresh eligible runs can be submitted automatically across devices.

## Privacy and consent

Every player name is displayed as **Hidden name**, with no account avatar or profile link. The game does not request user profiles for the leaderboard. Names and avatars returned by Toy are discarded before rows reach the game UI.

This is privacy within the game's display, not anonymous submission to Toy. Submission still uses the player's signed-in Bilibili account, and Toy may request its own data consent. Explain both account use and future automatic submissions before **Join leaderboard & post this score**. No score may be submitted before the player explicitly chooses that action and completes any required Toy consent.

Participation is stored only in the account's separate Toy cloud key, `community-seasons-leaderboard-consent-v1`, as a strict JSON object `{ "version": 1, "enabled": true }` or `{ "version": 1, "enabled": false }`. Do not use `localStorage` for consent. This key is independent of the progression save: changing it must not replace balances, purchases, outfits or best scores.

The first join submits the current eligible run after Toy consent, then enables the cloud preference only after the submission is confirmed successful. Automatic participation starts only after that preference is also confirmed saved. If the score posts but saving the choice fails, report both facts: the score is already posted, but automatic submission remains off. Retrying the choice save must not post that score again.

Read the cloud preference at initialization, when opening the leaderboard, and before each eligible automatic submission. Missing consent never enables participation; unavailable or malformed cloud data also leaves automatic submission off and keeps the run local. Do not fall back to a device-local consent value. A valid enabled preference allows each later newly completed eligible run to submit once, including on another device signed into the same account. The normal flow needs no per-run button or game consent prompt; Toy can still require renewed platform permission.

Choosing **Not now** or declining Toy consent saves `enabled: false` and keeps unsubmitted scores local. If the score was already accepted before a preference-save failure, choosing Not now disables future automatic submissions; it does not withdraw that accepted score. If the disabled-preference write fails, keep automatic submission off and show that the choice could not be synchronized. Closing the invitation does not enable participation. Players can join later. A failed or uncertain first submission must not enable consent, and declining must not trigger an automatic retry. Reloading the page, reading saved progress or enabling cloud sync must never submit a stored best or the previous session's last run. A player can read the public leaderboard and keep playing without joining.

The current SDK accepts no custom name, anonymous flag or per-entry privacy setting. Its host relay rejects denied consent with `type: 'user_denied'`. Hiding a name locally cannot alter account data held or returned by Toy. Do not infer identity from rank, score or avatar. See the [official SDK documentation](https://www.bilibili.com/toy/publish/sdk) and [host relay](https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-host.js).

## API contract

Checked on 2026-09-21 against the user-provided `toy.d.ts` and `toy-js-sdk-abilities.md`, the [official documentation](https://www.bilibili.com/toy/publish/sdk), and the [live SDK](https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js).

| API | Parameters and result |
| --- | --- |
| `submitScore` | `{ board, score }` → `{ score }`. Requires login and platform consent. The request is an absolute score, not an increment. |
| `getRankList` | `{ board, period, limit }` → `{ rank, score, nickname, avatar }[]`. Public read; maximum 100 rows. |
| `getMyRank` | `{ board, period }` → `{ ranked, rank, score }`. Requires login. Use `ranked` to distinguish no entry. |

Toy accepts integer scores from −16,777,216 to 16,777,215. The game additionally requires positive run scores that pass its integrity checks. Toy orders scores descending and breaks ties by earliest achievement. Higher submissions replace a player's previous best; lower submissions do not erase it. Duplicate submissions still consume request quota.

Toy supports periods `all`, `month`, `week` and `day`, defaulting to `all`. This integration allows only `day` and `week`. `submitScore` has no period argument and returns the all-time best; ignore that value when showing the selected period and read `getMyRank` for that period instead. **Toy still maintains an all-time record internally.** The SDK provides no way to disable that storage while using its leaderboard.

The supplied declaration and abilities snapshot describe boards 1–3. The current documentation table and SDK validation allow boards 1–5; board 2 is within both contracts. The [documentation bundle checked on this date](https://s1.hdslb.com/bfs/static/toy/app/publish/assets/index-DBBHFmUO.js) contains the current table. Public rows have no timestamp, ruleset ID, run proof or stable user ID. A later incompatible difficulty revision therefore needs another unused board, rather than mixing results in board 2. The SDK has no board-reset API.

Load leaderboard rows on demand and refresh on player request. After a confirmed join and cloud preference save, recheck cloud consent before submitting each eligible fresh run once at completion. Catch unavailable, signed-out, denied, timeout and invalid-response cases without interrupting gameplay. Toy rate limits can report `type: 'http_error', code: 307044`; avoid polling, overlapping submissions and immediate retry loops. Do not send saved-best values during cloud reconciliation or replay previous-session runs.

## Score validation boundary

Client safeguards check that a run began in this game session, reached a completed state, and has consistent score, distance, earned coins and elapsed time within the game's numeric and movement limits. Saved records and imported cloud best scores are not eligible. Validate the result before calling the SDK, and prevent duplicate submissions of the same completed run. Invalid scores must be rejected, not clamped into a valid top score.

In particular, setting a local-storage best to **999,999,999,999,999** cannot create an eligible run or cause a leaderboard upload, including after reload with participation already remembered. A forged submission object with that value is rejected before any leaderboard SDK access. Only an integrity receipt from an actual completed run in the current page session can reach the submission path; remembered participation is permission, not proof of a score.

These checks catch accidental corruption and simple score edits through the normal game flow. **They are not trusted server validation.** Toy's public submission API receives only a board and score; it has no signed-run token, replay proof or developer validation callback. Someone controlling the browser can bypass this client and invoke the SDK directly. A checksum or secret shipped in the game would not fix that trust boundary. Strong prevention requires an authoritative validation service and a platform submission path that cannot bypass it; neither is provided by this integration.

Treat returned scores as untrusted data too. Reject malformed or unsupported values, but do not label every plausible result as verified. Toy's creator management UI offers score removal and write restrictions; these are separate moderator actions, not automatic gameplay validation. They can affect a user's scores across every board of the current Toy and must not run from the game.

## QA and release

Use isolated SDK fixtures for supported, unsupported, signed-out, denied, empty, malformed and failed responses. Cover both languages, keyboard and touch access, enlarged text, day/week switching, and hidden names and avatars. Verify no submission before joining, cloud enablement only after confirmed first success, preference rechecks before later automatic submissions, cross-device choices, and Not now or denied consent saving disabled. Check that unavailable/malformed consent prevents submission, preference-write retries cannot duplicate an already posted score, and consent writes never replace progress saves. Reload must not upload a saved best or last run. Include the exact **999,999,999,999,999** local-storage/forged-score case, duplicate prevention and invalid-run rejection. The generic QA preview must continue disabling Toy access and isolating saves; tests must not submit real scores or touch player cloud saves.

Run `npm test` for the run-integrity and SDK adapter regressions, and `npm run qa:leaderboard` for the isolated dialog fixture in Chromium and WebKit. The dialog runner builds its own fixture and blocks external network requests.

Changing this feature does not authorize publication, deployment or moderator actions. Follow the [QA guide](QA.md) and [release guide](RELEASE.md).
