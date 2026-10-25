import {
  addEvent,
  random,
  tileAt,
  walkable,
  type Power,
  type Species,
  type Terrain,
  type World,
} from '../types';
import { spawnEntity } from '../sim/core';

const terrains = new Set<Power>(['grass', 'forest', 'sand', 'water', 'mountain', 'snow', 'desert']);
const species = new Set<Power>(['human', 'elf', 'orc', 'sheep', 'wolf']);

/** Apply one brush dab in tile coordinates. All randomness belongs to the saved world. */
export function applyPower(
  w: World,
  power: Power,
  x: number,
  y: number,
  radius: number,
): { changed: boolean; effect?: string } {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !tileAt(w, x, y) || power === 'inspect')
    return { changed: false };
  radius = Math.min(12, Math.max(0.5, Number.isFinite(radius) ? radius : 1));
  const cx = Math.floor(x),
    cy = Math.floor(y);
  if (species.has(power)) {
    let count = 0;
    const candidates: { x: number; y: number }[] = [];
    for (let dy = -Math.ceil(radius); dy <= radius; dy++)
      for (let dx = -Math.ceil(radius); dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius && walkable(tileAt(w, cx + dx, cy + dy)))
          candidates.push({ x: cx + dx + 0.5, y: cy + dy + 0.5 });
      }
    for (
      let i = 0;
      i < Math.min(8, Math.max(1, Math.ceil(radius * 1.5))) && candidates.length;
      i++
    ) {
      const p = candidates.splice(Math.floor(random(w) * candidates.length), 1)[0];
      if (spawnEntity(w, power as Species, p.x, p.y)) count++;
    }
    return { changed: count > 0, effect: count ? 'spawn' : undefined };
  }
  const blast =
    power === 'meteor'
      ? Math.max(radius, 4)
      : power === 'earthquake'
        ? Math.max(radius, 6)
        : radius;
  let changed = false;
  for (
    let ty = Math.max(0, cy - Math.ceil(blast));
    ty <= Math.min(w.height - 1, cy + Math.ceil(blast));
    ty++
  ) {
    for (
      let tx = Math.max(0, cx - Math.ceil(blast));
      tx <= Math.min(w.width - 1, cx + Math.ceil(blast));
      tx++
    ) {
      const distance = Math.hypot(tx - cx, ty - cy);
      if (distance > blast) continue;
      const t = w.tiles[ty * w.width + tx];
      if (terrains.has(power)) {
        t.terrain = power as Terrain;
        t.fire = 0;
        t.owner = 0;
        t.elevation =
          power === 'water' ? 0.25 : power === 'mountain' ? 0.85 : power === 'snow' ? 0.94 : 0.55;
        t.moisture = power === 'water' ? 1 : power === 'desert' ? 0.1 : 0.6;
        t.fertility = ['grass', 'forest'].includes(power) ? 0.9 : 0.1;
        t.vegetation = power === 'forest' ? 1 : power === 'grass' ? 0.45 : 0;
        changed = true;
      } else if (power === 'fire' && walkable(t)) {
        t.fire = Math.max(t.fire, 0.85);
        changed = true;
      } else if (power === 'rain') {
        t.fire = 0;
        t.moisture = Math.min(1, t.moisture + 0.35);
        if (walkable(t)) {
          t.fertility = Math.min(1, t.fertility + 0.15);
          t.vegetation = Math.min(1, t.vegetation + 0.1);
        }
        changed = true;
      } else if (power === 'meteor') {
        if (distance < blast * 0.55) {
          t.terrain = 'sand';
          t.elevation = 0.4;
          t.vegetation = 0;
          t.fertility = 0.1;
          t.owner = 0;
        }
        t.fire = walkable(t) && distance >= blast * 0.35 ? 1 : 0;
        changed = true;
      } else if (power === 'lightning' && walkable(t)) {
        t.fire = Math.max(t.fire, 0.7);
        changed = true;
      } else if (power === 'earthquake' && walkable(t) && random(w) < 0.3) {
        t.terrain = random(w) < 0.35 ? 'mountain' : 'sand';
        t.elevation = t.terrain === 'mountain' ? 0.86 : 0.5;
        t.vegetation = 0;
        changed = true;
      } else if (power === 'erase') {
        t.fire = 0;
        t.vegetation = 0;
        t.owner = 0;
        changed = true;
      }
    }
  }
  const inBrush = (e: { x: number; y: number }) => Math.hypot(e.x - x, e.y - y) <= blast + 0.5;
  for (const e of w.entities) {
    if (!inBrush(e)) continue;
    if (power === 'blessing') {
      e.health = 100;
      e.hunger = Math.max(0, e.hunger - 50);
      e.traits = e.traits.filter((t) => t !== 'plague' && t !== 'infected');
      if (!e.traits.includes('blessed')) e.traits.push('blessed');
      changed = true;
    } else if (power === 'plague') {
      if (!e.traits.includes('plague')) e.traits.push('plague');
      changed = true;
    } else if (power === 'rain') {
      e.health = Math.min(100, e.health + 4);
    } else if (
      power === 'meteor' ||
      power === 'lightning' ||
      power === 'earthquake' ||
      power === 'erase'
    ) {
      e.health -= power === 'earthquake' ? 40 : 150;
      changed = true;
    }
  }
  if (['meteor', 'lightning', 'earthquake', 'erase'].includes(power)) {
    for (const b of w.buildings) if (inBrush(b)) b.health -= power === 'earthquake' ? 80 : 200;
    w.entities = w.entities.filter((e) => e.health > 0);
    w.buildings = w.buildings.filter((b) => b.health > 0);
  }
  if (changed && ['meteor', 'earthquake', 'plague'].includes(power))
    addEvent(
      w,
      power === 'meteor'
        ? 'A falling star scorches the land.'
        : power === 'earthquake'
          ? 'The earth trembles beneath the kingdoms.'
          : 'A plague takes hold. Bless the afflicted to heal them.',
      'disaster',
    );
  return { changed, effect: changed ? power : undefined };
}

/** Fire advances at 2 Hz; growth is sampled to keep large worlds inexpensive. */
export function tickPowers(w: World): void {
  if (w.tick % 5 !== 0) return;
  const ignite: number[] = [];
  for (let i = 0; i < w.tiles.length; i++) {
    const t = w.tiles[i];
    if (t.fire <= 0) continue;
    if (!walkable(t)) {
      t.fire = 0;
      continue;
    }
    t.fire = Math.max(0, t.fire - (t.moisture > 0.8 ? 0.065 : 0.022));
    t.vegetation = Math.max(0, t.vegetation - 0.045);
    if (t.fire > 0.2 && random(w) < 0.38) {
      const dx = [1, -1, 0, 0],
        dy = [0, 0, 1, -1],
        direction = Math.floor(random(w) * 4);
      const x = (i % w.width) + dx[direction],
        y = Math.floor(i / w.width) + dy[direction],
        next = tileAt(w, x, y);
      if (
        next &&
        walkable(next) &&
        next.fire === 0 &&
        next.vegetation > 0.1 &&
        random(w) > next.moisture * 0.5
      )
        ignite.push(y * w.width + x);
    }
    if (t.fire === 0 && t.terrain === 'forest' && t.vegetation < 0.1) t.terrain = 'grass';
  }
  for (const index of ignite) w.tiles[index].fire = 0.8;
  for (const b of w.buildings) {
    const t = tileAt(w, b.x, b.y);
    if (!walkable(t)) b.health = 0;
    else if (t && t.fire > 0) b.health -= t.fire * 7;
  }
  w.buildings = w.buildings.filter((b) => b.health > 0);
  if (w.tick % 20 === 0)
    for (let i = 0; i < Math.min(w.tiles.length, 180); i++) {
      const t = w.tiles[Math.floor(random(w) * w.tiles.length)];
      if (t.fire === 0 && ['grass', 'forest'].includes(t.terrain))
        t.vegetation = Math.min(1, t.vegetation + 0.05 * t.fertility);
    }
}
