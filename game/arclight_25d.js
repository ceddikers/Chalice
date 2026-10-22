// =========================================================================
// ARCLIGHT_25D.JS — "Arclight" tech-scout class (wrist-blades, a drone that becomes a cannon, a thruster suit)
//
// Extends BreakerPlayer25D so movement, IK rig, hit-reactions and the shared Final Clash come for free. Class logic lives here,
// drawing in arclight_rig.js (suit + weapon tiers, beams, drone) and the HUD in arclight_hud.js.
//
//   • Core Heat   — everything you do builds Heat (0-100). Hot (40+): +15% damage, a little faster. Critical (80+): +35% damage,
//                   +14% speed, but you take 25% more damage. At 100 the core overheats: a forced vent, then a few slow seconds.
//   • [X]         — swap between SABER (melee) and BEAM (ranged, aimed with the mouse). The first skill after a swap is "Synced" (+30%).
//   • [Z] Vent    — dump all your Heat in a burst that scales with how much you had.
//   • [T]         — Orbital Lock: the drone calls a satellite down, the boss is held in place and torn apart (stronger at Critical).
// Act kinds: b q w e r a s d f t z
// =========================================================================

const AL_HEAT_MAX = 100;
const AL_COOL_DELAY = 8;
const AL_COOL_RATE = 3;
const AL_HOT = 40;
const AL_CRIT = 80;
const AL_SYNC_TIME = 4;
const AL_LOCK_TIME = 3;
const CHAIN_KEYS = 'qwersf';      // attack skills that build the chain
const CHAIN_WINDOW = 3;           // seconds between skills to keep it alive
const CHAIN_MAX = 5;              // links
const CHAIN_BONUS = 0.03;         // damage per link
window.ARCLIGHT_CHAIN = { keys: CHAIN_KEYS, max: CHAIN_MAX, bonus: CHAIN_BONUS };

const aClamp01 = (t) => Math.max(0, Math.min(1, t));
const aLerp = (a, b, t) => a + (b - a) * t;
const aEaseOut = (t) => 1 - Math.pow(1 - aClamp01(t), 3);
const aEaseIn = (t) => Math.pow(aClamp01(t), 2.2);
const aTilt = () => (typeof PERSPECTIVE_TILT !== 'undefined' ? PERSPECTIVE_TILT : 0.55);

window.SKILL_META = window.SKILL_META || {};
window.SKILL_META.arclight = {
  title: 'ARCLIGHT',
  identity: { name: 'Solar Cannon', icon: '☀️', key: 'Z', kind: 'arclight_heat' },
  passive: {
    name: 'Solar Charge',
    desc: 'Everything you do charges the SOLAR CORE (0-100%). A full blade combo into a full beam combo fills it, and it drains slowly when you stop fighting. At 100%, [Z] fires the SOLAR CANNON: you hop back and burn a gigantic beam for about two seconds.<br><b>[X]</b> swaps SABER (wrist blades, melee) and BEAM (the drone docks as a cannon, ranged, aimed with the mouse). Each mode has its own cooldowns, so swapping gives you a fresh set of skills, and the first skill after a swap is Synced (+30% damage). Marks and Locks carry over.<br><b>CHAIN:</b> casting a DIFFERENT attack skill (Q, W, E, R, S or F, either mode) within 3s adds a link: +3% damage each, up to 5 (+15%). Ready skills glow while it lasts, and swapping keeps it going.<br><b>SABER:</b> Q, W, E and S leave Marks on the boss (up to 5); R detonates them.<br><b>BEAM:</b> your shots Lock on (Marks become Locks): the auto pulses, Q, W, E and S build them. R is empowered by Locks (+10% each, they stay) and F erases them (+10% each and a wider beam).'
  },
  skills: {
    q: { name: 'Cross Slash / Lance Shot', icon: '✖️', short: 'Cross', stagger: 'medium', destructive: false, counter: false, position: 'back', cd: '9s',
         desc: 'BLADES: lunge in along your cursor and cut a cross with both blades; each cut leaves a Mark on the boss. BEAM: charge, then fire a piercing lance of light along your cursor.' },
    w: { name: 'Wing Rush / Lock-On Strike', icon: '🪽', short: 'Wing Rush', stagger: 'medium', destructive: false, counter: false, cd: '11.5s',
         desc: 'BLADES: wings flare and you rocket THROUGH the target to its far side, a cut from each blade on the way, untouchable while you move. Marks the boss. BEAM: your scouter locks onto the boss (a slight zoom, a reticle closing in), then twelve homing missiles pop out of your backpack in a loose spray, hang for a beat and then all curve in on it together. Each hit adds a little Lock.' },
    e: { name: 'Rotor Cyclone / Sweep Laser', icon: '🌀', short: 'Cyclone', stagger: 'medium', destructive: true, counter: false, cd: '11.5s',
         desc: 'BLADES: hover on your thrusters and spin both blades like a rotor, shredding everything around you, ending in a slam that adds 2 Marks and leaves a ring of plasma. BEAM: sweep a laser across a wide arc in front of you.' },
    r: { name: 'Zenith Dive / Convergence Beam', icon: '☄️', short: 'Zenith', stagger: 'high', destructive: true, counter: false, position: 'front', cd: '17.5s',
         desc: 'BLADES: blast off toward the cursor, untouchable until you land, and dive crossed blades first. It DETONATES every Mark on the boss for +20% damage each. BEAM: five emitters (shoulders, wings and cannon) open up and sweep a fan of lasers together onto your cursor, merging into one blinding beam. Each Lock on the boss adds 10% to the burst, and they stay.' },
    a: { name: 'Boost Dash', icon: '💨', short: 'Boost', stagger: 'none', destructive: false, counter: false, cd: '6s',
         desc: 'Boost toward the cursor with i-frames. In BEAM mode it also flashes a small shield.' },
    s: { name: 'Crescent Wave / Scatter Shot', icon: '🌙', short: 'Crescent', stagger: 'low', destructive: false, counter: false, cd: '15.5s',
         desc: 'BLADES: cross your blades and throw them apart: a wide crescent of light races out along your cursor and Marks whatever it hits. Your ranged way to feed the Marks. BEAM: a close-range shotgun blast of pellets that hits much harder up close.' },
    d: { name: 'Cross Guard', icon: '🛡️', short: 'Guard', stagger: 'low', destructive: false, counter: true, cd: '6s',
         desc: 'Cross your blades in a quick counter stance. Landing it on a blue boss flash is a full counter: big stagger, a chunk of shield, and it adds a little Solar charge.' },
    f: { name: 'Blade Storm / Overcharge Beam', icon: '✴️', short: 'Storm', stagger: 'high', destructive: true, counter: false, position: 'front', cd: '17.5s',
         desc: 'BLADES: a five-cut flurry that darts around the target, left blade, right blade, ending in a huge cross. BEAM: charge up and hold a huge beam on your cursor for a couple of seconds.' },
    t: { name: 'Orbital Lock', icon: '🛰️', short: 'Orbital', stagger: 'high', destructive: true, counter: false, cd: '2m',
         desc: 'The drone calls a satellite down: the boss is held in place while beams rain on it and a final blast lands. Does not use up your Solar charge.' },
    x: { name: 'Mode Swap', icon: '🔁', short: 'Swap', stagger: 'none', destructive: false, counter: false, cd: '0.8s',
         desc: 'Press [X] to swap between SABER (blades projected from both wrists) and BEAM (your drone docks onto your arm and becomes the cannon). The first skill you use afterwards is Synced for +30% damage. Each mode has its own cooldowns.' },
    space: { name: 'Evade Dash', icon: '💨', short: 'Evade', stagger: 'none', destructive: false, counter: false, cd: '5.5s',
         desc: 'Quick dash with i-frames. Also a wake-up roll when knocked down.' },
    z: { name: 'Solar Cannon', icon: '☀️', short: 'Cannon', stagger: 'high', destructive: true, counter: false, position: 'front', cd: 'Full charge',
         desc: 'Needs a FULL Solar charge. You hop back, put your free hand on the cannon arm, charge for a moment, then fire a gigantic beam that burns for about two seconds (a hit every 0.1s, then a big finale). It follows your cursor slowly. You are armoured while it fires, and it uses up the whole charge.' }
  },
  // BLADE (saber) mode: what the tooltip shows in Saber mode, the blade half only (the combined text above is for the character creator)
  blade: {
    q: { name: 'Cross Slash', desc: 'Lunge in along your cursor and cut a cross with both blades; each cut leaves a Mark on the boss.', destructive: false },
    w: { name: 'Wing Rush', desc: 'Your wings flare and you rocket THROUGH the target to its far side, a cut from each blade on the way, untouchable while you move. Marks the boss.', destructive: false },
    e: { name: 'Rotor Cyclone', desc: 'Hover on your thrusters and spin both blades like a rotor, shredding everything around you, ending in a slam that adds 2 Marks and leaves a ring of plasma.', destructive: true },
    r: { name: 'Zenith Dive', desc: 'Blast off toward the cursor, untouchable until you land, and dive crossed blades first. It DETONATES every Mark on the boss for +20% damage each.', destructive: true },
    a: { name: 'Boost Dash', desc: 'Boost toward the cursor with i-frames.', destructive: false },
    s: { name: 'Crescent Wave', desc: 'Cross your blades and throw them apart: a wide crescent of light races out along your cursor and Marks whatever it hits. Your ranged way to feed the Marks.', destructive: false },
    d: { name: 'Cross Guard', desc: 'Cross your blades in a quick counter stance. Landing it on a blue boss flash is a full counter: big stagger, a chunk of shield, and it adds a little Solar charge.', destructive: false },
    f: { name: 'Blade Storm', desc: 'A five-cut flurry that darts around the target, left blade, right blade, ending in a huge cross.', destructive: true }
  },
  // BEAM mode names, used by the HUD while in Beam mode and by the character creator
  beam: {
    q: { name: 'Lance Shot', icon: '🔆', short: 'Lance', destructive: false, desc: 'Charge, then fire a piercing lance of light along your cursor. A hit adds 2 Locks on the boss.' },
    w: { name: 'Lock-On Strike', icon: '🎯', short: 'Lock-On', destructive: false, desc: 'Your scouter locks onto the boss (a slight zoom, a reticle closing in), then twelve homing missiles pop out of your backpack in a loose spray, hang for a beat and then all curve in on it together. Each hit adds a little Lock.' },
    e: { name: 'Sweep Laser', icon: '〰️', short: 'Sweep', destructive: false, desc: 'Sweep a laser across a wide arc in front of you. Every tick that connects adds a little Lock.' },
    r: { name: 'Convergence Beam', icon: '🔱', short: 'Converge', destructive: true, desc: 'Five emitters (shoulders, wings and cannon) open up and sweep a fan of lasers together onto your cursor, merging into one blinding beam. Each Lock on the boss adds 10% to the burst, and they stay.' },
    a: { name: 'Boost Dash', icon: '💨', short: 'Boost', desc: 'Boost toward the cursor with i-frames and a small shield flash.' },
    s: { name: 'Scatter Shot', icon: '💥', short: 'Scatter', destructive: false, desc: 'A close-range shotgun blast of pellets; much stronger up close, and each pellet that hits adds a little Lock.' },
    d: { name: 'Photon Parry', icon: '🛡️', short: 'Parry', desc: 'A quick counter stance.' },
    f: { name: 'Overcharge Beam', icon: '☀️', short: 'Overcharge', destructive: true, desc: 'Charge up and hold a huge beam on your cursor for a couple of seconds. Each Lock on the boss widens it and adds 10% damage, and the beam erases them.' },
    t: { name: 'Orbital Lock', icon: '🛰️', short: 'Orbital', desc: 'The drone calls a satellite down on the boss.' }
  }
};

function aAfter(x, y, fa, col) { const f = window.fx; if (!f) return; f.addAfterimage(x, y, fa, col); const l = f.afterimages[f.afterimages.length - 1]; if (l) l.noSword = true; }
class ArclightPlayer25D extends BreakerPlayer25D {
  constructor(id, name, x, y, isLocal = true, isBot = false) {
    super(id, name || 'Arclight', x, y, isLocal, isBot);
    this.classId = 'arclight';
    this.weaponColor = '#38bdf8';
    this.weaponGlow = '#0ea5e9';
    this.weaponModelId = 'arc_prototype';
    this.baseAtk = 150;
    this.baseMaxSpeed = 194;

    this.cds = { q: 0, w: 0, e: 0, r: 0, a: 0, s: 0, d: 0, f: 0, t: 0, z: 0, x: 0, space: 0, wakeup: 0 };
    this.maxCds = { q: 9, w: 11.5, e: 11.5, r: 17.5, a: 6, s: 15.5, d: 6, f: 17.5, t: 120, z: 3, x: 0.8, space: 5.5, wakeup: 20 };
    // The two modes do NOT share cooldowns: Q-F read and write the table of the CURRENT mode (so the HUD and every cast just use
    // this.cds), while the other mode's table keeps counting down in the background. T, Z, X and the dodge are shared.
    this.cdTables = { saber: { q: 0, w: 0, e: 0, r: 0, a: 0, s: 0, d: 0, f: 0 }, beam: { q: 0, w: 0, e: 0, r: 0, a: 0, s: 0, d: 0, f: 0 } };
    for (const k of 'qwerasdf') {
      Object.defineProperty(this.cds, k, { get: () => this.cdTables[this.mode][k], set: (v) => { this.cdTables[this.mode][k] = v; }, enumerable: true, configurable: true });
    }

    this.act = null;
    this.hIframes = 0;
    this.mode = 'saber';        // 'saber' | 'beam'
    this.modeBlend = 0;         // eased 0 (saber) .. 1 (beam), for the look
    this.bladeExt = 0;          // wrist blades: 0 retracted .. 1 fully out
    this.bladeHold = 0;
    this.hoverNow = 0;          // current hover height (eased)
    // BLADES synergy: Marks stack on the boss (Q W E S and the auto finisher add them, R detonates them) and casting Q -> W -> E -> R
    // in order builds a Chain (+10% damage per link, +30% on a full chain).
    this.marks = 0; this.markT = 0; this.markBoss = null;
    this.chain = 0; this.chainT = 0; this.chainKey = '';
    this.heat = 0;
    this.heatShown = 0;
    this.heatIdleT = 0;
    this.syncT = 0;
    this.lockT = 0;             // overheat aftermath: slow, no heat gain
    this.bolts = [];            // pulse shots, boomerang, missiles, pellets
    this.beams = [];            // timed beam visuals
    this.vfx = [];              // timed world effects: plasma rings, rings, strikes
    this.sentry = null;
    this.bStep = 0; this.bResetT = 0;
    this.hudFlashT = 0;
    this.muzzle = 0;
  }

  resetArclight() {
    this.act = null; this.mode = 'saber'; this.modeBlend = 0; this.heat = 0; this.heatShown = 0; this.heatIdleT = 0;
    this.syncT = 0; this.lockT = 0; this.bolts = []; this.beams = []; this.vfx = []; this.sentry = null;
    this.marks = 0; this.markT = 0; this.chain = 0; this.chainT = 0; this.chainKey = ''; this.bladeExt = 0; this.bladeHold = 0;
    for (const m of ['saber', 'beam']) for (const k in this.cdTables[m]) this.cdTables[m][k] = 0;
    this.jumpZ = 0; this.hIframes = 0; this.bStep = 0; this.bResetT = 0; this.shield = 0;
    if (this.state === 'h_act') this.state = 'idle';
    this.restoreChargeCamera();
  }

  // ----- small accessors ---------------------------------------------------
  get stage() { return this.heat >= AL_HEAT_MAX - 0.5 ? 2 : (this.heat >= 55 ? 1 : 0); }          // visual only: the suit glows warmer as the Solar charge fills
  heatMult() { return 1; }
  addOverpower() { /* Breaker-only resource */ }
  noKeyRepeat(k) { return k === 'z' || k === 't' || k === 'x' || k === 'e' || k === 'w' || k === 'r' || k === 'f' || k === 's'; }

  say(text, color = '#7dd3fc', size = 13) {
    if (window.fx && this.isLocal) window.fx.addFloatingText(this.x, this.y - 78, text, color, size);
  }

  // Extra fields riding on the regular player_state packet (see network_coop.js).
  getNetState() {
    const mw = this.mouseWorld();
    return { am: this.mode === 'beam' ? 1 : 0, ah: Math.round(this.heat), amk: this.marks | 0, ax: Math.round(mw.x), ay: Math.round(mw.y) };
  }

  applyNetState(d) {
    this.remoteAim = { x: d.ax, y: d.ay };
    if (typeof d.ah === 'number') this.heat = d.ah;
    if (typeof d.amk === 'number') this.marks = Math.max(0, Math.min(5, d.amk));
    if (typeof d.am === 'number') {
      const nm = d.am ? 'beam' : 'saber';
      if (nm !== this.mode) { this.mode = nm; this.swapFx(); }
    }
  }

  // ----- Heat ----------------------------------------------------------------
  addHeat(v) {
    if (this.isRemote || v <= 0 || this.lockT > 0) return;
    const before = this.heat;
    this.heat = Math.min(AL_HEAT_MAX, this.heat + v * 0.6);       // tuned so it takes a whole blade rotation AND a whole beam rotation (plus a few extras) to fill
    this.heatIdleT = 0;
    if (before < AL_HEAT_MAX && this.heat >= AL_HEAT_MAX) {          // fully charged: the Solar Cannon is ready
      this.hudFlashT = 0.8;
      this.say('SOLAR CANNON READY [Z]', '#fde68a', 15);
      if (this.isLocal) audio.playParryClang && audio.playParryClang(true);
      if (window.fx && this.isLocal) { window.fx.addShockwave(this.x, this.y, 130, '#fde68a', 5, 0.45); window.fx.addPillar && window.fx.addPillar(this.x, this.y, 60, '#fde68a', 0.5); }
    }
  }

  // Marks on the boss (BLADES). Up to 5; they fade after 8s without a new one.
  addMarks(n, boss) {
    if (this.isRemote || n <= 0) return;
    const before = this.marks;
    this.marks = Math.min(5, this.marks + n);          // beam hits add fractions: three pulses = one lock
    this.markT = 0; this.markBoss = boss || this.markBoss;
    if ((this.marks | 0) > (before | 0) && this.isLocal) {
      audio.playParryClang && audio.playParryClang(false);
      if (this.marks >= 5) this.say(this.mode === 'beam' ? 'LOCKED x5 - [R] / [F]' : 'MARKED x5 - [R] to detonate', '#bae6fd', 12);
    }
  }

  // The vent itself. forced = the core overheated on its own: a bit weaker, and a few slow seconds follow.
  ventBurst(forced) {
    const boss = window.game ? window.game.getActiveBossTarget() : null;
    const h = this.heat;
    const coeff = (0.8 + h * 0.035) * (forced ? 0.8 : 1);
    this.heat = 0;
    audio.playImpactBoom(1.3 + h / 100);
    if (window.fx) {
      window.fx.triggerShake(10 + h * 0.12, 0.35);
      window.fx.addShockwave(this.x, this.y, 150 + h, '#fde68a', 7, 0.5);
      window.fx.addShockwave(this.x, this.y, 100 + h * 0.6, '#38bdf8', 4, 0.4);
      window.fx.addPillar(this.x, this.y, 50 + h * 0.3, '#fbbf24', 0.6);
      window.fx.addDragSparks(this.x, this.y - 30, -Math.PI / 2, 14, false, '#fde68a');
    }
    this.strike(boss, this.x, this.y, 230, coeff, 'Core Vent [Z]', 12 + h * 0.4, { isStrongMove: h > 60, impulseStrength: 1.0 + h / 100, hitX: this.x, hitY: this.y });
    if (forced) { this.lockT = AL_LOCK_TIME; this.say('OVERHEAT', '#fca5a5', 15); }
  }

  // Positioned hit with reach check. Returns the damage dealt (0 = miss).
  strike(boss, cx, cy, reach, coeff, name, stagger, opts = null) {
    if (!boss || boss.hp <= 0) return 0;
    if (!this.isRemote && typeof boss.checkPlayerHitAnchors === 'function') boss.checkPlayerHitAnchors(cx, cy, reach);
    if (Math.hypot(boss.x - cx, (boss.y - cy) / PERSPECTIVE_TILT) >= reach) return 0;
    const o = Object.assign({ isStrongMove: false, impulseStrength: 0.8, hitX: cx, hitY: cy }, opts || {});
    return this.dealHitToBoss(boss, coeff, name, !!o.head, stagger, false, o) || 0;
  }

  // Hit along a beam: a rectangle from (x0,y0) along `ang` for `len`, `halfW` wide (the boss counts as 64 wide itself).
  beamHit(boss, x0, y0, ang, len, halfW, coeff, name, stagger, opts = null) {
    if (!boss || boss.hp <= 0) return 0;
    const dx = boss.x - x0, dy = (boss.y - y0) / PERSPECTIVE_TILT;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const along = dx * ca + dy * sa, side = Math.abs(-dx * sa + dy * ca);
    if (along < -20 || along > len + 40 || side > halfW + 64) return 0;
    if (!this.isRemote && typeof boss.checkPlayerHitAnchors === 'function') boss.checkPlayerHitAnchors(boss.x, boss.y, 40);
    const o = Object.assign({ isStrongMove: false, impulseStrength: 0.6, hitX: boss.x, hitY: boss.y }, opts || {});
    return this.dealHitToBoss(boss, coeff, name, !!o.head, stagger, false, o) || 0;
  }

  // Every landing hit funnels through here (Breaker's base included).
  dealHitToBoss(boss, coeff, skillName, isHeadSkill = false, staggerAmt = 18, applyFracture = false, hitOpts = null) {
    coeff *= this.heatMult();
    if (this.act && this.act.sync) coeff *= 1.3;
    if (this.act && this.act.chain) coeff *= 1 + CHAIN_BONUS * Math.min(CHAIN_MAX, this.act.chain);      // a skill chain
    return super.dealHitToBoss(boss, coeff, skillName, isHeadSkill, staggerAmt, false, hitOpts);
  }

  // Mouse-only aiming: nothing snaps onto the boss.
  aimAt(boss, ax, ay, assistRange = 0) {
    const ang = Math.atan2((ay - this.y) / PERSPECTIVE_TILT, ax - this.x);
    this.facingAngle = ang;
    return ang;
  }

  mouseWorld() {
    if (!this.isLocal) {
      return this.remoteAim || { x: this.x + Math.cos(this.facingAngle) * 200, y: this.y + Math.sin(this.facingAngle) * 200 * aTilt() };
    }
    const g = window.game;
    return { x: g ? g.mouseWorldX : this.x + 100, y: g ? g.mouseWorldY : this.y };
  }

  // A bolt: pulse (straight, short), pellet, missile (arcs to a point and explodes) or boomerang (out and back).
  fire(b) {
    b.t = 0; b.hit = false; b.hits = 0;
    this.bolts.push(b);
    if (this.bolts.length > 60) this.bolts.shift();
    return b;
  }

  // A scorched line burned into the floor along a beam (drawn as a floor decal by the rig)
  addScorch(x, y, ang, len) { this.addVfx({ kind: 'scorch', x, y, x1: x + Math.cos(ang) * len, y1: y + Math.sin(ang) * len * aTilt(), dur: 1.6 }); }

  addBeamFx(x0, y0, ang, len, w, dur, col) { this.beams.push({ x0, y0, ang, len, w, t: 0, dur, col: col || this.beamCol() }); if (this.beams.length > 24) this.beams.shift(); }
  beamCol() { return this.stage === 2 ? '#fb7185' : (this.stage === 1 ? '#fbbf24' : '#38bdf8'); }

  swapFx() {
    if (!window.fx) return;
    window.fx.addShockwave(this.x, this.y, 70, this.mode === 'beam' ? '#38bdf8' : '#fbbf24', 3.5, 0.3);
    window.fx.addDragSparks(this.x, this.y - 40, -Math.PI / 2, 8, false, '#e0f2fe');
  }

  // ----- action framework (same shape as the Gravebreaker / Reaper) --------------
  beginAct(kind, dur, extra = null) {
    this.act = Object.assign({ kind, t: 0, dur, mode: this.mode, sync: false }, extra || {});
    if (kind !== 'b' && kind !== 'd' && this.syncT > 0) { this.act.sync = true; this.syncT = 0; if (this.isLocal) this.say('SYNC', '#fde68a', 12); }
    // the chain: ANY different attack skill (Q W E R S F, either mode) within 3s of the last adds a link (+3% damage each, 5 links max).
    // Swapping modes keeps it going; casting the same skill again does not add a link.
    if (CHAIN_KEYS.includes(kind) && kind.length === 1) {
      const key = this.mode[0] + kind;
      if (this.chainT > 0 && this.chainKey) { if (key !== this.chainKey) this.chain = Math.min(CHAIN_MAX, this.chain + 1); } else this.chain = 0;
      this.chainKey = key; this.chainT = CHAIN_WINDOW; this.act.chain = this.chain;
      if (this.chain >= 1 && this.isLocal) this.say(this.chain >= CHAIN_MAX ? 'FULL CHAIN' : `CHAIN x${this.chain + 1}`, this.chain >= CHAIN_MAX ? '#fde68a' : '#bae6fd', this.chain >= CHAIN_MAX ? 15 : 12);
    }
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
    if (this.act && this.state !== 'h_act') { this.act = null; this.restoreChargeCamera(); }
  }

  restoreChargeCamera() {
    if (this._chargeSavedZoom && window.game && window.game.camera) window.game.camera.targetZoom = this._chargeSavedZoom;
    this._chargeSavedZoom = null;
  }

  saveCamera() {
    if (this.isLocal && window.game && window.game.camera && !this._chargeSavedZoom) this._chargeSavedZoom = window.game.camera.targetZoom;
  }

  // An auto-attack whose blow has landed may be cut short by a skill.
  // In BLADES mode the attack skills cancel into each other once their last hit has landed, so a chain of different skills flows with no dead air.
  skillCancelReady() {
    const a = this.act;
    if (!a) return false;
    if (a.kind === 'b') return !!a.hit && a.t >= a.dur * 0.55;
    if (a.mode === 'beam') {         // BEAM: once the shot / burst has gone off, the rest is recovery
      if (a.kind === 'q') return !!a.fired && a.t >= 0.6;
      if (a.kind === 'w') return a.n >= a.total && a.t >= 1.35;
      if (a.kind === 'e') return a.t >= 1.22;
      if (a.kind === 'r') return !!a.fired && a.t >= 1.5;
      if (a.kind === 's') return !!a.fired && a.t >= 0.34;
      if (a.kind === 'f') return !!a.fired;
      return false;
    }
    if (a.kind === 'q') return !!a.hit2 && a.t >= 0.4;
    if (a.kind === 'w') return !!a.fired && a.t >= 0.3;
    if (a.kind === 'e') return !!a.finished;
    if (a.kind === 'r') return a.phase === 'slam' && a.phaseT >= 0.12;
    if (a.kind === 's') return !!a.fired && a.t >= 0.32;
    if (a.kind === 'f') return a.n >= 5 && a.t >= a.dur - 0.35;
    return false;
  }

  // ----- update -------------------------------------------------------------
  _updateInternal(dt, boss, arenaCenter, arenaRadius) {
    if (this.hIframes > 0) this.hIframes = Math.max(0, this.hIframes - dt);
    if (this.hudFlashT > 0) this.hudFlashT = Math.max(0, this.hudFlashT - dt);
    if (this.bResetT > 0) this.bResetT = Math.max(0, this.bResetT - dt);
    if (this.syncT > 0) this.syncT = Math.max(0, this.syncT - dt);
    // the mode you are NOT in keeps cooling down (the active one is ticked by the base class through this.cds)
    { const other = this.mode === 'saber' ? this.cdTables.beam : this.cdTables.saber; for (const k in other) if (other[k] > 0) other[k] = Math.max(0, other[k] - dt); }
    if (this.chainT > 0) { this.chainT = Math.max(0, this.chainT - dt); if (this.chainT === 0) { this.chain = 0; this.chainKey = ''; } }
    if (this.marks > 0 && !this.isRemote) { this.markT += dt; if (this.markT > 8) this.marks = 0; }
    if (this.lockT > 0) this.lockT = Math.max(0, this.lockT - dt);
    if (this.muzzle > 0) this.muzzle = Math.max(0, this.muzzle - dt);
    this.modeBlend += ((this.mode === 'beam' ? 1 : 0) - this.modeBlend) * Math.min(1, dt * 9);
    // The wrist blades are retracted until a Saber-mode attack, then slide out fast and tuck away a moment after it ends.
    const attacking = !!(this.act && this.act.mode !== 'beam' && ['b', 'q', 'w', 'e', 'r', 's', 'f', 'd'].includes(this.act.kind));
    if (attacking) this.bladeHold = 0.3; else if (this.bladeHold > 0) this.bladeHold = Math.max(0, this.bladeHold - dt);
    const want = (attacking || this.bladeHold > 0) && this.mode === 'saber' ? 1 : 0;
    const prevExt = this.bladeExt || 0;
    this.bladeExt = prevExt + (want - prevExt) * Math.min(1, dt * (want > prevExt ? 26 : 12));
    if (prevExt < 0.15 && this.bladeExt >= 0.15) {             // the blades ignite: a flash and a crack at each wrist
      if (this.isLocal && audio.playParryClang) audio.playParryClang(false);
      if (window.fx && (this.isLocal || window.fx.showAllyVfx !== false)) {
        const ca = Math.cos(this.facingAngle), sa = Math.sin(this.facingAngle) * aTilt();
        for (const sd of [-1, 1]) window.fx.addDragSparks(this.x + ca * 16 - sa * sd * 12, this.y + sa * 16 + ca * sd * 4 - 40, this.facingAngle, 5, false, '#e0f2fe');
        window.fx.addShockwave(this.x, this.y - 8, 56, this.glowCol ? this.glowCol() : '#38bdf8', 3, 0.22);
      }
    }
    this.heatShown += (this.heat - this.heatShown) * Math.min(1, dt * 8);

    // Heat cools once you stop attacking (owner only; proxies get the number from player_state).
    if (!this.isRemote && this.heat > 0) {
      this.heatIdleT += dt;
      if (this.heatIdleT > AL_COOL_DELAY) this.heat = Math.max(0, this.heat - AL_COOL_RATE * dt);
    }

    if (this.hp <= 0) {
      this.act = null; this.sentry = null; this.bolts.length = 0;
      this.restoreChargeCamera();
    } else {
      this.cancelActIfInterrupted();
      this.updateAct(dt, boss);
      this.updateBolts(dt, boss);
      this.updateSentry(dt, boss);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) { this.beams[i].t += dt; if (this.beams[i].t >= this.beams[i].dur) this.beams.splice(i, 1); }
    this.updateVfx(dt, boss);
    this.baseMaxSpeed = 194;
    // ---- HOVER: the suit floats a hand's width off the floor on its thrusters instead of walking ----
    const tNow = performance.now() * 0.001;
    const canHover = this.hp > 0 && !/^(hit_|dead|grabbed|wakeup|clash)/.test(this.state || '');
    const hoverTarget = canHover ? 13 + Math.sin(tNow * 2.6) * 1.8 + Math.min(1, (this.speed || 0) / 190) * 1.5 : 0;
    this.hoverNow += (hoverTarget - this.hoverNow) * Math.min(1, dt * 8);
    if (canHover && this.jumpZ < this.hoverNow) this.jumpZ = this.hoverNow;
    super._updateInternal(dt, boss, arenaCenter, arenaRadius);
    if (canHover && this.jumpZ < this.hoverNow) this.jumpZ = this.hoverNow;
    if (canHover && this.jumpZ <= this.hoverNow + 4) {
      // legs hang loose and trail behind you a little as you glide, instead of the jump tuck
      const sp = Math.min(1, (this.speed || 0) / 190), ra = this.getRenderFacingAngle(), ca = Math.cos(ra), sa = Math.sin(ra);
      this.leftFoot.z = Math.max(0, this.jumpZ - 3 + Math.sin(tNow * 2.1) * 1.2); this.rightFoot.z = Math.max(0, this.jumpZ - 6 + Math.sin(tNow * 2.1 + 1.4) * 1.2);
      this.leftFoot.pitch = 0.5 + sp * 0.3; this.rightFoot.pitch = 0.6 + sp * 0.3;
      this.leftFoot.x -= ca * sp * 7; this.leftFoot.y -= sa * sp * 7 * aTilt();
      this.rightFoot.x -= ca * sp * 10; this.rightFoot.y -= sa * sp * 10 * aTilt();
    }
    // thruster wash: a little spray under the boots while hovering, more when gliding; sparks off a hot suit
    if (window.fx && (this.isLocal || window.fx.showAllyVfx !== false) && canHover) {
      const sp2 = Math.min(1, (this.speed || 0) / 190);
      if (Math.random() < dt * (10 + sp2 * 26)) window.fx.addDragSparks(this.x + (Math.random() - 0.5) * 14, this.y + 4, Math.PI / 2 + (Math.random() - 0.5) * 0.8, 1, false, this.glowCol ? this.glowCol() : '#38bdf8');
      if (sp2 > 0.3 && Math.random() < dt * 14) window.fx.addDragSparks(this.x - Math.cos(this.facingAngle) * 8, this.y - 6, this.facingAngle + Math.PI, 1, false, '#e0f2fe');      // a few small trailing sparks only (no big ghosts)
      if (this.stage >= 1 && Math.random() < dt * (this.stage * 12)) window.fx.addDragSparks(this.x + (Math.random() - 0.5) * 24, this.y - 70, -Math.PI / 2, 1, false, this.stage === 2 ? '#fb7185' : '#fbbf24');
    }
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

  addVfx(e) { e.t = 0; this.vfx.push(e); if (this.vfx.length > 40) this.vfx.shift(); return e; }

  updateVfx(dt, boss) {
    for (let i = this.vfx.length - 1; i >= 0; i--) {
      const e = this.vfx[i];
      e.t += dt;
      if (e.kind === 'plasma') {       // the ring left by Plasma Spin keeps burning whatever stands in it
        e.tick -= dt;
        if (e.tick <= 0 && e.t < e.dur) { e.tick = 0.5; this.strike(boss, e.x, e.y, e.r, 0.45, 'Plasma Ring [E]', 4, { impulseStrength: 0.2, hitX: e.x, hitY: e.y }); }
      }
      if (e.t >= e.dur) this.vfx.splice(i, 1);
    }
  }

  updateBolts(dt, boss) {
    const T = aTilt();
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      let remove = false;
      if (b.kind === 'rocket') {
        const u = aClamp01(b.t / b.dur);
        b.x = aLerp(b.sx, b.tx, u); b.y = aLerp(b.sy, b.ty, u); b.z = Math.sin(u * Math.PI) * b.arc;
        if (u >= 1) {
          remove = true;
          audio.playImpactBoom(0.7);
          if (window.fx) { window.fx.addShockwave(b.tx, b.ty, 100, '#fb923c', 4, 0.3); window.fx.addImpactStarburst && window.fx.addImpactStarburst(b.tx, b.ty - 14, '#fde68a', 0.9, 0.2, 18); }
          this.strike(boss, b.tx, b.ty, 118, b.coeff, b.name, b.stagger, { impulseStrength: 0.5, hitX: b.tx, hitY: b.ty });
        }
      } else if (b.kind === 'boom') {
        // out, then home to the player
        if (!b.back) {
          b.x += Math.cos(b.ang) * b.speed * dt; b.y += Math.sin(b.ang) * b.speed * dt * T;
          if (Math.hypot(b.x - b.sx, (b.y - b.sy) / T) >= b.range) { b.back = true; b.hit = false; }
        } else {
          const ang = Math.atan2((this.y - b.y) / T, this.x - b.x);
          b.x += Math.cos(ang) * b.speed * 1.15 * dt; b.y += Math.sin(ang) * b.speed * 1.15 * dt * T;
          if (Math.hypot(this.x - b.x, (this.y - b.y) / T) < 36) remove = true;
        }
        b.spin = (b.spin || 0) + dt * 28;
        if (!b.hit && boss && boss.hp > 0 && Math.hypot(boss.x - b.x, (boss.y - b.y) / T) < b.r + 64) {
          b.hit = true;
          audio.playSwordSlash(true, 1.2);
          if (window.fx) { window.fx.addSlashRibbon(b.x, b.y - 20, 90, b.spin, b.spin + 2.4, '#7dd3fc', 14, 0.18); window.fx.triggerHitstop(30); }
          this.strike(boss, b.x, b.y, 9999, b.coeff, b.name, b.stagger, { impulseStrength: 0.7, hitX: b.x, hitY: b.y });
        }
        if (b.t > 4) remove = true;
      } else if (b.kind === 'seek') {      // homing missile: a short climb out of the pack, then it curves in and keeps turning onto the boss
        if (b.trail) { b.trail.push({ x: b.x, y: b.y, z: b.z }); if (b.trail.length > 18) b.trail.shift(); }
        let explode = false;
        const pop = b.pop || 0.3;
        if (b.t < pop) {          // pops out of the pack in its own direction, loosely, and hangs for a beat
          const dr = Math.max(0, 1 - dt * 2.4); b.vx *= dr; b.vy *= dr;
          b.x += b.vx * dt; b.y += b.vy * dt * T; b.z += b.vz * dt; b.vz -= 420 * dt;
        } else if (boss && boss.hp > 0) {
          const dx = boss.x - b.x, dy = (boss.y - b.y) / T, d = Math.hypot(dx, dy) || 1;
          const age = b.t - pop, sp = Math.min(1500, 560 + age * 1500), turn = Math.min(1, dt * (5 + age * 16));
          const wob = Math.sin(age * 22 + (b.ph || 0)) * 520 * Math.max(0, 1 - age * 2.4);      // each missile corkscrews in, the weave dying out as it closes
          b.vx += (dx / d * sp - dy / d * wob - b.vx) * turn; b.vy += (dy / d * sp + dx / d * wob - b.vy) * turn;
          b.x += b.vx * dt; b.y += b.vy * dt * T;
          b.z += (46 - b.z) * Math.min(1, dt * 7);
          if (d < 78) explode = true;
        } else if (b.t > 0.9) remove = true;
        if (explode) {
          remove = true;
          if ((b.ph || 0) > 1.5) audio.playImpactBoom(0.6);
          if (window.fx) { if ((b.ph || 0) > 3.14) window.fx.addShockwave(b.x, b.y, 80, '#fb923c', 4, 0.26); window.fx.addImpactStarburst && window.fx.addImpactStarburst(b.x, b.y - 36, '#fde68a', 0.7, 0.16, 10); }
          const dmg = this.strike(boss, b.x, b.y, 9999, b.coeff, b.name, b.stagger, { impulseStrength: 0.4, hitX: b.x, hitY: b.y });
          if (dmg > 0 && b.mark) this.addMarks(b.mark, boss);
        }
        if (b.t > 3.4) remove = true;
      } else {          // pulse / pellet: straight, stops on the boss
        b.x += Math.cos(b.ang) * b.speed * dt; b.y += Math.sin(b.ang) * b.speed * dt * T;
        if (!b.hit && boss && boss.hp > 0 && Math.hypot(boss.x - b.x, (boss.y - b.y) / T) < b.r + 62) {
          b.hit = true; remove = true;
          const dmg = this.strike(boss, b.x, b.y, 9999, b.closeBonus && Math.hypot(boss.x - this.x, (boss.y - this.y) / T) < 200 ? b.coeff * 1.5 : b.coeff, b.name, b.stagger, { impulseStrength: 0.3, hitX: b.x, hitY: b.y });
          if (dmg > 0 && b.heat) this.addHeat(b.heat);
          if (dmg > 0 && b.mark) this.addMarks(b.mark, boss);
          if (window.fx) window.fx.addImpactStarburst && window.fx.addImpactStarburst(b.x, b.y - 24, '#bae6fd', 0.5, 0.14, 10);
        }
        if (b.t >= b.life) remove = true;
      }
      if (remove) this.bolts.splice(i, 1);
    }
  }

  updateSentry(dt, boss) {
    const s = this.sentry;
    if (!s) return;
    s.t -= dt; s.age = (s.age || 0) + dt;
    if (s.t <= 0) { this.sentry = null; return; }
    s.fire -= dt;
    if (s.fire <= 0 && boss && boss.hp > 0 && s.age > 0.4) {
      s.fire = 0.33;
      const ang = Math.atan2((boss.y - s.y) / aTilt(), boss.x - s.x);
      s.ang = ang;
      this.fire({ kind: 'pulse', x: s.x, y: s.y, ang, speed: 1500, life: 0.7, r: 8, coeff: 0.42, name: 'Sentry Drone [W]', stagger: 3, heat: 0, mark: 0.15 });
      audio.playSwordSlash(false, 1.7);
      this.muzzleFlash && null;
    }
  }

  // ----- Damage taken -------------------------------------------------------
  takeDamage(rawAmount, sourceName = 'Attack', impactOpts = null) {
    if (this.isRemote) return;
    const lethal = impactOpts && impactOpts.forceLethal;
    if (this.hIframes > 0 && !lethal) return;
    let amt = rawAmount;
    
    const armored = !!(this.act && ['r', 't', 'f', 'z', 'e'].includes(this.act.kind));
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
        if (this.act && k !== 'x') { this.act = null; this.restoreChargeCamera(); this.jumpZ = 0; if (this.state === 'h_act') this.state = 'idle'; }
        if (this.hp > 0 && !this.canAct() && !this.act) this.state = 'idle';
      }

      if (k === 'space') {
        if (this.act) { this.act = null; this.restoreChargeCamera(); }
        return super.triggerSkill('space', aimX, aimY, boss, fromNetwork);
      }
      if (k === 'x') return this.castX(fromNetwork);
      if (k === 'z') return this.castZ(boss);
      if (k === 't') return this.castT(aimX, aimY, boss);

      // Auto-attack hits are cancelable into any skill once the blow has landed
      if (!fromNetwork && this.isLocal && this.act && this.act.kind !== k && 'qwerasdf'.includes(k) && this.cds[k] <= 0 && this.skillCancelReady()) {
        this.act = null; this.restoreChargeCamera();
        this.jumpZ = 0; this.bodySpinAngle = 0; this.state = 'idle'; this.stateTimer = 0; this.snapFeetToBody();
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

  col() { return this.beamCol(); }

  // =========================================================================
  // X — MODE SWAP
  // =========================================================================
  castX(fromNetwork = false) {
    if (!fromNetwork && (this.cds.x > 0 || (!this.canAct() && !this.act))) return false;
    this.mode = this.mode === 'saber' ? 'beam' : 'saber';
    this.cds.x = this.maxCds.x;
    this.syncT = AL_SYNC_TIME;
    audio.playParryClang && audio.playParryClang(false);
    this.swapFx();
    this.say(this.mode === 'beam' ? 'BEAM' : 'SABER', this.mode === 'beam' ? '#7dd3fc' : '#fde68a', 12);
    return true;
  }

  // =========================================================================
  // AUTO — saber: 3-hit laser combo · beam: rapid pulse shots
  // =========================================================================
  triggerBasicAttack(aimX, aimY, fromNetwork = false) {
    if (this.hp <= 0) return false;
    const beam = this.mode === 'beam';
    const a0 = this.act;
    const chaining = !!(a0 && a0.kind === 'b' && a0.t >= a0.dur * (beam ? 0.7 : 0.6) && (beam || a0.step < 4));
    if (fromNetwork && !chaining && !this.canAct()) { this.act = null; this.state = 'idle'; }
    if (!this.canAct() && !chaining) return false;
    const step = beam ? 1 : (chaining ? a0.step + 1 : ((this.bResetT > 0 && this.bStep < 4) ? this.bStep + 1 : 1));
    this.bStep = step;
    this.bResetT = 1.0;
    this.aimAt(null, aimX, aimY);
    const last = !beam && step === 4;           // blade, blade, blade, then both blades crossed
    const dur = beam ? 0.24 : (last ? 0.72 : 0.4);
    if (chaining) { this.act = null; this.state = 'idle'; }
    this.beginAct('b', dur, { step, hit: false, last, mode: this.mode });
    if (beam) {
      this.muzzle = 0.1;
      // a short, fat burst from the drone-cannon: it only reaches a little way in front of you (semi-melee), not across the arena
      this.fire({ kind: 'pulse', short: true, x: this.x + Math.cos(this.facingAngle) * 34, y: this.y + Math.sin(this.facingAngle) * 34 * aTilt(), ang: this.facingAngle, speed: 1500, life: 0.15, r: 16, coeff: 0.7, name: 'Basic Pulse Shot', stagger: 4, heat: 1.6, mark: 0.34 });
      audio.playSwordSlash(false, 1.8);
      this.attackStepVx = 0; this.attackStepVy = 0;
      this.act.hit = true;
      return true;
    }
    const dir = { x: Math.cos(this.facingAngle), y: Math.sin(this.facingAngle) * aTilt() };
    const burst = last ? 230 : 160;
    this.attackStepVx = dir.x * burst; this.attackStepVy = dir.y * burst;
    audio.playSwordSlash(last, last ? 1.3 : 1.05);
    this.lungeFootForward(step % 2 ? this.leftFoot : this.rightFoot, 16, step % 2 ? -this.hipWidth - 2 : this.hipWidth + 2, 0.14);
    return true;
  }

  act_b(dt, boss, a) {
    const p = aClamp01(a.t / a.dur);
    if (a.mode === 'beam') { if (a.t >= a.dur) this.endAct(); return; }
    this.bodySpinAngle = (a.step % 2 ? -1 : 1) * 0.4 * Math.sin(p * Math.PI) + (a.last ? aEaseOut(aClamp01((p - 0.1) / 0.55)) * Math.PI * 2 : 0);
    if (a.last) this.jumpZ = Math.sin(aClamp01(p / 0.75) * Math.PI) * 10;
    const hitAt = a.last ? 0.46 : 0.4;
    if (!a.hit && p >= hitAt) {
      a.hit = true;
      const cx = this.x + Math.cos(this.facingAngle) * 70, cy = this.y + Math.sin(this.facingAngle) * 70 * aTilt();
      const col = this.col();
      if (window.fx) {
        // short wrist-blades: tight arcs, the left and right blade taking turns; the finisher is a big X from both
        const sd = a.step % 2 ? 1 : -1, f0 = this.facingAngle;
        if (a.last) {
          window.fx.addSlashRibbon(this.x, this.y - 20, 112, f0 + 1.1, f0 - 1.1, col, 22, 0.24);
          window.fx.addSlashRibbon(this.x, this.y - 20, 112, f0 - 1.1, f0 + 1.1, '#ffffff', 10, 0.24);
        } else {
          window.fx.addSlashRibbon(this.x, this.y - 20, 88, f0 + sd * 1.25, f0 - sd * 1.25, col, 15, 0.2);
          window.fx.addSlashRibbon(this.x, this.y - 20, 72, f0 + sd * 1.1, f0 - sd * 1.1, '#ffffff', 5, 0.14);
        }
        window.fx.triggerHitstop(a.last ? 55 : 22);
        window.fx.triggerShake(a.last ? 8 : 4, 0.14);
      }
      audio.playImpactBoom(a.last ? 0.9 : 0.6);
      const dmg = this.strike(boss, cx, cy, a.last ? 140 : 118, [0, 0.7, 0.7, 0.8, 1.8][a.step], `Basic Laser Combo ${a.step}`, a.last ? 22 : 8, { isStrongMove: a.last, impulseStrength: a.last ? 1.1 : 0.65 });
      if (dmg > 0) { this.addHeat(a.last ? 6 : 3); if (a.last) this.addMarks(1, boss); }
    }
    if (p >= 1) { this.bodySpinAngle = 0; this.jumpZ = 0; this.endAct(); }
  }

  // =========================================================================
  // Q — CROSS SLASH (blades) / LANCE SHOT (beam)
  // =========================================================================
  castQ(ax, ay, boss) {
    this.cds.q = this.maxCds.q;
    this.aimAt(boss, ax, ay);
    if (this.mode === 'beam') {
      this.beginAct('q', 0.95, { fired: false, ang: this.facingAngle });
      audio.playSwordSlash(true, 0.8);
      return true;
    }
    // reach: close in on whatever is along the aim line (still aimed by the mouse, only the distance adapts)
    const T = aTilt(), mw = this.mouseWorld();
    let lunge = 90;
    if (boss && boss.hp > 0) {
      const dx = boss.x - this.x, dy = (boss.y - this.y) / T, ca = Math.cos(this.facingAngle), sa = Math.sin(this.facingAngle);
      const along = dx * ca + dy * sa, side = Math.abs(-dx * sa + dy * ca);
      if (along > 60 && along < 420 && side < 110) lunge = Math.max(60, Math.min(260, along - 92));
    }
    this.beginAct('q', 0.62, { hit1: false, hit2: false, ang: this.facingAngle, sx: this.x, sy: this.y, lunge });
    this.hIframes = Math.max(this.hIframes, 0.18);
    audio.playSwordSlash(true, 1.1);
    this.addHeat(10);
    return true;
  }

  act_q(dt, boss, a) {
    const p = aClamp01(a.t / a.dur), col = this.col();
    if (a.mode === 'beam') {
      this.facingAngle = a.ang;
      if (!a.fired) {
        if (window.fx && Math.random() < dt * 40) { const an = Math.random() * 6.28; window.fx.addDragSparks(this.x + Math.cos(an) * 60, this.y - 40 + Math.sin(an) * 30, an + Math.PI, 1, false, '#bae6fd'); }
        if (a.t >= 0.45) {
          a.fired = true;
          const x0 = this.x + Math.cos(a.ang) * 30, y0 = this.y + Math.sin(a.ang) * 30 * aTilt();
          this.addBeamFx(x0, y0 - 38, a.ang, 760, 26, 0.35);
          audio.playImpactBoom(1.4); audio.playSwordSlash(true, 1.8);
          if (window.fx) { window.fx.triggerShake(10, 0.2); window.fx.triggerHitstop(40); window.fx.addShockwave(x0, y0, 90, col, 5, 0.3); }
          this.attackStepVx = -Math.cos(a.ang) * 120; this.attackStepVy = -Math.sin(a.ang) * 120 * aTilt();
          const dmg = this.beamHit(boss, x0, y0, a.ang, 760, 34, 2.8, 'Lance Shot [Q]', 28, { isStrongMove: true, impulseStrength: 1.3, head: true });
          this.addHeat(dmg > 0 ? 14 : 8);
          if (dmg > 0) this.addMarks(2, boss);          // the lance LOCKS the target twice over
          this.addScorch(x0, y0, a.ang, 760);
        }
      }
      if (p >= 1) this.endAct();
      return;
    }
    // CROSS SLASH: thrusters lunge you in, the left blade cuts one diagonal, the right blade the other, and the X flies on ahead
    this.facingAngle = a.ang;
    const T = aTilt();
    if (a.t < 0.16) {       // the lunge
      const s = aEaseOut(a.t / 0.16);
      this.x = a.sx + Math.cos(a.ang) * a.lunge * s; this.y = a.sy + Math.sin(a.ang) * a.lunge * s * T;
      this.targetX = this.x; this.targetY = this.y;
      if (window.fx && Math.random() < dt * 60) aAfter(this.x, this.y, a.ang, col);
    }
    const cut = (n, sd) => {
      audio.playImpactBoom(0.8); audio.playSwordSlash(true, 1.3 + n * 0.2);
      if (window.fx) {
        window.fx.addSlashRibbon(this.x, this.y - 22, 100, a.ang + sd * 1.1, a.ang - sd * 1.1, n === 2 ? '#ffffff' : col, 16, 0.22);
        window.fx.triggerHitstop(30); window.fx.triggerShake(6, 0.15);
      }
      const cx = this.x + Math.cos(a.ang) * 72, cy = this.y + Math.sin(a.ang) * 72 * T;
      const dmg = this.strike(boss, cx, cy, 138, 1.15, `Cross Slash ${n} [Q]`, 12, { impulseStrength: 0.7, head: true });
      if (dmg > 0) { this.addHeat(3); this.addMarks(1, boss); }
    };
    if (!a.hit1 && a.t >= 0.18) { a.hit1 = true; cut(1, 1); }
    if (!a.hit2 && a.t >= 0.31) {
      a.hit2 = true; cut(2, -1);
      if (window.fx) { window.fx.addSlashRibbon(this.x, this.y - 22, 110, a.ang - 1.1, a.ang + 1.1, '#ffffff', 10, 0.2); window.fx.addShockwave(this.x + Math.cos(a.ang) * 60, this.y + Math.sin(a.ang) * 60 * T, 100, col, 5, 0.3); }
    }
    if (p >= 1) this.endAct();
  }

  // =========================================================================
  // W — WING RUSH (blades) / SENTRY DRONE (beam)
  // =========================================================================
  castW(ax, ay, boss) {
    this.cds.w = this.maxCds.w;
    this.aimAt(boss, ax, ay);
    if (this.mode === 'beam') {
      // LOCK-ON STRIKE: needs a boss to lock onto
      if (!boss || boss.hp <= 0) { this.cds.w = 0; this.say('No target to lock', '#fca5a5', 12); return false; }
      this.beginAct('w', 2.1, { boss, n: 0, total: 12, nextT: 0.95, locked: false });
      this.saveCamera();
      this.addHeat(10);
      audio.playParryClang && audio.playParryClang(false);
      return true;
    }
    // WING RUSH carries you THROUGH the target to the far side (mouse-aimed; only the distance adapts when the boss is on the line)
    const Tw = aTilt();
    let dist = 270;
    if (boss && boss.hp > 0) {
      const dx = boss.x - this.x, dy = (boss.y - this.y) / Tw, ca = Math.cos(this.facingAngle), sa = Math.sin(this.facingAngle);
      const along = dx * ca + dy * sa, side = Math.abs(-dx * sa + dy * ca);
      if (along > 40 && along < 380 && side < 110) dist = Math.max(220, Math.min(430, along + 120));
    }
    this.beginAct('w', 0.46, { fired: false, sx: this.x, sy: this.y, ang: this.facingAngle, dist });
    this.hIframes = Math.max(this.hIframes, 0.34);
    audio.playSwordSlash(true, 1.5);
    this.addHeat(8);
    return true;
  }

  act_w(dt, boss, a) {
    const T = aTilt(), col = this.col();
    if (a.mode === 'beam') {
      // 0 - 0.75: the scouter locks on (reticle closes in, slight zoom) · 0.95 - 1.5: six homing missiles leave the backpack
      const bs = (a.boss && a.boss.hp > 0) ? a.boss : (boss && boss.hp > 0 ? boss : null);
      if (!bs) { this.restoreChargeCamera(); this.endAct(); return; }
      this.facingAngle = Math.atan2((bs.y - this.y) / T, bs.x - this.x);
      this.speed = 0; this.vx = 0; this.vy = 0;
      const cam = this.isLocal && window.game ? window.game.camera : null;
      const saved = this._chargeSavedZoom || 1.05;
      if (cam) cam.targetZoom = Math.min(1.32, saved + 0.14 * aEaseOut(a.t / 0.6)) - (a.t > 1.6 ? 0.14 * aClamp01((a.t - 1.6) / 0.35) : 0);
      if (!a.locked && a.t >= 0.75) {
        a.locked = true;
        audio.playImpactBoom(0.9); audio.playParryClang && audio.playParryClang(true);
        if (window.fx) { window.fx.addShockwave(bs.x, bs.y, 120, '#ef4444', 5, 0.4); window.fx.triggerShake(6, 0.15); }
        this.say('LOCKED', '#fca5a5', 14);
      }
      if (a.t < 0.75 && Math.random() < dt * 14) audio.playQteKeySound && audio.playQteKeySound(true, 1 + Math.floor(a.t * 6));   // lock-on beeps
      while (a.n < a.total && a.t >= a.nextT) {
        a.n++; a.nextT += 0.032; a.fired = true;
        const side = a.n % 2 ? 1 : -1, ca = Math.cos(this.facingAngle), sa = Math.sin(this.facingAngle);
        // pop out of the backpack tubes in a rough spray (each its own direction and height), then they ALL swing onto the boss together
        const sa2 = Math.random() * Math.PI * 2, sps = 240 + Math.random() * 260;
        this.fire({ kind: 'seek', x: this.x - ca * 8 + side * 8, y: this.y - sa * 8 * T, z: 64, vx: Math.cos(sa2) * sps - ca * 60, vy: Math.sin(sa2) * sps - sa * 60, vz: 240 + Math.random() * 260, pop: 0.78 - (a.n - 1) * 0.032 + (Math.random() - 0.5) * 0.08, ph: Math.random() * 6.28, r: 14, coeff: 0.425, name: 'Lock-On Strike [W]', stagger: 4, mark: 0.15, trail: [] });
        if (a.n % 2) { audio.playSwordSlash(false, 1.2 + a.n * 0.03); audio.playImpactBoom(0.4); }
        if (window.fx) { window.fx.addDragSparks(this.x - ca * 8 + side * 8, this.y - 64, -Math.PI / 2 + side * 0.5, 3, false, '#fde68a'); window.fx.addDragSparks(this.x - ca * 8 + side * 8, this.y - 60, sa2, 2, false, '#fb923c'); if (a.n === 1) window.fx.triggerShake(7, 0.2); if (a.n % 4 === 1) window.fx.addShockwave(this.x - ca * 8, this.y - 6, 60, '#fdba74', 3, 0.25); }
      }
      if (a.t >= a.dur) { this.restoreChargeCamera(); this.endAct(); }
      return;
    }
    // WING RUSH: the wings flare, you shoot along the aim line, the left blade cuts as you pass and the right blade as you land
    const D = a.dist || 270;
    const s = aEaseOut(a.t / 0.2);
    this.x = a.sx + Math.cos(a.ang) * D * s; this.y = a.sy + Math.sin(a.ang) * D * s * T;
    this.targetX = this.x; this.targetY = this.y;
    this.hIframes = Math.max(this.hIframes, 0.08);
    if (window.fx && Math.random() < dt * 70) aAfter(this.x, this.y, this.facingAngle, col);
    if (!a.cut1 && a.t >= 0.1) {
      a.cut1 = true;
      audio.playSwordSlash(true, 1.6);
      if (window.fx) { window.fx.addSlashRibbon(this.x, this.y - 22, 96, a.ang + 1.2, a.ang - 1.2, col, 16, 0.2); window.fx.triggerHitstop(24); }
      const dmg = this.beamHit(boss, a.sx, a.sy, a.ang, D * 0.6 + 70, 54, 1.0, 'Wing Rush 1 [W]', 9, { impulseStrength: 0.7, head: true });
      if (dmg > 0) { this.addHeat(2); this.addMarks(1, boss); }
    }
    if (!a.fired && a.t >= 0.2) {
      a.fired = true;
      audio.playImpactBoom(1.0); audio.playSwordSlash(true, 1.4);
      if (window.fx) { window.fx.addSlashRibbon(this.x, this.y - 22, 104, a.ang - 1.2, a.ang + 1.2, '#ffffff', 16, 0.24); window.fx.triggerHitstop(40); window.fx.addShockwave(this.x, this.y, 110, col, 5, 0.3); }
      const dmg = this.beamHit(boss, a.sx, a.sy, a.ang, D + 70, 54, 1.2, 'Wing Rush 2 [W]', 14, { isStrongMove: false, impulseStrength: 0.9, head: true });
      if (dmg > 0) { this.addHeat(3); this.addMarks(1, boss); }
      this.facingAngle = a.ang + Math.PI;        // you land on the far side already turned back on it, ready for the cyclone
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // E — ROTOR CYCLONE (blades) / SWEEP LASER (beam)
  // =========================================================================
  castE(ax, ay, boss) {
    this.cds.e = this.maxCds.e;
    this.aimAt(boss, ax, ay);
    if (this.mode === 'beam') {
      this.beginAct('e', 1.45, { ang: this.facingAngle, ticks: 0, tick: 0.2 });
      this.saveCamera();
      audio.playSwordSlash(true, 0.8);
      this.addHeat(14);
      return true;
    }
    this.beginAct('e', 1.35, { ticks: 0, tick: 0.12, finished: false, ang: this.facingAngle });
    this.saveCamera();
    audio.playSwordSlash(true, 1.0);
    this.addHeat(14);
    return true;
  }

  act_e(dt, boss, a) {
    const T = aTilt(), col = this.col();
    if (a.mode === 'beam') {
      const sw = aClamp01((a.t - 0.2) / 1.0);
      const ang = a.ang - 0.95 + sw * 1.9;
      this.facingAngle = ang;
      if (a.t >= 0.2 && a.t < 1.2) {
        a.tick -= dt;
        if (a.tick <= 0) {
          a.tick = 0.1; a.ticks++;
          const x0 = this.x + Math.cos(ang) * 26, y0 = this.y + Math.sin(ang) * 26 * T;
          this.addBeamFx(x0, y0 - 38, ang, 640, 16, 0.14);
          if (a.ticks % 3 === 1) audio.playSwordSlash(false, 1.6);
          const dmg = this.beamHit(boss, x0, y0, ang, 640, 30, 0.46, 'Sweep Laser [E]', 4, { impulseStrength: 0.2 });
          if (dmg > 0) { this.addHeat(1.2); this.addMarks(0.14, boss); }
          if (a.ticks % 2 === 1) this.addScorch(x0, y0, ang, 600);
        }
        if (window.fx && Math.random() < dt * 30) window.fx.addDragSparks(this.x + Math.cos(ang) * 300, this.y + Math.sin(ang) * 300 * T, ang + Math.PI, 1, false, '#bae6fd');
      }
      if (a.t >= a.dur) { this.restoreChargeCamera(); this.endAct(); }
      return;
    }
    // ROTOR CYCLONE: lift off on the thrusters and spin both blades flat like a rotor, then slam down leaving a ring of plasma
    const spinDur = 0.95;
    if (a.t < spinDur) {
      const lift = aEaseOut(a.t / 0.2);
      this.jumpZ = lift * 22 + Math.sin(a.t * 14) * 1.5;
      this.bodySpinAngle = a.t * 34;
      this.hIframes = 0;
      const cam = this.isLocal && window.game ? window.game.camera : null;
      if (cam && this._chargeSavedZoom) cam.targetZoom = Math.min(1.2, this._chargeSavedZoom + Math.min(0.08, a.t * 0.1));
      a.tick -= dt;
      if (window.fx) {
        if (Math.random() < dt * 14) { const an = Math.random() * Math.PI * 2; window.fx.addSlashRibbon(this.x, this.y - 30, 100 + Math.random() * 40, an, an + 1.6, Math.random() < 0.3 ? '#ffffff' : col, 12, 0.14); }
        if (Math.random() < dt * 40) window.fx.addDragSparks(this.x + (Math.random() - 0.5) * 30, this.y + 6, Math.PI / 2, 1, false, col);   // thruster wash
      }
      if (a.tick <= 0) {
        a.tick = 0.13; a.ticks++;
        if (a.ticks % 3 === 1) audio.playSwordSlash(a.ticks % 2 === 0, 1.2 + (a.ticks % 4) * 0.06);
        const dmg = this.strike(boss, this.x, this.y, 175, 0.55, 'Rotor Cyclone [E]', 5, { impulseStrength: 0.25, hitX: this.x, hitY: this.y });
        if (dmg > 0) this.addHeat(1.2);
      }
    } else if (!a.finished) {
      a.finished = true; this.bodySpinAngle = 0; this.jumpZ = 0; this.snapFeetToBody();
      audio.playImpactBoom(1.4); audio.playSwordPlant();
      if (window.fx) {
        window.fx.triggerHitstop(70); window.fx.triggerShake(12, 0.25);
        window.fx.addShockwave(this.x, this.y, 230, col, 8, 0.4); window.fx.addShockwave(this.x, this.y, 140, '#ffffff', 4, 0.28);
        window.fx.addPillar(this.x, this.y, 50, col, 0.5);
      }
      this.addVfx({ kind: 'plasma', x: this.x, y: this.y, r: 150, dur: 2.2, tick: 0.5 });
      const dmg = this.strike(boss, this.x, this.y, 215, 1.8, 'Rotor Cyclone Slam [E]', 30, { isStrongMove: true, impulseStrength: 1.2, hitX: this.x, hitY: this.y, head: true });
      if (dmg > 0) { this.addHeat(4); this.addMarks(2, boss); }
    }
    if (a.t >= a.dur) { this.bodySpinAngle = 0; this.jumpZ = 0; this.restoreChargeCamera(); this.endAct(); }
  }

  // =========================================================================
  // R — ZENITH DIVE (blades) / MISSILE BARRAGE (beam)
  // =========================================================================
  castR(ax, ay, boss) {
    this.cds.r = this.maxCds.r;
    this.aimAt(boss, ax, ay);
    const T = aTilt();
    if (this.mode === 'beam') {
      // CONVERGENCE BEAM: every Lock on the boss adds 10% to the focused burst; it does NOT use them up ([F] Overcharge is the eraser)
      const mk = this.marks | 0;
      if (mk > 0) { this.markT = 0; if (this.isLocal) this.say(`LOCK-ON x${mk}: CONVERGENCE +${mk * 10}%`, '#fdba74', 13); }
      this.beginAct('r', 1.85, { ang: this.facingAngle, mk, fired: false, tick: 0.1, ticks: 0 });
      this.saveCamera();
      this.addHeat(16);
      audio.playSwordSlash(true, 0.8);
      audio.playImpactBoom(0.8);
      return true;
    }
    let tx = ax, ty = ay;
    const d = Math.hypot(tx - this.x, (ty - this.y) / T);
    if (d > 430) { tx = this.x + (tx - this.x) * 430 / d; ty = this.y + (ty - this.y) * 430 / d; }
    this.beginAct('r', 1.5, { phase: 'rise', phaseT: 0, sx: this.x, sy: this.y, tx, ty });
    this.hIframes = Math.max(this.hIframes, 0.3);
    this.saveCamera();
    this.addHeat(16);
    audio.playSwordSlash(true, 1.2);
    return true;
  }

  act_r(dt, boss, a) {
    const T = aTilt(), col = this.col();
    if (a.mode === 'beam') {
      // 0 - 0.5 charge (the pods open, a lens ring collapses onto the focal point) · 0.5 - 1.15 five lasers fan in from the shoulders,
      // wings and cannon and sweep together · 1.15 they merge into ONE focused beam (the burst) · then recovery
      const mw = this.mouseWorld();
      const T2 = aTilt();
      let fx0 = mw.x, fy0 = mw.y;
      const dd = Math.hypot(fx0 - this.x, (fy0 - this.y) / T2);
      if (dd > 760) { fx0 = this.x + (fx0 - this.x) * 760 / dd; fy0 = this.y + (fy0 - this.y) * 760 / dd; }
      else if (dd < 180) { fx0 = this.x + Math.cos(a.ang) * 180; fy0 = this.y + Math.sin(a.ang) * 180 * T2; }
      if (a.t < 1.15) { a.fx = aLerp(a.fx === undefined ? fx0 : a.fx, fx0, Math.min(1, dt * 5)); a.fy = aLerp(a.fy === undefined ? fy0 : a.fy, fy0, Math.min(1, dt * 5)); }
      this.facingAngle = Math.atan2((a.fy - this.y) / T2, a.fx - this.x);
      this.speed = 0; this.vx = 0; this.vy = 0;
      const cam = this.isLocal && window.game ? window.game.camera : null, saved = this._chargeSavedZoom || 1.05;
      if (cam) cam.targetZoom = Math.min(1.3, saved + 0.1 * aEaseOut(a.t / 0.5)) - (a.t > 1.5 ? 0.1 * aClamp01((a.t - 1.5) / 0.3) : 0);
      // five emitters: [offset x, height]
      const EM = [[-15, 62], [15, 62], [-36, 74], [36, 74], [0, 40]];
      if (a.t < 0.5) {
        const c = a.t / 0.5;
        if (window.fx && Math.random() < dt * (30 + c * 70)) { const an = Math.random() * 6.28, r = 90 * (1 - c) + 10; window.fx.addDragSparks(a.fx + Math.cos(an) * r, a.fy + Math.sin(an) * r * T2, an + Math.PI, 1, false, '#fdba74'); }
      } else if (a.t < 1.15) {
        a.tick -= dt;
        if (a.tick <= 0) {
          a.tick = 0.1; a.ticks++;
          const k = aEaseOut((a.t - 0.5) / 0.65);
          if (a.ticks % 3 === 1) audio.playSwordSlash(false, 1.4 + k * 0.5);
          let hitDone = false;
          for (let i = 0; i < EM.length; i++) {
            const ex = this.x + EM[i][0], ey = this.y, sy = this.y - EM[i][1];
            const want = Math.atan2((a.fy - ey) / T2, a.fx - ex);
            const off = (i - 2) * 0.34 * (1 - k);                // the fan closes as it converges
            const ang = want + off;
            const len = Math.hypot(a.fx - ex, (a.fy - ey) / T2) + 40;
            // drawn from the emitter (high on the body) DOWN onto the focal point so the five lines truly meet
            const sdx = a.fx - ex, sdy = (a.fy - 30) - sy, angV = Math.atan2(sdy / T2, sdx) + off, lenV = Math.hypot(sdx, sdy / T2) + 24;
            this.addBeamFx(ex, sy, angV, lenV, 10 + k * 8, 0.13, i === 4 ? '#ffffff' : this.col());
            // ONE damage event per tick (the five lasers used to fire five separate hits, each with sparks/numbers/sound = the lag)
            if (!hitDone) {
              const dmg = this.beamHit(boss, ex, ey, ang, len, 22 + 20 * (1 - k), 0.72, 'Convergence Beam [R]', 12, { impulseStrength: 0.15 });
              if (dmg > 0) { hitDone = true; this.addHeat(2); }
            }
          }
        }
      } else if (!a.fired) {
        a.fired = true;
        const ex = this.x + 0, ey = this.y, sy = this.y - 40, ang = Math.atan2((a.fy - ey) / T2, a.fx - ex), len = Math.hypot(a.fx - ex, (a.fy - ey) / T2) + 60;
        audio.playImpactBoom(1.8); audio.playSwordSlash(true, 1.8);
        this.addBeamFx(ex, sy, ang, len, 96, 0.35, '#ffffff');
        this.addBeamFx(ex, sy, ang, len, 56, 0.45, this.col());
        this.addScorch && this.addScorch(ex, ey, ang, len);
        if (window.fx) {
          window.fx.triggerHitstop(50); window.fx.triggerShake(16, 0.35); window.fx.triggerZoomPunch(0.07);
          if (this.isLocal) window.fx.triggerImpactFrame(this.col(), 0.1);
          window.fx.addShockwave(a.fx, a.fy, 260, '#ffffff', 8, 0.4); window.fx.addPillar(a.fx, a.fy, 60, this.col(), 0.6);
          for (let i = 0; i < 4; i++) { const an2 = i / 4 * Math.PI * 2 + 0.4; window.fx.addFissureLine(a.fx, a.fy, a.fx + Math.cos(an2) * 190, a.fy + Math.sin(an2) * 190 * T2, this.col(), 5); }
        }
        // the focus: a heavy hit on the beam line AND a blast at the focal point
        const d1 = this.beamHit(boss, ex, ey, ang, len, 60, 2.0 * (1 + 0.10 * a.mk), 'Convergence Burst [R]', 40, { isStrongMove: true, impulseStrength: 1.4, head: true });
        const d2 = this.strike(boss, a.fx, a.fy, 190, 1.2 * (1 + 0.10 * a.mk), 'Convergence Blast [R]', 20, { isStrongMove: true, impulseStrength: 1.0, hitX: a.fx, hitY: a.fy });
        if (d1 > 0 || d2 > 0) this.addHeat(4);
      }
      if (a.t >= a.dur) { this.restoreChargeCamera(); this.endAct(); }
      return;
    }
    a.phaseT += dt;
    const cam = this.isLocal && window.game ? window.game.camera : null;
    if (a.phase === 'rise') {            // a high leap toward the cursor, untouchable the whole way
      // blast off, hang over the target for a beat, then dive onto it
      const u = aClamp01(a.phaseT / 0.6), s = aEaseOut(aClamp01(u * 1.15));
      this.x = aLerp(a.sx, a.tx, s); this.y = aLerp(a.sy, a.ty, s);
      this.targetX = this.x; this.targetY = this.y;
      this.jumpZ = u < 0.4 ? aEaseOut(u / 0.4) * 135 : 135 * (1 - aEaseIn((u - 0.4) / 0.6));
      this.bodySpinAngle = 0;
      if (window.fx && u > 0.4 && Math.random() < dt * 50) window.fx.addDragSparks(this.x, this.y - this.jumpZ, -Math.PI / 2, 1, false, '#e0f2fe');   // thrusters pushing it down
      this.hIframes = Math.max(this.hIframes, 0.1);
      if (cam && this._chargeSavedZoom) cam.targetZoom = Math.min(1.22, this._chargeSavedZoom + s * 0.12);
      if (window.fx && Math.random() < dt * 60) aAfter(this.x, this.y - this.jumpZ * 0.4, this.facingAngle, col);
      if (a.phaseT >= 0.6) { a.phase = 'slam'; a.phaseT = 0; this.jumpZ = 0; this.bodySpinAngle = 0; this.snapFeetToBody(); this.hIframes = Math.max(this.hIframes, 0.25);
        audio.playImpactBoom(1.9); audio.playSwordPlant();
        // a colossal blade of light drives down at the landing point
        this.addBeamFx(this.x, this.y, -Math.PI / 2, 360, 70, 0.4, '#ffffff');
        this.addBeamFx(this.x, this.y, -Math.PI / 2, 360, 40, 0.5, col);
        if (window.fx) {
          window.fx.triggerHitstop(110); window.fx.triggerShake(24, 0.5); window.fx.triggerZoomPunch(0.09);
          if (this.isLocal) window.fx.triggerImpactFrame(col, 0.14);
          window.fx.addShockwave(this.x, this.y, 300, col, 10, 0.55); window.fx.addShockwave(this.x, this.y, 180, '#ffffff', 6, 0.4);
          window.fx.addPillar(this.x, this.y, 70, col, 0.8); window.fx.spawnMassiveEarthChunks(this.x, this.y, 10, '#475569');
          for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2; window.fx.addFissureLine(this.x, this.y, this.x + Math.cos(an) * 220, this.y + Math.sin(an) * 220 * T, col, 5); }
        }
        // the dive detonates every Mark on the boss: +20% damage each, and a ring of blasts per mark
        const mk = this.marks | 0;
        if (mk > 0 && boss) {
          this.marks = 0; this.markT = 0;
          audio.playImpactBoom(1.5 + mk * 0.1);
          if (window.fx) for (let i = 0; i < mk; i++) { const an = i / mk * Math.PI * 2 + 0.4; window.fx.addShockwave(boss.x + Math.cos(an) * 60, boss.y + Math.sin(an) * 60 * T, 90 + i * 14, '#ffffff', 4, 0.35); window.fx.addImpactStarburst && window.fx.addImpactStarburst(boss.x + Math.cos(an) * 60, boss.y - 30, '#e0f2fe', 0.9, 0.2, 14); }
          if (this.isLocal) this.say(`MARK BURST x${mk}`, '#e0f2fe', 14);
        }
        const dmg = this.strike(boss, this.x, this.y, 205, 3.4 * (1 + 0.2 * mk), mk ? `Zenith Dive + ${mk} Marks [R]` : 'Zenith Dive [R]', 55, { isStrongMove: true, impulseStrength: 1.8, hitX: this.x, hitY: this.y, head: true });
        if (dmg > 0) this.addHeat(8);
      }
    } else if (a.t >= a.dur - 0.2) { this.restoreChargeCamera(); this.endAct(); }
  }

  // =========================================================================
  // A — BOOST DASH
  // =========================================================================
  castA(ax, ay, boss) {
    this.cds.a = this.maxCds.a;
    this.aimAt(boss, ax, ay);
    this.beginAct('a', 0.36, { sx: this.x, sy: this.y, ang: this.facingAngle });
    this.hIframes = Math.max(this.hIframes, 0.3);
    this.addHeat(3);
    if (this.mode === 'beam' && !this.isRemote) { this.shield = Math.min(this.maxHp * 0.3, (this.shield || 0) + Math.round(this.maxHp * 0.06)); }
    audio.playSwordSlash(false, 1.8);
    return true;
  }

  act_a(dt, boss, a) {
    const D = 220, s = aEaseOut(a.t / 0.2);
    this.x = a.sx + Math.cos(a.ang) * D * s; this.y = a.sy + Math.sin(a.ang) * D * s * aTilt();
    this.targetX = this.x; this.targetY = this.y;
    this.hIframes = Math.max(this.hIframes, 0.06);
    // a thruster flip: you tumble through the dash in Saber mode, skid in low in Beam mode
    if (a.mode === 'beam') this.jumpZ = Math.sin(aClamp01(a.t / 0.3) * Math.PI) * 6;
    else { this.bodySpinAngle = aEaseOut(a.t / 0.3) * Math.PI * 2; this.jumpZ = Math.sin(aClamp01(a.t / 0.3) * Math.PI) * 26; }
    if (a.t >= a.dur - 0.02) { this.bodySpinAngle = 0; this.jumpZ = 0; }
    if (window.fx && a.t < 0.22 && Math.random() < dt * 80) aAfter(this.x, this.y, this.facingAngle, this.col());
    if (window.fx && a.t < 0.2 && Math.random() < dt * 50) window.fx.addDragSparks(this.x, this.y - 10, a.ang + Math.PI, 2, false, '#bae6fd');
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // S — TETHER PULL (saber) / SCATTER SHOT (beam)
  // =========================================================================
  castS(ax, ay, boss) {
    this.cds.s = this.maxCds.s;
    this.aimAt(boss, ax, ay);
    if (this.mode === 'beam') {
      this.beginAct('s', 0.6, { fired: false, ang: this.facingAngle });
      audio.playSwordSlash(true, 0.9);
      this.addHeat(10);
      return true;
    }
    this.beginAct('s', 0.5, { fired: false, ang: this.facingAngle });
    audio.playSwordSlash(false, 1.2);
    this.addHeat(8);
    return true;
  }

  act_s(dt, boss, a) {
    const T = aTilt(), col = this.col();
    if (a.mode === 'beam') {
      this.facingAngle = a.ang;
      if (!a.fired && a.t >= 0.2) {
        a.fired = true;
        const x0 = this.x + Math.cos(a.ang) * 30, y0 = this.y + Math.sin(a.ang) * 30 * T;
        for (let i = 0; i < 7; i++) {
          const ang = a.ang + (i - 3) * 0.09;
          this.fire({ kind: 'pulse', x: x0, y: y0, ang, speed: 1300, life: 0.3, r: 10, coeff: 0.6, name: 'Scatter Shot [S]', stagger: 5, closeBonus: true, heat: 0.8, mark: 0.3 });
        }
        this.muzzle = 0.14;
        audio.playImpactBoom(1.1); audio.playSwordSlash(true, 1.9);
        this.attackStepVx = -Math.cos(a.ang) * 150; this.attackStepVy = -Math.sin(a.ang) * 150 * T;
        if (window.fx) { window.fx.triggerShake(8, 0.15); window.fx.addDragSparks(x0, y0 - 38, a.ang, 10, false, '#fde68a'); window.fx.addShockwave(x0, y0, 60, '#fde68a', 4, 0.2); }
      }
      if (a.t >= a.dur) this.endAct();
      return;
    }
    // CRESCENT WAVE: cross both blades in front of you, then throw them apart: a wide crescent of light races out along the floor.
    // It is the ranged way to feed the Marks while you set up the next chain.
    this.facingAngle = a.ang;
    this.hIframes = Math.max(this.hIframes, 0.1);
    if (!a.fired && a.t >= 0.2) {
      a.fired = true;
      const x0 = this.x + Math.cos(a.ang) * 40, y0 = this.y + Math.sin(a.ang) * 40 * T;
      this.fire({ kind: 'pulse', crescent: true, x: x0, y: y0, ang: a.ang, speed: 1050, life: 0.8, r: 62, coeff: 1.7, name: 'Crescent Wave [S]', stagger: 14, heat: 3, mark: 1 });
      audio.playImpactBoom(1.1); audio.playSwordSlash(true, 1.7);
      this.attackStepVx = Math.cos(a.ang) * 60; this.attackStepVy = Math.sin(a.ang) * 60 * T;
      if (window.fx) {
        window.fx.addSlashRibbon(this.x, this.y - 22, 110, a.ang + 1.3, a.ang - 1.3, col, 20, 0.24);
        window.fx.addSlashRibbon(this.x, this.y - 22, 110, a.ang - 1.3, a.ang + 1.3, '#ffffff', 8, 0.24);
        window.fx.triggerShake(8, 0.16); window.fx.addShockwave(x0, y0, 80, col, 5, 0.3);
      }
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // D — PHOTON PARRY (counter)
  // =========================================================================
  castD(ax, ay, boss) {
    this.cds.d = this.maxCds.d;
    this.aimAt(boss, ax, ay);
    const a = this.beginAct('d', 0.55, { hit: false, countered: false });
    audio.playSwordSlash(false, 1.2);
    this.lungeFootForward(this.rightFoot, -10, this.hipWidth + 4, 0.14);
    if (boss && typeof boss.isCounterable === 'function' && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 215) this.doRiposte(boss, a);
    return true;
  }

  doRiposte(boss, a) {
    if (a.countered) return;
    a.countered = true; a.hit = true;
    this.executeBreakerCounterSuccess(boss);
    if (!this.isRemote) {
      this.shield = Math.min(this.maxHp * 0.3, (this.shield || 0) + Math.round(this.maxHp * 0.1));
      this.addHeat(10);       // a clean parry feeds the Solar charge
    }
    this.say('⚡ PARRY!', '#7dd3fc', 14);
    if (window.fx) { window.fx.addShockwave(this.x, this.y, 150, '#38bdf8', 6, 0.4); window.fx.addDragSparks(this.x, this.y - 30, -Math.PI / 2, 10, false, '#e0f2fe'); }
  }

  act_d(dt, boss, a) {
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    if (a.t > 0.1 && a.t < 0.26) { this.attackStepVx = cosA * 130; this.attackStepVy = sinA * 130 * aTilt(); }
    if (!a.hit && a.t >= 0.26) {
      a.hit = true;
      if (boss && typeof boss.isCounterable === 'function' && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 215) {
        a.hit = false; this.doRiposte(boss, a);
      } else {
        const cx = this.x + cosA * 64, cy = this.y + sinA * 64 * aTilt();
        if (window.fx) window.fx.addSlashRibbon(this.x, this.y, 118, this.facingAngle - 0.5, this.facingAngle + 0.5, '#7dd3fc', 18, 0.2);
        const dmg = this.strike(boss, cx, cy, 120, 1.0, 'Guard Flick [D]', 12, { impulseStrength: 0.8, head: true });
        if (dmg > 0) this.addHeat(3);
      }
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // F — FINAL CUT (saber) / OVERCHARGE BEAM (beam)
  // =========================================================================
  castF(ax, ay, boss) {
    this.cds.f = this.maxCds.f;
    this.aimAt(boss, ax, ay);
    if (this.mode === 'beam') {
      // every Lock on the boss widens the beam and adds 10% damage to it; the beam ERASES them (it is the eraser, [R] only empowers)
      const mk = this.marks | 0;
      if (mk > 0) { this.marks = 0; this.markT = 0; if (this.isLocal) this.say(`LOCK-ON x${mk}: OVERCHARGE`, '#fdba74', 13); }
      this.beginAct('f', 2.5, { ang: this.facingAngle, tick: 0.1, fired: false, mk });
      this.saveCamera();
      this.addHeat(20);
      audio.playImpactBoom(1.0);
      return true;
    }
    this.beginAct('f', 1.3, { n: 0, nextT: 0.2, ang: this.facingAngle, bossRef: boss });
    this.hIframes = Math.max(this.hIframes, 0.3);
    this.addHeat(14);
    audio.playSwordSlash(true, 1.0);
    return true;
  }

  act_f(dt, boss, a) {
    const T = aTilt(), col = this.col();
    if (a.mode === 'beam') {
      // 0-0.7 charge · 0.7-2.1 beam following the cursor (it turns slowly) · 2.1-2.5 final flare
      const mw = this.mouseWorld();
      if (a.t < 2.1) {
        const want = Math.atan2((mw.y - this.y) / T, mw.x - this.x);
        let d = want - a.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
        a.ang += Math.max(-1.7 * dt, Math.min(1.7 * dt, d));
      }
      this.facingAngle = a.ang;
      this.speed = 0; this.vx = 0; this.vy = 0;
      const x0 = this.x + Math.cos(a.ang) * 34, y0 = this.y + Math.sin(a.ang) * 34 * T;
      if (a.t < 0.7) {
        const c = a.t / 0.7;
        if (window.fx && Math.random() < dt * (40 + 80 * c)) { const an = Math.random() * 6.28; window.fx.addDragSparks(x0 + Math.cos(an) * 80, y0 - 38 + Math.sin(an) * 40, an + Math.PI, 1, false, '#bae6fd'); }
        this.muzzle = 0.05 + c * 0.1;
        const cam = this.isLocal && window.game ? window.game.camera : null;
        if (cam && this._chargeSavedZoom) cam.targetZoom = Math.max(0.9, this._chargeSavedZoom - c * 0.1);
      } else if (a.t < 2.1) {
        this.muzzle = 0.1;
        this.addBeamFx(x0, y0 - 38, a.ang, 820, 44 + a.mk * 8, 0.06);
        if (this.isLocal && window.fx) window.fx.triggerShake(4, 0.06);
        a.tick -= dt;
        if (a.tick <= 0) {
          a.tick = 0.12;
          audio.playSwordSlash(false, 1.5);
          const dmg = this.beamHit(boss, x0, y0, a.ang, 820, 44 + a.mk * 8, 0.58 * (1 + 0.10 * a.mk), 'Overcharge Beam [F]', 7, { impulseStrength: 0.35, isStrongMove: false });
          if (dmg > 0) this.addHeat(0.8);
        }
      } else if (!a.fired) {
        a.fired = true;
        audio.playImpactBoom(1.7);
        this.addBeamFx(x0, y0 - 38, a.ang, 900, 90 + a.mk * 14, 0.3, '#ffffff');
        this.addScorch(x0, y0, a.ang, 900);
        if (window.fx) { window.fx.triggerShake(16, 0.35); window.fx.triggerHitstop(70); window.fx.addShockwave(x0, y0, 140, col, 8, 0.4); }
        this.beamHit(boss, x0, y0, a.ang, 900, 90 + a.mk * 14, 2.4 * (1 + 0.10 * a.mk), 'Overcharge Flare [F]', 40, { isStrongMove: true, impulseStrength: 1.5, head: true });
      }
      if (a.t >= a.dur) { this.restoreChargeCamera(); this.endAct(); }
      return;
    }
    // saber: five darting cuts around the target
    this.hIframes = Math.max(this.hIframes, 0.06);
    if (a.n < 5 && a.t >= a.nextT) {
      a.n++; a.nextT += 0.17;
      const fin = a.n === 5;
      const bs = (boss && boss.hp > 0) ? boss : null;
      // dart a short way toward the cursor each cut, alternating sides
      const mw = this.mouseWorld();
      const base = Math.atan2((mw.y - this.y) / T, mw.x - this.x);
      const an = base + (a.n % 2 ? 0.7 : -0.7);
      if (window.fx) aAfter(this.x, this.y, this.facingAngle, col);
      this.x += Math.cos(an) * 46; this.y += Math.sin(an) * 46 * T; this.targetX = this.x; this.targetY = this.y;
      this.facingAngle = base;
      audio.playSwordSlash(fin, 1.0 + a.n * 0.08);
      if (window.fx) {
        if (fin) {          // the finisher: a huge cross from both blades
          window.fx.addSlashRibbon(this.x, this.y - 20, 130, base + 1.2, base - 1.2, col, 24, 0.26);
          window.fx.addSlashRibbon(this.x, this.y - 20, 130, base - 1.2, base + 1.2, '#ffffff', 12, 0.26);
        } else window.fx.addSlashRibbon(this.x, this.y - 20, 92, base + (a.n % 2 ? 1.4 : -1.4), base + (a.n % 2 ? -1.4 : 1.4), a.n % 2 ? '#ffffff' : col, 15, 0.18);   // left blade, right blade, left...
        window.fx.triggerHitstop(fin ? 90 : 26); window.fx.triggerShake(fin ? 16 : 5, 0.18);
        window.fx.addShockwave(this.x, this.y, fin ? 240 : 100, col, fin ? 8 : 4, 0.3);
      }
      const dmg = this.strike(bs, this.x, this.y, fin ? 200 : 165, fin ? 2.4 : 0.95, `Blade Storm ${a.n} [F]`, fin ? 40 : 8, { isStrongMove: fin, impulseStrength: fin ? 1.5 : 0.5, hitX: this.x, hitY: this.y, head: fin });
      if (dmg > 0) { this.addHeat(fin ? 4 : 1.5); if (fin) this.addMarks(1, bs); }
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // Z — CORE VENT
  // =========================================================================
  castZ(boss) {
    if (this.cds.z > 0 || !this.canAct()) return false;
    if (this.heat < AL_HEAT_MAX - 0.5 && !this.isRemote) { this.say(`Solar charge ${Math.floor(this.heat)}% - needs 100%`, '#bae6fd', 12); return false; }
    this.cds.z = this.maxCds.z;
    if (this.mode !== 'beam') { this.mode = 'beam'; this.syncT = 0; this.swapFx(); }          // the cannon always docks for this
    const T = aTilt(), mw = this.mouseWorld();
    const ang = Math.atan2((mw.y - this.y) / T, mw.x - this.x);
    if (!this.isRemote) { this.heat = 0; this.heatIdleT = 0; }
    this.facingAngle = ang;
    this.beginAct('z', 4.5, { fired: false, sx: this.x, sy: this.y, ang, tick: 0, ticks: 0 });
    this.hIframes = Math.max(this.hIframes, 0.7);
    this.saveCamera();
    audio.playParryClang && audio.playParryClang(true);
    return true;
  }

  // SOLAR CANNON: hop back, plant the free hand on the cannon arm, charge, then one huge beam that burns for ~2s.
  act_z(dt, boss, a) {
    const T = aTilt(), col = this.col(), LEN = 1150, FIRE = 1.5, END = 3.5;
    const cam = this.isLocal && window.game ? window.game.camera : null, saved = this._chargeSavedZoom || 1.05;
    this.speed = 0; this.vx = 0; this.vy = 0;
    // the aim drifts after the cursor (quickly while charging, slowly while firing)
    const mw = this.mouseWorld(), want = Math.atan2((mw.y - this.y) / T, mw.x - this.x);
    let dA = want - a.ang; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
    const rate = a.t < FIRE ? 3.5 : 0.8; a.ang += Math.max(-rate * dt, Math.min(rate * dt, dA));
    this.facingAngle = a.ang;
    const ca = Math.cos(a.ang), sa = Math.sin(a.ang);
    this.hIframes = Math.max(this.hIframes, 0.1);
    if (a.t < 0.45) {                                   // the hop back
      const u = a.t / 0.45, s = aEaseOut(u);
      this.x = a.sx - ca * 130 * s; this.y = a.sy - sa * 130 * s * T; this.targetX = this.x; this.targetY = this.y;
      this.jumpZ = 12 + Math.sin(u * Math.PI) * 34;
      if (window.fx && Math.random() < dt * 80) window.fx.addDragSparks(this.x, this.y - 6, Math.atan2(sa, ca) , 1, false, '#e0f2fe');
    } else if (!a.planted) {
      a.planted = true;
      audio.playImpactBoom(1.1); audio.playSwordPlant && audio.playSwordPlant();
      if (window.fx) { window.fx.triggerShake(8, 0.2); window.fx.addShockwave(this.x, this.y, 120, '#fde68a', 5, 0.35); window.fx.addDragSparks(this.x, this.y, -Math.PI / 2, 10, false, '#fde68a'); }
    }
    const mx = this.x + ca * 34, my = this.y - 46 - (this.jumpZ || 0) + sa * 34 * T;      // the muzzle
    if (a.t >= 0.45 && a.t < FIRE) {                    // charging: sparks stream into the muzzle, the lens rings collapse, the camera pulls back
      const c = aClamp01((a.t - 0.45) / (FIRE - 0.45));
      this.muzzle = 0.06;
      if (cam) cam.targetZoom = Math.max(0.82, saved - 0.24 * aEaseOut(c));
      if (window.fx && Math.random() < dt * (40 + 120 * c)) { const an = Math.random() * 6.28, r = 110 * (1 - c) + 14; window.fx.addDragSparks(mx + Math.cos(an) * r, my + Math.sin(an) * r * T, an + Math.PI, 1, false, c > 0.6 ? '#ffffff' : '#fde68a'); }
      if (Math.random() < dt * 6) audio.playQteKeySound && audio.playQteKeySound(true, 1 + Math.floor(c * 8));
    }
    if (!a.fired && a.t >= FIRE) {
      a.fired = true; a.tick = 0;
      audio.playImpactBoom(2.0); audio.playSwordSlash(true, 1.8);
      if (window.fx) { window.fx.triggerHitstop(70); window.fx.triggerShake(22, 0.5); window.fx.triggerZoomPunch(0.1); if (this.isLocal) window.fx.triggerImpactFrame('#fde68a', 0.14); window.fx.addShockwave(this.x, this.y, 240, '#ffffff', 8, 0.5); window.fx.addPillar(mx, this.y, 70, '#fde68a', 0.7); }
    }
    if (a.fired && a.t < END) {                         // the beam: wide, white-hot core, a hit every 0.1s
      this.muzzle = 0.06;
      this.x -= ca * 26 * dt; this.y -= sa * 26 * dt * T; this.targetX = this.x; this.targetY = this.y;     // the recoil nudges you back
      if (cam) cam.targetZoom = Math.max(0.82, saved - 0.24);
      if (window.fx && Math.random() < dt * 20) window.fx.triggerShake(8, 0.12);
      a.tick -= dt;
      if (a.tick <= 0) {
        a.tick = 0.1; a.ticks++;
        const k = 1 + 0.06 * Math.sin(a.ticks * 1.7), fade = a.t > END - 0.35 ? (END - a.t) / 0.35 : 1;
        this.addBeamFx(mx, my, a.ang, LEN, 118 * k * fade + 10, 0.16, col);
        this.addBeamFx(mx, my, a.ang, LEN, 52 * k * fade + 6, 0.2, '#ffffff');
        if (a.ticks % 3 === 1) this.addScorch(this.x, this.y, a.ang, LEN);
        if (window.fx && a.ticks % 2 === 0) { const u = 200 + Math.random() * 800; window.fx.addDragSparks(this.x + ca * u, this.y + sa * u * T, a.ang + (Math.random() < 0.5 ? 1.2 : -1.2), 3, false, '#fde68a'); }
        if (a.ticks % 4 === 1) audio.playSwordSlash(false, 1.6);
        this.beamHit(boss, this.x, this.y, a.ang, LEN, 70, 0.75, 'Solar Cannon [Z]', 6, { impulseStrength: 0.25 });
      }
    }
    if (a.fired && !a.finished && a.t >= END) {         // the closing flare
      a.finished = true;
      audio.playImpactBoom(1.6);
      this.addBeamFx(mx, my, a.ang, LEN, 190, 0.3, '#ffffff');
      if (window.fx) { window.fx.triggerShake(16, 0.35); window.fx.addShockwave(mx, this.y, 180, col, 6, 0.4); }
      this.beamHit(boss, this.x, this.y, a.ang, LEN, 90, 3.6, 'Solar Cannon Finale [Z]', 24, { isStrongMove: true, impulseStrength: 1.2, head: true });
    }
    if (a.t >= a.dur) { this.restoreChargeCamera(); this.jumpZ = 0; this.endAct(); }
  }

  // =========================================================================
  // T — ORBITAL LOCK
  // =========================================================================
  castT(ax, ay, boss) {
    if (this.cds.t > 0 || !this.canAct()) return false;
    if (!boss || boss.hp <= 0) { this.say('No target', '#fca5a5', 12); return false; }
    this.cds.t = this.maxCds.t;
    this.aimAt(boss, boss.x, boss.y);
    if (ultHoldBlocked(boss)) {
      // the shared hold rule: a boss in a mechanic cannot be locked. The call fizzles against it; in reach, half the cooldown comes
      // back, out of reach it is a whiff and the whole cooldown stays spent. No lock, no strike.
      const inReach = Math.hypot(boss.x - this.x, (boss.y - this.y) / aTilt()) < 700;
      if (inReach) this.cds.t = this.maxCds.t * 0.5;
      this.beginAct('t', 1.0, { phase: 'bounce', phaseT: 0, boss, inReach });
      this.hIframes = Math.max(this.hIframes, 0.4);
      audio.playImpactBoom(0.7);
      return true;
    }
    const over = false;
    const mult = 1.25;
    this.beginAct('t', 5.4, { phase: 'call', phaseT: 0, boss, mult, over, n: 0, nextT: 0, locked: false });
    this.hIframes = Math.max(this.hIframes, 0.5);
    this.saveCamera();
    audio.playImpactBoom(1.0);
    if (this.isLocal && audio.playBreakerGrunt) audio.playBreakerGrunt(true);
    return true;
  }

  act_t(dt, boss, a) {
    a.phaseT += dt;
    const bs = a.boss || boss, T = aTilt();
    const cam = (this.isLocal && window.game) ? window.game.camera : null;
    const saved = this._chargeSavedZoom || 1.05;
    this.hIframes = Math.max(this.hIframes, 0.2);
    this.speed = 0; this.vx = 0; this.vy = 0;
    if (!bs || bs.hp <= 0) { this.restoreChargeCamera(); this.endAct(); return; }
    this.facingAngle = Math.atan2((bs.y - this.y) / T, bs.x - this.x);
    if (a.phase === 'bounce') {
      this.muzzle = 0.04;
      if (a.inReach && !a.bounced && a.phaseT >= 0.35) {
        a.bounced = true;
        audio.playImpactBoom(0.9);
        ultBounceFx(bs.x, bs.y);
        if (window.fx) window.fx.triggerShake(6, 0.15);
      }
      if (a.phaseT >= 0.6) this.endAct();
    } else if (a.phase === 'call') {
      const c = aClamp01(a.phaseT / 0.8);
      if (cam) cam.targetZoom = Math.max(0.88, saved - c * 0.14);
      if (window.fx && Math.random() < dt * (30 + 70 * c)) { const an = Math.random() * 6.28; window.fx.addDragSparks(bs.x + Math.cos(an) * 200, bs.y + Math.sin(an) * 110, an + Math.PI, 1, false, '#bae6fd'); }
      this.muzzle = 0.06;
      if (a.phaseT >= 0.8) {
        a.phase = 'bind'; a.phaseT = 0;
        audio.playImpactBoom(1.6); audio.playParryClang(true);
        if (typeof bs.lockInPlaceForUltimate === 'function') bs.lockInPlaceForUltimate(3.8, 3.4, this.isRemote);
        a.locked = true;
        this.addBeamFx(bs.x, bs.y, -Math.PI / 2, 600, 110, 0.5, this.col());
        this.addBeamFx(bs.x, bs.y, -Math.PI / 2, 600, 50, 0.6, '#ffffff');
        if (window.fx) {
          window.fx.triggerHitstop(100); window.fx.triggerShake(22, 0.5);
          if (this.isLocal) window.fx.triggerImpactFrame(this.col(), 0.14);
          window.fx.addShockwave(bs.x, bs.y, 260, this.col(), 9, 0.6);
          window.fx.addPillar(bs.x, bs.y, 90, this.col(), 0.9);
        }
        this.strike(bs, bs.x, bs.y, 9999, 1.5 * a.mult, 'Orbital Lock [T]', 30, { isStrongMove: true, impulseStrength: 1.6, hitX: bs.x, hitY: bs.y });
      }
    } else if (a.phase === 'bind') {
      if (a.phaseT >= 0.5) { a.phase = 'barrage'; a.phaseT = 0; a.nextT = 0; }
    } else if (a.phase === 'barrage') {
      const total = a.over ? 12 : 7;
      if (a.n < total && a.phaseT >= a.nextT) {
        a.n++; a.nextT += a.over ? 0.12 : 0.2;
        const ox = (Math.random() - 0.5) * 220, oy = (Math.random() - 0.5) * 90;
        const hx = bs.x + ox, hy = bs.y + oy;
        this.addBeamFx(hx, hy, -Math.PI / 2, 520, 26, 0.22);
        audio.playImpactBoom(0.7 + a.n * 0.03); audio.playSwordSlash(false, 1.5);
        if (window.fx) { window.fx.triggerShake(6, 0.12); window.fx.addShockwave(hx, hy, 90, this.col(), 4, 0.25); window.fx.addImpactStarburst && window.fx.addImpactStarburst(hx, hy - 30, '#ffffff', 0.8, 0.18, 14); }
        this.strike(bs, bs.x, bs.y, 9999, 1.2 * a.mult, `Orbital Strike ${a.n} [T]`, 8, { impulseStrength: 0.4, hitX: hx, hitY: hy });
      }
      if (a.n >= total && a.phaseT >= a.nextT + 0.5) { a.phase = 'slam'; a.phaseT = 0; }
    } else if (a.phase === 'slam') {
      if (cam) cam.targetZoom = Math.max(0.9, saved + 0.1 - aClamp01(a.phaseT / 0.4) * 0.1);
      if (!a.slam && a.phaseT >= 0.45) {
        a.slam = true;
        audio.playImpactBoom(2.2); audio.playSwordPlant(); audio.playCounterSuccessBoom && audio.playCounterSuccessBoom();
        this.addBeamFx(bs.x, bs.y, -Math.PI / 2, 700, 200, 0.7, '#ffffff');
        this.addBeamFx(bs.x, bs.y, -Math.PI / 2, 700, 120, 0.8, this.col());
        if (window.fx) {
          window.fx.triggerHitstop(150); window.fx.triggerShake(30, 0.7); window.fx.triggerZoomPunch(0.12);
          if (this.isLocal) window.fx.triggerImpactFrame('#ffffff', 0.18);
          window.fx.addShockwave(bs.x, bs.y, 380, this.col(), 12, 0.7); window.fx.addShockwave(bs.x, bs.y, 220, '#ffffff', 7, 0.5);
          window.fx.addPillar(bs.x, bs.y, 120, '#ffffff', 0.9); window.fx.spawnMassiveEarthChunks(bs.x, bs.y, 14, '#475569');
          for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; window.fx.addFissureLine(bs.x, bs.y, bs.x + Math.cos(an) * 300, bs.y + Math.sin(an) * 300 * T, this.col(), 6); }
        }
        this.strike(bs, bs.x, bs.y, 9999, (a.over ? 6.5 : 5.0) * a.mult, a.over ? 'ORBITAL OVERDRIVE [T]' : 'ORBITAL LOCK FINALE [T]', 130, { isStrongMove: true, impulseStrength: 2.2, hitX: bs.x, hitY: bs.y, head: true });
      }
      if (a.phaseT >= 1.2) {
        this.restoreChargeCamera();
        if (bs && bs.state === 'staggered') { bs.lockedByUltimateTimer = 0; bs.stateDuration = 3.4; bs.stateTimer = 3.4; }
        this.endAct();
      }
    }
  }

  updateHud(boss) {
    if (window.ArclightHud) window.ArclightHud.update(this, boss);
  }
}

window.ArclightPlayer25D = ArclightPlayer25D;

// Painted icons (game/icons/skill_arclight_<key>.png, 96x96) are picked up automatically as soon as the files exist; until then the
// emoji icons are used. BEAM mode skills use skill_arclight_b<key>.png.
for (const k of ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z', 'x', 'space']) {
  const sk = window.SKILL_META.arclight.skills[k];
  if (!sk) continue;
  const im = new Image();
  im.onload = () => {
    sk.img = im.src.replace(/^.*\/game\//, 'game/');
    if (window.game && window.game.localPlayer && window.game.localPlayer.classId === 'arclight' && window.SkillHud) window.SkillHud.build(window.game.localPlayer);
  };
  im.src = 'game/icons/skill_arclight_' + k + '.png';
}
for (const k of ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't']) {
  const sk = window.SKILL_META.arclight.beam[k];
  if (!sk) continue;
  const im = new Image();
  im.onload = () => {
    sk.img = im.src.replace(/^.*\/game\//, 'game/');
    if (window.game && window.game.localPlayer && window.game.localPlayer.classId === 'arclight' && window.SkillHud) window.SkillHud.build(window.game.localPlayer);
  };
  im.src = 'game/icons/skill_arclight_b' + k + '.png';
}
