# Isolated outfit matrix

This fixture imports the current production renderer, engine, cosmetics, and
travel components. It is separate from `src/dist`; production has no matrix
globals, scene overrides, or fixture controls. The renderer page never reads or
writes saves. The functional companion redirects storage to its QA namespace
before loading production modules and aliases the Toy cloud client to the
existing disabled QA implementation.

`cases.ts` enumerates all five skins × four hat choices × four shoe choices ×
four effect choices × four seasons: 1,280 cases per browser engine. `none` is a
choice in each accessory slot. Every built page embeds exact source SHA-256
hashes; the build also emits `qa-build-info.json` and
`outfit-matrix-manifest.json`. Rebuild if any recorded source changes.

Build with `npm run qa:outfit:build`. The runner (`npm run qa:outfits -- --help`)
serves the built fixture, selects catalog IDs, collects screenshots and outcomes,
and checks the separate functional companion. Opening `index.html` from the
fixture server also exposes a visible case selector and live evidence. A Vite
development page is inspectable but cannot start a measured case without build
provenance.

`--workers` is the total concurrency pool, divided into per-browser limits.
Use `npm run qa:outfits -- --engine all --workers 16` for at most eight active
Chromium cases and eight active WebKit cases. A faster browser cannot borrow
the other browser's slots. Limits are recorded in the checkpoint and progress page.

## Measurement contract

`window.__communitySeasonsOutfitMatrix` is confined to this fixture. It exposes
`cases()`, `requirements()`, `start(caseId, durationMs = 60000)`, `snapshot()`, and
`stop(reason)`. Duration is an integer from 60,000 to 3,600,000 milliseconds.
Elapsed time comes from native `performance.now()` and drawing uses native
`requestAnimationFrame`; no clocks are accelerated or replaced. Longer durations
repeat the 60-second authored stage sequence.

Each sequence includes all four obstacle models, jumping, sliding, lane motion,
edge recoil, both actual fork turns, railway gate approach and engine boarding,
question/feedback/fall/complete rendering, return travel, seasonal gate approach
and engine travel, a paused pose, and resumed running. The railway question,
feedback, fall, and complete stages are prepared renderer states; they do not
claim to test question answer input. `functional.html` separately mounts the
production App and exercises its real answer controls and transition flow.

Every frame validates finite Canvas2D numeric calls. Periodic checks validate
finite faces and projections, bounded caches, restored composition, equipped
appearance, and nonblank image samples. Coverage counts refer to observed
rendered states. Snapshots include real elapsed time, frame interval statistics,
five-second frame counts, visibility/focus, viewport, source hashes, errors, and
canvas sample counts. A hidden page or frame interruption over one second fails
the case. These are desktop browser checks, not native-device timing evidence.

The runner records each completed case separately for resumability. A short
pilot is a subset of cases with the same full real duration, never an accelerated
substitute for a completed matrix.

Source changes stop scheduling and mark healthy active cases as interrupted,
including the worker that first detects the change. Active renderer and functional
checks still capture and validate their final state: real fixture failures, page
errors, and blocked external requests remain failures during interruption.
Stopped renderer captures of at least three seconds must also meet the 15 FPS
cumulative average; the last cadence window of at least three seconds must meet
8 FPS. Shorter captures are not judged for average cadence. Interrupted attempts
do not need completed duration or coverage and never count as passes.
