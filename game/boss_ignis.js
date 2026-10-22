// =========================================================================
// BOSS_IGNIS.JS — Ignis Vane, the Pyre Diva (the second Chalice raid). Logic only; her model, the stage and the HUD bits are in
// boss_ignis_rig.js.
//
// She is built on VaelgorRaidBoss so every shared system keeps working unchanged (damage + co-op hit packets, the stagger bar,
// counters, Rebuke, the Karok Clash, holds, loot cores, raid stats, accessories, difficulty). Vaelgor's own update / draw /
// receiveDamage / breakPauldron / resetBoss / intro each start with a `core*` hook, so the wrappers other files put around those
// methods still run around hers.
//
// THE FIGHT
//   EGO      her identity gauge (0-100). It sinks when the party plays well (counters, rebukes, breaks, staggers, steady damage) and
//            climbs when she does (clean patterns, players going down, failed mechanics). High Ego: she stops to show off (free
//            openings). Ego at 0: TANTRUM for 18s, faster and harder hitting but sloppy (takes 30% more stagger), then Ego resets.
//   BREAKS   'left' part = her FAN (fan attacks hit 25% softer once it is torn), 'right' part = her floating CROWN (pushes the
//            burning stage wall back to the rim and slows it). Player text says break damage, never pauldron.
//   70%  MASQUERADE    she becomes five identical masked dancers circling the stage (dodge their fan sweeps); then all five wind
//                      up a lunge and only the real one flashes blue: counter her to shatter the masks. Miss: Normal repeats it
//                      (faster), Hard wipes. (This replaced the old Curtain Call clue puzzle: the user wants action checks, not logic.)
//   40%  LIGHTS, PLEASE  a "lights out" puzzle. Five braziers ring the stage; stepping into one flips it AND its two neighbours. Match
//                      the pattern on her fan before the burning wall closes in. The wall stays for the rest of the fight.
//   10%  FINALE       she charges a sun overhead and throws fireballs. Gold ones must be caught (someone stands in the circle: it is
//                      returned into the sun); violet ones must be left alone. Catching marks you Scorched for a few seconds.
//                      Crack the sun enough times and she crashes down, burnt out.
//   Normal: a failed Curtain Call / Lights comes back ONCE 20s later; a failed Finale always comes back. Hard: failing wipes.
//
// CO-OP  host-authoritative like Vaelgor: patterns go out as boss_pattern (with a seed, so every client rolls the same spots);
//        puzzle steps go out as boss_event 'ignis_*'; extra state rides boss_sync as `ex`. Each client only damages its own player.
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
  // seeded random so every client rolls the same spots for a pattern / puzzle
  function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const MECH_RE = /_mechanic$/;
  const STAGE = { x: 0, y: 0 };                 // the arena centre (game.arenaCenter)
  const CURTAIN_R = 300, PYRE_R = 320;
  const WALL_MIN = 260;

  // ---- her lines (the subtitle text; each one also has a recorded clip, see VOICE below) --------------------------------------
  const LINES = {
    intro: '"Oh? An audience. How... underdressed."',
    open: ['"Try to keep up, darling."', '"Front row seats. Lucky you."', '"Do try not to bleed on the stage."', '"Places, everyone!"'],
    taunt: ['"Is that all? I\'ve had warmer receptions."', '"Yawn."', '"Hold on, I chipped a nail."', '"You may applaud now."', '"Mm. Adequate."'],
    hitPlayer: ['"Encore!"', '"Too slow, sweetie."', '"Did that sting? Good."'],
    down: ['"And SCENE."', '"One less critic."', '"Exit, stage left!"'],
    counter: ['"How DARE you!"', '"That was MY line!"', '"Rude."'],
    rebuke: ['"Hands off the talent!"', '"Excuse me?!"'],
    stagger: ['"This is NOT in the script!"', '"Ugh — my hair!"', '"Somebody get me a stand-in!"'],
    fanBreak: '"My FAN?! That was hand-painted!"',
    crownBreak: '"My CROWN! Do you know what that cost?!"',
    tantrum: '"THAT\'S IT. No more Miss Nice Diva!"',
    tantrumEnd: '"...Where was I? Oh yes. Winning."',
    showoff: '"Watch closely. You might learn something."',
    curtain: '"Intermission! Let\'s play a little game, darlings."',
    curtainFound: '"Ugh. Fine. You found me."',
    curtainWin: '"Bravo... How did you KNOW?"',
    curtainFail: '"Wrong! And now — the finale!"',
    pyre: '"Let\'s set the mood. Lights exactly as I like them."',
    pyreWin: '"My lights! You\'ve ruined the ambiance!"',
    pyreFail: '"Too dark. Let\'s burn it ALL down."',
    finale: '"For my final number... I\'ll need a volunteer. Or four."',
    finaleWin: '"No— NO! My big finish!"',
    finaleFail: '"Curtain falls. Hold your applause."',
    clashWin: '"You singed my COAT!"',
    clashLoss: '"Know your place, darling."',
    berserk: '"Time\'s up. The show goes on WITHOUT you."',
    death: '"...Fine. Standing ovation... granted."',
    retry: '"Shall we try that again? From the top!"',
    duet: '"A duet? How daring."',
    spotlightFail: '"Nobody wants my spotlight?!"',
    wheel: '"Round and round we go, darlings!"',
    // the spotlight gaze: with her crown she wants every eye on her; without it she wants none (the lines only hint at that)
    gaze: '"Eyes on the star, darlings."',
    gazeFlip: '"No crown... no pictures!"',
    // stage cues that run under her other patterns: Tableau = freeze, Music = keep moving (players work that out themselves)
    cueHold: '"Tableau!"',
    cueDance: '"Music, maestro!"',
    charm: '"Oh, a fan!"',
    masquerade: '"Masks on, darlings! Shall we dance?"',
    act2: '"Intermission is over, darlings. Act Two!"'
  };
  // READ THE SCRIPT: each line ALWAYS means the same two steps, so players who listen learn her script. far = be away from her,
  // near = be right beside her, stack = everyone together, spread = everyone apart. On Hard she sometimes ad-libs: the page in her
  // hand is burning and the steps come out the other way round.
  const SCRIPT = [
    { file: 'script_wings', text: '"From the wings... to centre stage!"', steps: ['far', 'near'] },
    { file: 'script_centre', text: '"Centre stage... then off to the wings!"', steps: ['near', 'far'] },
    { file: 'script_chorus', text: '"The whole chorus... then solos!"', steps: ['stack', 'spread'] },
    { file: 'script_solo', text: '"Solos first... then the whole chorus!"', steps: ['spread', 'stack'] }
  ];

  // ---- her recorded voice: game/sounds/Ignis Vane/ignis_<file>.mp3, looked up by the exact line text so say() finds the clip.
  // pri follows the shared voice rules: a lower number never cuts off a higher one that is still playing.
  const VOICE = {};
  const SOUND_DIR = 'game/sounds/Ignis%20Vane/ignis_';
  const voice = (text, file, pri = 2) => { VOICE[text] = { key: 'ig_' + file, file, pri, text: text.replace(/^"|"$/g, '') }; };
  voice(LINES.intro, 'intro', 4);
  [['open', 'open'], ['taunt', 'taunt'], ['hitPlayer', 'hit'], ['down', 'down'], ['counter', 'counter'], ['rebuke', 'rebuke'], ['stagger', 'stagger']]
    .forEach(([list, file]) => LINES[list].forEach((t, i) => voice(t, file + '_0' + (i + 1))));
  [['fanBreak', 'fan_break'], ['crownBreak', 'crown_break'], ['tantrum', 'tantrum'], ['curtain', 'curtain'], ['curtainWin', 'curtain_win'],
    ['curtainFail', 'curtain_fail'], ['pyre', 'pyre'], ['pyreWin', 'pyre_win'], ['pyreFail', 'pyre_fail'], ['finale', 'finale'],
    ['finaleWin', 'finale_win'], ['finaleFail', 'finale_fail'], ['clashWin', 'clash_win'], ['clashLoss', 'clash_loss'], ['berserk', 'berserk'],
    ['retry', 'retry'], ['duet', 'karok_start'], ['wheel', 'wheel'], ['gaze', 'gaze'], ['gazeFlip', 'gaze_flip'], ['cueHold', 'cue_hold'],
    ['cueDance', 'cue_dance'], ['charm', 'charm'], ['masquerade', 'masquerade'], ['act2', 'act2']].forEach(([k, file]) => voice(LINES[k], file, 3));
  SCRIPT.forEach(s => voice(s.text, s.file, 4));
  [['tantrumEnd', 'tantrum_end'], ['showoff', 'showoff'], ['curtainFound', 'curtain_found'], ['spotlightFail', 'spotlight_fail']]
    .forEach(([k, file]) => voice(LINES[k], file, 2));
  voice(LINES.death, 'death', 5);
  // wordless takes (no subtitle)
  const GRUNTS = { laugh: 1, effort_01: 1, effort_02: 1, hurt: 1, flash_charge: 3 };
  if (typeof audio !== 'undefined' && audio && audio.voiceMetadata) {
    for (const v of Object.values(VOICE)) audio.voiceMetadata[v.key] = { src: SOUND_DIR + v.file + '.mp3', text: v.text, duration: 2.6, priority: v.pri, volume: 0.95, lazy: true };
    for (const [file, pri] of Object.entries(GRUNTS)) audio.voiceMetadata['ig_' + file] = { src: SOUND_DIR + file + '.mp3', text: '', duration: 1.5, priority: pri, volume: 0.92, lazy: true };
  }
  const MUSIC = {
    ig_phase1: 'game/sounds/Ignis%20Vane/ignis_phase_1.mp3',
    ig_phase2: 'game/sounds/Ignis%20Vane/ignis_phase_2.mp3',
    ig_mechanic: 'game/sounds/Ignis%20Vane/ignis_mechanics.mp3',
    ig_finale: 'game/sounds/Ignis%20Vane/ignis_finale_music.mp3'
  };

  class IgnisVaneBoss extends VaelgorRaidBoss {
    constructor(x, y) {
      super(x, y);
      this.isIgnis = true;
      this.raidId = 'ignis';
      this.name = 'Ignis Vane, the Pyre Diva';
      this.hudName = 'IGNIS VANE';
      this.speakerName = 'IGNIS';
      this.subtitle = 'THE PYRE DIVA • THE GILDED PYRE';
      this.modelScale = 1.55;
      this.hipWidth = 5.4;
      this.thighLen = 22.5;
      this.shinLen = 22;
      this.turnSpeed = 7.5;
      this.ignisInit();
      this.snapFeetToBody();
    }

    // everything of hers that a new raid resets
    ignisInit() {
      this.ego = 60; this.tantrumT = 0; this.egoDmgAcc = 0;
      this.phase = 1; this.burntOut = false;
      this.act2 = false; this.act2Done = false;   // ACT II: from 55% she plays the rest of the show in her flame gown
      this.mech70 = false; this.mech40 = false; this.mech10 = false; this.pendingMech = null;
      this.mechRetried = {}; this.mechRetry = null;
      this.mech = null;               // the running mechanic's own state
      this.wallR = null; this.wallCreep = 0;
      this.teles = []; this.hazards = []; this.proj = []; this.vfx = [];
      this.pat = null; this.patT = 0; this._patPrev = 0; this.patRng = Math.random;
      this.mirrorImg = null; this.fanTorn = false; this.crownGone = false;
      this.lastDownCount = 0; this.patSerial = 0;
      this.flameJetT = 0;
      this.flashBeam = null; this._proneAt = 0; this.ancLift = 0;
      this.cue = null; this._cueAt = 0; this._quietUntil = 0;   // Freeze Frame stage cues
      this.script = null; this.gaze = null;
      // Karok Clash flavour: a beam, not a blade (karok_clash.js reads these)
      this.karokStyle = 'beam';
      this.karokLane = { fill: '249, 115, 22', edge: '253, 186, 116', len: 560, half: 72 };
      // keep Vaelgor's own phase machinery switched off for good
      this.eclipse75Triggered = this.eclipse55Triggered = this.eclipse35Triggered = this.eclipse10Triggered = true;
      this.finalPhase = false; this.finalTransitionPending = false; this.finalTransitionActive = false;
      this.finalClash15Triggered = true;
    }

    get maxSpeed() { return (this.enraged && this.enrageTimer <= 0) ? 190 : (this.tantrumT > 0 ? 175 : (this.act2 ? 152 : 140)); }

    outgoingDamageMult() {
      if (this.enraged && this.enrageTimer <= 0) return 2.2;
      let m = 1;
      if (this.act2) m *= 1.1;
      if (this.tantrumT > 0) m *= 1.15;
      if (this.burntOut) m *= 0.9;
      return m;
    }

    // how fast her patterns play (also what Rebuke reads to time its windows)
    patRate() {
      if (this.state === 'staggered' || this.state === 'rebuked' || this.state === 'flinched' || this.state === 'intro_cutscene') return 1;
      let r = this.phase >= 3 ? 1.2 : (this.phase === 2 ? 1.12 : 1.05);
      if (this.act2) r *= 1.06;
      if (this.tantrumT > 0) r *= 1.2;
      if (this.burntOut) r *= 0.92;
      if (this.enraged && this.enrageTimer <= 0) r = Math.max(r, 1.32);
      return r;
    }

    applyLobbyScaling(partySize = 1, resetHp = false) {
      const n = Math.max(1, partySize || 1);
      const hpMult = 1.0 + (n - 1) * 0.85, stagMult = 1.0 + (n - 1) * 0.55;
      const prevFrac = this.maxHp > 0 ? c01(this.hp / this.maxHp) : 1;
      // same gear tier as Vaelgor, a little more to chew through: his 172500 resets to 50% at his final phase (~241500 in all),
      // she has no reset, so 277500 is about 15% more fight than him (both x1.5 on 2026-10-18)
      this.maxHp = Math.round(277500 * hpMult);
      this.hp = resetHp ? this.maxHp : Math.max(1, Math.round(this.maxHp * prevFrac));
      this.maxStagger = Math.round(4000 * stagMult);
      this.partBreakMax = Math.round(1050 * stagMult);
      this.curtainCheckMax = Math.round(240 * stagMult);
      this.partySizeNow = n;
    }

    applyEnrage(fromNetwork = false) {
      if (this.enraged && this.enrageTimer <= 0) return;
      this.enrageTimer = 0; this.enraged = true; this.awakened = true;
      audio.playImpactBoom(2.0);
      if (window.fx) {
        window.fx.triggerShake(26, 0.7);
        window.fx.addPillar(this.x, this.y, 90, '#fb923c', 1.2);
        window.fx.addShockwave(this.x, this.y, 380, '#f97316', 9);
      }
      this.say(LINES.berserk, 3.2);
      if (!fromNetwork) this.broadcastBossEvent('enrage');
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // small helpers
    // ---------------------------------------------------------------------------------------------------------------------------
    // a spoken line: plays her clip (its subtitle then lasts exactly as long as the clip); falls back to subtitle-only when muted
    say(text, dur = 2.8, force = false) {
      if (!text || typeof audio === 'undefined' || !audio) return;
      if (!force && performance.now() < (this._quietUntil || 0)) return;   // a cue line is talking: small talk waits its turn
      const v = VOICE[text];
      if (v && !audio.muted && audio.playBossVoiceClip) {
        audio.playBossVoiceClip(v.key, null, force);
        if (audio.currentVoiceKey === v.key) return;
        if (audio.isVoicePlaying && audio.isVoicePlaying()) return;   // a bigger line is still talking: skip this one
      }
      audio.voiceSubtitleText = text.replace(/^"|"$/g, '');
      audio.voiceSubtitleMaxTimer = dur;
      audio.voiceSubtitleTimer = dur;
    }
    // a line that carries information (a stage cue, her script): it always plays, and nothing else of hers talks over it
    cueSay(text, dur) {
      this._quietUntil = performance.now() + dur * 1000;
      this.say(text, dur, true);
    }
    // a wordless take (laugh, grunt, gasp) that only plays into silence
    grunt(file) {
      if (performance.now() < (this._quietUntil || 0)) return;
      if (typeof audio === 'undefined' || !audio || audio.muted || !audio.playBossVoiceClip) return;
      if (audio.isVoicePlaying && audio.isVoicePlaying()) return;
      audio.playBossVoiceClip('ig_' + file);
    }
    // her own soundtrack (camera_25d.js asks): tango until 40%, paso doble below it or berserk, music box for mechanics, aria from the finale on
    get musicFiles() { return MUSIC; }
    musicKeyFor(base) {
      if (this.mech10 || this.state === 'finale_mechanic') return 'ig_finale';
      if (base === 'mechanic') return 'ig_mechanic';
      return (this.act2 || this.phase >= 3 || (this.enraged && this.enrageTimer <= 0)) ? 'ig_phase2' : 'ig_phase1';
    }
    pick(list, rnd) { return list[Math.floor((rnd || Math.random)() * list.length) % list.length]; }
    at(sec) { return this._patPrev < sec && this.patT >= sec; }
    aim(p) { if (p) this.facingAngle = Math.atan2((p.y - this.y) / T(), p.x - this.x); this.baseFacing = this.facingAngle; }
    reaim(maxTurn) {
      const p = this.tgt(); if (!p) return;
      const want = Math.atan2((p.y - this.y) / T(), p.x - this.x);
      const d = wrapA(want - this.facingAngle);
      this.facingAngle += Math.max(-maxTurn, Math.min(maxTurn, d));
    }
    tgt() { return this.resolveTargetById(living(), this.activeTargetId); }
    fwd(d, a = this.facingAngle, ox = this.x, oy = this.y) { return { x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d * T() }; }
    fanMult() { return this.fanTorn ? 0.75 : 1; }
    // a floor telegraph that fills up until it lands (lead = seconds of pattern time)
    tele(o, lead) { o.life = o.max = Math.max(0.05, lead); this.teles.push(o); return o; }
    vfxAdd(o) { o.t = 0; if (o.x == null) { o.x = this.x; o.y = this.y; } this.vfx.push(o); if (this.vfx.length > 120) this.vfx.shift(); return o; }
    hurt(p, dmg, label, power = 'medium', sx = this.x, sy = this.y, push = 110) {
      if (!p || p.hp <= 0) return;
      p.takeDamage(Math.round(dmg * this.outgoingDamageMult()), label, { power, sourceX: sx, sourceY: sy, pushDist: push });
      // the odd jab when she lands a big one on you (each client only hears it for its own player)
      if (p.isLocal && power === 'heavy' && !this.isMech() && !(audio && audio.voiceSubtitleTimer > 0) && performance.now() > (this._jabAt || 0) && Math.random() < 0.35) {
        this._jabAt = performance.now() + 9000;
        this.say(this.pick(LINES.hitPlayer), 1.8);
      }
    }
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
      if (m.kind === 'curtain') return !m.found;          // hiding among the decoys until someone unmasks her
      if (m.kind === 'finale') return m.phase !== 'down';  // up in the air with her sun
      if (m.kind === 'act2') return true;                  // behind the curtain, changing
      return false;
    }
    holdBlocked() { return this.isMech() || this.state === 'intro_cutscene'; }
    hudTag() {
      if (this.hp <= 0) return '';
      if (this.isMech()) return this.mech && this.mech.kind === 'finale' ? ' • FINALE' : ' • WARDED';
      if (this.tantrumT > 0) return ' • TANTRUM';
      if (this.burntOut) return ' • BURNT OUT';
      return '';
    }
    isInCutscene() { return this.state === 'intro_cutscene'; }

    // break points (the shared hit-scan picks the nearer one): left = the fan on her right-hand side, right = the crown (struck head-on)
    getShoulderWorldPositions() {
      const a = this.facingAngle, cs = Math.cos(a), sn = Math.sin(a), S = this.modelScale;
      const fan = { x: this.x + (8 * cs - 20 * sn) * S, y: this.y + (8 * sn + 20 * cs) * S * T() };
      const crown = { x: this.x + 15 * cs * S, y: this.y + 15 * sn * S * T() };
      const L = this.leftShoulderWorld || (this.leftShoulderWorld = {}), R = this.rightShoulderWorld || (this.rightShoulderWorld = {});
      L.x = fan.x; L.y = fan.y; R.x = crown.x; R.y = crown.y;
      if (L.sx == null) { L.sx = L.x; L.sy = L.y - 90; }
      if (R.sx == null) { R.sx = R.x; R.sy = R.y - 170; }
      return { left: L, right: R };
    }
    breakCoreName(side) { return side === 'left' ? 'FAN CORE' : 'CROWN CORE'; }

    recordExecutedPattern(name) {
      if (MECH_RE.test(name) || name === 'intro_cutscene' || name === 'ig_taunt') return;
      this.recentPatterns.push(name);
      while (this.recentPatterns.length > 2) this.recentPatterns.shift();
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // reset / intro
    // ---------------------------------------------------------------------------------------------------------------------------
    coreReset(x, y) {
      for (const p of party()) if (p) { p.qteActive = false; p.rooted = false; p.ignisScorch = 0; p.igHearts = 0; p.igHeartT = 0; p.ignisCharm = 0; p._igStill = 0; }
      this.x = x; this.y = y; this.spawnX = x; this.spawnY = y;
      this.applyLobbyScaling(party().length || 1, true);
      this.stagger = 0;
      this.enrageMaxTimer = 330; this.enrageTimer = 330; this.enraged = false; this.awakened = false;   // Hard 5:30 (Normal: difficulty.js)
      this.leftPartBreak = this.rightPartBreak = 0; this.leftPauldronBroken = this.rightPauldronBroken = false;
      this.partBreak = 0; this.pauldronBroken = false;
      this.recentPatterns = []; this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 1.2;
      this.recoilX = this.recoilY = this.recoilVx = this.recoilVy = 0;
      this.hitFlashTimer = 0; this.leftPauldronFlashTimer = this.rightPauldronFlashTimer = 0;
      this.hitStutterTimer = 0; this.lockedByUltimateTimer = 0; this.jumpZ = 0;
      this.counterableWindow = false;
      this.threatMap.clear(); this.activeTargetId = null; this.targetReevalTimer = 0;
      this.practiceClockMode = this.practiceFinalPhaseMode = this.practiceFinalClashMode = false;
      this.ignisInit();
      this.facingAngle = Math.PI * 0.5;
      this.snapFeetToBody();
      if (this.resetRig) this.resetRig();
    }

    coreIntro() {
      this.state = 'intro_cutscene';
      this.stateDuration = 5.4; this.stateTimer = 5.4; this.patT = 0; this._patPrev = 0;
      this.counterableWindow = false; this.jumpZ = 0;
      this.x = this.spawnX; this.y = this.spawnY; this.facingAngle = Math.PI * 0.5; this.baseFacing = this.facingAngle;
      this.speed = 0; this.vx = this.vy = 0; this.targetX = this.x; this.targetY = this.y;
      this.snapFeetToBody();
      if (this.resetRig) this.resetRig();
      const cam = window.game && window.game.camera;
      if (cam && typeof cam.startCinematicCutscene === 'function') {
        cam.x = this.x; cam.y = this.y - 60;
        cam.startCinematicCutscene(this.x, this.y - 60, 5.4, 1.42, 'IGNIS VANE, THE PYRE DIVA', 'HEADLINER OF THE GILDED PYRE', LINES.intro);
      }
      if (typeof audio !== 'undefined' && audio) {
        if (audio.preloadVoiceGroup) audio.preloadVoiceGroup('ig_');
        this.say(LINES.intro, 5, true);
      }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // damage taken
    // ---------------------------------------------------------------------------------------------------------------------------
    coreReceiveDamage(dmg, staggerAmt, attacker, hitOpts) {
      if (this.hp <= 0 || this.state === 'intro_cutscene') return;
      const opts = hitOpts || {};
      if (!opts.fromNetwork && attacker && attacker.isRemote) return;   // the owner's boss_hit packet is the real one
      if (this.isUntargetable()) return;
      const host = isHost();

      // which part the strike landed nearest (left = fan, right = crown)
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

      let stagMult = this.tantrumT > 0 ? 1.3 : 1;
      const m = this.mech;
      if (m) {
        if (m.warded) { dmg = Math.max(1, Math.round(dmg * 0.05)); stagMult = 0; }
        if (m.kind === 'finale' && m.phase !== 'down') { dmg = Math.max(1, Math.round(dmg * 0.02)); stagMult = 0; }
        // Masquerade: the masks soak hits; only a counter on the real one ends it
        if (m.kind === 'curtain') { dmg = Math.max(1, Math.round(dmg * 0.1)); stagMult = 0; }
      }

      // HP: below 10% nothing gets through until the Finale has been beaten (99% reduction, like a held breath)
      const floor10 = Math.ceil(this.maxHp * 0.10), floor1 = Math.max(1, Math.ceil(this.maxHp * 0.01));
      if (!this.mech10) {
        if (this.hp - dmg <= floor10) {
          const over = Math.max(0, dmg - Math.max(0, this.hp - floor10));
          this.hp = Math.max(floor1, Math.min(this.hp, floor10) - Math.max(1, Math.round(over * 0.01)));
          if (host && !this.pendingMech && !this.isMech()) this.pendingMech = 'finale_mechanic';
        } else this.hp = Math.max(0, this.hp - dmg);
      } else if (m && m.kind === 'finale') {
        this.hp = Math.max(floor1, this.hp - dmg);
      } else this.hp = Math.max(0, this.hp - dmg);

      this.hitFlashTimer = 0.085;
      if (side === 'left' && !this.leftPauldronBroken) this.leftPauldronFlashTimer = Math.max(this.leftPauldronFlashTimer, 0.12);
      if (side === 'right' && !this.rightPauldronBroken) this.rightPauldronFlashTimer = Math.max(this.rightPauldronFlashTimer, 0.12);

      let hitAng = this.facingAngle + Math.PI;
      if (attacker && attacker.x !== undefined) hitAng = Math.atan2((this.y - attacker.y) / T(), this.x - attacker.x);
      const imp = opts.impulseStrength || (opts.isStrongMove ? 1.35 : 0.75);
      this.recoilVx += Math.cos(hitAng) * 150 * imp; this.recoilVy += Math.sin(hitAng) * 150 * imp;
      this.pelvisVelZ -= 22 * imp; this.pauldronVelZ -= 34 * imp;
      if (opts.isStrongMove && !this.isMech()) this.hitStutterTimer = Math.max(this.hitStutterTimer, 0.07);

      // the stagger bar (frozen inside a mechanic and while already staggered)
      const sAmt = staggerAmt * stagMult;
      if (sAmt > 0 && this.state !== 'staggered' && !this.isMech()) {
        this.stagger += sAmt;
        if (!host) this.stagger = Math.min(this.stagger, this.maxStagger - 1);
        else if (this.stagger >= this.maxStagger) { this.stagger = 0; this.ignisStagger('💥 STAGGER BROKEN!'); }
      }

      // part breaks: precise strong hits on the fan (from her fan side) or the crown (head-on)
      const pb = opts.partBreakMult !== undefined ? opts.partBreakMult : (opts.isStrongMove ? 1.0 : 0);
      const broken = side === 'left' ? this.leftPauldronBroken : this.rightPauldronBroken;
      const dPart = side === 'left' ? dL : dR;
      if (!broken && pb > 0 && dPart <= 66 && !(m && m.warded)) {
        let pos = opts.posType;
        if (!pos && attacker && attacker.x !== undefined) {
          const diff = Math.abs(wrapA(Math.atan2(attacker.y - this.y, attacker.x - this.x) - this.facingAngle));
          pos = diff < 0.95 ? 'head' : (diff > Math.PI - 1.15 ? 'back' : 'normal');
        }
        const eff = this.state === 'staggered' ? 1.25 : (pos === 'head' ? 1.0 : (pos === 'normal' ? 0.78 : 0));
        const gain = staggerAmt * 0.42 * pb * eff;
        if (gain > 0) {
          const cap = host ? this.partBreakMax : this.partBreakMax - 1;
          if (side === 'left') { this.leftPartBreak = Math.min(cap, this.leftPartBreak + gain); if (this.leftPartBreak >= this.partBreakMax) this.breakPauldron('left', false); }
          else { this.rightPartBreak = Math.min(cap, this.rightPartBreak + gain); if (this.rightPartBreak >= this.partBreakMax) this.breakPauldron('right', false); }
          this.partBreak = this.leftPartBreak + this.rightPartBreak;
        }
      }

      if (host) {
        // steady damage wears her ego down: 1 point for every 2% of her health
        this.egoDmgAcc += dmg;
        const step = this.maxHp * 0.02;
        while (this.egoDmgAcc >= step) { this.egoDmgAcc -= step; this.egoAdd(-1); }
        const pct = this.hp / this.maxHp;
        if (pct <= 0.70 && !this.mech70 && !this.pendingMech) { this.mech70 = true; this.pendingMech = 'curtain_mechanic'; }
        else if (pct <= 0.55 && this.mech70 && !this.act2Done && !this.pendingMech) { this.act2Done = true; this.pendingMech = 'act2_mechanic'; }
        else if (pct <= 0.40 && !this.mech40 && !this.pendingMech) { this.mech40 = true; this.pendingMech = 'pyre_mechanic'; }
      }
    }

    // a stagger break (bar full, counter-shatter, or a mechanic solved). The shared enterStaggerState does the state + packets.
    ignisStagger(text, dur) {
      this.cleanMechanic();
      this.enterStaggerState(text);
      if (dur) { this.stateDuration = dur; this.stateTimer = dur; }
      this.egoAdd(-20);
    }
    // every client goes through here (the host directly, guests from the stagger_state packet)
    enterStaggerState(text, fromNetwork = false) {
      if (this.mech) this.cleanMechanic(true);
      this.pat = null; this.patName = null; this.mirrorImg = null; this.petalRot = null; this.jumpZ = 0;   // (a Grand Jeté can be broken mid-air)
      super.enterStaggerState(text, fromNetwork);
      if (/BRAVO|LIGHTS OUT|ENCORE DENIED/.test(String(text || ''))) { this.stateDuration = this.stateTimer = /ENCORE/.test(text) ? 8 : 6; }
      else if (text !== '@none') this.say(this.pick(LINES.stagger), 2.4);
    }

    executeCounterStagger(player, fromNetwork = false) {
      // Masquerade: countering the real dancer (the blue one) shatters the masks. The host decides; a guest just asks.
      const m = this.mech;
      if (m && m.kind === 'curtain') {
        if (!fromNetwork && NET()) NET().broadcast({ type: 'boss_event', event: 'counter_stagger', playerId: player ? player.id : null });
        if (!isHost()) { audio.playParryClang(true); audio.playCounterSuccessBoom && audio.playCounterSuccessBoom(); return; }
        const late = (this.counterGraceTimer || 0) > 0;          // a guest's counter that arrives just after the flash closed still counts
        if (m.phase !== 'lunge' || !(m.counterOpen || (fromNetwork && late))) return;
        audio.playParryClang(true); audio.playCounterSuccessBoom && audio.playCounterSuccessBoom();
        if (window.fx) { window.fx.triggerZoomPunch && window.fx.triggerZoomPunch(0.08); window.fx.addShockwave(this.x, this.y, 200, '#38bdf8', 7); }
        this.egoAdd(-14);
        this.endCurtain(true);
        return;
      }
      const was = this.state;
      super.executeCounterStagger(player, fromNetwork);
      if (isHost() && (this.state === 'staggered' && was !== 'staggered')) { this.egoAdd(-14); this.say(this.pick(LINES.counter), 2.2); }
    }

    lockInPlaceForUltimate(...args) {
      if (this.isMech() || this.state === 'intro_cutscene') return;
      return super.lockInPlaceForUltimate(...args);
    }

    // the Rebuke recoil: rebuke_boss.js calls this on every client; ego only moves on the host
    enterRebuked(px, py) {
      super.enterRebuked(px, py);
      if (isHost()) { this.egoAdd(-10); }
      if (Math.random() < 0.5) this.say(this.pick(LINES.rebuke), 2);
    }

    partBreakFlinch() {
      if (this.isMech() || ['intro_cutscene', 'staggered', 'rebuked', 'flinched', 'karok_clash'].indexOf(this.state) >= 0) return;
      if (this.lockedByUltimateTimer > 0 || (this.jumpZ || 0) > 2 || this.hp <= 0) return;
      this.counterableWindow = false; this.speed = 0; this.vx = this.vy = 0; this.targetX = this.x; this.targetY = this.y;
      this.pat = null; this.state = 'flinched'; this.stateDuration = 0.6; this.stateTimer = 0.6; this.patT = 0; this._patPrev = 0;
      this.snapFeetToBody();
      this._rebukePush = { ux: -Math.cos(this.facingAngle), uy: -Math.sin(this.facingAngle), dist: 30, dur: 0.25, t: 0 };
      this.aiCooldown = Math.min(this.aiCooldown || 0, 1.0);
      this.grunt('hurt');
    }

    coreBreakPart(side, fromNetwork = false) {
      const left = side === 'left';
      if (left ? this.leftPauldronBroken : this.rightPauldronBroken) return;
      if (left) { this.leftPartBreak = this.partBreakMax; this.leftPauldronBroken = true; this.leftPauldronFlashTimer = 0; this.fanTorn = true; }
      else { this.rightPartBreak = this.partBreakMax; this.rightPauldronBroken = true; this.rightPauldronFlashTimer = 0; this.crownGone = true; }
      this.partBreak = this.leftPartBreak + this.rightPartBreak;
      this.pauldronBroken = this.leftPauldronBroken && this.rightPauldronBroken;
      const pos = this.getShoulderWorldPositions()[left ? 'left' : 'right'];
      audio.playParryClang(true); audio.playImpactBoom(1.35);
      if (window.fx) {
        window.fx.triggerShake(18, 0.42);
        window.fx.addShockwave(pos.x, pos.y, 140, left ? '#fb7185' : '#fde047', 5);
        window.fx.addDragSparks(pos.x, pos.y - (left ? 70 : 150), 0, 30, false, left ? '#fda4af' : '#fde68a');
      }
      this.say(left ? LINES.fanBreak : LINES.crownBreak, 3);
      // the crown holds the stage fire: with it gone the wall falls back to the rim and creeps far slower
      if (!left && this.wallR != null) this.wallR = Math.max(this.wallR, (window.game ? window.game.arenaRadius : 590) - 12);
      if (isHost()) this.egoAdd(-25);
      this.partBreakFlinch();
      if (!fromNetwork) this.broadcastBossEvent('pauldron_break', { side: left ? 'left' : 'right' });
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // EGO
    // ---------------------------------------------------------------------------------------------------------------------------
    egoAdd(v) {
      if (!isHost() || this.tantrumT > 0 || this.hp <= 0) return;
      this.ego = Math.max(0, Math.min(100, this.ego + v));
      if (this.ego <= 0) this.startTantrum(false);
    }
    startTantrum(fromNetwork) {
      this.tantrumT = 18; this.ego = 0;
      this.say(LINES.tantrum, 3);
      audio.playImpactBoom(1.6);
      if (window.fx) {
        window.fx.triggerShake(20, 0.5); window.fx.triggerScreenFlash('#ef4444', 0.22);
        window.fx.addShockwave(this.x, this.y, 300, '#ef4444', 8); window.fx.addPillar(this.x, this.y, 70, '#f97316', 0.9);
      }
      if (!fromNetwork) send({ event: 'ignis_tantrum' });
    }
    tickEgo(dt) {
      if (this.tantrumT > 0) {
        this.tantrumT = Math.max(0, this.tantrumT - dt);
        if (this.tantrumT <= 0) { this.ego = 55; this.say(LINES.tantrumEnd, 2.6); }
      }
      // her ego climbing into showing-off range (ego arrives in boss_sync, so every client hears this)
      const high = this.ego >= 85 && this.tantrumT <= 0 && this.hp > 0;
      if (high && !this._egoHigh && !this.isMech()) this.say(LINES.showoff, 2.4);
      this._egoHigh = high;
      // players going down feed her ego (the host owns the number; everyone hears the gloat)
      const downs = party().filter(p => p && !p.isBot && p.hp <= 0).length;
      if (downs > this.lastDownCount) { if (isHost()) this.egoAdd(12 * (downs - this.lastDownCount)); if (Math.random() < 0.3) this.grunt('laugh'); else this.say(this.pick(LINES.down), 2.2); }
      this.lastDownCount = downs;
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // UPDATE
    // ---------------------------------------------------------------------------------------------------------------------------
    coreUpdate(dt, partyArr, arenaCenter, arenaRadius) {
      if (this.hp <= 0) { this.teles.length = 0; return; }
      if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      if (this.leftPauldronFlashTimer > 0) this.leftPauldronFlashTimer = Math.max(0, this.leftPauldronFlashTimer - dt);
      if (this.rightPauldronFlashTimer > 0) this.rightPauldronFlashTimer = Math.max(0, this.rightPauldronFlashTimer - dt);
      this.counterGraceTimer = this.isCounterable() ? 0.25 : Math.max(0, (this.counterGraceTimer || 0) - dt);
      this.recoilVx += (-this.recoilX * 185 - this.recoilVx * 16) * dt; this.recoilVy += (-this.recoilY * 185 - this.recoilVy * 16) * dt;
      this.recoilX += this.recoilVx * dt; this.recoilY += this.recoilVy * dt;
      this.pelvisVelZ += (-this.pelvisBounceZ * 140 - this.pelvisVelZ * 14) * dt; this.pelvisBounceZ += this.pelvisVelZ * dt;
      this.pauldronVelZ += (-this.pauldronLagZ * 95 - this.pauldronVelZ * 10) * dt; this.pauldronLagZ += this.pauldronVelZ * dt;
      if (this.flameJetT > 0) this.flameJetT = Math.max(0, this.flameJetT - dt);
      if (this.flashBeam) { this.flashBeam.t += dt; if (this.flashBeam.t >= this.flashBeam.dur) this.flashBeam = null; }
      if (this._proneAt && this.state !== 'staggered') this._proneAt = 0;
      const host = isHost();

      const cut = this.state === 'intro_cutscene' || (this.mech && this.mech.phase === 'intro');
      if (!cut && !this.enraged) {
        this.enrageTimer = Math.max(host ? 0 : 0.05, this.enrageTimer - dt);
        if (host && this.enrageTimer <= 0) this.applyEnrage(false);
      }
      this.decayThreat(dt);
      this.tickEgo(dt);
      this.getShoulderWorldPositions();
      const L = (partyArr || []).filter(p => p.hp > 0);
      this.updateTeles(dt * (this.pat ? this.patRate() : 1));
      this.updateHazards(dt, L);
      this.updateProjectiles(dt, L);
      this.updateWall(dt, L, arenaRadius || 590);
      this.tickCue(dt, L);
      this.tickHearts(dt, L);
      for (const v of this.vfx) v.t += dt;
      this.vfx = this.vfx.filter(v => v.t < (v.life || 1));
      if (this.updateRig) this.updateRig(dt);

      if (this.hitStutterTimer > 0) { this.hitStutterTimer = Math.max(0, this.hitStutterTimer - dt); return; }
      if (this.lockedByUltimateTimer > 0) {
        this.lockedByUltimateTimer = Math.max(0, this.lockedByUltimateTimer - dt);
        this.vx = this.vy = this.speed = 0;
        return;
      }
      this.breathePhase += dt * 2.2;

      if (host && (this.state === 'idle' || this.state === 'walk')) {
        this.targetReevalTimer -= dt;
        if (this.targetReevalTimer <= 0 || !this.activeTargetId || !L.some(p => p.id === this.activeTargetId)) {
          this.selectTargetForPattern(L, 'aggro'); this.targetReevalTimer = 3.2;
        }
      }
      const primary = this.resolveTargetById(L, this.activeTargetId);

      // phase by health (also drives which patterns she has)
      const pct = this.hp / this.maxHp;
      this.phase = pct > 0.70 ? 1 : (pct > 0.40 ? 2 : 3);
      this.awakened = this.phase >= 2;

      // a failed mechanic coming back (Normal), with a warning a few seconds before
      if (host && this.mechRetry) {
        const r = this.mechRetry, pt = r.t; r.t -= dt;
        if (pt > 4 && r.t <= 4) this.say(LINES.retry, 3);
        if (r.t <= 0 && !this.pendingMech && (this.state === 'idle' || this.state === 'walk')) { this.pendingMech = r.name; this.mechRetry = null; }
      }
      if (host && this.pendingMech && (this.state === 'idle' || this.state === 'walk') && this.lockedByUltimateTimer <= 0 && !this.karokClash) {
        const name = this.pendingMech; this.pendingMech = null;
        this.triggerPatternByName(name, null, false);
        return;
      }

      if (this.mech && !this.isMech()) this.cleanMechanic();    // a packet (stagger) ended it under us
      if (this.isMech()) {
        this.updateMechanic(dt, L);
      } else if ((this.state === 'idle' || this.state === 'walk') && primary) {
        if (host) {
          // a Starstruck target comes to HER: she waits with open arms instead of stalking them
          if (primary.ignisCharm > 0) { this.targetX = this.x; this.targetY = this.y; }
          else { this.targetX = primary.x; this.targetY = primary.y; }
          this.aiCooldown -= dt;
          if (this.aiCooldown <= 0) this.chooseNext(L, primary);
        }
      } else if (this.state !== 'idle' && this.state !== 'walk' && this.state !== 'karok_clash') {
        this.updatePatternState(dt, L);
      }

      // stalking walk
      const dx = this.targetX - this.x, dy = this.targetY - this.y, d = Math.hypot(dx, dy);
      const canWalk = this.state === 'idle' || this.state === 'walk';
      if (canWalk && d > 72) {
        this.state = 'walk';
        this.moveAngle = Math.atan2(dy, dx);
        this.speed += (Math.min(this.maxSpeed, d * 1.8) - this.speed) * Math.min(1, 6 * dt);
        this.vx = Math.cos(this.moveAngle) * this.speed; this.vy = Math.sin(this.moveAngle) * this.speed;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.rotateTowards(Math.atan2(dy / T(), dx), dt);
      } else {
        if (this.state === 'walk') this.state = 'idle';
        this.speed *= 0.85; this.vx *= 0.85; this.vy *= 0.85;
        if (canWalk && primary) this.rotateTowards(Math.atan2((primary.y - this.y) / T(), primary.x - this.x), dt * 0.8);
      }
      if (!host) this.applyNetSyncCorrection(dt);
      if (arenaCenter && arenaRadius && !this.isMech()) {
        const lim = Math.min(arenaRadius - 40, this.wallR != null ? this.wallR - 50 : 1e9);
        const p = this.inArena(this.x, this.y, Math.max(60, lim)); this.x = p.x; this.y = p.y;
      }
      if (this.jumpZ <= 0.1) this.updateFootSteps(dt); else this.syncAirborneFeet();
    }

    // the pattern / stagger / recoil clock. stateTimer stays the authority (holds, Rebuke, stagger packets all set it).
    updatePatternState(dt, L) {
      if (this._clockState !== this.state) {
        this._clockState = this.state;
        if (this.state !== this.patName) { this.pat = null; this.patName = null; this.mirrorImg = null; this.petalRot = null; if (this.split) this.split.cur = null; }
        this._patPrev = this.stateDuration - this.stateTimer - 1e-6;
      } else this._patPrev = this.stateDuration - this.stateTimer;
      this.stateTimer -= dt * this.patRate();
      this.patT = this.stateDuration - this.stateTimer;
      if (this.state === 'intro_cutscene') this.tickIntro(dt);
      else if (this.pat && this.pat.tick) this.pat.tick(this, L, dt);
      if (this.stateTimer <= 0) this.endPattern();
    }

    endPattern() {
      const host = isHost();
      const was = this.state, def = this.pat;
      this.pat = null; this.patName = null; this.counterableWindow = false; this.jumpZ = 0; this.mirrorImg = null; this.petalRot = null;
      if (this.split) this.split.cur = null;
      if (this.split2) this.split2.cur = null;
      this.wheel = null; this.gaze = null; this.script = null;
      this.state = 'idle'; this.stateTimer = 0; this.patT = 0;
      if (was === 'intro_cutscene') { this.aiCooldown = 0.6; return; }
      if (def && host && was !== 'ig_taunt') this.egoAdd(def.ego || 4);   // a clean, uninterrupted pattern pleases her
      if (host) {
        const gap = this.tantrumT > 0 ? 0.75 : (this.burntOut ? 1.6 : (hard() ? 1.1 : 1.3));
        this.aiCooldown = gap;
      }
    }

    tickIntro(dt) {
      const t = this.patT;
      this.x = this.spawnX; this.y = this.spawnY; this.facingAngle = Math.PI * 0.5;
      const cam = window.game && window.game.camera;
      if (cam) { cam.cinematicTargetX = this.x; cam.cinematicTargetY = this.y - 60; }
      if (this.at(0.25)) { audio.playImpactBoom(1.2); if (window.fx) window.fx.addPillar(this.x, this.y, 60, '#f97316', 1.4); }
      if (this.at(2.0)) {
        audio.playImpactBoom(1.6);
        if (window.fx) { window.fx.triggerShake(16, 0.4); window.fx.addShockwave(this.x, this.y, 280, '#fb923c', 7); window.fx.addShockwave(this.x, this.y - 30, 160, '#fde047', 4); }
      }
      if (this.at(3.4)) { audio.playParryClang(false); if (window.fx) window.fx.addDragSparks(this.x + 20, this.y - 100, -Math.PI / 2, 18, false, '#fde047'); }
      if (window.fx && t < 2 && Math.random() < 0.7) {
        const a = Math.random() * TAU, r = 30 + Math.random() * 80;
        window.fx.addDragSparks(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * T(), -Math.PI / 2, 1, false, Math.random() < 0.5 ? '#fb923c' : '#fde047');
      }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // AI: which pattern next (host only)
    // ---------------------------------------------------------------------------------------------------------------------------
    chooseNext(L, primary) {
      const dist = Math.hypot(primary.x - this.x, (primary.y - this.y) / T());
      // high ego: every so often she stops to show off instead (a free opening)
      const now = performance.now() / 1000;
      if (this.ego >= 85 && this.tantrumT <= 0 && Math.random() < 0.35 && now - (this._tauntAt || 0) > 10) {
        this._tauntAt = now;
        this.triggerPatternByName('ig_taunt', primary, false);
        this.aiCooldown = 0.6;
        return;
      }
      const ph = this.phase, close = dist < 200;
      const c = [];
      const add = (name, w, mode = 'aggro') => { if (PATS[name] && (PATS[name].phase || 1) <= ph && (!PATS[name].act2 || this.act2)) c.push({ name, weight: w, mode }); };
      if (close) {
        add('ig_fan_flick', 14); add('ig_hair_flip', 11); add('ig_pirouette', 9); add('ig_curtsy', 8); add('ig_whip', 8); add('ig_kiss', 5, 'hunter');
        add('ig_mirror', 8); add('ig_tango', 7); add('ig_split', 6, 'hunter'); add('ig_spotlight', 6, 'hunter'); add('ig_ovation', 5, 'hunter');
        add('ig_fireworks', 8, 'hunter'); add('ig_wheel', 6, 'hunter');
      } else {
        add('ig_volley', 13, 'hunter'); add('ig_carpet', 12, 'hunter'); add('ig_whip', 8); add('ig_kiss', 10, 'hunter');
        add('ig_tango', 11, 'hunter'); add('ig_spotlight', 10, 'hunter'); add('ig_split', 9, 'hunter'); add('ig_ovation', 9, 'hunter'); add('ig_mirror', 7, 'hunter');
        add('ig_fireworks', 10, 'hunter'); add('ig_wheel', 8, 'hunter');
      }
      // Act II numbers
      add('ig_twin_fans', close ? 12 : 5); add('ig_grand_jete', close ? 7 : 12, 'hunter');
      if (!this.cue && performance.now() > this._quietUntil) add('ig_script', close ? 8 : 9, 'hunter');
      add('ig_gaze', 7);
      if (this.tantrumT > 0) for (const x of c) if (/flick|tango|whip|hair/.test(x.name)) x.weight *= 1.6;   // a tantrum is all claws
      // a stage cue runs UNDER the next pattern (from 70%, every ~30s): never during her script, whose lines must be heard
      if (ph >= 2 && !this.cue && now - (this._cueAt || 0) > 28 && Math.random() < 0.35) {
        for (const x of c) if (x.name === 'ig_script') x.weight = 0;
        this.startCue(Math.random() < 0.5 ? 'hold' : 'dance', false);
      }
      const chosen = this.selectNonRepeatingPattern(c.filter(x => x.weight > 0));
      if (!chosen) return;
      const tg = this.selectTargetForPattern(L, chosen.mode || 'aggro');
      this.triggerPatternByName(chosen.name, tg, false);
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // the dispatcher: host rolls a seed, every client plays the same pattern from it
    // ---------------------------------------------------------------------------------------------------------------------------
    triggerPatternByName(name, target, fromNetwork = false, netData = null) {
      if (target && target.id) this.activeTargetId = target.id;
      this._rebukeSerial = (this._rebukeSerial || 0) + 1; this._rebukeUsed = null;      // fresh Rebuke windows (rebuke_boss.js)
      const seed = (fromNetwork && netData && typeof netData.seed === 'number') ? netData.seed : ((Math.random() * 0x7fffffff) | 0);
      this.patSerial++;
      this.recordExecutedPattern(name);
      if (fromNetwork && netData) {
        if (typeof netData.x === 'number') { this.x = netData.x; this.y = netData.y; }
        if (typeof netData.facingAngle === 'number') this.facingAngle = netData.facingAngle;
      }
      const tg = target || this.tgt();
      if (name === 'intro_cutscene') this.triggerIntroCutscene();
      else if (name === 'pat_getsuga_charge') { this.pat = null; this.triggerPatternGetsugaCharge(tg); this._flashShout = false; }
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
      const def = PATS[name];
      this.pat = def; this.patName = name; this.patRng = rngFrom(seed);
      this.state = name; this.stateDuration = def.dur; this.stateTimer = def.dur;
      this.patT = 0; this._patPrev = -1e-6; this._clockState = name;
      this.mirrorImg = null; this.petalRot = null;
      this.counterableWindow = false; this.jumpZ = 0;
      this.speed = 0; this.vx = this.vy = 0; this.targetX = this.x; this.targetY = this.y;
      if (tg) this.aim(tg); else this.baseFacing = this.facingAngle;
      this.snapFeetToBody();
      def.start(this, tg, this.patRng);
      const chatty = name !== 'ig_taunt' && !def.speaks;      // patterns with their own line never get an opener on top
      if (chatty && this.patRng() < 0.22) this.say(this.pick(LINES.open, this.patRng), 2.2);
      else if (chatty && Math.random() < 0.3) this.grunt(Math.random() < 0.5 ? 'effort_01' : 'effort_02');   // voice only: Math.random keeps patRng in step across clients
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // floor telegraphs, lingering fire, projectiles, the burning wall
    // ---------------------------------------------------------------------------------------------------------------------------
    updateTeles(sdt) {
      for (const t of this.teles) {
        t.life -= sdt;
        if (t.follow) { t.x = this.x; t.y = this.y; if (t.k === 'sector' || t.k === 'corridor') t.a = this.facingAngle + (t.aOff || 0); }
      }
      this.teles = this.teles.filter(t => t.life > -0.18);
    }

    // lingering fire on the floor: each client burns its own player
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
          p[key] = performance.now() + 500;
          this.hurt(p, h.dmg, h.label, 'light', p.x, p.y, 20);
        }
      }
      this.hazards = this.hazards.filter(h => h.t < h.dur);
    }
    addHazard(o) { o.t = 0; o.id = (this._hzId = (this._hzId || 0) + 1); this.hazards.push(o); return o; }

    updateProjectiles(dt, L) {
      for (const pr of this.proj) {
        pr.t += dt;
        if (pr.k === 'lob') {
          if (!pr.done && pr.t >= pr.dur) {
            pr.done = true;
            if (pr.onLand) pr.onLand(this, pr, L);
            else {
              for (const p of L) if (flat(p, pr.x1, pr.y1) <= pr.r) this.hurt(p, pr.dmg, pr.label, pr.power || 'medium', pr.x1, pr.y1, 120);
              this.burst(pr.x1, pr.y1, pr.r, pr.col || '#fb923c');
            }
          }
        } else if (pr.k === 'spark') {
          // Catherine Wheel (Hard): a fireball flung straight out from the hub along a gap
          if (pr.done) continue;
          pr.x += Math.cos(pr.a) * pr.spd * dt; pr.y += Math.sin(pr.a) * pr.spd * dt * T();
          const hit = L.filter(p => (p.isLocal || p.isBot) && flat(p, pr.x, pr.y) <= 30);
          for (const p of hit) this.hurt(p, 160, 'Wheel Spark', 'medium', pr.x, pr.y, 110);
          if (hit.length || pr.t >= pr.life || flat(pr, STAGE.x, STAGE.y) > WHEEL.R) { pr.done = true; this.flair(pr.x, pr.y, 50, '#fde047', 0); }
        } else if (pr.k === 'kiss') {
          if (pr.done) continue;
          const tg = L.find(p => p.id === pr.tid) || L[0];
          const age = pr.t;
          const spd = Math.min(195, 120 + age * 30);
          if (tg) {
            const want = Math.atan2((tg.y - pr.y) / T(), tg.x - pr.x);
            pr.a += Math.max(-2.4 * dt, Math.min(2.4 * dt, wrapA(want - pr.a)));
          }
          pr.x += Math.cos(pr.a) * spd * dt; pr.y += Math.sin(pr.a) * spd * dt * T();
          const touch = L.some(p => flat(p, pr.x, pr.y) <= 30);
          if (touch || age >= pr.life) {
            pr.done = true;
            for (const p of L) {
              if (!(p.isLocal || p.isBot) || flat(p, pr.x, pr.y) > 100) continue;
              this.hurt(p, 360, 'Blown Kiss', 'heavy', pr.x, pr.y, 160);
              this.addHeart(p);
            }
            this.burst(pr.x, pr.y, 100, '#f472b6');
            this.vfxAdd({ k: 'hearts', x: pr.x, y: pr.y, r: 110, life: 1.1, seed: Math.random() * 10 });
            if (audio.playBellTone) { audio.playBellTone(1318, 0.35, 0.16); audio.playBellTone(1760, 0.5, 0.12); }
          }
        }
      }
      this.proj = this.proj.filter(pr => !pr.done || pr.t < (pr.k === 'lob' ? pr.dur + 0.05 : 0));
    }
    // a fireball lobbed from her hand to (x1, y1)
    lob(x1, y1, dur, r, dmg, label, extra) {
      const h = this.handWorld ? this.handWorld('l') : { x: this.x, y: this.y, z: 90 };
      const o = Object.assign({ k: 'lob', x0: h.x, y0: h.y, z0: h.z || 90, x1, y1, dur, r, dmg, label, t: 0 }, extra || {});
      this.proj.push(o);
      return o;
    }
    // showy extras for a landing hit: an ember spray, a heat ring on the floor, a starburst and a little shake (visual only)
    flair(x, y, r = 120, col = '#fb923c', shake = 6) {
      if (window.fx) {
        window.fx.addDragSparks(x, y - 10, -Math.PI / 2, 12, false, col);
        if (window.fx.addImpactStarburst) window.fx.addImpactStarburst(x, y - 40, '#fde047', 0.9 + r / 300, 0.25, 22);
        if (shake) window.fx.triggerShake(shake, 0.18);
      }
      this.vfxAdd({ k: 'embers', x, y, r, col, life: 0.95, seed: Math.random() * 10 });
      this.vfxAdd({ k: 'ring', x, y, r, col, life: 0.5 });
    }
    burst(x, y, r, col) {
      audio.playImpactBoom(0.9);
      if (window.fx) {
        window.fx.addShockwave(x, y, r * 1.1, col, 5, 0.4);
        window.fx.addDragSparks(x, y, -Math.PI / 2, 10, false, col === '#a855f7' ? '#d8b4fe' : '#fde047');
      }
      this.vfxAdd({ k: 'boom', x, y, r, col, life: 0.55 });
      this.vfxAdd({ k: 'embers', x, y, r, col, life: 0.8, seed: Math.random() * 10 });
    }

    // the burning ring at the edge of the stage (from the 40% mechanic on)
    updateWall(dt, L, arenaR) {
      if (this.wallR == null) return;
      let creep = this.wallCreep;
      if (this.crownGone) creep = Math.min(creep, 1.2);
      const min = this.mech && this.mech.kind === 'pyre' ? WALL_MIN : 300;
      if (this.state !== 'staggered') this.wallR = Math.max(Math.min(min, this.wallR), this.wallR - creep * dt);
      for (const p of L) {
        if (!p.isLocal && !p.isBot) continue;
        const d = flat(p, STAGE.x, STAGE.y);
        if (d < this.wallR - 6) continue;
        if ((p._igWall || 0) > performance.now()) continue;
        p._igWall = performance.now() + 450;
        const a = Math.atan2((p.y - STAGE.y) / T(), p.x - STAGE.x);
        this.hurt(p, 75, 'Burning Stage', 'light', STAGE.x + Math.cos(a) * (d + 40), STAGE.y + Math.sin(a) * (d + 40) * T(), 70);
      }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // FREEZE FRAME: a stage cue that runs underneath her patterns. The stage itself shows it: when a cue starts every footlight
    // snaps to the cue's colour, the lights then go dark one by one (that is the timer), and when the last one is out the stage
    // snaps back to warm with a boom. Nothing on screen says what to do.
    //   'hold'  (Tableau!)        cold white light, the frame of a painting. Moving burns.
    //   'dance' (Music, maestro!) red and gold chase lights. Standing still too long sets the boards alight under you.
    // Each client checks only its own player (and the host its bots). Host starts it; guests get boss_event 'ignis_cue'.
    // ---------------------------------------------------------------------------------------------------------------------------
    startCue(kind, fromNetwork, t0 = 0) {
      if (this.hp <= 0 || this.isMech() || this.state === 'intro_cutscene') return;
      if (this.cue && this.cue.kind === kind) return;
      const dur = kind === 'hold' ? 5.5 : 7;
      this.cue = { kind, t: t0, dur, warn: 1.0 };
      this._cueAt = performance.now() / 1000;
      if (t0 < 1.2) this.cueSay(kind === 'hold' ? LINES.cueHold : LINES.cueDance, 1.8);
      audio.playImpactBoom(1.3); audio.playParryClang(true);
      if (window.fx) { window.fx.triggerShake(10, 0.25); window.fx.triggerScreenFlash(kind === 'hold' ? '#dbeafe' : '#fb923c', 0.16); }
      for (const p of party()) if (p) { p._igStill = 0; p._igCueHit = 0; }
      if (!fromNetwork && isHost()) send({ event: 'ignis_cue', kind });
    }
    endCue(silent) {
      const C = this.cue;
      if (!C) return;
      this.cue = null;
      for (const p of party()) if (p) p._igStill = 0;
      if (silent) return;
      audio.playImpactBoom(1.2);
      if (window.fx) { window.fx.triggerShake(8, 0.2); window.fx.addShockwave(STAGE.x, STAGE.y, 560, C.kind === 'hold' ? '#e0f2fe' : '#fb923c', 6, 0.5); }
    }
    tickCue(dt, L) {
      const C = this.cue; if (!C) return;
      C.t += dt;
      if (C.t >= C.dur || this.hp <= 0) { this.endCue(false); return; }
      const nowMs = performance.now();
      for (const p of L) {
        // how far everyone moved this frame (every client tracks every player, so the floor shows it for allies too)
        const moved = p._igLX == null ? 0 : Math.hypot(p.x - p._igLX, (p.y - p._igLY) / T()) / Math.max(1e-3, dt);
        p._igLX = p.x; p._igLY = p.y;
        const shoved = /^hit_|wakeup|grabbed|clash/.test(p.state || '');   // being thrown around is not "moving"
        const moving = moved > 30 && !shoved;
        p._igStill = moving ? 0 : (p._igStill || 0) + dt;
        if (C.t < C.warn || !(p.isLocal || p.isBot) || p.hp <= 0) continue;
        if (p.isBot) {
          // bots take the hint: frozen for a tableau, shuffling about for the music
          if (C.kind === 'hold') { p.targetX = p.x; p.targetY = p.y; }
          else if (p._igStill > 0.5 && p.setMoveTarget) { const a = Math.random() * TAU; p.setMoveTarget(p.x + Math.cos(a) * 90, p.y + Math.sin(a) * 90 * T()); }
        }
        if (nowMs < (p._igCueHit || 0)) continue;
        if (C.kind === 'hold' && moving) {
          p._igCueHit = nowMs + 450;
          this.hurt(p, 110, 'Broke the Tableau', 'light', p.x, p.y, 0);
          this.vfxAdd({ k: 'embers', x: p.x, y: p.y, r: 46, col: '#bfdbfe', life: 0.6, seed: Math.random() * 9 });
        } else if (C.kind === 'dance' && p._igStill > 1.1) {
          p._igCueHit = nowMs + 450;
          this.hurt(p, 110, 'Two Left Feet', 'light', p.x, p.y, 0);
          this.vfxAdd({ k: 'embers', x: p.x, y: p.y, r: 56, col: '#fb923c', life: 0.6, seed: Math.random() * 9 });
        }
      }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // STARSTRUCK: every Blown Kiss that lands leaves a heart on you; the second heart and you are hers. A Starstruck player drifts
    // toward her and cannot attack (a dash shakes some of it off); if they reach her she sweeps them off their feet. An ally who
    // walks into them snaps them out of it. The owner of the player decides; everyone else is told by 'ignis_charm'.
    // ---------------------------------------------------------------------------------------------------------------------------
    addHeart(p) {
      if (!p || p.hp <= 0 || p.ignisCharm > 0) return;
      p.igHearts = (p.igHearts | 0) + 1; p.igHeartT = 10;
      if (p.igHearts >= 2) this.charmPlayer(p, false);
      else send({ event: 'ignis_hearts', pid: p.id, n: p.igHearts });   // so allies see the hearts over your head
    }
    charmPlayer(p, fromNetwork) {
      if (!p || p.hp <= 0) return;
      wrapCharm(p);
      p.igHearts = 0; p.igHeartT = 0; p.ignisCharm = 3.2; p._igCharmDash = false; p._igCharmAge = 0;
      if (p.isLocal || p.isBot) { p.targetX = p.x; p.targetY = p.y; }
      this.say(LINES.charm, 1.6);
      if (audio.playBellTone) { audio.playBellTone(1046, 0.4, 0.14); audio.playBellTone(1568, 0.6, 0.12); }
      this.vfxAdd({ k: 'hearts', x: p.x, y: p.y, r: 70, life: 1.0, seed: Math.random() * 10 });
      if (!fromNetwork) send({ event: 'ignis_charm', pid: p.id, on: 1 });
    }
    uncharm(p, fromNetwork) {
      if (!p || !(p.ignisCharm > 0)) return;
      p.ignisCharm = 0; p.igHearts = 0; p.igHeartT = 0;
      if (p.isLocal || p.isBot) { p.targetX = p.x; p.targetY = p.y; }
      if (window.fx) window.fx.addShockwave(p.x, p.y, 70, '#f9a8d4', 3, 0.3);
      if (!fromNetwork) send({ event: 'ignis_charm', pid: p.id, on: 0 });
    }
    tickHearts(dt, L) {
      for (const p of party()) {
        if (!p) continue;
        if (p.igHeartT > 0) { p.igHeartT -= dt; if (p.igHeartT <= 0) { p.igHeartT = 0; p.igHearts = 0; } }
        if (!(p.ignisCharm > 0)) continue;
        if (p.hp <= 0) { p.ignisCharm = 0; continue; }
        // an ally's charm is ended by its owner's packet; this only keeps a lost packet from leaving it on forever
        if (!(p.isLocal || p.isBot)) { p._igCharmAge = (p._igCharmAge || 0) + dt; if (p._igCharmAge > 9) { p.ignisCharm = 0; p._igCharmAge = 0; } continue; }
        // the spell only runs while they are on their feet (a knockdown doesn't use it up)
        if (!/^hit_|wakeup/.test(p.state || '')) p.ignisCharm -= dt;
        // a dash shakes some of it off
        if (p.state === 'space_dash') { if (!p._igCharmDash) { p._igCharmDash = true; p.ignisCharm -= 0.9; } } else p._igCharmDash = false;
        if (p.ignisCharm <= 0) { this.uncharm(p, false); continue; }
        // drawn to her: a slow, dreamy walk (a near target keeps the player's own walk slow)
        const dx = this.x - p.x, dy = this.y - p.y, d = Math.hypot(dx, dy) || 1;
        p.targetX = p.x + dx / d * 7; p.targetY = p.y + dy / d * 7;
        if (flat(p, this.x, this.y) < 64 && !this.isUntargetable()) {
          this.hurt(p, 380, 'Swept Off Your Feet', 'heavy', this.x, this.y, 170);
          this.vfxAdd({ k: 'hearts', x: p.x, y: p.y, r: 90, life: 1.0, seed: Math.random() * 10 });
          this.uncharm(p, false);
        }
      }
      // walking into a Starstruck ally snaps them out of it (the local player, and the host's bots)
      const rescuers = party().filter(q => q && q.hp > 0 && (q.isLocal || q.isBot) && !(q.ignisCharm > 0));
      for (const p of party()) {
        if (!p || !(p.ignisCharm > 0)) continue;
        for (const q of rescuers) {
          if (q === p || flat(p, q.x, q.y) > 48 || performance.now() < (p._igRescueAt || 0)) continue;
          p._igRescueAt = performance.now() + 500;
          if (p.isLocal || p.isBot) this.uncharm(p, false); else send({ event: 'ignis_uncharm', pid: p.id });
          break;
        }
      }
    }

    // ---- READ THE SCRIPT: the two steps her line promised ----
    scriptWarn(kind, lead) {
      if (kind === 'far') this.tele({ k: 'circle', x: this.x, y: this.y, r: 260, follow: true }, lead);
      else if (kind === 'near') this.tele({ k: 'sector', x: this.x, y: this.y, r0: 150, r1: 640, a: 0, half: Math.PI }, lead);
      else {
        const S = this.script;
        if (S) {
          S.mark = { kind, until: this.patT + lead };
          // solo, a chorus is a mark on the floor near you (no one to stack with)
          S.spot = null;
          if (kind === 'stack' && party().filter(p => p && p.hp > 0).length <= 1) {
            const p = this.tgt(), a = this.patRng() * TAU;
            if (p) S.spot = this.inArena(p.x + Math.cos(a) * 170, p.y + Math.sin(a) * 170 * T(), 480);
          }
        }
      }
      audio.playParryClang(false);
    }
    scriptHit(kind, L) {
      const S = this.script;
      if (kind === 'far') {
        audio.playImpactBoom(1.5);
        this.vfxAdd({ k: 'boom', x: this.x, y: this.y, r: 260, col: '#f97316', life: 0.6 }); this.flair(this.x, this.y, 260, '#fb923c', 12);
        this.damagePlayersInRadius(L, this.x, this.y, 260, 300, 'Centre Stage', 'heavy', 160);
      } else if (kind === 'near') {
        audio.playImpactBoom(1.5);
        if (window.fx) { window.fx.triggerShake(12, 0.3); window.fx.addShockwave(this.x, this.y, 600, '#fb923c', 9, 0.6); }
        this.vfxAdd({ k: 'ring', x: this.x, y: this.y, r: 420, col: '#f97316', life: 0.7 });
        this.vfxAdd({ k: 'embers', x: this.x, y: this.y, r: 560, col: '#fb923c', life: 1.1, seed: 4 });
        this.damagePlayersInSector(L, this.x, this.y, 150, 900, 0, Math.PI, 300, 'The Wings', 'heavy', 80);
      } else if (kind === 'stack' && S && S.spot) {
        // alone, the chorus is a mark on the boards you have to hit
        const sp = S.spot, ok = L.some(p => flat(p, sp.x, sp.y) <= 80);
        audio.playImpactBoom(1.4);
        this.vfxAdd({ k: 'pillar', x: sp.x, y: sp.y, r: 80, life: 0.7 }); this.flair(sp.x, sp.y, 80, '#fde047', 9);
        if (!ok) for (const p of L) if (p.isLocal || p.isBot) this.hurt(p, 340, 'Missed Your Mark', 'heavy', sp.x, sp.y, 120);
      } else if (kind === 'stack') {
        const tp = L.find(p => p.id === (S && S.stackId)) || this.tgt();
        if (!tp) return;
        const inside = L.filter(p => flat(p, tp.x, tp.y) <= 95);
        const humans = party().filter(p => p && p.hp > 0 && !p.isBot).length;
        const solo = humans <= 1;
        const each = solo ? 260 : Math.round(640 / Math.max(1, inside.length)) * (inside.length < 2 ? 1.6 : 1);
        audio.playImpactBoom(1.4);
        this.vfxAdd({ k: 'pillar', x: tp.x, y: tp.y, r: 95, life: 0.7 }); this.flair(tp.x, tp.y, 95, '#fde047', 9);
        for (const p of inside) if (p.isLocal || p.isBot) this.hurt(p, each, inside.length > 1 ? 'Chorus' : 'Solo Chorus', 'heavy', tp.x, tp.y, 60);
      } else if (kind === 'spread') {
        audio.playImpactBoom(1.3);
        for (const p of L) {
          this.burst(p.x, p.y, 100, '#f472b6');
          if (!(p.isLocal || p.isBot)) continue;
          const crowd = L.filter(q => q !== p && flat(q, p.x, p.y) <= 100).length;
          if (crowd) this.hurt(p, 160 + 260 * crowd, 'Crowded Solo', 'heavy', p.x, p.y, 90);   // a solo is only safe alone
        }
      }
      if (S) S.mark = null;
    }

    // =========================================================================================================================
    // MECHANICS
    // =========================================================================================================================
    startMechanic(name, seed, netData) {
      this.cleanMechanic(true);
      this.endCue(true);
      this.script = null; this.gaze = null;
      this.pat = null; this.counterableWindow = false; this.jumpZ = 0;
      this.speed = 0; this.vx = this.vy = 0;
      this.state = name; this.stateDuration = 999; this.stateTimer = 999; this.patT = 0;
      const rnd = rngFrom(seed);
      const skip = this.skippingCutscenes && this.skippingCutscenes();
      const n = Math.max(1, living().filter(p => !p.isBot).length);
      if (name === 'curtain_mechanic') {
        this.mech = this.makeCurtain(rnd, skip);
        this.cueSay(LINES.masquerade, 3.2);
      } else if (name === 'pyre_mechanic') {
        this.mech = this.makePyre(rnd, skip, n);
        this.say(LINES.pyre, 3.2);
      } else if (name === 'finale_mechanic') {
        this.mech = this.makeFinale(rnd, skip, n);
        this.say(LINES.finale, 3.4);
      } else if (name === 'act2_mechanic') {
        this.mech = this.makeAct2(skip);
        this.cueSay(LINES.act2, 3.4);
      }
      this.mech.seed = seed;
      this.mech.fromX = this.x; this.mech.fromY = this.y;
      audio.playImpactBoom(1.4);
      if (window.fx) { window.fx.addShockwave(this.x, this.y, 220, '#fb923c', 6); window.fx.addPillar(this.x, this.y, 64, '#f97316', 0.8); }
    }

    // put an ended mechanic's leftovers away (decoys, braziers, sun) on every client
    cleanMechanic(keepState) {
      const m = this.mech;
      if (!m) return;
      this.mech = null;
      this.jumpZ = 0;
      for (const p of party()) if (p) p.ignisScorch = 0;
      if (!keepState && this.isMech()) { this.state = 'idle'; this.stateTimer = 0; }
    }

    updateMechanic(dt, L) {
      const m = this.mech;
      if (!m) { this.state = 'idle'; return; }
      m.t += dt;
      this.vx = this.vy = this.speed = 0;
      if (m.kind === 'curtain') this.tickCurtain(m, dt, L);
      else if (m.kind === 'pyre') this.tickPyre(m, dt, L);
      else if (m.kind === 'finale') this.tickFinale(m, dt, L);
      else if (m.kind === 'act2') this.tickAct2(m, dt, L);
    }

    // ---- 55% ACT II: INTERMISSION ----------------------------------------------------------------------------------------------
    // The house curtains sweep shut across the whole stage. Behind them she changes: when they part again the stage is burning,
    // the footlights are flame, and she is in her flame gown (faster, harder hitting, with two new numbers: Twin Fans and Grand
    // Jeté), to the second half of her score. Nothing can hurt anyone while the curtains are shut, and the floor is cleared.
    // Every client runs the same clock from the boss_pattern start, so the curtains and the costume swap line up everywhere.
    makeAct2(skip) {
      this.hazards = []; this.teles = []; this.proj = [];
      return { kind: 'act2', t: 0, phase: 'intro', introDur: skip ? 1.6 : 5.2, warded: true, changed: false };
    }
    // how far shut the curtains are (0 open .. 1 shut), read by the rig
    act2Curtain(m) {
      const D = m.introDur, close = Math.min(1.0, D * 0.22), open = Math.min(1.1, D * 0.24);
      if (m.t < close) { const k = m.t / close; return k * k * (3 - 2 * k); }
      if (m.t > D - open) { const k = c01((D - m.t) / open); return k * k * (3 - 2 * k); }
      return 1;
    }
    tickAct2(m, dt, L) {
      this.mechGlide(m, STAGE.x, STAGE.y + 10, c01(m.t / (m.introDur * 0.45)));
      // the costume changes while the curtains are fully shut
      if (!m.changed && m.t >= m.introDur * 0.5) {
        m.changed = true; this.act2 = true; this.burntOut = false;
        audio.playImpactBoom(1.8);
        if (window.fx) { window.fx.addPillar(this.x, this.y, 110, '#f97316', 1.1); window.fx.addShockwave(this.x, this.y, 300, '#fde047', 7, 0.6); }
      }
      // the curtains part on a ring of fire that sweeps out across the stage (just a flourish: it does no damage)
      if (m.t - dt < m.introDur - 0.5 && m.t >= m.introDur - 0.5) {
        audio.playImpactBoom(1.5);
        if (window.fx) { window.fx.triggerShake(16, 0.5); window.fx.addShockwave(this.x, this.y, 560, '#f97316', 9, 0.8); }
        this.vfxAdd({ k: 'ring', x: this.x, y: this.y, r: 520, col: '#f97316', life: 0.8 });
      }
      if (m.t >= m.introDur) this.endAct2();
    }
    endAct2() {
      const m = this.mech; if (!m || m.kind !== 'act2') return;
      this.act2 = true;
      this.cleanMechanic();
      this.aiCooldown = 0.9;
    }

    // glide to a spot over the intro (she sashays there in a ring of flame)
    mechGlide(m, tx, ty, k) {
      const e = k * k * (3 - 2 * k);
      this.x = lerp(m.fromX, tx, e); this.y = lerp(m.fromY, ty, e);
      this.targetX = this.x; this.targetY = this.y;
    }

    // a failed mechanic: Hard wipes the party, Normal hits hard (difficulty.js turns a 50000+ hit into 60% of max HP) and it comes back
    mechFailBlast(label, x, y) {
      audio.playImpactBoom(2.2);
      if (window.fx) {
        window.fx.triggerShake(30, 0.8); window.fx.triggerScreenFlash('#f97316', 0.35);
        window.fx.addShockwave(x, y, 620, '#f97316', 12, 0.9); window.fx.addPillar(x, y, 120, '#fde047', 1.2);
      }
      for (const p of living()) if (p.isLocal || p.isBot) p.takeDamage(99999, label, { power: 'cataclysm', sourceX: x, sourceY: y, pushDist: 200, forceLethal: hard() });
      this.ego = Math.min(100, this.ego + 30);
    }
    scheduleIgnisRetry(name, always) {
      if (hard()) return;
      if (!always && this.mechRetried[name]) return;
      this.mechRetried[name] = true;
      this.mechRetry = { name, t: always ? 6 : 20 };
    }

    // ---- 70% MASQUERADE (replaces the old Curtain Call deduction puzzle) --------------------------------------------------------
    // She vanishes into fire and comes back as five identical masked dancers circling the stage. While they dance, one at a time
    // whips a fan at the nearest player (dodge it). Then all five stop and wind up the same lunge together: only the REAL Ignis
    // flashes blue. Counter her and the masks shatter (big stagger). Miss and all five lunge across the stage:
    //   Normal: it hurts, and the dance starts again (faster), until someone counters her.   Hard: the stage burns (a wipe).
    // Everything is timed from the mechanic clock and the seed, so every client sees the same dancers and the same real one.
    makeCurtain(rnd, skip) {
      const N = 5, base = -Math.PI / 2 + (rnd() - 0.5) * 0.6;
      const figs = [];
      for (let i = 0; i < N; i++) figs.push({ i, a0: base + i * TAU / N, a: 0, x: 0, y: 0, popped: false, mask: 0, fan: 1, trim: 0, lunge: null });
      const m = {
        kind: 'curtain', t: 0, phase: 'intro', introDur: skip ? 0.9 : 2.4, figs, real: 0, round: 0, seed: (rnd() * 1e9) | 0,
        spinDir: rnd() < 0.5 ? 1 : -1, spin: 0, rnd, warded: false, found: false, check: 1, checkMax: 1, counterOpen: false
      };
      this.masqRound(m, 0);
      this.masqPlace(m);
      return m;
    }
    // per-round numbers (seeded by round, so a guest that resyncs mid-mechanic still agrees on who is real)
    masqRound(m, round) {
      m.round = round;
      const r = rngFrom((m.seed + round * 977) >>> 0);
      m.real = Math.floor(r() * m.figs.length);
      const faster = Math.min(3, round);
      m.danceDur = Math.max(2.2, 3.6 - faster * 0.45);
      m.spinRate = 0.55 + faster * 0.15;
      // the blue flash: when it opens in the wind-up and how long it stays (shorter on Hard)
      m.win0 = 0.35; m.win1 = 0.35 + (hard() ? 0.5 : 0.7);
      m.lungeDur = 1.9; m.strikeAt = 1.3;
      for (const f of m.figs) f.lunge = null;
    }
    masqPlace(m) {
      for (const f of m.figs) {
        f.a = f.a0 + m.spin;
        const hx = STAGE.x + Math.cos(f.a) * CURTAIN_R, hy = STAGE.y + Math.sin(f.a) * CURTAIN_R * T();
        let x = hx, y = hy;
        if (f.lunge) {
          // out along the lunge and back again
          const k = f.lunge.k;
          x = hx + (f.lunge.x - hx) * k; y = hy + (f.lunge.y - hy) * k;
        }
        f.x = x; f.y = y;
        f.face = f.lunge ? f.lunge.a : Math.atan2((STAGE.y - y) / T(), STAGE.x - x);
      }
    }
    tickCurtain(m, dt, L) {
      const host = isHost();
      if (m.phase === 'intro') {
        const k = c01(m.t / m.introDur);
        this.mechGlide(m, STAGE.x, STAGE.y + 10, Math.min(1, k * 1.6));
        this.facingAngle += dt * 9 * (1 - k);
        if (window.fx && Math.random() < 0.8) {
          const a = Math.random() * TAU; window.fx.addDragSparks(this.x + Math.cos(a) * 40, this.y + Math.sin(a) * 30, -Math.PI / 2, 1, false, '#fb923c');
        }
        if (m.t >= m.introDur) {
          m.phase = 'dance'; m.t = 0;
          this.masqPlace(m);
          audio.playImpactBoom(1.3);
          if (window.fx) for (const f of m.figs) { window.fx.addPillar(f.x, f.y, 46, '#fb923c', 0.7); window.fx.addShockwave(f.x, f.y, 90, '#fde047', 3); }
        }
        return;
      }
      if (m.phase === 'dance') {
        m.spin += dt * m.spinRate * m.spinDir;
        this.masqPlace(m);
        // a fan sweep from one dancer at a time (dancer order is fixed by round, so all clients agree)
        const every = hard() ? 0.9 : 1.15;
        const k0 = Math.floor((m.t - dt) / every), k1 = Math.floor(m.t / every);
        if (k1 > k0 && m.t < m.danceDur - 0.6) {
          const f = m.figs[(k1 * 2 + m.round) % m.figs.length];
          const tp = L.slice().sort((a, b) => flat(a, f.x, f.y) - flat(b, f.x, f.y))[0];
          if (tp) {
            const a = Math.atan2((tp.y - f.y) / T(), tp.x - f.x);
            f.sweep = { a, t: 0 };
            this.tele({ k: 'sector', x: f.x, y: f.y, r0: 0, r1: 210, a, half: 0.85 }, 0.6);
          }
        }
        for (const f of m.figs) {
          if (!f.sweep) continue;
          const before = f.sweep.t; f.sweep.t += dt;
          if (before < 0.6 && f.sweep.t >= 0.6) {
            audio.playSwordSlash(true, 1.15);
            this.vfxAdd({ k: 'arc', x: f.x, y: f.y, a0: f.sweep.a + 0.85, a1: f.sweep.a - 0.85, r: 205, col: '#fb923c', life: 0.28 });
            this.damagePlayersInSector(L, f.x, f.y, 0, 210, f.sweep.a, 0.85, 260, 'Masked Fan', 'medium', 110);
          }
          if (f.sweep.t > 0.9) f.sweep = null;
        }
        if (m.t >= m.danceDur) {
          m.phase = 'lunge'; m.t = 0;
          // every dancer picks the player nearest her and winds up toward them
          for (const f of m.figs) {
            const tp = L.slice().sort((a, b) => flat(a, f.x, f.y) - flat(b, f.x, f.y))[0];
            const a = tp ? Math.atan2((tp.y - f.y) / T(), tp.x - f.x) : Math.atan2((STAGE.y - f.y) / T(), STAGE.x - f.x);
            const end = this.inArena(f.x + Math.cos(a) * 300, f.y + Math.sin(a) * 300 * T(), 520);
            f.lunge = { a, x: end.x, y: end.y, k: 0, sx: f.x, sy: f.y };
            this.tele({ k: 'corridor', x: f.x, y: f.y, a, len: 300, w: 46 }, m.strikeAt);
          }
          audio.playParryClang(false);
        }
      } else if (m.phase === 'lunge') {
        const open = m.t >= m.win0 && m.t < m.win1;
        if (open && !m.counterOpen) { m.counterOpen = true; this.counterableWindow = true; audio.playCounterFlashCue(); }
        if (!open && m.counterOpen) { m.counterOpen = false; this.counterableWindow = false; }
        for (const f of m.figs) {
          if (!f.lunge) continue;
          const s = m.t < m.strikeAt ? -0.08 * Math.sin(c01(m.t / m.strikeAt) * Math.PI) : (m.t < m.strikeAt + 0.18 ? (m.t - m.strikeAt) / 0.18 : Math.max(0, 1 - (m.t - m.strikeAt - 0.18) / 0.4));
          f.lunge.k = s;
        }
        this.masqPlace(m);
        if (m.t - dt < m.strikeAt && m.t >= m.strikeAt) {
          audio.playImpactBoom(1.5); audio.playSwordSlash(true, 0.9);
          if (window.fx) window.fx.triggerShake(14, 0.35);
          const hit = new Set();
          for (const f of m.figs) {
            const Lg = f.lunge; if (!Lg) continue;
            this.vfxAdd({ k: 'trail', x: Lg.sx, y: Lg.sy, a: Lg.a, len: 300, life: 0.5 });
            const victims = L.filter(p => !hit.has(p.id) && this.inCorridor(p, Lg.sx, Lg.sy, Lg.a, 300, 46, 10));
            victims.forEach(p => hit.add(p.id));
            this.damagePlayersInCorridor(victims, Lg.sx, Lg.sy, Lg.a, 300, 46, 380, 'Masquerade Lunge', 'heavy', 160);
          }
        }
        if (host && m.t >= m.lungeDur) this.masqMissed(m, false);
      }
      // the boss herself is wherever the real dancer is (counters measure distance to her)
      const me = m.figs[m.real];
      if (m.phase !== 'intro' && me) { this.x = me.x; this.y = me.y; this.facingAngle = me.face; this.targetX = this.x; this.targetY = this.y; }
    }
    // nobody countered her: Normal goes round again (faster), Hard burns the stage
    masqMissed(m, fromNet) {
      if (!m || m.kind !== 'curtain') return;
      if (hard()) { this.endCurtain(false, fromNet); return; }
      if (!fromNet && isHost()) send({ event: 'ignis_masq_round', r: m.round + 1 });
      m.counterOpen = false; this.counterableWindow = false;
      this.masqRound(m, m.round + 1);
      m.phase = 'dance'; m.t = 0;
      this.say(LINES.retry, 2.6);
      audio.playImpactBoom(1.1);
      if (window.fx) for (const f of m.figs) window.fx.addShockwave(f.x, f.y, 80, '#fb923c', 3);
    }
    curtainFound() {}
    popDecoy() {}
    endCurtain(ok, fromNet) {
      const m = this.mech; if (!m || m.kind !== 'curtain') return;
      if (!fromNet && isHost()) send({ event: 'ignis_curtain_end', ok: !!ok });
      this.counterableWindow = false;
      if (ok) {
        // the masks shatter
        for (const f of m.figs) { this.vfxAdd({ k: 'puff', x: f.x, y: f.y, life: 0.8 }); if (window.fx) window.fx.addShockwave(f.x, f.y, 110, '#38bdf8', 5, 0.4); }
        if (this.grantMechanicShield) this.grantMechanicShield();
        this.say(LINES.curtainWin, 2.8, true);
        if (isHost()) this.ignisStagger('🎭 BRAVO!', 6); else this.cleanMechanic();
      } else {
        this.say(LINES.curtainFail, 2.8, true);
        for (const f of m.figs) this.burst(f.x, f.y, 150, '#f97316');
        this.mechFailBlast('Masquerade', STAGE.x, STAGE.y);
        this.cleanMechanic();
        if (isHost()) { this.scheduleIgnisRetry('curtain_mechanic'); this.aiCooldown = 2.5; }
      }
    }

    // ---- 40% LIGHTS, PLEASE --------------------------------------------------------------------------------------------------
    // Five braziers in a ring. Stepping into one flips it and its two neighbours (on a ring of five every pattern can be reached in
    // exactly one way). The pattern she wants is shown on her fan and in the little star of lamps at her feet.
    makePyre(rnd, skip, n) {
      const start = 0b11111;
      let sol = 0;
      while (true) { sol = Math.floor(rnd() * 32); const c = popc(sol); if (c >= 2 && c <= 3) break; }
      let target = start;
      for (let i = 0; i < 5; i++) if (sol & (1 << i)) target ^= flipMask(i);
      const base = -Math.PI / 2;
      const brz = [];
      for (let i = 0; i < 5; i++) { const a = base + i * TAU / 5; brz.push({ i, a, x: STAGE.x + Math.cos(a) * PYRE_R, y: STAGE.y + Math.sin(a) * PYRE_R * T(), flash: 0 }); }
      const arenaR = (window.game && window.game.arenaRadius) || 590;
      if (this.wallR == null) this.wallR = arenaR - 12;
      this.wallCreep = 9;
      return {
        kind: 'pyre', t: 0, phase: 'intro', introDur: skip ? 0.9 : 2.2, bits: start, target, sol, brz,
        solveDur: hard() ? 30 : 38, warded: true, rnd, throwT: 2.4, latch: {}
      };
    }
    tickPyre(m, dt, L) {
      const host = isHost();
      for (const b of m.brz) b.flash = Math.max(0, b.flash - dt);
      if (m.phase === 'intro') {
        const k = c01(m.t / m.introDur);
        this.mechGlide(m, STAGE.x, STAGE.y, Math.min(1, k * 1.5));
        this.facingAngle = Math.PI / 2;
        if (m.t >= m.introDur) { m.phase = 'solve'; m.t = 0; this.snapFeetToBody(); audio.playImpactBoom(1.2); }
        return;
      }
      this.x = STAGE.x; this.y = STAGE.y; this.facingAngle += dt * 0.6;
      m.left = Math.max(0, m.solveDur - m.t);
      // her pressure while you work: fireballs at whoever is busiest
      m.throwT -= dt;
      if (m.throwT <= 0 && L.length) {
        m.throwT = hard() ? 2.0 : 2.6;
        const tp = L[Math.floor(m.rnd() * L.length)];
        if (tp) { this.lob(tp.x, tp.y, 1.0, 70, 170, 'Mood Lighting'); this.tele({ k: 'circle', x: tp.x, y: tp.y, r: 70 }, 1.0); }
      }
      // the local player steps into a brazier: ask the host to flip it (once per visit)
      const me = window.game && window.game.localPlayer;
      for (const b of m.brz) {
        for (const p of L) {
          if (!p.isLocal) continue;          // each client watches its own player; the host flips, guests ask the host
          const inside = flat(p, b.x, b.y) <= 54;
          const key = p.id + ':' + b.i;
          if (!inside) { m.latch[key] = 0; continue; }
          m.latch[key] = (m.latch[key] || 0) + (m.latch[key] < 0 ? 0 : dt);
          if (m.latch[key] >= 0.45) {
            m.latch[key] = -1;           // spent until they step out
            if (host) this.flipBrazier(b.i, p.id, false);
            else if (p === me) send({ event: 'ignis_brazier_req', i: b.i, playerId: p.id });
          }
        }
      }
      if (host && m.left <= 0) this.endPyre(false);
    }
    flipBrazier(i, pid, fromNet, bits) {
      const m = this.mech; if (!m || m.kind !== 'pyre' || m.phase !== 'solve') return;
      if (typeof bits === 'number') m.bits = bits; else m.bits ^= flipMask(i);
      for (const k of [i, (i + 1) % 5, (i + 4) % 5]) m.brz[k].flash = 0.5;
      audio.playParryClang(false);
      if (window.fx) { const b = m.brz[i]; window.fx.addShockwave(b.x, b.y, 80, '#fde047', 3, 0.35); }
      if (!fromNet && isHost()) send({ event: 'ignis_brazier', i, bits: m.bits });
      if (isHost() && m.bits === m.target) this.endPyre(true);
    }
    endPyre(ok, fromNet) {
      const m = this.mech; if (!m || m.kind !== 'pyre') return;
      if (!fromNet && isHost()) send({ event: 'ignis_pyre_end', ok: !!ok });
      this.wallCreep = this.crownGone ? 1.2 : 3;
      if (ok) {
        this.wallR = Math.min(((window.game && window.game.arenaRadius) || 590) - 12, (this.wallR || 400) + 150);
        if (this.grantMechanicShield) this.grantMechanicShield();
        this.say(LINES.pyreWin, 2.8);
        for (const b of m.brz) this.vfxAdd({ k: 'boom', x: b.x, y: b.y, r: 70, col: '#fde047', life: 0.6 });
        if (isHost()) this.ignisStagger('🕯️ LIGHTS OUT!', 6); else this.cleanMechanic();
      } else {
        this.say(LINES.pyreFail, 2.8);
        for (const b of m.brz) this.burst(b.x, b.y, 140, '#f97316');
        this.mechFailBlast('Lights, Please', STAGE.x, STAGE.y);   // Hard: a wipe
        // Normal: the burning wall falls back to the rim and stops creeping until the lights come round again
        if (!hard()) { this.wallR = ((window.game && window.game.arenaRadius) || 590) - 12; this.wallCreep = 0; }
        else this.wallR = Math.max(this.wallR || 400, 380);
        this.cleanMechanic();
        if (isHost()) { this.scheduleIgnisRetry('pyre_mechanic'); this.aiCooldown = 2.5; }
      }
    }

    // ---- 10% FINALE ----------------------------------------------------------------------------------------------------------
    makeFinale(rnd, skip, n) {
      // Scorched is sized against the throw gap: solo it fades before the next ball; in a party it outlasts one gap but not a
      // full rotation, so the same player can't take two in a row, but taking turns always works.
      const gap = hard() ? 1.45 : 1.75;
      return {
        kind: 'finale', t: 0, phase: 'intro', introDur: skip ? 1.0 : 2.6, rnd,
        sun: 0.15, cracks: 0, need: n <= 1 ? 5 : (n === 2 ? 6 : 7), scorch: gap * (n <= 1 ? 0.8 : (n === 2 ? 1.5 : 2.4)),
        dur: hard() ? 24 : 28, nextT: 0.6, gap, balls: [], ballId: 0, lastViolet: true, thrown: 0, warded: true
      };
    }
    tickFinale(m, dt, L) {
      const host = isHost();
      const hover = 72;
      if (m.phase === 'intro') {
        const k = c01(m.t / m.introDur);
        this.mechGlide(m, STAGE.x, STAGE.y - 20, Math.min(1, k * 1.4));
        this.jumpZ = hover * k * k;
        this.facingAngle = Math.PI / 2;
        if (m.t >= m.introDur) { m.phase = 'barrage'; m.t = 0; }
        return;
      }
      if (m.phase === 'down') return;
      this.jumpZ = hover + Math.sin(m.t * 2) * 4;
      this.facingAngle = Math.PI / 2;
      // the sun swells on its own; the timer is the sun
      m.sun = Math.min(1, m.sun + dt / m.dur);
      // fireballs (host rolls them; guests get each one in a packet)
      if (host) {
        m.nextT -= dt;
        if (m.nextT <= 0 && L.length) {
          m.nextT = m.gap;
          const violet = m.thrown >= 2 && !m.lastViolet && m.rnd() < 0.32;
          m.lastViolet = violet;
          const tp = L[Math.floor(m.rnd() * L.length)];
          const off = 30 + m.rnd() * 60, oa = m.rnd() * TAU;
          const spot = this.inArena(tp.x + Math.cos(oa) * off, tp.y + Math.sin(oa) * off * T(), Math.min(520, (this.wallR || 600) - 40));
          const id = ++m.ballId;
          this.finaleThrow(id, spot.x, spot.y, violet);
          send({ event: 'ignis_fb', id, x: Math.round(spot.x), y: Math.round(spot.y), v: violet ? 1 : 0 });
        }
      }
      for (const p of party()) if (p && p.ignisScorch > 0) p.ignisScorch = Math.max(0, p.ignisScorch - dt);
      // landings: each client hurts its own player; the host decides whether the sun was fed or cracked
      for (const b of m.balls) {
        if (b.done) continue;
        b.t += dt;
        if (b.t < b.dur) continue;
        b.done = true;
        const inside = L.filter(p => flat(p, b.x, b.y) <= 70);
        if (!b.violet) {
          if (inside.length) {
            for (const p of inside) {
              if (!(p.isLocal || p.isBot)) continue;
              const scorched = (p.ignisScorch || 0) > 0;
              this.hurt(p, scorched ? 330 : 120, scorched ? 'Scorched Catch' : 'Caught Fireball', scorched ? 'heavy' : 'light', b.x, b.y, 40);
              p.ignisScorch = m.scorch;
            }
            this.vfxAdd({ k: 'return', x: b.x, y: b.y, life: 0.7 });
            if (host) { m.cracks++; m.sun = Math.max(0, m.sun - 0.07); send({ event: 'ignis_fbr', id: b.id, ok: 1, c: m.cracks, s: Number(m.sun.toFixed(3)) }); }
          } else {
            for (const p of L) if (flat(p, b.x, b.y) <= 200) this.hurt(p, 300, 'Dropped Fireball', 'heavy', b.x, b.y, 150);
            this.burst(b.x, b.y, 200, '#f97316');
            if (host) { m.sun = Math.min(1, m.sun + 0.07); send({ event: 'ignis_fbr', id: b.id, ok: 0, c: m.cracks, s: Number(m.sun.toFixed(3)) }); }
          }
        } else {
          if (inside.length) {
            for (const p of inside) if (p.isLocal || p.isBot) this.hurt(p, 420, 'Violet Flame', 'heavy', b.x, b.y, 160);
            this.burst(b.x, b.y, 90, '#a855f7');
            if (host) { m.sun = Math.min(1, m.sun + 0.1); send({ event: 'ignis_fbr', id: b.id, ok: 0, c: m.cracks, s: Number(m.sun.toFixed(3)) }); }
          } else this.vfxAdd({ k: 'fizzle', x: b.x, y: b.y, life: 0.6 });
        }
      }
      m.balls = m.balls.filter(b => !b.done || b.t < b.dur + 0.1);
      if (host) {
        if (m.cracks >= m.need) this.endFinale(true);
        else if (m.sun >= 1) this.endFinale(false);
      }
    }
    finaleThrow(id, x, y, violet) {
      const m = this.mech; if (!m || m.kind !== 'finale') return;
      m.thrown++;
      m.balls.push({ id, x, y, violet: !!violet, t: 0, dur: 1.55 });
      audio.playSwordSlash && audio.playSwordSlash(false, 0.7);
    }
    endFinale(ok, fromNet) {
      const m = this.mech; if (!m || m.kind !== 'finale') return;
      if (!fromNet && isHost()) send({ event: 'ignis_finale_end', ok: !!ok });
      if (ok) {
        this.mech10 = true; this.burntOut = true; this.tantrumT = 0;
        if (this.grantMechanicShield) this.grantMechanicShield();
        this.say(LINES.finaleWin, 3);
        audio.playImpactBoom(2.4);
        if (window.fx) {
          window.fx.triggerShake(30, 0.9); window.fx.triggerScreenFlash('#fde047', 0.35);
          window.fx.addShockwave(this.x, this.y - 230, 420, '#fde047', 10, 0.9); window.fx.addShockwave(this.x, this.y, 300, '#fb923c', 8);
        }
        this.vfxAdd({ k: 'sunpop', x: this.x, y: this.y, life: 1.2 });
        this.jumpZ = 0;
        if (isHost()) this.ignisStagger('☀️ ENCORE DENIED!', 8); else this.cleanMechanic();
      } else {
        this.say(LINES.finaleFail, 2.8);
        this.mechFailBlast('The Sun Falls', this.x, this.y);
        if (hard()) { this.cleanMechanic(); return; }
        // Normal: she simply charges a new one, from the top
        m.phase = 'intro'; m.t = 0; m.sun = 0.15; m.cracks = 0; m.balls = []; m.fromX = this.x; m.fromY = this.y; m.introDur = 1.4;
      }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // co-op
    // ---------------------------------------------------------------------------------------------------------------------------
    // boss_event 'ignis_*' (network_coop.js). Return false to stop the host relaying a guest's private request.
    handleIgnisNet(d) {
      const m = this.mech;
      switch (d.event) {
        case 'ignis_tantrum': this.startTantrum(true); return true;
        case 'ignis_found': this.curtainFound(); return true;
        case 'ignis_pop': this.popDecoy(d.i | 0); return true;
        case 'ignis_curtain_end': this.endCurtain(!!d.ok, true); return true;
        case 'ignis_brazier_req': {
          if (!isHost()) return false;
          const pl = party().find(p => p.id === d.playerId);
          if (pl && m && m.kind === 'pyre') {
            const b = m.brz[d.i | 0];
            if (b && flat(pl, b.x, b.y) <= 90) this.flipBrazier(d.i | 0, pl.id, false);   // a little latency slack
          }
          return false;
        }
        case 'ignis_brazier': this.flipBrazier(d.i | 0, null, true, d.bits | 0); return true;
        case 'ignis_pyre_end': this.endPyre(!!d.ok, true); return true;
        case 'ignis_fb': this.finaleThrow(d.id, d.x, d.y, !!d.v); return true;
        case 'ignis_fbr': if (m && m.kind === 'finale') { m.cracks = d.c | 0; if (typeof d.s === 'number') m.sun = d.s; } return true;
        case 'ignis_finale_end': this.endFinale(!!d.ok, true); return true;
        case 'ignis_masq_round': if (m && m.kind === 'curtain' && (d.r | 0) > m.round) { m.round = (d.r | 0) - 1; this.masqMissed(m, true); } return true;
        case 'ignis_cue': this.startCue(d.kind === 'hold' ? 'hold' : 'dance', true); return true;
        case 'ignis_charm': {
          const p = party().find(q => q && q.id === d.pid);
          if (p && !p.isLocal) { if (d.on) this.charmPlayer(p, true); else this.uncharm(p, true); }
          return true;
        }
        case 'ignis_hearts': {
          const p = party().find(q => q && q.id === d.pid);
          if (p && !p.isLocal) { p.igHearts = d.n | 0; p.igHeartT = 10; }
          return true;
        }
        case 'ignis_uncharm': {
          // someone walked into a Starstruck player: only that player's owner (or the host, for a bot) acts on it
          const p = party().find(q => q && q.id === d.pid);
          if (p && (p.isLocal || p.isBot)) this.uncharm(p, false);
          return true;
        }
      }
      return true;
    }
    // extra state that rides boss_sync
    netExtra() {
      const m = this.mech;
      return {
        e: Math.round(this.ego), tt: Number(this.tantrumT.toFixed(1)), w: this.wallR == null ? -1 : Math.round(this.wallR), wc: this.wallCreep,
        bo: this.burntOut ? 1 : 0, a2: this.act2 ? 1 : 0, m7: this.mech70 ? 1 : 0, m4: this.mech40 ? 1 : 0, m1: this.mech10 ? 1 : 0,
        mk: m ? m.kind : '', mp: m ? m.phase : '', mt: m ? Number(m.t.toFixed(2)) : 0,
        ck: m && m.kind === 'curtain' ? Math.round(m.check) : undefined, bb: m && m.kind === 'pyre' ? m.bits : undefined,
        su: m && m.kind === 'finale' ? Number(m.sun.toFixed(3)) : undefined, cr: m && m.kind === 'finale' ? m.cracks : undefined,
        mr: m && m.kind === 'curtain' ? m.round : undefined,
        cu: this.cue ? this.cue.kind : '', ct: this.cue ? Number(this.cue.t.toFixed(1)) : 0
      };
    }
    applyNetExtra(x) {
      if (!x) return;
      this.ego = x.e; this.tantrumT = x.tt; this.wallR = x.w < 0 ? null : x.w; this.wallCreep = x.wc || 0; this.burntOut = !!x.bo;
      this.mech70 = !!x.m7; this.mech40 = !!x.m4; this.mech10 = !!x.m1;
      if (x.a2) { this.act2 = true; this.act2Done = true; }   // a late joiner (or a guest that missed the start) still sees the gown
      // stage cue: catch up a guest who missed the start (or joined mid-cue); the guest ends its own copy on its clock
      if (x.cu && !this.cue && x.ct < 4.5) this.startCue(x.cu, true, x.ct);
      else if (this.cue && x.cu === this.cue.kind && Math.abs(this.cue.t - x.ct) > 0.6) this.cue.t = x.ct;
      const m = this.mech;
      if (m && m.kind === x.mk) {
        // only ever move a guest's mechanic FORWARD to the host's phase (its own transitions may simply be a frame ahead)
        // Masquerade rounds: a guest a whole round behind jumps to the host's round (the dancers are seeded by round)
        if (m.kind === 'curtain' && typeof x.mr === 'number' && x.mr > m.round) { this.masqRound(m, x.mr); m.phase = 'dance'; m.t = 0; }
        const order = { curtain: ['intro', 'dance', 'lunge'], pyre: ['intro', 'solve'], finale: ['intro', 'barrage', 'down'], act2: ['intro'] }[m.kind] || [];
        const gi = order.indexOf(m.phase), hi = order.indexOf(x.mp);
        if (hi > gi) {
          if (m.kind === 'curtain' && m.phase === 'intro') { const me = m.figs[m.real]; this.x = me.x; this.y = me.y; this.snapFeetToBody(); }
          m.phase = x.mp; m.t = x.mt;
        } else if (hi === gi && Math.abs(m.t - x.mt) > 0.6) m.t = x.mt;
        if (typeof x.ck === 'number') m.check = x.ck;
        if (typeof x.bb === 'number') m.bits = x.bb;
        if (typeof x.su === 'number') m.sun = x.su;
        if (typeof x.cr === 'number') m.cracks = x.cr;
      }
    }

    // ---------------------------------------------------------------------------------------------------------------------------
    // Karok Clash: FOOTLIGHT FLASH. She throws her arms wide, swings her palms together and fires a massive beam of flame down
    // the lane. A Gravebreaker who clashes braces the hammer against the beam and drives up it (the meter is how far they've
    // got). Win: GRAVE ANCHOR — the beam breaks, the hammer is hurled down the lane, hooks her, and the chain hauls her off her
    // feet face-first onto the stage. The shared controller (karok_clash.js) runs the start / meter / result packets; every
    // client plays this cinematic from the same clock, so nothing extra needs syncing.
    // ---------------------------------------------------------------------------------------------------------------------------
    // the beam's lane: shared by the telegraph, the free shot and the loss
    static get FLASH_LEN() { return 560; }
    static get FLASH_HALF() { return 72; }
    // "Footlight... FLASH!" starts early in the charge so the shout lands as the beam goes off
    updateGetsugaCharge(dt, partyArr) {
      if (!this._flashShout && this.getsugaProgress() >= 0.08) { this._flashShout = true; audio.playBossVoiceClip && audio.playBossVoiceClip('ig_flash_charge', null, true); }
      return super.updateGetsugaCharge(dt, partyArr);
    }
    // a Gravebreaker stepped into her beam (every client runs this)
    startKarokClash(player, opts) {
      const ok = super.startKarokClash(player, opts);
      if (ok) this.say(LINES.duet, 2.4, true);
      return ok;
    }
    fireGetsuga(partyArr) {
      const L = (partyArr || []).filter(q => q.hp > 0);
      audio.playImpactBoom(2.0);
      audio.playSwordSlash && audio.playSwordSlash(true, 1.4);
      if (window.fx) {
        window.fx.triggerShake(18, 0.45);
        window.fx.addShockwave(this.x, this.y, 190, '#f97316', 7, 0.5);
        const m = this.fwd(40); window.fx.addImpactStarburst(m.x, m.y - 64, '#fde047', 1.8, 0.35, 44);
        window.fx.triggerImpactFrame && window.fx.triggerImpactFrame('#fdba74', 0.06);
      }
      this.flashBeam = { t: 0, dur: 0.95, a: this.facingAngle, len: IgnisVaneBoss.FLASH_LEN };
      this.damagePlayersInCorridor(L, this.x, this.y, this.facingAngle, IgnisVaneBoss.FLASH_LEN, IgnisVaneBoss.FLASH_HALF, 300 * this.fanMult(), 'Footlight Flash', 'heavy', 170);
    }
    // keeps her hair, coat and embers alive while the shared clash controller has the wheel
    updateClothChains(dt) { if (this.updateRig) this.updateRig(dt); }
    // beam spacing: she stands her ground and the clasher is pushed back down the lane or wins it back, step by step
    karokPositions(c) {
      if (c.style !== 'beam') return super.karokPositions(c);
      const dx = Math.cos(c.dirAng), dy = Math.sin(c.dirAng) * T();
      const gap = 330 + (66 - 330) * Math.max(0, Math.min(1, c.meter));
      return { bx: c.bx0, by: c.by0, px: c.bx0 + dx * gap, py: c.by0 + dy * gap };
    }
    beginKarokFinish(c, player) {
      c.finishT = 0;
      if (c.win) {
        // the beam breaks against the hammer: a white flash down the lane and she is blown back off her mark
        audio.playParryClang(true); audio.playImpactBoom(2.0);
        c.anchorFrom = { bx: this.x, by: this.y };
        if (window.fx) {
          const fx = window.fx;
          fx.triggerHitstop(110); fx.triggerShake(24, 0.45);
          const mx = (this.x + player.x) / 2, my = (this.y + player.y) / 2;
          fx.addShockwave(mx, my, 220, '#fde68a', 8, 0.5); fx.addShockwave(player.x, player.y, 160, '#5cc13f', 6, 0.4);
          fx.addImpactStarburst && fx.addImpactStarburst(mx, my - 60, 130, '#fde047', 8, 0.4, 0.3);
          if (player.isLocal) fx.triggerImpactFrame && fx.triggerImpactFrame('#fde68a', 0.12);
        }
      } else {
        audio.playImpactBoom(1.0);
        if (window.fx) window.fx.triggerShake(12, 0.3);
      }
    }
    updateKarokFinish(dt, c, player) {
      if (c.style !== 'beam') return super.updateKarokFinish(dt, c, player);
      c.finishT += dt;
      const t = c.finishT;
      if (!c.win) {
        if (!c.resolved && t >= 0.3) { c.resolved = true; this.resolveKarokLoss(c, player); }
        if (t >= 1.0) this.endKarokClash(player, false);
        return;
      }
      const A = window.KAROK_ANCHOR;
      const fx = window.fx, h = player.hammer;
      const ease = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
      if (!c.anc) {
        // fix every point of the cinematic once: where the player stands, where she gets blown to, where she lands
        const dx = this.x - player.x, dy = (this.y - player.y) / T(), d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        // she is ~125 units tall and falls forward about her feet, so her feet land a body-length out: head at the player's boots
        const B1 = this.inArena(player.x + ux * 310, player.y + uy * 310 * T(), 560);
        const Lnd = this.inArena(player.x + ux * 196, player.y + uy * 196 * T(), 560);
        c.anc = { P: { x: player.x, y: player.y }, u: { x: ux, y: uy }, B0: { x: this.x, y: this.y }, B1, Lnd };
      }
      const N = c.anc;
      player.x = N.P.x; player.y = N.P.y; player.targetX = player.x; player.targetY = player.y;
      player.facingAngle = Math.atan2((this.y - player.y) / T(), this.x - player.x);
      const hand = player.localToWorld ? player.localToWorld(24, 4, 54) : { sx: player.x, sy: player.y - 54 };
      // where the hook sits on her: her chest, which swings down and out towards the player as she is tipped over
      const chest = () => {
        const k = t < A.YANK ? 0 : Math.min(1, (t - A.YANK) / (A.SLAM - A.YANK));
        const out = 10 + 82 * k;
        return { x: this.x - N.u.x * out, y: this.y - N.u.y * out * T(), z: 62 - 50 * k + (this.ancLift || 0) };
      };
      this.ancLift = 0;
      // ---- her body
      if (t < A.HIT) {
        const s = ease(t / A.BREAK);
        this.x = N.B0.x + (N.B1.x - N.B0.x) * s; this.y = N.B0.y + (N.B1.y - N.B0.y) * s;
      } else if (t < A.YANK) {
        // hooked: she totters a step back against the chain
        const s = Math.sin(Math.min(1, (t - A.HIT) / (A.YANK - A.HIT)) * Math.PI);
        this.x = N.B1.x + N.u.x * 14 * s; this.y = N.B1.y + N.u.y * 14 * s * T();
      } else if (t < A.SLAM) {
        const s = Math.min(1, (t - A.YANK) / (A.SLAM - A.YANK)), e = s * s * (3 - 2 * s);
        this.x = N.B1.x + (N.Lnd.x - N.B1.x) * e; this.y = N.B1.y + (N.Lnd.y - N.B1.y) * e;
        this.ancLift = Math.sin(s * Math.PI) * 54;
      } else { this.x = N.Lnd.x; this.y = N.Lnd.y; }
      this.facingAngle = Math.atan2((player.y - this.y) / T(), player.x - this.x);
      // ---- the hammer
      if (t >= A.THROW && t < A.CATCH) {
        if (h.mode !== 'anchor') {
          h.mode = 'anchor'; h.glow = 2;
          audio.playSwordSlash(true, 1.3);
          if (fx) { fx.addShockwave(player.x, player.y, 110, '#5cc13f', 4, 0.3); fx.addStepDust(player.x, player.y, 8); }
        }
        let p;
        if (t < A.HIT) {
          const s = ease((t - A.THROW) / (A.HIT - A.THROW)), tg = chest();
          const p0 = { x: player.x + N.u.x * 26, y: player.y + N.u.y * 26 * T(), z: 72 };
          p = { x: p0.x + (tg.x - p0.x) * s, y: p0.y + (tg.y - p0.y) * s, z: p0.z + (tg.z - p0.z) * s + Math.sin(s * Math.PI) * 20 };
        } else if (t < A.SLAM) p = chest();
        else {
          // reeled back in along the chain, skipping off the stage once
          const s = Math.min(1, (t - A.SLAM) / (A.CATCH - A.SLAM)), e = s * s;
          const p0 = { x: N.Lnd.x - N.u.x * 92, y: N.Lnd.y - N.u.y * 92 * T(), z: 12 }, p1 = { x: player.x + N.u.x * 22, y: player.y + N.u.y * 22 * T(), z: 58 };
          p = { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e, z: p0.z + (p1.z - p0.z) * e + Math.abs(Math.sin(s * Math.PI * 2)) * 14 };
        }
        h.x = p.x; h.y = p.y; h.z = p.z;
        // head leads towards her while flying out and hooked; trails behind on the way back
        const toHer = { x: this.x - player.x, y: this.y - player.y }, l = Math.hypot(toHer.x, toHer.y) || 1;
        h.dx = (t < A.SLAM ? 1 : -1) * toHer.x / l; h.dy = (t < A.SLAM ? 1 : -1) * toHer.y / l + (t < A.SLAM ? 0.15 : 0);
        c.chain = { ax: hand.sx, ay: hand.sy, bx: h.x - h.dx * 30, by: h.y - h.z - h.dy * 30, slack: t < A.HIT ? 0.05 : (t < A.YANK ? 0.02 : (t < A.SLAM ? 0 : 0.25)) };
      } else c.chain = null;
      // ---- beats
      if (!c.bHit && t >= A.HIT) {
        c.bHit = true;
        audio.playImpactBoom(2.0); audio.playParryClang(true);
        if (fx) {
          const q = chest();
          fx.triggerHitstop(160); fx.triggerShake(26, 0.45); fx.triggerZoomPunch(0.12);
          fx.addShockwave(q.x, q.y, 170, '#ffffff', 6, 0.4); fx.addShockwave(q.x, q.y, 120, '#5cc13f', 5, 0.35);
          fx.addImpactStarburst && fx.addImpactStarburst(q.x, q.y - q.z, 120, '#fde047', 8, 0.4, 0.3);
          if (player.isLocal) fx.triggerImpactFrame && fx.triggerImpactFrame('#ffffff', 0.12);
        }
        if (player.pushPop) player.pushPop({ kind: 'tier', x: this.x, y: this.y - 150, life: 0.8, color: '#a6e87e', text: 'HOOKED!' });
      }
      if (!c.bYank && t >= A.YANK) {
        c.bYank = true;
        audio.playSwordSlash(true, 1.0); audio.playScrapeSpark && audio.playScrapeSpark();
        if (fx) { fx.triggerShake(14, 0.3); fx.addStepDust(player.x, player.y, 12); fx.addShockwave(player.x, player.y, 120, '#fb923c', 4, 0.3); }
        if (player.pushPop) player.pushPop({ kind: 'tier', x: player.x, y: player.y - 150, life: 0.9, color: '#fde047', text: 'GET OVER HERE!' });
      }
      if (!c.resolved && t >= A.SLAM) {
        c.resolved = true;
        this.ancLift = 0;
        this.resolveKarokWin(c, player);       // the shared massive hit, Broken stacks and Momentum, landed as she hits the boards
        if (fx) { fx.addStepDust(this.x, this.y, 18); fx.spawnMassiveEarthChunks && fx.spawnMassiveEarthChunks(this.x, this.y, 8, '#7c2d12'); }
      }
      if (!c.bCatch && t >= A.CATCH) {
        c.bCatch = true;
        h.mode = 'held'; h.phase = 'out'; h.glow = 0;
        audio.playParryClang(false);
        if (fx) { fx.triggerShake(6, 0.15); fx.addShockwave(player.x, player.y, 90, '#fb923c', 3, 0.25); }
      }
      if (t >= A.END) this.endKarokClash(player, true);
    }
    endKarokClash(player, win) {
      const c = this.karokClash;
      this.karokDrop = null;
      this.karokClash = null;
      this.ancLift = 0;
      if (player) {
        player.karok = null;
        if (player.hammer && player.hammer.mode === 'anchor') player.hammer.mode = 'held';
        if (player.state === 'h_clash') { player.state = 'idle'; player.stateTimer = 0; }
        player.hIframes = win ? 0.8 : 0; player.targetX = player.x; player.targetY = player.y;
        player.snapFeetToBody && player.snapFeetToBody();
      }
      if (win) {
        this.stagger = 0; this.enterStaggerState('@none');
        this._proneAt = performance.now() / 1000;     // she starts her stagger face-down on the stage
        this.say(LINES.clashWin, 2.6);
        if (isHost()) this.egoAdd(-30);
      } else {
        // the beam goes on, point-blank, down the whole lane
        this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 0.9; this.karokSwordHidden = false;
        this.say(LINES.clashLoss, 2.4);
        this.flashBeam = { t: 0, dur: 0.95, a: this.facingAngle, len: IgnisVaneBoss.FLASH_LEN };
        audio.playImpactBoom(2.0);
        if (player && player.hp > 0) player.takeDamage(1250, 'Footlight Flash (Clash Lost)', { power: 'heavy', sourceX: this.x, sourceY: this.y, pushDist: 210 });
        const others = living().filter(q => !player || q.id !== player.id);
        this.damagePlayersInCorridor(others, this.x, this.y, this.facingAngle, IgnisVaneBoss.FLASH_LEN, IgnisVaneBoss.FLASH_HALF, 300, 'Footlight Flash', 'heavy', 170);
      }
      if (c) c.anc = null;
    }
    abortKarokClash(player) {
      if (player && player.hammer && player.hammer.mode === 'anchor') player.hammer.mode = 'held';
      this.ancLift = 0;
      return super.abortKarokClash(player);
    }
  }

  // Starstruck players can't attack or take move orders (dashing still works). Every class shares canAct / setMoveTarget, so the
  // first charm of a class wraps its own prototype once.
  function wrapCharm(p) {
    const proto = p && Object.getPrototypeOf(p);
    if (!proto || Object.prototype.hasOwnProperty.call(proto, '_igCharmWrap')) return;
    proto._igCharmWrap = true;
    const oCan = proto.canAct, oMove = proto.setMoveTarget;
    if (typeof oCan === 'function') proto.canAct = function () { return this.ignisCharm > 0 ? false : oCan.apply(this, arguments); };
    if (typeof oMove === 'function') proto.setMoveTarget = function () { if (this.ignisCharm > 0) return; return oMove.apply(this, arguments); };
  }
  function popc(v) { let c = 0; while (v) { c += v & 1; v >>= 1; } return c; }
  function flipMask(i) { return (1 << i) | (1 << ((i + 1) % 5)) | (1 << ((i + 4) % 5)); }

  // =========================================================================================================================
  // PATTERNS. Times are seconds of pattern time (scaled by her pace). `strikes` feed the Rebuke table: [sec, {reach, arc, face}].
  // start(b, target, rnd) sets up; tick(b, livingParty, dt) runs the beats (b.at(sec) fires once); pose lives in the rig file.
  // =========================================================================================================================
  const PATS = {};

  // 1. FAN FLICK: two fan slashes and a flick that throws a lick of flame down a lane (all three can be Rebuked)
  PATS.ig_fan_flick = {
    dur: 1.75, strikes: [[0.45], [0.82], [1.18, { reach: 250, arc: 0.45 }]],
    start(b) { b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 170, a: b.facingAngle, half: 1.0, follow: true }, 0.45); },
    tick(b, L) {
      if (b.at(0.45)) { audio.playSwordSlash(true, 1.2); b.vfxAdd({ k: 'arc', a0: b.facingAngle + 1.0, a1: b.facingAngle - 1.0, r: 165, col: '#fb923c', life: 0.28 }); b.flair(b.fwd(110).x, b.fwd(110).y, 90, '#fb923c', 4); b.hitSectorP(L, 0, 170, b.facingAngle, 1.0, 230 * b.fanMult(), 'Fan Flick', 'medium', 95); }
      if (b.at(0.55)) { b.reaim(0.7); b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 170, a: b.facingAngle, half: 1.0 }, 0.27); }
      if (b.at(0.82)) { audio.playSwordSlash(false, 1.25); b.vfxAdd({ k: 'arc', a0: b.facingAngle - 1.0, a1: b.facingAngle + 1.0, r: 165, col: '#fb923c', life: 0.28 }); b.flair(b.fwd(110).x, b.fwd(110).y, 90, '#fb923c', 4); b.hitSectorP(L, 0, 170, b.facingAngle, 1.0, 240 * b.fanMult(), 'Fan Flick', 'medium', 95); }
      // the flick fans out into three licks of flame
      if (b.at(0.9)) { b.reaim(0.5); b.flickA = b.facingAngle; for (const o of [-0.34, 0, 0.34]) b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.flickA + o, len: 360, w: 38 }, 0.28); }
      if (b.at(1.18)) {
        audio.playImpactBoom(1.2);
        const hit = new Set();
        for (const o of [-0.34, 0, 0.34]) {
          const a = (b.flickA ?? b.facingAngle) + o;
          b.vfxAdd({ k: 'lick', x: b.x, y: b.y, a, len: 360, life: 0.5 });
          const end = b.fwd(360, a); b.flair(end.x, end.y, 70, '#fdba74', 0);
          b.hitCorridorP(L.filter(p => !hit.has(p.id) && b.inCorridor(p, b.x, b.y, a, 360, 38, 0) && hit.add(p.id)), b.x, b.y, a, 360, 38, 265 * b.fanMult(), 'Flick of the Wrist', 'heavy', 150);
        }
        if (window.fx) window.fx.triggerShake(10, 0.25);
      }
    }
  };

  // 2. PIROUETTE: three petals of fire wheel around her. Stand right against her, or walk with the gap.
  PATS.ig_pirouette = {
    dur: 2.9, strikes: [],
    start(b, tg, r) {
      const n = b.phase >= 2 ? 4 : 3;
      b.petals = { a0: r() * TAU, dir: r() < 0.5 ? -1 : 1, spin: 3.2, n };
      for (let k = 0; k < n; k++) b.tele({ k: 'sector', x: b.x, y: b.y, r0: 58, r1: 300, a: b.petals.a0 + k * TAU / n, half: 0.34, spinDir: b.petals.dir }, 0.7);
    },
    tick(b, L) {
      const P = b.petals; if (!P) return;
      if (b.at(0.7)) { audio.playImpactBoom(1.1); b.flair(b.x, b.y, 140, '#fb923c', 8); }
      if (b.patT >= 0.7 && b.patT <= 2.2) {
        const rot = P.a0 + P.dir * P.spin * (b.patT - 0.7);
        b.petalRot = rot; b.petalN = P.n;
        b.facingAngle = rot;
        if (window.fx && Math.random() < 0.5) { const k = Math.floor(Math.random() * P.n), a = rot + k * TAU / P.n, d = 120 + Math.random() * 170; window.fx.addDragSparks(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * T(), a + P.dir * 1.57, 1, false, '#fdba74'); }
        for (const p of L) {
          if (!(p.isLocal || p.isBot)) continue;
          if ((p._igPet || 0) > performance.now()) continue;
          for (let k = 0; k < P.n; k++) {
            if (b.inSector(p, b.x, b.y, 58, 300, rot + k * TAU / P.n, 0.34)) { p._igPet = performance.now() + 600; b.hurt(p, 160, 'Pirouette', 'medium', b.x, b.y, 90); break; }
          }
        }
      } else b.petalRot = null;
      // the spin flings a ring of fire outward: hug her or get past it
      if (b.at(1.6)) b.tele({ k: 'sector', x: b.x, y: b.y, r0: 150, r1: 330, a: 0, half: Math.PI }, 0.62);
      if (b.at(2.22)) {
        b.petalRot = null; audio.playImpactBoom(1.4);
        if (window.fx) { window.fx.addShockwave(b.x, b.y, 330, '#f97316', 8, 0.5); window.fx.triggerShake(12, 0.3); }
        b.vfxAdd({ k: 'ring', x: b.x, y: b.y, r: 330, col: '#f97316', life: 0.6 });
        b.vfxAdd({ k: 'embers', x: b.x, y: b.y, r: 300, col: '#fb923c', life: 1.0, seed: 3 });
        b.damagePlayersInSector(L, b.x, b.y, 150, 330, 0, Math.PI, 240, 'Encore Ring', 'heavy', 140);
      }
    }
  };

  // 3. ENCORE VOLLEY: three fireballs, each at a different member of the audience
  PATS.ig_volley = {
    dur: 2.6, strikes: [],
    start(b, tg, r) {
      const L = living().slice().sort((a, c) => (a.id > c.id ? 1 : -1));
      const s = Math.floor(r() * Math.max(1, L.length));
      b.volley = [0, 1, 2, 3, 4].map(i => L.length ? L[(s + i) % L.length].id : null);
    },
    tick(b, L) {
      [0.4, 0.7, 1.0, 1.3, 1.6].forEach((t, i) => {
        if (!b.at(t)) return;
        const p = L.find(q => q.id === (b.volley || [])[i]) || b.tgt();
        if (!p) return;
        b.aim(p);
        // leads a moving target a little, and leaves a burning patch where it lands
        const lead = 0.35, x = p.x + (p.vx || 0) * lead, y = p.y + (p.vy || 0) * lead;
        b.lob(x, y, 0.8, 85, 250, 'Encore Volley', {
          onLand(bb, pr, LL) {
            for (const q of LL) if (flat(q, pr.x1, pr.y1) <= pr.r) bb.hurt(q, pr.dmg, pr.label, 'medium', pr.x1, pr.y1, 120);
            bb.burst(pr.x1, pr.y1, pr.r, '#fb923c'); bb.flair(pr.x1, pr.y1, 85, '#fdba74', 3);
            bb.addHazard({ k: 'circle', x: pr.x1, y: pr.y1, r: 60, dur: 2.4, dmg: 60, label: 'Cinders' });
          }
        });
        b.tele({ k: 'circle', x, y, r: 85 }, 0.8 * b.patRate());
        audio.playSwordSlash(false, 0.9);
      });
    }
  };

  // 4. RED CARPET: a lane of fire rolls out, then she struts down it
  PATS.ig_carpet = {
    dur: 3.0, strikes: [], ego: 5,
    start(b) {
      b.carpet = { x: b.x, y: b.y, a: b.facingAngle, len: 470 };
      b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.facingAngle, len: 470, w: 56 }, 0.7);
    },
    tick(b, L) {
      const C = b.carpet; if (!C) return;
      if (b.at(0.7)) {
        audio.playImpactBoom(1.2);
        b.vfxAdd({ k: 'lick', x: C.x, y: C.y, a: C.a, len: C.len, life: 0.5 });
        if (window.fx) window.fx.triggerShake(8, 0.2);
        b.hitCorridorP(L, C.x, C.y, C.a, C.len, 56, 220, 'Red Carpet', 'medium', 110);
        b.addHazard({ k: 'lane', x: C.x, y: C.y, a: C.a, len: C.len, w: 50, dur: 4.4, dmg: 85, label: 'Red Carpet' });
      }
      // she poses at the head of the carpet before her strut: BLUE (counter it and the strut never happens)
      if (b.at(0.72)) { b.counterableWindow = true; audio.playCounterFlashCue(); }
      if (b.at(1.0)) b.counterableWindow = false;
      // flanking the carpet: fire bursts walk back down it after her strut (fireworks for the star)
      if (b.at(1.25)) for (let i = 0; i < 4; i++) { const p = b.fwd(80 + i * 105, C.a, C.x, C.y); b.tele({ k: 'circle', x: p.x, y: p.y, r: 92 }, 0.85 + (3 - i) * 0.15); }
      for (let i = 0; i < 4; i++) {
        if (!b.at(2.1 + (3 - i) * 0.15)) continue;
        const p = b.fwd(80 + i * 105, C.a, C.x, C.y);
        audio.playImpactBoom(0.9);
        b.vfxAdd({ k: 'pillar', x: p.x, y: p.y, r: 70, life: 0.55 });
        b.flair(p.x, p.y, 92, '#fb923c', 5);
        b.damagePlayersInRadius(L, p.x, p.y, 92, 190, 'Carpet Eruption', 'medium', 120);
      }
      if (b.patT > 1.0 && b.patT < 1.75) {
        const k = c01((b.patT - 1.0) / 0.75), d = 380 * (k * k * (3 - 2 * k));
        const prev = { x: b.x, y: b.y };
        const p = b.fwd(d, C.a, C.x, C.y); b.x = p.x; b.y = p.y; b.facingAngle = C.a;
        b.vx = (b.x - prev.x) * 60; b.vy = (b.y - prev.y) * 60; b.speed = 120;
        for (const q of L) if ((q.isLocal || q.isBot) && !q._igStrut && flat(q, b.x, b.y) < 52) { q._igStrut = 1; b.hurt(q, 170, 'Strut', 'medium', b.x, b.y, 120); }
      }
      if (b.at(1.76)) { b.speed = 0; for (const q of party()) if (q) q._igStrut = 0; b.snapFeetToBody(); }
    }
  };

  // 5. CURTSY: a deep bow (BLUE: counter it) and then the stage blows up around her
  PATS.ig_curtsy = {
    dur: 2.6, strikes: [], counter: [0.3, 0.95],
    start(b) { b.tele({ k: 'circle', x: b.x, y: b.y, r: 205, follow: true }, 1.05); },
    tick(b, L) {
      if (b.at(0.3)) { b.counterableWindow = true; audio.playCounterFlashCue(); }
      if (b.at(0.95)) b.counterableWindow = false;
      if (b.at(1.05)) {
        audio.playImpactBoom(1.6);
        if (window.fx) { window.fx.triggerShake(16, 0.4); window.fx.addShockwave(b.x, b.y, 230, '#f97316', 8); window.fx.addPillar(b.x, b.y, 80, '#fb923c', 0.7); }
        b.vfxAdd({ k: 'boom', x: b.x, y: b.y, r: 205, col: '#f97316', life: 0.6 });
        b.flair(b.x, b.y, 205, '#fb923c', 0);
        b.damagePlayersInRadius(L, b.x, b.y, 205, 340, 'Curtain Blast', 'heavy', 170);
        // the encore: a second ring falls just outside the first, so whoever backed off has to step back in
        b.tele({ k: 'sector', x: b.x, y: b.y, r0: 190, r1: 390, a: 0, half: Math.PI }, 0.75);
      }
      if (b.at(1.8)) {
        audio.playImpactBoom(1.4);
        if (window.fx) { window.fx.triggerShake(12, 0.3); window.fx.addShockwave(b.x, b.y, 400, '#fde047', 7, 0.5); }
        b.vfxAdd({ k: 'ring', x: b.x, y: b.y, r: 390, col: '#fde047', life: 0.6 });
        b.vfxAdd({ k: 'embers', x: b.x, y: b.y, r: 380, col: '#fde047', life: 1.0, seed: 5 });
        b.damagePlayersInSector(L, b.x, b.y, 190, 390, 0, Math.PI, 260, 'Second Curtain', 'heavy', 150);
      }
    }
  };

  // 6. SPOTLIGHT: a spotlight hunts one player, locks, and fire falls into it. Its damage is SHARED by everyone standing in it
  //    (alone it is cheap); if nobody takes it, the whole stage burns.
  PATS.ig_spotlight = {
    dur: 3.4, strikes: [],
    start(b, tg, r) {
      const p = tg || b.tgt(); b.spot = { x: p ? p.x : b.x, y: p ? p.y : b.y, r: 95, locked: false }; b.spotTele = b.tele({ k: 'spot', x: b.spot.x, y: b.spot.y, r: 95 }, 2.6);
      // from 70%: a second, slower light trails a different member of the audience (or the same one, a beat behind)
      b.spot2 = null;
      if (b.phase >= 2) {
        const L = living().slice().sort((a, c) => (a.id > c.id ? 1 : -1)), others = L.filter(q => !p || q.id !== p.id);
        const q = others.length ? others[Math.floor(r() * others.length)] : p;
        if (q) { b.spot2 = { x: q.x, y: q.y, r: 80, locked: false, tid: q.id }; b.spot2Tele = b.tele({ k: 'spot', x: q.x, y: q.y, r: 80 }, 2.95); }
      }
    },
    tick(b, L, dt) {
      const S = b.spot; if (!S) return;
      if (!S.locked) {
        const p = b.tgt();
        if (p) { S.x += (p.x - S.x) * Math.min(1, dt * 5); S.y += (p.y - S.y) * Math.min(1, dt * 5); }
        if (b.spotTele) { b.spotTele.x = S.x; b.spotTele.y = S.y; }
      }
      const S2 = b.spot2;
      if (S2 && !S2.locked) {
        const q = L.find(o => o.id === S2.tid) || b.tgt();
        if (q) { S2.x += (q.x - S2.x) * Math.min(1, dt * 3.2); S2.y += (q.y - S2.y) * Math.min(1, dt * 3.2); }
        if (b.spot2Tele) { b.spot2Tele.x = S2.x; b.spot2Tele.y = S2.y; }
      }
      if (S2 && b.at(2.3)) { S2.locked = true; audio.playParryClang(false); }
      if (S2 && b.at(2.95)) {
        audio.playImpactBoom(1.3);
        b.vfxAdd({ k: 'pillar', x: S2.x, y: S2.y, r: S2.r, life: 0.7 }); b.flair(S2.x, S2.y, S2.r, '#fde047', 8);
        b.damagePlayersInRadius(L, S2.x, S2.y, S2.r, 250, 'Follow Spot', 'heavy', 110);
      }
      if (b.at(1.9)) { S.locked = true; audio.playParryClang(false); }
      if (b.at(2.6)) {
        const inside = L.filter(p => flat(p, S.x, S.y) <= S.r);
        audio.playImpactBoom(1.5);
        b.vfxAdd({ k: 'pillar', x: S.x, y: S.y, r: S.r, life: 0.7 }); b.flair(S.x, S.y, S.r, '#fde047', 10);
        if (inside.length) {
          const solo = party().filter(p => !p.isBot).length <= 1;
          const each = solo ? 260 : Math.round(560 / inside.length);
          for (const p of inside) b.hurt(p, each, inside.length > 1 ? 'Shared Spotlight' : 'Spotlight', 'heavy', S.x, S.y, 90);
          if (window.fx && inside.length > 1) window.fx.addFloatingText(S.x, S.y - 120, '"Sharing the stage? How generous."', '#fde68a', 13);
        } else {
          b.say(LINES.spotlightFail, 2.2);
          if (window.fx) { window.fx.triggerShake(18, 0.4); window.fx.addShockwave(S.x, S.y, 640, '#f97316', 9, 0.8); }
          for (const p of L) b.hurt(p, 420, 'Snubbed Spotlight', 'heavy', S.x, S.y, 140);
        }
      }
    }
  };

  // 7. EMBER WHIP: a wide whip sweep, then a straight crack (both can be Rebuked)
  PATS.ig_whip = {
    dur: 2.75, strikes: [[0.78, { reach: 280, arc: 1.3 }], [1.48, { reach: 300, arc: 0.4 }], [2.05, { reach: 360, arc: 0.4 }]],
    start(b) { b.tele({ k: 'sector', x: b.x, y: b.y, r0: 45, r1: 290, a: b.facingAngle - 0.2, half: 0.95, follow: true, aOff: -0.2 }, 0.78); },
    tick(b, L) {
      if (b.at(0.78)) { audio.playSwordSlash(true, 0.8); b.vfxAdd({ k: 'whip', a0: b.facingAngle + 0.75, a1: b.facingAngle - 1.15, r: 285, life: 0.35 }); b.flair(b.fwd(200, b.facingAngle - 0.2).x, b.fwd(200, b.facingAngle - 0.2).y, 80, '#fb923c', 4); b.hitSectorP(L, 45, 290, b.facingAngle - 0.2, 0.95, 250, 'Ember Whip', 'medium', 110); }
      if (b.at(1.05)) { b.reaim(0.9); b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.facingAngle, len: 340, w: 34 }, 0.43); }
      if (b.at(1.48)) { audio.playParryClang(false); audio.playImpactBoom(1.0); b.vfxAdd({ k: 'crack', x: b.x, y: b.y, a: b.facingAngle, len: 340, life: 0.4 }); const e = b.fwd(340); b.flair(e.x, e.y, 80, '#fde047', 6); b.hitCorridorP(L, b.x, b.y, b.facingAngle, 340, 34, 300, 'Whip Crack', 'heavy', 150); }
      // a second crack, longer, that leaves the lane burning; she flashes BLUE as she winds it up (counter it)
      if (b.at(1.62)) { b.reaim(1.2); b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.facingAngle, len: 380, w: 36 }, 0.43); b.counterableWindow = true; audio.playCounterFlashCue(); }
      if (b.at(2.0)) b.counterableWindow = false;
      if (b.at(2.05)) {
        audio.playParryClang(true); audio.playImpactBoom(1.2);
        b.vfxAdd({ k: 'crack', x: b.x, y: b.y, a: b.facingAngle, len: 380, life: 0.45 });
        const e = b.fwd(380); b.flair(e.x, e.y, 95, '#fde047', 9);
        b.hitCorridorP(L, b.x, b.y, b.facingAngle, 380, 36, 310, 'Whip Crack', 'heavy', 150);
        b.addHazard({ k: 'lane', x: b.x, y: b.y, a: b.facingAngle, len: 380, w: 30, dur: 2.4, dmg: 70, label: 'Smouldering Lash', delay: 0.1 });
      }
    }
  };

  // 8. BLOWN KISS: a slow, homing kiss of fire; kite it while she poses (a free opening)
  PATS.ig_kiss = {
    dur: 3.7, strikes: [],
    start(b, tg) { b.kissTid = tg ? tg.id : null; },
    tick(b) {
      // one kiss, two from 70%, three below 40%; the extras curl in from the sides
      const kisses = [[0.55, 0], [1.05, 0.9], [1.5, -0.9]].slice(0, b.phase >= 3 ? 3 : (b.phase >= 2 ? 2 : 1));
      for (const [t, off] of kisses) {
        if (!b.at(t)) continue;
        const h = b.fwd(26);
        b.proj.push({ k: 'kiss', x: h.x, y: h.y, a: b.facingAngle + off, t: 0, life: 2.9, tid: b.kissTid });
        b.vfxAdd({ k: 'embers', x: h.x, y: h.y, r: 60, col: '#f472b6', life: 0.7, seed: t });
        b.vfxAdd({ k: 'hearts', x: h.x, y: h.y, r: 50, life: 0.8, seed: t * 7 });
        // a "mwah": two bright chimes (not the counter cue: a kiss can't be countered)
        if (audio.playBellTone) { audio.playBellTone(1568, 0.25, 0.15); setTimeout(() => audio.playBellTone(2093, 0.35, 0.12), 90); }
      }
    }
  };

  // 9. STAGE SPLIT: a wall of fire sweeps the whole stage; there is ONE gap in it (or dodge through it)
  PATS.ig_split = {
    dur: 4.3, strikes: [], phase: 2,
    start(b, tg, r) {
      const a = b.facingAngle;
      b.split = { x: b.x, y: b.y, a, gap: (r() - 0.5) * 520, gw: 100, w0: 430, w1: -280, hit: {}, t0: 1.2, t1: 3.0 };
      b.tele({ k: 'wallgap', x: b.x, y: b.y, a, d: 430, gap: b.split.gap, gw: 100 }, 1.2);
      // the curtain comes back the other way, with its gap somewhere else (at least a body width away)
      let g2 = (r() - 0.5) * 520; if (Math.abs(g2 - b.split.gap) < 180) g2 = b.split.gap + (g2 < b.split.gap ? -220 : 220);
      g2 = Math.max(-280, Math.min(280, g2));
      b.split2 = { x: b.x, y: b.y, a: a + Math.PI, gap: -g2, gw: 100, w0: 430, w1: -280, hit: {}, t0: 2.5, t1: 4.1 };
    },
    tick(b, L) {
      const S = b.split; if (!S) return;
      if (b.at(0.5)) { audio.playImpactBoom(1.1); b.flair(b.x, b.y, 140, '#fb923c', 6); }
      if (b.at(1.6) && b.split2) b.tele({ k: 'wallgap', x: b.x, y: b.y, a: b.split2.a, d: 430, gap: b.split2.gap, gw: 100 }, 0.9);
      if (b.at(2.5)) { audio.playImpactBoom(1.0); if (window.fx) window.fx.triggerShake(8, 0.25); }
      for (const W of [S, b.split2]) {
        if (!W) continue;
        if (b.patT >= W.t0 && b.patT <= W.t1) {
          const w = lerp(W.w0, W.w1, (b.patT - W.t0) / (W.t1 - W.t0));
          W.cur = w;
          if (window.fx && Math.random() < 0.6) { const l = (Math.random() - 0.5) * 1200; if (Math.abs(l - W.gap) > W.gw / 2) window.fx.addDragSparks(W.x + Math.cos(W.a) * w - Math.sin(W.a) * l, W.y + (Math.sin(W.a) * w + Math.cos(W.a) * l) * T(), -Math.PI / 2, 1, false, '#fdba74'); }
          for (const p of L) {
            if (!(p.isLocal || p.isBot) || W.hit[p.id]) continue;
            const dx = p.x - W.x, dy = (p.y - W.y) / T();
            const f = dx * Math.cos(W.a) + dy * Math.sin(W.a), lat = -dx * Math.sin(W.a) + dy * Math.cos(W.a);
            if (Math.abs(f - w) < 24 && Math.abs(lat - W.gap) > W.gw / 2) { W.hit[p.id] = 1; b.hurt(p, 300, 'Stage Split', 'heavy', p.x - Math.cos(W.a) * 30, p.y - Math.sin(W.a) * 30 * T(), 120); }
          }
        } else if (b.patT > W.t1) W.cur = null;
      }
    }
  };

  // 10. STANDING OVATION: three waves of embers rain down (one always lands on each player)
  PATS.ig_ovation = {
    dur: 3.9, strikes: [], phase: 2,
    start() {},
    tick(b, L) {
      [1.1, 1.75, 2.4, 3.05].forEach((t, wave) => {
        if (!b.at(t - 0.8)) return;
        const r = b.patRng, spots = [];
        for (let i = 0; i < 9; i++) { const a = r() * TAU, d = 80 + r() * 430; spots.push({ x: STAGE.x + Math.cos(a) * d, y: STAGE.y + Math.sin(a) * d * T() }); }
        for (const p of L) spots.push({ x: p.x, y: p.y });
        for (const s of spots) {
          b.lob(s.x, s.y, 0.8, 72, 210, 'Standing Ovation', { fromSky: true });
          b.tele({ k: 'circle', x: s.x, y: s.y, r: 72 }, 0.8 * b.patRate());
        }
        audio.playParryClang(false);
        if (window.fx) window.fx.addShockwave(b.x, b.y - 120, 90 + wave * 30, '#fde047', 3, 0.35);
      });
    }
  };

  // 11. FLAME TANGO: three dashing lunges that leave burning trails; the last one flashes BLUE (counter it)
  PATS.ig_tango = {
    dur: 3.3, strikes: [[0.5, { reach: 280, arc: 0.6 }], [1.1, { reach: 280, arc: 0.6 }], [1.7, { reach: 280, arc: 0.6 }]], counter: [2.05, 2.4], phase: 2,
    start(b) { b.tango = []; },
    tick(b, L) {
      const beats = [0.5, 1.1, 1.7, 2.4], last = beats.length - 1;
      beats.forEach((t, i) => {
        if (b.at(t - 0.35)) {
          b.reaim(2.5);
          const p = b.tgt(); const d = p ? Math.max(120, Math.min(300, Math.hypot(p.x - b.x, (p.y - b.y) / T()) + 40)) : 220;
          b.tango[i] = { x: b.x, y: b.y, a: b.facingAngle, d };
          b.tele({ k: 'corridor', x: b.x, y: b.y, a: b.facingAngle, len: d, w: 44 }, 0.35);
        }
        // the last lunge flashes blue a beat early (counter window 1.85 -> 2.4)
        if (i === last && b.at(1.85)) { b.counterableWindow = true; audio.playCounterFlashCue(); }
        if (b.at(t)) {
          const D = b.tango[i]; if (!D) return;
          if (i === last) b.counterableWindow = false;
          b.flair(D.x, D.y, 70, '#fb923c', 3);
          const end = b.inArena(D.x + Math.cos(D.a) * D.d, D.y + Math.sin(D.a) * D.d * T(), 520);
          b.x = end.x; b.y = end.y; b.facingAngle = D.a; b.snapFeetToBody();
          audio.playSwordSlash(true, 1.3);
          b.vfxAdd({ k: 'trail', x: D.x, y: D.y, a: D.a, len: D.d, life: 0.5 });
          b.hitCorridorP(L, D.x, D.y, D.a, D.d, 44, 240, 'Flame Tango', 'medium', 120);
          b.addHazard({ k: 'lane', x: D.x, y: D.y, a: D.a, len: D.d, w: 32, dur: 2.2, dmg: 70, label: 'Tango Embers', delay: 0.15 });
        }
      });
    }
  };

  // 12. MIRROR, MIRROR: a reflection of her appears on the far side of her target; both fire cones at once, then both burst
  PATS.ig_mirror = {
    dur: 3.15, strikes: [[1.4, { arc: 0.75, reach: 240 }]], phase: 2,
    start(b, tg) {
      const p = tg || b.tgt();
      const tx = p ? p.x : b.x, ty = p ? p.y : b.y + 100;
      const img = b.inArena(tx * 2 - b.x, ty * 2 - b.y, 520);
      b.mirrorImg = { x: img.x, y: img.y, a: Math.atan2((ty - img.y) / T(), tx - img.x), t: 0 };
      b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 245, a: b.facingAngle, half: 0.75 }, 1.4);
      b.tele({ k: 'sector', x: img.x, y: img.y, r0: 0, r1: 245, a: b.mirrorImg.a, half: 0.75 }, 1.4);
    },
    tick(b, L) {
      const M = b.mirrorImg; if (!M) return;
      if (b.at(1.4)) {
        audio.playSwordSlash(true, 1.0); audio.playImpactBoom(1.1);
        b.vfxAdd({ k: 'arc', a0: b.facingAngle - 0.75, a1: b.facingAngle + 0.75, r: 240, col: '#fb923c', life: 0.3 });
        b.vfxAdd({ k: 'arc', x: M.x, y: M.y, a0: M.a + 0.75, a1: M.a - 0.75, r: 240, col: '#c084fc', life: 0.3 });
        b.hitSectorP(L, 0, 245, b.facingAngle, 0.75, 300 * b.fanMult(), 'Mirror Fan', 'heavy', 140);
        b.damagePlayersInSector(L, M.x, M.y, 0, 245, M.a, 0.75, 300, 'Mirror Image', 'heavy', 140);
      }
      if (b.at(1.6)) { b.tele({ k: 'circle', x: b.x, y: b.y, r: 135 }, 0.5); b.tele({ k: 'circle', x: M.x, y: M.y, r: 135 }, 0.5); }
      if (b.at(2.1)) {
        audio.playImpactBoom(1.2);
        b.burst(b.x, b.y, 135, '#fb923c'); b.burst(M.x, M.y, 135, '#c084fc');
        b.damagePlayersInRadius(L, b.x, b.y, 135, 220, 'Mirror Burst', 'medium', 130);
        b.damagePlayersInRadius(L, M.x, M.y, 135, 220, 'Mirror Burst', 'medium', 130);
        // then the two of them join hands across the stage: a beam from her to her reflection
        const a = Math.atan2((M.y - b.y) / T(), M.x - b.x), len = Math.hypot(M.x - b.x, (M.y - b.y) / T());
        M.beam = { a, len }; b.tele({ k: 'corridor', x: b.x, y: b.y, a, len, w: 40 }, 0.5);
      }
      if (b.at(2.6) && M.beam) {
        audio.playImpactBoom(1.3); audio.playSwordSlash(true, 1.4);
        b.vfxAdd({ k: 'lick', x: b.x, y: b.y, a: M.beam.a, len: M.beam.len, life: 0.55 });
        b.vfxAdd({ k: 'crack', x: b.x, y: b.y, a: M.beam.a, len: M.beam.len, life: 0.55 });
        b.flair(M.x, M.y, 100, '#c084fc', 10);
        b.hitCorridorP(L, b.x, b.y, M.beam.a, M.beam.len, 40, 280, 'Mirror Duet', 'heavy', 140);
      }
    }
  };

  // 13. HAIR FLIP: wrong side, darling — flame jets out behind her, then a fan slash in front (the slash can be Rebuked)
  PATS.ig_hair_flip = {
    dur: 2.2, strikes: [[1.08, { arc: 0.9 }]],
    start(b) { b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 235, a: b.facingAngle + Math.PI, half: 1.05 }, 0.58); },
    tick(b, L) {
      if (b.at(0.58)) {
        audio.playImpactBoom(1.0);
        b.vfxAdd({ k: 'jet', a: b.facingAngle + Math.PI, r: 235, half: 1.05, life: 0.45 });
        b.damagePlayersInSector(L, b.x, b.y, 0, 235, b.facingAngle + Math.PI, 1.05, 280, 'Hair Flip', 'heavy', 150);
      }
      if (b.at(0.62)) { b.reaim(0.6); b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 175, a: b.facingAngle, half: 0.9 }, 0.46); }
      if (b.at(1.08)) { audio.playSwordSlash(true, 1.1); b.vfxAdd({ k: 'arc', a0: b.facingAngle + 0.9, a1: b.facingAngle - 0.9, r: 172, col: '#fb923c', life: 0.28 }); b.flair(b.fwd(110).x, b.fwd(110).y, 80, '#fb923c', 4); b.hitSectorP(L, 0, 175, b.facingAngle, 0.9, 240 * b.fanMult(), 'Fan Slash', 'medium', 100); }
      // she tosses her hair back and her whole silhouette flares: BLUE while it builds (counter it)
      if (b.at(1.12)) { b.tele({ k: 'circle', x: b.x, y: b.y, r: 150 }, 0.5); b.counterableWindow = true; audio.playCounterFlashCue(); }
      if (b.at(1.55)) b.counterableWindow = false;
      if (b.at(1.62)) {
        audio.playImpactBoom(1.2);
        b.vfxAdd({ k: 'boom', x: b.x, y: b.y, r: 150, col: '#f97316', life: 0.5 });
        b.flair(b.x, b.y, 150, '#fdba74', 9);
        b.damagePlayersInRadius(L, b.x, b.y, 150, 230, 'Flare Up', 'medium', 150);
      }
    }
  };

  // 14. FIREWORKS (last third): rockets burst into crosses of fire across the stage; find the empty squares
  PATS.ig_fireworks = {
    dur: 3.4, strikes: [], phase: 3,
    start(b, tg, r) {
      const p = tg || b.tgt();
      b.rockets = [];
      for (let i = 0; i < 7; i++) {
        let x, y;
        if ((i === 0 || i === 5) && p) { x = p.x; y = p.y; }   // two of them are for the target: the second lands where they were
        else { const a = r() * TAU, d = 60 + r() * 420; x = STAGE.x + Math.cos(a) * d; y = STAGE.y + Math.sin(a) * d * T(); }
        const rot = r() < 0.5 ? 0 : Math.PI / 4;
        const at = 1.4 + i * 0.22;
        b.rockets.push({ x, y, rot, at, launch: 0.3 + i * 0.1 });
        for (const q of [rot, rot + Math.PI / 2]) {
          const s = { x: x - Math.cos(q) * 170, y: y - Math.sin(q) * 170 * T() };
          b.tele({ k: 'corridor', x: s.x, y: s.y, a: q, len: 340, w: 36, noBack: true }, at);
        }
      }
    },
    tick(b, L) {
      for (const k of b.rockets || []) {
        if (b.at(k.launch)) { audio.playSwordSlash(false, 1.6); b.vfxAdd({ k: 'rocket', x: k.x, y: k.y, life: k.at - k.launch + 0.1, fromX: b.x, fromY: b.y }); }
        if (b.at(k.at)) {
          audio.playImpactBoom(0.9);
          b.vfxAdd({ k: 'cross', x: k.x, y: k.y, rot: k.rot, life: 0.55 });
          b.vfxAdd({ k: 'embers', x: k.x, y: k.y, r: 170, col: '#fde047', life: 1.0, seed: k.at });
          if (window.fx) window.fx.triggerShake(5, 0.15);
          for (const p of L) {
            if (!(p.isLocal || p.isBot)) continue;
            let hit = false;
            for (const q of [k.rot, k.rot + Math.PI / 2]) if (b.inCorridor(p, k.x - Math.cos(q) * 170, k.y - Math.sin(q) * 170 * T(), q, 340, 36, 0)) hit = true;
            if (hit) b.hurt(p, 230, 'Fireworks', 'medium', k.x, k.y, 110);
          }
        }
      }
    }
  };

  // 15. CATHERINE WHEEL (from 70%): she takes centre stage as the hub of a giant firework pinwheel. Curved blades of fire spiral
  //     out from her to a ring of fire round the edge, and the wheel turns: stand in a gap and move with it. Partway through it
  //     stops for a beat and spins back the other way, unannounced (the user wants players to discover it). Below 40% it grows a sixth blade and spins
  //     faster; on Hard the hub also spits fireballs out along the gaps. A blade hit shoves you along the spin.
  const WHEEL = { warn: 1.9, pause: 4.25, resume: 5.05, end: 7.2, w1: 0.62, w2: 0.78, hub: 62, R: 500, hw: 34, curve: 0.9, dmg: 220, ringDmg: 120, again: 0.7, spitEvery: 0.55 };
  // the centre line of blade k at ground radius r: it curls back against the first spin
  const bladeAngle = (W, k, r) => W.a + k * TAU / W.n - W.curl * WHEEL.curve * (r / WHEEL.R);
  const bladeHalf = (r) => WHEEL.hw * (0.5 + 0.7 * Math.min(1, r / WHEEL.R));
  PATS.ig_wheel = {
    speaks: true, dur: 7.7, strikes: [], phase: 2, ego: 6,
    start(b, tg, r) {
      const p = tg || b.tgt();
      const dir = r() < 0.5 ? 1 : -1, n = b.phase >= 3 ? 6 : 5;
      // open a gap (not a blade) towards the target so nobody starts inside fire; rounded so every client agrees
      const raw = p ? Math.atan2((p.y - STAGE.y) / T(), p.x - STAGE.x) : -Math.PI / 2;
      const rt = p ? Math.min(WHEEL.R, flat(p, STAGE.x, STAGE.y)) : 250;
      const a = Math.round((raw - Math.PI / n + dir * WHEEL.curve * rt / WHEEL.R) / (TAU / 36)) * TAU / 36;
      b.wheel = { a, dir, curl: dir, n, from: { x: b.x, y: b.y }, shown: 0 };
      b.say(LINES.wheel, 3, true);
    },
    tick(b, L, dt) {
      const W = b.wheel; if (!W) return;
      const t = b.patT;
      // glide to centre stage
      if (t < 0.8) { const k = t / 0.8, e = k * k * (3 - 2 * k); b.x = lerp(W.from.x, STAGE.x, e); b.y = lerp(W.from.y, STAGE.y, e); b.speed = 60; }
      else if (t < 0.9) { b.x = STAGE.x; b.y = STAGE.y; b.speed = 0; b.snapFeetToBody(); }
      W.shown = c01(t / 0.6) * (t > WHEEL.end ? c01(1 - (t - WHEEL.end) / 0.45) : 1);
      // spin, stop for a beat, spin back
      const dtp = dt * b.patRate(), boost = b.phase >= 3 ? 1.15 : 1;
      const spin = (t >= WHEEL.warn && t < WHEEL.pause) ? WHEEL.w1 : ((t >= WHEEL.resume && t < WHEEL.end) ? WHEEL.w2 : 0);
      W.a += W.dir * spin * boost * dtp;
      W.burning = t >= WHEEL.warn && t < WHEEL.end;
      W.paused = t >= WHEEL.pause && t < WHEEL.resume;
      b.facingAngle = W.a; b.baseFacing = W.a;
      if (b.at(0.5)) { audio.playParryClang(false); if (window.fx) window.fx.addShockwave(STAGE.x, STAGE.y, 300, '#fde047', 4, 0.6); }
      if (b.at(WHEEL.warn)) { audio.playImpactBoom(1.7); b.flair(STAGE.x, STAGE.y, 200, '#fb923c', 14); if (window.fx) window.fx.addShockwave(STAGE.x, STAGE.y, WHEEL.R + 40, '#f97316', 9, 0.7); }
      // the pause: it just stops for a beat, then spins back the other way. Nothing announces the reversal; players find out.
      if (b.at(WHEEL.pause)) W.dir = -W.dir;
      if (b.at(WHEEL.resume)) { audio.playImpactBoom(1.1); if (window.fx) window.fx.triggerShake(6, 0.2); }
      if (b.at(WHEEL.end)) { audio.playImpactBoom(1.0); if (window.fx) window.fx.addShockwave(STAGE.x, STAGE.y, WHEEL.R, '#fb923c', 6, 0.5); }
      // Hard: the hub spits a fireball down the middle of a gap every so often (seeded, so every client throws the same ones)
      if (hard()) {
        for (let st = WHEEL.warn + 0.45; st < WHEEL.end - 0.3; st += WHEEL.spitEvery) {
          if (st >= WHEEL.pause && st < WHEEL.resume) continue;
          if (!b.at(st)) continue;
          const g = Math.floor(b.patRng() * W.n), ang = bladeAngle(W, g, 140) + Math.PI / W.n;
          b.proj.push({ k: 'spark', x: STAGE.x + Math.cos(ang) * WHEEL.hub, y: STAGE.y + Math.sin(ang) * WHEEL.hub * T(), a: ang, spd: 310, t: 0, life: 1.8 });
          audio.playSwordSlash(false, 1.5);
        }
      }
      // what burns: the ring at the edge, the hub, and the blades (a blade widens as it reaches out)
      if (W.burning) {
        const now = performance.now();
        for (const p of L) {
          if (!(p.isLocal || p.isBot)) continue;
          if ((p._igWh || 0) > now) continue;
          const d = flat(p, STAGE.x, STAGE.y), th = Math.atan2((p.y - STAGE.y) / T(), p.x - STAGE.x);
          let name = null, dmg = WHEEL.dmg, sx = p.x, sy = p.y, push = 150;
          if (d >= WHEEL.R) { name = 'Ring of Fire'; dmg = WHEEL.ringDmg; sx = p.x + Math.cos(th) * 40; sy = p.y + Math.sin(th) * 40 * T(); push = 110; }
          else if (d < WHEEL.hub) { name = 'Hub Flare'; sx = STAGE.x; sy = STAGE.y; push = 160; }
          else {
            for (let k = 0; k < W.n; k++) {
              if (Math.abs(wrapA(th - bladeAngle(W, k, d))) * d > bladeHalf(d)) continue;
              const sweep = th + W.dir * Math.PI / 2;
              name = 'Catherine Wheel'; sx = p.x - Math.cos(sweep) * 40; sy = p.y - Math.sin(sweep) * 40 * T();
              break;
            }
          }
          if (!name) continue;
          p._igWh = now + WHEEL.again * 1000;
          b.hurt(p, dmg, name, 'heavy', sx, sy, push);
          b.flair(p.x, p.y, 70, '#fdba74', 5);
        }
      }
    }
  };

  // 16. EYES ON THE STAR (from 70%): a spotlight drops on her and the rest of the stage goes dark. When the light flares, anyone
  //     not facing her is burned for upstaging her. Once her CROWN is broken it flips without a word of warning: she hides behind
  //     her fan, flashbulbs pop around the stage, and the big flash burns anyone who IS looking at her.
  PATS.ig_gaze = {
    speaks: true, dur: 3.65, strikes: [], phase: 2, ego: 5,
    start(b) {
      const flip = !!b.crownGone;
      b.gaze = { flip, snap: 2.7 };
      b.cueSay(flip ? LINES.gazeFlip : LINES.gaze, 2.9);
    },
    tick(b, L) {
      const G = b.gaze; if (!G) return;
      if (b.at(0.3)) { audio.playParryClang(true); if (window.fx) window.fx.addShockwave(b.x, b.y, 120, G.flip ? '#f1f5f9' : '#fde047', 4, 0.4); }
      // flipped: the paparazzi warm up (little flashes around the stage, more and more of them)
      if (G.flip && b.patT > 0.6 && b.patT < G.snap && Math.random() < (b.patT / G.snap) * 0.35) {
        const a = Math.random() * TAU, r = 380 + Math.random() * 160;
        b.vfxAdd({ k: 'flashbulb', x: STAGE.x + Math.cos(a) * r, y: STAGE.y + Math.sin(a) * r * T(), r: 30, life: 0.25 });
      }
      if (b.at(G.snap)) {
        // the flare itself stays ON HER (no stage-wide shockwave or big screen flash: those read as "I got hit" even when you passed)
        audio.playParryClang(true);
        if (window.fx && G.flip) window.fx.triggerScreenFlash('#ffffff', 0.22);
        b.vfxAdd({ k: 'flashbulb', x: b.x, y: b.y - 90, r: 120, life: 0.4 });
        let anyHurt = false;
        for (const p of L) {
          if (!(p.isLocal || p.isBot)) continue;
          const to = Math.atan2((b.y - p.y) / T(), b.x - p.x);
          // bots mostly get it right (Math.random: bots live on one client, so patRng stays in step everywhere)
          // the cone is generous (about 80 degrees either side): roughly "toward her" counts
          const facing = p.isBot ? (Math.random() < 0.8) !== G.flip : Math.abs(wrapA((p.facingAngle || 0) - to)) < 1.4;
          if (facing !== G.flip) {
            // passed: a little gold shower over you and a happy chime, so it is obvious nothing happened to you
            b.vfxAdd({ k: 'hearts', x: p.x, y: p.y, r: 45, life: 0.8, gold: true, seed: p.x });
            if (p.isLocal && audio.playBellTone) { audio.playBellTone(1319, 0.3, 0.12); setTimeout(() => audio.playBellTone(1760, 0.4, 0.1), 110); }
            continue;
          }
          anyHurt = true;
          b.hurt(p, 320, G.flip ? 'Caught in the Flash' : 'Upstaged', 'heavy', b.x, b.y, 50);
          b.flair(p.x, p.y, 70, G.flip ? '#f8fafc' : '#fb923c', 0);
        }
        if (anyHurt) audio.playImpactBoom(1.2);
      }
      if (b.at(3.6)) b.gaze = null;
    }
  };

  // 17. READ THE SCRIPT: she reads a line off a page, and the line is the telegraph. Every line always means the same two steps
  //     (SCRIPT, at the top). Only a short flash marks each step just before it lands. Hard: sometimes the page is burning and she
  //     ad-libs: the same line, the steps the other way round.
  PATS.ig_script = {
    speaks: true, dur: 7.5, strikes: [], ego: 6,
    start(b, tg, r) {
      const s = SCRIPT[Math.floor(r() * SCRIPT.length)];
      const lie = hard() && r() < 0.3;
      const Lv = living().slice().sort((a, c) => (a.id > c.id ? 1 : -1));
      const stackId = Lv.length ? Lv[Math.floor(r() * Lv.length)].id : null;
      b.script = { s, lie, steps: lie ? s.steps.slice().reverse() : s.steps.slice(), stackId, at: [4.8, 6.6], mark: null, spot: null };
      b.cueSay(s.text, 4.4);
    },
    tick(b, L) {
      const S = b.script; if (!S) return;
      S.steps.forEach((kind, i) => {
        const at = S.at[i], lead = (kind === 'stack' || kind === 'spread') ? 1.0 : 0.55;
        if (b.at(at - lead)) b.scriptWarn(kind, lead);
        if (b.at(at)) b.scriptHit(kind, L);
      });
      if (b.at(7.4)) b.script = null;
    }
  };

  // 18. TWIN FANS (Act II): she throws one arm high (the fan, or the flame in her other palm) and THAT side of her burns first,
  //     then the other. The raised arm is the whole tell; the floor only flashes a moment before each half lands.
  PATS.ig_twin_fans = {
    act2: true, dur: 2.6, strikes: [],
    start(b, tg, r) { b.twin = { side: r() < 0.5 ? 1 : -1, a: b.facingAngle }; },
    tick(b, L) {
      const W = b.twin; if (!W) return;
      b.facingAngle = W.a;
      const sideA = (s) => W.a + s * Math.PI / 2;          // +1: her right (the fan hand), -1: her left (the flame hand)
      const strike = (s, dmg) => {
        const a = sideA(s);
        audio.playSwordSlash(true, s > 0 ? 1.15 : 0.95); audio.playImpactBoom(1.1);
        b.vfxAdd({ k: 'arc', a0: a - 1.5, a1: a + 1.5, r: 320, col: s > 0 ? '#fb923c' : '#fde047', life: 0.34 });
        b.vfxAdd({ k: 'embers', x: b.x + Math.cos(a) * 170, y: b.y + Math.sin(a) * 170 * T(), r: 150, col: '#fb923c', life: 0.8, seed: s > 0 ? 7 : 8 });
        if (window.fx) window.fx.triggerShake(9, 0.22);
        b.damagePlayersInSector(L, b.x, b.y, 0, 330, a, Math.PI / 2, dmg, 'Twin Fans', 'heavy', 140);
      };
      if (b.at(0.8)) b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 330, a: sideA(W.side), half: Math.PI / 2 }, 0.35);
      if (b.at(1.15)) strike(W.side, 270 * (W.side > 0 ? b.fanMult() : 1));
      if (b.at(1.45)) b.tele({ k: 'sector', x: b.x, y: b.y, r0: 0, r1: 330, a: sideA(-W.side), half: Math.PI / 2 }, 0.35);
      if (b.at(1.8)) strike(-W.side, 270 * (W.side < 0 ? b.fanMult() : 1));
    }
  };

  // 19. GRAND JETÉ (Act II): three soaring leaps, each landing on someone's spot in a burst of fire. On the last landing she sinks
  //     into a held bow (BLUE: counter it) and then rises with a ring of fire around her.
  PATS.ig_grand_jete = {
    act2: true, dur: 4.4, strikes: [], counter: [3.0, 3.5],
    start(b, tg, r) {
      const Lv = living().slice().sort((a, c) => (a.id > c.id ? 1 : -1));
      const s = Math.floor(r() * Math.max(1, Lv.length));
      b.jete = { ids: [0, 1, 2].map(i => Lv.length ? Lv[(s + i) % Lv.length].id : null), cur: null };
    },
    tick(b, L) {
      const J = b.jete; if (!J) return;
      const T0 = [0.3, 1.25, 2.2], AIR = 0.6, R = 125;
      for (let i = 0; i < 3; i++) {
        if (b.at(T0[i])) {
          const p = L.find(q => q.id === J.ids[i]) || b.tgt();
          const tg = b.inArena(p ? p.x : b.x, p ? p.y : b.y, 500);
          J.cur = { sx: b.x, sy: b.y, tx: tg.x, ty: tg.y, t0: T0[i] };
          b.aim(tg);
          b.tele({ k: 'circle', x: tg.x, y: tg.y, r: R }, AIR);
          audio.playSwordSlash(true, 0.8);
          if (window.fx) window.fx.addShockwave(b.x, b.y, 90, '#fb923c', 3, 0.3);
        }
        if (b.at(T0[i] + AIR) && J.cur) {
          b.x = J.cur.tx; b.y = J.cur.ty; b.targetX = b.x; b.targetY = b.y; b.jumpZ = 0; J.cur = null; b.snapFeetToBody();
          audio.playImpactBoom(1.3);
          b.burst(b.x, b.y, R, '#f97316'); b.flair(b.x, b.y, R, '#fdba74', 8);
          b.damagePlayersInRadius(L, b.x, b.y, R, 250, 'Grand Jeté', 'heavy', 150);
          b.addHazard({ k: 'circle', x: b.x, y: b.y, r: 70, dur: 2.2, dmg: 60, label: 'Cinders' });
        }
      }
      if (J.cur) {
        const k = c01((b.patT - J.cur.t0) / AIR);
        b.x = lerp(J.cur.sx, J.cur.tx, k); b.y = lerp(J.cur.sy, J.cur.ty, k); b.targetX = b.x; b.targetY = b.y;
        b.jumpZ = Math.sin(k * Math.PI) * 130;
      } else b.jumpZ = 0;
      if (b.at(3.0)) { b.counterableWindow = true; audio.playCounterFlashCue(); b.tele({ k: 'circle', x: b.x, y: b.y, r: 280, follow: true }, 0.9); }
      if (b.at(3.5)) b.counterableWindow = false;
      if (b.at(3.9)) {
        audio.playImpactBoom(1.6);
        if (window.fx) { window.fx.triggerShake(14, 0.35); window.fx.addShockwave(b.x, b.y, 300, '#f97316', 8, 0.5); }
        b.vfxAdd({ k: 'boom', x: b.x, y: b.y, r: 280, col: '#f97316', life: 0.6 });
        b.damagePlayersInRadius(L, b.x, b.y, 280, 300, 'Curtain Bow', 'heavy', 170);
      }
    }
  };

  // her little shows of ego (high Ego only): a free opening
  PATS.ig_taunt = {
    dur: 1.6, strikes: [], ego: 0,
    start(b, tg, r) { b.tauntKind = Math.floor(r() * 3); b.say(b.tauntKind === 1 ? LINES.taunt[1] : b.pick(LINES.taunt, r), 2); },
    tick() {}
  };

  // sector/corridor helpers that skip remote proxies the same way the shared ones do (they already only hurt local/bots)
  IgnisVaneBoss.prototype.hitSectorP = function (L, r0, r1, a, half, dmg, label, power, push) { this.damagePlayersInSector(L, this.x, this.y, r0, r1, a, half, dmg, label, power, push); };
  IgnisVaneBoss.prototype.hitCorridorP = function (L, x, y, a, len, hw, dmg, label, power, push) { this.damagePlayersInCorridor(L, x, y, a, len, hw, dmg, label, power, push); };

  IgnisVaneBoss.PATS = PATS;
  IgnisVaneBoss.WHEEL = WHEEL;
  IgnisVaneBoss.wheelBlade = { angle: bladeAngle, half: bladeHalf };
  IgnisVaneBoss.LINES = LINES;
  window.IgnisVaneBoss = IgnisVaneBoss;

  // ---- Rebuke: her parry table, built from the pattern strikes (the shared install is NOT re-run: that would double-wrap) ----
  if (window.RebukeBoss) {
    const pats = {};
    for (const k in PATS) {
      const d = PATS[k];
      if (d.strikes && d.strikes.length) pats[k] = d.strikes.map(([sec, o]) => Object.assign({ t: sec / d.dur }, o || {}));
    }
    IgnisVaneBoss.prototype.rebukeData = Object.assign({}, window.RebukeBoss.DEFAULTS, { rate: (b) => b.patRate(), patterns: pats });
  }

  // ---- her voice: only her own ig_* clips play while she is the boss; Vaelgor's shared-code clips are kept quiet ------------
  if (typeof audio !== 'undefined' && audio && !audio._ignisWrapped) {
    audio._ignisWrapped = true;
    const isIg = () => !!(window.game && window.game.mode === 'raid' && window.game.boss && window.game.boss.isIgnis);
    const oClip = audio.playBossVoiceClip.bind(audio), oVoice = audio.playBossVoice.bind(audio);
    audio.playBossVoiceClip = function (key, ...rest) {
      if (isIg() && !/^ig_/.test(String(key))) { if (key === 'death') window.game.boss.say(LINES.death, 4, true); return; }
      return oClip(key, ...rest);
    };
    audio.playBossVoice = function (...args) { if (isIg()) return; return oVoice(...args); };
  }
})();
