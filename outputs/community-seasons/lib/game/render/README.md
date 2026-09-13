# Rendering components

`../render.ts` remains the public `Renderer` entry point. It owns per-canvas state,
preview caches and frame composition, and delegates drawing to these modules.
The components take that renderer explicitly; their `Renderer` imports are
type-only, so they do not create runtime import cycles.

| Change | Module |
| --- | --- |
| TV body, running, sliding, recoil and seated poses | `characters/runner.ts` |
| Chasing commenters | `characters/commenters.ts` |
| Cart body, boarding and falling passenger | `characters/cart.ts` |
| Seasonal roadside scenery and distant panorama | `scenes/spring.ts`, `summer.ts`, `autumn.ts`, `winter.ts` |
| Shared trees, water, lamps, benches, houses, markets and boats | `scenes/landmarks.ts` |
| Scenery template caching and placement on fork branches | `scenes/index.ts` |
| Seasonal colors, sky and ground | `styles.ts`, `environment.ts` |
| Running road and fork signs | `road.ts` |
| Railway tracks, answer gates and exit placement | `railway.ts` |
| Season portals and transport gate frames | `gates.ts` |
| Coins and power-ups | `collectibles.ts` |
| Comment-card obstacles and bilingual labels | `obstacles.ts` |
| Turn camera and course coordinates | `camera.ts` |
| Faces, boxes, projection and clipping | `geometry.ts`, `types.ts` |
| Face sorting, textures, fog and text painting | `paint.ts` |
| Boost overlays, lighting and travel tunnels | `effects.ts` |

Scenery components emit reusable geometry at depth zero. `scenes/index.ts` keeps
those templates on the renderer and places them along the current route each
frame. Preserve face order, layers and capture flags when editing shared drawing
code: they determine roof visibility, boardwalk supports and preview rendering.

From the workspace root, run `npm test`, `npm run test:types`, `npm run build`
and the bounded `npm run test:fuzz`. The QA compilers follow local TypeScript
imports, and fuzz reports include hashes of the extracted source modules.
