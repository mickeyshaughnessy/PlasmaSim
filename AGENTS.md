# AGENTS.md — Starbound Tactics

Guide for AI agents working in this repo.

## What this is

A multiplayer space game served from a single Node.js/Express process. The frontend is plain ES modules (no build step). The backend is a thin REST API for shared state persistence in DigitalOcean Spaces.

## Architecture

```
Browser
  └── js/main.js          entry point, game loop, input
       ├── js/state.js     GameState singleton + EventBus (zero circular deps)
       ├── js/space.js     space flight mode
       ├── js/planet.js    planet surface mode
       ├── js/galaxy.js    galaxy map mode
       ├── js/ui.js        right-side panel rendering
       └── js/audio.js     Web Audio API (lazy-init)

Node.js (server.js)
  ├── GET  /api/state/:key    load shared state from DO Spaces or local data/
  ├── PATCH /api/state/:key   merge player's own subtree only
  ├── GET  /api/players       presence list
  └── POST /api/players/:id/heartbeat
```

Key design choices:
- `EventBus` has zero imports — all other modules import from it via `state.js` to avoid circular deps.
- `GameState.jumpTarget` is a getter over `jumpQueue[0]`; use `jumpQueue` directly for multi-hop logic.
- Physics runs at normalized dt (1.0 = 60fps). During warp animation, physics is paused.
- `radarObjects[]` is populated during each `drawRadar()` call for click-to-target detection.

## Running

```bash
npm install
node server.js      # serves at http://localhost:3001
```

No build step. Edit JS files and reload the browser.

## Deploying

```bash
./deploy.sh
```

Rsyncs to `root@143.110.131.237:/var/www/PlasmaSim`, installs deps, restarts `plasmasim.service`.

Live URL: http://143.110.131.237/
Old plasma sim: http://143.110.131.237/plasma/

## Server layout (production)

- nginx on port 80: static files from `/var/www/PlasmaSim`, `/api/` proxied to port 3001, `/plasma/` aliased to `/var/www/PlasmaSim/plasma/`
- `plasmasim.service` — systemd unit, auto-restarts, DO Spaces env vars baked in
- DO Spaces: `mithril-media` bucket, `sfo3` region, prefix `starbound/` (falls back to `data/*.json` locally)

## Key constants (space.js)

| Constant | Value | Meaning |
|----------|-------|---------|
| `JUMP_SPEED` | 4.5 | Min speed to initiate jump |
| `LAND_DIST` | 32 | Max distance to land |
| `LAND_SPEED` | 0.8 | Max speed to land |
| `BOARD_DIST` | 55 | Max distance to board |
| `BOARD_SPEED` | 1.2 | Max relative speed to board |
| `WARP_FRAMES` | 100 | Jump animation duration (frames) |
| `RADAR_RANGE` | 650 | World units shown on radar |

## What to avoid

- Don't add a build system or bundler — the no-build-step is intentional.
- Don't write directly to `GameState.jumpTarget` to set a multi-hop route; push to `GameState.jumpQueue` instead.
- Don't import `state.js` from `audio.js` in a way that creates a cycle — use the EventBus.
- Don't persist ephemeral state (projectiles, particles, hit effects) to the server.
- The PATCH endpoint only merges `players[playerId]`; don't try to overwrite top-level galaxy/system data from the client.
