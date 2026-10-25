import { generateWorld } from './world/generate';
import { spawnEntity, tickWorld } from './sim/core';
import { tickCivilizations } from './sim/civilizations';
import { WorldRenderer } from './render/renderer';
import { GameUI } from './ui/ui';
import { applyPower, tickPowers } from './systems/powers';
import { saveWorld, loadWorld } from './systems/storage';
import { GameAudio } from './systems/audio';
import { walkable, type Power, type World } from './types';
import './ui/style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
const stage = document.createElement('div');
stage.id = 'world-stage';
const hud = document.createElement('div');
hud.id = 'hud';
app.append(stage, hud);
stage.style.cssText = 'position:fixed;inset:0;touch-action:none;background:#173c56';
let world: World,
  freshWorld = true,
  startupMessage = '',
  autosaveEnabled = true;
try {
  const saved = loadWorld();
  world = saved ?? generateWorld(48271, 128, 96);
  freshWorld = !saved;
  if (saved) startupMessage = 'Welcome back. Your saved world has been restored.';
} catch {
  world = generateWorld(48271, 128, 96);
  autosaveEnabled = false;
  startupMessage =
    'Your saved world could not be read. A new world is open; the old save is preserved until you save again.';
}
let speed = 1,
  paused = false,
  tool: Power = 'inspect',
  brush = 2,
  frames = 0,
  fps = 60;
let accumulator = 0,
  last = performance.now(),
  lastSimulation = last,
  lastStats = last,
  painting = false,
  lastPaint = 0;
let pointer = { x: 0, y: 0 };
const renderer = new WorldRenderer();
const audio = new GameAudio();

function seedLife(w: World): void {
  const spots = w.tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => walkable(t) && t.terrain === 'grass');
  if (!spots.length) return;
  const starts = [0.22, 0.51, 0.78].map((f) => spots[Math.floor(spots.length * f)].i);
  starts.forEach((idx, k) => {
    const x = idx % w.width,
      y = Math.floor(idx / w.width);
    for (let n = 0; n < 12; n++)
      spawnEntity(
        w,
        (['human', 'elf', 'orc'] as const)[k],
        x + ((n % 4) - 2) * 0.5,
        y + (Math.floor(n / 4) - 1) * 0.5,
      );
  });
  for (let n = 0; n < 32; n++) {
    const i = spots[Math.floor(((n + 0.5) / 32) * spots.length)].i;
    spawnEntity(
      w,
      n % 9 === 0 ? 'wolf' : 'sheep',
      (i % w.width) + 0.5,
      Math.floor(i / w.width) + 0.5,
    );
  }
}
if (freshWorld) seedLife(world);
function notifyError(error: unknown) {
  console.error(error);
  ui.toast(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
}
function save(manual = true) {
  if (!manual && !autosaveEnabled) return;
  try {
    saveWorld(world);
    autosaveEnabled = true;
    if (manual) ui.toast('World saved on this device.');
  } catch (e) {
    notifyError(e);
  }
}
const ui = new GameUI(hud, {
  tool: (p) => {
    tool = p;
    renderer.panMode = p === 'inspect';
  },
  brush: (n) => (brush = n),
  speed: (n) => {
    speed = n;
    paused = false;
  },
  pause: () => {
    paused = !paused;
  },
  generate: (seed, size, style) => {
    const sizes = { small: [96, 72], medium: [128, 96], large: [192, 144] } as const;
    const [w, h] = sizes[size];
    world = generateWorld(seed, w, h, style);
    seedLife(world);
    renderer.setWorld(world);
    accumulator = 0;
    paused = false;
    autosaveEnabled = true;
    ui.toast(`${world.name} is born. A new story begins.`);
  },
  save: () => save(),
  load: () => {
    try {
      const restored = loadWorld();
      if (!restored) {
        ui.toast('No saved world yet. Save your world first.');
        return;
      }
      world = restored;
      renderer.setWorld(world);
      accumulator = 0;
      ui.toast('Your world has been restored.');
    } catch (e) {
      notifyError(e);
    }
  },
  zoom: (f) => renderer.zoom(f),
  resetCamera: () => renderer.resetCamera(),
  territory: (on) => {
    renderer.showTerritory = on;
    renderer.invalidateTerrain();
  },
  sound: (on) => audio.setEnabled(on),
});

function paint(event: PointerEvent): void {
  const p = renderer.screenToWorld(event.clientX, event.clientY);
  pointer = p;
  if (tool === 'inspect') {
    ui.inspect(world, p.x, p.y);
    return;
  }
  const result = applyPower(world, tool, p.x, p.y, brush);
  if (result.changed) {
    renderer.invalidateTerrain();
    if (result.effect) renderer.effect(p.x, p.y, result.effect);
    audio.play(result.effect ?? tool);
  }
}
async function boot() {
  await renderer.init(stage, world);
  renderer.panMode = true;
  const canvas = renderer.canvas;
  canvas.setAttribute(
    'aria-label',
    'MadBox world. Left drag to use a power, right drag to pan, scroll to zoom.',
  );
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (tool === 'inspect') {
      paint(e);
      return;
    }
    if (renderer.isNavigating) return;
    painting = true;
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType !== 'touch') paint(e);
    lastPaint = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer = renderer.screenToWorld(e.clientX, e.clientY);
    if (
      painting &&
      e.pointerType !== 'touch' &&
      !renderer.isNavigating &&
      tool !== 'inspect' &&
      performance.now() - lastPaint > 65
    ) {
      paint(e);
      lastPaint = performance.now();
    }
  });
  const release = () => {
    painting = false;
  };
  canvas.addEventListener('pointerup', (e) => {
    if (painting && e.pointerType === 'touch' && !renderer.isNavigating) paint(e);
  });
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => renderer.setBrush(0, 0, 0, false));
  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('keydown', (e) => {
    if (
      (e.target as HTMLElement).matches('input,select,textarea') ||
      document.querySelector('[role="dialog"]')
    )
      return;
    if (e.code === 'Space') {
      e.preventDefault();
      paused = !paused;
    }
    if (e.key === 'Escape') {
      tool = 'inspect';
      renderer.panMode = true;
      painting = false;
    }
    if (e.key === 'Home') {
      renderer.resetCamera();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
    if (e.key === '+' || e.key === '=') renderer.zoom(1.15);
    if (e.key === '-') renderer.zoom(1 / 1.15);
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      renderer.panBy(
        e.key === 'ArrowLeft' ? 40 : e.key === 'ArrowRight' ? -40 : 0,
        e.key === 'ArrowUp' ? 40 : e.key === 'ArrowDown' ? -40 : 0,
      );
    }
    if (['1', '2', '3', '4'].includes(e.key)) {
      speed = [1, 2, 5, 10][Number(e.key) - 1];
      paused = false;
    }
  });
  document.addEventListener('visibilitychange', () => {
    accumulator = 0;
    last = performance.now();
    lastSimulation = last;
  });
  // Keep the fixed simulation clock independent of GPU presentation. Slow GPUs
  // may throttle requestAnimationFrame while the browser can still run timers.
  setInterval(advanceSimulation, 100);
  setInterval(() => save(false), 60000);
  ui.update(world, { fps, speed, paused, tool, brush });
  if (startupMessage) ui.toast(startupMessage);
  requestAnimationFrame(frame);
}
function advanceSimulation() {
  const now = performance.now();
  const dt = Math.min((now - lastSimulation) / 1000, 0.25);
  lastSimulation = now;
  if (!paused && !document.hidden) {
    accumulator += dt * speed;
    let steps = 0;
    while (accumulator >= 0.1 && steps++ < 30) {
      tickWorld(world);
      tickCivilizations(world);
      tickPowers(world);
      accumulator -= 0.1;
    }
  } else accumulator = 0;
}
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  renderer.setBrush(pointer.x, pointer.y, brush, tool !== 'inspect');
  renderer.render(dt);
  frames++;
  if (now - lastStats > 250) {
    fps = Math.round((frames * 1000) / (now - lastStats));
    frames = 0;
    lastStats = now;
    ui.update(world, { fps, speed, paused, tool, brush });
  }
  requestAnimationFrame(frame);
}
// Serializable state only; a small read-only browser QA hook for integration checks.
Object.defineProperty(window, 'madbox', {
  value: {
    get world() {
      return world;
    },
    get paused() {
      return paused;
    },
    get speed() {
      return speed;
    },
  },
});
boot().catch((e) => {
  console.error(e);
  stage.innerHTML =
    '<div style="padding:100px 24px;color:white;font:18px system-ui">MadBox could not start its graphics renderer. Please enable hardware acceleration and reload.</div>';
  ui.toast('Graphics startup failed. Please reload or try a browser with WebGL.');
});
