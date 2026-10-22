// =========================================================================
// UNBOUND_25D.JS — "Unbound": someone far too strong who is deliberately holding back
//
// Extends BreakerPlayer25D (movement, IK rig, hit-reactions and the shared Final Clash come for free). Class logic lives here, drawing
// in unbound_rig.js and the HUD in unbound_hud.js.
//
//   • Restraint  — 0-100. Fills from clean play: dodging through a hit, countering, landing skills (and a slow trickle). Getting hit
//                  costs some. Every gain is also tallied by source (dodge / counter / skill) and the biggest tally at the moment
//                  you let go decides the FORM of the Release, like a Kayn transformation:
//                    dodge → Palm Beam · counter → Hellzone · skill → Gravity Press
//   • [Z] Release — needs a full meter. A hand lifted, nonchalantly, and something enormous comes out of it. Most of the damage lives here.
//   • [S] Rebuke  — a flick-off for a boss swing (the boss side is not built yet: for now it plays the swat and locks out on a miss).
//   • [T]         — Toss Around: he throws his jacket off, grabs the boss and slams it up and down in place.
// Act kinds: b q w e r a s d f t z
// =========================================================================

const UB_MAX = 100;
const UB_TRICKLE = 0.8;          // restraint per second, just so the meter is never dead
const UB_HIT_LOSS = 5;           // restraint lost when you are actually hit
// Release timings (shared by the logic here and the drawing in unbound_rig.js)
const UB_BEAM_CHG = 0.75, UB_BEAM_LEN_T = 1.6, UB_BEAM_TICKS = 32, UB_BEAM_REACH = 1150, UB_BEAM_HALF = 95;   // HALF: half-width of the beam's hit area, wide enough that a sidestep does not escape it
const UB_HELL = { N: 14, SUMMON: 0.2, GAP: 0.08, CLAP: 1.7, FLY: 0.2, FIN: 2.35 };
const UB_HELL_REACH = 520, UB_HELL_R = 190;     // how far away the marker can go, and its radius
const UB_PRESS = { FORM: 0.55, TAPS: [0.85, 1.25, 1.65, 2.05], SLAM: 2.6 };
// Height of the giant hand of Gravity Press over time: it forms high, dips with every tap (sinking a little lower each time),
// rises for a beat, then drops all the way.
function uPressHandZ(t) {
  const P = UB_PRESS, ease = (x) => 1 - Math.pow(1 - x, 3);
  if (t < P.FORM) return 360 - 60 * ease(Math.max(0, t) / P.FORM);
  let z = 300 - 18 * P.TAPS.filter((x) => t >= x).length;
  for (const tt of P.TAPS) { const u = (t - (tt - 0.1)) / 0.32; if (u > 0 && u < 1) z -= 150 * (u < 0.31 ? Math.pow(u / 0.31, 2) : 1 - ease((u - 0.31) / 0.69)); }
  if (t >= P.SLAM - 0.3) z = z + (380 - z) * ease(Math.min(1, (t - (P.SLAM - 0.3)) / 0.22));
  if (t >= P.SLAM - 0.08) z = 380 * (1 - Math.pow(Math.min(1, (t - (P.SLAM - 0.08)) / 0.08), 2));
  return Math.max(0, z);
}
window.UB_RELEASE = { UB_BEAM_CHG, UB_BEAM_LEN_T, UB_BEAM_REACH, UB_HELL, UB_HELL_R, UB_PRESS };
const UB_MOVE_FILL = 4;         // blue (dodge) restraint just for using A, W or Space; slipping a real hit adds +9 on top
const UB_CLEAN_BONUS = 1.25;     // Release damage when the meter was filled without being hit once ("untouched")
const UB_FORMS = {
  beam: { key: 'beam', name: 'Palm Beam', col: '#38bdf8', core: '#e0f2fe', src: 'dodge' },
  hell: { key: 'hell', name: 'Hellzone', col: '#ef4444', core: '#fecaca', src: 'counter' },
  press: { key: 'press', name: 'Gravity Press', col: '#facc15', core: '#fef9c3', src: 'skill' }
};
window.UNBOUND_FORMS = UB_FORMS;

const uClamp01 = (t) => Math.max(0, Math.min(1, t));
const uLerp = (a, b, t) => a + (b - a) * t;
const uEaseOut = (t) => 1 - Math.pow(1 - uClamp01(t), 3);
const uEaseIn = (t) => Math.pow(uClamp01(t), 2.2);
const uTilt = () => (typeof PERSPECTIVE_TILT !== 'undefined' ? PERSPECTIVE_TILT : 0.55);

// The shared hold rule: a T that grabs the boss in place cannot hold it while a mechanic is running.
function uHoldBlocked(boss) { return ultHoldBlocked(boss); }       // lives in clash_qte.js so every class shares it

window.SKILL_META = window.SKILL_META || {};
window.SKILL_META.unbound = {
  title: 'UNBOUND',
  identity: { name: 'Release', icon: '✋', key: 'Z', kind: 'unbound_restraint' },
  passive: {
    name: 'Restraint',
    desc: 'You are holding back. Dodging through a hit, countering and landing skills build RESTRAINT; being hit costs a little. At full, [Z] lets some of it out, and what comes out depends on how you built it. Most of your damage is in that. Fill it without being hit once and the Release hits 25% harder.'
  },
  skills: {
    q: { name: 'Flick', icon: '👆', short: 'Flick', stagger: 'low', destructive: false, counter: false, cd: '6s',
         desc: 'Flick a finger. A pressure ripple races out along your cursor.' },
    w: { name: 'Afterimage Step', icon: '👣', short: 'Afterimage', stagger: 'medium', destructive: false, counter: false, position: 'back', cd: '11s',
         desc: 'Streak through the target in a trail of afterimages and land on its far side, facing the way you ran. A flurry of punches lands all over its body. Untouchable while you move.' },
    e: { name: 'Palm Pulse', icon: '🖐️', short: 'Palm', stagger: 'high', destructive: true, counter: false, position: 'front', cd: '10s',
         desc: 'A casual palm strike that snaps to the nearest weak point. A lot of break damage for how little effort it takes.' },
    r: { name: 'Press', icon: '⏬', short: 'Press', stagger: 'medium', destructive: false, counter: false, cd: '13s',
         desc: 'Push a hand down. The air itself comes down on the target in a few quick pulses.' },
    a: { name: 'Instant Step', icon: '💨', short: 'Step', stagger: 'none', destructive: false, counter: false, cd: '6s',
         desc: 'A short, quick step toward your cursor with i-frames. Dodging through a hit with it builds Restraint.' },
    s: { name: 'Rebuke', icon: '🫳', short: 'Rebuke', stagger: 'none', destructive: false, counter: false, position: 'front', cd: '0.8s',
         desc: 'Flick a swing away right as it lands. Close range, in front of the boss. A white glint over the boss marks a swing you can flick. A miss locks it for a moment.' },
    d: { name: 'Catch', icon: '🤚', short: 'Catch', stagger: 'low', destructive: false, counter: true, cd: '7s',
         desc: 'Casually catch what is coming. Landing it on a blue boss flash is a full counter: big stagger, a chunk of shield and a lot of Restraint.' },
    f: { name: 'Backhand', icon: '🫱', short: 'Backhand', stagger: 'high', destructive: true, counter: false, position: 'front', cd: '12s',
         desc: 'One lazy backhand. It lands a lot harder than it looks.' },
    t: { name: 'Toss Around', icon: '🧥', short: 'Toss', stagger: 'high', destructive: true, counter: false, cd: '2m',
         desc: 'Needs you right next to the boss. Throw the jacket off, grab the boss, power up a little, then toss it up and down like a ragdoll. You cannot be hurt while you do it.' },
    space: { name: 'Evade Dash', icon: '💨', short: 'Evade', stagger: 'none', destructive: false, counter: false, cd: '5.5s',
         desc: 'Quick dash with i-frames. Also a wake-up roll when knocked down.' },
    z: { name: 'Release', icon: '✋', short: 'Release', stagger: 'high', destructive: true, counter: false, position: 'front', cd: 'Full Restraint',
         desc: 'Lift a hand. What comes out depends on how you built your Restraint. Nothing can touch you while it plays.' }
  }
};

// Where the Afterimage Step's punches land on the boss: sideways on screen (s) and height on the body (u). Shuffled per cast, no repeat in a row.
const U_PUNCH_SPOTS = [{ s: 0, u: 108 }, { s: 0, u: 82 }, { s: 0, u: 56 }, { s: -26, u: 92 }, { s: 26, u: 92 }, { s: -20, u: 66 }, { s: 20, u: 66 }, { s: -14, u: 32 }, { s: 14, u: 32 }, { s: -30, u: 48 }, { s: 30, u: 48 }];
function uPunchOrder() { const a = U_PUNCH_SPOTS.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }function uAfter(x, y, fa, col) { const f = window.fx; if (!f) return; f.addAfterimage(x, y, fa, col); const l = f.afterimages[f.afterimages.length - 1]; if (l) l.noSword = true; }

class UnboundPlayer25D extends BreakerPlayer25D {
  constructor(id, name, x, y, isLocal = true, isBot = false) {
    super(id, name || 'Unbound', x, y, isLocal, isBot);
    this.classId = 'unbound';
    this.weaponColor = '#cbd5e1';
    this.weaponGlow = '#94a3b8';
    this.weaponModelId = 'brc_iron';
    this.baseAtk = 150;
    this.baseMaxSpeed = 200;

    this.cds = { q: 0, w: 0, e: 0, r: 0, a: 0, s: 0, d: 0, f: 0, t: 0, z: 0, space: 0, wakeup: 0 };
    this.maxCds = { q: 6, w: 11, e: 10, r: 13, a: 6, s: 0.8, d: 7, f: 12, t: 120, z: 3, space: 5.5, wakeup: 20 };

    this.act = null;
    this.hIframes = 0;
    this.restraint = 0;
    this.restraintShown = 0;
    this.tally = { dodge: 0, counter: 0, skill: 0 };
    this.clean = true;          // not hit since the last Release: the next one is "untouched" and hits harder
    this.dodgeT = 0;           // a short gap so a multi-hit swing does not count as five dodges
    this.hudFlashT = 0;
    this.aura = 0;              // 0..1, the silver power-up glow (eased)
    this.auraWant = 0;
    this.lift = 0;              // 0..1, how far the casting hand is raised (Release)
    this.strain = 0;            // 0..1, the gritted-teeth face of the Toss Around power-up
    this.ghostA = 0;            // 0..1, how far he has vanished (Afterimage Step)
    this.bolts = [];            // flicks and orbs
    this.beams = [];            // timed beam visuals
    this.vfx = [];              // timed world effects: the press disc, the jacket in the air, rings
    this.bStep = 0; this.bResetT = 0;
  }

  resetUnbound() {
    this.act = null; this.restraint = 0; this.restraintShown = 0; this.tally = { dodge: 0, counter: 0, skill: 0 }; this.clean = true;
    this.aura = 0; this.auraWant = 0; this.lift = 0; this.strain = 0; this.ghostA = 0; this.hipWidth = 10; this.bolts = []; this.beams = []; this.vfx = [];
    this.bStep = 0; this.bResetT = 0; this.dodgeT = 0; this.hIframes = 0; this.jumpZ = 0; this.shield = 0;
    if (this.state === 'h_act') this.state = 'idle';
    this.restoreChargeCamera();
  }

  // ----- small accessors ---------------------------------------------------
  heatMult() { return 1; }
  addOverpower() { /* Breaker-only resource */ }
  noKeyRepeat(k) { return k === 'z' || k === 't' || k === 'e' || k === 'w' || k === 'r' || k === 'f' || k === 's' || k === 'q'; }
  say(text, color = '#e2e8f0', size = 13) { if (window.fx && this.isLocal) window.fx.addFloatingText(this.x, this.y - 78, text, color, size); }

  // The form the Release would take right now: the biggest tally wins (ties go to the beam).
  get formKey() {
    const t = this.tally;
    if (t.counter > t.dodge && t.counter >= t.skill) return 'hell';
    if (t.skill > t.dodge && t.skill > t.counter) return 'press';
    return 'beam';
  }
  get form() { return UB_FORMS[this.formKey]; }
  col() { return this.form.col; }
  get full() { return this.restraint >= UB_MAX - 0.5; }

  getNetState() {
    const mw = this.mouseWorld();
    const t = this.tally;
    return { ur: Math.round(this.restraint), uf: this.formKey === 'hell' ? 1 : (this.formKey === 'press' ? 2 : 0), ux: Math.round(mw.x), uy: Math.round(mw.y), ut: [Math.round(t.dodge), Math.round(t.counter), Math.round(t.skill)] };
  }
  applyNetState(d) {
    this.remoteAim = { x: d.ux, y: d.uy };
    if (typeof d.ur === 'number') this.restraint = Math.max(0, Math.min(UB_MAX, d.ur));
    if (Array.isArray(d.ut)) this.tally = { dodge: +d.ut[0] || 0, counter: +d.ut[1] || 0, skill: +d.ut[2] || 0 };
  }

  // ----- Restraint -----------------------------------------------------------
  // src: 'dodge' | 'counter' | 'skill' feeds the tally; anything else (the trickle) does not.
  addRestraint(v, src) {
    if (this.isRemote || v <= 0) return;
    const before = this.restraint;
    this.restraint = Math.min(UB_MAX, this.restraint + v);
    if (src && this.tally[src] !== undefined) this.tally[src] += Math.min(v, UB_MAX - before + v);
    if (before < UB_MAX - 0.5 && this.restraint >= UB_MAX - 0.5) {             // full: no text, just a cue
      this.hudFlashT = 0.8;
      if (this.isLocal && audio.playParryClang) audio.playParryClang(true);
      if (window.fx && this.isLocal) {
        window.fx.addShockwave(this.x, this.y, 120, this.col(), 5, 0.4);
        if (this.clean) window.fx.addShockwave(this.x, this.y, 170, '#fde68a', 4, 0.55);     // a second, gold ring: filled untouched
      }
    }
  }
  noteDodge() {
    if (this.dodgeT > 0 || (this.act && this.act.kind === 'z')) return;     // the Release's own i-frames do not count as dodging
    this.dodgeT = 0.45;
    this.addRestraint(9, 'dodge');
    if (window.fx && this.isLocal) window.fx.addShockwave(this.x, this.y, 70, '#e2e8f0', 3, 0.22);
  }
  onHurt() {
    if (this.isRemote) return;
    this.restraint = Math.max(0, this.restraint - UB_HIT_LOSS);
    for (const k in this.tally) this.tally[k] *= 0.9;
    this.clean = false;
  }

  // ----- hits ------------------------------------------------------------------
  // The boss's nearest breakable point (any boss: it exposes break points itself; Vaelgor's are the shoulders).
  nearestBreakPoint(boss) {
    let pts = null;
    try { pts = typeof boss.getBreakPoints === 'function' ? boss.getBreakPoints() : (typeof boss.getShoulderWorldPositions === 'function' ? boss.getShoulderWorldPositions() : null); } catch (e) { pts = null; }
    if (!pts) return { x: boss.x, y: boss.y };
    const list = Array.isArray(pts) ? pts : Object.values(pts);
    let best = null, bd = 1e9;
    for (const p of list) {
      if (!p || p.x === undefined) continue;
      const d = Math.hypot(p.x - this.x, (p.y - this.y) / uTilt());
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { x: best.x, y: best.y } : { x: boss.x, y: boss.y };
  }

  // An untouched Release (meter filled without being hit) hits harder; every hit dealt while it plays gets the bonus.
  releaseBonus() { return (this.act && this.act.kind === 'z' && this.act.bonus) || 1; }

  // Positioned hit with reach check. Returns the damage dealt (0 = miss). opts.fill = Restraint gained on a hit.
  strike(boss, cx, cy, reach, coeff, name, stagger, opts = null) {
    if (!boss || boss.hp <= 0) return 0;
    coeff *= this.releaseBonus();
    if (!this.isRemote && typeof boss.checkPlayerHitAnchors === 'function') boss.checkPlayerHitAnchors(cx, cy, reach);
    if (Math.hypot(boss.x - cx, (boss.y - cy) / uTilt()) >= reach) return 0;
    const o = Object.assign({ isStrongMove: false, impulseStrength: 0.8, hitX: cx, hitY: cy }, opts || {});
    const d = this.dealHitToBoss(boss, coeff, name, !!o.head, stagger, false, o) || 0;
    this.strikeLanded = d > 0;
    if (d > 0 && o.fill) this.addRestraint(o.fill, o.src || 'skill');
    return d;
  }

  beamHit(boss, x0, y0, ang, len, halfW, coeff, name, stagger, opts = null) {
    if (!boss || boss.hp <= 0) return 0;
    coeff *= this.releaseBonus();
    const dx = boss.x - x0, dy = (boss.y - y0) / uTilt();
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const along = dx * ca + dy * sa, side = Math.abs(-dx * sa + dy * ca);
    if (along < -20 || along > len + 40 || side > halfW + 64) return 0;
    if (!this.isRemote && typeof boss.checkPlayerHitAnchors === 'function') boss.checkPlayerHitAnchors(boss.x, boss.y, 40);
    const o = Object.assign({ isStrongMove: false, impulseStrength: 0.6, hitX: boss.x, hitY: boss.y }, opts || {});
    const d = this.dealHitToBoss(boss, coeff, name, !!o.head, stagger, false, o) || 0;
    if (d > 0 && o.fill) this.addRestraint(o.fill, 'skill');
    return d;
  }

  aimAt(boss, ax, ay) {
    const ang = Math.atan2((ay - this.y) / uTilt(), ax - this.x);
    this.facingAngle = ang;
    return ang;
  }
  aimAtBoss(boss, ax, ay) {
    if (boss && boss.hp > 0) { this.facingAngle = Math.atan2((boss.y - this.y) / uTilt(), boss.x - this.x); return this.facingAngle; }
    return this.aimAt(boss, ax, ay);
  }
  mouseWorld() {
    if (!this.isLocal) return this.remoteAim || { x: this.x + Math.cos(this.facingAngle) * 200, y: this.y + Math.sin(this.facingAngle) * 200 * uTilt() };
    const g = window.game;
    return { x: g ? g.mouseWorldX : this.x + 100, y: g ? g.mouseWorldY : this.y };
  }

  fire(b) { b.t = 0; b.hit = false; this.bolts.push(b); if (this.bolts.length > 50) this.bolts.shift(); return b; }
  addBeamFx(x0, y0, ang, len, w, dur, col) { this.beams.push({ x0, y0, ang, len, w, t: 0, dur, col: col || this.col() }); if (this.beams.length > 24) this.beams.shift(); }
  addVfx(e) { e.t = 0; this.vfx.push(e); if (this.vfx.length > 40) this.vfx.shift(); return e; }

  // ----- action framework (same shape as the Arclight / Reaper) -----------------
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
    this.auraWant = 0; this.lift = 0;
    this.restoreChargeCamera();
  }
  cancelActIfInterrupted() { if (this.act && this.state !== 'h_act') { this.act = null; this.auraWant = 0; this.restoreChargeCamera(); } }
  restoreChargeCamera() {
    if (this._chargeSavedZoom && window.game && window.game.camera) window.game.camera.targetZoom = this._chargeSavedZoom;
    this._chargeSavedZoom = null;
  }
  saveCamera() { if (this.isLocal && window.game && window.game.camera && !this._chargeSavedZoom) this._chargeSavedZoom = window.game.camera.targetZoom; }

  // An auto-attack whose blow has landed may be cut short by a skill.
  skillCancelReady() {
    const a = this.act;
    if (!a) return false;
    if (a.kind === 'b') return !!a.hit && a.t >= a.dur * 0.55;
    return false;
  }

  // ----- update -------------------------------------------------------------
  _updateInternal(dt, boss, arenaCenter, arenaRadius) {
    if (this.hIframes > 0) this.hIframes = Math.max(0, this.hIframes - dt);
    if (this.hudFlashT > 0) this.hudFlashT = Math.max(0, this.hudFlashT - dt);
    if (this.bResetT > 0) this.bResetT = Math.max(0, this.bResetT - dt);
    if (this.dodgeT > 0) this.dodgeT = Math.max(0, this.dodgeT - dt);
    if (this.state === 'space_dash' && this._prevState !== 'space_dash') this.addRestraint(UB_MOVE_FILL, 'dodge');     // every Evade Dash feeds blue
    this._prevState = this.state;
    this.restraintShown += (this.restraint - this.restraintShown) * Math.min(1, dt * 8);
    this.aura += (this.auraWant - this.aura) * Math.min(1, dt * (this.auraWant > this.aura ? 6 : 3));
    // the power-up stance: feet planted wide and a strained face, only while he is powering up (or tossing) in Toss Around
    if (!(this.act && this.act.kind === 'w')) this.ghostA = 0;      // never stay invisible if the step is cut short
    const tAct = this.act && this.act.kind === 't' ? this.act.phase : '';
    const powering = tAct === 'power' || tAct === 'toss';
    this.hipWidth += ((powering ? 17 : 10) - this.hipWidth) * Math.min(1, dt * 10);
    this.strain += (((tAct === 'power') ? 1 : 0) - this.strain) * Math.min(1, dt * 14);

    // a slow trickle so the meter is never dead (owner only; proxies get the number from player_state)
    if (!this.isRemote && this.hp > 0 && this.restraint < UB_MAX && !(this.act && this.act.kind === 'z')) this.restraint = Math.min(UB_MAX, this.restraint + UB_TRICKLE * dt);

    if (this.hp <= 0) {
      this.act = null; this.bolts.length = 0; this.auraWant = 0; this.restoreChargeCamera();
    } else {
      this.cancelActIfInterrupted();
      this.updateAct(dt, boss);
      this.updateBolts(dt, boss);
    }
    if (!this.act) this.lift += (0 - this.lift) * Math.min(1, dt * 7);
    for (let i = this.beams.length - 1; i >= 0; i--) { this.beams[i].t += dt; if (this.beams[i].t >= this.beams[i].dur) this.beams.splice(i, 1); }
    this.updateVfx(dt, boss);
    this.baseMaxSpeed = 200;
    super._updateInternal(dt, boss, arenaCenter, arenaRadius);
    // faint breath of power around a full meter
    if (window.fx && (this.isLocal || window.fx.showAllyVfx !== false) && this.full && Math.random() < dt * 5) window.fx.addDragSparks(this.x + (Math.random() - 0.5) * 22, this.y - 44, -Math.PI / 2, 1, false, this.col());
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

  updateVfx(dt, boss) {
    for (let i = this.vfx.length - 1; i >= 0; i--) {
      const e = this.vfx[i];
      e.t += dt;
      if (e.kind === 'jacket') {            // the thrown jacket: up, over and down, then it lies there
        if (e.t < e.air) { e.x += e.vx * dt; e.y += e.vy * dt * uTilt(); e.z += e.vz * dt; e.vz -= 520 * dt; e.rot += e.spin * dt; if (e.z < 0) { e.z = 0; e.vz = 0; e.vx *= 0.3; e.vy *= 0.3; e.air = e.t; } }
        else { e.z = 0; e.vx *= 0.9; e.vy *= 0.9; }
      }
      if (e.t >= e.dur) this.vfx.splice(i, 1);
    }
  }

  updateBolts(dt, boss) {
    const T = uTilt();
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      let remove = false;
      if (b.kind === 'orb') {            // Hellzone orb: waits in the hand, arcs up and over, then comes down on its spot
        if (b.t < b.delay) { b.vis = false; continue; }
        b.vis = true;
        const u = uClamp01((b.t - b.delay) / b.fly);
        b.x = uLerp(b.sx, b.tx, u); b.y = uLerp(b.sy, b.ty, u);
        b.z = 36 + Math.sin(u * Math.PI) * b.arc * (1 - u * 0.2) - u * 36;
        if (u >= 1) {
          remove = true;
          audio.playImpactBoom(0.7);
          if (window.fx) { window.fx.addShockwave(b.tx, b.ty, 96, '#ef4444', 4, 0.28); window.fx.addImpactStarburst && window.fx.addImpactStarburst(b.tx, b.ty - 20, '#fecaca', 0.8, 0.18, 14); window.fx.triggerShake(5, 0.1); }
          this.strike(boss, b.tx, b.ty, 150, b.coeff, b.name, b.stagger, { impulseStrength: 0.4, hitX: b.tx, hitY: b.ty });
        }
      } else {                            // flick: straight, short, stops on the boss
        b.x += Math.cos(b.ang) * b.speed * dt; b.y += Math.sin(b.ang) * b.speed * dt * T;
        if (!b.hit && boss && boss.hp > 0 && Math.hypot(boss.x - b.x, (boss.y - b.y) / T) < b.r + 62) {
          b.hit = true; remove = true;
          this.strike(boss, b.x, b.y, 9999, b.coeff, b.name, b.stagger, { impulseStrength: 0.4, hitX: b.x, hitY: b.y, fill: b.fill });
          if (window.fx) window.fx.addImpactStarburst && window.fx.addImpactStarburst(b.x, b.y - 24, '#e2e8f0', 0.5, 0.14, 10);
        }
        if (b.t >= b.life) remove = true;
      }
      if (remove) this.bolts.splice(i, 1);
    }
  }

  // ----- Damage taken -------------------------------------------------------
  takeDamage(rawAmount, sourceName = 'Attack', impactOpts = null) {
    if (this.isRemote) return;
    const lethal = impactOpts && impactOpts.forceLethal;
    if (this.hIframes > 0 && !lethal) { this.noteDodge(); return; }          // slipped through a hit
    if (this.state === 'space_dash' && !lethal) this.noteDodge();
    const before = this.hp + (this.shield || 0);
    const armored = !!(this.act && (this.act.kind === 'z' || this.act.kind === 'f'));
    if (armored) {
      const keep = this.state;
      this.state = 'f_wrath';   // Breaker's super-armor flag
      super.takeDamage(rawAmount, sourceName, impactOpts);
      if (this.state === 'f_wrath') this.state = keep;
      return;
    }
    super.takeDamage(rawAmount, sourceName, impactOpts);
    if (this.hp + (this.shield || 0) < before) this.onHurt();
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
        if (this.act) { this.act = null; this.restoreChargeCamera(); this.jumpZ = 0; if (this.state === 'h_act') this.state = 'idle'; }
        if (this.hp > 0 && !this.canAct() && !this.act) this.state = 'idle';
      }
      if (k === 'space') {
        if (this.act) { this.act = null; this.restoreChargeCamera(); }
        return super.triggerSkill('space', aimX, aimY, boss, fromNetwork);
      }
      if (k === 'z') return this.castZ(boss);
      if (k === 't') return this.castT(aimX, aimY, boss);

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

  // =========================================================================
  // AUTO — a lazy three-swat combo
  // =========================================================================
  triggerBasicAttack(aimX, aimY, fromNetwork = false) {
    if (this.hp <= 0) return false;
    const a0 = this.act;
    const chaining = !!(a0 && a0.kind === 'b' && a0.t >= a0.dur * 0.6 && a0.step < 3);
    if (fromNetwork && !chaining && !this.canAct()) { this.act = null; this.state = 'idle'; }
    if (!this.canAct() && !chaining) return false;
    const step = chaining ? a0.step + 1 : ((this.bResetT > 0 && this.bStep < 3) ? this.bStep + 1 : 1);
    this.bStep = step; this.bResetT = 1.0;
    this.aimAt(null, aimX, aimY);
    const last = step === 3;
    const dur = last ? 0.55 : 0.38;
    if (chaining) { this.act = null; this.state = 'idle'; }
    this.beginAct('b', dur, { step, hit: false, last });
    const dir = { x: Math.cos(this.facingAngle), y: Math.sin(this.facingAngle) * uTilt() };
    const burst = last ? 200 : 140;
    this.attackStepVx = dir.x * burst; this.attackStepVy = dir.y * burst;
    audio.playSwordSlash(last, last ? 1.2 : 1.05);
    this.lungeFootForward(step % 2 ? this.leftFoot : this.rightFoot, 14, step % 2 ? -this.hipWidth - 2 : this.hipWidth + 2, 0.14);
    return true;
  }

  act_b(dt, boss, a) {
    const p = uClamp01(a.t / a.dur);
    this.bodySpinAngle = (a.step % 2 ? -1 : 1) * 0.25 * Math.sin(p * Math.PI);
    const hitAt = a.last ? 0.5 : 0.42;
    if (!a.hit && p >= hitAt) {
      a.hit = true;
      const cx = this.x + Math.cos(this.facingAngle) * 70, cy = this.y + Math.sin(this.facingAngle) * 70 * uTilt();
      if (window.fx) {
        const f0 = this.facingAngle, sd = a.step % 2 ? 1 : -1;
        window.fx.addSlashRibbon(this.x, this.y - 22, a.last ? 104 : 86, f0 + sd * 1.0, f0 - sd * 1.0, '#e2e8f0', a.last ? 16 : 11, 0.18);
        window.fx.triggerHitstop(a.last ? 40 : 18);
        window.fx.triggerShake(a.last ? 6 : 3, 0.12);
      }
      audio.playImpactBoom(a.last ? 0.8 : 0.5);
      this.strike(boss, cx, cy, a.last ? 130 : 112, [0, 0.5, 0.5, 0.95][a.step], `Basic Swat ${a.step}`, a.last ? 16 : 6, { isStrongMove: a.last, impulseStrength: a.last ? 1.0 : 0.6, fill: a.last ? 2.4 : 1.0 });     // autos feed gold
    }
    if (p >= 1) { this.bodySpinAngle = 0; this.endAct(); }
  }

  // =========================================================================
  // Q — FLICK: one white line from his finger that cuts whatever it crosses (no projectile)
  // =========================================================================
  castQ(ax, ay, boss) {
    this.cds.q = this.maxCds.q;
    this.aimAt(boss, ax, ay);
    this.beginAct('q', 0.42, { fired: false, ang: this.facingAngle });
    audio.playSwordSlash(false, 1.6);
    return true;
  }
  act_q(dt, boss, a) {
    this.facingAngle = a.ang;
    if (!a.fired && a.t >= 0.16) {
      a.fired = true;
      const T = uTilt(), LEN = 440;
      const x0 = this.x + Math.cos(a.ang) * 30, y0 = this.y + Math.sin(a.ang) * 30 * T;
      this.addBeamFx(x0, y0 - 42, a.ang, LEN, 16, 0.2, '#ffffff');
      this.addBeamFx(x0, y0 - 42, a.ang, LEN, 5, 0.26, '#e2e8f0');
      audio.playImpactBoom(0.6); audio.playSwordSlash(true, 1.8);
      if (window.fx) { window.fx.addShockwave(x0, y0, 40, '#e2e8f0', 3, 0.16); window.fx.addDragSparks(x0, y0 - 40, a.ang, 4, false, '#ffffff'); }
      this.beamHit(boss, x0, y0, a.ang, LEN, 14, 0.8, 'Flick [Q]', 8, { impulseStrength: 0.4, fill: 1.6 });
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // W — AFTERIMAGE STEP: he streaks forward leaving afterimages and lands behind the boss (or at the cursor, within range), facing the way
  // he ran: he never turns round. Only if the line runs THROUGH the boss does it hurt: once he lands, a flurry of afterimage punches
  // hits the boss all over the body, head, ribs, shoulders, thighs, one after another from every side.
  // =========================================================================
  castW(ax, ay, boss) {
    this.cds.w = this.maxCds.w;
    const T = uTilt(), RANGE = 330;
    this.aimAt(boss, ax, ay);
    const mw = this.mouseWorld();
    const dx = mw.x - this.x, dy = (mw.y - this.y) / T, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    let dist = Math.min(RANGE, Math.max(110, d)), through = false;
    if (boss && boss.hp > 0) {
      const bx = boss.x - this.x, by = (boss.y - this.y) / T;
      const along = bx * ux + by * uy, side = Math.abs(-bx * uy + by * ux);
      if (along > 30 && along <= RANGE && side < 95) { dist = along + 125; through = true; }     // the aim runs through the boss: land behind it
    }
    const ang = Math.atan2(uy, ux);                                // the way he runs; he keeps facing it all the way through
    this.facingAngle = ang;
    this.beginAct('w', 0.8, { sx: this.x, sy: this.y, ux, uy, dist, through, ang, stage: 0, hits: 0, nextHit: 0.3, lastAf: 0, spots: uPunchOrder() });
    this.hIframes = Math.max(this.hIframes, 0.85);
    this.addRestraint(UB_MOVE_FILL, 'dodge');
    audio.playSwordSlash(false, 1.3);
    return true;
  }
  act_w(dt, boss, a) {
    const T = uTilt(), STEP = 26, DASH0 = 0.14, DASH1 = 0.27;
    this.hIframes = Math.max(this.hIframes, 0.1);
    this.facingAngle = a.ang;
    if (a.stage === 0) {                                            // the small step before the dash
      const s = uEaseOut(a.t / DASH0);
      this.x = a.sx + a.ux * STEP * s; this.y = a.sy + a.uy * STEP * s * T; this.targetX = this.x; this.targetY = this.y;
      if (a.t >= DASH0) {
        a.stage = 1;
        audio.playSwordSlash(true, 1.9);
        if (window.fx) { window.fx.addShockwave(this.x, this.y, 60, '#e2e8f0', 3, 0.22); window.fx.addDragSparks(this.x, this.y - 40, a.ang + Math.PI, 6, false, '#ffffff'); }
        this.addBeamFx(a.sx, a.sy - 36, Math.atan2(a.uy * T, a.ux), Math.hypot(a.dist * a.ux, a.dist * a.uy * T), 7, 0.22, '#e2e8f0');     // the path he took, a thin line left in the air
      }
    }
    if (a.stage === 1) {                                            // the dash: a streak of afterimages
      const k = uEaseOut(uClamp01((a.t - DASH0) / (DASH1 - DASH0))), d = STEP + (a.dist - STEP) * k;
      this.x = a.sx + a.ux * d; this.y = a.sy + a.uy * d * T; this.targetX = this.x; this.targetY = this.y;
      this.ghostA = 0.5;                                           // see-through while he streaks
      if (window.fx && d - a.lastAf >= 20) { a.lastAf = d; uAfter(this.x - a.ux * 10, this.y - a.uy * 10 * T, a.ang, '#e2e8f0'); }
      if (a.t >= DASH1) {
        a.stage = 2; this.ghostA = 0; this.snapFeetToBody();
        if (window.fx) { window.fx.addShockwave(this.x, this.y, 70, '#e2e8f0', 3, 0.24); window.fx.addDragSparks(this.x, this.y - 30, a.ang + Math.PI, 8, false, '#ffffff'); }
      }
    }
    if (a.through && boss && boss.hp > 0 && a.stage >= 2 && a.hits < 9 && a.t >= a.nextHit) {      // the flurry: a punch on a different part of the body each time
      const n = a.hits++, last = a.hits === 9;
      const base = last ? { s: 0, u: 84 } : a.spots[n % a.spots.length];
      const sp = last ? base : { s: base.s + (Math.random() - 0.5) * 22, u: base.u + (Math.random() - 0.5) * 18 };   // a random spot near that part of the body
      a.nextHit += last ? 0 : 0.035 + Math.random() * 0.03 + (n === 7 ? 0.05 : 0);   // uneven rhythm, a short beat before the last one
      const px = boss.x + sp.s, py = boss.y;                         // sp.s sideways on screen, sp.u height of the spot on the body
      const an = Math.atan2(0, sp.s || (Math.random() - 0.5)) + (Math.random() - 0.5) * 2.2;   // he punches in from the side the spot is on
      audio.playSwordSlash(last, 1.3 + a.hits * 0.08); audio.playImpactBoom(last ? 0.9 : 0.4);
      this.addVfx({ kind: 'punch', x: px, y: py - sp.u, ang: an, dur: last ? 0.38 : 0.24, big: last });
      if (window.fx) {
        window.fx.triggerHitstop(last ? 55 : 12); window.fx.triggerShake(last ? 9 : 3, 0.1);
        if (window.fx.addImpactStarburst) window.fx.addImpactStarburst(px, py - sp.u, '#ffffff', last ? 1.5 : 0.7, 0.16, last ? 20 : 8);
        if (last) window.fx.addShockwave(boss.x, boss.y, 130, '#e2e8f0', 5, 0.3);
      }
      this.strike(boss, boss.x, boss.y, 9999, last ? 0.85 : 0.26, `Afterimage Punch ${a.hits} [W]`, last ? 12 : 3, { head: true, impulseStrength: last ? 0.9 : 0.3, hitX: boss.x, hitY: boss.y, fill: last ? 1.0 : 0.4, src: n % 2 ? 'skill' : 'dodge' });     // the punches alternate blue and gold
      if (last && this.strikeLanded) this.addRestraint(1.0, 'dodge');     // the last one feeds both
    }
    if (a.t >= a.dur) { this.ghostA = 0; this.endAct(); }
  }
  // =========================================================================
  // E — PALM PULSE: a flat-handed smack on the nearest break point
  // =========================================================================
  castE(ax, ay, boss) {
    this.cds.e = this.maxCds.e;
    this.aimAtBoss(boss, ax, ay);
    let lunge = 40;
    if (boss && boss.hp > 0) lunge = Math.max(0, Math.min(180, Math.hypot(boss.x - this.x, (boss.y - this.y) / uTilt()) - 120));
    this.beginAct('e', 0.7, { fired: false, ang: this.facingAngle, sx: this.x, sy: this.y, lunge });
    this.hIframes = Math.max(this.hIframes, 0.16);
    audio.playSwordSlash(false, 1.1);
    return true;
  }
  act_e(dt, boss, a) {
    const T = uTilt();
    this.facingAngle = a.ang;
    if (a.t < 0.2) { const s = uEaseOut(a.t / 0.2); this.x = a.sx + Math.cos(a.ang) * a.lunge * s; this.y = a.sy + Math.sin(a.ang) * a.lunge * s * T; this.targetX = this.x; this.targetY = this.y; }
    if (!a.fired && a.t >= 0.32) {
      a.fired = true;
      const bp = (boss && boss.hp > 0) ? this.nearestBreakPoint(boss) : { x: this.x + Math.cos(a.ang) * 80, y: this.y + Math.sin(a.ang) * 80 * T };
      audio.playImpactBoom(1.5); audio.playSwordSlash(true, 1.0);
      if (window.fx) {
        window.fx.triggerShake(13, 0.22); window.fx.triggerHitstop(70);
        window.fx.addShockwave(bp.x, bp.y, 90, '#ffffff', 6, 0.2);
        window.fx.addImpactStarburst && window.fx.addImpactStarburst(bp.x, bp.y - 26, '#ffffff', 1.5, 0.24, 24);
        window.fx.addDragSparks(bp.x, bp.y - 26, a.ang, 10, false, '#e2e8f0');
      }
      this.addVfx({ kind: 'smack', x: bp.x, y: bp.y - 26, dur: 0.28 });
      this.strike(boss, bp.x, bp.y, 9999, 1.7, 'Palm Pulse [E]', 24, { isStrongMove: true, impulseStrength: 1.2, hitX: bp.x, hitY: bp.y, head: true, partBreakMult: 2.0, fill: 3.2 });
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // R — PRESS
  // =========================================================================
  castR(ax, ay, boss) {
    this.cds.r = this.maxCds.r;
    this.aimAtBoss(boss, ax, ay);
    const mw = this.mouseWorld();
    let tx = mw.x, ty = mw.y;
    if (boss && boss.hp > 0) { tx = boss.x; ty = boss.y; }
    else { const d = Math.hypot(tx - this.x, (ty - this.y) / uTilt()); if (d > 300) { tx = this.x + (tx - this.x) * 300 / d; ty = this.y + (ty - this.y) * 300 / d; } }
    this.beginAct('r', 1.05, { tx, ty, n: 0, nextT: 0.3, done: false });
    audio.playSwordSlash(false, 0.9);
    return true;
  }
  act_r(dt, boss, a) {
    const T = uTilt();
    if (boss && boss.hp > 0 && !a.done) { a.tx = boss.x; a.ty = boss.y; }
    this.facingAngle = Math.atan2((a.ty - this.y) / T, a.tx - this.x);
    this.lift = uClamp01(a.t / 0.3);
    if (!a.disc && a.t >= 0.28) { a.disc = true; this.addVfx({ kind: 'press', x: a.tx, y: a.ty, r: 130, dur: 0.85, col: '#e2e8f0' }); }
    while (a.n < 3 && a.t >= a.nextT) {
      a.n++; a.nextT += 0.22;
      audio.playImpactBoom(0.7);
      if (window.fx) { window.fx.addShockwave(a.tx, a.ty, 110, '#e2e8f0', 4, 0.22); window.fx.triggerShake(5, 0.1); }
      this.strike(boss, a.tx, a.ty, 150, 0.45, `Press ${a.n} [R]`, 6, { impulseStrength: 0.4, fill: 1.0 });
    }
    if (!a.done && a.n >= 3 && a.t >= a.nextT) {
      a.done = true;
      audio.playImpactBoom(1.3);
      if (window.fx) { window.fx.addShockwave(a.tx, a.ty, 160, '#ffffff', 7, 0.35); window.fx.triggerShake(10, 0.2); window.fx.triggerHitstop(40); }
      this.strike(boss, a.tx, a.ty, 160, 1.1, 'Press Crush [R]', 14, { isStrongMove: true, impulseStrength: 0.9, fill: 1.2 });
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // A — INSTANT STEP
  // =========================================================================
  castA(ax, ay, boss) {
    this.cds.a = this.maxCds.a;
    this.aimAt(boss, ax, ay);
    this.beginAct('a', 0.3, { sx: this.x, sy: this.y, ang: this.facingAngle });
    this.hIframes = Math.max(this.hIframes, 0.26);
    this.addRestraint(UB_MOVE_FILL, 'dodge');
    audio.playSwordSlash(false, 1.9);
    return true;
  }
  act_a(dt, boss, a) {
    const D = 190, s = uEaseOut(a.t / 0.18);
    this.x = a.sx + Math.cos(a.ang) * D * s; this.y = a.sy + Math.sin(a.ang) * D * s * uTilt();
    this.targetX = this.x; this.targetY = this.y;
    this.hIframes = Math.max(this.hIframes, 0.05);
    if (window.fx && a.t < 0.2 && Math.random() < dt * 80) uAfter(this.x, this.y, this.facingAngle, '#cbd5e1');
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // S — REBUKE (stub: the boss side is not built yet)
  // =========================================================================
  castS(ax, ay, boss) {
    this.aimAtBoss(boss, ax, ay);
    this.beginAct('s', 0.42, { resolved: false, ok: false });
    audio.playSwordSlash(false, 1.9);
    return true;
  }
  act_s(dt, boss, a) {
    const T = uTilt();
    if (!a.resolved) {                           // checked the first frame: the swat animation is just the follow-through
      a.resolved = true;
      // the boss answers with 'stop' (the swing is cut off), 'block' (the hit is negated but the pattern goes on), 'shrug' (it ignores you) or false (a miss)
      let res = false;
      if (boss && boss.hp > 0 && typeof boss.tryRebuke === 'function' && Math.hypot(boss.x - this.x, (boss.y - this.y) / T) < 190) res = boss.tryRebuke(this);
      if (res === true) res = 'stop';
      a.res = res;
      if (window.fx) {
        const f0 = this.facingAngle;
        window.fx.addSlashRibbon(this.x, this.y - 30, 80, f0 - 0.7, f0 + 0.7, '#ffffff', 8, 0.12);
        if (res === 'block') window.fx.addShockwave(this.x + Math.cos(f0) * 34, this.y, 70, '#e2e8f0', 4, 0.22);
      }
      if (res === 'stop') { this.addRestraint(12, 'counter'); this.cds.s = 0.4; }
      else if (res === 'block') { this.hIframes = Math.max(this.hIframes, 0.5); this.addRestraint(6, 'counter'); this.cds.s = 0.8; }       // a block feeds the meter at half the gain
      else this.cds.s = this.maxCds.s;           // a miss (or being shrugged off) locks the key for a moment so it cannot be mashed
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // D — CATCH (the counter)
  // =========================================================================
  castD(ax, ay, boss) {
    this.cds.d = this.maxCds.d;
    this.aimAt(boss, ax, ay);
    const a = this.beginAct('d', 0.55, { hit: false, countered: false });
    audio.playSwordSlash(false, 1.2);
    if (boss && typeof boss.isCounterable === 'function' && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 215) this.doCatch(boss, a);
    return true;
  }
  doCatch(boss, a) {
    if (a.countered) return;
    a.countered = true; a.hit = true;
    this.executeBreakerCounterSuccess(boss);
    if (!this.isRemote) {
      this.shield = Math.min(this.maxHp * 0.3, (this.shield || 0) + Math.round(this.maxHp * 0.1));
      this.addRestraint(30, 'counter');
    }
    this.say('CAUGHT', '#e2e8f0', 14);
    if (window.fx) { window.fx.addShockwave(this.x, this.y, 150, '#e2e8f0', 6, 0.4); window.fx.addDragSparks(this.x, this.y - 30, -Math.PI / 2, 10, false, '#ffffff'); }
  }
  act_d(dt, boss, a) {
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    this.lift = a.t < 0.3 ? 0.7 : 0.7 * (1 - uClamp01((a.t - 0.3) / 0.2));
    if (!a.hit && a.t >= 0.26) {
      a.hit = true;
      if (boss && typeof boss.isCounterable === 'function' && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 215) { a.hit = false; this.doCatch(boss, a); }
      else {
        const cx = this.x + cosA * 64, cy = this.y + sinA * 64 * uTilt();
        if (window.fx) window.fx.addSlashRibbon(this.x, this.y, 100, this.facingAngle - 0.5, this.facingAngle + 0.5, '#e2e8f0', 12, 0.16);
        this.strike(boss, cx, cy, 120, 0.7, 'Catch Slap [D]', 8, { impulseStrength: 0.6, head: true, fill: 0.8 });
      }
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // F — BACKHAND
  // =========================================================================
  castF(ax, ay, boss) {
    this.cds.f = this.maxCds.f;
    this.aimAtBoss(boss, ax, ay);
    let lunge = 0;
    if (boss && boss.hp > 0) lunge = Math.max(0, Math.min(200, Math.hypot(boss.x - this.x, (boss.y - this.y) / uTilt()) - 125));
    this.beginAct('f', 0.85, { fired: false, ang: this.facingAngle, sx: this.x, sy: this.y, lunge });
    audio.playSwordSlash(false, 0.9);
    return true;
  }
  // The back of the hand: it winds up across his body to the LEFT, then sweeps out to the RIGHT through whatever is in front of him
  // (the hit lands on the boss itself, he closes the distance first and keeps facing it until the swing is committed).
  act_f(dt, boss, a) {
    const T = uTilt();
    if (!a.fired && a.t < 0.3 && boss && boss.hp > 0) a.ang = Math.atan2((boss.y - this.y) / T, boss.x - this.x);      // tracks the boss during the wind-up
    this.facingAngle = a.ang;
    const wind = uEaseOut(uClamp01((a.t - 0.08) / 0.3));
    this.bodySpinAngle = a.t < 0.44 ? -0.7 * wind : (a.t < 0.58 ? uLerp(-0.7, 0.5, uEaseOut((a.t - 0.44) / 0.1)) : 0.5 * (1 - uEaseOut((a.t - 0.58) / 0.25)));
    if (a.lunge > 0 && a.t > 0.26 && a.t < 0.44) { const s = uEaseOut((a.t - 0.26) / 0.18); this.x = a.sx + Math.cos(a.ang) * a.lunge * s; this.y = a.sy + Math.sin(a.ang) * a.lunge * s * T; this.targetX = this.x; this.targetY = this.y; }
    if (!a.fired && a.t >= 0.44) {
      a.fired = true;
      const cx = this.x + Math.cos(a.ang) * 78, cy = this.y + Math.sin(a.ang) * 78 * T;
      audio.playImpactBoom(1.4); audio.playSwordSlash(true, 1.1);
      if (window.fx) {
        window.fx.addSlashRibbon(this.x, this.y - 28, 130, a.ang - 1.5, a.ang + 1.5, '#e2e8f0', 22, 0.26);       // left to right
        window.fx.addSlashRibbon(this.x, this.y - 28, 124, a.ang - 1.5, a.ang + 1.5, '#ffffff', 8, 0.2);
        window.fx.triggerShake(12, 0.22); window.fx.triggerHitstop(60); window.fx.addShockwave(cx, cy, 130, '#e2e8f0', 6, 0.32);
      }
      this.strike(boss, cx, cy, 150, 2.0, 'Backhand [F]', 28, { isStrongMove: true, impulseStrength: 1.4, head: true, fill: 3.2 });
    }
    if (a.t >= a.dur) { this.bodySpinAngle = 0; this.endAct(); }
  }
  // =========================================================================
  // Z — RELEASE (the form is whatever filled the meter the most)
  // =========================================================================
  castZ(boss) {
    if (this.cds.z > 0 || !this.canAct()) return false;
    if (!this.isRemote && !this.full) return false;                 // quiet: the full meter is shown on the HUD, no text needed
    const f = this.formKey;
    this.cds.z = this.maxCds.z;
    const T = uTilt(), mw = this.mouseWorld(), hasBoss = boss && boss.hp > 0;
    const bonus = (!this.isRemote && this.clean) ? UB_CLEAN_BONUS : 1;
    if (!this.isRemote) { this.restraint = 0; this.tally = { dodge: 0, counter: 0, skill: 0 }; this.clean = true; }
    let ang, extra = {};
    if (f === 'beam') {
      ang = Math.atan2((mw.y - this.y) / T, mw.x - this.x);          // fixed at the cast: it goes straight ahead, it never follows the cursor
    } else if (f === 'hell') {
      let tx = mw.x, ty = mw.y;                                      // the marker goes on the boss (and follows it until the clap); no boss: the cursor, in reach
      if (hasBoss) { tx = boss.x; ty = boss.y; }
      else {
        const d = Math.hypot(tx - this.x, (ty - this.y) / T);
        if (d > UB_HELL_REACH) { tx = this.x + (tx - this.x) * UB_HELL_REACH / d; ty = this.y + (ty - this.y) * UB_HELL_REACH / d; }
      }
      ang = Math.atan2((ty - this.y) / T, tx - this.x);
      extra = { tx, ty, orbs: [] };
    } else {
      const hx = hasBoss ? boss.x : this.x + Math.cos(this.facingAngle) * 260, hy = hasBoss ? boss.y : this.y + Math.sin(this.facingAngle) * 260 * T;
      ang = Math.atan2((hy - this.y) / T, hx - this.x);
      extra = { hx, hy, hz: 360 };
    }
    this.facingAngle = ang;
    this.beginAct('z', f === 'beam' ? 2.95 : (f === 'hell' ? 3.2 : 3.6), Object.assign({ form: f, ang, bonus, n: 0, ticks: 0, tick: 0, fired: false, ended: false }, extra));
    if (bonus > 1) this.say('UNTOUCHED', '#fde68a', 13);
    this.saveCamera();
    audio.playParryClang && audio.playParryClang(true);
    return true;
  }

  act_z(dt, boss, a) {
    const F = UB_FORMS[a.form] || UB_FORMS.beam;
    this.speed = 0; this.vx = 0; this.vy = 0;
    this.hIframes = Math.max(this.hIframes, 0.15);                  // untouchable for the whole Release
    this.facingAngle = a.ang;
    this.auraWant = 0.5;                                            // a calm glow: he is barely trying
    if (a.form === 'beam') this.zBeam(dt, boss, a, F);
    else if (a.form === 'hell') this.zHell(dt, boss, a, F);
    else this.zPress(dt, boss, a, F);
    if (a.t >= a.dur) { this.restoreChargeCamera(); this.lift = 0; this.endAct(); }
  }
  zEase(c, k) {                                                      // the camera eases back a little while a Release plays
    const cam = this.isLocal && window.game ? window.game.camera : null;
    if (cam) cam.targetZoom = Math.max(0.84, (this._chargeSavedZoom || 1.05) - k * c);
  }

  // PALM BEAM: the air in front of him is pulled into one point for 0.75s, then it goes straight ahead, wherever he faced when he
  // cast it. A long stream of small hits while it runs, then one last push.
  zBeam(dt, boss, a, F) {
    const T = uTilt(), ca = Math.cos(a.ang), sa = Math.sin(a.ang);
    a.px = this.x + ca * 62; a.py = this.y + sa * 62 * T;            // the point in front of him (on the floor; it is drawn 52 up)
    if (a.t < UB_BEAM_CHG) {
      const c = a.t / UB_BEAM_CHG;
      this.zEase(uEaseOut(c), 0.12);
      if (Math.random() < dt * 9) audio.playQteKeySound && audio.playQteKeySound(true, 1 + Math.floor(c * 8));
      return;
    }
    if (!a.fired) {
      a.fired = true;
      audio.playImpactBoom(1.8); audio.playSwordSlash(true, 1.4);
      if (window.fx) { window.fx.triggerHitstop(60); window.fx.triggerShake(14, 0.3); window.fx.triggerZoomPunch(0.06); if (this.isLocal) window.fx.triggerImpactFrame(F.col, 0.1); window.fx.addShockwave(a.px, a.py, 120, '#ffffff', 5, 0.35); }
    }
    const ft = a.t - UB_BEAM_CHG;
    if (ft < UB_BEAM_LEN_T) {
      this.x -= ca * 14 * dt; this.y -= sa * 14 * dt * T; this.targetX = this.x; this.targetY = this.y;     // it leans him back a touch
      a.tick -= dt;
      while (a.tick <= 0 && a.ticks < UB_BEAM_TICKS) {
        a.tick += UB_BEAM_LEN_T / UB_BEAM_TICKS; a.ticks++;
        this.beamHit(boss, a.px, a.py, a.ang, UB_BEAM_REACH, UB_BEAM_HALF, 2.04, 'Palm Beam [Z]', 3, { impulseStrength: 0.15 });
        if (a.ticks % 3 === 0) audio.playSwordSlash(false, 1.5 + Math.random() * 0.4);
      }
      if (window.fx && Math.random() < dt * 14) window.fx.triggerShake(4, 0.08);
      if (window.fx && Math.random() < dt * 12) { const u = 120 + Math.random() * 800; window.fx.addDragSparks(a.px + ca * u, a.py + sa * u * T, a.ang + (Math.random() < 0.5 ? 1.3 : -1.3), 2, false, F.core); }
    } else if (!a.ended) {
      a.ended = true;
      audio.playImpactBoom(2.0);
      if (window.fx) { window.fx.triggerHitstop(90); window.fx.triggerShake(20, 0.4); window.fx.triggerZoomPunch(0.08); window.fx.addShockwave(a.px, a.py, 220, F.col, 8, 0.45); }
      this.beamHit(boss, a.px, a.py, a.ang, UB_BEAM_REACH, UB_BEAM_HALF + 25, 15.4, 'Palm Beam Finale [Z]', 30, { isStrongMove: true, impulseStrength: 1.3, head: true, partBreakMult: 1.2 });
    }
  }

  // HELLZONE: a marker on the floor, orbs blink into being all around it one after another, he brings his hands together, and every
  // orb slams into the middle at the same moment. Only what is standing in the marker is hit.
  zHell(dt, boss, a, F) {
    const T = uTilt(), H = UB_HELL;
    if (!a.clapped && boss && boss.hp > 0) { a.tx = boss.x; a.ty = boss.y; this.facingAngle = a.ang = Math.atan2((a.ty - this.y) / T, a.tx - this.x); }   // the marker (and the orbs round it) follow the boss until the clap
    while (a.orbs.length < H.N && a.t >= H.SUMMON + a.orbs.length * H.GAP) {
      const i = a.orbs.length, an = i / H.N * Math.PI * 2 + (Math.random() - 0.5) * 0.4, r = 140 + Math.random() * 70;
      const o = { ox: Math.cos(an) * r, oy: Math.sin(an) * r * T, z: 45 + Math.random() * 130, born: a.t, ph: Math.random() * 6.28 };     // offsets from the marker
      a.orbs.push(o);
      audio.playQteKeySound && audio.playQteKeySound(true, 2 + (i % 7));
      if (window.fx && window.fx.addImpactStarburst) window.fx.addImpactStarburst(a.tx + o.ox, a.ty + o.oy - o.z, '#fecaca', 0.5, 0.14, 8);
    }
    this.zEase(uClamp01(a.t / 0.8), 0.14);
    if (!a.clapped && a.t >= H.CLAP) {
      a.clapped = true;
      audio.playParryClang && audio.playParryClang(true); audio.playImpactBoom(0.8);
      if (window.fx) { window.fx.triggerHitstop(45); window.fx.addShockwave(this.x, this.y, 70, '#ffffff', 3, 0.22); }
    }
    const land = H.CLAP + H.FLY;
    if (a.clapped && !a.landed && a.t >= land) {
      a.landed = true;
      audio.playImpactBoom(1.8);
      if (window.fx) { window.fx.triggerShake(16, 0.3); window.fx.addShockwave(a.tx, a.ty, 200, F.col, 7, 0.4); if (this.isLocal) window.fx.triggerImpactFrame(F.col, 0.08); }
    }
    while (a.landed && a.n < H.N && a.t >= land + a.n * 0.025) {     // one hit per orb, in a rapid run
      a.n++;
      if (window.fx && window.fx.addImpactStarburst && a.n % 2) window.fx.addImpactStarburst(a.tx + (Math.random() - 0.5) * 90, a.ty - 30 - Math.random() * 60, '#fecaca', 0.7, 0.16, 10);
      this.strike(boss, a.tx, a.ty, UB_HELL_R, 4.73, 'Hellzone Orb [Z]', 4, { impulseStrength: 0.35, hitX: a.tx, hitY: a.ty });
    }
    if (!a.ended && a.t >= H.FIN) {
      a.ended = true;
      audio.playImpactBoom(2.3); audio.playCounterSuccessBoom && audio.playCounterSuccessBoom();
      if (window.fx) {
        window.fx.triggerHitstop(120); window.fx.triggerShake(26, 0.55); window.fx.triggerZoomPunch(0.1);
        if (this.isLocal) window.fx.triggerImpactFrame('#ffffff', 0.14);
        window.fx.addShockwave(a.tx, a.ty, 340, F.col, 11, 0.6); window.fx.addShockwave(a.tx, a.ty, 190, '#ffffff', 7, 0.4); window.fx.addPillar(a.tx, a.ty, 110, F.col, 0.8);
        window.fx.spawnMassiveEarthChunks && window.fx.spawnMassiveEarthChunks(a.tx, a.ty, 10, '#475569');
      }
      this.strike(boss, a.tx, a.ty, UB_HELL_R + 50, 16.5, 'Hellzone Finale [Z]', 36, { isStrongMove: true, impulseStrength: 2.0, hitX: a.tx, hitY: a.ty, head: true, partBreakMult: 1.2 });
    }
  }

  // GRAVITY PRESS: a colossal ghost of his own hand forms in the air over the target. He taps the air palm-down, like he is telling
  // someone to keep it down, and the giant hand copies him, pressing the target into the floor. The last one he actually means.
  zPress(dt, boss, a, F) {
    const T = uTilt(), P = UB_PRESS;
    if (boss && boss.hp > 0 && !a.locked) { a.hx = boss.x; a.hy = boss.y; a.ang = Math.atan2((a.hy - this.y) / T, a.hx - this.x); }
    if (!a.locked && a.t >= P.SLAM - 0.3) a.locked = true;           // the wind-up: from here on the hand comes down where it is
    a.hz = uPressHandZ(a.t);
    this.zEase(uClamp01(a.t / 0.6), 0.14);
    if (!a.formed && a.t >= 0.05) { a.formed = true; audio.playImpactBoom(0.9); if (window.fx) window.fx.addShockwave(a.hx, a.hy, 200, F.col, 3, 0.5); }
    while (a.n < P.TAPS.length && a.t >= P.TAPS[a.n]) {
      a.n++;
      audio.playImpactBoom(0.8 + a.n * 0.15);
      if (window.fx) {
        window.fx.triggerShake(6 + a.n * 2, 0.16); window.fx.addShockwave(a.hx, a.hy, 150 + a.n * 25, F.col, 5, 0.3);
        window.fx.addFissureLine && window.fx.addFissureLine(a.hx, a.hy, a.hx + (Math.random() - 0.5) * 320, a.hy + (Math.random() - 0.5) * 150, F.col, 3 + a.n);
      }
      this.strike(boss, a.hx, a.hy, 9999, 5.94, `Gravity Press ${a.n} [Z]`, 10, { impulseStrength: 0.5, hitX: a.hx, hitY: a.hy, isStrongMove: true, partBreakMult: 1.4 });
    }
    if (!a.ended && a.t >= P.SLAM) {
      a.ended = true;
      audio.playImpactBoom(2.4); audio.playSwordPlant && audio.playSwordPlant();
      if (window.fx) {
        window.fx.triggerHitstop(150); window.fx.triggerShake(32, 0.7); window.fx.triggerZoomPunch(0.12);
        if (this.isLocal) window.fx.triggerImpactFrame('#ffffff', 0.18);
        window.fx.addShockwave(a.hx, a.hy, 400, F.col, 12, 0.7); window.fx.addShockwave(a.hx, a.hy, 230, '#ffffff', 7, 0.5);
        window.fx.spawnMassiveEarthChunks && window.fx.spawnMassiveEarthChunks(a.hx, a.hy, 14, '#475569');
        for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; window.fx.addFissureLine && window.fx.addFissureLine(a.hx, a.hy, a.hx + Math.cos(an) * 320, a.hy + Math.sin(an) * 320 * T, F.col, 6); }
      }
      this.strike(boss, a.hx, a.hy, 9999, 33.0, 'Gravity Press Crush [Z]', 70, { isStrongMove: true, impulseStrength: 2.2, hitX: a.hx, hitY: a.hy, head: true, partBreakMult: 2.0 });
    }
    if (!a.shattered && a.t >= P.SLAM + 0.55) {                      // the hand breaks up into gold dust
      a.shattered = true;
      audio.playSwordSlash(true, 0.7);
      if (window.fx) for (let i = 0; i < 14; i++) { const an = Math.random() * Math.PI * 2; window.fx.addDragSparks(a.hx + Math.cos(an) * 60, a.hy - 20, an, 2, false, i % 2 ? F.col : F.core); }
    }
  }

  // =========================================================================
  // T — TOSS AROUND
  // =========================================================================
  castT(ax, ay, boss) {
    if (this.cds.t > 0 || !this.canAct()) return false;
    if (!boss || boss.hp <= 0) { this.say('No target', '#fca5a5', 12); return false; }
    const T = uTilt();
    if (Math.hypot(boss.x - this.x, (boss.y - this.y) / T) > 175) { this.say('Too far', '#fca5a5', 12); return false; }       // it is a grab: right next to the boss
    // the shared hold rule: a boss in a mechanic shrugs the grab off. A grab that did connect refunds half the cooldown; a total whiff does not.
    if (uHoldBlocked(boss)) {
      this.cds.t = this.maxCds.t * 0.5;          // in reach, so it did connect with the boss: half the cooldown comes back
      this.beginAct('t', 1.1, { phase: 'bounce', phaseT: 0, boss, bounced: true });
      this.aimAt(null, boss.x, boss.y);
      this.hIframes = Math.max(this.hIframes, 0.3);
      return true;
    }
    this.cds.t = this.maxCds.t;
    this.aimAt(null, boss.x, boss.y);
    this.beginAct('t', 5.2, { phase: 'throw', phaseT: 0, boss, n: 0, locked: false, ang: this.facingAngle, sx: this.x, sy: this.y });
    this.hIframes = Math.max(this.hIframes, 0.6);
    this.saveCamera();
    audio.playImpactBoom(0.8);
    return true;
  }

  act_t(dt, boss, a) {
    a.phaseT += dt;
    const bs = a.boss || boss, T = uTilt();
    const cam = (this.isLocal && window.game) ? window.game.camera : null;
    const saved = this._chargeSavedZoom || 1.05;
    this.hIframes = Math.max(this.hIframes, 0.2);               // untouchable the whole time
    this.speed = 0; this.vx = 0; this.vy = 0;
    if (!bs || bs.hp <= 0) { if (bs) bs.jumpZ = 0; this.restoreChargeCamera(); this.endAct(); return; }
    this.facingAngle = Math.atan2((bs.y - this.y) / T, bs.x - this.x);

    if (a.phase === 'bounce') {                                  // the boss is busy: the grab slides off with a small shove
      if (!a.shoved && a.phaseT >= 0.2) { a.shoved = true; audio.playParryClang && audio.playParryClang(false); if (window.fx) window.fx.addShockwave(this.x + Math.cos(this.facingAngle) * 50, this.y, 70, '#e2e8f0', 4, 0.25); }
      if (a.phaseT >= 0.9) this.endAct();
      return;
    }
    if (a.phase === 'throw') {                                   // the jacket comes off and is flung away
      if (!a.thrown && a.phaseT >= 0.12) {
        a.thrown = true;
        const side = Math.random() < 0.5 ? -1 : 1, bk = this.facingAngle + Math.PI + side * 0.8;
        this.addVfx({ kind: 'jacket', x: this.x, y: this.y, z: 52, vx: Math.cos(bk) * 210, vy: Math.sin(bk) * 210, vz: 300, rot: 0, spin: side * 9, air: 1.2, dur: 6.5 });
        audio.playSwordSlash(false, 2.0);
        if (window.fx) window.fx.addDragSparks(this.x, this.y - 50, bk, 4, false, '#cbd5e1');
      }
      if (a.phaseT >= 0.45) { a.phase = 'grab'; a.phaseT = 0; }
      return;
    }
    if (a.phase === 'grab') {                                    // a step in, a hand closes on the boss
      const dist = Math.hypot(bs.x - this.x, (bs.y - this.y) / T);
      if (dist > 100) { const s = Math.min(dist - 100, 520 * dt); this.x += Math.cos(this.facingAngle) * s; this.y += Math.sin(this.facingAngle) * s * T; this.targetX = this.x; this.targetY = this.y; }
      if (a.phaseT >= 0.35) {
        a.phase = 'power'; a.phaseT = 0; a.locked = true;
        audio.playImpactBoom(1.4); audio.playParryClang && audio.playParryClang(true);
        if (typeof bs.lockInPlaceForUltimate === 'function') bs.lockInPlaceForUltimate(3.8, 3.4, this.isRemote);
        if (window.fx) { window.fx.triggerHitstop(80); window.fx.triggerShake(14, 0.3); window.fx.addShockwave(bs.x, bs.y, 160, '#e2e8f0', 6, 0.4); }
      }
      return;
    }
    if (a.phase === 'power') {                                   // only now does he power up (silver aura, no hair change), the boss hanging in his grip
      this.auraWant = 1;
      const c = uClamp01(a.phaseT / 0.7);
      if (cam) cam.targetZoom = Math.max(0.88, saved - c * 0.12);
      if (window.fx && Math.random() < dt * (40 + 80 * c)) { const an = Math.random() * 6.28; window.fx.addDragSparks(this.x + Math.cos(an) * 60, this.y - 40 + Math.sin(an) * 30, an + Math.PI, 1, false, '#e2e8f0'); }
      a.ringT = (a.ringT || 0) - dt;                           // rings of force rolling off him, like a charging fighter
      if (a.ringT <= 0 && window.fx) { a.ringT = 0.22; window.fx.addShockwave(this.x, this.y, 70 + 70 * c, '#e2e8f0', 3, 0.3); if (this.isLocal) window.fx.triggerShake(3 + 4 * c, 0.1); }
      if (!a.rumble && a.phaseT >= 0.05) { a.rumble = true; audio.playImpactBoom(1.0); if (window.fx) { window.fx.addShockwave(this.x, this.y, 150, '#ffffff', 7, 0.5); window.fx.addPillar(this.x, this.y, 70, '#e2e8f0', 0.7); } }
      if (a.phaseT >= 0.7) { a.phase = 'toss'; a.phaseT = 0; a.n = 0; }
      return;
    }
    if (a.phase === 'toss') {                                    // one hand: up and slammed down, five times, each one higher and harder
      const TOSS = 2.9, CYC = TOSS / 5, H = [38, 60, 86, 118, 160];
      this.auraWant = 1;
      const cyc = a.phaseT / CYC, ph = cyc - Math.floor(cyc), k = Math.min(4, a.n);
      const fall = 1.6 + k * 0.5;                                // later slams come down faster
      const up = ph < 0.55 ? uEaseOut(ph / 0.55) : 1 - Math.pow((ph - 0.55) / 0.45, fall);
      bs.jumpZ = up * H[k];                                      // the boss is physically held up, no animation of its own
      a.up = up; a.falling = ph >= 0.55;
      this.lift = 0.6 + up * 0.4;
      if (a.n < 5 && cyc >= a.n + 1) {
        // the bottom of a toss: the boss is driven into the floor
        a.n++;
        const n = a.n, last = n === 5;
        audio.playImpactBoom(last ? 2.2 : 0.8 + n * 0.25);
        if (window.fx) {
          window.fx.triggerShake(last ? 26 : 5 + n * 4, last ? 0.55 : 0.14 + n * 0.04); window.fx.triggerHitstop(last ? 130 : 20 + n * 16);
          window.fx.addShockwave(bs.x, bs.y, last ? 320 : 110 + n * 40, '#e2e8f0', last ? 11 : 3 + n * 1.5, last ? 0.6 : 0.22 + n * 0.05);
          if (n >= 3) window.fx.spawnMassiveEarthChunks && window.fx.spawnMassiveEarthChunks(bs.x, bs.y, last ? 14 : 4 + n * 2, '#475569');
          if (n >= 2 && window.fx.addFissureLine) for (let i = 0; i < n * 2; i++) { const an = Math.random() * Math.PI * 2, r = 60 + n * 45; window.fx.addFissureLine(bs.x, bs.y, bs.x + Math.cos(an) * r, bs.y + Math.sin(an) * r * T, '#e2e8f0', 2 + n); }
          if (n >= 4) window.fx.triggerZoomPunch(last ? 0.12 : 0.05);
          if (last) { window.fx.addPillar(bs.x, bs.y, 110, '#ffffff', 0.85); if (this.isLocal) window.fx.triggerImpactFrame('#ffffff', 0.14); }
        }
        const dmg = this.strike(bs, bs.x, bs.y, 9999, [1.8, 2.4, 3.0, 3.8, 9.1][n - 1], last ? 'Toss Around Finale [T]' : `Toss Around ${n} [T]`, last ? 60 : 6 + n * 3, { isStrongMove: true, impulseStrength: last ? 1.8 : 0.6 + n * 0.15, hitX: bs.x, hitY: bs.y, head: last, partBreakMult: last ? 1.2 : 0.6 });
        if (last) this.addRestraint(35, this.formKey === 'hell' ? 'counter' : (this.formKey === 'press' ? 'skill' : 'dodge'));     // supports whichever form is currently leading
      }
      if (a.phaseT >= TOSS) { bs.jumpZ = 0; a.phase = 'recover'; a.phaseT = 0; }
      return;
    }
    if (a.phase === 'recover') {
      bs.jumpZ = 0;
      this.auraWant = 0; this.lift = 0;
      if (a.phaseT >= 0.45) {
        this.restoreChargeCamera();
        if (bs.state === 'staggered') { bs.lockedByUltimateTimer = 0; bs.stateDuration = 3.4; bs.stateTimer = 3.4; }
        this.endAct();
      }
    }
  }

  updateHud(boss) {
    if (window.UnboundHud) window.UnboundHud.update(this, boss);
  }
}

window.UnboundPlayer25D = UnboundPlayer25D;
window.uHoldBlocked = uHoldBlocked;
if (typeof installClashQte === 'function') installClashQte(UnboundPlayer25D);

// Painted icons (game/icons/skill_unbound_<key>.png, 96x96) are picked up automatically as soon as the files exist; until then the
// emoji icons are used.
for (const k of ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z', 'space']) {
  const sk = window.SKILL_META.unbound.skills[k];
  if (!sk) continue;
  const im = new Image();
  im.onload = () => {
    sk.img = im.src.replace(/^.*\/game\//, 'game/');
    if (window.game && window.game.localPlayer && window.game.localPlayer.classId === 'unbound' && window.SkillHud) window.SkillHud.build(window.game.localPlayer);
  };
  im.src = 'game/icons/skill_unbound_' + k + '.png';
}
