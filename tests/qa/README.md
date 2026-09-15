# Cross-platform QA

[English](README.md) | [简体中文](README.zh-CN.md)

Run commands from the repository root with Node 24. The general preview imports the current `src/` game. It does not load the Toy SDK or contact cloud storage; browser saves are mapped to `qa-community-seasons-v1:` before the game starts. Production storage keys are unchanged.

## Build and check

```sh
npm run setup
npx playwright install chromium webkit
npm run build
npm run qa:build
npm run qa:test
npm run qa:all
```

The build writes `qa-build-info.json` with hashes of the game, preview and dependency lockfiles, and embeds the same record in the preview HTML. The loaded probe captures an immutable copy in `build`; fetching a newer manifest cannot relabel an older page. Browser checks reject missing or stale build records before launching; after source or dependency changes, run `npm run qa:build` again. A source change during compilation also fails the build, so reports describe the sources that produced the tested preview.

Use `qa:web`, `qa:android`, or `qa:ios` for one browser profile. Web uses Chromium desktop, Android uses Chromium touch emulation, and iOS uses WebKit touch emulation. Each checks English and Simplified Chinese with a fresh browser context, a dedicated local server, and no external requests. These are simulations, not physical-device performance measurements. The runner records and corrects a demonstrated WebKit emulation inconsistency where a portrait screen reports a 90-degree angle, including when WebKit replaces the orientation object after initialization. Consistent landscape values are preserved. iOS simulation covers taps and UI flows; native swipes, rotation and performance require a physical device. Reports and screenshots are saved in timestamped folders under `results/qa/`.

Browser smoke checks install Playwright's clock before loading the page and pause it before starting gameplay. Keyboard and touch events still reach the real game; bounded clock advances run its animation callbacks. The pause check advances 300ms and requires unchanged distance, while resuming must increase distance after another 250ms. Android/English also waits six seconds of host time during the input sequence and verifies that this delay cannot move or end the run. This prevents slow CI input delivery from reaching a random obstacle before the pause check. Reports label timer/frame samples as synthetic; they are not performance measurements. Interactive previews and the physical-device inspector keep their normal clocks.

Startup waits for the game's locale initialization to update `html.lang`; the report records the initial document language and the browser's requested languages. Before gameplay, the clock freezes at the observed page time without fast-forwarding outstanding timers. Regression tests exercise this transition against the installed Playwright clock, including slow control messages.

## Interactive and device checks

```sh
npm run qa:preview                       # Built preview at http://localhost:4175/
npm run qa:preview -- --host 0.0.0.0     # Explicitly expose it to a test phone on your LAN
npm run qa:serve                         # Source preview with hot reload, for development
```

Open the exact QA preview in the phone's normal browser. Keep it unlocked and tap the real game before taking measurements. The QA menu exports frame-cadence/error diagnostics without save values. Frame count and maximum gap cover every visible interval since reset, including the delay until the first callback, using fixed memory. P95 is a conservative upper bound from 1ms histogram bins; gaps over 60 seconds share an overflow bin bounded by the observed maximum. Reports label this approximation explicitly. Use the built preview for measurements; hot reload and desktop emulation do not establish native performance.

For Android, enable USB debugging, authorize this computer, open Chrome, then expose its inspector with `adb forward tcp:9222 localabstract:chrome_devtools_remote`. For iOS, enable Safari Web Inspector and run a local Web Inspector-to-CDP bridge, for example `pymobiledevice3 webinspector cdp --host 127.0.0.1 --port 9223`. These device tools are external prerequisites, not game dependencies. See the [upstream iOS bridge guide](https://github.com/doronz88/pymobiledevice3/blob/master/docs/guides/webview-debugging.md).

```sh
# Replace the page URL with the exact preview opened on the phone.
npm run qa:device -- --platform ios --endpoint http://127.0.0.1:9223 --page http://YOUR_LAN_IP:4175/ --action list
npm run qa:device -- --platform ios --endpoint http://127.0.0.1:9223 --page http://YOUR_LAN_IP:4175/ --target TARGET_ID --action status
npm run qa:device -- --platform ios --endpoint http://127.0.0.1:9223 --page http://YOUR_LAN_IP:4175/ --target TARGET_ID --action measure --seconds 10
```

For Android, use `--platform android` and the Android inspector endpoint. `screenshot` is also available where the bridge supports it. Preview URLs must have no query parameters, credentials or fragments, since the selected URL is recorded in reports. Target discovery returns only exact URL matches. Every selected-page action checks the exact frame, QA marker, isolated storage prefix and disabled cloud provider; missing/ambiguous targets are rejected. Commands never navigate, reset game progress or operate another tab. Before resetting diagnostics, measurements require embedded build hashes matching the current checkout. They reject hot-reload pages and stale builds, recheck the loaded build throughout collection, and check local sources again before saving. Rebuild and reload the selected page after edits. Status and screenshots remain available but explicitly label unbuilt or stale provenance. Measurements also stop if the page loses visibility, focus or real user activation. Visibility-loss, pagehide and blur events stay latched until diagnostics are reset, so briefly leaving and returning between polling checks still invalidates the capture. Device reports retain the observed user agent and selected platform; attach hardware evidence when making a physical-device claim.

The same built `tests/qa/preview/dist/` can run on an authorized isolated host preview with relative asset paths. It must never replace the production Toy or `src/dist/`. Keep hosted preview access protected and retain the exact selected preview URL locally. A Toy preview wrapper is supported by the device inspector, but production Toy URLs are rejected.

## Layout and maintenance

| Path | Purpose |
| --- | --- |
| `preview/` | General source-backed preview, isolated saves, disabled Toy SDK, bounded diagnostics |
| `web/` | English/Chinese desktop and touch browser smoke checks |
| `devices/` | Explicit Android/iOS target selection, guarded CDP actions and protocol tests |
| `tests/` | Save-isolation and built-preview regressions |
| `archive/` | Historical feature-specific scenarios, retained as runnable references |

Production build guards reject imports from `tests/qa/` and QA marker strings. Keep new test controls here, not in `src/`. Run `npm run build`, `npm test`, `npm run qa:build`, `npm run qa:test` and the relevant browser profiles after changes. For gameplay/fuzzing, see the [QA guide](../../docs/QA.md).

Archived scenarios retain their original behavior and dedicated origins. The licenses, Android text and boost-control previews check their exact local origins before game startup and reset only their own QA storage prefixes; existing player and unrelated keys stay intact. The dated iPhone cloud harness can use its isolated Toy test keys. Read their code and instructions before running them. Their old measurement dates and device-specific assumptions are historical, not current validation results.

```sh
npm run qa:archive:phone:build
npm run qa:archive:iphone:build
node --test tests/qa/archive/phone-cart-fix-qa/*.test.mjs tests/qa/archive/iphone-qa/*.test.mjs
npm run qa:archive:licenses:serve         # Separate terminal
npm run qa:archive:licenses
npm run qa:archive:android:serve          # Separate terminal
npm run qa:archive:android
```
