# MadBox validation

Validated on 2026-10-24 with Node.js 24 and Chromium in the cloud workspace.

## Automated checks

- Clean dependency install with `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` completed.
- `npm run build` passed strict TypeScript checking and produced the Vite production bundle.
- All 55 tests passed: generation, 30 representative map stress cases, creature behavior, civilizations, powers, corrupted saves, large-world compression, and two 18,000-tick simulation runs. No skipped or disabled tests.
- Large world with 700 creatures saved exactly: 4,056,516 JSON characters became 375,528 compressed UTF-16 characters. Legacy JSON saves load, and damaged compressed payloads are rejected.
- Browser smoke passed terrain painting, life spawning, all eight intervention tools, pause and speed, generation, save/load, inspector, camera controls, and mobile layout. No page errors.
- Mobile touch passed tap painting, non-destructive two-finger pinch/pan, and audio settings toggling. No page errors.

## Sustained browser run

The actual production game ran at selected 10× speed through 18,048 ticks (30 simulated minutes), including a meteor intervention, followed by saving and reloading. It completed in 190.323 wall seconds with no page errors. The world finished with 576 creatures, three living kingdoms and 180 buildings; population peaked at 657 in the recorded samples.

The cloud browser uses CPU-based SwiftShader. Recorded HUD samples were 37, 49, 45, 45, 3 and 41 FPS. These are momentary samples, not a frame-time benchmark, and the low sample shows that software rendering can still stall. Hardware GPU performance is not established. Rendering adapts its framebuffer resolution, while the DOM interface stays sharp and the simulation clock runs independently of drawing.

Screenshots and the detailed browser report are generated under ignored `test-results/`: `madbox-title.png`, `madbox-desktop.png`, `madbox-mobile.png`, `madbox-mobile-touch.png`, `madbox-year-13.png`, `madbox-year-37.png`, and `browser-soak.json`.

## Remaining assessment

Automated 30-minute simulation coverage does not establish that a human finds 30 minutes enjoyable. Human pacing/playability assessment, comparison of the art direction against the visual reference, and representative hardware testing remain separate review activities. The implementation is a playable local sandbox with lightweight economies and diplomacy, bounded pathfinding, a population ceiling, and a single local save slot; these tradeoffs are documented in the system guides.
