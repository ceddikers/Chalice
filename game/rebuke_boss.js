// =========================================================================
// REBUKE_BOSS.JS — the boss side of the Unbound's [S] Rebuke, and the shared "Careful" status.
// Boss-agnostic: the mechanic lives here, the per-boss DATA (which patterns have parryable swings, and when they land)
// is a table the boss owns (`rebukeData`). A new boss only needs RebukeBoss.install(BossClass, itsTable).
//
//   boss.tryRebuke(player)  ->  'stop'   the pattern is interrupted (short recoil, then Careful starts)
//                               'block'  this swing's damage to that player is negated, the pattern keeps going
//                               'shrug'  the boss shrugs it off, nothing is blocked
//                               false    a miss (no open window, too far, wrong side, a mechanic)
//
// Careful (shared by every player, shown as a boss status icon only): 5s IMMUNE (a valid press shrugs), then 10s RESISTANT
// (a valid press blocks one swing and does not stop it), then normal. Fixed lengths, never growing.
//
// Co-op: the host decides (with a little latency grace) and broadcasts boss_event 'rebuke'. A guest's own press is predicted
// locally so its own swing is blocked in time (each client damages its own player), and reaches the host as 'rebuke_request'.
// =========================================================================
(function () {
  const TILT = () => (typeof PERSPECTIVE_TILT === 'number' ? PERSPECTIVE_TILT : 0.62);
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  const DEFAULTS = {
    window: 0.22,         // seconds before a swing's impact in which a press counts (the press is checked the frame S goes down)
    late: 0.08,           // ...and after it, so a press right on the impact still counts
    cue: 0.45,            // a white glint shows over the boss this long before a swing that can be rebuked (Unbound players only)
    netEarly: 0.1,        // extra seconds a guest's press may be early on the host's clock
    netLate: 0.25,        // ...and late (latency grace, like counterGraceTimer)
    reach: 215,           // how close the player must be (tilt-corrected)
    arc: 1.1,             // half-angle in front of the boss that counts as "in front" (radians)
    stun: 0.6,            // length of the 'rebuked' recoil
    push: 48,             // how far the recoil shoves the boss back (world units)
    stagger: 0.04,        // fraction of the stagger bar a successful Rebuke adds (never breaks it)
    nextPatternGap: 1.1,  // cap on the boss's idle gap after a stop
    immune: 5,            // Careful: seconds immune
    resist: 10,           // Careful: seconds resistant
    iframes: 0.5,         // a block's protection for the player
    rate: () => 1         // animation rate of the boss's pattern timers (a boss that speeds up reports it here)
  };

  // Mechanics and anything else never appear in a table; this is the belt-and-braces refusal.
  const NEVER = ['eclipse_mechanic', 'horizon_mechanic', 'iaido_mechanic', 'final_phase_mechanic', 'final_clash_mechanic', 'karok_clash',
    'intro_cutscene', 'staggered', 'rebuked'];

  const isAuthority = () => !window.game || !window.game.net || window.game.net.isHost;
  const send = (obj) => { if (window.game && window.game.net) window.game.net.broadcast(Object.assign({ type: 'boss_event' }, obj)); };

  function install(Cls, table) {
    const P = Cls.prototype;
    P.rebukeData = Object.assign({}, DEFAULTS, table);
    P.rebukeData.patterns = (table && table.patterns) || {};

    // -------- bookkeeping wrappers ------------------------------------------------------------------------------------
    const origTrigger = P.triggerPatternByName;
    P.triggerPatternByName = function () {
      this._rebukeSerial = (this._rebukeSerial || 0) + 1;     // every pattern start is a fresh set of parry windows
      this._rebukeUsed = null;
      return origTrigger.apply(this, arguments);
    };
    const origUpdate = P.update;
    P.update = function (dt) {
      if (this.careful && this.hp > 0) this.tickCareful(dt);
      const pu = this._rebukePush;                              // the recoil: shoved back a step, fast then settling
      if (pu) {
        const t0 = pu.t; pu.t = Math.min(pu.dur, pu.t + dt);
        const ease = (t) => 1 - Math.pow(1 - t / pu.dur, 3), d = (ease(pu.t) - ease(t0)) * pu.dist;
        this.x += pu.ux * d; this.y += pu.uy * d * TILT(); this.targetX = this.x; this.targetY = this.y;
        if (pu.t >= pu.dur) this._rebukePush = null;
      }
      return origUpdate.apply(this, arguments);
    };
    const origReset = P.resetBoss;
    P.resetBoss = function () {
      this.careful = null; this._rebukeUsed = null; this._rebukeSerial = 0;
      return origReset.apply(this, arguments);
    };

    // -------- Careful ---------------------------------------------------------------------------------------------------
    P.startCareful = function () {
      this.careful = { stage: 'immune', t: this.rebukeData.immune };
    };
    P.tickCareful = function (dt) {
      const c = this.careful;
      c.t -= dt;
      if (c.t > 0) return;
      this.careful = c.stage === 'immune' ? { stage: 'resist', t: this.rebukeData.resist + c.t } : null;   // carry the overshoot
      if (this.careful && this.careful.t <= 0) this.careful = null;
    };
    // for boss_sync (host -> guests): [stage code, seconds left]
    P.carefulNet = function () {
      const c = this.careful;
      return c ? [c.stage === 'immune' ? 1 : 2, Number(c.t.toFixed(2))] : [0, 0];
    };
    P.applyCarefulNet = function (arr) {
      if (!Array.isArray(arr)) return;
      const stage = arr[0] === 1 ? 'immune' : arr[0] === 2 ? 'resist' : null;
      if (!stage) { this.careful = null; return; }
      const c = this.careful;
      if (!c || c.stage !== stage || Math.abs(c.t - arr[1]) > 0.6) this.careful = { stage, t: arr[1] };
    };

    // -------- the parry windows ------------------------------------------------------------------------------------------
    // Finds the swing this press would answer. Returns { res, key } or null.
    P.evalRebuke = function (player, net) {
      const d = this.rebukeData;
      if (!d || this.hp <= 0 || !player || NEVER.indexOf(this.state) >= 0) return null;
      if (this.lockedByUltimateTimer > 0) return null;
      const pts = d.patterns[this.state];
      if (!pts || !(this.stateDuration > 0)) return null;
      const prog = Math.max(0, Math.min(1, (this.stateDuration - this.stateTimer) / this.stateDuration));
      const secPerProg = this.stateDuration / (d.rate(this) || 1);
      const dx = player.x - this.x, dy = (player.y - this.y) / TILT();
      const dist = Math.hypot(dx, dy), toPlayer = Math.atan2(dy, dx);
      const used = this._rebukeUsed || {};
      let best = null;
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (pt.awakened && !this.awakened) continue;
        const key = player.id + ':' + (this._rebukeSerial || 0) + ':' + i;
        if (used[key]) continue;
        const inT = (pt.t - prog) * secPerProg;                        // seconds until this swing lands (negative: already landed)
        // pressed while the glint shows but before the real window: an early press, which only blocks
        const early = net ? (inT > d.window + d.netEarly && inT <= d.cue + d.netEarly) : (inT > d.window && inT <= d.cue);
        const open = early || (net ? (inT <= d.window + d.netEarly && inT > -d.netLate) : (inT <= d.window && inT > -d.late));
        if (!open) continue;
        if (dist > (pt.reach || d.reach)) continue;
        if (pt.arc !== 'all' && dist > 18) {
          const ref = pt.face != null ? (this.baseFacing || 0) + pt.face : this.facingAngle;
          if (Math.abs(wrap(toPlayer - ref)) > (pt.arc || d.arc)) continue;
        }
        const score = inT > 0 ? inT : 10 - inT;                        // the upcoming swing first, then the one just gone
        if (!best || score < best.score) best = { score, key, early, inT };
      }
      if (!best) return null;
      const c = this.careful;
      let res = !c ? 'stop' : c.stage === 'immune' ? 'shrug' : 'block';
      if (best.early && res === 'stop') res = 'block';                 // early: the hit is turned aside, the boss keeps going
      return { key: best.key, res, inT: best.inT };
    };

    // Seconds until the next swing that can be rebuked (ignores range/facing: the cue is a timing tell), or null.
    P.nextRebukeIn = function () {
      const d = this.rebukeData;
      if (!d || this.hp <= 0 || NEVER.indexOf(this.state) >= 0) return null;
      const pts = d.patterns[this.state];
      if (!pts || !(this.stateDuration > 0)) return null;
      const prog = Math.max(0, Math.min(1, (this.stateDuration - this.stateTimer) / this.stateDuration));
      const secPerProg = this.stateDuration / (d.rate(this) || 1);
      let best = null;
      for (const pt of pts) {
        if (pt.awakened && !this.awakened) continue;
        const inT = (pt.t - prog) * secPerProg;
        if (inT > -d.late && inT <= d.cue && (best === null || inT < best)) best = inT;
      }
      return best;
    };
    const origDraw = P.draw;
    P.draw = function (ctx) {
      const r = origDraw.apply(this, arguments);
      const lp = window.game && window.game.localPlayer;
      if (!lp || lp.classId !== 'unbound') return r;
      const inT = this.nextRebukeIn();
      if (inT === null) return r;
      const d = this.rebukeData, open = inT <= d.window;
      const k = open ? 1 : 1 - (inT - d.window) / (d.cue - d.window);   // grows in, full size once the window is open
      const s = (open ? 16 : 6 + 8 * k) * (1 + 0.15 * Math.sin(performance.now() / 30));
      const x = this.x, y = this.y - 175 - (this.jumpZ || 0);
      ctx.save();
      ctx.globalAlpha = open ? 1 : 0.35 + 0.5 * k;
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#e2e8f0'; ctx.shadowBlur = open ? 18 : 8;
      ctx.beginPath();
      ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.22, y - s * 0.22); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.22, y + s * 0.22);
      ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.22, y + s * 0.22); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.22, y - s * 0.22);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      return r;
    };

    P._rebukeMark = function (key) { (this._rebukeUsed = this._rebukeUsed || {})[key] = 1; };

    P.tryRebuke = function (player, fromNetwork) {
      // A co-op proxy replaying its owner's swat (act_s) never decides anything: the owner's press arrives as 'rebuke_request'.
      if (player && player.isRemote && !fromNetwork) return false;
      const r = this.evalRebuke(player, !!fromNetwork);
      if (!r) return false;
      this._rebukeMark(r.key);
      const d = this.rebukeData;
      const auth = isAuthority();
      if (r.res === 'block') player.hIframes = Math.max(player.hIframes || 0, d.iframes, (r.inT || 0) + 0.15);   // an early block still covers the impact
      if (!auth) {
        // Guest: predict for its own player (its own copy of the boss damages it), the host decides what really happens.
        if (r.res === 'stop') player.hIframes = Math.max(player.hIframes || 0, 0.25);   // covers the round trip to the host
        if (r.res !== 'stop') this.rebukeFx(r.res);   // the stop itself is shown when the host's verdict arrives
        send({ event: 'rebuke_request', playerId: player.id });
        return r.res;
      }
      const sx = Math.round(this.x), sy = Math.round(this.y);
      this.applyRebuke(r.res, player.x, player.y);
      send({ event: 'rebuke', result: r.res, playerId: player.id, x: sx, y: sy, px: Math.round(player.x), py: Math.round(player.y), facingAngle: Number(this.facingAngle.toFixed(3)) });
      return r.res;
    };

    // host: a guest's press arrived
    P.onRebukeRequest = function (player) {
      if (!player || !isAuthority()) return;
      const r = this.evalRebuke(player, true);
      if (!r) return;
      this._rebukeMark(r.key);
      if (r.res === 'block') player.hIframes = Math.max(player.hIframes || 0, this.rebukeData.iframes, (r.inT || 0) + 0.15);
      const sx = Math.round(this.x), sy = Math.round(this.y);
      this.applyRebuke(r.res, player.x, player.y);
      send({ event: 'rebuke', result: r.res, playerId: player.id, x: sx, y: sy, px: Math.round(player.x), py: Math.round(player.y), facingAngle: Number(this.facingAngle.toFixed(3)) });
    };
    // everyone: the host's verdict
    P.onRebukeNet = function (data) {
      const requester = window.game && window.game.localPlayer && window.game.localPlayer.id === data.playerId;
      if (data.result === 'stop') {
        if (typeof data.x === 'number') { this.x = data.x; this.y = data.y; }
        if (typeof data.facingAngle === 'number') this.facingAngle = data.facingAngle;
      }
      if (requester && data.result !== 'stop') return;     // already shown by the prediction
      this.applyRebuke(data.result, data.px, data.py);
    };

    P.applyRebuke = function (res, px, py) {
      if (res === 'stop') {
        this.enterRebuked(px, py);
        this.startCareful();
      } else this.rebukeFx(res);
    };

    P.enterRebuked = function (px, py) {
      const d = this.rebukeData;
      // shoved back a step, away from whoever flicked the swing (straight back off the facing if we do not know who)
      let ux = -Math.cos(this.facingAngle || 0), uy = -Math.sin(this.facingAngle || 0);
      if (typeof px === 'number' && typeof py === 'number') {
        const dx = this.x - px, dy = (this.y - py) / TILT(), l = Math.hypot(dx, dy);
        if (l > 1) { ux = dx / l; uy = dy / l; }
      }
      this._rebukePush = { ux, uy, dist: d.push, dur: 0.28, t: 0 };
      this.counterableWindow = false;
      this.jumpZ = 0;                       // a stop during Guillotine's leap must not leave him airborne
      this.speed = 0; this.vx = 0; this.vy = 0;
      this.targetX = this.x; this.targetY = this.y;
      this.state = 'rebuked';
      this.stateDuration = d.stun;
      this.stateTimer = d.stun;
      this.snapFeetToBody();
      if (isAuthority()) {
        this.stagger = Math.min(this.maxStagger - 1, this.stagger + this.maxStagger * d.stagger);
        this.aiCooldown = Math.min(this.aiCooldown, d.nextPatternGap);
      }
      this.rebukeFx('stop');
    };

    P.rebukeFx = function (res) {
      const fx = window.fx;
      if (res === 'stop') {
        audio.playParryClang(true);
        audio.playImpactBoom(0.9);
        this.pelvisVelZ -= 22; this.pauldronVelZ -= 40;
        if (fx) {
          fx.triggerShake(10, 0.2);
          fx.triggerZoomPunch(0.04);
          fx.addShockwave(this.x, this.y, 130, '#e2e8f0', 4.5);
          fx.addDragSparks(this.x, this.y - 35, this.facingAngle, 16, false, '#f8fafc');
        }
      } else if (res === 'block') {
        audio.playParryClang(false);
        this.pauldronVelZ -= 14;
        if (fx) {
          fx.addShockwave(this.x, this.y, 95, '#cbd5e1', 3.5);
          fx.addDragSparks(this.x, this.y - 30, this.facingAngle, 8, false, '#e2e8f0');
        }
      } else if (res === 'shrug') {
        audio.playParryClang(false);
        this.pelvisVelZ += 16; this.pauldronVelZ += 34;       // the shoulders pop up and settle: a shrug
        if (fx) fx.addShockwave(this.x, this.y, 70, '#94a3b8', 2.5);
      }
    };
  }

  window.RebukeBoss = { install, DEFAULTS };

  // =========================================================================
  // VAELGOR's table. t = progress of the pattern (stateTimer based, same as update() in boss_vaelgor.js) at which a swing lands.
  // arc: 'all' for 360-degree swings, otherwise the half-angle in front (default 1.1 rad). face: offset from baseFacing when the
  // swing is aimed off the boss's current facing (the backhand pivot). reach overrides the default reach.
  // Uppercut / Thrust are already blue-flash Counter moves; Graveyard, Damocles, Cross Judgment, World Cleaver, Vortex, the
  // final-phase patterns, Getsuga and every mechanic are intentionally absent.
  // =========================================================================
  if (typeof VaelgorRaidBoss !== 'undefined') {
    install(VaelgorRaidBoss, {
      rate: (b) => (b.enraged ? 1.32 : (b.awakened ? 1.12 : 1.0)),
      patterns: {
        cleave: [{ t: 0.36 }, { t: 0.64 }, { t: 0.86, awakened: true, arc: 'all', reach: 170 }],
        pat_phantom_step: [{ t: 0.52 }],
        // rip, spin, then the landing slam (pressed while he is still in the air: the leap itself is not a swing)
        pat_guillotine: [{ t: 0.22 }, { t: 0.35, arc: 'all', reach: 170 }, { t: 0.84, arc: 'all', reach: 320 }],
        pat_mirage: [{ t: 0.24, arc: 0.7, reach: 230 }, { t: 0.46, arc: 0.7, reach: 230 }, { t: 0.68, arc: 0.7, reach: 230 }],
        pat_dreadnought: [{ t: 0.74, arc: 'all', reach: 190 }],
        pat_phantom_flurry: [{ t: 0.38, arc: 1.5, reach: 190 }, { t: 0.50, arc: 1.5, reach: 190 }, { t: 0.62, arc: 1.5, reach: 190 }, { t: 0.74, arc: 1.5, reach: 190 }, { t: 0.88, arc: 'all', reach: 175 }],
        pat_blood_rain: [{ t: 0.16, arc: 1.4, reach: 185 }],
        pat_thaemine_pizza: [{ t: 0.36, face: 0, arc: 2.1, reach: 235 }, { t: 0.64, face: Math.PI, arc: 1.75, reach: 225 }]
      }
    });
  }
})();
