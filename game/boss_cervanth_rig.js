// =========================================================================
// BOSS_CERVANTH_RIG.JS: how Cervanth looks. A real 2.5D rig like Vaelgor, Ignis and Hush: every joint is a point in his own frame
// (forward / side / up), projected with the arena tilt and depth-sorted, so he turns, rears and kneels instead of flipping a
// sprite. Four legs with two-bone IK, a segmented neck, a skull with an opening jaw, jagged blade-tine antlers (the break points),
// open ribs around an ember heart, a tattered mantle. The heart is anime flame tongues (flame_art.js), never glow.
// Look references (looked up 2026-10-22; results were thin, so only traits are used): jagged asymmetrical claw-tipped antlers,
// skeletal anatomy with stretched flesh clinging, blade-like hooves, exposed ribs on a quadruped.
// Poses for every pattern are keyed by the same names as boss_cervanth_pats.js.
// =========================================================================
(function () {
  if (typeof CervanthBoss === 'undefined') return;
  const P = CervanthBoss.prototype;
  const TAU = Math.PI * 2;
  const T = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.58);
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (t) => { t = c01(t); return t * t * (3 - 2 * t); };
  const now = () => performance.now() / 1000;
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  const BONE = [226, 214, 198], BONE_D = [120, 106, 98], OBS = [26, 12, 24], OBS_L = [62, 30, 56], CRIM = [225, 29, 72], BLOOD = [52, 8, 24];

  // ---- poses ----------------------------------------------------------------------------------------------------------------
  // rear: reared up on the hind legs (0-1) · crouch: body sunk low (kneeling at 1) · lunge: whole body forward · neck: -1.7 lowered to the
  // ground .. 1.2 raised · pitch: head tilt down (rad) · yaw: head/neck turned (rad) · jaw: mouth open · back: antlers swept back ·
  // spread: antlers spread wide · hipYaw: rear end swung round · pawL/pawR: front hoof scraping · liftL/liftR: a front hoof raised ·
  // kick: hind legs kicked back · flare: mantle lifted · heart: ember brightness · throat: glow in the throat · coil: neck S-curve ·
  // ribs: ribs heaving · plant: antlers driven into the ground
  const BASE = { rear: 0, crouch: 0, lunge: 0, neck: 0, pitch: 0.15, yaw: 0, jaw: 0.25, back: 0, spread: 0, hipYaw: 0, pawL: 0, pawR: 0, liftL: 0, liftR: 0, kick: 0, flare: 0, heart: 0.7, throat: 0, coil: 0, ribs: 0, plant: 0 };
  const mk = (o) => Object.assign({}, BASE, o);
  const PS = {
    idle: mk({}),
    away: mk({ yaw: 0.9, back: 0.85, pitch: 0.25, neck: 0.1, flare: 0.3 }),
    swing: mk({ yaw: -0.75, back: 0, pitch: 0.4, lunge: 14, neck: -0.15, jaw: 0.5 }),
    scrape1: mk({ crouch: 0.5, pitch: 0.75, neck: -0.55, heart: 0.25 }),
    scrapeHold: mk({ crouch: 0.75, pitch: 1.05, neck: -0.95, heart: 0.1, jaw: 0.1 }),
    lungeP: mk({ crouch: 0.4, pitch: 0.65, neck: -0.75, lunge: 44, heart: 0.8, jaw: 0.6 }),
    tineUp: mk({ pitch: -0.6, neck: 1.1, spread: 1, back: 0.2, jaw: 0.1, heart: 0.85 }),
    rear1: mk({ rear: 1, neck: 0.6, pitch: -0.2, heart: 1, jaw: 0.7, back: 0.3 }),
    slam: mk({ rear: 0, crouch: 0.45, pitch: 0.8, neck: -0.5, heart: 0.9, jaw: 0.5 }),
    lash: mk({ hipYaw: 1.3, flare: 1, yaw: 0.2, pitch: 0.2, neck: 0.1 }),
    lashCrack: mk({ hipYaw: -0.5, flare: 1, yaw: -0.2, pitch: 0.3, lunge: 6 }),
    howl: mk({ pitch: -1.0, neck: 1.25, jaw: 1, back: 0.55, crouch: 0.15, heart: 1 }),
    howlOut: mk({ pitch: -0.15, neck: 0.3, jaw: 1, back: 0.2, lunge: 10, heart: 1 }),
    spit: mk({ coil: 1, throat: 0.6, ribs: 1, pitch: 0.5, neck: -0.2, jaw: 0.35 }),
    spitFire: mk({ coil: 1, throat: 1, ribs: 1, pitch: 0.3, neck: 0.1, jaw: 0.95 }),
    spitOut: mk({ coil: 0, throat: 0.2, pitch: 0.25, neck: 0.1, jaw: 0.7, lunge: 8 }),
    stampWind: mk({ crouch: 0.3, pitch: 0.5, neck: -0.45, heart: 0.9 }),
    charge: mk({ crouch: 0.3, pitch: 0.85, neck: -0.9, lunge: 20, heart: 1, jaw: 0.6, back: 0.3 }),
    stagger: mk({ crouch: 0.92, pitch: 1.15, neck: -1.5, jaw: 0.45, heart: 0.5 }),
    prone: mk({ crouch: 1, pitch: 1.35, neck: -1.7, jaw: 0.3, heart: 0.4, lunge: 8 }),
    flinch: mk({ pitch: -0.35, back: 0.7, neck: 0.4, jaw: 0.6 }),
    rebuked: mk({ pitch: -0.7, yaw: 0.25, back: 0.5, neck: 0.5, jaw: 0.5 }),
    karokWind: mk({ crouch: 0.4, pitch: 0.95, neck: -1.0, back: 0.4, lunge: -8 }),
    karokLock: mk({ crouch: 0.55, pitch: 1.0, neck: -1.1, lunge: 22, jaw: 0.4, heart: 1 }),
    herd: mk({ pitch: 0.65, neck: -0.5, jaw: 1, back: 0.2, heart: 0.9 }),
    heartOpen: mk({ rear: 0.9, neck: 0.5, pitch: -0.35, jaw: 0.8, heart: 1, back: 0.4 }),
    cagePlant: mk({ pitch: 1.4, neck: -1.7, crouch: 0.55, plant: 1, heart: 0.8 }),
    roar: mk({ rear: 0.45, pitch: -0.85, neck: 1.0, jaw: 1, back: 0.5, heart: 1, spread: 0.4 }),
    introDown: mk({ crouch: 0.6, pitch: 1.05, neck: -1.45, jaw: 0.1, heart: 0.3 }),
    introUp: mk({ crouch: 0, pitch: 0.05, neck: 0.4, jaw: 0.3, back: 0.1, heart: 0.8 })
  };
  function mixP(a, b, t) { const o = {}; for (const k in BASE) o[k] = lerp(a[k], b[k], t); return o; }
  function K(t, frames) {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
      if (t <= frames[i][0]) { const [t0, a] = frames[i - 1], [t1, b] = frames[i]; return mixP(a, b, ss((t - t0) / Math.max(1e-4, t1 - t0))); }
    }
    return frames[frames.length - 1][1];
  }
  const pawing = (p, t0, t1, side) => { if (side === 'L') p.pawL = 1; else p.pawR = 1; return p; };

  P.cervPoseTarget = function () {
    const t = this.patT || 0, st = this.state, m = this.mech;
    const sd = this.sweepSide || 1;
    if (st === 'idle' || st === 'walk') return PS.idle;
    if (st === 'intro_cutscene') {
      const k = this._introShort ? this.stateDuration / 7.0 : 1;
      return K(t / k, [[0, PS.introDown], [2.0, PS.introDown], [2.5, PS.introUp], [3.5, PS.introUp], [7, PS.idle]]);
    }
    if (st === 'staggered') { const o = mixP(PS.stagger, PS.idle, c01((0.5 - this.stateTimer) / 0.5)); if (this._proneAt) return PS.prone; return o; }
    if (st === 'rebuked') { const k = Math.sin(c01(1 - this.stateTimer / (this.stateDuration || 0.6)) * Math.PI); return mixP(PS.idle, PS.rebuked, k); }
    if (st === 'flinched') { const k = Math.sin(c01(1 - this.stateTimer / (this.stateDuration || 0.8)) * Math.PI); return mixP(PS.idle, PS.flinch, k); }
    if (st === 'pat_getsuga_charge') {
      const p = this.getsugaProgress ? this.getsugaProgress() : 0;
      return p < 0.76 ? mixP(PS.idle, PS.karokWind, ss(p / 0.3)) : PS.charge;
    }
    if (st === 'karok_clash') {
      const c = this.karokClash || { phase: 'intro' };
      if (c.phase === 'finish' && c.win) {
        const A = window.KAROK_SMASH || { WRENCH: 0.6, SMASH: 1.5 };
        const ft = c.finishT || 0;
        if (ft < A.WRENCH) return mixP(PS.karokLock, PS.flinch, ss(ft / A.WRENCH));
        if (ft < A.SMASH) return PS.flinch;
        return mixP(PS.flinch, PS.prone, ss((ft - A.SMASH) / 0.2));
      }
      const o = Object.assign({}, PS.karokLock); o.lunge += Math.sin(now() * 34) * 1.2; o.pitch += Math.sin(now() * 29) * 0.03; return o;
    }
    if (m) {
      if (m.kind === 'herd') { const o = Object.assign({}, PS.herd); if (m.phase === 'intro') o.jaw = m.t < m.introDur * 0.3 ? 0.3 : 1; return o; }
      if (m.kind === 'heart') {
        if (m.phase === 'intro') return mixP(PS.idle, PS.heartOpen, ss(m.t / m.introDur));
        if (m.phase === 'open') { const o = Object.assign({}, PS.heartOpen); o.rear = 0.9 + Math.sin(now() * 5) * 0.03; return o; }
        return mixP(PS.heartOpen, PS.stagger, ss((m.phase === 'ok' ? m.t - m.okAt : m.t - m.failAt) / 0.5));
      }
      if (m.kind === 'cage') {
        if (m.phase === 'intro') { const k = m.t / m.introDur; return k < 0.62 ? mixP(PS.idle, PS.rear1, ss(k / 0.55)) : mixP(PS.rear1, PS.cagePlant, ss((k - 0.62) / 0.12)); }
        return PS.cagePlant;
      }
      if (m.kind === 'charge') return mixP(PS.idle, PS.roar, ss(m.t / (m.introDur * 0.4)));
    }
    switch (st) {
      case 'cv_antler_sweep': {
        const frames = [[0, PS.idle], [0.25, sd > 0 ? PS.away : mixP(PS.away, PS.away, 0)], [0.8, PS.away], [0.88, PS.swing], [1.35, PS.swing], [1.7, PS.away], [1.78, PS.swing], [2.4, PS.idle]];
        const o = K(t, frames); if (sd < 0) { o.yaw = -o.yaw; } return o;
      }
      case 'cv_gore_thrust': {
        const o = K(t, [[0, PS.idle], [0.22, PS.scrape1], [0.4, PS.scrape1], [0.85, PS.scrape1], [1.1, PS.scrapeHold], [1.5, PS.scrapeHold], [1.58, PS.lungeP], [1.9, PS.lungeP], [2.3, PS.scrape1], [2.45, PS.lungeP], [2.8, PS.lungeP], [3.3, PS.idle]]);
        const s1 = Math.max(0, Math.sin(c01((t - 0.2) / 0.22) * Math.PI)), s2 = Math.max(0, Math.sin(c01((t - 0.78) / 0.22) * Math.PI));
        o.pawL = Math.max(s1, s2); return o;
      }
      case 'cv_hoof_combo': {
        const stomps = [0.75, 1.25, 1.75], o = K(t, [[0, PS.idle], [0.3, mk({ rear: 0.35, pitch: 0.1, neck: 0.2 })], [2.0, mk({ rear: 0.3, pitch: 0.15 })], [2.25, mk({ kick: 0, pitch: 0.5, crouch: 0.2 })], [2.45, mk({ kick: 1, crouch: 0.15, pitch: 0.3 })], [2.9, PS.idle]]);
        const bump = (at, w) => Math.max(0, 1 - Math.abs(t - (at - 0.12)) / w);
        o.liftL = Math.max(bump(0.75, 0.3), bump(1.75, 0.3)); o.liftR = bump(1.25, 0.3);
        o.rear = o.rear + Math.sin(t * 7) * 0.05; o.ribs = 0.5;
        return o;
      }
      case 'cv_tine_rain': return K(t, [[0, PS.idle], [0.5, PS.tineUp], [3.0, PS.tineUp], [3.9, PS.idle]]);
      case 'cv_rear_stomp': return K(t, [[0, PS.idle], [0.95, PS.rear1], [1.4, PS.rear1], [1.5, PS.slam], [1.62, PS.slam], [1.8, mixP(PS.rear1, PS.slam, 0.5)], [1.95, PS.slam], [2.5, PS.slam], [2.6, mixP(PS.rear1, PS.slam, 0.4)], [2.75, PS.slam], [3.6, PS.idle]]);
      case 'cv_stampede': {
        const sp = this._sp, moving = sp && sp.moving;
        if (moving) return PS.charge;
        const o = K(t, [[0, PS.idle], [0.3, PS.stampWind], [1.4, PS.stampWind]]);
        o.pawL = Math.max(0, Math.sin(t * 11)); o.pawR = Math.max(0, -Math.sin(t * 11));
        o.yaw = sp && sp.round === 0 && t < 1.4 ? Math.sin(t * 4.2) * 0.65 * c01(1 - Math.max(0, t - 1.0) / 0.4) : 0;
        return o;
      }
      case 'cv_mantle_lash': return K(t, [[0, PS.idle], [0.32, PS.lash], [0.46, PS.lash], [0.52, PS.lashCrack], [0.95, PS.lashCrack], [1.5, PS.idle]]);
      case 'cv_hollow_howl': return K(t, [[0, PS.idle], [0.7, PS.howl], [1.1, PS.howl], [1.25, PS.howlOut], [1.9, PS.howlOut], [2.5, PS.idle]]);
      case 'cv_marrow_spit': return K(t, [[0, PS.idle], [0.55, PS.spit], [0.9, PS.spitFire], [1.05, PS.spitOut], [2.3, PS.idle]]);
    }
    return PS.idle;
  };

  P.resetRig = function () {
    this._cvPh = 0; this._cvPose = null; this._cvVel = 0; this._cvLast = null; this._cvT = 0; this._cvFlash = 0;
    this._cvDeath = 0; this._tips = [];
  };
  P.updateRig = function (dt) {
    if (this._cvPose === undefined) this.resetRig();
    this._cvT = (this._cvT || 0) + dt;
    const last = this._cvLast;
    if (last && dt > 0) { const v = Math.hypot(this.x - last.x, (this.y - last.y) / T()) / dt; this._cvVel += (Math.min(v, 1400) - this._cvVel) * Math.min(1, dt * 10); }
    this._cvLast = { x: this.x, y: this.y };
    this._cvPh = (this._cvPh || 0) + dt * (this._cvVel > 6 ? (1.2 + Math.min(7.5, this._cvVel * 0.022)) : 0);
    const tgt = this.cervPoseTarget();
    if (!this._cvPose) this._cvPose = Object.assign({}, tgt);
    else { const k = Math.min(1, dt * 14); for (const key in BASE) this._cvPose[key] += (tgt[key] - this._cvPose[key]) * k; }
  };
  P.livePose = function () { return this._cvPose || BASE; };

  // ---- the draw kit (module-level so the helpers stay small; drawCervanth is not re-entrant) ----------------------------------
  let ctx, S, FL = 0;
  function rgb(c, f, a) {
    const m = FL; // hit flash: blend toward white
    const r = Math.min(255, (c[0] * f) + (255 - c[0] * f) * m), g = Math.min(255, (c[1] * f) + (255 - c[1] * f) * m), b = Math.min(255, (c[2] * f) + (255 - c[2] * f) * m);
    return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (a === undefined ? 1 : a) + ')';
  }
  const dshade = (d) => 0.55 + 0.45 * c01((d + 110 * S) / (220 * S));
  function plate(a, b, w0, w1, base, edge, f, hiA) {
    const dx = b.sx - a.sx, dy = b.sy - a.sy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L; w0 *= S; w1 *= S;
    ctx.fillStyle = rgb(base, f); ctx.strokeStyle = rgb(edge, f, 0.85); ctx.lineWidth = Math.max(1, 1.4 * S);
    ctx.beginPath(); ctx.arc(a.sx, a.sy, w0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.sx, b.sy, w1, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.sx + nx * w0, a.sy + ny * w0); ctx.lineTo(b.sx + nx * w1, b.sy + ny * w1); ctx.lineTo(b.sx - nx * w1, b.sy - ny * w1); ctx.lineTo(a.sx - nx * w0, a.sy - ny * w0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(a.sx + nx * w0, a.sy + ny * w0); ctx.lineTo(b.sx + nx * w1, b.sy + ny * w1); ctx.moveTo(a.sx - nx * w0, a.sy - ny * w0); ctx.lineTo(b.sx - nx * w1, b.sy - ny * w1); ctx.stroke();
    const sg = (nx * -0.5 + ny * -0.85) > 0 ? 1 : -1;
    ctx.fillStyle = 'rgba(190,170,215,' + (hiA === undefined ? 0.22 : hiA) * f + ')';
    ctx.beginPath(); ctx.moveTo(a.sx + sg * nx * w0 * 0.25, a.sy + sg * ny * w0 * 0.25); ctx.lineTo(b.sx + sg * nx * w1 * 0.25, b.sy + sg * ny * w1 * 0.25); ctx.lineTo(b.sx + sg * nx * w1 * 0.8, b.sy + sg * ny * w1 * 0.8); ctx.lineTo(a.sx + sg * nx * w0 * 0.8, a.sy + sg * ny * w0 * 0.8); ctx.closePath(); ctx.fill();
  }
  function blade(a, b, w, f, fill, edge, tipGlow) {
    const dx = b.sx - a.sx, dy = b.sy - a.sy, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w * S, ny = dx / L * w * S;
    ctx.lineJoin = 'miter';
    ctx.fillStyle = rgb(fill, f); ctx.strokeStyle = rgb(edge, f, 0.95); ctx.lineWidth = Math.max(1, 1.2 * S);
    ctx.beginPath(); ctx.moveTo(a.sx + nx, a.sy + ny); ctx.lineTo(a.sx + dx * 0.55 + nx * 0.45, a.sy + dy * 0.55 + ny * 0.45); ctx.lineTo(b.sx, b.sy); ctx.lineTo(a.sx + dx * 0.55 - nx * 0.45, a.sy + dy * 0.55 - ny * 0.45); ctx.lineTo(a.sx - nx, a.sy - ny); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,230,' + 0.28 * f + ')';
    ctx.beginPath(); ctx.moveTo(a.sx + nx * 0.1, a.sy + ny * 0.1); ctx.lineTo(b.sx, b.sy); ctx.lineTo(a.sx + nx * 0.8, a.sy + ny * 0.8); ctx.closePath(); ctx.fill();
    if (tipGlow) { ctx.strokeStyle = 'rgba(225,29,72,' + (0.9 * tipGlow * f) + ')'; ctx.lineWidth = 1.6 * S; ctx.beginPath(); ctx.moveTo(a.sx + dx * 0.62, a.sy + dy * 0.62); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
  }
  function boneLine(a, b, w, f) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgb([20, 12, 24], f); ctx.lineWidth = (w + 3) * S; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    ctx.strokeStyle = rgb(BONE_D, f); ctx.lineWidth = w * S; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    ctx.strokeStyle = rgb(BONE, f, 0.9); ctx.lineWidth = Math.max(1, w * 0.38) * S; ctx.beginPath(); ctx.moveTo(a.sx - w * 0.15 * S, a.sy - w * 0.22 * S); ctx.lineTo(b.sx - w * 0.15 * S, b.sy - w * 0.22 * S); ctx.stroke();
  }
  // a solid, painted ember (no glow): a dark ring, crimson disc, a pale core
  function ember(p, r, f) {
    ctx.fillStyle = 'rgba(40,6,16,' + (0.9 * f) + ')'; ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 1.25 * S, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(225,29,72,' + f + ')'; ctx.beginPath(); ctx.arc(p.sx, p.sy, r * S, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(253,164,175,' + f + ')'; ctx.beginPath(); ctx.arc(p.sx - r * 0.2 * S, p.sy - r * 0.2 * S, r * 0.5 * S, 0, 7); ctx.fill();
  }
  function ik(H, F, L1, L2, pole) {
    let dx = F[0] - H[0], dy = F[1] - H[1], dz = F[2] - H[2];
    let D = Math.hypot(dx, dy, dz) || 0.001; const maxR = (L1 + L2) * 0.97;
    if (D > maxR) { const k = maxR / D; dx *= k; dy *= k; dz *= k; D = maxR; F = [H[0] + dx, H[1] + dy, H[2] + dz]; }
    const ux = dx / D, uy = dy / D, uz = dz / D;
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const dot = pole[0] * ux + pole[1] * uy + pole[2] * uz;
    const px = pole[0] - ux * dot, py = pole[1] - uy * dot, pz = pole[2] - uz * dot, pl = Math.hypot(px, py, pz) || 1;
    return { knee: [H[0] + ux * a + px / pl * h, H[1] + uy * a + py / pl * h, H[2] + uz * a + pz / pl * h], foot: F };
  }
  const BEAM = [[0, 9, 8], [-6, 15, 36], [-22, 26, 66], [-46, 38, 90], [-76, 44, 106], [-108, 40, 114], [-138, 28, 104]];
  const TINES = [[1, [58, 22, 52]], [1, [34, 26, 80]], [2, [-8, 34, 108]], [3, [-26, 54, 132]], [3, [-34, 60, 98]], [4, [-62, 62, 150]], [4, [-84, 66, 118]], [5, [-96, 54, 154]], [5, [-124, 56, 126]], [6, [-166, 30, 106]]];

  // =========================================================================================================================
  // DRAW: the figure (the shared wrappers: Rebuke glint, part-break burst, Broken marks run around coreDraw)
  // =========================================================================================================================
  P.drawCervanth = function (c, X, Y, face, pose, o) {
    o = o || {};
    ctx = c; S = this.modelScale || 1; FL = o.flash || 0;
    const tilt = T(), cs = Math.cos(face), sn = Math.sin(face), T0 = this._cvT || 0, lift = (o.lift || 0);
    const Pj = (l) => { const wx = l[0] * cs - l[1] * sn, wy = l[0] * sn + l[1] * cs; return { sx: X + wx * S, sy: Y + wy * S * tilt - (l[2] + (o.dz || 0)) * S - lift, d: wy * S }; };
    const items = [];
    const add = (d, f) => items.push({ d, f });
    const alpha = o.alpha == null ? 1 : o.alpha;
    const moving = c01(this._cvVel / 40), fast = c01(this._cvVel / 300);
    const A = o.still ? 2 : (this._cvVel > 6 ? 6 + Math.min(34, this._cvVel * 0.2) : 2), gLift = this._cvVel > 6 ? 5 + Math.min(34, this._cvVel * 0.09) : 2;
    const ph = this._cvPh || 0;
    const bob = Math.sin(ph * 2) * (A > 10 ? 3 + fast * 4 : 0) + (A <= 10 ? Math.sin(T0 * 1.3) * 1.5 : 0) + (this.pelvisBounceZ || 0) * 0.15;
    const p = pose;
    const rear = p.rear, crouch = p.crouch, lunge = p.lunge;
    const chestUp = 126 + bob - crouch * 52 + rear * 70, chestFwd = 42 + lunge * 0.9 - rear * 22;
    const hipUp = 118 + bob - crouch * 34 - rear * 8, hipFwd = -48 + lunge * 0.5 - rear * 6, hipSide = p.hipYaw * 22;
    const chest = [chestFwd, 0, chestUp], hips = [hipFwd, hipSide, hipUp];
    const mid = lerp3(chest, hips, 0.5), midP = Pj(mid);
    const heartPos = [chestFwd + 10, 0, chestUp - 2];
    ctx.save();
    ctx.globalAlpha *= alpha;

    // shadow + aura
    const sh = Pj([0, 0, 0]);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(sh.sx, sh.sy + 2, 150 * S, 46 * S, 0, 0, 7); ctx.fill();

    // ---- body
    add(midP.d, function () { plate(Pj(chest), Pj(hips), 36, 34, OBS, OBS_L, dshade(midP.d), 0.18); });
    const open = this.heartOpen || 0;
    for (let i = 0; i < 9; i++) {
      const cc = lerp3(chest, hips, i / 8 * 0.92 + 0.04), cp = Pj(cc), breath = 1 + Math.sin(T0 * 1.3) * 0.02 + p.ribs * Math.sin(T0 * 9) * 0.05;
      const gap = 70 * open, run = [];
      for (let k = 0; k <= 22; k++) {
        const a = (110 + gap * 0.5 + k / 22 * (320 - gap)) * Math.PI / 180;
        const w = 33 * (1 + 0.35 * open * (Math.sin(a) > 0 ? 1 : 0.3));
        const q = Pj([cc[0], w * Math.cos(a) * breath, cc[2] + 35 * Math.sin(a) * breath]);
        run.push({ p: q, far: q.d < cp.d });
      }
      let seg = [run[0]];
      const flush = (sg) => {
        if (sg.length < 2) return;
        const far = sg[0].far, d = cp.d + (far ? -34 : 34) * S, s = sg.slice();
        add(d, function () {
          const f = dshade(d) * (far ? 0.85 : 1);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = rgb([20, 12, 24], f); ctx.lineWidth = 6.5 * S; ctx.beginPath(); ctx.moveTo(s[0].p.sx, s[0].p.sy); for (let q = 1; q < s.length; q++) ctx.lineTo(s[q].p.sx, s[q].p.sy); ctx.stroke();
          ctx.strokeStyle = rgb(BONE_D, f); ctx.lineWidth = 4 * S; ctx.stroke();
          ctx.strokeStyle = rgb(BONE, f, 0.8); ctx.lineWidth = 1.4 * S; ctx.stroke();
        });
      };
      for (let k = 1; k < run.length; k++) { if (run[k].far !== seg[0].far) { flush(seg); seg = [run[k - 1], run[k]]; } else seg.push(run[k]); }
      flush(seg);
    }
    for (let i = 0; i < 10; i++) {
      const cc = lerp3(chest, hips, i / 9), up0 = cc[2] + 34, a = Pj([cc[0], cc[1], up0]), b = Pj([cc[0] - 14, cc[1], up0 + 28 + (i % 2) * 8]);
      add(a.d + 0.5, function () { blade(a, b, 6, dshade(a.d), BONE_D, BONE, 0); });
    }
    for (let i = 1; i < 9; i += 2) {
      const cc = lerp3(chest, hips, i / 8 * 0.92 + 0.04);
      for (const s2 of [-1, 1]) {
        const a = Pj([cc[0], cc[1] + s2 * 32, cc[2] - 20]), b = Pj([cc[0] - 8, cc[1] + s2 * 40, cc[2] - 46]);
        add(a.d + 1, function () { blade(a, b, 4, dshade(a.d), BONE_D, BONE, 0.7); });
      }
    }
    // the ember heart: anime flame tongues (flame_art.js), sized by how bright the pose wants it and how far the ribs are open
    const hp = Pj(heartPos), heartK = c01(p.heart * (0.6 + 0.6 * open) + open * 0.4);
    add(midP.d + 0.4, function () {
      const FA = window.FlameArt, t = T0, r = (13 + 18 * open) * S * (0.6 + 0.4 * heartK);
      ctx.fillStyle = 'rgba(30,4,12,0.85)'; ctx.beginPath(); ctx.arc(hp.sx, hp.sy, r * 0.85, 0, 7); ctx.fill();
      if (FA && FA.tongue) {
        for (let i = 0; i < 5; i++) FA.tongue(ctx, hp.sx + (i - 2) * r * 0.32, hp.sy + r * 0.35, r * (1.25 + 0.5 * heartK) * (i === 2 ? 1.2 : 0.85), r * 0.27, t, 20 + i, { pal: 'pink', alpha: 0.5 + 0.5 * heartK, lean: (i - 2) * 0.08 });
      } else {
        ctx.fillStyle = 'rgb(225,29,72)'; ctx.beginPath(); ctx.arc(hp.sx, hp.sy, r * 0.6, 0, 7); ctx.fill();
      }
    });
    // rising embers (solid leaf shapes, no glow)
    add(midP.d + 38 * S, function () {
      for (let i = 0; i < 14; i++) {
        const u = (T0 * 0.3 + i * 0.137) % 1, q = Pj([-44 + (i * 37) % 90, ((i * 53) % 56) - 28, chestUp + 10 + u * 110]);
        ctx.fillStyle = 'rgba(' + (i % 2 ? '255,94,20' : '225,29,72') + ',' + ((1 - u) * 0.85) + ')';
        const w = (1.4 + (i % 3) * 0.6) * S, x = q.sx + Math.sin(T0 * 2 + i) * 4 * S, y = q.sy;
        ctx.beginPath(); ctx.moveTo(x, y - w * 1.6); ctx.quadraticCurveTo(x + w, y, x, y + w * 1.2); ctx.quadraticCurveTo(x - w, y, x, y - w * 1.6); ctx.fill();
      }
    });
    // shoulder blades
    for (const s2 of [-1, 1]) {
      const sa = Pj([chestFwd - 12, s2 * 24, chestUp + 28]), sb = Pj([chestFwd - 40, s2 * 38, chestUp + 78]), sc = Pj([chestFwd - 8, s2 * 26, chestUp + 30]), sd = Pj([chestFwd - 2, s2 * 34, chestUp + 66]);
      add(sa.d + 4, function () { const f = dshade(sa.d); blade(sa, sb, 11, f, OBS, BONE, 1); blade(sc, sd, 7, f, OBS_L, BONE, 0); });
    }

    // ---- legs
    const gp = [[38, -24, 0, true, 'L'], [38, 24, Math.PI, true, 'R'], [-46, -24, Math.PI, false, 'L'], [-46, 24, 0, false, 'R']];
    for (const [fx, sd, phs, front, side] of gp) {
      const u = (((ph + phs) % TAU) + TAU) % TAU;
      let fwd = fx + lunge * (front ? 0.55 : 0.2), up = 4;
      if (A < 6) fwd -= 2;
      else if (u < Math.PI) fwd += A * (1 - 2 * u / Math.PI);
      else { const w = (u - Math.PI) / Math.PI; fwd += -A + 2 * A * w; up = 4 + gLift * Math.sin(w * Math.PI); }
      let ft = [fwd + (front ? 4 : -6), sd, up];
      if (front) {
        const paw = side === 'L' ? p.pawL : p.pawR, lf = side === 'L' ? p.liftL : p.liftR;
        if (paw > 0) { ft[0] += Math.sin(T0 * 15) * 22 * paw + 14 * paw; ft[2] += 22 * paw; }
        if (lf > 0) ft[2] += 38 * lf;
        if (rear > 0) { ft[0] = lerp(ft[0], fx + 26, rear); ft[2] = lerp(ft[2], chestUp - 52, rear); }
      } else {
        if (p.kick > 0) { ft[0] = lerp(ft[0], fx - 70, p.kick); ft[2] += 54 * p.kick; }
        ft[1] += hipSide * 0.6;
      }
      const H = front ? [chestFwd - 4, sd, chestUp - 8] : [hipFwd + 2, sd + hipSide * 0.5, hipUp - 6];
      const L1 = front ? 62 : 68, L2 = front ? 68 : 66;
      const r = ik(H, ft, L1, L2, [front ? 1 : -1, 0, 0.25]);
      const hP = Pj(H), kP = Pj(r.knee), fP = Pj(r.foot), kb = Pj([r.knee[0] + (front ? 20 : -20), r.knee[1], r.knee[2] + 8]);
      const d = (hP.d + kP.d + fP.d) / 3;
      add(d, function () {
        const f = dshade(d);
        plate(hP, kP, front ? 16 : 18, 9.5, OBS, BONE, f, 0.2);
        plate(kP, fP, 9, 5.5, OBS, BONE, f, 0.2);
        ctx.fillStyle = rgb(BONE, f); ctx.beginPath(); ctx.arc(kP.sx, kP.sy, 5.5 * S, 0, 7); ctx.fill();
        ctx.fillStyle = rgb(CRIM, f, 0.9); ctx.beginPath(); ctx.arc(kP.sx, kP.sy, 2.2 * S, 0, 7); ctx.fill();
        blade(kP, kb, 6, f, BONE_D, BONE, 1);
        for (let k = -1; k <= 1; k++) { const tk = Pj([r.foot[0] + 20, r.foot[1] + k * 5, r.foot[2] - 3]), bs = Pj([r.foot[0] + 2, r.foot[1] + k * 3, r.foot[2] + 2]); blade(bs, tk, 3.6, f, BONE, BONE_D, 0); }
        const dc = Pj([r.foot[0] - 10, r.foot[1], r.foot[2] + 8]); blade(fP, dc, 3, f, BONE_D, BONE, 0);
      });
    }

    // ---- neck and head
    const nb = [chestFwd + 10, 0, chestUp + 14];
    const neckV = p.neck;
    const topUp = chestUp + 70 + neckV * 50 + rear * 6, topFwd = chestFwd + 58 + (neckV < 0 ? -neckV * 30 : -neckV * 10) + lunge * 0.4;
    const swayN = Math.sin(T0 * 1.1) * 3;
    const nt = [topFwd, 0, topUp];
    const neckPts = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, cc = lerp3(nb, nt, t);
      cc[2] += Math.sin(t * Math.PI) * 14 * (1 - Math.min(1, Math.abs(neckV) * 0.4)) + Math.sin(t * Math.PI * 2) * p.coil * 18;
      cc[0] -= Math.sin(t * Math.PI) * p.coil * 16;
      cc[1] += swayN * t * (1 - c01(crouch)) + p.yaw * 22 * t + Math.sin(t * Math.PI) * p.coil * 10;
      neckPts.push(Pj(cc));
    }
    for (let i = 0; i < 5; i++) {
      const a = neckPts[i], b = neckPts[i + 1], d = (a.d + b.d) / 2, w0 = 21 - i * 2.4, w1 = 21 - (i + 1) * 2.4;
      add(d, function () { plate(a, b, w0, w1, OBS, BONE, dshade(d), 0.2); });
      add(d + 0.3, function () { const f = dshade(d); blade({ sx: a.sx, sy: a.sy - w0 * S * 0.6 }, { sx: a.sx - 3 * S, sy: a.sy - w0 * S * 1.5 }, 3, f, BONE_D, BONE, 0); });
    }
    if (p.throat > 0.02) { const tp = neckPts[3]; add(tp.d + 1, function () { const FA = window.FlameArt, r = 9 * S * p.throat; if (FA && FA.tongue) FA.tongue(ctx, tp.sx, tp.sy + r * 0.6, r * 2.2, r * 0.6, T0, 41, { pal: 'pink', alpha: 0.4 + 0.6 * p.throat }); else ember(tp, 5 * p.throat, 1); }); }

    const pitch = p.pitch, yaw = p.yaw;
    const fv = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch)];
    const uv = [Math.sin(pitch) * Math.cos(yaw), Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)];
    const sv = [-Math.sin(yaw), Math.cos(yaw), 0];
    const swayX = p.yaw * 22 + swayN * 0.5 * (1 - c01(crouch));
    const headL = (a, b, cz) => [nt[0] + fv[0] * a + sv[0] * b + uv[0] * cz, nt[1] + swayX + fv[1] * a + sv[1] * b + uv[1] * cz, nt[2] + fv[2] * a + sv[2] * b + uv[2] * cz];
    const jaw = p.jaw;
    const hb = Pj(headL(-12, 0, 0)), hm = Pj(headL(30, 0, -4)), ht = Pj(headL(64, 0, -12)), jt = Pj(headL(52, 0, -24 - jaw * 30)), jb = Pj(headL(-2, 0, -8));
    const hd = Pj(headL(10, 0, 0)).d;
    add(hd + 0.5, function () {
      const f = dshade(hd);
      plate(jb, jt, 6, 3.5, BONE_D, BONE, f * 0.9, 0.2);
      if (jaw > 0.3) { const mo = Pj(headL(36, 0, -12 - jaw * 12)); const FA = window.FlameArt, r = (3 + jaw * 5) * S; if (FA && FA.tongue) FA.tongue(ctx, mo.sx, mo.sy + r, r * 2.3, r * 0.7, T0, 55, { pal: 'pink', alpha: 0.35 + 0.5 * jaw }); }
      for (const s2 of [-1, 1]) { const lf = Pj(headL(50, s2 * 5, -24 - jaw * 30)), lb = Pj(headL(48, s2 * 5, -10 - jaw * 14)); blade(lf, lb, 2.6, f, BONE, BONE_D, 0); }
    });
    add(hd + 1, function () {
      const f = dshade(hd);
      plate(hb, hm, 17, 12, OBS, BONE, f, 0.25);
      plate(hm, ht, 11, 5.5, OBS, BONE, f, 0.25);
      for (const s2 of [-1, 1]) {
        const ub = Pj(headL(46, s2 * 5, -9)), ut = Pj(headL(50, s2 * 5, -26)); blade(ub, ut, 3.4, f, BONE, BONE_D, 0);
        const bb = Pj(headL(8, s2 * 11, 8)), bt = Pj(headL(40, s2 * 13, 26)); blade(bb, bt, 6, f, BONE_D, BONE, 1);
        const cb = Pj(headL(-6, s2 * 13, -6)), ct = Pj(headL(-34, s2 * 20, -22)); blade(cb, ct, 5, f, OBS_L, BONE, 0);
      }
    });
    const charging = !!(this._sp && this._sp.moving);
    add(hd + 2, function () {
      for (const s of [-1, 1]) {
        const e = Pj(headL(24, s * 9, 5)); if (e.d < hd - 2) continue;
        if (charging) { const tr = Pj(headL(-50, s * 9, 14)); ctx.strokeStyle = 'rgba(225,29,72,.55)'; ctx.lineWidth = 3 * S; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(e.sx, e.sy); ctx.lineTo(tr.sx, tr.sy); ctx.stroke(); }
        ember(e, 3.0, 1); ctx.fillStyle = 'rgba(255,235,240,.98)'; ctx.beginPath(); ctx.ellipse(e.sx, e.sy, 2.4 * S, 1.1 * S, -0.35, 0, 7); ctx.fill();
      }
    });
    add(hd - 2.5, function () { for (const s of [-1, 1]) { const e = Pj(headL(24, s * 9, 5)); if (e.d < hd - 2) ember(e, 2.2, 0.8); } });

    // ---- antlers (the break points). Broken: just a stump. Pose: spread widens them, back sweeps them, plant drives them down.
    const crown = this._cvCrown || 0, flick = this._cvFlick || 0;
    this._tips = [];
    const ps = Math.sin(T0 * 1.1) * 3 + (p.yaw) * 6;
    for (const s of [-1, 1]) {
      const broken = s < 0 ? this.leftPauldronBroken : this.rightPauldronBroken;
      const sp = 1 + 0.4 * p.spread;
      const adj = (b, i) => {
        let a = b[0] * (1 - p.back * 0.25), bb = b[1] * sp, z = b[2];
        if (p.plant > 0) { z = lerp(z, -b[0] * 0.7 - 20, p.plant); a = lerp(a, b[0] * 0.5 + 40, p.plant); }
        return headL(a, s * bb + ps * s * (i * 0.1), z);
      };
      const n = broken ? 3 : BEAM.length;
      const pts = [];
      for (let i = 0; i < n; i++) pts.push(Pj(adj(BEAM[i], i)));
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], d = (a.d + b.d) / 2, w = 8 - i * 0.85; add(d + 1.5, function () { boneLine(a, b, w + 1.2, dshade(d)); }); }
      if (broken) { const tp = pts[pts.length - 1]; add(tp.d + 2, function () { const f = dshade(tp.d); ctx.fillStyle = rgb(BONE, f); ctx.beginPath(); ctx.arc(tp.sx, tp.sy, 4.5 * S, 0, 7); ctx.fill(); ctx.strokeStyle = rgb(CRIM, f, 0.9); ctx.lineWidth = 1.4 * S; ctx.stroke(); }); continue; }
      const tipP = pts[pts.length - 1];
      this._tips.push({ x: tipP.sx, y: tipP.sy });
      add(tipP.d + 2, function () { ember(tipP, 3.6, 0.85); });
      for (let ti = 0; ti < TINES.length; ti++) {
        const tn = TINES[ti], a = pts[tn[0]];
        const tip = Pj(headL(tn[1][0] * (1 - p.back * 0.25), s * tn[1][1] * sp + ps * s * 0.8 + Math.sin(T0 * 1.7 + ti) * 1.5, p.plant > 0 ? lerp(tn[1][2], -20, p.plant) : tn[1][2]));
        const d = (a.d + tip.d) / 2, lit = crown > 0 ? c01(crown * 1.15 - ti / TINES.length) : 0;
        const flk = flick > 0 && ((Math.floor(T0 * 22) + ti) % 3 === 0) ? 1 : 0;
        add(d + 1.5, function () { blade(a, tip, 5.2 - (ti % 3) * 0.6, dshade(d), BONE_D, BONE, Math.max(0.35, lit, flk)); });
        if (lit > 0.5 || flk) add(tip.d + 2, function () { ember(tip, 3.2, Math.max(lit, flk)); });
        if (ti === TINES.length - 1) this._tips.push({ x: tip.sx, y: tip.sy });
      }
    }

    // ---- mantle strips (tattered, they trail the body)
    const vs = c01(this._cvVel / 120), flare = p.flare;
    for (let sdi = 0; sdi < 2; sdi++) {
      const s = sdi ? 1 : -1;
      for (let i = 0; i < 6; i++) {
        const base = [lerp(34, -44, i / 5) + lunge * 0.4, s * 17, 140 + bob - crouch * 40 + rear * 40], wv = Math.sin(T0 * 2.4 + i * 0.9 + sdi) * 10 + vs * 14;
        const end = [base[0] - 18 - wv - vs * 26 - flare * 10, base[1] + s * (10 + wv * 0.4 + flare * 26), base[2] - 56 - (i % 2) * 14 + flare * 40];
        const a = Pj(base), b = Pj(end), d = a.d - 3;
        add(d, function () { blade(a, b, 9, dshade(d), BLOOD, CRIM, 0); });
      }
    }
    for (let i = 0; i < 3; i++) {
      const base = [hipFwd - 6, hipSide + (i - 1) * 8, hipUp + 4], wv = Math.sin(T0 * 2.8 + i) * 12 + vs * 10;
      const a = Pj(base), b = Pj([hipFwd - 48 - wv * 0.3 - vs * 18, hipSide + (i - 1) * 16 + wv, hipUp - 30 - i * 6 + p.kick * 30]);
      add(a.d - 1, function () { blade(a, b, 7, dshade(a.d), BLOOD, CRIM, 0); });
    }

    items.sort((a, b) => a.d - b.d);
    for (let i = 0; i < items.length; i++) { ctx.save(); items[i].f(); ctx.restore(); }
    ctx.restore();
    this._handHeadTop = hb;
  };

  // =========================================================================================================================
  P.coreDraw = function (ctx2) {
    // vfx-driven pose bits (the tines lighting one by one, the tips flickering)
    this._cvCrown = 0; this._cvFlick = 0;
    for (const v of this.vfx || []) {
      if (v.k === 'crownLight') this._cvCrown = Math.max(this._cvCrown, c01(v.t / (v.life * 0.8)));
      else if (v.k === 'tipFlicker') this._cvFlick = 1;
    }
    if (this.hp <= 0) {
      if (!this._cvDeathAt) { this._cvDeathAt = now(); CervanthBoss.SFX && CervanthBoss.SFX.roar(1.6); }
      const el = now() - this._cvDeathAt;
      if (el > 4.5) return;
      const pose = K(el, [[0, PS.stagger], [1.0, PS.prone], [4.5, PS.prone]]);
      this._cvPose = pose;
      this.drawCervanth(ctx2, this.x, this.y, this.facingAngle, pose, { alpha: 1 - c01((el - 2.6) / 1.9), still: true });
      return;
    }
    this._cvDeathAt = 0;
    if (!this._cvPose) this.resetRig();
    const pose = this._cvPose || BASE;
    const X = this.x + this.recoilX * 0.3, Y = this.y + this.recoilY * 0.3;
    const flash = this.hitFlashTimer > 0 ? 0.45 : 0;
    this.drawCervanth(ctx2, X, Y, this.facingAngle, pose, { flash, lift: this.jumpZ || 0 });
    this.drawCounterTell(ctx2, X, Y);
  };

  // COUNTER TELL: the same pulsing blue chest ring Vaelgor, Ignis and Hush use
  P.drawCounterTell = function (ctx2, X, Y) {
    if (!this.isCounterable()) return;
    const S2 = this.modelScale || 1, cy = Y - 130 * S2 - (this.jumpZ || 0);
    const pulse = 0.6 + Math.sin(now() * 12) * 0.4, r = 70 * S2 + pulse * 8;
    ctx2.save();
    ctx2.strokeStyle = '#38bdf8';
    for (const [w, a] of [[26, 0.18], [16, 0.35], [4, 1]]) { ctx2.lineWidth = w; ctx2.globalAlpha = pulse * a; ctx2.beginPath(); ctx2.arc(X, cy, r, 0, TAU); ctx2.stroke(); }
    ctx2.restore();
  };

  // Karok: no sword to draw (the clash is antlers against the hammer); Vaelgor's blade must not appear
  P.drawKarokSword = function () {};
  P.drawGetsugaCharge = function () {};
  P.getKarokBossPose = function () { return null; };
  P.handWorld = function () { return { x: this.x, y: this.y, z: 120 }; };

  // the raid-menu preview: standing in the glade, head turned, antlers rattling slightly
  P.drawPreview = function (ctx2) {
    if (this._cvPose === undefined || !this._cvPose) this.resetRig();
    this.state = 'idle'; this.speed = 0;
    this._cvT = (this._cvT || 0) + 1 / 60;
    this._cvPose = Object.assign({}, PS.idle);
    this._cvPose.pitch = 0.05; this._cvPose.neck = 0.35; this._cvPose.jaw = 0.4;
    this.leftPauldronBroken = this.rightPauldronBroken = false;
    this.drawCervanth(ctx2, 0, 0, Math.PI * 0.5 + 0.5, this._cvPose, { still: true });
  };

  CervanthBoss.RIG = { PS, BASE };
})();
