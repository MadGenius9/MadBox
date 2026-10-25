# MadBox

A browser god simulator built with TypeScript, Vite, and PixiJS 8. Shape seeded worlds, populate them with five species, watch settlements gather resources and expand, and intervene with terrain brushes, blessings, and disasters.

## Run

Requires Node.js 22.12+ (Node 24 recommended).

### Windows first launch

1. Install Node.js 22.12 or newer manually from [nodejs.org](https://nodejs.org) if needed.
2. Extract the complete MadBox ZIP into a normal folder.
3. Double-click **StartMadBox.cmd**. On the first launch, press **Y** if you want it to download the project's locked packages. It asks before installing anything.

MadBox opens in your browser. Keep the launcher window open while playing; press **Ctrl+C** there to stop it. This is a launcher for the browser game, not a native Windows executable. If startup fails, the window keeps the error visible. The launcher does not install Node.js, change global settings, or clear saves.

It uses a fixed local address and port so saves stay associated with the same browser origin. If another server occupies port 5173, it reports an error instead of silently opening a different save location. Use the same browser when returning to your world.

For manual setup in PowerShell, use `npm.cmd` so PowerShell does not try to execute the blocked `npm.ps1` wrapper. No execution-policy changes are needed:

```powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
```

### Terminal launch

```sh
git clone https://github.com/MadGenius9/MadBox.git
cd MadBox
npm ci
npm run dev -- --host 127.0.0.1 --open
```

```sh
npm test          # simulation, generation, powers, persistence and soak checks
npm run build    # strict TypeScript check and production bundle
npm run preview  # serve the built game
```

## Play

The starting world contains humans, elves, orcs, sheep, and wolves. Civilizations form automatically. Select a tool in the bottom palette, then paint or tap the world. Scroll to zoom, right-drag to pan, or drag with the inspect tool. On touch devices, use two fingers to pan and pinch. Space pauses; 1–4 selects simulation speed; Home fits the map; +/− zooms; arrow keys pan; Ctrl/Cmd+S saves.

Generate continents, island chains, or a single landmass at three map sizes with a repeatable numeric seed. The chronicle records founding, diplomacy, wars, and disasters. Inspect creatures and towns to understand their needs; turn on borders to follow territorial expansion.

Saves stay in this browser on this device, with automatic saving every minute. Save before loading another world. The generator starts a new world without immediately overwriting your existing save; the next autosave will replace it. Audio is opt-in and synthesized locally. No account, server, API key, or external art download is needed.

Your last saved world restores automatically on reload. If a damaged save is found, autosaving stays disabled until you explicitly save or create a new world. Development and preview ports use separate browser storage.

## Browser validation

With the development server running on port 5173, `npm run test:browser` exercises painting, life, powers, time control, world generation, inspection, save/load, camera controls, and the mobile layout. It writes screenshots to `test-results/`.

`npm run test:browser:touch` uses the production server on port 5174 to check native touch painting, pinch navigation, and audio settings.

With `npm run preview -- --port 5174` serving a production build, `npm run test:browser:soak` runs the real game through 30 simulated minutes at 10× speed, applies a disaster, and verifies saving and restoration with hundreds of creatures. This is automated gameplay validation; human assessment of pacing and enjoyment is separate. Browser scripts use `/usr/bin/chromium`, or the executable specified by `CHROMIUM_PATH`.

## Architecture

- `src/types.ts`: serializable world model and deterministic random generator.
- `src/world/`: seeded biome/elevation generation.
- `src/sim/`: fixed 10 Hz creature simulation and batched civilization economy/diplomacy.
- `src/render/`: PixiJS presentation, procedural sprite textures, camera, lighting and particles.
- `src/ui/`: accessible DOM controls, panels, minimap and menus.
- `src/systems/`: powers, local persistence and Web Audio.
- `src/main.ts`: integration, independent fixed-step clock, render loop, input and autosave.

Rendering never advances simulation state. Camera and particles are presentation-only; world RNG state survives save/load. The population cap is 700; map sizes are 96×72, 128×96 and 192×144. Hidden tabs suspend simulation instead of trying to catch up on return. Detail documentation lives in `docs/`.

## Scope

This is an original procedural sandbox: graphics and sounds are generated in code. Kingdom economies, diplomacy and combat are intentionally lightweight; entities use local navigation with bounded obstacle search rather than global strategic planning. Graphics quality and sustained frame rate depend on browser/GPU hardware. Local saves are a single versioned slot and can be removed by clearing site data.
