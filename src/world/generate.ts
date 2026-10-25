import type { Terrain, Tile, World } from '../types';

export type WorldStyle = 'continents' | 'islands' | 'pangaea';

const clamp = (n: number, min = 0, max = 1): number => Math.max(min, Math.min(max, n));
const smooth = (t: number): number => t * t * (3 - 2 * t);

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const tx = smooth(x - ix),
    ty = smooth(y - iy);
  const a = hash(ix, iy, seed),
    b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed),
    d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function fbm(x: number, y: number, seed: number): number {
  return (
    noise(x, y, seed) * 0.53 +
    noise(x * 2, y * 2, seed + 91) * 0.27 +
    noise(x * 4, y * 4, seed + 191) * 0.13 +
    noise(x * 8, y * 8, seed + 321) * 0.07
  );
}

interface Island {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Pure, seeded terrain generation. Simulation life is seeded separately by the caller. */
export function generateWorld(
  seed: number,
  width = 128,
  height = 96,
  style: WorldStyle = 'continents',
): World {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 16 ||
    height < 16 ||
    width > 512 ||
    height > 512
  ) {
    throw new RangeError('MadBox worlds must be between 16 and 512 tiles on each side.');
  }
  if (!Number.isFinite(seed)) throw new RangeError('MadBox world seeds must be finite numbers.');
  seed = seed >>> 0;
  let state = seed;
  const rand = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const islands: Island[] = [];
  if (style === 'pangaea') {
    islands.push({ x: 0.5, y: 0.5, rx: 0.41, ry: 0.42 });
  } else if (style === 'islands') {
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        islands.push({
          x: 0.19 + x * 0.31 + (rand() - 0.5) * 0.08,
          y: 0.2 + y * 0.3 + (rand() - 0.5) * 0.08,
          rx: 0.12 + rand() * 0.055,
          ry: 0.13 + rand() * 0.055,
        });
      }
  } else {
    islands.push({ x: 0.33 + rand() * 0.06, y: 0.47 + rand() * 0.08, rx: 0.29, ry: 0.38 });
    islands.push({ x: 0.73 + rand() * 0.035, y: 0.45 + rand() * 0.08, rx: 0.2, ry: 0.29 });
    islands.push({ x: 0.65 + rand() * 0.05, y: 0.81, rx: 0.13, ry: 0.11 });
  }
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1),
        v = y / (height - 1);
      const warpX = (fbm(u * 5, v * 5, seed + 17) - 0.5) * 0.14;
      const warpY = (fbm(u * 5, v * 5, seed + 29) - 0.5) * 0.14;
      let mass = -2;
      for (const island of islands) {
        const dx = (u + warpX - island.x) / island.rx;
        const dy = (v + warpY - island.y) / island.ry;
        mass = Math.max(mass, 1 - Math.sqrt(dx * dx + dy * dy));
      }
      const detail = fbm(u * 12, v * 12, seed + 413);
      // Falloff keeps every map surrounded by open water, including tiny worlds.
      const edge = clamp(Math.min(u, v, 1 - u, 1 - v) / 0.06);
      const elevation = clamp((0.41 + mass * 0.38 + (detail - 0.5) * 0.22) * edge);
      const moisture = clamp(fbm(u * 6, v * 6, seed + 733) * 1.3 - 0.12);
      const temperature = clamp(
        0.88 -
          Math.abs(v - 0.53) * 0.8 -
          Math.max(0, elevation - 0.58) * 1.1 +
          (fbm(u * 4, v * 4, seed + 991) - 0.5) * 0.2,
      );
      let terrain: Terrain;
      if (elevation < 0.29) terrain = 'ocean';
      else if (elevation < 0.41) terrain = 'water';
      else if (elevation < 0.445) terrain = 'sand';
      else if (elevation > 0.735 || (elevation > 0.65 && temperature < 0.44)) terrain = 'snow';
      else if (elevation > 0.645) terrain = 'mountain';
      else if (moisture < 0.38 && temperature > 0.58) terrain = 'desert';
      else if (moisture > 0.51 && detail > 0.38) terrain = 'forest';
      else terrain = 'grass';
      const fertility =
        terrain === 'grass'
          ? 0.65 + moisture * 0.35
          : terrain === 'forest'
            ? 0.7 + moisture * 0.3
            : terrain === 'sand' || terrain === 'desert'
              ? 0.15
              : 0.05;
      tiles.push({
        terrain,
        elevation,
        moisture,
        fertility,
        vegetation:
          terrain === 'forest' ? 0.65 + detail * 0.35 : terrain === 'grass' ? moisture * 0.55 : 0,
        fire: 0,
        owner: 0,
      });
    }
  const first = [
    'Aurelian',
    'Verdant',
    'Everspring',
    'Solstice',
    'Emerald',
    'Silverleaf',
    'Sunhaven',
    'Moonlit',
  ];
  const second = ['Reach', 'Isles', 'Expanse', 'Wilds', 'Haven', 'Coast', 'Realm', 'Shores'];
  return {
    version: 1,
    seed,
    rng: state,
    width,
    height,
    name: `${first[seed % first.length]} ${second[(seed >>> 4) % second.length]}`,
    tick: 0,
    nextId: 1,
    tiles,
    entities: [],
    buildings: [],
    kingdoms: [],
    events: [{ tick: 0, text: 'A new world awakens. Its story is yours to shape.', kind: 'info' }],
  };
}
