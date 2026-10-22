// =========================================================================
// BREAKER_25D.JS — Articulated 2.5D Greatsword Warden (Breaker Class)
// Signature Shoulder-Rested Colossal Greatsword Idle/Walk Pose, Weighty [Q]
// Spin Lunge -> Shoulder-Heave Finish, [W] Earthbreaker Tectonic Leap, [E]
// Bulwark Guard, [R] Getsuga Crescent Wave, [A] Iron Tackle, [S] Bedrock
// Drag Uppercut, [D] Anime X-Cut Counter, [F] Titan's Wrath, & [T] Omnislash!
// =========================================================================

// Fixed-size ring buffer of sword hand/tip samples (shared with boss_vaelgor.js). Slots are reused,
// so pushing a sample every frame allocates nothing and never shifts an array.
class SwordTrailRing {
  constructor(capacity) {
    this.capacity = capacity;
    this.slots = [];
    for (let i = 0; i < capacity; i++) this.slots.push({ hx: 0, hy: 0, tx: 0, ty: 0 });
    this.head = 0; // index of the oldest sample
    this.length = 0;
  }

  push(hx, hy, tx, ty) {
    let slot;
    if (this.length < this.capacity) {
      slot = this.slots[(this.head + this.length) % this.capacity];
      this.length++;
    } else {
      slot = this.slots[this.head];
      this.head = (this.head + 1) % this.capacity;
    }
    slot.hx = hx; slot.hy = hy; slot.tx = tx; slot.ty = ty;
  }

  // i = 0 is the oldest sample.
  at(i) {
    return this.slots[(this.head + i) % this.capacity];
  }

  clear() {
    this.head = 0;
    this.length = 0;
  }
}
window.SwordTrailRing = SwordTrailRing;

class BreakerPlayer25D {
  // A co-op player simulated from network packets. Its owner's client is authoritative for its HP,
  // its hits on the boss and any boss/mechanic events it causes; locally it is presentation only.
  get isRemote() {
    return !this.isLocal && !this.isBot;
  }

  constructor(id, name, x, y, isLocal = true, isBot = false) {
    this.id = id;
    this.name = name || 'Breaker Warden';
    this.isLocal = isLocal;
    this.isBot = isBot;

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.targetX = x;
    this.targetY = y;

    this.facingAngle = -Math.PI * 0.5;
    this.moveAngle = this.facingAngle;
    this.speed = 0;
    this.baseMaxSpeed = 192;
    this.turnSpeed = 9.5;
    this.jumpZ = 0;

    // Combat & Equipment Stats (Driven by Vindictus Set Tiers — No +15 RNG!)
    this.maxHp = 2600;
    this.hp = 2600;
    this.shield = 0;
    this.baseAtk = 140;
    this.bonusAtk = 0;
    this.bonusDef = 60;
    this.critRate = 0.28;
    this.atkSpeedMult = 1.0;

    // Visual Weapon Model ID ('warden_steel', 'vaelgor_obsidian', 'black_sun_sovereign')
    this.weaponModelId = 'warden_steel';
    this.weaponColor = '#38bdf8';
    this.weaponGlow = '#0284c7';
    this.armorTint = '#1e293b';
    this.trimColor = '#fbbf24';
    this.swordScale = 1.0;

    // Breaker Identity: Overpower Gauge, Surge, Riposte, & Tackle-Breaker Synergy
    this.overpower = 0;
    this.maxOverpower = 100;
    this.overpowerSurge = false;
    this.surgeTimer = 0;
    this.tackleComboPrimed = 0; // [A] Iron Tackle primes instant +25% DMG [W] Earthbreaker!
    this.parryRipostePrimed = 0; // [E] Guard Block primes +40% DMG [F] Titan's Wrath!

    // State Machine & Full-Body Rotational Kinematics
    this.state = 'idle';
    this.stateTimer = 0;
    this.stateDuration = 0.5;
    this.stateHitDone = false;
    this.comboStep = 0;
    this.comboResetTimer = 0;
    this.bodySpinAngle = 0; // Rotates the entire 2.5D body rig during spins & cleaves!

    // Tiered Hit-Reaction / Knockback / Knockdown & Step-In Momentum Physics
    this.kbVx = 0;
    this.kbVy = 0;
    this.attackStepVx = 0;
    this.attackStepVy = 0;
    this.knockdownBounced = false;

    // [R] Hold-to-Charge Sweet-Spot State
    this.rChargeTime = 0;
    this.rMaxCharge = 1.05;
    this.rSweetMin = 0.42;
    this.rSweetMax = 0.74;
    this.rPerfectRelease = false;
    this.rHoldingKey = false;

    // Omnislash [T] 10-Step Sequence State
    this.omnislashStep = 0;
    this.omnislashTimer = 0;
    this.omnislashTarget = null;

    // Ability Cooldowns (Q, W, E, R, A, S, D, F, T, Z, Space)
    this.cds = {
      q: 0, w: 0, e: 0, r: 0,
      a: 0, s: 0, d: 0, f: 0,
      t: 0, z: 0, space: 0, wakeup: 0
    };
    this.maxCds = {
      q: 5.5,       // [Q] Spin Lunge -> Shoulder Rest Pose (reduces W & A CD by 1.5s)
      w: 9.0,       // [W] Earthbreaker Parabolic Leap & Tectonic Rupture (refreshed by [A] Iron Tackle!)
      e: 7.0,       // [E] Bulwark Guard / Parry Stance (Parry refreshes & empowers [F], refunds 50% of [E] CD)
      r: 10.0,      // [R] Getsuga Crescent Wave (Hold to Charge for Perfect Release!)
      a: 7.0,       // [A] Iron Tackle (Supersonic Rush -> Refreshes & Primes Instant [W])
      s: 8.0,       // [S] Bedrock Drag -> Heavenward Uppercut
      d: 8.0,       // [D] Counter Cleave (Blue Pattern Counter refunds 50% of [D] CD)
      f: 14.0,      // [F] Titan's Wrath (Instantly refreshed & empowered on [E] Parry!)
      t: 180.0,     // [T] Omnislash: Extinction Cleave (3-Minute Ultimate Cooldown + Massive Burst Damage!)
      z: 45.0,      // [Z] Overpower Surge (Requires 100% Overpower Gauge + 45s Cooldown — Non-spammable!)
      space: 5.5,   // [Space] Unstoppable Evade Dash (the only full i-frame tool, so it is meant to be spent carefully)
      wakeup: 20.0  // [Space] while knocked down/back: Wake-Up Roll. Separate cooldown, independent of the dash
    };

    // World-Space 2-Bone IK Foot-Stepping Engine
    this.hipWidth = 10.0;
    this.thighLen = 17.0;          // the legs used to be 39 long under a hip 31 up, so every class stood in a permanent half-crouch; now they fit
    this.shinLen = 17.0;

    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    this.leftFoot = {
      x: this.x + (4 * cosA - (-this.hipWidth) * sinA),
      y: this.y + (4 * sinA + (-this.hipWidth) * cosA),
      z: 0,
      startX: 0, startY: 0, targetX: 0, targetY: 0,
      stepping: false, stepProg: 0, stepDur: 0.26,
      angle: this.facingAngle
    };
    this.rightFoot = {
      x: this.x + (-4 * cosA - (this.hipWidth) * sinA),
      y: this.y + (-4 * sinA + (this.hipWidth) * cosA),
      z: 0,
      startX: 0, startY: 0, targetX: 0, targetY: 0,
      stepping: false, stepProg: 0, stepDur: 0.26,
      angle: this.facingAngle
    };
    this.nextStepFoot = 'left';

    // Secondary Motion Springs & Flowing Cape
    this.pelvisBounceZ = 0;
    this.pelvisVelZ = 0;
    this.pauldronLagZ = 0;
    this.pauldronVelZ = 0;
    this.breathePhase = Math.random() * 6;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.walkWeight = 0;
    this.lastStepHalfCycle = -1;

    this.capeNodes = [];
    for (let i = 0; i < 6; i++) {
      this.capeNodes.push({ x: this.x, y: this.y, z: 46 - i * 6.8 });
    }

    this.swordTrail = new SwordTrailRing(12);
    this.lastTipWorld = null;
    this.leapStartX = x;
    this.leapStartY = y;
    this.leapTargetX = x;
    this.leapTargetY = y;

    this.botDecisionTimer = 0.5;
    this.reviveProgress = 0;

    // Final Phase 5-Key QWER QTE & Abyssal Root State
    this.qteActive = false;
    this.qteSequence = [];
    this.qteIndex = 0;
    this.qteTimer = 0;
    this.qteMaxTimer = 5.0;
    this.botQteStepTimer = 0;
    this.astralStaggerSurge = 0;

    this.rooted = false;
    this.rootStagger = 0;
    this.rootMaxStagger = 140;

    // Final Clash QTE state (shared, class-agnostic): see clash_qte.js
    initClashQteState(this);
  }

  startEclipseQte(dur = 5.0) {
    if (this.hp <= 0) return;
    this.rooted = false;
    this.rootStagger = 0;
    this.state = 'idle';
    this.stateTimer = 0;
    this.jumpZ = 0;
    this.bodySpinAngle = 0;
    this.qteActive = true;
    this.qteMaxTimer = dur;
    this.qteTimer = dur;
    this.qteIndex = 0;
    this.astralStaggerSurge = 0;
    const pool = ['Q', 'W', 'E', 'R'];
    this.qteSequence = [];
    for (let i = 0; i < 5; i++) {
      this.qteSequence.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    this.botQteStepTimer = 0.35 + Math.random() * 0.20;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.targetX = this.x;
    this.targetY = this.y;
  }

  handleEclipseQteKey(keyChar) {
    if (!this.qteActive || this.hp <= 0) return false;
    const k = String(keyChar || '').toUpperCase();
    if (k !== 'Q' && k !== 'W' && k !== 'E' && k !== 'R') return false;

    const expected = this.qteSequence[this.qteIndex];
    if (k === expected) {
      this.qteIndex++;
      if (window.audio && typeof window.audio.playQteKeySound === 'function') {
        window.audio.playQteKeySound(true, this.qteIndex);
      }
      if (this.qteIndex >= this.qteSequence.length) {
        this.qteActive = false;
        this.qteTimer = 0;
        // If playing pure 1v1 solo without bots, grant Astral Echo Stagger Surge on QTE pass so solo players can still pass the Spirit Bomb check!
        const partyLen = (window.game && window.game.party) ? window.game.party.filter(p => p.hp > 0).length : 1;
        if (partyLen <= 1) {
          this.astralStaggerSurge = 12.0;
        }
        if (window.fx) {
          window.fx.addShockwave(this.x, this.y, 105, '#4ade80', 4.5, 0.32);
          window.fx.addFloatingText(this.x, this.y - 82, '✨ ECLIPSE QTE PASSED!', '#4ade80', 16);
        }
      }
    } else {
      // Wrong key pressed -> Rooted immediately!
      if (window.audio && typeof window.audio.playQteKeySound === 'function') {
        window.audio.playQteKeySound(false, 0);
      }
      this.applyEclipseRoot(false);
    }
    return true;
  }

  applyEclipseRoot(fromNetwork = false) {
    if (this.hp <= 0) return;
    this.qteActive = false;
    this.qteTimer = 0;
    this.rooted = true;
    this.rootMaxStagger = 140;
    this.rootStagger = 140;
    this.state = 'idle';
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.targetX = this.x;
    this.targetY = this.y;
    if (window.audio) window.audio.playImpactBoom(1.1);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 95, '#a855f7', 4.5, 0.35);
      window.fx.addFloatingText(this.x, this.y - 78, '⛓️ ABYSSAL ROOT! ALLIES BREAK!', '#f43f5e', 16);
    }
    if (!fromNetwork && window.game && window.game.net && window.game.net.isConnected()) {
      window.game.net.broadcast({
        type: 'player_qte_root',
        targetId: this.id
      });
    }
  }

  damageEclipseRoot(staggerDmg, attacker = null, fromNetwork = false) {
    if (!this.rooted) return;
    const now = performance.now();
    if (!fromNetwork && this._lastRootHitAt && (now - this._lastRootHitAt) < 90) return;
    this._lastRootHitAt = now;
    this.rootStagger = Math.max(0, this.rootStagger - staggerDmg);
    if (window.audio) window.audio.playParryClang(false);
    if (window.fx) {
      window.fx.addDragSparks(this.x, this.y - 22, Math.random() * Math.PI * 2, 7, false, '#c084fc');
    }
    const broken = this.rootStagger <= 0;
    if (!fromNetwork && window.game && window.game.net && window.game.net.isConnected()) {
      window.game.net.broadcast({
        type: 'player_root_hit',
        targetId: this.id,
        dmg: Math.round(staggerDmg),
        broken
      });
    }
    if (broken) {
      this.rooted = false;
      this.rootStagger = 0;
      if (window.audio) window.audio.playParryClang(true);
      if (window.fx) {
        window.fx.addShockwave(this.x, this.y, 120, '#38bdf8', 5, 0.35);
        window.fx.addFloatingText(this.x, this.y - 82, '🔓 ROOT SHATTERED!', '#38bdf8', 16);
      }
    }
  }

  clearEclipseQteAndRoot() {
    this.qteActive = false;
    this.qteTimer = 0;
    this.rooted = false;
    this.rootStagger = 0;
  }

  checkAllyRootRescue(hitX, hitY, radius, staggerAmt) {
    const party = (window.game && window.game.party) ? window.game.party : [];
    for (const p of party) {
      if (!p || p === this || p.hp <= 0 || !p.rooted) continue;
      if (Math.hypot(p.x - hitX, p.y - hitY) <= radius + 45) {
        p.damageEclipseRoot(Math.max(25, staggerAmt * 1.35), this, false);
      }
    }
  }

  getTotalAtk() {
    let atk = this.baseAtk + this.bonusAtk;
    if (this.overpowerSurge) atk *= 1.35;
    return Math.round(atk);
  }

  addOverpower(amount) {
    if (this.overpowerSurge) return;
    // Scale Overpower gauge generation so [Z] Overpower Surge requires earned combat buildup
    const scaled = amount * 0.52;
    this.overpower = Math.min(this.maxOverpower, this.overpower + scaled);
  }

  activateOverpowerSurge() {
    if (this.overpowerSurge || this.overpower < this.maxOverpower || (this.cds.z || 0) > 0) return false;
    this.overpower = 0;
    this.overpowerSurge = true;
    this.surgeTimer = 14.0;
    this.cds.z = this.maxCds.z || 45.0;
    this.shield = Math.min(this.maxHp * 0.45, this.shield + 500);
    audio.playImpactBoom(1.3);
    audio.playParryClang(true);
    if (window.fx) {
      const prevAlly = window.fx.sourceIsAlly;
      window.fx.sourceIsAlly = !this.isLocal;
      window.fx.triggerShake(16, 0.38);
      window.fx.addPillar(this.x, this.y, 38, '#facc15', 0.65);
      window.fx.addShockwave(this.x, this.y, 145, '#facc15', 5);
      window.fx.sourceIsAlly = prevAlly;
    }
    return true;
  }

  getRenderFacingAngle() {
    return this.facingAngle + (this.bodySpinAngle || 0);
  }

  resetCapeNodes() {
    const renderAng = this.getRenderFacingAngle();
    const cosA = Math.cos(renderAng);
    const sinA = Math.sin(renderAng);
    for (let i = 0; i < this.capeNodes.length; i++) {
      const backDist = 6 + i * 4.2;
      this.capeNodes[i].x = this.x - backDist * cosA;
      this.capeNodes[i].y = this.y - backDist * sinA;
      this.capeNodes[i].z = Math.max(4, 44 + this.jumpZ - i * 6.8);
    }
  }

  snapFeetToBody() {
    const renderAng = this.getRenderFacingAngle();
    const cosA = Math.cos(renderAng);
    const sinA = Math.sin(renderAng);
    const airRatio = Math.min(1.0, this.jumpZ / 26.0);
    // When airborne (jumpZ > 0), lift both feet into an athletic bent-knee jump tuck so legs never stretch!
    const lFwd = 4 + airRatio * 3.0;
    const rFwd = -4 - airRatio * 2.5;
    this.leftFoot.x = this.x + (lFwd * cosA - (-this.hipWidth) * sinA);
    this.leftFoot.y = this.y + (lFwd * sinA + (-this.hipWidth) * cosA);
    this.leftFoot.stepping = false;
    this.leftFoot.z = this.jumpZ > 0.5 ? (this.jumpZ + 6.5 * airRatio) : 0;
    this.leftFoot.angle = renderAng;
    this.leftFoot.pitch = airRatio * 0.32;
    this.rightFoot.x = this.x + (rFwd * cosA - (this.hipWidth) * sinA);
    this.rightFoot.y = this.y + (rFwd * sinA + (this.hipWidth) * cosA);
    this.rightFoot.stepping = false;
    this.rightFoot.z = this.jumpZ > 0.5 ? (this.jumpZ + 10.5 * airRatio) : 0;
    this.rightFoot.angle = renderAng;
    this.rightFoot.pitch = airRatio * 0.42;
  }

  syncAirborneFeet() {
    if (this.jumpZ <= 0.5) return;
    const renderAng = this.getRenderFacingAngle();
    const cosA = Math.cos(renderAng);
    const sinA = Math.sin(renderAng);
    const airRatio = Math.min(1.0, this.jumpZ / 26.0);
    // Athletic airborne martial jump pose: lead knee tucked forward/high, trail leg tucked back!
    const lFwd = 6.5 * airRatio;
    const rFwd = -6.0 * airRatio;
    this.leftFoot.x = this.x + (lFwd * cosA - (-this.hipWidth) * sinA);
    this.leftFoot.y = this.y + (lFwd * sinA + (-this.hipWidth) * cosA);
    this.leftFoot.z = this.jumpZ + 6.5 * airRatio;
    this.leftFoot.stepping = false;
    this.leftFoot.angle = renderAng;
    this.leftFoot.pitch = 0.32 * airRatio;

    this.rightFoot.x = this.x + (rFwd * cosA - (this.hipWidth) * sinA);
    this.rightFoot.y = this.y + (rFwd * sinA + (this.hipWidth) * cosA);
    this.rightFoot.z = this.jumpZ + 10.5 * airRatio;
    this.rightFoot.stepping = false;
    this.rightFoot.angle = renderAng;
    this.rightFoot.pitch = 0.42 * airRatio;
  }

  lungeFootForward(foot, fwdDist, sideDist, dur = 0.16) {
    const renderAng = this.getRenderFacingAngle();
    const cosA = Math.cos(renderAng);
    const sinA = Math.sin(renderAng);
    foot.stepping = true;
    foot.stepProg = 0;
    foot.stepDur = dur;
    foot.startX = foot.x;
    foot.startY = foot.y;
    foot.targetX = this.x + (fwdDist * cosA - sideDist * sinA);
    foot.targetY = this.y + (fwdDist * sinA + sideDist * cosA);
  }

  canAct() {
    if (this.hp <= 0 || this.state === 'dead') return false;
    if (this.rooted || this.qteActive || this.clashQteActive || this.state === 'grabbed' || this.state === 'clash_lock') return false;
    if (this.state === 'hit_stagger' || this.state === 'hit_knockback' || this.state === 'hit_knockdown' || this.state === 'wakeup_roll') {
      return false;
    }
    if (this.state === 'q_recover' && this.stateTimer < 0.35) return true;
    // Cancel windows: once the hit of these moves has landed, the second half of the animation is only recovery, so the next
    // skill may start right away. This is what makes a chain flow instead of waiting out every swing.
    if (this.stateHitDone && this.stateDuration > 0 && this.stateTimer < this.stateDuration * 0.5 &&
        (this.state === 'combo' || this.state === 'w_slam' || this.state === 's_uppercut' || this.state === 'a_tackle' || this.state === 's_drag')) return true;
    return this.state === 'idle' || this.state === 'walk';
  }

  setMoveTarget(tx, ty) {
    if (this.hp <= 0 || this.rooted || this.qteActive || this.clashQteActive || this.state === 'grabbed' || this.state === 'clash_lock') return;
    this.targetX = tx;
    this.targetY = ty;
  }

  // -------------------------------------------------------------------------
  // POSITIONAL DAMAGE, GREATSWORD CLASH, & NATURAL BOSS HIT-IMPULSE
  // -------------------------------------------------------------------------
  computePositionalBonus(boss, isHeadSkill = false) {
    if (!boss) return { mult: 1.0, type: 'normal', color: '#f8fafc', staggerMult: 1.0 };
    const angleFromBossToPlayer = Math.atan2(this.y - boss.y, this.x - boss.x);
    let diff = angleFromBossToPlayer - boss.facingAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    const absDiff = Math.abs(diff);

    if (absDiff < 0.95) {
      return {
        mult: isHeadSkill ? 1.35 : 1.20,
        type: 'head',
        color: '#38bdf8',
        staggerMult: 1.45
      };
    }
    if (absDiff > Math.PI - 1.15) {
      return {
        mult: 1.25,
        type: 'back',
        color: '#fb923c',
        critBonus: (window.HIT_POSITION && window.HIT_POSITION.backCrit) || 0.30,
        staggerMult: 1.15
      };
    }
    return { mult: 1.0, type: 'normal', color: '#f8fafc', staggerMult: 1.0 };
  }

  dealHitToBoss(boss, coeff, skillName, isHeadSkill = false, staggerAmt = 18, applyFracture = false, hitOpts = null) {
    // Always check if our swing also hits a nearby rooted teammate to free them!
    // (Remote swings skip this: their owner sends the authoritative player_root_hit.)
    if (!this.isRemote) this.checkAllyRootRescue(
      this.x + Math.cos(this.facingAngle) * 45,
      this.y + Math.sin(this.facingAngle) * 45 * PERSPECTIVE_TILT,
      155,
      staggerAmt
    );
    if (!boss || boss.hp <= 0) return 0;
    // a boss can be out of reach for a moment (Ignis hiding among her decoys): no damage, no number, no hit spark
    if (typeof boss.isUntargetable === 'function' && boss.isUntargetable(this)) return 0;
    const prevAlly = window.fx ? window.fx.sourceIsAlly : false;
    if (window.fx) window.fx.sourceIsAlly = !this.isLocal;
    try {
      const opts = hitOpts || {};
      // FRONT / BACK skills (see window.HIT_POSITION in hud_skills.js): a FRONT skill gets the front bonus (damage + stagger) when it lands
      // from the boss's front, a BACK skill gets its bigger crit chance (and damage / stagger) from behind and cannot crack pauldrons.
      // Every other hit is neutral from any side, but still reports where it landed (pauldron part-break geometry).
      const HP = window.HIT_POSITION || { baseBonus: 1, front: /$^/, back: /$^/ };
      const kind = (isHeadSkill && HP.front.test(skillName)) ? 'front' : (HP.back.test(skillName) ? 'back' : null);
      const pos0 = this.computePositionalBonus(boss, true);
      const neutral = { mult: 1.0, type: pos0.type, color: '#f8fafc', staggerMult: 1.0 };
      const pos = kind === 'front' ? (pos0.type === 'head' ? pos0 : neutral) : (kind === 'back' ? (pos0.type === 'back' ? pos0 : neutral) : neutral);
      const critChance = this.critRate + (pos.critBonus || 0) + (this.overpowerSurge ? 0.20 : 0) + (this.overloadTimer > 0 ? 0.20 : 0)   // Gravebreaker Overload: +20% crit
        + (typeof this.passiveCrit === 'function' ? this.passiveCrit() : 0);
      const isCrit = opts.forceCrit || (Math.random() < Math.min(1, critChance));
      const overCrit = Math.max(0, critChance - 1) * 2;      // crit chance above 100% is not wasted: it becomes crit damage at double value (101% crit = 100% crit and +2% crit damage)
      const outMult = typeof this.outDmgMult === 'function' ? this.outDmgMult(boss) : 1;     // timed / conditional damage bonuses from accessories
      let dmg = this.getTotalAtk() * coeff * pos.mult * HP.baseBonus * outMult * (isCrit ? 1.85 + (this.critDmgBonus || 0) + overCrit : 1.0);
      if (boss.state === 'staggered') dmg *= 1.60;
      if (boss.state === 'flinched') dmg *= 1.20;
      dmg = Math.round(dmg * (0.95 + Math.random() * 0.10));

      if (applyFracture) {
        // Fracture <-> Overpower loop: every new stack feeds the gauge; during Surge each hit lays 2 stacks.
        const beforeStacks = boss.fractureStacks || 0;
        boss.fractureStacks = Math.min(3, beforeStacks + (this.overpowerSurge ? 2 : 1));
        const gained = boss.fractureStacks - beforeStacks;
        if (gained > 0) this.addOverpower(gained * 9);
      }

      // Greatsword Clash Check: If player swings a heavy attack head-on while Vaelgor is swinging a melee attack!
      if (
        pos.type === 'head' &&
        opts.isStrongMove &&
        (boss.state === 'uppercut' || boss.state === 'cleave' || boss.state === 'thrust')
      ) {
        audio.playParryClang(true);
        this.addOverpower(18);
        if (window.fx) {
          const clashX = (this.x + boss.x) * 0.5;
          const clashY = (this.y + boss.y) * 0.5 - 28;
          window.fx.triggerHitstop(55);
          window.fx.addShockwave(clashX, clashY, 92, '#fde047', 4.5, 0.30);
          window.fx.addDragSparks(clashX, clashY, this.facingAngle, 16, false, '#fde047');
          window.fx.addImpactStarburst(clashX, clashY, 96, '#fde047', 8, Math.random() * Math.PI, 0.28);
          window.fx.addLightningBolt(clashX - 38, clashY - 65, clashX, clashY, '#fde047', 3.0, 0.24);
          if (this.isLocal) window.fx.triggerImpactFrame('#fde047', 0.14);
        }
      }

      // Compute exact world-space strike point along the player's weapon arc for positional Pauldron Hitscan
      const distToBoss = Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT);
      const strikeReach = Math.min(distToBoss, 56);
      const hitX = opts.hitX !== undefined ? opts.hitX : (this.x + Math.cos(this.facingAngle) * strikeReach);
      const hitY = opts.hitY !== undefined ? opts.hitY : (this.y + Math.sin(this.facingAngle) * strikeReach * PERSPECTIVE_TILT);

      const finalStaggerAmt = staggerAmt * (pos.staggerMult || 1.0) * (this.astralStaggerSurge > 0 ? 2.6 : 1.0);
      boss.receiveDamage(dmg, finalStaggerAmt, this, {
        isStrongMove: !!opts.isStrongMove,
        impulseStrength: opts.impulseStrength || (opts.isStrongMove ? 1.3 : 0.75),
        posType: pos.type,
        partBreakMult: kind === 'back' ? 0 : (opts.partBreakMult !== undefined ? opts.partBreakMult : (opts.isStrongMove ? 1.0 : 0)),   // BACK skills never crack pauldrons
        hitX,
        hitY,
        skill: skillName,      // for the detailed damage chart (raid_stats.js)
        crit: !!isCrit
      });

      // Meaty Hit-Confirm Audio + Camera Zoom-Punch & Starburst Flare on Heavy Critical Impacts!
      audio.playHitConfirm({
        isCrit,
        isHeavy: !!opts.isStrongMove,
        posType: pos.type
      });
      if (window.fx) {
        const flareR = opts.isStrongMove ? (isCrit ? 82 : 60) : (isCrit ? 52 : 36);
        const flareCol = isCrit ? '#fde047' : pos.color;
        window.fx.addImpactStarburst(hitX, hitY - 26, flareR, flareCol, (isCrit && opts.isStrongMove) ? 8 : 4, this.facingAngle + 0.35, 0.20);
        if (isCrit && opts.isStrongMove) {
          window.fx.addLightningBolt(hitX + (Math.random() - 0.5) * 45, hitY - 115, hitX, hitY - 24, '#fde047', 2.8, 0.22);
          if (this.isLocal) {
            window.fx.triggerZoomPunch(0.045);
            window.fx.triggerImpactFrame('#fbbf24', 0.12);
          }
        }
      }

      // Clean, Minimalist Damage Numbers ("Less is More" — Color & Size communicate Crit/Back/Head naturally!)
      if (window.fx) {
        const text = `${isCrit ? '💥 ' : ''}${dmg.toLocaleString()}`;
        const col = isCrit ? '#facc15' : pos.color;
        window.fx.addFloatingText(boss.x + (Math.random() - 0.5) * 30, boss.y - 72, text, col, isCrit ? 17 : 14);
      }
      return dmg;
    } finally {
      if (window.fx) window.fx.sourceIsAlly = prevAlly;
    }
  }

  takeDamage(rawAmount, sourceName = 'Attack', impactOpts = null) {
    // Remote co-op players own their HP: their own client resolves boss hits (with their real i-frames/parry state)
    // and reports hp via player_state. Damaging the proxy here only causes fake deaths, knockback jitter and target flicker.
    if (this.isRemote) return;
    const prevAlly = window.fx ? window.fx.sourceIsAlly : false;
    if (window.fx) window.fx.sourceIsAlly = !this.isLocal;
    try {
      const opts = impactOpts || {};
      if (opts.forceLethal && this.hp > 0) {
        this.shield = 0;
        this.hp = 0;
        this.state = 'dead';
        this.jumpZ = 0;
        this.bodySpinAngle = 0;
        if (window.fx) {
          if (this.isLocal) {
            window.fx.triggerHitstop(85);
            window.fx.triggerShake(24, 0.5);
          }
          window.fx.addShockwave(this.x, this.y, 125, '#f43f5e', 5.5);
          window.fx.addFloatingText(this.x, this.y - 68, `-99,999`, '#fb7185', 17);
        }
        return;
      }

      if (
        this.hp <= 0 ||
        this.state === 'space_dash' ||
        this.state === 'wakeup_roll' ||
        this.state === 't_thrust' ||
        this.state === 't_cinematic' ||
        this.state === 'clash_lock'
      ) {
        return;
      }

      const power = opts.power || (rawAmount >= 275 ? 'heavy' : (rawAmount >= 195 ? 'medium' : 'light'));
      let pushAng = this.facingAngle + Math.PI;
      if (opts.sourceX !== undefined && opts.sourceY !== undefined) {
        pushAng = Math.atan2((this.y - opts.sourceY) / PERSPECTIVE_TILT, this.x - opts.sourceX);
      }
      const pushCos = Math.cos(pushAng);
      const pushSin = Math.sin(pushAng);

      // [E] PARRY STANCE: Parries incoming attack, negates damage/knockdown, resets [F] cooldown & empowers [F] Titan's Wrath!
      if (this.state === 'e_bulwark') {
        audio.playParryClang(true);
        audio.playSwordPlant();
        this.addOverpower(35);
        this.parryRipostePrimed = 8.0;
        this.cds.f = 0; // Instantly refreshes [F] Titan's Wrath so you can riposte immediately!
        this.cds.e = Math.min(this.cds.e, this.maxCds.e * 0.5); // Refunds 50% of [E]'s cooldown on successful parry!
        this.shield = Math.min(this.maxHp * 0.5, this.shield + 360);

        const guardSlide = (power === 'heavy' || power === 'cataclysm') ? 250 : 155;
        this.kbVx = pushCos * guardSlide;
        this.kbVy = pushSin * guardSlide * PERSPECTIVE_TILT;
        this.pelvisVelZ -= 38;
        this.pauldronVelZ -= 48;

        if (window.fx) {
          if (this.isLocal) {
            window.fx.triggerHitstop(70);
            window.fx.triggerShake(14, 0.26);
            window.fx.triggerZoomPunch(0.06);
            window.fx.triggerScreenFlash('#fde047', 0.18);
          }
          window.fx.addShockwave(this.x, this.y, 135, '#facc15', 5.5);
          window.fx.addShockwave(this.x, this.y, 90, '#38bdf8', 4);
          window.fx.addDragSparks(this.x, this.y, pushAng + Math.PI, 18, false, '#facc15');
          window.fx.addFloatingText(this.x, this.y - 72, '⚡ PARRY!', '#fde047', 14);
        }
        return;
      }

      // Check Tenacity / Super Armor on heavy commitment skills ([F] Titan's Wrath, [W] Earthbreaker, [A] Iron Tackle, [R] Slash)
      const hasSuperArmor = (
        this.state === 'f_wrath' ||
        this.state === 'w_leap' ||
        this.state === 'w_slam' ||
        this.state === 'a_tackle' ||
        this.state === 'r_slash'
      );

      const defReduction = Math.min(0.65, this.bonusDef / (this.bonusDef + 250));
      const hyperArmorMult = hasSuperArmor ? 0.55 : 1.0;
      let dmg = Math.max(1, Math.round(rawAmount * (1 - defReduction) * hyperArmorMult * (1 - (this.dmgReduction || 0))));   // dmgReduction: enhanced armor (reforge.js)

      if (this.shield > 0) {
        const absorbed = Math.min(this.shield, dmg);
        this.shield -= absorbed;
        dmg -= absorbed;
      }

      this.hp = Math.max(0, this.hp - dmg);

      if (this.hp <= 0) {
        this.state = 'dead';
        this.jumpZ = 0;
        this.bodySpinAngle = 0;
        return;
      }

      // =========================================================================
      // TIERED IMPACT WEIGHT & KNOCKBACK / PUSH / KNOCKDOWN SYSTEM
      // =========================================================================
      if (hasSuperArmor && power !== 'cataclysm') {
        const tenSlide = power === 'heavy' ? 160 : 90;
        this.kbVx = pushCos * tenSlide;
        this.kbVy = pushSin * tenSlide * PERSPECTIVE_TILT;
        this.pelvisVelZ -= 26;
        if (window.fx) {
          window.fx.addDragSparks(this.x, this.y - 22, pushAng, 8, true);
          window.fx.addFloatingText(this.x, this.y - 58, `-${dmg}`, '#fde047', 13);
        }
        return;
      }

      this.facingAngle = pushAng + Math.PI;
      this.bodySpinAngle = 0;
      this.swordScale = 1.0;
      this.rHoldingKey = false;

      if (power === 'heavy' || power === 'cataclysm') {
        // TIER 3: HEAVY / CATACLYSM -> FULL 2.5D AIRBORNE LAUNCH & PRONE KNOCKDOWN!
        const launchSpd = opts.pushDist ? opts.pushDist * 3.1 : (power === 'cataclysm' ? 590 : 450);
        this.kbVx = pushCos * launchSpd;
        this.kbVy = pushSin * launchSpd * PERSPECTIVE_TILT;
        this.state = 'hit_knockdown';
        this.stateDuration = 1.38 * (1 - (this.wakeRecovery || 0));      // enhanced armor gets you up sooner
        this.stateTimer = this.stateDuration;
        this.knockdownBounced = false;
        this.jumpZ = 14;
        this.targetX = this.x;
        this.targetY = this.y;

        audio.playImpactBoom(1.25);
        if (window.fx) {
          if (this.isLocal) {
            window.fx.triggerHitstop(65);
            window.fx.triggerShake(18, 0.36);
          }
          window.fx.addShockwave(this.x, this.y, 95, '#f43f5e', 4.5);
          window.fx.addDragSparks(this.x, this.y - 25, pushAng, 16, true);
          window.fx.addFloatingText(this.x, this.y - 66, `-${dmg}`, '#fb7185', 15);
        }
      } else if (power === 'medium') {
        // TIER 2: MEDIUM -> HEAVY SLIDING KNOCKBACK RECOIL!
        const slideSpd = opts.pushDist ? opts.pushDist * 3.8 : 390;
        this.kbVx = pushCos * slideSpd;
        this.kbVy = pushSin * slideSpd * PERSPECTIVE_TILT;
        this.state = 'hit_knockback';
        this.stateDuration = 0.46;
        this.stateTimer = 0.46;
        this.jumpZ = 0;
        this.targetX = this.x;
        this.targetY = this.y;
        this.pelvisVelZ -= 38;
        this.pauldronVelZ -= 48;

        audio.playImpactBoom(0.95);
        if (window.fx) {
          if (this.isLocal) {
            window.fx.triggerHitstop(42);
            window.fx.triggerShake(11, 0.22);
          }
          window.fx.addStepDust(this.x, this.y, 8);
          window.fx.addDragSparks(this.x, this.y - 25, pushAng, 10, true);
          window.fx.addFloatingText(this.x, this.y - 62, `-${dmg}`, '#f43f5e', 14);
        }
      } else {
        // TIER 1: LIGHT -> PHYSICAL PUSH SLIDE & BRIEF STAGGER FLINCH!
        const pushSpd = opts.pushDist ? opts.pushDist * 3.5 : 240;
        this.kbVx = pushCos * pushSpd;
        this.kbVy = pushSin * pushSpd * PERSPECTIVE_TILT;
        this.pelvisVelZ -= 24;
        this.pauldronVelZ -= 32;

        if (this.state === 'idle' || this.state === 'walk') {
          this.state = 'hit_stagger';
          this.stateDuration = 0.25;
          this.stateTimer = 0.25;
          this.targetX = this.x;
          this.targetY = this.y;
        }
        if (window.fx) {
          if (this.isLocal) window.fx.triggerShake(6, 0.14);
          window.fx.addStepDust(this.x, this.y, 5);
          window.fx.addDragSparks(this.x, this.y - 25, pushAng, 6, true);
          window.fx.addFloatingText(this.x, this.y - 58, `-${dmg}`, '#f43f5e', 13);
        }
      }
    } finally {
      if (window.fx) window.fx.sourceIsAlly = prevAlly;
    }
  }

  // -------------------------------------------------------------------------
  // ORIGINAL BREAKER ABILITIES REBUILT FOR WEIGHTY 2.5D
  // -------------------------------------------------------------------------
  triggerBasicAttack(aimX, aimY, fromNetwork = false) {
    // Network replays are authoritative: the owner already passed these gates, so a proxy whose local
    // timers drifted must not drop the swing (it would vanish from everyone else's screen).
    if (fromNetwork && this.hp > 0 && !this.canAct()) this.state = 'idle';
    // No queueing: the next swing only starts once the current one has finished (skills can still cancel an auto after its hit).
    if (!fromNetwork && this.state === 'combo') return false;
    if (!this.canAct()) return false;
    this.comboAimX = aimX;
    this.comboAimY = aimY;
    this.facingAngle = Math.atan2((aimY - this.y) / PERSPECTIVE_TILT, aimX - this.x);
    this.bodySpinAngle = 0;
    this.comboStep = (this.comboStep % 5) + 1;
    this.comboResetTimer = 2.0;
    this.state = 'combo';
    const spd = this.overpowerSurge ? 1.25 : this.atkSpeedMult;
    this.stateDuration = (this.comboStep === 5 ? 0.62 : (this.comboStep === 4 ? 0.48 : 0.42)) / spd;
    this.stateTimer = this.stateDuration;
    this.stateHitDone = false;

    // Natural forward step-in velocity on each swing instead of static swinging!
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    const stepBurst = (this.comboStep === 5) ? 210 : (this.comboStep === 4 ? 175 : 135);
    this.attackStepVx = cosA * stepBurst;
    this.attackStepVy = sinA * stepBurst * PERSPECTIVE_TILT;

    const foot = (this.comboStep % 2 === 1) ? this.leftFoot : this.rightFoot;
    const side = (this.comboStep % 2 === 1) ? -this.hipWidth - 2 : this.hipWidth + 2;
    this.lungeFootForward(foot, 15, side, 0.14);
    audio.playSwordSlash(this.comboStep >= 4);
    if (this.isLocal && this.comboStep === 5) {
      audio.playBreakerGrunt(false);
    }
    return true;
  }

  // Called on keyup('r') so the player can release inside the Sweet-Spot!
  releaseSkill(key) {
    const k = key.toLowerCase();
    if (k === 'r' && this.state === 'r_charge') {
      this.rHoldingKey = false;
      if (this.rChargeTime >= 0.18) {
        this.fireCrescentWaveSlash();
      }
    }
  }

  fireCrescentWaveSlash(fromNetwork = false) {
    if (this.state !== 'r_charge') return;
    const prevAlly = window.fx ? window.fx.sourceIsAlly : false;
    if (window.fx) window.fx.sourceIsAlly = !this.isLocal;
    try {
      if (!fromNetwork && this.isLocal && window.game && window.game.net) {
        window.game.net.broadcast({
          type: 'player_skill_release',
          skill: 'r',
          rChargeTime: Number(this.rChargeTime.toFixed(3)),
          facingAngle: Number(this.facingAngle.toFixed(3))
        });
      }
      // During Overpower Surge every Crescent Wave is a perfect release (the gauge's power does the timing for you).
      const isSweetSpot = this.overpowerSurge || (this.rChargeTime >= this.rSweetMin && this.rChargeTime <= this.rSweetMax);
      this.rPerfectRelease = isSweetSpot;
      this.state = 'r_slash';
      this.stateDuration = 0.34;
      this.stateTimer = 0.34;
      this.swordScale = isSweetSpot ? 1.72 : 1.52;

      const cosA = Math.cos(this.facingAngle);
      const sinA = Math.sin(this.facingAngle);
      this.attackStepVx = cosA * (isSweetSpot ? 260 : 190);
      this.attackStepVy = sinA * (isSweetSpot ? 260 : 190) * PERSPECTIVE_TILT;
      this.lungeFootForward(this.leftFoot, 18, -this.hipWidth - 3, 0.15);

      audio.playSwordSlash(true, isSweetSpot ? 1.45 : 1.20);
      audio.playImpactBoom(isSweetSpot ? 1.40 : 1.05);
      if (this.isLocal) audio.playBreakerGrunt(isSweetSpot);
      if (isSweetSpot) {
        audio.playParryClang(true);
        if (this.isLocal && window.fx) {
          window.fx.triggerZoomPunch(0.055);
        }
      }

      if (window.fx) {
        window.fx.triggerHitstop(isSweetSpot ? 75 : 45);
        window.fx.triggerShake(isSweetSpot ? 18 : 12, 0.28);
        window.fx.spawnCrescentWave(
          this.x + cosA * 34,
          this.y + sinA * 34 * PERSPECTIVE_TILT,
          this.facingAngle,
          this.getTotalAtk() * (isSweetSpot ? 4.10 : 2.75),
          isSweetSpot ? 54 : 36,
          this,
          false,
          isSweetSpot
        );
        window.fx.addDimensionalSlash(
          this.x - sinA * 72 + cosA * 15,
          this.y + cosA * 72 * PERSPECTIVE_TILT,
          this.x + sinA * 72 + cosA * 105,
          this.y - cosA * 72 * PERSPECTIVE_TILT,
          isSweetSpot ? '#facc15' : '#38bdf8',
          0.58
        );
        if (isSweetSpot) {
          window.fx.addShockwave(this.x, this.y, 125, '#facc15', 5, 0.36);
        }
      }
    } finally {
      if (window.fx) window.fx.sourceIsAlly = prevAlly;
    }
  }

  triggerSkill(key, aimX, aimY, boss = null, fromNetwork = false) {
    if (this.hp <= 0 || this.state === 'grabbed' || this.state === 'clash_lock' || this.clashQteActive) return false;
    const prevAlly = window.fx ? window.fx.sourceIsAlly : false;
    if (window.fx) window.fx.sourceIsAlly = !this.isLocal;
    try {
      const k = key.toLowerCase();
      // Network replays bypass the proxy's drifted cooldowns / action locks (the owner already validated the cast).
      if (fromNetwork) {
        this.cds[k] = 0;
        if (k === 'z') this.overpower = this.maxOverpower;
        const knockedDown = this.state === 'hit_knockdown' || this.state === 'hit_knockback';
        if (!this.canAct() && !knockedDown && this.state !== 'r_charge') this.state = 'idle';
      }
      if (k === 'z') return this.activateOverpowerSurge();

      // Ignore key-repeat while already holding [R] charge
      if (k === 'r' && this.state === 'r_charge') return false;

      // [Space] Wake-Up Roll when Knocked Down or Knocked Back!
      if (k === 'space' && (this.state === 'hit_knockdown' || this.state === 'hit_knockback')) {
        // Wake-up roll has its own cooldown and never touches the Space dash cooldown. While it recharges you stay down.
        if (this.cds.wakeup > 0) return false;
        this.cds.wakeup = this.maxCds.wakeup * (1 - (this.wakeRecovery || 0));
        this.facingAngle = Math.atan2((aimY - this.y) / PERSPECTIVE_TILT, aimX - this.x);
        this.bodySpinAngle = 0;
        this.kbVx = 0;
        this.kbVy = 0;
        this.jumpZ = 0;
        this.state = 'wakeup_roll';
        this.stateDuration = 0.34;
        this.stateTimer = 0.34;
        this.stateHitDone = false;
        audio.playSwordSlash(false, 1.3);
        if (window.fx) {
          window.fx.addShockwave(this.x, this.y, 70, '#38bdf8', 3.5);
          window.fx.addAfterimage(this.x, this.y, this.facingAngle, '#38bdf8');
        }
        return true;
      }

      if (this.cds[k] > 0 && !(k === 'w' && this.tackleComboPrimed > 0)) return false;
      const canCounterCancel = (
        k === 'd' &&
        !this.rooted &&
        !this.qteActive &&
        this.state !== 'dead' &&
        this.state !== 'grabbed' &&
        this.state !== 'hit_knockdown' &&
        this.state !== 'hit_knockback' &&
        this.state !== 't_thrust' &&
        this.state !== 't_cinematic'
      );
      if (k !== 'space' && !this.canAct() && !(k === 'w' && this.tackleComboPrimed > 0) && !canCounterCancel) return false;
      if (this.hp <= 0 || this.state === 'hit_knockdown' || this.state === 'grabbed') return false;

      this.facingAngle = Math.atan2((aimY - this.y) / PERSPECTIVE_TILT, aimX - this.x);
      this.bodySpinAngle = 0;
      const cosA = Math.cos(this.facingAngle);
      const sinA = Math.sin(this.facingAngle);

      // [Space] Unstoppable Evade Dash
      if (k === 'space') {
        this.cds.space = this.maxCds.space;
        this.kbVx = 0;
        this.kbVy = 0;
        this.state = 'space_dash';
        this.stateDuration = 0.32;
        this.stateTimer = this.stateDuration;
        this.stateHitDone = false;
        this.jumpZ = 0;
        audio.playSwordSlash(false);
        if (window.fx) {
          window.fx.addAfterimage(this.x, this.y, this.facingAngle, '#38bdf8');
        }
        return true;
      }

      // [Q] SPIN LUNGE -> FULL-BODY 720° WHIRLWIND -> WEIGHTY SLAM -> SHOULDER-REST POSE!
      if (k === 'q') {
        this.cds.q = this.maxCds.q;
        this.cds.w = Math.max(0, this.cds.w - 1.5);
        this.cds.a = Math.max(0, this.cds.a - 1.5);
        this.state = 'q_windup';
        this.stateDuration = 0.22;
        this.stateTimer = 0.22;
        this.stateHitDone = false;
        this.spinHitThrottle = 0;
        this.addOverpower(15);
        this.lungeFootForward(this.rightFoot, -12, this.hipWidth + 4, 0.16);
        audio.playSwordSlash(false, 0.75);
        return true;
      }

      // [W] EARTHBREAKER — PARABOLIC JUMP & TECTONIC EARTH RUPTURE!
      if (k === 'w') {
        this.cds.w = this.maxCds.w;
        const isTackleCombo = this.tackleComboPrimed > 0;
        this.tackleComboPrimed = 0;
        this.isTackleComboW = isTackleCombo;
        this.state = 'w_leap';
        this.stateDuration = isTackleCombo ? 0.36 : 0.48;
        this.stateTimer = this.stateDuration;
        this.stateHitDone = false;
        this.leapStartX = this.x;
        this.leapStartY = this.y;
        const maxRange = isTackleCombo ? 310 : 240;
        const dist = Math.max(45, Math.min(maxRange, Math.hypot(aimX - this.x, aimY - this.y)));
        this.leapTargetX = this.x + cosA * dist;
        this.leapTargetY = this.y + sinA * dist * PERSPECTIVE_TILT;
        this.addOverpower(20);
        audio.playSwordSlash(true, 1.2);
        if (this.isLocal) audio.playBreakerGrunt(false);
        if (window.fx) {
          window.fx.addShockwave(this.x, this.y, 75, '#f59e0b', 4);
        }
        return true;
      }

      // [E] PARRY STANCE (Braces Greatsword Across Chest — Parrying an attack refreshes & empowers [F] Titan's Wrath!)
      if (k === 'e') {
        this.cds.e = this.maxCds.e;
        this.state = 'e_bulwark';
        this.stateDuration = 0.95;
        this.stateTimer = 0.95;
        this.stateHitDone = false;
        this.lungeFootForward(this.leftFoot, 14, -this.hipWidth - 4, 0.15);
        this.lungeFootForward(this.rightFoot, -12, this.hipWidth + 4, 0.15);
        audio.playParryClang(false);
        if (window.fx) {
          window.fx.addShockwave(this.x, this.y, 75, '#38bdf8', 3.5);
        }
        return true;
      }

      // [R] GETSUGA / CRESCENT WAVE — HOLD TO CHARGE FOR SWEET-SPOT PERFECT RELEASE!
      if (k === 'r') {
        this.cds.r = this.maxCds.r;
        this.state = 'r_charge';
        this.rChargeTime = 0;
        this.rPerfectRelease = false;
        this.rHoldingKey = !this.isBot;
        this.stateDuration = this.rMaxCharge;
        this.stateTimer = this.rMaxCharge;
        this.stateHitDone = false;
        this.lungeFootForward(this.rightFoot, -14, this.hipWidth + 4, 0.2);
        audio.playSwordSlash(false, 0.7);
        return true;
      }

      // [A] IRON TACKLE (Supersonic Shoulder Rush with Mach Rings -> Refreshes & Primes Instant [W])
      if (k === 'a') {
        this.cds.a = this.maxCds.a;
        this.cds.w = 0; // Refreshes [W] cooldown so the [A] -> [W] combo is always ready!
        this.addOverpower(25);
        this.tackleComboPrimed = 3.2; // Primes instant Earthbreaker [W]!
        this.state = 'a_tackle';
        this.stateDuration = 0.26;
        this.stateTimer = 0.26;
        this.stateHitDone = false;

        const startX = this.x;
        const startY = this.y;
        const rushDist = 185;
        const endX = this.x + cosA * rushDist;
        const endY = this.y + sinA * rushDist * PERSPECTIVE_TILT;

        audio.playImpactBoom(1.0);
        audio.playParryClang(false);

        if (window.fx) {
          window.fx.addSonicBoomRings(startX, startY, endX, endY, 6, '#38bdf8');
          window.fx.addScorchSegment(startX, startY, endX, endY, false);
          for (let f = 1; f <= 3; f++) {
            const frac = f / 3.5;
            window.fx.addAfterimage(
              startX + (endX - startX) * frac,
              startY + (endY - startY) * frac,
              this.facingAngle,
              '#38bdf8'
            );
          }
        }
        return true;
      }

      // [S] BEDROCK UPPERCUT (Drags Greatsword Tip Through Stone -> Vaulting Skyward Slice!)
      if (k === 's') {
        this.cds.s = this.maxCds.s;
        this.addOverpower(25);
        this.state = 's_drag';
        this.stateDuration = 0.30;
        this.stateTimer = 0.30;
        this.stateHitDone = false;
        audio.playSwordSlash(false, 0.85);
        return true;
      }

      // [D] COUNTER SKILL (Lost Ark-Style Blue Pattern Counter & Heavy Anime X-Cut!)
      if (k === 'd') {
        this.cds.d = this.maxCds.d;
        this.addOverpower(30);
        this.state = 'd_cleave1';
        this.stateDuration = 0.36;
        this.stateTimer = 0.36;
        this.stateHitDone = false;
        this.dCounterTriggered = false;
        this.lungeFootForward(this.leftFoot, 16, -this.hipWidth - 4, 0.16);
        audio.playSwordSlash(true, 1.15);
        audio.playParryClang(true);
        if (this.isLocal) audio.playBreakerGrunt(false);

        if (window.fx) {
          window.fx.addDimensionalSlash(
            this.x - sinA * 65 + cosA * 20,
            this.y + cosA * 65 * PERSPECTIVE_TILT + sinA * 20 * PERSPECTIVE_TILT,
            this.x + sinA * 65 + cosA * 125,
            this.y - cosA * 65 * PERSPECTIVE_TILT + sinA * 125 * PERSPECTIVE_TILT,
            '#38bdf8',
            0.6
          );
        }

        // Immediate Counter Check if Boss is in Blue Counter-Flash Window!
        if (boss && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 205) {
          this.dCounterTriggered = true;
          this.executeBreakerCounterSuccess(boss);
        }
        return true;
      }

      // [F] TITAN'S WRATH (Empowered by [E] Parry for +50% Crit Riposte & Faster Slam!)
      if (k === 'f') {
        this.cds.f = this.maxCds.f;
        this.titanIsRiposte = this.parryRipostePrimed > 0;
        this.titanIsSurge = this.overpowerSurge;
        this.parryRipostePrimed = 0;

        this.state = 'f_wrath';
        const dur = this.titanIsRiposte ? 0.82 : 1.08;
        this.stateDuration = dur;
        this.stateTimer = dur;
        this.stateHitDone = false;
        this.titanSwung = false;
        this.lungeFootForward(this.leftFoot, 15, -this.hipWidth - 4, 0.2);
        this.lungeFootForward(this.rightFoot, -13, this.hipWidth + 4, 0.2);
        audio.playImpactBoom(1.1);
        if (this.isLocal) audio.playBreakerGrunt(true);
        if (this.titanIsRiposte) {
          audio.playParryClang(true);
        }
        return true;
      }

      // [T] OMNISLASH: EXTINCTION CLEAVE (Vindictus-Style Ultimate — Holds Boss + Leaves 4.0s Downed Window!)
      if (k === 't') {
        this.cds.t = this.maxCds.t;
        this.state = 't_thrust';
        this.stateDuration = 0.32;
        this.stateTimer = 0.32;
        this.stateHitDone = false;
        // Record the exact cast angle from where the Breaker initiated [T] through the boss!
        this.omnislashCastAngle = boss
          ? Math.atan2((boss.y - this.y) / PERSPECTIVE_TILT, boss.x - this.x)
          : this.facingAngle;
        audio.playSwordSlash(true, 1.4);
        if (this.isLocal) audio.playBreakerGrunt(true);
        this.omnislashBounce = false;
        // the shared hold rule: a boss in a mechanic cannot be pinned. The dash still goes out; if it meets the boss it bounces off
        // (half the cooldown back, see t_thrust), and if it never reaches the boss the full cooldown stays spent.
        if (!ultHoldBlocked(boss) && boss && typeof boss.lockInPlaceForUltimate === 'function' && Math.hypot(boss.x - this.x, boss.y - this.y) < 340) {
          boss.lockInPlaceForUltimate(2.15, 4.0, this.isRemote);
        }
        return true;
      }

      return false;
    } finally {
      if (window.fx) window.fx.sourceIsAlly = prevAlly;
    }
  }

  executeBreakerCounterSuccess(boss) {
    const prevAlly = window.fx ? window.fx.sourceIsAlly : false;
    if (window.fx) window.fx.sourceIsAlly = !this.isLocal;
    try {
      audio.playParryClang(true);
      audio.playImpactBoom(1.6);
      audio.playCounterSuccessBoom();
      this.addOverpower(50);
      // In Solo or Duo play (<= 2 players), or during the Echoing Iaido / Final Phase 3-Dash Counter mechanic, reset [D] CD completely to 0s!
      const partyLen = (window.game && window.game.party) ? window.game.party.length : 1;
      if (partyLen <= 2 || (boss && (boss.state === 'iaido_mechanic' || boss.state === 'final_phase_mechanic'))) {
        this.cds.d = 0;
      } else {
        this.cds.d = Math.min(this.cds.d, this.maxCds.d * 0.5);
      }
      if (window.fx) {
        if (this.isLocal) {
          window.fx.triggerHitstop(95);
          window.fx.triggerShake(24, 0.45);
          window.fx.triggerZoomPunch(0.09);
          window.fx.triggerScreenFlash('#38bdf8', 0.24);
        }
        window.fx.addShockwave(this.x, this.y, 210, '#38bdf8', 7);
        window.fx.addShockwave(this.x, this.y, 150, '#fbbf24', 5);
      }
      // The owner's client sends counter_stagger; replaying it here would double-count dash counters.
      if (boss && !this.isRemote) {
        boss.executeCounterStagger(this);
        this.dealHitToBoss(boss, 3.2, 'Counter Strike [D]', true, 120, true, {
          isStrongMove: true,
          impulseStrength: 1.8
        });
      }
    } finally {
      if (window.fx) window.fx.sourceIsAlly = prevAlly;
    }
  }

  // -------------------------------------------------------------------------
  // MAIN UPDATE LOOP (All Original Breaker States + 2.5D Weight, Knockback & Spin)
  // -------------------------------------------------------------------------
  update(dt, boss, arenaCenter, arenaRadius) {
    const prevAlly = window.fx ? window.fx.sourceIsAlly : false;
    if (window.fx) window.fx.sourceIsAlly = !this.isLocal;
    try {
      this._updateInternal(dt, boss, arenaCenter, arenaRadius);
    } finally {
      if (window.fx) window.fx.sourceIsAlly = prevAlly;
    }
  }

  _updateInternal(dt, boss, arenaCenter, arenaRadius) {
    this.breathePhase += dt * 2.6;

    const cdDt = (this._rawDt !== undefined) ? this._rawDt : dt;                           // haste (accessories) scales dt for skills; cooldowns use real time
    const cdBoost = 1 + (this.haste || 0) * 0.5 + (this.cdrBonus || 0) + (this.tempCdr || 0);   // tempCdr: timed buffs (Shatterpoint Pendant)
    for (const k in this.cds) {
      if (this.cds[k] > 0) {
        const cdRate = ((this.overpowerSurge && k !== 't' && k !== 'z' && k !== 'space') ? 1.35 : 1.0) * cdBoost;
        this.cds[k] = Math.max(0, this.cds[k] - cdDt * cdRate);
      }
    }
    if (this.tackleComboPrimed > 0) this.tackleComboPrimed = Math.max(0, this.tackleComboPrimed - dt);
    if (this.parryRipostePrimed > 0) this.parryRipostePrimed = Math.max(0, this.parryRipostePrimed - dt);
    if (this.astralStaggerSurge > 0) this.astralStaggerSurge = Math.max(0, this.astralStaggerSurge - dt);
    if (this.comboResetTimer > 0) {
      this.comboResetTimer -= dt;
      if (this.comboResetTimer <= 0) this.comboStep = 0;
    }
    if (this.overpowerSurge) {
      this.surgeTimer -= dt;
      if (this.surgeTimer <= 0) this.overpowerSurge = false;
    }

    if (this.hp <= 0) {
      this.clearEclipseQteAndRoot();
      this.clearClashRhythmQte();
      this.state = 'dead';
      return;
    }

    // Active 15% HP Final Clash Rhythm-Game QTE Countdown
    this.updateClashRhythmQte(dt, boss);

    // Active 5-Key QWER Typing QTE Countdown
    if (this.qteActive) {
      this.qteTimer -= dt;
      this.speed = 0;
      this.vx = 0;
      this.vy = 0;
      this.targetX = this.x;
      this.targetY = this.y;

      // AI Bots automatically type their QTE sequence so they can rescue rooted players and stagger Vaelgor!
      if (this.isBot) {
        this.botQteStepTimer -= dt;
        if (this.botQteStepTimer <= 0 && this.qteSequence[this.qteIndex]) {
          this.botQteStepTimer = 0.30 + Math.random() * 0.18;
          this.handleEclipseQteKey(this.qteSequence[this.qteIndex]);
        }
      }

      // Remote proxies only mirror qteActive; their owner decides the timeout and broadcasts player_qte_root.
      if (this.qteActive && this.qteTimer <= 0 && !this.isRemote) {
        this.applyEclipseRoot(false);
      }
    }

    // Rooted State Lock (immobilized until freed by an ally or mechanic ends)
    if (this.rooted) {
      this.speed = 0;
      this.vx = 0;
      this.vy = 0;
      this.targetX = this.x;
      this.targetY = this.y;
      if (!boss || (boss.state !== 'final_phase_mechanic' && boss.state !== 'eclipse_mechanic')) {
        this.rooted = false;
        this.rootStagger = 0;
      }
    }

    // Apply Natural Step-In Attack Momentum with Stone Floor Friction
    if (Math.hypot(this.attackStepVx, this.attackStepVy) > 3) {
      this.x += this.attackStepVx * dt;
      this.y += this.attackStepVy * dt;
      this.targetX = this.x;
      this.targetY = this.y;
      const stepDamp = Math.exp(-9.5 * dt);
      this.attackStepVx *= stepDamp;
      this.attackStepVy *= stepDamp;
    } else {
      this.attackStepVx = 0;
      this.attackStepVy = 0;
    }

    // Apply Physical Knockback / Push / Knockdown Velocity with Ground Skid Friction
    if (Math.hypot(this.kbVx, this.kbVy) > 4) {
      const prevX = this.x;
      const prevY = this.y;
      this.x += this.kbVx * dt;
      this.y += this.kbVy * dt;
      this.targetX = this.x;
      this.targetY = this.y;

      const friction = (this.state === 'hit_knockdown' && this.jumpZ > 2) ? 2.4 : 6.8;
      const damp = Math.exp(-friction * dt);
      this.kbVx *= damp;
      this.kbVy *= damp;

      if (this.jumpZ <= 2) {
        this.snapFeetToBody();
        if (window.fx && Math.random() < 0.65) {
          window.fx.addStepDust(this.x, this.y, 2);
          if (Math.hypot(this.kbVx, this.kbVy) > 120) {
            window.fx.addScorchSegment(prevX, prevY, this.x, this.y, false);
          }
        }
      }
    } else {
      this.kbVx = 0;
      this.kbVy = 0;
    }

    if (this.isBot && boss) {
      this.updateBotAI(dt, boss, arenaCenter, arenaRadius);
    }

    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);

    // =========================================================================
    // ACTIVE SKILL & HIT-REACTION STATE MACHINE
    // =========================================================================
    if (this.state !== 'idle' && this.state !== 'walk') {
      if (this.state === 't_cinematic') {
        this.updateOmnislashSequence(dt, boss);
        return;
      }

      this.stateTimer -= dt;
      const p = Math.max(0, Math.min(1, 1.0 - (this.stateTimer / (this.stateDuration || 1))));

      // CLASH LOCK: Locked blade-to-blade with Vaelgor during 15% HP Final Clash!
      if (this.state === 'clash_lock') {
        this.updateClashLockState(boss);
        return;
      }
      // HIT REACTION 0: Grabbed / Pinned by Boss (Immobilized until Stagger-Freed or Executed!)
      else if (this.state === 'grabbed') {
        this.jumpZ = 28;
        this.bodySpinAngle = 0;
        this.leftFoot.x = this.x + cosA * 4;
        this.leftFoot.y = this.y + sinA * 4;
        this.leftFoot.z = 22;
        this.rightFoot.x = this.x - cosA * 4;
        this.rightFoot.y = this.y - sinA * 4;
        this.rightFoot.z = 20;
      }
      // HIT REACTION 1: Light Stagger Flinch
      else if (this.state === 'hit_stagger') {
        this.bodySpinAngle = -0.25 * Math.sin(p * Math.PI);
        this.snapFeetToBody();
      }
      // HIT REACTION 2: Medium Knockback Slide
      else if (this.state === 'hit_knockback') {
        this.bodySpinAngle = -0.35 * (1 - p);
        this.snapFeetToBody();
      }
      // HIT REACTION 3: Heavy Airborne Launch -> Ground Bounce -> Prone Knockdown!
      else if (this.state === 'hit_knockdown') {
        if (p < 0.46) {
          const airT = p / 0.46;
          this.jumpZ = Math.sin(airT * Math.PI) * 54;
          this.leftFoot.x = this.x + cosA * 12;
          this.leftFoot.y = this.y + sinA * 12;
          this.leftFoot.z = this.jumpZ * 0.85 + 8;
          this.rightFoot.x = this.x + cosA * 10;
          this.rightFoot.y = this.y + sinA * 10;
          this.rightFoot.z = this.jumpZ * 0.80 + 6;
        } else if (p < 0.78) {
          if (!this.knockdownBounced) {
            this.knockdownBounced = true;
            audio.playArmoredStep(1.0);
            audio.playImpactBoom(0.75);
            if (window.fx) {
              window.fx.addShockwave(this.x, this.y, 68, '#94a3b8', 3);
              window.fx.addStepDust(this.x, this.y, 10);
            }
          }
          const bounceT = (p - 0.46) / 0.32;
          this.jumpZ = Math.sin(bounceT * Math.PI) * 10 * (1 - bounceT);
          this.snapFeetToBody();
        } else {
          this.jumpZ = 0;
          this.snapFeetToBody();
        }
      }
      // [Space] Wake-Up Acrobatic Evade Roll!
      else if (this.state === 'wakeup_roll') {
        const rollSpd = 540;
        this.x += cosA * rollSpd * dt;
        this.y += sinA * rollSpd * PERSPECTIVE_TILT * dt;
        this.targetX = this.x;
        this.targetY = this.y;
        this.jumpZ = Math.sin(p * Math.PI) * 24;
        this.bodySpinAngle = p * Math.PI * 2;
        this.snapFeetToBody();
      }

      // [Space] Evade Dash
      else if (this.state === 'space_dash') {
        const dashSpd = 490;
        this.x += cosA * dashSpd * dt;
        this.y += sinA * dashSpd * PERSPECTIVE_TILT * dt;
        this.targetX = this.x;
        this.targetY = this.y;
        this.bodySpinAngle = 0.35 * Math.sin(p * Math.PI);
        this.snapFeetToBody();
      }

      // [LMB] 5-Hit Heavy Greatsword Combo (With Committed Rotation & Step-In Momentum!)
      else if (this.state === 'combo') {
        // Exponential Slow-In / Snap-Out swing curve so each greatsword cut has weight!
        const snapP = p < 0.32 ? (p / 0.32) * 0.18 : 0.18 + (1 - Math.pow(1 - (p - 0.32) / 0.68, 3.8)) * 0.82;
        if (this.comboStep === 1) {
          this.bodySpinAngle = -0.22 + snapP * 0.44;
        } else if (this.comboStep === 2) {
          this.bodySpinAngle = 0.22 - snapP * 0.44;
        } else if (this.comboStep === 3) {
          this.bodySpinAngle = -0.16 * (1 - snapP);
        } else if (this.comboStep === 4) {
          this.bodySpinAngle = snapP * Math.PI * 2;
          this.jumpZ = Math.sin(p * Math.PI) * 24;
        } else if (this.comboStep === 5) {
          this.bodySpinAngle = 0;
          this.jumpZ = Math.sin(p * Math.PI) * 44;
        }

        if (p >= 0.40 && !this.stateHitDone) {
          this.stateHitDone = true;
          const reach = this.comboStep === 5 ? 115 : 95;
          const hitX = this.x + cosA * 52;
          const hitY = this.y + sinA * 52 * PERSPECTIVE_TILT;
          if (this.comboStep === 5) {
            audio.playImpactBoom(1.1);
            audio.playSwordPlant();
            if (window.fx) {
              window.fx.triggerHitstop(55);
              window.fx.triggerShake(12, 0.25);
              window.fx.spawnMassiveEarthChunks(hitX, hitY, 5, this.weaponColor);
              window.fx.addShockwave(hitX, hitY, 105, this.weaponColor, 4.5);
            }
          }
          if (boss) {
            if (!this.isRemote) boss.checkPlayerHitAnchors(hitX, hitY, reach);
            if (Math.hypot(boss.x - hitX, boss.y - hitY) < reach) {
              const coeff = this.comboStep === 5 ? 1.95 : (0.80 + this.comboStep * 0.16);
              this.dealHitToBoss(boss, coeff, `Combo ${this.comboStep}`, false, this.comboStep === 5 ? 28 : 11, false, {
                isStrongMove: this.comboStep >= 4,
                impulseStrength: this.comboStep === 5 ? 1.4 : 0.7
              });
              this.addOverpower(this.comboStep === 5 ? 22 : 9);
            }
          }
        }
      }

      // [Q] SPIN LUNGE -> FULL-BODY 720° WHIRLWIND -> WEIGHTY SLAM -> SHOULDER POSE RECOVERY!
      else if (this.state === 'q_windup') {
        this.swordScale = 1.0 + p * 0.48;
        this.bodySpinAngle = -0.75 * p;
        this.snapFeetToBody();

        if (this.stateTimer <= 0) {
          this.state = 'q_spin';
          this.stateDuration = 0.44;
          this.stateTimer = 0.44;
          this.swordScale = 1.48;
          audio.playSwordSlash(true, 0.85);
          audio.playImpactBoom(0.9);
          if (window.fx) window.fx.triggerShake(7, 0.18);
          return;
        }
      } else if (this.state === 'q_spin') {
        this.swordScale = 1.48;
        const easeSpin = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        this.bodySpinAngle = -0.75 + easeSpin * (Math.PI * 4 + 0.75);
        this.jumpZ = Math.sin(p * Math.PI) * 14;

        const spinMoveSpd = 420;
        this.x += cosA * spinMoveSpd * dt;
        this.y += sinA * spinMoveSpd * PERSPECTIVE_TILT * dt;
        this.targetX = this.x;
        this.targetY = this.y;
        this.snapFeetToBody();

        const curSpinWorldAng = this.getRenderFacingAngle();
        if (window.fx && Math.random() < 0.72) {
          window.fx.addDragSparks(
            this.x + Math.cos(curSpinWorldAng) * 75,
            this.y - 24 + Math.sin(curSpinWorldAng) * 75 * PERSPECTIVE_TILT,
            curSpinWorldAng + Math.PI * 0.5,
            2,
            false,
            '#38bdf8'
          );
          window.fx.addAfterimage(this.x, this.y, curSpinWorldAng, '#38bdf8', curSpinWorldAng);
        }

        this.spinHitThrottle = (this.spinHitThrottle || 0) - dt;
        if (p > 0.10 && this.spinHitThrottle <= 0) {
          this.spinHitThrottle = 0.12;
          if (boss) {
            if (!this.isRemote) boss.checkPlayerHitAnchors(this.x, this.y, 135);
            if (Math.hypot(boss.x - this.x, boss.y - this.y) < 135) {
              this.dealHitToBoss(boss, 0.95, 'Spin Lunge [Q]', false, 14, false, { impulseStrength: 0.75 });
            }
          }
        }

        if (this.stateTimer <= 0) {
          this.bodySpinAngle = 0;
          this.jumpZ = 0;
          audio.playImpactBoom(1.35);
          audio.playSwordPlant();
          if (window.fx) {
            window.fx.triggerHitstop(70);
            window.fx.triggerShake(16, 0.32);
            window.fx.addFissureLine(this.x, this.y, this.x + cosA * 155, this.y + sinA * 155 * PERSPECTIVE_TILT, '#f97316', 4.5);
            window.fx.spawnMassiveEarthChunks(this.x + cosA * 35, this.y + sinA * 35 * PERSPECTIVE_TILT, 7, '#38bdf8');
            window.fx.addShockwave(this.x, this.y, 130, '#38bdf8', 6);
          }
          if (boss && Math.hypot(boss.x - this.x, boss.y - this.y) < 145) {
            this.dealHitToBoss(boss, 1.55, 'Spin Lunge Slam [Q]', false, 26, true, {
              isStrongMove: true,
              impulseStrength: 1.35
            });
          }

          this.state = 'q_recover';
          this.stateDuration = 0.64;
          this.stateTimer = 0.64;
          this.lungeFootForward(this.leftFoot, 15, -this.hipWidth - 3, 0.18);
          return;
        }
      } else if (this.state === 'q_recover') {
        this.bodySpinAngle = 0;
        this.swordScale = Math.max(1.0, 1.48 - p * 0.48);
        if (p >= 0.48 && !this.stateHitDone) {
          this.stateHitDone = true;
          audio.playArmoredStep(0.9);
          this.pelvisVelZ -= 24;
          this.pauldronVelZ -= 42;
        }
      }

      // [W] EARTHBREAKER (Parabolic Jump -> Tectonic Earth Rupture & 3D Boulders!)
      else if (this.state === 'w_leap') {
        this.x = this.leapStartX + (this.leapTargetX - this.leapStartX) * p;
        this.y = this.leapStartY + (this.leapTargetY - this.leapStartY) * p;
        this.jumpZ = Math.sin(p * Math.PI) * (this.isTackleComboW ? 112 : 94);
        this.swordScale = 1.45;
        this.bodySpinAngle = 0;
        this.syncAirborneFeet();

        if (window.fx && Math.random() < 0.6) {
          window.fx.addAfterimage(this.x, this.y - this.jumpZ * 0.4, this.facingAngle, '#fbbf24');
        }

        if (this.stateTimer <= 0) {
          this.x = this.leapTargetX;
          this.y = this.leapTargetY;
          this.jumpZ = 0;
          this.targetX = this.x;
          this.targetY = this.y;
          this.snapFeetToBody();

          const isTC = this.isTackleComboW;
          const impactX = this.x + cosA * 42;
          const impactY = this.y + sinA * 42 * PERSPECTIVE_TILT;
          const reach = isTC ? 230 : 185;

          audio.playSwordPlant();
          audio.playImpactBoom(1.55);

          if (window.fx) {
            window.fx.triggerHitstop(isTC ? 85 : 68);
            window.fx.triggerShake(isTC ? 22 : 17, 0.42);
            window.fx.addFissureLine(this.x, this.y, this.x + cosA * reach, this.y + sinA * reach * PERSPECTIVE_TILT, '#f59e0b', 5.2);
            window.fx.addFissureLine(this.x, this.y, this.x + Math.cos(this.facingAngle + 0.42) * (reach * 0.8), this.y + Math.sin(this.facingAngle + 0.42) * (reach * 0.8) * PERSPECTIVE_TILT, '#fbbf24', 4.0);
            window.fx.addFissureLine(this.x, this.y, this.x + Math.cos(this.facingAngle - 0.42) * (reach * 0.8), this.y + Math.sin(this.facingAngle - 0.42) * (reach * 0.8) * PERSPECTIVE_TILT, '#fbbf24', 4.0);

            window.fx.spawnMassiveEarthChunks(impactX, impactY, isTC ? 12 : 9, '#f59e0b');
            window.fx.addShockwave(impactX, impactY, isTC ? 195 : 155, '#fbbf24', 7);
            window.fx.addShockwave(impactX, impactY, isTC ? 115 : 85, '#ffffff', 5);
            window.fx.addDragSparks(impactX, impactY, 0, 28, false, '#fde047');
          }

          if (boss) {
            if (!this.isRemote) boss.checkPlayerHitAnchors(impactX, impactY, 155);
            if (Math.hypot(boss.x - impactX, boss.y - impactY) < 160) {
              const coeff = isTC ? 3.85 : 3.05;
              this.dealHitToBoss(boss, coeff, 'Earthbreaker [W]', true, 48, true, {
                isStrongMove: true,
                impulseStrength: 1.65
              });
            }
          }

          this.state = 'w_slam';
          this.stateDuration = 0.36;
          this.stateTimer = 0.36;
          return;
        }
      } else if (this.state === 'w_slam') {
        this.swordScale = Math.max(1.0, 1.45 - p * 0.45);
      }

      // [R] HOLD-TO-CHARGE SWEET-SPOT CRESCENT WAVE
      else if (this.state === 'r_charge') {
        this.rChargeTime += dt;
        const chargeFrac = Math.min(1, this.rChargeTime / this.rMaxCharge);
        const inSweetSpot = (this.rChargeTime >= this.rSweetMin && this.rChargeTime <= this.rSweetMax);
        this.swordScale = 1.20 + chargeFrac * 0.45;
        this.bodySpinAngle = -0.18 * Math.min(1, chargeFrac * 1.3);
        this.snapFeetToBody();

        if (window.fx && Math.random() < 0.78) {
          const ang = Math.random() * Math.PI * 2;
          const spkCol = inSweetSpot ? '#facc15' : '#38bdf8';
          window.fx.addDragSparks(this.x + Math.cos(ang) * 45, this.y - 25 + Math.sin(ang) * 28, ang + Math.PI, 1, false, spkCol);
        }

        // If tapped quickly (key already released) and minimum windup (0.22s) reached, or if AI bot hits sweet spot, or max charge reached:
        if (
          (!this.rHoldingKey && this.rChargeTime >= 0.22) ||
          (this.isBot && inSweetSpot) ||
          // Remote proxies wait for the owner's player_skill_release packet instead of auto-firing (avoids a double wave).
          (!this.isRemote && this.rChargeTime >= this.rMaxCharge)
        ) {
          this.fireCrescentWaveSlash();
          return;
        }
      } else if (this.state === 'r_slash') {
        const snap = 1 - Math.pow(1 - p, 4.0);
        this.bodySpinAngle = -0.18 + snap * 0.42;
        this.swordScale = Math.max(1.0, (this.rPerfectRelease ? 1.72 : 1.52) - p * 0.55);
      }

      // [A] IRON TACKLE
      else if (this.state === 'a_tackle') {
        this.bodySpinAngle = 0;
        const rushSpd = 680;
        this.x += cosA * rushSpd * dt;
        this.y += sinA * rushSpd * PERSPECTIVE_TILT * dt;
        this.targetX = this.x;
        this.targetY = this.y;
        this.snapFeetToBody();

        if (!this.stateHitDone && boss) {
          if (!this.isRemote) boss.checkPlayerHitAnchors(this.x, this.y, 95);
          if (Math.hypot(boss.x - this.x, boss.y - this.y) < 95) {
            this.stateHitDone = true;
            audio.playImpactBoom(1.15);
            if (window.fx) {
              window.fx.triggerHitstop(55);
              window.fx.triggerShake(12, 0.22);
              window.fx.addShockwave(this.x, this.y, 110, '#38bdf8', 5);
            }
            this.dealHitToBoss(boss, 1.95, 'Iron Tackle [A]', true, 38, true, {
              isStrongMove: true,
              impulseStrength: 1.45
            });
          }
        }
      }

      // [S] BEDROCK DRAG -> HEAVENWARD UPPERCUT!
      else if (this.state === 's_drag') {
        this.swordScale = 1.35;
        this.bodySpinAngle = 0;
        const dragSpd = 350;
        this.x += cosA * dragSpd * dt;
        this.y += sinA * dragSpd * PERSPECTIVE_TILT * dt;
        this.targetX = this.x;
        this.targetY = this.y;
        this.snapFeetToBody();

        if (window.fx) {
          const tipX = this.x - cosA * 48;
          const tipY = this.y - sinA * 48 * PERSPECTIVE_TILT;
          window.fx.addDragSparks(tipX, tipY, this.facingAngle, 2, false, '#f59e0b');
          window.fx.addScorchSegment(tipX, tipY, this.x - cosA * 22, this.y - sinA * 22 * PERSPECTIVE_TILT, false);
        }

        if (this.stateTimer <= 0) {
          this.state = 's_uppercut';
          this.stateDuration = 0.38;
          this.stateTimer = 0.38;
          this.stateHitDone = false;
          this.swordScale = 1.45;
          audio.playSwordSlash(true, 1.4);
          audio.playImpactBoom(1.3);
          return;
        }
      } else if (this.state === 's_uppercut') {
        this.bodySpinAngle = 0;
        this.jumpZ = Math.sin(p * Math.PI) * 52;
        this.syncAirborneFeet();
        if (p >= 0.24 && !this.stateHitDone) {
          this.stateHitDone = true;
          const eruptX = this.x + cosA * 55;
          const eruptY = this.y + sinA * 55 * PERSPECTIVE_TILT;
          if (window.fx) {
            window.fx.triggerHitstop(75);
            window.fx.triggerShake(16, 0.35);
            window.fx.addDimensionalSlash(this.x - cosA * 20, this.y, eruptX + cosA * 85, eruptY + sinA * 85 * PERSPECTIVE_TILT, '#fbbf24', 0.65);
            window.fx.addSlashRibbon(this.x, this.y - 24, 118, this.facingAngle - 0.85, this.facingAngle + 0.85, '#fbbf24', 28, 0.28);
            window.fx.addImpactStarburst(eruptX, eruptY - 22, 108, '#fde047', 8, this.facingAngle, 0.28);
            window.fx.spawnMassiveEarthChunks(eruptX, eruptY, 7, '#fbbf24');
            window.fx.addShockwave(eruptX, eruptY, 140, '#fbbf24', 6);
          }
          if (boss) {
            if (!this.isRemote) boss.checkPlayerHitAnchors(eruptX, eruptY, 135);
            if (Math.hypot(boss.x - eruptX, boss.y - eruptY) < 140) {
              this.dealHitToBoss(boss, 2.85, 'Bedrock Uppercut [S]', true, 42, true, {
                isStrongMove: true,
                impulseStrength: 1.5
              });
            }
          }
        }
      }

      // [D] COUNTER SKILL (Lost Ark-Style Blue Pattern Counter & 2-Hit Heavy Anime X-Cut!)
      else if (this.state === 'd_cleave1') {
        this.swordScale = 1.38;
        const snap = 1 - Math.pow(1 - p, 3.8);
        this.bodySpinAngle = -0.18 + snap * 0.36;
        this.x += cosA * 180 * dt;
        this.y += sinA * 180 * PERSPECTIVE_TILT * dt;
        this.targetX = this.x;
        this.targetY = this.y;

        // Continuous Counter Check during [D] lunge so stepping into range counters Blue Patterns cleanly!
        if (!this.dCounterTriggered && boss && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 205) {
          this.dCounterTriggered = true;
          this.executeBreakerCounterSuccess(boss);
          if (this.qteActive || this.rooted) {
            this.state = 'idle';
            this.stateTimer = 0;
            this.jumpZ = 0;
            this.bodySpinAngle = 0;
            return;
          }
        }

        if (p >= 0.26 && !this.stateHitDone) {
          this.stateHitDone = true;
          const hx = this.x + cosA * 55;
          const hy = this.y + sinA * 55 * PERSPECTIVE_TILT;
          if (window.fx) {
            window.fx.addSlashRibbon(this.x, this.y - 20, 110, this.facingAngle - 1.15, this.facingAngle + 1.15, '#38bdf8', 24, 0.25);
          }
          if (boss) {
            if (!this.isRemote) boss.checkPlayerHitAnchors(hx, hy, 125);
            if (Math.hypot(boss.x - hx, boss.y - hy) < 130) {
              this.dealHitToBoss(boss, 1.85, 'Counter Cleave I [D]', true, 28, false, {
                isStrongMove: true,
                impulseStrength: 1.25
              });
            }
          }
        }

        if (this.stateTimer <= 0) {
          this.state = 'd_cleave2';
          this.stateDuration = 0.44;
          this.stateTimer = 0.44;
          this.stateHitDone = false;
          this.jumpZ = 24;
          this.syncAirborneFeet();
          audio.playSwordSlash(true, 1.45);
          audio.playParryClang(false);

          if (window.fx) {
            window.fx.addDimensionalSlash(
              this.x + sinA * 65 + cosA * 15,
              this.y - cosA * 65 * PERSPECTIVE_TILT + sinA * 15 * PERSPECTIVE_TILT,
              this.x - sinA * 65 + cosA * 130,
              this.y + cosA * 65 * PERSPECTIVE_TILT + sinA * 130 * PERSPECTIVE_TILT,
              '#fbbf24',
              0.68
            );
            window.fx.addSlashRibbon(this.x, this.y - 22, 125, this.facingAngle + 1.25, this.facingAngle - 1.25, '#fbbf24', 28, 0.28);
            window.fx.addShockwave(this.x + cosA * 65, this.y + sinA * 65 * PERSPECTIVE_TILT, 110, '#fbbf24', 5);
          }
          return;
        }
      } else if (this.state === 'd_cleave2') {
        const snap = 1 - Math.pow(1 - p, 3.8);
        this.bodySpinAngle = 0.18 - snap * 0.36;
        this.jumpZ = 24 * (1 - p);
        this.syncAirborneFeet();

        if (!this.dCounterTriggered && boss && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 205) {
          this.dCounterTriggered = true;
          this.executeBreakerCounterSuccess(boss);
        }

        if (p >= 0.25 && !this.stateHitDone) {
          this.stateHitDone = true;
          const hx = this.x + cosA * 62;
          const hy = this.y + sinA * 62 * PERSPECTIVE_TILT;
          if (window.fx) {
            window.fx.triggerHitstop(85);
            window.fx.triggerShake(16, 0.32);
            window.fx.addImpactStarburst(hx, hy - 22, 102, '#fbbf24', 8, this.facingAngle + 0.4, 0.26);
          }
          if (boss) {
            if (!this.isRemote) boss.checkPlayerHitAnchors(hx, hy, 135);
            if (Math.hypot(boss.x - hx, boss.y - hy) < 140) {
              this.dealHitToBoss(boss, 2.75, 'Counter X-Cut [D]', true, 40, true, {
                isStrongMove: true,
                impulseStrength: 1.55
              });
              if (window.fx) {
                window.fx.addPillar(boss.x, boss.y, 34, '#fbbf24', 0.55);
              }
            }
          }
        }
      }

      // [F] TITAN'S WRATH (Empowered by [E] Parry for +50% Crit Riposte & Golden Dimensional X-Slash!)
      else if (this.state === 'f_wrath') {
        this.swordScale = this.titanIsRiposte ? 1.78 : 1.65;
        this.bodySpinAngle = 0;
        if (p < 0.55) {
          const lift = Math.min(1, p / 0.45);
          this.jumpZ = Math.sin(lift * Math.PI * 0.5) * (this.titanIsRiposte ? 54 : 46);
          this.syncAirborneFeet();
          if (window.fx && Math.random() < 0.75) {
            const ang = Math.random() * Math.PI * 2;
            window.fx.addDragSparks(
              this.x + Math.cos(ang) * 55,
              this.y - 65 + Math.sin(ang) * 35,
              ang + Math.PI,
              1,
              false,
              (this.titanIsRiposte || this.titanIsSurge) ? '#fde047' : '#f59e0b'
            );
          }
        } else if (p < 0.76) {
          const swingRatio = (p - 0.55) / 0.21;
          this.jumpZ = (this.titanIsRiposte ? 54 : 46) * (1 - Math.pow(swingRatio, 3));
          this.syncAirborneFeet();
          if (!this.titanSwung && swingRatio > 0.3) {
            this.titanSwung = true;
            audio.playSwordSlash(true, 1.6);
            if (window.fx) {
              window.fx.addSlashRibbon(this.x, this.y - 26, 148, this.facingAngle - 1.15, this.facingAngle + 1.15, '#fde047', 38, 0.32);
            }
          }
        } else {
          this.jumpZ = 0;
          if (!this.stateHitDone) {
            this.stateHitDone = true;
            this.snapFeetToBody();
            this.lungeFootForward(this.leftFoot, 15, -this.hipWidth - 4, 0.14);
            this.lungeFootForward(this.rightFoot, -12, this.hipWidth + 4, 0.14);
            const targetX = this.x + cosA * 72;
            const targetY = this.y + sinA * 72 * PERSPECTIVE_TILT;

            audio.playImpactBoom(this.titanIsRiposte ? 2.0 : 1.9);
            audio.playSwordPlant();

            if (window.fx) {
              window.fx.triggerHitstop((this.titanIsRiposte || this.titanIsSurge) ? 125 : 95);
              window.fx.triggerShake((this.titanIsRiposte || this.titanIsSurge) ? 32 : 24, 0.55);
              if (this.isLocal) {
                window.fx.triggerZoomPunch(this.titanIsRiposte ? 0.085 : 0.065);
                window.fx.triggerImpactFrame('#fbbf24', this.titanIsRiposte ? 0.26 : 0.18);
              }

              window.fx.addFissureLine(this.x, this.y, this.x + cosA * 240, this.y + sinA * 240 * PERSPECTIVE_TILT, '#f59e0b', 5.5);
              window.fx.addFissureLine(targetX, targetY, targetX - sinA * 165, targetY + cosA * 165 * PERSPECTIVE_TILT, '#f59e0b', 4.5);
              window.fx.addFissureLine(targetX, targetY, targetX + sinA * 165, targetY - cosA * 165 * PERSPECTIVE_TILT, '#f59e0b', 4.5);
              window.fx.addFissureLine(targetX, targetY, targetX - cosA * 120, targetY - sinA * 120 * PERSPECTIVE_TILT, '#fbbf24', 4.0);

              window.fx.spawnMassiveEarthChunks(targetX, targetY, (this.titanIsRiposte || this.titanIsSurge) ? 15 : 11, '#f59e0b');
              window.fx.addShockwave(targetX, targetY, 260, '#f59e0b', 8);
              window.fx.addShockwave(targetX, targetY, 160, '#ffffff', 6);
              window.fx.addPillar(targetX, targetY, 54, '#facc15', 0.85);
              window.fx.addImpactStarburst(targetX, targetY - 26, 155, '#fde047', 8, 0.35, 0.36);
              window.fx.addLightningBolt(targetX - 38, targetY - 190, targetX, targetY, '#fde047', 4.2, 0.34);
              window.fx.addLightningBolt(targetX + 38, targetY - 190, targetX, targetY, '#f59e0b', 3.4, 0.30);

              if (this.titanIsRiposte) {
                window.fx.addDimensionalSlash(targetX - 105, targetY - 65, targetX + 105, targetY + 65, '#fde047', 0.90);
                window.fx.addDimensionalSlash(targetX + 105, targetY - 65, targetX - 105, targetY + 65, '#ffffff', 0.90);
              }
            }

            if (boss) {
              if (!this.isRemote) boss.checkPlayerHitAnchors(targetX, targetY, 185);
              if (Math.hypot(boss.x - targetX, boss.y - targetY) < 190) {
                let coeff = 5.60;
                if (this.titanIsRiposte) coeff *= 1.50; // +50% Empowered Parry Riposte Bonus!
                const fStacks = boss.fractureStacks || 0;
                if (fStacks > 0) {
                  // Detonating Fracture: +35% per stack (+50% during Surge) and it refunds Overpower for the next Surge.
                  coeff *= (1.0 + fStacks * (this.overpowerSurge ? 0.50 : 0.35));
                  this.addOverpower(fStacks * 14);
                  boss.fractureStacks = 0;
                  if (window.fx) {
                    window.fx.addDimensionalSlash(targetX - 95, targetY - 60, targetX + 95, targetY + 60, '#ffffff', 0.85);
                    window.fx.addDimensionalSlash(targetX + 95, targetY - 60, targetX - 95, targetY + 60, '#f59e0b', 0.85);
                  }
                }
                this.dealHitToBoss(boss, coeff, this.titanIsRiposte ? 'Empowered Titan\'s Wrath [F]' : 'Titan\'s Wrath [F]', true, this.titanIsRiposte ? 125 : 95, false, {
                  isStrongMove: true,
                  forceCrit: this.titanIsRiposte,
                  impulseStrength: this.titanIsRiposte ? 2.35 : 2.1,
                  partBreakMult: 1.15 + fStacks * 0.25
                });
                this.addOverpower(40);
              }
            }
          }
        }
      }

      // [T] OMNISLASH THRUST ENTRY
      else if (this.state === 't_thrust') {
        const dashSpd = this.omnislashBounce ? -230 : 780;       // bounced off a boss that is in a mechanic: shoved back
        this.x += cosA * dashSpd * dt;
        this.y += sinA * dashSpd * PERSPECTIVE_TILT * dt;
        this.targetX = this.x;
        this.targetY = this.y;
        this.snapFeetToBody();

        if (!this.omnislashBounce && boss && boss.hp > 0 && Math.hypot(boss.x - this.x, boss.y - this.y) < 145 && ultHoldBlocked(boss)) {
          // it connected but cannot hold: no cinematic, no damage, half the cooldown comes back
          this.omnislashBounce = true;
          this.cds.t = this.maxCds.t * 0.5;
          this.stateDuration = 0.24;
          this.stateTimer = 0.24;
          audio.playImpactBoom(0.8);
          ultBounceFx(this.x + cosA * 60, this.y + sinA * 60 * PERSPECTIVE_TILT);
        } else if (!this.omnislashBounce && boss && boss.hp > 0 && Math.hypot(boss.x - this.x, boss.y - this.y) < 145) {
          if (typeof boss.lockInPlaceForUltimate === 'function') {
            boss.lockInPlaceForUltimate(2.15, 4.0, this.isRemote);
          }
          if (this.omnislashCastAngle === undefined) {
            this.omnislashCastAngle = this.facingAngle;
          }
          this.state = 't_cinematic';
          this.omnislashStep = 0;
          this.omnislashTimer = 0.08;
          this.omnislashTarget = boss;
          return;
        }
      }
      // [T] OMNISLASH AFTERGLOW HOLD (Holds Back-Turned Shoulder-Rest Pose while Boss Explodes Behind!)
      else if (this.state === 't_afterglow') {
        this.swordScale = 1.0 + (1 - p) * 0.25;
        this.bodySpinAngle = 0;
      }

      if (this.stateTimer <= 0 && this.state !== 'r_charge') {
        this.jumpZ = 0;
        this.swordScale = 1.0;
        this.bodySpinAngle = 0;
        this.state = 'idle';
        this.snapFeetToBody();
      }
    } else {
      this.bodySpinAngle *= Math.max(0, 1 - dt * 14);
    }

    // Standard Walking Movement
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    const canWalk = (this.state === 'idle' || this.state === 'walk');

    if (canWalk && dist > 3.5) {
      this.state = 'walk';
      const targetMoveAng = Math.atan2(dy, dx);
      let mDiff = targetMoveAng - this.moveAngle;
      while (mDiff < -Math.PI) mDiff += Math.PI * 2;
      while (mDiff > Math.PI) mDiff -= Math.PI * 2;
      this.moveAngle += mDiff * Math.min(1.0, dt * 18.0);

      const maxSpd = this.baseMaxSpeed * (this.overpowerSurge ? 1.22 : 1.0);
      const arrivalScale = Math.min(1.0, dist / 28.0);
      const desiredSpeed = maxSpd * (0.25 + 0.75 * arrivalScale);
      this.speed += (desiredSpeed - this.speed) * Math.min(1, 13.5 * dt);
      this.vx = Math.cos(this.moveAngle) * this.speed;
      this.vy = Math.sin(this.moveAngle) * this.speed;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      const worldMoveAngle = Math.atan2(dy / PERSPECTIVE_TILT, dx);
      this.rotateTowards(worldMoveAngle, dt);
    } else {
      if (this.state === 'walk') this.state = 'idle';
      const stopDamp = Math.exp(-14.0 * dt);
      this.speed *= stopDamp;
      this.vx *= stopDamp;
      this.vy *= stopDamp;
      if (this.speed < 1.5) {
        this.speed = 0;
        this.vx = 0;
        this.vy = 0;
      }
    }

    if (arenaCenter && arenaRadius) {
      const adx = this.x - arenaCenter.x;
      const ady = (this.y - arenaCenter.y) / PERSPECTIVE_TILT;
      const adist = Math.hypot(adx, ady);
      if (adist > arenaRadius) {
        const ang = Math.atan2(ady, adx);
        this.x = arenaCenter.x + Math.cos(ang) * arenaRadius;
        this.y = arenaCenter.y + Math.sin(ang) * arenaRadius * PERSPECTIVE_TILT;
      }
    }

    if (this.jumpZ <= 0.5) {
      this.updateFootSteps(dt);
    } else {
      this.syncAirborneFeet();
    }

    this.pelvisVelZ += (-this.pelvisBounceZ * 125 - this.pelvisVelZ * 16) * dt;
    this.pelvisBounceZ += this.pelvisVelZ * dt;
    this.pauldronVelZ += (-this.pauldronLagZ * 95 - this.pauldronVelZ * 13) * dt;
    this.pauldronLagZ += this.pauldronVelZ * dt;

    this.updateCapeNodes(dt);
  }

  // -------------------------------------------------------------------------
  // [T] OMNISLASH: EXTINCTION CLEAVE (10-Step 2.5D Cinematic Ultimate!)
  // Step 9: Breaker appears on the opposite side of where [T] was cast,
  //         walks away a few steps in style while laying the sword on his back.
  // Step 10: The exact moment the sword rests on his back, the boss explodes!
  // -------------------------------------------------------------------------
  updateOmnislashSequence(dt, boss) {
    const target = this.omnislashTarget || boss;
    if (!target || target.hp <= 0) {
      this.state = 'idle';
      this.jumpZ = 0;
      this.swordScale = 1.0;
      return;
    }

    // Keep Boss locked in place throughout the entire Omnislash sequence!
    if (typeof target.lockInPlaceForUltimate === 'function') {
      target.lockInPlaceForUltimate(0.55, 4.0, this.isRemote);
    }

    // Continuous Step 9 Choreography: Walk away a few steps in style & lay sword on shoulders/back!
    if (this.omnislashStep === 9 && this.omnislashTimer > 0) {
      const walkDur = this.omnislashWalkDur || 0.96;
      const walkP = Math.max(0, Math.min(1, 1.0 - (this.omnislashTimer / walkDur)));
      this.omnislashWalkProgress = walkP;

      if (walkP < 0.78) {
        // Walk away from the boss along the exit angle for 3 deliberate armored steps!
        const walkSpd = 96 * (1.0 - (walkP / 0.78) * 0.35);
        this.speed = walkSpd;
        this.moveAngle = this.facingAngle;
        this.vx = Math.cos(this.facingAngle) * walkSpd;
        this.vy = Math.sin(this.facingAngle) * walkSpd * PERSPECTIVE_TILT;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.targetX = this.x;
        this.targetY = this.y;

        const stepThresholds = [0.16, 0.44, 0.70];
        for (let s = 0; s < stepThresholds.length; s++) {
          if (walkP >= stepThresholds[s] && (this.omnislashStepCount || 0) <= s) {
            this.omnislashStepCount = s + 1;
            audio.playArmoredStep(0.95);
            if (window.fx) window.fx.addStepDust(this.x, this.y, 4);
          }
        }
      } else {
        // Halt and settle the Colossal Greatsword onto his shoulders/back!
        this.speed = 0;
        this.vx = 0;
        this.vy = 0;
        if (!this.omnislashSwordLaid && walkP >= 0.88) {
          this.omnislashSwordLaid = true;
          this.swordScale = 1.25;
          this.pelvisVelZ -= 26;
          this.pauldronVelZ -= 42;
          audio.playParryClang(false);
          audio.playArmoredStep(1.0);
        }
      }

      this.updateFootSteps(dt);
      this.pelvisVelZ += (-this.pelvisBounceZ * 150 - this.pelvisVelZ * 14) * dt;
      this.pelvisBounceZ += this.pelvisVelZ * dt;
      this.pauldronVelZ += (-this.pauldronLagZ * 110 - this.pauldronVelZ * 11) * dt;
      this.pauldronLagZ += this.pauldronVelZ * dt;
      this.updateCapeNodes(dt);
    }

    this.omnislashTimer -= dt;
    if (this.omnislashTimer > 0) return;

    this.omnislashStep++;
    const stepDelays = [0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.08];
    const slashAngles = [
      Math.PI * 0.25,
      Math.PI * 1.25,
      0,
      Math.PI,
      Math.PI * 0.50,
      -Math.PI * 0.50,
      Math.PI * 0.85,
      -Math.PI * 0.25
    ];
    const slashColors = [
      '#38bdf8', '#f59e0b', '#f43f5e', '#a855f7',
      '#fbbf24', '#ffffff', '#06b6d4', '#e11d48'
    ];

    if (this.omnislashStep <= 8) {
      const idx = this.omnislashStep - 1;
      const angle = slashAngles[idx];
      const slashColor = slashColors[idx];
      const dashReach = 145;

      const startX = target.x - Math.cos(angle) * dashReach;
      const startY = target.y - Math.sin(angle) * dashReach * PERSPECTIVE_TILT;
      const endX = target.x + Math.cos(angle) * dashReach;
      const endY = target.y + Math.sin(angle) * dashReach * PERSPECTIVE_TILT;

      this.x = endX;
      this.y = endY;
      this.targetX = endX;
      this.targetY = endY;
      this.facingAngle = angle;
      this.swordScale = 1.55;

      if (this.omnislashStep === 5) {
        this.jumpZ = 78;
        if (target.jumpZ !== undefined) target.jumpZ = 45;
      } else if (this.omnislashStep === 6) {
        this.jumpZ = 0;
        if (target.jumpZ !== undefined) target.jumpZ = 0;
      } else {
        this.jumpZ = (this.omnislashStep % 2 === 0) ? 28 : 0;
      }
      this.snapFeetToBody();

      audio.playDimensionalSlash(this.omnislashStep);

      if (window.fx) {
        window.fx.triggerShake(12 + this.omnislashStep, 0.14);
        window.fx.addSonicBoomRings(startX, startY, endX, endY, 5, slashColor);
        window.fx.addDimensionalSlash(startX, startY, endX, endY, slashColor, 1.35);
        window.fx.addShockwave(target.x, target.y, 92, slashColor, 5);
        for (let f = 1; f <= 3; f++) {
          const frac = f / 3.5;
          window.fx.addAfterimage(
            startX + (endX - startX) * frac,
            startY + (endY - startY) * frac,
            angle,
            slashColor
          );
        }
      }

      if (typeof target.checkPlayerHitAnchors === 'function') {
        if (!this.isRemote) target.checkPlayerHitAnchors(target.x, target.y, 220);
      }
      this.dealHitToBoss(target, 1.65, `Omnislash ${this.omnislashStep}`, false, 20, false, {
        isStrongMove: true,
        forceCrit: true,
        impulseStrength: 1.45
      });
      this.omnislashTimer = stepDelays[idx];
    } else if (this.omnislashStep === 9) {
      // Step 9: Appear on the exact opposite side of where [T] was cast, facing away from the boss,
      // and walk away a few steps in style while raising the greatsword onto his shoulders/back!
      const exitAng = (this.omnislashCastAngle !== undefined) ? this.omnislashCastAngle : 0;
      this.x = target.x + Math.cos(exitAng) * 76;
      this.y = target.y + Math.sin(exitAng) * 76 * PERSPECTIVE_TILT;
      this.targetX = this.x;
      this.targetY = this.y;
      this.facingAngle = exitAng;
      this.moveAngle = exitAng;
      this.bodySpinAngle = 0;
      this.jumpZ = 0;
      this.swordScale = 1.42;
      this.snapFeetToBody();

      this.omnislashWalkDur = 0.96;
      this.omnislashTimer = 0.96;
      this.omnislashWalkProgress = 0;
      this.omnislashStepCount = 0;
      this.omnislashSwordLaid = false;
      audio.playSwordSlash(false, 0.9);
    } else if (this.omnislashStep === 10) {
      // Step 10: THE MOMENT THE GREATSWORD RESTS ON HIS BACK -> EXTINCTION CLEAVE REALITY SHATTER DETONATION!
      this.speed = 0;
      this.vx = 0;
      this.vy = 0;
      audio.playImpactBoom(2.0);
      audio.playSwordPlant();
      audio.playParryClang(true);
      audio.playCounterSuccessBoom();

      if (window.fx) {
        window.fx.triggerHitstop(135);
        window.fx.triggerShake(38, 0.75);
        if (this.isLocal) {
          window.fx.triggerZoomPunch(0.11);
          window.fx.triggerScreenFlash('#d946ef', 0.32);
        }
        window.fx.addShockwave(target.x, target.y, 340, '#d946ef', 9);
        window.fx.addShockwave(target.x, target.y, 240, '#fbbf24', 7);
        window.fx.addShockwave(target.x, target.y, 150, '#ffffff', 8);
        window.fx.spawnMassiveEarthChunks(target.x, target.y, 14, '#d946ef');
        window.fx.addPillar(target.x, target.y, 68, '#d946ef', 1.0);

        // Criss-crossing anime reality-shatter cuts across the boss behind the Breaker's back!
        for (let c = 0; c < 6; c++) {
          const a = (c * Math.PI) / 3 + 0.25;
          window.fx.addDimensionalSlash(
            target.x - Math.cos(a) * 195,
            target.y - Math.sin(a) * 195 * PERSPECTIVE_TILT - 24,
            target.x + Math.cos(a) * 195,
            target.y + Math.sin(a) * 195 * PERSPECTIVE_TILT - 24,
            c % 2 === 0 ? '#ffffff' : '#facc15',
            1.15
          );
        }
        for (let c = 0; c < 4; c++) {
          const a = (c * Math.PI) / 2;
          window.fx.addFissureLine(target.x, target.y, target.x + Math.cos(a) * 220, target.y + Math.sin(a) * 220 * PERSPECTIVE_TILT, '#d946ef', 5.0);
        }
      }

      this.dealHitToBoss(target, 12.50, 'OMNISLASH: EXTINCTION CLEAVE', true, 160, true, {
        isStrongMove: true,
        forceCrit: true,
        impulseStrength: 2.6,
        partBreakMult: 2.0
      });

      this.swordScale = 1.15;
      this.state = 't_afterglow';
      this.stateDuration = 0.36;
      this.stateTimer = 0.36;
    }
  }

  // -------------------------------------------------------------------------
  // SOLO FALLBACK AI VANGUARD BOT CONTROLLER
  // -------------------------------------------------------------------------
  updateBotAI(dt, boss, arenaCenter, arenaRadius) {
    if (this.state === 'grabbed' || this.state === 'clash_lock' || this.rooted || this.qteActive || this.clashQteActive) return;
    if (
      boss &&
      boss.state === 'final_phase_mechanic' &&
      boss.finalMechPhase === 'dash_counter' &&
      boss.finalDashTargetId === this.id
    ) {
      this.botDecisionTimer = Math.min(this.botDecisionTimer, 0.06);
    }
    this.botDecisionTimer -= dt;
    if (this.botDecisionTimer > 0) return;
    this.botDecisionTimer = 0.22 + Math.random() * 0.18;

    // Bots use Wake-Up Roll if knocked down!
    if (this.state === 'hit_knockdown' && this.cds.wakeup <= 0) {
      const perp = this.facingAngle + Math.PI * 0.5;
      this.triggerSkill('space', this.x + Math.cos(perp) * 90, this.y + Math.sin(perp) * 90 * PERSPECTIVE_TILT, boss);
      return;
    }

    if (this.overpower >= this.maxOverpower) {
      this.activateOverpowerSurge();
    }

    // 15% HP FINAL CLASH MECHANIC:
    // While the clashing player is locked in the cinematic Rhythm QTE, AI teammates wail on Vaelgor from the flanks/back!
    // If the local human player is dead during the 3s blue circle windup, a bot steps in to catch the Clash!
    if (boss.state === 'final_clash_mechanic') {
      if (boss.clashPhase === 'windup_circle') {
        const lp = window.game && window.game.localPlayer;
        const players = (window.game && window.game.party) || [];
        // Find the closest living AI bot to the blue clash circle so one dedicated AI Vanguard steps up if the human doesn't!
        let closestBot = null;
        let closestDist = Infinity;
        for (const p of players) {
          if (p && p.isBot && p.hp > 0) {
            const d = Math.hypot(boss.clashCircleX - p.x, boss.clashCircleY - p.y);
            if (d < closestDist) {
              closestDist = d;
              closestBot = p;
            }
          }
        }
        const lpInCircle = lp && lp.hp > 0 && typeof boss.canPlayerInitiateClash === 'function' && boss.canPlayerInitiateClash(lp);
        // The closest AI bot sprints toward the blue circle immediately, and if the human player hasn't stepped into the circle
        // by 1.25s into the 3.0s windup (clashTimer <= 1.75) or is dead, the AI bot initiates the Clash so you can test AI clashing!
        if (closestBot === this && !lpInCircle) {
          const distCircle = Math.hypot(boss.clashCircleX - this.x, boss.clashCircleY - this.y);
          if (distCircle <= boss.clashCircleRadius + 20) {
            if ((!lp || lp.hp <= 0 || boss.clashTimer <= 1.75) && typeof boss.initiateFinalClash === 'function') {
              boss.initiateFinalClash(this, false);
            } else {
              this.setMoveTarget(boss.clashCircleX, boss.clashCircleY);
            }
          } else {
            this.setMoveTarget(boss.clashCircleX, boss.clashCircleY);
          }
          return;
        }
      }
      if (boss.clashPhase === 'windup_circle' || boss.clashPhase === 'active_clash') {
        const flankAng = boss.facingAngle + Math.PI + ((this.id.charCodeAt(this.id.length - 1) % 3) - 1) * 0.65;
        const flankX = boss.x + Math.cos(flankAng) * 66;
        const flankY = boss.y + Math.sin(flankAng) * 66 * PERSPECTIVE_TILT;
        const distBoss = Math.hypot(boss.x - this.x, boss.y - this.y);
        if (distBoss > 165 && this.cds.w <= 0) {
          this.triggerSkill('w', boss.x, boss.y, boss);
        } else if (distBoss > 95) {
          this.setMoveTarget(flankX, flankY);
        } else {
          if (this.cds.f <= 0) {
            this.triggerSkill('f', boss.x, boss.y, boss);
          } else if (this.cds.w <= 0) {
            this.triggerSkill('w', boss.x, boss.y, boss);
          } else if (this.cds.q <= 0) {
            this.triggerSkill('q', boss.x, boss.y, boss);
          } else if (this.cds.s <= 0) {
            this.triggerSkill('s', boss.x, boss.y, boss);
          } else if (this.cds.r <= 0) {
            this.triggerSkill('r', boss.x, boss.y, boss);
          } else {
            this.triggerBasicAttack(boss.x, boss.y);
          }
        }
        return;
      }
    }

    // FINAL PHASE TRANSITION MECHANIC (Cutscenes, 3-Dash Counter Chain, QTE Root Rescue & Spirit Bomb Stagger!)
    if (boss.state === 'final_phase_mechanic') {
      if (
        boss.finalMechPhase === 'arena_cutscene' ||
        boss.finalMechPhase === 'sword_absorb_cutscene' ||
        boss.finalMechPhase === 'grab_wipe' ||
        boss.finalMechPhase === 'spirit_bomb_wipe'
      ) {
        this.setMoveTarget(this.x, this.y);
        return;
      }
      if (boss.finalMechPhase === 'dash_windup' || boss.finalMechPhase === 'dash_counter') {
        const isMyTurn = boss.finalDashTargetId === this.id;
        if (isMyTurn) {
          this.facingAngle = Math.atan2((boss.y - this.y) / PERSPECTIVE_TILT, boss.x - this.x);
          this.cds.d = 0;
          if (boss.finalMechPhase === 'dash_counter') {
            this.triggerSkill('d', boss.x, boss.y, boss);
          }
        }
        return;
      }
      if (boss.finalMechPhase === 'roar_qte_spirit_bomb') {
        // Priority 1: Rescue any teammate who failed the QTE and is rooted in Abyssal Chains!
        const party = (window.game && window.game.party) ? window.game.party : [];
        const rootedAlly = party.find(p => p && p.hp > 0 && p.rooted && p.id !== this.id);
        if (rootedAlly) {
          const distAlly = Math.hypot(rootedAlly.x - this.x, rootedAlly.y - this.y);
          if (distAlly > 130 && this.cds.space <= 0) {
            this.triggerSkill('space', rootedAlly.x, rootedAlly.y, boss);
          } else if (distAlly > 82) {
            this.setMoveTarget(rootedAlly.x, rootedAlly.y);
          } else {
            if (this.cds.q <= 0) {
              this.triggerSkill('q', rootedAlly.x, rootedAlly.y, boss);
            } else if (this.cds.d <= 0) {
              this.triggerSkill('d', rootedAlly.x, rootedAlly.y, boss);
            } else {
              this.triggerBasicAttack(rootedAlly.x, rootedAlly.y);
            }
          }
          return;
        }

        // Priority 2: All-out Stagger Burst on Vaelgor's Spirit Bomb Stagger Bar!
        const distBoss = Math.hypot(boss.x - this.x, boss.y - this.y);
        if (distBoss > 165 && this.cds.w <= 0) {
          this.triggerSkill('w', boss.x, boss.y, boss);
        } else if (distBoss > 92) {
          const ang = Math.atan2(this.y - boss.y, this.x - boss.x);
          this.setMoveTarget(boss.x + Math.cos(ang) * 64, boss.y + Math.sin(ang) * 64 * PERSPECTIVE_TILT);
        } else {
          if (this.cds.f <= 0) {
            this.triggerSkill('f', boss.x, boss.y, boss);
          } else if (this.cds.w <= 0) {
            this.triggerSkill('w', boss.x, boss.y, boss);
          } else if (this.cds.s <= 0) {
            this.triggerSkill('s', boss.x, boss.y, boss);
          } else if (this.cds.d <= 0) {
            this.triggerSkill('d', boss.x, boss.y, boss);
          } else if (this.cds.q <= 0) {
            this.triggerSkill('q', boss.x, boss.y, boss);
          } else if (this.cds.a <= 0) {
            this.triggerSkill('a', boss.x, boss.y, boss);
          } else {
            this.triggerBasicAttack(boss.x, boss.y);
          }
        }
        return;
      }
    }

    if (boss.state === 'iaido_mechanic') {
      if (boss.iaidoPhase === 'vanished') {
        return;
      }
      if (boss.iaidoPhase === 'ambush_counter') {
        // Only counter if this bot is the ambushed target (never steal the human player's counter!)
        if (boss.iaidoTargetId === this.id && this.cds.d <= 0) {
          this.triggerSkill('d', boss.x, boss.y, boss);
        }
        return;
      }
    }

    if (boss.state === 'eclipse_mechanic') {
      if (boss.eclipsePhase === 'bait_swords') {
        if (boss.eclipseSwordTargetId === this.id && boss.eclipseSwordState === 'tracking') {
          // Bait the tracking sword reticle right onto Vaelgor's Crimson Barrier Ring!
          this.setMoveTarget(boss.x + 55, boss.y + 18);
          return;
        }
        // If not the current sword bait target, stand safely outside the 135px barrier ring
        const d = Math.hypot(this.x - boss.x, (this.y - boss.y) / PERSPECTIVE_TILT);
        if (d < 155) {
          const outAng = Math.atan2(this.y - boss.y, this.x - boss.x);
          this.setMoveTarget(boss.x + Math.cos(outAng) * 185, boss.y + Math.sin(outAng) * 185 * PERSPECTIVE_TILT);
          return;
        }
        return;
      }
    }

    if (boss.state === 'horizon_mechanic') {
      if (boss.horizonPhase === 'solve_step' && Array.isArray(boss.horizonSequence) && Array.isArray(boss.horizonObelisks)) {
        const lp = window.game && window.game.localPlayer;
        const offsetAng = (this.id.charCodeAt(this.id.length - 1) % 4) * (Math.PI * 0.5) + 0.35;
        if (lp && lp.hp > 0) {
          // Escort the living local player in tight formation so AI bots never spoil the puzzle answer!
          const tx = lp.x + Math.cos(offsetAng) * 28;
          const ty = lp.y + Math.sin(offsetAng) * 28 * PERSPECTIVE_TILT;
          if (Math.hypot(this.x - tx, this.y - ty) > 135 && this.cds.space <= 0) {
            this.triggerSkill('space', tx, ty, boss);
          } else {
            this.setMoveTarget(tx, ty);
          }
          return;
        }
        const correctIdx = (typeof boss.getHorizonTargetObeliskIdx === 'function')
          ? boss.getHorizonTargetObeliskIdx(boss.horizonSlashIndex)
          : (boss.horizonSequence[boss.horizonSlashIndex] ?? 0);
        const ob = boss.horizonObelisks[correctIdx];
        if (ob) {
          const tx = ob.x + Math.cos(offsetAng) * 26;
          const ty = ob.y + Math.sin(offsetAng) * 26 * PERSPECTIVE_TILT;
          if (Math.hypot(this.x - tx, this.y - ty) > 95 && this.cds.space <= 0) {
            this.triggerSkill('space', tx, ty, boss);
          } else {
            this.setMoveTarget(tx, ty);
          }
        }
        return;
      }
      if (boss.horizonPhase === 'show_memory') {
        // Stand near center ring observing Vaelgor's physical Greatsword tells!
        const waitAng = (this.id.charCodeAt(this.id.length - 1) % 3) * 2.1 + 0.5;
        this.setMoveTarget(boss.x + Math.cos(waitAng) * 115, boss.y + Math.sin(waitAng) * 115 * PERSPECTIVE_TILT);
        return;
      }
    }

    if (boss.state === 'pat_world_cleaver') {
      const p = 1.0 - (boss.stateTimer / (boss.stateDuration || 2.95));
      const perpAng = boss.baseFacing + Math.PI * 0.5;
      if (p < 0.44) {
        // Dodge OUT of the central split corridor
        this.setMoveTarget(boss.x + Math.cos(perpAng) * 125, boss.y + Math.sin(perpAng) * 125 * PERSPECTIVE_TILT);
        return;
      } else if (p < 0.78) {
        // Step back IN to the safe central scar before flanking corridors erupt!
        this.setMoveTarget(boss.x + Math.cos(boss.baseFacing) * 85, boss.y + Math.sin(boss.baseFacing) * 85 * PERSPECTIVE_TILT);
        return;
      }
    }

    if (boss.state === 'pat_abyssal_vortex') {
      const p = 1.0 - (boss.stateTimer / (boss.stateDuration || 3.15));
      const outAng = Math.atan2(this.y - boss.y, this.x - boss.x);
      if (p < 0.50) {
        // Fight the gravity pull and get OUT beyond 165px before the Inner Nova!
        const tx = boss.x + Math.cos(outAng) * 185;
        const ty = boss.y + Math.sin(outAng) * 185 * PERSPECTIVE_TILT;
        if (p > 0.32 && Math.hypot(this.x - boss.x, (this.y - boss.y) / PERSPECTIVE_TILT) < 145 && this.cds.space <= 0) {
          this.triggerSkill('space', tx, ty, boss);
        } else {
          this.setMoveTarget(tx, ty);
        }
        return;
      } else if (p < 0.84) {
        // Dash back IN inside 130px before the Outer Donut Ring explodes!
        const tx = boss.x + Math.cos(outAng) * 75;
        const ty = boss.y + Math.sin(outAng) * 75 * PERSPECTIVE_TILT;
        if (this.cds.space <= 0) {
          this.triggerSkill('space', tx, ty, boss);
        } else {
          this.setMoveTarget(tx, ty);
        }
        return;
      }
    }

    if (boss.state === 'pat_eclipse_blender') {
      const p = 1.0 - (boss.stateTimer / (boss.stateDuration || 3.25));
      if (p < 0.76) {
        const d = Math.hypot(this.x - boss.x, (this.y - boss.y) / PERSPECTIVE_TILT);
        if (d < 145) {
          const awayAng = Math.atan2(this.y - boss.y, this.x - boss.x) + 0.55;
          this.setMoveTarget(boss.x + Math.cos(awayAng) * 175, boss.y + Math.sin(awayAng) * 175 * PERSPECTIVE_TILT);
          return;
        }
      }
    }

    if (boss.state === 'pattern_final_eclipse_judgment') {
      const p = 1.0 - (boss.stateTimer / (boss.stateDuration || 3.2));
      const baseAng = (p < 0.45) ? 0 : (Math.PI * 0.25);
      const safeDiagAng = baseAng + Math.PI * 0.25 + ((this.id.charCodeAt(this.id.length - 1) % 4) * Math.PI * 0.5);
      this.setMoveTarget(boss.x + Math.cos(safeDiagAng) * 145, boss.y + Math.sin(safeDiagAng) * 145 * PERSPECTIVE_TILT);
      return;
    }

    if (boss.state === 'pattern_final_oblivion_singularity') {
      const p = 1.0 - (boss.stateTimer / (boss.stateDuration || 3.4));
      const outAng = Math.atan2(this.y - boss.y, this.x - boss.x);
      if (p < 0.48) {
        // Safe inside the eye of the singularity (radius < 110)
        this.setMoveTarget(boss.x + Math.cos(outAng) * 65, boss.y + Math.sin(outAng) * 65 * PERSPECTIVE_TILT);
        return;
      } else if (p < 0.80) {
        // Escape outside 185px before the inner collapse!
        const tx = boss.x + Math.cos(outAng) * 205;
        const ty = boss.y + Math.sin(outAng) * 205 * PERSPECTIVE_TILT;
        if (this.cds.space <= 0) {
          this.triggerSkill('space', tx, ty, boss);
        } else {
          this.setMoveTarget(tx, ty);
        }
        return;
      }
    }

    if (boss.state === 'pattern_final_cataclysm_rain') {
      const p = 1.0 - (boss.stateTimer / (boss.stateDuration || 3.5));
      if (p >= 0.48 && p < 0.85) {
        const d = Math.hypot(this.x - boss.x, (this.y - boss.y) / PERSPECTIVE_TILT);
        if (d < 165) {
          const outAng = Math.atan2(this.y - boss.y, this.x - boss.x);
          this.setMoveTarget(boss.x + Math.cos(outAng) * 195, boss.y + Math.sin(outAng) * 195 * PERSPECTIVE_TILT);
          return;
        }
      }
    }

    if (boss.isCounterable()) {
      const d = Math.hypot(boss.x - this.x, boss.y - this.y);
      if (d < 165 && this.cds.d <= 0) {
        this.triggerSkill('d', boss.x, boss.y, boss);
        return;
      } else {
        this.setMoveTarget(boss.x + Math.cos(boss.facingAngle) * 55, boss.y + Math.sin(boss.facingAngle) * 55 * PERSPECTIVE_TILT);
        return;
      }
    }

    // Bots evade incoming Colossal Execution Swords (Sword of Damocles)!
    if (window.fx && window.fx.skySwords && window.fx.skySwords.length > 0) {
      for (const s of window.fx.skySwords) {
        const threatRad = s.isColossal ? 92 : 52;
        if ((s.state === 'telegraph' || s.state === 'falling') && Math.hypot(this.x - s.x, this.y - s.y) < threatRad) {
          const escAng = Math.atan2(this.y - s.y, this.x - s.x) + 0.7;
          const tx = this.x + Math.cos(escAng) * 115;
          const ty = this.y + Math.sin(escAng) * 115 * PERSPECTIVE_TILT;
          if (this.cds.space <= 0) {
            this.triggerSkill('space', tx, ty, boss);
          } else {
            this.setMoveTarget(tx, ty);
          }
          return;
        }
      }
    }

    if (boss.state === 'pat_graveyard') {
      const d = Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT);
      if (d > 75) {
        const ang = Math.atan2(this.y - boss.y, this.x - boss.x);
        this.setMoveTarget(boss.x + Math.cos(ang) * 55, boss.y + Math.sin(ang) * 55 * PERSPECTIVE_TILT);
        return;
      }
    }

    const backAng = boss.facingAngle + Math.PI + (this.id.charCodeAt(this.id.length - 1) % 3 - 1) * 0.45;
    const desiredX = boss.x + Math.cos(backAng) * 68;
    const desiredY = boss.y + Math.sin(backAng) * 68 * PERSPECTIVE_TILT;
    const distToBoss = Math.hypot(boss.x - this.x, boss.y - this.y);

    if (distToBoss > 165 && this.cds.w <= 0) {
      this.triggerSkill('w', boss.x, boss.y, boss);
    } else if (distToBoss > 95) {
      this.setMoveTarget(desiredX, desiredY);
    } else {
      if (this.cds.f <= 0 && boss.state === 'staggered') {
        this.triggerSkill('f', boss.x, boss.y, boss);
      } else if (this.cds.q <= 0) {
        this.triggerSkill('q', boss.x, boss.y, boss);
      } else if (this.cds.s <= 0) {
        this.triggerSkill('s', boss.x, boss.y, boss);
      } else if (this.cds.r <= 0) {
        this.triggerSkill('r', boss.x, boss.y, boss);
      } else {
        this.triggerBasicAttack(boss.x, boss.y);
      }
    }
  }

  rotateTowards(targetAngle, dt) {
    let diff = targetAngle - this.facingAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.facingAngle += diff * Math.min(1.0, this.turnSpeed * dt);
  }

  updateFootSteps(dt) {
    const renderAng = this.getRenderFacingAngle();
    const cosA = Math.cos(renderAng);
    const sinA = Math.sin(renderAng);

    const isOmnislashWalk = (this.state === 't_cinematic' && this.omnislashStep === 9);
    const isMovingWalk = ((this.state === 'walk' || this.state === 'idle') && this.speed > 4) || isOmnislashWalk;

    // Smoothly blend walk cycle weight (0 when idle/attacking, 1 when striding at full speed)
    const targetWeight = isMovingWalk ? Math.min(1.0, this.speed / (this.baseMaxSpeed * 0.72)) : 0;
    const blendRate = isMovingWalk ? 14.0 : 10.0;
    this.walkWeight += (targetWeight - this.walkWeight) * Math.min(1.0, dt * blendRate);

    if (this.walkWeight > 0.02) {
      // Advance continuous gait phase proportional to ground velocity so boots never skate!
      const strideFreq = this.speed / 14.8;         // quick enough that a planted boot barely slides (it used to glide forward at ~60% of body speed)
      this.walkPhase += dt * Math.max(2.6, strideFreq);

      // Trigger subtle armored step impulse at each foot plant (every PI half-cycle)
      const halfCycle = Math.floor((this.walkPhase + 0.25) / Math.PI);
      if (halfCycle !== this.lastStepHalfCycle && this.speed > 28) {
        this.lastStepHalfCycle = halfCycle;
        this.pelvisVelZ -= 9.5 * this.walkWeight;
        this.pauldronVelZ -= 14.0 * this.walkWeight;
      }
    }

    // Move direction vector for natural directional striding
    const moveAng = (this.speed > 6) ? this.moveAngle : renderAng;
    const mCos = Math.cos(moveAng);
    const mSin = Math.sin(moveAng);

    // Compute continuous anti-phase gait positions for Left (phase) and Right (phase + PI) feet
    const w = this.walkWeight;
    const strideRadius = 14.5 * w;
    const liftHeight = 9.5 * w;

    const footConfigs = [
      { foot: this.leftFoot, phase: this.walkPhase, sideOffset: -this.hipWidth, restFwd: 3.0 },
      { foot: this.rightFoot, phase: this.walkPhase + Math.PI, sideOffset: this.hipWidth, restFwd: -3.0 }
    ];

    for (const cfg of footConfigs) {
      const f = cfg.foot;

      // 1. Handle explicit combat lunge steps (from basic attacks / skills)
      if (f.stepping) {
        f.stepProg += dt / f.stepDur;
        if (f.stepProg >= 1.0) {
          f.stepProg = 1.0;
          f.stepping = false;
          f.x = f.targetX;
          f.y = f.targetY;
          f.z = 0;
          f.angle = renderAng;
          this.pelvisVelZ -= 15;
          this.pauldronVelZ -= 22;
        } else {
          const t = f.stepProg;
          const s = t * t * (3 - 2 * t);
          f.x = f.startX + (f.targetX - f.startX) * s;
          f.y = f.startY + (f.targetY - f.startY) * s;
          f.z = Math.sin(t * Math.PI) * 8.0;
          f.angle = renderAng;
        }
        continue;
      }

      // 2. Continuous anti-phase walking gait + smooth idle stance settle
      // Asymmetric swing-vs-stance curve: foot swings forward smoothly in the air, then glides back on the ground
      const rawSin = Math.sin(cfg.phase);
      const rawCos = Math.cos(cfg.phase);
      const swingFwd = (rawSin + 0.18 * Math.sin(cfg.phase * 2)) * strideRadius;

      // Lift curve: only lifts during the forward swing half-cycle (rawCos > 0), stays planted during ground push!
      const swingLift = rawCos > 0 ? Math.pow(rawCos, 1.35) * liftHeight : 0;

      // Blend rest stance offset with active directional stride
      const restX = this.x + (cfg.restFwd * (1 - w * 0.7) * cosA - cfg.sideOffset * sinA);
      const restY = this.y + (cfg.restFwd * (1 - w * 0.7) * sinA + cfg.sideOffset * cosA);

      const gaitTargetX = restX + mCos * swingFwd;
      const gaitTargetY = restY + mSin * swingFwd;

      const followRate = Math.min(1.0, dt * (w > 0.15 ? 44.0 : 14.0));
      f.x += (gaitTargetX - f.x) * followRate;
      f.y += (gaitTargetY - f.y) * followRate;
      f.z += (swingLift - f.z) * Math.min(1.0, dt * 30.0);
      f.angle = renderAng;
      f.pitch = rawCos * 0.28 * w; // Subtle heel-to-toe sabaton pitch during stride!
    }
  }

  startFootStep(foot, tx, ty) {
    foot.stepping = true;
    foot.stepProg = 0;
    foot.stepDur = 0.20;
    foot.startX = foot.x;
    foot.startY = foot.y;
    foot.targetX = this.x + (tx - this.x) * 1.15;
    foot.targetY = this.y + (ty - this.y) * 1.15;
  }

  updateCapeNodes(dt) {
    const renderAng = this.getRenderFacingAngle();
    const cosA = Math.cos(renderAng);
    const sinA = Math.sin(renderAng);
    const time = performance.now() * 0.004;

    // If the top cape node is more than 55px away from the player (e.g., after teleporting or fast leaps), snap the cape cleanly!
    if (
      Math.hypot(this.capeNodes[0].x - this.x, this.capeNodes[0].y - this.y) > 55 ||
      Math.abs(this.capeNodes[0].z - (44 + this.jumpZ)) > 55
    ) {
      this.resetCapeNodes();
    }

    // Centrifugal flare when spinning in [Q] or Combo 4!
    const isSpinning = (this.state === 'q_spin' || (this.state === 'combo' && this.comboStep === 4) || this.state === 'wakeup_roll');
    const spinFlare = isSpinning ? 6.2 : 4.2;

    this.capeNodes[0].x = this.x - 6 * cosA;
    this.capeNodes[0].y = this.y - 6 * sinA;
    this.capeNodes[0].z = 44 + this.jumpZ + this.pelvisBounceZ * 0.5;

    for (let i = 1; i < this.capeNodes.length; i++) {
      const prev = this.capeNodes[i - 1];
      const cur = this.capeNodes[i];
      const sway = Math.sin(time * 2.8 - i * 0.7) * (1.2 + i * 0.6);
      const velLagX = Math.max(-6, Math.min(6, (this.vx + this.kbVx * 0.5) * 0.016));
      const velLagY = Math.max(-6, Math.min(6, (this.vy + this.kbVy * 0.5) * 0.016));
      const dx = prev.x + (-spinFlare * cosA - sway * sinA) - velLagX;
      const dy = prev.y + (-spinFlare * sinA + sway * cosA) - velLagY;
      const dz = prev.z - (isSpinning ? 4.2 : 6.8) + Math.min(3.0, this.speed * 0.02 * i);
      const rate = Math.min(1, dt * (isSpinning ? 26 : (20 - i * 1.5)));
      cur.x += (dx - cur.x) * rate;
      cur.y += (dy - cur.y) * rate;
      cur.z += (dz - cur.z) * rate;

      // Hard 3D distance constraint (XY and Z) so cape segments can never snag or stretch Mr. Fantastic style during combos or jumps!
      const segDist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      if (segDist > 10.5) {
        const pull = 10.5 / segDist;
        cur.x = prev.x + (cur.x - prev.x) * pull;
        cur.y = prev.y + (cur.y - prev.y) * pull;
      }
      const dzDiff = cur.z - prev.z;
      if (Math.abs(dzDiff) > 9.5) {
        cur.z = prev.z + Math.sign(dzDiff) * 9.5;
      }
    }
  }

  localToWorld(fwd, side, up) {
    const renderAng = this.getRenderFacingAngle();
    const cosA = Math.cos(renderAng);
    const sinA = Math.sin(renderAng);
    const wx = fwd * cosA - side * sinA;
    const wy = fwd * sinA + side * cosA;
    const totalUp = up + this.jumpZ;
    return {
      wx, wy, up: totalUp,
      sx: this.x + wx,
      sy: this.y + wy * PERSPECTIVE_TILT - totalUp,
      depth: wy
    };
  }

  worldOffsetToScreen(wx, wy, up) {
    return {
      wx, wy, up,
      sx: this.x + wx,
      sy: this.y + wy * PERSPECTIVE_TILT - up,
      depth: wy
    };
  }

  solveLegIK(hip3D, ankle3D, sideSign) {
    const dx = ankle3D.wx - hip3D.wx;
    const dy = ankle3D.wy - hip3D.wy;
    const dz = ankle3D.up - hip3D.up;
    const L1 = this.thighLen, L2 = this.shinLen;
    const rawDist = Math.hypot(dx, dy, dz) || 0.001;
    const d = Math.min(rawDist, (L1 + L2) * 0.995);
    const ux = dx / rawDist, uy = dy / rawDist, uz = dz / rawDist;
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const renderAng = this.getRenderFacingAngle();
    const cosA = Math.cos(renderAng), sinA = Math.sin(renderAng);
    const poleX = cosA - (sideSign * 0.25) * sinA;
    const poleY = sinA + (sideSign * 0.25) * cosA;
    const poleZ = 0.16;
    const dot = poleX * ux + poleY * uy + poleZ * uz;
    let px = poleX - dot * ux, py = poleY - dot * uy, pz = poleZ - dot * uz;
    const pLen = Math.hypot(px, py, pz) || 1;
    px /= pLen; py /= pLen; pz /= pLen;
    return this.worldOffsetToScreen(
      hip3D.wx + ux * a + px * h,
      hip3D.wy + uy * a + py * h,
      hip3D.up + uz * a + pz * h
    );
  }

  // =========================================================================
  // MASTER 2.5D PAINTER'S ALGORITHM RENDERER FOR BREAKER CLASS
  // Includes Full-Body Spin Kinematics, Knockdown Poses & Shoulder Stance!
  // =========================================================================
  draw(ctx) {
    const time = performance.now() * 0.003;
    const renderAng = this.getRenderFacingAngle();
    const cosA = Math.cos(renderAng);
    const sinA = Math.sin(renderAng);

    // 1. Ground Shadow & Selection Circle
    ctx.save();
    ctx.translate(this.x, this.y);
    const shadowScale = Math.max(0.45, 1.0 - this.jumpZ / 130);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.74)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 34 * shadowScale, 34 * PERSPECTIVE_TILT * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.scale(1, PERSPECTIVE_TILT);
    ctx.rotate(this.facingAngle);
    const ringColor = this.isLocal ? '#22c55e' : '#38bdf8';
    ctx.strokeStyle = this.overpowerSurge ? '#facc15' : ringColor;
    ctx.lineWidth = this.isLocal ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = this.overpowerSurge ? '#facc15' : ringColor;
    ctx.beginPath();
    ctx.moveTo(36, 0);
    ctx.lineTo(29, -4.5);
    ctx.lineTo(29, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    if (this.hp <= 0) {
      ctx.save();
      ctx.translate(this.x, this.y - 18);
      ctx.fillStyle = '#ef4444';
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`💀 ${this.name} (DOWN)`, 0, 0);
      ctx.restore();
      return;
    }

    // 2. Compute Kinematics Pose for Current Breaker State
    const lFootRelFwd = (this.leftFoot.x - this.x) * cosA + (this.leftFoot.y - this.y) * sinA;
    const rFootRelFwd = (this.rightFoot.x - this.x) * cosA + (this.rightFoot.y - this.y) * sinA;
    const rawFootDiff = Math.max(-1, Math.min(1, (lFootRelFwd - rFootRelFwd) / 24));
    const gaitSwing = Math.sin(this.walkPhase || 0) * (this.walkWeight || 0);
    const strideDiff = rawFootDiff * (1 - (this.walkWeight || 0) * 0.45) + gaitSwing * 0.55;
    // Double-frequency vertical gait bob: rises slightly at mid-stride and dips at double-support plant
    const gaitBobZ = -Math.cos((this.walkPhase || 0) * 2) * 1.45 * (this.walkWeight || 0);

    let crouchZ = gaitBobZ;
    let torsoYaw = -strideDiff * 0.22;
    let torsoLeanFwd = Math.min(4.2, (this.speed / this.baseMaxSpeed) * 3.8);
    let headPitchZ = -gaitBobZ * 0.25;
    const breatheZ = Math.sin(this.breathePhase) * 1.0;

    // =======================================================================
    // ICONIC DEFAULT STANCE: COLOSSAL GREATSWORD RESTED ACROSS RIGHT SHOULDER!
    // Right hand raised holding the hilt near right shoulder/ear, massive blade
    // resting diagonally across the back/shoulders, left hand swinging naturally!
    // =======================================================================
    const bob = Math.sin(this.breathePhase * 1.2) * 1.1 + gaitBobZ * 0.85 + strideDiff * 1.6;
    let rHandLocal = { fwd: 7, side: 14, up: 47 + breatheZ };
    let lHandLocal = { fwd: 11, side: -14, up: 31 - strideDiff * 3 };
    let swordTipLocal = { fwd: -52, side: -38, up: 76 + bob };
    let activeSlashArc = null;

    const p = 1.0 - (this.stateTimer / (this.stateDuration || 1));

    if (this.state === 'idle' || this.state === 'walk') {
      // Keep the badass Shoulder-Rested Greatsword Stance with smooth counter-swinging left arm!
      rHandLocal = { fwd: 7 + strideDiff * 1.8, side: 14, up: 47 + breatheZ + gaitBobZ * 0.4 };
      lHandLocal = {
        fwd: 10 - strideDiff * 5.8,
        side: -14 - Math.abs(strideDiff) * 1.2,
        up: 31 + breatheZ * 0.5 + Math.abs(strideDiff) * 1.6
      };
      swordTipLocal = { fwd: -54 - strideDiff * 2.2, side: -36 + strideDiff * 1.8, up: 76 + bob };
    }
    // =======================================================================
    // HIT-REACTION / PUSH / KNOCKBACK / KNOCKDOWN POSES!
    // =======================================================================
    else if (this.state === 'hit_stagger') {
      const flinch = Math.sin(p * Math.PI);
      crouchZ = -5 * flinch;
      torsoLeanFwd = -7 * flinch;
      headPitchZ = -3 * flinch;
      rHandLocal = { fwd: 12, side: 15, up: 38 };
      lHandLocal = { fwd: 14, side: -12, up: 36 };
      swordTipLocal = { fwd: 18, side: -32, up: 78 };
    } else if (this.state === 'hit_knockback') {
      const recoil = 1 - p * 0.65;
      crouchZ = -8 * recoil;
      torsoLeanFwd = -11 * recoil;
      headPitchZ = -4 * recoil;
      rHandLocal = { fwd: 14, side: 18, up: 34 };
      lHandLocal = { fwd: 16, side: -16, up: 36 };
      swordTipLocal = { fwd: -25, side: 48, up: 58 };
    } else if (this.state === 'hit_knockdown') {
      if (p < 0.46) {
        // Airborne launch: blown backward in mid-air with chest pitched back & arms wide!
        crouchZ = -8;
        torsoLeanFwd = -16;
        headPitchZ = -6;
        rHandLocal = { fwd: -10, side: 22, up: 38 };
        lHandLocal = { fwd: -8, side: -22, up: 36 };
        swordTipLocal = { fwd: -68, side: 54, up: 65 };
      } else if (p < 0.78) {
        // Prone on stone floor: lying flat on back after ground bounce!
        crouchZ = -23;
        torsoLeanFwd = -18;
        headPitchZ = -10;
        rHandLocal = { fwd: -8, side: 22, up: 12 };
        lHandLocal = { fwd: 6, side: -18, up: 12 };
        swordTipLocal = { fwd: -65, side: 58, up: 4 };
      } else {
        // Heavy push-up recovery: planting knee and heaving greatsword back onto shoulder!
        const rec = (p - 0.78) / 0.22;
        crouchZ = -23 * (1 - rec);
        torsoLeanFwd = -18 * (1 - rec) + 4 * Math.sin(rec * Math.PI);
        rHandLocal = { fwd: -8 + 15 * rec, side: 22 - 8 * rec, up: 12 + 35 * rec };
        lHandLocal = { fwd: 6 + 4 * rec, side: -18 + 4 * rec, up: 12 + 19 * rec };
        swordTipLocal = { fwd: -65 + 11 * rec, side: 58 - 94 * rec, up: 4 + 72 * rec };
      }
    } else if (this.state === 'wakeup_roll') {
      crouchZ = -12 * Math.sin(p * Math.PI);
      torsoLeanFwd = 10 * Math.sin(p * Math.PI);
      rHandLocal = { fwd: 14, side: 12, up: 32 };
      lHandLocal = { fwd: 14, side: -12, up: 30 };
      swordTipLocal = { fwd: -48, side: -28, up: 54 };
    } else if (this.state === 'clash_lock') {
      // Dynamic Multi-Attempt Greatsword Clash Stance!
      // Changes guard angle & counter-slash arc to match each of Vaelgor's 4 lethal attempts!
      const boss = window.game && window.game.boss;
      const style = (boss && boss.clashCurrentStyle) || this.clashCurrentStyle || 'overhead_crush';
      const parryFlash = Math.max(0, Math.min(1, (this.clashLastParryFlash || 0) / 0.28));
      const tremor = Math.sin(time * 42) * 2.0;

      if (style === 'slash_left' || style === 'flurry_1') {
        // Parrying Vaelgor's right-to-left horizontal cleave / first flurry slash!
        crouchZ = -10 + tremor * 0.3;
        torsoLeanFwd = 12 + parryFlash * 8;
        torsoYaw = -0.52 - parryFlash * 0.35;
        rHandLocal = { fwd: 26 + parryFlash * 10, side: -14, up: 40 };
        lHandLocal = { fwd: 24 + parryFlash * 10, side: -18, up: 36 };
        swordTipLocal = { fwd: 48 + parryFlash * 18, side: 46, up: 94 };
        activeSlashArc = {
          type: 'parry_guard',
          prog: 0.95,
          color: parryFlash > 0.15 ? '#fde047' : '#38bdf8',
          radius: 68 + parryFlash * 16
        };
      } else if (style === 'slash_right' || style === 'flurry_2') {
        // Backhand cross-guard / deflecting Vaelgor's left-to-right cross cleave!
        crouchZ = -11 + tremor * 0.3;
        torsoLeanFwd = 13 + parryFlash * 8;
        torsoYaw = 0.56 + parryFlash * 0.35;
        rHandLocal = { fwd: 28 + parryFlash * 10, side: 16, up: 40 };
        lHandLocal = { fwd: 25 + parryFlash * 10, side: 12, up: 36 };
        swordTipLocal = { fwd: 50 + parryFlash * 18, side: -48, up: 94 };
        activeSlashArc = {
          type: 'parry_guard',
          prog: 0.95,
          color: parryFlash > 0.15 ? '#fde047' : '#38bdf8',
          radius: 70 + parryFlash * 16
        };
      } else if (style === 'flurry_3' || style === 'extinction_drive') {
        // Deep low-stance upward deflection against Vaelgor's rising uppercut / extinction drive!
        crouchZ = -13 + tremor * 0.4;
        torsoLeanFwd = 16 + parryFlash * 10;
        torsoYaw = 0.22 - parryFlash * 0.45;
        headPitchZ = 6;
        rHandLocal = { fwd: 32 + parryFlash * 12, side: 8, up: 46 + parryFlash * 8 };
        lHandLocal = { fwd: 30 + parryFlash * 12, side: -8, up: 44 + parryFlash * 8 };
        swordTipLocal = { fwd: 62 + parryFlash * 22, side: -24, up: 114 + parryFlash * 10 };
        activeSlashArc = {
          type: 'parry_guard',
          prog: 0.98,
          color: '#facc15',
          radius: 76 + parryFlash * 20
        };
      } else {
        // 'overhead_crush': High two-handed overhead brace against Vaelgor's guillotine slam!
        crouchZ = -9 + tremor * 0.4;
        torsoLeanFwd = 11 + tremor * 0.6 + parryFlash * 7;
        torsoYaw = 0.14;
        headPitchZ = 4;
        rHandLocal = { fwd: 28 + tremor + parryFlash * 8, side: 7, up: 48 + parryFlash * 6 };
        lHandLocal = { fwd: 26 + tremor + parryFlash * 8, side: -7, up: 46 + parryFlash * 6 };
        swordTipLocal = { fwd: 44 + tremor * 1.4 + parryFlash * 14, side: -32, up: 108 + parryFlash * 8 };
        activeSlashArc = {
          type: 'parry_guard',
          prog: 0.92,
          color: parryFlash > 0.15 ? '#fde047' : '#38bdf8',
          radius: 68 + parryFlash * 14
        };
      }
    }
    // =======================================================================
    // [Q] SPIN LUNGE -> FULL-BODY 720° WHIRLWIND -> SLAM -> SHOULDER HEAVE!
    // =======================================================================
    else if (this.state === 'q_windup') {
      const coil = Math.pow(p, 1.5);
      crouchZ = -9 * coil;
      torsoLeanFwd = -5 * coil;
      torsoYaw = -0.85 * coil;
      rHandLocal = { fwd: -8 * coil, side: -22 * coil, up: 32 };
      lHandLocal = { fwd: 4, side: -16 * coil, up: 30 };
      swordTipLocal = { fwd: -78 * coil, side: -74 * coil, up: 18 };
    } else if (this.state === 'q_spin') {
      // Body leans backward to counterbalance the centrifugal pull of the outstretched colossal blade!
      crouchZ = -6;
      torsoLeanFwd = -6;
      torsoYaw = 0.30;
      rHandLocal = { fwd: 28, side: 6, up: 34 };
      lHandLocal = { fwd: 26, side: -6, up: 32 };
      swordTipLocal = { fwd: 116, side: 8, up: 32 };
      activeSlashArc = {
        type: 'whirlwind',
        prog: Math.sin(p * Math.PI),
        color: '#38bdf8',
        radius: 102
      };
    } else if (this.state === 'q_recover') {
      if (p < 0.44) {
        // First 44%: Deep one-knee lunge with colossal greatsword buried upright/diagonally in the shattered earth!
        const kneel = 1 - (p / 0.44) * 0.2;
        crouchZ = -12 * kneel;
        torsoLeanFwd = 9 * kneel;
        headPitchZ = -4 * kneel;
        rHandLocal = { fwd: 28, side: 6, up: 46 };
        lHandLocal = { fwd: 26, side: -4, up: 44 };
        swordTipLocal = { fwd: 54, side: 4, up: 0 };
      } else {
        // Remaining 56%: Pushes up with legs, heaves the colossal blade high overhead & drops it onto his shoulders!
        const h = (p - 0.44) / 0.56;
        const ease = 1 - Math.pow(1 - h, 3);
        const arcUp = Math.sin(h * Math.PI);
        crouchZ = -10 * (1 - ease);
        torsoLeanFwd = 7 * (1 - ease) - 3 * arcUp;
        torsoYaw = -0.30 * arcUp;
        rHandLocal = { fwd: 28 - 21 * ease, side: 6 + 8 * ease, up: 46 + 1 * ease + arcUp * 14 };
        lHandLocal = { fwd: 26 - 15 * ease, side: -4 - 10 * ease, up: 44 - 13 * ease };
        swordTipLocal = {
          fwd: 54 - 108 * ease,
          side: 4 - 40 * ease,
          up: arcUp * 56 + 76 * ease
        };
      }
    }
    // =======================================================================
    // [W] EARTHBREAKER (High Overhead Mid-Air Coil -> Vertical Meteor Plunge -> Earth Plant)
    // =======================================================================
    else if (this.state === 'w_leap') {
      if (p < 0.64) {
        // Ascent & Apex: Arches chest back in mid-air with both hands cocking the colossal blade high behind his head!
        const coil = Math.min(1, p / 0.50);
        torsoLeanFwd = -10 * coil;
        headPitchZ = 4 * coil;
        crouchZ = 5 * Math.sin(coil * Math.PI * 0.5);
        rHandLocal = { fwd: -8 * coil, side: 6, up: 48 + 24 * coil };
        lHandLocal = { fwd: -8 * coil, side: -6, up: 46 + 24 * coil };
        swordTipLocal = { fwd: -48 * coil, side: 0, up: 138 + 16 * coil };
      } else {
        // Downward Plunge: Jackknifes forward and whips the greatsword through a vertical 180° overhead arc!
        const rawS = (p - 0.64) / 0.36;
        const snap = Math.pow(rawS, 2.2);
        torsoLeanFwd = -10 * (1 - snap) + 14 * snap;
        crouchZ = -8 * snap;
        rHandLocal = { fwd: -8 + 36 * snap, side: 5, up: 72 - 34 * snap };
        lHandLocal = { fwd: -8 + 36 * snap, side: -5, up: 70 - 34 * snap };
        swordTipLocal = {
          fwd: -48 + 136 * Math.sin(snap * Math.PI * 0.62),
          side: 0,
          up: Math.max(0, 154 * (1 - snap))
        };
        activeSlashArc = {
          type: 'vertical_down',
          prog: snap,
          color: '#fbbf24',
          radius: 108
        };
      }
    } else if (this.state === 'w_slam') {
      // Deep two-handed crater kneel with the colossal blade planted in the ruptured earth!
      crouchZ = -14 * (1 - p * 0.6);
      torsoLeanFwd = 12 * (1 - p * 0.6);
      headPitchZ = -4 * (1 - p);
      rHandLocal = { fwd: 28, side: 5, up: 44 };
      lHandLocal = { fwd: 28, side: -5, up: 42 };
      swordTipLocal = { fwd: 52, side: 0, up: 0 };
      activeSlashArc = {
        type: 'vertical_down',
        prog: Math.max(0, 1 - p * 1.4),
        color: '#fbbf24',
        radius: 112
      };
    }
    // =======================================================================
    // [E] BULWARK PARRY STANCE (Unmistakable Horizontal/Diagonal Two-Handed Cross-Guard + Aegis Crest)
    // =======================================================================
    else if (this.state === 'e_bulwark') {
      crouchZ = -8;
      torsoLeanFwd = 5;
      torsoYaw = 0.22;
      // Right hand grips hilt on right; Left gauntlet braces the flat of the broad blade on the left!
      rHandLocal = { fwd: 26, side: 24, up: 34 };
      lHandLocal = { fwd: 28, side: -16, up: 42 };
      swordTipLocal = { fwd: 30, side: -58, up: 48 };
      activeSlashArc = {
        type: 'parry_guard',
        prog: 1.0 - p * 0.35,
        color: '#fde047',
        radius: 48
      };
    }
    // =======================================================================
    // [R] GETSUGA CRESCENT WAVE (Deep Battoujutsu Right-Hip Coil -> 180° Rotational Uncoil)
    // =======================================================================
    else if (this.state === 'r_charge') {
      const coil = Math.min(1, this.rChargeTime / 0.45);
      crouchZ = -10 * coil;
      torsoLeanFwd = -5 * coil;
      torsoYaw = 0.95 * coil;
      rHandLocal = { fwd: -12 * coil, side: 26 * coil, up: 32 };
      lHandLocal = { fwd: -6 * coil, side: 18 * coil, up: 30 };
      swordTipLocal = { fwd: -74 * coil, side: 88 * coil, up: 18 };
    } else if (this.state === 'r_slash') {
      const snap = 1 - Math.pow(1 - p, 4.2);
      const sweepAng = 1.55 - snap * 3.10;
      crouchZ = -7;
      torsoLeanFwd = 9;
      torsoYaw = 0.95 - snap * 1.95;
      rHandLocal = { fwd: Math.cos(sweepAng) * 28, side: Math.sin(sweepAng) * 28, up: 36 };
      lHandLocal = { fwd: Math.cos(sweepAng) * 24, side: Math.sin(sweepAng) * 24, up: 34 };
      swordTipLocal = { fwd: Math.cos(sweepAng - 0.12) * 112, side: Math.sin(sweepAng - 0.12) * 112, up: 34 };
      activeSlashArc = {
        type: 'horizontal',
        startAng: 1.55,
        endAng: -1.55,
        prog: Math.sin(p * Math.PI),
        color: this.rPerfectRelease ? '#fde047' : '#38bdf8',
        radius: this.rPerfectRelease ? 114 : 98
      };
    }
    // =======================================================================
    // [A] IRON TACKLE (Left Armored Pauldron Battering-Ram Charge + Kinetic Ram Cone)
    // =======================================================================
    else if (this.state === 'a_tackle') {
      crouchZ = -10;
      torsoLeanFwd = 15;
      torsoYaw = 0.78; // Twists left shoulder/pauldron directly forward as a battering ram!
      headPitchZ = -5;
      lHandLocal = { fwd: 24, side: -6, up: 36 };
      rHandLocal = { fwd: -16, side: 22, up: 26 };
      swordTipLocal = { fwd: -94, side: 48, up: 12 };
      activeSlashArc = {
        type: 'shoulder_ram',
        prog: 1.0 - p * 0.4,
        color: '#38bdf8',
        radius: 52
      };
    }
    // =======================================================================
    // [S] BEDROCK DRAG -> 180° VERTICAL HEAVENWARD UPPERCUT!
    // =======================================================================
    else if (this.state === 's_drag') {
      crouchZ = -11;
      torsoLeanFwd = 11;
      torsoYaw = 0.68;
      rHandLocal = { fwd: -6, side: 22, up: 22 };
      lHandLocal = { fwd: 4, side: 14, up: 20 };
      swordTipLocal = { fwd: -86, side: 48, up: 0 };
    } else if (this.state === 's_uppercut') {
      const snap = 1 - Math.pow(1 - p, 3.8);
      crouchZ = -10 * (1 - snap) + 6 * snap;
      torsoLeanFwd = 10 * (1 - snap) - 6 * snap;
      torsoYaw = 0.68 - 1.45 * snap;
      rHandLocal = { fwd: 26, side: 12 - 20 * snap, up: 24 + 46 * snap };
      lHandLocal = { fwd: 24, side: 6 - 18 * snap, up: 22 + 44 * snap };
      swordTipLocal = {
        fwd: -60 + 162 * Math.sin(snap * Math.PI * 0.65),
        side: 32 - 52 * snap,
        up: Math.max(0, -4 + 142 * snap)
      };
      activeSlashArc = {
        type: 'vertical_up',
        prog: Math.sin(p * Math.PI),
        color: '#fbbf24',
        radius: 102
      };
    }
    // =======================================================================
    // [D] COUNTER SKILL (True Twin-Diagonal Anime X-Slash with Wide Arm Sweeps!)
    // =======================================================================
    else if (this.state === 'd_cleave1') {
      // Slash 1: Low-Right to High-Left Rising Diagonal Counter Cut!
      const snap = 1 - Math.pow(1 - p, 4.0);
      const sweepAng = 1.42 - snap * 2.84;
      crouchZ = -7;
      torsoLeanFwd = 9;
      torsoYaw = 0.90 - snap * 1.80;
      rHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 26 + 24 * snap };
      lHandLocal = { fwd: Math.cos(sweepAng) * 22, side: Math.sin(sweepAng) * 22, up: 24 + 24 * snap };
      swordTipLocal = {
        fwd: Math.cos(sweepAng - 0.10) * 106,
        side: Math.sin(sweepAng - 0.10) * 106,
        up: 12 + 64 * snap
      };
      activeSlashArc = {
        type: 'horizontal',
        startAng: 1.42,
        endAng: -1.42,
        prog: Math.sin(p * Math.PI),
        color: '#38bdf8',
        radius: 96
      };
    } else if (this.state === 'd_cleave2') {
      // Slash 2: High-Left to Low-Right Falling Diagonal Cross-Cut!
      const snap = 1 - Math.pow(1 - p, 4.0);
      const sweepAng = -1.45 + snap * 2.90;
      crouchZ = -6;
      torsoLeanFwd = 10;
      torsoYaw = -0.92 + snap * 1.84;
      rHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 50 - 22 * snap };
      lHandLocal = { fwd: Math.cos(sweepAng) * 22, side: Math.sin(sweepAng) * 22, up: 48 - 22 * snap };
      swordTipLocal = {
        fwd: Math.cos(sweepAng + 0.10) * 108,
        side: Math.sin(sweepAng + 0.10) * 108,
        up: 74 - 62 * snap
      };
      activeSlashArc = {
        type: 'horizontal',
        startAng: -1.45,
        endAng: 1.45,
        prog: Math.sin(p * Math.PI),
        color: '#fbbf24',
        radius: 100
      };
    }
    // =======================================================================
    // [F] TITAN'S WRATH (3-Phase Synchronized Levitating Overhead Coil -> Cataclysmic Downswing -> Crater Plant!)
    // =======================================================================
    else if (this.state === 'f_wrath') {
      if (p < 0.55) {
        // Phase 1 (0..55%): Levitating Two-Handed Overhead Gather!
        const w = Math.pow(p / 0.55, 1.5);
        crouchZ = 4 * w;
        torsoLeanFwd = -9 * w;
        headPitchZ = 5 * w;
        rHandLocal = { fwd: -8 * w, side: 6, up: 38 + 34 * w };
        lHandLocal = { fwd: -8 * w, side: -6, up: 36 + 34 * w };
        swordTipLocal = { fwd: -42 * w, side: 0, up: 120 + 36 * w };
      } else if (p < 0.76) {
        // Phase 2 (55..76%): Violent Exponential Overhead Cleave Downward!
        const rawS = (p - 0.55) / 0.21;
        const snap = 1 - Math.pow(1 - rawS, 4.2);
        crouchZ = -14 * snap;
        torsoLeanFwd = -9 * (1 - snap) + 14 * snap;
        rHandLocal = { fwd: -8 + 38 * snap, side: 5, up: 72 - 30 * snap };
        lHandLocal = { fwd: -8 + 38 * snap, side: -5, up: 70 - 30 * snap };
        swordTipLocal = {
          fwd: -42 + 148 * Math.sin(snap * Math.PI * 0.62),
          side: 0,
          up: Math.max(0, 156 * (1 - snap))
        };
        activeSlashArc = {
          type: 'vertical_down',
          prog: Math.sin(rawS * Math.PI),
          color: this.titanIsRiposte ? '#fde047' : '#f59e0b',
          radius: 122
        };
      } else {
        // Phase 3 (76..100%): Deep Kneeling Impact with Colossal Greatsword Buried in the Crater!
        const rec = (p - 0.76) / 0.24;
        crouchZ = -14;
        torsoLeanFwd = 13;
        headPitchZ = -5;
        rHandLocal = { fwd: 30, side: 5, up: 42 };
        lHandLocal = { fwd: 30, side: -5, up: 40 };
        swordTipLocal = { fwd: 58, side: 0, up: 0 };
        activeSlashArc = {
          type: 'vertical_down',
          prog: Math.max(0, 1 - rec * 1.3),
          color: this.titanIsRiposte ? '#fde047' : '#facc15',
          radius: 124
        };
      }
    }
    // =======================================================================
    // [LMB] 5-HIT GREATSWORD COMBO (Distinct Windup -> Wide Arm Sweep -> Follow-Through per Step!)
    // =======================================================================
    else if (this.state === 'combo') {
      const arcCol = this.overpowerSurge ? '#facc15' : this.weaponColor;
      if (this.comboStep === 1) {
        // Step 1: Wide Right-to-Left Horizontal Vanguard Cleave
        if (p < 0.28) {
          const coil = Math.pow(p / 0.28, 1.6);
          crouchZ = -5 * coil;
          torsoLeanFwd = -3 * coil;
          torsoYaw = 0.88 * coil;
          rHandLocal = { fwd: -10 * coil, side: 26 * coil, up: 36 };
          lHandLocal = { fwd: -6 * coil, side: 20 * coil, up: 34 };
          swordTipLocal = { fwd: -64 * coil, side: 88 * coil, up: 38 };
        } else {
          const rawS = (p - 0.28) / 0.72;
          const snap = 1 - Math.pow(1 - rawS, 4.0);
          const sweepAng = 1.48 - snap * 2.88;
          crouchZ = -6;
          torsoLeanFwd = 7 * snap;
          torsoYaw = 0.88 - snap * 1.76;
          rHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 34 };
          lHandLocal = { fwd: Math.cos(sweepAng) * 22, side: Math.sin(sweepAng) * 22, up: 32 };
          swordTipLocal = { fwd: Math.cos(sweepAng - 0.12) * 102, side: Math.sin(sweepAng - 0.12) * 102, up: 32 };
          activeSlashArc = {
            type: 'horizontal',
            startAng: 1.48,
            endAng: -1.40,
            prog: Math.sin(rawS * Math.PI),
            color: arcCol,
            radius: 90
          };
        }
      } else if (this.comboStep === 2) {
        // Step 2: Reverse Left-to-Right Backhand Cleave
        if (p < 0.26) {
          const coil = Math.pow(p / 0.26, 1.6);
          crouchZ = -5 * coil;
          torsoYaw = -0.88 * coil;
          rHandLocal = { fwd: -8 * coil, side: -24 * coil, up: 35 };
          lHandLocal = { fwd: -4 * coil, side: -20 * coil, up: 33 };
          swordTipLocal = { fwd: -60 * coil, side: -86 * coil, up: 34 };
        } else {
          const rawS = (p - 0.26) / 0.74;
          const snap = 1 - Math.pow(1 - rawS, 4.0);
          const sweepAng = -1.45 + snap * 2.90;
          crouchZ = -6;
          torsoLeanFwd = 7 * snap;
          torsoYaw = -0.88 + snap * 1.76;
          rHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 35 };
          lHandLocal = { fwd: Math.cos(sweepAng) * 22, side: Math.sin(sweepAng) * 22, up: 33 };
          swordTipLocal = { fwd: Math.cos(sweepAng + 0.12) * 102, side: Math.sin(sweepAng + 0.12) * 102, up: 34 };
          activeSlashArc = {
            type: 'horizontal',
            startAng: -1.45,
            endAng: 1.45,
            prog: Math.sin(rawS * Math.PI),
            color: arcCol,
            radius: 90
          };
        }
      } else if (this.comboStep === 3) {
        // Step 3: Low-to-High Rising Diagonal Uppercut Slash
        if (p < 0.30) {
          const coil = Math.pow(p / 0.30, 1.6);
          crouchZ = -9 * coil;
          torsoLeanFwd = 8 * coil;
          torsoYaw = 0.65 * coil;
          rHandLocal = { fwd: -6 * coil, side: 20, up: 24 - 4 * coil };
          lHandLocal = { fwd: 2, side: 12, up: 22 - 4 * coil };
          swordTipLocal = { fwd: -72, side: 46, up: 2 };
        } else {
          const rawS = (p - 0.30) / 0.70;
          const snap = 1 - Math.pow(1 - rawS, 3.8);
          crouchZ = -9 * (1 - snap) + 4 * snap;
          torsoLeanFwd = 8 * (1 - snap) - 4 * snap;
          torsoYaw = 0.65 - 1.35 * snap;
          rHandLocal = { fwd: 24, side: 12 - 20 * snap, up: 22 + 38 * snap };
          lHandLocal = { fwd: 22, side: 6 - 18 * snap, up: 20 + 36 * snap };
          swordTipLocal = {
            fwd: -50 + 148 * Math.sin(snap * Math.PI * 0.65),
            side: 30 - 52 * snap,
            up: Math.max(0, 128 * snap)
          };
          activeSlashArc = {
            type: 'vertical_up',
            prog: Math.sin(rawS * Math.PI),
            color: arcCol,
            radius: 92
          };
        }
      } else if (this.comboStep === 4) {
        // Step 4: Full-Body 360° Tornado Cleave
        crouchZ = -5;
        torsoLeanFwd = -4;
        torsoYaw = 0.25;
        rHandLocal = { fwd: 26, side: 6, up: 34 };
        lHandLocal = { fwd: 24, side: -6, up: 32 };
        swordTipLocal = { fwd: 108, side: 10, up: 32 };
        activeSlashArc = {
          type: 'whirlwind',
          prog: Math.sin(p * Math.PI),
          color: arcCol,
          radius: 94
        };
      } else {
        // Step 5: Airborne Overhead Guillotine Slam!
        if (p < 0.40) {
          const coil = Math.pow(p / 0.40, 1.5);
          crouchZ = 4 * coil;
          torsoLeanFwd = -8 * coil;
          rHandLocal = { fwd: -6 * coil, side: 5, up: 44 + 24 * coil };
          lHandLocal = { fwd: -6 * coil, side: -5, up: 42 + 24 * coil };
          swordTipLocal = { fwd: -38 * coil, side: 0, up: 132 + 16 * coil };
        } else {
          const rawS = Math.min(1, (p - 0.40) / 0.32);
          const snap = 1 - Math.pow(1 - rawS, 4.2);
          crouchZ = -12 * snap;
          torsoLeanFwd = -8 * (1 - snap) + 12 * snap;
          rHandLocal = { fwd: -6 + 34 * snap, side: 5, up: 68 - 26 * snap };
          lHandLocal = { fwd: -6 + 34 * snap, side: -5, up: 66 - 26 * snap };
          swordTipLocal = {
            fwd: -38 + 94 * snap,
            side: 0,
            up: Math.max(0, 148 * (1 - snap))
          };
          activeSlashArc = {
            type: 'vertical_down',
            prog: Math.sin(((p - 0.40) / 0.60) * Math.PI),
            color: arcCol,
            radius: 104
          };
        }
      }
    }
    // [T] OMNISLASH CINEMATIC: Steps 1-8 Rapid Slashes -> Step 9 Stylish Walk-Away & Laying Greatsword on Back!
    else if (this.state === 't_cinematic') {
      if (this.omnislashStep <= 8) {
        const alt = (this.omnislashStep % 2 === 0) ? 1 : -1;
        crouchZ = -6;
        torsoLeanFwd = 10;
        torsoYaw = alt * 0.65;
        rHandLocal = { fwd: 24, side: alt * 18, up: 36 };
        lHandLocal = { fwd: 22, side: alt * 10, up: 34 };
        swordTipLocal = { fwd: 96, side: alt * 54, up: 32 };
        activeSlashArc = {
          type: 'horizontal',
          startAng: -alt * 1.35,
          endAng: alt * 1.35,
          prog: 0.85,
          color: '#38bdf8',
          radius: 98
        };
      } else {
        // Step 9: Walking away on the opposite side while smoothly hoisting & laying the sword onto his back!
        const wp = Math.max(0, Math.min(1, (this.omnislashWalkProgress || 0) / 0.88));
        const ease = 1 - Math.pow(1 - wp, 3);
        const arcUp = Math.sin(wp * Math.PI);
        crouchZ = -3 * (1 - ease);
        torsoLeanFwd = 3 * (1 - ease);
        torsoYaw = -0.35 * (1 - ease);
        rHandLocal = {
          fwd: 20 - 13 * ease + strideDiff * 2.0,
          side: 24 - 10 * ease,
          up: 26 + 21 * ease + arcUp * 12
        };
        lHandLocal = {
          fwd: 12 - 2 * ease - strideDiff * 4.0,
          side: -14,
          up: 30 + breatheZ * 0.5
        };
        swordTipLocal = {
          fwd: 24 - 78 * ease,
          side: 82 - 118 * ease,
          up: 14 + 62 * ease + arcUp * 44
        };
      }
    } else if (this.state === 't_afterglow') {
      // Motionless Back-Turned Shoulder-Rest Pose while Extinction Cleave detonates behind him!
      crouchZ = -1.5;
      torsoLeanFwd = 1.5;
      rHandLocal = { fwd: 7, side: 14, up: 47 };
      lHandLocal = { fwd: 11, side: -14, up: 31 };
      swordTipLocal = { fwd: -54, side: -36, up: 76 };
    }

    // Class hook: subclasses (e.g. the Charge Hammer) can override any pose value before the joints are solved.
    if (typeof this.applyPoseHook === 'function') {
      const P = { crouchZ, torsoYaw, torsoLeanFwd, headPitchZ, rHandLocal, lHandLocal, swordTipLocal, activeSlashArc, p, strideDiff, breatheZ, bob };
      this.applyPoseHook(P);
      ({ crouchZ, torsoYaw, torsoLeanFwd, headPitchZ, rHandLocal, lHandLocal, swordTipLocal, activeSlashArc } = P);
    }

    // 3. Compute 3D Joints
    if (this.jumpZ > 0.5 && this.state !== 'grabbed') {
      this.syncAirborneFeet();
    }
    // Standing tall: idling and walking raise the pelvis to where the legs are nearly straight (it eases in and out, so attacks and
    // their designed crouches are untouched).
    const nowS = performance.now(), dtS = Math.min(0.1, (nowS - (this._slT || nowS)) / 1000); this._slT = nowS;
    const slWant = ((this.state === 'idle' || this.state === 'walk') && (this.jumpZ || 0) < 2) ? 5.0 - 1.6 * (this.walkWeight || 0) : 0;
    this._standLift = (this._standLift || 0) + (slWant - (this._standLift || 0)) * Math.min(1, dtS * 12);
    const pelvisUp = Math.max(6, 31 + this._standLift + crouchZ + this.pelvisBounceZ);
    const pelvis3D = this.localToWorld(0, 0, pelvisUp);
    const hipRockZ = strideDiff * 1.15;
    const lHip3D = this.localToWorld(-strideDiff * 2.4, -this.hipWidth, pelvisUp - 1 + hipRockZ);
    const rHip3D = this.localToWorld(strideDiff * 2.4, this.hipWidth, pelvisUp - 1 - hipRockZ);

    const clampAnkleToHip = (hip3D, foot) => {
      let wx = foot.x - this.x;
      let wy = foot.y - this.y;
      let up = foot.z + 3.5;
      const dx = wx - hip3D.wx;
      const dy = wy - hip3D.wy;
      const dz = up - hip3D.up;
      const maxLegReach = (this.thighLen + this.shinLen) * 0.96;
      const dist3D = Math.hypot(dx, dy, dz) || 0.001;
      if (dist3D > maxLegReach) {
        const s = maxLegReach / dist3D;
        wx = hip3D.wx + dx * s;
        wy = hip3D.wy + dy * s;
        up = hip3D.up + dz * s;
      }
      return this.worldOffsetToScreen(wx, wy, up);
    };

    const lAnkle3D = clampAnkleToHip(lHip3D, this.leftFoot);
    const rAnkle3D = clampAnkleToHip(rHip3D, this.rightFoot);
    const lKnee3D = this.solveLegIK(lHip3D, lAnkle3D, -1);
    const rKnee3D = this.solveLegIK(rHip3D, rAnkle3D, 1);

    const chestUp = pelvisUp + 15 + breatheZ;
    const chest3D = this.localToWorld(torsoLeanFwd, 0, chestUp);
    const neck3D = this.localToWorld(torsoLeanFwd + 1, 0, chestUp + 7);
    const head3D = this.localToWorld(torsoLeanFwd + 2, 0, chestUp + 13.5 + headPitchZ);

    const shoulderSpan = 15.0;
    const lShoulder3D = this.localToWorld(torsoLeanFwd - Math.sin(torsoYaw) * (-shoulderSpan), Math.cos(torsoYaw) * (-shoulderSpan), chestUp + 4 + this.pauldronLagZ * 0.2);
    const rShoulder3D = this.localToWorld(torsoLeanFwd - Math.sin(torsoYaw) * (shoulderSpan), Math.cos(torsoYaw) * (shoulderSpan), chestUp + 4 + this.pauldronLagZ * 0.2);

    const lHand3D = this.localToWorld(lHandLocal.fwd, lHandLocal.side, lHandLocal.up + crouchZ * 0.5);
    const rHand3D = this.localToWorld(rHandLocal.fwd, rHandLocal.side, rHandLocal.up + crouchZ * 0.5);

    const lElbow3D = this.localToWorld((lHandLocal.fwd) * 0.5 - 3, (-shoulderSpan + lHandLocal.side) * 0.5 - 5, (chestUp + lHandLocal.up) * 0.5);
    const rElbow3D = this.localToWorld((rHandLocal.fwd) * 0.5 - 3, (shoulderSpan + rHandLocal.side) * 0.5 + 6, (chestUp + rHandLocal.up) * 0.5);

    const rawTip = this.localToWorld(swordTipLocal.fwd, swordTipLocal.side, swordTipLocal.up);
    const rdx = rawTip.sx - rHand3D.sx;
    const rdy = rawTip.sy - rHand3D.sy;
    const rLen = Math.hypot(rdx, rdy) || 1;
    const isPlantedSword = (
      (this.state === 'q_recover' && p < 0.44) ||
      this.state === 'w_slam' ||
      (this.state === 'f_wrath' && p >= 0.74) ||
      (this.state === 'combo' && this.comboStep === 5 && p >= 0.68) ||
      this.state === 'e_bulwark'
    );
    // Colossal Greatsword Length (82px base; planted/braced states preserve true 3D foreshortening so the tip stays in the earth!)
    const baseLen = isPlantedSword ? Math.max(54, rLen) : Math.max(82, rLen);
    const targetLen = baseLen * this.swordScale * (this.overpowerSurge ? 1.20 : 1.0);
    const swordTip3D = {
      sx: rHand3D.sx + (rdx / rLen) * targetLen,
      sy: rHand3D.sy + (rdy / rLen) * targetLen,
      depth: rawTip.depth
    };

    this.swordTrail.push(rHand3D.sx, rHand3D.sy, swordTip3D.sx, swordTip3D.sy);

    // 4. Depth-Sorted Painter's Render Queue (Sculpted Gothic Vanguard Knight — Full 360° Articulation!)
    // Joints go into a reused frame object and the parts into preallocated slots, so drawing a player
    // creates no per-frame closures or queue objects.
    const cosR = cosA;
    const sinR = sinA;
    const J = this._rigFrame || (this._rigFrame = {});
    J.lHip = lHip3D; J.rHip = rHip3D; J.lKnee = lKnee3D; J.rKnee = rKnee3D; J.lAnkle = lAnkle3D; J.rAnkle = rAnkle3D;
    J.pelvis = pelvis3D; J.chest = chest3D; J.neck = neck3D; J.head = head3D;
    J.lShoulder = lShoulder3D; J.rShoulder = rShoulder3D; J.lElbow = lElbow3D; J.rElbow = rElbow3D;
    J.lHand = lHand3D; J.rHand = rHand3D; J.swordTip = swordTip3D; J.activeSlashArc = activeSlashArc;
    J.time = time; J.cosR = cosR; J.sinR = sinR; J.strideDiff = strideDiff; J.renderAng = renderAng;

    if (!this._renderQueue) {
      this._renderQueue = [];
      for (let i = 0; i < 11; i++) this._renderQueue.push({ part: i, depth: 0 });
      this._renderOrder = this._renderQueue.slice();
    }
    const queue = this._renderQueue;
    queue[0].depth = chest3D.depth - sinR * 14;                              // 4A cloak
    queue[1].depth = (lHip3D.depth + lKnee3D.depth + lAnkle3D.depth) / 3;    // 4B left leg
    queue[2].depth = (rHip3D.depth + rKnee3D.depth + rAnkle3D.depth) / 3;    // 4B right leg
    queue[3].depth = pelvis3D.depth + 0.5;                                   // 4C belt, tassets, tabard
    queue[4].depth = chest3D.depth + 1;                                      // 4D cuirass
    queue[5].depth = (lShoulder3D.depth + lHand3D.depth) * 0.5 + 2;          // 4E left arm
    queue[6].depth = (rShoulder3D.depth + rHand3D.depth) * 0.5 + 2;          // 4E right arm
    queue[7].depth = head3D.depth + 4;                                       // 4F greathelm
    {   // wings (cosmetic): each wing sorts on its own, so from the side the near wing is in front of the body and the far one behind
      const wl = this.localToWorld(-14, -40, 78), wr = this.localToWorld(-14, 40, 78);
      queue[9].depth = wl.depth - 1.5; queue[10].depth = wr.depth - 1.5;
    }
    queue[8].depth = Math.max(rHand3D.depth, swordTip3D.depth) + 5;          // greatsword
    {
      // The blade must never hide the face: when its far end is behind the head and the blade crosses the head on screen,
      // draw it BEFORE the helm (still in front of the body) instead of on top of everything.
      const ax = rHand3D.sx, ay = rHand3D.sy, bx = swordTip3D.sx, by = swordTip3D.sy;
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      const tt = Math.max(0, Math.min(1, ((head3D.sx - ax) * vx + (head3D.sy - ay) * vy) / L2));
      const dHead = Math.hypot(head3D.sx - (ax + vx * tt), head3D.sy - (ay + vy * tt));
      if (dHead < 24 && swordTip3D.depth < head3D.depth + 2) queue[8].depth = head3D.depth + 3;
    }
    if (this.adjustWeaponDepth) this.adjustWeaponDepth(queue, J);

    // Stable insertion sort from push order each frame (same result as the old queue.sort).
    const order = this._renderOrder;
    for (let i = 0; i < 11; i++) {
      const item = queue[i];
      let j = i - 1;
      while (j >= 0 && order[j].depth > item.depth) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = item;
    }
    for (let i = 0; i < 11; i++) {
      switch (order[i].part) {
        case 0: this.drawRigCloak(ctx, J); break;
        case 1: this.drawRigLeg(ctx, J, -1); break;
        case 2: this.drawRigLeg(ctx, J, 1); break;
        case 3: this.drawRigWaist(ctx, J); break;
        case 4: this.drawRigCuirass(ctx, J); break;
        case 5: this.drawRigArm(ctx, J, -1); break;
        case 6: this.drawRigArm(ctx, J, 1); break;
        case 7: this.drawRigHelm(ctx, J); break;
        case 8: this.drawColossalGreatsword(ctx, rHand3D, swordTip3D, activeSlashArc, time); break;
        case 9: if (this.wings) this.drawRigWings(ctx, J, -1); break;
        case 10: if (this.wings) this.drawRigWings(ctx, J, 1); break;
      }
    }

    // 5. Overhead Nameplate & HP / Shield Bar (+ Knockdown Wake-Up Roll Prompt!)
    const barY = head3D.sy - 26;
    ctx.save();
    if (this.noPlate) ctx.globalAlpha = 0;      // (the armory close-up) no name or health bar
    ctx.font = '700 10.5px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    // Dark outline instead of a blurred text shadow (drawn for every player every frame).
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeText(this.name, this.x, barY - 7);
    ctx.fillStyle = this.isLocal ? '#fde047' : '#bae6fd';
    ctx.fillText(this.name, this.x, barY - 7);

    if (this.state === 'hit_knockdown' && this.isLocal) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 11.5px "Segoe UI", system-ui, sans-serif';
      ctx.strokeText('⚡ PRESS [SPACE] TO WAKE-UP ROLL!', this.x, barY - 21);
      ctx.fillText('⚡ PRESS [SPACE] TO WAKE-UP ROLL!', this.x, barY - 21);
    }
    ctx.shadowBlur = 0;

    const bw = 50, bh = 5;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    ctx.fillRect(this.x - bw * 0.5, barY, bw, bh);
    const hpFrac = Math.max(0, Math.min(1, this.hp / this.maxHp));
    ctx.fillStyle = this.isLocal ? '#22c55e' : '#38bdf8';
    ctx.fillRect(this.x - bw * 0.5, barY, bw * hpFrac, bh);

    if (this.shield > 0) {
      const shFrac = Math.min(1, this.shield / this.maxHp);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(this.x - bw * 0.5, barY - 2, bw * shFrac, 2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x - bw * 0.5, barY, bw, bh);

    // Compact [R] Crescent Wave Sweet-Spot Charge Gauge (no noisy text popups!)
    if (this.state === 'r_charge') {
      const cw = 58, ch = 6;
      const cx = this.x - cw * 0.5;
      const cy = this.y + 18;
      const maxT = 1.05;
      const frac = Math.min(1, this.rChargeTime / maxT);
      const sweetStart = 0.42 / maxT;
      const sweetEnd = 0.74 / maxT;
      const inSweet = this.rChargeTime >= 0.42 && this.rChargeTime <= 0.74;

      // Dark backing
      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.fillRect(cx, cy, cw, ch);

      // Highlighted Golden Sweet-Spot Target Zone
      ctx.fillStyle = inSweet ? 'rgba(250, 204, 21, 0.55)' : 'rgba(250, 204, 21, 0.28)';
      ctx.fillRect(cx + cw * sweetStart, cy, cw * (sweetEnd - sweetStart), ch);

      // Live Charge Fill
      ctx.fillStyle = inSweet ? '#fde047' : '#38bdf8';
      ctx.fillRect(cx, cy, cw * frac, ch);

      // Sweet-Spot Tick Markers & Crisp Border
      ctx.strokeStyle = inSweet ? '#fde047' : 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = inSweet ? 1.6 : 1.0;
      ctx.strokeRect(cx, cy, cw, ch);
    }

    // 6. Abyssal Root Chains & Root Stagger Bar (when QTE is failed/timed out!)
    if (this.rooted && this.hp > 0) {
      // Coiling dark-violet / crimson chains around player's legs
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const ringY = this.y - 6 - i * 9;
        const rx = 22 - i * 2.5;
        const ry = rx * PERSPECTIVE_TILT;
        ctx.strokeStyle = i % 2 === 0 ? '#a855f7' : '#f43f5e';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.ellipse(this.x, ringY, rx, ry, (time * 1.8 + i) * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Root Stagger Bar underneath player
      const rbw = 86, rbh = 8;
      const rbx = this.x - rbw * 0.5;
      const rby = this.y + 16;
      const rFrac = Math.max(0, Math.min(1, this.rootStagger / Math.max(1, this.rootMaxStagger)));
      ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
      ctx.fillRect(rbx - 1, rby - 1, rbw + 2, rbh + 2);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(rbx, rby, rbw * rFrac, rbh);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(rbx, rby, rbw, rbh);

      ctx.font = '900 10.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fda4af';
      ctx.fillText('⛓️ ROOTED — ATTACK TO FREE!', this.x, rby + 20);
      ctx.restore();
    }

    // 7. 5-Key [Q][W][E][R] Typing QTE UI (5.0s timer during Vaelgor's Spirit Bomb Roar!)
    if (this.qteActive && this.hp > 0 && Array.isArray(this.qteSequence) && this.qteSequence.length > 0) {
      ctx.save();
      const boxSize = this.isLocal ? 26 : 19;
      const gap = this.isLocal ? 5 : 3;
      const count = this.qteSequence.length;
      const totalW = count * boxSize + (count - 1) * gap;
      const startX = this.x - totalW * 0.5;
      const qteY = barY - (this.isLocal ? 48 : 36);

      if (this.isLocal) {
        ctx.font = '900 11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde047';
        ctx.fillText(`⌨️ TYPE QTE! (${Math.max(0, this.qteTimer).toFixed(1)}s)`, this.x, qteY - 7);
      }

      for (let i = 0; i < count; i++) {
        const kx = startX + i * (boxSize + gap);
        const isDone = i < this.qteIndex;
        const isCurrent = i === this.qteIndex;
        const pulse = isCurrent ? Math.sin(time * 16) * 1.5 : 0;

        ctx.fillStyle = isDone
          ? 'rgba(34, 197, 94, 0.92)'
          : (isCurrent ? 'rgba(30, 41, 59, 0.96)' : 'rgba(15, 23, 42, 0.88)');
        ctx.fillRect(kx - pulse * 0.5, qteY - pulse * 0.5, boxSize + pulse, boxSize + pulse);

        ctx.strokeStyle = isDone ? '#86efac' : (isCurrent ? '#fde047' : 'rgba(148, 163, 184, 0.55)');
        ctx.lineWidth = isCurrent ? 2.4 : 1.3;
        ctx.strokeRect(kx - pulse * 0.5, qteY - pulse * 0.5, boxSize + pulse, boxSize + pulse);

        ctx.font = `900 ${this.isLocal ? 14 : 10.5}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDone ? '#052e16' : (isCurrent ? '#fde047' : '#f8fafc');
        ctx.fillText(this.qteSequence[i], kx + boxSize * 0.5, qteY + boxSize * 0.5 + 0.5);
      }

      // 5.0s QTE Countdown Timer Bar
      const tFrac = Math.max(0, Math.min(1, this.qteTimer / Math.max(0.1, this.qteMaxTimer || 5.0)));
      const ty = qteY + boxSize + 4;
      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.fillRect(startX, ty, totalW, 5);
      ctx.fillStyle = tFrac > 0.35 ? '#38bdf8' : '#f43f5e';
      ctx.fillRect(startX, ty, totalW * tFrac, 5);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(startX, ty, totalW, 5);
      ctx.restore();
    }

    // 8. FINAL CLASH QTE: the clasher's [W]/[E] prompt, giant blade and letterbox are drawn in screen space by
    // Game.drawClashCinematicHUD (main.js). Here, allies/spectators just get a compact callout above the clasher.
    if (!this.isLocal && this.state === 'clash_lock' && this.hp > 0) {
      // Non-local Clasher (AI Comrade or Multiplayer Ally): Show floating clash status so other players know to wail on Vaelgor!
      ctx.save();
      const boss = window.game && window.game.boss;
      const beatProg = boss ? `${Math.min(7, (boss.clashStepIndex || 0) + 1)}/7` : '';
      ctx.font = '900 11.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText(`⚔️ CLASHING WITH VAELGOR (${beatProg}) — FREE DPS!`, head3D.sx, head3D.sy - 44);
      ctx.restore();
    }

    ctx.restore();
  }
  // -------------------------------------------------------------------------
  // Rig part painters for draw()'s depth-sorted queue. `J` is the per-frame joint frame.
  // -------------------------------------------------------------------------

  // Greave gradient coordinates are in the rotated shin's local space, so one gradient serves every leg.
  static getGreaveGradient(ctx) {
    if (!BreakerPlayer25D._greaveGrad) {
      const g = ctx.createLinearGradient(0, -4.5, 0, 4.5);
      g.addColorStop(0, '#334155');
      g.addColorStop(0.5, '#0f172a');
      g.addColorStop(1, '#1e293b');
      BreakerPlayer25D._greaveGrad = g;
    }
    return BreakerPlayer25D._greaveGrad;
  }

  // 4A. Multi-Pleated Flowing Warden Cloak & Shoulder Mantle
  // Armor looks follow the armor tier you wear (1 standard steel, 2 obsidian + crimson, 3 void + gold). The Gravebreaker's plates
  // use `armorBase`; the Breaker's plates use the palette below.
  setArmorTier(t) {
    this.armorTier = t || 1;
    this.armorBase = t === 2 ? '#3d2633' : t === 3 ? '#5b3a99' : null;
  }
  apc(key, def) {
    const P = BreakerPlayer25D.ARMOR_PAL[this.armorTier || 1];
    return P ? P[key] : def;
  }

  // The character's chosen colour for a part (look.cloth / accent / skin / hair), optionally lightened or darkened by factor f.
  // Falls back to the built-in colour `def`, so characters without a look draw exactly as before.
  lk(key, def, f) {
    let v = this.look && this.look[key];
    if (key === 'cloth' && this.classId === 'hammer') v = this.armorBase || null;    // Gravebreaker armor = its tier, not a colour pick
    if (!v) return def;
    if (f === undefined || f === 1) return v;
    const n = parseInt(v.slice(1), 16);
    const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  }

  // Moon Mobile (cosmetic): a thin gold cross-bar floating over the head, four threads, two crescent moons and two stars that
  // turn slowly around it (true 3D: they pass behind the bar and in front of it, and dim as they go round the back).
  drawMoonMobile(ctx, J) {
    const t = performance.now() * 0.001;
    const hx = J && J.head && J.head.sx !== undefined ? J.head.sx : this.x;
    const top = (J && J.head && J.head.sy !== undefined ? J.head.sy : this.y - 104 - (this.jumpZ || 0)) - 46 + Math.sin(t * 1.4) * 2;
    const spin = t * 0.6, R = 20, tilt = PERSPECTIVE_TILT;
    ctx.save();
    ctx.lineCap = 'round';
    // a soft glow so it reads at a glance
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(hx, top + 14, 2, hx, top + 14, 34);
    g.addColorStop(0, 'rgba(253,230,138,0.22)'); g.addColorStop(1, 'rgba(253,230,138,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, top + 14, 34, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const items = [0, 1, 2, 3].map(i => {
      const a = spin + i * Math.PI / 2, d = Math.sin(a);
      return { i, a, d, x: hx + Math.cos(a) * R, y: top + d * R * tilt * 0.5, drop: 14 + (i % 2) * 7 };
    }).sort((p, q) => p.d - q.d);
    const bar = () => { ctx.strokeStyle = '#e2b23a'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(hx, top, R, R * tilt * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(hx, top - 1, 2.4, 0, Math.PI * 2); ctx.fill(); };
    let barDrawn = false;
    for (const it of items) {
      if (!barDrawn && it.d > 0) { bar(); barDrawn = true; }
      const y = it.y + it.drop + Math.sin(t * 2 + it.i) * 1.5, sh = 0.65 + 0.35 * (it.d + 1) / 2;
      ctx.strokeStyle = 'rgba(226,232,240,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x, y - 5); ctx.stroke();
      ctx.save(); ctx.translate(it.x, y); ctx.rotate(Math.sin(t * 1.3 + it.i) * 0.25); ctx.globalAlpha *= sh;
      if (it.i % 2 === 0) {
        // a crescent: the disc minus an offset disc (clipped, so nothing under the mobile is touched)
        ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = '#f5e7b0'; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.arc(2.6, -1.4, 4.6, 0, Math.PI * 2); ctx.fill('evenodd');
      } else {
        ctx.fillStyle = '#c7d2fe'; ctx.beginPath();
        for (let k = 0; k < 10; k++) { const aa = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? 2.2 : 5; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    if (!barDrawn) bar();
    ctx.restore();
  }

  // Eclipse Wings (cosmetic): a pair of broad fans of void-black feathers, each framing a small eclipse (dark disc, burning
  // corona ring) and edged in your accent colour. Every point is placed in the player's own frame (side / up / back), so the
  // wings follow the body through the full 360° - edge-on from the side, spread from the back, swept behind from the front -
  // and they flare when airborne and trail behind turns. Called once per wing so each sorts against the body on its own.
  drawRigWings(ctx, J, s) {
    // Moon Mobile (Hush, Hard): not wings at all, a little nursery mobile turning above the head (drawn once, on the near call)
    // (drawn after the whole body instead, see the draw wrapper at the end of this file, so the body shading never touches it)
    if (this.wings === 'moon_mobile') return;
    const nowMs = performance.now(), t = nowMs * 0.001;
    // turn rate (rad/s), smoothed once per frame (the second wing call in the same frame reuses it)
    if (this._wT !== nowMs) {
      const ang = this.getRenderFacingAngle();
      const dtw = Math.min(0.1, Math.max(0.001, (nowMs - (this._wT || nowMs)) / 1000));
      let da = ang - (this._wAng === undefined ? ang : this._wAng);
      while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      this._wTurn = (this._wTurn || 0) * 0.85 + (da / dtw) * 0.15;
      this._wAng = ang; this._wT = nowMs;
    }
    const turn = Math.max(-6, Math.min(6, this._wTurn || 0));
    const air = Math.min(1, (this.jumpZ || 0) / 40);
    const moving = this.state === 'walk' ? 1 : 0;
    const flap = Math.sin(t * 1.6 + s * 0.6) * 0.07 + moving * Math.sin(t * 8 + s) * 0.04 + air * (0.22 + Math.sin(t * 9 + s) * 0.08);
    const rim = this.lk('accent', '#fb923c');
    const A = this.getRenderFacingAngle(), cA = Math.cos(A), sA = Math.sin(A);
    const ox = this.x + (-7) * cA, oy = this.y + (-7) * sA * PERSPECTIVE_TILT - (this.jumpZ || 0);
    // (u,v,f) = (out along the wing's side, up from the shoulder line, back from the spine) -> screen
    const P = (u, v, f) => {
      const uu = u * s, ff = -f;
      return { x: ox + uu * (-sA) + ff * cA, y: oy + (uu * cA + ff * sA) * PERSPECTIVE_TILT - v };
    };
    const lag = turn * -1.4 * s;                                       // trailing sway when spinning
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // Pyre Wings (Ignis Vane, Hard): the same fan of feathers, but every feather is a living tongue of flame (flame_art.js),
    // banded crimson -> orange -> gold, writhing and shedding licks from the tips
    if (this.wings === 'pyre_wings' && window.FlameArt) {
      const FA = window.FlameArt, LENP = [70, 90, 102, 96, 82, 66, 48];
      for (let k = LENP.length - 1; k >= 0; k--) {
        const fr = k / (LENP.length - 1);
        const phi = (1.2 - fr * 1.85) + flap * (1 - fr * 0.4) + lag * 0.01;
        const L = LENP[k] * (1 + air * 0.1), cp = Math.cos(phi), sp = Math.sin(phi);
        const base = P(6, 62 - fr * 16, 6), tip = P(6 + cp * L + lag * (0.5 + fr), 62 - fr * 16 + sp * L, 10 + L * 0.3);
        const dx = tip.x - base.x, dy = tip.y - base.y, len = Math.hypot(dx, dy);
        if (len < 4) continue;
        ctx.save(); ctx.translate(base.x, base.y); ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);   // the tongue rises along the feather
        FA.tongue(ctx, 0, 0, len * 1.08, 11 - fr * 3, t, k * 3.7 + (s > 0 ? 0 : 20), { pal: k % 3 === 1 ? 'gold' : 'fire', rate: 1.1, lean: -lag * 0.01 });
        ctx.restore();
      }
      // embers drifting up off the wing
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.5 + i * 0.25 + (s > 0 ? 0.12 : 0)) % 1;
        const p = P(34 + Math.sin(ph * 6 + i) * 18, 74 + ph * 56, 14);
        FA.ember(ctx, p.x, p.y, 2.6 * (1 - ph) + 0.6, Math.sin(t + i) * 0.5, 'fire', (1 - ph) * 0.9);
      }
      ctx.restore();
      return;
    }

    // feathers: long upper ones first (behind), shorter lower ones overlapping them
    const LEN = [74, 94, 106, 100, 86, 70, 52];
    const N = LEN.length;
    for (let k = 0; k < N; k++) {
      const fr = k / (N - 1);
      const phi = (1.2 - fr * 1.85) + flap * (1 - fr * 0.4) + lag * 0.01;       // upper feathers point up, lower ones out and down
      const L = LEN[k] * (1 + air * 0.08);
      const ru = 6, rv = 62 - fr * 16;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const tu = ru + cp * L + lag * (0.5 + fr), tv = rv + sp * L;
      const sweep = (u) => 10 + u * 0.3 + Math.max(0, -lag) * 0.2;
      const w = 17 - fr * 5;
      const base = P(ru, rv + 4, 6), base2 = P(ru, rv - 14, 6);
      const mu = ru + cp * L * 0.55, mv = rv + sp * L * 0.55;
      const c1 = P(mu - sp * w * 1.25, mv + cp * w * 1.25, sweep(mu)), c2 = P(mu + sp * w * 0.7, mv - cp * w * 0.7, sweep(mu));
      const tip = P(tu, tv, sweep(tu));
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y);
      ctx.quadraticCurveTo(c2.x, c2.y, base2.x, base2.y);
      ctx.closePath();
      const g = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
      g.addColorStop(0, '#2b1245'); g.addColorStop(0.65, k % 2 ? '#150826' : '#1c0b30'); g.addColorStop(1, '#06020b');
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
      // glowing leading edge + spine of the feather
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rim; ctx.globalAlpha = 0.8 - fr * 0.3; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y); ctx.stroke();
      ctx.globalAlpha = 0.28; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      // ember at the tip of every other feather
      if (k % 2 === 0) { ctx.globalAlpha = 0.55 + Math.sin(t * 3 + k + s) * 0.3; ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(tip.x, tip.y, 1.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    // the eclipse itself: dark disc + corona, sitting over the upper feathers
    {
      const cu = 40, cv = 92 + air * 4, cr = 18 + Math.sin(t * 2) * 0.7;
      const ring = (r, steps = 22) => { ctx.beginPath(); for (let i = 0; i <= steps; i++) { const a = i / steps * Math.PI * 2, p = P(cu + Math.cos(a) * r, cv + Math.sin(a) * r, 12 + (cu + Math.cos(a) * r) * 0.25); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } };
      ctx.globalCompositeOperation = 'lighter';
      for (const [r, al, lw] of [[cr + 8, 0.10, 6], [cr + 4, 0.22, 4], [cr + 1.5, 0.55, 2.4]]) { ring(r); ctx.strokeStyle = rim; ctx.globalAlpha = al; ctx.lineWidth = lw; ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ring(cr); ctx.fillStyle = '#06020b'; ctx.fill();
      // bright crescent of the corona, slowly orbiting
      const ca = t * 0.7 * s;
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#fff7d6'; ctx.globalAlpha = 0.9; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const a = ca - 0.9 + i / 10 * 1.8, p = P(cu + Math.cos(a) * (cr + 0.5), cv + Math.sin(a) * (cr + 0.5), 12 + cu * 0.25); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
      ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }

    // sparks drifting up off the wing
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rim;
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.45 + i * 0.25 + (s > 0 ? 0.12 : 0)) % 1;
      const p = P(34 + Math.sin(ph * 6 + i) * 18, 70 + ph * 50, 14);
      ctx.globalAlpha = (1 - ph) * 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 * (1 - ph) + 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  drawRigCloak(ctx, J) {
    const { lShoulder: lShoulder3D, rShoulder: rShoulder3D, cosR } = J;
    ctx.save();
    if (!this._capePts || this._capePts.length !== this.capeNodes.length) {
      this._capePts = this.capeNodes.map(() => ({ x: 0, y: 0, w: 0 }));
    }
    const pts = this._capePts;
    for (let idx = 0; idx < pts.length; idx++) {
      const n = this.capeNodes[idx];
      const pt = pts[idx];
      if (idx === 0) {
        pt.x = (lShoulder3D.sx + rShoulder3D.sx) * 0.5 - cosR * 3;
        pt.y = (lShoulder3D.sy + rShoulder3D.sy) * 0.5 + 1;
        pt.w = 7.5;
      } else {
        pt.x = n.x;
        pt.y = this.y + (n.y - this.y) * PERSPECTIVE_TILT - n.z;
        pt.w = 7.5 + idx * 2.5;
      }
    }
    // Hard screen-space segment clamp so the cape can never stretch during fast spins/combos
    for (let i = 1; i < pts.length; i++) {
      const sdx = pts[i].x - pts[i - 1].x;
      const sdy = pts[i].y - pts[i - 1].y;
      const sDist = Math.hypot(sdx, sdy);
      if (sDist > 11.5) {
        const sPull = 11.5 / sDist;
        pts[i].x = pts[i - 1].x + sdx * sPull;
        pts[i].y = pts[i - 1].y + sdy * sPull;
      }
    }

    // Outer Cloak Silhouette with 3-Point Tattered Hem
    const topP = pts[0];
    const botP = pts[pts.length - 1];
    const cloakGrad = ctx.createLinearGradient(topP.x, topP.y, botP.x, botP.y + 8);
    if (this.overpowerSurge) {
      cloakGrad.addColorStop(0, '#78350f');
      cloakGrad.addColorStop(0.6, '#92400e');
      cloakGrad.addColorStop(1, '#451a03');
    } else if (this.look && this.look.cloth) {          // the character's own cloak colour (characters.js)
      cloakGrad.addColorStop(0, this.lk('cloth', '#0c4a6e', 0.62));
      cloakGrad.addColorStop(0.65, this.lk('cloth', '#082f49', 0.4));
      cloakGrad.addColorStop(1, '#040914');
    } else if (this.weaponModelId === 'lullaby_porcelain') {
      cloakGrad.addColorStop(0, '#1f3570');
      cloakGrad.addColorStop(0.65, '#16204a');
      cloakGrad.addColorStop(1, '#090d16');
    } else if (this.weaponModelId === 'black_sun_sovereign') {
      cloakGrad.addColorStop(0, '#1e1b4b');
      cloakGrad.addColorStop(0.65, '#3b0764');
      cloakGrad.addColorStop(1, '#090d16');
    } else if (this.weaponModelId === 'vaelgor_obsidian') {
      cloakGrad.addColorStop(0, '#1f121d');
      cloakGrad.addColorStop(0.65, '#4c0519');
      cloakGrad.addColorStop(1, '#090d16');
    } else {
      cloakGrad.addColorStop(0, this.isLocal ? '#0c4a6e' : '#1e3a8a');
      cloakGrad.addColorStop(0.65, this.isLocal ? '#082f49' : '#172554');
      cloakGrad.addColorStop(1, '#040914');
    }

    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x - pts[i].w, pts[i].y);
      else ctx.lineTo(pts[i].x - pts[i].w, pts[i].y);
    }
    // Notched 3-point vanguard hem
    ctx.lineTo(botP.x - botP.w * 0.45, botP.y + 6);
    ctx.lineTo(botP.x, botP.y + 1);
    ctx.lineTo(botP.x + botP.w * 0.45, botP.y + 6);
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.lineTo(pts[i].x + pts[i].w, pts[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = cloakGrad;
    ctx.fill();
    ctx.strokeStyle = this.overpowerSurge ? '#fbbf24' : this.trimColor;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Inner Fabric Pleat Folds
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.55)';
    ctx.lineWidth = 1.1;
    for (let f = 0; f < 2; f++) {
      const foldFrac = f === 0 ? -0.36 : 0.36;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const fx = pts[i].x + pts[i].w * foldFrac;
        const fy = pts[i].y;
        if (i === 0) ctx.moveTo(fx, fy);
        else ctx.lineTo(fx, fy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 4B. Sculpted Armored Legs (Tapered Cuisses, Winged Poleyn Knee-Guards, & Sabatons)
  drawRigLeg(ctx, J, side) {
    const hip = side < 0 ? J.lHip : J.rHip;
    const knee = side < 0 ? J.lKnee : J.rKnee;
    const ankle = side < 0 ? J.lAnkle : J.rAnkle;
    const foot = side < 0 ? this.leftFoot : this.rightFoot;
    ctx.save();
    // 1. Armored Thigh Plate (Cuisse)
    const thighAng = Math.atan2(knee.sy - hip.sy, knee.sx - hip.sx);
    const thighLen = Math.hypot(knee.sx - hip.sx, knee.sy - hip.sy);
    ctx.save();
    ctx.translate(hip.sx, hip.sy);
    ctx.rotate(thighAng);
    ctx.fillStyle = this.apc('dark','#1e293b');
    ctx.strokeStyle = this.apc('edgeDim','#64748b');
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-2, -4.8);
    ctx.lineTo(thighLen, -3.6);
    ctx.lineTo(thighLen, 3.6);
    ctx.lineTo(-2, 4.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 2. Contoured Greave (Schynbald)
    const shinAng = Math.atan2(ankle.sy - knee.sy, ankle.sx - knee.sx);
    const shinLen = Math.hypot(ankle.sx - knee.sx, ankle.sy - knee.sy);
    ctx.save();
    ctx.translate(knee.sx, knee.sy);
    ctx.rotate(shinAng);
    ctx.fillStyle = (this.armorTier > 1) ? this.apc('mid', '#334155') : BreakerPlayer25D.getGreaveGradient(ctx);
    ctx.strokeStyle = this.apc('edge','#94a3b8');
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-1, -4.4);
    ctx.lineTo(shinLen, -3.0);
    ctx.lineTo(shinLen, 3.0);
    ctx.lineTo(-1, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Armored Sabaton (Boot with Heel-to-Toe Stride Pitch)
    const footAng = foot.angle !== undefined ? foot.angle : J.renderAng;
    const fCos = Math.cos(footAng);
    const fSin = Math.sin(footAng) * PERSPECTIVE_TILT;
    const toePitch = (foot.pitch || 0) * 4.5;
    ctx.fillStyle = this.apc('belt','#0f172a');
    ctx.strokeStyle = this.apc('edge','#94a3b8');
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(ankle.sx - fCos * 3.5, ankle.sy - fSin * 3.5 - 1.5 + toePitch * 0.4);
    ctx.lineTo(ankle.sx + fCos * 7.8, ankle.sy + fSin * 7.8 + 1.0 - toePitch);
    ctx.lineTo(ankle.sx - fCos * 2.5, ankle.sy + 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Diamond Knee-Cop (Poleyn)
    ctx.fillStyle = this.apc('mid','#334155');
    ctx.strokeStyle = this.trimColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(knee.sx, knee.sy - 4.2);
    ctx.lineTo(knee.sx + 3.5, knee.sy);
    ctx.lineTo(knee.sx, knee.sy + 4.2);
    ctx.lineTo(knee.sx - 3.5, knee.sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 4C. Armored Waist Belt, Flared Hip Tassets, & Flowing Battle-Tabard
  drawRigWaist(ctx, J) {
    const { pelvis: pelvis3D, cosR, strideDiff } = J;
    ctx.save();
    const tabardSway = Math.sin(this.breathePhase * 1.5) * 0.08 - strideDiff * 0.18;
    // Front / Rear Battle-Tabard hanging between the legs
    ctx.save();
    ctx.translate(pelvis3D.sx + cosR * 2.5, pelvis3D.sy + 1);
    ctx.rotate(tabardSway);
    ctx.fillStyle = this.overpowerSurge ? '#b45309' : (this.look && this.look.cloth ? this.lk('cloth', '#0369a1', 0.85) : (this.isLocal ? '#0369a1' : '#1d4ed8'));
    ctx.strokeStyle = this.trimColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-4.0, 0);
    ctx.lineTo(4.0, 0);
    ctx.lineTo(5.0, 13);
    ctx.lineTo(0, 18);
    ctx.lineTo(-5.0, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Flared Left & Right Hip Tasset Plates (swing subtly with thigh lift!)
    for (let s = -1; s <= 1; s += 2) {
      const pt = s < 0 ? J.lHip : J.rHip;
      const k = s < 0 ? J.lKnee : J.rKnee;
      const thighLift = Math.max(-0.22, Math.min(0.22, (k.sx - pt.sx) * 0.025));
      ctx.save();
      ctx.translate(pt.sx, pt.sy - 2);
      ctx.rotate(s * 0.24 - thighLift);
      ctx.fillStyle = this.apc('dark','#1e293b');
      ctx.strokeStyle = this.apc('edge','#94a3b8');
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-4.5, -2);
      ctx.lineTo(4.5, -2);
      ctx.lineTo(5.5, 7.5);
      ctx.lineTo(-5.5, 7.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Heavy Girdle Belt & Golden Buckle
    ctx.fillStyle = this.apc('belt','#0f172a');
    ctx.strokeStyle = this.apc('edgeDim','#64748b');
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(pelvis3D.sx - 11.5, pelvis3D.sy - 4.5, 23, 7, 2);
    ctx.fill();
    ctx.stroke();

    const buckleX = pelvis3D.sx + cosR * 3.8;
    ctx.fillStyle = this.trimColor;
    ctx.beginPath();
    ctx.moveTo(buckleX, pelvis3D.sy - 4);
    ctx.lineTo(buckleX + 3.2, pelvis3D.sy - 1);
    ctx.lineTo(buckleX, pelvis3D.sy + 2);
    ctx.lineTo(buckleX - 3.2, pelvis3D.sy - 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 4D. Contoured Gothic Cuirass, Gorget Collar, & Plackart Ribs
  drawRigCuirass(ctx, J) {
    const { lShoulder: lShoulder3D, rShoulder: rShoulder3D, neck: neck3D, chest: chest3D, pelvis: pelvis3D, cosR, sinR } = J;
    ctx.save();
    const cGrad = ctx.createLinearGradient(lShoulder3D.sx, neck3D.sy - 6, rShoulder3D.sx, pelvis3D.sy);
    cGrad.addColorStop(0, this.apc('mid','#334155'));
    cGrad.addColorStop(0.48, this.armorTint || this.apc('belt','#0f172a'));
    cGrad.addColorStop(1, this.apc('dark','#1e293b'));
    ctx.fillStyle = cGrad;
    ctx.strokeStyle = this.overpowerSurge ? '#facc15' : this.apc('edge','#94a3b8');
    ctx.lineWidth = 1.6;

    const waistW = 9.5;
    ctx.beginPath();
    ctx.moveTo(lShoulder3D.sx, lShoulder3D.sy - 2.5);
    ctx.lineTo(neck3D.sx, neck3D.sy - 4.5);
    ctx.lineTo(rShoulder3D.sx, rShoulder3D.sy - 2.5);
    ctx.lineTo(chest3D.sx + 11.5, chest3D.sy + 2);
    ctx.lineTo(pelvis3D.sx + waistW, pelvis3D.sy - 2);
    ctx.lineTo(pelvis3D.sx, pelvis3D.sy + 2.5);
    ctx.lineTo(pelvis3D.sx - waistW, pelvis3D.sy - 2);
    ctx.lineTo(chest3D.sx - 11.5, chest3D.sy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Contoured Breastplate Center Ridge & Plackart Seams (shifts naturally with 360° facing!)
    const frontShiftX = chest3D.sx + cosR * 3.8;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(neck3D.sx + cosR * 2.0, neck3D.sy - 3);
    ctx.lineTo(frontShiftX, chest3D.sy + 3);
    ctx.lineTo(pelvis3D.sx + cosR * 2.5, pelvis3D.sy + 1);
    ctx.stroke();

    // Armored Gorget / Scarf Collar around the neck
    ctx.fillStyle = this.apc('belt','#0f172a');
    ctx.strokeStyle = this.trimColor;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(neck3D.sx, neck3D.sy - 1.5, 8.2, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glowing Vanguard Heart-Core Gem (visible when facing forward/side)
    if (sinR > -0.55) {
      ctx.fillStyle = this.overpowerSurge ? '#fde047' : this.weaponColor;
      ctx.beginPath();
      ctx.moveTo(frontShiftX, chest3D.sy - 3.5);
      ctx.lineTo(frontShiftX + 3.2, chest3D.sy + 1.0);
      ctx.lineTo(frontShiftX, chest3D.sy + 5.5);
      ctx.lineTo(frontShiftX - 3.2, chest3D.sy + 1.0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // 4E. Sculpted Arms (Rerebraces, Flared Vambraces, Armored Gauntlets, & Tiered Pauldrons)
  drawRigArm(ctx, J, side) {
    const s = side < 0 ? J.lShoulder : J.rShoulder;
    const e = side < 0 ? J.lElbow : J.rElbow;
    const h = side < 0 ? J.lHand : J.rHand;
    ctx.save();
    // 1. Upper Arm Rerebrace
    const uAng = Math.atan2(e.sy - s.sy, e.sx - s.sx);
    const uLen = Math.hypot(e.sx - s.sx, e.sy - s.sy);
    ctx.save();
    ctx.translate(s.sx, s.sy);
    ctx.rotate(uAng);
    ctx.fillStyle = this.apc('dark','#1e293b');
    ctx.strokeStyle = this.apc('edgeDim','#64748b');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-2, -3.6, uLen + 2, 7.2, 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 2. Forearm Vambrace & Elbow Couter
    const fAng = Math.atan2(h.sy - e.sy, h.sx - e.sx);
    const fLen = Math.hypot(h.sx - e.sx, h.sy - e.sy);
    ctx.save();
    ctx.translate(e.sx, e.sy);
    ctx.rotate(fAng);
    ctx.fillStyle = this.apc('mid','#334155');
    ctx.strokeStyle = this.apc('edge','#94a3b8');
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-2, -4.0);
    ctx.lineTo(fLen, -3.0);
    ctx.lineTo(fLen, 3.0);
    ctx.lineTo(-2, 4.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Armored Gauntlet
    ctx.fillStyle = this.apc('belt','#0f172a');
    ctx.strokeStyle = this.trimColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(h.sx, h.sy, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. 2-Tiered Gothic Shoulder Pauldron (tilts dynamically with arm swing!)
    const flareTilt = (uAng - Math.PI * 0.5) * 0.30 + side * 0.24;
    ctx.save();
    ctx.translate(s.sx, s.sy - 1.5);
    ctx.rotate(flareTilt);
    for (let tier = 1; tier >= 0; tier--) {
      const yOff = tier * 4.0;
      const w = 9.6 - tier * 1.1;
      const ph = 6.2;
      ctx.fillStyle = tier === 0 ? this.apc('mid','#334155') : this.apc('dark','#1e293b');
      ctx.strokeStyle = tier === 0 ? this.trimColor : this.apc('edge','#94a3b8');
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(-w * 0.78, yOff - 2.5);
      ctx.quadraticCurveTo(0, yOff - 5.8, w * 0.85, yOff - 2.0);
      ctx.lineTo(w, yOff + ph * 0.55);
      ctx.quadraticCurveTo(0, yOff + ph, -w, yOff + ph * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  // 4F. Sculpted Warden Barbute Greathelm, Winged Side-Crests, & Flowing Plume (Full 360° Yaw!)
  drawRigHelm(ctx, J) {
    const { head: head3D, cosR, sinR } = J;
    ctx.save();
    const hx = head3D.sx;
    const hy = head3D.sy;

    // Flowing Helmet Crest Plume (trails opposite to facing direction + cape motion)
    const pTailX = this.capeNodes[1] ? this.capeNodes[1].x : (hx - cosR * 12);
    const pTailY = this.capeNodes[1]
      ? (this.y + (this.capeNodes[1].y - this.y) * PERSPECTIVE_TILT - this.capeNodes[1].z - 16)
      : (hy - 4);
    ctx.fillStyle = this.overpowerSurge ? '#facc15' : this.lk('accent', this.isLocal ? '#38bdf8' : '#f43f5e');
    ctx.beginPath();
    ctx.moveTo(hx - cosR * 2, hy - 10.5);
    ctx.quadraticCurveTo(hx - cosR * 10, hy - 15, pTailX - cosR * 5, pTailY);
    ctx.quadraticCurveTo(hx - cosR * 6, hy - 6, hx, hy - 7);
    ctx.closePath();
    ctx.fill();

    // Sculpted Barbute Greathelm Crown & Faceplate
    const helmGrad = ctx.createLinearGradient(hx - 9, hy - 10, hx + 9, hy + 9);
    helmGrad.addColorStop(0, this.apc('hi','#475569'));
    helmGrad.addColorStop(0.5, this.apc('dark','#1e293b'));
    helmGrad.addColorStop(1, this.apc('belt','#0f172a'));
    ctx.fillStyle = helmGrad;
    ctx.strokeStyle = this.apc('edge','#cbd5e1');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy - 10.5);
    ctx.lineTo(hx + 7.8, hy - 4.5);
    ctx.lineTo(hx + 6.8 + cosR * 2.2, hy + 5.2);
    ctx.lineTo(hx + cosR * 3.2, hy + 8.8);
    ctx.lineTo(hx - 6.8 + cosR * 2.2, hy + 5.2);
    ctx.lineTo(hx - 7.8, hy - 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Valkyrie / Warden Winged Side-Fin Crests on the Greathelm
    ctx.fillStyle = this.trimColor;
    for (let side = -1; side <= 1; side += 2) {
      const wingX = hx + side * 7.2 - cosR * 1.5;
      ctx.beginPath();
      ctx.moveTo(wingX, hy - 2);
      ctx.lineTo(wingX + side * 4.2 - cosR * 2, hy - 9.5);
      ctx.lineTo(wingX + side * 1.5, hy - 5.5);
      ctx.closePath();
      ctx.fill();
    }

    // Glowing T-Visor Slit & Cheek-Guard Crest (tracks 360° head orientation)
    if (sinR > -0.65) {
      const vx = hx + cosR * 4.4;
      const vy = hy + sinR * 2.0 * PERSPECTIVE_TILT;
      ctx.strokeStyle = this.overpowerSurge ? '#fde047' : this.lk('accent', '#38bdf8');
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(vx - 4.4, vy - 1.0);
      ctx.lineTo(vx, vy + 0.8);
      ctx.lineTo(vx + 4.4, vy - 1.0);
      ctx.moveTo(vx, vy + 0.8);
      ctx.lineTo(vx, vy + 4.8);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }


  // =========================================================================
  // DISTINCT COLOSSAL GREATSWORD MODELS BY CRAFTED WEAPON TIER
  // 1. 'warden_steel' — Broad Azure Vanguard Slab-Sword
  // 2. 'vaelgor_obsidian' — Jagged Crimson-Fuller Obsidian Fang Greatsword
  // 3. 'black_sun_sovereign' — Colossal Split-Blade Void Eclipse Zweihander
  // =========================================================================
  drawColossalGreatsword(ctx, rHand3D, swordTip3D, activeSlashArc, time) {
    ctx.save();
    const showWeaponVfx = this.isLocal || !window.fx || window.fx.showAllyVfx !== false;

    // Ribbon Slash Trail (hidden for allies when Ally VFX is toggled OFF for FPS!)
    if (showWeaponVfx && this.swordTrail.length > 2) {
      for (let i = 1; i < this.swordTrail.length; i++) {
        const p0 = this.swordTrail.at(i - 1);
        const p1 = this.swordTrail.at(i);
        if (Math.hypot(p1.tx - p0.tx, p1.ty - p0.ty) > 4) {
          const frac = i / this.swordTrail.length;
          ctx.fillStyle = this.overpowerSurge
            ? `rgba(250, 204, 21, ${frac * 0.40})`
            : (this.weaponModelId === 'vaelgor_obsidian'
              ? `rgba(244, 63, 94, ${frac * 0.36})`
              : (this.weaponModelId === 'black_sun_sovereign'
                ? `rgba(192, 132, 252, ${frac * 0.40})`
                : (this.weaponModelId === 'lullaby_porcelain'
                  ? `rgba(253, 230, 138, ${frac * 0.40})`
                  : `rgba(56, 189, 248, ${frac * 0.30})`)));
          ctx.beginPath();
          ctx.moveTo(p0.hx, p0.hy);
          ctx.lineTo(p0.tx, p0.ty);
          ctx.lineTo(p1.tx, p1.ty);
          ctx.lineTo(p1.hx, p1.hy);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    if (showWeaponVfx && activeSlashArc && activeSlashArc.prog > 0.04) {
      const alpha = Math.min(1, activeSlashArc.prog);
      const rad = activeSlashArc.radius || 90;
      const renderAng = this.getRenderFacingAngle();
      const cosR = Math.cos(renderAng);
      const sinR = Math.sin(renderAng);
      const arcType = activeSlashArc.type || 'horizontal';

      ctx.save();
      // No shadowBlur here: the arc is already a 20px translucent stroke with a white core, and blurring
      // strokes this wide every frame (per player) was a major FPS cost.
      ctx.strokeStyle = activeSlashArc.color;

      if (arcType === 'vertical_down' || arcType === 'vertical_up') {
        // True 2.5D Vertical Overhead Slam / Rising Uppercut Crescent Slicing Through Z-Height!
        const topX = this.x - cosR * 18;
        const topY = this.y - this.jumpZ - 118;
        const midX = this.x + cosR * (rad * 0.95);
        const midY = this.y + sinR * (rad * 0.95) * PERSPECTIVE_TILT - this.jumpZ - 54;
        const botX = this.x + cosR * (rad * 0.72);
        const botY = this.y + sinR * (rad * 0.72) * PERSPECTIVE_TILT + 4;

        ctx.globalAlpha = alpha * 0.88;
        ctx.lineWidth = 20 * alpha;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (arcType === 'vertical_down') {
          ctx.moveTo(topX, topY);
          ctx.quadraticCurveTo(midX, midY, botX, botY);
        } else {
          ctx.moveTo(botX, botY);
          ctx.quadraticCurveTo(midX, midY, topX, topY);
        }
        ctx.stroke();

        // Bright inner white-hot cutting edge
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6 * alpha;
        ctx.stroke();
      } else if (arcType === 'parry_guard') {
        // [E] Bulwark Parry: Crisp Golden-Azure Aegis Guard Shield Arc directly in front of the braced blade!
        ctx.translate(this.x + cosR * 22, this.y + sinR * 22 * PERSPECTIVE_TILT - 32);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(renderAng);
        ctx.globalAlpha = alpha * 0.92;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(0, 0, rad, -1.05, 1.05);
        ctx.stroke();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, rad + 7, -0.85, 0.85);
        ctx.stroke();
      } else if (arcType === 'shoulder_ram') {
        // [A] Iron Tackle: Kinetic Battering-Ram Shockwave Chevron in front of the leading shoulder!
        ctx.translate(this.x + cosR * 28, this.y + sinR * 28 * PERSPECTIVE_TILT - 26);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(renderAng);
        ctx.globalAlpha = alpha * 0.88;
        ctx.lineWidth = 12 * alpha;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, rad, -0.95, 0.95);
        ctx.stroke();
      } else if (arcType === 'whirlwind') {
        // [Q] Spin Lunge / Combo 4: Full 360° Whirlwind Vortex Ring!
        ctx.translate(this.x, this.y - 26 - this.jumpZ * 0.5);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(renderAng);
        ctx.globalAlpha = alpha * 0.85;
        ctx.lineWidth = 22 * alpha;
        ctx.beginPath();
        ctx.arc(0, 0, rad, -2.4, 1.6);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5 * alpha;
        ctx.beginPath();
        ctx.arc(0, 0, rad + 4, -1.5, 1.2);
        ctx.stroke();
      } else {
        // Directional Horizontal / Diagonal Cleave Arc matching the exact swing direction!
        const sAng = activeSlashArc.startAng !== undefined ? activeSlashArc.startAng : -1.35;
        const eAng = activeSlashArc.endAng !== undefined ? activeSlashArc.endAng : 1.35;
        const minA = Math.min(sAng, eAng);
        const maxA = Math.max(sAng, eAng);
        ctx.translate(this.x, this.y - 24 - this.jumpZ * 0.5);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(renderAng);
        ctx.globalAlpha = alpha * 0.85;
        ctx.lineWidth = 20 * alpha;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, rad, minA, maxA);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5 * alpha;
        ctx.beginPath();
        ctx.arc(0, 0, rad + 3, minA + 0.15, maxA - 0.15);
        ctx.stroke();
      }
      ctx.restore();
    }

    const ang = Math.atan2(swordTip3D.sy - rHand3D.sy, swordTip3D.sx - rHand3D.sx);
    const len = Math.hypot(swordTip3D.sx - rHand3D.sx, swordTip3D.sy - rHand3D.sy);
    ctx.translate(rHand3D.sx, rHand3D.sy);
    ctx.rotate(ang);

    // Long Two-Handed Grip & Pommel
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = this.trimColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-20, -2.5, 20, 5, 1.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = this.weaponColor;
    ctx.beginPath();
    ctx.arc(-22, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // MODEL 1: AZURE WARDEN SLAB-GREATSWORD (Heavy Buster-Style Broad Blade)
    if (this.weaponModelId === 'warden_steel') {
      // Heavy Squared Crossguard
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-1, -14, 7, 28, 2);
      ctx.fill();
      ctx.stroke();

      // Massive Slab Blade
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = this.overpowerSurge ? '#fde047' : '#7dd3fc';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(6, -8.5);
      ctx.lineTo(len - 16, -7.5);
      ctx.lineTo(len, 0);
      ctx.lineTo(len - 16, 7.5);
      ctx.lineTo(6, 8.5);
      ctx.closePath();
      fakeGlow(ctx, this.overpowerSurge ? '#facc15' : '#0284c7', 9);
      ctx.fill();
      ctx.stroke();

      // Dual Glowing Azure Fullers + Ricasso Ring Holes
      ctx.strokeStyle = this.overpowerSurge ? '#fef08a' : '#38bdf8';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(14, -2.5);
      ctx.lineTo(len * 0.78, -2.0);
      ctx.moveTo(14, 2.5);
      ctx.lineTo(len * 0.78, 2.0);
      ctx.stroke();
    }

    // MODEL 2: VAELGOR'S OBSIDIAN CLAYMORE (Jagged Crimson-Vein Sawtooth Greatsword)
    else if (this.weaponModelId === 'vaelgor_obsidian') {
      // Bat-Winged Obsidian Crossguard
      ctx.fillStyle = '#090b10';
      ctx.strokeStyle = '#fda4af';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -19);
      ctx.lineTo(9, -6);
      ctx.lineTo(9, 6);
      ctx.lineTo(0, 19);
      ctx.lineTo(-4, 12);
      ctx.lineTo(2, 0);
      ctx.lineTo(-4, -12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Jagged Obsidian Blade with Sawtooth Fangs
      ctx.fillStyle = '#090b10';
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(6, -7.5);
      ctx.lineTo(24, -11.5);
      ctx.lineTo(28, -7.0);
      ctx.lineTo(46, -10.5);
      ctx.lineTo(50, -6.5);
      ctx.lineTo(len - 18, -6.0);
      ctx.lineTo(len, 0);
      ctx.lineTo(len - 18, 6.0);
      ctx.lineTo(26, 9.5);
      ctx.lineTo(6, 7.5);
      ctx.closePath();
      fakeGlow(ctx, '#e11d48', 11);
      ctx.fill();
      ctx.stroke();

      // Pulsing Crimson Abyssal Core Vein
      ctx.strokeStyle = '#fda4af';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(len * 0.84, 0);
      fakeGlow(ctx, '#f43f5e', 8, 0.45);
      ctx.stroke();
    }

    // MODEL 3: SOVEREIGN'S BLACK SUN ZWEIHANDER (Twin-Pronged Eclipse Halo Relic Blade)
    else if (this.weaponModelId === 'black_sun_sovereign') {
      // Floating Black-Sun Halo Crossguard
      ctx.fillStyle = '#05050a';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(8, 0, 13, 0, Math.PI * 2);
      fakeGlow(ctx, '#c084fc', 12);
      ctx.fill();
      ctx.stroke();

      // Colossal Split-Core Dimensional Blade
      const bGrad = ctx.createLinearGradient(8, -10, len, 10);
      bGrad.addColorStop(0, '#090b10');
      bGrad.addColorStop(0.5, '#3b0764');
      bGrad.addColorStop(1, '#f43f5e');
      ctx.fillStyle = bGrad;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(8, -10.5);
      ctx.lineTo(32, -13.0);
      ctx.lineTo(len - 14, -7.5);
      ctx.lineTo(len + 6, 0);
      ctx.lineTo(len - 14, 7.5);
      ctx.lineTo(32, 13.0);
      ctx.lineTo(8, 10.5);
      ctx.closePath();
      fakeGlow(ctx, '#c084fc', 10);
      ctx.fill();
      ctx.stroke();

      // Inner Golden-Violet Singularity Channel
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(len * 0.88, 0);
      fakeGlow(ctx, '#c084fc', 9, 0.4);
      ctx.stroke();
    }

    // MODEL 4: LULLABY GREATSWORD (Tier 4, Hush): a glazed porcelain blade with a Delft-blue fuller, mended with gold kintsugi
    // seams, a music-box key for a crossguard and a little moon at the pommel end of the guard
    else if (this.weaponModelId === 'lullaby_porcelain') {
      // the crossguard: a brass wind-up key laid across the blade
      ctx.fillStyle = '#c9973a';
      ctx.strokeStyle = '#6e4f17';
      ctx.lineWidth = 1.4;
      for (const sg of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(7, sg * 11, 4.2, 6.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.fillRect(5, -6, 5, 12); ctx.strokeRect(5, -6, 5, 12);
      // the blade: glossy white porcelain, cool shade on the far edge
      const bGrad = ctx.createLinearGradient(8, -12, 8, 12);
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(0.45, '#eef0f7');
      bGrad.addColorStop(1, '#a9b2c8');
      ctx.fillStyle = bGrad;
      ctx.strokeStyle = '#1e2a52';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(10, -9.5);
      ctx.quadraticCurveTo(len * 0.45, -13.5, len - 12, -7);
      ctx.lineTo(len + 7, 0);
      ctx.lineTo(len - 12, 7);
      ctx.quadraticCurveTo(len * 0.45, 13.5, 10, 9.5);
      ctx.closePath();
      fakeGlow(ctx, '#fde68a', 8, 0.5);
      ctx.fill();
      ctx.stroke();
      // Delft-blue fuller with little painted flowers along it
      ctx.strokeStyle = '#2a4a8f';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(len * 0.8, 0); ctx.stroke();
      ctx.fillStyle = '#5d7fc4';
      for (let k = 0; k < 4; k++) {
        const fx = 24 + k * (len * 0.8 - 30) / 3;
        for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + 0.4; ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 2.6, Math.sin(a) * 2.6 + (k % 2 ? 5.5 : -5.5), 1.6, 1, a, 0, Math.PI * 2); ctx.fill(); }
      }
      // gold kintsugi seams across the blade, glowing softly
      ctx.strokeStyle = '#f5c542';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(len * 0.32, -11); ctx.lineTo(len * 0.36, -4); ctx.lineTo(len * 0.33, 2); ctx.lineTo(len * 0.38, 11);
      ctx.moveTo(len * 0.62, -9); ctx.lineTo(len * 0.58, -2); ctx.lineTo(len * 0.63, 4); ctx.lineTo(len * 0.6, 9);
      ctx.moveTo(len * 0.36, -4); ctx.lineTo(len * 0.44, -6);
      fakeGlow(ctx, '#fde68a', 6, 0.6);
      ctx.stroke();
      // one sharp highlight along the near edge
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(18, -8); ctx.quadraticCurveTo(len * 0.45, -11, len - 16, -5.5); ctx.stroke();
    }

    ctx.restore();
  }
}

// Breaker plate colours per armor tier (tier 1 keeps the original steel look: apc() returns the built-in colour)
BreakerPlayer25D.ARMOR_PAL = {
  1: null,
  2: { dark: '#0c0e15', mid: '#1c1f2d', edge: '#e11d48', edgeDim: '#9f1239', belt: '#05060a', hi: '#2b2f42' },
  3: { dark: '#2a1650', mid: '#4c2a8a', edge: '#fde047', edgeDim: '#c9a227', belt: '#170b33', hi: '#6b46b8' }
};
window.BreakerPlayer25D = BreakerPlayer25D;
// the Moon Mobile floats over the finished character (every class shares this rig)
{
  const oDraw = BreakerPlayer25D.prototype.draw;
  BreakerPlayer25D.prototype.draw = function (ctx) {
    const r = oDraw.apply(this, arguments);
    if (this.wings === 'moon_mobile' && this._rigFrame && this._rigFrame.head && this.hp > 0) this.drawMoonMobile(ctx, this._rigFrame);
    return r;
  };
}
// Final Clash QTE (clash_qte.js) is shared by every class; Breaker simply opts in like any new class would.
installClashQte(BreakerPlayer25D);
