# Starbound Tactics

Multiplayer space tower defense game. Fly ships between star systems, land on planets, build towers, board enemies.

**Live:** http://143.110.131.237/
**Legacy plasma sim:** http://143.110.131.237/plasma/

## Modes

- **Space** — N-body physics flight. Thrust, orbit, fire weapons, board ships, land on planets.
- **Planet** — Graph-based surface. WASD to move your mech, build 10 tower types, defend against bots.
- **Galaxy map** — Pan/zoom star chart. Double-click adjacent systems to queue a multi-hop jump route.

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Rotate + thrust (space) / move mech (planet) |
| Space | Fire weapon |
| L | Land on nearby planet |
| J | Jump (requires speed ≥ 4.5) |
| B | Board nearby ship |
| G | Toggle galaxy map |
| T | Toggle tower build menu (planet) |
| Esc | Clear selection / close map |
| Click | Select ship/planet/station; click radar to autopilot |
| Double-click (galaxy) | Add system to jump route |
| Right-click | Clear autopilot / weapon lock / jump route |

## Stack

- **Frontend:** Vanilla JS ES modules, Canvas 2D, Web Audio API
- **Backend:** Node.js + Express, serving static files + REST API
- **Storage:** DigitalOcean Spaces (S3-compatible) with localStorage fallback
- **Hosting:** nginx reverse proxy → Node.js on port 3001, systemd service

## Files

```
index.html          Main game shell + panel UI
css/style.css       Dark plasma aesthetic
js/
  main.js           Game loop, input routing, mode switching
  state.js          GameState singleton, EventBus, StorageAdapter, A* pathfinding
  space.js          Space mode: physics, rendering, radar, warp animation
  planet.js         Planet mode: graph traversal, towers, mechs, bots
  galaxy.js         Galaxy map: pan/zoom, jump route planning
  ui.js             Right-side panel: status bars, inspector, tower menu
  audio.js          Web Audio API sounds (no audio files)
server.js           Express server: static files + /api/ state sync
deploy.sh           Rsync + systemd deploy script
plasma/index.html   Original plasma physics simulator (preserved)
```

## Running locally

```bash
npm install
node server.js      # http://localhost:3001
```

## Deploying

```bash
./deploy.sh
```

Requires SSH access to `root@143.110.131.237` via `~/.ssh/id_ed25519`.

## Multiplayer

State is polled every ~10 seconds via `/api/state/:key`. Each player only writes their own subtree to prevent clobbering. Other players appear as colored dots on the galaxy map and radar.
