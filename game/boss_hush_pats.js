// =========================================================================
// BOSS_HUSH_PATS.JS — Hush's attack patterns. Times are seconds of pattern time (scaled by her pace).
//   start(b, target, rnd) sets up; tick(b, livingParty, dt) runs the beats (b.at(sec) fires exactly once).
//   strikes: [sec, {reach, arc}] feed the Rebuke table. Counter windows are opened inside tick (b.counterableWindow).
// Poses for every pattern live in boss_hush_rig.js (keyed by the same names); floor telegraphs are b.tele().
// Each is a re-skin of a raid pattern archetype (see the mechanics library memory), fitted to a porcelain marionette.
// =========================================================================
(function () {
  if (typeof HushBoss === 'undefined') return;
  const TAU = Math.PI * 2;
  const T = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.58);
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const flat = (p, x, y) => Math.hypot(p.x - x, (p.y - y) / T());
  const hard = () => !!(window.game && typeof window.game.isHard === 'function' && window.game.isHard());
  const counterOn = (b) => { b.counterableWindow = true; audio.playCounterFlashCue && audio.playCounterFlashCue(); };
  const slash = (heavy = false, pitch = 1) => audio.playSwordSlash && audio.playSwordSlash(heavy, pitch);
  const chime = (f = 1046, v = 0.08) => audio.playBellTone && audio.playBellTone(f, 0.4, v);
  const PATS = {};

  // 1. NEEDLE THRUST: two lance thrusts with the giant needle (the second flashes BLUE: counter it), then a backhand sweep
  PATS.hs_needle_thrust = {
    dur: 2.4, strikes: [[0.55, { reach: 270, arc: 0.3 }], [1.3, { reach: 310, arc: 0.3 }], [1.85]], counter: [0.85, 1.25],
    start(b) { b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.facingAngle, len: 270, w: 40, follow: true }, 0.55); },
    tick(b, L) {
      if (b.at(0.55)) { slash(true, 1.3); b.hitCorridorP(L, b.x, b.y, b.facingAngle, 270, 40, 230, 'Needle Thrust', 'medium', 120); b.vfxAdd({ k: 'thrust', a: b.facingAngle, len: 270, life: 0.25 }); }
      if (b.at(0.7)) { b.reaim(0.9); b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.facingAngle, len: 310, w: 44 }, 0.6); }
      if (b.at(0.85)) counterOn(b);
      if (b.at(1.25)) b.counterableWindow = false;
      if (b.at(1.3)) { slash(true, 1.1); audio.playImpactBoom(0.8); b.hitCorridorP(L, b.x, b.y, b.facingAngle, 310, 44, 270, 'Needle Thrust', 'heavy', 150); b.vfxAdd({ k: 'thrust', a: b.facingAngle, len: 310, life: 0.3 }); }
      if (b.at(1.45)) { b.reaim(0.6); b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 190, a: b.facingAngle, half: 1.1 }, 0.4); }
      if (b.at(1.85)) { slash(false, 0.9); b.vfxAdd({ k: 'arc', a0: b.facingAngle - 1.1, a1: b.facingAngle + 1.1, r: 185, life: 0.3 }); b.hitSectorP(L, 0, 190, b.facingAngle, 1.1, 220, 'Backhand', 'medium', 120); }
    }
  };

  // 2. CRADLE ROCK: she rocks like a cradle, front, back, then a bigger front (watch which way she leans)
  PATS.hs_cradle_rock = {
    dur: 2.6, strikes: [[0.6], [1.2, { reach: 200 }], [1.85, { reach: 240 }]],
    start(b) { b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 200, a: b.facingAngle, half: 1.3 }, 0.6); },
    tick(b, L) {
      const a = b.facingAngle;
      if (b.at(0.6)) { slash(true, 0.9); b.flair(b.fwd(100).x, b.fwd(100).y, 100); b.hitSectorP(L, 0, 200, a, 1.3, 220, 'Cradle Rock', 'medium', 120); }
      if (b.at(0.75)) b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 200, a: a + Math.PI, half: 1.3 }, 0.45);
      if (b.at(1.2)) { slash(true, 0.85); const p = b.fwd(-100); b.flair(p.x, p.y, 100); b.hitSectorP(L, 0, 200, a + Math.PI, 1.3, 220, 'Cradle Rock', 'medium', 120); }
      if (b.at(1.35)) b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 245, a, half: 1.45 }, 0.5);
      if (b.at(1.85)) { slash(true, 0.7); audio.playImpactBoom(1.1); b.flair(b.fwd(130).x, b.fwd(130).y, 130, '#fde68a', 7); b.hitSectorP(L, 0, 245, a, 1.45, 280, 'Cradle Rock', 'heavy', 150); }
    }
  };

  // 3. MUSIC-BOX SPIN: the ballerina pirouette (BLUE while she winds up). If the spin catches anyone, she spins again.
  PATS.hs_music_spin = {
    dur: 2.9, strikes: [[0.95, { reach: 210, arc: Math.PI }]], counter: [0.25, 0.65],
    start(b) { b.tele({ k: 'circle', x: b.x, y: b.y, r: 210, follow: true }, 0.95); b._spinHit = false; },
    tick(b, L) {
      if (b.at(0.25)) counterOn(b);
      if (b.at(0.65)) b.counterableWindow = false;
      if (b.at(0.95)) {
        chime(1318, 0.1); slash(true, 1.2); audio.playImpactBoom(1.0);
        b.vfxAdd({ k: 'spin', r: 210, life: 0.5 });
        const before = L.map(p => p.hp);
        b.hitCircle(L, b.x, b.y, 210, 260, 'Music-Box Spin', 'heavy', 160);
        b._spinHit = L.some((p, i) => p.hp < before[i]);
        if (b._spinHit) { b.tele({ k: 'circle', x: b.x, y: b.y, r: 240, follow: true }, 0.75); b.grunt('giggle_01'); }
        else { b.stateTimer = Math.min(b.stateTimer, 0.5); }      // nobody caught: a short curtsy and she is done
      }
      if (b._spinHit && b.at(1.7)) { chime(1568, 0.1); slash(true, 1.4); b.vfxAdd({ k: 'spin', r: 240, life: 0.5 }); b.hitCircle(L, b.x, b.y, 240, 240, 'Encore Spin', 'heavy', 170); }
    }
  };

  // 4. RIBBON LASH: a long, narrow ribbon whip down a line, then a short return lash. The ribbon makes you sleepy.
  PATS.hs_ribbon_lash = {
    dur: 1.9, strikes: [[0.75, { reach: 300, arc: 0.35 }], [1.32]],
    start(b) { b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 310, a: b.facingAngle, half: 0.33, follow: true }, 0.75); },
    tick(b, L) {
      if (b.at(0.75)) {
        slash(false, 1.5);
        b.vfxAdd({ k: 'ribbon', a: b.facingAngle, len: 310, life: 0.45 });
        for (const p of L) if (b.inSector(p, b.x, b.y, 0, 310, b.facingAngle, 0.33)) { b.hurt(p, 200, 'Ribbon Lash', 'medium', b.x, b.y, 110); b.addDrowsy(p, 22); }
      }
      if (b.at(0.9)) { b.reaim(0.8); b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 220, a: b.facingAngle, half: 0.6 }, 0.42); }
      if (b.at(1.32)) {
        slash(false, 1.2);
        b.vfxAdd({ k: 'ribbon', a: b.facingAngle, len: 220, life: 0.4, wide: true });
        for (const p of L) if (b.inSector(p, b.x, b.y, 0, 220, b.facingAngle, 0.6)) { b.hurt(p, 180, 'Ribbon Lash', 'medium', b.x, b.y, 100); b.addDrowsy(p, 12); }
      }
    }
  };

  // 5. HEAD TILT: her head tips all the way over to one side... and her painted eyes sweep a beam the way it tipped
  PATS.hs_head_tilt = {
    dur: 3.0, strikes: [],
    start(b, tg, r) { b.tiltDir = r() < 0.5 ? -1 : 1; b.sweep = null; },
    tick(b, L, dt) {
      if (b.at(0.6)) { audio.playParryClang(false); chime(523, 0.06); }       // the click of her neck
      if (b.at(0.95)) b.sweep = { a0: b.facingAngle - b.tiltDir * 0.25, span: b.tiltDir * 2.3, t: 0, dur: 1.35, len: 520, w: 34 };
      const s = b.sweep;
      if (s && b.patT >= 0.95) {
        s.t = Math.min(s.dur, b.patT - 0.95);
        s.a = s.a0 + s.span * c01(s.t / s.dur);
        for (const p of L) {
          if (!(p.isLocal || p.isBot) || !b.inCorridor(p, b.x, b.y, s.a, s.len, s.w)) continue;
          if ((p._hsBeam || 0) > performance.now()) continue;
          p._hsBeam = performance.now() + 700;
          b.hurt(p, 210, 'Painted Gaze', 'medium', b.x, b.y, 90);
        }
        if (s.t >= s.dur) b.sweep = null;
      }
    }
  };

  // 6. KEY TURN: she reaches back and turns her key. Which way it turns decides whether the inside or the outside is struck.
  //    (clockwise as you look at her back = the outside rings; the other way = the inside.) The floor only shows it late.
  PATS.hs_key_turn = {
    dur: 2.5, strikes: [[1.7, { reach: 205, arc: Math.PI }]],
    start(b, tg, r) { b.keyDir = r() < 0.5 ? 1 : -1; },
    tick(b, L) {
      if (b.at(0.3) || b.at(0.6) || b.at(0.9)) { audio.playParryClang(false); chime(b.keyDir > 0 ? 880 : 440, 0.05); }
      if (b.at(1.25)) {
        if (b.keyDir > 0) b.tele({ k: 'sector', x: b.x, y: b.y, r0: 175, r1: 540, a: 0, half: Math.PI }, 0.45);
        else b.tele({ k: 'circle', x: b.x, y: b.y, r: 205 }, 0.45);
      }
      if (b.at(1.7)) {
        audio.playImpactBoom(1.4);
        if (window.fx) window.fx.triggerShake(12, 0.3);
        if (b.keyDir > 0) { b.vfxAdd({ k: 'ring', r: 520, col: '#fde68a', life: 0.6 }); b.damagePlayersInSector(L, b.x, b.y, 175, 540, 0, Math.PI, 260, 'Wound Tight', 'heavy', 150); }
        else { b.vfxAdd({ k: 'spin', r: 205, life: 0.5 }); b.hitCircle(L, b.x, b.y, 205, 300, 'Wound Tight', 'heavy', 170); }
      }
    }
  };

  // 7. LASSO: a loop of thread thrown at you (BLUE as it leaves her hand: counter it). Caught: you are reeled in for a jab.
  PATS.hs_lasso = {
    dur: 2.1, strikes: [[0.8, { reach: 400, arc: 0.2 }], [1.4, { reach: 150, arc: 0.7 }]], counter: [0.35, 0.75],
    start(b, tg) { b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.facingAngle, len: 400, w: 34 }, 0.8); b._lassoed = null; },
    tick(b, L) {
      if (b.at(0.35)) counterOn(b);
      if (b.at(0.75)) b.counterableWindow = false;
      if (b.at(0.8)) {
        slash(false, 1.6);
        b.vfxAdd({ k: 'lasso', a: b.facingAngle, len: 400, life: 0.5 });
        for (const p of L) {
          if (!(p.isLocal || p.isBot) || !b.inCorridor(p, b.x, b.y, b.facingAngle, 400, 34)) continue;
          b.hurt(p, 170, 'Thread Lasso', 'medium', b.x, b.y, 0);
          b._lassoed = p.id;
          // reel them in to just in front of her
          const to = b.fwd(70);
          p.x = to.x; p.y = to.y; p.targetX = p.x; p.targetY = p.y; p.snapFeetToBody && p.snapFeetToBody();
        }
        if (b._lassoed) b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 150, a: b.facingAngle, half: 0.7 }, 0.6);
      }
      if (b._lassoed && b.at(1.4)) { slash(true, 1.0); b.hitSectorP(L, 0, 150, b.facingAngle, 0.7, 240, 'Needle Jab', 'heavy', 160); }
    }
  };

  // 8. STITCH: she sews a zigzag line of stitches across the floor towards you; each stitch pops, and the thread lingers
  PATS.hs_stitch = {
    dur: 3.0, strikes: [], speaks: false,
    start(b, tg, r) {
      const p = tg || b.tgt();
      const pts = [];
      let x = b.fwd(70).x, y = b.fwd(70).y;
      const tx = p ? p.x : x, ty = p ? p.y : y;
      const n = hard() ? 7 : 6;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) / n;
        const bx = x + (tx - x) * k * 1.15, by = y + (ty - y) * k * 1.15;
        const side = (i % 2 ? 1 : -1) * 46;
        const a = Math.atan2((ty - y) / T(), tx - x) + Math.PI / 2;
        pts.push(b.inArena(bx + Math.cos(a) * side, by + Math.sin(a) * side * T(), 540));
      }
      b.stitchPts = pts;
    },
    tick(b, L) {
      const pts = b.stitchPts || [];
      pts.forEach((pt, i) => {
        const at = 0.55 + i * 0.28;
        if (b.at(at - 0.5)) b.tele({ k: 'circle', x: pt.x, y: pt.y, r: 62 }, 0.5);
        if (b.at(at)) {
          slash(false, 1.7); chime(659 + i * 60, 0.05);
          b.hitCircle(L, pt.x, pt.y, 62, 170, 'Stitch', 'medium', 90);
          b.vfxAdd({ k: 'stitch', x: pt.x, y: pt.y, life: 0.5 });
          if (i > 0) {
            const pv = pts[i - 1], a = Math.atan2((pt.y - pv.y) / T(), pt.x - pv.x), len = flat(pt, pv.x, pv.y);
            b.addHazard({ k: 'lane', x: pv.x, y: pv.y, a, len, w: 16, dur: 3.2, dmg: 60, label: 'Loose Thread', drowsy: 4 });
          }
        }
      });
    }
  };

  // 9. MARIONETTE DROP: her strings yank her up out of sight; she hangs over you, then drops. Right under her is crushed, and
  //    a moment later the slam ripples out across the far floor: the safe ground is the ring just around where she landed.
  PATS.hs_marionette_drop = {
    dur: 3.1, strikes: [[1.75, { reach: 115, arc: Math.PI }]], speaks: false,
    start(b) { b._dropX = b.x; b._dropY = b.y; },
    tick(b, L, dt) {
      const p = b.tgt();
      const t = b.patT;
      if (t < 0.7) { b.jumpZ = 240 * c01(t / 0.7) ** 1.6; }
      else if (t < 1.45) {
        b.jumpZ = 240;
        if (p) { b.x += (p.x - b.x) * Math.min(1, dt * 4); b.y += (p.y - b.y) * Math.min(1, dt * 4); }
      } else if (t < 1.75) { b.jumpZ = 240 * (1 - c01((t - 1.45) / 0.3)) ** 0.6; }
      else b.jumpZ = 0;
      if (b.at(0.2)) { slash(false, 0.6); b.grunt('giggle_02'); }
      if (b.at(1.4)) b.tele({ k: 'circle', x: b.x, y: b.y, r: 115 }, 0.35);
      if (b.at(1.75)) {
        audio.playImpactBoom(1.7); b.jumpZ = 0;
        if (window.fx) { window.fx.triggerShake(18, 0.4); window.fx.addStepDust(b.x, b.y, 14); }
        b.flair(b.x, b.y, 115, '#e2e8f0', 0);
        b.hitCircle(L, b.x, b.y, 115, 250, 'Marionette Drop', 'heavy', 150);
        b.tele({ k: 'sector', x: b.x, y: b.y, r0: 205, r1: 560, a: 0, half: Math.PI }, 0.55);
        b.snapFeetToBody();
      }
      if (b.at(2.3)) {
        audio.playImpactBoom(1.3);
        b.vfxAdd({ k: 'ring', r: 540, col: '#e2e8f0', life: 0.6 });
        b.damagePlayersInSector(L, b.x, b.y, 205, 560, 0, Math.PI, 270, 'String Snap', 'heavy', 150);
      }
    }
  };

  // 10. WIND-UP SOLDIERS: a row of toy soldiers marches straight across the rug. Find the gap in the line.
  PATS.hs_toy_soldiers = {
    dur: 3.4, strikes: [], speaks: false,
    start(b, tg, r) {
      const p = tg || b.tgt();
      const dirA = (p ? Math.atan2((p.y - b.y) / T(), p.x - b.x) : b.facingAngle) + (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const n = hard() ? 9 : 8, gap = Math.floor(r() * (n - 2)) + 1, spacing = 120;
      const cx = p ? p.x : b.x, cy = p ? p.y : b.y;
      const back = { x: cx - Math.cos(dirA) * 600, y: cy - Math.sin(dirA) * 600 * T() };
      const perp = dirA + Math.PI / 2;
      for (let i = 0; i < n; i++) {
        if (i === gap || (hard() ? false : i === gap + 1)) continue;
        const off = (i - (n - 1) / 2) * spacing;
        const sx = back.x + Math.cos(perp) * off, sy = back.y + Math.sin(perp) * off * T();
        b.minions.push({ k: 'soldier', id: (b._mnId = (b._mnId || 0) + 1), x: sx, y: sy, a: dirA, spd: 230, t: 0, delay: 1.1, life: 5.6, dmg: 210, hop: Math.random() * 6 });
        b.tele({ k: 'corridor', x: sx, y: sy, a: dirA, len: 1200, w: 30 }, 1.1);
      }
    },
    tick(b) {
      if (b.at(0.4)) { audio.playParryClang(false); chime(784, 0.06); }
      if (b.at(1.1)) { audio.playImpactBoom(0.7); }
    }
  };

  // 11. BLOCK DROP: alphabet blocks fall out of the dark onto where you stand, one after another (keep walking)
  PATS.hs_block_drop = {
    dur: 2.9, strikes: [], speaks: false,
    start(b) { b._blocks = 0; },
    tick(b, L) {
      const p = b.tgt();
      for (const at of [0.25, 0.85, 1.45]) {
        if (b.at(at) && p) {
          const letters = 'ABCHUSZ';
          b.proj.push({ k: 'drop', x: p.x, y: p.y, t: 0, dur: 0.75, r: 88, dmg: 230, label: 'Falling Block', letter: letters[Math.floor(Math.random() * letters.length)], col: ['#fca5a5', '#93c5fd', '#fde68a', '#a7f3d0'][Math.floor(Math.random() * 4)], stay: 1.4 });
          b.tele({ k: 'circle', x: p.x, y: p.y, r: 88 }, 0.75);
        }
      }
      if (b.at(2.05) && p && b.phase >= 2) {
        b.proj.push({ k: 'drop', x: p.x, y: p.y, t: 0, dur: 0.7, r: 120, dmg: 260, label: 'Falling Block', letter: 'Z', col: '#c4b5fd', stay: 1.6 });
        b.tele({ k: 'circle', x: p.x, y: p.y, r: 120 }, 0.7);
      }
    }
  };

  // 12. PIN FAN: a flick of the wrist and a fan of sewing pins flies at you (a second fan follows; a third below 40%)
  PATS.hs_pin_fan = {
    dur: 2.1, strikes: [], speaks: false,
    start() {},
    tick(b, L) {
      const fan = (n, spread, off) => {
        b.reaim(0.8);
        slash(false, 1.9);
        for (let i = 0; i < n; i++) {
          const a = b.facingAngle + off + (i / (n - 1) - 0.5) * spread;
          const h = b.fwd(30);
          b.proj.push({ k: 'pin', x: h.x, y: h.y, a, spd: 520, t: 0, life: 1.3, dmg: 120 });
        }
      };
      if (b.at(0.7)) fan(9, 1.25, 0);
      if (b.at(1.2)) fan(8, 1.1, 0.07);
      if (b.phase >= 3 && b.at(1.6)) fan(9, 1.4, -0.05);
    }
  };

  // ---- from the Wind-Up on (55%) -------------------------------------------------------------------------------------------
  // 13. PAS DE DEUX: two porcelain copies step out of her on either side and rock with her; then the copies replay her first rock
  PATS.hs_pas_de_deux = {
    dur: 3.6, strikes: [[1.0, { reach: 210, arc: 1.2 }], [1.6, { reach: 210, arc: 1.2 }]], act2: true, speaks: false,
    start(b) {
      const a = b.facingAngle, side = a + Math.PI / 2;
      b.clones = [-1, 1].map(s => ({ x: b.x + Math.cos(side) * 170 * s, y: b.y + Math.sin(side) * 170 * s * T(), a, s }));
      for (const c of b.clones) b.tele({ k: 'sector', x: c.x, y: c.y, r0: 0, r1: 210, a, half: 1.2 }, 1.0);
      b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 210, a, half: 1.2 }, 1.0);
    },
    tick(b, L) {
      const C = b.clones || [];
      const all = [{ x: b.x, y: b.y }].concat(C);
      const a = b.facingAngle;
      if (b.at(1.0)) { slash(true, 0.9); for (const c of all) { b.damagePlayersInSector(L, c.x, c.y, 0, 210, a, 1.2, 220, 'Pas de Deux', 'medium', 120); b.flair(c.x + Math.cos(a) * 100, c.y + Math.sin(a) * 100 * T(), 90); } for (const c of all) b.tele({ k: 'sector', x: c.x, y: c.y, r0: 0, r1: 210, a: a + Math.PI, half: 1.2 }, 0.55); }
      if (b.at(1.6)) { slash(true, 0.8); for (const c of all) b.damagePlayersInSector(L, c.x, c.y, 0, 210, a + Math.PI, 1.2, 220, 'Pas de Deux', 'medium', 120); for (const c of C) b.tele({ k: 'sector', x: c.x, y: c.y, r0: 0, r1: 210, a, half: 1.2 }, 0.75); }
      if (b.at(2.35)) { slash(true, 1.1); for (const c of C) b.damagePlayersInSector(L, c.x, c.y, 0, 210, a, 1.2, 240, 'Echo', 'heavy', 140); }
      if (b.at(3.2)) b.clones = null;
    }
  };

  // 14. UNRAVEL: she spins her spool and a taut thread whips round her almost all the way. The spool's spin shows which way.
  PATS.hs_unravel = {
    dur: 3.7, strikes: [], act2: true,
    start(b, tg, r) { b.unravel = { dir: r() < 0.5 ? 1 : -1, a: b.facingAngle, len: 540, w: 26, live: false }; },
    tick(b, L, dt) {
      const u = b.unravel; if (!u) return;
      if (b.at(0.2) || b.at(0.55) || b.at(0.9)) chime(u.dir > 0 ? 988 : 659, 0.05);
      if (b.at(1.0)) b.tele({ k: 'corridor', x: b.x, y: b.y, a: u.a, len: u.len, w: u.w }, 0.25);
      if (b.patT >= 1.25 && b.patT <= 3.35) {
        u.live = true;
        u.a = b.facingAngle + u.dir * (TAU * 0.83) * c01((b.patT - 1.25) / 2.1);
        for (const p of L) {
          if (!(p.isLocal || p.isBot) || !b.inCorridor(p, b.x, b.y, u.a, u.len, u.w)) continue;
          if ((p._hsUnr || 0) > performance.now()) continue;
          p._hsUnr = performance.now() + 650;
          b.hurt(p, 220, 'Unravel', 'medium', b.x, b.y, 110);
        }
      } else u.live = false;
    }
  };

  // ---- below 40% -----------------------------------------------------------------------------------------------------------
  // 15. SHATTER RINGS: the gold in her cracks flares and three rings of breaking porcelain race out across the floor. Dash or
  //     jump through each ring as it reaches you.
  PATS.hs_shatter_rings = {
    dur: 3.2, strikes: [], phase: 3,
    start(b) { b._rings = []; },
    tick(b, L, dt) {
      for (const at of [0.9, 1.5, 2.1]) if (b.at(at)) { b._rings.push({ t: 0, hit: {} }); audio.playImpactBoom(0.9); chime(1318 - at * 200, 0.06); }
      for (const r of b._rings) {
        r.t += dt * b.patRate();
        const rad = 30 + r.t * 420, w = 34;
        r.r = rad;
        for (const p of L) {
          if (!(p.isLocal || p.isBot) || r.hit[p.id]) continue;
          const d = flat(p, b.x, b.y);
          if (Math.abs(d - rad) < w && (p.jumpZ || 0) < 12) { r.hit[p.id] = 1; b.hurt(p, 200, 'Shatter Ring', 'medium', b.x, b.y, 120); }
        }
      }
      b._rings = b._rings.filter(r => r.r < 640);
    }
  };

  HushBoss.PATS = PATS;

  // ---- Rebuke: her parry table, built from the strikes above (the shared install is not re-run) ----------------------------
  if (window.RebukeBoss) {
    const pats = {};
    for (const k in PATS) {
      const d = PATS[k];
      if (d.strikes && d.strikes.length) pats[k] = d.strikes.map(([sec, o]) => Object.assign({ t: sec / d.dur }, o || {}));
    }
    HushBoss.prototype.rebukeData = Object.assign({}, window.RebukeBoss.DEFAULTS, { rate: (b) => b.patRate(), patterns: pats });
  }
})();
