// Planet surface mode: graph traversal, towers, mechs, bots, rendering
"use strict";
import { GameState, bus, getNode, getNeighbors, aStar } from './state.js';

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

// ── Particle bursts for planet effects ────────────────────────────────────
const particles = [];
function addBurst(x, y, color, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 0.5 + Math.random() * 1.5;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 1, color });
  }
}

// ── Planet mode ───────────────────────────────────────────────────────────
export const PlanetMode = {
  selectedNodeId: null,
  hoveredNodeId: null,
  buildingTowerType: null,
  lastSaveFrame: 0,

  step(dt, keys) {
    const gs = GameState;
    const pl = gs.planet;
    if (!pl) return;
    const mech = gs.playerMech;

    // ── Mech movement (path following) ───────────────────────────────────
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

    // ── WASD mech movement (move to adjacent node) ────────────────────────
    if (mech && mech.path.length === 0) {
      let dirNode = null;
      const cur = getNode(pl, mech.nodeId);
      const neighbors = getNeighbors(pl, mech.nodeId).map(id => ({ id, node: getNode(pl, id) }));
      if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) dirNode = neighbors.find(n => n.node.y < cur.y - 10)?.id;
      if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) dirNode = neighbors.find(n => n.node.y > cur.y + 10)?.id;
      if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) dirNode = neighbors.find(n => n.node.x < cur.x - 10)?.id;
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) dirNode = neighbors.find(n => n.node.x > cur.x + 10)?.id;
      if (dirNode && dirNode !== mech.nodeId) {
        mech.path = [mech.nodeId, dirNode];
        mech.progress = 0;
        mech.target = dirNode;
        bus.emit('mech:move');
      }
    }

    // ── Bot movement ──────────────────────────────────────────────────────
    for (const bot of pl.bots) {
      if (!bot.path || bot.path.length < 2) {
        // Pick a new random target
        const nodes = pl.graph.nodes;
        const targetNode = nodes[Math.floor(Math.random() * nodes.length)];
        if (targetNode.id !== bot.nodeId) {
          bot.path = aStar(pl, bot.nodeId, targetNode.id);
        }
        continue;
      }
      bot.progress = (bot.progress || 0) + bot.speed * dt;
      if (bot.progress >= 1) {
        bot.progress = 0;
        bot.path.shift();
        bot.nodeId = bot.path[0];
        if (bot.path.length === 1) bot.path = [];
      }
    }

    // ── Defense towers attack bots ─────────────────────────────────────────
    if (gs.frameCount % 60 === 0) {
      for (const tower of pl.towers) {
        if (tower.type !== 'defense') continue;
        const tNode = getNode(pl, tower.nodeId);
        const RANGE = 120;
        for (const bot of pl.bots) {
          if (bot.owner === tower.owner) continue;
          const bNode = getNode(pl, bot.nodeId);
          if (!bNode) continue;
          const dist = Math.hypot(tNode.x - bNode.x, tNode.y - bNode.y);
          if (dist < RANGE) {
            bot.hull -= 20;
            bus.emit('tower:fire', { towerId: tower.id });
            addBurst(bNode.x, bNode.y, '#ff4444', 4);
          }
        }
        // Remove dead bots
        pl.bots = pl.bots.filter(b => b.hull > 0);
      }
    }

    // ── Particle update ───────────────────────────────────────────────────
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

  // Place tower at currently selected node
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
    // Find nearest node within 24px
    let nearest = null, nearDist = 24;
    for (const n of pl.graph.nodes) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < nearDist) { nearest = n; nearDist = d; }
    }
    if (nearest) {
      this.selectedNodeId = nearest.id;
      gs.selectedEntity = { type: 'node', data: nearest };
      // Move mech there
      const mech = gs.playerMech;
      if (mech && nearest.id !== mech.nodeId) {
        const path = aStar(pl, mech.nodeId, nearest.id);
        if (path.length > 1) { mech.path = path; mech.progress = 0; mech.target = nearest.id; }
      }
    } else {
      // Check for tower/bot click
      for (const tower of pl.towers) {
        const tn = getNode(pl, tower.nodeId);
        if (tn && Math.hypot(tn.x - wx, tn.y - wy) < 20) {
          gs.selectedEntity = { type: 'tower', data: tower };
          this.selectedNodeId = tower.nodeId;
          return;
        }
      }
      for (const bot of pl.bots) {
        const bn = getNode(pl, bot.nodeId);
        if (bn && Math.hypot(bn.x - wx, bn.y - wy) < 16) {
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

    // Subtle biome gradient
    const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
    grad.addColorStop(0, bm.nodeColor + '22');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    // ── Edges ─────────────────────────────────────────────────────────────
    for (const e of pl.graph.edges) {
      const a = getNode(pl, e.from), b = getNode(pl, e.to);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = bm.edgeColor; ctx.lineWidth = 2; ctx.stroke();
    }

    // ── Nodes ─────────────────────────────────────────────────────────────
    for (const n of pl.graph.nodes) {
      const isSelected = n.id === this.selectedNodeId;
      const r = 14;

      // Glow for selected
      if (isSelected) {
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 8, 0, Math.PI*2);
        ctx.fillStyle = bm.textColor + '22'; ctx.fill();
      }

      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI*2);
      ctx.fillStyle = isSelected ? bm.nodeColor : bm.bg;
      ctx.strokeStyle = isSelected ? bm.textColor : bm.edgeColor;
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.fill(); ctx.stroke();

      // Label
      ctx.fillStyle = bm.textColor; ctx.font = '9px Segoe UI, system-ui';
      ctx.textAlign = 'center'; ctx.fillText(n.label, n.x, n.y + r + 13);
    }

    // ── Towers ────────────────────────────────────────────────────────────
    for (const tower of pl.towers) {
      const tn = getNode(pl, tower.nodeId);
      if (!tn) continue;
      const td = TOWER_TYPES[tower.type];
      drawTower(ctx, tn.x, tn.y, td, tower.level);
    }

    // ── Bots ──────────────────────────────────────────────────────────────
    for (const bot of pl.bots) {
      const pos = this.getBotPos(bot, pl);
      if (!pos) continue;
      drawBot(ctx, pos.x, pos.y, bot.color, bot.hull);
    }

    // ── Player mech ───────────────────────────────────────────────────────
    const mechPos = this.getMechPos();
    if (mechPos) {
      drawMech(ctx, mechPos.x, mechPos.y, gs.playerMech?.color || '#44ccff');
    }

    // ── Other players' mechs ──────────────────────────────────────────────
    for (const op of gs.otherPlayers) {
      if (op.planet === gs.currentPlanetId && op.mechPos) {
        drawMech(ctx, op.mechPos.x, op.mechPos.y, op.color || '#ff88ff');
      }
    }

    // ── Particles ─────────────────────────────────────────────────────────
    for (const p of particles) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
      ctx.fillStyle = p.color + Math.round(p.life * 255).toString(16).padStart(2,'0');
      ctx.fill();
    }

    // ── Planet name ───────────────────────────────────────────────────────
    ctx.fillStyle = bm.textColor + '88'; ctx.font = 'bold 13px Segoe UI, system-ui';
    ctx.textAlign = 'left'; ctx.fillText(`${pl.name} — ${pl.biome.toUpperCase()}`, 14, 22);
  }
};

// ── Drawing helpers ───────────────────────────────────────────────────────
function drawMech(ctx, x, y, color) {
  ctx.save(); ctx.translate(x, y);
  // Glow
  const g = ctx.createRadialGradient(0,0,0,0,0,22);
  g.addColorStop(0, color + '44'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  // Body
  ctx.fillStyle = color;
  ctx.fillRect(-7, -7, 14, 14);
  // Legs
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-7,4); ctx.lineTo(-13,12);
  ctx.moveTo(7,4);  ctx.lineTo(13,12);
  ctx.moveTo(-7,-2);ctx.lineTo(-13,-10);
  ctx.moveTo(7,-2); ctx.lineTo(13,-10);
  ctx.stroke();
  // Cockpit
  ctx.fillStyle = '#ffffff66';
  ctx.fillRect(-4,-5,8,5);
  ctx.restore();
}

function drawBot(ctx, x, y, color, hull) {
  ctx.save(); ctx.translate(x,y);
  const g = ctx.createRadialGradient(0,0,0,0,0,12);
  g.addColorStop(0, color+'55'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2);
  ctx.fillStyle=color; ctx.fill();
  // Hull bar
  ctx.fillStyle='#222'; ctx.fillRect(-8,9,16,3);
  ctx.fillStyle=color; ctx.fillRect(-8,9,16*(hull/100),3);
  ctx.restore();
}

function drawTower(ctx, x, y, td, level) {
  ctx.save(); ctx.translate(x, y);
  // Glow
  const g = ctx.createRadialGradient(0,0,0,0,0,18);
  g.addColorStop(0, td.color+'55'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  // Base square
  const s = 10 + (level-1)*2;
  ctx.fillStyle='#111122';
  ctx.strokeStyle=td.color; ctx.lineWidth=1.5;
  ctx.fillRect(-s,-s,s*2,s*2);
  ctx.strokeRect(-s,-s,s*2,s*2);
  // Icon letter
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

  // Mech-centered: compute scale from node bounding box, then offset so mech = center
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

  // Clip to circle
  radarCtx.save();
  radarCtx.beginPath(); radarCtx.arc(W/2,H/2,Math.min(W,H)/2-1,0,Math.PI*2); radarCtx.clip();

  const bm = BIOME[pl.biome]||BIOME.jungle;
  // Edges
  for (const e of pl.graph.edges) {
    const a=getNode(pl,e.from), b=getNode(pl,e.to);
    if (!a||!b) continue;
    const ra=toR(a.x,a.y), rb=toR(b.x,b.y);
    radarCtx.beginPath(); radarCtx.moveTo(ra.rx,ra.ry); radarCtx.lineTo(rb.rx,rb.ry);
    radarCtx.strokeStyle=bm.edgeColor; radarCtx.lineWidth=1; radarCtx.stroke();
  }
  // Nodes
  for (const n of pl.graph.nodes) {
    const rn=toR(n.x,n.y);
    radarCtx.beginPath(); radarCtx.arc(rn.rx,rn.ry,2,0,Math.PI*2);
    const hasTower = pl.towers && pl.towers[n.id];
    radarCtx.fillStyle = hasTower ? '#ffcc44' : bm.nodeColor;
    radarCtx.fill();
  }
  // Bots
  for (const bot of (pl.bots||[])) {
    const bn = getNode(pl, bot.nodeId);
    if (!bn) continue;
    const rb = toR(bn.x, bn.y);
    radarCtx.beginPath(); radarCtx.arc(rb.rx, rb.ry, 2, 0, Math.PI*2);
    radarCtx.fillStyle='#ff4444'; radarCtx.fill();
  }

  radarCtx.restore();

  // Radar border
  radarCtx.beginPath(); radarCtx.arc(W/2,H/2,Math.min(W,H)/2-1,0,Math.PI*2);
  radarCtx.strokeStyle='#1a2a3a'; radarCtx.lineWidth=1; radarCtx.stroke();

  // Mech at center: diamond shape
  const cx=W/2, cy=H/2, ms=4;
  radarCtx.fillStyle='#44ccff';
  radarCtx.beginPath();
  radarCtx.moveTo(cx, cy-ms); radarCtx.lineTo(cx+ms, cy);
  radarCtx.lineTo(cx, cy+ms); radarCtx.lineTo(cx-ms, cy); radarCtx.closePath();
  radarCtx.fill();
  radarCtx.fillStyle='#44ccffaa'; radarCtx.font='7px Segoe UI';
  radarCtx.textAlign='center'; radarCtx.fillText('YOU', cx, cy-ms-2);
}
