// =========================================================================
// BOSS_CERVANTH.JS: Cervanth, the Antlered Colossus (the fourth Chalice raid, 1-4 players). Logic only:
//   boss_cervanth_pats.js   his attack patterns (PATS) and Rebuke table
//   boss_cervanth_rig.js    his model (a quadruped 2.5D rig) and poses
//   boss_cervanth_stage.js  the Hollow Glade, floor telegraphs, mechanic props and things in the air
// Design: design/cervanth_moveset.md. Built on VaelgorRaidBoss like Ignis and Hush, so every shared system keeps working
// (stagger, counters, Rebuke, Karok Clash, holds, loot cores, raid stats, difficulty): Vaelgor's update / draw / receiveDamage /
// breakPauldron / resetBoss / intro each start with a `core*` hook.
//
// THE FIGHT
//   BREAKS   'left' = the left antler, 'right' = the right antler. A broken antler halves his Tine Rain (and makes Gore Thrust
//            lunge once more). Both gone: a long stagger.
//   75%  THE HOLLOW HERD    ghost stags charge across the glade in lanes that show their hoofprints first. Pure dodge.
//   50%  HEART EXPOSED      the ribs split; break damage into the ember heart before it closes. Pays out a long stagger.
//   35%  CAGE OF TINES      his antlers plant in the ground; bone towers rise and each needs a player inside when it ripens.
//   15%  LAST CHARGE        the final phase (x1.5): chained stampedes, one at each player, then a wall crash and a long stun.
//   Normal: a failed Heart / Cage comes back ONCE 20s later. Hard: failing wipes the party.
//   Discovery: about 20s after a Stampede a pale ghost of the SAME stampede runs the same lane again with no tell (the Echo).
//   Co-op: host authoritative, patterns go out as boss_pattern (seeded); mechanic steps as boss_event 'cervanth_*'.
// =========================================================================
(function () {
  if (typeof VaelgorRaidBoss === 'undefined') return;
  const TAU = Math.PI * 2;
  const T = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.58);
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const isHost = () => !window.game || !window.game.net || window.game.net.isHost;
  const NET = () => (window.game && window.game.net) || null;
  const send = (obj) => { const n = NET(); if (n) n.broadcast(Object.assign({ type: 'boss_event' }, obj)); };
  const party = () => (window.game && window.game.party) || [];
  const living = () => party().filter(p => p && p.hp > 0);
  const flat = (p, x, y) => Math.hypot(p.x - x, (p.y - y) / T());
  const hard = () => !!(window.game && typeof window.game.isHard === 'function' && window.game.isHard());
  function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const MECH_RE = /_mechanic$/;
  const STAGE = { x: 0, y: 0 };
  const HP_BASE = 220000;                     // below Hush (241.5k), same gear tier as Vaelgor
  const ECHO_DELAY = 20;

  // ---- sound: all synth (WebAudio), nothing generated. Each pattern's startup has its own sound built from these --------------
  const SFX = (function () {
    const A = () => (typeof audio !== 'undefined' && audio && !audio.muted && audio.ctx ? audio : null);
    function noise(dur, f0, f1, q, vol, type = 'bandpass', delay = 0) {
      const a = A(); if (!a || !a.getDecayNoiseBuffer) return;
      const now = a.ctx.currentTime + delay;
      const src = a.ctx.createBufferSource(); src.buffer = a.getDecayNoiseBuffer(dur, 1.5);
      const f = a.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, now); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), now + dur);
      const g = a.ctx.createGain(); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(f); f.connect(g); a.connectWithReverb ? a.connectWithReverb(g, 0.25) : g.connect(a.ctx.destination);
      src.start(now);
    }
    function tone(f0, f1, dur, type, vol, delay = 0) {
      const a = A(); if (!a) return;
      const now = a.ctx.currentTime + delay;
      const o = a.ctx.createOscillator(), g = a.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
      g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g); a.connectWithReverb ? a.connectWithReverb(g, 0.3) : g.connect(a.ctx.destination);
      o.start(now); o.stop(now + dur + 0.02);
    }
    return {
      rattle(n = 3) { for (let i = 0; i < n; i++) { noise(0.06, 2600, 1400, 7, 0.1, 'bandpass', i * 0.085); tone(1500 + i * 130, 900, 0.05, 'square', 0.025, i * 0.085); } },
      scrape() { noise(0.55, 700, 260, 3, 0.16, 'bandpass'); tone(900, 280, 0.5, 'sawtooth', 0.03); },
      thud(s = 1) { tone(95 * s, 38, 0.3, 'sine', 0.42); noise(0.12, 500, 180, 1, 0.1, 'lowpass'); },
      clicks(n = 6) { for (let i = 0; i < n; i++) tone(1200 + i * 160, 1500 + i * 190, 0.04, 'triangle', 0.05, i * 0.1); },
      rumble(d = 1.1) { tone(48, 70, d, 'sawtooth', 0.12); tone(62, 96, d, 'sine', 0.3); noise(d, 140, 420, 1, 0.08, 'lowpass'); },
      drums(n = 8) { for (let i = 0; i < n; i++) tone(110, 52, 0.16, 'sine', 0.24 + i * 0.015, i * Math.max(0.07, 0.19 - i * 0.012)); },
      whip() { noise(0.1, 4200, 1200, 2, 0.35, 'highpass'); tone(2400, 500, 0.09, 'sawtooth', 0.06); },
      inhale(d = 0.9) { noise(d, 300, 1400, 1.2, 0.16, 'bandpass'); tone(220, 90, d, 'triangle', 0.05); },
      gurgle(d = 0.7) { for (let i = 0; i < 6; i++) tone(180 + (i % 3) * 60, 120, 0.1, 'sine', 0.07, i * d / 6); noise(d, 600, 900, 4, 0.05, 'bandpass'); },
      horn() { tone(196, 262, 1.4, 'sawtooth', 0.09); tone(294, 392, 1.3, 'triangle', 0.07); tone(98, 98, 1.5, 'sine', 0.22); },
      heart(v = 1) { tone(70, 40, 0.22, 'sine', 0.38 * v); tone(60, 36, 0.24, 'sine', 0.3 * v, 0.2); },
      crunch() { noise(0.4, 900, 120, 1.4, 0.3, 'lowpass'); tone(80, 28, 0.5, 'sawtooth', 0.14); },
      roar(d = 1.4) { noise(d, 500, 160, 0.8, 0.22, 'lowpass'); tone(130, 60, d, 'sawtooth', 0.12); tone(90, 50, d, 'square', 0.04); },
      snap() { noise(0.16, 3200, 600, 1.5, 0.4, 'bandpass'); tone(300, 60, 0.2, 'square', 0.1); },
      bell(f = 330, d = 1.6) { tone(f, f * 0.98, d, 'sine', 0.2); tone(f * 2.4, f * 2.38, d * 0.6, 'sine', 0.05); }
    };
  })();

  // an inline raid-wide tell used by every startup: expanding bone-dust puff + camera nudge
  const MUSIC = null;

  class CervanthBoss extends VaelgorRaidBoss {
    constructor(x, y) {
      super(x, y);
      this.isCervanth = true;
      this.raidId = 'cervanth';
      this.name = 'Cervanth, the Antlered Colossus';
      this.hudName = 'CERVANTH';
      this.speakerName = 'CERVANTH';
      this.subtitle = 'THE ANTLERED COLOSSUS • THE HOLLOW GLADE';
      this.modelScale = 0.95;
      this.hipWidth = 5.4;
      this.thighLen = 24;
      this.shinLen = 24;
      this.turnSpeed = 4.4;
      this.cervInit();
      this.snapFeetToBody();
    }

    cervInit() {
      this.phase = 1;
      this.mech75 = false; this.mech50 = false; this.mech35 = false; this.mech15 = false; this.pendingMech = null;
      this.mechRetried = {}; this.mechRetry = null;
      this.mech = null;
      this.teles = []; this.hazards = []; this.proj = []; this.vfx = []; this.ghosts = []; this.cracks = [];
      this.echoes = [];                                 // [{ t, x, y, a, len, w }]: a Stampede that will come back unannounced
      this.pat = null; this.patT = 0; this._patPrev = 0; this.patRng = Math.random;
      this.lastDownCount = 0; this.patSerial = 0;
      this.finalPhaseOn = false; this.lastCharge = null;
      this.heart = null; this.heartOpen = 0;            // the ember heart (0..1 how far the ribs are split)
      this.karokStyle = 'smash';
      this.karokLane = { fill: '225, 29, 72', edge: '253, 164, 175', len: 380, half: 72 };
      // Vaelgor's own phase machinery stays switched off
      this.eclipse75Triggered = this.eclipse55Triggered = this.eclipse35Triggered = this.eclipse10Triggered = true;
      this.finalPhase = false; this.finalTransitionPending = false; this.finalTransitionActive = false;
      this.finalClash15Triggered = true;
    }

    get maxSpeed() { return (this.enraged && this.enrageTimer <= 0) ? 220 : (this.phase >= 2 ? 168 : 150); }
    outgoingDamageMult() {
      if (this.enraged && this.enrageTimer <= 0) return 2.2;
      let m = 1;
      if (this.finalPhaseOn) m *= 1.5;
      else if (this.phase >= 2) m *= 1.05;
      return m;
    }
    patRate() {
      if (['staggered', 'rebuked', 'flinched', 'intro_cutscene'].indexOf(this.state) >= 0) return 1;
      let r = this.phase >= 3 ? 1.14 : (this.phase === 2 ? 1.07 : 1.0);
      if (this.finalPhaseOn) r *= 1.08;
      if (this.enraged && this.enrageTimer <= 0) r = Math.max(r, 1.3);
      return r;
    }
    applyLobbyScaling(partySize = 1, resetHp = false) {
      const n = Math.max(1, partySize || 1);
      const hpMult = 1.0 + (n - 1) * 0.85, stagMult = 1.0 + (n - 1) * 0.55;
      const prevFrac = this.maxHp > 0 ? c01(this.hp / this.maxHp) : 1;
      this.maxHp = Math.round(HP_BASE * hpMult);
      this.hp = resetHp ? this.maxHp : Math.max(1, Math.round(this.maxHp * prevFrac));
      this.maxStagger = Math.round(4000 * stagMult);
      this.partBreakMax = Math.round(1050 * stagMult);
      this.partySizeNow = n;
    }
    applyEnrage(fromNetwork = false) {
      if (this.enraged && this.enrageTimer <= 0) return;
      this.enrageTimer = 0; this.enraged = true; this.awakened = true;
      audio.playImpactBoom(2.0); SFX.roar(1.6);
      if (window.fx) { window.fx.triggerShake(26, 0.7); window.fx.addShockwave(this.x, this.y, 380, '#e11d48', 9); window.fx.triggerScreenFlash && window.fx.triggerScreenFlash('#3b0716', 0.4); }
      if (!fromNetwork) this.broadcastBossEvent('enrage');
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // helpers (no voice: say / grunt do nothing, he is a beast)
    // ---------------------------------------------------------------------------------------------------------------------------
    say() {}
    cueSay() {}
    grunt() {}
    pick(list, rnd) { return list[Math.floor((rnd || Math.random)() * list.length) % list.length]; }
    at(sec) { return this._patPrev < sec && this.patT >= sec; }
    aim(p) { if (p) this.facingAngle = Math.atan2((p.y - this.y) / T(), p.x - this.x); this.baseFacing = this.facingAngle; }
    reaim(maxTurn) {
      const p = this.tgt(); if (!p) return;
      const want = Math.atan2((p.y - this.y) / T(), p.x - this.x);
      this.facingAngle += Math.max(-maxTurn, Math.min(maxTurn, wrapA(want - this.facingAngle)));
    }
    tgt() { return this.resolveTargetById(living(), this.activeTargetId) || living()[0]; }
    fwd(d, a = this.facingAngle, ox = this.x, oy = this.y) { return { x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d * T() }; }
    tele(o, lead) { o.life = o.max = Math.max(0.05, lead); this.teles.push(o); return o; }
    vfxAdd(o) { o.t = 0; if (o.x == null) { o.x = this.x; o.y = this.y; } this.vfx.push(o); if (this.vfx.length > 140) this.vfx.shift(); return o; }
    hurt(p, dmg, label, power = 'medium', sx = this.x, sy = this.y, push = 110) {
      if (!p || p.hp <= 0 || !(p.isLocal || p.isBot)) return;
      p.takeDamage(Math.round(dmg * this.outgoingDamageMult()), label, { power, sourceX: sx, sourceY: sy, pushDist: push });
    }
    hitSectorP(L, r0, r1, a, half, dmg, label, power, push) { this.damagePlayersInSector(L, this.x, this.y, r0, r1, a, half, dmg * this.outgoingDamageMult(), label, power, push); }
    hitCorridorP(L, x, y, a, len, hw, dmg, label, power, push) { this.damagePlayersInCorridor(L, x, y, a, len, hw, dmg * this.outgoingDamageMult(), label, power, push); }
    hitCircle(L, x, y, r, dmg, label, power = 'medium', push = 120) { this.damagePlayersInRadius(L, x, y, r, dmg * this.outgoingDamageMult(), label, power, push); }
    inSector(p, x, y, r0, r1, a, half) {
      const dx = p.x - x, dy = (p.y - y) / T(), d = Math.hypot(dx, dy);
      if (d < r0 || d > r1) return false;
      return d < 8 || Math.abs(wrapA(Math.atan2(dy, dx) - a)) <= half;
    }
    inCorridor(p, x, y, a, len, hw, back = 18) {
      const dx = p.x - x, dy = (p.y - y) / T();
      const f = dx * Math.cos(a) + dy * Math.sin(a), l = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
      return f >= -back && f <= len && l <= hw;
    }
    inArena(x, y, r = 540) {
      const d = Math.hypot(x - STAGE.x, (y - STAGE.y) / T());
      if (d <= r) return { x, y };
      const a = Math.atan2((y - STAGE.y) / T(), x - STAGE.x);
      return { x: STAGE.x + Math.cos(a) * r, y: STAGE.y + Math.sin(a) * r * T() };
    }
    arenaR() { return (window.game && window.game.arenaRadius) || 590; }
    isMech() { return MECH_RE.test(this.state || ''); }
    isWarded() { return !!(this.mech && this.mech.warded); }
    isUntargetable() {
      const m = this.mech;
      if (!m) return this.state === 'intro_cutscene';
      return false;
    }
    holdBlocked() { return this.isMech() || this.state === 'intro_cutscene'; }
    hudTag() {
      if (this.hp <= 0) return '';
      if (this.isMech()) return this.mech && this.mech.kind === 'heart' ? ' • HEART' : ' • WARDED';
      if (this.finalPhaseOn) return ' • LAST CHARGE';
      return '';
    }
    isInCutscene() { return this.state === 'intro_cutscene'; }
    get musicFiles() { return null; }
    musicKeyFor(base) { return base; }

    // break points: left = the left antler, right = the right antler. In world space they sit above his head.
    getShoulderWorldPositions() {
      const a = this.facingAngle, cs = Math.cos(a), sn = Math.sin(a), S = this.modelScale;
      const mk = (side) => {
        const f = 62 * S, s = side * 30 * S;
        return { x: this.x + f * cs - s * sn, y: this.y + (f * sn + s * cs) * T() };
      };
      const l = mk(-1), r = mk(1);
      const L = this.leftShoulderWorld || (this.leftShoulderWorld = {}), R = this.rightShoulderWorld || (this.rightShoulderWorld = {});
      L.x = l.x; L.y = l.y; R.x = r.x; R.y = r.y;
      L.sx = l.x; L.sy = l.y - 150 * S - (this.jumpZ || 0); R.sx = r.x; R.sy = r.y - 150 * S - (this.jumpZ || 0);
      return { left: L, right: R };
    }
    breakCoreName(side) { return side === 'left' ? 'LEFT ANTLER CORE' : 'RIGHT ANTLER CORE'; }
    recordExecutedPattern(name) {
      if (MECH_RE.test(name) || name === 'intro_cutscene') return;
      this.recentPatterns.push(name);
      while (this.recentPatterns.length > 2) this.recentPatterns.shift();
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // reset / intro
    // ---------------------------------------------------------------------------------------------------------------------------
    coreReset(x, y) {
      for (const p of party()) if (p) { p.qteActive = false; p.rooted = false; }
      this.x = x; this.y = y; this.spawnX = x; this.spawnY = y;
      this.applyLobbyScaling(party().length || 1, true);
      this.stagger = 0;
      this.enrageMaxTimer = 330; this.enrageTimer = 330; this.enraged = false; this.awakened = false;   // Hard 5:30 (Normal: difficulty.js)
      this.leftPartBreak = this.rightPartBreak = 0; this.leftPauldronBroken = this.rightPauldronBroken = false;
      this.partBreak = 0; this.pauldronBroken = false;
      this.recentPatterns = []; this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 1.3;
      this.recoilX = this.recoilY = this.recoilVx = this.recoilVy = 0;
      this.hitFlashTimer = 0; this.leftPauldronFlashTimer = this.rightPauldronFlashTimer = 0;
      this.hitStutterTimer = 0; this.lockedByUltimateTimer = 0; this.jumpZ = 0;
      this.counterableWindow = false;
      this.threatMap.clear(); this.activeTargetId = null; this.targetReevalTimer = 0;
      this.practiceClockMode = this.practiceFinalPhaseMode = this.practiceFinalClashMode = false;
      this.cervInit();
      this.facingAngle = Math.PI * 0.5;
      this.snapFeetToBody();
      if (this.resetRig) this.resetRig();
    }

    // INTRO: the camera finds a pale shape between the dead trees. It lifts its head; the antlers rattle; it walks into the glade.
    coreIntro() {
      const skip = this.skippingCutscenes && this.skippingCutscenes();
      const D = skip ? 2.2 : 7.0;
      this.state = 'intro_cutscene';
      this.stateDuration = D; this.stateTimer = D; this.patT = 0; this._patPrev = 0;
      this._introShort = !!skip;
      this.counterableWindow = false; this.jumpZ = 0;
      this.x = STAGE.x; this.y = STAGE.y - 330; this.facingAngle = Math.PI * 0.5; this.baseFacing = this.facingAngle;
      this.speed = 0; this.vx = this.vy = 0; this.targetX = this.x; this.targetY = this.y;
      this.snapFeetToBody();
      if (this.resetRig) this.resetRig();
      const cam = window.game && window.game.camera;
      if (cam && typeof cam.startCinematicCutscene === 'function') {
        cam.x = this.x; cam.y = this.y - 60;
        cam.startCinematicCutscene(this.x, this.y - 60, D, 1.1, 'CERVANTH, THE ANTLERED COLOSSUS', 'WARDEN OF THE HOLLOW GLADE', '');
      }
    }
    tickIntro(dt) {
      const t = this.patT, D = this.stateDuration, k = this._introShort ? D / 7.0 : 1;
      const cam = window.game && window.game.camera;
      // 0-2.2 stands still, head down; 2.2 lifts, antlers rattle; 3.6-7 walks into the glade
      const s = c01((t - 3.6 * k) / (3.4 * k));
      const e = s * s * (3 - 2 * s);
      this.x = STAGE.x; this.y = lerp(STAGE.y - 330, STAGE.y - 40, e); this.facingAngle = Math.PI * 0.5;
      this.speed = s > 0 && s < 1 ? 70 : 0; this.vy = s > 0 && s < 1 ? 70 : 0;
      if (cam) { cam.cinematicTargetX = this.x; cam.cinematicTargetY = this.y - 70; }
      if (this.at(2.2 * k)) { SFX.rattle(5); SFX.rumble(1.6); if (window.fx) window.fx.triggerShake(8, 0.4); }
      if (this.at(3.6 * k)) { SFX.horn(); }
      if (this.at(6.6 * k)) { audio.playImpactBoom(1.5); SFX.roar(1.2); if (window.fx) { window.fx.triggerShake(16, 0.4); window.fx.addShockwave(this.x, this.y, 300, '#e11d48', 7); } }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // damage taken
    // ---------------------------------------------------------------------------------------------------------------------------
    coreReceiveDamage(dmg, staggerAmt, attacker, hitOpts) {
      if (this.hp <= 0 || this.state === 'intro_cutscene') return;
      const opts = hitOpts || {};
      if (!opts.fromNetwork && attacker && attacker.isRemote) return;   // the owner's boss_hit packet is the real one
      const host = isHost();
      const m = this.mech;

      let side = opts.pauldronSide || null;
      const parts = this.getShoulderWorldPositions();
      let sx = opts.hitX, sy = opts.hitY;
      if (sx === undefined || sy === undefined) {
        if (attacker && attacker.x !== undefined) { const aa = attacker.facingAngle || 0; sx = attacker.x + Math.cos(aa) * 26; sy = attacker.y + Math.sin(aa) * 26 * T(); }
        else { sx = this.x; sy = this.y + 40; }
      }
      const dL = Math.hypot(sx - parts.left.x, (sy - parts.left.y) / T()), dR = Math.hypot(sx - parts.right.x, (sy - parts.right.y) / T());
      if (!side) side = dL < dR ? 'left' : 'right';

      if (!opts.fromNetwork && attacker && attacker.isLocal && NET()) {
        NET().broadcast({
          type: 'boss_hit', dmg, staggerAmt, attackerId: attacker.id, isStrongMove: !!opts.isStrongMove,
          impulseStrength: opts.impulseStrength || (opts.isStrongMove ? 1.35 : 0.75), threatMult: opts.threatMult || 1.0,
          posType: opts.posType || 'normal', pauldronSide: side, hitX: Math.round(sx), hitY: Math.round(sy),
          partBreakMult: opts.partBreakMult !== undefined ? opts.partBreakMult : (opts.isStrongMove ? 1.0 : 0),
          skill: opts.skill || undefined, crit: !!opts.crit
        });
      }
      if (attacker && attacker.id) this.addThreat(attacker.id, (dmg * 0.85 + staggerAmt * 7.5) * (opts.threatMult || (opts.isStrongMove ? 1.25 : 1)));

      let stagMult = 1;
      // HEART EXPOSED: every hit goes into the heart, nothing else (the stagger bar and breaks are frozen)
      if (m && m.kind === 'heart' && m.phase === 'open') {
        const put = dmg + staggerAmt * 1.2 * (opts.partBreakMult !== undefined ? Math.max(0.6, opts.partBreakMult) : 1);
        m.dealt += put;
        this.hitFlashTimer = 0.085;
        this.vfxAdd({ k: 'heartHit', x: this.x, y: this.y, life: 0.35 });
        SFX.heart(0.6);
        if (host && m.dealt >= m.need) this.endHeart(true);
        this.hp = Math.max(Math.ceil(this.maxHp * 0.01), this.hp - Math.max(1, Math.round(dmg * 0.04)));
        return;
      }
      if (m) { if (m.warded) { dmg = Math.max(1, Math.round(dmg * 0.05)); stagMult = 0; } }

      // HP gates: 75 / 50 / 35 each hold the bar at its line until the mechanic is cleared; 15 starts the final phase
      const floors = [];
      if (!this.mech75) floors.push(0.75);
      else if (!this.mech50) floors.push(0.50);
      else if (!this.mech35) floors.push(0.35);
      else if (!this.mech15) floors.push(0.15);
      const fl = floors.length ? Math.ceil(this.maxHp * floors[0]) : 0;
      const lowest = Math.max(1, Math.ceil(this.maxHp * 0.01));
      if (fl && this.hp - dmg <= fl) {
        // the gate: the bar stops on the line (the part of the hit that would cross it is mostly soaked)
        const over = Math.max(0, dmg - Math.max(0, this.hp - fl));
        this.hp = Math.max(lowest, Math.min(this.hp, fl) - Math.max(1, Math.round(over * 0.02)));
        if (host && !this.pendingMech && !this.isMech()) this.queueGate(floors[0]);
      } else this.hp = Math.max(0, this.hp - dmg);

      this.hitFlashTimer = 0.085;
      if (side === 'left' && !this.leftPauldronBroken) this.leftPauldronFlashTimer = Math.max(this.leftPauldronFlashTimer, 0.12);
      if (side === 'right' && !this.rightPauldronBroken) this.rightPauldronFlashTimer = Math.max(this.rightPauldronFlashTimer, 0.12);
      let hitAng = this.facingAngle + Math.PI;
      if (attacker && attacker.x !== undefined) hitAng = Math.atan2((this.y - attacker.y) / T(), this.x - attacker.x);
      const imp = (opts.impulseStrength || (opts.isStrongMove ? 1.35 : 0.75)) * 0.7;   // he is heavy
      this.recoilVx += Math.cos(hitAng) * 130 * imp; this.recoilVy += Math.sin(hitAng) * 130 * imp;
      this.pelvisVelZ -= 22 * imp; this.pauldronVelZ -= 34 * imp;
      if (opts.isStrongMove && !this.isMech()) this.hitStutterTimer = Math.max(this.hitStutterTimer, 0.06);

      const sAmt = staggerAmt * stagMult;
      if (sAmt > 0 && this.state !== 'staggered' && !this.isMech()) {
        this.stagger += sAmt;
        if (!host) this.stagger = Math.min(this.stagger, this.maxStagger - 1);
        else if (this.stagger >= this.maxStagger) { this.stagger = 0; this.cervStagger('💥 STAGGER BROKEN!'); }
      }

      // antler breaks: precise strong hits on the antler from the front
      const pb = opts.partBreakMult !== undefined ? opts.partBreakMult : (opts.isStrongMove ? 1.0 : 0);
      const broken = side === 'left' ? this.leftPauldronBroken : this.rightPauldronBroken;
      const dPart = side === 'left' ? dL : dR;
      if (!broken && pb > 0 && dPart <= 90 && !(m && m.warded)) {
        let pos = opts.posType;
        if (!pos && attacker && attacker.x !== undefined) {
          const diff = Math.abs(wrapA(Math.atan2(attacker.y - this.y, attacker.x - this.x) - this.facingAngle));
          pos = diff < 1.1 ? 'head' : (diff > Math.PI - 1.15 ? 'back' : 'normal');
        }
        const eff = this.state === 'staggered' ? 1.25 : (pos === 'head' ? 1.0 : (pos === 'normal' ? 0.7 : 0.35));
        const gain = staggerAmt * 0.42 * pb * eff;
        if (gain > 0) {
          const cap = host ? this.partBreakMax : this.partBreakMax - 1;
          if (side === 'left') { this.leftPartBreak = Math.min(cap, this.leftPartBreak + gain); if (this.leftPartBreak >= this.partBreakMax) this.breakPauldron('left', false); }
          else { this.rightPartBreak = Math.min(cap, this.rightPartBreak + gain); if (this.rightPartBreak >= this.partBreakMax) this.breakPauldron('right', false); }
          this.partBreak = this.leftPartBreak + this.rightPartBreak;
        }
      }
    }
    queueGate(line) {
      if (line === 0.75) { this.mech75 = true; this.pendingMech = 'herd_mechanic'; }
      else if (line === 0.50) { this.mech50 = true; this.pendingMech = 'heart_mechanic'; }
      else if (line === 0.35) { this.mech35 = true; this.pendingMech = 'cage_mechanic'; }
      else if (line === 0.15) { this.mech15 = true; this.pendingMech = 'charge_mechanic'; }
    }

    cervStagger(text, dur) {
      this.cleanMechanic();
      this.enterStaggerState(text);
      if (dur) { this.stateDuration = dur; this.stateTimer = dur; }
    }
    enterStaggerState(text, fromNetwork = false) {
      if (this.mech) this.cleanMechanic(true);
      this.pat = null; this.patName = null; this.jumpZ = 0;
      super.enterStaggerState(text, fromNetwork);
      if (/HEART|STUNNED/.test(String(text || ''))) { this.stateDuration = this.stateTimer = /HEART/.test(text) ? 8 : 9; }
    }
    executeCounterStagger(player, fromNetwork = false) { super.executeCounterStagger(player, fromNetwork); }
    lockInPlaceForUltimate(...args) {
      if (this.isMech() || this.state === 'intro_cutscene') return;
      return super.lockInPlaceForUltimate(...args);
    }
    enterRebuked(px, py) { super.enterRebuked(px, py); SFX.thud(1.4); }
    partBreakFlinch() {
      if (this.isMech() || ['intro_cutscene', 'staggered', 'rebuked', 'flinched', 'karok_clash'].indexOf(this.state) >= 0) return;
      if (this.lockedByUltimateTimer > 0 || (this.jumpZ || 0) > 2 || this.hp <= 0) return;
      this.counterableWindow = false; this.speed = 0; this.vx = this.vy = 0; this.targetX = this.x; this.targetY = this.y;
      this.pat = null; this.state = 'flinched'; this.stateDuration = 0.8; this.stateTimer = 0.8; this.patT = 0; this._patPrev = 0;
      this.snapFeetToBody();
      this._rebukePush = { ux: -Math.cos(this.facingAngle), uy: -Math.sin(this.facingAngle), dist: 24, dur: 0.25, t: 0 };
      this.aiCooldown = Math.min(this.aiCooldown || 0, 1.0);
    }
    coreBreakPart(side, fromNetwork = false) {
      const left = side === 'left';
      if (left ? this.leftPauldronBroken : this.rightPauldronBroken) return;
      if (left) { this.leftPartBreak = this.partBreakMax; this.leftPauldronBroken = true; this.leftPauldronFlashTimer = 0; }
      else { this.rightPartBreak = this.partBreakMax; this.rightPauldronBroken = true; this.rightPauldronFlashTimer = 0; }
      this.partBreak = this.leftPartBreak + this.rightPartBreak;
      this.pauldronBroken = this.leftPauldronBroken && this.rightPauldronBroken;
      const pos = this.getShoulderWorldPositions()[left ? 'left' : 'right'];
      audio.playParryClang(true); audio.playImpactBoom(1.35); SFX.snap();
      if (window.fx) {
        window.fx.triggerShake(18, 0.42);
        window.fx.addShockwave(pos.x, pos.y, 140, '#fda4af', 5);
        window.fx.addDragSparks(pos.x, pos.y - 150 * this.modelScale, 0, 30, false, '#fda4af');
      }
      // the antler spins off
      this.vfxAdd({ k: 'antlerFly', x: pos.x, y: pos.y, side: left ? -1 : 1, a: this.facingAngle, life: 1.3, z: 150 * this.modelScale });
      this.partBreakFlinch();
      if (this.leftPauldronBroken && this.rightPauldronBroken && isHost() && !this.isMech()) this.cervStagger('💥 BOTH ANTLERS BROKEN!', 6);
      if (!fromNetwork) this.broadcastBossEvent('pauldron_break', { side: left ? 'left' : 'right' });
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // UPDATE
    // ---------------------------------------------------------------------------------------------------------------------------
    coreUpdate(dt, partyArr, arenaCenter, arenaRadius) {
      if (this.hp <= 0) { this.teles.length = 0; this.ghosts.length = 0; return; }
      if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      if (this.leftPauldronFlashTimer > 0) this.leftPauldronFlashTimer = Math.max(0, this.leftPauldronFlashTimer - dt);
      if (this.rightPauldronFlashTimer > 0) this.rightPauldronFlashTimer = Math.max(0, this.rightPauldronFlashTimer - dt);
      this.counterGraceTimer = this.isCounterable() ? 0.25 : Math.max(0, (this.counterGraceTimer || 0) - dt);
      this.recoilVx += (-this.recoilX * 185 - this.recoilVx * 16) * dt; this.recoilVy += (-this.recoilY * 185 - this.recoilVy * 16) * dt;
      this.recoilX += this.recoilVx * dt; this.recoilY += this.recoilVy * dt;
      this.pelvisVelZ += (-this.pelvisBounceZ * 140 - this.pelvisVelZ * 14) * dt; this.pelvisBounceZ += this.pelvisVelZ * dt;
      this.pauldronVelZ += (-this.pauldronLagZ * 95 - this.pauldronVelZ * 10) * dt; this.pauldronLagZ += this.pauldronVelZ * dt;
      const host = isHost();
      if (this._proneAt && this.state !== 'staggered') this._proneAt = 0;       // the Karok smash leaves him face-down only for that stagger

      const cut = this.state === 'intro_cutscene' || (this.mech && this.mech.phase === 'intro');
      if (!cut && !this.enraged) {
        this.enrageTimer = Math.max(host ? 0 : 0.05, this.enrageTimer - dt);
        if (host && this.enrageTimer <= 0) this.applyEnrage(false);
      }
      this.decayThreat(dt);
      this.getShoulderWorldPositions();
      const L = (partyArr || []).filter(p => p.hp > 0);
      this.updateTeles(dt * (this.pat ? this.patRate() : 1));
      this.updateHazards(dt, L);
      this.updateGhosts(dt, L);
      if (this.updateProjectiles) this.updateProjectiles(dt, L);
      this.tickEchoes(dt, L);
      for (const v of this.vfx) v.t += dt;
      this.vfx = this.vfx.filter(v => v.t < (v.life || 1));
      for (const c of this.cracks) c.t += dt;
      this.cracks = this.cracks.filter(c => c.t < 90);
      if (this.updateRig) this.updateRig(dt);
      // the heart (ribs) opens and closes smoothly
      const wantOpen = (this.mech && this.mech.kind === 'heart' && this.mech.phase === 'open') ? 1 : (this.state === 'cv_rear_stomp' ? 0.45 : 0);
      this.heartOpen += (wantOpen - this.heartOpen) * Math.min(1, dt * 5);

      if (this.hitStutterTimer > 0) { this.hitStutterTimer = Math.max(0, this.hitStutterTimer - dt); return; }
      if (this.lockedByUltimateTimer > 0) {
        this.lockedByUltimateTimer = Math.max(0, this.lockedByUltimateTimer - dt);
        this.vx = this.vy = this.speed = 0;
        return;
      }
      this.breathePhase += dt * 1.4;

      if (host && (this.state === 'idle' || this.state === 'walk')) {
        this.targetReevalTimer -= dt;
        if (this.targetReevalTimer <= 0 || !this.activeTargetId || !L.some(p => p.id === this.activeTargetId)) {
          this.selectTargetForPattern(L, 'aggro'); this.targetReevalTimer = 3.2;
        }
      }
      const primary = this.resolveTargetById(L, this.activeTargetId) || L[0];
      const pct = this.hp / this.maxHp;
      this.phase = pct > 0.70 ? 1 : (pct > 0.40 ? 2 : (pct > 0.15 && !this.finalPhaseOn ? 3 : (this.finalPhaseOn ? 4 : 3)));
      this.awakened = this.phase >= 2;

      if (host && this.mechRetry) {
        const r = this.mechRetry; r.t -= dt;
        if (r.t <= 0 && !this.pendingMech && (this.state === 'idle' || this.state === 'walk')) { this.pendingMech = r.name; this.mechRetry = null; }
      }
      if (host && this.pendingMech && (this.state === 'idle' || this.state === 'walk') && this.lockedByUltimateTimer <= 0 && !this.karokClash) {
        const name = this.pendingMech; this.pendingMech = null;
        this.triggerPatternByName(name, null, false);
        return;
      }

      if (this.mech && !this.isMech()) this.cleanMechanic();
      if (this.isMech()) {
        this.updateMechanic(dt, L);
      } else if ((this.state === 'idle' || this.state === 'walk') && primary) {
        if (host) {
          this.targetX = primary.x; this.targetY = primary.y;
          this.aiCooldown -= dt;
          if (this.aiCooldown <= 0) this.chooseNext(L, primary);
        }
      } else if (this.state !== 'idle' && this.state !== 'walk' && this.state !== 'karok_clash') {
        this.updatePatternState(dt, L);
      }

      const dx = this.targetX - this.x, dy = this.targetY - this.y, d = Math.hypot(dx, dy);
      const canWalk = this.state === 'idle' || this.state === 'walk';
      if (canWalk && d > 110) {
        this.state = 'walk';
        this.moveAngle = Math.atan2(dy, dx);
        this.speed += (Math.min(this.maxSpeed, d * 1.6) - this.speed) * Math.min(1, 4 * dt);
        this.vx = Math.cos(this.moveAngle) * this.speed; this.vy = Math.sin(this.moveAngle) * this.speed;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.rotateTowards(Math.atan2(dy / T(), dx), dt);
      } else {
        if (this.state === 'walk') this.state = 'idle';
        this.speed *= 0.85; this.vx *= 0.85; this.vy *= 0.85;
        if (canWalk && primary) this.rotateTowards(Math.atan2((primary.y - this.y) / T(), primary.x - this.x), dt * 0.7);
      }
      if (!host) this.applyNetSyncCorrection(dt);
      if (arenaCenter && arenaRadius && !this.isMech() && !(this.pat && this.pat.free)) { const p = this.inArena(this.x, this.y, Math.max(60, arenaRadius - 40)); this.x = p.x; this.y = p.y; }
      if (this.jumpZ <= 0.1) this.updateFootSteps(dt); else this.syncAirborneFeet();
    }

    updatePatternState(dt, L) {
      if (this._clockState !== this.state) {
        this._clockState = this.state;
        if (this.state !== this.patName) { this.pat = null; this.patName = null; }
        this._patPrev = this.stateDuration - this.stateTimer - 1e-6;
      } else this._patPrev = this.stateDuration - this.stateTimer;
      this.stateTimer -= dt * this.patRate();
      this.patT = this.stateDuration - this.stateTimer;
      if (this.state === 'intro_cutscene') this.tickIntro(dt);
      else if (this.pat && this.pat.tick) this.pat.tick(this, L, dt);
      if (this.stateTimer <= 0) this.endPattern();
    }
    endPattern() {
      const was = this.state;
      const def = this.pat;
      this.pat = null; this.patName = null; this.counterableWindow = false; this.jumpZ = 0;
      if (def && def.end) def.end(this);
      this.state = 'idle'; this.stateTimer = 0; this.patT = 0;
      if (was === 'intro_cutscene') { this.aiCooldown = 0.8; this.x = STAGE.x; this.y = STAGE.y - 40; return; }
      if (isHost()) this.aiCooldown = this.finalPhaseOn ? (hard() ? 0.8 : 1.0) : (hard() ? 1.1 : 1.35);
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // AI (host only)
    // ---------------------------------------------------------------------------------------------------------------------------
    chooseNext(L, primary) {
      const PATS = CervanthBoss.PATS || {};
      // Hollow Howl pushes you into a Tine Rain: from phase 2 the two often come together
      if (this._chainTine && PATS.cv_tine_rain) { this._chainTine = false; this.triggerPatternByName('cv_tine_rain', this.selectTargetForPattern(L, 'hunter'), false); this.aiCooldown = 0.4; return; }
      const dist = Math.hypot(primary.x - this.x, (primary.y - this.y) / T());
      const ph = this.phase, close = dist < 260, fin = this.finalPhaseOn;
      const c = [];
      const add = (name, w, mode = 'aggro') => { const d = PATS[name]; if (d && (d.phase || 1) <= ph && (!d.finalOnly || fin) && (!d.notFinal || !fin)) c.push({ name, weight: w, mode }); };
      if (fin) {
        add('cv_stampede', 16, 'hunter'); add('cv_gore_thrust', 12); add('cv_tine_rain', 9, 'hunter'); add('cv_antler_sweep', 8); add('cv_mantle_lash', 6);
        add('cv_rear_stomp', 6); add('cv_hollow_howl', 5);
      } else if (close) {
        add('cv_antler_sweep', 14); add('cv_gore_thrust', 11); add('cv_hoof_combo', 13); add('cv_mantle_lash', 10); add('cv_rear_stomp', 7);
        add('cv_hollow_howl', 6); add('cv_marrow_spit', 5, 'hunter'); add('cv_tine_rain', 6, 'hunter'); add('cv_stampede', 4, 'hunter');
      } else {
        add('cv_gore_thrust', 12); add('cv_stampede', 12, 'hunter'); add('cv_tine_rain', 12, 'hunter'); add('cv_antler_sweep', 7); add('cv_hoof_combo', 8);
        add('cv_rear_stomp', 8); add('cv_hollow_howl', 9); add('cv_marrow_spit', 8, 'hunter'); add('cv_mantle_lash', 3);
      }
      const chosen = this.selectNonRepeatingPattern(c.filter(x => x.weight > 0));
      if (!chosen) return;
      const tg = this.selectTargetForPattern(L, chosen.mode || 'aggro');
      this.triggerPatternByName(chosen.name, tg, false);
    }
    triggerPatternByName(name, target, fromNetwork = false, netData = null) {
      const PATS = CervanthBoss.PATS || {};
      if (target && target.id) this.activeTargetId = target.id;
      this._rebukeSerial = (this._rebukeSerial || 0) + 1; this._rebukeUsed = null;
      const seed = (fromNetwork && netData && typeof netData.seed === 'number') ? netData.seed : ((Math.random() * 0x7fffffff) | 0);
      this.patSerial++;
      this.recordExecutedPattern(name);
      if (fromNetwork && netData) {
        if (typeof netData.x === 'number') { this.x = netData.x; this.y = netData.y; }
        if (typeof netData.facingAngle === 'number') this.facingAngle = netData.facingAngle;
      }
      const tg = target || this.tgt();
      if (name === 'intro_cutscene') this.triggerIntroCutscene();
      else if (name === 'pat_getsuga_charge') { this.pat = null; this.triggerPatternGetsugaCharge(tg); }
      else if (MECH_RE.test(name)) this.startMechanic(name, seed, netData);
      else if (PATS[name]) this.startPattern(name, tg, seed);
      if (!fromNetwork && isHost() && NET()) {
        NET().broadcast({
          type: 'boss_pattern', pattern: name, targetId: this.activeTargetId, seed,
          x: Math.round(this.x), y: Math.round(this.y), facingAngle: Number(this.facingAngle.toFixed(3)),
          baseFacing: Number((this.baseFacing ?? this.facingAngle).toFixed(3))
        });
      }
    }
    startPattern(name, tg, seed) {
      const def = CervanthBoss.PATS[name];
      this.pat = def; this.patName = name; this.patRng = rngFrom(seed);
      this.state = name; this.stateDuration = def.dur; this.stateTimer = def.dur;
      this.patT = 0; this._patPrev = -1e-6; this._clockState = name;
      this.counterableWindow = false; this.jumpZ = 0;
      this.speed = 0; this.vx = this.vy = 0; this.targetX = this.x; this.targetY = this.y;
      if (tg) this.aim(tg); else this.baseFacing = this.facingAngle;
      this.snapFeetToBody();
      def.start(this, tg, this.patRng);
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // telegraphs, floor hazards, ghosts, echoes
    // ---------------------------------------------------------------------------------------------------------------------------
    updateTeles(sdt) {
      for (const t of this.teles) {
        t.life -= sdt;
        if (t.follow) { t.x = this.x; t.y = this.y; if (t.k === 'sector' || t.k === 'corridor') t.a = this.facingAngle + (t.aOff || 0); }
      }
      this.teles = this.teles.filter(t => t.life > -0.18);
    }
    addHazard(o) { o.t = 0; o.id = (this._hzId = (this._hzId || 0) + 1); this.hazards.push(o); return o; }
    updateHazards(dt, L) {
      for (const h of this.hazards) {
        h.t += dt;
        if (h.t < (h.delay || 0)) continue;
        for (const p of L) {
          if (!p.isLocal && !p.isBot) continue;
          let inside = false;
          if (h.k === 'lane') inside = this.inCorridor(p, h.x, h.y, h.a, h.len, h.w, 6);
          else if (h.k === 'circle') inside = flat(p, h.x, h.y) <= h.r;
          if (!inside) continue;
          if (h.jump && (p.jumpZ || 0) > 14) continue;
          const key = '_hz' + h.id;
          if ((p[key] || 0) > performance.now()) continue;
          p[key] = performance.now() + (h.once ? 99999 : 650);
          this.hurt(p, h.dmg, h.label, h.power || 'medium', h.sx != null ? h.sx : p.x, h.sy != null ? h.sy : p.y, h.push || 40);
        }
      }
      this.hazards = this.hazards.filter(h => h.t < h.dur);
    }
    // ghost stags: a pale stag that runs a lane, hurting what it crosses (visual body drawn by the stage; the hit is a moving corridor)
    updateGhosts(dt, L) {
      for (const g of this.ghosts) {
        g.t += dt;
        if (g.t < g.delay) continue;
        const k = c01((g.t - g.delay) / g.run);
        g.px = g.x0 + (g.x1 - g.x0) * k; g.py = g.y0 + (g.y1 - g.y0) * k;
        for (const p of L) {
          if (!p.isLocal && !p.isBot) continue;
          if (flat(p, g.px, g.py) > g.w + 14) continue;
          if (g['h' + p.id]) continue;
          g['h' + p.id] = 1;
          this.hurt(p, g.dmg, g.label || 'Hollow Herd', 'heavy', g.px, g.py, 150);
        }
      }
      this.ghosts = this.ghosts.filter(g => g.t < g.delay + g.run + 0.5);
    }
    // THE ECHO: a Stampede returns about 20s later on the same lane, drawn as a pale ghost, with no telegraph
    tickEchoes(dt, L) {
      if (!this.echoes.length) return;
      for (const e of this.echoes) {
        if (this.isMech()) continue;
        e.t -= dt;
        if (e.t <= 0 && !e.fired) {
          e.fired = true;
          const run = e.len / e.speed;
          this.ghosts.push({ x0: e.x, y0: e.y, x1: e.x + Math.cos(e.a) * e.len, y1: e.y + Math.sin(e.a) * e.len * T(), delay: 0, run, w: e.w, dmg: e.dmg, label: 'Echo', t: 0, echo: true });
          SFX.drums(5);
          if (window.fx) window.fx.triggerShake(5, 0.25);
        }
      }
      this.echoes = this.echoes.filter(e => !e.fired);
    }
    // a showy landing: bone dust, a ring, a thud
    flair(x, y, r = 110, col = '#fda4af', shake = 5) {
      if (window.fx) {
        window.fx.addDragSparks(x, y - 10, -Math.PI / 2, 10, false, col);
        window.fx.addStepDust && window.fx.addStepDust(x, y, 6);
        if (shake) window.fx.triggerShake(shake, 0.18);
      }
      this.vfxAdd({ k: 'ring', x, y, r, col, life: 0.5 });
    }
    addCrack(x, y, a, len) { this.cracks.push({ x, y, a, len, t: 0, seed: Math.random() * 10 }); if (this.cracks.length > 40) this.cracks.shift(); }

    // =========================================================================================================================
    // MECHANICS
    // =========================================================================================================================
    startMechanic(name, seed, netData) {
      this.cleanMechanic(true);
      this.pat = null; this.counterableWindow = false; this.jumpZ = 0;
      this.speed = 0; this.vx = this.vy = 0;
      this.state = name; this.stateDuration = 999; this.stateTimer = 999; this.patT = 0;
      const rnd = rngFrom(seed);
      const skip = this.skippingCutscenes && this.skippingCutscenes();
      this.teles = []; this.hazards = []; this.proj = []; this.ghosts = [];
      this.echoes = [];
      if (name === 'herd_mechanic') this.mech = this.makeHerd(rnd, skip);
      else if (name === 'heart_mechanic') this.mech = this.makeHeart(rnd, skip);
      else if (name === 'cage_mechanic') this.mech = this.makeCage(rnd, skip);
      else if (name === 'charge_mechanic') this.mech = this.makeCharge(rnd, skip);
      this.mech.seed = seed;
      this.mech.fromX = this.x; this.mech.fromY = this.y;
    }
    cleanMechanic(keepState) {
      const m = this.mech;
      if (!m) return;
      this.mech = null;
      this.jumpZ = 0;
      this.ghosts = this.ghosts.filter(g => g.echo);
      if (!keepState && this.isMech()) { this.state = 'idle'; this.stateTimer = 0; }
    }
    updateMechanic(dt, L) {
      const m = this.mech;
      if (!m) { this.state = 'idle'; return; }
      m.t += dt;
      this.vx = this.vy = this.speed = 0;
      if (m.kind === 'herd') this.tickHerd(m, dt, L);
      else if (m.kind === 'heart') this.tickHeart(m, dt, L);
      else if (m.kind === 'cage') this.tickCage(m, dt, L);
      else if (m.kind === 'charge') this.tickCharge(m, dt, L);
    }
    mechGlide(m, tx, ty, k) {
      const e = k * k * (3 - 2 * k);
      this.x = lerp(m.fromX, tx, e); this.y = lerp(m.fromY, ty, e);
      this.targetX = this.x; this.targetY = this.y;
    }
    mechFailBlast(label, x, y) {
      audio.playImpactBoom(2.2); SFX.roar(1.2);
      if (window.fx) {
        window.fx.triggerShake(30, 0.8); window.fx.triggerScreenFlash && window.fx.triggerScreenFlash('#3b0716', 0.45);
        window.fx.addShockwave(x, y, 620, '#e11d48', 12, 0.9);
      }
      for (const p of living()) if (p.isLocal || p.isBot) p.takeDamage(99999, label, { power: 'cataclysm', sourceX: x, sourceY: y, pushDist: 200, forceLethal: hard() });
    }
    scheduleRetry(name, always) {
      if (hard() || !isHost()) return;
      if (!always && this.mechRetried[name]) return;
      this.mechRetried[name] = true;
      this.mechRetry = { name, t: always ? 6 : 20 };
    }

    // ---- 75% THE HOLLOW HERD -------------------------------------------------------------------------------------------------
    // He backs to the rim, lowers his head and a hunting horn blows. Ghost stags run the glade in lanes, each lane showing its own
    // hoofprints just before its ghost goes. Each ghost hits hard (it is a dodge dance: the ones who read the prints walk away).
    makeHerd(rnd, skip) {
      return { kind: 'herd', t: 0, phase: 'intro', introDur: skip ? 1.0 : 2.6, warded: true, rnd, wave: 0, nextT: 0, waves: hard() ? 9 : 8, quiet: 0 };
    }
    tickHerd(m, dt, L) {
      const R = this.arenaR();
      if (m.phase === 'intro') {
        const k = c01(m.t / (m.introDur * 0.8));
        this.mechGlide(m, STAGE.x, STAGE.y - R * 0.78, k);
        this.facingAngle = Math.PI * 0.5;
        if (!m.horn && m.t >= m.introDur * 0.3) { m.horn = true; SFX.horn(); this.vfxAdd({ k: 'ring', x: this.x, y: this.y, r: 480, col: '#fda4af', life: 1.2 }); }
        if (m.t >= m.introDur) { m.phase = 'run'; m.t0 = m.t; m.nextT = m.t + 0.4; }
        return;
      }
      if (m.phase === 'done') { if (m.t - m.doneAt >= 1.4) { this.endHerd(true); } return; }
      this.facingAngle = Math.PI * 0.5;
      // waves: a few parallel lanes at a seeded angle; each lane's hoofprints show for `lead` seconds, then its ghost runs
      if (m.t >= m.nextT && m.wave < m.waves) {
        const w = m.wave++;
        const speedUp = 1 - w * 0.045;
        m.nextT = m.t + 1.75 * speedUp;
        const base = (m.rnd() < 0.5 ? 0 : Math.PI / 2) + (m.rnd() - 0.5) * 0.9;
        const spacing = 150, lanesN = 5, pickN = w < 3 ? 2 : (w < 6 ? 3 : 3);
        const idx = [0, 1, 2, 3, 4].sort(() => m.rnd() - 0.5).slice(0, pickN);
        const lead = 1.15 * speedUp + 0.15;
        for (const i of idx) {
          const off = (i - (lanesN - 1) / 2) * spacing, dirSign = m.rnd() < 0.5 ? 1 : -1;
          const len = R * 2.05, half = len / 2;
          const nx = -Math.sin(base), ny = Math.cos(base);
          const cx = STAGE.x + nx * off, cy = STAGE.y + ny * off * T();
          const x0 = cx - Math.cos(base) * half * dirSign, y0 = cy - Math.sin(base) * half * dirSign * T();
          const x1 = cx + Math.cos(base) * half * dirSign, y1 = cy + Math.sin(base) * half * dirSign * T();
          this.tele({ k: 'prints', x: x0, y: y0, x1, y1, w: 40 }, lead);
          this.ghosts.push({ x0, y0, x1, y1, delay: lead, run: 0.85, w: 40, dmg: hard() ? 560 : 440, t: 0, label: 'Hollow Herd', stag: true, a: Math.atan2((y1 - y0) / T(), x1 - x0) });
        }
        SFX.drums(4);
      }
      if (m.wave >= m.waves && this.ghosts.length === 0 && this.teles.length === 0) { m.phase = 'done'; m.doneAt = m.t; }
    }
    endHerd(win) {
      const m = this.mech; if (!m || m.kind !== 'herd') return;
      this.cleanMechanic();
      this.x = STAGE.x; this.y = STAGE.y - this.arenaR() * 0.5; this.facingAngle = Math.PI * 0.5;
      this.grantMechanicShield && this.grantMechanicShield();
      this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 1.3;
    }

    // ---- 50% HEART EXPOSED ---------------------------------------------------------------------------------------------------
    // He rears, a bell tolls and the ribs split open with a crack that runs across the floor. The ember heart pulses; every hit goes
    // into it. Enough break damage before it closes and he collapses into a long stagger (both antlers brittle). Too little: a burst.
    makeHeart(rnd, skip) {
      const n = Math.max(1, party().length || 1);
      return { kind: 'heart', t: 0, phase: 'intro', introDur: skip ? 1.0 : 2.4, warded: true, rnd, dealt: 0, need: Math.round(this.maxHp * 0.075), dur: hard() ? 11 : 13, n };
    }
    tickHeart(m, dt, L) {
      if (m.phase === 'intro') {
        this.mechGlide(m, STAGE.x, STAGE.y - 40, c01(m.t / (m.introDur * 0.6)));
        this.facingAngle = Math.PI * 0.5;
        if (!m.bell && m.t >= m.introDur * 0.35) { m.bell = true; SFX.bell(165, 2.2); if (window.fx) window.fx.triggerShake(8, 0.3); }
        if (m.t >= m.introDur) {
          m.phase = 'open'; m.t0 = m.t; m.warded = false; m.beatT = 0;
          SFX.crunch(); audio.playImpactBoom(1.6);
          if (window.fx) { window.fx.triggerShake(16, 0.4); window.fx.addShockwave(this.x, this.y, 340, '#e11d48', 8, 0.6); }
          for (let i = 0; i < 6; i++) this.addCrack(this.x, this.y, i * TAU / 6 + 0.3, 200 + (i % 2) * 90);
        }
        return;
      }
      if (m.phase === 'ok') { if (m.t - m.okAt >= 0.5) { this.cleanMechanic(); this.grantMechanicShield && this.grantMechanicShield(); this.cervStagger('💥 HEART SHATTERED!', 8); } return; }
      if (m.phase === 'fail') {
        if (m.t - m.failAt >= 1.0) {
          this.cleanMechanic();
          this.mechFailBlast('Heart Burst', this.x, this.y);
          this.state = 'idle'; this.aiCooldown = 1.8;
          this.scheduleRetry('heart_mechanic');
        }
        return;
      }
      this.facingAngle = Math.PI * 0.5;
      m.beatT -= dt;
      const el = m.t - m.t0, left = c01(el / m.dur);
      if (m.beatT <= 0) { m.beatT = lerp(1.0, 0.45, left); SFX.heart(0.5 + 0.5 * left); this.vfxAdd({ k: 'ring', x: this.x, y: this.y, r: 90 + 140 * (m.dealt / m.need), col: '#fda4af', life: 0.5 }); }
      if (el >= m.dur && isHost()) { m.phase = 'fail'; m.failAt = m.t; if (isHost()) send({ event: 'cervanth_heart_end', ok: false }); }
    }
    endHeart(ok, fromNet) {
      const m = this.mech; if (!m || m.kind !== 'heart' || m.phase === 'ok' || m.phase === 'fail') return;
      if (ok) { m.phase = 'ok'; m.okAt = m.t; SFX.snap(); audio.playImpactBoom(1.8); if (window.fx) { window.fx.triggerHitstop && window.fx.triggerHitstop(120); window.fx.addShockwave(this.x, this.y, 360, '#fff1f2', 8, 0.6); window.fx.triggerShake(20, 0.5); } }
      else { m.phase = 'fail'; m.failAt = m.t; }
      if (!fromNet && isHost()) send({ event: 'cervanth_heart_end', ok: !!ok });
    }

    // ---- 35% CAGE OF TINES ---------------------------------------------------------------------------------------------------
    // He slams both antlers into the ground (crunch, screen shake). Bone towers grow one after another around the rim. Each ripens
    // on a visible ring and needs someone inside it when it does, or it bursts. They ripen one after another, so even a small party
    // can hop between them; a solo player gets fewer towers.
    makeCage(rnd, skip) {
      const n = Math.max(1, party().length || 1);
      const towers = n === 1 ? 2 : (n === 2 ? 3 : 4);
      const base = rnd() * TAU, R = this.arenaR() * 0.58;
      const ts = [];
      for (let i = 0; i < towers; i++) {
        const a = base + i * TAU / towers;
        ts.push({ i, x: STAGE.x + Math.cos(a) * R, y: STAGE.y + Math.sin(a) * R * T(), r: 84, grow: 0, ripen: 3.4 + i * (n >= 3 ? 1.4 : 2.6), fuse: 3.0, done: false, ok: false, inside: 0 });
      }
      return { kind: 'cage', t: 0, phase: 'intro', introDur: skip ? 1.0 : 2.2, warded: true, rnd, towers: ts, failed: false, t0: 0 };
    }
    tickCage(m, dt, L) {
      if (m.phase === 'intro') {
        this.mechGlide(m, STAGE.x, STAGE.y, c01(m.t / (m.introDur * 0.55)));
        this.facingAngle = Math.PI * 0.5;
        if (!m.slam && m.t >= m.introDur * 0.62) {
          m.slam = true; SFX.crunch(); audio.playImpactBoom(2.0);
          if (window.fx) { window.fx.triggerShake(24, 0.6); window.fx.addShockwave(this.x, this.y, 420, '#e11d48', 9, 0.7); }
          for (let i = 0; i < 8; i++) this.addCrack(this.x, this.y, i * TAU / 8, 260);
        }
        if (m.t >= m.introDur) { m.phase = 'tines'; m.t0 = m.t; }
        return;
      }
      if (m.phase === 'ok') { if (m.t - m.okAt >= 0.8) { this.cleanMechanic(); this.grantMechanicShield && this.grantMechanicShield(); this.cervStagger('💥 STUNNED!', 9); } return; }
      if (m.phase === 'fail') {
        if (m.t - m.failAt >= 0.8) {
          this.cleanMechanic();
          this.mechFailBlast('Tower Burst', this.x, this.y);
          this.state = 'idle'; this.aiCooldown = 1.8;
          this.scheduleRetry('cage_mechanic');
        }
        return;
      }
      this.facingAngle = Math.PI * 0.5;
      const el = m.t - m.t0;
      let allDone = true;
      for (const tw of m.towers) {
        tw.grow = c01((el - tw.i * 0.4) / 0.9);
        if (tw.done) continue;
        allDone = false;
        // soaked? anyone alive inside the ring while it is ripening counts
        const ripeAt = tw.ripen;
        const ripening = el >= ripeAt - tw.fuse;
        if (ripening && !tw.sfx) { tw.sfx = true; SFX.clicks(5); }
        const inside = L.some(p => flat(p, tw.x, tw.y) <= tw.r);
        tw.inside = inside ? 1 : 0;
        if (el >= ripeAt) {
          tw.done = true; tw.ok = inside;
          audio.playImpactBoom(inside ? 1.0 : 1.9);
          if (window.fx) { window.fx.addShockwave(tw.x, tw.y, tw.r * 1.5, inside ? '#fff1f2' : '#e11d48', inside ? 5 : 9, 0.5); if (!inside) window.fx.triggerShake(16, 0.4); }
          this.vfxAdd({ k: 'towerBurst', x: tw.x, y: tw.y, ok: inside, life: 0.9 });
          if (!inside && isHost()) { m.phase = 'fail'; m.failAt = m.t; send({ event: 'cervanth_cage_end', ok: false }); return; }
        }
      }
      if (allDone && isHost()) { m.phase = 'ok'; m.okAt = m.t; send({ event: 'cervanth_cage_end', ok: true }); }
    }
    endCage(ok) {
      const m = this.mech; if (!m || m.kind !== 'cage' || m.phase === 'ok' || m.phase === 'fail') return;
      if (ok) { m.phase = 'ok'; m.okAt = m.t; } else { m.phase = 'fail'; m.failAt = m.t; }
    }

    // ---- 15% LAST CHARGE -----------------------------------------------------------------------------------------------------
    // A short beat: he roars, the whole floor cracks outward and the heart burns. Then the final phase (x1.5 damage).
    makeCharge(rnd, skip) { return { kind: 'charge', t: 0, phase: 'intro', introDur: skip ? 1.0 : 2.4, warded: true, rnd }; }
    tickCharge(m, dt, L) {
      this.mechGlide(m, STAGE.x, STAGE.y - 60, c01(m.t / (m.introDur * 0.5)));
      this.facingAngle = Math.PI * 0.5;
      if (!m.roar && m.t >= m.introDur * 0.4) {
        m.roar = true; SFX.roar(1.8); audio.playImpactBoom(2.0);
        if (window.fx) { window.fx.triggerShake(26, 0.8); window.fx.addShockwave(this.x, this.y, 560, '#e11d48', 10, 0.8); window.fx.triggerScreenFlash && window.fx.triggerScreenFlash('#3b0716', 0.3); }
        for (let i = 0; i < 12; i++) this.addCrack(this.x, this.y, i * TAU / 12 + 0.2, 320 + (i % 3) * 80);
        this.finalPhaseOn = true;
      }
      if (m.t >= m.introDur) { this.cleanMechanic(); this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 0.9; this.hp = Math.max(this.hp, Math.ceil(this.maxHp * 0.149)); }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // co-op: boss_event 'cervanth_*' (network_coop.js)
    // ---------------------------------------------------------------------------------------------------------------------------
    handleCervanthNet(d) {
      switch (d.event) {
        case 'cervanth_heart_end': this.endHeart(!!d.ok, true); return true;
        case 'cervanth_cage_end': this.endCage(!!d.ok); return true;
        case 'cervanth_echo': this.echoes.push({ t: d.t, x: d.x, y: d.y, a: d.a, len: d.len, w: d.w, speed: d.speed, dmg: d.dmg }); return true;
      }
      return true;
    }
    netExtra() {
      const m = this.mech;
      return {
        m7: this.mech75 ? 1 : 0, m5: this.mech50 ? 1 : 0, m3: this.mech35 ? 1 : 0, m1: this.mech15 ? 1 : 0, fp: this.finalPhaseOn ? 1 : 0,
        mk: m ? m.kind : '', mp: m ? m.phase : '', mt: m ? Number(m.t.toFixed(2)) : 0,
        hd: m && m.kind === 'heart' ? Math.round(m.dealt) : undefined,
        tw: m && m.kind === 'cage' ? m.towers.map(t => (t.done ? (t.ok ? 2 : 3) : 0)) : undefined
      };
    }
    applyNetExtra(x) {
      if (!x) return;
      this.mech75 = !!x.m7; this.mech50 = !!x.m5; this.mech35 = !!x.m3; this.mech15 = !!x.m1;
      if (x.fp) this.finalPhaseOn = true;
      const m = this.mech;
      if (m && m.kind === x.mk) {
        const order = { herd: ['intro', 'run', 'done'], heart: ['intro', 'open', 'ok', 'fail'], cage: ['intro', 'tines', 'ok', 'fail'], charge: ['intro'] }[m.kind] || [];
        const gi = order.indexOf(m.phase), hi = order.indexOf(x.mp);
        if (hi > gi) { m.phase = x.mp; m.t = x.mt; if (m.phase === 'open' || m.phase === 'tines') m.t0 = m.t - 0.1; }
        else if (hi === gi && Math.abs(m.t - x.mt) > 0.6) m.t = x.mt;
        if (typeof x.hd === 'number') m.dealt = Math.max(m.dealt, x.hd);
        if (x.tw && m.kind === 'cage') x.tw.forEach((v, i) => { const tw = m.towers[i]; if (tw && v && !tw.done) { tw.done = true; tw.ok = v === 2; } });
      }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // KAROK CLASH: ANTLER LOCK. He lowers his head and charges the Gravebreaker; they lock horns against the hammer. A Gravebreaker
    // who wins hauls the antlers up, leaps onto his skull and smashes his head into the ground with the hammer.
    // ---------------------------------------------------------------------------------------------------------------------------
    updateGetsugaCharge(dt, partyArr) { return super.updateGetsugaCharge(dt, partyArr); }
    fireGetsuga(partyArr) {
      const L = (partyArr || []).filter(q => q.hp > 0);
      audio.playImpactBoom(1.9); SFX.crunch();
      if (window.fx) {
        window.fx.triggerShake(16, 0.35);
        const m = this.fwd(60); window.fx.addShockwave(m.x, m.y, 150, '#e11d48', 5, 0.4);
      }
      this.vfxAdd({ k: 'lockCharge', x: this.x, y: this.y, a: this.facingAngle, len: this.karokLane.len, life: 0.6 });
      this.damagePlayersInCorridor(L, this.x, this.y, this.facingAngle, this.karokLane.len, this.karokLane.half, 300, 'Antler Lock', 'heavy', 180);
    }
    updateClothChains(dt) { if (this.updateRig) this.updateRig(dt); }
    karokPositions(c) {
      // locked horns: the gap closes as the clasher wins ground (a head-to-head, so much shorter than a beam)
      const dx = Math.cos(c.dirAng), dy = Math.sin(c.dirAng) * T();
      const gap = 150 + (88 - 150) * Math.max(0, Math.min(1, c.meter));
      return { bx: c.bx0, by: c.by0, px: c.bx0 + dx * gap, py: c.by0 + dy * gap };
    }
    beginKarokFinish(c, player) {
      c.finishT = 0;
      if (c.win) {
        audio.playParryClang(true); audio.playImpactBoom(2.0); SFX.snap();
        if (window.fx) {
          const fx = window.fx, mx = (this.x + player.x) / 2, my = (this.y + player.y) / 2;
          fx.triggerHitstop(110); fx.triggerShake(24, 0.45);
          fx.addShockwave(mx, my, 220, '#fda4af', 8, 0.5); fx.addShockwave(player.x, player.y, 160, '#5cc13f', 6, 0.4);
          if (player.isLocal) fx.triggerImpactFrame && fx.triggerImpactFrame('#ffffff', 0.12);
        }
      } else {
        audio.playImpactBoom(1.0);
        if (window.fx) window.fx.triggerShake(12, 0.3);
      }
    }
    // WIN: the antlers are wrenched up (0-0.6); the Gravebreaker runs up his neck and leaps onto his skull (0.6-1.5); the hammer
    // comes down on the head (1.5) and his face goes into the ground; the shared massive hit lands there (1.55); he stays down.
    updateKarokFinish(dt, c, player) {
      if (c.style !== 'smash') return super.updateKarokFinish(dt, c, player);
      c.finishT += dt;
      const t = c.finishT;
      if (!c.win) {
        if (!c.resolved && t >= 0.3) { c.resolved = true; this.resolveKarokLoss(c, player); }
        if (t >= 1.0) this.endKarokClash(player, false);
        return;
      }
      const A = window.KAROK_SMASH || { WRENCH: 0.6, LEAP: 1.5, SMASH: 1.5, END: 2.8 };
      const fx = window.fx;
      const e = (k) => { k = c01(k); return k * k * (3 - 2 * k); };
      if (!c.sm) {
        const dx = this.x - player.x, dy = (this.y - player.y) / T(), d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        c.sm = { P: { x: player.x, y: player.y }, u: { x: ux, y: uy }, B0: { x: this.x, y: this.y } };
      }
      const N = c.sm;
      // the head: lifted by the wrench, then driven down; the body stays planted
      this.smashLift = t < A.WRENCH ? e(t / A.WRENCH) : (t < A.SMASH ? 1 : Math.max(0, 1 - e((t - A.SMASH) / 0.18)));
      this.facingAngle = Math.atan2((player.y - this.y) / T(), player.x - this.x);
      // the player runs up and over onto his skull, then stands over the head, and lands the hammer
      const headX = N.B0.x - N.u.x * 30, headY = N.B0.y - N.u.y * 30 * T();     // between the antlers (toward the player)
      let jz = 0;
      if (t < A.WRENCH) { player.x = N.P.x; player.y = N.P.y; }
      else if (t < A.LEAP) {
        const s = e((t - A.WRENCH) / (A.LEAP - A.WRENCH));
        player.x = lerp(N.P.x, headX, s); player.y = lerp(N.P.y, headY, s);
        jz = Math.sin(s * Math.PI) * 54 + s * 96;
      } else { player.x = headX; player.y = headY; jz = 96 * (1 - e((t - A.SMASH) / 0.2)); }
      player.targetX = player.x; player.targetY = player.y;
      player.jumpZ = jz;
      player.facingAngle = Math.atan2((this.y - player.y) / T(), this.x - player.x);
      c.anchor = { x: player.x, y: player.y, z: 62 + jz };
      if (!c.bJump && t >= A.WRENCH) { c.bJump = true; audio.playSwordSlash(true, 1.1); if (fx) { fx.addShockwave(player.x, player.y, 120, '#5cc13f', 5, 0.35); fx.addStepDust(player.x, player.y, 10); } }
      if (!c.resolved && t >= A.SMASH + 0.02) {
        c.resolved = true;
        audio.playImpactBoom(2.4); audio.playParryClang(true); SFX.crunch();
        if (fx) {
          fx.triggerHitstop(220); fx.triggerShake(34, 0.7); fx.triggerZoomPunch(0.16);
          fx.addShockwave(this.x, this.y, 300, '#ffffff', 9, 0.5); fx.addShockwave(this.x, this.y, 200, '#fda4af', 7, 0.5);
          fx.addStepDust(this.x, this.y, 22); fx.spawnMassiveEarthChunks && fx.spawnMassiveEarthChunks(this.x, this.y, 10, '#7c2d12');
          if (player.isLocal) fx.triggerImpactFrame && fx.triggerImpactFrame('#fde047', 0.18);
        }
        if (player.pushPop) player.pushPop({ kind: 'tier', x: player.x, y: player.y - 170, life: 1.0, color: '#fde047', text: 'SMASH!' });
        this.resolveKarokWin(c, player);
      }
      if (t >= A.END) this.endKarokClash(player, true);
    }
    endKarokClash(player, win) {
      const c = this.karokClash;
      this.karokDrop = null;
      this.karokClash = null;
      this.smashLift = 0;
      if (player) {
        player.karok = null; player.jumpZ = 0;
        if (player.state === 'h_clash') { player.state = 'idle'; player.stateTimer = 0; }
        player.hIframes = win ? 0.8 : 0; player.targetX = player.x; player.targetY = player.y;
        player.snapFeetToBody && player.snapFeetToBody();
      }
      if (win) {
        this.stagger = 0; this.enterStaggerState('@none');
        this._proneAt = performance.now() / 1000;
      } else {
        this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 0.9; this.karokSwordHidden = false;
        audio.playImpactBoom(1.9); SFX.crunch();
        this.vfxAdd({ k: 'lockCharge', x: this.x, y: this.y, a: this.facingAngle, len: this.karokLane.len, life: 0.6 });
        if (player && player.hp > 0) player.takeDamage(1300, 'Antler Lock (Clash Lost)', { power: 'heavy', sourceX: this.x, sourceY: this.y, pushDist: 210 });
        const others = living().filter(q => !player || q.id !== player.id);
        this.damagePlayersInCorridor(others, this.x, this.y, this.facingAngle, this.karokLane.len, this.karokLane.half, 300, 'Antler Lock', 'heavy', 180);
      }
      if (c) c.sm = null;
    }
    abortKarokClash(player) { this.smashLift = 0; if (player) player.jumpZ = 0; return super.abortKarokClash(player); }
  }

  CervanthBoss.STAGE = STAGE;
  CervanthBoss.SFX = SFX;
  CervanthBoss.ECHO_DELAY = ECHO_DELAY;
  window.CervanthBoss = CervanthBoss;

  // he has no voice: only Cervanth's own sounds play while he is the boss
  if (typeof audio !== 'undefined' && audio && !audio._cervanthWrapped) {
    audio._cervanthWrapped = true;
    const isCv = () => !!(window.game && window.game.mode === 'raid' && window.game.boss && window.game.boss.isCervanth);
    const oClip = audio.playBossVoiceClip.bind(audio), oVoice = audio.playBossVoice.bind(audio);
    audio.playBossVoiceClip = function (key, ...rest) { if (isCv()) return; return oClip(key, ...rest); };
    audio.playBossVoice = function (...args) { if (isCv()) return; return oVoice(...args); };
  }
})();
