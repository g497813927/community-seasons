# QA and test guide

## Automated regression and fuzzing

After `npm run setup`, run `npm run build`, `npm test`, `npm run test:types`, and `npm run test:fuzz`. Test imports point at this workspace's single game source tree. The standalone original-project-preservation test was omitted because the unrelated Relic Rush project is intentionally outside this repository.

`npm test` runs deterministic regressions; the seed matrices and property tests are managed separately by `run.mjs`. See FUZZING.md. That document describes the original portable kit; in this workspace its source is live, not a frozen duplicate. Baseline hashes in snapshot.json are historical; edits are expected and current hashes are recorded. Never modify source during a stress session.

## Browser layout checks

Install the browser once:

```sh
npx playwright install chromium
```

Start a fixture server in one terminal and its tests in another, both from the repository root:

```sh
npm run qa:licenses:serve
npm run qa:licenses
```

```sh
npm run qa:android:serve
npm run qa:android
```

Licenses QA uses port 3029; Android large-text QA uses 3028. Tests write screenshots and JSON under their fixture directory. Text scaling is simulated in Chromium, not native Android hardware. The licenses suite checks lazy loading, original notices, no hyperlinks, focus, pause, retry and responsive layouts. Android QA checks result/pause layouts and high numeric values.

The local fixtures may clear storage **on their own local origin**; use their dedicated ports and clean browser profiles, not a player's production origin. Fixtures are not release builds.

## Physical iPhone / cart QA

`work/phone-cart-fix-qa/` is the focused cart harness; `work/iphone-qa/` retains the extended rendering/performance harness. Their bootstrap and SDK wrappers isolate test state from game saves. Build the focused harness with `npm run qa:phone:build`. Build the extended harness with `npm run qa:iphone:build`. Never upload either output as a production release. Obsolete font/DPR experiment scripts were not imported.

To run through Toy, upload a separate test preview when authorized. Create `work/phone-cart-fix-qa/preview.json` locally with `{"preview_url":"THE_ACTUAL_TOY_PREVIEW_URL"}`. For the extended harness, use `work/iphone-qa/preview-20260910.json`. These configuration files are Git-ignored; none contains an inherited preview or password.

The USB scripts require an independently configured Web Inspector/CDP bridge at `http://127.0.0.1:9223`; it is not bundled or automatically launched. Keep the wired iPhone unlocked, with normal Safari showing the exact isolated preview. A real tap on Start/Begin run is necessary for reliable Safari timing. Avoid a Safari Remote Automation session when the user needs to touch the page, since its testing popup interferes.

Run `node work/phone-cart-fix-qa/usb.mjs status` to inspect the selected preview. The script validates the exact preview and isolated QA context before actions. Read the script's supported commands before arming a test. Physical-device results must be freshly collected; historical device identifiers, recordings and raw outputs were not imported.

Manual checks should include all seasons, turning, boost expiry, cart approach/questions/exit, wrong-answer falls, share open/close, enlarged text, orientation, pause/resume and cloud-save conflict choices. Do not write real cloud saves merely to exercise a layout.
