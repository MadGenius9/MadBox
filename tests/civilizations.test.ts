import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickCivilizations } from '../src/sim/civilizations';
import type { Entity, World } from '../src/types';

function population(species: Entity['species'] = 'human', x = 18, y = 18): Entity[] {
  return Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    species,
    x: x + (i % 3),
    y: y + Math.floor(i / 3),
    health: 100,
    hunger: 40,
    age: 18,
    kingdom: 0,
    targetX: x,
    targetY: y,
    cooldown: 0,
    traits: [],
  }));
}
function world(): World {
  return {
    version: 1,
    seed: 18,
    rng: 18,
    width: 64,
    height: 64,
    name: 'Test',
    tick: 20,
    nextId: 20,
    tiles: Array.from({ length: 64 * 64 }, () => ({
      terrain: 'grass',
      elevation: 0.5,
      moisture: 0.5,
      fertility: 0.8,
      vegetation: 1,
      fire: 0,
      owner: 0,
    })),
    entities: population(),
    buildings: [],
    kingdoms: [],
    events: [],
  };
}

test('nearby citizens form a kingdom and start a renewable settlement economy', () => {
  const w = world();
  tickCivilizations(w);
  assert.equal(w.kingdoms.length, 1);
  const kingdom = w.kingdoms[0];
  assert.equal(kingdom.population, 8);
  assert.ok(w.entities.every((e) => e.kingdom === kingdom.id));
  assert.ok(w.buildings.some((b) => b.kind === 'hall'));
  assert.ok(w.tiles.some((t) => t.owner === kingdom.id));
  for (let tick = 40; tick <= 800; tick += 20) {
    w.tick = tick;
    tickCivilizations(w);
  }
  assert.ok(w.buildings.some((b) => b.kind === 'farm'));
  assert.ok(w.buildings.some((b) => b.kind === 'house'));
  assert.ok(kingdom.food > 0);
  assert.ok(w.entities.every((e) => e.hunger < 40));
});

test('civilization updates are deterministic and record collapse without repeated events', () => {
  const a = world(),
    b = world();
  for (let tick = 20; tick <= 2000; tick += 20) {
    a.tick = b.tick = tick;
    tickCivilizations(a);
    tickCivilizations(b);
  }
  assert.deepEqual(a, b);
  a.entities = [];
  a.tick = 2020;
  tickCivilizations(a);
  assert.equal(a.kingdoms[0].population, 0);
  assert.ok(a.tiles.every((t) => t.owner === 0));
  const eventCount = a.events.length;
  a.tick = 2040;
  tickCivilizations(a);
  assert.equal(a.events.length, eventCount);
});

test('distinct species establish distinct kingdoms and destroyed halls can rebuild', () => {
  const w = world();
  w.entities.push(...population('elf', 43, 43).map((e, i) => ({ ...e, id: 10 + i })));
  w.nextId = 30;
  tickCivilizations(w);
  assert.equal(w.kingdoms.length, 2);
  assert.equal(new Set(w.entities.map((e) => e.kingdom)).size, 2);
  const id = w.kingdoms[0].id;
  w.kingdoms[0].wood = 40;
  w.buildings.find((b) => b.kingdom === id && b.kind === 'hall')!.health = 0;
  w.tick = 40;
  tickCivilizations(w);
  assert.ok(w.buildings.some((b) => b.kingdom === id && b.kind === 'hall' && b.health > 0));
});

test('an exhausted kingdom negotiates peace before its last citizens are lost', () => {
  const w = world();
  w.entities.push(...population('elf', 43, 43).map((e, i) => ({ ...e, id: 10 + i })));
  w.nextId = 30;
  tickCivilizations(w);
  const [a, b] = w.kingdoms;
  a.relations[b.id] = b.relations[a.id] = -1;
  w.entities = w.entities.filter((e) => e.kingdom !== b.id || e.id <= 11);
  w.tick = 100;
  tickCivilizations(w);
  assert.equal(a.relations[b.id], 0.1);
  assert.equal(b.relations[a.id], 0.1);
  assert.ok(w.events.some((e) => e.text.includes('agree to peace')));
});
