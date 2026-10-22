// =========================================================================
// BOSS_TRANSITIONS.JS — a lead-in before the Blood-Moon (sword bait) and Severed Horizon (clock) mechanics.
// Instead of snapping to the altar, Vaelgor takes 99% less damage, gathers the black sun around him for a beat,
// then leaps to the centre and crashes down. The mechanic's own cutscene starts the moment he lands.
// Host/solo drives it; guests follow the host's position and receive the normal boss_pattern when he lands.
// =========================================================================
(function () {
  if (typeof VaelgorRaidBoss === 'undefined') return;
  const P = VaelgorRaidBoss.prototype;
  const WITH_LEAD_IN = new Set(['eclipse_mechanic', 'horizon_mechanic']);
  const DUR = 1.35, CHARGE = 0.36;
  const ease = (t) => t * t * (3 - 2 * t);
  const tilt = () => (typeof PERSPECTIVE_TILT !== 'undefined' ? PERSPECTIVE_TILT : 0.58);

  const oTrigger = P.triggerPatternByName;
  P.triggerPatternByName = function (name, target, fromNetwork, netData) {
    if (WITH_LEAD_IN.has(name) && !fromNetwork && !this._approachDone) {
      const free = this.state === 'idle' || this.state === 'walk' || /^pat_|^(uppercut|cleave|thrust)$/.test(this.state || '');
      if (free && !(this.lockedByUltimateTimer > 0)) { this.beginMechApproach(name); return; }
      // held down (a hammer Worldbreaker, a stagger, a lock): wait until he is back on his feet, then run the lead-in.
      // This also keeps a player from being frozen inside their own ultimate by the mechanic's cutscene.
      this.approachPending = name;
      return;
    }
    return oTrigger.call(this, name, target, fromNetwork, netData);
  };

  P.beginMechApproach = function (name) {
    this.state = 'mech_approach';
    this.approachPending = name;
    this.stateDuration = DUR;
    this.stateTimer = DUR;
    this.approachT = 0;
    this.approachFromX = this.x;
    this.approachFromY = this.y;
    this.counterableWindow = false;
    this.jumpZ = 0;
    this.patStep = 0;
    this.vx = 0; this.vy = 0; this.speed = 0;
    this.targetX = this.x; this.targetY = this.y;
    if (window.audio) { audio.playEclipseBell && audio.playEclipseBell(); audio.playBossVoice('', 'attack'); }
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 150, '#a855f7', 5);
      window.fx.addPillar(this.x, this.y, 46, '#c084fc', 0.7);
    }
  };

  const oUpdate = P.update;
  P.update = function (dt, ...rest) {
    // the generic state timer would send him back to idle on its own; keep it parked while we run the lead-in
    // Only the client that is actually running the lead-in (it has approachPending) parks the timer. A guest that merely saw the state
    // in a packet, or a stale packet that put the boss back into it after he had landed, must be able to leave it again: before,
    // that left a permanent violet ward (and 99% damage reduction) around him with nothing to end it.
    if (this.state === 'mech_approach') {
      this._approachAge = (this._approachAge || 0) + dt;
      if (this.approachPending && this._approachAge < DUR + 1.5) { this.stateDuration = DUR + 5; this.stateTimer = DUR + 5; }
      else if (this._approachAge >= DUR + 0.9 || !this.approachPending && this._approachAge > 0.4 && this.netSyncState !== 'mech_approach') {
        this.state = 'idle'; this.stateTimer = 0; this.jumpZ = 0; this._approachAge = 0;
      }
    } else this._approachAge = 0;
    const r = oUpdate.call(this, dt, ...rest);
    // safety net: if something knocked him out of the lead-in, the mechanic still has to happen
    if (this.approachPending && this.state !== 'mech_approach' && (this.state === 'idle' || this.state === 'walk') && !(this.lockedByUltimateTimer > 0)) {
      const name = this.approachPending;
      this.approachPending = null;
      this.jumpZ = 0;
      this.beginMechApproach(name);
      return r;
    }
    // safety net for the 10% transition: if he is ever left standing idle while the transition is still marked active he would sit at
    // 99% damage reduction for good, so push the transition on to its next stage
    if (this.finalTransitionActive && !this.finalPhase && (this.state === 'idle' || this.state === 'walk')) {
      this._finalStuck = (this._finalStuck || 0) + dt;
      const host = !window.game || !window.game.net || window.game.net.isHost;
      if (this._finalStuck > 2.5 && host) {
        this._finalStuck = 0;
        const alive = (window.game && window.game.party ? window.game.party : []).filter(pl => pl && pl.hp > 0);
        if (alive.length && typeof this.enterFinalRoarAndQte === 'function') this.enterFinalRoarAndQte(alive, false);
      }
    } else this._finalStuck = 0;
    if (this.state !== 'mech_approach') return r;
    // a guest sees the host's state in a packet: it must never run the lead-in itself (it has no start position, so it would put
    // the boss at NaN), it just follows the host's position until the real mechanic arrives
    if (!this.approachPending || this.approachFromX === undefined) return r;
    this.approachT = Math.min(DUR, (this.approachT || 0) + dt);
    const prog = this.approachT / DUR;
    this.vx = 0; this.vy = 0; this.speed = 0;
    const tx = this.spawnX, ty = this.spawnY;
    const dx = tx - this.approachFromX, dy = ty - this.approachFromY;
    if (Math.hypot(dx, dy) > 4) this.facingAngle = Math.atan2(dy / tilt(), dx);
    if (prog < CHARGE / DUR * 1) {
      // gathering power: crouched in place, dark motes spiralling in
      this.jumpZ = 0;
      if (window.fx && Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        window.fx.addDragSparks(this.x + Math.cos(a) * 90, this.y + Math.sin(a) * 90 * tilt(), a + Math.PI, 2, false, '#c084fc');
      }
    } else {
      const t = Math.min(1, (prog - CHARGE / DUR) / (1 - CHARGE / DUR));
      const e = ease(t);
      this.x = this.approachFromX + dx * e;
      this.y = this.approachFromY + dy * e;
      this.jumpZ = Math.sin(Math.PI * t) * 120;
      if (window.fx && Math.random() < 0.5) window.fx.addAfterimage && window.fx.addAfterimage(this.x, this.y, this.facingAngle, '#a855f7');
    }
    this.targetX = this.x; this.targetY = this.y;
    if (this.approachT >= DUR) {
      this.x = tx; this.y = ty; this.jumpZ = 0;
      this.targetX = tx; this.targetY = ty;
      if (window.audio) { audio.playImpactBoom(1.9); audio.playSwordPlant && audio.playSwordPlant(); }
      if (window.fx) {
        window.fx.triggerShake(24, 0.5);
        window.fx.addShockwave(tx, ty, 320, '#a855f7', 8);
        window.fx.addShockwave(tx, ty, 180, '#e11d48', 5);
        window.fx.addPillar(tx, ty, 60, '#c084fc', 0.8);
      }
      const name = this.approachPending;
      this.approachPending = null;
      this.state = 'idle';
      this._approachDone = true;
      try { oTrigger.call(this, name, null, false, null); } finally { this._approachDone = false; }
    }
    return r;
  };

  // an ultimate lock mid lead-in: cut it short and start the mechanic right away (it is exempt from the lock)
  const oLock = P.lockInPlaceForUltimate;
  P.lockInPlaceForUltimate = function (...args) {
    if (this.state === 'mech_approach' && this.approachPending) {
      // cut the lead-in short; the lock holds him down and the mechanic (still pending) starts once he is up
      this.state = 'idle'; this.jumpZ = 0;
    }
    return oLock.apply(this, args);
  };

  // 99% damage reduction and no stagger while he is travelling
  const oHit = P.receiveDamage;
  P.receiveDamage = function (dmg, staggerAmt, attacker, hitOpts) {
    if (this.state === 'mech_approach') { dmg = Math.max(1, Math.round(dmg * 0.01)); staggerAmt = 0; }
    return oHit.call(this, dmg, staggerAmt, attacker, hitOpts);
  };

  const oDraw = P.draw;
  P.draw = function (ctx, ...rest) {
    const live = this.state === 'mech_approach';
    if (live) {
      // landing mark on the floor
      const time = performance.now() / 1000;
      ctx.save();
      ctx.translate(this.spawnX, this.spawnY); ctx.scale(1, tilt());
      ctx.strokeStyle = `rgba(192, 132, 252, ${0.35 + 0.2 * Math.sin(time * 10)})`;
      ctx.lineWidth = 2.2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(0, 0, 110, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const out = oDraw.call(this, ctx, ...rest);
    if (live) {
      // violet ward around him (the 99% reduction)
      const time = performance.now() / 1000;
      ctx.save();
      ctx.translate(this.x, this.y - (this.jumpZ || 0) - 70);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 120);
      g.addColorStop(0, 'rgba(168, 85, 247, 0)');
      g.addColorStop(0.75, `rgba(168, 85, 247, ${0.22 + 0.08 * Math.sin(time * 12)})`);
      g.addColorStop(1, 'rgba(168, 85, 247, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, 120, 110, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return out;
  };
})();
