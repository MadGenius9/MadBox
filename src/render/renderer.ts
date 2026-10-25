import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TERRAIN_COLORS, type World, type Terrain, type Species } from '../types';

const TILE = 16;
const hash = (x: number, y: number, seed = 1) => {
  let n = Math.imul(x + seed, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const mix = (c: number, v: number) => {
  const r = Math.max(0, Math.min(255, (c >> 16) + v));
  const g = Math.max(0, Math.min(255, ((c >> 8) & 255) + v));
  const b = Math.max(0, Math.min(255, (c & 255) + v));
  return (r << 16) | (g << 8) | b;
};
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

interface PowerVisual {
  x: number;
  y: number;
  kind: string;
  life: number;
  max: number;
  seed: number;
}

/** Rendering owns no simulation state. World coordinates are measured in tiles. */
export class WorldRenderer {
  public canvas!: HTMLCanvasElement;
  public showTerritory = false;
  public panMode = false;
  public isNavigating = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private pinchCenter = { x: 0, y: 0 };
  private touchGesture = false;
  private app!: Application;
  private world!: World;
  private host!: HTMLElement;
  private scene = new Container();
  private terrain = new Sprite();
  private territory = new Graphics();
  private buildings = new Container();
  private actors = new Container();
  private sea = new Container();
  private glints: Sprite[] = [];
  private fireIndices: number[] = [];
  private lastFireTick = -1;
  private visualCacheDirty = true;
  private baseResolution = Math.min(window.devicePixelRatio || 1, 1.5);
  private qualityFrames = 0;
  private qualityStarted = 0;
  private effects = new Graphics();
  private brush = new Graphics();
  private actorSprites = new Map<number, Sprite>();
  private buildingSprites = new Map<number, Sprite>();
  private creatureTextures = new Map<Species, Texture>();
  private buildingTextures = new Map<string, Texture>();
  private terrainTexture: Texture | undefined;
  private terrainCanvas: HTMLCanvasElement | undefined;
  private lastTerrainScanWall = 0;
  private terrainDirty = true;
  private terrainSignature = 0;
  private lastTerrainScan = -1;
  private lastTerritory = -1;
  private time = 0;
  private particles: Particle[] = [];
  private powerVisuals: PowerVisual[] = [];
  private zoomLevel = 1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private brushState = { x: 0, y: 0, radius: 1, visible: false };
  private observer!: ResizeObserver;
  private disposers: (() => void)[] = [];

  async init(host: HTMLElement, world: World): Promise<void> {
    this.host = host;
    this.world = world;
    this.app = new Application();
    await this.app.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      background: 0x112b3c,
      // Canvas-generated textures carry their own antialiasing; framebuffer MSAA
      // is prohibitively expensive on software WebGL and adds little here.
      antialias: false,
      resolution: this.baseResolution,
      autoDensity: true,
      autoStart: false,
      preference: 'webgl',
    });
    this.canvas = this.app.canvas as HTMLCanvasElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    host.appendChild(this.canvas);
    this.app.stage.addChild(this.scene);
    this.scene.addChild(
      this.terrain,
      this.sea,
      this.territory,
      this.buildings,
      this.actors,
      this.effects,
      this.brush,
    );
    this.actors.sortableChildren = true;
    this.buildings.sortableChildren = true;
    for (const species of ['human', 'elf', 'orc', 'sheep', 'wolf'] as Species[])
      this.creatureTextures.set(species, this.makeCreature(species));
    for (const kind of ['hall', 'house', 'farm', 'tower'])
      this.buildingTextures.set(kind, this.makeBuilding(kind));
    const bind = (type: string, fn: EventListener, options?: AddEventListenerOptions) => {
      this.canvas.addEventListener(type, fn, options);
      this.disposers.push(() => this.canvas.removeEventListener(type, fn, options));
    };
    bind('contextmenu', (e) => e.preventDefault());
    bind(
      'wheel',
      (e) => {
        const ev = e as WheelEvent;
        ev.preventDefault();
        const r = this.canvas.getBoundingClientRect();
        const px = ev.clientX - r.left,
          py = ev.clientY - r.top;
        this.zoomAt(Math.exp(-ev.deltaY * 0.0012), px, py);
      },
      { passive: false },
    );
    bind('pointerdown', (e) => {
      const p = e as PointerEvent;
      if (p.pointerType === 'touch') {
        this.pointers.set(p.pointerId, { x: p.clientX, y: p.clientY });
        if (this.pointers.size >= 2) {
          this.touchGesture = true;
          this.isNavigating = true;
          this.updatePinch();
          e.stopImmediatePropagation();
        }
      }
      if (p.button === 1 || p.button === 2 || (p.button === 0 && this.panMode)) {
        this.dragging = true;
        this.isNavigating = true;
        this.lastX = p.clientX;
        this.lastY = p.clientY;
      }
      this.canvas.setPointerCapture(p.pointerId);
    });
    bind('pointermove', (e) => {
      const p = e as PointerEvent;
      if (p.pointerType === 'touch' && this.pointers.has(p.pointerId)) {
        this.pointers.set(p.pointerId, { x: p.clientX, y: p.clientY });
        if (this.touchGesture) {
          if (this.pointers.size >= 2) {
            const points = [...this.pointers.values()];
            const center = {
              x: (points[0].x + points[1].x) / 2,
              y: (points[0].y + points[1].y) / 2,
            };
            const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            const rect = this.canvas.getBoundingClientRect();
            this.panBy(center.x - this.pinchCenter.x, center.y - this.pinchCenter.y);
            if (this.pinchDistance > 0)
              this.zoomAt(distance / this.pinchDistance, center.x - rect.left, center.y - rect.top);
            this.pinchCenter = center;
            this.pinchDistance = distance;
          }
          e.stopImmediatePropagation();
          return;
        }
      }
      if (this.dragging) {
        this.panBy(p.clientX - this.lastX, p.clientY - this.lastY);
        this.lastX = p.clientX;
        this.lastY = p.clientY;
      }
    });
    const release = (e: Event) => {
      this.pointers.delete((e as PointerEvent).pointerId);
      this.dragging = false;
      if (this.pointers.size === 0) {
        this.touchGesture = false;
        this.isNavigating = false;
      } else this.updatePinch();
    };
    bind('pointerup', release);
    bind('pointercancel', release);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resetCamera();
    this.render(0);
  }
  private updatePinch(): void {
    const points = [...this.pointers.values()];
    if (points.length >= 2) {
      this.pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      this.pinchCenter = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    }
  }
  setWorld(w: World): void {
    // IDs are local to a world, so a reused ID must never retain the previous sprite.
    for (const sprite of this.actorSprites.values()) sprite.destroy();
    for (const sprite of this.buildingSprites.values()) sprite.destroy();
    this.actorSprites.clear();
    this.buildingSprites.clear();
    this.world = w;
    this.visualCacheDirty = true;
    this.lastFireTick = -1;
    this.terrainDirty = true;
    this.lastTerrainScan = -1;
    this.lastTerritory = -1;
    this.particles = [];
    this.powerVisuals = [];
    this.resetCamera();
  }
  invalidateTerrain(): void {
    this.terrainDirty = true;
    this.visualCacheDirty = true;
    this.lastTerritory = -1;
  }
  resize(): void {
    if (!this.canvas) return;
    const oldWidth = this.app.screen.width,
      oldHeight = this.app.screen.height;
    const width = Math.max(1, this.host.clientWidth),
      height = Math.max(1, this.host.clientHeight);
    if (oldWidth === width && oldHeight === height) return;
    const centerX = (oldWidth / 2 - this.scene.x) / this.zoomLevel,
      centerY = (oldHeight / 2 - this.scene.y) / this.zoomLevel;
    this.app.renderer.resize(width, height);
    if (oldWidth < 600 !== width < 600) {
      this.resetCamera();
      return;
    }
    this.scene.position.set(
      width / 2 - centerX * this.zoomLevel,
      height / 2 - centerY * this.zoomLevel,
    );
  }
  resetCamera(): void {
    if (!this.canvas) return;
    const width = this.app.screen.width,
      height = this.app.screen.height;
    this.zoomLevel = Math.min(
      width / (this.world.width * TILE + 160),
      height / (this.world.height * TILE + 160),
    );
    this.scene.scale.set(this.zoomLevel);
    this.scene.position.set(
      (width - this.world.width * TILE * this.zoomLevel) / 2,
      (height - this.world.height * TILE * this.zoomLevel) / 2,
    );
  }
  panBy(dx: number, dy: number): void {
    this.scene.x += dx;
    this.scene.y += dy;
  }
  zoom(factor: number): void {
    if (!this.canvas) return;
    this.zoomAt(factor, this.app.screen.width / 2, this.app.screen.height / 2);
  }
  private zoomAt(factor: number, x: number, y: number): void {
    const prev = this.zoomLevel;
    const fit = Math.min(
      this.app.screen.width / (this.world.width * TILE + 160),
      this.app.screen.height / (this.world.height * TILE + 160),
    );
    this.zoomLevel = Math.max(Math.min(0.18, fit * 0.5), Math.min(5, prev * factor));
    const f = this.zoomLevel / prev;
    this.scene.position.set(x - (x - this.scene.x) * f, y - (y - this.scene.y) * f);
    this.scene.scale.set(this.zoomLevel);
  }
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.scene.x) / this.zoomLevel / TILE,
      y: (clientY - r.top - this.scene.y) / this.zoomLevel / TILE,
    };
  }
  setBrush(x: number, y: number, radius: number, visible: boolean): void {
    this.brushState = { x, y, radius, visible };
  }
  effect(x: number, y: number, kind: string): void {
    const count = kind === 'meteor' ? 64 : kind === 'earthquake' ? 42 : 22;
    const durations: Record<string, number> = {
      lightning: 0.42,
      meteor: 1.05,
      blessing: 1.5,
      earthquake: 1.1,
      rain: 1.05,
    };
    if (durations[kind]) {
      if (this.powerVisuals.length >= 24) this.powerVisuals.shift();
      this.powerVisuals.push({
        x: x * TILE,
        y: y * TILE,
        kind,
        life: durations[kind],
        max: durations[kind],
        seed: Math.floor(Math.random() * 100000),
      });
    }
    if (this.particles.length + count > 1200)
      this.particles.splice(0, this.particles.length + count - 1200);
    const colors: Record<string, number> = {
      rain: 0x88d8ff,
      blessing: 0xffe69c,
      plague: 0xb1ec78,
      lightning: 0xf8f2ca,
      water: 0x6bd5d6,
      meteor: 0xffa45c,
      fire: 0xffa45c,
      erase: 0xd7e8e5,
    };
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2,
        v = 10 + Math.random() * 45;
      const life = 0.4 + Math.random() * 0.9;
      this.particles.push({
        x: x * TILE,
        y: y * TILE,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 8,
        life,
        max: life,
        color: colors[kind] ?? 0xe5dda9,
        size: 1 + Math.random() * 3,
      });
    }
  }

  render(dt: number): void {
    if (!this.canvas) return;
    this.time += Math.min(dt, 0.1);
    this.adaptResolution();
    const now = performance.now();
    if (
      (this.world.tick - this.lastTerrainScan >= 30 || this.world.tick < this.lastTerrainScan) &&
      now - this.lastTerrainScanWall >= 2000
    ) {
      const signature = this.getTerrainSignature();
      if (signature !== this.terrainSignature) this.terrainDirty = true;
      this.lastTerrainScan = this.world.tick;
      this.lastTerrainScanWall = now;
    }
    if (this.terrainDirty) {
      this.rebuildTerrain();
      this.terrainSignature = this.getTerrainSignature();
      this.lastTerrainScan = this.world.tick;
      this.lastTerrainScanWall = now;
      this.terrainDirty = false;
    }
    if (this.visualCacheDirty || this.lastFireTick !== this.world.tick) {
      this.fireIndices = [];
      for (let i = 0; i < this.world.tiles.length; i++)
        if (this.world.tiles[i].fire > 0) this.fireIndices.push(i);
      this.lastFireTick = this.world.tick;
    }
    if (this.visualCacheDirty) {
      this.refreshGlints();
      this.visualCacheDirty = false;
    }
    for (let i = 0; i < this.glints.length; i++)
      this.glints[i].alpha = (Math.sin(this.time * 0.8 + i * 2) + 1) * 0.065;
    this.drawTerritory();
    this.drawBuildings();
    this.drawActors();
    this.drawEffects(Math.min(dt, 0.1));
    const b = this.brushState;
    this.brush.clear();
    if (b.visible && b.x >= 0 && b.y >= 0 && b.x < this.world.width && b.y < this.world.height) {
      this.brush
        .circle(b.x * TILE, b.y * TILE, Math.max(0.5, b.radius) * TILE)
        .fill({ color: 0xf9e6b3, alpha: 0.09 })
        .stroke({ color: 0xffedb5, width: 1.5 / this.zoomLevel, alpha: 0.85 });
      this.brush.circle(b.x * TILE, b.y * TILE, 1.5 / this.zoomLevel).fill(0xffe9b2);
    }
    this.app.renderer.render(this.app.stage);
  }
  private adaptResolution(): void {
    const now = performance.now();
    if (!this.qualityStarted) {
      this.qualityStarted = now;
      return;
    }
    this.qualityFrames++;
    const elapsed = now - this.qualityStarted;
    if (elapsed < 3000 || this.qualityFrames < 15) return;
    const fps = (this.qualityFrames * 1000) / elapsed;
    const current = this.app.renderer.resolution;
    let next = current;
    if (fps < 32) next = Math.max(0.65, current * 0.8);
    // Recover detail only with sustained headroom, avoiding rapid quality oscillation.
    else if (fps > 57 && elapsed >= 8000) next = Math.min(this.baseResolution, current * 1.1);
    if (Math.abs(next - current) > 0.02)
      this.app.renderer.resize(this.app.screen.width, this.app.screen.height, next);
    if (fps < 32 || elapsed >= 8000) {
      this.qualityStarted = now;
      this.qualityFrames = 0;
    }
  }
  private refreshGlints(): void {
    for (const sprite of this.glints) sprite.destroy();
    this.glints = [];
    for (let i = 0; i < 65; i++) {
      const x = hash(i, 3, this.world.seed) * this.world.width,
        y = hash(i, 9, this.world.seed) * this.world.height;
      const tile = this.world.tiles[Math.floor(y) * this.world.width + Math.floor(x)];
      if (tile?.terrain !== 'water' && tile?.terrain !== 'ocean') continue;
      const sprite = new Sprite(Texture.WHITE);
      sprite.tint = 0xc0e9e2;
      sprite.position.set(x * TILE, y * TILE);
      sprite.width = 5 + Math.sin(i) * 3;
      sprite.height = 0.7;
      this.sea.addChild(sprite);
      this.glints.push(sprite);
    }
  }
  private getTerrainSignature(): number {
    let signature = 2166136261;
    const terrainCodes: Record<Terrain, number> = {
      ocean: 1,
      water: 2,
      sand: 3,
      grass: 4,
      forest: 5,
      mountain: 6,
      snow: 7,
      desert: 8,
    };
    for (const tile of this.world.tiles) {
      // Only the vegetation threshold affects the cached image; grazing does not
      // require a full-world texture upload unless a crown appears/disappears.
      const visual =
        terrainCodes[tile.terrain] * 32 +
        (tile.vegetation > 0.2 ? 16 : 0) +
        Math.round(tile.elevation * 8);
      signature = Math.imul(signature ^ visual, 16777619);
    }
    return signature >>> 0;
  }
  private rebuildTerrain(): void {
    const w = this.world;
    const reusable =
      this.terrainCanvas?.width === w.width * TILE &&
      this.terrainCanvas?.height === w.height * TILE;
    const c = reusable ? this.terrainCanvas! : document.createElement('canvas');
    if (!reusable) {
      c.width = w.width * TILE;
      c.height = w.height * TILE;
    }
    const ctx = c.getContext('2d')!;
    const terrain = (x: number, y: number): Terrain => w.tiles[y * w.width + x]?.terrain ?? 'ocean';
    const ground = document.createElement('canvas');
    ground.width = w.width * 4;
    ground.height = w.height * 4;
    const base = ground.getContext('2d')!;
    // Coherent broad variation replaces independent cell noise, so seas and
    // meadows read as continuous surfaces rather than checkerboard textures.
    const noise = (x: number, y: number) => {
      const gx = Math.floor(x / 6),
        gy = Math.floor(y / 6),
        fx = x / 6 - gx,
        fy = y / 6 - gy;
      const a = hash(gx, gy, w.seed),
        b = hash(gx + 1, gy, w.seed),
        c = hash(gx, gy + 1, w.seed),
        d = hash(gx + 1, gy + 1, w.seed);
      return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    };
    for (let y = 0; y < w.height; y++)
      for (let x = 0; x < w.width; x++) {
        const t = w.tiles[y * w.width + x],
          wet = t.terrain === 'ocean' || t.terrain === 'water';
        let color = TERRAIN_COLORS[t.terrain];
        let shade = (noise(x, y) - 0.5) * (wet ? 7 : 12) + (t.elevation - 0.5) * (wet ? 10 : 18);
        if (t.terrain === 'mountain' || t.terrain === 'snow') {
          const left = w.tiles[y * w.width + Math.max(0, x - 1)]?.elevation ?? t.elevation;
          const above = w.tiles[Math.max(0, y - 1) * w.width + x]?.elevation ?? t.elevation;
          shade += (t.elevation - left + t.elevation - above) * 190;
        }
        base.fillStyle = css(mix(color, Math.round(shade)));
        base.fillRect(x * 4, y * 4, 4, 4);
      }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ground, 0, 0, c.width, c.height);
    for (let y = 0; y < w.height; y++)
      for (let x = 0; x < w.width; x++) {
        const t = w.tiles[y * w.width + x],
          px = x * TILE,
          py = y * TILE,
          n = hash(x, y, w.seed);
        if (t.terrain === 'water' || t.terrain === 'ocean') {
          if (n > 0.94) {
            ctx.strokeStyle = 'rgba(158,221,217,.12)';
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(px + 2, py + 8);
            ctx.quadraticCurveTo(px + 7, py + 6, px + 13, py + 8);
            ctx.stroke();
          }
        } else if (t.terrain !== 'mountain' && t.terrain !== 'snow') {
          for (let k = 0; k < 2; k++) {
            const v = hash(x * 3 + k, y, w.seed + 2);
            ctx.fillStyle = k % 2 ? 'rgba(255,247,204,.10)' : 'rgba(28,58,39,.07)';
            ctx.fillRect(px + v * 13, py + hash(x, y * 3 + k) * 14, 1.7, 1);
          }
          // Small irregular surf highlights follow exposed northern shoreline.
          if (['ocean', 'water'].includes(terrain(x, y - 1)) && n > 0.35) {
            ctx.strokeStyle = 'rgba(240,238,199,.24)';
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(px + 1, py + 2);
            ctx.quadraticCurveTo(px + 8, py, px + 15, py + 2);
            ctx.stroke();
          }
        }
      }
    // Fine connected elevation contours give the rock a continuous folded
    // surface beneath the peaks, without replacing every tile with an icon.
    ctx.strokeStyle = 'rgba(44,67,70,.12)';
    ctx.lineWidth = 1.1;
    const isRock = (x: number, y: number) => ['mountain', 'snow'].includes(terrain(x, y));
    for (let level = 0.65; level < 0.9; level += 0.025) {
      ctx.beginPath();
      for (let y = 0; y < w.height - 1; y++)
        for (let x = 0; x < w.width - 1; x++) {
          if (!isRock(x, y) || !isRock(x + 1, y) || !isRock(x, y + 1) || !isRock(x + 1, y + 1))
            continue;
          const corners = [
            { x: x * TILE + 8, y: y * TILE + 8, h: w.tiles[y * w.width + x].elevation },
            { x: (x + 1) * TILE + 8, y: y * TILE + 8, h: w.tiles[y * w.width + x + 1].elevation },
            {
              x: (x + 1) * TILE + 8,
              y: (y + 1) * TILE + 8,
              h: w.tiles[(y + 1) * w.width + x + 1].elevation,
            },
            { x: x * TILE + 8, y: (y + 1) * TILE + 8, h: w.tiles[(y + 1) * w.width + x].elevation },
          ];
          const crossings: { x: number; y: number }[] = [];
          for (let i = 0; i < 4; i++) {
            const a = corners[i],
              b = corners[(i + 1) % 4];
            if (a.h < level !== b.h < level) {
              const t = (level - a.h) / (b.h - a.h);
              crossings.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            }
          }
          if (crossings.length === 2) {
            ctx.moveTo(crossings[0].x, crossings[0].y);
            ctx.lineTo(crossings[1].x, crossings[1].y);
          }
        }
      ctx.stroke();
    }
    // A range is continuous shaded relief with occasional large, irregular
    // peaks. It is deliberately not a repeated mountain icon on every tile.
    const peaks: { x: number; y: number; n: number; snow: boolean; density: number }[] = [];
    for (let by = 0; by < w.height; by += 7)
      for (let bx = 0; bx < w.width; bx += 7) {
        let highest = -1,
          bestX = bx,
          bestY = by,
          count = 0;
        for (let y = by; y < Math.min(by + 7, w.height); y++)
          for (let x = bx; x < Math.min(bx + 7, w.width); x++) {
            const t = w.tiles[y * w.width + x];
            if (t.terrain !== 'mountain' && t.terrain !== 'snow') continue;
            count++;
            if (t.elevation > highest) {
              highest = t.elevation;
              bestX = x;
              bestY = y;
            }
          }
        if (highest < 0 || peaks.some((p) => Math.hypot(p.x - bestX, p.y - bestY) < 5)) continue;
        const t = w.tiles[bestY * w.width + bestX];
        peaks.push({
          x: bestX,
          y: bestY,
          n: hash(bestX, bestY, w.seed + 9),
          snow: t.terrain === 'snow',
          density: Math.min(1, count / 16),
        });
      }
    peaks.sort((a, b) => a.y - b.y);
    for (const peak of peaks)
      this.paintPeak(ctx, peak.x * TILE + 8, peak.y * TILE + 13, peak.n, peak.snow, peak.density);
    // Vegetation is drawn after ground so crowns cast consistent shadows over neighboring cells.
    for (let y = 0; y < w.height; y++)
      for (let x = 0; x < w.width; x++) {
        const t = w.tiles[y * w.width + x],
          n = hash(x, y, w.seed + 4);
        if (
          (t.terrain === 'forest' || t.terrain === 'grass') &&
          t.vegetation > 0.2 &&
          n < (t.terrain === 'forest' ? 0.77 : 0.11)
        )
          this.paintTree(
            ctx,
            x * TILE + 3 + hash(x, y, w.seed + 13) * 10,
            y * TILE + 3 + hash(x, y, w.seed + 19) * 10,
            n,
            t.terrain === 'forest',
          );
        if (t.terrain === 'desert' && n > 0.96) {
          ctx.fillStyle = '#6a8a63';
          ctx.fillRect(x * TILE + 8, y * TILE + 4, 2, 8);
          ctx.fillRect(x * TILE + 5, y * TILE + 5, 2, 4);
          ctx.fillRect(x * TILE + 6, y * TILE + 8, 4, 2);
        }
      }
    // Bake static sunlight into the cached ground instead of blending an
    // extra full-world translucent quad on every frame.
    ctx.save();
    ctx.scale(c.width / 512, c.height / 512);
    const sunlight = ctx.createRadialGradient(70, 30, 10, 190, 180, 560);
    sunlight.addColorStop(0, 'rgba(255,230,170,.10)');
    sunlight.addColorStop(0.55, 'rgba(238,232,188,.015)');
    sunlight.addColorStop(1, 'rgba(9,28,44,.12)');
    ctx.fillStyle = sunlight;
    ctx.fillRect(0, 0, 512, 512);
    ctx.restore();
    if (reusable && this.terrainTexture) {
      this.terrainTexture.source.update();
    } else {
      const old = this.terrainTexture;
      this.terrainCanvas = c;
      this.terrainTexture = Texture.from(c);
      this.terrain.texture = this.terrainTexture;
      old?.destroy(true);
    }
  }
  private paintPeak(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    n: number,
    snow: boolean,
    density: number,
  ): void {
    const size = 0.5 + density * 0.5,
      width = (35 + n * 28) * size,
      height = (37 + n * 35) * size,
      apex = x - width * 0.12;
    const shadow = ctx.createRadialGradient(x + 8, y + 2, 2, x + 8, y + 2, width * 1.2);
    shadow.addColorStop(0, 'rgba(23,39,42,.28)');
    shadow.addColorStop(1, 'rgba(23,39,42,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(x - width * 1.2, y - width, width * 2.4, width * 2);
    ctx.beginPath();
    ctx.moveTo(x - width, y);
    ctx.lineTo(x - width * 0.65, y - height * 0.27);
    ctx.lineTo(apex - width * 0.32, y - height * 0.55);
    ctx.lineTo(apex, y - height);
    ctx.lineTo(x + width * 0.26, y - height * 0.6);
    ctx.lineTo(x + width * 0.62, y - height * 0.32);
    ctx.lineTo(x + width, y);
    ctx.closePath();
    const lit = ctx.createLinearGradient(x - width, y - height, x + width, y);
    lit.addColorStop(0, snow ? '#e1e6d9' : '#b4b7a2');
    lit.addColorStop(0.5, snow ? '#becdc5' : '#909d93');
    lit.addColorStop(1, snow ? '#819b9e' : '#5b7479');
    ctx.fillStyle = lit;
    ctx.fill();
    ctx.fillStyle = snow ? '#91a9aa' : '#667f80';
    ctx.beginPath();
    ctx.moveTo(apex, y - height);
    ctx.lineTo(x + width * 0.26, y - height * 0.6);
    ctx.lineTo(x + width * 0.62, y - height * 0.32);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width * 0.04, y - height * 0.17);
    ctx.lineTo(apex + width * 0.06, y - height * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = snow ? 'rgba(238,242,222,.65)' : 'rgba(217,220,192,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.65, y - height * 0.27);
    ctx.lineTo(apex - width * 0.32, y - height * 0.55);
    ctx.lineTo(apex, y - height);
    ctx.lineTo(apex - width * 0.16, y - height * 0.42);
    ctx.lineTo(x - width * 0.14, y - height * 0.2);
    ctx.stroke();
    if (snow || n > 0.72) {
      ctx.fillStyle = '#e7ead9';
      ctx.beginPath();
      ctx.moveTo(apex, y - height);
      ctx.lineTo(apex - width * 0.3, y - height * 0.58);
      ctx.lineTo(apex - width * 0.12, y - height * 0.65);
      ctx.lineTo(apex + width * 0.05, y - height * 0.48);
      ctx.lineTo(apex + width * 0.16, y - height * 0.65);
      ctx.lineTo(apex + width * 0.3, y - height * 0.56);
      ctx.closePath();
      ctx.fill();
    }
  }
  private paintTree(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    n: number,
    forest: boolean,
  ): void {
    const r = forest ? 4 + n * 3 : 4;
    ctx.fillStyle = 'rgba(13,35,31,.24)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 4, r + 2, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d6040';
    ctx.fillRect(x - 1, y, 2, 6);
    ctx.fillStyle = forest ? '#274d41' : '#3d744f';
    ctx.beginPath();
    ctx.arc(x, y - 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = forest ? '#3e7152' : '#61905c';
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 4, r * 0.83, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = forest ? '#608758' : '#88a968';
    ctx.beginPath();
    ctx.arc(x - 2, y - 5, r * 0.47, 0, Math.PI * 2);
    ctx.fill();
  }
  private drawTerritory(): void {
    this.territory.visible = this.showTerritory;
    if (!this.showTerritory) return;
    const stamp = Math.floor(this.world.tick / 50);
    if (stamp === this.lastTerritory) return;
    this.lastTerritory = stamp;
    this.territory.clear();
    const w = this.world;
    for (let i = 0; i < w.tiles.length; i++) {
      const t = w.tiles[i];
      if (t.owner > 0) {
        const k = w.kingdoms.find((k) => k.id === t.owner);
        if (k)
          this.territory
            .rect((i % w.width) * TILE, Math.floor(i / w.width) * TILE, TILE, TILE)
            .fill({ color: k.color, alpha: 0.18 });
      }
    }
  }
  private drawActors(): void {
    const live = new Set<number>();
    for (const e of this.world.entities) {
      live.add(e.id);
      let s = this.actorSprites.get(e.id);
      if (!s) {
        s = new Sprite(this.creatureTextures.get(e.species));
        s.anchor.set(0.5, 0.8);
        this.actorSprites.set(e.id, s);
        this.actors.addChild(s);
      }
      const moving = Math.abs(e.targetX - e.x) + Math.abs(e.targetY - e.y) > 0.15;
      const bob = moving
        ? Math.sin(this.time * 10 + e.id) * 0.6
        : Math.sin(this.time * 2 + e.id) * 0.12;
      s.position.set(e.x * TILE, e.y * TILE + bob);
      s.zIndex = e.y;
      const direction = e.targetX < e.x ? -1 : 1;
      s.scale.set(direction, 1 + (moving ? Math.sin(this.time * 10 + e.id) * 0.035 : 0));
      s.tint =
        e.traits.includes('plague') || e.traits.includes('infected')
          ? 0xb1cd89
          : e.traits.includes('blessed')
            ? 0xffecb3
            : 0xffffff;
    }
    for (const [id, s] of this.actorSprites)
      if (!live.has(id)) {
        s.destroy();
        this.actorSprites.delete(id);
      }
  }
  private drawBuildings(): void {
    const live = new Set<number>();
    for (const b of this.world.buildings) {
      live.add(b.id);
      let s = this.buildingSprites.get(b.id);
      if (!s) {
        s = new Sprite(this.buildingTextures.get(b.kind));
        s.anchor.set(0.5, 0.8);
        s.position.set(b.x * TILE, b.y * TILE);
        s.zIndex = b.y;
        this.buildings.addChild(s);
        this.buildingSprites.set(b.id, s);
      }
    }
    for (const [id, s] of this.buildingSprites)
      if (!live.has(id)) {
        s.destroy();
        this.buildingSprites.delete(id);
      }
  }
  private drawEffects(dt: number): void {
    this.effects.clear();
    for (const i of this.fireIndices) {
      const x = ((i % this.world.width) + 0.5) * TILE,
        y = (Math.floor(i / this.world.width) + 0.5) * TILE;
      const pulse = Math.sin(this.time * 12 + i) * 2;
      this.effects.circle(x, y, 9 + pulse).fill({ color: 0xf6a44b, alpha: 0.12 });
      this.effects.ellipse(x, y - 3, 3, 6 + pulse).fill({ color: 0xff9c45, alpha: 0.9 });
      this.effects.ellipse(x, y - 3, 1.5, 3 + pulse * 0.5).fill(0xffe3a0);
    }
    this.drawPowerVisuals(dt);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 18 * dt;
      if (p.life > 0)
        this.effects
          .circle(p.x, p.y, p.size * Math.max(0.2, p.life / p.max))
          .fill({ color: p.color, alpha: Math.min(1, (p.life / p.max) * 2) });
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const b of this.world.buildings) {
      if (b.kind !== 'hall') continue;
      const kingdom = this.world.kingdoms.find((k) => k.id === b.kingdom);
      if (!kingdom) continue;
      const x = b.x * TILE + 8,
        y = b.y * TILE - 33;
      this.effects
        .poly([x, y, x + 8, y + Math.sin(this.time * 2 + b.id) * 0.6, x + 7, y + 5, x, y + 5])
        .fill(kingdom.color);
    }
  }
  private drawPowerVisuals(dt: number): void {
    const g = this.effects;
    for (const v of this.powerVisuals) {
      v.life -= dt;
      if (v.life <= 0) continue;
      const age = v.max - v.life,
        p = age / v.max,
        fade = Math.min(1, v.life * 3),
        x = v.x,
        y = v.y;
      if (v.kind === 'lightning') {
        const points: number[] = [];
        for (let i = 0; i < 8; i++)
          points.push(x + (i === 7 ? 0 : (hash(i, v.seed) - 0.5) * 30), y - 170 + i * (170 / 7));
        const pulse = (0.7 + 0.3 * Math.sin(age * 60)) * fade;
        g.circle(x, y, 32).fill({ color: 0xd8edff, alpha: 0.12 * pulse });
        for (const [width, alpha, color] of [
          [13, 0.12, 0x9edbff],
          [5, 0.4, 0xbde5ff],
          [1.8, 1, 0xfff9e3],
        ] as const) {
          g.moveTo(points[0], points[1]);
          for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
          g.stroke({ width, color, alpha: alpha * pulse });
        }
        for (const i of [2, 4])
          g.moveTo(points[i * 2], points[i * 2 + 1])
            .lineTo(points[i * 2] + 22, points[i * 2 + 1] + 14)
            .lineTo(points[i * 2] + 15, points[i * 2 + 1] + 29)
            .stroke({ width: 1, color: 0xe5f4ff, alpha: pulse * 0.7 });
        g.circle(x, y, 6 + age * 25).stroke({ width: 1.5, color: 0xe7f6ff, alpha: fade * 0.7 });
      } else if (v.kind === 'meteor') {
        const travel = Math.min(1, age / 0.22),
          headX = x - 105 * (1 - travel),
          headY = y - 185 * (1 - travel);
        if (travel < 1) {
          g.moveTo(headX - 42, headY - 74)
            .lineTo(headX, headY)
            .stroke({ width: 12, color: 0xffa15d, alpha: 0.12 });
          g.moveTo(headX - 34, headY - 60)
            .lineTo(headX, headY)
            .stroke({ width: 4, color: 0xffcd8e, alpha: 0.8 });
          g.circle(headX, headY, 6).fill({ color: 0xffa254, alpha: 0.6 });
          g.circle(headX, headY, 3).fill(0xffefd0);
        } else {
          const t = (age - 0.22) / 0.83,
            radius = 8 + t * 70;
          g.circle(x, y, radius).stroke({
            width: 3 * (1 - t) + 0.6,
            color: 0xeec08a,
            alpha: (1 - t) * 0.65,
          });
          g.circle(x, y, radius * 0.62).stroke({
            width: 1,
            color: 0xffd7a0,
            alpha: (1 - t) * 0.32,
          });
          if (t < 0.3)
            g.circle(x, y, 18 + t * 55).fill({ color: 0xffbc69, alpha: (0.3 - t) * 0.7 });
        }
      } else if (v.kind === 'blessing') {
        const breathe = Math.sin(p * Math.PI),
          rise = age * 13;
        g.ellipse(x, y, 24 + age * 7, 12 + age * 3).fill({
          color: 0xffd66f,
          alpha: breathe * 0.12,
        });
        g.ellipse(x, y, 22 + age * 8, 11 + age * 4).stroke({
          width: 1.2,
          color: 0xffe8a4,
          alpha: breathe * 0.8,
        });
        g.ellipse(x, y - rise, 17 + Math.sin(age * 3) * 3, 8).stroke({
          width: 1,
          color: 0xfff0ba,
          alpha: breathe * 0.55,
        });
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + age * 0.5,
            sx = x + Math.cos(a) * 25,
            sy = y + Math.sin(a) * 12 - rise;
          const size = 1.5 + Math.sin(age * 7 + i) * 0.6;
          g.moveTo(sx - size * 2, sy)
            .lineTo(sx + size * 2, sy)
            .moveTo(sx, sy - size * 2)
            .lineTo(sx, sy + size * 2)
            .stroke({ width: 0.9, color: 0xfff0bb, alpha: breathe });
        }
      } else if (v.kind === 'earthquake') {
        for (let i = 0; i < 3; i++) {
          const phase = p - i * 0.16;
          if (phase < 0) continue;
          g.ellipse(x, y, 8 + phase * 85, 4 + phase * 42).stroke({
            width: 2 - i * 0.35,
            color: i % 2 ? 0xe7c7a0 : 0xd7e2ce,
            alpha: Math.max(0, 1 - phase) * 0.6,
          });
        }
        const crack = [
          x - 36,
          y + 9,
          x - 20,
          y + 3,
          x - 9,
          y + 9,
          x + 1,
          y - 5,
          x + 14,
          y - 1,
          x + 30,
          y - 13,
        ];
        g.moveTo(crack[0], crack[1]);
        for (let i = 2; i < crack.length; i += 2) g.lineTo(crack[i], crack[i + 1]);
        g.stroke({ width: 1.6, color: 0x354c46, alpha: fade * 0.7 });
      } else if (v.kind === 'rain') {
        g.ellipse(x, y - 5, 35, 24).fill({ color: 0x80bfe0, alpha: Math.sin(p * Math.PI) * 0.055 });
        for (let i = 0; i < 18; i++) {
          const rx = x + (hash(i, v.seed) - 0.5) * 75,
            ry = y - 53 + ((age * 100 + hash(i + 23, v.seed) * 85) % 85);
          g.moveTo(rx, ry)
            .lineTo(rx - 3, ry + 10)
            .stroke({ width: 1, color: 0xb6e4f5, alpha: fade * 0.7 });
          if (i % 6 === 0)
            g.ellipse(
              rx - 3,
              y + hash(i + 7, v.seed) * 20 - 10,
              3 + ((age * 14 + i) % 4),
              1.5,
            ).stroke({ width: 0.7, color: 0xa8d9e9, alpha: fade * 0.4 });
        }
      }
    }
    this.powerVisuals = this.powerVisuals.filter((v) => v.life > 0);
  }
  private makeCreature(species: Species): Texture {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 24;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(9,30,29,.3)';
    g.beginPath();
    g.ellipse(12, 19, 5, 2, 0, 0, Math.PI * 2);
    g.fill();
    if (species === 'sheep' || species === 'wolf') {
      g.fillStyle = species === 'sheep' ? '#4f5650' : '#394b4a';
      g.fillRect(7, 16, 2, 4);
      g.fillRect(15, 16, 2, 4);
      g.fillStyle = species === 'sheep' ? '#e5e4ce' : '#7c8a82';
      g.beginPath();
      g.ellipse(11, 14, 7, 4.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = species === 'sheep' ? '#f8f1dd' : '#a7b1a1';
      g.beginPath();
      g.ellipse(9, 12, 5, 2.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = species === 'sheep' ? '#9b9b84' : '#637773';
      g.fillRect(16, 10, 5, 6);
      g.fillRect(16, 8, 2, 4);
      g.fillStyle = '#263d37';
      g.fillRect(19, 12, 1, 1);
    } else {
      const clothes = species === 'human' ? '#7299ae' : species === 'elf' ? '#7bb283' : '#a47e61';
      const skin = species === 'orc' ? '#9aaa72' : '#efc29b';
      g.fillStyle = '#354845';
      g.fillRect(9, 16, 2.5, 4);
      g.fillRect(13, 16, 2.5, 4);
      g.fillStyle = clothes;
      g.beginPath();
      g.roundRect(8, 10, 9, 7, 2);
      g.fill();
      g.fillStyle = skin;
      g.fillRect(6, 11, 2, 5);
      g.fillRect(17, 11, 2, 4);
      g.beginPath();
      g.arc(12, 7.5, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = species === 'elf' ? '#c8bb79' : species === 'orc' ? '#4b5740' : '#5a4638';
      g.beginPath();
      g.arc(12, 6, 4, Math.PI, Math.PI * 2);
      g.fill();
      g.fillStyle = '#35433b';
      g.fillRect(13, 7, 1, 1);
      if (species === 'elf') {
        g.fillStyle = skin;
        g.beginPath();
        g.moveTo(7, 6);
        g.lineTo(4, 4);
        g.lineTo(8, 10);
        g.fill();
      }
    }
    return Texture.from(c);
  }
  private makeBuilding(kind: string): Texture {
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 48;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(16,39,34,.28)';
    g.beginPath();
    g.ellipse(26, 38, 19, 6, 0, 0, Math.PI * 2);
    g.fill();
    if (kind === 'farm') {
      g.fillStyle = '#87794d';
      g.fillRect(7, 17, 32, 22);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i % 2 ? '#c3ad65' : '#8f9c57';
        g.fillRect(9, 19 + i * 4, 28, 2);
      }
      g.strokeStyle = '#c5b68a';
      g.lineWidth = 1.5;
      g.strokeRect(6, 16, 34, 24);
    } else {
      const tower = kind === 'tower',
        hall = kind === 'hall';
      const x = hall ? 7 : 12,
        w = hall ? 33 : 24,
        y = tower ? 9 : 20,
        h = tower ? 29 : 18;
      g.fillStyle = '#c5ba91';
      g.fillRect(x, y, w, h);
      g.fillStyle = '#978e75';
      g.fillRect(x + w - 8, y, 8, h);
      g.fillStyle = '#676d5a';
      g.fillRect(x + 4, y + 4, 4, 5);
      g.fillRect(x + w - 9, y + 4, 4, 5);
      g.fillStyle = '#5c594a';
      g.fillRect(x + w / 2 - 3, y + h - 9, 6, 9);
      g.fillStyle = '#ac6854';
      g.beginPath();
      g.moveTo(x - 3, y + 1);
      g.lineTo(x + w / 2, y - 13);
      g.lineTo(x + w + 3, y + 1);
      g.closePath();
      g.fill();
      g.fillStyle = '#c68865';
      g.beginPath();
      g.moveTo(x - 3, y + 1);
      g.lineTo(x + w / 2, y - 13);
      g.lineTo(x + w / 2, y + 1);
      g.fill();
      g.fillStyle = '#d5a778';
      g.fillRect(x - 3, y, w + 6, 2);
      if (hall) {
        g.fillStyle = '#7f8971';
        g.fillRect(29, 5, 3, 10);
        g.fillStyle = '#e7c16f';
        g.fillRect(32, 5, 8, 5);
      }
    }
    return Texture.from(c);
  }
  destroy(): void {
    this.observer?.disconnect();
    for (const dispose of this.disposers) dispose();
    this.app?.destroy(true, { children: true });
    for (const t of this.creatureTextures.values()) t.destroy(true);
    for (const t of this.buildingTextures.values()) t.destroy(true);
    this.terrainTexture?.destroy(true);
  }
}
