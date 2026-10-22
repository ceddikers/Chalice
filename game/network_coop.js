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
    // Latency: a guest measures its round trip to the host (ping/pong) and reports it; the host keeps every guest's value.
    this.rtt = 0;                 // ms, this client <-> host (guests only)
    this.peerRtt = new Map();     // host: peerId -> ms
    this.pingTimer = 0;
    // Test switch: delays every packet this client SENDS, so lag ms here + lag ms on the other side = a 2x ms round trip.
    this.fakeLagMs = 0;
    try { const q = parseInt(new URLSearchParams(location.search).get('lag'), 10); if (q > 0) this.fakeLagMs = Math.min(q, 1000); } catch (e) {}
  }

  setFakeLag(ms) { this.fakeLagMs = Math.max(0, Math.min(1000, ms | 0)); }

  // The send path: every packet goes through here so the fake-lag switch is honoured.
  sendTo(conn, packet) {
    if (!conn) return;
    if (this.fakeLagMs > 0) {
      setTimeout(() => { try { if (conn.open) conn.send(packet); } catch (e) {} }, this.fakeLagMs);
    } else if (conn.open) {
      try { conn.send(packet); } catch (e) {}
    }
  }

  // Host-side: round trip (ms) to the guest that owns this player id; 0 when unknown / not a remote guest.
  rttOfPlayer(playerId) {
    if (!this.isHost) return 0;
    for (const [peerId, ally] of this.remotePlayers.entries()) {
      if (ally.id === playerId || peerId === playerId) return this.peerRtt.get(peerId) || 0;
    }
    return 0;
  }

  isConnected() {
    return this.connectedPeers.size > 0;
  }

  // True only for a guest that is actually connected to a host (host-authoritative boss logic must not run here).
  isClient() {
    return !this.isHost && this.connectedPeers.size > 0;
  }

  resetPeer() {
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
    this.peer = null;
    this.connectedPeers.clear();
    this.remotePlayers.clear();
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
    this.resetPeer();
    this.game.rebuildPartyRoster();
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
    this.resetPeer();
    this.game.rebuildPartyRoster();
    this.isHost = false;
    try {
      this.peer = new Peer();
      this.peer.on('open', (id) => {
        if (this.game && this.game.localPlayer) {
          this.game.localPlayer.id = id;
        }
        // Reliable + ordered channel: boss_event / boss_hit packets must never be dropped or reordered.
        // JSON serialization is much cheaper than PeerJS' default BinaryPack for these small object packets.
        const conn = this.peer.connect(cleanCode, { reliable: true, serialization: 'json' });
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

  // Remote proxies are the same class as their owner, so hammer players look and animate like hammer players.
  makeRemote(id, name, x, y, classId) {
    const Cls = (classId === 'unbound' && window.UnboundPlayer25D) ? window.UnboundPlayer25D
      : (classId === 'arclight' && window.ArclightPlayer25D) ? window.ArclightPlayer25D
      : (classId === 'reaper' && window.ReaperPlayer25D) ? window.ReaperPlayer25D
      : (classId === 'hammer' && window.HammerPlayer25D) ? window.HammerPlayer25D : BreakerPlayer25D;
    return new Cls(id, name, x, y, false, false);
  }

  // A stable id for this player across reconnects (a new PeerJS id is issued every time they rejoin).
  getSeat() {
    if (this._seat) return this._seat;
    let s = null;
    try { s = localStorage.getItem('vael_seat'); } catch (e) {}
    if (!s) {
      s = 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem('vael_seat', s); } catch (e) {}
    }
    this._seat = s;
    return s;
  }

  // A player dropped mid-raid: keep their character standing as a stand-in (HP, damage meter and all) until they return.
  makeGhost(peerId) {
    const ally = this.remotePlayers.get(peerId);
    if (!ally || !ally.seat || this.game.mode !== 'raid') return false;
    ally.ghost = true;
    ally.act = null; ally.state = 'idle'; ally.stateTimer = 0;
    ally.vx = 0; ally.vy = 0; ally.speed = 0; ally.targetX = ally.x; ally.targetY = ally.y;
    ally.clashQteActive = false;
    this.game.rebuildPartyRoster();
    return true;
  }

  // The same player (same seat) is back under a new connection: the stand-in is removed and the new character inherits its HP and
  // its place on the damage meter. The host also tells the rejoining client what HP / meter to continue with.
  takeOverGhost(ally, who, newId, seat) {
    let oldKey = null, ghost = null;
    for (const [k, g] of this.remotePlayers.entries()) {
      if (g !== ally && g.ghost && g.seat === seat) { oldKey = k; ghost = g; break; }
    }
    if (!ghost) return;
    this.remotePlayers.delete(oldKey);
    ally.ghost = false;
    ally.hp = ghost.hp;
    const oldId = ghost.id;
    if (window.RaidStats && window.RaidStats.transfer) window.RaidStats.transfer(oldId, newId);
    if (this.isHost) {
      const conn = this.connectedPeers.get(who);
      if (conn) this.sendTo(conn, { type: 'rejoin_restore', hp: ghost.hp, shield: Math.round(ghost.shield || 0), meId: oldId, stats: window.RaidStats && window.RaidStats.snapshot ? window.RaidStats.snapshot() : null });
    }
    this.game.rebuildPartyRoster();
  }

  purgeGhosts() {
    let any = false;
    for (const [k, g] of this.remotePlayers.entries()) if (g.ghost) { this.remotePlayers.delete(k); any = true; }
    if (any) this.game.rebuildPartyRoster();
  }

  setupConnection(conn) {
    conn.on('open', () => {
      this.connectedPeers.set(conn.peer, conn);
      if (!this.remotePlayers.has(conn.peer)) {
        const ally = new BreakerPlayer25D(conn.peer, `Warden-${conn.peer.slice(-3)}`, this.game.localPlayer.x + 55, this.game.localPlayer.y, false, false);
        this.remotePlayers.set(conn.peer, ally);
        this.game.rebuildPartyRoster();
      }
      try { conn.send({ type: 'chalice_version', v: window.CHALICE ? window.CHALICE.version : '?' }); } catch (e) {}      // so mismatched versions get noticed
      // A friend joining (or re-joining after a drop) while a raid is under way is pulled straight into it, without the intro.
      if (this.isHost && this.game.mode === 'raid' && !(this.game.boss && this.game.boss.soloOnly)) {
        this.sendTo(conn, { type: 'start_raid', difficulty: this.game.difficulty, skipIntro: true, skipCutscenes: !!this.game.skipCutscenes, raid: this.game.raidId || 'vaelgor', rejoin: true });
      }
    });

    conn.on('data', (data) => {
      this.handlePacket(conn.peer, data);
    });

    conn.on('close', () => {
      // A connection that was already replaced by a newer one from the same peer (a quick rejoin) must not tear down the new one.
      if (this.connectedPeers.has(conn.peer) && this.connectedPeers.get(conn.peer) !== conn) return;
      this.connectedPeers.delete(conn.peer);
      // In a raid the leaver's character stays behind as a stand-in until they come back (see takeOverGhost); elsewhere it is removed.
      if (!this.makeGhost(conn.peer)) this.remotePlayers.delete(conn.peer);
      if (this.isHost) this.broadcast({ type: 'player_left', id: conn.peer });   // the other guests drop that player's proxy too
      // A guest that lost its host takes over boss authority so the raid doesn't freeze.
      if (!this.isHost && this.connectedPeers.size === 0) this.isHost = true;
      this.game.rebuildPartyRoster();
    });
  }

  handlePacket(rawSenderId, data) {
    if (!data || !data.type) return;
    if (data.type === 'chalice_version') {      // a friend on another version: say so (the game can misbehave across versions)
      const mine = window.CHALICE ? window.CHALICE.version : '?';
      if (data.v !== mine && window.QoL && window.QoL.toast) window.QoL.toast(`A friend is on Chalice ${data.v}, you are on ${mine}. Update so you match.`);
      return;
    }
    // Guests only talk to the host, so the host forwards one guest's packets to the others. It stamps the packet with who really
    // sent it (_from); everything below keys players by that original sender, not by the connection the packet came through.
    if (this.isHost && !data._from) data._from = rawSenderId;
    const who = data._from || rawSenderId;
    const senderId = rawSenderId;          // the connection (used to avoid echoing a packet back to where it came from)

    if (data.type === 'player_left') {
      if (!this.isHost && data.id && this.remotePlayers.has(data.id)) {
        if (!this.makeGhost(data.id)) this.remotePlayers.delete(data.id);
        this.game.rebuildPartyRoster();
      }
      return;
    }

    // Host -> a player who just rejoined: put back the HP they left with and the damage meter they had built up.
    if (data.type === 'rejoin_restore') {
      const lp = this.game.localPlayer;
      if (lp && this.game.mode === 'raid') {
        if (typeof data.hp === 'number') lp.hp = Math.max(1, Math.min(lp.maxHp, data.hp));
        if (typeof data.shield === 'number' && data.shield > 0) lp.shield = data.shield;
        if (window.RaidStats && window.RaidStats.applySnapshot) window.RaidStats.applySnapshot(data.stats, data.meId, lp.id);
      }
      return;
    }

    if (data.type === 'player_state') {
      const peerPlayerId = data.playerId || who;
      if (this.game.localPlayer && peerPlayerId === this.game.localPlayer.id) return;   // never build a copy of ourselves
      const wantCls = data.classId || 'breaker';
      let ally = this.remotePlayers.get(who);
      if (ally && (ally.classId || 'breaker') !== wantCls) {
        // The owner swapped class: replace the proxy with the right one.
        ally = null;
        this.remotePlayers.delete(who);
      }
      if (!ally) {
        ally = this.makeRemote(peerPlayerId, data.name || 'Co-op Warden', data.x, data.y, wantCls);
        this.remotePlayers.set(who, ally);
        this.game.rebuildPartyRoster();
      }
      if (data.seat && ally.seat !== data.seat) {
        ally.seat = data.seat;
        this.takeOverGhost(ally, who, peerPlayerId, data.seat);
      }
      ally.id = peerPlayerId;
      if (data.name) ally.name = String(data.name).slice(0, 32);
      if (data.look && window.Characters) ally.look = window.Characters.cleanLook(data.look, wantCls);
      ally.wings = (data.wings === 'eclipse_wings' || data.wings === 'pyre_wings' || data.wings === 'moon_mobile') ? data.wings : null;
      ally.weaponEnh = Math.max(0, Math.min(15, data.we | 0));
      if (typeof ally.setArmorTier === 'function') { const at = Math.max(1, Math.min(3, data.armorTier | 0 || 1)); if (ally.armorTier !== at) ally.setArmorTier(at); }
      // While a hammer proxy is mid-clash / mid-leap its own choreography moves it; don't fight that with packets.
      const choreographed = !!((ally.karok && ally.karok.active) || (ally.act && (ally.classId === 'unbound' ? ['w', 'a', 'e', 't', 'z'].includes(ally.act.kind) : ally.classId === 'arclight' ? ['w', 'a', 'r', 's', 'f', 't', 'z'].includes(ally.act.kind) : ally.classId === 'reaper' ? ['w', 'a', 'r', 't', 'tv'].includes(ally.act.kind) : (ally.act.kind === 'e' || ally.act.kind === 't'))));
      if (!choreographed) {
        // Ease onto the owner's position instead of snapping (a snap every 60ms reads as stutter over a laggy link);
        // a big gap (spawn, teleport, dash) still snaps straight there.
        const ex = data.x - ally.x, ey = data.y - ally.y;
        if (ally._netInit && Math.hypot(ex, ey) < 140) { ally.x += ex * 0.6; ally.y += ey * 0.6; }
        else { ally.x = data.x; ally.y = data.y; ally._netInit = true; }
        ally.targetX = data.targetX;
        ally.targetY = data.targetY;
      }
      if ((wantCls === 'hammer' || wantCls === 'reaper' || wantCls === 'arclight' || wantCls === 'unbound') && typeof ally.applyNetState === 'function') ally.applyNetState(data);
      ally.facingAngle = data.facingAngle;
      ally.hp = data.hp;
      ally.maxHp = data.maxHp;
      if (typeof data.rv === 'number') ally.revivesLeft = data.rv;
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
      if (this.isHost) this.broadcastExcept(senderId, data);   // so the other guests see this player too
    } else if (data.type === 'core_event') {
      // Loot cores: everyone draws everyone's cores, only the owner collects. The host relays between guests.
      if (window.Cores) window.Cores.onNet(data, who);
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'net_ping') {
      if (this.isHost) {
        if (typeof data.rtt === 'number') this.peerRtt.set(senderId, data.rtt);
        this.sendTo(this.connectedPeers.get(senderId), { type: 'net_pong', t: data.t });
      }
    } else if (data.type === 'net_pong') {
      if (!this.isHost && typeof data.t === 'number') {
        const sample = performance.now() - data.t;
        if (sample >= 0 && sample < 5000) this.rtt = this.rtt ? this.rtt * 0.7 + sample * 0.3 : sample;
      }
    } else if (data.type === 'player_qte_root') {
      const target = (this.game.party || []).find(p => p.id === data.targetId) || this.remotePlayers.get(who) || null;
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
      const ally = this.remotePlayers.get(who);
      if (ally) {
        if (data.skill === 'basic') ally.triggerBasicAttack(data.aimX, data.aimY, true);
        else { ally.remoteShift = !!data.shift; ally.triggerSkill(data.skill, data.aimX, data.aimY, this.game.getActiveBossTarget(), true); }
      }
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'player_skill_release') {
      const ally = this.remotePlayers.get(who);
      if (ally && ally.classId === 'hammer') {
        ally.releaseSkill(data.skill);
      } else if (ally && data.skill === 'r') {
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
      b.triggerPatternByName(data.pattern, tgt, true, data);
      b.netSyncX = b.x;
      b.netSyncY = b.y;
      b.netSyncFacing = b.facingAngle;
      b.netSyncState = b.state;
      b.netSyncAge = 0;
    } else if (data.type === 'boss_broken' && this.game.boss) {
      // Broken is applied by the owning client and mirrored here, so rolls never diverge between machines.
      const b = this.game.boss;
      const before = b.brokenStacks || 0;
      b.brokenStacks = Math.max(0, Math.min(3, data.stacks | 0));
      b.brokenLockout = data.lockout || 0;
      if (b.brokenStacks > 0) { b.brokenTimer = 10; if (b.brokenStacks > before) { b.brokenFlash = 0.55; b.brokenNewest = b.brokenStacks - 1; } } else b.brokenTimer = 0;
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'boss_hit' && this.game.boss) {
      const attacker = (this.game.party || []).find(p => p.id === data.attackerId) || this.remotePlayers.get(who) || null;
      this.game.boss.receiveDamage(data.dmg, data.staggerAmt, attacker, {
        fromNetwork: true,
        isStrongMove: !!data.isStrongMove,
        impulseStrength: data.impulseStrength || 1.0,
        threatMult: data.threatMult || 1.0,
        posType: data.posType || 'normal',
        partBreakMult: data.partBreakMult !== undefined ? data.partBreakMult : (data.isStrongMove ? 1.0 : 0.35),
        pauldronSide: data.pauldronSide || null,
        hitX: data.hitX,
        hitY: data.hitY,
        skill: data.skill,
        crit: !!data.crit
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
        b.startHorizonMemoryFlash(data.slashIndex ?? 0, data.sequence || null, true, data.shifts || null, Array.isArray(data.fakes) ? data.fakes.map(f => !!f) : null);
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
      } else if (data.event === 'eclipse_wipe') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.executeEclipseCataclysmWipe(living);
      } else if (data.event === 'iaido_execute') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.executeIaidoGrabExecution(living);
      } else if (data.event === 'final_grab_slam') {
        const living = (this.game.party || []).filter(p => p.hp > 0);
        b.executeFinalGrabWipeSlam(living);
      } else if (data.event === 'trinity_teleport') {
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          b.applyTrinityTeleport(data.x, data.y, null, data.color || '#c084fc', true, data.facingAngle);
        }
      } else if (data.event === 'enrage') {
        b.applyEnrage(true);
      } else if (data.event === 'pauldron_break') {
        if (data.side === 'left' || data.side === 'right') b.breakPauldron(data.side, true);
      } else if (data.event === 'iaido_vanish') {
        if (typeof data.step === 'number') b.iaidoStep = data.step;
        if (b.state === 'iaido_mechanic') b.enterIaidoVanish(data.duration || 0.9);
      } else if (data.event === 'final_dash_open') {
        b.openFinalDashCounterWindow(data);
      } else if (data.event === 'counter_stagger') {
        const counterPlayer = (this.game.party || []).find(p => p.id === data.playerId) || null;
        b.executeCounterStagger(counterPlayer, true);
      } else if (data.event === 'rebuke_request') {
        // A guest pressed [S] Rebuke: only the host decides, and its verdict goes out as 'rebuke' (never relayed as a request).
        if (this.isHost && typeof b.onRebukeRequest === 'function') {
          b.onRebukeRequest((this.game.party || []).find(p => p.id === data.playerId) || this.remotePlayers.get(who) || null);
        }
        return;
      } else if (data.event === 'rebuke') {
        if (!this.isHost && typeof b.onRebukeNet === 'function') b.onRebukeNet(data);
        return;
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
      } else if (data.event === 'final_clash_request' || data.event === 'final_clash_lock') {
        const clashingPlayer = (this.game.party || []).find(p => p.id === data.playerId) || null;
        // Host arbitrates: a request (or a lock from an old client) only succeeds during windup_circle,
        // and initiateFinalClash itself broadcasts the granted lock to every peer.
        if (this.isHost) {
          if (clashingPlayer) b.initiateFinalClash(clashingPlayer, false);
          return;
        }
        if (clashingPlayer && data.event === 'final_clash_lock') b.initiateFinalClash(clashingPlayer, true);
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
      } else if (typeof data.event === 'string' && data.event.indexOf('ignis_') === 0) {
        // Ignis Vane's puzzle steps (boss_ignis.js). A guest's private request (false) is not relayed.
        if (typeof b.handleIgnisNet !== 'function' || b.handleIgnisNet(data) === false) return;
      } else if (typeof data.event === 'string' && data.event.indexOf('karok_') === 0) {
        // Karok Clash (karok_clash.js). A refused request (returns false) is not relayed to the rest of the party.
        if (typeof b.handleKarokNet !== 'function' || !b.handleKarokNet(data, senderId)) return;
      } else if (data.event === 'final_clash_wipe') {
        b.executeFinalClashWipe(true);
      }
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'boss_sync' && !this.isHost && this.game.boss) {
      // never apply one raid boss's sync to another (a missed start_raid): follow the host's raid instead
      if (data.raid && data.raid !== (this.game.raidId || 'vaelgor') && this.game.mode === 'raid' && typeof this.game.useRaidBoss === 'function') this.game.useRaidBoss(data.raid);
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
        b.state !== 'karok_clash' && (
        b.state === 'idle' ||
        b.state === 'walk' ||
        b.state === 'staggered' ||
        b.state === 'pat_eclipse_blender' ||
        b.state === 'pattern_final_cataclysm_rain' ||
        data.state === 'staggered' ||
        data.state === 'flinched' ||
        data.state === 'rebuked' ||
        b.state === 'rebuked' ||
        data.state === 'idle' ||
        data.state === 'walk' ||
        (data.state === 'eclipse_mechanic' && b.state !== 'eclipse_mechanic') ||
        (data.state === 'iaido_mechanic' && b.state !== 'iaido_mechanic') ||
        (data.state === 'horizon_mechanic' && b.state !== 'horizon_mechanic') ||
        (data.state === 'final_phase_mechanic' && b.state !== 'final_phase_mechanic') ||
        (data.state === 'final_clash_mechanic' && b.state !== 'final_clash_mechanic'))
      ) {
        const prevState = b.state;
        const bex = data.x - b.x, bey = data.y - b.y;
        if (prevState === data.state && Math.hypot(bex, bey) < 160) { b.x += bex * 0.6; b.y += bey * 0.6; } // ease, don't snap
        else { b.x = data.x; b.y = data.y; }
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
        } else if (data.state === 'rebuked' && prevState !== 'rebuked') {     // a missed 'rebuke' event: join the recoil late
          b.jumpZ = 0; b.counterableWindow = false; b.speed = 0; b.vx = 0; b.vy = 0;
          b.stateDuration = typeof data.stateDuration === 'number' ? data.stateDuration : 0.6;
          b.stateTimer = typeof data.stateTimer === 'number' ? data.stateTimer : 0.6;
        }
      }
      // States not hard-synced above (patterns, mechanics) drift on guests; boss.update eases toward this host pose.
      b.netSyncX = data.x;
      b.netSyncY = data.y;
      b.netSyncFacing = data.facingAngle;
      b.netSyncState = data.state;
      b.netSyncAge = 0;
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
      // Self-heal a missed 'enrage' event (applyEnrage is idempotent).
      if (data.enraged && data.enrageTimer <= 0) b.applyEnrage(true);
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
      if (data.careful && typeof b.applyCarefulNet === 'function') b.applyCarefulNet(data.careful);
      if (data.ex && typeof b.applyNetExtra === 'function') b.applyNetExtra(data.ex);
    } else if (typeof data.type === 'string' && data.type.indexOf('cx_') === 0) {
      // pings, emotes, ready checks (comms.js). The host relays guest packets to the rest of the party.
      if (window.Comms) window.Comms.onNet(who, data);
      if (this.isHost && data.relay !== false) this.broadcastExcept(senderId, data);
    } else if (data.type === 'raid_results') {
      if (window.RaidStats) window.RaidStats.onNet(data);
    } else if (data.type === 'difficulty') {
      if (!this.isHost && this.game.setDifficulty) this.game.setDifficulty(data.value, false);
    } else if (data.type === 'start_raid') {
      if (data.difficulty && !this.isHost && this.game.setDifficulty) this.game.setDifficulty(data.difficulty, false);
      this.game._skipIntro = !!data.skipIntro;
      this.game.skipCutscenes = !!data.skipCutscenes;      // the host's per-raid Skip cutscenes choice
      this.game.raidId = data.raid === 'ignis' ? 'ignis' : 'vaelgor';   // which raid the host started
      if (!data.rejoin) this.purgeGhosts();     // a fresh raid: nobody is coming back to the last one
      this.game.enterRaidGate(false, !!data.clockPractice, !!data.finalPhasePractice, !!data.finalClashPractice);
      // Guests only talk to the host, so the host must relay raid starts to the rest of the party.
      if (this.isHost) this.broadcastExcept(senderId, data);
    } else if (data.type === 'enter_hub' && !this.isHost) {
      this.game.enterHub(false);
    } else if (data.type === 'player_revive') {
      const target = (this.game.party || []).find(p => p.id === data.targetId) || null;
      if (target && target.isLocal && target.hp <= 0 && this.game.canRevive && this.game.canRevive(target)) {
        this.game.spendRevive(target);
        target.hp = Math.round(target.maxHp * 0.65);
        target.state = 'idle';
        target.deadTimer = 0;
      }
      if (this.isHost) this.broadcastExcept(senderId, data);
    }
  }

  broadcast(packet) {
    for (const conn of this.connectedPeers.values()) {
      if (conn.open) this.sendTo(conn, packet);
    }
  }

  broadcastExcept(excludePeerId, packet) {
    for (const [peerId, conn] of this.connectedPeers.entries()) {
      if (peerId !== excludePeerId && conn.open) this.sendTo(conn, packet);
    }
  }

  update(dt) {
    if (this.connectedPeers.size === 0) return;
    this.pingTimer -= dt;
    if (this.pingTimer <= 0) {
      this.pingTimer = 1.0;
      if (!this.isHost) this.broadcast({ type: 'net_ping', t: performance.now(), rtt: Math.round(this.rtt) });
    }
    this.syncTimer -= dt;
    if (this.syncTimer <= 0) {
      this.syncTimer = 0.06;
      const p = this.game.localPlayer;
      this.broadcast({
        type: 'player_state',
        classId: p.classId || 'breaker',
        playerId: p.id,
        seat: this.getSeat(),
        name: p.name,
        look: p.look || undefined,
        wings: p.wings || undefined,
        armorTier: p.armorTier || 1,
        we: p.weaponEnh | 0,
        x: Math.round(p.x),
        y: Math.round(p.y),
        targetX: Math.round(p.targetX),
        targetY: Math.round(p.targetY),
        facingAngle: Number(p.facingAngle.toFixed(2)),
        hp: p.hp,
        maxHp: p.maxHp,
        rv: p.revivesLeft | 0,           // Normal: revives this player still has (teammates read it before picking them up)
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
        clashTotalBeats: p.clashTotalBeats || 7,
        ...(typeof p.getNetState === 'function' ? p.getNetState() : {})
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
          enrageTimer: Number((b.enrageTimer ?? 330).toFixed(1)),
          enraged: !!b.enraged,
          fractureStacks: b.fractureStacks || 0,
          counterableWindow: !!b.counterableWindow,
          careful: typeof b.carefulNet === 'function' ? b.carefulNet() : undefined,
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
          activeTargetId: b.activeTargetId,
          raid: this.game.raidId || 'vaelgor',
          ex: typeof b.netExtra === 'function' ? b.netExtra() : undefined      // a boss's own extra state (Ignis: ego, wall, puzzle)
        });
      }
    }
  }
}

window.RaidCoopNetwork = RaidCoopNetwork;
