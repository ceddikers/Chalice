// =========================================================================
// MAIN.JS — 2.5D Hub ("Sanctum of Rocheste") & Full Vaelgor Raid Loop
// Integrates Hitstop Freeze, Shoulder-Stance Breaker, Omnislash [T],
// & Vindictus Boss Essence (10%) + 5-Seal Token Redemption System
// =========================================================================

const HUD_SKILL_KEYS = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z', 'space'];
const SKILL_KEYS = new Set(['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z', 'x']);

// Peer-supplied names end up in innerHTML, so they must be escaped.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PRACTICE_BUTTONS = [
  { id: 'btn-practice-clock', flag: 'practiceClockMode', label: '🕰️ Practice Clock', activeLabel: '🕰️ Exit Clock Practice', color: '#c084fc', glow: 'rgba(192, 132, 252, 0.55)' },
  { id: 'btn-practice-final', flag: 'practiceFinalPhaseMode', label: '🌑 Practice Final Phase', activeLabel: '🌑 Exit Final Practice', color: '#f43f5e', glow: 'rgba(244, 63, 94, 0.55)' },
  { id: 'btn-practice-clash', flag: 'practiceFinalClashMode', label: '⚔️ Practice Clash', activeLabel: '⚔️ Exit Clash Practice', color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.55)' }
];

class Game25D {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.camera = new Camera25D();
    this.fx = new ArenaFX(this.camera);
    window.fx = this.fx;

    this.forge = new VindictusForgeSystem();
    this.net = new RaidCoopNetwork(this);

    // World Modes: 'hub' (Sanctum of Rocheste) or 'raid' (Abyssal Eclipse Cathedral)
    this.mode = 'hub';
    this.arenaCenter = { x: 0, y: 0 };
    this.arenaRadius = 520;

    // Local Breaker Player
    this.localPlayer = new BreakerPlayer25D('local_hero', 'Breaker Warden', 0, 140, true, false);
    this.forge.applyEquipmentToPlayer(this.localPlayer);

    // AI Vanguard Bots (Solo Fallback) & Party Roster
    this.aiBots = [];
    this.party = [this.localPlayer];

    // Boss & Hub Training Dummy
    this.boss = new VaelgorRaidBoss(0, -85);
    this.hubDummy = {
      x: 255,
      y: 25,
      hp: 999999,
      maxHp: 999999,
      stagger: 0,
      maxStagger: 500,
      flinch: 0,
      maxFlinch: 210,
      fractureStacks: 0,
      facingAngle: Math.PI,
      state: 'idle',
      isCounterable: () => false,
      hasSuperArmor: () => false,
      lockInPlaceForUltimate: () => {},
      checkPlayerHitAnchors: () => false,
      receiveDamage: (dmg) => {
        this.hubDummy.lastDmg = dmg;
        this.hubDummy.shake = 0.22;
      },
      shake: 0
    };

    // Interactive Hub Stations
    this.hubStations = [
      {
        id: 'forge',
        name: '🔨 FERGUS\'S BLACKSMITH FORGE',
        subtitle: 'Craft Boss Sets & Redeem 5 Eclipse Seals -> 1 Essence [Click / G]',
        x: -245,
        y: -35,
        radius: 68,
        color: '#fb923c'
      },
      {
        id: 'portal',
        name: '🌑 CHALICE GATE',
        subtitle: 'Choose a raid and difficulty [Click]',
        x: 0,
        y: -215,
        radius: 82,
        color: '#f43f5e'
      },
      {
        id: 'coop_board',
        name: '🛡️ MERCENARY CO-OP & AI BOARD',
        subtitle: 'Host or join a co-op room [Click / C]',
        x: -210,
        y: 135,
        radius: 60,
        color: '#38bdf8'
      },
      {
        id: 'dummy',
        name: '⚔️ BREAKER TRAINING DUMMY',
        subtitle: 'Test Q Shoulder Pose, W Earthbreaker & T Omnislash',
        x: 255,
        y: 25,
        radius: 54,
        color: '#facc15'
      }
    ];

    this.mouseScreenX = window.innerWidth * 0.5;
    this.mouseScreenY = window.innerHeight * 0.5;
    this.mouseWorldX = 0;
    this.mouseWorldY = 0;
    this.rightMouseDown = false;
    this.leftMouseDown = false;
    this.keysDown = new Set();

    this.raidVictoryShown = false;
    this.lastTime = performance.now();

    this.playerClass = 'breaker';
    this.resize();
    this.bindEvents();
    this.rebuildPartyRoster();
    if (window.SkillHud) { this._hud = null; window.SkillHud.build(this.localPlayer); }
    this.updateAllUI();

    requestAnimationFrame((t) => this.loop(t));
    this._startBackgroundTicker();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // Swap the local player's class (hub only). Rebuilds the party roster and the class-driven skill HUD.
  setPlayerClass(classId) {
    if (this.mode !== 'hub' || classId === this.playerClass) return;
    const old = this.localPlayer;
    const isHammer = classId === 'hammer';
    const isReaper = classId === 'reaper';
    const isArclight = classId === 'arclight';
    const isUnbound = classId === 'unbound';
    const Cls = isUnbound ? UnboundPlayer25D : isArclight ? ArclightPlayer25D : (isReaper ? ReaperPlayer25D : (isHammer ? HammerPlayer25D : BreakerPlayer25D));
    // Keep the network id (the PeerJS id) when swapping after hosting/joining; 'local_hero' would collide with the remote's copy of us.
    const np = new Cls(old.id || 'local_hero', this.playerName || (isUnbound ? 'Unbound' : isArclight ? 'Arclight' : (isReaper ? 'Reaper' : (isHammer ? 'Gravebreaker' : 'Breaker Warden'))), old.x, old.y, true, false);
    np.facingAngle = old.facingAngle;
    np.look = old.look;
    this.forge.applyEquipmentToPlayer(np);
    this.localPlayer = np;
    this.playerClass = classId;
    this.rebuildPartyRoster();
    this._hud = null;
    if (window.SkillHud) window.SkillHud.build(np);
    this.renderForgeModal();   // the forge shows this class's weapons
    if (this.fx) this.fx.addFloatingText(np.x, np.y - 80, isUnbound ? '✋ UNBOUND (LIMITER BRACERS)' : isArclight ? '🔷 ARCLIGHT (EXO-SUIT)' : isReaper ? '🩸 REAPER (CHAIN SCYTHE)' : (isHammer ? '🔨 GRAVEBREAKER (CHARGE HAMMER)' : '⚔️ BREAKER (GREATSWORD)'), '#fde047', 15);
  }

  toggleClass() {
    const order = ['breaker', 'hammer', 'reaper', 'arclight', 'unbound'];
    this.setPlayerClass(order[(order.indexOf(this.playerClass) + 1) % order.length]);
  }

  rebuildPartyRoster() {
    this.party = [this.localPlayer];
    this.ghosts = [];     // players who dropped mid-raid: a standing stand-in only, the boss and the mechanics ignore it
    // a solo-only raid (Hush): friends who connect mid-fight stay out of it, and no AI comrades come along
    const soloRaid = this.mode === 'raid' && this.boss && this.boss.soloOnly;
    for (const remote of (soloRaid ? [] : this.net.remotePlayers.values())) {
      if (remote.ghost) this.ghosts.push(remote);
      else this.party.push(remote);
    }

    this.aiBots = [];
    const botConfigs = [
      { name: 'Sir Kaelen (AI Vanguard)', model: 'vaelgor_obsidian', color: '#f43f5e' },
      { name: 'Brynja (AI Breaker)', model: 'black_sun_sovereign', color: '#c084fc' },
      { name: 'Thoran (AI Warden)', model: 'warden_steel', color: '#38bdf8' }
    ];
    // AI bots are simulated locally per client, so they only exist in offline solo play (each peer would otherwise spawn its own unsynced bots).
    const botCount = (this.net.isConnected() || soloRaid) ? 0 : this.net.soloAiCount;
    for (let i = 0; i < botCount; i++) {
      if (this.party.length >= 4) break;
      const angle = (i + 1) * 1.1;
      const cfg = botConfigs[i % botConfigs.length];
      const bot = new BreakerPlayer25D(
        `ai_bot_${i}`,
        cfg.name,
        this.localPlayer.x + Math.cos(angle) * 75,
        this.localPlayer.y + Math.sin(angle) * 75 * PERSPECTIVE_TILT,
        false,
        true
      );
      bot.weaponModelId = cfg.model;
      bot.weaponColor = cfg.color;
      bot.baseAtk = 155;
      this.aiBots.push(bot);
      this.party.push(bot);
    }
    if (this.mode === 'raid' && this.boss && typeof this.boss.applyLobbyScaling === 'function') {
      this.boss.applyLobbyScaling(this.party.length, false);
    }
    this.renderPartyFramesHUD();
  }

  // -------------------------------------------------------------------------
  // MODE SWITCHING: HUB SANCTUM <-> VAELGOR RAID ARENA
  // -------------------------------------------------------------------------
  enterHub(broadcastToPeers = true) {
    // Only the host pulls the whole party back; a guest leaving just leaves locally.
    if (broadcastToPeers && this.net.isHost && this.net.isConnected()) {
      this.net.broadcast({ type: 'enter_hub' });
    }
    this.mode = 'hub';
    this.arenaRadius = 520;
    if (this.net.purgeGhosts) this.net.purgeGhosts();
    if (this.boss) {
      this.boss.practiceClockMode = false;
      this.boss.practiceFinalPhaseMode = false;
      this.boss.practiceFinalClashMode = false;
    }
    this.localPlayer.hp = this.localPlayer.maxHp;
    this.localPlayer.shield = 0;
    if (this.localPlayer.classId === 'hammer') {
      const lp = this.localPlayer;
      lp.act = null; lp.karok = null; lp.hammer.mode = 'held'; lp.jumpZ = 0; lp.hIframes = 0;
      if (lp.state === 'h_act' || lp.state === 'h_clash') lp.state = 'idle';
    } else if (this.localPlayer.classId === 'reaper') this.localPlayer.resetReaper();
    else if (this.localPlayer.classId === 'arclight') this.localPlayer.resetArclight();
    else if (this.localPlayer.classId === 'unbound') this.localPlayer.resetUnbound();
    this.localPlayer.x = 0;
    this.localPlayer.y = 145;
    this.localPlayer.targetX = 0;
    this.localPlayer.targetY = 145;
    this.localPlayer.state = 'idle';
    if (typeof this.localPlayer.clearEclipseQteAndRoot === 'function') this.localPlayer.clearEclipseQteAndRoot();
    if (typeof this.localPlayer.clearClashRhythmQte === 'function') this.localPlayer.clearClashRhythmQte();
    this.localPlayer.snapFeetToBody();
    if (typeof this.localPlayer.resetCapeNodes === 'function') this.localPlayer.resetCapeNodes();

    this.rebuildPartyRoster();
    if (window.updateMechanicHUD) window.updateMechanicHUD(false);
    document.getElementById('boss-hud')?.classList.add('hidden');
    const titleEl = document.getElementById('zone-banner-title');
    if (titleEl) titleEl.textContent = 'SANCTUM OF ROCHESTE — MAIN HUB';
    const subEl = document.getElementById('zone-banner-sub');
    if (subEl) subEl.textContent = 'Visit Fergus\'s Forge to craft Boss Greatswords or redeem 5 Eclipse Seals -> 1 Abyssal Essence';
    document.getElementById('btn-return-hub')?.classList.add('hidden');
    document.getElementById('btn-start-raid-top')?.classList.remove('hidden');
    this.syncPracticeButtons();
    audio.setMusicState('hub');
  }

  // Which raid's boss is live. Each boss is built once and reused; game.boss always points at the current one.
  useRaidBoss(id) {
    const want = (id === 'ignis' && typeof IgnisVaneBoss !== 'undefined') ? 'ignis' : ((id === 'hush' && typeof HushBoss !== 'undefined') ? 'hush' : 'vaelgor');
    this.raidId = want;
    this.bosses = this.bosses || { vaelgor: this.boss };
    if (!this.bosses[want]) this.bosses[want] = want === 'ignis' ? new IgnisVaneBoss(0, -85) : (want === 'hush' ? new HushBoss(0, -85) : new VaelgorRaidBoss(0, -85));
    this.boss = this.bosses[want];
  }

  enterRaidGate(broadcastToPeers = true, startClockPractice = false, startFinalPhasePractice = false, startFinalClashPractice = false) {
    this.mode = 'raid';
    this.raidVictoryShown = false;
    this.arenaRadius = 590;
    // The raid menu picks the raid (raid_select.js sets _pendingRaid); guests take it from the start_raid packet. Practice rooms are Vaelgor's.
    const practiceRoom = startClockPractice || startFinalPhasePractice || startFinalClashPractice;
    if (broadcastToPeers) { this.raidId = this._pendingRaid || this.raidId || 'vaelgor'; this._pendingRaid = null; }
    this.useRaidBoss(practiceRoom ? 'vaelgor' : this.raidId);
    // Skip cutscenes: the host's tick in the raid menu counts for this one raid only (raid_select.js sets _pendingSkip and
    // clears its box); guests take it from the start_raid packet (network_coop.js).
    if (broadcastToPeers) { this.skipCutscenes = !!this._pendingSkip; this._pendingSkip = false; }

    this.forge.applyEquipmentToPlayer(this.localPlayer);
    this.localPlayer.hp = this.localPlayer.maxHp;
    this.localPlayer.shield = 300;
    this.localPlayer.x = 0;
    this.localPlayer.y = 185;
    this.localPlayer.targetX = 0;
    this.localPlayer.targetY = 185;
    this.localPlayer.facingAngle = -Math.PI * 0.5;
    this.localPlayer.bodySpinAngle = 0;
    this.localPlayer.vx = 0;
    this.localPlayer.vy = 0;
    this.localPlayer.kbVx = 0;
    this.localPlayer.kbVy = 0;
    this.localPlayer.speed = 0;
    this.localPlayer.state = 'idle';
    this.localPlayer.overpower = 0;
    this.localPlayer.overpowerSurge = false;
    this.localPlayer.surgeTimer = 0;
    if (this.localPlayer.classId === 'hammer') {
      const lp = this.localPlayer;
      lp.act = null; lp.karok = null; lp.karokSpasm = 0; lp.momentum = 0; lp.overloadTimer = 0; lp.hIframes = 0;
      lp.hammer.mode = 'held'; lp.jumpZ = 0;
    } else if (this.localPlayer.classId === 'reaper') this.localPlayer.resetReaper();
    else if (this.localPlayer.classId === 'arclight') this.localPlayer.resetArclight();
    else if (this.localPlayer.classId === 'unbound') this.localPlayer.resetUnbound();
    if (typeof this.localPlayer.clearEclipseQteAndRoot === 'function') this.localPlayer.clearEclipseQteAndRoot();
    if (typeof this.localPlayer.clearClashRhythmQte === 'function') this.localPlayer.clearClashRhythmQte();
    if (this.localPlayer.cds) {
      for (const k in this.localPlayer.cds) this.localPlayer.cds[k] = 0;
    }
    this.localPlayer.snapFeetToBody();
    if (typeof this.localPlayer.resetCapeNodes === 'function') this.localPlayer.resetCapeNodes();

    this.rebuildPartyRoster();
    for (const member of this.party) {
      if (member && typeof member.resetCapeNodes === 'function') member.resetCapeNodes();
      if (member && typeof member.clearEclipseQteAndRoot === 'function') member.clearEclipseQteAndRoot();
      if (member && typeof member.clearClashRhythmQte === 'function') member.clearClashRhythmQte();
    }
    this.boss.resetBoss(0, -75);
    this.boss.fractureStacks = 0;
    this.boss.applyLobbyScaling(this.party.length, true);

    document.getElementById('boss-hud')?.classList.remove('hidden');
    document.getElementById('btn-return-hub')?.classList.remove('hidden');
    document.getElementById('btn-start-raid-top')?.classList.add('hidden');
    this.closeAllModals();

    if (startClockPractice) {
      this.boss.practiceClockMode = true;
      this.boss.hp = Math.round(this.boss.maxHp * 0.35);
      this.boss.eclipse75Triggered = true;
      this.boss.eclipse55Triggered = true;
      this.boss.eclipse35Triggered = true;
      const titleEl = document.getElementById('zone-banner-title');
      if (titleEl) titleEl.textContent = 'ASTRAL CLOCK PRACTICE ROOM — PHYSICAL SWORD-TELL EDITION';
      const subEl = document.getElementById('zone-banner-sub');
      if (subEl) subEl.textContent = 'Read Vaelgor\'s Sword Swing at each Pointed Hour: Forehand Cleave = +1 CW • Backhand Cleave = -1 CCW • Overhead Impale = 180° Opposite!';
      this.syncPracticeButtons();
      if (broadcastToPeers) {
        this.net.broadcast({ type: 'start_raid', difficulty: this.difficulty, skipIntro: !!this.introSeen, skipCutscenes: !!this.skipCutscenes, raid: this.raidId, clockPractice: true, finalPhasePractice: false, finalClashPractice: false });
      }
      audio.setMusicState('mechanic');
      this.boss.triggerMechanicHorizon(false);
      if (this.fx) {
        this.fx.addFloatingText(this.localPlayer.x, this.localPlayer.y - 88, '🕰️ CLOCK PRACTICE MODE: READ VAELGOR\'S PHYSICAL SWORD SWINGS!', '#c084fc', 15);
      }
      return;
    }

    if (startFinalPhasePractice) {
      this.boss.practiceFinalPhaseMode = true;
      this.boss.hp = Math.max(2, Math.round(this.boss.maxHp * 0.102));
      this.boss.awakened = true;
      this.boss.eclipse75Triggered = true;
      this.boss.eclipse55Triggered = true;
      this.boss.eclipse35Triggered = true;
      this.boss.eclipse10Triggered = false;
      this.boss.finalTransitionPending = false;
      this.boss.finalTransitionActive = false;
      this.boss.finalPhaseArena = false;
      this.boss.arenaWhiteoutAlpha = 0;
      this.boss.arenaWhiteoutClimaxDone = false;
      this.boss.state = 'idle';
      this.boss.aiCooldown = 1.1;
      const titleEl = document.getElementById('zone-banner-title');
      if (titleEl) titleEl.textContent = 'PALE ECLIPSE END-SEQUENCE PRACTICE — 10% TRANSITION & 15% CLASH';
      const subEl = document.getElementById('zone-banner-sub');
      if (subEl) subEl.textContent = '10% HP Transition (3x Counters -> 5-Key QTE & Spirit Bomb -> Sword Absorb) -> Awakens Near 15% HP for Final Clash [G]!';
      this.syncPracticeButtons();
      if (broadcastToPeers) {
        this.net.broadcast({ type: 'start_raid', difficulty: this.difficulty, skipIntro: !!this.introSeen, skipCutscenes: !!this.skipCutscenes, raid: this.raidId, clockPractice: false, finalPhasePractice: true, finalClashPractice: false });
      }
      audio.setMusicState('phase2');
      if (this.fx) {
        this.fx.addFloatingText(this.localPlayer.x, this.localPlayer.y - 88, '🌑 END SEQUENCE PRACTICE: STRIKE VAELGOR TO TRIGGER 10% TRANSITION -> 15% FINAL CLASH!', '#38bdf8', 15);
      }
      return;
    }

    if (startFinalClashPractice) {
      this.boss.practiceFinalClashMode = true;
      this.boss.awakened = true;
      this.boss.eclipse75Triggered = true;
      this.boss.eclipse55Triggered = true;
      this.boss.eclipse35Triggered = true;
      this.boss.eclipse10Triggered = true;
      this.boss.finalTransitionPending = false;
      this.boss.finalTransitionActive = false;
      this.boss.finalPhaseArena = true;
      this.boss.finalPhase = true;
      this.boss.swordEmpowered = true;
      this.boss.eclipseBodyTransformProg = 1.0;
      this.boss.hp = Math.max(2, Math.round(this.boss.maxHp * 0.148));
      this.boss.finalClash15Triggered = false;
      this.boss.finalClashPending = true;
      this.boss.aiCooldown = 0.75;
      const titleEl = document.getElementById('zone-banner-title');
      if (titleEl) titleEl.textContent = 'ECLIPSE SOVEREIGN CLASH PRACTICE — 15% HP FINAL CLIMAX';
      const subEl = document.getElementById('zone-banner-sub');
      if (subEl) subEl.textContent = 'Follow the Dark Trail -> Stand in the Small Blue Circle in front of Vaelgor & Press [G] within 3s -> Complete 6-Beat Rhythm QTE!';
      this.syncPracticeButtons();
      if (broadcastToPeers) {
        this.net.broadcast({ type: 'start_raid', difficulty: this.difficulty, skipIntro: !!this.introSeen, skipCutscenes: !!this.skipCutscenes, raid: this.raidId, clockPractice: false, finalPhasePractice: false, finalClashPractice: true });
      }
      audio.setMusicState('phase2');
      if (this.fx) {
        this.fx.addFloatingText(this.localPlayer.x, this.localPlayer.y - 88, '⚔️ WATCH VAELGOR TELEPORT BEHIND YOU -> STAND IN BLUE CIRCLE & PRESS [G]!', '#38bdf8', 16);
      }
      return;
    }

    const titleEl = document.getElementById('zone-banner-title');
    const isIgnis = this.raidId === 'ignis';
    const isHush = this.raidId === 'hush';
    if (titleEl) titleEl.textContent = isHush ? 'THE SEALED NURSERY — HUSH CHALICE RAID (SOLO)' : (isIgnis ? 'THE GILDED PYRE — IGNIS VANE CHALICE RAID' : 'ABYSSAL CATHEDRAL — VAELGOR CHALICE RAID');
    const subEl = document.getElementById('zone-banner-sub');
    if (subEl) subEl.textContent = isHush ? 'Break her key and her mask for bonus cores • Solo raid' : isIgnis ? 'Break her fan and her crown for bonus cores • Keep her ego in check' : '10% Vaelgor\'s Abyssal Essence Drop • 100% Guaranteed Eclipse Seal Token • Break Pauldron for Bonus Fragment!';
    this.syncPracticeButtons();

    if (broadcastToPeers) {
      this.net.broadcast({ type: 'start_raid', difficulty: this.difficulty, skipIntro: !!this.introSeen, skipCutscenes: !!this.skipCutscenes, raid: this.raidId, clockPractice: false, finalPhasePractice: false, finalClashPractice: false });
    }

    audio.setMusicState('cutscene');
    this.boss.triggerIntroCutscene();
  }

  toggleClockPracticeRoom() {
    // If in Hub or not currently in Clock Practice Mode, jump straight into the Clock Practice Room!
    if (this.mode !== 'raid' || !this.boss.practiceClockMode) {
      this.enterRaidGate(true, true, false, false);
      return;
    }
    // If already in Clock Practice Mode, toggle back to Hub
    this.enterHub();
  }

  toggleFinalPhasePracticeRoom() {
    // If in Hub or not currently in Final Phase Practice Mode, jump straight into the 10% HP Final Phase Transition!
    if (this.mode !== 'raid' || !this.boss.practiceFinalPhaseMode) {
      this.enterRaidGate(true, false, true, false);
      return;
    }
    // If already in Final Phase Practice Mode, toggle back to Hub
    this.enterHub();
  }

  toggleFinalClashPracticeRoom() {
    // If in Hub or not currently in Final Clash Practice Mode, jump straight into the 15% HP Final Clash!
    if (this.mode !== 'raid' || !this.boss.practiceFinalClashMode) {
      this.enterRaidGate(true, false, false, true);
      return;
    }
    // If already in Final Clash Practice Mode, toggle back to Hub
    this.enterHub();
  }

  syncPracticeButtons() {
    const inRaid = this.mode === 'raid' && this.boss;
    for (const cfg of PRACTICE_BUTTONS) {
      const btn = document.getElementById(cfg.id);
      if (!btn) continue;
      const active = !!(inRaid && this.boss[cfg.flag]);
      const title = btn.querySelector('b');
      (title || btn).textContent = active ? cfg.activeLabel : cfg.label;
      btn.style.borderColor = active ? cfg.color : '';
      btn.style.boxShadow = active ? `0 0 12px ${cfg.glow}` : '';
    }
  }

  // -------------------------------------------------------------------------
  // INPUT & INTERACTION BINDINGS
  // -------------------------------------------------------------------------
  // Maps the physical mouse button to the action it triggers (0 = attack, 2 = move); swapped by the Mouse setting.
  logicalButton(b) {
    if (!this.swapMouse) return b;
    return b === 0 ? 2 : (b === 2 ? 0 : b);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseScreenX = e.clientX;
      this.mouseScreenY = e.clientY;
      const w = this.camera.screenToWorld(e.clientX, e.clientY, this.canvas.width, this.canvas.height);
      this.mouseWorldX = w.x;
      this.mouseWorldY = w.y;

      if (this.rightMouseDown) {
        this.localPlayer.setMoveTarget(this.mouseWorldX, this.mouseWorldY);
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      audio.init();
      const w = this.camera.screenToWorld(e.clientX, e.clientY, this.canvas.width, this.canvas.height);
      this.mouseWorldX = w.x;
      this.mouseWorldY = w.y;

      // Setting: swap the buttons so left-click moves and right-click attacks. The physical left button still opens hub stations.
      const btn = this.logicalButton(e.button);
      if (this.swapMouse && e.button === 0 && this.mode === 'hub') {
        for (const st of this.hubStations) {
          if (Math.hypot(w.x - st.x, w.y - st.y) < st.radius + 15) { this.interactWithStation(st.id); return; }
        }
      }
      if (btn === 2) {
        this.rightMouseDown = true;
        if (typeof this.localPlayer.rightClickCancel === 'function') this.localPlayer.rightClickCancel();   // Gravebreaker: right-click leaves the [F] barrage
        this.localPlayer.setMoveTarget(w.x, w.y);
        this.fx.addMoveOrder(w.x, w.y, '#22c55e');
      } else if (btn === 0) {
        this.leftMouseDown = true;

        if (this.mode === 'hub') {
          for (const st of this.hubStations) {
            if (Math.hypot(w.x - st.x, w.y - st.y) < st.radius + 15) {
              this.interactWithStation(st.id);
              return;
            }
          }
        }

        // Karok Clash tug-of-war: left clicks push the meter instead of attacking.
        if (typeof this.localPlayer.onClashClick === 'function' && this.localPlayer.onClashClick()) return;

        if (this.localPlayer.triggerBasicAttack(w.x, w.y)) {
          this.net.broadcast({ type: 'player_skill', skill: 'basic', aimX: w.x, aimY: w.y });
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      const btn = this.logicalButton(e.button);
      if (btn === 2) this.rightMouseDown = false;
      if (btn === 0) this.leftMouseDown = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -0.10;
      this.camera.targetZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.targetZoom + delta));
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (window.CharSelect && window.CharSelect.isOpen()) return;   // the class screen owns the keyboard
      audio.init();
      // Skill keys can be rebound (settings_plus.js): `raw` is the physical key, `k` the skill it triggers ('' = unbound).
      const raw = e.key.toLowerCase();
      const k = window.Keybinds ? window.Keybinds.map(raw) : (raw === ' ' ? 'space' : raw);
      if (!k) return;
      this.keysDown.add(k === 'space' ? ' ' : k);

      // 1. Intercept ONLY [W] and [E] for the 15% HP Final Clash Rhythm-Game QTE! (these prompts name physical keys)
      if (this.localPlayer && this.localPlayer.clashQteActive && typeof this.localPlayer.handleClashRhythmKey === 'function') {
        if (['w', 'e'].includes(raw)) {
          e.preventDefault();
          this.localPlayer.handleClashRhythmKey(raw, this.boss);
        }
        return;
      }

      // 1b. Charge Hammer: [G] answers Vaelgor's clashable getsuga (Karok Clash). Never overlaps the Final Clash circle.
      if (
        k === 'g' && !e.repeat &&
        this.mode === 'raid' && this.boss &&
        this.localPlayer.classId === 'hammer' &&
        typeof this.boss.startKarokClash === 'function' &&
        this.boss.canPlayerKarokClash(this.localPlayer)
      ) {
        e.preventDefault();
        this.boss.startKarokClash(this.localPlayer);
        return;
      }
      if (this.localPlayer && this.localPlayer.karok && this.localPlayer.karok.active) {
        e.preventDefault();
        if (k === 'g' && !e.repeat && typeof this.localPlayer.onClashClick === 'function') this.localPlayer.onClashClick(true);   // mash [G]
        return;
      }

      // 2. Intercept [G] in Raid Mode to initiate the 15% HP Final Clash when standing in the blue circle!
      if (
        k === 'g' &&
        this.mode === 'raid' &&
        this.boss &&
        typeof this.boss.canPlayerInitiateClash === 'function' &&
        this.boss.canPlayerInitiateClash(this.localPlayer)
      ) {
        e.preventDefault();
        this.boss.initiateFinalClash(this.localPlayer, false);
        return;
      }

      // 3. Intercept Q/W/E/R for the 5-Button Final Phase Typing QTE!
      if (this.localPlayer && this.localPlayer.qteActive) {
        if (['q', 'w', 'e', 'r'].includes(raw)) {
          e.preventDefault();
          this.localPlayer.handleEclipseQteKey(raw);
        }
        return;
      }

      if (this.localPlayer && this.localPlayer.rooted) {
        if (k === 'g' && this.mode === 'hub') this.toggleModal('forge-modal');
        if (k === 'c' && this.mode === 'hub') this.toggleModal('coop-modal');
        return;
      }

      if (k === 'space') {
        e.preventDefault();
        this.useSkill('space');
        return;
      }

      if (k === 'x' && this.localPlayer.classId !== 'hammer' && this.localPlayer.classId !== 'arclight') return;   // [X]: the Gravebreaker's Overload / the Arclight's mode swap
      if (SKILL_KEYS.has(k)) {
        // Hammer skills that are "tap to spam / confirm" shouldn't fire on OS key-repeat.
        if (e.repeat && typeof this.localPlayer.noKeyRepeat === 'function' && this.localPlayer.noKeyRepeat(k)) return;
        this.useSkill(k);
      }

      if (k === 'g' && this.mode === 'hub') this.toggleModal('forge-modal');
      if (k === 'c' && this.mode === 'hub') this.toggleModal('coop-modal');
      if (k === 'p' && !e.repeat) this.toggleDevMenu();
      if (k === 'escape') this.closeAllModals();
    });

    window.addEventListener('keyup', (e) => {
      const raw = e.key.toLowerCase();
      const k = window.Keybinds ? window.Keybinds.map(raw) : (raw === ' ' ? 'space' : raw);
      if (!k) return;
      this.keysDown.delete(k === 'space' ? ' ' : k);
      if (this.localPlayer && typeof this.localPlayer.releaseSkill === 'function') {
        this.localPlayer.releaseSkill(k);
      }
    });
  }

  // Single entry point for local skill casts (keyboard + hotbar clicks) so every successful cast reaches peers.
  useSkill(k, fromBuffer = false) {
    const lp = this.localPlayer;
    if (lp.triggerSkill(k, this.mouseWorldX, this.mouseWorldY, this.getActiveBossTarget())) {
      this.net.broadcast({ type: 'player_skill', skill: k, aimX: this.mouseWorldX, aimY: this.mouseWorldY, shift: this.keysDown.has('shift') });
      return true;
    }
    // Input buffer: a skill pressed a hair early (while the last move is still finishing) is remembered for 0.35s and fires the
    // moment the character can act, so chains feel instant instead of eating presses. Hold-to-charge keys (R), the spammed [F],
    // the counter [D] and the Reaper's [Q] (which has its own buffer) are left out.
    if (!fromBuffer && lp.hp > 0 && 'qweas'.includes(k) && !(lp.classId === 'reaper' && k === 'q') && !(lp.classId === 'hammer' && k === 'q')) {
      const cd = (lp.cds && lp.cds[k]) || 0;
      if (cd <= 0.15 && (lp.act || !lp.canAct())) this._skillBuf = { k, t: 0.35 };
    }
    return false;
  }

  // retry the buffered skill each frame until it fires or expires
  tickSkillBuffer(dt) {
    const b = this._skillBuf;
    if (!b) return;
    const lp = this.localPlayer;
    b.t -= dt;
    if (b.t <= 0 || !lp || lp.hp <= 0) { this._skillBuf = null; return; }
    const ready = !(lp.cds && lp.cds[b.k] > 0) && (lp.canAct() || (typeof lp.skillCancelReady === 'function' && lp.act && lp.skillCancelReady()));
    if (!ready) return;
    this._skillBuf = null;
    this.useSkill(b.k, true);
  }

  getActiveBossTarget() {
    return this.mode === 'raid' ? this.boss : this.hubDummy;
  }

  interactWithStation(stationId) {
    if (stationId === 'forge') this.openModal('forge-modal');
    else if (stationId === 'portal') this.openRaidSelect();
    else if (stationId === 'clock_practice') this.enterRaidGate(true, true, false, false);
    else if (stationId === 'final_phase_practice') this.enterRaidGate(true, false, true, false);
    else if (stationId === 'final_clash_practice') this.enterRaidGate(true, false, false, true);
    else if (stationId === 'coop_board') this.openModal('coop-modal');
  }

  // -------------------------------------------------------------------------
  // MODAL & VINDICTUS FORGE UI MANAGEMENT
  // -------------------------------------------------------------------------
  toggleAllyVfx() {
    const nextState = !(this.fx && this.fx.showAllyVfx !== false);
    if (this.fx && typeof this.fx.setShowAllyVfx === 'function') {
      this.fx.setShowAllyVfx(nextState);
    }
    this.syncAllyVfxButtons();
  }

  syncAllyVfxButtons() {
    const enabled = !(this.fx && this.fx.showAllyVfx === false);
    const topBtn = document.getElementById('btn-toggle-ally-vfx');
    if (topBtn) {
      topBtn.textContent = enabled ? '✨ Ally VFX: ON' : '🚫 Ally VFX: OFF';
      topBtn.style.opacity = enabled ? '1' : '0.78';
    }
    const modalBtn = document.getElementById('btn-toggle-ally-vfx-modal');
    if (modalBtn) {
      modalBtn.textContent = enabled ? '✨ Ally VFX: ON' : '🚫 Ally VFX: OFF';
    }
  }

  // Secret practice menu ([P]): solo only. Once anyone is connected the key does nothing, so a guest (or a host with a
  // party) can never open it or pull a lobby into a practice room by accident.
  toggleDevMenu() {
    if (this.net.isConnected() || this.mode !== 'hub') return;
    if (window.CharSelect && window.CharSelect.isOpen()) return;
    this.toggleModal('dev-modal');
  }

  openModal(id) {
    this.closeAllModals();
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    this.updateAllUI();
  }

  closeAllModals() {
    document.querySelectorAll('.modal-window').forEach(el => el.classList.add('hidden'));
  }

  toggleModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isHidden = el.classList.contains('hidden');
    this.closeAllModals();
    if (isHidden) {
      el.classList.remove('hidden');
      this.updateAllUI();
    }
  }

  updateAllUI() {
    this.forge.applyEquipmentToPlayer(this.localPlayer);
    this.renderForgeModal();
    this.renderPartyFramesHUD();
    this.syncAllyVfxButtons();
    this.syncPracticeButtons();
  }

  renderForgeModal() {
    const st = this.forge.state;
    const cls = this.playerClass || 'breaker';
    const forClass = (x) => (x.slot !== 'weapon') || ((x.classId || 'breaker') === cls);   // weapons are per class, armor is shared
    const wpn = this.forge.getEquippedWeapon(cls);
    const arm = this.forge.getEquippedArmor();
    const seals = st.materials.vaelgor_seal || 0;
    const synthLabel = document.getElementById('forge-synth-label');
    const MATS = {
      vaelgor_seal: ['<img class="mat-ico" src="game/icons/mat_seal.png" alt="">', 'Eclipse Seal'],
      vaelgor_essence: ['<img class="mat-ico" src="game/icons/mat_essence.png" alt="">', 'Abyssal Essence'],
      obsidian_shard: ['<img class="mat-ico" src="game/icons/mat_shard.png" alt="">', 'Obsidian Shard'],
      pauldron_fragment: ['<img class="mat-ico" src="game/icons/mat_fragment.png" alt="">', 'Pauldron Fragment'],
      porcelain_shard: ['<img class="mat-ico" src="game/icons/mat_porcelain.png" alt="">', 'Porcelain Shard'],
      lullaby_thread: ['<img class="mat-ico" src="game/icons/mat_thread.png" alt="">', 'Lullaby Thread'],
      music_box_heart: ['<img class="mat-ico" src="game/icons/mat_heart.png" alt="">', 'Music-Box Heart']
    };
    const tierClass = (t) => (/Tier 4/.test(t) ? 't4' : /Tier 3/.test(t) ? 't3' : /Tier 2/.test(t) ? 't2' : 't1');

    const matBar = document.getElementById('forge-materials-bar');
    if (matBar) {
      matBar.innerHTML = `<div class="cur gold" data-tip="mat:gold"><span><img class="mat-ico" src="game/icons/mat_gold.png" alt=""></span><b>${st.gold.toLocaleString()}</b></div>` +
        Object.entries(MATS).map(([k, [icon, name]]) => {
          const n = st.materials[k] || 0;
          return `<div class="cur" data-tip="mat:${k}"><span>${icon}</span><b>${k === 'vaelgor_seal' ? n + '/5' : n}</b></div>`;
        }).join('');
    }

    // Equipped gear + the seal exchange
    const eqBox = document.getElementById('forge-equipped-card');
    if (eqBox && wpn) {
      const canRedeem = seals >= 5;
      const pct = Math.min(100, Math.round((seals / 5) * 100));
      eqBox.innerHTML = `
        <div class="eq-weapon">
          <div class="eq-icon">${window.GearIcons ? window.GearIcons.html(wpn) : '🗡️'}</div>
          <div class="eq-names"><div class="eq-title">${wpn.name}</div><div class="eq-tier ${tierClass(wpn.tier)}">${wpn.tier}</div></div>
        </div>
        <div class="stat-grid">
          <div class="stat"><i>ATK</i><b>${this.localPlayer.getTotalAtk()}</b></div>
          <div class="stat"><i>CRIT</i><b>${Math.round(this.localPlayer.critRate * 100)}%</b></div>
          <div class="stat"><i>HP</i><b>${this.localPlayer.maxHp}</b></div>
          <div class="stat"><i>DEF</i><b>${this.localPlayer.bonusDef}</b></div>
        </div>
        <div class="eq-armor">${window.GearIcons && arm ? window.GearIcons.html(arm, 'acc-ico sm') : '🛡️'} ${arm ? arm.name : 'No armor equipped'}</div>
        <div class="redeem-card">
          <div class="redeem-top"><span>Seal Exchange</span><b>${seals}/5</b></div>
          <div class="redeem-bar"><div style="width:${pct}%"></div></div>
          <button class="forge-action-btn ${canRedeem ? '' : 'disabled'}" onclick="window.game.handleRedeemSealsClick()">5 Seals ➔ 1 Abyssal Essence</button>
          <div class="redeem-note">A guaranteed route to an Essence, so the drop never leaves you stuck.</div>
        </div>
      `;
    }

    // tabs keep the forge from showing everything at once
    const isAccSlot = (s) => s === 'ring' || s === 'necklace' || s === 'charm';
    const A = window.Accessories;
    const tab = this.forgeTab || 'weapon';
    const ownedItems = st.inventory.filter(forClass);
    const TABS = [['weapon', 'Weapons'], ['armor', 'Armor'], ['acc', 'Accessories'], ['enhance', 'Enhance ✦'], ['reforge', 'Reroll & Upgrade']];
    if (tab === 'enhance' || tab === 'owned') { this.forgeTab = 'weapon'; if (tab === 'enhance' && window.EnhanceHub) setTimeout(() => window.EnhanceHub.open(), 0); return this.renderForgeModal(); }
    const tabsEl = document.getElementById('forge-tabs');
    if (tabsEl) tabsEl.innerHTML = TABS.map(([k, n]) => `<button class="ft-tab ${tab === k ? 'on' : ''}" onclick="window.game.setForgeTab('${k}')">${n}</button>`).join('');
    if (synthLabel) {
      const lbl = { weapon: (cls === 'unbound' ? 'Unbound limiter bracers' : cls === 'arclight' ? 'Arclight laser sabers' : cls === 'reaper' ? 'Reaper chain-scythes' : (cls === 'hammer' ? 'Gravebreaker hammers' : 'Breaker greatswords')), armor: 'Armor, shared by all classes', acc: 'Each one rolls a rarity and stat lines when forged. Stat lines add up; the same passive worn twice does not stack', reforge: 'Reroll Legendary lines, upgrade accessory rarity' }[tab];
      synthLabel.innerHTML = `${TABS.find(t => t[0] === tab)[1].replace(/ \(\d+\)/, '')} <small>${lbl}</small>`;
    }

    const recipeList = document.getElementById('forge-recipes-list');
    const invList = document.getElementById('forge-inventory-list');
    if (recipeList) recipeList.classList.toggle('hidden', tab === 'owned' || tab === 'reforge');
    const rfEl = document.getElementById('forge-reforge');
    if (rfEl) { rfEl.classList.toggle('hidden', tab !== 'reforge'); if (tab === 'reforge' && window.Reforge) window.Reforge.render(this, rfEl); }
    if (invList) invList.classList.toggle('hidden', tab !== 'owned');
    if (recipeList && tab !== 'owned' && tab !== 'reforge') {
      const want = (r) => tab === 'weapon' ? r.slot === 'weapon' : tab === 'armor' ? r.slot === 'armor' : isAccSlot(r.slot);
      recipeList.innerHTML = VINDICTUS_RECIPES.filter(forClass).filter(want).map(r => {
        const canCraft = this.forge.canCraftRecipe(r);
        const owned = st.inventory.filter(i => i.recipeId === r.id).length;
        const reqs = Object.entries(r.materials).map(([k, req]) => {
          const have = st.materials[k] || 0;
          const m = MATS[k] || ['•', k];
          return `<span class="req-tag ${have >= req ? 'ok' : 'missing'}" data-tip="mat:${k}">${m[0]} ${have}/${req}</span>`;
        }).join('');
        const goldOk = st.gold >= r.costGold;
        const acc = isAccSlot(r.slot);
        const stats = r.slot === 'weapon'
          ? [`ATK ${r.baseAtk}`, `CRIT +${Math.round((r.critBonus || 0) * 100)}%`, `SPD +${Math.round((r.atkSpeedBonus || 0) * 100)}%`]
          : (r.slot === 'armor' ? [`HP +${r.bonusHp}`, `DEF +${r.bonusDef}`] : [r.slot.toUpperCase()]);
        let odds = '';
        if (acc && A) {
          const tot = A.RARITY.reduce((n, x) => n + x.w, 0);
          odds = `<div class="acc-odds">${A.RARITY.map(x => `<span style="--c:${x.color}" title="${x.lines} stat line${x.lines === 1 ? '' : 's'}"><i></i>${Math.round(x.w / tot * 100)}%</span>`).join('')}</div>`;
        }
        const ico = acc ? `<img class="acc-ico" src="${A ? A.icon(r.slot, 'common') : ''}" alt="">` : (window.GearIcons ? window.GearIcons.html(r) : (r.slot === 'weapon' ? '🗡️' : '🛡️'));
        return `
          <div class="recipe-card ${tierClass(r.tier)}" data-tip="rec:${r.id}">
            <div class="recipe-top">
              <div class="recipe-icon">${ico}</div>
              <div class="recipe-titles">
                <div class="recipe-name">${r.name}</div>
                <div class="recipe-tier ${tierClass(r.tier)}">${r.tier}</div>
              </div>
              ${owned ? `<div class="owned-badge">Owned ×${owned}</div>` : ''}
            </div>
            <div class="recipe-stats">${stats.map(s => `<span>${s}</span>`).join('')}</div>
            <div class="recipe-desc">${r.desc}</div>
            ${odds}
            <div class="recipe-src"><b>Where to obtain</b> Forged here, from ${r.source || 'Vaelgor drops'}${r.consumes ? ', using up your ' + ((VINDICTUS_RECIPES.find(x => x.id === r.consumes) || {}).name || 'Tier 3 weapon') : ''}</div>
            <div class="recipe-reqs">${reqs}</div>
            <button class="forge-craft-btn ${canCraft ? '' : 'disabled'}" onclick="window.game.handleCraftClick('${r.id}')">
              ⚒️ ${acc ? 'Forge' : 'Craft'} <span class="cost ${goldOk ? '' : 'short'}"><img class="mat-ico sm" src="game/icons/mat_gold.png" alt=""> ${r.costGold.toLocaleString()}</span>
            </button>
          </div>
        `;
      }).join('');
    }

    if (invList && tab === 'owned') {
      const esc = (x) => String(x == null ? '' : x).replace(/[<>&"]/g, '');
      invList.innerHTML = ownedItems.map(item => {
        const acc = isAccSlot(item.slot);
        const R = acc && A ? A.rarityOf(item) : null;
        const ico = acc && A ? `<img class="acc-ico sm" src="${A.icon(item.slot, R.id)}" alt="">` : (window.GearIcons ? window.GearIcons.html(item, 'acc-ico sm') : (item.slot === 'weapon' ? '🗡️' : '🛡️'));
        const sub = acc && A
          ? `<small style="color:${R.color}">${R.name} ${item.slot}</small>` + (item.lines && item.lines.length ? `<div class="inv-lines">${item.lines.map(l => `<span>${A.lineText(l)}</span>`).join('')}</div>` : '')
          : `<small class="${tierClass(item.tier)}">${item.tier}</small>`;
        return `
        <div class="inv-chip ${item.equipped ? 'equipped' : ''}" ${R ? `style="--rc:${R.color}"` : ''} onclick="window.game.handleEquipItem('${item.uid}')">
          <span class="inv-ico">${ico}</span>
          <span class="inv-txt"><b ${R ? `style="color:${R.color}"` : ''}>${esc(item.name)}${item.enh ? ' +' + item.enh : ''}</b>${sub}</span>
          <em>${item.equipped ? 'Equipped' : 'Equip'}</em>
        </div>`;
      }).join('') || '<div class="redeem-note">Nothing yet. Forge something!</div>';
    }
  }

  setForgeTab(k) { this.forgeTab = k; this.renderForgeModal(); }
  handleRedeemSealsClick() {
    const res = this.forge.redeemSealsForEssence();
    this.setForgeFeedback(res.msg, res.ok);
    this.updateAllUI();
  }

  handleCraftClick(recipeId) {
    const res = this.forge.craftRecipe(recipeId);
    this.setForgeFeedback(res.msg, res.ok);
    this.updateAllUI();
  }

  handleEquipItem(uid) {
    this.forge.equipItem(uid);
    this.setForgeFeedback('Swapped equipped gear — your Breaker\'s 2.5D weapon/armor model updated!', true);
    this.updateAllUI();
  }

  setForgeFeedback(msg, isOk) {
    const el = document.getElementById('forge-feedback-banner');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isOk ? '#fde047' : '#fda4af';
    el.style.borderColor = isOk ? '#eab308' : '#f43f5e';
  }

  renderPartyFramesHUD() {
    const container = document.getElementById('party-frames');
    if (!container) return;
    // Hide party frames in solo mode so only essential UI is visible
    if (this.party.length <= 1) {
      if (this._partyFramesHtml !== '') {
        container.innerHTML = '';
        this._partyFramesHtml = '';
      }
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    const bossTargetId = (this.mode === 'raid' && this.boss) ? this.boss.activeTargetId : null;
    const html = this.party.map(p => {
      const hpPct = Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100)));
      const badge = p.isLocal ? 'YOU' : (p.isBot ? 'AI' : 'CO-OP');
      const isTargeted = (bossTargetId && p.id === bossTargetId && this.party.length > 1);
      return `
        <div class="party-card ${p.hp <= 0 ? 'dead' : ''}" style="${isTargeted ? 'border-color:#f43f5e;box-shadow:0 0 10px rgba(244,63,94,0.35)' : ''}">
          <div class="party-row">
            <span class="party-name">${isTargeted ? '🎯 ' : ''}${escapeHtml(p.name)}</span>
            <span class="party-tag" style="${isTargeted ? 'color:#fda4af' : ''}">${isTargeted ? 'TARGET' : badge}</span>
          </div>
          <div class="party-hp-wrap">
            <div class="party-hp-fill" style="width:${hpPct}%; background:${p.isLocal ? '#22c55e' : '#38bdf8'}"></div>
          </div>
        </div>
      `;
    }).join('');
    // Rebuilding the DOM is costly; skip it when nothing visible changed.
    if (html !== this._partyFramesHtml) {
      container.innerHTML = html;
      this._partyFramesHtml = html;
    }
  }

  // -------------------------------------------------------------------------
  // MAIN GAME LOOP (Includes Hitstop Freeze for Weighty Impacts!)
  // -------------------------------------------------------------------------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    this._rafAt = now;
    this.step(now, true);
  }

  // One simulation step (and, when asked, one draw). The normal loop calls it from requestAnimationFrame.
  step(now, draw) {
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) * 0.001));
    this.lastTime = now;

    // Weighty Hitstop Freeze: Pauses world simulation briefly on heavy slams while camera shake continues!
    if (this.camera.hitstopTimer > 0) {
      this.camera.hitstopTimer = Math.max(0, this.camera.hitstopTimer - rawDt);
      this.camera.update(rawDt, this.localPlayer.x, this.localPlayer.y - 18, this.mouseScreenX, this.mouseScreenY, this.canvas.width, this.canvas.height);
      if (draw) this.safeDraw();
      return;
    }

    try { this.update(rawDt); } catch (e) { this.reportLoopError(e, 'update'); }
    if (draw) this.safeDraw();
  }

  // NO MORE ALT-TAB FREEZE. Browsers stop requestAnimationFrame while the window is hidden, covered or minimised, which froze the whole
  // game (and in co-op, froze you for everyone else). A Worker's timer is not stopped, so it keeps stepping the game in the background
  // whenever the normal loop has gone quiet: the simulation and the network keep running, and the screen is only redrawn now and then.
  _startBackgroundTicker() {
    try {
      const w = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(1)},16)'], { type: 'text/javascript' })));
      w.onmessage = () => this.bgTick(performance.now());
      this._bgWorker = w;
    } catch (e) { /* no workers here: the game simply pauses in the background as before */ }
  }

  bgTick(now) {
    if (now - (this._rafAt || 0) < 100) return;          // the normal frame loop is alive: nothing to do
    this._bgN = (this._bgN || 0) + 1;
    this.step(now, this._bgN % 6 === 0);                 // keep effects ticking with an occasional draw
  }

  // One bad frame must not black the screen out: a throw mid-draw leaves the canvas with unbalanced save() calls, so reset the
  // context (resizing the canvas resets its state) and carry on; the next frame draws normally.
  safeDraw() {
    try { this.draw(); } catch (e) {
      this.reportLoopError(e, 'draw');
      try { this.canvas.width = this.canvas.width; } catch (e2) {}
    }
  }

  reportLoopError(e, where) {
    this._loopErrs = (this._loopErrs || 0) + 1;
    if (this._loopErrs <= 5) console.error('[' + where + ']', e);
  }

  update(dt) {
    this.tickSkillBuffer(dt);
    if (!Number.isFinite(this.mouseScreenX)) this.mouseScreenX = this.canvas.width * 0.5;
    if (!Number.isFinite(this.mouseScreenY)) this.mouseScreenY = this.canvas.height * 0.5;
    const w = this.camera.screenToWorld(this.mouseScreenX, this.mouseScreenY, this.canvas.width, this.canvas.height);
    if (Number.isFinite(w.x) && Number.isFinite(w.y)) { this.mouseWorldX = w.x; this.mouseWorldY = w.y; }
    else if (!Number.isFinite(this.mouseWorldX) || !Number.isFinite(this.mouseWorldY)) { this.mouseWorldX = this.localPlayer.x + 100; this.mouseWorldY = this.localPlayer.y; }

    // Pause player action & AI during the Opening Raid Cutscene, 75% HP Phase 2 Cutscene, and Final Phase Cutscenes!
    const inCutscene = (
      this.mode === 'raid' &&
      this.boss &&
      (
        this.boss.state === 'intro_cutscene' ||
        (this.boss.state === 'eclipse_mechanic' && this.boss.eclipsePhase === 'cutscene') ||
        (this.boss.state === 'final_phase_mechanic' && (this.boss.finalMechPhase === 'arena_cutscene' || this.boss.finalMechPhase === 'sword_absorb_cutscene'))
      )
    );

    if (!inCutscene && this.leftMouseDown && this.localPlayer.canAct()) {
      // Held-click combo swings must reach peers too, not just the initial mousedown swing.
      if (this.localPlayer.triggerBasicAttack(this.mouseWorldX, this.mouseWorldY)) {
        this.net.broadcast({ type: 'player_skill', skill: 'basic', aimX: this.mouseWorldX, aimY: this.mouseWorldY });
      }
    }

    const activeBoss = this.getActiveBossTarget();

    if (!inCutscene) {
      for (const member of this.party) {
        member.update(dt, activeBoss, this.arenaCenter, this.arenaRadius);
      }
      for (const gh of this.ghosts || []) { gh.vx = 0; gh.vy = 0; gh.speed = 0; gh.update(dt, activeBoss, this.arenaCenter, this.arenaRadius); }
    } else {
      for (const member of this.party) {
        if (member && typeof member.updateCapeNodes === 'function') {
          member.vx = 0;
          member.vy = 0;
          member.speed = 0;
          member.breathePhase = (member.breathePhase || 0) + dt * 2.5;
          member.updateCapeNodes(dt);
        }
      }
    }

    for (const ally of this.party) {
      // Hard mode: no teammate revives at all
      // Normal: one revive per person per raid (auto or picked up), see difficulty.js
      if (ally !== this.localPlayer && ally.hp <= 0 && this.localPlayer.hp > 0 && this.canRevive(ally)) {
        if (Math.hypot(ally.x - this.localPlayer.x, ally.y - this.localPlayer.y) < 55) {
          ally.reviveProgress = (ally.reviveProgress || 0) + dt;
          if (ally.reviveProgress >= 1.5) {
            ally.reviveProgress = 0;
            this.spendRevive(ally);                        // a human's own client spends theirs too when the player_revive arrives; their player_state confirms it
            ally.hp = Math.round(ally.maxHp * 0.65);
            ally.state = 'idle';
            // Remote players own their HP, so tell their client they were revived (otherwise their next player_state reverts it).
            if (!ally.isBot) this.net.broadcast({ type: 'player_revive', targetId: ally.id });
            this.fx.addShockwave(ally.x, ally.y, 85, '#22c55e', 4);
            this.fx.addFloatingText(ally.x, ally.y - 68, `✨ REVIVED ${ally.name}!`, '#4ade80', 14);
          }
        }
      }
    }

    if (this.mode === 'raid') {
      this.boss.update(dt, this.party, this.arenaCenter, this.arenaRadius);

      // Dynamic Multi-Phase Soundtrack State Machine
      if (this.boss.hp <= 0) {
        audio.setMusicState('hub');
      } else if (this.camera.cinematicTimer > 0 || inCutscene) {
        audio.setMusicState('cutscene');
      } else if (/_mechanic$/.test(this.boss.state || '') && this.boss.state !== 'final_clash_mechanic') {
        audio.setMusicState('mechanic');
      } else if (this.boss.awakened || this.boss.finalPhase) {
        audio.setMusicState('phase2');
      } else {
        audio.setMusicState('phase1');
      }

      if (this.boss.hp <= 0 && !this.raidVictoryShown) {
        this.raidVictoryShown = true;
        this.onRaidVictory();
      }

      if (this.localPlayer.hp <= 0 && this.canRevive(this.localPlayer)) {   // Hard: you stay down; Normal: once per raid (see difficulty.js)
        this.localPlayer.deadTimer = (this.localPlayer.deadTimer || 0) + dt;
        if (this.localPlayer.deadTimer >= 3.0) {
          this.localPlayer.deadTimer = 0;
          this.spendRevive(this.localPlayer);
          this.localPlayer.hp = this.localPlayer.maxHp;
          this.localPlayer.shield = 400;
          this.localPlayer.state = 'idle';
          this.fx.addPillar(this.localPlayer.x, this.localPlayer.y, 36, '#fde047', 0.7);
          this.fx.addFloatingText(this.localPlayer.x, this.localPlayer.y - 80, '🪶 PHOENIX PLUME REVIVAL!', '#fde047', 16);
        }
      }
    } else {
      audio.setMusicState('hub');
      if (this.hubDummy.shake > 0) this.hubDummy.shake = Math.max(0, this.hubDummy.shake - dt);
    }

    this.fx.update(dt, this.party, activeBoss);

    // Final Clash cinematic camera. Deliberately steady (no left/right swinging): it pushes in on the duel for
    // Vaelgor's opening haymaker, cranes UP the hoisted blade so the greatsword towers over the clasher, then slowly
    // dollies in as each swing falls. Only the clasher gets it; everyone else keeps full control to DPS.
    // The wipe cam is shared: the whole party watches the dark slam.
    let camTargetX = this.localPlayer.x;
    let camTargetY = this.localPlayer.y - 18;
    const spectating = typeof this.getSpectateTarget === 'function' ? this.getSpectateTarget() : null;   // Hard mode, you are down
    if (spectating) { camTargetX = spectating.x; camTargetY = spectating.y - 18; }
    const clashBoss = (this.mode === 'raid' && this.boss && this.boss.state === 'final_clash_mechanic') ? this.boss : null;
    const isLocalClashing = !!(
      clashBoss && clashBoss.clashPhase === 'active_clash' && clashBoss.clashPlayerId === this.localPlayer.id
    );
    const isWipeCam = !!(clashBoss && clashBoss.clashPhase === 'fail_wipe');
    // Karok Clash cinematic camera (Charge Hammer only; everyone else keeps full control)
    const karokCam = (this.mode === 'raid' && typeof window.getKarokCamera === 'function') ? window.getKarokCamera(this.boss, this.localPlayer) : null;
    if (karokCam) {
      if (!this._clashSavedZoom) this._clashSavedZoom = this.camera.targetZoom;
      camTargetX = karokCam.x;
      camTargetY = karokCam.y;
      this.camera.targetZoom = karokCam.zoom;
      this.camera.targetAngle = karokCam.tilt;
    } else if (isLocalClashing || isWipeCam) {
      if (!this._clashSavedZoom) {
        this._clashSavedZoom = this.camera.targetZoom;
      }
      const cl01 = (t) => Math.max(0, Math.min(1, t));
      const eOut = (t) => 1 - Math.pow(1 - t, 3);
      const bs = clashBoss;
      if (isWipeCam) {
        const pre = cl01((bs.clashWipeElapsed || 0) / CLASH_WIPE_SLAM_T);
        camTargetX = bs.x;
        camTargetY = bs.y - 70 - pre * 60;
        this.camera.targetZoom = 1.3 + pre * 0.22;
        this.camera.targetAngle = 0;
      } else {
        const midX = (this.localPlayer.x + bs.x) * 0.5;
        const midY = (this.localPlayer.y + bs.y) * 0.5;
        const style = bs.clashCurrentStyle || 'overhead_crush';
        let up = 60;
        let zoom = 1.5;
        let tilt = 0;
        if (bs.clashIntroT > 0) {
          const ip = cl01(1 - bs.clashIntroT / CLASH_INTRO_DUR);
          if (ip < CLASH_INTRO_IMPACT_P) {
            const k = ip / CLASH_INTRO_IMPACT_P;
            zoom = 1.28 + k * 0.22;
            up = 40;
            tilt = 0.05 * k;
          } else {
            const k = eOut(cl01((ip - CLASH_INTRO_IMPACT_P) / (1 - CLASH_INTRO_IMPACT_P)));
            zoom = 1.5 + k * 0.12;
            up = 40 + k * 78;
            tilt = 0.05 * (1 - k) - 0.04 * k;
          }
        } else {
          const tt = cl01((bs.clashSubProgress || 0) / CLASH_CONTACT_PROG);
          const big = style === 'extinction_drive' ? 1 : 0;
          // Looking up at the hoisted blade, easing down toward the clash as it falls
          up = (style === 'follow_down' ? 95 : 118 + big * 26) - tt * 52;
          zoom = 1.58 + big * 0.05 + tt * 0.08;
          tilt = style === 'slash_left' ? 0.03 : (style === 'slash_right' ? -0.03 : -0.04);
        }
        camTargetX = midX + (bs.x - midX) * 0.25;
        camTargetY = midY - up;
        this.camera.targetZoom = Math.min(1.74, zoom);
        this.camera.targetAngle = tilt;
      }
    } else {
      if (this._clashSavedZoom) {
        this.camera.targetZoom = this._clashSavedZoom;
        this._clashSavedZoom = null;
      }
      this.camera.targetAngle = 0;
    }

    this.camera.update(
      dt,
      camTargetX,
      camTargetY,
      this.mouseScreenX,
      this.mouseScreenY,
      this.canvas.width,
      this.canvas.height,
      isLocalClashing || isWipeCam || !!karokCam
    );
    if (window.Cores) window.Cores.update(dt, this);
    this.net.update(dt);

    this.updateRealtimeHUD();
  }

  onRaidVictory() {
    if (window.updateMechanicHUD) window.updateMechanicHUD(false);
    audio.playImpactBoom(1.8);
    audio.playForgeAnvil(true);
    audio.playBossVoiceClip('death', 0.98, true);
    this.fx.triggerShake(24, 0.7);
    this.fx.addPillar(this.boss.x, this.boss.y, 75, '#facc15', 1.2);
    this.fx.addShockwave(this.boss.x, this.boss.y, 320, '#facc15', 8);

    // The boss bursts into cores (cores.js). Walk over yours to collect them; the summary opens once they're all in.
    const b = this.boss;
    const practice = !!(b && (b.practiceClockMode || b.practiceFinalPhaseMode || b.practiceFinalClashMode));
    const mode = this.isHard() ? 'hard' : 'normal';
    // first clears are tracked per raid (Vaelgor keeps the plain 'normal' / 'hard' keys from before)
    const first = practice ? false : this.forge.registerClear(this.raidId && this.raidId !== 'vaelgor' ? this.raidId + '_' + mode : mode);
    const bonus = first ? ((window.RaidSelect && window.RaidSelect.FIRST_CLEAR_BONUS[mode]) || 0) : 0;
    this.lastClear = { mode, first, bonus, practice };
    if (window.RaidStats) window.RaidStats.finish(this);
    if (window.Cores) window.Cores.onVictory(this);
    else this.showVictoryModal({ gold: 0, vaelgor_seal: 0, vaelgor_essence: 0, obsidian_shard: 0, pauldron_fragment: 0, breakCores: [], essenceRollPct: null });
  }

  showVictoryModal(t) {
    this._lastTally = t;
    const modal = document.getElementById('victory-modal');
    const summary = document.getElementById('victory-loot-summary');
    const totalSeals = this.forge.state.materials.vaelgor_seal || 0;
    const lc = this.lastClear || {};
    if (summary) {
      const tile = (cls, label, val) => `<div class="vr-tile ${cls || ''}"><span>${label}</span><b>${val}</b></div>`;
      const hushT = (this.raidId === 'hush');
      const tiles = hushT ? [
        t.music_box_heart > 0 ? tile('rare', 'Music-Box Heart', `+${t.music_box_heart}`) : tile('dim', 'Music-Box Heart', 'none this time'),
        tile('seal', 'Lullaby Thread', `+${t.lullaby_thread || 0}`),
        tile('', 'Gold', `+${t.gold}`),
        tile('', 'Porcelain Shards', `+${t.porcelain_shard || 0}`)
      ] : [
        tile('seal', 'Eclipse Seal', `+${t.vaelgor_seal} <small>(${totalSeals}/5)</small>`),
        t.vaelgor_essence > 0 ? tile('rare', 'Abyssal Essence', `+${t.vaelgor_essence}`) : tile('dim', 'Abyssal Essence', 'none this time'),
        tile('', 'Gold', `+${t.gold}`),
        tile('', 'Obsidian Shards', `+${t.obsidian_shard}`),
        tile('', 'Pauldron Fragments', `+${t.pauldron_fragment}`)
      ];
      if (t.cosmetic_eclipse_wings) tiles.unshift(tile('rare', 'Eclipse Wings', 'Obtained'));
      if (t.cosmetic_pyre_wings) tiles.unshift(tile('rare', 'Pyre Wings', 'Obtained'));
      if (t.cosmetic_moon_mobile) tiles.unshift(tile('rare', 'Moon Mobile', 'Obtained'));
      for (const a of (t.accessories || [])) tiles.unshift(`<div class="vr-tile rare" style="--tone:${a.color}"><span>${escapeHtml(a.rarityName)} accessory</span><b style="color:${a.color}">${escapeHtml(a.name)}</b></div>`);
      const breaks = (t.breakCores || []).map(c => `<div class="vr-tile extra" style="--tone:${c.color}"><span>${escapeHtml(c.source)} · ${escapeHtml(c.tier)}</span><b>${escapeHtml(c.rewardText)}</b></div>`);
      summary.innerHTML = `<div class="vr-grid">${tiles.join('')}${breaks.join('')}</div>`;
    }
    this.repaintResults();
    if (modal) modal.classList.remove('hidden');
    this.updateAllUI();
  }

  // Table markup for a fight's results (victory and defeat share it). `info` adds extra cells to the summary strip.
  resultsHtml(res, lc, info) {
    const fmt = window.RaidStats.fmtTime;
    const n = (v) => Number(v).toLocaleString('en-US');
    const meta = [
      `<div><span>Time</span><b>${fmt(res.time)}</b></div>`,
      `<div><span>Party</span><b>${res.rows.length}</b></div>`,
      `<div><span>Total damage</span><b>${n(res.rows.reduce((a, r) => a + r.dmg, 0))}</b></div>`,
      (info || []).map(c => `<div><span>${c[0]}</span><b>${c[1]}</b></div>`).join(''),
      lc && lc.first ? `<div class="first"><span>First clear</span><b>+${lc.bonus} cores</b></div>` : ''
    ].join('');
    const rows = res.rows.map(r => `
      <tr class="${r.mvp ? 'mvp' : ''} ${r.id === this.localPlayer.id ? 'me' : ''}">
        <td class="nm"><i class="cls ${r.classId}"></i><div><b>${escapeHtml(r.name)}</b><small>${r.classId === 'unbound' ? 'Unbound' : r.classId === 'arclight' ? 'Arclight' : r.classId === 'reaper' ? 'Reaper' : (r.classId === 'hammer' ? 'Gravebreaker' : 'Breaker')}</small></div>${r.mvp ? '<em class="mvp-tag">MVP</em>' : ''}</td>
        <td><b>${n(r.dmg)}</b><small>${Math.round(r.share * 100)}%</small></td>
        <td><b>${n(r.dps)}</b><small>per sec</small></td>
        <td><b>${n(r.stagger)}</b><small>stagger</small></td>
        <td><b>${n(r.taken || 0)}</b><small>taken</small></td>
        <td><b>${r.deaths}</b><small>${r.deaths === 1 ? 'down' : 'downs'}</small></td>
      </tr>`).join('');
    return `
      <div class="vr-meta">${meta}</div>
      <table class="vr-table">
        <thead><tr><th>Warden</th><th>Damage</th><th>DPS</th><th>Stagger</th><th>Taken</th><th>Downs</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="vr-chart-row"><button class="nav-btn amber" onclick="window.DamageChart && window.DamageChart.open()">Detailed damage chart</button></div>
      ${res.rows.length > 1 && res.rows.some(r => r.mvp) ? '<div class="vr-foot">MVP is scored on damage (60%), stagger (25%) and staying alive (15%).</div>' : ''}`;
  }

  // The results table (time, damage, MVP). Called when the victory screen opens and again if the host's tally arrives late.
  repaintResults() {
    const box = document.getElementById('victory-results');
    const res = window.RaidStats && window.RaidStats.get();
    const lc = this.lastClear || {};
    const kick = document.getElementById('vr-kicker');
    if (kick) kick.textContent = lc.practice ? 'PRACTICE CLEARED' : `CHALICE RAID CLEARED · ${(lc.mode || 'normal').toUpperCase()}`;
    if (!box || !res) { if (box) box.innerHTML = ''; return; }
    box.innerHTML = this.resultsHtml(res, lc, null);
  }
  // Cached HUD element refs + last-written values: writing style/textContent every frame forces
  // style recalc & layout even when nothing changed, so only touch the DOM when a value differs.
  getHudRefs() {
    if (this._hud) return this._hud;
    const $ = (id) => document.getElementById(id);
    this._hud = {
      hpFill: $('hud-hp-fill'),
      hpText: $('hud-hp-text'),
      opFill: $('hud-overpower-fill'),
      opText: $('hud-overpower-text'),
      bossHpFill: $('boss-hp-fill'),
      bossHpText: $('boss-hp-text'),
      bossBarCount: $('boss-bar-count'),
      enrage: $('boss-enrage-timer'),
      stagFill: $('boss-stagger-fill'),
      slots: HUD_SKILL_KEYS.map(k => ({ key: k, cd: $(`cd-${k}`), slot: $(`slot-${k}`) })),
      last: new Map()
    };
    return this._hud;
  }

  setHudText(el, key, value) {
    if (!el) return;
    const last = this._hud.last;
    if (last.get(key) === value) return;
    last.set(key, value);
    el.textContent = value;
  }

  setHudStyle(el, key, prop, value) {
    if (!el) return;
    const last = this._hud.last;
    if (last.get(key) === value) return;
    last.set(key, value);
    el.style[prop] = value;
  }

  updateRealtimeHUD() {
    const p = this.localPlayer;
    const hud = this.getHudRefs();

    this.setHudStyle(hud.hpFill, 'hpW', 'width', `${Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100)).toFixed(1)}%`);
    this.setHudText(hud.hpText, 'hpT', `${p.hp} / ${p.maxHp}${p.shield > 0 ? ` (+${Math.round(p.shield)})` : ''}`);

    const pct = p.overpowerSurge ? ((p.surgeTimer / 14.0) * 100) : ((p.overpower / p.maxOverpower) * 100);
    this.setHudStyle(hud.opFill, 'opW', 'width', `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`);
    this.setHudStyle(hud.opFill, 'opBg', 'background', p.overpowerSurge
      ? 'linear-gradient(90deg, #f59e0b, #fde047)'
      : 'linear-gradient(90deg, #0284c7, #38bdf8)');
    const zReady = !p.overpowerSurge && p.overpower >= 100 && (p.cds.z || 0) <= 0.05;
    this.setHudText(hud.opText, 'opT', p.overpowerSurge
      ? `🔥 SURGE (${p.surgeTimer.toFixed(1)}s)`
      : `OVERPOWER ${Math.round(p.overpower)}% ${zReady ? '[Z READY]' : ((p.cds.z || 0) > 0.05 ? `[Z CD ${Math.ceil(p.cds.z)}s]` : '')}`);

    if (typeof p.updateHud === 'function') p.updateHud(this.getActiveBossTarget());
    else {
      const fs = (this.getActiveBossTarget() || {}).fractureStacks || 0;
      for (let i = 0; i < 3; i++) {
        const el = document.getElementById(`frac-${i}`);
        if (el) el.classList.toggle('on', i < fs);
      }
    }
    document.body.classList.toggle('karok-active', !!(p.karok && p.karok.active));
    const fcb = this.boss;
    document.body.classList.toggle('final-clash-active', !!(this.mode === 'raid' && fcb &&
      fcb.state === 'final_clash_mechanic' && fcb.clashPhase === 'active_clash' && fcb.clashPlayerId === p.id));

    const bossCounterable = (this.mode === 'raid' && this.boss && typeof this.boss.isCounterable === 'function' && this.boss.isCounterable());

    for (const { key: k, cd: cdEl, slot: slotEl } of hud.slots) {
      const rem = p.cds[k] || 0;
      if (rem > 0.05) {
        this.setHudStyle(cdEl, `cdD-${k}`, 'display', 'flex');
        this.setHudText(cdEl, `cdT-${k}`, rem >= 10 ? String(Math.ceil(rem)) : rem.toFixed(1));
      } else {
        this.setHudStyle(cdEl, `cdD-${k}`, 'display', 'none');
      }
      if (!slotEl) continue;
      const isHammer = p.classId === 'hammer'; // the hammer class drives w / f / z glows from its own updateHud()
      if (k === 'w') { if (!isHammer) slotEl.classList.toggle('primed-glow', p.tackleComboPrimed > 0); }
      else if (k === 'f') { if (!isHammer) slotEl.classList.toggle('primed-glow', p.parryRipostePrimed > 0); }
      else if (k === 'd') slotEl.classList.toggle('counter-ready-glow', bossCounterable && p.cds.d <= 0.05);
      else if (k === 'z') { if (!isHammer) slotEl.classList.toggle('primed-glow', !p.overpowerSurge && p.overpower >= p.maxOverpower && (p.cds.z || 0) <= 0.05); }
    }

    if (this.mode === 'raid') {
      const b = this.boss;
      const totalFrac = Math.max(0, b.hp / b.maxHp);
      const barsLeft = Math.ceil(totalFrac * b.hpBars);
      const barStep = b.maxHp / b.hpBars;
      const currentBarFrac = b.hp > 0 ? ((b.hp % barStep) / barStep || 1.0) : 0;

      this.setHudStyle(hud.bossHpFill, 'bHpW', 'width', `${(currentBarFrac * 100).toFixed(1)}%`);
      const has99DR = !b.finalPhase && (b.hp <= b.maxHp * 0.105 || b.finalTransitionPending || b.finalTransitionActive || b.state === 'final_phase_mechanic');
      const tag = typeof b.hudTag === 'function' ? b.hudTag() : (has99DR ? ' • 🛡️ 99% DR' : (b.finalPhase ? ' • 🌑 ECLIPSE SOVEREIGN' : ''));
      this.setHudText(hud.bossHpText, 'bHpT', `${b.hp.toLocaleString()} (${Math.round(totalFrac * 100)}%)${tag}`);
      this.setHudText(hud.bossBarCount, 'bBars', `x${barsLeft}`);

      if (hud.enrage) {
        if (b.enraged) {
          this.setHudText(hud.enrage, 'enrT', '💀 BERSERK');
          hud.enrage.classList.add('enraged');
        } else {
          const rem = Math.max(0, Math.ceil(b.enrageTimer ?? 330));
          const mins = String(Math.floor(rem / 60)).padStart(2, '0');
          const secs = String(rem % 60).padStart(2, '0');
          this.setHudText(hud.enrage, 'enrT', `⏳ ${mins}:${secs}`);
          hud.enrage.classList.toggle('enraged', rem <= 30);
        }
      }

      this.setHudStyle(hud.stagFill, 'stagW', 'width', `${Math.min(100, (b.stagger / b.maxStagger) * 100).toFixed(1)}%`);

      this._partyHudTick = (this._partyHudTick || 0) + 1;
      if (this._partyHudTick % 10 === 0) {
        this.renderPartyFramesHUD();
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2.5D WORLD RENDERER
  // -------------------------------------------------------------------------
  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    ctx.save();
    this.camera.applyTransform(ctx, W, H);

    if (this.mode === 'hub') {
      this.drawHubEnvironment(ctx);
    } else {
      this.drawRaidArenaEnvironment(ctx);
    }

    this.fx.drawGroundEffects(ctx);
    const raidBoss = this.mode === 'raid' ? this.boss : null;
    if (raidBoss && raidBoss.drawFloor) raidBoss.drawFloor(ctx);   // a boss's own floor telegraphs (Ignis): under every character
    for (const m of this.party) if (m && m.drawFloorVfx) m.drawFloorVfx(ctx);   // floor decals (Reaper's Rift Maw): under every character
    if (window.Cores) window.Cores.draw(ctx, this);   // loot cores lie on the floor, under the characters

    // Y-sorted draw without allocating closures every frame.
    const renderables = this._renderables || (this._renderables = []);
    renderables.length = 0;
    for (const member of this.party) renderables.push(member);
    if (this.mode === 'raid' && this.ghosts) for (const gh of this.ghosts) renderables.push(gh);
    renderables.push(this.mode === 'raid' ? this.boss : this.hubDummy);
    if (raidBoss && raidBoss.extraRenderables && raidBoss.hp > 0) for (const r of raidBoss.extraRenderables()) renderables.push(r);   // decoys, braziers...
    if (this.mode === 'hub' && window.HubScene) window.HubScene.collect(this, renderables);   // props are sorted with the characters
    renderables.sort((a, b) => a.y - b.y);
    for (const r of renderables) {
      if (r === this.hubDummy) { if (!(window.CharSelect && window.CharSelect.isOpen())) this.drawHubTrainingDummy(ctx); }
      else r.draw(ctx);
    }

    if (this.mode === 'hub' && window.HubScene) window.HubScene.drawLabels(this, ctx);
    if (raidBoss && raidBoss.drawTop) raidBoss.drawTop(ctx);        // what a boss has in the air, over everyone
    this.fx.drawForegroundSparks(ctx);
    ctx.restore();

    // Pale Eclipse Domain-Shift Whiteout Overlay: swells to pure blinding white and fades out to reveal the Pale Eclipse Sanctuary!
    if (this.mode === 'raid' && this.boss && this.boss.arenaWhiteoutAlpha > 0.005) {
      const a = Math.max(0, Math.min(1, this.boss.arenaWhiteoutAlpha));
      ctx.save();
      const whiteGrad = ctx.createRadialGradient(W * 0.5, H * 0.45, 20, W * 0.5, H * 0.45, Math.max(W, H) * 0.85);
      whiteGrad.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, a * 1.12)})`);
      whiteGrad.addColorStop(0.55, `rgba(248, 250, 252, ${a})`);
      whiteGrad.addColorStop(1, `rgba(226, 232, 240, ${a * 0.94})`);
      ctx.fillStyle = whiteGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Cinematic Phase-Transition Letterbox & Boss Awakening Banner Overlay
    this.camera.drawCinematicOverlay(ctx, W, H);
    if (raidBoss && raidBoss.drawScreen && !(this.camera.cinematicTimer > 0)) raidBoss.drawScreen(ctx, W, H);   // puzzle panels, identity gauge

    // Clasher-only cinematic: letterbox, colossal blade, [W]/[E] prompt (any class)
    this.drawClashCinematicHUD(ctx, W, H);
    if (this.mode === 'raid' && typeof window.drawKarokClashHud === 'function') {
      window.drawKarokClashHud(ctx, W, H, this.boss, this.localPlayer);
    }
  }

  // Screen-space cinematic for the player who holds the 15% HP Final Clash (any class): letterbox, the colossal
  // blade whose perspective sells Vaelgor's scale, and the [W]/[E] prompt whose ring converges as the blade lands.
  drawClashCinematicHUD(ctx, W, H) {
    const b = this.boss;
    const lp = this.localPlayer;
    const active = this.mode === 'raid' && b && lp &&
      b.state === 'final_clash_mechanic' && b.clashPhase === 'active_clash' && b.clashPlayerId === lp.id;
    if (!active) {
      this._clashHud = null;
      return;
    }
    const now = performance.now();
    let h = this._clashHud;
    if (!h) h = this._clashHud = { t0: now, last: now, blade: null };
    const dt = Math.min(0.05, (now - h.last) / 1000);
    h.last = now;

    const clamp01 = (t) => Math.max(0, Math.min(1, t));
    const mix = (a, c, t) => a + (c - a) * t;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const time = now * 0.001;

    const introActive = b.clashIntroT > 0;
    const ip = clamp01(1 - b.clashIntroT / CLASH_INTRO_DUR);
    const style = b.clashCurrentStyle || 'overhead_crush';
    const subP = clamp01(b.clashSubProgress || 0);
    const tt = clamp01(subP / CLASH_CONTACT_PROG);
    const fall = Math.pow(tt, 2.4);
    const bars = easeOut(clamp01((now - h.t0) / 520));

    // ---- Target blade state (screen space; the blade points down from its pivot) ----
    let tgt;
    let rate = 26;
    if (introActive) {
      const coilEnd = CLASH_INTRO_IMPACT_P * 0.56;
      const hoistStart = CLASH_INTRO_IMPACT_P + 0.16;
      if (ip < coilEnd) {
        const e = easeOut(ip / coilEnd);
        tgt = { px: W * 0.64, py: H * 0.14, rot: mix(-0.25, -1.5, e), L: H * 0.95, a: 0.2 + 0.7 * e };
        rate = 14;
      } else if (ip < CLASH_INTRO_IMPACT_P) {
        const s = (ip - coilEnd) / (CLASH_INTRO_IMPACT_P - coilEnd);
        tgt = { px: mix(W * 0.64, W * 0.5, s), py: H * 0.14, rot: mix(-1.5, 0.12, s * s * s), L: H * 0.95, a: 1 };
        rate = 80;
      } else if (ip < hoistStart) {
        tgt = { px: W * 0.5 + Math.sin(time * 70) * 3, py: H * 0.14, rot: 0.12, L: H * 0.95, a: 1 };
        rate = 50;
      } else {
        const e = easeOut((ip - hoistStart) / (1 - hoistStart));
        tgt = { px: W * 0.5, py: mix(H * 0.14, -H * 0.42, e), rot: mix(0.12, 0, e), L: H * 0.62, a: 1 };
        rate = 12;
      }
    } else if (style === 'slash_left' || style === 'slash_right') {
      const dir = style === 'slash_left' ? 1 : -1;
      tgt = { px: W * (0.5 + 0.08 * dir), py: -H * 0.05, rot: mix(-1.15 * dir, 0.25 * dir, fall), L: H * 0.88, a: 1 };
      rate = tt > 0.5 ? 55 : 22;
    } else {
      const startPy = style === 'extinction_drive' ? -0.55 : (style === 'follow_down' ? -0.28 : -0.42);
      const endPy = style === 'extinction_drive' ? -0.17 : -0.12;
      const sway = Math.sin(time * 22) * 3 * (1 - tt);
      tgt = {
        px: W * 0.5 + sway,
        py: H * mix(startPy, endPy, fall),
        rot: 0.03,
        L: H * (style === 'extinction_drive' ? 0.74 : 0.62),
        a: 1
      };
      rate = tt > 0.5 ? 55 : 22;
    }
    const contactShake = (!introActive && tt >= 1) ? Math.sin(time * 90) * 3 : 0;
    if (!h.blade) h.blade = { ...tgt, py: tgt.py - H * 0.3, a: 0 };
    const kb = 1 - Math.exp(-dt * rate);
    const bl = h.blade;
    bl.px = mix(bl.px, tgt.px, kb);
    bl.py = mix(bl.py, tgt.py, kb);
    bl.rot = mix(bl.rot, tgt.rot, kb);
    bl.L = mix(bl.L, tgt.L, kb);
    bl.a = mix(bl.a, tgt.a, 1 - Math.exp(-dt * 12));

    ctx.save();

    // ---- Vignette (strengthens through the duel) ----
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.24, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(0.7, `rgba(2, 6, 23, ${0.42 * bars})`);
    vig.addColorStop(1, `rgba(2, 4, 12, ${0.85 * bars})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // ---- Colossal blade ----
    if (bl.a > 0.02) {
      const half = W * 0.052;
      ctx.save();
      ctx.globalAlpha = Math.min(1, bl.a);
      ctx.translate(bl.px + contactShake, bl.py);
      ctx.rotate(bl.rot);
      const L = bl.L;
      const g = ctx.createLinearGradient(-half, 0, half, 0);
      g.addColorStop(0, '#05070d');
      g.addColorStop(0.35, '#334155');
      g.addColorStop(0.5, '#94a3b8');
      g.addColorStop(0.65, '#334155');
      g.addColorStop(1, '#05070d');
      ctx.beginPath();
      ctx.moveTo(-half, 0);
      ctx.lineTo(-half, L * 0.86);
      ctx.lineTo(0, L);
      ctx.lineTo(half, L * 0.86);
      ctx.lineTo(half, 0);
      ctx.closePath();
      // Eclipse glow (wide translucent stroke instead of shadowBlur, which is slow)
      const lit = (!introActive && tt >= 1) ? 1 : 0.55;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(168, 85, 247, ${0.35 * lit})`;
      ctx.lineWidth = 26;
      ctx.stroke();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = `rgba(226, 232, 240, ${0.55 + 0.4 * lit})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Fuller
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.75)';
      ctx.lineWidth = half * 0.18;
      ctx.beginPath();
      ctx.moveTo(0, L * 0.04);
      ctx.lineTo(0, L * 0.82);
      ctx.stroke();
      // Crossguard
      ctx.fillStyle = '#1e1b4b';
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 3;
      ctx.fillRect(-half * 2.1, -16, half * 4.2, 22);
      ctx.strokeRect(-half * 2.1, -16, half * 4.2, 22);
      ctx.restore();
    }

    // Impact flash lines at the opening haymaker and at each contact
    const sinceImpact = introActive ? (ip - CLASH_INTRO_IMPACT_P) : 1;
    if (introActive && sinceImpact >= 0 && sinceImpact < 0.1) {
      const a = 1 - sinceImpact / 0.1;
      ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
      ctx.lineWidth = 16 * a + 3;
      ctx.beginPath();
      ctx.moveTo(W * 0.05, H * 0.28);
      ctx.lineTo(W * 0.95, H * 0.62);
      ctx.stroke();
    }

    // ---- Letterbox bars ----
    const barH = Math.round(H * 0.11 * bars);
    ctx.fillStyle = 'rgba(2, 4, 10, 0.96)';
    ctx.fillRect(0, 0, W, barH);
    ctx.fillRect(0, H - barH, W, barH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, barH);
    ctx.lineTo(W, barH);
    ctx.moveTo(0, H - barH);
    ctx.lineTo(W, H - barH);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('⚔️ ECLIPSE SOVEREIGN DUEL', W * 0.5, barH * 0.5);
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#fde047';
    ctx.fillText('MATCH EACH SWING WITH [W] / [E] AS THE BLADE LANDS — ALLIES: FREE DPS!', W * 0.5, H - barH * 0.5);

    // ---- Prompt ----
    const cx = W * 0.5;
    const cy = H * 0.8;
    if (introActive) {
      const pulse = 0.65 + 0.35 * Math.sin(time * 9);
      ctx.font = '900 30px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = `rgba(248, 250, 252, ${pulse * clamp01(ip * 4)})`;
      ctx.fillText(ip < CLASH_INTRO_IMPACT_P ? 'HOLD THE LINE...' : 'HE RAISES THE BLADE...', cx, cy);
    } else if (lp.clashQteActive && Array.isArray(lp.clashAttempts) && lp.clashAttempts.length) {
      const att = lp.clashAttempts[lp.clashAttemptIndex] || lp.clashAttempts[0];
      const keys = att.keys || [];
      const cap = Math.min(W, H) * 0.085;
      const gap = cap * 0.4;
      const rowW = keys.length * cap + (keys.length - 1) * gap;
      const prog = clamp01(lp.clashBeatTimer / Math.max(0.1, lp.clashBeatDuration));
      const inPerfect = prog >= 0.68 && prog <= 0.92;
      const sub = lp.clashSubHitIndex || 0;

      ctx.font = '900 14px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#f87171';
      ctx.fillText(att.title || 'LETHAL STRIKE', cx, cy - cap * 1.55);

      for (let i = 0; i < keys.length; i++) {
        const kx = cx - rowW * 0.5 + cap * 0.5 + i * (cap + gap);
        const done = i < sub;
        const isActive = i === sub;
        const isE = keys[i] === 'E';
        const col = isE ? '#38bdf8' : '#facc15';
        ctx.save();
        ctx.globalAlpha = (done || isActive) ? 1 : 0.6;
        if (isActive) {
          // Approach ring converges on the cap exactly as the blade lands (CLASH_CONTACT_PROG)
          const approach = clamp01(prog / CLASH_CONTACT_PROG);
          const late = clamp01((prog - CLASH_CONTACT_PROG) / (1 - CLASH_CONTACT_PROG));
          const ringR = cap * 0.62 + (1 - approach) * cap * 1.9 - late * cap * 0.14;
          ctx.strokeStyle = inPerfect ? '#fef08a' : (prog > CLASH_CONTACT_PROG ? '#fb7185' : col);
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(kx, cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(kx, cy, cap * 0.62, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = done ? '#16a34a' : (isActive && inPerfect ? '#fde047' : '#0f172a');
        ctx.strokeStyle = done ? '#86efac' : col;
        ctx.lineWidth = isActive ? 4 : 2.5;
        ctx.beginPath();
        ctx.roundRect(kx - cap * 0.5, cy - cap * 0.5, cap, cap, cap * 0.16);
        ctx.fill();
        ctx.stroke();
        ctx.font = `900 ${Math.round(cap * 0.52)}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillStyle = (isActive && inPerfect) ? '#0b1020' : '#ffffff';
        ctx.fillText(done ? '✓' : keys[i], kx, cy + 2);
        ctx.restore();
      }

      // Swing pips (future swings stay hidden - only how many remain)
      const total = lp.clashAttempts.length;
      const pipY = cy + cap * 0.95;
      for (let i = 0; i < total; i++) {
        const px = cx + (i - (total - 1) * 0.5) * 26;
        ctx.fillStyle = i < lp.clashAttemptIndex ? '#22c55e' : (i === lp.clashAttemptIndex ? '#fde047' : 'rgba(148,163,184,0.45)');
        ctx.save();
        ctx.translate(px, pipY);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-6, -6, 12, 12);
        ctx.restore();
      }

      if (lp.clashLastResult && lp.clashLastResultTimer > 0) {
        const pop = 1 + clamp01(lp.clashLastResultTimer / 0.5) * 0.25;
        ctx.font = `900 ${Math.round(26 * pop)}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillStyle = lp.clashLastResult.includes('PERFECT') ? '#fde047' : '#4ade80';
        ctx.fillText(lp.clashLastResult, cx, cy - cap * 2.1);
      }
    }
    ctx.restore();
  }

  drawHubTrainingDummy(ctx) {
    const d = this.hubDummy;
    const jx = d.shake > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.save();
    ctx.translate(d.x + jx, d.y);

    ctx.save();
    ctx.scale(1, PERSPECTIVE_TILT);
    ctx.rotate(d.facingAngle);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 32, -0.65, 0.65);
    ctx.stroke();
    ctx.strokeStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(0, 0, 32, Math.PI - 0.75, Math.PI + 0.75);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-12, -52, 24, 46, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(0, -62, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (typeof window.drawBrokenMarks === 'function') window.drawBrokenMarks(ctx, d);
  }

  drawRaidArenaEnvironment(ctx) {
    const isEclipse = (this.boss.state === 'eclipse_mechanic');
    const isFinalArena = !!(this.boss && this.boss.finalPhaseArena);
    const time = performance.now() * 0.001;
    ctx.save();
    ctx.scale(1, PERSPECTIVE_TILT);

    const floorGrad = ctx.createRadialGradient(0, 0, 35, 0, 0, this.arenaRadius);
    if (isFinalArena) {
      // Eerie, unnervingly bright "Pale Eclipse Sanctuary" arena: bleached lunar-ivory & pale-lavender marble with stark dark-violet fractures!
      floorGrad.addColorStop(0, '#f1f5f9');
      floorGrad.addColorStop(0.32, '#e2e8f0');
      floorGrad.addColorStop(0.68, '#cbd5e1');
      floorGrad.addColorStop(0.90, '#64748b');
      floorGrad.addColorStop(1, '#1e1b4b');
    } else if (isEclipse) {
      floorGrad.addColorStop(0, '#1f0612');
      floorGrad.addColorStop(0.55, '#0c040a');
      floorGrad.addColorStop(1, '#030205');
    } else {
      floorGrad.addColorStop(0, '#1a2032');
      floorGrad.addColorStop(0.62, '#0d101b');
      floorGrad.addColorStop(1, '#06070c');
    }

    ctx.fillStyle = floorGrad;
    ctx.beginPath();
    ctx.arc(0, 0, this.arenaRadius, 0, Math.PI * 2);
    ctx.fill();

    if (isFinalArena) {
      // Unsettling Pale-Eclipse Black Sun Sigil etched into the bleached sanctuary floor
      ctx.strokeStyle = 'rgba(88, 28, 135, 0.32)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, 96, 0, Math.PI * 2);
      ctx.stroke();

      // Slow counter-rotating geometric eclipse rays on the bright floor
      ctx.save();
      ctx.rotate(time * 0.18);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.24)';
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 96, Math.sin(a) * 96);
        ctx.lineTo(Math.cos(a + 0.14) * 280, Math.sin(a + 0.14) * 280);
        ctx.stroke();
      }
      ctx.restore();

      // Subtle eerie golden-violet outer sanctuary seal
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, this.arenaRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(30, 27, 75, 0.28)';
      ctx.lineWidth = 2.2;
      [180, 360].forEach(r => {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 65, Math.sin(a) * 65);
        ctx.lineTo(Math.cos(a) * this.arenaRadius, Math.sin(a) * this.arenaRadius);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    ctx.strokeStyle = isEclipse ? 'rgba(244, 63, 94, 0.6)' : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, this.arenaRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = isEclipse ? 'rgba(225, 29, 72, 0.28)' : 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 2;
    [180, 360].forEach(r => {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 65, Math.sin(a) * 65);
      ctx.lineTo(Math.cos(a) * this.arenaRadius, Math.sin(a) * this.arenaRadius);
      ctx.stroke();
    }
    ctx.restore();
  }
}

window.updateMechanicHUD = function() {
  const hud = document.getElementById('mechanic-hud');
  if (hud) hud.classList.add('hidden');
};

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game25D();
});
