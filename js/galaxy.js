// Galaxy map mode: pan/zoom star graph, system selection, jump targeting
"use strict";
import { GameState, bus } from './state.js';

const GALAXY_STAR_COUNT = 300;
let bgCanvas = null;

function makeBg(W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#02020c'; x.fillRect(0,0,W,H);
  for (let i = 0; i < GALAXY_STAR_COUNT; i++) {
    const sx=Math.random()*W, sy=Math.random()*H;
    const sr=Math.random()<0.05?1.2:0.5;
    x.beginPath(); x.arc(sx,sy,sr,0,Math.PI*2);
    x.fillStyle=`rgba(255,255,255,${0.1+Math.random()*0.4})`; x.fill();
  }
  return c;
}

export const GalaxyMode = {
  dragStart: null,
  panBase: null,

  draw(ctx, W, H) {
    const gs = GameState;
    const galaxy = gs.galaxy;
    if (!galaxy) return;

    if (!bgCanvas || bgCanvas.width !== W || bgCanvas.height !== H) bgCanvas = makeBg(W, H);

    // Auto-center camera on current system when galaxy opens
    if (gs.galaxyNeedsCenter) {
      gs.galaxyNeedsCenter = false;
      const cur = galaxy.systems[gs.currentSystemId];
      if (cur) {
        gs.galaxyCam.x = -(cur.x - W/2) * gs.galaxyCam.zoom;
        gs.galaxyCam.y = -(cur.y - H/2) * gs.galaxyCam.zoom;
      }
    }

    // Clear
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(bgCanvas,0,0);

    const cam = gs.galaxyCam;
    const adjSet = new Set(galaxy.systems[gs.currentSystemId]?.adj || []);

    ctx.save();
    ctx.translate(W/2 + cam.x, H/2 + cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    // ── Connection lines ──────────────────────────────────────────────────
    const systems = galaxy.systems;
    const drawn = new Set();
    for (const [id, sys] of Object.entries(systems)) {
      for (const adjId of (sys.adj || [])) {
        const key = [id,adjId].sort().join('-');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const adj = systems[adjId];
        if (!adj) continue;
        const sx = sys.x - W/2, sy = sys.y - H/2;
        const ax = adj.x - W/2, ay = adj.y - H/2;
        const isReachableLine = (id === gs.currentSystemId && adjSet.has(adjId)) ||
                                (adjId === gs.currentSystemId && adjSet.has(id));
        ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ax,ay);
        ctx.strokeStyle = isReachableLine ? '#2a4a6a' : '#0e0e22';
        ctx.lineWidth=1/cam.zoom; ctx.stroke();
      }
    }

    // ── Star systems ──────────────────────────────────────────────────────
    for (const [id, sys] of Object.entries(systems)) {
      const sx = sys.x - W/2, sy = sys.y - H/2;
      const isCurrent  = id === gs.currentSystemId;
      const isAdj      = adjSet.has(id);
      const isJumpTgt  = gs.jumpQueue.includes(id);
      const isSelected = gs.selectedEntity?.type === 'system' && gs.selectedEntity?.data?.id === id;
      const r = (sys.r || 10) * (isCurrent ? 1.5 : isAdj ? 1.1 : 1);

      // Non-reachable systems are dimmed significantly
      const dimmed = !isCurrent && !isAdj && !isJumpTgt;
      ctx.globalAlpha = dimmed ? 0.25 : 1.0;

      // Reachable system glow ring
      if (isAdj) {
        const pulse = 0.4 + 0.3 * Math.sin(gs.frameCount * 0.05);
        ctx.beginPath(); ctx.arc(sx, sy, r + 14/cam.zoom, 0, Math.PI*2);
        ctx.strokeStyle=`rgba(68,204,255,${pulse})`; ctx.lineWidth=1.5/cam.zoom; ctx.stroke();
      }

      // Jump target pulsing ring
      if (isJumpTgt) {
        const pulse = 0.5 + 0.5 * Math.sin(gs.frameCount * 0.08);
        ctx.beginPath(); ctx.arc(sx,sy,r+18*pulse/cam.zoom,0,Math.PI*2);
        ctx.strokeStyle=`rgba(68,204,255,${pulse*0.8})`; ctx.lineWidth=1.5/cam.zoom; ctx.stroke();
      }

      // Star body glow
      const glowAlpha = isCurrent ? 'aa' : isAdj ? '66' : '33';
      const g = ctx.createRadialGradient(sx,sy,0,sx,sy,r*3);
      g.addColorStop(0, sys.color+glowAlpha);
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(sx,sy,r*3,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();

      // Star body
      ctx.beginPath(); ctx.arc(sx,sy,r,0,Math.PI*2);
      ctx.fillStyle = dimmed ? sys.color+'55' : sys.color;
      ctx.fill();

      // Current system double ring + "YOU ARE HERE"
      if (isCurrent) {
        ctx.beginPath(); ctx.arc(sx,sy,r+6/cam.zoom,0,Math.PI*2);
        ctx.strokeStyle='#44ccff'; ctx.lineWidth=2/cam.zoom; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx,sy,r+12/cam.zoom,0,Math.PI*2);
        ctx.strokeStyle='#44ccff44'; ctx.lineWidth=1/cam.zoom; ctx.stroke();
      }

      // Selected ring
      if (isSelected) {
        ctx.beginPath(); ctx.arc(sx,sy,r+9/cam.zoom,0,Math.PI*2);
        ctx.strokeStyle='#ffffff88'; ctx.lineWidth=1/cam.zoom; ctx.stroke();
      }

      // Name label
      ctx.fillStyle = isCurrent ? '#44ccff' : isAdj ? '#aaccee' : '#445566';
      ctx.font = `${(isCurrent?13:isAdj?11:9)/cam.zoom}px Segoe UI, system-ui`;
      ctx.textAlign='center';
      ctx.fillText(sys.name, sx, sy + r + 16/cam.zoom);

      // "YOU ARE HERE" label below current system name
      if (isCurrent) {
        ctx.fillStyle='#44ccff88';
        ctx.font=`bold ${9/cam.zoom}px Segoe UI, system-ui`;
        ctx.fillText('YOU ARE HERE', sx, sy + r + 28/cam.zoom);
      }

      // "REACHABLE" label for adjacent systems
      if (isAdj && !isJumpTgt) {
        ctx.fillStyle='#44ccff55';
        ctx.font=`${8/cam.zoom}px Segoe UI, system-ui`;
        ctx.fillText('REACHABLE', sx, sy + r + 28/cam.zoom);
      }

      ctx.globalAlpha = 1.0;
    }

    // ── Other players ─────────────────────────────────────────────────────
    for (const op of gs.otherPlayers) {
      const opSys = systems[op.system];
      if (!opSys) continue;
      const ox=opSys.x-W/2+8, oy=opSys.y-H/2-8;
      ctx.beginPath(); ctx.arc(ox,oy,4/cam.zoom,0,Math.PI*2);
      ctx.fillStyle=op.color||'#ff88ff'; ctx.fill();
    }

    ctx.restore();

    // ── UI overlay ────────────────────────────────────────────────────────
    ctx.fillStyle='#44ccff'; ctx.font='11px Segoe UI';
    ctx.textAlign='left';
    ctx.fillText('GALAXY MAP — Click: select · Double-click adjacent: add to jump route', 12, 20);
    ctx.fillStyle='#334455'; ctx.fillText('Drag to pan · Scroll to zoom · Esc to return · Right-click: clear route', 12, 36);

    // ── Draw jump queue route with numbered waypoints ─────────────────────
    if (gs.jumpQueue.length > 0) {
      const queue = gs.jumpQueue;
      // Highlight each hop in sequence: current→hop1→hop2→...
      const hops = [gs.currentSystemId, ...queue];
      ctx.save();
      ctx.translate(W/2 + cam.x, H/2 + cam.y);
      ctx.scale(cam.zoom, cam.zoom);
      for (let i = 0; i < hops.length - 1; i++) {
        const a = systems[hops[i]], b = systems[hops[i+1]];
        if (!a || !b) continue;
        const ax=a.x-W/2, ay=a.y-H/2, bx2=b.x-W/2, by2=b.y-H/2;
        const pct = i / (hops.length - 1);
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx2,by2);
        ctx.strokeStyle=`rgba(68,204,255,${0.7-pct*0.2})`; ctx.lineWidth=2/cam.zoom;
        ctx.setLineDash([5/cam.zoom,3/cam.zoom]); ctx.stroke(); ctx.setLineDash([]);
      }
      // Numbered circles on each queued hop
      queue.forEach((id, idx) => {
        const s = systems[id]; if (!s) return;
        const sx=s.x-W/2, sy=s.y-H/2;
        const nr = 10/cam.zoom;
        ctx.beginPath(); ctx.arc(sx, sy-s.r-nr-4/cam.zoom, nr, 0, Math.PI*2);
        ctx.fillStyle='#44ccff'; ctx.fill();
        ctx.fillStyle='#000'; ctx.font=`bold ${10/cam.zoom}px Segoe UI`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(`${idx+1}`, sx, sy-s.r-nr-4/cam.zoom);
        ctx.textBaseline='alphabetic';
      });
      ctx.restore();

      // Route text at bottom of screen
      const routeNames = hops.map(id => systems[id]?.name || id).join(' → ');
      ctx.fillStyle='#44ccff'; ctx.font='12px Segoe UI'; ctx.textAlign='center';
      ctx.fillText(`PLANNED ROUTE: ${routeNames}`, W/2, H-50);
      ctx.fillStyle='#334455'; ctx.font='10px Segoe UI';
      ctx.fillText(`${queue.length} jump${queue.length>1?'s':''} planned · Right-click to clear`, W/2, H-32);
    }

    // Blurb box for selected system
    const sel = gs.selectedEntity;
    if (sel?.type === 'system') {
      const sd = sel.data;
      ctx.save();
      ctx.fillStyle='rgba(5,5,18,0.88)';
      ctx.strokeStyle='#1a1a40';
      const bx=14, by=H-130, bw=Math.min(W-28, 480), bh=110;
      roundRect(ctx, bx, by, bw, bh, 5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle='#44ccff'; ctx.font='bold 12px Segoe UI';
      ctx.textAlign='left'; ctx.fillText(sd.name, bx+12, by+22);
      ctx.fillStyle='#8899bb'; ctx.font='10px Segoe UI';
      const words = (sd.blurb||'').split(' ');
      let line='', row=1;
      for (const w of words) {
        const test = line ? line+' '+w : w;
        if (ctx.measureText(test).width > bw-24 && line) {
          ctx.fillText(line, bx+12, by+22+row*16); line=w; row++;
          if (row > 5) { ctx.fillText(line+'…', bx+12, by+22+row*16); break; }
        } else line=test;
      }
      if (row <= 5) ctx.fillText(line, bx+12, by+22+row*16);
      ctx.restore();
    }
  },

  handleClick(wx, wy, W, H, dbl) {
    const gs = GameState;
    const galaxy = gs.galaxy;
    const cam = gs.galaxyCam;

    // Convert screen → world
    const gx = (wx - W/2 - cam.x) / cam.zoom + W/2;
    const gy = (wy - H/2 - cam.y) / cam.zoom + H/2;

    let nearest = null, nearDist = 24 / cam.zoom;
    for (const sys of Object.values(galaxy.systems)) {
      const d = Math.hypot(sys.x - gx, sys.y - gy);
      if (d < nearDist) { nearest = sys; nearDist = d; }
    }

    if (nearest) {
      gs.selectedEntity = { type: 'system', data: nearest };
      if (dbl) {
        // Multi-hop queue: double-click builds a sequential route
        // The "tail" of the current route (last queued system, or current system if queue is empty)
        const tail = gs.jumpQueue.length ? gs.jumpQueue[gs.jumpQueue.length - 1] : gs.currentSystemId;
        const tailAdj = galaxy.systems[tail]?.adj || [];
        const isAdjToTail = tailAdj.includes(nearest.id);
        const alreadyInQueue = gs.jumpQueue.includes(nearest.id);

        if (nearest.id === gs.currentSystemId) {
          // Double-click current system = clear the whole queue
          gs.jumpQueue = [];
          bus.emit('jump:route:cleared');
        } else if (!alreadyInQueue && isAdjToTail) {
          // Append this hop to the route
          gs.jumpQueue.push(nearest.id);
          bus.emit('jump:targeted', { systemId: nearest.id, queue: [...gs.jumpQueue] });
          setTimeout(() => gs.closeGalaxy(), 600);
        } else if (!isAdjToTail) {
          // Not adjacent to tail — start a fresh route if adjacent to current system
          const isAdjToCurrent = (galaxy.systems[gs.currentSystemId]?.adj || []).includes(nearest.id);
          if (isAdjToCurrent) {
            gs.jumpQueue = [nearest.id];
            bus.emit('jump:targeted', { systemId: nearest.id, queue: [nearest.id] });
            setTimeout(() => gs.closeGalaxy(), 600);
          }
        }
      }
      return nearest;
    }
    return null;
  },

  handleDragStart(x, y) {
    this.dragStart = { x, y };
    this.panBase = { ...GameState.galaxyCam };
  },

  handleDrag(x, y) {
    if (!this.dragStart) return;
    GameState.galaxyCam.x = this.panBase.x + (x - this.dragStart.x);
    GameState.galaxyCam.y = this.panBase.y + (y - this.dragStart.y);
  },

  handleDragEnd() { this.dragStart = null; },

  handleZoom(delta, x, y, W, H) {
    const cam = GameState.galaxyCam;
    const oldZoom = cam.zoom;
    cam.zoom = Math.max(0.3, Math.min(4, cam.zoom * (delta > 0 ? 0.85 : 1.18)));
    // Zoom toward cursor
    const zr = cam.zoom / oldZoom;
    cam.x = x - W/2 - (x - W/2 - cam.x) * zr;
    cam.y = y - H/2 - (y - H/2 - cam.y) * zr;
  }
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}
