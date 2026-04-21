// Planet surface mode: graph traversal, towers, mechs, bots, rendering
"use strict";
import { GameState, bus, getNode, getNeighbors, aStar, WEAPONS } from './state.js';

// ── Biome styles ──────────────────────────────────────────────────────────
const BIOME = {
  jungle:   { bg: '#0d2010', edgeColor: '#1a4020', nodeColor: '#1f5028', textColor: '#88ffaa' },
  ocean:    { bg: '#080d20', edgeColor: '#102240', nodeColor: '#142a50', textColor: '#88aaff' },
  desert:   { bg: '#1a1005', edgeColor: '#3a2810', nodeColor: '#4a3015', textColor: '#ffcc66' },
  taiga:    { bg: '#08101a', edgeColor: '#122030', nodeColor: '#18283a', textColor: '#88ccff' },
  grassland:{ bg: '#0d1a0a', edgeColor: '#1a3018', nodeColor: '#203820', textColor: '#aaffaa' },
};

// ── Tower definitions ─────────────────────────────────────────────────────
export const TOWER_TYPES = {
  farm:          { label:'Farm',          cost:50,  color:'#44aa44', icon:'F' },
  ranch:         { label:'Ranch',         cost:60,  color:'#aa6622', icon:'R' },
  mine:          { label:'Mine',          cost:80,  color:'#777788', icon:'M' },
  comms:         { label:'Comms',         cost:70,  color:'#4488ff', icon:'C' },
  exploration:   { label:'Explorer',      cost:90,  color:'#aa44ff', icon:'E' },
  colonization:  { label:'Colony',        cost:120, color:'#ffffff', icon:'K' },
  manufacturing: { label:'Factory',       cost:110, color:'#ff8800', icon:'P' },
  trade:         { label:'Trade',         cost:100, color:'#ffee44', icon:'T' },
  launch:        { label:'Launch Pad',    cost:0,   color:'#44ccff', icon:'L' },
  defense:       { label:'Defense',       cost:95,  color:'#ff4444', icon:'D' },
};

// ── Particles ─────────────────────────────────────────────────────────────
const particles = [];
function addBurst(x, y, color, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 0.5 + Math.random() * 1.5;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 1, color });
  }
}

// ── Planet projectiles (mech weapons) ────────────────────────────────────
const planetProjectiles = [];

// ── WASD move cooldown (prevents node-skipping) ───────────────────────────
let moveCooldown = 0;

// ── Planet mode ───────────────────────────────────────────────────────────
export const PlanetMode = {
  selectedNodeId: null,
  buildingTowerType: null,
  lastSaveFrame: 0,
  weaponCooldown: 0,

  step(dt, keys) {
    const gs = GameState;
    const pl = gs.planet;
    if (!pl) return;
    const mech = gs.playerMech;

    // Ensure launchPadHull exists
    if (pl.launchPadHull === undefined) pl.launchPadHull = 100;

    // ── Mech path following ───────────────────────────────────────────────
    if (mech && mech.path && mech.path.length > 1) {
      mech.progress += mech.speed * dt;
      if (mech.progress >= 1) {
        mech.progress = 0;
        mech.path.shift();
        mech.nodeId = mech.path[0];
        if (mech.path.length === 1) {
          mech.path = [];
          mech.target = null;
          bus.emit('mech:arrived', { nodeId: mech.nodeId });
        }
      }
    }

    // ── WASD: move to best-aligned neighbor ───────────────────────────────
    if (moveCooldown > 0) moveCooldown -= dt;
    if (mech && mech.path.length === 0 && moveCooldown <= 0) {
      let dirX = 0, dirY = 0;
      if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) dirY = -1;
      if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) dirY =  1;
      if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) dirX = -1;
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) dirX =  1;
      if (dirX !== 0 || dirY !== 0) {
        const cur = getNode(pl, mech.nodeId);
        let best = null, bestDot = 0.25; // min threshold
        for (const nid of getNeighbors(pl, mech.nodeId)) {
          const nb = getNode(pl, nid);
          if (!nb) continue;
          const dx = nb.x - cur.x, dy = nb.y - cur.y;
          const len = Math.hypot(dx, dy) || 1;
          const dot = (dx/len)*dirX + (dy/len)*dirY;
          if (dot > bestDot) { best = nid; bestDot = dot; }
        }
        if (best) {
          mech.path = [mech.nodeId, best];
          mech.progress = 0;
          mech.target = best;
          moveCooldown = 12; // frames before next WASD move
          bus.emit('mech:move');
        }
      }
    }

    // ── Bot movement: march toward launch pad ────────────────────────────
    const launchNodeId = getLaunchNodeId(pl);
    const deadBots = new Set();
    for (const bot of pl.bots) {
      if (!bot.path || bot.path.length < 2) {
        if (bot.nodeId === launchNodeId) {
          // Reached launch pad — damage it
          pl.launchPadHull = Math.max(0, pl.launchPadHull - 15);
          const ln = getNode(pl, launchNodeId);
          addBurst(ln?.x||100, ln?.y||380, '#ff4444', 10);
          bus.emit('tower:fire', { type:'bot_attack' });
          deadBots.add(bot.id);
          continue;
        }
        const path = aStar(pl, bot.nodeId, launchNodeId);
        if (path.length > 1) bot.path = path;
        continue;
      }
      bot.progress = (bot.progress || 0) + bot.speed * dt;
      if (bot.progress >= 1) {
        bot.progress = 0;
        bot.path.shift();
        bot.nodeId = bot.path[0];
        if (bot.path.length <= 1) bot.path = [];
      }
    }
    pl.bots = pl.bots.filter(b => !deadBots.has(b.id));

    // ── Wave spawner ──────────────────────────────────────────────────────
    if (pl.nextWaveFrame === undefined) pl.nextWaveFrame = 900;
    if (gs.frameCount >= pl.nextWaveFrame && pl.launchPadHull > 0) {
      pl.wave = (pl.wave || 1) + 1;
      const count = 2 + Math.floor(pl.wave / 2);
      const spawnNodes = pl.graph.nodes.filter(n => n.id !== launchNodeId);
      for (let i = 0; i < count; i++) {
        const spawnNode = spawnNodes[Math.floor(Math.random() * spawnNodes.length)];
        const hull = 30 + pl.wave * 8;
        const speed = 0.005 + Math.random() * 0.006;
        const colors = ['#ff4444','#ff8822','#ff44aa','#dd2266'];
        pl.bots.push({
          id: 'bot_' + Date.now() + '_' + i, owner: 'npc',
          nodeId: spawnNode.id, path: [], progress: 0,
          speed, hull, color: colors[i % colors.length]
        });
      }
      pl.nextWaveFrame = gs.frameCount + 600 + pl.wave * 60;
      bus.emit('wave:start', { wave: pl.wave });
    }

    // ── Defense towers attack bots ─────────────────────────────────────────
    if (gs.frameCount % 45 === 0) {
      for (const tower of pl.towers) {
        if (tower.type !== 'defense') continue;
        const tNode = getNode(pl, tower.nodeId);
        if (!tNode) continue;
        const RANGE = 140;
        for (const bot of pl.bots) {
          const bPos = this.getBotPos(bot, pl);
          if (!bPos) continue;
          const dist = Math.hypot(tNode.x - bPos.x, tNode.y - bPos.y);
          if (dist < RANGE) {
            bot.hull -= 20;
            bus.emit('tower:fire', { towerId: tower.id });
            addBurst(bPos.x, bPos.y, '#ff4444', 4);
          }
        }
      }
      pl.bots = pl.bots.filter(b => b.hull > 0);
    }

    // ── Mech auto-fire at nearest bot in range ────────────────────────────
    if (this.weaponCooldown > 0) this.weaponCooldown -= dt;
    if (mech && this.weaponCooldown <= 0) {
      const mechPos = this.getMechPos();
      const weapon = WEAPONS[gs.selectedWeapon] || WEAPONS.laser;
      if (mechPos) {
        let target = null, nearDist = weapon.range;
        for (const bot of pl.bots) {
          const bp = this.getBotPos(bot, pl);
          if (!bp) continue;
          const d = Math.hypot(bp.x - mechPos.x, bp.y - mechPos.y);
          if (d < nearDist) { target = bot; nearDist = d; }
        }
        if (target) {
          const bp = this.getBotPos(target, pl);
          const dx = bp.x - mechPos.x, dy = bp.y - mechPos.y;
          const dist = Math.hypot(dx, dy) || 1;
          planetProjectiles.push({
            x: mechPos.x, y: mechPos.y,
            vx: (dx/dist) * weapon.speed,
            vy: (dy/dist) * weapon.speed,
            life: 35, damage: weapon.damage,
            color: weapon.color, size: weapon.size,
            targetId: target.id,
          });
          this.weaponCooldown = weapon.cooldown;
          bus.emit('weapon:fire');
        }
      }
    }

    // ── Planet projectile movement + hit detection ────────────────────────
    for (const proj of planetProjectiles) {
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.life -= dt;
    }
    for (let i = planetProjectiles.length - 1; i >= 0; i--) {
      const proj = planetProjectiles[i];
      if (proj.life <= 0) { planetProjectiles.splice(i, 1); continue; }
      let hit = false;
      for (const bot of pl.bots) {
        const bp = this.getBotPos(bot, pl);
        if (!bp) continue;
        if (Math.hypot(bp.x - proj.x, bp.y - proj.y) < 10) {
          bot.hull -= proj.damage;
          addBurst(proj.x, proj.y, proj.color, 5);
          hit = true;
          break;
        }
      }
      if (hit) planetProjectiles.splice(i, 1);
    }
    pl.bots = pl.bots.filter(b => b.hull > 0);

    // ── Particles update ──────────────────────────────────────────────────
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= 0.025 * dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }

    // ── Auto-save ─────────────────────────────────────────────────────────
    if (gs.frameCount - this.lastSaveFrame > 300) {
      gs.markDirty('planet');
      this.lastSaveFrame = gs.frameCount;
    }
  },

  buildTower(type) {
    const gs = GameState;
    const pl = gs.planet;
    if (!pl || !this.selectedNodeId) return false;
    const existing = pl.towers.find(t => t.nodeId === this.selectedNodeId);
    if (existing) return false;
    const td = TOWER_TYPES[type];
    const player = pl.players[gs.playerId];
    if (player && (player.credits || 0) < td.cost) return false;
    pl.towers.push({ id: 't' + Date.now(), nodeId: this.selectedNodeId, type, level: 1, owner: gs.playerId });
    if (player) player.credits = (player.credits || 500) - td.cost;
    gs.markDirty('planet');
    bus.emit('tower:build', { type });
    addBurst(getNode(pl, this.selectedNodeId)?.x, getNode(pl, this.selectedNodeId)?.y, TOWER_TYPES[type].color, 8);
    return true;
  },

  handleClick(wx, wy) {
    const gs = GameState;
    const pl = gs.planet;
    if (!pl) return;
    let nearest = null, nearDist = 28;
    for (const n of pl.graph.nodes) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < nearDist) { nearest = n; nearDist = d; }
    }
    if (nearest) {
      this.selectedNodeId = nearest.id;
      gs.selectedEntity = { type: 'node', data: nearest };
      const mech = gs.playerMech;
      if (mech && nearest.id !== mech.nodeId) {
        const path = aStar(pl, mech.nodeId, nearest.id);
        if (path.length > 1) { mech.path = path; mech.progress = 0; mech.target = nearest.id; }
      }
    } else {
      for (const tower of pl.towers) {
        const tn = getNode(pl, tower.nodeId);
        if (tn && Math.hypot(tn.x - wx, tn.y - wy) < 20) {
          gs.selectedEntity = { type: 'tower', data: tower };
          this.selectedNodeId = tower.nodeId;
          return;
        }
      }
      for (const bot of pl.bots) {
        const bp = this.getBotPos(bot, pl);
        if (bp && Math.hypot(bp.x - wx, bp.y - wy) < 16) {
          gs.selectedEntity = { type: 'bot', data: bot };
          return;
        }
      }
    }
  },

  getMechPos() {
    const gs = GameState;
    const pl = gs.planet;
    const mech = gs.playerMech;
    if (!mech || !pl) return null;
    if (!mech.path || mech.path.length < 2) {
      const n = getNode(pl, mech.nodeId);
      return n ? { x: n.x, y: n.y } : null;
    }
    const a = getNode(pl, mech.path[0]), b = getNode(pl, mech.path[1]);
    if (!a || !b) return null;
    const t = mech.progress;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  },

  getBotPos(bot, pl) {
    if (!bot.path || bot.path.length < 2) {
      const n = getNode(pl, bot.nodeId);
      return n ? { x: n.x, y: n.y } : null;
    }
    const a = getNode(pl, bot.path[0]), b = getNode(pl, bot.path[1]);
    if (!a || !b) return null;
    const t = bot.progress || 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  },

  draw(ctx, W, H) {
    const gs = GameState;
    const pl = gs.planet;
    if (!pl) return;
    const bm = BIOME[pl.biome] || BIOME.jungle;

    // Background
    ctx.fillStyle = bm.bg; ctx.fillRect(0, 0, W, H);
    const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
    grad.addColorStop(0, bm.nodeColor + '22');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    const mech = gs.playerMech;
    const mechPath = mech?.path || [];
    const launchNodeId = getLaunchNodeId(pl);

    // ── Edges ─────────────────────────────────────────────────────────────
    for (const e of pl.graph.edges) {
      const a = getNode(pl, e.from), b = getNode(pl, e.to);
      if (!a || !b) continue;
      // Highlight path edges
      const onPath = mechPath.length > 1 &&
        mechPath.some((nid, i) => i < mechPath.length-1 &&
          ((mechPath[i]===e.from && mechPath[i+1]===e.to) ||
           (mechPath[i]===e.to   && mechPath[i+1]===e.from)));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = onPath ? bm.textColor + 'aa' : bm.edgeColor;
      ctx.lineWidth = onPath ? 3 : 2;
      ctx.stroke();
    }

    // ── Nodes ─────────────────────────────────────────────────────────────
    for (const n of pl.graph.nodes) {
      const isSelected  = n.id === this.selectedNodeId;
      const isMechHere  = mech && n.id === mech.nodeId && (!mech.path || mech.path.length < 2);
      const isLaunchPad = n.id === launchNodeId;
      const tower = pl.towers.find(t => t.nodeId === n.id);
      const r = 14;

      // Launch pad special glow
      if (isLaunchPad) {
        const pulse = 0.5 + 0.3 * Math.sin(gs.frameCount * 0.06);
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 14, 0, Math.PI*2);
        const hullPct = (pl.launchPadHull ?? 100) / 100;
        const lc = hullPct > 0.5 ? '#44ccff' : hullPct > 0.25 ? '#ffcc44' : '#ff4444';
        ctx.strokeStyle = lc + Math.round(pulse*200).toString(16).padStart(2,'0');
        ctx.lineWidth = 2; ctx.stroke();
      }

      if (isSelected) {
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 8, 0, Math.PI*2);
        ctx.fillStyle = bm.textColor + '22'; ctx.fill();
      }

      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI*2);
      ctx.fillStyle = isLaunchPad ? '#071822' : (isSelected ? bm.nodeColor : bm.bg);
      ctx.strokeStyle = isLaunchPad ? '#44ccff' : (isSelected ? bm.textColor : bm.edgeColor);
      ctx.lineWidth = isLaunchPad ? 2 : (isSelected ? 1.5 : 1);
      ctx.fill(); ctx.stroke();

      // Node label
      ctx.fillStyle = isLaunchPad ? '#44ccff' : bm.textColor;
      ctx.font = isLaunchPad ? 'bold 9px Segoe UI,system-ui' : '9px Segoe UI,system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y + r + 13);

      // "HERE" indicator when mech is at node
      if (isMechHere) {
        ctx.fillStyle = '#44ccffcc';
        ctx.font = 'bold 8px Segoe UI,system-ui';
        ctx.fillText('▲ HERE', n.x, n.y - r - 6);
      }
    }

    // ── Launch pad HP bar ─────────────────────────────────────────────────
    const launchNode = getNode(pl, launchNodeId);
    if (launchNode) {
      const lh = pl.launchPadHull ?? 100;
      const hullPct = lh / 100;
      const barW = 60, barH = 5;
      const bx = launchNode.x - barW/2, by = launchNode.y - 36;
      ctx.fillStyle = '#0a1a0a'; ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = hullPct > 0.5 ? '#44ffaa' : hullPct > 0.25 ? '#ffcc44' : '#ff4444';
      ctx.fillRect(bx, by, barW * hullPct, barH);
      ctx.strokeStyle = '#1a3a2a'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, barW, barH);
      ctx.fillStyle = '#44ccffaa'; ctx.font = '8px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText(`LAUNCH PAD ${lh.toFixed(0)}%`, launchNode.x, by - 3);
    }

    // ── Towers ────────────────────────────────────────────────────────────
    for (const tower of pl.towers) {
      const tn = getNode(pl, tower.nodeId);
      if (!tn) continue;
      drawTower(ctx, tn.x, tn.y, TOWER_TYPES[tower.type], tower.level);
    }

    // ── Bots ──────────────────────────────────────────────────────────────
    for (const bot of pl.bots) {
      const pos = this.getBotPos(bot, pl);
      if (!pos) continue;
      drawBot(ctx, pos.x, pos.y, bot.color, bot.hull);
      // Show movement arrow toward launch pad
      if (bot.path && bot.path.length > 1) {
        const nxt = getNode(pl, bot.path[1]);
        if (nxt) {
          const dx = nxt.x - pos.x, dy = nxt.y - pos.y;
          const len = Math.hypot(dx,dy)||1;
          ctx.strokeStyle = bot.color + '66'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(pos.x + dx/len*12, pos.y + dy/len*12);
          ctx.stroke();
        }
      }
    }

    // ── Player mech ───────────────────────────────────────────────────────
    const mechPos = this.getMechPos();
    if (mechPos) drawMech(ctx, mechPos.x, mechPos.y, mech?.color || '#44ccff');

    // ── Other players ─────────────────────────────────────────────────────
    for (const op of gs.otherPlayers) {
      if (op.planet === gs.currentPlanetId && op.mechPos) {
        drawMech(ctx, op.mechPos.x, op.mechPos.y, op.color || '#ff88ff');
      }
    }

    // ── Planet projectiles ────────────────────────────────────────────────
    for (const proj of planetProjectiles) {
      const alpha = proj.life / 35;
      ctx.beginPath(); ctx.arc(proj.x, proj.y, proj.size||2, 0, Math.PI*2);
      ctx.fillStyle = proj.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      // Glow
      const g = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, (proj.size||2)*3);
      g.addColorStop(0, proj.color + 'aa');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(proj.x, proj.y, (proj.size||2)*3, 0, Math.PI*2);
      ctx.fillStyle = g; ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Particles ─────────────────────────────────────────────────────────
    for (const p of particles) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
      ctx.fillStyle = p.color + Math.round(p.life * 255).toString(16).padStart(2,'0');
      ctx.fill();
    }

    // ── HUD overlay ───────────────────────────────────────────────────────
    ctx.fillStyle = bm.textColor + '88'; ctx.font = 'bold 12px Segoe UI,system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${pl.name.toUpperCase()} — ${pl.biome.toUpperCase()}  ·  Wave ${pl.wave||1}`, 12, 22);

    // Movement hint
    ctx.fillStyle = '#2a3a2a'; ctx.font = '10px Segoe UI,system-ui';
    ctx.fillText('WASD/click: move  ·  auto-fires at enemies  ·  L at launch pad: leave', 12, H - 12);

    // At launch pad hint
    if (mech && mech.nodeId === launchNodeId && (!mech.path || mech.path.length < 2)) {
      ctx.fillStyle = '#44ccff'; ctx.font = 'bold 13px Segoe UI,system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('[L] Launch Ship — leave planet', W/2, H - 32);
    }

    // Next wave countdown
    const framesUntil = (pl.nextWaveFrame||0) - gs.frameCount;
    if (framesUntil > 0 && framesUntil < 300) {
      const sec = (framesUntil / 60).toFixed(1);
      ctx.fillStyle = '#ff8844'; ctx.font = 'bold 13px Segoe UI,system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`Next wave in ${sec}s`, W/2, 44);
    }

    // Game over
    if ((pl.launchPadHull ?? 100) <= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff4444'; ctx.font = 'bold 32px Segoe UI,system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('LAUNCH PAD DESTROYED', W/2, H/2 - 20);
      ctx.fillStyle = '#ffaa44'; ctx.font = '16px Segoe UI,system-ui';
      ctx.fillText('Press L to evacuate or rebuild', W/2, H/2 + 20);
    }
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────
function getLaunchNodeId(pl) {
  const launchTower = pl.towers.find(t => t.type === 'launch');
  return launchTower ? launchTower.nodeId : pl.graph.nodes[0]?.id;
}

function drawMech(ctx, x, y, color) {
  ctx.save(); ctx.translate(x, y);
  const g = ctx.createRadialGradient(0,0,0,0,0,22);
  g.addColorStop(0, color + '44'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(-7, -7, 14, 14);
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-7,4); ctx.lineTo(-13,12);
  ctx.moveTo(7,4);  ctx.lineTo(13,12);
  ctx.moveTo(-7,-2); ctx.lineTo(-13,-10);
  ctx.moveTo(7,-2);  ctx.lineTo(13,-10);
  ctx.stroke();
  ctx.fillStyle = '#ffffff66';
  ctx.fillRect(-4,-5,8,5);
  ctx.restore();
}

function drawBot(ctx, x, y, color, hull) {
  ctx.save(); ctx.translate(x,y);
  const g = ctx.createRadialGradient(0,0,0,0,0,14);
  g.addColorStop(0, color+'66'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(0,0,14,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  // Body triangle (threatening shape)
  ctx.beginPath();
  ctx.moveTo(0,-8); ctx.lineTo(7,6); ctx.lineTo(-7,6); ctx.closePath();
  ctx.fillStyle=color; ctx.fill();
  // Eyes
  ctx.fillStyle='#fff'; ctx.fillRect(-3,-4,2,2); ctx.fillRect(1,-4,2,2);
  // Hull bar
  const maxHull = 80;
  ctx.fillStyle='#111'; ctx.fillRect(-8,9,16,3);
  ctx.fillStyle=color; ctx.fillRect(-8,9,16*(Math.min(hull,maxHull)/maxHull),3);
  ctx.restore();
}

function drawTower(ctx, x, y, td, level) {
  ctx.save(); ctx.translate(x, y);
  const g = ctx.createRadialGradient(0,0,0,0,0,18);
  g.addColorStop(0, td.color+'55'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  const s = 10 + (level-1)*2;
  ctx.fillStyle='#111122';
  ctx.strokeStyle=td.color; ctx.lineWidth=1.5;
  ctx.fillRect(-s,-s,s*2,s*2); ctx.strokeRect(-s,-s,s*2,s*2);
  ctx.fillStyle=td.color; ctx.font=`bold ${10+level}px Segoe UI`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(td.icon, 0, 0);
  ctx.textBaseline='alphabetic';
  ctx.restore();
}

export function drawPlanetRadar(radarCtx, W, H) {
  const gs = GameState;
  const pl = gs.planet;
  if (!pl) return;
  radarCtx.clearRect(0,0,W,H);
  radarCtx.fillStyle='#040410'; radarCtx.fillRect(0,0,W,H);

  const mp = PlanetMode.getMechPos();
  if (!mp) return;

  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const n of pl.graph.nodes) {
    minX=Math.min(minX,n.x); minY=Math.min(minY,n.y);
    maxX=Math.max(maxX,n.x); maxY=Math.max(maxY,n.y);
  }
  const span = Math.max(maxX-minX, maxY-minY, 1);
  const scale = Math.min(W, H) * 0.85 / span;
  const toR = (wx,wy) => ({
    rx: W/2 + (wx - mp.x) * scale,
    ry: H/2 + (wy - mp.y) * scale,
  });

  radarCtx.save();
  radarCtx.beginPath(); radarCtx.arc(W/2,H/2,Math.min(W,H)/2-1,0,Math.PI*2); radarCtx.clip();

  const bm = BIOME[pl.biome]||BIOME.jungle;
  for (const e of pl.graph.edges) {
    const a=getNode(pl,e.from), b=getNode(pl,e.to);
    if (!a||!b) continue;
    const ra=toR(a.x,a.y), rb=toR(b.x,b.y);
    radarCtx.beginPath(); radarCtx.moveTo(ra.rx,ra.ry); radarCtx.lineTo(rb.rx,rb.ry);
    radarCtx.strokeStyle=bm.edgeColor; radarCtx.lineWidth=1; radarCtx.stroke();
  }
  const launchId = getLaunchNodeId(pl);
  for (const n of pl.graph.nodes) {
    const rn=toR(n.x,n.y);
    const hasTower = pl.towers.find(t => t.nodeId === n.id);
    radarCtx.beginPath(); radarCtx.arc(rn.rx,rn.ry,n.id===launchId?4:2,0,Math.PI*2);
    radarCtx.fillStyle = n.id===launchId ? '#44ccff' : (hasTower ? '#ffcc44' : bm.nodeColor);
    radarCtx.fill();
  }
  for (const bot of (pl.bots||[])) {
    const bp = PlanetMode.getBotPos(bot, pl);
    if (!bp) continue;
    const rb = toR(bp.x, bp.y);
    radarCtx.beginPath(); radarCtx.arc(rb.rx, rb.ry, 2, 0, Math.PI*2);
    radarCtx.fillStyle='#ff4444'; radarCtx.fill();
  }

  radarCtx.restore();

  radarCtx.beginPath(); radarCtx.arc(W/2,H/2,Math.min(W,H)/2-1,0,Math.PI*2);
  radarCtx.strokeStyle='#1a2a3a'; radarCtx.lineWidth=1; radarCtx.stroke();

  // Mech at center
  const cx=W/2, cy=H/2, ms=4;
  radarCtx.fillStyle='#44ccff';
  radarCtx.beginPath();
  radarCtx.moveTo(cx, cy-ms); radarCtx.lineTo(cx+ms, cy);
  radarCtx.lineTo(cx, cy+ms); radarCtx.lineTo(cx-ms, cy); radarCtx.closePath();
  radarCtx.fill();
  radarCtx.fillStyle='#44ccffaa'; radarCtx.font='7px Segoe UI';
  radarCtx.textAlign='center'; radarCtx.fillText('YOU', cx, cy-ms-2);
}
