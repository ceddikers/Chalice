// =========================================================================
// BOSS_VAELGOR.JS — Vaelgor, Knight of the Obsidian Eclipse (2.5D Raid Boss)
// Full Articulated 2.5D Greatsword Boss Rig, Multi-Phase AI, Stagger Bar,
// Vindictus Part-Break ("Pauldron Shatter"), & "Total Obsidian Eclipse"
// =========================================================================

class VaelgorRaidBoss {
  constructor(x, y) {
    this.name = 'Vaelgor, Knight of the Obsidian Eclipse';
    this.subtitle = 'WARDEN OF THE ECLIPSE • ABYSSAL CATHEDRAL';
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.vx = 0;
    this.vy = 0;
    this.targetX = x;
    this.targetY = y;

    this.facingAngle = Math.PI * 0.5;
    this.moveAngle = this.facingAngle;
    this.speed = 0;
    this.turnSpeed = 6.8;
    this.jumpZ = 0;

    // Raid Boss HP (10 Bars), Marathon Raid Stagger Gauge, Thaemine Enrage Timer, & Dual Pauldron Part-Breaks (2 Bonus Cores!)
    this.maxHp = 172500;
    this.hp = 172500;
    this.hpBars = 10;
    this.maxStagger = 4200; // Takes sustained multi-minute heavy skill pressure to break!
    this.stagger = 0;
    this.enrageMaxTimer = 330.0; // 5:30 Thaemine-style Berserk Timer (Hard; difficulty.js sets Normal's)
    this.enrageTimer = 330.0;
    this.enraged = false;

    this.partBreakMax = 360; // Per-pauldron break threshold
    this.leftPartBreak = 0;
    this.rightPartBreak = 0;
    this.leftPauldronBroken = false;
    this.rightPauldronBroken = false;
    this.partBreak = 0;
    this.pauldronBroken = false;
    this.fractureStacks = 0; // Breaker Armor Fracture stacks (max 3, detonated by [F] Titan's Wrath)

    // Natural Physical Hit-Impulse, Per-Pauldron Hit-Flash, Strong-Move Stutter, & Ultimate Lockdown
    this.recoilX = 0;
    this.recoilY = 0;
    this.recoilVx = 0;
    this.recoilVy = 0;
    this.hitFlashTimer = 0;
    this.leftPauldronFlashTimer = 0;
    this.rightPauldronFlashTimer = 0;
    this.leftPauldronFlashIsPartBreak = false;
    this.rightPauldronFlashIsPartBreak = false;
    this.leftShoulderWorld = null;
    this.rightShoulderWorld = null;
    this.hitStutterTimer = 0;
    this.lockedByUltimateTimer = 0;

    this.dragBladeStance = true;
    this.awakened = false;
    this.eclipse75Triggered = false;
    this.eclipse55Triggered = false;
    this.eclipse35Triggered = false;

    this.state = 'idle';
    this.stateTimer = 0;
    this.stateDuration = 1.0;
    this.aiCooldown = 0.85;
    this.hitRegistered = false;
    this.counterableWindow = false; // Blue Counter-Flash during heavy windups!

    // World-Space IK Foot-Stepping Engine & Towering Raid Boss Scale (1.62x)
    this.modelScale = 1.62;
    this.hipWidth = 12.0;
    this.thighLen = 25;
    this.shinLen = 26;

    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    this.leftFoot = {
      x: this.x + (5 * cosA - (-this.hipWidth) * sinA),
      y: this.y + (5 * sinA + (-this.hipWidth) * cosA),
      z: 0,
      startX: 0, startY: 0, targetX: 0, targetY: 0,
      stepping: false, stepProg: 0, stepDur: 0.44,
      angle: this.facingAngle
    };
    this.rightFoot = {
      x: this.x + (-5 * cosA - (this.hipWidth) * sinA),
      y: this.y + (-5 * sinA + (this.hipWidth) * cosA),
      z: 0,
      startX: 0, startY: 0, targetX: 0, targetY: 0,
      stepping: false, stepProg: 0, stepDur: 0.44,
      angle: this.facingAngle
    };
    this.nextStepFoot = 'left';

    this.pelvisBounceZ = 0;
    this.pelvisVelZ = 0;
    this.pauldronLagZ = 0;
    this.pauldronVelZ = 0;
    this.breathePhase = 0;

    // Multi-Ribbon Verlet/Wave Cape & Helm Plume
    this.capeRibbons = [];
    for (let r = 0; r < 7; r++) {
      const nodes = [];
      for (let n = 0; n < 6; n++) {
        nodes.push({ x: this.x, y: this.y, z: 58 - n * 9.5 });
      }
      this.capeRibbons.push(nodes);
    }

    this.plumeNodes = [];
    for (let p = 0; p < 6; p++) {
      this.plumeNodes.push({ x: this.x, y: this.y, z: 80 });
    }
    this.resetClothChains();

    this.swordTrail = new SwordTrailRing(14);
    this.lastTipWorld = null;
    this.eyeTrail = [];
    this.debugJoints = {};

    // Signature Raid Mechanic ("Blood-Moon Imprisonment": Sword-Bait -> Shield Shatter -> Melee Stagger Check)
    this.eclipseActive = false;
    this.eclipsePhase = 'none'; // 'bait_swords', 'stagger_check', 'wipe'
    this.eclipseTimer = 0;
    this.eclipseMaxTimer = 12.5;
    this.eclipseBarrierRadius = 135;
    this.eclipseCracks = 0;
    this.eclipseCracksNeeded = 2;
    this.eclipseSwordState = 'none'; // 'tracking', 'locked'
    this.eclipseSwordTimer = 0;
    this.eclipseSwordMaxTimer = 1.35;
    this.eclipseSwordTargetId = null;
    this.eclipseSwordX = 0;
    this.eclipseSwordY = 0;
    this.eclipseStaggerCheck = 0;
    this.eclipseStaggerCheckMax = 210;
    this.eclipseAnchors = [];

    // 55% HP Raid Mechanic ("Echoing Iaido": Center Teleport -> Vanish -> Overhead Ambush Counter -> Grab Stagger)
    this.iaidoPhase = 'none'; // 'center_coil', 'vanished', 'ambush_counter', 'grab_stagger'
    this.iaidoStep = 0;
    this.iaidoTotalSteps = 3;
    this.iaidoTimer = 0;
    this.iaidoMaxTimer = 1.25;
    this.iaidoTargetId = null;
    this.iaidoGrabbedPlayerId = null;
    this.iaidoStaggerCheck = 0;
    this.iaidoStaggerCheckMax = 165;

    // 35% HP Raid Puzzle Mechanic ("Constellation of the Eclipse Clock" — Memory & Spatial Rune Puzzle!)
    this.horizonPhase = 'none'; // 'show_memory', 'solve_step'
    this.horizonStep = 0;
    this.horizonTotalSteps = 3;
    this.horizonTimer = 0;
    this.horizonMaxTimer = 1.65;
    this.horizonSequence = [0, 3, 1]; // Indices of the 4 Cardinal Obelisks (0:N, 1:E, 2:S, 3:W)
    this.horizonOrbitShifts = ['cw', 'ccw', 'opposite']; // 'cw' (+90°), 'ccw' (-90°), 'opposite' (180°)
    this.practiceClockMode = false;
    this.horizonObelisks = [
      { idx: 0, label: 'I',   symbol: '☽', name: 'NORTH', angle: -Math.PI * 0.5, x: 0, y: -195, color: '#38bdf8' },
      { idx: 1, label: 'II',  symbol: '☀', name: 'EAST',  angle: 0,              x: 215, y: 0,   color: '#facc15' },
      { idx: 2, label: 'III', symbol: '★', name: 'SOUTH', angle: Math.PI * 0.5,  x: 0, y: 195,  color: '#c084fc' },
      { idx: 3, label: 'IV',  symbol: '❖', name: 'WEST',  angle: Math.PI,        x: -215, y: 0,  color: '#f43f5e' }
    ];

    // Multi-Player Threat / Aggro & Dynamic Target Selection (Co-op + AI Comrades)
    this.threatMap = new Map();
    this.activeTargetId = null;
    this.targetReevalTimer = 0;

    // 2-Pattern Non-Repeat History Queue (Applies to Vaelgor & all future raid bosses!)
    this.recentPatterns = [];

    // <= 10% HP Final Phase Transition ("Pale Eclipse Awakening": Cutscene -> 3-Dash Counter Chain -> QTE & Spirit Bomb Stagger -> Sword Absorption -> 50% HP Final Phase)
    this.eclipse10Triggered = false;
    this.finalTransitionPending = false;
    this.finalTransitionActive = false;
    this.finalPhaseArena = false;
    this.finalPhase = false;
    this.swordEmpowered = false;
    this.finalMechPhase = 'none'; // 'arena_cutscene', 'dash_windup', 'dash_counter', 'grab_wipe', 'roar_qte_spirit_bomb', 'spirit_bomb_wipe', 'sword_absorb_cutscene'
    this.finalMechTimer = 0;
    this.finalMechMaxTimer = 1.0;
    this.finalDashStep = 0;
    this.finalDashTotal = 3;
    this.finalDashTargets = [];
    this.finalGrabbedPlayerId = null;
    this.finalSpiritBombStagger = 0;
    this.finalSpiritBombMaxStagger = 480;
    this.finalCutsceneStep = 0;
    this.soloVanguardEchoesActive = false;
    this.practiceFinalPhaseMode = false;
    this.practiceFinalClashMode = false;

    // <= 15% HP Final Phase Climax Mechanic ("Eclipse Sovereign Clash": Dark-Trail Teleport Behind Player -> 3s Overhead Lift & Small Blue Circle [G] -> 6.5s Rhythm QTE for Clashing Player Only while Allies Free-DPS & Lock Stagger at 99%)
    this.finalClash15Triggered = false;
    this.finalClashPending = false;
    // A failed Eclipse / Horizon comes back ONCE (scheduleMechRetry); a failed Final Clash always comes back.
    this.mechRetried = {}; this.mechRetry = null; this.finalClashRetryT = 0;
    this.clashPhase = 'none'; // 'windup_circle', 'active_clash', 'fail_wipe'
    this.clashTimer = 0;
    this.clashMaxTimer = 3.0;
    this.clashCircleX = 0;
    this.clashCircleY = 0;
    this.clashCircleRadius = 50;
    this.clashPlayerId = null;
    this.clashBeatStep = 0;
    this.clashTotalBeats = 6;
    this.clashDarkTrail = null; // { startX, startY, endX, endY, timer, maxTimer }
    // Cinematic duel staging: Vaelgor's single huge opening swing (clashIntroT counts down on every client; no input needed),
    // then the per-swing beats. clashWipe* stage the fail: sword hoisted -> slam -> dark shockwave ring that kills as it passes.
    this.clashIntroT = 0;
    this.clashIntroImpacted = false;
    this.clashWipeElapsed = 0;
    this.clashWipeSlammed = false;
    this.clashWipeHit = null;
    this._clashPose = null;
  }

  // Derived from synced state so guests can't keep a stale walk speed. The final phase also sets
  // `enraged` but stops the timer early, so only the timer berserk speeds him up (as before).
  get maxSpeed() {
    return (this.enraged && this.enrageTimer <= 0) ? 186 : 138;
  }

  // How hard he hits: 2.2x once the berserk timer runs out; 1.5x for the final phase (from the 10% transition on, which also
  // sets `enraged` to stop the timer, so it is told apart by the timer still having time on it).
  outgoingDamageMult() {
    if (this.enraged && this.enrageTimer <= 0) return 2.2;
    if (this.finalPhase || this.enraged) return 1.5;
    return 1.0;
  }

  // Timer berserk onset. Host/solo decides it and broadcasts 'enrage'; guests apply it from the packet.
  applyEnrage(fromNetwork = false) {
    if (this.enraged && this.enrageTimer <= 0) return;
    this.enrageTimer = 0;
    this.enraged = true;
    this.awakened = true;
    audio.playImpactBoom(2.0);
    audio.playParryClang(true);
    if (window.fx) {
      window.fx.triggerShake(28, 0.75);
      window.fx.addPillar(this.x, this.y, 90, '#e11d48', 1.2);
      window.fx.addShockwave(this.x, this.y, 380, '#e11d48', 9);
      window.fx.addFloatingText(this.x, this.y - 135, '🩸 BERSERK: THE OBSIDIAN ECLIPSE CONSUMES ALL!', '#fda4af', 18);
    }
    if (!fromNetwork) this.broadcastBossEvent('enrage');
  }

  // Pauldron shatter. Host/solo decides it and broadcasts 'pauldron_break'; guests apply it from the packet.
  breakPauldron(side, fromNetwork = false) {
    // Another boss built on this class (boss_ignis.js) brings its own core; the wrappers other files put on this method still run around it.
    if (this.coreBreakPart) return this.coreBreakPart(side, fromNetwork);
    const isLeft = side === 'left';
    if (isLeft ? this.leftPauldronBroken : this.rightPauldronBroken) return;
    if (isLeft) {
      this.leftPartBreak = this.partBreakMax;
      this.leftPauldronBroken = true;
      this.leftPauldronFlashTimer = 0;
    } else {
      this.rightPartBreak = this.partBreakMax;
      this.rightPauldronBroken = true;
      this.rightPauldronFlashTimer = 0;
    }
    this.partBreak = this.leftPartBreak + this.rightPartBreak;
    this.pauldronBroken = (this.leftPauldronBroken && this.rightPauldronBroken);
    const shPos = this.getShoulderWorldPositions()[isLeft ? 'left' : 'right'];
    audio.playParryClang(true);
    audio.playImpactBoom(1.35);
    audio.playBossVoiceClip('pauldron_crack');
    if (window.fx) {
      window.fx.triggerShake(18, 0.42);
      window.fx.addShockwave(shPos.x, shPos.y - 32, 130, '#94a3b8', 5);
      window.fx.addDragSparks(shPos.x, shPos.y - 32, 0, 28, false, '#e2e8f0');
    }
    this.partBreakFlinch();
    if (!fromNetwork) this.broadcastBossEvent('pauldron_break', { side: isLeft ? 'left' : 'right' });
  }

  // A broken part jolts him: the short Rebuke-style recoil (cuts the current swing, shoved back a step), but never during a
  // mechanic, a stagger, a hold or a cutscene. Runs on every client (the host's pauldron_break event drives the guests).
  partBreakFlinch() {
    const NO = ['eclipse_mechanic', 'horizon_mechanic', 'iaido_mechanic', 'final_phase_mechanic', 'final_clash_mechanic', 'karok_clash',
      'intro_cutscene', 'staggered', 'rebuked', 'flinched', 'mech_approach'];
    if (NO.indexOf(this.state) >= 0 || this.lockedByUltimateTimer > 0 || (this.jumpZ || 0) > 2 || this.hp <= 0) return;
    this.counterableWindow = false;
    this.speed = 0; this.vx = 0; this.vy = 0;
    this.targetX = this.x; this.targetY = this.y;
    this.state = 'flinched';
    this.stateDuration = 0.55; this.stateTimer = 0.55;
    this.snapFeetToBody();
    this.pelvisVelZ -= 18; this.pauldronVelZ -= 36;
    this._rebukePush = { ux: -Math.cos(this.facingAngle || 0), uy: -Math.sin(this.facingAngle || 0), dist: 30, dur: 0.25, t: 0 };
    this.aiCooldown = Math.min(this.aiCooldown || 0, 1.0);
  }

  // Linear gradients whose coordinates are constant in a part's local (translated/rotated) space
  // are built once and reused; gradient coords are resolved against the transform at fill time.
  static getCachedGradient(ctx, key, x0, y0, x1, y1, colors) {
    const cache = VaelgorRaidBoss._gradCache || (VaelgorRaidBoss._gradCache = {});
    let g = cache[key];
    if (!g) {
      g = ctx.createLinearGradient(x0, y0, x1, y1);
      for (let i = 0; i < colors.length; i++) g.addColorStop(i / (colors.length - 1), colors[i]);
      cache[key] = g;
    }
    return g;
  }

  // Universal Boss Helper: Selects a weighted pattern while enforcing at least 2 different patterns before repeating!
  selectNonRepeatingPattern(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    let pool = candidates.filter(c => !this.recentPatterns.includes(c.name));
    if (pool.length === 0) pool = candidates;
    let totalW = 0;
    for (const c of pool) totalW += (c.weight !== undefined ? c.weight : 1.0);
    let roll = Math.random() * totalW;
    let chosen = pool[pool.length - 1];
    for (const c of pool) {
      roll -= (c.weight !== undefined ? c.weight : 1.0);
      if (roll <= 0) {
        chosen = c;
        break;
      }
    }
    return chosen;
  }

  recordExecutedPattern(patternName) {
    const nonRepeatExempt = (
      patternName === 'intro_cutscene' ||
      patternName === 'eclipse_mechanic' ||
      patternName === 'iaido_mechanic' ||
      patternName === 'horizon_mechanic' ||
      patternName === 'final_phase_mechanic' ||
      patternName === 'final_clash_mechanic'
    );
    if (nonRepeatExempt) return;
    this.recentPatterns.push(patternName);
    while (this.recentPatterns.length > 2) {
      this.recentPatterns.shift();
    }
  }

  // Scales Vaelgor's HP, Marathon Stagger & Dual Pauldron Part-Breaks for Solo (1p) up to 4-Player Lobbies!
  applyLobbyScaling(partySize = 1, resetHp = false) {
    const n = Math.max(1, partySize || 1);
    // HP x1.5 on 2026-10-18 (bosses were dying too fast; enrage timers were stretched x1.375 with it)
    const hpMult = 1.0 + (n - 1) * 0.85;   // 1p: 172,500 | 2p: 319,125 | 3p: 465,750 | 4p: 612,375
    const stagMult = 1.0 + (n - 1) * 0.55; // 1p: 1.0x    | 2p: 1.55x   | 3p: 2.10x   | 4p: 2.65x

    const prevFrac = this.maxHp > 0 ? Math.max(0, Math.min(1, this.hp / this.maxHp)) : 1.0;
    this.maxHp = Math.round(172500 * hpMult);
    this.hp = resetHp ? this.maxHp : Math.max(1, Math.round(this.maxHp * prevFrac));

    this.maxStagger = Math.round(4200 * stagMult);
    this.partBreakMax = Math.round(1150 * stagMult); // Much harder to break — requires dedicated precision shoulder targeting!
    this.eclipseStaggerCheckMax = Math.round(235 * stagMult);
    this.iaidoStaggerCheckMax = Math.round(185 * stagMult);
    // Multi-player Spirit Bomb Stagger Bar (requires multiple players / freed comrades to break in time!)
    this.finalSpiritBombMaxStagger = Math.round(175 * Math.max(2.2, n * 0.78));
  }

  // Final-phase Trinity Cleave teleport. Host computes the spot and broadcasts; guests call this from the packet.
  applyTrinityTeleport(x, y, faceTarget, color, fromNetwork = false, facing = null) {
    const oldX = this.x, oldY = this.y;
    this.x = x;
    this.y = y;
    this.facingAngle = (typeof facing === 'number')
      ? facing
      : Math.atan2((faceTarget.y - this.y) / PERSPECTIVE_TILT, faceTarget.x - this.x);
    this.baseFacing = this.facingAngle;
    this.snapFeetToBody();
    this.resetClothChains();
    this.swordTrail.clear();
    if (window.fx) window.fx.addAfterimage(oldX, oldY, this.facingAngle, color);
    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'trinity_teleport',
        x: Math.round(this.x),
        y: Math.round(this.y),
        facingAngle: Number(this.facingAngle.toFixed(3)),
        color
      });
    }
  }

  resetClothChains() {
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    const ribbonCount = this.capeRibbons.length;
    for (let r = 0; r < ribbonCount; r++) {
      const frac = (r / (ribbonCount - 1)) * 2 - 1;
      const nodes = this.capeRibbons[r];
      const pinFwd = -5;
      const pinSide = frac * 19;
      const rootX = this.x + (pinFwd * cosA - pinSide * sinA);
      const rootY = this.y + (pinFwd * sinA + pinSide * cosA);
      for (let n = 0; n < nodes.length; n++) {
        const backDist = n * 4.2;
        const flareSide = frac * n * 1.4;
        nodes[n].x = rootX + (-backDist * cosA - flareSide * sinA);
        nodes[n].y = rootY + (-backDist * sinA + flareSide * cosA);
        nodes[n].z = Math.max(4, 66 + this.jumpZ - n * 9.8);
      }
    }
    for (let p = 0; p < this.plumeNodes.length; p++) {
      const backDist = 5 + p * 4.5;
      this.plumeNodes[p].x = this.x - backDist * cosA;
      this.plumeNodes[p].y = this.y - backDist * sinA;
      this.plumeNodes[p].z = 81 + this.jumpZ - p * 2.0;
    }
  }

  resetBoss(x, y) {
    if (this.coreReset) return this.coreReset(x, y);
    this.releaseIaidoGrabbedPlayer();
    this.releaseFinalGrabbedPlayer();
    if (window.game && window.game.party) {
      for (const p of window.game.party) {
        if (p) {
          p.qteActive = false;
          p.rooted = false;
          p.rootStagger = 0;
          if (typeof p.clearClashRhythmQte === 'function') p.clearClashRhythmQte();
        }
      }
    }
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    const partyLen = (window.game && window.game.party) ? window.game.party.length : 1;
    this.applyLobbyScaling(partyLen, true);
    this.stagger = 0;
    this.enrageMaxTimer = 330.0;
    this.enrageTimer = 330.0;
    this.enraged = false;
    this.leftPartBreak = 0;
    this.rightPartBreak = 0;
    this.leftPauldronBroken = false;
    this.rightPauldronBroken = false;
    this.partBreak = 0;
    this.pauldronBroken = false;
    this.awakened = false;
    this.eclipse75Triggered = false;
    this.eclipse55Triggered = false;
    this.eclipse35Triggered = false;
    this.eclipse10Triggered = false;
    this.finalTransitionPending = false;
    this.finalTransitionActive = false;
    this.finalPhaseArena = false;
    this.arenaWhiteoutAlpha = 0;
    this.arenaWhiteoutClimaxDone = false;
    this.finalPhase = false;
    this.swordEmpowered = false;
    this.finalMechPhase = 'none';
    this.finalMechTimer = 0;
    this.finalDashStep = 0;
    this.finalDashTargets = [];
    this.finalGrabbedPlayerId = null;
    this.finalSpiritBombStagger = 0;
    this.finalCutsceneStep = 0;
    this.soloVanguardEchoesActive = false;
    this.finalClash15Triggered = false;
    this.finalClashPending = false;
    this.mechRetried = {}; this.mechRetry = null; this.finalClashRetryT = 0;
    this.clashPhase = 'none';
    this.clashTimer = 0;
    this.clashPlayerId = null;
    this.clashBeatStep = 0;
    this.clashDarkTrail = null;
    this.recentPatterns = [];
    this.state = 'idle';
    this.eclipseActive = false;
    this.eclipsePhase = 'none';
    this.eclipseCracks = 0;
    this.eclipseSwordState = 'none';
    this.eclipseStaggerCheck = 0;
    this.eclipseAnchors = [];
    this.iaidoPhase = 'none';
    this.iaidoStep = 0;
    this.iaidoTimer = 0;
    this.iaidoTargetId = null;
    this.iaidoGrabbedPlayerId = null;
    this.iaidoStaggerCheck = 0;
    this.horizonPhase = 'none';
    this.horizonStep = 0;
    this.horizonOrbitShifts = ['cw', 'ccw', 'opposite'];
    this.practiceClockMode = false;
    this.practiceFinalPhaseMode = false;
    this.practiceFinalClashMode = false;
    this.horizonTimer = 0;
    this.recoilX = 0;
    this.recoilY = 0;
    this.recoilVx = 0;
    this.recoilVy = 0;
    this.hitFlashTimer = 0;
    this.leftPauldronFlashTimer = 0;
    this.rightPauldronFlashTimer = 0;
    this.leftPauldronFlashIsPartBreak = false;
    this.rightPauldronFlashIsPartBreak = false;
    this.hitStutterTimer = 0;
    this.lockedByUltimateTimer = 0;
    this.threatMap.clear();
    this.activeTargetId = null;
    this.targetReevalTimer = 0;
    this.snapFeetToBody();
    this.resetClothChains();
    if (window.updateMechanicHUD) window.updateMechanicHUD(false);
  }

  getBrokenCoresCount() {
    return (this.leftPauldronBroken ? 1 : 0) + (this.rightPauldronBroken ? 1 : 0);
  }

  getShoulderWorldPositions() {
    if (this.leftShoulderWorld && this.rightShoulderWorld) {
      return { left: this.leftShoulderWorld, right: this.rightShoulderWorld };
    }
    const S = this.modelScale || 1.62;
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    const span = 20.0 * S;
    return {
      left: {
        x: this.x - (-span) * sinA,
        y: this.y + (-span) * cosA * PERSPECTIVE_TILT
      },
      right: {
        x: this.x - span * sinA,
        y: this.y + span * cosA * PERSPECTIVE_TILT
      }
    };
  }

  // -------------------------------------------------------------------------
  // MULTI-PLAYER AGGRO / THREAT & SMART PATTERN TARGETING
  // -------------------------------------------------------------------------
  addThreat(playerId, amount) {
    if (!playerId || amount <= 0) return;
    const prev = this.threatMap.get(playerId) || 100;
    this.threatMap.set(playerId, prev + amount);
  }

  decayThreat(dt) {
    const decay = Math.pow(0.92, dt);
    for (const [id, val] of this.threatMap.entries()) {
      this.threatMap.set(id, Math.max(50, val * decay));
    }
  }

  resolveTargetById(livingParty, targetId) {
    if (!livingParty || livingParty.length === 0) return null;
    if (targetId) {
      const match = livingParty.find(p => p.id === targetId);
      if (match) return match;
    }
    return this.selectTargetForPattern(livingParty, 'aggro');
  }

  // Selects who Vaelgor targets based on pattern style ('aggro' for front-line melee, 'hunter' for ranged/gap-closers)
  selectTargetForPattern(livingParty, mode = 'aggro') {
    if (!livingParty || livingParty.length === 0) {
      this.activeTargetId = null;
      return null;
    }
    if (livingParty.length === 1) {
      this.activeTargetId = livingParty[0].id;
      return livingParty[0];
    }

    if (mode === 'hunter') {
      // Ranged / Gap-Closer Patterns (Damocles, Dreadnought, Guillotine, Mirage):
      // 65% chance to hunt a non-primary or distant player (e.g. a friend across the arena) to keep the whole party engaged!
      const nonCurrent = livingParty.filter(p => p.id !== this.activeTargetId);
      if (nonCurrent.length > 0 && Math.random() < 0.65) {
        // Weight slightly toward farther players for dramatic cross-arena leaps/lasers
        let totalW = 0;
        const weights = nonCurrent.map(p => {
          const d = Math.hypot(p.x - this.x, p.y - this.y);
          const w = Math.max(40, d);
          totalW += w;
          return { p, w };
        });
        let roll = Math.random() * totalW;
        for (const item of weights) {
          roll -= item.w;
          if (roll <= 0) {
            this.activeTargetId = item.p.id;
            return item.p;
          }
        }
        const pick = nonCurrent[Math.floor(Math.random() * nonCurrent.length)];
        this.activeTargetId = pick.id;
        return pick;
      }
    }

    // Default 'aggro' mode: Weighted by Threat Score + Proximity + slight anti-tunnel rotation
    let bestScore = -Infinity;
    let bestPlayer = livingParty[0];
    for (const p of livingParty) {
      const threat = this.threatMap.get(p.id) || 100;
      const dist = Math.hypot(p.x - this.x, p.y - this.y);
      const proxBonus = Math.max(0, 320 - dist) * 1.4;
      const randomJitter = (Math.random() * 0.32 + 0.84);
      const score = (threat + proxBonus) * randomJitter;
      if (score > bestScore) {
        bestScore = score;
        bestPlayer = p;
      }
    }
    this.activeTargetId = bestPlayer.id;
    return bestPlayer;
  }

  isCounterable() {
    if (this.state === 'eclipse_mechanic' && this.eclipsePhase === 'stagger_check' && this.eclipseTimer <= 3.6) return true;
    if (this.state === 'horizon_mechanic' && this.horizonPhase === 'final_clash') return true;
    if (this.state === 'iaido_mechanic' && this.iaidoPhase === 'ambush_counter') return true;
    if (this.state === 'final_phase_mechanic' && this.finalMechPhase === 'dash_counter') return true;
    return this.counterableWindow;
  }

  // Vaelgor has true Raid Boss poise during all combat patterns (no Flinch Bar interruptions!)
  hasSuperArmor() {
    return (
      this.state !== 'idle' &&
      this.state !== 'walk' &&
      this.state !== 'rebuked' &&
      this.state !== 'staggered'
    );
  }

  // Vindictus-Style Ultimate Hold & Temporary Downed Status ([T] Omnislash):
  // Suppresses Vaelgor in place during the ultimate AND forces him into a downed/kneeling state
  // afterward so the entire party can freely wail on him!
  lockInPlaceForUltimate(holdDuration = 2.15, downedDuration = 4.0, fromNetwork = false) {
    if (this.state === 'final_phase_mechanic' || this.state === 'final_clash_mechanic') return;
    // Omnislash re-applies this lock every frame; only the initial lock needs to go over the network.
    const isInitialLock = (this.lockedByUltimateTimer || 0) <= 0.05;
    this.lockedByUltimateTimer = Math.max(this.lockedByUltimateTimer, holdDuration);
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.targetX = this.x;
    this.targetY = this.y;
    if (this.state !== 'eclipse_mechanic' && this.state !== 'horizon_mechanic' && this.state !== 'iaido_mechanic' && this.state !== 'final_phase_mechanic' && this.state !== 'final_clash_mechanic') {
      this.counterableWindow = false;
      this.jumpZ = 0;
      this.state = 'staggered';
      const totalDown = holdDuration + downedDuration;
      this.stateDuration = Math.max(this.stateDuration || 0, totalDown);
      this.stateTimer = Math.max(this.stateTimer || 0, totalDown);
      this.snapFeetToBody();
    }
    if (!fromNetwork && isInitialLock && window.game && window.game.net) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'ultimate_lock',
        duration: holdDuration,
        downedDuration
      });
    }
  }

  receiveDamage(dmg, staggerAmt, attacker, hitOpts = null) {
    if (this.coreReceiveDamage) return this.coreReceiveDamage(dmg, staggerAmt, attacker, hitOpts);
    if (this.hp <= 0) return;
    // Ignore hits while completely vanished without a trace or during opening/final cinematics!
    if (this.state === 'intro_cutscene') return;
    if (this.state === 'iaido_mechanic' && this.iaidoPhase === 'vanished') return;
    if (this.state === 'final_phase_mechanic' && (this.finalMechPhase === 'arena_cutscene' || this.finalMechPhase === 'sword_absorb_cutscene')) return;
    const opts = hitOpts || {};
    // A remote player's swing replayed on this client is visual only: the owner already sends the
    // authoritative 'boss_hit' packet, so applying it here would count every co-op hit twice.
    if (!opts.fromNetwork && attacker && attacker.isRemote) return;
    // Every client applies every hit for HP/feedback, but state transitions are decided by the host only.
    const isHostOrSolo = !window.game || !window.game.net || window.game.net.isHost;

    // Determine exact 2.5D Pauldron Hitscan Side ('left' = sideSign -1, 'right' = sideSign +1) and distance to each shoulder
    let pauldronSide = opts.pauldronSide || null;
    const shoulders = this.getShoulderWorldPositions();
    let strikeX = opts.hitX;
    let strikeY = opts.hitY;
    if (strikeX === undefined || strikeY === undefined) {
      if (attacker && attacker.x !== undefined && attacker.y !== undefined) {
        const aAng = attacker.facingAngle !== undefined ? attacker.facingAngle : 0;
        strikeX = attacker.x + Math.cos(aAng) * 26;
        strikeY = attacker.y + Math.sin(aAng) * 26 * PERSPECTIVE_TILT;
      } else {
        strikeX = this.x;
        strikeY = this.y + 40;
      }
    }
    const distLeft = Math.hypot(strikeX - shoulders.left.x, (strikeY - shoulders.left.y) / PERSPECTIVE_TILT);
    const distRight = Math.hypot(strikeX - shoulders.right.x, (strikeY - shoulders.right.y) / PERSPECTIVE_TILT);
    if (!pauldronSide) {
      pauldronSide = distLeft < distRight ? 'left' : 'right';
    }

    // Broadcast local player's hits to Co-op Peers so Host & Clients stay 100% synchronized!
    if (!opts.fromNetwork && attacker && attacker.isLocal && window.game && window.game.net) {
      window.game.net.broadcast({
        type: 'boss_hit',
        dmg,
        staggerAmt,
        attackerId: attacker.id,
        isStrongMove: !!opts.isStrongMove,
        impulseStrength: opts.impulseStrength || (opts.isStrongMove ? 1.35 : 0.75),
        threatMult: opts.threatMult || 1.0,
        posType: opts.posType || 'normal',
        pauldronSide,
        hitX: Math.round(strikeX),
        hitY: Math.round(strikeY),
        partBreakMult: opts.partBreakMult !== undefined ? opts.partBreakMult : (opts.isStrongMove ? 1.0 : 0),
        skill: opts.skill || undefined,
        crit: !!opts.crit
      });
    }

    // Build Dynamic Aggro/Threat for the attacker (works for Local, Co-op Friend, or AI Comrade!)
    if (attacker && attacker.id) {
      const threatMult = opts.threatMult || (opts.isStrongMove ? 1.25 : 1.0);
      this.addThreat(attacker.id, (dmg * 0.85 + staggerAmt * 7.5) * threatMult);
    }

    // Damage reduction while Blood-Moon Barrier is still intact during Phase 1 ('bait_swords')
    if (this.state === 'eclipse_mechanic' && this.eclipsePhase === 'bait_swords') {
      dmg = Math.round(dmg * 0.12);
    } else if (this.state === 'eclipse_mechanic' && this.eclipsePhase === 'stagger_check') {
      const staggerChunk = staggerAmt * (opts.isStrongMove ? 1.35 : 1.0);
      this.eclipseStaggerCheck = Math.max(0, this.eclipseStaggerCheck - staggerChunk);
      if (isHostOrSolo && this.eclipseStaggerCheck <= 0) {
        this.stagger = 0;
        this.enterStaggerState('💥 ECLIPSE SHATTERED!');
        return;
      }
    } else if (this.state === 'iaido_mechanic') {
      if (this.iaidoPhase === 'grab_stagger') {
        const staggerChunk = staggerAmt * (opts.isStrongMove ? 1.35 : 1.0);
        this.iaidoStaggerCheck = Math.max(0, this.iaidoStaggerCheck - staggerChunk);
        if (isHostOrSolo && this.iaidoStaggerCheck <= 0) {
          this.releaseIaidoGrabbedPlayer();
          this.stagger = 0;
          this.enterStaggerState('💥 STAGGER BROKEN!');
          return;
        }
      } else {
        dmg = Math.round(dmg * 0.15);
      }
    } else if (this.state === 'horizon_mechanic') {
      dmg = Math.round(dmg * 0.15);
    } else if (this.state === 'final_phase_mechanic') {
      // 99% Damage Reduction during the entire 10% HP Final Phase Transition Mechanic!
      dmg = Math.max(1, Math.round(dmg * 0.01));
      if (this.finalMechPhase === 'roar_qte_spirit_bomb' && (this.finalQteDelay || 0) <= 0) {   // no stagger chip while he is still charging
        const echoMult = this.soloVanguardEchoesActive ? 2.65 : 1.0;
        const staggerChunk = staggerAmt * (opts.isStrongMove ? 1.45 : 1.15) * echoMult;
        this.finalSpiritBombStagger = Math.max(0, this.finalSpiritBombStagger - staggerChunk);
        if (this.soloVanguardEchoesActive && window.fx && Math.random() < 0.75) {
          window.fx.addDimensionalSlash(this.x - 85, this.y - 30, this.x + 85, this.y + 15, '#38bdf8');
        }
        if (isHostOrSolo && this.finalSpiritBombStagger <= 0) {
          this.stagger = 0;
          this.enterFinalSwordAbsorbCutscene(false);
          return;
        }
      }
    }

    // <= 10% HP Gate: Vaelgor gains 99% Damage Reduction and queues the Final Phase Transition!
    // If he is currently in a pattern, staggered, or locked by an ultimate, he keeps 99% DR and transitions as soon as that state finishes!
    const tenPctFloor = Math.ceil(this.maxHp * 0.10);
    const fifteenPctFloor = Math.ceil(this.maxHp * 0.15);
    const onePctFloor = Math.max(1, Math.ceil(this.maxHp * 0.01));
    if (!this.finalPhase) {
      if (this.finalTransitionPending || this.finalTransitionActive) {
        // final_phase_mechanic already applied the 99% DR above; don't stack it a second time.
        if (this.state !== 'final_phase_mechanic') dmg = Math.max(1, Math.round(dmg * 0.01));
        this.hp = Math.max(onePctFloor, this.hp - dmg);
      } else if (this.hp - dmg <= tenPctFloor) {
        const normalPart = Math.max(0, this.hp - tenPctFloor);
        const overflow = Math.max(0, dmg - normalPart);
        const reducedOverflow = Math.max(1, Math.round(overflow * 0.01));
        this.hp = Math.max(onePctFloor, tenPctFloor - reducedOverflow);
        this.finalTransitionPending = true;
        if (window.fx) {
          window.fx.addFloatingText(this.x, this.y - 125, '🛡️ 99% DAMAGE REDUCTION — THE ECLIPSE AWAKENS!', '#c084fc', 15);
        }
      } else {
        this.hp = Math.max(0, this.hp - dmg);
      }
    } else {
      // In Final Phase (starts at 50% HP after Sword Absorption):
      // Trigger the Final Clash Mechanic at <= 15% HP, and prevent Vaelgor from dying while the Clash is active!
      if (!this.finalClash15Triggered && !this.finalClashPending && this.hp - dmg <= fifteenPctFloor) {
        this.finalClashPending = true;
      }
      if (this.state === 'final_clash_mechanic' || this.finalClashPending) {
        this.hp = Math.max(onePctFloor, this.hp - dmg);
      } else {
        this.hp = Math.max(0, this.hp - dmg);
      }
    }

    this.hitFlashTimer = 0.085;

    // Flash ONLY the specific Pauldron hit by the player's strike (if still intact)
    if (pauldronSide === 'left' && !this.leftPauldronBroken) {
      this.leftPauldronFlashTimer = Math.max(this.leftPauldronFlashTimer, 0.12);
      this.leftPauldronFlashIsPartBreak = false;
    } else if (pauldronSide === 'right' && !this.rightPauldronBroken) {
      this.rightPauldronFlashTimer = Math.max(this.rightPauldronFlashTimer, 0.12);
      this.rightPauldronFlashIsPartBreak = false;
    }

    // 1. Natural Directional Physical Skeleton Impulse (Torso, Head & Pauldrons Jolt Away from Blow)
    let hitAng = this.facingAngle + Math.PI;
    if (attacker && attacker.x !== undefined && attacker.y !== undefined) {
      hitAng = Math.atan2((this.y - attacker.y) / PERSPECTIVE_TILT, this.x - attacker.x);
    }
    const impMult = opts.impulseStrength || (opts.isStrongMove ? 1.35 : 0.75);
    this.recoilVx += Math.cos(hitAng) * 145 * impMult;
    this.recoilVy += Math.sin(hitAng) * 145 * impMult;
    this.pelvisVelZ -= 24 * impMult;
    this.pauldronVelZ -= 38 * impMult;

    // 2. Small Micro-Stutter on Strong Moves
    if (opts.isStrongMove && this.state !== 'eclipse_mechanic' && this.state !== 'horizon_mechanic' && this.state !== 'iaido_mechanic' && this.state !== 'final_phase_mechanic' && this.state !== 'final_clash_mechanic') {
      this.hitStutterTimer = Math.max(this.hitStutterTimer, 0.08);
    }

    // 3. Marathon Raid Stagger Bar Accumulation (Takes sustained pressure over the fight to break!)
    // During the 15% HP Final Clash Mechanic, the Stagger Bar is locked & capped at 99% so allies can prime it without interrupting the Clash!
    if (this.state === 'final_clash_mechanic') {
      const cap99 = Math.max(1, Math.floor(this.maxStagger * 0.99));
      this.stagger = Math.min(cap99, this.stagger + staggerAmt);
    } else if (this.state !== 'staggered' && !this.finalTransitionPending && !this.finalTransitionActive) {
      this.stagger += staggerAmt;
      if (!isHostOrSolo) {
        // Guests wait for the host's stagger_state event instead of breaking on their own copy of the bar.
        this.stagger = Math.min(this.stagger, this.maxStagger - 1);
      } else if (this.stagger >= this.maxStagger && this.state !== 'eclipse_mechanic' && this.state !== 'horizon_mechanic' && this.state !== 'iaido_mechanic' && this.state !== 'final_phase_mechanic') {
        this.stagger = 0;
        this.enterStaggerState('💥 STAGGER BROKEN!');
      }
    }

    // 4. Dual Positional Pauldron Hitscan & Part-Break ("Left Pauldron" & "Right Pauldron"):
    // No HUD meters or floating text! Only physical cracks on the shoulders themselves reveal break progress,
    // and breaking them requires precision hits directly onto the shoulder plate (dist <= 62px) with strong skills!
    const distToStruckShoulder = (pauldronSide === 'left') ? distLeft : distRight;
    const isDirectShoulderHit = (distToStruckShoulder <= 62);
    const pbSkillMult = opts.partBreakMult !== undefined ? opts.partBreakMult : (opts.isStrongMove ? 1.0 : 0);
    const targetSideBroken = (pauldronSide === 'left') ? this.leftPauldronBroken : this.rightPauldronBroken;

    if (!targetSideBroken && isDirectShoulderHit && pbSkillMult > 0) {
      let posType = opts.posType;
      if (!posType && attacker && attacker.x !== undefined && attacker.y !== undefined) {
        let diff = Math.atan2(attacker.y - this.y, attacker.x - this.x) - this.facingAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const absDiff = Math.abs(diff);
        posType = absDiff < 0.95 ? 'head' : (absDiff > Math.PI - 1.15 ? 'back' : 'normal');
      }

      let posEff = 0;
      if (this.state === 'staggered') {
        posEff = 1.25; // Exposed on the ground during Stagger!
      } else if (posType === 'head') {
        posEff = 1.0;  // Direct Frontal / Shoulder Strike!
      } else if (posType === 'normal') {
        posEff = 0.78; // Direct Flank Shoulder Strike!
      } else {
        posEff = 0.0;  // Back attacks cannot reach the front/side shoulder plates!
      }

      const pbGain = staggerAmt * 0.42 * pbSkillMult * posEff;
      if (pbGain > 0) {
        // Guests keep their local crack progress just below the threshold; only the host breaks the plate.
        const pbCap = isHostOrSolo ? this.partBreakMax : this.partBreakMax - 1;
        if (pauldronSide === 'left') {
          this.leftPartBreak = Math.min(pbCap, this.leftPartBreak + pbGain);
          if (this.leftPartBreak >= this.partBreakMax) this.breakPauldron('left', false);
        } else {
          this.rightPartBreak = Math.min(pbCap, this.rightPartBreak + pbGain);
          if (this.rightPartBreak >= this.partBreakMax) this.breakPauldron('right', false);
        }
        this.partBreak = this.leftPartBreak + this.rightPartBreak;
        this.pauldronBroken = (this.leftPauldronBroken && this.rightPauldronBroken);
      }
    }

    // 5. Distinct Phase Transitions at 75% HP (Blood-Moon Imprisonment), 55% HP (Echoing Iaido Ambush), 35% HP (Severed Horizon), and <= 10% HP (Final Phase Awakening)
    const inMajorMech = (
      this.state === 'eclipse_mechanic' ||
      this.state === 'horizon_mechanic' ||
      this.state === 'iaido_mechanic' ||
      this.state === 'final_phase_mechanic' ||
      this.state === 'final_clash_mechanic'
    );
    if (isHostOrSolo && !inMajorMech) {
      const hpPct = this.hp / this.maxHp;
      if (this.finalTransitionPending && !this.eclipse10Triggered && (this.state === 'idle' || this.state === 'walk') && this.lockedByUltimateTimer <= 0) {
        this.eclipse10Triggered = true;
        this.eclipse75Triggered = true;
        this.eclipse55Triggered = true;
        this.eclipse35Triggered = true;
        this.triggerPatternByName('final_phase_mechanic', null, false);
      } else if (!this.finalTransitionPending && !this.finalPhase) {
        if (hpPct <= 0.75 && !this.eclipse75Triggered) {
          this.eclipse75Triggered = true;
          this.triggerPatternByName('eclipse_mechanic', null, false);
        } else if (hpPct <= 0.55 && !this.eclipse55Triggered) {
          this.eclipse55Triggered = true;
          this.triggerPatternByName('iaido_mechanic', null, false);
        } else if (hpPct <= 0.35 && !this.eclipse35Triggered) {
          this.eclipse35Triggered = true;
          this.triggerPatternByName('horizon_mechanic', null, false);
        }
      } else if (this.finalPhase && (this.finalClashPending || hpPct <= 0.15) && !this.finalClash15Triggered && !(this.finalClashRetryT > 0) && this.state !== 'staggered' && this.lockedByUltimateTimer <= 0) {
        this.triggerMechanicFinalClash(attacker, null);
      }
    }
  }

  enterStaggerState(bannerText, fromNetwork = false) {
    // which voice take: a counter that shatters him, a mechanic phase being broken, or the plain stagger bar
    const wasMech = this.state === 'eclipse_mechanic' || this.state === 'horizon_mechanic' || this.state === 'iaido_mechanic';
    const byCounter = typeof bannerText === 'string' && bannerText.indexOf('COUNTER') >= 0;
    const breakClip = byCounter ? (Math.random() < 0.5 ? 'counter_break' : 'counter_break_2') : (wasMech ? 'phase_break' : 'stagger_01');
    this.releaseIaidoGrabbedPlayer();
    this.releaseFinalGrabbedPlayer();
    this.eclipseActive = false;
    this.eclipsePhase = 'none';
    this.horizonPhase = 'none';
    this.iaidoPhase = 'none';
    this.counterableWindow = false;
    this.jumpZ = 0;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.targetX = this.x;
    this.targetY = this.y;
    this.state = 'staggered';
    this.stateDuration = 4.2;
    this.stateTimer = 4.2;
    this.snapFeetToBody();
    if (window.updateMechanicHUD) window.updateMechanicHUD(false);
    audio.playImpactBoom(1.5);
    audio.playParryClang(true);
    audio.playCounterSuccessBoom();
    audio.playBossVoiceClip(breakClip);
    if (window.fx) {
      window.fx.triggerShake(20, 0.5);
      window.fx.triggerZoomPunch(0.085);
      window.fx.triggerScreenFlash('#fde047', 0.22);
      window.fx.addPillar(this.x, this.y, 48, '#facc15', 0.8);
      window.fx.addShockwave(this.x, this.y, 220, '#facc15', 6);
      if (bannerText !== '@none') window.fx.addFloatingText(this.x, this.y - 110, bannerText || '💥 STAGGER BROKEN!', '#fde047', 16);   // '@none': no popup (the Kralum clash)
    }
    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'stagger_state',
        bannerText: bannerText || '💥 STAGGER BROKEN!',
        x: Math.round(this.x),
        y: Math.round(this.y),
        facingAngle: Number(this.facingAngle.toFixed(3))
      });
    }
  }

  executeCounterStagger(counterPlayer, fromNetwork = false) {
    const isHostOrSolo = !window.game || !window.game.net || window.game.net.isHost;
    // Host arbitrates guest counters: one that lands after the window closed here is dropped. Plain
    // patterns get a short latency grace; mechanic phases don't, since their next phase isn't counterable.
    if (fromNetwork && isHostOrSolo && !this.isCounterable()) {
      const inMech = this.state === 'eclipse_mechanic' || this.state === 'iaido_mechanic' || this.state === 'horizon_mechanic' ||
        this.state === 'final_phase_mechanic' || this.state === 'final_clash_mechanic';
      if (inMech || !(this.counterGraceTimer > 0) || this.state === 'staggered') return;
    }

    if (counterPlayer && counterPlayer.id) {
      this.addThreat(counterPlayer.id, 650);
    }

    // In Solo or Duo play (<= 2 players), or during multi-step counter chains (Iaido / Final Phase 3-Dash Chain), reset [D] Counter cooldown to 0s!
    const partyList = (window.game && window.game.party) ? window.game.party : [];
    if (partyList.length <= 2 || this.state === 'iaido_mechanic' || this.state === 'final_phase_mechanic') {
      if (counterPlayer && counterPlayer.cds) {
        counterPlayer.cds.d = 0;
      }
      for (const p of partyList) {
        if (p && p.cds) p.cds.d = 0;
      }
    }

    if (!fromNetwork && window.game && window.game.net) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'counter_stagger',
        playerId: counterPlayer ? counterPlayer.id : null
      });
    }

    // Guests only show feedback; the host's resulting events (stagger_state, iaido_vanish/ambush,
    // final_dash_step, final_roar_qte) and boss_sync drive the actual state change.
    if (!isHostOrSolo) {
      this.counterableWindow = false;
      audio.playParryClang(true);
      audio.playCounterSuccessBoom();
      if (window.fx) {
        window.fx.triggerZoomPunch(0.07);
        window.fx.addShockwave(this.x, this.y, 185, '#38bdf8', 6);
        window.fx.addDragSparks(this.x, this.y - 35, this.facingAngle + Math.PI, 20, false, '#facc15');
      }
      return;
    }

    // Sequential 3-Player Dash Counter Chain during the <= 10% HP Final Phase Transition!
    if (this.state === 'final_phase_mechanic' && this.finalMechPhase === 'dash_counter') {
      this.finalDashStep++;
      this.counterableWindow = false;
      audio.playParryClang(true);
      audio.playCounterSuccessBoom();
      if (window.fx) {
        window.fx.triggerShake(18, 0.32);
        window.fx.triggerZoomPunch(0.075);
        window.fx.triggerScreenFlash('#38bdf8', 0.20);
        window.fx.addShockwave(this.x, this.y, 195, '#38bdf8', 6);
        window.fx.addImpactStarburst(this.x, this.y, '#facc15', 1.45, 0.26, 36);
        window.fx.addDragSparks(this.x, this.y - 35, this.facingAngle + Math.PI, 22, false, '#facc15');
        window.fx.addFloatingText(this.x, this.y - 118, `⚡ COUNTER ${this.finalDashStep}/${this.finalDashTotal}!`, '#38bdf8', 16);
      }
      if (this.finalDashStep < this.finalDashTotal) {
        audio.playBossVoiceClip('countered_01');
        this.startFinalDashStep(this.finalDashStep, null, false);
        return;
      }
      // All 3 players succeeded their 0.75s Counter! Immediately teleport to center and roar for the QTE + Spirit Bomb Stagger!
      this.enterFinalRoarAndQte(partyList, false);
      return;
    }

    // Sequential 3-Step Counter Chain during 55% HP Echoing Iaido Mechanic!
    if (this.state === 'iaido_mechanic' && this.iaidoPhase === 'ambush_counter') {
      this.iaidoStep++;
      this.counterableWindow = false;
      audio.playParryClang(true);
      audio.playCounterSuccessBoom();
      if (window.fx) {
        window.fx.triggerZoomPunch(0.065);
        window.fx.triggerScreenFlash('#38bdf8', 0.18);
        window.fx.addShockwave(this.x, this.y, 175, '#38bdf8', 6);
        window.fx.addDragSparks(this.x, this.y - 35, this.facingAngle + Math.PI, 20, false, '#facc15');
      }
      if (this.iaidoStep < this.iaidoTotalSteps) {
        audio.playBossVoiceClip('countered_01');
        // Gradually fade out into the shadows before the next teleport ambush!
        this.enterIaidoVanish(0.90);
        this.broadcastBossEvent('iaido_vanish', { step: this.iaidoStep, duration: 0.90 });
        return;
      }
      // All 3 ambushes countered -> Full Stagger Collapse!
      this.enterStaggerState('💎 COUNTERED!');
      return;
    }

    // Normal Pattern Counter: Deals a massive chunk (38%) of Vaelgor's Marathon Stagger Bar and opens a 2.1s Counter-Kneel window!
    this.stagger += this.maxStagger * 0.38;
    if (this.stagger >= this.maxStagger && !this.finalTransitionPending && !this.finalTransitionActive) {
      this.stagger = 0;
      this.enterStaggerState('💎 COUNTER-SHATTERED!');
    } else {
      this.counterableWindow = false;
      this.jumpZ = 0;
      this.state = 'staggered';
      this.stateDuration = 2.1;
      this.stateTimer = 2.1;
      audio.playParryClang(true);
      audio.playCounterSuccessBoom();
      audio.playBossVoiceClip('countered_01');
      if (window.fx) {
        window.fx.triggerShake(16, 0.38);
        window.fx.triggerZoomPunch(0.075);
        window.fx.addShockwave(this.x, this.y, 195, '#38bdf8', 6);
        window.fx.addFloatingText(this.x, this.y - 110, '💎 COUNTERED! (+38% STAGGER)', '#38bdf8', 16);
      }
    }
  }

  // Centralized Pattern Dispatcher (Synchronizes Host -> Co-op Peers seamlessly!)
  triggerPatternByName(patternName, target, fromNetwork = false, netData = null) {
    if (target && target.id) {
      this.activeTargetId = target.id;
    }
    // Per-pattern random rolls come from the host's boss_pattern packet on guests (see rollPatternSign).
    this.netPatternData = fromNetwork ? netData : null;
    this.recordExecutedPattern(patternName);
    if (patternName === 'intro_cutscene') this.triggerIntroCutscene();
    else if (patternName === 'uppercut') this.triggerUppercut(target);
    else if (patternName === 'cleave') this.triggerCleave(target);
    else if (patternName === 'thrust') this.triggerThrust(target);
    else if (patternName === 'pat_phantom_step') this.triggerPatternPhantomStep(target);
    else if (patternName === 'pat_guillotine') this.triggerPatternGuillotine(target);
    else if (patternName === 'pat_mirage') this.triggerPatternMirage(target);
    else if (patternName === 'pat_graveyard') this.triggerPatternGraveyard();
    else if (patternName === 'pat_damocles') this.triggerPatternDamocles(target);
    else if (patternName === 'pat_dreadnought') this.triggerPatternDreadnought(target);
    else if (patternName === 'pat_cross_judgment') this.triggerPatternCrossJudgment(target);
    else if (patternName === 'pat_world_cleaver') this.triggerPatternWorldCleaver(target);
    else if (patternName === 'pat_thaemine_pizza') this.triggerPatternThaeminePizza(target);
    else if (patternName === 'pat_phantom_flurry') this.triggerPatternPhantomFlurry(target);
    else if (patternName === 'pat_abyssal_vortex') this.triggerPatternAbyssalVortex(target);
    else if (patternName === 'pat_blood_rain') this.triggerPatternBloodRain(target);
    else if (patternName === 'pat_eclipse_blender') this.triggerPatternEclipseBlender(target);
    else if (patternName === 'pat_final_eclipse_judgment') this.triggerPatternFinalEclipseJudgment(target);
    else if (patternName === 'pat_final_trinity_slash') this.triggerPatternFinalTrinitySlash(target);
    else if (patternName === 'pat_final_oblivion_singularity') this.triggerPatternFinalOblivionSingularity(target);
    else if (patternName === 'pat_final_cataclysm_rain') this.triggerPatternFinalCataclysmRain(target);
    else if (patternName === 'pat_getsuga_charge') this.triggerPatternGetsugaCharge(target);
    else if (patternName === 'eclipse_mechanic') this.triggerMechanicEclipse(true);
    else if (patternName === 'iaido_mechanic') this.triggerMechanicIaido();
    else if (patternName === 'horizon_mechanic') this.triggerMechanicHorizon(true);
    else if (patternName === 'final_phase_mechanic') this.triggerMechanicFinalPhase(true);

    // The pattern triggers aim at the guest-local target position; snap back to the host's aim.
    if (fromNetwork && netData) {
      if (typeof netData.facingAngle === 'number') this.facingAngle = netData.facingAngle;
      if (typeof netData.baseFacing === 'number') this.baseFacing = netData.baseFacing;
    }
    this.netPatternData = null;

    // Broadcast boss_pattern BEFORE firing sub-events (e.g. eclipse_sword_target / horizon_slash)
    // so Guest clients always enter the mechanic state first and never drop sub-event packets!
    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_pattern',
        pattern: patternName,
        targetId: this.activeTargetId,
        x: Math.round(this.x),
        y: Math.round(this.y),
        facingAngle: Number(this.facingAngle.toFixed(3)),
        baseFacing: Number((this.baseFacing ?? this.facingAngle).toFixed(3)),
        phantomStepSide: this.phantomStepSide || 1,
        uppercutWeaveSign: this.uppercutWeaveSign || 1
      });
    }

    // Previously the raid path only shuffled the hours here and never randomized the sword-tell shifts,
    // so the real 35% puzzle always used cw -> ccw -> opposite. Use the same roll as practice mode.
    const isHostOrSolo = !window.game || !window.game.net || window.game.net.isHost;
    if (isHostOrSolo && patternName === 'horizon_mechanic') {
      this.rollHorizonPuzzle();
    }
  }

  // =========================================================================
  // OPENING RAID CINEMATIC: "MARCH FROM THE ABYSSAL DARKNESS" (4.95s)
  // Synchronized with vaelgor_intro_01.mp3 (4.94s: "Step forth into the darkness... and be judged.")
  // Stage 1 (0.00 - 0.68): Vaelgor emerges from the northern cathedral shadows,
  //                        striding heavily into the torchlight ("Step forth into the darkness...")
  //                        with his Obsidian Greatsword dragging sparks across the stone!
  // Stage 2 (0.68 - 1.00): At ~3.36s, right as he says "...and be judged!", he halts at
  //                        the center altar, wrenches his blade upward in a crimson shockwave,
  //                        and levels it at you!
  // =========================================================================
  triggerIntroCutscene() {
    if (this.coreIntro) return this.coreIntro();
    this.state = 'intro_cutscene';
    this.stateDuration = 4.95;
    this.stateTimer = 4.95;
    this.patStep = 0;
    this.counterableWindow = false;
    this.facingAngle = Math.PI * 0.5;
    this.baseFacing = this.facingAngle;
    this.jumpZ = 0;

    // Start 210px north in the cathedral darkness and stride southward to spawnY
    this.introStartX = this.spawnX;
    this.introStartY = this.spawnY - 210;
    this.x = this.introStartX;
    this.y = this.introStartY;
    this.targetX = this.spawnX;
    this.targetY = this.spawnY;
    this.speed = 68;
    this.moveAngle = Math.PI * 0.5;
    this.snapFeetToBody();

    // Initialize cloth & plume nodes cleanly draped behind his shoulders at his walk-in position
    this.resetClothChains();

    if (window.game && window.game.camera && typeof window.game.camera.startCinematicCutscene === 'function') {
      // Snap camera immediately onto Vaelgor in the northern shadows so it tracks him walking in!
      window.game.camera.x = this.x;
      window.game.camera.y = this.y - 34;
      window.game.camera.startCinematicCutscene(
        this.x,
        this.y - 34,
        4.95,
        1.38,
        'VAELGOR, KNIGHT OF THE OBSIDIAN ECLIPSE',
        'WARDEN OF THE ECLIPSE • ABYSSAL CATHEDRAL',
        '"Step forth into the darkness... and be judged."'
      );
    }

    audio.playBossVoiceClip('intro_01', 0.96, true);
  }

  snapFeetToBody() {
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    const airRatio = Math.min(1, Math.max(0, this.jumpZ / 28));
    this.leftFoot.x = this.x + (6 * cosA - (-this.hipWidth) * sinA);
    this.leftFoot.y = this.y + (6 * sinA + (-this.hipWidth) * cosA);
    this.leftFoot.stepping = false;
    this.leftFoot.z = this.jumpZ > 0.1 ? (this.jumpZ + 7 * airRatio) : 0;
    this.rightFoot.x = this.x + (-6 * cosA - (this.hipWidth) * sinA);
    this.rightFoot.y = this.y + (-6 * sinA + (this.hipWidth) * cosA);
    this.rightFoot.stepping = false;
    this.rightFoot.z = this.jumpZ > 0.1 ? (this.jumpZ + 12 * airRatio) : 0;
  }

  syncAirborneFeet() {
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    const airRatio = Math.min(1, Math.max(0, this.jumpZ / 28));
    this.leftFoot.x = this.x + (5 * cosA - (-this.hipWidth) * sinA);
    this.leftFoot.y = this.y + (5 * sinA + (-this.hipWidth) * cosA);
    this.leftFoot.stepping = false;
    this.leftFoot.z = this.jumpZ + 7 * airRatio;
    this.rightFoot.x = this.x + (-5 * cosA - (this.hipWidth) * sinA);
    this.rightFoot.y = this.y + (-5 * sinA + (this.hipWidth) * cosA);
    this.rightFoot.stepping = false;
    this.rightFoot.z = this.jumpZ + 12 * airRatio;
  }

  lungeFootForward(foot, fwdDist, sideDist, dur = 0.24) {
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    foot.stepping = true;
    foot.stepProg = 0;
    foot.stepDur = dur;
    foot.startX = foot.x;
    foot.startY = foot.y;
    foot.targetX = this.x + (fwdDist * cosA - sideDist * sinA);
    foot.targetY = this.y + (fwdDist * sinA + sideDist * cosA);
  }

  // -------------------------------------------------------------------------
  // BOSS COMBAT MOVES & SIGNATURE PATTERNS
  // -------------------------------------------------------------------------
  // ±1 roll that guests take from the host's boss_pattern packet instead of rolling their own.
  rollPatternSign(key) {
    const nd = this.netPatternData;
    if (nd && (nd[key] === 1 || nd[key] === -1)) return nd[key];
    return Math.random() < 0.5 ? -1 : 1;
  }

  triggerUppercut(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'uppercut';
    this.stateDuration = 0.96;
    this.stateTimer = this.stateDuration;
    this.uppercutSubPhase = 'windup';
    this.uppercutWeaveSign = this.rollPatternSign('uppercutWeaveSign');
    this.counterableWindow = true; // Blue Counter Halo indicates counter window!
    this.lungeFootForward(this.rightFoot, -12, this.hipWidth + 3, 0.22);
    audio.playCounterFlashCue();
  }

  triggerCleave(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'cleave';
    this.stateDuration = 1.32;
    this.stateTimer = this.stateDuration;
    this.cleaveSubPhase = 'coil';
    this.counterableWindow = false;
    this.lungeFootForward(this.rightFoot, -10, this.hipWidth + 5, 0.22);
  }

  triggerThrust(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'thrust';
    this.stateDuration = 0.94;
    this.stateTimer = this.stateDuration;
    this.thrustSubPhase = 'charge';
    this.thrustBackstepDone = false;
    this.counterableWindow = true;
    this.lungeFootForward(this.leftFoot, -14, -this.hipWidth - 2, 0.20);
    audio.playCounterFlashCue();
  }

  // EVASIVE PATTERN: Abyssal Cross-Step Slash (Slips past stationary melee swings & cleaves 210° from the flank!)
  triggerPatternPhantomStep(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_phantom_step';
    this.stateDuration = 0.86;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.baseFacing = this.facingAngle;
    this.phantomStepSide = this.rollPatternSign('phantomStepSide');
    this.counterableWindow = false;
    this.lungeFootForward(this.leftFoot, 12, this.phantomStepSide * 14, 0.16);
    audio.playScrapeSpark();
  }

  // PATTERN 1: Guillotine of the Abyss (Strong Pattern — Super Armor)
  triggerPatternGuillotine(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_guillotine';
    this.stateDuration = 2.75;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.leapLocked = false;
    this.baseFacing = this.facingAngle;
    this.leapStartX = this.x;
    this.leapStartY = this.y;
    this.leapTargetX = target ? target.x : (this.x + Math.cos(this.facingAngle) * 115);
    this.leapTargetY = target ? target.y : (this.y + Math.sin(this.facingAngle) * 115 * PERSPECTIVE_TILT);
    this.lungeFootForward(this.rightFoot, -12, this.hipWidth + 4, 0.22);
    audio.playBossVoice('', 'attack');
  }

  // PATTERN 2: Phantom Eclipse Mirage (3 Rapid Dash-Slashes with Delayed Shadow Rifts)
  triggerPatternMirage(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_mirage';
    this.stateDuration = 2.40;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.mirageDashAng = this.facingAngle;
    this.lungeFootForward(this.leftFoot, -10, -this.hipWidth - 4, 0.2);
  }

  // PATTERN 3: Sovereign's Graveyard (Strong Pattern — Super Armor + Inner Safe Ring)
  triggerPatternGraveyard() {
    this.state = 'pat_graveyard';
    this.stateDuration = 2.85;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.lungeFootForward(this.leftFoot, 10, -this.hipWidth - 3, 0.24);
    this.lungeFootForward(this.rightFoot, -10, this.hipWidth + 3, 0.24);
    if (window.fx) {
      window.fx.skySwords = [];
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI * 2) / 8 + 0.2;
        const rad = 140;
        const sx = this.x + Math.cos(ang) * rad;
        const sy = this.y + Math.sin(ang) * rad * PERSPECTIVE_TILT;
        window.fx.spawnSkySword(sx, sy, 0.32 + i * 0.12);
      }
    }
    audio.playParryClang(false);
    audio.playBossVoice('', 'attack');
  }

  // PATTERN 4: Sword of Damocles (Points Greatsword at Player -> Giant Falling Execution Swords!)
  triggerPatternDamocles(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_damocles';
    this.stateDuration = 3.10;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.damoclesTarget = target;
    this.lungeFootForward(this.leftFoot, 14, -this.hipWidth - 2, 0.22);
    this.lungeFootForward(this.rightFoot, -14, this.hipWidth + 4, 0.22);
    audio.playParryClang(false);
    audio.playBossVoice('', 'attack');
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 115, '#e11d48', 4);
    }
  }

  // PATTERN 5: Abyssal Dreadnought Gore-Charge (Corridor Telegraph + Counterable Bull-Rush + 360 Finisher)
  triggerPatternDreadnought(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_dreadnought';
    this.stateDuration = 2.25;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.dreadnoughtHitSet = new Set();
    this.baseFacing = this.facingAngle;
    this.chargeStartX = this.x;
    this.chargeStartY = this.y;
    const chargeDist = 285;
    this.chargeEndX = this.x + Math.cos(this.facingAngle) * chargeDist;
    this.chargeEndY = this.y + Math.sin(this.facingAngle) * chargeDist * PERSPECTIVE_TILT;
    this.counterableWindow = true;
    this.lungeFootForward(this.rightFoot, -16, this.hipWidth + 4, 0.25);
    audio.playScrapeSpark();
    audio.playCounterFlashCue();
  }

  // PATTERN 6: Crimson Cross-Rift Judgment (+ Cardinal then × Diagonal Rupture + 4 Crescent Waves)
  triggerPatternCrossJudgment(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_cross_judgment';
    this.stateDuration = 2.75;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.snapFeetToBody();
    audio.playParryClang(false);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 140, '#e11d48', 5);
    }
  }

  // PATTERN 7 (Thaemine G4 Style): World-Cleaver Split + Twin Flanking Aftershocks (Out -> In Dodge!)
  triggerPatternWorldCleaver(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_world_cleaver';
    this.stateDuration = 2.95;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.baseFacing = this.facingAngle;
    this.snapFeetToBody();
    this.lungeFootForward(this.leftFoot, 18, -this.hipWidth - 4, 0.22);
    audio.playParryClang(false);
    audio.playBossVoice('', 'attack');
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 155, '#c084fc', 5);
    }
  }

  // PATTERN 8 (Thaemine G4 Style): Abyssal 240° Crescent Sweep -> 180° Backhand Pivot -> Tectonic Ring
  triggerPatternThaeminePizza(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_thaemine_pizza';
    this.stateDuration = 3.20;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.baseFacing = this.facingAngle;
    this.snapFeetToBody();
    audio.playScrapeSpark();
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 145, '#e11d48', 4.5);
    }
  }

  // PATTERN 9 (Thaemine G4 Style): Abyssal Blink Counter-Dash -> 4-Hit Anime Cross-Slash Flurry -> Triple Wave Finisher
  triggerPatternPhantomFlurry(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_phantom_flurry';
    this.stateDuration = 3.05;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.baseFacing = this.facingAngle;
    this.counterableWindow = true; // Blue Counter-Flash Iaido stance before the blink!
    this.snapFeetToBody();
    audio.playParryClang(false);
    audio.playCounterFlashCue();
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 125, '#38bdf8', 4.5);
    }
  }

  // PATTERN 10: Abyssal Gravity Vortex -> Inside-Out Annihilation (Pulls party inward -> Inner Nova -> Outer Donut Ring!)
  triggerPatternAbyssalVortex(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_abyssal_vortex';
    this.stateDuration = 3.15;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.baseFacing = this.facingAngle;
    this.snapFeetToBody();
    audio.playSwordPlant();
    audio.playImpactBoom(1.25);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 240, '#c084fc', 5.5);
      window.fx.addPillar(this.x, this.y, 38, '#e11d48', 0.65);
    }
  }

  // PATTERN 11: Crimson Backstep Slash -> 3-Wave Blood-Meteor Barrage -> Counterable Piercing Lunge
  triggerPatternBloodRain(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_blood_rain';
    this.stateDuration = 3.35;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.baseFacing = this.facingAngle;
    this.counterableWindow = false;
    this.lungeFootForward(this.rightFoot, -16, this.hipWidth + 4, 0.20);
    audio.playSwordSlash(true);
  }

  // PATTERN 12: Obsidian Blender Hurricane (Chasing Greatsword Whirlwind + Spiraling Crescent Waves + 4-Way X-Rupture Finisher)
  triggerPatternEclipseBlender(target) {
    if (target) this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
    this.state = 'pat_eclipse_blender';
    this.stateDuration = 3.25;
    this.stateTimer = this.stateDuration;
    this.patStep = 0;
    this.baseFacing = this.facingAngle;
    this.snapFeetToBody();
    audio.playScrapeSpark();
    audio.playParryClang(false);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 150, '#e11d48', 5);
    }
  }

  // =========================================================================
  // 75% HP RAID MECHANIC: "BLOOD-MOON IMPRISONMENT" (Never repeats at 35%!)
  // Phase 0 ('cutscene'): 4.45s Cinematic Phase Transition Cutscene
  //         synchronized with vaelgor_p2_cutscene.mp3 (4.39s: "Kneel before the Black Sun... and despair!")!
  // Phase 1 ('bait_swords'): Bait falling Execution Greatswords onto Vaelgor's
  //         Crimson Barrier Ring to crack his shield, then [Space] dash out!
  // Phase 2 ('stagger_check'): Barrier shatters! Rush in and unleash heavy
  //         melee skills (or [D] Counter) to break his Stagger Check bar!
  // =========================================================================
  isHardRaid() { return !!(window.game && typeof window.game.isHard === 'function' && window.game.isHard()); }

  // The mechanic has a single countdown that starts with the first bait sword: every sword takes 1.45s to lock on plus 0.68s to land,
  // then the stagger check needs about 8.5s, plus some slack for a mistake or two.
  eclipseTotalTime() {
    const swords = this.eclipseCracksNeeded || 2;
    return Math.round((swords * (1.45 + 0.68) + 8.5 + 4.0) * 10) / 10;
  }

  // HARD: a sweeping line turns clockwise on the floor around Vaelgor for the whole mechanic. Whoever it catches is encased in
  // the abyss (like failing the QTE) and has to be broken out by the others. Dash, or jump, to get through it.
  updateEclipseSweep(dt, party) {
    if (!this.isHardRaid()) return;
    for (const p of party || []) {            // alone in the chains: they wear through by themselves
      if (p && p.rooted && p._soloRoot && p.isLocal) {
        p._soloRootT = (p._soloRootT || 0) + dt;
        if (p._soloRootT >= 0.11) { p._soloRootT = 0; p.damageEclipseRoot(4); }
      } else if (p && !p.rooted) p._soloRoot = false;
    }
    const elapsed = Math.max(0, this.eclipseMaxTimer - this.eclipseTimer);
    const SPEED = 1.0, R = 380, W = 24, TELEGRAPH = 1.6;
    this.eclipseSweepAng = Math.PI * 0.5 + SPEED * elapsed;
    this.eclipseSweepLive = elapsed > TELEGRAPH;
    if (!this.eclipseSweepLive) return;
    const ca = Math.cos(this.eclipseSweepAng), sa = Math.sin(this.eclipseSweepAng);
    const isHostOrSolo = !window.game || !window.game.net || window.game.net.isHost;
    for (const p of party || []) {
      if (!p || p.hp <= 0 || p.rooted || p.qteActive) continue;
      if (!(p.isLocal || (p.isBot && isHostOrSolo))) continue;                 // every player's own game rules on their own character
      if ((p._sweepCd || 0) > 0) { p._sweepCd -= dt; continue; }
      if (p.state === 'space_dash' || p.state === 'wakeup_roll' || (p.hIframes || 0) > 0 || (p.jumpZ || 0) > 18) continue;
      const dx = p.x - this.x, dy = (p.y - this.y) / PERSPECTIVE_TILT;
      const along = dx * ca + dy * sa, side = Math.abs(-dx * sa + dy * ca);
      if (along > 28 && along < R && side < W) {
        p._sweepCd = 3.0;
        if (window.fx) { window.fx.addShockwave(p.x, p.y, 110, '#a855f7', 5, 0.35); window.fx.triggerShake(10, 0.25); }
        // The line always traps you in the Abyssal Chains; allies free you by hitting them. With nobody left to do it (playing alone)
        // the chains weaken on their own and give way after about 4 seconds.
        const hasAlly = (party || []).some(q => q && q !== p && q.hp > 0);
        p.applyEclipseRoot(false);
        p._soloRoot = !hasAlly;
      }
    }
  }

  triggerMechanicEclipse(deferSubEvent = false) {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.targetX = this.x;
    this.targetY = this.y;
    this.state = 'eclipse_mechanic';
    this.eclipseActive = true;
    this.eclipsePhase = 'cutscene';
    this.eclipseCutsceneBurstDone = false;
    this.eclipseCracks = 0;
    this.eclipseCracksNeeded = this.isHardRaid() ? 3 : 2;     // Hard: one more sword to bait
    this.eclipseSweepAng = Math.PI * 0.5;
    this.eclipseMaxTimer = 4.45;
    this.eclipseTimer = 4.45;
    const partyLen = (window.game && window.game.party) ? window.game.party.length : 1;
    this.eclipseStaggerCheckMax = Math.round(210 * (1.0 + Math.max(0, partyLen - 1) * 0.55));
    this.eclipseStaggerCheck = this.eclipseStaggerCheckMax;
    this.awakened = true;
    this.jumpZ = 0;
    this.facingAngle = Math.PI * 0.5;
    this.snapFeetToBody();

    // Reset cloth chains to center so the cape doesn't stretch across the arena or have undefined z
    this.resetClothChains();

    // Prepare tracking sword defaults for when 'cutscene' transitions to 'bait_swords'
    const livingParty = (window.game && window.game.party) ? window.game.party.filter(p => p.hp > 0) : [];
    const initTgt = livingParty[0] || (window.game ? window.game.localPlayer : null);
    this.eclipseSwordTargetId = initTgt ? initTgt.id : null;
    this.eclipseSwordX = initTgt ? initTgt.x : this.x;
    this.eclipseSwordY = initTgt ? initTgt.y : (this.y + 120);
    this.eclipseSwordState = 'none';
    this.eclipseSwordMaxTimer = 1.45;
    this.eclipseSwordTimer = this.eclipseSwordMaxTimer;

    if (window.game && window.game.camera && typeof window.game.camera.startCinematicCutscene === 'function') {
      window.game.camera.startCinematicCutscene(
        this.x,
        this.y - 42,
        4.45,
        1.34,
        'VAELGOR, KNIGHT OF THE OBSIDIAN ECLIPSE',
        'PHASE II — BLOOD-MOON AWAKENING',
        '"Kneel before the Black Sun... and despair!"'
      );
    }

    audio.playImpactBoom(1.65);
    audio.playSwordPlant();
    audio.playBossVoiceClip('p2_cutscene', 0.96, true);
    if (window.fx) {
      window.fx.triggerShake(22, 0.65);
      window.fx.triggerScreenFlash('#e11d48', 0.35);
      window.fx.addPillar(this.x, this.y, 64, '#e11d48', 0.95);
      window.fx.addShockwave(this.x, this.y, 280, '#e11d48', 7);
    }
    if (window.updateMechanicHUD) {
      window.updateMechanicHUD(false);
    }
  }

  // =========================================================================
  // 55% HP RAID MECHANIC: "ECHOING IAIDO — PHANTOM AMBUSH"
  // 1. Vaelgor teleports to the center of the arena (`center_coil`, 1.75s) while
  //    speaking vaelgor_mech_iaido.mp3 (4.08s: "Your shadow belongs to the abyss."),
  //    then disappears completely into the shadows (`vanished`, 2.35s) so his full
  //    invocation finishes naturally right as he strikes from the darkness!
  // 2. He teleports right onto a player (`ambush_counter`, 3 sequential steps)
  //    shouting vaelgor_mech_ambush.mp3 (1.25s: "Perish!") in a towering pose with
  //    his greatsword raised high above his head and a Blue Counter-Flash (`[D]`).
  // 3. If the target fails to counter in time, Vaelgor grabs/pins them in place
  //    and a 3.8s lower-level Stagger Bar appears under his feet (`grab_stagger`).
  //    If not staggered in time, Vaelgor executes the grabbed player ("Extinction comes!")!
  // =========================================================================
  triggerMechanicIaido() {
    this.releaseIaidoGrabbedPlayer();
    const prevX = this.x;
    const prevY = this.y;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.targetX = this.x;
    this.targetY = this.y;
    this.state = 'iaido_mechanic';
    this.iaidoPhase = 'center_coil';
    this.iaidoStep = 0;
    this.iaidoTotalSteps = 3;
    this.iaidoMaxTimer = 1.75;
    this.iaidoTimer = 1.75;
    this.iaidoTargetId = null;
    this.iaidoGrabbedPlayerId = null;
    const partyList = (window.game && window.game.party) ? window.game.party : [];
    const partyLen = Math.max(1, partyList.length);
    this.iaidoStaggerCheckMax = Math.round(165 * (1.0 + Math.max(0, partyLen - 1) * 0.55));
    this.iaidoStaggerCheck = this.iaidoStaggerCheckMax;
    this.awakened = true;
    this.jumpZ = 0;
    this.counterableWindow = false;
    this.facingAngle = Math.PI * 0.5;
    this.snapFeetToBody();
    this.resetClothChains();

    // In Solo or Duo play (<= 2 players), immediately reset [D] Counter cooldown so they can counter!
    if (partyLen <= 2) {
      for (const p of partyList) {
        if (p && p.cds) p.cds.d = 0;
      }
    }

    audio.playImpactBoom(1.45);
    audio.playParryClang(false);
    audio.playBossVoiceClip('mech_iaido', 0.95, true);
    if (window.fx) {
      window.fx.addAfterimage(prevX, prevY, this.facingAngle, '#e11d48');
      window.fx.triggerShake(16, 0.4);
      window.fx.triggerScreenFlash('#c084fc', 0.24);
      window.fx.addShockwave(this.x, this.y, 230, '#e11d48', 5.5);
    }
    if (window.updateMechanicHUD) {
      window.updateMechanicHUD(false);
    }
  }

  enterIaidoVanish(duration = 1.05) {
    this.iaidoPhase = 'vanished';
    this.iaidoMaxTimer = duration;
    this.iaidoTimer = duration;
    this.counterableWindow = false;
    this.swordTrail.clear();
    this.lastTipWorld = null;
    audio.playSwordSlash(false, 1.35);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y - 25, 130, '#1e1b4b', 4, 0.42);
      window.fx.addShockwave(this.x, this.y - 25, 85, '#e11d48', 3, 0.36);
    }
  }

  startNextIaidoAmbush(livingParty, forcedData = null) {
    if (this.state !== 'iaido_mechanic') {
      if (forcedData) {
        this.state = 'iaido_mechanic';
        this.awakened = true;
      } else {
        return;
      }
    }

    const partyList = (window.game && window.game.party) ? window.game.party : [];
    // In Solo or Duo play, reset [D] Counter cooldown on each teleport so they can chain all 3 counters!
    if (partyList.length <= 2) {
      for (const p of partyList) {
        if (p && p.cds) p.cds.d = 0;
      }
    }

    if (forcedData) {
      this.iaidoStep = forcedData.step ?? this.iaidoStep;
      this.iaidoTargetId = forcedData.targetId ?? this.iaidoTargetId;
      this.x = forcedData.x;
      this.y = forcedData.y;
      this.facingAngle = forcedData.facingAngle;
    } else {
      let tgt = null;
      if (livingParty && livingParty.length > 0) {
        // Prefer human players or rotate across living party members
        const idx = this.iaidoStep % livingParty.length;
        tgt = livingParty[idx] || livingParty[0];
      }
      this.iaidoTargetId = tgt ? tgt.id : null;

      if (tgt) {
        // Teleport right in front/side of the target player (92px away) from a dramatic angle!
        const angleOffsets = [0, Math.PI * 0.75, -Math.PI * 0.75];
        const baseAng = (tgt.facingAngle !== undefined ? tgt.facingAngle : 0) + angleOffsets[this.iaidoStep % 3];
        const dist = 92;
        this.x = tgt.x + Math.cos(baseAng) * dist;
        this.y = tgt.y + Math.sin(baseAng) * dist * PERSPECTIVE_TILT;
        this.facingAngle = Math.atan2((tgt.y - this.y) / PERSPECTIVE_TILT, tgt.x - this.x);
      } else {
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.facingAngle = Math.PI * 0.5;
      }
    }

    this.targetX = this.x;
    this.targetY = this.y;
    this.baseFacing = this.facingAngle;
    this.iaidoPhase = 'ambush_counter';
    this.iaidoMaxTimer = 1.28;
    this.iaidoTimer = 1.28;
    this.counterableWindow = true;
    this.swordTrail.clear();
    this.snapFeetToBody();
    // Reset cloth chains to new teleport coordinates so the cape doesn't stretch across the arena!
    this.resetClothChains();

    audio.playParryClang(true);
    audio.playScrapeSpark();
    audio.playCounterFlashCue();
    audio.playBossVoiceClip('mech_ambush', 0.95, true);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 135, '#38bdf8', 5);
      window.fx.addShockwave(this.x, this.y, 90, '#e11d48', 3.5);
    }

    if (!forcedData && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'iaido_ambush',
        step: this.iaidoStep,
        targetId: this.iaidoTargetId,
        x: Math.round(this.x),
        y: Math.round(this.y),
        facingAngle: Number(this.facingAngle.toFixed(3))
      });
    }
  }

  enterIaidoGrabStagger(livingParty, forcedTargetId = null, fromNetwork = false) {
    if (this.state !== 'iaido_mechanic') {
      if (fromNetwork) {
        this.state = 'iaido_mechanic';
        this.awakened = true;
      } else {
        return;
      }
    }
    this.iaidoPhase = 'grab_stagger';
    this.counterableWindow = false;
    this.iaidoMaxTimer = 3.8;
    this.iaidoTimer = 3.8;
    const partyLen = (window.game && window.game.party) ? window.game.party.length : 1;
    this.iaidoStaggerCheckMax = Math.round(165 * (1.0 + Math.max(0, partyLen - 1) * 0.55));
    this.iaidoStaggerCheck = this.iaidoStaggerCheckMax;

    const tid = forcedTargetId || this.iaidoTargetId;
    let tgt = livingParty ? livingParty.find(p => p.id === tid) : null;
    if (!tgt && livingParty && livingParty.length > 0) {
      tgt = livingParty[0];
    }

    if (tgt && tgt.hp > 0) {
      this.iaidoGrabbedPlayerId = tgt.id;
      const pinX = this.x + Math.cos(this.facingAngle) * 64;
      const pinY = this.y + Math.sin(this.facingAngle) * 64 * PERSPECTIVE_TILT;
      tgt.x = pinX;
      tgt.y = pinY;
      tgt.targetX = pinX;
      tgt.targetY = pinY;
      tgt.kbVx = 0;
      tgt.kbVy = 0;
      tgt.attackStepVx = 0;
      tgt.attackStepVy = 0;
      tgt.facingAngle = this.facingAngle + Math.PI;
      tgt.state = 'grabbed';
      tgt.stateDuration = 4.0;
      tgt.stateTimer = 4.0;
      tgt.jumpZ = 34;
      if (typeof tgt.snapFeetToBody === 'function') tgt.snapFeetToBody();
    } else {
      this.iaidoGrabbedPlayerId = null;
    }

    audio.playImpactBoom(1.55);
    audio.playSwordSlash(true);
    audio.playParryClang(false);
    if (window.fx) {
      window.fx.triggerShake(18, 0.38);
      window.fx.triggerScreenFlash('#e11d48', 0.22);
      window.fx.addShockwave(this.x, this.y, 165, '#e11d48', 5.5);
    }

    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'iaido_grab',
        targetId: this.iaidoGrabbedPlayerId
      });
    }
  }

  releaseIaidoGrabbedPlayer() {
    if (!this.iaidoGrabbedPlayerId || !window.game || !window.game.party) {
      this.iaidoGrabbedPlayerId = null;
      return;
    }
    const tgt = window.game.party.find(p => p.id === this.iaidoGrabbedPlayerId);
    if (tgt && tgt.hp > 0 && tgt.state === 'grabbed') {
      tgt.state = 'idle';
      tgt.stateTimer = 0;
      tgt.jumpZ = 0;
      if (typeof tgt.snapFeetToBody === 'function') tgt.snapFeetToBody();
    }
    this.iaidoGrabbedPlayerId = null;
  }

  executeIaidoGrabExecution(livingParty) {
    const allParty = (window.game && window.game.party) ? window.game.party : (livingParty || []);
    const tgt = allParty.find(p => p.id === this.iaidoGrabbedPlayerId) || null;
    this.iaidoGrabbedPlayerId = null;

    audio.playImpactBoom(2.0);
    audio.playSwordSlash(true);
    audio.playParryClang(true);
    audio.playBossVoiceClip('wipe_cast', 0.98, true);

    const execX = tgt ? tgt.x : (this.x + Math.cos(this.facingAngle) * 56);
    const execY = tgt ? tgt.y : (this.y + Math.sin(this.facingAngle) * 56 * PERSPECTIVE_TILT);

    if (window.fx) {
      window.fx.triggerHitstop(90);
      window.fx.triggerShake(28, 0.75);
      window.fx.addPillar(execX, execY, 72, '#e11d48', 1.0);
      window.fx.addShockwave(execX, execY, 260, '#f43f5e', 8);
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 + 0.2;
        window.fx.screenCuts.push({
          x1: execX - Math.cos(ang) * 240,
          y1: execY - Math.sin(ang) * 240 * PERSPECTIVE_TILT,
          x2: execX + Math.cos(ang) * 240,
          y2: execY + Math.sin(ang) * 240 * PERSPECTIVE_TILT,
          life: 0.85
        });
      }
    }

    if (tgt && tgt.hp > 0) {
      tgt.jumpZ = 0;
      tgt.takeDamage(999999, 'Abyssal Guillotine Execution', {
        power: 'cataclysm',
        forceLethal: true,
        sourceX: this.x,
        sourceY: this.y,
        pushDist: 210
      });
    }

    this.iaidoPhase = 'none';
    this.state = 'idle';
    this.aiCooldown = 1.6;
  }

  // =========================================================================
  // 35% HP RAID PUZZLE MECHANIC: "CONSTELLATION OF THE ECLIPSE CLOCK"
  // Synchronized with vaelgor_mech_clock.mp3 (4.78s: "The constellation turns... Stand and face oblivion!")
  // Phase 1 ('show_memory'): Vaelgor teleports to the center and summons 4
  //         Cardinal Astral Obelisks (XII ☽, III ☀, VI ★, IX ❖).
  //         For each of the 3 chimes, he points his greatsword at an Obelisk
  //         (scorching that Hour) while the Astrolabe physically turns with one
  //         of 3 Astral Orbit Shifts:
  //           • 'cw'       (Solar Orbit):   +90° Clockwise (+1 Hour)
  //           • 'ccw'      (Lunar Orbit):   -90° Counter-Clockwise (-1 Hour)
  //           • 'opposite' (Eclipse Shadow): 180° Opposite (+2 Hours across the dial)
  // Phase 2 ('solve_step'): Right as he finishes "...Stand and face oblivion!",
  //         Vaelgor channels 3 consecutive Arena-Wide Eclipse Cataclysm Novas!
  //         Players must stand inside the SHIFTED True Sanctuary Obelisk in
  //         exact order (1 -> 2 -> 3) to shatter Vaelgor's Astral Barrier!
  // =========================================================================
  buildHorizonObelisks() {
    const radX = 240;
    const radY = 240 * PERSPECTIVE_TILT;
    return [
      { id: 0, label: 'XII', glyph: '☽', name: 'NORTH', angle: -Math.PI * 0.5, x: this.spawnX,        y: this.spawnY - radY, color: '#38bdf8', solved: false },
      { id: 1, label: 'III', glyph: '☀', name: 'EAST',  angle: 0,              x: this.spawnX + radX, y: this.spawnY,        color: '#facc15', solved: false },
      { id: 2, label: 'VI',  glyph: '★', name: 'SOUTH', angle: Math.PI * 0.5,  x: this.spawnX,        y: this.spawnY + radY, color: '#c084fc', solved: false },
      { id: 3, label: 'IX',  glyph: '❖', name: 'WEST',  angle: Math.PI,        x: this.spawnX - radX, y: this.spawnY,        color: '#f43f5e', solved: false }
    ];
  }

  getHorizonShiftMeta(shiftType) {
    if (shiftType === 'cw') {
      return {
        type: 'cw',
        offset: 1,
        name: 'FOREHAND CLEAVE (+1 CW)',
        shortRule: 'Forehand Cleave sweeps +1 Hour Clockwise',
        color: '#facc15',
        glow: 'rgba(250, 204, 21, 0.38)',
        pale: '#fef08a'
      };
    }
    if (shiftType === 'ccw') {
      return {
        type: 'ccw',
        offset: 3, // -1 mod 4
        name: 'BACKHAND CLEAVE (-1 CCW)',
        shortRule: 'Backhand Cleave whips -1 Hour Counter-Clockwise',
        color: '#38bdf8',
        glow: 'rgba(56, 189, 248, 0.38)',
        pale: '#bae6fd'
      };
    }
    return {
      type: 'opposite',
      offset: 2,
      name: 'OVERHEAD IMPALE (180° OPPOSITE)',
      shortRule: 'Overhead Ground Impale blasts 180° Opposite',
      color: '#f43f5e',
      glow: 'rgba(244, 63, 94, 0.38)',
      pale: '#fecdd3'
    };
  }

  // HARD: one of the slashes can be a "mirror" step. It is drawn in icy blue and swings the wrong way: do the opposite of what it shows.
  // (horizonOrbitShifts always holds the TRUE answer type; this only decides how the swing looks.)
  horizonIsFake(step) {
    const t = this.horizonOrbitShifts && this.horizonOrbitShifts[step];
    return !!(this.horizonFakes && this.horizonFakes[step] && (t === 'cw' || t === 'ccw'));
  }
  horizonVisualShift(step) {
    const t = (this.horizonOrbitShifts && this.horizonOrbitShifts[step]) || 'cw';
    if (this.horizonIsFake(step)) return t === 'cw' ? 'ccw' : 'cw';
    return t;
  }

  getHorizonTargetObeliskIdx(stepIndex) {
    const pointedIdx = (this.horizonSequence && this.horizonSequence[stepIndex] !== undefined)
      ? this.horizonSequence[stepIndex]
      : 0;
    const shiftType = (this.horizonOrbitShifts && this.horizonOrbitShifts[stepIndex])
      ? this.horizonOrbitShifts[stepIndex]
      : 'cw';
    const meta = this.getHorizonShiftMeta(shiftType);
    return (pointedIdx + meta.offset) % 4;
  }

  triggerMechanicHorizon(deferSubEvent = false) {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.targetX = this.x;
    this.targetY = this.y;
    this.state = 'horizon_mechanic';
    // The clock appears first; Vaelgor only starts pointing after this beat
    this.horizonPhase = 'lead';
    this.horizonLeadPending = false;
    if (window.game && window.game.party) for (const q of window.game.party) if (q) q.clockMisses = 0;
    this.horizonSlashIndex = 0; // Current sequence step (0, 1, 2)
    this.horizonSlashTotal = 3;
    this.horizonSolvedCount = 0;
    this.horizonObelisks = this.buildHorizonObelisks();
    this.awakened = true;
    this.jumpZ = 0;
    this.counterableWindow = false;
    this.snapFeetToBody();

    // Reset cloth chains to center so the cape doesn't stretch across the arena
    this.resetClothChains();

    const isHostOrSolo = !window.game || !window.game.net || window.game.net.isHost;
    this.horizonMaxTimer = 2.0;
    this.horizonTimer = 2.0;
    if (!deferSubEvent && isHostOrSolo) {
      this.rollHorizonPuzzle();
    }

    audio.playImpactBoom(1.65);
    audio.playParryClang(true);
    audio.playBossVoiceClip('mech_clock', 0.96, true);
    if (window.fx) {
      window.fx.triggerShake(18, 0.45);
      window.fx.triggerImpactFrame('#c084fc', 0.12);
      window.fx.addShockwave(this.x, this.y, 290, '#c084fc', 7);
      window.fx.addShockwave(this.x, this.y, 180, '#f43f5e', 5);
      window.fx.addImpactStarburst(this.x, this.y, '#c084fc', 1.65, 0.30, 56);
    }
    if (window.updateMechanicHUD) {
      window.updateMechanicHUD(false);
    }
  }

  // Host-only: pick 3 distinct True Target Hours and 3 Physical Sword Tells ('cw', 'ccw', 'opposite'), then start the
  // first memory flash (which broadcasts sequence + shifts). Used by both the raid 35% trigger and practice mode.
  rollHorizonPuzzle() {
    const targetPool = shuffleInPlace([0, 1, 2, 3]);
    const shiftPool = shuffleInPlace(['cw', 'ccw', 'opposite']);
    if (Math.random() < 0.45) {
      // Allow a repeated tell ~45% of the time so Step 3 cannot be trivially solved by elimination!
      const dupIdx = Math.floor(Math.random() * 3);
      shiftPool[dupIdx] = shiftPool[(dupIdx + 1) % 3];
    }
    this.horizonOrbitShifts = [shiftPool[0], shiftPool[1], shiftPool[2]];
    this.horizonSequence = [0, 1, 2].map((step) => {
      const meta = this.getHorizonShiftMeta(this.horizonOrbitShifts[step]);
      return (targetPool[step] - meta.offset + 4) % 4;
    });
    // Hard: exactly one of the two sweeping slashes (never the impale) is a blue mirror step
    this.horizonFakes = [false, false, false];
    if (this.isHardRaid()) {
      const cand = this.horizonOrbitShifts.map((s, i) => (s === 'cw' || s === 'ccw') ? i : -1).filter(i => i >= 0);
      if (cand.length) this.horizonFakes[cand[Math.floor(Math.random() * cand.length)]] = true;
    }
    this.horizonLeadPending = true;   // the first flash starts when the lead-in beat ends (see update)
  }

  startHorizonMemoryFlash(stepIndex, forcedSequence = null, fromNetwork = false, forcedShifts = null, forcedFakes = null) {
    if (this.state !== 'horizon_mechanic') {
      if (fromNetwork) {
        this.triggerMechanicHorizon(true);
      } else {
        return;
      }
    }
    if (Array.isArray(forcedSequence) && forcedSequence.length >= 3) {
      this.horizonSequence = forcedSequence.slice(0, 3);
    }
    if (Array.isArray(forcedShifts) && forcedShifts.length >= 3) {
      this.horizonOrbitShifts = forcedShifts.slice(0, 3);
    } else if (!Array.isArray(this.horizonOrbitShifts) || this.horizonOrbitShifts.length < 3) {
      this.horizonOrbitShifts = ['cw', 'ccw', 'opposite'];
    }
    if (Array.isArray(forcedFakes)) this.horizonFakes = forcedFakes.slice(0, 3);
    else if (!Array.isArray(this.horizonFakes)) this.horizonFakes = [false, false, false];
    if (!this.horizonObelisks || this.horizonObelisks.length < 4) {
      this.horizonObelisks = this.buildHorizonObelisks();
    }
    this.horizonPhase = 'show_memory';
    this.horizonSlashIndex = stepIndex;
    this.horizonMaxTimer = 1.50;
    this.horizonTimer = 1.50;
    this.horizonSwingFxTriggered = false;

    const obIdx = this.horizonSequence[stepIndex] ?? 0;
    const ob = this.horizonObelisks[obIdx] || this.horizonObelisks[0];
    this.facingAngle = ob.angle;
    this.baseFacing = ob.angle;

    // Metallic clock-hand lock onto the pointed Obelisk (neutral crimson/violet — zero color-coded shift spoilers!)
    audio.playParryClang(false);
    if (window.fx && ob) {
      window.fx.addShockwave(this.x, this.y, 112, '#c084fc', 3.6);
      window.fx.addImpactStarburst(ob.x, ob.y, '#f43f5e', 1.05, 0.24, 48);
      window.fx.addDragSparks(ob.x, ob.y - 36, -Math.PI * 0.5, 9, true);
    }

    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'horizon_slash',
        slashIndex: this.horizonSlashIndex,
        sequence: this.horizonSequence,
        shifts: this.horizonOrbitShifts,
        fakes: this.horizonFakes,
        phase: 'show_memory',
        facingAngle: Number(this.facingAngle.toFixed(3))
      });
    }
  }

  startHorizonSolveStep(stepIndex, fromNetwork = false) {
    if (this.state !== 'horizon_mechanic' && fromNetwork) {
      this.triggerMechanicHorizon(true);
    }
    if (!this.horizonObelisks || this.horizonObelisks.length < 4) {
      this.horizonObelisks = this.buildHorizonObelisks();
    }
    this.horizonPhase = 'solve_step';
    this.horizonSlashIndex = stepIndex;
    const solveDurations = [2.65, 2.40, 2.25];
    this.horizonMaxTimer = solveDurations[Math.min(stepIndex, solveDurations.length - 1)] || 2.35;
    this.horizonTimer = this.horizonMaxTimer;
    this.horizonBeamHitMap = {};
    this.facingAngle = Math.PI * 0.5;
    this.baseFacing = this.facingAngle;

    audio.playScrapeSpark();
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 210, '#c084fc', 5);
      window.fx.addImpactStarburst(this.x, this.y, '#c084fc', 1.25, 0.25, 58);
    }

    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'horizon_clash_phase',
        slashIndex: this.horizonSlashIndex,
        sequence: this.horizonSequence,
        shifts: this.horizonOrbitShifts
      });
    }
  }

  resolveHorizonPuzzleStep(livingParty, forcedSuccess = null, fromNetwork = false) {
    if (!this.horizonObelisks || this.horizonObelisks.length < 4) {
      this.horizonObelisks = this.buildHorizonObelisks();
    }
    const pointedIdx = (this.horizonSequence && this.horizonSequence[this.horizonSlashIndex] !== undefined)
      ? this.horizonSequence[this.horizonSlashIndex]
      : 0;
    const pointedOb = this.horizonObelisks[pointedIdx] || this.horizonObelisks[0];
    const shiftType = (this.horizonOrbitShifts && this.horizonOrbitShifts[this.horizonSlashIndex])
      ? this.horizonOrbitShifts[this.horizonSlashIndex]
      : 'cw';
    const shiftMeta = this.getHorizonShiftMeta(shiftType);
    const correctIdx = this.getHorizonTargetObeliskIdx(this.horizonSlashIndex);
    const correctOb = this.horizonObelisks[correctIdx] || this.horizonObelisks[0];
    const safeRadius = 86;

    let anyPlayerInsideCorrect = false;
    if (forcedSuccess !== null) {
      anyPlayerInsideCorrect = !!forcedSuccess;
    } else if (livingParty && livingParty.length > 0) {
      // Prioritize living human players so AI bots never auto-solve the puzzle for a player standing on the wrong pad!
      const humanPlayers = livingParty.filter(p => p && p.hp > 0 && !p.isBot);
      const checkGroup = humanPlayers.length > 0 ? humanPlayers : livingParty;
      for (const p of checkGroup) {
        if (!p || p.hp <= 0) continue;
        const distToOb = Math.hypot(p.x - correctOb.x, (p.y - correctOb.y) / PERSPECTIVE_TILT);
        if (distToOb <= safeRadius) {
          anyPlayerInsideCorrect = true;
        }
      }
    }

    if (livingParty && livingParty.length > 0) {
      for (const p of livingParty) {
        if (!p || p.hp <= 0) continue;
        const distToOb = Math.hypot(p.x - correctOb.x, (p.y - correctOb.y) / PERSPECTIVE_TILT);
        const distToPointed = Math.hypot(p.x - pointedOb.x, (p.y - pointedOb.y) / PERSPECTIVE_TILT);
        if (distToOb <= safeRadius) {
          // Grant Astral Sanctuary Shield & Overpower for solving the shifted rune step!
          p.shield = Math.max(p.shield || 0, Math.round(p.maxHp * 0.18));
          if (typeof p.addOverpower === 'function') p.addOverpower(25);
          if (p.isLocal && window.fx) {
            window.fx.addFloatingText(p.x, p.y - 76, `✨ ${correctOb.label} SANCTUARY ATTUNED! (${shiftMeta.name})`, shiftMeta.color, 13);
          }
        } else {
          // Give clear diagnostic feedback if they stood on the unshifted pointed Hour vs wrong Hour
          const stoodOnPointed = (distToPointed <= safeRadius);
          const dmgReason = stoodOnPointed
            ? `Scorched Hour ${pointedOb.label} (${shiftMeta.shortRule} → ${correctOb.label}!)`
            : `Eclipse Clock Cataclysm (Expected ${correctOb.label}: ${pointedOb.label} + ${shiftMeta.name})`;
          const hpBefore = p.hp;
          p.takeDamage(560, dmgReason, {
            power: 'cataclysm',
            sourceX: this.x,
            sourceY: this.y,
            pushDist: 145
          });
          if (this.isHardRaid() && !p.isRemote && !p.isBot && hpBefore > 0) {
            // Hard: the first missed spot costs half of max HP, the second finishes the player off (shields and armor don't help)
            p.clockMisses = (p.clockMisses || 0) + 1;
            if (p.clockMisses >= 2) {
              p.takeDamage(99999, 'Eclipse Clock Cataclysm (Second Miss)', { forceLethal: true });
            } else if (p.hp > 0) {
              const target = hpBefore - Math.round(p.maxHp * 0.5);
              if (target <= 0) p.takeDamage(99999, dmgReason, { forceLethal: true });
              else p.hp = Math.min(p.hp, target);
            }
          }
          if (p.isLocal && window.fx) {
            const hintText = stoodOnPointed
              ? `⚠️ ${pointedOb.label} SCORCHED! (${shiftMeta.name} → ${correctOb.label})`
              : `⚠️ WRONG HOUR! (${pointedOb.label} + ${shiftMeta.name} → ${correctOb.label})`;
            window.fx.addFloatingText(p.x, p.y - 82, hintText, '#fda4af', 13);
          }
        }
      }
    }

    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'horizon_step_result',
        slashIndex: this.horizonSlashIndex,
        success: anyPlayerInsideCorrect,
        solvedCount: (this.horizonSolvedCount || 0) + (anyPlayerInsideCorrect ? 1 : 0)
      });
    }

    if (anyPlayerInsideCorrect) {
      this.horizonSolvedCount = (this.horizonSolvedCount || 0) + 1;
      correctOb.solved = true;
      audio.playParryClang(true);
      audio.playCounterSuccessBoom();
      if (window.fx) {
        window.fx.triggerShake(14, 0.28);
        window.fx.triggerImpactFrame(shiftMeta.color, 0.08);
        window.fx.addPillar(correctOb.x, correctOb.y, 58, shiftMeta.color, 0.85);
        window.fx.addImpactStarburst(correctOb.x, correctOb.y, shiftMeta.color, 1.55, 0.28, 42);
        window.fx.addLightningBolt(this.x, this.y - 68, correctOb.x, correctOb.y - 36, shiftMeta.color, 0.28, 3.4);
        window.fx.addShockwave(correctOb.x, correctOb.y, 155, shiftMeta.pale, 5.5);
        window.fx.addShockwave(this.x, this.y, 260, shiftMeta.color, 6);
        window.fx.addFissureLine(correctOb.x, correctOb.y, this.x, this.y, shiftMeta.color, 4.5);
      }
    } else {
      audio.playImpactBoom(1.65);
      if (window.fx) {
        window.fx.triggerShake(22, 0.42);
        window.fx.triggerImpactFrame('#e11d48', 0.12);
        window.fx.addShockwave(this.x, this.y, 380, '#e11d48', 8);
        window.fx.addPillar(this.x, this.y, 72, '#e11d48', 0.85);
        window.fx.addImpactStarburst(this.x, this.y, '#f43f5e', 1.8, 0.30, 48);
        window.fx.addLightningBolt(this.x, this.y - 360, this.x, this.y, '#f43f5e', 0.30, 4.2);
      }
    }

    const nextStep = this.horizonSlashIndex + 1;
    if (nextStep < this.horizonSlashTotal) {
      const isHostOrSolo = !window.game || !window.game.net || window.game.net.isHost;
      if (isHostOrSolo) {
        this.startHorizonSolveStep(nextStep, false);
      }
    } else {
      const isHostOrSolo = !window.game || !window.game.net || window.game.net.isHost;
      // Guests never resolve the puzzle outcome themselves: the host's stagger_state / horizon_failed
      // packets drive it (running it here too applied the 1450 wipe to guests twice).
      if (!isHostOrSolo) return;
      // If practicing in Clock Practice Mode, announce result and automatically restart a fresh puzzle after a brief breather!
      if (this.practiceClockMode) {
        if ((this.horizonSolvedCount || 0) >= 3) {
          if (window.fx) {
            window.fx.addFloatingText(this.x, this.y - 140, '🏆 PERFECT 3/3 SWORD-TELL SOLVE! NEXT PUZZLE IN 2.5s...', '#4ade80', 16);
          }
        } else if ((this.horizonSolvedCount || 0) >= 2) {
          if (window.fx) {
            window.fx.addFloatingText(this.x, this.y - 140, `✅ ${this.horizonSolvedCount}/3 SOLVED (BARRIER SHATTERED)! NEXT PUZZLE IN 2.5s...`, '#fde047', 15);
          }
        } else {
          if (window.fx) {
            window.fx.addFloatingText(this.x, this.y - 140, `❌ ${this.horizonSolvedCount || 0}/3 SOLVED — READ VAELGOR'S SWORD SWING vs IMPALE! RETRYING...`, '#fda4af', 15);
          }
        }
        this.stagger = this.maxStagger;
        this.enterStaggerState(
          (this.horizonSolvedCount || 0) >= 2
            ? 'CLOCK PRACTICE: ASTRAL BARRIER SHATTERED!'
            : 'CLOCK PRACTICE: RESETTING ASTROLABE...',
          fromNetwork
        );
        this.stateDuration = 2.5;
        this.stateTimer = 2.5;
        return;
      }

      // All 3 steps resolved! If the party attuned all 3 Obelisks (or >= 2), Vaelgor's Astral Barrier shatters into a Stagger Collapse!
      if ((this.horizonSolvedCount || 0) >= 2) {
        this.stagger = this.maxStagger;
        this.enterStaggerState('CONSTELLATION SOLVED — ASTRAL BARRIER SHATTERED!', fromNetwork);
      } else {
        // Failed too many steps — Vaelgor unleashes an AoE shockwave and resumes combat
        this.executeEclipseCataclysmWipe(livingParty);
        this.horizonPhase = 'none';
        this.state = 'idle';
        if (!fromNetwork) this.scheduleMechRetry('horizon_mechanic');
        this.targetX = this.x;
        this.targetY = this.y;
        this.speed = 0;
        this.aiCooldown = 1.4;
        if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
          window.game.net.broadcast({
            type: 'boss_event',
            event: 'horizon_failed',
            x: Math.round(this.x),
            y: Math.round(this.y)
          });
        }
      }
    }
  }

  startNextEclipseBaitSword(livingParty, forcedTargetId = null) {
    if (this.state !== 'eclipse_mechanic') {
      if (forcedTargetId !== null) {
        this.triggerMechanicEclipse(true);
      } else {
        return;
      }
    }
    this.eclipsePhase = 'bait_swords';
    if (this.eclipseMaxTimer < 5.0) {
      this.eclipseMaxTimer = this.eclipseTotalTime();
      this.eclipseTimer = this.eclipseMaxTimer;
    }
    let tgt = null;
    if (forcedTargetId && livingParty) {
      tgt = livingParty.find(p => p.id === forcedTargetId) || null;
    }
    if (!tgt && livingParty && livingParty.length > 0) {
      // Rotate across living players so everyone gets to bait a sword in Co-op!
      const idx = this.eclipseCracks % livingParty.length;
      tgt = livingParty[idx] || livingParty[0];
    }
    this.eclipseSwordTargetId = tgt ? tgt.id : null;
    this.eclipseSwordX = tgt ? tgt.x : this.x;
    this.eclipseSwordY = tgt ? tgt.y : (this.y + 120);
    this.eclipseSwordState = 'tracking';
    this.eclipseImpactShown = false;
    this.eclipseSwordMaxTimer = 1.45;
    this.eclipseSwordTimer = this.eclipseSwordMaxTimer;

    if (!forcedTargetId && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'eclipse_sword_target',
        targetId: this.eclipseSwordTargetId,
        x: Math.round(this.eclipseSwordX),
        y: Math.round(this.eclipseSwordY),
        cracks: this.eclipseCracks,
        cracksNeeded: this.eclipseCracksNeeded
      });
    }
  }

  lockEclipseBaitSword(lockX, lockY, fromNetwork = false) {
    if (this.state !== 'eclipse_mechanic' && fromNetwork) {
      this.triggerMechanicEclipse(true);
    }
    this.eclipsePhase = 'bait_swords';
    this.eclipseSwordX = lockX;
    this.eclipseSwordY = lockY;
    this.eclipseSwordState = 'locked';
    this.eclipseImpactShown = false;
    this.eclipseSwordMaxTimer = 0.68;
    this.eclipseSwordTimer = 0.68;
    audio.playParryClang(false);
    if (window.fx) {
      // Spawn the Colossal Execution Sword plummeting onto the locked coordinates (0.68s telegraph -> impact)
      window.fx.spawnColossalExecutionSword(this.eclipseSwordX, this.eclipseSwordY, 0.68);
    }
    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'eclipse_sword_lock',
        x: Math.round(this.eclipseSwordX),
        y: Math.round(this.eclipseSwordY)
      });
    }
  }

  onEclipseBaitSwordImpact(livingParty, fromNetwork = false) {
    const isHostOrSolo = !window.game || !window.game.net || window.game.net.isHost;
    // Guests show the impact once per sword; cracks, the stagger-check phase and the next sword
    // all come from the host (eclipse_sword_target / eclipse_stagger_phase / boss_sync).
    if (!isHostOrSolo) {
      if (this.eclipseImpactShown) return;
      this.eclipseImpactShown = true;
    }
    const distToBoss = Math.hypot(this.eclipseSwordX - this.x, (this.eclipseSwordY - this.y) / PERSPECTIVE_TILT);
    const hitBarrier = distToBoss <= this.eclipseBarrierRadius;

    if (hitBarrier) {
      if (isHostOrSolo) this.eclipseCracks++;
      this.hitFlashTimer = 0.14;
      this.recoilVy -= 185;
      this.pelvisVelZ -= 38;
      this.pauldronVelZ -= 55;
      audio.playForgeAnvil(true);
      audio.playImpactBoom(1.45);
      if (window.fx) {
        window.fx.triggerShake(18, 0.35);
        window.fx.addShockwave(this.x, this.y, 175, '#facc15', 6);
        window.fx.addDragSparks(this.x, this.y - 30, 0, 24, false, '#facc15');
      }

      if (isHostOrSolo && this.eclipseCracks >= this.eclipseCracksNeeded) {
        this.enterEclipseStaggerCheckPhase(fromNetwork);
        return;
      }
    }

    if (isHostOrSolo) {
      this.startNextEclipseBaitSword(livingParty);
    }
  }

  enterEclipseStaggerCheckPhase(fromNetwork = false) {
    this.eclipsePhase = 'stagger_check';
    this.eclipseSwordState = 'none';
    // one clock for the whole mechanic: it started with the first bait, and the stagger check just keeps running on it
    // (with a small floor so a late finish still leaves a fair window)
    this.eclipseTimer = Math.max(this.eclipseTimer, 4.5);
    const partyLen = (window.game && window.game.party) ? window.game.party.length : 1;
    this.eclipseStaggerCheckMax = Math.round(210 * (1.0 + Math.max(0, partyLen - 1) * 0.55));
    this.eclipseStaggerCheck = this.eclipseStaggerCheckMax;
    audio.playParryClang(true);
    audio.playImpactBoom(1.6);
    if (window.fx) {
      window.fx.triggerShake(22, 0.45);
      window.fx.addShockwave(this.x, this.y, 240, '#38bdf8', 7);
      window.fx.addShockwave(this.x, this.y, 165, '#facc15', 5);
    }
    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'eclipse_stagger_phase'
      });
    }
  }

  // Check if a player attack swing hits a rooted teammate's Abyssal Chains (even when far from Vaelgor!)
  checkPlayerHitAnchors(hx, hy, radius = 115) {
    const party = (window.game && window.game.party) ? window.game.party : [];
    let hitAny = false;
    for (const p of party) {
      if (!p || p.hp <= 0 || !p.rooted) continue;
      if (Math.hypot(p.x - hx, p.y - hy) <= radius + 45) {
        p.damageEclipseRoot(38, null, false);
        hitAny = true;
      }
    }
    return hitAny;
  }
  // Host-only helper for simple boss_event packets.
  // A failed mechanic comes back once, MECH_RETRY_DELAY seconds later (host / solo decides; the retry itself is an ordinary
  // triggerPatternByName, which guests already follow).
  scheduleMechRetry(name) {
    if (this.isHardRaid()) return;             // Hard: a failed mechanic is a party wipe, nothing to come back to
    if (!this.mechRetried) this.mechRetried = {};
    if (this.mechRetried[name]) return;
    this.mechRetried[name] = true;
    this.mechRetry = { name, t: 20 };
  }

  broadcastBossEvent(event, extra = null) {
    if (!window.game || !window.game.net || !window.game.net.isHost) return;
    window.game.net.broadcast(Object.assign({ type: 'boss_event', event }, extra));
  }

  // The first mechanic failed (the barrier never fell, or the stagger check ran out): Vaelgor raises his sword to the Black Sun,
  // the arena darkens and the eclipse is hurled down on the party. Lethal on Hard; Normal turns it into a crushing blow (difficulty.js).
  executeEclipseCataclysmWipe(party) {
    if (this.eclipsePhase === 'wipe') return;   // the host's event and the local timer can both arrive
    this.eclipsePhase = 'wipe';
    this.eclipseMaxTimer = 2.6;
    this.eclipseTimer = 2.6;
    this.wipeStruck = false;
    audio.playBossVoiceClip('wipe_cast', 0.98, true);
    audio.playEclipseBell && audio.playEclipseBell();
    if (window.fx) {
      window.fx.triggerShake(8, 1.2);
      window.fx.addShockwave(this.x, this.y, 260, '#a855f7', 6, 0.7);
    }
  }

  // The moment the eclipse lands.
  strikeEclipseCataclysm() {
    this.wipeStruck = true;
    audio.playImpactBoom(2.2);
    audio.playSwordSlash(true);
    if (window.fx) {
      window.fx.triggerHitstop(110);
      window.fx.triggerShake(36, 1.0);
      window.fx.triggerScreenFlash('#fff1f2', 0.7);
      window.fx.addPillar(this.x, this.y, 130, '#e11d48', 1.3);
      window.fx.addShockwave(this.x, this.y, 700, '#f43f5e', 12, 0.9);
      window.fx.addShockwave(this.x, this.y, 480, '#ffffff', 8, 0.6);
      window.fx.addShockwave(this.x, this.y, 300, '#a855f7', 8, 0.5);
      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI;
        const cx = this.x + (Math.random() - 0.5) * 360, cy = this.y + (Math.random() - 0.5) * 240;
        window.fx.screenCuts.push({ x1: cx - Math.cos(ang) * 320, y1: cy - Math.sin(ang) * 320, x2: cx + Math.cos(ang) * 320, y2: cy + Math.sin(ang) * 320, life: 1.0 });
      }
    }
    const all = (window.game && window.game.party) ? window.game.party : [];
    for (const p of all) {
      if (p && p.hp > 0) {
        if (typeof p.clearEclipseQteAndRoot === 'function') p.clearEclipseQteAndRoot();
        p.takeDamage(99999, 'Judgment of the Black Sun', { power: 'cataclysm', forceLethal: true, sourceX: this.x, sourceY: this.y, pushDist: 260 });
      }
    }
  }
  // =========================================================================
  // 10% HP FINAL PHASE TRANSITION: "PALE ECLIPSE & SPIRIT BOMB ABSORPTION"
  // =========================================================================
  triggerMechanicFinalPhase(fromNetwork = false) {
    const isClient = window.game && window.game.net && window.game.net.isClient();
    if (isClient && !fromNetwork) return;

    this.releaseIaidoGrabbedPlayer();
    this.releaseFinalGrabbedPlayer();
    this.eclipse10Triggered = true;
    this.finalTransitionPending = false;
    this.finalTransitionActive = true;
    // Start the transition in the dark Abyssal Cathedral! The arena turns blinding white at mid-cutscene and reveals the Pale Eclipse Sanctuary!
    this.finalPhaseArena = false;
    this.arenaWhiteoutClimaxDone = false;
    this.arenaWhiteoutAlpha = 0;
    this.awakened = true;
    this.enraged = true;
    this.state = 'final_phase_mechanic';
    this.finalMechPhase = 'arena_cutscene';
    this.finalMechMaxTimer = 6.0;
    this.finalMechTimer = 6.0;
    this.finalDashStep = 0;
    this.finalDashTargetId = null;
    this.finalGrabbedPlayerId = null;
    this.counterableWindow = false;
    this.jumpZ = 0;
    this.telegraphs = [];
    this.voidZones = [];
    this.bloodOrbs = [];
    this.crescentWaves = [];
    this.swordTrail.clear();

    // Teleport to center for the dark buildup -> whiteout -> eerie arena shift cutscene
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.targetX = this.spawnX;
    this.targetY = this.spawnY;
    this.facingAngle = Math.PI * 0.5;
    this.baseFacing = this.facingAngle;
    this.snapFeetToBody();
    this.resetClothChains();

    // Build 3 random dash targets (avoiding consecutive identical targets when multiple players are alive)
    const party = (window.game && window.game.party) ? window.game.party.filter(p => p.hp > 0) : [];
    this.finalDashTargets = [];
    let lastId = null;
    for (let i = 0; i < 3; i++) {
      if (party.length === 0) {
        this.finalDashTargets.push(null);
      } else if (party.length === 1) {
        this.finalDashTargets.push(party[0].id);
      } else {
        const pool = party.filter(p => p.id !== lastId);
        const pick = pool[Math.floor(Math.random() * pool.length)] || party[0];
        this.finalDashTargets.push(pick.id);
        lastId = pick.id;
      }
    }

    audio.playImpactBoom(1.9);
    audio.playEclipseBell();
    audio.playBossVoiceClip('pale_eclipse', 1.0, true);
    if (window.game && window.game.camera && typeof window.game.camera.startCinematicCutscene === 'function') {
      window.game.camera.startCinematicCutscene(
        this.x,
        this.y - 38,
        6.0,
        1.32,
        'DOMAIN SHIFT: THE PALE ECLIPSE',
        '99% DAMAGE REDUCTION • 3-PLAYER COUNTER CHAIN IMPENDING',
        '"The light of the Pale Eclipse strips away all sanctuary... Face your judgment!"'
      );
    }
    if (window.fx) {
      window.fx.triggerHitstop(80);
      window.fx.triggerShake(24, 0.9);
      window.fx.addShockwave(this.x, this.y, 380, '#c084fc', 8);
      window.fx.addShockwave(this.x, this.y, 240, '#e11d48', 6);
      window.fx.addPillar(this.x, this.y, 75, '#c084fc', 1.2);
      window.fx.addFloatingText(this.x, this.y - 210, '🌑 THE ECLIPSE AWAKENS — DOMAIN SHIFTING...', '#c084fc', 20);
    }

    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_phase_start',
        targets: this.finalDashTargets
      });
    }
  }

  startFinalDashStep(stepIdx, livingParty, forcedData = null) {
    const isClient = window.game && window.game.net && window.game.net.isClient();
    if (isClient && !forcedData) return;

    const allParty = (window.game && window.game.party) ? window.game.party : (livingParty || []);
    const alive = allParty.filter(p => p.hp > 0);

    if (forcedData) {
      this.finalDashStep = forcedData.step ?? stepIdx;
      this.finalDashTargetId = forcedData.targetId ?? null;
      this.finalDashStartX = this.x;
      this.finalDashStartY = this.y;
      this.targetX = forcedData.x;
      this.targetY = forcedData.y;
      this.facingAngle = forcedData.facingAngle;
    } else {
      this.finalDashStep = stepIdx;
      let tid = (this.finalDashTargets && this.finalDashTargets[stepIdx]) ? this.finalDashTargets[stepIdx] : null;
      let tgt = alive.find(p => p.id === tid) || null;
      if (!tgt && alive.length > 0) {
        tgt = alive[Math.floor(Math.random() * alive.length)];
        tid = tgt.id;
      }
      this.finalDashTargetId = tid;
      this.finalDashStartX = this.x;
      this.finalDashStartY = this.y;

      if (tgt) {
        const angleOffsets = [0, Math.PI * 0.65, -Math.PI * 0.65];
        const baseAng = (tgt.facingAngle !== undefined ? tgt.facingAngle : 0) + angleOffsets[stepIdx % 3];
        const dist = 88;
        this.targetX = tgt.x + Math.cos(baseAng) * dist;
        this.targetY = tgt.y + Math.sin(baseAng) * dist * PERSPECTIVE_TILT;
        this.facingAngle = Math.atan2((tgt.y - this.targetY) / PERSPECTIVE_TILT, tgt.x - this.targetX);
      } else {
        this.targetX = this.spawnX;
        this.targetY = this.spawnY;
        this.facingAngle = Math.PI * 0.5;
      }
    }

    // Ensure the targeted player (and in solo/small parties, all players) has their [D] Counter ready!
    for (const p of allParty) {
      if (p && p.cds && (allParty.length <= 3 || p.id === this.finalDashTargetId)) {
        p.cds.d = 0;
      }
    }

    this.baseFacing = this.facingAngle;
    this.finalMechPhase = 'dash_windup';
    this.finalMechMaxTimer = 0.34;
    this.finalMechTimer = 0.34;
    this.counterableWindow = false;

    audio.playDashWhoosh();
    audio.playScrapeSpark();
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 130, '#e2e8f0', 4.5);
    }

    if (!forcedData && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_dash_step',
        step: this.finalDashStep,
        targetId: this.finalDashTargetId,
        x: Math.round(this.targetX),
        y: Math.round(this.targetY),
        facingAngle: Number(this.facingAngle.toFixed(3))
      });
    }
  }

  openFinalDashCounterWindow(forcedData = null) {
    // The re-aim below uses player positions, which differ per client: host decides and sends final_dash_open.
    const isClient = window.game && window.game.net && window.game.net.isClient();
    if (isClient && !forcedData) return;
    if (forcedData && this.state !== 'final_phase_mechanic') return;

    this.x = this.targetX;
    this.y = this.targetY;
    this.snapFeetToBody();
    this.resetClothChains();

    // Update facing toward target player's current position right as the 0.75s counter window opens
    const allParty = (window.game && window.game.party) ? window.game.party : [];
    const tgt = forcedData ? null : allParty.find(p => p.id === this.finalDashTargetId && p.hp > 0);
    if (forcedData) {
      if (typeof forcedData.x === 'number') this.x = forcedData.x;
      if (typeof forcedData.y === 'number') this.y = forcedData.y;
      if (typeof forcedData.facingAngle === 'number') this.facingAngle = forcedData.facingAngle;
      if (typeof forcedData.step === 'number') this.finalDashStep = forcedData.step;
      this.targetX = this.x;
      this.targetY = this.y;
      this.baseFacing = this.facingAngle;
      this.snapFeetToBody();
    } else if (tgt) {
      const dist = 86;
      const angToBoss = Math.atan2((this.y - tgt.y) / PERSPECTIVE_TILT, this.x - tgt.x);
      this.x = tgt.x + Math.cos(angToBoss) * dist;
      this.y = tgt.y + Math.sin(angToBoss) * dist * PERSPECTIVE_TILT;
      this.targetX = this.x;
      this.targetY = this.y;
      this.facingAngle = Math.atan2((tgt.y - this.y) / PERSPECTIVE_TILT, tgt.x - this.x);
      this.baseFacing = this.facingAngle;
      this.snapFeetToBody();
    }

    this.finalMechPhase = 'dash_counter';
    this.finalMechMaxTimer = 0.75;
    this.finalMechTimer = 0.75;
    this.counterableWindow = true;

    audio.playCounterFlashCue();
    audio.playParryClang(true);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 145, '#38bdf8', 5.5);
      window.fx.addFloatingText(this.x, this.y - 190, `COUNTER [${this.finalDashStep + 1}/3]! (0.75s)`, '#38bdf8', 18);
    }
    if (!forcedData) {
      this.broadcastBossEvent('final_dash_open', {
        step: this.finalDashStep,
        x: Math.round(this.x),
        y: Math.round(this.y),
        facingAngle: Number(this.facingAngle.toFixed(3))
      });
    }
  }

  triggerFinalGrabWipe(livingParty, forcedTargetId = null, fromNetwork = false) {
    const isClient = window.game && window.game.net && window.game.net.isClient();
    if (isClient && !fromNetwork) return;

    this.state = 'final_phase_mechanic';
    this.finalMechPhase = 'grab_wipe';
    this.finalMechMaxTimer = 1.45;
    this.finalMechTimer = 1.45;
    this.counterableWindow = false;
    this.finalGrabWipeExecuted = false;

    const allParty = (window.game && window.game.party) ? window.game.party : (livingParty || []);
    const tid = forcedTargetId || this.finalDashTargetId;
    let tgt = allParty.find(p => p.id === tid && p.hp > 0) || allParty.find(p => p.hp > 0) || null;

    if (tgt) {
      this.finalGrabbedPlayerId = tgt.id;
      const pinX = this.x + Math.cos(this.facingAngle) * 62;
      const pinY = this.y + Math.sin(this.facingAngle) * 62 * PERSPECTIVE_TILT;
      tgt.x = pinX;
      tgt.y = pinY;
      tgt.targetX = pinX;
      tgt.targetY = pinY;
      tgt.kbVx = 0;
      tgt.kbVy = 0;
      tgt.state = 'grabbed';
      tgt.stateDuration = 2.0;
      tgt.stateTimer = 2.0;
      tgt.jumpZ = 48;
      if (typeof tgt.snapFeetToBody === 'function') tgt.snapFeetToBody();
    } else {
      this.finalGrabbedPlayerId = null;
    }

    audio.playImpactBoom(1.7);
    audio.playBossVoiceClip('wipe_cast', 1.0, true);
    if (window.fx) {
      window.fx.triggerShake(22, 0.5);
      window.fx.triggerScreenFlash('#4c1d95', 0.35);
      window.fx.addShockwave(this.x, this.y, 190, '#9333ea', 6.5);
      window.fx.addFloatingText(this.x, this.y - 205, 'COUNTER FAILED — ABYSSAL GRAB!', '#f43f5e', 20);
    }

    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_grab_wipe',
        targetId: this.finalGrabbedPlayerId
      });
    }
  }

  releaseFinalGrabbedPlayer() {
    if (!this.finalGrabbedPlayerId || !window.game || !window.game.party) {
      this.finalGrabbedPlayerId = null;
      return;
    }
    const tgt = window.game.party.find(p => p.id === this.finalGrabbedPlayerId);
    if (tgt && tgt.hp > 0 && tgt.state === 'grabbed') {
      tgt.state = 'idle';
      tgt.stateTimer = 0;
      tgt.jumpZ = 0;
      if (typeof tgt.snapFeetToBody === 'function') tgt.snapFeetToBody();
    }
    this.finalGrabbedPlayerId = null;
  }

  executeFinalGrabWipeSlam(livingParty) {
    if (this.finalGrabWipeExecuted) return;
    this.finalGrabWipeExecuted = true;

    const allParty = (window.game && window.game.party) ? window.game.party : (livingParty || []);
    const tgt = allParty.find(p => p.id === this.finalGrabbedPlayerId) || null;
    const slamX = tgt ? tgt.x : (this.x + Math.cos(this.facingAngle) * 62);
    const slamY = tgt ? tgt.y : (this.y + Math.sin(this.facingAngle) * 62 * PERSPECTIVE_TILT);

    if (tgt) {
      tgt.jumpZ = 0;
      if (typeof tgt.snapFeetToBody === 'function') tgt.snapFeetToBody();
    }
    this.finalGrabbedPlayerId = null;

    audio.playImpactBoom(2.2);
    audio.playSwordSlash(true);
    if (window.fx) {
      window.fx.triggerHitstop(110);
      window.fx.triggerShake(34, 1.0);
      window.fx.triggerScreenFlash('#581c87', 0.55);
      window.fx.addPillar(slamX, slamY, 110, '#7e22ce', 1.3);
      window.fx.addShockwave(slamX, slamY, 640, '#9333ea', 12);
      window.fx.addShockwave(slamX, slamY, 480, '#e11d48', 9);
      window.fx.addShockwave(slamX, slamY, 320, '#0f172a', 7);
    }

    for (const p of allParty) {
      if (p && p.hp > 0) {
        p.takeDamage(99999, 'Abyssal Envelopment Slam', {
          power: 'cataclysm',
          forceLethal: true,
          sourceX: slamX,
          sourceY: slamY,
          pushDist: 260
        });
      }
    }
  }

  enterFinalRoarAndQte(livingParty, fromNetwork = false) {
    const isClient = window.game && window.game.net && window.game.net.isClient();
    if (isClient && !fromNetwork) return;

    this.state = 'final_phase_mechanic';
    this.finalMechPhase = 'roar_qte_spirit_bomb';
    // He charges the Spirit Bomb for a beat (the "share your energy" line) before the typing QTE opens
    this.finalQteDelayTotal = 2.0;
    this.finalQteDelay = this.finalQteDelayTotal;
    this.finalMechMaxTimer = 14.0 + this.finalQteDelayTotal;
    this.finalMechTimer = 14.0 + this.finalQteDelayTotal;
    this.counterableWindow = false;
    this.soloVanguardEchoesActive = false;
    this.soloEchoAttackTimer = 0;

    // Teleport to center and begin charging the overhead Spirit Bomb Eclipse sphere
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.targetX = this.spawnX;
    this.targetY = this.spawnY;
    this.facingAngle = Math.PI * 0.5;
    this.baseFacing = this.facingAngle;
    this.jumpZ = 0;
    this.snapFeetToBody();
    this.resetClothChains();

    const allParty = (window.game && window.game.party) ? window.game.party : (livingParty || []);
    const partyLen = Math.max(1, allParty.length);
    // Scale stagger bar so 1 player alone (~210 stagger output in 8.5s) cannot break it without multiple people
    // (or in pure 1v1 solo mode, passing the QTE summons Astral Vanguard Echoes to contribute the multi-player stagger!)
    this.finalSpiritBombMaxStagger = Math.round(330 * (1.0 + Math.max(1, partyLen - 1) * 0.55));
    this.finalSpiritBombStagger = this.finalSpiritBombMaxStagger;
    this.finalSpiritBombRadius = 38;

    // (the independent 5-key QWER typing QTE for every living player now opens when finalQteDelay runs out, see update)

    audio.playImpactBoom(1.95);
    audio.playEclipseBell();
    audio.playBossVoiceClip('spirit_bomb', 1.0, true);
    if (window.fx) {
      window.fx.triggerHitstop(70);
      window.fx.triggerShake(25, 0.85);
      window.fx.triggerScreenFlash('#c084fc', 0.35);
      window.fx.addShockwave(this.x, this.y, 440, '#a855f7', 9);
      window.fx.addShockwave(this.x, this.y, 280, '#f43f5e', 6.5);
    }

    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_roar_qte',
        maxStagger: this.finalSpiritBombMaxStagger
      });
    }
  }

  triggerFinalSpiritBombWipe(livingParty, fromNetwork = false) {
    const isClient = window.game && window.game.net && window.game.net.isClient();
    if (isClient && !fromNetwork) return;

    this.state = 'final_phase_mechanic';
    this.finalMechPhase = 'spirit_bomb_wipe';
    this.finalMechMaxTimer = 2.0;
    this.finalMechTimer = 2.0;
    this.counterableWindow = false;

    const allParty = (window.game && window.game.party) ? window.game.party : (livingParty || []);
    audio.playImpactBoom(2.4);
    audio.playEclipseBell();
    audio.playBossVoiceClip('wipe_cast', 1.0, true);
    if (window.fx) {
      window.fx.triggerHitstop(120);
      window.fx.triggerShake(38, 1.2);
      window.fx.triggerScreenFlash('#e11d48', 0.65);
      window.fx.addPillar(this.x, this.y, 150, '#9333ea', 1.5);
      window.fx.addShockwave(this.x, this.y, 680, '#f43f5e', 14);
      window.fx.addShockwave(this.x, this.y, 520, '#a855f7', 10);
      window.fx.addFloatingText(this.x, this.y - 230, 'ECLIPSE CATACLYSM — RAID WIPE', '#f43f5e', 24);
    }

    for (const p of allParty) {
      if (p && p.hp > 0) {
        if (typeof p.clearEclipseQteAndRoot === 'function') p.clearEclipseQteAndRoot();
        p.takeDamage(99999, 'Eclipse Spirit Bomb Cataclysm', {
          power: 'cataclysm',
          forceLethal: true,
          sourceX: this.x,
          sourceY: this.y,
          pushDist: 280
        });
      }
    }

    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_spirit_bomb_wipe'
      });
    }
  }

  enterFinalSwordAbsorbCutscene(fromNetwork = false) {
    const isClient = window.game && window.game.net && window.game.net.isClient();
    if (isClient && !fromNetwork) return;

    this.state = 'final_phase_mechanic';
    this.finalMechPhase = 'sword_absorb_cutscene';
    this.finalMechMaxTimer = 7.4;
    this.finalMechTimer = 7.4;
    this.counterableWindow = false;
    this.finalSpiritBombStagger = 0;
    this.soloVanguardEchoesActive = false;
    this.swordAbsorbRoarDone = false;
    this.swordAbsorbSkyThrustDone = false;
    this.swordAbsorbAscendDone = false;
    this.eclipseBodyTransformProg = 0;

    // Clear any remaining QTE or roots on players and immediately blast nearby players back with Vaelgor's Stagger-Break Roar!
    const allParty = (window.game && window.game.party) ? window.game.party : [];
    for (const p of allParty) {
      if (!p) continue;
      if (typeof p.clearEclipseQteAndRoot === 'function') {
        p.clearEclipseQteAndRoot();
      }
      if (p.hp > 0) {
        const dx = p.x - this.x;
        const dy = (p.y - this.y) / PERSPECTIVE_TILT;
        const dist = Math.hypot(dx, dy) || 1;
        const pushAng = dist > 2 ? Math.atan2(dy, dx) : (Math.random() * Math.PI * 2);
        const pushSpeed = Math.max(460, 740 - Math.min(280, dist));
        p.kbVx = Math.cos(pushAng) * pushSpeed;
        p.kbVy = Math.sin(pushAng) * pushSpeed * PERSPECTIVE_TILT;
        p.attackStepVx = 0;
        p.attackStepVy = 0;
        p.speed = 0;
        p.vx = 0;
        p.vy = 0;
        p.facingAngle = pushAng + Math.PI; // Face back toward Vaelgor as they get blown away!
        p.state = 'hit_knockback';
        p.stateDuration = 0.72;
        p.stateTimer = 0.72;
        if (window.fx) {
          window.fx.addStepDust(p.x, p.y, 8);
        }
      }
    }
    this.swordAbsorbRoarDone = true;

    audio.playParryClang(true);
    audio.playEclipseBell();
    audio.playImpactBoom(2.1);
    audio.playBossVoiceClip('ascension', 1.0, true);
    if (window.game && window.game.camera && typeof window.game.camera.startCinematicCutscene === 'function') {
      window.game.camera.startCinematicCutscene(
        this.x,
        this.y - 68,
        7.4,
        1.28,
        'ASCENSION: ECLIPSE SOVEREIGN',
        'REPULSION ROAR • ECLIPSE DEVOURING GREATSWORD • TRANSCENDENT BODY',
        '"Back, insects! My blade devours the Eclipse — and my flesh ascends beyond mortality!"'
      );
    }
    if (window.fx) {
      window.fx.triggerHitstop(95);
      window.fx.triggerShake(30, 1.05);
      window.fx.triggerScreenFlash('#f43f5e', 0.42);
      window.fx.addShockwave(this.x, this.y, 480, '#f43f5e', 11);
      window.fx.addShockwave(this.x, this.y, 350, '#c084fc', 8);
      window.fx.addShockwave(this.x, this.y, 220, '#fde047', 6);
      window.fx.addFloatingText(this.x, this.y - 235, 'STAGGER BROKEN — REPULSION ROAR!', '#fda4af', 22);
    }

    if (!fromNetwork && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_sword_absorb'
      });
    }
  }

  completeFinalPhaseTransition() {
    this.finalTransitionActive = false;
    this.finalPhase = true;
    this.swordEmpowered = true;
    this.eclipseBodyTransformProg = 1.0;
    this.finalMechPhase = 'none';
    const postTransitionFrac = this.practiceFinalPhaseMode ? 0.151 : 0.50;
    this.hp = Math.round(this.maxHp * postTransitionFrac);
    this.state = 'idle';
    this.aiCooldown = 1.1;

    audio.playImpactBoom(2.0);
    audio.playSwordSlash(true);
    if (window.fx) {
      window.fx.triggerShake(24, 0.65);
      window.fx.triggerScreenFlash('#c084fc', 0.38);
      window.fx.addShockwave(this.x, this.y, 460, '#c084fc', 9);
      window.fx.addShockwave(this.x, this.y, 320, '#fde047', 7);
      if (this.practiceFinalPhaseMode) {
        window.fx.addFloatingText(this.x, this.y - 230, 'FINAL PHASE AWAKENED (15.1% HP) — STRIKE ONCE FOR FINAL CLASH [G]!', '#38bdf8', 20);
      } else {
        window.fx.addFloatingText(this.x, this.y - 230, 'FINAL PHASE — ECLIPSE SOVEREIGN (50% HP)', '#f43f5e', 22);
      }
    }
  }

  // =========================================================================
  // <= 15% HP FINAL PHASE CLIMAX MECHANIC: "ECLIPSE SOVEREIGN CLASH"
  // 1. Vaelgor teleports behind a target player, leaving a dark shadow trail
  //    from his previous location to his new position behind that player.
  // 2. He lifts his Greatsword high overhead for 3.0s (NO indicator on the boss!),
  //    while a small blue circle appears on the floor in front of where he is about
  //    to strike. Standing in that blue circle and pressing [G] initiates the Clash!
  // 3. Only the clashing player enters the cinematic Rhythm-Game QTE (6-7s), while
  //    all other players keep their normal camera and can freely wail on Vaelgor
  //    (with Vaelgor's Stagger Bar locked & capped at 99% during the Clash!).
  // 4. If a QTE beat is failed or nobody catches the 3.0s slam, Vaelgor completes
  //    the slam and wipes everyone with a dark shockwave.
  // =========================================================================
  triggerMechanicFinalClash(target = null, forcedData = null) {
    const isClient = window.game && window.game.net && window.game.net.isClient();
    if (isClient && !forcedData) return;

    this.finalClash15Triggered = true;
    this.finalClashPending = false;
    this.clashLockRequested = false;
    this.state = 'final_clash_mechanic';
    this.clashPhase = 'windup_circle';
    this.clashMaxTimer = 3.0;
    this.clashTimer = 3.0;
    this.clashPlayerId = null;
    this.clashBeatStep = 0;
    this.counterableWindow = false; // Explicitly NO indicator on the boss!
    this.jumpZ = 0;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;

    const oldX = forcedData && forcedData.startX !== undefined ? forcedData.startX : this.x;
    const oldY = forcedData && forcedData.startY !== undefined ? forcedData.startY : this.y;

    if (forcedData) {
      this.x = forcedData.endX;
      this.y = forcedData.endY;
      this.facingAngle = forcedData.facingAngle;
      this.baseFacing = this.facingAngle;
      this.clashCircleX = forcedData.circleX;
      this.clashCircleY = forcedData.circleY;
    } else {
      const allParty = (window.game && window.game.party) ? window.game.party : [];
      const livingParty = allParty.filter(p => p && p.hp > 0);
      // Prefer targeting a real human player (or local player) so they clearly feel Vaelgor teleport behind them!
      const humanLiving = livingParty.filter(p => !p.isBot);
      const tgt = (target && target.hp > 0 && !target.isBot)
        ? target
        : (humanLiving[0] || target || livingParty[0] || null);

      if (tgt) {
        const pAng = tgt.facingAngle !== undefined ? tgt.facingAngle : -Math.PI * 0.5;
        const behindAng = pAng + Math.PI;
        const tpDist = 82;
        let newX = tgt.x + Math.cos(behindAng) * tpDist;
        let newY = tgt.y + Math.sin(behindAng) * tpDist * PERSPECTIVE_TILT;

        // Keep Vaelgor + his front Clash circle comfortably inside the Raid Arena perimeter (centered at 0, 0)
        const arenaCx = Number.isFinite(this.spawnX) ? this.spawnX : 0;
        const arenaCy = 0;
        const maxR = 390;
        const dxC = newX - arenaCx;
        const dyC = (newY - arenaCy) / PERSPECTIVE_TILT;
        const distC = Math.hypot(dxC, dyC);
        if (distC > maxR) {
          const clampAng = Math.atan2(dyC, dxC);
          newX = arenaCx + Math.cos(clampAng) * maxR;
          newY = arenaCy + Math.sin(clampAng) * maxR * PERSPECTIVE_TILT;
        }

        this.x = newX;
        this.y = newY;
        this.facingAngle = Math.atan2((tgt.y - this.y) / PERSPECTIVE_TILT, tgt.x - this.x);
        this.baseFacing = this.facingAngle;
      }

      const strikeDist = 76;
      this.clashCircleX = this.x + Math.cos(this.facingAngle) * strikeDist;
      this.clashCircleY = this.y + Math.sin(this.facingAngle) * strikeDist * PERSPECTIVE_TILT;
    }

    this.targetX = this.x;
    this.targetY = this.y;
    this.clashCircleRadius = 50;
    this.snapFeetToBody();
    this.resetClothChains();

    // Persistent Dark Teleport Trail leading Vaelgor from his old position to behind the player!
    this.clashDarkTrail = {
      startX: oldX,
      startY: oldY,
      endX: this.x,
      endY: this.y,
      timer: 2.25,
      maxTimer: 2.25
    };

    audio.playDashWhoosh();
    audio.playEclipseBell();
    if (window.fx) {
      window.fx.triggerShake(14, 0.35);
      // Spawn dark shadow particles along the teleport path
      for (let i = 0; i <= 10; i++) {
        const f = i / 10;
        const tx = oldX + (this.x - oldX) * f;
        const ty = oldY + (this.y - oldY) * f;
        window.fx.addDragSparks(tx, ty - 28, Math.atan2(this.y - oldY, this.x - oldX) + Math.PI, 2, true, i % 2 === 0 ? '#581c87' : '#a855f7');
      }
      window.fx.addShockwave(oldX, oldY, 130, '#3b0764', 5);
      window.fx.addShockwave(this.x, this.y, 155, '#581c87', 5.5);
    }

    if (!forcedData && window.game && window.game.net && window.game.net.isHost) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_clash_start',
        startX: Math.round(oldX),
        startY: Math.round(oldY),
        endX: Math.round(this.x),
        endY: Math.round(this.y),
        facingAngle: Number(this.facingAngle.toFixed(3)),
        circleX: Math.round(this.clashCircleX),
        circleY: Math.round(this.clashCircleY)
      });
    }
  }

  canPlayerInitiateClash(player) {
    if (!player || player.hp <= 0) return false;
    if (this.state !== 'final_clash_mechanic' || this.clashPhase !== 'windup_circle') return false;
    const dx = player.x - this.clashCircleX;
    const dy = (player.y - this.clashCircleY) / PERSPECTIVE_TILT;
    return Math.hypot(dx, dy) <= (this.clashCircleRadius + 16);
  }

  initiateFinalClash(player, fromNetwork = false) {
    if (!player || player.hp <= 0) return false;
    if (this.state !== 'final_clash_mechanic') return false;
    const net = window.game && window.game.net;
    const isHostOrSolo = !net || net.isHost;

    // Guests only ask; the host grants the lock to the first valid request and broadcasts it,
    // so two players can never both end up in clash_lock.
    if (!isHostOrSolo && !fromNetwork) {
      if (this.clashPhase !== 'windup_circle' || this.clashLockRequested) return false;
      this.clashLockRequested = true;
      net.broadcast({ type: 'boss_event', event: 'final_clash_request', playerId: player.id });
      return true;
    }
    if (isHostOrSolo && this.clashPhase !== 'windup_circle') return false;
    if (!isHostOrSolo) {
      // Host-granted lock always wins on guests; release anyone this guest had locked locally.
      if (this.clashPhase === 'active_clash' && this.clashPlayerId === player.id) return false;
      const prev = this.clashPlayerId && (window.game.party || []).find(p => p.id === this.clashPlayerId);
      if (prev && prev !== player) {
        if (prev.state === 'clash_lock') prev.state = 'idle';
        if (typeof prev.clearClashRhythmQte === 'function') prev.clearClashRhythmQte();
      }
    }

    this.clashPhase = 'active_clash';
    // Safety net only (the QTE itself ends the clash): opening swing + all beats at full length + generous slack.
    this.clashMaxTimer = CLASH_INTRO_DUR + 7.2 + 3.5;
    this.clashTimer = this.clashMaxTimer;
    this.clashIntroT = CLASH_INTRO_DUR;
    this.clashIntroImpacted = false;
    this._clashPose = null;
    this.clashPlayerId = player.id;
    this.clashBeatStep = 0;
    this.clashStepIndex = 0;
    this.clashAttemptIndex = 0;
    this.clashSubHitIndex = 0;
    this.clashCurrentStyle = 'overhead_crush';
    this.clashSubProgress = 0;
    this.clashParryJolt = 0;
    this.counterableWindow = false;

    // Position the clashing player squarely inside the blue strike circle facing Vaelgor's descending Greatsword!
    player.x = this.clashCircleX;
    player.y = this.clashCircleY;
    player.targetX = this.clashCircleX;
    player.targetY = this.clashCircleY;
    player.vx = 0;
    player.vy = 0;
    player.speed = 0;
    player.kbVx = 0;
    player.kbVy = 0;
    player.attackStepVx = 0;
    player.attackStepVy = 0;
    player.jumpZ = 0;
    player.facingAngle = Math.atan2((this.y - player.y) / PERSPECTIVE_TILT, this.x - player.x);
    player.state = 'clash_lock';
    player.stateDuration = this.clashMaxTimer + 0.1;
    player.stateTimer = this.clashMaxTimer + 0.1;
    if (typeof player.snapFeetToBody === 'function') player.snapFeetToBody();

    // Any class can clash (clash_qte.js); rescue a class that never opted in so the QTE can never be silently skipped.
    if (typeof ensureClashCapable === 'function') ensureClashCapable(player);

    // Start the [W]/[E] rhythm QTE ONLY on the clashing player (or AI bot); it idles until the opening swing ends.
    if ((player.isLocal || player.isBot) && typeof player.startClashRhythmQte === 'function') {
      player.startClashRhythmQte(this, 6.8);
    }

    // Lock-in: a short, quiet beat before the opening swing. The big impact lands at CLASH_INTRO_IMPACT_P (see update).
    audio.playParryClang(true);
    audio.playSwordSlash(true, 0.5);
    if (window.fx) {
      window.fx.triggerShake(8, 0.3);
      if (player.isLocal) {
        window.fx.triggerScreenFlash('#38bdf8', 0.16);
      }
      const midX = (this.x + player.x) * 0.5;
      const midY = (this.y + player.y) * 0.5;
      window.fx.addShockwave(midX, midY, 150, '#38bdf8', 5);
      window.fx.addFloatingText(midX, midY - 145, `⚔️ CLASH LOCKED — ${player.name || 'VANGUARD'} HOLDS THE BLADE!`, '#38bdf8', 18);
    }

    // Host -> everyone, including the guest whose request this was.
    if (isHostOrSolo && net) {
      net.broadcast({
        type: 'boss_event',
        event: 'final_clash_lock',
        playerId: player.id
      });
    }
    return true;
  }

  onClashBeatProgress(
    player,
    beatIdx,
    fromNetwork = false,
    attemptIdx = 0,
    subIdx = 0,
    completedStyle = 'overhead_crush',
    nextStyle = 'overhead_crush'
  ) {
    if (this.state !== 'final_clash_mechanic' || this.clashPhase !== 'active_clash') return;
    this.clashBeatStep = beatIdx;
    this.clashStepIndex = beatIdx;
    this.clashAttemptIndex = attemptIdx;
    this.clashSubHitIndex = subIdx;
    this.clashCurrentStyle = nextStyle || completedStyle || 'overhead_crush';
    this.clashSubProgress = 0;
    this.clashParryJolt = 0.26;
    if (player && !player.isLocal) {
      player.clashCurrentStyle = this.clashCurrentStyle;
      player.clashLastParryFlash = 0.28;
    }

    audio.playParryClang(true);
    audio.playImpactBoom(1.25 + beatIdx * 0.12);
    // The blade rebounds upward for the next swing: low whoosh (the sound of a huge sword being hoisted).
    audio.playSwordSlash(true, 0.55);
    if (player && player.isLocal && window.game && window.game.camera) {
      window.game.camera.triggerZoomPunch(completedStyle === 'extinction_drive' ? 0.12 : 0.075);
    }
    if (window.fx) {
      const midX = (this.x + this.clashCircleX) * 0.5;
      const midY = (this.y + this.clashCircleY) * 0.5;
      window.fx.triggerShake(13 + beatIdx * 2, 0.22);
      const isLeftCleave = completedStyle === 'slash_left';
      const isRightCleave = completedStyle === 'slash_right';
      const isHeavyUpper = completedStyle === 'follow_down' || completedStyle === 'extinction_drive';
      const mainColor = isHeavyUpper ? '#fde047' : (beatIdx % 2 === 0 ? '#38bdf8' : '#fde047');

      window.fx.addShockwave(midX, midY, 160 + beatIdx * 20, mainColor, 5.8);
      window.fx.addImpactStarburst(midX, midY - 38, 118 + beatIdx * 12, mainColor, 9, beatIdx * 0.55, 0.26);
      if (typeof window.fx.addSlashRibbon === 'function') {
        const arcCenter = this.facingAngle + (isLeftCleave ? 0.45 : (isRightCleave ? -0.45 : 0));
        window.fx.addSlashRibbon(
          midX,
          midY - 36,
          92 + beatIdx * 8,
          arcCenter - 1.05,
          arcCenter + 1.05,
          mainColor,
          '#ffffff',
          26,
          0.22
        );
      }
      window.fx.addDragSparks(midX, midY - 38, this.facingAngle + Math.PI * 0.5, 13, true, '#38bdf8');
      window.fx.addDragSparks(midX, midY - 38, this.facingAngle - Math.PI * 0.5, 13, true, '#fde047');
    }

    if (!fromNetwork && window.game && window.game.net) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_clash_beat',
        playerId: player ? player.id : this.clashPlayerId,
        beatIdx,
        attemptIdx,
        subIdx,
        completedStyle,
        nextStyle: this.clashCurrentStyle
      });
    }
  }

  completeFinalClashSuccess(fromNetwork = false) {
    if (this.state !== 'final_clash_mechanic') return;

    const allParty = (window.game && window.game.party) ? window.game.party : [];
    const clasher = allParty.find(p => p && p.id === this.clashPlayerId) || null;
    if (clasher) {
      if (typeof clasher.clearClashRhythmQte === 'function') clasher.clearClashRhythmQte();
      clasher.state = 'idle';
      clasher.stateTimer = 0;
      clasher.jumpZ = 0;
      if (typeof clasher.snapFeetToBody === 'function') clasher.snapFeetToBody();
    }

    this.clashPhase = 'none';
    this.clashPlayerId = null;

    // Deal massive Clash Repulsion damage (leaving Vaelgor at >= 2% HP if still high, and priming his Stagger Bar to 99%!)
    const clashBurstDmg = Math.round(this.maxHp * 0.06);
    const minSurviveHp = Math.max(1, Math.ceil(this.maxHp * 0.01));
    this.hp = Math.max(minSurviveHp, this.hp - clashBurstDmg);
    this.stagger = Math.max(this.stagger, Math.floor(this.maxStagger * 0.99));

    // Knock Vaelgor back slightly and put him into a brief 2.8s Clash-Repelled vulnerability window (with Stagger at 99% so the next hit breaks it!)
    const recoilAng = this.facingAngle + Math.PI;
    this.recoilVx += Math.cos(recoilAng) * 320;
    this.recoilVy += Math.sin(recoilAng) * 320;
    // Clash won: Vaelgor is staggered down for exactly 3 seconds.
    this.state = 'staggered';
    this.stateDuration = 3.0;
    this.stateTimer = 3.0;
    this.counterableWindow = false;
    this.jumpZ = 0;
    this.clashIntroT = 0;
    this._clashPose = null;
    this.snapFeetToBody();

    audio.playParryClang(true);
    audio.playCounterSuccessBoom();
    audio.playImpactBoom(2.35);
    audio.playBossVoiceClip('countered_01');
    if (window.fx) {
      window.fx.triggerHitstop(115);
      window.fx.triggerShake(32, 0.85);
      window.fx.triggerScreenFlash('#fde047', 0.42);
      window.fx.addPillar(this.x, this.y, 110, '#38bdf8', 1.25);
      window.fx.addShockwave(this.x, this.y, 520, '#38bdf8', 11);
      window.fx.addShockwave(this.x, this.y, 380, '#fde047', 8);
      window.fx.addDimensionalSlash(this.x - 135, this.y - 75, this.x + 135, this.y + 75, '#fde047', 0.95);
      window.fx.addDimensionalSlash(this.x + 135, this.y - 75, this.x - 135, this.y + 75, '#38bdf8', 0.95);
      window.fx.addFloatingText(this.x, this.y - 210, '⚔️ CLASH WON — STAGGERED!', '#fde047', 20);
    }

    if (!fromNetwork && window.game && window.game.net) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_clash_success'
      });
    }
  }

  executeFinalClashWipe(fromNetwork = false) {
    if (this.state !== 'final_clash_mechanic' || this.clashPhase === 'fail_wipe') return;

    // Staged fail: Vaelgor hoists the sword and the light drains (CLASH_WIPE_SLAM_T), he slams it down, and a dark
    // shockwave ring races out from the impact killing everyone it passes (see updateClashWipe).
    this.clashPhase = 'fail_wipe';
    this.clashMaxTimer = 2.2;
    this.clashTimer = 2.2;
    this.clashWipeElapsed = 0;
    this.clashWipeSlammed = false;
    this.clashWipeHit = new Set();
    this.clashIntroT = 0;
    this._clashPose = null;
    this.counterableWindow = false;

    const allParty = (window.game && window.game.party) ? window.game.party : [];
    for (const p of allParty) {
      if (!p) continue;
      if (typeof p.clearClashRhythmQte === 'function') p.clearClashRhythmQte();
    }
    this.clashPlayerId = null;

    audio.playEclipseBell();
    audio.playSwordSlash(true, 0.45);
    audio.playBossVoiceClip('wipe_cast', 1.0, true);
    if (window.fx) {
      window.fx.triggerShake(10, CLASH_WIPE_SLAM_T);
      window.fx.addFloatingText(this.x, this.y - 225, '💀 CLASH FAILED — ABYSSAL SHOCKWAVE!', '#f43f5e', 23);
    }

    if (!fromNetwork && window.game && window.game.net) {
      window.game.net.broadcast({
        type: 'boss_event',
        event: 'final_clash_wipe'
      });
    }
  }

  // The one huge opening swing connects: hitstop, flash, ground-cracking shockwaves and a camera punch.
  onClashIntroImpact() {
    audio.playImpactBoom(2.2);
    audio.playParryClang(true);
    audio.playCounterSuccessBoom();
    audio.playSwordSlash(true, 0.7);
    const clasher = ((window.game && window.game.party) || []).find(p => p && p.id === this.clashPlayerId);
    if (clasher && clasher.isLocal && window.game.camera) {
      window.game.camera.triggerZoomPunch(0.16);
    }
    if (window.fx) {
      const midX = (this.x + this.clashCircleX) * 0.5;
      const midY = (this.y + this.clashCircleY) * 0.5;
      window.fx.triggerHitstop(140);
      window.fx.triggerShake(30, 0.7);
      if (clasher && clasher.isLocal) window.fx.triggerScreenFlash('#e0f2fe', 0.5);
      window.fx.addShockwave(midX, midY, 340, '#38bdf8', 10);
      window.fx.addShockwave(midX, midY, 230, '#fde047', 7);
      window.fx.addImpactStarburst(midX, midY - 38, 170, '#ffffff', 12, 0, 0.4);
      window.fx.addDragSparks(midX, midY - 38, this.facingAngle + Math.PI * 0.5, 22, true, '#fde047');
      window.fx.addDragSparks(midX, midY - 38, this.facingAngle - Math.PI * 0.5, 22, true, '#38bdf8');
    }
  }

  getClashSlamPoint() {
    return {
      x: this.clashCircleX || (this.x + Math.cos(this.facingAngle) * 76),
      y: this.clashCircleY || (this.y + Math.sin(this.facingAngle) * 76 * PERSPECTIVE_TILT)
    };
  }

  // Radius (world px) of the dark shockwave ring, 0 until the slam lands.
  getClashWipeRadius() {
    if (!this.clashWipeSlammed) return 0;
    return Math.max(0, (this.clashWipeElapsed - CLASH_WIPE_SLAM_T) * 1250);
  }

  updateClashWipe(dt, party) {
    this.clashWipeElapsed += dt;
    const slam = this.getClashSlamPoint();

    // Wind-up: the arena darkens and motes of shadow are sucked up into the raised blade.
    if (!this.clashWipeSlammed && window.fx && Math.random() < 0.8) {
      const ang = Math.random() * Math.PI * 2;
      const d = 90 + Math.random() * 140;
      window.fx.addDragSparks(this.x + Math.cos(ang) * d, this.y + Math.sin(ang) * d * PERSPECTIVE_TILT - 20, ang + Math.PI, 2, true, Math.random() < 0.5 ? '#581c87' : '#a855f7');
    }

    if (!this.clashWipeSlammed && this.clashWipeElapsed >= CLASH_WIPE_SLAM_T) {
      this.clashWipeSlammed = true;
      audio.playImpactBoom(2.5);
      audio.playSwordSlash(true);
      if (window.fx) {
        window.fx.triggerHitstop(125);
        window.fx.triggerShake(40, 1.25);
        window.fx.triggerScreenFlash('#3b0764', 0.68);
        window.fx.addPillar(slam.x, slam.y, 155, '#581c87', 1.5);
        window.fx.addShockwave(slam.x, slam.y, 720, '#090b10', 16);
        window.fx.addShockwave(slam.x, slam.y, 620, '#7e22ce', 13);
        window.fx.addShockwave(slam.x, slam.y, 480, '#e11d48', 10);
        window.fx.spawnMassiveEarthChunks(slam.x, slam.y, 18, '#581c87');
      }
    }

    // The ring kills each player the instant it reaches them.
    if (this.clashWipeSlammed && party) {
      const ringR = this.getClashWipeRadius();
      for (const p of party) {
        if (!p || p.hp <= 0 || this.clashWipeHit.has(p.id)) continue;
        const dist = Math.hypot(p.x - slam.x, (p.y - slam.y) / PERSPECTIVE_TILT);
        if (dist <= ringR) {
          this.clashWipeHit.add(p.id);
          p.takeDamage(99999, 'Sovereign Clash Shockwave Wipe', {
            power: 'cataclysm',
            forceLethal: true,
            sourceX: slam.x,
            sourceY: slam.y,
            pushDist: 300
          });
        }
      }
    }
  }

  // =========================================================================
  // 4 NEW FINAL PHASE PATTERNS (UNLOCKED AFTER SWORD ABSORPTION AT 50% HP)
  // =========================================================================

  // NEW FINAL PATTERN 1: "ECLIPSE JUDGMENT CROSS" — Massive 8-Way Rotating Beam + Inner/Outer Inversion Ring
  triggerPatternFinalEclipseJudgment(target) {
    this.state = 'pattern_final_eclipse_judgment';
    this.stateDuration = 3.2;
    this.stateTimer = 3.2;
    this.patternSeed = Math.random();
    if (target) {
      this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
      this.baseFacing = this.facingAngle;
    }
    this.judgmentHit1 = false;
    this.judgmentHit2 = false;
    this.judgmentStartX = this.x;
    this.judgmentStartY = this.y;
    audio.playEclipseBell();
    audio.playBossVoiceClip('cataclysm', 1.0, false);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 240, '#c084fc', 6);
      window.fx.addFloatingText(this.x, this.y - 195, 'ECLIPSE JUDGMENT!', '#c084fc', 18);
    }
  }

  // NEW FINAL PATTERN 2: "ASTRAL TRINITY CLEAVE" — 3 Rapid Teleporting Wide 220-Degree Empowered Sword Sweeps + Waves
  triggerPatternFinalTrinitySlash(target) {
    this.state = 'pattern_final_trinity_slash';
    this.stateDuration = 3.3;
    this.stateTimer = 3.3;
    // COUNTER-ABLE: he coils up with the blue counter halo first. Counter ([D]) in that window and he is staggered instead of
    // vanishing and cutting three times; miss it and the whole combo follows.
    this.counterableWindow = true;
    audio.playCounterFlashCue();
    if (target) {
      this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
      this.baseFacing = this.facingAngle;
    }
    this.trinitySlash1 = false;
    this.trinitySlash2 = false;
    this.trinitySlash3 = false;
    this.trinityTeleport1 = false;
    this.trinityTeleport2 = false;
    audio.playScrapeSpark();
    audio.playBossVoiceClip('triple_combo', 1.0, false);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 180, '#f43f5e', 5);
    }
  }

  // NEW FINAL PATTERN 3: "OBLIVION SINGULARITY" — Giant Gravitational Black-Sun Pull + Safe Outer/Cardinal Pockets + Detonation
  triggerPatternFinalOblivionSingularity(target) {
    this.state = 'pattern_final_oblivion_singularity';
    this.stateDuration = 3.4;
    this.stateTimer = 3.4;
    if (target) {
      this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
      this.baseFacing = this.facingAngle;
    }
    this.oblivionDetonated = false;
    this.oblivionPulseTimer = 0;
    audio.playEclipseBell();
    audio.playImpactBoom(1.4);
    audio.playBossVoiceClip('gravity_well', 1.0, false);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 340, '#9333ea', 6);
    }
  }

  // NEW FINAL PATTERN 4: "CATACLYSM STARFALL" — Skyborne Empowered Blade Barrage Tracking Players + Final Center Dive
  triggerPatternFinalCataclysmRain(target) {
    this.state = 'pattern_final_cataclysm_rain';
    this.stateDuration = 3.5;
    this.stateTimer = 3.5;
    if (target) {
      this.facingAngle = Math.atan2((target.y - this.y) / PERSPECTIVE_TILT, target.x - this.x);
      this.baseFacing = this.facingAngle;
    }
    this.cataclysmVolleyCount = 0;
    this.cataclysmDiveDone = false;
    this.cataclysmSpots = [];
    audio.playDashWhoosh();
    audio.playBossVoiceClip('skyfall', 1.0, false);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 220, '#facc15', 5.5);
    }
  }

  // -------------------------------------------------------------------------
  // MAIN AI & KINEMATICS UPDATE LOOP
  // -------------------------------------------------------------------------
  update(dt, party, arenaCenter, arenaRadius) {
    if (this.coreUpdate) return this.coreUpdate(dt, party, arenaCenter, arenaRadius);
    if (this.hp <= 0) return;

    // Update Hit-Flash, Dual Pauldron Part-Break Flash, & Spring Recoil Physics
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.leftPauldronFlashTimer > 0) this.leftPauldronFlashTimer = Math.max(0, this.leftPauldronFlashTimer - dt);
    if (this.rightPauldronFlashTimer > 0) this.rightPauldronFlashTimer = Math.max(0, this.rightPauldronFlashTimer - dt);
    // Latency grace for guest counters arriving just after a pattern's window closed (see executeCounterStagger).
    this.counterGraceTimer = this.isCounterable() ? 0.25 : Math.max(0, (this.counterGraceTimer || 0) - dt);
    this.recoilVx += (-this.recoilX * 185 - this.recoilVx * 16) * dt;
    this.recoilVy += (-this.recoilY * 185 - this.recoilVy * 16) * dt;
    this.recoilX += this.recoilVx * dt;
    this.recoilY += this.recoilVy * dt;

    this.pelvisVelZ += (-this.pelvisBounceZ * 140 - this.pelvisVelZ * 14) * dt;
    this.pelvisBounceZ += this.pelvisVelZ * dt;
    this.pauldronVelZ += (-this.pauldronLagZ * 95 - this.pauldronVelZ * 10) * dt;
    this.pauldronLagZ += this.pauldronVelZ * dt;

    // Thaemine-Style Enrage / Berserk Countdown (Paused during cutscenes)
    const inCutscene = (
      this.state === 'intro_cutscene' ||
      (this.state === 'eclipse_mechanic' && this.eclipsePhase === 'cutscene') ||
      (this.state === 'final_phase_mechanic' && (this.finalMechPhase === 'arena_cutscene' || this.finalMechPhase === 'sword_absorb_cutscene'))
    );
    if (!inCutscene && !this.enraged) {
      // Guests only count down for the HUD (boss_sync corrects it); the 'enrage' event flips the state.
      const enrageAuthority = !window.game || !window.game.net || window.game.net.isHost;
      this.enrageTimer = Math.max(enrageAuthority ? 0 : 0.05, this.enrageTimer - dt);
      if (enrageAuthority && this.enrageTimer <= 0) this.applyEnrage(false);
    }

    this.decayThreat(dt);

    // Strong-Move Micro-Stutter: Freezes Vaelgor's animation & movement briefly when hit by heavy skills!
    if (this.hitStutterTimer > 0) {
      this.hitStutterTimer = Math.max(0, this.hitStutterTimer - dt);
      this.updateClothChains(dt * 0.25);
      return;
    }

    // Ultimate Lockdown: Holds Vaelgor in place for the full duration of [T] Omnislash!
    if (this.lockedByUltimateTimer > 0) {
      this.lockedByUltimateTimer = Math.max(0, this.lockedByUltimateTimer - dt);
      this.vx = 0;
      this.vy = 0;
      this.speed = 0;
      this.updateClothChains(dt);
      return;
    }

    this.breathePhase += dt * 2.2;

    const livingParty = (party || []).filter(p => p.hp > 0);
    const isHostOrSolo = !window.game || !window.game.net || window.game.net.isHost;

    // Periodically re-evaluate stalking target on Host/Solo so Vaelgor dynamically shifts aggro across players!
    if (isHostOrSolo && (this.state === 'idle' || this.state === 'walk')) {
      this.targetReevalTimer -= dt;
      if (this.targetReevalTimer <= 0 || !this.activeTargetId || !livingParty.some(p => p.id === this.activeTargetId)) {
        this.selectTargetForPattern(livingParty, 'aggro');
        this.targetReevalTimer = 3.2;
      }
    }

    const primaryTarget = this.resolveTargetById(livingParty, this.activeTargetId);

    // HARD: delayed echo rings left behind by the big slams
    if (this.hardEchoes && this.hardEchoes.length) {
      for (const e of this.hardEchoes) {
        e.t += dt;
        if (!e.fired && e.t >= e.delay) {
          e.fired = true;
          audio.playImpactBoom(1.3);
          if (window.fx) {
            window.fx.triggerShake(14, 0.3);
            window.fx.addShockwave(e.x, e.y, e.r, '#a855f7', 6);
          }
          this.damagePlayersInRadius(livingParty, e.x, e.y, e.r, e.dmg, 'Echoing Ring', 'cataclysm', 140);
        }
      }
      this.hardEchoes = this.hardEchoes.filter(e => !e.fired || e.t < e.delay + 0.35);
    }

    // 1A. Update 75% HP Blood-Moon Imprisonment Raid Mechanic (Cutscene -> Sword-Bait -> Shield Shatter -> Melee Stagger Check)
    if (this.state === 'eclipse_mechanic') {
      this.eclipseTimer -= dt;
      if (this.eclipsePhase === 'bait_swords' || this.eclipsePhase === 'stagger_check') this.updateEclipseSweep(dt, livingParty);
      if (this.eclipsePhase === 'cutscene') {
        const cutProg = 1.0 - (this.eclipseTimer / (this.eclipseMaxTimer || 4.45));
        if (window.fx && Math.random() < 0.65) {
          const ang = Math.random() * Math.PI * 2;
          const r = 35 + Math.random() * 95;
          window.fx.addDragSparks(
            this.x + Math.cos(ang) * r,
            this.y - 10 + Math.sin(ang) * r * PERSPECTIVE_TILT,
            -Math.PI * 0.5,
            1,
            true,
            Math.random() < 0.5 ? '#e11d48' : '#fda4af'
          );
        }
        // Trigger the crimson pillar burst at ~2.40s (cutProg >= 0.54), right as Vaelgor shouts "...and despair!"
        if (cutProg >= 0.54 && !this.eclipseCutsceneBurstDone) {
          this.eclipseCutsceneBurstDone = true;
          audio.playParryClang(true);
          audio.playImpactBoom(1.75);
          if (window.fx) {
            window.fx.triggerShake(26, 0.55);
            window.fx.triggerScreenFlash('#e11d48', 0.30);
            window.fx.addPillar(this.x, this.y, 78, '#e11d48', 1.1);
            window.fx.addShockwave(this.x, this.y, 320, '#f43f5e', 8);
            window.fx.addShockwave(this.x, this.y - 190, 180, '#fda4af', 6);
          }
        }
        if (this.eclipseTimer <= 0) {
          this.eclipsePhase = 'bait_swords';
          this.eclipseMaxTimer = this.eclipseTotalTime();
          this.eclipseTimer = this.eclipseMaxTimer;
          const initTgt = livingParty[0] || primaryTarget || (window.game ? window.game.localPlayer : null);
          this.eclipseSwordTargetId = initTgt ? initTgt.id : null;
          this.eclipseSwordX = initTgt ? initTgt.x : this.x;
          this.eclipseSwordY = initTgt ? initTgt.y : (this.y + 120);
          this.eclipseSwordState = 'tracking';
          this.eclipseSwordMaxTimer = 1.45;
          this.eclipseSwordTimer = this.eclipseSwordMaxTimer;
          if (isHostOrSolo) {
            this.startNextEclipseBaitSword(livingParty);
          }
        }
      } else if (this.eclipsePhase === 'bait_swords') {
        if (this.eclipseSwordState === 'tracking') {
          this.eclipseSwordTimer -= dt;
          const baitTgt = livingParty.find(p => p.id === this.eclipseSwordTargetId) || primaryTarget;
          if (baitTgt) {
            this.eclipseSwordX += (baitTgt.x - this.eclipseSwordX) * Math.min(1, dt * 14);
            this.eclipseSwordY += (baitTgt.y - this.eclipseSwordY) * Math.min(1, dt * 14);
          }
          if (isHostOrSolo && this.eclipseSwordTimer <= 0) {
            this.lockEclipseBaitSword(this.eclipseSwordX, this.eclipseSwordY, false);
          }
        } else if (this.eclipseSwordState === 'locked') {
          this.eclipseSwordTimer -= dt;
          if (this.eclipseSwordTimer <= 0) {
            this.onEclipseBaitSwordImpact(livingParty, !isHostOrSolo);
          }
        }

        // Lethal mechanic endings are host-decided (a guest's timer may still be running after the host already broke the check).
        if (isHostOrSolo && this.eclipseTimer <= 0) {
          this.executeEclipseCataclysmWipe(livingParty);
          this.broadcastBossEvent('eclipse_wipe');
        }
      } else if (this.eclipsePhase === 'stagger_check') {
        if (isHostOrSolo && this.eclipseTimer <= 0) {
          this.executeEclipseCataclysmWipe(livingParty);
          this.broadcastBossEvent('eclipse_wipe');
        }
      } else if (this.eclipsePhase === 'wipe') {
        if (!this.wipeStruck && 1 - this.eclipseTimer / (this.eclipseMaxTimer || 2.6) >= 0.62) this.strikeEclipseCataclysm();
        if (this.eclipseTimer <= 0) {
          this.eclipseActive = false;
          this.eclipsePhase = 'none';
          this.state = 'idle';
          if (isHostOrSolo) this.scheduleMechRetry('eclipse_mechanic');
        }
      }
    } else if (this.eclipsePhase === 'wipe') {
      // the same wipe used by another mechanic (a failed Horizon): it still has to land and end even though he is back in combat
      this.eclipseTimer -= dt;
      if (!this.wipeStruck && 1 - this.eclipseTimer / (this.eclipseMaxTimer || 2.6) >= 0.62) this.strikeEclipseCataclysm();
      if (this.eclipseTimer <= 0) { this.eclipseActive = false; this.eclipsePhase = 'none'; }
    }

    // a failed mechanic coming back: once he is free again, with a warning a few seconds before
    if (isHostOrSolo && this.mechRetry && !this.finalPhase && !this.finalTransitionPending) {
      const r = this.mechRetry;
      const prevT = r.t; r.t -= dt;
      if (prevT > 4 && r.t <= 4 && window.fx) window.fx.addFloatingText(this.x, this.y - 170, 'The eclipse gathers again…', '#f43f5e', 16);
      if (r.t <= 0 && (this.state === 'idle' || this.state === 'walk') && this.lockedByUltimateTimer <= 0 && this.eclipsePhase === 'none') {
        this.mechRetry = null;
        this.triggerPatternByName(r.name, null, false);
        return;
      }
    }
    if (this.finalClashRetryT > 0) this.finalClashRetryT = Math.max(0, this.finalClashRetryT - dt);

    // 1B. Update 55% HP Echoing Iaido Raid Mechanic (Center Teleport -> Gradual Fade Vanish -> Overhead Ambush Counter -> Grab Stagger)
    if (this.state === 'iaido_mechanic') {
      this.iaidoTimer -= dt;
      if (this.iaidoPhase === 'center_coil') {
        if (this.iaidoTimer <= 0) {
          // 1.75s coil + 2.35s vanish = 4.10s total so vaelgor_mech_iaido.mp3 (4.08s: "Your shadow belongs to the abyss.") finishes right before the first "Perish!" ambush!
          this.enterIaidoVanish(2.35);
        }
      } else if (this.iaidoPhase === 'vanished') {
        const vanishProg = 1.0 - (this.iaidoTimer / (this.iaidoMaxTimer || 1.05));
        if (vanishProg < 0.72 && window.fx && Math.random() < 0.45) {
          window.fx.addDragSparks(
            this.x + (Math.random() - 0.5) * 44,
            this.y - 20 - Math.random() * 65,
            -Math.PI * 0.5,
            1,
            true,
            Math.random() < 0.5 ? '#e11d48' : '#c084fc'
          );
        }
        if (isHostOrSolo && this.iaidoTimer <= 0) {
          this.startNextIaidoAmbush(livingParty);
        }
      } else if (this.iaidoPhase === 'ambush_counter') {
        if (isHostOrSolo && this.iaidoTimer <= 0) {
          this.enterIaidoGrabStagger(livingParty, this.iaidoTargetId, false);
        }
      } else if (this.iaidoPhase === 'grab_stagger') {
        if (this.iaidoGrabbedPlayerId && party) {
          const grabbedP = party.find(p => p.id === this.iaidoGrabbedPlayerId);
          if (grabbedP && grabbedP.hp > 0) {
            const pinX = this.x + Math.cos(this.facingAngle) * 64;
            const pinY = this.y + Math.sin(this.facingAngle) * 64 * PERSPECTIVE_TILT;
            grabbedP.x = pinX;
            grabbedP.y = pinY;
            grabbedP.targetX = pinX;
            grabbedP.targetY = pinY;
            grabbedP.kbVx = 0;
            grabbedP.kbVy = 0;
            grabbedP.state = 'grabbed';
            grabbedP.stateTimer = Math.max(0.1, this.iaidoTimer);
            grabbedP.jumpZ = 34;
          }
        }
        if (isHostOrSolo && this.iaidoTimer <= 0) {
          this.executeIaidoGrabExecution(livingParty);
          this.broadcastBossEvent('iaido_execute');
        }
      }
    }

    // 1C. Update 35% HP Constellation of the Eclipse Clock Raid Puzzle Mechanic (3 Memory Flashes -> 3 Obelisk Attunement Steps!)
    if (this.state === 'horizon_mechanic') {
      this.horizonTimer -= dt;
      if (this.horizonPhase === 'show_memory') {
        const p = Math.max(0, Math.min(1, 1.0 - (this.horizonTimer / (this.horizonMaxTimer || 1.50))));
        if (p >= 0.32 && !this.horizonSwingFxTriggered) {
          this.horizonSwingFxTriggered = true;
          const shiftType = this.horizonVisualShift(this.horizonSlashIndex);
          const slashCol = this.horizonIsFake(this.horizonSlashIndex) ? '#38bdf8' : '#f43f5e';   // blue = mirror step (Hard)
          const cosF = Math.cos(this.facingAngle);
          const sinF = Math.sin(this.facingAngle);
          if (shiftType === 'cw') {
            // Physical Tell 1: Wide Forehand Cleave sweeping +90° Clockwise!
            audio.playSwordSlash(true, 0.92);
            audio.playScrapeSpark();
            if (window.fx) {
              window.fx.triggerShake(8, 0.18);
              window.fx.addSlashRibbon(this.x, this.y - 36, 128, this.facingAngle - 0.55, this.facingAngle + 1.48, slashCol, 30, 0.46);
              const tipX = this.x + Math.cos(this.facingAngle + 0.85) * 112;
              const tipY = this.y + Math.sin(this.facingAngle + 0.85) * 112 * PERSPECTIVE_TILT;
              // addDragSparks shoots toward baseAngle + PI, so pass (facingAngle - PI*0.5) to throw sparks Clockwise (+PI*0.5)!
              window.fx.addDragSparks(tipX, tipY, this.facingAngle - Math.PI * 0.5, 14, true, slashCol === '#38bdf8' ? '#7dd3fc' : null);
            }
          } else if (shiftType === 'ccw') {
            // Physical Tell 2: Reverse Backhand Cleave whipping -90° Counter-Clockwise!
            audio.playSwordSlash(false, 1.14);
            audio.playScrapeSpark();
            if (window.fx) {
              window.fx.triggerShake(8, 0.18);
              window.fx.addSlashRibbon(this.x, this.y - 36, 128, this.facingAngle + 0.55, this.facingAngle - 1.48, slashCol, 30, 0.46);
              const tipX = this.x + Math.cos(this.facingAngle - 0.85) * 112;
              const tipY = this.y + Math.sin(this.facingAngle - 0.85) * 112 * PERSPECTIVE_TILT;
              // Throw sparks Counter-Clockwise (-PI*0.5)!
              window.fx.addDragSparks(tipX, tipY, this.facingAngle + Math.PI * 0.5, 14, true, slashCol === '#38bdf8' ? '#7dd3fc' : null);
            }
          } else {
            // Physical Tell 3: Two-Handed Overhead Ground Impale — stabs vertically into the stone and vents shock debris 180° behind his back!
            audio.playSwordPlant();
            audio.playImpactBoom(1.18);
            if (window.fx) {
              window.fx.triggerShake(13, 0.24);
              const impX = this.x + cosF * 44;
              const impY = this.y + sinF * 44 * PERSPECTIVE_TILT;
              window.fx.addImpactStarburst(impX, impY, '#f43f5e', 1.25, 0.28, 14);
              window.fx.spawnMassiveEarthChunks(impX, impY, 5, '#f43f5e');
              // Passing this.facingAngle throws the spark jet toward this.facingAngle + PI (180° behind Vaelgor)!
              window.fx.addDragSparks(this.x - cosF * 24, this.y - sinF * 24 * PERSPECTIVE_TILT, this.facingAngle, 16, true);
            }
          }
        }
        if (this.horizonTimer <= 0) {
          const nextIdx = this.horizonSlashIndex + 1;
          if (nextIdx < this.horizonSlashTotal) {
            if (isHostOrSolo) {
              this.startHorizonMemoryFlash(nextIdx, this.horizonSequence, false, this.horizonOrbitShifts);
            }
          } else {
            if (isHostOrSolo) {
              this.startHorizonSolveStep(0, false);
            }
          }
        }
      } else if (this.horizonPhase === 'lead') {
        if (this.horizonTimer <= 0 && isHostOrSolo && this.horizonLeadPending) {
          this.horizonLeadPending = false;
          this.startHorizonMemoryFlash(0, this.horizonSequence, false, this.horizonOrbitShifts, this.horizonFakes);
        }
      } else if (this.horizonPhase === 'solve_step') {
        // Active Sweeping Doomsday Clock Hand Hazard: sears players caught in the rotating beam outside of the Obelisk sanctuaries!
        const subProg = Math.max(0, Math.min(1, 1.0 - (this.horizonTimer / (this.horizonMaxTimer || 2.40))));
        const sweepAng = -Math.PI * 0.5 + subProg * Math.PI * 2;
        if (window.fx && Math.random() < 0.45) {
          const rSpk = 85 + Math.random() * 145;
          window.fx.addDragSparks(
            this.x + Math.cos(sweepAng) * rSpk,
            this.y + Math.sin(sweepAng) * rSpk * PERSPECTIVE_TILT,
            sweepAng + Math.PI * 0.5,
            1,
            true
          );
        }
        if (livingParty && this.horizonObelisks) {
          if (!this.horizonBeamHitMap) this.horizonBeamHitMap = {};
          for (const p of livingParty) {
            if (!p || p.hp <= 0 || p.isBot || this.horizonBeamHitMap[p.id]) continue;
            const dx = p.x - this.x;
            const dy = (p.y - this.y) / PERSPECTIVE_TILT;
            const dist = Math.hypot(dx, dy);
            if (dist >= 44 && dist <= 238) {
              const pAng = Math.atan2(dy, dx);
              let diff = pAng - sweepAng;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              if (Math.abs(diff) < 0.15) {
                const insideAnyObelisk = this.horizonObelisks.some(
                  ob => Math.hypot(p.x - ob.x, (p.y - ob.y) / PERSPECTIVE_TILT) <= 86
                );
                if (!insideAnyObelisk) {
                  this.horizonBeamHitMap[p.id] = true;
                  p.takeDamage(145, 'Doomsday Clock Hand Sweep', {
                    power: 'light',
                    sourceX: this.x,
                    sourceY: this.y,
                    pushDist: 65
                  });
                  if (window.fx) {
                    window.fx.addImpactStarburst(p.x, p.y, '#f43f5e', 0.95, 0.22, 28);
                  }
                }
              }
            }
          }
        }
        if (isHostOrSolo && this.horizonTimer <= 0) {
          this.resolveHorizonPuzzleStep(livingParty);
        }
      }
    }

    // 1D. Update 10% HP Final Phase Transition Mechanic (Dark Buildup -> Blinding Whiteout -> Eerie Arena Reveal -> 3-Player 0.75s Counter Chain -> Center Roar & 5-Key QWER QTE + Spirit Bomb Stagger -> Sword Absorption -> 50% HP Final Phase!)
    if (this.state === 'final_phase_mechanic') {
      this.finalMechTimer -= dt;
      if (this.finalMechPhase === 'arena_cutscene') {
        const cutProg = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 3.8))));
        // Compute whiteout progression:
        // 0.00 -> 0.48: Dark Abyssal Cathedral, violent eclipse energy gathering & white radiance swelling (alpha 0 -> 1.0)
        // 0.48: Climax! Screen is 100% blinding white — flip finalPhaseArena = true and detonate shockwaves!
        // 0.48 -> 1.00: White screen fades smoothly out (1.0 -> 0.0) to reveal the eerie bright Pale Eclipse Sanctuary!
        if (cutProg < 0.22) {
          this.arenaWhiteoutAlpha = Math.pow(cutProg / 0.22, 2.0) * 0.28;
        } else if (cutProg < 0.48) {
          const t = (cutProg - 0.22) / 0.26;
          this.arenaWhiteoutAlpha = 0.28 + Math.pow(t, 1.6) * 0.72;
        } else {
          if (!this.arenaWhiteoutClimaxDone) {
            this.arenaWhiteoutClimaxDone = true;
            this.finalPhaseArena = true;
            audio.playEclipseBell();
            audio.playImpactBoom(2.1);
            if (window.fx) {
              window.fx.triggerHitstop(85);
              window.fx.triggerShake(28, 0.85);
              window.fx.addShockwave(this.x, this.y, 520, '#f8fafc', 12);
              window.fx.addShockwave(this.x, this.y, 360, '#c084fc', 8);
              window.fx.addPillar(this.x, this.y, 110, '#f8fafc', 1.35);
              window.fx.addFloatingText(this.x, this.y - 210, 'PALE ECLIPSE SANCTUARY', '#f8fafc', 22);
            }
          }
          const fadeOutT = Math.min(1, (cutProg - 0.48) / 0.46);
          this.arenaWhiteoutAlpha = Math.max(0, Math.pow(1.0 - fadeOutT, 1.5));
        }

        if (window.fx && Math.random() < 0.72) {
          const ang = Math.random() * Math.PI * 2;
          const r = 40 + Math.random() * 210;
          const inward = cutProg < 0.48;
          window.fx.addDragSparks(
            this.x + Math.cos(ang) * r,
            this.y + Math.sin(ang) * r * PERSPECTIVE_TILT,
            inward ? (ang + Math.PI) : -Math.PI * 0.5,
            1,
            true,
            Math.random() < 0.5 ? '#f8fafc' : '#c084fc'
          );
        }
        if (isHostOrSolo && this.finalMechTimer <= 0) {
          this.arenaWhiteoutAlpha = 0;
          this.finalPhaseArena = true;
          this.startFinalDashStep(0, livingParty);
        }
      } else if (this.finalMechPhase === 'dash_windup') {
        this.arenaWhiteoutAlpha = 0;
        const p = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 0.34))));
        const ease = 1 - Math.pow(1 - p, 3);
        const oldX = this.x, oldY = this.y;
        this.x = (this.finalDashStartX ?? this.x) + (this.targetX - (this.finalDashStartX ?? this.x)) * ease;
        this.y = (this.finalDashStartY ?? this.y) + (this.targetY - (this.finalDashStartY ?? this.y)) * ease;
        this.snapFeetToBody();
        if (window.fx && Math.hypot(this.x - oldX, this.y - oldY) > 6 && Math.random() < 0.65) {
          window.fx.addAfterimage(oldX, oldY, this.facingAngle, '#c084fc');
        }
        if (this.finalMechTimer <= 0) {
          this.openFinalDashCounterWindow();
        }
      } else if (this.finalMechPhase === 'dash_counter') {
        if (isHostOrSolo && this.finalMechTimer <= 0) {
          this.triggerFinalGrabWipe(livingParty, this.finalDashTargetId, false);
        }
      } else if (this.finalMechPhase === 'grab_wipe') {
        const p = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 1.45))));
        if (this.finalGrabbedPlayerId && party) {
          const grabbedP = party.find(pl => pl.id === this.finalGrabbedPlayerId);
          if (grabbedP && grabbedP.hp > 0) {
            const pinX = this.x + Math.cos(this.facingAngle) * 62;
            const pinY = this.y + Math.sin(this.facingAngle) * 62 * PERSPECTIVE_TILT;
            grabbedP.x = pinX;
            grabbedP.y = pinY;
            grabbedP.targetX = pinX;
            grabbedP.targetY = pinY;
            grabbedP.kbVx = 0;
            grabbedP.kbVy = 0;
            grabbedP.state = 'grabbed';
            grabbedP.stateTimer = Math.max(0.1, this.finalMechTimer);
            grabbedP.jumpZ = p < 0.62 ? (40 + Math.sin(p * Math.PI) * 28) : 0;
            if (window.fx && Math.random() < 0.7) {
              window.fx.addDragSparks(pinX + (Math.random() - 0.5) * 32, pinY - grabbedP.jumpZ - 20, -Math.PI * 0.5, 2, true, '#9333ea');
            }
          }
        }
        if (isHostOrSolo && p >= 0.62 && !this.finalGrabWipeExecuted) {
          this.executeFinalGrabWipeSlam(livingParty);
          this.broadcastBossEvent('final_grab_slam');
        }
        if (this.finalMechTimer <= 0) {
          if (this.practiceFinalPhaseMode && isHostOrSolo) {
            if (party) {
              for (const pl of party) {
                if (!pl) continue;
                pl.hp = pl.maxHp;
                pl.state = 'idle';
                pl.stateTimer = 0;
                pl.jumpZ = 0;
                if (typeof pl.clearEclipseQteAndRoot === 'function') pl.clearEclipseQteAndRoot();
                if (pl.cds) pl.cds.d = 0;
              }
            }
            if (window.fx) {
              window.fx.addFloatingText(this.x, this.y - 180, '🔄 FINAL PHASE PRACTICE: RESTARTING TRANSITION...', '#38bdf8', 18);
            }
            this.triggerMechanicFinalPhase(false);
            return;
          }
          // The counter chain failed. Anyone who survived the grab still has to face the rest of the transition: Vaelgor must NOT go
          // back to idle here, because the transition flag keeps him at 99% damage reduction and nothing would ever advance it.
          this.releaseFinalGrabbedPlayer();
          const stillStanding = (window.game && window.game.party ? window.game.party : (livingParty || [])).filter(pl => pl && pl.hp > 0);
          // Hard: the slam was lethal to everyone, so the raid is already over. Normal: the chain starts over until it is passed.
          if (isHostOrSolo && stillStanding.length > 0 && !this.isHardRaid()) {
            this.finalDashTargets = [];
            let lastId = null;
            for (let i = 0; i < 3; i++) {
              const pool = stillStanding.length > 1 ? stillStanding.filter(pl => pl.id !== lastId) : stillStanding;
              const pick = pool[Math.floor(Math.random() * pool.length)] || stillStanding[0];
              this.finalDashTargets.push(pick.id); lastId = pick.id;
            }
            if (window.fx) window.fx.addFloatingText(this.x, this.y - 170, 'AGAIN.', '#c084fc', 20);
            this.startFinalDashStep(0, stillStanding);
          } else if (isHostOrSolo && stillStanding.length > 0) {
            this.enterFinalRoarAndQte(stillStanding, false);
          } else if (isHostOrSolo) {
            this.finalMechPhase = 'none';
            this.state = 'idle';
          } else {
            this.finalMechTimer = 0.0001;   // guests wait for the host's final_roar_qte instead of going idle on their own
          }
        }
      } else if (this.finalMechPhase === 'roar_qte_spirit_bomb') {
        const p = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 14.0))));
        this.finalSpiritBombRadius = 46 + p * 94;

        // Charge-up beat is over: open the typing QTE for every living player
        if ((this.finalQteDelay || 0) > 0) {
          this.finalQteDelay -= dt;
          if (this.finalQteDelay <= 0) {
            this.finalQteDelay = 0;
            const qteParty = (window.game && window.game.party) ? window.game.party : (livingParty || []);
            for (const pl of qteParty) {
              if (pl && pl.hp > 0 && typeof pl.startEclipseQte === 'function') pl.startEclipseQte(5.0);
            }
            if (window.fx) {
              window.fx.triggerScreenFlash('#facc15', 0.2);
              window.fx.addShockwave(this.x, this.y, 300, '#facc15', 6);
              window.fx.addFloatingText(this.x, this.y - 220, 'ECLIPSE CONVERGENCE — TYPE [Q W E R] & STAGGER!', '#facc15', 20);
            }
          }
        }

        // Ambient dark/pale eclipse energy streaming into the high overhead Spirit Bomb sphere
        if (window.fx && Math.random() < 0.68) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 150 + Math.random() * 145;
          const ballCenterY = this.y - 285;
          const sx = this.x + Math.cos(ang) * dist;
          const sy = ballCenterY + Math.sin(ang) * dist * 0.65;
          const toBallAng = Math.atan2(ballCenterY - sy, this.x - sx);
          window.fx.addDragSparks(sx, sy, toBallAng + Math.PI, 1, false, Math.random() < 0.5 ? '#c084fc' : '#f43f5e');
        }

        // In pure 1v1 solo mode (party length === 1), passing the 5-key QTE empowers YOUR OWN Greatsword strikes with Astral Vanguard Echoes
        // (no passive auto-stagger while standing still — you must actively attack Vaelgor to break the Spirit Bomb stagger bar!)
        if (party && party.length === 1 && !(this.finalQteDelay > 0)) {
          const soloP = party[0];
          if (soloP && soloP.hp > 0 && !soloP.qteActive && !soloP.rooted) {
            if (!this.soloVanguardEchoesActive) {
              this.soloVanguardEchoesActive = true;
              if (window.fx) {
                window.fx.addShockwave(this.x - 125, this.y + 40, 95, '#38bdf8', 4);
                window.fx.addShockwave(this.x + 125, this.y + 40, 95, '#38bdf8', 4);
                window.fx.addFloatingText(this.x, this.y - 165, 'ASTRAL ECHOES EMPOWER YOUR STRIKES — ATTACK TO STAGGER!', '#38bdf8', 16);
              }
            }
          }
        }

        // If every living player failed the QTE and is rooted in chains (nobody left free to break them out or stagger Vaelgor), trigger the Spirit Bomb Wipe immediately!
        const allRootedAfterQte = (
          !(this.finalQteDelay > 0) &&
          (this.finalMechMaxTimer - this.finalMechTimer) > (this.finalQteDelayTotal || 0) + 5.04 &&
          livingParty.length > 0 &&
          livingParty.every(pl => pl.rooted && !pl.qteActive)
        );
        if (isHostOrSolo && this.finalSpiritBombStagger > 0 && (this.finalMechTimer <= 0 || allRootedAfterQte)) {
          this.triggerFinalSpiritBombWipe(livingParty, false);
        }
      } else if (this.finalMechPhase === 'spirit_bomb_wipe') {
        if (this.finalMechTimer <= 0) {
          if (this.practiceFinalPhaseMode && isHostOrSolo) {
            if (party) {
              for (const pl of party) {
                if (!pl) continue;
                pl.hp = pl.maxHp;
                pl.state = 'idle';
                pl.stateTimer = 0;
                pl.jumpZ = 0;
                if (typeof pl.clearEclipseQteAndRoot === 'function') pl.clearEclipseQteAndRoot();
                if (pl.cds) pl.cds.d = 0;
              }
            }
            if (window.fx) {
              window.fx.addFloatingText(this.x, this.y - 180, '🔄 FINAL PHASE PRACTICE: RESTARTING TRANSITION...', '#38bdf8', 18);
            }
            this.triggerMechanicFinalPhase(false);
            return;
          }
          // Normal difficulty: the wipe hurts instead of killing. The transition is still running (99% reduction until the Spirit
          // Bomb stagger breaks), so the survivors get another try instead of a boss that never advances.
          const alive = (window.game && window.game.party ? window.game.party : (livingParty || [])).filter(pl => pl && pl.hp > 0);
          if (isHostOrSolo && alive.length > 0) {
            for (const pl of alive) { if (typeof pl.clearEclipseQteAndRoot === 'function') pl.clearEclipseQteAndRoot(); }
            this.enterFinalRoarAndQte(alive, false);
          } else if (isHostOrSolo) {
            this.finalMechPhase = 'none';
            this.state = 'idle';
          } else {
            this.finalMechTimer = 0.0001;   // guests wait for the host's final_roar_qte
          }
        }
      } else if (this.finalMechPhase === 'sword_absorb_cutscene') {
        const p = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 4.6))));

        // Act 1 (0.00 - 0.24): Repulsion Roar blasts nearby players back
        if (p < 0.24) {
          this.finalSpiritBombRadius = 136;
          this.eclipseBodyTransformProg = 0;
          if (window.fx && Math.random() < 0.55) {
            const ang = Math.random() * Math.PI * 2;
            window.fx.addDragSparks(this.x + Math.cos(ang) * 45, this.y - 55 + Math.sin(ang) * 28, ang, 2, true, '#f43f5e');
          }
        }
        // Act 2 (0.24 - 0.82): Vaelgor sticks his Greatsword straight vertical overhead with both hands; the Eclipse enters the blade and transforms his body!
        else if (p < 0.82) {
          if (!this.swordAbsorbSkyThrustDone) {
            this.swordAbsorbSkyThrustDone = true;
            audio.playSwordPlant();
            audio.playEclipseBell();
            if (window.fx) {
              window.fx.triggerShake(18, 0.45);
              window.fx.addShockwave(this.x, this.y, 260, '#fde047', 6);
              window.fx.addPillar(this.x, this.y, 75, '#c084fc', 1.25);
              window.fx.addFloatingText(this.x, this.y - 255, 'ECLIPSE DEVOURING GREATSWORD!', '#fde047', 21);
            }
          }
          const absorbT = Math.max(0, Math.min(1, (p - 0.24) / 0.56));
          this.finalSpiritBombRadius = Math.max(0, 136 * Math.pow(1.0 - absorbT, 1.15));
          this.eclipseBodyTransformProg = absorbT;

          // Smoothly heal Vaelgor up to 50% HP as the Eclipse funnels down the blade into his body
          const healFrac = 0.10 + 0.40 * absorbT;
          this.hp = Math.max(this.hp, Math.round(this.maxHp * healFrac));

          // Mid-absorption body metamorphosis: his blade and armor ignite with Sovereign Eclipse power!
          if (absorbT >= 0.48 && !this.swordAbsorbAscendDone) {
            this.swordAbsorbAscendDone = true;
            this.swordEmpowered = true;
            this.finalPhase = true;
            audio.playImpactBoom(1.7);
            if (window.fx) {
              window.fx.triggerScreenFlash('#c084fc', 0.35);
              window.fx.addShockwave(this.x, this.y, 380, '#c084fc', 8);
              window.fx.addShockwave(this.x, this.y, 240, '#fde047', 6);
              window.fx.addFloatingText(this.x, this.y - 220, 'SOVEREIGN FLESH & ARMOR AWAKENED!', '#e879f9', 20);
            }
          }

          if (window.fx && Math.random() < 0.82) {
            const sx = this.x + (Math.random() - 0.5) * 76;
            const sy = this.y - 275 + absorbT * 95 + (Math.random() - 0.5) * 40;
            window.fx.addDragSparks(sx, sy, Math.PI * 0.5, 2, true, Math.random() < 0.5 ? '#fde047' : '#c084fc');
          }
        }
        // Act 3 (0.82 - 1.00): Sovereign Awakening Outburst Slash!
        else {
          this.finalSpiritBombRadius = 0;
          this.eclipseBodyTransformProg = 1.0;
          this.swordEmpowered = true;
          this.finalPhase = true;
          this.hp = Math.max(this.hp, Math.round(this.maxHp * 0.50));
        }

        if (this.finalMechTimer <= 0) {
          this.completeFinalPhaseTransition();
        }
      }
    }

    // Decay the dark teleport trail from the <= 15% HP Final Clash Mechanic
    if (this.clashDarkTrail) {
      this.clashDarkTrail.timer -= dt;
      if (this.clashDarkTrail.timer <= 0) {
        this.clashDarkTrail = null;
      }
    }

    // 1E. Update <= 15% HP Final Phase Clash Mechanic ("Eclipse Sovereign Clash")
    if (this.state === 'final_clash_mechanic') {
      this.clashTimer -= dt;
      if (this.clashPhase === 'windup_circle') {
        // 3.0s Two-Handed Overhead Sword Lift with Small Blue Circle in front (NO indicator on the boss!)
        if (window.fx && Math.random() < 0.55) {
          const ang = Math.random() * Math.PI * 2;
          window.fx.addDragSparks(
            this.clashCircleX + Math.cos(ang) * this.clashCircleRadius,
            this.clashCircleY + Math.sin(ang) * this.clashCircleRadius * PERSPECTIVE_TILT,
            ang + Math.PI,
            1,
            false,
            '#38bdf8'
          );
        }
        if (isHostOrSolo && this.clashTimer <= 0) {
          this.executeFinalClashWipe(false);
        }
      } else if (this.clashPhase === 'active_clash') {
        if (this.clashParryJolt > 0) {
          this.clashParryJolt = Math.max(0, this.clashParryJolt - dt);
        }
        // Opening haymaker: counts down on every client, and the swing connects at CLASH_INTRO_IMPACT_P.
        if (this.clashIntroT > 0) {
          this.clashIntroT = Math.max(0, this.clashIntroT - dt);
          const introP = 1 - this.clashIntroT / CLASH_INTRO_DUR;
          if (!this.clashIntroImpacted && introP >= CLASH_INTRO_IMPACT_P) {
            this.clashIntroImpacted = true;
            this.onClashIntroImpact();
          }
        }
        // Blades locked! Continuous clash sparks erupt between Vaelgor and the clashing player while allies free-DPS!
        const clasher = party ? party.find(p => p && p.id === this.clashPlayerId) : null;
        if (clasher && clasher.hp > 0) {
          if (!clasher.isLocal && !clasher.isBot && this.clashIntroT <= 0) {
            // Remote proxy: free-run the swing animation (it only gets beat resets from the network).
            this.clashSubProgress = Math.min(1, (this.clashSubProgress || 0) + dt * 0.85);
            if (clasher.clashLastParryFlash > 0) {
              clasher.clashLastParryFlash = Math.max(0, clasher.clashLastParryFlash - dt);
            }
          }
          clasher.x = this.clashCircleX;
          clasher.y = this.clashCircleY;
          clasher.targetX = this.clashCircleX;
          clasher.targetY = this.clashCircleY;
          clasher.facingAngle = Math.atan2((this.y - clasher.y) / PERSPECTIVE_TILT, this.x - clasher.x);
          clasher.state = 'clash_lock';
          clasher.stateTimer = Math.max(0.2, this.clashTimer);
          clasher.jumpZ = 0;
        } else if (isHostOrSolo) {
          this.executeFinalClashWipe(false);
          return;
        }
        if (window.fx && Math.random() < 0.85) {
          const midX = (this.x + this.clashCircleX) * 0.5 + (Math.random() - 0.5) * 18;
          const midY = (this.y + this.clashCircleY) * 0.5 - 38 + (Math.random() - 0.5) * 14;
          const sparkAng = Math.random() * Math.PI * 2;
          window.fx.addDragSparks(midX, midY, sparkAng, 2, true, Math.random() < 0.5 ? '#38bdf8' : (Math.random() < 0.5 ? '#fde047' : '#c084fc'));
        }
      } else if (this.clashPhase === 'fail_wipe') {
        this.updateClashWipe(dt, party);
        if (this.clashTimer <= 0) {
          if ((this.practiceFinalClashMode || this.practiceFinalPhaseMode) && isHostOrSolo) {
            if (party) {
              for (const pl of party) {
                if (!pl) continue;
                pl.hp = pl.maxHp;
                pl.state = 'idle';
                pl.stateTimer = 0;
                pl.jumpZ = 0;
                if (typeof pl.clearClashRhythmQte === 'function') pl.clearClashRhythmQte();
                if (pl.cds) pl.cds.d = 0;
              }
            }
            this.x = Number.isFinite(this.spawnX) ? this.spawnX : 0;
            this.y = Number.isFinite(this.spawnY) ? this.spawnY : -75;
            this.snapFeetToBody();
            this.resetClothChains();
            this.clashPhase = 'none';
            this.state = 'idle';
            this.finalClash15Triggered = false;
            this.finalClashPending = true;
            this.aiCooldown = 0.85;
            if (window.fx) {
              window.fx.addFloatingText(this.x, this.y - 165, '🔄 CLASH PRACTICE: RETRYING FINAL CLASH IN 0.8s...', '#38bdf8', 17);
            }
            return;
          }
          this.clashPhase = 'none';
          this.state = 'idle';
          // Normal: the Final Clash is the last check, so a failed one always comes back (12s later) and the 1% HP floor stays until
          // it is won. Hard: the failed clash's shockwave already wiped the party.
          if (!this.isHardRaid()) {
            this.finalClash15Triggered = false;
            this.finalClashPending = true;
            this.finalClashRetryT = 12;
          }
        }
      }
    }

    // Trigger pending <= 10% HP Final Phase Transition immediately once Vaelgor returns to idle/walk!
    if (isHostOrSolo && this.finalTransitionPending && !this.eclipse10Triggered && (this.state === 'idle' || this.state === 'walk')) {
      this.triggerMechanicFinalPhase(false);
      return;
    }

    // Trigger pending <= 15% HP Final Phase Clash Mechanic once Vaelgor is ready!
    if (
      isHostOrSolo &&
      this.finalPhase &&
      (this.finalClashPending || (this.hp / this.maxHp) <= 0.15) &&
      !this.finalClash15Triggered &&
      !(this.finalClashRetryT > 0) &&
      this.state !== 'staggered' &&
      this.state !== 'final_phase_mechanic' &&
      this.state !== 'final_clash_mechanic'
    ) {
      if (this.practiceFinalClashMode && this.aiCooldown > 0) {
        this.aiCooldown = Math.max(0, this.aiCooldown - dt);
      }
      if (!this.practiceFinalClashMode || this.aiCooldown <= 0) {
        this.triggerMechanicFinalClash(primaryTarget, null);
        return;
      }
    }

    // 2. Boss Autonomous Raid AI Decision Maker (Host-Authoritative in Co-op, Replicated to Peers via boss_pattern!)
    // Enforces 2-pattern non-repeat history via selectNonRepeatingPattern() and unlocks 4 new patterns in Final Phase!
    if ((this.state === 'idle' || this.state === 'walk') && primaryTarget) {
      if (isHostOrSolo) {
        this.targetX = primaryTarget.x;
        this.targetY = primaryTarget.y;
      }

      if (isHostOrSolo) {
        this.aiCooldown -= dt;
        const dist = Math.hypot(primaryTarget.x - this.x, (primaryTarget.y - this.y) / PERSPECTIVE_TILT);

        if (this.aiCooldown <= 0) {
          let candidates;
          if (this.finalPhase) {
            if (dist < 185) {
              candidates = [
                { name: 'pat_final_eclipse_judgment', weight: 18, mode: 'aggro' },
                { name: 'pat_final_trinity_slash', weight: 18, mode: 'aggro' },
                { name: 'pat_final_oblivion_singularity', weight: 16, mode: 'aggro' },
                { name: 'pat_final_cataclysm_rain', weight: 15, mode: 'hunter' },
                { name: 'pat_thaemine_pizza', weight: 8, mode: 'aggro' },
                { name: 'pat_world_cleaver', weight: 8, mode: 'aggro' },
                { name: 'pat_abyssal_vortex', weight: 7, mode: 'aggro' },
                { name: 'pat_eclipse_blender', weight: 7, mode: 'aggro' },
                { name: 'pat_phantom_step', weight: 6, mode: 'aggro' },
                { name: 'pat_cross_judgment', weight: 6, mode: 'aggro' },
                { name: 'pat_guillotine', weight: 5, mode: 'aggro' }
              ];
            } else {
              candidates = [
                { name: 'pat_final_cataclysm_rain', weight: 20, mode: 'hunter' },
                { name: 'pat_final_trinity_slash', weight: 18, mode: 'hunter' },
                { name: 'pat_final_eclipse_judgment', weight: 16, mode: 'aggro' },
                { name: 'pat_final_oblivion_singularity', weight: 16, mode: 'aggro' },
                { name: 'pat_world_cleaver', weight: 8, mode: 'hunter' },
                { name: 'pat_phantom_flurry', weight: 8, mode: 'hunter' },
                { name: 'pat_blood_rain', weight: 7, mode: 'hunter' },
                { name: 'pat_eclipse_blender', weight: 7, mode: 'hunter' }
              ];
            }
          } else if (dist < 175) {
            candidates = [
              { name: 'pat_phantom_step', weight: 14, mode: 'aggro' },
              { name: 'uppercut', weight: 6, mode: 'aggro' },
              { name: 'cleave', weight: 7, mode: 'aggro' },
              { name: 'thrust', weight: 7, mode: 'aggro' },
              { name: 'pat_thaemine_pizza', weight: 10, mode: 'aggro' },
              { name: 'pat_world_cleaver', weight: 10, mode: 'aggro' },
              { name: 'pat_abyssal_vortex', weight: 10, mode: 'aggro' },
              { name: 'pat_eclipse_blender', weight: 10, mode: 'aggro' },
              { name: 'pat_blood_rain', weight: 9, mode: 'aggro' },
              { name: 'pat_phantom_flurry', weight: 7, mode: 'hunter' },
              { name: 'pat_cross_judgment', weight: 5, mode: 'aggro' },
              { name: 'pat_guillotine', weight: 5, mode: 'aggro' }
            ];
          } else {
            candidates = [
              { name: 'pat_world_cleaver', weight: 16, mode: 'hunter' },
              { name: 'pat_phantom_flurry', weight: 16, mode: 'hunter' },
              { name: 'pat_blood_rain', weight: 14, mode: 'hunter' },
              { name: 'pat_eclipse_blender', weight: 14, mode: 'hunter' },
              { name: 'pat_damocles', weight: 12, mode: 'hunter' },
              { name: 'pat_dreadnought', weight: 12, mode: 'hunter' },
              { name: 'pat_guillotine', weight: 8, mode: 'hunter' },
              { name: 'pat_mirage', weight: 8, mode: 'hunter' }
            ];
          }

          const chosen = this.selectNonRepeatingPattern(candidates);
          if (chosen) {
            const tgt = this.selectTargetForPattern(livingParty, chosen.mode || 'aggro');
            this.triggerPatternByName(chosen.name, tgt, false);
          }
          // Breath between patterns (the boss stands idle for this long before choosing the next one). Kept well above
          // zero so players can re-position, heal and recover Space/parry between attack chains.
          const baseGap = (this.finalPhase || this.enraged)
            ? 0.55
            : (this.awakened ? (Math.random() < 0.45 ? 0.40 : 0.65) : 0.72);
          // never less than 1.5s between patterns on Hard, 1.8s on Normal / practice (this includes the final phase)
          const hardNow = !!(window.game && typeof window.game.isHard === 'function' && window.game.isHard());
          this.aiCooldown = Math.max(baseGap, hardNow ? 1.5 : 1.8);
        }
      }
    }

    // 3. Process Active Pattern & Attack Hitboxes against Raid Party
    if (this.state !== 'idle' && this.state !== 'walk' && this.state !== 'eclipse_mechanic' && this.state !== 'horizon_mechanic' && this.state !== 'iaido_mechanic' && this.state !== 'final_phase_mechanic' && this.state !== 'final_clash_mechanic') {
      const animRate = (this.state === 'intro_cutscene' || this.state === 'staggered' || this.state === 'rebuked')
        ? 1.0
        : (this.enraged ? 1.32 : (this.awakened ? 1.12 : 1.0));
      this.stateTimer -= dt * animRate;
      const elapsed = this.stateDuration - this.stateTimer;
      const prog = Math.max(0, Math.min(1, elapsed / this.stateDuration));

      if (this.state === 'intro_cutscene') {
        this.jumpZ = 0;
        if (prog < 0.68) {
          // Stage 1 (0.00 - 0.68): Heavy armored walk-in from the northern darkness
          const walkT = prog / 0.68;
          const smoothWalk = walkT * (2 - walkT * 0.35) / 1.65;
          const startY = this.introStartY !== undefined ? this.introStartY : (this.spawnY - 210);
          const prevY = this.y;
          this.x = this.spawnX;
          this.y = startY + (this.spawnY - startY) * Math.min(1, smoothWalk);
          this.vx = 0;
          this.vy = (this.y - prevY) / Math.max(0.001, dt);
          this.speed = Math.max(45, Math.min(95, Math.abs(this.vy)));
          this.moveAngle = Math.PI * 0.5;
          this.facingAngle = Math.PI * 0.5;

          // Pan the cinematic camera smoothly along with Vaelgor as he walks out of the darkness
          if (window.game && window.game.camera) {
            window.game.camera.cinematicTargetX = this.x;
            window.game.camera.cinematicTargetY = this.y - 34;
          }
        } else {
          // Stage 2 (0.68 - 1.00): Halt at the altar & wrench the greatsword up in a crimson burst!
          this.x = this.spawnX;
          this.y = this.spawnY;
          this.vx = 0;
          this.vy = 0;
          this.speed = 0;
          if (window.game && window.game.camera) {
            window.game.camera.cinematicTargetX = this.x;
            window.game.camera.cinematicTargetY = this.y - 38;
          }
          if (this.patStep === 0) {
            this.patStep = 1;
            this.snapFeetToBody();
            this.lungeFootForward(this.leftFoot, 14, -this.hipWidth - 2, 0.22);
            this.pelvisVelZ -= 28;
            this.pauldronVelZ -= 45;
            audio.playScrapeSpark();
            audio.playSwordSlash(true);
            audio.playImpactBoom(1.65);
            audio.playParryClang(true);
            if (window.fx) {
              window.fx.triggerShake(20, 0.42);
              window.fx.triggerZoomPunch(0.075);
              window.fx.addPillar(this.x, this.y, 58, '#e11d48', 0.85);
              window.fx.addShockwave(this.x, this.y, 260, '#e11d48', 7.0);
              window.fx.addShockwave(this.x, this.y - 25, 165, '#fda4af', 4.8);
              window.fx.addDragSparks(this.x, this.y + 18, Math.PI * 0.5, 26, true, '#fda4af');
            }
          }
        }
        if (this.stateTimer <= 0) {
          this.speed = 0;
          this.aiCooldown = 0.65;
        }
      } else if (this.state === 'pat_phantom_step') {
        // Evasive Cross-Step Slash: Darts 145px diagonally past/behind the player, then sweeps a 210° reaping slash!
        if (prog >= 0.16 && this.patStep === 0) {
          this.patStep = 1;
          const oldX = this.x, oldY = this.y;
          const sideSign = this.phantomStepSide || 1;
          const stepAng = this.baseFacing + sideSign * 0.52;
          this.x += Math.cos(stepAng) * 145;
          this.y += Math.sin(stepAng) * 145 * PERSPECTIVE_TILT;
          if (primaryTarget) {
            this.facingAngle = Math.atan2((primaryTarget.y - this.y) / PERSPECTIVE_TILT, primaryTarget.x - this.x);
          } else {
            this.facingAngle = this.baseFacing + Math.PI * 0.75 * sideSign;
          }
          this.snapFeetToBody();
          audio.playSwordSlash(false, 1.3);
          if (window.fx) {
            window.fx.addAfterimage(oldX, oldY, this.baseFacing, '#e11d48');
            window.fx.addAfterimage((oldX + this.x) * 0.5, (oldY + this.y) * 0.5, this.facingAngle, '#c084fc');
            window.fx.addSonicBoomRings(oldX, oldY, this.x, this.y, 3, '#e11d48');
          }
        }
        if (prog >= 0.52 && this.patStep === 1) {
          this.patStep = 2;
          // Aim stays where the cross-step left it (no re-aim on the strike frame) so a sidestep can dodge the cleave.
          audio.playSwordSlash(true);
          audio.playImpactBoom(1.1);
          if (window.fx) {
            window.fx.triggerShake(10, 0.20);
            window.fx.addShockwave(this.x, this.y, 145, '#f43f5e', 5);
          }
          this.damagePlayersInSector(livingParty, this.x, this.y, 0, 155, this.facingAngle, Math.PI * 0.58, 265, 'Abyssal Cross-Step Cleave', 'medium', 120);
        }
      } else if (this.state === 'uppercut') {
        if (prog < 0.42) {
          // Lateral weave during windup so stationary frontal attacks can whiff!
          const latAng = this.facingAngle + (this.uppercutWeaveSign || 1) * Math.PI * 0.5;
          this.x += Math.cos(latAng) * 65 * dt;
          this.y += Math.sin(latAng) * 65 * PERSPECTIVE_TILT * dt;
          this.snapFeetToBody();
        }
        if (prog >= 0.46 && this.uppercutSubPhase === 'windup') {
          this.uppercutSubPhase = 'slash';
          this.counterableWindow = false;
          // Aim was fixed when the move started (no re-aim on the strike frame), so the whole windup is a sidestep window.
          audio.playSwordSlash(true);
          audio.playImpactBoom(1.15);
          const cosA = Math.cos(this.facingAngle);
          const sinA = Math.sin(this.facingAngle);
          this.x += cosA * 52;
          this.y += sinA * 52 * PERSPECTIVE_TILT;
          this.snapFeetToBody();
          this.lungeFootForward(this.leftFoot, 16, -this.hipWidth - 2, 0.18);
          const fxX = this.x + cosA * 65;
          const fxY = this.y + sinA * 65 * PERSPECTIVE_TILT;
          if (window.fx) {
            window.fx.triggerShake(11, 0.25);
            window.fx.addFissureLine(this.x + cosA * 18, this.y + sinA * 18 * PERSPECTIVE_TILT, fxX + cosA * 55, fxY + sinA * 55 * PERSPECTIVE_TILT, '#e11d48');
            window.fx.addShockwave(fxX, fxY, 115, '#f43f5e', 4.5);
            window.fx.addDragSparks(fxX, fxY, this.facingAngle + Math.PI, 22, true);
            window.fx.addImpactStarburst(fxX, fxY - 18, 42, '#f43f5e', '#ffffff', 0.24, 6);
            window.fx.addLightningBolt(fxX, fxY - 68, fxX, fxY, '#fda4af', 2.4, 0.24);
          }
          this.damagePlayersInRadius(livingParty, fxX, fxY, 96, 295, 'Obsidian Uppercut', 'heavy', 155);
        }
      } else if (this.state === 'cleave') {
        if (prog >= 0.36 && this.cleaveSubPhase === 'coil') {
          this.cleaveSubPhase = 'slash1';
          // First cut uses the aim fixed at move start (no re-aim on the strike frame); the follow-up still re-aims.
          audio.playSwordSlash(true);
          const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
          this.x += cosA * 52;
          this.y += sinA * 52 * PERSPECTIVE_TILT;
          this.snapFeetToBody();
          const hx = this.x + cosA * 38, hy = this.y + sinA * 38 * PERSPECTIVE_TILT;
          if (window.fx) {
            window.fx.triggerShake(7, 0.16);
            window.fx.addShockwave(hx, hy, 125, '#f43f5e', 4.5);
            window.fx.addSlashRibbon(this.x, this.y, 122, this.facingAngle - 1.35, this.facingAngle + 1.35, '#e11d48', 22, 0.24);
            window.fx.addImpactStarburst(hx + cosA * 40, hy + sinA * 40 * PERSPECTIVE_TILT - 20, 32, '#f43f5e', '#ffffff', 0.18, 4);
          }
          this.damagePlayersInRadius(livingParty, hx, hy, 114, 255, 'Twin Eclipse Cleave', 'light', 68);
        } else if (prog >= 0.64 && this.cleaveSubPhase === 'slash1') {
          this.cleaveSubPhase = 'slash2';
          if (primaryTarget) {
            this.facingAngle = Math.atan2((primaryTarget.y - this.y) / PERSPECTIVE_TILT, primaryTarget.x - this.x);
          }
          audio.playSwordSlash(false);
          const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
          this.x += cosA * 56;
          this.y += sinA * 56 * PERSPECTIVE_TILT;
          this.snapFeetToBody();
          const hx = this.x + cosA * 42, hy = this.y + sinA * 42 * PERSPECTIVE_TILT;
          if (window.fx) {
            window.fx.triggerShake(9, 0.20);
            window.fx.addShockwave(hx, hy, 115, '#c084fc', 4.0);
            window.fx.addSlashRibbon(this.x, this.y, 122, this.facingAngle + 1.35, this.facingAngle - 1.35, '#c084fc', 22, 0.24);
            window.fx.addImpactStarburst(hx + cosA * 40, hy + sinA * 40 * PERSPECTIVE_TILT - 22, 36, '#c084fc', '#ffffff', 0.20, 6);
          }
          this.damagePlayersInRadius(livingParty, hx, hy, 106, 240, 'Twin Eclipse Cleave', 'medium', 115);
        } else if (this.awakened && prog >= 0.86 && this.cleaveSubPhase === 'slash2') {
          // Phase 2 Awakened Bonus Finisher: 360° Crimson Spin Wave!
          this.cleaveSubPhase = 'slash3';
          audio.playSwordSlash(true);
          audio.playImpactBoom(1.15);
          if (window.fx) {
            window.fx.triggerShake(12, 0.22);
            window.fx.addShockwave(this.x, this.y, 145, '#e11d48', 5);
            window.fx.addSlashRibbon(this.x, this.y, 136, this.facingAngle - Math.PI, this.facingAngle + Math.PI, '#e11d48', 26, 0.28);
            window.fx.spawnCrescentWave(this.x + Math.cos(this.facingAngle) * 35, this.y + Math.sin(this.facingAngle) * 35 * PERSPECTIVE_TILT, this.facingAngle, 210, 0, null, true);
          }
          this.damagePlayersInRadius(livingParty, this.x, this.y, 125, 265, 'Awakened Eclipse Finisher', 'heavy', 135);
        }
      } else if (this.state === 'thrust') {
        if (prog >= 0.12 && !this.thrustBackstepDone) {
          // Evasive Backstep Feint: Pulls 64px backward out of greedy melee attacks before rocketing forward!
          this.thrustBackstepDone = true;
          const oldX = this.x, oldY = this.y;
          const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
          this.x -= cosA * 64;
          this.y -= sinA * 64 * PERSPECTIVE_TILT;
          this.snapFeetToBody();
          if (window.fx) {
            window.fx.addAfterimage(oldX, oldY, this.facingAngle, '#38bdf8');
          }
        }
        if (prog >= 0.46 && this.thrustSubPhase === 'charge') {
          this.thrustSubPhase = 'lunge';
          this.counterableWindow = false;
          audio.playSwordSlash(true);
          const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
          const originX = this.x, originY = this.y;
          this.x += cosA * 135;
          this.y += sinA * 135 * PERSPECTIVE_TILT;
          this.snapFeetToBody();
          const tipX = this.x + cosA * 85, tipY = this.y + sinA * 85 * PERSPECTIVE_TILT;
          if (window.fx) {
            window.fx.triggerShake(9, 0.20);
            window.fx.addAfterimage(originX, originY, this.facingAngle, '#e11d48');
            window.fx.addFissureLine(originX, originY, tipX, tipY, '#e11d48');
            window.fx.addShockwave(tipX, tipY, 98, '#f43f5e', 4);
            window.fx.addLightningBolt(originX, originY - 24, tipX, tipY - 24, '#fda4af', 2.4, 0.24);
            window.fx.addImpactStarburst(tipX, tipY - 22, 38, '#f43f5e', '#ffffff', 0.22, 6);
          }
          this.damagePlayersInCorridor(livingParty, originX, originY, this.facingAngle, 215, 44, 280, 'Abyssal Lunge', 'medium', 125);
        }
      } else if (this.state === 'pat_guillotine') {
        if (prog >= 0.22 && this.patStep === 0) {
          this.patStep = 1;
          audio.playSwordSlash(true);
          const cosA = Math.cos(this.baseFacing), sinA = Math.sin(this.baseFacing);
          this.x += cosA * 24;
          this.y += sinA * 24 * PERSPECTIVE_TILT;
          this.snapFeetToBody();
          const hx = this.x + cosA * 55, hy = this.y + sinA * 55 * PERSPECTIVE_TILT;
          if (window.fx) {
            window.fx.addFissureLine(this.x, this.y, this.x + cosA * 105, this.y + sinA * 105 * PERSPECTIVE_TILT, '#f43f5e');
            window.fx.addShockwave(hx, hy, 95, '#fb923c', 4);
            window.fx.addImpactStarburst(hx, hy - 18, 36, '#fb923c', '#ffffff', 0.20, 6);
          }
          this.damagePlayersInRadius(livingParty, hx, hy, 92, 235, 'Guillotine Rip', 'light', 65);
        }
        if (prog >= 0.35 && prog < 0.56) {
          const spinProg = (prog - 0.35) / 0.21;
          this.facingAngle = this.baseFacing + spinProg * Math.PI * 2;
          this.snapFeetToBody();
          if (this.patStep === 1) {
            this.patStep = 2;
            audio.playSwordSlash(true);
            if (window.fx) {
              window.fx.addShockwave(this.x, this.y, 135, '#e11d48', 5);
              window.fx.addSlashRibbon(this.x, this.y, 132, this.baseFacing - Math.PI, this.baseFacing + Math.PI, '#e11d48', 26, 0.26);
            }
            this.damagePlayersInRadius(livingParty, this.x, this.y, 125, 265, 'Vortex Cleave', 'medium', 115);
          }
        }
        // Lock leap target at prog >= 0.50 right as the red ground circle telegraph appears so it never jumps mid-telegraph!
        if (prog >= 0.50 && !this.leapLocked) {
          this.leapLocked = true;
          this.leapStartX = this.x;
          this.leapStartY = this.y;
          if (isHostOrSolo && primaryTarget) {
            this.leapTargetX = primaryTarget.x;
            this.leapTargetY = primaryTarget.y;
            this.baseFacing = Math.atan2((this.leapTargetY - this.y) / PERSPECTIVE_TILT, this.leapTargetX - this.x);
          }
          if (isHostOrSolo && window.game && window.game.net && window.game.net.isHost) {
            window.game.net.broadcast({
              type: 'boss_event',
              event: 'guillotine_lock',
              startX: Math.round(this.leapStartX),
              startY: Math.round(this.leapStartY),
              targetX: Math.round(this.leapTargetX),
              targetY: Math.round(this.leapTargetY),
              baseFacing: Number(this.baseFacing.toFixed(3))
            });
          }
        }
        if (prog >= 0.56 && prog < 0.84) {
          this.facingAngle = this.baseFacing;
          if (this.patStep === 2) {
            this.patStep = 3;
          }
          const airT = (prog - 0.56) / 0.28;
          this.x = this.leapStartX + (this.leapTargetX - this.leapStartX) * airT;
          this.y = this.leapStartY + (this.leapTargetY - this.leapStartY) * airT;
          this.jumpZ = Math.sin(airT * Math.PI) * 92;
          this.syncAirborneFeet();
        }
        if (prog >= 0.84 && this.patStep === 3) {
          this.patStep = 4;
          this.jumpZ = 0;
          this.snapFeetToBody();
          audio.playImpactBoom(1.4);
          audio.playParryClang(false);
          if (window.fx) {
            window.fx.triggerShake(18, 0.4);
            window.fx.triggerImpactFrame('#e11d48', 0.08);
            window.fx.addPillar(this.x, this.y, 42, '#e11d48', 0.65);
            window.fx.addShockwave(this.x, this.y, 175, '#f43f5e', 6);
            window.fx.addImpactStarburst(this.x, this.y - 16, 62, '#e11d48', '#ffffff', 0.30, 8);
            window.fx.addLightningBolt(this.x, this.y - 140, this.x, this.y, '#fda4af', 3.0, 0.30);
            for (let c = 0; c < 4; c++) {
              const ca = this.facingAngle + (c * Math.PI) / 2;
              window.fx.addFissureLine(this.x, this.y, this.x + Math.cos(ca) * 145, this.y + Math.sin(ca) * 145 * PERSPECTIVE_TILT, '#e11d48');
            }
          }
          this.damagePlayersInRadius(livingParty, this.x, this.y, 94, 410, 'Guillotine of the Abyss', 'heavy', 170);
        }
      } else if (this.state === 'pat_mirage') {
        const dashTriggers = [
          { t: 0.24, step: 1, angOff: 0.25, dist: 165 },
          { t: 0.46, step: 2, angOff: -2.35, dist: 175 },
          { t: 0.68, step: 3, angOff: 0.45, dist: 160 }
        ];
        // Aim the upcoming dash at the primary target, but LOCK it MIRAGE_AIM_LOCK before the dash fires (~0.34s) so
        // the telegraph freezes and a sidestep (or Space) actually dodges it instead of the dash re-homing on you.
        const MIRAGE_AIM_LOCK = 0.14;
        const nextDash = dashTriggers.find(dt2 => this.patStep < dt2.step);
        if (primaryTarget && nextDash && prog < nextDash.t - MIRAGE_AIM_LOCK) {
          this.mirageDashAng = Math.atan2((primaryTarget.y - this.y) / PERSPECTIVE_TILT, primaryTarget.x - this.x);
          this.facingAngle = this.mirageDashAng;
        }
        for (const d of dashTriggers) {
          if (prog >= d.t && this.patStep < d.step) {
            this.patStep = d.step;
            const oldX = this.x, oldY = this.y;
            const dashAng = Number.isFinite(this.mirageDashAng) ? this.mirageDashAng : (this.facingAngle + d.angOff);
            this.facingAngle = dashAng;
            this.mirageDashAng = dashAng;
            this.x += Math.cos(dashAng) * d.dist;
            this.y += Math.sin(dashAng) * d.dist * PERSPECTIVE_TILT;
            this.snapFeetToBody();
            audio.playSwordSlash(true);
            if (window.fx) {
              window.fx.addAfterimage(oldX, oldY, dashAng, '#c084fc');
              window.fx.addAfterimage((oldX + this.x) * 0.5, (oldY + this.y) * 0.5, dashAng, '#e11d48');
              window.fx.addRiftLine(oldX, oldY - 12, this.x, this.y - 12, 0.58);
              window.fx.addLightningBolt(oldX, oldY - 18, this.x, this.y - 18, '#e879f9', 2.2, 0.24);
            }
            // Deal phantom pass-through slash damage along the dash path!
            this.damagePlayersInCorridor(livingParty, oldX, oldY, dashAng, d.dist + 25, 44, 235, 'Phantom Mirage Slash', 'medium', 95);
            if (isHostOrSolo && window.game && window.game.net && window.game.net.isHost) {
              window.game.net.broadcast({
                type: 'boss_event',
                event: 'mirage_dash',
                step: d.step,
                x: Math.round(this.x),
                y: Math.round(this.y),
                dashAng: Number(dashAng.toFixed(3))
              });
            }
          }
        }
      } else if (this.state === 'pat_graveyard') {
        if (prog >= 0.74 && this.patStep === 0) {
          this.patStep = 1;
          if (window.fx) {
            window.fx.detonateAllLodgedSwords();
            window.fx.addShockwave(this.x, this.y, 215, '#e11d48', 7);
            window.fx.addShockwave(this.x, this.y, 92, '#38bdf8', 3.5);
          }
          for (const p of livingParty) {
            const d = Math.hypot(p.x - this.x, (p.y - this.y) / PERSPECTIVE_TILT);
            if (d > 92 && d < 220) {
              p.takeDamage(395, 'Sovereign\'s Graveyard Donut', {
                power: 'heavy',
                sourceX: this.x,
                sourceY: this.y,
                pushDist: 170
              });
            }
          }
        }
      } else if (this.state === 'pat_damocles') {
        const tgt = (this.damoclesTarget && this.damoclesTarget.hp > 0) ? this.damoclesTarget : primaryTarget;
        if (tgt) {
          this.rotateTowards(Math.atan2((tgt.y - this.y) / PERSPECTIVE_TILT, tgt.x - this.x), dt * 2.5);
        }
        if (isHostOrSolo) {
          const dropTriggers = [
            { t: 0.16, step: 1 },
            { t: 0.42, step: 2 },
            { t: 0.68, step: 3 }
          ];
          for (const dtg of dropTriggers) {
            if (prog >= dtg.t && this.patStep < dtg.step) {
              this.patStep = dtg.step;
              audio.playParryClang(false);
              if (tgt && window.fx) {
                const leadX = (dtg.step > 1 && tgt.vx) ? tgt.vx * 0.18 : 0;
                const leadY = (dtg.step > 1 && tgt.vy) ? tgt.vy * 0.18 : 0;
                const dropX = tgt.x + leadX;
                const dropY = tgt.y + leadY;
                window.fx.spawnColossalExecutionSword(dropX, dropY, 0.76);

                let skyX = null, skyY = null;
                const others = livingParty.filter(p => p !== tgt);
                if (others.length > 0) {
                  const pick = others[Math.floor(Math.random() * others.length)];
                  skyX = pick.x;
                  skyY = pick.y;
                  window.fx.spawnSkySword(skyX, skyY, 0.60);
                }
                if (window.game && window.game.net && window.game.net.isHost) {
                  window.game.net.broadcast({
                    type: 'boss_event',
                    event: 'damocles_drop',
                    step: dtg.step,
                    dropX: Math.round(dropX),
                    dropY: Math.round(dropY),
                    skyX: skyX !== null ? Math.round(skyX) : null,
                    skyY: skyY !== null ? Math.round(skyY) : null
                  });
                }
              }
            }
          }
        }
      } else if (this.state === 'pat_dreadnought') {
        if (prog < 0.38) {
          // Aim locks at prog 0.17 (~0.47s before the rush) instead of 0.25, so the charge lane can be sidestepped.
          if (primaryTarget && prog < 0.17) {
            this.facingAngle = Math.atan2((primaryTarget.y - this.y) / PERSPECTIVE_TILT, primaryTarget.x - this.x);
            this.baseFacing = this.facingAngle;
            this.chargeStartX = this.x;
            this.chargeStartY = this.y;
            this.chargeEndX = this.x + Math.cos(this.facingAngle) * 285;
            this.chargeEndY = this.y + Math.sin(this.facingAngle) * 285 * PERSPECTIVE_TILT;
          }
        } else if (prog >= 0.38 && prog < 0.74) {
          this.counterableWindow = false;
          if (this.patStep === 0) {
            this.patStep = 1;
            if (!this.dreadnoughtHitSet) this.dreadnoughtHitSet = new Set();
            this.dreadnoughtHitSet.clear();
            audio.playImpactBoom(1.25);
            audio.playSwordSlash(true);
            if (window.fx) {
              window.fx.triggerShake(12, 0.3);
              window.fx.addSonicBoomRings(this.x, this.y, this.chargeEndX, this.chargeEndY, 5, '#e11d48');
            }
            if (isHostOrSolo && window.game && window.game.net && window.game.net.isHost) {
              window.game.net.broadcast({
                type: 'boss_event',
                event: 'dreadnought_rush',
                startX: Math.round(this.chargeStartX),
                startY: Math.round(this.chargeStartY),
                endX: Math.round(this.chargeEndX),
                endY: Math.round(this.chargeEndY),
                baseFacing: Number(this.baseFacing.toFixed(3))
              });
            }
          }
          const rawRushT = (prog - 0.38) / 0.36;
          // Exponential snap acceleration into the bull-rush!
          const rushT = 1 - Math.pow(1 - rawRushT, 3);
          const prevX = this.x, prevY = this.y;
          this.x = this.chargeStartX + (this.chargeEndX - this.chargeStartX) * rushT;
          this.y = this.chargeStartY + (this.chargeEndY - this.chargeStartY) * rushT;
          const cosR = Math.cos(this.facingAngle), sinR = Math.sin(this.facingAngle);
          const runCycle = Math.sin(rawRushT * Math.PI * 5);
          this.leftFoot.x = this.x + ((runCycle * 11) * cosR - (-this.hipWidth) * sinR);
          this.leftFoot.y = this.y + ((runCycle * 11) * sinR + (-this.hipWidth) * cosR);
          this.leftFoot.z = Math.max(0, runCycle) * 7;
          this.leftFoot.stepping = false;
          this.rightFoot.x = this.x + ((-runCycle * 11) * cosR - (this.hipWidth) * sinR);
          this.rightFoot.y = this.y + ((-runCycle * 11) * sinR + (this.hipWidth) * cosR);
          this.rightFoot.z = Math.max(0, -runCycle) * 7;
          this.rightFoot.stepping = false;
          if (window.fx && Math.random() < 0.55) {
            window.fx.addScorchSegment(prevX, prevY, this.x, this.y, true);
            window.fx.addDragSparks(this.x, this.y, this.baseFacing + Math.PI, 4, true);
          }
          // Hit each player in the bull-rush path at most once per charge!
          for (const p of livingParty) {
            if (p.hp > 0 && (!this.dreadnoughtHitSet || !this.dreadnoughtHitSet.has(p.id))) {
              const dist = Math.hypot(p.x - this.x, (p.y - this.y) / PERSPECTIVE_TILT);
              if (dist <= 76) {
                if (this.dreadnoughtHitSet) this.dreadnoughtHitSet.add(p.id);
                p.takeDamage(335, 'Dreadnought Gore-Charge', {
                  power: 'heavy',
                  sourceX: this.x,
                  sourceY: this.y,
                  pushDist: 160
                });
              }
            }
          }
        } else if (prog >= 0.74 && this.patStep === 1) {
          this.patStep = 2;
          this.snapFeetToBody();
          audio.playSwordSlash(true);
          audio.playImpactBoom(1.1);
          if (window.fx) {
            window.fx.triggerShake(14, 0.28);
            window.fx.addShockwave(this.x, this.y, 155, '#f43f5e', 6);
            window.fx.addSlashRibbon(this.x, this.y, 145, this.facingAngle - 1.55, this.facingAngle + 1.55, '#e11d48', 28, 0.26);
          }
          this.damagePlayersInRadius(livingParty, this.x, this.y, 138, 290, 'Dreadnought Sweeping Finisher', 'medium', 130);
        }
      } else if (this.state === 'pat_cross_judgment') {
        if (prog >= 0.44 && this.patStep === 0) {
          this.patStep = 1;
          audio.playImpactBoom(1.4);
          audio.playParryClang(false);
          if (window.fx) {
            window.fx.triggerShake(16, 0.35);
            window.fx.triggerImpactFrame('#e11d48', 0.07);
            window.fx.addShockwave(this.x, this.y, 160, '#e11d48', 5);
            window.fx.addImpactStarburst(this.x, this.y - 18, 56, '#e11d48', '#ffffff', 0.28, 8);
          }
          const cardinalAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
          const hitSet = new Set();
          for (const ang of cardinalAngles) {
            const cosC = Math.cos(ang), sinC = Math.sin(ang);
            if (window.fx) {
              window.fx.addFissureLine(this.x, this.y, this.x + cosC * 270, this.y + sinC * 270 * PERSPECTIVE_TILT, '#e11d48');
              window.fx.addLightningBolt(this.x, this.y - 12, this.x + cosC * 265, this.y + sinC * 265 * PERSPECTIVE_TILT - 12, '#fda4af', 2.2, 0.26);
              for (let d = 75; d <= 245; d += 55) {
                window.fx.addPillar(this.x + cosC * d, this.y + sinC * d * PERSPECTIVE_TILT, 28, '#f43f5e', 0.48);
              }
            }
            const unhitParty = livingParty.filter(p => !hitSet.has(p.id));
            for (const p of unhitParty) {
              const dx = p.x - this.x;
              const dy = (p.y - this.y) / PERSPECTIVE_TILT;
              const fwd = dx * cosC + dy * sinC;
              const lat = Math.abs(-dx * sinC + dy * cosC);
              if (fwd >= 24 && fwd <= 272 && lat <= 36) {
                hitSet.add(p.id);
                p.takeDamage(320, 'Cardinal Cross-Rift', {
                  power: 'heavy',
                  sourceX: this.x,
                  sourceY: this.y,
                  pushDist: 140
                });
              }
            }
          }
        }
        if (prog >= 0.78 && this.patStep === 1) {
          this.patStep = 2;
          audio.playImpactBoom(1.55);
          audio.playSwordSlash(true);
          if (window.fx) {
            window.fx.triggerShake(18, 0.42);
            window.fx.triggerImpactFrame('#c084fc', 0.08);
            window.fx.addShockwave(this.x, this.y, 195, '#c084fc', 6);
            window.fx.addImpactStarburst(this.x, this.y - 18, 62, '#c084fc', '#ffffff', 0.30, 8);
          }
          const diagAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
          const hitSet = new Set();
          for (const ang of diagAngles) {
            const cosD = Math.cos(ang), sinD = Math.sin(ang);
            if (window.fx) {
              window.fx.addFissureLine(this.x, this.y, this.x + cosD * 270, this.y + sinD * 270 * PERSPECTIVE_TILT, '#c084fc');
              window.fx.addLightningBolt(this.x, this.y - 12, this.x + cosD * 265, this.y + sinD * 265 * PERSPECTIVE_TILT - 12, '#e879f9', 2.2, 0.26);
              window.fx.spawnCrescentWave(this.x + cosD * 35, this.y + sinD * 35 * PERSPECTIVE_TILT, ang, 210, 0, null, true);
              for (let d = 80; d <= 240; d += 60) {
                window.fx.addPillar(this.x + cosD * d, this.y + sinD * d * PERSPECTIVE_TILT, 26, '#c084fc', 0.48);
              }
            }
            const unhitParty = livingParty.filter(p => !hitSet.has(p.id));
            for (const p of unhitParty) {
              const dx = p.x - this.x;
              const dy = (p.y - this.y) / PERSPECTIVE_TILT;
              const fwd = dx * cosD + dy * sinD;
              const lat = Math.abs(-dx * sinD + dy * cosD);
              if (fwd >= 24 && fwd <= 272 && lat <= 36) {
                hitSet.add(p.id);
                p.takeDamage(345, 'Diagonal Cross-Rift', {
                  power: 'heavy',
                  sourceX: this.x,
                  sourceY: this.y,
                  pushDist: 150
                });
              }
            }
          }
        }
      } else if (this.state === 'pat_world_cleaver') {
        // Thaemine Gate 4 Style: Colossal Central World-Cleaver Split (prog 0.44) -> Twin Flanking Corridor Eruptions (prog 0.78)
        const cosA = Math.cos(this.baseFacing), sinA = Math.sin(this.baseFacing);
        const perpX = -sinA, perpY = cosA;
        if (prog >= 0.44 && this.patStep === 0) {
          this.patStep = 1;
          audio.playSwordSlash(true);
          audio.playImpactBoom(1.65);
          this.lungeFootForward(this.rightFoot, 22, this.hipWidth + 4, 0.24);
          const endX = this.x + cosA * 520;
          const endY = this.y + sinA * 520 * PERSPECTIVE_TILT;
          if (window.fx) {
            window.fx.triggerShake(22, 0.42);
            window.fx.triggerImpactFrame('#e11d48', 0.09);
            window.fx.addFissureLine(this.x, this.y, endX, endY, '#e11d48');
            window.fx.addShockwave(this.x + cosA * 85, this.y + sinA * 85 * PERSPECTIVE_TILT, 165, '#f43f5e', 6);
            window.fx.addImpactStarburst(this.x + cosA * 85, this.y + sinA * 85 * PERSPECTIVE_TILT - 20, 68, '#e11d48', '#ffffff', 0.32, 8);
            window.fx.addLightningBolt(this.x, this.y - 25, endX, endY - 25, '#fda4af', 3.0, 0.34);
            window.fx.screenCuts.push({
              x1: this.x,
              y1: this.y - 25,
              x2: endX,
              y2: endY - 25,
              life: 0.85
            });
            for (let d = 70; d <= 500; d += 65) {
              window.fx.addPillar(this.x + cosA * d, this.y + sinA * d * PERSPECTIVE_TILT, 34, '#e11d48', 0.55);
            }
          }
          // Hit central corridor (halfWidth = 62px)
          this.damagePlayersInCorridor(livingParty, this.x, this.y, this.baseFacing, 520, 62, 410, 'World-Cleaver Split', 'cataclysm', 180);
        }
        if (prog >= 0.78 && this.patStep === 1) {
          this.patStep = 2;
          audio.playImpactBoom(1.55);
          audio.playParryClang(true);
          if (window.fx) {
            window.fx.triggerShake(18, 0.38);
            window.fx.triggerImpactFrame('#c084fc', 0.08);
          }
          // Twin Left & Right Flanking Corridors erupt at offset +-115px (Center scar is now SAFE!)
          for (const side of [-1, 1]) {
            const laneOriginX = this.x + perpX * side * 115;
            const laneOriginY = this.y + perpY * side * 115 * PERSPECTIVE_TILT;
            const laneEndX = laneOriginX + cosA * 520;
            const laneEndY = laneOriginY + sinA * 520 * PERSPECTIVE_TILT;
            if (window.fx) {
              window.fx.addFissureLine(laneOriginX, laneOriginY, laneEndX, laneEndY, '#c084fc');
              window.fx.addLightningBolt(laneOriginX, laneOriginY - 15, laneEndX, laneEndY - 15, '#e879f9', 2.4, 0.30);
              window.fx.screenCuts.push({
                x1: laneOriginX,
                y1: laneOriginY - 15,
                x2: laneEndX,
                y2: laneEndY - 15,
                life: 0.72
              });
              for (let d = 60; d <= 500; d += 70) {
                window.fx.addPillar(laneOriginX + cosA * d, laneOriginY + sinA * d * PERSPECTIVE_TILT, 32, '#c084fc', 0.52);
              }
            }
            this.damagePlayersInCorridor(livingParty, laneOriginX, laneOriginY, this.baseFacing, 520, 56, 375, 'World-Cleaver Aftershock', 'heavy', 160);
          }
        }
      } else if (this.state === 'pat_thaemine_pizza') {
        // Thaemine Gate 4 Style:
        // Step 1 (prog 0.36): Wide 240° Frontal Crescent Sweep (Safe behind Vaelgor!)
        // Step 2 (prog 0.64): Instant 180° Pivot Backhand Cleave (Rotate through Vaelgor!)
        // Step 3 (prog 0.88): Two-Handed Ground Breaker Slam + 6 Outward Abyssal Waves
        if (prog >= 0.36 && this.patStep === 0) {
          this.patStep = 1;
          audio.playSwordSlash(true);
          audio.playImpactBoom(1.4);
          this.lungeFootForward(this.leftFoot, 20, -this.hipWidth - 4, 0.20);
          if (window.fx) {
            window.fx.triggerShake(16, 0.32);
            window.fx.addShockwave(this.x, this.y, 215, '#e11d48', 6);
            window.fx.addSlashRibbon(this.x, this.y, 205, this.baseFacing - (Math.PI * 2) / 3, this.baseFacing + (Math.PI * 2) / 3, '#e11d48', 38, 0.30);
          }
          // 240° frontal sweep (halfArc = 120° = PI * 2/3)
          this.damagePlayersInSector(livingParty, this.x, this.y, 0, 225, this.baseFacing, (Math.PI * 2) / 3, 355, 'Abyssal 240° Crescent Sweep', 'heavy', 160);
        }
        if (prog >= 0.64 && this.patStep === 1) {
          this.patStep = 2;
          // Vaelgor pivots 180° to punish anyone lingering behind his back!
          this.facingAngle = this.baseFacing + Math.PI;
          this.snapFeetToBody();
          audio.playSwordSlash(true);
          audio.playImpactBoom(1.45);
          if (window.fx) {
            window.fx.triggerShake(17, 0.34);
            window.fx.addShockwave(this.x, this.y, 205, '#c084fc', 6);
            window.fx.addSlashRibbon(this.x, this.y, 195, this.facingAngle + Math.PI * 0.56, this.facingAngle - Math.PI * 0.56, '#c084fc', 36, 0.30);
          }
          // 200° rear backhand sweep centered at baseFacing + PI
          this.damagePlayersInSector(livingParty, this.x, this.y, 0, 215, this.baseFacing + Math.PI, Math.PI * 0.56, 345, 'Abyssal Backhand Pivot', 'heavy', 160);
        }
        if (prog >= 0.88 && this.patStep === 2) {
          this.patStep = 3;
          audio.playImpactBoom(1.6);
          audio.playParryClang(true);
          if (window.fx) {
            window.fx.triggerShake(20, 0.42);
            window.fx.triggerImpactFrame('#e11d48', 0.08);
            window.fx.addPillar(this.x, this.y, 46, '#e11d48', 0.65);
            window.fx.addShockwave(this.x, this.y, 165, '#f43f5e', 6);
            window.fx.addImpactStarburst(this.x, this.y - 18, 64, '#e11d48', '#ffffff', 0.32, 8);
            for (let w = 0; w < 6; w++) {
              const wa = this.facingAngle + (w * Math.PI) / 3;
              window.fx.spawnCrescentWave(this.x + Math.cos(wa) * 32, this.y + Math.sin(wa) * 32 * PERSPECTIVE_TILT, wa, 215, 0, null, true);
            }
          }
          this.damagePlayersInRadius(livingParty, this.x, this.y, 118, 390, 'Abyssal Tectonic Finisher', 'cataclysm', 180);
        }
      } else if (this.state === 'pat_phantom_flurry') {
        // Thaemine Gate 4 Style:
        // 0.00 - 0.31: Blue Counter-Flash Iaido Stance (~0.95s reactable [D] Counter window!)
        // 0.31: Supersonic Blink Dash toward target
        // 0.38, 0.50, 0.62, 0.74: 4-Hit Anime Greatsword Cross-Slash Flurry with Dimensional Screen Cuts
        // 0.88: 360° Finisher Spin launching 3 Fan-Shaped Abyssal Crescent Waves
        // The blink destination is marked at prog 0.19 and locked (~0.37s before the blink) so you can step off the mark
        // instead of the blink re-homing onto your position on the very frame it fires.
        if (this.patStep === 0 && prog < 0.19 && primaryTarget) {
          this.flurryBlinkAng = Math.atan2((primaryTarget.y - this.y) / PERSPECTIVE_TILT, primaryTarget.x - this.x);
          this.flurryBlinkDist = Math.min(240, Math.max(70, Math.hypot(primaryTarget.x - this.x, (primaryTarget.y - this.y) / PERSPECTIVE_TILT) - 45));
          this.facingAngle = this.flurryBlinkAng;
        }
        if (prog >= 0.31 && this.patStep === 0) {
          this.patStep = 1;
          this.counterableWindow = false;
          const oldX = this.x, oldY = this.y;
          if (Number.isFinite(this.flurryBlinkAng)) {
            this.facingAngle = this.flurryBlinkAng;
          } else if (primaryTarget) {
            this.facingAngle = Math.atan2((primaryTarget.y - this.y) / PERSPECTIVE_TILT, primaryTarget.x - this.x);
          }
          this.baseFacing = this.facingAngle;
          const blinkDist = Number.isFinite(this.flurryBlinkDist)
            ? this.flurryBlinkDist
            : (primaryTarget ? Math.min(240, Math.max(70, Math.hypot(primaryTarget.x - this.x, (primaryTarget.y - this.y) / PERSPECTIVE_TILT) - 45)) : 165);
          this.flurryBlinkAng = undefined;
          this.flurryBlinkDist = undefined;
          this.x += Math.cos(this.facingAngle) * blinkDist;
          this.y += Math.sin(this.facingAngle) * blinkDist * PERSPECTIVE_TILT;
          this.snapFeetToBody();
          audio.playSwordSlash(true);
          if (window.fx) {
            window.fx.addAfterimage(oldX, oldY, this.facingAngle);
            window.fx.addAfterimage((oldX + this.x) * 0.5, (oldY + this.y) * 0.5, this.facingAngle);
            window.fx.addSonicBoomRings(oldX, oldY, this.x, this.y, 4, '#c084fc');
            window.fx.addLightningBolt(oldX, oldY - 22, this.x, this.y - 22, '#e879f9', 2.4, 0.24);
          }
          if (isHostOrSolo && window.game && window.game.net && window.game.net.isHost) {
            window.game.net.broadcast({
              type: 'boss_event',
              event: 'phantom_blink',
              x: Math.round(this.x),
              y: Math.round(this.y),
              facingAngle: Number(this.facingAngle.toFixed(3))
            });
          }
        }
        const flurryHits = [
          { t: 0.38, step: 2, cutAng: 0.65, color: '#e11d48', power: 'light', push: 55 },
          { t: 0.50, step: 3, cutAng: -0.65, color: '#c084fc', power: 'light', push: 55 },
          { t: 0.62, step: 4, cutAng: 0.25, color: '#f43f5e', power: 'medium', push: 85 },
          { t: 0.74, step: 5, cutAng: -0.25, color: '#e879f9', power: 'medium', push: 95 }
        ];
        for (const fh of flurryHits) {
          if (prog >= fh.t && this.patStep < fh.step) {
            this.patStep = fh.step;
            const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
            this.x += cosA * 18;
            this.y += sinA * 18 * PERSPECTIVE_TILT;
            this.snapFeetToBody();
            this.lungeFootForward(fh.step % 2 === 0 ? this.leftFoot : this.rightFoot, 12, (fh.step % 2 === 0 ? -1 : 1) * (this.hipWidth + 2), 0.12);
            const hx = this.x + cosA * 62;
            const hy = this.y + sinA * 62 * PERSPECTIVE_TILT;
            audio.playSwordSlash(fh.step % 2 === 0);
            if (window.fx) {
              window.fx.triggerShake(9, 0.16);
              window.fx.addShockwave(hx, hy, 115, fh.color, 4.5);
              const dirSign = fh.cutAng > 0 ? 1 : -1;
              window.fx.addSlashRibbon(this.x, this.y, 138, this.facingAngle - dirSign * 1.3, this.facingAngle + dirSign * 1.3, fh.color, 22, 0.22);
              window.fx.addImpactStarburst(hx, hy - 22, 36, fh.color, '#ffffff', 0.20, 6);
              const scAng = this.facingAngle + fh.cutAng;
              window.fx.screenCuts.push({
                x1: hx - Math.cos(scAng) * 145,
                y1: (hy - 22) - Math.sin(scAng) * 145 * PERSPECTIVE_TILT,
                x2: hx + Math.cos(scAng) * 145,
                y2: (hy - 22) + Math.sin(scAng) * 145 * PERSPECTIVE_TILT,
                life: 0.55
              });
            }
            this.damagePlayersInSector(livingParty, this.x, this.y, 0, 158, this.facingAngle, Math.PI * 0.48, 165, 'Phantom Cross-Slash Flurry', fh.power, fh.push);
          }
        }
        if (prog >= 0.88 && this.patStep < 6) {
          this.patStep = 6;
          this.snapFeetToBody();
          audio.playSwordSlash(true);
          audio.playImpactBoom(1.4);
          if (window.fx) {
            window.fx.triggerShake(16, 0.32);
            window.fx.addShockwave(this.x, this.y, 175, '#e11d48', 6);
            window.fx.addSlashRibbon(this.x, this.y, 148, this.facingAngle - Math.PI, this.facingAngle + Math.PI, '#e11d48', 28, 0.26);
            for (const fanOff of [-0.36, 0, 0.36]) {
              const wa = this.facingAngle + fanOff;
              window.fx.spawnCrescentWave(this.x + Math.cos(wa) * 38, this.y + Math.sin(wa) * 38 * PERSPECTIVE_TILT, wa, 235, 0, null, true);
            }
          }
          this.damagePlayersInRadius(livingParty, this.x, this.y, 138, 305, 'Phantom Crescent Finisher', 'heavy', 160);
        }
      } else if (this.state === 'pat_abyssal_vortex') {
        // PATTERN 10: Abyssal Gravity Vortex -> Inside-Out Annihilation
        // 0.00 - 0.50: Gravity Well continuously pulls all players inward toward Vaelgor!
        // 0.50: Inner Abyssal Nova erupts (r = 148px) — punishes anyone who didn't walk/dash out!
        // 0.84: Outer Tectonic Donut Ring erupts (135px < r < 290px) — players must dash back IN!
        if (prog < 0.50) {
          for (const p of livingParty) {
            if (!p || p.hp <= 0 || p.state === 'grabbed') continue;
            const dx = this.x - p.x;
            const dy = (this.y - p.y) / PERSPECTIVE_TILT;
            const d = Math.hypot(dx, dy);
            if (d > 28 && d < 360) {
              const pullSpd = 88;
              const pullAng = Math.atan2(dy, dx);
              p.x += Math.cos(pullAng) * pullSpd * dt;
              p.y += Math.sin(pullAng) * pullSpd * PERSPECTIVE_TILT * dt;
            }
          }
          if (window.fx && Math.random() < 0.45) {
            const pAng = Math.random() * Math.PI * 2;
            window.fx.addDragSparks(
              this.x + Math.cos(pAng) * 145,
              this.y + Math.sin(pAng) * 145 * PERSPECTIVE_TILT,
              pAng + Math.PI,
              2,
              false,
              '#c084fc'
            );
          }
        }
        if (prog >= 0.50 && this.patStep === 0) {
          this.patStep = 1;
          audio.playImpactBoom(1.65);
          audio.playParryClang(true);
          if (window.fx) {
            window.fx.triggerShake(19, 0.38);
            window.fx.addPillar(this.x, this.y, 52, '#e11d48', 0.72);
            window.fx.addShockwave(this.x, this.y, 148, '#f43f5e', 6.5);
          }
          this.damagePlayersInRadius(livingParty, this.x, this.y, 148, 385, 'Abyssal Vortex Inner Nova', 'cataclysm', 175);
        }
        if (prog >= 0.84 && this.patStep === 1) {
          this.patStep = 2;
          audio.playImpactBoom(1.75);
          audio.playSwordSlash(true);
          if (window.fx) {
            window.fx.triggerShake(22, 0.44);
            window.fx.addShockwave(this.x, this.y, 285, '#c084fc', 7.5);
            window.fx.addShockwave(this.x, this.y, 138, '#38bdf8', 4.0);
            for (let i = 0; i < 8; i++) {
              const a = (i * Math.PI) / 4;
              window.fx.addPillar(
                this.x + Math.cos(a) * 210,
                this.y + Math.sin(a) * 210 * PERSPECTIVE_TILT,
                36,
                '#c084fc',
                0.60
              );
            }
          }
          for (const p of livingParty) {
            const d = Math.hypot(p.x - this.x, (p.y - this.y) / PERSPECTIVE_TILT);
            if (d > 136 && d < 290) {
              p.takeDamage(395, 'Abyssal Vortex Outer Ring', {
                power: 'cataclysm',
                sourceX: this.x,
                sourceY: this.y,
                pushDist: 175
              });
            }
          }
          // HARD: the inner nova echoes back a moment later, punishing anyone who dashed straight in
          if (this.isHardRaid()) (this.hardEchoes = this.hardEchoes || []).push({ x: this.x, y: this.y, r: 148, dmg: 300, delay: 0.95, t: 0 });
        }
      } else if (this.state === 'pat_blood_rain') {
        // PATTERN 11: Crimson Backstep Slash -> 3-Wave Blood-Meteor Barrage -> Counterable Piercing Lunge
        if (prog >= 0.16 && this.patStep === 0) {
          this.patStep = 1;
          const oldX = this.x, oldY = this.y;
          // Aim fixed at move start (no re-aim on the strike frame) so the retreating slash can be sidestepped.
          this.baseFacing = this.facingAngle;
          const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
          // Frontal retreating slash before backstepping
          this.damagePlayersInSector(livingParty, this.x, this.y, 0, 145, this.facingAngle, Math.PI * 0.45, 240, 'Crimson Retreating Slash', 'medium', 110);
          // Backstep 135px away from target (clamped inside arena)
          this.x -= cosA * 135;
          this.y -= sinA * 135 * PERSPECTIVE_TILT;
          if (arenaCenter && arenaRadius) {
            const adx = this.x - arenaCenter.x;
            const ady = (this.y - arenaCenter.y) / PERSPECTIVE_TILT;
            const adist = Math.hypot(adx, ady);
            if (adist > arenaRadius - 35) {
              const ang = Math.atan2(ady, adx);
              this.x = arenaCenter.x + Math.cos(ang) * (arenaRadius - 35);
              this.y = arenaCenter.y + Math.sin(ang) * (arenaRadius - 35) * PERSPECTIVE_TILT;
            }
          }
          this.snapFeetToBody();
          audio.playSwordSlash(true);
          if (window.fx) {
            window.fx.addAfterimage(oldX, oldY, this.facingAngle, '#e11d48');
            window.fx.addShockwave(oldX, oldY, 125, '#f43f5e', 4.5);
          }
          if (isHostOrSolo && window.game && window.game.net && window.game.net.isHost) {
            window.game.net.broadcast({
              type: 'boss_event',
              event: 'blood_rain_backstep',
              x: Math.round(this.x),
              y: Math.round(this.y),
              facingAngle: Number(this.facingAngle.toFixed(3))
            });
          }
        }
        // 3 Rapid Waves of Blood-Meteor Swords raining across players (prog 0.28, 0.43, 0.58)
        if (isHostOrSolo) {
          const rainWaves = [
            { t: 0.28, step: 2 },
            { t: 0.43, step: 3 },
            { t: 0.58, step: 4 }
          ];
          for (const rw of rainWaves) {
            if (prog >= rw.t && this.patStep < rw.step) {
              this.patStep = rw.step;
              audio.playParryClang(false);
              const drops = [];
              for (const p of livingParty) {
                const leadX = (p.vx || 0) * 0.16 + (Math.random() - 0.5) * 28;
                const leadY = (p.vy || 0) * 0.16 + (Math.random() - 0.5) * 20;
                const dx = Math.round(p.x + leadX);
                const dy = Math.round(p.y + leadY);
                drops.push({ x: dx, y: dy, colossal: true });
                if (window.fx) window.fx.spawnColossalExecutionSword(dx, dy, 0.72);
                // Flanking sky sword to tighten dodge space
                const flankAng = Math.random() * Math.PI * 2;
                const sx = Math.round(dx + Math.cos(flankAng) * 85);
                const sy = Math.round(dy + Math.sin(flankAng) * 85 * PERSPECTIVE_TILT);
                drops.push({ x: sx, y: sy, colossal: false });
                if (window.fx) window.fx.spawnSkySword(sx, sy, 0.58);
              }
              if (window.game && window.game.net && window.game.net.isHost) {
                window.game.net.broadcast({
                  type: 'boss_event',
                  event: 'blood_rain_wave',
                  step: rw.step,
                  drops
                });
              }
            }
          }
        }
        // 0.62 - 0.85: Blue Counter-Flash Stance aiming directly at primaryTarget!
        if (prog >= 0.62 && prog < 0.85) {
          if (this.patStep < 5) {
            this.patStep = 5;
            this.counterableWindow = true;
            audio.playCounterFlashCue();
            if (window.fx) {
              window.fx.addShockwave(this.x, this.y, 120, '#38bdf8', 4.5);
            }
          }
          // Lunge aim locks at 0.68 (~0.57s before the lunge) instead of 0.76, so the lane is walkable.
          if (primaryTarget && prog < 0.68) {
            this.facingAngle = Math.atan2((primaryTarget.y - this.y) / PERSPECTIVE_TILT, primaryTarget.x - this.x);
            this.baseFacing = this.facingAngle;
          }
        }
        // 0.85: Cross-Arena Piercing Lunge Finisher!
        if (prog >= 0.85 && this.patStep < 6) {
          this.patStep = 6;
          this.counterableWindow = false;
          const oldX = this.x, oldY = this.y;
          const cosA = Math.cos(this.baseFacing), sinA = Math.sin(this.baseFacing);
          const lungeDist = 310;
          this.x += cosA * lungeDist;
          this.y += sinA * lungeDist * PERSPECTIVE_TILT;
          this.snapFeetToBody();
          audio.playSwordSlash(true);
          audio.playImpactBoom(1.55);
          if (window.fx) {
            window.fx.triggerShake(18, 0.36);
            window.fx.addSonicBoomRings(oldX, oldY, this.x, this.y, 6, '#e11d48');
            window.fx.addFissureLine(oldX, oldY, this.x, this.y, '#e11d48', 5);
            window.fx.addShockwave(this.x, this.y, 145, '#f43f5e', 6);
          }
          this.damagePlayersInCorridor(livingParty, oldX, oldY, this.baseFacing, lungeDist + 45, 54, 385, 'Blood-Rain Piercing Lunge', 'cataclysm', 175);
          if (isHostOrSolo && window.game && window.game.net && window.game.net.isHost) {
            window.game.net.broadcast({
              type: 'boss_event',
              event: 'blood_rain_lunge',
              x: Math.round(this.x),
              y: Math.round(this.y),
              baseFacing: Number(this.baseFacing.toFixed(3))
            });
          }
        }
      } else if (this.state === 'pat_eclipse_blender') {
        // PATTERN 12: Obsidian Blender Hurricane (Chasing Greatsword Whirlwind + Spiraling Waves + X-Rupture Slam)
        // 0.26 - 0.76: Vaelgor spins violently while chasing primaryTarget and firing 4 spiraling waves!
        if (prog >= 0.26 && prog < 0.76) {
          const spinT = (prog - 0.26) / 0.50;
          this.facingAngle = this.baseFacing + spinT * Math.PI * 8;
          if (primaryTarget) {
            const chaseAng = Math.atan2(primaryTarget.y - this.y, primaryTarget.x - this.x);
            const chaseSpd = 128;
            this.x += Math.cos(chaseAng) * chaseSpd * dt;
            this.y += Math.sin(chaseAng) * chaseSpd * dt;
          }
          this.snapFeetToBody();
          const spinTicks = [
            { t: 0.28, step: 1, waveAng: 0 },
            { t: 0.40, step: 2, waveAng: Math.PI * 0.5 },
            { t: 0.52, step: 3, waveAng: Math.PI },
            { t: 0.64, step: 4, waveAng: Math.PI * 1.5 }
          ];
          for (const st of spinTicks) {
            if (prog >= st.t && this.patStep < st.step) {
              this.patStep = st.step;
              audio.playSwordSlash(true);
              if (window.fx) {
                window.fx.triggerShake(10, 0.18);
                window.fx.addShockwave(this.x, this.y, 130, st.step % 2 === 0 ? '#c084fc' : '#e11d48', 5);
                for (const side of [0, Math.PI]) {
                  const wa = this.baseFacing + st.waveAng + side;
                  window.fx.spawnCrescentWave(
                    this.x + Math.cos(wa) * 36,
                    this.y + Math.sin(wa) * 36 * PERSPECTIVE_TILT,
                    wa,
                    225,
                    0,
                    null,
                    true
                  );
                }
              }
              this.damagePlayersInRadius(livingParty, this.x, this.y, 122, 185, 'Obsidian Blender Whirlwind', 'medium', 95);
            }
          }
        }
        // 0.86: 4-Way Diagonal X-Rupture Finisher Slam!
        if (prog >= 0.86 && this.patStep < 5) {
          this.patStep = 5;
          this.facingAngle = this.baseFacing;
          this.snapFeetToBody();
          audio.playImpactBoom(1.65);
          audio.playParryClang(true);
          if (window.fx) {
            window.fx.triggerShake(20, 0.40);
            window.fx.addPillar(this.x, this.y, 48, '#e11d48', 0.70);
            window.fx.addShockwave(this.x, this.y, 185, '#f43f5e', 6.5);
          }
          const diagAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
          const hitSet = new Set();
          for (const ang of diagAngles) {
            const cosD = Math.cos(ang), sinD = Math.sin(ang);
            if (window.fx) {
              window.fx.addFissureLine(this.x, this.y, this.x + cosD * 255, this.y + sinD * 255 * PERSPECTIVE_TILT, '#e11d48');
            }
            for (const p of livingParty) {
              if (hitSet.has(p.id)) continue;
              const dx = p.x - this.x;
              const dy = (p.y - this.y) / PERSPECTIVE_TILT;
              const fwd = dx * cosD + dy * sinD;
              const lat = Math.abs(-dx * sinD + dy * cosD);
              if ((fwd >= 0 && fwd <= 255 && lat <= 38) || Math.hypot(dx, dy) <= 115) {
                hitSet.add(p.id);
                p.takeDamage(355, 'Obsidian Blender X-Rupture', {
                  power: 'heavy',
                  sourceX: this.x,
                  sourceY: this.y,
                  pushDist: 165
                });
              }
            }
          }
        }
      } else if (this.state === 'pattern_final_eclipse_judgment') {
        // NEW FINAL PHASE PATTERN 1: "ECLIPSE JUDGMENT CROSS"
        // 0.48: 4 Cardinal Empowered Beams + Inner Ring (r < 145px) erupt!
        // 0.84: 4 Diagonal Empowered Beams + Outer Ring (145px < r < 310px) erupt!
        if (prog >= 0.48 && !this.judgmentHit1) {
          this.judgmentHit1 = true;
          audio.playImpactBoom(1.75);
          audio.playSwordSlash(true);
          if (window.fx) {
            window.fx.triggerShake(20, 0.38);
            window.fx.addPillar(this.x, this.y, 64, '#c084fc', 0.8);
            window.fx.addShockwave(this.x, this.y, 145, '#e11d48', 7);
          }
          const cardAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
          const hitSet = new Set();
          for (const a of cardAngles) {
            const cosA = Math.cos(a), sinA = Math.sin(a);
            if (window.fx) {
              window.fx.addFissureLine(this.x, this.y, this.x + cosA * 340, this.y + sinA * 340 * PERSPECTIVE_TILT, '#c084fc', 6);
            }
            for (const p of livingParty) {
              if (hitSet.has(p.id)) continue;
              const dx = p.x - this.x;
              const dy = (p.y - this.y) / PERSPECTIVE_TILT;
              const fwd = dx * cosA + dy * sinA;
              const lat = Math.abs(-dx * sinA + dy * cosA);
              if ((fwd >= 0 && fwd <= 340 && lat <= 42) || Math.hypot(dx, dy) <= 145) {
                hitSet.add(p.id);
                p.takeDamage(390, 'Eclipse Judgment Cardinal Beam', {
                  power: 'cataclysm',
                  sourceX: this.x,
                  sourceY: this.y,
                  pushDist: 170
                });
              }
            }
          }
        }
        if (prog >= 0.84 && !this.judgmentHit2) {
          this.judgmentHit2 = true;
          audio.playImpactBoom(1.85);
          audio.playParryClang(true);
          if (window.fx) {
            window.fx.triggerShake(24, 0.45);
            window.fx.addShockwave(this.x, this.y, 310, '#c084fc', 8);
            window.fx.addShockwave(this.x, this.y, 150, '#facc15', 5);
          }
          const diagAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
          const hitSet = new Set();
          for (const a of diagAngles) {
            const cosA = Math.cos(a), sinA = Math.sin(a);
            if (window.fx) {
              window.fx.addFissureLine(this.x, this.y, this.x + cosA * 340, this.y + sinA * 340 * PERSPECTIVE_TILT, '#f43f5e', 6);
            }
            for (const p of livingParty) {
              if (hitSet.has(p.id)) continue;
              const dx = p.x - this.x;
              const dy = (p.y - this.y) / PERSPECTIVE_TILT;
              const fwd = dx * cosA + dy * sinA;
              const lat = Math.abs(-dx * sinA + dy * cosA);
              const d = Math.hypot(dx, dy);
              if ((fwd >= 0 && fwd <= 340 && lat <= 42) || (d > 145 && d <= 310)) {
                hitSet.add(p.id);
                p.takeDamage(420, 'Eclipse Judgment Diagonal Inversion', {
                  power: 'cataclysm',
                  sourceX: this.x,
                  sourceY: this.y,
                  pushDist: 185
                });
              }
            }
          }
        }
      } else if (this.state === 'pattern_final_trinity_slash') {
        // NEW FINAL PHASE PATTERN 2: "ASTRAL TRINITY CLEAVE" — 3 Rapid Teleporting Wide 220° Sweeps + Crescent Waves
        if (prog >= 0.27 && this.counterableWindow) this.counterableWindow = false;     // the counter window closes as the first cut starts
        if (prog >= 0.28 && !this.trinitySlash1) {
          this.trinitySlash1 = true;
          audio.playSwordSlash(true);
          if (window.fx) {
            window.fx.triggerShake(14, 0.24);
            window.fx.addSlashRibbon(this.x, this.y - 34, 175, this.facingAngle - 1.7, this.facingAngle + 1.7, '#c084fc', 36, 0.38);
            for (const off of [-0.45, 0, 0.45]) {
              window.fx.spawnCrescentWave(this.x, this.y, this.facingAngle + off, 260, 0, null, true);
            }
          }
          this.damagePlayersInSector(livingParty, this.x, this.y, 0, 185, this.facingAngle, Math.PI * 0.62, 340, 'Astral Trinity Slash I', 'heavy', 145);
        }
        if (prog >= 0.42 && !this.trinityTeleport1) {
          this.trinityTeleport1 = true;
          // Host picks the teleport spot and broadcasts it; guests apply it from the 'trinity_teleport' event.
          if (isHostOrSolo && primaryTarget) {
            const sideAng = this.facingAngle + Math.PI * 0.65;
            this.applyTrinityTeleport(
              primaryTarget.x + Math.cos(sideAng) * 110,
              primaryTarget.y + Math.sin(sideAng) * 110 * PERSPECTIVE_TILT,
              primaryTarget,
              '#c084fc'
            );
          }
        }
        if (prog >= 0.56 && !this.trinitySlash2) {
          this.trinitySlash2 = true;
          audio.playSwordSlash(false);
          if (window.fx) {
            window.fx.triggerShake(15, 0.26);
            window.fx.addSlashRibbon(this.x, this.y - 34, 185, this.facingAngle + 1.7, this.facingAngle - 1.7, '#f43f5e', 38, 0.38);
            for (const off of [-0.35, 0.35]) {
              window.fx.spawnCrescentWave(this.x, this.y, this.facingAngle + off, 275, 0, null, true);
            }
          }
          this.damagePlayersInSector(livingParty, this.x, this.y, 0, 190, this.facingAngle, Math.PI * 0.62, 355, 'Astral Trinity Slash II', 'heavy', 155);
        }
        if (prog >= 0.68 && !this.trinityTeleport2) {
          this.trinityTeleport2 = true;
          if (isHostOrSolo && primaryTarget) {
            const backAng = this.facingAngle - Math.PI * 0.75;
            this.applyTrinityTeleport(
              primaryTarget.x + Math.cos(backAng) * 95,
              primaryTarget.y + Math.sin(backAng) * 95 * PERSPECTIVE_TILT,
              primaryTarget,
              '#e11d48'
            );
          }
        }
        if (prog >= 0.85 && !this.trinitySlash3) {
          this.trinitySlash3 = true;
          audio.playImpactBoom(1.75);
          audio.playSwordSlash(true);
          if (window.fx) {
            window.fx.triggerShake(22, 0.42);
            window.fx.addPillar(this.x + Math.cos(this.facingAngle) * 75, this.y + Math.sin(this.facingAngle) * 75 * PERSPECTIVE_TILT, 65, '#facc15', 0.8);
            window.fx.addShockwave(this.x, this.y, 215, '#f43f5e', 7);
          }
          this.damagePlayersInSector(livingParty, this.x, this.y, 0, 215, this.facingAngle, Math.PI * 0.72, 410, 'Astral Trinity Finisher', 'cataclysm', 190);
        }
      } else if (this.state === 'pattern_final_oblivion_singularity') {
        // NEW FINAL PHASE PATTERN 3: "OBLIVION SINGULARITY" — Black-Sun Gravity Pull + Safe Outer Ring (r > 235px)
        if (prog < 0.78) {
          for (const p of livingParty) {
            if (!p || p.hp <= 0 || p.state === 'grabbed') continue;
            const dx = this.x - p.x;
            const dy = (this.y - p.y) / PERSPECTIVE_TILT;
            const d = Math.hypot(dx, dy);
            if (d > 24 && d < 390) {
              const pullSpd = 108;
              const pullAng = Math.atan2(dy, dx);
              p.x += Math.cos(pullAng) * pullSpd * dt;
              p.y += Math.sin(pullAng) * pullSpd * PERSPECTIVE_TILT * dt;
            }
          }
          if (window.fx && Math.random() < 0.55) {
            const a = Math.random() * Math.PI * 2;
            window.fx.addDragSparks(
              this.x + Math.cos(a) * 235,
              this.y + Math.sin(a) * 235 * PERSPECTIVE_TILT,
              a + Math.PI,
              2,
              false,
              '#c084fc'
            );
          }
        }
        if (prog >= 0.78 && !this.oblivionDetonated) {
          this.oblivionDetonated = true;
          audio.playImpactBoom(2.0);
          audio.playEclipseBell();
          if (window.fx) {
            window.fx.triggerShake(26, 0.55);
            window.fx.addPillar(this.x, this.y, 92, '#9333ea', 1.1);
            window.fx.addShockwave(this.x, this.y, 235, '#e11d48', 9);
            window.fx.addShockwave(this.x, this.y, 165, '#c084fc', 6);
          }
          this.damagePlayersInRadius(livingParty, this.x, this.y, 235, 460, 'Oblivion Singularity Implosion', 'cataclysm', 220);
        }
      } else if (this.state === 'pattern_final_cataclysm_rain') {
        // NEW FINAL PHASE PATTERN 4: "CATACLYSM STARFALL" — Empowered Sky-Blade Volleys + Center Supernova Dive
        if (prog < 0.72) {
          this.jumpZ = Math.sin((prog / 0.72) * Math.PI) * 240;
          const volleys = [0.18, 0.34, 0.50];
          for (let v = 0; v < volleys.length; v++) {
            if (prog >= volleys[v] && this.cataclysmVolleyCount <= v) {
              this.cataclysmVolleyCount = v + 1;
              audio.playParryClang(false);
              for (const p of livingParty) {
                // Deterministic per-player/per-volley scatter so every client drops these lethal swords in the same spot.
                const sx = Math.round(p.x + (netHash01(p.id, v * 2) - 0.5) * 40);
                const sy = Math.round(p.y + (netHash01(p.id, v * 2 + 1) - 0.5) * 30);
                if (window.fx) {
                  window.fx.spawnColossalExecutionSword(sx, sy, 0.65);
                }
              }
            }
          }
          // Host-only chase; guests receive the position through boss_sync.
          if (isHostOrSolo && primaryTarget && prog < 0.58) {
            this.x += (primaryTarget.x - this.x) * Math.min(1, dt * 4.5);
            this.y += (primaryTarget.y - this.y) * Math.min(1, dt * 4.5);
          }
          this.syncAirborneFeet();
        } else if (!this.cataclysmDiveDone) {
          this.cataclysmDiveDone = true;
          this.jumpZ = 0;
          this.snapFeetToBody();
          audio.playImpactBoom(1.9);
          audio.playSwordSlash(true);
          if (window.fx) {
            window.fx.triggerShake(24, 0.5);
            window.fx.addPillar(this.x, this.y, 75, '#facc15', 0.95);
            window.fx.addShockwave(this.x, this.y, 210, '#f43f5e', 8);
            for (let i = 0; i < 6; i++) {
              const wa = (i * Math.PI) / 3;
              window.fx.spawnCrescentWave(this.x, this.y, wa, 245, 0, null, true);
            }
          }
          this.damagePlayersInRadius(livingParty, this.x, this.y, 195, 430, 'Cataclysm Starfall Dive', 'cataclysm', 195);
        }
      }

      // UPGRADED PREVIOUS PATTERNS IN FINAL PHASE: Empowered Sword releases Eclipse Crescent Waves & Aftershocks at climax!
      if (
        this.finalPhase &&
        this.swordEmpowered &&
        prog >= 0.72 &&
        this.stateTimer > 0 &&   // a guest's timer can hit 0 before the host's next state arrives; without this the burst re-fired every frame
        this.lastFinalUpgradeState !== this.state &&
        !this.state.startsWith('pattern_final_') &&
        this.state !== 'staggered' &&
        this.state !== 'rebuked' &&
        this.state !== 'intro_cutscene'
      ) {
        this.lastFinalUpgradeState = this.state;
        if (window.fx) {
          window.fx.addShockwave(this.x, this.y, 165, '#c084fc', 5);
          for (const off of [-0.32, 0.32]) {
            window.fx.spawnCrescentWave(
              this.x + Math.cos(this.facingAngle + off) * 40,
              this.y + Math.sin(this.facingAngle + off) * 40 * PERSPECTIVE_TILT,
              this.facingAngle + off,
              250,
              0,
              null,
              true
            );
          }
        }
      }

      if (this.stateTimer <= 0) {
        this.jumpZ = 0;
        this.counterableWindow = false;
        if (isHostOrSolo) this.lastFinalUpgradeState = null;   // guests keep the latch until the host actually changes state
        if (this.finalTransitionPending && !this.eclipse10Triggered && isHostOrSolo) {
          this.triggerMechanicFinalPhase(false);
        } else if (this.practiceClockMode) {
          this.stagger = 0;
          // Every client heals the players it owns (remote proxies would just be overwritten by player_state).
          if (livingParty) {
            for (const p of livingParty) {
              if (p && (p.isLocal || p.isBot)) {
                p.hp = p.maxHp;
                p.shield = Math.max(p.shield || 0, 300);
              }
            }
          }
          // Only the host restarts the clock; guests follow via the horizon events.
          if (isHostOrSolo) this.triggerMechanicHorizon(false);
        } else {
          this.state = 'idle';
        }
      }
    }

    // 4. Stalking Locomotion
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    const canWalk = (this.state === 'idle' || this.state === 'walk');

    if (canWalk && dist > 68) {
      this.state = 'walk';
      this.moveAngle = Math.atan2(dy, dx);
      const desiredSpeed = Math.min(this.maxSpeed, dist * 1.8);
      this.speed += (desiredSpeed - this.speed) * Math.min(1, 6.0 * dt);
      this.vx = Math.cos(this.moveAngle) * this.speed;
      this.vy = Math.sin(this.moveAngle) * this.speed;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rotateTowards(Math.atan2(dy / PERSPECTIVE_TILT, dx), dt);
    } else {
      if (this.state === 'walk') this.state = 'idle';
      this.speed *= 0.85;
      this.vx *= 0.85;
      this.vy *= 0.85;
      if (canWalk && primaryTarget) {
        this.rotateTowards(Math.atan2((primaryTarget.y - this.y) / PERSPECTIVE_TILT, primaryTarget.x - this.x), dt * 0.8);
      }
    }

    if (!isHostOrSolo) this.applyNetSyncCorrection(dt);

    // Clamp to Arena Boundary
    if (arenaCenter && arenaRadius) {
      const adx = this.x - arenaCenter.x;
      const ady = (this.y - arenaCenter.y) / PERSPECTIVE_TILT;
      const adist = Math.hypot(adx, ady);
      if (adist > arenaRadius - 30) {
        const ang = Math.atan2(ady, adx);
        this.x = arenaCenter.x + Math.cos(ang) * (arenaRadius - 30);
        this.y = arenaCenter.y + Math.sin(ang) * (arenaRadius - 30) * PERSPECTIVE_TILT;
      }
    }

    if (this.jumpZ <= 0.1) this.updateFootSteps(dt);
    else this.syncAirborneFeet();
    this.updateClothChains(dt);
  }

  // Guest-only: ease x/y/facing toward the last boss_sync pose while both sides are in the same state,
  // so local sub-step re-aims (which use guest-side player positions) can't accumulate drift.
  applyNetSyncCorrection(dt) {
    if (typeof this.netSyncX !== 'number' || this.netSyncState !== this.state) return;
    if (this.state === 'intro_cutscene') return;
    this.netSyncAge = (this.netSyncAge || 0) + dt;
    if (this.netSyncAge > 0.3) return; // stale snapshot (host stalled or packet loss)
    const ex = this.netSyncX - this.x;
    const ey = this.netSyncY - this.y;
    if (ex * ex + ey * ey > 260 * 260) {
      this.x = this.netSyncX;
      this.y = this.netSyncY;
      this.snapFeetToBody();
    } else {
      const k = Math.min(1, dt * 6);
      this.x += ex * k;
      this.y += ey * k;
    }
    // The blender's facing is a free spin, so a 60ms-old host angle would just fight it.
    if (typeof this.netSyncFacing === 'number' && this.state !== 'pat_eclipse_blender') {
      let df = this.netSyncFacing - this.facingAngle;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      this.facingAngle += df * Math.min(1, dt * 8);
    }
  }

  damagePlayersInRadius(party, cx, cy, rad, dmg, label, power = 'medium', pushDist = null) {
    const finalDmg = Math.round(dmg * this.outgoingDamageMult());
    for (const p of party) {
      if (p.hp > 0 && Math.hypot(p.x - cx, (p.y - cy) / PERSPECTIVE_TILT) <= rad) {
        p.takeDamage(finalDmg, label, {
          power,
          sourceX: cx,
          sourceY: cy,
          pushDist
        });
      }
    }
  }

  damagePlayersInSector(party, cx, cy, minRad, maxRad, centerAngle, halfArc, dmg, label, power = 'heavy', pushDist = 140) {
    const finalDmg = Math.round(dmg * this.outgoingDamageMult());
    for (const p of party) {
      if (!p || p.hp <= 0) continue;
      const dx = p.x - cx;
      const dy = (p.y - cy) / PERSPECTIVE_TILT;
      const dist = Math.hypot(dx, dy);
      if (dist < minRad || dist > maxRad) continue;
      let diff = Math.atan2(dy, dx) - centerAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      if (Math.abs(diff) <= halfArc) {
        p.takeDamage(finalDmg, label, {
          power,
          sourceX: cx,
          sourceY: cy,
          pushDist
        });
      }
    }
  }

  damagePlayersInCorridor(party, startX, startY, angle, length, halfWidth, dmg, label, power = 'heavy', pushDist = 145) {
    const finalDmg = Math.round(dmg * this.outgoingDamageMult());
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    for (const p of party) {
      if (!p || p.hp <= 0) continue;
      const dx = p.x - startX;
      const dy = (p.y - startY) / PERSPECTIVE_TILT;
      const fwd = dx * cosA + dy * sinA;
      const lat = Math.abs(-dx * sinA + dy * cosA);
      if (fwd >= -18 && fwd <= length && lat <= halfWidth) {
        p.takeDamage(finalDmg, label, {
          power,
          sourceX: startX + cosA * Math.max(0, fwd),
          sourceY: startY + sinA * Math.max(0, fwd) * PERSPECTIVE_TILT,
          pushDist
        });
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
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    const leadDist = Math.min(16, this.speed * 0.22);
    const leadX = (this.speed > 3) ? Math.cos(this.moveAngle) * leadDist : 0;
    const leadY = (this.speed > 3) ? Math.sin(this.moveAngle) * leadDist : 0;
    const idleStaggerL = (this.speed <= 5) ? 5 : 0;
    const idleStaggerR = (this.speed <= 5) ? -5 : 0;

    const idealLX = this.x + leadX + (idleStaggerL * cosA - (-this.hipWidth) * sinA);
    const idealLY = this.y + leadY + (idleStaggerL * sinA + (-this.hipWidth) * cosA);
    const idealRX = this.x + leadX + (idleStaggerR * cosA - (this.hipWidth) * sinA);
    const idealRY = this.y + leadY + (idleStaggerR * sinA + (this.hipWidth) * cosA);

    const distL = Math.hypot(idealLX - this.leftFoot.x, idealLY - this.leftFoot.y);
    const distR = Math.hypot(idealRX - this.rightFoot.x, idealRY - this.rightFoot.y);
    const stepThreshold = (this.speed > 8) ? 15 : 11;

    const canStepNow = (
      this.state === 'idle' ||
      this.state === 'walk' ||
      (this.state === 'intro_cutscene' && this.patStep === 0)
    );
    if (!this.leftFoot.stepping && !this.rightFoot.stepping && canStepNow) {
      if (this.nextStepFoot === 'left' && distL > stepThreshold) {
        this.startFootStep(this.leftFoot, idealLX, idealLY);
        this.nextStepFoot = 'right';
      } else if (this.nextStepFoot === 'right' && distR > stepThreshold) {
        this.startFootStep(this.rightFoot, idealRX, idealRY);
        this.nextStepFoot = 'left';
      } else if (distL > stepThreshold * 1.25) {
        this.startFootStep(this.leftFoot, idealLX, idealLY);
        this.nextStepFoot = 'right';
      } else if (distR > stepThreshold * 1.25) {
        this.startFootStep(this.rightFoot, idealRX, idealRY);
        this.nextStepFoot = 'left';
      }
    }

    [this.leftFoot, this.rightFoot].forEach((foot) => {
      if (foot.stepping) {
        foot.stepProg += dt / foot.stepDur;
        if (foot.stepProg >= 1.0) {
          foot.stepProg = 1.0;
          foot.stepping = false;
          foot.x = foot.targetX;
          foot.y = foot.targetY;
          foot.z = 0;
          foot.angle = this.facingAngle;
          const impactStrength = Math.max(0.45, Math.min(1.0, this.speed / this.maxSpeed));
          audio.playArmoredStep(impactStrength);
          const S = this.modelScale || 1.62;
          const footWorldX = this.x + (foot.x - this.x) * S;
          const screenFootY = this.y + (foot.y - this.y) * PERSPECTIVE_TILT * S;
          if (window.fx) {
            window.fx.addFootprint(footWorldX, screenFootY, foot.angle);
            window.fx.addStepDust(footWorldX, screenFootY, 6);
          }
          this.pelvisVelZ -= 32 * impactStrength;
          this.pauldronVelZ -= 48 * impactStrength;
        } else {
          const t = foot.stepProg;
          const smoothT = t * t * (3 - 2 * t);
          foot.x = foot.startX + (foot.targetX - foot.startX) * smoothT;
          foot.y = foot.startY + (foot.targetY - foot.startY) * smoothT;
          foot.z = Math.sin(Math.pow(t, 0.85) * Math.PI) * 12.5;
          foot.angle = this.facingAngle;
        }
      } else {
        foot.z = 0;
      }
    });
  }

  startFootStep(foot, targetX, targetY) {
    foot.stepping = true;
    foot.stepProg = 0;
    foot.stepDur = (this.speed > 20) ? 0.40 : 0.34;
    foot.startX = foot.x;
    foot.startY = foot.y;
    const overStep = (this.speed > 10) ? 1.30 : 1.0;
    foot.targetX = this.x + (targetX - this.x) * overStep;
    foot.targetY = this.y + (targetY - this.y) * overStep;
  }

  updateClothChains(dt) {
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
    const time = performance.now() * 0.003;
    const ribbonCount = this.capeRibbons.length;

    // If the cape root node is far from Vaelgor (e.g. after a teleport, dash, or airborne leap), snap cloth chains cleanly!
    if (
      this.capeRibbons[0] &&
      this.capeRibbons[0][0] &&
      (Math.hypot(this.capeRibbons[0][0].x - this.x, this.capeRibbons[0][0].y - this.y) > 58 ||
        Math.abs(this.capeRibbons[0][0].z - (67 + this.jumpZ)) > 58)
    ) {
      this.resetClothChains();
    }

    const velLagX = Math.max(-6.5, Math.min(6.5, this.vx * 0.016));
    const velLagY = Math.max(-6.5, Math.min(6.5, this.vy * 0.016));

    for (let r = 0; r < ribbonCount; r++) {
      const frac = (r / (ribbonCount - 1)) * 2 - 1;
      const nodes = this.capeRibbons[r];
      const pinFwd = -3.5;
      const pinSide = frac * 19.0;
      const pinUp = 67 + this.jumpZ + this.pelvisBounceZ * 0.5;
      nodes[0].x = this.x + (pinFwd * cosA - pinSide * sinA);
      nodes[0].y = this.y + (pinFwd * sinA + pinSide * cosA);
      nodes[0].z = pinUp;

      for (let n = 1; n < nodes.length; n++) {
        const prev = nodes[n - 1];
        const cur = nodes[n];
        const flareOut = frac * (1.8 + n * 0.9);
        const backOffset = -2.8 - n * 0.8;
        const windSway = Math.sin(time * 2.4 - n * 0.65 + r * 0.5) * (1.0 + n * 0.7);
        const desiredX = prev.x + (backOffset * cosA - (flareOut + windSway) * sinA) - velLagX;
        const desiredY = prev.y + (backOffset * sinA + (flareOut + windSway) * cosA) - velLagY;
        const desiredZ = prev.z - 10.5 + Math.min(3.5, this.speed * 0.028 * n);
        const followRate = Math.min(1, dt * (18 - n * 1.4));
        cur.x += (desiredX - cur.x) * followRate;
        cur.y += (desiredY - cur.y) * followRate;
        cur.z += (desiredZ - cur.z) * followRate;

        // Clamp max 3D segment stretch (XY and Z) so the cape never stretches Mr. Fantastic style during combos or jumps!
        const segDist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        if (segDist > 11.5) {
          const pull = 11.5 / segDist;
          cur.x = prev.x + (cur.x - prev.x) * pull;
          cur.y = prev.y + (cur.y - prev.y) * pull;
        }
        const dzDiff = cur.z - prev.z;
        if (Math.abs(dzDiff) > 12.5) {
          cur.z = prev.z + Math.sign(dzDiff) * 12.5;
        }
      }
    }

    this.plumeNodes[0].x = this.x + (-3 * cosA);
    this.plumeNodes[0].y = this.y + (-3 * sinA);
    this.plumeNodes[0].z = 82 + this.jumpZ + this.pelvisBounceZ * 0.5;
    for (let p = 1; p < this.plumeNodes.length; p++) {
      const prev = this.plumeNodes[p - 1];
      const cur = this.plumeNodes[p];
      const wave = Math.sin(time * 4.2 - p * 0.8) * (1.6 + p * 0.6);
      const desiredX = prev.x + (-5.2 * cosA - wave * sinA) - velLagX;
      const desiredY = prev.y + (-5.2 * sinA + wave * cosA) - velLagY;
      const desiredZ = prev.z - 2.0 + Math.sin(time * 3 - p) * 0.8;
      const rate = Math.min(1, dt * (20 - p * 1.8));
      cur.x += (desiredX - cur.x) * rate;
      cur.y += (desiredY - cur.y) * rate;
      cur.z += (desiredZ - cur.z) * rate;

      const pDist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      if (pDist > 9.0) {
        const pull = 9.0 / pDist;
        cur.x = prev.x + (cur.x - prev.x) * pull;
        cur.y = prev.y + (cur.y - prev.y) * pull;
      }
      const pDz = cur.z - prev.z;
      if (Math.abs(pDz) > 6.0) {
        cur.z = prev.z + Math.sign(pDz) * 6.0;
      }
    }
  }

  localToWorld(fwd, side, up) {
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);
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
    const maxReach = (L1 + L2) * 0.96;
    const d = Math.min(rawDist, maxReach);
    const ux = dx / rawDist, uy = dy / rawDist, uz = dz / rawDist;
    // Clamp ankle3D in-place if it ever exceeds maxReach so drawArticulatedLeg can physically never draw a stretched shin!
    if (rawDist > maxReach) {
      const clampedAnkle = this.worldOffsetToScreen(
        hip3D.wx + ux * maxReach,
        hip3D.wy + uy * maxReach,
        hip3D.up + uz * maxReach
      );
      ankle3D.wx = clampedAnkle.wx;
      ankle3D.wy = clampedAnkle.wy;
      ankle3D.up = clampedAnkle.up;
      ankle3D.sx = clampedAnkle.sx;
      ankle3D.sy = clampedAnkle.sy;
      ankle3D.depth = clampedAnkle.depth;
    }
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    const poleX = cosA - (sideSign * 0.26) * sinA;
    const poleY = sinA + (sideSign * 0.26) * cosA;
    const poleZ = 0.18;
    const dot = poleX * ux + poleY * uy + poleZ * uz;
    let px = poleX - dot * ux, py = poleY - dot * uy, pz = poleZ - dot * uz;
    const pLen = Math.hypot(px, py, pz) || 1;
    px /= pLen; py /= pLen; pz /= pLen;
    return this.worldOffsetToScreen(hip3D.wx + ux * a + px * h, hip3D.wy + uy * a + py * h, hip3D.up + uz * a + pz * h);
  }

  // =========================================================================
  // MASTER 2.5D PAINTER'S ALGORITHM RENDERER FOR VAELGOR
  // Includes Slow-In / Snap-Out Exponential Swing Curves & Physical Hit-Impulse
  // =========================================================================
  draw(ctx) {
    if (this.coreDraw) return this.coreDraw(ctx);
    if (this.hp <= 0) return;

    // Gradual Fade-Out when Vaelgor disappears during the 55% HP Echoing Iaido Mechanic!
    let modelAlpha = 1.0;
    if (this.state === 'iaido_mechanic') {
      if (this.iaidoPhase === 'vanished') {
        const vanishProg = Math.max(0, Math.min(1, 1.0 - (this.iaidoTimer / (this.iaidoMaxTimer || 1.05))));
        if (vanishProg >= 0.72) {
          // Completely invisible for the final 28% before teleporting onto the player!
          return;
        }
        const fadeT = vanishProg / 0.72;
        modelAlpha = Math.pow(1.0 - fadeT, 1.45);
      } else if (this.iaidoPhase === 'ambush_counter') {
        const appearProg = Math.max(0, Math.min(1, 1.0 - (this.iaidoTimer / (this.iaidoMaxTimer || 1.28))));
        if (appearProg < 0.14) {
          modelAlpha = 0.18 + (appearProg / 0.14) * 0.82;
        }
      }
    }

    if (this.state === 'intro_cutscene') {
      const introProg = Math.max(0, Math.min(1, 1.0 - (this.stateTimer / (this.stateDuration || 4.95))));
      // Smoothly emerge from pitch-black darkness during the first 28% of the walk-in
      if (introProg < 0.28) {
        modelAlpha = Math.max(0.08, Math.pow(introProg / 0.28, 1.35));
      }
    }

    const time = performance.now() * 0.003;
    const cosA = Math.cos(this.facingAngle);
    const sinA = Math.sin(this.facingAngle);

    this.drawPatternTelegraphsAndEclipse(ctx, time);

    const lFootRelFwd = (this.leftFoot.x - this.x) * cosA + (this.leftFoot.y - this.y) * sinA;
    const rFootRelFwd = (this.rightFoot.x - this.x) * cosA + (this.rightFoot.y - this.y) * sinA;
    const strideDiff = Math.max(-1, Math.min(1, (lFootRelFwd - rFootRelFwd) / 24));

    let weightShiftSide = 0;
    if (this.leftFoot.stepping && !this.rightFoot.stepping) weightShiftSide = 2.4;
    else if (this.rightFoot.stepping && !this.leftFoot.stepping) weightShiftSide = -2.4;

    let crouchZ = 0;
    let torsoYaw = -strideDiff * 0.18;
    let torsoLeanFwd = Math.min(4.0, (this.speed / this.maxSpeed) * 3.5);
    let headPitchZ = 0;

    let rHandLocal = { fwd: 8, side: 18, up: 39 };
    let lHandLocal = { fwd: 10, side: -16, up: 42 };
    let swordTipLocal = { fwd: -58, side: 46, up: 0 };
    let bladeDraggingOnFloor = false;
    let activeSlashArc = null;
    const breatheZ = Math.sin(this.breathePhase) * 1.1;

    if (this.state === 'idle' || this.state === 'walk') {
      const armSwing = strideDiff * 4.0;
      // Standing: both hands on the hilt, the greatsword's point resting on the floor in front of him.
      // Moving: it swings down to his right hand and trails behind him (dragging).
      const mv = Math.max(0, Math.min(1, (this.speed - 4) / 40));
      const mix = (a, b) => a + (b - a) * mv;
      const sway = Math.sin(time * 1.5);
      rHandLocal = {
        fwd: mix(15 + sway * 0.6, 4 + armSwing * 0.5),
        side: mix(9, 20),
        up: mix(41, 35) + breatheZ * 0.5
      };
      lHandLocal = {
        fwd: mix(14 + sway * 0.6, 8 - armSwing * 0.9),
        side: mix(6, -16),
        up: mix(49, 39) + breatheZ * 0.6
      };
      swordTipLocal = {
        fwd: mix(40 + sway * 1.2, -66 + armSwing * 0.3),
        side: mix(15, 52 + sway * 1.5),
        up: 0
      };
      bladeDraggingOnFloor = (this.speed > 8);
    } else if (this.state === 'intro_cutscene') {
      // OPENING RAID CINEMATIC POSE:
      // Step 0 (0.00 - 0.68): Striding menacingly out of the northern cathedral darkness, dragging the Obsidian Greatsword in a trail of sparks
      // Step 1 (0.68 - 1.00): Halting at the altar and wrenching the colossal blade upward in a crimson arc
      const p = Math.max(0, Math.min(1, 1.0 - (this.stateTimer / (this.stateDuration || 4.95))));
      if (this.patStep === 0) {
        const armSwing = strideDiff * 4.5;
        crouchZ = -2;
        torsoLeanFwd = 4.5;
        torsoYaw = -strideDiff * 0.24;
        headPitchZ = -3;
        rHandLocal = { fwd: 2 + armSwing * 0.5, side: 22, up: 34 + breatheZ * 0.5 };
        lHandLocal = { fwd: 10 - armSwing * 0.9, side: -16, up: 38 + breatheZ * 0.6 };
        swordTipLocal = { fwd: -72 + armSwing * 0.3, side: 54, up: 0 };
        bladeDraggingOnFloor = true;
      } else {
        const subT = Math.max(0, Math.min(1, (p - 0.68) / 0.32));
        const ripSnap = 1.0 - Math.pow(1.0 - subT, 3.0);
        crouchZ = -6 * Math.sin(ripSnap * Math.PI);
        torsoLeanFwd = 6 * (1 - ripSnap) - 4 * ripSnap;
        torsoYaw = -0.35 + ripSnap * 0.85;
        headPitchZ = 4 * Math.sin(ripSnap * Math.PI);
        rHandLocal = { fwd: 16 - ripSnap * 8, side: 14 + ripSnap * 8, up: 36 + ripSnap * 6 };
        lHandLocal = { fwd: 14 - ripSnap * 4, side: -12 - ripSnap * 4, up: 38 + ripSnap * 4 };
        swordTipLocal = { fwd: 34 - ripSnap * 92, side: 12 + ripSnap * 38, up: Math.sin(ripSnap * Math.PI) * 38 };
        if (subT > 0.12 && subT < 0.72) {
          activeSlashArc = { prog: (subT - 0.12) / 0.60, color: '#e11d48', width: 28 };
        }
      }
    } else if (this.state === 'flinched' || this.state === 'rebuked') {
      // Poise-Broken Flinch Pose (also the short Rebuke recoil, see rebuke_boss.js): Torso jolted backward, arms thrown wide, guard open!
      const p = 1.0 - (this.stateTimer / (this.stateDuration || 0.55));
      const flinchWave = Math.sin(p * Math.PI);
      crouchZ = -8 * flinchWave;
      torsoLeanFwd = -10 * flinchWave;
      torsoYaw = -0.45 * flinchWave;
      headPitchZ = -5 * flinchWave;
      rHandLocal = { fwd: 6, side: 26, up: 32 };
      lHandLocal = { fwd: 12, side: -22, up: 38 };
      swordTipLocal = { fwd: -48, side: 68, up: 12 };
    } else if (this.state === 'uppercut') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.46) {
        // Deep slow-in coil before snapping upward
        const rawW = p / 0.46;
        const ease = Math.pow(rawW, 1.8);
        crouchZ = -12 * ease; torsoLeanFwd = 10 * ease; torsoYaw = -0.78 * ease;
        rHandLocal = { fwd: 2 - 14 * ease, side: 24, up: 28 - 8 * ease };
        lHandLocal = { fwd: 6 - 12 * ease, side: 14, up: 26 - 6 * ease };
        swordTipLocal = { fwd: -82, side: 50, up: 0 };
        bladeDraggingOnFloor = true;
      } else if (p < 0.76) {
        // Exponential Snap-Out upward rip!
        const rawS = (p - 0.46) / 0.30;
        const snap = 1 - Math.pow(1 - rawS, 4);
        crouchZ = -12 * (1 - snap) + 6 * snap;
        torsoYaw = -0.78 + 1.65 * snap;
        rHandLocal = { fwd: 28, side: 8 - 18 * snap, up: 28 + 44 * snap };
        lHandLocal = { fwd: 25, side: 4 - 18 * snap, up: 24 + 42 * snap };
        swordTipLocal = { fwd: -55 + 154 * Math.sin(snap * Math.PI * 0.65), side: 36 - 62 * snap, up: Math.max(0, -6 + 138 * snap) };
        activeSlashArc = { type: 'uppercut', prog: snap };
      }
    } else if (this.state === 'pat_getsuga_charge' || this.state === 'karok_clash') {
      // Eclipse Getsuga charge-up / Karok Clash poses (karok_clash.js)
      const kp = this.getKarokBossPose(strideDiff);
      ({ crouchZ, torsoYaw, torsoLeanFwd, headPitchZ, rHandLocal, lHandLocal, swordTipLocal, bladeDraggingOnFloor, activeSlashArc } = kp);
    } else if (this.state === 'cleave') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.38) {
        const ease = Math.pow(p / 0.38, 1.7);
        crouchZ = -7 * ease; torsoYaw = 1.05 * ease;
        rHandLocal = { fwd: -14 * ease, side: 32 * ease, up: 52 };
        lHandLocal = { fwd: -10 * ease, side: 28 * ease, up: 49 };
        swordTipLocal = { fwd: -74 * ease, side: 92 * ease, up: 64 };
      } else if (p < 0.66) {
        const rawS = (p - 0.38) / 0.28;
        const snap = 1 - Math.pow(1 - rawS, 4);
        const sweepAng = 1.40 - snap * 2.95;
        torsoYaw = 1.05 - snap * 2.05;
        rHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 44 };
        lHandLocal = { fwd: Math.cos(sweepAng) * 22, side: Math.sin(sweepAng) * 22, up: 41 };
        swordTipLocal = { fwd: Math.cos(sweepAng - 0.15) * 108, side: Math.sin(sweepAng - 0.15) * 108, up: 40 };
        activeSlashArc = { type: 'horizontal', prog: snap };
      } else {
        const rawS = (p - 0.66) / 0.34;
        const snap = 1 - Math.pow(1 - rawS, 3.8);
        const sweepAng = -1.55 + snap * 2.65;
        torsoYaw = -1.0 + snap * 1.8;
        rHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 46 };
        lHandLocal = { fwd: Math.cos(sweepAng) * 22, side: Math.sin(sweepAng) * 22, up: 43 };
        swordTipLocal = { fwd: Math.cos(sweepAng + 0.15) * 108, side: Math.sin(sweepAng + 0.15) * 108, up: 44 };
        activeSlashArc = { type: 'horizontal', prog: snap };
      }
    } else if (this.state === 'thrust') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.48) {
        const coil = Math.pow(p / 0.48, 1.6);
        crouchZ = -5 * coil; torsoLeanFwd = -6 * coil; torsoYaw = -0.55 * coil;
        rHandLocal = { fwd: -16 * coil, side: 14, up: 44 };
        lHandLocal = { fwd: -12 * coil, side: 6, up: 43 };
        swordTipLocal = { fwd: 78 - 16 * coil, side: 4, up: 44 };
      } else {
        const rawP = Math.min(1, (p - 0.48) / 0.25);
        const punch = 1 - Math.pow(1 - rawP, 4.5);
        crouchZ = -7 * punch; torsoLeanFwd = 14 * punch; torsoYaw = 0.35 * punch;
        rHandLocal = { fwd: -16 + 48 * punch, side: 6, up: 44 };
        lHandLocal = { fwd: -12 + 38 * punch, side: 0, up: 43 };
        swordTipLocal = { fwd: 62 + 68 * punch, side: 0, up: 44 };
      }
    } else if (this.state === 'pat_guillotine') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.35) {
        const rawS = Math.min(1, Math.max(0, (p - 0.18) / 0.17));
        const s = 1 - Math.pow(1 - rawS, 3.8);
        rHandLocal = { fwd: 20, side: 12 - 18 * s, up: 28 + 38 * s };
        lHandLocal = { fwd: 18, side: 8 - 16 * s, up: 25 + 36 * s };
        swordTipLocal = { fwd: -50 + 130 * s, side: 35 - 50 * s, up: Math.max(0, 115 * s) };
      } else if (p < 0.56) {
        const s = (p - 0.35) / 0.21;
        rHandLocal = { fwd: 24, side: 0, up: 42 };
        lHandLocal = { fwd: 20, side: -4, up: 40 };
        swordTipLocal = { fwd: 96, side: 12, up: 40 };
        activeSlashArc = { type: 'horizontal', prog: s };
      } else if (p < 0.84) {
        const airT = (p - 0.56) / 0.28;
        const slamSnap = Math.pow(airT, 2.6);
        rHandLocal = { fwd: 8 + 16 * slamSnap, side: 5, up: 76 - 24 * slamSnap };
        lHandLocal = { fwd: 8 + 16 * slamSnap, side: -5, up: 72 - 24 * slamSnap };
        swordTipLocal = { fwd: -18 + 88 * slamSnap, side: 0, up: 138 - 102 * slamSnap };
      } else {
        crouchZ = -14; torsoLeanFwd = 9;
        rHandLocal = { fwd: 24, side: 4, up: 42 };
        lHandLocal = { fwd: 24, side: -4, up: 38 };
        swordTipLocal = { fwd: 26, side: 0, up: 0 };
      }
    } else if (this.state === 'pat_mirage') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      const segIdx = p < 0.24 ? 0 : (p < 0.46 ? 1 : (p < 0.68 ? 2 : 3));
      const segStart = [0, 0.24, 0.46, 0.68][segIdx];
      const segLen = [0.24, 0.22, 0.22, 0.32][segIdx];
      const localT = Math.max(0, Math.min(1, (p - segStart) / segLen));
      const snap = 1 - Math.pow(1 - localT, 3.6);
      const dir = (segIdx % 2 === 0) ? 1 : -1;
      const sweepAng = dir * (1.35 - snap * 2.70);
      crouchZ = -9;
      torsoLeanFwd = 9;
      torsoYaw = dir * (0.85 - snap * 1.70);
      rHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 42 };
      lHandLocal = { fwd: Math.cos(sweepAng) * 22, side: Math.sin(sweepAng) * 22, up: 40 };
      swordTipLocal = { fwd: Math.cos(sweepAng) * 112, side: Math.sin(sweepAng) * 112, up: 38 };
      if (segIdx >= 1 && localT < 0.75) {
        activeSlashArc = { type: 'horizontal', prog: snap };
      }
    } else if (this.state === 'pat_graveyard') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.74) {
        crouchZ = -2;
        rHandLocal = { fwd: 18, side: 14, up: 46 };
        lHandLocal = { fwd: 12, side: -16, up: 76 + Math.sin(time * 6) * 3 };
        swordTipLocal = { fwd: 18, side: 14, up: 0 };
      } else {
        const rawS = (p - 0.74) / 0.26;
        const s = 1 - Math.pow(1 - rawS, 4);
        const sweepAng = 1.3 - s * 2.6;
        rHandLocal = { fwd: Math.cos(sweepAng) * 24, side: Math.sin(sweepAng) * 24, up: 44 };
        lHandLocal = { fwd: Math.cos(sweepAng) * 20, side: Math.sin(sweepAng) * 20, up: 42 };
        swordTipLocal = { fwd: Math.cos(sweepAng) * 98, side: Math.sin(sweepAng) * 98, up: 42 };
        activeSlashArc = { type: 'horizontal', prog: s };
      }
    } else if (this.state === 'pat_damocles') {
      crouchZ = -3;
      torsoLeanFwd = 6;
      torsoYaw = 0.32;
      rHandLocal = { fwd: 30, side: 8, up: 54 };
      lHandLocal = { fwd: 8, side: -18, up: 68 + Math.sin(time * 5) * 3 };
      swordTipLocal = { fwd: 124, side: 8, up: 56 };
    } else if (this.state === 'pat_dreadnought') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.38) {
        const ease = Math.pow(p / 0.38, 1.8);
        crouchZ = -11 * ease;
        torsoLeanFwd = 11 * ease;
        torsoYaw = -0.65 * ease;
        rHandLocal = { fwd: -10 * ease, side: 22, up: 28 };
        lHandLocal = { fwd: 14, side: -14, up: 36 };
        swordTipLocal = { fwd: -84, side: 44, up: 0 };
        bladeDraggingOnFloor = true;
      } else if (p < 0.74) {
        crouchZ = -10;
        torsoLeanFwd = 13;
        torsoYaw = -0.4;
        rHandLocal = { fwd: 22, side: 18, up: 34 };
        lHandLocal = { fwd: 26, side: -10, up: 42 };
        swordTipLocal = { fwd: -48, side: 54, up: 4 };
        bladeDraggingOnFloor = true;
      } else {
        const rawS = (p - 0.74) / 0.26;
        const s = 1 - Math.pow(1 - rawS, 4);
        const sweepAng = 1.5 - s * 3.1;
        torsoYaw = 0.8 - s * 1.6;
        rHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 44 };
        lHandLocal = { fwd: Math.cos(sweepAng) * 22, side: Math.sin(sweepAng) * 22, up: 42 };
        swordTipLocal = { fwd: Math.cos(sweepAng) * 104, side: Math.sin(sweepAng) * 104, up: 42 };
        activeSlashArc = { type: 'horizontal', prog: s };
      }
    } else if (this.state === 'pat_cross_judgment') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.42) {
        const ease = Math.pow(p / 0.42, 1.7);
        crouchZ = 4 * ease;
        torsoLeanFwd = -3 * ease;
        rHandLocal = { fwd: 12, side: 6, up: 52 + 26 * ease };
        lHandLocal = { fwd: 12, side: -6, up: 50 + 26 * ease };
        swordTipLocal = { fwd: 12, side: 0, up: 138 + 18 * ease };
      } else {
        crouchZ = -12;
        torsoLeanFwd = 8;
        rHandLocal = { fwd: 18, side: 5, up: 44 };
        lHandLocal = { fwd: 18, side: -5, up: 42 };
        swordTipLocal = { fwd: 18, side: 0, up: 0 };
      }
    } else if (this.state === 'pat_world_cleaver') {
      // Thaemine G4 Style: Colossal Two-Handed Overhead Raise -> Vertical World-Cleaver Split -> Twin Flanking Eruptions
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.44) {
        const ease = Math.pow(p / 0.44, 1.85);
        crouchZ = 6 * ease;
        torsoLeanFwd = -7 * ease;
        headPitchZ = 4 * ease;
        rHandLocal = { fwd: -6 * ease, side: 5, up: 48 + 38 * ease };
        lHandLocal = { fwd: -6 * ease, side: -5, up: 46 + 38 * ease };
        swordTipLocal = { fwd: -28 * ease, side: 0, up: 136 + 26 * ease };
      } else if (p < 0.78) {
        const rawS = Math.min(1, (p - 0.44) / 0.16);
        const snap = 1 - Math.pow(1 - rawS, 4.5);
        crouchZ = -15 * snap;
        torsoLeanFwd = 14 * snap;
        rHandLocal = { fwd: -6 + 34 * snap, side: 4, up: 86 - 52 * snap };
        lHandLocal = { fwd: -6 + 34 * snap, side: -4, up: 84 - 52 * snap };
        swordTipLocal = { fwd: -28 + 124 * snap, side: 0, up: Math.max(0, 162 * (1 - snap)) };
        if (rawS < 0.95) activeSlashArc = { type: 'uppercut', prog: snap };
      } else {
        const pulse = Math.sin((p - 0.78) * 18) * 2;
        crouchZ = -13;
        torsoLeanFwd = 11;
        rHandLocal = { fwd: 26, side: 8, up: 36 + pulse };
        lHandLocal = { fwd: 24, side: -14, up: 54 + pulse };
        swordTipLocal = { fwd: 88, side: 4, up: 0 };
      }
    } else if (this.state === 'pat_thaemine_pizza') {
      // Thaemine G4 Style: 240° Wide Frontal Crescent Sweep -> 180° Pivot Backhand -> Ground Slam
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.36) {
        const ease = Math.pow(p / 0.36, 1.75);
        crouchZ = -9 * ease;
        torsoYaw = 1.25 * ease;
        torsoLeanFwd = 6 * ease;
        rHandLocal = { fwd: -18 * ease, side: 34 * ease, up: 46 };
        lHandLocal = { fwd: -14 * ease, side: 30 * ease, up: 44 };
        swordTipLocal = { fwd: -84 * ease, side: 96 * ease, up: 44 };
      } else if (p < 0.64) {
        const rawS = (p - 0.36) / 0.28;
        const snap = 1 - Math.pow(1 - rawS, 4.2);
        const sweepAng = 1.65 - snap * 3.45;
        crouchZ = -8;
        torsoYaw = 1.25 - snap * 2.5;
        rHandLocal = { fwd: Math.cos(sweepAng) * 28, side: Math.sin(sweepAng) * 28, up: 44 };
        lHandLocal = { fwd: Math.cos(sweepAng) * 24, side: Math.sin(sweepAng) * 24, up: 42 };
        swordTipLocal = { fwd: Math.cos(sweepAng - 0.12) * 116, side: Math.sin(sweepAng - 0.12) * 116, up: 40 };
        activeSlashArc = { type: 'horizontal', prog: snap };
      } else if (p < 0.88) {
        const rawS = (p - 0.64) / 0.24;
        const snap = 1 - Math.pow(1 - rawS, 4.2);
        const sweepAng = -1.65 + snap * 3.30;
        crouchZ = -7;
        torsoYaw = -1.2 + snap * 2.3;
        rHandLocal = { fwd: Math.cos(sweepAng) * 28, side: Math.sin(sweepAng) * 28, up: 46 };
        lHandLocal = { fwd: Math.cos(sweepAng) * 24, side: Math.sin(sweepAng) * 24, up: 44 };
        swordTipLocal = { fwd: Math.cos(sweepAng + 0.12) * 116, side: Math.sin(sweepAng + 0.12) * 116, up: 42 };
        activeSlashArc = { type: 'horizontal', prog: snap };
      } else {
        crouchZ = -14;
        torsoLeanFwd = 10;
        rHandLocal = { fwd: 22, side: 5, up: 38 };
        lHandLocal = { fwd: 22, side: -5, up: 36 };
        swordTipLocal = { fwd: 26, side: 0, up: 0 };
      }
    } else if (this.state === 'pat_phantom_flurry') {
      // Thaemine G4 Style: Blue Counter-Flash Iaido Coil -> 4-Hit Anime Cross-Slash Flurry -> 3-Wave Finisher
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.25) {
        const coil = Math.pow(p / 0.25, 1.6);
        crouchZ = -12 * coil;
        torsoLeanFwd = 9 * coil;
        torsoYaw = -0.95 * coil;
        rHandLocal = { fwd: -12 * coil, side: -22 * coil, up: 34 };
        lHandLocal = { fwd: 14, side: -18, up: 38 };
        swordTipLocal = { fwd: -78, side: -64 * coil, up: 24 };
      } else if (p < 0.84) {
        // Rapid alternating diagonal & horizontal anime cross-slashes!
        const flurryT = (p - 0.25) / 0.59;
        const slashIdx = Math.floor(flurryT * 4);
        const localT = (flurryT * 4) - slashIdx;
        const snap = 1 - Math.pow(1 - localT, 3.8);
        const dir = (slashIdx % 2 === 0) ? 1 : -1;
        const sweepAng = dir * (1.45 - snap * 2.90);
        crouchZ = -8;
        torsoLeanFwd = 10;
        torsoYaw = dir * (0.95 - snap * 1.90);
        rHandLocal = { fwd: Math.cos(sweepAng) * 28, side: Math.sin(sweepAng) * 28, up: 44 + dir * 6 * (0.5 - snap) };
        lHandLocal = { fwd: Math.cos(sweepAng) * 24, side: Math.sin(sweepAng) * 24, up: 42 + dir * 6 * (0.5 - snap) };
        swordTipLocal = { fwd: Math.cos(sweepAng) * 114, side: Math.sin(sweepAng) * 114, up: 42 - dir * 18 * (0.5 - snap) };
        activeSlashArc = { type: 'horizontal', prog: snap };
      } else {
        const rawS = (p - 0.84) / 0.16;
        const snap = 1 - Math.pow(1 - rawS, 4);
        const sweepAng = -1.6 + snap * 3.2;
        crouchZ = -10;
        torsoLeanFwd = 12;
        torsoYaw = -1.1 + snap * 2.2;
        rHandLocal = { fwd: Math.cos(sweepAng) * 30, side: Math.sin(sweepAng) * 30, up: 44 };
        lHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 42 };
        swordTipLocal = { fwd: Math.cos(sweepAng) * 118, side: Math.sin(sweepAng) * 118, up: 42 };
        activeSlashArc = { type: 'horizontal', prog: snap };
      }
    } else if (this.state === 'pat_abyssal_vortex') {
      // PATTERN 10 Pose: Greatsword planted into the ground channeling the Gravity Vortex -> Overhead Pull-Out -> Outer Ring Slam!
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.50) {
        const pulse = Math.sin(time * 16) * 2;
        crouchZ = -12 + pulse * 0.5;
        torsoLeanFwd = 9;
        headPitchZ = -5;
        rHandLocal = { fwd: 18, side: 4, up: 44 + pulse };
        lHandLocal = { fwd: 18, side: -4, up: 42 + pulse };
        swordTipLocal = { fwd: 18, side: 0, up: 0 };
      } else if (p < 0.84) {
        const lift = Math.min(1, (p - 0.50) / 0.24);
        const ease = 1 - Math.pow(1 - lift, 3);
        crouchZ = -12 * (1 - ease) + 6 * ease;
        torsoLeanFwd = 9 * (1 - ease) - 7 * ease;
        headPitchZ = 6 * ease;
        rHandLocal = { fwd: 18 - 22 * ease, side: 5, up: 44 + 46 * ease };
        lHandLocal = { fwd: 18 - 22 * ease, side: -5, up: 42 + 44 * ease };
        swordTipLocal = { fwd: 18 - 38 * ease, side: 0, up: 168 * ease };
      } else {
        crouchZ = -14;
        torsoLeanFwd = 10;
        rHandLocal = { fwd: 20, side: 5, up: 38 };
        lHandLocal = { fwd: 20, side: -5, up: 36 };
        swordTipLocal = { fwd: 22, side: 0, up: 0 };
      }
    } else if (this.state === 'pat_blood_rain') {
      // PATTERN 11 Pose: Retreating Slash Backstep -> Skyward Sword Command -> Low Counter-Flash Piercing Lunge!
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.22) {
        const snap = Math.min(1, p / 0.16);
        const sweepAng = 1.4 - snap * 2.8;
        crouchZ = -8;
        torsoYaw = 0.9 - snap * 1.8;
        rHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 44 };
        lHandLocal = { fwd: Math.cos(sweepAng) * 22, side: Math.sin(sweepAng) * 22, up: 42 };
        swordTipLocal = { fwd: Math.cos(sweepAng) * 112, side: Math.sin(sweepAng) * 112, up: 40 };
        activeSlashArc = { type: 'horizontal', prog: snap };
      } else if (p < 0.62) {
        const pulse = Math.sin(time * 12) * 2;
        crouchZ = 4;
        torsoLeanFwd = -5;
        headPitchZ = 6;
        rHandLocal = { fwd: 10, side: 8, up: 88 + pulse };
        lHandLocal = { fwd: 8, side: -16, up: 66 + pulse };
        swordTipLocal = { fwd: 14, side: 6, up: 182 + pulse };
      } else if (p < 0.85) {
        const coil = (p - 0.62) / 0.23;
        crouchZ = -12 * coil;
        torsoLeanFwd = 11 * coil;
        torsoYaw = -0.75 * coil;
        rHandLocal = { fwd: -18 * coil, side: 20, up: 36 };
        lHandLocal = { fwd: 14, side: -14, up: 40 };
        swordTipLocal = { fwd: 96, side: 8, up: 36 };
      } else {
        crouchZ = -11;
        torsoLeanFwd = 14;
        torsoYaw = 0.35;
        rHandLocal = { fwd: 34, side: 6, up: 42 };
        lHandLocal = { fwd: 18, side: -12, up: 44 };
        swordTipLocal = { fwd: 128, side: 4, up: 40 };
      }
    } else if (this.state === 'pat_eclipse_blender') {
      // PATTERN 12 Pose: Low Greatsword Coil -> High-Velocity Extended Whirlwind -> Two-Handed X-Rupture Ground Slam!
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.26) {
        const coil = Math.pow(p / 0.26, 1.6);
        crouchZ = -11 * coil;
        torsoLeanFwd = 8 * coil;
        torsoYaw = 1.25 * coil;
        rHandLocal = { fwd: -16 * coil, side: 32 * coil, up: 40 };
        lHandLocal = { fwd: -12 * coil, side: 28 * coil, up: 38 };
        swordTipLocal = { fwd: -84 * coil, side: 98 * coil, up: 22 };
        bladeDraggingOnFloor = true;
      } else if (p < 0.76) {
        const spinT = ((p - 0.26) / 0.50) * 4;
        const localFrac = spinT - Math.floor(spinT);
        crouchZ = -9;
        torsoLeanFwd = 10;
        rHandLocal = { fwd: 28, side: 6, up: 42 };
        lHandLocal = { fwd: 24, side: -6, up: 40 };
        swordTipLocal = { fwd: 122, side: 0, up: 38 };
        activeSlashArc = { type: 'horizontal', prog: localFrac };
      } else {
        const slamT = Math.min(1, (p - 0.76) / 0.12);
        crouchZ = -14 * slamT;
        torsoLeanFwd = 11 * slamT;
        rHandLocal = { fwd: 20, side: 5, up: 72 * (1 - slamT) + 38 * slamT };
        lHandLocal = { fwd: 20, side: -5, up: 70 * (1 - slamT) + 36 * slamT };
        swordTipLocal = { fwd: 24, side: 0, up: 145 * (1 - slamT) };
      }
    } else if (this.state === 'horizon_mechanic') {
      if (this.horizonPhase === 'show_memory') {
        // Purely Physical Sword & Body Tell (Vindictus / Thaemine Style):
        // 0.00 - 0.32: Vaelgor points his Greatsword toward the active Obelisk while coiling into his physical strike stance
        // 0.32 - 1.00: Vaelgor executes one of 3 distinct physical Greatsword motions:
        //   - 'cw'       (Forehand Cleave): Wide horizontal cleave toward +side (+90° Clockwise)
        //   - 'ccw'      (Backhand Cleave): Reverse horizontal cleave toward -side (-90° Counter-Clockwise)
        //   - 'opposite' (Overhead Impale): Two-handed vertical overhead stab straight into the stone (no lateral spin)
        const p = Math.max(0, Math.min(1, 1.0 - (this.horizonTimer / (this.horizonMaxTimer || 1.50))));
        const shiftType = this.horizonVisualShift(this.horizonSlashIndex);

        if (shiftType === 'cw') {
          if (p < 0.32) {
            const coil = Math.sin((p / 0.32) * Math.PI * 0.5);
            crouchZ = -6 * coil;
            torsoLeanFwd = 8 * coil;
            torsoYaw = -0.52 * coil;
            rHandLocal = { fwd: 30 - 12 * coil, side: 6 - 24 * coil, up: 50 - 8 * coil };
            lHandLocal = { fwd: 24 - 10 * coil, side: -8 - 20 * coil, up: 46 - 8 * coil };
            swordTipLocal = { fwd: 126 - 28 * coil, side: -46 * coil, up: 56 - 38 * coil };
          } else {
            const snap = 1 - Math.pow(1 - Math.min(1, (p - 0.32) / 0.32), 3.4);
            const sweepAng = -0.35 + snap * 1.65; // Sweeps from pointed Obelisk (+0) across to +90° Clockwise (+side)
            crouchZ = -9;
            torsoLeanFwd = 11;
            torsoYaw = -0.52 + snap * 1.48;
            rHandLocal = { fwd: Math.cos(sweepAng) * 32, side: Math.sin(sweepAng) * 32, up: 40 };
            lHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26 - 4, up: 38 };
            swordTipLocal = { fwd: Math.cos(sweepAng) * 124, side: Math.sin(sweepAng) * 124, up: 24 };
            bladeDraggingOnFloor = (p < 0.72);
            activeSlashArc = { type: 'horizontal', prog: snap };
          }
        } else if (shiftType === 'ccw') {
          if (p < 0.32) {
            const coil = Math.sin((p / 0.32) * Math.PI * 0.5);
            crouchZ = -6 * coil;
            torsoLeanFwd = 8 * coil;
            torsoYaw = 0.52 * coil;
            rHandLocal = { fwd: 30 - 12 * coil, side: 6 + 22 * coil, up: 50 - 8 * coil };
            lHandLocal = { fwd: 24 - 10 * coil, side: -8 + 24 * coil, up: 46 - 8 * coil };
            swordTipLocal = { fwd: 126 - 28 * coil, side: 46 * coil, up: 56 - 38 * coil };
          } else {
            const snap = 1 - Math.pow(1 - Math.min(1, (p - 0.32) / 0.32), 3.4);
            const sweepAng = 0.35 - snap * 1.65; // Whips from pointed Obelisk (+0) across to -90° Counter-Clockwise (-side)
            crouchZ = -9;
            torsoLeanFwd = 11;
            torsoYaw = 0.52 - snap * 1.48;
            rHandLocal = { fwd: Math.cos(sweepAng) * 32, side: Math.sin(sweepAng) * 32, up: 40 };
            lHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26 + 4, up: 38 };
            swordTipLocal = { fwd: Math.cos(sweepAng) * 124, side: Math.sin(sweepAng) * 124, up: 24 };
            bladeDraggingOnFloor = (p < 0.72);
            activeSlashArc = { type: 'horizontal', prog: snap };
          }
        } else {
          // 'opposite' (180° Across): Two-Handed Overhead Ground Impale straight along the centerline!
          if (p < 0.32) {
            const lift = Math.sin((p / 0.32) * Math.PI * 0.5);
            crouchZ = 6 * lift;
            torsoLeanFwd = 6 * (1 - lift) - 7 * lift;
            headPitchZ = 6 * lift;
            torsoYaw = 0;
            rHandLocal = { fwd: 28 * (1 - lift) + 8 * lift, side: 6, up: 52 + 44 * lift };
            lHandLocal = { fwd: 24 * (1 - lift) + 8 * lift, side: -6, up: 48 + 42 * lift };
            swordTipLocal = { fwd: 122 * (1 - lift) - 8 * lift, side: 0, up: 64 + 122 * lift };
          } else {
            const snap = 1 - Math.pow(1 - Math.min(1, (p - 0.32) / 0.18), 3.8);
            crouchZ = 6 * (1 - snap) - 16 * snap;
            torsoLeanFwd = -7 * (1 - snap) + 12 * snap;
            headPitchZ = 6 * (1 - snap) - 6 * snap;
            torsoYaw = 0;
            rHandLocal = { fwd: 8 + 26 * snap, side: 5, up: 96 * (1 - snap) + 38 * snap };
            lHandLocal = { fwd: 8 + 26 * snap, side: -5, up: 92 * (1 - snap) + 36 * snap };
            swordTipLocal = { fwd: -8 * (1 - snap) + 38 * snap, side: 0, up: 186 * (1 - snap) };
            activeSlashArc = { type: 'vertical', prog: snap };
          }
        }
      } else {
        // Channeling the Eclipse Clock Cataclysm: Two-handed Greatsword raised in ritual invocation!
        const pulse = Math.sin(time * 9) * 2.5;
        crouchZ = -8;
        torsoLeanFwd = -5;
        headPitchZ = 5;
        rHandLocal = { fwd: 10, side: 6, up: 86 + pulse };
        lHandLocal = { fwd: 10, side: -6, up: 82 + pulse };
        swordTipLocal = { fwd: 4, side: 0, up: 178 + pulse };
      }
    } else if (this.state === 'iaido_mechanic') {
      if (this.iaidoPhase === 'center_coil' || this.iaidoPhase === 'vanished') {
        const sink = (this.iaidoPhase === 'vanished') ? (1.0 - modelAlpha) * 8 : 0;
        crouchZ = -13 - sink;
        torsoLeanFwd = 10;
        torsoYaw = -0.85;
        rHandLocal = { fwd: -10, side: -22, up: 34 };
        lHandLocal = { fwd: 14, side: -18, up: 38 };
        swordTipLocal = { fwd: -78, side: -64, up: 22 };
      } else {
        // Towering Overhead Execution Pose: Greatsword raised way above Vaelgor's head, poised to slice down!
        const tremor = Math.sin(time * 16) * 1.5;
        crouchZ = 6;
        torsoLeanFwd = -8;
        headPitchZ = 6;
        rHandLocal = { fwd: -6, side: 6, up: 94 + tremor };
        lHandLocal = { fwd: -6, side: -6, up: 90 + tremor };
        swordTipLocal = { fwd: -22, side: 0, up: 184 + tremor };
      }
    } else if (this.state === 'eclipse_mechanic') {
      if (this.eclipsePhase === 'cutscene') {
        const cutProg = Math.max(0, Math.min(1, 1.0 - (this.eclipseTimer / (this.eclipseMaxTimer || 4.45))));
        if (cutProg < 0.54) {
          // Stage 1 (0.00 - 0.54): Kneeling two-handed greatsword plant into the cathedral stone ("Kneel before the Black Sun...")
          const kneel = Math.sin((cutProg / 0.54) * Math.PI * 0.5);
          crouchZ = -16 * kneel;
          torsoLeanFwd = 10 * kneel;
          headPitchZ = -6 * kneel;
          rHandLocal = { fwd: 18, side: 4, up: 44 - 10 * kneel };
          lHandLocal = { fwd: 18, side: -4, up: 42 - 10 * kneel };
          swordTipLocal = { fwd: 18, side: 0, up: 0 };
        } else {
          // Stage 2 (0.54 - 1.00): Rising to full height & raising the Obsidian Greatsword skyward toward the Black Sun ("...and despair!")
          const rise = Math.min(1, (cutProg - 0.54) / 0.28);
          const snap = 1 - Math.pow(1 - rise, 3.2);
          const tremor = Math.sin(time * 18) * 1.4;
          crouchZ = -16 * (1 - snap) + 6 * snap;
          torsoLeanFwd = 10 * (1 - snap) - 6 * snap;
          headPitchZ = 7 * snap;
          rHandLocal = { fwd: 18 - 10 * snap, side: 6, up: 34 + 62 * snap + tremor };
          lHandLocal = { fwd: 18 - 10 * snap, side: -6, up: 32 + 58 * snap + tremor };
          swordTipLocal = { fwd: 18 - 14 * snap, side: 0, up: 188 * snap + tremor };
        }
      } else if (this.eclipsePhase === 'wipe') {
        // sword hauled skyward at the Black Sun, held trembling, then brought down with the whole body
        const wp = 1.0 - (this.eclipseTimer / (this.eclipseMaxTimer || 2.6));
        const up = Math.min(1, wp / 0.4), slam = Math.max(0, Math.min(1, (wp - 0.52) / 0.1));
        const tremor = Math.sin(time * 26) * 1.6 * up * (1 - slam);
        crouchZ = -4 + 10 * up - 22 * slam; torsoLeanFwd = -9 * up + 26 * slam; headPitchZ = 8 * up - 12 * slam;
        rHandLocal = { fwd: 10 + 14 * slam, side: 6, up: 40 + 58 * up - 74 * slam + tremor };
        lHandLocal = { fwd: 10 + 14 * slam, side: -6, up: 38 + 54 * up - 72 * slam + tremor };
        swordTipLocal = { fwd: -10 + 100 * slam, side: 0, up: 8 + 190 * up - 196 * slam + tremor };
      } else if (this.eclipsePhase === 'channel') {
        crouchZ = -12; torsoLeanFwd = 6; headPitchZ = -4;
        rHandLocal = { fwd: 18, side: 4, up: 48 };
        lHandLocal = { fwd: 18, side: -4, up: 45 };
        swordTipLocal = { fwd: 18, side: 0, up: 0 };
      } else {
        crouchZ = -4; torsoLeanFwd = -3;
        rHandLocal = { fwd: 14, side: 6, up: 68 };
        lHandLocal = { fwd: 14, side: -6, up: 64 };
        swordTipLocal = { fwd: 6, side: 0, up: 128 };
      }
    } else if (this.state === 'pat_phantom_step') {
      const p = 1.0 - (this.stateTimer / (this.stateDuration || 0.86));
      const pSide = this.phantomStepSide || 1;
      if (p < 0.42) {
        const dashT = p / 0.42;
        crouchZ = -12 * Math.sin(dashT * Math.PI);
        torsoLeanFwd = 13;
        torsoYaw = -0.95 * pSide;
        rHandLocal = { fwd: -18, side: -28 * pSide, up: 36 };
        lHandLocal = { fwd: -14, side: -22 * pSide, up: 34 };
        swordTipLocal = { fwd: -95, side: -82 * pSide, up: 18 };
        bladeDraggingOnFloor = true;
      } else {
        const snap = 1 - Math.pow(1 - Math.min(1, (p - 0.42) / 0.34), 3.6);
        const sweepAng = pSide * (-1.65 + snap * 3.3);
        crouchZ = -8;
        torsoLeanFwd = 10;
        torsoYaw = pSide * (-1.1 + snap * 2.2);
        rHandLocal = { fwd: Math.cos(sweepAng) * 28, side: Math.sin(sweepAng) * 28, up: 44 };
        lHandLocal = { fwd: Math.cos(sweepAng) * 24, side: Math.sin(sweepAng) * 24, up: 42 };
        swordTipLocal = { fwd: Math.cos(sweepAng) * 118, side: Math.sin(sweepAng) * 118, up: 42 };
        activeSlashArc = { type: 'horizontal', prog: snap };
      }
    } else if (this.state === 'final_phase_mechanic') {
      if (this.finalMechPhase === 'arena_cutscene') {
        const cutProg = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 3.8))));
        if (cutProg < 0.34) {
          // Stage 1: Dark Buildup & Two-Handed Overhead Greatsword Raise
          const liftT = cutProg / 0.34;
          const smoothLift = liftT * liftT * (3 - 2 * liftT);
          crouchZ = -8 + smoothLift * 16;
          torsoLeanFwd = 8 - smoothLift * 16;
          headPitchZ = -4 + smoothLift * 12;
          rHandLocal = { fwd: 16 - smoothLift * 8, side: 5, up: 40 + smoothLift * 56 };
          lHandLocal = { fwd: 16 - smoothLift * 8, side: -5, up: 38 + smoothLift * 54 };
          swordTipLocal = { fwd: 18 - smoothLift * 14, side: 0, up: 48 + smoothLift * 148 };
        } else if (cutProg < 0.48) {
          // Stage 2: Violent Two-Handed Ground Impale into Whiteout Climax
          const slamT = (cutProg - 0.34) / 0.14;
          const snap = 1 - Math.pow(1 - slamT, 3.5);
          crouchZ = 8 - snap * 24;
          torsoLeanFwd = -8 + snap * 22;
          headPitchZ = 8 - snap * 16;
          rHandLocal = { fwd: 8 + snap * 12, side: 4, up: 96 - snap * 56 };
          lHandLocal = { fwd: 8 + snap * 12, side: -4, up: 92 - snap * 54 };
          swordTipLocal = { fwd: 4 + snap * 16, side: 0, up: Math.max(0, 196 * (1 - snap * 1.05)) };
          activeSlashArc = { type: 'vertical', prog: snap };
        } else if (cutProg < 0.78) {
          // Stage 3: Kneeling over Planted Greatsword as the Pale Eclipse Sanctuary Materializes
          const pulse = Math.sin(time * 14) * 1.5;
          crouchZ = -16;
          torsoLeanFwd = 14;
          headPitchZ = -6;
          rHandLocal = { fwd: 20, side: 4, up: 40 + pulse };
          lHandLocal = { fwd: 20, side: -4, up: 38 + pulse };
          swordTipLocal = { fwd: 20, side: 0, up: 0 };
        } else {
          // Stage 4: Rising & Wrenching Greatsword out of the Sanctuary Stone into Battle Guard
          const riseT = (cutProg - 0.78) / 0.22;
          const snapRise = 1 - Math.pow(1 - riseT, 3);
          crouchZ = -16 + snapRise * 9;
          torsoLeanFwd = 14 - snapRise * 8;
          torsoYaw = -snapRise * 0.45;
          headPitchZ = -6 + snapRise * 6;
          rHandLocal = { fwd: 20 - snapRise * 28, side: 4 + snapRise * 20, up: 40 + snapRise * 8 };
          lHandLocal = { fwd: 20 - snapRise * 6, side: -4 - snapRise * 10, up: 38 + snapRise * 2 };
          swordTipLocal = { fwd: 20 - snapRise * 85, side: snapRise * 68, up: snapRise * 28 };
          if (riseT < 0.75) activeSlashArc = { type: 'horizontal', prog: riseT / 0.75 };
        }
      } else if (this.finalMechPhase === 'dash_windup') {
        crouchZ = -13;
        torsoLeanFwd = 15;
        torsoYaw = -0.9;
        rHandLocal = { fwd: -18, side: 26, up: 36 };
        lHandLocal = { fwd: 14, side: -16, up: 40 };
        swordTipLocal = { fwd: -92, side: 78, up: 22 };
        bladeDraggingOnFloor = true;
      } else if (this.finalMechPhase === 'dash_counter') {
        // Poised 0.75s Counter Stance!
        const tremor = Math.sin(time * 22) * 1.5;
        crouchZ = -9;
        torsoLeanFwd = 10;
        torsoYaw = -0.65;
        rHandLocal = { fwd: -8, side: 24, up: 56 + tremor };
        lHandLocal = { fwd: 18, side: -18, up: 46 };
        swordTipLocal = { fwd: -48, side: 82, up: 124 + tremor };
      } else if (this.finalMechPhase === 'grab_wipe') {
        const p = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 1.45))));
        if (p < 0.62) {
          crouchZ = 6;
          torsoLeanFwd = -6;
          headPitchZ = 7;
          lHandLocal = { fwd: 34, side: -6, up: 82 };
          rHandLocal = { fwd: 12, side: 20, up: 76 };
          swordTipLocal = { fwd: -24, side: 42, up: 165 };
        } else {
          crouchZ = -18;
          torsoLeanFwd = 16;
          headPitchZ = -8;
          lHandLocal = { fwd: 36, side: -4, up: 16 };
          rHandLocal = { fwd: 24, side: 14, up: 32 };
          swordTipLocal = { fwd: 32, side: 12, up: 0 };
        }
      } else if (this.finalMechPhase === 'roar_qte_spirit_bomb' || this.finalMechPhase === 'spirit_bomb_wipe') {
        const maxT = this.finalMechMaxTimer || (this.finalMechPhase === 'spirit_bomb_wipe' ? 2.0 : 14.0);
        const p = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / maxT)));
        if (this.finalMechPhase === 'spirit_bomb_wipe') {
          // Unstaggered Wipe Animation: Vaelgor violently hurls both raised arms downward to slam the colossal Eclipse Spirit Bomb into the cathedral floor!
          const slamT = Math.min(1, p / 0.35);
          const snapSlam = 1 - Math.pow(1 - slamT, 3.8);
          crouchZ = 5 - snapSlam * 21;
          torsoLeanFwd = -8 + snapSlam * 24;
          headPitchZ = 10 - snapSlam * 18;
          lHandLocal = { fwd: 6 + snapSlam * 26, side: -24 + snapSlam * 10, up: 98 - snapSlam * 74 };
          rHandLocal = { fwd: 6 + snapSlam * 26, side: 24 - snapSlam * 10, up: 98 - snapSlam * 74 };
          swordTipLocal = { fwd: 22, side: 0, up: 0 };
        } else if (p < 0.10) {
          // Opening Ferocious Roar before raising arms into the Spirit Bomb stance
          const roarT = Math.sin((p / 0.10) * Math.PI);
          crouchZ = -12 * roarT;
          torsoLeanFwd = 16 * roarT;
          headPitchZ = 10 * roarT;
          lHandLocal = { fwd: -6, side: -28 - roarT * 10, up: 46 + roarT * 18 };
          rHandLocal = { fwd: -6, side: 28 + roarT * 10, up: 46 + roarT * 18 };
          swordTipLocal = { fwd: 22, side: 0, up: 0 };
        } else {
          // Iconic "Goku Spirit Bomb" Pose: Both hands raised wide and empty overhead channeling the colossal Eclipse Death Ball while the Greatsword stands planted in the stone in front of him!
          const tremor = Math.sin(time * 16) * 2.0;
          crouchZ = 5;
          torsoLeanFwd = -8;
          headPitchZ = 10;
          lHandLocal = { fwd: 6, side: -24, up: 98 + tremor };
          rHandLocal = { fwd: 6, side: 24, up: 98 + tremor };
          swordTipLocal = { fwd: 22, side: 0, up: 0 };
        }
      } else if (this.finalMechPhase === 'sword_absorb_cutscene') {
        const absProg = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 4.6))));
        if (absProg < 0.24) {
          // Act 1 (0.00 - 0.24): Stagger-Break Recovery & Ferocious Repulsion Roar blasting nearby players back!
          const roarEnv = Math.sin((absProg / 0.24) * Math.PI);
          crouchZ = -13 * roarEnv;
          torsoLeanFwd = 16 * roarEnv;
          headPitchZ = 11 * roarEnv;
          rHandLocal = { fwd: 10 - roarEnv * 18, side: 18 + roarEnv * 18, up: 42 + roarEnv * 14 };
          lHandLocal = { fwd: 10 - roarEnv * 18, side: -18 - roarEnv * 18, up: 40 + roarEnv * 14 };
          swordTipLocal = { fwd: -22 * roarEnv, side: 56 + roarEnv * 36, up: 24 + roarEnv * 28 };
        } else if (absProg < 0.82) {
          // Act 2 (0.24 - 0.82): Vaelgor grips his Greatsword with BOTH HANDS and sticks it STRAIGHT VERTICAL above his head as the Eclipse enters the blade and transforms his body!
          const liftT = Math.min(1, (absProg - 0.24) / 0.12);
          const snapLift = 1 - Math.pow(1 - liftT, 3.2);
          const tremor = Math.sin(time * 28) * 1.8;
          crouchZ = -13 * (1 - snapLift) + 8 * snapLift;
          torsoLeanFwd = 16 * (1 - snapLift) - 6 * snapLift;
          headPitchZ = 11 * snapLift;
          torsoYaw = 0;
          rHandLocal = {
            fwd: 10 * (1 - snapLift) + 4 * snapLift,
            side: 18 * (1 - snapLift) + 2.5 * snapLift,
            up: 42 + snapLift * 58 + tremor
          };
          lHandLocal = {
            fwd: 10 * (1 - snapLift) + 4 * snapLift,
            side: -18 * (1 - snapLift) - 2.5 * snapLift,
            up: 40 + snapLift * 55 + tremor
          };
          swordTipLocal = {
            fwd: 4 * snapLift,
            side: (1 - snapLift) * 40,
            up: 28 + snapLift * 192 + tremor
          };
        } else {
          // Act 3 (0.82 - 1.00): Empowered Sovereign Horizon Outburst Slash!
          const slashT = (absProg - 0.82) / 0.18;
          const snapSlash = 1 - Math.pow(1 - slashT, 3.5);
          const sweepAng = -1.65 + snapSlash * 3.25;
          crouchZ = 8 - snapSlash * 17;
          torsoLeanFwd = -6 + snapSlash * 18;
          torsoYaw = -1.1 + snapSlash * 2.2;
          headPitchZ = 11 - snapSlash * 11;
          rHandLocal = { fwd: Math.cos(sweepAng) * 28, side: Math.sin(sweepAng) * 28, up: 100 - snapSlash * 54 };
          lHandLocal = { fwd: Math.cos(sweepAng) * 24, side: Math.sin(sweepAng) * 24, up: 95 - snapSlash * 51 };
          swordTipLocal = { fwd: Math.cos(sweepAng) * 124, side: Math.sin(sweepAng) * 124, up: 220 - snapSlash * 178 };
          activeSlashArc = { type: 'horizontal', prog: snapSlash };
        }
      }
    } else if (this.state === 'final_clash_mechanic') {
      const p = Math.max(0, Math.min(1, 1.0 - (this.clashTimer / (this.clashMaxTimer || 3.0))));
      if (this.clashPhase === 'windup_circle') {
        // 3.0s Two-Handed Overhead Sword Lift (NO indicator on the boss!)
        const lift = Math.min(1, p / 0.25);
        const snapLift = 1 - Math.pow(1 - lift, 3.2);
        const tremor = Math.sin(time * 24) * 1.6;
        crouchZ = 6 * snapLift;
        torsoLeanFwd = -10 * snapLift;
        headPitchZ = 8 * snapLift;
        torsoYaw = 0;
        rHandLocal = { fwd: -6 * snapLift, side: 4, up: 44 + snapLift * 58 + tremor };
        lHandLocal = { fwd: -6 * snapLift, side: -4, up: 42 + snapLift * 55 + tremor };
        swordTipLocal = { fwd: -28 * snapLift, side: 0, up: 35 + snapLift * 182 + tremor };
      } else if (this.clashPhase === 'active_clash' || this.clashPhase === 'fail_wipe') {
        const mix = (a, b, t) => a + (b - a) * t;
        const mixV = (a, b, t) => ({ fwd: mix(a.fwd, b.fwd, t), side: mix(a.side, b.side, t), up: mix(a.up, b.up, t) });
        const mixP = (A, B, t) => ({
          crouch: mix(A.crouch, B.crouch, t), lean: mix(A.lean, B.lean, t), head: mix(A.head, B.head, t), yaw: mix(A.yaw, B.yaw, t),
          r: mixV(A.r, B.r, t), l: mixV(A.l, B.l, t), tip: mixV(A.tip, B.tip, t)
        });
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);
        const clamp01 = (t) => Math.max(0, Math.min(1, t));
        // Two-handed pose from a sweep angle (sword held out to one side, low)
        const sweepPose = (a, hi) => ({
          crouch: -13, lean: 12, head: -3, yaw: a * 0.55,
          r: { fwd: Math.cos(a) * 28, side: Math.sin(a) * 28, up: 42 + hi * 0.5 },
          l: { fwd: Math.cos(a - 0.1) * 25, side: Math.sin(a - 0.1) * 25, up: 40 + hi * 0.5 },
          tip: { fwd: Math.cos(a) * 104, side: Math.sin(a) * 104, up: 36 + hi }
        });
        // Keyframes. HIGH is the towering overhead hoist the camera looks up at.
        const HIGH = { crouch: 8, lean: -14, head: 9, yaw: 0, r: { fwd: -8, side: 4, up: 104 }, l: { fwd: -8, side: -4, up: 100 }, tip: { fwd: -36, side: 0, up: 252 } };
        const HIGHER = { crouch: 12, lean: -20, head: 12, yaw: 0, r: { fwd: -12, side: 4, up: 114 }, l: { fwd: -12, side: -4, up: 110 }, tip: { fwd: -44, side: 0, up: 292 } };
        const MID = { crouch: 0, lean: -4, head: 3, yaw: 0, r: { fwd: 8, side: 5, up: 80 }, l: { fwd: 8, side: -5, up: 78 }, tip: { fwd: 8, side: 0, up: 170 } };
        const PRESS = { crouch: -14, lean: 16, head: -4, yaw: 0.1, r: { fwd: 30, side: 6, up: 54 }, l: { fwd: 28, side: -6, up: 52 }, tip: { fwd: 74, side: -6, up: 42 } };
        const DRIVE = { crouch: -22, lean: 28, head: -12, yaw: 0.1, r: { fwd: 38, side: 5, up: 36 }, l: { fwd: 36, side: -5, up: 34 }, tip: { fwd: 104, side: 0, up: 6 } };
        const SLAM = { crouch: -24, lean: 30, head: -12, yaw: 0, r: { fwd: 36, side: 4, up: 18 }, l: { fwd: 34, side: -4, up: 16 }, tip: { fwd: 100, side: 0, up: 2 } };
        let pose = HIGH;
        let smoothRate = 24;

        if (this.clashPhase === 'fail_wipe') {
          // Fail: hoist the blade even higher while shadow gathers, then a cataclysmic slam.
          const e = this.clashWipeElapsed || 0;
          if (e < CLASH_WIPE_SLAM_T) {
            pose = mixP(HIGH, HIGHER, easeOut(clamp01(e / CLASH_WIPE_SLAM_T)));
            pose = mixP(pose, pose, 0);
            pose.tip = { fwd: pose.tip.fwd, side: pose.tip.side, up: pose.tip.up + Math.sin(time * 30) * 3 };
            smoothRate = 14;
          } else {
            pose = SLAM;
            smoothRate = 46;
          }
        } else if (this.clashIntroT > 0) {
          // OPENING HAYMAKER: coil back, ONE enormous swing that connects at CLASH_INTRO_IMPACT_P, lock, then hoist.
          const ip = clamp01(1 - this.clashIntroT / CLASH_INTRO_DUR);
          const COIL = sweepPose(1.55, 0);
          const LOCK = sweepPose(-0.05, 0);
          const impactP = CLASH_INTRO_IMPACT_P;
          const coilEnd = impactP * 0.56;
          const hoistStart = impactP + 0.16;
          if (ip < coilEnd) {
            pose = mixP(sweepPose(0, 0), COIL, easeOut(ip / coilEnd));
            smoothRate = 14;
          } else if (ip < impactP) {
            const s = (ip - coilEnd) / (impactP - coilEnd);
            pose = mixP(COIL, LOCK, s * s * s);
            activeSlashArc = { type: 'horizontal', prog: s };
            smoothRate = 60;
          } else if (ip < hoistStart) {
            pose = LOCK;
            pose = mixP(LOCK, LOCK, 0);
            pose.r = { fwd: pose.r.fwd + Math.sin(time * 48) * 1.6, side: pose.r.side, up: pose.r.up + Math.sin(time * 48) * 2 };
            smoothRate = 40;
          } else {
            pose = mixP(LOCK, HIGH, easeOut((ip - hoistStart) / (1 - hoistStart)));
            smoothRate = 12;
          }
        } else {
          // SWINGS: sword hoisted high (looks colossal), hangs, then accelerates down to land exactly at CLASH_CONTACT_PROG.
          const subP = clamp01(this.clashSubProgress || 0);
          const jolt = clamp01((this.clashParryJolt || 0) / 0.26);
          const style = this.clashCurrentStyle || 'overhead_crush';
          const tt = clamp01(subP / CLASH_CONTACT_PROG);
          const fall = Math.pow(tt, 2.4);
          let START = HIGH;
          let END = PRESS;
          if (style === 'follow_down') START = MID;
          else if (style === 'slash_left') { START = sweepPose(1.2, 84); END = sweepPose(-0.1, 0); }
          else if (style === 'slash_right') { START = sweepPose(-1.2, 84); END = sweepPose(0.1, 0); }
          else if (style === 'extinction_drive') { START = HIGHER; END = DRIVE; }
          pose = mixP(START, END, fall);
          if (tt < 1) {
            // Hanging tremor: the blade trembles while it is held up, calming as it falls.
            const tre = Math.sin(time * 26) * 2.2 * (1 - tt);
            pose.tip.up += tre;
            pose.r.up += tre * 0.4;
            pose.l.up += tre * 0.4;
            if ((style === 'slash_left' || style === 'slash_right') && tt > 0.35) activeSlashArc = { type: 'horizontal', prog: clamp01((tt - 0.35) / 0.65) };
            smoothRate = tt > 0.6 ? 40 : 18;
          } else {
            // Blades locked: grinding shudder, held until the press
            const sh = Math.sin(time * 48) * 2.0;
            pose.tip.up += sh;
            pose.r.fwd += sh * 0.5;
            smoothRate = 40;
          }
          // Successful parry: the blade is knocked back up a little
          pose.tip = { fwd: pose.tip.fwd - jolt * 16, side: pose.tip.side, up: pose.tip.up + jolt * 30 };
        }

        // Frame-rate independent smoothing so beat-to-beat pose changes read as motion, not pops.
        const nowMs = performance.now();
        const prev = this._clashPose;
        if (!prev || nowMs - prev.t > 250) {
          this._clashPose = { t: nowMs, pose: pose };
        } else {
          const k = 1 - Math.exp(-((nowMs - prev.t) / 1000) * smoothRate);
          this._clashPose = { t: nowMs, pose: mixP(prev.pose, pose, k) };
        }
        const sm = this._clashPose.pose;
        crouchZ = sm.crouch;
        torsoLeanFwd = sm.lean;
        headPitchZ = sm.head;
        torsoYaw = sm.yaw;
        rHandLocal = sm.r;
        lHandLocal = sm.l;
        swordTipLocal = sm.tip;
      }
    } else if (this.state === 'pattern_final_eclipse_judgment') {
      const p = 1.0 - (this.stateTimer / (this.stateDuration || 3.2));
      const pulse = Math.sin(time * 18) * 2;
      crouchZ = -12;
      torsoLeanFwd = 8;
      rHandLocal = { fwd: 20, side: 5, up: 44 + pulse };
      lHandLocal = { fwd: 20, side: -5, up: 42 + pulse };
      swordTipLocal = { fwd: 20, side: 0, up: 0 };
      if (p > 0.52 && p < 0.84) {
        crouchZ = 6;
        rHandLocal = { fwd: 10, side: 6, up: 92 };
        lHandLocal = { fwd: 10, side: -6, up: 88 };
        swordTipLocal = { fwd: 6, side: 0, up: 186 };
      }
    } else if (this.state === 'pattern_final_trinity_slash') {
      const p = 1.0 - (this.stateTimer / (this.stateDuration || 2.85));
      const localT = (p * 3) % 1;
      const snap = 1 - Math.pow(1 - localT, 3.5);
      const dir = (Math.floor(p * 3) % 2 === 0) ? 1 : -1;
      const sweepAng = dir * (-1.65 + snap * 3.3);
      crouchZ = -10;
      torsoLeanFwd = 12;
      torsoYaw = dir * (-1.1 + snap * 2.2);
      rHandLocal = { fwd: Math.cos(sweepAng) * 30, side: Math.sin(sweepAng) * 30, up: 44 };
      lHandLocal = { fwd: Math.cos(sweepAng) * 26, side: Math.sin(sweepAng) * 26, up: 42 };
      swordTipLocal = { fwd: Math.cos(sweepAng) * 124, side: Math.sin(sweepAng) * 124, up: 40 };
      activeSlashArc = { type: 'horizontal', prog: snap };
    } else if (this.state === 'pattern_final_oblivion_singularity') {
      const p = 1.0 - (this.stateTimer / (this.stateDuration || 3.4));
      if (p < 0.78) {
        const pulse = Math.sin(time * 20) * 2.5;
        crouchZ = 6;
        torsoLeanFwd = -6;
        headPitchZ = 7;
        rHandLocal = { fwd: 10, side: 6, up: 94 + pulse };
        lHandLocal = { fwd: 10, side: -6, up: 90 + pulse };
        swordTipLocal = { fwd: 6, side: 0, up: 194 + pulse };
      } else {
        crouchZ = -16;
        torsoLeanFwd = 12;
        rHandLocal = { fwd: 22, side: 5, up: 36 };
        lHandLocal = { fwd: 22, side: -5, up: 34 };
        swordTipLocal = { fwd: 24, side: 0, up: 0 };
      }
    } else if (this.state === 'pattern_final_cataclysm_rain') {
      const p = 1.0 - (this.stateTimer / (this.stateDuration || 3.5));
      if (p < 0.72) {
        crouchZ = 8;
        torsoLeanFwd = -8;
        rHandLocal = { fwd: 6, side: 8, up: 96 };
        lHandLocal = { fwd: 6, side: -8, up: 92 };
        swordTipLocal = { fwd: -10, side: 0, up: 192 };
      } else {
        crouchZ = -16;
        torsoLeanFwd = 14;
        rHandLocal = { fwd: 24, side: 5, up: 36 };
        lHandLocal = { fwd: 24, side: -5, up: 34 };
        swordTipLocal = { fwd: 26, side: 0, up: 0 };
      }
    } else if (this.state === 'staggered') {
      const heave = Math.sin(time * 4) * 1.5;
      crouchZ = -15 + heave; torsoLeanFwd = 10; headPitchZ = -7;
      rHandLocal = { fwd: 16, side: 18, up: 26 + heave };
      lHandLocal = { fwd: 12, side: -14, up: 18 + heave };
      swordTipLocal = { fwd: 42, side: 38, up: 0 };
    }

    // Project Natural Hit-Impulse into Vaelgor's Local Forward/Side Space so his upper body visibly absorbs hits!
    const impLocalFwd = this.recoilX * cosA + this.recoilY * sinA;
    const impLocalSide = -this.recoilX * sinA + this.recoilY * cosA;

    // Compute 3D Joint Coordinates
    const pelvisUp = 43 + crouchZ + this.pelvisBounceZ;
    const pelvis3D = this.localToWorld(impLocalFwd * 0.35, weightShiftSide + impLocalSide * 0.35, pelvisUp);
    const lHip3D = this.localToWorld(-strideDiff * 2.5 + impLocalFwd * 0.25, weightShiftSide - this.hipWidth + impLocalSide * 0.25, pelvisUp - 2);
    const rHip3D = this.localToWorld(strideDiff * 2.5 + impLocalFwd * 0.25, weightShiftSide + this.hipWidth + impLocalSide * 0.25, pelvisUp - 2);

    // Hard safety clamp on foot world offsets before projecting ankles so network sync or abrupt teleports never stretch legs
    const maxFootOffset = 30;
    const lFootDx = this.leftFoot.x - this.x, lFootDy = this.leftFoot.y - this.y;
    const lFootDist = Math.hypot(lFootDx, lFootDy);
    if (lFootDist > maxFootOffset) {
      this.leftFoot.x = this.x + (lFootDx / lFootDist) * maxFootOffset;
      this.leftFoot.y = this.y + (lFootDy / lFootDist) * maxFootOffset;
    }
    const rFootDx = this.rightFoot.x - this.x, rFootDy = this.rightFoot.y - this.y;
    const rFootDist = Math.hypot(rFootDx, rFootDy);
    if (rFootDist > maxFootOffset) {
      this.rightFoot.x = this.x + (rFootDx / rFootDist) * maxFootOffset;
      this.rightFoot.y = this.y + (rFootDy / rFootDist) * maxFootOffset;
    }

    const lAnkle3D = this.worldOffsetToScreen(this.leftFoot.x - this.x, this.leftFoot.y - this.y, this.leftFoot.z + 4.5);
    const rAnkle3D = this.worldOffsetToScreen(this.rightFoot.x - this.x, this.rightFoot.y - this.y, this.rightFoot.z + 4.5);
    const lKnee3D = this.solveLegIK(lHip3D, lAnkle3D, -1);
    const rKnee3D = this.solveLegIK(rHip3D, rAnkle3D, 1);

    const chestUp = pelvisUp + 20 + breatheZ;
    const chest3D = this.localToWorld(torsoLeanFwd + impLocalFwd * 0.85, weightShiftSide * 0.7 + impLocalSide * 0.85, chestUp);
    const neck3D = this.localToWorld(torsoLeanFwd + 1.5 + impLocalFwd, weightShiftSide * 0.5 + impLocalSide, chestUp + 9.5);
    const head3D = this.localToWorld(torsoLeanFwd + 3.0 + impLocalFwd * 1.15, weightShiftSide * 0.4 + impLocalSide * 1.15, chestUp + 17 + headPitchZ);

    const shoulderSpan = 20.0;
    const lShoulderLocalFwd = torsoLeanFwd + impLocalFwd * 0.9 - Math.sin(torsoYaw) * (-shoulderSpan);
    const lShoulderLocalSide = weightShiftSide * 0.6 + impLocalSide * 0.9 + Math.cos(torsoYaw) * (-shoulderSpan);
    const rShoulderLocalFwd = torsoLeanFwd + impLocalFwd * 0.9 - Math.sin(torsoYaw) * (shoulderSpan);
    const rShoulderLocalSide = weightShiftSide * 0.6 + impLocalSide * 0.9 + Math.cos(torsoYaw) * (shoulderSpan);

    const lShoulder3D = this.localToWorld(lShoulderLocalFwd, lShoulderLocalSide, chestUp + 5 + this.pauldronLagZ * 0.25);
    const rShoulder3D = this.localToWorld(rShoulderLocalFwd, rShoulderLocalSide, chestUp + 5 + this.pauldronLagZ * 0.25);

    const S = this.modelScale || 1.62;
    // Record exact world-space positions of both shoulders (accounting for facingAngle, torsoYaw, and modelScale) for positional Pauldron Hitscan!
    this.leftShoulderWorld = {
      x: this.x + lShoulder3D.wx * S,
      y: this.y + lShoulder3D.wy * PERSPECTIVE_TILT * S,
      sx: this.x + (lShoulder3D.sx - this.x) * S,
      sy: this.y + (lShoulder3D.sy - this.y) * S
    };
    this.rightShoulderWorld = {
      x: this.x + rShoulder3D.wx * S,
      y: this.y + rShoulder3D.wy * PERSPECTIVE_TILT * S,
      sx: this.x + (rShoulder3D.sx - this.x) * S,
      sy: this.y + (rShoulder3D.sy - this.y) * S
    };

    const lHand3D = this.localToWorld(lHandLocal.fwd + impLocalFwd * 0.6, lHandLocal.side + impLocalSide * 0.6, lHandLocal.up + crouchZ * 0.6);
    const rHand3D = this.localToWorld(rHandLocal.fwd + impLocalFwd * 0.6, rHandLocal.side + impLocalSide * 0.6, rHandLocal.up + crouchZ * 0.6);

    const lElbow3D = this.localToWorld((lShoulderLocalFwd + lHandLocal.fwd) * 0.5 - 5, (lShoulderLocalSide + lHandLocal.side) * 0.5 - 8, (chestUp + 5 + lHandLocal.up + crouchZ * 0.6) * 0.5 - 4);
    const rElbow3D = this.localToWorld((rShoulderLocalFwd + rHandLocal.fwd) * 0.5 - 5, (rShoulderLocalSide + rHandLocal.side) * 0.5 + 8, (chestUp + 5 + rHandLocal.up + crouchZ * 0.6) * 0.5 - 4);

    const isSpiritBombHandsFree = (
      this.state === 'final_phase_mechanic' &&
      (this.finalMechPhase === 'roar_qte_spirit_bomb' || this.finalMechPhase === 'spirit_bomb_wipe')
    );
    const isVerticalSwordAbsorb = (
      this.state === 'final_phase_mechanic' &&
      this.finalMechPhase === 'sword_absorb_cutscene' &&
      (1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 4.6))) >= 0.24 &&
      (1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 4.6))) < 0.82
    );
    const swordAnchor3D = isSpiritBombHandsFree
      ? this.localToWorld(22, 0, 56)
      : (isVerticalSwordAbsorb
        ? {
            wx: (rHand3D.wx + lHand3D.wx) * 0.5,
            wy: (rHand3D.wy + lHand3D.wy) * 0.5,
            up: (rHand3D.up + lHand3D.up) * 0.5,
            sx: (rHand3D.sx + lHand3D.sx) * 0.5,
            sy: (rHand3D.sy + lHand3D.sy) * 0.5,
            depth: Math.max(rHand3D.depth, lHand3D.depth)
          }
        : rHand3D);
    const rawSwordTip3D = this.localToWorld(swordTipLocal.fwd, swordTipLocal.side, swordTipLocal.up);
    const rawDx = isVerticalSwordAbsorb ? 0 : (rawSwordTip3D.sx - swordAnchor3D.sx);
    const rawDy = isVerticalSwordAbsorb ? -1 : (rawSwordTip3D.sy - swordAnchor3D.sy);
    const rawScreenLen = Math.hypot(rawDx, rawDy) || 1;
    const isHorizonImpaled = (
      this.state === 'horizon_mechanic' &&
      this.horizonPhase === 'show_memory' &&
      this.horizonOrbitShifts &&
      this.horizonOrbitShifts[this.horizonSlashIndex] === 'opposite' &&
      (1.0 - (this.horizonTimer / (this.horizonMaxTimer || 1.50))) >= 0.36
    );
    const arenaCutProg = (this.state === 'final_phase_mechanic' && this.finalMechPhase === 'arena_cutscene')
      ? (1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 3.8)))
      : 0;
    const isPlantedState = (
      isHorizonImpaled ||
      isSpiritBombHandsFree ||
      (this.state === 'intro_cutscene' && this.patStep === 1) ||
      (this.state === 'eclipse_mechanic' && this.eclipsePhase === 'channel') ||
      (this.state === 'final_phase_mechanic' && this.finalMechPhase === 'arena_cutscene' && arenaCutProg >= 0.38 && arenaCutProg < 0.78) ||
      (this.state === 'pattern_final_eclipse_judgment' && !this.judgmentHit1) ||
      (this.state === 'pat_graveyard' && this.patStep === 0) ||
      (this.state === 'pat_cross_judgment' && this.patStep >= 1) ||
      (this.state === 'pat_thaemine_pizza' && this.patStep >= 3) ||
      (this.state === 'pat_abyssal_vortex' && (this.patStep === 0 || this.patStep >= 2)) ||
      (this.state === 'pat_eclipse_blender' && this.patStep >= 5)
    );
    const targetBladeLen = isVerticalSwordAbsorb ? 102 : (isPlantedState ? Math.max(48, rawScreenLen) : Math.max(88, rawScreenLen));
    const swordTip3D = {
      wx: rawSwordTip3D.wx, wy: rawSwordTip3D.wy, up: rawSwordTip3D.up,
      sx: swordAnchor3D.sx + (rawDx / rawScreenLen) * targetBladeLen,
      sy: swordAnchor3D.sy + (rawDy / rawScreenLen) * targetBladeLen,
      depth: rawSwordTip3D.depth
    };

    const tipWorldX = this.x + (swordTip3D.sx - this.x) * S;
    const tipWorldY = this.y + (swordTip3D.sy - this.y) * S;

    // Draw menacing crimson targeting beam from Vaelgor's pointed sword tip to the hunted player during Sword of Damocles!
    if (this.state === 'pat_damocles' && this.damoclesTarget && this.damoclesTarget.hp > 0) {
      ctx.save();
      const pulse = 0.6 + Math.sin(time * 16) * 0.35;
      ctx.strokeStyle = `rgba(244, 63, 94, ${pulse})`;
      ctx.lineWidth = 2.8;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(tipWorldX, tipWorldY);
      ctx.lineTo(this.damoclesTarget.x, this.damoclesTarget.y - 28);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(tipWorldX, tipWorldY, 7 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (bladeDraggingOnFloor && window.fx) {
      // Time-throttled (not per drawn frame): at 144Hz this used to spawn ~2.4x the scorch marks/sparks
      // and create Web Audio nodes ~30x per second.
      const nowMs = performance.now();
      if (!this.lastTipWorld) {
        this.lastTipWorld = { x: tipWorldX, y: tipWorldY };
        this._nextScorchAt = nowMs;
      }
      if (nowMs >= (this._nextScorchAt || 0)) {
        this._nextScorchAt = nowMs + 33;
        window.fx.addScorchSegment(this.lastTipWorld.x, this.lastTipWorld.y, tipWorldX, tipWorldY, this.awakened);
        this.lastTipWorld.x = tipWorldX;
        this.lastTipWorld.y = tipWorldY;
      }
      if (nowMs >= (this._nextDragSparkAt || 0)) {
        this._nextDragSparkAt = nowMs + 26;
        window.fx.addDragSparks(tipWorldX, tipWorldY, this.moveAngle, 1, this.awakened);
      }
      if (nowMs >= (this._nextScrapeSfxAt || 0)) {
        this._nextScrapeSfxAt = nowMs + 120;
        audio.playScrapeSpark();
      }
    } else {
      this.lastTipWorld = null;
    }

    this.swordTrail.push(rHand3D.sx, rHand3D.sy, swordTip3D.sx, swordTip3D.sy);

    // Scale Vaelgor's entire 2.5D articulated rig, gothic armor, cape, plume, and colossal greatsword around his ground anchor (1.62x towering raid boss!)
    ctx.save();
    ctx.globalAlpha = modelAlpha;
    ctx.translate(this.x, this.y);
    ctx.scale(S, S);
    ctx.translate(-this.x, -this.y);

    this.drawGroundShadowAndAura(ctx, time);

    // Depth-sorted painter's queue in preallocated slots (no per-frame closures/objects).
    // Part ids: 0 cape, 1/2 legs, 3 pelvis, 4 cuirass, 5/6 arms, 7/8 pauldrons, 9 helm, 10 greatsword.
    if (!this._renderSlots) {
      this._renderSlots = [];
      for (let i = 0; i < 11; i++) this._renderSlots.push({ part: i, depth: 0 });
      this._renderOrder = this._renderSlots.slice();
    }
    const slots = this._renderSlots;
    slots[0].depth = chest3D.depth - Math.sin(this.facingAngle) * 18;
    slots[1].depth = (lHip3D.depth + lKnee3D.depth + lAnkle3D.depth) / 3;
    slots[2].depth = (rHip3D.depth + rKnee3D.depth + rAnkle3D.depth) / 3;
    slots[3].depth = pelvis3D.depth + 1;
    slots[4].depth = chest3D.depth + 2;
    slots[5].depth = (lShoulder3D.depth + lElbow3D.depth + lHand3D.depth) / 3 + 2;
    slots[6].depth = (rShoulder3D.depth + rElbow3D.depth + rHand3D.depth) / 3 + 2;
    slots[7].depth = lShoulder3D.depth + 4;
    slots[8].depth = rShoulder3D.depth + 4;
    slots[9].depth = head3D.depth + 6;
    slots[10].depth = isVerticalSwordAbsorb ? (head3D.depth + 9) : (Math.max(rHand3D.depth, (rHand3D.depth + swordTip3D.depth) * 0.5) + 5);

    // Stable insertion sort from push order (matches the old Array.sort), skipping broken pauldrons.
    const order = this._renderOrder;
    let count = 0;
    for (let i = 0; i < 11; i++) {
      if ((i === 7 && this.leftPauldronBroken) || (i === 8 && this.rightPauldronBroken)) continue;
      const item = slots[i];
      let j = count - 1;
      while (j >= 0 && order[j].depth > item.depth) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = item;
      count++;
    }
    for (let i = 0; i < count; i++) {
      switch (order[i].part) {
        case 0: this.drawTatteredCape(ctx, time, lShoulder3D, rShoulder3D, neck3D); break;
        case 1: this.drawArticulatedLeg(ctx, lHip3D, lKnee3D, lAnkle3D, this.leftFoot, -1); break;
        case 2: this.drawArticulatedLeg(ctx, rHip3D, rKnee3D, rAnkle3D, this.rightFoot, 1); break;
        case 3: this.drawPelvisAndTassets(ctx, pelvis3D, lHip3D, rHip3D, lKnee3D, rKnee3D); break;
        case 4: this.drawGothicCuirass(ctx, pelvis3D, chest3D, neck3D, lShoulder3D, rShoulder3D, time); break;
        case 5: this.drawArticulatedArm(ctx, lShoulder3D, lElbow3D, lHand3D, -1); break;
        case 6: this.drawArticulatedArm(ctx, rShoulder3D, rElbow3D, rHand3D, 1); break;
        case 7: this.drawTieredPauldron(ctx, lShoulder3D, lElbow3D, -1); break;
        case 8: this.drawTieredPauldron(ctx, rShoulder3D, rElbow3D, 1); break;
        case 9: this.drawGreathelmAndPlume(ctx, neck3D, head3D, time); break;
        case 10: this.drawObsidianGreatsword(ctx, swordAnchor3D, lHand3D, swordTip3D, activeSlashArc, time); break;
      }
    }

    // Progressive Eclipse Body Metamorphosis Overlay (during Sword Absorption Cutscene & Final Phase Ascension!)
    if (this.state === 'final_phase_mechanic' && this.finalMechPhase === 'sword_absorb_cutscene' && (this.eclipseBodyTransformProg || 0) > 0.02) {
      const tp = this.eclipseBodyTransformProg;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Radiant Sovereign energy veins coursing from hands -> shoulders -> chest heart-core -> pelvis/legs!
      ctx.strokeStyle = `rgba(253, 224, 71, ${0.45 + tp * 0.50})`;
      ctx.lineWidth = 2.0 + tp * 1.4;
      ctx.beginPath();
      ctx.moveTo(swordAnchor3D.sx, swordAnchor3D.sy);
      ctx.lineTo(lShoulder3D.sx, lShoulder3D.sy);
      ctx.lineTo(chest3D.sx, chest3D.sy + 2);
      ctx.moveTo(swordAnchor3D.sx, swordAnchor3D.sy);
      ctx.lineTo(rShoulder3D.sx, rShoulder3D.sy);
      ctx.lineTo(chest3D.sx, chest3D.sy + 2);
      ctx.lineTo(pelvis3D.sx, pelvis3D.sy);
      ctx.lineTo(lKnee3D.sx, lKnee3D.sy);
      ctx.moveTo(pelvis3D.sx, pelvis3D.sy);
      ctx.lineTo(rKnee3D.sx, rKnee3D.sy);
      ctx.stroke();

      // Expanding Sovereign Eclipse Halo around Vaelgor's transforming chest & greathelm
      const bodyGlow = ctx.createRadialGradient(chest3D.sx, chest3D.sy, 4, chest3D.sx, chest3D.sy, 42 * tp + 12);
      bodyGlow.addColorStop(0, `rgba(254, 240, 138, ${0.75 * tp})`);
      bodyGlow.addColorStop(0.5, `rgba(192, 132, 252, ${0.55 * tp})`);
      bodyGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bodyGlow;
      ctx.beginPath();
      ctx.arc(chest3D.sx, chest3D.sy, 42 * tp + 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Subtle Super Armor Crimson Tenacity Ring when executing a Strong Pattern
    if (this.hasSuperArmor() && this.state !== 'eclipse_mechanic' && this.state !== 'horizon_mechanic' && this.state !== 'intro_cutscene') {
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.38)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(chest3D.sx, chest3D.sy, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Blue Counter-Flash Halo when in Counter Window!
    if (this.isCounterable()) {
      ctx.save();
      const pulse = 0.6 + Math.sin(time * 12) * 0.4;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(chest3D.sx, chest3D.sy, 46 + pulse * 8, 0, Math.PI * 2);
      // Layered strokes instead of a 28px shadowBlur (inside the boss' scaled model transform it was huge).
      fakeGlow(ctx, '#38bdf8', 22, 0.18);
      fakeGlow(ctx, '#38bdf8', 12, 0.35);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // Draw Overhead Eclipse Spirit Bomb, Sword Absorption Funnel, and Stagger Bar ON TOP of Vaelgor's body so it is never behind him!
    this.drawOverheadEclipseSpiritBomb(ctx, time, tipWorldX, tipWorldY);

    // Draw 3-Diamond Astral Step Counter above Vaelgor's Greathelm Plume during the 35% HP Clock Mechanic!
    // Neutral crimson/violet palette with ZERO directional arrows or color-coding spoilers!
    if (this.state === 'horizon_mechanic') {
      ctx.save();
      const sigilY = this.y - 168;
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.38)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(this.x - 36, sigilY);
      ctx.lineTo(this.x + 36, sigilY);
      ctx.stroke();

      for (let s = 0; s < 3; s++) {
        const px = this.x + (s - 1) * 36;
        const py = sigilY;
        const isCurrent = (s === this.horizonSlashIndex);
        const stepRevealed = (this.horizonPhase === 'solve_step') || (s <= this.horizonSlashIndex);
        const r = isCurrent ? 7.2 : 5.4;

        ctx.fillStyle = isCurrent
          ? '#f43f5e'
          : (stepRevealed ? '#c084fc' : 'rgba(15, 23, 42, 0.92)');
        ctx.strokeStyle = isCurrent ? '#ffffff' : (stepRevealed ? '#e9d5ff' : 'rgba(148, 163, 184, 0.55)');
        ctx.lineWidth = isCurrent ? 2.0 : 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r, py);
        ctx.lineTo(px, py + r);
        ctx.lineTo(px - r, py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // TELEGRAPHS, DIRECTIONAL CONES (BACK/FRONT INDICATORS), & ARMOR RENDERERS
  // -------------------------------------------------------------------------
  drawPatternTelegraphsAndEclipse(ctx, time) {
    // Subtle Multi-Player Aggro / Lock-On Reticle under the targeted player's feet
    if (this.activeTargetId && window.game && window.game.party) {
      const tgt = window.game.party.find(p => p.id === this.activeTargetId && p.hp > 0);
      const isLockOnPattern = (
        this.state === 'pat_damocles' ||
        this.state === 'pat_dreadnought' ||
        this.state === 'pat_guillotine' ||
        this.state === 'pat_world_cleaver' ||
        this.state === 'pat_phantom_flurry' ||
        this.state === 'pat_blood_rain' ||
        this.state === 'pat_eclipse_blender'
      );
      if (tgt && (window.game.party.length > 1 || isLockOnPattern)) {
        ctx.save();
        if (this.state === 'pat_damocles') {
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(this.x, this.y - 32);
          ctx.lineTo(tgt.x, tgt.y - 24);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.translate(tgt.x, tgt.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(time * 1.4);
        ctx.strokeStyle = isLockOnPattern ? 'rgba(244, 63, 94, 0.78)' : 'rgba(244, 63, 94, 0.36)';
        ctx.lineWidth = isLockOnPattern ? 2.4 : 1.6;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, isLockOnPattern ? 34 : 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Basic / Core Pattern Telegraphs (Uppercut, Cleave, Thrust — Red Danger Zones)
    if (this.state === 'uppercut') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.46) {
        const prog = p / 0.46;
        const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
        const fxX = this.x + cosA * 91;
        const fxY = this.y + sinA * 91 * PERSPECTIVE_TILT;
        ctx.save();
        ctx.translate(fxX, fxY);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.16)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 94, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(244, 63, 94, 0.30)';
        ctx.beginPath();
        ctx.arc(0, 0, 94 * prog, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (this.state === 'cleave') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.36) {
        const prog = p / 0.36;
        const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
        const hx = this.x + cosA * 38, hy = this.y + sinA * 38 * PERSPECTIVE_TILT;
        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.16)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 114, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(244, 63, 94, 0.30)';
        ctx.beginPath();
        ctx.arc(0, 0, 114 * prog, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (this.state === 'thrust') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.46) {
        const prog = p / 0.46;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(this.facingAngle);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(0, -44, 150, 88);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.fillRect(0, -44, 150 * prog, 88);
        ctx.restore();
      }
    }

    if (this.state === 'pat_guillotine') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p >= 0.22 && p < 0.35) {
        // 360° Vortex Spin Telegraph
        const prog = (p - 0.22) / 0.13;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 125, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.beginPath();
        ctx.arc(0, 0, 125 * prog, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p >= 0.50 && p < 0.84) {
        const prog = (p - 0.50) / 0.34;
        ctx.save();
        ctx.translate(this.leapTargetX, this.leapTargetY);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.22)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 94, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(244, 63, 94, 0.38)';
        ctx.beginPath();
        ctx.arc(0, 0, 94 * prog, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (this.state === 'pat_mirage') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.68) {
        const segStart = p < 0.24 ? 0 : (p < 0.46 ? 0.24 : 0.46);
        const segDur = p < 0.24 ? 0.24 : 0.22;
        const subProg = Math.max(0, Math.min(1, (p - segStart) / segDur));
        const dist = p < 0.24 ? 165 : (p < 0.46 ? 175 : 160);
        const ang = this.mirageDashAng !== undefined ? this.mirageDashAng : this.facingAngle;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(0, -44, dist + 25, 88);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.fillRect(0, -44, (dist + 25) * subProg, 88);
        ctx.restore();
      }
    }

    if (this.state === 'pat_graveyard') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p > 0.25 && p < 0.74) {
        const subProg = (p - 0.25) / 0.49;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);

        // Outer Ring Danger Annulus (r = 92 to 220 is RED danger; inner r < 92 is unhighlighted safe floor!)
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.beginPath();
        ctx.arc(0, 0, 220, 0, Math.PI * 2, false);
        ctx.arc(0, 0, 92, 0, Math.PI * 2, true);
        ctx.fill('evenodd');

        // Expanding red charge fill inside the danger annulus
        const curOuter = 92 + (220 - 92) * subProg;
        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.beginPath();
        ctx.arc(0, 0, curOuter, 0, Math.PI * 2, false);
        ctx.arc(0, 0, 92, 0, Math.PI * 2, true);
        ctx.fill('evenodd');

        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 92, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 220, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Dreadnought Charge Corridor Telegraph (Red ground danger zone; Vaelgor's body flashes Blue for Counter)
    if (this.state === 'pat_dreadnought') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.38) {
        const fillProg = p / 0.38;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(this.baseFacing);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(0, -52, 285, 104);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.fillRect(0, -52, 285 * fillProg, 104);
        ctx.restore();
      }
    }

    // Crimson Cross-Rift Judgment Telegraph (+ then ×, both consistent Red danger zones)
    if (this.state === 'pat_cross_judgment') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      const isCardinal = p < 0.44;
      const isDiag = p >= 0.44 && p < 0.78;
      if (isCardinal || isDiag) {
        const subProg = isCardinal ? (p / 0.44) : ((p - 0.44) / 0.34);
        const angles = isCardinal
          ? [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]
          : [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        for (const ang of angles) {
          ctx.save();
          ctx.rotate(ang);
          ctx.fillStyle = 'rgba(225, 29, 72, 0.20)';
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(30, -34, 240, 68);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.34)';
          ctx.fillRect(30, -34, 240 * subProg, 68);
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // PATTERN 7 Telegraph (Thaemine G4 Style): World-Cleaver Split (Center Line -> Twin Flanking Lanes, no safe-lane highlight!)
    if (this.state === 'pat_world_cleaver') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1, PERSPECTIVE_TILT);
      ctx.rotate(this.baseFacing);
      if (p < 0.44) {
        const subProg = p / 0.44;
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.4;
        ctx.strokeRect(0, -60, 520, 120);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.34)';
        ctx.fillRect(0, -60, 520 * subProg, 120);
      } else if (p < 0.78) {
        const subProg = (p - 0.44) / 0.34;
        // Only the two flanking danger lanes are highlighted in red; the middle is naturally unhighlighted!
        for (const side of [-1, 1]) {
          const yOff = side * 115 - 54;
          ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.4;
          ctx.strokeRect(0, yOff, 520, 108);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.34)';
          ctx.fillRect(0, yOff, 520 * subProg, 108);
        }
      }
      ctx.restore();
    }

    // PATTERN 8 Telegraph (Thaemine G4 Style): 240° Crescent Sweep -> 180° Backhand Pivot -> Tectonic Ring
    if (this.state === 'pat_thaemine_pizza') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1, PERSPECTIVE_TILT);
      if (p < 0.36) {
        const subProg = p / 0.36;
        const halfArc = (Math.PI * 2) / 3; // 120° each side = 240° total
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 225, this.baseFacing - halfArc, this.baseFacing + halfArc);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 225 * subProg, this.baseFacing - halfArc, this.baseFacing + halfArc);
        ctx.closePath();
        ctx.fill();
      } else if (p < 0.64) {
        const subProg = (p - 0.36) / 0.28;
        const rearCenter = this.baseFacing + Math.PI;
        const halfArc = Math.PI * 0.56;
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 215, rearCenter - halfArc, rearCenter + halfArc);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.34)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 215 * subProg, rearCenter - halfArc, rearCenter + halfArc);
        ctx.closePath();
        ctx.fill();
      } else if (p < 0.88) {
        const subProg = (p - 0.64) / 0.24;
        ctx.fillStyle = 'rgba(225, 29, 72, 0.20)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 118, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(244, 63, 94, 0.36)';
        ctx.beginPath();
        ctx.arc(0, 0, 118 * subProg, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // PATTERN 9 Telegraph (Thaemine G4 Style): Abyssal Blink Counter-Dash + 4-Hit Cross-Slash Flurry
    if (this.state === 'pat_phantom_flurry') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p < 0.31) {
        const subProg = p / 0.31;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(this.facingAngle);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(0, -40, 210, 80);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.fillRect(0, -40, 210 * subProg, 80);
        ctx.restore();
      }
    }

    // PATTERN 10 Telegraph: Abyssal Gravity Vortex (0.00 - 0.50 Inner Nova Circle -> 0.50 - 0.84 Outer Donut Ring!)
    if (this.state === 'pat_abyssal_vortex') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1, PERSPECTIVE_TILT);
      if (p < 0.50) {
        const subProg = p / 0.50;
        // Swirling gravity pull rings + expanding inner red danger circle (r = 148)
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.42)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([10, 8]);
        const pullRad = 260 * (1.0 - ((time * 1.6) % 1.0));
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(25, pullRad), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(225, 29, 72, 0.20)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 148, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.36)';
        ctx.beginPath();
        ctx.arc(0, 0, 148 * subProg, 0, Math.PI * 2);
        ctx.fill();
      } else if (p < 0.84) {
        const subProg = (p - 0.50) / 0.34;
        // Outer Donut Danger Annulus (r = 136 to 290 is RED danger; inner r < 136 is unhighlighted safe floor!)
        ctx.fillStyle = 'rgba(225, 29, 72, 0.20)';
        ctx.beginPath();
        ctx.arc(0, 0, 290, 0, Math.PI * 2, false);
        ctx.arc(0, 0, 136, 0, Math.PI * 2, true);
        ctx.fill('evenodd');

        const curOuter = 136 + (290 - 136) * subProg;
        ctx.fillStyle = 'rgba(244, 63, 94, 0.36)';
        ctx.beginPath();
        ctx.arc(0, 0, curOuter, 0, Math.PI * 2, false);
        ctx.arc(0, 0, 136, 0, Math.PI * 2, true);
        ctx.fill('evenodd');

        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 136, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 290, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // HARD echo ring telegraph (fills in, then flashes when it lands)
    if (this.hardEchoes) {
      for (const e of this.hardEchoes) {
        if (e.silent && !e.fired) continue;
        const f = Math.min(1, e.t / e.delay);
        ctx.save();
        ctx.translate(e.x, e.y); ctx.scale(1, PERSPECTIVE_TILT);
        if (!e.fired) {
          ctx.fillStyle = `rgba(168, 85, 247, ${0.10 + 0.10 * f})`;
          ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(192, 132, 252, 0.30)';
          ctx.beginPath(); ctx.arc(0, 0, e.r * f, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 2.4; ctx.setLineDash([9, 7]);
          ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(233, 213, 255, ${0.5 * (1 - (e.t - e.delay) / 0.35)})`;
          ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }

    // PATTERN 11 Telegraph: Crimson Backstep Slash + Counterable Piercing Lunge Corridor
    if (this.state === 'pat_blood_rain') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      if (p >= 0.62 && p < 0.85) {
        const subProg = (p - 0.62) / 0.23;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(this.baseFacing);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.20)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.4;
        ctx.strokeRect(0, -54, 345, 108);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
        ctx.fillRect(0, -54, 345 * subProg, 108);
        ctx.restore();
      }
    }

    // PATTERN 12 Telegraph: Obsidian Blender Hurricane (Whirlwind Radius + 4-Way Diagonal X-Rupture Finisher)
    if (this.state === 'pat_eclipse_blender') {
      const p = 1.0 - (this.stateTimer / this.stateDuration);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1, PERSPECTIVE_TILT);
      if (p < 0.26) {
        const subProg = p / 0.26;
        ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, 122, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(244, 63, 94, 0.34)';
        ctx.beginPath();
        ctx.arc(0, 0, 122 * subProg, 0, Math.PI * 2);
        ctx.fill();
      } else if (p < 0.76) {
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, 122, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (p < 0.86) {
        const subProg = (p - 0.76) / 0.10;
        const diagAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
        for (const ang of diagAngles) {
          ctx.save();
          ctx.rotate(ang);
          ctx.fillStyle = 'rgba(225, 29, 72, 0.20)';
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(0, -38, 255, 76);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.36)';
          ctx.fillRect(0, -38, 255 * subProg, 76);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 55% HP RAID MECHANIC TELEGRAPH: "ECHOING IAIDO — PHANTOM AMBUSH"
    // Ambush Counter Slice Zone & Lower-Level Grab Stagger Bar Under Boss Model!
    if (this.state === 'iaido_mechanic') {
      if (this.iaidoPhase === 'ambush_counter') {
        const subProg = Math.max(0, Math.min(1, 1.0 - (this.iaidoTimer / (this.iaidoMaxTimer || 1.28))));
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(this.facingAngle);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.20)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.6;
        ctx.strokeRect(0, -38, 138, 76);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.36)';
        ctx.fillRect(0, -38, 138 * subProg, 76);
        ctx.restore();
      } else if (this.iaidoPhase === 'grab_stagger') {
        // Crimson Abyssal Chains pinning the grabbed player in front of Vaelgor
        const pinX = this.x + Math.cos(this.facingAngle) * 64;
        const pinY = this.y + Math.sin(this.facingAngle) * 64 * PERSPECTIVE_TILT;
        ctx.save();
        ctx.translate(pinX, pinY);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.fillStyle = 'rgba(225, 29, 72, 0.24)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Lower-Level Mechanic Stagger Bar directly under Vaelgor's model/feet!
        const sw = 138, sh = 10;
        const sx = this.x - sw * 0.5;
        const sy = this.y + 46;
        const remFrac = Math.max(0, Math.min(1, this.iaidoStaggerCheck / (this.iaidoStaggerCheckMax || 165)));
        const timeFrac = Math.max(0, Math.min(1, this.iaidoTimer / (this.iaidoMaxTimer || 3.8)));

        ctx.save();
        ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
        ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 6);

        // Golden Stagger Check Gauge
        ctx.fillStyle = '#facc15';
        ctx.fillRect(sx, sy, sw * remFrac, sh);

        // Thin Crimson Time-Remaining Sub-Bar right underneath
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(sx, sy + sh + 1, sw * timeFrac, 3);

        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(sx - 1, sy - 1, sw + 2, sh + 6);
        ctx.restore();
      }
    }

    // 35% HP RAID PUZZLE TELEGRAPH: "CONSTELLATION OF THE ECLIPSE CLOCK" (Purely Physical Sword & Body Tells)
    if (this.state === 'horizon_mechanic') {
      if (!this.horizonObelisks || this.horizonObelisks.length < 4) {
        this.horizonObelisks = this.buildHorizonObelisks();
      }
      const subProg = Math.max(0, Math.min(1, 1.0 - (this.horizonTimer / (this.horizonMaxTimer || 1.50))));
      const activeMemoryObIdx = (this.horizonSequence && this.horizonSequence[this.horizonSlashIndex] !== undefined)
        ? this.horizonSequence[this.horizonSlashIndex]
        : 0;
      const activeOb = this.horizonObelisks[activeMemoryObIdx] || this.horizonObelisks[0];
      const currentShiftType = this.horizonVisualShift(this.horizonSlashIndex);
      const mirrorStep = this.horizonIsFake(this.horizonSlashIndex);

      // 1. Draw the Gothic Astral Astrolabe Dial on the cathedral floor (Neutral palette — zero color-coding or arrow giveaways!)
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1, PERSPECTIVE_TILT);

      // Outer Astrolabe Rim & Inner Track Ring
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.34)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 240, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 218, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Astrolabe Ring & Symmetric Gothic Octagram
      const gearR = 132;
      ctx.save();
      ctx.rotate(-time * 0.14);
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.26)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, gearR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(192, 132, 252, 0.14)';
      ctx.lineWidth = 1.2;
      for (let q = 0; q < 2; q++) {
        ctx.save();
        ctx.rotate(q * Math.PI * 0.25);
        ctx.strokeRect(-86, -86, 172, 172);
        ctx.restore();
      }
      ctx.restore();

      // 12 Clock-Hour Tick Marks around the Astrolabe Rim
      for (let h = 0; h < 12; h++) {
        const ang = (h / 12) * Math.PI * 2 - Math.PI * 0.5;
        const isCardinal = (h % 3 === 0);
        const rIn = isCardinal ? 204 : 216;
        const rOut = 240;
        ctx.strokeStyle = isCardinal ? 'rgba(216, 180, 254, 0.50)' : 'rgba(148, 163, 184, 0.26)';
        ctx.lineWidth = isCardinal ? 2.4 : 1.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * rIn, Math.sin(ang) * rIn);
        ctx.lineTo(Math.cos(ang) * rOut, Math.sin(ang) * rOut);
        ctx.stroke();
      }

      // During 'show_memory': Purely Physical Greatsword Floor Gouges & Impact Scars around Vaelgor!
      // Unified molten-crimson / astral-violet palette with ZERO UI arrows or outer-rim spoilers!
      if (this.horizonPhase === 'show_memory' && activeOb) {
        const handAlpha = Math.sin(subProg * Math.PI);
        const handAng = activeOb.angle;

        // 1A. Subtle Crimson Sight-Line connecting Vaelgor to the Pointed Hour Obelisk so players know which Hour he is addressing
        const needleGrad = ctx.createLinearGradient(0, 0, Math.cos(handAng) * 232, Math.sin(handAng) * 232);
        needleGrad.addColorStop(0, `rgba(244, 63, 94, ${0.62 * handAlpha})`);
        needleGrad.addColorStop(0.65, `rgba(192, 132, 252, ${0.38 * handAlpha})`);
        needleGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.strokeStyle = needleGrad;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(handAng) * 228, Math.sin(handAng) * 228);
        ctx.stroke();

        // 1B. Once Vaelgor unleashes his physical Greatsword motion (subProg >= 0.32), render the physical stone gouge / impact crater at his weapon reach!
        if (subProg >= 0.32) {
          const strikeProg = Math.min(1, (subProg - 0.32) / 0.34);
          const strikeFade = Math.max(0, Math.min(1, (1.0 - subProg) / 0.25));
          const alpha = strikeFade * 0.92;

          if (currentShiftType === 'cw' || currentShiftType === 'ccw') {
            // Physical Forehand ('cw' -> +1 Hour CW) or Backhand ('ccw' -> -1 Hour CCW) Greatsword Floor Gouge!
            // Sweeps only at Vaelgor's physical blade reach (r = 114px) in the direction of his swing!
            const dir = currentShiftType === 'cw' ? 1 : -1;
            const startA = handAng - dir * 0.22;
            const endA = handAng + dir * (Math.PI * 0.54 * strikeProg);
            const bladeR = 114;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = mirrorStep ? '#0284c7' : '#e11d48';
            ctx.lineWidth = 10 * (1 - strikeProg * 0.3);
            ctx.beginPath();
            ctx.arc(0, 0, bladeR, startA, endA, dir < 0);
            ctx.stroke();

            ctx.strokeStyle = mirrorStep ? '#bae6fd' : '#fda4af';
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.arc(0, 0, bladeR, startA, endA, dir < 0);
            ctx.stroke();

            // Hot white-gold friction sparks kicked up along the blade tip's floor gouge
            for (let s = 1; s <= 4; s++) {
              const sf = (s / 4) * strikeProg;
              const sa = startA + (endA - startA) * sf;
              ctx.fillStyle = s === 4 ? '#ffffff' : '#fda4af';
              ctx.beginPath();
              ctx.arc(Math.cos(sa) * bladeR, Math.sin(sa) * bladeR, 2.2 + (s / 4) * 2.0, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          } else {
            // Physical Two-Handed Overhead Ground Impale ('opposite' -> 180° Opposite):
            // Vaelgor stabs his Greatsword vertically straight into the stone in front of him (no rotational arc!),
            // blasting a localized impact crater at the blade and venting a backward seismic shock/dust wake 180° behind his back!
            const stabDist = 54;
            const stabX = Math.cos(handAng) * stabDist;
            const stabY = Math.sin(handAng) * stabDist;
            const oppAng = handAng + Math.PI;
            const perpAng = handAng + Math.PI * 0.5;
            const wakeLen = 122 * strikeProg;
            const wakeEndX = Math.cos(oppAng) * wakeLen;
            const wakeEndY = Math.sin(oppAng) * wakeLen;

            ctx.save();
            ctx.globalAlpha = alpha;

            // Backward seismic shock/dust wake venting 180° behind Vaelgor's back (stays inside inner ring, zero UI arrows!)
            const wakeGrad = ctx.createLinearGradient(stabX, stabY, wakeEndX, wakeEndY);
            wakeGrad.addColorStop(0, 'rgba(244, 63, 94, 0.75)');
            wakeGrad.addColorStop(0.45, 'rgba(192, 132, 252, 0.42)');
            wakeGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
            ctx.fillStyle = wakeGrad;
            ctx.beginPath();
            ctx.moveTo(stabX + Math.cos(perpAng) * 8, stabY + Math.sin(perpAng) * 8);
            ctx.lineTo(stabX - Math.cos(perpAng) * 8, stabY - Math.sin(perpAng) * 8);
            ctx.lineTo(wakeEndX - Math.cos(perpAng) * 34, wakeEndY - Math.sin(perpAng) * 34);
            ctx.lineTo(wakeEndX + Math.cos(perpAng) * 34, wakeEndY + Math.sin(perpAng) * 34);
            ctx.closePath();
            ctx.fill();

            // Localized Ground Impale Crater & Radial Stone Cracks around the planted blade
            ctx.fillStyle = 'rgba(225, 29, 72, 0.45)';
            ctx.strokeStyle = '#fda4af';
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.arc(stabX, stabY, 22 * strikeProg, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Centerline seismic crack venting straight backward through Vaelgor's stance toward 180°
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(stabX, stabY);
            ctx.lineTo(wakeEndX, wakeEndY);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // During 'solve_step': Vaelgor channels an expanding Arena-Wide Eclipse Cataclysm Nova + Active Doomsday Clock Hand!
      if (this.horizonPhase === 'solve_step') {
        ctx.fillStyle = 'rgba(225, 29, 72, 0.13)';
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.68)';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(0, 0, 390, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.24)';
        ctx.beginPath();
        ctx.arc(0, 0, 390 * subProg, 0, Math.PI * 2);
        ctx.fill();

        // Active Sweeping Doomsday Clock Hand completing 1 full revolution per solve step (sears players outside sanctuary rings!)
        const sweepAng = -Math.PI * 0.5 + subProg * Math.PI * 2;
        ctx.strokeStyle = 'rgba(225, 29, 72, 0.55)';
        ctx.lineWidth = 9.0;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(sweepAng) * 295, Math.sin(sweepAng) * 295);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(sweepAng) * 295, Math.sin(sweepAng) * 295);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Draw the 4 Cardinal Hour Monoliths & their Floor Sanctuary Rings
      for (let i = 0; i < this.horizonObelisks.length; i++) {
        const ob = this.horizonObelisks[i];
        const isFlashingMemory = (this.horizonPhase === 'show_memory' && i === activeMemoryObIdx);
        const isSolved = !!ob.solved;
        const memPulse = isFlashingMemory ? Math.sin(subProg * Math.PI) : 0;

        ctx.save();
        ctx.translate(ob.x, ob.y);
        ctx.scale(1, PERSPECTIVE_TILT);

        const ringR = 86;
        if (this.horizonPhase === 'solve_step') {
          // During solve_step, all 4 Obelisks project identical, mysterious Astral Ward Rings — zero color-coding or spoilers!
          ctx.fillStyle = isSolved ? 'rgba(192, 132, 252, 0.15)' : 'rgba(15, 23, 42, 0.42)';
          ctx.strokeStyle = isSolved ? 'rgba(216, 180, 254, 0.72)' : 'rgba(148, 163, 184, 0.44)';
          ctx.lineWidth = isSolved ? 2.6 : 2.0;
          ctx.beginPath();
          ctx.arc(0, 0, ringR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Subtle inner timing ring contracting toward the monolith base
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.38)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(0, 0, ringR * (1.0 - subProg), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // During show_memory, the pointed Obelisk ring cracks/scorches with unstable crimson heat so players know NOT to stand on the raw pointed Hour!
          const subtleRingAlpha = 0.32 + memPulse * 0.48;
          ctx.fillStyle = isFlashingMemory
            ? `rgba(225, 29, 72, ${0.14 + memPulse * 0.14})`
            : 'rgba(15, 23, 42, 0.32)';
          ctx.strokeStyle = isFlashingMemory
            ? `rgba(248, 113, 113, ${subtleRingAlpha})`
            : 'rgba(100, 116, 139, 0.28)';
          ctx.lineWidth = isFlashingMemory ? 2.4 : 1.5;
          if (isFlashingMemory) ctx.setLineDash([8, 5]);
          ctx.beginPath();
          ctx.arc(0, 0, ringR * 0.68, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (isFlashingMemory) ctx.setLineDash([]);
        }
        ctx.restore();

        // 3. Draw 2.5D Floating Obsidian Hour Monolith & Roman Clock Numeral (XII, III, VI, IX)
        ctx.save();
        const floatY = Math.sin(time * 4 + i * 1.5) * 3.5 - memPulse * 5.0;
        const obTopY = ob.y - 52 + floatY;

        if (isFlashingMemory) {
          // Unified crimson-violet resonance flare around the pointed monolith crystal (identical for all 3 shift types so monolith glow doesn't spoil the tell!)
          const glowGrad = ctx.createRadialGradient(ob.x, obTopY + 4, 2, ob.x, obTopY + 4, 38);
          glowGrad.addColorStop(0, `rgba(254, 205, 211, ${0.62 * memPulse})`);
          glowGrad.addColorStop(0.55, `rgba(244, 63, 94, ${0.38 * memPulse})`);
          glowGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(ob.x, obTopY + 4, 38, 0, Math.PI * 2);
          ctx.fill();
        }

        // Obsidian Monolith Crystal Body
        ctx.fillStyle = isFlashingMemory
          ? '#450a0a'
          : (isSolved ? '#1e1b4b' : '#090d16');
        ctx.strokeStyle = isFlashingMemory
          ? '#fca5a5'
          : (isSolved ? '#c084fc' : 'rgba(148, 163, 184, 0.58)');
        ctx.lineWidth = isFlashingMemory ? 2.5 : 1.8;
        ctx.beginPath();
        ctx.moveTo(ob.x, obTopY - 18);
        ctx.lineTo(ob.x + 13, obTopY + 6);
        ctx.lineTo(ob.x + 8, ob.y - 6);
        ctx.lineTo(ob.x - 8, ob.y - 6);
        ctx.lineTo(ob.x - 13, obTopY + 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner Vertical Rune Etching on the Monolith
        ctx.strokeStyle = isFlashingMemory
          ? `rgba(254, 202, 202, ${0.45 + memPulse * 0.55})`
          : (isSolved ? 'rgba(192, 132, 252, 0.65)' : 'rgba(148, 163, 184, 0.25)');
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(ob.x, obTopY - 10);
        ctx.lineTo(ob.x, ob.y - 12);
        ctx.stroke();

        // Subtle Clock Roman Numeral etched above the Monolith
        ctx.font = '700 13px Cinzel, Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isFlashingMemory
          ? `rgba(254, 226, 226, ${0.80 + memPulse * 0.20})`
          : (isSolved ? 'rgba(216, 180, 254, 0.85)' : 'rgba(148, 163, 184, 0.62)');
        ctx.fillText(`${ob.label}`, ob.x, obTopY - 24);
        ctx.restore();
      }
    }

    if (this.state === 'eclipse_mechanic') {
      ctx.save();
      const sunX = this.x;
      const sunY = this.y - 210;
      const coronaPulse = 1 + Math.sin(time * 3.5) * 0.08;
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 24, sunX, sunY, 85 * coronaPulse);
      sunGlow.addColorStop(0, '#000000');
      sunGlow.addColorStop(0.38, '#050508');
      sunGlow.addColorStop(0.43, '#fda4af');
      sunGlow.addColorStop(0.55, '#e11d48');
      sunGlow.addColorStop(0.78, 'rgba(136, 19, 55, 0.35)');
      sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 85 * coronaPulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#030407';
      ctx.strokeStyle = '#fda4af';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 32, 0, Math.PI * 2);
      // The radial corona gradient above already provides the glow; blur here cost a full re-blur every frame.
      fakeGlow(ctx, '#f43f5e', 10, 0.4);
      ctx.fill();
      ctx.stroke();

      // PHASE 0: 'cutscene' — Expanding Abyssal Invocation Circle & Crimson Pillar
      if (this.eclipsePhase === 'cutscene') {
        const cutProg = Math.max(0, Math.min(1, 1.0 - (this.eclipseTimer / (this.eclipseMaxTimer || 4.45))));
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(time * 0.8);
        ctx.fillStyle = `rgba(225, 29, 72, ${0.12 + cutProg * 0.14})`;
        ctx.strokeStyle = '#fda4af';
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.arc(0, 0, this.eclipseBarrierRadius * Math.min(1, cutProg * 1.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // PHASE 1: 'bait_swords' — Crimson Blood-Moon Barrier Dome + Tracking Execution Sword Reticle
      else if (this.eclipsePhase === 'bait_swords') {
        const distToBarrier = Math.hypot(this.eclipseSwordX - this.x, (this.eclipseSwordY - this.y) / PERSPECTIVE_TILT);
        const isAligned = (this.eclipseSwordState !== 'none' && distToBarrier <= this.eclipseBarrierRadius);

        // 1. Vaelgor's Blood-Moon Barrier Ring on the floor
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.fillStyle = isAligned ? 'rgba(250, 204, 21, 0.16)' : 'rgba(225, 29, 72, 0.16)';
        ctx.strokeStyle = isAligned ? '#fde047' : '#f43f5e';
        ctx.lineWidth = isAligned ? 3.5 : 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, this.eclipseBarrierRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw Barrier Crack Fissures for each baited sword hit so far
        if (this.eclipseCracks > 0) {
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2.4;
          for (let c = 0; c < this.eclipseCracks * 3; c++) {
            const cAng = (c * Math.PI * 2) / (Math.max(1, this.eclipseCracksNeeded || 3) * 3) + 0.3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(cAng) * 32, Math.sin(cAng) * 32);
            ctx.lineTo(Math.cos(cAng + 0.12) * 85, Math.sin(cAng + 0.12) * 85);
            ctx.lineTo(Math.cos(cAng - 0.08) * this.eclipseBarrierRadius, Math.sin(cAng - 0.08) * this.eclipseBarrierRadius);
            ctx.stroke();
          }
        }
        ctx.restore();

        // 2. Tracking / Locked Execution Greatsword Reticle (Always Crimson Danger Circle!)
        if (this.eclipseSwordState === 'tracking') {
          const trackProg = Math.max(0, Math.min(1, 1.0 - (this.eclipseSwordTimer / this.eclipseSwordMaxTimer)));
          // Beam from Black Sun down to the tracking reticle
          ctx.save();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.62)';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(sunX, sunY);
          ctx.lineTo(this.eclipseSwordX, this.eclipseSwordY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          // Ground Target Circle + Shrinking Lock-On Timing Ring
          ctx.save();
          ctx.translate(this.eclipseSwordX, this.eclipseSwordY);
          ctx.scale(1, PERSPECTIVE_TILT);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(0, 0, 78, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Shrinking outer ring that hits 78px right when the sword locks!
          const shrinkRad = 78 + (1.0 - trackProg) * 58;
          ctx.strokeStyle = '#fda4af';
          ctx.lineWidth = 2.0;
          ctx.setLineDash([10, 6]);
          ctx.beginPath();
          ctx.arc(0, 0, shrinkRad, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // PHASE 2: 'stagger_check' — Shattered Barrier Ring & Lower-Level Stagger Bar Under Boss Model
      else if (this.eclipsePhase === 'stagger_check') {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
        ctx.lineWidth = 3.0;
        ctx.setLineDash([14, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, 110, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Lower-Level Mechanic Stagger Bar directly under Vaelgor's model/feet!
        const sw = 138, sh = 10;
        const sx = this.x - sw * 0.5;
        const sy = this.y + 46;
        const remFrac = Math.max(0, Math.min(1, this.eclipseStaggerCheck / (this.eclipseStaggerCheckMax || 210)));
        const timeFrac = Math.max(0, Math.min(1, this.eclipseTimer / (this.eclipseMaxTimer || 8.5)));

        ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
        ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 6);

        // Golden Stagger Check Gauge
        ctx.fillStyle = '#facc15';
        ctx.fillRect(sx, sy, sw * remFrac, sh);

        // Thin Crimson Time-Remaining Sub-Bar right underneath
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(sx, sy + sh + 1, sw * timeFrac, 3);

        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(sx - 1, sy - 1, sw + 2, sh + 6);
      }

      // PHASE 3: 'wipe' — the arena goes dark, the Black Sun swells above him, then falls on the whole room
      else if (this.eclipsePhase === 'wipe') {
        const wp = Math.max(0, Math.min(1, 1.0 - (this.eclipseTimer / (this.eclipseMaxTimer || 2.6))));
        const dark = wp < 0.62 ? Math.min(1, wp / 0.45) : Math.max(0, 1 - (wp - 0.62) / 0.3);
        ctx.save();
        const dg = ctx.createRadialGradient(this.x, this.y, 60, this.x, this.y, 1100);
        dg.addColorStop(0, `rgba(8,0,16,${0.35 * dark})`); dg.addColorStop(1, `rgba(0,0,0,${0.82 * dark})`);
        ctx.fillStyle = dg; ctx.fillRect(this.x - 1400, this.y - 1000, 2800, 2000);
        if (wp < 0.62) {
          const grow = Math.min(1, wp / 0.5), fall = Math.max(0, (wp - 0.5) / 0.12);
          const sunR = 26 + 74 * grow, sunX = this.x, sunY = this.y - this.jumpZ - 250 + fall * fall * 230;
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 14; k++) {          // corona rays
            const ra = time * 0.6 + k * (Math.PI * 2 / 14), rl = sunR * (1.5 + 0.5 * Math.sin(time * 9 + k * 2.1));
            ctx.strokeStyle = k % 2 ? 'rgba(251,191,36,0.55)' : 'rgba(244,63,94,0.5)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(sunX + Math.cos(ra) * sunR, sunY + Math.sin(ra) * sunR); ctx.lineTo(sunX + Math.cos(ra) * rl, sunY + Math.sin(ra) * rl); ctx.stroke();
          }
          for (const [rr, al] of [[1.5, 0.12], [1.25, 0.28], [1.07, 0.7]]) { ctx.strokeStyle = `rgba(255,214,150,${al})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(sunX, sunY, sunR * rr, 0, Math.PI * 2); ctx.stroke(); }
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#05010a'; ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
          // the lethal-zone cue: the floor reddens under the whole room as it falls
          ctx.save(); ctx.translate(this.x, this.y); ctx.scale(1, PERSPECTIVE_TILT);
          ctx.strokeStyle = `rgba(244,63,94,${0.25 + grow * 0.5})`; ctx.lineWidth = 4; ctx.setLineDash([18, 10]);
          ctx.beginPath(); ctx.arc(0, 0, 520 * (1 - grow * 0.15), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        }
        ctx.restore();
      }

      // the mechanic's single countdown also shows while the swords are still falling
      if (this.eclipsePhase === 'bait_swords') {
        const sw = 138, sx = this.x - sw * 0.5, sy = this.y + 46;
        const timeFrac = Math.max(0, Math.min(1, this.eclipseTimer / (this.eclipseMaxTimer || 17)));
        ctx.fillStyle = 'rgba(9, 13, 22, 0.94)'; ctx.fillRect(sx - 1, sy - 1, sw + 2, 16);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.18)'; ctx.fillRect(sx, sy, sw, 10);            // the stagger bar, not yet open
        ctx.fillStyle = '#f43f5e'; ctx.fillRect(sx, sy + 11, sw * timeFrac, 3);
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.5)'; ctx.lineWidth = 1.2; ctx.strokeRect(sx - 1, sy - 1, sw + 2, 16);
      }

      // HARD: the clockwise sweeping line on the floor
      if (this.isHardRaid() && (this.eclipsePhase === 'bait_swords' || this.eclipsePhase === 'stagger_check')) {
        const live = !!this.eclipseSweepLive;
        const elapsed = Math.max(0, this.eclipseMaxTimer - this.eclipseTimer);
        const tele = live ? 1 : Math.min(1, elapsed / 1.6);
        const R = 380, W = 24, fl = 0.75 + 0.25 * Math.sin(time * 14);
        ctx.save();
        ctx.translate(this.x, this.y); ctx.scale(1, PERSPECTIVE_TILT); ctx.rotate(this.eclipseSweepAng || 0);
        if (live) {
          // the afterglow trailing behind the leading edge (counter-clockwise of it)
          const trail = ctx.createLinearGradient(0, 0, 0, -140);
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 6; i++) {
            ctx.rotate(-0.045);
            ctx.fillStyle = `rgba(168, 85, 247, ${0.10 * (1 - i / 6)})`;
            ctx.fillRect(28, -W * 0.8, R - 28, W * 1.6);
          }
          ctx.rotate(0.27);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = live ? `rgba(15, 0, 24, ${0.55 * fl})` : `rgba(168, 85, 247, ${0.10 * tele})`;
        ctx.fillRect(28, -W, R - 28, W * 2);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = live ? `rgba(244, 63, 94, ${0.85 * fl})` : `rgba(216, 180, 254, ${0.45 * tele})`;
        ctx.lineWidth = live ? 3 : 2; if (!live) ctx.setLineDash([12, 8]);
        ctx.strokeRect(28, -W, R - 28, W * 2); ctx.setLineDash([]);
        if (live) {
          ctx.strokeStyle = `rgba(255, 220, 230, ${0.7 * fl})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(R, 0); ctx.stroke();
          ctx.fillStyle = 'rgba(244, 63, 94, 0.55)'; ctx.beginPath(); ctx.arc(R, 0, 9, 0, Math.PI * 2); ctx.fill();   // the point at the far end
        }
        ctx.restore();
      }

      ctx.restore();
    }

    // ------------------------------------------------------------------
    // FINAL PHASE NEW PATTERN TELEGRAPHS & SPIRIT BOMB MECHANIC RENDERING
    // ------------------------------------------------------------------
    // 1. Final Eclipse Judgment (Cardinal Cross + Inner Ring -> Diagonal Cross + Outer Ring)
    if (this.state === 'pattern_final_eclipse_judgment') {
      const prog = Math.max(0, Math.min(1, 1.0 - (this.stateTimer / (this.stateDuration || 3.2))));
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1, PERSPECTIVE_TILT);
      if (prog < 0.48) {
        const subP = prog / 0.48;
        // Inner ring danger zone (r <= 145)
        ctx.fillStyle = `rgba(168, 85, 247, ${0.15 + subP * 0.25})`;
        ctx.beginPath();
        ctx.arc(0, 0, 145, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, 145 * subP, 0, Math.PI * 2);
        ctx.stroke();
        // 4 Cardinal beams
        const cardAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
        for (const ang of cardAngles) {
          ctx.save();
          ctx.rotate(ang);
          ctx.fillStyle = `rgba(168, 85, 247, ${0.15 + subP * 0.30})`;
          ctx.fillRect(0, -42, 340 * subP, 84);
          ctx.strokeStyle = `rgba(253, 224, 71, ${0.45 + subP * 0.5})`;
          ctx.lineWidth = 2.2;
          ctx.strokeRect(0, -42, 340, 84);
          ctx.restore();
        }
      } else if (prog < 0.84) {
        const subP = (prog - 0.48) / 0.36;
        // Outer ring danger zone (145 < r <= 310)
        ctx.strokeStyle = `rgba(244, 63, 94, ${0.18 + subP * 0.32})`;
        ctx.lineWidth = 165;
        ctx.beginPath();
        ctx.arc(0, 0, 227.5, 0, Math.PI * 2);
        ctx.stroke();
        // 4 Diagonal beams
        const diagAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
        for (const ang of diagAngles) {
          ctx.save();
          ctx.rotate(ang);
          ctx.fillStyle = `rgba(244, 63, 94, ${0.15 + subP * 0.30})`;
          ctx.fillRect(0, -42, 340 * subP, 84);
          ctx.strokeStyle = `rgba(253, 224, 71, ${0.45 + subP * 0.5})`;
          ctx.lineWidth = 2.2;
          ctx.strokeRect(0, -42, 340, 84);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 2. Final Trinity Slash (3 Rapid Teleporting Wide 220-Degree Sweeps)
    if (this.state === 'pattern_final_trinity_slash') {
      const prog = Math.max(0, Math.min(1, 1.0 - (this.stateTimer / (this.stateDuration || 2.85))));
      let subP = 0;
      let coneRange = 185;
      let halfArc = Math.PI * 0.62;
      if (prog < 0.28) {
        subP = prog / 0.28;
        coneRange = 185;
      } else if (prog >= 0.42 && prog < 0.56) {
        subP = (prog - 0.42) / 0.14;
        coneRange = 190;
      } else if (prog >= 0.68 && prog < 0.85) {
        subP = (prog - 0.68) / 0.17;
        coneRange = 215;
        halfArc = Math.PI * 0.72;
      }
      if (subP > 0) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.rotate(this.facingAngle);
        ctx.fillStyle = `rgba(244, 63, 94, ${0.14 + subP * 0.28})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, coneRange, -halfArc, halfArc);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(253, 224, 71, ${0.45 + subP * 0.5})`;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Final Oblivion Singularity (Black-Sun Pull + Inner Core Implosion r <= 235px)
    if (this.state === 'pattern_final_oblivion_singularity') {
      const prog = Math.max(0, Math.min(1, 1.0 - (this.stateTimer / (this.stateDuration || 3.4))));
      if (prog < 0.78) {
        const p = prog / 0.78;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        // Inner lethal zone (r <= 235)
        ctx.fillStyle = `rgba(147, 51, 234, ${0.14 + p * 0.28})`;
        ctx.beginPath();
        ctx.arc(0, 0, 235, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(0, 0, 235 * p, 0, Math.PI * 2);
        ctx.stroke();
        // Safe outer perimeter boundary
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.75)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, 240, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // 4. Final Cataclysm Rain (Center Supernova Dive Telegraph)
    if (this.state === 'pattern_final_cataclysm_rain') {
      const prog = Math.max(0, Math.min(1, 1.0 - (this.stateTimer / (this.stateDuration || 3.5))));
      if (prog < 0.72) {
        const p = prog / 0.72;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.fillStyle = `rgba(225, 29, 72, ${0.12 + p * 0.26})`;
        ctx.beginPath();
        ctx.arc(0, 0, 195, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, 195 * p, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 5. Final Phase Transition: Pre-Whiteout Energy Gathering, 3-Player Dash Counter & Overhead Spirit Bomb Death Ball + Stagger Bar
    if (this.state === 'final_phase_mechanic') {
      ctx.save();

      // Pre-Whiteout Dark Cathedral Energy Gathering Aura (moments before the screen turns white!)
      if (this.finalMechPhase === 'arena_cutscene') {
        const cutProg = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 3.8))));
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        const ringR = cutProg < 0.48
          ? 360 * (1.0 - (cutProg / 0.48) * 0.82)
          : 65 + ((cutProg - 0.48) / 0.52) * 480;
        ctx.strokeStyle = cutProg < 0.48 ? 'rgba(192, 132, 252, 0.85)' : 'rgba(248, 250, 252, 0.85)';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Dash Counter Target Reticle & Chain Progress
      if (this.finalMechPhase === 'dash_windup' || this.finalMechPhase === 'dash_counter') {
        const partyList = (window.game && window.game.party) ? window.game.party : [];
        const tgt = partyList.find(p => p && p.id === this.finalDashTargetId && p.hp > 0) || null;
        if (tgt) {
          ctx.save();
          ctx.translate(tgt.x, tgt.y);
          ctx.scale(1, PERSPECTIVE_TILT);
          const pulse = 0.65 + 0.35 * Math.sin(time * 18);
          ctx.strokeStyle = this.finalMechPhase === 'dash_counter' ? '#38bdf8' : '#f43f5e';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.arc(0, 0, 48 + pulse * 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        // Counter window banner above Vaelgor
        ctx.save();
        ctx.font = '900 13px "Cinzel", serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = this.finalMechPhase === 'dash_counter' ? '#38bdf8' : '#fda4af';
        const remT = Math.max(0, this.finalMechTimer || 0).toFixed(2);
        ctx.fillText(
          this.finalMechPhase === 'dash_counter'
            ? `⚡ COUNTER NOW [${(this.finalDashStep || 0) + 1} / 3] — PRESS [D]! (${remT}s)`
            : `⚠️ DASHING TO TARGET [${(this.finalDashStep || 0) + 1} / 3] — GET READY TO [D] COUNTER!`,
          this.x,
          this.y - this.jumpZ - 115
        );
        ctx.restore();
      }

      // Ground danger perimeter around the arena during Spirit Bomb charge
      if (this.finalMechPhase === 'roar_qte_spirit_bomb') {
        const maxT = Math.max(0.1, this.finalMechMaxTimer || 14.0);
        const chargeFrac = 1 - Math.max(0, (this.finalMechTimer || 0) / maxT);
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.35 + chargeFrac * 0.45})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, 520 * chargeFrac, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    // 6. <= 15% HP Final Phase Clash Mechanic: Dark Teleport Trail & Small Blue Clash Circle in front of Vaelgor!
    if (this.clashDarkTrail && this.clashDarkTrail.timer > 0) {
      const tr = this.clashDarkTrail;
      const alpha = Math.max(0, Math.min(1, tr.timer / (tr.maxTimer || 2.25)));
      ctx.save();
      // Multi-layered abyssal dark shadow trail leading Vaelgor from his previous spot to behind the player!
      const grad = ctx.createLinearGradient(tr.startX, tr.startY - 28, tr.endX, tr.endY - 28);
      grad.addColorStop(0, `rgba(15, 23, 42, ${alpha * 0.25})`);
      grad.addColorStop(0.5, `rgba(88, 28, 135, ${alpha * 0.72})`);
      grad.addColorStop(1, `rgba(168, 85, 247, ${alpha * 0.90})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 38 * alpha;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tr.startX, tr.startY - 28);
      ctx.lineTo(tr.endX, tr.endY - 28);
      ctx.stroke();

      ctx.strokeStyle = `rgba(9, 11, 16, ${alpha * 0.88})`;
      ctx.lineWidth = 18 * alpha;
      ctx.beginPath();
      ctx.moveTo(tr.startX, tr.startY - 28);
      ctx.lineTo(tr.endX, tr.endY - 28);
      ctx.stroke();

      // Ghostly afterimages along the dark trail
      for (let s = 1; s <= 4; s++) {
        const f = s / 5;
        const gx = tr.startX + (tr.endX - tr.startX) * f;
        const gy = tr.startY + (tr.endY - tr.startY) * f;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.fillStyle = `rgba(88, 28, 135, ${alpha * 0.35 * f})`;
        ctx.beginPath();
        ctx.arc(0, 0, 26 + f * 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    if (this.state === 'final_clash_mechanic') {
      ctx.save();
      const cx = this.clashCircleX;
      const cy = this.clashCircleY;
      const r = this.clashCircleRadius || 50;

      if (this.clashPhase === 'windup_circle') {
        // Small Blue Circle on the floor in front of where Vaelgor is about to strike (NO indicator on the boss!)
        const remFrac = Math.max(0, Math.min(1, (this.clashTimer || 0) / (this.clashMaxTimer || 3.0)));
        const pulse = 0.75 + 0.25 * Math.sin(time * 18);
        const localP = window.game ? window.game.localPlayer : null;
        const playerInside = localP && this.canPlayerInitiateClash(localP);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, PERSPECTIVE_TILT);

        // Glowing blue clash zone fill
        ctx.fillStyle = playerInside
          ? `rgba(56, 189, 248, ${0.34 + pulse * 0.16})`
          : `rgba(14, 165, 233, ${0.22 + pulse * 0.10})`;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Outer small blue ring
        ctx.strokeStyle = playerInside ? '#bae6fd' : '#38bdf8';
        ctx.lineWidth = playerInside ? 4.0 : 3.0;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // Shrinking 3.0s countdown ring converging toward center
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(8, r * remFrac), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Small [G] CLASH prompt anchored directly to the blue floor circle (never on the boss!)
        ctx.save();
        ctx.font = '900 13px "Cinzel", serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = playerInside ? '#fde047' : '#38bdf8';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 6;
        ctx.fillText(
          playerInside ? '⚔️ PRESS [G] TO CLASH!' : '[G] CLASH ZONE',
          cx,
          cy + 8
        );
        ctx.restore();
      } else if (this.clashPhase === 'active_clash') {
        // Active Clash shock-ring on the ground where blades are locked
        const pulse = 0.7 + 0.3 * Math.sin(time * 26);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.fillStyle = `rgba(56, 189, 248, ${0.18 + pulse * 0.12})`;
        ctx.beginPath();
        ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.arc(0, 0, r + 10 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (this.clashPhase === 'fail_wipe') {
        const slam = this.getClashSlamPoint();
        const e = this.clashWipeElapsed || 0;
        if (!this.clashWipeSlammed) {
          // Gathering darkness pooling under the blade
          const g = Math.min(1, e / CLASH_WIPE_SLAM_T);
          ctx.save();
          ctx.translate(slam.x, slam.y);
          ctx.scale(1, PERSPECTIVE_TILT);
          ctx.fillStyle = `rgba(59, 7, 100, ${0.25 + g * 0.35})`;
          ctx.beginPath();
          ctx.arc(0, 0, 40 + (1 - g) * 90, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          const R = this.getClashWipeRadius();
          const fade = Math.max(0, 1 - R / 900);
          ctx.save();
          ctx.translate(slam.x, slam.y);
          ctx.scale(1, PERSPECTIVE_TILT);
          const grad = ctx.createRadialGradient(0, 0, Math.max(1, R * 0.55), 0, 0, Math.max(2, R));
          grad.addColorStop(0, 'rgba(9, 11, 16, 0)');
          grad.addColorStop(0.75, `rgba(46, 16, 101, ${0.5 * fade})`);
          grad.addColorStop(1, `rgba(9, 11, 16, ${0.85 * fade})`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, R, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(168, 85, 247, ${0.95 * fade})`;
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.arc(0, 0, R, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = `rgba(244, 63, 94, ${0.9 * fade})`;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, 0, R * 0.985, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  drawOverheadEclipseSpiritBomb(ctx, time, tipWorldX, tipWorldY) {
    if (
      this.finalMechPhase !== 'roar_qte_spirit_bomb' &&
      this.finalMechPhase !== 'sword_absorb_cutscene' &&
      this.finalMechPhase !== 'spirit_bomb_wipe'
    ) {
      return;
    }

    ctx.save();
    let ballR = Math.max(6, this.finalSpiritBombRadius || 120);
    let ballX = this.x;
    // Default high above Vaelgor's raised arms & upright sword so it is NEVER behind his torso
    let ballY = this.y - this.jumpZ - 290;

    if (this.finalMechPhase === 'sword_absorb_cutscene') {
      const absProg = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 4.2))));
      if (absProg < 0.24) {
        // Act 1: Repulsion Roar - Colossal Eclipse hovers high overhead pulsing while Vaelgor roars players back
        ballY = this.y - this.jumpZ - 290 + Math.sin(time * 12) * 5;
      } else if (absProg < 0.82) {
        // Act 2: Two-Handed Vertical Sword Absorption - Eclipse descends onto the upright sword tip and funnels into it!
        const absorbT = Math.min(1, (absProg - 0.24) / 0.58);
        const targetTipX = Number.isFinite(tipWorldX) ? tipWorldX : this.x;
        const targetTipY = Number.isFinite(tipWorldY) ? tipWorldY : (this.y - this.jumpZ - 235);
        ballX = this.x + (targetTipX - this.x) * Math.min(1, absorbT * 1.35);
        const startHighY = this.y - this.jumpZ - 290;
        ballY = startHighY + (targetTipY - 18 - startHighY) * Math.pow(absorbT, 0.72);
      } else {
        // Act 3: Fully absorbed into the Sovereign Greatsword & body!
        ballR = 0;
      }
    } else if (this.finalMechPhase === 'spirit_bomb_wipe') {
      // Unstaggered Wipe: Vaelgor hurls the colossal Eclipse straight down into the arena floor!
      const wipeP = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 2.0))));
      const slamFrac = Math.min(1, wipeP / 0.35);
      const startY = this.y - 290;
      const impactY = this.y - 18;
      ballY = startY + (impactY - startY) * (slamFrac * slamFrac);
    }

    // 1. During Spirit Bomb Charge: Dual rising energy streams from Vaelgor's raised hands up into the overhead Eclipse
    if (this.finalMechPhase === 'roar_qte_spirit_bomb' && ballR > 10) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        const handX = this.x + side * 26;
        const handY = this.y - this.jumpZ - 142;
        const streamGrad = ctx.createLinearGradient(handX, handY, ballX, ballY);
        streamGrad.addColorStop(0, 'rgba(244, 63, 94, 0.75)');
        streamGrad.addColorStop(0.5, 'rgba(192, 132, 252, 0.85)');
        streamGrad.addColorStop(1, 'rgba(254, 240, 138, 0.95)');
        ctx.strokeStyle = streamGrad;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.quadraticCurveTo(
          this.x + side * 42 + Math.sin(time * 10 + side) * 12,
          (handY + ballY) * 0.5,
          ballX + side * (ballR * 0.28),
          ballY + ballR * 0.45
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Sword Absorption Siphon Funneling the Overhead Eclipse down into Vaelgor's Two-Handed Vertical Blade & Body!
    if (this.finalMechPhase === 'sword_absorb_cutscene') {
      const absProg = Math.max(0, Math.min(1, 1.0 - (this.finalMechTimer / (this.finalMechMaxTimer || 4.2))));
      if (absProg >= 0.24 && absProg < 0.84) {
        const absorbT = Math.min(1, (absProg - 0.24) / 0.58);
        const bladeTipX = Number.isFinite(tipWorldX) ? tipWorldX : this.x;
        const bladeTipY = Number.isFinite(tipWorldY) ? tipWorldY : (this.y - this.jumpZ - 235);
        const hiltY = this.y - this.jumpZ - 125;
        const chestY = this.y - this.jumpZ - 78;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Funnel cone from the overhead Eclipse into the vertical sword tip and down the blade into Vaelgor's chest
        const beamGrad = ctx.createLinearGradient(ballX, ballY, this.x, chestY);
        beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.96)');
        beamGrad.addColorStop(0.45, 'rgba(192, 132, 252, 0.92)');
        beamGrad.addColorStop(0.8, 'rgba(244, 63, 94, 0.78)');
        beamGrad.addColorStop(1, 'rgba(168, 85, 247, 0.15)');
        ctx.fillStyle = beamGrad;
        const topSpread = Math.max(8, ballR * 0.62);
        ctx.beginPath();
        ctx.moveTo(ballX - topSpread, ballY);
        ctx.lineTo(ballX + topSpread, ballY);
        ctx.lineTo(bladeTipX + 11, hiltY);
        ctx.lineTo(this.x + 22 * absorbT, chestY);
        ctx.lineTo(this.x - 22 * absorbT, chestY);
        ctx.lineTo(bladeTipX - 11, hiltY);
        ctx.closePath();
        ctx.fill();

        // Blazing vertical core along the upright blade shaft
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 4.5 + Math.sin(time * 28) * 1.5;
        ctx.beginPath();
        ctx.moveTo(ballX, ballY);
        ctx.lineTo(bladeTipX, bladeTipY);
        ctx.lineTo(this.x, hiltY);
        ctx.lineTo(this.x, chestY);
        ctx.stroke();

        // Crackling lightning tendrils spiraling from the Eclipse sphere into the vertical blade & body
        for (let s = 0; s < 4; s++) {
          const sAng = time * 11 + s * (Math.PI * 0.5);
          const startX = ballX + Math.cos(sAng) * Math.max(10, ballR * 0.72);
          const startY = ballY + Math.sin(sAng) * Math.max(6, ballR * 0.38);
          ctx.strokeStyle = s % 2 === 0 ? '#fef08a' : '#e879f9';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.quadraticCurveTo(
            bladeTipX + Math.sin(time * 18 + s * 1.9) * 30,
            (startY + hiltY) * 0.5,
            this.x + (s - 1.5) * 5,
            hiltY + (chestY - hiltY) * absorbT
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 3. Render the Colossal Overhead Eclipse Sphere on top of Vaelgor
    if (ballR > 4) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const outerGrad = ctx.createRadialGradient(ballX, ballY, ballR * 0.15, ballX, ballY, ballR * 1.48);
      outerGrad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      outerGrad.addColorStop(0.35, 'rgba(244, 63, 94, 0.82)');
      outerGrad.addColorStop(0.7, 'rgba(147, 51, 234, 0.52)');
      outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR * 1.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Abyssal Black Hole Core inside the Spirit Bomb
      ctx.save();
      ctx.fillStyle = '#05030a';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Swirling Corona Rings around the Spirit Bomb
      for (let ring = 0; ring < 2; ring++) {
        ctx.save();
        ctx.translate(ballX, ballY);
        ctx.rotate(time * (ring === 0 ? 2.6 : -2.0) + ring * 1.2);
        ctx.scale(1, 0.36);
        ctx.strokeStyle = ring === 0 ? 'rgba(244, 63, 94, 0.88)' : 'rgba(192, 132, 252, 0.88)';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.arc(0, 0, ballR * (1.05 + ring * 0.18), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // 4. Heavy Co-op Stagger Bar underneath Vaelgor during Spirit Bomb charge
    if (this.finalMechPhase === 'roar_qte_spirit_bomb') {
      const sw = 210, sh = 13;
      const sx = this.x - sw * 0.5;
      const sy = this.y + 38;
      const stagRatio = Math.max(0, (this.finalSpiritBombStagger || 0) / Math.max(1, this.finalSpiritBombMaxStagger || 330));
      const remTimer = Math.max(0, this.finalMechTimer || 0);
      const timeFrac = Math.max(0, remTimer / Math.max(0.1, this.finalMechMaxTimer || 14.0));

      ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
      ctx.fillRect(sx - 2, sy - 2, sw + 4, sh + 9);

      const barGrad = ctx.createLinearGradient(sx, sy, sx + sw, sy);
      barGrad.addColorStop(0, '#f59e0b');
      barGrad.addColorStop(0.5, '#fbbf24');
      barGrad.addColorStop(1, '#fef08a');
      ctx.fillStyle = barGrad;
      ctx.fillRect(sx, sy, sw * stagRatio, sh);

      // Countdown timer sub-bar underneath
      ctx.fillStyle = '#e11d48';
      ctx.fillRect(sx, sy + sh + 2, sw * timeFrac, 4);

      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(sx - 1, sy - 1, sw + 2, sh + 7);

      ctx.font = '900 11px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef08a';
      ctx.fillText(`ECLIPSE STAGGER CHECK (${remTimer.toFixed(1)}s)`, this.x, sy - 6);
    }

    ctx.restore();
  }

  drawGroundShadowAndAura(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const shadowScale = Math.max(0.45, 1.0 - this.jumpZ / 150);
    // Unit-scale cached gradient drawn under a uniform scale (same pixels as scaling the gradient radii).
    if (!VaelgorRaidBoss._shadowGrad) {
      const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 52);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.84)');
      g.addColorStop(0.6, 'rgba(0, 0, 0, 0.45)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      VaelgorRaidBoss._shadowGrad = g;
    }
    ctx.save();
    ctx.scale(shadowScale, shadowScale);
    ctx.fillStyle = VaelgorRaidBoss._shadowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 52, 52 * PERSPECTIVE_TILT, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Final Phase Sovereign Aura Ring on ground
    if (this.finalPhase || this.swordEmpowered) {
      ctx.save();
      ctx.scale(1, PERSPECTIVE_TILT);
      ctx.rotate(-time * 1.2);
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, 54, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Lost Ark Positional Indicator Ring (Cyan Front Indicator, Orange Back Indicator!)
    ctx.save();
    ctx.scale(1, PERSPECTIVE_TILT);
    ctx.rotate(this.facingAngle);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.stroke();

    // Front Sector (Head Attack Zone - Cyan/Crimson)
    ctx.strokeStyle = this.isCounterable() ? '#38bdf8' : '#f43f5e';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, 44, -0.65, 0.65);
    ctx.stroke();

    // Back Sector (Back Attack Zone - Amber/Orange)
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.78)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, 0, 44, Math.PI - 0.75, Math.PI + 0.75);
    ctx.stroke();

    ctx.fillStyle = this.isCounterable() ? '#38bdf8' : '#e11d48';
    ctx.beginPath();
    ctx.moveTo(52, 0);
    ctx.lineTo(44, -5.5);
    ctx.lineTo(44, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  drawTatteredCape(ctx, time, lShoulder, rShoulder, neck) {
    ctx.save();
    const ribbons = this.capeRibbons;
    const R = ribbons.length;
    const N = ribbons[0].length;
    // Project 3D cloth nodes using exact localToWorld screen projection and enforce screen-space segment clamping
    // so the cape NEVER stretches ("Mr. Fantastic style") during fast combos, spins, or leaps!
    const maxScreenSeg = 13.0;
    const grid = ribbons.map((nodes, r) => {
      const col = [];
      for (let idx = 0; idx < nodes.length; idx++) {
        const n = nodes[idx];
        if (idx === 0 && lShoulder && rShoulder && neck) {
          const frac = r / (R - 1);
          const archCurve = Math.sin(frac * Math.PI);
          col.push({
            x: lShoulder.sx + (rShoulder.sx - lShoulder.sx) * frac,
            y: lShoulder.sy + (rShoulder.sy - lShoulder.sy) * frac - archCurve * 2.5
          });
        } else {
          let sx = n.x;
          let sy = this.y + (n.y - this.y) * PERSPECTIVE_TILT - n.z;
          if (idx > 0) {
            const prev = col[idx - 1];
            const dx = sx - prev.x;
            const dy = sy - prev.y;
            const dist = Math.hypot(dx, dy);
            if (dist > maxScreenSeg) {
              sx = prev.x + (dx / dist) * maxScreenSeg;
              sy = prev.y + (dy / dist) * maxScreenSeg;
            }
          }
          col.push({ x: sx, y: sy });
        }
      }
      return col;
    });

    for (let r = 0; r < R - 1; r++) {
      const leftCol = grid[r];
      const rightCol = grid[r + 1];
      const isEven = (r % 2 === 0);
      ctx.beginPath();
      for (let n = 0; n < N; n++) {
        if (n === 0) ctx.moveTo(leftCol[n].x, leftCol[n].y);
        else ctx.lineTo(leftCol[n].x, leftCol[n].y);
      }
      const botL = leftCol[N - 1], botR = rightCol[N - 1];
      const midX = (botL.x + botR.x) * 0.5;
      const midY = (botL.y + botR.y) * 0.5 + (isEven ? 9 : 4);
      ctx.lineTo(midX, midY);
      for (let n = N - 1; n >= 0; n--) {
        ctx.lineTo(rightCol[n].x, rightCol[n].y);
      }
      ctx.closePath();
      const grad = ctx.createLinearGradient(leftCol[0].x, leftCol[0].y, midX, midY);
      grad.addColorStop(0, isEven ? '#0c1018' : '#161022');
      grad.addColorStop(0.68, isEven ? '#1c0f24' : '#2a0b1d');
      grad.addColorStop(1, this.finalPhase ? '#581c87' : (this.awakened ? '#881337' : '#291020'));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = this.finalPhase ? 'rgba(192, 132, 252, 0.35)' : 'rgba(15, 23, 42, 0.78)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    // Heavy Armored Mantle Clasp Band bridging Left Shoulder -> Neck -> Right Shoulder so the cape is physically fastened
    if (lShoulder && rShoulder && neck) {
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(lShoulder.sx, lShoulder.sy - 2);
      ctx.quadraticCurveTo(neck.sx, neck.sy - 3, rShoulder.sx, rShoulder.sy - 2);
      ctx.lineTo(rShoulder.sx, rShoulder.sy + 3.5);
      ctx.quadraticCurveTo(neck.sx, neck.sy + 2.5, lShoulder.sx, lShoulder.sy + 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Crimson/Gold Mantle Brooches at each shoulder anchor
      for (const sh of [lShoulder, rShoulder]) {
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sh.sx, sh.sy + 0.5, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = this.finalPhase ? '#c084fc' : '#e11d48';
        ctx.beginPath();
        ctx.arc(sh.sx, sh.sy + 0.5, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawArticulatedLeg(ctx, hip, knee, ankle, footWorld) {
    ctx.save();
    // 1. Hip Joint Mail Under-Socket (eliminates gap between pelvis & thigh)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(hip.sx, hip.sy, 6.2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Sculpted Thigh Cuisse Plate
    const thighAng = Math.atan2(knee.sy - hip.sy, knee.sx - hip.sx);
    const thighLen = Math.hypot(knee.sx - hip.sx, knee.sy - hip.sy);
    ctx.save();
    ctx.translate(hip.sx, hip.sy);
    ctx.rotate(thighAng);
    ctx.fillStyle = VaelgorRaidBoss.getCachedGradient(ctx, 'cuisse', 0, -7, 0, 7, ['#334155', '#1e293b', '#0f172a']);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, -6.8);
    ctx.lineTo(thighLen + 2, -5.2);
    ctx.lineTo(thighLen + 2, 5.2);
    ctx.lineTo(-3, 6.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Center ridge line along cuisse
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(thighLen, 0);
    ctx.stroke();
    ctx.restore();

    // 3. Fluted Shin Greave (Schynbald)
    const shinAng = Math.atan2(ankle.sy - knee.sy, ankle.sx - knee.sx);
    const shinLen = Math.hypot(ankle.sx - knee.sx, ankle.sy - knee.sy);
    ctx.save();
    ctx.translate(knee.sx, knee.sy);
    ctx.rotate(shinAng);
    ctx.fillStyle = VaelgorRaidBoss.getCachedGradient(ctx, 'greave', 0, -6, 0, 6, ['#1e293b', '#0f172a', '#1e293b']);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2, -6.0);
    ctx.lineTo(shinLen * 0.45, -6.6);
    ctx.lineTo(shinLen + 2, -4.4);
    ctx.lineTo(shinLen + 2, 4.4);
    ctx.lineTo(shinLen * 0.45, 6.2);
    ctx.lineTo(-2, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 4. Winged Gothic Poleyn (Knee Cop) bridging thigh & shin cleanly
    ctx.save();
    ctx.translate(knee.sx, knee.sy);
    ctx.rotate((thighAng + shinAng) * 0.5);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-4.5, -6.2);
    ctx.lineTo(5.5, 0);
    ctx.lineTo(-4.5, 6.2);
    ctx.lineTo(-2.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 5. Armored Clawed Sabaton (Foot Armor)
    const cosF = Math.cos(this.facingAngle), sinF = Math.sin(this.facingAngle);
    ctx.save();
    ctx.translate(ankle.sx, ankle.sy);
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-5.5, -3.5);
    ctx.lineTo(5.5 + cosF * 5.5, -2.5 + sinF * 2.5);
    ctx.lineTo(8.5 + cosF * 7.5, 2.0 + sinF * 3.5);
    ctx.lineTo(-5.5, 4.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  drawPelvisAndTassets(ctx, pelvis, lHip, rHip, lKnee, rKnee) {
    ctx.save();
    // 1. Segmented Fauld / Armored Waist Belt bridging torso to hips
    const beltW = Math.max(32, Math.hypot(rHip.sx - lHip.sx, rHip.sy - lHip.sy) + 12);
    const beltGrad = ctx.createLinearGradient(pelvis.sx - beltW * 0.5, pelvis.sy, pelvis.sx + beltW * 0.5, pelvis.sy);
    beltGrad.addColorStop(0, '#0f172a');
    beltGrad.addColorStop(0.5, '#1e293b');
    beltGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = beltGrad;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(pelvis.sx - beltW * 0.5, pelvis.sy - 7, beltW, 13, 4);
    ctx.fill();
    ctx.stroke();

    // 2. Layered Side Tassets hanging over Left and Right Hip joints so legs never look detached
    const tassetConfigs = [
      { hip: lHip, knee: lKnee, side: -1 },
      { hip: rHip, knee: rKnee, side: 1 }
    ];
    for (const tc of tassetConfigs) {
      const legAng = Math.atan2(tc.knee.sy - tc.hip.sy, tc.knee.sx - tc.hip.sx);
      ctx.save();
      ctx.translate(tc.hip.sx, tc.hip.sy - 2);
      ctx.rotate((legAng - Math.PI * 0.5) * 0.45 + tc.side * 0.14);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-6.5, -3);
      ctx.lineTo(6.5, -3);
      ctx.lineTo(8.0, 12);
      ctx.lineTo(0, 16);
      ctx.lineTo(-8.0, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 3. Royal Crimson / Sovereign Heraldic Tabard Banner
    const sway = Math.sin(this.breathePhase * 1.4) * 0.08;
    ctx.save();
    ctx.translate(pelvis.sx, pelvis.sy + 1);
    ctx.rotate(sway);
    ctx.fillStyle = this.finalPhase ? '#3b0764' : '#7f1d1d';
    ctx.strokeStyle = this.finalPhase ? '#c084fc' : (this.awakened ? '#f43f5e' : '#be123c');
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-5.5, 0);
    ctx.lineTo(5.5, 0);
    ctx.lineTo(6.8, 19);
    ctx.lineTo(0, 26);
    ctx.lineTo(-6.8, 19);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 4. Center Belt Buckle Medallion
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pelvis.sx, pelvis.sy - 5);
    ctx.lineTo(pelvis.sx + 5, pelvis.sy);
    ctx.lineTo(pelvis.sx, pelvis.sy + 5);
    ctx.lineTo(pelvis.sx - 5, pelvis.sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  drawGothicCuirass(ctx, pelvis, chest, neck, lShoulder, rShoulder, time) {
    ctx.save();
    // 1. Articulated Abdominal Plackart (Waist-to-Chest Plate)
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(lShoulder.sx * 0.85 + chest.sx * 0.15, chest.sy);
    ctx.lineTo(rShoulder.sx * 0.85 + chest.sx * 0.15, chest.sy);
    ctx.lineTo(pelvis.sx + 15, pelvis.sy + 2);
    ctx.lineTo(pelvis.sx, pelvis.sy + 6);
    ctx.lineTo(pelvis.sx - 15, pelvis.sy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. Sculpted Gothic Upper Breastplate (V-Tapered Cuirass)
    const torsoGrad = ctx.createLinearGradient(lShoulder.sx, chest.sy - 14, rShoulder.sx, pelvis.sy);
    torsoGrad.addColorStop(0, '#334155');
    torsoGrad.addColorStop(0.5, '#0f1420');
    torsoGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = torsoGrad;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(lShoulder.sx, lShoulder.sy - 3);
    ctx.lineTo(neck.sx - 6, neck.sy - 4);
    ctx.lineTo(neck.sx + 6, neck.sy - 4);
    ctx.lineTo(rShoulder.sx, rShoulder.sy - 3);
    ctx.lineTo(chest.sx + 14, chest.sy + 10);
    ctx.lineTo(chest.sx, pelvis.sy - 2);
    ctx.lineTo(chest.sx - 14, chest.sy + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fluted Gothic Rib Lines on Breastplate
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(lShoulder.sx * 0.6 + chest.sx * 0.4, lShoulder.sy + 2);
    ctx.lineTo(chest.sx - 3, chest.sy + 9);
    ctx.moveTo(rShoulder.sx * 0.6 + chest.sx * 0.4, rShoulder.sy + 2);
    ctx.lineTo(chest.sx + 3, chest.sy + 9);
    ctx.stroke();

    // 3. High Armored Gorget (Neck Collar) connecting Cuirass cleanly to Greathelm
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(neck.sx - 9, neck.sy - 1);
    ctx.quadraticCurveTo(neck.sx, neck.sy - 6, neck.sx + 9, neck.sy - 1);
    ctx.lineTo(neck.sx + 11, neck.sy + 5);
    ctx.quadraticCurveTo(neck.sx, neck.sy + 8, neck.sx - 11, neck.sy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // If both breakable Pauldrons are already shattered, flash the contoured cuirass armor plates directly on hit
    if (this.leftPauldronBroken && this.rightPauldronBroken && this.hitFlashTimer > 0) {
      const fAlpha = Math.min(1, this.hitFlashTimer / 0.085) * 0.55;
      ctx.fillStyle = this.hasSuperArmor() ? `rgba(251, 113, 133, ${fAlpha})` : `rgba(248, 250, 252, ${fAlpha})`;
      ctx.fill();
    }

    // 4. Abyssal Eclipse Heart Core Set Into Breastplate
    const centerX = chest.sx + Math.cos(this.facingAngle) * 5;
    const centerY = chest.sy + 2;
    ctx.fillStyle = this.isCounterable() ? '#38bdf8' : (this.finalPhase ? '#c084fc' : (this.awakened ? '#fda4af' : '#f43f5e'));
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 8.5);
    ctx.lineTo(centerX + 4.8, centerY);
    ctx.lineTo(centerX, centerY + 9.5);
    ctx.lineTo(centerX - 4.8, centerY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawArticulatedArm(ctx, shoulder, elbow, hand) {
    ctx.save();
    // 1. Shoulder-to-Elbow Rerebrace Plate
    const upperAng = Math.atan2(elbow.sy - shoulder.sy, elbow.sx - shoulder.sx);
    const upperLen = Math.hypot(elbow.sx - shoulder.sx, elbow.sy - shoulder.sy);
    ctx.save();
    ctx.translate(shoulder.sx, shoulder.sy);
    ctx.rotate(upperAng);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-3, -4.8, upperLen + 5, 9.6, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 2. Elbow-to-Wrist Fluted Vambrace Plate
    const foreAng = Math.atan2(hand.sy - elbow.sy, hand.sx - elbow.sx);
    const foreLen = Math.hypot(hand.sx - elbow.sx, hand.sy - elbow.sy);
    ctx.save();
    ctx.translate(elbow.sx, elbow.sy);
    ctx.rotate(foreAng);
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2, -5.2);
    ctx.lineTo(foreLen + 2, -4.0);
    ctx.lineTo(foreLen + 2, 4.0);
    ctx.lineTo(-2, 5.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Winged Couter (Elbow Guard)
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(elbow.sx, elbow.sy, 5.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. Articulated War Gauntlet
    ctx.save();
    ctx.translate(hand.sx, hand.sy);
    ctx.rotate(foreAng);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-4.5, -5.0, 9.5, 10.0, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  drawTieredPauldron(ctx, shoulder, elbow, sideSign) {
    ctx.save();
    const armAng = Math.atan2(elbow.sy - shoulder.sy, elbow.sx - shoulder.sx);
    const flareTilt = (armAng - Math.PI * 0.5) * 0.35 + sideSign * 0.22;
    ctx.translate(shoulder.sx, shoulder.sy - 2);
    ctx.rotate(flareTilt);

    // Independent Breakable Pauldrons: Left Pauldron (sideSign === -1) & Right Pauldron (sideSign === 1)
    // Only physical cracks on the shoulder armor itself indicate break progress!
    const isLeft = (sideSign === -1);
    const isBroken = isLeft ? this.leftPauldronBroken : this.rightPauldronBroken;
    const isBreakablePauldron = !isBroken;
    const curBreak = isLeft ? this.leftPartBreak : this.rightPartBreak;
    const curFlashTimer = isLeft ? this.leftPauldronFlashTimer : this.rightPauldronFlashTimer;
    const breakRatio = isBreakablePauldron ? Math.min(1, curBreak / (this.partBreakMax || 1150)) : 0;
    const flashT = isBreakablePauldron ? Math.max(curFlashTimer / 0.12, 0) : 0;

    for (let tier = 2; tier >= 0; tier--) {
      const yOff = tier * 5.2;
      const w = 14.5 - tier * 1.2;
      const h = 8.8;
      ctx.fillStyle = tier === 0 ? '#1e293b' : '#0f172a';
      ctx.strokeStyle = tier === 0 ? '#cbd5e1' : '#64748b';
      ctx.lineWidth = 1.6;

      ctx.beginPath();
      ctx.moveTo(-w * 0.78, yOff - 3);
      ctx.quadraticCurveTo(0, yOff - 7.5, w * 0.88, yOff - 2);
      ctx.lineTo(w, yOff + h * 0.62);
      ctx.quadraticCurveTo(0, yOff + h, -w, yOff + h * 0.52);
      ctx.closePath();
      ctx.fill();

      // Subtle white/crimson hit flash on the struck pauldron polygon
      if (isBreakablePauldron && flashT > 0) {
        const alpha = Math.min(1, flashT) * 0.65;
        ctx.fillStyle = this.hasSuperArmor() ? `rgba(251, 113, 133, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }
      ctx.stroke();

      // Draw progressive physical fracture cracks directly on the shoulder armor plates as it takes damage
      if (isBreakablePauldron && breakRatio > 0.12) {
        ctx.save();
        ctx.strokeStyle = breakRatio > 0.68
          ? `rgba(248, 250, 252, ${0.55 + breakRatio * 0.42})`
          : `rgba(148, 163, 184, ${0.42 + breakRatio * 0.45})`;
        ctx.lineWidth = 1.1 + breakRatio * 0.85;
        ctx.beginPath();
        ctx.moveTo(-w * 0.32 * sideSign, yOff - 4);
        ctx.lineTo(w * 0.08 * sideSign, yOff + 1);
        if (breakRatio > 0.38) {
          ctx.lineTo(-w * 0.18 * sideSign, yOff + h * 0.68);
          ctx.moveTo(w * 0.08 * sideSign, yOff + 1);
          ctx.lineTo(w * 0.52 * sideSign, yOff + 3.6);
        }
        if (breakRatio > 0.68) {
          ctx.moveTo(w * 0.35 * sideSign, yOff - 3.2);
          ctx.lineTo(-w * 0.05 * sideSign, yOff + 2.2);
          ctx.lineTo(-w * 0.48 * sideSign, yOff + 4.2);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawGreathelmAndPlume(ctx, neck, head) {
    ctx.save();
    const hx = head.sx, hy = head.sy;
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);

    // 1. Flowing Plume anchored directly to Crown of Greathelm with strict screen-space segment clamping
    const pPts = [];
    const maxPlumeSeg = 9.5;
    for (let idx = 0; idx < this.plumeNodes.length; idx++) {
      const n = this.plumeNodes[idx];
      if (idx === 0) {
        pPts.push({ x: hx, y: hy - 10 });
      } else {
        let sx = n.x;
        let sy = this.y + (n.y - this.y) * PERSPECTIVE_TILT - n.z;
        const prev = pPts[idx - 1];
        const dx = sx - prev.x;
        const dy = sy - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxPlumeSeg) {
          sx = prev.x + (dx / dist) * maxPlumeSeg;
          sy = prev.y + (dy / dist) * maxPlumeSeg;
        }
        pPts.push({ x: sx, y: sy });
      }
    }
    ctx.beginPath();
    for (let i = 0; i < pPts.length; i++) {
      const w = 2.5 + i * 1.15;
      if (i === 0) ctx.moveTo(pPts[i].x, pPts[i].y);
      else ctx.lineTo(pPts[i].x - w * 0.5, pPts[i].y - w);
    }
    for (let i = pPts.length - 1; i >= 0; i--) {
      const w = 2.5 + i * 1.15;
      ctx.lineTo(pPts[i].x + w * 0.5, pPts[i].y + w * 0.6);
    }
    ctx.closePath();
    ctx.fillStyle = this.finalPhase ? '#a855f7' : '#e11d48';
    ctx.fill();
    ctx.strokeStyle = this.finalPhase ? '#f3e8ff' : '#fda4af';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // 2. Neck Mail Guard bridging Neck Gorget & Greathelm
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(neck.sx - 7, neck.sy + 2);
    ctx.lineTo(hx - 7.5, hy + 5);
    ctx.lineTo(hx + 7.5, hy + 5);
    ctx.lineTo(neck.sx + 7, neck.sy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Crowned Obsidian Greathelm
    ctx.fillStyle = '#0f1420';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx, hy - 13);
    ctx.lineTo(hx + 9.8, hy - 5);
    ctx.lineTo(hx + 8.2 + cosA * 3, hy + 7);
    ctx.lineTo(hx + cosA * 4.2, hy + 11.5);
    ctx.lineTo(hx - 8.2 + cosA * 3, hy + 7);
    ctx.lineTo(hx - 9.8, hy - 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Greathelm Side Horns / Crest Spikes
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = this.finalPhase ? '#e9d5ff' : '#94a3b8';
    ctx.lineWidth = 1.3;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + s * 7.5, hy - 4);
      ctx.lineTo(hx + s * 13.5, hy - 15);
      ctx.lineTo(hx + s * 4.5, hy - 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Glowing Visor Eye Slit
    if (sinA > -0.65) {
      const visorX = hx + cosA * 5.5;
      const visorY = hy + sinA * 2.5 * PERSPECTIVE_TILT;
      ctx.strokeStyle = this.state === 'staggered' ? '#64748b' : (this.finalPhase ? '#f3e8ff' : '#ffffff');
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(visorX - 5.8, visorY - 1.5);
      ctx.lineTo(visorX, visorY + 1.4);
      ctx.lineTo(visorX + 5.8, visorY - 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawObsidianGreatsword(ctx, rHand, lHand, swordTip, activeSlashArc) {
    ctx.save();
    const isEmpowered = this.swordEmpowered || this.finalPhase;
    // Hard clock mechanic: the mirror step's blade trail and arc are blue (matches the blue slash ribbon)
    const mirrorBlue = this.state === 'horizon_mechanic' && this.horizonPhase === 'show_memory' &&
      this.horizonIsFake(this.horizonSlashIndex) && (1.0 - this.horizonTimer / (this.horizonMaxTimer || 1.5)) >= 0.3;

    // 1. Zero-Lag Sword Ribbon Trail
    if (this.swordTrail.length > 2) {
      for (let i = 1; i < this.swordTrail.length; i++) {
        const p0 = this.swordTrail.at(i - 1), p1 = this.swordTrail.at(i);
        if (Math.hypot(p1.tx - p0.tx, p1.ty - p0.ty) > 4) {
          const frac = i / this.swordTrail.length;
          ctx.beginPath();
          ctx.moveTo(p0.hx, p0.hy);
          ctx.lineTo(p0.tx, p0.ty);
          ctx.lineTo(p1.tx, p1.ty);
          ctx.lineTo(p1.hx, p1.hy);
          ctx.closePath();
          ctx.fillStyle = mirrorBlue
            ? `rgba(56, 189, 248, ${frac * 0.6})`
            : isEmpowered
            ? `rgba(192, 132, 252, ${frac * 0.46})`
            : (this.awakened ? `rgba(225, 29, 72, ${frac * 0.38})` : `rgba(148, 163, 184, ${frac * 0.22})`);
          ctx.fill();
        }
      }
    }

    // 2. Active Slash Arc (Zero-Lag Multi-Pass Additive Stroke)
    if (activeSlashArc) {
      ctx.save();
      ctx.translate(this.x, this.y - 24);
      ctx.scale(1, PERSPECTIVE_TILT);
      ctx.rotate(this.facingAngle);
      const alpha = Math.sin(activeSlashArc.prog * Math.PI);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = mirrorBlue ? `rgba(14, 116, 220, ${alpha * 0.55})` : isEmpowered ? `rgba(168, 85, 247, ${alpha * 0.45})` : `rgba(225, 29, 72, ${alpha * 0.45})`;
      ctx.lineWidth = 36 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, 88, -1.35, 1.35);
      ctx.stroke();

      ctx.strokeStyle = mirrorBlue ? `rgba(125, 211, 252, ${alpha * 0.95})` : isEmpowered ? `rgba(254, 240, 138, ${alpha * 0.90})` : `rgba(244, 63, 94, ${alpha * 0.85})`;
      ctx.lineWidth = 18 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, 88, -1.35, 1.35);
      ctx.stroke();
      ctx.restore();
    }

    let hx = rHand.sx, hy = rHand.sy;
    if (
      this.state === 'final_phase_mechanic' &&
      (this.finalMechPhase === 'roar_qte_spirit_bomb' || this.finalMechPhase === 'spirit_bomb_wipe')
    ) {
      const plantedHilt = this.localToWorld(22, 0, 56);
      hx = plantedHilt.sx;
      hy = plantedHilt.sy;
    }
    const tx = swordTip.sx, ty = swordTip.sy;
    const bladeAng = Math.atan2(ty - hy, tx - hx);
    const bladeLen = Math.hypot(tx - hx, ty - hy);
    ctx.translate(hx, hy);
    ctx.rotate(bladeAng);

    // 3. Long Two-Handed Grip & Pommel extending behind rHand so both hands grip the hilt naturally
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-16, -2.5, 18, 5, 2);
    ctx.fill();
    ctx.stroke();
    // Heavy Clawed Pommel
    ctx.fillStyle = isEmpowered ? '#c084fc' : '#e11d48';
    ctx.beginPath();
    ctx.arc(-18, 0, 4.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. Winged Obsidian Crossguard
    ctx.fillStyle = '#0f1420';
    ctx.strokeStyle = isEmpowered ? '#fde047' : '#cbd5e1';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(2, -17);
    ctx.lineTo(9, -5.5);
    ctx.lineTo(9, 5.5);
    ctx.lineTo(2, 17);
    ctx.lineTo(-2.5, 12.5);
    ctx.lineTo(1, 0);
    ctx.lineTo(-2.5, -12.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 5. Empowered Eclipse Aura around the Blade (when Final Phase / Sword Empowered)
    if (isEmpowered) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(168, 85, 247, 0.35)';
      ctx.beginPath();
      ctx.moveTo(4, -10.5);
      ctx.lineTo(bladeLen + 8, 0);
      ctx.lineTo(4, 10.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 6. Colossal Zweihander Blade
    ctx.fillStyle = isEmpowered ? '#1e1b4b' : '#090b10';
    ctx.strokeStyle = this.isCounterable() ? '#38bdf8' : (isEmpowered ? '#fde047' : (this.awakened ? '#f43f5e' : '#e2e8f0'));
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(6, -6.8);
    ctx.lineTo(24, -8.5);
    ctx.lineTo(28, -6.0);
    ctx.lineTo(bladeLen - 16, -5.0);
    ctx.lineTo(bladeLen, 0);
    ctx.lineTo(bladeLen - 16, 5.0);
    ctx.lineTo(28, 6.0);
    ctx.lineTo(24, 8.5);
    ctx.lineTo(6, 6.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 7. Glowing Blood-Channel Fuller along Center of Blade
    ctx.strokeStyle = isEmpowered ? '#f0abfc' : '#f43f5e';
    ctx.lineWidth = isEmpowered ? 2.8 : 2.0;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(bladeLen * 0.78, 0);
    ctx.stroke();
    ctx.restore();
  }
}

window.VaelgorRaidBoss = VaelgorRaidBoss;


// ---------------------------------------------------------------------------
// PART BREAK ANIMATION: the plate flashes pure white, cracks race across it, then it bursts into shards (about 0.55s). The
// loot core (cores.js) only pops out once the shards fly, one per player on their own client.
// Runs on every client: breakPauldron() is replayed from the host's pauldron_break event.
// ---------------------------------------------------------------------------
(function () {
  const P = VaelgorRaidBoss.prototype;
  P.PART_BREAK_FX_DUR = 0.55;
  const origBreak = P.breakPauldron;
  P.breakPauldron = function (side, fromNetwork) {
    const was = side === 'left' ? this.leftPauldronBroken : this.rightPauldronBroken;
    const r = origBreak.apply(this, arguments);
    if (!was && (side === 'left' ? this.leftPauldronBroken : this.rightPauldronBroken)) {
      const cracks = [];
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2, pts = [[0, 0]];
        let x = 0, y = 0;
        for (let k = 0; k < 3; k++) { const aa = a + (Math.random() - 0.5) * 0.9, l = 6 + Math.random() * 9; x += Math.cos(aa) * l; y += Math.sin(aa) * l * 0.8; pts.push([x, y]); }
        cracks.push(pts);
      }
      const shards = Array.from({ length: 12 }, () => ({ a: Math.random() * Math.PI * 2, v: 90 + Math.random() * 140, s: 3 + Math.random() * 5, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 20 }));
      (this.partBreakFx = this.partBreakFx || []).push({ side, t: 0, cracks, shards });
    }
    return r;
  };
  const origUpdate = P.update;
  P.update = function (dt) {
    if (this.partBreakFx && this.partBreakFx.length) {
      for (const f of this.partBreakFx) f.t += dt;
      this.partBreakFx = this.partBreakFx.filter(f => f.t < this.PART_BREAK_FX_DUR + 0.6);
    }
    return origUpdate.apply(this, arguments);
  };
  const origDraw = P.draw;
  P.draw = function (ctx) {
    const r = origDraw.apply(this, arguments);
    if (!this.partBreakFx || !this.partBreakFx.length) return r;
    const D = this.PART_BREAK_FX_DUR;
    for (const f of this.partBreakFx) {
      const sh = (f.side === 'left' ? this.leftShoulderWorld : this.rightShoulderWorld);
      if (!sh) continue;
      if (f.x == null || f.t < D) { f.x = sh.sx; f.y = sh.sy; }     // follows the shoulder until it bursts
      const x = f.x, y = f.y, t = f.t;
      ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (t < D) {
        const flash = Math.min(1, t / 0.08), crack = Math.min(1, Math.max(0, (t - 0.1) / (D - 0.18)));
        const shake = t > D - 0.15 ? (Math.random() - 0.5) * 3 : 0;
        ctx.translate(shake, shake * 0.6);
        // the plate gone pure white
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(226,232,240,0)');
        ctx.globalAlpha = flash; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 26, 20, 0, 0, Math.PI * 2); ctx.fill();
        // cracks racing outward, drawn dark on the white
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9; ctx.strokeStyle = '#1e1b2e'; ctx.lineWidth = 1.6;
        for (const pts of f.cracks) {
          const n = Math.max(1, Math.ceil(crack * (pts.length - 1)));
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i <= n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.stroke();
        }
      } else {
        // the burst: a ring and shards flying off, spinning and fading
        const u = (t - D) / 0.6, a = 1 - u;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * a + 0.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 18 + 60 * u, (18 + 60 * u) * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        for (const s of f.shards) {
          const d = s.v * (t - D), px = Math.cos(s.a) * d, py = Math.sin(s.a) * d * 0.7 + 120 * (t - D) * (t - D);
          ctx.save(); ctx.translate(px, py); ctx.rotate(s.rot + s.spin * (t - D));
          ctx.beginPath(); ctx.moveTo(-s.s, -s.s * 0.4); ctx.lineTo(s.s, 0); ctx.lineTo(-s.s * 0.5, s.s * 0.6); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }
    return r;
  };
})();

// ---------------------------------------------------------------------------
// SKIP CUTSCENES (host's choice in the raid menu, for that one raid only; sent to guests in start_raid as skipCutscenes).
// The purely cinematic stretches are cut to about a second: the 75% eclipse cutscene, the 10% arena cutscene and the sword-absorb
// cutscene (the intro is skipped in comms.js). Each one's own timer and the camera shot are shortened together, beats that run on
// progress still play (faster), and the voice line is not heard. Playable parts (bait swords, dash counters, the roar QTE, stagger
// checks, the Final Clash windup) are never touched.
// ---------------------------------------------------------------------------
(function () {
  const P = VaelgorRaidBoss.prototype;
  const SKIP_LEN = 1.0;
  P.skippingCutscenes = function () {
    const g = window.game;
    return !!(g && g.mode === 'raid' && g.skipCutscenes && !this.practiceClockMode && !this.practiceFinalPhaseMode && !this.practiceFinalClashMode);
  };
  const cut = (boss) => {
    const cam = window.game && window.game.camera;
    if (cam && cam.cinematicTimer > SKIP_LEN) { cam.cinematicTimer = SKIP_LEN; cam.cinematicMaxTimer = SKIP_LEN; }
    try { if (audio.currentVoiceAudio) { audio.currentVoiceAudio.pause(); audio.currentVoiceAudio.currentTime = 0; } } catch (e) { }
  };
  const wrap = (name, after) => {
    const orig = P[name];
    if (typeof orig !== 'function') return;
    P[name] = function () {
      const r = orig.apply(this, arguments);
      if (this.skippingCutscenes()) { after(this); cut(this); }
      return r;
    };
  };
  wrap('triggerMechanicEclipse', (b) => { if (b.eclipsePhase === 'cutscene') { b.eclipseMaxTimer = SKIP_LEN; b.eclipseTimer = SKIP_LEN; } });
  wrap('triggerMechanicFinalPhase', (b) => { if (b.finalMechPhase === 'arena_cutscene') { b.finalMechMaxTimer = SKIP_LEN; b.finalMechTimer = SKIP_LEN; } });
  wrap('enterFinalSwordAbsorbCutscene', (b) => { if (b.finalMechPhase === 'sword_absorb_cutscene') { b.finalMechMaxTimer = SKIP_LEN * 1.4; b.finalMechTimer = SKIP_LEN * 1.4; } });
})();
