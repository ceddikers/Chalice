// =========================================================================
// BOSS_HUSH.JS â€” Hush, the porcelain guardian of a sealed nursery (the third Chalice raid, SOLO ONLY). Logic only:
//   boss_hush_pats.js  her attack patterns (PATS) and Rebuke table
//   boss_hush_rig.js   her model and poses
//   boss_hush_stage.js the nursery, floor telegraphs, mechanic props, things in the air and the screen overlays
//
// Built on VaelgorRaidBoss like Ignis, so every shared system keeps working (stagger bar, counters, Rebuke, the Karok Clash,
// holds, loot cores, raid stats, accessories, difficulty): Vaelgor's own update / draw / receiveDamage / breakPauldron /
// resetBoss / intro each start with a `core*` hook.
//
// THE FIGHT (spoilers live in this file only; the player is meant to discover all of it)
//   DROWSINESS  each player's own sleepiness (0-100). It rises while her lullaby plays (more if you stand around) and when her
//               ribbon touches you; it falls when you hit her (porcelain cracking is loud) and slowly on its own. It is only
//               shown as eyelids closing at the edges of the screen. Full: you fall asleep for a moment and she tucks you in.
//   BREAKS      'left' part = the wind-up KEY in her back (struck from behind): she winds down (slower for a while, a little
//               slower for good). 'right' part = her painted MASK (struck head-on): her lullaby loses its grip on you.
//   70%  NIGHTLIGHT  the lights go out. Shadow toys creep in from the dark. Carry the nightlight to her chair and shine it in
//                    her eyes before the dark closes in.
//   55%  WIND-UP     she winds her own key: faster, harder, new moves, the second half of her music.
//   40%  DOLLHOUSE   the nursery folds into a dollhouse room around you: gather the three glowing memories while her hand and
//                    eye search the room.
//   10%  LAST VERSE  she rises on her strings and sings the last verse: cut the three strings (hit her from the side whose string
//                    is glowing) before the verse ends, and dash through each Lights Out. All three cut: she falls.
//   Normal: a failed Nightlight / Dollhouse comes back ONCE 20s later; a failed Last Verse always comes back. Hard: failing wipes.
// =========================================================================
(function () {
  if (typeof VaelgorRaidBoss === 'undefined') return;
  const TAU = Math.PI * 2;
  const T = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.58);
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
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
  const CHAIR = { x: 0, y: -330 };            // her rocking chair, at the far side of the rug
  const ROOM_R = 290;                          // the dollhouse room
  const HP_BASE = 241500;                      // = Vaelgor's effective HP after the x1.5 pass (no reset phase)

  // ---- her lines (subtitle text; each one also has a recorded clip, see VOICE) ----------------------------------------------
  const LINES = {
    intro: '"Shh... it\'s past your bedtime, little one."',
    intro2: '"Let me tuck you in."',
    open: ['"Hush now."', '"Close your eyes."', '"There, there."', '"Don\'t cry."'],
    hitPlayer: ['"Shh, shh, shh."', '"That\'s it... lie down."', '"Too loud."'],
    down: ['"Sweet dreams."', '"Sleep tight."'],
    counter: ['"Naughty."', '"Ow... that wasn\'t nice."'],
    rebuke: ['"No pushing."', '"Hands to yourself."'],
    stagger: ['"My strings...!"', '"Something came loose..."', '"I can\'t see the stars..."'],
    keyBreak: '"My key... the music is slowing down..."',
    maskBreak: '"Don\'t look at my face. Don\'t LOOK at it."',
    verse: ['"Close your eyes... the moon is watching."', '"Hush, little one... hush..."'],
    sleep: '"There we go. All tucked in."',
    nightlight: '"Who left the light on? Let\'s fix that."',
    nightlightWin: '"Too bright... too BRIGHT!"',
    nightlightFail: '"The dark is kinder. You\'ll see."',
    act2: '"Let me wind myself up... just a little more."',
    dollhouse: '"Come inside. I kept all your old toys."',
    dollhouseWin: '"Those were... mine... weren\'t they?"',
    dollhouseFail: '"You didn\'t touch a thing. Good child."',
    finale: '"One last verse. Then we sleep forever."',
    finaleWin: '"My strings... I\'m falling..."',
    finaleFail: '"The verse is over. Goodnight."',
    karokStart: '"Hold still. Let me sew you shut."',
    clashWin: '"You... caught it?"',
    clashLoss: '"One more stitch."',
    berserk: '"No more waking. NO MORE."',
    retry: '"Again. We\'ll do it again until you sleep."',
    death: '"...Okay. Goodnight."'
  };

  // ---- her recorded voice: game/sounds/Hush/hush_<file>.mp3 (looked up by the exact line text) -------------------------------
  const VOICE = {};
  const SOUND_DIR = 'game/sounds/Hush/hush_';
  const voice = (text, file, pri = 2) => { VOICE[text] = { key: 'hs_' + file, file, pri, text: text.replace(/^"|"$/g, '') }; };
  voice(LINES.intro, 'intro', 4); voice(LINES.intro2, 'intro_2', 4);
  [['open', 'open'], ['hitPlayer', 'hit'], ['down', 'down'], ['counter', 'counter'], ['rebuke', 'rebuke'], ['stagger', 'stagger'], ['verse', 'verse']]
    .forEach(([list, file]) => LINES[list].forEach((t, i) => voice(t, file + '_0' + (i + 1), list === 'verse' ? 4 : 2)));
  [['keyBreak', 'key_break'], ['maskBreak', 'mask_break'], ['sleep', 'sleep'], ['nightlight', 'nightlight'], ['nightlightWin', 'nightlight_win'],
    ['nightlightFail', 'nightlight_fail'], ['act2', 'act2'], ['dollhouse', 'dollhouse'], ['dollhouseWin', 'dollhouse_win'], ['dollhouseFail', 'dollhouse_fail'],
    ['finale', 'finale_line'], ['finaleWin', 'finale_win'], ['finaleFail', 'finale_fail'], ['karokStart', 'karok_start'], ['clashWin', 'clash_win'],
    ['clashLoss', 'clash_loss'], ['berserk', 'berserk'], ['retry', 'retry']].forEach(([k, file]) => voice(LINES[k], file, 3));
  voice(LINES.death, 'death', 5);
  const GRUNTS = { giggle_01: 1, giggle_02: 1, hum_01: 1, hum_02: 1, shh: 2, crack: 2, effort_01: 1, effort_02: 1 };
  if (typeof audio !== 'undefined' && audio && audio.voiceMetadata) {
    for (const v of Object.values(VOICE)) audio.voiceMetadata[v.key] = { src: SOUND_DIR + v.file + '.mp3', text: v.text, duration: 2.6, priority: v.pri, volume: 0.98, lazy: true };
    for (const [file, pri] of Object.entries(GRUNTS)) audio.voiceMetadata['hs_' + file] = { src: SOUND_DIR + file + '.mp3', text: '', duration: 1.5, priority: pri, volume: 0.9, lazy: true };
  }
  const MUSIC = {
    hs_phase1: 'game/sounds/Hush/hush_phase_1.mp3',
    hs_phase2: 'game/sounds/Hush/hush_phase_2.mp3',
    hs_mechanic: 'game/sounds/Hush/hush_mechanics.mp3',
    hs_finale: 'game/sounds/Hush/hush_finale.mp3'
  };

  // a music-box phrase (synth bell tones): her lullaby motif, used for verses, the intro and the death
  const MOTIF = [659, 784, 880, 784, 659, 587, 523, 587, 659, 523];
  function playMotif(speed = 1, vol = 0.12, from = 0, count = MOTIF.length) {
    if (typeof audio === 'undefined' || !audio || !audio.playBellTone) return;
    for (let i = 0; i < count; i++) {
      const f = MOTIF[(from + i) % MOTIF.length];
      setTimeout(() => { try { audio.playBellTone(f, 0.9, vol); audio.playBellTone(f * 2, 0.5, vol * 0.25); } catch (e) {} }, i * 330 / speed);
    }
  }

  // asleep players can't attack or take move orders (shared canAct / setMoveTarget, wrapped once per class prototype)
  function wrapSleep(p) {
    const proto = p && Object.getPrototypeOf(p);
    if (!proto || Object.prototype.hasOwnProperty.call(proto, '_hsSleepWrap')) return;
    proto._hsSleepWrap = true;
    const oCan = proto.canAct, oMove = proto.setMoveTarget;
    if (typeof oCan === 'function') proto.canAct = function () { return this.hushSleep > 0 ? false : oCan.apply(this, arguments); };
    if (typeof oMove === 'function') proto.setMoveTarget = function () { if (this.hushSleep > 0) return; return oMove.apply(this, arguments); };
  }

  class HushBoss extends VaelgorRaidBoss {
    constructor(x, y) {
      super(x, y);
      this.isHush = true;
      this.raidId = 'hush';
      this.soloOnly = true;
      this.name = 'Hush, the Lullaby Warden';
      this.hudName = 'HUSH';
      this.speakerName = 'HUSH';
      this.subtitle = 'THE LULLABY WARDEN â€¢ THE SEALED NURSERY';
      this.modelScale = 1.85;
      this.hipWidth = 5.2;
      this.thighLen = 23;
      this.shinLen = 23;
      this.turnSpeed = 6.5;
      this.hushInit();
      this.snapFeetToBody();
    }

    hushInit() {
      this.phase = 1;
      this.act2 = false; this.act2Done = false;
      this.mech70 = false; this.mech40 = false; this.mech10 = false; this.pendingMech = null;
      this.mechRetried = {}; this.mechRetry = null;
      this.mech = null;
      this.teles = []; this.hazards = []; this.proj = []; this.vfx = []; this.minions = [];
      this.pat = null; this.patT = 0; this._patPrev = 0; this.patRng = Math.random;
      this.keyBroken = false; this.maskBroken = false; this.windDownT = 0;
      this.verse = null; this._verseAt = 0; this._quietUntil = 0;
      this.lastDownCount = 0; this.patSerial = 0;
      this.clones = null; this.unravel = null; this.lights = null;
      this.karokStyle = 'blade';
      this.karokLane = { fill: '226, 232, 240', edge: '253, 230, 138', len: 330, half: 60 };
      // Vaelgor's own phase machinery stays switched off
      this.eclipse75Triggered = this.eclipse55Triggered = this.eclipse35Triggered = this.eclipse10Triggered = true;
      this.finalPhase = false; this.finalTransitionPending = false; this.finalTransitionActive = false;
      this.finalClash15Triggered = true;
    }

    get maxSpeed() { return (this.enraged && this.enrageTimer <= 0) ? 185 : (this.act2 ? 150 : 132); }
    outgoingDamageMult() {
      if (this.enraged && this.enrageTimer <= 0) return 2.2;
      let m = 1;
      if (this.act2) m *= 1.1;
      if (this.phase >= 3) m *= 1.05;
      return m;
    }
    patRate() {
      if (['staggered', 'rebuked', 'flinched', 'intro_cutscene'].indexOf(this.state) >= 0) return 1;
      let r = this.phase >= 3 ? 1.16 : (this.phase === 2 ? 1.08 : 1.0);
      if (this.act2) r *= 1.06;
      if (this.keyBroken) r *= 0.95;
      if (this.windDownT > 0) r *= 0.72;          // wound down: the music box is running out
      if (this.enraged && this.enrageTimer <= 0) r = Math.max(r, 1.32);
      return r;
    }
    applyLobbyScaling(partySize = 1, resetHp = false) {
      const n = Math.max(1, partySize || 1);
      const prevFrac = this.maxHp > 0 ? c01(this.hp / this.maxHp) : 1;
      this.maxHp = Math.round(HP_BASE * (1 + (n - 1) * 0.85));     // solo only, but stays sane if a party ever got in
      this.hp = resetHp ? this.maxHp : Math.max(1, Math.round(this.maxHp * prevFrac));
      this.maxStagger = 4000;
      this.partBreakMax = 1050;
      this.partySizeNow = n;
    }
    applyEnrage(fromNetwork = false) {
      if (this.enraged && this.enrageTimer <= 0) return;
      this.enrageTimer = 0; this.enraged = true; this.awakened = true;
      audio.playImpactBoom(2.0);
      if (window.fx) { window.fx.triggerShake(26, 0.7); window.fx.addShockwave(this.x, this.y, 380, '#fde68a', 9); window.fx.triggerScreenFlash && window.fx.triggerScreenFlash('#0b1024', 0.4); }
      this.say(LINES.berserk, 3.2, true);
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------------------------------------------------------------
    say(text, dur = 2.8, force = false) {
      if (!text || typeof audio === 'undefined' || !audio) return;
      if (!force && performance.now() < (this._quietUntil || 0)) return;
      const v = VOICE[text];
      if (v && !audio.muted && audio.playBossVoiceClip) {
        audio.playBossVoiceClip(v.key, null, force);
        if (audio.currentVoiceKey === v.key) return;
        if (audio.isVoicePlaying && audio.isVoicePlaying()) return;
      }
      audio.voiceSubtitleText = text.replace(/^"|"$/g, '');
      audio.voiceSubtitleMaxTimer = dur;
      audio.voiceSubtitleTimer = dur;
    }
    cueSay(text, dur) { this._quietUntil = performance.now() + dur * 1000; this.say(text, dur, true); }
    grunt(file) {
      if (performance.now() < (this._quietUntil || 0)) return;
      if (typeof audio === 'undefined' || !audio || audio.muted || !audio.playBossVoiceClip) return;
      if (audio.isVoicePlaying && audio.isVoicePlaying()) return;
      audio.playBossVoiceClip('hs_' + file);
    }
    get musicFiles() { return MUSIC; }
    musicKeyFor(base) {
      if (this.mech10 || this.state === 'finale_mechanic') return 'hs_finale';
      if (base === 'mechanic') return 'hs_mechanic';
      return (this.act2 || this.phase >= 3 || (this.enraged && this.enrageTimer <= 0)) ? 'hs_phase2' : 'hs_phase1';
    }
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
    vfxAdd(o) { o.t = 0; if (o.x == null) { o.x = this.x; o.y = this.y; } this.vfx.push(o); if (this.vfx.length > 120) this.vfx.shift(); return o; }
    hurt(p, dmg, label, power = 'medium', sx = this.x, sy = this.y, push = 110) {
      if (!p || p.hp <= 0 || !(p.isLocal || p.isBot)) return;
      p.takeDamage(Math.round(dmg * this.outgoingDamageMult()), label, { power, sourceX: sx, sourceY: sy, pushDist: push });
      if (p.isLocal && power === 'heavy' && !this.isMech() && !(audio && audio.voiceSubtitleTimer > 0) && performance.now() > (this._jabAt || 0) && Math.random() < 0.35) {
        this._jabAt = performance.now() + 9000;
        this.say(this.pick(LINES.hitPlayer), 1.8);
      }
    }
    hitSectorP(L, r0, r1, a, half, dmg, label, power, push) { this.damagePlayersInSector(L, this.x, this.y, r0, r1, a, half, dmg, label, power, push); }
    hitCorridorP(L, x, y, a, len, hw, dmg, label, power, push) { this.damagePlayersInCorridor(L, x, y, a, len, hw, dmg, label, power, push); }
    hitCircle(L, x, y, r, dmg, label, power = 'medium', push = 120) { this.damagePlayersInRadius(L, x, y, r, dmg, label, power, push); }
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
    isMech() { return MECH_RE.test(this.state || ''); }
    isWarded() { return !!(this.mech && this.mech.warded); }
    isUntargetable() {
      const m = this.mech;
      if (!m) return this.state === 'intro_cutscene';
      if (m.kind === 'nightlight') return m.phase !== 'blind';
      if (m.kind === 'dollhouse') return true;
      if (m.kind === 'act2') return true;
      return false;
    }
    holdBlocked() { return this.isMech() || this.state === 'intro_cutscene'; }
    hudTag() {
      if (this.hp <= 0) return '';
      if (this.isMech()) return this.mech && this.mech.kind === 'finale' && this.mech.phase === 'down' ? '' : ' â€¢ WARDED';
      if (this.windDownT > 0) return ' â€¢ WOUND DOWN';
      return '';
    }
    isInCutscene() { return this.state === 'intro_cutscene'; }
    static get CHAIR() { return CHAIR; }
    static get ROOM_R() { return ROOM_R; }

    // break points: left = the wind-up key in her back, right = her mask (struck head-on)
    getShoulderWorldPositions() {
      const a = this.facingAngle, cs = Math.cos(a), sn = Math.sin(a), S = this.modelScale;
      const key = { x: this.x - 12 * cs * S, y: this.y - 12 * sn * S * T() };
      const mask = { x: this.x + 14 * cs * S, y: this.y + 14 * sn * S * T() };
      const L = this.leftShoulderWorld || (this.leftShoulderWorld = {}), R = this.rightShoulderWorld || (this.rightShoulderWorld = {});
      L.x = key.x; L.y = key.y; R.x = mask.x; R.y = mask.y;
      L.sx = key.x; L.sy = key.y - 66 * S - (this.jumpZ || 0); R.sx = mask.x; R.sy = mask.y - 84 * S - (this.jumpZ || 0);
      return { left: L, right: R };
    }
    breakCoreName(side) { return side === 'left' ? 'KEY CORE' : 'MASK CORE'; }

    recordExecutedPattern(name) {
      if (MECH_RE.test(name) || name === 'intro_cutscene') return;
      this.recentPatterns.push(name);
      while (this.recentPatterns.length > 2) this.recentPatterns.shift();
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // reset / intro
    // ---------------------------------------------------------------------------------------------------------------------------
    coreReset(x, y) {
      for (const p of party()) if (p) { p.qteActive = false; p.rooted = false; p.hushDrowsy = 0; p.hushSleep = 0; p.hsCarry = false; }
      this.x = x; this.y = y; this.spawnX = x; this.spawnY = y;
      this.applyLobbyScaling(party().length || 1, true);
      this.stagger = 0;
      this.enrageMaxTimer = 330; this.enrageTimer = 330; this.enraged = false; this.awakened = false;   // Hard 5:30 (Normal: difficulty.js)
      this.leftPartBreak = this.rightPartBreak = 0; this.leftPauldronBroken = this.rightPauldronBroken = false;
      this.partBreak = 0; this.pauldronBroken = false;
      this.recentPatterns = []; this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 1.4;
      this.recoilX = this.recoilY = this.recoilVx = this.recoilVy = 0;
      this.hitFlashTimer = 0; this.leftPauldronFlashTimer = this.rightPauldronFlashTimer = 0;
      this.hitStutterTimer = 0; this.lockedByUltimateTimer = 0; this.jumpZ = 0;
      this.counterableWindow = false;
      this.threatMap.clear(); this.activeTargetId = null; this.targetReevalTimer = 0;
      this.practiceClockMode = this.practiceFinalPhaseMode = this.practiceFinalClashMode = false;
      this.hushInit();
      this.facingAngle = Math.PI * 0.5;
      this.snapFeetToBody();
      if (this.resetRig) this.resetRig();
    }

    // INTRO: the camera finds her in her rocking chair facing away, humming. The music box winds down; her head turns all the way
    // round to look at you; she stands joint by joint like something lifted on strings, and walks to the middle of the rug.
    coreIntro() {
      const skip = this.skippingCutscenes && this.skippingCutscenes();
      const D = skip ? 2.4 : 9.0;
      this.state = 'intro_cutscene';
      this.stateDuration = D; this.stateTimer = D; this.patT = 0; this._patPrev = 0;
      this._introShort = !!skip;
      this.counterableWindow = false; this.jumpZ = 0;
      this.x = CHAIR.x; this.y = CHAIR.y; this.facingAngle = -Math.PI * 0.5; this.baseFacing = this.facingAngle;
      this.speed = 0; this.vx = this.vy = 0; this.targetX = this.x; this.targetY = this.y;
      this.snapFeetToBody();
      if (this.resetRig) this.resetRig();
      const cam = window.game && window.game.camera;
      if (cam && typeof cam.startCinematicCutscene === 'function') {
        cam.x = this.x; cam.y = this.y - 60;
        cam.startCinematicCutscene(this.x, this.y - 60, D, 1.38, 'HUSH, THE LULLABY WARDEN', 'KEEPER OF THE SEALED NURSERY', skip ? LINES.intro2 : LINES.intro);
      }
      if (typeof audio !== 'undefined' && audio && audio.preloadVoiceGroup) audio.preloadVoiceGroup('hs_');
      if (skip) this.say(LINES.intro2, 2, true);
      else playMotif(0.9, 0.11, 0, 7);
    }
    tickIntro(dt) {
      const t = this.patT, D = this.stateDuration, short = this._introShort;
      const cam = window.game && window.game.camera;
      // beats (scaled into the short version when cutscenes are skipped)
      const k = short ? D / 9.0 : 1;
      const at = (s) => this.at(s * k);
      // she sits facing away, turns her head first (3.0), stands (4.4-6.0), turns and walks out to the rug (6.0-9.0)
      if (t < 6.0 * k) { this.x = CHAIR.x; this.y = CHAIR.y; this.facingAngle = t < 3.6 * k ? -Math.PI * 0.5 : lerp(-Math.PI * 0.5, Math.PI * 0.5, c01((t - 3.6 * k) / (1.4 * k))); }
      else {
        const s = c01((t - 6.0 * k) / (3.0 * k)), e = s * s * (3 - 2 * s);
        this.x = lerp(CHAIR.x, STAGE.x, e); this.y = lerp(CHAIR.y, STAGE.y - 60, e); this.facingAngle = Math.PI * 0.5;
        this.speed = s < 1 ? 60 : 0; this.vx = 0; this.vy = (STAGE.y - 60 - CHAIR.y) / (3.0 * k) * (s < 1 ? 1 : 0);
      }
      if (cam) { cam.cinematicTargetX = this.x; cam.cinematicTargetY = this.y - 70; }
      if (!short && at(1.2)) this.say(LINES.intro, 3.2, true);
      if (at(3.0)) { audio.playParryClang(false); this.grunt('giggle_01'); }      // the head clicks round
      if (at(4.4)) { audio.playImpactBoom(0.8); if (window.fx) window.fx.addShockwave(this.x, this.y, 160, '#e2e8f0', 3, 0.5); }
      if (!short && at(6.2)) this.say(LINES.intro2, 2.4, true);
      if (at(8.6)) { audio.playImpactBoom(1.3); if (window.fx) { window.fx.triggerShake(10, 0.3); window.fx.addShockwave(this.x, this.y, 260, '#fde68a', 5, 0.6); } }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // damage taken
    // ---------------------------------------------------------------------------------------------------------------------------
    coreReceiveDamage(dmg, staggerAmt, attacker, hitOpts) {
      if (this.hp <= 0 || this.state === 'intro_cutscene') return;
      const opts = hitOpts || {};
      if (!opts.fromNetwork && attacker && attacker.isRemote) return;
      const m = this.mech;
      // the Last Verse: hits from the glowing string's side cut that string; everything else barely scratches her
      if (m && m.kind === 'finale' && m.phase === 'strings') { this.finaleHit(dmg, attacker); return; }
      if (this.isUntargetable()) return;

      // her porcelain cracking is loud: whoever hits her wakes up a little
      if (attacker && attacker.isLocal) attacker.hushDrowsy = Math.max(0, (attacker.hushDrowsy || 0) - Math.min(7, 1.2 + dmg / 90));

      let side = opts.pauldronSide || null;
      const parts = this.getShoulderWorldPositions();
      let sx = opts.hitX, sy = opts.hitY;
      if (sx === undefined || sy === undefined) {
        if (attacker && attacker.x !== undefined) { const aa = attacker.facingAngle || 0; sx = attacker.x + Math.cos(aa) * 26; sy = attacker.y + Math.sin(aa) * 26 * T(); }
        else { sx = this.x; sy = this.y + 40; }
      }
      const dL = Math.hypot(sx - parts.left.x, (sy - parts.left.y) / T()), dR = Math.hypot(sx - parts.right.x, (sy - parts.right.y) / T());
      if (!side) side = dL < dR ? 'left' : 'right';
      if (attacker && attacker.id) this.addThreat(attacker.id, (dmg * 0.85 + staggerAmt * 7.5) * (opts.threatMult || (opts.isStrongMove ? 1.25 : 1)));

      let stagMult = 1;
      if (m && m.warded) { dmg = Math.max(1, Math.round(dmg * 0.05)); stagMult = 0; }

      // below 10% nothing gets through until the Last Verse is beaten
      const floor10 = Math.ceil(this.maxHp * 0.10), floor1 = Math.max(1, Math.ceil(this.maxHp * 0.01));
      if (!this.mech10) {
        if (this.hp - dmg <= floor10) {
          const over = Math.max(0, dmg - Math.max(0, this.hp - floor10));
          this.hp = Math.max(floor1, Math.min(this.hp, floor10) - Math.max(1, Math.round(over * 0.01)));
          if (!this.pendingMech && !this.isMech()) this.pendingMech = 'finale_mechanic';
        } else this.hp = Math.max(0, this.hp - dmg);
      } else this.hp = Math.max(0, this.hp - dmg);

      this.hitFlashTimer = 0.085;
      if (side === 'left' && !this.leftPauldronBroken) this.leftPauldronFlashTimer = Math.max(this.leftPauldronFlashTimer, 0.12);
      if (side === 'right' && !this.rightPauldronBroken) this.rightPauldronFlashTimer = Math.max(this.rightPauldronFlashTimer, 0.12);
      let hitAng = this.facingAngle + Math.PI;
      if (attacker && attacker.x !== undefined) hitAng = Math.atan2((this.y - attacker.y) / T(), this.x - attacker.x);
      const imp = opts.impulseStrength || (opts.isStrongMove ? 1.35 : 0.75);
      this.recoilVx += Math.cos(hitAng) * 130 * imp; this.recoilVy += Math.sin(hitAng) * 130 * imp;
      this.pelvisVelZ -= 22 * imp; this.pauldronVelZ -= 34 * imp;
      if (opts.isStrongMove && !this.isMech()) this.hitStutterTimer = Math.max(this.hitStutterTimer, 0.07);
      // porcelain chips fly off strong hits
      if (opts.isStrongMove && this.vfx.length < 110) this.vfxAdd({ k: 'chips', x: this.x, y: this.y, a: hitAng, life: 0.7, seed: Math.random() * 10 });

      const sAmt = staggerAmt * stagMult;
      if (sAmt > 0 && this.state !== 'staggered' && !this.isMech()) {
        this.stagger += sAmt;
        if (this.stagger >= this.maxStagger) { this.stagger = 0; this.hushStagger('ðŸ’¥ STAGGER BROKEN!'); }
      }

      // part breaks: the KEY from behind, the MASK head-on
      const pb = opts.partBreakMult !== undefined ? opts.partBreakMult : (opts.isStrongMove ? 1.0 : 0);
      const broken = side === 'left' ? this.leftPauldronBroken : this.rightPauldronBroken;
      const dPart = side === 'left' ? dL : dR;
      if (!broken && pb > 0 && dPart <= 70 && !(m && m.warded)) {
        let pos = opts.posType;
        if (!pos && attacker && attacker.x !== undefined) {
          const diff = Math.abs(wrapA(Math.atan2(attacker.y - this.y, attacker.x - this.x) - this.facingAngle));
          pos = diff < 0.95 ? 'head' : (diff > Math.PI - 1.15 ? 'back' : 'normal');
        }
        const want = side === 'left' ? 'back' : 'head';
        const eff = this.state === 'staggered' ? 1.25 : (pos === want ? 1.0 : (pos === 'normal' ? 0.55 : 0));
        const gain = staggerAmt * 0.42 * pb * eff;
        if (gain > 0) {
          if (side === 'left') { this.leftPartBreak = Math.min(this.partBreakMax, this.leftPartBreak + gain); if (this.leftPartBreak >= this.partBreakMax) this.breakPauldron('left', false); }
          else { this.rightPartBreak = Math.min(this.partBreakMax, this.rightPartBreak + gain); if (this.rightPartBreak >= this.partBreakMax) this.breakPauldron('right', false); }
          this.partBreak = this.leftPartBreak + this.rightPartBreak;
        }
      }

      const pct = this.hp / this.maxHp;
      if (pct <= 0.70 && !this.mech70 && !this.pendingMech) { this.mech70 = true; this.pendingMech = 'nightlight_mechanic'; }
      else if (pct <= 0.55 && this.mech70 && !this.act2Done && !this.pendingMech) { this.act2Done = true; this.pendingMech = 'act2_mechanic'; }
      else if (pct <= 0.40 && this.act2Done && !this.mech40 && !this.pendingMech) { this.mech40 = true; this.pendingMech = 'dollhouse_mechanic'; }
    }

    hushStagger(text, dur) {
      this.cleanMechanic();
      this.enterStaggerState(text);
      if (dur) { this.stateDuration = dur; this.stateTimer = dur; }
    }
    enterStaggerState(text, fromNetwork = false) {
      if (this.mech) this.cleanMechanic(true);
      this.pat = null; this.patName = null; this.clones = null; this.unravel = null; this.jumpZ = 0;
      super.enterStaggerState(text, fromNetwork);
      if (/BLINDED|REMEMBERS|STRINGS CUT/.test(String(text || ''))) { this.stateDuration = this.stateTimer = /STRINGS/.test(text) ? 9 : 6.5; }
      else if (text !== '@none') this.say(this.pick(LINES.stagger), 2.4);
    }
    executeCounterStagger(player, fromNetwork = false) {
      const was = this.state;
      super.executeCounterStagger(player, fromNetwork);
      if (this.state === 'staggered' && was !== 'staggered') this.say(this.pick(LINES.counter), 2.2);
    }
    lockInPlaceForUltimate(...args) {
      if (this.isMech() || this.state === 'intro_cutscene') return;
      return super.lockInPlaceForUltimate(...args);
    }
    enterRebuked(px, py) {
      super.enterRebuked(px, py);
      if (Math.random() < 0.5) this.say(this.pick(LINES.rebuke), 2);
    }
    partBreakFlinch() {
      if (this.isMech() || ['intro_cutscene', 'staggered', 'rebuked', 'flinched', 'karok_clash'].indexOf(this.state) >= 0) return;
      if (this.lockedByUltimateTimer > 0 || (this.jumpZ || 0) > 2 || this.hp <= 0) return;
      this.counterableWindow = false; this.speed = 0; this.vx = this.vy = 0; this.targetX = this.x; this.targetY = this.y;
      this.pat = null; this.clones = null; this.unravel = null;
      this.state = 'flinched'; this.stateDuration = 0.9; this.stateTimer = 0.9; this.patT = 0; this._patPrev = 0;
      this.snapFeetToBody();
      this._rebukePush = { ux: -Math.cos(this.facingAngle), uy: -Math.sin(this.facingAngle), dist: 30, dur: 0.25, t: 0 };
      this.aiCooldown = Math.min(this.aiCooldown || 0, 1.0);
      this.grunt('crack');
    }
    coreBreakPart(side, fromNetwork = false) {
      const left = side === 'left';
      if (left ? this.leftPauldronBroken : this.rightPauldronBroken) return;
      if (left) { this.leftPartBreak = this.partBreakMax; this.leftPauldronBroken = true; this.leftPauldronFlashTimer = 0; this.keyBroken = true; this.windDownT = 9; }
      else { this.rightPartBreak = this.partBreakMax; this.rightPauldronBroken = true; this.rightPauldronFlashTimer = 0; this.maskBroken = true; }
      this.partBreak = this.leftPartBreak + this.rightPartBreak;
      this.pauldronBroken = this.leftPauldronBroken && this.rightPauldronBroken;
      const pos = this.getShoulderWorldPositions()[left ? 'left' : 'right'];
      audio.playParryClang(true); audio.playImpactBoom(1.35);
      if (audio.playBellTone) { audio.playBellTone(left ? 392 : 1046, 1.2, 0.18); audio.playBellTone(left ? 370 : 988, 1.2, 0.12); }
      if (window.fx) {
        window.fx.triggerShake(18, 0.42);
        window.fx.addShockwave(pos.x, pos.y, 140, left ? '#fde68a' : '#e2e8f0', 5);
        window.fx.addDragSparks(pos.sx, pos.sy, 0, 30, false, '#fde68a');
      }
      this.vfxAdd({ k: 'chips', x: this.x, y: this.y, a: this.facingAngle + (left ? Math.PI : 0), life: 1.1, seed: Math.random() * 10, big: true });
      this.say(left ? LINES.keyBreak : LINES.maskBreak, 3);
      this.partBreakFlinch();
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // DROWSINESS and her lullaby verses
    // ---------------------------------------------------------------------------------------------------------------------------
    startVerse() {
      const now = performance.now() / 1000;
      this._verseAt = now;
      this.verse = { t: 0, dur: hard() ? 10 : 9 };
      this.cueSay(this.pick(LINES.verse), 3.6);
      playMotif(1, 0.1);
    }
    tickDrowsy(dt, L) {
      const now = performance.now() / 1000;
      if (this.verse) { this.verse.t += dt; if (this.verse.t >= this.verse.dur) this.verse = null; }
      // a verse every ~34s from 70% on, never on top of a mechanic or a cutscene
      if (!this.verse && this.phase >= 2 && !this.isMech() && this.state !== 'intro_cutscene' && now - this._verseAt > 34 && (this.state === 'idle' || this.state === 'walk')) this.startVerse();
      for (const p of L) {
        if (!p.isLocal && !p.isBot) continue;
        wrapSleep(p);
        if (p.hushSleep > 0) {
          const was = p.hushSleep;
          p.hushSleep = Math.max(0, p.hushSleep - dt);
          // tucked in: the blanket of thread pulls tight once, then you wake
          if (was > 0.9 && p.hushSleep <= 0.9) this.hurt(p, hard() ? 520 : 380, 'Tucked In', 'heavy', p.x, p.y - 10, 40);
          if (p.hushSleep <= 0) p.hushDrowsy = 35;
          continue;
        }
        // standing still while she sings is how you drift off
        const moved = Math.hypot(p.x - (p._hsPX ?? p.x), p.y - (p._hsPY ?? p.y));
        p._hsPX = p.x; p._hsPY = p.y;
        p._hsStill = moved < 0.6 ? (p._hsStill || 0) + dt : 0;
        let d = p.hushDrowsy || 0;
        if (this.verse && this.hp > 0) {
          let rate = (hard() ? 8.5 : 7.0) * (this.maskBroken ? 0.6 : 1);
          if (p._hsStill > 0.5) rate *= 1.7;
          d += rate * dt;
        } else d -= 3.2 * dt;
        p.hushDrowsy = Math.max(0, Math.min(100, d));
        if (p.hushDrowsy >= 100 && this.hp > 0) this.fallAsleep(p);
      }
    }
    addDrowsy(p, v) {
      if (!p || p.hp <= 0 || p.hushSleep > 0) return;
      p.hushDrowsy = Math.min(100, (p.hushDrowsy || 0) + v * (this.maskBroken ? 0.6 : 1));
      if (p.hushDrowsy >= 100) this.fallAsleep(p);
    }
    fallAsleep(p) {
      wrapSleep(p);
      p.hushSleep = hard() ? 3.2 : 2.6;
      p.hushDrowsy = 100;
      if (p.act) { p.act = null; p.restoreChargeCamera && p.restoreChargeCamera(); }
      p.targetX = p.x; p.targetY = p.y;
      if (p.isLocal) this.cueSay(LINES.sleep, 2.4);
      if (audio.playBellTone) { audio.playBellTone(523, 1.4, 0.12); audio.playBellTone(392, 1.6, 0.1); }
      this.vfxAdd({ k: 'zzz', x: p.x, y: p.y, life: p.hushSleep, pid: p.id });
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // UPDATE
    // ---------------------------------------------------------------------------------------------------------------------------
    coreUpdate(dt, partyArr, arenaCenter, arenaRadius) {
      if (this.hp <= 0) { this.teles.length = 0; this.verse = null; for (const p of party()) if (p) p.hushSleep = 0; return; }
      if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      if (this.leftPauldronFlashTimer > 0) this.leftPauldronFlashTimer = Math.max(0, this.leftPauldronFlashTimer - dt);
      if (this.rightPauldronFlashTimer > 0) this.rightPauldronFlashTimer = Math.max(0, this.rightPauldronFlashTimer - dt);
      if (this.windDownT > 0) this.windDownT = Math.max(0, this.windDownT - dt);
      this.counterGraceTimer = this.isCounterable() ? 0.25 : Math.max(0, (this.counterGraceTimer || 0) - dt);
      this.recoilVx += (-this.recoilX * 185 - this.recoilVx * 16) * dt; this.recoilVy += (-this.recoilY * 185 - this.recoilVy * 16) * dt;
      this.recoilX += this.recoilVx * dt; this.recoilY += this.recoilVy * dt;
      this.pelvisVelZ += (-this.pelvisBounceZ * 140 - this.pelvisVelZ * 14) * dt; this.pelvisBounceZ += this.pelvisVelZ * dt;
      this.pauldronVelZ += (-this.pauldronLagZ * 95 - this.pauldronVelZ * 10) * dt; this.pauldronLagZ += this.pauldronVelZ * dt;

      const cut = this.state === 'intro_cutscene' || (this.mech && this.mech.phase === 'intro');
      if (!cut && !this.enraged) {
        this.enrageTimer = Math.max(0, this.enrageTimer - dt);
        if (this.enrageTimer <= 0) this.applyEnrage(false);
      }
      this.decayThreat(dt);
      this.getShoulderWorldPositions();
      const L = (partyArr || []).filter(p => p.hp > 0);
      this.tickDrowsy(dt, L);
      this.updateTeles(dt * (this.pat ? this.patRate() : 1));
      this.updateHazards(dt, L);
      this.updateProjectiles(dt, L);
      this.updateMinions(dt, L);
      for (const v of this.vfx) v.t += dt;
      this.vfx = this.vfx.filter(v => v.t < (v.life || 1));
      if (this.updateRig) this.updateRig(dt);
      const downs = party().filter(p => p && !p.isBot && p.hp <= 0).length;
      if (downs > this.lastDownCount) { if (Math.random() < 0.4) this.grunt('giggle_02'); else this.say(this.pick(LINES.down), 2.2); }
      this.lastDownCount = downs;

      if (this.hitStutterTimer > 0) { this.hitStutterTimer = Math.max(0, this.hitStutterTimer - dt); return; }
      if (this.lockedByUltimateTimer > 0) {
        this.lockedByUltimateTimer = Math.max(0, this.lockedByUltimateTimer - dt);
        this.vx = this.vy = this.speed = 0;
        return;
      }
      this.breathePhase += dt * 1.6;

      if (this.state === 'idle' || this.state === 'walk') {
        this.targetReevalTimer -= dt;
        if (this.targetReevalTimer <= 0 || !this.activeTargetId || !L.some(p => p.id === this.activeTargetId)) {
          this.selectTargetForPattern(L, 'aggro'); this.targetReevalTimer = 3.2;
        }
      }
      const primary = this.resolveTargetById(L, this.activeTargetId) || L[0];
      const pct = this.hp / this.maxHp;
      this.phase = pct > 0.70 ? 1 : (pct > 0.40 ? 2 : 3);
      this.awakened = this.phase >= 2;

      if (this.mechRetry) {
        const r = this.mechRetry, pt = r.t; r.t -= dt;
        if (pt > 4 && r.t <= 4) this.say(LINES.retry, 3);
        if (r.t <= 0 && !this.pendingMech && (this.state === 'idle' || this.state === 'walk')) { this.pendingMech = r.name; this.mechRetry = null; }
      }
      if (this.pendingMech && (this.state === 'idle' || this.state === 'walk') && this.lockedByUltimateTimer <= 0 && !this.karokClash) {
        const name = this.pendingMech; this.pendingMech = null;
        this.triggerPatternByName(name, null, false);
        return;
      }

      if (this.mech && !this.isMech()) this.cleanMechanic();
      if (this.isMech()) {
        this.updateMechanic(dt, L);
      } else if ((this.state === 'idle' || this.state === 'walk') && primary) {
        // a sleeping target: she comes to stand over them instead of attacking
        this.targetX = primary.x; this.targetY = primary.y;
        this.aiCooldown -= dt;
        if (this.aiCooldown <= 0 && !(primary.hushSleep > 0)) this.chooseNext(L, primary);
      } else if (this.state !== 'idle' && this.state !== 'walk' && this.state !== 'karok_clash') {
        this.updatePatternState(dt, L);
      }

      const dx = this.targetX - this.x, dy = this.targetY - this.y, d = Math.hypot(dx, dy);
      const canWalk = this.state === 'idle' || this.state === 'walk';
      if (canWalk && d > 76) {
        this.state = 'walk';
        this.moveAngle = Math.atan2(dy, dx);
        this.speed += (Math.min(this.maxSpeed, d * 1.8) - this.speed) * Math.min(1, 5 * dt);
        this.vx = Math.cos(this.moveAngle) * this.speed; this.vy = Math.sin(this.moveAngle) * this.speed;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.rotateTowards(Math.atan2(dy / T(), dx), dt);
      } else {
        if (this.state === 'walk') this.state = 'idle';
        this.speed *= 0.85; this.vx *= 0.85; this.vy *= 0.85;
        if (canWalk && primary) this.rotateTowards(Math.atan2((primary.y - this.y) / T(), primary.x - this.x), dt * 0.8);
      }
      if (arenaCenter && arenaRadius && !this.isMech()) { const p = this.inArena(this.x, this.y, Math.max(60, arenaRadius - 40)); this.x = p.x; this.y = p.y; }
      if (this.jumpZ <= 0.1) this.updateFootSteps(dt); else this.syncAirborneFeet();
    }

    updatePatternState(dt, L) {
      if (this._clockState !== this.state) {
        this._clockState = this.state;
        if (this.state !== this.patName) { this.pat = null; this.patName = null; this.clones = null; this.unravel = null; }
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
      this.pat = null; this.patName = null; this.counterableWindow = false; this.jumpZ = 0; this.clones = null; this.unravel = null;
      this.state = 'idle'; this.stateTimer = 0; this.patT = 0;
      if (was === 'intro_cutscene') { this.aiCooldown = 0.8; this.x = STAGE.x; this.y = STAGE.y - 60; return; }
      this.aiCooldown = hard() ? 1.1 : 1.35;
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // AI
    // ---------------------------------------------------------------------------------------------------------------------------
    chooseNext(L, primary) {
      const PATS = HushBoss.PATS || {};
      const dist = Math.hypot(primary.x - this.x, (primary.y - this.y) / T());
      const ph = this.phase, close = dist < 210;
      const c = [];
      const add = (name, w, mode = 'aggro') => { const d = PATS[name]; if (d && (d.phase || 1) <= ph && (!d.act2 || this.act2)) c.push({ name, weight: w, mode }); };
      if (close) {
        add('hs_needle_thrust', 13); add('hs_cradle_rock', 12); add('hs_music_spin', 9); add('hs_ribbon_lash', 10); add('hs_head_tilt', 8);
        add('hs_key_turn', 8); add('hs_lasso', 6, 'hunter'); add('hs_stitch', 6, 'hunter'); add('hs_marionette_drop', 5, 'hunter');
        add('hs_pin_fan', 5, 'hunter'); add('hs_toy_soldiers', 5, 'hunter'); add('hs_block_drop', 5, 'hunter');
      } else {
        add('hs_stitch', 12, 'hunter'); add('hs_marionette_drop', 12, 'hunter'); add('hs_pin_fan', 11, 'hunter'); add('hs_lasso', 10, 'hunter');
        add('hs_toy_soldiers', 10, 'hunter'); add('hs_block_drop', 11, 'hunter'); add('hs_head_tilt', 7, 'hunter'); add('hs_key_turn', 6, 'hunter');
        add('hs_needle_thrust', 6, 'hunter');
      }
      add('hs_pas_de_deux', close ? 8 : 6, 'hunter'); add('hs_unravel', close ? 7 : 5);
      add('hs_shatter_rings', close ? 8 : 8, 'hunter');
      const chosen = this.selectNonRepeatingPattern(c.filter(x => x.weight > 0));
      if (!chosen) return;
      const tg = this.selectTargetForPattern(L, chosen.mode || 'aggro');
      this.triggerPatternByName(chosen.name, tg, false);
    }
    triggerPatternByName(name, target, fromNetwork = false, netData = null) {
      const PATS = HushBoss.PATS || {};
      if (target && target.id) this.activeTargetId = target.id;
      this._rebukeSerial = (this._rebukeSerial || 0) + 1; this._rebukeUsed = null;
      const seed = (Math.random() * 0x7fffffff) | 0;
      this.patSerial++;
      this.recordExecutedPattern(name);
      const tg = target || this.tgt();
      if (name === 'intro_cutscene') this.triggerIntroCutscene();
      else if (name === 'pat_getsuga_charge') { this.pat = null; this.triggerPatternGetsugaCharge(tg); this._karokShout = false; }
      else if (MECH_RE.test(name)) this.startMechanic(name, seed);
      else if (PATS[name]) this.startPattern(name, tg, seed);
    }
    startPattern(name, tg, seed) {
      const def = HushBoss.PATS[name];
      this.pat = def; this.patName = name; this.patRng = rngFrom(seed);
      this.state = name; this.stateDuration = def.dur; this.stateTimer = def.dur;
      this.patT = 0; this._patPrev = -1e-6; this._clockState = name;
      this.counterableWindow = false; this.jumpZ = 0;
      this.speed = 0; this.vx = this.vy = 0; this.targetX = this.x; this.targetY = this.y;
      if (tg) this.aim(tg); else this.baseFacing = this.facingAngle;
      this.snapFeetToBody();
      def.start(this, tg, this.patRng);
      if (!def.speaks && Math.random() < 0.2) this.say(this.pick(LINES.open), 2.2);
      else if (!def.speaks && Math.random() < 0.3) this.grunt(Math.random() < 0.5 ? 'effort_01' : 'hum_01');
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // telegraphs, floor hazards, projectiles, little toys that walk
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
          const key = '_hz' + h.id;
          if ((p[key] || 0) > performance.now()) continue;
          p[key] = performance.now() + 550;
          this.hurt(p, h.dmg, h.label, 'light', p.x, p.y, 20);
          if (h.drowsy) this.addDrowsy(p, h.drowsy);
        }
      }
      this.hazards = this.hazards.filter(h => h.t < h.dur);
    }
    // pins fly straight; blocks drop from above onto a marked spot
    updateProjectiles(dt, L) {
      for (const pr of this.proj) {
        pr.t += dt;
        if (pr.done) continue;
        if (pr.k === 'pin') {
          pr.x += Math.cos(pr.a) * pr.spd * dt; pr.y += Math.sin(pr.a) * pr.spd * dt * T();
          const hit = L.filter(p => (p.isLocal || p.isBot) && flat(p, pr.x, pr.y) <= 24);
          for (const p of hit) this.hurt(p, pr.dmg, 'Sewing Pin', 'light', pr.x, pr.y, 70);
          if (hit.length || pr.t >= pr.life || flat(pr, STAGE.x, STAGE.y) > 600) pr.done = true;
        } else if (pr.k === 'drop') {
          if (pr.t >= pr.dur) {
            pr.done = true;
            for (const p of L) if (flat(p, pr.x, pr.y) <= pr.r) this.hurt(p, pr.dmg, pr.label, 'heavy', pr.x, pr.y, 140);
            audio.playImpactBoom(1.0);
            if (window.fx) { window.fx.triggerShake(8, 0.2); window.fx.addShockwave(pr.x, pr.y, pr.r * 1.1, '#fde68a', 4, 0.35); window.fx.addStepDust(pr.x, pr.y, 8); }
            this.vfxAdd({ k: 'block', x: pr.x, y: pr.y, r: pr.r, life: pr.stay || 0.6, letter: pr.letter, col: pr.col });
          }
        }
      }
      this.proj = this.proj.filter(pr => !pr.done || pr.t < (pr.dur || 0) + 0.05);
    }
    // wind-up toys (soldiers marching across) and the Nightlight's shadow toys
    updateMinions(dt, L) {
      for (const n of this.minions) {
        n.t += dt;
        if (n.k === 'soldier') {
          if (n.t < n.delay) continue;
          n.x += Math.cos(n.a) * n.spd * dt; n.y += Math.sin(n.a) * n.spd * dt * T();
          for (const p of L) {
            if (!(p.isLocal || p.isBot) || flat(p, n.x, n.y) > 30) continue;
            if ((p['_hsSol' + n.id] || 0) > performance.now()) continue;
            p['_hsSol' + n.id] = performance.now() + 900;
            this.hurt(p, n.dmg, 'Wind-Up Soldier', 'medium', n.x, n.y, 120);
          }
          if (n.t > n.delay + n.life) n.dead = true;
        } else if (n.k === 'shadow') {
          // shadow toys creep toward the nearest player and dissolve in lamplight
          const m = this.mech;
          const lamp = m && m.kind === 'nightlight' ? this.lampPos(m) : null;
          const p = L[0];
          if (!p) continue;
          const dx = p.x - n.x, dy = (p.y - n.y) / T(), d = Math.hypot(dx, dy) || 1;
          const spd = n.spd * (lamp && flat(n, lamp.x, lamp.y) < 260 ? 0.55 : 1);
          n.x += dx / d * spd * dt; n.y += dy / d * spd * dt * T();
          if (lamp && flat(n, lamp.x, lamp.y) < (m.lampR || 120)) { n.burn = (n.burn || 0) + dt; if (n.burn > 0.45) { n.dead = true; this.vfxAdd({ k: 'puff', x: n.x, y: n.y, life: 0.6 }); continue; } }
          if (d < 34 && (p.isLocal || p.isBot)) {
            n.dead = true;
            this.hurt(p, 170, 'Shadow Toy', 'medium', n.x, n.y, 90);
            this.addDrowsy(p, 14);
            this.vfxAdd({ k: 'puff', x: n.x, y: n.y, life: 0.6 });
          }
        }
      }
      this.minions = this.minions.filter(n => !n.dead);
    }
    // a showy landing: porcelain dust, a ring, a soft chime
    flair(x, y, r = 110, col = '#fde68a', shake = 5) {
      if (window.fx) {
        window.fx.addDragSparks(x, y - 10, -Math.PI / 2, 10, false, col);
        if (shake) window.fx.triggerShake(shake, 0.18);
      }
      this.vfxAdd({ k: 'ring', x, y, r, col, life: 0.5 });
      this.vfxAdd({ k: 'motes', x, y, r, col, life: 0.9, seed: Math.random() * 10 });
    }

    // =========================================================================================================================
    // MECHANICS
    // =========================================================================================================================
    startMechanic(name, seed) {
      this.cleanMechanic(true);
      this.verse = null;
      this.pat = null; this.counterableWindow = false; this.jumpZ = 0; this.clones = null; this.unravel = null;
      this.speed = 0; this.vx = this.vy = 0;
      this.state = name; this.stateDuration = 999; this.stateTimer = 999; this.patT = 0;
      const rnd = rngFrom(seed);
      const skip = this.skippingCutscenes && this.skippingCutscenes();
      this.teles = []; this.hazards = []; this.proj = []; this.minions = [];
      if (name === 'nightlight_mechanic') { this.mech = this.makeNightlight(rnd, skip); this.cueSay(LINES.nightlight, 3.2); }
      else if (name === 'act2_mechanic') { this.mech = this.makeAct2(skip); this.cueSay(LINES.act2, 3.4); }
      else if (name === 'dollhouse_mechanic') { this.mech = this.makeDollhouse(rnd, skip); this.cueSay(LINES.dollhouse, 3.2); }
      else if (name === 'finale_mechanic') { this.mech = this.makeFinale(rnd, skip); this.cueSay(LINES.finale, 3.4); }
      this.mech.seed = seed;
      this.mech.fromX = this.x; this.mech.fromY = this.y;
      audio.playImpactBoom(1.2);
      if (window.fx) window.fx.addShockwave(this.x, this.y, 220, '#fde68a', 5);
    }
    cleanMechanic(keepState) {
      const m = this.mech;
      if (!m) return;
      this.mech = null;
      this.jumpZ = 0;
      this.minions = this.minions.filter(n => n.k !== 'shadow');
      for (const p of party()) if (p) p.hsCarry = false;
      if (!keepState && this.isMech()) { this.state = 'idle'; this.stateTimer = 0; }
    }
    updateMechanic(dt, L) {
      const m = this.mech;
      if (!m) { this.state = 'idle'; return; }
      m.t += dt;
      this.vx = this.vy = this.speed = 0;
      if (m.kind === 'nightlight') this.tickNightlight(m, dt, L);
      else if (m.kind === 'act2') this.tickAct2(m, dt, L);
      else if (m.kind === 'dollhouse') this.tickDollhouse(m, dt, L);
      else if (m.kind === 'finale') this.tickFinale(m, dt, L);
    }
    mechGlide(m, tx, ty, k) {
      const e = k * k * (3 - 2 * k);
      this.x = lerp(m.fromX, tx, e); this.y = lerp(m.fromY, ty, e);
      this.targetX = this.x; this.targetY = this.y;
    }
    mechFailBlast(label, x, y) {
      audio.playImpactBoom(2.2);
      if (window.fx) {
        window.fx.triggerShake(30, 0.8); window.fx.triggerScreenFlash && window.fx.triggerScreenFlash('#0b1024', 0.45);
        window.fx.addShockwave(x, y, 620, '#e2e8f0', 12, 0.9);
      }
      for (const p of living()) if (p.isLocal || p.isBot) p.takeDamage(99999, label, { power: 'cataclysm', sourceX: x, sourceY: y, pushDist: 200, forceLethal: hard() });
    }
    scheduleRetry(name, always) {
      if (hard()) return;
      if (!always && this.mechRetried[name]) return;
      this.mechRetried[name] = true;
      this.mechRetry = { name, t: always ? 6 : 20 };
    }

    // ---- 70% NIGHTLIGHT ------------------------------------------------------------------------------------------------------
    // She claps once and every light in the nursery goes out but one small nightlight, left somewhere on the rug. She sits back
    // in her rocking chair, humming, with her eyes shut. Shadow toys crawl in from the dark towards you; lamplight burns them
    // away. Walk over the lamp to pick it up, carry it to her chair and hold it up to her face. Her strings reach down out of the
    // dark to snatch it back (a marked spot): if one catches you, the lamp is knocked out of your hands somewhere else.
    makeNightlight(rnd, skip) {
      const a = rnd() * TAU, r = 260 + rnd() * 120;
      const lamp = this.inArena(STAGE.x + Math.cos(a) * r, STAGE.y + 140 + Math.sin(a) * r * T() * 0.6, 470);
      return { kind: 'nightlight', t: 0, phase: 'intro', introDur: skip ? 1.2 : 2.6, warded: true, lamp: { x: lamp.x, y: lamp.y, held: false },
        dur: hard() ? 30 : 36, spawnT: 0, snatchT: 4, lampR: 120, dark: 0, rnd, blindT: 0 };
    }
    lampPos(m) {
      const p = party().find(q => q && q.hsCarry);
      if (p) return { x: p.x, y: p.y - 4 };
      return m.lamp;
    }
    tickNightlight(m, dt, L) {
      const p = L.find(q => q.isLocal) || L[0];
      if (m.phase === 'intro') {
        this.mechGlide(m, CHAIR.x, CHAIR.y, c01(m.t / (m.introDur * 0.8)));
        this.facingAngle = Math.PI * 0.5;
        m.dark = c01(m.t / m.introDur);
        if (m.t >= m.introDur * 0.5 && !m.clapped) { m.clapped = true; audio.playParryClang(false); audio.playImpactBoom(0.9); }
        if (m.t >= m.introDur) { m.phase = 'dark'; m.t0 = m.t; }
        return;
      }
      if (m.phase === 'blind') {
        // the lamp in her face: she rears back, then the lights come back on and she is staggered
        m.blindT += dt;
        m.dark = Math.max(0, 1 - m.blindT / 1.2);
        if (m.blindT >= 1.2) this.endNightlight(true);
        return;
      }
      m.dark = 1;
      this.x = CHAIR.x; this.y = CHAIR.y; this.facingAngle = Math.PI * 0.5;
      const el = m.t - m.t0;
      // shadow toys from the dark edge
      m.spawnT -= dt;
      const rate = hard() ? 1.0 : 1.35;
      if (m.spawnT <= 0 && this.minions.filter(n => n.k === 'shadow').length < (hard() ? 9 : 7)) {
        m.spawnT = rate;
        const a = m.rnd() * TAU;
        const sp = this.inArena(STAGE.x + Math.cos(a) * 560, STAGE.y + Math.sin(a) * 560 * T(), 560);
        this.minions.push({ k: 'shadow', id: (this._mnId = (this._mnId || 0) + 1), x: sp.x, y: sp.y, t: 0, spd: hard() ? 92 : 78, kind: Math.floor(m.rnd() * 3) });
      }
      // pick the lamp up by walking over it
      if (p && !p.hsCarry && flat(p, m.lamp.x, m.lamp.y) < 44) {
        p.hsCarry = true; m.lamp.held = true;
        if (audio.playBellTone) audio.playBellTone(1318, 0.4, 0.1);
      }
      // her strings reach down to snatch the light
      m.snatchT -= dt;
      if (m.snatchT <= 0) {
        m.snatchT = hard() ? 3.0 : 3.8;
        const lp = this.lampPos(m);
        m.snatch = { x: lp.x + (m.rnd() - 0.5) * 40, y: lp.y + (m.rnd() - 0.5) * 24, t: 0, lead: hard() ? 1.0 : 1.25 };
        this.tele({ k: 'circle', x: m.snatch.x, y: m.snatch.y, r: 70 }, m.snatch.lead);
      }
      if (m.snatch) {
        m.snatch.t += dt;
        if (m.snatch.t >= m.snatch.lead) {
          const s = m.snatch; m.snatch = null;
          this.vfxAdd({ k: 'snatch', x: s.x, y: s.y, life: 0.5 });
          audio.playSwordSlash(false, 0.7);
          for (const q of L) {
            if (flat(q, s.x, s.y) > 70) continue;
            this.hurt(q, 210, 'Snatching String', 'medium', s.x, s.y, 140);
            if (q.hsCarry) {
              q.hsCarry = false; m.lamp.held = false;
              const a = m.rnd() * TAU, r = 200 + m.rnd() * 160;
              const np = this.inArena(STAGE.x + Math.cos(a) * r, STAGE.y + 120 + Math.sin(a) * r * T() * 0.6, 460);
              m.lamp.x = np.x; m.lamp.y = np.y;
              this.grunt('giggle_02');
            }
          }
        }
      }
      if (p && p.hsCarry) { m.lamp.x = p.x; m.lamp.y = p.y; }
      // the light reaches her face
      if (p && p.hsCarry && flat(p, CHAIR.x, CHAIR.y + 30) < 95) {
        m.phase = 'blind'; m.blindT = 0; p.hsCarry = false;
        this.cueSay(LINES.nightlightWin, 2.6);
        audio.playImpactBoom(1.8); audio.playParryClang(true);
        if (window.fx) { window.fx.triggerScreenFlash && window.fx.triggerScreenFlash('#fff7d6', 0.35); window.fx.addShockwave(CHAIR.x, CHAIR.y, 320, '#fde68a', 8, 0.6); }
        this.minions = this.minions.filter(n => n.k !== 'shadow');
        return;
      }
      if (el >= m.dur) {
        this.say(LINES.nightlightFail, 3, true);
        this.endNightlight(false);
      }
    }
    endNightlight(win) {
      const m = this.mech; if (!m || m.kind !== 'nightlight') return;
      this.cleanMechanic();
      this.x = CHAIR.x; this.y = CHAIR.y + 20;
      if (win) { this.grantMechanicShield && this.grantMechanicShield(); this.hushStagger('ðŸ”¦ BLINDED!'); }
      else { this.mechFailBlast('The Dark', this.x, this.y); this.state = 'idle'; this.aiCooldown = 1.6; this.scheduleRetry('nightlight_mechanic'); }
    }

    // ---- 55% WIND-UP ---------------------------------------------------------------------------------------------------------
    // She stops dead, reaches behind her back and winds her own key, faster and faster. Gold seams spread across her porcelain,
    // the needle hand twitches, and the second half of her music starts. Nothing hurts anyone while she winds.
    makeAct2(skip) { return { kind: 'act2', t: 0, phase: 'intro', introDur: skip ? 1.6 : 5.0, warded: true, changed: false }; }
    tickAct2(m, dt) {
      this.mechGlide(m, STAGE.x, STAGE.y - 20, c01(m.t / (m.introDur * 0.35)));
      this.facingAngle = Math.PI * 0.5;
      const turns = Math.floor(m.t * (1.2 + m.t * 0.8));
      if (turns !== m.lastTurn) { m.lastTurn = turns; audio.playParryClang(false); if (audio.playBellTone) audio.playBellTone(220 + turns * 30, 0.2, 0.08); }
      if (!m.changed && m.t >= m.introDur * 0.62) {
        m.changed = true; this.act2 = true;
        audio.playImpactBoom(1.8);
        if (window.fx) { window.fx.addShockwave(this.x, this.y, 320, '#fde68a', 7, 0.6); window.fx.triggerShake(14, 0.4); }
        this.vfxAdd({ k: 'ring', x: this.x, y: this.y, r: 520, col: '#fde68a', life: 0.8 });
        this.grunt('giggle_01');
      }
      if (m.t >= m.introDur) { this.act2 = true; this.cleanMechanic(); this.aiCooldown = 0.9; }
    }

    // ---- 40% DOLLHOUSE -------------------------------------------------------------------------------------------------------
    // The nursery folds up around you into one room of a dollhouse (a small round room in the middle of the rug; its walls hurt).
    // She is gone, but her huge hand sweeps through the room and her eye peers in through the window, searching. Three of her
    // old toys glow on the floor: stand on each one for a moment to remember it. Remember all three before the room collapses.
    makeDollhouse(rnd, skip) {
      const toys = [];
      const kinds = ['horse', 'box', 'crown'];
      const base = rnd() * TAU;
      for (let i = 0; i < 3; i++) {
        const a = base + i * TAU / 3 + (rnd() - 0.5) * 0.5, r = 150 + rnd() * 70;
        toys.push({ i, kind: kinds[i], x: STAGE.x + Math.cos(a) * r, y: STAGE.y + Math.sin(a) * r * T(), got: false, hold: 0 });
      }
      return { kind: 'dollhouse', t: 0, phase: 'intro', introDur: skip ? 1.4 : 3.0, warded: true, toys, dur: hard() ? 26 : 30,
        handT: 3.0, eyeT: 6.0, rnd, fold: 0, hand: null, eye: null };
    }
    tickDollhouse(m, dt, L) {
      const p = L.find(q => q.isLocal) || L[0];
      // she is gone into the walls
      this.x = STAGE.x; this.y = STAGE.y - ROOM_R - 90; this.facingAngle = Math.PI * 0.5;
      if (m.phase === 'intro') {
        m.fold = c01(m.t / m.introDur);
        if (m.t >= m.introDur * 0.5 && !m.pulled && p) {
          // you are pulled into the room's middle
          m.pulled = true;
          p.x = STAGE.x; p.y = STAGE.y; p.targetX = p.x; p.targetY = p.y; p.snapFeetToBody && p.snapFeetToBody();
          audio.playImpactBoom(1.4);
          if (window.fx) window.fx.triggerScreenFlash && window.fx.triggerScreenFlash('#fff7d6', 0.3);
        }
        if (m.t >= m.introDur) { m.phase = 'room'; m.t0 = m.t; }
        return;
      }
      if (m.phase === 'out') {
        m.fold = Math.max(0, 1 - (m.t - m.outAt) / 1.0);
        if (m.t - m.outAt >= 1.0) this.endDollhouse(m.win);
        return;
      }
      m.fold = 1;
      const el = m.t - m.t0;
      // the walls of the room hurt
      for (const q of L) {
        if (!(q.isLocal || q.isBot)) continue;
        const d = flat(q, STAGE.x, STAGE.y);
        if (d > ROOM_R - 8 && (q._hsWall || 0) < performance.now()) {
          q._hsWall = performance.now() + 500;
          const a = Math.atan2((q.y - STAGE.y) / T(), q.x - STAGE.x);
          this.hurt(q, 90, 'Dollhouse Wall', 'light', STAGE.x + Math.cos(a) * (d + 40), STAGE.y + Math.sin(a) * (d + 40) * T(), 90);
        }
      }
      // remembering toys
      for (const toy of m.toys) {
        if (toy.got) continue;
        const on = p && flat(p, toy.x, toy.y) < 46;
        toy.hold = on ? toy.hold + dt : Math.max(0, toy.hold - dt * 1.5);
        if (toy.hold >= 1.1) {
          toy.got = true;
          playMotif(1.4, 0.1, toy.i * 3, 3);
          this.vfxAdd({ k: 'memory', x: toy.x, y: toy.y, life: 1.2, kind: toy.kind });
          if (window.fx) window.fx.addShockwave(toy.x, toy.y, 120, '#fde68a', 4, 0.5);
        }
      }
      // her hand sweeps through the room (a sector from the edge, telegraphed)
      m.handT -= dt;
      if (m.handT <= 0 && !m.hand) {
        m.handT = hard() ? 3.6 : 4.4;
        const a = (p ? Math.atan2((p.y - STAGE.y) / T(), p.x - STAGE.x) : 0) + Math.PI + (m.rnd() - 0.5) * 0.6;
        const from = { x: STAGE.x + Math.cos(a) * (ROOM_R + 40), y: STAGE.y + Math.sin(a) * (ROOM_R + 40) * T() };
        m.hand = { x: from.x, y: from.y, a: a + Math.PI, t: 0, lead: hard() ? 1.0 : 1.2 };
        this.tele({ k: 'corridor', x: from.x, y: from.y, a: a + Math.PI, len: ROOM_R * 2 + 80, w: 78 }, m.hand.lead);
      }
      if (m.hand) {
        m.hand.t += dt;
        if (m.hand.t >= m.hand.lead && !m.hand.hit) {
          m.hand.hit = true;
          audio.playSwordSlash(true, 0.7); audio.playImpactBoom(1.1);
          this.hitCorridorP(L, m.hand.x, m.hand.y, m.hand.a, ROOM_R * 2 + 80, 78, 300, 'The Hand', 'heavy', 170);
        }
        if (m.hand.t >= m.hand.lead + 0.6) m.hand = null;
      }
      // her eye at the window: a slow beam that follows you, then locks and fires
      m.eyeT -= dt;
      if (m.eyeT <= 0 && !m.eye) {
        m.eyeT = hard() ? 5.5 : 7.0;
        m.eye = { t: 0, track: 1.4, lock: 0.55, a: p ? Math.atan2((p.y - STAGE.y) / T(), p.x - STAGE.x) : 0 };
      }
      if (m.eye) {
        const e = m.eye; e.t += dt;
        const ox = STAGE.x, oy = STAGE.y - ROOM_R;
        if (e.t < e.track && p) e.a = Math.atan2((p.y - oy) / T(), p.x - ox);
        if (e.t >= e.track && !e.locked) { e.locked = true; this.tele({ k: 'corridor', x: ox, y: oy, a: e.a, len: ROOM_R * 2 + 40, w: 46 }, e.lock); }
        if (e.t >= e.track + e.lock && !e.fired) {
          e.fired = true;
          audio.playImpactBoom(1.0);
          this.hitCorridorP(L, ox, oy, e.a, ROOM_R * 2 + 40, 46, 240, 'Peering Eye', 'medium', 120);
          for (const q of L) if (this.inCorridor(q, ox, oy, e.a, ROOM_R * 2 + 40, 46)) this.addDrowsy(q, 20);
        }
        if (e.t >= e.track + e.lock + 0.5) m.eye = null;
      }
      if (m.toys.every(t => t.got)) { m.phase = 'out'; m.outAt = m.t; m.win = true; this.cueSay(LINES.dollhouseWin, 3); return; }
      if (el >= m.dur) { m.phase = 'out'; m.outAt = m.t; m.win = false; this.say(LINES.dollhouseFail, 3, true); }
    }
    endDollhouse(win) {
      const m = this.mech; if (!m || m.kind !== 'dollhouse') return;
      this.cleanMechanic();
      this.x = STAGE.x; this.y = STAGE.y - 180; this.facingAngle = Math.PI * 0.5;
      if (win) { this.grantMechanicShield && this.grantMechanicShield(); this.hushStagger('ðŸ§¸ SHE REMEMBERS!'); }
      else { this.mechFailBlast('Forgotten', STAGE.x, STAGE.y); this.state = 'idle'; this.aiCooldown = 1.6; this.scheduleRetry('dollhouse_mechanic'); }
    }

    // ---- 10% THE LAST VERSE --------------------------------------------------------------------------------------------------
    // She rises on her strings over the middle of the rug and sings. Three strings hold her up; one at a time glows. Hit her
    // from the glowing string's side to cut it (she turns slowly, so you follow it round her). Every few seconds the nursery goes
    // black: the gold in her cracks flares, a chime, and then everything is struck at once (dash through it). Cut all three
    // before the verse ends and she falls; let the verse end and the lullaby takes you.
    makeFinale(rnd, skip) {
      const order = [0, 1, 2].sort(() => rnd() - 0.5);
      const hpEach = Math.round(this.maxHp * 0.034);
      return { kind: 'finale', t: 0, phase: 'intro', introDur: skip ? 1.6 : 3.4, warded: false,
        strings: [0, 1, 2].map(i => ({ i, ang: i * TAU / 3, hp: hpEach, max: hpEach, cut: false })), order, cur: 0,
        spin: 0, dur: hard() ? 34 : 42, lightsT: 5.5, lights: null, rnd, height: 0 };
    }
    finaleHit(dmg, attacker) {
      const m = this.mech;
      this.hitFlashTimer = 0.085;
      if (!attacker || attacker.x === undefined || m.cur >= 3) return;
      const s = m.strings[m.order[m.cur]];
      const ang = s.ang + m.spin;                                 // where the glowing string hangs (ground-plane angle)
      const pa = Math.atan2((attacker.y - this.y) / T(), attacker.x - this.x);
      if (Math.abs(wrapA(pa - ang)) > 0.75) { this.hp = Math.max(Math.ceil(this.maxHp * 0.01), this.hp - Math.max(1, Math.round(dmg * 0.02))); return; }
      s.hp -= dmg;
      this.vfxAdd({ k: 'threadSpark', x: this.x, y: this.y, a: ang, life: 0.3 });
      if (s.hp <= 0 && !s.cut) {
        s.cut = true; m.cur++;
        audio.playSwordSlash(true, 1.6); audio.playParryClang(true);
        if (audio.playBellTone) audio.playBellTone(MOTIF[m.cur] || 523, 1.1, 0.16);
        if (window.fx) { window.fx.triggerHitstop && window.fx.triggerHitstop(90); window.fx.triggerShake(16, 0.35); }
        this.vfxAdd({ k: 'snap', x: this.x, y: this.y, a: ang, life: 0.8 });
        this.grunt('crack');
        if (m.cur >= 3) { m.phase = 'fall'; m.fallT = 0; this.cueSay(LINES.finaleWin, 2.8); }
      }
    }
    tickFinale(m, dt, L) {
      if (m.phase === 'intro') {
        this.mechGlide(m, STAGE.x, STAGE.y, c01(m.t / (m.introDur * 0.7)));
        m.height = 110 * c01(m.t / m.introDur);
        this.jumpZ = m.height;
        if (m.t >= m.introDur) { m.phase = 'strings'; m.t0 = m.t; playMotif(0.8, 0.1); }
        return;
      }
      if (m.phase === 'fall') {
        m.fallT += dt;
        const k = c01(m.fallT / 0.6);
        this.jumpZ = m.height * (1 - k * k);
        if (m.fallT >= 0.6 && !m.landed) {
          m.landed = true; this.jumpZ = 0;
          audio.playImpactBoom(2.2);
          if (window.fx) { window.fx.triggerShake(28, 0.6); window.fx.addShockwave(this.x, this.y, 340, '#fde68a', 9, 0.7); }
          this.vfxAdd({ k: 'chips', x: this.x, y: this.y, a: 0, life: 1.4, seed: 3, big: true });
          this.mech10 = true;                            // her floor is gone: the last 10% can be taken
          this.grantMechanicShield && this.grantMechanicShield();
          this.hushStagger('ðŸŽ» STRINGS CUT!');
        }
        return;
      }
      if (m.phase === 'fail') {
        if (m.t - m.failAt >= 1.2) {
          this.cleanMechanic();
          this.jumpZ = 0;
          this.mechFailBlast('The Last Verse', this.x, this.y);
          this.state = 'idle'; this.aiCooldown = 1.6;
          this.scheduleRetry('finale_mechanic', true);
        }
        return;
      }
      // strings phase: she hangs and turns slowly; the glowing string is the one to cut
      this.jumpZ = m.height + Math.sin(m.t * 1.7) * 6;
      m.spin += dt * (hard() ? 0.42 : 0.32) * (m.cur % 2 ? -1 : 1);
      this.facingAngle = m.spin + Math.PI * 0.5;
      this.x = STAGE.x; this.y = STAGE.y;
      // LIGHTS OUT: the cracks flare, a chime, then the strike everywhere (dash i-frames are the answer)
      m.lightsT -= dt;
      if (m.lightsT <= 0 && !m.lights) { m.lightsT = hard() ? 5.0 : 6.2; m.lights = { t: 0, chime: 1.0, strike: 1.55 }; }
      if (m.lights) {
        const l = m.lights; l.t += dt;
        if (l.t - dt < l.chime && l.t >= l.chime && audio.playBellTone) { audio.playBellTone(1568, 0.6, 0.2); audio.playBellTone(784, 0.8, 0.12); }
        if (l.t - dt < l.strike && l.t >= l.strike) {
          audio.playImpactBoom(1.8); audio.playSwordSlash(true, 0.6);
          if (window.fx) window.fx.triggerShake(18, 0.35);
          for (const q of L) if (q.isLocal || q.isBot) this.hurt(q, hard() ? 520 : 400, 'Lights Out', 'heavy', this.x, this.y, 60);
        }
        if (l.t >= l.strike + 0.5) m.lights = null;
      }
      if (m.t - m.t0 >= m.dur) { m.phase = 'fail'; m.failAt = m.t; this.say(LINES.finaleFail, 3, true); }
    }
    // the verse clock 0..1 (the moon filling over the crib)
    finaleClock(m) { return m && m.phase === 'strings' ? c01((m.t - m.t0) / m.dur) : (m && m.phase === 'fail' ? 1 : 0); }

    // ---------------------------------------------------------------------------------------------------------------------------
    // KAROK CLASH: NEEDLE PLUNGE. She draws the giant needle back to her shoulder like a lance, a stitched line runs down the
    // floor in front of her, and she drives it straight down the lane. A Gravebreaker can catch the needle bare-handed and wrestle
    // it off her (the shared blade-style clash: rip it away, run to the hammer, toss it up and smack it back into her chest).
    // ---------------------------------------------------------------------------------------------------------------------------
    updateGetsugaCharge(dt, partyArr) {
      if (!this._karokShout && this.getsugaProgress() >= 0.05) { this._karokShout = true; this.say(LINES.karokStart, 2.4, true); }
      return super.updateGetsugaCharge(dt, partyArr);
    }
    fireGetsuga(partyArr) {
      const L = (partyArr || []).filter(q => q.hp > 0);
      audio.playSwordSlash(true, 1.5); audio.playImpactBoom(1.7);
      if (window.fx) {
        window.fx.triggerShake(16, 0.35);
        const m = this.fwd(60); window.fx.addShockwave(m.x, m.y, 140, '#e2e8f0', 5, 0.4);
        window.fx.triggerImpactFrame && window.fx.triggerImpactFrame('#e2e8f0', 0.06);
      }
      this.vfxAdd({ k: 'plunge', x: this.x, y: this.y, a: this.facingAngle, len: this.karokLane.len, life: 0.6 });
      this.damagePlayersInCorridor(L, this.x, this.y, this.facingAngle, this.karokLane.len, this.karokLane.half, 290, 'Needle Plunge', 'heavy', 170);
    }
    startKarokClash(player, opts) {
      const ok = super.startKarokClash(player, opts);
      if (ok) this.grunt('shh');
      return ok;
    }
    updateClothChains(dt) { if (this.updateRig) this.updateRig(dt); }
    endKarokClash(player, win) {
      const c = this.karokClash;
      this.karokDrop = (win && c && c.anchor) ? this.karokSwordPos(c, 99) : null;
      this.karokClash = null;
      if (player) {
        player.karok = null;
        if (player.state === 'h_clash') { player.state = 'idle'; player.stateTimer = 0; }
        player.hIframes = win ? 0.8 : 0; player.targetX = player.x; player.targetY = player.y;
        player.snapFeetToBody && player.snapFeetToBody();
      }
      if (win) {
        this.stagger = 0; this.enterStaggerState('@none');
        this.say(LINES.clashWin, 2.6);
      } else {
        this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 0.9; this.karokSwordHidden = false;
        this.say(LINES.clashLoss, 2.4);
        this.vfxAdd({ k: 'plunge', x: this.x, y: this.y, a: this.facingAngle, len: this.karokLane.len, life: 0.6 });
        audio.playImpactBoom(1.8);
        if (player && player.hp > 0) player.takeDamage(1250, 'Needle Plunge (Clash Lost)', { power: 'heavy', sourceX: this.x, sourceY: this.y, pushDist: 190 });
      }
    }
  }

  HushBoss.LINES = LINES;
  HushBoss.MOTIF = MOTIF;
  HushBoss.playMotif = playMotif;
  HushBoss.STAGE = STAGE;
  window.HushBoss = HushBoss;

  // ---- her voice: only her own hs_* clips play while she is the boss ----------------------------------------------------------
  if (typeof audio !== 'undefined' && audio && !audio._hushWrapped) {
    audio._hushWrapped = true;
    const isHs = () => !!(window.game && window.game.mode === 'raid' && window.game.boss && window.game.boss.isHush);
    const oClip = audio.playBossVoiceClip.bind(audio), oVoice = audio.playBossVoice.bind(audio);
    audio.playBossVoiceClip = function (key, ...rest) {
      if (isHs() && !/^hs_/.test(String(key))) { if (key === 'death') window.game.boss.say(LINES.death, 4, true); return; }
      return oClip(key, ...rest);
    };
    audio.playBossVoice = function (...args) { if (isHs()) return; return oVoice(...args); };
  }
})();
