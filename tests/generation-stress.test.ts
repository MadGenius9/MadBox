import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, type WorldStyle } from '../src/world/generate.ts';
import { walkable, TERRAIN_COLORS } from '../src/types.ts';

const scenarios: { seed: number; width: number; height: number; style: WorldStyle }[] = [];
for (const style of ['continents', 'islands', 'pangaea'] as WorldStyle[]) {
  for (const [width, height] of [
    [96, 72],
    [128, 96],
    [192, 144],
  ]) {
    for (const seed of [0, 48271, 0xffffffff]) scenarios.push({ seed, width, height, style });
  }
  scenarios.push({ seed: 2026, width: 128, height: 96, style });
}

for (const { seed, width, height, style } of scenarios) {
  test(`generation stress: ${style} ${width}×${height}, seed ${seed}`, () => {
    const w = generateWorld(seed, width, height, style);
    assert.equal(w.tiles.length, width * height);
    const land = w.tiles.filter(walkable).length / w.tiles.length;
    const fertile =
      w.tiles.filter((t) => t.terrain === 'grass' || t.terrain === 'forest').length /
      w.tiles.length;
    assert.ok(land > 0.1 && land < 0.8, `playable land fraction ${land}`);
    assert.ok(fertile > 0.04, `fertile land fraction ${fertile}`);
    for (const tile of w.tiles) {
      assert.ok(tile.terrain in TERRAIN_COLORS);
      for (const field of ['elevation', 'moisture', 'fertility', 'vegetation'] as const) {
        assert.ok(
          Number.isFinite(tile[field]) && tile[field] >= 0 && tile[field] <= 1,
          `${field} within [0, 1]`,
        );
      }
      assert.equal(tile.fire, 0);
      assert.equal(tile.owner, 0);
    }
    for (let x = 0; x < width; x++) {
      assert.equal(w.tiles[x].terrain, 'ocean');
      assert.equal(w.tiles[(height - 1) * width + x].terrain, 'ocean');
    }
    for (let y = 0; y < height; y++) {
      assert.equal(w.tiles[y * width].terrain, 'ocean');
      assert.equal(w.tiles[y * width + width - 1].terrain, 'ocean');
    }
  });
}
