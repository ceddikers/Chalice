// =========================================================================
// NETWORK_COOP.JS — WebRTC PeerJS Co-op Multiplayer + Solo AI Vanguard Fallback
// Syncs 2.5D Weapon Model IDs, Breaker Skills, & Boss State
// =========================================================================

class RaidCoopNetwork {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.roomId = '';
    this.isHost = true;
    this.connectedPeers = new Map();
    this.remotePlayers = new Map();
    this.soloAiCount = 0; // Default: 0 AI Companions (Pure Solo 1v1 by default; optional via Co-op Board!)
    this.syncTimer = 0;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'VAEL-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  hostRoom(onStatus) {
    if (!window.Peer) {
      if (onStatus) onStatus('PeerJS library not loaded — Running in Solo Mode.');
      return;
    }
    this.roomId = this.generateRoomCode();
    this.isHost = true;
    try {
      this.peer = new Peer(this.roomId);
      this.peer.on('open', (id) => {
        if (this.game && this.game.localPlayer) {
          this.game.localPlayer.id = id;
        }
        if (onStatus) onStatus(`Hosting Co-op Room: ${id} (Share code with friends or raid solo)`);
      });
      this.peer.on('connection', (conn) => {
        this.setupConnection(conn);
      });
      this.peer.on('error', (err) => {
        if (onStatus) onStatus(`Network notice: ${err.type || 'Offline'} — Solo Mode Active`);
      });
    } catch (e) {
      if (onStatus) onStatus('Offline Mode — Solo Mode Active');
    }
  }

  joinRoom(targetCode, onStatus) {
    if (!window.Peer || !targetCode) return;
    const cleanCode = targetCode.trim().toUpperCase();
    this.isHost = false;
    try {
      this.peer = new Peer();
      this.peer.on('open', (id) => {
        if (this.game && this.game.localPlayer) {
          this.game.localPlayer.id = id;
        }
        const conn = this.peer.connect(cleanCode);
        this.setupConnection(conn);
        if (onStatus) onStatus(`Connecting to Co-op Room ${cleanCode}...`);
      });
      this.peer.on('error', (err) => {
        this.isHost = true;
        if (onStatus) onStatus(`Could not reach ${cleanCode} (${err.type}) — Reverted to Solo Host Mode`);
      });
    } catch (e) {
      this.isHost = true;
    }
  }

  setupConnection(conn) {
    conn.on('open', () => {
      this.connectedPeers.set(conn.peer, conn);
      if (!this.remotePlayers.has(conn.peer)) {
        const ally = new BreakerPlayer25D(conn.peer, `Warden-${conn.peer.slice(-3)}`, this.game.localPlayer.x + 55, this.game.localPlayer.y, false, false);
        this.remotePlayers.set(conn.peer, ally);
        this.game.rebuildPartyRoster();
      }
    });

    conn.on('data', (data) => {
      this.handlePacket(conn.peer, data);
    });

    conn.on('close', () => {
      this.connectedPeers.delete(conn.peer);
      this.remotePlayers.delete(conn.peer);
      this.game.rebuildPartyRoster();
    });
  }

  handlePacket(senderId, data) {
    if (!data || !data.type) return;

    if (data.type === 'player_state') {
      const peerPlayerId = data.playerId || senderId;
      let ally = this.remotePlayers.get(senderId);
      if (!ally) {
        ally = new BreakerPlayer25D(peerPlayerId, data.name || 'Co-op Warden', data.x, data.y, false, false);
        this.remotePlayers.set(senderId, ally);
        this.game.rebuildPartyRoster();
      }
      ally.id = peerPlayerId;
      ally.name = data.name || ally.name;
      ally.x = data.x;
      ally.y = data.y;
      ally.targetX = data.targetX;
      ally.targetY = data.targetY;
      ally.facingAngle = data.facingAngle;
      ally.hp = data.hp;
      ally.maxHp = data.maxHp;
      ally.shield = data.shield || 0;
      if (data.state === 'idle' || data.state === 'walk' || data.state === 'r_charge' || data.state === 'clash_lock') {
        ally.state = data.state;
      }
      if (typeof data.rChargeTime === 'number') {
        ally.rChargeTime = data.rChargeTime;
      }
      ally.weaponModelId = data.weaponModelId || 'warden_steel';
      ally.weaponColor = data.weaponColor || '#38bdf8';
      ally.armorTint = data.armorTint || '#1e293b';
      ally.trimColor = data.trimColor || '#fbbf24';
      ally.overpowerSurge = !!data.overpowerSurge;
      if (typeof data.rooted === 'boolean') ally.rooted = data.rooted;
      if (typeof data.rootStagger === 'number') ally.rootStagger = data.rootStagger;
      if (typeof data.rootMaxStagger === 'number') ally.rootMaxStagger = data.rootMaxStagger;
      if (typeof data.qteActive === 'boolean') ally.qteActive = data.qteActive;
      if (typeof data.clashQteActive === 'boolean') ally.clashQteActive = data.clashQteActive;
      if (typeof data.clashCompletedBeats === 'number') ally.clashCompletedBeats = data.clashCompletedBeats;
      if (typeof data.clashTotalBeats === 'number') ally.clashTotalBeats = data.clashTotalBeats;
    } else if (data.type === 'player_qte_root') {
      const target = (this.game.party || []).find(p => p.id === data.targetId) || this.remotePlayers.get(senderId) || null;
      if (target && typeof target.applyEclipseRoot === 'function') {
        target.applyEclipseRoot(true);
      }
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'player_root_hit') {
      const target = (this.game.party || []).find(p => p.id === data.targetId) || null;
      if (target && typeof target.damageEclipseRoot === 'function') {
        target.damageEclipseRoot(data.dmg || 35, null, true);
        if (data.broken) {
          target.rooted = false;
          target.rootStagger = 0;
        }
      }
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'player_skill') {
      const ally = this.remotePlayers.get(senderId);
      if (ally) {
        if (data.skill === 'basic') ally.triggerBasicAttack(data.aimX, data.aimY);
        else ally.triggerSkill(data.skill, data.aimX, data.aimY, this.game.boss);
      }
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'player_skill_release') {
      const ally = this.remotePlayers.get(senderId);
      if (ally && data.skill === 'r') {
        ally.state = 'r_charge';
        ally.rChargeTime = data.rChargeTime || 0.5;
        if (typeof data.facingAngle === 'number') ally.facingAngle = data.facingAngle;
        ally.fireCrescentWaveSlash(true);
      }
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'boss_pattern' && !this.isHost && this.game.boss) {
      const b = this.game.boss;
      if (typeof data.x === 'number') b.x = data.x;
      if (typeof data.y === 'number') b.y = data.y;
      if (typeof data.facingAngle === 'number') b.facingAngle = data.facingAngle;
      b.activeTargetId = data.targetId || null;
      const tgt = (this.game.party || []).find(p => p.id === data.targetId) || this.game.localPlayer;
      b.triggerPatternByName(data.pattern, tgt, true);
    } else if (data.type === 'boss_hit' && this.game.boss) {
      const attacker = (this.game.party || []).find(p => p.id === data.attackerId) || this.remotePlayers.get(senderId) || null;
      this.game.boss.receiveDamage(data.dmg, data.staggerAmt, attacker, {
        fromNetwork: true,
        isStrongMove: !!data.isStrongMove,
        impulseStrength: data.impulseStrength || 1.0,
        threatMult: data.threatMult || 1.0,
        posType: data.posType || 'normal',
        partBreakMult: data.partBreakMult !== undefined ? data.partBreakMult : (data.isStrongMove ? 1.0 : 0.35),
        pauldronSide: data.pauldronSide || null,
        hitX: data.hitX,
        hitY: data.hitY
      });
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'boss_event' && this.game.boss) {
      const b = this.game.boss;
      if (data.event === 'eclipse_sword_target') {
        b.eclipseCracks = data.cracks ?? b.eclipseCracks;
        b.eclipseCracksNeeded = data.cracksNeeded ?? b.eclipseCracksNeeded;
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.startNextEclipseBaitSword(living, data.targetId);
        if (typeof data.x === 'number') b.eclipseSwordX = data.x;
        if (typeof data.y === 'number') b.eclipseSwordY = data.y;
      } else if (data.event === 'eclipse_sword_lock') {
        b.lockEclipseBaitSword(data.x, data.y, true);
      } else if (data.event === 'eclipse_stagger_phase') {
        if (b.state !== 'eclipse_mechanic') b.triggerMechanicEclipse(true);
        b.enterEclipseStaggerCheckPhase(true);
      } else if (data.event === 'horizon_slash') {
        b.startHorizonMemoryFlash(data.slashIndex ?? 0, data.sequence || null, true, data.shifts || null);
      } else if (data.event === 'horizon_clash_phase') {
        if (Array.isArray(data.sequence)) b.horizonSequence = data.sequence;
        if (Array.isArray(data.shifts)) b.horizonOrbitShifts = data.shifts;
        b.startHorizonSolveStep(data.slashIndex ?? 0, true);
      } else if (data.event === 'horizon_step_result') {
        b.horizonSlashIndex = data.slashIndex ?? b.horizonSlashIndex;
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.resolveHorizonPuzzleStep(living, data.success, true);
        if (typeof data.solvedCount === 'number') b.horizonSolvedCount = data.solvedCount;
      } else if (data.event === 'horizon_failed') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.executeEclipseCataclysmWipe(living);
        b.horizonPhase = 'none';
        b.state = 'idle';
        if (typeof data.x === 'number') b.x = data.x;
        if (typeof data.y === 'number') b.y = data.y;
        b.targetX = b.x;
        b.targetY = b.y;
        b.speed = 0;
        b.snapFeetToBody();
        if (window.updateMechanicHUD) window.updateMechanicHUD(false);
      } else if (data.event === 'stagger_state') {
        if (typeof data.x === 'number') b.x = data.x;
        if (typeof data.y === 'number') b.y = data.y;
        if (typeof data.facingAngle === 'number') b.facingAngle = data.facingAngle;
        b.enterStaggerState(data.bannerText || '💥 STAGGER BROKEN!', true);
      } else if (data.event === 'iaido_ambush') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.startNextIaidoAmbush(living, data);
      } else if (data.event === 'iaido_grab') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.enterIaidoGrabStagger(living, data.targetId, true);
      } else if (data.event === 'guillotine_lock') {
        b.leapLocked = true;
        if (typeof data.startX === 'number') b.leapStartX = data.startX;
        if (typeof data.startY === 'number') b.leapStartY = data.startY;
        if (typeof data.targetX === 'number') b.leapTargetX = data.targetX;
        if (typeof data.targetY === 'number') b.leapTargetY = data.targetY;
        if (typeof data.baseFacing === 'number') b.baseFacing = data.baseFacing;
      } else if (data.event === 'mirage_dash') {
        b.patStep = Math.max(b.patStep || 0, data.step || 1);
        const oldX = b.x, oldY = b.y;
        if (typeof data.x === 'number') b.x = data.x;
        if (typeof data.y === 'number') b.y = data.y;
        if (typeof data.dashAng === 'number') {
          b.facingAngle = data.dashAng;
          b.mirageDashAng = data.dashAng;
        }
        b.snapFeetToBody();
        if (window.fx && Math.hypot(b.x - oldX, b.y - oldY) > 15) {
          window.fx.addAfterimage(oldX, oldY, b.facingAngle, '#c084fc');
          window.fx.addAfterimage((oldX + b.x) * 0.5, (oldY + b.y) * 0.5, b.facingAngle, '#e11d48');
          window.fx.addRiftLine(oldX, oldY - 12, b.x, b.y - 12, 0.58);
        }
      } else if (data.event === 'damocles_drop') {
        b.patStep = Math.max(b.patStep || 0, data.step || 1);
        if (typeof audio !== 'undefined' && audio) audio.playParryClang(false);
        if (window.fx) {
          if (typeof data.dropX === 'number' && typeof data.dropY === 'number') {
            window.fx.spawnColossalExecutionSword(data.dropX, data.dropY, 0.82);
          }
          if (typeof data.skyX === 'number' && typeof data.skyY === 'number') {
            window.fx.spawnSkySword(data.skyX, data.skyY, 0.65);
          }
        }
      } else if (data.event === 'dreadnought_rush') {
        if (typeof data.startX === 'number') b.chargeStartX = data.startX;
        if (typeof data.startY === 'number') b.chargeStartY = data.startY;
        if (typeof data.endX === 'number') b.chargeEndX = data.endX;
        if (typeof data.endY === 'number') b.chargeEndY = data.endY;
        if (typeof data.baseFacing === 'number') {
          b.baseFacing = data.baseFacing;
          b.facingAngle = data.baseFacing;
        }
      } else if (data.event === 'phantom_blink') {
        b.patStep = Math.max(b.patStep || 0, 1);
        b.counterableWindow = false;
        const oldX = b.x, oldY = b.y;
        if (typeof data.x === 'number') b.x = data.x;
        if (typeof data.y === 'number') b.y = data.y;
        if (typeof data.facingAngle === 'number') {
          b.facingAngle = data.facingAngle;
          b.baseFacing = data.facingAngle;
        }
        b.snapFeetToBody();
        if (window.fx && Math.hypot(b.x - oldX, b.y - oldY) > 15) {
          window.fx.addAfterimage(oldX, oldY, b.facingAngle);
          window.fx.addAfterimage((oldX + b.x) * 0.5, (oldY + b.y) * 0.5, b.facingAngle);
          window.fx.addSonicBoomRings(oldX, oldY, b.x, b.y, 4, '#c084fc');
        }
      } else if (data.event === 'blood_rain_backstep') {
        b.patStep = Math.max(b.patStep || 0, 1);
        const oldX = b.x, oldY = b.y;
        if (typeof data.x === 'number') b.x = data.x;
        if (typeof data.y === 'number') b.y = data.y;
        if (typeof data.facingAngle === 'number') {
          b.facingAngle = data.facingAngle;
          b.baseFacing = data.facingAngle;
        }
        b.snapFeetToBody();
        if (window.fx && Math.hypot(b.x - oldX, b.y - oldY) > 15) {
          window.fx.addAfterimage(oldX, oldY, b.facingAngle, '#e11d48');
          window.fx.addShockwave(oldX, oldY, 125, '#f43f5e', 4.5);
        }
      } else if (data.event === 'blood_rain_wave') {
        b.patStep = Math.max(b.patStep || 0, data.step || 2);
        if (typeof audio !== 'undefined' && audio) audio.playParryClang(false);
        if (window.fx && Array.isArray(data.drops)) {
          for (const d of data.drops) {
            if (d.colossal) window.fx.spawnColossalExecutionSword(d.x, d.y, 0.72);
            else window.fx.spawnSkySword(d.x, d.y, 0.58);
          }
        }
      } else if (data.event === 'blood_rain_lunge') {
        b.patStep = Math.max(b.patStep || 0, 6);
        b.counterableWindow = false;
        const oldX = b.x, oldY = b.y;
        if (typeof data.x === 'number') b.x = data.x;
        if (typeof data.y === 'number') b.y = data.y;
        if (typeof data.baseFacing === 'number') {
          b.baseFacing = data.baseFacing;
          b.facingAngle = data.baseFacing;
        }
        b.snapFeetToBody();
        if (window.fx && Math.hypot(b.x - oldX, b.y - oldY) > 15) {
          window.fx.addSonicBoomRings(oldX, oldY, b.x, b.y, 6, '#e11d48');
          window.fx.addFissureLine(oldX, oldY, b.x, b.y, '#e11d48', 5);
          window.fx.addShockwave(b.x, b.y, 145, '#f43f5e', 6);
        }
      } else if (data.event === 'counter_stagger') {
        const counterPlayer = (this.game.party || []).find(p => p.id === data.playerId) || null;
        b.executeCounterStagger(counterPlayer, true);
      } else if (data.event === 'ultimate_lock') {
        b.lockInPlaceForUltimate(data.duration || 2.15, data.downedDuration || 4.0, true);
      } else if (data.event === 'final_phase_start') {
        b.triggerMechanicFinalPhase(true);
      } else if (data.event === 'final_dash_step') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.startFinalDashStep(data.step ?? 0, living, data);
      } else if (data.event === 'final_grab_wipe') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.triggerFinalGrabWipe(living, data.targetId, true);
      } else if (data.event === 'final_roar_qte') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        if (typeof data.maxStagger === 'number') {
          b.finalSpiritBombMaxStagger = data.maxStagger;
          b.finalSpiritBombStagger = data.maxStagger;
        }
        b.enterFinalRoarAndQte(living, true);
      } else if (data.event === 'final_spirit_bomb_wipe') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.triggerFinalSpiritBombWipe(living, true);
      } else if (data.event === 'final_sword_absorb') {
        b.enterFinalSwordAbsorbCutscene(true);
      } else if (data.event === 'final_clash_start') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.triggerMechanicFinalClash(living, data);
      } else if (data.event === 'final_clash_lock') {
        const clashingPlayer = (this.game.party || []).find(p => p.id === data.playerId) || null;
        if (clashingPlayer) b.initiateFinalClash(clashingPlayer, true);
      } else if (data.event === 'final_clash_beat') {
        const clashingPlayer = (this.game.party || []).find(p => p.id === data.playerId) || null;
        b.onClashBeatProgress(
          clashingPlayer,
          data.beatIdx ?? data.beatStep ?? 1,
          true,
          data.attemptIdx || 0,
          data.subIdx || 0,
          data.completedStyle || 'overhead_crush',
          data.nextStyle || 'overhead_crush'
        );
      } else if (data.event === 'final_clash_success') {
        b.completeFinalClashSuccess(true);
      } else if (data.event === 'final_clash_wipe') {
        b.executeFinalClashWipe(true);
      }
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'boss_sync' && !this.isHost && this.game.boss) {
      const b = this.game.boss;
      const wasInMajorMech = (
        b.state === 'eclipse_mechanic' ||
        b.state === 'iaido_mechanic' ||
        b.state === 'horizon_mechanic' ||
        b.state === 'final_phase_mechanic' ||
        b.state === 'final_clash_mechanic'
      );
      const hostInMajorMech = (
        data.state === 'eclipse_mechanic' ||
        data.state === 'iaido_mechanic' ||
        data.state === 'horizon_mechanic' ||
        data.state === 'final_phase_mechanic' ||
        data.state === 'final_clash_mechanic'
      );

      // If Host exited a major mechanic (e.g. Clock Mechanic or Final Phase transition finished into staggered/idle/walk), immediately clean up Guest mechanic state!
      if (wasInMajorMech && !hostInMajorMech) {
        b.releaseIaidoGrabbedPlayer();
        b.releaseFinalGrabbedPlayer();
        b.eclipseActive = false;
        b.eclipsePhase = 'none';
        b.horizonPhase = 'none';
        b.iaidoPhase = 'none';
        b.finalMechPhase = 'none';
        b.clashPhase = 'none';
        b.clashPlayerId = null;
        for (const p of (this.game.party || [])) {
          if (p && typeof p.clearEclipseQteAndRoot === 'function') p.clearEclipseQteAndRoot();
          if (p && typeof p.clearClashRhythmQte === 'function') p.clearClashRhythmQte();
        }
        if (window.updateMechanicHUD) window.updateMechanicHUD(false);
        b.state = data.state;
        if (typeof data.stateDuration === 'number') b.stateDuration = data.stateDuration;
        if (typeof data.stateTimer === 'number') b.stateTimer = data.stateTimer;
      }

      // Smoothly sync position & gauges, and self-heal if Guest ever missed a transition packet!
      if (
        b.state === 'idle' ||
        b.state === 'walk' ||
        b.state === 'staggered' ||
        b.state === 'pat_eclipse_blender' ||
        data.state === 'staggered' ||
        data.state === 'flinched' ||
        data.state === 'idle' ||
        data.state === 'walk' ||
        (data.state === 'eclipse_mechanic' && b.state !== 'eclipse_mechanic') ||
        (data.state === 'iaido_mechanic' && b.state !== 'iaido_mechanic') ||
        (data.state === 'horizon_mechanic' && b.state !== 'horizon_mechanic') ||
        (data.state === 'final_phase_mechanic' && b.state !== 'final_phase_mechanic') ||
        (data.state === 'final_clash_mechanic' && b.state !== 'final_clash_mechanic')
      ) {
        const prevState = b.state;
        b.x = data.x;
        b.y = data.y;
        if (b.state !== 'pat_eclipse_blender') {
          b.facingAngle = data.facingAngle;
        }
        b.state = data.state;
        if (data.state === 'staggered') {
          b.speed = 0;
          b.vx = 0;
          b.vy = 0;
          if (typeof data.stateDuration === 'number') b.stateDuration = data.stateDuration;
          if (typeof data.stateTimer === 'number' && (prevState !== 'staggered' || Math.abs(b.stateTimer - data.stateTimer) > 0.35)) {
            b.stateTimer = data.stateTimer;
          } else if (prevState !== 'staggered') {
            b.stateDuration = 4.2;
            b.stateTimer = 4.2;
          }
        }
      }
      b.targetX = data.targetX ?? data.x;
      b.targetY = data.targetY ?? data.y;
      if (typeof data.speed === 'number' && (b.state === 'idle' || b.state === 'walk' || b.state === 'staggered')) {
        b.speed = data.speed;
      }
      b.hp = data.hp;
      if (data.maxHp) b.maxHp = data.maxHp;
      b.stagger = data.stagger;
      if (data.maxStagger) b.maxStagger = data.maxStagger;
      if (typeof data.partBreak === 'number') b.partBreak = data.partBreak;
      if (data.partBreakMax) b.partBreakMax = data.partBreakMax;
      if (typeof data.leftPartBreak === 'number') b.leftPartBreak = data.leftPartBreak;
      if (typeof data.rightPartBreak === 'number') b.rightPartBreak = data.rightPartBreak;
      if (typeof data.leftPauldronBroken === 'boolean') b.leftPauldronBroken = data.leftPauldronBroken;
      if (typeof data.rightPauldronBroken === 'boolean') b.rightPauldronBroken = data.rightPauldronBroken;
      if (typeof data.pauldronBroken === 'boolean') b.pauldronBroken = data.pauldronBroken;
      if (typeof data.enrageTimer === 'number') b.enrageTimer = data.enrageTimer;
      if (typeof data.enraged === 'boolean') b.enraged = data.enraged;
      if (typeof data.fractureStacks === 'number') b.fractureStacks = data.fractureStacks;
      if (typeof data.counterableWindow === 'boolean') b.counterableWindow = data.counterableWindow;
      if (typeof data.baseFacing === 'number') b.baseFacing = data.baseFacing;
      if (typeof data.leapTargetX === 'number') b.leapTargetX = data.leapTargetX;
      if (typeof data.leapTargetY === 'number') b.leapTargetY = data.leapTargetY;
      if (typeof data.chargeEndX === 'number') b.chargeEndX = data.chargeEndX;
      if (typeof data.chargeEndY === 'number') b.chargeEndY = data.chargeEndY;
      if (typeof data.mirageDashAng === 'number') b.mirageDashAng = data.mirageDashAng;

      // Sync 75% HP Eclipse Mechanic state & sword tracking indicator
      if (data.eclipsePhase) b.eclipsePhase = data.eclipsePhase;
      if (typeof data.eclipseTimer === 'number') b.eclipseTimer = data.eclipseTimer;
      if (typeof data.eclipseMaxTimer === 'number') b.eclipseMaxTimer = data.eclipseMaxTimer;
      if (typeof data.eclipseCracks === 'number') b.eclipseCracks = data.eclipseCracks;
      if (data.eclipseSwordState) b.eclipseSwordState = data.eclipseSwordState;
      if (data.eclipseSwordTargetId !== undefined) b.eclipseSwordTargetId = data.eclipseSwordTargetId;
      if (typeof data.eclipseSwordX === 'number' && b.eclipseSwordState === 'tracking') {
        b.eclipseSwordX += (data.eclipseSwordX - b.eclipseSwordX) * 0.45;
        b.eclipseSwordY += (data.eclipseSwordY - b.eclipseSwordY) * 0.45;
      } else if (typeof data.eclipseSwordX === 'number') {
        b.eclipseSwordX = data.eclipseSwordX;
        b.eclipseSwordY = data.eclipseSwordY;
      }
      if (typeof data.eclipseSwordTimer === 'number') b.eclipseSwordTimer = data.eclipseSwordTimer;
      if (typeof data.eclipseSwordMaxTimer === 'number') b.eclipseSwordMaxTimer = data.eclipseSwordMaxTimer;
      if (typeof data.eclipseStaggerCheck === 'number') b.eclipseStaggerCheck = data.eclipseStaggerCheck;
      if (data.eclipseStaggerCheckMax) b.eclipseStaggerCheckMax = data.eclipseStaggerCheckMax;

      // Sync 55% HP Echoing Iaido Mechanic state & fade/ambush timers
      if (data.iaidoPhase) b.iaidoPhase = data.iaidoPhase;
      if (typeof data.iaidoStep === 'number') b.iaidoStep = data.iaidoStep;
      if (typeof data.iaidoTimer === 'number') b.iaidoTimer = data.iaidoTimer;
      if (typeof data.iaidoMaxTimer === 'number') b.iaidoMaxTimer = data.iaidoMaxTimer;
      if (data.iaidoTargetId !== undefined) b.iaidoTargetId = data.iaidoTargetId;
      if (data.iaidoGrabbedPlayerId !== undefined) b.iaidoGrabbedPlayerId = data.iaidoGrabbedPlayerId;
      if (typeof data.iaidoStaggerCheck === 'number') b.iaidoStaggerCheck = data.iaidoStaggerCheck;
      if (data.iaidoStaggerCheckMax) b.iaidoStaggerCheckMax = data.iaidoStaggerCheckMax;

      // Sync 35% HP Constellation Obelisk Puzzle state & sequence
      if (data.horizonPhase) b.horizonPhase = data.horizonPhase;
      if (typeof data.horizonSlashIndex === 'number') b.horizonSlashIndex = data.horizonSlashIndex;
      if (typeof data.horizonSolvedCount === 'number') b.horizonSolvedCount = data.horizonSolvedCount;
      if (Array.isArray(data.horizonSequence)) b.horizonSequence = data.horizonSequence;
      if (typeof data.horizonTimer === 'number') b.horizonTimer = data.horizonTimer;
      if (typeof data.horizonMaxTimer === 'number') b.horizonMaxTimer = data.horizonMaxTimer;
      if (b.state === 'horizon_mechanic' && typeof data.facingAngle === 'number') {
        b.facingAngle = data.facingAngle;
      }

      // Sync <=10% HP Final Phase Transition & Empowered Final Phase state
      if (typeof data.finalPhase === 'boolean') b.finalPhase = data.finalPhase;
      if (typeof data.finalPhaseArena === 'boolean') b.finalPhaseArena = data.finalPhaseArena;
      if (typeof data.swordEmpowered === 'boolean') b.swordEmpowered = data.swordEmpowered;
      if (data.finalMechPhase) b.finalMechPhase = data.finalMechPhase;
      if (typeof data.finalDashStep === 'number') b.finalDashStep = data.finalDashStep;
      if (data.finalDashTargetId !== undefined) b.finalDashTargetId = data.finalDashTargetId;
      if (typeof data.finalSpiritBombStagger === 'number') b.finalSpiritBombStagger = data.finalSpiritBombStagger;
      if (typeof data.finalSpiritBombMaxStagger === 'number') b.finalSpiritBombMaxStagger = data.finalSpiritBombMaxStagger;
      if (typeof data.finalSpiritBombRadius === 'number') b.finalSpiritBombRadius = data.finalSpiritBombRadius;

      // Sync <=15% HP Final Clash Mechanic state
      if (data.clashPhase) b.clashPhase = data.clashPhase;
      if (data.clashPlayerId !== undefined) b.clashPlayerId = data.clashPlayerId;
      if (typeof data.clashStepIndex === 'number') b.clashStepIndex = data.clashStepIndex;
      if (typeof data.clashAttemptIndex === 'number') b.clashAttemptIndex = data.clashAttemptIndex;
      if (typeof data.clashSubHitIndex === 'number') b.clashSubHitIndex = data.clashSubHitIndex;
      if (data.clashCurrentStyle) b.clashCurrentStyle = data.clashCurrentStyle;

      if (data.activeTargetId !== undefined) b.activeTargetId = data.activeTargetId;
    } else if (data.type === 'start_raid') {
      this.game.enterRaidGate(false, !!data.clockPractice, !!data.finalPhasePractice, !!data.finalClashPractice);
    }
  }

  broadcast(packet) {
    for (const conn of this.connectedPeers.values()) {
      if (conn.open) {
        try { conn.send(packet); } catch (e) {}
      }
    }
  }

  broadcastExcept(excludePeerId, packet) {
    for (const [peerId, conn] of this.connectedPeers.entries()) {
      if (peerId !== excludePeerId && conn.open) {
        try { conn.send(packet); } catch (e) {}
      }
    }
  }

  update(dt) {
    if (this.connectedPeers.size === 0) return;
    this.syncTimer -= dt;
    if (this.syncTimer <= 0) {
      this.syncTimer = 0.06;
      const p = this.game.localPlayer;
      this.broadcast({
        type: 'player_state',
        playerId: p.id,
        name: p.name,
        x: Math.round(p.x),
        y: Math.round(p.y),
        targetX: Math.round(p.targetX),
        targetY: Math.round(p.targetY),
        facingAngle: Number(p.facingAngle.toFixed(2)),
        hp: p.hp,
        maxHp: p.maxHp,
        shield: Math.round(p.shield || 0),
        state: p.state,
        rChargeTime: Number((p.rChargeTime || 0).toFixed(2)),
        weaponModelId: p.weaponModelId,
        weaponColor: p.weaponColor,
        armorTint: p.armorTint,
        trimColor: p.trimColor,
        overpowerSurge: p.overpowerSurge,
        rooted: !!p.rooted,
        rootStagger: Math.round(p.rootStagger || 0),
        rootMaxStagger: p.rootMaxStagger || 140,
        qteActive: !!p.qteActive,
        clashQteActive: !!p.clashQteActive,
        clashCompletedBeats: p.clashCompletedBeats || 0,
        clashTotalBeats: p.clashTotalBeats || 7
      });

      if (this.isHost && this.game.mode === 'raid' && this.game.boss) {
        const b = this.game.boss;
        this.broadcast({
          type: 'boss_sync',
          x: Math.round(b.x),
          y: Math.round(b.y),
          targetX: Math.round(b.targetX),
          targetY: Math.round(b.targetY),
          hp: b.hp,
          maxHp: b.maxHp,
          stagger: Math.round(b.stagger),
          maxStagger: b.maxStagger,
          partBreak: Math.round(b.partBreak),
          partBreakMax: b.partBreakMax,
          leftPartBreak: Math.round(b.leftPartBreak || 0),
          rightPartBreak: Math.round(b.rightPartBreak || 0),
          leftPauldronBroken: !!b.leftPauldronBroken,
          rightPauldronBroken: !!b.rightPauldronBroken,
          pauldronBroken: !!b.pauldronBroken,
          enrageTimer: Number((b.enrageTimer ?? 240).toFixed(1)),
          enraged: !!b.enraged,
          fractureStacks: b.fractureStacks || 0,
          counterableWindow: !!b.counterableWindow,
          baseFacing: Number((b.baseFacing ?? b.facingAngle).toFixed(3)),
          leapTargetX: Math.round(b.leapTargetX || b.x),
          leapTargetY: Math.round(b.leapTargetY || b.y),
          chargeEndX: Math.round(b.chargeEndX || b.x),
          chargeEndY: Math.round(b.chargeEndY || b.y),
          mirageDashAng: Number((b.mirageDashAng ?? b.facingAngle).toFixed(3)),
          eclipsePhase: b.eclipsePhase,
          eclipseTimer: Number((b.eclipseTimer || 0).toFixed(2)),
          eclipseMaxTimer: Number((b.eclipseMaxTimer || 13.5).toFixed(2)),
          eclipseCracks: b.eclipseCracks || 0,
          eclipseSwordState: b.eclipseSwordState || 'none',
          eclipseSwordTargetId: b.eclipseSwordTargetId || null,
          eclipseSwordX: Math.round(b.eclipseSwordX || b.x),
          eclipseSwordY: Math.round(b.eclipseSwordY || b.y),
          eclipseSwordTimer: Number((b.eclipseSwordTimer || 0).toFixed(2)),
          eclipseSwordMaxTimer: Number((b.eclipseSwordMaxTimer || 1.45).toFixed(2)),
          eclipseStaggerCheck: Math.round(b.eclipseStaggerCheck || 0),
          eclipseStaggerCheckMax: b.eclipseStaggerCheckMax || 210,
          iaidoPhase: b.iaidoPhase,
          iaidoStep: b.iaidoStep || 0,
          iaidoTimer: Number((b.iaidoTimer || 0).toFixed(2)),
          iaidoMaxTimer: Number((b.iaidoMaxTimer || 1.25).toFixed(2)),
          iaidoTargetId: b.iaidoTargetId || null,
          iaidoGrabbedPlayerId: b.iaidoGrabbedPlayerId || null,
          iaidoStaggerCheck: Math.round(b.iaidoStaggerCheck || 0),
          iaidoStaggerCheckMax: b.iaidoStaggerCheckMax || 165,
          horizonPhase: b.horizonPhase,
          horizonSlashIndex: b.horizonSlashIndex || 0,
          horizonSolvedCount: b.horizonSolvedCount || 0,
          horizonSequence: b.horizonSequence || [0, 1, 2],
          horizonTimer: Number((b.horizonTimer || 0).toFixed(2)),
          horizonMaxTimer: Number((b.horizonMaxTimer || 1.55).toFixed(2)),
          finalPhase: !!b.finalPhase,
          finalPhaseArena: !!b.finalPhaseArena,
          swordEmpowered: !!b.swordEmpowered,
          finalMechPhase: b.finalMechPhase || 'none',
          finalDashStep: b.finalDashStep || 0,
          finalDashTargetId: b.finalDashTargetId || null,
          finalSpiritBombStagger: Math.round(b.finalSpiritBombStagger || 0),
          finalSpiritBombMaxStagger: Math.round(b.finalSpiritBombMaxStagger || 420),
          finalSpiritBombRadius: Math.round(b.finalSpiritBombRadius || 0),
          clashPhase: b.clashPhase || 'none',
          clashPlayerId: b.clashPlayerId || null,
          clashStepIndex: b.clashStepIndex || 0,
          clashAttemptIndex: b.clashAttemptIndex || 0,
          clashSubHitIndex: b.clashSubHitIndex || 0,
          clashCurrentStyle: b.clashCurrentStyle || 'overhead_crush',
          facingAngle: Number(b.facingAngle.toFixed(3)),
          speed: Math.round(b.speed || 0),
          state: b.state,
          stateTimer: Number((b.stateTimer || 0).toFixed(2)),
          stateDuration: Number((b.stateDuration || 1).toFixed(2)),
          activeTargetId: b.activeTargetId
        });
      }
    }
  }
}

window.RaidCoopNetwork = RaidCoopNetwork;
