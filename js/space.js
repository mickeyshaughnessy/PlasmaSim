// Space mode: N-body physics, ship thrust, weapons, boarding, jump animation
"use strict";
import { GameState, bus, WEAPONS } from './state.js';

const THRUST        = 0.018;
const FUEL_BURN     = 0.012;
const FUEL_REGEN    = 0.004;
const MAX_SPEED     = 6;
export const JUMP_SPEED  = 4.5;
export const LAND_DIST   = 32;
export const LAND_SPEED  = 0.8;
const BOARD_DIST    = 55;
const BOARD_SPEED   = 1.2;
const SOFT          = 80;
const TRAIL_MAX     = 28;
const STAR_COUNT    = 180;
const G             = 420;
const PROJECTILE_LIFE  = 58;   // frames
const WARP_FRAMES      = 100;  // frames for jump animation

// ── Star field ────────────────────────────────────────────────────────────
let bgCanvas = null;
function makeBgCanvas(W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#05050f'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < STAR_COUNT; i++) {
    const sx = Math.random()*W, sy = Math.random()*H;
    const sr = Math.random()<0.08 ? 1.5 : Math.random()<0.3 ? 1.0 : 0.5;
    x.beginPath(); x.arc(sx,sy,sr,0,Math.PI*2);
    x.fillStyle = `rgba(255,255,255,${0.3+Math.random()*0.7})`; x.fill();
  }
  return c;
}

// ── Glow helpers ──────────────────────────────────────────────────────────
function glowRgb(ctx, x, y, r, rgb, alpha) {
  const g = ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
}

// ── Planet screen position ────────────────────────────────────────────────
export function planetPos(p) {
  return { x: Math.cos(p.angle)*p.orbitR, y: Math.sin(p.angle)*p.orbitR };
}

// ── Trails ────────────────────────────────────────────────────────────────
const trails = {};
function addTrail(id, wx, wy) {
  if (!trails[id]) trails[id] = [];
  trails[id].push({ x:wx, y:wy });
  if (trails[id].length > TRAIL_MAX) trails[id].shift();
}

// ── Projectiles (ephemeral, not persisted) ────────────────────────────────
let projectiles = [];

// ── Space Mode ────────────────────────────────────────────────────────────
export const SpaceMode = {
  prevThrusting: false,
  weaponCooldown: 0,
  lastSaveFrame: 0,
  arrivalFlash: 0,   // brief flash when entering new system

  step(dt, keys) {
    const gs = GameState;
    const sys = gs.system;
    if (!sys) return;
    const ps = gs.playerShip;

    // ── Jump animation progress ───────────────────────────────────────────
    if (gs.jumpAnim?.active) {
      gs.jumpAnim.progress += dt / WARP_FRAMES;
      if (gs.jumpAnim.progress >= 1) {
        // Fire the actual jump at end of animation
        bus.emit('ship:jump:execute', { targetSystem: gs.jumpAnim.targetSystem });
      }
      // Don't run normal physics during warp sequence
      return;
    }

    let thrusting = false;

    // ── Controls: arrows = rotate(L/R) + thrust(U/D), WASD same ─────────
    if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) ps.angle -= 0.048 * dt;
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) ps.angle += 0.048 * dt;

    const canThrust = ps.fuel > 0;
    if (canThrust && (keys.has('ArrowUp') || keys.has('w') || keys.has('W'))) {
      ps.vx += Math.cos(ps.angle - Math.PI/2) * THRUST * dt;
      ps.vy += Math.sin(ps.angle - Math.PI/2) * THRUST * dt;
      ps.fuel = Math.max(0, ps.fuel - FUEL_BURN * dt);
      thrusting = true;
      gs.autopilot = null;
    }
    if (canThrust && (keys.has('ArrowDown') || keys.has('s') || keys.has('S'))) {
      ps.vx -= Math.cos(ps.angle - Math.PI/2) * THRUST * 0.6 * dt;
      ps.vy -= Math.sin(ps.angle - Math.PI/2) * THRUST * 0.6 * dt;
      ps.fuel = Math.max(0, ps.fuel - FUEL_BURN * 0.5 * dt);
    }

    if (!thrusting) ps.fuel = Math.min(100, ps.fuel + FUEL_REGEN * dt);

    // ── Autopilot ─────────────────────────────────────────────────────────
    if (gs.autopilot && !thrusting) {
      const ap = gs.autopilot;
      const dx = ap.tx - ps.x, dy = ap.ty - ps.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 15) {
        gs.autopilot = null;
      } else {
        const targetAngle = Math.atan2(dy, dx) + Math.PI/2;
        let da = targetAngle - ps.angle;
        while (da >  Math.PI) da -= Math.PI*2;
        while (da < -Math.PI) da += Math.PI*2;
        if (Math.abs(da) > 0.05) ps.angle += Math.sign(da) * Math.min(Math.abs(da), 0.055*dt);
        if (Math.abs(da) < 0.4 && ps.fuel > 0 && dist > 30) {
          ps.vx += Math.cos(ps.angle - Math.PI/2) * THRUST * dt;
          ps.vy += Math.sin(ps.angle - Math.PI/2) * THRUST * dt;
          ps.fuel = Math.max(0, ps.fuel - FUEL_BURN * dt);
          thrusting = true;
        }
      }
    }

    if (thrusting && !this.prevThrusting) bus.emit('ship:thrust:start');
    if (!thrusting && this.prevThrusting)  bus.emit('ship:thrust:stop');
    this.prevThrusting = thrusting;
    ps.thrusting = thrusting;

    // ── Speed cap ─────────────────────────────────────────────────────────
    const spd = Math.hypot(ps.vx, ps.vy);
    if (spd > MAX_SPEED) { ps.vx *= MAX_SPEED/spd; ps.vy *= MAX_SPEED/spd; }
    ps.speed = spd;

    // ── Gravity ───────────────────────────────────────────────────────────
    const star = sys.star;
    const applyGravity = (obj) => {
      const dx = star.x - obj.x, dy = star.y - obj.y;
      const r2 = dx*dx + dy*dy + SOFT*SOFT;
      const r  = Math.sqrt(r2);
      const f  = G * star.mass / (r2 * r);
      obj.vx += dx * f * dt * 0.001;
      obj.vy += dy * f * dt * 0.001;
    };
    applyGravity(ps);
    ps.x += ps.vx * dt;
    ps.y += ps.vy * dt;
    addTrail(gs.playerId, ps.x, ps.y);

    // ── Orbits ────────────────────────────────────────────────────────────
    for (const p of sys.planets) p.angle += p.speed * dt;

    // ── Asteroids ─────────────────────────────────────────────────────────
    for (const ast of sys.asteroids) {
      applyGravity(ast);
      ast.vx = Math.max(-3, Math.min(3, ast.vx));
      ast.vy = Math.max(-3, Math.min(3, ast.vy));
      ast.x += ast.vx * dt; ast.y += ast.vy * dt;
      addTrail(`ast_${ast.id}`, ast.x, ast.y);
    }

    // ── NPC ships ─────────────────────────────────────────────────────────
    for (const ship of sys.ships) {
      tickNPC(ship, ps, dt);
      applyGravity(ship);
      const ss = Math.hypot(ship.vx, ship.vy);
      if (ss > MAX_SPEED*0.8) { ship.vx *= (MAX_SPEED*0.8)/ss; ship.vy *= (MAX_SPEED*0.8)/ss; }
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      addTrail(ship.id, ship.x, ship.y);
    }
    for (const op of gs.otherPlayers) {
      if (op.system === gs.currentSystemId && op.pos) addTrail(`op_${op.id}`, op.pos.x, op.pos.y);
    }

    // ── Weapon firing ─────────────────────────────────────────────────────
    if (this.weaponCooldown > 0) this.weaponCooldown -= dt;
    if (this.weaponCooldown <= 0) {
      const weapon = WEAPONS[gs.selectedWeapon] || WEAPONS.laser;
      // Auto-fire at actively hostile ships (no key needed)
      let autoTarget = null;
      if (gs.weaponTarget) {
        autoTarget = sys.ships.find(s => s.id === gs.weaponTarget) || null;
        if (!autoTarget) gs.weaponTarget = null;
      }
      if (!autoTarget) {
        // Find nearest hostile ship in weapon range
        let nearDist = weapon.range;
        for (const ship of sys.ships) {
          const state = ship.npc?.state;
          if (state !== 'attack' && state !== 'chase') continue;
          const d = Math.hypot(ship.x - ps.x, ship.y - ps.y);
          if (d < nearDist) { autoTarget = ship; nearDist = d; }
        }
      }
      // Also fire on Space key at any resolved target (locked or mouse-nearest)
      const spaceTarget = keys.has(' ') ? resolveWeaponTarget(gs, ps) : null;
      const fireTarget = autoTarget || spaceTarget;
      if (fireTarget) {
        fireProjectile(ps, fireTarget, weapon);
        this.weaponCooldown = weapon.cooldown;
        bus.emit('weapon:fire');
      }
    }

    // ── Move & age projectiles ────────────────────────────────────────────
    for (const proj of projectiles) {
      proj.x += proj.vx * dt; proj.y += proj.vy * dt;
      proj.life -= dt;
    }
    // Hit detection
    for (let pi = projectiles.length - 1; pi >= 0; pi--) {
      const proj = projectiles[pi];
      if (proj.life <= 0) { projectiles.splice(pi, 1); continue; }
      let hit = false;
      for (const ship of sys.ships) {
        if (Math.hypot(ship.x - proj.x, ship.y - proj.y) < 14) {
          ship.hull = Math.max(0, ship.hull - (proj.damage || 18));
          spawnHitParticles(proj.x, proj.y);
          hit = true;
          if (ship.hull <= 0) {
            spawnExplosion(ship.x, ship.y);
            sys.ships.splice(sys.ships.indexOf(ship), 1);
            bus.emit('ship:destroyed', { id: ship.id });
          }
          break;
        }
      }
      if (hit) { projectiles.splice(pi, 1); }
    }

    // ── Landing ───────────────────────────────────────────────────────────
    for (const p of sys.planets) {
      if (!p.landable) continue;
      const pp = planetPos(p);
      const dist = Math.hypot(ps.x - pp.x, ps.y - pp.y);
      if (dist < LAND_DIST && spd < LAND_SPEED && keys.has('l')) {
        bus.emit('ship:land', { planetId: p.id });
      }
    }

    // ── Arrival flash decay ───────────────────────────────────────────────
    if (this.arrivalFlash > 0) this.arrivalFlash -= dt * 0.04;

    // ── Auto-save ─────────────────────────────────────────────────────────
    if (gs.frameCount - this.lastSaveFrame > 300) {
      gs.markDirty('system');
      this.lastSaveFrame = gs.frameCount;
    }
  },

  // Called when player enters a new system after jumping
  triggerArrivalFlash() {
    this.arrivalFlash = 1;
    projectiles = []; // clear projectiles between systems
  },

  draw(ctx, W, H) {
    const gs = GameState;
    const sys = gs.system;
    if (!sys) return;

    if (!bgCanvas || bgCanvas.width !== W || bgCanvas.height !== H) bgCanvas = makeBgCanvas(W, H);

    const ps = gs.playerShip;
    const cx = W/2 - ps.x, cy = H/2 - ps.y;

    // ── Normal scene ──────────────────────────────────────────────────────
    // Motion blur (reduced during warp so streaks pop)
    const blurAlpha = gs.jumpAnim?.active ? 0.10 : 0.28;
    ctx.fillStyle = `rgba(5,5,15,${blurAlpha})`;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(bgCanvas, cx*0.2%W - W, cy*0.2%H - H);
    ctx.drawImage(bgCanvas, cx*0.2%W,     cy*0.2%H - H);
    ctx.drawImage(bgCanvas, cx*0.2%W - W, cy*0.2%H    );
    ctx.drawImage(bgCanvas, cx*0.2%W,     cy*0.2%H    );
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);

    // Star
    const star = sys.star;
    const [sr, sg, sb] = star.glow || [255,238,136];
    glowRgb(ctx, star.x, star.y, star.r*6, [sr,sg,sb], 0.15);
    glowRgb(ctx, star.x, star.y, star.r*3, [sr,sg,sb], 0.35);
    ctx.beginPath(); ctx.arc(star.x,star.y,star.r,0,Math.PI*2);
    ctx.fillStyle = star.color; ctx.fill();
    glowRgb(ctx, star.x, star.y, star.r*1.5, [sr,sg,sb], 0.6);

    // Orbit rings
    for (const p of sys.planets) {
      ctx.beginPath(); ctx.arc(0,0,p.orbitR,0,Math.PI*2);
      ctx.strokeStyle='#1a1a33'; ctx.lineWidth=0.5; ctx.stroke();
    }

    // Planets
    for (const p of sys.planets) {
      const pp = planetPos(p);
      const [gr,gg,gbb] = p.glow;
      glowRgb(ctx,pp.x,pp.y,p.r*4,[gr,gg,gbb],0.18);
      ctx.beginPath(); ctx.arc(pp.x,pp.y,p.r,0,Math.PI*2);
      ctx.fillStyle=p.color; ctx.fill();
      glowRgb(ctx,pp.x,pp.y,p.r*1.6,[gr,gg,gbb],0.5);
      ctx.fillStyle='#8899bb'; ctx.font='10px Segoe UI,system-ui';
      ctx.textAlign='center'; ctx.fillText(p.name, pp.x, pp.y+p.r+14);
      if (p.landable) {
        const dist = Math.hypot(ps.x-pp.x, ps.y-pp.y);
        if (dist < LAND_DIST*2.5) {
          ctx.beginPath(); ctx.arc(pp.x,pp.y,p.r+6,0,Math.PI*2);
          ctx.strokeStyle = dist < LAND_DIST ? '#44ffaa88' : '#44ffaa33';
          ctx.lineWidth=1; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }

    // Stations
    for (const st of (sys.stations||[])) {
      ctx.save(); ctx.translate(st.x,st.y); ctx.rotate(gs.frameCount*0.003);
      ctx.strokeStyle=st.color; ctx.lineWidth=1.5;
      ctx.strokeRect(-st.r,-st.r,st.r*2,st.r*2);
      ctx.beginPath(); ctx.moveTo(0,-st.r*1.4); ctx.lineTo(0,st.r*1.4);
      ctx.moveTo(-st.r*1.4,0); ctx.lineTo(st.r*1.4,0); ctx.stroke(); ctx.restore();
      ctx.fillStyle='#8899cc'; ctx.font='10px system-ui'; ctx.textAlign='center';
      ctx.fillText(st.name, st.x, st.y+st.r+14);
    }

    // Asteroids
    for (const ast of sys.asteroids) {
      drawTrailById(ctx, `ast_${ast.id}`, '#55667744', 0.5);
      ctx.beginPath(); ctx.arc(ast.x,ast.y,ast.r,0,Math.PI*2);
      ctx.fillStyle='#556677'; ctx.fill();
    }

    // NPC ships
    for (const ship of sys.ships) {
      drawTrailById(ctx, ship.id, ship.color+'44', 1);
      const isTarget = gs.weaponTarget === ship.id;
      drawShip(ctx, ship.x, ship.y, ship.angle, ship.color, ship.hull/100, false, ship.name, isTarget);
    }

    // Other players
    for (const op of gs.otherPlayers) {
      if (op.system === gs.currentSystemId && op.pos) {
        drawTrailById(ctx, `op_${op.id}`, (op.color||'#ff88ff')+'44', 1);
        drawShip(ctx, op.pos.x, op.pos.y, op.pos.angle||0, op.color||'#ff88ff', 1, false, op.name, false);
      }
    }

    // Player ship
    drawTrailById(ctx, gs.playerId, ps.color+'55', 1.5);
    drawShip(ctx, ps.x, ps.y, ps.angle, ps.color, ps.hull/100, ps.thrusting, 'YOU', false);

    // Projectiles
    for (const proj of projectiles) {
      const color = proj.color || '#ffee44';
      const rgb = color === '#44ffff' ? [68,255,255] : color === '#ff8844' ? [255,136,68] : [255,238,68];
      const sz = proj.size || 2.5;
      glowRgb(ctx, proj.x, proj.y, sz*4, rgb, proj.life/PROJECTILE_LIFE * 0.8);
      ctx.beginPath(); ctx.arc(proj.x, proj.y, sz, 0, Math.PI*2);
      ctx.fillStyle = color; ctx.fill();
    }

    // Hit/explosion particles
    drawHitParticles(ctx);

    // Autopilot target
    if (gs.autopilot) {
      const ap = gs.autopilot;
      ctx.beginPath(); ctx.arc(ap.tx,ap.ty,8,0,Math.PI*2);
      ctx.strokeStyle='#44ccff55'; ctx.lineWidth=1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ps.x,ps.y); ctx.lineTo(ap.tx,ap.ty);
      ctx.strokeStyle='#44ccff22'; ctx.lineWidth=0.5; ctx.stroke();
    }

    // Jump speed arc
    const spd = ps.speed||0;
    if (spd > JUMP_SPEED*0.4 && gs.jumpTarget) {
      const pct = Math.min(1, spd/JUMP_SPEED);
      ctx.beginPath(); ctx.arc(ps.x,ps.y,40+pct*30,0,Math.PI*2*pct);
      ctx.strokeStyle=`rgba(100,220,255,${pct*0.6})`; ctx.lineWidth=1.5; ctx.stroke();
    }

    ctx.restore();

    // ── Jump queue HUD ────────────────────────────────────────────────────
    if (gs.jumpQueue.length > 0) {
      const queue = gs.jumpQueue;
      const parts = [gs.system?.name || gs.currentSystemId, ...queue.map(id => gs.galaxy?.systems[id]?.name || id)];
      const route = parts.join(' → ');
      const pct = Math.min(1, spd/JUMP_SPEED);
      ctx.fillStyle = '#44ccff'; ctx.font = '11px Segoe UI,system-ui'; ctx.textAlign='center';
      ctx.fillText(`ROUTE: ${route}  [J to jump]`, W/2, 20);
      // Speed bar
      ctx.fillStyle='#112233'; ctx.fillRect(W/2-70, 27, 140, 5);
      ctx.fillStyle = pct>=1 ? '#44ffaa' : '#4466cc';
      ctx.fillRect(W/2-70, 27, 140*pct, 5);
      ctx.fillStyle='#334466'; ctx.font='9px system-ui'; ctx.textAlign='center';
      ctx.fillText(`JUMP SPEED ${spd.toFixed(2)} / ${JUMP_SPEED}`, W/2, 42);
    }

    // ── Arrival flash ─────────────────────────────────────────────────────
    if (this.arrivalFlash > 0) {
      ctx.fillStyle = `rgba(100,200,255,${this.arrivalFlash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── JUMP WARP ANIMATION (drawn last, over everything) ─────────────────
    if (gs.jumpAnim?.active) {
      drawJumpWarp(ctx, W, H, gs.jumpAnim.progress, W/2, H/2);
    }
  }
};

// ── Weapon helpers ────────────────────────────────────────────────────────
function resolveWeaponTarget(gs, ps) {
  // 1. Use locked weapon target if it still exists
  if (gs.weaponTarget) {
    const ship = gs.system?.ships.find(s => s.id === gs.weaponTarget);
    if (ship) return ship;
    gs.weaponTarget = null;
  }
  // 2. Use selected entity if it's a ship
  if (gs.selectedEntity?.type === 'ship') return gs.selectedEntity.data;
  // 3. Nearest enemy to mouse cursor (world coords)
  const W = document.getElementById('canvas').width;
  const H = document.getElementById('canvas').height;
  const mx = gs.mouse.x - W/2 + ps.x;
  const my = gs.mouse.y - H/2 + ps.y;
  let nearest = null, nearDist = 200;
  for (const ship of (gs.system?.ships || [])) {
    const d = Math.hypot(ship.x - mx, ship.y - my);
    if (d < nearDist) { nearest = ship; nearDist = d; }
  }
  return nearest;
}

function fireProjectile(ps, target, weapon) {
  weapon = weapon || WEAPONS.laser;
  const dx = target.x - ps.x, dy = target.y - ps.y;
  const dist = Math.hypot(dx, dy) || 1;
  const vx = (dx/dist) * weapon.speed + ps.vx * 0.3;
  const vy = (dy/dist) * weapon.speed + ps.vy * 0.3;
  projectiles.push({ x: ps.x, y: ps.y, vx, vy, life: PROJECTILE_LIFE,
    damage: weapon.damage, color: weapon.color, size: weapon.size });
}

// ── Hit/explosion particles ───────────────────────────────────────────────
const hitParticles = [];
function spawnHitParticles(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI*2, s = 1 + Math.random()*3;
    hitParticles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 1, color: '#ffee44' });
  }
}
function spawnExplosion(x, y) {
  for (let i = 0; i < 20; i++) {
    const a = Math.random()*Math.PI*2, s = 0.5+Math.random()*4;
    const colors = ['#ff8800','#ffcc00','#ff4400','#ffffff'];
    hitParticles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 1.5, color: colors[Math.floor(Math.random()*4)] });
  }
}
function drawHitParticles(ctx) {
  for (let i = hitParticles.length-1; i >= 0; i--) {
    const p = hitParticles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.88; p.vy *= 0.88;
    p.life -= 0.04;
    if (p.life <= 0) { hitParticles.splice(i,1); continue; }
    ctx.beginPath(); ctx.arc(p.x,p.y,3*p.life,0,Math.PI*2);
    ctx.fillStyle = p.color + Math.round(Math.min(255,p.life*200)).toString(16).padStart(2,'0');
    ctx.fill();
  }
}

// ── Jump warp animation: directional star-stretch toward jump target ───────
function drawJumpWarp(ctx, W, H, rawProgress, cx, cy) {
  const gs = GameState;
  const t = Math.pow(rawProgress, 1.3);

  // Jump direction in galaxy-map coords
  const curSys = gs.galaxy?.systems[gs.currentSystemId];
  const tgtSys = gs.galaxy?.systems[gs.jumpAnim?.targetSystem];
  let jumpAngle = -Math.PI / 2; // default: "up"
  if (curSys && tgtSys) {
    jumpAngle = Math.atan2(tgtSys.y - curSys.y, tgtSys.x - curSys.x);
  }

  // Phases
  const phase1 = Math.min(1, t / 0.55);           // streaks build in
  const phase2 = Math.max(0, (t - 0.55) / 0.35);  // tunnel intensifies
  const flash  = Math.max(0, (t - 0.90) / 0.10);  // white out

  // Dark blue overlay builds up
  ctx.fillStyle = `rgba(0,2,18,${phase1 * 0.45 + phase2 * 0.30})`;
  ctx.fillRect(0,0,W,H);

  // ── Star streaks: vanishing point BEHIND ship, streaks toward jump dir ──
  // The vanishing point sits opposite jump direction — stars appear to rush past
  const vpDist = 120 + phase2 * 60; // how far behind the vanishing point is
  const vpX = cx - Math.cos(jumpAngle) * vpDist;
  const vpY = cy - Math.sin(jumpAngle) * vpDist;

  const numStreaks = 90 + Math.floor(phase2 * 30);
  const screenDiag = Math.hypot(W, H);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < numStreaks; i++) {
    // Random angle with a forward bias — most streaks go in jump direction
    const spread = 0.65 + phase2 * 0.45; // spread in radians, widens during warp
    const angle  = jumpAngle + (Math.random() * 2 - 1) * spread * Math.PI;

    // How far along this streak has "appeared" (staggered start)
    const seed   = (i * 7919) % 1000 / 1000; // deterministic per streak
    const fLocal = Math.max(0, phase1 - seed * 0.2);
    if (fLocal <= 0) continue;

    // Streak goes from near vanishing point outward in its angle
    const startDist = 8 + seed * 30;
    const maxStreak = 50 + fLocal * (screenDiag * 1.1);
    const endDist   = startDist + maxStreak;

    const x1 = vpX + Math.cos(angle) * startDist;
    const y1 = vpY + Math.sin(angle) * startDist;
    const x2 = vpX + Math.cos(angle) * endDist;
    const y2 = vpY + Math.sin(angle) * endDist;

    // Streaks in the forward direction are brightest
    const forwardness = (Math.cos(angle - jumpAngle) + 1) / 2; // 0..1
    const cr = Math.round(55  + phase2 * 180 + flash * 30);
    const cg = Math.round(170 + phase2 * 75  + flash * 10);
    const alpha = fLocal * (0.20 + forwardness * 0.55 + phase2 * 0.20) * (0.5 + seed * 0.5);

    const grad = ctx.createLinearGradient(x1,y1,x2,y2);
    grad.addColorStop(0, `rgba(${cr},${cg},255,0)`);
    grad.addColorStop(0.3, `rgba(${cr},${cg},255,${alpha})`);
    grad.addColorStop(1,   `rgba(${cr},${cg},255,0)`);

    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.5 + phase2 * 1.4 + forwardness * phase2 * 0.8;
    ctx.stroke();
  }

  // Central tunnel cone: bright glow in jump direction
  if (phase2 > 0) {
    const coneLen = 80 + phase2 * screenDiag;
    const coneGrad = ctx.createRadialGradient(cx,cy,0,cx,cy,coneLen);
    coneGrad.addColorStop(0,   `rgba(80,200,255,${phase2*0.35})`);
    coneGrad.addColorStop(0.4, `rgba(40,130,255,${phase2*0.15})`);
    coneGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(jumpAngle);
    ctx.scale(1.0, 0.35); // squash to an ellipse in jump direction
    ctx.beginPath(); ctx.arc(0,0,coneLen,0,Math.PI*2);
    ctx.fillStyle=coneGrad; ctx.fill(); ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // Flash
  if (flash > 0) {
    ctx.fillStyle = `rgba(210,235,255,${flash * 0.97})`;
    ctx.fillRect(0,0,W,H);
  }

  // Destination text (fade in early, stay until flash)
  if (rawProgress < 0.88) {
    const dest     = gs.jumpAnim?.targetSystem;
    const destName = gs.galaxy?.systems[dest]?.name || dest || '';
    const ti = Math.min(1, phase1 * 2.5);
    ctx.save();
    ctx.shadowColor = '#44ccff'; ctx.shadowBlur = 8 + phase2 * 16;
    ctx.fillStyle = `rgba(100,220,255,${ti * (1 - flash)})`;
    ctx.font = `bold ${Math.round(15 + phase2*5)}px Segoe UI, system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(`JUMPING TO ${destName.toUpperCase()}`, W/2, H * 0.30);
    if (gs.jumpQueue.length > 1) {
      const hops = gs.jumpQueue.slice(1).map(id => gs.galaxy?.systems[id]?.name || id).join(' → ');
      ctx.fillStyle = `rgba(68,160,210,${ti * 0.7 * (1 - flash)})`;
      ctx.font = '11px Segoe UI, system-ui'; ctx.shadowBlur = 4;
      ctx.fillText(`Then: ${hops}`, W/2, H * 0.30 + 22);
    }
    ctx.restore();
  }
}

// ── Ship drawing ──────────────────────────────────────────────────────────
function drawShip(ctx, x, y, angle, color, hullPct, thrusting, label, isTarget) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  const r = 10;
  const rgb = hexToRgb(color);

  // Targeting reticle (drawn before glow so it's underneath)
  if (isTarget) {
    ctx.restore(); ctx.save(); ctx.translate(x,y);
    const pulse = 0.5 + 0.5 * Math.sin(GameState.frameCount * 0.15);
    ctx.beginPath(); ctx.arc(0,0,r*3.5+pulse*4,0,Math.PI*2);
    ctx.strokeStyle = `rgba(255,80,80,${0.5+pulse*0.5})`; ctx.lineWidth = 1.2; ctx.stroke();
    // Corner brackets
    const br = r*3.5 + pulse*2;
    const bw = 8;
    for (const [sx,sy] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      ctx.beginPath();
      ctx.moveTo(sx*br, sy*(br-bw)); ctx.lineTo(sx*br, sy*br); ctx.lineTo(sx*(br-bw), sy*br);
      ctx.strokeStyle=`rgba(255,80,80,0.9)`; ctx.lineWidth=1.5; ctx.stroke();
    }
    ctx.restore(); ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  }

  // Glow halo
  const g = ctx.createRadialGradient(0,0,0,0,0,r*4);
  g.addColorStop(0, `rgba(${rgb},0.3)`); g.addColorStop(1,`rgba(${rgb},0)`);
  ctx.beginPath(); ctx.arc(0,0,r*4,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();

  // Thruster flame
  if (thrusting) {
    const flame = ctx.createLinearGradient(0,r,0,r+20);
    flame.addColorStop(0,`rgba(${rgb},0.9)`);
    flame.addColorStop(0.4,'rgba(255,140,20,0.7)');
    flame.addColorStop(1,'rgba(255,60,0,0)');
    ctx.beginPath();
    ctx.moveTo(-4,r); ctx.lineTo(0,r+12+Math.random()*10); ctx.lineTo(4,r);
    ctx.fillStyle=flame; ctx.fill();
  }

  // Hull body
  ctx.beginPath();
  ctx.moveTo(0,-r*1.5); ctx.lineTo(-r,r); ctx.lineTo(0,r*0.6); ctx.lineTo(r,r);
  ctx.closePath();
  ctx.fillStyle=color; ctx.fill();
  if (hullPct < 1) { ctx.fillStyle=`rgba(255,0,0,${(1-hullPct)*0.4})`; ctx.fill(); }

  ctx.restore();
  if (label) {
    ctx.fillStyle='#6677aa'; ctx.font='9px system-ui'; ctx.textAlign='center';
    ctx.fillText(label, x, y+r+14);
  }
}

function drawTrailById(ctx, id, color, lineWidth) {
  const t = trails[id];
  if (!t || t.length < 2) return;
  ctx.beginPath(); ctx.moveTo(t[0].x,t[0].y);
  for (let i=1; i<t.length; i++) ctx.lineTo(t[i].x,t[i].y);
  ctx.strokeStyle=color; ctx.lineWidth=lineWidth; ctx.stroke();
}

// ── Radar: player-centered, clipped circle ────────────────────────────────
export const RADAR_RANGE = 650; // world units visible around player

// radarObjects: cache of last drawn objects for click detection
export const radarObjects = [];

export function drawRadar(radarCtx, W, H) {
  const gs = GameState;
  const sys = gs.system;
  if (!sys) return;
  const ps = gs.playerShip;
  radarObjects.length = 0;

  radarCtx.clearRect(0,0,W,H);
  radarCtx.fillStyle='#040410'; radarCtx.fillRect(0,0,W,H);

  const scale = Math.min(W,H) / (RADAR_RANGE * 2);
  const R = Math.min(W,H)/2 - 1;

  // Clip everything to the circle
  radarCtx.save();
  radarCtx.beginPath(); radarCtx.arc(W/2,H/2,R,0,Math.PI*2); radarCtx.clip();

  // Subtle concentric range rings
  for (const frac of [0.33, 0.66, 1.0]) {
    radarCtx.beginPath(); radarCtx.arc(W/2,H/2,R*frac,0,Math.PI*2);
    radarCtx.strokeStyle='#0e0e22'; radarCtx.lineWidth=1; radarCtx.stroke();
  }

  // Convert world→radar (player is always at center)
  const toR = (wx, wy) => ({
    rx: W/2 + (wx - ps.x) * scale,
    ry: H/2 + (wy - ps.y) * scale
  });

  // Star
  const sp = toR(sys.star.x, sys.star.y);
  radarCtx.beginPath(); radarCtx.arc(sp.rx,sp.ry,4,0,Math.PI*2);
  const sg2 = radarCtx.createRadialGradient(sp.rx,sp.ry,0,sp.rx,sp.ry,9);
  sg2.addColorStop(0, sys.star.color); sg2.addColorStop(1,'rgba(0,0,0,0)');
  radarCtx.fillStyle=sg2; radarCtx.fill();
  radarCtx.fillStyle=sys.star.color;
  radarCtx.beginPath(); radarCtx.arc(sp.rx,sp.ry,3,0,Math.PI*2); radarCtx.fill();
  radarObjects.push({ type:'star', data:sys.star, rx:sp.rx, ry:sp.ry, wx:sys.star.x, wy:sys.star.y });

  // Planets
  for (const p of sys.planets) {
    const pw = { x:Math.cos(p.angle)*p.orbitR, y:Math.sin(p.angle)*p.orbitR };
    const rp = toR(pw.x, pw.y);
    radarCtx.beginPath(); radarCtx.arc(rp.rx,rp.ry,3,0,Math.PI*2);
    radarCtx.fillStyle=p.color; radarCtx.fill();
    radarCtx.fillStyle='#4a5a77'; radarCtx.font='7px system-ui'; radarCtx.textAlign='center';
    radarCtx.fillText(p.name, rp.rx, rp.ry+10);
    radarObjects.push({ type:'planet', data:p, rx:rp.rx, ry:rp.ry, wx:pw.x, wy:pw.y });
  }

  // Stations
  for (const st of (sys.stations||[])) {
    const rp = toR(st.x, st.y);
    radarCtx.strokeStyle=st.color; radarCtx.lineWidth=1;
    radarCtx.strokeRect(rp.rx-3,rp.ry-3,6,6);
    radarObjects.push({ type:'station', data:st, rx:rp.rx, ry:rp.ry, wx:st.x, wy:st.y });
  }

  // Asteroids (small dots, no labels)
  for (const ast of sys.asteroids) {
    const rp = toR(ast.x, ast.y);
    radarCtx.beginPath(); radarCtx.arc(rp.rx,rp.ry,1.5,0,Math.PI*2);
    radarCtx.fillStyle='#445566'; radarCtx.fill();
    radarObjects.push({ type:'asteroid', data:ast, rx:rp.rx, ry:rp.ry, wx:ast.x, wy:ast.y });
  }

  // NPC ships
  for (const ship of sys.ships) {
    const rp = toR(ship.x, ship.y);
    const isTarget = gs.weaponTarget === ship.id;
    if (isTarget) {
      radarCtx.beginPath(); radarCtx.arc(rp.rx,rp.ry,5,0,Math.PI*2);
      radarCtx.strokeStyle='#ff4444'; radarCtx.lineWidth=1; radarCtx.stroke();
    }
    radarCtx.beginPath(); radarCtx.arc(rp.rx,rp.ry,2.5,0,Math.PI*2);
    radarCtx.fillStyle=ship.color; radarCtx.fill();
    radarObjects.push({ type:'ship', data:ship, rx:rp.rx, ry:rp.ry, wx:ship.x, wy:ship.y });
  }

  // Autopilot target marker
  if (gs.autopilot) {
    const rp = toR(gs.autopilot.tx, gs.autopilot.ty);
    radarCtx.beginPath();
    radarCtx.moveTo(rp.rx-4,rp.ry); radarCtx.lineTo(rp.rx+4,rp.ry);
    radarCtx.moveTo(rp.rx,rp.ry-4); radarCtx.lineTo(rp.rx,rp.ry+4);
    radarCtx.strokeStyle='#44ccff88'; radarCtx.lineWidth=1; radarCtx.stroke();
  }

  // Player at exact center — ship silhouette pointing in heading direction
  const headX = W/2 + Math.cos(ps.angle - Math.PI/2) * 7;
  const headY = H/2 + Math.sin(ps.angle - Math.PI/2) * 7;
  radarCtx.beginPath();
  radarCtx.moveTo(headX, headY);
  radarCtx.lineTo(W/2 + Math.cos(ps.angle + Math.PI/2 + 2.3)*5, H/2 + Math.sin(ps.angle + Math.PI/2 + 2.3)*5);
  radarCtx.lineTo(W/2 + Math.cos(ps.angle + Math.PI/2 - 2.3)*5, H/2 + Math.sin(ps.angle + Math.PI/2 - 2.3)*5);
  radarCtx.closePath();
  radarCtx.fillStyle='#44ccff'; radarCtx.fill();
  // YOU label
  radarCtx.fillStyle='#44ccffaa'; radarCtx.font='6px system-ui'; radarCtx.textAlign='center';
  radarCtx.fillText('YOU', W/2, H/2+13);

  radarCtx.restore();

  // Border ring
  radarCtx.beginPath(); radarCtx.arc(W/2,H/2,R,0,Math.PI*2);
  radarCtx.strokeStyle='#1e1e40'; radarCtx.lineWidth=1.5; radarCtx.stroke();
}

// Given a click on the radar canvas, return nearest world object
export function radarClickToTarget(rx, ry, W, H) {
  let nearest = null, nearDist = 14; // pixel threshold
  for (const obj of radarObjects) {
    const d = Math.hypot(obj.rx - rx, obj.ry - ry);
    if (d < nearDist) { nearest = obj; nearDist = d; }
  }
  return nearest;
}

// ── NPC AI ────────────────────────────────────────────────────────────────
function tickNPC(ship, player, dt) {
  const npc = ship.npc; if (!npc) return;
  const dx=player.x-ship.x, dy=player.y-ship.y;
  const distToPlayer=Math.hypot(dx,dy);
  npc.timer=(npc.timer||0)+dt;
  if (npc.state==='patrol') {
    const t=npc.timer*0.008;
    steerToward(ship, npc.homeX+Math.cos(t)*120, npc.homeY+Math.sin(t)*120, THRUST*0.4, dt);
    if (distToPlayer<npc.aggroR) npc.state='chase';
  } else if (npc.state==='chase') {
    steerToward(ship, player.x, player.y, THRUST*0.6, dt);
    if (distToPlayer<npc.attackR) npc.state='attack';
    if (distToPlayer>npc.aggroR*1.5) npc.state='patrol';
  } else if (npc.state==='attack') {
    steerToward(ship, player.x, player.y, THRUST*0.3, dt);
    if (npc.timer%80<2) bus.emit('weapon:fire',{shooter:ship.id});
    if (ship.hull<25) npc.state='retreat';
    if (distToPlayer>npc.attackR*2) npc.state='chase';
  } else if (npc.state==='retreat') {
    steerToward(ship, npc.homeX, npc.homeY, THRUST*0.8, dt);
    ship.hull=Math.min(100,ship.hull+0.05*dt);
    if (Math.hypot(ship.x-npc.homeX,ship.y-npc.homeY)<60) npc.state='patrol';
  }
}
function steerToward(ship, tx, ty, thrust, dt) {
  const dx=tx-ship.x, dy=ty-ship.y, dist=Math.hypot(dx,dy);
  if (dist<5) return;
  const desired=Math.atan2(dy,dx)+Math.PI/2;
  let da=desired-ship.angle;
  while(da>Math.PI) da-=Math.PI*2; while(da<-Math.PI) da+=Math.PI*2;
  ship.angle+=Math.sign(da)*Math.min(Math.abs(da),0.06*dt);
  if(Math.abs(da)<0.5&&dist>20){
    ship.vx+=Math.cos(ship.angle-Math.PI/2)*thrust*dt;
    ship.vy+=Math.sin(ship.angle-Math.PI/2)*thrust*dt;
  }
}

function hexToRgb(hex) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

export { BOARD_DIST, BOARD_SPEED };
