# MadBox world generation

`src/world/generate.ts` exports `generateWorld(seed, width = 128, height = 96, style = 'continents')` and the `WorldStyle` type. It returns a complete serializable `World` with terrain, an initial chronicle entry, and empty entity, building, and kingdom arrays. The application seeds life after generation. Generation does not depend on browser APIs, rendering, wall time, or `Math.random()`.

## Map shapes and biomes

- **Continents:** a broad western landmass, an eastern landmass, and a small southern island. Noise can join nearby landmasses with natural bridges.
- **Islands:** nine irregularly placed landmasses in a loose archipelago. Neighboring islands may join, producing peninsulas and channels.
- **Pangaea:** one dominant central landmass with a broad connected interior.

Integer hashing and smoothly interpolated, four-octave value noise supply deterministic detail. A pair of noise fields warps island coordinates before elliptical landmass falloff is sampled. This breaks up regular outlines without introducing isolated single-tile noise everywhere. A second elevation field gives shore detail and interior ridges. An edge falloff always surrounds the map with deep ocean.

Elevation selects deep ocean, shallow water, sand, mountains, and snow. Latitude, elevation, and a temperature noise field influence highland snow. Moisture and temperature produce deserts, grasslands, and forests below the highlands. Fertility and vegetation are stored with each tile for simulation and rendering. Generation does not assign territory or fire.

The current biome thresholds are elevation `< .29` for ocean, `< .41` for shallow water, `< .445` for beaches, `> .645` for mountains, and `> .735` for summit snow. Cold highlands may become snow above `.65`. Low moisture and warm temperatures produce deserts; sufficiently moist, detailed lowlands produce forest. Other lowland interiors are grass.

## Seeds and dimensions

Finite numeric seeds normalize to unsigned 32-bit integers. The same seed, dimensions, style, and generator version produce the same world, including its name and initial RNG state. Different styles consume different amounts of seeded randomness, so subsequent simulation randomness can differ between styles. Save/load retains generated tiles and RNG state; it does not regenerate terrain.

The supported UI sizes are 96 × 72, 128 × 96, and 192 × 144 tiles. The generation API accepts integer dimensions from 16 to 512 inclusive and rejects invalid dimensions or nonfinite seeds. Memory and renderer performance should be considered before exposing larger dimensions in the UI.

The default world uses **seed 48271**, **128 × 96**, **continents**, named **Moonlit Reach**. Its three application-selected civilization starting locations are `(40, 37)`, `(16, 52)`, and `(45, 70)`. Each is surrounded by a fully walkable 7 × 7 area, and all lie on the same connected region of 5,166 walkable tiles. This gives the initial civilizations room to grow and access to one another. Mountain ridges remain obstacles; the main connected region includes the paths around them.

## Validation

Run `npm test` for the repository tests, or `node tests/world.test.ts` with Node 24 for generation tests alone. Tests cover repeatability, different seeds, all styles, ocean boundaries, bounded tile metadata, fertile land, dimensions, empty initial simulation arrays, and invalid arguments.

A broader development stress pass generated **270 maps**: 30 unsigned seeds for every combination of three styles and three UI sizes. Seeds followed `(Math.imul(index, 2654435761) + 48271) >>> 0`, with indices 0 through 29. All maps had valid tile counts, finite bounded elevations, ocean on every boundary, at least 10% and less than 80% walkable land, and at least 4% fertile terrain. No failures occurred. Observed walkable land ranged from **41.6% to 57.4%**; the lowest fertile fraction was **17.2%**. On the development machine, generation took at most about 24 ms in this pass; this is a local observation, not a hardware-independent performance guarantee.

Walkability uses the shared simulation rule: ocean, shallow water, and mountains block land creatures. Beach, desert, snow, grass, and forest are traversable. Generation guarantees a water boundary and substantial land in tested seeds; it does not promise every island is mutually reachable or every possible seed contains every biome.
