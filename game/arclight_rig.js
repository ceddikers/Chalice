// =========================================================================
// ARCLIGHT_RIG.JS — how the Arclight looks and moves
//
// A cocky tech-scout, not a trooper: a visible face with a one-eye scouter lens, a cropped jacket over a circuit-lined bodysuit,
// thruster boots and a thruster pack with wings, and a drone that follows you around.
//   • SABER mode: a laser blade in each hand, projected from wrist emitters (no hilts). Three tiers (weaponModelId):
//     arc_prototype (cyan) · arc_photon (violet, crackling) · arc_sovereign (pink-gold, with a halo ring)
//   • BEAM mode: the blades switch off and the drone docks onto your right forearm and becomes the cannon
//   • Armor in three tiers (armorTier): field jacket + goggles · plated hypersync suit + angular wings · full hypersync, energy wings
//   • The suit's light follows your Core Heat (tier colour -> amber -> red)
//   • Poses per skill (applyPoseHook) and overlays: beams, pulse shots, missiles, the boomerang, the sentry, the drone
// Plugs into BreakerPlayer25D.draw(): applyPoseHook(P), drawRig* parts and drawColossalGreatsword(…) (the weapon slot).
// =========================================================================
(function () {
  const AP = ArclightPlayer25D.prototype;
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

  // Suit palettes per tier: bodysuit, jacket, hard metal, accent trim and the light colour.
  const ARM = {
    1: { plate: '#d4dbe7', plate2: '#97a3b6', dark: '#1a2231', trim: '#0ea5e9', glow: '#38bdf8' },     // silver-white with sky-blue trim
    2: { plate: '#23263d', plate2: '#14172a', dark: '#0a0c16', trim: '#8b5cf6', glow: '#a78bfa' },     // black-navy with violet trim
    3: { plate: '#f1f3f9', plate2: '#c2c8dc', dark: '#232738', trim: '#fb7185', glow: '#f9a8d4' }      // pearl with rose trim
  };
  AP.tierOf = function () { return Math.max(1, Math.min(3, this.armorTier || 1)); };
  AP.pal = function (key) { return ARM[this.tierOf()][key]; };
  // The suit's light: the tier colour, shifting amber then red as the core heats up.
  AP.glowCol = function () {
    const base = ARM[this.tierOf()].glow;
    if (this.heatShown >= 80) return mix('#fb923c', '#fde68a', c01((this.heatShown - 80) / 20));
    if (this.heatShown >= 40) return mix(base, '#fb923c', c01((this.heatShown - 40) / 40));
    return base;
  };
  const lensCol = (p) => p.lk('accent', ARM[p.tierOf()].glow);

  // Blade / cannon materials per weapon tier
  const SABER = {
    arc_prototype: { blade: '#38bdf8', core: '#e0f2fe', glow: '#38bdf8', band: '#0ea5e9', w: 4, crackle: false, halo: false, off: 58 },
    arc_photon: { blade: '#a78bfa', core: '#f5f3ff', glow: '#8b5cf6', band: '#8b5cf6', w: 5, crackle: true, halo: false, off: 68 },
    arc_sovereign: { blade: '#fbcfe8', core: '#ffffff', glow: '#f472b6', band: '#fb7185', w: 6, crackle: true, halo: true, off: 78 },
    arc_lullaby: { blade: '#c7d2fe', core: '#ffffff', glow: '#f5c542', band: '#2a4a8f', w: 6.5, crackle: true, halo: true, off: 82 }
  };
  const saberOf = (p) => SABER[p.weaponModelId] || SABER.arc_prototype;

  // ---------------------------------------------------------------------------
  // POSES
  // ---------------------------------------------------------------------------
  AP.applyPoseHook = function (P) {
    const a = this.act;
    const grip = (rf, rs, ru, tf, ts, tu) => {
      P.rHandLocal = { fwd: rf, side: rs, up: ru };
      P.lHandLocal = { fwd: rf - 5, side: rs - 10, up: ru - 3 };
      P.swordTipLocal = { fwd: tf, side: ts, up: tu };
    };
    const cannon = (up, len) => { P.rHandLocal = { fwd: 24, side: 12, up }; P.lHandLocal = { fwd: 16, side: -6, up: up - 4 }; P.swordTipLocal = { fwd: 24 + (len || 46), side: 12, up }; };
    const sweep = (ang, up, reach, tipUp) => {
      P.rHandLocal = { fwd: Math.cos(ang) * 22, side: Math.sin(ang) * 22, up };
      P.lHandLocal = { fwd: Math.cos(ang) * 17, side: Math.sin(ang) * 17 - 5, up: up - 3 };
      P.swordTipLocal = { fwd: Math.cos(ang) * reach, side: Math.sin(ang) * reach, up: tipUp === undefined ? up - 2 : tipUp };
    };
    if (!a) { this.poseNoAct(P, grip, cannon); return; }
    const beam = a.mode === 'beam';
    switch (a.kind) {
      case 'b': {
        const p = c01(a.t / a.dur);
        if (beam) { cannon(46, 46); P.torsoLeanFwd = -3 * (1 - p); P.crouchZ = -2; break; }
        if (a.step < 4) {          // right blade, left blade, right blade ...
          const dir = a.step % 2 ? 1 : -1, sw = eo(c01((p - 0.2) / 0.45));
          sweep(lerp(dir * 2.3, -dir * 1.0, p < 0.2 ? 0 : sw), 42, 100, 32);
          P.torsoYaw = dir * (1 - sw * 1.7) * 0.8; P.crouchZ = -4 * Math.sin(p * Math.PI); P.torsoLeanFwd = 7 * sw;
        } else {
          const wind = c01(p / 0.3), sw = ei(c01((p - 0.3) / 0.25));
          grip(8, 8, lerp(54, 92, wind) - sw * 50, lerp(10, -22, wind) + sw * 96, 4, lerp(70, 150, wind) - sw * 140);
          P.torsoLeanFwd = lerp(0, -7, wind) + sw * 20; P.crouchZ = -3 * sw;
        }
        break;
      }
      case 'q': {
        const p = c01(a.t / a.dur);
        if (beam) { cannon(48 + 6 * p, 50); P.torsoLeanFwd = a.fired ? -8 : 6 * p; P.crouchZ = -6 * (a.fired ? 0.4 : p); break; }
        // cross slash: the first diagonal with one arm, the second back the other way
        { const first = a.t < 0.3, sw = eo(c01(((first ? a.t - 0.1 : a.t - 0.3)) / 0.16));
          sweep(first ? lerp(1.9, -0.6, sw) : lerp(-1.9, 0.6, sw), 46, 70, 36); P.torsoYaw = (first ? 1 : -1) * (0.7 - sw * 1.2); P.torsoLeanFwd = 14; P.crouchZ = -8; }
        break;
      }
      case 'w': {
        const p = c01(a.t / a.dur);
        if (beam) { grip(18 + 14 * p, 6, 70 + 10 * p, 50, 0, 90); P.torsoLeanFwd = 4; break; }
        grip(30, 6, 44, 124, 4, 40); P.torsoLeanFwd = 26; P.crouchZ = -10;
        break;
      }
      case 'e': {
        if (beam) { cannon(48, 54); P.torsoYaw = (a.t < 0.2 ? 0 : -0.35 + c01((a.t - 0.2) / 1.0) * 0.7); P.torsoLeanFwd = 6; P.crouchZ = -7; break; }
        // rotor cyclone: both arms flat out to the sides like rotor blades, leaning into the spin
        P.rHandLocal = { fwd: 2, side: 30, up: 54 }; P.lHandLocal = { fwd: 2, side: -30, up: 54 }; P.swordTipLocal = { fwd: 4, side: 62, up: 54 };
        P.torsoLeanFwd = 8; P.crouchZ = -4;
        break;
      }
      case 'r': {
        if (beam) { P.rHandLocal = { fwd: 4, side: 22, up: 78 }; P.lHandLocal = { fwd: 4, side: -22, up: 78 }; P.swordTipLocal = { fwd: 30, side: 24, up: 110 }; P.torsoLeanFwd = -10; P.crouchZ = -4; break; }
        // the dive: arms crossed in front, blades first
        if (a.phase === 'rise') { const u = c01(a.phaseT / 0.6), d = u < 0.4 ? 0 : eo((u - 0.4) / 0.2); P.rHandLocal = { fwd: lerp(6, 26, d), side: lerp(10, -6, d), up: lerp(100, 40, d) }; P.lHandLocal = { fwd: lerp(6, 26, d), side: lerp(-10, 6, d), up: lerp(100, 40, d) }; P.swordTipLocal = { fwd: lerp(6, 60, d), side: 0, up: lerp(110, 20, d) }; P.torsoLeanFwd = lerp(-6, 28, d); }
        else { P.rHandLocal = { fwd: 26, side: -6, up: 36 }; P.lHandLocal = { fwd: 26, side: 6, up: 36 }; P.swordTipLocal = { fwd: 54, side: 0, up: 16 }; P.torsoLeanFwd = 22; P.crouchZ = -9; }
        break;
      }
      case 'a': {
        P.rHandLocal = { fwd: 6, side: 14, up: 34 }; P.lHandLocal = { fwd: 16, side: -10, up: 38 };
        P.swordTipLocal = beam ? { fwd: 40, side: 14, up: 34 } : { fwd: -70, side: 18, up: 26 };
        P.torsoLeanFwd = 28; P.crouchZ = -12; P.torsoYaw = 0.3;
        break;
      }
      case 's': {
        if (beam) { cannon(48, 50); P.torsoLeanFwd = a.fired ? -12 : 4; P.crouchZ = -8; break; }
        // crescent wave: blades crossed in front, then thrown wide apart
        { const k = eo(c01((a.t - 0.12) / 0.14));
          P.rHandLocal = { fwd: 24, side: lerp(-6, 30, k), up: 46 }; P.lHandLocal = { fwd: 24, side: lerp(6, -30, k), up: 46 }; P.swordTipLocal = { fwd: 50, side: lerp(-8, 40, k), up: 44 };
          P.torsoLeanFwd = lerp(8, 16, k); P.crouchZ = -7; }
        break;
      }
      case 'd': {
        const p = c01(a.t / a.dur);
        grip(18, 4, 56, 54, -26, 60); P.torsoLeanFwd = 4 + 6 * Math.sin(p * Math.PI); P.crouchZ = -5; P.torsoYaw = -0.2;
        break;
      }
      case 'f': {
        if (beam) { cannon(46, 58); P.torsoLeanFwd = a.t > 0.7 && a.t < 2.1 ? 8 : 2; P.crouchZ = -11; P.headPitchZ = -2; break; }
        const k = a.n || 0;
        sweep(k % 2 ? 1.4 : -1.4, 44, 108, 30); P.torsoYaw = k % 2 ? -0.6 : 0.6; P.torsoLeanFwd = 14; P.crouchZ = -8;
        break;
      }
      case 't': {
        const s = eo(c01(a.phaseT / 0.6));
        P.rHandLocal = { fwd: 0, side: 20, up: lerp(46, 110, a.phase === 'call' ? s : 1) };
        P.lHandLocal = { fwd: 0, side: -20, up: lerp(46, 110, a.phase === 'call' ? s : 1) };
        P.swordTipLocal = { fwd: 6, side: 22, up: 150 }; P.torsoLeanFwd = -8; P.crouchZ = -3;
        break;
      }
      case 'z': {
        // hop back, then plant: the free hand clamps onto the cannon arm to brace it
        const hop = c01(a.t / 0.45), brace = eo(c01((a.t - 0.2) / 0.35)), shake = a.fired && a.t < 3.5 ? Math.sin(a.t * 70) * 0.8 : 0;
        P.rHandLocal = { fwd: 26 + 4 * brace, side: 11, up: 46 + shake };
        P.lHandLocal = { fwd: lerp(10, 20, brace), side: lerp(-14, 5, brace), up: lerp(40, 41, brace) + shake };
        P.swordTipLocal = { fwd: 84, side: 11, up: 46 + shake };
        P.torsoLeanFwd = a.t < 0.45 ? -16 * Math.sin(hop * Math.PI) : (a.fired ? -2 : 7 * brace);
        P.crouchZ = a.t < 0.45 ? 2 : -12;
        break;
      }
      default: this.poseNoAct(P, grip, cannon);
    }
  };

  // Idle / walk / hit reactions.
  AP.poseNoAct = function (P, grip, cannon) {
    const st = this.state;
    const sd = P.strideDiff || 0;
    const mb = this.modeBlend || 0;
    if (st === 'idle' || st === 'walk') {
      // HOVER: no stride bob. The arms float and drift gently, and the torso leans into the glide.
      const spd = Math.min(1, (this.speed || 0) / 190), bob = -Math.sin(performance.now() * 0.0026) * 1.8 - spd * 2;
      // saber: loose, blade low and angled up past the hip · beam: the docked drone-cannon braced forward
      const s = { r: { fwd: 12 + sd * 1.4, side: 16, up: 38 + P.breatheZ * 0.5 - bob }, l: { fwd: 6 - sd * 3, side: -12, up: 34 }, t: { fwd: 46 - sd * 1.5, side: 22, up: 68 - bob * 2 } };
      const b = { r: { fwd: 22 + sd * 1.2, side: 13, up: 44 - bob }, l: { fwd: 16 - sd * 2, side: -6, up: 40 }, t: { fwd: 68, side: 13, up: 44 - bob } };
      P.rHandLocal = { fwd: lerp(s.r.fwd, b.r.fwd, mb), side: lerp(s.r.side, b.r.side, mb), up: lerp(s.r.up, b.r.up, mb) };
      P.lHandLocal = { fwd: lerp(s.l.fwd, b.l.fwd, mb), side: lerp(s.l.side, b.l.side, mb), up: lerp(s.l.up, b.l.up, mb) };
      P.swordTipLocal = { fwd: lerp(s.t.fwd, b.t.fwd, mb), side: lerp(s.t.side, b.t.side, mb), up: lerp(s.t.up, b.t.up, mb) };
      P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 2 + spd * 13;
      P.crouchZ = (P.crouchZ || 0) + 2;
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
  // draw(): a heat glow on the floor + the overlays
  // ---------------------------------------------------------------------------
  const baseDraw = BreakerPlayer25D.prototype.draw;
  AP.draw = function (ctx) {
    if (this.hp <= 0) { baseDraw.call(this, ctx); return; }
    this.drawGround(ctx);
    // glide: the whole suit rolls into the direction it is moving, pivoting at the feet
    const roll = Math.max(-0.16, Math.min(0.16, (this.vx || 0) / 190 * 0.14));
    if (Math.abs(roll) > 0.004) { ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(roll); ctx.translate(-this.x, -this.y); baseDraw.call(this, ctx); ctx.restore(); }
    else baseDraw.call(this, ctx);
    this.drawOverlays(ctx);
  };

  // The hover light on the floor under the suit: a soft pool, a spinning thruster ring and a few ripples, growing with Heat.
  AP.drawGround = function (ctx) {
    const h = this.heatShown || 0, hov = this.hoverNow || 0;
    if (hov < 3) return;
    const t = performance.now() * 0.001, col = this.glowCol(), sp = Math.min(1, (this.speed || 0) / 190);
    ctx.save();
    ctx.translate(this.x, this.y); ctx.scale(1, TILT());
    ctx.globalCompositeOperation = 'lighter';
    const R = 26 + h * 0.3 + sp * 6 + Math.sin(t * 6) * (h > 80 ? 4 : 1.2);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = (0.16 + h / 100 * 0.28 + sp * 0.1) * Math.min(1, hov / 12);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.6 * Math.min(1, hov / 12); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a0 = t * 3 + i * 2.09; ctx.beginPath(); ctx.arc(0, 0, R * 0.72, a0, a0 + 1.1); ctx.stroke(); }
    const rp = (t * 1.3) % 1; ctx.globalAlpha = 0.35 * (1 - rp) * Math.min(1, hov / 12); ctx.beginPath(); ctx.arc(0, 0, R * (0.5 + rp * 0.9), 0, Math.PI * 2); ctx.stroke();       // a ripple rolling outward
    if (h > 40) { ctx.globalAlpha = 0.6; ctx.setLineDash([8, 10]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  };

  AP.worldToScreenY = function (y, z) { return y - (z || 0); };

  // The drone floats over the right shoulder; it flies off to the sentry spot or up to call the satellite.
  AP.dronePos = function () {
    const t = performance.now() * 0.001, a = this.act;
    let x = this.x + 30 + Math.cos(t * 1.7) * 7, y = this.y - 96 - this.jumpZ + Math.sin(t * 2.6) * 5;
    if (a && a.kind === 't') y -= eo(a.phase === 'call' ? a.phaseT / 0.8 : 1) * 150;
    if (a && a.kind === 'w' && a.mode === 'beam' && a.tx !== undefined) { const s = eo(a.t / 0.22); x = lerp(x, a.tx, s); y = lerp(y, a.ty - 60, s); }
    return { x, y };
  };

  // The drone body: a hex shell with a big glowing eye, two little rotors. Used floating about and docked on the arm as the cannon.
  AP.paintDrone = function (ctx, scale, gc, t) {
    const tier = this.tierOf();
    ctx.save(); ctx.scale(scale, scale);
    ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 1.3;
    ctx.fillStyle = tier === 3 ? '#e8ecf4' : (tier === 2 ? '#3a4560' : '#cfd6e2');
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2; const x = Math.cos(an) * 8, y = Math.sin(an) * 6; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); ctx.fill(); ctx.stroke();
    // rotors
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-13, -6); ctx.moveTo(8, -3); ctx.lineTo(13, -6); ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gc;
    for (const sd of [-1, 1]) { ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 40 + sd); ctx.beginPath(); ctx.ellipse(sd * 13, -6, 5.5, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // the eye
    ctx.fillStyle = '#05070d'; ctx.beginPath(); ctx.arc(0, 0, 3.8, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gc; ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 8);
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.restore();
  };

  AP.drawOverlays = function (ctx) {
    const showVfx = this.isLocal || !window.fx || window.fx.showAllyVfx !== false;
    const T = TILT(), t = performance.now() * 0.001;
    const a = this.act;
    // beams (a few lighter strokes each, no per-particle work)
    if (showVfx && this.beams.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const b of this.beams) {
        const k = 1 - b.t / b.dur, ex = b.x0 + Math.cos(b.ang) * b.len, ey = b.y0 + Math.sin(b.ang) * b.len * T;
        const w = b.w * (0.5 + 0.5 * k);
        if (b.w >= 22) { ctx.globalAlpha = 0.28 * k; ctx.strokeStyle = b.col; ctx.lineWidth = w * 1.5; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(ex, ey); ctx.stroke(); }
        ctx.strokeStyle = b.col; ctx.globalAlpha = 0.7 * k; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, w * 0.38); ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(ex, ey); ctx.stroke();
        // flares where the beam leaves the emitter and where it ends
        if (b.w >= 22) {
          ctx.globalAlpha = 0.55 * k; ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.x0, b.y0, w * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(ex, ey, w * 1.1, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = k; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x0, b.y0, w * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(ex, ey, w * 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
    // bolts
    if (showVfx && this.bolts.length) {
      ctx.save(); ctx.lineCap = 'round';
      for (const b of this.bolts) {
        if (b.kind === 'rocket') {
          const py = b.y - (b.z || 0);
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(251,146,60,0.55)'; ctx.lineWidth = 7;
          const u = c01(b.t / b.dur), u0 = Math.max(0, u - 0.12), x0 = lerp(b.sx, b.tx, u0), y0 = lerp(b.sy, b.ty, u0) - Math.sin(u0 * Math.PI) * b.arc;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(b.x, py); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(b.x, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(b.x, py, 2, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        } else if (b.kind === 'boom') {
          ctx.save(); ctx.translate(b.x, b.y - 40); ctx.rotate(b.spin || 0);
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(125,211,252,0.5)'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(34, 0); ctx.stroke();
          ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(34, 0); ctx.stroke();
          ctx.restore();
        } else if (b.kind === 'seek') {     // homing missile: a hot trail behind a small warhead
          const sy = b.y - b.z, tr = b.trail || [];
          ctx.globalCompositeOperation = 'lighter';
          if (tr.length > 1) {
            ctx.strokeStyle = 'rgba(251,146,60,0.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(tr[0].x, tr[0].y - tr[0].z); for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i].x, tr[i].y - tr[i].z); ctx.lineTo(b.x, sy); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tr[Math.max(0, tr.length - 5)].x, tr[Math.max(0, tr.length - 5)].y - tr[Math.max(0, tr.length - 5)].z); ctx.lineTo(b.x, sy); ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
          const vang = Math.atan2(b.vy * T - (b.vz || 0) * 0, b.vx);
          ctx.save(); ctx.translate(b.x, sy); ctx.rotate(vang); ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(-5, -2.4, 10, 4.8, 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(5, -2.4); ctx.lineTo(9, 0); ctx.lineTo(5, 2.4); ctx.closePath(); ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        } else if (b.crescent) {      // a wide crescent of light, standing on the floor and racing forward
          ctx.save(); ctx.translate(b.x, b.y - 18); ctx.rotate(b.ang); ctx.scale(1, T * 1.6); ctx.globalCompositeOperation = 'lighter';
          const fade = 1 - c01((b.t / b.life - 0.7) / 0.3), gc = this.glowCol();
          ctx.lineCap = 'round';
          ctx.globalAlpha = 0.3 * fade; ctx.strokeStyle = gc; ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(-14, 0, 62, -1.2, 1.2); ctx.stroke();
          ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = gc; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(-14, 0, 62, -1.1, 1.1); ctx.stroke();
          ctx.globalAlpha = fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-14, 0, 62, -1.0, 1.0); ctx.stroke();
          ctx.restore();
        } else if (b.xwave) {        // an X of light, tumbling slowly as it flies
          ctx.save(); ctx.translate(b.x, b.y - 38); ctx.globalCompositeOperation = 'lighter';
          const fade = 1 - c01((b.t / b.life - 0.6) / 0.4), gc = this.glowCol();
          for (const sg of [1, -1]) {
            ctx.save(); ctx.rotate(b.ang + sg * 0.7 + b.t * 4); ctx.globalAlpha = 0.35 * fade; ctx.strokeStyle = gc; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-36, 0); ctx.lineTo(36, 0); ctx.stroke();
            ctx.globalAlpha = fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-36, 0); ctx.lineTo(36, 0); ctx.stroke(); ctx.restore();
          }
          ctx.restore();
        } else {
          const ca = Math.cos(b.ang), sa = Math.sin(b.ang) * T;
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(125,211,252,0.5)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(b.x - ca * 26, b.y - 38 - sa * 26); ctx.lineTo(b.x, b.y - 38); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(b.x - ca * 22, b.y - 38 - sa * 22); ctx.lineTo(b.x, b.y - 38); ctx.stroke();
        }
      }
      ctx.restore();
    }
    // Lock-On Strike: the scouter's reticle closes in on the boss, then flashes red when it locks
    if (showVfx && a && a.kind === 'w' && a.mode === 'beam' && a.boss && a.boss.hp > 0) {
      const bs = a.boss, p = c01(a.t / 0.75), e = eo(p), locked = a.t >= 0.75, fade = a.t > 1.7 ? 1 - c01((a.t - 1.7) / 0.3) : 1;
      const cx = bs.x, cy = bs.y - 62, R = lerp(190, 52, e), col = locked ? '#ef4444' : '#fdba74', spin = t * (locked ? 1.2 : 3.2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.globalAlpha = fade;
      ctx.translate(cx, cy); ctx.scale(1, 0.82);
      ctx.strokeStyle = col; ctx.lineWidth = 3 + (locked ? 1.5 * Math.sin(t * 24) : 0);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.62, spin, spin + Math.PI * 1.4); ctx.stroke();
      for (let i = 0; i < 4; i++) {          // corner brackets that snap in
        const an = spin * 0.5 + i * Math.PI / 2 + Math.PI / 4, bx = Math.cos(an) * (R + 10), by = Math.sin(an) * (R + 10);
        ctx.save(); ctx.translate(bx, by); ctx.rotate(an + Math.PI); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 0); ctx.lineTo(9, 0); ctx.stroke(); ctx.restore();
      }
      ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-R * 0.3, 0); ctx.lineTo(-8, 0); ctx.moveTo(R * 0.3, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -R * 0.3); ctx.lineTo(0, -8); ctx.moveTo(0, R * 0.3); ctx.lineTo(0, 8); ctx.stroke();
      if (locked) { ctx.globalAlpha = fade * (0.18 + 0.12 * Math.sin(t * 20)); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // Marks: small glowing X's hovering round the boss (they brighten and spin faster as they stack toward a detonation)
    if (showVfx && (this.marks | 0) > 0 && window.game) {
      const bs = (this.isLocal && this.markBoss && this.markBoss.hp > 0) ? this.markBoss : window.game.getActiveBossTarget();
      if (bs && bs.hp > 0) {
        const n = this.marks | 0, gc = this.glowCol();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const an = t * (0.9 + n * 0.12) + i / n * Math.PI * 2, mx = bs.x + Math.cos(an) * 70, my = bs.y - 70 + Math.sin(an) * 26;
          const r = 6 + (n >= 5 ? 1.5 * Math.sin(t * 10 + i) : 0);
          if (this.mode === 'beam') {        // BEAM: Locks are targeting reticles (a ring with four ticks) instead of X's
            const rr = r + 2, sp = t * 2 + i;
            ctx.globalAlpha = 0.35; ctx.strokeStyle = '#fdba74'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(mx, my, rr, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(mx, my, rr, 0, Math.PI * 2);
            for (let q = 0; q < 4; q++) { const an = sp + q * Math.PI / 2; ctx.moveTo(mx + Math.cos(an) * (rr - 2), my + Math.sin(an) * (rr - 2) * 0.8); ctx.lineTo(mx + Math.cos(an) * (rr + 4), my + Math.sin(an) * (rr + 4) * 0.8); }
            ctx.stroke();
          } else {
            ctx.globalAlpha = 0.35; ctx.strokeStyle = gc; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(mx - r, my - r); ctx.lineTo(mx + r, my + r); ctx.moveTo(mx + r, my - r); ctx.lineTo(mx - r, my + r); ctx.stroke();
            ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx - r, my - r); ctx.lineTo(mx + r, my + r); ctx.moveTo(mx + r, my - r); ctx.lineTo(mx - r, my + r); ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
    // sentry
    const s = this.sentry;
    if (s) {
      ctx.save(); ctx.translate(s.x, s.y);
      const k = Math.min(1, s.age / 0.35), fade = Math.min(1, s.t / 0.6);
      ctx.globalAlpha = fade * 0.5; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 2, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
      const hy = -22 * k;
      ctx.fillStyle = '#475569'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-6, hy + 8); ctx.lineTo(6, hy + 8); ctx.lineTo(9, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.translate(0, hy);
      ctx.save(); ctx.rotate(s.ang || 0); ctx.fillStyle = '#334155'; ctx.fillRect(2, -3, 16, 6); ctx.strokeRect(2, -3, 16, 6); ctx.restore();
      this.paintDrone(ctx, 1.15, this.glowCol(), t);
      ctx.restore();
    }
    // the drone: floats beside you in Saber mode and while it works; in Beam mode it is docked on your arm as the cannon
    {
      const mb = this.modeBlend || 0, working = a && a.kind === 't';
      const al = working ? 1 : (1 - mb);
      if (al > 0.03) {
        const d = this.dronePos();
        ctx.save(); ctx.translate(d.x, d.y); ctx.globalAlpha = al;
        ctx.globalAlpha = 0.35 * al; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 8, 8, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = al;
        ctx.rotate(Math.sin(t * 3) * 0.12);
        this.paintDrone(ctx, 1, this.glowCol(), t);
        ctx.restore();
        if (a && a.kind === 't' && a.phase === 'call' && showVfx) {      // the drone paints the target
          const bs = a.boss;
          if (bs) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(125,211,252,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(bs.x, bs.y - 40); ctx.stroke(); ctx.restore(); }
        }
      }
    }
    // aim line while charging a beam (the caster only)
    if (this.isLocal && a && a.mode === 'beam' && ((a.kind === 'q' && !a.fired) || (a.kind === 'f' && a.t < 0.7) || (a.kind === 'z' && a.t < 1.5))) {
      ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 9); ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t * 60;
      const ang = a.ang;
      ctx.beginPath(); ctx.moveTo(this.x, this.y - 38); ctx.lineTo(this.x + Math.cos(ang) * 720, this.y - 38 + Math.sin(ang) * 720 * T); ctx.stroke();
      ctx.restore();
    }
    // the Sync flash after a swap
    if (this.syncT > 0 && showVfx) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, this.syncT) * 0.5; ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(this.x, this.y - 40, 26 + Math.sin(t * 10) * 2, 40, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  };

  // Floor decals (the Plasma Spin ring): drawn by main.js under every character.
  AP.drawFloorVfx = function (ctx) {
    if (!this.vfx || !this.vfx.length) return;
    const showVfx = this.isLocal || !window.fx || window.fx.showAllyVfx !== false;
    if (!showVfx) return;
    const T = TILT(), t = performance.now() * 0.001;
    for (const e of this.vfx) {
      if (e.kind === 'scorch') {         // a glowing burn along the floor where a beam went
        const u = c01(e.t / e.dur), fade = (1 - u) * (1 - u);
        ctx.save(); ctx.lineCap = 'round';
        ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = '#1a0f0a'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x1, e.y1); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x1, e.y1); ctx.stroke();
        ctx.restore(); continue;
      }
      if (e.kind !== 'plasma') continue;
      const u = c01(e.t / e.dur), fade = 1 - c01((u - 0.7) / 0.3);
      ctx.save(); ctx.translate(e.x, e.y); ctx.scale(1, T); ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(56,189,248,0.12)'; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2; ctx.strokeStyle = '#e0f2fe';
      ctx.beginPath(); for (let i = 0; i < 3; i++) { const an = t * 3 + i * 2.09; ctx.moveTo(Math.cos(an) * e.r * 0.4, Math.sin(an) * e.r * 0.4); ctx.lineTo(Math.cos(an + 0.5) * e.r, Math.sin(an + 0.5) * e.r); } ctx.stroke();
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------------------
  // THE WEAPON SLOT: wrist-projected laser blade <-> drone cannon
  // ---------------------------------------------------------------------------
  AP.drawColossalGreatsword = function (ctx, rHand3D, swordTip3D, activeSlashArc, time) {
    const mb = this.modeBlend || 0;
    if (mb < 0.98) { ctx.save(); ctx.globalAlpha = 1 - mb; this.drawSaber(ctx, rHand3D, swordTip3D); ctx.restore(); }
    if (mb > 0.02) { ctx.save(); ctx.globalAlpha = mb; this.drawCannon(ctx, rHand3D, swordTip3D); ctx.restore(); }
  };

  // A glowing blade from (x,y) along (dx,dy) for `len`: wide soft glow, bright body, white core, bright tip.
  AP.paintBlade = function (ctx, L, x, y, dx, dy, len, gc, t, showVfx) {
    // A broad, tapering shard of light: wide where it leaves the wrist, narrowing to a point with a slight sweep (a curved fang).
    const nx = -dy, ny = dx, s = ny >= 0 ? 1 : -1;
    const bw = L.w * 2.5, sw = len * 0.025, bx = x + dx * len + nx * s * len * 0.015, by = y + dy * len + ny * s * len * 0.015;
    const cux = x + dx * len * 0.5 + nx * (bw * 0.5 + s * sw), cuy = y + dy * len * 0.5 + ny * (bw * 0.5 + s * sw);
    const clx = x + dx * len * 0.5 + nx * (-bw * 0.5 + s * sw), cly = y + dy * len * 0.5 + ny * (-bw * 0.5 + s * sw);
    const shard = () => { ctx.beginPath(); ctx.moveTo(x + nx * bw, y + ny * bw); ctx.quadraticCurveTo(cux, cuy, bx, by); ctx.quadraticCurveTo(clx, cly, x - nx * bw, y - ny * bw); ctx.closePath(); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalCompositeOperation = 'lighter';
    const A = ctx.globalAlpha;
    ctx.globalAlpha = A * 0.3; ctx.strokeStyle = gc; ctx.lineWidth = L.w * 2.6; shard(); ctx.stroke();
    ctx.globalAlpha = A * 0.8; ctx.fillStyle = L.blade; shard(); ctx.fill();
    ctx.globalAlpha = A; ctx.strokeStyle = L.core; ctx.lineWidth = 1.6; shard(); ctx.stroke();
    ctx.lineWidth = Math.max(2, L.w * 0.6); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + dx * len * 0.55 + nx * s * sw * 0.9, y + dy * len * 0.55 + ny * s * sw * 0.9, bx, by); ctx.stroke();    // white core ridge
    ctx.fillStyle = L.core; ctx.beginPath(); ctx.arc(bx, by, L.w * 0.6, 0, Math.PI * 2); ctx.fill();
    if (L.crackle && showVfx) {          // arcs of light along the edge
      ctx.globalAlpha = A * 0.8; ctx.strokeStyle = L.core; ctx.lineWidth = 1.2; ctx.beginPath();
      const seed = Math.floor(t * 20);
      for (let i = 0; i < 4; i++) { const u = (i + 0.5) / 4, j = Math.sin(seed * 12.9 + i * 7.3) * 7; ctx.moveTo(x + dx * len * u, y + dy * len * u); ctx.lineTo(x + dx * len * u + nx * j, y + dy * len * u + ny * j); }
      ctx.stroke();
    }
    ctx.restore();
  };

  // The main blade: projected straight out of the right wrist emitter.
  AP.drawSaber = function (ctx, rHand3D, swordTip3D) {
    const L = saberOf(this), a = this.act, t = performance.now() * 0.001;
    const showVfx = this.isLocal || !window.fx || window.fx.showAllyVfx !== false;
    const hx = rHand3D.sx, hy = rHand3D.sy;
    let dx = swordTip3D.sx - hx, dy = swordTip3D.sy - hy;
    const len = Math.max(36, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx);
    dx = Math.cos(ang); dy = Math.sin(ang);
    const gc = mix(L.glow, this.glowCol(), this.stage ? 0.55 : (this.heatShown / 80) * 0.35);
    // The blades are RETRACTED (nothing shows past the fist) until you attack; then this short blade slides out of the right wrist,
    // twin to the one on the left. (this.bladeExt: 0 retracted .. 1 fully out)
    const ext = this.bladeExt || 0;
    if (ext < 0.03) return;
    const flick = this.stage === 2 ? 0.78 + 0.22 * Math.sin(t * 60) : 1;
    const bl = L.off * ext * flick * (1 + 0.1 * (this.chainT > 0 ? Math.min(3, this.chain) : 0));      // the blades grow as a chain builds
    this.paintBlade(ctx, L, hx + dx * 3, hy + dy * 3, dx, dy, bl, gc, t, showVfx);
    if (L.halo && showVfx) {            // Sovereign: a ring of light riding the blade
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.8; ctx.strokeStyle = L.band; ctx.lineWidth = 1.6;
      const u = 0.5 + 0.35 * Math.sin(t * 2.2), cx = hx + dx * bl * u, cy = hy + dy * bl * u;
      ctx.translate(cx, cy); ctx.rotate(ang); ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 13, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  };

  // The drone docked on the right forearm and unfolded into a cannon: body at the wrist, twin barrels forward, a charging muzzle.
  AP.drawCannon = function (ctx, rHand3D, swordTip3D) {
    const L = saberOf(this), t = performance.now() * 0.001;
    const hx = rHand3D.sx, hy = rHand3D.sy;
    let dx = swordTip3D.sx - hx, dy = swordTip3D.sy - hy;
    const ang = Math.atan2(dy, dx); dx = Math.cos(ang); dy = Math.sin(ang);
    const nx = -dy, ny = dx, gc = this.glowCol();
    ctx.save(); ctx.lineCap = 'round';
    // twin barrels
    const x1 = hx + dx * 34, y1 = hy + dy * 34;
    for (const sd of [-1, 1]) {
      ctx.strokeStyle = '#05070d'; ctx.lineWidth = 6.4; ctx.beginPath(); ctx.moveTo(hx + dx * 6 + nx * sd * 4, hy + dy * 6 + ny * sd * 4); ctx.lineTo(x1 + nx * sd * 3, y1 + ny * sd * 3); ctx.stroke();
      ctx.strokeStyle = this.tierOf() === 3 ? '#e2e8f0' : (this.tierOf() === 2 ? '#4b5568' : '#94a3b8'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hx + dx * 6 + nx * sd * 4, hy + dy * 6 + ny * sd * 4); ctx.lineTo(x1 + nx * sd * 3, y1 + ny * sd * 3); ctx.stroke();
    }
    // drone body (the hex shell) wrapped round the wrist
    ctx.save(); ctx.translate(hx + dx * 4, hy + dy * 4); ctx.rotate(ang); this.paintDrone(ctx, 1.35, gc, t); ctx.restore();
    ctx.strokeStyle = L.band; ctx.lineWidth = 1.8; for (const u of [14, 24]) { ctx.beginPath(); ctx.moveTo(hx + dx * u - nx * 6, hy + dy * u - ny * 6); ctx.lineTo(hx + dx * u + nx * 6, hy + dy * u + ny * 6); ctx.stroke(); }
    // muzzle
    ctx.globalCompositeOperation = 'lighter';
    const charge = (this.muzzle > 0 ? 1 : 0) + (this.act && this.act.mode === 'beam' && (this.act.kind === 'f' || this.act.kind === 'q') ? 0.6 : 0) + (this.act && this.act.kind === 'z' ? 1.2 : 0);
    ctx.fillStyle = gc; ctx.globalAlpha *= 0.55 + 0.4 * Math.min(1, charge) + 0.1 * Math.sin(t * 8);
    ctx.beginPath(); ctx.arc(x1 + dx * 2, y1 + dy * 2, 4.2 + charge * 4.5, 0, Math.PI * 2); ctx.fill();
    if (this.muzzle > 0) { ctx.globalAlpha = Math.min(1, this.muzzle * 9); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x1 + dx * 6, y1 + dy * 6, 9, 0, Math.PI * 2); ctx.fill(); }
    // lens rings collapsing into the muzzle while a beam charges
    const ca2 = this.act, charging = ca2 && ca2.mode === 'beam' && ((ca2.kind === 'q' && !ca2.fired) || (ca2.kind === 'f' && ca2.t < 0.7) || (ca2.kind === 'r' && ca2.t < 0.5) || (ca2.kind === 'z' && ca2.t > 0.4 && ca2.t < 1.5));
    if (charging) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8;
      for (let i = 0; i < 3; i++) { const u = (t * 2.4 + i / 3) % 1, rr = 4 + 30 * (1 - u); ctx.globalAlpha = 0.25 + 0.7 * u; ctx.beginPath(); ctx.ellipse(x1 + dx * 10, y1 + dy * 10, rr * 0.55, rr, Math.atan2(dy, dx), 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();
  };

  // A wrist emitter standing upright with its blade, for menus (enhance hub, inventory).
  AP.drawSaberSprite = function (ctx, len) {
    const L = saberOf(this), gc = L.glow;
    ctx.save(); ctx.lineCap = 'round';
    // a bracer
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#05070d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-13, -22, 26, 40, 6); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = L.band; ctx.lineWidth = 3; for (const y of [-12, 0, 12]) { ctx.beginPath(); ctx.moveTo(-13, y); ctx.lineTo(13, y); ctx.stroke(); }
    ctx.fillStyle = '#05070d'; ctx.beginPath(); ctx.arc(0, -24, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = L.band; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -24, 8, 0, Math.PI * 2); ctx.stroke();
    this.paintBlade(ctx, L, 0, -26, 0, -1, len, gc, performance.now() * 0.001, true);
    if (L.halo) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8; ctx.strokeStyle = L.band; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -26 - len * 0.55, 14, 6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // THE SUIT - a sleek mech frame in three tiers, glowing with the core
  // ---------------------------------------------------------------------------
  const seg = (ctx, a, b, w0, w1, fill, stroke) => {
    const ang = Math.atan2(b.sy - a.sy, b.sx - a.sx), len = Math.hypot(b.sx - a.sx, b.sy - a.sy);
    ctx.save(); ctx.translate(a.sx, a.sy); ctx.rotate(ang);
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-2, -w0); ctx.lineTo(len + 1, -w1); ctx.lineTo(len + 1, w1); ctx.lineTo(-2, w0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  const OUT = '#05070d';
  const boosting = (p) => (p.walkWeight || 0) > 0.2 || (p.act && (p.act.kind === 'a' || p.act.kind === 'w' || p.act.kind === 'r' || p.act.kind === 'f')) || (p.jumpZ || 0) > 4;
  const poly = (ctx, pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };
  const glowLine = (ctx, col, w, a, fn) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = a; ctx.beginPath(); fn(); ctx.stroke(); ctx.restore(); };

  // Back: a thruster pack with blade-wings. T1 short swept fins, T2 long serrated blades, T3 big floating energy feathers.
  // The wings flare out when you boost or attack.
  AP.drawRigCloak = function (ctx, J) {
    const { lShoulder: lS, rShoulder: rS, cosR } = J;
    const tier = this.tierOf(), t = performance.now() * 0.001, gc = this.glowCol();
    ctx.save();
    const mx = (lS.sx + rS.sx) * 0.5 - cosR * 3, my = (lS.sy + rS.sy) * 0.5 + 4;
    const fly = true, spread = 1.04 + Math.min(1, (this.speed || 0) / 190) * 0.16 + (this.act && this.act.kind === 'a' ? 0.1 : 0);      // always hovering: the wings stay half-open and flare when gliding
    for (const sd of [-1, 1]) {
      const n = tier === 1 ? 1 : (tier === 2 ? 2 : 4);
      for (let i = 0; i < n; i++) {
        const ang = (tier === 3 ? -0.2 + i * 0.3 : (0.0 + i * 0.5)) * spread;
        const Ln = tier === 1 ? 36 : (tier === 2 ? 50 - i * 12 : 44 - i * 6);
        const sway = Math.sin(t * 2.2 + sd * 1.3 + i) * 2.2;
        const x0 = mx + sd * 7, y0 = my - 4 + i * 2;
        const x1 = x0 + sd * Math.cos(ang) * Ln + sway, y1 = y0 - Math.sin(ang + 0.5) * Ln * 0.9;
        ctx.save();
        if (tier === 3) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(249,168,212,0.24)'; ctx.strokeStyle = 'rgba(253,230,138,0.9)'; ctx.lineWidth = 1.3; }
        else { ctx.fillStyle = tier === 2 ? this.pal('plate2') : this.pal('plate'); ctx.strokeStyle = tier === 2 ? this.pal('trim') : OUT; ctx.lineWidth = 1.3; }
        poly(ctx, [[x0, y0], [x1, y1], [x0 + sd * 9, y0 + 8 + i * 2]]); ctx.fill(); ctx.stroke();
        if (tier === 2) { ctx.fillStyle = this.pal('trim'); poly(ctx, [[x1, y1], [x0 + sd * 12, y0 - 2 - i * 3], [x0 + sd * 9, y0 + 1]]); ctx.fill(); }
        ctx.restore();
      }
    }
    // Lock-On Strike: two launch tubes swing up out of the pack, flashing as each missile leaves
    if (this.act && this.act.kind === 'w' && this.act.mode === 'beam') {
      const aw = this.act, open = eo((aw.t - 0.55) / 0.3) * (aw.t > 1.6 ? 1 - c01((aw.t - 1.6) / 0.3) : 1);
      if (open > 0.02) {
        for (const sd of [-1, 1]) {
          ctx.save(); ctx.translate(mx + sd * 6, my - 8); ctx.rotate(sd * 0.45 * open);
          ctx.fillStyle = this.pal('plate2'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.roundRect(-3.4, -16 * open, 6.8, 16 * open, 1.6); ctx.fill(); ctx.stroke();
          const flash = (aw.nextT - aw.t) < 0.06 && aw.n < aw.total && aw.n % 2 === (sd > 0 ? 0 : 1);
          glowLine(ctx, flash ? '#ffffff' : '#fdba74', 2.4, flash ? 1 : 0.6 * open, () => { ctx.moveTo(0, -16 * open); ctx.lineTo(0, -19 * open); });
          ctx.restore();
        }
      }
    }
    // pack + nozzles
    ctx.fillStyle = this.pal('dark'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(mx - 10, my - 8, 20, 22, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = this.pal('plate2'); ctx.beginPath(); ctx.roundRect(mx - 7, my - 6, 14, 7, 2); ctx.fill(); ctx.stroke();
    glowLine(ctx, gc, 2, 0.85, () => { for (const o of [-4, 0, 4]) { ctx.moveTo(mx + o, my + 4); ctx.lineTo(mx + o, my + 10); } });
    for (const sd of [-1, 1]) {
      const nx0 = mx + sd * 6, ny0 = my + 14;
      ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.moveTo(nx0 - 3.4, ny0); ctx.lineTo(nx0 + 3.4, ny0); ctx.lineTo(nx0 + 2.4, ny0 + 5); ctx.lineTo(nx0 - 2.4, ny0 + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (fly) {
        const fl = 6 + Math.min(1, (this.speed || 0) / 190) * 8 + Math.sin(t * 40 + sd) * 3 + (this.act && this.act.kind === 'a' ? 9 : 0);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, ny0 + 5, 0, ny0 + 5 + fl);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, gc); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(nx0 - 2.4, ny0 + 5); ctx.lineTo(nx0, ny0 + 5 + fl); ctx.lineTo(nx0 + 2.4, ny0 + 5); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  };

  // Legs: dark joints under bulky plates: thigh armour, a knee guard (spiked from T2), a big calf plate with a glowing vent, a heavy boot.
  AP.drawRigLeg = function (ctx, J, side) {
    const hip = side < 0 ? J.lHip : J.rHip, knee = side < 0 ? J.lKnee : J.rKnee, ankle = side < 0 ? J.lAnkle : J.rAnkle;
    const foot = side < 0 ? this.leftFoot : this.rightFoot;
    const tier = this.tierOf(), gc = this.glowCol(), t = performance.now() * 0.001;
    ctx.save();
    seg(ctx, hip, knee, 6.6, 5.6, this.pal('dark'), OUT);
    seg(ctx, knee, ankle, 5.6, 4.4, this.pal('dark'), OUT);
    // thigh plate
    const tAng = Math.atan2(knee.sy - hip.sy, knee.sx - hip.sx), tl = Math.hypot(knee.sx - hip.sx, knee.sy - hip.sy);
    ctx.save(); ctx.translate(hip.sx, hip.sy); ctx.rotate(tAng); ctx.fillStyle = this.pal('plate'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    poly(ctx, [[tl * 0.08, -7.6], [tl * 0.86, -6.4], [tl * 0.96, 0], [tl * 0.86, 6.4], [tl * 0.08, 7.6]]); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(tl * 0.2, -3); ctx.lineTo(tl * 0.75, -2.4); ctx.stroke(); ctx.restore();
    // calf plate
    const cAng = Math.atan2(ankle.sy - knee.sy, ankle.sx - knee.sx), cl = Math.hypot(ankle.sx - knee.sx, ankle.sy - knee.sy);
    ctx.save(); ctx.translate(knee.sx, knee.sy); ctx.rotate(cAng); ctx.fillStyle = this.pal('plate2'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    poly(ctx, [[cl * 0.06, -6.6], [cl * 0.92, -5], [cl * 1.0, 0], [cl * 0.92, 5], [cl * 0.06, 6.6]]); ctx.fill(); ctx.stroke(); ctx.restore();
    glowLine(ctx, gc, 1.6, 0.9, () => { ctx.moveTo(knee.sx + (ankle.sx - knee.sx) * 0.25, knee.sy + (ankle.sy - knee.sy) * 0.25); ctx.lineTo(knee.sx + (ankle.sx - knee.sx) * 0.8, knee.sy + (ankle.sy - knee.sy) * 0.8); });
    // boot
    const footAng = foot.angle !== undefined ? foot.angle : J.renderAng;
    const fCos = Math.cos(footAng), fSin = Math.sin(footAng) * TILT();
    const toe = (foot.pitch || 0) * 4.5;
    ctx.fillStyle = this.pal('plate'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ankle.sx - fCos * 6, ankle.sy - fSin * 6 - 4);
    ctx.lineTo(ankle.sx + fCos * 13, ankle.sy + fSin * 13 + 1 - toe);
    ctx.lineTo(ankle.sx + fCos * 9, ankle.sy + fSin * 9 + 6);
    ctx.lineTo(ankle.sx - fCos * 6, ankle.sy + 5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = this.pal('trim'); ctx.beginPath(); ctx.moveTo(ankle.sx + fCos * 8, ankle.sy + fSin * 8 - 1 - toe); ctx.lineTo(ankle.sx + fCos * 13, ankle.sy + fSin * 13 + 1 - toe); ctx.lineTo(ankle.sx + fCos * 9, ankle.sy + fSin * 9 + 6); ctx.closePath(); ctx.fill();
    // thruster ring + jet
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = gc; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.ellipse(ankle.sx, ankle.sy - 2, 5.6, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
    if ((this.jumpZ || 0) > 2 || (this.act && ['a', 'w', 'r'].includes(this.act.kind))) {
      const spd = Math.min(1, (this.speed || 0) / 190);
      const fl = 6 + spd * 9 + (this.act && this.act.kind === 'a' ? 8 : 0) + Math.sin(t * 50 + side) * 2.5;
      const g = ctx.createLinearGradient(0, ankle.sy + 5, 0, ankle.sy + 5 + fl);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, gc); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(ankle.sx - 2.6, ankle.sy + 5); ctx.lineTo(ankle.sx, ankle.sy + 5 + fl); ctx.lineTo(ankle.sx + 2.6, ankle.sy + 5); ctx.fill();
    }
    ctx.restore();
    // knee guard
    ctx.fillStyle = this.pal('plate'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    if (tier === 1) { ctx.beginPath(); ctx.arc(knee.sx, knee.sy, 4.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else { poly(ctx, [[knee.sx - 5.4, knee.sy + 3], [knee.sx, knee.sy - (tier === 3 ? 13 : 10)], [knee.sx + 5.4, knee.sy + 3]]); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  };

  // Hips: a narrow waist with a plated skirt, and a belt whose cells light up as the core heats.
  AP.drawRigWaist = function (ctx, J) {
    const { pelvis, cosR, strideDiff } = J;
    const tier = this.tierOf(), gc = this.glowCol();
    ctx.save();
    const sway = -strideDiff * 0.14;
    for (let i = -1; i <= 1; i++) {      // skirt plates
      ctx.save(); ctx.translate(pelvis.sx + i * 7.4 + cosR * 2, pelvis.sy); ctx.rotate(sway + i * 0.12);
      ctx.fillStyle = i === 0 ? this.pal('plate') : this.pal('plate2'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      poly(ctx, [[-4.6, 0], [4.6, 0], [4, 12 + tier * 1.5], [0, 16 + tier * 1.5], [-4, 12 + tier * 1.5]]); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, 11); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = this.pal('dark'); ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.roundRect(pelvis.sx - 14, pelvis.sy - 5, 28, 8, 3); ctx.fill(); ctx.stroke();
    const f = c01((this.heatShown || 0) / 100);
    for (let i = 0; i < 5; i++) {
      const on = f >= (i + 0.5) / 5;
      ctx.fillStyle = '#05070d'; ctx.fillRect(pelvis.sx - 11 + i * 4.6 + cosR * 1.5, pelvis.sy - 4, 3.6, 5);
      if (on || i === 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gc; ctx.globalAlpha = on ? 0.95 : 0.3; ctx.fillRect(pelvis.sx - 11 + i * 4.6 + cosR * 1.5, pelvis.sy - 4, 3.6, 5); ctx.restore(); }
    }
    ctx.restore();
  };

  // Torso: a broad armoured chest with a V groove down the middle where the core sits, abdomen segments, and a collar/neck guard.
  AP.drawRigCuirass = function (ctx, J) {
    const { lShoulder: lS, rShoulder: rS, neck, chest, pelvis, cosR } = J;
    const tier = this.tierOf(), t = performance.now() * 0.001, gc = this.glowCol();
    ctx.save();
    // dark frame
    ctx.fillStyle = this.pal('dark'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
    poly(ctx, [[lS.sx - 2, lS.sy - 1], [neck.sx, neck.sy - 4], [rS.sx + 2, rS.sy - 1], [chest.sx + 11, chest.sy + 4], [pelvis.sx + 8, pelvis.sy - 2], [pelvis.sx, pelvis.sy + 2], [pelvis.sx - 8, pelvis.sy - 2], [chest.sx - 11, chest.sy + 4]]); ctx.fill(); ctx.stroke();
    const cx = chest.sx + cosR * 3.5, cy = chest.sy + 4;
    // abdomen segments
    ctx.strokeStyle = this.pal('plate2'); ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i < 3; i++) { const y = cy + 8 + i * 3.6; ctx.moveTo(cx - 6 + i, y); ctx.lineTo(cx + 6 - i, y); } ctx.stroke();
    // chest plates: two angular halves flaring at the shoulders, a V groove between them
    for (const sd of [-1, 1]) {
      const sh = sd < 0 ? lS : rS;
      ctx.fillStyle = this.pal('plate'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
      poly(ctx, [[sh.sx - sd * 1, sh.sy - 2], [neck.sx + sd * 2.6, neck.sy - 2], [cx + sd * 2, cy + 6], [chest.sx + sd * 12, chest.sy + 6], [sh.sx + sd * 2, sh.sy + 9]]); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(sh.sx - sd * 4, sh.sy + 3); ctx.lineTo(cx + sd * 5, cy - 1); ctx.stroke();
    }
    // core in the groove
    const pul = 0.75 + 0.25 * Math.sin(t * (4 + (this.heatShown || 0) * 0.08));
    ctx.fillStyle = '#05070d'; poly(ctx, [[cx, cy - 5], [cx + 5.4, cy + 1], [cx, cy + 7], [cx - 5.4, cy + 1]]); ctx.fill();
    ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1.4; poly(ctx, [[cx, cy - 5], [cx + 5.4, cy + 1], [cx, cy + 7], [cx - 5.4, cy + 1]]); ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gc; ctx.globalAlpha = pul; ctx.beginPath(); ctx.arc(cx, cy + 1, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.2 * pul; ctx.beginPath(); ctx.arc(cx, cy + 1, 11, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (tier >= 2) { ctx.fillStyle = this.pal('trim'); for (const sd of [-1, 1]) poly(ctx, [[cx + sd * 6, cy - 4], [cx + sd * 11, cy - 9], [cx + sd * 9, cy - 1]]), ctx.fill(); }
    if (tier === 3) glowLine(ctx, '#fde68a', 1.2, 0.9, () => { ctx.arc(cx, cy + 1, 8.5, 0, Math.PI * 2); });
    // neck guard
    ctx.fillStyle = this.pal('plate2'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    poly(ctx, [[neck.sx - 10, neck.sy - 1], [neck.sx - 8, neck.sy - 8], [neck.sx - 2, neck.sy - 3], [neck.sx + 2, neck.sy - 3], [neck.sx + 8, neck.sy - 8], [neck.sx + 10, neck.sy - 1], [neck.sx, neck.sy + 4]]); ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  // Arms: big angular pauldrons (the left carries the rotor ring), armoured upper arms, and heavy gauntlets with a blade sheath: the
  // wrist blades are RETRACTED until you attack, then slide out (this.bladeExt 0..1).
  AP.drawRigArm = function (ctx, J, side) {
    const s = side < 0 ? J.lShoulder : J.rShoulder, e = side < 0 ? J.lElbow : J.rElbow, h = side < 0 ? J.lHand : J.rHand;
    const tier = this.tierOf(), gc = this.glowCol(), mb = this.modeBlend || 0, t = performance.now() * 0.001;
    const L = saberOf(this), ext = this.bladeExt || 0;
    ctx.save();
    seg(ctx, s, e, 5, 4.4, this.pal('dark'), OUT);
    seg(ctx, e, h, 5.6, 5, this.pal('plate'), OUT);                         // gauntlet
    const fa = Math.atan2(h.sy - e.sy, h.sx - e.sx), fl = Math.hypot(h.sx - e.sx, h.sy - e.sy);
    // upper-arm plate
    const ua = Math.atan2(e.sy - s.sy, e.sx - s.sx), ul = Math.hypot(e.sx - s.sx, e.sy - s.sy);
    ctx.save(); ctx.translate(s.sx, s.sy); ctx.rotate(ua); ctx.fillStyle = this.pal('plate2'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    poly(ctx, [[ul * 0.25, -5.6], [ul * 0.8, -5], [ul * 0.9, 0], [ul * 0.8, 5], [ul * 0.25, 5.6]]); ctx.fill(); ctx.stroke(); ctx.restore();
    // gauntlet details: a trim stripe and the blade sheath (a glowing slot that flares as the blade comes out)
    ctx.save(); ctx.translate(e.sx, e.sy); ctx.rotate(fa);
    // an angular leaf-shaped vambrace that wraps the forearm and points toward the fist, housing the blade
    ctx.fillStyle = this.pal('plate'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    poly(ctx, [[fl * 0.12, -6.4], [fl * 0.62, -7.4], [fl * 1.02, -3.2], [fl * 1.12, 0], [fl * 1.02, 3.2], [fl * 0.62, 7.4], [fl * 0.12, 6.4], [fl * 0.02, 0]]); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(fl * 0.3, -6.8); ctx.lineTo(fl * 0.78, -4); ctx.moveTo(fl * 0.3, 6.8); ctx.lineTo(fl * 0.78, 4); ctx.stroke();
    ctx.fillStyle = '#05070d'; ctx.beginPath(); ctx.roundRect(fl * 0.42, -2, fl * 0.5, 4, 1.6); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gc; ctx.globalAlpha = 0.25 + 0.7 * Math.max(ext, side > 0 && mb > 0.5 ? 0.5 : 0); ctx.fillRect(fl * 0.45, -1.2, fl * 0.44, 2.4);
    ctx.restore();
    // the off-hand blade (left wrist), only while it is out
    if (side < 0 && mb < 0.98 && ext > 0.03) {
      ctx.save(); ctx.globalAlpha = 1 - mb;
      this.paintBlade(ctx, L, h.sx + Math.cos(fa) * 3, h.sy + Math.sin(fa) * 3, Math.cos(fa), Math.sin(fa), L.off * ext * (1 + 0.1 * (this.chainT > 0 ? Math.min(3, this.chain) : 0)), gc, t, this.isLocal || !window.fx || window.fx.showAllyVfx !== false);
      ctx.restore();
    }
    // fist
    ctx.fillStyle = this.pal('dark'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(h.sx, h.sy, 4.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = this.pal('plate2'); ctx.beginPath(); ctx.arc(h.sx + Math.cos(fa) * 1.6, h.sy + Math.sin(fa) * 1.6, 3, 0, Math.PI * 2); ctx.fill();
    // pauldron
    ctx.save(); ctx.translate(s.sx, s.sy - 2); ctx.rotate((ua - Math.PI * 0.5) * 0.25 + side * 0.2);
    const big = side < 0 ? 1.32 : 1.0;
    ctx.fillStyle = this.pal('plate'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    poly(ctx, [[-10 * big, 3], [-8 * big, -5 * big], [0, -9 * big], [8 * big, -5 * big], [10 * big, 3], [0, 8 * big]]); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-6 * big, -3 * big); ctx.lineTo(0, -6.4 * big); ctx.lineTo(6 * big, -3 * big); ctx.stroke();
    if (this.act && this.act.kind === 'r' && this.act.mode === 'beam') {    // missile pod: the shoulder plate lifts and three warheads show
      const open = eo(this.act.t / 0.18), close = c01((this.act.t - (this.act.dur - 0.3)) / 0.25);
      const o = open * (1 - close);
      ctx.save(); ctx.translate(0, -9 * big - 2); ctx.rotate(-side * 0.5 * o);
      ctx.fillStyle = this.pal('plate2'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(-8, -5 * o - 3, 16, 5, 1.5); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (o > 0.1) {
        ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = OUT; ctx.lineWidth = 1;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 4 - 1.6, -8 * big); ctx.lineTo(i * 4, -8 * big - 8 * o); ctx.lineTo(i * 4 + 1.6, -8 * big); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        glowLine(ctx, '#fdba74', 1.4, 0.9 * o, () => { for (let i = -1; i <= 1; i++) { ctx.moveTo(i * 4, -8 * big - 8 * o); ctx.lineTo(i * 4, -8 * big - 11 * o); } });
      }
    }
    if (tier >= 2) { ctx.fillStyle = this.pal('trim'); poly(ctx, [[side * 2, -8 * big], [side * 9 * big, -(tier === 3 ? 22 : 15)], [side * 6 * big, -6 * big]]); ctx.fill(); ctx.stroke(); }
    if (side < 0) { glowLine(ctx, gc, 1.5, 0.9, () => { ctx.ellipse(0, -9 * big - 2, 7, 2.6, 0, 0, Math.PI * 2); }); glowLine(ctx, gc, 1.5, 0.5, () => { ctx.ellipse(0, -9 * big - 2, 7, 2.6, 0, t * 9, t * 9 + 1.4); }); }
    ctx.restore();
    ctx.restore();
  };

  // Head: a masked helm (the lower face is a plate), glowing visor slits, cheek vents and swept-back horn antennae.
  AP.drawRigHelm = function (ctx, J) {
    const { head, cosR, sinR } = J;
    const tier = this.tierOf(), t = performance.now() * 0.001, eye = lensCol(this), gc = this.glowCol();
    ctx.save();
    const hx = head.sx, hy = head.sy, face = sinR > -0.55;
    if (tier === 3) {         // halo
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(hx - cosR * 3, hy - 19, 14, 5.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(hx - cosR * 3 + Math.cos(t * 2) * 14, hy - 19 + Math.sin(t * 2) * 5.4, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // horn antennae, swept back (they trail with motion)
    const sw = Math.sin(t * 3) * 1.2 + (this.walkWeight || 0) * -2.5;
    ctx.fillStyle = this.pal('trim'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    const hl = tier === 1 ? 12 : (tier === 2 ? 20 : 17);
    for (const sd of [-1, 1]) {
      poly(ctx, [[hx + sd * 5, hy - 10], [hx + sd * 9 - cosR * 5 + sw, hy - 10 - hl], [hx + sd * 2, hy - 9]]); ctx.fill(); ctx.stroke();
    }
    if (tier === 3) { ctx.fillStyle = '#fde68a'; for (const sd of [-1, 1]) poly(ctx, [[hx + sd * 3, hy - 13], [hx + sd * 5 + sw, hy - 24], [hx + sd * 1, hy - 12]]), ctx.fill(); }
    // back of the helm
    ctx.fillStyle = this.pal('plate2'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    poly(ctx, [[hx - cosR * 11, hy + 6], [hx - cosR * 12, hy - 8], [hx - cosR * 4, hy - 13], [hx + 2, hy + 3]]); ctx.fill(); ctx.stroke();
    // shell
    ctx.fillStyle = this.pal('plate');
    poly(ctx, [[hx - 10.4, hy + 6], [hx - 11, hy - 6], [hx - 5, hy - 13.5], [hx + 5, hy - 13.5], [hx + 11, hy - 6], [hx + 10.4, hy + 6], [hx + 5, hy + 10.6], [hx - 5, hy + 10.6]]); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = this.pal('trim'); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 13); ctx.lineTo(hx, hy - 8); ctx.lineTo(hx + 3, hy - 13); ctx.stroke();
    if (face) {
      const fx = hx + cosR * 3;
      // visor band
      ctx.fillStyle = '#05070d'; poly(ctx, [[fx - 8.4, hy - 4], [fx + 8.4, hy - 4], [fx + 7, hy + 2.6], [fx - 7, hy + 2.6]]); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = eye; ctx.globalAlpha = 0.95;
      poly(ctx, [[fx - 7, hy - 2.6], [fx - 1.2, hy - 2], [fx - 1.8, hy + 0.8], [fx - 6.4, hy + 0.4]]); ctx.fill();
      poly(ctx, [[fx + 7, hy - 2.6], [fx + 1.2, hy - 2], [fx + 1.8, hy + 0.8], [fx + 6.4, hy + 0.4]]); ctx.fill();
      ctx.globalAlpha = 0.25; ctx.fillRect(fx - 9, hy - 5, 18, 8); ctx.restore();
      // mask: a lower plate with vents
      ctx.fillStyle = this.pal('plate2'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      poly(ctx, [[fx - 6.6, hy + 2.6], [fx + 6.6, hy + 2.6], [fx + 4.6, hy + 9.6], [fx - 4.6, hy + 9.6]]); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#05070d'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(fx - 2.6, hy + 5 + i * 1.6); ctx.lineTo(fx + 2.6, hy + 5 + i * 1.6); } ctx.stroke();
      // cheek vents
      glowLine(ctx, gc, 1.2, 0.8, () => { ctx.moveTo(fx - 9, hy + 2); ctx.lineTo(fx - 7, hy + 5); ctx.moveTo(fx + 9, hy + 2); ctx.lineTo(fx + 7, hy + 5); });
    }
    ctx.restore();
  };
})();
