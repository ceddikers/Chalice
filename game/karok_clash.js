// =========================================================================
// KAROK_CLASH.JS — Vaelgor's clashable "Eclipse Getsuga" pattern + the Charge Hammer's Karok Clash
//
// To everyone else this is just another Vaelgor pattern (he draws the blade back, charges, then fires a getsuga).
// To a Gravebreaker standing close in front of him, a [G] prompt appears over the boss for ~2s. Pressing it starts a
// cinematic: the hammer is flung aside, bare hands catch the blade, and an ENDLESS tug-of-war (mash [G]) decides who wins.
// There is no timer: the boss pushes back harder with every second, so the clash is won by getting the meter full early.
//   WIN  (meter full)   -> sword ripped away and thrown back, boss staggered
//   LOSE (meter empty)  -> the getsuga continues point-blank
// The clasher then suffers "Muscle Spasms" (can't clash again for 2 minutes). The boss stagger bar is frozen throughout,
// and this pattern can never overlap the Final Clash / any mechanic (it is an ordinary pattern the AI only picks from idle).
// Loaded AFTER boss_vaelgor.js and hammer_25d.js; everything is attached to VaelgorRaidBoss.prototype.
// =========================================================================

const KAROK_SPASM_DURATION = 120;      // seconds the clasher can't Clash again
const KAROK_PATTERN_DUR = 3.4;         // total length of the getsuga pattern
const KAROK_WINDOW_FROM = 0.12;        // progress at which the [G] window opens
const KAROK_WINDOW_TO = 0.12 + 2.0 / KAROK_PATTERN_DUR; // ~2.0s long
const KAROK_FIRE_AT = 0.76;            // progress at which the getsuga is released
const KAROK_INTRO = 1.0;
const KAROK_MAX_STRUGGLE = 75;        // seconds a clash can run before the boss simply wins (the boss grows stronger the whole time)
const KAROK_TOTAL = 5.0;
const KAROK_FULL = 1;            // the meter counts as full from here (it is capped at 1 and the boss pushes back every frame)
const KAROK_PRESS_GAIN = 0.058;       // meter gained per [G] press
// How hard he pushes back as the struggle drags on (seconds of struggle -> extra pushback per second): flat for the first 5s so the
// clash comfortably lasts, a gentle climb from 5s, then a steeper one from 8s. Nothing about it is shown to the player.
const karokBossGrow = (s) => s < 5 ? 0 : (s < 8 ? 0.035 * (s - 5) : 0.105 + 0.075 * (s - 8));        // boss pushback gained for every second of the struggle
const KAROK_BOSS_CAP = 1.2;          // pushback never goes above this per second
const KAROK_GREEN = '#5cc13f', KAROK_GREEN_LIGHT = '#a6e87e', KAROK_GREEN_DARK = '#2f7d1c';   // grass green
const KAROK_MECH_STATES = ['eclipse_mechanic', 'horizon_mechanic', 'iaido_mechanic', 'final_phase_mechanic', 'final_clash_mechanic', 'intro_cutscene'];

(function installKarokClash() {
  if (typeof VaelgorRaidBoss === 'undefined') return;
  const proto = VaelgorRaidBoss.prototype;
  const nowSec = () => performance.now() / 1000;
  const T = () => PERSPECTIVE_TILT;
  const c01 = (t) => Math.max(0, Math.min(1, t));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - c01(t), 3);

  // -----------------------------------------------------------------------
  // Boss rule: every hit on a Broken boss deals +5% per stack; stagger is frozen during a Karok Clash.
  // -----------------------------------------------------------------------
  const origReceive = proto.receiveDamage;
  proto.receiveDamage = function (dmg, staggerAmt, attacker, hitOpts) {
    if (this.brokenStacks > 0) dmg = Math.round(dmg * (1 + BROKEN_DMG_PER_STACK * this.brokenStacks));
    if (this.state === 'karok_clash') {
      // Park the gauge far below zero so no stagger can accumulate or trigger a break, then restore it.
      const keep = this.stagger;
      this.stagger = -1e9;
      origReceive.call(this, dmg, staggerAmt, attacker, hitOpts);
      this.stagger = keep;
      return;
    }
    return origReceive.call(this, dmg, staggerAmt, attacker, hitOpts);
  };

  // -----------------------------------------------------------------------
  // Pattern selection: natural rotation + guaranteed pick after a Roar taunt
  // -----------------------------------------------------------------------
  const origSelectPattern = proto.selectNonRepeatingPattern;
  proto.selectNonRepeatingPattern = function (candidates) {
    if (this.consumeKarokTaunt()) {
      return { name: 'pat_getsuga_charge', weight: 1, mode: 'karok' };
    }
    if (!this.finalPhase && Array.isArray(candidates) && candidates.some(c => c.mode === 'aggro')) {
      if (!candidates.some(c => c.name === 'pat_getsuga_charge')) {
        candidates = candidates.concat([{ name: 'pat_getsuga_charge', weight: 8, mode: 'aggro' }]);
      }
    }
    return origSelectPattern.call(this, candidates);
  };

  const origSelectTarget = proto.selectTargetForPattern;
  proto.selectTargetForPattern = function (livingParty, mode = 'aggro') {
    const forced = (mode === 'karok') ? this.karokForcedId : ((mode === 'aggro' && nowSec() < (this.karokAggroUntil || 0)) ? this.karokAggroId : null);
    if (forced && livingParty) {
      const p = livingParty.find(q => q.id === forced);
      if (p) { this.activeTargetId = p.id; return p; }
    }
    return origSelectTarget.call(this, livingParty, mode === 'karok' ? 'aggro' : mode);
  };

  proto.isKarokBlocked = function () {
    return KAROK_MECH_STATES.includes(this.state) || /_mechanic$/.test(this.state || '') || this.state === 'karok_clash' || this.state === 'staggered' ||
      this.finalTransitionPending || this.finalTransitionActive || this.finalClashPending || (this.lockedByUltimateTimer || 0) > 0;
  };

  proto.applyKarokTaunt = function (player) {
    if (this.isKarokBlocked() && this.state !== 'staggered') {
      return { state: 'ignored', msg: '📣 The boss ignores your roar' };
    }
    this.addThreat(player.id, 5000);
    this.karokAggroId = player.id;
    this.karokAggroUntil = nowSec() + 25;
    if (player.karokSpasm > 0) {
      return { state: 'aggro', msg: `📣 AGGRO  (Muscle Spasms ${Math.ceil(player.karokSpasm)}s)` };
    }
    this.karokTaunt = { id: player.id, until: nowSec() + 25 };
    return { state: 'forced', msg: '📣 TAUNTED — CLASH INCOMING!' };
  };

  proto.consumeKarokTaunt = function () {
    const t = this.karokTaunt;
    if (!t) return false;
    if (nowSec() > t.until) { this.karokTaunt = null; return false; }
    if (this.isKarokBlocked()) { this.karokTaunt = null; return false; }
    const party = (window.game && window.game.party) || [];
    const p = party.find(q => q.id === t.id && q.hp > 0);
    if (!p || p.karokSpasm > 0 || p.classId !== 'hammer') { this.karokTaunt = null; return false; }
    this.karokForcedId = t.id;
    this.karokTaunt = null;
    return true;
  };

  // -----------------------------------------------------------------------
  // The pattern: Eclipse Getsuga (draws the blade back, charges, fires)
  // -----------------------------------------------------------------------
  proto.triggerPatternGetsugaCharge = function (target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / T(), target.x - this.x);
    this.state = 'pat_getsuga_charge';
    this.stateDuration = KAROK_PATTERN_DUR;
    this.stateTimer = this.stateDuration;
    this.getsugaFired = false;
    this.karokWindow = false;
    this.counterableWindow = false;
    this.patStep = 0;
    this.baseFacing = this.facingAngle;
    this.lungeFootForward(this.rightFoot, -12, this.hipWidth + 4, 0.22);
    audio.playScrapeSpark();
  };

  proto.getsugaProgress = function () {
    return c01(1 - this.stateTimer / (this.stateDuration || KAROK_PATTERN_DUR));
  };

  // Latency grace: the host's boss runs one network trip ahead of a guest, so a guest sees the [G] window (and presses) late and
  // that press needs another trip to reach us. When the target is a remote hammer player, hold the strike back by their round trip
  // (capped) so a press made inside THEIR window still lands before the blade is released. Zero for the host and offline play.
  proto.getsugaFireDelay = function () {
    const g = window.game, net = g && g.net;
    if (!net || !net.isHost || !net.isConnected() || !this.activeTargetId) return 0;
    const t = (g.party || []).find(q => q.id === this.activeTargetId);
    if (!t || t.isLocal || t.classId !== 'hammer') return 0;
    return Math.min(0.35, (net.rttOfPlayer(t.id) || 0) / 1000);
  };

  proto.updateGetsugaCharge = function (dt, party) {
    const p = this.getsugaProgress();
    const inWindow = p >= KAROK_WINDOW_FROM && p < Math.min(KAROK_FIRE_AT, KAROK_WINDOW_TO);
    if (inWindow && !this.karokWindow) {
      this.karokWindow = true;
      audio.playCounterFlashCue && audio.playCounterFlashCue();
    }
    if (!inWindow) this.karokWindow = false;

    // growing red charge-up sparks on the blade
    if (inWindow && window.fx && Math.random() < dt * 14) {
      const bx = this.x - Math.cos(this.facingAngle) * 70, by = this.y - Math.sin(this.facingAngle) * 70 * T();
      window.fx.addDragSparks(bx, by - 30, this.facingAngle + Math.PI, 2, true);
    }
    if (this.getsugaFired && window.fx) {
      // the wave kicks up rings on the ground as it flies (runs until the pattern ends)
      for (const w of window.fx.crescentWaves) {
        if (!w.getsuga) continue;
        w.ripple = (w.ripple || 0) - dt;
        if (w.ripple <= 0) {
          w.ripple = 0.07;
          window.fx.addShockwave(w.x, w.y, 56 + Math.random() * 26, Math.random() < 0.5 ? '#f43f5e' : '#7f1d1d', 3, 0.3);
        }
      }
    }
    if (p >= KAROK_FIRE_AT + this.getsugaFireDelay() / KAROK_PATTERN_DUR && !this.getsugaFired) {
      this.getsugaFired = true;
      this.karokWindow = false;
      this.fireGetsuga(party);
    }
  };

  proto.fireGetsuga = function (party) {
    const living = (party || []).filter(q => q.hp > 0);
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    audio.playSwordSlash(true, 1.5);
    audio.playImpactBoom(1.6);
    if (window.fx) {
      window.fx.triggerShake(16, 0.35);
      window.fx.addShockwave(this.x, this.y, 170, '#e11d48', 6, 0.45);
      window.fx.addSlashRibbon(this.x, this.y, 150, this.facingAngle + 1.5, this.facingAngle - 1.5, '#e11d48', 28, 0.3);
      window.fx.spawnCrescentWave(this.x + cosA * 40, this.y + sinA * 40 * T(), this.facingAngle, 320, 0, null, true);
      const w = window.fx.crescentWaves[window.fx.crescentWaves.length - 1];
      if (w) { w.getsuga = true; w.life = w.maxLife = 1.5; w.vx *= 1.25; w.vy *= 1.25; w.ripple = 0; }   // same hit size, a faster, much flashier wave
      // muzzle burst: white-hot flash at the blade, a ring that races down the lane, and a hard cut of light
      const mx = this.x + cosA * 46, my = this.y + sinA * 46 * T();
      window.fx.addImpactStarburst && window.fx.addImpactStarburst(mx, my, '#fda4af', 1.6, 0.3, 40);
      window.fx.addShockwave(mx, my, 120, '#ffffff', 4, 0.25);
      window.fx.addShockwave(this.x, this.y, 230, '#9f1239', 9, 0.6);
      window.fx.addDragSparks(mx, my - 20, this.facingAngle, 26, true);
      window.fx.triggerImpactFrame && window.fx.triggerImpactFrame('#e11d48', 0.07);
    }
    this.damagePlayersInSector(living, this.x, this.y, 0, 150, this.facingAngle, 0.6, 260, 'Eclipse Getsuga', 'heavy', 150);
  };

  // -----------------------------------------------------------------------
  // Karok Clash: eligibility + start
  // -----------------------------------------------------------------------
  proto.canPlayerKarokClash = function (player) {
    if (!player || player.classId !== 'hammer' || !this.karokWindow) return false;
    if (this.state !== 'pat_getsuga_charge' || this.karokClash) return false;
    if (player.hp <= 0 || player.karok || player.karokSpasm > 0 || !player.hammerHeld) return false;
    if (player.state === 'grabbed' || player.state === 'clash_lock' || player.clashQteActive || player.rooted || player.qteActive) return false;
    if (player.state && player.state.indexOf('hit_') === 0) return false;
    const dist = Math.hypot(this.x - player.x, (this.y - player.y) / T());
    if (dist > 190) return false;
    let diff = Math.atan2((player.y - this.y) / T(), player.x - this.x) - this.facingAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return Math.abs(diff) < 1.25; // must be in front of the blade
  };

  // opts: { force, mirror, fromNetwork, side }.  A local press starts the clash here and tells the party; a packet from
  // the clasher's client starts a "mirror" of it (same cinematic, meter + result come from the clasher).
  proto.startKarokClash = function (player, opts = {}) {
    if (!opts.force && !this.canPlayerKarokClash(player)) return false;
    if (this.karokClash) return false;
    // Interrupt whatever the player was doing
    if (player.act) { player.act = null; player.restoreChargeCamera && player.restoreChargeCamera(); }
    const dirAng = Math.atan2((player.y - this.y) / T(), player.x - this.x);
    this.karokWindow = false;
    this.state = 'karok_clash';
    this.stateDuration = KAROK_TOTAL;
    this.stateTimer = KAROK_TOTAL;
    this.counterableWindow = false;
    this.facingAngle = Math.atan2((player.y - this.y) / T(), player.x - this.x); // face the clasher
    this.vx = 0; this.vy = 0; this.speed = 0;
    this.karokSwordHidden = false;
    this.karokClash = {
      id: player.id,
      t: 0,
      phase: 'intro',
      meter: 0.5,
      dirAng: this.facingAngle,
      bx0: this.x, by0: this.y,
      startPx: player.x, startPy: player.y,
      finishAt: 0,
      win: null,
      resolved: false,
      hammerThrown: false,
      caught: false,
      sparkT: 0,
      lastClick: -1,
      cps: 0,
      swordFlight: null,
      mirror: !!opts.mirror,
      netT: 0,
      pendingResult: undefined,
      style: this.karokStyle || 'blade'    // 'blade': bare hands catch a sword (Vaelgor) · 'beam': the hammer braces against a beam (Ignis)
    };
    const side = (opts.side === 1 || opts.side === -1) ? opts.side : (Math.random() < 0.5 ? 1 : -1);
    this.karokClash.side = side;
    player.karokSpasm = KAROK_SPASM_DURATION;
    player.karok = { active: true, phase: 'intro', t: 0, meter: 0.5, win: null, finishAt: 0, total: KAROK_TOTAL, style: this.karokClash.style };
    player.state = 'h_clash';
    player.hIframes = 6;
    audio.playImpactBoom(1.4);
    audio.playParryClang(true);
    if (window.fx) {
      window.fx.triggerHitstop(90);
      window.fx.triggerZoomPunch(0.08);
      window.fx.triggerShake(14, 0.3);
      window.fx.addShockwave(player.x, player.y, 120, KAROK_GREEN_LIGHT, 5, 0.4);
      if (player.isLocal) window.fx.triggerImpactFrame('#ffffff', 0.12);
    }
    const net = window.game && window.game.net;
    if (player.isLocal && !opts.fromNetwork && net && net.isConnected()) {
      net.broadcast({ type: 'boss_event', event: 'karok_clash_start', playerId: player.id, side, x: Math.round(this.x), y: Math.round(this.y), facing: Number(this.facingAngle.toFixed(3)) });
    }
    return true;
  };

  // Network side of the clash. Returns true when the packet should be relayed onward by the host.
  proto.handleKarokNet = function (data) {
    const g = window.game, net = g && g.net;
    const party = (g && g.party) || [];
    const player = party.find(q => q.id === data.playerId);
    const c = this.karokClash;
    switch (data.event) {
      case 'karok_clash_start': {
        if (!player || player.isLocal) return false;
        const deny = () => { if (net && net.isHost) net.broadcast({ type: 'boss_event', event: 'karok_clash_deny', playerId: data.playerId }); return false; };
        if (c) return (c.id === player.id) ? false : deny();           // someone else is already clashing
        if (net && net.isHost && player.karokSpasm > 0) return deny();   // Muscle Spasms (host arbitrates)
        if (typeof data.x === 'number') { this.x = data.x; this.y = data.y; }
        if (typeof data.facing === 'number') this.facingAngle = data.facing;
        return this.startKarokClash(player, { force: true, mirror: true, fromNetwork: true, side: data.side }) || false;
      }
      case 'karok_clash_deny': {
        if (player && player.isLocal) { if (c && c.id === player.id) this.abortKarokClash(player); player.karokSpasm = 0; }
        else if (c && c.mirror && c.id === data.playerId) this.abortKarokClash(player);
        return true;
      }
      case 'karok_meter':
        if (c && c.mirror && c.id === data.playerId) c.meter = Math.max(0, Math.min(1, data.m));
        return true;
      case 'karok_result':
        if (c && c.mirror && c.id === data.playerId) {
          c.pendingResult = !!data.win;
          c.meter = data.win ? Math.max(c.meter, 0.55) : Math.min(c.meter, 0.45);
        }
        return true;
      default:
        return false;
    }
  };

  // [G] pressed during the struggle (the name is from when it was a left click)
  proto.karokClickPush = function (player) {
    const c = this.karokClash;
    if (!c || c.phase !== 'struggle' || c.id !== player.id) return;
    c.meter = c.meter + KAROK_PRESS_GAIN;
    if (c.meter >= KAROK_FULL) c.fullHit = true;          // the press that fills the bar wins it (the boss's push-back runs before the end check each frame, so the bar can never be seen full there)
    c.meter = Math.min(1, c.meter);
    const t = c.t;
    c.pulse = 0.12;
    if (c.lastClick >= 0) c.cps = lerp(c.cps, 1 / Math.max(0.05, t - c.lastClick), 0.3);
    c.lastClick = t;
    audio.playHitConfirm && audio.playHitConfirm({ isCrit: false, isHeavy: false, posType: 'normal' });
    if (window.fx) {
      const mx = (this.x + player.x) * 0.5, my = (this.y + player.y) * 0.5;
      window.fx.addDragSparks(mx, my - 40, c.dirAng + (Math.random() - 0.5) * 2, 3, false, KAROK_GREEN_LIGHT);
    }
  };

  proto.karokPositions = function (c) {
    const dx = Math.cos(c.dirAng), dy = Math.sin(c.dirAng) * T();
    const shift = (c.meter - 0.5) * 60; // winning pushes the boss (and the pair) away from the player
    const bx = c.bx0 - dx * shift, by = c.by0 - dy * shift;
    const gap = 76;
    return { bx, by, px: bx + dx * gap, py: by + dy * gap };
  };

  proto.updateKarokClash = function (dt, party) {
    const c = this.karokClash;
    const player = ((window.game && window.game.party) || []).find(q => q.id === (c && c.id));
    if (!c || !player || player.hp <= 0) { this.abortKarokClash(player); return; }
    c.t += dt;
    if (c.pulse > 0) c.pulse -= dt;
    this.stateTimer = 2.0;   // the clash has no fixed length: the controller ends the state itself
    this.jumpZ = 0;
    const k = player.karok;
    if (k) { k.t = c.t; k.meter = c.meter; k.phase = c.phase; k.win = c.win; k.finishAt = c.finishAt; }

    const pos = this.karokPositions(c);
    if (c.phase === 'intro') {
      const s = easeOut(c.t / 0.8);
      const sx = c.startPx, sy = c.startPy;
      const p0 = this.karokPositions(Object.assign({}, c, { meter: 0.5 }));   // where the struggle starts (the boss's own spacing)
      const ex = p0.px, ey = p0.py;
      player.x = lerp(sx, ex, s); player.y = lerp(sy, ey, s);
      player.targetX = player.x; player.targetY = player.y;
      if (!c.hammerThrown && c.t >= 0.2 && c.style !== 'beam') {   // against a beam the hammer stays up as a shield
        c.hammerThrown = true;
        player.throwHammerAway(c.side);
      }
      if (!c.caught && c.t >= 0.62) {
        c.caught = true;
        audio.playParryClang(true);
        audio.playImpactBoom(1.8);
        if (window.fx) {
          const mx = (this.x + player.x) * 0.5, my = (this.y + player.y) * 0.5;
          window.fx.triggerHitstop(120);
          window.fx.triggerShake(20, 0.4);
          window.fx.triggerZoomPunch(0.1);
          window.fx.addShockwave(mx, my, 190, '#ffffff', 7, 0.5);
          window.fx.addShockwave(mx, my, 120, KAROK_GREEN_LIGHT, 5, 0.4);
          window.fx.addImpactStarburst(mx, my - 40, 110, '#fde047', 8, 0.4, 0.3);
          if (player.isLocal) window.fx.triggerImpactFrame('#ffffff', 0.14);
        }
      }
      if (c.t >= KAROK_INTRO) { c.phase = 'struggle'; }
    } else if (c.phase === 'struggle') {
      // ENDLESS: no timer. The boss shoves back in surges and gets stronger every second the struggle lasts, so a long clash is a\n      // losing one unless you keep up. Fill the meter to win, let it empty and he does.
      const owner = !c.mirror;
      const sT = Math.max(0, c.t - KAROK_INTRO);
      if (owner) {
        const surge = 0.5 + 0.5 * Math.sin(c.t * 2.7 + 1.1);
        let rate = Math.min(KAROK_BOSS_CAP, 0.15 + 0.09 * surge + (this.enraged ? 0.05 : 0) + karokBossGrow(sT));
        if (player.isBot) rate *= 0.8;
        c.meter = Math.max(0, c.meter - rate * dt);
        c.netT -= dt;
        const net = window.game && window.game.net;
        if (c.netT <= 0 && net && net.isConnected()) {
          c.netT = 0.06;
          net.broadcast({ type: 'boss_event', event: 'karok_meter', playerId: c.id, m: Number(c.meter.toFixed(3)) });
        }
      }
      player.x = pos.px; player.y = pos.py;
      this.x = pos.bx; this.y = pos.by;
      c.sparkT -= dt;
      if (c.sparkT <= 0 && window.fx) {
        c.sparkT = 0.09;
        const mx = (this.x + player.x) * 0.5, my = (this.y + player.y) * 0.5;
        window.fx.addDragSparks(mx, my - 44, c.dirAng + Math.PI * (Math.random() < 0.5 ? 0.5 : -0.5), 2, true, c.meter >= 0.5 ? KAROK_GREEN_LIGHT : '#fb7185');
        if (player.isLocal && Math.abs(c.meter - 0.5) > 0.3) window.fx.triggerShake(3 + Math.abs(c.meter - 0.5) * 8, 0.1);
      }
      const ended = owner
        ? (c.fullHit || c.meter >= KAROK_FULL || c.meter <= 0 || sT >= KAROK_MAX_STRUGGLE)
        : (c.pendingResult !== undefined || sT >= KAROK_MAX_STRUGGLE + 3); // mirrors wait for the clasher's verdict
      if (ended) {
        c.win = owner ? (!!c.fullHit || c.meter >= KAROK_FULL) : (c.pendingResult !== undefined ? c.pendingResult : c.meter >= 0.5);
        const net2 = window.game && window.game.net;
        if (owner && net2 && net2.isConnected()) net2.broadcast({ type: 'boss_event', event: 'karok_result', playerId: c.id, win: c.win });
        c.phase = 'finish';
        c.finishAt = c.t;
        if (k) { k.win = c.win; k.finishAt = c.finishAt; }
        this.beginKarokFinish(c, player);
      }
    } else if (c.phase === 'finish') {
      player.x = pos.px; player.y = pos.py;
      this.x = pos.bx; this.y = pos.by;
      this.updateKarokFinish(dt, c, player);
    }
    this.snapFeetToBody();
    this.updateClothChains(dt);
  };

  proto.beginKarokFinish = function (c, player) {
    c.finishT = 0;
    if (c.win) {
      this.karokSwordHidden = true; // ripped out of his hands
      c.swordFlight = { t: 0, fromX: player.x, fromY: player.y };
      audio.playParryClang(true);
      audio.playImpactBoom(1.8);
      if (window.fx) {
        window.fx.triggerHitstop(110);
        window.fx.triggerShake(24, 0.4);
        window.fx.addShockwave(player.x, player.y, 200, KAROK_GREEN_LIGHT, 7, 0.5);
        if (player.isLocal) window.fx.triggerImpactFrame(KAROK_GREEN_LIGHT, 0.12);
      }
    } else {
      audio.playImpactBoom(1.0);
      if (window.fx) window.fx.triggerShake(12, 0.3);
    }
  };

  // Win cutscene, every beat gets its own screen time (seconds since the struggle ended; boss kneels throughout):
  //   RIP the blade away 0-0.5 · RUN to the hammer 0.5-1.1 · GRAB it one-handed 1.1-1.3 · JUMP BACK 1.3-1.9 ·
  //   TOSS the blade up 1.95-2.6 · SMACK 2.6 · blade rockets into him -> 2.9 · aftermath -> 3.7
  const WIN = { RIP: 0.5, RUN_END: 1.1, GRAB: 1.1, HOIST_END: 1.3, JUMP_START: 1.3, JUMP_END: 1.9, TOSS: 1.95, SMACK: 2.6, HIT: 2.9, END: 3.7 };
  window.KAROK_WIN = WIN;
  // Beam-style win ("Grave Anchor"), seconds since the struggle ended: the beam BREAKS · wind up · THROW the hammer down the
  // dying beam · it HITS her · brace on the chain · YANK her off her feet · she SLAMS face-first · the hammer is reeled back
  // and CAUGHT · a shoulder rest · END
  window.KAROK_ANCHOR = { BREAK: 0.3, THROW: 0.6, HIT: 0.82, YANK: 1.15, SLAM: 1.6, CATCH: 2.1, END: 2.7 };

  // The boss's own greatsword model, drawn by his real routine (same blade, guard, pommel and glow) with the
  // centre of the blade at (x, y) and the given screen rotation.
  // In his hand the real routine draws the blade at max(88, hand-to-tip) px from the grip, with the pommel 18px
  // behind it, so the whole sword spans ~106px: match that exactly, centred on (x, y).
  const KAROK_BLADE_LEN = 88, KAROK_POMMEL = 18;
  proto.drawKarokSword = function (ctx, x, y, rot, alpha) {
    const back = (KAROK_BLADE_LEN - KAROK_POMMEL) * 0.5, fwd = KAROK_BLADE_LEN - back;
    const hx = x - Math.cos(rot) * back, hy = y - Math.sin(rot) * back;
    const tx = x + Math.cos(rot) * fwd, ty = y + Math.sin(rot) * fwd;
    const trail = this.swordTrail;
    this.swordTrail = { length: 0 };
    ctx.save();
    ctx.globalAlpha *= alpha;
    origSword.call(this, ctx, { sx: hx, sy: hy }, { sx: hx, sy: hy }, { sx: tx, sy: ty }, null);
    ctx.restore();
    this.swordTrail = trail;
  };
  proto.drawKarokSwordShadow = function (ctx, pos) {
    if (pos.gy === undefined) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.gy, (KAROK_BLADE_LEN + KAROK_POMMEL) * 0.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // World position / spin of the ripped-away greatsword at finish time `t` (null once it has struck the boss).
  proto.karokSwordPos = function (c, tOverride) {
    const t = tOverride !== undefined ? tOverride : (c.swordFlight ? c.swordFlight.t : 0);
    const an = c.anchor;
    if (t < 0 || !an) return null;
    const ang = Math.atan2((this.y - an.y) / T(), this.x - an.x);
    const dX = Math.cos(ang), dY = Math.sin(ang) * T();
    if (t < WIN.TOSS) {
      // clutched in the free hand, swaying with the body
      return { x: an.x + dX * 18, y: an.y + dY * 18 - an.z, rot: -0.6 + Math.sin(t * 6) * 0.08, t };
    }
    if (t < WIN.SMACK) {
      const s = (t - WIN.TOSS) / (WIN.SMACK - WIN.TOSS);
      return { x: an.x + dX * (18 + 14 * s), y: an.y + dY * (18 + 14 * s) - lerp(an.z, 176, 1 - Math.pow(1 - s, 2.2)), rot: -0.5 + s * Math.PI * 2.5, t };
    }
    const apex = { x: an.x + dX * 32, y: an.y + dY * 32 - 176 };
    const f = (t - WIN.SMACK) / (WIN.HIT - WIN.SMACK);
    const tx = this.x, ty = this.y - 52;                       // dead centre of the boss's chest
    const flyRot = Math.atan2(ty - apex.y, tx - apex.x);
    if (f < 1) {
      const e = Math.pow(f, 1.5);                              // accelerates into the target, arrives exactly on it
      return { x: lerp(apex.x, tx, e), y: lerp(apex.y, ty, e), rot: flyRot + f * 0.15, t, flying: true };
    }
    // Impact: the blade slams into him, rebounds, tumbles off to the side and clatters to the ground.
    const side = c.dropSide || 1;
    const wx = this.x - an.x, wy = (this.y - an.y) / T(), wd = Math.hypot(wx, wy) || 1;
    const perp = { x: -wy / wd * side, y: wx / wd * side };
    const land = { x: this.x + perp.x * 84 - (wx / wd) * 22, y: this.y + (perp.y * 84 - (wy / wd) * 22) * T() };
    const DUR = 0.75, s = Math.min(1, (t - WIN.HIT) / DUR), tt = s * DUR;
    const z = Math.max(0, 52 + 300 * tt - 520 * tt * tt);       // popped up off the chest, then gravity
    const gx = lerp(this.x, land.x, 1 - Math.pow(1 - s, 2)), gy = lerp(this.y, land.y, 1 - Math.pow(1 - s, 2));
    const lie = 0.25 * side;
    return { x: gx, y: gy - z, gy, rot: lerp(flyRot, lie + side * Math.PI * 2, easeOut(s)), t, dropped: s >= 1, ground: z <= 0.5 };
  };

  proto.updateKarokFinish = function (dt, c, player) {
    c.finishT += dt;
    if (c.win) {
      const t = c.finishT;
      if (c.swordFlight) c.swordFlight.t = t;
      const fx = window.fx;
      // ---- choreography of the player's body ----
      if (!c.winP0) {
        c.dropSide = c.side < 0 ? -1 : 1;
        c.winP0 = { x: player.x, y: player.y };
        const h = player.hammer || { x: player.x, y: player.y };
        c.winH = { x: h.x, y: h.y };
        const dx = player.x - this.x, dy = (player.y - this.y) / T(), d = Math.hypot(dx, dy) || 1;
        c.winR = { x: this.x + (dx / d) * 250, y: this.y + (dy / d) * 250 * T() };
      }
      const P0 = c.winP0, H = c.winH, R = c.winR;
      let jz = 0;
      if (t < WIN.RIP) { player.x = P0.x; player.y = P0.y; }
      else if (t < WIN.RUN_END) {
        const s = easeOut((t - WIN.RIP) / (WIN.RUN_END - WIN.RIP));
        player.x = lerp(P0.x, H.x, s); player.y = lerp(P0.y, H.y, s);
        jz = Math.abs(Math.sin((t - WIN.RIP) * 14)) * 6;
        if (fx && Math.random() < dt * 30) fx.addStepDust(player.x, player.y, 2);
      } else if (t < WIN.JUMP_START) {
        player.x = H.x; player.y = H.y;
      } else if (t < WIN.JUMP_END) {
        const s = (t - WIN.JUMP_START) / (WIN.JUMP_END - WIN.JUMP_START);
        player.x = lerp(H.x, R.x, easeOut(s)); player.y = lerp(H.y, R.y, easeOut(s));
        jz = Math.sin(s * Math.PI) * 96;
      } else { player.x = R.x; player.y = R.y; }
      player.targetX = player.x; player.targetY = player.y;
      player.jumpZ = jz;
      player.facingAngle = Math.atan2((this.y - player.y) / T(), this.x - player.x);
      c.anchor = { x: player.x, y: player.y, z: 62 + jz };

      // ---- beats ----
      if (!c.hammerCaught && t >= WIN.GRAB) {
        c.hammerCaught = true;
        if (player.hammer && player.hammer.mode !== 'held') { player.hammer.mode = 'held'; player.hammer.phase = 'out'; }
        audio.playParryClang(false);
        audio.playImpactBoom(0.9);
        if (fx) { fx.triggerHitstop(70); fx.triggerShake(8, 0.2); fx.addShockwave(player.x, player.y, 110, '#fb923c', 5, 0.35); fx.addStepDust(player.x, player.y, 8); }
        if (player.pushPop) player.pushPop({ kind: 'tier', x: player.x, y: player.y - 130, life: 0.8, color: '#fb923c', text: 'GOT IT!' });
      }
      if (!c.jumped && t >= WIN.JUMP_START) {
        c.jumped = true;
        audio.playSwordSlash(true, 1.2);
        if (fx) { fx.addShockwave(player.x, player.y, 120, KAROK_GREEN_LIGHT, 5, 0.35); fx.addStepDust(player.x, player.y, 10); }
      }
      if (!c.landed && t >= WIN.JUMP_END) {
        c.landed = true;
        audio.playImpactBoom(1.1);
        if (fx) { fx.triggerShake(10, 0.25); fx.addShockwave(player.x, player.y, 150, '#ffffff', 5, 0.4); fx.addStepDust(player.x, player.y, 12); }
      }
      if (!c.tossed && t >= WIN.TOSS) {
        c.tossed = true;
        audio.playSwordSlash(false, 0.8);
        if (fx) fx.addShockwave(player.x, player.y, 90, '#fde047', 4, 0.3);
      }
      // SMACK: the hammer clubs the tossed blade straight at the boss
      if (!c.smacked && t >= WIN.SMACK) {
        c.smacked = true;
        const q = this.karokSwordPos(c, WIN.SMACK);
        audio.playImpactBoom(2.2);
        audio.playSwordPlant && audio.playSwordPlant();
        audio.playParryClang(true);
        if (fx && q) {
          fx.triggerHitstop(220);
          fx.triggerShake(28, 0.45);
          fx.triggerZoomPunch(0.14);
          fx.addShockwave(q.x, q.y + 60, 180, '#ffffff', 7, 0.45);
          fx.addShockwave(player.x, player.y, 240, '#fde047', 8, 0.55);
          fx.addImpactStarburst(q.x, q.y, 140, '#fde047', 8, 0.4, 0.3);
          fx.addDragSparks(q.x, q.y, Math.atan2(this.y - player.y, this.x - player.x), 12, false, '#fde047');
          if (player.isLocal) fx.triggerImpactFrame('#fde047', 0.16);
        }
        if (player.pushPop) player.pushPop({ kind: 'tier', x: player.x, y: player.y - 170, life: 1.0, color: '#fde047', text: 'SMACK!' });
      }
      if (!c.resolved && t >= WIN.HIT) {
        c.resolved = true;
        this.resolveKarokWin(c, player);
      }
      if (t >= WIN.END) this.endKarokClash(player, true);
    } else {
      if (!c.resolved && c.finishT >= 0.3) {
        c.resolved = true;
        this.resolveKarokLoss(c, player);
      }
      if (c.finishT >= 1.0) this.endKarokClash(player, false);
    }
  };

  proto.resolveKarokWin = function (c, player) {
    const bx = this.x, by = this.y;
    audio.playImpactBoom(2.2);
    audio.playCounterSuccessBoom && audio.playCounterSuccessBoom();
    audio.playBossVoiceClip && audio.playBossVoiceClip('stagger_01');
    if (window.fx) {
      const fx = window.fx;
      fx.triggerHitstop(200);
      fx.triggerShake(34, 0.8);
      fx.triggerZoomPunch(0.14);
      if (player.isLocal) fx.triggerImpactFrame('#fde047', 0.18);
      fx.addShockwave(bx, by, 330, '#fde047', 10, 0.7);
      fx.addShockwave(bx, by, 200, '#ffffff', 6, 0.5);
      fx.addPillar(bx, by, 70, '#fde047', 0.9);
      fx.addImpactStarburst(bx, by - 52, 150, '#ffffff', 8, 0.5, 0.3);   // where the blade bites into his chest
      fx.addDragSparks(bx, by - 52, Math.atan2(by - player.y, bx - player.x), 14, true, '#fb7185');
      fx.spawnMassiveEarthChunks(bx, by, 12, '#fb923c');
    }
    // Massive, destructive hit (stagger gauge is frozen by receiveDamage until the state changes).
    player.dealHitToBoss(this, 14.0, 'CLASH', true, 140, false, { isStrongMove: true, impulseStrength: 2.4, hitX: bx, hitY: by, partBreakMult: 2.0, forceCrit: true });
    if (typeof player.brokenApply === 'function') player.brokenApply(this, 3); else applyBrokenStacks(this, 3);
    player.addMomentum && player.addMomentum(200);
  };

  proto.resolveKarokLoss = function (c, player) {
    audio.playImpactBoom(1.8);
    if (window.fx) {
      window.fx.triggerHitstop(100);
      window.fx.triggerShake(26, 0.6);
      window.fx.addShockwave(player.x, player.y, 230, '#e11d48', 8, 0.5);
    }
  };

  proto.endKarokClash = function (player, win) {
    const c = this.karokClash;
    this.karokDrop = (win && c && c.anchor) ? this.karokSwordPos(c, 99) : null;   // blade stays where it fell
    this.karokClash = null;
    if (player) {
      player.karok = null;
      if (player.state === 'h_clash') { player.state = 'idle'; player.stateTimer = 0; }
      player.hIframes = win ? 0.8 : 0;
      player.targetX = player.x; player.targetY = player.y;
      player.snapFeetToBody && player.snapFeetToBody();
    }
    if (win) {
      this.stagger = 0;
      this.enterStaggerState('@none');
    } else {
      // The getsuga simply finishes, point-blank on the player who lost.
      this.state = 'idle';
      this.stateTimer = 0;
      this.aiCooldown = 0.9;
      this.karokSwordHidden = false;
      const party = ((window.game && window.game.party) || []).filter(q => q.hp > 0);
      if (window.fx) {
        window.fx.addShockwave(this.x, this.y, 190, '#e11d48', 7, 0.45);
        window.fx.spawnCrescentWave(this.x + Math.cos(this.facingAngle) * 40, this.y + Math.sin(this.facingAngle) * 40 * T(), this.facingAngle, 320, 0, null, true);
      }
      if (player && player.hp > 0) {
        player.takeDamage(1250, 'Eclipse Getsuga (Clash Lost)', { power: 'heavy', sourceX: this.x, sourceY: this.y, pushDist: 190 });
      }
      this.damagePlayersInSector(party.filter(q => !player || q.id !== player.id), this.x, this.y, 0, 150, this.facingAngle, 0.6, 260, 'Eclipse Getsuga', 'heavy', 150);
    }
  };

  proto.abortKarokClash = function (player) {
    this.karokClash = null;
    this.karokSwordHidden = false;
    if (player) { player.karok = null; if (player.state === 'h_clash') { player.state = 'idle'; player.stateTimer = 0; } }
    if (this.state === 'karok_clash') { this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 0.8; }
  };

  // -----------------------------------------------------------------------
  // Update / reset / draw wrappers
  // -----------------------------------------------------------------------
  const origUpdate = proto.update;
  proto.update = function (dt, party, arenaCenter, arenaRadius) {
    if (this.hp > 0) tickBroken(this, dt);
    if (this.karokClash && this.state !== 'karok_clash') {
      const pl = ((window.game && window.game.party) || []).find(q => q.id === this.karokClash.id);
      const cc = this.karokClash;
      if (cc.mirror && cc.win && cc.anchor && this.state === 'staggered') {
        // The host's stagger sync landed a few frames before this mirror's own cutscene ended: finish it as the win it was,
        // so the blade stays lying beside the boss instead of vanishing and reappearing in his hand.
        this.karokDrop = this.karokSwordPos(cc, 99);
        this.karokSwordHidden = true;
        this.karokClash = null;
        if (pl) { pl.karok = null; if (pl.state === 'h_clash') { pl.state = 'idle'; pl.stateTimer = 0; } pl.hIframes = 0.8; pl.targetX = pl.x; pl.targetY = pl.y; pl.snapFeetToBody && pl.snapFeetToBody(); }
      } else this.abortKarokClash(pl); // stale clash (state was overridden): release everyone
    }
    if (this.hp > 0 && this.state === 'karok_clash') {
      if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      this.updateKarokClash(dt, party);
      return;
    }
    origUpdate.call(this, dt, party, arenaCenter, arenaRadius);
    if (this.hp > 0 && this.state === 'pat_getsuga_charge') this.updateGetsugaCharge(dt, party);
    else this.karokWindow = false;
    if (this.karokSwordHidden && this.state !== 'staggered' && this.state !== 'karok_clash') this.karokSwordHidden = false;
    // Safety: a pending taunt dies if a mechanic starts.
    if (this.karokTaunt && KAROK_MECH_STATES.includes(this.state)) this.karokTaunt = null;
  };

  const origReset = proto.resetBoss;
  proto.resetBoss = function (x, y) {
    origReset.call(this, x, y);
    this.karokClash = null;
    this.karokWindow = false;
    this.karokTaunt = null;
    this.karokAggroId = null;
    this.karokAggroUntil = 0;
    this.karokSwordHidden = false;
    this.brokenStacks = 0;
    this.brokenTimer = 0;
    this.brokenLockout = 0;
    this.getsugaFired = false;
  };

  const origSword = proto.drawObsidianGreatsword;
  proto.drawObsidianGreatsword = function (...args) {
    if (this.karokSwordHidden) return;
    return origSword.apply(this, args);
  };

  const origDraw = proto.draw;
  proto.draw = function (ctx) {
    origDraw.call(this, ctx);
    if (this.hp > 0) {
      drawBrokenMarks(ctx, this);
      this.drawKarokOverlay(ctx);
    }
  };

  // Boss pose used by the draw chain (see the branch added in boss_vaelgor.js draw()).
  proto.getKarokBossPose = function (strideDiff) {
    const out = {
      crouchZ: 0, torsoYaw: 0, torsoLeanFwd: 0, headPitchZ: 0,
      rHandLocal: { fwd: 8, side: 18, up: 39 }, lHandLocal: { fwd: 10, side: -16, up: 42 },
      swordTipLocal: { fwd: -58, side: 46, up: 0 }, bladeDraggingOnFloor: false, activeSlashArc: null
    };
    const tremor = Math.sin(performance.now() * 0.07);
    if (this.state === 'pat_getsuga_charge') {
      const p = this.getsugaProgress();
      if (p < KAROK_WINDOW_FROM) {
        const e = Math.pow(p / KAROK_WINDOW_FROM, 1.6);
        out.crouchZ = -5 * e; out.torsoYaw = 0.9 * e;
        out.rHandLocal = { fwd: lerp(4, -12, e), side: lerp(20, 24, e), up: lerp(35, 50, e) };
        out.lHandLocal = { fwd: lerp(8, -8, e), side: lerp(-16, 12, e), up: lerp(39, 48, e) };
        out.swordTipLocal = { fwd: lerp(-66, -96, e), side: lerp(52, 34, e), up: lerp(0, 56, e) };
      } else if (p < KAROK_FIRE_AT) {
        const charge = c01((p - KAROK_WINDOW_FROM) / (KAROK_FIRE_AT - KAROK_WINDOW_FROM));
        const sh = tremor * charge * 1.6;
        out.crouchZ = -5 - charge * 2; out.torsoYaw = 0.9 + sh * 0.02; out.torsoLeanFwd = -3;
        out.rHandLocal = { fwd: -12 + sh * 0.3, side: 24, up: 50 };
        out.lHandLocal = { fwd: -8, side: 12, up: 48 };
        out.swordTipLocal = { fwd: -96, side: 34 + sh, up: 56 + charge * 12 };
      } else {
        const s = c01((p - KAROK_FIRE_AT) / 0.1);
        const snap = 1 - Math.pow(1 - s, 4);
        const ang = 1.4 - snap * 2.9;
        out.torsoYaw = 0.9 - snap * 1.9;
        out.torsoLeanFwd = 8 * snap;
        out.rHandLocal = { fwd: Math.cos(ang) * 26, side: Math.sin(ang) * 26, up: 46 };
        out.lHandLocal = { fwd: Math.cos(ang) * 22, side: Math.sin(ang) * 22, up: 43 };
        out.swordTipLocal = { fwd: Math.cos(ang - 0.15) * 108, side: Math.sin(ang - 0.15) * 108, up: 44 };
        if (s < 1) out.activeSlashArc = { type: 'horizontal', prog: snap };
      }
      return out;
    }
    // karok_clash
    const c = this.karokClash || { meter: 0.5, phase: 'intro', t: 0 };
    const m = c.meter;
    if (c.phase === 'intro') {
      const e = easeOut(c.t / 0.5);
      out.torsoYaw = lerp(0.9, 0, e); out.crouchZ = -4 * e;
      out.rHandLocal = { fwd: lerp(-12, 22, e), side: lerp(24, 8, e), up: 46 };
      out.lHandLocal = { fwd: lerp(-8, 20, e), side: lerp(12, 0, e), up: 44 };
      out.swordTipLocal = { fwd: lerp(-96, 98, e), side: lerp(34, 0, e), up: lerp(56, 50, e) };
    } else if (c.phase === 'struggle') {
      out.rHandLocal = { fwd: 22, side: 8, up: 46 };
      out.lHandLocal = { fwd: 20, side: 0, up: 44 };
      out.swordTipLocal = { fwd: 98, side: tremor * 2, up: 50 + tremor * 2 };
      out.torsoLeanFwd = lerp(16, -12, m) + tremor * 0.6;   // boss leans in when winning, rocks back when losing
      out.crouchZ = lerp(-4, -9, m);
      out.headPitchZ = lerp(2, -4, m);
    } else if (c.win) {
      // downed: disarmed, driven to his knees, and staying there for the whole cutscene
      const t = c.finishT || 0;
      const k = easeOut(t / 0.4);
      out.torsoLeanFwd = 24 * k; out.crouchZ = -22 * k; out.headPitchZ = -8 * k; out.torsoYaw = 0.25 * k;
      out.rHandLocal = { fwd: lerp(22, 14, k), side: 18, up: lerp(46, 18, k) };
      out.lHandLocal = { fwd: lerp(20, 12, k), side: -16, up: lerp(44, 16, k) };
      out.swordTipLocal = { fwd: 0, side: 30, up: 10 };
    } else {
      const t = c.finishT || 0;
      const k = easeOut(t / 0.3);
      out.torsoLeanFwd = 18 * k; out.torsoYaw = -0.6 * k;
      out.rHandLocal = { fwd: 22 + 8 * k, side: 8, up: 46 };
      out.lHandLocal = { fwd: 20 + 8 * k, side: 0, up: 44 };
      out.swordTipLocal = { fwd: 106, side: lerp(0, -30, k), up: 48 };
      if (t >= 0.28 && t < 0.6) out.activeSlashArc = { type: 'horizontal', prog: easeOut((t - 0.28) / 0.3) };
    }
    return out;
  };

  // The charge-up: a dark-red orb gathers at the raised blade while motes spiral in, and the firing lane lights up with
  // chevrons racing down it (faster and brighter as the release nears).
  proto.drawGetsugaCharge = function (ctx, p, charge, time) {
    if (p < KAROK_WINDOW_FROM * 0.5 || p > KAROK_FIRE_AT + 0.02) return;
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    const e = c01((p - KAROK_WINDOW_FROM * 0.5) / (KAROK_FIRE_AT - KAROK_WINDOW_FROM * 0.5));
    // --- lane chevrons
    ctx.save();
    ctx.translate(this.x, this.y); ctx.scale(1, T()); ctx.rotate(this.facingAngle);
    ctx.globalCompositeOperation = 'lighter';
    const speed = 160 + charge * 520;
    for (let k = 0; k < 6; k++) {
      const x = (((time * speed) % 520) + k * 87) % 520;
      const al = (0.08 + charge * 0.5) * Math.sin((x / 520) * Math.PI);
      ctx.strokeStyle = 'rgba(251,113,133,' + al.toFixed(3) + ')';
      ctx.lineWidth = 3 + charge * 3;
      ctx.beginPath(); ctx.moveTo(x - 12, -34); ctx.lineTo(x + 6, 0); ctx.lineTo(x - 12, 34); ctx.stroke();
    }
    if (charge > 0.85) {                       // last instant: the whole lane strobes
      ctx.fillStyle = 'rgba(255,228,230,' + (0.18 * Math.abs(Math.sin(time * 40))).toFixed(3) + ')';
      ctx.fillRect(0, -70, 520, 140);
    }
    ctx.restore();
    // --- the greatsword itself drinks the light: the blade goes black, a crimson edge burns along it and void flames lick upward
  };

  // A blade turned to black fire. h and t are the hilt and the point in the boss's draw space (the same points the sword is drawn between).
  proto.drawBlackBlade = function (ctx, h, t, e, charge, time) {
    const dx = t.x - h.x, dy = t.y - h.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const w = 5 + e * 9;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // soft dark halo
    ctx.globalCompositeOperation = 'source-over';
    let g = ctx.createRadialGradient((h.x + t.x) / 2, (h.y + t.y) / 2, 4, (h.x + t.x) / 2, (h.y + t.y) / 2, L * 0.75);
    g.addColorStop(0, 'rgba(5,0,12,' + (0.55 * e).toFixed(3) + ')'); g.addColorStop(1, 'rgba(5,0,12,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc((h.x + t.x) / 2, (h.y + t.y) / 2, L * 0.75, 0, Math.PI * 2); ctx.fill();
    // a wide violet-crimson glow around it, so the black reads against a dark arena
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(147,51,234,' + (0.07 + 0.15 * charge).toFixed(3) + ')'; ctx.lineWidth = w * 4.2;
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(244,63,94,' + (0.08 + 0.2 * charge).toFixed(3) + ')'; ctx.lineWidth = w * 3.2;
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // blackened blade
    ctx.strokeStyle = 'rgba(4,0,10,' + (0.35 + 0.6 * e).toFixed(3) + ')'; ctx.lineWidth = w * 1.8;
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    // burning crimson edges, brighter and wilder as it charges
    ctx.globalCompositeOperation = 'lighter';
    for (const sg of [-1, 1]) {
      const fl = 0.7 + 0.3 * Math.sin(time * 18 + sg * 2);
      ctx.strokeStyle = 'rgba(244,63,94,' + ((0.25 + 0.6 * charge) * fl * e).toFixed(3) + ')'; ctx.lineWidth = 2.2 + charge * 2;
      ctx.beginPath(); ctx.moveTo(h.x + nx * w * sg, h.y + ny * w * sg); ctx.lineTo(t.x + nx * w * 0.35 * sg, t.y + ny * w * 0.35 * sg); ctx.stroke();
    }
    // a violet spine pulses down the centre
    ctx.strokeStyle = 'rgba(168,85,247,' + ((0.15 + 0.45 * charge) * (0.6 + 0.4 * Math.sin(time * 11))).toFixed(3) + ')'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    // void flames rising off the blade
    const n = 16;
    for (let i = 0; i < n; i++) {
      const ph = (time * 0.9 + i / n) % 1, along = (i * 0.37 + ph * 0.2) % 1;
      const px = h.x + dx * along + nx * Math.sin(ph * 9 + i) * w * 0.8, py = h.y + dy * along + ny * Math.sin(ph * 9 + i) * w * 0.8 - ph * (18 + 34 * charge);
      const r = (3.2 - ph * 2.4) * (0.6 + e);
      ctx.fillStyle = ph < 0.5 ? 'rgba(15,0,25,' + (0.7 * e).toFixed(3) + ')' : 'rgba(190,40,90,' + (0.5 * (1 - ph) * e).toFixed(3) + ')';
      ctx.globalCompositeOperation = ph < 0.5 ? 'source-over' : 'lighter';
      ctx.beginPath(); ctx.arc(px, py, Math.max(0.6, r), 0, Math.PI * 2); ctx.fill();
    }
    // the point gathers a pinprick of dark that grows to a bright rim just before it is released
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#03000a'; ctx.beginPath(); ctx.arc(t.x, t.y, 3 + e * 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,200,215,' + (0.3 + 0.6 * charge).toFixed(3) + ')'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(t.x, t.y, 3 + e * 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };
  // The sword turns black while it charges and stays black through the clash. Drawn right after the blade itself so the
  // black burns over it, from the same hilt and tip points.
  const origObsidian = proto.drawObsidianGreatsword;
  if (origObsidian) {
    proto.drawObsidianGreatsword = function (ctx, anchor, lHand, tip, slashArc, time) {
      const r = origObsidian.apply(this, arguments);
      try {
        let e = 0, charge = 0;
        if (this.state === 'pat_getsuga_charge') {
          const p = this.getsugaProgress();
          if (p >= KAROK_WINDOW_FROM * 0.5 && p <= KAROK_FIRE_AT + 0.02) {
            e = c01((p - KAROK_WINDOW_FROM * 0.5) / (KAROK_FIRE_AT - KAROK_WINDOW_FROM * 0.5));
            charge = c01((p - KAROK_WINDOW_FROM) / (KAROK_FIRE_AT - KAROK_WINDOW_FROM));
          }
        } else if (this.state === 'karok_clash' && this.karokClash && !this.karokClash.win && this.karokClash.phase !== 'finish') {
          e = 0.85; charge = Math.max(0.25, 1 - this.karokClash.meter);
        }
        if (e > 0.01) this.drawBlackBlade(ctx, { x: anchor.sx, y: anchor.sy }, { x: tip.sx, y: tip.sy }, e, charge, performance.now() * 0.004);
      } catch (err) { /* never let a flourish break the draw */ }
      return r;
    };
  }
  // World-space overlay: charge telegraph (everyone), [G] prompt (eligible Gravebreaker only), thrown sword.
  proto.drawKarokOverlay = function (ctx) {
    const time = performance.now() * 0.004;
    if (this.state === 'pat_getsuga_charge') {
      const p = this.getsugaProgress();
      const charge = c01((p - KAROK_WINDOW_FROM) / (KAROK_FIRE_AT - KAROK_WINDOW_FROM));
      if (p < KAROK_FIRE_AT + 0.02 && this.drawKarokLaneTell) {
        this.drawKarokLaneTell(ctx, p, charge, time);   // a boss with its own look for the firing lane
      } else if (p < KAROK_FIRE_AT + 0.02) {
        // red firing-lane telegraph
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, T());
        ctx.rotate(this.facingAngle);
        const a = 0.06 + charge * 0.2;
        const lane = this.karokLane || { fill: '225, 29, 72', edge: '251, 113, 133', len: 520, half: 70 };   // a boss can recolour / resize its lane
        ctx.fillStyle = `rgba(${lane.fill}, ${a})`;
        ctx.fillRect(0, -lane.half, lane.len, lane.half * 2);
        ctx.strokeStyle = `rgba(${lane.edge}, ${0.25 + charge * 0.5})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -lane.half, lane.len, lane.half * 2);
        ctx.restore();
      }
      this.drawGetsugaCharge(ctx, p, charge, time);
      // [G] CLASH prompt: only the local Gravebreaker who can actually take it sees this
      const lp = window.game && window.game.localPlayer;
      if (this.canPlayerKarokClash(lp)) {
        const left = c01(1 - (p - KAROK_WINDOW_FROM) / (Math.min(KAROK_FIRE_AT, KAROK_WINDOW_TO) - KAROK_WINDOW_FROM));
        const cx = this.x, cy = this.y - 118;
        ctx.save();
        ctx.translate(cx, cy);
        const pulse = 1 + Math.sin(time * 9) * 0.06;
        ctx.scale(pulse, pulse);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke();
        const halo = ctx.createRadialGradient(0, 0, 20, 0, 0, 46); halo.addColorStop(0, 'rgba(92,193,63,0.45)'); halo.addColorStop(1, 'rgba(92,193,63,0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(30,86,24,0.92)';
        ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = left < 0.3 ? '#f87171' : KAROK_GREEN;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 26px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G', 0, 1);
        ctx.font = '800 11px system-ui, sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText('CLASH', 0, 44);
        ctx.fillStyle = KAROK_GREEN_LIGHT;
        ctx.fillText('CLASH', 0, 44);
        ctx.restore();
      }
    }

    // The ripped-away greatsword flying back at him
    const c = this.karokClash;
    if (c && c.win && c.swordFlight) {
      const pos = this.karokSwordPos(c);
      if (pos) {
        // ground shadow under a tumbling blade
        if (pos.dropped !== undefined) this.drawKarokSwordShadow(ctx, pos);
        if (pos.flying) {
          // streak of afterimages behind the hammer-smacked blade
          for (let i = 3; i >= 1; i--) {
            const q = this.karokSwordPos(c, pos.t - i * 0.025);
            if (q) this.drawKarokSword(ctx, q.x, q.y, q.rot, 0.22);
          }
        }
        this.drawKarokSword(ctx, pos.x, pos.y, pos.rot, 1);
      }
    } else if (!c && this.karokSwordHidden && this.karokDrop) {
      // the blade stays where it clattered down for as long as he's disarmed
      this.drawKarokSwordShadow(ctx, this.karokDrop);
      this.drawKarokSword(ctx, this.karokDrop.x, this.karokDrop.y, this.karokDrop.rot, 1);
    }
    if (!this.karokSwordHidden && !c) this.karokDrop = null;
  };
})();

// ---------------------------------------------------------------------------
// The Eclipse Getsuga itself: a black crescent with a crimson, white-hot edge, a stream of afterimages, flame wisps at the
// tips and a glowing scorch lane on the ground behind it. Drawn by ArenaFX.drawForegroundSparks for waves flagged getsuga.
// ---------------------------------------------------------------------------
if (typeof ArenaFX !== 'undefined') {
  ArenaFX.prototype.drawGetsugaWave = function (ctx, cw) {
    const T = PERSPECTIVE_TILT;
    const a = Math.max(0, Math.min(1, (cw.life / cw.maxLife) * 1.6));
    const t = performance.now() * 0.001;
    const R = 66, span = 1.12, d = R * 0.56;
    const tipX = R * Math.cos(span), tipY = R * Math.sin(span);
    const Ri = Math.hypot(tipX + d, tipY), ia = Math.atan2(tipY, tipX + d);
    const crescent = (sc) => {
      ctx.beginPath();
      ctx.arc(0, 0, R * sc, -span, span);
      ctx.arc(-d * sc, 0, Ri * sc, ia, -ia, true);
      ctx.closePath();
    };
    // ground scorch lane
    ctx.save();
    ctx.translate(cw.x, cw.y); ctx.rotate(cw.angle); ctx.scale(1, T);
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createLinearGradient(-340, 0, 0, 0);
    gl.addColorStop(0, 'rgba(127,29,29,0)'); gl.addColorStop(1, 'rgba(244,63,94,' + (0.5 * a).toFixed(3) + ')');
    ctx.fillStyle = gl; ctx.fillRect(-340, -34, 340, 68);
    ctx.fillStyle = 'rgba(255,228,230,' + (0.35 * a).toFixed(3) + ')'; ctx.fillRect(-340, -3, 340, 6);
    ctx.restore();

    ctx.save();
    ctx.translate(cw.x, cw.y - 26); ctx.rotate(cw.angle);
    // afterimages
    for (let k = 7; k >= 1; k--) {
      ctx.save();
      ctx.translate(-k * 24, 0); ctx.scale(1 - k * 0.07, 1 - k * 0.075);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * (0.3 - k * 0.035);
      ctx.fillStyle = '#be123c'; crescent(1); ctx.fill();
      ctx.restore();
    }
    // dark body
    ctx.globalAlpha = a * 0.96;
    const body = ctx.createRadialGradient(-d, 0, 4, -d, 0, R + d);
    body.addColorStop(0, '#000000'); body.addColorStop(0.7, '#12000a'); body.addColorStop(1, '#4c0519');
    ctx.fillStyle = body; crescent(1); ctx.fill();
    // glowing edge, three passes
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [col, w, al] of [['#9f1239', 30, 0.3], ['#f43f5e', 13, 0.8], ['#ffe4e6', 4.5, 1]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = a * al;
      ctx.beginPath(); ctx.arc(0, 0, R, -span, span); ctx.stroke();
    }
    // thin hot line along the inner edge
    ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 2.2; ctx.globalAlpha = a * 0.8;
    ctx.beginPath(); ctx.arc(-d, 0, Ri, ia, -ia, true); ctx.stroke();
    // flame wisps streaming back off the tips
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const fl = Math.sin(t * 22 + i * 1.7 + s) * 0.5 + 0.5;
        ctx.strokeStyle = i % 2 ? '#fb7185' : '#f43f5e';
        ctx.lineWidth = 3.2 - i * 0.55; ctx.globalAlpha = a * (0.75 - i * 0.12);
        ctx.beginPath();
        ctx.moveTo(tipX, s * tipY);
        ctx.quadraticCurveTo(tipX - 22 - i * 12, s * (tipY + 9 + fl * 8), tipX - 52 - i * 20 - fl * 14, s * (tipY - 2 + i * 6));
        ctx.stroke();
      }
    }
    // bright point at the apex
    const ap = ctx.createRadialGradient(R, 0, 0, R, 0, 26);
    ap.addColorStop(0, 'rgba(255,255,255,' + (0.9 * a).toFixed(3) + ')'); ap.addColorStop(1, 'rgba(244,63,94,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = ap; ctx.beginPath(); ctx.arc(R, 0, 26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
}

// ---------------------------------------------------------------------------
// Screen-space cinematic for the clasher: letterbox, tug-of-war meter, prompts, results.
// Called from Game25D.draw(). Only the clasher sees it; everyone else just sees a damage window.
// ---------------------------------------------------------------------------
function drawKarokClashHud(ctx, W, H, boss, player) {
  if (!player || !player.karok || !player.karok.active || !boss || !boss.karokClash) return;
  const c = boss.karokClash;
  const k = player.karok;
  const t = c.t;
  const bar = Math.min(1, t / 0.4) * Math.round(H * 0.11);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);

  // title
  if (t < 1.6) {
    const a = Math.min(1, t / 0.3) * Math.min(1, (1.6 - t) / 0.4);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = '900 34px system-ui, sans-serif';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText('C L A S H', W / 2, bar + 56);
    ctx.fillStyle = KAROK_GREEN_LIGHT;
    ctx.fillText('C L A S H', W / 2, bar + 56);
    ctx.globalAlpha = 1;
  }

  if (c.phase === 'struggle' || c.phase === 'finish') {
    const bw = Math.min(640, W * 0.6), bh = 26;
    const x0 = (W - bw) / 2, y0 = bar + 22;
    ctx.fillStyle = 'rgba(8,10,18,0.9)';
    ctx.fillRect(x0 - 4, y0 - 4, bw + 8, bh + 8);
    // boss side (right, crimson) is the background; the player's share grows from the left
    const grad2 = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
    grad2.addColorStop(0, KAROK_GREEN_DARK); grad2.addColorStop(1, KAROK_GREEN_LIGHT);
    ctx.fillStyle = '#9f1239';
    ctx.fillRect(x0, y0, bw, bh);
    ctx.fillStyle = grad2;
    ctx.fillRect(x0, y0, bw * c.meter, bh);
    // middle tick
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x0 + bw / 2 - 1, y0 - 6, 2, bh + 12);
    // marker
    const mx = x0 + bw * c.meter;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(mx, y0 - 8); ctx.lineTo(mx - 7, y0 - 18); ctx.lineTo(mx + 7, y0 - 18); ctx.closePath(); ctx.fill();
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0fdf4'; ctx.fillText('YOU', x0 + 6, y0 + 17);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe4e6'; ctx.fillText(boss.hudName || 'VAELGOR', x0 + bw - 6, y0 + 17);

    if (c.phase === 'struggle') {
      const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.06 + (c.pulse > 0 ? 0.08 : 0);
      ctx.save();
      ctx.translate(W / 2, y0 + bh + 44);
      ctx.scale(pulse, pulse);
      ctx.textAlign = 'center';
      ctx.font = '900 24px system-ui, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText('MASH  [ G ] !', 0, 0);
      ctx.fillStyle = c.meter >= 0.5 ? KAROK_GREEN_LIGHT : '#fda4af';
      ctx.fillText('MASH  [ G ] !', 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}
window.drawKarokClashHud = drawKarokClashHud;

// Camera for the clasher while the clash is running (consumed by Game25D.update).
function getKarokCamera(boss, player) {
  if (!player || !player.karok || !player.karok.active || !boss || !boss.karokClash) return null;
  const c = boss.karokClash;
  const mx = (boss.x + player.x) * 0.5, my = (boss.y + player.y) * 0.5;
  let zoom = 1.5, up = 52, tilt = 0;
  if (c.style === 'beam') {
    // a beam clash spans a long lane: frame both ends, closing in as the player wins ground
    const d = Math.hypot(boss.x - player.x, (boss.y - player.y) / PERSPECTIVE_TILT);
    const fit = Math.max(1.05, Math.min(1.75, 1.85 - (d - 70) / 330));
    if (c.phase === 'intro') { const e = Math.min(1, c.t / KAROK_INTRO); return { x: mx, y: my - 58, zoom: 1.15 + (fit - 1.15) * e, tilt: 0.03 * e }; }
    if (c.phase === 'struggle') return { x: mx, y: my - 58, zoom: fit + Math.abs(c.meter - 0.5) * 0.08, tilt: (c.meter - 0.5) * 0.05 };
    const ft = c.finishT || 0;
    return { x: mx, y: my - 62, zoom: c.win ? (ft < 0.6 ? 1.6 : (ft < 1.6 ? 1.35 : 1.55)) : 1.7, tilt: 0 };
  }
  if (c.phase === 'intro') {
    const e = c.t / KAROK_INTRO;
    zoom = 1.2 + e * 0.5; up = 40 + e * 14; tilt = 0.04 * e;
  } else if (c.phase === 'struggle') {
    const e = hClamp01((c.t - KAROK_INTRO) / 8);   // the camera creeps in as the clash drags on
    zoom = 1.72 + e * 0.1 + Math.abs(c.meter - 0.5) * 0.12;
    up = 54;
    tilt = (c.meter - 0.5) * 0.05;
  } else {
    const ft = c.finishT || 0;
    if (c.win) {
      // a different framing for each beat: tight on the rip, follow the run, pull wide for the jump, close for the smack
      const W = window.KAROK_WIN;
      let z = 1.8, u = 60;
      if (ft < W.RIP) { z = 1.85; u = 56; }
      else if (ft < W.GRAB) { z = 1.6; u = 50; }
      else if (ft < W.JUMP_START) { z = 1.75; u = 48; }
      else if (ft < W.JUMP_END) { const s = (ft - W.JUMP_START) / (W.JUMP_END - W.JUMP_START); z = 1.75 - 0.6 * Math.sin(s * Math.PI * 0.5); u = 60 + 30 * s; }
      else if (ft < W.SMACK) { z = 1.15 + 0.35 * hClamp01((ft - W.JUMP_END) / (W.SMACK - W.JUMP_END)); u = 90; }
      else { z = 1.6 - 0.15 * hClamp01((ft - W.SMACK) / 0.6); u = 80; }
      zoom = z; up = u;
      // follow the player's side of the action more as the fight moves away from the boss
      const w2 = ft >= W.RIP ? 0.35 : 0;
      return { x: mx + (player.x - mx) * w2, y: my + (player.y - my) * w2 - up, zoom, tilt };
    }
    zoom = 1.82;
    up = 52;
  }
  return { x: mx, y: my - up, zoom, tilt };
}
window.getKarokCamera = getKarokCamera;
