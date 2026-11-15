# Koch Rooms: Levels and Co-op Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the finished solo game (`index.html`, `logic.js`) with two new levels (courtyard with windows, poolrooms), an item-gated exit on every level, rising difficulty, and 2-player peer-to-peer co-op where the friend plays Koch.

**Architecture:** Keep the existing split. `logic.js` (classic script, pure, `node --test`) gains level generators, multi-player/noise enemy AI, level-aware story and item progress. New `net.js` (classic script, pure protocol plus a thin PeerJS adapter) holds room codes, message validation and interpolation. `index.html` (one inline three.js module, because `file://` blocks local module imports) generalises the backrooms scene to a level builder, adds the lobby UI, remote avatars and sync. Co-op is host-authoritative: the host runs story, enemies, items and level changes; the guest builds the same deterministic world from `seed` and level, moves itself, and mirrors host snapshots.

**Tech Stack:** three.js 0.160.0 (CDN), PeerJS 1.5.4 from `https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js` (default PeerJS cloud broker for the connection handshake only; game data goes browser to browser), `node:test`, headless Chrome via DevTools for end-to-end runs.

**Spec:** Design approved in chat on 2026-11-11, summarised in Global Constraints and below. Builds on `docs/superpowers/plans/2026-11-11-koch-rooms.md` (done).
- Co-op: friend joins by room code, plays Koch, goes through the whole game together with the host (intro scenes included). Enemies chase both. A caught player returns to level start and all enemies reset (same as solo). No voice; keys 1-4 send quick chat lines. Solo still works. Friend opens the game from their own copy of the folder or a link.
- Levels: 0 yellow backrooms (exists), 1 courtyard with windows (reference image 3: huge open courtyard, window-covered facades, grass rectangles, central round plaza; enemies see far; hide behind hedges and benches), 2 poolrooms (reference image 4: white tiles, columns, pools; water slows and splashes alert enemies), then the asylum ending.
- Each level's exit is locked until 3 items are found (fuses, key cards, valves). Counter is shared in co-op. Each level is harder (faster enemies, more of them). Each level has its own event: blackout (0), shadows in windows (1), splashing (2).

## Global Constraints

- UI and dialogue text in Russian.
- Opens by double-click (`file://`); no build step, no server. Classic scripts only for local files: `logic.js`, `net.js`.
- three.js `0.160.0` import map stays; PeerJS pinned at `1.5.4`.
- Solo play must work with no internet beyond the three.js CDN; if PeerJS fails to load, multiplayer buttons show an error and solo is unaffected.
- All peer messages are untrusted: validated by `KochNet.validateMsg` before use.
- No git repository: no commit steps; each task ends with its test/verification step.
- World generation stays deterministic per `(level, seed)` so both players build identical worlds.
- Item count per level: 3. Max 2 players.

## Review Focus

- Guest drops mid-game: host continues solo and Koch avatar disappears; host drops: guest sees "Хост отключился" and returns to title. Test: disconnect handling in the co-op e2e.
- Hostile or broken peer messages (NaN, Infinity, huge arrays, unknown types, positions inside walls or outside the map) must be ignored or clamped, never crash or teleport a player into a wall. Test: `validateMsg` cases and host-side position check.
- Guest joins mid-game (for example level 2 with 1 item collected): receives scene, level, seed and collected items. Test: co-op e2e join after host reached level 2.
- Both players press E on the same item in the same frame, or catch and exit happen in the same frame: item counts once; exit wins over catch (existing rule). Test: `createProgress.collect` twice, `story.resolve` with both flags.
- Room code not found, broker down, or code already taken: clear error text, retry possible, solo unaffected.

---

## File Structure

- `logic.js`: modify. Maze/room carving helpers, `generateWorld` (adds `items`, `kind`), `generateCourtyard`, `generatePool`, `generateLevel`, `LEVELS`, `placeItems`, multi-player `stepEnemy`, `isCaughtAny`, level-aware `createStory`, `createProgress`.
- `net.js`: create. Pure protocol and adapter.
- `tests/logic.test.js`: modify. `tests/net.test.js`: create.
- `index.html`: modify. Level builder, items/HUD, courtyard and pool visuals, events, lobby, remote avatars, sync.
- Scratchpad (not in the project): `e2e.mjs` solo run updated for 3 levels; `e2e-coop.mjs` two-page co-op run.

### Task 1: Level registry, items, and `generateLevel`

**Files:**
- Modify: `logic.js`, `tests/logic.test.js`

**Interfaces:**
- Produces: `LEVELS: Array<{id: 'yellow'|'courtyard'|'pool', name: string, itemName: string, itemsNeeded: 3, speedMul: number, sight: number, hear: number}>` with `speedMul` 1 / 1.15 / 1.3, `sight` 8 / 12 / 9, `hear` 0 / 0 / 7; `placeItems(world, rng, count, minGap = 8) -> {x,y}[]` (reachable floor cells, pairwise BFS distance at least `minGap`, not spawn/exit/enemy spawn/hide spot); `generateLevel(level: number, seed: number) -> World`; `generateWorld` result gains `items: {x,y}[]` (3) and `kind: 'yellow'`. Internal helper `carveMaze(size, rng) -> number[][]` extracted from `generateWorld` (output layout may change, determinism per seed must hold).
- A `World` always has: `kind, size, cells, spawn, exit, hideSpots, enemySpawns, items, zones`; other fields per kind.

- [ ] **Step 1: Write failing tests:** `LEVELS has 3 entries with expected speedMul/sight/hear`, `generateWorld items: 3, reachable, pairwise BFS distance >= 8, none on spawn/exit/enemy spawn/hide spot`, `generateLevel(0, s) deep-equals generateWorld(s)`, `generateLevel throws on unknown level`.
- [ ] **Step 2:** Run `node --test tests/logic.test.js` — expect FAIL.
- [ ] **Step 3: Implement** `LEVELS`, `carveMaze`, `placeItems`, `generateLevel`; keep all 28 existing tests green.
- [ ] **Step 4:** Run `node --test tests/logic.test.js` — expect all PASS.

### Task 2: Courtyard generator

**Files:**
- Modify: `logic.js`, `tests/logic.test.js`

**Interfaces:**
- Consumes: `placeItems`, `bfs`, `makeRng`.
- Produces: `generateCourtyard(seed: number, size = 41) -> World` with `kind: 'courtyard'`, outer border wall, interior mostly floor, `blocks: {x0,y0,w,h}[]` (tall building blocks as wall cells), `zones[y][x]` in `'plaza' | 'grass' | 'yard'` (grass rectangles and a round plaza near the center, rest `'yard'`), `hideSpots` (hedge/bench cells, at least 8), `enemySpawns` (at least 7, one of each type present, all at least 8 manhattan from spawn), `items` (3, gap at least 10), `exit` on a floor cell adjacent to the outer border wall, at least `size` BFS steps from spawn. `generateLevel(1, seed)` returns this.

- [ ] **Step 1: Write failing tests:** `courtyard deterministic per seed`, `courtyard border is wall`, `courtyard interior is at least 70% floor`, `every floor cell reachable from spawn`, `exit adjacent to border and >= size BFS steps from spawn`, `items 3 reachable with gap >= 10`, `enemy spawns >= 7, all three types, >= 8 from spawn`, `hideSpots >= 8 on floor`, `all zones are plaza/grass/yard on floor cells and null on walls`.
- [ ] **Step 2:** Run tests — expect FAIL.
- [ ] **Step 3: Implement** by placing non-overlapping blocks with a 3-cell gap, dropping any block whose placement disconnects the floor (BFS check), then zones, exit, items, hide spots, enemies.
- [ ] **Step 4:** Run tests — expect PASS.

### Task 3: Poolrooms generator

**Files:**
- Modify: `logic.js`, `tests/logic.test.js`

**Interfaces:**
- Produces: `generatePool(seed: number, size = 35) -> World` with `kind: 'pool'`, maze corridors plus at least 3 pool halls (7x7), `water: number[][]` (1 where water, only on floor cells, never on spawn or exit), `pillars: {x,y}[]` (wall cells inside halls, at least 4, never disconnecting the floor), `hideSpots` (at least 6), `enemySpawns` (at least 6, all three types, at least 8 from spawn), `items` (3, not in water, gap at least 8), `exit` far from spawn (at least size/2 BFS steps, not in water). `generateLevel(2, seed)` returns this.

- [ ] **Step 1: Write failing tests:** `pool deterministic`, `pool spawn to exit reachable with pillars as walls`, `water only on floor and not on spawn/exit/items`, `water covers at least 10% of floor cells`, `at least 3 halls and 4 pillars, floor stays connected`, `items 3 reachable gap >= 8`, `enemy spawns and hide spots on floor`.
- [ ] **Step 2:** Run tests — expect FAIL.
- [ ] **Step 3: Implement** reusing `carveMaze`; carve halls, fill hall centers (3x3) with water plus a few corridor water strips, add pillars on hall cells where connectivity survives (BFS check).
- [ ] **Step 4:** Run tests — expect PASS.

### Task 4: Multi-player enemy AI, level-aware story, item progress

**Files:**
- Modify: `logic.js`, `tests/logic.test.js`

**Interfaces:**
- Produces:
  - `stepEnemy(cells, enemy, players: Player | Player[], dt, rng, opts?: {sight?: number, speedMul?: number, noises?: {x,y,r}[]}) -> void`. Chases the nearest visible player (hidden players only noticed within 1.5). A noise within `r` of the enemy, when not chasing, sets state `'search'` toward the noise point. Single-player calls keep working unchanged.
  - `isCaughtAny(enemy, players: Player[], dist?: number) -> number` (index of first caught player, -1 if none).
  - `createStory(levels = 1)`; `story.level` (starts 0). With `levels > 1`, `onExit()` in backrooms increments `level` and stays `'backrooms'` until the last level, whose exit goes to `'asylum'`. `story.resolve({caught, atExit})` keeps the rule that exit wins over catch. Default `levels = 1` behaves exactly as before.
  - `createProgress(need: number) -> {need, got: Set<number>, collect(id): boolean (false if already collected), count(): number, ready(): boolean, toArray(): number[], fromArray(arr): void}`.

- [ ] **Step 1: Write failing tests:** `stepEnemy picks nearest of two visible players`, `stepEnemy ignores hidden far player but chases visible second`, `noise within r sends patrolling enemy to search at the noise point`, `noise outside r ignored`, `noise does not interrupt chase`, `speedMul 2 moves twice as far as speedMul 1`, `opts.sight shortens view`, `isCaughtAny returns index or -1`, `story levels=3: exit goes level 1, 2, then asylum; deaths persist`, `story default levels=1 exit goes straight to asylum`, `resolve caught+atExit on level 0 of 3 advances the level, not a death`, `progress collect twice counts once`, `progress ready at need`, `progress toArray/fromArray roundtrip`.
- [ ] **Step 2:** Run tests — expect FAIL.
- [ ] **Step 3: Implement** the changes in `logic.js`; confirm the original single-player tests still pass unchanged.
- [ ] **Step 4:** Run `node --test tests/logic.test.js` — expect all PASS.

### Task 5: `net.js` protocol

**Files:**
- Create: `net.js`, `tests/net.test.js`

**Interfaces:**
- Produces (CommonJS export when `module` exists, else `window.KochNet`):
  - `makeRoomCode(rng: () => number) -> string` (5 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`); `normalizeCode(s: string) -> string | null` (trim, uppercase, valid alphabet and length 5, else null); `peerId(code: string) -> string` (`'kochrooms-' + code.toLowerCase()`).
  - `validateMsg(raw: unknown) -> object | null`. Allowed `type`s and fields: `hello{proto:1}`, `pos{x,y,yaw,pitch,hid}`, `act{kind:'item'|'exit'|'hide'|'pc'|'wc'|'toilet', id?}`, `chat{i:0-3}`, `scene{state,level,seed,sid,color?}`, `snap{t,hp:[x,y,yaw,pitch,hid],en:[[x,y,st]],it:[ids],ex}`, `say{text,sec}`, `caught{who:'host'|'guest'}`, `bye{}`. Rejects non-objects, unknown types, non-finite numbers, arrays over 64 entries, text over 120 chars, and clamps `sec` to 0.5-10.
  - `Interp(delayMs = 100)`: `push(tMs, {x,y,yaw})`, `sample(nowMs) -> {x,y,yaw} | null` (linear between samples at `nowMs - delayMs`, shortest-way yaw, holds last sample, null if empty, keeps at most 20 samples).
  - Adapter `createLink({role: 'host'|'guest', code, onOpen, onMsg, onClose, onError}) -> {send(msg), close()}` using global `Peer`. Not unit tested.

- [ ] **Step 1: Write failing tests** in `tests/net.test.js`: `makeRoomCode is 5 chars from alphabet and deterministic per rng`, `normalizeCode accepts lowercase and spaces, rejects 'ABCD' and 'ABCD0'`, `validateMsg accepts a valid pos`, `validateMsg rejects NaN x`, `validateMsg rejects Infinity yaw`, `validateMsg rejects unknown type`, `validateMsg rejects en array of 65`, `validateMsg trims nothing but rejects 121-char say`, `validateMsg clamps say.sec`, `validateMsg rejects null and strings`, `Interp midpoint`, `Interp yaw wraps through pi`, `Interp holds last sample and caps at 20`.
- [ ] **Step 2:** Run `node --test tests/net.test.js` — expect FAIL.
- [ ] **Step 3: Implement** `net.js`.
- [ ] **Step 4:** Run `node --test tests/logic.test.js tests/net.test.js` — expect all PASS.

### Task 6: Level builder, items and courtyard in the game

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `L.LEVELS`, `L.generateLevel`, `L.placeItems`, `L.createProgress`, `L.createStory(3)`, multi-player `L.stepEnemy`.
- Produces (inside `index.html`): `buildLevelScene()` replacing `buildBackrooms()` and reading `story.level`; `LEVEL_STYLE[level]` (textures, wall height, fog, ambient, lamp rules); `makeItemMesh(level) -> THREE.Object3D` (fuse, key card, valve); HUD element `#items` showing `"{itemName} n/3"`; exit interactable labels `Выход закрыт: найди ещё N` / `E — открыть выход`; level transition screen (`УРОВЕНЬ N: название`, then spawn); courtyard visuals from the reference: tall window-covered facade walls, dark ceiling, grass rectangle planes and round plaza disk, hedges and benches as hide spots, dusk fog; enemies use `LEVELS[level]` `speedMul`/`sight`; level 1 window-shadow event (dark silhouette sprite appears in a lit window then vanishes).

- [ ] **Step 1:** Generalise the backrooms builder to levels; level 0 must look and play as before plus items and gating.
- [ ] **Step 2: Verify manually:** serve screenshots with `scratchpad/shot.sh` for `?scene=backrooms` and a new debug param `&level=1`; expect level 0 unchanged, courtyard shows facades, grass, plaza.
- [ ] **Step 3:** Update scratchpad `e2e.mjs` to collect 3 items per level by teleport plus E, press E at the exit, and reach level 1 then the asylum (pool pending). Run it. Expected: PASS lines through level 1, no console errors; exit E with 2 items does not advance (assert).

### Task 7: Poolrooms in the game

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `generatePool` output (`water`, `pillars`).
- Produces: pool visuals from the reference (white tile walls/floor/ceiling, cylinder pillars from `pillars` instead of wall boxes, turquoise water planes with gentle motion, handrails at pool edges, warm cream fog); water mechanics in `movePlayer` (speed x0.55 in water, splash sound per step, `noises` entry `{x, y, r: LEVELS[2].hear}` fed to `stepEnemy`); level 0 blackout event (lamps drop for about 5 s every 60-90 s, with a sting); valve item model.

- [ ] **Step 1:** Implement pool level and events.
- [ ] **Step 2: Verify manually:** `shot.sh` with `&level=2` shows tiles, pillars, water. Walk into water in the e2e and assert player speed drops (distance moved in 1 s is lower) and an enemy within 7 cells switches to `'search'`.
- [ ] **Step 3:** Run solo `e2e.mjs` through all three levels to the end card. Expected: all PASS, no console errors.

### Task 8: Co-op lobby, sync, avatars, chat

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `KochNet.*`, PeerJS global `Peer`.
- Produces: lobby on the title overlay (buttons «Играть одному», «Создать комнату» showing the code and waiting text, «Войти по коду» with an input); `net` object `{role: 'solo'|'host'|'guest', link, remote: {interp, hidden, name}}`; remote avatar (Koch figure for the guest as seen by host; hoodie-green «Напарник» figure for the host as seen by guest) with chat bubble; rules: host-only story/enemy/item/transition logic, broadcast `scene` on every `enterState`, `snap` 15 Hz, `pos` 20 Hz from the guest (host ignores positions that are non-finite, off-map or inside a wall cell), `act` from the guest validated by distance on the host, `say` mirrored to the guest, `caught` and respawn for the caught player, `bye` and `onClose` handling; when a guest is connected the NPC Koch in intro scenes is hidden and the guest avatar stands in; intro triggers use the host as leader; keys 1-4 chat; guest joining late gets `scene` plus progress.

- [ ] **Step 1:** Implement lobby and link wiring (solo behaviour untouched when `role === 'solo'`).
- [ ] **Step 2:** Implement host-side simulation hooks and guest mirroring.
- [ ] **Step 3:** Write scratchpad `e2e-coop.mjs`: two Chrome pages, host creates room, guest joins by code; assert both reach `school`, host teleports through scenes and guest `story.state` follows, guest sees remote avatar position near host's view of guest, guest collects an item and the host counter increments once, level change syncs, a late third connection attempt is refused, guest closes and host continues. Run it. Expected: all PASS (requires internet for the PeerJS broker).
- [ ] **Step 4:** Run `e2e.mjs` again to confirm solo is unchanged. Expected: all PASS.

### Task 9: Whole-game verification and handoff

**Files:**
- Modify: `index.html` (overlay help text only)

- [ ] **Step 1:** Add co-op instructions to the title overlay («Друг: открой игру, "Войти по коду"»).
- [ ] **Step 2:** Run `node --test tests/logic.test.js tests/net.test.js`, `e2e.mjs`, `e2e-coop.mjs`. Expected: all PASS.
- [ ] **Step 3:** Self-review against Global Constraints and Review Focus (no fresh reviewer is used on this plan unless one is requested); list rulings and deferred minors in the final message.

---

## Self-review

- Spec coverage: co-op (T5, T8), levels 1-2 from images (T2, T3, T6, T7), items and gating (T1, T4, T6), rising difficulty (T1 `LEVELS`, T6), events per level (T6 shadows, T7 blackout and splash noise), solo preserved (T8 step 4), friend setup (T9 text).
- Types consistent: `World` fields, `LEVELS`, `createProgress`, `stepEnemy` opts, message types in T5 used by T8.
- Review Focus mapped: guest/host disconnect (T8 e2e), hostile messages (T5 tests, T8 host check), late join (T8 e2e), duplicate item and catch+exit (T4 tests), broker errors (T8 lobby).
- Proportion: logic and protocol tested by unit tests; visuals and sync verified by screenshots and two end-to-end runs.
