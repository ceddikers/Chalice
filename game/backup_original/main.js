// =========================================================================
// MAIN.JS — 2.5D Hub ("Sanctum of Rocheste") & Full Vaelgor Raid Loop
// Integrates Hitstop Freeze, Shoulder-Stance Breaker, Omnislash [T],
// & Vindictus Boss Essence (10%) + 5-Seal Token Redemption System
// =========================================================================

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
    this.arenaRadius = 560;

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
        name: '🌑 ABYSSAL ECLIPSE RAID GATE',
        subtitle: 'Enter Vaelgor Legion Raid (10% Essence + 100% Seal Drop) [Click]',
        x: 0,
        y: -215,
        radius: 82,
        color: '#f43f5e'
      },
      {
        id: 'coop_board',
        name: '🛡️ MERCENARY CO-OP & AI BOARD',
        subtitle: 'Configure AI Vanguards & PeerJS Room [Click / P]',
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
      },
      {
        id: 'clock_practice',
        name: '🕰️ ASTRAL CLOCK PRACTICE ROOM',
        subtitle: 'Practice 35% HP Physical Sword-Tell Clock Puzzle Immediately [Click]',
        x: 215,
        y: -155,
        radius: 62,
        color: '#c084fc'
      },
      {
        id: 'final_phase_practice',
        name: '🌑 PALE ECLIPSE FINAL PHASE PORTAL',
        subtitle: 'Practice End Sequence (3-Dash Counter -> QTE & Spirit Bomb -> 15% HP Final Clash [G]) [Click]',
        x: -215,
        y: -155,
        radius: 64,
        color: '#e11d48'
      },
      {
        id: 'final_clash_practice',
        name: '⚔️ ECLIPSE SOVEREIGN CLASH PORTAL',
        subtitle: 'Jump Straight to 15% HP Final Clash End Sequence (Dark Trail -> Blue Circle [G] & Rhythm QTE) [Click]',
        x: 215,
        y: 145,
        radius: 62,
        color: '#38bdf8'
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

    this.resize();
    this.bindEvents();
    this.rebuildPartyRoster();
    this.updateAllUI();

    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  rebuildPartyRoster() {
    this.party = [this.localPlayer];
    for (const remote of this.net.remotePlayers.values()) {
      this.party.push(remote);
    }

    this.aiBots = [];
    const botConfigs = [
      { name: 'Sir Kaelen (AI Vanguard)', model: 'vaelgor_obsidian', color: '#f43f5e' },
      { name: 'Brynja (AI Breaker)', model: 'black_sun_sovereign', color: '#c084fc' },
      { name: 'Thoran (AI Warden)', model: 'warden_steel', color: '#38bdf8' }
    ];
    for (let i = 0; i < this.net.soloAiCount; i++) {
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
  enterHub() {
    this.mode = 'hub';
    this.arenaRadius = 520;
    if (this.boss) {
      this.boss.practiceClockMode = false;
      this.boss.practiceFinalPhaseMode = false;
      this.boss.practiceFinalClashMode = false;
    }
    this.localPlayer.hp = this.localPlayer.maxHp;
    this.localPlayer.shield = 0;
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
    this.syncPracticeClockButton();
    this.syncPracticeFinalButton();
    this.syncPracticeClashButton();
    audio.setMusicState('hub');
  }

  enterRaidGate(broadcastToPeers = true, startClockPractice = false, startFinalPhasePractice = false, startFinalClashPractice = false) {
    this.mode = 'raid';
    this.raidVictoryShown = false;
    this.arenaRadius = 590;

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
      this.syncPracticeClockButton();
      this.syncPracticeFinalButton();
      this.syncPracticeClashButton();
      if (broadcastToPeers) {
        this.net.broadcast({ type: 'start_raid', clockPractice: true, finalPhasePractice: false, finalClashPractice: false });
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
      this.syncPracticeClockButton();
      this.syncPracticeFinalButton();
      this.syncPracticeClashButton();
      if (broadcastToPeers) {
        this.net.broadcast({ type: 'start_raid', clockPractice: false, finalPhasePractice: true, finalClashPractice: false });
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
      this.syncPracticeClockButton();
      this.syncPracticeFinalButton();
      this.syncPracticeClashButton();
      if (broadcastToPeers) {
        this.net.broadcast({ type: 'start_raid', clockPractice: false, finalPhasePractice: false, finalClashPractice: true });
      }
      audio.setMusicState('phase2');
      if (this.fx) {
        this.fx.addFloatingText(this.localPlayer.x, this.localPlayer.y - 88, '⚔️ WATCH VAELGOR TELEPORT BEHIND YOU -> STAND IN BLUE CIRCLE & PRESS [G]!', '#38bdf8', 16);
      }
      return;
    }

    const titleEl = document.getElementById('zone-banner-title');
    if (titleEl) titleEl.textContent = 'ABYSSAL CATHEDRAL — VAELGOR LEGION RAID';
    const subEl = document.getElementById('zone-banner-sub');
    if (subEl) subEl.textContent = '10% Vaelgor\'s Abyssal Essence Drop • 100% Guaranteed Eclipse Seal Token • Break Pauldron for Bonus Fragment!';
    this.syncPracticeClockButton();
    this.syncPracticeFinalButton();
    this.syncPracticeClashButton();

    if (broadcastToPeers) {
      this.net.broadcast({ type: 'start_raid', clockPractice: false, finalPhasePractice: false, finalClashPractice: false });
    }

    audio.setMusicState('cutscene');
    this.boss.triggerIntroCutscene();
  }

  toggleClockPracticeRoom() {
    // If in Hub or not currently in Clock Practice Mode, jump straight into the Clock Practice Room!
    if (this.mode !== 'raid' || !this.boss.practiceClockMode) {
      this.enterRaidGate(false, true, false, false);
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

  syncPracticeClockButton() {
    const btn = document.getElementById('btn-practice-clock');
    if (!btn) return;
    const active = (this.mode === 'raid' && this.boss && this.boss.practiceClockMode);
    btn.textContent = active ? '🕰️ Exit Clock Practice' : '🕰️ Practice Clock';
    btn.style.borderColor = active ? '#c084fc' : '';
    btn.style.boxShadow = active ? '0 0 12px rgba(192, 132, 252, 0.55)' : '';
  }

  syncPracticeFinalButton() {
    const btn = document.getElementById('btn-practice-final');
    if (!btn) return;
    const active = (this.mode === 'raid' && this.boss && this.boss.practiceFinalPhaseMode);
    btn.textContent = active ? '🌑 Exit Final Practice' : '🌑 Practice Final Phase';
    btn.style.borderColor = active ? '#f43f5e' : '';
    btn.style.boxShadow = active ? '0 0 12px rgba(244, 63, 94, 0.55)' : '';
  }

  syncPracticeClashButton() {
    const btn = document.getElementById('btn-practice-clash');
    if (!btn) return;
    const active = (this.mode === 'raid' && this.boss && this.boss.practiceFinalClashMode);
    btn.textContent = active ? '⚔️ Exit Clash Practice' : '⚔️ Practice Clash';
    btn.style.borderColor = active ? '#38bdf8' : '';
    btn.style.boxShadow = active ? '0 0 12px rgba(56, 189, 248, 0.55)' : '';
  }

  // -------------------------------------------------------------------------
  // INPUT & INTERACTION BINDINGS
  // -------------------------------------------------------------------------
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

      if (e.button === 2) {
        this.rightMouseDown = true;
        this.localPlayer.setMoveTarget(w.x, w.y);
        this.fx.addMoveOrder(w.x, w.y, '#22c55e');
      } else if (e.button === 0) {
        this.leftMouseDown = true;

        if (this.mode === 'hub') {
          for (const st of this.hubStations) {
            if (Math.hypot(w.x - st.x, w.y - st.y) < st.radius + 15) {
              this.interactWithStation(st.id);
              return;
            }
          }
        }

        if (this.localPlayer.triggerBasicAttack(w.x, w.y)) {
          this.net.broadcast({ type: 'player_skill', skill: 'basic', aimX: w.x, aimY: w.y });
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rightMouseDown = false;
      if (e.button === 0) this.leftMouseDown = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -0.10;
      this.camera.targetZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.targetZoom + delta));
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      audio.init();
      const k = e.key.toLowerCase();
      this.keysDown.add(k);

      // 1. Intercept ONLY [W] and [E] for the 15% HP Final Clash Rhythm-Game QTE!
      if (this.localPlayer && this.localPlayer.clashQteActive) {
        if (['w', 'e'].includes(k)) {
          e.preventDefault();
          this.localPlayer.handleClashRhythmKey(k, this.boss);
        }
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
        if (['q', 'w', 'e', 'r'].includes(k)) {
          e.preventDefault();
          this.localPlayer.handleEclipseQteKey(k);
        }
        return;
      }

      if (this.localPlayer && this.localPlayer.rooted) {
        if (k === 'g' && this.mode === 'hub') this.toggleModal('forge-modal');
        if (k === 'p') this.toggleModal('coop-modal');
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.localPlayer.triggerSkill('space', this.mouseWorldX, this.mouseWorldY, this.getActiveBossTarget())) {
          this.net.broadcast({ type: 'player_skill', skill: 'space', aimX: this.mouseWorldX, aimY: this.mouseWorldY });
        }
        return;
      }

      if (['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z'].includes(k)) {
        if (this.localPlayer.triggerSkill(k, this.mouseWorldX, this.mouseWorldY, this.getActiveBossTarget())) {
          this.net.broadcast({ type: 'player_skill', skill: k, aimX: this.mouseWorldX, aimY: this.mouseWorldY });
        }
      }

      if (k === 'g' && this.mode === 'hub') this.toggleModal('forge-modal');
      if (k === 'p') this.toggleModal('coop-modal');
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keysDown.delete(k);
      if (this.localPlayer && typeof this.localPlayer.releaseSkill === 'function') {
        this.localPlayer.releaseSkill(k);
      }
    });
  }

  getActiveBossTarget() {
    return this.mode === 'raid' ? this.boss : this.hubDummy;
  }

  interactWithStation(stationId) {
    if (stationId === 'forge') this.openModal('forge-modal');
    else if (stationId === 'portal') this.enterRaidGate(true, false, false, false);
    else if (stationId === 'clock_practice') this.enterRaidGate(false, true, false, false);
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
      modalBtn.textContent = enabled
        ? '✨ Ally VFX: ON (Click to Hide Ally Skill Effects for FPS)'
        : '🚫 Ally VFX: OFF (Ally Motions On • Skill VFX Hidden for FPS)';
    }
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
    this.syncPracticeClockButton();
    this.syncPracticeFinalButton();
    this.syncPracticeClashButton();
  }

  renderForgeModal() {
    const st = this.forge.state;
    const wpn = this.forge.getEquippedWeapon();
    const arm = this.forge.getEquippedArmor();
    const seals = st.materials.vaelgor_seal || 0;
    const essences = st.materials.vaelgor_essence || 0;

    const matBar = document.getElementById('forge-materials-bar');
    if (matBar) {
      matBar.innerHTML = `
        <div class="mat-pill gold">🪙 ${st.gold.toLocaleString()} Gold</div>
        <div class="mat-pill" style="border-color:#38bdf8;color:#7dd3fc">
          🏅 Vaelgor's Eclipse Seal (100% Drop Token): <b>${seals} / 5</b>
        </div>
        <div class="mat-pill" style="border-color:#f43f5e;color:#fda4af">
          🔮 Vaelgor's Abyssal Essence (10% Drop): <b>${essences}</b>
        </div>
        <div class="mat-pill">🩸 Obsidian Shard: <b>${st.materials.obsidian_shard || 0}</b></div>
        <div class="mat-pill">🛡️ Pauldron Fragment (Part-Break): <b>${st.materials.pauldron_fragment || 0}</b></div>
      `;
    }

    // Token Redemption Box + Currently Equipped Gear Preview
    const eqBox = document.getElementById('forge-equipped-card');
    if (eqBox && wpn) {
      const canRedeem = seals >= 5;
      eqBox.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
          <div>
            <div class="eq-title">🗡️ ${wpn.name}</div>
            <div class="eq-sub">${wpn.tier} • Attack Power: <b style="color:#4ade80">${this.localPlayer.getTotalAtk()}</b> • Crit Rate: <b>${Math.round(this.localPlayer.critRate * 100)}%</b></div>
            <div class="eq-sub">🛡️ Armor: <b>${arm ? arm.name : 'None'}</b> (Max HP: <b>${this.localPlayer.maxHp}</b>, DEF: <b>${this.localPlayer.bonusDef}</b>)</div>
          </div>
          <div style="text-align:right">
            <button class="forge-action-btn ${canRedeem ? '' : 'disabled'}" onclick="window.game.handleRedeemSealsClick()">
              🏅 Redeem 5 Eclipse Seals ➔ +1 Abyssal Essence (${seals}/5)
            </button>
            <div style="font-size:10px;color:#94a3b8;margin-top:4px">
              Guaranteed Pity Exchange: Never get stuck on the 10% Essence drop!
            </div>
          </div>
        </div>
      `;
    }

    const recipeList = document.getElementById('forge-recipes-list');
    if (recipeList) {
      recipeList.innerHTML = VINDICTUS_RECIPES.map(r => {
        const canCraft = this.forge.canCraftRecipe(r);
        const matReqHtml = Object.entries(r.materials).map(([k, req]) => {
          const have = st.materials[k] || 0;
          const ok = have >= req;
          const label = k.replace('_', ' ').toUpperCase();
          return `<span class="req-tag ${ok ? 'ok' : 'missing'}">${label}: ${have}/${req}</span>`;
        }).join(' ');

        return `
          <div class="recipe-card">
            <div class="recipe-hdr">
              <div>
                <div class="recipe-name">${r.slot === 'weapon' ? '🗡️' : '🛡️'} ${r.name}</div>
                <div class="recipe-tier">${r.tier}</div>
              </div>
              <button class="forge-craft-btn ${canCraft ? '' : 'disabled'}" onclick="window.game.handleCraftClick('${r.id}')">
                ⚒️ Craft Set Piece (${r.costGold}G)
              </button>
            </div>
            <div class="recipe-desc">${r.desc}</div>
            <div class="recipe-reqs">${matReqHtml}</div>
          </div>
        `;
      }).join('');
    }

    const invList = document.getElementById('forge-inventory-list');
    if (invList) {
      invList.innerHTML = st.inventory.map(item => `
        <div class="inv-chip ${item.equipped ? 'equipped' : ''}" onclick="window.game.handleEquipItem('${item.uid}')">
          <span>${item.slot === 'weapon' ? '🗡️' : '🛡️'} ${item.name} <small style="color:#94a3b8">(${item.tier})</small></span>
          <b>${item.equipped ? '✓ EQUIPPED (ACTIVE 2.5D MODEL)' : 'CLICK TO EQUIP'}</b>
        </div>
      `).join('');
    }
  }

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
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    const bossTargetId = (this.mode === 'raid' && this.boss) ? this.boss.activeTargetId : null;
    container.innerHTML = this.party.map(p => {
      const hpPct = Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100)));
      const badge = p.isLocal ? 'YOU' : (p.isBot ? 'AI' : 'CO-OP');
      const isTargeted = (bossTargetId && p.id === bossTargetId && this.party.length > 1);
      return `
        <div class="party-card ${p.hp <= 0 ? 'dead' : ''}" style="${isTargeted ? 'border-color:#f43f5e;box-shadow:0 0 10px rgba(244,63,94,0.35)' : ''}">
          <div class="party-row">
            <span class="party-name">${isTargeted ? '🎯 ' : ''}${p.name}</span>
            <span class="party-tag" style="${isTargeted ? 'color:#fda4af' : ''}">${isTargeted ? 'TARGET' : badge}</span>
          </div>
          <div class="party-hp-wrap">
            <div class="party-hp-fill" style="width:${hpPct}%; background:${p.isLocal ? '#22c55e' : '#38bdf8'}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // -------------------------------------------------------------------------
  // MAIN GAME LOOP (Includes Hitstop Freeze for Weighty Impacts!)
  // -------------------------------------------------------------------------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) * 0.001));
    this.lastTime = now;

    // Weighty Hitstop Freeze: Pauses world simulation briefly on heavy slams while camera shake continues!
    if (this.camera.hitstopTimer > 0) {
      this.camera.hitstopTimer = Math.max(0, this.camera.hitstopTimer - rawDt);
      this.camera.update(rawDt, this.localPlayer.x, this.localPlayer.y - 18, this.mouseScreenX, this.mouseScreenY, this.canvas.width, this.canvas.height);
      this.draw();
      return;
    }

    this.update(rawDt);
    this.draw();
  }

  update(dt) {
    const w = this.camera.screenToWorld(this.mouseScreenX, this.mouseScreenY, this.canvas.width, this.canvas.height);
    this.mouseWorldX = w.x;
    this.mouseWorldY = w.y;

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
      this.localPlayer.triggerBasicAttack(this.mouseWorldX, this.mouseWorldY);
    }

    const activeBoss = this.getActiveBossTarget();

    if (!inCutscene) {
      for (const member of this.party) {
        member.update(dt, activeBoss, this.arenaCenter, this.arenaRadius);
      }
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
      if (ally !== this.localPlayer && ally.hp <= 0 && this.localPlayer.hp > 0) {
        if (Math.hypot(ally.x - this.localPlayer.x, ally.y - this.localPlayer.y) < 55) {
          ally.reviveProgress = (ally.reviveProgress || 0) + dt;
          if (ally.reviveProgress >= 1.5) {
            ally.reviveProgress = 0;
            ally.hp = Math.round(ally.maxHp * 0.65);
            ally.state = 'idle';
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
      } else if (
        this.camera.cinematicTimer > 0 ||
        this.boss.state === 'intro_cutscene' ||
        (this.boss.state === 'eclipse_mechanic' && this.boss.eclipsePhase === 'cutscene') ||
        (this.boss.state === 'final_phase_mechanic' && (this.boss.finalMechPhase === 'arena_cutscene' || this.boss.finalMechPhase === 'sword_absorb_cutscene'))
      ) {
        audio.setMusicState('cutscene');
      } else if (
        this.boss.state === 'eclipse_mechanic' ||
        this.boss.state === 'iaido_mechanic' ||
        this.boss.state === 'horizon_mechanic' ||
        this.boss.state === 'final_phase_mechanic'
      ) {
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

      if (this.localPlayer.hp <= 0) {
        this.localPlayer.deadTimer = (this.localPlayer.deadTimer || 0) + dt;
        if (this.localPlayer.deadTimer >= 3.0) {
          this.localPlayer.deadTimer = 0;
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

    // Clashing-Player-Only Dynamic Cinematic Camera Angle & Zoom:
    // - ONLY when `this.boss.clashPlayerId === this.localPlayer.id` does the camera tilt/rotate into a
    //   cinematic close-up duel perspective that dynamically shifts angle & zoom with each of Vaelgor's 4 lethal attempts!
    // - Other players in multiplayer (or when an AI bot clashes) keep their normal camera and full control to wail on Vaelgor!
    let camTargetX = this.localPlayer.x;
    let camTargetY = this.localPlayer.y - 18;
    const isLocalClashing = (
      this.mode === 'raid' &&
      this.boss &&
      this.boss.state === 'final_clash_mechanic' &&
      this.boss.clashPhase === 'active_clash' &&
      this.boss.clashPlayerId === this.localPlayer.id
    );
    if (isLocalClashing) {
      const style = this.boss.clashCurrentStyle || 'overhead_crush';
      const attemptIdx = this.boss.clashAttemptIndex || 0;
      const parryFlash = Math.max(0, Math.min(1, (this.localPlayer.clashLastParryFlash || 0) / 0.28));

      // Offset focal point slightly toward the active strike vector so the duel feels like a dynamic action-camera scene!
      const duelAngle = Math.atan2(this.boss.y - this.localPlayer.y, this.boss.x - this.localPlayer.x);
      const perpAngle = duelAngle + Math.PI * 0.5;
      let sideShift = 18;
      let targetTiltAngle = -0.14; // ~ -8 deg Dutch tilt for Bout 1
      let baseDuelZoom = 1.48;

      if (style === 'slash_left' || style === 'flurry_1') {
        sideShift = 28;
        targetTiltAngle = 0.19; // +11 deg Dutch tilt as Vaelgor cleaves from the right!
        baseDuelZoom = 1.54;
      } else if (style === 'slash_right' || style === 'flurry_2') {
        sideShift = -28;
        targetTiltAngle = -0.21; // -12 deg opposite Dutch tilt as Vaelgor rips back across!
        baseDuelZoom = 1.56;
      } else if (style === 'flurry_3') {
        sideShift = 14;
        targetTiltAngle = 0.24; // +14 deg intense angle for the 3rd rapid flurry uppercut!
        baseDuelZoom = 1.62;
      } else if (style === 'extinction_drive') {
        sideShift = 0;
        targetTiltAngle = -0.16; // Dramatic final showdown angle!
        baseDuelZoom = 1.65;
      } else {
        sideShift = (attemptIdx % 2 === 0 ? 1 : -1) * 20;
        targetTiltAngle = -0.15;
        baseDuelZoom = 1.48;
      }

      camTargetX = (this.localPlayer.x + this.boss.x) * 0.5 + Math.cos(perpAngle) * sideShift;
      camTargetY = (this.localPlayer.y + this.boss.y) * 0.5 - 36 + Math.sin(perpAngle) * sideShift * 0.6;

      if (!this._clashSavedZoom) {
        this._clashSavedZoom = this.camera.targetZoom;
      }
      // Add a punchy zoom-in & subtle angle kick on every successful parry press!
      this.camera.targetZoom = Math.min(1.74, baseDuelZoom + parryFlash * 0.09);
      this.camera.targetAngle = targetTiltAngle + (parryFlash * 0.06 * (attemptIdx % 2 === 0 ? 1 : -1));
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
      isLocalClashing
    );
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

    const loot = this.forge.grantRaidClearLoot(this.boss.leftPauldronBroken, this.boss.rightPauldronBroken);
    const totalSeals = this.forge.state.materials.vaelgor_seal || 0;
    const modal = document.getElementById('victory-modal');
    const summary = document.getElementById('victory-loot-summary');

    if (summary) {
      const essenceDropHtml = loot.vaelgor_essence > 0
        ? `<div class="loot-item" style="border-color:#f43f5e;background:rgba(225,29,72,0.22);color:#fda4af">
             🔮 ABYSSAL ESSENCE ACQUIRED! +${loot.vaelgor_essence} Vaelgor's Abyssal Essence!
           </div>`
        : `<div class="loot-item" style="color:#94a3b8">
             🎲 Base Abyssal Essence (10% Drop): Not dropped (Rolled ${loot.essenceRollPct}%)
           </div>`;

      const bonusCoresHtml = (loot.bonusCores && loot.bonusCores.length > 0)
        ? loot.bonusCores.map(c => `
            <div class="loot-item" style="border-color:${c.color};background:rgba(15,23,42,0.85);color:${c.color};font-weight:800">
              💥 [${c.source} — ${c.tier}]: ${c.rewardText}
            </div>
          `).join('')
        : `<div class="loot-item" style="color:#64748b">
             🛡️ 0/2 Pauldron Cores Broken — Target Vaelgor's Left &amp; Right Shoulders for +2 Randomized Bonus Cores!
           </div>`;

      summary.innerHTML = `
        <div class="loot-grid">
          <div class="loot-item" style="border-color:#38bdf8;color:#7dd3fc">
            🏅 +${loot.vaelgor_seal} Vaelgor's Eclipse Seal (Now ${totalSeals}/5)
          </div>
          ${essenceDropHtml}
          ${bonusCoresHtml}
          <div class="loot-item">🪙 +${loot.gold} Gold</div>
          <div class="loot-item">🩸 +${loot.obsidian_shard} Obsidian Shards</div>
          <div class="loot-item" style="color:#facc15">
            🛡️ +${loot.pauldron_fragment} Total Pauldron Fragments (${this.boss.getBrokenCoresCount()}/2 Cores Shattered)
          </div>
        </div>
      `;
    }
    if (modal) modal.classList.remove('hidden');
    this.updateAllUI();
  }

  updateRealtimeHUD() {
    const p = this.localPlayer;
    const hpFill = document.getElementById('hud-hp-fill');
    const hpText = document.getElementById('hud-hp-text');
    if (hpFill && hpText) {
      hpFill.style.width = `${Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100))}%`;
      hpText.textContent = `${p.hp} / ${p.maxHp}${p.shield > 0 ? ` (+${Math.round(p.shield)})` : ''}`;
    }

    const opFill = document.getElementById('hud-overpower-fill');
    const opText = document.getElementById('hud-overpower-text');
    if (opFill && opText) {
      const pct = p.overpowerSurge ? ((p.surgeTimer / 14.0) * 100) : ((p.overpower / p.maxOverpower) * 100);
      opFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      opFill.style.background = p.overpowerSurge
        ? 'linear-gradient(90deg, #f59e0b, #fde047)'
        : 'linear-gradient(90deg, #0284c7, #38bdf8)';
      const zReady = !p.overpowerSurge && p.overpower >= 100 && (p.cds.z || 0) <= 0.05;
      opText.textContent = p.overpowerSurge
        ? `🔥 SURGE (${p.surgeTimer.toFixed(1)}s)`
        : `OVERPOWER ${Math.round(p.overpower)}% ${zReady ? '[Z READY]' : ((p.cds.z || 0) > 0.05 ? `[Z CD ${Math.ceil(p.cds.z)}s]` : '')}`;
    }

    const bossCounterable = (this.mode === 'raid' && this.boss && typeof this.boss.isCounterable === 'function' && this.boss.isCounterable());

    ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z', 'space'].forEach(k => {
      const cdEl = document.getElementById(`cd-${k}`);
      const slotEl = document.getElementById(`slot-${k}`);
      if (cdEl) {
        const rem = p.cds[k] || 0;
        if (rem > 0.05) {
          cdEl.style.display = 'flex';
          cdEl.textContent = rem >= 10 ? Math.ceil(rem) : rem.toFixed(1);
        } else {
          cdEl.style.display = 'none';
        }
      }
      if (slotEl && k === 'w') {
        slotEl.classList.toggle('primed-glow', p.tackleComboPrimed > 0);
      }
      if (slotEl && k === 'f') {
        slotEl.classList.toggle('primed-glow', p.parryRipostePrimed > 0);
      }
      if (slotEl && k === 'd') {
        slotEl.classList.toggle('counter-ready-glow', bossCounterable && p.cds.d <= 0.05);
      }
      if (slotEl && k === 'z') {
        slotEl.classList.toggle('primed-glow', !p.overpowerSurge && p.overpower >= p.maxOverpower && (p.cds.z || 0) <= 0.05);
      }
    });

    if (this.mode === 'raid') {
      const b = this.boss;
      const totalFrac = Math.max(0, b.hp / b.maxHp);
      const barsLeft = Math.ceil(totalFrac * b.hpBars);
      const barStep = b.maxHp / b.hpBars;
      const currentBarFrac = b.hp > 0 ? ((b.hp % barStep) / barStep || 1.0) : 0;

      const bossHpFill = document.getElementById('boss-hp-fill');
      const bossHpText = document.getElementById('boss-hp-text');
      const bossBarCount = document.getElementById('boss-bar-count');
      if (bossHpFill) bossHpFill.style.width = `${currentBarFrac * 100}%`;
      if (bossHpText) {
        const has99DR = !b.finalPhase && (b.hp <= b.maxHp * 0.105 || b.finalTransitionPending || b.finalTransitionActive || b.state === 'final_phase_mechanic');
        const tag = has99DR ? ' • 🛡️ 99% DR' : (b.finalPhase ? ' • 🌑 ECLIPSE SOVEREIGN' : '');
        bossHpText.textContent = `${b.hp.toLocaleString()} (${Math.round(totalFrac * 100)}%)${tag}`;
      }
      if (bossBarCount) bossBarCount.textContent = `x${barsLeft}`;

      const enrageEl = document.getElementById('boss-enrage-timer');
      if (enrageEl) {
        if (b.enraged) {
          enrageEl.textContent = '💀 BERSERK';
          enrageEl.classList.add('enraged');
        } else {
          const rem = Math.max(0, Math.ceil(b.enrageTimer ?? 240));
          const mins = String(Math.floor(rem / 60)).padStart(2, '0');
          const secs = String(rem % 60).padStart(2, '0');
          enrageEl.textContent = `⏳ ${mins}:${secs}`;
          enrageEl.classList.toggle('enraged', rem <= 30);
        }
      }

      const stagFill = document.getElementById('boss-stagger-fill');
      if (stagFill) stagFill.style.width = `${Math.min(100, (b.stagger / b.maxStagger) * 100)}%`;

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

    const worldRenderables = [];
    for (const member of this.party) {
      worldRenderables.push({
        y: member.y,
        draw: () => member.draw(ctx)
      });
    }

    if (this.mode === 'raid') {
      worldRenderables.push({
        y: this.boss.y,
        draw: () => this.boss.draw(ctx)
      });
    } else {
      worldRenderables.push({
        y: this.hubDummy.y,
        draw: () => this.drawHubTrainingDummy(ctx)
      });
    }

    worldRenderables.sort((a, b) => a.y - b.y);
    for (const r of worldRenderables) r.draw();

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

    // Clashing-Player-Only Cinematic Letterbox Bars, Speedlines & Vignette during 15% HP Final Clash!
    if (
      this.mode === 'raid' &&
      this.boss &&
      this.boss.state === 'final_clash_mechanic' &&
      this.boss.clashPhase === 'active_clash' &&
      this.boss.clashPlayerId === this.localPlayer.id
    ) {
      ctx.save();
      // Radial focus vignette so the clashing player's screen feels like an intimate cinematic duel!
      const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.24, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(0.7, 'rgba(2, 6, 23, 0.42)');
      vig.addColorStop(1, 'rgba(2, 4, 12, 0.85)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      const barH = Math.round(H * 0.105);
      ctx.fillStyle = 'rgba(2, 4, 10, 0.95)';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, barH);
      ctx.lineTo(W, barH);
      ctx.moveTo(0, H - barH);
      ctx.lineTo(W, H - barH);
      ctx.stroke();

      // Cinematic Duel Title in Letterbox Bar (without revealing future button sequences!)
      const curAttempt = (Array.isArray(this.localPlayer.clashAttempts) &&
        this.localPlayer.clashAttempts[this.localPlayer.clashAttemptIndex]) || { label: 'ECLIPSE CLASH' };
      ctx.font = '900 13px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(
        `⚔️ ECLIPSE SOVEREIGN DUEL — DEFLECT VAELGOR'S LETHAL ATTEMPTS WITH [E] & [W]!`,
        W * 0.5,
        barH * 0.55
      );
      ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#fde047';
      ctx.fillText(
        `CURRENT ATTACK: ${curAttempt.label} • ALLIES ARE FREE TO UNLEASH FULL DPS!`,
        W * 0.5,
        H - barH * 0.45
      );
      ctx.restore();
    }
  }

  drawHubEnvironment(ctx) {
    const time = performance.now() * 0.002;
    ctx.save();
    ctx.scale(1, PERSPECTIVE_TILT);

    const floorGrad = ctx.createRadialGradient(0, 0, 40, 0, 0, this.arenaRadius);
    floorGrad.addColorStop(0, '#1e293b');
    floorGrad.addColorStop(0.65, '#0f172a');
    floorGrad.addColorStop(1, '#060911');
    ctx.fillStyle = floorGrad;
    ctx.beginPath();
    ctx.arc(0, 0, this.arenaRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.22)';
    ctx.lineWidth = 3;
    [160, 320, 490].forEach(r => {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();

    for (const st of this.hubStations) {
      const dist = Math.hypot(this.localPlayer.x - st.x, this.localPlayer.y - st.y);
      const isNear = dist < st.radius + 55;
      const pulse = 0.7 + Math.sin(time * 3) * 0.3;

      ctx.save();
      ctx.translate(st.x, st.y);

      ctx.save();
      ctx.scale(1, PERSPECTIVE_TILT);
      ctx.fillStyle = isNear ? 'rgba(250, 204, 21, 0.18)' : 'rgba(15, 23, 42, 0.55)';
      ctx.strokeStyle = isNear ? '#fde047' : st.color;
      ctx.lineWidth = isNear ? 3.2 : 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, st.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (st.id === 'forge') {
        ctx.fillStyle = '#7c2d12';
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-28, -18, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f97316';
        ctx.shadowColor = '#fb923c';
        ctx.shadowBlur = 18 * pulse;
        ctx.beginPath();
        ctx.arc(-28, -22, 9 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.roundRect(-12, -26, 36, 18, 4);
        ctx.fill();
        ctx.stroke();
      } else if (st.id === 'portal') {
        const archGrad = ctx.createRadialGradient(0, -58, 8, 0, -58, 56);
        archGrad.addColorStop(0, '#000000');
        archGrad.addColorStop(0.55, '#881337');
        archGrad.addColorStop(0.85, '#f43f5e');
        archGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = archGrad;
        ctx.beginPath();
        ctx.ellipse(0, -58, 46, 62, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fda4af';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, -58, 38, 54, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (st.id === 'coop_board') {
        ctx.fillStyle = '#451a03';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.fillRect(-26, -54, 52, 34);
        ctx.strokeRect(-26, -54, 52, 34);
      } else if (st.id === 'clock_practice') {
        // Floating Astral Astrolabe Dial & Monolith Shrine in the Hub
        ctx.save();
        ctx.translate(0, -36);
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.stroke();

        ctx.rotate(time * 1.4);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -18);
        ctx.moveTo(0, 0);
        ctx.lineTo(14, 0);
        ctx.stroke();
        ctx.restore();
      } else if (st.id === 'final_phase_practice') {
        // Pale Eclipse Black-Sun & Upright Greatsword Shrine in the Hub
        ctx.save();
        ctx.translate(0, -44);

        const eclipseGrad = ctx.createRadialGradient(0, -12, 4, 0, -12, 32);
        eclipseGrad.addColorStop(0, '#090514');
        eclipseGrad.addColorStop(0.45, '#581c87');
        eclipseGrad.addColorStop(0.75, '#e11d48');
        eclipseGrad.addColorStop(0.92, '#f8fafc');
        eclipseGrad.addColorStop(1, 'rgba(248, 250, 252, 0)');
        ctx.fillStyle = eclipseGrad;
        ctx.beginPath();
        ctx.arc(0, -12, 30 * (0.92 + pulse * 0.12), 0, Math.PI * 2);
        ctx.fill();

        // Pale Eclipse Corona Ring
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, -12, 16, 0, Math.PI * 2);
        ctx.stroke();

        // Upright Empowered Greatsword Silhouette piercing the Eclipse Orb
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(0, 24);
        ctx.lineTo(0, -32);
        ctx.moveTo(-11, 10);
        ctx.lineTo(11, 10);
        ctx.stroke();
        ctx.restore();
      } else if (st.id === 'final_clash_practice') {
        // Crossed Greatswords & Glowing Blue [G] Clash Circle Shrine in the Hub
        ctx.save();
        ctx.translate(0, -40);

        const clashGrad = ctx.createRadialGradient(0, -6, 3, 0, -6, 30);
        clashGrad.addColorStop(0, 'rgba(224, 242, 254, 0.95)');
        clashGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.65)');
        clashGrad.addColorStop(0.85, 'rgba(192, 132, 252, 0.35)');
        clashGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = clashGrad;
        ctx.beginPath();
        ctx.arc(0, -6, 28 * (0.92 + pulse * 0.14), 0, Math.PI * 2);
        ctx.fill();

        // Shrinking Rhythm Ring Preview
        const ringR = 12 + ((1 - ((time * 0.9) % 1)) * 14);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, -6, ringR, 0, Math.PI * 2);
        ctx.stroke();

        // Crossed Greatswords Locked in Clash
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(-18, 16);
        ctx.lineTo(18, -26);
        ctx.moveTo(18, 16);
        ctx.lineTo(-18, -26);
        ctx.stroke();

        // Gold Clash Spark at Intersection
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(0, -5, 4.5 + pulse * 2.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.font = '800 12px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText(st.name, 0, -st.radius * 0.85 - 38);
      ctx.font = '600 10.5px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = isNear ? '#fde047' : '#cbd5e1';
      ctx.fillText(st.subtitle, 0, -st.radius * 0.85 - 22);
      ctx.restore();
    }
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
