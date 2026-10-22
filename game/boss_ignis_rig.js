// =========================================================================
// BOSS_IGNIS_RIG.JS — how Ignis Vane looks: her model, poses, floor telegraphs, the decoys / braziers / sun of her mechanics,
// everything in the air, the Gilded Pyre stage, and her screen overlays (the playbill, the puzzle panels, the Ego fan gauge).
// Logic is in boss_ignis.js. All of it is attached to IgnisVaneBoss.prototype.
//
// The model is a real 2.5D rig: every joint is a point in her own frame (forward / side / up), projected with the arena tilt, and
// every part is depth-sorted each frame, so she turns, twirls and bows properly instead of flipping a sprite.
//   long crimson tailcoat (front cut away, tails reaching the ankles, flame-cut hem, black lining), black gold-laced bodice,
//   high flame collar, gold epaulettes, bell-cuffed sleeves and long black gloves, heeled boots, a flowing ponytail of flame,
//   a folding fan (lacquered ribs, painted silk) and a crown of five flames floating over her head.
// =========================================================================
(function () {
  if (typeof IgnisVaneBoss === 'undefined') return;
  const P = IgnisVaneBoss.prototype;
  const TAU = Math.PI * 2;
  const T = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.58);
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (t) => { t = c01(t); return t * t * (3 - 2 * t); };
  const now = () => performance.now() / 1000;
  const PRONE_HOLD = 2.4, PRONE_RISE = 0.6;     // seconds face-down after a Grave Anchor, then getting up

  // ---- body measurements (her own units; modelScale makes her ~1.5x a player) ------------------------------------------------
  const PEL = 44, WAIST = 52, CHEST = 62, SHO = 71, NECK = 75.5, HEADC = 81.8, HEADR = 6.3;
  const SHO_W = 7.4, HIP_W = 4.4, WAIST_W = 4.3, CHEST_W = 6.1, UPPER = 13.2, FORE = 12.6, THIGH = 22.5, SHIN = 22;

  const COL = {
    coat: '#a3112f', coatHi: '#d61f45', coatDk: '#5c0718', lining: '#1a0710', trim: '#f2b632', trimDk: '#a86d10',
    bodice: '#150a10', skin: '#f5cfb6', skinDk: '#d9a184', hair: '#c2241a', hair2: '#f26b1d', hair3: '#ffd04a',
    boot: '#0d0910', glove: '#120b10', heel: '#d9a521', silk: '#b91c1c', silk2: '#ef4444', rib: '#1d1116', silver: '#d4dbe6'
  };

  // ---- poses ----------------------------------------------------------------------------------------------------------------
  // up: pelvis lift · lean: chest forward · twist: torso yaw · sway: hip shift · r*/l*: right (fan) / left hand targets
  // fan: open 0..1 · fy/fp/fr: fan yaw / pitch / roll · ht/hn: head turn / nod · kn: kneel · cast: flame in the left palm
  // (her resting fan is held open beside her shoulder, clear of her face)
  const BASE = { up: 0, lean: 0, twist: 0, sway: 0, rf: 7, rs: 10.5, ru: 64, lf: 1.5, ls: -7.8, lu: 48.5, fan: 1, fy: 0.85, fp: 0.85, fr: 0.25, ht: 0, hn: 0, kn: 0, cast: 0, stow: 0 };
  const mk = (o) => Object.assign({}, BASE, o);
  const PS = {
    idle: mk({ sway: 1.5, twist: 0.12, ht: -0.12 }),
    fanReady: mk({ rf: 10, rs: 10, ru: 62, fan: 0, fy: 0.25, fp: 0.35, twist: 0.25 }),
    fanBack: mk({ rf: -3, rs: 13, ru: 77, fan: 0.15, fy: 2.3, fp: 0.85, twist: 0.6, lean: -1.5 }),
    sweptL: mk({ rf: 15, rs: -9, ru: 60, fan: 1, fy: -1.35, fp: 0.05, fr: 1.45, twist: -0.6, lean: 3.5 }),
    backL: mk({ rf: 6, rs: -10, ru: 67, fan: 0.6, fy: -2.1, fp: 0.4, fr: 1.2, twist: -0.65 }),
    sweptR: mk({ rf: 15, rs: 12, ru: 60, fan: 1, fy: 1.25, fp: 0.05, fr: 1.45, twist: 0.55, lean: 3.5 }),
    flickCock: mk({ rf: 3, rs: 8, ru: 71, fan: 0, fy: 0, fp: 1.25, twist: 0.35 }),
    flick: mk({ rf: 20, rs: 3.5, ru: 63, fan: 1, fy: 0, fp: 0.15, fr: 1.55, lean: 4.5, twist: -0.12 }),
    spinUp: mk({ up: 3.5, rf: 3, rs: 18, ru: 75, lf: 3, ls: -18, lu: 75, fan: 1, fy: 1.57, fp: 0.55, fr: 0.0, hn: -0.2 }),
    throwWind: mk({ lf: -7, ls: -10, lu: 79, cast: 1, twist: -0.55, rf: 6, rs: 8, ru: 62, fan: 0.4 }),
    throwRel: mk({ lf: 19, ls: -3, lu: 68, cast: 0.2, twist: 0.4, lean: 3.5, rf: 4, rs: 9, ru: 58, fan: 0.4 }),
    curtsy: mk({ up: -11, lean: 6.5, hn: 0.5, rf: 8, rs: 15, ru: 44, lf: 8, ls: -15, lu: 44, fan: 1, fy: 1.0, fp: -0.5 }),
    pointUp: mk({ rf: 4, rs: 7, ru: 99, fan: 0, fp: 1.5, fy: 0, hn: -0.35 }),
    whipWind: mk({ lf: -8, ls: -13, lu: 75, twist: -0.75, cast: 1, rf: 8, rs: 6, ru: 70 }),
    whipSweep: mk({ lf: 18, ls: 9, lu: 62, twist: 0.6, cast: 1, lean: 2 }),
    crackWind: mk({ lf: 2, ls: -6, lu: 88, cast: 1, twist: -0.2, lean: -2 }),
    crack: mk({ lf: 23, ls: -2, lu: 57, lean: 5.5, cast: 1, twist: 0.1 }),
    kissLips: mk({ lf: 7.5, ls: -1.2, lu: 79.5, hn: 0.12, ht: 0.1 }),
    kissBlow: mk({ lf: 21, ls: -2, lu: 76, ht: 0.18, hn: -0.05 }),
    smug: mk({ sway: 2.2, twist: 0.2, ht: 0.45, hn: -0.18 }),
    slam: mk({ rf: 15, rs: 6, ru: 42, fan: 0, fy: 0, fp: -1.25, lean: 7, up: -5 }),
    armsUp: mk({ rf: 5, rs: 12, ru: 97, lf: 5, ls: -12, lu: 97, fan: 1, fp: 1.4, fy: 0, hn: -0.4 }),
    bow: mk({ lean: 6, hn: 0.35, rf: 10, rs: 15, ru: 52, lf: 10, ls: -15, lu: 52, up: -3 }),
    lunge: mk({ lean: 8, up: -4, rf: 15, rs: 10, ru: 66, fan: 0, fy: 0.3, fp: 0.2, lf: -5, ls: -11, lu: 62, twist: 0.2 }),
    mirrorCast: mk({ rf: 17, rs: 6, ru: 71, fan: 1, fy: 0, fp: 0.4, fr: 1.5, lf: 15, ls: -6, lu: 70, lean: 2 }),
    hairFlip: mk({ twist: -0.85, ht: -0.95, lf: -2, ls: -5, lu: 87, hn: -0.25 }),
    firework: mk({ lf: 8, ls: -6, lu: 101, cast: 1, rf: 9, rs: 9, ru: 60, hn: -0.45 }),
    stagger: mk({ kn: 1, lean: 9, hn: 0.6, rf: 12, rs: 13, ru: 22, lf: 10, ls: -12, lu: 27, fan: 0, fy: 0.6, fp: -1.4 }),
    flinch: mk({ lean: -8, up: -3, hn: -0.45, rf: 2, rs: 16, ru: 60, lf: 2, ls: -15, lu: 62, fan: 0.6, fy: 1.8 }),
    clash: mk({ rf: 20, rs: 3, ru: 64, fan: 1, fy: 0, fp: 0.1, fr: 1.57, lf: 19, ls: -3, lu: 62, lean: 5, up: -3 }),
    nails: mk({ lf: 13, ls: -2, lu: 69, ht: -0.4, hn: 0.42, sway: 2 }),
    yawn: mk({ lf: 7, ls: -1, lu: 83, hn: -0.4 }),
    twirlHair: mk({ lf: 2, ls: -5.5, lu: 89, ht: 0.25, sway: 2 }),
    kneelIntro: mk({ kn: 0.75, lean: 7, hn: 0.7, rf: 7, rs: 6, ru: 52, lf: 7, ls: -6, lu: 52, fan: 0 }),
    duetWind: mk({ rf: -6, rs: 12, ru: 74, fan: 1, fy: 2.6, fp: 0.3, fr: 1.5, twist: 0.85, lean: -2, lf: 12, ls: -6, lu: 66, cast: 1 }),
    duetFire: mk({ rf: 22, rs: 2, ru: 66, fan: 1, fy: 0, fp: 0.1, fr: 1.57, twist: -0.3, lean: 6, lf: 16, ls: -8, lu: 64 }),
    // Footlight Flash (her Karok move): arms thrown wide, palms swung together in front, then the beam (fan tucked in her sash)
    flashSpread: mk({ rf: -3, rs: 29, ru: 76, lf: -3, ls: -29, lu: 76, fan: 0, stow: 1, lean: -3, up: -3, hn: -0.25, sway: 0 }),
    flashAim: mk({ rf: 20, rs: 2.2, ru: 70, lf: 20, ls: -2.2, lu: 70, fan: 0, stow: 1, lean: 3, up: -3, hn: 0.05, sway: 0 }),
    flashFire: mk({ rf: 23, rs: 2.2, ru: 69, lf: 23, ls: -2.2, lu: 69, fan: 0, stow: 1, lean: 6.5, up: -4.5, hn: 0, sway: 0 }),
    // Grave Anchor: reeling from the broken beam, hooked and hauled, then flat on her face (drawn rotated, see proneInfo)
    reel: mk({ lean: -9, up: -2, hn: -0.5, rf: -2, rs: 18, ru: 66, lf: -2, ls: -18, lu: 66, fan: 0, stow: 1 }),
    hauled: mk({ lean: 9, up: -2, hn: 0.3, rf: 15, rs: 9, ru: 58, lf: 15, ls: -9, lu: 58, fan: 0, stow: 1 }),
    prone: mk({ lean: 0, up: 0, hn: -0.2, rf: 4, rs: 9, ru: 100, lf: 4, ls: -9, lu: 100, fan: 0, stow: 1 }),
    // Eyes on the Star: fan raised high, other hand on her hip, chin up ...
    starPose: mk({ up: 2, sway: 3, rf: 6, rs: 12, ru: 100, fan: 1, fy: 0.3, fp: 1.3, lf: 2, ls: -9.5, lu: 47, hn: -0.35, ht: 0.1 }),
    // ... and without her crown: the open fan held in front of her face, head turned away, free arm hugging herself
    hideFace: mk({ lean: -2, rf: 13, rs: -0.5, ru: 80, fan: 1, fy: 0, fp: 0.1, fr: 1.57, lf: 7, ls: 3, lu: 60, ht: -0.55, hn: 0.3, twist: -0.25 }),
    // Read the Script: the page held up in her left hand, eyes down on it
    read: mk({ lf: 11, ls: -2.5, lu: 73, hn: 0.32, ht: 0.05, sway: 1.5, rf: 6, rs: 11, ru: 58, fan: 1 })
  };
  // Twin Fans tells: the fan thrown high (right hand), or the flame held high in the left palm
  const PS_RAISE_R = mk({ rf: 4, rs: 13, ru: 101, fan: 1, fy: 0.2, fp: 1.45, lf: 3, ls: -8, lu: 50, hn: -0.3, twist: 0.25, sway: 2 });
  const PS_RAISE_L = mk({ lf: 3, ls: -13, lu: 101, cast: 1, rf: 6, rs: 10, ru: 52, fan: 0.6, hn: -0.3, twist: -0.25, sway: -2 });
  const PS_CUT_L = mk({ lf: 7, ls: -21, lu: 64, cast: 1, twist: -0.55, lean: 2.5, rf: 6, rs: 10, ru: 55, fan: 0.6, ht: -0.4 });
  function mixP(a, b, t) { const o = {}; for (const k in BASE) o[k] = lerp(a[k], b[k], t); return o; }
  // keyframes: [[sec, pose], ...] eased between
  function K(t, frames) {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
      if (t <= frames[i][0]) { const [t0, a] = frames[i - 1], [t1, b] = frames[i]; return mixP(a, b, ss((t - t0) / Math.max(1e-4, t1 - t0))); }
    }
    return frames[frames.length - 1][1];
  }
  const fanning = (p, k = 1) => { const w = Math.sin(now() * 7) * 0.25 * k; const o = Object.assign({}, p); o.fy += w; o.rf += w * 2; return o; };

  P.ignisPose = function () {
    const t = this.patT || 0, st = this.state;
    const m = this.mech;
    if (st === 'idle' || st === 'walk') {
      const mv = c01((this.speed - 4) / 60);
      const stride = this._stride || 0;
      // someone is Starstruck: she waits for them, arms open
      const smitten = ((window.game && window.game.party) || []).some(p => p && p.hp > 0 && p.ignisCharm > 0);
      const base = this.tantrumT > 0 ? mixP(PS.idle, PS.fanReady, 0.6) : (smitten ? fanning(PS.flashSpread, 0.4) : fanning(PS.idle, 1));
      if (mv < 0.02) return base;
      const walk = mk({ sway: stride * 2.4, twist: -stride * 0.2, rf: 3 - stride * 4, rs: 9.5, ru: 51, fan: 0, fy: 0.2, fp: -1.2, lf: 2 + stride * 5, ls: -8.2, lu: 51, ht: 0.05 });
      return mixP(base, walk, mv);
    }
    if (st === 'intro_cutscene') return K(t, [[0, PS.kneelIntro], [1.9, PS.kneelIntro], [2.15, PS.spinUp], [3.2, PS.spinUp], [3.55, fanning(PS.idle)], [5.4, PS.smug]]);
    if (st === 'staggered' && this._proneAt) {
      // face-down after a Grave Anchor, then pushed up onto her knees
      const el = now() - this._proneAt;
      return el < PRONE_HOLD ? PS.prone : mixP(PS.prone, PS.stagger, ss((el - PRONE_HOLD) / PRONE_RISE));
    }
    if (st === 'staggered') {
      const out = mixP(PS.stagger, PS.idle, c01((0.35 - this.stateTimer) / 0.35));
      out.hn += Math.sin(now() * 3) * 0.05;
      return out;
    }
    if (st === 'rebuked' || st === 'flinched') { const k = Math.sin(c01(1 - this.stateTimer / (this.stateDuration || 0.6)) * Math.PI); return mixP(PS.idle, PS.flinch, k); }
    if (st === 'karok_clash') {
      const c = this.karokClash || { meter: 0.5, phase: 'intro' };
      const tr = Math.sin(now() * 40) * 0.35;
      if (c.phase === 'finish') {
        if (!c.win) return PS.flashFire;
        const A = window.KAROK_ANCHOR, ft = c.finishT || 0;
        if (ft < A.HIT) return K(ft, [[0, PS.flashFire], [0.22, PS.reel], [A.HIT, PS.reel]]);
        if (ft < A.YANK) { const o = K(ft, [[A.HIT, PS.flinch], [A.HIT + 0.12, PS.reel], [A.YANK, PS.hauled]]); o.hn += tr * 0.2; return o; }
        return K(ft, [[A.YANK, PS.hauled], [A.YANK + 0.25, PS.prone]]);
      }
      // the push: she leans into the beam while she's winning and is driven back on her heels while losing it
      const m = c.meter ?? 0.5;
      const o = c.phase === 'intro' ? K(c.t || 0, [[0, PS.flashAim], [0.3, PS.flashFire]]) : mixP(PS.flashFire, PS.flashFire, 0);
      o.lean = lerp(9, -7, m) + tr; o.up = lerp(-6, -2, m); o.rf = lerp(25, 18, m) + tr; o.lf = o.rf;
      return o;
    }
    if (st === 'pat_getsuga_charge') {
      // arms flung wide (the gather), palms swung together in front (the aim), the whole body thrown into the shot (the flash)
      const p = c01(1 - this.stateTimer / (this.stateDuration || 3.4));
      const tr = Math.sin(now() * 38) * 0.3 * c01((p - 0.2) / 0.5);
      let o;
      if (p < 0.76) o = K(p, [[0, PS.idle], [0.1, PS.flashSpread], [0.38, PS.flashSpread], [0.5, PS.flashAim], [0.76, PS.flashAim]]);
      else o = K(p, [[0.76, PS.flashAim], [0.79, PS.flashFire], [1, PS.flashFire]]);
      o = Object.assign({}, o); o.rf += tr; o.lf += tr; o.ru += tr; o.lu -= tr;
      return o;
    }
    if (m) {
      if (m.kind === 'curtain') {
        if (m.phase === 'intro') return PS.spinUp;
        return m.found ? fanning(PS.smug) : fanning(PS.idle, 0.6);
      }
      if (m.kind === 'pyre') return m.phase === 'intro' ? PS.spinUp : fanning(PS.armsUp, 0.3);
      // Act II: she spins out of her coat behind the curtain and is revealed arms wide in the gown
      if (m.kind === 'act2') return m.t < m.introDur * 0.5 ? PS.spinUp : (m.t > m.introDur - 0.7 ? PS.flashSpread : fanning(PS.smug, 0.5));
      if (m.kind === 'finale') {
        const k = Math.sin(now() * 1.6) * 0.03;
        const o = Object.assign({}, PS.armsUp); o.hn -= 0.15 + k; return o;
      }
    }
    switch (st) {
      case 'ig_fan_flick': return K(t, [[0, PS.idle], [0.3, PS.fanBack], [0.45, PS.sweptL], [0.62, PS.backL], [0.82, PS.sweptR], [0.98, PS.flickCock], [1.18, PS.flick], [1.75, fanning(PS.idle)]]);
      case 'ig_pirouette': return K(t, [[0, PS.idle], [0.6, PS.spinUp], [2.2, PS.spinUp], [2.55, PS.curtsy], [2.9, PS.idle]]);
      case 'ig_volley': return K(t, [[0, PS.idle], [0.27, PS.throwWind], [0.4, PS.throwRel], [0.57, PS.throwWind], [0.7, PS.throwRel], [0.87, PS.throwWind], [1.0, PS.throwRel], [1.17, PS.throwWind], [1.3, PS.throwRel], [1.47, PS.throwWind], [1.6, PS.throwRel], [2.0, PS.smug], [2.6, PS.idle]]);
      case 'ig_carpet': return K(t, [[0, PS.idle], [0.45, PS.slam], [0.75, PS.slam], [0.95, PS.smug], [1.75, PS.smug], [2.0, PS.armsUp], [2.6, PS.hairFlip], [3.0, PS.idle]]);
      case 'ig_curtsy': return K(t, [[0, PS.idle], [0.32, PS.curtsy], [0.95, PS.curtsy], [1.05, PS.spinUp], [1.5, PS.spinUp], [1.7, PS.slam], [1.85, PS.slam], [2.6, PS.idle]]);
      case 'ig_spotlight': return K(t, [[0, PS.idle], [0.4, PS.pointUp], [2.0, PS.pointUp], [2.6, PS.smug], [2.8, PS.pointUp], [3.0, PS.smug], [3.4, PS.idle]]);
      case 'ig_whip': return K(t, [[0, PS.idle], [0.55, PS.whipWind], [0.78, PS.whipSweep], [1.05, PS.whipSweep], [1.3, PS.crackWind], [1.48, PS.crack], [1.85, PS.crackWind], [2.05, PS.crack], [2.75, PS.idle]]);
      case 'ig_kiss': {
        const extra = this.phase >= 3 ? [[0.85, PS.kissLips], [1.05, PS.kissBlow], [1.3, PS.kissLips], [1.5, PS.kissBlow]] : (this.phase >= 2 ? [[0.85, PS.kissLips], [1.05, PS.kissBlow]] : []);
        const end = extra.length ? extra[extra.length - 1][0] : 0.55;
        return K(t, [[0, PS.idle], [0.35, PS.kissLips], [0.55, PS.kissBlow], ...extra, [end + 0.3, fanning(PS.smug)], [3.7, fanning(PS.smug)]]);
      }
      case 'ig_split': return K(t, [[0, PS.idle], [0.35, PS.pointUp], [0.55, PS.slam], [1.4, PS.slam], [1.8, fanning(PS.smug)], [2.25, PS.pointUp], [2.5, PS.slam], [3.0, PS.slam], [3.4, fanning(PS.smug)], [4.3, PS.idle]]);
      case 'ig_ovation': return K(t, [[0, PS.idle], [0.3, PS.armsUp], [2.3, PS.armsUp], [2.6, PS.bow], [3.2, PS.bow], [3.9, PS.idle]]);
      case 'ig_tango': {
        const beats = [0.5, 1.1, 1.7, 2.4];
        for (const b of beats) if (t > b - 0.38 && t < b + 0.25) return K(t, [[b - 0.38, PS.fanReady], [b - 0.05, PS.lunge], [b + 0.25, PS.fanReady]]);
        return t > 2.65 ? K(t, [[2.65, PS.fanReady], [3.3, PS.smug]]) : PS.fanReady;
      }
      case 'ig_mirror': return K(t, [[0, PS.idle], [0.5, PS.mirrorCast], [1.4, PS.mirrorCast], [1.55, PS.sweptR], [2.0, PS.spinUp], [2.3, PS.mirrorCast], [2.6, PS.flick], [3.15, PS.idle]]);
      case 'ig_hair_flip': return K(t, [[0, PS.idle], [0.42, PS.twirlHair], [0.58, PS.hairFlip], [0.8, PS.fanBack], [1.08, PS.sweptL], [1.35, PS.twirlHair], [1.62, PS.hairFlip], [2.2, PS.idle]]);
      case 'ig_wheel': return K(t, [[0, PS.idle], [0.6, PS.pointUp], [1.5, PS.pointUp], [1.9, PS.spinUp], [4.1, PS.spinUp], [4.3, PS.armsUp], [4.95, fanning(PS.armsUp)], [5.1, PS.spinUp], [7.0, PS.spinUp], [7.7, PS.idle]]);
      case 'ig_fireworks': return K(t, [[0, PS.idle], [0.3, PS.firework], [0.95, PS.firework], [1.3, PS.smug], [3.4, fanning(PS.smug)]]);
      case 'ig_gaze': {
        const flip = this.gaze ? this.gaze.flip : this.crownGone;
        const P0 = flip ? PS.hideFace : PS.starPose;
        const o = K(t, [[0, PS.idle], [0.35, P0], [2.65, P0], [2.8, flip ? PS.flinch : PS.armsUp], [3.25, flip ? PS.hideFace : PS.smug], [3.65, PS.idle]]);
        if (flip && t > 0.4 && t < 2.65) { o.ht += Math.sin(now() * 9) * 0.06; }   // trembling behind the fan
        return o;
      }
      case 'ig_twin_fans': {
        // the raised arm is the tell: the fan (her right) or the flame in her left palm, held high; then that side cuts first
        const s = this.twin ? this.twin.side : 1;
        const up = s > 0 ? PS_RAISE_R : PS_RAISE_L, first = s > 0 ? PS.sweptR : PS_CUT_L, second = s > 0 ? PS_CUT_L : PS.sweptR;
        return K(t, [[0, PS.idle], [0.25, up], [0.95, up], [1.15, first], [1.4, first], [1.8, second], [2.1, second], [2.6, PS.idle]]);
      }
      case 'ig_grand_jete': return K(t, [[0, PS.idle], [0.3, PS.spinUp], [0.85, PS.spinUp], [0.92, PS.slam], [1.25, PS.spinUp], [1.8, PS.spinUp], [1.87, PS.slam], [2.2, PS.spinUp], [2.75, PS.spinUp], [2.82, PS.slam], [3.0, PS.curtsy], [3.6, PS.curtsy], [3.9, PS.armsUp], [4.4, PS.idle]]);
      case 'ig_script': return K(t, [[0, PS.idle], [0.4, PS.read], [4.25, PS.read], [4.65, PS.armsUp], [5.1, PS.read], [6.05, PS.read], [6.45, PS.slam], [7.0, fanning(PS.smug)], [7.5, PS.idle]]);
      case 'ig_taunt': {
        const kind = this.tauntKind || 0;
        const pose = kind === 0 ? PS.nails : (kind === 1 ? PS.yawn : PS.twirlHair);
        return K(t, [[0, PS.idle], [0.3, pose], [1.3, pose], [1.6, PS.idle]]);
      }
    }
    return PS.idle;
  };

  // ---- so she never moves like a puppet ----------------------------------------------------------------------------------------
  // The keyframed pose is a target, not a position: every part chases it at its own speed (hips and spine first, arms a beat
  // behind, the head last), so moves carry follow-through instead of snapping between poses. On top of that she breathes, her
  // weight drifts from hip to hip and her head never stays perfectly still.
  const CHASE = { up: 20, lean: 16, twist: 16, sway: 12, kn: 18, rf: 13, rs: 13, ru: 13, lf: 12, ls: 12, lu: 12, fan: 18, fy: 14, fp: 14, fr: 14, ht: 8, hn: 9, cast: 20, stow: 30 };
  P.livePose = function (target) {
    const t = now();
    const dt = Math.min(0.06, Math.max(0, t - (this._liveT || t)));
    this._liveT = t;
    let s = this._live;
    if (!s) s = this._live = Object.assign({}, target);
    for (const k in BASE) {
      const rate = CHASE[k] || 14;
      s[k] += (target[k] - s[k]) * (1 - Math.exp(-rate * dt));
    }
    const o = Object.assign({}, s);
    // life: breathing lifts the chest, weight drifts, the head tilts and turns a little; calmer while she is busy attacking
    const busy = /^(ig_|pat_|karok)/.test(this.state || '') ? 0.4 : 1;
    const br = Math.sin(t * 2.2);
    o.up += br * 0.35;
    o.lean += Math.sin(t * 2.2 + 0.6) * 0.3;
    o.sway += Math.sin(t * 0.9) * 0.9 * busy;
    o.twist += Math.sin(t * 0.7 + 1.3) * 0.05 * busy;
    o.hn += Math.sin(t * 0.83) * 0.05 * busy;
    o.ht += Math.sin(t * 0.47 + 2) * 0.09 * busy;
    // the free hand never hangs dead: a slow drift at the wrist
    o.lf += Math.sin(t * 1.3) * 0.6 * busy; o.lu += Math.sin(t * 1.1 + 1) * 0.6 * busy;
    o.ru += br * 0.3;
    return o;
  };

  // ---- rig simulation: ponytail + coat sway in her own frame (so a teleport never stretches them) ------------------------------
  P.resetRig = function () {
    this.hairN = [];
    for (let i = 0; i < 9; i++) this.hairN.push({ f: -4 - i * 2.6, s: 0, u: HEADC + 6 - i * 4.0 });
    this.coatSway = { f: 0, s: 0, vf: 0, vs: 0 };
    this.embers = [];
    this.trail = [];
    this._live = null;
    this._blinkSeed = Math.random() * 4;
    this._stride = 0;
  };
  P.updateRig = function (dt) {
    if (!this.hairN) this.resetRig();
    const a = this.facingAngle, cs = Math.cos(a), sn = Math.sin(a);
    // her velocity in her own frame (screen y carries the tilt)
    const vx = this.vx || 0, vy = (this.vy || 0) / T();
    let lf = vx * cs + vy * sn, ls = -vx * sn + vy * cs;
    // turning flings the hair sideways
    const da = Math.atan2(Math.sin(a - (this._lastFace ?? a)), Math.cos(a - (this._lastFace ?? a)));
    this._lastFace = a;
    const spin = da / Math.max(1e-3, dt);
    ls += -spin * 14;
    const time = now();
    const pose = this._pose || BASE;
    const headU = HEADC + 6 + pose.up - pose.kn * 16;
    // ponytail: anchored at the crown of the head, falls back and sways, lags behind motion
    const H = this.hairN;
    const wild = this.tantrumT > 0 ? 1.8 : 1;
    H[0].f = -3.6 + pose.lean * 0.8; H[0].s = 0; H[0].u = headU;
    for (let i = 1; i < H.length; i++) {
      const pr = H[i - 1], c = H[i];
      const wave = Math.sin(time * 3.2 - i * 0.7) * (0.6 + i * 0.35) * wild;
      const df = pr.f - 2.4 - Math.max(-6, Math.min(6, lf * 0.012 * i * 0.4));
      const ds = pr.s + wave - Math.max(-8, Math.min(8, ls * 0.012 * i * 0.45));
      const du = pr.u - 3.9 + Math.min(2.8, Math.abs(lf) * 0.004 * i);
      const k = Math.min(1, dt * (16 - i * 1.1));
      c.f += (df - c.f) * k; c.s += (ds - c.s) * k; c.u += (du - c.u) * k;
      const d = Math.hypot(c.f - pr.f, c.s - pr.s, c.u - pr.u), L = 4.6;
      if (d > L) { const q = L / d; c.f = pr.f + (c.f - pr.f) * q; c.s = pr.s + (c.s - pr.s) * q; c.u = pr.u + (c.u - pr.u) * q; }
      if (c.u < 2) c.u = 2;
    }
    // coat: one springy sway vector, pushed opposite to her motion and by spins
    const C = this.coatSway;
    const tf = Math.max(-9, Math.min(9, -lf * 0.05)), ts = Math.max(-9, Math.min(9, -ls * 0.05));
    C.vf += ((tf - C.f) * 60 - C.vf * 9) * dt; C.vs += ((ts - C.s) * 60 - C.vs * 9) * dt;
    C.f += C.vf * dt; C.s += C.vs * dt;
    // embers off her hair, hem and crown
    const em = this.embers;
    const rate = (this.tantrumT > 0 ? 36 : 16) * dt;
    for (let i = 0; i < 3; i++) if (Math.random() < rate / 3) {
      const src = Math.random();
      const n = src < 0.5 ? H[H.length - 1 - Math.floor(Math.random() * 3)] : (src < 0.8 ? { f: (Math.random() - 0.5) * 20, s: (Math.random() - 0.5) * 24, u: 10 + Math.random() * 10 } : { f: 0, s: 0, u: HEADC + 14 });
      em.push({ f: n.f, s: n.s, u: n.u, vu: 18 + Math.random() * 24, vf: (Math.random() - 0.5) * 6, life: 0.9 + Math.random() * 0.6, t: 0 });
    }
    for (const e of em) { e.t += dt; e.u += e.vu * dt; e.f += e.vf * dt; e.s += Math.sin((e.t + e.f) * 6) * dt * 4; }
    this.embers = em.filter(e => e.t < e.life).slice(-70);
    // a trail of embers left in the world behind her when she moves fast or spins (they stay where they fell, then rise and die)
    const tr = this.trail || (this.trail = []);
    const spd = Math.hypot(this.vx || 0, (this.vy || 0) / T()) + Math.abs(spin) * 18;
    const trate = Math.max(0, spd - 90) * 0.18 * dt * (this.tantrumT > 0 ? 2 : 1);
    let nT = Math.floor(trate) + (Math.random() < trate % 1 ? 1 : 0);
    const S = this.modelScale || 1.5;
    while (nT-- > 0) {
      const a = Math.random() * TAU, rr = 6 + Math.random() * 14;
      tr.push({ x: this.x + Math.cos(a) * rr * S, y: this.y + Math.sin(a) * rr * S * T(), z: 4 + Math.random() * 40 * S, vz: 12 + Math.random() * 30, t: 0, life: 0.6 + Math.random() * 0.7, big: Math.random() < 0.3 });
    }
    for (const e of tr) { e.t += dt; e.z += e.vz * dt; e.x += Math.sin((e.t + e.y) * 5) * dt * 6; }
    this.trail = tr.filter(e => e.t < e.life).slice(-120);
  };

  // her gait: shorter, quicker steps than a knight, one foot crossing in front of the other (a runway walk)
  P.updateFootSteps = function (dt) {
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    const moving = this.speed > 6;
    const lead = Math.min(13, this.speed * 0.2);
    const lx = moving ? Math.cos(this.moveAngle) * lead : 0, ly = moving ? Math.sin(this.moveAngle) * lead : 0;
    const hw = moving ? this.hipWidth * 0.35 : this.hipWidth;     // feet land near the centre line while walking
    const stL = moving ? 0 : 3.5, stR = moving ? 0 : -2.5;
    const iLX = this.x + lx + (stL * cosA + hw * sinA), iLY = this.y + ly + (stL * sinA - hw * cosA);
    const iRX = this.x + lx + (stR * cosA - hw * sinA), iRY = this.y + ly + (stR * sinA + hw * cosA);
    const dL = Math.hypot(iLX - this.leftFoot.x, iLY - this.leftFoot.y), dR = Math.hypot(iRX - this.rightFoot.x, iRY - this.rightFoot.y);
    const thr = moving ? 10 : 7;
    const canStep = this.state === 'idle' || this.state === 'walk' || this._stepOK;
    const step = (foot, tx, ty) => {
      foot.stepping = true; foot.stepProg = 0; foot.stepDur = moving ? 0.27 : 0.24;
      foot.startX = foot.x; foot.startY = foot.y;
      const over = moving ? 1.35 : 1.0;
      foot.targetX = this.x + (tx - this.x) * over; foot.targetY = this.y + (ty - this.y) * over;
    };
    if (!this.leftFoot.stepping && !this.rightFoot.stepping && canStep) {
      if (this.nextStepFoot === 'left' && dL > thr) { step(this.leftFoot, iLX, iLY); this.nextStepFoot = 'right'; }
      else if (this.nextStepFoot === 'right' && dR > thr) { step(this.rightFoot, iRX, iRY); this.nextStepFoot = 'left'; }
      else if (dL > thr * 1.3) { step(this.leftFoot, iLX, iLY); this.nextStepFoot = 'right'; }
      else if (dR > thr * 1.3) { step(this.rightFoot, iRX, iRY); this.nextStepFoot = 'left'; }
    }
    for (const foot of [this.leftFoot, this.rightFoot]) {
      if (!foot.stepping) { foot.z = 0; continue; }
      foot.stepProg += dt / foot.stepDur;
      if (foot.stepProg >= 1) {
        foot.stepProg = 1; foot.stepping = false; foot.x = foot.targetX; foot.y = foot.targetY; foot.z = 0;
        if (window.fx && Math.random() < 0.6) {
          const S = this.modelScale;
          window.fx.addStepDust(this.x + (foot.x - this.x) * S, this.y + (foot.y - this.y) * T() * S, 2);
        }
        this.pelvisVelZ -= 10;
      } else {
        const k = foot.stepProg, e = k * k * (3 - 2 * k);
        foot.x = foot.startX + (foot.targetX - foot.startX) * e; foot.y = foot.startY + (foot.targetY - foot.startY) * e;
        foot.z = Math.sin(Math.pow(k, 0.85) * Math.PI) * 7;
      }
    }
    // stride phase (-1..1) for the arm swing / hip sway
    const fl = (this.leftFoot.x - this.x) * cosA + (this.leftFoot.y - this.y) * sinA, fr = (this.rightFoot.x - this.x) * cosA + (this.rightFoot.y - this.y) * sinA;
    this._stride = Math.max(-1, Math.min(1, (fl - fr) / 16));
  };

  // ---- maths for the rig ----------------------------------------------------------------------------------------------------
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
  // ---- rendering helpers: ink outlines, a soft key light from the upper left, warm footlight bounce from below -----------------
  const INK = 'rgba(30,6,14,0.92)';
  const LIGHT = { x: -0.6, y: -0.8 };
  // shade the CURRENT path (call right after filling it): lit towards (x0,y0), shadowed towards (x1,y1)
  function shadeClip(ctx, x0, y0, x1, y1, hi = 0.16, lo = 0.32) {
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(255,236,224,${hi})`); g.addColorStop(0.45, 'rgba(255,236,224,0)'); g.addColorStop(0.6, 'rgba(18,0,8,0)'); g.addColorStop(1, `rgba(18,0,8,${lo})`);
    ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1) - 80, Math.min(y0, y1) - 80, Math.abs(x1 - x0) + 160, Math.abs(y1 - y0) + 160);
    ctx.restore();
  }
  // warm light thrown up from the footlights and her own fire, on the lower part of the current path
  function underGlow(ctx, yTop, yBot, a = 0.22) {
    ctx.save(); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(1, `rgba(255,130,50,${a})`);
    ctx.fillStyle = g; ctx.fillRect(-1e4, yTop, 2e4, yBot - yTop + 4);
    ctx.restore();
  }
  // a tapered limb between two screen points (shade: light it across its width from the key light)
  function limb(ctx, a, b, w1, w2, fill, edge, shade) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * w1, a.y + ny * w1); ctx.lineTo(b.x + nx * w2, b.y + ny * w2);
    ctx.arc(b.x, b.y, w2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true);
    ctx.lineTo(a.x - nx * w1, a.y - ny * w1);
    ctx.arc(a.x, a.y, w1, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI, true);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (shade) {
      const lit = nx * LIGHT.x + ny * LIGHT.y > 0 ? 1 : -1, w = Math.max(w1, w2);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      shadeClip(ctx, mx + nx * w * lit, my + ny * w * lit, mx - nx * w * lit, my - ny * w * lit, shade.hi ?? 0.2, shade.lo ?? 0.38);
    }
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 0.9; ctx.stroke(); }
  }
  // One smooth, continuous limb through several screen points (hip → thigh → knee → calf → ankle) with a half-width at each:
  // no joint balls, no segment seams, so knees and elbows read as flesh bending instead of a puppet's hinges.
  // Leaves the outline as the current path (for shading / ink).
  function organicLimb(ctx, P, W) {
    const n = P.length, L = [], R = [], N = [];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      N.push({ x: -dy / l, y: dx / l });
      L.push({ x: P[i].x + N[i].x * W[i], y: P[i].y + N[i].y * W[i] });
      R.push({ x: P[i].x - N[i].x * W[i], y: P[i].y - N[i].y * W[i] });
    }
    ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(L[i].x, L[i].y, (L[i].x + L[i + 1].x) / 2, (L[i].y + L[i + 1].y) / 2);
    ctx.lineTo(L[n - 1].x, L[n - 1].y);
    const ae = Math.atan2(N[n - 1].y, N[n - 1].x);
    ctx.arc(P[n - 1].x, P[n - 1].y, W[n - 1], ae, ae + Math.PI, true);
    for (let i = n - 2; i > 0; i--) ctx.quadraticCurveTo(R[i].x, R[i].y, (R[i].x + R[i - 1].x) / 2, (R[i].y + R[i - 1].y) / 2);
    ctx.lineTo(R[0].x, R[0].y);
    const a0 = Math.atan2(N[0].y, N[0].x);
    ctx.arc(P[0].x, P[0].y, W[0], a0 + Math.PI, a0 + TAU, true);
    ctx.closePath();
  }
  // light a limb path across its width (lit side towards the key light)
  function shadeAcross(ctx, a, b, w, hi, lo) {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const lit = nx * LIGHT.x + ny * LIGHT.y > 0 ? 1 : -1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    shadeClip(ctx, mx + nx * w * lit, my + ny * w * lit, mx - nx * w * lit, my - ny * w * lit, hi, lo);
  }
  const pl = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  // one tongue of living fire rising from (x, y): the shared anime-style flame (flame_art.js), small and fast on her body
  function flameTongue(ctx, x, y, h, w, t, seed, hot = 1) {
    if (window.FlameArt) {
      const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'source-over';
      window.FlameArt.tongue(ctx, x, y, h * 1.15 * hot, w * (0.95 + 0.1 * hot), t, seed, { shadow: false, rate: 1.3, layers: w < 2.5 ? 3 : 4 });
      ctx.globalCompositeOperation = op;
      return;
    }
    const fl = 0.78 + 0.22 * Math.sin(t * 13 + seed * 2.3) + 0.12 * Math.sin(t * 29 + seed * 5.1);
    h *= fl * hot; w *= (0.85 + 0.15 * hot);
    const sway = Math.sin(t * 7 + seed) * w * 0.9;
    const layer = (k, col) => {
      const hh = h * k, ww = w * k;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x - ww, y);
      ctx.bezierCurveTo(x - ww * 1.05, y - hh * 0.45, x + sway * 0.4 - ww * 0.4, y - hh * 0.75, x + sway, y - hh);
      ctx.bezierCurveTo(x + sway * 0.4 + ww * 0.45, y - hh * 0.7, x + ww * 1.05, y - hh * 0.4, x + ww, y);
      ctx.quadraticCurveTo(x, y + ww * 0.7, x - ww, y); ctx.fill();
    };
    layer(1, 'rgba(255,70,20,0.5)'); layer(0.72, 'rgba(255,150,40,0.62)'); layer(0.42, 'rgba(255,238,170,0.8)');
  }

  // =========================================================================================================================
  // THE FIGURE. Used for her and for her Curtain Call decoys (look: { mask, fanOpen, trim, alpha, ghost }).
  // =========================================================================================================================
  P.drawFigure = function (ctx, X, Y, facing, pose, look) {
    look = look || {};
    const S = this.modelScale, tilt = T();
    const cs = Math.cos(facing), sn = Math.sin(facing);
    const lift = (look.lift != null ? look.lift : (this.jumpZ || 0));
    const time = now();
    const bob = look.decoy ? Math.sin(time * 2.1 + (look.seed || 0)) * 0.6 : this.pelvisBounceZ * 0.06 + Math.sin(this.breathePhase || 0) * 0.35;
    const pelU = PEL + pose.up - pose.kn * 16 + bob;
    const up2 = pelU - PEL;
    const proj = (f, s, u) => ({ x: X + (f * cs - s * sn) * S, y: Y + (f * sn + s * cs) * S * tilt - (u * S + lift), d: (f * sn + s * cs) });
    // upper body: twist about the spine and lean forward with height
    const tw = pose.twist, ct = Math.cos(tw), st = Math.sin(tw);
    const up = (f, s, u) => { const k = c01((u - PEL) / (SHO - PEL)); const a = tw * k, c = Math.cos(a), sN = Math.sin(a); return { f: f * c - s * sN + pose.lean * k, s: f * sN + s * c + pose.sway * 0.5, u: u + up2 }; };
    const P3 = (o) => proj(o.f, o.s, o.u);
    const alpha = look.alpha != null ? look.alpha : 1;
    const trim = look.trim === 1 ? COL.silver : COL.trim;
    const trimDk = look.trim === 1 ? '#7d8796' : COL.trimDk;
    const flash = look.decoy ? 0 : this.hitFlashTimer || 0;

    ctx.save();
    ctx.globalAlpha *= alpha;
    // ground shadow + heat glow (skipped when the caller draws her lying down and does its own)
    if (!look.noShadow) {
    ctx.save();
    ctx.translate(X, Y); ctx.scale(1, tilt);
    const sh = Math.max(0.35, 1 - lift / 220);
    ctx.fillStyle = `rgba(0,0,0,${0.38 * sh})`; ctx.beginPath(); ctx.ellipse(0, 0, 25 * S * sh, 25 * S * sh, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(0, 0, 4, 0, 0, 38 * S);
    hg.addColorStop(0, `rgba(255,120,40,${(this.tantrumT > 0 ? 0.32 : 0.16) * sh})`); hg.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, 38 * S, 0, TAU); ctx.fill();
    ctx.restore();
    }

    // the ember trail she leaves in the world (behind everything of hers)
    if (!look.decoy && this.trail && this.trail.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const e of this.trail) {
        const k = 1 - e.t / e.life, rr = (e.big ? 2.6 : 1.4) * k + 0.5;
        ctx.fillStyle = `rgba(255,${Math.round(120 + 110 * k)},60,${0.9 * k})`;
        ctx.beginPath(); ctx.arc(e.x, e.y - e.z, rr, 0, TAU); ctx.fill();
        if (e.big) { ctx.fillStyle = `rgba(255,120,40,${0.18 * k})`; ctx.beginPath(); ctx.arc(e.x, e.y - e.z, rr * 3.5, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    const parts = [];
    const add = (d, fn) => parts.push({ d, fn });

    // ---- legs (heeled boots) from the stepping feet
    const feetLocal = (foot) => {
      if (look.decoy) return null;
      const dx = foot.x - this.x, dy = foot.y - this.y;
      return { f: dx * cs + dy * sn, s: -dx * sn + dy * cs, u: (foot.z || 0) + 2.6 };
    };
    for (const sideSign of [-1, 1]) {
      const foot = sideSign < 0 ? this.leftFoot : this.rightFoot;
      let fl = feetLocal(foot) || { f: sideSign < 0 ? 3.5 : -2.5, s: sideSign * 3.2, u: 2.6 };
      if (pose.kn > 0) {   // kneeling: the far knee goes down, the other foot plants forward
        fl = sideSign < 0 ? { f: lerp(fl.f, 12, pose.kn), s: lerp(fl.s, -5, pose.kn), u: 2.6 } : { f: lerp(fl.f, -12, pose.kn), s: lerp(fl.s, 5, pose.kn), u: lerp(2.6, 1.5, pose.kn) };
      }
      const hip = { f: 0, s: sideSign * HIP_W + pose.sway * 0.4, u: pelU };
      const r = ik(hip, fl, THIGH, SHIN, { f: 1, s: sideSign * 0.25, u: 0.1 });
      const H = proj(hip.f, hip.s, hip.u), Kn = P3(r.mid), A = P3(r.end);
      const toe = proj(r.end.f + 4.5, r.end.s, r.end.u - 1.8), heel = proj(r.end.f - 1.5, r.end.s, r.end.u - 2.6);
      add((H.d + Kn.d + A.d) / 3 - 0.5, () => {
        // the whole leg in one shape (dark tights): full thigh, a slim knee, a curve of calf, a fine ankle
        organicLimb(ctx, [H, pl(H, Kn, 0.45), Kn, pl(Kn, A, 0.32), A], [3.2 * S, 2.85 * S, 1.95 * S, 2.15 * S, 1.2 * S]);
        ctx.fillStyle = flash > 0 ? '#ffe4e6' : '#2c1622'; ctx.fill();
        if (flash <= 0) shadeAcross(ctx, H, A, 3.2 * S, 0.2, 0.45);
        ctx.strokeStyle = INK; ctx.lineWidth = 0.85; ctx.stroke();
        // thigh-high boot over it, the same shape a touch wider, from above the knee down to the foot
        const top = pl(Kn, H, 0.32);
        organicLimb(ctx, [top, Kn, pl(Kn, A, 0.32), pl(Kn, A, 0.72), A], [2.35 * S, 2.1 * S, 2.3 * S, 1.6 * S, 1.38 * S]);
        const bg = ctx.createLinearGradient(top.x, top.y, A.x, A.y);
        bg.addColorStop(0, '#24161f'); bg.addColorStop(0.5, COL.boot); bg.addColorStop(1, '#05030a');
        ctx.fillStyle = bg; ctx.fill();
        shadeAcross(ctx, top, A, 2.4 * S, 0.3, 0.35);
        ctx.strokeStyle = INK; ctx.lineWidth = 0.85; ctx.stroke();
        // patent shine sliding down the lit side of the boot
        const ldx = A.x - Kn.x, ldy = A.y - Kn.y, ll = Math.hypot(ldx, ldy) || 1, lnx = -ldy / ll, lny = ldx / ll, ls = lnx * LIGHT.x + lny * LIGHT.y > 0 ? 1 : -1;
        ctx.strokeStyle = 'rgba(255,225,235,0.38)'; ctx.lineWidth = 0.6 * S; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(Kn.x + lnx * ls * 1.2 * S + ldx * 0.12, Kn.y + lny * ls * 1.2 * S + ldy * 0.12);
        ctx.quadraticCurveTo(Kn.x + lnx * ls * 1.5 * S + ldx * 0.4, Kn.y + lny * ls * 1.5 * S + ldy * 0.4, A.x + lnx * ls * 0.7 * S - ldx * 0.15, A.y + lny * ls * 0.7 * S - ldy * 0.15); ctx.stroke();
        // the folded crimson cuff at the boot top, piped in gold (a band of cloth, not a ring)
        const tdx = Kn.x - top.x, tdy = Kn.y - top.y, tl = Math.hypot(tdx, tdy) || 1, tnx = -tdy / tl, tny = tdx / tl;
        const c0 = top, c1 = pl(top, Kn, 0.3), w0 = 2.75 * S, w1 = 2.45 * S;
        ctx.beginPath();
        ctx.moveTo(c0.x + tnx * w0, c0.y + tny * w0); ctx.quadraticCurveTo(c0.x + tdx / tl * -0.8 * S, c0.y + tdy / tl * -0.8 * S, c0.x - tnx * w0, c0.y - tny * w0);
        ctx.lineTo(c1.x - tnx * w1, c1.y - tny * w1); ctx.quadraticCurveTo(c1.x + tdx / tl * 0.6 * S, c1.y + tdy / tl * 0.6 * S, c1.x + tnx * w1, c1.y + tny * w1);
        ctx.closePath();
        ctx.fillStyle = COL.coatDk; ctx.fill(); shadeAcross(ctx, c0, c1, w0, 0.25, 0.35);
        ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.stroke();
        ctx.strokeStyle = trim; ctx.lineWidth = 0.55 * S;
        ctx.beginPath(); ctx.moveTo(c0.x + tnx * w0, c0.y + tny * w0); ctx.quadraticCurveTo(c0.x + tdx / tl * -0.8 * S, c0.y + tdy / tl * -0.8 * S, c0.x - tnx * w0, c0.y - tny * w0); ctx.stroke();
        // pointed toe, stiletto heel
        ctx.fillStyle = COL.boot; ctx.beginPath(); ctx.moveTo(A.x - 1.3 * S, A.y - 0.3 * S); ctx.quadraticCurveTo(lerp(A.x, toe.x, 0.5), lerp(A.y, toe.y, 0.5) - 1.0 * S, toe.x, toe.y); ctx.quadraticCurveTo(lerp(A.x, toe.x, 0.4), A.y + 1.6 * S, A.x + 1.3 * S, A.y + 1.0 * S); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.strokeStyle = COL.heel; ctx.lineWidth = 1.1 * S; ctx.beginPath(); ctx.moveTo(A.x - 0.5 * S, A.y + 0.5 * S); ctx.lineTo(heel.x, heel.y + 2.4 * S); ctx.stroke();
      });
    }

    // ---- the tailcoat skirt: panels around her hips, front cut away, tails long at the back, a flame-cut hem
    const sway = this.coatSway || { f: 0, s: 0 };
    const NP = 14;
    const ang0 = 0.62;
    const ring = [];
    for (let i = 0; i <= NP; i++) {
      const th = ang0 + (TAU - 2 * ang0) * (i / NP);         // th = 0 is straight ahead
      const back = (1 - Math.cos(th)) / 2;                    // 0 at the front edges, 1 at the back
      const wR = WAIST_W + 0.7, hR = 9 + back * 5 + (pose.kn > 0 ? 3 : 0);
      const hemU = lerp(31, 7, Math.pow(back, 0.8)) + (pose.kn * 10) - (pose.up < 0 ? pose.up * 0.3 : 0);
      const flt = Math.sin(time * 4 + i * 0.9) * 0.9 * (0.3 + back);
      const top = up(Math.cos(th) * wR, Math.sin(th) * wR, WAIST - 2);
      const bot = { f: Math.cos(th) * hR + sway.f * back * 1.2 + flt * 0.3, s: Math.sin(th) * hR + sway.s * back * 1.2 + flt, u: Math.max(1.5, hemU + up2 * 0.85) };
      ring.push({ top: P3(top), bot: P3(bot), th, back });
    }
    for (let i = 0; i < NP; i++) {
      const a = ring[i], b = ring[i + 1];
      const thm = (a.th + b.th) / 2;
      // outward normal in the world: towards the camera (+y) we see the crimson outside, away from it the dark lining
      const nWy = Math.sin(facing + thm);
      const d = (a.bot.d + b.bot.d) / 2 * 0.9;
      add(d, () => {
        const outside = nWy > -0.05;
        const g = ctx.createLinearGradient(a.top.x, a.top.y, a.bot.x, a.bot.y);
        if (outside) {
          // satin: a soft sheen band that slides with the panel's angle to the light
          const sheen = c01(0.5 + 0.5 * Math.sin(facing + thm + 0.9));
          g.addColorStop(0, COL.coatDk); g.addColorStop(0.3, COL.coat); g.addColorStop(0.3 + 0.35 * sheen, nWy > 0.3 ? COL.coatHi : COL.coat); g.addColorStop(0.86, COL.coat); g.addColorStop(1, COL.coatDk);
        } else { g.addColorStop(0, '#0d0408'); g.addColorStop(0.7, COL.lining); g.addColorStop(1, '#3a0d1c'); }
        ctx.fillStyle = flash > 0 ? '#ffe4e6' : g;
        ctx.beginPath(); ctx.moveTo(a.top.x, a.top.y); ctx.lineTo(b.top.x, b.top.y);
        // flame-cut hem: a tongue of cloth per panel
        const mx = (a.bot.x + b.bot.x) / 2, my = (a.bot.y + b.bot.y) / 2;
        const tongue = my + 3.2 * S * (0.5 + 0.5 * Math.sin(time * 6 + i));
        ctx.lineTo(b.bot.x, b.bot.y); ctx.lineTo(mx, tongue); ctx.lineTo(a.bot.x, a.bot.y);
        ctx.closePath(); ctx.fill();
        if (flash <= 0) underGlow(ctx, Math.min(a.top.y, b.top.y), Math.max(a.bot.y, b.bot.y, tongue), outside ? 0.26 : 0.12);
        // soft fold lines instead of hard ink between panels; ink only along the hem
        ctx.strokeStyle = 'rgba(30,6,14,0.3)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a.top.x, a.top.y); ctx.lineTo(a.bot.x, a.bot.y); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(a.bot.x, a.bot.y); ctx.lineTo(mx, tongue); ctx.lineTo(b.bot.x, b.bot.y); ctx.stroke();
        if (outside) {
          // a gold embroidery band above the hem
          const ea = { x: lerp(a.top.x, a.bot.x, 0.86), y: lerp(a.top.y, a.bot.y, 0.86) }, eb = { x: lerp(b.top.x, b.bot.x, 0.86), y: lerp(b.top.y, b.bot.y, 0.86) };
          ctx.strokeStyle = trimDk; ctx.lineWidth = 1.4 * S; ctx.beginPath(); ctx.moveTo(ea.x, ea.y); ctx.lineTo(eb.x, eb.y); ctx.stroke();
          ctx.strokeStyle = trim; ctx.lineWidth = 0.6 * S; ctx.stroke();
        }
        // living fire licking up off the hem (taller on the tails, wilder in a tantrum)
        if (!look.ghost) {
          ctx.globalCompositeOperation = 'lighter';
          const hot = this.tantrumT > 0 && !look.decoy ? 1.6 : (this.act2 && !look.decoy ? 1.35 : 1);
          const gown = this.act2 && !look.decoy ? 1.9 : 1;     // Act II: the hem is a skirt of flame
          ctx.globalAlpha *= outside ? 1 : 0.55;
          flameTongue(ctx, mx, tongue - 0.6 * S, (3.2 + a.back * 6.5) * S * gown, 1.9 * S, time, i * 1.7 + (look.seed || 0), hot);
          if (a.back > 0.5 || gown > 1) flameTongue(ctx, lerp(a.bot.x, mx, 0.35), lerp(a.bot.y, tongue, 0.35), (2.4 + a.back * 3.5) * S * gown, 1.3 * S, time, i * 3.1 + 7, hot);
          ctx.globalCompositeOperation = 'source-over';
        }
      });
    }
    // gold trim down the two front edges of the coat
    for (const e of [ring[0], ring[NP]]) {
      add(e.bot.d * 0.9 + 0.2, () => { ctx.strokeStyle = trim; ctx.lineWidth = 1.3 * S; ctx.beginPath(); ctx.moveTo(e.top.x, e.top.y); ctx.lineTo(e.bot.x, e.bot.y); ctx.stroke(); });
    }

    // ---- torso: black bodice in front, crimson coat at the back and sides
    const wL = up(0, -WAIST_W, WAIST), wR = up(0, WAIST_W, WAIST), cL = up(0.6, -CHEST_W, CHEST), cR = up(0.6, CHEST_W, CHEST);
    const sL = up(-0.3, -SHO_W, SHO), sR = up(-0.3, SHO_W, SHO), nk = up(-0.4, 0, NECK), hipL = up(0, -HIP_W - 0.6, PEL + 3), hipR = up(0, HIP_W + 0.6, PEL + 3);
    const faceTo = Math.sin(facing + tw * 0.8);           // > 0: her front is towards the camera
    // ---- the neck (skin), tucked under the head and inside the collar
    const neckBase = up(-0.2, 0, NECK - 3), neckTop = up(0.3 + pose.hn * 1.2, 0, HEADC - HEADR * 0.55);
    add(proj(neckBase.f, neckBase.s, neckBase.u).d - 0.05, () => {
      const a = P3(neckBase), b = P3(neckTop);
      limb(ctx, a, b, 2.1 * S, 1.8 * S, flash > 0 ? '#fff1f2' : COL.skin, INK, { hi: 0.1, lo: 0.35 });
    });
    add(0, () => {
      const pts = [hipL, wL, cL, sL, nk, sR, cR, wR, hipR].map(P3);
      // a curved hourglass silhouette: smooth through every point instead of a polygon
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) { const p0 = pts[i - 1], p1 = pts[i]; ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2); }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.closePath();
      ctx.fillStyle = flash > 0 ? '#ffe4e6' : COL.coat; ctx.fill();
      if (flash <= 0) {
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        shadeClip(ctx, x0, y0, x1, y1, 0.18, 0.42);
        underGlow(ctx, (y0 + y1) / 2, y1, 0.16);
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
      if (faceTo > -0.25) {
        // the bodice panel, narrowing as she turns away
        const k = c01((faceTo + 0.25) / 1.0);
        const bw = 0.75 * k;
        // bare skin above the sweetheart neckline
        const dk = [up(1.2, -SHO_W * 0.5 * bw, SHO - 1.2), up(0.6, 0, NECK - 1.4), up(1.2, SHO_W * 0.5 * bw, SHO - 1.2), up(2.3, 0, CHEST + 2.5)].map(P3);
        ctx.beginPath(); ctx.moveTo(dk[0].x, dk[0].y); ctx.quadraticCurveTo(dk[1].x, dk[1].y - 1.5 * S, dk[2].x, dk[2].y); ctx.lineTo(dk[3].x, dk[3].y); ctx.closePath();
        ctx.fillStyle = COL.skin; ctx.fill(); shadeClip(ctx, dk[0].x, dk[1].y, dk[2].x, dk[3].y, 0.12, 0.3);
        const q = [up(1.8, -WAIST_W * bw, WAIST - 1), up(2.4, -CHEST_W * bw, CHEST), up(1.6, -SHO_W * 0.5 * bw, SHO - 2.2), up(2.4, -1.1 * bw, CHEST + 3.4), up(2.6, 0, CHEST + 2.2), up(2.4, 1.1 * bw, CHEST + 3.4), up(1.6, SHO_W * 0.5 * bw, SHO - 2.2), up(2.4, CHEST_W * bw, CHEST), up(1.8, WAIST_W * bw, WAIST - 1), up(1.6, 0, PEL + 1)].map(P3);
        ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (const p of q) ctx.lineTo(p.x, p.y); ctx.closePath();
        ctx.fillStyle = COL.bodice; ctx.fill();
        // corset boning: thin satin highlights down the bodice
        shadeClip(ctx, q[1].x, q[3].y, q[7].x, q[9].y, 0.14, 0.3);
        ctx.strokeStyle = 'rgba(255,200,220,0.12)'; ctx.lineWidth = 0.6;
        for (const sx of [-0.55, 0.55]) { const a = P3(up(2.3, sx * CHEST_W * bw, CHEST - 0.5)), b = P3(up(1.9, sx * WAIST_W * bw * 0.9, WAIST)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        ctx.strokeStyle = trim; ctx.lineWidth = 0.8 * S;
        ctx.beginPath(); ctx.moveTo(q[2].x, q[2].y); ctx.lineTo(q[3].x, q[3].y); ctx.lineTo(q[4].x, q[4].y); ctx.lineTo(q[5].x, q[5].y); ctx.lineTo(q[6].x, q[6].y); ctx.stroke();
        // gold lacing and a flame gem at the breast
        ctx.strokeStyle = trim; ctx.lineWidth = 0.7 * S; ctx.globalAlpha *= k;
        for (let i = 0; i < 4; i++) {
          const yy = WAIST + i * 2.6;
          const a = P3(up(2.2, -1.6 * bw, yy)), b = P3(up(2.2, 1.6 * bw, yy + 1.3));
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        const gem = P3(up(2.8, 0, CHEST + 1.5));
        ctx.fillStyle = '#ff7a1a'; ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(gem.x, gem.y - 2.4 * S); ctx.lineTo(gem.x + 1.3 * S, gem.y); ctx.lineTo(gem.x, gem.y + 1.6 * S); ctx.lineTo(gem.x - 1.3 * S, gem.y); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
      } else {
        // back of the coat: a gold seam
        const a = P3(up(-2.4, 0, NECK - 2)), b = P3(up(-2.4, 0, PEL + 2));
        ctx.strokeStyle = trimDk; ctx.lineWidth = 0.8 * S; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      // a sash of gold at the waist
      const s0 = P3(up(0, -WAIST_W - 0.3, WAIST - 1)), s1 = P3(up(WAIST_W * 0.5, 0, WAIST - 1.6)), s2 = P3(up(0, WAIST_W + 0.3, WAIST - 1));
      ctx.strokeStyle = trim; ctx.lineWidth = 1.5 * S; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.quadraticCurveTo(s1.x, s1.y + 1.5, s2.x, s2.y); ctx.stroke();
    });

    // ---- epaulettes
    for (const [sp, sg] of [[sL, -1], [sR, 1]]) {
      const c = P3(sp);
      add(c.d + 0.3, () => {
        // bullion fringe first, then the domed gold board over it
        ctx.lineCap = 'round';
        for (let k = -3; k <= 3; k++) {
          const ex = c.x + k * 1.0 * S, ey = c.y + 4.4 * S + Math.sin(time * 5 + k) * 0.6;
          ctx.strokeStyle = trimDk; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(c.x + k * 0.9 * S, c.y + 1.2 * S); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.strokeStyle = trim; ctx.lineWidth = 0.5; ctx.stroke();
        }
        const dome = ctx.createRadialGradient(c.x - 1.2 * S, c.y - 0.9 * S, 0.3, c.x, c.y, 3.6 * S);
        dome.addColorStop(0, '#fff3c2'); dome.addColorStop(0.45, trim); dome.addColorStop(1, trimDk);
        ctx.fillStyle = dome; ctx.beginPath(); ctx.ellipse(c.x, c.y, 3.4 * S, 2.1 * S, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(c.x, c.y - 0.2 * S, 0.8 * S, 0, TAU); ctx.fill();
      });
    }

    // ---- the high flame collar (behind the head when she faces us, in front of it when she faces away)
    const collar = [];
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.55 + (i / 4) * Math.PI * 0.9;      // around the back of the neck
      const base = up(Math.cos(a) * 3.6 - 0.6, Math.sin(a) * 4.2, NECK - 1.5);
      const tip = up(Math.cos(a) * 6 - 1.6, Math.sin(a) * 6.8, NECK + 6.2 + (i === 2 ? 2.2 : 0));
      collar.push([P3(base), P3(tip)]);
    }
    const collarD = proj(-3, 0, NECK).d;
    // facing us it stands behind her head; facing away it wraps the nape, but her hair still falls over it
    const headD0 = P3(up(0.6, 0, HEADC)).d;
    add(faceTo > 0 ? collarD - 0.6 : Math.min(collarD + 0.6, headD0 - 0.45), () => {
      const top = Math.min(...collar.map(c => c[1].y)), bot = Math.max(...collar.map(c => c[0].y));
      const cg = ctx.createLinearGradient(0, bot, 0, top);
      cg.addColorStop(0, '#3a0510'); cg.addColorStop(0.6, COL.coatDk); cg.addColorStop(1, COL.coat);
      ctx.fillStyle = cg;
      // one solid standing collar: along the neckline, then up over flame-shaped points with scalloped dips between them
      ctx.beginPath(); ctx.moveTo(collar[0][0].x, collar[0][0].y);
      for (let i = 0; i < collar.length; i++) {
        const [b, t] = collar[i];
        if (i > 0) { const pb = collar[i - 1][0], pt = collar[i - 1][1]; const vx = (pt.x + t.x) / 2 * 0.6 + (pb.x + b.x) / 2 * 0.4, vy = (pt.y + t.y) / 2 * 0.6 + (pb.y + b.y) / 2 * 0.4; ctx.quadraticCurveTo(vx, vy, t.x, t.y); }
        else ctx.lineTo(t.x, t.y);
      }
      for (let i = collar.length - 1; i >= 0; i--) ctx.lineTo(collar[i][0].x, collar[i][0].y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * S; ctx.stroke();
      ctx.strokeStyle = trim; ctx.lineWidth = 0.7 * S; ctx.stroke();
      // each collar point burns at the tip
      ctx.globalCompositeOperation = 'lighter';
      collar.forEach(([, t], i) => flameTongue(ctx, t.x, t.y + 0.8 * S, 2.6 * S, 0.9 * S, time, i * 2.9 + 3, this.tantrumT > 0 && !look.decoy ? 1.6 : 1));
      ctx.globalCompositeOperation = 'source-over';
    });

    // ---- arms (bell sleeves, long black gloves)
    const hands = {};
    for (const [sg, sp, tf, ts, tu] of [[1, sR, pose.rf, pose.rs, pose.ru], [-1, sL, pose.lf, pose.ls, pose.lu]]) {
      const tgt = { f: tf + pose.lean * 0.6, s: ts + pose.sway * 0.5, u: tu + up2 };
      const r = ik(sp, tgt, UPPER, FORE, { f: -0.35, s: sg * 0.75, u: -0.55 });
      const Sh = P3(sp), El = P3(r.mid), Ha = P3(r.end);
      hands[sg > 0 ? 'r' : 'l'] = { local: r.end, scr: Ha, elbow: El };
      const d = (El.d + Ha.d) / 2 + 0.4;
      add(d, () => {
        const cuff = pl(El, Ha, 0.5);
        const dx = Ha.x - El.x, dy = Ha.y - El.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, ux = dx / L, uy = dy / L;
        // the gloved forearm first (its upper end disappears into the sleeve)
        organicLimb(ctx, [pl(El, Ha, 0.25), pl(El, Ha, 0.62), Ha], [1.45 * S, 1.3 * S, 1.05 * S]);
        ctx.fillStyle = '#22141c'; ctx.fill(); shadeAcross(ctx, El, Ha, 1.4 * S, 0.32, 0.3);
        ctx.strokeStyle = INK; ctx.lineWidth = 0.75; ctx.stroke();
        // one continuous sleeve: shoulder, a soft bend at the elbow, flaring into the bell cuff
        organicLimb(ctx, [Sh, pl(Sh, El, 0.5), El, pl(El, cuff, 0.55), cuff], [2.45 * S, 2.2 * S, 1.95 * S, 2.45 * S, 3.6 * S]);
        ctx.fillStyle = flash > 0 ? '#ffe4e6' : COL.coat; ctx.fill();
        if (flash <= 0) shadeAcross(ctx, Sh, cuff, 3.0 * S, 0.24, 0.42);
        ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
        // a soft fold where the sleeve bunches at the elbow
        ctx.strokeStyle = 'rgba(40,4,14,0.45)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(El.x + nx * 1.6 * S - ux * 0.6 * S, El.y + ny * 1.6 * S - uy * 0.6 * S); ctx.quadraticCurveTo(El.x + ux * 0.8 * S, El.y + uy * 0.8 * S, El.x - nx * 1.4 * S - ux * 0.3 * S, El.y - ny * 1.4 * S - uy * 0.3 * S); ctx.stroke();
        // lining in the bell's mouth, gold piping on its rim
        ctx.fillStyle = COL.lining; ctx.beginPath(); ctx.ellipse(cuff.x + ux * 0.5 * S, cuff.y + uy * 0.5 * S, 3.3 * S, 1.15 * S, Math.atan2(ny, nx), 0, TAU); ctx.fill();
        ctx.strokeStyle = trimDk; ctx.lineWidth = 1.4 * S; ctx.beginPath(); ctx.moveTo(cuff.x + nx * 3.55 * S, cuff.y + ny * 3.55 * S); ctx.quadraticCurveTo(cuff.x + ux * 0.9 * S, cuff.y + uy * 0.9 * S, cuff.x - nx * 3.55 * S, cuff.y - ny * 3.55 * S); ctx.stroke();
        ctx.strokeStyle = trim; ctx.lineWidth = 0.65 * S; ctx.stroke();
        // a gloved hand: a tapered palm and fingers carrying on from the wrist, and a thumb on the inside
        const hx = Ha.x + ux * 1.3 * S, hy = Ha.y + uy * 1.3 * S, ang = Math.atan2(uy, ux);
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
        const hg = ctx.createLinearGradient(0, -1.4 * S, 0, 1.4 * S);
        hg.addColorStop(0, '#5a3a48'); hg.addColorStop(0.5, '#2a1822'); hg.addColorStop(1, COL.glove);
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.moveTo(-1.6 * S, -1.05 * S);
        ctx.quadraticCurveTo(1.2 * S, -1.45 * S, 2.6 * S, -0.35 * S); ctx.quadraticCurveTo(2.9 * S, 0.2 * S, 2.3 * S, 0.7 * S);
        ctx.quadraticCurveTo(0.6 * S, 1.3 * S, -1.6 * S, 1.0 * S); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.stroke();
        const th = -sg;   // the thumb sits on the body side of the hand
        ctx.beginPath(); ctx.ellipse(0.4 * S, th * 1.15 * S, 1.1 * S, 0.5 * S, th * -0.5, 0, TAU); ctx.fillStyle = '#2a1822'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(0.9 * S, -th * 0.95 * S, 0.38 * S, 0, TAU); ctx.fill();   // a ring
        ctx.restore();
        // a flame cupped in the left palm
        if (sg < 0 && pose.cast > 0.05) {
          ctx.globalCompositeOperation = 'lighter';
          const fr = (3 + Math.sin(time * 18) * 0.6) * S * pose.cast;
          const g = ctx.createRadialGradient(Ha.x, Ha.y - fr * 0.4, 0, Ha.x, Ha.y - fr * 0.4, fr * 2.2);
          g.addColorStop(0, 'rgba(255,250,220,0.95)'); g.addColorStop(0.35, 'rgba(255,170,50,0.75)'); g.addColorStop(1, 'rgba(255,60,20,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(Ha.x, Ha.y - fr * 0.4, fr * 2.2, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      });
    }
    this._hands = hands;

    // ---- the fan
    let fanH = hands.r;
    if ((pose.stow || 0) > 0.5) {
      // tucked through her sash at the right hip, closed, while both hands are busy
      const a = up(1.4, WAIST_W + 0.8, WAIST - 1.5), b = up(3.5, WAIST_W + 2.2, WAIST + 9);
      const A2 = P3(a), B2 = P3(b);
      add(A2.d + 0.35, () => {
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK; ctx.lineWidth = 3.4 * S; ctx.beginPath(); ctx.moveTo(A2.x, A2.y); ctx.lineTo(B2.x, B2.y); ctx.stroke();
        ctx.strokeStyle = COL.silk; ctx.lineWidth = 2.4 * S; ctx.stroke();
        ctx.strokeStyle = trim; ctx.lineWidth = 0.6 * S; ctx.stroke();
        ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(A2.x, A2.y, 1.1 * S, 0, TAU); ctx.fill();
      });
      fanH = { scr: A2, local: a, elbow: A2 };
    } else if (fanH && !(this.karokSwordHidden && !look.decoy)) {
      const open = look.fanOpen != null ? look.fanOpen : pose.fan;
      const torn = look.decoy ? !!look.torn : this.fanTorn;
      const fy = facing + 0 + pose.fy, fp = pose.fp, fr = pose.fr;
      add(fanH.scr.d + 0.8, () => this.drawFanAt(ctx, proj, fanH.local, pose.fy, fp, fr, open, torn, look, time));
      // fan part-break flash
      if (!look.decoy && this.leftPauldronFlashTimer > 0 && !this.leftPauldronBroken) {
        add(fanH.scr.d + 0.9, () => { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,255,255,${this.leftPauldronFlashTimer * 4})`; ctx.beginPath(); ctx.arc(fanH.scr.x, fanH.scr.y, 14 * S, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; });
      }
    }

    // ---- head, face, hair
    const headLocal = up(0.6 + pose.hn * 2.5, 0, HEADC - Math.abs(pose.hn) * 1.4);
    const Hd = P3(headLocal);
    const hTurn = facing + tw + pose.ht;
    const fv = Math.sin(hTurn);                   // > 0 face visible
    const side = Math.cos(hTurn);                 // which way the profile points on screen
    // ponytail behind / in front by depth of its root
    const hairPts = (this.hairN || []).map(n => P3(up(n.f, n.s, n.u - (pose.kn * 16) + 0)));
    const hairD = hairPts.length ? (hairPts[1] ? hairPts[1].d : 0) : -1;
    add(Math.min(Hd.d - 0.4, hairD), () => this.drawPonytail(ctx, hairPts, S, time, look));
    add(Hd.d, () => this.drawHead(ctx, Hd, HEADR * 1.08 * S, S, side, fv, look, flash, trim, time));

    // ---- the crown of five flames, floating over her head (a break part)
    const crownBroken = look.decoy ? !!look.noCrown : this.crownGone;
    const crownC = up(0.4, 0, HEADC + HEADR + 7 + Math.sin(time * 2.2) * 0.8);
    add(Hd.d + 0.5, () => this.drawCrown(ctx, P3(crownC), S, time, crownBroken, trim, look));
    if (!look.decoy) {
      const cr = P3(crownC), fs = fanH ? fanH.scr : cr;
      if (this.leftShoulderWorld) { this.leftShoulderWorld.sx = fs.x; this.leftShoulderWorld.sy = fs.y; }
      if (this.rightShoulderWorld) { this.rightShoulderWorld.sx = cr.x; this.rightShoulderWorld.sy = cr.y; }
      // left hand position in the world (fireballs leave from it)
      const lh = hands.l ? hands.l.local : { f: 10, s: -6, u: 70 };
      this._lhWorld = { x: X + (lh.f * cs - lh.s * sn) * S, y: Y + (lh.f * sn + lh.s * cs) * S * tilt, z: lh.u * S + lift };
    }

    // ---- embers drifting off her
    if (!look.decoy && this.embers && this.embers.length) {
      add(99, () => {
        ctx.globalCompositeOperation = 'lighter';
        for (const e of this.embers) {
          const p = proj(e.f, e.s, e.u), k = 1 - e.t / e.life;
          ctx.fillStyle = `rgba(255,${Math.round(150 + 80 * k)},70,${0.85 * k})`;
          ctx.fillRect(p.x - 1, p.y - 1, 2 * k + 0.6, 2 * k + 0.6);
        }
        ctx.globalCompositeOperation = 'source-over';
      });
    }

    parts.sort((a, b) => a.d - b.d);
    for (const p of parts) { ctx.save(); try { p.fn(); } finally { ctx.restore(); } }
    // a white wash while she is struck (on top of everything)
    ctx.restore();
  };

  // ---- her face reads the fight -------------------------------------------------------------------------------------------------
  // eye: lid opening (0 shut .. 1.2 wide) · brow: -1 furious V .. +1 worried · raise: the one arched brow · mouth: shape name
  // wink: the left eye shuts · blush: cheek colour · gaze: pupils slide sideways
  P.ignisExpr = function () {
    const st = this.state, t = this.patT || 0, m = this.mech;
    const E = (eye, brow, raise, mouth, extra) => Object.assign({ eye, brow, raise, mouth, wink: false, blush: 0.25, gaze: 0 }, extra || {});
    if (this.hp <= 0) return E(0, 0.3, 0, 'smile', { blush: 0.4 });
    if (st === 'staggered') return E(1.2, 0.9, 0, 'o', { blush: 0.55 });
    if (st === 'rebuked' || st === 'flinched') return E(1.15, 0.7, 0, 'o', { blush: 0.45 });
    if (st === 'karok_clash') {
      const c = this.karokClash || { meter: 0.5, phase: 'intro' };
      if (c.phase === 'finish') return c.win ? E(1.2, 0.9, 0, 'o', { blush: 0.6 }) : E(0.7, -0.4, 0.6, 'grin');
      return c.meter > 0.55 ? E(0.35, -1, 0, 'strain', { blush: 0.55 }) : E(0.9, -0.7, 0, 'shout');
    }
    if (st === 'pat_getsuga_charge') { const p = this.getsugaProgress ? this.getsugaProgress() : 0; return p < 0.7 ? E(0.75, -0.8, 0, 'grin') : E(1.0, -1, 0, 'shout'); }
    if (this.tantrumT > 0) return E(1.05, -1, 0, 'snarl', { blush: 0.5 });
    if (m) {
      if (m.kind === 'curtain') return m.found ? E(0.65, 0.6, 0, 'pout', { gaze: -0.6, blush: 0.5 }) : E(0.6, 0, 1, 'smirk');
      if (m.kind === 'finale') return m.phase === 'down' ? E(1.2, 0.9, 0, 'o') : E(0.85, -0.3, 0.6, 'grin');
      return E(0.6, -0.2, 1, 'smirk');
    }
    if (st === 'intro_cutscene') return t < 2.1 ? E(0, 0, 0, 'smile') : E(0.55, 0, 1, 'smirk');
    if (st === 'ig_kiss') return t < 1.0 ? E(0.7, 0.1, 0.5, 'kiss', { wink: t > 0.3, blush: 0.5 }) : E(0.6, 0, 1, 'smirk');
    if (st === 'ig_taunt') {
      const k = this.tauntKind || 0;
      return k === 1 ? E(0.15, 0.3, 0, 'yawn') : (k === 0 ? E(0.45, 0.2, 0.3, 'flat', { gaze: -0.8 }) : E(0.55, 0, 1, 'smirk', { gaze: 0.6 }));
    }
    if (st === 'ig_hair_flip' || st === 'ig_curtsy') return E(0.5, 0.1, 1, 'smirk');
    if (st === 'ig_gaze') return (this.gaze ? this.gaze.flip : this.crownGone) ? E(1.0, 0.85, 0, 'pout', { gaze: -0.8, blush: 0.6 }) : E(0.5, 0.15, 1, 'smile', { blush: 0.45 });
    if (st === 'ig_script') return t < 4.4 ? E(0.45, 0.1, 0.4, 'smirk', { gaze: 0.2 }) : E(0.85, -0.45, 0.3, 'grin');
    if (st === 'ig_ovation' || st === 'ig_fireworks') return E(0, 0.2, 0, 'laugh', { blush: 0.4 });
    if (/^ig_/.test(st)) return E(0.85, -0.45, 0.3, 'grin');
    if (this.ego >= 85) return E(0.5, 0.1, 1, 'smirk');
    return E(0.68, 0, 0.8, 'smirk');
  };

  P.drawHead = function (ctx, Hd, r, S, side, fv, look, flash, trim, time) {
    const sd = side >= 0 ? 1 : -1;
    // back hair mass, with volume shading
    const hg = ctx.createRadialGradient(Hd.x - r * 0.35, Hd.y - r * 0.6, r * 0.1, Hd.x, Hd.y, r * 1.35);
    hg.addColorStop(0, '#ef5a24'); hg.addColorStop(0.55, COL.hair); hg.addColorStop(1, '#6e0f0c');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(Hd.x - side * r * 0.15, Hd.y + r * 0.1, r * 1.14, r * 1.2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
    if (fv <= -0.35) {
      // the back of her head: hair drawn up into the ponytail, strands converging on a gold clasp
      ctx.strokeStyle = 'rgba(255,150,70,0.16)'; ctx.lineWidth = 0.6;
      for (let i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.moveTo(Hd.x + i * r * 0.6, Hd.y + r * 0.8); ctx.quadraticCurveTo(Hd.x + i * r * 0.5, Hd.y - r * 0.2, Hd.x, Hd.y - r * 0.85); ctx.stroke(); }
      const cg = ctx.createRadialGradient(Hd.x - r * 0.1, Hd.y - r * 0.9, 0.2, Hd.x, Hd.y - r * 0.85, r * 0.35);
      cg.addColorStop(0, '#fff3c2'); cg.addColorStop(1, trim);
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(Hd.x, Hd.y - r * 0.85, r * 0.34, r * 0.21, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.stroke();
      return;
    }
    const fx = Hd.x + side * r * 0.32 * (1 - Math.max(0, fv)), fy = Hd.y + r * 0.1;
    const fw = r * (0.55 + 0.35 * Math.max(0, fv));
    // face: an oval with a narrow chin, lit from the key side
    ctx.beginPath();
    ctx.moveTo(fx - fw, fy - r * 0.15);
    ctx.bezierCurveTo(fx - fw, fy - r * 1.05, fx + fw, fy - r * 1.05, fx + fw, fy - r * 0.15);
    ctx.bezierCurveTo(fx + fw, fy + r * 0.45, fx + side * r * 0.15 + fw * 0.25, fy + r * 0.92, fx + side * r * 0.12, fy + r * 0.98);
    ctx.bezierCurveTo(fx + side * r * 0.12 - fw * 0.25, fy + r * 0.92, fx - fw, fy + r * 0.45, fx - fw, fy - r * 0.15);
    ctx.closePath();
    const sk = ctx.createLinearGradient(fx - fw, fy, fx + fw, fy);
    sk.addColorStop(0, side > 0 ? COL.skinDk : '#fde3d2'); sk.addColorStop(0.55, COL.skin); sk.addColorStop(1, side > 0 ? '#fde3d2' : COL.skinDk);
    ctx.fillStyle = flash > 0 ? '#fff1f2' : sk; ctx.fill();
    underGlow(ctx, fy, fy + r, 0.18);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();

    if (fv > 0.1) {
      if (look.mask != null && !look.unmasked) this.drawMask(ctx, fx, fy, fw, r, look.mask, trim, fv);
      else this.drawFace(ctx, fx, fy, r, S, side, fv, look.decoy ? { eye: 0.68, brow: 0, raise: 0.8, mouth: 'smirk', wink: false, blush: 0.25, gaze: 0 } : this.ignisExpr(), time);
    }
    // swept bangs over one eye (mirrored with the head's turn), a lock falling past the cheek, each tip burning
    const bx = (k) => Hd.x + sd * k * r;
    ctx.beginPath();
    ctx.moveTo(bx(-1.08), Hd.y - r * 0.1);
    ctx.bezierCurveTo(bx(-0.9), Hd.y - r * 1.25, bx(0.2), Hd.y - r * 1.5, bx(0.98), Hd.y - r * 0.82);
    ctx.quadraticCurveTo(bx(0.35), Hd.y - r * 0.62, bx(-0.05), Hd.y - r * 0.05);
    ctx.quadraticCurveTo(bx(-0.55), Hd.y + r * 0.25, bx(-1.0), Hd.y + r * 1.0);
    ctx.closePath();
    const bg = ctx.createLinearGradient(Hd.x, Hd.y - r * 1.4, Hd.x, Hd.y + r);
    bg.addColorStop(0, '#f2632a'); bg.addColorStop(0.5, COL.hair); bg.addColorStop(1, '#8a1410');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
    // glossy strands
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,190,110,0.55)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(bx(-0.75), Hd.y - r * 0.45); ctx.quadraticCurveTo(bx(-0.1), Hd.y - r * 1.2, bx(0.7), Hd.y - r * 0.8); ctx.stroke();
    ctx.strokeStyle = 'rgba(90,10,6,0.5)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(bx(-0.9), Hd.y + r * 0.1); ctx.quadraticCurveTo(bx(-0.5), Hd.y - r * 0.5, bx(0.2), Hd.y - r * 0.75); ctx.stroke();
    if (!look.ghost) {
      ctx.globalCompositeOperation = 'lighter';
      const hot = this.tantrumT > 0 && !look.decoy ? 1.7 : (this.act2 && !look.decoy ? 1.4 : 1);
      flameTongue(ctx, bx(-1.0), Hd.y + r * 0.95, 2.2 * S, 0.8 * S, time, 11 + (look.seed || 0), hot);
      flameTongue(ctx, bx(0.98), Hd.y - r * 0.84, 1.8 * S, 0.7 * S, time, 17 + (look.seed || 0), hot);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  P.drawFace = function (ctx, fx, fy, r, S, side, fv, E, time) {
    const ex = fx + side * r * 0.12, ey = fy - r * 0.06;
    const sep = r * 0.36 * fv;
    // blinking (a quick double-shut every few seconds; not while her eyes are already doing something)
    const bt = (time + (this._blinkSeed || 0)) % 4.3;
    const blink = bt < 0.11 ? 0 : 1;
    const ew = r * 0.19 * (0.55 + 0.45 * fv);
    // cheek blush
    ctx.globalCompositeOperation = 'source-over';
    for (const sgn of [-1, 1]) {
      const cx = ex + sgn * sep * 1.15, cy = fy + r * 0.3;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.24);
      g.addColorStop(0, `rgba(240,80,100,${0.35 * E.blush + 0.08})`); g.addColorStop(1, 'rgba(240,80,100,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 0.24, 0, TAU); ctx.fill();
    }
    for (const sgn of [-1, 1]) {
      const x = ex + sgn * sep;
      let open = E.eye * blink;
      if (E.wink && sgn < 0) open = 0;
      // smoky lid shadow
      const sh = ctx.createRadialGradient(x, ey - r * 0.08, 0, x, ey - r * 0.08, r * 0.26);
      sh.addColorStop(0, 'rgba(170,30,50,0.42)'); sh.addColorStop(1, 'rgba(170,30,50,0)');
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(x, ey - r * 0.08, r * 0.26, 0, TAU); ctx.fill();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (open < 0.12) {
        // shut: a curved lash line (happy arcs when laughing / smiling)
        const happy = E.mouth === 'laugh' || E.mouth === 'smile' || E.wink;
        ctx.strokeStyle = '#1a0a10'; ctx.lineWidth = r * 0.075;
        ctx.beginPath(); ctx.moveTo(x - ew, ey); ctx.quadraticCurveTo(x, ey + (happy ? -r * 0.14 : r * 0.08), x + ew, ey); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + sgn * ew, ey); ctx.lineTo(x + sgn * ew * 1.45, ey - r * 0.08); ctx.stroke();
      } else {
        const eh = r * 0.13 * Math.min(1.25, open);
        const almond = () => { ctx.beginPath(); ctx.moveTo(x - ew, ey); ctx.quadraticCurveTo(x, ey - eh * 1.7, x + ew, ey - eh * 0.2); ctx.quadraticCurveTo(x, ey + eh * 1.3, x - ew, ey); ctx.closePath(); };
        almond(); ctx.fillStyle = '#fff6ee'; ctx.fill();
        // amber iris and pupil, clipped to the eye; they glow red in a tantrum
        ctx.save(); almond(); ctx.clip();
        const ix = x + side * ew * 0.12 + E.gaze * ew * 0.45, iy = ey - eh * 0.15, ir = Math.max(r * 0.085, eh * 0.95);
        const ig = ctx.createRadialGradient(ix, iy - ir * 0.3, 0, ix, iy, ir);
        const tant = this.tantrumT > 0;
        ig.addColorStop(0, tant ? '#ffd0a0' : '#ffe9a8'); ig.addColorStop(0.55, tant ? '#ff4a2a' : '#f2a020'); ig.addColorStop(1, tant ? '#7a0a0a' : '#7a3a08');
        ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
        ctx.fillStyle = '#12060a'; ctx.beginPath(); ctx.ellipse(ix, iy, ir * 0.38, ir * (open > 1.05 ? 0.38 : 0.6), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(ix - ir * 0.35, iy - ir * 0.35, ir * 0.24, 0, TAU); ctx.fill();
        // the upper lid's shadow on the eyeball
        ctx.fillStyle = 'rgba(80,20,30,0.22)'; ctx.fillRect(x - ew, ey - eh * 2, ew * 2, eh * 0.9);
        ctx.restore();
        // heavy upper lash line with a winged flick, a fine lower line
        ctx.strokeStyle = '#14060c'; ctx.lineWidth = r * 0.085;
        ctx.beginPath(); ctx.moveTo(x - ew * 1.02, ey + r * 0.01); ctx.quadraticCurveTo(x, ey - eh * 1.75, x + ew * 1.02, ey - eh * 0.22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + sgn * ew * 0.95, ey - (sgn > 0 ? eh * 0.25 : -r * 0.01)); ctx.lineTo(x + sgn * ew * 1.55, ey - r * 0.13); ctx.stroke();
        ctx.lineWidth = r * 0.03; ctx.strokeStyle = 'rgba(40,10,16,0.6)';
        ctx.beginPath(); ctx.moveTo(x - ew * 0.8, ey + eh * 0.5); ctx.quadraticCurveTo(x, ey + eh * 1.3, x + ew * 0.9, ey + eh * 0.1); ctx.stroke();
      }
      // brow: angle from the expression; the arched one lifts
      const browY = ey - r * (0.27 + Math.max(0, E.eye - 0.7) * 0.12);
      const inner = -E.brow * r * 0.08, outer = E.brow * r * 0.035 - (sgn > 0 ? E.raise * r * 0.07 : 0);
      ctx.strokeStyle = '#4a0e0c'; ctx.lineWidth = r * 0.075; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - sgn * ew * 0.85, browY + inner);
      ctx.quadraticCurveTo(x + sgn * ew * 0.2, browY - r * 0.1 + (inner + outer) * 0.4 - (sgn > 0 ? E.raise * r * 0.05 : 0), x + sgn * ew * 1.2, browY + outer + r * 0.03);
      ctx.stroke();
    }
    // nose: a hint of shadow on the shaded side
    ctx.strokeStyle = 'rgba(150,70,60,0.55)'; ctx.lineWidth = r * 0.04;
    const nx = fx + side * r * 0.14;
    ctx.beginPath(); ctx.moveTo(nx + side * r * 0.02, fy + r * 0.05); ctx.quadraticCurveTo(nx + side * r * 0.08, fy + r * 0.24, nx - side * r * 0.04, fy + r * 0.27); ctx.stroke();
    this.drawMouth(ctx, fx + side * r * 0.1, fy + r * 0.52, r, fv, E.mouth, side, time);
  };

  P.drawMouth = function (ctx, lx, ly, r, fv, kind, side, time) {
    const mw = r * 0.24 * (0.6 + 0.4 * fv);
    const LIP = '#d01c45', LIPDK = '#7a0a22', DARK = '#3a0610', TEETH = '#fff8f2';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const gloss = (x, y) => { ctx.fillStyle = 'rgba(255,220,230,0.65)'; ctx.beginPath(); ctx.ellipse(x, y, mw * 0.18, r * 0.02, 0, 0, TAU); ctx.fill(); };
    switch (kind) {
      case 'grin': case 'laugh': {
        const h = kind === 'laugh' ? r * 0.2 : r * 0.14;
        ctx.fillStyle = DARK; ctx.beginPath(); ctx.moveTo(lx - mw, ly - r * 0.03); ctx.quadraticCurveTo(lx, ly - r * 0.08, lx + mw * 1.05, ly - r * 0.06); ctx.quadraticCurveTo(lx + mw * 0.2, ly + h * 1.5, lx - mw, ly - r * 0.03); ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = TEETH; ctx.fillRect(lx - mw * 1.1, ly - r * 0.1, mw * 2.3, r * 0.09);
        if (kind === 'laugh') { ctx.fillStyle = '#e0506a'; ctx.beginPath(); ctx.ellipse(lx, ly + h, mw * 0.5, h * 0.45, 0, 0, TAU); ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = LIP; ctx.lineWidth = r * 0.06; ctx.stroke();
        break;
      }
      case 'shout': case 'yawn': {
        const w = kind === 'yawn' ? mw * 0.6 : mw * 0.85, h = kind === 'yawn' ? r * 0.2 : r * 0.17;
        ctx.fillStyle = DARK; ctx.beginPath(); ctx.ellipse(lx, ly + h * 0.35, w, h, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.clip();
        if (kind === 'shout') { ctx.fillStyle = TEETH; ctx.fillRect(lx - w, ly + h * 0.35 - h, w * 2, h * 0.32); }
        ctx.fillStyle = '#e0506a'; ctx.beginPath(); ctx.ellipse(lx, ly + h * 1.1, w * 0.7, h * 0.45, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = LIP; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.ellipse(lx, ly + h * 0.35, w, h, 0, 0, TAU); ctx.stroke();
        break;
      }
      case 'snarl': case 'strain': {
        const h = kind === 'snarl' ? r * 0.12 : r * 0.09;
        ctx.fillStyle = TEETH; ctx.beginPath(); ctx.moveTo(lx - mw, ly); ctx.quadraticCurveTo(lx, ly - h * (kind === 'snarl' ? 1.2 : 0.6), lx + mw, ly); ctx.quadraticCurveTo(lx, ly + h, lx - mw, ly); ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,90,0.8)'; ctx.lineWidth = r * 0.02;
        ctx.beginPath(); ctx.moveTo(lx - mw * 0.9, ly + h * 0.1); ctx.lineTo(lx + mw * 0.9, ly + h * 0.1); ctx.stroke();
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(lx + i * mw * 0.32, ly - h * 0.5); ctx.lineTo(lx + i * mw * 0.32, ly + h * 0.6); ctx.stroke(); }
        ctx.strokeStyle = LIP; ctx.lineWidth = r * 0.065;
        ctx.beginPath(); ctx.moveTo(lx - mw, ly); ctx.quadraticCurveTo(lx, ly - h * (kind === 'snarl' ? 1.2 : 0.6), lx + mw, ly); ctx.quadraticCurveTo(lx, ly + h, lx - mw, ly); ctx.stroke();
        break;
      }
      case 'o': {
        ctx.fillStyle = DARK; ctx.beginPath(); ctx.ellipse(lx, ly + r * 0.03, mw * 0.36, r * 0.1, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = LIP; ctx.lineWidth = r * 0.065; ctx.stroke();
        break;
      }
      case 'kiss': {
        ctx.fillStyle = LIP; ctx.beginPath(); ctx.ellipse(lx + side * r * 0.03, ly, mw * 0.38, r * 0.085, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = LIPDK; ctx.lineWidth = r * 0.025; ctx.beginPath(); ctx.moveTo(lx - mw * 0.25, ly); ctx.lineTo(lx + mw * 0.3, ly); ctx.stroke();
        gloss(lx, ly - r * 0.04);
        break;
      }
      case 'pout': {
        ctx.fillStyle = LIP;
        ctx.beginPath(); ctx.moveTo(lx - mw * 0.75, ly + r * 0.03); ctx.quadraticCurveTo(lx, ly - r * 0.07, lx + mw * 0.75, ly + r * 0.03); ctx.quadraticCurveTo(lx, ly + r * 0.15, lx - mw * 0.75, ly + r * 0.03); ctx.fill();
        ctx.strokeStyle = LIPDK; ctx.lineWidth = r * 0.03; ctx.beginPath(); ctx.moveTo(lx - mw * 0.7, ly + r * 0.04); ctx.quadraticCurveTo(lx, ly + r * 0.0, lx + mw * 0.7, ly + r * 0.04); ctx.stroke();
        gloss(lx, ly + r * 0.08);
        break;
      }
      case 'flat': {
        ctx.fillStyle = LIP; ctx.beginPath(); ctx.moveTo(lx - mw, ly); ctx.quadraticCurveTo(lx, ly - r * 0.05, lx + mw, ly); ctx.quadraticCurveTo(lx, ly + r * 0.07, lx - mw, ly); ctx.fill();
        ctx.strokeStyle = LIPDK; ctx.lineWidth = r * 0.025; ctx.beginPath(); ctx.moveTo(lx - mw, ly); ctx.lineTo(lx + mw, ly); ctx.stroke();
        break;
      }
      case 'smile': {
        ctx.strokeStyle = LIP; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(lx - mw * 0.8, ly - r * 0.03); ctx.quadraticCurveTo(lx, ly + r * 0.09, lx + mw * 0.8, ly - r * 0.03); ctx.stroke();
        break;
      }
      default: {   // smirk: full red lips, one corner pulled up
        const up = side >= 0 ? 1 : -1;
        ctx.fillStyle = LIP; ctx.beginPath();
        ctx.moveTo(lx - mw, ly + (up < 0 ? -r * 0.07 : r * 0.01));
        ctx.quadraticCurveTo(lx - mw * 0.3, ly - r * 0.08, lx, ly - r * 0.04);
        ctx.quadraticCurveTo(lx + mw * 0.3, ly - r * 0.08, lx + mw * 1.05, ly + (up > 0 ? -r * 0.08 : r * 0.01));
        ctx.quadraticCurveTo(lx, ly + r * 0.13, lx - mw, ly + (up < 0 ? -r * 0.07 : r * 0.01));
        ctx.fill();
        ctx.strokeStyle = LIPDK; ctx.lineWidth = r * 0.028;
        ctx.beginPath(); ctx.moveTo(lx - mw * 0.9, ly + (up < 0 ? -r * 0.05 : 0)); ctx.quadraticCurveTo(lx, ly + r * 0.02, lx + mw * 0.95, ly + (up > 0 ? -r * 0.07 : 0)); ctx.stroke();
        gloss(lx - mw * 0.1, ly + r * 0.06);
      }
    }
  };

  P.drawPonytail = function (ctx, pts, S, time, look) {
    if (pts.length < 3) return;
    const n = pts.length;
    // build a tapered ribbon along the chain
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const w = (4.6 - i * 0.42) * S * (look && look.decoy ? 1 : 1);
      left.push({ x: pts[i].x - dy / L * w, y: pts[i].y + dx / L * w });
      right.push({ x: pts[i].x + dy / L * w, y: pts[i].y - dx / L * w });
    }
    // hair at the root, turning to fire along its length: the last third is no longer hair at all
    const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[n - 1].x, pts[n - 1].y);
    g.addColorStop(0, '#a01a14'); g.addColorStop(0.35, COL.hair); g.addColorStop(0.6, '#e0461b'); g.addColorStop(0.8, 'rgba(242,107,29,0.55)'); g.addColorStop(1, 'rgba(255,208,74,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < n; i++) { const a = left[i - 1], b = left[i]; ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); }
    const tip = pts[n - 1];
    ctx.lineTo(tip.x, tip.y);
    for (let i = n - 1; i > 0; i--) { const a = right[i], b = right[i - 1]; ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); }
    ctx.lineTo(right[0].x, right[0].y);
    ctx.closePath(); ctx.fill();
    // ink only along the hair part of the ribbon
    ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 0.8;
    const half = Math.ceil(n * 0.55);
    for (const side of [left, right]) { ctx.beginPath(); ctx.moveTo(side[0].x, side[0].y); for (let i = 1; i < half; i++) ctx.lineTo(side[i].x, side[i].y); ctx.stroke(); }
    ctx.restore();
    // glossy strands
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,170,90,0.5)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < half + 1; i++) ctx.lineTo((pts[i].x + left[i].x) / 2, (pts[i].y + left[i].y) / 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,10,5,0.45)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < half + 1; i++) ctx.lineTo((pts[i].x + right[i].x) / 2, (pts[i].y + right[i].y) / 2); ctx.stroke();
    if (look && look.ghost) return;
    // the burning half: tongues of fire rising off every link, biggest at the tip
    ctx.globalCompositeOperation = 'lighter';
    const hot = this.tantrumT > 0 && !(look && look.decoy) ? 1.7 : (this.act2 && !(look && look.decoy) ? 1.45 : 1);
    const from = Math.floor(n * 0.4);
    for (let i = from; i < n; i++) {
      const p = pts[i], k = (i - from) / Math.max(1, n - 1 - from);
      const w = (4.6 - i * 0.42) * S;
      flameTongue(ctx, p.x, p.y + w * 0.5, (3.5 + k * 7) * S, Math.max(1.1 * S, w * 0.85), time, i * 1.9 + ((look && look.seed) || 0), hot);
    }
    flameTongue(ctx, tip.x, tip.y + 1.5 * S, 12 * S, 2.6 * S, time, 41 + ((look && look.seed) || 0), hot);
    const fg = ctx.createRadialGradient(tip.x, tip.y - 4 * S, 0, tip.x, tip.y - 4 * S, 14 * S * hot);
    fg.addColorStop(0, 'rgba(255,200,90,0.35)'); fg.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(tip.x, tip.y - 4 * S, 14 * S * hot, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  };

  // the fan, opened in 3D: ribs fan out from the pivot in the plane set by yaw / pitch / roll (her own frame)
  P.drawFanAt = function (ctx, proj, hand, fy, fp, fr, open, torn, look, time) {
    const A = { f: Math.cos(fp) * Math.cos(fy), s: Math.cos(fp) * Math.sin(fy), u: Math.sin(fp) };
    // a horizontal perpendicular, then rolled
    let B = { f: -A.s, s: A.f, u: 0 }; const bl = Math.hypot(B.f, B.s) || 1; B.f /= bl; B.s /= bl;
    const C = { f: B.s * A.u - B.u * A.s, s: B.u * A.f - B.f * A.u, u: B.f * A.s - B.s * A.f };
    const V = { f: B.f * Math.cos(fr) + C.f * Math.sin(fr), s: B.s * Math.cos(fr) + C.s * Math.sin(fr), u: B.u * Math.cos(fr) + C.u * Math.sin(fr) };
    const L = 17.5, spread = lerp(0.1, 2.5, c01(open));
    const N = 11;
    const ribAt = (phi, len) => {
      const c = Math.cos(phi), s = Math.sin(phi);
      return proj(hand.f + (A.f * c + V.f * s) * len, hand.s + (A.s * c + V.s * s) * len, hand.u + (A.u * c + V.u * s) * len);
    };
    const pv = proj(hand.f, hand.s, hand.u);
    const outer = [], inner = [];
    for (let i = 0; i < N; i++) { const phi = -spread / 2 + spread * i / (N - 1); outer.push(ribAt(phi, L)); inner.push(ribAt(phi, L * 0.38)); }
    const tornGap = (i) => torn && i >= 6 && i <= 8;
    // silk leaves (painted crimson with a gold flame)
    if (open > 0.15) {
      for (let i = 0; i < N - 1; i++) {
        if (tornGap(i)) continue;
        const g = ctx.createLinearGradient(pv.x, pv.y, outer[i].x, outer[i].y);
        g.addColorStop(0, '#5a0b14'); g.addColorStop(0.5, i % 2 ? COL.silk : COL.silk2); g.addColorStop(1, '#ffb347');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(inner[i].x, inner[i].y); ctx.lineTo(outer[i].x, outer[i].y); ctx.lineTo(outer[i + 1].x, outer[i + 1].y); ctx.lineTo(inner[i + 1].x, inner[i + 1].y); ctx.closePath(); ctx.fill();
      }
      if (torn) {   // ragged edges where it was torn
        ctx.strokeStyle = '#3b0a10'; ctx.lineWidth = 0.8;
        for (const i of [6, 9]) { const a = inner[i], b = outer[i]; ctx.beginPath(); ctx.moveTo(a.x, a.y); for (let k = 1; k <= 4; k++) ctx.lineTo(lerp(a.x, b.x, k / 4) + (k % 2 ? 2 : -2), lerp(a.y, b.y, k / 4)); ctx.stroke(); }
      }
      // the painted flame on the silk
      const mid = Math.floor(N / 2);
      if (!torn || mid < 6) {
        const a = ribAt(-0.15 * spread, L * 0.6), b = ribAt(0, L * 0.92), c = ribAt(0.15 * spread, L * 0.6), d = ribAt(0, L * 0.5);
        ctx.fillStyle = 'rgba(255,200,80,0.8)'; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(a.x, a.y, b.x, b.y); ctx.quadraticCurveTo(c.x, c.y, d.x, d.y); ctx.fill();
      }
      // gold rim
      ctx.strokeStyle = look && look.trim === 1 ? COL.silver : COL.trim; ctx.lineWidth = 1.1;
      ctx.beginPath(); let started = false;
      for (let i = 0; i < N; i++) { if (tornGap(i) && i !== 6) { started = false; continue; } if (!started) { ctx.moveTo(outer[i].x, outer[i].y); started = true; } else ctx.lineTo(outer[i].x, outer[i].y); }
      ctx.stroke();
      // the painted silk smoulders along its edge: small flames on the rim and an ember glow
      if (open > 0.4 && !(look && look.ghost)) {
        const S = this.modelScale || 1.5, hot = this.tantrumT > 0 && !(look && look.decoy) ? 1.6 : 1;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < N; i += 2) {
          if (tornGap(i)) continue;
          const o = outer[i];
          flameTongue(ctx, o.x, o.y + 0.5 * S, (2.2 + (i % 4 ? 0.8 : 1.6)) * S * c01((open - 0.4) / 0.4), 0.85 * S, time, i * 2.3 + ((look && look.seed) || 0), hot);
        }
        ctx.strokeStyle = `rgba(255,150,60,${0.35 + 0.15 * Math.sin(time * 9)})`; ctx.lineWidth = 2.2;
        ctx.beginPath(); let on = false;
        for (let i = 0; i < N; i++) { if (tornGap(i) && i !== 6) { on = false; continue; } if (!on) { ctx.moveTo(outer[i].x, outer[i].y); on = true; } else ctx.lineTo(outer[i].x, outer[i].y); }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // lacquered ribs
    ctx.strokeStyle = COL.rib; ctx.lineWidth = 1.1;
    for (let i = 0; i < N; i++) {
      const e = tornGap(i) ? { x: lerp(pv.x, outer[i].x, 0.55) + 2, y: lerp(pv.y, outer[i].y, 0.55) } : outer[i];
      ctx.beginPath(); ctx.moveTo(pv.x, pv.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
    ctx.fillStyle = look && look.trim === 1 ? COL.silver : COL.trim; ctx.beginPath(); ctx.arc(pv.x, pv.y, 1.6, 0, TAU); ctx.fill();
  };

  P.drawCrown = function (ctx, c, S, time, broken, trim, look) {
    const rx = 6.2 * S, ry = rx * T() * 0.55;
    if (broken) {
      // just a cracked ring sputtering a few sparks
      ctx.strokeStyle = 'rgba(120,90,40,0.8)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0.3, Math.PI * 1.4); ctx.stroke();
      if (Math.sin(time * 9) > 0.7) { ctx.fillStyle = 'rgba(255,170,60,0.8)'; ctx.fillRect(c.x + Math.sin(time * 31) * rx, c.y - 2, 1.6, 1.6); }
      return;
    }
    const spin = time * 0.9;
    const flash = !look.decoy && this.rightPauldronFlashTimer > 0;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(c.x, c.y - 4 * S, 1, c.x, c.y - 4 * S, 14 * S);
    g.addColorStop(0, 'rgba(255,200,90,0.45)'); g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y - 4 * S, 14 * S, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // back half of the ring, flames, front half
    const pts = [];
    for (let i = 0; i < 5; i++) { const a = spin + i * TAU / 5; pts.push({ a, x: c.x + Math.cos(a) * rx, y: c.y + Math.sin(a) * ry, front: Math.sin(a) > 0 }); }
    ctx.strokeStyle = trim; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, Math.PI, TAU); ctx.stroke();
    for (const p of pts.sort((a, b) => a.y - b.y)) {
      const h = (5.5 + Math.sin(time * 11 + p.a * 3) * 0.9) * S;
      const fg = ctx.createLinearGradient(p.x, p.y, p.x, p.y - h);
      fg.addColorStop(0, flash ? '#ffffff' : '#ff6a1a'); fg.addColorStop(0.6, flash ? '#ffffff' : '#ffb340'); fg.addColorStop(1, 'rgba(255,240,180,0.9)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(p.x - 1.6 * S, p.y); ctx.quadraticCurveTo(p.x - 1.8 * S, p.y - h * 0.5, p.x + Math.sin(time * 9 + p.a) * 0.8, p.y - h); ctx.quadraticCurveTo(p.x + 1.8 * S, p.y - h * 0.5, p.x + 1.6 * S, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(p.x, p.y, 1.1 * S, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = trim; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI); ctx.stroke();
  };

  // a theatre mask over the face: a porcelain half mask with a painted smile, or a weeping one with a tear of gold
  P.drawMask = function (ctx, fx, fy, fw, r, kind, trim, fv) {
    ctx.fillStyle = '#f8f4ee'; ctx.strokeStyle = trim; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(fx, fy - r * 0.05, fw * 1.02, r * 0.9, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a0a10';
    const sep = r * 0.36 * fv;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      if (kind === 0) { ctx.moveTo(fx + s * sep - r * 0.18, fy - r * 0.1); ctx.quadraticCurveTo(fx + s * sep, fy - r * 0.35, fx + s * sep + r * 0.18, fy - r * 0.1); ctx.quadraticCurveTo(fx + s * sep, fy - r * 0.18, fx + s * sep - r * 0.18, fy - r * 0.1); }
      else { ctx.moveTo(fx + s * sep - r * 0.18, fy - r * 0.22); ctx.quadraticCurveTo(fx + s * sep, fy + r * 0.02, fx + s * sep + r * 0.18, fy - r * 0.22); ctx.quadraticCurveTo(fx + s * sep, fy - r * 0.12, fx + s * sep - r * 0.18, fy - r * 0.22); }
      ctx.fill();
    }
    ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (kind === 0) { ctx.moveTo(fx - r * 0.35, fy + r * 0.28); ctx.quadraticCurveTo(fx, fy + r * 0.7, fx + r * 0.35, fy + r * 0.28); }
    else { ctx.moveTo(fx - r * 0.3, fy + r * 0.55); ctx.quadraticCurveTo(fx, fy + r * 0.25, fx + r * 0.3, fy + r * 0.55); }
    ctx.stroke();
    if (kind === 1) { ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(fx + sep, fy + r * 0.12, r * 0.07, 0, TAU); ctx.arc(fx + sep, fy + r * 0.3, r * 0.05, 0, TAU); ctx.fill(); }
  };

  // world position of her left hand (fireballs leave from it); falls back to just in front of her chest
  P.handWorld = function () {
    return this._lhWorld || { x: this.x + Math.cos(this.facingAngle) * 18, y: this.y + Math.sin(this.facingAngle) * 18 * T(), z: 100 };
  };

  // =========================================================================================================================
  // DRAW: her (the shared draw wrappers — Rebuke glint, part-break burst, Broken marks, boss_motion glide — run around this)
  // =========================================================================================================================
  P.coreDraw = function (ctx) {
    if (this.hp <= 0) {
      // her last bow: she reels, sweeps into a bow and burns away into the footlights
      if (!this._deathAt) this._deathAt = now();
      const el = now() - this._deathAt;
      if (el > 2.4) return;
      const pose = K(el, [[0, PS.stagger], [0.55, PS.bow], [2.4, PS.bow]]);
      this._pose = pose;
      if (el > 0.9) this.drawIntroPyre(ctx, Math.min(2, (el - 0.9) * 1.6));
      this.drawFigure(ctx, this.x, this.y, this.facingAngle, pose, { alpha: 1 - c01((el - 1.0) / 1.3) });
      return;
    }
    this._deathAt = 0;
    const pose = this.livePose(this.ignisPose());
    this._pose = pose;
    let alpha = 1;
    const m = this.mech;
    if (m && m.kind === 'curtain' && m.phase === 'intro') alpha = Math.max(0, 1 - m.t / (m.introDur * 0.55));
    if (this.state === 'intro_cutscene') alpha = c01((this.patT - 0.15) / 1.4);
    let look = null;
    if (m && m.kind === 'curtain' && m.phase !== 'intro') {
      const f = m.figs[m.real];
      look = { mask: f.mask, fanOpen: f.fan, trim: f.trim, unmasked: m.found };
      if (!m.found) { const p = Object.assign({}, pose); p.fan = f.fan; this._pose = p; }
    }
    if (alpha <= 0.01) return;
    const X = this.x + this.recoilX * 0.4, Y = this.y + this.recoilY * 0.4;
    if (this.state === 'intro_cutscene' && this.patT < 2.1) this.drawIntroPyre(ctx, this.patT);
    const wing = this.wingSpread();
    if (wing > 0.01) this.drawPhoenixWings(ctx, X, Y - (this.jumpZ || 0), wing);
    const pr = this.proneInfo();
    if (pr) {
      // tipped over onto her face (Grave Anchor): the standing rig, rotated about her feet and flattened by the camera tilt
      // rotated in the ground plane so her head points at whoever hauled her in, then flattened by the camera tilt
      const S = this.modelScale, k = pr.k, tilt = T();
      const gx = Math.cos(pr.ang), gy = Math.sin(pr.ang);
      ctx.save(); ctx.fillStyle = `rgba(0,0,0,${0.32 + 0.1 * k})`;
      ctx.beginPath(); ctx.ellipse(X + gx * 62 * S * k, Y + gy * 62 * S * k * tilt, (25 + 40 * k) * S, (25 + 40 * k) * S * tilt * 0.7, Math.atan2(gy * tilt, gx) * k, 0, TAU); ctx.fill(); ctx.restore();
      let rot = pr.ang + Math.PI / 2; rot = Math.atan2(Math.sin(rot), Math.cos(rot));
      ctx.save();
      ctx.translate(X, Y - pr.lift); ctx.scale(1, lerp(1, tilt, k)); ctx.rotate(rot * k); ctx.translate(-X, -(Y - pr.lift));
      const face = k > 0.35 ? -Math.PI / 2 : this.facingAngle;
      this.drawFigure(ctx, X, Y - pr.lift, face, this._pose, Object.assign({ alpha, noShadow: true, lift: 0 }, look || {}));
      ctx.restore();
    } else {
      this.drawFigure(ctx, X, Y, this.facingAngle, this._pose, Object.assign({ alpha }, look || {}));
    }
    this.drawCounterTell(ctx, X, Y);
    if (this.tantrumT > 0) {
      // tantrum aura: a ragged red corona
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const t = now(), R = 60 * this.modelScale;
      const g = ctx.createRadialGradient(X, Y - 60, 10, X, Y - 60, R);
      g.addColorStop(0, 'rgba(255,60,30,0)'); g.addColorStop(0.7, `rgba(255,60,30,${0.12 + 0.06 * Math.sin(t * 13)})`); g.addColorStop(1, 'rgba(255,60,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y - 60, R, 0, TAU); ctx.fill(); ctx.restore();
    }
    // Curtain Call: her composure bar once she is unmasked
    if (m && m.kind === 'curtain' && m.found) {
      const w = 110, h = 8, x = this.x - w / 2, y = this.y - 200 - (this.jumpZ || 0);
      ctx.save(); ctx.fillStyle = 'rgba(10,4,8,0.85)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = '#fde047'; ctx.fillRect(x, y, w * c01(m.check / m.checkMax), h);
      ctx.fillStyle = '#fff7d6'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('COMPOSURE', this.x, y - 5); ctx.restore();
    }
  };

  // COUNTER TELL: the same one Vaelgor uses (boss_vaelgor.js, end of his draw): a pulsing blue ring around the chest
  // ACT II: the house curtains (screen space). Two velvet drapes sweep in from the sides and meet in the middle; a valance and
  // gold fringe hang along the top. While they are shut, a thin line of firelight shows through the gap from behind.
  P.drawHouseCurtains = function (ctx, W, H, c, m) {
    if (c <= 0.001) return;
    const t = now(), half = W / 2;
    ctx.save();
    const drape = (x0, x1, sg) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#3a0610'); g.addColorStop(0.5, '#7a0c22'); g.addColorStop(1, '#4a0814');
      ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), H);
      // folds: dark and light bands, swinging a little as the drape travels
      const n = 9, sway = Math.sin(t * 3) * 6 * (c < 1 ? 1 : 0.3);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n, x = lerp(x0, x1, u);
        const fg = ctx.createLinearGradient(x - 22, 0, x + 22, 0);
        fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.45, 'rgba(0,0,0,0.38)'); fg.addColorStop(0.55, 'rgba(255,90,110,0.12)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.moveTo(x - 22, 0); ctx.lineTo(x + 22, 0); ctx.lineTo(x + 22 + sway, H); ctx.lineTo(x - 22 + sway, H); ctx.closePath(); ctx.fill();
      }
      // gold fringe down the leading edge
      ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, H); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,120,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x1 - sg * 4, 0); ctx.lineTo(x1 - sg * 4, H); ctx.stroke();
    };
    const w = half * c;
    drape(0, w, 1);
    drape(W, W - w, -1);
    // firelight through the seam while she changes
    if (c > 0.97) {
      const flick = 0.55 + 0.45 * Math.sin(t * 13) * Math.sin(t * 7.3);
      ctx.globalCompositeOperation = 'lighter';
      const gl = ctx.createLinearGradient(half - 30, 0, half + 30, 0);
      gl.addColorStop(0, 'rgba(255,120,30,0)'); gl.addColorStop(0.5, `rgba(255,170,60,${0.35 * flick})`); gl.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = gl; ctx.fillRect(half - 30, 0, 60, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    // valance across the top
    ctx.fillStyle = '#5a0a18';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 70);
    for (let i = 12; i >= 0; i--) { const xx = W * i / 12; ctx.quadraticCurveTo(xx + W / 24, 104, xx, 70); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(W, 6); ctx.stroke();
    ctx.restore();
  };

  // GRAND FINALE: her phoenix wings. Falcon-shaped fans of feathers, every feather a living tongue of fire, spread from her
  // shoulder blades while she holds her sun overhead; they gutter out when she crashes down.
  P.drawPhoenixWings = function (ctx, X, Y, k) {
    const FA = window.FlameArt; if (!FA || k <= 0.01) return;
    const S = this.modelScale || 1, t = now();
    const ax = X, ay = Y - 66 * S;
    const flap = Math.sin(t * 2.2) * 0.08;
    ctx.save();
    for (const sg of [-1, 1]) {
      // a soft membrane of heat behind the feathers
      ctx.globalCompositeOperation = 'lighter';
      const N = 9, tips = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1), ang = lerp(-0.12, -1.45, u) + flap * (1 - u * 0.5);
        const L = (58 + 62 * Math.sin(u * Math.PI * 0.85 + 0.25)) * S * k;
        tips.push({ x: ax + sg * Math.cos(ang) * L, y: ay + Math.sin(ang) * L, ang, L });
      }
      const mg = ctx.createRadialGradient(ax, ay, 4, ax, ay, 130 * S * k);
      mg.addColorStop(0, `rgba(255,190,80,${0.28 * k})`); mg.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(ax, ay); for (const p of tips) ctx.lineTo(p.x, p.y); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      tips.forEach((p, i) => {
        ctx.save();
        ctx.translate(lerp(ax, p.x, 0.25), lerp(ay, p.y, 0.25));
        ctx.rotate(Math.atan2(p.y - ay, p.x - ax) + Math.PI / 2);
        FA.tongue(ctx, 0, 0, p.L * 0.95, (10 - i * 0.4) * S, t, 500 + i + (sg > 0 ? 30 : 0), { shadow: false, rate: 1.1, pal: i % 3 === 2 ? 'gold' : 'fire', alpha: k });
        ctx.restore();
      });
    }
    ctx.restore();
  };
  // how far her wings are spread (eased on the draw clock so the spread and the collapse are smooth on every client)
  P.wingSpread = function () {
    const m = this.mech, t = now();
    const dt = Math.min(0.05, Math.max(0, t - (this._wingT || t))); this._wingT = t;
    const want = (m && m.kind === 'finale' && m.phase !== 'down') ? 1 : 0;
    this._wingK = (this._wingK || 0) + (want - (this._wingK || 0)) * Math.min(1, dt * (want ? 2.2 : 3.5));
    return this._wingK;
  };

  // Act II costume: the same cut, re-dyed in ember colours (her decoys and reflections keep the old look)
  const ACT2_COL = { coat: '#7a0a16', coatHi: '#ff4d1a', coatDk: '#2e0408', lining: '#120306', silk: '#f97316', silk2: '#fde047', hair: '#ff4a12', hair2: '#ffa22e', hair3: '#fff0a0', trim: '#ffd25a', trimDk: '#c2700c' };
  const oDrawFigure = P.drawFigure;
  P.drawFigure = function (ctx, X, Y, facing, pose, look) {
    if (!this.act2 || (look && look.decoy)) return oDrawFigure.apply(this, arguments);
    const save = {};
    for (const k in ACT2_COL) { save[k] = COL[k]; COL[k] = ACT2_COL[k]; }
    try { return oDrawFigure.apply(this, arguments); } finally { Object.assign(COL, save); }
  };

  P.drawCounterTell = function (ctx, X, Y) {
    if (!this.isCounterable()) return;
    const S = this.modelScale || 1, cy = Y - 58 * S - (this.jumpZ || 0);
    const pulse = 0.6 + Math.sin(now() * 12) * 0.4, r = 46 + pulse * 8;
    ctx.save();
    ctx.globalAlpha = pulse; ctx.strokeStyle = '#38bdf8';
    // layered strokes for the glow, like his fakeGlow
    for (const [w, a] of [[4 + 22, 0.18], [4 + 12, 0.35], [4, 1]]) {
      ctx.lineWidth = w; ctx.globalAlpha = pulse * a;
      ctx.beginPath(); ctx.arc(X, cy, r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  };

  // { k: 0 standing .. 1 flat on her face, sgn: which way she fell, lift: height off the stage } or null
  P.proneInfo = function () {
    const c = this.karokClash;
    if (this.state === 'karok_clash' && c && c.style === 'beam' && c.win && c.phase === 'finish' && c.anc) {
      const A = window.KAROK_ANCHOR, ft = c.finishT || 0;
      this._proneAng = Math.atan2(-c.anc.u.y, -c.anc.u.x);      // ground-plane direction from her to the puller
      if (ft < A.YANK) return null;
      return { k: ss((ft - A.YANK) / (A.SLAM - A.YANK) * 1.15), ang: this._proneAng, lift: this.ancLift || 0 };
    }
    if (this.state === 'staggered' && this._proneAt) {
      const el = now() - this._proneAt;
      if (el >= PRONE_HOLD + PRONE_RISE) return null;
      return { k: el < PRONE_HOLD ? 1 : 1 - ss((el - PRONE_HOLD) / PRONE_RISE), ang: this._proneAng ?? 0, lift: 0 };
    }
    return null;
  };

  P.drawIntroPyre = function (ctx, t) {
    const k = c01(t / 2.0), X = this.x, Y = this.y;
    if (window.FlameArt) {
      // she rises out of a bonfire: a bed of tongues with one huge one in the middle
      const FA = window.FlameArt, tt = now(), fade = t < 2.0 ? 1 : Math.max(0, 1 - (t - 2.0) * 2);
      FA.underlight(ctx, X, Y, 220, T(), 'fire', fade);
      FA.patch(ctx, X, Y, 60 + k * 50, T(), tt, 7.7, { h: 50 + k * 30, w: 12, alpha: fade, density: 200 });
      FA.tongue(ctx, X, Y + 4, (150 + k * 90) * fade, 34 + k * 18, tt, 2.2, { alpha: fade, rate: 1.4 });
      return;
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const h = 140 + k * 80, w = 30 + k * 26;
    const g = ctx.createLinearGradient(X, Y, X, Y - h);
    g.addColorStop(0, 'rgba(255,120,30,0.85)'); g.addColorStop(0.5, 'rgba(255,170,60,0.5)'); g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(X - w, Y);
    for (let i = 0; i <= 8; i++) { const yy = Y - h * i / 8; ctx.lineTo(X - w * (1 - i / 9) + Math.sin(now() * 11 + i) * 6, yy); }
    for (let i = 8; i >= 0; i--) { const yy = Y - h * i / 8; ctx.lineTo(X + w * (1 - i / 9) + Math.sin(now() * 9 + i * 1.3) * 6, yy); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  };

  // standing things besides her that sort with the players: decoys, the mirror image, braziers
  P.extraRenderables = function () {
    const out = [];
    const m = this.mech;
    if (m && m.kind === 'curtain' && m.phase !== 'intro') {
      for (const f of m.figs) {
        if (f.i === m.real || f.popped) continue;
        out.push({ y: f.y, draw: (ctx) => this.drawDecoy(ctx, f, m) });
      }
    }
    if (this.mirrorImg) { const M = this.mirrorImg; out.push({ y: M.y, draw: (ctx) => this.drawMirror(ctx, M) }); }
    if (m && m.kind === 'pyre') for (const b of m.brz) out.push({ y: b.y, draw: (ctx) => this.drawBrazier(ctx, b, m) });
    return out;
  };
  // Masquerade: a masked dancer. During the lunge wind-up the fakes glow ORANGE (no counter); only the real one flashes blue.
  P.drawDecoy = function (ctx, f, m) {
    const pose = Object.assign({}, PS.idle);
    const w = Math.sin(now() * 7 + f.i) * 0.25; pose.fy += w; pose.rf += w * 2; pose.fan = f.fan;
    this.drawFigure(ctx, f.x, f.y, f.face || 0, pose, { decoy: true, seed: f.i, mask: f.mask, fanOpen: f.fan, trim: f.trim, alpha: 1, lift: 0, torn: this.fanTorn, noCrown: this.crownGone });
    if (m.phase === 'lunge' && m.t < m.strikeAt) {
      const S = this.modelScale || 1, cy = f.y - 78 * S, k = c01(m.t / m.strikeAt), pulse = 0.6 + Math.sin(now() * 14) * 0.4;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(f.x, cy, 8, f.x, cy, 95 * S);
      g.addColorStop(0, `rgba(251,146,60,${(0.18 + 0.2 * k) * pulse})`); g.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(f.x, cy, 62 * S, 95 * S, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  };
  P.drawMirror = function (ctx, M) {
    const pose = this._pose || PS.idle;
    ctx.save();
    ctx.globalAlpha = 0.8;
    this.drawFigure(ctx, M.x, M.y, M.a, pose, { decoy: true, seed: 7, alpha: 0.75, lift: 0, torn: this.fanTorn, noCrown: this.crownGone });
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(M.x, M.y - 70, 5, M.x, M.y - 70, 90);
    g.addColorStop(0, 'rgba(192,132,252,0.25)'); g.addColorStop(1, 'rgba(192,132,252,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(M.x, M.y - 70, 90, 0, TAU); ctx.fill();
    ctx.restore();
  };
  P.drawBrazier = function (ctx, b, m) {
    const lit = !!(m.bits & (1 << b.i));
    const t = now(), X = b.x, Y = b.y;
    ctx.save();
    // pedestal + bowl
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(X, Y, 26, 26 * T(), 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(X - 12, 0, X + 12, 0); g.addColorStop(0, '#3b2a12'); g.addColorStop(0.5, '#c9962a'); g.addColorStop(1, '#3b2a12');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(X - 8, Y); ctx.lineTo(X - 5, Y - 34); ctx.lineTo(X + 5, Y - 34); ctx.lineTo(X + 8, Y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9a521'; ctx.beginPath(); ctx.ellipse(X, Y - 36, 20, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1a08'; ctx.beginPath(); ctx.ellipse(X, Y - 37, 16, 5, 0, 0, TAU); ctx.fill();
    // its number engraved on the bowl (counted round from the top)
    ctx.fillStyle = '#fff2c4'; ctx.font = '900 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(['I', 'II', 'III', 'IV', 'V'][b.i], X, Y - 14);
    if (lit && window.FlameArt) {
      const FA = window.FlameArt, h = 46 + b.flash * 40;
      FA.underlight(ctx, X, Y - 40, 80, 1, 'fire', 1);
      FA.tongue(ctx, X - 7, Y - 36, h * 0.65, 7, t, b.i * 3 + 1, { shadow: false });
      FA.tongue(ctx, X + 7, Y - 36, h * 0.7, 7, t, b.i * 3 + 2, { shadow: false });
      FA.tongue(ctx, X, Y - 35, h, 11, t, b.i * 3, { shadow: false });
    } else if (lit) {
      ctx.globalCompositeOperation = 'lighter';
      const h = 46 + Math.sin(t * 9 + b.i) * 5 + b.flash * 40;
      const fg = ctx.createLinearGradient(X, Y - 37, X, Y - 37 - h);
      fg.addColorStop(0, 'rgba(255,120,30,0.95)'); fg.addColorStop(0.5, 'rgba(255,190,70,0.7)'); fg.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(X - 15, Y - 37);
      ctx.quadraticCurveTo(X - 18, Y - 37 - h * 0.5, X + Math.sin(t * 7 + b.i) * 4, Y - 37 - h);
      ctx.quadraticCurveTo(X + 18, Y - 37 - h * 0.5, X + 15, Y - 37); ctx.closePath(); ctx.fill();
      const gl = ctx.createRadialGradient(X, Y - 50, 4, X, Y - 50, 70);
      gl.addColorStop(0, 'rgba(255,170,60,0.35)'); gl.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(X, Y - 50, 70, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(160,160,170,0.35)';
      for (let i = 0; i < 3; i++) { const k = ((t * 0.6 + i / 3) % 1); ctx.beginPath(); ctx.arc(X + Math.sin(t + i) * 5, Y - 42 - k * 30, 3 + k * 5, 0, TAU); ctx.fill(); }
    }
    if (b.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,255,255,${b.flash * 1.6})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(X, Y - 36, 26, 10, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  };

  // =========================================================================================================================
  // FLOOR: telegraphs, burning lanes, the stage wall, mechanic floor marks (under every character)
  // =========================================================================================================================
  P.drawFloor = function (ctx) {
    if (this.hp <= 0) return;
    const t = now(), tilt = T();
    // the burning wall around the stage
    if (this.wallR != null) this.drawWall(ctx, this.wallR, t);
    // lingering fire
    for (const h of this.hazards) {
      if (h.t < (h.delay || 0)) continue;
      const fade = Math.min(1, h.t * 4) * Math.min(1, (h.dur - h.t) * 2);
      if (window.FlameArt) {
        const FA = window.FlameArt;
        if (h.k === 'lane') {
          if (h.label === 'Red Carpet') {   // the carpet itself, under its fire
            ctx.save(); ctx.translate(h.x, h.y); ctx.scale(1, tilt); ctx.rotate(h.a);
            ctx.fillStyle = `rgba(150,10,30,${0.5 * fade})`; ctx.fillRect(0, -h.w * 0.75, h.len, h.w * 1.5);
            ctx.strokeStyle = `rgba(242,182,50,${0.7 * fade})`; ctx.lineWidth = 2; ctx.strokeRect(0, -h.w * 0.75, h.len, h.w * 1.5);
            ctx.restore();
          }
          FA.underlight(ctx, h.x + Math.cos(h.a) * h.len / 2, h.y + Math.sin(h.a) * h.len / 2 * tilt, h.len * 0.6, tilt, 'fire', fade);
          FA.lane(ctx, h.x, h.y, h.a, h.len, h.w * 0.7, tilt, t, h.id * 13.7, { h: 44, w: 12, alpha: fade, bed: h.label !== 'Red Carpet' });
        } else {
          FA.underlight(ctx, h.x, h.y, h.r * 1.6, tilt, 'fire', fade);
          FA.patch(ctx, h.x, h.y, h.r, tilt, t, h.id * 13.7, { h: 42, w: 12, alpha: fade });
        }
        continue;
      }
      ctx.save(); ctx.translate(h.x, h.y); ctx.scale(1, tilt);
      ctx.globalCompositeOperation = 'lighter';
      if (h.k === 'lane') {
        ctx.rotate(h.a);
        const g = ctx.createLinearGradient(0, -h.w, 0, h.w);
        g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(0.5, `rgba(255,120,30,${0.42 * fade})`); g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g; ctx.fillRect(0, -h.w, h.len, h.w * 2);
        ctx.fillStyle = `rgba(255,200,90,${0.5 * fade})`;
        for (let x = 8; x < h.len; x += 22) { const fl = Math.sin(t * 12 + x * 0.3); ctx.beginPath(); ctx.ellipse(x, Math.sin(x + t * 3) * h.w * 0.4, 6 + fl * 2, 3, 0, 0, TAU); ctx.fill(); }
        // a red carpet under the fire for the carpet itself
        if (h.label === 'Red Carpet') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(150,10,30,${0.35 * fade})`; ctx.fillRect(0, -h.w * 0.75, h.len, h.w * 1.5); ctx.strokeStyle = `rgba(242,182,50,${0.6 * fade})`; ctx.lineWidth = 2; ctx.strokeRect(0, -h.w * 0.75, h.len, h.w * 1.5); }
      } else {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h.r);
        g.addColorStop(0, `rgba(255,140,40,${0.4 * fade})`); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
        // licking flames in the patch
        ctx.fillStyle = `rgba(255,200,90,${0.5 * fade})`;
        for (let i = 0; i < 7; i++) { const a = i * 2.4 + h.id, d = h.r * (0.2 + 0.6 * ((i * 37) % 10) / 10), fl = Math.sin(t * 11 + i * 1.7); ctx.beginPath(); ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, 5 + fl * 2, 3 + fl, 0, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
    // mechanic floor marks
    const m = this.mech;
    if (m && m.kind === 'curtain' && m.phase !== 'intro') {
      for (const f of m.figs) {
        if (f.popped) continue;
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(1, tilt);
        ctx.strokeStyle = `rgba(253,224,71,${0.35 + 0.2 * Math.sin(t * 3 + f.i)})`; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(0, 0, 74, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        // a floor spotlight on each of them
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 80); g.addColorStop(0, 'rgba(255,240,200,0.18)'); g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 80, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    if (m && m.kind === 'pyre') {
      // the pentagon that links each brazier to its two neighbours, and the step circles
      ctx.save(); ctx.scale(1, 1);
      ctx.strokeStyle = 'rgba(253,224,71,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); m.brz.forEach((b, i) => { if (i) ctx.lineTo(b.x, b.y); else ctx.moveTo(b.x, b.y); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      for (const b of m.brz) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.scale(1, tilt);
        const lit = !!(m.bits & (1 << b.i)), want = !!(m.target & (1 << b.i));
        ctx.fillStyle = lit === want ? 'rgba(74,222,128,0.12)' : 'rgba(251,146,60,0.12)';
        ctx.beginPath(); ctx.arc(0, 0, 54, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,160,0.75)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, 54, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      // the little star of lamps at her feet: the pattern she wants
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * TAU / 5, x = this.x + Math.cos(a) * 58, y = this.y + Math.sin(a) * 58 * tilt;
        const want = !!(m.target & (1 << i));
        ctx.save(); ctx.translate(x, y); ctx.scale(1, tilt);
        ctx.fillStyle = want ? 'rgba(255,190,70,0.95)' : 'rgba(40,30,30,0.9)'; ctx.strokeStyle = '#f2b632'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
    if (m && m.kind === 'finale') {
      for (const b of m.balls) {
        if (b.done) continue;
        const k = c01(b.t / b.dur);
        ctx.save(); ctx.translate(b.x, b.y); ctx.scale(1, tilt);
        const col = b.violet ? '168,85,247' : '250,204,21';
        ctx.fillStyle = `rgba(${col},${0.12 + 0.18 * k})`; ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 70 * k, 0, TAU); ctx.stroke();
        ctx.restore();
        // (no CATCH / AVOID words: the gold vs violet colour is the tell)
      }
    }
    // stage cues, the spotlight gaze and her script marks
    if (this.cue) this.drawCueFloor(ctx, t);
    if (this.state === 'ig_gaze' && this.gaze) this.drawGazeFloor(ctx, t);
    if (this.state === 'ig_script' && this.script) this.drawScriptFloor(ctx, t);
    // Catherine Wheel: the fire pinwheel on the stage floor
    if (this.wheel) this.drawWheel(ctx, t);
    // telegraphs
    for (const te of this.teles) this.drawTele(ctx, te, t);
    // ground rings of explosions
    for (const v of this.vfx) {
      if (v.k !== 'boom') continue;
      const k = v.t / v.life;
      if (window.FlameArt) {
        // an explosion: a scorched bed, a burst of fire filling the blast, and a ring of tongues thrown outward
        const FA = window.FlameArt, pal = v.col === '#a855f7' ? 'violet' : (v.col === '#c084fc' ? 'violet' : (v.col === '#f472b6' ? 'pink' : 'fire'));
        const grow = Math.min(1, k * 4), die = 1 - Math.max(0, (k - 0.35) / 0.65);
        FA.underlight(ctx, v.x, v.y, v.r * 1.5, tilt, pal, die);
        FA.groundBed(ctx, v.x, v.y, v.r * (0.7 + 0.3 * grow), tilt, t, v.x * 0.01, pal, die);
        FA.patch(ctx, v.x, v.y, v.r * 0.8 * grow, tilt, t, v.x * 0.013 + v.y * 0.007, { h: 26 + v.r * 0.35 * die, w: 9 + v.r * 0.03, alpha: die, pal, bed: false, density: 420 });
        FA.ring(ctx, v.x, v.y, v.r * (0.55 + 0.5 * grow), tilt, t, v.y * 0.011, { h: 22 + v.r * 0.25 * die, w: 8, alpha: die, out: 0.9, pal, spacing: 34 });
        continue;
      }
      ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, v.r);
      g.addColorStop(0, `rgba(255,230,160,${0.6 * (1 - k)})`); g.addColorStop(0.6, `rgba(255,120,30,${0.45 * (1 - k)})`); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, v.r * (0.6 + 0.4 * k), 0, TAU); ctx.fill();
      ctx.restore();
    }
  };

  // CATHERINE WHEEL (the user's sketch): curved blades of fire spiralling out of her to a ring of fire, the whole wheel turning.
  // Before it lights, the blade and ring shapes glow on the floor; arrows outside the ring show the spin (hidden at the pause).
  P.drawWheel = function (ctx, t) {
    const W = this.wheel, K = window.IgnisVaneBoss && window.IgnisVaneBoss.WHEEL, BL = window.IgnisVaneBoss && window.IgnisVaneBoss.wheelBlade, FA = window.FlameArt;
    if (!W || !K || !BL || W.shown <= 0.01) return;
    const tilt = T(), pt = this.patT, R = K.R;
    const P = (ang, r) => [Math.cos(ang) * r, Math.sin(ang) * r * tilt];
    ctx.save(); ctx.globalAlpha *= W.shown;
    // one blade's outline on the ground: from the hub out to the ring, widening as it goes
    const bladePath = (k) => {
      const steps = 14, left = [], right = [];
      for (let i = 0; i <= steps; i++) {
        const r = K.hub * 0.6 + (R - K.hub * 0.6) * i / steps, c = BL.angle(W, k, r), da = BL.half(r) / Math.max(1, r);
        left.push(P(c - da, r)); right.push(P(c + da, r));
      }
      ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]);
      for (const q of left) ctx.lineTo(q[0], q[1]);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
      ctx.closePath();
    };
    const lit = W.burning;
    // the ring of fire's ember bed (flat bands), and the blades' beds
    ctx.save(); ctx.scale(1, tilt);
    if (lit) {
      ctx.fillStyle = 'rgba(52,8,12,0.7)'; ctx.beginPath(); ctx.arc(0, 0, R + 70, 0, TAU); ctx.arc(0, 0, R - 6, 0, TAU, true); ctx.fill();
      ctx.fillStyle = 'rgba(200,36,26,0.6)'; ctx.beginPath(); ctx.arc(0, 0, R + 30, 0, TAU); ctx.arc(0, 0, R, 0, TAU, true); ctx.fill();
    } else {
      const k = c01(pt / K.warn), pulse = 0.75 + 0.25 * Math.sin(t * 12);
      ctx.strokeStyle = `rgba(255,150,60,${0.4 + 0.5 * k})`; ctx.lineWidth = 4; ctx.setLineDash([14, 10]);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,110,30,${(0.1 + 0.2 * k) * pulse})`; ctx.beginPath(); ctx.arc(0, 0, R + 60, 0, TAU); ctx.arc(0, 0, R, 0, TAU, true); ctx.fill();
    }
    ctx.restore();
    for (let k = 0; k < W.n; k++) {
      if (lit) {
        ctx.fillStyle = 'rgba(52,8,12,0.7)'; bladePath(k); ctx.fill();
      } else {
        const kk = c01(pt / K.warn), pulse = 0.75 + 0.25 * Math.sin(t * 12 + k);
        ctx.fillStyle = `rgba(255,110,30,${(0.12 + 0.28 * kk) * pulse})`; bladePath(k); ctx.fill();
        ctx.strokeStyle = `rgba(255,190,90,${0.45 + 0.4 * kk})`; ctx.lineWidth = 2; bladePath(k); ctx.stroke();
      }
    }
    if (lit && FA) {
      // the flames: tongues all along each blade, leaning back from the way the wheel turns (the zigzag trailing edge)
      const list = [];
      for (let k = 0; k < W.n; k++) {
        const steps = Math.round((R - K.hub) / 22);
        for (let i = 0; i < steps; i++) {
          const s = (i + 0.5) / steps, r = K.hub + (R - K.hub) * s, c = BL.angle(W, k, r);
          const lat = (FA.hash(k * 13 + i * 3.1) - 0.5) * 1.2 * BL.half(r) / Math.max(1, r);
          const [x, y] = P(c + lat, r), back = c - W.dir * Math.PI / 2;
          list.push({ x, y, h: 44 + 30 * s + 14 * FA.hash(i + k), w: 11 + 5 * s, seed: k * 7.7 + i * 1.3, o: { lean: Math.cos(back) * 0.9, shadow: false } });
        }
      }
      FA.drawSet(ctx, list, t);
      // the hub she stands in, and the ring round the edge
      FA.patch(ctx, 0, 0, K.hub, tilt, t, 4.4, { h: 40, w: 12, bed: false, density: 300 });
      FA.ring(ctx, 0, 0, R + 10, tilt, t, 8.8, { h: 58, w: 15, spacing: 28, shadow: false, out: 0.3 });
    }
    // which way it spins: three arrows just outside the ring. They vanish while it is stopped, so the reversal is something
    // players discover, not something they are told
    for (let i = 0; i < 3 && !W.paused; i++) {
      const base = W.a + i * TAU / 3 + 0.4, r = R + 95, dir = W.dir;
      ctx.save(); ctx.scale(1, tilt);
      ctx.strokeStyle = '#fdba74'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r, Math.min(base, base + dir * 0.35), Math.max(base, base + dir * 0.35)); ctx.stroke();
      const ta = base + dir * 0.35, hx = Math.cos(ta) * r, hy = Math.sin(ta) * r, tg = ta + dir * Math.PI / 2;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(hx + Math.cos(tg) * 22, hy + Math.sin(tg) * 22); ctx.lineTo(hx + Math.cos(ta) * 17, hy + Math.sin(ta) * 17); ctx.lineTo(hx - Math.cos(ta) * 17, hy - Math.sin(ta) * 17); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  // a little heart, point down, centred on (x, y)
  function drawHeart(ctx, x, y, s, col, alpha = 1) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9); ctx.fill();
    ctx.restore();
  }
  const livingParty = () => ((window.game && window.game.party) || []).filter(p => p && p.hp > 0);

  // FREEZE FRAME on the boards. The footlights (drawArena) carry the timer; this is the stage's own change of mood.
  P.drawCueFloor = function (ctx, t) {
    const C = this.cue, R = (window.game && window.game.arenaRadius) || 590, tilt = T(), FA = window.FlameArt;
    const a = Math.min(c01(C.t / 0.25), c01((C.dur - C.t) / 0.3));
    ctx.save(); ctx.scale(1, tilt);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
    if (C.kind === 'hold') {
      // a cold, still picture: blue-white wash, a dark frame closing in from the rim
      ctx.fillStyle = `rgba(170,200,255,${0.13 * a})`; ctx.fillRect(-R, -R, 2 * R, 2 * R);
      const vg = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
      vg.addColorStop(0, 'rgba(8,14,30,0)'); vg.addColorStop(1, `rgba(8,14,30,${0.5 * a})`);
      ctx.fillStyle = vg; ctx.fillRect(-R, -R, 2 * R, 2 * R);
      ctx.strokeStyle = `rgba(225,236,255,${0.55 * a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R - 44, 0, TAU); ctx.stroke();
    } else {
      // a party: the house lights drop to a warm red that throbs on the beat, and coloured concert spotlights sweep the floor
      // (they mean nothing: nowhere is safe, you just have to keep moving)
      const beat = (t * 2) % 1, thump = Math.pow(1 - beat, 3);
      ctx.fillStyle = `rgba(120,20,40,${(0.16 + 0.08 * thump) * a})`; ctx.fillRect(-R, -R, 2 * R, 2 * R);
      ctx.globalCompositeOperation = 'lighter';
      const SP = [['255,80,120', 0.9, 0], ['255,190,60', -0.7, 2.1], ['190,90,255', 1.15, 4.0], ['255,240,200', -1.3, 5.3]];
      SP.forEach(([col, w, ph], i) => {
        const ang = t * w + ph, rr = R * (0.35 + 0.25 * Math.sin(t * 0.8 + i * 1.7));
        const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr, sr = 95;
        // the beam from its rig on the rim down to the pool
        const ra = ang + Math.PI * 0.8, rx = Math.cos(ra) * R, ry = Math.sin(ra) * R;
        const nx = -(y - ry), ny = x - rx, nl = Math.hypot(nx, ny) || 1;
        ctx.fillStyle = `rgba(${col},${0.05 * a})`;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(x + nx / nl * sr * 0.8, y + ny / nl * sr * 0.8); ctx.lineTo(x - nx / nl * sr * 0.8, y - ny / nl * sr * 0.8); ctx.closePath(); ctx.fill();
        const g = ctx.createRadialGradient(x, y, 4, x, y, sr);
        g.addColorStop(0, `rgba(${col},${(0.2 + 0.08 * thump) * a})`); g.addColorStop(0.7, `rgba(${col},${0.1 * a})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, sr, 0, TAU); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    if (C.t < C.warn) return;
    for (const p of livingParty()) {
      if (C.kind === 'dance') {
        // standing still: the boards under you start to smoulder, then catch
        const s = p._igStill || 0;
        if (s < 0.35) continue;
        const k = c01((s - 0.35) / 0.75);
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, tilt);
        ctx.fillStyle = `rgba(255,110,30,${0.12 + 0.3 * k})`; ctx.beginPath(); ctx.arc(0, 0, 18 + 26 * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,200,90,${0.5 + 0.4 * k})`; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        if (s > 1.1 && FA) FA.patch(ctx, p.x, p.y, 34, tilt, t, p.x * 0.01, { h: 30, w: 9, bed: false, density: 220 });
      } else {
        // part of the picture: a pale outline at your feet
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, tilt);
        ctx.strokeStyle = 'rgba(225,236,255,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
  };

  // EYES ON THE STAR: the house goes dark around her
  P.drawGazeFloor = function (ctx, t) {
    const G = this.gaze, R = (window.game && window.game.arenaRadius) || 590, tilt = T(), pt = this.patT;
    const k = c01(pt / 0.35) * c01((3.6 - pt) / 0.3);
    ctx.save(); ctx.scale(1, tilt);
    ctx.fillStyle = `rgba(4,2,8,${(G.flip ? 0.4 : 0.5) * k})`;
    ctx.beginPath(); ctx.arc(0, 0, R + 60, 0, TAU); ctx.arc(this.x, this.y / tilt, 130, 0, TAU, true); ctx.fill();
    if (!G.flip) {
      const g = ctx.createRadialGradient(this.x, this.y / tilt, 10, this.x, this.y / tilt, 135);
      g.addColorStop(0, `rgba(255,240,200,${0.35 * k})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y / tilt, 135, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
  // the light itself: a warm column on her, or (no crown) a cold flicker as the cameras warm up
  P.drawGazeTop = function (ctx, t) {
    const G = this.gaze, pt = this.patT, k = c01(pt / 0.35) * c01((3.6 - pt) / 0.3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const x = this.x, y = this.y;
    if (!G.flip) {
      const flare = pt > G.snap - 0.05 && pt < G.snap + 0.35 ? 1.8 : 1;
      const g = ctx.createLinearGradient(0, y - 640, 0, y);
      g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(1, `rgba(255,240,200,${0.22 * k * flare})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 30, y - 640); ctx.lineTo(x + 30, y - 640); ctx.lineTo(x + 120, y); ctx.lineTo(x - 120, y); ctx.closePath(); ctx.fill();
    } else if (Math.sin(t * 37) > 0.6) {
      ctx.fillStyle = `rgba(230,240,255,${0.05 * k})`; ctx.fillRect(x - 700, y - 700, 1400, 1400);
    }
    ctx.restore();
  };

  // READ THE SCRIPT: the marks that flash up just before a chorus (stack) or solos (spread) land
  P.drawScriptFloor = function (ctx, t) {
    const S = this.script, M = S.mark, tilt = T();
    if (!M) return;
    const k = c01(1 - (M.until - this.patT) / 1.0);
    const ring = (x, y, r, col, inward) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(1, tilt);
      ctx.fillStyle = `rgba(${col},${0.1 + 0.15 * k})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      // chevrons: pointing in for a chorus, out for a solo
      ctx.fillStyle = `rgba(${col},0.95)`;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + t * 0.8, d = r + 14 + (inward ? -6 : 6) * Math.sin(t * 8), dir = inward ? -1 : 1;
        const cx = Math.cos(a) * d, cy = Math.sin(a) * d;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 9 * dir, cy + Math.sin(a) * 9 * dir);
        ctx.lineTo(cx - Math.cos(a) * 5 * dir - Math.sin(a) * 8, cy - Math.sin(a) * 5 * dir + Math.cos(a) * 8);
        ctx.lineTo(cx - Math.cos(a) * 5 * dir + Math.sin(a) * 8, cy - Math.sin(a) * 5 * dir - Math.cos(a) * 8); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    };
    if (M.kind === 'stack') {
      if (S.spot) ring(S.spot.x, S.spot.y, 80, '253,224,71', true);
      else { const p = livingParty().find(q => q.id === S.stackId); if (p) ring(p.x, p.y, 95, '253,224,71', true); }
    } else if (M.kind === 'spread') {
      for (const p of livingParty()) ring(p.x, p.y, 100, '244,114,182', false);
    }
  };
  // the page she reads from; on Hard, an ad-lib: the page is burning
  P.drawScriptPage = function (ctx, t) {
    const S = this.script, pt = this.patT;
    if (pt < 0.35 || pt > 6.8) return;
    const h = this.handWorld(), x = h.x, y = h.y - (h.z || 100) - 6;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.18 + Math.sin(t * 2) * 0.04);
    ctx.fillStyle = '#f5e6c4'; ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-11, -15); ctx.lineTo(11, -15); ctx.lineTo(11, 13); ctx.quadraticCurveTo(0, 17, -11, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,50,30,0.6)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-7, -10 + i * 5); ctx.lineTo(7 - (i % 2) * 4, -10 + i * 5); ctx.stroke(); }
    if (S.lie) {
      // the edge curling and burning
      ctx.fillStyle = 'rgba(40,20,10,0.9)'; ctx.beginPath(); ctx.moveTo(4, -15); ctx.lineTo(11, -15); ctx.lineTo(11, -4); ctx.quadraticCurveTo(7, -9, 4, -15); ctx.fill();
    }
    ctx.restore();
    if (S.lie && window.FlameArt) window.FlameArt.ball(ctx, x + 9, y - 12, 6, t, 3.3, { pal: 'fire', dir: -Math.PI / 2 });
  };

  // STARSTRUCK: hearts over anyone she has kissed, and a ribbon of hearts drawing a Starstruck player to her
  P.drawCharmTop = function (ctx, t, tilt) {
    for (const p of livingParty()) {
      const n = p.igHearts | 0, top = p.y - 108 - (p.jumpZ || 0);
      if (p.ignisCharm > 0) {
        // hearts circling their head
        for (let i = 0; i < 3; i++) { const a = t * 3 + i * TAU / 3; drawHeart(ctx, p.x + Math.cos(a) * 24, top + 6 + Math.sin(a) * 8, 8, i ? '#ff4f9a' : '#ffd1e6', 0.95); }
        // a ribbon of hearts between them and her
        const dx = this.x - p.x, dy = (this.y - 70) - (p.y - 50), d = Math.hypot(dx, dy) || 1, steps = Math.min(10, Math.floor(d / 40));
        for (let i = 1; i < steps; i++) {
          const k = ((i / steps) + t * 0.6) % 1;
          drawHeart(ctx, p.x + dx * k, p.y - 50 + dy * k + Math.sin(k * 12 + t * 4) * 6, 7, '#ff5aa5', 0.6 + 0.4 * Math.sin(k * Math.PI));
        }
      } else if (n > 0) {
        for (let i = 0; i < n; i++) drawHeart(ctx, p.x + (i - (n - 1) / 2) * 16, top + Math.sin(t * 5 + i) * 2, 7, '#ff4f9a', 0.95);
      }
    }
  };

  P.drawTele = function (ctx, te, t) {
    const k = c01(1 - te.life / te.max);
    const fade = te.life < 0 ? Math.max(0, 1 + te.life / 0.18) : 1;
    const tilt = T();
    ctx.save(); ctx.translate(te.x, te.y); ctx.scale(1, tilt);
    ctx.globalAlpha = fade;
    const edge = 'rgba(255,170,60,0.95)', fill = `rgba(255,110,30,${0.12 + 0.1 * k})`, core = `rgba(255,140,40,${0.22 + 0.25 * k})`;
    if (te.k === 'circle' || te.k === 'spot') {
      if (te.k === 'spot') {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, te.r);
        g.addColorStop(0, `rgba(255,248,220,${0.3 + 0.2 * k})`); g.addColorStop(1, 'rgba(255,220,140,0.05)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, te.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,236,170,0.95)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, te.r, 0, TAU); ctx.stroke();
      } else {
        ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(0, 0, te.r, 0, TAU); ctx.fill();
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, te.r * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, te.r, 0, TAU); ctx.stroke();
      }
    } else if (te.k === 'sector') {
      const a0 = te.a - te.half, a1 = te.a + te.half;
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(0, 0, te.r1, a0, a1); ctx.arc(0, 0, te.r0, a1, a0, true); ctx.closePath(); ctx.fill();
      const rr = te.r0 + (te.r1 - te.r0) * k;
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, rr, a0, a1); ctx.arc(0, 0, te.r0, a1, a0, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, te.r1, a0, a1); ctx.arc(0, 0, te.r0, a1, a0, true); ctx.closePath(); ctx.stroke();
      if (te.spinDir) {   // which way the petals will wheel
        ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.lineWidth = 3;
        const ar = te.a + te.spinDir * (te.half + 0.25), r = (te.r0 + te.r1) / 2;
        ctx.beginPath(); ctx.arc(0, 0, r, te.a + te.spinDir * te.half, ar, te.spinDir < 0); ctx.stroke();
        const hx = Math.cos(ar) * r, hy = Math.sin(ar) * r, ta = ar + te.spinDir * Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(hx + Math.cos(ta) * 10, hy + Math.sin(ta) * 10); ctx.lineTo(hx + Math.cos(ta + 2.5) * 9, hy + Math.sin(ta + 2.5) * 9); ctx.lineTo(hx + Math.cos(ta - 2.5) * 9, hy + Math.sin(ta - 2.5) * 9); ctx.closePath(); ctx.fillStyle = 'rgba(255,240,200,0.9)'; ctx.fill();
      }
    } else if (te.k === 'corridor') {
      ctx.rotate(te.a);
      const x0 = te.noBack ? 0 : -18;
      ctx.fillStyle = fill; ctx.fillRect(x0, -te.w, te.len - x0, te.w * 2);
      ctx.fillStyle = core; ctx.fillRect(x0, -te.w, (te.len - x0) * k, te.w * 2);
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.strokeRect(x0, -te.w, te.len - x0, te.w * 2);
    } else if (te.k === 'wallgap') {
      // the wall line, its single gap, and arrows for the way it sweeps
      ctx.rotate(te.a);
      const span = 700, d = te.d;
      ctx.fillStyle = `rgba(255,110,30,${0.25 + 0.3 * k})`;
      ctx.fillRect(d - 10, -span, 20, span + te.gap - te.gw / 2);
      ctx.fillRect(d - 10, te.gap + te.gw / 2, 20, span - te.gap - te.gw / 2);
      ctx.strokeStyle = 'rgba(134,239,172,0.95)'; ctx.lineWidth = 3;
      ctx.strokeRect(d - 16, te.gap - te.gw / 2, 32, te.gw);
      ctx.fillStyle = 'rgba(134,239,172,0.2)'; ctx.fillRect(-300, te.gap - te.gw / 2, d + 300, te.gw);
      ctx.strokeStyle = 'rgba(255,200,120,0.8)'; ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) { const y = i * 150 + (i === 0 ? 60 : 0); ctx.beginPath(); ctx.moveTo(d - 30, y - 14); ctx.lineTo(d - 60, y); ctx.lineTo(d - 30, y + 14); ctx.stroke(); }
    }
    ctx.restore();
  };

  // the ring of fire that closes on the stage after Lights, Please
  P.drawWall = function (ctx, R, t) {
    const tilt = T(), out = R + 260;
    ctx.save(); ctx.scale(1, tilt);
    if (window.FlameArt) {
      // flat bands: a maroon scorch beyond the line, a crimson ember bed along it, an orange lip right at the edge
      ctx.fillStyle = 'rgba(52,8,12,0.72)'; ctx.beginPath(); ctx.arc(0, 0, out, 0, TAU); ctx.arc(0, 0, R, 0, TAU, true); ctx.fill();
      ctx.fillStyle = 'rgba(200,36,26,0.6)'; ctx.beginPath(); ctx.arc(0, 0, R + 34, 0, TAU); ctx.arc(0, 0, R, 0, TAU, true); ctx.fill();
      ctx.fillStyle = 'rgba(255,110,24,0.75)'; ctx.beginPath(); ctx.arc(0, 0, R + 9, 0, TAU); ctx.arc(0, 0, R, 0, TAU, true); ctx.fill();
    } else {
      const g = ctx.createRadialGradient(0, 0, R - 20, 0, 0, R + 110);
      g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(0.15, 'rgba(255,110,30,0.55)'); g.addColorStop(0.5, 'rgba(160,30,10,0.55)'); g.addColorStop(1, 'rgba(60,8,4,0.6)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, out, 0, TAU); ctx.arc(0, 0, R, 0, TAU, true); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,200,90,${0.75 + 0.2 * Math.sin(t * 7)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    // flame tongues along the inner edge (upright)
    if (window.FlameArt) { window.FlameArt.ring(ctx, 0, 0, R + 6, tilt, t, 3.3, { h: 58, w: 15, spacing: 24, out: 0.25, shadow: false }); return; }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const n = Math.round(R / 9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 0.05, x = Math.cos(a) * R, y = Math.sin(a) * R * tilt;
      const h = 18 + 14 * (0.5 + 0.5 * Math.sin(t * 9 + i * 1.7));
      ctx.fillStyle = `rgba(255,${120 + (i % 3) * 30},40,0.55)`;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.quadraticCurveTo(x - 5, y - h * 0.6, x + Math.sin(t * 5 + i) * 3, y - h); ctx.quadraticCurveTo(x + 5, y - h * 0.6, x + 6, y); ctx.fill();
    }
    ctx.restore();
  };

  // =========================================================================================================================
  // TOP LAYER: everything in the air, over the characters
  // =========================================================================================================================
  P.drawTop = function (ctx) {
    if (this.hp <= 0) return;
    const t = now(), tilt = T();
    ctx.save();
    for (const pr of this.proj) {
      if (pr.done && pr.k === 'kiss') continue;
      if (pr.k === 'lob') {
        if (pr.done) continue;
        const k = c01(pr.t / pr.dur);
        let x, gy, z;
        if (pr.fromSky) { x = pr.x1 + (1 - k) * 40; gy = pr.y1; z = (1 - k) * 520; }
        else { x = lerp(pr.x0, pr.x1, k); gy = lerp(pr.y0, pr.y1, k); z = lerp(pr.z0 || 90, 0, k) + 160 * 4 * k * (1 - k); }
        this.drawFireball(ctx, x, gy - z, 9 + (pr.r > 80 ? 3 : 0), t, pr.col);
      } else if (pr.k === 'spark') {
        if (pr.done) continue;
        if (window.FlameArt) window.FlameArt.ball(ctx, pr.x, pr.y - 34, 9, t, pr.a * 3, { pal: 'gold', dir: Math.atan2(Math.sin(pr.a) * tilt, Math.cos(pr.a)) });
        else this.drawFireball(ctx, pr.x, pr.y - 34, 9, t, '#fde047');
      } else if (pr.k === 'kiss') {
        this.drawKiss(ctx, pr.x, pr.y - 46, t);
      }
    }
    const FA = window.FlameArt;
    for (const v of this.vfx) {
      const k = c01(v.t / v.life);
      if (FA && this.drawFlameVfx(ctx, v, k, t, tilt)) continue;
      if (v.k === 'arc') {
        ctx.save(); ctx.translate(v.x, v.y - 60); ctx.scale(1, tilt); ctx.globalCompositeOperation = 'lighter';
        const a = lerp(v.a0, v.a1, Math.min(1, k * 1.6));
        ctx.strokeStyle = v.col === '#c084fc' ? `rgba(216,180,254,${1 - k})` : `rgba(255,190,90,${1 - k})`; ctx.lineWidth = 16 * (1 - k) + 2;
        ctx.beginPath(); ctx.arc(0, 0, v.r * 0.85, Math.min(v.a0, a), Math.max(v.a0, a)); ctx.stroke();
        ctx.strokeStyle = `rgba(255,250,230,${1 - k})`; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
      } else if (v.k === 'lick' || v.k === 'crack' || v.k === 'trail') {
        ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt); ctx.rotate(v.a); ctx.globalCompositeOperation = 'lighter';
        const len = v.len * Math.min(1, k * 3), w = v.k === 'crack' ? 10 : (v.k === 'trail' ? 26 : 30);
        const g = ctx.createLinearGradient(0, -w, 0, w);
        g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(0.5, `rgba(255,200,90,${0.9 * (1 - k)})`); g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g; ctx.fillRect(0, -w, len, w * 2);
        ctx.restore();
      } else if (v.k === 'whip') {
        ctx.save(); ctx.translate(v.x, v.y - 50); ctx.scale(1, tilt); ctx.globalCompositeOperation = 'lighter';
        const a = lerp(v.a0, v.a1, Math.min(1, k * 1.8));
        ctx.strokeStyle = `rgba(255,150,50,${1 - k})`; ctx.lineWidth = 7;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) { const r = v.r * i / 12, aa = a + (v.a0 - a) * (1 - i / 12) * 0.35 + Math.sin(i + t * 20) * 0.03; const px = Math.cos(aa) * r, py = Math.sin(aa) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke(); ctx.restore();
      } else if (v.k === 'jet') {
        ctx.save(); ctx.translate(v.x, v.y - 40); ctx.scale(1, tilt); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 10, 0, 0, v.r);
        g.addColorStop(0, `rgba(255,240,180,${0.8 * (1 - k)})`); g.addColorStop(0.6, `rgba(255,120,30,${0.55 * (1 - k)})`); g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, v.r * (0.4 + 0.6 * Math.min(1, k * 3)), v.a - v.half, v.a + v.half); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (v.k === 'pillar') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const h = 520 * (1 - Math.max(0, k - 0.3)), w = v.r * (1 - k * 0.6);
        const g = ctx.createLinearGradient(v.x - w, 0, v.x + w, 0);
        g.addColorStop(0, 'rgba(255,120,30,0)'); g.addColorStop(0.5, `rgba(255,240,190,${0.9 * (1 - k)})`); g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g; ctx.fillRect(v.x - w, v.y - h, w * 2, h);
        ctx.restore();
      } else if (v.k === 'rocket') {
        const kk = c01(v.t / v.life);
        const x = lerp(v.fromX, v.x, kk), y = lerp(v.fromY, v.y, kk) - (Math.sin(kk * Math.PI) * 280 + 60 * (1 - kk));
        this.drawFireball(ctx, x, y, 5, t, '#fde047');
      } else if (v.k === 'cross') {
        ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt); ctx.rotate(v.rot); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,220,120,${0.85 * (1 - k)})`;
        ctx.fillRect(-170, -36, 340, 72); ctx.fillRect(-36, -170, 72, 340);
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) { const a = i * TAU / 10, r = 30 + 90 * k; ctx.fillStyle = `rgba(255,${200 - i * 8},90,${1 - k})`; ctx.beginPath(); ctx.arc(v.x + Math.cos(a) * r, v.y - 140 + Math.sin(a) * r, 3, 0, TAU); ctx.fill(); }
        ctx.restore();
      } else if (v.k === 'embers') {
        // a spray of sparks thrown up and out, falling back under gravity
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const n = 18, s = v.seed || 0, spread = Math.max(50, v.r);
        for (let i = 0; i < n; i++) {
          const a = i * TAU / n + Math.sin(s + i * 3.1) * 0.4, sp = 0.45 + 0.55 * Math.abs(Math.sin(s * 1.7 + i * 2.3));
          const d = spread * sp * Math.min(1, k * 1.6), up = 220 * sp * k - 260 * k * k;
          const px = v.x + Math.cos(a) * d, py = v.y + Math.sin(a) * d * tilt - Math.max(0, up) - 10;
          const sz = 2.6 * (1 - k) + 0.8;
          ctx.fillStyle = i % 3 === 0 ? `rgba(255,250,210,${1 - k})` : (v.col === '#c084fc' ? `rgba(216,180,254,${1 - k})` : (v.col === '#f472b6' ? `rgba(249,168,212,${1 - k})` : `rgba(255,${150 + (i * 13) % 90},60,${1 - k})`));
          ctx.beginPath(); ctx.arc(px, py, sz, 0, TAU); ctx.fill();
        }
        ctx.restore();
      } else if (v.k === 'ring') {
        // a heat ring racing out across the floor
        ctx.save(); ctx.translate(v.x, v.y); ctx.scale(1, tilt); ctx.globalCompositeOperation = 'lighter';
        const rr = v.r * (0.35 + 0.75 * Math.sqrt(k));
        ctx.strokeStyle = v.col === '#fde047' ? `rgba(253,230,138,${0.9 * (1 - k)})` : `rgba(255,150,60,${0.9 * (1 - k)})`; ctx.lineWidth = 14 * (1 - k) + 2;
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(255,250,230,${0.8 * (1 - k)})`; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      } else if (v.k === 'puff') {
        ctx.save(); ctx.fillStyle = `rgba(200,190,190,${0.5 * (1 - k)})`;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(v.x + Math.cos(i) * 20 * (1 + k), v.y - 60 - k * 40 + Math.sin(i * 2) * 20, 14 + k * 16, 0, TAU); ctx.fill(); }
        ctx.restore();
      } else if (v.k === 'return' && this.mech && this.mech.kind === 'finale') {
        const sx = this.x, sy = this.y - (this.jumpZ || 0) - 260;
        const p = { x: lerp(v.x, sx, k), y: lerp(v.y - 20, sy, k) - Math.sin(k * Math.PI) * 60 };
        this.drawFireball(ctx, p.x, p.y, 8, t, '#fde047');
      } else if (v.k === 'fizzle') {
        ctx.save(); ctx.fillStyle = `rgba(216,180,254,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(v.x, v.y - 20 - k * 30, 10 + k * 12, 0, TAU); ctx.fill(); ctx.restore();
      } else if (v.k === 'sunpop') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const sy = v.y - 300;
        for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r = 40 + 380 * k; ctx.strokeStyle = `rgba(255,220,120,${1 - k})`; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.moveTo(v.x + Math.cos(a) * r * 0.3, sy + Math.sin(a) * r * 0.3); ctx.lineTo(v.x + Math.cos(a) * r, sy + Math.sin(a) * r); ctx.stroke(); }
        ctx.restore();
      } else if (v.k === 'hearts') {
        // little hearts thrown up and drifting away
        const s = v.seed || 0;
        for (let i = 0; i < 9; i++) {
          const a = i * TAU / 9 + Math.sin(s + i) * 0.5, sp = 0.5 + 0.5 * Math.abs(Math.sin(s * 1.3 + i * 2.1));
          const d = v.r * sp * Math.min(1, k * 1.5), px = v.x + Math.cos(a) * d, py = v.y + Math.sin(a) * d * tilt - 30 - 90 * k * sp;
          drawHeart(ctx, px, py, 5 + 5 * sp * (1 - k * 0.5), v.gold ? (i % 3 ? '#fbbf24' : '#fef3c7') : (i % 3 ? '#ff4f9a' : '#ffd1e6'), 1 - k);
        }
      } else if (v.k === 'flashbulb') {
        // a camera flash: a white star burst
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const r = v.r * (0.6 + 0.6 * k), y = v.y - 40;
        const g = ctx.createRadialGradient(v.x, y, 0, v.x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${1 - k})`); g.addColorStop(0.3, `rgba(225,240,255,${0.7 * (1 - k)})`); g.addColorStop(1, 'rgba(200,220,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(v.x, y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + 0.39; ctx.beginPath(); ctx.moveTo(v.x - Math.cos(a) * r * 1.3, y - Math.sin(a) * r * 1.3); ctx.lineTo(v.x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); ctx.stroke(); }
        ctx.restore();
      }
    }
    this.drawCharmTop(ctx, t, tilt);
    if (this.state === 'ig_gaze' && this.gaze) this.drawGazeTop(ctx, t);
    if (this.state === 'ig_script' && this.script) this.drawScriptPage(ctx, t);
    // Footlight Flash: the beam (free shot / clash / breaking) and the Grave Anchor chain
    this.drawFlashTop(ctx);
    // (old) jet of fire down a lane
    if (this.flameJetT > 0) {
      const k = 1 - this.flameJetT / 0.6, a = this.flameJetA ?? this.facingAngle;
      ctx.save(); ctx.translate(this.x, this.y - 58); ctx.scale(1, tilt); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter';
      const len = 520 * Math.min(1, k * 4), w = 66 * (1 - k * 0.5);
      const g = ctx.createLinearGradient(0, -w, 0, w);
      g.addColorStop(0, 'rgba(255,80,20,0)'); g.addColorStop(0.3, `rgba(255,150,40,${0.75 * (1 - k)})`); g.addColorStop(0.5, `rgba(255,250,220,${0.95 * (1 - k)})`); g.addColorStop(0.7, `rgba(255,150,40,${0.75 * (1 - k)})`); g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g; ctx.fillRect(10, -w, len, w * 2);
      ctx.restore();
    }
    // Pirouette: the burning petals while they wheel
    if (this.petalRot != null && FA) {
      // each petal is a sweep of tongues leaning with the spin
      const pn = this.petalN || 3, list = [], dir = (this.petals && this.petals.dir) || 1;
      for (let k = 0; k < pn; k++) {
        const a = this.petalRot + k * TAU / pn;
        FA.lane(ctx, this.x + Math.cos(a) * 58, this.y + Math.sin(a) * 58 * tilt, a, 242, 34, tilt, t, k * 5.1, { h: 0.001, w: 0.001, spacing: 999 });   // just the ember bed
        for (let i = 0; i < 14; i++) {
          const d = 70 + 225 * (i + 0.5) / 14, off = (FA.hash(k * 31 + i) - 0.5) * 0.5, an = a + off;
          list.push({ x: this.x + Math.cos(an) * d, y: this.y + Math.sin(an) * d * tilt, h: 44 + 20 * FA.hash(k + i * 3), w: 10, seed: k * 17 + i, o: { lean: -Math.sin(an) * dir * 1.1 } });
        }
      }
      FA.drawSet(ctx, list, t);
    } else if (this.petalRot != null) {
      ctx.save(); ctx.translate(this.x, this.y); ctx.scale(1, tilt); ctx.globalCompositeOperation = 'lighter';
      const pn = this.petalN || 3;
      for (let k = 0; k < pn; k++) {
        const a = this.petalRot + k * TAU / pn;
        const g = ctx.createRadialGradient(0, 0, 58, 0, 0, 300);
        g.addColorStop(0, 'rgba(255,230,150,0.75)'); g.addColorStop(1, 'rgba(255,90,20,0.15)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 300, a - 0.34, a + 0.34); ctx.arc(0, 0, 58, a + 0.34, a - 0.34, true); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // Stage Split: the travelling wall of fire
    for (const S of [this.split, this.split2]) {
      if (!S || S.cur == null) continue;
      if (FA) {
        // a wall of tall tongues marching across the stage, broken by its one gap
        const list = [], ca = Math.cos(S.a), sa = Math.sin(S.a);
        for (let l = -690; l <= 690; l += 22) {
          if (Math.abs(l - S.gap) < S.gw / 2 + 6) continue;
          const j = (FA.hash(l * 0.37) - 0.5) * 16, fx = S.x + ca * (S.cur + j) - sa * l, fy = S.y + (sa * (S.cur + j) + ca * l) * tilt;
          list.push({ x: fx, y: fy, h: 66 + 30 * FA.hash(l), w: 13, seed: l * 0.13, o: { lean: ca * -0.5 } });
        }
        FA.lane(ctx, S.x + ca * S.cur + sa * 690, S.y + (sa * S.cur - ca * 690) * tilt, S.a + Math.PI / 2, 690 + S.gap - S.gw / 2, 18, tilt, t, 1, { h: 0.001, w: 0.001, spacing: 999 });
        FA.lane(ctx, S.x + ca * S.cur - sa * (S.gap + S.gw / 2), S.y + (sa * S.cur + ca * (S.gap + S.gw / 2)) * tilt, S.a + Math.PI / 2, 690 - S.gap - S.gw / 2, 18, tilt, t, 2, { h: 0.001, w: 0.001, spacing: 999 });
        FA.drawSet(ctx, list, t);
        continue;
      }
      const tilt2 = tilt;
      ctx.save(); ctx.translate(S.x, S.y); ctx.scale(1, tilt2); ctx.rotate(S.a); ctx.globalCompositeOperation = 'lighter';
      const span = 700;
      for (const [y0, y1] of [[-span, S.gap - S.gw / 2], [S.gap + S.gw / 2, span]]) {
        const g = ctx.createLinearGradient(S.cur - 26, 0, S.cur + 26, 0);
        g.addColorStop(0, 'rgba(255,80,20,0)'); g.addColorStop(0.5, 'rgba(255,200,100,0.85)'); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; ctx.fillRect(S.cur - 26, y0, 52, y1 - y0);
      }
      ctx.restore();
      // upright flames along it
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let l = -680; l <= 680; l += 34) {
        if (Math.abs(l - S.gap) < S.gw / 2) continue;
        const fx = S.x + Math.cos(S.a) * S.cur - Math.sin(S.a) * l, fy = S.y + (Math.sin(S.a) * S.cur + Math.cos(S.a) * l) * tilt;
        const h = 40 + 16 * Math.sin(t * 11 + l);
        ctx.fillStyle = 'rgba(255,150,50,0.55)';
        ctx.beginPath(); ctx.moveTo(fx - 12, fy); ctx.quadraticCurveTo(fx - 10, fy - h * 0.6, fx + Math.sin(t * 7 + l) * 4, fy - h); ctx.quadraticCurveTo(fx + 10, fy - h * 0.6, fx + 12, fy); ctx.fill();
      }
      ctx.restore();
    }
    // Finale: the sun overhead and the fireballs dropping from it
    const m = this.mech;
    if (m && m.kind === 'finale') {
      const sx = this.x, sy = this.y - (this.jumpZ || 0) - 260;
      const R = 40 + 90 * c01(m.sun) * (m.phase === 'intro' ? c01(m.t / m.introDur) : 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy, R * 0.2, sx, sy, R * 2.2);
      g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.35, 'rgba(255,190,70,0.9)'); g.addColorStop(0.7, 'rgba(255,90,20,0.35)'); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R * 2.2, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // cracks: one per returned fireball
      ctx.strokeStyle = 'rgba(70,20,10,0.85)'; ctx.lineWidth = 2.5;
      for (let i = 0; i < m.cracks; i++) {
        const a = i * 2.39996 + 0.5; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * R * 0.15, sy + Math.sin(a) * R * 0.15);
        ctx.lineTo(sx + Math.cos(a + 0.25) * R * 0.55, sy + Math.sin(a + 0.25) * R * 0.55); ctx.lineTo(sx + Math.cos(a - 0.1) * R * 0.95, sy + Math.sin(a - 0.1) * R * 0.95); ctx.stroke();
      }
      ctx.restore();
      for (const b of m.balls) {
        if (b.done) continue;
        const k = c01(b.t / b.dur);
        const x = lerp(sx, b.x, k), y = lerp(sy, b.y, k) - Math.sin(k * Math.PI) * 80;
        this.drawFireball(ctx, x, y, 12, t, b.violet ? '#a855f7' : '#fde047');
      }
    }
    ctx.restore();
  };

  // the anime-style versions of her air effects (flame_art.js). Returns true when it drew v.
  P.drawFlameVfx = function (ctx, v, k, t, tilt) {
    const FA = window.FlameArt, die = 1 - k, sd = (v.x || 0) * 0.017 + (v.y || 0) * 0.011 + (v.seed || 0);
    const palOf = (c) => (c === '#c084fc' || c === '#a855f7') ? 'violet' : (c === '#f472b6' ? 'pink' : (c === '#fde047' || c === '#fdba74' ? 'gold' : 'fire'));
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    switch (v.k) {
      case 'arc': {
        // a crescent swipe in flat bands with flames peeling off its outer edge
        const x = v.x ?? this.x, y = v.y ?? this.y;
        const a = lerp(v.a0, v.a1, Math.min(1, k * 1.6)), lo = Math.min(v.a0, a), hi = Math.max(v.a0, a);
        const pal = FA.PAL[palOf(v.col)];
        ctx.translate(x, y - 60); ctx.scale(1, tilt);
        for (const [wd, col, al] of [[20, pal.shadow, 0.55], [15, pal.outer, 0.95], [9, pal.mid, 1], [4, pal.core, 1]]) {
          ctx.globalAlpha = al * die; ctx.strokeStyle = col; ctx.lineWidth = wd * (0.4 + 0.6 * die); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(0, 0, v.r * 0.85, lo, hi); ctx.stroke();
        }
        ctx.restore(); ctx.save();   // back to screen space for the peeling flames
        for (let i = 0; i < 7; i++) {
          const an = lo + (hi - lo) * (i + 0.5) / 7, px = x + Math.cos(an) * v.r * 0.88, py = y - 60 + Math.sin(an) * v.r * 0.88 * tilt;
          FA.tongue(ctx, px, py, 20 * die, 5, t, sd + i, { pal: palOf(v.col), shadow: false, lean: Math.cos(an) * 0.8, rate: 2 });
        }
        break;
      }
      case 'lick': case 'trail': case 'crack': {
        const grow = Math.min(1, k * 3);
        const o = v.k === 'crack' ? { h: 26, w: 5, spacing: 15 } : (v.k === 'trail' ? { h: 30, w: 8 } : { h: 54, w: 11, spacing: 17 });
        FA.underlight(ctx, v.x + Math.cos(v.a) * v.len / 2, v.y + Math.sin(v.a) * v.len / 2 * tilt, v.len * 0.55, tilt, 'fire', die);
        FA.lane(ctx, v.x, v.y, v.a, v.len, v.k === 'crack' ? 12 : 24, tilt, t, sd, Object.assign(o, { alpha: die, to: grow, lean: Math.cos(v.a) * 0.6, bed: v.k !== 'crack' }));
        break;
      }
      case 'whip': {
        const x = v.x ?? this.x, y = v.y ?? this.y, a = lerp(v.a0, v.a1, Math.min(1, k * 1.8)), pal = FA.PAL.fire;
        ctx.translate(x, y - 50); ctx.scale(1, tilt);
        const path = () => { ctx.beginPath(); for (let i = 0; i <= 12; i++) { const r = v.r * i / 12, aa = a + (v.a0 - a) * (1 - i / 12) * 0.35 + Math.sin(i + t * 20) * 0.03; const px = Math.cos(aa) * r, py = Math.sin(aa) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } };
        for (const [wd, col] of [[11, pal.outer], [6, pal.mid], [2.5, pal.core]]) { ctx.globalAlpha = die; ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round'; path(); ctx.stroke(); }
        break;
      }
      case 'jet': {
        // a fan of fire thrown out behind her
        const x = v.x ?? this.x, y = v.y ?? this.y, list = [], reach = v.r * (0.4 + 0.6 * Math.min(1, k * 3));
        for (let i = 0; i < 26; i++) {
          const an = v.a + (FA.hash(sd + i) - 0.5) * 2 * v.half, d = reach * Math.sqrt((i + 0.5) / 26);
          list.push({ x: x + Math.cos(an) * d, y: y + Math.sin(an) * d * tilt, h: (60 - d * 0.12) * die, w: 12, seed: sd + i, o: { lean: Math.cos(an) * 0.9, alpha: die } });
        }
        FA.drawSet(ctx, list, t);
        break;
      }
      case 'pillar': {
        // a column of fire: a tall twisting tongue with smaller ones climbing it
        // a thick column: three big tongues twisting round each other, smaller ones climbing up the sides
        const H = 380 * (0.35 + 0.65 * Math.min(1, k * 5)) * (1 - Math.max(0, k - 0.45)), W = v.r * 0.8 * (1 - k * 0.4);
        FA.underlight(ctx, v.x, v.y, v.r * 2.2, tilt, 'fire', die);
        FA.patch(ctx, v.x, v.y, v.r, tilt, t, sd, { h: 46, w: 13, alpha: die, density: 260 });
        for (let i = 0; i < 3; i++) {
          const sx = Math.sin(t * 2.2 + i * 2.1) * W * 0.4;
          FA.tongue(ctx, v.x + sx, v.y + 2, H * (0.78 + 0.22 * FA.hash(sd + i)), W * (0.75 - i * 0.1), t, sd + i * 5, { alpha: die, rate: 1.5, lean: -sx / W * 0.5 });
        }
        for (let i = 0; i < 6; i++) {
          const side = i % 2 ? 1 : -1;
          FA.tongue(ctx, v.x + side * W * (0.55 + 0.2 * FA.hash(sd + i)), v.y - H * (0.1 + 0.11 * i), H * 0.28, W * 0.4, t, sd + i * 3 + 1, { alpha: die, shadow: false, lean: side * 0.7 });
        }
        break;
      }
      case 'rocket': {
        const x = lerp(v.fromX, v.x, k), y = lerp(v.fromY, v.y, k) - (Math.sin(k * Math.PI) * 280 + 60 * (1 - k));
        const nx = lerp(v.fromX, v.x, Math.min(1, k + 0.02)), ny = lerp(v.fromY, v.y, Math.min(1, k + 0.02)) - (Math.sin(Math.min(1, k + 0.02) * Math.PI) * 280 + 60 * (1 - Math.min(1, k + 0.02)));
        FA.ball(ctx, x, y, 5, t, sd, { pal: 'gold', dir: Math.atan2(ny - y, nx - x) });
        break;
      }
      case 'cross': {
        for (const q of [v.rot, v.rot + Math.PI / 2]) {
          const sx = v.x - Math.cos(q) * 170, sy = v.y - Math.sin(q) * 170 * tilt;
          FA.lane(ctx, sx, sy, q, 340, 26, tilt, t, sd + q, { h: 40 * (0.4 + 0.6 * die), w: 9, alpha: die, pal: 'gold', spacing: 20 });
        }
        for (let i = 0; i < 10; i++) { const a = i * TAU / 10, r = 30 + 90 * k; FA.ember(ctx, v.x + Math.cos(a) * r, v.y - 140 + Math.sin(a) * r, 3.2, a + Math.PI / 2, 'gold', die); }
        break;
      }
      case 'embers': {
        const n = 18, s = v.seed || 0, spread = Math.max(50, v.r), pal = palOf(v.col);
        for (let i = 0; i < n; i++) {
          const a = i * TAU / n + Math.sin(s + i * 3.1) * 0.4, sp = 0.45 + 0.55 * Math.abs(Math.sin(s * 1.7 + i * 2.3));
          const d = spread * sp * Math.min(1, k * 1.6), up = 220 * sp * k - 260 * k * k;
          const px = v.x + Math.cos(a) * d, py = v.y + Math.sin(a) * d * tilt - Math.max(0, up) - 10;
          FA.ember(ctx, px, py, 4.6 * die + 1, a + Math.PI / 2 + Math.sin(t * 6 + i) * 0.6, i % 3 === 0 ? 'gold' : pal, die);
        }
        break;
      }
      case 'ring': {
        const rr = v.r * (0.35 + 0.75 * Math.sqrt(k));
        FA.ring(ctx, v.x, v.y, rr, tilt, t, sd, { h: 30 * die + 6, w: 8, alpha: die, out: 0.8, pal: palOf(v.col), spacing: 30 });
        break;
      }
      default: ctx.restore(); return false;
    }
    ctx.restore();
    return true;
  };

  P.drawFireball = function (ctx, x, y, r, t, col) {
    if (window.FlameArt) { window.FlameArt.ball(ctx, x, y, r * 1.15, t, x * 0.01, { pal: col === '#a855f7' ? 'violet' : (col === '#fde047' ? 'gold' : 'fire'), dir: Math.PI / 2 }); return; }
    const violet = col === '#a855f7';
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    if (violet) { g.addColorStop(0, 'rgba(250,240,255,1)'); g.addColorStop(0.35, 'rgba(192,132,252,0.9)'); g.addColorStop(1, 'rgba(120,40,200,0)'); }
    else { g.addColorStop(0, 'rgba(255,252,230,1)'); g.addColorStop(0.35, 'rgba(255,180,60,0.95)'); g.addColorStop(1, 'rgba(255,70,20,0)'); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill();
    ctx.restore();
  };
  // a blown kiss: a big pink heart of light with lips on it, a trail of little hearts, and its shadow on the boards so you can
  // see where it is (it flies at head height)
  P.drawKiss = function (ctx, x, y, t) {
    const tilt = T(), s = 17 + Math.sin(t * 8) * 2.5;
    ctx.save();
    ctx.fillStyle = 'rgba(255,60,140,0.22)'; ctx.beginPath(); ctx.ellipse(x, y + 46, 34, 34 * tilt, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,180,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 3.2);
    g.addColorStop(0, 'rgba(255,230,240,1)'); g.addColorStop(0.4, 'rgba(244,114,182,0.85)'); g.addColorStop(1, 'rgba(244,63,94,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 3.2, 0, TAU); ctx.fill();
    ctx.restore();
    // trailing hearts
    for (let i = 1; i <= 4; i++) drawHeart(ctx, x + Math.sin(t * 6 + i * 1.7) * 10, y + i * 9 + Math.cos(t * 5 + i) * 4, 5 - i * 0.7, '#ffd1e6', 0.8 - i * 0.16);
    drawHeart(ctx, x, y, s * 1.05, '#ff2d6f', 1);
    drawHeart(ctx, x, y - 1, s * 0.82, '#ff6fa8', 1);
    // lips in light across it
    ctx.save(); ctx.fillStyle = '#fff0f6'; const q = s * 0.5;
    ctx.beginPath(); ctx.moveTo(x - q, y); ctx.quadraticCurveTo(x - q * 0.5, y - q * 0.7, x, y - q * 0.25); ctx.quadraticCurveTo(x + q * 0.5, y - q * 0.7, x + q, y); ctx.quadraticCurveTo(x, y + q * 0.8, x - q, y); ctx.fill();
    ctx.restore();
  };

  // the [G] prompt / lane overlay of the shared Karok Clash draws her fan where it would draw a sword
  P.drawKarokSword = function (ctx, x, y, rot, alpha) {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rot);
    const N = 9;
    for (let i = 0; i < N - 1; i++) {
      const a0 = -1.1 + 2.2 * i / (N - 1), a1 = -1.1 + 2.2 * (i + 1) / (N - 1);
      ctx.fillStyle = i % 2 ? COL.silk : COL.silk2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a0) * 9, Math.sin(a0) * 9); ctx.lineTo(Math.cos(a0) * 26, Math.sin(a0) * 26); ctx.lineTo(Math.cos(a1) * 26, Math.sin(a1) * 26); ctx.lineTo(Math.cos(a1) * 9, Math.sin(a1) * 9); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = COL.trim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 26, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle = COL.rib; ctx.lineWidth = 1.2; for (let i = 0; i < N; i++) { const a = -1.1 + 2.2 * i / (N - 1); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.stroke(); }
    ctx.restore();
  };
  // Footlight Flash lane: no painted AOE. Two rows of stage footlights rise out of the floor along the edges of her firing line
  // and switch on bulb by bulb from her outward; the full runway is lit just before she fires, then every bulb strobes white.
  P.drawKarokLaneTell = function (ctx, p, charge, time) {
    const lane = this.karokLane || { len: 560, half: 72 };
    const rise = c01(p / 0.12), N = 11, lit = c01(p / 0.62) * N, strobe = charge > 0.85;
    const ca = Math.cos(this.facingAngle), sa = Math.sin(this.facingAngle), tilt = T();
    ctx.save();
    for (let i = 0; i < N; i++) {
      const d = 50 + (lane.len - 50) * i / (N - 1);
      const on = c01(lit - i);
      for (const sg of [-1, 1]) {
        const lx = d * ca - sg * lane.half * sa, ly = d * sa + sg * lane.half * ca;
        const X = this.x + lx, Y = this.y + ly * tilt;
        // the brass lamp housing (rises out of the stage)
        const hgt = 9 * rise;
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = rise;
        ctx.fillStyle = '#3b2a12'; ctx.beginPath(); ctx.ellipse(X, Y, 8, 8 * tilt, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c9962a'; ctx.fillRect(X - 5, Y - hgt, 10, hgt);
        if (on <= 0) { ctx.fillStyle = '#5a4520'; ctx.beginPath(); ctx.arc(X, Y - hgt, 4, 0, TAU); ctx.fill(); continue; }
        // the bulb + its pool of light on the floor, pointing into the lane
        ctx.globalCompositeOperation = 'lighter';
        const w = strobe ? (Math.sin(time * 40 + i) > 0 ? 1 : 0.35) : on;
        const col = strobe ? '255,250,230' : '255,200,110';
        const g = ctx.createRadialGradient(X + sg * sa * 22, Y - sg * ca * 22 * tilt, 2, X + sg * sa * 22, Y - sg * ca * 22 * tilt, 40);
        g.addColorStop(0, `rgba(${col},${0.32 * w})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X + sg * sa * 22, Y - sg * ca * 22 * tilt, 40, 40 * tilt, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,250,225,${0.9 * w})`; ctx.beginPath(); ctx.arc(X, Y - hgt, 4.5, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,190,90,${0.35 * w})`; ctx.beginPath(); ctx.arc(X, Y - hgt, 11, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  };
  P.drawGetsugaCharge = function (ctx, p, charge, time) {
    if (p < 0.06 || p > 0.78) return;
    // Footlight Flash charge: a sun gathers between her palms while she holds her arms wide, flame motes spiral into it and
    // gold lightning crackles off it; once her palms meet it is crammed small and white-hot
    // arms wide: a flame in each palm; palms together: the two merge into one white-hot sun between them
    const hs = this._hands;
    const spread = p < 0.44;
    const orbs = spread && hs && hs.r && hs.l ? [hs.r.scr, hs.l.scr] : [this.flashOrigin()];
    const r = spread ? 4 + charge * 7 : 9 + charge * 9;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const seed = Math.floor(time * 18);
    orbs.forEach((o, oi) => {
      // motes drawn in from around her
      for (let i = 0; i < 9; i++) {
        const ph = (time * 0.9 + i / 9 + oi * 0.37) % 1, a = i * 2.4 + time * 1.3 + oi, R = (1 - ph) * (55 + charge * 30);
        ctx.fillStyle = `rgba(255,${180 + (i % 3) * 25},90,${ph * 0.85})`;
        ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * R, o.y + Math.sin(a) * R * 0.6, 1.2 + ph * 1.8, 0, TAU); ctx.fill();
      }
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 3);
      g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.25, 'rgba(255,235,150,0.95)'); g.addColorStop(0.55, 'rgba(255,150,50,0.55)'); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r * 3, 0, TAU); ctx.fill();
      // short crackling arcs hugging the orb, with a soft glow under each
      for (let i = 0; i < 2 + Math.floor(charge * 4); i++) {
        let a = ((seed * 7 + i * 13 + oi * 5) % 31) / 31 * TAU, x = o.x + Math.cos(a) * r * 0.6, y = o.y + Math.sin(a) * r * 0.6;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 3; s++) { a += (((seed + i * 5 + s * 3) % 7) - 3) * 0.35; const L = r * (0.45 + charge * 0.35); x += Math.cos(a) * L; y += Math.sin(a) * L; ctx.lineTo(x, y); }
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,170,60,0.35)'; ctx.lineWidth = 3.5; ctx.stroke();
        ctx.strokeStyle = `rgba(255,246,200,${0.6 + 0.4 * charge})`; ctx.lineWidth = 1.1; ctx.stroke();
      }
    });
    ctx.restore();
  };
  // where the beam leaves her: between her palms (or just in front of her chest)
  P.flashOrigin = function () {
    const h = this._hands;
    if (h && h.r && h.l) return { x: (h.r.scr.x + h.l.scr.x) / 2 + Math.cos(this.facingAngle) * 6, y: (h.r.scr.y + h.l.scr.y) / 2 + Math.sin(this.facingAngle) * 6 * T() };
    return { x: this.x + Math.cos(this.facingAngle) * 30, y: this.y + Math.sin(this.facingAngle) * 30 * T() - 105 };
  };
  // a beam of flame between two screen points. hw: half width · a: strength 0..1 · splash: it is breaking on something at the end
  P.drawFlashBeam = function (ctx, sx, sy, ex, ey, hw, a, time, splash) {
    const dx = ex - sx, dy = ey - sy, L = Math.hypot(dx, dy) || 1;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(dy, dx)); ctx.globalCompositeOperation = 'lighter';
    const fade = splash ? 1 : 0.86;
    const lenG = (c0, c1) => { const g = ctx.createLinearGradient(0, 0, L, 0); g.addColorStop(0, c0); g.addColorStop(fade, c0); g.addColorStop(1, c1); return g; };
    // wide heat haze, then the body, then the white-hot core
    const wob = 1 + Math.sin(time * 31) * 0.06;
    ctx.fillStyle = lenG(`rgba(255,80,20,${0.22 * a})`, 'rgba(255,80,20,0)'); ctx.fillRect(0, -hw * 2.1 * wob, L, hw * 4.2 * wob);
    const g = ctx.createLinearGradient(0, -hw, 0, hw);
    g.addColorStop(0, 'rgba(255,60,20,0)'); g.addColorStop(0.2, `rgba(255,110,30,${0.75 * a})`); g.addColorStop(0.5, `rgba(255,230,150,${0.95 * a})`); g.addColorStop(0.8, `rgba(255,110,30,${0.75 * a})`); g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, -hw * wob, L * (splash ? 1 : 0.97), hw * 2 * wob);
    ctx.fillStyle = lenG(`rgba(255,255,240,${0.95 * a})`, 'rgba(255,255,240,0)'); ctx.fillRect(0, -hw * 0.22, L, hw * 0.44);
    // flame licks streaming off both edges, racing away from her
    ctx.lineCap = 'round';
    for (let i = 0; i < Math.ceil(L / 22); i++) {
      const x = (time * 520 + i * 47) % L, side = i % 2 ? 1 : -1, k = Math.sin((x / L) * Math.PI);
      const fl = 0.6 + 0.4 * Math.sin(time * 23 + i * 1.7);
      ctx.strokeStyle = `rgba(255,${140 + (i % 3) * 30},50,${0.55 * a * k})`; ctx.lineWidth = 2.6 + (i % 3);
      ctx.beginPath(); ctx.moveTo(x, side * hw * 0.6); ctx.quadraticCurveTo(x - 12, side * hw * (1.2 + fl * 0.4), x - 30 - fl * 14, side * hw * (1.15 + fl * 0.6)); ctx.stroke();
    }
    // the muzzle: a flare at her palms
    const m = ctx.createRadialGradient(0, 0, 0, 0, 0, hw * 1.9);
    m.addColorStop(0, `rgba(255,255,240,${a})`); m.addColorStop(0.4, `rgba(255,200,90,${0.7 * a})`); m.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = m; ctx.beginPath(); ctx.arc(0, 0, hw * 1.9, 0, TAU); ctx.fill();
    if (splash) {
      // breaking on the hammer: a bright splash and fire spraying back and out around it
      const sp = ctx.createRadialGradient(L, 0, 0, L, 0, hw * 2.4);
      sp.addColorStop(0, `rgba(255,255,235,${a})`); sp.addColorStop(0.35, `rgba(255,190,80,${0.8 * a})`); sp.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(L, 0, hw * 2.4, 0, TAU); ctx.fill();
      for (let i = 0; i < 12; i++) {
        const ph = (time * 3.2 + i / 12) % 1, side = i % 2 ? 1 : -1, ang = Math.PI - side * (0.55 + (i % 5) * 0.22);
        const R = hw * (0.8 + ph * 3.2);
        ctx.strokeStyle = `rgba(255,${150 + (i % 4) * 25},60,${(1 - ph) * 0.85 * a})`; ctx.lineWidth = 3.4 * (1 - ph) + 1;
        ctx.beginPath(); ctx.moveTo(L + Math.cos(ang) * hw * 0.6, Math.sin(ang) * hw * 0.6);
        ctx.quadraticCurveTo(L + Math.cos(ang) * R * 0.6, Math.sin(ang) * R * 0.7, L + Math.cos(ang) * R, Math.sin(ang) * R + 6 * ph); ctx.stroke();
      }
    }
    ctx.restore();
  };
  // a chain between two screen points, sagging by `slack` of its length: dark iron links with a glint
  function drawChain(ctx, ax, ay, bx, by, slack, time) {
    const L = Math.hypot(bx - ax, by - ay) || 1, n = Math.max(4, Math.floor(L / 9));
    const sag = L * slack;
    ctx.save(); ctx.lineCap = 'round';
    const pt = (k) => ({ x: ax + (bx - ax) * k, y: ay + (by - ay) * k + Math.sin(k * Math.PI) * sag + Math.sin(time * 30 + k * 9) * (slack > 0.01 ? 0 : 0.8) });
    for (let i = 0; i < n; i++) {
      const p = pt(i / n), q = pt((i + 1) / n), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, ang = Math.atan2(q.y - p.y, q.x - p.x);
      ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
      if (i % 2) ctx.scale(1, 0.35);           // every other link seen edge-on
      ctx.strokeStyle = '#120c10'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.ellipse(0, 0, 5.2, 2.8, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#6b6470'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,200,0.6)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(0, -0.4, 4.6, 2.2, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  // everything of the Footlight Flash that is drawn over the world: the free shot, the clash beam, its breaking, the chain
  P.drawFlashTop = function (ctx) {
    const time = now(), tilt = T();
    const o = this.flashOrigin();
    const fb = this.flashBeam;
    if (fb) {
      const k = fb.t / fb.dur, a = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.55) / 0.45);
      const len = fb.len * Math.min(1, k * 6);
      const ex = this.x + Math.cos(fb.a) * len, ey = this.y + Math.sin(fb.a) * len * tilt - 100;
      this.drawFlashBeam(ctx, o.x, o.y, ex, ey, 30 * (0.7 + 0.3 * a), a, time, false);
      // scorched lane on the floor under it
      ctx.save(); ctx.translate(this.x, this.y); ctx.scale(1, tilt); ctx.rotate(fb.a); ctx.globalCompositeOperation = 'lighter';
      const gl = ctx.createLinearGradient(0, -60, 0, 60); gl.addColorStop(0, 'rgba(255,90,20,0)'); gl.addColorStop(0.5, `rgba(255,150,60,${0.35 * a})`); gl.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = gl; ctx.fillRect(20, -60, len, 120); ctx.restore();
    }
    const c = this.karokClash;
    if (!c || c.style !== 'beam' || this.state !== 'karok_clash') return;
    const pl = ((window.game && window.game.party) || []).find(q => q.id === c.id);
    if (!pl) return;
    // the beam breaks on the face of the hammer's slab, held out in front of the clasher
    const toB = Math.atan2((this.y - pl.y) / tilt, this.x - pl.x);
    const hs = pl.localToWorld ? pl.localToWorld(84, 0, 64) : null;
    const hit = hs ? { x: hs.sx, y: hs.sy } : { x: pl.x + Math.cos(toB) * 84, y: pl.y + Math.sin(toB) * 84 * tilt - 64 - (pl.jumpZ || 0) };
    if (c.phase === 'intro' && c.t > 0.25) {
      // the shot races down the lane and slams into the raised hammer
      const s = Math.min(1, (c.t - 0.25) / 0.37);
      this.drawFlashBeam(ctx, o.x, o.y, o.x + (hit.x - o.x) * s, o.y + (hit.y - o.y) * s, 26, 1, time, s >= 1);
    } else if (c.phase === 'struggle') {
      const pulse = 1 + (c.pulse > 0 ? 0.15 : 0);
      this.drawFlashBeam(ctx, o.x, o.y, hit.x, hit.y, 26 * pulse * (0.9 + (1 - c.meter) * 0.25), 1, time, true);
    } else if (c.phase === 'finish' && c.win && (c.finishT || 0) < 0.35) {
      // the beam breaks apart: thinner, flickering, fragments
      const f = (c.finishT || 0) / 0.35;
      if (Math.sin(time * 90) > -0.3) this.drawFlashBeam(ctx, o.x, o.y, hit.x, hit.y, 26 * (1 - f), 1 - f, time, true);
    }
    if (c.chain) drawChain(ctx, c.chain.ax, c.chain.ay, c.chain.bx, c.chain.by, c.chain.slack, time);
  };

  // =========================================================================================================================
  // SCREEN: the playbill, puzzle panels, the finale meter, and her Ego gauge (a fan that opens with her ego)
  // =========================================================================================================================
  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(20,6,10,0.88)'; ctx.strokeStyle = 'rgba(242,182,50,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8); else ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
  }
  P.drawScreen = function (ctx, W, H) {
    if (this.hp <= 0) return;
    ctx.save();
    const m = this.mech;
    if (m && m.kind === 'act2') this.drawHouseCurtains(ctx, W, H, this.act2Curtain(m), m);
    this.drawEgoGauge(ctx, W, H);
    ctx.textAlign = 'center';
    if (m && m.kind === 'pyre' && m.phase === 'solve') {
      // no words: her fan's pattern (bottom row, gold-rimmed) over the braziers as they are now (top row), and a burning fuse
      const w = 280, h = 84, x = W - w - 18, y = H * 0.24;
      panel(ctx, x, y, w, h);
      for (let row = 0; row < 2; row++) {
        const bits = row ? m.target : m.bits;
        if (row) { ctx.save(); ctx.strokeStyle = 'rgba(253,224,71,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(x + 28, y + 50, w - 56, 22); ctx.restore(); }
        for (let i = 0; i < 5; i++) {
          const cx = x + 48 + i * 46, cy = y + 34 + row * 27, on = !!(bits & (1 << i));
          ctx.fillStyle = on ? '#fb923c' : '#2a1d1d'; ctx.strokeStyle = '#f2b632'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill(); ctx.stroke();
          if (!row) { ctx.fillStyle = '#fff2c4'; ctx.font = '800 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(['I', 'II', 'III', 'IV', 'V'][i], cx, cy - 11); }
        }
        ctx.textAlign = 'center';
      }
      // the fuse: burns down with the time left
      const fk = c01((m.left || 0) / (m.solveDur || 1));
      ctx.fillStyle = '#3b1208'; ctx.fillRect(x + 14, y + 8, w - 28, 4);
      ctx.fillStyle = fk < 0.25 ? '#ef4444' : '#fb923c'; ctx.fillRect(x + 14, y + 8, (w - 28) * fk, 4);
    }
    if (m && m.kind === 'finale' && m.phase !== 'intro') {
      // no words: the sun's heat bar and one pip per crack she needs
      const w = 320, h = 44, x = W / 2 - w / 2, y = H * 0.19;
      panel(ctx, x, y, w, h);
      ctx.fillStyle = '#3b1208'; ctx.fillRect(x + 16, y + 10, w - 32, 10);
      ctx.fillStyle = m.sun > 0.8 ? '#ef4444' : '#fb923c'; ctx.fillRect(x + 16, y + 10, (w - 32) * c01(m.sun), 10);
      for (let i = 0; i < m.need; i++) {
        const cx = W / 2 + (i - (m.need - 1) / 2) * 20, cy = y + 32;
        ctx.fillStyle = i < m.cracks ? '#fde047' : '#2a1d1d'; ctx.strokeStyle = '#f2b632'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, TAU); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  };

  P.drawEgoGauge = function (ctx, W, H) {
    const g = window.game;
    if (!g || g.mode !== 'raid') return;
    const t = now();
    if (!this._hudRect || t - this._hudRectT > 0.5) {
      this._hudRectT = t;
      const el = document.getElementById('boss-hud');
      this._hudRect = el && !el.classList.contains('hidden') ? el.getBoundingClientRect() : null;
    }
    const r = this._hudRect;
    if (!r || r.width < 10) return;
    // A painted folding fan, to the right of the boss bar (the status row under the bar stays clear). Her ego fills the silk
    // rib by rib from the left; the 85 mark (showing off) is a gold rib; a little flame rides the leading edge; when ego drops the
    // lost ribs flash; in a Tantrum the fan is torn and burning and a ring of fire counts the Tantrum down.
    const R = 50, cx = Math.min(W - 78, r.right + 86), cy = r.top + R + 10;
    const egoRaw = c01(this.ego / 100), tant = this.tantrumT > 0;
    // a smoothed value for the fill, and a "recently lost" trail behind it
    const dtg = Math.min(0.1, Math.max(0, t - (this._egoDrawT || t))); this._egoDrawT = t;
    this._egoShown = this._egoShown == null ? egoRaw : this._egoShown + (egoRaw - this._egoShown) * Math.min(1, dtg * 6);
    this._egoTrail = this._egoTrail == null ? egoRaw : (egoRaw > this._egoTrail ? egoRaw : Math.max(egoRaw, this._egoTrail - dtg * 0.12));
    if (Math.abs(egoRaw - (this._egoLast ?? egoRaw)) > 0.004) { this._egoDir = Math.sign(egoRaw - this._egoLast); this._egoDirT = t; }
    this._egoLast = egoRaw;
    const ego = this._egoShown, rising = this._egoDir > 0 && t - (this._egoDirT || 0) < 1.2, falling = this._egoDir < 0 && t - (this._egoDirT || 0) < 1.2;
    const spread = Math.PI * 0.95, a0 = -Math.PI / 2 - spread / 2, N = 14, hub = 11;
    const at = (k) => a0 + spread * k;
    ctx.save();
    // backing plate and a warm glow that grows with her ego
    const glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, R + 26);
    glow.addColorStop(0, `rgba(255,${tant ? 60 : 140},40,${tant ? 0.4 + 0.15 * Math.sin(t * 9) : 0.08 + 0.32 * egoRaw})`); glow.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R + 26, Math.PI, TAU); ctx.lineTo(cx + R + 26, cy + 8); ctx.lineTo(cx - R - 26, cy + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(18,5,9,0.85)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R + 6, at(0) - 0.04, at(1) + 0.04); ctx.closePath(); ctx.fill();
    // the silk panels
    for (let i = 0; i < N; i++) {
      const k0 = i / N, k1 = (i + 1) / N, mid = (k0 + k1) / 2;
      const aa = at(k0), ab = at(k1);
      const on = mid <= ego, lost = !on && mid <= this._egoTrail, show = mid >= 0.85;
      // torn panels in a tantrum: ragged outer edge
      const rr = tant && (i % 3 === 1) ? R - 6 - 4 * Math.sin(t * 7 + i) : R;
      let fill;
      if (tant) fill = `rgba(${200 + 40 * Math.sin(t * 11 + i)},${40 + 20 * Math.sin(t * 9 + i * 2)},30,0.95)`;
      else if (on) {
        const g = ctx.createRadialGradient(cx, cy, hub, cx, cy, rr);
        g.addColorStop(0, show ? '#fff1b8' : '#ffb347'); g.addColorStop(0.55, show ? '#fbbf24' : (i % 2 ? '#e2401c' : '#f26b1d')); g.addColorStop(1, show ? '#b45309' : '#8c1414');
        fill = g;
      } else if (lost) fill = `rgba(255,240,220,${0.35 + 0.35 * Math.sin(t * 20)})`;   // ribs she just lost flash white
      else fill = i % 2 ? '#2a1214' : '#331618';
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(aa) * hub, cy + Math.sin(aa) * hub); ctx.arc(cx, cy, rr, aa, ab); ctx.lineTo(cx + Math.cos(ab) * hub, cy + Math.sin(ab) * hub); ctx.closePath(); ctx.fill();
      // a painted flame motif on lit panels
      if (on && !tant) {
        const am = (aa + ab) / 2, fx = cx + Math.cos(am) * R * 0.66, fy = cy + Math.sin(am) * R * 0.66;
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(am + Math.PI / 2); ctx.fillStyle = show ? 'rgba(255,250,220,0.55)' : 'rgba(255,214,120,0.4)';
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(3, -1, 0, 4); ctx.quadraticCurveTo(-3, -1, 0, -6); ctx.fill(); ctx.restore();
      }
    }
    // lacquered ribs, with the 85% rib in gold (where she starts showing off)
    for (let i = 0; i <= N; i++) {
      const aa = at(i / N), gold = Math.abs(i / N - 0.857) < 0.04;
      ctx.strokeStyle = gold ? '#f2b632' : '#1d1116'; ctx.lineWidth = gold ? 2.2 : 1.3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(aa) * hub, cy + Math.sin(aa) * hub); ctx.lineTo(cx + Math.cos(aa) * (R + (gold ? 5 : 0)), cy + Math.sin(aa) * (R + (gold ? 5 : 0))); ctx.stroke();
    }
    // the show-off band: a thin gold arc past the 85 mark
    ctx.strokeStyle = egoRaw >= 0.85 && !tant ? `rgba(253,224,71,${0.7 + 0.3 * Math.sin(t * 6)})` : 'rgba(242,182,50,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R + 4, at(0.857), at(1)); ctx.stroke();
    // gold rim
    ctx.strokeStyle = '#f2b632'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, at(0), at(1)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,235,170,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R - 3, at(0), at(1)); ctx.stroke();
    // the leading edge: a little flame riding the current value
    if (!tant && ego > 0.01) {
      const ae = at(ego), ex = cx + Math.cos(ae) * (R + 3), ey = cy + Math.sin(ae) * (R + 3);
      if (window.FlameArt) { ctx.save(); ctx.translate(ex, ey); ctx.rotate(ae + Math.PI / 2); window.FlameArt.tongue(ctx, 0, 2, rising ? 18 : 12, 4.5, t, 7.7, { pal: egoRaw >= 0.85 ? 'gold' : 'fire', shadow: false, rate: 1.4 }); ctx.restore(); }
      ctx.strokeStyle = '#fff7d6'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(ae) * hub, cy + Math.sin(ae) * hub); ctx.lineTo(cx + Math.cos(ae) * R, cy + Math.sin(ae) * R); ctx.stroke();
    }
    // tantrum: a ring of fire burning down the time that is left
    if (tant) {
      const k = c01(this.tantrumT / 18);
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, R + 8, at(0), at(k)); ctx.stroke();
      if (window.FlameArt) for (let i = 0; i < 5; i++) { const ae = at((i + 0.5) / 5 * k); window.FlameArt.tongue(ctx, cx + Math.cos(ae) * (R + 8), cy + Math.sin(ae) * (R + 8), 14, 4, t, i * 3.1, { pal: 'fire', shadow: false, rate: 1.6 }); }
    }
    // the pivot jewel
    ctx.fillStyle = '#1d1116'; ctx.beginPath(); ctx.arc(cx, cy, hub, Math.PI, TAU); ctx.fill();
    const jg = ctx.createRadialGradient(cx - 2, cy - 3, 1, cx, cy, 7);
    jg.addColorStop(0, '#fff1b8'); jg.addColorStop(1, tant ? '#b91c1c' : '#d97706');
    ctx.fillStyle = jg; ctx.beginPath(); ctx.arc(cx, cy - 1, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#f2b632'; ctx.lineWidth = 1.4; ctx.stroke();
    // labels: the number, the state, and which way it is moving
    ctx.textAlign = 'center';
    ctx.font = '900 16px Georgia, serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,3,6,0.9)';
    const num = tant ? `${Math.ceil(this.tantrumT)}s` : `${Math.round(this.ego)}`;
    ctx.fillStyle = tant ? '#fca5a5' : (egoRaw >= 0.85 ? '#fde68a' : '#fff7ed');
    ctx.strokeText(num, cx, cy + 20); ctx.fillText(num, cx, cy + 20);
    if (!tant && (rising || falling)) {
      ctx.fillStyle = rising ? '#fb923c' : '#86efac';
      const ax = cx + ctx.measureText(num).width / 2 + 9, ay = cy + 14;
      ctx.beginPath(); if (rising) { ctx.moveTo(ax - 4, ay + 2); ctx.lineTo(ax + 4, ay + 2); ctx.lineTo(ax, ay - 4); } else { ctx.moveTo(ax - 4, ay - 3); ctx.lineTo(ax + 4, ay - 3); ctx.lineTo(ax, ay + 3); } ctx.closePath(); ctx.fill();
    }
    ctx.font = '900 9.5px system-ui, sans-serif'; ctx.letterSpacing = '1px';
    ctx.fillStyle = tant ? '#fca5a5' : (egoRaw >= 0.85 ? '#fde68a' : '#d6c3b3');
    const lab = tant ? 'TANTRUM' : (egoRaw >= 0.85 ? 'EGO · SHOWING OFF' : (egoRaw <= 0.2 ? 'EGO · FRAYING' : 'EGO'));
    ctx.strokeText(lab, cx, cy + 32); ctx.fillText(lab, cx, cy + 32);
    ctx.restore();
  };

  // =========================================================================================================================
  // THE GILDED PYRE: a round theatre stage floating over a sea of embers, red velvet curtains and a gold proscenium behind it
  // =========================================================================================================================
  const stageCache = {};
  function stageFloor(R) {
    if (stageCache[R]) return stageCache[R];
    const S = 1.2, D = Math.ceil((2 * R + 40) * S), c = document.createElement('canvas'); c.width = c.height = D;
    const x = c.getContext('2d'); x.scale(S, S); x.translate(D / S / 2, D / S / 2);
    // dark polished boards
    x.save(); x.beginPath(); x.arc(0, 0, R, 0, TAU); x.clip();
    const base = x.createRadialGradient(0, 0, 20, 0, 0, R);
    base.addColorStop(0, '#4a2616'); base.addColorStop(0.6, '#2c160d'); base.addColorStop(1, '#170a06');
    x.fillStyle = base; x.fillRect(-R, -R, 2 * R, 2 * R);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let yy = -R; yy < R; yy += 26) {
      x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-R, yy); x.lineTo(R, yy); x.stroke();
      x.strokeStyle = 'rgba(255,190,120,0.06)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-R, yy + 2); x.lineTo(R, yy + 2); x.stroke();
      let xx = -R + rnd() * 140;
      while (xx < R) { x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx, yy + 26); x.stroke(); xx += 110 + rnd() * 160; }
      for (let k = 0; k < 6; k++) { const gx = -R + rnd() * 2 * R; x.strokeStyle = 'rgba(20,8,4,0.35)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(gx, yy + 6 + rnd() * 14); x.lineTo(gx + 40 + rnd() * 60, yy + 6 + rnd() * 14); x.stroke(); }
    }
    // a soft warm sheen in the middle
    const sheen = x.createRadialGradient(0, -R * 0.15, 10, 0, 0, R * 0.75);
    sheen.addColorStop(0, 'rgba(255,200,140,0.14)'); sheen.addColorStop(1, 'rgba(255,200,140,0)');
    x.fillStyle = sheen; x.fillRect(-R, -R, 2 * R, 2 * R);
    x.restore();
    // gold inlay rings
    for (const [rr, w] of [[R - 6, 6], [R * 0.86, 2.5], [R * 0.52, 3.5], [R * 0.2, 2.5]]) { x.strokeStyle = '#b8862a'; x.lineWidth = w; x.beginPath(); x.arc(0, 0, rr, 0, TAU); x.stroke(); x.strokeStyle = 'rgba(255,235,170,0.35)'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, rr - w * 0.3, 0, TAU); x.stroke(); }
    // the great gilded fan inlaid in the centre, with a flame at its pivot
    x.save(); x.translate(0, R * 0.08);
    const fanR = R * 0.46, a0 = -Math.PI * 0.92, a1 = -Math.PI * 0.08, n = 13;
    for (let i = 0; i < n; i++) {
      const aa = a0 + (a1 - a0) * i / n, ab = a0 + (a1 - a0) * (i + 1) / n;
      x.fillStyle = i % 2 ? 'rgba(160,20,40,0.55)' : 'rgba(120,12,30,0.55)';
      x.beginPath(); x.moveTo(Math.cos(aa) * fanR * 0.25, Math.sin(aa) * fanR * 0.25); x.arc(0, 0, fanR, aa, ab); x.lineTo(Math.cos(ab) * fanR * 0.25, Math.sin(ab) * fanR * 0.25); x.closePath(); x.fill();
    }
    x.strokeStyle = '#d4a017'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, fanR, a0, a1); x.stroke();
    x.lineWidth = 2; for (let i = 0; i <= n; i++) { const aa = a0 + (a1 - a0) * i / n; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(aa) * fanR, Math.sin(aa) * fanR); x.stroke(); }
    x.fillStyle = '#d4a017'; x.beginPath(); x.arc(0, 0, 10, 0, TAU); x.fill();
    x.restore();
    // footlight sockets around the rim
    for (let i = 0; i < 40; i++) { const a = i * TAU / 40; x.fillStyle = '#2a1a0a'; x.beginPath(); x.arc(Math.cos(a) * (R - 20), Math.sin(a) * (R - 20), 5, 0, TAU); x.fill(); }
    return (stageCache[R] = { c, D, S });
  }

  P.drawArena = function (ctx, game) {
    const R = game.arenaRadius, tilt = T(), t = now();
    // the void: deep crimson dark with a sea of embers far below
    ctx.save();
    ctx.fillStyle = '#0a0305'; ctx.fillRect(-8000, -8000, 16000, 16000);
    const a2 = !!this.act2;                 // Act II: the house is on fire
    const sea = ctx.createRadialGradient(0, 260, 50, 0, 260, R * 3);
    sea.addColorStop(0, a2 ? 'rgba(255,120,30,0.55)' : 'rgba(255,90,30,0.35)'); sea.addColorStop(0.4, a2 ? 'rgba(200,45,15,0.32)' : 'rgba(160,30,15,0.2)'); sea.addColorStop(1, 'rgba(10,3,5,0)');
    ctx.fillStyle = sea; ctx.fillRect(-R * 3, -R * 2, R * 6, R * 6);
    // drifting cinders in the void
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const s = i * 97.13, x = ((s * 13.7) % (R * 4)) - R * 2, y0 = ((s * 7.3) % (R * 3)) - R, y = y0 - ((t * (20 + (i % 7) * 6)) % (R * 3));
      const yy = y < -R * 1.6 ? y + R * 3 : y;
      ctx.fillStyle = `rgba(255,${120 + (i % 5) * 20},60,${0.25 + 0.25 * Math.sin(t * 2 + i)})`; ctx.fillRect(x, yy, 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    // the proscenium arch and red velvet curtains behind the stage
    const by = -R * tilt - 30, aw = R * 1.25;
    for (const sg of [-1, 1]) {
      const g = ctx.createLinearGradient(sg * aw, 0, sg * aw * 0.42, 0);
      g.addColorStop(0, a2 ? '#1c0306' : '#3a0610'); g.addColorStop(1, a2 ? '#5a0a10' : '#7a0c22');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(sg * aw, by - 420); ctx.lineTo(sg * aw * 0.42, by - 420); ctx.quadraticCurveTo(sg * aw * 0.5, by - 120, sg * aw * 0.36, by + 30); ctx.lineTo(sg * aw, by + 30); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
      for (let k = 1; k < 9; k++) { const xx = lerp(sg * aw, sg * aw * 0.42, k / 9); ctx.beginPath(); ctx.moveTo(xx, by - 420); ctx.quadraticCurveTo(xx + sg * 8, by - 160, xx - sg * 6 * (k / 9), by + 30); ctx.stroke(); }
      ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sg * aw * 0.42, by - 120); ctx.quadraticCurveTo(sg * aw * 0.6, by - 90, sg * aw * 0.66, by - 140); ctx.stroke();
    }
    ctx.fillStyle = '#5a0a18';
    ctx.beginPath(); ctx.moveTo(-aw, by - 420); ctx.lineTo(aw, by - 420); ctx.lineTo(aw, by - 330);
    for (let i = 10; i >= 0; i--) { const xx = lerp(-aw, aw, i / 10); ctx.quadraticCurveTo(xx + aw / 10, by - 300, xx, by - 330); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-aw - 10, by - 424); ctx.lineTo(aw + 10, by - 424); ctx.stroke();
    // Act II: the curtains have caught. Flame licks up from their hems and along the valance
    if (a2 && window.FlameArt) {
      const FA = window.FlameArt;
      for (const sg of [-1, 1]) for (let k = 0; k < 7; k++) {
        const xx = lerp(sg * aw * 0.4, sg * aw * 0.98, k / 6);
        FA.tongue(ctx, xx, by + 30, 70 + 30 * Math.sin(k * 2.1), 16, t, 300 + k + (sg > 0 ? 20 : 0), { shadow: false, rate: 1.1 });
      }
      for (let k = 0; k < 9; k++) FA.tongue(ctx, lerp(-aw * 0.9, aw * 0.9, k / 8), by - 318, 34, 9, t, 340 + k, { shadow: false, rate: 1.3, layers: 3 });
    }
    // the stage's front skirt (velvet hanging under the near edge)
    ctx.save(); ctx.scale(1, tilt);
    ctx.fillStyle = '#4a0612';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI); ctx.lineTo(-R, 60 / tilt); ctx.arc(0, 60 / tilt, R, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI, x = Math.cos(a) * R, y = Math.sin(a) * R * tilt; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60); ctx.stroke(); }
    // the stage floor
    const F = stageFloor(R);
    ctx.save(); ctx.scale(1, tilt);
    const half = F.D / F.S / 2;
    ctx.drawImage(F.c, -half, -half, half * 2, half * 2);
    // footlights glowing round the rim. During a stage cue they take the cue's colour and go out one by one, clockwise from the
    // back of the stage: that is the cue's timer (when the last one dies the stage snaps back to warm)
    ctx.globalCompositeOperation = 'lighter';
    const C = this.cue;
    const lit = C ? Math.ceil(40 * (1 - c01(C.t / C.dur))) : 40;
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI / 2 + i * TAU / 40, x = Math.cos(a) * (R - 20), y = Math.sin(a) * (R - 20);
      if (i >= lit) continue;
      const fl = 0.75 + 0.25 * Math.sin(t * 6 + i * 1.7);
      let col = '255,235,170', edge = '255,170,60', rad = 26, al = 0.85 * fl;
      if (a2) { col = '255,170,70'; edge = '230,50,20'; rad = 30; }     // Act II: the footlights are open flame
      if (C && C.kind === 'hold') { col = '235,245,255'; edge = '150,190,255'; rad = 30; al = 0.95; }
      else if (C && C.kind === 'dance') {
        const beat = (Math.floor(t * 6) + i) % 3;          // a running chase of red and gold
        col = beat === 0 ? '255,250,210' : (beat === 1 ? '255,90,60' : '255,190,60'); edge = beat === 1 ? '220,30,40' : '255,140,30';
        rad = beat === 0 ? 34 : 24; al = 1;
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(1, `rgba(${edge},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    // two slow spotlights sweeping the boards
    for (let k = 0; k < 2; k++) {
      const a = t * (k ? 0.21 : -0.17) + k * 2, x = Math.cos(a) * R * 0.45, y = Math.sin(a) * R * 0.45;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 120);
      g.addColorStop(0, 'rgba(255,240,210,0.10)'); g.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 120, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // Act II footlights: a small living flame on every other one (drawn unflattened, above the boards)
    if (a2 && window.FlameArt && !C) {
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 40; i += 2) {
        const a = -Math.PI / 2 + i * TAU / 40;
        window.FlameArt.tongue(ctx, Math.cos(a) * (R - 20), Math.sin(a) * (R - 20) * tilt, 22, 6, t, 400 + i, { shadow: false, rate: 1.4, layers: 3 });
      }
    }
    ctx.restore();
  };

  // ---- the raid-menu preview stands her on her mark, fanning herself
  P.drawPreview = function (ctx) {
    if (!this.hairN) this.resetRig();
    this.updateRig(1 / 60);
    this.state = 'idle'; this.speed = 0;
    this._pose = fanning(PS.smug);
    this.drawFigure(ctx, 0, 0, Math.PI * 0.5 + 0.25, this._pose, { lift: 0 });
  };
})();
