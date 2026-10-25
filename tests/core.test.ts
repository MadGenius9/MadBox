import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnEntity, tickWorld } from '../src/sim/core';
import type { World } from '../src/types';

function world(): World {
  return {
    version: 1,
    seed: 123,
    rng: 123,
    width: 20,
    height: 20,
    name: 'Test',
    tick: 0,
    nextId: 1,
    tiles: Array.from({ length: 400 }, () => ({
      terrain: 'grass',
      elevation: 0.5,
      moisture: 0.5,
      fertility: 0.7,
      vegetation: 1,
      fire: 0,
      owner: 0,
    })),
    entities: [],
    buildings: [],
    kingdoms: [],
    events: [],
  };
}

test('fixed ticks remain deterministic and entities stay on land', () => {
  const a = world(),
    b = world();
  for (const w of [a, b]) {
    for (let y = 0; y < 20; y++) w.tiles[y * 20 + 10].terrain = 'water';
    for (let i = 0; i < 30; i++)
      spawnEntity(w, i % 4 ? 'human' : 'sheep', 4.5 + (i % 3), 4.5 + (i % 8));
    for (let i = 0; i < 900; i++) tickWorld(w);
    assert.equal(w.tick, 900);
    assert.ok(w.entities.length > 0);
    for (const entity of w.entities) assert.notEqual(Math.floor(entity.x), 10);
  }
  assert.deepEqual(a, b);
});

test('spawning rejects ocean and population overflow', () => {
  const w = world();
  w.tiles[0].terrain = 'ocean';
  assert.equal(spawnEntity(w, 'human', 0.5, 0.5), undefined);
  for (let i = 0; i < 700; i++) spawnEntity(w, 'sheep', 2.5, 2.5);
  assert.equal(w.entities.length, 700);
  assert.equal(spawnEntity(w, 'sheep', 2.5, 2.5), undefined);
});

test('wolves hunt and plague hurts while blessings restore health', () => {
  const w = world();
  const wolf = spawnEntity(w, 'wolf', 5.5, 5.5)!;
  const sheep = spawnEntity(w, 'sheep', 5.6, 5.5)!;
  sheep.health = 10;
  wolf.hunger = 80;
  for (let i = 0; i < 10; i++) tickWorld(w);
  assert.ok(!w.entities.some((e) => e.id === sheep.id));
  assert.ok(wolf.hunger < 50);
  const sick = spawnEntity(w, 'human', 15.5, 15.5)!;
  sick.traits.push('plague');
  const blessed = spawnEntity(w, 'elf', 2.5, 2.5)!;
  blessed.health = 50;
  blessed.traits.push('blessed');
  for (let i = 0; i < 100; i++) tickWorld(w);
  assert.ok(sick.health < 95);
  assert.ok(blessed.health > 60);
});

test('civilizations at war fight neighboring enemies', () => {
  const w = world();
  const a = spawnEntity(w, 'human', 4.5, 4.5)!,
    b = spawnEntity(w, 'orc', 4.6, 4.5)!;
  a.kingdom = 1;
  b.kingdom = 2;
  w.kingdoms.push(
    {
      id: 1,
      name: 'A',
      color: 0,
      species: 'human',
      population: 1,
      food: 0,
      wood: 0,
      age: 0,
      relations: { 2: -1 },
    },
    {
      id: 2,
      name: 'B',
      color: 0,
      species: 'orc',
      population: 1,
      food: 0,
      wood: 0,
      age: 0,
      relations: { 1: -1 },
    },
  );
  for (let i = 0; i < 20; i++) tickWorld(w);
  assert.ok(a.health < 100 && b.health < 100);
});

test('natural births respect settlement capacity and resume when housing grows', () => {
  const w = world();
  w.kingdoms.push({
    id: w.nextId++,
    name: 'A',
    color: 0,
    species: 'human',
    population: 24,
    food: 1000,
    wood: 100,
    age: 0,
    relations: {},
  });
  const kingdom = w.kingdoms[0];
  for (let i = 0; i < 24; i++) {
    const entity = spawnEntity(w, 'human', 7.5 + (i % 3) * 0.1, 7.5)!;
    entity.kingdom = kingdom.id;
    entity.cooldown = 0;
  }
  for (let i = 0; i < 100; i++) tickWorld(w);
  assert.equal(w.entities.length, 24, 'settlement birth capacity starts at 24');
  for (let i = 0; i < 4; i++)
    w.buildings.push({
      id: w.nextId++,
      x: 4 + i,
      y: 4,
      kingdom: kingdom.id,
      kind: 'house',
      health: 100,
    });
  for (let i = 0; i < 1_000; i++) tickWorld(w);
  assert.ok(w.entities.length > 24, 'more houses allow births');
  assert.ok(w.entities.length <= 40, 'births stay inside expanded housing capacity');
});
