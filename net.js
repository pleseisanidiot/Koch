(function (root) {
  'use strict';

  // ---------- Room codes ----------
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function makeRoomCode(rng) {
    let s = '';
    for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
    return s;
  }

  function normalizeCode(s) {
    if (typeof s !== 'string') return null;
    const c = s.replace(/\s+/g, '').toUpperCase();
    if (c.length !== 5) return null;
    for (const ch of c) if (!ALPHABET.includes(ch)) return null;
    return c;
  }

  const peerId = (code) => 'kochrooms-' + code.toLowerCase();

  // ---------- Message validation (peer data is untrusted) ----------
  const STATES = ['school', 'walk', 'home', 'toilet', 'fall', 'backrooms', 'asylum', 'end', 'k_morning', 'k_kitchen', 'k_yard', 'k_break', 'k_school', 'k_home', 'k_pc', 'k_dream', 'k_night', 'k_end', 'k_hall', 'k_final'];
  const ACTS = ['item', 'exit', 'hide', 'pc', 'wc', 'toilet', 'task'];
  const MAX_COORD = 500;

  const num = (v, lim = MAX_COORD) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const flag = (v) => v === true || v === 1 ? true : (v === false || v === 0 ? false : null);

  function validateMsg(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.type !== 'string') return null;
    switch (raw.type) {
      case 'hello':
        if (raw.proto !== 1) return null;
        if (raw.mode !== undefined && raw.mode !== 'main' && raw.mode !== 'dlc') return null;
        return { type: 'hello', proto: 1, mode: raw.mode === 'dlc' ? 'dlc' : 'main' };
      case 'bye':
        return { type: 'bye' };
      case 'pos': {
        const hid = flag(raw.hid);
        if (!num(raw.x) || !num(raw.y) || !num(raw.yaw, 100) || !num(raw.pitch, 100) || hid === null) return null;
        return { type: 'pos', x: raw.x, y: raw.y, yaw: raw.yaw, pitch: raw.pitch, hid };
      }
      case 'act': {
        if (!ACTS.includes(raw.kind)) return null;
        if (raw.id !== undefined && !int(raw.id, 0, 63)) return null;
        const m = { type: 'act', kind: raw.kind };
        if (raw.id !== undefined) m.id = raw.id;
        return m;
      }
      case 'chat':
        return int(raw.i, 0, 3) ? { type: 'chat', i: raw.i } : null;
      case 'scene': {
        if (!STATES.includes(raw.state) || !int(raw.level, 0, 3) || !int(raw.seed, 0, 4294967295) || !int(raw.sid, 0, 1e9)) return null;
        const m = { type: 'scene', state: raw.state, level: raw.level, seed: raw.seed, sid: raw.sid };
        if (raw.color !== undefined) {
          if (typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(raw.color)) return null;
          m.color = raw.color;
        }
        return m;
      }
      case 'snap': {
        if (!num(raw.t, 1e12) || !Array.isArray(raw.hp) || raw.hp.length !== 5) return null;
        const [x, y, yaw, pitch, hid] = raw.hp;
        const h = flag(hid);
        if (!num(x) || !num(y) || !num(yaw, 100) || !num(pitch, 100) || h === null) return null;
        if (!Array.isArray(raw.en) || raw.en.length > 64 || !Array.isArray(raw.it) || raw.it.length > 64) return null;
        for (const e of raw.en) {
          if (!Array.isArray(e) || e.length !== 3 || !num(e[0]) || !num(e[1]) || !int(e[2], 0, 2)) return null;
        }
        for (const id of raw.it) if (!int(id, 0, 63)) return null;
        if (raw.ex !== 0 && raw.ex !== 1) return null;
        return { type: 'snap', t: raw.t, hp: [x, y, yaw, pitch, h], en: raw.en.map((e) => [e[0], e[1], e[2]]), it: raw.it.slice(), ex: raw.ex };
      }
      case 'say': {
        if (typeof raw.text !== 'string' || raw.text.length > 120 || !num(raw.sec, 1e6)) return null;
        return { type: 'say', text: raw.text, sec: Math.max(0.5, Math.min(10, raw.sec)) };
      }
      case 'caught':
        return raw.who === 'host' || raw.who === 'guest' ? { type: 'caught', who: raw.who } : null;
      default:
        return null;
    }
  }

  // ---------- Interpolation of remote positions ----------
  function Interp(delayMs) {
    this.delay = delayMs === undefined ? 100 : delayMs;
    this.samples = [];
  }
  Interp.prototype.push = function (t, p) {
    const last = this.samples[this.samples.length - 1];
    if (last && t <= last.t) return;
    this.samples.push({ t, x: p.x, y: p.y, yaw: p.yaw });
    if (this.samples.length > 20) this.samples.shift();
  };
  Interp.prototype.sample = function (now) {
    const s = this.samples;
    if (!s.length) return null;
    const t = now - this.delay;
    if (t <= s[0].t) return { x: s[0].x, y: s[0].y, yaw: s[0].yaw };
    const last = s[s.length - 1];
    if (t >= last.t) return { x: last.x, y: last.y, yaw: last.yaw };
    let i = 0;
    while (s[i + 1].t <= t) i++;
    const a = s[i], b = s[i + 1];
    const f = (t - a.t) / (b.t - a.t);
    const d = ((b.yaw - a.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, yaw: a.yaw + d * f };
  };

  // ---------- PeerJS adapter (browser only) ----------
  // o: {role:'host'|'guest', code, onReady, onOpen, onMsg, onClose, onError}
  function createLink(o) {
    const Peer = root.Peer;
    if (!Peer) { if (o.onError) o.onError('nopeerjs'); return null; }
    let peer, conn = null;
    const wire = (c) => {
      conn = c;
      c.on('open', () => { if (o.onOpen) o.onOpen(); });
      c.on('data', (d) => { const m = validateMsg(d); if (m && o.onMsg) o.onMsg(m); });
      c.on('close', () => { if (conn === c) conn = null; if (o.onClose) o.onClose(); });
      c.on('error', (e) => { if (o.onError) o.onError(String(e && e.type || e)); });
    };
    if (o.role === 'host') {
      peer = new Peer(peerId(o.code));
      peer.on('open', () => { if (o.onReady) o.onReady(); });
      peer.on('connection', (c) => {
        if (conn && conn.open) {            // room is full: refuse politely
          c.on('open', () => { c.send({ type: 'bye' }); setTimeout(() => { try { c.close(); } catch (e) { /* gone */ } }, 300); });
          return;
        }
        wire(c);
      });
      peer.on('error', (e) => { if (o.onError) o.onError(e.type === 'unavailable-id' ? 'taken' : e.type); });
    } else {
      peer = new Peer();
      peer.on('open', () => wire(peer.connect(peerId(o.code), { reliable: true, serialization: 'json' })));
      peer.on('error', (e) => { if (o.onError) o.onError(e.type === 'peer-unavailable' ? 'notfound' : e.type); });
    }
    return {
      send(m) { if (conn && conn.open) conn.send(m); },
      get open() { return !!(conn && conn.open); },
      close() {
        try { if (conn) conn.close(); } catch (e) { /* ignore */ }
        try { peer.destroy(); } catch (e) { /* ignore */ }
      },
    };
  }

  const api = { ALPHABET, makeRoomCode, normalizeCode, peerId, validateMsg, Interp, createLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KochNet = api;
})(typeof window !== 'undefined' ? window : globalThis);
