# MadBox simulation

MadBox keeps a plain serializable `World` separate from PixiJS rendering and DOM UI. The renderer reads world state; the fixed simulation loop owns changes. Each world stores its seeded linear congruential random generator, monotonic IDs, terrain, entities, buildings, kingdoms, tick count, and recent chronicle events.

## Update order and time

Advance `tickWorld(world)`, `tickCivilizations(world)`, then `tickPowers(world)` once per fixed 100 ms step. Never multiply individual needs or movement by the rendering frame delta. Speed controls change how many fixed steps run, and pausing stops those steps. Simulation progresses only while the browser game runs; loading a save does not fast-forward elapsed wall time.

The browser controller advances an accumulator from a separate 100 ms timer; drawing uses `requestAnimationFrame`. A slow graphics driver therefore does not directly set simulation speed. Each timer callback has a bounded catch-up budget, and hidden tabs suspend the clock instead of building a backlog. Returning to the tab resets both time references.

One entity year is 500 ticks, or 50 seconds at normal speed. Civilizations work every 20 ticks; fire updates every five ticks. The 18,000-tick soak test represents 30 minutes of game time at normal speed, or 36 entity years.

## Entities

`spawnEntity` rejects unwalkable terrain and a world population above 700. Humans, elves, orcs, sheep and wolves share health (0–100), hunger (0–100, larger means hungrier), age in years, position in tile units, destination, reproduction cooldown in seconds, optional kingdom membership, and string traits.

Movement runs at a species-specific speed. Entities select nearby destinations, prioritizing vegetation when hungry. A bounded breadth-first search supplies a detour around unwalkable terrain when the direct step fails. It expands at most 180 nodes and therefore intentionally does not guarantee a path through arbitrarily large mazes. Nearby-entity queries use four-tile spatial buckets rather than global pairwise scans.

Grass and forest vegetation feed grazers and people. Kingdom stores provide additional food. Starvation, old age, disasters, combat and illness damage health; healthy, fed entities gradually recover. Reproduction needs a healthy adult of the same species and kingdom within three tiles, sufficient food, a cooldown, and a seeded chance. Newborns start at age zero and wait until the following tick to update. Each kingdom supports a base 24 citizens plus four per house, two per farm, and four per tower, capped at 180; food shortages halve the additional building allowance. Unassigned people have a species ceiling of 32 until settling. Sheep and wolves have local density limits and world ceilings of 150 and 36 respectively. These soft reproduction limits slow growth before the global population ceiling of 700; player spawning can still exceed a kingdom's natural birth capacity.

Wolves hunt sheep and may hunt people when starving. Sheep flee nearby wolves. Citizens attack neighboring enemy citizens only when their kingdoms' relation is below -0.5. Diplomacy owns the decision to start or end wars. Core combat handles damage and removes dead entities; civilizations refresh their population counts on their next economy update.

## Powers and environment

The core applies damage from burning tiles, the `plague`/`infected` traits, and the benefits of `blessed`. The powers system owns terrain mutation, immediate disaster impacts, fire spread and decay, burning structures, and sampled vegetation regrowth. Rain extinguishes and enriches terrain; blessing also removes illness. These operations use the world's saved random generator, preserving reproducibility for the same inputs and update order.

Terrain painting can strand entities or remove buildings' supporting terrain. Stranded entities take damage until they escape or die; the civilization and powers updates remove invalid structures. Kingdom IDs remain in history after collapse, while persistent object IDs are never reused.

## Validation

`tests/core.test.ts` checks deterministic replay, movement around water, population limits, hunting, illness, blessing, and war combat. `tests/soak.test.ts` runs the integrated generator, core, civilizations and powers for 18,000 ticks with 140 initial entities and scheduled fire, rain, meteor and blessing. A second 18,000-tick test reproduces the release starting world and verifies that all three civilizations remain alive. The checks cover finite normalized terrain, finite entity state, unique persistent IDs, symmetric diplomacy, valid resources and positions, surviving population, and functioning farms.

Run `npm test`. The test launcher imports every `tests/*.test.ts` file through the `tsx` loader in one process, avoiding the CLI's IPC socket requirement in restricted cloud shells. For a scoped check, run `node --import tsx tests/core.test.ts`. The soak reports runtime and population snapshots; it measures the simulation without renderer overhead and does not replace browser performance or playability testing.
