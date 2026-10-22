// =========================================================================
// BOSS_CERVANTH_PATS.JS: Cervanth's attack patterns. Times are seconds of pattern time (scaled by his pace).
//   start(b, target, rnd) sets up; tick(b, livingParty, dt) runs the beats (b.at(sec) fires exactly once); end(b) cleans up.
//   strikes: [sec, {reach, arc}] feed the Rebuke table. Counter windows are opened inside tick (b.counterableWindow).
// EVERY pattern has its own startup: its own pose (boss_cervanth_rig.js, keyed by the same name), its own sound (CervanthBoss.SFX,
// all synth) and its own visual cue, and they run at different speeds so none can be mistaken for another.
// =========================================================================
(function () {
  if (typeof CervanthBoss === 'undefined') return;
  const TAU = Math.PI * 2;
  const T = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.58);
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const flat = (p, x, y) => Math.hypot(p.x - x, (p.y - y) / T());
  const hard = () => !!(window.game && typeof window.game.isHard === 'function' && window.game.isHard());
  const isHost = () => !window.game || !window.game.net || window.game.net.isHost;
  const SFX = CervanthBoss.SFX;
  const counterOn = (b) => { b.counterableWindow = true; audio.playCounterFlashCue && audio.playCounterFlashCue(); };
  const slash = (heavy = false, pitch = 1) => audio.playSwordSlash && audio.playSwordSlash(heavy, pitch);
  const PATS = {};
  const antlersLeft = (b) => (b.leftPauldronBroken ? 0 : 1) + (b.rightPauldronBroken ? 0 : 1);

  // 1. ANTLER SWEEP (medium, 0.7s): the head swings away to the far side with the antlers drawn back; three bone rattles; the antler
  //    tips flicker crimson. Then a wide arc in front (phase 3 adds a reverse sweep behind).
  PATS.cv_antler_sweep = {
    dur: 2.5, strikes: [[0.85, { reach: 270, arc: Math.PI }], [1.7, { reach: 270, arc: Math.PI }]],
    start(b, tg, r) {
      b.sweepSide = r() < 0.5 ? -1 : 1;
      SFX.rattle(3);
      b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 255, a: b.facingAngle, half: Math.PI / 2, follow: true }, 0.7);
      b.vfxAdd({ k: 'tipFlicker', life: 0.85 });
    },
    tick(b, L) {
      if (b.at(0.85)) {
        slash(true, 0.8); audio.playImpactBoom(0.8);
        b.vfxAdd({ k: 'arc', a0: b.facingAngle - Math.PI / 2, a1: b.facingAngle + Math.PI / 2, r: 250, life: 0.3 });
        b.hitSectorP(L, 0, 255, b.facingAngle, Math.PI / 2, 250, 'Antler Sweep', 'heavy', 150);
      }
      if (b.phase >= 3 && b.at(1.05)) { b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 255, a: b.facingAngle + Math.PI, half: Math.PI / 2 }, 0.6); }
      if (b.phase >= 3 && b.at(1.7)) {
        slash(true, 0.7); audio.playImpactBoom(0.7);
        b.vfxAdd({ k: 'arc', a0: b.facingAngle + Math.PI / 2, a1: b.facingAngle + Math.PI * 1.5, r: 250, life: 0.3 });
        b.hitSectorP(L, 0, 255, b.facingAngle + Math.PI, Math.PI / 2, 230, 'Antler Sweep', 'heavy', 150);
      }
      if (b.phase < 3 && b.at(1.1)) b.stateTimer = Math.min(b.stateTimer, 0.5);
    }
  };

  // 2. GORE THRUST (slow, 0.9s): the front hoof scrapes the ground twice, the body sinks low, the head drops; one long metal scrape per
  //    scrape; dust; the heart dims. The second scrape flashes blue (counter), then a long thin lunge.
  PATS.cv_gore_thrust = {
    dur: 3.3, strikes: [], counter: [0.95, 1.4],
    start(b, tg) { b._gtStart = { x: b.x, y: b.y }; b._gtDone = 0; },
    tick(b, L, dt) {
      const a = b.facingAngle;
      if (b.at(0.3)) { SFX.scrape(); b.flair(b.fwd(70).x, b.fwd(70).y, 60, '#d6cfc4', 0); }
      if (b.at(0.95)) { SFX.scrape(); counterOn(b); b.flair(b.fwd(70).x, b.fwd(70).y, 60, '#d6cfc4', 0); }
      if (b.at(1.0)) { b.reaim(0.5); b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.facingAngle, len: 430, w: 42 }, 0.55); b._gtDir = b.facingAngle; b._gtStart = { x: b.x, y: b.y }; }
      if (b.at(1.4)) b.counterableWindow = false;
      if (b.at(1.55)) { b._gtStart = { x: b.x, y: b.y }; this.lunge(b, L, 430, 'Gore Thrust', 360); }
      if (b._gtLunge) this.moveLunge(b, 0.22, dt);
      if (antlersLeft(b) < 2 && b.at(1.95)) { b.reaim(0.7); b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.facingAngle, len: 380, w: 42 }, 0.5); b._gtDir = b.facingAngle; }
      if (antlersLeft(b) < 2 && b.at(2.45)) { b._gtStart = { x: b.x, y: b.y }; this.lunge(b, L, 380, 'Gore Thrust', 320); }
      if (antlersLeft(b) >= 2 && b.at(2.0)) b.stateTimer = Math.min(b.stateTimer, 0.4);
    },
    lunge(b, L, len, label, dmg) {
      const a = b._gtDir == null ? b.facingAngle : b._gtDir;
      b.facingAngle = a;
      slash(true, 0.9); audio.playImpactBoom(1.1);
      b.hitCorridorP(L, b.x, b.y, a, len, 42, dmg, label, 'heavy', 170);
      b.vfxAdd({ k: 'thrust', a, len, life: 0.3 });
      const end = b.inArena(b.x + Math.cos(a) * len, b.y + Math.sin(a) * len * T(), b.arenaR() - 60);
      b._gtLunge = { fx: b.x, fy: b.y, tx: end.x, ty: end.y, t: 0 };
    },
    moveLunge(b, dur, dt) {
      const l = b._gtLunge; if (!l) return;
      l.t += dt || 1 / 60;
      const k = c01(l.t / dur), e = 1 - Math.pow(1 - k, 3);
      b.x = lerp(l.fx, l.tx, e); b.y = lerp(l.fy, l.ty, e);
      if (k >= 1) b._gtLunge = null;
    }
  };

  // 3. HOOF COMBO (medium): he rocks back on his hind legs like a pendulum, the front hooves lift in turn; a heavy thud before each
  //    stomp and bone dust shaking out of the ribs. Three stomps (left, right, left), then a back kick behind him.
  PATS.cv_hoof_combo = {
    dur: 3.2, strikes: [[0.75, { reach: 250, arc: 1.6 }]],
    start(b) {
      b._hc = [{ f: 130, s: -78, at: 0.75 }, { f: 130, s: 78, at: 1.25 }, { f: 150, s: -64, at: 1.75 }];
      b._hcA = b.facingAngle;
      for (const st of b._hc) { const p = this.spot(b, st); b.tele({ k: 'circle', x: p.x, y: p.y, r: 92 }, st.at - 0.1); }
      b.vfxAdd({ k: 'boneDust', life: 0.9 });
    },
    spot(b, st) { const a = b._hcA, cs = Math.cos(a), sn = Math.sin(a); return { x: b.x + st.f * cs - st.s * sn, y: b.y + (st.f * sn + st.s * cs) * T() }; },
    tick(b, L) {
      for (const st of b._hc) {
        if (b.at(st.at - 0.18)) SFX.thud(0.8);
        if (b.at(st.at)) {
          const p = this.spot(b, st);
          audio.playImpactBoom(1.0); b.flair(p.x, p.y, 100, '#fda4af', 6);
          b.hitCircle(L, p.x, p.y, 92, 250, 'Hoof Stomp', 'heavy', 150);
          b.addCrack(p.x, p.y, b._hcA + Math.PI / 2, 90);
        }
      }
      if (b.at(2.0)) b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 230, a: b.facingAngle + Math.PI, half: 0.75 }, 0.4);
      if (b.at(2.4)) { slash(true, 0.7); audio.playImpactBoom(1.2); const p = b.fwd(-110); b.flair(p.x, p.y, 120, '#fda4af', 8); b.hitSectorP(L, 0, 230, b.facingAngle + Math.PI, 0.75, 330, 'Back Kick', 'heavy', 190); }
    }
  };

  // 4. TINE RAIN (long fuse, 1s per target): the head tilts up and the antlers spread wide; a rising run of bone clicks; the tines
  //    light one by one from base to tip like a crown, and each target sees a bone shadow growing under them. Each antler he still
  //    has drops one extra tine near the target.
  PATS.cv_tine_rain = {
    dur: 4.4, strikes: [],
    start(b) { SFX.clicks(9); b.vfxAdd({ k: 'crownLight', life: 1.3 }); b._tr = []; },
    tick(b, L) {
      const waves = b.phase >= 2 ? 2 : 1;
      const dropWave = (w, t0) => {
        for (const p of L) {
          const spots = [{ x: p.x, y: p.y }];
          const n = antlersLeft(b);
          for (let i = 0; i < n; i++) { const a = b.patRng() * TAU, d = 90 + b.patRng() * 60; spots.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * T() }); }
          for (const s of spots) { const q = b.inArena(s.x, s.y, b.arenaR() - 40); b._tr.push({ x: q.x, y: q.y, at: t0 + 1.0, hit: false }); b.tele({ k: 'tine', x: q.x, y: q.y, r: 62 }, 1.0); }
        }
        SFX.clicks(4);
      };
      if (b.at(1.25)) dropWave(0, 1.25);
      if (waves > 1 && b.at(2.75)) dropWave(1, 2.75);
      for (const t of b._tr) {
        if (!t.hit && b.patT >= t.at) {
          t.hit = true;
          audio.playImpactBoom(0.9); b.flair(t.x, t.y, 80, '#fda4af', 3);
          b.hitCircle(L, t.x, t.y, 62, 300, 'Tine Rain', 'heavy', 130);
          b.vfxAdd({ k: 'spike', x: t.x, y: t.y, life: 1.6 });
        }
      }
      if (waves === 1 && b.at(2.6)) b.stateTimer = Math.min(b.stateTimer, 0.5);
    }
  };

  // 5. REAR-UP STOMP (slow, 1.2s): he rears fully onto his hind legs, front legs curled, chest open; a deep rumble that climbs and the
  //    heart flares white-red. Two shockwave rings (a third in the final phase): dash or jump each one.
  PATS.cv_rear_stomp = {
    dur: 3.6, strikes: [],
    start(b) { SFX.rumble(1.25); b._rings = []; b.vfxAdd({ k: 'heartFlare', life: 1.4 }); },
    tick(b, L, dt) {
      const times = b.finalPhaseOn ? [1.45, 1.95, 2.55] : [1.45, 1.95];
      for (const st of times) {
        if (b.at(st)) {
          audio.playImpactBoom(1.5); SFX.thud(1.2);
          b._rings.push({ r: 0, t0: st, hit: {} });
          if (window.fx) { window.fx.triggerShake(12, 0.3); window.fx.addShockwave(b.x, b.y, 200, '#fda4af', 6, 0.4); }
          b.addCrack(b.x, b.y, Math.random() * TAU, 160);
        }
      }
      for (const r of b._rings) {
        r.r = 330 * (b.patT - r.t0);
        for (const p of L) {
          if (!(p.isLocal || p.isBot) || r.hit[p.id]) continue;
          if (Math.abs(flat(p, b.x, b.y) - r.r) < 38 && (p.jumpZ || 0) < 12) { r.hit[p.id] = 1; b.hurt(p, 290, 'Shockwave', 'heavy', b.x, b.y, 150); }
        }
      }
      b._rings = b._rings.filter(r => r.r < 720);
    }
  };

  // 6. STAMPEDE (slow, 1.5s): he paws with alternating hooves and sweeps the head left and right as if sighting; a drum roll of hoof
  //    beats that speeds up, and cracks race down the lane ahead of him. Then the full-arena charge. He hits the far wall and is
  //    stunned (your damage window). In the final phase he charges twice, each at a different player, before the crash.
  PATS.cv_stampede = {
    dur: 5.4, strikes: [], free: true,
    start(b, tg) {
      b._sp = { round: 0, rounds: b.finalPhaseOn ? 2 : 1, moving: null, goAt: null };
      SFX.drums(10);
      this.aimLane(b, 0, tg);
    },
    aimLane(b, round, tg) {
      const t = tg || b.tgt(); if (t) b.aim(t);
      const a = b.facingAngle, R = b.arenaR() - 70;
      // find where the lane meets the wall
      let d = 0; for (; d < 1400; d += 10) { const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d * T(); if (Math.hypot(x - STAGE_X, (y - STAGE_Y) / T()) > R) break; }
      b._sp.lane = { x: b.x, y: b.y, a, len: Math.max(120, d) };
      b._sp.goAt = b.patT + 1.45;
      b.tele({ k: 'corridor', x: b.x, y: b.y, a, len: b._sp.lane.len, w: 62 }, 1.4);
      b.vfxAdd({ k: 'laneCracks', x: b.x, y: b.y, a, len: b._sp.lane.len, life: 1.5 });
    },
    tick(b, L, dt) {
      const sp = b._sp, lane = sp.lane;
      if (!sp.moving && sp.goAt != null && b.patT >= sp.goAt) {
        sp.goAt = null;
        sp.moving = { t: 0, from: { x: lane.x, y: lane.y }, a: lane.a, len: lane.len, hit: {} };
        audio.playImpactBoom(1.4); SFX.roar(0.5);
        if (window.fx) window.fx.triggerShake(10, 0.3);
      }
      const mv = sp.moving;
      if (mv) {
        mv.t += dt || 1 / 60;
        const dist = Math.min(mv.len, 880 * mv.t + 400 * mv.t * mv.t);
        b.x = mv.from.x + Math.cos(mv.a) * dist; b.y = mv.from.y + Math.sin(mv.a) * dist * T(); b.facingAngle = mv.a;
        if (window.fx && Math.random() < 0.7) window.fx.addStepDust(b.x, b.y, 2);
        for (const p of L) {
          if (!(p.isLocal || p.isBot) || mv.hit[p.id]) continue;
          if (flat(p, b.x, b.y) < 78) { mv.hit[p.id] = 1; b.hurt(p, 420, 'Stampede', 'heavy', b.x - Math.cos(mv.a) * 40, b.y - Math.sin(mv.a) * 40 * T(), 220); }
        }
        if (dist >= mv.len) {
          sp.moving = null; sp.round++;
          if (sp.round < sp.rounds) {
            // turn and charge a different player
            const others = L.filter(q => q.id !== b.activeTargetId);
            const nt = others.length ? others[Math.floor(b.patRng() * others.length) % others.length] : b.tgt();
            if (nt) b.activeTargetId = nt.id;
            this.aimLane(b, sp.round, nt);
            audio.playImpactBoom(1.0);
          } else {
            // the wall crash
            audio.playImpactBoom(2.2); SFX.crunch();
            if (window.fx) { window.fx.triggerShake(22, 0.5); window.fx.addShockwave(b.x, b.y, 360, '#fff1f2', 9, 0.5); }
            b.addCrack(b.x, b.y, mv.a + Math.PI, 260);
            b.vfxAdd({ k: 'wallCrash', a: mv.a, life: 1.0 });
            // an Echo: this lane comes back later with no tell (from phase 2 on)
            if (b.phase >= 2 && isHost()) {
              const e = { t: CervanthBoss.ECHO_DELAY, x: lane.x, y: lane.y, a: lane.a, len: lane.len, w: 62, speed: 950, dmg: 380 };
              b.echoes.push(Object.assign({}, e));
              const n = window.game && window.game.net;
              if (n) n.broadcast(Object.assign({ type: 'boss_event', event: 'cervanth_echo' }, e));
            }
            if (isHost()) b.cervStagger('@none', 3.2); else { b.pat = null; }
          }
        }
      }
    }
  };
  const STAGE_X = 0, STAGE_Y = 0;

  // 7. MANTLE LASH (fast, 0.5s): he spins his hips away (the body turns 90 degrees) and the mantle strips lift and flare; one whip
  //    crack. A tight 360 around him: don't hug the hips.
  PATS.cv_mantle_lash = {
    dur: 1.6, strikes: [[0.5, { reach: 250, arc: Math.PI }]],
    start(b) { b.tele({ k: 'circle', x: b.x, y: b.y, r: 235, follow: true }, 0.5); b.vfxAdd({ k: 'mantleFlare', life: 0.8 }); },
    tick(b, L) {
      if (b.at(0.45)) SFX.whip();
      if (b.at(0.5)) {
        audio.playImpactBoom(0.9); b.vfxAdd({ k: 'spin', r: 235, life: 0.4 });
        b.hitCircle(L, b.x, b.y, 235, 270, 'Mantle Lash', 'heavy', 170);
      }
    }
  };

  // 8. HOLLOW HOWL (medium, 1.0s): the head arches back and the jaw drops wide; a hollow inhale like wind through a pipe, and dust and
  //    the mantle are pulled towards him. Then a knockback ring. It does almost no damage: it is for putting you on the tines.
  PATS.cv_hollow_howl = {
    phase: 2, dur: 2.6, strikes: [],
    start(b) { SFX.inhale(1.0); b.vfxAdd({ k: 'suck', life: 1.1 }); },
    tick(b, L) {
      if (b.at(1.1)) {
        SFX.roar(0.9); audio.playImpactBoom(1.6);
        b.vfxAdd({ k: 'howlRing', life: 0.7 });
        if (window.fx) { window.fx.triggerShake(14, 0.4); window.fx.addShockwave(b.x, b.y, 560, '#fda4af', 8, 0.6); }
        for (const p of L) if (flat(p, b.x, b.y) < 560) b.hurt(p, 40, 'Hollow Howl', 'heavy', b.x, b.y, 330);
      }
    },
    end(b) { if (isHost() && b.phase >= 2 && Math.random() < 0.45) b._chainTine = true; }
  };

  // 9. MARROW SPIT (phase 3, medium): the neck coils into an S and the ribs heave like a cough; a wet gurgle and the throat glows.
  //    Three bone shards in a fan, each leaving a short-lived pool where it lands.
  PATS.cv_marrow_spit = {
    phase: 3, dur: 3.0, strikes: [],
    start(b) { SFX.gurgle(0.9); b.vfxAdd({ k: 'throatGlow', life: 1.0 }); },
    tick(b, L) {
      if (b.at(0.95)) {
        slash(false, 0.7); audio.playImpactBoom(0.7);
        for (const off of [-0.3, 0, 0.3]) {
          const a = b.facingAngle + off, d = 330 + b.patRng() * 160;
          const p = b.fwd(d, a);
          const land = b.inArena(p.x, p.y, b.arenaR() - 40);
          b.proj.push({ k: 'shard', x: b.x, y: b.y, tx: land.x, ty: land.y, t: 0, dur: 0.75, dmg: 230 });
        }
      }
    }
  };

  // projectiles: shards fly in an arc and burst into a pool
  CervanthBoss.prototype.updateProjectiles = function (dt, L) {
    for (const pr of this.proj) {
      pr.t += dt;
      if (pr.done) continue;
      if (pr.k === 'shard') {
        const k = c01(pr.t / pr.dur);
        pr.cx = lerp(pr.x, pr.tx, k); pr.cy = lerp(pr.y, pr.ty, k); pr.z = Math.sin(k * Math.PI) * 110;
        if (k >= 1) {
          pr.done = true;
          audio.playImpactBoom(0.7);
          this.flair(pr.tx, pr.ty, 70, '#fda4af', 3);
          this.hitCircle(L, pr.tx, pr.ty, 52, pr.dmg, 'Marrow Shard', 'heavy', 110);
          this.addHazard({ k: 'circle', x: pr.tx, y: pr.ty, r: 54, dmg: 90, dur: 5, label: 'Marrow Pool', power: 'light', push: 20 });
        }
      }
    }
    this.proj = this.proj.filter(pr => !pr.done || pr.t < pr.dur + 0.05);
  };

  CervanthBoss.PATS = PATS;

  // ---- Rebuke: his parry table, built from the strikes above (the shared install is not re-run) -------------------------------
  if (window.RebukeBoss) {
    const pats = {};
    for (const k in PATS) {
      const d = PATS[k];
      if (d.strikes && d.strikes.length) pats[k] = d.strikes.map(([sec, o]) => Object.assign({ t: sec / d.dur }, o || {}));
    }
    CervanthBoss.prototype.rebukeData = Object.assign({}, window.RebukeBoss.DEFAULTS, { rate: (b) => b.patRate(), patterns: pats });
  }
})();
