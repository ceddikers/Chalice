// =========================================================================
// BOSS_HUSH_RIG.JS — how Hush looks: a towering porcelain marionette. Logic is in boss_hush.js.
//
// A real 2.5D rig like Ignis: every joint is a point in her own frame (forward / side / up), projected with the arena tilt and
// depth-sorted, so she turns and bends instead of flipping a sprite. Style references (looked up 2026-10-18): kintsugi, the gold
// lacquer repair of broken ceramics (thin branching gold seams over glossy white); bisque dolls (painted rosy cheeks, glass
// eyes, a tiny painted mouth, ball joints); Lies of P's puppets and Little Nightmares' toy-scale nursery (a cold blue night with
// one warm lamp). Traits copied: glossy white with cool blue-grey shadow and one sharp highlight; Delft-blue painted trim; gold
// seams that glow brighter as she breaks; ribbon-threaded ball joints; marionette strings rising out of the dark.
//
//   bonnet with a frilled brim and ribbon tails · big porcelain head (glass eyes, painted smile) · lace collar · bodice ·
//   a bell skirt with painted blue trim and a scalloped petticoat · long jointed arms · a giant silver sewing needle ·
//   a wooden spool at her hip · a brass wind-up key in her back.
// =========================================================================
(function () {
  if (typeof HushBoss === 'undefined') return;
  const P = HushBoss.prototype;
  const TAU = Math.PI * 2;
  const T = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.58);
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (t) => { t = c01(t); return t * t * (3 - 2 * t); };
  const now = () => performance.now() / 1000;

  // ---- body measurements (her units) ----------------------------------------------------------------------------------------
  const PEL = 42, WAIST = 50, CHEST = 60, SHO = 68.5, NECK = 72.5, HEADC = 82, HEADR = 10.2;
  const SHO_W = 7.0, HIP_W = 3.4, UPPER = 14, FORE = 13.5, THIGH = 21, SHIN = 21, NEEDLE = 62;

  const COL = {
    china: '#f3f0e8', chinaMid: '#d7dbe6', chinaDk: '#8d97b0', ink: 'rgba(20,24,46,0.92)',
    delft: '#2a4a8f', delftLt: '#5d7fc4', blush: 'rgba(236,120,140,0.55)', lip: '#c2384f',
    gown: '#e9e4f2', gownDk: '#a7a2c4', gownShade: '#6f6a92', petticoat: '#fbf8f1',
    gold: '#f5c542', goldHot: '#fff2b8', brass: '#c9973a', brassDk: '#6e4f17', wood: '#9a6a3c',
    hair: '#f1dca0', hairDk: '#c9a95a', ribbon: '#e58aa8', ribbonDk: '#a24a6c', iris: '#2f4f9e', steel: '#e7ecf3', steelDk: '#8994a8'
  };

  // ---- poses ----------------------------------------------------------------------------------------------------------------
  // up: pelvis lift · lean · twist (torso yaw) · sway · r*/l*: hand targets · na/np: needle yaw / pitch in her frame ·
  // ht: head tilt (roll) · hn: nod · hy: head turn · kn: crumple/kneel · fl: skirt flare · sit: seated in the chair
  const BASE = { up: 0, lean: 0, twist: 0, sway: 0, rf: 8, rs: 12, ru: 40, lf: 4, ls: -11, lu: 44, na: 0.25, np: -1.25, ht: 0.08, hn: 0, hy: 0, kn: 0, fl: 0, sit: 0 };
  const mk = (o) => Object.assign({}, BASE, o);
  const PS = {
    idle: mk({}),
    needleReady: mk({ rf: -6, rs: 9, ru: 62, na: 0, np: 0, lean: -2, twist: 0.4, lf: 8, ls: -12, lu: 52 }),
    thrust: mk({ rf: 30, rs: 4, ru: 58, na: 0, np: -0.05, lean: 6, twist: -0.2, lf: -4, ls: -12, lu: 48 }),
    sweepWind: mk({ rf: 4, rs: -14, ru: 56, na: -1.6, np: 0, twist: -0.7 }),
    sweep: mk({ rf: 18, rs: 16, ru: 54, na: 1.4, np: 0, twist: 0.6, lean: 3 }),
    rockFwd: mk({ lean: 9, up: -3, rf: 20, rs: 10, ru: 40, na: 0.2, np: -0.8, lf: 18, ls: -8, lu: 40, fl: 0.3 }),
    rockBack: mk({ lean: -8, up: -2, rf: -10, rs: 12, ru: 46, na: 3.0, np: -0.6, lf: -10, ls: -10, lu: 46, fl: 0.3 }),
    spinWind: mk({ rf: 2, rs: 10, ru: 92, lf: 2, ls: -10, lu: 92, na: 0, np: 1.4, up: 3, ht: 0 }),
    spin: mk({ rf: 0, rs: 30, ru: 70, lf: 0, ls: -30, lu: 70, np: 0, na: 1.57, fl: 1, up: 2 }),
    ribbonWind: mk({ lf: -8, ls: -14, lu: 72, twist: -0.6, rf: 8, rs: 12, ru: 44 }),
    ribbonLash: mk({ lf: 26, ls: -2, lu: 60, twist: 0.4, lean: 4 }),
    tilt: mk({ rf: 6, rs: 13, ru: 34, lf: 6, ls: -13, lu: 34, na: 0.2, np: -1.4 }),
    keyTurn: mk({ lf: -10, ls: -3, lu: 62, twist: -0.25, hy: 0.4 }),
    lassoWind: mk({ lf: 0, ls: -14, lu: 98, twist: -0.3 }),
    lassoThrow: mk({ lf: 28, ls: -3, lu: 64, lean: 4 }),
    jab: mk({ rf: 28, rs: 6, ru: 50, na: 0, np: -0.2, lean: 7 }),
    sew: mk({ rf: 22, rs: 4, ru: 30, na: 0, np: -1.3, lean: 7, up: -4 }),
    hang: mk({ rf: 3, rs: 12, ru: 28, lf: 3, ls: -12, lu: 28, ht: 0.6, hn: 0.4, na: 0, np: -1.5 }),
    crumple: mk({ kn: 1, lean: 10, hn: 0.7, ht: 0.3, rf: 14, rs: 14, ru: 12, lf: 14, ls: -14, lu: 12, np: -1.5 }),
    wave: mk({ lf: 14, ls: -16, lu: 90, ht: -0.25 }),
    pinFlick: mk({ lf: 22, ls: -6, lu: 70, twist: 0.35 }),
    pinWind: mk({ lf: -4, ls: -12, lu: 74, twist: -0.4 }),
    stagger: mk({ kn: 1, lean: 12, hn: 0.9, ht: 0.6, rf: 12, rs: 15, ru: 14, lf: 12, ls: -15, lu: 14, np: -1.5 }),
    flinch: mk({ lean: -9, hn: -0.5, ht: 0.3, rf: 2, rs: 16, ru: 56, lf: 2, ls: -15, lu: 58 }),
    sit: mk({ sit: 1, lean: -3, rf: 10, rs: 9, ru: 30, lf: 14, ls: -5, lu: 34, na: 0.35, np: -1.3, ht: 0.12 }),
    sitTurned: mk({ sit: 1, lean: -3, rf: 10, rs: 9, ru: 30, lf: 14, ls: -5, lu: 34, na: 0.35, np: -1.3, ht: 0.25, hy: 2.6 }),
    windKey: mk({ rf: -12, rs: 4, ru: 60, lf: -12, ls: -4, lu: 60, na: 3.1, np: -1.2, hn: 0.2, ht: -0.15 }),
    lanceBack: mk({ rf: -12, rs: 10, ru: 74, na: 0, np: 0.1, lean: -4, twist: 0.6, lf: 10, ls: -10, lu: 66 }),
    lanceFire: mk({ rf: 34, rs: 3, ru: 62, na: 0, np: -0.05, lean: 9, twist: -0.3, lf: -6, ls: -12, lu: 50 }),
    clash: mk({ rf: 22, rs: 3, ru: 60, lf: 18, ls: 1, lu: 60, lean: 7, na: 0, np: 0 }),
    hangCross: mk({ rf: 0, rs: 28, ru: 80, lf: 0, ls: -28, lu: 80, ht: 0.3, hn: 0.2, na: 1.57, np: 0.3 }),
    unravel: mk({ rf: 14, rs: 16, ru: 46, lf: 20, ls: -4, lu: 56, twist: 0.2, na: 0.9, np: -0.6 }),
    bowSit: mk({ sit: 1, lean: 4, hn: 0.75, ht: 0.35, rf: 10, rs: 9, ru: 28, lf: 12, ls: -6, lu: 30, na: 0.35, np: -1.3 })
  };
  function mixP(a, b, t) { const o = {}; for (const k in BASE) o[k] = lerp(a[k], b[k], t); return o; }
  function K(t, frames) {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
      if (t <= frames[i][0]) { const [t0, a] = frames[i - 1], [t1, b] = frames[i]; return mixP(a, b, ss((t - t0) / Math.max(1e-4, t1 - t0))); }
    }
    return frames[frames.length - 1][1];
  }
  const tiltTo = (p, v) => { const o = Object.assign({}, p); o.ht = v; return o; };

  P.hushPose = function () {
    const t = this.patT || 0, st = this.state, m = this.mech;
    if (st === 'idle' || st === 'walk') {
      const mv = c01((this.speed - 4) / 60), stride = this._stride || 0;
      if (mv < 0.02) return PS.idle;
      const walk = mk({ sway: stride * 1.6, twist: -stride * 0.12, rf: 8 - stride * 3, rs: 12, ru: 40, lf: 4 + stride * 4, ls: -11, lu: 44, ht: 0.05 + stride * 0.06 });
      return mixP(PS.idle, walk, mv);
    }
    if (st === 'intro_cutscene') {
      const k = this._introShort ? (this.stateDuration / 9.0) : 1;
      const s = t / k;
      return K(s, [[0, PS.sit], [2.7, PS.sit], [3.1, PS.sitTurned], [3.6, PS.sitTurned], [4.4, PS.sit], [4.9, PS.crumple], [5.6, PS.hang], [6.2, PS.idle], [9, PS.idle]]);
    }
    if (st === 'staggered') { const out = mixP(PS.stagger, PS.idle, c01((0.4 - this.stateTimer) / 0.4)); out.hn += Math.sin(now() * 2.2) * 0.06; return out; }
    if (st === 'rebuked' || st === 'flinched') { const k = Math.sin(c01(1 - this.stateTimer / (this.stateDuration || 0.6)) * Math.PI); return mixP(PS.idle, PS.flinch, k); }
    if (st === 'pat_getsuga_charge') {
      const p = this.getsugaProgress ? this.getsugaProgress() : 0;
      return p < 0.82 ? mixP(PS.idle, PS.lanceBack, ss(p / 0.4)) : PS.lanceFire;
    }
    if (st === 'karok_clash') {
      const c = this.karokClash || { phase: 'intro' };
      if (c.phase === 'finish' && c.win) return mixP(PS.clash, PS.crumple, ss((c.finishT || 0) / 0.6));
      const o = Object.assign({}, PS.clash); o.lean += Math.sin(now() * 30) * 0.5; return o;
    }
    if (m) {
      if (m.kind === 'nightlight') { if (m.phase === 'blind') return K(m.blindT, [[0, PS.sit], [0.25, PS.flinch], [1.2, PS.crumple]]); return m.phase === 'intro' && m.t < m.introDur * 0.5 ? PS.wave : PS.sit; }
      if (m.kind === 'act2') { const o = Object.assign({}, PS.windKey); o.twist = Math.sin(m.t * 9) * 0.06; return o; }
      if (m.kind === 'dollhouse') return PS.hang;
      if (m.kind === 'finale') { if (m.phase === 'fall') return PS.crumple; return PS.hangCross; }
    }
    switch (st) {
      case 'hs_needle_thrust': return K(t, [[0, PS.needleReady], [0.5, PS.needleReady], [0.58, PS.thrust], [0.75, PS.needleReady], [1.25, PS.needleReady], [1.33, PS.thrust], [1.5, PS.sweepWind], [1.83, PS.sweepWind], [1.92, PS.sweep], [2.4, PS.idle]]);
      case 'hs_cradle_rock': return K(t, [[0, PS.idle], [0.45, PS.rockBack], [0.62, PS.rockFwd], [1.0, PS.rockFwd], [1.22, PS.rockBack], [1.6, PS.rockBack], [1.88, PS.rockFwd], [2.6, PS.idle]]);
      case 'hs_music_spin': return K(t, [[0, PS.idle], [0.6, PS.spinWind], [0.92, PS.spinWind], [1.0, PS.spin], [1.6, PS.spin], [1.75, PS.spin], [2.9, PS.idle]]);
      case 'hs_ribbon_lash': return K(t, [[0, PS.idle], [0.55, PS.ribbonWind], [0.78, PS.ribbonLash], [1.1, PS.ribbonWind], [1.35, PS.ribbonLash], [1.9, PS.idle]]);
      case 'hs_head_tilt': return K(t, [[0, PS.idle], [0.55, PS.tilt], [0.6, tiltTo(PS.tilt, (this.tiltDir || 1) * 1.5)], [2.4, tiltTo(PS.tilt, (this.tiltDir || 1) * 1.5)], [3.0, PS.idle]]);
      case 'hs_key_turn': return K(t, [[0, PS.idle], [0.3, PS.keyTurn], [1.5, PS.keyTurn], [1.75, PS.spinWind], [2.5, PS.idle]]);
      case 'hs_lasso': return K(t, [[0, PS.idle], [0.3, PS.lassoWind], [0.78, PS.lassoWind], [0.86, PS.lassoThrow], [1.2, PS.needleReady], [1.42, PS.jab], [2.1, PS.idle]]);
      case 'hs_stitch': return K(t, [[0, PS.idle], [0.4, PS.sew], [2.6, PS.sew], [3.0, PS.idle]]);
      case 'hs_marionette_drop': return K(t, [[0, PS.idle], [0.5, PS.hang], [1.6, PS.hang], [1.8, PS.crumple], [2.6, PS.crumple], [3.1, PS.idle]]);
      case 'hs_toy_soldiers': return K(t, [[0, PS.idle], [0.35, PS.wave], [1.2, PS.wave], [1.8, PS.idle]]);
      case 'hs_block_drop': return K(t, [[0, PS.idle], [0.2, PS.wave], [1.6, PS.wave], [2.9, PS.idle]]);
      case 'hs_pin_fan': return K(t, [[0, PS.idle], [0.55, PS.pinWind], [0.72, PS.pinFlick], [1.05, PS.pinWind], [1.22, PS.pinFlick], [1.45, PS.pinWind], [1.62, PS.pinFlick], [2.1, PS.idle]]);
      case 'hs_pas_de_deux': return K(t, [[0, PS.idle], [0.8, PS.rockBack], [1.02, PS.rockFwd], [1.4, PS.rockFwd], [1.62, PS.rockBack], [2.1, PS.rockBack], [2.4, PS.spinWind], [3.6, PS.idle]]);
      case 'hs_unravel': return K(t, [[0, PS.idle], [0.4, PS.unravel], [3.4, PS.unravel], [3.7, PS.idle]]);
      case 'hs_shatter_rings': return K(t, [[0, PS.idle], [0.6, PS.spinWind], [2.4, PS.spinWind], [3.2, PS.idle]]);
    }
    return PS.idle;
  };

  // each channel chases its target. A marionette moves in jerks: fast chase, then a hold (higher rates than Ignis), plus the
  // odd twitch of the head when she is idle
  const CHASE = { up: 22, lean: 20, twist: 20, sway: 12, kn: 18, rf: 20, rs: 20, ru: 20, lf: 18, ls: 18, lu: 18, na: 18, np: 18, ht: 14, hn: 14, hy: 10, fl: 8, sit: 12 };
  P.livePose = function (target) {
    const t = now();
    const dt = Math.min(0.06, Math.max(0, t - (this._liveT || t)));
    this._liveT = t;
    let s = this._live;
    if (!s) s = this._live = Object.assign({}, target);
    for (const k in BASE) s[k] += (target[k] - s[k]) * (1 - Math.exp(-(CHASE[k] || 16) * dt));
    const o = Object.assign({}, s);
    const calm = (this.state === 'idle' || this.state === 'walk') ? 1 : 0.3;
    o.up += Math.sin(t * 1.6) * 0.3;
    o.sway += Math.sin(t * 0.8) * 0.6 * calm;
    o.hn += Math.sin(t * 0.7) * 0.04 * calm;
    // the twitch: every few seconds the head snaps a little to one side and back
    if (!this._twAt || t > this._twAt) { this._twAt = t + 2.5 + Math.random() * 3.5; this._tw = (Math.random() - 0.5) * 0.5; this._twT = t; }
    const tw = t - (this._twT || 0);
    if (tw < 0.5) o.ht += this._tw * Math.sin(Math.min(1, tw / 0.08) * Math.PI / 2) * (1 - c01((tw - 0.25) / 0.25)) * calm;
    return o;
  };

  // ---- rig simulation: bonnet ribbons, the needle's thread, the skirt sway, key spin ------------------------------------------
  P.resetRig = function () {
    this.ribN = [[], []];
    for (let s = 0; s < 2; s++) for (let i = 0; i < 6; i++) this.ribN[s].push({ f: -6 - i * 2, s: (s ? 1 : -1) * 4, u: HEADC - 2 - i * 3 });
    this.threadN = [];
    for (let i = 0; i < 8; i++) this.threadN.push({ x: 0, y: 0, z: 0 });
    this.skirtSway = { f: 0, s: 0, vf: 0, vs: 0 };
    this.keyAng = 0;
    this._live = null; this._stride = 0;
    this._blinkAt = now() + 2;
    this._seams = null;
  };
  P.updateRig = function (dt) {
    if (!this.ribN) this.resetRig();
    const a = this.facingAngle, cs = Math.cos(a), sn = Math.sin(a);
    const vx = this.vx || 0, vy = (this.vy || 0) / T();
    let lf = vx * cs + vy * sn, ls = -vx * sn + vy * cs;
    const da = Math.atan2(Math.sin(a - (this._lastFace ?? a)), Math.cos(a - (this._lastFace ?? a)));
    this._lastFace = a;
    ls += -(da / Math.max(1e-3, dt)) * 10;
    const time = now();
    const pose = this._pose || BASE;
    for (let side = 0; side < 2; side++) {
      const R = this.ribN[side], sg = side ? 1 : -1;
      R[0].f = -5 + pose.lean * 0.6; R[0].s = sg * 4.5; R[0].u = HEADC - 3 + pose.up - pose.kn * 14;
      for (let i = 1; i < R.length; i++) {
        const pr = R[i - 1], c = R[i];
        const wave = Math.sin(time * 2.4 - i * 0.8 + side) * (0.4 + i * 0.25);
        const df = pr.f - 1.6 - Math.max(-5, Math.min(5, lf * 0.01 * i * 0.4));
        const ds = pr.s + sg * 0.5 + wave - Math.max(-6, Math.min(6, ls * 0.01 * i * 0.4));
        const du = pr.u - 3.2;
        const k = Math.min(1, dt * (14 - i));
        c.f += (df - c.f) * k; c.s += (ds - c.s) * k; c.u += (du - c.u) * k;
        const d = Math.hypot(c.f - pr.f, c.s - pr.s, c.u - pr.u), L = 3.4;
        if (d > L) { const q = L / d; c.f = pr.f + (c.f - pr.f) * q; c.s = pr.s + (c.s - pr.s) * q; c.u = pr.u + (c.u - pr.u) * q; }
      }
    }
    const C = this.skirtSway;
    const tf = Math.max(-6, Math.min(6, -lf * 0.04)), ts = Math.max(-6, Math.min(6, -ls * 0.04));
    C.vf += ((tf - C.f) * 50 - C.vf * 8) * dt; C.vs += ((ts - C.s) * 50 - C.vs * 8) * dt;
    C.f += C.vf * dt; C.s += C.vs * dt;
    // the key: a slow steady turn, faster once she has wound herself up, crawling when wound down, a stub once broken
    const keySpd = this.keyBroken ? 0 : (this.windDownT > 0 ? 0.4 : (this.mech && this.mech.kind === 'act2' ? 9 : (this.act2 ? 2.2 : 1.1)));
    this.keyAng += keySpd * dt * (this.state === 'hs_key_turn' ? 4 * (this.keyDir || 1) : 1);
  };

  // ---- maths ----------------------------------------------------------------------------------------------------------------
  function ik(a, b, L1, L2, pole) {
    let dx = b.f - a.f, dy = b.s - a.s, dz = b.u - a.u;
    let d = Math.hypot(dx, dy, dz) || 1e-3;
    const maxD = (L1 + L2) * 0.995;
    const ux = dx / d, uy = dy / d, uz = dz / d;
    if (d > maxD) d = maxD;
    const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
    const dot = pole.f * ux + pole.s * uy + pole.u * uz;
    let px = pole.f - dot * ux, py = pole.s - dot * uy, pz = pole.u - dot * uz;
    const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    return { mid: { f: a.f + ux * x + px * h, s: a.s + uy * x + py * h, u: a.u + uz * x + pz * h }, end: { f: a.f + ux * d, s: a.s + uy * d, u: a.u + uz * d } };
  }
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  function smoothPoly(ctx, pts) {
    const n = pts.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(a.x, a.y, mx, my);
    }
    const a = pts[0], b = pts[1 % n];
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.closePath();
  }
  // porcelain shading on the current path: a cool shade away from the key light (upper left) and one sharp highlight
  function glaze(ctx, cx, cy, r, hi = 0.5, lo = 0.42) {
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(cx - r * 0.7, cy - r * 0.8, cx + r * 0.8, cy + r * 0.9);
    g.addColorStop(0, `rgba(255,255,255,${hi * 0.5})`); g.addColorStop(0.4, 'rgba(255,255,255,0)'); g.addColorStop(0.62, 'rgba(60,72,110,0)'); g.addColorStop(1, `rgba(60,72,110,${lo})`);
    ctx.fillStyle = g; ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
    ctx.restore();
  }
  function shine(ctx, x, y, rx, ry, a = 0.75, rot = -0.6) {
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); ctx.restore();
  }
  // a smooth tapered limb through points (no hinges), outlined; porcelain shaded across its width
  function organicLimb(ctx, Pp, W) {
    const n = Pp.length, L = [], R = [], N = [];
    for (let i = 0; i < n; i++) {
      const a = Pp[Math.max(0, i - 1)], b = Pp[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      N.push({ x: -dy / l, y: dx / l });
      L.push({ x: Pp[i].x + N[i].x * W[i], y: Pp[i].y + N[i].y * W[i] });
      R.push({ x: Pp[i].x - N[i].x * W[i], y: Pp[i].y - N[i].y * W[i] });
    }
    ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(L[i].x, L[i].y, (L[i].x + L[i + 1].x) / 2, (L[i].y + L[i + 1].y) / 2);
    ctx.lineTo(L[n - 1].x, L[n - 1].y);
    const ae = Math.atan2(N[n - 1].y, N[n - 1].x);
    ctx.arc(Pp[n - 1].x, Pp[n - 1].y, W[n - 1], ae, ae + Math.PI, true);
    for (let i = n - 2; i > 0; i--) ctx.quadraticCurveTo(R[i].x, R[i].y, (R[i].x + R[i - 1].x) / 2, (R[i].y + R[i - 1].y) / 2);
    ctx.lineTo(R[0].x, R[0].y);
    const a0 = Math.atan2(N[0].y, N[0].x);
    ctx.arc(Pp[0].x, Pp[0].y, W[0], a0 + Math.PI, a0 + TAU, true);
    ctx.closePath();
  }
  function seededRng(seed) { let s = seed >>> 0 || 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // kintsugi seams: random branching walks over the head (sphere) and the torso / skirt (cylinder), fixed for the fight.
  // tier 0: the old repairs she always had · 1: Wind-Up · 2: below 40% · 3: strings cut / mask gone
  function buildSeams() {
    const r = seededRng(1337), out = [];
    const walk = (part, tier, n) => {
      for (let k = 0; k < n; k++) {
        // a crack: mostly one direction (down-ish), short sharp kinks, and a side branch now and then
        let th = part === 'head' ? (r() < 0.5 ? -1 : 1) * (0.75 + r() * 0.35) : (r() - 0.5) * 2.4, u = part === 'head' ? -0.7 + r() * 0.4 : 0.75 + r() * 0.25;
        const dth = (r() - 0.5) * 0.12, du = part === 'head' ? 0.22 : -0.12;
        const pts = [{ th, u }];
        const len = 3 + Math.floor(r() * 3);
        for (let i = 0; i < len; i++) {
          th += dth + (r() - 0.5) * 0.16; u += du * (0.6 + r() * 0.8); pts.push({ th, u });
          if (r() < 0.3) out.push({ part, tier, pts: [{ th, u }, { th: th + (r() - 0.5) * 0.35, u: u + du * 0.9 }], w: 0.45 });
        }
        out.push({ part, tier, pts, w: 0.5 + r() * 0.5 });
      }
    };
    walk('torso', 0, 1);
    walk('head', 1, 1); walk('torso', 1, 1); walk('skirt', 1, 2);
    walk('head', 2, 1); walk('torso', 2, 1); walk('skirt', 2, 2);
    walk('head', 3, 1); walk('torso', 3, 1); walk('skirt', 3, 2);
    return out;
  }
  P.seamTier = function () {
    if (this.hp <= 0) return 3;
    if (this.mech10 || (this.mech && this.mech.kind === 'finale')) return 3;
    if (this.phase >= 3) return 2;
    if (this.act2) return 1;
    return 0;
  };

  // =========================================================================================================================
  // THE FIGURE (also used for her porcelain copies in Pas de Deux: look.clone)
  // =========================================================================================================================
  P.drawFigure = function (ctx, X, Y, facing, pose, look) {
    look = look || {};
    const S = this.modelScale, tilt = T();
    const cs = Math.cos(facing), sn = Math.sin(facing);
    const lift = look.lift != null ? look.lift : (this.jumpZ || 0);
    const time = now();
    const sit = pose.sit || 0;
    const pelU = PEL + pose.up - pose.kn * 14 - sit * 16 + this.pelvisBounceZ * 0.05;
    const proj = (f, s, u) => ({ x: X + (f * cs - s * sn) * S, y: Y + (f * sn + s * cs) * S * tilt - (u * S + lift), d: (f * sn + s * cs) });
    // torso frame: lean tips the chest forward, twist turns it, sway shifts it sideways
    const tw = pose.twist, tcs = Math.cos(tw), tsn = Math.sin(tw);
    const body = (f, s, u) => {        // a point on the upper body (above the pelvis), with lean + twist applied
      const k = c01((u - pelU) / (SHO - PEL));
      const ff = f * tcs - s * tsn, sss = f * tsn + s * tcs;
      return proj(ff + pose.lean * k, sss + pose.sway * 0.4, u - Math.abs(pose.lean) * 0.08 * k);
    };
    const alpha = look.alpha != null ? look.alpha : 1;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (look.clone) ctx.globalAlpha *= 0.62;
    const ink = COL.ink;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // shadow on the floor (stays put while she hangs above it)
    if (!look.noShadow) {
      const sh = Math.max(0.35, 1 - lift / 300);
      ctx.fillStyle = `rgba(6,8,20,${0.38 * sh})`;
      ctx.beginPath(); ctx.ellipse(X, Y, 30 * S * sh, 30 * S * tilt * sh, 0, 0, TAU); ctx.fill();
    }

    // ---- joints ----
    const shoUp = SHO + pelU - PEL;
    const sR = { f: 0, s: SHO_W, u: shoUp }, sL = { f: 0, s: -SHO_W, u: shoUp };
    const twistPt = (o) => ({ f: o.f * tcs - o.s * tsn + pose.lean * 0.9, s: o.f * tsn + o.s * tcs, u: o.u });
    const sRw = twistPt(sR), sLw = twistPt(sL);
    const hR = { f: pose.rf, s: pose.rs, u: pose.ru + (pelU - PEL) * 0.7 }, hL = { f: pose.lf, s: pose.ls, u: pose.lu + (pelU - PEL) * 0.7 };
    const armR = ik(sRw, hR, UPPER, FORE, { f: -0.5, s: 0.7, u: -0.4 }), armL = ik(sLw, hL, UPPER, FORE, { f: -0.5, s: -0.7, u: -0.4 });
    // legs: hips → feet (the feet come from the shared foot planner; they dangle when she is lifted on her strings)
    const hipR = { f: 0, s: HIP_W, u: pelU }, hipL = { f: 0, s: -HIP_W, u: pelU };
    const footLocal = (foot, sg) => {
      if (lift > 30 || pose.sit > 0.5) return { f: sit ? 16 : 1.5, s: sg * 3, u: sit ? 2 : pelU - 38 };
      const dx = foot.x - this.x, dy = foot.y - this.y;
      return { f: dx * Math.cos(facing) + dy * Math.sin(facing), s: -dx * Math.sin(facing) + dy * Math.cos(facing), u: foot.z || 0 };
    };
    const fR = look.clone ? { f: 2, s: 4, u: 0 } : footLocal(this.rightFoot, 1), fL = look.clone ? { f: -2, s: -4, u: 0 } : footLocal(this.leftFoot, -1);
    const legR = ik(hipR, fR, THIGH, SHIN, { f: 1, s: 0.15, u: 0 }), legL = ik(hipL, fL, THIGH, SHIN, { f: 1, s: -0.15, u: 0 });

    // ---- part painters --------------------------------------------------------------------------------------------------
    const P2 = (o) => proj(o.f, o.s, o.u);
    const ballJoint = (pt, r) => {
      ctx.fillStyle = COL.chinaMid; ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = COL.ribbonDk; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 0.75, -0.4, 2.2); ctx.stroke();
    };
    const drawLeg = (leg, hip, foot) => {
      const a = P2(hip), b = P2(leg.mid), c = P2(leg.end);
      organicLimb(ctx, [a, b, c], [3.0 * S, 2.3 * S, 1.6 * S]);
      ctx.fillStyle = COL.china; ctx.fill(); glaze(ctx, b.x, b.y, 12 * S, 0.3, 0.4);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.stroke();
      ballJoint(b, 1.9 * S);
      // a little Mary Jane shoe
      const toe = proj(leg.end.f + 3.5, leg.end.s, Math.max(0.5, leg.end.u));
      ctx.fillStyle = '#1b1f3a'; ctx.beginPath(); ctx.ellipse((c.x + toe.x) / 2, (c.y + toe.y) / 2, 3.4 * S, 1.8 * S, Math.atan2(toe.y - c.y, toe.x - c.x), 0, TAU); ctx.fill();
    };
    const drawArm = (arm, sh, side) => {
      const a = P2(sh), b = P2(arm.mid), c = P2(arm.end);
      organicLimb(ctx, [a, b, c], [2.7 * S, 2.0 * S, 1.5 * S]);
      ctx.fillStyle = COL.china; ctx.fill(); glaze(ctx, b.x, b.y, 12 * S, 0.35, 0.42);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.stroke();
      ballJoint(b, 1.8 * S);
      // puffed sleeve at the shoulder
      ctx.fillStyle = COL.gown; ctx.beginPath(); ctx.ellipse(a.x, a.y + 1.5 * S, 4.4 * S, 3.6 * S, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = COL.delft; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(a.x, a.y + 3.4 * S, 3.6 * S, 1.2 * S, 0, 0.1, Math.PI - 0.1); ctx.stroke();
      // the hand: a slim porcelain hand with fingers together
      const dir = Math.atan2(c.y - b.y, c.x - b.x);
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(dir);
      ctx.fillStyle = COL.china; ctx.beginPath(); ctx.ellipse(2.2 * S, 0, 3.1 * S, 1.8 * S, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      // wrist ribbon (the string tie)
      ctx.strokeStyle = COL.ribbon; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(c.x, c.y, 1.7 * S, 0, TAU); ctx.stroke();
    };
    const tier = this.seamTier();
    if (!this._seams) this._seams = buildSeams();
    const seamGlow = 0.5 + 0.5 * Math.sin(time * 2.2) * (tier >= 2 ? 1 : 0.4);
    const drawSeams = (part, toScreen) => {
      ctx.save();
      for (const sm of this._seams) {
        if (sm.part !== part || sm.tier > tier) continue;
        const pts = sm.pts.map(toScreen).filter(Boolean);
        if (pts.length < 2) continue;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(245,197,66,${0.15 + 0.18 * seamGlow})`; ctx.lineWidth = (sm.w + 1.3) * S * 0.5;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.strokeStyle = tier >= 2 ? COL.goldHot : COL.gold; ctx.lineWidth = sm.w * S * 0.5;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      ctx.restore();
    };

    // SKIRT: a bell from the waist ring to the hem ring (convex hull of both rings as projected), sways with her motion
    const drawSkirt = () => {
      const sw = this.skirtSway || { f: 0, s: 0 };
      const flare = 1 + pose.fl * 0.32 + pose.kn * 0.25 + sit * 0.15;
      const hemU = Math.max(2, 7 + (pelU - PEL) * 0.6 - pose.kn * 4), waistU = pelU + 8;
      const ring = (u, r, off, n = 26) => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; o.push(proj(Math.cos(a) * r + off.f, Math.sin(a) * r * 1.05 + off.s, u)); } return o; };
      const hemR = 22 * flare, waist = ring(waistU, 6.6, { f: pose.lean * 0.2, s: 0 }), hem = ring(hemU, hemR, { f: sw.f + (sit ? 6 : 0), s: sw.s });
      const H = hull(waist.concat(hem));
      // petticoat peeking under the hem: a scalloped frill just below it
      const pett = ring(hemU - 1.5, hemR * 0.97, { f: sw.f + (sit ? 6 : 0), s: sw.s }, 36);
      ctx.fillStyle = COL.petticoat;
      ctx.beginPath();
      pett.forEach((q, i) => { if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
      ctx.closePath(); ctx.fill();
      // the bell
      smoothPoly(ctx, H);
      const top = proj(0, 0, waistU), bot = proj(0, 0, hemU);
      const g = ctx.createLinearGradient(top.x, top.y, bot.x, bot.y);
      g.addColorStop(0, COL.gown); g.addColorStop(1, COL.gownDk);
      ctx.fillStyle = g; ctx.fill();
      glaze(ctx, (top.x + bot.x) / 2, (top.y + bot.y) / 2, hemR * S, 0.35, 0.45);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.stroke();
      // painted Delft trim: two bands round the visible front of the hem, and little blue flowers
      const front = hem.map((q, i) => ({ q, i })).filter(o => o.q.d > -hemR * 0.15);
      ctx.save(); smoothPoly(ctx, H); ctx.clip();
      for (const [du, w] of [[2.5, 2.2], [6.5, 1.2]]) {
        const band = ring(hemU + du, hemR * (1 - du * 0.012), { f: sw.f + (sit ? 6 : 0), s: sw.s });
        ctx.strokeStyle = COL.delft; ctx.lineWidth = w * S * 0.6; ctx.beginPath();
        let first = true;
        for (let i = 0; i < band.length; i++) { const q = band[i]; if (q.d < -hemR * 0.15) { first = true; continue; } if (first) { ctx.moveTo(q.x, q.y); first = false; } else ctx.lineTo(q.x, q.y); }
        ctx.stroke();
      }
      for (const o of front) {
        if (o.i % 3) continue;
        const fpt = ring(hemU + 4.4, hemR * 0.95, { f: sw.f + (sit ? 6 : 0), s: sw.s })[o.i];
        ctx.fillStyle = COL.delftLt;
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; ctx.beginPath(); ctx.ellipse(fpt.x + Math.cos(a) * 1.4 * S, fpt.y + Math.sin(a) * 0.9 * S, 1.0 * S, 0.6 * S, a, 0, TAU); ctx.fill(); }
      }
      // seams on the skirt (cylinder: th around the front, u up the bell)
      drawSeams('skirt', (pt) => {
        const u = lerp(hemU + 2, waistU - 2, c01(pt.u)), r = lerp(hemR * 0.97, 7, c01(pt.u));
        const th = pt.th; const q = proj(Math.cos(th) * r, Math.sin(th) * r, u);
        return q.d > -r * 0.2 ? q : null;
      });
      ctx.restore();
      // a satin sash with a big bow at the back
      const sashF = proj(0, 0, waistU + 1);
      ctx.strokeStyle = COL.ribbon; ctx.lineWidth = 2.6 * S * 0.7;
      const sash = ring(waistU + 0.5, 7.2, { f: pose.lean * 0.2, s: 0 }).filter(q => q.d > -2);
      if (sash.length > 2) { ctx.beginPath(); ctx.moveTo(sash[0].x, sash[0].y); for (const q of sash) ctx.lineTo(q.x, q.y); ctx.stroke(); }
      return { hemU, hemR, waistU, sashF };
    };
    const drawBow = (waistU, behind) => {
      const c = proj(-7.5, 0, waistU + 1);
      if ((c.d < -2) !== behind) return;
      ctx.fillStyle = COL.ribbon; ctx.strokeStyle = ink; ctx.lineWidth = 1;
      for (const sg of [-1, 1]) {
        const w = proj(-8.5, sg * 6, waistU + 3);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.quadraticCurveTo(w.x, w.y - 5 * S, w.x, w.y + 1 * S); ctx.quadraticCurveTo(w.x - sg * 1 * S, w.y + 3 * S, c.x, c.y); ctx.fill(); ctx.stroke();
        const tl = proj(-9, sg * 4, waistU - 14);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.quadraticCurveTo((c.x + tl.x) / 2 + sg * 3, (c.y + tl.y) / 2, tl.x, tl.y); ctx.lineWidth = 2.2 * S * 0.6; ctx.strokeStyle = COL.ribbon; ctx.stroke();
      }
    };
    // KEY: brass wind-up key in the small of her back (break point); turns while she runs
    const drawKey = (waistU) => {
      const base = body(-7.2, 0, waistU + 12), out = body(-15, 0, waistU + 12);
      if (this.keyBroken) {
        ctx.strokeStyle = COL.brassDk; ctx.lineWidth = 2.2 * S * 0.6; ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(lerp(base.x, out.x, 0.35), lerp(base.y, out.y, 0.35)); ctx.stroke();
        return;
      }
      ctx.strokeStyle = COL.brass; ctx.lineWidth = 2.0 * S * 0.6; ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(out.x, out.y); ctx.stroke();
      // the bow of the key: two loops spinning about the shaft (a flattened ellipse pair)
      const k = Math.cos(this.keyAng || 0), w = 6.5 * S;
      ctx.fillStyle = COL.brass; ctx.strokeStyle = COL.brassDk; ctx.lineWidth = 1.2;
      for (const sg of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(out.x + sg * w * 0.55 * k, out.y, Math.max(0.8, Math.abs(k) * w * 0.55), w * 0.42, 0, 0, TAU); ctx.fill(); ctx.stroke();
      }
      if (this.leftPauldronFlashTimer > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,240,180,0.6)'; ctx.beginPath(); ctx.arc(out.x, out.y, 9 * S * 0.6, 0, TAU); ctx.fill(); ctx.restore(); }
    };
    // SPOOL at her right hip
    const drawSpool = (waistU) => {
      const c = body(1, 8.2, waistU - 4);
      ctx.fillStyle = COL.wood; ctx.strokeStyle = ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(c.x, c.y - 3 * S, 3.2 * S, 1.3 * S, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c94f6d'; ctx.fillRect(c.x - 2.4 * S, c.y - 3 * S, 4.8 * S, 5 * S);
      ctx.fillStyle = COL.wood; ctx.beginPath(); ctx.ellipse(c.x, c.y + 2 * S, 3.2 * S, 1.3 * S, 0, 0, TAU); ctx.fill(); ctx.stroke();
      if (this.state === 'hs_unravel' && this.unravel) {
        // the spool spins (its direction is the tell)
        const sp = (now() * 14 * this.unravel.dir) % TAU;
        ctx.strokeStyle = '#fff1f2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c.x - 2.4 * S * Math.cos(sp), c.y - 2 * S); ctx.lineTo(c.x + 2.4 * S * Math.cos(sp), c.y + 1 * S); ctx.stroke();
      }
    };
    // TORSO: bodice (hull of the waist and chest rings), lace collar
    const drawTorso = (waistU) => {
      const ring = (u, rf, rs, n = 18) => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; o.push(body(Math.cos(a) * rf, Math.sin(a) * rs, u)); } return o; };
      const H = hull(ring(waistU, 5.4, 6.4).concat(ring(shoUp - 2, 5.0, 8.2)).concat(ring(shoUp + 1, 3.6, 6.6)));
      smoothPoly(ctx, H);
      const c = body(0, 0, (waistU + shoUp) / 2);
      ctx.fillStyle = COL.gown; ctx.fill();
      glaze(ctx, c.x, c.y, 14 * S, 0.4, 0.45);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.stroke();
      // a painted blue stomacher down the front with gold lacing
      const fr = body(5.2, 0, waistU + 2), to = body(5.0, 0, shoUp - 3);
      if (fr.d > -2) {
        ctx.save(); smoothPoly(ctx, H); ctx.clip();
        ctx.strokeStyle = COL.delft; ctx.lineWidth = 5.4 * S * 0.6; ctx.beginPath(); ctx.moveTo(fr.x, fr.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        ctx.strokeStyle = COL.gold; ctx.lineWidth = 0.9;
        for (let i = 0; i < 5; i++) { const k = (i + 0.5) / 5, x = lerp(fr.x, to.x, k), y = lerp(fr.y, to.y, k); ctx.beginPath(); ctx.moveTo(x - 2 * S, y - 0.6 * S); ctx.lineTo(x + 2 * S, y + 0.6 * S); ctx.moveTo(x + 2 * S, y - 0.6 * S); ctx.lineTo(x - 2 * S, y + 0.6 * S); ctx.stroke(); }
        drawSeams('torso', (pt) => { const u = lerp(waistU + 1, shoUp - 1, c01(pt.u)); const q = body(Math.cos(pt.th) * 5.6, Math.sin(pt.th) * 7, u); return q.d > -3 ? q : null; });
        ctx.restore();
      }
      // lace collar: a frilled ring at the neck
      const col = ring(shoUp + 1.5, 4.6, 6.8, 22);
      ctx.fillStyle = COL.petticoat; ctx.strokeStyle = ink; ctx.lineWidth = 0.9;
      ctx.beginPath(); col.forEach((q, i) => { const nx = col[(i + 1) % col.length]; if (i === 0) ctx.moveTo(q.x, q.y); ctx.quadraticCurveTo(q.x, q.y + 2.2 * S, (q.x + nx.x) / 2, (q.y + nx.y) / 2 + 0.6 * S); }); ctx.closePath(); ctx.fill(); ctx.stroke();
      // neck
      const n0 = body(0, 0, shoUp + 1), n1 = body(0, 0, NECK + pelU - PEL);
      organicLimb(ctx, [n0, n1], [2.6 * S, 2.3 * S]); ctx.fillStyle = COL.china; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = COL.ribbon; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(n0.x - 2.4 * S, (n0.y + n1.y) / 2); ctx.lineTo(n0.x + 2.4 * S, (n0.y + n1.y) / 2); ctx.stroke();
    };
    // HEAD: bonnet, ringlets, face (glass eyes, blush, painted smile), tilt, the mask break
    const drawHead = () => {
      const hc = body(0.6, 0, HEADC + pelU - PEL);
      const R = HEADR * S;
      const roll = pose.ht, yaw = facing + pose.hy;
      const fc = Math.cos(yaw - facing) ;
      // how much of her face we see: the face points along (yaw); facing the camera means pointing +y in the ground plane
      const faceDepth = Math.sin(yaw);       // +1 straight at the camera, -1 away
      const faceX = Math.cos(yaw);           // left/right on screen
      ctx.save();
      ctx.translate(hc.x, hc.y); ctx.rotate(roll); ctx.translate(-hc.x, -hc.y);
      // ribbons from the bonnet (behind the head)
      for (const R2 of this.ribN || []) {
        const pts = R2.map(n => body(n.f, n.s, n.u + (pelU - PEL)));
        ctx.strokeStyle = COL.ribbon; ctx.lineWidth = 2.2 * S * 0.6; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const q of pts) ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      // bonnet back (a frilled disc behind the head)
      const bx = hc.x - faceX * R * 0.35, by = hc.y - R * 0.2;
      ctx.fillStyle = COL.petticoat; ctx.strokeStyle = ink; ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU, rr = R * 1.34 + Math.sin(a * 9) * R * 0.07; const x = bx + Math.cos(a) * rr, y = by + Math.sin(a) * rr * 0.98; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = COL.delftLt; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, R * 1.18, 0, TAU); ctx.stroke();
      // ringlet curls at the sides
      ctx.fillStyle = COL.hair; ctx.strokeStyle = COL.hairDk; ctx.lineWidth = 0.9;
      for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) {
        const cx = hc.x + sg * R * (0.86 + i * 0.06) - faceX * R * 0.2, cy = hc.y + R * (0.2 + i * 0.32);
        ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.22, R * 0.3, 0, 0, TAU); ctx.fill(); ctx.stroke();
      }
      // the head itself
      ctx.beginPath(); ctx.ellipse(hc.x, hc.y, R, R * 1.06, 0, 0, TAU);
      ctx.fillStyle = COL.china; ctx.fill();
      glaze(ctx, hc.x, hc.y, R, 0.6, 0.38);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(hc.x, hc.y, R, R * 1.06, 0, 0, TAU); ctx.stroke();
      shine(ctx, hc.x - R * 0.42, hc.y - R * 0.5, R * 0.22, R * 0.11, 0.8);
      // fringe of hair across the top
      ctx.fillStyle = COL.hair; ctx.beginPath();
      ctx.ellipse(hc.x - faceX * R * 0.1, hc.y - R * 0.66, R * 0.95, R * 0.42, 0, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = COL.hairDk; ctx.lineWidth = 0.8; ctx.stroke();
      // the face (when it is turned our way)
      if (faceDepth > -0.25) {
        const k = c01((faceDepth + 0.25) / 0.6);
        const fx = hc.x + faceX * R * 0.5, fy = hc.y + R * 0.08;
        const squash = 0.45 + 0.55 * Math.max(0, faceDepth);
        ctx.save(); ctx.globalAlpha *= k;
        // blush
        ctx.fillStyle = COL.blush;
        for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(fx + sg * R * 0.42 * squash, fy + R * 0.28, R * 0.2 * squash, R * 0.12, 0, 0, TAU); ctx.fill(); }
        // glass eyes: big, dark blue, a highlight; the lids click shut on a blink
        const t = now();
        if (t > (this._blinkAt || 0)) { this._blinkAt = t + 2.6 + Math.random() * 3; this._blinkT = t; }
        const bl = t - (this._blinkT || 0);
        const lid = bl < 0.16 ? 1 : 0;
        const asleep = this.state === 'intro_cutscene' && this.patT < 2.8 * (this._introShort ? this.stateDuration / 9 : 1);
        const gold = this.act2 || this.phase >= 3;
        for (const sg of [-1, 1]) {
          const ex = fx + sg * R * 0.3 * squash, ey = fy - R * 0.08;
          const broken = this.maskBroken && sg > 0;
          if (broken) {
            // the right eye is gone: a dark socket with gold light inside
            ctx.fillStyle = '#0b0d1a'; ctx.beginPath(); ctx.ellipse(ex, ey, R * 0.2 * squash, R * 0.2, 0, 0, TAU); ctx.fill();
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, R * 0.25); g.addColorStop(0, 'rgba(255,230,140,0.9)'); g.addColorStop(1, 'rgba(255,200,80,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, R * 0.25, 0, TAU); ctx.fill(); ctx.restore();
            continue;
          }
          ctx.fillStyle = '#fbfbff'; ctx.beginPath(); ctx.ellipse(ex, ey, R * 0.19 * squash, R * 0.2, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = gold ? '#c08a1e' : COL.iris; ctx.beginPath(); ctx.ellipse(ex + faceX * R * 0.03, ey + R * 0.02, R * 0.14 * squash, R * 0.15, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#0b1024'; ctx.beginPath(); ctx.ellipse(ex + faceX * R * 0.03, ey + R * 0.03, R * 0.06 * squash, R * 0.07, 0, 0, TAU); ctx.fill();
          shine(ctx, ex - R * 0.05, ey - R * 0.07, R * 0.045, R * 0.035, 0.95, 0);
          if (lid || asleep) { ctx.fillStyle = COL.china; ctx.beginPath(); ctx.ellipse(ex, ey, R * 0.21 * squash, R * 0.22, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(ex - R * 0.17 * squash, ey + R * 0.02); ctx.quadraticCurveTo(ex, ey + R * 0.1, ex + R * 0.17 * squash, ey + R * 0.02); ctx.stroke(); }
          else { ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(ex, ey, R * 0.19 * squash, R * 0.2, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
          // thin painted lashes and brow
          ctx.strokeStyle = 'rgba(40,30,40,0.8)'; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(ex - R * 0.16 * squash, ey - R * 0.36); ctx.quadraticCurveTo(ex, ey - R * 0.44, ex + R * 0.16 * squash, ey - R * 0.38); ctx.stroke();
        }
        // the painted smile: a tiny cupid's bow that never moves
        ctx.fillStyle = COL.lip;
        const mx = fx, my = fy + R * 0.42;
        ctx.beginPath(); ctx.moveTo(mx - R * 0.12 * squash, my); ctx.quadraticCurveTo(mx - R * 0.05 * squash, my - R * 0.07, mx, my - R * 0.02); ctx.quadraticCurveTo(mx + R * 0.05 * squash, my - R * 0.07, mx + R * 0.12 * squash, my); ctx.quadraticCurveTo(mx, my + R * 0.08, mx - R * 0.12 * squash, my); ctx.fill();
        // the mask break: cracks across the right side of her face, a shard missing
        if (this.maskBroken) {
          ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.moveTo(fx + R * 0.05, fy - R * 0.7); ctx.lineTo(fx + R * 0.18, fy - R * 0.25); ctx.lineTo(fx + R * 0.1, fy + R * 0.05); ctx.lineTo(fx + R * 0.32, fy + R * 0.35); ctx.lineTo(fx + R * 0.26, fy + R * 0.7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(fx + R * 0.18, fy - R * 0.25); ctx.lineTo(fx + R * 0.55, fy - R * 0.32); ctx.stroke();
        }
        if (this.rightPauldronFlashTimer > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(fx, fy, R * 0.6, R * 0.8, 0, 0, TAU); ctx.fill(); }
        ctx.restore();
        drawSeams('head', (pt) => { const a = Math.atan2(faceX, faceDepth) * 0; const x = hc.x + Math.sin(pt.th) * R * 0.85, y = hc.y + pt.u * R * 0.55; return { x, y, d: 1 }; });
      }
      // bonnet brim framing the face
      ctx.strokeStyle = COL.petticoat; ctx.lineWidth = 2.4 * S * 0.6; ctx.beginPath(); ctx.ellipse(hc.x + faceX * R * 0.08, hc.y - R * 0.05, R * 1.08, R * 1.12, 0, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.restore();
      return hc;
    };
    // NEEDLE: a giant silver needle in her right hand, its thread trailing from the eye
    const drawNeedle = (hand) => {
      if (this.karokSwordHidden || look.noNeedle) return;
      const na = pose.na + tw, np = pose.np;
      const dir = { f: Math.cos(np) * Math.cos(na), s: Math.cos(np) * Math.sin(na), u: Math.sin(np) };
      const h = hand;
      const tip = P2({ f: h.f + dir.f * NEEDLE, s: h.s + dir.s * NEEDLE, u: h.u + dir.u * NEEDLE });
      const eye = P2({ f: h.f - dir.f * 12, s: h.s - dir.s * 12, u: h.u - dir.u * 12 });
      const g = ctx.createLinearGradient(eye.x, eye.y, tip.x, tip.y);
      g.addColorStop(0, COL.steelDk); g.addColorStop(0.5, COL.steel); g.addColorStop(1, '#ffffff');
      const dx = tip.x - eye.x, dy = tip.y - eye.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, w = 1.8 * S;
      ctx.fillStyle = g; ctx.strokeStyle = ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(eye.x + nx * w, eye.y + ny * w); ctx.lineTo(tip.x, tip.y); ctx.lineTo(eye.x - nx * w, eye.y - ny * w); ctx.arc(eye.x, eye.y, w, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) - Math.PI, true); ctx.closePath(); ctx.fill(); ctx.stroke();
      // the eye of the needle and its thread
      ctx.fillStyle = '#1b1f3a'; ctx.beginPath(); ctx.ellipse(eye.x + dx / L * 2.4, eye.y + dy / L * 2.4, 1.6, 0.7, Math.atan2(dy, dx), 0, TAU); ctx.fill();
      const tx = eye.x - dx / L * 22 + Math.sin(now() * 2) * 4, ty = eye.y - dy / L * 6 + 26;
      ctx.strokeStyle = '#e45d83'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(eye.x, eye.y); ctx.quadraticCurveTo(tx, ty - 18, tx - 6, ty); ctx.stroke();
      // the glint along the shaft
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(lerp(eye.x, tip.x, 0.2) + nx * 0.6, lerp(eye.y, tip.y, 0.2) + ny * 0.6); ctx.lineTo(lerp(eye.x, tip.x, 0.85), lerp(eye.y, tip.y, 0.85)); ctx.stroke();
      this._needleTip = tip; this._needleEye = eye;
    };

    // ---- draw order: depth sort of the arms and legs against the body ----------------------------------------------------
    const dR = (P2(armR.mid).d + P2(hR).d) / 2, dL = (P2(armL.mid).d + P2(hL).d) / 2, dBody = proj(0, 0, PEL).d;
    const keyBehind = proj(-8, 0, PEL).d < dBody;
    drawLeg(legL, hipL, fL); drawLeg(legR, hipR, fR);
    const wU = pelU + 8;
    if (keyBehind) { drawBow(wU, true); drawKey(wU); }
    if (dL < dBody - 2) drawArm(armL, sLw, -1);
    if (dR < dBody - 2) { drawArm(armR, sRw, 1); drawNeedle(armR.end); }
    const sk = drawSkirt();
    drawSpool(wU);
    drawTorso(wU);
    if (!keyBehind) { drawBow(wU, false); drawKey(wU); }
    const hc = drawHead();
    if (dL >= dBody - 2) drawArm(armL, sLw, -1);
    if (dR >= dBody - 2) { drawArm(armR, sRw, 1); drawNeedle(armR.end); }
    // where things attach (read by the stage: strings, the lasso, the ribbon, needle plunge)
    this._handR = P2(armR.end); this._handL = P2(armL.end); this._headTop = { x: hc.x, y: hc.y - HEADR * S };
    ctx.restore();
  };

  // =========================================================================================================================
  // DRAW: her (the shared wrappers — Rebuke glint, part-break burst, Broken marks — run around this)
  // =========================================================================================================================
  P.coreDraw = function (ctx) {
    if (this.hp <= 0) {
      // she sinks down onto the rug, sits, bows her head, and comes apart into gold light
      if (!this._deathAt) { this._deathAt = now(); HushBoss.playMotif && HushBoss.playMotif(0.7, 0.1, 0, 6); }
      const el = now() - this._deathAt;
      if (el > 4.2) return;
      const pose = K(el, [[0, PS.stagger], [0.8, PS.bowSit], [4.2, PS.bowSit]]);
      this._pose = pose;
      const a = 1 - c01((el - 2.4) / 1.6);
      this.drawFigure(ctx, this.x, this.y, Math.PI * 0.5, pose, { alpha: a });
      if (el > 2.0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const n = 36;
        for (let i = 0; i < n; i++) {
          const s = (i * 97.13) % 1, k = c01((el - 2.0 - s * 0.6) / 1.8);
          const x = this.x + Math.sin(i * 2.1) * 40 * (1 + k), y = this.y - 40 - s * 90 - k * 120;
          ctx.fillStyle = `rgba(255,${200 + Math.floor(s * 50)},120,${(1 - k) * 0.8})`;
          ctx.beginPath(); ctx.arc(x, y, 2 + s * 2.5, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      return;
    }
    this._deathAt = 0;
    const pose = this.livePose(this.hushPose());
    this._pose = pose;
    const X = this.x + this.recoilX * 0.4, Y = this.y + this.recoilY * 0.4;
    if (this.clones) for (const c of this.clones) this.drawFigure(ctx, c.x, c.y, c.a, pose, { clone: true, lift: 0 });
    let alpha = 1;
    const m = this.mech;
    if (m && m.kind === 'dollhouse') alpha = 0;                   // she is out in the walls
    if (alpha <= 0.01) return;
    this.drawFigure(ctx, X, Y, this.facingAngle, pose, { alpha });
    this.drawCounterTell(ctx, X, Y);
  };

  // COUNTER TELL: the same pulsing blue chest ring Vaelgor and Ignis use
  P.drawCounterTell = function (ctx, X, Y) {
    if (!this.isCounterable()) return;
    const S = this.modelScale || 1, cy = Y - 60 * S - (this.jumpZ || 0);
    const pulse = 0.6 + Math.sin(now() * 12) * 0.4, r = 48 + pulse * 8;
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    for (const [w, a] of [[26, 0.18], [16, 0.35], [4, 1]]) { ctx.lineWidth = w; ctx.globalAlpha = pulse * a; ctx.beginPath(); ctx.arc(X, cy, r, 0, TAU); ctx.stroke(); }
    ctx.restore();
  };

  // her right hand in the world (for the lasso / pins / needle effects); falls back to in front of her chest
  P.handWorld = function () {
    return { x: this.x + Math.cos(this.facingAngle) * 24, y: this.y + Math.sin(this.facingAngle) * 24 * T(), z: 80 };
  };

  // Karok: the needle, wrenched free (drawn by karok_clash.js where the shared controller puts it)
  P.drawKarokSword = function (ctx, x, y, rot, alpha) {
    const L = 110;
    const hx = x - Math.cos(rot) * L * 0.45, hy = y - Math.sin(rot) * L * 0.45, tx = x + Math.cos(rot) * L * 0.55, ty = y + Math.sin(rot) * L * 0.55;
    ctx.save(); ctx.globalAlpha *= alpha;
    const nx = -Math.sin(rot), ny = Math.cos(rot), w = 3;
    const g = ctx.createLinearGradient(hx, hy, tx, ty); g.addColorStop(0, COL.steelDk); g.addColorStop(0.5, COL.steel); g.addColorStop(1, '#fff');
    ctx.fillStyle = g; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx + nx * w, hy + ny * w); ctx.lineTo(tx, ty); ctx.lineTo(hx - nx * w, hy - ny * w); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b1f3a'; ctx.beginPath(); ctx.ellipse(hx + Math.cos(rot) * 5, hy + Math.sin(rot) * 5, 2.5, 1, rot, 0, TAU); ctx.fill();
    ctx.restore();
  };
  // the charge itself is drawn as her pose + the stage's stitched lane; Vaelgor's black blade must not appear
  P.drawGetsugaCharge = function () {};
  P.getKarokBossPose = function () { return null; };

  HushBoss.RIG = { COL, PS, HEADR, NEEDLE };
})();
