import type { World } from '../types';
import LZString from 'lz-string';

export const SAVE_KEY = 'madbox.world.v1';
export const SAVE_PREFIX = 'madbox:lz16:v1:';

/** Detect damaged compressed payloads without changing any world numbers. */
function checksum(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
const terrain = new Set([
  'ocean',
  'water',
  'sand',
  'grass',
  'forest',
  'mountain',
  'snow',
  'desert',
]);
const species = new Set(['human', 'elf', 'orc', 'sheep', 'wolf']);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function validWorld(v: unknown): v is World {
  if (
    !object(v) ||
    v.version !== 1 ||
    !Number.isInteger(v.width) ||
    !Number.isInteger(v.height) ||
    v.width < 8 ||
    v.height < 8 ||
    v.width > 512 ||
    v.height > 512 ||
    !Number.isInteger(v.seed) ||
    v.seed < 0 ||
    v.seed > 0xffffffff ||
    !Number.isInteger(v.rng) ||
    v.rng < 0 ||
    v.rng > 0xffffffff ||
    !Number.isSafeInteger(v.tick) ||
    v.tick < 0 ||
    !Number.isSafeInteger(v.nextId) ||
    v.nextId < 1 ||
    typeof v.name !== 'string' ||
    v.name.length > 120
  )
    return false;
  if (
    !Array.isArray(v.tiles) ||
    v.tiles.length !== v.width * v.height ||
    !Array.isArray(v.entities) ||
    v.entities.length > 10000 ||
    !Array.isArray(v.buildings) ||
    v.buildings.length > 20000 ||
    !Array.isArray(v.kingdoms) ||
    v.kingdoms.length > 1000 ||
    !Array.isArray(v.events) ||
    v.events.length > 1000
  )
    return false;
  const position = (e: Record<string, any>) =>
    finite(e.x) && finite(e.y) && e.x >= 0 && e.y >= 0 && e.x < v.width && e.y < v.height;
  if (
    !v.tiles.every(
      (t: unknown) =>
        object(t) &&
        terrain.has(t.terrain) &&
        ['elevation', 'moisture', 'fertility', 'vegetation', 'fire', 'owner'].every((k) =>
          finite(t[k]),
        ),
    )
  )
    return false;
  if (
    !v.entities.every(
      (e: unknown) =>
        object(e) &&
        species.has(e.species) &&
        position(e) &&
        ['id', 'health', 'hunger', 'age', 'kingdom', 'targetX', 'targetY', 'cooldown'].every((k) =>
          finite(e[k]),
        ) &&
        Array.isArray(e.traits) &&
        e.traits.length < 100 &&
        e.traits.every((t: unknown) => typeof t === 'string'),
    )
  )
    return false;
  if (
    !v.buildings.every(
      (b: unknown) =>
        object(b) &&
        position(b) &&
        ['hall', 'house', 'farm', 'tower'].includes(b.kind) &&
        ['id', 'kingdom', 'health'].every((k) => finite(b[k])),
    )
  )
    return false;
  if (
    !v.kingdoms.every(
      (k: unknown) =>
        object(k) &&
        typeof k.name === 'string' &&
        species.has(k.species) &&
        ['id', 'color', 'population', 'food', 'wood', 'age'].every((n) => finite(k[n])) &&
        object(k.relations) &&
        Object.values(k.relations).every(finite),
    )
  )
    return false;
  return v.events.every(
    (e: unknown) =>
      object(e) &&
      finite(e.tick) &&
      typeof e.text === 'string' &&
      ['birth', 'death', 'kingdom', 'war', 'disaster', 'info'].includes(e.kind),
  );
}

/** Save serializable state only. Quota/privacy failures intentionally reach the UI. */
export function saveWorld(world: World): void {
  if (!validWorld(world)) throw new Error('MadBox could not save an invalid world.');
  const json = JSON.stringify(world);
  // UTF-16 compression fits large worlds inside browser localStorage quotas.
  // Prepare everything first: failed compression/quota must preserve the old slot.
  const payload = SAVE_PREFIX + checksum(json) + ':' + LZString.compressToUTF16(json);
  localStorage.setItem(SAVE_KEY, payload);
}
export function loadWorld(): World | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw === null) return null;
  let value: unknown;
  try {
    let json = raw;
    if (raw.startsWith(SAVE_PREFIX)) {
      const expected = raw.slice(SAVE_PREFIX.length, SAVE_PREFIX.length + 8);
      if (!/^[0-9a-f]{8}$/.test(expected) || raw[SAVE_PREFIX.length + 8] !== ':')
        throw new Error('Invalid save header');
      json = LZString.decompressFromUTF16(raw.slice(SAVE_PREFIX.length + 9));
      if (!json || checksum(json) !== expected) throw new Error('Invalid save payload');
    }
    // Original, uncompressed v1 saves remain readable and migrate on next save.
    value = JSON.parse(json);
  } catch {
    throw new Error('The MadBox save is damaged. Your current world has been preserved.');
  }
  if (!validWorld(value))
    throw new Error('This MadBox save is damaged or uses an unsupported version.');
  return value;
}
export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}
