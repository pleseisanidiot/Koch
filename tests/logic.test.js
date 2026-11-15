const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function bfsDist(cells, from) {
  const h = cells.length, w = cells[0].length;
  const dist = Array.from({ length: h }, () => Array(w).fill(-1));
  const q = [[from.x, from.y]];
  dist[from.y][from.x] = 0;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
      if (cells[ny][nx] !== 1 || dist[ny][nx] !== -1) continue;
      dist[ny][nx] = dist[y][x] + 1;
      q.push([nx, ny]);
    }
  }
  return dist;
}

// ---------- Task 1: world generation ----------

test('world is deterministic per seed', () => {
  const a = L.generateWorld(42);
  const b = L.generateWorld(42);
  assert.deepStrictEqual(a, b);
  const c = L.generateWorld(43);
  assert.notDeepStrictEqual(a.cells, c.cells);
});

test('makeRng is deterministic and in [0,1)', () => {
  const r1 = L.makeRng(7), r2 = L.makeRng(7);
  for (let i = 0; i < 50; i++) {
    const v = r1();
    assert.strictEqual(v, r2());
    assert.ok(v >= 0 && v < 1);
  }
});

test('spawn and exit are floor and reachable', () => {
  for (const seed of [1, 2, 3, 99]) {
    const w = L.generateWorld(seed);
    assert.strictEqual(w.cells[w.spawn.y][w.spawn.x], 1);
    assert.strictEqual(w.cells[w.exit.y][w.exit.x], 1);
    const d = bfsDist(w.cells, w.spawn);
    assert.ok(d[w.exit.y][w.exit.x] > 0);
  }
});

test('exit is far from spawn', () => {
  for (const seed of [1, 2, 3, 99]) {
    const w = L.generateWorld(seed);
    const d = bfsDist(w.cells, w.spawn);
    assert.ok(d[w.exit.y][w.exit.x] >= w.size / 2);
  }
});

test('enemy spawns, hideSpots and pcs are reachable floor', () => {
  const w = L.generateWorld(5);
  const d = bfsDist(w.cells, w.spawn);
  for (const p of [...w.enemySpawns, ...w.hideSpots, ...w.pcs]) {
    assert.strictEqual(w.cells[p.y][p.x], 1);
    assert.ok(d[p.y][p.x] >= 0);
  }
  for (const e of w.enemySpawns) assert.ok(['teacher', 'standofer', 'kochfam'].includes(e.type));
});

test('no enemy spawns right next to player spawn', () => {
  const w = L.generateWorld(5);
  for (const e of w.enemySpawns) {
    assert.ok(Math.abs(e.x - w.spawn.x) + Math.abs(e.y - w.spawn.y) >= 6);
  }
});

test('all four zones exist', () => {
  const w = L.generateWorld(8);
  const found = new Set(w.zones.flat().filter(Boolean));
  for (const z of ['yellow', 'class', 'pcroom', 'koch']) assert.ok(found.has(z), z);
});

test('at least 3 pcs, 6 hideSpots, one enemy of each type', () => {
  for (const seed of [1, 2, 3, 4]) {
    const w = L.generateWorld(seed);
    assert.ok(w.pcs.length >= 3);
    assert.ok(w.hideSpots.length >= 6);
    const types = new Set(w.enemySpawns.map((e) => e.type));
    assert.strictEqual(types.size, 3);
  }
});

test('world border is wall', () => {
  const w = L.generateWorld(11);
  for (let i = 0; i < w.size; i++) {
    assert.strictEqual(w.cells[0][i], 0);
    assert.strictEqual(w.cells[w.size - 1][i], 0);
    assert.strictEqual(w.cells[i][0], 0);
    assert.strictEqual(w.cells[i][w.size - 1], 0);
  }
});

// ---------- Task 2: collision and enemy AI ----------

const grid = (rows) => rows.map((r) => [...r].map((c) => (c === '#' ? 0 : 1)));
const corridor = grid([
  '#########',
  '#.......#',
  '#########',
]);
const lshape = grid([
  '#########',
  '#.......#',
  '#######.#',
  '#######.#',
  '#########',
]);

test('moveWithCollision stops at wall', () => {
  const p = L.moveWithCollision(corridor, { x: 7.0, y: 1.5 }, 2, 0, 0.3);
  assert.ok(p.x <= 8 - 0.3 + 1e-9, 'x=' + p.x);
  assert.ok(p.x > 7.0);
});

test('large single step does not tunnel through wall', () => {
  const g = grid(['#######', '#..#..#', '#######']);
  const p = L.moveWithCollision(g, { x: 1.5, y: 1.5 }, 3.5, 0, 0.3);
  assert.ok(p.x < 3, 'x=' + p.x);
});

test('diagonal move into corner slides, does not stick or tunnel', () => {
  const g = grid(['#####', '#...#', '#...#', '#####']);
  const p = L.moveWithCollision(g, { x: 3.6, y: 1.5 }, 0.5, 0.3, 0.3);
  assert.ok(p.x <= 4 - 0.3 + 1e-9);
  assert.ok(p.y > 1.5);
  assert.strictEqual(g[Math.floor(p.y)][Math.floor(p.x)], 1);
});

test('moveWithCollision never ends inside a wall (random walk)', () => {
  const w = L.generateWorld(3);
  const rng = L.makeRng(1);
  let pos = { x: w.spawn.x + 0.5, y: w.spawn.y + 0.5 };
  for (let i = 0; i < 2000; i++) {
    pos = L.moveWithCollision(w.cells, pos, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4, 0.3);
    assert.strictEqual(w.cells[Math.floor(pos.y)][Math.floor(pos.x)], 1);
  }
});

test('canSee blocked by wall', () => {
  assert.strictEqual(L.canSee(lshape, { x: 1.5, y: 1.5 }, { x: 7.5, y: 3.5 }, 20), false);
  assert.strictEqual(L.canSee(lshape, { x: 1.5, y: 1.5 }, { x: 5.5, y: 1.5 }, 20), true);
});

test('canSee false beyond range', () => {
  assert.strictEqual(L.canSee(corridor, { x: 1.5, y: 1.5 }, { x: 7.5, y: 1.5 }, 4), false);
  assert.strictEqual(L.canSee(corridor, { x: 1.5, y: 1.5 }, { x: 4.5, y: 1.5 }, 4), true);
});

test('makeEnemy centers on cell and has speed per type', () => {
  const t = L.makeEnemy({ x: 2, y: 3, type: 'teacher' });
  assert.strictEqual(t.x, 2.5);
  assert.strictEqual(t.y, 3.5);
  assert.strictEqual(t.state, 'patrol');
  assert.ok(L.makeEnemy({ x: 1, y: 1, type: 'standofer' }).speed > t.speed);
});

test('enemy chases when it sees visible player', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  const player = { x: 5.5, y: 1.5, hidden: false };
  const before = Math.abs(player.x - e.x);
  L.stepEnemy(corridor, e, player, 0.2, L.makeRng(1));
  assert.strictEqual(e.state, 'chase');
  assert.ok(Math.abs(player.x - e.x) < before);
});

test('enemy ignores hidden player outside 1.5 cells', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  L.stepEnemy(corridor, e, { x: 5.5, y: 1.5, hidden: true }, 0.2, L.makeRng(1));
  assert.strictEqual(e.state, 'patrol');
  const e2 = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  L.stepEnemy(corridor, e2, { x: 2.3, y: 1.5, hidden: true }, 0.05, L.makeRng(1));
  assert.strictEqual(e2.state, 'chase');
});

test('enemy goes chase -> search -> patrol after losing player', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  const rng = L.makeRng(2);
  L.stepEnemy(lshape, e, { x: 3.5, y: 1.5, hidden: false }, 0.1, rng);
  assert.strictEqual(e.state, 'chase');
  const seen = [];
  for (let i = 0; i < 400; i++) {
    L.stepEnemy(lshape, e, { x: 7.5, y: 3.5, hidden: false }, 0.1, rng);
    if (seen[seen.length - 1] !== e.state) seen.push(e.state);
    if (e.state === 'patrol') break;
  }
  assert.deepStrictEqual(seen.slice(0, 2), ['search', 'patrol']);
});

test('patrolling enemy always stays on floor and keeps moving', () => {
  const w = L.generateWorld(9);
  const e = L.makeEnemy(w.enemySpawns[0]);
  const rng = L.makeRng(5);
  const far = { x: 1000, y: 1000, hidden: false };
  const start = { x: e.x, y: e.y };
  let moved = 0;
  for (let i = 0; i < 3000; i++) {
    L.stepEnemy(w.cells, e, far, 0.05, rng);
    assert.strictEqual(w.cells[Math.floor(e.y)][Math.floor(e.x)], 1);
    moved = Math.max(moved, Math.abs(e.x - start.x) + Math.abs(e.y - start.y));
  }
  assert.ok(moved > 2, 'moved=' + moved);
});

test('isCaught within distance only', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  assert.strictEqual(L.isCaught(e, { x: 1.9, y: 1.5 }), true);
  assert.strictEqual(L.isCaught(e, { x: 3.5, y: 1.5 }), false);
  assert.strictEqual(L.isCaught(e, { x: 2.5, y: 1.5 }, 1.1), true);
});

// ---------- Task 3: story state machine ----------

test('advance walks school -> walk -> home -> toilet -> fall -> backrooms', () => {
  const s = L.createStory();
  assert.strictEqual(s.state, 'school');
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(s.advance());
  assert.deepStrictEqual(seen, ['walk', 'home', 'toilet', 'fall', 'backrooms']);
  assert.strictEqual(s.state, 'backrooms');
});

test('advance in backrooms does nothing (exit is required)', () => {
  const s = L.createStory();
  for (let i = 0; i < 5; i++) s.advance();
  assert.strictEqual(s.advance(), 'backrooms');
});

test('onCaught stays in backrooms and counts deaths', () => {
  const s = L.createStory();
  for (let i = 0; i < 5; i++) s.advance();
  assert.strictEqual(s.onCaught(), 'backrooms');
  s.onCaught();
  assert.strictEqual(s.deaths, 2);
  assert.strictEqual(s.state, 'backrooms');
});

test('onCaught and onExit outside backrooms are ignored', () => {
  const s = L.createStory();
  assert.strictEqual(s.onCaught(), 'school');
  assert.strictEqual(s.onExit(), 'school');
  assert.strictEqual(s.deaths, 0);
});

test('resolve with caught and atExit goes to asylum', () => {
  const s = L.createStory();
  for (let i = 0; i < 5; i++) s.advance();
  assert.strictEqual(s.resolve({ caught: true, atExit: true }), 'asylum');
  assert.strictEqual(s.deaths, 0);
});

test('resolve with only caught counts a death, with neither changes nothing', () => {
  const s = L.createStory();
  for (let i = 0; i < 5; i++) s.advance();
  assert.strictEqual(s.resolve({ caught: false, atExit: false }), 'backrooms');
  assert.strictEqual(s.resolve({ caught: true, atExit: false }), 'backrooms');
  assert.strictEqual(s.deaths, 1);
});

test('advance from asylum goes to end and end is final', () => {
  const s = L.createStory();
  for (let i = 0; i < 5; i++) s.advance();
  s.onExit();
  assert.strictEqual(s.advance(), 'end');
  assert.strictEqual(s.advance(), 'end');
});

// ---------- Level 2 plan, Task 1: registry, items, generateLevel ----------

test('LEVELS has 3 entries with expected speedMul/sight/hear', () => {
  assert.strictEqual(L.LEVELS.length, 3);
  assert.deepStrictEqual(L.LEVELS.map((l) => l.id), ['yellow', 'corridors', 'pool']);
  assert.deepStrictEqual(L.LEVELS.map((l) => l.speedMul), [1, 1.15, 1.3]);
  assert.deepStrictEqual(L.LEVELS.map((l) => l.sight), [8, 10, 9]);
  assert.deepStrictEqual(L.LEVELS.map((l) => l.hear), [0, 0, 7]);
  for (const l of L.LEVELS) {
    assert.strictEqual(l.itemsNeeded, 3);
    assert.ok(l.name && l.itemName);
  }
});

function checkItems(w, gap) {
  assert.strictEqual(w.items.length, 3);
  const bad = new Set([w.spawn, w.exit, ...w.enemySpawns, ...w.hideSpots].map((p) => p.x + ',' + p.y));
  for (const it of w.items) {
    assert.strictEqual(w.cells[it.y][it.x], 1);
    assert.ok(!bad.has(it.x + ',' + it.y), 'item overlaps ' + it.x + ',' + it.y);
  }
  for (let i = 0; i < 3; i++) {
    const d = bfsDist(w.cells, w.items[i]);
    assert.ok(d[w.spawn.y][w.spawn.x] >= 0, 'item reachable');
    for (let j = i + 1; j < 3; j++) assert.ok(d[w.items[j].y][w.items[j].x] >= gap, `gap ${i}-${j}`);
  }
}

test('generateWorld items: 3, reachable, spaced, not on special cells', () => {
  for (const seed of [1, 2, 3, 4, 5, 99]) checkItems(L.generateWorld(seed), 8);
});

test('generateWorld has kind yellow', () => {
  assert.strictEqual(L.generateWorld(1).kind, 'yellow');
});

test('generateLevel(0, s) deep-equals generateWorld(s)', () => {
  assert.deepStrictEqual(L.generateLevel(0, 12), L.generateWorld(12));
});

test('generateLevel throws on unknown level', () => {
  assert.throws(() => L.generateLevel(7, 1));
  assert.throws(() => L.generateLevel(-1, 1));
});

// ---------- Task 2: corridors (level 1, indoors) ----------

const CORR_SEEDS = [1, 2, 3, 7, 42];

test('corridors deterministic per seed, generateLevel(1) matches', () => {
  assert.deepStrictEqual(L.generateCorridors(5), L.generateCorridors(5));
  assert.notDeepStrictEqual(L.generateCorridors(5).cells, L.generateCorridors(6).cells);
  assert.deepStrictEqual(L.generateLevel(1, 9), L.generateCorridors(9));
});

test('corridors border is wall and kind is corridors', () => {
  const w = L.generateCorridors(3);
  assert.strictEqual(w.kind, 'corridors');
  assert.strictEqual(w.size, 42);
  for (let i = 0; i < w.size; i++) {
    assert.strictEqual(w.cells[0][i], 0); assert.strictEqual(w.cells[w.size - 1][i], 0);
    assert.strictEqual(w.cells[i][0], 0); assert.strictEqual(w.cells[i][w.size - 1], 0);
  }
});

test('corridors are indoors: floor is 35-65% of the interior, walls everywhere', () => {
  for (const seed of CORR_SEEDS) {
    const w = L.generateCorridors(seed);
    let floor = 0;
    for (let y = 1; y < w.size - 1; y++) for (let x = 1; x < w.size - 1; x++) floor += w.cells[y][x];
    const r = floor / ((w.size - 2) ** 2);
    assert.ok(r >= 0.35 && r <= 0.65, 'seed ' + seed + ' ratio ' + r);
  }
});

test('corridors: every floor cell reachable from spawn, spawn is floor', () => {
  for (const seed of CORR_SEEDS) {
    const w = L.generateCorridors(seed);
    assert.strictEqual(w.cells[w.spawn.y][w.spawn.x], 1);
    const d = bfsDist(w.cells, w.spawn);
    for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) if (w.cells[y][x] === 1) assert.ok(d[y][x] >= 0, `${seed}: ${x},${y}`);
  }
});

test('corridors are at least 2 wide: every floor cell sits in a 2x2 floor block', () => {
  for (const seed of CORR_SEEDS) {
    const w = L.generateCorridors(seed), c = w.cells;
    for (let y = 1; y < w.size - 1; y++) for (let x = 1; x < w.size - 1; x++) {
      if (!c[y][x]) continue;
      const inBlock = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => c[y + dy][x + dx] && c[y + dy][x + dx + 1] && c[y + dy + 1][x + dx] && c[y + dy + 1][x + dx + 1]);
      assert.ok(inBlock, `${seed}: ${x},${y}`);
    }
  }
});

test('corridors exit next to a wall and far from spawn', () => {
  for (const seed of CORR_SEEDS) {
    const w = L.generateCorridors(seed);
    const { x, y } = w.exit;
    assert.strictEqual(w.cells[y][x], 1);
    assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.cells[y + dy][x + dx] === 0));
    assert.ok(bfsDist(w.cells, w.spawn)[y][x] >= w.size);
  }
});

test('corridors items: 3 reachable, gap >= 10', () => {
  for (const seed of CORR_SEEDS) checkItems(L.generateCorridors(seed), 10);
});

test('corridors enemies: >= 7, all types, >= 8 from spawn, on floor', () => {
  for (const seed of CORR_SEEDS) {
    const w = L.generateCorridors(seed);
    assert.ok(w.enemySpawns.length >= 7, 'seed ' + seed + ' has ' + w.enemySpawns.length);
    assert.strictEqual(new Set(w.enemySpawns.map((e) => e.type)).size, 3);
    for (const e of w.enemySpawns) {
      assert.strictEqual(w.cells[e.y][e.x], 1);
      assert.ok(Math.abs(e.x - w.spawn.x) + Math.abs(e.y - w.spawn.y) >= 8);
    }
  }
});

test('corridors hideSpots >= 8 on floor; pcs empty; zones hall/null', () => {
  for (const seed of CORR_SEEDS) {
    const w = L.generateCorridors(seed);
    assert.ok(w.hideSpots.length >= 8, 'seed ' + seed + ' has ' + w.hideSpots.length);
    for (const p of w.hideSpots) assert.strictEqual(w.cells[p.y][p.x], 1);
    assert.deepStrictEqual(w.pcs, []);
    for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) assert.strictEqual(w.zones[y][x], w.cells[y][x] === 1 ? 'hall' : null);
  }
});

test('generateCorridors rejects sizes that are not 4k+2', () => {
  assert.throws(() => L.generateCorridors(1, 41));
});

// ---------- Task 3: poolrooms ----------

const POOL_SEEDS = [1, 2, 3, 7, 42];

test('pool deterministic, kind pool, generateLevel(2) matches', () => {
  assert.deepStrictEqual(L.generatePool(5), L.generatePool(5));
  assert.notDeepStrictEqual(L.generatePool(5).cells, L.generatePool(6).cells);
  assert.strictEqual(L.generatePool(1).kind, 'pool');
  assert.deepStrictEqual(L.generateLevel(2, 9), L.generatePool(9));
});

test('pool: every floor cell reachable, exit far, border is wall', () => {
  for (const seed of POOL_SEEDS) {
    const w = L.generatePool(seed);
    const d = bfsDist(w.cells, w.spawn);
    for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) if (w.cells[y][x] === 1) assert.ok(d[y][x] >= 0, `${seed}: ${x},${y}`);
    assert.ok(d[w.exit.y][w.exit.x] >= w.size / 2);
    for (let i = 0; i < w.size; i++) { assert.strictEqual(w.cells[0][i], 0); assert.strictEqual(w.cells[i][w.size - 1], 0); }
  }
});

test('pool water only on floor, not on spawn/exit/items, >= 10% of floor', () => {
  for (const seed of POOL_SEEDS) {
    const w = L.generatePool(seed);
    let water = 0, floor = 0;
    for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) {
      if (w.cells[y][x] === 1) floor++;
      if (w.water[y][x]) { assert.strictEqual(w.cells[y][x], 1); water++; }
    }
    assert.ok(water / floor >= 0.1, `seed ${seed}: ${water}/${floor}`);
    assert.strictEqual(w.water[w.spawn.y][w.spawn.x], 0);
    assert.strictEqual(w.water[w.exit.y][w.exit.x], 0);
    for (const it of w.items) assert.strictEqual(w.water[it.y][it.x], 0);
  }
});

test('pool has >= 3 halls and >= 4 pillars that are walls', () => {
  for (const seed of POOL_SEEDS) {
    const w = L.generatePool(seed);
    assert.ok(w.rooms.length >= 3);
    assert.ok(w.pillars.length >= 4);
    for (const p of w.pillars) assert.strictEqual(w.cells[p.y][p.x], 0);
  }
});

test('pool items: 3 reachable gap >= 8; enemies >= 6 all types, hideSpots >= 6 on floor', () => {
  for (const seed of POOL_SEEDS) {
    const w = L.generatePool(seed);
    checkItems(w, 8);
    assert.ok(w.enemySpawns.length >= 6);
    assert.strictEqual(new Set(w.enemySpawns.map((e) => e.type)).size, 3);
    for (const e of w.enemySpawns) {
      assert.strictEqual(w.cells[e.y][e.x], 1);
      assert.ok(Math.abs(e.x - w.spawn.x) + Math.abs(e.y - w.spawn.y) >= 8);
    }
    assert.ok(w.hideSpots.length >= 6);
    for (const p of w.hideSpots) assert.strictEqual(w.cells[p.y][p.x], 1);
  }
});

// ---------- Task 4: multi-player AI, levels in story, item progress ----------

test('stepEnemy picks nearest of two visible players', () => {
  const e = L.makeEnemy({ x: 4, y: 1, type: 'teacher' });
  const near = { x: 6.5, y: 1.5, hidden: false }, far = { x: 1.5, y: 1.5, hidden: false };
  L.stepEnemy(corridor, e, [far, near], 0.2, L.makeRng(1));
  assert.strictEqual(e.state, 'chase');
  assert.deepStrictEqual(e.lastSeen, { x: 6.5, y: 1.5 });
});

test('stepEnemy ignores hidden far player but chases visible second', () => {
  const e = L.makeEnemy({ x: 4, y: 1, type: 'teacher' });
  const hid = { x: 1.5, y: 1.5, hidden: true }, vis = { x: 7.5, y: 1.5, hidden: false };
  L.stepEnemy(corridor, e, [hid, vis], 0.2, L.makeRng(1));
  assert.deepStrictEqual(e.lastSeen, { x: 7.5, y: 1.5 });
});

test('stepEnemy still accepts a single player object', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  L.stepEnemy(corridor, e, { x: 5.5, y: 1.5, hidden: false }, 0.1, L.makeRng(1));
  assert.strictEqual(e.state, 'chase');
});

const away = { x: 1000, y: 1000, hidden: false };

test('noise within r sends patrolling enemy to search at the noise point', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  L.stepEnemy(corridor, e, away, 0.1, L.makeRng(1), { noises: [{ x: 6.5, y: 1.5, r: 7 }] });
  assert.strictEqual(e.state, 'search');
  assert.deepStrictEqual(e.lastSeen, { x: 6.5, y: 1.5 });
});

test('noise outside r ignored', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  L.stepEnemy(corridor, e, away, 0.1, L.makeRng(1), { noises: [{ x: 7.5, y: 1.5, r: 3 }] });
  assert.strictEqual(e.state, 'patrol');
});

test('noise does not interrupt chase of a visible player', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  L.stepEnemy(corridor, e, { x: 4.5, y: 1.5, hidden: false }, 0.1, L.makeRng(1), { noises: [{ x: 1.5, y: 1.5, r: 9 }] });
  assert.strictEqual(e.state, 'chase');
  assert.deepStrictEqual(e.lastSeen, { x: 4.5, y: 1.5 });
});

test('speedMul 2 moves twice as far as speedMul 1', () => {
  const p = { x: 7.5, y: 1.5, hidden: false };
  const a = L.makeEnemy({ x: 1, y: 1, type: 'teacher' }), b = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  L.stepEnemy(corridor, a, p, 0.1, L.makeRng(1), { speedMul: 1 });
  L.stepEnemy(corridor, b, p, 0.1, L.makeRng(1), { speedMul: 2 });
  assert.ok(Math.abs((b.x - 1.5) - 2 * (a.x - 1.5)) < 1e-9);
});

test('opts.sight shortens view', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  L.stepEnemy(corridor, e, { x: 6.5, y: 1.5, hidden: false }, 0.1, L.makeRng(1), { sight: 3 });
  assert.strictEqual(e.state, 'patrol');
  L.stepEnemy(corridor, e, { x: 6.5, y: 1.5, hidden: false }, 0.1, L.makeRng(1), { sight: 6 });
  assert.strictEqual(e.state, 'chase');
});

test('isCaughtAny returns index or -1', () => {
  const e = L.makeEnemy({ x: 1, y: 1, type: 'teacher' });
  assert.strictEqual(L.isCaughtAny(e, [{ x: 5, y: 5 }, { x: 1.9, y: 1.5 }]), 1);
  assert.strictEqual(L.isCaughtAny(e, [{ x: 5, y: 5 }]), -1);
  assert.strictEqual(L.isCaughtAny(e, []), -1);
});

function toBackrooms(s) { for (let i = 0; i < 5; i++) s.advance(); return s; }

test('story levels=3: exit goes level 1, 2, then asylum; deaths persist', () => {
  const s = toBackrooms(L.createStory(3));
  assert.strictEqual(s.level, 0);
  s.onCaught();
  assert.strictEqual(s.onExit(), 'backrooms'); assert.strictEqual(s.level, 1);
  assert.strictEqual(s.onExit(), 'backrooms'); assert.strictEqual(s.level, 2);
  assert.strictEqual(s.onExit(), 'asylum');
  assert.strictEqual(s.deaths, 1);
});

test('story default levels=1: exit goes straight to asylum', () => {
  const s = toBackrooms(L.createStory());
  assert.strictEqual(s.onExit(), 'asylum');
  assert.strictEqual(s.level, 0);
});

test('resolve caught+atExit on level 0 of 3 advances the level, not a death', () => {
  const s = toBackrooms(L.createStory(3));
  assert.strictEqual(s.resolve({ caught: true, atExit: true }), 'backrooms');
  assert.strictEqual(s.level, 1);
  assert.strictEqual(s.deaths, 0);
});

test('progress: collect twice counts once, ready at need', () => {
  const p = L.createProgress(3);
  assert.strictEqual(p.ready(), false);
  assert.strictEqual(p.collect(0), true);
  assert.strictEqual(p.collect(0), false);
  assert.strictEqual(p.count(), 1);
  p.collect(1); assert.strictEqual(p.ready(), false);
  p.collect(2); assert.strictEqual(p.ready(), true);
});

test('progress toArray/fromArray roundtrip', () => {
  const p = L.createProgress(3); p.collect(2); p.collect(0);
  assert.deepStrictEqual(p.toArray(), [0, 2]);
  const q = L.createProgress(3); q.fromArray([1, 2]);
  assert.strictEqual(q.count(), 2);
  assert.strictEqual(q.collect(1), false);
});

// ---------- DLC "Вторая личность" ----------

test('dlc story walks the whole day of Koch from k_morning to k_final -> end', () => {
  const s = L.createStory(3, 'dlc');
  assert.strictEqual(s.state, 'k_morning');
  assert.strictEqual(s.level, 0);
  assert.strictEqual(s.levels, L.NIGHT_LOOPS);
  const seen = [];
  for (let i = 0; i < 13; i++) seen.push(s.advance());
  assert.deepStrictEqual(seen, ['k_kitchen', 'k_yard', 'k_break', 'k_school', 'k_home', 'k_pc', 'k_dream', 'k_night', 'k_end', 'k_hall', 'k_final', 'end', 'end']);
  assert.deepStrictEqual(L.DLC_ORDER, ['k_morning'].concat(seen.slice(0, 11)));
});

test('dlc story has no chase level: caught and exit change nothing', () => {
  const s = L.createStory(3, 'dlc');
  for (let i = 0; i < 8; i++) s.advance();
  assert.strictEqual(s.resolve({ caught: true }), 'k_night');
  assert.strictEqual(s.resolve({ atExit: true }), 'k_night');
  assert.strictEqual(s.deaths, 0);
  assert.strictEqual(s.level, 0);
});

test('story reset switches mode and clears deaths', () => {
  const s = L.createStory(3);
  for (let i = 0; i < 5; i++) s.advance();
  s.onCaught();
  s.reset('dlc');
  assert.strictEqual(s.state, 'k_morning');
  assert.strictEqual(s.deaths, 0);
  s.reset('main');
  assert.strictEqual(s.state, 'school');
  assert.strictEqual(s.level, 0);
  for (let i = 0; i < 5; i++) s.advance();
  s.onExit(); s.onExit(); assert.strictEqual(s.onExit(), 'asylum');
});
