import { TERRAIN_COLORS, tileAt, type Power, type World } from '../types';
import './style.css';

export interface UIActions {
  tool: (p: Power) => void;
  brush: (n: number) => void;
  speed: (n: number) => void;
  pause: () => void;
  generate: (
    seed: number,
    size: 'small' | 'medium' | 'large',
    style: 'continents' | 'islands' | 'pangaea',
  ) => void;
  save: () => void;
  load: () => void;
  zoom: (factor: number) => void;
  resetCamera: () => void;
  territory: (on: boolean) => void;
  sound: (on: boolean) => void;
}
interface Tool {
  id: Power;
  name: string;
  icon: string;
  detail: string;
  color: string;
}
const paths: Record<string, string> = {
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z',
  leaf: 'M20 4C9 2 3 8 5 15s14 7 15-11ZM5 20 15 10M10 15v-4m0 4h5',
  tree: 'm12 3-6 8h3l-5 6h7v4h2v-4h7l-5-6h3Z',
  sand: 'M3 18h18M4 14c5-6 11 5 16-2M6 9h.01M17 6h.01M11 5h.01',
  water: 'M12 3C10 7 5 11 5 15a7 7 0 0 0 14 0c0-4-5-8-7-12ZM8 15c0 2 1 3 3 3',
  mountain: 'm2 20 7-14 4 7 3-5 6 12ZM6 12l3 2 2-3m3 0 2 3 2-2',
  snow: 'M12 2v20M3.4 7l17.2 10M3.4 17 20.6 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4m12 14-1-4 4-1M3 14l4 1-1 4M18 5l-1 4 4 1',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
  person: 'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8 21v-7H5l2-4h10l2 4h-3v7m-4-7v7',
  elf: 'M9 8 4 5l2 7m9-4 5-3-2 7M9 5a3 3 0 0 1 6 0v3a3 3 0 0 1-6 0Zm-2 16v-5a5 5 0 0 1 10 0v5M12 15v6',
  orc: 'm5 6 3 2m11-2-3 2M6 8c0-7 12-7 12 0v5a6 6 0 0 1-12 0ZM8 12h1m6 0h1M8 17v-3m8 3v-3M6 22v-2m12 2v-2',
  sheep:
    'M5 10a3 3 0 0 1 3-5 3 3 0 0 1 5 0 3 3 0 0 1 4 3l4 1-1 6h-4a6 6 0 0 1-10 1 3 3 0 0 1-1-6ZM7 17v4m7-4v4M18 10h.01',
  wolf: 'm4 6 5 3 3-1 3 1 5-3-2 9-6 6-6-6ZM8 13h1m6 0h1m-5 3h2',
  fire: 'M13 2c2 7 7 8 7 13a8 8 0 1 1-16 0c0-3 2-5 4-7 0 4 2 4 3 3 2-2 2-5 2-9ZM12 14c-4 4-3 7 0 7s4-3 0-7Z',
  meteor: 'm9 4-5 9m12-8-5 9m9-5-5 9M13 13a6 6 0 1 0-8 8 6 6 0 0 0 8-8ZM8 17h.01',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7Z',
  rain: 'M7 14a5 5 0 1 1 2-9 6 6 0 0 1 11 4 3 3 0 0 1-1 5ZM7 17l-1 3m7-3-1 4m7-4-1 3',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
  plague:
    'M12 6v3m0 6v3M6 12h3m6 0h3M8 8l2 2m4 4 2 2M8 16l2-2m4-4 2-2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  quake: 'M3 7h7l-3 5 8-2-3 6h9M12 2l-1 4m2 13-1 3',
  erase: 'm15 3 6 6-10 11H6l-4-4ZM9 9l6 6M11 20h11',
  inspect: 'M11 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 13 5 5M11 7v5m0 2h.01',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 4 12 8-12 8Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  save: 'M5 3h12l4 4v14H3V3ZM7 3v6h9V3M7 21v-8h10v8',
  load: 'M3 20V6h7l2 3h9v11ZM12 11v7m-3-3 3 3 3-3',
  help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',
  close: 'M6 6l12 12M6 18 18 6',
  crown: 'm3 6 4 5 5-7 5 7 4-5-2 13H5Z',
  chevron: 'm8 5 7 7-7 7',
  layers: 'm12 3 10 6-10 6L2 9Zm-9 11 9 5 9-5M3 18l9 5 9-5',
};
function icon(name: string, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.star}"/></svg>`;
}
const tools: Record<string, Tool[]> = {
  shape: [
    {
      id: 'grass',
      name: 'Grassland',
      icon: 'leaf',
      detail: 'Paint fertile meadows',
      color: '#a6cc84',
    },
    {
      id: 'forest',
      name: 'Forest',
      icon: 'tree',
      detail: 'Grow a living woodland',
      color: '#79b89b',
    },
    { id: 'sand', name: 'Sand', icon: 'sand', detail: 'Sculpt golden beaches', color: '#e7ce98' },
    {
      id: 'water',
      name: 'Water',
      icon: 'water',
      detail: 'Carve lakes and oceans',
      color: '#80bfd3',
    },
    {
      id: 'mountain',
      name: 'Mountain',
      icon: 'mountain',
      detail: 'Raise rocky peaks',
      color: '#b8c1c8',
    },
    { id: 'snow', name: 'Snow', icon: 'snow', detail: 'Bring an alpine winter', color: '#dce9ee' },
    {
      id: 'desert',
      name: 'Desert',
      icon: 'sun',
      detail: 'Create arid wilderness',
      color: '#d7aa74',
    },
  ],
  life: [
    {
      id: 'human',
      name: 'Humans',
      icon: 'person',
      detail: 'Resourceful kingdom builders',
      color: '#e7bd95',
    },
    {
      id: 'elf',
      name: 'Elves',
      icon: 'elf',
      detail: 'Guardians of the woodland',
      color: '#a8d4a7',
    },
    {
      id: 'orc',
      name: 'Orcs',
      icon: 'orc',
      detail: 'A fierce, ambitious civilization',
      color: '#c6cf85',
    },
    {
      id: 'sheep',
      name: 'Sheep',
      icon: 'sheep',
      detail: 'Peaceful grazing wildlife',
      color: '#eee5d5',
    },
    {
      id: 'wolf',
      name: 'Wolves',
      icon: 'wolf',
      detail: 'Wild predators of the forest',
      color: '#b2c4cf',
    },
  ],
  powers: [
    { id: 'fire', name: 'Fire', icon: 'fire', detail: 'Ignite the world', color: '#edaa72' },
    {
      id: 'meteor',
      name: 'Meteor',
      icon: 'meteor',
      detail: 'Call a devastating impact',
      color: '#ed8f70',
    },
    {
      id: 'lightning',
      name: 'Lightning',
      icon: 'bolt',
      detail: 'Strike from the heavens',
      color: '#edda86',
    },
    {
      id: 'rain',
      name: 'Rain',
      icon: 'rain',
      detail: 'Extinguish fires and restore life',
      color: '#8dc8e5',
    },
    {
      id: 'blessing',
      name: 'Blessing',
      icon: 'star',
      detail: 'Heal and empower creatures',
      color: '#e6cf90',
    },
    {
      id: 'plague',
      name: 'Plague',
      icon: 'plague',
      detail: 'Release a spreading disease',
      color: '#bd9ce1',
    },
    {
      id: 'earthquake',
      name: 'Earthquake',
      icon: 'quake',
      detail: 'Shake the foundations',
      color: '#c9ac93',
    },
    {
      id: 'erase',
      name: 'Erase',
      icon: 'erase',
      detail: 'Remove creatures and buildings',
      color: '#c7a1a4',
    },
  ],
};
const format = (n: number) => Math.floor(n).toLocaleString();
export class GameUI {
  private root: HTMLElement;
  private soundEnabled = false;
  private currentTab = 'shape';
  private selected: Power = 'inspect';
  private brush = 2;
  private world?: World;
  private lastMap = -1000;
  private lastEvents = '';
  private lastKingdoms = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private modal: HTMLElement;
  private previousFocus: HTMLElement | null = null;
  private titleScreen = false;
  constructor(
    host: HTMLElement,
    private actions: UIActions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'madbox-ui';
    host.append(this.root);
    this.root.innerHTML = `
      <header class="mb-header">
        <div class="mb-brand"><div class="mb-brand-mark">${icon('globe', 27)}</div><div><h1>MadBox<span class="mb-beta">SANDBOX</span></h1><div class="mb-tagline">A WORLD IN YOUR HANDS</div></div></div>
        <div class="mb-world-strip mb-panel"><span class="mb-live-dot"></span><div><strong id="mb-world-name">A new beginning</strong><span id="mb-world-meta">Your living world</span></div><div class="mb-stat"><span id="mb-year">1</span><small>YEAR</small></div><div class="mb-stat"><span id="mb-population">0</span><small>POPULATION</small></div><div class="mb-stat mb-kingdom-stat"><span id="mb-kingdom-count">0</span><small>KINGDOMS</small></div></div>
        <nav class="mb-header-actions"><button class="mb-button mb-new-world" data-action="new">${icon('plus', 17)}<span>New world</span></button><button class="mb-icon-button" data-action="save" aria-label="Save MadBox world" title="Save world">${icon('save')}</button><button class="mb-icon-button" data-action="menu" aria-label="MadBox menu" title="Settings and saved world">${icon('settings')}</button></nav>
      </header>
      <aside class="mb-atlas mb-panel"><div class="mb-panel-label"><span>WORLD ATLAS</span><button class="mb-tiny-button" data-action="fit" title="Fit world to view" aria-label="Fit world to view">${icon('fit', 14)}</button></div><canvas id="mb-minimap" width="180" height="120" aria-label="MadBox world minimap"></canvas><div class="mb-atlas-footer"><span id="mb-map-size">128 × 96</span><label title="Show kingdom borders"><input id="mb-territory" type="checkbox"><span>${icon('layers', 13)} Borders</span></label></div></aside>
      <div class="mb-camera mb-panel"><button class="mb-icon-button" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">${icon('plus', 18)}</button><span></span><button class="mb-icon-button" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">${icon('minus', 18)}</button><span></span><button class="mb-icon-button" data-action="fit" aria-label="Reset camera" title="Reset camera">${icon('fit', 18)}</button></div>
      <aside class="mb-inspector mb-panel" hidden><div class="mb-panel-label"><span>WORLD INSPECTOR</span><button class="mb-tiny-button" data-action="close-inspect" aria-label="Close inspector">${icon('close', 15)}</button></div><div id="mb-inspect-content"></div></aside>
      <aside class="mb-chronicle"><button class="mb-chronicle-toggle" data-action="chronicle"><span class="mb-live-dot"></span>THE LIVING CHRONICLE ${icon('chevron', 12)}</button><div id="mb-events"></div></aside>
      <aside class="mb-realms mb-panel" hidden><div class="mb-panel-label"><span>THE REALMS</span><button class="mb-tiny-button" data-action="close-realms" aria-label="Close kingdoms">${icon('close', 15)}</button></div><div id="mb-kingdoms"></div></aside>
      <div class="mb-welcome mb-panel"><span class="mb-welcome-star">${icon('star', 24)}</span><div><strong>Every world starts with a little wonder.</strong><p>Shape the land, awaken life, and see what unfolds.</p></div><button class="mb-tiny-button" data-action="dismiss-welcome" aria-label="Dismiss welcome">${icon('close', 16)}</button></div>
      <footer class="mb-bottom"><div class="mb-tool-context"><span id="mb-tool-description">Discover the stories of your world</span><button data-action="help">${icon('help', 14)} How to play</button></div><div class="mb-dock mb-panel"><div class="mb-dock-main"><button class="mb-inspect-button is-selected" data-tool="inspect" title="Inspect terrain and creatures" aria-label="Inspect world">${icon('inspect', 22)}</button><div class="mb-dock-separator"></div><div class="mb-tool-section"><nav class="mb-tabs" aria-label="Power categories"><button data-tab="shape" class="is-active">${icon('leaf', 14)} Shape</button><button data-tab="life">${icon('person', 14)} Life</button><button data-tab="powers">${icon('bolt', 14)} Powers</button></nav><div class="mb-tools" id="mb-tools"></div></div><div class="mb-dock-separator"></div><div class="mb-brush"><span class="mb-panel-label">BRUSH</span><div class="mb-brush-buttons">${[1, 2, 4, 7].map((n) => `<button data-brush="${n}" class="${n === 2 ? 'is-active' : ''}" title="Brush radius ${n}" aria-label="Brush radius ${n}"><span style="width:${5 + n * 1.5}px;height:${5 + n * 1.5}px"></span></button>`).join('')}</div></div><div class="mb-dock-separator mb-time-separator"></div><div class="mb-time"><div class="mb-panel-label"><span>TIME FLOWS</span><span id="mb-fps">60 FPS</span></div><div class="mb-time-controls"><button id="mb-pause" class="mb-pause" data-action="pause" title="Pause / resume (Space)" aria-label="Pause simulation">${icon('pause', 18)}</button>${[1, 2, 5, 10].map((n) => `<button data-speed="${n}" class="${n === 1 ? 'is-active' : ''}" title="${n}× simulation speed">${n}×</button>`).join('')}</div></div></div></div><div class="mb-footer-notes"><span>LEFT CLICK <i>create</i> <b>·</b> RIGHT DRAG <i>explore</i> <b>·</b> SCROLL <i>zoom</i></span><button data-action="realms">${icon('crown', 13)} Kingdoms <span id="mb-footer-kingdoms">0</span></button><span id="mb-save-status">LOCAL WORLD <span class="mb-live-dot"></span></span></div></footer>
      <div class="mb-toast" role="status" aria-live="polite" hidden></div><div class="mb-modal-backdrop" hidden></div>`;
    this.modal = this.root.querySelector('.mb-modal-backdrop')!;
    this.renderTools();
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      const p = button.dataset.tool as Power | undefined;
      if (p) {
        this.selectTool(p);
        this.actions.tool(p);
        return;
      }
      if (button.dataset.tab) {
        this.currentTab = button.dataset.tab;
        this.root
          .querySelectorAll('[data-tab]')
          .forEach((el) =>
            el.classList.toggle('is-active', (el as HTMLElement).dataset.tab === this.currentTab),
          );
        this.renderTools();
        return;
      }
      if (button.dataset.brush) {
        this.brush = Number(button.dataset.brush);
        this.actions.brush(this.brush);
        this.syncBrush();
        return;
      }
      if (button.dataset.speed) {
        this.actions.speed(Number(button.dataset.speed));
        return;
      }
      this.handleAction(button.dataset.action || '');
    });
    this.root
      .querySelector('#mb-territory')!
      .addEventListener('change', (e) =>
        this.actions.territory((e.target as HTMLInputElement).checked),
      );
    document.addEventListener('keydown', (e) => {
      if (this.modal.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.closeModal();
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(
          this.modal.querySelectorAll<HTMLElement>('button,input,select,[tabindex="0"]'),
        ).filter((el) => el.offsetParent !== null);
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    });
    let firstVisit = true;
    try {
      firstVisit =
        !localStorage.getItem('madbox.visited.v1') && !localStorage.getItem('madbox.world.v1');
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    if (firstVisit) this.showTitle();
  }
  private el<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }
  private renderTools() {
    this.el('#mb-tools').innerHTML = tools[this.currentTab]
      .map(
        (t) =>
          `<button class="mb-tool ${this.selected === t.id ? 'is-selected' : ''}" data-tool="${t.id}" style="--tool-color:${t.color}" title="${t.detail}" aria-label="${t.name}" aria-pressed="${this.selected === t.id}"><span class="mb-tool-art">${icon(t.icon, 25)}</span><span>${t.name}</span></button>`,
      )
      .join('');
  }
  private selectTool(p: Power) {
    this.selected = p;
    this.root.querySelectorAll('[data-tool]').forEach((el) => {
      const selected = (el as HTMLElement).dataset.tool === p;
      el.classList.toggle('is-selected', selected);
      el.setAttribute('aria-pressed', String(selected));
    });
    const tool = Object.values(tools)
      .flat()
      .find((t) => t.id === p);
    this.el('#mb-tool-description').textContent = tool
      ? `${tool.name} · ${tool.detail}`
      : 'Inspect · Discover the stories of your world';
  }
  private syncBrush() {
    this.root
      .querySelectorAll('[data-brush]')
      .forEach((el) =>
        el.classList.toggle('is-active', Number((el as HTMLElement).dataset.brush) === this.brush),
      );
  }
  private handleAction(action: string) {
    switch (action) {
      case 'enter-world':
        this.closeModal();
        break;
      case 'new':
        this.showNewWorld();
        break;
      case 'menu':
        this.showSettings();
        break;
      case 'help':
        this.showHelp();
        break;
      case 'save':
        this.actions.save();
        break;
      case 'load':
        this.actions.load();
        this.closeModal();
        break;
      case 'pause':
        this.actions.pause();
        break;
      case 'zoom-in':
        this.actions.zoom(1.25);
        break;
      case 'zoom-out':
        this.actions.zoom(0.8);
        break;
      case 'fit':
        this.actions.resetCamera();
        break;
      case 'close-modal':
        this.closeModal();
        break;
      case 'dismiss-welcome':
        this.el('.mb-welcome').hidden = true;
        break;
      case 'close-inspect':
        this.el('.mb-inspector').hidden = true;
        break;
      case 'chronicle':
        this.el('.mb-chronicle').classList.toggle('is-expanded');
        break;
      case 'realms':
        this.el('.mb-realms').hidden = !this.el('.mb-realms').hidden;
        break;
      case 'close-realms':
        this.el('.mb-realms').hidden = true;
        break;
    }
  }
  private openModal(title: string, eyebrow: string, body: string) {
    if (this.modal.hidden) this.previousFocus = document.activeElement as HTMLElement;
    this.modal.hidden = false;
    this.modal.innerHTML = `<section class="mb-modal mb-panel" role="dialog" aria-modal="true" aria-label="${title}"><button class="mb-modal-close mb-icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button><div class="mb-modal-icon">${icon('globe', 31)}</div><div class="mb-panel-label">${eyebrow}</div><h2>${title}</h2>${body}</section>`;
    this.modal.addEventListener(
      'click',
      (e) => {
        if (e.target === this.modal) this.closeModal();
      },
      { once: true },
    );
    this.modal.querySelector<HTMLElement>('input,button')?.focus();
  }
  private closeModal() {
    if (this.titleScreen) {
      try {
        localStorage.setItem('madbox.visited.v1', '1');
      } catch {
        /* The game remains playable without persistent preferences. */
      }
      this.titleScreen = false;
    }
    this.modal.hidden = true;
    this.modal.classList.remove('mb-title-backdrop');
    this.modal.innerHTML = '';
    this.previousFocus?.focus();
  }
  private showTitle() {
    this.openModal(
      'MadBox',
      'A LIVING WORLD. AN OPEN INVITATION.',
      `<div class="mb-title-emblem"><span class="mb-orbit mb-orbit-one"></span><span class="mb-orbit mb-orbit-two"></span><span class="mb-orbit-star">${icon('star', 16)}</span>${icon('globe', 70)}</div><div class="mb-title-wordmark">MadBox<span>THE GOD SIMULATOR</span></div><p class="mb-title-fantasy">Small worlds.<br><em>Infinite possibilities.</em></p><p class="mb-title-description">Sculpt an island. Awaken a civilization.<br>Watch a thousand little stories become a world.</p><button class="mb-primary mb-enter-world" data-action="enter-world">Enter your world ${icon('chevron', 19)}</button><div class="mb-title-verbs"><span>${icon('leaf', 15)} CREATE</span><i></i><span>${icon('person', 15)} NURTURE</span><i></i><span>${icon('bolt', 15)} TRANSFORM</span></div><p class="mb-title-footnote">Your imagination is the only objective.</p>`,
    );
    this.titleScreen = true;
    this.modal.classList.add('mb-title-backdrop');
    this.el('.mb-modal').classList.add('mb-title-modal');
    this.el('[data-action="enter-world"]').focus();
  }
  private showNewWorld() {
    this.openModal(
      'A new world awaits.',
      'MADBOX · WORLD CREATOR',
      `<p class="mb-modal-copy">An untouched canvas. An unwritten history. Make something extraordinary.</p><form id="mb-generate-form"><label class="mb-field">WORLD SEED<input name="seed" type="number" min="0" max="4294967295" value="${Math.floor(Math.random() * 999999)}" required><span>The same seed creates the same landscape.</span></label><div class="mb-form-row"><label class="mb-field">WORLD SIZE<select name="size"><option value="small">Small · 96 × 72</option><option value="medium" selected>Medium · 128 × 96</option><option value="large">Large · 192 × 144</option></select></label><label class="mb-field">LANDSCAPE<select name="style"><option value="continents">Continents</option><option value="islands">Archipelago</option><option value="pangaea">Pangaea</option></select></label></div><div class="mb-warning">Creating a world replaces your current world. Save it first to keep its story.</div><button class="mb-primary" type="submit">${icon('plus', 18)} Create world</button></form>`,
    );
    this.el<HTMLFormElement>('#mb-generate-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget as HTMLFormElement);
      this.actions.generate(
        Number(form.get('seed')) >>> 0,
        form.get('size') as 'small' | 'medium' | 'large',
        form.get('style') as 'continents' | 'islands' | 'pangaea',
      );
      this.closeModal();
    });
  }
  private showSettings() {
    this.openModal(
      'Your world, your rules.',
      'MADBOX · SETTINGS',
      `<p class="mb-modal-copy">Keep your creation safe and make yourself at home.</p><div class="mb-menu-buttons"><button data-action="save">${icon('save', 23)}<span><strong>Save world</strong><small>Keep your world in this browser</small></span>${icon('chevron', 16)}</button><button data-action="load">${icon('load', 23)}<span><strong>Load saved world</strong><small>Return to your last saved moment</small></span>${icon('chevron', 16)}</button><button data-action="help">${icon('help', 23)}<span><strong>Field guide</strong><small>The art of being a god</small></span>${icon('chevron', 16)}</button></div><label class="mb-settings-toggle"><span>Ambient sound<small>Subtle tones for a living world</small></span><input id="mb-sound-toggle" type="checkbox" ${this.soundEnabled ? 'checked' : ''}></label><p class="mb-local-note">Saves stay on this device. Clearing browser storage removes saved worlds.</p>`,
    );
    this.el<HTMLInputElement>('#mb-sound-toggle').addEventListener('change', (e) => {
      this.soundEnabled = (e.target as HTMLInputElement).checked;
      this.actions.sound(this.soundEnabled);
    });
  }
  private showHelp() {
    this.openModal(
      'The art of a little wonder.',
      'MADBOX · FIELD GUIDE',
      `<p class="mb-modal-copy">There is no winning or losing here. Only the stories you help bring into being.</p><div class="mb-guide"><div><span>01</span><section><strong>Give your world a shape</strong><p>Choose a terrain brush in Shape and paint with the left mouse button. Grass and forests give creatures food and room to grow.</p></section></div><div><span>02</span><section><strong>Let life find its way</strong><p>Use Life to place humans, elves, orcs, and wildlife on land. Groups build settlements, gather resources, and establish kingdoms.</p></section></div><div><span>03</span><section><strong>Be a benevolent god. Or don’t.</strong><p>Bless a civilization, bring life-giving rain, or test its resilience with fire, a plague, or a meteor. Every choice leaves a mark.</p></section></div></div><div class="mb-controls-help"><span><kbd>Space</kbd> Pause / resume</span><span><kbd>Right drag</kbd> Pan the world</span><span><kbd>Scroll</kbd> Zoom in / out</span><span><kbd>Esc</kbd> Close dialog</span></div><button class="mb-primary" data-action="close-modal">Back to my world ${icon('chevron', 17)}</button>`,
    );
  }
  update(
    world: World,
    stats: { fps: number; speed: number; paused: boolean; tool: Power; brush: number },
  ) {
    this.world = world;
    this.el('#mb-world-name').textContent = world.name;
    this.el('#mb-world-meta').textContent = `Seed ${world.seed} · ${world.width} × ${world.height}`;
    this.el('#mb-year').textContent = format(world.tick / 500 + 1);
    this.el('#mb-population').textContent = format(world.entities.length);
    const kingdoms = world.kingdoms.filter((k) => k.population > 0);
    this.el('#mb-kingdom-count').textContent = format(kingdoms.length);
    this.el('#mb-footer-kingdoms').textContent = format(kingdoms.length);
    this.el('#mb-map-size').textContent = `${world.width} × ${world.height}`;
    this.el('#mb-fps').textContent = `${Math.round(stats.fps)} FPS`;
    this.el('#mb-pause').innerHTML = icon(stats.paused ? 'play' : 'pause', 18);
    this.el('#mb-pause').setAttribute(
      'aria-label',
      stats.paused ? 'Resume simulation' : 'Pause simulation',
    );
    this.el('#mb-pause').classList.toggle('is-paused', stats.paused);
    this.el('.mb-time .mb-panel-label > span').textContent = stats.paused
      ? 'TIME PAUSED'
      : 'TIME FLOWS';
    this.root
      .querySelectorAll('[data-speed]')
      .forEach((el) =>
        el.classList.toggle('is-active', Number((el as HTMLElement).dataset.speed) === stats.speed),
      );
    if (stats.tool !== this.selected) this.selectTool(stats.tool);
    if (stats.brush !== this.brush) {
      this.brush = stats.brush;
      this.syncBrush();
    }
    const now = performance.now();
    if (now - this.lastMap > 700) {
      this.drawMinimap(world);
      this.lastMap = now;
    }
    const eventKey = world.events
      .slice(-3)
      .map((e) => `${e.tick}${e.text}`)
      .join('|');
    if (this.lastEvents !== eventKey) {
      this.lastEvents = eventKey;
      const list = this.el('#mb-events');
      list.replaceChildren();
      for (const event of world.events.slice(-3).reverse()) {
        const row = document.createElement('div');
        row.className = 'mb-event';
        const mark = document.createElement('span');
        mark.className = `mb-event-dot ${event.kind}`;
        const text = document.createElement('p');
        text.textContent = event.text;
        const year = document.createElement('small');
        year.textContent = `Y${Math.floor(event.tick / 500) + 1}`;
        row.append(mark, text, year);
        list.append(row);
      }
    }
    const kingdomKey = kingdoms
      .map((k) => `${k.id}:${k.population}:${Math.floor(k.food)}:${Math.floor(k.wood)}`)
      .join('|');
    if (this.lastKingdoms !== kingdomKey) {
      this.lastKingdoms = kingdomKey;
      const list = this.el('#mb-kingdoms');
      list.replaceChildren();
      if (!kingdoms.length) {
        const p = document.createElement('p');
        p.className = 'mb-empty';
        p.textContent = 'Place a few people on land. A new history will begin.';
        list.append(p);
      }
      for (const k of kingdoms) {
        const row = document.createElement('div');
        row.className = 'mb-kingdom-row';
        const flag = document.createElement('span');
        flag.className = 'mb-kingdom-flag';
        flag.style.backgroundColor = `#${k.color.toString(16).padStart(6, '0')}`;
        const body = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = k.name;
        const detail = document.createElement('small');
        detail.textContent = `${k.species} · ${format(k.food)} food · ${format(k.wood)} wood`;
        body.append(name, detail);
        const pop = document.createElement('b');
        pop.textContent = format(k.population);
        row.append(flag, body, pop);
        list.append(row);
      }
    }
  }
  private drawMinimap(w: World) {
    const canvas = this.el<HTMLCanvasElement>('#mb-minimap');
    if (canvas.width !== w.width || canvas.height !== w.height) {
      canvas.width = w.width;
      canvas.height = w.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(w.width, w.height);
    for (let i = 0; i < w.tiles.length; i++) {
      const tile = w.tiles[i];
      let color = TERRAIN_COLORS[tile.terrain];
      if (tile.owner) {
        const kingdom = w.kingdoms.find((k) => k.id === tile.owner);
        if (kingdom) color = kingdom.color;
      }
      image.data[i * 4] = (color >> 16) & 255;
      image.data[i * 4 + 1] = (color >> 8) & 255;
      image.data[i * 4 + 2] = color & 255;
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    ctx.fillStyle = '#fff6df';
    for (const building of w.buildings.filter((b) => b.kind === 'hall'))
      ctx.fillRect(Math.floor(building.x) - 1, Math.floor(building.y) - 1, 3, 3);
  }
  toast(message: string) {
    const el = this.el('.mb-toast');
    el.textContent = message;
    el.hidden = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 4000);
    if (/sav/i.test(message)) {
      this.el('#mb-save-status').textContent = 'WORLD SAVED · JUST NOW';
    }
  }
  inspect(world: World, x: number, y: number) {
    const tile = tileAt(world, x, y);
    if (!tile) return;
    const panel = this.el('.mb-inspector');
    panel.hidden = false;
    const content = this.el('#mb-inspect-content');
    content.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = tile.terrain.charAt(0).toUpperCase() + tile.terrain.slice(1);
    const coords = document.createElement('p');
    coords.className = 'mb-inspect-coords';
    coords.textContent = `${Math.floor(x)}, ${Math.floor(y)} · ${Math.round(tile.elevation * 100)} m elevation`;
    content.append(heading, coords);
    const creature = world.entities
      .filter((e) => Math.hypot(e.x - x, e.y - y) < 2)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (creature) {
      const row = document.createElement('div');
      row.className = 'mb-creature-detail';
      const title = document.createElement('strong');
      title.textContent = `${creature.species.charAt(0).toUpperCase() + creature.species.slice(1)} #${creature.id}`;
      const kingdom = world.kingdoms.find((k) => k.id === creature.kingdom);
      const sub = document.createElement('small');
      sub.textContent = kingdom?.name || 'Wilderness wanderer';
      row.append(title, sub);
      for (const [label, value] of [
        ['Health', creature.health],
        ['Hunger', creature.hunger],
      ] as const) {
        const labelEl = document.createElement('div');
        labelEl.className = 'mb-meter-label';
        labelEl.textContent = `${label} ${Math.round(value)}%`;
        const meter = document.createElement('div');
        meter.className = 'mb-meter';
        const fill = document.createElement('span');
        fill.style.width = `${Math.min(100, Math.max(0, value))}%`;
        meter.append(fill);
        row.append(labelEl, meter);
      }
      const traits = document.createElement('p');
      traits.className = 'mb-traits';
      traits.textContent = `Age ${Math.floor(creature.age)}${creature.traits.length ? ' · ' + creature.traits.join(' · ') : ''}`;
      row.append(traits);
      content.append(row);
    } else {
      const p = document.createElement('p');
      p.className = 'mb-empty';
      p.textContent = `${Math.round(tile.fertility * 100)}% fertility · ${Math.round(tile.moisture * 100)}% moisture`;
      content.append(p);
    }
    if (tile.owner) {
      const k = world.kingdoms.find((k) => k.id === tile.owner);
      if (k) {
        const p = document.createElement('p');
        p.className = 'mb-inspect-owner';
        p.textContent = `Territory of ${k.name}`;
        content.append(p);
      }
    }
  }
}
