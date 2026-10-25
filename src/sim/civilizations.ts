import {
  addEvent,
  random,
  tileAt,
  walkable,
  type Building,
  type Entity,
  type Kingdom,
  type Species,
  type World,
} from '../types';

// Civilization work is deliberately batched: the simulation ticks at 10 Hz, while
// economies, settlement planning and diplomacy only need a two-second cadence.
const UPDATE_INTERVAL = 20;
const COLORS = [
  0xe7b75f, 0x6ed4bf, 0xd57d86, 0x9d9de5, 0x77b8e2, 0xd8a775, 0xa5c977, 0xdd9ccc, 0xe88b60,
  0x91aee6, 0x67c59d, 0xc8c17d,
];
const NAMES: Record<string, string[]> = {
  human: ['Amberreach', 'Havenwick', 'Goldhaven', 'Brightshore', 'Suncrest', 'Stonevale'],
  elf: ['Willowmere', 'Everspring', 'Moonbloom', 'Silverleaf', 'Thornveil', 'Mistwood'],
  orc: ['Ironfang', 'Emberhold', 'Ashclaw', 'Grimstone', 'Redspire', 'Stormhorn'],
};
const CIVILIZED = new Set<Species>(['human', 'elf', 'orc']);
const distanceSq = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function hallFor(w: World, id: number): Building | undefined {
  return w.buildings.find((b) => b.kingdom === id && b.kind === 'hall' && b.health > 0);
}

function claim(w: World, kingdom: Kingdom, x: number, y: number, radius: number): void {
  for (let oy = -radius; oy <= radius; oy++)
    for (let ox = -radius; ox <= radius; ox++) {
      if (ox * ox + oy * oy > radius * radius) continue;
      const tile = tileAt(w, x + ox, y + oy);
      if (walkable(tile) && tile && !tile.owner) tile.owner = kingdom.id;
    }
}

function foundKingdom(w: World, founder: Entity): Kingdom {
  const id = w.nextId++;
  const names = NAMES[founder.species];
  const sameSpecies = w.kingdoms.filter((k) => k.species === founder.species).length;
  const kingdom: Kingdom = {
    id,
    name:
      names[sameSpecies % names.length] +
      (sameSpecies >= names.length ? ` ${sameSpecies + 1}` : ''),
    species: founder.species,
    color: COLORS[w.kingdoms.length % COLORS.length],
    population: 0,
    food: 45,
    wood: 24,
    age: 0,
    relations: {},
  };
  for (const other of w.kingdoms) {
    const disposition = other.species === kingdom.species ? 0.4 : 0;
    kingdom.relations[other.id] = disposition;
    other.relations[kingdom.id] = disposition;
  }
  w.kingdoms.push(kingdom);
  const x = Math.floor(founder.x),
    y = Math.floor(founder.y);
  w.buildings.push({ id: w.nextId++, x, y, kingdom: id, kind: 'hall', health: 160 });
  claim(w, kingdom, x, y, 5);
  for (const entity of w.entities) {
    if (
      !entity.kingdom &&
      entity.species === founder.species &&
      distanceSq(entity, founder) < 22 ** 2
    )
      entity.kingdom = id;
  }
  addEvent(w, `${kingdom.name} is founded. A new civilization takes root.`, 'kingdom');
  return kingdom;
}

function settleUnclaimed(w: World): void {
  const halls = w.kingdoms.map((k) => ({ kingdom: k, hall: hallFor(w, k.id) }));
  for (const entity of w.entities) {
    if (
      !CIVILIZED.has(entity.species) ||
      entity.kingdom ||
      !walkable(tileAt(w, entity.x, entity.y))
    )
      continue;
    let nearest: Kingdom | undefined;
    let best = 25 ** 2;
    for (const { kingdom, hall } of halls) {
      if (!hall || kingdom.species !== entity.species) continue;
      const distance = distanceSq(entity, hall);
      if (distance < best) {
        best = distance;
        nearest = kingdom;
      }
    }
    if (nearest) {
      entity.kingdom = nearest.id;
      continue;
    }
    // A lone settler can eventually found a village too, so small player-created
    // populations don't become permanently stuck waiting for another spawn.
    const neighbors = w.entities.filter(
      (e) => !e.kingdom && e.species === entity.species && distanceSq(e, entity) < 18 ** 2,
    );
    if (w.kingdoms.length < 16 && (neighbors.length >= 3 || w.tick >= 400)) {
      const kingdom = foundKingdom(w, entity);
      halls.push({ kingdom, hall: hallFor(w, kingdom.id) });
    }
  }
}

function buildingSite(
  w: World,
  kingdom: Kingdom,
  hall: Building,
  kind: Building['kind'],
): { x: number; y: number } | undefined {
  // A stable randomized search avoids scanning the whole world each update.
  for (let trial = 0; trial < 30; trial++) {
    const radius =
      Math.min(19, 6 + Math.ceil(Math.sqrt(kingdom.population))) + (kind === 'farm' ? 2 : 0);
    const x = Math.floor(hall.x + (random(w) * 2 - 1) * radius);
    const y = Math.floor(hall.y + (random(w) * 2 - 1) * radius);
    const tile = tileAt(w, x, y);
    if (!walkable(tile) || !tile || tile.fire > 0 || (tile.owner && tile.owner !== kingdom.id))
      continue;
    if (kind === 'farm' && tile.fertility < 0.2) continue;
    if (w.buildings.some((b) => distanceSq(b, { x, y }) < 5)) continue;
    return { x, y };
  }
}

function economy(w: World, kingdom: Kingdom, citizens: Entity[]): void {
  const previousPopulation = kingdom.population;
  kingdom.population = citizens.length;
  kingdom.age += 0.002 * UPDATE_INTERVAL;
  const hall = hallFor(w, kingdom.id);
  if (!citizens.length) {
    // Keep historical kingdoms for the chronicle and renderer, but release their
    // territory once. Occupation of ruins is possible after a collapse.
    if (previousPopulation > 0) {
      addEvent(w, `${kingdom.name} has fallen silent. Its people are gone.`, 'death');
      for (const t of w.tiles) if (t.owner === kingdom.id) t.owner = 0;
      kingdom.food = 0;
    }
    return;
  }
  if (!hall) {
    const founder = citizens.find((e) => walkable(tileAt(w, e.x, e.y)));
    if (founder && kingdom.wood >= 18) {
      w.buildings.push({
        id: w.nextId++,
        x: Math.floor(founder.x),
        y: Math.floor(founder.y),
        kingdom: kingdom.id,
        kind: 'hall',
        health: 160,
      });
      kingdom.wood -= 18;
      addEvent(w, `${kingdom.name} rebuilds its great hall.`, 'kingdom');
    }
    return;
  }
  const structures = w.buildings.filter((b) => b.kingdom === kingdom.id && b.health > 0);
  const farms = structures.filter((b) => b.kind === 'farm').length;
  let yieldTotal = 0,
    timber = 0;
  for (const citizen of citizens) {
    const tile = tileAt(w, citizen.x, citizen.y);
    if (!tile || tile.fire > 0) continue;
    yieldTotal += 0.3 + tile.fertility * 0.8;
    timber += tile.terrain === 'forest' ? 0.46 : 0.1;
    // Harvest renewably; the ecosystem can recover between harvests.
    if (tile.vegetation > 0.2) tile.vegetation = Math.max(0.2, tile.vegetation - 0.005);
    if (kingdom.food > 0 && citizen.hunger > 4) {
      const meal = Math.min(kingdom.food, 1.4);
      citizen.hunger = Math.max(0, citizen.hunger - meal * 6);
      kingdom.food -= meal;
    }
  }
  kingdom.food = Math.min(9999, Math.max(0, kingdom.food + yieldTotal + farms * 5));
  kingdom.wood = Math.min(9999, kingdom.wood + timber);
  if (w.tick % 100 === 0) {
    const radius = Math.min(19, 5 + Math.floor(Math.sqrt(citizens.length) * 1.4));
    claim(w, kingdom, hall.x, hall.y, radius);
    const houses = structures.filter((b) => b.kind === 'house').length;
    const towers = structures.filter((b) => b.kind === 'tower').length;
    let kind: Building['kind'] | undefined;
    if (farms < Math.max(1, Math.ceil(citizens.length / 9))) kind = 'farm';
    else if (houses < Math.ceil(citizens.length / 4)) kind = 'house';
    else if (citizens.length >= 12 && towers < Math.ceil(citizens.length / 22)) kind = 'tower';
    const cost = kind === 'tower' ? 28 : kind === 'farm' ? 12 : 16;
    if (kind && kingdom.wood >= cost && structures.length < 60) {
      const site = buildingSite(w, kingdom, hall, kind);
      if (site) {
        w.buildings.push({
          id: w.nextId++,
          ...site,
          kingdom: kingdom.id,
          kind,
          health: kind === 'tower' ? 180 : 100,
        });
        kingdom.wood -= cost;
        claim(w, kingdom, site.x, site.y, 3);
      }
    }
  }
}

function diplomacy(w: World): void {
  for (let a = 0; a < w.kingdoms.length; a++)
    for (let b = a + 1; b < w.kingdoms.length; b++) {
      const left = w.kingdoms[a],
        right = w.kingdoms[b];
      if (!left.population || !right.population) continue;
      const lh = hallFor(w, left.id),
        rh = hallFor(w, right.id);
      if (!lh || !rh) continue;
      const distance = distanceSq(lh, rh);
      let relation = left.relations[right.id] ?? 0;
      if (relation < -0.5) {
        // War exhaustion guarantees room for recovery, rather than permanent war.
        if (
          Math.min(left.population, right.population) <
            Math.max(4, Math.max(left.population, right.population) * 0.3) ||
          (w.tick % 500 === 0 && random(w) < 0.15)
        ) {
          relation = 0.1;
          addEvent(w, `${left.name} and ${right.name} agree to peace.`, 'kingdom');
        }
      } else if (
        w.tick % 500 === 0 &&
        distance < 42 ** 2 &&
        left.population >= 8 &&
        right.population >= 8 &&
        left.age >= 4 &&
        right.age >= 4
      ) {
        const hostility = left.species === 'orc' || right.species === 'orc' ? 0.24 : 0.1;
        if (
          relation < 0.7 &&
          Math.min(left.population, right.population) /
            Math.max(left.population, right.population) >
            0.4 &&
          left.species !== right.species &&
          random(w) < hostility
        ) {
          relation = -1;
          addEvent(w, `${left.name} declares war on ${right.name}.`, 'war');
        } else if (relation < 0.7 && random(w) < 0.2) {
          relation = Math.min(1, relation + 0.25);
          if (relation >= 0.7)
            addEvent(w, `${left.name} and ${right.name} forge an alliance.`, 'kingdom');
        }
      }
      left.relations[right.id] = relation;
      right.relations[left.id] = relation;
    }
}

export function tickCivilizations(w: World): void {
  if (w.tick % UPDATE_INTERVAL !== 0) return;
  // Demolished structures are cleared before placement to keep ruins from
  // preventing reconstruction forever.
  w.buildings = w.buildings.filter((b) => b.health > 0 && walkable(tileAt(w, b.x, b.y)));
  settleUnclaimed(w);
  const populations = new Map<number, Entity[]>();
  for (const entity of w.entities) {
    if (!entity.kingdom) continue;
    const members = populations.get(entity.kingdom);
    if (members) members.push(entity);
    else populations.set(entity.kingdom, [entity]);
  }
  for (const kingdom of w.kingdoms) economy(w, kingdom, populations.get(kingdom.id) ?? []);
  if (w.tick % 100 === 0) diplomacy(w);
}
