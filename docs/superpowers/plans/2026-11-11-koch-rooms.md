# Koch Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser first-person horror-comedy game: walk home from school with friend Koch, fall into Backrooms through a toilet, hide from enemies, find the exit, wake up in a psych ward.

**Architecture:** Pure game logic lives in `logic.js` (classic script, no DOM, no three.js, loadable by node and by the browser via `<script>`), tested with `node --test`. `index.html` holds the three.js rendering, input, audio and story scenes in one inline module script, importing three from a CDN via import map so it works when opened from `file://`.

**Tech Stack:** three.js 0.160.0 (CDN, import map), WebAudio (procedural sound), `node:test` for logic tests. No build step.

**Spec:** Design approved in chat on 2026-11-11 (no separate document). Summary:
- Story: end of lesson 3-4, walk home with Koch, Koch family says "Привет", toilet with Koch, fall into Backrooms (fall is scary and funny at once, 10-15 s, no player control, ends abruptly in a yellow hallway).
- Backrooms: big non-infinite world, yellow corridors, classroom with teachers, rooms with PCs running CS 1.6, standoffers, Koch family. Find the single exit door by exploring; hide from enemies (cabinets, desks, dark corners). Enemies see at distance.
- Caught: restart at fall landing point.
- Ending (added by user): after the exit, scene wakes player in a psych ward ("мы психопаты"). It is just another vision: no Koch, no CS 1.6, everything was a hallucination.
- Tone 50/50 scary and funny: creepy visuals and hum, meme dialogue. Sound is generated in code.

## Global Constraints

- UI and dialogue text in Russian.
- One `index.html` + `logic.js`; opens by double-click (`file://`), no server, no build.
- three.js pinned to `0.160.0` from `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`.
- Controls: WASD move, mouse look (pointer lock), E interact, Shift run.
- No audio or image asset files; everything procedural.
- World is a finite grid, exit is one door placed far from the spawn.

## Review Focus

- Pointer lock denied or Esc pressed mid-game: game pauses, click resumes, no stuck keys.
- Window resize or tiny/odd aspect ratio: camera and renderer follow.
- Player pressed against a wall corner while moving diagonally: no tunnelling through walls, no sticking.
- Enemy catches player the same frame as player reaches exit: exit wins (defined order).
- Caught repeatedly: restart always puts player at spawn, enemies reset to patrol, exit unchanged for that run.

---

## File Structure

- `logic.js`: RNG, world generation, collision query, enemy AI, story state machine. Exports through `module.exports` when present, otherwise `window.KochLogic`.
- `tests/logic.test.js`: node tests for all of `logic.js`.
- `index.html`: three.js scene, input, rendering, HUD/subtitles, audio, scene scripts.

### Task 1: World generation

**Files:**
- Create: `logic.js`, `tests/logic.test.js`

**Interfaces:**
- Produces: `makeRng(seed: number) -> () => number` (deterministic, [0,1)); `generateWorld(seed: number, size?: number = 31) -> { size, cells: number[][], spawn: {x,y}, exit: {x,y}, zones: string[][], hideSpots: {x,y}[], pcs: {x,y}[], enemySpawns: {x,y,type}[] }`. Cell values: `0` wall, `1` floor. Zone names: `'yellow' | 'class' | 'pcroom' | 'koch'`. Enemy types: `'teacher' | 'standofer' | 'kochfam'`.

- [ ] **Step 1: Write failing tests** in `tests/logic.test.js`: `world is deterministic per seed`, `spawn and exit are floor and reachable (BFS)`, `exit is at least size/2 path steps from spawn`, `every enemy spawn and hideSpot is floor`, `all four zones exist`, `at least 3 pcs and 6 hideSpots`.
- [ ] **Step 2:** Run `node --test tests/` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `makeRng` (mulberry32) and `generateWorld` in `logic.js`: recursive-backtracker maze on odd cells, carve a few extra openings for loops, flood-label zones by region (class/pcroom/koch as carved 5x5 rooms, rest yellow), exit = farthest reachable floor cell from spawn.
- [ ] **Step 4:** Run `node --test tests/` — expect PASS.

### Task 2: Collision and enemy AI

**Files:**
- Modify: `logic.js`, `tests/logic.test.js`

**Interfaces:**
- Consumes: `generateWorld` result `cells`.
- Produces: `moveWithCollision(cells, pos: {x,y}, dx: number, dy: number, radius: number) -> {x,y}` (axis-separated, never ends inside a wall); `canSee(cells, from: {x,y}, to: {x,y}, range: number) -> boolean` (grid line-of-sight within range); `makeEnemy({x,y,type}) -> Enemy`; `stepEnemy(cells, enemy, player: {x,y,hidden: boolean}, dt: number, rng) -> void` mutating `enemy.x, enemy.y, enemy.state` where state is `'patrol' | 'chase' | 'search'`; `isCaught(enemy, player, catchDist = 0.6) -> boolean`.

- [ ] **Step 1: Write failing tests**: `moveWithCollision stops at wall`, `diagonal move into corner slides, does not tunnel`, `canSee blocked by wall`, `canSee false beyond range`, `enemy chases when it sees visible player`, `enemy ignores hidden player outside 1.5 cells`, `enemy returns to search then patrol after losing player`, `isCaught within distance only`.
- [ ] **Step 2:** Run `node --test tests/` — expect FAIL.
- [ ] **Step 3: Implement** the five functions. Speeds per type: teacher 1.6, standofer 2.2, kochfam 1.9 cells/s; sight range 8 cells; patrol picks random reachable neighbours with `rng`.
- [ ] **Step 4:** Run `node --test tests/` — expect PASS.

### Task 3: Story state machine

**Files:**
- Modify: `logic.js`, `tests/logic.test.js`

**Interfaces:**
- Produces: `createStory() -> Story` with `story.state` in `'school' | 'walk' | 'home' | 'toilet' | 'fall' | 'backrooms' | 'asylum' | 'end'`; `story.advance() -> string` (moves to next state, returns it); `story.onCaught() -> 'backrooms'` (stays in backrooms, increments `story.deaths`); `story.onExit() -> 'asylum'`; `story.resolve({caught: boolean, atExit: boolean}) -> string` (exit wins when both true).

- [ ] **Step 1: Write failing tests**: `advance walks school→walk→home→toilet→fall→backrooms`, `onCaught stays in backrooms and counts deaths`, `resolve with caught and atExit goes to asylum`, `advance from asylum goes to end`, `advance from end stays end`, `onExit outside backrooms is ignored`.
- [ ] **Step 2:** Run `node --test tests/` — expect FAIL.
- [ ] **Step 3: Implement** `createStory` with a transition table.
- [ ] **Step 4:** Run `node --test tests/` — expect PASS.

### Task 4: Renderer, controls, collision in-browser

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: `KochLogic.generateWorld`, `KochLogic.moveWithCollision`.
- Produces (inside index.html): `buildWorldMesh(world) -> THREE.Group` (instanced walls, floor, ceiling, yellow wallpaper via CanvasTexture, flickering ceiling lights); `Controls` object with `update(dt)` (pointer lock look, WASD, Shift run, pause on lock loss, key state cleared on blur); resize handler.

- [ ] **Step 1:** Create `index.html` with import map for three 0.160.0, `<script src="logic.js">`, canvas, start overlay "Кликни, чтобы играть".
- [ ] **Step 2:** Implement `buildWorldMesh` and `Controls`; player walks the generated world with collision.
- [ ] **Step 3: Verify manually:** open `index.html`, walk into every wall and corner, press Esc, click to resume, resize window. Expected: no clipping, pause works, no stuck movement.

### Task 5: Intro story scenes

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `KochLogic.createStory`.
- Produces: `playScene(name: 'school'|'walk'|'home'|'toilet'|'fall') -> Promise<void>`; `subtitle(text: string, ms: number) -> Promise<void>`.

- [ ] **Step 1:** Implement small hand-built scenes with the same renderer: school corridor ("Урок закончился. 3-4 прошли, домой."), street walk with Koch (capsule character), home with Koch family greeting "Привет!", toilet where E on the door starts the fall.
- [ ] **Step 2:** Implement fall: floor disappears, camera descends 12 s with spin, vignette darkening, FOV stretch, muffled audio low-pass, a few meme subtitles, abrupt cut to backrooms spawn with a thud.
- [ ] **Step 3: Verify manually:** play from start to landing. Expected: no soft-lock, fall is skippable only after first viewing (no skip needed first run), lands at `world.spawn`.

### Task 6: Backrooms gameplay

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `generateWorld`, `makeEnemy`, `stepEnemy`, `isCaught`, `story.resolve`.
- Produces: `spawnEnemies(world)`, `HideSystem` (E near a hideSpot toggles `player.hidden`, camera dims), zone dressing (classroom with teacher figures and desks, PCs with CS 1.6 screen texture and "E: включить" gag, Koch house corner), exit door mesh at `world.exit` with E to open.

- [ ] **Step 1:** Render enemies as simple stylized figures per type (teacher: tall figure with journal; standofer: kid with phone; kochfam: Koch silhouettes) with distinct meme shout subtitles on chase start.
- [ ] **Step 2:** Wire game loop: step enemies, check `isCaught` and exit proximity each frame, call `story.resolve`, on caught show "Тебя поймали" and respawn at spawn with enemies reset.
- [ ] **Step 3: Verify manually:** get caught (respawn at spawn), hide from a chasing enemy (it loses you), find and open exit.

### Task 7: Audio and asylum ending

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: `Audio` object: `start()`, `hum(on: boolean)`, `chaseSting()`, `lowpass(on: boolean)`; `playScene('asylum')`, `playScene('end')`.

- [ ] **Step 1:** WebAudio: lamp hum (50 Hz + harmonics), footstep clicks, chase sting, tense drone; created only after first user gesture.
- [ ] **Step 2:** Asylum scene: white room, bed, cold light, Koch and all CS 1.6 props gone, subtitles: "Ты проснулся. Белая палата. Ни Коча, ни КС 1.6." then "Это было очередное видение. Мы психопаты." then end card "Конец" with "Играть снова".
- [ ] **Step 3: Verify manually:** full run start to end card; sound starts after click; replay resets story and world.

---

## Self-review

- Spec coverage: school/walk/home/toilet/fall (T5), backrooms zones, teachers, PCs CS 1.6, standofers, Koch family, hiding, exit hunt (T1, T2, T6), caught-restart (T3, T6), asylum ending with no Koch/CS 1.6 (T7), procedural sound (T7).
- Types: `generateWorld`, `moveWithCollision`, `stepEnemy`, `isCaught`, `createStory().resolve` names consistent across tasks.
- Proportion: logic is tested; scene work is verified by manual playthrough because it is visual.
- Not a git repo, so no commit steps.
