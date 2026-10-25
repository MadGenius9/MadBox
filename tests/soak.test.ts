import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { generateWorld } from '../src/world/generate';
import { MAX_ENTITIES, spawnEntity, tickWorld } from '../src/sim/core';
import { tickCivilizations } from '../src/sim/civilizations';
import { applyPower, tickPowers } from '../src/systems/powers';
import { walkable, tileAt, type World, type Species } from '../src/types';

function assertInvariants(w: World): void {
  assert.equal(w.tiles.length, w.width * w.height);
  assert.ok(w.entities.length <= MAX_ENTITIES);
  const ids = [...w.entities, ...w.kingdoms, ...w.buildings].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'all persistent IDs remain unique');
  for (const entity of w.entities) {
    for (const key of ['x', 'y', 'health', 'hunger', 'age', 'cooldown'] as const)
      assert.ok(Number.isFinite(entity[key]), `${key} is finite`);
    assert.ok(entity.x >= 0 && entity.y >= 0 && entity.x < w.width && entity.y < w.height);
    assert.ok(entity.health > 0 && entity.health <= 100);
    assert.ok(entity.hunger >= 0 && entity.hunger <= 100);
  }
  for (const kingdom of w.kingdoms) {
    assert.ok(Number.isFinite(kingdom.food) && kingdom.food >= 0);
    assert.ok(Number.isFinite(kingdom.wood) && kingdom.wood >= 0);
    for (const [other, relation] of Object.entries(kingdom.relations)) {
      assert.ok(Number.isFinite(relation));
      assert.equal(
        w.kingdoms.find((k) => k.id === Number(other))?.relations[kingdom.id],
        relation,
        'diplomacy is symmetric',
      );
    }
  }
  for (const tile of w.tiles)
    for (const key of ['elevation', 'moisture', 'fertility', 'vegetation', 'fire'] as const) {
      assert.ok(
        Number.isFinite(tile[key]) && tile[key] >= 0 && tile[key] <= 1,
        `tile ${key} stays normalized`,
      );
    }
}

test('30 simulated minutes preserve a populated, finite world through civilization and disaster updates', () => {
  const w = generateWorld(123, 128, 96, 'continents');
  const fertile = w.tiles
    .map((t, i) => ({ t, x: (i % w.width) + 0.5, y: Math.floor(i / w.width) + 0.5 }))
    .filter(({ t }) => ['grass', 'forest'].includes(t.terrain));
  const homes: { x: number; y: number }[] = [];
  for (const point of fertile) {
    if (homes.every((home) => Math.hypot(home.x - point.x, home.y - point.y) > 21))
      homes.push(point);
    if (homes.length === 3) break;
  }
  assert.equal(homes.length, 3);
  for (let group = 0; group < 3; group++) {
    const home = homes[group],
      species: Species = (['human', 'elf', 'orc'] as const)[group];
    const sites = fertile.filter((point) => Math.hypot(point.x - home.x, point.y - home.y) < 5);
    for (let i = 0; i < 25; i++) {
      const point = sites[i % sites.length];
      spawnEntity(w, species, point.x, point.y);
    }
    for (let i = 0; i < 20; i++) {
      const point = sites[(i * 3) % sites.length];
      spawnEntity(w, 'sheep', point.x, point.y);
    }
  }
  for (let i = 0; i < 5; i++) spawnEntity(w, 'wolf', homes[2].x, homes[2].y);
  const populations: number[] = [];
  const started = performance.now();
  for (let i = 0; i < 18_000; i++) {
    tickWorld(w);
    tickCivilizations(w);
    tickPowers(w);
    if (w.tick === 3_000) applyPower(w, 'fire', homes[0].x + 9, homes[0].y, 2);
    if (w.tick === 3_100) applyPower(w, 'rain', homes[0].x + 9, homes[0].y, 4);
    if (w.tick === 6_000) applyPower(w, 'meteor', homes[1].x + 12, homes[1].y + 10, 2);
    if (w.tick === 9_000) applyPower(w, 'blessing', homes[0].x, homes[0].y, 8);
    if (w.tick % 1_000 === 0) {
      assertInvariants(w);
      populations.push(w.entities.length);
    }
  }
  const elapsed = performance.now() - started;
  assert.equal(w.tick, 18_000);
  assert.ok(w.entities.length >= 20, 'a healthy world retains a meaningful living population');
  assert.ok(
    w.kingdoms.some((kingdom) => kingdom.population > 0),
    'civilization survives',
  );
  assert.ok(
    w.buildings.some((building) => building.kind === 'farm'),
    'settlements build farms',
  );
  for (const building of w.buildings) assert.ok(walkable(tileAt(w, building.x, building.y)));
  console.log(
    `MadBox soak: 30 simulated minutes in ${(elapsed / 1_000).toFixed(2)}s; populations/100 simulated seconds: ${populations.join(', ')}; kingdoms ${w.kingdoms.filter((k) => k.population > 0).length}; buildings ${w.buildings.length}`,
  );
});

test('release starting world retains all three civilizations after 30 simulated minutes', () => {
  const w = generateWorld(48271, 128, 96);
  const spots = w.tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => walkable(t) && t.terrain === 'grass');
  const starts = [0.22, 0.51, 0.78].map((fraction) => spots[Math.floor(spots.length * fraction)].i);
  starts.forEach((index, group) => {
    const x = index % w.width,
      y = Math.floor(index / w.width);
    for (let n = 0; n < 12; n++)
      spawnEntity(
        w,
        (['human', 'elf', 'orc'] as const)[group],
        x + ((n % 4) - 2) * 0.5,
        y + (Math.floor(n / 4) - 1) * 0.5,
      );
  });
  for (let n = 0; n < 32; n++) {
    const index = spots[Math.floor(((n + 0.5) / 32) * spots.length)].i;
    spawnEntity(
      w,
      n % 9 === 0 ? 'wolf' : 'sheep',
      (index % w.width) + 0.5,
      Math.floor(index / w.width) + 0.5,
    );
  }
  const started = performance.now();
  for (let i = 0; i < 18_000; i++) {
    tickWorld(w);
    tickCivilizations(w);
    tickPowers(w);
    if (w.tick % 3_000 === 0) assertInvariants(w);
  }
  for (const species of ['human', 'elf', 'orc'] as const)
    assert.ok(
      w.entities.some((entity) => entity.species === species),
      `${species} survive the release start`,
    );
  assert.ok(w.buildings.length >= 9, 'all civilizations develop settlements');
  console.log(
    `MadBox release soak: ${(performance.now() - started).toFixed(0)}ms; population ${w.entities.length}; ${w.kingdoms.map((k) => `${k.species}:${k.population}`).join(', ')}`,
  );
});
