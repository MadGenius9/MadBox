# MadBox powers, environment, and persistence

`src/systems/powers.ts` owns brush actions. `applyPower(world, tool, x, y, radius)` accepts tile coordinates, clips the circular brush to the world, and returns whether state changed and an optional rendering/audio effect key. Inspection does not mutate state. All random choices advance `world.rng`, so the same starting state and commands produce the same result.

## Powers

- Terrain: grass, forest, sand, water, mountain, snow, and desert replace tiles, reset ownership and fire, and establish sensible fertility, moisture, and vegetation. Forest and grass provide forage.
- Life: humans, elves, orcs, sheep, and wolves spawn only on walkable land. Brush size increases the number of creatures per dab, capped at eight. The core enforces the global population limit of 700.
- Fire: ignites walkable terrain. `tickPowers` runs environmental updates every five simulation ticks (twice per simulation second), consuming vegetation, spreading to neighboring vegetation, damaging buildings, and eventually extinguishing. Wet terrain burns out faster. Forest becomes grass when completely burned. The core separately applies creature fire damage every tick.
- Meteor: creates a sandy crater with a burning perimeter and destroys creatures/buildings within a minimum four-tile blast radius.
- Lightning: ignites terrain and destroys creatures/buildings in the selected radius.
- Earthquake: fractures a minimum six-tile radius into sand and mountains; damages creatures and buildings.
- Rain: extinguishes fire, increases moisture and fertility, encourages vegetation, and slightly heals creatures.
- Blessing: restores health, reduces hunger, cures plague, and grants the core's `blessed` trait. Blessed creatures heal and consume less food.
- Plague: adds the core's `plague` trait. The core handles damage and proximity transmission; blessing cures it.
- Erase: removes creatures, buildings, fire, vegetation, and ownership while retaining terrain.

Painting water or mountains underneath life does not teleport creatures. The core deals damage on unwalkable tiles; creatures can escape onto nearby walkable terrain. Creatures stranded in a large flooded area eventually die. Flooded or otherwise impassably placed buildings disappear on the next environmental update. Dead buildings are filtered after disasters and fire damage.

## Saves

`src/systems/storage.ts` uses the `madbox.world.v1` localStorage key. Serializable world JSON is compressed losslessly with `lz-string.compressToUTF16`, prefixed with `madbox:lz16:v1:` and an eight-character integrity checksum. This keeps large 192×144 worlds with hundreds of residents comfortably inside common browser storage quotas without rounding terrain or simulation numbers. The payload contains terrain, entities, buildings, kingdoms, event history, tick count, next ID, seed, and current RNG state. Renderer state, camera, sound, and live processes are excluded.

`saveWorld` validates before writing. `loadWorld` returns `null` when no save exists and rejects corrupted compressed payloads, malformed JSON, unsupported versions, mismatched tile arrays, invalid coordinates, malformed traits, missing fields, nonfinite numbers, and invalid RNG state. Original uncompressed v1 JSON saves remain readable and migrate to compression on the next save. Compression/decompression preserves the full JSON state exactly. Corrupt saves do not replace the current running world. Storage quota and browser privacy errors propagate to the UI for a visible message; the existing slot is untouched if preparing or writing a new payload fails.

There is one local save slot per browser origin. Saving manually or through autosave replaces that slot. Clearing browser site data removes it; saves are not synchronized to a server. Loading restores the simulation RNG, so its future random decisions remain reproducible.

## Audio

`GameAudio` uses Web Audio synthesis with no downloaded assets. Sound is disabled until the player opts in. A quiet three-note sine pad cycles through four chords, transitioning over seven to nine seconds, with a sixteen-second chord cadence and gently breathing volume. Action tones remain rate limited and play above the quieter pad. Graphics effects use the same action effect keys.

All sounds pass through one master gain. Enabling fades in; disabling fades out before suspending the context and clearing the chord timer. Rapid toggle changes cancel pending suspension, and enabling again reuses the existing pad instead of duplicating voices. Destroying the audio system clears timers, fades out, stops and disconnects all ambient/action oscillators, and closes the context. Audio stays independent of simulation RNG and state.

## Validation

`tests/systems.test.ts` exercises brush geometry, invalid coordinates, blessings/plague, destructive disasters, fire/rain, deterministic earthquakes, spawning restrictions, flooded buildings, and valid/corrupt save handling. Run with `node --import tsx tests/systems.test.ts`.
