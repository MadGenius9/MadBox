# MadBox civilizations

Civilizations evolve automatically after the player introduces humans, elves, or orcs. Three nearby citizens of the same species found a named kingdom within the next two-second economy update. A lone citizen can become a founder after the world has run for forty simulation seconds. Animals remain independent.

## Ownership and cadence

`src/sim/civilizations.ts` exports `tickCivilizations(world)`. Call it after `tickWorld(world)` on each fixed 0.1-second simulation tick. It performs economy work every 20 ticks, construction and territorial growth every 100 ticks, and new diplomatic decisions every 500 ticks. Ongoing wars are checked every 100 ticks so an exhausted kingdom can seek peace before its population disappears.

The simulation owns JSON-serializable entities, buildings, kingdoms, and terrain ownership. Rendering only reads these values. Kingdom ID zero means an unaffiliated citizen or unclaimed terrain. Positive IDs are allocated using the shared `world.nextId`. All randomness uses the saved world random state, so identical worlds receiving identical commands develop identically.

## Settlements and resources

A founder establishes a hall and claims nearby walkable land. Local citizens join same-species kingdoms within 25 tiles; distinct species retain distinct cultures. Each economy update collects food according to local fertility and timber according to woodland access. Farms add renewable food production. Available food reduces citizen hunger. The core simulation also allows grazing and emergency feeding.

Kingdoms build farms, houses, then towers as their populations and timber stocks permit. Placement searches for walkable, unburning sites, avoids overlapping structures, and respects foreign territory. Town building searches and territory radii grow with population. Resource stocks are bounded at 9,999, buildings at 60 per kingdom, and kingdoms at 16 per world.

Building health and terrain remain authoritative. Destroyed structures and buildings flooded by the player are removed. Surviving citizens can rebuild a hall with 18 timber. A collapsed kingdom stays in historical data, but its territory is released and the chronicle records its fall once.

## Diplomacy and conflict

Relations are symmetric values: zero is neutral, positive values indicate goodwill, values at or above 0.7 form an alliance, and -1 indicates war. The entity simulation treats values below -0.5 as hostile.

New kingdoms receive four peaceful development years before declaring wars. Nearby, established kingdoms may develop alliances or declare wars across species; orcs have a higher conflict tendency. A kingdom does not initiate a war against an overwhelmingly larger or smaller population. Alliances protect their members against random declarations. Conflicts end through war exhaustion or diplomacy, and heavily outnumbered kingdoms seek peace on the faster ongoing-war cadence.

Civilization is intentionally a sandbox rather than a competitive strategy game: the player can change the balance through spawning, terrain barriers, blessings, disasters, or direct destruction. Territorial coloring is an optional visual overlay; ownership persists when that overlay is hidden.

## Validation

`tests/civilizations.test.ts` covers founding and economy development, deterministic growth, collapse and territory release, distinct cultures, rebuilding destroyed halls, and peace for an exhausted population. The simulation soak test exercises the integrated world, creatures, civilization, and environmental systems over thirty simulated minutes. Runtime duration and simulated duration are different: increasing game speed runs additional fixed ticks rather than changing the tick size.
