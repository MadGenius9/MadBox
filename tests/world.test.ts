import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, type WorldStyle } from '../src/world/generate.ts';
import { walkable } from '../src/types.ts';

test('the same seed produces identical terrain and a different seed changes it', () => {
  assert.deepEqual(generateWorld(9471), generateWorld(9471));
  assert.notDeepEqual(generateWorld(9471).tiles, generateWorld(9472).tiles);
});

for (const style of ['continents', 'islands', 'pangaea'] as WorldStyle[]) {
  test(`${style} generates fertile land, ocean boundaries, and bounded valid tiles`, () => {
    for (const seed of [0, 1, 42, 2026, 4294967295]) {
      const w = generateWorld(seed, 128, 96, style);
      const land = w.tiles.filter(walkable).length / w.tiles.length;
      assert.ok(land > 0.1 && land < 0.8, `land ratio ${land} for ${style} ${seed}`);
      assert.ok(w.tiles.some((t) => t.terrain === 'grass' || t.terrain === 'forest'));
      assert.equal(w.tiles.length, w.width * w.height);
      for (const t of w.tiles) {
        assert.ok(t.elevation >= 0 && t.elevation <= 1);
        assert.ok(t.moisture >= 0 && t.moisture <= 1);
        assert.equal(t.owner, 0);
      }
      for (let x = 0; x < w.width; x++) {
        assert.equal(w.tiles[x].terrain, 'ocean');
        assert.equal(w.tiles[(w.height - 1) * w.width + x].terrain, 'ocean');
      }
    }
  });
}

test('supports differently sized maps without seeding simulation entities', () => {
  for (const [width, height] of [
    [64, 48],
    [192, 128],
    [256, 192],
  ]) {
    const w = generateWorld(109, width, height);
    assert.equal(w.tiles.length, width * height);
    assert.equal(w.entities.length, 0);
    assert.equal(w.kingdoms.length, 0);
  }
  assert.throws(() => generateWorld(1, 0, 0), RangeError);
  assert.throws(() => generateWorld(NaN), RangeError);
});
