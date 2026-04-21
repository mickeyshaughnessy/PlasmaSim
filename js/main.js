// Main entry point: init, game loop, input routing, mode switching
"use strict";
import { GameState, bus } from './state.js';
import { SpaceMode, drawRadar, radarClickToTarget, planetPos, JUMP_SPEED, LAND_DIST, LAND_SPEED, BOARD_DIST, BOARD_SPEED } from './space.js';
import { PlanetMode, drawPlanetRadar } from './planet.js';
import { GalaxyMode } from './galaxy.js';
import { UI, toast } from './ui.js';
import { Audio } from './audio.js';

// ── Canvas setup ──────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const radar  = document.getElementById('radar');

function resize() {
  canvas.width  = window.innerWidth - 250;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ── Input ─────────────────────────────────────────────────────────────────
const keys = GameState.keys;

window.addEventListener('keydown', e => {
  const already = keys.has(e.key);
  keys.add(e.key);

  if (!already) { // fire once-per-press actions
    if (e.key === 'Escape') handleEscape();
    if (e.key === 'j' || e.key === 'J') handleJumpKey();
    if (e.key === 'l' || e.key === 'L') handleLandKey();
    if (e.key === 'b' || e.key === 'B') handleBoardKey();
    if (e.key === 'g' || e.key === 'G') {
      if (GameState.mode === 'galaxy') GameState.closeGalaxy();
      else GameState.openGalaxy();
    }
    if (e.key === 't' || e.key === 'T') handleTowerKey();
  }

  // Prevent browser scroll/default for game keys
  const gameKeys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','j','J','l','L','b','B','g','G','t','T','w','W','a','A','s','S','d','D']);
  if (gameKeys.has(e.key)) e.preventDefault();
}, { passive: false });

window.addEventListener('keyup', e => { keys.delete(e.key); });

// ── Mouse ─────────────────────────────────────────────────────────────────
let lastClickTime = 0;

canvas.addEventListener('mousedown', e => {
  const now = Date.now();
  const dbl = now - lastClickTime < 350;
  lastClickTime = now;
  GameState.mouse = { x: e.offsetX, y: e.offsetY, down: true };

  if (e.button === 2) { // right-click
    if (GameState.mode === 'galaxy') { GameState.jumpQueue = []; UI.update(); }
    else if (GameState.mode === 'space') { GameState.autopilot = null; GameState.weaponTarget = null; }
    return;
  }

  if (GameState.mode === 'galaxy') {
    GalaxyMode.handleDragStart(e.offsetX, e.offsetY);
    GalaxyMode.handleClick(e.offsetX, e.offsetY, canvas.width, canvas.height, dbl);
    UI.update();
  } else if (GameState.mode === 'space') {
    handleSpaceClick(e.offsetX, e.offsetY, dbl);
  } else if (GameState.mode === 'planet') {
    handlePlanetClick(e.offsetX, e.offsetY);
  }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousemove', e => {
  if (GameState.mode === 'galaxy' && GameState.mouse.down) {
    GalaxyMode.handleDrag(e.offsetX, e.offsetY);
  }
  GameState.mouse.x = e.offsetX;
  GameState.mouse.y = e.offsetY;
});

canvas.addEventListener('mouseup', () => {
  GameState.mouse.down = false;
  GalaxyMode.handleDragEnd();
});

canvas.addEventListener('wheel', e => {
  if (GameState.mode === 'galaxy') {
    GalaxyMode.handleZoom(e.deltaY, e.offsetX, e.offsetY, canvas.width, canvas.height);
  }
  e.preventDefault();
}, { passive: false });

// ── Space click ───────────────────────────────────────────────────────────
function handleSpaceClick(mx, my, dbl) {
  const gs = GameState;
  const sys = gs.system;
  if (!sys) return;
  const ps = gs.playerShip;
  const W = canvas.width, H = canvas.height;
  const wx = mx - W/2 + ps.x, wy = my - H/2 + ps.y;

  // Check ships — single click selects, click on already-selected locks weapon target
  for (const ship of sys.ships) {
    if (Math.hypot(ship.x - wx, ship.y - wy) < 16) {
      if (gs.selectedEntity?.data?.id === ship.id) {
        // Second click on same ship = lock weapon target
        gs.weaponTarget = ship.id;
        toast(`Weapon locked: ${ship.name}`);
      } else {
        gs.selectedEntity = { type: 'ship', data: ship };
      }
      UI.update(); return;
    }
  }
  // Check planets
  for (const p of sys.planets) {
    const pp = planetPos(p);
    if (Math.hypot(pp.x - wx, pp.y - wy) < p.r + 12) {
      gs.selectedEntity = { type: 'planet', data: p };
      UI.update(); return;
    }
  }
  // Check stations
  for (const st of (sys.stations||[])) {
    if (Math.hypot(st.x - wx, st.y - wy) < st.r + 12) {
      gs.selectedEntity = { type: 'station', data: st };
      UI.update(); return;
    }
  }
  // Empty space — set autopilot, clear weapon target
  gs.autopilot = { tx: wx, ty: wy };
  gs.selectedEntity = null;
}

// ── Planet click ──────────────────────────────────────────────────────────
function handlePlanetClick(mx, my) {
  PlanetMode.handleClick(mx, my);
  UI.update();
}

// ── Key handlers ──────────────────────────────────────────────────────────
function handleEscape() {
  const gs = GameState;
  if (gs.mode === 'galaxy') { gs.closeGalaxy(); return; }
  if (gs.jumpAnim?.active) return; // can't escape during warp
  gs.selectedEntity = null;
  gs.weaponTarget = null;
  gs.autopilot = null;
  UI.update();
}

function handleJumpKey() {
  const gs = GameState;
  if (gs.mode !== 'space') return;
  if (gs.jumpAnim?.active) return; // already animating

  if (!gs.jumpTarget) {
    toast('Plan a route in the galaxy map first (G key, double-click adjacent systems)');
    return;
  }
  const ps = gs.playerShip;
  const spd = ps ? Math.hypot(ps.vx, ps.vy) : 0;
  if (spd < JUMP_SPEED) {
    toast(`Need speed ${JUMP_SPEED.toFixed(1)} to jump — current: ${spd.toFixed(2)}`);
    return;
  }
  // Start warp animation (actual jump fires at end via bus)
  gs.jumpAnim = { active: true, progress: 0, targetSystem: gs.jumpTarget };
  bus.emit('ship:thrust:stop'); // kill thrust sound during warp
  bus.emit('ship:jump');        // play jump sound
}

function handleLandKey() {
  const gs = GameState;
  if (gs.mode === 'planet') {
    // Launch from planet if at a launch pad node
    const mech = gs.playerMech;
    const pl = gs.planet;
    if (!mech || !pl) return;
    const launchTower = pl.towers.find(t => t.type === 'launch' && t.nodeId === mech.nodeId);
    if (launchTower || mech.nodeId === pl.graph.nodes[0]?.id) {
      gs.launchFromPlanet();
      toast('Launching from planet surface');
    } else {
      toast('Move to the Launch Pad (cyan node) to leave the planet');
    }
    return;
  }
  if (gs.mode !== 'space') return;
  if (gs.jumpAnim?.active) return;
  const sys = gs.system;
  const ps = gs.playerShip;
  if (!sys || !ps) return;
  const spd = Math.hypot(ps.vx, ps.vy);
  for (const p of sys.planets) {
    const pp = planetPos(p);
    const dist = Math.hypot(ps.x - pp.x, ps.y - pp.y);
    if (dist < LAND_DIST && spd < LAND_SPEED && p.landable) {
      bus.emit('ship:land', { planetId: p.id }); return;
    }
  }
  toast('Get close to a planet and slow down to land (L)');
}

function handleBoardKey() {
  const gs = GameState;
  if (gs.mode !== 'space') return;
  const ps = gs.playerShip;
  const sys = gs.system;
  if (!ps || !sys) return;

  // Board the selected ship or nearest enemy in boarding range
  let candidate = gs.selectedEntity?.type === 'ship' ? gs.selectedEntity.data : null;
  if (!candidate) {
    // Find nearest ship in range
    let nearDist = BOARD_DIST;
    for (const ship of sys.ships) {
      const d = Math.hypot(ship.x - ps.x, ship.y - ps.y);
      if (d < nearDist) { candidate = ship; nearDist = d; }
    }
  }

  if (!candidate) { toast('No ship in boarding range'); return; }

  const dist = Math.hypot(candidate.x - ps.x, candidate.y - ps.y);
  const relSpd = Math.hypot((candidate.vx||0) - ps.vx, (candidate.vy||0) - ps.vy);

  if (dist > BOARD_DIST) {
    toast(`Too far to board ${candidate.name} — get within ${BOARD_DIST} units`); return;
  }
  if (relSpd > BOARD_SPEED) {
    toast(`Relative speed too high to board (${relSpd.toFixed(2)}) — match speed first`); return;
  }

  // Boarding success
  candidate.boarded = true;
  candidate.hull = Math.max(0, candidate.hull - 40);
  if (!ps.cargo) ps.cargo = {};
  ps.cargo.credits = (ps.cargo.credits || 0) + 200;
  gs.selectedEntity = { type: 'ship', data: candidate };
  toast(`Boarded ${candidate.name}! +200 credits`);
  bus.emit('weapon:fire'); // boarding sound
  UI.update();
}

function handleTowerKey() {
  if (GameState.mode !== 'planet') return;
  const tm = document.getElementById('tower-menu');
  if (tm) tm.classList.toggle('open');
}

// ── Bus event handlers ─────────────────────────────────────────────────────
bus.on('ship:land', async ({ planetId }) => {
  await GameState.landOnPlanet(planetId);
  toast(`Landed on ${GameState.planet?.name || planetId}`);
  UI.update();
});

// Jump is now a two-step process:
// 1. J key → sets jumpAnim (starts warp animation in space.js)
// 2. Animation end → fires ship:jump:execute
// 3. ship:jump:execute → calls GameState.jumpToSystem (actual transition)
bus.on('ship:jump:execute', async ({ targetSystem }) => {
  const name = GameState.galaxy?.systems[targetSystem]?.name || targetSystem;
  await GameState.jumpToSystem(targetSystem);
  SpaceMode.triggerArrivalFlash();
  toast(`Arrived in ${GameState.system?.name || name}`);
  // If there's another hop queued, show it
  if (GameState.jumpQueue.length > 0) {
    const next = GameState.galaxy?.systems[GameState.jumpQueue[0]]?.name || GameState.jumpQueue[0];
    toast(`Next jump: ${next} — build speed to ${JUMP_SPEED}`, 3000);
  }
  UI.update();
});

bus.on('mode:changed', () => { UI.update(); });

bus.on('jump:targeted', ({ queue }) => {
  const names = queue.map(id => GameState.galaxy?.systems[id]?.name || id).join(' → ');
  toast(`Route: ${GameState.system?.name} → ${names}`);
  UI.update();
});

bus.on('jump:route:cleared', () => { toast('Jump route cleared'); UI.update(); });

// ── Sync ──────────────────────────────────────────────────────────────────
let syncTimer = 0;
async function syncTick() {
  syncTimer++;
  if (syncTimer % 300 === 0) await GameState.flushDirty();
  if (syncTimer % 600 === 0) {
    try {
      const data = await GameState.storage.loadPlayers();
      if (data?.players) GameState.otherPlayers = data.players.filter(p => p.id !== GameState.playerId);
    } catch {}
  }
}

// ── Game loop ─────────────────────────────────────────────────────────────
let lastTime = 0;
function loop(ts) {
  const rawDt = ts - lastTime; lastTime = ts;
  const dt = Math.min(rawDt / 16.667, 3);

  GameState.frameCount++;

  if (!GameState.paused) {
    if (GameState.mode === 'space')  SpaceMode.step(dt, keys);
    if (GameState.mode === 'planet') PlanetMode.step(dt, keys);
  }

  const W = canvas.width, H = canvas.height;

  if (GameState.mode === 'space') {
    SpaceMode.draw(ctx, W, H);
    drawSpaceHUD(ctx, W, H);
  } else if (GameState.mode === 'planet') {
    ctx.clearRect(0, 0, W, H);
    PlanetMode.draw(ctx, W, H);
    drawPlanetHUD(ctx, W, H);
  } else if (GameState.mode === 'galaxy') {
    GalaxyMode.draw(ctx, W, H);
  }

  if (GameState.frameCount % 3 === 0) UI.update();
  syncTick();
  requestAnimationFrame(loop);
}

// ── HUD helpers ───────────────────────────────────────────────────────────
function drawSpaceHUD(ctx, W, H) {
  const ps = GameState.playerShip;
  if (!ps) return;

  // Landing proximity hint
  const sys = GameState.system;
  if (sys && !GameState.jumpAnim?.active) {
    for (const p of sys.planets) {
      const pp = planetPos(p);
      const dist = Math.hypot(ps.x - pp.x, ps.y - pp.y);
      const spd  = Math.hypot(ps.vx, ps.vy);
      if (dist < LAND_DIST * 3) {
        const canLand = dist < LAND_DIST && spd < LAND_SPEED;
        ctx.fillStyle = canLand ? '#44ffaa' : '#44ccff88';
        ctx.font = '11px Segoe UI'; ctx.textAlign = 'center';
        ctx.fillText(canLand ? `[L] Land on ${p.name}` : `${p.name}: dist ${dist.toFixed(0)}, speed ${spd.toFixed(2)}`, W/2, H - 36);
      }
      // Boarding hint
      if (sys) {
        for (const ship of sys.ships) {
          const sd = Math.hypot(ship.x - ps.x, ship.y - ps.y);
          const relSpd = Math.hypot((ship.vx||0)-ps.vx, (ship.vy||0)-ps.vy);
          if (sd < BOARD_DIST) {
            ctx.fillStyle = relSpd < BOARD_SPEED ? '#ffee44' : '#ffee4488';
            ctx.font = '11px Segoe UI'; ctx.textAlign = 'center';
            ctx.fillText(relSpd < BOARD_SPEED ? `[B] Board ${ship.name}` : `Match speed to board ${ship.name}`, W/2, H - 20);
          }
        }
      }
    }
  }

  // Weapon target indicator (screen-space crosshair on target)
  if (GameState.weaponTarget && sys) {
    const tship = sys.ships.find(s => s.id === GameState.weaponTarget);
    if (tship) {
      const tx = W/2 + (tship.x - ps.x);
      const ty = H/2 + (tship.y - ps.y);
      ctx.strokeStyle = '#ff444488'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke();
    }
  }
}

function drawPlanetHUD(ctx, W, H) {
  const pl = GameState.planet;
  const player = pl?.players[GameState.playerId];
  const credits = player?.credits ?? 500;
  ctx.fillStyle = '#ffee44'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'left';
  ctx.fillText(`Credits: ${credits}  ·  T: tower  ·  G: galaxy map  ·  Launch Ship: panel`, 12, H - 12);
}

// ── Radar click ───────────────────────────────────────────────────────────
function setupRadarClick() {
  radar.addEventListener('click', e => {
    if (GameState.mode !== 'space') return;
    const obj = radarClickToTarget(e.offsetX, e.offsetY, radar.width, radar.height);
    if (!obj) return;
    GameState.autopilot = { tx: obj.wx, ty: obj.wy };
    if (obj.type === 'ship') {
      GameState.selectedEntity = { type: 'ship', data: obj.data };
      toast(`Autopiloting to ${obj.data.name}`);
    } else if (obj.type === 'planet') {
      GameState.selectedEntity = { type: 'planet', data: obj.data };
      toast(`Autopiloting to ${obj.data.name}`);
    } else if (obj.type === 'station') {
      GameState.selectedEntity = { type: 'station', data: obj.data };
      toast(`Autopiloting to ${obj.data.name || 'station'}`);
    } else {
      toast('Autopiloting to target');
    }
    UI.update();
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  await GameState.init();
  Audio.init();
  UI.init(radar, (rctx, W, H) => {
    if (GameState.mode === 'space') drawRadar(rctx, W, H);
    else if (GameState.mode === 'planet') drawPlanetRadar(rctx, W, H);
    else rctx.clearRect(0, 0, W, H);
  });
  setupRadarClick();
  toast('WASD/arrows: fly · Space: fire · B: board · L: land · J: jump · G: galaxy', 5000);
  requestAnimationFrame(loop);
}

boot();
