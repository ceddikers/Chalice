// =========================================================================
// REAPER_RIG.JS — how the Reaper looks and moves
//
//   • Chain scythe in three tiers (weaponModelId): scythe_bone · scythe_obsidian · scythe_sovereign
//   • Armor in three tiers (armorTier): hooded leathers · obsidian plate · void & gold regalia
//   • Voidform: everything blends to blood and black (this.vfBlend), grotesque hunched scuttle, blood vial on the belt
//   • Per-skill poses (applyPoseHook) and overlays (tether chain, Black Sun waves, Shade afterimages, Crimson Eclipse sphere…)
// Plugs into BreakerPlayer25D.draw(): applyPoseHook(P), drawRig* parts and drawColossalGreatsword(…) (the weapon slot).
// =========================================================================
(function () {
  const RP = ReaperPlayer25D.prototype;
  const TILT = () => (typeof PERSPECTIVE_TILT !== 'undefined' ? PERSPECTIVE_TILT : 0.55);
  const c01 = (t) => Math.max(0, Math.min(1, t));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eo = (t) => 1 - Math.pow(1 - c01(t), 3);
  const ei = (t) => Math.pow(c01(t), 2.2);

  // ---- colour helpers ------------------------------------------------------
  const rgbCache = new Map();
  const toRGB = (h) => {
    let v = rgbCache.get(h);
    if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(h, v); }
    return v;
  };
  const mix = (a, b, t) => {
    if (t <= 0.001) return a;
    if (t >= 0.999) return b;
    const A = toRGB(a), B = toRGB(b);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
  };

  // Armor palettes per tier; the Voidform palette replaces them as vfBlend rises.
  const ARM = {
    1: { cloth: '#3b2f2a', cloth2: '#241b18', trim: '#a8895e', plate: '#6b5e52', glow: '#e7d3a8', skin: '#b89c86' },
    2: { cloth: '#2a1f2b', cloth2: '#170f19', trim: '#e11d48', plate: '#2f2535', glow: '#fb7185', skin: '#a89aa4' },
    3: { cloth: '#1d1233', cloth2: '#0d0718', trim: '#fde047', plate: '#41207a', glow: '#c084fc', skin: '#9d92b4' }
  };
  const VOID = { cloth: '#2c0509', cloth2: '#110203', trim: '#ff1a3c', plate: '#43070f', glow: '#ff4d6d', skin: '#7a2a2e' };

  RP.pal = function (key) {
    const base = ARM[this.armorTier || 1] || ARM[1];
    const own = key === 'skin' && this.look && this.look.skin;      // the character's chosen skin tone
    return mix(own || base[key], VOID[key], this.vfBlend || 0);
  };

  // Scythe looks per tier (same geometry, different materials/ornaments).
  const SCYTHE = {
    scythe_bone: { shaft: '#6b4a2c', shaftHi: '#a47a49', wrap: '#2a1c12', blade: ['#f0e6d2', '#b9a98a', '#6f6350'], edge: '#fffaf0', vein: null, chain: '#8c8c93', weight: '#cfc7b4', ring: '#8a6a4a', teeth: false, glow: '#e7d3a8' },
    scythe_obsidian: { shaft: '#1a1118', shaftHi: '#4a2a36', wrap: '#7f1d1d', blade: ['#4a4152', '#1b1522', '#07050b'], edge: '#fb7185', vein: '#f43f5e', chain: '#4b3a46', weight: '#e11d48', ring: '#f43f5e', teeth: true, glow: '#fb7185' },
    scythe_sovereign: { shaft: '#241048', shaftHi: '#6d3fc4', wrap: '#ca8a04', blade: ['#a78bfa', '#4c1d95', '#1a0a36'], edge: '#fde047', vein: '#fde047', chain: '#ca8a04', weight: '#fef08a', ring: '#fde047', teeth: true, halo: '#fde047', glow: '#fde047' },
    scythe_lullaby: { shaft: '#e9e6f2', shaftHi: '#ffffff', wrap: '#2a4a8f', blade: ['#f3f0e8', '#c7cee0', '#7d88a8'], edge: '#fde68a', vein: '#f5c542', chain: '#d7dbe6', weight: '#f5c542', ring: '#2a4a8f', teeth: true, halo: '#f5c542', glow: '#fde68a' }
  };
  const VSC = { blade: ['#ff5a73', '#a0102a', '#2a0309'], edge: '#ffd0d6', vein: '#ff1a3c', chain: '#5a0a14', weight: '#ff1a3c', glow: '#ff1a3c' };

  const lookOf = (p) => SCYTHE[p.weaponModelId] || SCYTHE.scythe_bone;

  // ---------------------------------------------------------------------------
  // POSES
  // ---------------------------------------------------------------------------
  RP.applyPoseHook = function (P) {
    const a = this.act;
    const vf = this.vfBlend || 0;
    const grip = (rf, rs, ru, tf, ts, tu) => {
      P.rHandLocal = { fwd: rf, side: rs, up: ru };
      P.lHandLocal = { fwd: rf - 5, side: rs - 10, up: ru - 3 };
      P.swordTipLocal = { fwd: tf, side: ts, up: tu };
    };
    // Voidform has no weapon: both clawed hands, `fwd` ahead of the body, `up` high, `spread` apart. The tip follows the right hand.
    const claws = (Pp, fwd, up, spread) => {
      Pp.rHandLocal = { fwd, side: spread * 0.5, up };
      Pp.lHandLocal = { fwd, side: -spread * 0.5, up };
      Pp.swordTipLocal = { fwd: fwd + 10, side: spread * 0.5, up };
    };
    const sweep = (ang, up, reach, tipUp) => {
      P.rHandLocal = { fwd: Math.cos(ang) * 22, side: Math.sin(ang) * 22, up };
      P.lHandLocal = { fwd: Math.cos(ang) * 17, side: Math.sin(ang) * 17 - 5, up: up - 3 };
      P.swordTipLocal = { fwd: Math.cos(ang) * reach, side: Math.sin(ang) * reach, up: tipUp === undefined ? up - 2 : tipUp };
    };

    if (!a) { this.poseNoAct(P, grip); return; }
    switch (a.kind) {
      case 'b': {
        const p = c01(a.t / a.dur);
        if (this.form === 'void') {        // claws: alternate raking swipes, the last a double-handed crush
          const dir = a.step % 2 ? 1 : -1, sw = eo(c01((p - 0.1) / 0.4));
          if (a.last) {
            const up = lerp(86, 20, ei(c01((p - 0.25) / 0.3)));
            claws(P, 24, up, 22); P.torsoLeanFwd = lerp(-8, 24, ei(c01((p - 0.2) / 0.3))); P.crouchZ = -6 * sw;
          } else {
            const ang = lerp(dir * 1.9, -dir * 1.1, sw);
            P.rHandLocal = { fwd: Math.cos(ang) * 28, side: Math.sin(ang) * 28 + 6, up: 34 + 10 * (1 - sw) };
            P.lHandLocal = { fwd: Math.cos(-ang) * 22, side: Math.sin(-ang) * 22 - 6, up: 30 };
            P.swordTipLocal = { fwd: P.rHandLocal.fwd + 14, side: P.rHandLocal.side, up: P.rHandLocal.up };
            P.torsoYaw = dir * (1 - sw * 1.6) * 0.8; P.torsoLeanFwd = 20 + 6 * sw; P.crouchZ = -8;
          }
          break;
        }
        if (a.step === 1 || a.step === 2) {
          const dir = a.step === 1 ? 1 : -1;
          const sw = eo(c01((p - 0.2) / 0.45));
          sweep(lerp(dir * 2.3, -dir * 1.0, p < 0.2 ? 0 : sw), 42, 104, 30);
          P.torsoYaw = dir * (1 - sw * 1.7) * 0.8; P.crouchZ = -4 * Math.sin(p * Math.PI); P.torsoLeanFwd = 7 * sw;
        } else {
          const wind = c01(p / 0.3), sw = ei(c01((p - 0.3) / 0.25));
          grip(8, 8, lerp(54, 92, wind) - sw * 50, lerp(10, -22, wind) + sw * 100, 4, lerp(70, 150, wind) - sw * 146);
          P.torsoLeanFwd = lerp(0, -7, wind) + sw * 20; P.crouchZ = -3 * sw;
        }
        break;
      }
      case 'q': {
        const p = c01(a.t / a.dur);
        const wind = c01(p / 0.3), sw = eo(c01((p - 0.3) / 0.3));
        sweep(lerp(2.5, -1.2, p < 0.3 ? 0 : sw), 44, 118, 28);
        P.torsoYaw = lerp(1.0, -0.8, p < 0.3 ? wind * 0.2 : sw); P.torsoLeanFwd = 4 + 12 * sw; P.crouchZ = -5 * Math.sin(p * Math.PI);
        break;
      }
      case 'w': {
        if (a.phase === 'throw') {
          const s = c01(a.phaseT / 0.28);
          grip(lerp(8, 30, eo(s)), 8, lerp(52, 60, s), lerp(30, 112, eo(s)), 4, lerp(70, 62, s));
          P.torsoLeanFwd = 8 * s; P.torsoYaw = -0.4 * s;
        } else if (a.phase === 'pull') {
          grip(30, 6, 50, 116, 4, 44); P.torsoLeanFwd = 24; P.crouchZ = -8;
        } else if (a.phase === 'slam') {
          const s = ei(c01(a.phaseT / 0.14));
          grip(10, 8, lerp(98, 40, s), lerp(-8, 100, s), 4, lerp(170, 6, s)); P.torsoLeanFwd = lerp(-6, 20, s); P.crouchZ = -8 * s;
        } else {
          grip(14, 10, 46, 40, 14, 70); P.torsoLeanFwd = 4;
        }
        break;
      }
      case 'e': {
        // Lethal Spin: braced low, scythe held out flat while the body whirls; a crossing slash to finish
        if (a.t < a.spinDur) { grip(26, 8, 50, 112, 0, 46); P.torsoLeanFwd = 10; P.crouchZ = -9; P.headPitchZ = -2; }
        else { const s = eo(c01((a.t - a.spinDur) / 0.25)); grip(lerp(26, 12, s), 8, lerp(50, 98, s), lerp(112, 0, s), 4, lerp(46, 170, s)); P.torsoLeanFwd = lerp(10, -6, s); P.crouchZ = -4; }
        break;
      }
      case 'qs': {
        if (a.phase === 'hop') { const s = c01(a.phaseT / 0.34); grip(8, 8, lerp(60, 100, s), lerp(0, 8, s), 6, lerp(100, 176, s)); P.torsoLeanFwd = -4; P.crouchZ = 2; }
        else { const s = ei(c01(a.phaseT / 0.12)); grip(10, 8, lerp(100, 38, s), lerp(8, 108, s), 4, lerp(176, 4, s)); P.torsoLeanFwd = lerp(-6, 26, s); P.crouchZ = -10 * s; }
        break;
      }
      case 'vq': {
        if (a.phase === 'dash') { claws(P, 6, 26, 30); P.torsoLeanFwd = 30; P.crouchZ = -12; }
        else {
          const k = Math.sin(a.phaseT * 55) * 1;
          P.rHandLocal = { fwd: 26 + k * 6, side: 8 + k * 14, up: 40 + k * 6 }; P.lHandLocal = { fwd: 26 - k * 6, side: -8 - k * 14, up: 40 - k * 6 };
          P.swordTipLocal = { fwd: 40, side: 10, up: 40 }; P.torsoLeanFwd = 24; P.crouchZ = -9; P.torsoYaw = k * 0.5;
        }
        break;
      }
      case 'vw': {
        const w = c01(a.t / 0.28);
        if (a.t < 0.28) { claws(P, 8, lerp(40, 100, eo(w)), 30); P.torsoLeanFwd = -10 * w; }
        else { const s = ei(c01((a.t - 0.28) / 0.1)); claws(P, lerp(8, 36, s), lerp(100, 8, s), 26); P.torsoLeanFwd = lerp(-10, 28, s); P.crouchZ = -11 * s; }
        break;
      }
      case 've': {
        const o = eo(c01(a.t / 0.5));
        P.rHandLocal = { fwd: 40 * o + 6, side: 12, up: lerp(46, 14, o) }; P.lHandLocal = { fwd: 4, side: -26, up: lerp(40, 96, o) };
        P.swordTipLocal = { fwd: P.rHandLocal.fwd + 12, side: 12, up: P.rHandLocal.up - 4 };
        P.torsoLeanFwd = 14 * o; P.crouchZ = -6 * o; P.torsoYaw = -0.3 * o;
        break;
      }
      case 'vr': {
        const o = eo(c01(a.t / 0.5));
        P.rHandLocal = { fwd: 2, side: 34, up: 60 + 40 * o }; P.lHandLocal = { fwd: 2, side: -34, up: 60 + 40 * o };
        P.swordTipLocal = { fwd: 2, side: 44, up: 110 };
        P.torsoLeanFwd = -16 * o; P.headPitchZ = 7 * o; P.torsoYaw = Math.sin(a.t * 20) * 0.04;
        break;
      }
      case 'vf': {
        if (a.phase === 'lunge') { claws(P, 40, 34, 24); P.torsoLeanFwd = 30; P.crouchZ = -12; }
        else { const s = ei(c01(a.phaseT / 0.12)); claws(P, lerp(40, 22, s), lerp(40, 22, s), lerp(24, 6, s)); P.torsoLeanFwd = lerp(30, 20, s); P.headPitchZ = -5 * s; P.crouchZ = -10; }
        break;
      }
      case 'r': {
        if (a.phase === 'rise') { const s = eo(a.phaseT / 0.4); grip(6, 8, lerp(50, 96, s), 0, 6, lerp(80, 190, s)); }
        else if (a.phase === 'spin') {
          const ang = a.spin;
          P.rHandLocal = { fwd: Math.cos(ang) * 20, side: Math.sin(ang) * 20, up: 70 };
          P.lHandLocal = { fwd: Math.cos(ang) * 15, side: Math.sin(ang) * 15 - 4, up: 68 };
          P.swordTipLocal = { fwd: Math.cos(ang) * 112, side: Math.sin(ang) * 112, up: 56 };
          P.torsoYaw = Math.sin(ang) * 0.5; P.torsoLeanFwd = 8;
        } else if (a.phase === 'fall') { grip(10, 8, 80, 8, 4, 160); P.torsoLeanFwd = 14; }
        else { grip(34, 6, 36, 100, 4, 4); P.torsoLeanFwd = 22; P.crouchZ = -9; }
        break;
      }
      case 'a': {
        if (this.form === 'void') claws(P, -8, 30, 36); else grip(-4, 18, 34, -76, 22, 14);
        P.torsoLeanFwd = 26; P.crouchZ = -11; P.torsoYaw = 0.35;
        break;
      }
      case 's': {
        // arm snaps out with the throw, holds while the line is out, then eases back (no snap when the hook lands)
        const ext = a.phase === 'throw' ? eo(c01(a.phaseT / 0.2)) : 1 - c01(a.phaseT / 0.25) * 0.85;
        const e2 = a.phase === 'throw' ? ext : ext;
        if (this.form === 'void') claws(P, lerp(8, 34, e2), lerp(44, 50, e2), 20);
        else grip(lerp(8, 30, e2), 8, 50, lerp(30, 112, e2), 6, 56);
        P.torsoLeanFwd = 8 * e2;
        break;
      }
      case 'd': {
        const p = c01(a.t / a.dur);
        if (p < 0.45) { grip(14, 12, 42, 22, 28, 50); P.torsoLeanFwd = -5; P.crouchZ = -6; P.torsoYaw = 0.5; }
        else { const s = eo((p - 0.45) / 0.3); sweep(lerp(1.4, -0.6, s), 44, 104, 40); P.torsoLeanFwd = 10 * s; P.torsoYaw = lerp(0.5, -0.6, s); }
        break;
      }
      case 'f': {
        if (a.phase === 'gather') {
          // arms flung wide and up, calling the dead; the scythe held out to the side
          const g = eo(c01(a.phaseT / 0.5));
          P.rHandLocal = { fwd: 6, side: lerp(14, 40, g), up: lerp(46, 92, g) }; P.lHandLocal = { fwd: 6, side: lerp(-10, -40, g), up: lerp(40, 92, g) };
          P.swordTipLocal = { fwd: 6, side: lerp(24, 120, g), up: lerp(70, 104, g) };
          P.torsoLeanFwd = -10 * g; P.headPitchZ = 6 * g; P.crouchZ = -2; P.torsoYaw = Math.sin(a.phaseT * 25) * 0.04 * g;
        } else {
          const s = ei(c01(a.phaseT / 0.16));     // both arms rip forward and down
          P.rHandLocal = { fwd: lerp(6, 34, s), side: lerp(40, 10, s), up: lerp(92, 26, s) }; P.lHandLocal = { fwd: lerp(6, 34, s), side: lerp(-40, -10, s), up: lerp(92, 26, s) };
          P.swordTipLocal = { fwd: lerp(6, 110, s), side: lerp(120, 12, s), up: lerp(104, 22, s) };
          P.torsoLeanFwd = lerp(-10, 24, s); P.crouchZ = -9 * s; P.headPitchZ = -3 * s;
        }
        break;
      }
      case 'z': {
        const p = c01(a.t / a.dur);
        const c = Math.sin(c01(p / 0.55) * Math.PI * 0.5);
        P.rHandLocal = { fwd: 4, side: 30, up: 70 + 22 * c };
        P.lHandLocal = { fwd: 4, side: -30, up: 70 + 22 * c };
        P.swordTipLocal = { fwd: -40, side: 44, up: 40 };
        P.torsoLeanFwd = -14 * c; P.headPitchZ = 6 * c; P.crouchZ = -8 * (1 - c) - 2;
        P.torsoYaw = Math.sin(a.t * 40) * 0.05;
        break;
      }
      case 't': {
        if (a.phase === 'leap') { grip(8, 8, 98, 0, 6, 190); P.torsoLeanFwd = -4; }
        else if (a.phase === 'bind') { grip(12, 8, 90, 8, 4, 160); P.torsoLeanFwd = 10; P.crouchZ = -6; }
        else if (a.phase === 'flurry') {
          const an = (a.cuts % 2 ? 1 : -1) * (0.7 + (a.cuts % 3) * 0.3);
          sweep(an, 52, 112, 40); P.torsoYaw = an * 0.6; P.torsoLeanFwd = 10; P.crouchZ = -5;
        } else { const s = ei(c01(a.phaseT / 0.36)); grip(10, 8, lerp(104, 40, s), lerp(-8, 100, s), 4, lerp(176, 6, s)); P.torsoLeanFwd = lerp(-8, 24, s); P.crouchZ = -10 * s; }
        break;
      }
      case 'tv': {
        const c = a.sphere || 0;
        if (a.phase === 'charge') {
          // both arms thrown up, scythe held flat overhead like an offering to the sphere
          P.rHandLocal = { fwd: 4, side: 24, up: 96 + 8 * c };
          P.lHandLocal = { fwd: 4, side: -24, up: 96 + 8 * c };
          P.swordTipLocal = { fwd: 4, side: 110, up: 98 + 8 * c };
          P.torsoLeanFwd = -18 - c * 4; P.headPitchZ = 8; P.crouchZ = -2;
          P.torsoYaw = Math.sin(a.phaseT * 30) * 0.03 * (0.3 + c);
        } else {
          const s = ei(c01(a.phaseT / 0.2));
          grip(lerp(4, 34, s), 8, lerp(98, 56, s), lerp(4, 112, s), 4, lerp(98, 50, s)); P.torsoLeanFwd = lerp(-18, 24, s); P.crouchZ = -9 * s;
        }
        break;
      }
      default: break;
    }
  };

  // Idle / walk / hit reactions; Voidform is a hunched, clawing, grotesque scuttle.
  RP.poseNoAct = function (P, grip) {
    const st = this.state;
    const sd = P.strideDiff || 0;
    const vf = this.vfBlend || 0;
    const t = performance.now() * 0.001;
    if (st === 'idle' || st === 'walk') {
      const bob = st === 'walk' ? Math.abs(sd) : 0;
      // Human: scythe carried low and ready, blade curling over the shoulder
      const h = { rHand: { fwd: 9 + sd * 1.4, side: 15, up: 42 + P.breatheZ * 0.5 - bob }, lHand: { fwd: 4 - sd * 3, side: -9, up: 34 }, tip: { fwd: -16 - sd * 1.5, side: 24, up: 118 - bob * 2 } };
      // Voidform: arms hang forward like something on all-but-four, the scythe drags behind it
      const wob = Math.sin((this.walkPhase || 0)) * (this.walkWeight || 0);
      const v = {
        rHand: { fwd: 24 + sd * 9, side: 14, up: 20 - bob * 1.5 }, lHand: { fwd: 22 - sd * 9, side: -14, up: 18 + wob * 3 },
        tip: { fwd: -62 - sd * 3, side: 22, up: 2 + Math.max(0, wob) * 5 }
      };
      P.rHandLocal = { fwd: lerp(h.rHand.fwd, v.rHand.fwd, vf), side: lerp(h.rHand.side, v.rHand.side, vf), up: lerp(h.rHand.up, v.rHand.up, vf) };
      P.lHandLocal = { fwd: lerp(h.lHand.fwd, v.lHand.fwd, vf), side: lerp(h.lHand.side, v.lHand.side, vf), up: lerp(h.lHand.up, v.lHand.up, vf) };
      P.swordTipLocal = { fwd: lerp(h.tip.fwd, v.tip.fwd, vf), side: lerp(h.tip.side, v.tip.side, vf), up: lerp(h.tip.up, v.tip.up, vf) };
      P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 3 + vf * (20 + bob * 4);
      P.crouchZ = (P.crouchZ || 0) - 1.5 - vf * (9 + bob * 2.5);
      P.headPitchZ = (P.headPitchZ || 0) - vf * 4;
      P.torsoYaw = (P.torsoYaw || 0) + vf * (wob * 0.55 + Math.sin(t * 9) * 0.04 * (this.walkWeight || 0));
      return;
    }
    if (st === 'hit_stagger') {
      const f = Math.sin(c01(P.p) * Math.PI);
      P.rHandLocal = { fwd: 8, side: 20, up: 28 }; P.lHandLocal = { fwd: 6, side: -6, up: 30 };
      P.swordTipLocal = { fwd: 44, side: 52, up: 4 }; P.torsoLeanFwd = -9 * f; P.crouchZ = -4 * f; P.headPitchZ = -3 * f;
    } else if (st === 'hit_knockback') {
      const r = 1 - c01(P.p) * 0.6;
      P.rHandLocal = { fwd: 6, side: 26, up: 40 }; P.lHandLocal = { fwd: 4, side: -22, up: 38 };
      P.swordTipLocal = { fwd: 20, side: 70, up: 22 }; P.torsoLeanFwd = -13 * r; P.crouchZ = -8 * r;
    } else if (st === 'hit_knockdown') {
      if (P.p < 0.46) { P.rHandLocal = { fwd: -10, side: 30, up: 52 }; P.lHandLocal = { fwd: -6, side: -26, up: 50 }; P.swordTipLocal = { fwd: -40, side: 74, up: 70 }; P.torsoLeanFwd = -22; P.crouchZ = -6; }
      else { P.rHandLocal = { fwd: 4, side: 34, up: 10 }; P.lHandLocal = { fwd: 2, side: -30, up: 12 }; P.swordTipLocal = { fwd: 30, side: 80, up: 2 }; P.torsoLeanFwd = -30; P.crouchZ = -22; }
    } else if (st === 'wakeup_roll') {
      P.rHandLocal = { fwd: 10, side: 10, up: 20 }; P.lHandLocal = { fwd: 10, side: -6, up: 20 };
      P.swordTipLocal = { fwd: -40, side: 30, up: 14 }; P.torsoLeanFwd = 32; P.crouchZ = -20;
    } else if (st === 'space_dash') {
      P.rHandLocal = { fwd: 4, side: 16, up: 34 }; P.lHandLocal = { fwd: 20, side: -10, up: 40 };
      P.swordTipLocal = { fwd: -78, side: 22, up: 16 }; P.torsoLeanFwd = 26; P.crouchZ = -12; P.torsoYaw = 0.4;
    } else if (st === 'clash_lock' || this.clashQteActive) {
      grip(30, 6, 64, 18, 0, 140); P.torsoLeanFwd = 10; P.crouchZ = -8 + Math.sin(performance.now() * 0.05) * 0.6;
    }
  };

  // ---------------------------------------------------------------------------
  // draw(): whole-body Voidform lurch + ground aura + overlays
  // ---------------------------------------------------------------------------
  const baseDraw = BreakerPlayer25D.prototype.draw;
  RP.draw = function (ctx) {
    if (this.hp <= 0) { baseDraw.call(this, ctx); return; }
    this.drawGround(ctx);
    this.drawShades(ctx);
    const vf = this.vfBlend || 0;
    const t = performance.now() * 0.001;
    const lurch = vf * (this.walkWeight || 0);
    ctx.save();
    if (vf > 0.02) {
      const sc = 1 + vf * 0.07;
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.sin(this.walkPhase || 0) * 0.085 * lurch + Math.sin(t * 7.3) * 0.012 * vf);
      ctx.scale(sc, sc);
      ctx.translate(-this.x, -this.y);
      // frame-skippy jitter while moving, like it is not entirely in control of the legs
      if (lurch > 0.3 && ((performance.now() / 70) | 0) % 5 === 0) ctx.translate((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.2);
    }
    baseDraw.call(this, ctx);
    ctx.restore();
    this.drawOverlays(ctx);
  };

  RP.drawGround = function (ctx) {
    const vf = this.vfBlend || 0, a = this.act;
    const charging = a && a.kind === 'tv' && a.phase === 'charge';
    if (vf < 0.03 && !charging) return;
    const t = performance.now() * 0.001;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(1, TILT());
    const R = 46 + vf * 20 + (charging ? a.sphere * 160 : 0);
    ctx.globalAlpha = Math.min(1, vf + (charging ? 1 : 0)) * 0.55;
    ctx.fillStyle = '#12020a';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = Math.min(1, vf + (charging ? 1 : 0)) * 0.8;
    ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.stroke();
    // blood tendrils writhing out along the floor
    ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const an = i / 7 * Math.PI * 2 + t * 0.4, w = Math.sin(t * 3 + i * 1.7);
      ctx.beginPath(); ctx.moveTo(Math.cos(an) * 14, Math.sin(an) * 14);
      ctx.quadraticCurveTo(Math.cos(an + 0.5 * w) * R * 0.7, Math.sin(an + 0.5 * w) * R * 0.7, Math.cos(an + 0.2 * w) * R * (0.95 + 0.1 * w), Math.sin(an + 0.2 * w) * R * (0.95 + 0.1 * w));
      ctx.stroke();
    }
    ctx.restore();
  };

  RP.drawShades = function (ctx) {
    if (!this.shades.length) return;
    for (const s of this.shades) {
      const k = 1 - s.t / s.dur;
      ctx.save();
      ctx.globalAlpha = 0.5 * k;
      ctx.translate(s.x, s.y);
      ctx.fillStyle = '#12020a'; ctx.strokeStyle = this.form === 'void' ? '#ff1a3c' : '#e11d48'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, -30, 11, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -60, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (s.burst && !s.done) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(s.t * 30);
        ctx.beginPath(); ctx.arc(0, 0, 30 + s.t * 90, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  };

  RP.worldToScreenY = function (y, z) { return y - (z || 0); };

  RP.drawOverlays = function (ctx) {
    const a = this.act;
    const showVfx = this.isLocal || !window.fx || window.fx.showAllyVfx !== false;
    const boss = this.tether && this.tether.boss;
    // Siphon Chain: a beaded chain to the boss with blood running back along it
    if (this.tether && boss && boss.hp > 0 && this.tether.connect > 0) {
      const t = performance.now() * 0.001;
      const x0 = this.x, y0 = this.y - 44, x1 = boss.x, y1 = boss.y - 44;
      const k = this.tether.connect;
      const ex = lerp(x0, x1, k), ey = lerp(y0, y1, k);
      const dx = ex - x0, dy = ey - y0, L = Math.hypot(dx, dy) || 1;
      const sag = 18 * Math.min(1, 260 / L);
      ctx.save();
      ctx.strokeStyle = '#2a0a12'; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + ex) / 2, (y0 + ey) / 2 + sag, ex, ey); ctx.stroke();
      ctx.strokeStyle = this.form === 'void' ? '#ff1a3c' : '#e11d48'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 40;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + ex) / 2, (y0 + ey) / 2 + sag, ex, ey); ctx.stroke();
      ctx.setLineDash([]);
      // blood beads flowing boss -> reaper
      ctx.fillStyle = '#fb7185';
      for (let i = 0; i < 6; i++) {
        const u = 1 - (((t * 1.4) + i / 6) % 1);
        const qx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * ((x0 + ex) / 2) + u * u * ex;
        const qy = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * ((y0 + ey) / 2 + sag) + u * u * ey;
        ctx.beginPath(); ctx.arc(qx, qy, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Gravebound Hook (the scythe on a chain) / Siphon Chain (a barbed hook) / Blood Lash (a barbed tendril): the thrown line
    if (a && (a.kind === 'w' || a.kind === 's') && a.tipX !== undefined && a.phase !== 'hold') {
      ctx.save();
      const hx = this.x, hy = this.y - 44, tx = a.tipX, ty = a.tipY - 44, void_ = this.form === 'void';
      ctx.lineCap = 'round';
      if (void_ && a.kind === 's') {            // wavy tendril
        const t = performance.now() * 0.02, dx = tx - hx, dy = ty - hy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        for (const [w, col] of [[7, '#1a0408'], [3, '#ff1a3c']]) {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(hx, hy);
          for (let i = 1; i <= 14; i++) { const u = i / 14, o = Math.sin(u * 9 - t) * 9 * Math.sin(u * Math.PI); ctx.lineTo(hx + dx * u + nx * o, hy + dy * u + ny * o); }
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = '#2a0a12'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      }
      const ang = Math.atan2(ty - hy, tx - hx);
      if (a.kind === 'w') this.drawSickle(ctx, tx, ty, ang, 0.95, 1);
      else {            // barb
        ctx.translate(tx, ty); ctx.rotate(ang); ctx.fillStyle = void_ ? '#ff1a3c' : '#cfc7b4'; ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-4, -6); ctx.lineTo(-1, 0); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    // Lethal Spin: the dust cloud of a thousand cuts around the reaper
    if (a && a.kind === 'e' && a.t < a.spinDur) {
      ctx.save(); ctx.translate(this.x, this.y - 20); ctx.scale(1, TILT() * 1.1);
      const k = a.emp ? 1.25 : 1;
      ctx.globalAlpha = 0.42; ctx.fillStyle = '#10050a'; ctx.beginPath(); ctx.arc(0, 0, 150 * k, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.lineCap = 'round';
      // two batched paths (white and red) instead of nine separate strokes
      for (const [col, w] of [['#ffffff', 2], [this.col(), 3.5]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const an = Math.random() * Math.PI * 2, r0 = 20 + Math.random() * 70, r1 = r0 + 40 + Math.random() * 70 * k;
          ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); ctx.lineTo(Math.cos(an + 0.4) * r1, Math.sin(an + 0.4) * r1);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // the scythe you cast aside as the form begins
    if (this.dropped) {
      const d = this.dropped, k = Math.max(0, 1 - Math.max(0, d.t - 0.9) / 0.9);
      ctx.save(); ctx.globalAlpha = k; ctx.translate(d.x, d.y - 4); ctx.rotate(d.ang);
      const L = lookOf(this);
      ctx.strokeStyle = '#06030a'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(50, 0); ctx.stroke();
      ctx.strokeStyle = L.shaft; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(50, 0); ctx.stroke();
      ctx.translate(50, 0); ctx.scale(0.82, 0.82); this.paintBlade(ctx, L, 0, 1);
      ctx.restore();
      if (window.fx && d.t > 0.9 && Math.random() < 0.5) window.fx.addDragSparks(d.x + (Math.random() - 0.5) * 80, d.y, -Math.PI / 2, 1, true, '#7f1d1d');   // it dissolves into blood
    }
    this.drawVfx(ctx);
    // Reaper's Verdict chains around the boss
    if (a && a.kind === 't' && a.boss && (a.phase === 'bind' || a.phase === 'flurry')) {
      const bs = a.boss;
      ctx.save();
      ctx.lineCap = 'round';
      const grow = a.phase === 'bind' ? c01(a.phaseT / 0.3) : 1;
      for (let i = 0; i < 6; i++) {
        const an = i / 6 * Math.PI * 2 + 0.3;
        const sx = bs.x + Math.cos(an) * 220, sy = bs.y + Math.sin(an) * 220 * TILT();
        const ex = lerp(sx, bs.x, grow * 0.92), ey = lerp(sy, bs.y - 40, grow * 0.92);
        ctx.strokeStyle = '#1a0408'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + ex) / 2, Math.min(sy, ey) - 60, ex, ey); ctx.stroke();
        ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + ex) / 2, Math.min(sy, ey) - 60, ex, ey); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }
    // Crimson Eclipse sphere
    if (a && a.kind === 'tv') this.drawEclipseSphere(ctx, a);
  };

  // Timed world effects (this.vfx): bone spikes, the Rift Maw, falling spears, souls, the skull flash, the soul-tear, bursts, jaws.
  RP.drawVfx = function (ctx) {
    if (!this.vfx.length) return;
    const showVfx = this.isLocal || !window.fx || window.fx.showAllyVfx !== false;
    if (!showVfx) return;
    const T = TILT();
    for (const e of this.vfx) {
      const u = c01(e.t / e.dur);
      ctx.save();
      if (e.kind === 'spike') {
        const rise = eo(e.t / 0.18), fade = 1 - c01((u - 0.65) / 0.35), h = e.h * rise;
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(10,2,6,0.7)'; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.w * 1.6, e.w * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        const lx = (e.lean || 0) * h;            // each fang leans a little, alternating, so the row looks like a jaw of teeth
        // a hot glow pooling on the floor around the base
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,26,60,0.28)'; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.w * 2.1, e.w * 0.95, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
        // little side thorns
        ctx.fillStyle = '#1a0508'; ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
        for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(e.x + sd * e.w * 0.5, e.y); ctx.lineTo(e.x + sd * e.w * 1.5 + lx * 0.4, e.y - h * 0.42); ctx.lineTo(e.x + sd * e.w * 0.2, e.y - h * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        // the main fang
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(e.x - e.w, e.y); ctx.lineTo(e.x - e.w * 0.2 + lx * 0.4, e.y - h * 0.55); ctx.lineTo(e.x + 2 + lx, e.y - h); ctx.lineTo(e.x + e.w * 0.3 + lx * 0.4, e.y - h * 0.5); ctx.lineTo(e.x + e.w, e.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(e.x, e.y - 4); ctx.lineTo(e.x + 2 + lx * 0.9, e.y - h * 0.85); ctx.stroke();
        // a molten glow climbing the spike and a white-hot tip
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,40,70,0.7)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(e.x, e.y - 2); ctx.lineTo(e.x + lx, e.y - h * 0.97); ctx.stroke();
        ctx.fillStyle = '#ffe4e6'; ctx.beginPath(); ctx.arc(e.x + lx, e.y - h * 0.97, e.last ? 5 : 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (e.kind === 'maw' || e.kind === 'burst') {
        // (flat floor decals: drawn by drawFloorVfx under the characters, so they never cover what they hit)
      } else if (e.kind === 'spear') {
        const fallT = e.t / e.fall;
        if (fallT < 1) {
          const y = e.y - 420 * (1 - ei(fallT));
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,40,70,0.55)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(e.x, y - 120); ctx.lineTo(e.x, y); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#1a0508'; ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(e.x, y + 18); ctx.lineTo(e.x - 8, y - 14); ctx.lineTo(e.x + 8, y - 14); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.globalAlpha = 0.45; ctx.strokeStyle = '#ff1a3c'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(e.x, e.y, 30, 30 * T, 0, 0, Math.PI * 2); ctx.stroke();   // landing marker
        } else {
          const fade = 1 - c01((u - 0.6) / 0.4);
          ctx.globalAlpha = fade; ctx.strokeStyle = '#1a0508'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(e.x, e.y + 4); ctx.lineTo(e.x + 2, e.y - 120); ctx.stroke();
          ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + 2, e.y - 118); ctx.stroke();
          ctx.fillStyle = '#ff1a3c'; ctx.beginPath(); ctx.moveTo(e.x + 2, e.y - 138); ctx.lineTo(e.x - 6, e.y - 112); ctx.lineTo(e.x + 10, e.y - 112); ctx.closePath(); ctx.fill();
        }
      } else if (e.kind === 'soul') {
        const s = e.rip ? eo(u) : ei(u);
        const mx = (e.x + e.tx) / 2 + Math.sin(e.hue * 9) * 50, my = (e.y + e.ty) / 2 - 50 - e.hue * 40;
        const x = (1 - s) * (1 - s) * e.x + 2 * (1 - s) * s * mx + s * s * e.tx, y = (1 - s) * (1 - s) * e.y + 2 * (1 - s) * s * my + s * s * e.ty;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, u * 5) * (1 - c01((u - 0.85) / 0.15));
        const r = 4 + e.hue * 4;
        ctx.fillStyle = e.hue < 0.5 ? 'rgba(255,90,115,0.9)' : 'rgba(255,200,215,0.9)';
        ctx.beginPath(); ctx.arc(x, y - 30, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,60,90,0.35)'; ctx.beginPath(); ctx.arc(x, y - 30, r * 2.4, 0, Math.PI * 2); ctx.fill();
        // wisp tail
        ctx.strokeStyle = 'rgba(255,120,140,0.5)'; ctx.lineWidth = r * 0.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y - 30);
        const s2 = Math.max(0, s - 0.12); ctx.lineTo((1 - s2) * (1 - s2) * e.x + 2 * (1 - s2) * s2 * mx + s2 * s2 * e.tx, (1 - s2) * (1 - s2) * e.y + 2 * (1 - s2) * s2 * my + s2 * s2 * e.ty - 30); ctx.stroke();
      } else if (e.kind === 'skull') {
        ctx.translate(e.x, e.y - u * 40); ctx.globalAlpha = 0.8 * (1 - u) * Math.min(1, u * 8); ctx.globalCompositeOperation = 'lighter';
        const R = 34 + u * 26;
        ctx.fillStyle = 'rgba(255,70,100,0.55)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-R * 0.45, R * 0.6, R * 0.9, R * 0.55);
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#12020a';
        ctx.beginPath(); ctx.ellipse(-R * 0.36, -R * 0.1, R * 0.22, R * 0.28, 0, 0, Math.PI * 2); ctx.ellipse(R * 0.36, -R * 0.1, R * 0.22, R * 0.28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, R * 0.1); ctx.lineTo(-R * 0.1, R * 0.34); ctx.lineTo(R * 0.1, R * 0.34); ctx.closePath(); ctx.fill();
      } else if (e.kind === 'rift') {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - u; ctx.lineJoin = 'round';
        const seed = Math.floor(e.t * 30);
        for (const [w, col] of [[9, 'rgba(255,40,70,0.35)'], [2.2, 'rgba(255,220,230,0.95)']]) {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(e.x, e.y - 40);
          for (let i = 1; i < 12; i++) { const k = i / 12, j = (Math.sin(seed * 12.9 + i * 7.3) * 18) * Math.sin(k * Math.PI); ctx.lineTo(rLerpR(e.x, e.tx, k) + j, rLerpR(e.y - 40, e.ty - 40, k) + j * 0.6); }
          ctx.lineTo(e.tx, e.ty - 40); ctx.stroke();
        }
      } else if (e.kind === 'jaws') {
        const open = u < 0.35 ? 1 - u / 0.35 : 0, fade = 1 - c01((u - 0.55) / 0.45);
        ctx.translate(e.x, e.y - 40); ctx.rotate(e.ang); ctx.globalAlpha = fade;
        ctx.fillStyle = '#f3e6d8'; ctx.strokeStyle = '#2a0a10'; ctx.lineWidth = 1.4;
        for (const sgn of [-1, 1]) {
          const off = sgn * (4 + open * 36);
          for (let i = 0; i < 6; i++) { const x = -40 + i * 16; ctx.beginPath(); ctx.moveTo(x, off); ctx.lineTo(x + 8, off - sgn * 20); ctx.lineTo(x + 16, off); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        }
        ctx.fillStyle = 'rgba(255,26,60,0.4)'; ctx.fillRect(-44, -6, 92, 12);
      }
      ctx.restore();
    }
  };
  const rLerpR = (a, b, t) => a + (b - a) * t;

  // The Rift Maw and the Voidform bursts are decals on the floor: main.js draws them before the characters are sorted in,
  // so the boss (or anyone standing in them) is always drawn on top.
  RP.drawFloorVfx = function (ctx) {
    const showVfx = this.isLocal || !window.fx || window.fx.showAllyVfx !== false;
    if (!showVfx) return;
    const T = TILT();
    // Reaper's Verdict: a blood-red judgement sigil burns into the floor under the bound boss
    const a = this.act;
    if (a && a.kind === 't' && a.boss && (a.phase === 'bind' || a.phase === 'flurry' || a.phase === 'slam')) {
      const bs = a.boss, t = performance.now() * 0.001;
      const grow = a.phase === 'bind' ? eo(c01(a.phaseT / 0.35)) : 1;
      const fade = a.phase === 'slam' ? 1 - c01(a.phaseT / 1.0) * 0.8 : 1;
      const R = 260 * grow;
      ctx.save(); ctx.translate(bs.x, bs.y); ctx.scale(1, T); ctx.lineCap = 'round';
      ctx.globalAlpha = 0.42 * fade; ctx.fillStyle = '#2a0410'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = '#ff2a4a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.setLineDash([22, 14]); ctx.lineDashOffset = t * 60; ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([8, 10]); ctx.lineDashOffset = -t * 80; ctx.beginPath(); ctx.arc(0, 0, R * 0.58, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath();            // an eight-pointed judgement star turning slowly
      for (let i = 0; i < 8; i++) { const an = t * 0.5 + i * Math.PI / 4; ctx.moveTo(Math.cos(an) * R * 0.2, Math.sin(an) * R * 0.2); ctx.lineTo(Math.cos(an) * R * 0.97, Math.sin(an) * R * 0.97); }
      ctx.globalAlpha = 0.5 * fade; ctx.stroke();
      ctx.beginPath();            // inscribed square, counter-turning
      for (let i = 0; i < 4; i++) { const an = -t * 0.8 + i * Math.PI / 2 + Math.PI / 4; const x = Math.cos(an) * R * 0.58, y = Math.sin(an) * R * 0.58; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    if (!this.vfx || !this.vfx.length) return;
    for (const e of this.vfx) {
      if (e.kind !== 'maw' && e.kind !== 'burst') continue;
      const u = c01(e.t / e.dur);
      ctx.save();
      if (e.kind === 'maw') {
        const open = c01(e.t / e.open), closing = e.t > e.open ? c01((e.t - e.open) / 0.16) : 0, fade = e.t > e.open ? 1 - c01((e.t - e.open - 0.16) / (e.dur - e.open - 0.16)) : 1;
        const R = lerp(14, 128, eo(open)) * (1 - closing * 0.9);
        ctx.translate(e.x, e.y); ctx.scale(1, T); ctx.globalAlpha = fade;
        // scorched rim on the stone, then the pit itself
        ctx.fillStyle = 'rgba(60,4,12,0.5)'; ctx.beginPath(); ctx.arc(0, 0, R * 1.18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#050106'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = fade * 0.55; ctx.fillStyle = '#7f0f22'; ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2); ctx.fill();   // glow deep in the throat
        ctx.globalAlpha = fade;
        ctx.strokeStyle = '#ff1a3c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#f3e6d8'; ctx.strokeStyle = '#2a0a10'; ctx.lineWidth = 1;
        const nT = 16;      // fangs ring the rim and clamp inward as it shuts
        for (let i = 0; i < nT; i++) {
          const an = i / nT * Math.PI * 2, len = 22 + (i % 2) * 10, r0 = R, r1 = R - len * (0.4 + closing * 1.8);
          ctx.beginPath(); ctx.moveTo(Math.cos(an - 0.09) * r0, Math.sin(an - 0.09) * r0); ctx.lineTo(Math.cos(an) * Math.max(0, r1), Math.sin(an) * Math.max(0, r1)); ctx.lineTo(Math.cos(an + 0.09) * r0, Math.sin(an + 0.09) * r0); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        if (open < 1) { ctx.globalAlpha = fade * 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2); ctx.stroke(); }
      } else {
        ctx.globalAlpha = 1 - u; ctx.translate(e.x, e.y); ctx.scale(1, T);
        ctx.strokeStyle = '#ff1a3c'; ctx.lineWidth = 5 * (1 - u) + 1; ctx.beginPath(); ctx.arc(0, 0, e.r * eo(u), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#7f1d1d'; for (let i = 0; i < 10; i++) { const an = i * 0.63 + e.x, rr = e.r * eo(u) * (0.5 + (i % 3) * 0.25); ctx.beginPath(); ctx.arc(Math.cos(an) * rr, Math.sin(an) * rr, 3 * (1 - u) + 1, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }
  };

  RP.drawWave = function (ctx, w) {
    const k = c01(w.life / w.maxLife);
    ctx.save();
    ctx.translate(w.x, w.y - 30);
    ctx.rotate(Math.atan2(w.vy / TILT(), w.vx));
    ctx.scale(1, TILT() * 1.25);
    ctx.globalAlpha = Math.min(1, k * 2.2);
    const R = w.r * 1.15;
    for (let i = 3; i >= 0; i--) {   // afterimages trailing behind the crescent
      ctx.save(); ctx.translate(-i * 22, 0); ctx.globalAlpha *= (1 - i * 0.22);
      ctx.fillStyle = i === 0 ? '#07030a' : '#2a0610';
      ctx.beginPath(); ctx.arc(0, 0, R, -1.15, 1.15); ctx.arc(-R * 0.32, 0, R * 0.9, 1.0, -1.0, true); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = '#ff2a4a'; ctx.lineWidth = 6 * (w.size || 1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, R, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle = '#ffd0d6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R, -1.0, 1.0); ctx.stroke();
    ctx.restore();
  };

  RP.drawEclipseSphere = function (ctx, a) {
    const t = performance.now() * 0.001;
    ctx.save();
    if (a.phase === 'charge') {
      const c = a.sphere;
      const cx = this.x, cy = this.y - 150 - this.jumpZ * 0.5;
      const r = 10 + 92 * eo(c);
      // aim line (only the caster needs it; it shows the locked direction)
      if (this.isLocal) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 8);
        ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 60;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(a.ang) * 760, this.y + Math.sin(a.ang) * 760 * TILT()); ctx.stroke();
        ctx.setLineDash([]); ctx.lineWidth = 120 * 0.18; ctx.globalAlpha = 0.07; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(a.ang) * 760, this.y + Math.sin(a.ang) * 760 * TILT()); ctx.stroke();
        ctx.restore();
      }
      // -- the arena bleeds into the sphere. Everything below is a handful of batched paths (no per-particle state changes). --
      const T_ = TILT();
      // blood sigil burning into the floor: two counter-turning rings that widen as the charge builds
      ctx.save();
      ctx.translate(this.x, this.y); ctx.scale(1, T_);
      const R0 = 60 + 170 * eo(c);
      ctx.globalAlpha = 0.18 + 0.5 * c; ctx.fillStyle = '#3a0612'; ctx.beginPath(); ctx.arc(0, 0, R0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff2a4a'; ctx.lineWidth = 2 + 3 * c; ctx.globalAlpha = 0.45 + 0.4 * c;
      ctx.beginPath(); ctx.arc(0, 0, R0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([16, 12]); ctx.lineDashOffset = t * 50; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R0 * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([6, 14]); ctx.lineDashOffset = -t * 70; ctx.beginPath(); ctx.arc(0, 0, R0 * 0.48, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath();                                   // rotating star points of the sigil
      for (let i = 0; i < 6; i++) { const an = t * 0.6 + i * Math.PI / 3; ctx.moveTo(Math.cos(an) * R0 * 0.2, Math.sin(an) * R0 * 0.2); ctx.lineTo(Math.cos(an) * R0, Math.sin(an) * R0); }
      ctx.globalAlpha = 0.35 * c; ctx.stroke();
      ctx.restore();
      // a dark beam of light dropping onto the caster from the sphere
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(0, cy, 0, this.y);
      beam.addColorStop(0, `rgba(255,40,70,${0.35 * c})`); beam.addColorStop(1, 'rgba(255,40,70,0)');
      ctx.fillStyle = beam; ctx.fillRect(cx - 14 - 22 * c, cy, 28 + 44 * c, this.y - cy);
      // blood streaks spiralling inward (28 of them in ONE stroke)
      ctx.strokeStyle = `rgba(255,70,100,${0.25 + 0.4 * c})`; ctx.lineWidth = 1.6 + c * 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 28; i++) {
        const ph = (t * (0.55 + c * 0.6) + i / 28) % 1, an = i * 2.399 + t * 0.35 + ph * 1.4;
        const d = (1 - ph) * (330 + c * 120) + r * 1.15, d2 = d + 26 + 46 * (1 - ph);
        ctx.moveTo(cx + Math.cos(an) * d2, cy + Math.sin(an) * d2 * 0.62);
        ctx.lineTo(cx + Math.cos(an + 0.07) * d, cy + Math.sin(an + 0.07) * d * 0.62);
      }
      ctx.stroke();
      // corona
      const cor = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * (2.1 + 0.4 * Math.sin(t * 6) * c));
      cor.addColorStop(0, `rgba(255,50,80,${0.45 * c + 0.1})`); cor.addColorStop(1, 'rgba(255,50,80,0)');
      ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      this.paintBloodSphere(ctx, cx, cy, r, t, 1);
      // spiked halo + orbiting droplets (one path each)
      ctx.save(); ctx.strokeStyle = '#ff9aa8'; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.4 * c; ctx.beginPath();
      const sp = 14;
      for (let i = 0; i < sp; i++) { const an = -t * 1.1 + i / sp * Math.PI * 2, r1 = r * 1.12, r2 = r * (1.3 + 0.28 * c + 0.1 * Math.sin(t * 9 + i)); ctx.moveTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1 * 0.9); ctx.lineTo(cx + Math.cos(an) * r2, cy + Math.sin(an) * r2 * 0.9); }
      ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const an = t * (1.5 + i * 0.1) + i * 0.63, rr = r * (1.45 + 0.15 * Math.sin(t * 2 + i));
        const px = cx + Math.cos(an) * rr, py = cy + Math.sin(an) * rr * 0.55, dr = 2 + c * 2.4;
        ctx.moveTo(px + dr, py); ctx.arc(px, py, dr, 0, Math.PI * 2);
      }
      ctx.fill();
      if (c > 0.75) {   // nearly ready: a hard white lens flare
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,220,230,${(c - 0.75) * 3})`; ctx.lineWidth = 2;
        const fl = r * (1.8 + 1.2 * (c - 0.75)); ctx.beginPath(); ctx.moveTo(cx - fl, cy); ctx.lineTo(cx + fl, cy); ctx.moveTo(cx, cy - fl * 0.7); ctx.lineTo(cx, cy + fl * 0.7); ctx.stroke(); ctx.restore();
      }
    } else if (a.thrown) {
      const th = a.thrown, ty = th.y - 90, ca = Math.cos(a.ang), sa = Math.sin(a.ang) * TILT();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // comet tail: a long fading wedge of light behind the sphere
      const tail = ctx.createLinearGradient(th.x, ty, th.x - ca * 520, ty - sa * 520);
      tail.addColorStop(0, 'rgba(255,60,90,0.7)'); tail.addColorStop(1, 'rgba(255,60,90,0)');
      ctx.fillStyle = tail; ctx.beginPath();
      const nx = -sa, ny = ca;
      ctx.moveTo(th.x + nx * 110, ty + ny * 110); ctx.lineTo(th.x - ca * 520, ty - sa * 520); ctx.lineTo(th.x - nx * 110, ty - ny * 110); ctx.closePath(); ctx.fill();
      // shard streaks peeling off it
      ctx.strokeStyle = 'rgba(255,200,215,0.7)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const k = (i * 0.37 + t * 3) % 1, off = ((i * 53) % 21 - 10) * 11, bx = th.x - ca * (60 + k * 420) + nx * off, by = ty - sa * (60 + k * 420) + ny * off; ctx.moveTo(bx, by); ctx.lineTo(bx - ca * 36, by - sa * 36); }
      ctx.stroke();
      const g2 = ctx.createRadialGradient(th.x, ty, 60, th.x, ty, 240); g2.addColorStop(0, 'rgba(255,50,80,0.5)'); g2.addColorStop(1, 'rgba(255,50,80,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(th.x, ty, 240, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      this.paintBloodSphere(ctx, th.x, ty, 118, t, 1);
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#7f1d1d';
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.ellipse(th.x - ca * i * 55, ty - sa * i * 55, 118 - i * 14, (118 - i * 14) * 0.9, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  };

  // A glass-and-blood sphere (also used by the HUD look): dark glass body, swishing blood, bright rim, specular.
  RP.paintBloodSphere = function (ctx, cx, cy, r, t, fill) {
    ctx.save();
    ctx.translate(cx, cy);
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ff6b81'); g.addColorStop(0.55, '#b0102a'); g.addColorStop(1, '#2a0309');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ff9aa8'; ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // A sickle blade (used by the hook and the scythe): `s` scale, `side` which way it curls.
  RP.drawSickle = function (ctx, x, y, ang, s = 1, side = 1) {
    const L = lookOf(this), vf = this.vfBlend || 0;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    if (side < 0) ctx.scale(1, -1);
    this.paintBlade(ctx, L, vf, s);
    ctx.restore();
  };

  // Blade in local coords: the shaft runs along +x and ends at the origin; the crescent curls toward +y.
  RP.paintBlade = function (ctx, L, vf, s) {
    const B = [mix(L.blade[0], VSC.blade[0], vf), mix(L.blade[1], VSC.blade[1], vf), mix(L.blade[2], VSC.blade[2], vf)];
    ctx.save();
    ctx.scale(s, s);
    const g = ctx.createLinearGradient(0, 0, 10, 62);
    g.addColorStop(0, B[0]); g.addColorStop(0.5, B[1]); g.addColorStop(1, B[2]);
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6, -3);
    ctx.quadraticCurveTo(20, 4, 18, 32);           // outer (spine) curve out from the shaft
    ctx.quadraticCurveTo(15, 54, -24, 66);          // sweeping round to the point
    ctx.quadraticCurveTo(4, 46, 4, 22);             // inner (cutting) edge back toward the shaft
    ctx.quadraticCurveTo(3, 8, -6, 3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // cutting edge highlight
    ctx.strokeStyle = mix(L.edge, VSC.edge, vf); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-24, 66); ctx.quadraticCurveTo(4, 46, 4, 22); ctx.quadraticCurveTo(3, 8, -6, 3); ctx.stroke();
    if (L.vein) {
      ctx.strokeStyle = mix(L.vein, VSC.vein, vf); ctx.lineWidth = 1.2; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(14, 12, 12, 34); ctx.quadraticCurveTo(10, 50, -14, 60); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (L.teeth) {   // serrations along the inner edge
      ctx.fillStyle = B[2];
      for (let i = 0; i < 5; i++) {
        const v = 14 + i * 9.5, u = 4 - Math.max(0, v - 38) * 0.9;
        ctx.beginPath(); ctx.moveTo(u, v); ctx.lineTo(u - 6, v + 4); ctx.lineTo(u + 1, v + 8); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // THE WEAPON SLOT: chain scythe with a swinging chain and weighted hook
  // ---------------------------------------------------------------------------
  RP.drawColossalGreatsword = function (ctx, rHand3D, swordTip3D, activeSlashArc, time) {
    const vf0 = this.vfBlend || 0;
    if (vf0 > 0.97) return;                       // the demon carries no weapon
    if (vf0 > 0.02) { ctx.save(); ctx.globalAlpha = 1 - vf0; this.drawScythe(ctx, rHand3D, swordTip3D, activeSlashArc, time); ctx.restore(); return; }
    this.drawScythe(ctx, rHand3D, swordTip3D, activeSlashArc, time);
  };
  RP.drawScythe = function (ctx, rHand3D, swordTip3D, activeSlashArc, time) {
    const a = this.act;
    const L = lookOf(this), vf = this.vfBlend || 0;
    const showVfx = this.isLocal || !window.fx || window.fx.showAllyVfx !== false;
    // swing trail
    const swinging = a && (a.kind === 'b' || a.kind === 'q' || a.kind === 'd' || a.kind === 'f' || a.kind === 'r' || (a.kind === 't' && a.phase === 'flurry'));
    if (showVfx && swinging && this.swordTrail.length > 2) {
      ctx.save();
      for (let i = 1; i < this.swordTrail.length; i++) {
        const p0 = this.swordTrail.at(i - 1), p1 = this.swordTrail.at(i);
        if (Math.hypot(p1.tx - p0.tx, p1.ty - p0.ty) > 4) {
          ctx.fillStyle = `rgba(${vf > 0.5 ? '255,26,60' : '225,29,72'},${(i / this.swordTrail.length) * 0.42})`;
          ctx.beginPath(); ctx.moveTo(p0.hx, p0.hy); ctx.lineTo(p0.tx, p0.ty); ctx.lineTo(p1.tx, p1.ty); ctx.lineTo(p1.hx, p1.hy); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }
    if (a && a.kind === 'tv' && a.phase === 'charge') { /* the scythe is held flat overhead */ }
    const hx = rHand3D.sx, hy = rHand3D.sy;
    let dx = swordTip3D.sx - hx, dy = swordTip3D.sy - hy;
    const len = Math.max(40, Math.hypot(dx, dy)); const ang = Math.atan2(dy, dx);
    dx = Math.cos(ang); dy = Math.sin(ang);
    const nx = -dy, ny = dx;
    // blade curl direction with hysteresis so it does not flip mid-swing
    if (Math.abs(ny) > 0.45) this._bs = ny < 0 ? 1 : -1;
    else if (!this._bs) this._bs = 1;
    const side = this._bs;

    // the chain hangs from the pommel
    this.updateChain(hx - dx * 14, hy - dy * 14);
    const tipX = hx + dx * len, tipY = hy + dy * len;
    ctx.save();
    ctx.lineCap = 'round';
    this.drawChain(ctx, L, vf);
    // shaft
    ctx.strokeStyle = '#06030a'; ctx.lineWidth = 6.2;
    ctx.beginPath(); ctx.moveTo(hx - dx * 14, hy - dy * 14); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = mix(L.shaft, '#2a0a10', vf); ctx.lineWidth = 4.4;
    ctx.beginPath(); ctx.moveTo(hx - dx * 14, hy - dy * 14); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = mix(L.shaftHi, '#7f1d1d', vf); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(hx - dx * 14 + nx * 1.2, hy - dy * 14 + ny * 1.2); ctx.lineTo(tipX + nx * 1.2, tipY + ny * 1.2); ctx.stroke();
    // grip wraps
    ctx.strokeStyle = mix(L.wrap, '#4a0a12', vf); ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) { const u = -8 + i * 6; ctx.beginPath(); ctx.moveTo(hx + dx * u - nx * 2.6, hy + dy * u - ny * 2.6); ctx.lineTo(hx + dx * u + nx * 2.6 + dx * 2, hy + dy * u + ny * 2.6 + dy * 2); ctx.stroke(); }
    // pommel ring
    ctx.strokeStyle = mix(L.ring || '#8a6a4a', '#ff1a3c', vf); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx - dx * 16, hy - dy * 16, 4, 0, Math.PI * 2); ctx.stroke();
    // blade at the far end (shaft along +x, crescent curling toward `side`)
    ctx.save();
    ctx.translate(tipX, tipY); ctx.rotate(ang);
    if (side < 0) ctx.scale(1, -1);
    ctx.scale(0.82, 0.82);
    this.paintBlade(ctx, L, vf, 1);
    if (L.halo) {   // Sovereign: a burning Eclipse ring orbiting the blade
      const t = performance.now() * 0.002;
      ctx.strokeStyle = mix(L.halo, '#ff1a3c', vf); ctx.lineWidth = 1.8; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.ellipse(2, 34, 30, 11, t, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = mix('#f5d0fe', '#ffd0d6', vf);
      ctx.beginPath(); ctx.arc(2 + Math.cos(t * 3) * 30, 34 + Math.sin(t * 3) * 11, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // enhancement/charge glow along the blade
    const glowA = (a && (a.kind === 'tv' || a.kind === 'z' || a.kind === 'r')) ? 0.4 : (vf * 0.35 + Math.min(0.3, (this.weaponEnh || 0) * 0.025));
    if (glowA > 0.02 && showVfx) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = glowA; ctx.strokeStyle = mix(L.glow, VSC.glow, vf); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipX, tipY); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  };

  // The scythe standing upright with its foot at the origin, for menus (enhance hub): shaft, wraps, ring, hanging chain, blade.
  RP.drawScytheSprite = function (ctx, len) {
    const L = lookOf(this);
    ctx.save();
    ctx.lineCap = 'round';
    // chain hanging from the pommel
    ctx.strokeStyle = L.chain; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-14, 26, 10, 36, -6, 58); ctx.stroke();
    ctx.fillStyle = L.weight; ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-6, 52); ctx.lineTo(-1, 60); ctx.lineTo(-6, 70); ctx.lineTo(-11, 60); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#06030a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -len); ctx.stroke();
    ctx.strokeStyle = L.shaft; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -len); ctx.stroke();
    ctx.strokeStyle = L.shaftHi; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-1.6, 6); ctx.lineTo(-1.6, -len); ctx.stroke();
    ctx.strokeStyle = L.wrap; ctx.lineWidth = 6;
    for (let i = 0; i < 6; i++) { const y = -10 - i * 9; ctx.beginPath(); ctx.moveTo(-3.4, y); ctx.lineTo(3.4, y - 3); ctx.stroke(); }
    ctx.strokeStyle = L.ring || '#8a6a4a'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, 12, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.translate(0, -len); ctx.rotate(-Math.PI / 2); ctx.scale(2.4, 2.4);
    this.paintBlade(ctx, L, 0, 1);
    ctx.restore();
  };

  // Tiny verlet chain from the pommel: a handful of links ending in a weighted hook, so it swings and trails with the body.
  RP.updateChain = function (ax, ay) {
    const N = 8, LINK = 7;
    let c = this._chn;
    if (!c) { c = this._chn = { p: [], t: performance.now() }; for (let i = 0; i < N; i++) c.p.push({ x: ax, y: ay + i * LINK, ox: ax, oy: ay + i * LINK }); }
    const now = performance.now();
    const dt = Math.min(0.033, Math.max(0.004, (now - c.t) / 1000)); c.t = now;
    // a teleport (pull, leap, dash, a fresh draw) would stretch the chain: let it hang again from the new spot
    if (Math.hypot(ax - c.p[0].x, ay - c.p[0].y) > 70) for (let i = 0; i < N; i++) { const q = c.p[i]; q.x = q.ox = ax; q.y = q.oy = ay + i * LINK; }
    c.p[0].x = ax; c.p[0].y = ay;
    for (let i = 1; i < N; i++) {
      const q = c.p[i];
      const vx = (q.x - q.ox) * 0.96, vy = (q.y - q.oy) * 0.96;
      q.ox = q.x; q.oy = q.y;
      q.x += vx; q.y += vy + 900 * dt * dt;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < N; i++) {
        const a = c.p[i - 1], b = c.p[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = (d - LINK) / d;
        if (i === 1) { b.x -= dx * k; b.y -= dy * k; } else { a.x += dx * k * 0.5; a.y += dy * k * 0.5; b.x -= dx * k * 0.5; b.y -= dy * k * 0.5; }
      }
      c.p[0].x = ax; c.p[0].y = ay;
    }
  };

  RP.drawChain = function (ctx, L, vf) {
    const c = this._chn; if (!c) return;
    ctx.strokeStyle = mix(L.chain, VSC.chain, vf); ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(c.p[0].x, c.p[0].y);
    for (let i = 1; i < c.p.length; i++) ctx.lineTo(c.p[i].x, c.p[i].y);
    ctx.stroke();
    ctx.fillStyle = mix(L.chain, '#7a0f1e', vf);
    for (let i = 1; i < c.p.length - 1; i += 2) { ctx.beginPath(); ctx.arc(c.p[i].x, c.p[i].y, 1.9, 0, Math.PI * 2); ctx.fill(); }
    const e = c.p[c.p.length - 1];
    ctx.fillStyle = mix(L.weight, VSC.weight, vf); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(e.x, e.y - 5); ctx.lineTo(e.x + 4, e.y + 1); ctx.lineTo(e.x, e.y + 7); ctx.lineTo(e.x - 4, e.y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
  };

  // ---------------------------------------------------------------------------
  // ARMOR — three tiers + Voidform
  // ---------------------------------------------------------------------------
  const seg = (ctx, a, b, w0, w1, fill, stroke) => {
    const ang = Math.atan2(b.sy - a.sy, b.sx - a.sx), len = Math.hypot(b.sx - a.sx, b.sy - a.sy);
    ctx.save(); ctx.translate(a.sx, a.sy); ctx.rotate(ang);
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-2, -w0); ctx.lineTo(len + 1, -w1); ctx.lineTo(len + 1, w1); ctx.lineTo(-2, w0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  // Tattered hood-cloak: torn strips that follow the cape physics (tier 2 adds a spiked mantle, tier 3 gold trim). In Voidform it writhes.
  RP.drawRigCloak = function (ctx, J) {
    const { lShoulder: lS, rShoulder: rS, cosR } = J;
    const tier = this.armorTier || 1, vf = this.vfBlend || 0, t = performance.now() * 0.001;
    ctx.save();
    const mx = (lS.sx + rS.sx) * 0.5, my = (lS.sy + rS.sy) * 0.5 - 2;
    const span = Math.max(24, Math.abs(rS.sx - lS.sx) + 12);
    // mantle
    ctx.fillStyle = this.pal('cloth2'); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(mx, my + 2, span * 0.62, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (tier >= 2) {   // jagged spikes along the shoulder line
      ctx.fillStyle = this.pal('plate');
      for (let i = -2; i <= 2; i++) {
        const sx = mx + i * (span * 0.22), h = (tier === 3 ? 12 : 9) + (2 - Math.abs(i)) * 2;
        ctx.beginPath(); ctx.moveTo(sx - 3.4, my); ctx.lineTo(sx + i * 1.2, my - h); ctx.lineTo(sx + 3.4, my); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (!this._capePts || this._capePts.length !== this.capeNodes.length) this._capePts = this.capeNodes.map(() => ({ x: 0, y: 0, w: 0 }));
    const pts = this._capePts;
    for (let idx = 0; idx < pts.length; idx++) {
      const n = this.capeNodes[idx], pt = pts[idx];
      if (idx === 0) { pt.x = mx - cosR * 3; pt.y = my + 6; } else { pt.x = n.x; pt.y = this.y + (n.y - this.y) * TILT() - n.z; }
    }
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, d = Math.hypot(dx, dy);
      if (d > 11.5) { pts[i].x = pts[i - 1].x + dx / d * 11.5; pts[i].y = pts[i - 1].y + dy / d * 11.5; }
    }
    const strips = vf > 0.4 ? [-7, -2, 3, 8] : [-6, 6];
    for (let si = 0; si < strips.length; si++) {
      const off = strips[si], wob = vf * Math.sin(t * 5 + si * 1.9) * 4;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { const w = 2.4 + i * 0.8; const X = pts[i].x + off - w + wob * (i / pts.length), Y = pts[i].y; if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
      const b = pts[pts.length - 1];
      const bx = b.x + off + wob;
      ctx.lineTo(bx - 4, b.y + 6 + vf * 8); ctx.lineTo(bx - 1, b.y + 1); ctx.lineTo(bx + 1, b.y + 9 + vf * 10); ctx.lineTo(bx + 4, b.y + 3);
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x + off + 2.4 + i * 0.8 + wob * (i / pts.length), pts[i].y);
      ctx.closePath();
      ctx.fillStyle = this.pal('cloth'); ctx.fill();
      ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = tier === 3 ? 1.4 : 1; ctx.stroke();
    }
    ctx.restore();
  };

  RP.drawRigLeg = function (ctx, J, side) {
    const hip = side < 0 ? J.lHip : J.rHip, knee = side < 0 ? J.lKnee : J.rKnee, ankle = side < 0 ? J.lAnkle : J.rAnkle;
    const foot = side < 0 ? this.leftFoot : this.rightFoot;
    const tier = this.armorTier || 1, vf = this.vfBlend || 0;
    ctx.save();
    const thin = 1 - vf * 0.25;
    seg(ctx, hip, knee, 6.2 * thin, 5 * thin, tier === 1 ? this.pal('cloth') : this.pal('cloth2'), '#06030a');
    seg(ctx, knee, ankle, 5.2 * thin, 4.2 * thin, tier === 1 ? this.pal('cloth2') : this.pal('plate'), '#06030a');
    // wraps (T1) / plating lines (T2) / gold bands (T3)
    const sAng = Math.atan2(ankle.sy - knee.sy, ankle.sx - knee.sx), sl = Math.hypot(ankle.sx - knee.sx, ankle.sy - knee.sy);
    ctx.save(); ctx.translate(knee.sx, knee.sy); ctx.rotate(sAng);
    ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = tier === 3 ? 2.2 : 1.4;
    for (const f of tier === 1 ? [0.3, 0.5, 0.7] : [0.35, 0.72]) { ctx.beginPath(); ctx.moveTo(sl * f, -4.4); ctx.lineTo(sl * f + (tier === 1 ? 2 : 0), 4.4); ctx.stroke(); }
    ctx.restore();
    // boot
    const footAng = foot.angle !== undefined ? foot.angle : J.renderAng;
    const fCos = Math.cos(footAng), fSin = Math.sin(footAng) * TILT();
    const toe = (foot.pitch || 0) * 4.5;
    ctx.fillStyle = mix('#1a1210', '#14060a', vf); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ankle.sx - fCos * 5, ankle.sy - fSin * 5 - 3);
    ctx.lineTo(ankle.sx + fCos * (11 + vf * 4), ankle.sy + fSin * (11 + vf * 4) + 1.5 - toe);
    ctx.lineTo(ankle.sx + fCos * 8, ankle.sy + fSin * 8 + 5);
    ctx.lineTo(ankle.sx - fCos * 4, ankle.sy + 4.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (vf > 0.3) {   // talons
      ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 1.2;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(ankle.sx + fCos * 12, ankle.sy + fSin * 12 + 1 + i * 1.5); ctx.lineTo(ankle.sx + fCos * 17, ankle.sy + fSin * 17 + 2 + i * 2.2); ctx.stroke(); }
    }
    // knee guard
    ctx.fillStyle = tier === 1 ? this.pal('plate') : this.pal('trim'); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.3;
    if (tier === 1) { ctx.beginPath(); ctx.arc(knee.sx, knee.sy, 4.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(knee.sx - 4.4, knee.sy + 2); ctx.lineTo(knee.sx, knee.sy - (tier === 3 ? 11 : 8)); ctx.lineTo(knee.sx + 4.4, knee.sy + 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  };

  // Sash, hanging charms (T1) / chains (T2) / gold sigil plates (T3), and the BLOOD VIAL on the hip: a little glass sphere that fills as the gauge does.
  RP.drawRigWaist = function (ctx, J) {
    const { pelvis, cosR, strideDiff } = J;
    const tier = this.armorTier || 1, vf = this.vfBlend || 0;
    ctx.save();
    const sway = Math.sin(this.breathePhase * 1.4) * 0.06 - strideDiff * 0.16;
    for (let i = -1; i <= 1; i++) {
      ctx.save();
      ctx.translate(pelvis.sx + i * 6.5 + cosR * 2, pelvis.sy + 1); ctx.rotate(sway + i * 0.13);
      ctx.fillStyle = i === 0 ? this.pal('cloth') : this.pal('cloth2'); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(3.4, 16 + vf * 6); ctx.lineTo(0, 20 + vf * 8); ctx.lineTo(-3.4, 16 + vf * 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (tier === 3) { ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, 15); ctx.stroke(); }
      ctx.restore();
    }
    // belt
    ctx.fillStyle = this.pal('plate'); ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(pelvis.sx - 14, pelvis.sy - 5, 28, 8, 3); ctx.fill(); ctx.stroke();
    // hanging bits
    if (tier === 1) {     // bone charms
      ctx.fillStyle = '#e7dcc4';
      for (const o of [-9, 8]) { ctx.beginPath(); ctx.ellipse(pelvis.sx + o, pelvis.sy + 9 + Math.sin(sway * 8 + o) * 1.5, 2, 3.6, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (tier === 2) {   // chains with spikes
      ctx.strokeStyle = '#7a6b78'; ctx.lineWidth = 1.4; ctx.fillStyle = '#e11d48';
      for (const o of [-10, 10]) { ctx.beginPath(); ctx.moveTo(pelvis.sx + o, pelvis.sy + 2); ctx.lineTo(pelvis.sx + o + Math.sin(sway * 6) * 2, pelvis.sy + 13); ctx.stroke(); ctx.beginPath(); ctx.moveTo(pelvis.sx + o - 2, pelvis.sy + 13); ctx.lineTo(pelvis.sx + o + 2, pelvis.sy + 13); ctx.lineTo(pelvis.sx + o, pelvis.sy + 18); ctx.closePath(); ctx.fill(); }
    } else {                   // gold sigil plate
      ctx.fillStyle = '#fde047'; ctx.strokeStyle = '#6b4a00'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pelvis.sx + cosR * 3, pelvis.sy - 4); ctx.lineTo(pelvis.sx + cosR * 3 + 6, pelvis.sy + 3); ctx.lineTo(pelvis.sx + cosR * 3, pelvis.sy + 10); ctx.lineTo(pelvis.sx + cosR * 3 - 6, pelvis.sy + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // blood vial on the left hip
    const vx = pelvis.sx - 12 - cosR * 0.6, vy = pelvis.sy + 6;
    const fill = c01(((this.blood || 0) / 100));
    ctx.save();
    ctx.translate(vx, vy);
    ctx.fillStyle = 'rgba(20,10,16,0.85)'; ctx.strokeStyle = '#b9a9b4'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, Math.PI * 2); ctx.clip();
    const lvl = 4.4 - fill * 8.8 + Math.sin(performance.now() * 0.004) * 0.6;
    ctx.fillStyle = fill >= 0.99 ? '#ff4d6d' : '#b0102a'; ctx.fillRect(-5, lvl, 10, 10);
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, Math.PI * 2); ctx.stroke();
    if (fill >= 0.99) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,60,90,0.45)'; ctx.beginPath(); ctx.arc(0, 0, 8 + Math.sin(performance.now() * 0.008) * 1.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.restore();
  };

  RP.drawRigCuirass = function (ctx, J) {
    const { lShoulder: lS, rShoulder: rS, neck, chest, pelvis, cosR } = J;
    const tier = this.armorTier || 1, vf = this.vfBlend || 0, t = performance.now() * 0.001;
    ctx.save();
    const grad = ctx.createLinearGradient(lS.sx, neck.sy - 6, rS.sx, pelvis.sy);
    grad.addColorStop(0, this.pal('cloth')); grad.addColorStop(1, this.pal('cloth2'));
    ctx.fillStyle = tier === 1 ? grad : this.pal('plate');
    ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.8;
    const wx = 10.5;
    ctx.beginPath();
    ctx.moveTo(lS.sx - 2, lS.sy - 1); ctx.lineTo(neck.sx, neck.sy - 4); ctx.lineTo(rS.sx + 2, rS.sy - 1);
    ctx.lineTo(chest.sx + 13, chest.sy + 2); ctx.lineTo(pelvis.sx + wx, pelvis.sy - 2); ctx.lineTo(pelvis.sx, pelvis.sy + 2); ctx.lineTo(pelvis.sx - wx, pelvis.sy - 2); ctx.lineTo(chest.sx - 13, chest.sy + 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    const cx = chest.sx + cosR * 3.5;
    if (tier === 1) {       // bone ribs lashed over leather
      ctx.strokeStyle = '#e7dcc4'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const y = chest.sy - 3 + i * 4.2; ctx.beginPath(); ctx.moveTo(cx - 8 + i * 0.6, y); ctx.quadraticCurveTo(cx, y + 2.4, cx + 8 - i * 0.6, y); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx, chest.sy - 5); ctx.lineTo(cx, chest.sy + 12); ctx.stroke();
    } else if (tier === 2) { // obsidian plate: glowing cracks
      ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1.4; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(cx - 7, chest.sy - 4); ctx.lineTo(cx - 2, chest.sy + 3); ctx.lineTo(cx - 5, chest.sy + 10); ctx.moveTo(cx + 6, chest.sy - 3); ctx.lineTo(cx + 2, chest.sy + 4); ctx.lineTo(cx + 5, chest.sy + 11); ctx.stroke();
      ctx.globalAlpha = 1;
    } else {                 // void plate with a golden eclipse sigil
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, chest.sy + 3, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#0b0214'; ctx.beginPath(); ctx.arc(cx, chest.sy + 3, 4, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * 7.5, chest.sy + 3 + Math.sin(an) * 7.5); ctx.lineTo(cx + Math.cos(an) * 10.5, chest.sy + 3 + Math.sin(an) * 10.5); ctx.stroke(); }
    }
    if (vf > 0.15) {   // Voidform: veins glow through the armour and it weeps blood
      ctx.save(); ctx.globalAlpha = vf; ctx.strokeStyle = '#ff1a3c'; ctx.lineWidth = 1.3;
      for (let i = 0; i < 3; i++) { const o = (i - 1) * 5; ctx.beginPath(); ctx.moveTo(cx + o, chest.sy - 5); ctx.lineTo(cx + o + Math.sin(t * 3 + i) * 2, chest.sy + 4); ctx.lineTo(cx + o * 1.4, pelvis.sy - 2); ctx.stroke(); }
      ctx.fillStyle = '#b0102a';
      for (let i = 0; i < 3; i++) { const dr = ((t * 0.8 + i * 0.33) % 1); ctx.beginPath(); ctx.ellipse(cx + (i - 1) * 6, chest.sy + 8 + dr * 16, 1.2, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // collar
    ctx.fillStyle = this.pal('cloth2'); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(neck.sx, neck.sy - 1, 11, 4.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  RP.drawRigArm = function (ctx, J, side) {
    const s = side < 0 ? J.lShoulder : J.rShoulder, e = side < 0 ? J.lElbow : J.rElbow, h = side < 0 ? J.lHand : J.rHand;
    const tier = this.armorTier || 1, vf = this.vfBlend || 0, t = performance.now() * 0.001;
    ctx.save();
    seg(ctx, s, e, 4.4 - vf * 0.6, 3.8, this.pal('skin'), '#06030a');                       // bare upper arm
    seg(ctx, e, h, 4.8, 4.0, tier === 1 ? this.pal('cloth2') : this.pal('plate'), '#06030a'); // bandage / vambrace
    const fa = Math.atan2(h.sy - e.sy, h.sx - e.sx), fl = Math.hypot(h.sx - e.sx, h.sy - e.sy);
    ctx.save(); ctx.translate(e.sx, e.sy); ctx.rotate(fa);
    ctx.strokeStyle = tier === 1 ? '#d8cbb0' : this.pal('trim'); ctx.lineWidth = 1.4;
    for (const f of [0.4, 0.6, 0.8]) { ctx.beginPath(); ctx.moveTo(fl * f, -4); ctx.lineTo(fl * f + 2, 4); ctx.stroke(); }
    ctx.restore();
    // hand (claws in Voidform)
    ctx.fillStyle = this.pal('skin'); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(h.sx, h.sy, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (vf > 0.25) {
      ctx.strokeStyle = '#ffd0d6'; ctx.lineWidth = 1.3;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(h.sx + Math.cos(fa) * 4, h.sy + Math.sin(fa) * 4); ctx.lineTo(h.sx + Math.cos(fa + i * 0.35) * (9 + vf * 4), h.sy + Math.sin(fa + i * 0.35) * (9 + vf * 4)); ctx.stroke(); }
    }
    // pauldron
    const uAng = Math.atan2(e.sy - s.sy, e.sx - s.sx);
    ctx.save(); ctx.translate(s.sx, s.sy - 2); ctx.rotate((uAng - Math.PI * 0.5) * 0.25 + side * 0.2);
    ctx.fillStyle = tier === 1 ? this.pal('cloth') : this.pal('plate'); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, 0, Math.PI, Math.PI * 2); ctx.lineTo(10, 2); ctx.quadraticCurveTo(0, 9, -10, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (tier >= 2) {
      ctx.fillStyle = this.pal('trim');
      const hl = tier === 3 ? 17 : 12;
      ctx.beginPath(); ctx.moveTo(side * 3, -5); ctx.quadraticCurveTo(side * 10, -7, side * (hl * 0.7), -hl); ctx.quadraticCurveTo(side * 5, -9, side * 0.5, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#e7dcc4'; ctx.beginPath(); ctx.arc(0, -1, 3, 0, Math.PI * 2); ctx.fill();   // a skull-ish knob
    }
    ctx.restore();
    ctx.restore();
  };

  // Hood and mask. T1 cloth hood + bone half-mask, T2 horned obsidian hood, T3 crowned hood with a floating gold eclipse halo.
  RP.drawRigHelm = function (ctx, J) {
    const { head, cosR, sinR } = J;
    const tier = this.armorTier || 1, vf = this.vfBlend || 0, t = performance.now() * 0.001;
    ctx.save();
    const hx = head.sx, hy = head.sy;
    const face = sinR > -0.55;
    if (tier === 3) {      // halo behind the head
      ctx.save(); ctx.globalAlpha = 0.9; ctx.strokeStyle = mix('#fde047', '#ff1a3c', vf); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(hx - cosR * 3, hy - 16, 14, 5.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = mix('#fff3c4', '#ff6b81', vf); ctx.beginPath(); ctx.arc(hx - cosR * 3 + Math.cos(t * 2) * 14, hy - 16 + Math.sin(t * 2) * 5.4, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // hood mass
    ctx.fillStyle = this.pal('cloth'); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(hx - 10.5, hy + 6); ctx.quadraticCurveTo(hx - 11, hy - 14, hx, hy - 14.5); ctx.quadraticCurveTo(hx + 11, hy - 14, hx + 10.5, hy + 6);
    ctx.quadraticCurveTo(hx, hy + 10, hx - 10.5, hy + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    // hood tail trailing with motion
    const tx = this.capeNodes[1] ? this.capeNodes[1].x : hx - cosR * 12;
    ctx.beginPath(); ctx.moveTo(hx - cosR * 6, hy - 8); ctx.quadraticCurveTo(hx - cosR * 14, hy - 8, tx - cosR * 4 + (hx - tx) * 0.1, hy + 6 + vf * 6); ctx.quadraticCurveTo(hx - cosR * 8, hy + 2, hx - cosR * 3, hy + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (face) {
      const fx = hx + cosR * 3;
      // shadowed face under the hood
      ctx.fillStyle = '#07030a'; ctx.beginPath(); ctx.ellipse(fx, hy + 0.5, 6.8, 7.6, 0, 0, Math.PI * 2); ctx.fill();
      // mask
      const mcol = tier === 1 ? '#e7dcc4' : tier === 2 ? '#2b2230' : '#d9b84a';
      ctx.fillStyle = mix(mcol, '#3a070d', vf * 0.8); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(fx - 6.4, hy - 1); ctx.quadraticCurveTo(fx, hy - 5, fx + 6.4, hy - 1); ctx.lineTo(fx + 5, hy + 7); ctx.quadraticCurveTo(fx, hy + 10, fx - 5, hy + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      // eye slits / eyes
      const ec = mix((this.look && this.look.accent) || (tier === 1 ? '#f5f0e0' : tier === 2 ? '#fb7185' : '#fff3c4'), '#ff1a3c', vf);   // eyes: the chosen glow colour
      ctx.fillStyle = ec; ctx.globalAlpha = 0.95;
      const ex = hx + cosR * 4.6;
      ctx.beginPath(); ctx.moveTo(ex - 5, hy + 1); ctx.lineTo(ex - 1.4, hy + 2.2); ctx.lineTo(ex - 4.6, hy + 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex + 5, hy + 1); ctx.lineTo(ex + 1.4, hy + 2.2); ctx.lineTo(ex + 4.6, hy + 3); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      if (vf > 0.3) {   // glowing eye trails + a stretched grin of cracks
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = vf * 0.7; ctx.strokeStyle = '#ff1a3c'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ex - 5, hy + 1.5); ctx.lineTo(ex - 11, hy - 1 + Math.sin(t * 6) * 1.5); ctx.moveTo(ex + 5, hy + 1.5); ctx.lineTo(ex + 11, hy - 1 - Math.sin(t * 6) * 1.5); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = '#ff1a3c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ex - 4, hy + 6); for (let i = 0; i < 6; i++) ctx.lineTo(ex - 4 + i * 1.6, hy + 6 + (i % 2 ? 1.6 : -0.6)); ctx.stroke();
      }
    }
    // horns / crown spikes
    if (tier >= 2) {
      ctx.fillStyle = this.pal('trim'); ctx.strokeStyle = '#06030a'; ctx.lineWidth = 1.2;
      const n = tier === 3 ? 5 : 2;
      for (let i = 0; i < n; i++) {
        const u = n === 2 ? (i === 0 ? -1 : 1) : (i - 2) * 0.7;
        const hl = tier === 3 ? 10 + (2 - Math.abs(i - 2)) * 3 : 13;
        const bx = hx + u * 6.5, by = hy - 12 - (tier === 3 ? 0 : 1) + Math.abs(u) * 1.8;
        ctx.beginPath(); ctx.moveTo(bx - 2.2, by); ctx.lineTo(bx + u * (tier === 3 ? 1 : 5), by - hl); ctx.lineTo(bx + 2.2, by); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  };
})();
