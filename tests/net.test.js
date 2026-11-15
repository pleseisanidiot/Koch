const test = require('node:test');
const assert = require('node:assert');
const N = require('../net.js');
const L = require('../logic.js');

test('makeRoomCode is 5 chars from alphabet and deterministic per rng', () => {
  const a = N.makeRoomCode(L.makeRng(5)), b = N.makeRoomCode(L.makeRng(5));
  assert.strictEqual(a, b);
  assert.match(a, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
});

test('normalizeCode accepts lowercase and spaces, rejects bad codes', () => {
  assert.strictEqual(N.normalizeCode(' ab c23 '), 'ABC23');
  assert.strictEqual(N.normalizeCode('ABCD'), null);
  assert.strictEqual(N.normalizeCode('ABCD0'), null);
  assert.strictEqual(N.normalizeCode('ABCDEF'), null);
  assert.strictEqual(N.normalizeCode(null), null);
});

test('peerId prefixes and lowercases', () => {
  assert.strictEqual(N.peerId('ABC23'), 'kochrooms-abc23');
});

test('validateMsg accepts a valid pos and normalizes it', () => {
  const m = N.validateMsg({ type: 'pos', x: 3.5, y: 4, yaw: 1, pitch: 0, hid: 1, junk: 'x' });
  assert.deepStrictEqual(m, { type: 'pos', x: 3.5, y: 4, yaw: 1, pitch: 0, hid: true });
});

test('validateMsg rejects NaN x', () => {
  assert.strictEqual(N.validateMsg({ type: 'pos', x: NaN, y: 1, yaw: 0, pitch: 0, hid: 0 }), null);
});

test('validateMsg rejects Infinity yaw and huge coordinates', () => {
  assert.strictEqual(N.validateMsg({ type: 'pos', x: 1, y: 1, yaw: Infinity, pitch: 0, hid: 0 }), null);
  assert.strictEqual(N.validateMsg({ type: 'pos', x: 1e9, y: 1, yaw: 0, pitch: 0, hid: 0 }), null);
});

test('validateMsg rejects unknown type, null, strings, arrays', () => {
  assert.strictEqual(N.validateMsg({ type: 'evil' }), null);
  assert.strictEqual(N.validateMsg(null), null);
  assert.strictEqual(N.validateMsg('pos'), null);
  assert.strictEqual(N.validateMsg([1, 2]), null);
  assert.strictEqual(N.validateMsg({}), null);
});

test('validateMsg rejects snap with 65 enemies and bad enemy state', () => {
  const en = Array.from({ length: 65 }, () => [1, 1, 0]);
  assert.strictEqual(N.validateMsg({ type: 'snap', t: 1, hp: [1, 1, 0, 0, 0], en, it: [], ex: 0 }), null);
  assert.strictEqual(N.validateMsg({ type: 'snap', t: 1, hp: [1, 1, 0, 0, 0], en: [[1, 1, 9]], it: [], ex: 0 }), null);
});

test('validateMsg accepts a valid snap', () => {
  const m = N.validateMsg({ type: 'snap', t: 100, hp: [1, 2, 0.5, 0, 0], en: [[1, 2, 1], [3, 4, 0]], it: [0, 2], ex: 1 });
  assert.ok(m);
  assert.deepStrictEqual(m.en, [[1, 2, 1], [3, 4, 0]]);
  assert.deepStrictEqual(m.it, [0, 2]);
  assert.strictEqual(m.ex, 1);
});

test('validateMsg rejects 121-char say and clamps sec', () => {
  assert.strictEqual(N.validateMsg({ type: 'say', text: 'a'.repeat(121), sec: 3 }), null);
  assert.strictEqual(N.validateMsg({ type: 'say', text: 'ok', sec: 999 }).sec, 10);
  assert.strictEqual(N.validateMsg({ type: 'say', text: 'ok', sec: 0 }).sec, 0.5);
});

test('validateMsg scene / act / chat / caught / hello / bye', () => {
  assert.ok(N.validateMsg({ type: 'scene', state: 'backrooms', level: 2, seed: 123, sid: 4 }));
  assert.strictEqual(N.validateMsg({ type: 'scene', state: 'nope', level: 0, seed: 1, sid: 1 }), null);
  assert.strictEqual(N.validateMsg({ type: 'scene', state: 'backrooms', level: 5, seed: 1, sid: 1 }), null);
  assert.ok(N.validateMsg({ type: 'act', kind: 'item', id: 2 }));
  assert.strictEqual(N.validateMsg({ type: 'act', kind: 'item', id: -1 }), null);
  assert.strictEqual(N.validateMsg({ type: 'act', kind: 'hack' }), null);
  assert.ok(N.validateMsg({ type: 'chat', i: 3 }));
  assert.strictEqual(N.validateMsg({ type: 'chat', i: 4 }), null);
  assert.ok(N.validateMsg({ type: 'caught', who: 'guest' }));
  assert.strictEqual(N.validateMsg({ type: 'caught', who: 'me' }), null);
  assert.ok(N.validateMsg({ type: 'hello', proto: 1 }));
  assert.strictEqual(N.validateMsg({ type: 'hello', proto: 2 }), null);
  assert.strictEqual(N.validateMsg({ type: 'hello', proto: 1 }).mode, 'main');
  assert.strictEqual(N.validateMsg({ type: 'hello', proto: 1, mode: 'dlc' }).mode, 'dlc');
  assert.strictEqual(N.validateMsg({ type: 'hello', proto: 1, mode: 'x' }), null);
  assert.ok(N.validateMsg({ type: 'scene', state: 'k_night', level: 3, seed: 1, sid: 1 }));
  for (const st of ['k_kitchen', 'k_yard', 'k_break', 'k_dream', 'k_hall', 'k_final']) assert.ok(N.validateMsg({ type: 'scene', state: st, level: 0, seed: 1, sid: 1 }), st);
  assert.ok(N.validateMsg({ type: 'act', kind: 'task', id: 1 }));
  assert.ok(N.validateMsg({ type: 'bye' }));
});

test('Interp midpoint with delay', () => {
  const i = new N.Interp(100);
  i.push(1000, { x: 0, y: 0, yaw: 0 });
  i.push(1100, { x: 10, y: 20, yaw: 1 });
  const s = i.sample(1150);          // target time 1050 -> halfway
  assert.ok(Math.abs(s.x - 5) < 1e-9 && Math.abs(s.y - 10) < 1e-9 && Math.abs(s.yaw - 0.5) < 1e-9);
});

test('Interp yaw wraps through pi the short way', () => {
  const i = new N.Interp(0);
  i.push(0, { x: 0, y: 0, yaw: 3.0 });
  i.push(100, { x: 0, y: 0, yaw: -3.0 });
  const y = i.sample(50).yaw;
  assert.ok(Math.abs(Math.abs(y) - Math.PI) < 0.2, 'yaw ' + y);
});

test('Interp holds last sample, null when empty, caps at 20', () => {
  const i = new N.Interp(0);
  assert.strictEqual(i.sample(5), null);
  for (let k = 0; k < 30; k++) i.push(k * 10, { x: k, y: 0, yaw: 0 });
  assert.strictEqual(i.samples.length, 20);
  assert.strictEqual(i.sample(99999).x, 29);
  assert.strictEqual(i.sample(-5).x, 10);
});
