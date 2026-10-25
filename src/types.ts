export type Terrain =
  'ocean' | 'water' | 'sand' | 'grass' | 'forest' | 'mountain' | 'snow' | 'desert';
export type Species = 'human' | 'elf' | 'orc' | 'sheep' | 'wolf';
export interface Tile {
  terrain: Terrain;
  elevation: number;
  moisture: number;
  fertility: number;
  vegetation: number;
  fire: number;
  owner: number;
}
export interface Entity {
  id: number;
  species: Species;
  x: number;
  y: number;
  health: number;
  hunger: number;
  age: number;
  kingdom: number;
  targetX: number;
  targetY: number;
  cooldown: number;
  traits: string[];
}
export interface Building {
  id: number;
  x: number;
  y: number;
  kingdom: number;
  kind: 'hall' | 'house' | 'farm' | 'tower';
  health: number;
}
export interface Kingdom {
  id: number;
  name: string;
  color: number;
  species: Species;
  population: number;
  food: number;
  wood: number;
  age: number;
  relations: Record<number, number>;
}
export interface WorldEvent {
  tick: number;
  text: string;
  kind: 'birth' | 'death' | 'kingdom' | 'war' | 'disaster' | 'info';
}
export interface World {
  version: 1;
  seed: number;
  rng: number;
  width: number;
  height: number;
  name: string;
  tick: number;
  nextId: number;
  tiles: Tile[];
  entities: Entity[];
  buildings: Building[];
  kingdoms: Kingdom[];
  events: WorldEvent[];
}
export type Power =
  | 'inspect'
  | 'grass'
  | 'forest'
  | 'sand'
  | 'water'
  | 'mountain'
  | 'snow'
  | 'desert'
  | 'human'
  | 'elf'
  | 'orc'
  | 'sheep'
  | 'wolf'
  | 'fire'
  | 'meteor'
  | 'lightning'
  | 'rain'
  | 'blessing'
  | 'plague'
  | 'earthquake'
  | 'erase';
export const TERRAIN_COLORS: Record<Terrain, number> = {
  ocean: 0x173c56,
  water: 0x286b81,
  sand: 0xd7c18c,
  grass: 0x73a56b,
  forest: 0x426e53,
  mountain: 0x7d8585,
  snow: 0xd9e5e2,
  desert: 0xbf9a65,
};
export function random(w: World): number {
  w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0;
  return w.rng / 4294967296;
}
export function tileAt(w: World, x: number, y: number): Tile | undefined {
  return w.tiles[Math.floor(y) * w.width + Math.floor(x)] &&
    x >= 0 &&
    y >= 0 &&
    x < w.width &&
    y < w.height
    ? w.tiles[Math.floor(y) * w.width + Math.floor(x)]
    : undefined;
}
export function walkable(t: Tile | undefined): boolean {
  return !!t && !['ocean', 'water', 'mountain'].includes(t.terrain);
}
export function addEvent(w: World, text: string, kind: WorldEvent['kind'] = 'info'): void {
  w.events.push({ tick: w.tick, text, kind });
  if (w.events.length > 80) w.events.shift();
}
