// =========================================================================
// REAPER_25D.JS — "Reaper" chain-scythe class (fantasy: a fragile hunter who feeds on the boss, then becomes the demon)
//
// Extends BreakerPlayer25D so movement, IK rig, hit-reactions, cape and the shared Final Clash come for free. Everything class
// specific lives here (logic) and in reaper_rig.js (drawing: scythe tiers, armor tiers, poses, Voidform look) and reaper_hud.js.
//
//   • Umbral Shield   — lifesteal shield, capped at 50% max HP, decays a few seconds after your last gain.
//   • Builders        — Auto · S Siphon Chain (hook, heals first then shields) · F Soul Rip · D Dread Riposte (counter).
//   • Spenders        — Q W E R. WITH shield they are the upgraded version (bonus damage scaling with how full the shield is, and
//                       extra effects); WITHOUT shield they still work at 75% strength and cost 6% of your HP.
//   • Blood gauge     — fills from drains/spending. Full: [Z] Voidform: you drop the scythe and become the demon for ~22s with a
//                       whole new set of 8 skills (same build/spend loop: builders feed the shield, spenders eat it, hungrier).
//   • T               — Human: Reaper's Verdict (boss lock + flurry + slam). Voidform: Crimson Eclipse (locked 5s charge that ENDS
//                       the form). Separate cooldowns.
// Act kinds — human: b q qs w e r a s d f t z · demon: b(claws) vq vw ve vr a(blink) s(lash) d vf tv
// =========================================================================

const R_SHIELD_CAP_FRAC = 0.5;        // shield cap as a fraction of max HP
const R_SHIELD_DECAY_DELAY = 3.0;     // seconds after the last gain before the shield starts to drain
const R_SHIELD_DECAY_RATE = 0.05;     // fraction of max HP lost per second once draining
const R_EMPTY_COST = 0.06;            // fraction of current HP a spender costs when there is no shield to spend
const R_NOSHIELD_POWER = 0.75;        // spenders without shield hit at this fraction of their strength
const R_BLOOD_MAX = 100;
const R_VOID_TIME = 22;
const R_VT_CHARGE = 5.0;              // Crimson Eclipse charge (seconds)

const rClamp01 = (t) => Math.max(0, Math.min(1, t));
const rLerp = (a, b, t) => a + (b - a) * t;
const rEaseOut = (t) => 1 - Math.pow(1 - rClamp01(t), 3);
const rEaseIn = (t) => Math.pow(rClamp01(t), 2.2);
const rTilt = () => (typeof PERSPECTIVE_TILT !== 'undefined' ? PERSPECTIVE_TILT : 0.55);

window.SKILL_META = window.SKILL_META || {};
window.SKILL_META.reaper = {
  title: 'REAPER',
  identity: { name: 'Voidform', icon: '🩸', key: 'Z', kind: 'reaper_blood' },
  passive: {
    name: 'Umbral Shield',
    desc: 'Your builders (Auto, [S], [F], [D]) turn damage into a shield, up to 50% of your max HP; [S] heals you first and only then shields. It starts draining a few seconds after your last gain. Your spenders ([Q] [W] [E] [R]) consume part of it and become their UPGRADED form, with a bonus that grows with how full it is. With no shield they still work at 75% strength but cost 6% of your current HP. Max HP is lower than other classes.'
  },
  skills: {
    q: { name: 'Reaping Arc', icon: '🌙', short: 'Arc', stagger: 'medium', destructive: false, counter: false, position: 'back', cd: '5.5s',
         desc: 'A fast forward slash of the scythe. Spender: consumes 25% of your shield and becomes a SPIN STOMP: a short hop with a whirling scythe, then a ground-shaking slam on the boss. Up to +35% damage.' },
    w: { name: 'Gravebound Hook', icon: '⛓️', short: 'Hook', stagger: 'high', destructive: true, counter: false, cd: '8s',
         desc: 'Aimed skillshot: hurl the scythe along the line of your cursor. If it hooks the boss you are hauled in for a heavy slam and [Q] is RESET. Spender: consumes 40% of your shield for up to +55% damage.' },
    e: { name: 'Lethal Spin', icon: '🌪️', short: 'Spin', stagger: 'medium', destructive: false, counter: false, position: 'back', cd: '8s',
         desc: 'Spin on the spot in a rapid bladestorm that keeps hitting anything in reach, ending in a cross-slash. Spender: consumes 40% of your shield, lasts longer, hits harder and RESETS [Q] when it connects.' },
    r: { name: 'Eclipse Harvest', icon: '🌀', short: 'Harvest', stagger: 'high', destructive: false, counter: false, position: 'back', cd: '14s',
         desc: 'Leap high into a blood vortex, whirl the scythe, then crash down. Spender: consumes ALL your shield for up to +110% damage and RESETS [Q].' },
    a: { name: 'Shade Step', icon: '👤', short: 'Shade', stagger: 'none', destructive: false, counter: false, cd: '7s',
         desc: 'Slip toward the cursor as a shadow with full i-frames, leaving an afterimage behind.' },
    s: { name: 'Siphon Chain', icon: '🩸', short: 'Siphon', stagger: 'low', destructive: false, counter: false, cd: '14s',
         desc: 'Aimed skillshot: fire a chain along your cursor. If it hooks the boss, it drains it for about 6s: the stolen life HEALS you first and only then becomes Umbral Shield (up to the cap). You can move and cast while it holds.' },
    d: { name: 'Dread Riposte', icon: '💠', short: 'Riposte', stagger: 'low', destructive: false, counter: true, cd: '6s',
         desc: 'A quick counter stance. Landing it on a blue boss flash is a full counter: big stagger, a chunk of shield and Blood.' },
    f: { name: 'Soul Rip', icon: '👁️', short: 'Rip', stagger: 'medium', destructive: true, counter: false, cd: '12s',
         desc: 'Gather the dead around you, then tear the souls out of whatever is close and drag them into your shield. Your biggest builder.' },
    t: { name: "Reaper's Verdict", icon: '⛓️', short: 'Verdict', stagger: 'high', destructive: true, counter: false, cd: '2m',
         desc: 'Chains erupt and hold the boss in place while you cut it down in a flurry and a crushing slam, leaving it staggered. (In Voidform this is Crimson Eclipse, with its own cooldown.)' },
    v: { name: 'Crimson Eclipse', icon: '🩸', short: 'Eclipse', stagger: 'high', destructive: true, counter: false, cd: '80s',
         desc: 'Voidform [T]. A locked 5-second charge, then one gigantic sphere of blood in the direction you were facing when you started. The Voidform timer is frozen while you cast, then you return to human form.' },
    space: { name: 'Evade Dash', icon: '💨', short: 'Evade', stagger: 'none', destructive: false, counter: false, cd: '5.5s',
         desc: 'Quick dash with i-frames. Also a wake-up roll when knocked down.' },
    z: { name: 'Voidform', icon: '🩸', short: 'Voidform', stagger: 'none', destructive: false, counter: false, cd: '—',
         desc: 'When the blood sphere is full and shining, press [Z]: you drop the scythe and become the demon for about 22s with an entirely new set of skills. Damage up, damage taken down, you run like something that should not run. The skills still eat your shield, but it fills faster.' }
  },
  // the Voidform kit (names here are what the damage chart and the HUD show while transformed)
  void: {
    q: { name: 'Maw Lunge', icon: '🦷', short: 'Lunge', stagger: 'medium', destructive: false, counter: false, position: 'back', cd: '25s',
         desc: 'Spender (25%): blink-lunge into the boss and maul it with four rapid claw rends and a heavy finisher.' },
    w: { name: 'Hellspike Row', icon: '🔱', short: 'Spikes', stagger: 'high', destructive: true, counter: false, cd: '25s',
         desc: 'Spender (40%): slam the ground and a line of bone spikes erupts along your cursor, skewering whatever stands in it.' },
    e: { name: 'Rift Maw', icon: '🕳️', short: 'Maw', stagger: 'high', destructive: true, counter: false, cd: '25s',
         desc: 'Spender (40%): open a hell-mouth at the cursor. It gapes for a moment, then snaps shut with a huge bite.' },
    r: { name: 'Abyss Cataclysm', icon: '☄️', short: 'Cataclysm', stagger: 'high', destructive: true, counter: false, position: 'front', cd: '25s',
         desc: 'Spender (ALL shield): call down a rain of impaling blood spears on the boss and finish with a detonation.' },
    a: { name: 'Wraith Blink', icon: '👻', short: 'Blink', stagger: 'none', destructive: false, counter: false, cd: '25s',
         desc: 'Teleport to the cursor with full i-frames, leaving a blood burst and landing in one.' },
    s: { name: 'Blood Lash', icon: '🩸', short: 'Lash', stagger: 'low', destructive: false, counter: false, cd: '25s',
         desc: 'Aimed skillshot: a barbed tendril lashes out and latches on, draining faster and further than the chain. Heals you first, then shields.' },
    d: { name: 'Hellguard Riposte', icon: '💠', short: 'Riposte', stagger: 'low', destructive: true, counter: true, cd: '25s',
         desc: 'Counter stance. A successful counter detonates in a burst of hellfire.' },
    f: { name: 'Devour', icon: '👹', short: 'Devour', stagger: 'medium', destructive: true, counter: false, cd: '25s',
         desc: 'Lunge in and bite a chunk out of the boss: heals you and floods your shield. Your fast builder.' },
    t: { name: 'Crimson Eclipse', icon: '🩸', short: 'Eclipse', stagger: 'high', destructive: true, counter: false, cd: '80s',
         desc: 'A locked 5-second charge, then one gigantic sphere of blood in the direction you were facing. The Voidform timer is frozen while you cast, then you return to human form.' }
  }
};

class ReaperPlayer25D extends BreakerPlayer25D {
  constructor(id, name, x, y, isLocal = true, isBot = false) {
    super(id, name || 'Reaper', x, y, isLocal, isBot);
    this.classId = 'reaper';
    this.weaponColor = '#e11d48';
    this.weaponGlow = '#7f1d1d';
    this.weaponModelId = 'scythe_bone';
    this.baseAtk = 150;
    this.hpScale = 0.65;        // gear's HP is multiplied by this (crafting_vindictus.js applyEquipmentToPlayer)
    this.maxHp = 1700;
    this.hp = 1700;
    this.baseMaxSpeed = 197;

    this.cds = { q: 0, w: 0, e: 0, r: 0, a: 0, s: 0, d: 0, f: 0, t: 0, tv: 0, z: 0, space: 0, wakeup: 0 };
    this.maxCds = { q: 5.5, w: 8, e: 8, r: 14, a: 7, s: 14, d: 6, f: 12, t: 120, tv: 80, z: 1.5, space: 5.5, wakeup: 20 };
    // Human and Voidform do NOT share cooldowns: Q-F read and write the table of the CURRENT form, so the other form's skills keep counting
    // down in the background. Every Voidform skill has a 25s cooldown (one use per Voidform, which lasts about 22s).
    this.cdTables = { human: { q: 0, w: 0, e: 0, r: 0, a: 0, s: 0, d: 0, f: 0 }, void: { q: 0, w: 0, e: 0, r: 0, a: 0, s: 0, d: 0, f: 0 } };
    const humanMax = Object.assign({}, this.maxCds);
    for (const k of 'qwerasdf') {
      Object.defineProperty(this.cds, k, { get: () => this.cdTables[this.form === 'void' ? 'void' : 'human'][k], set: (v) => { this.cdTables[this.form === 'void' ? 'void' : 'human'][k] = v; }, enumerable: true, configurable: true });
      Object.defineProperty(this.maxCds, k, { get: () => (this.form === 'void' ? 25 : humanMax[k]), set: (v) => { humanMax[k] = v; }, enumerable: true, configurable: true });
    }

    this.act = null;
    this.hIframes = 0;
    this.form = 'human';        // 'human' | 'void'
    this.formT = 0;
    this.vfBlend = 0;           // 0..1 smoothed look (colour, run, scythe visible)
    this.blood = 0;
    this.bloodShown = 0;        // eased for the HUD sphere
    this.shieldDecayT = 0;
    this.tether = null;         // { t, dur, range, tick, boss }
    this.shades = [];           // Shade Step afterimages
    this.vfx = [];              // timed world effects: spikes, maws, spears, souls, bursts (drawn by reaper_rig.js)
    this.dropped = null;        // the scythe you threw away when the form began
    this.bStep = 0; this.bResetT = 0;
    this.hudFlashT = 0;
    this.vtAim = 0;
  }

  // A fresh start (raid entry, back to the hub): no form, no blood, nothing mid-cast.
  resetReaper() {
    this.act = null; this.form = 'human'; this.formT = 0; this.vfBlend = 0; this.blood = 0; this.bloodShown = 0;
    this.shield = 0; this.tether = null; this.shades = []; this.vfx = []; this.dropped = null; this.jumpZ = 0; this.hIframes = 0;
    this.bStep = 0; this.bResetT = 0;
    if (this.state === 'h_act') this.state = 'idle';
    this.restoreChargeCamera();
  }

  // ----- small accessors ---------------------------------------------------
  get inVoid() { return this.form === 'void'; }
  get shieldCap() { return this.maxHp * R_SHIELD_CAP_FRAC; }
  addOverpower() { /* Breaker-only resource */ }
  noKeyRepeat(k) { return k === 'z' || k === 't' || k === 'e' || k === 'w' || k === 'r' || k === 'f' || k === 's'; }

  say(text, color = '#fda4af', size = 13) {
    if (window.fx && this.isLocal) window.fx.addFloatingText(this.x, this.y - 78, text, color, size);
  }

  // Extra fields riding on the regular player_state packet (see network_coop.js).
  getNetState() {
    const mw = this.mouseWorld();
    return {
      rf: this.form === 'void' ? 1 : 0, rft: Math.round(this.formT * 10) / 10, rb: Math.round(this.blood),
      ax: Math.round(mw.x), ay: Math.round(mw.y)
    };
  }

  applyNetState(d) {
    this.remoteAim = { x: d.ax, y: d.ay };
    if (typeof d.rb === 'number') this.blood = d.rb;
    if (typeof d.rf === 'number') {
      const nf = d.rf ? 'void' : 'human';
      if (nf !== this.form) { this.form = nf; if (nf === 'void') this.onEnterVoid(true); }
      this.formT = d.rft || 0;
    }
  }

  // ----- Umbral Shield & Blood ---------------------------------------------
  gainShield(v) {
    if (this.isRemote || v <= 0) return;
    if (this.form === 'void') v *= 1.6;      // the demon is hungrier
    this.shield = Math.min(this.shieldCap, (this.shield || 0) + v);
    this.shieldDecayT = R_SHIELD_DECAY_DELAY;
  }

  gainBlood(v) {
    if (this.isRemote || v <= 0 || this.form === 'void') return;
    const before = this.blood;
    this.blood = Math.min(R_BLOOD_MAX, this.blood + v);
    if (before < R_BLOOD_MAX && this.blood >= R_BLOOD_MAX) {
      this.hudFlashT = 1.0;
      this.say('🩸 VOIDFORM READY  [Z]', '#fb7185', 14);
      if (window.fx && this.isLocal) { window.fx.addShockwave(this.x, this.y, 110, '#e11d48', 4, 0.45); }
      if (audio.playEclipseBell && this.isLocal) audio.playEclipseBell();
    }
  }

  // Spenders. Returns { mult, emp }. emp = a shield was consumed: the UPGRADED skill, with a bonus that scales with the fill.
  // No shield: the plain skill at 75% strength, and (human only) 6% of your HP.
  spend(frac, maxBonus, bloodGain) {
    const void_ = this.form === 'void';
    const cap = this.shieldCap;
    if ((this.shield || 0) >= cap * 0.05) {
      const fill = Math.min(1, this.shield / cap);
      this.shield -= this.shield * frac * (void_ ? 0.7 : 1);
      this.gainBlood(bloodGain);
      this.fxBlood(this.x, this.y - 30, 6);
      return { mult: 1 + maxBonus * fill * (void_ ? 1.25 : 1), emp: true };
    }
    if (!void_ && !this.isRemote) {
      const cost = Math.max(0, Math.min(this.hp - 1, Math.round(this.hp * R_EMPTY_COST)));
      this.hp -= cost;
      if (cost > 1) { this.say(`-${Math.round(cost)}`, '#fb7185', 12); this.fxBlood(this.x, this.y - 30, 8); }
    }
    return { mult: R_NOSHIELD_POWER, emp: false };
  }

  fxBlood(x, y, n = 6) {
    if (window.fx && window.fx.addDragSparks) window.fx.addDragSparks(x, y, Math.random() * Math.PI * 2, n, true, '#e11d48');
  }

  // Positioned hit with reach check. Returns the damage dealt (0 = miss).
  strike(boss, cx, cy, reach, coeff, name, stagger, opts = null) {
    if (!boss || boss.hp <= 0) return 0;
    if (!this.isRemote && typeof boss.checkPlayerHitAnchors === 'function') boss.checkPlayerHitAnchors(cx, cy, reach);
    if (Math.hypot(boss.x - cx, (boss.y - cy) / PERSPECTIVE_TILT) >= reach) return 0;
    const o = Object.assign({ isStrongMove: false, impulseStrength: 0.8, hitX: cx, hitY: cy }, opts || {});
    return this.dealHitToBoss(boss, coeff, name, !!o.head, stagger, false, o) || 0;
  }

  // Every landing hit funnels through here (Breaker's base included).
  dealHitToBoss(boss, coeff, skillName, isHeadSkill = false, staggerAmt = 18, applyFracture = false, hitOpts = null) {
    if (this.form === 'void') coeff *= 1.2;
    return super.dealHitToBoss(boss, coeff, skillName, isHeadSkill, staggerAmt, false, hitOpts);
  }

  aimAt(boss, ax, ay, assistRange = 260) {
    let ang = Math.atan2((ay - this.y) / PERSPECTIVE_TILT, ax - this.x);
    if (boss && boss.hp > 0 && assistRange > 1) {
      const d = Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT);
      if (d < assistRange) ang = Math.atan2((boss.y - this.y) / PERSPECTIVE_TILT, boss.x - this.x);
    }
    this.facingAngle = ang;
    return ang;
  }

  mouseWorld() {
    if (!this.isLocal) {
      return this.remoteAim || { x: this.x + Math.cos(this.facingAngle) * 200, y: this.y + Math.sin(this.facingAngle) * 200 * PERSPECTIVE_TILT };
    }
    const g = window.game;
    return { x: g ? g.mouseWorldX : this.x + 100, y: g ? g.mouseWorldY : this.y };
  }

  // ----- action framework (same shape as the Gravebreaker's) -----------------
  beginAct(kind, dur, extra = null) {
    this.act = Object.assign({ kind, t: 0, dur }, extra || {});
    this.state = 'h_act';
    this.stateDuration = dur + 0.4;
    this.stateTimer = dur + 0.4;
    this.stateHitDone = false;
    this.targetX = this.x;
    this.targetY = this.y;
    this.bodySpinAngle = 0;
    return this.act;
  }

  endAct() {
    const a = this.act;
    this.act = null;
    if (this.state === 'h_act') {
      this.state = 'idle';
      this.stateTimer = 0;
      this.jumpZ = 0;
      this.bodySpinAngle = 0;
      this.swordScale = 1.0;
      this.targetX = this.x;
      this.targetY = this.y;
      this.snapFeetToBody();
    }
    this.restoreChargeCamera();
    return a;
  }

  cancelActIfInterrupted() {
    if (this.act && this.state !== 'h_act') {
      const a = this.act;
      this.act = null;
      this.restoreChargeCamera();
      if (a.kind === 'tv') { this.cds.tv = this.maxCds.tv * 0.5; }
    }
  }

  restoreChargeCamera() {
    if (this._chargeSavedZoom && window.game && window.game.camera) window.game.camera.targetZoom = this._chargeSavedZoom;
    this._chargeSavedZoom = null;
  }

  saveCamera() {
    if (this.isLocal && window.game && window.game.camera && !this._chargeSavedZoom) this._chargeSavedZoom = window.game.camera.targetZoom;
  }

  // An auto-attack whose blow has landed may be cut short by a skill.
  skillCancelReady() {
    const a = this.act;
    return !!(a && a.kind === 'b' && a.hit && a.t >= a.dur * 0.55);
  }

  // True once the running W / E / R has done its damage and only recovery is left (human form only).
  qCancelReady() {
    const a = this.act;
    if (!a || this.form === 'void') return false;
    if (a.kind === 'w') return a.phase === 'retract' || (a.phase === 'slam' && a.slam);
    if (a.kind === 'e') return !!a.finished;
    if (a.kind === 'r') return a.phase === 'slam' && a.phaseT >= 0.1;
    return false;
  }

  // ----- update -------------------------------------------------------------
  _updateInternal(dt, boss, arenaCenter, arenaRadius) {
    if (this.qBuf > 0) {
      this.qBuf -= dt;
      if (this.isLocal && this.cds.q <= 0 && (this.canAct() || this.qCancelReady()) && window.game && window.game.useSkill) {
        this.qBuf = 0;
        window.game.useSkill('q');
      }
    }
    if (this.hIframes > 0) this.hIframes = Math.max(0, this.hIframes - dt);
    if (this.hudFlashT > 0) this.hudFlashT = Math.max(0, this.hudFlashT - dt);
    if (this.bResetT > 0) this.bResetT = Math.max(0, this.bResetT - dt);

    // Voidform: cooldowns tick faster; the gauge drains as the form runs out.
    if (this.form === 'void') {
      // Casting Crimson Eclipse freezes the Voidform clock; it resumes (and the form ends on time) once the cast is over.
      const frozen = !!(this.act && this.act.kind === 'tv');
      if (!frozen) this.formT -= dt;
      this.blood = Math.max(0, R_BLOOD_MAX * (this.formT / R_VOID_TIME));
      if (this.formT <= 0 && !this.isRemote && !frozen) this.endVoid();
    }
    { const other = this.form === 'void' ? this.cdTables.human : this.cdTables.void; for (const k in other) if (other[k] > 0) other[k] = Math.max(0, other[k] - dt); }      // the form you are not in keeps cooling down
    this.vfBlend += ((this.form === 'void' ? 1 : 0) - this.vfBlend) * Math.min(1, dt * 5);
    this.bloodShown += (this.blood - this.bloodShown) * Math.min(1, dt * 6);

    // Shield drains once you stop feeding it (owner only; proxies get the number from player_state).
    if (!this.isRemote && this.shield > 0) {
      if (this.shieldDecayT > 0) this.shieldDecayT -= dt;
      else this.shield = Math.max(0, this.shield - this.maxHp * R_SHIELD_DECAY_RATE * dt);
    }

    if (this.hp <= 0) {
      this.act = null; this.tether = null;
      if (this.form === 'void' && !this.isRemote) { this.form = 'human'; this.formT = 0; this.blood = 0; }   // dying ends the form
      this.restoreChargeCamera();
    } else {
      this.cancelActIfInterrupted();
      this.updateTether(dt, boss);
      this.updateAct(dt, boss);
    }
    this.updateVfx(dt, boss);
    this.updateShades(dt, boss);
    this.baseMaxSpeed = this.form === 'void' ? 240 : 197;   // Voidform runs 20% faster
    super._updateInternal(dt, boss, arenaCenter, arenaRadius);
    // The Voidform scuttle: the stride runs faster than the body moves.
    if (this.form === 'void' && this.walkWeight > 0.05) this.walkPhase += dt * 3.2 * this.walkWeight;
  }

  updateAct(dt, boss) {
    const a = this.act;
    if (!a) return;
    a.t += dt;
    this.stateDuration = Math.max(0.5, a.dur) + 0.4;
    this.stateTimer = Math.max(0.35, Math.max(0.5, a.dur) + 0.4 - a.t);
    this.targetX = this.x;
    this.targetY = this.y;
    const fn = this['act_' + a.kind];
    if (fn) fn.call(this, dt, boss, a);
    else this.endAct();
  }

  // Timed world effects. e = { kind, x, y, t, dur, ... }
  addVfx(e) { e.t = 0; this.vfx.push(e); return e; }
  updateVfx(dt, boss = null) {
    for (let i = this.vfx.length - 1; i >= 0; i--) {
      const e = this.vfx[i];
      e.t += dt;
      if (e.kind === 'maw') this.mawTick(e, dt, boss);
      else if (e.kind === 'spikerow') this.spikeRowTick(e, dt, boss);
      if (e.t >= e.dur) this.vfx.splice(i, 1);
    }
    if (this.dropped) { this.dropped.t += dt; if (this.dropped.t > 1.8) this.dropped = null; }
  }

  // ----- Damage taken -------------------------------------------------------
  takeDamage(rawAmount, sourceName = 'Attack', impactOpts = null) {
    if (this.isRemote) return;
    const lethal = impactOpts && impactOpts.forceLethal;
    if (this.hIframes > 0 && !lethal) return;
    let amt = rawAmount;
    if (!lethal) {
      if (this.form === 'void') amt *= 0.75;
      if (this.act && (this.act.kind === 'tv' || this.act.kind === 'z' || this.act.kind === 'vr')) amt *= 0.5;
    }
    const armored = !!(this.act && ['r', 't', 'tv', 'z', 'w', 'vr', 'qs'].includes(this.act.kind));
    if (armored) {
      const keep = this.state;
      this.state = 'f_wrath';   // Breaker's super-armor flag
      super.takeDamage(amt, sourceName, impactOpts);
      if (this.state === 'f_wrath') this.state = keep;
      return;
    }
    super.takeDamage(amt, sourceName, impactOpts);
  }

  // ----- Input ---------------------------------------------------------------
  triggerSkill(key, aimX, aimY, boss = null, fromNetwork = false) {
    if (this.hp <= 0 || this.state === 'grabbed' || this.state === 'clash_lock' || this.clashQteActive) return false;
    const prevAlly = window.fx ? window.fx.sourceIsAlly : false;
    if (window.fx) window.fx.sourceIsAlly = !this.isLocal;
    try {
      const k = key.toLowerCase();
      if (!this.isLocal && typeof aimX === 'number' && typeof aimY === 'number') this.remoteAim = { x: aimX, y: aimY };
      if (fromNetwork) {
        // Replays are authoritative (the owner already validated the cast): bypass cooldowns and drop whatever we were doing.
        if (k !== 'wakeup') this.cds[k] = 0;
        if (k === 't' && this.form === 'void') this.cds.tv = 0;
        if (k === 'z') { this.blood = R_BLOOD_MAX; this.form = 'human'; }
        if (this.act) { this.act = null; this.restoreChargeCamera(); this.jumpZ = 0; if (this.state === 'h_act') this.state = 'idle'; }
        if (this.hp > 0 && !this.canAct() && !this.act) this.state = 'idle';
      }

      if (k === 'space') {
        if (this.act) { this.act = null; this.restoreChargeCamera(); }
        return super.triggerSkill('space', aimX, aimY, boss, fromNetwork);
      }
      if (k === 'z') return this.castZ(boss);
      if (k === 't') return this.form === 'void' ? this.castVT(aimX, aimY, boss) : this.castT(aimX, aimY, boss);

      // Auto-attack hits are cancelable into any skill once the blow has landed (the rest is only recovery)
      if (!fromNetwork && this.isLocal && this.act && this.act.kind !== k && 'qwerasdf'.includes(k) && this.cds[k] <= 0 && this.skillCancelReady()) {
        this.act = null; this.restoreChargeCamera();
        this.jumpZ = 0; this.bodySpinAngle = 0; this.state = 'idle'; this.stateTimer = 0; this.snapFeetToBody();
      }
      // Q after a W / E / R reset: cut the recovery tail of the spender that reset it, or buffer the press so the chain stays smooth
      if (k === 'q' && !fromNetwork && this.isLocal) {
        if (this.cds.q <= 0 && this.act && this.qCancelReady()) {
          this.act = null; this.restoreChargeCamera();
          this.jumpZ = 0; this.bodySpinAngle = 0; this.state = 'idle'; this.stateTimer = 0; this.snapFeetToBody();
        } else if (this.cds.q > 0 || !this.canAct()) { this.qBuf = 0.5; return false; }
      }
      if (this.cds[k] > 0) return false;
      if (!this.canAct()) return false;
      if (k === 'q') return this.castQ(aimX, aimY, boss);
      if (k === 'w') return this.castW(aimX, aimY, boss);
      if (k === 'e') return this.castE(aimX, aimY, boss);
      if (k === 'r') return this.castR(aimX, aimY, boss);
      if (k === 'a') return this.castA(aimX, aimY, boss);
      if (k === 's') return this.castS(aimX, aimY, boss);
      if (k === 'd') return this.castD(aimX, aimY, boss);
      if (k === 'f') return this.castF(aimX, aimY, boss);
      return false;
    } finally {
      if (window.fx) window.fx.sourceIsAlly = prevAlly;
    }
  }

  col() { return this.form === 'void' ? '#ff1a3c' : '#e11d48'; }

  // =========================================================================
  // AUTO — REAPING COMBO (3 hits) / CLAW FLURRY (4 hits in Voidform). Builder.
  // =========================================================================
  triggerBasicAttack(aimX, aimY, fromNetwork = false) {
    if (this.hp <= 0) return false;
    const void_ = this.form === 'void';
    const maxStep = void_ ? 4 : 3;
    const a0 = this.act;
    const chaining = !!(a0 && a0.kind === 'b' && a0.t >= a0.dur * 0.6 && a0.step < maxStep);
    if (fromNetwork && !chaining && !this.canAct()) { this.act = null; this.state = 'idle'; }
    if (!this.canAct() && !chaining) return false;
    const step = chaining ? a0.step + 1 : ((this.bResetT > 0 && this.bStep < maxStep) ? this.bStep + 1 : 1);
    this.bStep = step;
    this.bResetT = 1.0;
    this.aimAt(window.game ? window.game.getActiveBossTarget() : null, aimX, aimY, 210);
    const last = step === maxStep;
    const dur = void_ ? (last ? 0.5 : 0.3) : (last ? 0.74 : 0.48);
    if (chaining) { this.act = null; this.state = 'idle'; }
    this.beginAct('b', dur, { step, hit: false, last });
    const dir = { x: Math.cos(this.facingAngle), y: Math.sin(this.facingAngle) * PERSPECTIVE_TILT };
    const burst = last ? 230 : 160;
    this.attackStepVx = dir.x * burst; this.attackStepVy = dir.y * burst;
    audio.playSwordSlash(last, last ? 1.15 : 0.95);
    this.lungeFootForward(step % 2 ? this.leftFoot : this.rightFoot, 16, step % 2 ? -this.hipWidth - 2 : this.hipWidth + 2, 0.14);
    return true;
  }

  act_b(dt, boss, a) {
    const p = rClamp01(a.t / a.dur);
    const void_ = this.form === 'void';
    if (!void_ && a.last) {
      this.bodySpinAngle = rEaseOut(rClamp01((p - 0.1) / 0.55)) * Math.PI * 2;
      this.jumpZ = Math.sin(rClamp01(p / 0.75) * Math.PI) * 12;
    } else {
      this.bodySpinAngle = (a.step % 2 ? -1 : 1) * 0.4 * Math.sin(p * Math.PI);
    }
    const hitAt = a.last ? 0.46 : 0.4;
    if (!a.hit && p >= hitAt) {
      a.hit = true;
      const cx = this.x + Math.cos(this.facingAngle) * 70, cy = this.y + Math.sin(this.facingAngle) * 70 * PERSPECTIVE_TILT;
      const col = this.col();
      if (window.fx) {
        window.fx.addSlashRibbon(this.x, this.y, a.last ? 150 : 128, this.facingAngle + (a.step % 2 ? 1.5 : -1.5), this.facingAngle + (a.step % 2 ? -1.5 : 1.5), col, a.last ? 26 : 20, 0.22);
        if (void_) window.fx.addSlashRibbon(this.x, this.y, 110, this.facingAngle + (a.step % 2 ? -1.2 : 1.2), this.facingAngle + (a.step % 2 ? 1.2 : -1.2), '#fecdd3', 8, 0.16);
        window.fx.triggerHitstop(a.last ? 60 : 24);
        window.fx.triggerShake(a.last ? 9 : 4, 0.14);
        window.fx.addShockwave(cx, cy, a.last ? 110 : 72, col, 3.5, 0.26);
      }
      audio.playImpactBoom(a.last ? 0.95 : 0.65);
      const co = void_ ? [0, 0.7, 0.75, 0.8, 1.7] : [0, 0.8, 0.88, 1.7];
      const dmg = this.strike(boss, cx, cy, a.last ? 140 : 118, co[a.step], void_ ? `Claw Rend ${a.step}` : `Reaping Combo ${a.step}`, a.last ? 24 : 9,
        { isStrongMove: a.last, impulseStrength: a.last ? 1.2 : 0.7 });
      if (dmg > 0) {
        this.gainShield(dmg * (void_ ? 0.4 : 0.3));
        this.gainBlood(a.last ? 4 : 2.5);
        this.fxBlood(boss.x, boss.y - 40, 5);
      }
    }
    if (p >= 1) { this.bodySpinAngle = 0; this.jumpZ = 0; this.endAct(); }
  }

  // =========================================================================
  // Q — REAPING ARC  /  (shield) SPIN STOMP  /  (Voidform) MAW LUNGE
  // =========================================================================
  castQ(ax, ay, boss) {
    this.cds.q = this.maxCds.q;
    this.aimAt(boss, ax, ay, 240);
    const sp = this.spend(0.25, 0.35, 6);
    if (this.form === 'void') return this.castVQ(boss, sp);
    if (sp.emp) {
      // hop to (just above) the boss, or forward if it is far, then stomp
      const hasBoss = !!(boss && boss.hp > 0 && Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT) < 340);
      const tx = hasBoss ? boss.x - Math.cos(this.facingAngle) * 72 : this.x + Math.cos(this.facingAngle) * 150;
      const ty = hasBoss ? boss.y - Math.sin(this.facingAngle) * 72 * PERSPECTIVE_TILT : this.y + Math.sin(this.facingAngle) * 150 * PERSPECTIVE_TILT;
      this.beginAct('qs', 1.05, { phase: 'hop', phaseT: 0, sx: this.x, sy: this.y, tx, ty, mult: sp.mult, slam: false });
      audio.playSwordSlash(true, 1.0);
      return true;
    }
    this.beginAct('q', 0.62, { hit: false, mult: sp.mult });
    const dir = { x: Math.cos(this.facingAngle), y: Math.sin(this.facingAngle) * PERSPECTIVE_TILT };
    this.attackStepVx = dir.x * 260; this.attackStepVy = dir.y * 260;
    audio.playSwordSlash(true, 1.1);
    this.lungeFootForward(this.rightFoot, 18, this.hipWidth + 2, 0.16);
    return true;
  }

  act_q(dt, boss, a) {
    const p = rClamp01(a.t / a.dur);
    this.bodySpinAngle = -0.5 + 1.0 * rEaseOut(rClamp01((p - 0.2) / 0.4));
    if (!a.hit && p >= 0.42) {
      a.hit = true;
      const cx = this.x + Math.cos(this.facingAngle) * 76, cy = this.y + Math.sin(this.facingAngle) * 76 * PERSPECTIVE_TILT;
      const col = this.col();
      if (window.fx) {
        window.fx.addSlashRibbon(this.x, this.y, 150, this.facingAngle - 1.6, this.facingAngle + 1.6, col, 30, 0.28);
        window.fx.addSlashRibbon(this.x, this.y, 118, this.facingAngle - 1.4, this.facingAngle + 1.4, '#fecdd3', 8, 0.2);
        window.fx.triggerHitstop(40); window.fx.triggerShake(7, 0.18);
        window.fx.addShockwave(cx, cy, 90, col, 4, 0.3);
      }
      audio.playImpactBoom(0.85);
      this.strike(boss, cx, cy, 142, 1.9 * a.mult, 'Reaping Arc [Q]', 15, { isStrongMove: false, impulseStrength: 0.95, head: true });
    }
    if (p >= 1) { this.bodySpinAngle = 0; this.endAct(); }
  }

  // Spin Stomp: a hop with the scythe whirling overhead, then a slam
  act_qs(dt, boss, a) {
    a.phaseT += dt;
    const col = this.col();
    if (a.phase === 'hop') {
      const s = rClamp01(a.phaseT / 0.34);
      this.x = rLerp(a.sx, a.tx, rEaseOut(s)); this.y = rLerp(a.sy, a.ty, rEaseOut(s));
      this.targetX = this.x; this.targetY = this.y;
      this.jumpZ = Math.sin(s * Math.PI) * 44 + 8 * s;
      this.bodySpinAngle = s * Math.PI * 3.5;
      if (window.fx && Math.random() < dt * 60) window.fx.addAfterimage(this.x, this.y - this.jumpZ * 0.4, this.facingAngle, col);
      if (a.phaseT >= 0.34) { a.phase = 'slam'; a.phaseT = 0; }
    } else if (a.phase === 'slam') {
      this.bodySpinAngle = 0;
      const s = rClamp01(a.phaseT / 0.12);
      this.jumpZ = 52 * (1 - rEaseIn(s));
      if (!a.slam && a.phaseT >= 0.12) {
        a.slam = true; this.jumpZ = 0; this.snapFeetToBody();
        audio.playImpactBoom(1.35); audio.playSwordPlant();
        if (window.fx) {
          window.fx.triggerHitstop(80); window.fx.triggerShake(15, 0.32);
          window.fx.addShockwave(this.x, this.y, 240, col, 8, 0.45); window.fx.addShockwave(this.x, this.y, 140, '#fecdd3', 4, 0.3);
          window.fx.addPillar(this.x, this.y, 46, col, 0.55); window.fx.spawnMassiveEarthChunks(this.x, this.y, 7, '#7f1d1d'); window.fx.addStepDust(this.x, this.y, 8);
          for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2; window.fx.addFissureLine(this.x, this.y, this.x + Math.cos(an) * 160, this.y + Math.sin(an) * 160 * PERSPECTIVE_TILT, col, 4); }
        }
        this.strike(boss, this.x + Math.cos(this.facingAngle) * 60, this.y + Math.sin(this.facingAngle) * 60 * PERSPECTIVE_TILT, 190, 3.48 * a.mult, 'Spin Stomp [Q]', 42, { isStrongMove: true, impulseStrength: 1.5, head: true });
      }
      if (a.phaseT >= 0.45) this.endAct();
    }
  }

  // Voidform Q — MAW LUNGE: blink into the boss, four rapid rends and a heavy finisher
  castVQ(boss, sp) {
    const hasBoss = !!(boss && boss.hp > 0 && Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT) < 540);
    if (hasBoss) this.facingAngle = Math.atan2((boss.y - this.y) / PERSPECTIVE_TILT, boss.x - this.x);
    const ex = hasBoss ? boss.x - Math.cos(this.facingAngle) * 80 : this.x + Math.cos(this.facingAngle) * 250;
    const ey = hasBoss ? boss.y - Math.sin(this.facingAngle) * 80 * PERSPECTIVE_TILT : this.y + Math.sin(this.facingAngle) * 250 * PERSPECTIVE_TILT;
    this.beginAct('vq', 1.2, { phase: 'dash', phaseT: 0, sx: this.x, sy: this.y, ex, ey, hits: 0, nextHit: 0, mult: sp.mult });
    this.hIframes = 0.3;
    audio.playSwordSlash(false, 1.6);
    return true;
  }

  act_vq(dt, boss, a) {
    a.phaseT += dt;
    const col = '#ff1a3c';
    if (a.phase === 'dash') {
      const s = rEaseOut(a.phaseT / 0.18);
      this.x = rLerp(a.sx, a.ex, s); this.y = rLerp(a.sy, a.ey, s);
      this.targetX = this.x; this.targetY = this.y;
      this.hIframes = Math.max(this.hIframes, 0.1);
      if (window.fx && Math.random() < dt * 90) window.fx.addAfterimage(this.x, this.y, this.facingAngle, col);
      if (a.phaseT >= 0.18) { a.phase = 'rend'; a.phaseT = 0; a.nextHit = 0.02; this.snapFeetToBody(); audio.playImpactBoom(0.9); if (window.fx) window.fx.addShockwave(this.x, this.y, 120, col, 5, 0.3); }
    } else if (a.phase === 'rend') {
      if (a.hits < 5 && a.phaseT >= a.nextHit) {
        a.hits++; a.nextHit += 0.1;
        const fin = a.hits === 5, an = this.facingAngle + (a.hits % 2 ? 1 : -1) * 0.5;
        audio.playSwordSlash(fin, 1.0 + a.hits * 0.05);
        if (window.fx) {
          window.fx.triggerHitstop(fin ? 70 : 20); window.fx.triggerShake(fin ? 12 : 5, 0.14);
          if (boss) window.fx.addDimensionalSlash(boss.x - Math.cos(an) * 90, boss.y - 30 - Math.sin(an) * 50, boss.x + Math.cos(an) * 90, boss.y - 30 + Math.sin(an) * 50, fin ? '#ffffff' : '#ff4d6d', 0.3);
          if (fin) window.fx.addShockwave(boss ? boss.x : this.x, boss ? boss.y : this.y, 200, col, 8, 0.4);
        }
        this.strike(boss, this.x + Math.cos(this.facingAngle) * 70, this.y + Math.sin(this.facingAngle) * 70 * PERSPECTIVE_TILT, 175, (fin ? 1.9 : 0.8) * a.mult, fin ? 'Maw Lunge Finisher' : `Maw Lunge ${a.hits}`, fin ? 34 : 8, { isStrongMove: fin, impulseStrength: fin ? 1.4 : 0.5 });
      }
      if (a.phaseT >= 0.8) this.endAct();
    }
  }

  // =========================================================================
  // W — GRAVEBOUND HOOK (aimed skillshot; hit = haul in + slam + RESET Q)  /  (Voidform) HELLSPIKE ROW
  // =========================================================================
  // Moves a hook along the aim line. Returns 'hit', 'miss' or null.
  stepHook(a, dt, boss, speed, maxDist, r) {
    const h = a.hook;
    h.dist += speed * dt;
    h.x = a.sx + Math.cos(a.ang) * h.dist; h.y = a.sy + Math.sin(a.ang) * h.dist * PERSPECTIVE_TILT;
    if (boss && boss.hp > 0 && Math.hypot(boss.x - h.x, (boss.y - h.y) / PERSPECTIVE_TILT) < r + 60) return 'hit';
    if (h.dist >= maxDist) return 'miss';
    return null;
  }

  castW(ax, ay, boss) {
    this.cds.w = this.maxCds.w;
    this.aimAt(null, ax, ay, 1);                       // aimed: never auto-targets
    const sp = this.spend(0.40, 0.55, 9);
    if (this.form === 'void') return this.castVW(sp);
    const a = this.beginAct('w', 2.0, { phase: 'throw', phaseT: 0, boss: null, mult: sp.mult, emp: sp.emp, sx: this.x, sy: this.y, ang: this.facingAngle, slam: false, hook: { x: this.x, y: this.y, dist: 0 } });
    a.tipX = this.x; a.tipY = this.y;
    audio.playSwordSlash(false, 1.3);
    this.lungeFootForward(this.leftFoot, 14, -this.hipWidth - 2, 0.12);
    return true;
  }

  act_w(dt, boss, a) {
    a.phaseT += dt;
    const col = this.col();
    if (a.phase === 'throw') {
      const r = this.stepHook(a, dt, boss, 1700, 600, 26);
      a.tipX = a.hook.x; a.tipY = a.hook.y;
      if (r === 'hit') {
        a.phase = 'pull'; a.phaseT = 0; a.boss = boss; a.px = this.x; a.py = this.y;
        this.cds.q = 0;                                  // hooking the boss resets Q
        audio.playParryClang(true);
        if (this.isLocal) this.say('Q ready', '#fda4af', 11);
        if (window.fx) { window.fx.addShockwave(boss.x, boss.y, 90, col, 4, 0.3); window.fx.addImpactStarburst(boss.x, boss.y - 40, col, 1.2, 0.24, 34); window.fx.triggerHitstop(40); }
      } else if (r === 'miss') { a.phase = 'retract'; a.phaseT = 0; this.cds.w = this.maxCds.w * 0.5; }
    } else if (a.phase === 'pull') {
      const bs = a.boss;
      if (!bs || bs.hp <= 0) { a.phase = 'retract'; a.phaseT = 0; return; }
      this.hIframes = Math.max(this.hIframes, 0.15);
      const s = rEaseIn(a.phaseT / 0.3);
      const ang = Math.atan2((bs.y - a.py) / PERSPECTIVE_TILT, bs.x - a.px);
      this.x = rLerp(a.px, bs.x - Math.cos(ang) * 92, s); this.y = rLerp(a.py, bs.y - Math.sin(ang) * 92 * PERSPECTIVE_TILT, s);
      this.facingAngle = ang;
      this.targetX = this.x; this.targetY = this.y;
      a.tipX = bs.x; a.tipY = bs.y;
      this.jumpZ = Math.sin(s * Math.PI) * 10;
      if (window.fx && Math.random() < dt * 40) window.fx.addAfterimage(this.x, this.y, this.facingAngle, col);
      if (a.phaseT >= 0.3) { a.phase = 'slam'; a.phaseT = 0; this.jumpZ = 0; this.snapFeetToBody(); }
    } else if (a.phase === 'slam') {
      this.hIframes = Math.max(this.hIframes, 0.1);
      if (!a.slam && a.phaseT >= 0.12) {
        a.slam = true;
        const bs = a.boss;
        const cx = this.x + Math.cos(this.facingAngle) * 70, cy = this.y + Math.sin(this.facingAngle) * 70 * PERSPECTIVE_TILT;
        audio.playImpactBoom(a.emp ? 1.6 : 1.3); audio.playSwordPlant();
        if (window.fx) {
          window.fx.triggerHitstop(a.emp ? 95 : 75); window.fx.triggerShake(a.emp ? 19 : 15, 0.3);
          window.fx.addShockwave(cx, cy, a.emp ? 200 : 150, col, 6, 0.4); window.fx.addPillar(cx, cy, a.emp ? 50 : 36, col, 0.5);
          window.fx.spawnMassiveEarthChunks(cx, cy, a.emp ? 8 : 5, '#7f1d1d'); window.fx.addStepDust(cx, cy, 7);
        }
        this.strike(bs, cx, cy, 150, (a.emp ? 3.1 : 2.6) * a.mult, 'Gravebound Hook [W]', a.emp ? 44 : 34, { isStrongMove: true, impulseStrength: 1.4, head: true });
      }
      if (a.phaseT >= 0.5) { a.phase = 'retract'; a.phaseT = 0; }
    } else {
      a.tipX = rLerp(a.tipX, this.x, rClamp01(a.phaseT / 0.2));
      a.tipY = rLerp(a.tipY, this.y, rClamp01(a.phaseT / 0.2));
      if (a.phaseT >= 0.2) this.endAct();
    }
  }

  // Voidform W — HELLSPIKE ROW: a line of bone spikes erupts along the cursor
  castVW(sp) {
    // Drop-and-forget like the Rift Maw: the row erupts from its own timer (see spikeRowTick), so you are free to move at once.
    const ang = this.facingAngle, sx = this.x, sy = this.y, N = 9, GAP = 66;
    this.addVfx({ kind: 'spikerow', x: sx, y: sy, sx, sy, ang, mult: sp.mult, n: 0, hitsLeft: 3, dur: 0.28 + N * 0.06 + 0.1 });
    audio.playSwordSlash(true, 0.9); audio.playImpactBoom(0.8);
    if (window.fx) {
      const ex = sx + Math.cos(ang) * (70 + (N - 1) * GAP), ey = sy + Math.sin(ang) * (70 + (N - 1) * GAP) * PERSPECTIVE_TILT;
      window.fx.addFissureLine(sx, sy, ex, ey, '#ff1a3c', 6); window.fx.addFissureLine(sx, sy, ex, ey, '#7f1d1d', 3);
      window.fx.addDragSparks(sx, sy - 20, ang, 8, true, '#ff4d6d');
    }
    return true;
  }

  // The Hellspike Row: nine bone spikes erupting one after another along the aim line, growing toward the end (the last is a great fang).
  spikeRowTick(e, dt, boss) {
    const N = 9, GAP = 66, T0 = 0.28, STEP = 0.06;
    while (e.n < N && e.t >= T0 + e.n * STEP) {
      const i = e.n++, last = i === N - 1;
      const d = 70 + i * GAP;
      const x = e.sx + Math.cos(e.ang) * d, y = e.sy + Math.sin(e.ang) * d * PERSPECTIVE_TILT;
      this.addVfx({ kind: 'spike', x, y, dur: 1.0, h: 62 + i * 9 + (last ? 40 : 0), w: 16 + i * 1.4 + (last ? 8 : 0), lean: (i % 2 ? 1 : -1) * 0.12, last });
      if (window.fx) {
        window.fx.addShockwave(x, y, 60 + i * 5, '#ff1a3c', 3, 0.3); window.fx.addStepDust(x, y, 3);
        window.fx.addDragSparks(x, y - 10, -Math.PI / 2 + (Math.random() - 0.5) * 0.8, 4, true, i % 2 ? '#ff4d6d' : '#fecaca');
        if (i % 3 === 0 || last) window.fx.triggerShake(last ? 12 : 5, 0.12);
        if (last) { window.fx.addShockwave(x, y, 150, '#ffffff', 5, 0.35); window.fx.addPillar(x, y, 40, '#ff1a3c', 0.5); }
      }
      if (i % 2 === 0 || last) audio.playImpactBoom(0.55 + i * 0.05);
      if (e.hitsLeft > 0 && this.strike(boss, x, y, 88, 1.15 * e.mult, 'Hellspike Row', 12 + i, { isStrongMove: i >= 6, impulseStrength: 0.7, hitX: x, hitY: y })) e.hitsLeft--;
    }
  }

  act_vw(dt, boss, a) {
    this.facingAngle = a.ang;
    const N = 9, GAP = 66, T0 = 0.28, STEP = 0.06;
    while (a.n < N && a.t >= T0 + a.n * STEP) {
      const i = a.n++;
      const d = 70 + i * GAP;
      const x = a.sx + Math.cos(a.ang) * d, y = a.sy + Math.sin(a.ang) * d * PERSPECTIVE_TILT;
      this.addVfx({ kind: 'spike', x, y, dur: 0.9, h: 70 + i * 5, w: 18 + i });
      if (window.fx) { window.fx.addShockwave(x, y, 60 + i * 4, '#7f1d1d', 3, 0.3); window.fx.addStepDust(x, y, 2); if (i % 3 === 0) window.fx.triggerShake(6, 0.1); }
      if (i % 2 === 0) audio.playImpactBoom(0.6 + i * 0.05);
      if (a.hitsLeft > 0 && this.strike(boss, x, y, 88, 1.15 * a.mult, 'Hellspike Row', 12 + i, { isStrongMove: i >= 6, impulseStrength: 0.7, hitX: x, hitY: y })) a.hitsLeft--;
    }
    if (a.t >= T0 + N * STEP + 0.4) this.endAct();
  }

  // =========================================================================
  // E — LETHAL SPIN (bladestorm on the spot; with shield: longer, harder, RESETS Q on hit)  /  (Voidform) RIFT MAW
  // =========================================================================
  castE(ax, ay, boss) {
    this.cds.e = this.maxCds.e;
    this.aimAt(boss, ax, ay, 220);
    const sp = this.spend(0.40, 0.55, 9);
    if (this.form === 'void') return this.castVE(ax, ay, boss, sp);
    const dur = sp.emp ? 1.5 : 0.95;
    this.beginAct('e', dur + 0.55, { spinDur: dur, emp: sp.emp, mult: sp.mult, tick: 0, ticks: 0, hitAny: false, finished: false, reset: false });
    audio.playSwordSlash(true, 0.9);
    this.saveCamera();
    return true;
  }

  act_e(dt, boss, a) {
    const col = this.col();
    const spinning = a.t < a.spinDur;
    if (spinning) {
      this.bodySpinAngle = a.t * 30;                      // rapid
      this.hIframes = 0;
      a.tick -= dt;
      const cam = this.isLocal && window.game ? window.game.camera : null;
      if (cam && this._chargeSavedZoom) cam.targetZoom = Math.min(1.2, this._chargeSavedZoom + Math.min(0.1, a.t * 0.1));
      // (kept light: a handful of ribbons and one sound every few ticks; the dust cloud does most of the "storm" look)
      if (window.fx) {
        if (Math.random() < dt * 16) { const an = Math.random() * Math.PI * 2; window.fx.addSlashRibbon(this.x, this.y - 20, 120 + Math.random() * 60, an, an + 1.8, Math.random() < 0.3 ? '#ffffff' : col, 14, 0.16); }
        if (Math.random() < dt * 6) window.fx.addAfterimage(this.x + (Math.random() - 0.5) * 40, this.y + (Math.random() - 0.5) * 20, Math.random() * 6.28, col);
        if (Math.random() < dt * 6 && this.isLocal) window.fx.triggerShake(4, 0.1);
      }
      if (a.tick <= 0) {
        a.tick = 0.15; a.ticks++;                       // fewer, heavier ticks: same damage per second as before
        if (a.ticks % 3 === 1) audio.playSwordSlash(a.ticks % 2 === 0, 1.1 + (a.ticks % 5) * 0.06);
        const dmg = this.strike(boss, this.x, this.y, a.emp ? 220 : 190, (a.emp ? 0.9 : 0.72) * a.mult, 'Lethal Spin [E]', 5, { impulseStrength: 0.25, hitX: this.x, hitY: this.y });
        if (dmg > 0) {
          a.hitAny = true;
          this.gainShield(dmg * 0.04);
          if (a.emp && !a.reset) { a.reset = true; this.cds.q = 0; if (this.isLocal) this.say('Q ready', '#fda4af', 11); }
        }
      }
    } else if (!a.finished) {
      a.finished = true; this.bodySpinAngle = 0;
      audio.playImpactBoom(a.emp ? 1.5 : 1.0); audio.playSwordSlash(true, 1.6);
      if (window.fx) {
        window.fx.triggerHitstop(a.emp ? 80 : 50); window.fx.triggerShake(a.emp ? 14 : 8, 0.25);
        window.fx.addShockwave(this.x, this.y, a.emp ? 260 : 180, col, 8, 0.4); window.fx.addShockwave(this.x, this.y, 140, '#ffffff', 4, 0.28);
        window.fx.addSlashRibbon(this.x, this.y - 20, 200, -0.8, 0.8, '#ffffff', 22, 0.24); window.fx.addSlashRibbon(this.x, this.y - 20, 200, Math.PI - 0.8, Math.PI + 0.8, '#ffffff', 22, 0.24);
        if (this.isLocal && a.emp) window.fx.triggerImpactFrame(col, 0.12);
      }
      this.strike(boss, this.x, this.y, a.emp ? 240 : 205, (a.emp ? 2.0 : 1.5) * a.mult, 'Lethal Spin Finish [E]', a.emp ? 34 : 18, { isStrongMove: true, impulseStrength: 1.2, hitX: this.x, hitY: this.y });
    }
    if (a.t >= a.dur) { this.bodySpinAngle = 0; this.restoreChargeCamera(); this.endAct(); }
  }

  // Voidform E — RIFT MAW: a hell-mouth opens at the cursor, gapes, then snaps shut
  castVE(ax, ay, boss, sp) {
    let tx = ax, ty = ay;
    const d = Math.hypot(tx - this.x, (ty - this.y) / PERSPECTIVE_TILT);
    if (d > 560) { tx = this.x + (tx - this.x) * 560 / d; ty = this.y + (ty - this.y) * 560 / d; }
    this.aimAt(null, tx, ty, 1);
    // Drop-and-forget: the maw is planted on the floor and snaps shut on its own (see updateVfx); the caster is free at once.
    this.addVfx({ kind: 'maw', x: tx, y: ty, dur: 1.35, open: 0.8, mult: sp.mult, snapped: false });
    audio.playImpactBoom(1.0);
    audio.playSwordSlash(true, 0.8);
    if (window.fx) window.fx.addShockwave(tx, ty, 90, '#ff1a3c', 4, 0.3);
    return true;
  }

  // The Rift Maw's gape and snap, run from its own timer so no cast animation holds the Reaper in place.
  mawTick(e, dt, boss) {
    if (e.snapped) return;
    if (window.fx && e.t < e.open && Math.random() < dt * 40) window.fx.addDragSparks(e.x + (Math.random() - 0.5) * 200, e.y + (Math.random() - 0.5) * 100, -Math.PI / 2, 1, true, '#ff1a3c');
    if (e.t < e.open) return;
    e.snapped = true;
    audio.playImpactBoom(2.0); audio.playSwordPlant();
    if (window.fx) {
      window.fx.triggerHitstop(110); window.fx.triggerShake(20, 0.45); window.fx.triggerZoomPunch(0.08);
      if (this.isLocal) window.fx.triggerImpactFrame('#ff1a3c', 0.14);
      window.fx.addShockwave(e.x, e.y, 280, '#ff1a3c', 9, 0.5); window.fx.addPillar(e.x, e.y, 70, '#ff1a3c', 0.7); window.fx.spawnMassiveEarthChunks(e.x, e.y, 9, '#7f1d1d');
    }
    this.strike(boss, e.x, e.y, 205, 3.0 * e.mult, 'Rift Maw', 46, { isStrongMove: true, impulseStrength: 1.6, hitX: e.x, hitY: e.y, head: true });
  }

  // =========================================================================
  // R — ECLIPSE HARVEST (ALL shield; with shield RESETS Q)  /  (Voidform) ABYSS CATACLYSM
  // =========================================================================
  castR(ax, ay, boss) {
    this.cds.r = this.maxCds.r;
    this.aimAt(boss, ax, ay, 300);
    const sp = this.spend(1.0, 1.10, 16);
    if (this.form === 'void') return this.castVR(boss, sp);
    if (sp.emp) this.cds.q = 0;                                   // consuming shield resets Q
    this.beginAct('r', 2.6, { phase: 'rise', phaseT: 0, ticks: 0, nextTick: 0, nTicks: sp.emp ? 6 : 4, mult: sp.mult, emp: sp.emp, spin: 0 });
    this.hIframes = 0.4;
    audio.playSwordSlash(true, 1.2);
    this.saveCamera();
    return true;
  }

  act_r(dt, boss, a) {
    a.phaseT += dt;
    const col = this.col();
    if (a.phase === 'rise') {
      const s = rEaseOut(a.phaseT / 0.5);
      this.jumpZ = s * 118;
      this.hIframes = Math.max(this.hIframes, 0.1);
      this.bodySpinAngle = s * Math.PI * 2;
      const cam = this.isLocal && window.game ? window.game.camera : null;
      if (cam && this._chargeSavedZoom) cam.targetZoom = Math.min(1.22, this._chargeSavedZoom + s * 0.14);
      if (window.fx) {
        if (Math.random() < dt * 50) window.fx.addDragSparks(this.x + (Math.random() - 0.5) * 120, this.y + 10, -Math.PI / 2, 1, true, col);   // blood rising off the floor
        if (a.phaseT < dt * 1.5) { window.fx.addShockwave(this.x, this.y, 180, col, 6, 0.5); window.fx.addPillar(this.x, this.y, 50, col, 0.6); }
      }
      if (a.phaseT >= 0.5) { a.phase = 'spin'; a.phaseT = 0; a.nextTick = 0.06; audio.playImpactBoom(0.9); }
    } else if (a.phase === 'spin') {
      const dur = a.emp ? 1.35 : 1.1;
      this.jumpZ = 118 + Math.sin(a.phaseT * 12) * 3;
      a.spin = (a.phaseT / dur) * Math.PI * (a.emp ? 12 : 8);
      this.bodySpinAngle = a.spin;
      this.hIframes = Math.max(this.hIframes, 0.1);
      if (boss && boss.hp > 0) {      // drift over the boss while whirling
        const d = Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT);
        if (d > 90) { const ang = Math.atan2((boss.y - this.y) / PERSPECTIVE_TILT, boss.x - this.x); this.x += Math.cos(ang) * 190 * dt; this.y += Math.sin(ang) * 190 * dt * PERSPECTIVE_TILT; }
      }
      if (window.fx) {      // a vortex of blood and slash light spiralling around the whirl
        if (Math.random() < dt * 70) { const an = Math.random() * Math.PI * 2, r = 60 + Math.random() * 120; window.fx.addDragSparks(this.x + Math.cos(an) * r, this.y - this.jumpZ * 0.5 + Math.sin(an) * r * 0.5, an + Math.PI / 2, 1, true, Math.random() < 0.3 ? '#ffffff' : col); }
        if (Math.random() < dt * 30) window.fx.addSlashRibbon(this.x, this.y - this.jumpZ * 0.6, 150, a.spin, a.spin + 2.2, col, 18, 0.18);
        if (Math.random() < dt * 8) window.fx.addShockwave(this.x, this.y, 100 + Math.random() * 120, '#7f1d1d', 3, 0.35);   // ground ripples below
      }
      if (a.ticks < a.nTicks && a.phaseT >= a.nextTick) {
        a.ticks++; a.nextTick += dur / a.nTicks;
        audio.playSwordSlash(a.ticks % 2 === 0, 1.0 + a.ticks * 0.05);
        if (window.fx) { window.fx.triggerShake(6, 0.14); window.fx.addShockwave(this.x, this.y, 160 + a.ticks * 8, col, 3.5, 0.3); }
        this.strike(boss, this.x, this.y, 175, 0.95 * a.mult, `Eclipse Harvest ${a.ticks} [R]`, 7, { impulseStrength: 0.5, hitX: this.x, hitY: this.y });
      }
      if (a.phaseT >= dur) { a.phase = 'fall'; a.phaseT = 0; }
    } else if (a.phase === 'fall') {
      const s = rEaseIn(a.phaseT / 0.16);
      this.jumpZ = 118 * (1 - s);
      this.bodySpinAngle = 0;
      this.hIframes = Math.max(this.hIframes, 0.1);     // untouchable the whole way up, the spin and the fall
      if (a.phaseT >= 0.16) {
        this.jumpZ = 0; this.snapFeetToBody(); this.hIframes = Math.max(this.hIframes, 0.2);
        a.phase = 'slam'; a.phaseT = 0;
        audio.playImpactBoom(1.9); audio.playSwordPlant();
        if (window.fx) {
          window.fx.triggerHitstop(130); window.fx.triggerShake(28, 0.55); window.fx.triggerZoomPunch(0.1);
          if (this.isLocal) window.fx.triggerImpactFrame(col, 0.16);
          window.fx.addShockwave(this.x, this.y, 320, col, 10, 0.6); window.fx.addShockwave(this.x, this.y, 200, '#fecdd3', 6, 0.45); window.fx.addShockwave(this.x, this.y, 100, '#ffffff', 4, 0.3);
          window.fx.addPillar(this.x, this.y, 70, col, 0.9); window.fx.spawnMassiveEarthChunks(this.x, this.y, 12, '#7f1d1d');
          for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; window.fx.addFissureLine(this.x, this.y, this.x + Math.cos(an) * 230, this.y + Math.sin(an) * 230 * PERSPECTIVE_TILT, col, 6); }
        }
        this.strike(boss, this.x, this.y, 195, 3.6 * a.mult, 'Harvest Slam [R]', 62, { isStrongMove: true, impulseStrength: 1.9, hitX: this.x, hitY: this.y, head: true });
      }
    } else {
      this.restoreChargeCamera();
      if (a.phaseT >= 0.45) this.endAct();
    }
  }

  // Voidform R — ABYSS CATACLYSM: impaling spears rain on the boss, then a detonation
  castVR(boss, sp) {
    this.beginAct('vr', 2.7, { phase: 'call', n: 0, mult: sp.mult, boss });
    this.hIframes = 0.4;
    audio.playImpactBoom(1.3);
    this.saveCamera();
    return true;
  }

  act_vr(dt, boss, a) {
    const bs = a.boss && a.boss.hp > 0 ? a.boss : boss;
    const col = '#ff1a3c';
    if (bs) this.facingAngle = Math.atan2((bs.y - this.y) / PERSPECTIVE_TILT, bs.x - this.x);
    this.jumpZ = a.t < 0.5 ? rEaseOut(a.t / 0.5) * 26 : 26 + Math.sin(a.t * 5) * 2;
    const cam = this.isLocal && window.game ? window.game.camera : null;
    if (cam && this._chargeSavedZoom) cam.targetZoom = Math.min(1.2, this._chargeSavedZoom + Math.min(0.14, a.t * 0.1));
    if (window.fx && a.t < 0.5 && Math.random() < dt * 60) window.fx.addDragSparks(this.x + (Math.random() - 0.5) * 100, this.y, -Math.PI / 2, 1, true, col);
    const N = 9, T0 = 0.55, STEP = 0.15;
    if (bs) {
      while (a.n < N && a.t >= T0 + a.n * STEP) {
        const i = a.n++;
        const an = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 40 + Math.random() * 110;
        const x = bs.x + Math.cos(an) * r, y = bs.y + Math.sin(an) * r * PERSPECTIVE_TILT;
        this.addVfx({ kind: 'spear', x, y, dur: 0.55, fall: 0.22 });
        // the spear lands 0.22s after it is called
        a.landings = a.landings || [];
        a.landings.push({ at: a.t + 0.22, x, y });
      }
    }
    if (a.landings) {
      for (let i = a.landings.length - 1; i >= 0; i--) {
        const L = a.landings[i];
        if (a.t >= L.at) {
          a.landings.splice(i, 1);
          audio.playImpactBoom(0.8);
          if (window.fx) { window.fx.triggerShake(6, 0.12); window.fx.addShockwave(L.x, L.y, 90, col, 4, 0.3); window.fx.addStepDust(L.x, L.y, 3); window.fx.spawnMassiveEarthChunks(L.x, L.y, 2, '#7f1d1d'); }
          this.strike(bs, L.x, L.y, 120, 0.6 * a.mult, 'Abyss Cataclysm Spear', 6, { impulseStrength: 0.4, hitX: L.x, hitY: L.y });
        }
      }
    }
    const tFinal = T0 + N * STEP + 0.3;
    if (!a.finale && a.t >= tFinal) {
      a.finale = true;
      audio.playImpactBoom(2.4); audio.playSwordPlant();
      const fx0 = bs ? bs.x : this.x, fy0 = bs ? bs.y : this.y;
      if (window.fx) {
        window.fx.triggerHitstop(150); window.fx.triggerShake(30, 0.7); window.fx.triggerZoomPunch(0.13);
        if (this.isLocal) { window.fx.triggerImpactFrame('#ffffff', 0.16); window.fx.triggerScreenFlash('#7f1d1d', 0.3); }
        window.fx.addShockwave(fx0, fy0, 360, col, 11, 0.65); window.fx.addShockwave(fx0, fy0, 220, '#ffffff', 6, 0.45);
        window.fx.addPillar(fx0, fy0, 110, col, 1.0); window.fx.spawnMassiveEarthChunks(fx0, fy0, 14, '#7f1d1d');
        for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2; window.fx.addFissureLine(fx0, fy0, fx0 + Math.cos(an) * 250, fy0 + Math.sin(an) * 250 * PERSPECTIVE_TILT, col, 6); }
      }
      this.strike(bs, fx0, fy0, 230, 3.4 * a.mult, 'Abyss Cataclysm Detonation', 90, { isStrongMove: true, impulseStrength: 2.2, hitX: fx0, hitY: fy0, head: true });   // FRONT skill
    }
    if (a.t >= a.dur) { this.jumpZ = 0; this.restoreChargeCamera(); this.endAct(); }
  }

  // =========================================================================
  // A — SHADE STEP  /  (Voidform) WRAITH BLINK
  // =========================================================================
  castA(ax, ay, boss) {
    this.cds.a = this.maxCds.a;
    this.aimAt(null, ax, ay, 1);
    if (this.form === 'void') {
      // teleport to the cursor (up to 380), blood burst at both ends
      const ox = this.x, oy = this.y;
      const d = Math.hypot(ax - this.x, (ay - this.y) / PERSPECTIVE_TILT), m = Math.min(380, d);
      const nx = this.x + Math.cos(this.facingAngle) * m, ny = this.y + Math.sin(this.facingAngle) * m * PERSPECTIVE_TILT;
      this.beginAct('a', 0.4, { blink: true, ox, oy });
      this.hIframes = 0.5;
      this.x = nx; this.y = ny; this.targetX = nx; this.targetY = ny; this.snapFeetToBody();
      this.addVfx({ kind: 'burst', x: ox, y: oy, dur: 0.6, r: 90 });
      this.addVfx({ kind: 'burst', x: nx, y: ny, dur: 0.6, r: 120 });
      audio.playSwordSlash(false, 1.8); audio.playImpactBoom(0.8);
      if (window.fx) { window.fx.addShockwave(ox, oy, 120, '#ff1a3c', 6, 0.4); window.fx.addShockwave(nx, ny, 150, '#ff1a3c', 7, 0.4); window.fx.addPillar(ox, oy, 30, '#7f1d1d', 0.5); }
      this.strike(boss, nx, ny, 150, 1.3, 'Wraith Blink [A]', 10, { impulseStrength: 0.6, hitX: nx, hitY: ny });
      return true;
    }
    this.beginAct('a', 0.34, { sx: this.x, sy: this.y, ang: this.facingAngle });
    this.hIframes = 0.42;
    this.shades.push({ x: this.x, y: this.y, ang: this.facingAngle, t: 0, dur: 1.2, burst: false, done: false });
    audio.playSwordSlash(false, 1.5);
    if (window.fx) window.fx.addShockwave(this.x, this.y, 70, '#7f1d1d', 3, 0.3);
    return true;
  }

  act_a(dt, boss, a) {
    if (a.blink) { this.bodySpinAngle = 0; if (a.t >= a.dur) this.endAct(); return; }
    const s = rEaseOut(a.t / 0.22);
    const dist = 250;
    if (a.t < 0.22) {
      this.x = a.sx + Math.cos(a.ang) * dist * s;
      this.y = a.sy + Math.sin(a.ang) * dist * s * PERSPECTIVE_TILT;
      this.targetX = this.x; this.targetY = this.y;
      if (window.fx && Math.random() < dt * 60) window.fx.addAfterimage(this.x, this.y, this.facingAngle, '#7f1d1d');
    }
    this.bodySpinAngle = 0;
    if (a.t >= a.dur) { this.snapFeetToBody(); this.endAct(); }
  }

  updateShades(dt, boss) {
    for (let i = this.shades.length - 1; i >= 0; i--) {
      const s = this.shades[i];
      s.t += dt;
      if (s.t >= s.dur) this.shades.splice(i, 1);
    }
  }

  // =========================================================================
  // S — SIPHON CHAIN (aimed hook; heals first, then shields)  /  (Voidform) BLOOD LASH
  // =========================================================================
  castS(ax, ay, boss) {
    this.cds.s = this.maxCds.s;
    this.aimAt(null, ax, ay, 1);                       // aimed: never auto-targets
    const void_ = this.form === 'void';
    const a = this.beginAct('s', 1.6, { phase: 'throw', phaseT: 0, sx: this.x, sy: this.y, ang: this.facingAngle, hook: { x: this.x, y: this.y, dist: 0 }, maxDist: void_ ? 700 : 560 });
    a.tipX = this.x; a.tipY = this.y;
    audio.playSwordSlash(false, 1.3);
    return true;
  }

  act_s(dt, boss, a) {
    a.phaseT += dt;
    const void_ = this.form === 'void';
    if (a.phase === 'throw') {
      const r = this.stepHook(a, dt, boss, void_ ? 2300 : 1900, a.maxDist, 24);
      a.tipX = a.hook.x; a.tipY = a.hook.y;
      if (r === 'hit') {
        a.phase = 'hold'; a.phaseT = 0;
        this.tether = { t: 0, dur: void_ ? 4.0 : 6.0, range: void_ ? 640 : 480, tick: 0.5, boss, connect: 1 };   // already stretched to the boss: the line does not restart
        audio.playParryClang(true);
        if (window.fx) { window.fx.addShockwave(boss.x, boss.y, 80, this.col(), 4, 0.3); window.fx.addImpactStarburst(boss.x, boss.y - 40, this.col(), 1.1, 0.22, 28); window.fx.triggerHitstop(30); }
      } else if (r === 'miss') { a.phase = 'retract'; a.phaseT = 0; this.cds.s = this.maxCds.s * 0.4; }
    } else if (a.phase === 'hold') {
      if (a.boss !== undefined || true) { a.tipX = this.tether && this.tether.boss ? this.tether.boss.x : a.tipX; a.tipY = this.tether && this.tether.boss ? this.tether.boss.y : a.tipY; }
      if (a.phaseT >= 0.25) this.endAct();
    } else {
      a.tipX = rLerp(a.tipX, this.x, rClamp01(a.phaseT / 0.22));
      a.tipY = rLerp(a.tipY, this.y, rClamp01(a.phaseT / 0.22));
      if (a.phaseT >= 0.22) this.endAct();
    }
  }

  updateTether(dt, boss) {
    const t = this.tether;
    if (!t) return;
    const b = t.boss && t.boss.hp > 0 ? t.boss : boss;
    if (!b || b.hp <= 0 || this.hp <= 0) { this.tether = null; return; }
    t.t += dt;
    t.connect = Math.min(1, t.connect + dt * 6);
    const d = Math.hypot(b.x - this.x, (b.y - this.y) / PERSPECTIVE_TILT);
    if (d > t.range * 1.15 || t.t >= t.dur) {
      if (window.fx && d > t.range * 1.15) window.fx.addShockwave(this.x, this.y, 60, '#7f1d1d', 3, 0.25);
      this.tether = null;
      return;
    }
    if (this.isRemote) return;
    // the stolen life heals you FIRST; only what is left over becomes shield
    const amt = (this.shieldCap / t.dur) * dt * (this.form === 'void' ? 1.5 : 1);
    const heal = Math.min(Math.max(0, this.maxHp - this.hp), amt);
    this.hp += heal;
    this.gainShield(amt - heal);
    this.gainBlood((this.form === 'void' ? 0 : 4) * dt);
    t.tick -= dt;
    if (t.tick <= 0) {
      t.tick = 0.5;
      this.dealHitToBoss(b, 0.32, this.form === 'void' ? 'Blood Lash [S]' : 'Siphon Chain [S]', false, 3, false, { impulseStrength: 0.15, hitX: b.x, hitY: b.y });
    }
  }

  // =========================================================================
  // D — DREAD RIPOSTE (counter + small builder)  /  (Voidform) HELLGUARD RIPOSTE (hellfire on a counter)
  // =========================================================================
  castD(ax, ay, boss) {
    this.cds.d = this.maxCds.d;
    this.aimAt(boss, ax, ay, 300);
    const a = this.beginAct('d', 0.55, { hit: false, countered: false });
    audio.playSwordSlash(false, 1.0);
    this.lungeFootForward(this.rightFoot, -10, this.hipWidth + 4, 0.14);
    if (boss && typeof boss.isCounterable === 'function' && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 215) this.doRiposte(boss, a);
    return true;
  }

  doRiposte(boss, a) {
    if (a.countered) return;
    a.countered = true; a.hit = true;
    this.executeBreakerCounterSuccess(boss);
    this.gainShield(this.shieldCap * 0.2);
    this.gainBlood(15);
    this.say('⚡ RIPOSTE!', '#7dd3fc', 14);
    this.fxBlood(boss.x, boss.y - 40, 10);
    if (this.form === 'void') {       // hellfire
      audio.playImpactBoom(1.6);
      if (window.fx) { window.fx.addShockwave(boss.x, boss.y, 300, '#ff1a3c', 9, 0.5); window.fx.addPillar(boss.x, boss.y, 80, '#ff1a3c', 0.8); window.fx.triggerShake(16, 0.4); }
      this.strike(boss, boss.x, boss.y, 9999, 2.4, 'Hellguard Riposte [D]', 40, { isStrongMove: true, impulseStrength: 1.5, hitX: boss.x, hitY: boss.y });
    }
  }

  act_d(dt, boss, a) {
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    if (a.t > 0.1 && a.t < 0.26) { this.attackStepVx = cosA * 140; this.attackStepVy = sinA * 140 * PERSPECTIVE_TILT; }
    if (!a.hit && a.t >= 0.26) {
      a.hit = true;
      if (boss && typeof boss.isCounterable === 'function' && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 215) {
        a.hit = false; this.doRiposte(boss, a);
      } else {
        const cx = this.x + cosA * 64, cy = this.y + sinA * 64 * PERSPECTIVE_TILT;
        if (window.fx) window.fx.addSlashRibbon(this.x, this.y, 118, this.facingAngle - 0.5, this.facingAngle + 0.5, '#7dd3fc', 18, 0.2);
        const dmg = this.strike(boss, cx, cy, 120, 1.0, 'Riposte Flick [D]', 12, { impulseStrength: 0.8, head: true });
        if (dmg > 0) { this.gainShield(dmg * 0.25); this.gainBlood(2); }
      }
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // F — SOUL RIP (gather the dead, tear them out)  /  (Voidform) DEVOUR
  // =========================================================================
  castF(ax, ay, boss) {
    if (this.form === 'void') return this.castVF(ax, ay, boss);
    this.cds.f = this.maxCds.f;
    this.aimAt(boss, ax, ay, 260);
    this.beginAct('f', 1.3, { phase: 'gather', phaseT: 0, fired: false, ang: this.facingAngle, boss, souls: 0 });
    audio.playSwordSlash(true, 0.8);
    this.saveCamera();
    return true;
  }

  act_f(dt, boss, a) {
    a.phaseT += dt;
    const col = this.col();
    const bs = a.boss && a.boss.hp > 0 ? a.boss : boss;
    if (a.phase === 'gather') {
      const c = rClamp01(a.phaseT / 0.7);
      this.jumpZ = rEaseOut(c) * 14;
      // souls spiral in toward the reaper from a wide ring
      a.souls += dt * (30 + c * 50);
      while (a.souls >= 1) { a.souls -= 1; const an = Math.random() * Math.PI * 2, r = 190 + Math.random() * 70; this.addVfx({ kind: 'soul', x: this.x + Math.cos(an) * r, y: this.y + Math.sin(an) * r * 0.62, tx: this.x, ty: this.y, dur: 0.55 + Math.random() * 0.2, hue: Math.random() }); }
      if (window.fx && Math.random() < dt * (4 + c * 10) && this.isLocal) window.fx.triggerShake(2 + c * 3, 0.08);
      if (window.fx && Math.random() < dt * 8) window.fx.addShockwave(this.x, this.y, 210 - c * 120, '#7f1d1d', 2 + c * 3, 0.4);
      if (a.phaseT >= 0.7) { a.phase = 'rip'; a.phaseT = 0; }
    } else if (a.phase === 'rip') {
      if (!a.fired) {
        a.fired = true;
        audio.playImpactBoom(1.5); audio.playParryClang && audio.playParryClang(true);
        if (window.fx) {
          window.fx.triggerHitstop(80); window.fx.triggerShake(13, 0.3);
          window.fx.addShockwave(this.x, this.y, 230, col, 8, 0.45); window.fx.addShockwave(this.x, this.y, 130, '#ffffff', 4, 0.3);
          if (this.isLocal) { window.fx.triggerImpactFrame(col, 0.12); window.fx.triggerScreenFlash('#7f1d1d', 0.25); }
          for (let i = 0; i < 9; i++) { const an = i / 9 * Math.PI * 2; window.fx.addFissureLine(this.x, this.y, this.x + Math.cos(an) * 200, this.y + Math.sin(an) * 200 * PERSPECTIVE_TILT, '#ff4d6d', 4); }
        }
        // the souls tear out of the boss and fly to you
        if (bs) for (let i = 0; i < 18; i++) this.addVfx({ kind: 'soul', x: bs.x + (Math.random() - 0.5) * 80, y: bs.y + (Math.random() - 0.5) * 40, tx: this.x, ty: this.y - 20, dur: 0.4 + Math.random() * 0.35, hue: Math.random(), rip: true });
        this.addVfx({ kind: 'skull', x: this.x, y: this.y - 80, dur: 0.7 });
        const dmg = this.strike(bs, this.x, this.y, 205, 2.4, 'Soul Rip [F]', 24, { isStrongMove: true, impulseStrength: 0.9, hitX: this.x, hitY: this.y });
        if (dmg > 0) {
          this.gainShield(this.shieldCap * 0.25 + dmg * 0.35);
          this.gainBlood(14);
          this.fxBlood(bs.x, bs.y - 40, 14);
          this.addVfx({ kind: 'rift', x: bs.x, y: bs.y, tx: this.x, ty: this.y, dur: 0.6 });   // the tear between you and the boss
        }
      }
      this.jumpZ = Math.max(0, this.jumpZ - 40 * dt);
      if (a.phaseT >= 0.55) { this.restoreChargeCamera(); this.endAct(); }
    }
  }

  // Voidform F — DEVOUR: lunge in and bite
  castVF(ax, ay, boss) {
    const hasBoss = !!(boss && boss.hp > 0 && Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT) < 560);
    if (hasBoss) this.facingAngle = Math.atan2((boss.y - this.y) / PERSPECTIVE_TILT, boss.x - this.x); else this.aimAt(null, ax, ay, 1);
    const ex = hasBoss ? boss.x - Math.cos(this.facingAngle) * 66 : this.x + Math.cos(this.facingAngle) * 170;
    const ey = hasBoss ? boss.y - Math.sin(this.facingAngle) * 66 * PERSPECTIVE_TILT : this.y + Math.sin(this.facingAngle) * 170 * PERSPECTIVE_TILT;
    this.beginAct('vf', 1.0, { phase: 'lunge', phaseT: 0, sx: this.x, sy: this.y, ex, ey, bit: false, boss });
    this.hIframes = 0.3;
    audio.playSwordSlash(false, 1.7);
    return true;
  }

  act_vf(dt, boss, a) {
    a.phaseT += dt;
    if (a.phase === 'lunge') {
      const s = rEaseOut(a.phaseT / 0.16);
      this.x = rLerp(a.sx, a.ex, s); this.y = rLerp(a.sy, a.ey, s);
      this.targetX = this.x; this.targetY = this.y;
      this.hIframes = Math.max(this.hIframes, 0.1);
      if (window.fx && Math.random() < dt * 80) window.fx.addAfterimage(this.x, this.y, this.facingAngle, '#ff1a3c');
      if (a.phaseT >= 0.16) { a.phase = 'bite'; a.phaseT = 0; this.snapFeetToBody(); }
    } else if (a.phase === 'bite') {
      if (!a.bit && a.phaseT >= 0.12) {
        a.bit = true;
        audio.playImpactBoom(1.4); audio.playSwordPlant();
        const bs = a.boss && a.boss.hp > 0 ? a.boss : boss;
        const cx = this.x + Math.cos(this.facingAngle) * 70, cy = this.y + Math.sin(this.facingAngle) * 70 * PERSPECTIVE_TILT;
        if (window.fx) {
          window.fx.triggerHitstop(80); window.fx.triggerShake(12, 0.25);
          window.fx.addShockwave(cx, cy, 170, '#ff1a3c', 7, 0.4); window.fx.addPillar(cx, cy, 40, '#ff1a3c', 0.5);
          if (this.isLocal) window.fx.triggerImpactFrame('#ff1a3c', 0.1);
        }
        this.addVfx({ kind: 'jaws', x: cx, y: cy, dur: 0.5, ang: this.facingAngle });
        const dmg = this.strike(bs, cx, cy, 170, 3.0, 'Devour [F]', 30, { isStrongMove: true, impulseStrength: 1.2, head: true });
        if (dmg > 0) {
          const heal = this.maxHp * 0.06;
          this.hp = Math.min(this.maxHp, this.hp + heal);
          this.gainShield(this.shieldCap * 0.18 + dmg * 0.5);
          this.fxBlood(bs.x, bs.y - 40, 14);
        }
      }
      if (a.phaseT >= 0.55) this.endAct();
    }
  }

  // =========================================================================
  // Z — VOIDFORM (you drop the scythe and become the demon)
  // =========================================================================
  castZ(boss) {
    if (this.cds.z > 0 || !this.canAct()) return false;
    if (this.form === 'void') return false;
    if (this.blood < R_BLOOD_MAX - 0.5) { this.say('The sphere is not full', '#fca5a5', 12); return false; }
    this.cds.z = this.maxCds.z;
    this.beginAct('z', 1.4, { fired: false });
    this.hIframes = 1.4;
    return true;
  }

  act_z(dt, boss, a) {
    const p = rClamp01(a.t / a.dur);
    this.hIframes = Math.max(this.hIframes, 0.1);
    this.jumpZ = Math.sin(rClamp01(p / 0.9) * Math.PI) * 8;
    if (window.fx && Math.random() < dt * 80) window.fx.addDragSparks(this.x + (Math.random() - 0.5) * 50, this.y - 10, -Math.PI / 2, 1, true, '#e11d48');
    if (!a.fired && p >= 0.5) {
      a.fired = true;
      this.dropped = { x: this.x + Math.cos(this.facingAngle) * 30, y: this.y + 8, t: 0, ang: -0.6 };   // the scythe is cast aside
      for (const k in this.cdTables.void) this.cdTables.void[k] = 0;          // a fresh set of Voidform skills each time
      this.form = 'void'; this.formT = R_VOID_TIME; this.blood = R_BLOOD_MAX;
      this.gainShieldRaw(this.shieldCap * 0.25);
      this.onEnterVoid(false);
    }
    if (p >= 1) { this.jumpZ = 0; this.endAct(); }
  }

  gainShieldRaw(v) { if (!this.isRemote) { this.shield = Math.min(this.shieldCap, (this.shield || 0) + v); this.shieldDecayT = R_SHIELD_DECAY_DELAY; } }

  onEnterVoid(quiet) {
    if (!window.fx) return;
    audio.playImpactBoom(1.9);
    if (!quiet || this.isLocal) {
      window.fx.triggerShake(22, 0.6);
      window.fx.addShockwave(this.x, this.y, 340, '#e11d48', 10, 0.7);
      window.fx.addShockwave(this.x, this.y, 200, '#000000', 8, 0.5);
      window.fx.addPillar(this.x, this.y, 70, '#e11d48', 0.9);
      if (this.isLocal) { window.fx.triggerImpactFrame('#e11d48', 0.16); window.fx.triggerScreenFlash('#7f1d1d', 0.4); }
    }
    if (this.isLocal) { this.say('🩸 VOIDFORM', '#fb7185', 18); if (audio.playBreakerGrunt) audio.playBreakerGrunt(true); }
  }

  endVoid() {
    this.form = 'human'; this.formT = 0; this.blood = 0;
    this.cds.z = this.maxCds.z;
    this.tether = null;
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 180, '#7f1d1d', 6, 0.5);
      if (this.isLocal) this.say('The form fades', '#fda4af', 12);
    }
  }

  // =========================================================================
  // T — REAPER'S VERDICT (Human)
  // =========================================================================
  castT(ax, ay, boss) {
    if (this.cds.t > 0 || !this.canAct()) return false;
    if (!boss || boss.hp <= 0) { this.say('No target', '#fca5a5', 12); return false; }
    this.cds.t = this.maxCds.t;
    this.aimAt(boss, boss.x, boss.y, 9999);
    if (ultHoldBlocked(boss)) {
      // the shared hold rule: a boss in a mechanic cannot be bound. The leap goes out and bounces off; in reach, half the cooldown
      // comes back, out of reach it is a whiff and the whole cooldown stays spent. Nothing is spent and nothing is hit.
      const inReach = Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT) < 520;
      if (inReach) this.cds.t = this.maxCds.t * 0.5;
      this.beginAct('t', 1.0, { phase: 'bounce', phaseT: 0, boss, inReach, sx: this.x, sy: this.y, ang: this.facingAngle });
      this.hIframes = 0.5;
      audio.playSwordSlash(true, 1.0);
      return true;
    }
    const sp = this.spend(1.0, 0.6, 0);
    this.beginAct('t', 6.4, { phase: 'leap', phaseT: 0, boss, mult: Math.max(1, sp.mult), sx: this.x, sy: this.y, cuts: 0, nextCut: 0, locked: false, ang: this.facingAngle });
    this.hIframes = 0.5;
    this.saveCamera();
    audio.playSwordSlash(true, 1.4);
    if (this.isLocal && audio.playBreakerGrunt) audio.playBreakerGrunt(true);
    return true;
  }

  act_t(dt, boss, a) {
    a.phaseT += dt;
    const bs = a.boss || boss;
    const cam = (this.isLocal && window.game) ? window.game.camera : null;
    const saved = this._chargeSavedZoom || 1.05;
    this.hIframes = Math.max(this.hIframes, 0.2);
    if (!bs || bs.hp <= 0) { this.restoreChargeCamera(); this.endAct(); return; }
    if (a.phase === 'bounce') {
      const ang = Math.atan2((bs.y - a.sy) / PERSPECTIVE_TILT, bs.x - a.sx);
      this.facingAngle = ang;
      const dist = Math.hypot(bs.x - a.sx, (bs.y - a.sy) / PERSPECTIVE_TILT);
      const reach = a.inReach ? Math.max(0, dist - 120) : Math.min(dist, 160) * 0.5;      // in reach: right up to the boss; out of reach: falls short
      const out = rEaseOut(Math.min(1, a.phaseT / 0.22)), back = rEaseOut(Math.max(0, Math.min(1, (a.phaseT - 0.26) / 0.3)));
      const r = reach * out * (1 - back);
      this.x = a.sx + Math.cos(ang) * r; this.y = a.sy + Math.sin(ang) * r * PERSPECTIVE_TILT;
      this.jumpZ = Math.sin(Math.min(1, a.phaseT / 0.55) * Math.PI) * 40;
      if (a.inReach && !a.bounced && a.phaseT >= 0.22) {
        a.bounced = true;
        audio.playImpactBoom(0.9);
        ultBounceFx(this.x + Math.cos(ang) * 70, this.y + Math.sin(ang) * 70 * PERSPECTIVE_TILT);
        if (window.fx) window.fx.triggerShake(6, 0.15);
      }
      if (a.phaseT >= 0.6) { this.jumpZ = 0; this.snapFeetToBody(); this.endAct(); }
    } else if (a.phase === 'leap') {
      const s = rEaseOut(a.phaseT / 0.5);
      const ang = Math.atan2((bs.y - a.sy) / PERSPECTIVE_TILT, bs.x - a.sx);
      this.facingAngle = ang;
      this.x = rLerp(a.sx, bs.x - Math.cos(ang) * 96, s); this.y = rLerp(a.sy, bs.y - Math.sin(ang) * 96 * PERSPECTIVE_TILT, s);
      this.jumpZ = Math.sin(s * Math.PI) * 70;
      if (cam) cam.targetZoom = Math.min(1.3, saved + s * 0.2);
      if (window.fx && Math.random() < dt * 40) window.fx.addAfterimage(this.x, this.y - this.jumpZ * 0.4, this.facingAngle, '#e11d48');
      if (a.phaseT >= 0.5) {
        a.phase = 'bind'; a.phaseT = 0; this.jumpZ = 0; this.snapFeetToBody();
        audio.playImpactBoom(1.5); audio.playParryClang(true);
        if (window.fx) {
          window.fx.triggerHitstop(90); window.fx.triggerShake(20, 0.45);
          if (this.isLocal) window.fx.triggerImpactFrame('#e11d48', 0.14);
          window.fx.addShockwave(bs.x, bs.y, 240, '#e11d48', 8, 0.55);
          for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2 + 0.3; window.fx.addFissureLine(bs.x + Math.cos(an) * 220, bs.y + Math.sin(an) * 220 * PERSPECTIVE_TILT, bs.x, bs.y, '#7f1d1d', 5); }
        }
        if (typeof bs.lockInPlaceForUltimate === 'function') bs.lockInPlaceForUltimate(3.6, 3.4, this.isRemote);
        a.locked = true;
        this.strike(bs, bs.x, bs.y, 9999, 1.2 * a.mult, 'Verdict Bind [T]', 30, { isStrongMove: true, impulseStrength: 1.6, hitX: bs.x, hitY: bs.y });
      }
    } else if (a.phase === 'bind') {
      this.facingAngle = Math.atan2((bs.y - this.y) / PERSPECTIVE_TILT, bs.x - this.x);
      if (window.fx && Math.random() < dt * 30) window.fx.addLightningBolt(bs.x + (Math.random() - 0.5) * 160, bs.y - 160, bs.x + (Math.random() - 0.5) * 60, bs.y - 10, '#e11d48', 3, 0.2);
      if (a.phaseT >= 0.45) { a.phase = 'flurry'; a.phaseT = 0; a.nextCut = 0; }
    } else if (a.phase === 'flurry') {
      this.facingAngle = Math.atan2((bs.y - this.y) / PERSPECTIVE_TILT, bs.x - this.x);
      this.bodySpinAngle = a.cuts * 1.1;
      if (a.cuts < 7 && a.phaseT >= a.nextCut) {
        a.cuts++; a.nextCut += 0.16;
        const an = this.facingAngle + (a.cuts % 2 ? 1 : -1) * (0.6 + (a.cuts % 3) * 0.3);
        audio.playSwordSlash(a.cuts % 2 === 0, 1.0 + a.cuts * 0.04);
        if (window.fx) {
          window.fx.triggerHitstop(22); window.fx.triggerShake(6, 0.12);
          window.fx.addDimensionalSlash(bs.x - Math.cos(an) * 120, bs.y - 20 - Math.sin(an) * 70, bs.x + Math.cos(an) * 120, bs.y - 20 + Math.sin(an) * 70, '#fb7185', 0.4);
          window.fx.addImpactStarburst(bs.x, bs.y - 40, '#fecdd3', 1.2, 0.2, 24);
          window.fx.addSlashRibbon(bs.x, bs.y - 40, 110 + (a.cuts % 3) * 25, an - 1.1, an + 1.1, a.cuts % 2 ? '#ffffff' : '#fb7185', 18, 0.22);   // each cut leaves a bright arc
          if (a.cuts === 7) window.fx.addShockwave(bs.x, bs.y, 230, '#e11d48', 6, 0.4);
        }
        this.strike(bs, bs.x, bs.y, 9999, 1.4 * a.mult, `Verdict Cut ${a.cuts} [T]`, 10, { impulseStrength: 0.4, hitX: bs.x, hitY: bs.y });
      }
      if (a.cuts >= 7 && a.phaseT >= 1.4) { a.phase = 'slam'; a.phaseT = 0; this.bodySpinAngle = 0; }
    } else if (a.phase === 'slam') {
      const s = rEaseOut(a.phaseT / 0.4);
      this.jumpZ = Math.sin(s * Math.PI) * 120;
      if (cam) cam.targetZoom = Math.max(0.9, saved + 0.2 - s * 0.2);
      if (!a.slam && a.phaseT >= 0.34) {
        a.slam = true; this.jumpZ = 0; this.snapFeetToBody();
        audio.playImpactBoom(2.1); audio.playSwordPlant(); audio.playCounterSuccessBoom && audio.playCounterSuccessBoom();
        if (window.fx) {
          window.fx.triggerHitstop(140); window.fx.triggerShake(30, 0.7); window.fx.triggerZoomPunch(0.12);
          if (this.isLocal) window.fx.triggerImpactFrame('#e11d48', 0.18);
          window.fx.addShockwave(bs.x, bs.y, 300, '#e11d48', 10, 0.65); window.fx.addShockwave(bs.x, bs.y, 180, '#ffffff', 6, 0.45);
          window.fx.addPillar(bs.x, bs.y, 80, '#e11d48', 0.9); window.fx.spawnMassiveEarthChunks(bs.x, bs.y, 14, '#7f1d1d');
          window.fx.addPillar(bs.x, bs.y, 130, '#ffffff', 0.5); window.fx.addShockwave(bs.x, bs.y, 420, '#7f1d1d', 12, 0.8);
          for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; window.fx.addFissureLine(bs.x, bs.y, bs.x + Math.cos(an) * 300, bs.y + Math.sin(an) * 300 * PERSPECTIVE_TILT, '#e11d48', 6); }
          window.fx.addDimensionalSlash(bs.x - 200, bs.y - 160, bs.x + 200, bs.y + 20, '#ffffff', 0.5);
        }
        this.strike(bs, bs.x, bs.y, 9999, 5.2 * a.mult, "REAPER'S VERDICT [T]", 130, { isStrongMove: true, impulseStrength: 2.2, hitX: bs.x, hitY: bs.y, head: true });
      }
      if (a.phaseT >= 1.0) {
        this.restoreChargeCamera();
        if (bs && bs.state === 'staggered') { bs.lockedByUltimateTimer = 0; bs.stateDuration = 3.4; bs.stateTimer = 3.4; }
        this.endAct();
      }
    }
  }

  // =========================================================================
  // T — CRIMSON ECLIPSE (Voidform): locked 5s charge, one gigantic blood sphere, ends the form
  // =========================================================================
  castVT(ax, ay, boss) {
    if (this.cds.tv > 0 || !this.canAct()) return false;
    this.cds.tv = this.maxCds.tv;
    // The direction is chosen NOW and cannot change.
    if (boss && boss.hp > 0 && Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT) < 700) this.aimAt(boss, ax, ay, 700);
    else this.aimAt(null, ax, ay, 1);
    this.vtAim = this.facingAngle;
    this.beginAct('tv', R_VT_CHARGE + 1.6, { phase: 'charge', phaseT: 0, ang: this.vtAim, sphere: 0, thrown: null, bossRef: boss });
    this.hIframes = 0.4;
    this.saveCamera();
    audio.playImpactBoom(1.5);
    if (this.isLocal && audio.playBreakerGrunt) audio.playBreakerGrunt(true);
    return true;
  }

  act_tv(dt, boss, a) {
    a.phaseT += dt;
    const cam = (this.isLocal && window.game) ? window.game.camera : null;
    const saved = this._chargeSavedZoom || 1.05;
    this.facingAngle = a.ang;
    this.hIframes = Math.max(this.hIframes, 0.15);          // Crimson Eclipse: untouchable from the first frame to the last (all your remaining energy goes into the bomb)
    this.speed = 0; this.vx = 0; this.vy = 0; this.targetX = this.x; this.targetY = this.y;
    if (a.phase === 'charge') {
      const c = rClamp01(a.phaseT / R_VT_CHARGE);
      a.sphere = c;
      this.jumpZ = rEaseOut(c * 2.2) * 26 + Math.sin(a.phaseT * 3) * 1.5;
      if (cam) cam.targetZoom = Math.max(0.85, saved - c * 0.18);
      if (window.fx) {
        if (Math.random() < dt * (30 + c * 90)) {     // the arena bleeds into the sphere
          const an = Math.random() * Math.PI * 2, r = 220 + Math.random() * 260;
          const sx = this.x + Math.cos(an) * r, sy = this.y + Math.sin(an) * r * 0.62;
          window.fx.addDragSparks(sx, sy, Math.atan2(this.y - 150 - sy, this.x - sx) + Math.PI, 1, true, Math.random() < 0.5 ? '#e11d48' : '#7f1d1d');
        }
        if (Math.random() < dt * (2 + c * 8)) window.fx.addShockwave(this.x, this.y, 60 + c * 190, '#7f1d1d', 2 + c * 3, 0.45);
        if (c > 0.6 && Math.random() < dt * 10) window.fx.addLightningBolt(this.x + (Math.random() - 0.5) * 200, this.y - 280, this.x, this.y - 130, '#e11d48', 2.5, 0.18);
        if (this.isLocal) window.fx.triggerShake(2 + c * 7, 0.08);
      }
      if (a.phaseT >= R_VT_CHARGE) {
        a.phase = 'throw'; a.phaseT = 0;
        a.thrown = { x: this.x + Math.cos(a.ang) * 60, y: this.y + Math.sin(a.ang) * 60 * PERSPECTIVE_TILT, t: 0, life: 1.1, hit: false, r: 170 };
        audio.playImpactBoom(2.4); audio.playSwordSlash(true, 1.6);
        if (window.fx) {
          window.fx.triggerHitstop(120); window.fx.triggerShake(30, 0.7); window.fx.triggerZoomPunch(0.14);
          if (this.isLocal) { window.fx.triggerImpactFrame('#e11d48', 0.2); window.fx.triggerScreenFlash('#e11d48', 0.4); }
          window.fx.addShockwave(this.x, this.y, 420, '#e11d48', 12, 0.7);
        }
        this.attackStepVx = -Math.cos(a.ang) * 200; this.attackStepVy = -Math.sin(a.ang) * 200 * PERSPECTIVE_TILT;
      }
    } else if (a.phase === 'throw') {
      this.jumpZ = Math.max(0, this.jumpZ - 90 * dt);
      const th = a.thrown;
      if (th) {
        th.t += dt;
        const sp = 1150;
        th.x += Math.cos(a.ang) * sp * dt; th.y += Math.sin(a.ang) * sp * dt * PERSPECTIVE_TILT;
        if (window.fx && Math.random() < dt * 60) window.fx.addShockwave(th.x, th.y, 120, '#7f1d1d', 5, 0.3);
        const bs = a.bossRef && a.bossRef.hp > 0 ? a.bossRef : boss;
        if (!th.hit && bs && bs.hp > 0 && Math.hypot(bs.x - th.x, (bs.y - th.y) / PERSPECTIVE_TILT) < th.r + 60) {
          th.hit = true;
          audio.playImpactBoom(2.6); audio.playCounterSuccessBoom && audio.playCounterSuccessBoom();
          if (window.fx) {
            window.fx.triggerHitstop(180); window.fx.triggerShake(34, 0.8); window.fx.triggerZoomPunch(0.16);
            if (this.isLocal) window.fx.triggerImpactFrame('#ffffff', 0.18);
            window.fx.addShockwave(bs.x, bs.y, 420, '#e11d48', 12, 0.7); window.fx.addShockwave(bs.x, bs.y, 250, '#ffffff', 7, 0.5);
            window.fx.addPillar(bs.x, bs.y, 120, '#e11d48', 1.0); window.fx.spawnMassiveEarthChunks(bs.x, bs.y, 16, '#7f1d1d');
            for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2; window.fx.addFissureLine(bs.x, bs.y, bs.x + Math.cos(an) * 280, bs.y + Math.sin(an) * 280 * PERSPECTIVE_TILT, '#e11d48', 6); }
          }
          this.strike(bs, bs.x, bs.y, 9999, 26, 'CRIMSON ECLIPSE [V]', 260, { isStrongMove: true, impulseStrength: 2.6, hitX: bs.x, hitY: bs.y, head: true });
        }
        if (th.t >= th.life) a.thrown = null;
      }
      if (a.phaseT >= 1.0) {
        this.restoreChargeCamera(); this.jumpZ = 0; this.endAct();
        if (!this.isRemote) this.endVoid();     // the cast is over: back to human
        this.cds.z = this.maxCds.z;
        return;
      }
    }
    a.dur = R_VT_CHARGE + 1.6;
  }

  // =========================================================================
  // Rendering hooks live in reaper_rig.js; the HUD in reaper_hud.js
  // =========================================================================
  updateHud(boss) {
    if (window.ReaperHud) window.ReaperHud.update(this, boss);
  }
}

// Painted icons (game/icons/skill_reaper_<key>.png, 96x96) are picked up automatically as soon as the files exist;
// until then the emoji icons are used. Voidform skills use skill_reaper_v<key>.png (vq vw ve vr va vs vd vf).
for (const k of ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z', 'v', 'space']) {
  const sk = window.SKILL_META.reaper.skills[k];
  if (!sk) continue;
  const im = new Image();
  im.onload = () => {
    sk.img = im.src.replace(/^.*\/game\//, 'game/');
    if (window.game && window.game.localPlayer && window.game.localPlayer.classId === 'reaper' && window.SkillHud) window.SkillHud.build(window.game.localPlayer);
  };
  im.src = 'game/icons/skill_reaper_' + k + '.png';
}
for (const k of ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f']) {
  const sk = window.SKILL_META.reaper.void[k];
  const im = new Image();
  im.onload = () => {
    sk.img = im.src.replace(/^.*\/game\//, 'game/');
    if (window.game && window.game.localPlayer && window.game.localPlayer.classId === 'reaper' && window.SkillHud) window.SkillHud.build(window.game.localPlayer);
  };
  im.src = 'game/icons/skill_reaper_v' + k + '.png';
}

window.ReaperPlayer25D = ReaperPlayer25D;
window.R_CONST = { R_SHIELD_CAP_FRAC, R_BLOOD_MAX, R_VOID_TIME, R_VT_CHARGE };
if (typeof installClashQte === 'function') installClashQte(ReaperPlayer25D);
