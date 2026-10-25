import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPower, tickPowers } from '../src/systems/powers';
import { SAVE_KEY, SAVE_PREFIX, hasSave, loadWorld, saveWorld } from '../src/systems/storage';
import { generateWorld } from '../src/world/generate';
import type { World } from '../src/types';

function world(): World {
  return {
    version: 1,
    seed: 10,
    rng: 10,
    width: 16,
    height: 16,
    name: 'Test realm',
    tick: 0,
    nextId: 2,
    tiles: Array.from({ length: 256 }, () => ({
      terrain: 'grass',
      elevation: 0.5,
      moisture: 0.5,
      fertility: 1,
      vegetation: 1,
      fire: 0,
      owner: 0,
    })),
    entities: [
      {
        id: 1,
        species: 'human',
        x: 8.5,
        y: 8.5,
        health: 30,
        hunger: 75,
        age: 20,
        kingdom: 0,
        targetX: 8.5,
        targetY: 8.5,
        cooldown: 0,
        traits: [],
      },
    ],
    buildings: [],
    kingdoms: [],
    events: [],
  };
}

test('terrain brush affects only its disk and rejects out-of-bounds input', () => {
  const w = world();
  applyPower(w, 'water', 8, 8, 2);
  assert.equal(w.tiles[8 * 16 + 8].terrain, 'water');
  assert.equal(w.tiles[0].terrain, 'grass');
  assert.deepEqual(applyPower(w, 'meteor', -2, 8, 2), { changed: false });
});
test('blessing cures plague, restores health and grants a persistent trait', () => {
  const w = world();
  applyPower(w, 'plague', 8, 8, 2);
  assert.ok(w.entities[0].traits.includes('plague'));
  applyPower(w, 'blessing', 8, 8, 2);
  assert.equal(w.entities[0].health, 100);
  assert.ok(!w.entities[0].traits.includes('plague'));
  assert.ok(w.entities[0].traits.includes('blessed'));
});
test('meteors destroy residents and buildings and create a burning crater', () => {
  const w = world();
  w.buildings.push({ id: 2, x: 8, y: 8, kingdom: 0, kind: 'house', health: 100 });
  applyPower(w, 'meteor', 8, 8, 1);
  assert.equal(w.entities.length, 0);
  assert.equal(w.buildings.length, 0);
  assert.equal(w.tiles[8 * 16 + 8].terrain, 'sand');
  assert.ok(w.tiles.some((t) => t.fire > 0));
});
test('rain extinguishes fire and fire simulation decays', () => {
  const w = world();
  applyPower(w, 'fire', 8, 8, 2);
  const before = w.tiles[8 * 16 + 8].fire;
  tickPowers(w);
  assert.ok(w.tiles[8 * 16 + 8].fire < before);
  applyPower(w, 'rain', 8, 8, 3);
  assert.equal(w.tiles[8 * 16 + 8].fire, 0);
});
test('powers are deterministic for a saved seed', () => {
  const a = world(),
    b = world();
  applyPower(a, 'earthquake', 8, 8, 5);
  applyPower(b, 'earthquake', 8, 8, 5);
  assert.deepEqual(a, b);
});
test('local saves round trip without mutating the original and reject corrupt data', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    },
  });
  assert.equal(hasSave(), false);
  assert.equal(loadWorld(), null);
  const w = world();
  saveWorld(w);
  assert.ok(hasSave());
  assert.ok(values.get(SAVE_KEY)!.startsWith(SAVE_PREFIX));
  const loaded = loadWorld();
  assert.deepEqual(loaded, w);
  assert.notEqual(loaded, w);
  values.set(SAVE_KEY, JSON.stringify(w));
  assert.deepEqual(loadWorld(), w, 'legacy uncompressed v1 saves remain readable');
  saveWorld(w);
  const compressed = values.get(SAVE_KEY)!;
  values.set(SAVE_KEY, compressed.slice(0, -20));
  assert.throws(loadWorld, /damaged/);
  values.set(SAVE_KEY, SAVE_PREFIX + 'badheader:broken');
  assert.throws(loadWorld, /damaged/);
  values.set(SAVE_KEY, SAVE_PREFIX + '00000000:' + compressed.slice(SAVE_PREFIX.length + 9));
  assert.throws(loadWorld, /damaged/);
  values.set(SAVE_KEY, '{');
  assert.throws(loadWorld, /damaged/);
  values.set(SAVE_KEY, JSON.stringify({ ...w, version: 2 }));
  assert.throws(loadWorld, /unsupported/);
  values.set(SAVE_KEY, JSON.stringify({ ...w, tiles: [] }));
  assert.throws(loadWorld, /damaged/);
  values.set(SAVE_KEY, JSON.stringify({ ...w, entities: [{ ...w.entities[0], x: -1 }] }));
  assert.throws(loadWorld, /damaged/);
  values.set(SAVE_KEY, JSON.stringify({ ...w, rng: 'broken' }));
  assert.throws(loadWorld, /damaged/);
  values.set(SAVE_KEY, JSON.stringify({ ...w, rng: -1 }));
  assert.throws(loadWorld, /damaged/);
  values.set(SAVE_KEY, JSON.stringify({ ...w, entities: [{ ...w.entities[0], traits: [{}] }] }));
  assert.throws(loadWorld, /damaged/);
  assert.throws(() => saveWorld({ ...w, rng: NaN }), /invalid/);
  assert.throws(
    () => saveWorld({ ...w, tiles: w.tiles.map((t) => ({ ...t, fire: Infinity })) }),
    /invalid/,
  );
});

test('large worlds fit the local save budget and round trip every numeric value', () => {
  let payload = '';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => payload || null,
      setItem: (_key: string, value: string) => {
        if (value.length > 2_000_000) throw new Error('Quota exceeded');
        payload = value;
      },
    },
  });
  const w = generateWorld(48271, 192, 144);
  // Populate the save with hundreds of distinct residents as well as terrain.
  const prototype = world().entities[0];
  w.entities = Array.from({ length: 700 }, (_, i) => ({
    ...prototype,
    id: i + 1,
    x: (i % 190) + 0.123456789,
    y: (i % 142) + 0.987654321,
    health: 99.9999 - i / 100,
    hunger: i / 11,
    age: i / 20,
    traits: i % 7 === 0 ? ['blessed'] : [],
  }));
  w.nextId = 701;
  const uncompressed = JSON.stringify(w).length;
  saveWorld(w);
  assert.ok(payload.length < 2_000_000, `Compressed save uses ${payload.length} UTF-16 characters`);
  assert.ok(payload.length < uncompressed / 2, 'Compression meaningfully reduces quota use');
  assert.deepEqual(loadWorld(), w);
  console.log(
    `MadBox large save: ${uncompressed} JSON characters -> ${payload.length} compressed UTF-16 characters`,
  );
});

test('spawn brushes respect terrain and create creatures; erased lives disappear immediately', () => {
  const w = world();
  const count = w.entities.length;
  applyPower(w, 'sheep', 3, 3, 2);
  assert.ok(w.entities.length > count);
  applyPower(w, 'water', 3, 3, 3);
  const before = w.entities.length;
  assert.equal(applyPower(w, 'wolf', 3, 3, 1).changed, false);
  assert.equal(w.entities.length, before);
  applyPower(w, 'erase', 3, 3, 4);
  assert.equal(w.entities.length, 1);
});

test('flooded buildings are removed by the next fire/environment tick', () => {
  const w = world();
  w.buildings.push({ id: 2, x: 8, y: 8, kingdom: 0, kind: 'house', health: 100 });
  applyPower(w, 'water', 8, 8, 2);
  tickPowers(w);
  assert.equal(w.buildings.length, 0);
});
