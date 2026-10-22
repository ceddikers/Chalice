// =========================================================================
// CORES.JS — Vindictus-style loot cores.
//   • Every core is a plain ball: black-and-white for its owner, greyed out for teammates. Nobody can tell what is inside
//     until it is picked up. Each core rolls its own contents; one burst core is always the guaranteed Eclipse Seal.
//   • A pauldron break drops a core at the shoulder; it waits on the map until the battle ends.
//   • When the boss dies it bursts into a spray of cores. A RARE core (Abyssal Essence) flashes about a second after it lands
//     and sends up a light pillar: bright orange for its owner, a greyed-out orange for everyone else.
//   • Break cores keep their secret during the fight: a rare break core only reveals itself when the battle ends.
//   • EVERYONE sees EVERYONE's cores; only the owner can collect theirs. Rewards are rolled and applied by the owner's client
//     (like the rest of co-op: each client owns its own inventory) and announced with `core_event` packets.
// =========================================================================
(function () {
  const TILT = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.62);
  const GRAVITY = 980;
  const PICKUP_R = 46;          // walk this close to your own core and it flies to you
  const KICK_REACH = 18;        // anyone this close (beyond the ball's own radius) knocks it away
  const FORCE_COLLECT_AT = 14;  // seconds after victory: any of your cores still lying around fly to you
  const FINISH_DELAY = 0.9;     // after the last core lands in your pocket, show the summary
  const REVEAL_AFTER = 1.0;     // a rare core flashes this long after it comes to rest

  const INSPECT_FULL = 2.5;      // seconds: pick up, look, shrug, put away
  const INSPECT_QUICK = 1.15;    // the same, hurried (when you are standing in a pile of cores)
  const INSPECT_REWARD_AT = 0.4; // the contents are revealed while you are looking at it

  const e01 = (x) => Math.max(0, Math.min(1, x));
  const sm = (x) => { x = e01(x); return x * x * (3 - 2 * x); };
  const mixv = (a, b, t) => a + (b - a) * t;
  const mix3 = (a, b, t) => ({ fwd: mixv(a.fwd, b.fwd, t), side: mixv(a.side, b.side, t), up: mixv(a.up, b.up, t) });

  // The whole inspect animation as numbers (pr = 0..1). Used for the player's pose AND to place the core in their hand.
  //   pick up (bend down) -> raise it -> look it over -> shrug -> tuck it away
  function inspectPose(pr, quick) {
    const T = quick ? { pick: 0.28, lift: 0.46, look: 0.7, shrug: 0.7, away: 1 } : { pick: 0.17, lift: 0.31, look: 0.55, shrug: 0.76, away: 1 };
    const rest = { fwd: 14, side: -6, up: 38 };
    const ground = { fwd: 25, side: -4, up: 5 };
    const held = { fwd: 15, side: -5, up: 49 };
    const belt = { fwd: 3, side: -15, up: 22 };
    let lHand, crouchZ = 0, lean = 0, head = 0, yaw = 0, shrug = 0;
    if (pr < T.pick) {
      const k = sm(pr / T.pick);
      lHand = mix3(rest, ground, k); crouchZ = -11 * k; lean = 10 * k; head = -2 * k;
    } else if (pr < T.lift) {
      const k = sm((pr - T.pick) / (T.lift - T.pick));
      lHand = mix3(ground, held, k); crouchZ = mixv(-11, -2, k); lean = mixv(10, 4, k); head = mixv(-2, -3, k);
    } else if (pr < T.look) {
      const k = (pr - T.lift) / (T.look - T.lift);
      lHand = { fwd: held.fwd, side: held.side + Math.sin(k * Math.PI * 3) * 3, up: held.up + Math.sin(k * Math.PI * 2) * 1.6 };
      crouchZ = -2; lean = 4; head = -3 + Math.sin(k * Math.PI * 2) * 1; yaw = Math.sin(k * Math.PI * 2) * 0.2;
    } else if (!quick && pr < T.shrug) {
      const k = (pr - T.look) / (T.shrug - T.look);
      const out = Math.sin(Math.min(1, k * 1.15) * Math.PI);          // hands out and shoulders up, then settle
      lHand = mix3(held, { fwd: 9, side: -25, up: 45 }, out);
      crouchZ = -2 + 5 * out; lean = mixv(4, -3, out); head = mixv(-3, 1.5, out); shrug = out;
    } else {
      const from = quick ? T.look : T.shrug;
      const k = sm((pr - from) / (T.away - from));
      lHand = mix3(held, belt, k); crouchZ = mixv(-2, -1, k); lean = mixv(4, 1, k); head = mixv(-3, 0, k);
    }
    const rHand = { fwd: 8 + shrug * 2, side: 17 + shrug * 9, up: 34 + shrug * 13 };
    const tip = { fwd: 26 - shrug * 6, side: 24 + shrug * 10, up: shrug * 22 };
    // before the first and after the last beat the core is not in hand: it starts at the floor and ends in the pocket
    const vis = pr < T.pick * 0.4 ? sm(pr / (T.pick * 0.4)) : (pr > 0.93 ? sm((1 - pr) / 0.07) : 1);
    return { lHand, rHand, tip, crouchZ, lean, head, yaw, vis };
  }

  // pickup colours / names (only used once a core is collected, never while it is lying on the floor)
  const KIND = {
    gold:     { color: '#facc15', label: 'Gold' },
    shard:    { color: '#e11d48', label: 'Obsidian Shard' },
    seal:     { color: '#38bdf8', label: 'Eclipse Seal' },
    fragment: { color: '#94a3b8', label: 'Pauldron Fragment' },
    essence:  { color: '#fb923c', label: 'Abyssal Essence' },
    wings:    { color: '#fb923c', label: 'Eclipse Wings' },
    pyre_wings: { color: '#f97316', label: 'Pyre Wings' },
    bone_wings: { color: '#d6cfc4', label: 'Bone Wings' },
    heart:    { color: '#f5c542', label: 'Music-Box Heart' },
    porcelain: { color: '#e0e7ff', label: 'Porcelain Shard' },
    thread:   { color: '#f472b6', label: 'Lullaby Thread' },
    moon_mobile: { color: '#fde68a', label: 'Moon Mobile' },
    accessory: { color: '#60a5fa', label: 'Accessory' },
    break:    { color: '#c084fc', label: 'Core' },
    orb:      { color: '#e5e7eb', label: 'Core' }
  };
  const NAMES = { cosmetic_eclipse_wings: 'Eclipse Wings', cosmetic_pyre_wings: 'Pyre Wings', cosmetic_bone_wings: 'Bone Wings', cosmetic_moon_mobile: 'Moon Mobile', porcelain_shard: 'Porcelain Shard', lullaby_thread: 'Lullaby Thread', music_box_heart: 'Music-Box Heart', gold: 'Gold', obsidian_shard: 'Obsidian Shard', vaelgor_seal: 'Eclipse Seal', vaelgor_essence: 'Abyssal Essence', pauldron_fragment: 'Pauldron Fragment' };

  function newTally() {
    return { gold: 0, vaelgor_seal: 0, vaelgor_essence: 0, obsidian_shard: 0, pauldron_fragment: 0, breakCores: [], accessories: [], essenceRollPct: null, essenceDropped: false };
  }

  const Cores = {
    list: [],
    tally: newTally(),
    victory: null,         // { t, done }
    _seq: 0,
    _pendingCollect: [],
    _pendingSettle: [],

    reset() {
      for (const p of (window.game && window.game.party) || []) p.inspect = null;
      this.list.length = 0;
      this.tally = newTally();
      this.victory = null;
      this.essenceCommitted = false;
      this._pendingCollect.length = 0;
      this._pendingSettle.length = 0;
    },

    // ---- creation ---------------------------------------------------------
    make(def, mine, owner) {
      const kind = def.kind || 'orb';
      const k = KIND[kind] || KIND.orb;
      const c = {
        id: def.id,
        ownerId: owner.id,
        ownerName: owner.name || 'Warden',
        mine,
        kind,
        big: kind === 'break' || !!def.big,        // break cores are a little bigger
        r: (kind === 'break' || def.big) ? 11 : 8,
        color: def.color || k.color,               // pickup text colour (owner only)
        essence: !!def.essence || kind === 'essence' || kind === 'wings' || kind === 'pyre_wings' || kind === 'bone_wings' || kind === 'heart' || kind === 'moon_mobile',      // wings glow and announce themselves like the essence
        hold: !!def.hold,                          // true: rarity stays hidden (break cores, until the battle ends)
        revealAt: null,
        revealed: false,
        flash: 0,
        tier: def.tier || null,
        rewards: def.rewards || null,
        text: def.text || null,
        x: def.x, y: def.y, z: def.z || 0,
        vx: def.vx || 0, vy: def.vy || 0, vz: def.vz || 0,
        t: 0, seed: Math.random() * 100,
        state: 'air', flyT: 0, bounces: 0
      };
      this.list.push(c);
      return c;
    },

    // What teammates get to know: where it is, that it is a ball, how big, and (only once public) that it is rare.
    wire(c) {
      return { id: c.id, big: c.big, essence: !c.hold && c.essence, x: Math.round(c.x), y: Math.round(c.y), z: Math.round(c.z), vx: Math.round(c.vx), vy: Math.round(c.vy), vz: Math.round(c.vz) };
    },

    send(game, owner, cores, op) {
      const net = game.net;
      if (!net || !net.isConnected()) return;
      net.broadcast({ type: 'core_event', op: op || 'spawn', ownerId: owner.id, ownerName: owner.name, cores: cores.map(c => this.wire(c)) });
    },

    // ---- events -----------------------------------------------------------
    onBreak(boss, side) {
      const game = window.game;
      if (!game || game.mode !== 'raid') return;
      if (game.isHard && !game.isHard()) return;     // pauldron cores are a Hard-mode bonus
      const me = game.localPlayer;
      const pos = boss.getShoulderWorldPositions()[side] || { x: boss.x, y: boss.y };
      const coreName = typeof boss.breakCoreName === 'function' ? boss.breakCoreName(side) : (side === 'left' ? 'LEFT PAULDRON CORE' : 'RIGHT PAULDRON CORE');
      const roll = game.forge.rollBreakCore(coreName, this.essenceCommitted, boss.raidId || game.raidId || 'vaelgor');
      if (roll.rewards && (roll.rewards.vaelgor_essence || roll.rewards.music_box_heart)) this.essenceCommitted = true;       // one Essence per player per run
      const away = Math.atan2((pos.y - boss.y) / TILT(), pos.x - boss.x);
      const a = away + (Math.random() - 0.5) * 0.9;
      const sp = 70 + Math.random() * 90;
      const c = this.make({
        id: `${me.id}:b${++this._seq}:${Date.now() % 1e6}`, kind: 'break', color: roll.color, tier: roll.tier, text: roll.rewardText,
        essence: !!(roll.rewards && (roll.rewards.vaelgor_essence || roll.rewards.music_box_heart)), hold: true, rewards: roll.rewards,
        x: pos.x, y: pos.y, z: 90, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * TILT(), vz: 300
      }, true, me);
      c.source = roll.source;
      this.clampToArena(game, c);
      if (window.fx) window.fx.addShockwave(pos.x, pos.y, 90, '#e5e7eb', 4, 0.35);
      this.send(game, me, [c]);
    },

    onVictory(game) {
      this.victory = { t: 0, done: false };
      const me = game.localPlayer, boss = game.boss;

      // the battle is over: break cores may now show what they are
      const revealed = [];
      for (const c of this.list) {
        if (c.mine && c.hold) { c.hold = false; c.revealAt = c.t + REVEAL_AFTER; if (c.essence) revealed.push(c); }
      }
      if (revealed.length) this.send(game, me, revealed, 'reveal');

      const lc = game.lastClear || {};
      const raidId = (boss && boss.raidId) || game.raidId || 'vaelgor';
      const burst = game.forge.rollBurstLoot(game.isHard && game.isHard() ? 'hard' : 'normal', lc.bonus || 0, this.essenceCommitted, raidId);
      if (burst.essenceDropped) this.essenceCommitted = true;
      this.tally.essenceRollPct = burst.essenceRollPct;
      this.tally.essenceDropped = burst.essenceDropped;
      const made = [];
      const n = burst.cores.length;
      burst.cores.forEach((def, i) => {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
        const sp = 120 + Math.random() * 210;
        const c = this.make({
          id: `${me.id}:v${++this._seq}:${Date.now() % 1e6}`, kind: def.kind, rewards: def.rewards, essence: !!def.essence, color: def.color,   // a Legendary accessory glows like an Essence
          x: boss.x, y: boss.y, z: 70 + Math.random() * 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * TILT(), vz: 380 + Math.random() * 260
        }, true, me);
        this.clampToArena(game, c);
        made.push(c);
      });
      this.send(game, me, made);

      // every clear also pays a flat purse, whatever the cores hold
      const purse = (game.isHard && game.isHard()) ? 2500 : 1000;
      game.forge.applyRewards({ gold: purse });
      this.tally.gold = (this.tally.gold || 0) + purse;
      if (window.fx) window.fx.addFloatingText(me.x, me.y - 96, `+${purse.toLocaleString('en-US')} gold`, '#facc15', 15);
      game.updateAllUI();
    },

    // Network
    onNet(data, senderId) {
      const game = window.game;
      if (!game || !data || data.ownerId === game.localPlayer.id) return;
      if (data.op === 'spawn') {
        const owner = { id: data.ownerId, name: data.ownerName };
        for (const w of data.cores || []) {
          if (this.list.some(c => c.id === w.id)) continue;
          this.make({ id: w.id, kind: 'orb', big: w.big, essence: w.essence, hold: false, x: w.x, y: w.y, z: w.z, vx: w.vx, vy: w.vy, vz: w.vz }, false, owner);
        }
      } else if (data.op === 'reveal') {
        // the owner's battle-end reveal of a rare break core
        for (const w of data.cores || []) {
          const c = this.list.find(q => q.id === w.id);
          if (c) { c.essence = !!w.essence; c.hold = false; c.revealAt = c.t + REVEAL_AFTER; }
        }
      } else if (data.op === 'settle') {
        // the owner's copy is the truth for where a knocked-about core ended up
        for (const w of data.cores || []) {
          const c = this.list.find(q => q.id === w.id && !q.mine);
          if (c && c.state !== 'fly') { c.x = w.x; c.y = w.y; c.z = 0; c.vx = c.vy = c.vz = 0; c.sliding = false; c.state = 'rest'; }
        }
      } else if (data.op === 'collect') {
        const ids = new Set(data.ids || []);
        const insp = data.insp || {};
        for (const c of this.list) {
          if (!ids.has(c.id) || c.state === 'fly' || c.state === 'inspect') continue;
          if (insp[c.id]) { c.state = 'inspect'; c.insp = { t: 0, dur: insp[c.id].dur, quick: !!insp[c.id].quick }; }   // the owner is inspecting it: replay their animation
          else { c.state = 'fly'; c.flyT = 0; }
        }
      }
    },

    // ---- simulation -------------------------------------------------------
    clampToArena(game, c) {
      const R = (game.arenaRadius || 590) - 36;
      const d = Math.hypot(c.x, c.y / TILT());
      if (d > R) { const s = R / d; c.x *= s; c.y *= s; }
    },

    // Knock a core away from whoever touched it: harder if they were running or mid-attack. A little hop, then it rolls out.
    kick(c, p) {
      const dx = c.x - p.x, dy = (c.y - p.y) / TILT();
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      const pv = Math.hypot(p.vx || 0, p.vy || 0);
      const attacking = p.state && p.state !== 'idle' && p.state !== 'walk';
      const speed = Math.min(560, 190 + pv * 0.8 + (attacking ? 220 : 0));
      c.vx = nx * speed; c.vy = ny * speed * TILT();
      c.vz = 190 + Math.random() * 120;
      c.state = 'air'; c.sliding = false; c.bounces = 1; c.z = Math.max(c.z, 1);
      c.kickCd = 0.35; c.kicked = true;
    },

    // Rolling cores bounce off the arena wall instead of vanishing through it.
    bounceOffRim(game, c) {
      const R = (game.arenaRadius || 590) - 36;
      const px = c.x, py = c.y / TILT();
      const d = Math.hypot(px, py);
      if (d <= R) return;
      const nx = px / d, ny = py / d;
      c.x = nx * R; c.y = ny * R * TILT();
      const vx = c.vx, vy = c.vy / TILT();
      const vn = vx * nx + vy * ny;
      if (vn > 0) { c.vx = vx - 1.5 * vn * nx; c.vy = (vy - 1.5 * vn * ny) * TILT(); }
    },

    ownerObj(game, id) {
      return (game.party || []).find(p => p.id === id) || null;
    },

    reveal(c) {
      c.revealed = true;
      c.flash = 0.8;
      if (window.fx) window.fx.addShockwave(c.x, c.y, c.mine ? 120 : 80, c.mine ? '#fb923c' : '#a8a29e', 4, 0.4);
      try {
        if (c.mine) {
          // the rare-drop fanfare: every core that announces itself with the orange pillar (Abyssal Essence, Eclipse Wings)
          const a = this._rareSfx || (this._rareSfx = new Audio('game/sounds/rare_drop.mp3'));
          const sp = window.SettingsPlus && window.SettingsPlus.get(); a.volume = Math.max(0, Math.min(1, 0.85 * (sp ? sp.sfx : 1))); a.currentTime = 0; a.play().catch(() => {});
        }
      } catch (e) {}
    },

    update(dt, game) {
      if (!this.list.length && !this.victory) return;
      const me = game.localPlayer;
      if (this.victory) this.victory.t += dt;
      const forceAll = !!(this.victory && this.victory.t > FORCE_COLLECT_AT);

      for (let i = this.list.length - 1; i >= 0; i--) {
        const c = this.list[i];
        c.t += dt;
        if (c.flash > 0) c.flash = Math.max(0, c.flash - dt);
        if (c.kickCd > 0) c.kickCd -= dt;
        // Cores are loose objects: anyone walking or fighting into one knocks it away. They never block movement.
        if ((c.state === 'rest' || (c.state === 'air' && c.sliding)) && !(c.kickCd > 0)) {
          for (const p of game.party || []) {
            if (!p || p.hp <= 0) continue;
            if (Math.hypot(p.x - c.x, (p.y - c.y) / TILT()) < c.r + KICK_REACH) { this.kick(c, p); break; }
          }
        }
        if (c.state === 'air') {
          if (!c.sliding) { c.vz -= GRAVITY * dt; c.z += c.vz * dt; }
          c.x += c.vx * dt; c.y += c.vy * dt;
          if (!c.sliding && c.z <= 0) {
            c.z = 0;
            if (c.vz < -150 && c.bounces < 3) { c.vz = -c.vz * 0.5; c.vx *= 0.78; c.vy *= 0.78; c.bounces++; }
            else { c.vz = 0; c.sliding = true; }
          }
          if (c.sliding) {                       // rolling to a stop
            const f = Math.exp(-2.4 * dt);
            c.vx *= f; c.vy *= f;
            if (Math.hypot(c.vx, c.vy / TILT()) < 14) {
              c.vx = c.vy = 0; c.sliding = false; c.state = 'rest'; c.restT = 0;
              if (c.mine && c.kicked) { this._pendingSettle.push(c); c.kicked = false; }   // tell teammates where it ended up
            }
          }
          this.bounceOffRim(game, c);
        } else if (c.state === 'rest') {
          c.restT += dt;
          // a rare core announces itself about a second after it lands (break cores wait for the battle to end)
          if (c.essence && !c.hold && !c.revealed) {
            const due = c.revealAt != null ? c.t >= c.revealAt && c.restT >= 0.2 : c.restT >= REVEAL_AFTER;
            if (due) this.reveal(c);
          }
          if (c.mine && me.hp > 0 && c.t > 0.7) {
            const d = Math.hypot(me.x - c.x, (me.y - c.y) / TILT());
            if (d < PICKUP_R || forceAll) {
              const calm = !forceAll && !me.inspect && (me.state === 'idle' || me.state === 'walk') && !(me.act) && !(me.karok && me.karok.active);
              if (calm) {
                // pick it up, have a look, shrug, put it away (quicker when you are standing in a pile of them)
                const near = this.list.filter(o => o !== c && o.mine && o.state === 'rest' && Math.hypot(me.x - o.x, (me.y - o.y) / TILT()) < 170).length;
                const quick = near >= 1;
                c.state = 'inspect'; c.insp = { t: 0, dur: quick ? INSPECT_QUICK : INSPECT_FULL, quick };
                this._pendingCollect.push(c.id);
                try { audio.playHitConfirm && audio.playHitConfirm({ isCrit: false, isHeavy: false, posType: 'normal' }); } catch (e) {}
              } else { c.state = 'fly'; c.flyT = 0; this._pendingCollect.push(c.id); }
            }
          }
        } else if (c.state === 'inspect') {
          const owner = this.ownerObj(game, c.ownerId);
          if (!owner) { this.list.splice(i, 1); continue; }
          const I = c.insp;
          I.t += dt;
          owner.inspect = I;
          // turn to face the camera so the pick-up reads on screen
          { let d = Math.PI * 0.5 - owner.facingAngle; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; owner.facingAngle += d * Math.min(1, dt * 7); }
          const pr = Math.min(1, I.t / I.dur);
          const pz = inspectPose(pr, I.quick);
          // the core rides in the owner's hand
          const h = owner.localToWorld(pz.lHand.fwd, pz.lHand.side, pz.lHand.up + pz.crouchZ * 0.5);
          c.x = owner.x + h.wx; c.y = owner.y + h.wy * TILT(); c.z = h.up; c.vx = c.vy = c.vz = 0;
          if (c.mine) {
            // interrupted by moving, attacking or getting hit: the core goes straight into the pocket
            const moving = Math.hypot(owner.vx || 0, owner.vy || 0) > 25 || (owner.state !== 'idle' && owner.state !== 'walk') || owner.hp <= 0 || owner.act;
            if (I.t > 0.3 && moving) {
              owner.inspect = null;
              if (!c.applied) this.collect(game, c);
              c.state = 'fly'; c.flyT = 0.5;
              continue;
            }
            if (!c.applied && pr >= INSPECT_REWARD_AT) { this.collect(game, c); }
          }
          if (I.t >= I.dur) { owner.inspect = null; if (c.mine && !c.applied) this.collect(game, c); this.list.splice(i, 1); continue; }
        } else if (c.state === 'fly') {
          c.flyT += dt;
          const tgt = this.ownerObj(game, c.ownerId);
          if (!tgt) { this.list.splice(i, 1); continue; }
          const tx = tgt.x, ty = tgt.y, tz = 46;
          const k = Math.min(1, dt * (5 + c.flyT * 14));
          c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.z += (tz - c.z) * k;
          if (Math.hypot(tx - c.x, (ty - c.y) / TILT()) < 16 || c.flyT > 1.2) {
            if (c.mine && !c.applied) this.collect(game, c);
            this.list.splice(i, 1);
          }
        }
      }

      for (const p of game.party || []) {
        if (p.inspect && !this.list.some(c => c.state === 'inspect' && c.ownerId === p.id)) p.inspect = null;
      }

      if (this._pendingSettle.length) {
        const live = this._pendingSettle.filter(c => this.list.includes(c));
        if (live.length && game.net && game.net.isConnected()) {
          game.net.broadcast({ type: 'core_event', op: 'settle', ownerId: me.id, cores: live.map(c => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y) })) });
        }
        this._pendingSettle.length = 0;
      }
      if (this._pendingCollect.length) {
        if (game.net && game.net.isConnected()) {
          const insp = {};
          for (const id of this._pendingCollect) { const c = this.list.find(q => q.id === id); if (c && c.state === 'inspect') insp[id] = { dur: c.insp.dur, quick: c.insp.quick }; }
          game.net.broadcast({ type: 'core_event', op: 'collect', ownerId: me.id, ids: this._pendingCollect.slice(), insp });
        }
        this._pendingCollect.length = 0;
      }

      // Victory: wait until everything of mine is in my pocket, then show the summary
      if (this.victory && !this.victory.done) {
        const mineLeft = this.list.some(c => c.mine);
        if (!mineLeft && this.victory.t > FINISH_DELAY + 1.5) {
          if (!this.victory.doneT) this.victory.doneT = this.victory.t;
          if (this.victory.t - this.victory.doneT >= FINISH_DELAY) {
            this.victory.done = true;
            game.showVictoryModal(this.tally);
          }
        } else this.victory.doneT = 0;
      }
    },

    collect(game, c) {
      if (c.applied) return;
      c.applied = true;
      // Gilder's Charm: gold cores pay out half again
      // Safety net: only one Abyssal Essence per player per run, whatever path it came from
      if (c.rewards && c.rewards.vaelgor_essence && (this.tally.vaelgor_essence || 0) >= 1) { const r2 = Object.assign({}, c.rewards, { vaelgor_seal: (c.rewards.vaelgor_seal || 0) + 1 }); delete r2.vaelgor_essence; c.rewards = r2; c.essence = false; }
      if (c.rewards && c.rewards.music_box_heart && (this.tally.music_box_heart || 0) >= 1) { const r2 = Object.assign({}, c.rewards, { lullaby_thread: (c.rewards.lullaby_thread || 0) + 1 }); delete r2.music_box_heart; c.rewards = r2; c.essence = false; }
      if (c.rewards && c.rewards.gold && game.forge.hasPassive && game.forge.hasPassive('gilders_charm')) c.rewards = Object.assign({}, c.rewards, { gold: Math.round(c.rewards.gold * 1.5) });
      let accTxt = null;
      if (c.rewards && c.rewards.accessory) {      // a dropped accessory goes to the inventory; the summary lists it with its rarity colour
        const spec = c.rewards.accessory, A = window.Accessories;
        const rc = (window.VINDICTUS_RECIPES || []).find(r => r.id === spec.recipeId), R = A ? A.rarityOf(spec) : { name: '', color: '#60a5fa' };
        if (rc) {
          this.tally.accessories.push({ name: rc.name, rarityName: R.name, color: R.color });
          accTxt = `${R.name} ${rc.name}`; c.color = R.color;
        }
      }
      game.forge.applyRewards(c.rewards);
      if (c.rewards && (c.rewards.cosmetic_eclipse_wings || c.rewards.cosmetic_pyre_wings || c.rewards.cosmetic_bone_wings || c.rewards.cosmetic_moon_mobile)) {
        game.forge.applyEquipmentToPlayer(game.localPlayer);
        if (window.fx) { window.fx.addPillar(game.localPlayer.x, game.localPlayer.y, 60, '#fb923c', 1.2); window.fx.addShockwave(game.localPlayer.x, game.localPlayer.y, 220, '#fb923c', 6, 0.7); }
      }
      for (const [k, v] of Object.entries(c.rewards || {})) if (k !== 'accessory') this.tally[k] = (this.tally[k] || 0) + v;
      if (c.kind === 'break') this.tally.breakCores.push({ source: c.source || 'PAULDRON CORE', tier: c.tier, color: c.color, rewardText: c.text });
      const me = game.localPlayer;
      // only now does the player learn what the ball was
      const txt = accTxt ? accTxt : (c.kind === 'break' ? c.text : Object.entries(c.rewards || {}).map(([k, v]) => `+${v} ${NAMES[k] || k}`).join(' '));
      if (window.fx) {
        window.fx.addFloatingText(me.x, me.y - 96, txt, c.color, c.essence ? 17 : 13);
        window.fx.addShockwave(me.x, me.y, c.essence ? 110 : 60, c.color, 3, 0.3);
      }
      try {
        if (c.essence || c.kind === 'break') audio.playForgeAnvil(true);
        else audio.playHitConfirm && audio.playHitConfirm({ isCrit: false, isHeavy: false, posType: 'normal' });
      } catch (e) {}
      game.updateAllUI();
    },

    // ---- drawing ----------------------------------------------------------
    glow(ctx, x, y, r, rgb, a) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    },

    draw(ctx, game) {
      if (!this.list.length) return;
      const T = TILT();
      const now = performance.now() * 0.001;
      for (const c of this.list) {
        const rare = c.essence && c.revealed && c.state !== 'fly';     // flashing + pillar
        const hover = c.state === 'rest' ? 13 + Math.sin(now * 3 + c.seed) * 3 : 0;
        const by = c.y - c.z - hover;
        const r = c.r;
        // owner: black and white. Teammates: greyed out (and a little see-through). Rare: tinted orange, greyed for teammates.
        const rgbGlow = c.mine ? '251,146,60' : '196,140,96';       // teammates: a muted, greyed-down orange

        // ---- ground: shadow, pickup ring (owner), rare ripples
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(1, T);
        ctx.fillStyle = `rgba(0,0,0,${0.3 * Math.max(0.2, 1 - c.z / 240) * (c.mine ? 1 : 0.7)})`;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2); ctx.fill();
        if (c.state === 'rest' && c.mine) {
          ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 7]); ctx.lineDashOffset = -now * 20;
          ctx.beginPath(); ctx.arc(0, 0, r * 2.2 + Math.sin(now * 3 + c.seed) * 1.2, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (rare) {
          for (let k = 0; k < 2; k++) {
            const p = (now * 0.7 + k * 0.5) % 1;
            ctx.strokeStyle = `rgba(${rgbGlow},${(1 - p) * (c.mine ? 0.75 : 0.4)})`;
            ctx.lineWidth = 3 * (1 - p) + 1;
            ctx.beginPath(); ctx.arc(0, 0, 14 + p * 62, 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.restore();

        ctx.save();
        // ---- light pillar for a revealed rare core
        if (rare) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const pulse = 0.75 + Math.sin(now * 4 + c.seed) * 0.2;
          const h = 300, w = c.mine ? 24 : 18, a = c.mine ? 1 : 0.5;
          const bg = ctx.createLinearGradient(0, c.y - hover, 0, c.y - hover - h);
          bg.addColorStop(0, `rgba(${rgbGlow},${0.85 * pulse * a})`); bg.addColorStop(0.5, `rgba(${c.mine ? '253,186,116' : '205,160,120'},${0.35 * pulse * a})`); bg.addColorStop(1, `rgba(${rgbGlow},0)`);
          ctx.fillStyle = bg;
          ctx.fillRect(c.x - w / 2, c.y - hover - h, w, h);
          ctx.fillStyle = `rgba(${c.mine ? '255,237,213' : '226,196,168'},${0.5 * pulse * a})`;
          ctx.fillRect(c.x - 4, c.y - hover - h * 0.8, 8, h * 0.8);
          this.glow(ctx, c.x, by, c.mine ? 80 : 55, rgbGlow, 0.5 * pulse * a);
          for (let s = 0; s < 5; s++) {
            const p = (now * 0.55 + s * 0.2 + c.seed) % 1;
            ctx.fillStyle = `rgba(${c.mine ? '254,215,170' : '200,190,180'},${(1 - p) * a})`;
            ctx.beginPath(); ctx.arc(c.x + Math.sin(now * 2 + s * 2.1) * 12, c.y - hover - p * 220, 2, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
        // ---- the reveal flash
        if (c.flash > 0) {
          const f = c.flash / 0.8;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          this.glow(ctx, c.x, by, 40 + (1 - f) * 150, c.mine ? '255,237,213' : '214,205,196', f * (c.mine ? 0.95 : 0.55));
          ctx.strokeStyle = `rgba(${c.mine ? '254,215,170' : '200,190,180'},${f})`; ctx.lineWidth = 3 * f + 1;
          ctx.beginPath(); ctx.ellipse(c.x, c.y - hover, 20 + (1 - f) * 110, (20 + (1 - f) * 110) * T, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
        // soft aura: white for the owner, none for teammates
        if (c.mine) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          this.glow(ctx, c.x, by, r * 3.2, rare ? '251,146,60' : '255,255,255', rare ? 0.5 : 0.2 + Math.sin(now * 3 + c.seed) * 0.05);
          ctx.restore();
        }

        // ---- the ball
        ctx.translate(c.x, by);
        ctx.globalAlpha = c.mine ? 1 : 0.6;
        const g = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.1, 0, 0, r * 1.1);
        if (c.mine) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.22, '#d1d5db'); g.addColorStop(0.55, '#1f2937'); g.addColorStop(1, '#000000'); }
        else { g.addColorStop(0, '#f3f4f6'); g.addColorStop(0.3, '#9ca3af'); g.addColorStop(1, '#4b5563'); }
        ctx.fillStyle = g;
        ctx.strokeStyle = c.mine ? (rare ? 'rgba(251,146,60,0.95)' : 'rgba(255,255,255,0.9)') : (rare ? 'rgba(176,150,124,0.9)' : 'rgba(209,213,219,0.7)');
        ctx.lineWidth = rare ? 2.2 : 1.3;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // specular dot
        ctx.fillStyle = c.mine ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(-r * 0.38, -r * 0.42, r * 0.17, 0, Math.PI * 2); ctx.fill();
        // break cores wear a thin orbiting ring so they read as the bigger prizes
        if (c.big) {
          ctx.strokeStyle = c.mine ? 'rgba(255,255,255,0.75)' : 'rgba(209,213,219,0.6)'; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.ellipse(0, 0, r * 1.75, r * 0.55, now * 0.8 + c.seed, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();

        // ---- tag over a revealed rare core (yours only; teammates just see the muted pillar)
        if (rare && c.mine) {
          ctx.save();
          ctx.font = '800 11.5px "Segoe UI", system-ui, sans-serif';
          ctx.textAlign = 'center';
          const label = c.kind === 'wings' ? '✦ ECLIPSE WINGS ✦' : (c.kind === 'pyre_wings' ? '✦ PYRE WINGS ✦' : (c.kind === 'bone_wings' ? '✦ BONE WINGS ✦' : (c.kind === 'moon_mobile' ? '✦ MOON MOBILE ✦' : '✦ RARE DROP ✦')));
          const ty = by - 30;
          const wdt = ctx.measureText(label).width + 16;
          ctx.fillStyle = 'rgba(30,12,2,0.82)';
          ctx.strokeStyle = 'rgba(251,146,60,0.9)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.roundRect(c.x - wdt / 2, ty - 12, wdt, 18, 9); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fed7aa'; ctx.fillText(label, c.x, ty + 1);
          ctx.restore();
        }
      }
    }
  };

  window.Cores = Cores;

  // While a player is inspecting a core, their pose is overridden (both classes). The sword/hammer is lowered to the ground in
  // the right hand while the left hand does the picking up, looking, shrugging and tucking away.
  function patchInspect(Cls) {
    if (typeof Cls === 'undefined') return;
    const orig = Cls.prototype.applyPoseHook;
    Cls.prototype.applyPoseHook = function (P) {
      const I = this.inspect;
      if (I && (this.state === 'idle' || this.state === 'walk')) {
        const z = inspectPose(Math.min(1, I.t / I.dur), I.quick);
        P.lHandLocal = z.lHand; P.rHandLocal = z.rHand; P.swordTipLocal = z.tip;
        P.crouchZ = z.crouchZ; P.torsoLeanFwd = z.lean; P.headPitchZ = z.head; P.torsoYaw = z.yaw;
        return;
      }
      if (orig) orig.call(this, P);
    };
  }
  if (typeof BreakerPlayer25D !== 'undefined') patchInspect(BreakerPlayer25D);
  if (typeof HammerPlayer25D !== 'undefined') patchInspect(HammerPlayer25D);
  if (typeof ReaperPlayer25D !== 'undefined') patchInspect(ReaperPlayer25D);
  if (typeof ArclightPlayer25D !== 'undefined') patchInspect(ArclightPlayer25D);
  if (typeof UnboundPlayer25D !== 'undefined') patchInspect(UnboundPlayer25D);
  Cores.inspectPose = inspectPose;

  // Reset on every scene change; hook the boss's pauldron break (runs on every client: the host decides, guests replay it)
  if (typeof Game25D !== 'undefined') {
    for (const fn of ['enterHub', 'enterRaidGate']) {
      const orig = Game25D.prototype[fn];
      Game25D.prototype[fn] = function () { Cores.reset(); return orig.apply(this, arguments); };
    }
  }
  if (typeof VaelgorRaidBoss !== 'undefined') {
    const origBreak = VaelgorRaidBoss.prototype.breakPauldron;
    VaelgorRaidBoss.prototype.breakPauldron = function (side, fromNetwork) {
      const was = side === 'left' ? this.leftPauldronBroken : this.rightPauldronBroken;
      const r = origBreak.call(this, side, fromNetwork);
      if (!was && (side === 'left' ? this.leftPauldronBroken : this.rightPauldronBroken)) {
        // the core pops out when the plate shatters, at the end of the white break animation (boss_vaelgor.js)
        const boss = this, delay = (this.PART_BREAK_FX_DUR || 0) * 1000;
        setTimeout(() => { const g = window.game; if (g && g.mode === 'raid' && g.boss === boss) Cores.onBreak(boss, side); }, delay);
      }
      return r;
    };
  }
})();
