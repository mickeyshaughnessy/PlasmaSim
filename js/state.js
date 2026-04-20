// Central state + initial game data + storage adapter
"use strict";

// ── Initial Galaxy Data ────────────────────────────────────────────────────
export const INITIAL_GALAXY = {
  version: 1,
  systems: {
    sol:       { id:'sol',       name:'Sol',             x:400, y:300, color:'#ffee88', r:14, adj:['proxima','barnard'], blurb:'Home system of humanity. A yellow G-type dwarf with three colonized worlds. Heavily trafficked — trade convoys, patrol fleets, and salvagers compete for resources in the asteroid belt between Mars and the outer reaches. The outer planets remain largely unexplored.' },
    proxima:   { id:'proxima',   name:'Proxima Centauri',x:620, y:190, color:'#ff6644', r:9,  adj:['sol','sirius'],      blurb:'A dim red dwarf 4.2 light-years from Sol. One marginal world, Proxima b, hosts a scrappy frontier colony of about 2,000 settlers. Ongoing skirmishes between the Colonial Authority and an independent faction called the Free Margin. Rich in rare earth minerals.' },
    barnard:   { id:'barnard',   name:"Barnard's Star",  x:280, y:140, color:'#ff9966', r:8,  adj:['sol','tau'],         blurb:'A fast-moving red dwarf. Two rocky planets orbit at the edge of the habitable zone. Known for an unusual concentration of iron asteroids left by an ancient collision event. A prospecting hub with a reputation for rough company.' },
    sirius:    { id:'sirius',    name:'Sirius',           x:700, y:380, color:'#aaddff', r:18, adj:['proxima','tau'],     blurb:'The brightest star in the sky — a blue-white binary. The inner system is bathed in harsh radiation, but Sirius III, far out in the cold zone, harbors a tech-forward research colony. Known for cutting-edge ship manufacturing and experimental jump drives.' },
    tau:       { id:'tau',       name:'Tau Ceti',         x:500, y:480, color:'#ffcc88', r:11, adj:['barnard','sirius'],  blurb:'A stable yellow dwarf with four planets. Tau Ceti e is the most Earth-like world yet found — lush jungles, broad oceans, and a thriving agrarian society. Exports food, biotech, and mercenary crews. Neutral in most conflicts.' },
  },
  players: {}
};

// ── Initial Star System (Sol) ──────────────────────────────────────────────
export const INITIAL_SYSTEM = {
  version: 1, id: 'sol', name: 'Sol',
  star: { x:0, y:0, mass:900, r:28, color:'#ffee88', glow:[255,238,136] },
  planets: [
    { id:'mercury', name:'Mercury', orbitR:170, angle:0.8,   speed:0.00045, mass:4,  r:5,  color:'#aa8866', glow:[170,136,102], biome:'desert',    landable:true  },
    { id:'earth',   name:'Earth',   orbitR:340, angle:1.6,   speed:0.00022, mass:14, r:10, color:'#2266ff', glow:[34,102,255],  biome:'jungle',    landable:true  },
    { id:'mars',    name:'Mars',    orbitR:500, angle:3.2,   speed:0.00014, mass:8,  r:7,  color:'#cc4422', glow:[204,68,34],   biome:'desert',    landable:true  },
  ],
  asteroids: [
    { id:'a0', x:220,  y:-80,  vx:0.14,  vy:0.06,  mass:0.5, r:4, res:{iron:40,ice:0}  },
    { id:'a1', x:-150, y:190,  vx:-0.10, vy:-0.12, mass:0.3, r:3, res:{iron:20,ice:15} },
    { id:'a2', x:300,  y:120,  vx:0.08,  vy:-0.14, mass:0.6, r:5, res:{iron:60,ice:5}  },
    { id:'a3', x:-220, y:-180, vx:0.12,  vy:0.10,  mass:0.4, r:4, res:{iron:30,ice:20} },
    { id:'a4', x:100,  y:280,  vx:-0.15, vy:0.08,  mass:0.5, r:4, res:{iron:45,ice:0}  },
    { id:'a5', x:-310, y:90,   vx:0.06,  vy:-0.10, mass:0.7, r:6, res:{iron:80,ice:10} },
  ],
  ships: [
    { id:'npc0', owner:'npc', x:180,  y:60,  vx:0.2, vy:-0.1, angle:0,    fuel:100, hull:100, color:'#ff6644', name:'Raider-1',  npc:{state:'patrol', homeX:180, homeY:60,  aggroR:200, attackR:60, timer:0} },
    { id:'npc1', owner:'npc', x:-200, y:140, vx:-0.1,vy:0.15,  angle:3.14, fuel:100, hull:100, color:'#ffaa22', name:'Hauler-1', npc:{state:'patrol', homeX:-200,homeY:140, aggroR:150, attackR:50, timer:0} },
  ],
  stations: [
    { id:'st0', x:420, y:-180, r:16, name:'Orbital Station Alpha', color:'#aaaaff' }
  ],
  players: {}
};

// ── Initial Planet (Earth surface) ────────────────────────────────────────
export const INITIAL_PLANET = {
  version: 1, id: 'earth', systemId: 'sol', name: 'Earth', biome: 'jungle',
  graph: {
    nodes: [
      { id:'n0',  x:100, y:380, label:'Landing Pad',    terrain:'plains'  },
      { id:'n1',  x:220, y:280, label:'North Ridge',    terrain:'hills'   },
      { id:'n2',  x:360, y:320, label:'River Crossing', terrain:'water'   },
      { id:'n3',  x:480, y:250, label:'Highland',       terrain:'plains'  },
      { id:'n4',  x:600, y:310, label:'East Jungle',    terrain:'jungle'  },
      { id:'n5',  x:160, y:160, label:'Cliff Base',     terrain:'hills'   },
      { id:'n6',  x:300, y:130, label:'Summit',         terrain:'hills'   },
      { id:'n7',  x:440, y:120, label:'Deep Forest',    terrain:'jungle'  },
      { id:'n8',  x:580, y:170, label:'Mineral Vein',   terrain:'rock'    },
      { id:'n9',  x:700, y:230, label:'Eastern Coast',  terrain:'water'   },
      { id:'n10', x:340, y:440, label:'Southern Marsh',terrain:'water'   },
      { id:'n11', x:520, y:420, label:'Old Ruins',      terrain:'plains'  },
    ],
    edges: [
      {id:'e0', from:'n0', to:'n1'}, {id:'e1', from:'n0', to:'n10'},
      {id:'e2', from:'n1', to:'n2'}, {id:'e3', from:'n1', to:'n5'},
      {id:'e4', from:'n2', to:'n3'}, {id:'e5', from:'n2', to:'n10'},
      {id:'e6', from:'n3', to:'n4'}, {id:'e7', from:'n3', to:'n7'},
      {id:'e8', from:'n4', to:'n9'}, {id:'e9', from:'n4', to:'n11'},
      {id:'e10',from:'n5', to:'n6'}, {id:'e11',from:'n6', to:'n7'},
      {id:'e12',from:'n7', to:'n8'}, {id:'e13',from:'n8', to:'n9'},
      {id:'e14',from:'n10',to:'n11'},{id:'e15',from:'n3', to:'n6'},
    ]
  },
  towers: [
    { id:'t0', nodeId:'n0', type:'launch', level:1, owner:'player' }
  ],
  mechs: [],
  bots: [
    { id:'bot0', owner:'npc', nodeId:'n4', target:'n2', path:['n4','n3','n2'], progress:0, speed:0.008, hull:40, color:'#ff6644' },
    { id:'bot1', owner:'npc', nodeId:'n8', target:'n6', path:['n8','n7','n6'], progress:0, speed:0.006, hull:30, color:'#ffaa22' },
  ],
  players: {}
};

// ── EventBus ──────────────────────────────────────────────────────────────
const listeners = {};
export const bus = {
  on(event, fn)  { (listeners[event] = listeners[event] || []).push(fn); },
  off(event, fn) { if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== fn); },
  emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); }
};

// ── Player ID ─────────────────────────────────────────────────────────────
function getOrCreatePlayerId() {
  let id = localStorage.getItem('starbound_pid');
  if (!id) { id = 'p_' + Math.random().toString(36).slice(2,9); localStorage.setItem('starbound_pid', id); }
  return id;
}

// ── StorageAdapter ────────────────────────────────────────────────────────
export class StorageAdapter {
  constructor(serverBase = '') {
    this.base = serverBase;
    this.useServer = !!serverBase;
  }

  async load(key) {
    if (this.useServer) {
      try {
        const r = await fetch(`${this.base}/api/state/${key}`);
        if (r.ok) return await r.json();
      } catch {}
    }
    const raw = localStorage.getItem(`sb_${key}`);
    return raw ? JSON.parse(raw) : null;
  }

  async save(key, data) {
    localStorage.setItem(`sb_${key}`, JSON.stringify(data));
    if (this.useServer) {
      try {
        await fetch(`${this.base}/api/state/${key}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: GameState.playerId, data })
        });
      } catch {}
    }
  }

  async loadPlayers() {
    if (this.useServer) {
      try {
        const r = await fetch(`${this.base}/api/players`);
        if (r.ok) return await r.json();
      } catch {}
    }
    return { players: [] };
  }
}

// ── GameState singleton ───────────────────────────────────────────────────
export const GameState = {
  playerId: getOrCreatePlayerId(),
  mode: 'space',          // 'space' | 'planet' | 'galaxy'
  prevMode: null,
  currentSystemId: 'sol',
  currentPlanetId: null,

  galaxy: null,           // galaxy data object
  system: null,           // current system data
  planet: null,           // current planet data (null unless in planet mode)

  playerShip: null,       // ref into system.players[playerId]
  playerMech: null,       // ref into planet.mechs for player
  fleetSelected: [],      // ship ids in fleet selection

  selectedEntity: null,   // clicked entity for inspector
  jumpQueue: [],          // ordered list of system ids to jump through
  get jumpTarget() { return this.jumpQueue.length ? this.jumpQueue[0] : null; },
  set jumpTarget(val) { this.jumpQueue = val ? [val] : []; },
  weaponTarget: null,     // id of locked ship target
  jumpAnim: null,         // { active, progress, targetSystem } warp animation state
  autopilot: null,        // {tx, ty} click-to-move in space

  otherPlayers: [],       // from server poll

  dirty: { galaxy: false, system: false, planet: false },
  paused: false,
  frameCount: 0,
  keys: new Set(),
  mouse: { x: 0, y: 0, down: false },
  camera: { x: 0, y: 0, zoom: 1 },    // space camera
  galaxyCam: { x: 0, y: 0, zoom: 1 }, // galaxy camera

  storage: new StorageAdapter(),

  async init() {
    // Try loading saved state, fall back to initial data
    const gal = await this.storage.load('galaxy') || deepCopy(INITIAL_GALAXY);
    this.galaxy = gal;

    const sys = await this.storage.load(`system_${this.currentSystemId}`) || deepCopy(INITIAL_SYSTEM);
    this.system = sys;

    // Ensure player ship exists in system
    if (!this.system.players[this.playerId]) {
      this.system.players[this.playerId] = {
        x: 300, y: 0, vx: 0, vy: 0, angle: 0,
        fuel: 100, hull: 100, color: '#44ccff',
        name: 'Your Ship', fleetIds: [], speed: 0, thrusting: false
      };
    }
    this.playerShip = this.system.players[this.playerId];

    // Ensure player in galaxy
    if (!this.galaxy.players[this.playerId]) {
      this.galaxy.players[this.playerId] = {
        currentSystem: 'sol', currentPlanet: null, mode: 'space', name: 'Commander'
      };
    }
  },

  async landOnPlanet(planetId) {
    this.currentPlanetId = planetId;
    const pl = await this.storage.load(`planet_${planetId}`) || deepCopy(INITIAL_PLANET);
    this.planet = pl;
    // Create player mech on landing pad (n0)
    const existingMech = pl.mechs.find(m => m.owner === this.playerId);
    if (!existingMech) {
      const mech = { id:'mech_player', owner:this.playerId, nodeId:'n0', target:null, path:[], progress:0, hull:100, color:'#44ccff', cargo:{} };
      pl.mechs.push(mech);
      this.playerMech = mech;
    } else {
      this.playerMech = existingMech;
    }
    this.mode = 'planet';
    bus.emit('mode:changed', { mode: 'planet', planetId });
  },

  async launchFromPlanet() {
    if (this.planet) await this.storage.save(`planet_${this.currentPlanetId}`, this.planet);
    this.planet = null;
    this.playerMech = null;
    this.currentPlanetId = null;
    this.mode = 'space';
    bus.emit('mode:changed', { mode: 'space' });
  },

  openGalaxy() {
    this.prevMode = this.mode;
    this.mode = 'galaxy';
    this.galaxyNeedsCenter = true; // GalaxyMode.draw() will re-center on first frame
    bus.emit('mode:changed', { mode: 'galaxy' });
  },

  closeGalaxy() {
    this.mode = this.prevMode || 'space';
    bus.emit('mode:changed', { mode: this.mode });
  },

  markDirty(key) { this.dirty[key] = true; },

  async flushDirty() {
    if (this.dirty.galaxy) { await this.storage.save('galaxy', this.galaxy); this.dirty.galaxy = false; }
    if (this.dirty.system) { await this.storage.save(`system_${this.currentSystemId}`, this.system); this.dirty.system = false; }
    if (this.dirty.planet && this.planet) { await this.storage.save(`planet_${this.currentPlanetId}`, this.planet); this.dirty.planet = false; }
  },

  async jumpToSystem(systemId) {
    await this.storage.save(`system_${this.currentSystemId}`, this.system);
    this.currentSystemId = systemId;
    const sys = await this.storage.load(`system_${systemId}`) || deepCopy(INITIAL_SYSTEM);
    sys.id = systemId;
    // Copy star/planet template from galaxy data
    const gSys = this.galaxy.systems[systemId];
    if (gSys) { sys.name = gSys.name; if (gSys.color) sys.star.color = gSys.color; }
    this.system = sys;
    if (!this.system.players[this.playerId]) {
      this.system.players[this.playerId] = { x: 400, y: 0, vx: 0, vy: 0, angle: 0, fuel: 80, hull: this.playerShip?.hull || 100, color: this.playerShip?.color || '#44ccff', name: 'Your Ship', fleetIds: [], speed: 0, thrusting: false };
    }
    this.playerShip = this.system.players[this.playerId];
    this.galaxy.players[this.playerId].currentSystem = systemId;
    this.jumpQueue.shift(); // remove the hop we just completed; next target becomes jumpQueue[0]
    this.jumpAnim = null;
    this.markDirty('galaxy');
    bus.emit('system:jumped', { systemId });
  }
};

function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

// ── Planet Graph Helpers ──────────────────────────────────────────────────
export function getNode(planet, id) { return planet.graph.nodes.find(n => n.id === id); }

export function getNeighbors(planet, nodeId) {
  const ids = [];
  for (const e of planet.graph.edges) {
    if (e.from === nodeId) ids.push(e.to);
    if (e.to   === nodeId) ids.push(e.from);
  }
  return ids;
}

export function aStar(planet, startId, goalId) {
  const nodes = planet.graph.nodes;
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const dist = {}; const prev = {}; const open = new Set(nodes.map(n => n.id));
  for (const n of nodes) dist[n.id] = Infinity;
  dist[startId] = 0;
  while (open.size) {
    let u = null;
    for (const id of open) if (u === null || dist[id] < dist[u]) u = id;
    if (u === goalId) break;
    open.delete(u);
    for (const nid of getNeighbors(planet, u)) {
      if (!open.has(nid)) continue;
      const a = nodeMap[u], b = nodeMap[nid];
      const alt = dist[u] + Math.hypot(b.x - a.x, b.y - a.y);
      if (alt < dist[nid]) { dist[nid] = alt; prev[nid] = u; }
    }
  }
  const path = [];
  let cur = goalId;
  while (cur !== undefined) { path.unshift(cur); cur = prev[cur]; }
  return path[0] === startId ? path : [];
}
