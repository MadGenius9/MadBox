import {
  addEvent,
  random,
  tileAt,
  walkable,
  type Entity,
  type Species,
  type World,
} from '../types';

/** Fixed 10 Hz simulation. Rendering never owns or advances entity state. */
export const SIMULATION_STEP = 0.1;
export const MAX_ENTITIES = 700;
const CIVILIZED = new Set<Species>(['human', 'elf', 'orc']);
const SPEED: Record<Species, number> = { human: 0.85, elf: 1, orc: 0.78, sheep: 0.65, wolf: 1.35 };
const LIFESPAN: Record<Species, number> = { human: 85, elf: 145, orc: 65, sheep: 25, wolf: 35 };
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

export function spawnEntity(w: World, species: Species, x: number, y: number): Entity | undefined {
  if (w.entities.length >= MAX_ENTITIES || !walkable(tileAt(w, x, y))) return undefined;
  const entity: Entity = {
    id: w.nextId++,
    species,
    x,
    y,
    health: 100,
    hunger: 10 + random(w) * 15,
    age: 2 + random(w) * 8,
    kingdom: 0,
    targetX: x,
    targetY: y,
    cooldown: 15 + random(w) * 20,
    traits: [],
  };
  w.entities.push(entity);
  return entity;
}

function nearby(grid: Map<number, Entity[]>, w: World, e: Entity, radius = 1): Entity[] {
  const cells = Math.ceil(w.width / 4),
    cx = Math.floor(e.x / 4),
    cy = Math.floor(e.y / 4);
  const result: Entity[] = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (cx + dx < 0 || cy + dy < 0 || cx + dx >= cells) continue;
      const list = grid.get((cy + dy) * cells + cx + dx);
      if (list) result.push(...list);
    }
  return result;
}

function hostile(w: World, e: Entity, other: Entity): boolean {
  if (other.health <= 0 || e.id === other.id) return false;
  if (e.species === 'wolf')
    return other.species === 'sheep' || (e.hunger > 65 && CIVILIZED.has(other.species));
  if (!CIVILIZED.has(e.species) || !CIVILIZED.has(other.species)) return false;
  if (e.kingdom === 0 || other.kingdom === 0 || e.kingdom === other.kingdom) return false;
  return (w.kingdoms.find((k) => k.id === e.kingdom)?.relations[other.kingdom] ?? 0) < -0.5;
}

/** Bounded breadth-first search supplies a detour when the direct route is blocked. */
function detour(w: World, e: Entity): [number, number] | undefined {
  const sx = Math.floor(e.x),
    sy = Math.floor(e.y);
  const start = sy * w.width + sx;
  const queue = [{ x: sx, y: sy, firstX: sx, firstY: sy }];
  const seen = new Set<number>([start]);
  let best = queue[0],
    bestDistance = Math.hypot(sx + 0.5 - e.targetX, sy + 0.5 - e.targetY);
  for (let index = 0; index < queue.length && index < 180; index++) {
    const node = queue[index];
    for (const [dx, dy] of DIRECTIONS.slice(0, 4)) {
      const x = node.x + dx,
        y = node.y + dy,
        key = y * w.width + x;
      if (seen.has(key) || !walkable(tileAt(w, x, y))) continue;
      seen.add(key);
      const next = {
        x,
        y,
        firstX: index === 0 ? x : node.firstX,
        firstY: index === 0 ? y : node.firstY,
      };
      queue.push(next);
      const distance = Math.hypot(x + 0.5 - e.targetX, y + 0.5 - e.targetY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = next;
      }
      if (distance < 0.8) return [next.firstX + 0.5, next.firstY + 0.5];
    }
  }
  return best === queue[0] ? undefined : [best.firstX + 0.5, best.firstY + 0.5];
}

function move(w: World, e: Entity): void {
  let dx = e.targetX - e.x,
    dy = e.targetY - e.y,
    distance = Math.hypot(dx, dy);
  if (distance < 0.08) return;
  const step = Math.min(
    distance,
    SPEED[e.species] * SIMULATION_STEP * (e.traits.includes('swift') ? 1.3 : 1),
  );
  let nx = e.x + (dx / distance) * step,
    ny = e.y + (dy / distance) * step;
  if (!walkable(tileAt(w, nx, ny))) {
    const waypoint = detour(w, e);
    if (!waypoint) {
      e.targetX = e.x;
      e.targetY = e.y;
      return;
    }
    dx = waypoint[0] - e.x;
    dy = waypoint[1] - e.y;
    distance = Math.hypot(dx, dy);
    nx = e.x + (dx / distance) * step;
    ny = e.y + (dy / distance) * step;
  }
  if (walkable(tileAt(w, nx, ny))) {
    e.x = nx;
    e.y = ny;
  }
}

function chooseDestination(w: World, e: Entity): void {
  let best = -Infinity;
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = Math.floor(e.x + (random(w) - 0.5) * 14) + 0.5;
    const y = Math.floor(e.y + (random(w) - 0.5) * 14) + 0.5;
    const tile = tileAt(w, x, y);
    if (!walkable(tile) || !tile) continue;
    const score =
      e.hunger > 35 && e.species !== 'wolf'
        ? tile.vegetation * 3 + tile.fertility - Math.hypot(x - e.x, y - e.y) * 0.03
        : random(w);
    if (score > best) {
      best = score;
      e.targetX = x;
      e.targetY = y;
    }
  }
}

export function tickWorld(w: World): void {
  w.tick++;
  const grid = new Map<number, Entity[]>(),
    cells = Math.ceil(w.width / 4);
  const populations = new Map<number, number>();
  const speciesCounts = new Map<Species, number>();
  const capacity = new Map<number, number>();
  for (const kingdom of w.kingdoms) capacity.set(kingdom.id, 24);
  for (const building of w.buildings) {
    if (building.health > 0)
      capacity.set(
        building.kingdom,
        (capacity.get(building.kingdom) ?? 24) +
          (building.kind === 'house'
            ? 4
            : building.kind === 'farm'
              ? 2
              : building.kind === 'tower'
                ? 4
                : 0),
      );
  }
  for (const e of w.entities) {
    populations.set(e.kingdom, (populations.get(e.kingdom) ?? 0) + 1);
    speciesCounts.set(e.species, (speciesCounts.get(e.species) ?? 0) + 1);
    const key = Math.floor(e.y / 4) * cells + Math.floor(e.x / 4);
    const list = grid.get(key);
    if (list) list.push(e);
    else grid.set(key, [e]);
  }
  // A snapshot keeps newborns from receiving a partial first tick.
  const initialCount = w.entities.length;
  for (let i = 0; i < initialCount; i++) {
    const e = w.entities[i];
    if (e.health <= 0) continue;
    const tile = tileAt(w, e.x, e.y);
    e.age += 0.002;
    e.cooldown = Math.max(0, e.cooldown - SIMULATION_STEP);
    const blessed = e.traits.includes('blessed');
    e.hunger = Math.min(100, e.hunger + (blessed ? 0.008 : 0.025));
    if (e.hunger >= 95) e.health -= 0.12;
    if (e.age > LIFESPAN[e.species]) e.health -= 0.08;
    if (!walkable(tile)) e.health -= 0.18;
    if (tile && tile.fire > 0) e.health -= Math.min(1.8, tile.fire * 0.18);
    const sick = e.traits.includes('plague') || e.traits.includes('infected');
    if (sick) {
      e.health -= 0.075;
      if ((w.tick + e.id) % 50 === 0)
        for (const other of nearby(grid, w, e)) {
          if (
            other.id !== e.id &&
            Math.hypot(other.x - e.x, other.y - e.y) < 1.5 &&
            !other.traits.includes('plague') &&
            random(w) < 0.12
          )
            other.traits.push('plague');
        }
    }
    if (blessed && w.tick % 10 === 0) e.health = Math.min(100, e.health + 1);
    if (tile && e.species !== 'wolf' && e.hunger > 15 && tile.vegetation > 0.02) {
      const bite = Math.min(tile.vegetation, 0.006);
      tile.vegetation -= bite;
      e.hunger = Math.max(0, e.hunger - bite * 60);
    }
    if (e.kingdom && e.hunger > 45 && w.tick % 10 === 0) {
      const kingdom = w.kingdoms.find((k) => k.id === e.kingdom);
      if (kingdom && kingdom.food > 1) {
        kingdom.food -= 0.4;
        e.hunger -= 12;
      }
    }
    if (e.hunger < 65 && !sick) e.health = Math.min(100, e.health + 0.018);
    const neighbors = nearby(grid, w, e);
    let enemy: Entity | undefined,
      enemyDistance = Infinity;
    if (e.species === 'wolf' || (CIVILIZED.has(e.species) && e.kingdom)) {
      for (const other of neighbors) {
        if (!hostile(w, e, other)) continue;
        const distance = Math.hypot(other.x - e.x, other.y - e.y);
        if (distance < enemyDistance && distance < 5) {
          enemyDistance = distance;
          enemy = other;
        }
      }
    }
    if (enemy) {
      e.targetX = enemy.x;
      e.targetY = enemy.y;
      if (enemyDistance < 0.9 && (w.tick + e.id) % 10 === 0) {
        enemy.health -= e.species === 'orc' ? 15 : e.species === 'wolf' ? 18 : 11;
        if (e.species === 'wolf') e.hunger = Math.max(0, e.hunger - 12);
        if (enemy.health <= 0 && e.species === 'wolf') e.hunger = Math.max(0, e.hunger - 45);
      }
    } else if (Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.2 || (w.tick + e.id) % 70 === 0) {
      chooseDestination(w, e);
    }
    // Prey visibly flee nearby wolves.
    if (e.species === 'sheep' && (w.tick + e.id) % 10 === 0) {
      const predator = neighbors.find(
        (other) => other.species === 'wolf' && Math.hypot(other.x - e.x, other.y - e.y) < 3,
      );
      if (predator) {
        const x = e.x + (e.x - predator.x) * 2,
          y = e.y + (e.y - predator.y) * 2;
        if (walkable(tileAt(w, x, y))) {
          e.targetX = x;
          e.targetY = y;
        }
      }
    }
    move(w, e);
    const kingdom = e.kingdom ? w.kingdoms.find((k) => k.id === e.kingdom) : undefined;
    const kingdomPopulation = populations.get(e.kingdom) ?? 0;
    const housing = capacity.get(e.kingdom) ?? 24;
    const sustainableCapacity = Math.min(
      180,
      24 + Math.max(0, housing - 24) * (kingdom && kingdom.food < kingdomPopulation ? 0.5 : 1),
    );
    const hasRoom = CIVILIZED.has(e.species)
      ? e.kingdom
        ? kingdomPopulation < sustainableCapacity
        : (speciesCounts.get(e.species) ?? 0) < 32
      : (speciesCounts.get(e.species) ?? 0) < (e.species === 'wolf' ? 36 : 150) &&
        neighbors.filter(
          (other) =>
            other.species === e.species &&
            other.health > 0 &&
            Math.hypot(other.x - e.x, other.y - e.y) < 4,
        ).length < (e.species === 'wolf' ? 4 : 8);
    if (
      hasRoom &&
      e.cooldown <= 0 &&
      e.age > 1.5 &&
      e.hunger < 65 &&
      e.health > 65 &&
      !sick &&
      (w.tick + e.id) % 20 === 0 &&
      w.entities.length < MAX_ENTITIES
    ) {
      const mate = neighbors.find(
        (other) =>
          other.id !== e.id &&
          other.species === e.species &&
          other.kingdom === e.kingdom &&
          other.age > 1.5 &&
          other.health > 60 &&
          Math.hypot(other.x - e.x, other.y - e.y) < 3,
      );
      if (mate && random(w) < 0.35) {
        const child = spawnEntity(w, e.species, e.x, e.y);
        if (child) {
          child.age = 0;
          child.kingdom = e.kingdom;
          child.cooldown = 65;
          e.cooldown = 35 + random(w) * 35;
          mate.cooldown = Math.max(mate.cooldown, 25);
          populations.set(e.kingdom, kingdomPopulation + 1);
          speciesCounts.set(e.species, (speciesCounts.get(e.species) ?? 0) + 1);
        }
      }
    }
  }
  const before = w.entities.length;
  w.entities = w.entities.filter((e) => e.health > 0);
  if (before - w.entities.length > 4 && w.tick % 20 === 0)
    addEvent(w, `${before - w.entities.length} lives were lost in the world.`, 'death');
}
