// Right panel UI manager
"use strict";
import { GameState, bus, WEAPONS } from './state.js';
import { TOWER_TYPES, PlanetMode } from './planet.js';
import { JUMP_SPEED } from './space.js';
import { Audio } from './audio.js';

export const UI = {
  radarCtx: null,
  drawRadarFn: null,
  lastUpdate: 0,

  init(radarCanvas, drawRadarFn) {
    this.radarCtx = radarCanvas.getContext('2d');
    this.drawRadarFn = drawRadarFn;

    // Tab buttons
    document.getElementById('tab-space').addEventListener('click', () => {
      if (GameState.mode === 'galaxy') GameState.closeGalaxy();
    });
    document.getElementById('tab-planet').addEventListener('click', () => {});
    document.getElementById('tab-galaxy').addEventListener('click', () => {
      if (GameState.mode !== 'galaxy') GameState.openGalaxy();
    });

    // Bus events
    bus.on('mode:changed', () => this.update());
    bus.on('system:jumped', () => this.update());

    this.buildActionButtons();
    this.buildWeaponPicker();
    this.update();
  },

  update() {
    if (Date.now() - this.lastUpdate < 50) return; // throttle at 20fps
    this.lastUpdate = Date.now();

    const gs = GameState;
    this.updateModeBadge();
    this.updateTabs();
    this.updateStatus();
    this.updateParty();
    this.updateInspector();
    this.updateActions();
    if (this.drawRadarFn && this.radarCtx) {
      this.drawRadarFn(this.radarCtx, 214, 120);
    }
  },

  updateModeBadge() {
    const gs = GameState;
    const el = document.getElementById('mode-badge');
    if (!el) return;
    if (gs.mode === 'space')  el.textContent = `${gs.system?.name?.toUpperCase() || 'SPACE'} SYSTEM`;
    if (gs.mode === 'planet') el.textContent = `${gs.planet?.name?.toUpperCase() || 'SURFACE'} — ${gs.planet?.biome?.toUpperCase() || ''}`;
    if (gs.mode === 'galaxy') el.textContent = 'GALAXY MAP';
  },

  updateTabs() {
    const gs = GameState;
    document.getElementById('tab-space').classList.toggle('active',  gs.mode === 'space');
    document.getElementById('tab-planet').classList.toggle('active', gs.mode === 'planet');
    document.getElementById('tab-galaxy').classList.toggle('active', gs.mode === 'galaxy');
    document.getElementById('tab-planet').disabled = gs.mode !== 'planet' && !gs.planet;
    document.getElementById('tab-planet').disabled = gs.currentPlanetId === null && gs.mode !== 'planet';
  },

  updateStatus() {
    const gs = GameState;
    const el = document.getElementById('status-content');
    if (!el) return;

    if (gs.mode === 'space') {
      const ps = gs.playerShip;
      if (!ps) return;
      const spd = ps.speed || 0;
      const fuelPct = (ps.fuel || 0).toFixed(0);
      const hullPct = (ps.hull || 0).toFixed(0);
      const jumpPct = Math.min(100, (spd / JUMP_SPEED) * 100).toFixed(0);
      el.innerHTML = `
        <div class="stat-row"><span class="stat-label">FUEL</span><span class="stat-val">${fuelPct}%</span></div>
        <div class="bar-wrap bar-fuel"><div class="bar-fill" style="width:${fuelPct}%"></div></div>
        <div class="stat-row"><span class="stat-label">HULL</span><span class="stat-val">${hullPct}%</span></div>
        <div class="bar-wrap bar-hull"><div class="bar-fill" style="width:${hullPct}%"></div></div>
        <div class="stat-row"><span class="stat-label">SPEED</span><span class="stat-val">${spd.toFixed(2)}</span></div>
        <div class="bar-wrap bar-speed"><div class="bar-fill" style="width:${Math.min(100,spd/6*100).toFixed(0)}%"></div></div>
        <div class="stat-row"><span class="stat-label">JUMP CHARGE</span><span class="stat-val" style="color:${jumpPct>=100?'#44ffaa':'#4466cc'}">${jumpPct}%</span></div>
        <div class="stat-row"><span class="stat-label">POSITION</span><span class="stat-val">${(ps.x||0).toFixed(0)}, ${(ps.y||0).toFixed(0)}</span></div>
        ${gs.jumpQueue.length > 0 ? `
          <div class="stat-row"><span class="stat-label">JUMP ROUTE</span><span class="stat-val" style="color:#44ccff">${gs.jumpQueue.length} hop${gs.jumpQueue.length>1?'s':''}</span></div>
          <div style="font-size:10px;color:#4499cc;line-height:1.6;padding:2px 0">${[gs.system?.name||'HERE', ...gs.jumpQueue.map(id=>gs.galaxy?.systems[id]?.name||id)].join(' → ')}</div>
        ` : ''}
        ${gs.weaponTarget ? `<div class="stat-row"><span class="stat-label">WEAPON LOCK</span><span class="stat-val" style="color:#ff6644">${gs.system?.ships.find(s=>s.id===gs.weaponTarget)?.name||'—'}</span></div>` : ''}
      `;
    } else if (gs.mode === 'planet') {
      const mech = gs.playerMech;
      const pl = gs.planet;
      if (!pl) return;
      const player = pl.players[gs.playerId];
      const credits = player?.credits ?? 500;
      const nodeId = mech?.nodeId;
      const nodeName = nodeId ? pl.graph.nodes.find(n=>n.id===nodeId)?.label || nodeId : '—';
      const towers = pl.towers.filter(t => t.owner === gs.playerId).length;
      const lh = pl.launchPadHull ?? 100;
      const lhColor = lh > 50 ? '#44ffaa' : lh > 25 ? '#ffcc44' : '#ff4444';
      el.innerHTML = `
        <div class="stat-row"><span class="stat-label">LAUNCH PAD</span><span class="stat-val" style="color:${lhColor}">${lh.toFixed(0)}%</span></div>
        <div class="bar-wrap bar-hull"><div class="bar-fill" style="width:${lh}%;background:${lhColor}"></div></div>
        <div class="stat-row"><span class="stat-label">NODE</span><span class="stat-val">${nodeName}</span></div>
        <div class="stat-row"><span class="stat-label">CREDITS</span><span class="stat-val" style="color:#ffee44">${credits}</span></div>
        <div class="stat-row"><span class="stat-label">TOWERS</span><span class="stat-val">${towers}</span></div>
        <div class="stat-row"><span class="stat-label">WAVE</span><span class="stat-val" style="color:#ff8844">${pl.wave||1}</span></div>
        <div class="stat-row"><span class="stat-label">ENEMIES</span><span class="stat-val" style="color:#ff4444">${pl.bots.length}</span></div>
      `;
    } else if (gs.mode === 'galaxy') {
      const gSys = gs.galaxy?.systems[gs.currentSystemId];
      el.innerHTML = `
        <div class="stat-row"><span class="stat-label">CURRENT</span><span class="stat-val">${gSys?.name || '—'}</span></div>
        <div class="stat-row"><span class="stat-label">SYSTEMS</span><span class="stat-val">${Object.keys(gs.galaxy?.systems||{}).length}</span></div>
        <div class="stat-row"><span class="stat-label">PLAYERS</span><span class="stat-val">${Object.keys(gs.galaxy?.players||{}).length}</span></div>
        ${gs.jumpTarget ? `<div class="stat-row"><span class="stat-label">JUMP TARGET</span><span class="stat-val" style="color:#44ccff">${gs.galaxy?.systems[gs.jumpTarget]?.name}</span></div>` : ''}
      `;
    }
  },

  updateParty() {
    const gs = GameState;
    const el = document.getElementById('party-content');
    if (!el) return;

    let html = '';

    if (gs.mode === 'space') {
      const sys = gs.system;
      if (!sys) return;
      // Player ship
      const ps = gs.playerShip;
      html += partyEntry('YOUR SHIP', `Hull: ${(ps?.hull||100).toFixed(0)}% · Fuel: ${(ps?.fuel||100).toFixed(0)}%`, '#44ccff', false, 'ship_player');
      // NPC ships in system
      for (const ship of (sys.ships||[])) {
        const isSelected = gs.selectedEntity?.data?.id === ship.id;
        html += partyEntry(ship.name, `${ship.npc?.state || 'idle'} · Hull: ${ship.hull.toFixed(0)}%`, ship.color, isSelected, ship.id);
      }
      // Other players
      for (const op of gs.otherPlayers) {
        if (op.system === gs.currentSystemId) {
          html += partyEntry(op.name || `Player`, `system: ${op.system}`, op.color || '#ff88ff', false, `op_${op.id}`);
        }
      }
    } else if (gs.mode === 'planet') {
      const pl = gs.planet;
      if (!pl) return;
      // Player mech
      const mech = gs.playerMech;
      html += partyEntry('YOUR MECH', `Node: ${mech?.nodeId || '?'} · Hull: ${mech?.hull||100}%`, '#44ccff', false, 'mech_player');
      // Towers
      for (const t of pl.towers.filter(t=>t.owner===gs.playerId)) {
        const td = TOWER_TYPES[t.type];
        html += partyEntry(`${td.label} Lv${t.level}`, `@ ${pl.graph.nodes.find(n=>n.id===t.nodeId)?.label||t.nodeId}`, td.color, false, t.id);
      }
      // Enemy bots summary
      if (pl.bots.length > 0) {
        html += `<div class="party-entry" style="border-color:#ff444444"><div class="party-name" style="color:#ff6644">Enemy Units: ${pl.bots.length}</div></div>`;
      }
    } else {
      html = '<div class="graph-entry">No party in galaxy view.</div>';
    }

    el.innerHTML = html;

    // Click handlers
    el.querySelectorAll('.party-entry[data-id]').forEach(entry => {
      entry.addEventListener('click', () => {
        const id = entry.dataset.id;
        if (gs.mode === 'space') {
          const ship = gs.system?.ships.find(s=>s.id===id);
          if (ship) gs.selectedEntity = { type:'ship', data:ship };
        } else if (gs.mode === 'planet') {
          const tower = gs.planet?.towers.find(t=>t.id===id);
          if (tower) gs.selectedEntity = { type:'tower', data:tower };
        }
      });
    });
  },

  updateInspector() {
    const gs = GameState;
    const el = document.getElementById('inspector');
    const tm = document.getElementById('tower-menu');
    if (!el) return;

    const sel = gs.selectedEntity;
    if (!sel) {
      el.innerHTML = '<div style="color:#334455;font-size:10px">Click an entity to inspect</div>';
      if (tm) tm.classList.remove('open');
      return;
    }

    let html = '';
    let showTowerMenu = false;

    if (sel.type === 'ship') {
      const s = sel.data;
      html = `<div class="ins-title">🚀 ${s.name}</div>
        <div class="ins-row"><span>Hull</span><span>${s.hull.toFixed(0)}%</span></div>
        <div class="ins-row"><span>Fuel</span><span>${s.fuel.toFixed(0)}%</span></div>
        <div class="ins-row"><span>State</span><span>${s.npc?.state || 'player'}</span></div>
        <div class="ins-row"><span>Speed</span><span>${Math.hypot(s.vx,s.vy).toFixed(2)}</span></div>`;
    } else if (sel.type === 'node') {
      const n = sel.data;
      const tower = gs.planet?.towers.find(t=>t.nodeId===n.id);
      html = `<div class="ins-title">📍 ${n.label}</div>
        <div class="ins-row"><span>Terrain</span><span>${n.terrain}</span></div>
        <div class="ins-row"><span>Tower</span><span>${tower ? TOWER_TYPES[tower.type]?.label : 'None'}</span></div>`;
      if (!tower) showTowerMenu = true;
    } else if (sel.type === 'tower') {
      const t = sel.data; const td = TOWER_TYPES[t.type];
      html = `<div class="ins-title">${td?.icon} ${td?.label}</div>
        <div class="ins-row"><span>Level</span><span>${t.level}</span></div>
        <div class="ins-row"><span>Owner</span><span>${t.owner === gs.playerId ? 'You' : t.owner}</span></div>
        <div class="ins-row"><span>Node</span><span>${gs.planet?.graph.nodes.find(n=>n.id===t.nodeId)?.label||t.nodeId}</span></div>`;
    } else if (sel.type === 'bot') {
      const b = sel.data;
      html = `<div class="ins-title">🤖 ${b.owner === gs.playerId ? 'Your Bot' : 'Enemy Bot'}</div>
        <div class="ins-row"><span>Hull</span><span>${b.hull}%</span></div>
        <div class="ins-row"><span>Node</span><span>${b.nodeId}</span></div>
        <div class="ins-row"><span>State</span><span>${b.state||'moving'}</span></div>`;
    } else if (sel.type === 'system') {
      const s = sel.data;
      const isAdj = (gs.galaxy?.systems[gs.currentSystemId]?.adj||[]).includes(s.id);
      html = `<div class="ins-title">⭐ ${s.name}</div>
        <div class="ins-row"><span>Reachable</span><span style="color:${isAdj?'#44ffaa':'#ff4444'}">${isAdj?'Yes':'No'}</span></div>
        <div class="ins-row"><span>Jump Target</span><span>${gs.jumpTarget===s.id?'✓ Set':'—'}</span></div>`;
      if (isAdj && s.id !== gs.currentSystemId) {
        html += `<div style="margin-top:6px"><button class="btn" onclick="window.__setJumpTarget('${s.id}')">Set Jump Target</button></div>`;
      }
    }

    el.innerHTML = html;
    if (tm) tm.classList.toggle('open', showTowerMenu);
  },

  buildActionButtons() {
    const el = document.getElementById('action-buttons');
    if (!el) return;
    el.innerHTML = `
      <div class="btn-row">
        <button class="btn" id="btn-pause" onclick="window.__togglePause()">⏸ Pause</button>
        <button class="btn" id="btn-mute"  onclick="window.__toggleMute()">♫ Mute</button>
      </div>
      <div id="space-actions">
        <button class="btn" id="btn-galaxy" onclick="window.__openGalaxy()">🌌 Galaxy Map</button>
        <button class="btn" id="btn-clear-jump" onclick="window.__clearJump()" style="display:none">✕ Clear Jump</button>
      </div>
      <div id="planet-actions" style="display:none">
        <button class="btn" onclick="window.__launchShip()">🚀 Launch Ship</button>
      </div>
      <div id="galaxy-actions" style="display:none">
        <button class="btn" onclick="window.__closeGalaxy()">◄ Back</button>
      </div>
    `;

    // Populate the inspector-section tower-menu (defined in HTML)
    const tm = document.getElementById('tower-menu');
    if (tm) {
      let thtml = '<div class="section-title" style="width:100%;margin-top:4px">BUILD TOWER</div>';
      thtml += '<div style="display:flex;flex-wrap:wrap;gap:3px">';
      for (const [key, td] of Object.entries(TOWER_TYPES)) {
        if (key === 'launch') continue;
        thtml += `<button class="tower-btn" style="color:${td.color}" onclick="window.__buildTower('${key}')">${td.icon} ${td.label}<br><span style="color:#445566">${td.cost}cr</span></button>`;
      }
      thtml += '</div>';
      tm.innerHTML = thtml;
    }
  },

  buildWeaponPicker() {
    const el = document.getElementById('weapon-picker');
    if (!el) return;
    let html = '<div class="section-title">WEAPON</div><div style="display:flex;gap:3px;flex-wrap:wrap">';
    for (const [key, w] of Object.entries(WEAPONS)) {
      html += `<button class="weapon-btn" id="wpn-${key}" onclick="window.__selectWeapon('${key}')"
        style="border-color:${w.color}44;color:${w.color}">
        ${w.label}<br><span style="color:#445566;font-size:9px">dmg ${w.damage} · cd ${w.cooldown}</span>
      </button>`;
    }
    html += '</div>';
    el.innerHTML = html;
    this.refreshWeaponPicker();
  },

  refreshWeaponPicker() {
    const sel = GameState.selectedWeapon;
    for (const key of Object.keys(WEAPONS)) {
      const btn = document.getElementById(`wpn-${key}`);
      if (!btn) continue;
      const w = WEAPONS[key];
      btn.style.background = key === sel ? w.color + '22' : '';
      btn.style.borderColor = key === sel ? w.color : w.color + '44';
    }
  },

  updateActions() {
    const gs = GameState;
    document.getElementById('space-actions').style.display  = gs.mode === 'space' ? '' : 'none';
    document.getElementById('planet-actions').style.display = gs.mode === 'planet' ? '' : 'none';
    document.getElementById('galaxy-actions').style.display = gs.mode === 'galaxy' ? '' : 'none';
    const cj = document.getElementById('btn-clear-jump');
    if (cj) cj.style.display = gs.jumpTarget ? '' : 'none';
    const pp = document.getElementById('btn-pause');
    if (pp) pp.textContent = gs.paused ? '▶ Resume' : '⏸ Pause';
    this.refreshWeaponPicker();
  }
};

function partyEntry(name, sub, color, selected, id) {
  return `<div class="party-entry${selected?' selected':''}" data-id="${id}">
    <div class="party-name" style="color:${color}">${name}</div>
    <div class="party-sub">${sub}</div>
  </div>`;
}

// ── Global callbacks for inline onclick ───────────────────────────────────
window.__togglePause = () => {
  GameState.paused = !GameState.paused;
  document.getElementById('btn-pause').textContent = GameState.paused ? '▶ Resume' : '⏸ Pause';
};
window.__toggleMute = () => {
  const m = Audio.toggleMute();
  document.getElementById('btn-mute').textContent = m ? '♫ Muted' : '♫ Mute';
};
window.__openGalaxy = () => GameState.openGalaxy();
window.__closeGalaxy = () => GameState.closeGalaxy();
window.__clearJump = () => { GameState.jumpQueue = []; UI.update(); };
window.__launchShip = () => GameState.launchFromPlanet();
window.__selectWeapon = (type) => {
  GameState.selectedWeapon = type;
  UI.refreshWeaponPicker();
};
window.__buildTower = (type) => {
  const ok = PlanetMode.buildTower(type);
  if (!ok) { toast('Cannot build here (no node selected or already built)'); }
  UI.update();
};
window.__setJumpTarget = (id) => {
  const gs = GameState;
  const tail = gs.jumpQueue.length ? gs.jumpQueue[gs.jumpQueue.length-1] : gs.currentSystemId;
  const tailAdj = gs.galaxy?.systems[tail]?.adj || [];
  if (tailAdj.includes(id) && !gs.jumpQueue.includes(id)) {
    gs.jumpQueue.push(id);
    toast(`Added to route: ${gs.galaxy?.systems[id]?.name || id}`);
  } else {
    gs.jumpQueue = [id];
    toast(`Jump target: ${gs.galaxy?.systems[id]?.name || id}`);
  }
  UI.update();
};

export function toast(msg, dur = 2500) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id='toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}
