// =========================================================================
// UNBOUND_RIG.JS — how the Unbound looks and moves
//
// "Slacker": a loose school uniform in muted greys and navy, messy dark hair, an undone tie, and the JACKET hooked on one shoulder by a
// finger, hanging down his back. He looks like the least threatening person in the room. The only hint is the pair of LIMITER
// BRACERS on both forearms: matte-black cuffs whose cracks light up in the colour of the Release that is currently winning
// (blue beam / red hellzone / gold press) as Restraint fills. Weapon enhancement glow sits OUTSIDE the cuffs in silver-white.
//   • Armor tier changes the uniform: plain · vest and armband · gold-trimmed collar and a faint inner light
//   • Bracer tiers (weaponModelId): brc_iron · brc_abyss (crimson trim) · brc_sovereign (gold and violet)
//   • T: the jacket is thrown off, and the silver power-up aura only appears AFTER the boss is in his hand
// Plugs into BreakerPlayer25D.draw(): applyPoseHook(P), drawRig* parts and drawColossalGreatsword(…) (the weapon slot, used for the palm).
// =========================================================================
(function () {
  const UP = UnboundPlayer25D.prototype;
  const TILT = () => (typeof PERSPECTIVE_TILT !== 'undefined' ? PERSPECTIVE_TILT : 0.55);
  const c01 = (t) => Math.max(0, Math.min(1, t));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eo = (t) => 1 - Math.pow(1 - c01(t), 3);
  const OUT = '#0b0f19';
  const poly = (ctx, pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };
  const seg = (ctx, a, b, w0, w1, fill, stroke) => {
    const ang = Math.atan2(b.sy - a.sy, b.sx - a.sx), len = Math.hypot(b.sx - a.sx, b.sy - a.sy);
    ctx.save(); ctx.translate(a.sx, a.sy); ctx.rotate(ang);
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-2, -w0); ctx.lineTo(len + 1, -w1); ctx.lineTo(len + 1, w1); ctx.lineTo(-2, w0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  // Two limb segments (a-b, b-c) as smooth rounded tubes with one outline around the whole pair: no joint circles or seams at the
  // elbow / knee. The second fill goes down first so the first segment's round end laps over it (a rolled sleeve, a trouser leg).
  const tubes = (ctx, a, b, c, w1, w2, f1, f2) => {
    const line = (p, q, w) => { ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); ctx.lineWidth = w; ctx.stroke(); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = OUT; line(a, b, w1 + 2.4); line(b, c, w2 + 2.4);
    ctx.strokeStyle = f2; line(b, c, w2);
    ctx.strokeStyle = f1; line(a, b, w1);
    ctx.restore();
  };
  const showVfxOf = (p) => p.isLocal || !window.fx || window.fx.showAllyVfx !== false;

  // Bracer materials per weapon tier
  const CUFF = {
    brc_iron: { body: '#1a1d27', edge: '#6b7588', trim: '#94a3b8', glowK: 1.0 },
    brc_abyss: { body: '#17101a', edge: '#7a3445', trim: '#e11d48', glowK: 1.15 },
    brc_sovereign: { body: '#130f20', edge: '#6d58a0', trim: '#fbbf24', glowK: 1.3 },
    brc_lullaby: { body: '#e9e6f2', edge: '#2a4a8f', trim: '#f5c542', glowK: 1.4 }
  };
  const cuffOf = (p) => CUFF[p.weaponModelId] || CUFF.brc_iron;
  const hexToRgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

  // ---- uniform colours (the character picks the cloth colour; the armor tier adds trim) ----
  UP.tierOf = function () { return Math.max(1, Math.min(3, this.armorTier || 1)); };
  UP.jacketCol = function () { return this.lk('cloth', '#566474', 1); };
  UP.jacketDark = function () { return this.lk('cloth', '#3f4a58', 0.72); };
  UP.pantsCol = function () { return this.lk('cloth', '#2f3846', 0.55); };
  UP.shirtCol = function () { return this.tierOf() === 3 ? '#f1f5f9' : '#e2e8f0'; };
  UP.tieCol = function () { return this.lk('accent', '#ef4444'); };
  UP.skinCol = function () { return this.lk('skin', '#e0ac80'); };
  UP.hairCol = function () { return this.lk('hair', '#1f1410'); };
  // the colour of the cracks: whichever Release is currently winning
  UP.glowCol = function () { return this.form ? this.form.col : '#38bdf8'; };

  // ---------------------------------------------------------------------------
  // POSES
  // ---------------------------------------------------------------------------
  UP.applyPoseHook = function (P) {
    const a = this.act;
    const sweep = (ang, up, reach, rUpAdd) => {           // right hand swings on an arc in front of him
      P.rHandLocal = { fwd: Math.cos(ang) * reach, side: Math.sin(ang) * reach + 8, up };
      P.swordTipLocal = { fwd: Math.cos(ang) * (reach + 10), side: Math.sin(ang) * (reach + 10) + 8, up: up + (rUpAdd || 0) };
    };
    // the left hand keeps hooking the jacket on his shoulder unless an action needs it
    const jacketHand = () => { P.lHandLocal = { fwd: 2, side: -12, up: 55 + (P.breatheZ || 0) * 0.4 }; };
    if (!a) { this.poseNoAct(P, jacketHand); return; }
    const p = c01(a.t / Math.max(0.01, a.dur));
    // Crisp strikes: a short wind-up, a snap through to the strike pose exactly on the hit frame, a brief hold, then a quick recover.
    // v runs -1 (wound up) .. 0 (rest) .. +1 (struck); the pose blends from rest toward the wind-up or the strike.
    const crisp = (tHit, wind = 0.1, hold = 0.09, rec = 0.2) => {
      const t = a.t;
      if (t < tHit - wind) return 0;
      if (t < tHit - 0.025) return -eo((t - (tHit - wind)) / (wind - 0.025));
      if (t < tHit) return -1 + 2 * ((t - (tHit - 0.025)) / 0.025);
      if (t < tHit + hold) return 1;
      return 1 - eo((t - tHit - hold) / rec);
    };
    const mix3 = (v, rest, wnd, str) => v < 0 ? lerp(rest, wnd, -v) : lerp(rest, str, v);
    const hand = (v, rest, wnd, str) => ({ fwd: mix3(v, rest[0], wnd[0], str[0]), side: mix3(v, rest[1], wnd[1], str[1]), up: mix3(v, rest[2], wnd[2], str[2]) });
    const REST = [4, 16, 34];
    switch (a.kind) {
      case 'b': {
        const sd = a.step % 2 ? 1 : -1, v = crisp((a.last ? 0.5 : 0.42) * a.dur, 0.12, 0.07, 0.16);
        sweep(mix3(v, 0, -sd * 1.3, sd * 1.2), 46, 28); jacketHand();
        P.torsoYaw = sd * mix3(v, 0, -0.35, 0.45); P.torsoLeanFwd = (P.torsoLeanFwd || 0) + mix3(v, 0, -2, 5);
        break;
      }
      case 'q': {
        const v = crisp(0.18, 0.1, 0.1, 0.18);
        P.rHandLocal = hand(v, REST, [2, 12, 50], [34, 10, 52]); P.swordTipLocal = { fwd: P.rHandLocal.fwd + 10, side: 10, up: P.rHandLocal.up }; jacketHand();
        P.torsoLeanFwd = (P.torsoLeanFwd || 0) + mix3(v, 0, -1, 4);
        break;
      }
      case 'w': if (a.kind === 'w' && a.stage >= 2) {          // landed past the boss, facing away: relaxed, one fist loose, the afterimages do the work
        P.rHandLocal = { fwd: 6, side: 14, up: 32 }; P.swordTipLocal = { fwd: 16, side: 16, up: 28 }; jacketHand(); P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 1; break;
      } // falls through to the dash crouch
      case 'a': {
        P.rHandLocal = { fwd: -6, side: 16, up: 34 }; P.lHandLocal = { fwd: -4, side: -16, up: 36 }; P.swordTipLocal = { fwd: -30, side: 18, up: 30 };
        P.torsoLeanFwd = 18; P.crouchZ = -9; break;
      }
      case 'e': {
        const v = crisp(0.32, 0.14, 0.1, 0.22);
        P.rHandLocal = hand(v, REST, [-2, 10, 44], [40, 8, 48]); P.swordTipLocal = { fwd: P.rHandLocal.fwd + 10, side: 8, up: P.rHandLocal.up }; jacketHand();
        P.torsoLeanFwd = (P.torsoLeanFwd || 0) + mix3(v, 0, -4, 10); P.crouchZ = mix3(v, 0, 2, -3);
        break;
      }
      case 'r': {
        const e = eo(a.t / 0.3), d = c01((a.t - 0.28) / 0.25);
        P.rHandLocal = { fwd: 20, side: 10, up: 70 - 36 * d }; P.swordTipLocal = { fwd: 40, side: 10, up: 62 - 36 * d }; jacketHand();
        P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 4 * e; break;
      }
      case 's': {
        const v = crisp(0.12, 0.08, 0.12, 0.18);
        sweep(mix3(v, 0, -1.0, 0.9), mix3(v, 34, 40, 68), 30); jacketHand(); P.torsoYaw = mix3(v, 0, 0.3, -0.45); break;
      }
      case 'd': {
        const v = crisp(0.26, 0.12, 0.12, 0.2);
        P.rHandLocal = hand(v, REST, [12, 9, 46], [36, 6, 50]); P.lHandLocal = { fwd: 6, side: -12, up: 34 }; P.swordTipLocal = { fwd: P.rHandLocal.fwd + 10, side: 7, up: 50 };
        P.torsoLeanFwd = (P.torsoLeanFwd || 0) + mix3(v, 0, -2, 4); break;
      }
      case 'f': {
        const v = crisp(0.44, 0.2, 0.12, 0.25);
        sweep(mix3(v, 0, -1.6, 1.4), 50, 30); jacketHand(); P.torsoYaw = mix3(v, 0, -0.6, 0.7); P.torsoLeanFwd = (P.torsoLeanFwd || 0) + mix3(v, 0, -3, 7);     // across to the left, then out to the right
        break;
      }
      case 'z': this.poseZ(P, a, jacketHand); break;
      case 't': this.poseT(P, a); break;
      default: jacketHand();
    }
  };

  // The Releases, all done like it is nothing: the free hand stays on the jacket, no big stance, weight on one leg.
  UP.poseZ = function (P, a, jacketHand) {
    const R = window.UB_RELEASE, t = a.t;
    if (a.form === 'beam') {
      // one arm lifted straight out, open palm, as if holding a door; the point of light gathers past his fingertips
      const e = eo(t / 0.3), fire = t >= R.UB_BEAM_CHG, ft = t - R.UB_BEAM_CHG;
      const kick = fire && ft < 0.15 ? 1 - ft / 0.15 : 0;
      P.rHandLocal = { fwd: lerp(8, 40, e) - 6 * kick, side: lerp(14, 6, e), up: lerp(34, 52, e) + 3 * kick };
      P.swordTipLocal = { fwd: P.rHandLocal.fwd + 10, side: 6, up: P.rHandLocal.up };
      jacketHand();
      P.torsoYaw = 0.22 * e; P.torsoLeanFwd = (P.torsoLeanFwd || 0) - 2 * e - 4 * kick; P.headPitchZ = (P.headPitchZ || 0) - 1.2 * e;
    } else if (a.form === 'hell') {
      // two fingers up while the orbs appear, then arms open and a soft clap
      const H = R.UB_HELL;
      if (t < H.CLAP - 0.35) {
        const e = eo(t / 0.3);
        P.rHandLocal = { fwd: lerp(4, 22, e), side: 12, up: lerp(34, 58, e) }; jacketHand();
        P.headPitchZ = (P.headPitchZ || 0) - 1.5 * e;
      } else if (t < H.CLAP) {
        const o = eo((t - (H.CLAP - 0.35)) / 0.2);                  // arms open wide
        P.rHandLocal = { fwd: lerp(22, 12, o), side: lerp(12, 34, o), up: lerp(58, 50, o) };
        P.lHandLocal = { fwd: lerp(2, 12, o), side: lerp(-12, -34, o), up: lerp(55, 50, o) };
      } else {
        const c = eo((t - H.CLAP) / 0.06), r = c01((t - H.CLAP - 0.5) / 0.4);   // together, a beat, then back to the jacket
        P.rHandLocal = { fwd: lerp(lerp(12, 28, c), 4, r), side: lerp(lerp(34, 3, c), 16, r), up: lerp(50, 34, r) };
        P.lHandLocal = r > 0.5 ? { fwd: 2, side: -12, up: 55 } : { fwd: lerp(12, 28, c), side: lerp(-34, -3, c), up: 50 };
        P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 2 * c * (1 - r);
      }
      P.swordTipLocal = { fwd: P.rHandLocal.fwd + 10, side: P.rHandLocal.side, up: P.rHandLocal.up };
    } else {
      // palm down at shoulder height, patting the air; the giant hand mirrors it
      const e = eo(t / 0.35), hz = a.hz == null ? 360 : a.hz;
      const up = lerp(34, 30 + 38 * c01(hz / 380), e);
      P.rHandLocal = { fwd: lerp(8, 30, e), side: 9, up }; P.swordTipLocal = { fwd: P.rHandLocal.fwd + 12, side: 9, up };
      jacketHand();
      P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 3 * (1 - c01(hz / 380)); P.headPitchZ = (P.headPitchZ || 0) - 1 * e;
    }
  };

  UP.poseT = function (P, a) {
    const ph = a.phase, bs = a.boss;
    if (ph === 'throw' || ph === 'bounce') {
      const e = eo(a.phaseT / 0.3);
      P.lHandLocal = { fwd: 2 - 10 * e, side: -12 - 14 * e, up: 55 - 6 * e };            // the hand lets the jacket go, flinging it back
      P.rHandLocal = { fwd: 14, side: 14, up: 36 }; P.swordTipLocal = { fwd: 28, side: 14, up: 34 };
      P.torsoYaw = -0.4 * e; P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 3;
      if (ph === 'bounce') { P.rHandLocal = { fwd: 24, side: 8, up: 46 }; P.torsoLeanFwd += 5; }
    } else if (ph === 'grab') {
      // one hand reaches out and closes on the boss; the other hangs loose at his side
      const e = eo(a.phaseT / 0.3);
      P.rHandLocal = { fwd: lerp(14, 38, e), side: lerp(14, 6, e), up: lerp(36, 56, e) }; P.swordTipLocal = { fwd: P.rHandLocal.fwd + 10, side: 6, up: 56 };
      P.lHandLocal = { fwd: -2, side: -15, up: 30 };
      P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 6 * e; P.crouchZ = -2 * e;
    } else if (ph === 'power') {
      // he powers up with the boss still dangling from one hand: feet wide, knees bent, the free fist clenched at the ribs, chin down
      const c = eo(a.phaseT / 0.25), sh = Math.sin(a.phaseT * 52) * 0.7 * c;
      P.rHandLocal = { fwd: 38, side: 6, up: 56 + sh }; P.swordTipLocal = { fwd: 48, side: 6, up: 56 };
      P.lHandLocal = { fwd: lerp(-2, 9, c), side: lerp(-15, -25, c), up: lerp(30, 41, c) - sh };
      P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 3 * c; P.crouchZ = -5 * c + sh * 0.5; P.headPitchZ = -1.8 * c;
    } else if (ph === 'toss') {
      // one arm does all of it: raised overhead on the way up, whipped down through the slam
      const up = a.up || 0, falling = !!a.falling, k = Math.min(4, a.n || 0);
      const handUp = falling ? lerp(18, 96, up) : lerp(52, 96, up);
      P.rHandLocal = { fwd: falling ? lerp(44, 26, up) : lerp(36, 22, up), side: 6, up: handUp }; P.swordTipLocal = { fwd: P.rHandLocal.fwd + 10, side: 6, up: handUp };
      P.lHandLocal = { fwd: -4, side: -18, up: 32 };
      P.torsoLeanFwd = (P.torsoLeanFwd || 0) + (falling ? (4 + 3 * k) * (1 - up) : -4 * up);   // he leans harder into each slam
      P.crouchZ = falling ? -(3 + k * 1.5) * (1 - up) : 2 * up;
    } else {
      P.rHandLocal = { fwd: 10, side: 15, up: 34 }; P.lHandLocal = { fwd: 8, side: -15, up: 34 }; P.swordTipLocal = { fwd: 24, side: 15, up: 30 };
    }
  };

  // Idle / walk / hit reactions.
  UP.poseNoAct = function (P, jacketHand) {
    const st = this.state, sd = P.strideDiff || 0;
    if (st === 'idle' || st === 'walk') {
      // hands-in-no-pockets: the right arm hangs loose and swings a little, the left hooks the jacket on his shoulder
      const spd = Math.min(1, (this.speed || 0) / 200);
      P.rHandLocal = { fwd: 4 + sd * 1.6, side: 16, up: 30 + (P.breatheZ || 0) * 0.5 };
      P.swordTipLocal = { fwd: 16, side: 18, up: 26 };
      jacketHand();
      P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 0.5 + spd * 3;
      P.headPitchZ = (P.headPitchZ || 0) - 0.5;
      return;
    }
    if (st === 'hit_stagger') {
      const f = Math.sin(c01(P.p) * Math.PI);
      P.rHandLocal = { fwd: 8, side: 20, up: 28 }; P.lHandLocal = { fwd: 6, side: -14, up: 40 }; P.swordTipLocal = { fwd: 24, side: 22, up: 24 }; P.torsoLeanFwd = -9 * f; P.crouchZ = -4 * f; P.headPitchZ = -3 * f;
    } else if (st === 'hit_knockback') {
      const r = 1 - c01(P.p) * 0.6;
      P.rHandLocal = { fwd: 6, side: 26, up: 40 }; P.lHandLocal = { fwd: 4, side: -22, up: 38 }; P.swordTipLocal = { fwd: 14, side: 30, up: 36 }; P.torsoLeanFwd = -13 * r; P.crouchZ = -8 * r;
    } else if (st === 'hit_knockdown') {
      if (P.p < 0.46) { P.rHandLocal = { fwd: -10, side: 30, up: 52 }; P.lHandLocal = { fwd: -6, side: -26, up: 50 }; P.swordTipLocal = { fwd: -20, side: 34, up: 56 }; P.torsoLeanFwd = -22; P.crouchZ = -6; }
      else { P.rHandLocal = { fwd: 4, side: 34, up: 10 }; P.lHandLocal = { fwd: 2, side: -30, up: 12 }; P.swordTipLocal = { fwd: 14, side: 36, up: 8 }; P.torsoLeanFwd = -30; P.crouchZ = -22; }
    } else if (st === 'wakeup_roll') {
      P.rHandLocal = { fwd: 10, side: 10, up: 20 }; P.lHandLocal = { fwd: 10, side: -6, up: 20 }; P.swordTipLocal = { fwd: 20, side: 12, up: 18 }; P.torsoLeanFwd = 32; P.crouchZ = -20;
    } else if (st === 'space_dash') {
      P.rHandLocal = { fwd: 4, side: 16, up: 34 }; P.lHandLocal = { fwd: 20, side: -10, up: 40 }; P.swordTipLocal = { fwd: 10, side: 18, up: 30 }; P.torsoLeanFwd = 26; P.crouchZ = -12; P.torsoYaw = 0.4;
    } else if (st === 'clash_lock' || this.clashQteActive) {
      P.rHandLocal = { fwd: 30, side: 6, up: 64 }; P.lHandLocal = { fwd: 26, side: -6, up: 64 }; P.swordTipLocal = { fwd: 36, side: 6, up: 64 }; P.torsoLeanFwd = 10; P.crouchZ = -8;
    } else jacketHand();
  };

  // ---------------------------------------------------------------------------
  // draw(): the aura behind, the body, then the effects on top
  // ---------------------------------------------------------------------------
  const baseDraw = BreakerPlayer25D.prototype.draw;
  UP.draw = function (ctx) {
    if (this.hp <= 0) { baseDraw.call(this, ctx); return; }
    const ga = this.ghostA || 0;                                // Afterimage Step: he fades out and back in
    if (ga > 0.02) { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - ga); }
    this.drawAura(ctx, false);
    baseDraw.call(this, ctx);
    this.drawAura(ctx, true);
    if (ga > 0.02) ctx.restore();
    this.drawOverlays(ctx);
  };

  // The silver power-up: a ground ring, a tall soft glow and flickering wisps. Back half behind him, front wisps over him.
  UP.drawAura = function (ctx, front) {
    const k = this.aura || 0;
    if (k < 0.03 || !showVfxOf(this)) return;
    const t = performance.now() * 0.001, T = TILT();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (!front) {
      ctx.save(); ctx.translate(this.x, this.y); ctx.scale(1, T);
      const R = 30 + 12 * k + Math.sin(t * 9) * 2;
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 1.5);
      g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(0.45, 'rgba(203,213,225,0.35)'); g.addColorStop(1, 'rgba(148,163,184,0)');
      ctx.globalAlpha = 0.85 * k; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7 * k; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a0 = t * 3.4 + i * 2.09; ctx.beginPath(); ctx.arc(0, 0, R * 0.8, a0, a0 + 1.0); ctx.stroke(); }
      ctx.restore();
      // the tall glow behind the body
      const g2 = ctx.createLinearGradient(0, this.y + 4, 0, this.y - 110);
      g2.addColorStop(0, 'rgba(226,232,240,0.55)'); g2.addColorStop(1, 'rgba(226,232,240,0)');
      ctx.globalAlpha = 0.5 * k * (0.85 + 0.15 * Math.sin(t * 13)); ctx.fillStyle = g2;
      ctx.beginPath(); ctx.ellipse(this.x, this.y - 44, 30 + 6 * k, 66, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {                              // wisps licking upward off the body
        const ph = (t * 1.6 + i * 0.37) % 1, ox = Math.sin(i * 2.3 + t * 2) * 17;
        ctx.globalAlpha = (1 - ph) * 0.7 * k; ctx.lineWidth = 2.4 * (1 - ph) + 0.6;
        ctx.beginPath(); ctx.moveTo(this.x + ox, this.y - 10 - ph * 8); ctx.quadraticCurveTo(this.x + ox + Math.sin(t * 5 + i) * 6, this.y - 40 - ph * 40, this.x + ox * 0.6, this.y - 70 - ph * 56); ctx.stroke();
      }
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // OVERLAYS: beams, flicks, orbs, the press disc's top, the thrown jacket
  // ---------------------------------------------------------------------------
  UP.drawOverlays = function (ctx) {
    const show = showVfxOf(this), T = TILT(), t = performance.now() * 0.001;
    if (show && this.beams.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const b of this.beams) {
        const k = 1 - b.t / b.dur, ex = b.x0 + Math.cos(b.ang) * b.len, ey = b.y0 + Math.sin(b.ang) * b.len * T;
        const w = b.w * (0.5 + 0.5 * k);
        if (b.w >= 22) { ctx.globalAlpha = 0.28 * k; ctx.strokeStyle = b.col; ctx.lineWidth = w * 1.5; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(ex, ey); ctx.stroke(); }
        ctx.strokeStyle = b.col; ctx.globalAlpha = 0.7 * k; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, w * 0.38); ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(ex, ey); ctx.stroke();
        if (b.w >= 22) {
          ctx.globalAlpha = 0.55 * k; ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.x0, b.y0, w * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(ex, ey, w * 1.1, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = k; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x0, b.y0, w * 0.36, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
    if (show && this.bolts.length) {
      ctx.save(); ctx.lineCap = 'round';
      for (const b of this.bolts) {
        if (b.kind === 'orb') {
          if (!b.vis) continue;
          const py = b.y - (b.z || 0), col = '#ef4444';
          ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 10, 4, 0, 0, Math.PI * 2); ctx.fill();      // its shadow on the floor
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(b.x, py, 1, b.x, py, 22);
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fecaca'); g.addColorStop(0.6, 'rgba(239,68,68,0.6)'); g.addColorStop(1, 'rgba(239,68,68,0)');
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, py, 22, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(b.x, py); ctx.lineTo(b.x - (b.tx - b.sx) * 0.02, py + 18); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        } else {
          const ca = Math.cos(b.ang), sa = Math.sin(b.ang) * T;
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(226,232,240,0.5)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(b.x - ca * 30, b.y - 38 - sa * 30); ctx.lineTo(b.x, b.y - 38); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x - ca * 24, b.y - 38 - sa * 24); ctx.lineTo(b.x, b.y - 38); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.restore();
    }
    // the smack: a fast flat burst where a palm lands (a ring and short rays, gone in a blink)
    for (const e of this.vfx) {
      if (e.kind !== 'smack' || !show) continue;
      const u = c01(e.t / e.dur), r = 10 + 46 * eo(u), a = 1 - u;
      ctx.save(); ctx.translate(e.x, e.y); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2.4 * a + 0.6; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2 + 0.3, r0 = r * 0.6, r1 = r * (1.15 + 0.35 * (i % 2)); ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0 * 0.7); ctx.lineTo(Math.cos(an) * r1, Math.sin(an) * r1 * 0.7); }
      ctx.stroke(); ctx.restore();
    }
    // an afterimage punch landing: an impact burst of jagged white shards around a dark core, one long spike thrown out,
    // a spray of white flecks and thin black speed lines. The shape is rolled once per hit, so no two punches look alike.
    for (const e of this.vfx) {
      if (e.kind !== 'punch' || !show) continue;
      if (!e.burst) {
        const rnd = (a, b) => a + Math.random() * (b - a), S = e.big ? 1.7 : 1;
        const spike = rnd(-Math.PI, Math.PI);
        e.burst = {
          shards: Array.from({ length: e.big ? 11 : 8 }, (_, i) => ({ an: i / (e.big ? 11 : 8) * Math.PI * 2 + rnd(-0.3, 0.3), r0: rnd(6, 12) * S, len: rnd(20, 44) * S, w: rnd(1.8, 3.8) * S, kink: rnd(-0.25, 0.25) })),
          spike: { an: spike, r0: 8 * S, len: rnd(60, 80) * S, w: 4.5 * S, kink: rnd(-0.12, 0.12) },
          flecks: Array.from({ length: e.big ? 14 : 9 }, () => ({ an: rnd(0, Math.PI * 2), r: rnd(10, 30) * S, sp: rnd(30, 60) * S, s: rnd(1.5, 3.5) })),
          lines: Array.from({ length: e.big ? 7 : 4 }, () => ({ an: rnd(0, Math.PI * 2), r: rnd(28, 48) * S, len: rnd(10, 24) * S })),
          S
        };
      }
      const B = e.burst, u = c01(e.t / e.dur), a = 1 - u * u, grow = 0.55 + 0.45 * eo(c01(u * 2.5)), squash = 0.75;
      // one jagged shard: a thin tapered blade with a slight bend, pointing out from the centre
      const shard = (sh, k) => {
        const ca = Math.cos(sh.an), sa = Math.sin(sh.an) * squash, px = -sa, py = ca;
        const r0 = sh.r0, r1 = sh.r0 + sh.len * k, rm = (r0 + r1) * 0.5, bend = sh.kink * sh.len * k;
        ctx.beginPath();
        ctx.moveTo(ca * r0 + px * sh.w, sa * r0 + py * sh.w);
        ctx.lineTo(ca * rm + px * (sh.w * 0.4 + bend), sa * rm + py * (sh.w * 0.4 + bend));
        ctx.lineTo(ca * r1 + px * bend * 0.5, sa * r1 + py * bend * 0.5);
        ctx.lineTo(ca * rm - px * (sh.w * 0.3 - bend), sa * rm - py * (sh.w * 0.3 - bend));
        ctx.lineTo(ca * r0 - px * sh.w, sa * r0 - py * sh.w);
        ctx.closePath(); ctx.fill();
      };
      ctx.save(); ctx.translate(e.x, e.y);
      // the dark core: a smudge of shadow where the fist landed
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 16 * B.S);
      core.addColorStop(0, 'rgba(8,10,16,0.75)'); core.addColorStop(1, 'rgba(8,10,16,0)');
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = core; ctx.beginPath(); ctx.ellipse(0, 0, 16 * B.S, 16 * B.S * squash, 0, 0, Math.PI * 2); ctx.fill();
      // thin black speed lines flying out past the burst
      ctx.strokeStyle = '#05070b'; ctx.lineCap = 'round'; ctx.lineWidth = 1.4; ctx.globalAlpha = a * 0.85;
      ctx.beginPath();
      for (const l of B.lines) { const ca = Math.cos(l.an), sa = Math.sin(l.an) * squash, r = l.r * (0.8 + 0.6 * u); ctx.moveTo(ca * r, sa * r); ctx.lineTo(ca * (r + l.len), sa * (r + l.len)); }
      ctx.stroke();
      // the white shards, glowing
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = '#e2e8f0'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a;
      for (const sh of B.shards) shard(sh, grow);
      shard(B.spike, 0.6 + 0.4 * eo(c01(u * 3)));
      // flecks scattering outwards
      ctx.shadowBlur = 0;
      for (const f of B.flecks) {
        const r = f.r + f.sp * u, ca = Math.cos(f.an), sa = Math.sin(f.an) * squash;
        ctx.globalAlpha = a * 0.9; ctx.beginPath(); ctx.moveTo(ca * r - sa * f.s, sa * r + ca * f.s * 0.3); ctx.lineTo(ca * (r + f.s * 2.2), sa * (r + f.s * 2.2)); ctx.lineTo(ca * r + sa * f.s, sa * r - ca * f.s * 0.3); ctx.closePath(); ctx.fill();
      }
      // a quick bright pop in the first frames
      if (u < 0.3) { ctx.globalAlpha = (1 - u / 0.3) * 0.8; ctx.beginPath(); ctx.ellipse(0, 0, 9 * B.S, 9 * B.S * squash, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // the thrown jacket lying or flying
    for (const e of this.vfx) {
      if (e.kind !== 'jacket') continue;
      const fade = e.t > e.dur - 0.8 ? c01((e.dur - e.t) / 0.8) : 1;
      ctx.save(); ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(e.x, e.y, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(e.x, e.y - e.z - 6); ctx.rotate(e.rot);
      ctx.fillStyle = this.jacketCol(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
      poly(ctx, [[-13, -7], [-4, -9], [4, -9], [13, -7], [15, 5], [7, 8], [3, 3], [-3, 3], [-7, 8], [-15, 5]]); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = this.jacketDark(); ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 3); ctx.stroke();
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------------------
  // RELEASES: drawn on the top layer (over the boss), see the ArenaFX hook at the bottom
  // ---------------------------------------------------------------------------
  const FORMS = () => window.UNBOUND_FORMS || {};
  const glowDot = (ctx, x, y, r, core, col) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.28, core); g.addColorStop(0.6, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  UP.drawReleaseTop = function (ctx) {
    const a = this.act;
    if (!a || a.kind !== 'z' || this.hp <= 0 || !showVfxOf(this)) return;
    const F = FORMS()[a.form] || { col: '#38bdf8', core: '#e0f2fe' };
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    if (a.form === 'beam') this.drawBeamRelease(ctx, a, F);
    else if (a.form === 'hell') this.drawHellRelease(ctx, a, F);
    else this.drawPressRelease(ctx, a, F);
    ctx.restore();
  };

  // PALM BEAM: streaks of light pulled in from all around into one point, rings closing on it, then a straight beam with two strands
  // twisting round it and rings racing down its length.
  UP.drawBeamRelease = function (ctx, a, F) {
    const R = window.UB_RELEASE, T = TILT(), t = performance.now() * 0.001;
    const ca = Math.cos(a.ang), sa = Math.sin(a.ang);
    const px = a.px != null ? a.px : this.x + ca * 62, py = a.py != null ? a.py : this.y + sa * 62 * T;
    const sx = px, sy = py - 52;
    if (a.t < R.UB_BEAM_CHG) {
      const c = a.t / R.UB_BEAM_CHG;
      for (let i = 0; i < 26; i++) {                                 // streaks spiralling in
        const ph = (t * 2.4 + i * 0.137) % 1, an = i * 2.39996 + ph * 1.8, r = (1 - ph) * (150 - 40 * c) + 6;
        const x0 = sx + Math.cos(an) * r, y0 = sy + Math.sin(an) * r * 0.8, x1 = sx + Math.cos(an - 0.25) * (r + 22), y1 = sy + Math.sin(an - 0.25) * (r + 22) * 0.8;
        ctx.globalAlpha = Math.min(1, c * 1.6) * ph; ctx.strokeStyle = i % 3 ? F.col : '#ffffff'; ctx.lineWidth = 1.5 + ph * 2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x0, y0); ctx.stroke();
      }
      for (let k = 0; k < 2; k++) {                                  // rings closing in
        const u = (t * 1.8 + k * 0.5) % 1, r = 110 * (1 - u) + 8;
        ctx.globalAlpha = 0.55 * u * c; ctx.strokeStyle = F.core; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; glowDot(ctx, sx, sy, 6 + 26 * c + Math.sin(t * 30) * 1.5, F.core, F.col);
      return;
    }
    const ft = a.t - R.UB_BEAM_CHG, END = R.UB_BEAM_LEN_T;
    let W = 60 + 6 * Math.sin(t * 42), alpha = Math.min(1, ft / 0.06);
    if (ft > END) { const u = c01((ft - END) / 0.35); W = (W + 50) * (1 - u) + 4 * u; alpha = 1 - u * u; }      // the last push, then gone
    if (alpha <= 0.01) return;
    const L = R.UB_BEAM_REACH, scr = Math.atan2(sa * T, ca), len = L * Math.hypot(ca, sa * T);
    ctx.translate(sx, sy); ctx.rotate(scr);
    const grow = Math.min(1, ft / 0.08);                              // it shoots out, it does not just appear
    const Lv = len * grow;
    const g = ctx.createLinearGradient(0, 0, Lv, 0);
    g.addColorStop(0, rgba(F.col, 0.9)); g.addColorStop(0.85, rgba(F.col, 0.7)); g.addColorStop(1, rgba(F.col, 0));
    ctx.globalAlpha = 0.3 * alpha; ctx.fillStyle = g; ctx.fillRect(0, -W * 1.15, Lv, W * 2.3);
    ctx.globalAlpha = 0.85 * alpha; ctx.fillRect(0, -W * 0.6, Lv, W * 1.2);
    const gc = ctx.createLinearGradient(0, 0, Lv, 0); gc.addColorStop(0, '#ffffff'); gc.addColorStop(0.9, rgba('#ffffff', 0.85)); gc.addColorStop(1, rgba('#ffffff', 0));
    ctx.globalAlpha = alpha; ctx.fillStyle = gc; ctx.fillRect(0, -W * 0.22, Lv, W * 0.44);
    ctx.strokeStyle = F.core; ctx.lineWidth = 2.5;                    // two strands twisting round it
    for (let k = 0; k < 2; k++) {
      ctx.globalAlpha = 0.8 * alpha; ctx.beginPath();
      for (let s = 0; s <= Lv; s += 14) { const y = Math.sin(s * 0.028 - t * 26 + k * Math.PI) * W * 0.75; if (s === 0) ctx.moveTo(s, y); else ctx.lineTo(s, y); }
      ctx.stroke();
    }
    ctx.lineWidth = 2;                                                 // rings racing outward along it
    for (let k = 0; k < 7; k++) {
      const s = ((t * 1.9 + k / 7) % 1) * Lv;
      ctx.globalAlpha = 0.7 * alpha * (1 - s / len); ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(s, 0, 5, W * 0.95, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = alpha; glowDot(ctx, 0, 0, W * 1.1, F.core, F.col);
  };

  // HELLZONE: orbs that pop into being around the marker, hover, then all fly into the middle; a ball of fire grows there and bursts.
  UP.drawHellRelease = function (ctx, a, F) {
    const H = window.UB_RELEASE.UB_HELL, t = performance.now() * 0.001;
    const fly = a.clapped ? c01((a.t - H.CLAP) / H.FLY) : 0, fe = fly * fly;
    const cx = a.tx, cy = a.ty, cz = 40;
    for (const o of a.orbs || []) {
      if (fly >= 1) break;
      const age = a.t - o.born, pop = eo(age / 0.15);
      const z = o.z + Math.sin(t * 3 + o.ph) * 6;
      const ox = cx + o.ox, oy = cy + o.oy;
      const x = lerp(ox, cx, fe), y = lerp(oy, cy, fe), h = lerp(z, cz, fe);
      if (age < 0.22) { ctx.globalAlpha = 1 - age / 0.22; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - h, 10 + age * 140, 0, Math.PI * 2); ctx.stroke(); }
      if (!a.clapped) { ctx.globalAlpha = 0.12; ctx.strokeStyle = F.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(cx, cy - cz); ctx.stroke(); }
      if (fly > 0) { ctx.globalAlpha = 0.5; ctx.strokeStyle = F.col; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(lerp(ox, cx, fe * 0.6), lerp(oy, cy, fe * 0.6) - lerp(z, cz, fe * 0.6)); ctx.lineTo(x, y - h); ctx.stroke(); }
      ctx.globalAlpha = 1; glowDot(ctx, x, y - h, 20 * pop * (1 + 0.08 * Math.sin(t * 20 + o.ph)), F.core, F.col);
    }
    if (a.landed) {                                                    // the ball in the middle, swelling until it bursts
      const u = c01((a.t - H.CLAP - H.FLY) / (H.FIN - H.CLAP - H.FLY)), after = a.t - H.FIN;
      let r = 34 + 70 * eo(u) + Math.sin(t * 50) * 4, al = 1;
      if (after > 0) { r = 104 + 260 * eo(after / 0.4); al = 1 - c01(after / 0.45); }
      if (al > 0) {
        ctx.globalAlpha = al; glowDot(ctx, cx, cy - cz, r, F.core, F.col);
        ctx.globalAlpha = 0.6 * al; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        for (let i = 0; i < 10; i++) { const an = i * 0.628 + t * 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * r * 0.5, cy - cz + Math.sin(an) * r * 0.5); ctx.lineTo(cx + Math.cos(an) * r * 1.1, cy - cz + Math.sin(an) * r * 1.1); ctx.stroke(); }
      }
    }
  };

  // GRAVITY PRESS: the back of a colossal hand of gold light, fingers spread, its forearm fading up out of sight.
  UP.drawPressRelease = function (ctx, a, F) {
    const P = window.UB_RELEASE.UB_PRESS, T = TILT(), t = performance.now() * 0.001;
    const hz = a.hz == null ? 360 : a.hz, form = eo(a.t / P.FORM);
    let al = form;
    if (a.t > P.SLAM + 0.5) al *= 1 - c01((a.t - P.SLAM - 0.5) / 0.35);
    if (al <= 0.01) return;
    const S = 1.15, x = a.hx, y = a.hy - hz - 30;
    const flat = a.t >= P.SLAM ? 0.82 : 1;                             // squashed flat against the floor
    ctx.save(); ctx.translate(x, y); ctx.scale(S, S * flat);
    // the forearm: a column of light going up out of frame
    const ga = ctx.createLinearGradient(0, -40, 0, -460);
    ga.addColorStop(0, rgba(F.col, 0.5)); ga.addColorStop(1, rgba(F.col, 0));
    ctx.globalAlpha = al; ctx.fillStyle = ga; poly(ctx, [[-46, -36], [46, -36], [62, -460], [-62, -460]]); ctx.fill();
    // palm and fingers as one glowing shape
    const shape = () => {
      ctx.beginPath(); ctx.ellipse(0, 0, 66, 50, 0, 0, Math.PI * 2);
      const fingers = [[-48, 0.26, 70], [-17, 0.08, 86], [15, -0.06, 82], [44, -0.22, 66]];
      for (const [fx, tilt, len] of fingers) { ctx.save(); ctx.translate(fx, 26); ctx.rotate(tilt); ctx.moveTo(14, 0); ctx.ellipse(0, len * 0.5, 14, len * 0.55, 0, 0, Math.PI * 2); ctx.restore(); }
      ctx.save(); ctx.translate(-62, -6); ctx.rotate(0.95); ctx.moveTo(16, 0); ctx.ellipse(0, 30, 15, 38, 0, 0, Math.PI * 2); ctx.restore();   // thumb
    };
    ctx.shadowColor = F.col; ctx.shadowBlur = 26;
    const gf = ctx.createLinearGradient(0, -50, 0, 120);
    gf.addColorStop(0, rgba(F.core, 0.32)); gf.addColorStop(1, rgba(F.col, 0.22));
    ctx.globalAlpha = al; ctx.fillStyle = gf; shape(); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = F.core; ctx.lineWidth = 3; shape(); ctx.stroke();
    ctx.globalAlpha = 0.5 * al; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;   // knuckle line and a shimmer across the back
    ctx.beginPath(); ctx.moveTo(-50, 22); ctx.quadraticCurveTo(0, 30, 48, 20); ctx.stroke();
    const sh = ((t * 0.7) % 1) * 160 - 80;
    ctx.globalAlpha = 0.35 * al; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(sh - 20, -40); ctx.lineTo(sh + 20, 60); ctx.stroke();
    ctx.restore();
  };

  // Floor parts of the Releases: the Hellzone marker and the shadow of the giant hand.
  UP.drawReleaseFloor = function (ctx) {
    const a = this.act;
    if (!a || a.kind !== 'z' || this.hp <= 0) return;
    const T = TILT(), t = performance.now() * 0.001, F = FORMS()[a.form] || { col: '#38bdf8' };
    if (a.form === 'hell') {
      const H = window.UB_RELEASE.UB_HELL, R = window.UB_RELEASE.UB_HELL_R;
      const al = c01(a.t / 0.15) * (a.t > H.FIN ? 1 - c01((a.t - H.FIN) / 0.3) : 1);
      if (al <= 0) return;
      ctx.save(); ctx.translate(a.tx, a.ty); ctx.scale(1, T); ctx.globalAlpha = al;
      const r = R * (0.85 + 0.15 * eo(a.t / 0.25));
      ctx.fillStyle = rgba(F.col, 0.1); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = F.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([18, 12]); ctx.lineDashOffset = -t * 40; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + t * 0.6; ctx.moveTo(Math.cos(an) * r * 0.86, Math.sin(an) * r * 0.86); ctx.lineTo(Math.cos(an) * r * 1.08, Math.sin(an) * r * 1.08); }
      ctx.stroke();
      ctx.globalAlpha = al * 0.8; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (a.form === 'press') {
      const P = window.UB_RELEASE.UB_PRESS, hz = a.hz == null ? 360 : a.hz;
      const al = eo(a.t / P.FORM) * (a.t > P.SLAM + 0.5 ? 1 - c01((a.t - P.SLAM - 0.5) / 0.35) : 1);
      if (al <= 0) return;
      const k = 1 - c01(hz / 400), r = 90 + 70 * (1 - k);              // closer = smaller and darker
      ctx.save(); ctx.translate(a.hx, a.hy); ctx.scale(1, T);
      ctx.globalAlpha = al * (0.25 + 0.45 * k); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = al * 0.7; ctx.strokeStyle = F.col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, r + 12, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  };

  // Floor decals: the gravity disc of Press and Gravity Press (drawn by main.js under every character).
  UP.drawFloorVfx = function (ctx) {
    if (!showVfxOf(this)) return;
    this.drawReleaseFloor(ctx);
    if (!this.vfx || !this.vfx.length) return;
    const T = TILT(), t = performance.now() * 0.001;
    const bs = window.game ? window.game.getActiveBossTarget() : null;
    for (const e of this.vfx) {
      if (e.kind !== 'press') continue;
      if (e.follow && bs && bs.hp > 0) { e.x = bs.x; e.y = bs.y; }
      const u = c01(e.t / e.dur), fade = u < 0.1 ? u / 0.1 : (u > 0.82 ? (1 - u) / 0.18 : 1), R = e.r * (e.big ? 1 + 0.08 * Math.sin(t * 8) : 1) * (0.6 + 0.4 * eo(u * 4));
      ctx.save(); ctx.translate(e.x, e.y); ctx.scale(1, T); ctx.globalAlpha = fade;
      const col = e.col || '#facc15';
      ctx.fillStyle = rgba(col, 0.14); ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const an = -t * 2.4 + i * 1.57; ctx.moveTo(Math.cos(an) * R * 0.45, Math.sin(an) * R * 0.45); ctx.lineTo(Math.cos(an + 0.7) * R * 0.95, Math.sin(an + 0.7) * R * 0.95); } ctx.stroke();
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------------------
  // THE WEAPON SLOT is empty: his weapon is the bracers, drawn with the arms. This only draws the enhancement shine on the forearms.
  // ---------------------------------------------------------------------------
  UP.drawColossalGreatsword = function () { };

  // ---------------------------------------------------------------------------
  // THE BODY
  // ---------------------------------------------------------------------------
  // The jacket: hooked on the left shoulder, hanging down his back like a short cape. It is gone while he is doing Toss Around.
  UP.drawRigCloak = function (ctx, J) {
    if (this.act && this.act.kind === 't' && this.act.phase !== 'bounce') return;
    const { lShoulder: lS, rShoulder: rS, neck, pelvis, lHand, cosR, sinR } = J;
    const t = performance.now() * 0.001, sp = Math.min(1, (this.speed || 0) / 200);
    const sway = Math.sin(t * 2.4) * 1.2 + sp * (-4) + (this.walkWeight || 0) * Math.sin(t * 9) * 1.6;
    const back = -cosR * 5;                                          // hangs behind him
    const jc = this.jacketCol(), jd = this.jacketDark();
    ctx.save();
    ctx.fillStyle = jc; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    const topY = Math.min(lS.sy, rS.sy) - 3, botY = pelvis.sy + 12 + sp * 3;
    // a loose drape off the left shoulder: narrow, tapering, with a wavy hem, not a slab
    const x0 = lS.sx - 6 + back * 0.4, x1 = neck.sx + (rS.sx - neck.sx) * 0.3 + back * 0.4;
    ctx.beginPath();
    ctx.moveTo(x0, topY + 1);
    ctx.quadraticCurveTo((x0 + x1) / 2, topY - 4, x1, neck.sy - 2);
    ctx.quadraticCurveTo(x1 + 3 + back * 0.6 + sway * 0.5, (neck.sy + botY) / 2, x1 - 1 + back + sway * 0.7, botY - 5);
    ctx.quadraticCurveTo((x0 + x1) / 2 + back * 0.6 + sway, botY + 6, x0 - 2 + back * 0.8 + sway * 0.8, botY - 2);
    ctx.quadraticCurveTo(x0 - 3 + back * 0.4, (topY + botY) / 2, x0, topY + 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = jd; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo((x0 + x1) / 2 + 1, topY + 6); ctx.quadraticCurveTo((x0 + x1) / 2 + back * 0.6, (topY + botY) / 2, (x0 + x1) / 2 - 1 + back + sway * 0.7, botY - 1); ctx.stroke();
    // the sleeve dangling from the held collar
    ctx.fillStyle = jd; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    const hx = lHand.sx, hy = lHand.sy;
    poly(ctx, [[hx - 3, hy + 1], [hx + 3, hy + 1], [hx + 4 + sway * 0.4, hy + 17], [hx - 3 + sway * 0.4, hy + 18]]); ctx.fill(); ctx.stroke();
    if (this.tierOf() >= 2) { ctx.fillStyle = this.tierOf() === 3 ? '#fbbf24' : '#94a3b8'; ctx.fillRect(lS.sx - 5 + back * 0.5, topY + 2, 8, 2); }     // armband / collar trim
    ctx.restore();
  };

  // Legs: school trousers and plain white trainers.
  UP.drawRigLeg = function (ctx, J, side) {
    const hip = side < 0 ? J.lHip : J.rHip, knee = side < 0 ? J.lKnee : J.rKnee, ankle = side < 0 ? J.lAnkle : J.rAnkle;
    const foot = side < 0 ? this.leftFoot : this.rightFoot;
    ctx.save();
    tubes(ctx, hip, knee, ankle, 9.4, 7.6, this.pantsCol(), this.pantsCol());
    const footAng = foot.angle !== undefined ? foot.angle : J.renderAng;
    const fCos = Math.cos(footAng), fSin = Math.sin(footAng) * TILT(), toe = (foot.pitch || 0) * 4.5;
    ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(ankle.sx - fCos * 5, ankle.sy - fSin * 5 - 3);
    ctx.lineTo(ankle.sx + fCos * 11, ankle.sy + fSin * 11 + 1 - toe);
    ctx.lineTo(ankle.sx + fCos * 8, ankle.sy + fSin * 8 + 5);
    ctx.lineTo(ankle.sx - fCos * 5, ankle.sy + 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ankle.sx - fCos * 4, ankle.sy + 3.2); ctx.lineTo(ankle.sx + fCos * 8, ankle.sy + fSin * 8 + 4); ctx.stroke();
    ctx.restore();
  };

  // Hips: the trouser waist and a loose belt.
  UP.drawRigWaist = function (ctx, J) {
    const { pelvis, cosR } = J;
    ctx.save();
    ctx.fillStyle = this.pantsCol(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.roundRect(pelvis.sx - 12, pelvis.sy - 5, 24, 11, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1e293b'; ctx.fillRect(pelvis.sx - 12, pelvis.sy - 4, 24, 3);
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(pelvis.sx - 2 + cosR * 4, pelvis.sy - 4.4, 4, 3.6);
    ctx.restore();
  };

  // Torso: a white shirt, undone tie, collar; a vest from tier 2.
  UP.drawRigCuirass = function (ctx, J) {
    const { lShoulder: lS, rShoulder: rS, neck, chest, pelvis, cosR, sinR } = J;
    const tier = this.tierOf();
    ctx.save();
    ctx.fillStyle = this.shirtCol(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    poly(ctx, [[lS.sx - 1, lS.sy - 2.5], [neck.sx, neck.sy - 4.5], [rS.sx + 1, rS.sy - 2.5], [chest.sx + 10.5, chest.sy + 3], [pelvis.sx + 9, pelvis.sy - 2], [pelvis.sx, pelvis.sy + 2.5], [pelvis.sx - 9, pelvis.sy - 2], [chest.sx - 10.5, chest.sy + 3]]);
    ctx.fill(); ctx.stroke();
    const fx = chest.sx + cosR * 3.8;
    if (sinR > -0.55) {
      if (tier >= 2) {                                              // a dark vest over the shirt
        ctx.fillStyle = this.jacketDark(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
        poly(ctx, [[lS.sx + 3, lS.sy + 1], [fx - 1.5, chest.sy - 3], [fx - 1, pelvis.sy - 1], [pelvis.sx - 8, pelvis.sy - 2], [chest.sx - 9, chest.sy + 3]]); ctx.fill(); ctx.stroke();
        poly(ctx, [[rS.sx - 3, rS.sy + 1], [fx + 1.5, chest.sy - 3], [fx + 1, pelvis.sy - 1], [pelvis.sx + 8, pelvis.sy - 2], [chest.sx + 9, chest.sy + 3]]); ctx.fill(); ctx.stroke();
      }
      // the tie, loosened: a short knot low on the collar and a tail that swings a little
      const sw = Math.sin(performance.now() * 0.004) * 1.5 + (this.walkWeight || 0) * 2;
      ctx.fillStyle = this.tieCol(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      poly(ctx, [[fx - 2.2, neck.sy + 3], [fx + 2.2, neck.sy + 3], [fx + 1.6, neck.sy + 6.5], [fx - 1.6, neck.sy + 6.5]]); ctx.fill(); ctx.stroke();
      poly(ctx, [[fx - 1.8, neck.sy + 6.5], [fx + 1.8, neck.sy + 6.5], [fx + 3.2 + sw, chest.sy + 11], [fx + sw * 0.5, chest.sy + 14], [fx - 3 + sw, chest.sy + 11]]); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(15,23,42,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx, chest.sy + 14); ctx.lineTo(fx, pelvis.sy - 1); ctx.stroke();
      if (tier === 3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(251,191,36,0.55)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(fx, chest.sy + 4, 8.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    }
    // collar, popped on one side
    ctx.fillStyle = this.shirtCol(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    poly(ctx, [[neck.sx - 9, neck.sy - 1], [neck.sx - 7, neck.sy - 8], [neck.sx - 1, neck.sy - 2], [neck.sx, neck.sy + 3]]); ctx.fill(); ctx.stroke();
    poly(ctx, [[neck.sx + 9, neck.sy - 1], [neck.sx + 7, neck.sy - 9], [neck.sx + 1, neck.sy - 2], [neck.sx, neck.sy + 3]]); ctx.fill(); ctx.stroke();
    if (tier === 3) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(neck.sx - 8, neck.sy - 2); ctx.lineTo(neck.sx - 1, neck.sy + 2); ctx.moveTo(neck.sx + 8, neck.sy - 2); ctx.lineTo(neck.sx + 1, neck.sy + 2); ctx.stroke(); }
    ctx.restore();
  };

  // Arms: shirt sleeves rolled to the elbow, bare forearms and the LIMITER BRACER, then the hand.
  UP.drawRigArm = function (ctx, J, side) {
    const s = side < 0 ? J.lShoulder : J.rShoulder, e = side < 0 ? J.lElbow : J.rElbow, h = side < 0 ? J.lHand : J.rHand;
    const C = cuffOf(this), t = performance.now() * 0.001;
    const gc = this.glowCol(), fillF = c01((this.restraintShown || 0) / 100), full = this.full;
    ctx.save();
    tubes(ctx, s, e, h, 8.2, 6.8, this.shirtCol(), this.skinCol());                 // sleeve over a bare forearm, one smooth tube
    const fa = Math.atan2(h.sy - e.sy, h.sx - e.sx), fl = Math.hypot(h.sx - e.sx, h.sy - e.sy);
    // the bracer: a thick cuff over the lower forearm
    ctx.save(); ctx.translate(e.sx, e.sy); ctx.rotate(fa);
    ctx.fillStyle = C.body; ctx.strokeStyle = C.edge; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    poly(ctx, [[fl * 0.22, -6.8], [fl * 0.98, -6.2], [fl * 1.06, 0], [fl * 0.98, 6.2], [fl * 0.22, 6.8]]); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.trim; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(fl * 0.34, -5.6); ctx.lineTo(fl * 0.34, 5.6); ctx.moveTo(fl * 0.92, -5); ctx.lineTo(fl * 0.92, 5); ctx.stroke();
    // cracks: more of them glow as Restraint fills; at full they all burn
    const cracks = [[0.46, -3.6, 0.58, -1.2, 0.5, 0.8], [0.6, 3.8, 0.72, 1.4, 0.82, -0.6], [0.74, -3.4, 0.84, -0.8, 0.78, 1.8], [0.5, 2.2, 0.62, 3.6, 0.7, 4.2]];
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    cracks.forEach((c, i) => {
      const on = fillF >= (i + 0.35) / cracks.length, part = c01(fillF * cracks.length - i);
      const a = (on ? 0.95 : 0.12 + 0.5 * part) * (full ? 0.75 + 0.25 * Math.sin(t * 9 + i) : 1) * C.glowK;
      ctx.strokeStyle = on ? gc : '#475569'; ctx.globalAlpha = Math.min(1, a); ctx.lineWidth = on ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(fl * c[0], c[1]); ctx.lineTo(fl * c[2], c[3]); ctx.lineTo(fl * c[4], c[5]); ctx.stroke();
    });
    if (full) { ctx.globalAlpha = 0.28 + 0.12 * Math.sin(t * 7); ctx.fillStyle = gc; ctx.beginPath(); ctx.ellipse(fl * 0.68, 0, fl * 0.42, 9, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.restore();
    // weapon enhancement shine (outside the cuff, in the weapon's own colour)
    if ((this.weaponEnh | 0) >= 6 && window.WeaponGlow && showVfxOf(this)) {
      try { window.WeaponGlow.glow(ctx, { x: e.sx + (h.sx - e.sx) * 0.3, y: e.sy + (h.sy - e.sy) * 0.3 }, { x: h.sx, y: h.sy }, this.weaponEnh | 0, this.weaponColor || '#cbd5e1', t, 0, side + 3); } catch (err) { /* cosmetic */ }
    }
    // hand
    ctx.fillStyle = this.skinCol(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(h.sx + Math.cos(fa) * 2, h.sy + Math.sin(fa) * 2, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (this.tierOf() >= 2 && side > 0) { ctx.fillStyle = this.tierOf() === 3 ? '#fbbf24' : '#94a3b8'; ctx.fillRect(s.sx + (e.sx - s.sx) * 0.3 - 4, s.sy + (e.sy - s.sy) * 0.3 - 2, 6, 3); }
    ctx.restore();
  };

  // The bracers on their own, for the enhancement screen: a pair of cuffs, the cracks lit in the tier's colour.
  UP.drawCuffSprite = function (ctx, size) {
    const C = cuffOf(this), col = this.weaponGlow || '#94a3b8', t = performance.now() * 0.001, s = size / 250;
    ctx.save(); ctx.scale(s, s); ctx.lineJoin = 'round';
    for (const sd of [-1, 1]) {
      ctx.save(); ctx.translate(sd * 62, 0); ctx.rotate(sd * 0.28);
      ctx.fillStyle = C.body; ctx.strokeStyle = C.edge; ctx.lineWidth = 4;
      poly(ctx, [[-34, -70], [34, -66], [44, 0], [34, 66], [-34, 70], [-42, 0]]); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C.trim; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-36, -52); ctx.lineTo(36, -50); ctx.moveTo(-36, 52); ctx.lineTo(36, 50); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const c of [[-18, -30, -4, -8, -14, 14], [14, -22, 6, 4, 20, 26], [-10, 30, 4, 40, -6, 52]]) {
        ctx.globalAlpha = 0.5 + 0.35 * Math.sin(t * 3 + c[0]); ctx.strokeStyle = col; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.lineTo(c[4], c[5]); ctx.stroke();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    }
    ctx.restore();
  };

  // Head: messy dark hair, a lazy half-lidded look, a small smirk.
  UP.drawRigHelm = function (ctx, J) {
    const { head, cosR, sinR } = J;
    const t = performance.now() * 0.001;
    ctx.save();
    const hx = head.sx, hy = head.sy, face = sinR > -0.55;
    const hair = this.hairCol(), skin = this.skinCol();
    const flare = (this.aura || 0);                               // the hair lifts a little in the power-up, but the colour never changes
    // back of the hair
    ctx.fillStyle = hair; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(hx - cosR * 1.4, hy - 1.5, 9.4, 10.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (face) {
      ctx.fillStyle = skin; ctx.strokeStyle = '#4a2a18'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(hx + cosR * 2.4, hy + 1.4, 7.2, 8.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const ex = hx + cosR * 4.4, ey = hy + 0.6 + sinR * 0.6;
      // half-lidded eyes, brows relaxed
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(ex - 4.8, ey - 0.8, 3.4, 2.4); ctx.fillRect(ex + 1.4, ey - 0.8, 3.4, 2.4);
      ctx.fillStyle = '#2b1d16'; ctx.fillRect(ex - 3.7, ey - 0.8, 1.8, 2.4); ctx.fillRect(ex + 2.5, ey - 0.8, 1.8, 2.4);
      ctx.fillStyle = skin; ctx.fillRect(ex - 5, ey - 1.1, 3.8, 1.2); ctx.fillRect(ex + 1.2, ey - 1.1, 3.8, 1.2);          // heavy lids
      const sn = this.strain || 0;
      ctx.strokeStyle = hair; ctx.lineWidth = 1.6 + sn * 0.8;
      // brows relaxed; during the power-up they slam down and in
      ctx.beginPath(); ctx.moveTo(ex - 5.4, ey - 3.2 + sn * 1.6); ctx.lineTo(ex - 1.2, ey - 2.4 + sn * 2.4); ctx.moveTo(ex + 5.4, ey - 3.2 + sn * 1.6); ctx.lineTo(ex + 1.2, ey - 2.4 + sn * 2.4); ctx.stroke();
      if (sn > 0.3) {                                                // gritted teeth
        ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#3b2418'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(ex - 3.4, ey + 3.6, 6.8, 3.6, 1); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex - 1.1, ey + 3.6); ctx.lineTo(ex - 1.1, ey + 7.2); ctx.moveTo(ex + 1.1, ey + 3.6); ctx.lineTo(ex + 1.1, ey + 7.2); ctx.stroke();
      } else {
        ctx.strokeStyle = '#6b3a24'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ex - 2.4, ey + 5); ctx.quadraticCurveTo(ex + 0.4, ey + 6.2, ex + 3, ey + 4.4); ctx.stroke();      // a small smirk
      }
    }
    // messy front hair: a few uneven spikes and a fringe
    ctx.fillStyle = hair; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    const st = this.strain || 0;
    const lift = 3 * flare + 5 * st + Math.sin(t * 3) * 0.6;
    poly(ctx, [[hx - 9.4, hy - 1], [hx - 10 - cosR * 2, hy - 9 - lift], [hx - 5, hy - 7], [hx - 4.6, hy - 14 - lift], [hx - 0.6, hy - 9], [hx + 2.4, hy - 15 - lift], [hx + 4.6, hy - 8], [hx + 8.4, hy - 12 - lift], [hx + 9.6, hy - 2], [hx + 5, hy - 5], [hx + 1, hy - 3.4], [hx - 4, hy - 4.4]]);
    ctx.fill(); ctx.stroke();
    // a loose strand over the brow
    ctx.beginPath(); ctx.moveTo(hx + cosR * 3 - 1, hy - 5); ctx.quadraticCurveTo(hx + cosR * 3 + 1, hy + 1, hx + cosR * 3 - 3, hy + 3.4); ctx.lineTo(hx + cosR * 3 - 4.4, hy - 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  // Releases go on the top layer, over the boss and every character (drawForegroundSparks runs last in the world pass).
  if (typeof ArenaFX !== 'undefined' && !ArenaFX.prototype._unboundTopHooked) {
    ArenaFX.prototype._unboundTopHooked = true;
    const oTop = ArenaFX.prototype.drawForegroundSparks;
    ArenaFX.prototype.drawForegroundSparks = function (ctx) {
      const g = window.game;
      if (g && g.party) for (const m of g.party) if (m && m.drawReleaseTop) { try { m.drawReleaseTop(ctx); } catch (e) { } }
      return oTop.apply(this, arguments);
    };
  }
})();
