(function (root) {
  'use strict';

  // ---------- RNG ----------
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function bfs(cells, from) {
    const h = cells.length, w = cells[0].length;
    const dist = Array.from({ length: h }, () => Array(w).fill(-1));
    const q = [[from.x, from.y]];
    dist[from.y][from.x] = 0;
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
        if (cells[ny][nx] !== 1 || dist[ny][nx] !== -1) continue;
        dist[ny][nx] = dist[y][x] + 1;
        q.push([nx, ny]);
      }
    }
    return dist;
  }

  // ---------- World generation ----------
  // Recursive-backtracker maze on odd cells plus a few loops. Returns size x size grid (1 floor, 0 wall).
  function carveMaze(size, rng, opt) {
    const loops = opt && opt.loops !== undefined ? opt.loops : 0.38;
    const withHalls = !opt || opt.halls !== false;
    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    // recursive backtracker on odd cells
    const stack = [[1, 1]];
    cells[1][1] = 1;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const opts = shuffle(DIRS4.map(([dx, dy]) => [x + dx * 2, y + dy * 2, dx, dy]), rng)
        .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && cells[ny][nx] === 0);
      if (!opts.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = opts[0];
      cells[y + dy][x + dx] = 1;
      cells[ny][nx] = 1;
      stack.push([nx, ny]);
    }

    // loops: knock out some walls between floors
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (cells[y][x] !== 0 || (x + y) % 2 === 0) continue;
        const between = (cells[y][x - 1] && cells[y][x + 1]) || (cells[y - 1][x] && cells[y + 1][x]);
        if (between && rng() < loops) cells[y][x] = 1;
      }
    }

    // open halls: clear a block, keep every other wall post as a pillar
    const halls = withHalls ? 4 + Math.floor(size / 12) : 0;
    for (let n = 0; n < halls; n++) {
      const w = 5 + 2 * Math.floor(rng() * 3), h = 5 + 2 * Math.floor(rng() * 3);
      if (w > size - 2 || h > size - 2) continue;
      const x0 = 1 + 2 * Math.floor(rng() * Math.floor((size - 1 - w) / 2));
      const y0 = 1 + 2 * Math.floor(rng() * Math.floor((size - 1 - h) / 2));
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          const post = (x - x0) % 2 === 1 && (y - y0) % 2 === 1 && ((x - x0 - 1) / 2 + (y - y0 - 1) / 2) % 2 === 0;
          cells[y][x] = post ? 0 : 1;
        }
      }
    }
    return cells;
  }

  // Pick `count` reachable floor cells at least `minGap` BFS steps apart (gap relaxes if the map is tight).
  function placeItems(world, rng, count, minGap) {
    minGap = minGap || 8;
    const dist = bfs(world.cells, world.spawn);
    const bad = new Set([world.spawn, world.exit].concat(world.enemySpawns, world.hideSpots, world.pcs || []).map((p) => p.x + ',' + p.y));
    const cands = [];
    for (let y = 1; y < world.cells.length - 1; y++) {
      for (let x = 1; x < world.cells[0].length - 1; x++) {
        if (world.cells[y][x] !== 1 || dist[y][x] < 6 || bad.has(x + ',' + y)) continue;
        if (world.water && world.water[y][x]) continue;
        cands.push({ x, y });
      }
    }
    for (let gap = minGap; gap >= 3; gap -= 1) {
      const pool = shuffle(cands.slice(), rng);
      const picked = [], grids = [];
      for (const c of pool) {
        if (picked.length === count) break;
        if (grids.every((g) => g[c.y][c.x] >= gap)) { picked.push(c); grids.push(bfs(world.cells, c)); }
      }
      if (picked.length === count) return picked;
    }
    throw new Error('cannot place items');
  }

  function generateWorld(seed, size) {
    size = size || 31;
    const rng = makeRng(seed);
    const cells = carveMaze(size, rng);

    // rooms 5x5: class, pcroom, koch
    const rooms = [];
    const names = ['class', 'pcroom', 'koch'];
    const maxStart = size - 6;
    for (const name of names) {
      let placed = false;
      for (let tries = 0; tries < 500 && !placed; tries++) {
        const x0 = 1 + 2 * Math.floor(rng() * Math.floor(maxStart / 2));
        const y0 = 1 + 2 * Math.floor(rng() * Math.floor(maxStart / 2));
        if (x0 + 4 > size - 2 || y0 + 4 > size - 2) continue;
        if (x0 < 8 && y0 < 8) continue;
        if (rooms.some((r) => x0 < r.x0 + 7 && x0 + 5 > r.x0 - 2 && y0 < r.y0 + 7 && y0 + 5 > r.y0 - 2)) continue;
        rooms.push({ name, x0, y0 });
        placed = true;
      }
      if (!placed) throw new Error('cannot place room ' + name);
    }

    const zones = Array.from({ length: size }, () => Array(size).fill(null));
    for (const r of rooms) {
      for (let y = r.y0; y < r.y0 + 5; y++) {
        for (let x = r.x0; x < r.x0 + 5; x++) {
          cells[y][x] = 1;
          zones[y][x] = r.name;
        }
      }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (cells[y][x] === 1 && !zones[y][x]) zones[y][x] = 'yellow';
      }
    }

    const spawn = { x: 1, y: 1 };
    const dist = bfs(cells, spawn);

    // exit: farthest yellow floor cell
    let exit = null, best = -1;
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (zones[y][x] === 'yellow' && dist[y][x] > best) { best = dist[y][x]; exit = { x, y }; }
      }
    }

    const room = (n) => rooms.find((r) => r.name === n);
    const hideSpots = [];
    const pcs = [];
    const enemySpawns = [];
    for (const r of rooms) {
      hideSpots.push({ x: r.x0 + 4, y: r.y0 + 4 });
    }
    const pr = room('pcroom'), kr = room('koch'), cr = room('class');
    pcs.push({ x: pr.x0, y: pr.y0 }, { x: pr.x0 + 2, y: pr.y0 }, { x: pr.x0 + 4, y: pr.y0 }, { x: pr.x0, y: pr.y0 + 2 });
    pcs.push({ x: kr.x0, y: kr.y0 });

    // dead ends in the yellow maze = hide spots
    const deadEnds = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (zones[y][x] !== 'yellow') continue;
        if (x === spawn.x && y === spawn.y) continue;
        if (exit && x === exit.x && y === exit.y) continue;
        const open = DIRS4.filter(([dx, dy]) => cells[y + dy][x + dx] === 1).length;
        if (open === 1) deadEnds.push({ x, y });
      }
    }
    shuffle(deadEnds, rng);
    while (hideSpots.length < 8 && deadEnds.length) hideSpots.push(deadEnds.pop());
    // fallback if maze had too few dead ends
    const yellowFloor = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (zones[y][x] === 'yellow' && dist[y][x] >= 6) yellowFloor.push({ x, y });
      }
    }
    shuffle(yellowFloor, rng);
    while (hideSpots.length < 8 && yellowFloor.length) hideSpots.push(yellowFloor.pop());

    // enemies
    enemySpawns.push({ x: cr.x0 + 2, y: cr.y0 + 2, type: 'teacher' });
    enemySpawns.push({ x: pr.x0 + 2, y: pr.y0 + 2, type: 'standofer' });
    enemySpawns.push({ x: kr.x0 + 2, y: kr.y0 + 2, type: 'kochfam' });
    const far = yellowFloor.filter((p) => dist[p.y][p.x] >= 10 && p.x + p.y >= 10);
    shuffle(far, rng);
    for (const type of ['teacher', 'standofer', 'kochfam']) {
      const p = far.pop();
      if (p) enemySpawns.push({ x: p.x, y: p.y, type });
    }

    const world = { kind: 'yellow', size, cells, spawn, exit, zones, hideSpots, pcs, enemySpawns, rooms, items: [] };
    world.items = placeItems(world, rng, 3, 8);
    return world;
  }

  // Pick spaced cells from a candidate list (greedy, manhattan spacing).
  function pickSpaced(cands, count, spacing, taken) {
    const out = [];
    for (const c of cands) {
      if (out.length === count) break;
      if (out.every((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) >= spacing)) out.push(c);
    }
    return out;
  }

  // Corridors with windows (level 1): an indoor maze scaled 2x, so hallways and walls are both 2 cells thick.
  function generateCorridors(seed, size) {
    size = size || 42;
    if (size % 4 !== 2) throw new Error('size must be 4k+2');
    const rng = makeRng(seed * 7919 + 13);
    const mz = carveMaze(size / 2, rng, { loops: 0.3, halls: false });
    const cells = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => mz[y >> 1][x >> 1]));
    const spawn = { x: 2, y: 2 };
    const zones = cells.map((r) => r.map((v) => (v === 1 ? 'hall' : null)));
    const dist = bfs(cells, spawn);
    const hasWall = (x, y) => DIRS4.some(([dx, dy]) => cells[y + dy][x + dx] === 0);

    let exit = null, best = -1;
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (cells[y][x] === 1 && hasWall(x, y) && dist[y][x] > best) { best = dist[y][x]; exit = { x, y }; }
      }
    }

    const floor = [];
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) if (cells[y][x] === 1 && dist[y][x] >= 6) floor.push({ x, y });
    const same = (p, q) => p.x === q.x && p.y === q.y;
    const hideSpots = pickSpaced(shuffle(floor.filter((c) => hasWall(c.x, c.y) && !same(c, exit)), rng), 10, 4);
    const types = ['teacher', 'standofer', 'kochfam'];
    const enemyCands = shuffle(floor.filter((c) => dist[c.y][c.x] >= 14 && Math.abs(c.x - spawn.x) + Math.abs(c.y - spawn.y) >= 8 && !same(c, exit) && !hideSpots.some((h) => same(h, c))), rng);
    const enemySpawns = pickSpaced(enemyCands, 8, 7).map((c, i) => ({ x: c.x, y: c.y, type: types[i % 3] }));

    const world = { kind: 'corridors', size, cells, spawn, exit, zones, hideSpots, pcs: [], enemySpawns, rooms: [], items: [] };
    world.items = placeItems(world, rng, 3, 10);
    return world;
  }

  // Poolrooms (level 2): maze corridors, tiled halls with pools (water is walkable) and pillars.
  function generatePool(seed, size) {
    size = size || 35;
    const rng = makeRng(seed * 104729 + 7);
    const cells = carveMaze(size, rng, { loops: 0.12, halls: false });
    const water = Array.from({ length: size }, () => Array(size).fill(0));
    const halls = [];
    for (let tries = 0; tries < 800 && halls.length < 3; tries++) {
      const x0 = 1 + 2 * Math.floor(rng() * Math.floor((size - 8) / 2));
      const y0 = 1 + 2 * Math.floor(rng() * Math.floor((size - 8) / 2));
      if (x0 + 6 > size - 2 || y0 + 6 > size - 2 || (x0 < 9 && y0 < 9)) continue;
      if (halls.some((h) => x0 < h.x0 + 9 && x0 + 7 > h.x0 - 2 && y0 < h.y0 + 9 && y0 + 7 > h.y0 - 2)) continue;
      halls.push({ name: 'hall', x0, y0 });
    }
    if (halls.length < 3) throw new Error('cannot place halls');
    const inHall = Array.from({ length: size }, () => Array(size).fill(false));
    for (const h of halls) {
      for (let y = h.y0; y < h.y0 + 7; y++) for (let x = h.x0; x < h.x0 + 7; x++) { cells[y][x] = 1; inHall[y][x] = true; }
      for (let y = h.y0 + 1; y < h.y0 + 6; y++) for (let x = h.x0 + 1; x < h.x0 + 6; x++) water[y][x] = 1;
    }
    const spawn = { x: 1, y: 1 };
    const total = () => cells.reduce((n, r) => n + r.reduce((a, v) => a + v, 0), 0);
    const reach = () => bfs(cells, spawn).reduce((n, r) => n + r.filter((v) => v >= 0).length, 0);

    // pillars on the walkway ring, only where the floor stays connected
    const pillars = [];
    for (const h of halls) {
      const spots = [[0, 0], [6, 0], [0, 6], [6, 6], [3, 0], [3, 6], [0, 3], [6, 3]];
      let n = 0;
      for (const [dx, dy] of spots) {
        if (n === 4) break;
        const x = h.x0 + dx, y = h.y0 + dy;
        cells[y][x] = 0;
        if (reach() !== total()) { cells[y][x] = 1; continue; }
        pillars.push({ x, y }); n++;
      }
    }

    // water strips in corridors
    const dist0 = bfs(cells, spawn);
    for (let k = 0, tries = 0; k < 6 && tries < 300; tries++) {
      const x = 1 + Math.floor(rng() * (size - 4)), y = 1 + Math.floor(rng() * (size - 4));
      const horiz = rng() < 0.5;
      const run = [0, 1, 2].map((i) => ({ x: x + (horiz ? i : 0), y: y + (horiz ? 0 : i) }));
      if (run.every((c) => c.x < size - 1 && c.y < size - 1 && cells[c.y][c.x] === 1 && !inHall[c.y][c.x] && dist0[c.y][c.x] >= 6)) {
        run.forEach((c) => { water[c.y][c.x] = 1; });
        k++;
      }
    }

    const zones = cells.map((r, y) => r.map((v, x) => (v === 1 ? (inHall[y][x] ? 'hall' : 'corridor') : null)));
    const dist = bfs(cells, spawn);
    let exit = null, best = -1;
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) if (cells[y][x] === 1 && !water[y][x] && dist[y][x] > best) { best = dist[y][x]; exit = { x, y }; }
    }
    const dry = [];
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) if (cells[y][x] === 1 && !water[y][x] && dist[y][x] >= 6) dry.push({ x, y });
    const same = (p, q) => p.x === q.x && p.y === q.y;
    const deadEnds = dry.filter((c) => !inHall[c.y][c.x] && !same(c, exit) && DIRS4.filter(([dx, dy]) => cells[c.y + dy][c.x + dx] === 1).length === 1);
    const hideSpots = pickSpaced(shuffle(deadEnds, rng).concat(shuffle(dry.filter((c) => !same(c, exit)), rng)), 8, 4);
    const types = ['teacher', 'standofer', 'kochfam'];
    const enemyCands = shuffle(dry.filter((c) => dist[c.y][c.x] >= 10 && Math.abs(c.x - spawn.x) + Math.abs(c.y - spawn.y) >= 8 && !same(c, exit) && !hideSpots.some((h) => same(h, c))), rng);
    const enemySpawns = pickSpaced(enemyCands, 7, 6).map((c, i) => ({ x: c.x, y: c.y, type: types[i % 3] }));

    const world = { kind: 'pool', size, cells, spawn, exit, zones, hideSpots, pcs: [], enemySpawns, rooms: halls, items: [], water, pillars };
    world.items = placeItems(world, rng, 3, 8);
    return world;
  }

  const LEVELS = [
    { id: 'yellow', name: 'Уровень 0: Жёлтые комнаты', itemName: 'предохранитель', itemsNeeded: 3, speedMul: 1, sight: 8, hear: 0 },
    { id: 'corridors', name: 'Уровень 1: Коридоры с окнами', itemName: 'ключ-карта', itemsNeeded: 3, speedMul: 1.15, sight: 10, hear: 0 },
    { id: 'pool', name: 'Уровень 2: Бассейны', itemName: 'вентиль', itemsNeeded: 3, speedMul: 1.3, sight: 9, hear: 7 },
  ];

  function generateLevel(level, seed) {
    if (level === 0) return generateWorld(seed);
    if (level === 1) return generateCorridors(seed);
    if (level === 2) return generatePool(seed);
    throw new Error('unknown level ' + level);
  }

  // ---------- Collision ----------
  // positions are continuous; cell (cx,cy) spans [cx,cx+1) x [cy,cy+1)
  function isWall(cells, x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cy < 0 || cx < 0 || cy >= cells.length || cx >= cells[0].length) return true;
    return cells[cy][cx] !== 1;
  }

  function hits(cells, x, y, r) {
    return isWall(cells, x - r, y - r) || isWall(cells, x + r, y - r) ||
      isWall(cells, x - r, y + r) || isWall(cells, x + r, y + r);
  }

  function moveWithCollision(cells, pos, dx, dy, radius) {
    let x = pos.x, y = pos.y;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (!hits(cells, x + sx, y, radius)) x += sx;
      if (!hits(cells, x, y + sy, radius)) y += sy;
    }
    return { x, y };
  }

  function canSee(cells, from, to, range) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d > range) return false;
    const n = Math.ceil(d / 0.1);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (isWall(cells, from.x + dx * t, from.y + dy * t)) return false;
    }
    return true;
  }

  // ---------- Enemies ----------
  const SPEEDS = { teacher: 1.6, standofer: 2.2, kochfam: 1.9 };
  const SIGHT = 8;
  const HIDDEN_NOTICE = 1.5;
  const ENEMY_RADIUS = 0.3;

  function makeEnemy(spawn) {
    return {
      type: spawn.type,
      x: spawn.x + 0.5,
      y: spawn.y + 0.5,
      speed: SPEEDS[spawn.type],
      state: 'patrol',
      target: null,
      prev: null,
      lastSeen: null,
      searchT: 0,
    };
  }

  function moveToward(cells, e, t, step) {
    const dx = t.x - e.x, dy = t.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= step) { e.x = t.x; e.y = t.y; return true; }
    const p = moveWithCollision(cells, e, (dx / d) * step, (dy / d) * step, ENEMY_RADIUS);
    e.x = p.x; e.y = p.y;
    return false;
  }

  function patrolStep(cells, e, dt, rng) {
    if (!e.target) {
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      let opts = DIRS4.map(([dx, dy]) => ({ x: cx + dx, y: cy + dy }))
        .filter((c) => cells[c.y] && cells[c.y][c.x] === 1);
      const fresh = opts.filter((c) => !e.prev || c.x !== e.prev.x || c.y !== e.prev.y);
      if (fresh.length) opts = fresh;
      if (!opts.length) return;
      const pick = opts[Math.floor(rng() * opts.length)];
      e.prev = { x: cx, y: cy };
      e.target = { x: pick.x + 0.5, y: pick.y + 0.5 };
    }
    if (moveToward(cells, e, e.target, e.speed * dt)) e.target = null;
  }

  // players: one {x,y,hidden} or an array. opts: {sight, speedMul, noises: [{x,y,r}]}
  function stepEnemy(cells, e, players, dt, rng, opts) {
    opts = opts || {};
    const sight = opts.sight || SIGHT;
    const mul = opts.speedMul || 1;
    const list = Array.isArray(players) ? players : [players];
    let target = null, td = Infinity;
    for (const p of list) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < td && canSee(cells, e, p, sight) && (!p.hidden || d < HIDDEN_NOTICE)) { target = p; td = d; }
    }
    if (target) {
      e.state = 'chase';
      e.lastSeen = { x: target.x, y: target.y };
      e.searchT = 0;
    } else {
      if (e.state === 'chase') { e.state = 'search'; e.searchT = 0; }
      for (const n of opts.noises || []) {
        if (Math.hypot(n.x - e.x, n.y - e.y) <= n.r) {
          e.state = 'search'; e.lastSeen = { x: n.x, y: n.y }; e.searchT = 0;
          break;
        }
      }
    }
    if (e.state === 'chase') {
      moveToward(cells, e, e.lastSeen, e.speed * 1.5 * mul * dt);
    } else if (e.state === 'search') {
      e.searchT += dt;
      const reached = moveToward(cells, e, e.lastSeen, e.speed * mul * dt);
      if (reached || e.searchT > 4) { e.state = 'patrol'; e.target = null; }
    } else {
      patrolStep(cells, e, dt * mul, rng);
    }
  }

  function isCaughtAny(e, players, catchDist) {
    for (let i = 0; i < players.length; i++) if (isCaught(e, players[i], catchDist)) return i;
    return -1;
  }

  function isCaught(e, player, catchDist) {
    return Math.hypot(player.x - e.x, player.y - e.y) < (catchDist || 0.6);
  }

  // ---------- Story ----------
  const NEXT = {
    school: 'walk', walk: 'home', home: 'toilet', toilet: 'fall', fall: 'backrooms',
    backrooms: 'backrooms', asylum: 'end', end: 'end',
  };
  // DLC "Вторая личность": one day of Koch's life (his 14th birthday). Morning, breakfast, the yard, the canteen,
  // the lesson, the evening, the PC, a childhood dream, a night where the house falls apart, then the hospital.
  // No enemies: k_night is a loop of the same house, story.level counts the loops (0..NIGHT_LOOPS-1).
  const NIGHT_LOOPS = 4;
  const DLC_ORDER = ['k_morning', 'k_kitchen', 'k_yard', 'k_break', 'k_school', 'k_home', 'k_pc', 'k_dream', 'k_night', 'k_end', 'k_hall', 'k_final'];
  const NEXT_DLC = { end: 'end' };
  DLC_ORDER.forEach((st, i) => { NEXT_DLC[st] = DLC_ORDER[i + 1] || 'end'; });
  const MODES = {
    main: { next: NEXT, first: 'school', play: 'backrooms', finale: 'asylum', level: 0 },
    dlc: { next: NEXT_DLC, first: 'k_morning', play: null, finale: 'k_end', level: 0 },
  };

  function createStory(levels, mode) {
    const s = {
      deaths: 0,
      reset(m) {
        const md = MODES[m] ? m : 'main';
        const cfg = MODES[md];
        s.mode = md; s.state = cfg.first; s.level = cfg.level; s.deaths = 0;
        s.play = cfg.play; s.finale = cfg.finale;
        s.levels = md === 'dlc' ? NIGHT_LOOPS : (levels || 1);
        return s;
      },
      advance() { s.state = MODES[s.mode].next[s.state] || s.state; return s.state; },
      onCaught() {
        if (s.play && s.state === s.play) s.deaths++;
        return s.state;
      },
      onExit() {
        if (s.play && s.state === s.play) {
          if (s.level < s.levels - 1) s.level++;
          else s.state = s.finale;
        }
        return s.state;
      },
      resolve(ev) {
        if (ev.atExit) return s.onExit();
        if (ev.caught) return s.onCaught();
        return s.state;
      },
    };
    return s.reset(mode);
  }

  function createProgress(need) {
    const got = new Set();
    return {
      need, got,
      collect(id) { if (got.has(id)) return false; got.add(id); return true; },
      count() { return got.size; },
      ready() { return got.size >= need; },
      toArray() { return [...got].sort((a, b) => a - b); },
      fromArray(arr) { got.clear(); for (const id of arr) got.add(id); },
    };
  }

  const api = {
    makeRng, generateWorld, generateCorridors, generatePool, bfs, LEVELS, NIGHT_LOOPS, DLC_ORDER, placeItems, generateLevel,
    moveWithCollision, canSee, makeEnemy, stepEnemy, isCaught, isCaughtAny,
    createStory, createProgress,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KochLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
