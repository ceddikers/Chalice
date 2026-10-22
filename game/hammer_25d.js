// =========================================================================
// HAMMER_25D.JS — "Gravebreaker" Charge Hammer class (Lost Ark Destroyer bonk + Vindictus Karok flavour)
//
// Extends BreakerPlayer25D so movement, IK rig, hit-reactions, cape and the shared Final Clash all come for free;
// everything class-specific lives here:
//   • Passive  BROKEN   — red cracks on the boss, +5% damage taken per stack (max 3), one shared 10s timer
//   • The hammer is a resource: held / thrown (W boomerang) / grounded (lost in a Karok Clash)
//   • Q Trifecta · W Hammer Yeet · E Skyfall Leap · R Charge Smash · A Shoulder Ram · S Karok's Roar (taunt)
//     D Hoist Counter · F Bonk Barrage (3 + 3 per Broken stack bonks) · T Worldbreaker · Z Momentum (Shatter / Overload)
//   • Karok Clash (player side) — the boss-side controller lives in karok_clash.js
// =========================================================================

const BROKEN_MAX_STACKS = 3;
const BROKEN_DURATION = 10.0;
const BROKEN_DMG_PER_STACK = 0.05;

// Hammer appearance per equipped weapon (weaponModelId). Same geometry, different materials and ornaments:
//   hammer_slab      tier 1  lacquered wood, iron bands, bronze-rimmed slab
//   hammer_obsidian  tier 2  black glass slab, glowing crimson fissures, jagged teeth on the rim
//   hammer_sovereign tier 3  void-purple and gold, crown spikes, an orbiting Eclipse halo
const HAMMER_LOOKS = {
  hammer_slab: {
    shaftCore: '#1a0a05', shaft: '#7f2a12', bands: '#3b3f46', shaftEdge: 'rgba(253,186,116,0.55)', pommel: '#3b1a0d', pommelRim: '#a16207',
    collar: '#475569', horn: '#3f1d1d', hornEdge: '#1b0a0a', back: '#2b1010', backEdge: '#120505', side: '#3d1717',
    face: ['#9a3b22', '#6e2314', '#4a140c'], rim: '#d97706', rune: 'rgba(253,186,116,0.8)', center: '#f59e0b', rivet: '#fbbf24'
  },
  hammer_obsidian: {
    shaftCore: '#0b0508', shaft: '#2a1418', bands: '#7f1d1d', shaftEdge: 'rgba(251,113,133,0.6)', pommel: '#1a0b10', pommelRim: '#f43f5e',
    collar: '#1f2937', horn: '#16111b', hornEdge: '#f43f5e', hornScale: 0.85, back: '#0a070d', backEdge: '#2a0a12', side: '#150f1a',
    face: ['#322a3a', '#17111f', '#07050b'], rim: '#f43f5e', rune: 'rgba(251,113,133,0.9)', center: '#fb7185', rivet: '#fda4af',
    teeth: '#1c1522', toothLen: 1.3, vein: '#f43f5e'
  },
  hammer_sovereign: {
    shaftCore: '#12062a', shaft: '#3b1585', bands: '#ca8a04', shaftEdge: 'rgba(253,224,71,0.7)', pommel: '#24104a', pommelRim: '#fde047',
    collar: '#a16207', horn: '#4c1d95', hornEdge: '#fde047', hornScale: 0.95, back: '#1a0a36', backEdge: '#0b031a', side: '#2e1065',
    face: ['#7c3aed', '#4c1d95', '#220a45'], rim: '#fde047', rune: 'rgba(253,224,71,0.9)', center: '#fef08a', rivet: '#fef08a',
    teeth: '#facc15', toothLen: 1.38, halo: '#fde047', haloGem: '#f5d0fe', vein: '#c084fc'
  },
  // Tier 4 (Hush): a porcelain music box of a maul, glazed white with Delft-blue bands and gold kintsugi veins
  hammer_lullaby: {
    shaftCore: '#1e2a52', shaft: '#e9e6f2', bands: '#2a4a8f', shaftEdge: 'rgba(245,197,66,0.75)', pommel: '#c9973a', pommelRim: '#fde68a',
    collar: '#c9973a', horn: '#d7dbe6', hornEdge: '#f5c542', hornScale: 0.95, back: '#b9bfd3', backEdge: '#6f7896', side: '#cfd4e3',
    face: ['#f3f0e8', '#d7dbe6', '#8d97b0'], rim: '#2a4a8f', rune: 'rgba(245,197,66,0.95)', center: '#fde68a', rivet: '#f5c542',
    teeth: '#f3f0e8', toothLen: 1.3, halo: '#f5c542', haloGem: '#c7d2fe', vein: '#f5c542'
  }
};

const hClamp01 = (t) => Math.max(0, Math.min(1, t));
const hLerp = (a, b, t) => a + (b - a) * t;
const hEaseOut = (t) => 1 - Math.pow(1 - hClamp01(t), 3);
const hEaseIn = (t) => Math.pow(hClamp01(t), 2.2);

// ---------------------------------------------------------------------------
// BROKEN status (lives on the boss object itself so every player's hits benefit)
// ---------------------------------------------------------------------------
function brokenStacksOf(boss) {
  return (boss && boss.brokenStacks) || 0;
}

function applyBrokenStacks(boss, n = 1, quiet = false) {
  if (!boss || boss.hp <= 0 || n <= 0) return false;
  if ((boss.brokenLockout || 0) > 0) return false;
  const before = boss.brokenStacks || 0;
  boss.brokenStacks = Math.min(BROKEN_MAX_STACKS, before + n);
  boss.brokenTimer = BROKEN_DURATION; // every application refreshes the single shared timer
  boss.brokenFlash = 0.55;
  boss.brokenNewest = boss.brokenStacks - 1;
  if (window.fx && !quiet) {
    window.fx.addFloatingText(boss.x, boss.y - 96, boss.brokenStacks >= BROKEN_MAX_STACKS ? '🔴 BROKEN ×3 (MAX)' : `🔴 BROKEN ×${boss.brokenStacks}`, '#fb7185', 14);
    window.fx.addShockwave(boss.x, boss.y, 54, '#ef4444', 3, 0.3);
  }
  return boss.brokenStacks > before || before >= BROKEN_MAX_STACKS;
}

function tickBroken(boss, dt) {
  if (!boss) return;
  if (boss.brokenLockout > 0) boss.brokenLockout = Math.max(0, boss.brokenLockout - dt);
  if (boss.brokenFlash > 0) boss.brokenFlash = Math.max(0, boss.brokenFlash - dt);
  if (!(boss.brokenStacks > 0)) return;
  boss.brokenTimer = (boss.brokenTimer || 0) - dt;
  if (boss.brokenTimer <= 0) {
    boss.brokenStacks = 0;
    boss.brokenTimer = 0;
  }
}

// Crack anchors: each boss model gets its own spots (Vaelgor = chest, left pauldron, right hip).
function getBrokenAnchorScreen(boss, idx) {
  if (typeof boss.localToWorld === 'function') {
    const spots = [{ f: 10, s: -4, u: 52 }, { f: 2, s: -28, u: 66 }, { f: 8, s: 16, u: 34 }];
    const a = spots[idx % spots.length];
    const p = boss.localToWorld(a.f, a.s, a.u);
    return { x: p.sx, y: p.sy };
  }
  // Generic / training dummy: fixed spots on the torso.
  const d = [{ x: 0, y: -34 }, { x: -7, y: -46 }, { x: 6, y: -20 }][idx % 3];
  return { x: boss.x + d.x, y: boss.y + d.y };
}

function drawBrokenMarks(ctx, boss) {
  const stacks = boss && boss.brokenStacks;
  if (!stacks || stacks <= 0) return;
  const time = performance.now() * 0.004;
  const fading = boss.brokenTimer < 2.0;
  for (let i = 0; i < stacks; i++) {
    const a = getBrokenAnchorScreen(boss, i);
    const fresh = (boss.brokenFlash > 0 && i === boss.brokenNewest) ? boss.brokenFlash / 0.55 : 0;
    const blink = fading ? (0.45 + 0.55 * Math.abs(Math.sin(time * 5))) : 1;
    const sz = 9 + i * 1.5 + fresh * 9;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.globalAlpha = 0.9 * blink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // soft red glow disc
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 1.6);
    g.addColorStop(0, 'rgba(239,68,68,0.55)');
    g.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, sz * 1.6, 0, Math.PI * 2);
    ctx.fill();
    // jagged crack star (seeded by stack index so it doesn't flicker)
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 3.6;
    const rays = 6;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) { ctx.strokeStyle = '#fecaca'; ctx.lineWidth = 1.4; }
      for (let r = 0; r < rays; r++) {
        const ang = (r / rays) * Math.PI * 2 + i * 0.9;
        const len = sz * (0.7 + 0.5 * ((r * 7 + i * 3) % 5) / 4);
        const mx = Math.cos(ang + 0.25) * len * 0.5;
        const my = Math.sin(ang + 0.25) * len * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(mx, my);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
window.drawBrokenMarks = drawBrokenMarks;
window.tickBroken = tickBroken;
window.applyBrokenStacks = applyBrokenStacks;

// ---------------------------------------------------------------------------
// Skill metadata for the HUD / tooltips
// ---------------------------------------------------------------------------
window.SKILL_META = window.SKILL_META || {};
window.SKILL_META.hammer = {
  title: 'GRAVEBREAKER',
  identity: { name: 'Momentum', icon: '🔴', key: 'Z', kind: 'hammer_momentum' },
  passive: {
    name: 'Broken',
    desc: 'Hits have a chance to apply Broken to the boss, shown as red cracks. Each stack makes the boss take 5% more damage (max 3). All stacks share one 10s timer that refreshes whenever you apply a new one.'
  },
  skills: {
    q: { name: 'Trifecta', icon: '🔨', short: 'Trifecta', stagger: 'medium', destructive: true, counter: false, cd: '6.5s',
         desc: 'Press [Q] three times: a sweep, a backhand and an overhead slam. Tap again after each hit to chain the next (about half a second to follow up). Each hit: 30% Broken.',
         follow: ['<b>Press [Q] again</b> within half a second of the first hit for the backhand sweep.',
                  '<b>Press [Q] a third time</b>: the hammer rises (a short wind-up where you leave the ground) and comes down in the overhead slam, the hardest hit of the chain with a big stagger chunk.'] },
    w: { name: 'Bulwark', icon: '🛡️', short: 'Bulwark', stagger: 'none', destructive: false, counter: false, cd: '30s',
         desc: 'Slam the hammer into the floor and brace: for 10 seconds you deal 30% more damage and carry a shield worth 25% of your max HP. The shield fades with the buff.' },
    e: { name: 'Skyfall Leap', icon: '🦘', short: 'Skyfall', stagger: 'medium', destructive: true, counter: false, cd: '9s',
         desc: 'Jump with brief ground-attack i-frames (hover is capped at 1.2s). With the hammer: leap to the cursor and smash. Without it: hover and drop back, or press [E] again once the hammer returns to leap.' },
    r: { name: 'Charge Smash', icon: '⚡', short: 'Charge', stagger: 'high', destructive: true, counter: false, position: 'front', cd: '12s',
         desc: 'Hold to charge through 3 stages, then up to 1.5s of overcharge. Release to smash. Stages 1-2: 30% Broken. Stage 3: guaranteed 2 stacks (3 at full overcharge).' },
    a: { name: 'Shoulder Ram', icon: '🐗', short: 'Ram', stagger: 'medium', destructive: true, counter: false, cd: '8s',
         desc: 'Super-armored shoulder charge. Needs no hammer, so it is your tool while the hammer is out. 30% Broken.' },
    s: { name: "Kralum's Roar", icon: '📣', short: 'Roar', stagger: 'low', destructive: false, counter: false, cd: '25s',
         desc: 'Slam the ground and taunt. Does not interrupt the boss: once its current pattern ends it focuses you and is guaranteed to use its Clash move (unless Muscle Spasms is active, or a mechanic is running).' },
    d: { name: 'Hoist Counter', icon: '🥊', short: 'Hoist', stagger: 'low', destructive: false, counter: true, cd: '6s',
         desc: 'A quick rising hammer uppercut. If it lands during a blue counter flash it becomes a full counter: huge stagger, guaranteed Broken and a Momentum pip.' },
    f: { name: 'Bonk Barrage', icon: '💥', short: 'Bonk', stagger: 'high', destructive: true, counter: false, position: 'front', cd: '14s',
         desc: 'Spam [F] to bonk. 3 bonks, +3 per Broken stack on the boss (up to 12). Every bonk hits harder and feels bigger, ending in a huge finisher that applies Broken.',
         follow: ['<b>Keep pressing [F]</b>: each press is one more bonk, and the swings get faster and heavier.',
                  '<b>Time it:</b> a press about 0.4 to 0.8 seconds after the last bonk (the ring over your head turns gold) is a PERFECT bonk: +25% damage.',
                  'The pips above your head show how many bonks you have left; the last one is the finisher.',
                  '<b>Need to move?</b> Right-click to leave the barrage (a swing in flight still lands). Leaving early costs 70% of the cooldown.'] },
    t: { name: 'Worldbreaker', icon: '🌋', short: 'Worldbrk', stagger: 'high', destructive: true, counter: false, cd: '3m',
         desc: 'Leap skyward, grow the hammer and crater the arena, followed by a delayed shockwave. Applies 3 Broken and deals bonus damage for each stack already on the boss.' },
    space: { name: 'Evade Dash', icon: '💨', short: 'Evade', stagger: 'none', destructive: false, counter: false, cd: '5.5s',
         desc: 'Quick dash with i-frames. Also a wake-up roll when knocked down.' },
    z: { name: 'Shatter', icon: '🔴', short: 'Momentum', stagger: 'medium', destructive: true, counter: false, cd: '1.5s',
         desc: '[Z] Shatter (1 pip): detonate every Broken stack for burst damage per stack, then Broken is locked out for 2s. [X] Overload (3 pips): 8s of faster charging, near-instant hammer return, Broken on a timer, +20% crit chance and every bonk a perfect bonk.' }
  }
};
// painted icons (icons/skill_hammer_<key>.png)
for (const k of ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z', 'space']) { const sk = window.SKILL_META.hammer.skills[k]; if (sk) sk.img = 'game/icons/skill_hammer_' + k + '.png'; }

// ---------------------------------------------------------------------------
// The class
// ---------------------------------------------------------------------------
class HammerPlayer25D extends BreakerPlayer25D {
  constructor(id, name, x, y, isLocal = true, isBot = false) {
    super(id, name || 'Gravebreaker', x, y, isLocal, isBot);
    this.classId = 'hammer';
    this.weaponColor = '#fb923c';
    this.weaponGlow = '#ea580c';
    this.baseAtk = 150;
    this.maxHp = 2800;
    this.hp = 2800;
    this.baseMaxSpeed = 174;   // lugging a slab: a little slower than the knight (192)

    this.cds = { q: 0, w: 0, e: 0, r: 0, a: 0, s: 0, d: 0, f: 0, t: 0, z: 0, space: 0, wakeup: 0 };
    this.maxCds = { q: 6.5, w: 30.0, e: 9.0, r: 12.0, a: 8.0, s: 25.0, d: 6.0, f: 14.0, t: 180.0, z: 1.5, space: 5.5, wakeup: 20.0 };

    // The hammer: 'held' | 'thrown' | 'grounded'
    this.hammer = { mode: 'held', x: x, y: y, z: 0, spin: 0, phase: 'out', t: 0, tickT: 0, hitT: 0 };
    this.act = null;
    this.qHeld = false;

    this.momentum = 0;
    this.maxMomentum = 300;
    this.momentumGainCd = 0;
    this.overloadTimer = 0;
    this.bulwarkT = 0;
    this.bulwarkGiven = 0;
    this.overloadBrokenCd = 0;
    this.brokenPity = 0;
    this.hIframes = 0;

    this.karokSpasm = 0;   // Muscle Spasms (Clash lockout) seconds remaining
    this.karok = null;     // set by the boss-side Karok Clash controller
    this.hudFlashT = 0;
  }

  // ----- small accessors ---------------------------------------------------
  get hammerHeld() { return this.hammer.mode === 'held'; }
  addOverpower() { /* Breaker-only resource */ }
  noKeyRepeat(k) { return k === 'f' || k === 'e' || k === 'w' || k === 'x'; }

  say(text, color = '#fde047', size = 13) {
    if (window.fx && this.isLocal) window.fx.addFloatingText(this.x, this.y - 78, text, color, size);
  }

  // ----- Broken ------------------------------------------------------------
  // Only the owning client applies Broken (and tells everyone else), so rolls never diverge between machines.
  brokenApply(boss, n = 1, quiet = false) {
    if (this.isRemote) return false;
    const ok = applyBrokenStacks(boss, n, quiet);
    this.broadcastBroken(boss);
    return ok;
  }

  broadcastBroken(boss) {
    const g = window.game;
    if (this.isLocal && g && g.net && g.mode === 'raid' && boss === g.boss) {
      g.net.broadcast({ type: 'boss_broken', stacks: boss.brokenStacks || 0, lockout: boss.brokenLockout || 0 });
    }
  }

  // Extra fields riding on the regular player_state packet (see network_coop.js).
  getNetState() {
    const h = this.hammer;
    const mw = this.mouseWorld();
    return {
      hm: h.mode, hph: h.phase, hx: Math.round(h.x), hy: Math.round(h.y), hz: Math.round(h.z),
      spasm: Math.ceil(this.karokSpasm || 0),
      ax: Math.round(mw.x), ay: Math.round(mw.y)
    };
  }

  applyNetState(d) {
    this.remoteAim = { x: d.ax, y: d.ay };
    if (typeof d.spasm === 'number') this.karokSpasm = d.spasm;
    const h = this.hammer;
    if (this.karok && this.karok.active) return; // the clash cutscene drives the hammer locally on every client
    if (d.hm && d.hm !== 'held' && this.act && this.act.kind === 'w' && !this.act.released) return; // still winding up locally
    if (d.hm) {
      h.mode = d.hm;
      h.phase = d.hph || h.phase;
      if (d.hm !== 'held') { h.x = d.hx; h.y = d.hy; h.z = d.hz; }
    }
  }

  rollBroken(boss, chance) {
    if (!boss || boss.hp <= 0 || this.isRemote) return false;
    if (Math.random() < chance + this.brokenPity) {
      this.brokenPity = 0;
      this.brokenApply(boss, 1);
      return true;
    }
    this.brokenPity = Math.min(0.3, this.brokenPity + 0.10); // bad-luck protection
    return false;
  }

  addMomentum(v) {
    const before = Math.floor(this.momentum / 100);
    this.momentum = Math.min(this.maxMomentum, this.momentum + v);
    const after = Math.floor(this.momentum / 100);
    if (after > before) {
      this.hudFlashT = 0.6;
      if (this.isLocal) {
        this.say(after >= 3 ? '🔴 MOMENTUM FULL' : '🔴 MOMENTUM +1', '#fb7185', 12);
        if (window.fx) window.fx.addShockwave(this.x, this.y, 70, '#ef4444', 3, 0.35);
      }
    }
  }

  // Every landing hit funnels through here (Breaker's base combo included).
  dealHitToBoss(boss, coeff, skillName, isHeadSkill = false, staggerAmt = 18, applyFracture = false, hitOpts = null) {
    if (/\[[RF]\]/.test(skillName || '')) coeff *= 1.15;   // Charge Smash [R] and Bonk Barrage [F]: +15% damage
    if (this.bulwarkT > 0) coeff *= 1.3;                    // [W] Bulwark: +30% damage while it lasts
    const dmg = super.dealHitToBoss(boss, coeff, skillName, isHeadSkill, staggerAmt, false, hitOpts);
    if (dmg > 0 && boss) this.onBossHit(boss, skillName);
    return dmg;
  }

  onBossHit(boss, skillName) {
    if (/^Combo/.test(skillName || '')) this.rollBroken(boss, 0.10);
    if (brokenStacksOf(boss) >= BROKEN_MAX_STACKS && this.momentumGainCd <= 0) {
      this.addMomentum(25);
      this.momentumGainCd = 1.0;
    }
    if (this.overloadTimer > 0 && this.overloadBrokenCd <= 0) {
      this.overloadBrokenCd = 1.5;
      this.brokenApply(boss, 1, true);
    }
  }

  // Positioned hit with reach check. Returns true when the boss was struck.
  strike(boss, cx, cy, reach, coeff, name, stagger, chance, opts = null) {
    if (!boss || boss.hp <= 0) return false;
    if (!this.isRemote && typeof boss.checkPlayerHitAnchors === 'function') boss.checkPlayerHitAnchors(cx, cy, reach);
    if (Math.hypot(boss.x - cx, (boss.y - cy) / PERSPECTIVE_TILT) >= reach) return false;
    const o = Object.assign({ isStrongMove: false, impulseStrength: 0.8, hitX: cx, hitY: cy }, opts || {});
    this.dealHitToBoss(boss, coeff, name, !!o.head, stagger, false, o);
    if (chance >= 1) this.brokenApply(boss, o.stacks || 1);
    else if (chance > 0) this.rollBroken(boss, chance);
    return true;
  }

  // Every Gravebreaker move is aimed by the mouse; there is no snapping onto the boss (the old assist range is ignored on purpose).
  aimAt(boss, ax, ay, assistRange = 0) {
    const ang = Math.atan2((ay - this.y) / PERSPECTIVE_TILT, ax - this.x);
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

  // ----- action framework -------------------------------------------------
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
      if (a.kind === 'f' && a.k > 0) this.cds.f = this.maxCds.f * 0.7;
      if (a.kind === 'r') this.cds.r = this.maxCds.r * 0.4;
    }
  }

  restoreChargeCamera() {
    if (this._chargeSavedZoom && window.game && window.game.camera) {
      window.game.camera.targetZoom = this._chargeSavedZoom;
    }
    this._chargeSavedZoom = null;
  }

  // ----- update -------------------------------------------------------------
  _updateInternal(dt, boss, arenaCenter, arenaRadius) {
    if (this.karokSpasm > 0) this.karokSpasm = Math.max(0, this.karokSpasm - dt);
    if (this.overloadTimer > 0) this.overloadTimer = Math.max(0, this.overloadTimer - dt);
    if (this.bulwarkT > 0) {
      this.bulwarkT = Math.max(0, this.bulwarkT - dt);
      if (this.bulwarkT === 0) {          // the borrowed shield fades with the buff
        this.shield = Math.max(0, (this.shield || 0) - (this.bulwarkGiven || 0));
        this.bulwarkGiven = 0;
        if (this.isLocal) this.say('Bulwark fades', '#fde68a', 11);
      }
    }
    if (this.overloadBrokenCd > 0) this.overloadBrokenCd = Math.max(0, this.overloadBrokenCd - dt);
    if (this.momentumGainCd > 0) this.momentumGainCd = Math.max(0, this.momentumGainCd - dt);
    if (this.hIframes > 0) this.hIframes = Math.max(0, this.hIframes - dt);
    if (this.hudFlashT > 0) this.hudFlashT = Math.max(0, this.hudFlashT - dt);
    // [F] parks its cooldown at 99 while the barrage runs; if the barrage ended any other way (knocked down, killed, cancelled before the
    // first bonk) the normal cooldown applies, never the placeholder.
    if (this.cds.f > this.maxCds.f && !(this.act && this.act.kind === 'f')) this.cds.f = this.maxCds.f;
    // The raid boss ticks its own Broken timer (karok_clash.js); only the hub dummy needs the player to do it.
    if (this.isLocal && boss && window.game && boss === window.game.hubDummy) tickBroken(boss, dt);

    if (this.hp <= 0) {
      this.act = null;
      this.restoreChargeCamera();
    } else {
      this.cancelActIfInterrupted();
      this.updateKarokPlayer(dt, boss);
      this.updateHammerEntity(dt, boss);
      this.updateAct(dt, boss);
    }
    super._updateInternal(dt, boss, arenaCenter, arenaRadius);
    this.updateHeavyGait(dt);
  }

  // Weight when moving: every footfall thuds and the slab's head bounces on the shoulder (it is carried, so it never touches the floor).
  updateHeavyGait(dt) {
    if (this.hp <= 0 || !this.hammerHeld || this.act || this.karok) return;
    const hc = Math.floor((this.walkPhase || 0) / Math.PI);
    if (this._hc === undefined) this._hc = hc;
    const moving = this.state === 'walk' && (this.walkWeight || 0) > 0.35 && this.jumpZ < 1;
    if (hc !== this._hc) {
      this._hc = hc;
      if (moving) {
        this._lagV = (this._lagV || 0) + (Math.random() < 0.5 ? -1 : 1) * 2.2;   // the head bounces on each stride
        if (window.fx) {
          window.fx.addStepDust(this.x, this.y, 3);
          if (this.isLocal) window.fx.triggerShake(1.6, 0.07);
        }
        audio.playArmoredStep && audio.playArmoredStep(0.85);
      }
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

  // ----- Damage taken -------------------------------------------------------
  takeDamage(rawAmount, sourceName = 'Attack', impactOpts = null) {
    if (this.isRemote) return;
    if (this.karok && this.karok.active) return;
    if (this.hIframes > 0 && !(impactOpts && impactOpts.forceLethal)) return;
    // [F] / [R] PLANT the Gravebreaker: while the swing or charge is committed you take the damage but are never pushed, launched,
    // knocked down or turned around, whatever hit you (cataclysm included). Big risk, big reward.
    if (this.act && (this.act.kind === 'f' || this.act.kind === 'r')) {
      const keep = { state: this.state, face: this.facingAngle, jz: this.jumpZ, spin: this.bodySpinAngle, sc: this.swordScale, st: this.stateTimer, sd: this.stateDuration, hold: this.rHoldingKey };
      const o = Object.assign({}, impactOpts || {});
      if (!o.forceLethal) { o.power = 'light'; o.pushDist = 0; }
      this.state = 'f_wrath';
      super.takeDamage(rawAmount, sourceName, o);
      if (this.hp > 0) {
        this.state = keep.state; this.facingAngle = keep.face; this.jumpZ = keep.jz; this.bodySpinAngle = keep.spin;
        this.swordScale = keep.sc; this.stateTimer = keep.st; this.stateDuration = keep.sd; this.rHoldingKey = keep.hold;
        this.kbVx = 0; this.kbVy = 0;
      }
      return;
    }
    const armored = this.act && (this.act.kind === 'a' || this.act.kind === 't' || this.act.kind === 's' || this.act.kind === 'w');
    if (armored) {
      const keep = this.state;
      this.state = 'f_wrath'; // Breaker's super-armor flag
      super.takeDamage(rawAmount, sourceName, impactOpts);
      if (this.state === 'f_wrath') this.state = keep;
      return;
    }
    super.takeDamage(rawAmount, sourceName, impactOpts);
  }

  // ----- Input -------------------------------------------------------------
  releaseSkill(key) {
    const k = key.toLowerCase();
    const net = window.game && window.game.net;
    if (k === 'q') {
      if (this.qHeld && this.isLocal && net) net.broadcast({ type: 'player_skill_release', skill: 'q', cls: 'hammer' });
      this.qHeld = false;
    }
    if (k === 'f' && !this.isLocal) this.cancelBarrage();     // a co-op friend right-clicked out of their barrage
    if (k === 'r' && this.act && this.act.kind === 'r' && this.act.phase === 'charge') {
      if (this.isLocal && net) net.broadcast({ type: 'player_skill_release', skill: 'r', cls: 'hammer' });
      this.releaseCharge();
    }
  }
  // True once the running move has done its damage and only recovery is left (see the cancel window in triggerSkill).
  skillCancelReady() {
    const a = this.act;
    if (!a) return false;
    if (a.kind === 'b') return !!a.hit && a.t >= a.dur * 0.5;
    if (a.kind === 'a') return !!a.hit && a.t >= a.dur * 0.55;
    if (a.kind === 'w') return !!a.fired && a.t >= 0.5;
    if (a.kind === 's') return !!a.slammed && a.t >= a.dur * 0.65;
    return false;
  }
  needsHammer(k) {
    return k === 'q' || k === 'r' || k === 'd' || k === 'f' || k === 't';
  }

  triggerSkill(key, aimX, aimY, boss = null, fromNetwork = false) {
    if (this.hp <= 0 || this.state === 'grabbed' || this.state === 'clash_lock' || this.clashQteActive || this.karok) return false;
    const prevAlly = window.fx ? window.fx.sourceIsAlly : false;
    if (window.fx) window.fx.sourceIsAlly = !this.isLocal;
    try {
      const k = key.toLowerCase();
      if (!this.isLocal && typeof aimX === 'number' && typeof aimY === 'number') this.remoteAim = { x: aimX, y: aimY };
      if (fromNetwork) {
        // Replays are authoritative (the owner already validated the cast): bypass cooldown / hammer / action drift.
        if (k !== 'wakeup') this.cds[k] = 0;
        if (k === 'x') this.cds.z = 0;
        if (k === 'z' || k === 'x') this.momentum = this.maxMomentum; // the owner already paid for it
        const continues = this.act && ((k === 'e' && this.act.kind === 'e') || (k === 'f' && this.act.kind === 'f') || (k === 'q' && this.act.kind === 'q' && this.act.step < 3));
        if (this.act && !continues && (k !== 'w' || this.hammer.mode === 'held')) { this.act = null; this.restoreChargeCamera(); this.jumpZ = 0; if (this.state === 'h_act') this.state = 'idle'; }
        if (this.hp > 0 && !this.canAct() && !this.act) this.state = 'idle';
      }

      // [Space] reuses Breaker's dash / wake-up roll
      if (k === 'space') {
        if (this.act && this.act.kind === 'e') return false;
        if (this.act) { this.act = null; this.restoreChargeCamera(); }
        return super.triggerSkill('space', aimX, aimY, boss, fromNetwork);
      }

      // Cancel window: once the hit of a combo hit / [A] / [W] / [S] has landed, the rest is recovery, so the next skill starts at once.
      if (!fromNetwork && this.isLocal && this.act && this.act.kind !== k && 'qwerasdf'.includes(k) && this.cds[k] <= 0 && !this.canAct() && this.skillCancelReady()) {
        this.act = null; this.state = 'idle'; this.stateTimer = 0; this.jumpZ = 0; this.bodySpinAngle = 0;
        this.attackStepVx = 0; this.attackStepVy = 0; this.restoreChargeCamera(); this.snapFeetToBody();
      }

      if (k === 'z') return this.castZ(boss);
      if (k === 'x') return this.castZ(boss, true);   // Overload
      if (k === 'w') return this.castW(aimX, aimY, boss);

      // [E] pressed again while hovering = commit the leap
      if (k === 'e' && this.act && this.act.kind === 'e') return this.commitLeap();
      // [F] pressed again during a barrage = next bonk
      if (k === 'f' && this.act && this.act.kind === 'f') return this.nextBonk(boss);
      // [Q] pressed again during the combo = next hit
      if (k === 'q' && this.act && this.act.kind === 'q') return this.nextQ(boss);

      if (this.cds[k] > 0) return false;
      const dCancel = (k === 'd' && this.act && this.act.kind === 'q');
      if (!this.canAct() && !dCancel) return false;
      if (this.needsHammer(k) && !this.hammerHeld && !this.isRemote) {
        this.say('The hammer is away!  [W] recalls it', '#fca5a5', 12);
        return false;
      }
      if (dCancel) { this.act = null; this.state = 'idle'; this.qHeld = false; }

      if (k === 'q') return this.castQ(aimX, aimY, boss);
      if (k === 'e') return this.castE(aimX, aimY, boss);
      if (k === 'r') return this.castR(aimX, aimY, boss);
      if (k === 'a') return this.castA(aimX, aimY, boss);
      if (k === 's') return this.castS(aimX, aimY, boss);
      if (k === 'd') return this.castD(aimX, aimY, boss);
      if (k === 'f') return this.castF(aimX, aimY, boss);
      if (k === 't') return this.castT(aimX, aimY, boss);
      return false;
    } finally {
      if (window.fx) window.fx.sourceIsAlly = prevAlly;
    }
  }

  // =========================================================================
  // Q — TRIFECTA
  // =========================================================================
  castQ(ax, ay, boss) {
    this.cds.q = this.maxCds.q;
    this.qHeld = true;
    this.aimAt(boss, ax, ay);
    const a = this.beginAct('q', 3.0, { step: 0, stepT: 0, stepDur: 0, phase: 'swing', hit: false, hold: 0, bonus: 1 });
    this.startQStep(a, boss, 1);
    return true;
  }

  nextQ(boss) {
    const a = this.act;
    if (!a || a.kind !== 'q' || a.step >= 3 || a.queued) return false;
    if (a.phase === 'gap') { a.queued = true; a.gapT = 0; a.stepT = a.stepDur; }   // chains on this frame's update
    else a.queued = true;
    return true;
  }

  startQStep(a, boss, step) {
    a.phase = 'swing';
    a.step = step;
    a.stepT = 0;
    a.hit = false;
    a.phase = (step === 3) ? 'wind' : 'swing';
    a.stepDur = step === 3 ? 0.62 : 0.36;
    const mw = this.mouseWorld();
    if (this.isLocal) this.aimAt(boss, mw.x, mw.y);
    const dir = { x: Math.cos(this.facingAngle), y: Math.sin(this.facingAngle) * PERSPECTIVE_TILT };
    const burst = step === 3 ? 230 : 150;
    this.attackStepVx = dir.x * burst;
    this.attackStepVy = dir.y * burst;
    audio.playSwordSlash(step === 3, step === 3 ? 1.2 : 0.95);
    if (step < 3) this.lungeFootForward(step === 1 ? this.leftFoot : this.rightFoot, 15, step === 1 ? -this.hipWidth - 2 : this.hipWidth + 2, 0.14);
  }

  act_q(dt, boss, a) {
    a.stepT += dt;
    const p = hClamp01(a.stepT / a.stepDur);
    if (a.step < 3) {
      this.bodySpinAngle = (a.step === 1 ? -1 : 1) * (-0.4 + 0.8 * hEaseOut(p));
      if (p >= 0.45 && !a.hit) {
        a.hit = true;
        const cx = this.x + Math.cos(this.facingAngle) * 56;
        const cy = this.y + Math.sin(this.facingAngle) * 56 * PERSPECTIVE_TILT;
        if (window.fx) {
          window.fx.addSlashRibbon(this.x, this.y, 112, this.facingAngle + (a.step === 1 ? 1.4 : -1.4), this.facingAngle + (a.step === 1 ? -1.4 : 1.4), '#fb923c', 22, 0.22);
        }
        if (window.fx) { window.fx.triggerHitstop(28); window.fx.triggerShake(6, 0.16); window.fx.addShockwave(cx, cy, 80, '#fb923c', 4, 0.28); window.fx.addStepDust(cx, cy, 4); }
        audio.playImpactBoom(0.75);
        this.strike(boss, cx, cy, 104, a.step === 1 ? 0.95 : 1.1, `Trifecta ${a.step} [Q]`, a.step === 1 ? 9 : 11, 0.30, { impulseStrength: 0.8 });
      }
      if (p >= 1) {
        // press [Q] again (a buffered press counts) to chain into the next hit
        if (a.queued) { a.queued = false; a.gapT = 0; this.startQStep(a, boss, a.step + 1); }
        else {
          a.phase = 'gap';
          a.gapT = (a.gapT || 0) + dt;
          if (a.gapT > 0.5) this.endAct();
        }
      }
      return;
    }
    // Step 3: overhead slam
    if (a.phase === 'wind') {
      if (a.stepT >= 0.24) { a.phase = 'swing'; a.stepT = 0.24; }
      this.jumpZ = hEaseOut(p / 0.4) * 8;
      return;
    }
    this.jumpZ = Math.max(0, Math.sin(hClamp01(p) * Math.PI) * 10);
    if (p >= 0.55 && !a.hit) {
      a.hit = true;
      this.jumpZ = 0;
      const cx = this.x + Math.cos(this.facingAngle) * 62;
      const cy = this.y + Math.sin(this.facingAngle) * 62 * PERSPECTIVE_TILT;
      audio.playImpactBoom(1.1);
      audio.playSwordPlant();
      if (window.fx) {
        window.fx.triggerHitstop(55 + a.hold * 60);
        window.fx.triggerShake(12 + a.hold * 10, 0.26);
        window.fx.spawnMassiveEarthChunks(cx, cy, 5, '#fb923c');
        window.fx.addShockwave(cx, cy, 118 + a.hold * 40, '#fb923c', 5, 0.4);
        window.fx.addStepDust(cx, cy, 8);
      }
      this.strike(boss, cx, cy, 124, 2.5 * a.bonus, 'Trifecta Slam [Q]', 30, 0.30, { isStrongMove: true, impulseStrength: 1.3, head: true });
    }
    if (p >= 1) this.endAct();
  }

  // =========================================================================
  // W — HAMMER YEET (boomerang)
  // =========================================================================
  castW(ax, ay, boss) {
    const h = this.hammer;
    // Recall (no cooldown, usable from almost any state)
    if (h.mode === 'thrown') {
      if (h.phase !== 'return') this.startHammerReturn();
      return h.phase === 'return';
    }
    if (h.mode === 'grounded') {
      this.startHammerReturn();
      return true;
    }
    if (this.cds.w > 0 || !this.canAct()) return false;
    this.cds.w = this.maxCds.w;
    this.beginAct('w', 0.72, { fired: false });
    audio.playSwordSlash(true, 0.9);
    return true;
  }

  // BULWARK: slam the hammer into the floor; 10s of +30% damage and a shield worth 25% of max HP that lasts as long as the buff.
  act_w(dt, boss, a) {
    const p = hClamp01(a.t / a.dur);
    this.jumpZ = a.t < 0.3 ? hEaseOut(a.t / 0.3) * 10 : Math.max(0, 10 * (1 - (a.t - 0.3) / 0.1));
    if (!a.fired && a.t >= 0.4) {
      a.fired = true;
      this.jumpZ = 0;
      this.bulwarkT = 10;
      this.bulwarkGiven = Math.round(this.maxHp * 0.25);
      this.shield = Math.max(0, this.shield || 0) + this.bulwarkGiven;
      audio.playImpactBoom(1.3); audio.playSwordPlant();
      if (this.isLocal && audio.playBreakerGrunt) audio.playBreakerGrunt(true);
      if (window.fx) {
        window.fx.triggerShake(10, 0.3);
        window.fx.addShockwave(this.x, this.y, 170, '#fbbf24', 6, 0.45);
        window.fx.addShockwave(this.x, this.y, 105, '#ffffff', 4, 0.3);
        window.fx.addPillar(this.x, this.y, 60, '#fbbf24', 0.7);
        window.fx.addStepDust(this.x, this.y, 8);
      }
      this.say('BULWARK', '#fde047', 14);
    }
    if (p >= 1) this.endAct();
  }

  releaseThrow(boss) {
    const h = this.hammer;
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    let tx, ty;
    const mw = this.mouseWorld();
    if (boss && boss.hp > 0 && Math.hypot(boss.x - this.x, boss.y - this.y) < 640) {
      tx = boss.x; ty = boss.y;
    } else {
      const d = Math.min(420, Math.hypot(mw.x - this.x, (mw.y - this.y) / PERSPECTIVE_TILT));
      tx = this.x + cosA * d; ty = this.y + sinA * d * PERSPECTIVE_TILT;
    }
    h.mode = 'thrown';
    h.phase = 'out';
    h.t = 0;
    h.sx = this.x + cosA * 18; h.sy = this.y + sinA * 18 * PERSPECTIVE_TILT;
    h.x = h.sx; h.y = h.sy; h.z = 40;
    h.tx = tx; h.ty = ty;
    h.dur = Math.max(0.26, Math.min(0.62, Math.hypot(tx - h.sx, ty - h.sy) / 980)) * (this.overloadTimer > 0 ? 0.6 : 1);
    h.holdT = 0;
    h.hitT = 0;
    h.tickT = 0;
    h.spin = 0;
    h.speed = 0;
    h.arrived = false;
    audio.playSwordSlash(true, 1.3);
    if (window.fx) {
      window.fx.addSonicBoomRings(this.x, this.y, tx, ty, 3, '#fb923c');
      window.fx.addDragSparks(this.x, this.y, this.facingAngle, 6, false, '#fb923c');
    }
  }

  startHammerReturn() {
    const h = this.hammer;
    if (h.mode === 'held') return;
    h.mode = 'thrown';
    h.phase = 'return';
    h.t = 0;
    h.speed = this.overloadTimer > 0 ? 1100 : 420;
    h.tickT = 0;
    h.hitT = 0;
    h.z = Math.max(h.z, 20);
    audio.playSwordSlash(false, 1.0);
  }

  hammerTick(boss, coeff, name, stagger, radius) {
    if (!boss || boss.hp <= 0) return;
    const h = this.hammer;
    if (Math.hypot(boss.x - h.x, (boss.y - h.y) / PERSPECTIVE_TILT) > radius) return;
    this.dealHitToBoss(boss, coeff, name, false, stagger, false, { impulseStrength: 0.5, hitX: h.x, hitY: h.y });
    this.rollBroken(boss, 0.30);
    audio.playHitConfirm && audio.playHitConfirm({ isCrit: false, isHeavy: false, posType: 'normal' });
  }

  updateHammerEntity(dt, boss) {
    const h = this.hammer;
    if (h.mode === 'held' || h.mode === 'anchor') return;   // 'anchor' is driven by the Karok Clash finisher
    if (this.isRemote) { h.spin += dt * (h.mode === 'grounded' ? 0 : 22); return; } // owner's packets drive the entity
    if (h.mode === 'grounded') { h.spin = 0; return; }
    h.t += dt;
    const spinRate = h.phase === 'spin' ? 20 : 30;
    h.spin += dt * spinRate;
    if (!this.isLocal && !boss) return;

    if (h.phase === 'out') {
      const s = hClamp01(h.t / h.dur);
      const e = 1 - Math.pow(1 - s, 2.2);
      h.x = hLerp(h.sx, h.tx, e);
      h.y = hLerp(h.sy, h.ty, e);
      h.z = 38 + Math.sin(s * Math.PI) * 18;
      h.tickT -= dt;
      if (h.tickT <= 0) { h.tickT = 0.14; this.hammerTick(boss, 0.45, 'Hammer Yeet [W]', 4, 60); }
      if (s >= 1) {
        h.phase = 'spin';
        h.t = 0;
        h.tickT = 0.0;
        h.x = h.tx; h.y = h.ty; h.z = 14;
        audio.playImpactBoom(0.8);
        if (window.fx) {
          window.fx.addShockwave(h.x, h.y, 78, '#fb923c', 4, 0.32);
          window.fx.addStepDust(h.x, h.y, 5);
        }
        this.hammerTick(boss, 1.25, 'Hammer Yeet Impact [W]', 14, 90);
      }
    } else if (h.phase === 'spin') {
      h.z = 12 + Math.sin(h.t * 9) * 2;
      h.tickT -= dt;
      if (h.tickT <= 0) {
        h.tickT = 0.30;
        this.hammerTick(boss, 0.50, 'Hammer Spin [W]', 5, 82);
        if (window.fx) window.fx.addDragSparks(h.x, h.y, h.spin, 3, false, '#fdba74');
      }
      const holdMax = this.overloadTimer > 0 ? 1.4 : 2.0;
      if (h.t >= holdMax) this.startHammerReturn();
    } else if (h.phase === 'return') {
      h.speed += (this.overloadTimer > 0 ? 3600 : 1500) * dt;
      const dx = this.x - h.x, dy = (this.y - h.y) / PERSPECTIVE_TILT;
      const dist = Math.hypot(dx, dy);
      const step = h.speed * dt;
      h.z = hLerp(h.z, 40, Math.min(1, dt * 6));
      h.tickT -= dt;
      if (h.tickT <= 0) { h.tickT = 0.12; this.hammerTick(boss, 0.42, 'Hammer Return [W]', 3, 58); }
      if (dist <= Math.max(26, step)) {
        this.catchHammer();
      } else {
        h.x += (dx / dist) * step;
        h.y += (dy / dist) * step * PERSPECTIVE_TILT;
      }
    }
    // Safety: never lose the hammer for good.
    if (h.t > 14 && h.phase !== 'return') this.startHammerReturn();
  }

  catchHammer() {
    const h = this.hammer;
    const free = (this.state === 'idle' || this.state === 'walk');
    h.mode = 'held';
    h.phase = 'out';
    this.cds.w = Math.max(this.cds.w, this.maxCds.w);
    audio.playParryClang(false);
    if (free || (this.act && this.act.kind === 'e')) {
      this.addMomentum(100);
      this.say('PERFECT CATCH', '#fde047', 13);
      if (window.fx) {
        window.fx.addShockwave(this.x, this.y, 90, '#fde047', 4, 0.32);
        if (this.isLocal) window.fx.triggerZoomPunch(0.02);
      }
    } else if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 60, '#fb923c', 3, 0.25);
    }
    if (this.act && this.act.kind === 'e' && this.act.phase === 'hover') {
      this.act.needPress = true;
      this.act.hoverT = Math.min(this.act.hoverT, this.act.hoverMax - 0.7);
      this.say('[E] LEAP!', '#7dd3fc', 13);
    }
  }

  // Hammer lost to a Karok Clash: flies off to the side and sticks in the ground.
  throwHammerAway(side = 1) {
    const h = this.hammer;
    h.mode = 'grounded';
    h.x = this.x + Math.cos(this.facingAngle + side * 1.9) * 120;
    h.y = this.y + Math.sin(this.facingAngle + side * 1.9) * 120 * PERSPECTIVE_TILT;
    h.z = 0;
    h.spin = 0.9;
    audio.playSwordPlant();
    if (window.fx) {
      window.fx.addShockwave(h.x, h.y, 70, '#fb923c', 3.5, 0.3);
      window.fx.addStepDust(h.x, h.y, 6);
    }
  }

  // =========================================================================
  // E — SKYFALL LEAP
  // =========================================================================
  castE(ax, ay, boss) {
    this.cds.e = this.maxCds.e;
    const held = this.hammerHeld;
    this.beginAct('e', 20, {
      phase: 'rise', phaseT: 0, hoverT: 0, hoverMax: 1.2, hammerAtStart: held, needPress: false,
      startX: this.x, startY: this.y, tx: this.x, ty: this.y, fx: this.x, fy: this.y
    });
    this.hIframes = 0.5;
    audio.playSwordSlash(false, 1.0);
    if (window.fx) { window.fx.addShockwave(this.x, this.y, 80, '#7dd3fc', 3.5, 0.3); window.fx.addStepDust(this.x, this.y, 6); }
    return true;
  }

  eLeapTarget(a) {
    const mw = this.mouseWorld();
    const maxR = 320;
    let dx = mw.x - this.x, dy = (mw.y - this.y) / PERSPECTIVE_TILT;
    const d = Math.hypot(dx, dy) || 1;
    const r = Math.min(maxR, d);
    return { x: this.x + (dx / d) * r, y: this.y + (dy / d) * r * PERSPECTIVE_TILT };
  }

  commitLeap() {
    const a = this.act;
    if (!a || a.kind !== 'e' || a.phase !== 'hover') return false;
    if (!this.hammerHeld) return false;
    const t = this.eLeapTarget(a);
    a.tx = t.x; a.ty = t.y;
    a.fx = this.x; a.fy = this.y;
    a.phase = 'leap';
    a.phaseT = 0;
    this.facingAngle = Math.atan2((t.y - this.y) / PERSPECTIVE_TILT, t.x - this.x);
    this.hIframes = 0.7;
    audio.playSwordSlash(true, 1.2);
    if (window.fx) {
      window.fx.addAfterimage(this.x, this.y - this.jumpZ, this.facingAngle, '#7dd3fc');
      // the ground heaves where he kicks off
      if (window.fx.addEarthBurst) window.fx.addEarthBurst(this.x, this.y, { big: false, radius: 80, color: '#7dd3fc' });
      window.fx.addStepDust(this.x, this.y, 8);
      if (this.isLocal) window.fx.triggerShake(5, 0.15);
    }
    return true;
  }

  act_e(dt, boss, a) {
    a.phaseT += dt;
    const AIR = 74;
    if (a.phase === 'rise') {
      this.jumpZ = hEaseOut(a.phaseT / 0.26) * AIR;
      this.hIframes = Math.max(this.hIframes, 0.2);
      if (a.phaseT >= 0.26) { a.phase = 'hover'; a.phaseT = 0; a.hoverT = 0; }
    } else if (a.phase === 'hover') {
      a.hoverT += dt;
      this.jumpZ = AIR + Math.sin(a.hoverT * 6) * 3;
      this.hIframes = Math.max(this.hIframes, 0.2);
      if (this.hammerHeld) {
        const t = this.eLeapTarget(a);
        a.tx = t.x; a.ty = t.y; // live preview follows the cursor
        this.facingAngle = Math.atan2((t.y - this.y) / PERSPECTIVE_TILT, t.x - this.x);
        if (a.hammerAtStart && !a.needPress && a.hoverT >= 0.45) this.commitLeap();
      }
      if (a.phase === 'hover' && a.hoverT >= a.hoverMax) {
        a.phase = 'drop'; a.phaseT = 0; a.dropFx = this.x; a.dropFy = this.y;
      }
    } else if (a.phase === 'leap') {
      const s = hClamp01(a.phaseT / 0.42);
      const e = hEaseIn(s) * 0.35 + hEaseOut(s) * 0.65;
      this.x = hLerp(a.fx, a.tx, e);
      this.y = hLerp(a.fy, a.ty, e);
      this.jumpZ = hLerp(AIR, 0, Math.pow(s, 1.6)) + Math.sin(s * Math.PI) * 30;
      this.hIframes = Math.max(this.hIframes, 0.15);
      if (s >= 1) {
        this.jumpZ = 0;
        this.snapFeetToBody();
        this.landSmash(boss);
        a.phase = 'land'; a.phaseT = 0;
      }
    } else if (a.phase === 'drop') {
      const s = hClamp01(a.phaseT / 0.3);
      this.x = hLerp(a.dropFx, a.startX, hEaseOut(s));
      this.y = hLerp(a.dropFy, a.startY, hEaseOut(s));
      this.jumpZ = AIR * (1 - hEaseIn(s));
      this.hIframes = Math.max(this.hIframes, 0.1);
      if (s >= 1) { this.jumpZ = 0; this.snapFeetToBody(); this.endAct(); }
    } else if (a.phase === 'land') {
      this.jumpZ = 0;
      if (a.phaseT >= 0.34) this.endAct();
    }
  }

  landSmash(boss) {
    audio.playImpactBoom(1.35);
    audio.playSwordPlant();
    if (window.fx) {
      const fx = window.fx;
      fx.triggerHitstop(120);
      fx.triggerShake(26, 0.55);
      if (fx.triggerZoomPunch) fx.triggerZoomPunch(0.07);
      if (fx.triggerImpactFrame) fx.triggerImpactFrame('#fb923c', 0.07);
      if (fx.addEarthBurst) fx.addEarthBurst(this.x, this.y, { big: true, radius: 150 });
      fx.spawnMassiveEarthChunks(this.x, this.y, 16, '#fb923c');
      fx.addShockwave(this.x, this.y, 230, '#fb923c', 8, 0.6);
      fx.addShockwave(this.x, this.y, 150, '#fde047', 5, 0.42);
      fx.addShockwave(this.x, this.y, 90, '#ffffff', 3, 0.26);
      fx.addStepDust(this.x, this.y, 22);
      fx.addPillar(this.x, this.y, 36, '#fb923c', 0.5);
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        fx.addFissureLine(this.x, this.y, this.x + Math.cos(a) * 190, this.y + Math.sin(a) * 190 * PERSPECTIVE_TILT, '#fb923c', 5);
      }
    }
    this.strike(boss, this.x, this.y, 138, 3.1, 'Skyfall Smash [E]', 52, 0.30, { isStrongMove: true, impulseStrength: 1.4, head: true });
  }

  // =========================================================================
  // R — CHARGE SMASH
  // =========================================================================
  castR(ax, ay, boss) {
    this.cds.r = this.maxCds.r;
    this.aimAt(null, ax, ay);
    this.beginAct('r', 30, { phase: 'charge', charge: 0, stage: 0, over: 0, smashT: 0, hit: false, power: 0 });
    this.rHoldingKey = true;
    audio.playSwordSlash(false, 0.7);
    this.lungeFootForward(this.rightFoot, -14, this.hipWidth + 4, 0.2);
    if (this.isLocal && window.game && window.game.camera && !this._chargeSavedZoom) {
      this._chargeSavedZoom = window.game.camera.targetZoom;
    }
    return true;
  }

  static get R_STAGE_TIMES() { return [0.65, 1.45, 2.35]; }
  static get R_OVER_MAX() { return 1.5; }

  releaseCharge() {
    const a = this.act;
    if (!a || a.kind !== 'r' || a.phase !== 'charge') return;
    if (a.stage < 1) {
      // Released too early: cancel with most of the cooldown refunded.
      this.cds.r = this.maxCds.r * 0.25;
      this.endAct();
      return;
    }
    a.phase = 'smash';
    a.smashT = 0;
    a.hit = false;
    a.power = a.stage;
    a.overFrac = a.stage >= 3 ? hClamp01(a.over / HammerPlayer25D.R_OVER_MAX) : 0;
    a.dur = 1.3;
    a.t = 0;
    a.freed = false;
    audio.playSwordSlash(true, 0.8 + a.stage * 0.1);
    if (this.isLocal) audio.playBreakerGrunt(a.stage >= 2);
  }

  act_r(dt, boss, a) {
    const times = HammerPlayer25D.R_STAGE_TIMES;
    if (a.phase === 'charge') {
      const mw = this.mouseWorld();
      this.facingAngle = Math.atan2((mw.y - this.y) / PERSPECTIVE_TILT, mw.x - this.x);
      a.dur = 30;
      const speed = this.overloadTimer > 0 ? 2.0 : 1.0;
      a.charge += dt * speed;
      let st = 0;
      for (let i = 0; i < 3; i++) if (a.charge >= times[i]) st = i + 1;
      if (st > a.stage) { a.stage = st; this.onChargeStage(st); }
      if (a.stage >= 3) a.over = Math.min(HammerPlayer25D.R_OVER_MAX, a.charge - times[2]);
      // straining under the weight: constant rumble, creaking groans, dust shaken loose from the ground
      a.strainT = (a.strainT || 0) - dt;
      if (a.stage >= 1 && a.strainT <= 0) { a.strainT = 0.42 - a.stage * 0.05; this.playStrainSfx(a.stage + (a.over > 0 ? 1 : 0)); }
      if (a.stage >= 1 && this.isLocal && window.fx && Math.random() < dt * (5 + a.stage * 3 + a.over * 4)) {
        window.fx.triggerShake(2.5 + a.stage * 2 + a.over * 5, 0.14);
      }
      if (a.stage >= 1 && window.fx && Math.random() < dt * (4 + a.stage * 4)) {
        window.fx.addStepDust(this.x + (Math.random() - 0.5) * 50, this.y + (Math.random() - 0.5) * 20, 1);
      }
      if (this.isLocal && window.game && window.game.camera) {
        const base = this._chargeSavedZoom || window.game.camera.targetZoom;
        window.game.camera.targetZoom = Math.min(window.game.camera.maxZoom || 2, base + a.stage * 0.06 + a.over * 0.05);
      }
      if (this.isBot || !this.rHoldingKey && false) this.releaseCharge();
      if (a.stage >= 3 && a.over >= HammerPlayer25D.R_OVER_MAX) this.releaseCharge(); // auto-release at max overcharge
      return;
    }
    // smash: a slow hoist, a held and trembling peak, a brutal fast drop, then wrenching the slab out of the floor
    a.smashT += dt;
    const p = hClamp01(a.smashT / 1.3);
    const HIT = 0.5;
    if (p < HIT) {
      this.jumpZ = hEaseOut(hClamp01(p / 0.22)) * (4 + a.power * 5) * (1 - hClamp01((p - 0.4) / 0.1));
      if (p > 0.2 && window.fx && Math.random() < dt * 16) window.fx.addStepDust(this.x + (Math.random() - 0.5) * 44, this.y + (Math.random() - 0.5) * 16, 1);
      if (p > 0.2 && p < 0.4 && this.isLocal && window.fx && Math.random() < dt * 10) window.fx.triggerShake(3 + a.power * 1.5, 0.1);
    }
    if (p >= HIT && !a.hit) {
      a.hit = true;
      this.jumpZ = 0;
      this.restoreChargeCamera();
      this.resolveChargeSmash(boss, a);
      // the recoil kicks the whole body back
      this.attackStepVx = -Math.cos(this.facingAngle) * (110 + a.power * 40);
      this.attackStepVy = -Math.sin(this.facingAngle) * (110 + a.power * 40) * PERSPECTIVE_TILT;
    } else if (a.hit) {
      this.jumpZ = 0;
      if (!a.freed && p >= 0.84) {
        a.freed = true; // slab wrenched out of the floor
        audio.playSwordPlant();
        if (window.fx) {
          window.fx.addStepDust(this.x + Math.cos(this.facingAngle) * 56, this.y + Math.sin(this.facingAngle) * 56 * PERSPECTIVE_TILT, 12);
          if (this.isLocal) window.fx.triggerShake(6, 0.2);
        }
      }
    }
    if (p >= 1) this.endAct();
  }

  onChargeStage(st) {
    audio.playParryClang(st >= 2);
    audio.playImpactBoom(0.5 + st * 0.25);
    if (window.fx) {
      window.fx.addShockwave(this.x, this.y, 60 + st * 35, st >= 3 ? '#ef4444' : (st === 2 ? '#fb923c' : '#e2e8f0'), 3 + st, 0.35);
      window.fx.addPillar(this.x, this.y, 18 + st * 10, st >= 3 ? '#ef4444' : '#fb923c', 0.4);
      if (this.isLocal) {
        window.fx.triggerShake(4 + st * 3, 0.2);
        if (st >= 3) window.fx.triggerImpactFrame('#ef4444', 0.1);
      }
    }
    if (window.fx) {
      for (let i = 0; i < st * 2; i++) {
        const ang = Math.random() * Math.PI * 2;
        window.fx.addFissureLine(this.x, this.y, this.x + Math.cos(ang) * (36 + st * 22), this.y + Math.sin(ang) * (36 + st * 22) * PERSPECTIVE_TILT, st >= 3 ? '#ef4444' : '#fb923c', 3 + st);
      }
      window.fx.addStepDust(this.x, this.y, 6 + st * 3);
    }
    this.say(st >= 3 ? 'STAGE 3 — MAX!' : `STAGE ${st}`, st >= 3 ? '#f87171' : '#fde047', 12 + st);
  }

  resolveChargeSmash(boss, a) {
    const st = a.power, over = a.overFrac || 0;
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    const cx = this.x + cosA * 66, cy = this.y + sinA * 66 * PERSPECTIVE_TILT;
    a.landX = cx; a.landY = cy;           // the drawn slab stays on this spot while the recoil slides the body back
    const radius = [0, 108, 132, 160][st] + over * 30;
    const coeff = [0, 2.6, 4.5, 7.6][st] * (1 + over * 0.6);
    const stagger = [0, 30, 58, 105][st] * (1 + over * 0.4);
    const col = st >= 3 ? '#ef4444' : (st === 2 ? '#fb923c' : '#fde047');
    audio.playImpactBoom(1.0 + st * 0.35 + over * 0.3);
    audio.playSwordPlant();
    if (window.fx) {
      window.fx.triggerHitstop(110 + st * 70 + over * 110);
      window.fx.triggerShake(20 + st * 9 + over * 10, 0.5 + st * 0.1);
      window.fx.spawnMassiveEarthChunks(cx, cy, 5 + st * 5, col);
      window.fx.addShockwave(cx, cy, radius * 1.7, col, 7 + st, 0.6);
      window.fx.addShockwave(cx, cy, radius * 1.1, '#ffffff', 4, 0.4);
      window.fx.addShockwave(cx, cy, radius * 0.6, col, 5, 0.3);
      window.fx.addPillar(cx, cy, 30 + st * 14, col, 0.65);
      window.fx.addStepDust(cx, cy, 14 + st * 6);
      window.fx.addStepDust(cx + 20, cy + 6, 8 + st * 3);
      window.fx.addStepDust(cx - 20, cy - 6, 8 + st * 3);
      // a dented crater ring burned into the floor
      const ringR = 34 + st * 14;
      for (let i = 0; i < 14; i++) {
        const a0 = (i / 14) * Math.PI * 2, a1 = ((i + 1) / 14) * Math.PI * 2;
        window.fx.addScorchSegment(cx + Math.cos(a0) * ringR, cy + Math.sin(a0) * ringR * PERSPECTIVE_TILT, cx + Math.cos(a1) * ringR, cy + Math.sin(a1) * ringR * PERSPECTIVE_TILT, st >= 3);
      }
      for (let i = 0; i < st * 2 + (over > 0.5 ? 3 : 0); i++) {
        const ang = this.facingAngle + (i - st * 0.5) * 0.6;
        window.fx.addFissureLine(cx, cy, cx + Math.cos(ang) * radius * 1.6, cy + Math.sin(ang) * radius * 1.6 * PERSPECTIVE_TILT, col, 4 + st);
      }
      if (this.isLocal) {
        window.fx.triggerZoomPunch(0.07 + st * 0.035);
        window.fx.triggerImpactFrame(col, 0.08 + st * 0.03);
      }
    }
    const hit = this.strike(boss, cx, cy, radius, coeff, `Charge Smash S${st} [R]`, stagger, st >= 3 ? 0 : 0.30,
      { isStrongMove: true, impulseStrength: 1.0 + st * 0.3, head: true });
    if (hit && st >= 3) {
      const stacks = over >= 0.97 ? 3 : 2;
      this.brokenApply(boss, stacks);
    }
    if (hit && st >= 2) this.addMomentum(st >= 3 ? 100 : 50);
  }

  // =========================================================================
  // A — SHOULDER RAM
  // =========================================================================
  castA(ax, ay, boss) {
    this.cds.a = this.maxCds.a;
    this.aimAt(boss, ax, ay, 420);
    this.beginAct('a', 0.62, { hit: false, trailT: 0 });
    audio.playSwordSlash(true, 1.1);
    if (this.isLocal) audio.playBreakerGrunt(false);
    if (window.fx) window.fx.addShockwave(this.x, this.y, 70, '#fb923c', 3.5, 0.3);
    return true;
  }

  act_a(dt, boss, a) {
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    if (a.t >= 0.1 && a.t < 0.42) {
      const spd = 610;
      const near = boss && boss.hp > 0 && Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT) < 62;
      if (!near) {
        this.attackStepVx = cosA * spd;
        this.attackStepVy = sinA * spd * PERSPECTIVE_TILT;
      } else {
        this.attackStepVx = 0; this.attackStepVy = 0;
      }
      a.trailT -= dt;
      if (a.trailT <= 0 && window.fx) {
        a.trailT = 0.06;
        window.fx.addAfterimage(this.x, this.y, this.facingAngle, '#fb923c');
        window.fx.addStepDust(this.x, this.y, 2);
      }
      if (!a.hit && boss && boss.hp > 0 && Math.hypot(boss.x - this.x, (boss.y - this.y) / PERSPECTIVE_TILT) < 84) {
        a.hit = true;
        this.attackStepVx = 0; this.attackStepVy = 0;
        audio.playImpactBoom(1.0);
        if (window.fx) {
          window.fx.triggerHitstop(45);
          window.fx.triggerShake(10, 0.2);
          window.fx.addShockwave(this.x + cosA * 40, this.y + sinA * 40 * PERSPECTIVE_TILT, 96, '#fb923c', 4.5, 0.32);
        }
        this.strike(boss, this.x + cosA * 40, this.y + sinA * 40 * PERSPECTIVE_TILT, 100, 1.35, 'Shoulder Ram [A]', 24, 0.30, { isStrongMove: true, impulseStrength: 1.2, head: true });
      }
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // S — KAROK'S ROAR (taunt)
  // =========================================================================
  castS(ax, ay, boss) {
    this.cds.s = this.maxCds.s;
    this.aimAt(boss, ax, ay, 600);
    this.beginAct('s', 1.0, { slammed: false });
    audio.playSwordSlash(false, 0.8);
    return true;
  }

  act_s(dt, boss, a) {
    this.jumpZ = a.t < 0.4 ? hEaseOut(a.t / 0.4) * 10 : 0;
    if (!a.slammed && a.t >= 0.46) {
      a.slammed = true;
      this.jumpZ = 0;
      audio.playImpactBoom(1.5);
      audio.playSwordPlant();
      if (this.isLocal) audio.playBreakerGrunt(true);
      if (window.fx) {
        window.fx.triggerShake(14, 0.35);
        window.fx.triggerHitstop(60);
        window.fx.addShockwave(this.x, this.y, 210, '#fb923c', 6, 0.55);
        window.fx.addShockwave(this.x, this.y, 130, '#fde047', 4, 0.4);
        window.fx.addPillar(this.x, this.y, 34, '#fb923c', 0.55);
        window.fx.spawnMassiveEarthChunks(this.x, this.y, 5, '#fb923c');
      }
      this.applyTaunt(boss);
    }
    if (a.t >= a.dur) this.endAct();
  }

  applyTaunt(boss) {
    if (!boss || typeof boss.applyKarokTaunt !== 'function') {
      this.say('📣 ROAR!', '#fb923c', 14);
      return;
    }
    const res = boss.applyKarokTaunt(this);
    this.say(res.msg, res.state === 'forced' ? '#7dd3fc' : '#fde047', 13);
    if (res.state === 'ignored') this.cds.s = 3.0; // the boss shrugged it off: refund most of the cooldown
  }

  // =========================================================================
  // D — HOIST COUNTER (uppercut with the counter property)
  // =========================================================================
  castD(ax, ay, boss) {
    this.cds.d = this.maxCds.d;
    this.aimAt(boss, ax, ay, 300);
    const a = this.beginAct('d', 0.55, { hit: false, countered: false });
    audio.playSwordSlash(false, 1.0);
    this.lungeFootForward(this.rightFoot, -10, this.hipWidth + 4, 0.14);
    // Same instant check Breaker uses, so a well-timed press lands the counter immediately.
    if (boss && typeof boss.isCounterable === 'function' && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 205) {
      this.doHoistCounter(boss, a);
    }
    return true;
  }

  doHoistCounter(boss, a) {
    if (a.countered) return;
    a.countered = true;
    a.hit = true;
    this.executeBreakerCounterSuccess(boss);
    this.brokenApply(boss, 1);
    this.addMomentum(100);
    this.say('⚡ HOIST COUNTER!', '#7dd3fc', 14);
  }

  act_d(dt, boss, a) {
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    if (a.t > 0.12 && a.t < 0.28) {
      this.attackStepVx = cosA * 150; this.attackStepVy = sinA * 150 * PERSPECTIVE_TILT;
    }
    if (!a.hit && a.t >= 0.26) {
      a.hit = true;
      if (boss && typeof boss.isCounterable === 'function' && boss.isCounterable() && Math.hypot(boss.x - this.x, boss.y - this.y) < 205) {
        a.hit = false;
        this.doHoistCounter(boss, a);
      } else {
        const cx = this.x + cosA * 52, cy = this.y + sinA * 52 * PERSPECTIVE_TILT;
        if (window.fx) {
          window.fx.addSlashRibbon(this.x, this.y, 108, this.facingAngle - 0.4, this.facingAngle + 0.4, '#7dd3fc', 20, 0.22);
          window.fx.addImpactStarburst(cx, cy - 30, 40, '#7dd3fc', 4, 0.3, 0.2);
        }
        this.strike(boss, cx, cy, 98, 1.0, 'Hoist [D]', 13, 0.30, { impulseStrength: 0.9, head: true });
      }
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // F — BONK BARRAGE (3 + 3 per Broken stack, up to 12)
  // Rhythm-friendly: pressing F ~0.25-0.55s after the last bonk is a PERFECT (+25% damage, golden FX).
  // Mashing faster still works. The swing tempo speeds up and the pitch of every bonk climbs.
  // =========================================================================
  castF(ax, ay, boss) {
    const stacks = brokenStacksOf(boss);
    this.aimAt(boss, ax, ay, 320);
    const a = this.beginAct('f', 6, { max: 3 + 3 * stacks, k: 0, bt: 99, idle: 0, pending: null, ending: false, side: 1, up: 0.085, down: 0.08, perfects: 0, perfect: false, animT: 99 });
    this.cds.f = this.maxCds.f; // the real cooldown restarts when the barrage ends (finishBarrage)
    a.bossRef = boss;
    this.nextBonk(boss);
    return true;
  }

  bonkTempo(a, k) {
    const t = hClamp01((k - 1) / 11);
    a.up = hLerp(0.16, 0.07, t);      // a long, committed hoist that speeds up as momentum builds
    a.down = hLerp(0.11, 0.05, t);
  }

  nextBonk(boss) {
    const a = this.act;
    if (!a || a.kind !== 'f' || a.ending || a.k >= a.max) return false;
    const gate = a.k === 0 ? 0 : (a.up + a.down * 0.75);
    if (a.bt < gate) return false; // can't machine-gun inside a single swing
    const gap = a.bt;
    a.k++;
    this.bonkTempo(a, a.k);
    a.perfect = (a.k > 1 && gap >= 0.36 && gap <= 0.78) || this.overloadTimer > 0;   // Overload: every bonk is a perfect bonk
    if (a.perfect) a.perfects++;
    a.bt = 0;
    a.idle = 0;
    a.side = -a.side;
    a.animT = 0;
    a.pending = { k: a.k, t: a.up + a.down * 0.92, perfect: a.perfect };
    this.bonkAim();
    audio.playSwordSlash(a.k >= 7, 0.85 + a.k * 0.04);
    this.playHeavySwoosh(a.k);
    return true;
  }

  // The bonks track the cursor (angle only, the feet stay planted) so you can steer onto a moving boss.
  bonkAim() {
    const m = this.isLocal ? this.mouseWorld() : this.remoteAim;
    if (m && isFinite(m.x) && isFinite(m.y)) this.facingAngle = Math.atan2((m.y - this.y) / PERSPECTIVE_TILT, m.x - this.x);
  }

  act_f(dt, boss, a) {
    if (!a.pending || a.pending.t > 0.03) this.bonkAim();   // lock the angle for the instant of impact
    this.attackStepVx = 0; this.attackStepVy = 0;
    a.bt += dt;
    a.animT = (a.animT || 0) + dt;
    a.dur = 6;
    const live = boss || a.bossRef;
    if (a.pending) {
      a.pending.t -= dt;
      if (a.pending.t <= 0) {
        const pend = a.pending;
        a.pending = null;
        this.resolveBonk(live, a, pend.k, pend.perfect);
        if (a.cancelReq) { this.cancelBarrage(); return; }   // a right-click arrived mid-swing: the swing lands, then you walk away
      }
    } else {
      a.idle += dt;
    }
    const finishedAll = a.k >= a.max && !a.pending;
    if (finishedAll && !a.ending) { a.ending = true; a.endT = 0; }
    if (a.ending) {
      a.endT += dt;
      if (a.endT >= 0.7) this.finishBarrage();
    } else if (a.idle > 1.5 && !a.pending) {
      this.finishBarrage();
    }
  }

  finishBarrage() {
    const a = this.act;
    this.cds.f = this.maxCds.f;
    this.endAct();
    return a;
  }

  // RIGHT-CLICK OUT of the [F] barrage. Never needed, but always available: a swing already in flight still lands, then you are free to move.
  // Leaving early costs 70% of the cooldown (the same as being interrupted); leaving after the last bonk costs the normal cooldown.
  rightClickCancel() {
    const a = this.act;
    if (!a || a.kind !== 'f') return false;
    const net = window.game && window.game.net;
    if (this.isLocal && net) net.broadcast({ type: 'player_skill_release', skill: 'f', cls: 'hammer' });
    return this.cancelBarrage();
  }

  cancelBarrage() {
    const a = this.act;
    if (!a || a.kind !== 'f') return false;
    if (a.ending) { this.finishBarrage(); return true; }
    if (a.pending) { a.cancelReq = true; return true; }
    this.cds.f = this.maxCds.f * (a.k >= a.max ? 1 : 0.7);
    this.endAct();
    return true;
  }

  // Synthesised bonk: a body thump + metallic clonk + crack, pitched up with every bonk of the barrage.
  playBonkSfx(k, max, final, perfect) {
    const A = window.audio;
    if (!A || !A.ctx || A.ctx.state !== 'running' || A.muted || !A.getOut) return;
    const ctx = A.ctx, now = ctx.currentTime;
    const pm = Math.pow(2, ((k - 1) / 11) * 0.85);
    const tone = (type, f0, f1, dur, vol, reverb = 0.12, delay = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, now + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + delay + dur);
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.exponentialRampToValueAtTime(vol, now + delay + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      o.connect(g);
      A.connectWithReverb(g, reverb);
      o.start(now + delay);
      o.stop(now + delay + dur + 0.02);
    };
    tone('sine', 230 * pm, 58 * pm, 0.17, 0.62);                    // body thump
    tone('triangle', 700 * pm, 520 * pm, 0.13, 0.20);               // clonk
    tone('square', 1180 * pm, 900 * pm, 0.05, 0.07);                // metal ping
    // crack: a short burst of filtered noise
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const ns = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
    ns.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 1500 + k * 90; ng.gain.value = 0.34;
    ns.connect(hp); hp.connect(ng); A.connectWithReverb(ng, 0.1);
    ns.start(now);
    if (perfect) {
      tone('sine', 1480 * pm, 1480 * pm, 0.28, 0.16, 0.45, 0.02);
      tone('sine', 1975 * pm, 1975 * pm, 0.22, 0.10, 0.45, 0.05);
    }
    if (final) {
      tone('sine', 78, 30, 1.0, 0.95, 0.3);                         // sub boom
      tone('sawtooth', 180, 1900, 0.38, 0.16, 0.5);                 // rising sweep
      tone('sine', 880, 880, 0.9, 0.14, 0.6, 0.05);
      tone('sine', 1318, 1318, 0.9, 0.12, 0.6, 0.08);
      tone('sine', 1760, 1760, 0.9, 0.10, 0.6, 0.11);
    }
  }

  // Low creaking groan while straining under a charge (pitch climbs with the stage).
  playStrainSfx(stage) {
    const A = window.audio;
    if (!A || !A.ctx || A.ctx.state !== 'running' || A.muted || !A.getOut) return;
    const ctx = A.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(44 + stage * 9, now);
    o.frequency.linearRampToValueAtTime(58 + stage * 14, now + 0.36);
    f.type = 'lowpass'; f.frequency.value = 260 + stage * 90;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16 + stage * 0.03, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    o.connect(f); f.connect(g);
    A.connectWithReverb(g, 0.18);
    o.start(now); o.stop(now + 0.45);
  }

  // Heavy "whoom" of the slab being hauled up and dropped: filtered noise sweeping down with a low body tone.
  playHeavySwoosh(k) {
    const A = window.audio;
    if (!A || !A.ctx || A.ctx.state !== 'running' || A.muted || !A.getOut) return;
    const ctx = A.ctx, now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.28);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    const ns = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    ns.buffer = buf; lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 + k * 60, now);
    lp.frequency.exponentialRampToValueAtTime(140, now + 0.26);
    g.gain.value = 0.34;
    ns.connect(lp); lp.connect(g); A.connectWithReverb(g, 0.12);
    ns.start(now);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, now); o.frequency.exponentialRampToValueAtTime(48, now + 0.26);
    og.gain.setValueAtTime(0.0001, now); og.gain.exponentialRampToValueAtTime(0.3, now + 0.06); og.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    o.connect(og); A.connectWithReverb(og, 0.1);
    o.start(now); o.stop(now + 0.32);
  }

  pushPop(e) {
    const list = this.popFx || (this.popFx = []);
    if (e.kind === 'word') {
      // keep at most the 2 newest comic words alive (older ones just pile up as overdraw)
      let words = 0;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === 'word' && ++words >= 2) list.splice(i, 1);
    }
    list.push(Object.assign({ born: performance.now() }, e));
    if (list.length > 10) list.shift();
  }

  resolveBonk(boss, a, k, perfect) {
    const final = (k === a.max);
    this._bonkAt = performance.now();      // the drawn slab stays pinned to the impact point for a beat (hammerLandTarget)
    const tier = Math.min(4, Math.ceil(k / 3));
    const fxTier = final ? 4 : tier;
    const cosA = Math.cos(this.facingAngle), sinA = Math.sin(this.facingAngle);
    const cx = this.x + cosA * 98, cy = this.y + sinA * 98 * PERSPECTIVE_TILT;   // the centre of the slab, where it actually meets the floor
    this._bonkPt = { x: cx, y: cy };
    const colors = ['#e2e8f0', '#fde047', '#fb923c', '#ef4444', '#ffffff'];
    const col = final ? '#ffffff' : colors[tier - 1];
    let coeff = final ? (3.0 + 0.28 * a.max) : (0.55 + 0.09 * k);
    let stagger = final ? (45 + a.max * 5) : (5 + 1.3 * k);
    if (perfect) { coeff *= 1.25; stagger *= 1.2; }
    const heavy = tier >= 3 || final;
    const tierUp = (k === 4 || k === 7 || k === 10);

    this.playBonkSfx(k, a.max, final, perfect);
    audio.playImpactBoom(0.45 + 0.05 * k + (final ? 0.9 : 0));
    if (final) audio.playSwordPlant();

    const hitBoss = this.strike(boss, cx, cy, 118, coeff, `Bonk ${k}/${a.max} [F]`, stagger, final ? 1 : 0.10,
      { isStrongMove: heavy, impulseStrength: 0.9 + 0.17 * k, head: true, stacks: 1 });

    // the boss visibly gets squashed into the floor with every hit and flashes white
    if (boss) {
      if (typeof boss.pelvisVelZ === 'number') boss.pelvisVelZ -= 24 + k * 6 + (final ? 40 : 0);
      if (typeof boss.pauldronVelZ === 'number') boss.pauldronVelZ -= 30 + k * 5;
      if (typeof boss.hitFlashTimer === 'number') boss.hitFlashTimer = Math.max(boss.hitFlashTimer, 0.12 + (final ? 0.2 : 0));
    }

    if (window.fx) {
      const fx = window.fx;
      // Adaptive particle budget: the big beats (tier-ups, the final blow) always get everything, but ordinary
      // bonks thin out their dust / chunks / sparks / cracks when the screen is already crowded.
      const load = ((fx.sparks && fx.sparks.length) || 0) + ((fx.earthChunks && fx.earthChunks.length) || 0) * 2 + ((fx.fissures && fx.fissures.length) || 0) * 3;
      const lf = (final || tierUp) ? 1 : Math.max(0.4, 1 - load / 420);
      const n = (v) => Math.max(1, Math.round(v * lf));
      fx.addImpactStarburst(cx, cy - 26, 34 + fxTier * 16, col, 4 + fxTier * 2, Math.random() * 3, 0.2 + fxTier * 0.03);
      fx.addShockwave(cx, cy, 70 + k * 12 + (final ? 110 : 0), col, 4 + fxTier, 0.4 + fxTier * 0.06);
      fx.addShockwave(cx, cy, 30 + k * 5, '#ffffff', 2, 0.22);
      fx.addStepDust(cx, cy, n(3 + k + 3 + fxTier * 2));
      fx.triggerHitstop(28 + k * 10 + (final ? 260 : 0) + (perfect ? 14 : 0));
      fx.triggerShake(6 + k * 2.4 + (final ? 24 : 0), 0.2 + fxTier * 0.05);
      fx.triggerZoomPunch(0.02 + 0.007 * k + (final ? 0.11 : 0));
      fx.addDragSparks(cx, cy - 10, this.facingAngle + Math.PI, n(3 + fxTier * 3), false, col);
      // ground damage accumulates: more, longer cracks every bonk
      for (let i = 0, nf = n(Math.min(5, 1 + tier)); i < nf; i++) {
        const ang = Math.random() * Math.PI * 2;
        fx.addFissureLine(cx, cy, cx + Math.cos(ang) * (50 + k * 12), cy + Math.sin(ang) * (50 + k * 12) * PERSPECTIVE_TILT, tier >= 3 ? '#ef4444' : '#fb923c', 3 + tier);
      }
      fx.spawnMassiveEarthChunks(cx, cy, n(2 + fxTier * 2) + (final ? 6 : 0), '#fb923c');
      if (fxTier >= 3 && this.isLocal) fx.triggerImpactFrame(col, 0.05 + fxTier * 0.015);
      if (perfect) {
        fx.addShockwave(cx, cy, 120, '#fde047', 4, 0.35);
        fx.addDragSparks(cx, cy - 20, this.facingAngle, 8, false, '#fde047');
      }
      if (tierUp) {
        fx.addShockwave(this.x, this.y, 220, col, 7, 0.5);
        fx.addPillar(cx, cy, 30 + k * 3, col, 0.5);
        fx.triggerShake(14, 0.3);
      }
      if (fxTier >= 4 || final) {
        fx.addPillar(cx, cy, 26 + k * 3, col, 0.4 + (final ? 0.5 : 0));
        fx.addLightningBolt(cx + (Math.random() - 0.5) * 40, cy - 150, cx, cy - 20, '#fde047', 3.2, 0.26);
      }
      if (final) {
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
          fx.addFissureLine(cx, cy, cx + Math.cos(ang) * 190, cy + Math.sin(ang) * 190 * PERSPECTIVE_TILT, '#fb923c', 6);
        }
        fx.addShockwave(cx, cy, 300, '#fde047', 9, 0.7);
        fx.addShockwave(cx, cy, 200, '#ffffff', 6, 0.5);
        if (this.isLocal) fx.triggerImpactFrame('#ffffff', 0.2);
      }
      // comic pop-in word, bursting speed lines, and dizzy stars circling the boss's head
      this.pushPop({ kind: 'word', x: cx, y: cy - 72 - k * 2, k, tier: fxTier, final, perfect, color: col, life: final ? 1.25 : 0.62, rot: (Math.random() - 0.5) * 0.5 });
      if (fxTier >= 3 && boss) this.pushPop({ kind: 'stars', boss, n: Math.min(6, 2 + fxTier), life: final ? 1.6 : 0.95 });
      if (tierUp) this.pushPop({ kind: 'tier', x: this.x, y: this.y - 150, life: 0.9, color: col, text: k === 4 ? 'HEAVY!' : (k === 7 ? 'CRUSHING!' : 'DEVASTATING!') });
    }
    // the recoil of each blow rocks the whole body backwards
    if (final) this.addMomentum(50);
    void hitBoss;
  }
  // =========================================================================
  // T — WORLDBREAKER: ram the boss hammer-first; on contact spring off its head, rebound skyward, grow the hammer
  // and crater it. The boss is held down for the whole sequence and for a few seconds afterwards.
  // =========================================================================
  castT(ax, ay, boss) {
    this.cds.t = this.maxCds.t;
    this.aimAt(boss, ax, ay, 900);
    const hasBoss = !!(boss && boss.hp > 0);
    this.beginAct('t', 12, {
      phase: 'charge', phaseT: 0, sx: this.x, sy: this.y, hasBoss, boss,
      stacksBefore: brokenStacksOf(boss), grow: 1, shock2: false, locked: false,
      ang: this.facingAngle, hx: 0, hy: 0
    });
    this.hIframes = 0.5;
    audio.playSwordSlash(true, 1.4);
    if (this.isLocal) audio.playBreakerGrunt(true);
    if (this.isLocal && window.game && window.game.camera && !this._chargeSavedZoom) this._chargeSavedZoom = window.game.camera.targetZoom;
    if (window.fx) window.fx.addShockwave(this.x, this.y, 90, '#fb923c', 4, 0.3);
    return true;
  }

  static get T_DOWN_AFTER() { return 3.6; }

  act_t(dt, boss, a) {
    a.phaseT += dt;
    const bs = a.boss || boss;
    const cam = (this.isLocal && window.game) ? window.game.camera : null;
    const saved = this._chargeSavedZoom || 1.05;
    this.hIframes = Math.max(this.hIframes, 0.2);

    if (a.phase === 'charge') {
      // hammer pointed forward, bulldozing straight at the boss
      if (bs && bs.hp > 0) this.facingAngle = Math.atan2((bs.y - this.y) / PERSPECTIVE_TILT, bs.x - this.x);
      const spd = 1000;
      this.x += Math.cos(this.facingAngle) * spd * dt;
      this.y += Math.sin(this.facingAngle) * spd * dt * PERSPECTIVE_TILT;
      if (window.fx && Math.random() < dt * 40) {
        window.fx.addAfterimage(this.x, this.y, this.facingAngle, '#fb923c');
        window.fx.addStepDust(this.x, this.y, 2);
      }
      if (cam) cam.targetZoom = Math.min(1.35, saved + a.phaseT * 0.25);
      const d = bs && bs.hp > 0 ? Math.hypot(bs.x - this.x, (bs.y - this.y) / PERSPECTIVE_TILT) : 999;
      if (d < 84 && ultHoldBlocked(bs)) {
        // the shared hold rule: the boss is in a mechanic, so the ram glances off. No hold, no damage, half the cooldown back.
        this.cds.t = this.maxCds.t * 0.5;
        a.phase = 'bounce'; a.phaseT = 0; a.bx = this.x; a.by = this.y;
        this.restoreChargeCamera();
        audio.playImpactBoom(0.9);
        ultBounceFx(this.x + Math.cos(this.facingAngle) * 50, this.y + Math.sin(this.facingAngle) * 50 * PERSPECTIVE_TILT);
        if (window.fx) window.fx.triggerShake(6, 0.15);
      } else if (d < 84) {
        this.towerRamImpact(bs, a);
      } else if (a.phaseT >= 0.8) {
        // whiffed: skid to a stop, most of the cooldown comes back (not while the boss is in a mechanic: that whiff costs it all)
        if (!ultHoldBlocked(bs)) this.cds.t = this.maxCds.t * 0.3;
        this.say('MISSED!', '#fca5a5', 14);
        if (window.fx) window.fx.addStepDust(this.x, this.y, 8);
        this.restoreChargeCamera();
        this.endAct();
      }
    } else if (a.phase === 'bounce') {
      // knocked back the way it came, a short skid
      const s = hClamp01(a.phaseT / 0.3);
      const back = hEaseOut(s) * 70;
      this.x = a.bx - Math.cos(this.facingAngle) * back;
      this.y = a.by - Math.sin(this.facingAngle) * back * PERSPECTIVE_TILT;
      if (a.phaseT >= 0.4) { this.snapFeetToBody(); this.endAct(); }
    } else if (a.phase === 'hop') {
      // spring off the boss's front up onto its head
      const s = hClamp01(a.phaseT / 0.32);
      this.x = hLerp(a.hx, bs.x, hEaseOut(s));
      this.y = hLerp(a.hy, bs.y + 4, hEaseOut(s));
      this.jumpZ = hLerp(0, 104, hEaseOut(s)) + Math.sin(s * Math.PI) * 22;
      a.grow = 1;
      if (s >= 1) {
        a.phase = 'rebound'; a.phaseT = 0; a.fx = this.x; a.fy = this.y;
        audio.playImpactBoom(1.2); audio.playParryClang(true);
        if (window.fx) {
          window.fx.triggerHitstop(70);
          window.fx.triggerShake(12, 0.25);
          window.fx.addShockwave(bs.x, bs.y, 110, '#ffffff', 5, 0.35);
          window.fx.addImpactStarburst(bs.x, bs.y - 100, 90, '#fde047', 8, 0.5, 0.3);
          window.fx.addFloatingText(bs.x, bs.y - 130, 'STOMP!', '#fde047', 16);
        }
        if (this.isLocal && window.fx) window.fx.triggerImpactFrame('#ffffff', 0.08);
        this.strike(bs, bs.x, bs.y, 90, 0.9, 'Head Stomp [T]', 12, 0, { impulseStrength: 0.9 });
      }
    } else if (a.phase === 'rebound') {
      // kick off the head: up and back the way we came
      const s = hClamp01(a.phaseT / 0.5);
      const bx = bs.x + Math.cos(a.ang + Math.PI) * 0.0, by = bs.y;
      const tx = bs.x - Math.cos(this.facingAngle) * 70, ty = bs.y - Math.sin(this.facingAngle) * 70 * PERSPECTIVE_TILT;
      this.x = hLerp(a.fx, tx, hEaseOut(s));
      this.y = hLerp(a.fy, ty, hEaseOut(s));
      this.jumpZ = hLerp(104, 250, hEaseOut(s));
      a.grow = 1 + hEaseOut(s) * 1.3;
      void bx; void by;
      if (cam) cam.targetZoom = Math.max(0.85, saved - s * 0.3);
      if (window.fx && Math.random() < dt * 25) window.fx.addAfterimage(this.x, this.y - this.jumpZ * 0.5, this.facingAngle, '#fb923c');
      if (s >= 1) { a.phase = 'hang'; a.phaseT = 0; a.fx = this.x; a.fy = this.y; }
    } else if (a.phase === 'hang') {
      this.jumpZ = 250 + Math.sin(a.phaseT * 9) * 3;
      a.grow = 2.3 + Math.min(0.3, a.phaseT * 0.6);
      if (window.fx && Math.random() < dt * 14) window.fx.addLightningBolt(this.x + (Math.random() - 0.5) * 80, this.y - this.jumpZ - 40, this.x, this.y - this.jumpZ + 10, '#fb923c', 2.5, 0.18);
      if (a.phaseT >= 0.5) { a.phase = 'slam'; a.phaseT = 0; audio.playSwordSlash(true, 1.5); }
    } else if (a.phase === 'slam') {
      const s = hClamp01(a.phaseT / 0.24);
      const fxp = bs.x - Math.cos(this.facingAngle) * 60, fyp = bs.y - Math.sin(this.facingAngle) * 60 * PERSPECTIVE_TILT;
      this.x = hLerp(a.fx, fxp, hEaseIn(s));
      this.y = hLerp(a.fy, fyp, hEaseIn(s));
      this.jumpZ = 250 * (1 - hEaseIn(s));
      if (cam) cam.targetZoom = Math.min(1.5, saved - 0.3 + s * 0.55);
      if (s >= 1) {
        this.jumpZ = 0;
        this.snapFeetToBody();
        this.worldbreakerImpact(bs, a);
        a.phase = 'crater'; a.phaseT = 0;
      }
    } else if (a.phase === 'crater') {
      this.jumpZ = 0;
      a.grow = Math.max(1.0, 2.6 - a.phaseT * 2.6);
      if (!a.shock2 && a.phaseT >= 0.7) { a.shock2 = true; this.worldbreakerAftershock(bs, a); }
      if (a.phaseT >= 1.6) {
        this.restoreChargeCamera();
        // the animation is over: the boss stays down a few more seconds
        if (bs && bs.state === 'staggered') {
          bs.lockedByUltimateTimer = 0;
          bs.stateDuration = HammerPlayer25D.T_DOWN_AFTER;
          bs.stateTimer = HammerPlayer25D.T_DOWN_AFTER;
        }
        this.endAct();
      }
    }
  }

  towerRamImpact(bs, a) {
    a.phase = 'hop'; a.phaseT = 0; a.hx = this.x; a.hy = this.y; a.ang = this.facingAngle;
    this.restoreChargeCamera();
    audio.playImpactBoom(1.6);
    audio.playSwordPlant();
    if (window.fx) {
      window.fx.triggerHitstop(110);
      window.fx.triggerShake(22, 0.45);
      window.fx.triggerZoomPunch(0.1);
      if (this.isLocal) window.fx.triggerImpactFrame('#fb923c', 0.14);
      window.fx.addShockwave(this.x, this.y, 170, '#fb923c', 7, 0.45);
      window.fx.addSonicBoomRings(this.x - Math.cos(this.facingAngle) * 120, this.y - Math.sin(this.facingAngle) * 120 * PERSPECTIVE_TILT, this.x, this.y, 4, '#fb923c');
      window.fx.spawnMassiveEarthChunks(this.x, this.y, 8, '#fb923c');
    }
    this.strike(bs, this.x + Math.cos(this.facingAngle) * 40, this.y + Math.sin(this.facingAngle) * 40 * PERSPECTIVE_TILT, 120, 3.4, 'Worldbreaker Ram [T]', 45, 0, { isStrongMove: true, impulseStrength: 2.2, head: true });
    // down the boss for the whole animation (+ the extra seconds are added when the animation ends)
    if (bs && typeof bs.lockInPlaceForUltimate === 'function') bs.lockInPlaceForUltimate(3.6, HammerPlayer25D.T_DOWN_AFTER, this.isRemote);
    a.locked = true;
  }

  worldbreakerImpact(boss, a) {
    audio.playImpactBoom(2.0);
    audio.playSwordPlant();
    audio.playCounterSuccessBoom && audio.playCounterSuccessBoom();
    if (window.fx) {
      const fx = window.fx;
      fx.triggerHitstop(150);
      fx.triggerShake(30, 0.7);
      fx.triggerZoomPunch(0.12);
      if (this.isLocal) fx.triggerImpactFrame('#fb923c', 0.16);
      fx.spawnMassiveEarthChunks(this.x, this.y, 14, '#fb923c');
      fx.addShockwave(this.x, this.y, 260, '#fb923c', 9, 0.6);
      fx.addShockwave(this.x, this.y, 170, '#fde047', 6, 0.45);
      fx.addPillar(this.x, this.y, 62, '#ef4444', 0.85);
      fx.addStepDust(this.x, this.y, 16);
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        fx.addFissureLine(this.x, this.y, this.x + Math.cos(ang) * 230, this.y + Math.sin(ang) * 230 * PERSPECTIVE_TILT, '#ef4444', 6);
      }
    }
    // Bonus damage for every Broken stack already on the boss, then 3 fresh stacks.
    const mult = 1 + 0.25 * a.stacksBefore;
    const hit = this.strike(boss, this.x, this.y, 175, 9.0 * mult, 'WORLDBREAKER [T]', 150, 0, { isStrongMove: true, impulseStrength: 2.0, head: true });
    if (hit || (boss && boss.hp > 0 && Math.hypot(boss.x - this.x, boss.y - this.y) < 260)) this.brokenApply(boss, 3);
  }

  worldbreakerAftershock(boss, a) {
    audio.playImpactBoom(1.6);
    if (window.fx) {
      window.fx.triggerHitstop(70);
      window.fx.triggerShake(22, 0.5);
      window.fx.addShockwave(this.x, this.y, 380, '#ef4444', 10, 0.75);
      window.fx.addShockwave(this.x, this.y, 250, '#ffffff', 5, 0.5);
      window.fx.addPillar(this.x, this.y, 90, '#fb923c', 0.7);
    }
    this.strike(boss, this.x, this.y, 300, 6.0, 'Worldbreaker Aftershock [T]', 90, 0, { isStrongMove: true, impulseStrength: 1.6 });
  }
  // =========================================================================
  // Z — MOMENTUM: Shatter (1 pip); X — Overload (3 pips)
  // =========================================================================
  castZ(boss, overload = false) {
    if (this.cds.z > 0 || !this.canAct()) return false;
    if (overload) {   // [X]
      if (this.momentum < 300) { this.say('Overload needs 3 Momentum', '#fca5a5', 12); return false; }
      this.momentum -= 300;
      this.cds.z = this.maxCds.z;
      this.beginAct('z', 0.9, { mode: 'overload', fired: false });
      return true;
    }
    if (this.momentum < 100) { this.say('Not enough Momentum', '#fca5a5', 12); return false; }
    if (brokenStacksOf(boss) <= 0) { this.say('Nothing to Shatter — no Broken stacks', '#fca5a5', 12); return false; }
    if (!this.hammerHeld) { this.say('The hammer is away!', '#fca5a5', 12); return false; }
    this.momentum -= 100;
    this.cds.z = this.maxCds.z;
    this.aimAt(boss, boss.x, boss.y, 9999);
    this.beginAct('z', 1.0, { mode: 'shatter', stacks: brokenStacksOf(boss), fired: 0, nextT: 0.32 });
    return true;
  }

  act_z(dt, boss, a) {
    if (a.mode === 'overload') {
      this.jumpZ = a.t < 0.35 ? hEaseOut(a.t / 0.35) * 8 : 0;
      if (!a.fired && a.t >= 0.4) {
        a.fired = true;
        this.overloadTimer = 8.0;
        this.overloadBrokenCd = 0;
        this.cds.r = 0; this.cds.f = 0;          // Overload refreshes [R] and [F] only (not W or the rest)
        audio.playImpactBoom(1.4);
        audio.playParryClang(true);
        if (this.isLocal) audio.playBreakerGrunt(true);
        if (window.fx) {
          window.fx.triggerShake(16, 0.4);
          window.fx.addShockwave(this.x, this.y, 190, '#ef4444', 7, 0.5);
          window.fx.addShockwave(this.x, this.y, 120, '#fde047', 4, 0.4);
          window.fx.addPillar(this.x, this.y, 40, '#ef4444', 0.7);
        }
        this.say('🔥 OVERLOAD!', '#fb7185', 15);
      }
      if (a.t >= a.dur) this.endAct();
      return;
    }
    // Shatter: one burst per stack
    if (a.fired < a.stacks && a.t >= a.nextT) {
      a.fired++;
      a.nextT += 0.13;
      const last = a.fired === a.stacks;
      audio.playImpactBoom(0.9 + a.fired * 0.2);
      audio.playParryClang(true);
      if (window.fx) {
        window.fx.triggerHitstop(30 + a.fired * 20);
        window.fx.triggerShake(8 + a.fired * 5, 0.2);
        const bx = boss ? boss.x : this.x, by = boss ? boss.y : this.y;
        window.fx.addShockwave(bx, by, 70 + a.fired * 35, '#ef4444', 4 + a.fired, 0.35);
        window.fx.addImpactStarburst(bx, by - 40, 50 + a.fired * 18, '#fecaca', 8, Math.random() * 3, 0.25);
        window.fx.addLightningBolt(bx + (Math.random() - 0.5) * 50, by - 140, bx, by - 30, '#ef4444', 3, 0.22);
        if (last && this.isLocal) window.fx.triggerImpactFrame('#ef4444', 0.12);
      }
      if (boss && boss.hp > 0) {
        this.dealHitToBoss(boss, 2.6 + a.fired * 0.5, `Shatter ${a.fired}/${a.stacks} [Z]`, false, 24, false, { isStrongMove: true, impulseStrength: 1.1, hitX: boss.x, hitY: boss.y });
      }
      if (last && boss) {
        boss.brokenStacks = 0;
        boss.brokenTimer = 0;
        boss.brokenLockout = 2.0;
        if (window.fx) window.fx.addFloatingText(boss.x, boss.y - 110, '💥 SHATTERED!', '#fb7185', 17);
      }
    }
    if (a.t >= a.dur) this.endAct();
  }

  // =========================================================================
  // KAROK CLASH — player side (the boss-side controller sets this.karok)
  // =========================================================================
  updateKarokPlayer(dt, boss) {
    const k = this.karok;
    if (!k) { if (this.hammer.mode === 'anchor') this.hammer.mode = 'held'; return; }   // a finisher cut short never strands the hammer
    if (!k.active) { this.karok = null; if (this.state === 'h_clash') { this.state = 'idle'; this.stateTimer = 0; } return; }
    this.state = 'h_clash';
    this.stateDuration = 5;
    this.stateTimer = 5;
    this.act = null;
    this.hIframes = 0.2;
    this.speed = 0; this.vx = 0; this.vy = 0;
    this.attackStepVx = 0; this.attackStepVy = 0;
    this.targetX = this.x; this.targetY = this.y;
    if (boss) this.facingAngle = Math.atan2((boss.y - this.y) / PERSPECTIVE_TILT, boss.x - this.x);
    this.snapFeetToBody();
  }

  // Left-click during the struggle phase pushes the meter. Returns true when consumed.
  // The tug-of-war is mashed with [G] now (fromKey); a left click during it is swallowed and does nothing.
  onClashClick(fromKey = false) {
    const k = this.karok;
    if (!k || !k.active) return false;
    if (fromKey && k.phase === 'struggle' && window.game && window.game.boss && typeof window.game.boss.karokClickPush === 'function') {
      window.game.boss.karokClickPush(this);
    }
    return true;
  }

  // =========================================================================
  // HUD — Momentum pips, Broken stacks, hammer-state hints (called from Game25D.updateRealtimeHUD)
  // =========================================================================
  updateHud(boss) {
    const cache = this._hudCache || (this._hudCache = {});
    const setStyle = (id, prop, val) => {
      const key = id + prop;
      if (cache[key] === val) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.style[prop] = val;
      cache[key] = val;
    };
    const setText = (id, val) => {
      const key = id + 'T';
      if (cache[key] === val) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      cache[key] = val;
    };
    const setClass = (id, cls, on) => {
      const key = id + cls;
      if (cache[key] === on) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle(cls, on);
      cache[key] = on;
    };

    for (let i = 0; i < 3; i++) {
      const fill = Math.max(0, Math.min(1, (this.momentum - i * 100) / 100));
      setStyle(`mom-fill-${i}`, 'width', `${(fill * 100).toFixed(0)}%`);
      setClass(`mom-fill-${i}`, 'full', fill >= 1);
    }
    const stacks = brokenStacksOf(boss);
    const pips = Math.floor(this.momentum / 100);
    let status;
    if (this.overloadTimer > 0) status = `🔥 OVERLOAD  ${this.overloadTimer.toFixed(1)}s`;
    else if (pips >= 3) status = stacks > 0 ? 'FULL — [X] Overload  ·  [Z] Shatter' : 'FULL — [X] Overload';
    else if (pips >= 1) status = stacks > 0 ? `[Z] Shatter ready (${stacks} stack${stacks > 1 ? 's' : ''})` : 'Shatter needs Broken stacks';
    else status = 'Counters and big smashes build Momentum';
    setText('mom-status', status);
    setClass('slot-z', 'primed-glow', (pips >= 1 && stacks > 0 && this.cds.z <= 0.05) || pips >= 3 || this.overloadTimer > 0);
    setClass('mom-hint', 'flash', this.hudFlashT > 0);

    for (let i = 0; i < 3; i++) setClass(`brk-${i}`, 'on', i < stacks);
    setText('brk-time', stacks > 0 ? `${Math.max(0, boss.brokenTimer || 0).toFixed(1)}s` : '—');

    // Hammer-state hints on the slots that care
    const h = this.hammer;
    const out = h.mode !== 'held';
    setClass('slot-w', 'primed-glow', out && h.phase !== 'return');
    const wName = document.querySelector('#slot-w .skill-name');
    if (wName) {
      const txt = h.mode === 'grounded' ? 'Recall!' : (out ? (h.phase === 'return' ? 'Return' : 'Recall') : 'Yeet');
      if (cache.wName !== txt) { wName.textContent = txt; cache.wName = txt; }
    }
    for (const k of ['q', 'r', 'd', 'f', 't']) setClass(`slot-${k}`, 'no-hammer', out);
    const act = this.act;
    setClass('slot-e', 'primed-glow', !!(act && act.kind === 'e' && act.phase === 'hover' && this.hammerHeld));
  }

  // =========================================================================
  // POSE HOOK — plugged into BreakerPlayer25D.draw()
  // =========================================================================
  applyPoseHook(P) {
    const a = this.act;
    const k = this.karok;
    const tw = (amp) => Math.sin(performance.now() * 0.05) * amp;
    const grip = (rf, rs, ru, tf, ts, tu) => {
      P.rHandLocal = { fwd: rf, side: rs, up: ru };
      P.lHandLocal = { fwd: rf - 3, side: rs - 9, up: ru - 2 };
      P.swordTipLocal = { fwd: tf, side: ts, up: tu };
    };
    const sweep = (ang, up, reach) => {
      P.rHandLocal = { fwd: Math.cos(ang) * 24, side: Math.sin(ang) * 24, up };
      P.lHandLocal = { fwd: Math.cos(ang) * 19, side: Math.sin(ang) * 19 - 4, up: up - 2 };
      P.swordTipLocal = { fwd: Math.cos(ang) * reach, side: Math.sin(ang) * reach, up: up - 2 };
    };

    if (k && k.active) { this.poseKarok(P, k, grip); return; }
    if (!a) { this.poseNoAct(P, grip); return; }

    switch (a.kind) {
      case 'q': {
        const p = hClamp01(a.stepT / a.stepDur);
        if (a.step === 1 || a.step === 2) {
          const dir = a.step === 1 ? 1 : -1;
          const swingP = hEaseOut(hClamp01((p - 0.25) / 0.45));
          const ang = hLerp(dir * 2.3, -dir * 0.9, p < 0.25 ? 0 : swingP);
          sweep(ang, 44, 96);
          P.torsoYaw = dir * (1 - swingP * 1.6) * 0.8;
          P.crouchZ = -4 * Math.sin(p * Math.PI);
          P.torsoLeanFwd = 6 * swingP;
        } else {
          const windP = a.phase === 'wind' ? hClamp01(a.stepT / 0.24) : 1;
          const swingP = a.phase === 'swing' ? hEaseIn(hClamp01((a.stepT - 0.24) / 0.2)) : 0;
          grip(hLerp(10, 8, windP), 8, hLerp(52, 86, windP) - swingP * 46,
            hLerp(20, -26, windP) + swingP * 108, 4, hLerp(60, 156, windP) - swingP * 150);
          P.torsoLeanFwd = hLerp(0, -7, windP) + swingP * 20;
          P.crouchZ = -3 * windP - 8 * swingP;
          if (a.hold > 0 && a.phase === 'wind') P.torsoYaw = tw(0.05);
        }
        break;
      }
      case 'w': {
        // hoist the hammer overhead, then drive it into the floor in front of you
        const up = hClamp01(a.t / 0.34), dn = hClamp01((a.t - 0.34) / 0.1);
        const hi = up * (1 - dn);
        P.rHandLocal = { fwd: 8 + 14 * dn, side: 14, up: 50 + 62 * hi };
        P.lHandLocal = { fwd: 10 + 12 * dn, side: -10, up: 46 + 58 * hi };
        P.swordTipLocal = { fwd: 24 + 60 * dn, side: 4, up: 20 + 120 * hi };
        P.torsoLeanFwd = -10 * hi + 14 * dn;
        P.crouchZ = -4 * up * (1 - dn) - 8 * dn;
        break;
      }
      case 'e': {
        const airborne = a.phase !== 'land';
        if (this.hammerHeld) {
          grip(10, 8, 88, 8, 6, 160);
        } else {
          P.rHandLocal = { fwd: 4, side: 30, up: 74 };
          P.lHandLocal = { fwd: 4, side: -30, up: 74 };
          P.swordTipLocal = { fwd: 0, side: 40, up: 90 };
        }
        if (a.phase === 'leap') {
          const s = hClamp01(a.phaseT / 0.42);
          if (this.hammerHeld) grip(10 + 24 * s, 8, 88 - 40 * s, 10 + 80 * s, 6, 160 - 150 * s);
          P.torsoLeanFwd = 14 * s;
        }
        if (a.phase === 'land') { grip(34, 6, 34, 86, 0, 4); P.crouchZ = -10 * (1 - a.phaseT / 0.34); P.torsoLeanFwd = 14; }
        if (airborne && a.phase !== 'leap') P.torsoLeanFwd = -2;
        break;
      }
      case 'a': {
        P.torsoLeanFwd = 16;
        P.crouchZ = -7;
        P.torsoYaw = 0.45;
        P.lHandLocal = { fwd: 30, side: -8, up: 46 };
        P.rHandLocal = { fwd: -4, side: 20, up: 54 };
        P.swordTipLocal = { fwd: -52, side: 40, up: 82 };
        break;
      }
      case 's': {
        if (a.t < 0.46) {
          const w = hEaseOut(a.t / 0.4);
          grip(10, 8, 52 + 40 * w, 4, 4, 86 + 70 * w);
          P.torsoLeanFwd = -8 * w;
          P.crouchZ = -2;
        } else {
          const w = hEaseOut((a.t - 0.46) / 0.14);
          const roar = hClamp01((a.t - 0.5) / 0.5);
          grip(32, 6, 36 - 4 * w, 84, 2, 4);
          P.torsoLeanFwd = 14 - 18 * roar;
          P.headPitchZ = 5 * roar;
          P.crouchZ = -8 * (1 - roar * 0.5);
        }
        break;
      }
      case 'd': {
        const w = hClamp01(a.t / 0.25), s = hEaseOut(hClamp01((a.t - 0.25) / 0.2));
        grip(hLerp(2, 30, s), 10, hLerp(30, 70, s), hLerp(-30, 40, s), 6, hLerp(8, 150, s));
        P.crouchZ = -9 * w * (1 - s);
        P.torsoLeanFwd = hLerp(-4, 8, s);
        P.torsoYaw = 0.5 * (1 - s);
        break;
      }
      case 'f': {
        const f = a.animT !== undefined ? a.animT : 99;
        const tier = Math.min(4, Math.ceil(Math.max(1, a.k) / 3));
        const high = 126 + tier * 14;
        const stuckLen = 0.12;
        const swinging = f < (a.up + a.down + stuckLen);
        if (!swinging) {
          // slab dragging low behind the body on the side of the NEXT swing, the whole body heaving for breath
          const rs = -a.side * (6 + tier * 3);
          const bk = hEaseOut(hClamp01((f - (a.up + a.down + stuckLen)) / 0.28));   // hauled back from the floor dent
          grip(hLerp(38, -14, bk), hLerp(8 - rs, 12 + rs * 0.4, bk), hLerp(34, 30, bk),
            hLerp(88, -120, bk), hLerp(-rs * 0.5, rs * 3.2, bk), hLerp(4, 8, bk));
          P.torsoLeanFwd = hLerp(18, 12, bk); P.torsoYaw = -a.side * 0.3 * bk;
          P.crouchZ = -8 + (a.ending ? tw(0.9) - 3 : Math.sin(performance.now() * 0.012) * 1.2);
        } else if (f < a.up + a.down) {
          // hoist: slow, straining, arching back; then the drop accelerates hard
          const u = hClamp01(f / a.up);
          const up = u * u * (3 - 2 * u);
          const down = Math.pow(hClamp01((f - a.up) / a.down), 3.0);
          const side = a.side * (6 + tier * 3);
          const strain = (f < a.up) ? tw(0.7 + tier * 0.4) * up : 0;
          // starts from the dragged-behind rest pose on this swing's side, hauls up and over, slams down in front
          grip(hLerp(hLerp(-14, -4, up), 38, down), hLerp(12 + side * 0.4, 8 + side, up), hLerp(30, 96, up) - down * 62 + strain * 0.3,
            hLerp(hLerp(-120, -10, up), 88, down), hLerp(side * 3.2, side * 0.5, up), hLerp(8, high, up) - down * (high - 6) + strain);
          P.torsoLeanFwd = hLerp(12, -13, up) * (1 - down) + 24 * down;
          P.crouchZ = -4 - 4 * up * (1 - down) - 9 * down - tier;
          P.torsoYaw = a.side * hLerp(0.3, 0.38, up) * (1 - down);
          P.headPitchZ = -3 * down;
        } else {
          // the slab is buried in the floor; wrenching it free before the next hoist
          const side = a.side * (6 + tier * 3);
          grip(38, 8 + side, 34, 88, side * 0.5, 4);
          P.torsoLeanFwd = 24 - 6 * hClamp01((f - a.up - a.down) / stuckLen);
          P.crouchZ = -13 - tier + tw(0.9);
        }
        break;
      }      case 'r': {
        const st = a.stage || 0;
        if (a.phase === 'charge') {
          // Starts with the slab dragging along the ground far behind the body, hands low and arms straining;
          // as the charge builds it is hauled up and around behind the head, the body arching under the load.
          const cf = hClamp01(a.charge / HammerPlayer25D.R_STAGE_TIMES[2]);
          const e = cf * cf * (3 - 2 * cf);
          const sh = tw(0.4 + cf * 3.4 + (a.over || 0) * 3.2) * Math.min(1, cf * 1.6);
          // The slab stays dragging behind the whole time; charging only tightens the grip: hands cinch in, arms and
          // body coil harder and tremble more, the slab lifts barely off the floor.
          grip(hLerp(-24, -17, e) + sh * 0.3, hLerp(18, 11, e), hLerp(30, 37, e),
            hLerp(-150, -140, e), hLerp(40, 33, e) + sh, hLerp(6, 14 + st * 3, e) + (a.over || 0) * 4);
          P.torsoLeanFwd = hLerp(13, 19 + st * 1.5, e) + sh * 0.2;       // leaning ever harder into the pull
          P.crouchZ = hLerp(-10, -9 - st * 3.6, Math.min(1, e * 1.4)) + sh * 0.25;
          P.torsoYaw = hLerp(0.55, 0.75, e) + sh * 0.03;
          P.headPitchZ = hLerp(-5, -4, e);
        } else {
          const p = hClamp01(a.smashT / 1.3);
          // small prep: the slab is hauled up a little behind, body winds back, then it comes over in a brutal slam
          const prep = hEaseOut(hClamp01(p / 0.32));
          const slam = Math.pow(hClamp01((p - 0.40) / 0.10), 3.0);        // brutal fast drop
          const peakShake = (p > 0.22 && p < 0.42) ? tw(1.2 + st * 0.6) : 0;
          const wrench = hClamp01((p - 0.60) / 0.24);                       // heaving the slab out of the floor
          const lift = wrench * (1 - hClamp01((p - 0.84) / 0.16));
          let rf = hLerp(hLerp(-17, -8, prep), 38, slam), ru = hLerp(hLerp(37, 66, prep), 34, slam);
          let tf = hLerp(hLerp(-140, -92, prep), 88, slam), tu = hLerp(hLerp(14 + st * 3, 96 + st * 6, prep), 4, slam);
          ru += lift * 14; rf -= lift * 6; tu += lift * 34;
          grip(rf + peakShake * 0.2, hLerp(11, 12, prep), ru, tf, hLerp(33, 24, prep), tu + peakShake * 0.5);
          P.torsoLeanFwd = hLerp(hLerp(19 + st * 1.5, -9, prep), 22, slam) - lift * 16;
          P.crouchZ = hLerp(-9 - st * 3.6, -5, prep) * (1 - slam) - 12 * slam - lift * 4 + peakShake * 0.3 + (p >= 0.5 && p < 0.84 ? tw(1.0) : 0);
          P.torsoYaw = hLerp(0.75, 0, Math.max(prep * 0.6, slam));
        }
        break;
      }
      case 'z': {
        if (a.mode === 'overload') {
          const w = hEaseOut(hClamp01(a.t / 0.4));
          P.rHandLocal = { fwd: 6, side: 30, up: 60 + 14 * w };
          P.lHandLocal = { fwd: 6, side: -30, up: 60 + 14 * w };
          P.swordTipLocal = { fwd: -8, side: 70, up: 100 + 40 * w };
          P.torsoLeanFwd = -8 * w;
          P.headPitchZ = 5 * w;
          P.crouchZ = -3;
        } else {
          const w = hEaseOut(hClamp01(a.t / 0.3));
          grip(14, 8, 56 + 36 * w, 36, 4, 90 + 70 * w);
          P.torsoLeanFwd = -3 + 8 * w;
          P.crouchZ = -4;
        }
        break;
      }
      case 't': {
        if (a.phase === 'charge') {
          // hammer levelled straight ahead like a battering ram, head leading
          const sh = Math.sin(performance.now() * 0.08) * 1.2;
          grip(26, 6, 42 + sh, 120, 4, 42 + sh);
          P.torsoLeanFwd = 24; P.crouchZ = -9; P.torsoYaw = 0.1; P.headPitchZ = -4;
        } else if (a.phase === 'hop') {
          const s = hEaseOut(hClamp01(a.phaseT / 0.32));
          grip(hLerp(26, 18, s), 6, hLerp(42, 70, s), hLerp(120, 40, s), 4, hLerp(42, 150, s));
          P.torsoLeanFwd = hLerp(24, 6, s); P.crouchZ = hLerp(-9, 0, s);
        } else if (a.phase === 'rebound') {
          const s = hEaseOut(hClamp01(a.phaseT / 0.5));
          grip(hLerp(18, 4, s), 8, hLerp(70, 96, s), hLerp(40, -30, s), 6, hLerp(150, 170, s));
          P.torsoLeanFwd = hLerp(6, -14, s); P.headPitchZ = 3 * s;
        } else if (a.phase === 'hang') {
          grip(4, 8, 98, -20, 6, 175);
          P.torsoLeanFwd = -12; P.headPitchZ = 4;
        } else if (a.phase === 'slam') {
          const sl = hEaseIn(hClamp01(a.phaseT / 0.24));
          grip(hLerp(4, 38, sl), 8, hLerp(98, 36, sl), hLerp(-20, 92, sl), 4, hLerp(175, 4, sl));
          P.torsoLeanFwd = hLerp(-12, 24, sl);
        } else {
          grip(38, 6, 36, 92, 4, 4);
          P.torsoLeanFwd = 18; P.crouchZ = -10;
        }
        break;
      }
      case 'b': {
        // Basic combo — all hammer-specific: 1 wide side-sweep, 2 rising diagonal heave, 3 full-body spinning smash
        const p = hClamp01(a.t / a.dur);
        if (a.step === 1) {
          const sw = hEaseOut(hClamp01((p - 0.22) / 0.4));
          sweep(hLerp(2.2, -1.0, p < 0.22 ? 0 : sw), 40, 100);
          P.torsoYaw = hLerp(0.9, -0.7, sw); P.torsoLeanFwd = 4 + 6 * sw; P.crouchZ = -4 * Math.sin(p * Math.PI);
        } else if (a.step === 2) {
          const sw = hEaseOut(hClamp01((p - 0.2) / 0.4));
          grip(hLerp(8, 36, sw), hLerp(-14, 12, sw), hLerp(14, 92, sw), hLerp(40, 70, sw), hLerp(-52, 40, sw), hLerp(6, 130, sw));
          P.torsoLeanFwd = hLerp(10, -4, sw); P.crouchZ = hLerp(-9, 2, sw); P.torsoYaw = hLerp(-0.8, 0.5, sw);
        } else {
          const sp = hEaseOut(hClamp01((p - 0.18) / 0.55));
          sweep(Math.PI * 0.5 - 0.2, 46, 112);
          P.torsoLeanFwd = 8; P.crouchZ = -5 * Math.sin(p * Math.PI);
          void sp;
        }
        break;
      }      default: break;
    }
  }

  // Poses for everything outside a hammer act, so the knight's shoulder-rest idle, sword combo, dodge and flinch
  // animations are never shown: the Gravebreaker lugs the slab around, drags it when walking, braces it when hit.
  poseNoAct(P, grip) {
    const st = this.state;
    const sd = P.strideDiff || 0;
    const held = this.hammerHeld;
    const tw = Math.sin(performance.now() * 0.05);
    if (st === 'idle' || st === 'walk') {
      if (held) {
        // Carried on the shoulder: the shaft rests over the right shoulder and the slab sits up behind it, the way
        // anyone would haul a hammer this size. A slight sag and bob on each step sells the weight.
        const bob = st === 'walk' ? Math.abs(sd) : 0;
        P.rHandLocal = { fwd: 6 + sd * 1.2, side: 15, up: 46 + P.breatheZ * 0.5 - bob * 1.5 };
        P.lHandLocal = { fwd: 3 - sd * 2, side: 5, up: 49 - bob };
        P.swordTipLocal = { fwd: -18 - sd * 1.5, side: 42, up: 98 - bob * 3 };
        P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 5 + bob;
        P.crouchZ = (P.crouchZ || 0) - 2 - bob * 1.2;
        P.headPitchZ = (P.headPitchZ || 0) - 1;
      } else {
        P.rHandLocal = { fwd: 16 + sd * 2, side: 12, up: 44 };   // empty-handed: fists up
        P.lHandLocal = { fwd: 16 - sd * 2, side: -12, up: 44 };
        P.torsoLeanFwd = (P.torsoLeanFwd || 0) + 4;
        P.crouchZ = (P.crouchZ || 0) - 2.5;
      }
      return;
    }
    if (st === 'hit_stagger') {
      const f = Math.sin(hClamp01(P.p) * Math.PI);
      P.rHandLocal = { fwd: 8, side: 20, up: 28 };
      P.lHandLocal = { fwd: 6, side: -6, up: 30 };
      P.swordTipLocal = { fwd: 44, side: 52, up: 2 };
      P.torsoLeanFwd = -9 * f; P.crouchZ = -4 * f; P.headPitchZ = -3 * f;
    } else if (st === 'hit_knockback') {
      const r = 1 - hClamp01(P.p) * 0.6;
      P.rHandLocal = { fwd: 6, side: 26, up: 40 };
      P.lHandLocal = { fwd: 4, side: -22, up: 38 };
      P.swordTipLocal = { fwd: 20, side: 70, up: 20 };
      P.torsoLeanFwd = -13 * r; P.crouchZ = -8 * r;
    } else if (st === 'hit_knockdown') {
      if (P.p < 0.46) {
        P.rHandLocal = { fwd: -10, side: 30, up: 52 };
        P.lHandLocal = { fwd: -6, side: -26, up: 50 };
        P.swordTipLocal = { fwd: -40, side: 74, up: 70 };
        P.torsoLeanFwd = -22; P.crouchZ = -6;
      } else {
        P.rHandLocal = { fwd: 4, side: 34, up: 10 };
        P.lHandLocal = { fwd: 2, side: -30, up: 12 };
        P.swordTipLocal = { fwd: 30, side: 80, up: 2 };
        P.torsoLeanFwd = -30; P.crouchZ = -22;
      }
    } else if (st === 'wakeup_roll') {
      P.rHandLocal = { fwd: 10, side: 10, up: 20 };
      P.lHandLocal = { fwd: 10, side: -6, up: 20 };
      P.swordTipLocal = { fwd: -40, side: 30, up: 14 };
      P.torsoLeanFwd = 32; P.crouchZ = -20;
    } else if (st === 'space_dash') {
      // low shoulder-first charge with the slab trailing behind
      P.rHandLocal = { fwd: 4, side: 16, up: 34 };
      P.lHandLocal = { fwd: 22, side: -10, up: 40 };
      P.swordTipLocal = { fwd: -76, side: 22, up: 16 };
      P.torsoLeanFwd = 26; P.crouchZ = -12; P.torsoYaw = 0.4;
    } else if (st === 'clash_lock' || this.clashQteActive) {
      // Final Clash: slab braced overhead against the colossal blade, shaking
      grip(30, 6, 62, 18, 0, 134);
      P.rHandLocal.up += tw * 1.2;
      P.torsoLeanFwd = 10; P.crouchZ = -8 + tw * 0.6;
    }
  }

  // Keeps the slab from being painted over the body or face when it is actually behind them (called from the rig's draw sort).
  // The slab is a flat sprite, so we judge where its centre is in depth and draw it before the torso / helm when it is behind.
  adjustWeaponDepth(q, J) {
    if (!this.hammerHeld) return;
    const h = J.rHand, t = J.swordTip, ch = J.chest, hd = J.head;
    const dx = t.sx - h.sx, dy = t.sy - h.sy, L = Math.hypot(dx, dy) || 1;
    const k = Math.max(1, Math.min(3, 82 / L));
    const slabDepth = h.depth + (t.depth - h.depth) * k;
    const cx = h.sx + dx / L * 82, cy = h.sy + dy / L * 82;
    if (slabDepth < ch.depth - 3) q[8].depth = Math.min(q[8].depth, ch.depth - 2);            // behind the back: body covers it
    else if ((slabDepth < hd.depth + 8 || !this.act) && Math.hypot(cx - hd.sx, cy - hd.sy) < 56) q[8].depth = Math.min(q[8].depth, hd.depth + 3);   // never over the face
  }

  // Own 3-hit basic combo (replaces Breaker's 5-hit sword combo).
  triggerBasicAttack(aimX, aimY, fromNetwork = false) {
    if (this.hp <= 0 || this.karok) return false;
    if (!this.hammerHeld && !this.isRemote) return false;
    const a0 = this.act;
    const chaining = !!(a0 && a0.kind === 'b' && a0.t >= a0.dur * 0.62 && a0.step < 3);
    if (fromNetwork && !chaining && !this.canAct()) { this.act = null; this.state = 'idle'; }
    if (!this.canAct() && !chaining) return false;
    const step = chaining ? a0.step + 1 : ((this.bResetT > 0 && this.bStep < 3) ? this.bStep + 1 : 1);
    this.bStep = step;
    this.bResetT = 1.1;
    const mw = { x: aimX, y: aimY };
    this.aimAt(window.game ? window.game.getActiveBossTarget() : null, mw.x, mw.y, 200);
    const dur = step === 3 ? 0.80 : 0.52;
    if (chaining) { this.act = null; this.state = 'idle'; }
    this.beginAct('b', dur, { step, hit: false });
    const dir = { x: Math.cos(this.facingAngle), y: Math.sin(this.facingAngle) * PERSPECTIVE_TILT };
    const burst = step === 3 ? 240 : 150;
    this.attackStepVx = dir.x * burst; this.attackStepVy = dir.y * burst;
    audio.playSwordSlash(step === 3, step === 3 ? 1.2 : 0.9);
    this.lungeFootForward(step % 2 ? this.leftFoot : this.rightFoot, 16, step % 2 ? -this.hipWidth - 2 : this.hipWidth + 2, 0.14);
    return true;
  }

  act_b(dt, boss, a) {
    const p = hClamp01(a.t / a.dur);
    if (a.step === 3) {
      const e = hEaseOut(hClamp01((p - 0.16) / 0.5));
      this.bodySpinAngle = e * Math.PI * 2;          // full spin; settles back at 360 which is facing forward
      this.jumpZ = Math.sin(hClamp01(p / 0.7) * Math.PI) * 14;
    } else {
      this.bodySpinAngle = (a.step === 1 ? -1 : 1) * 0.35 * Math.sin(p * Math.PI);
    }
    const hitAt = a.step === 3 ? 0.46 : 0.4;
    if (!a.hit && p >= hitAt) {
      a.hit = true;
      const cx = this.x + Math.cos(this.facingAngle) * 58, cy = this.y + Math.sin(this.facingAngle) * 58 * PERSPECTIVE_TILT;
      if (a.step === 3) {
        audio.playImpactBoom(1.1);
        if (window.fx) {
          window.fx.triggerHitstop(85);
          window.fx.triggerShake(14, 0.3);
          window.fx.addShockwave(this.x, this.y, 150, '#fb923c', 6, 0.42);
          window.fx.addFissureLine(cx, cy, cx + Math.cos(this.facingAngle) * 90, cy + Math.sin(this.facingAngle) * 90 * PERSPECTIVE_TILT, '#fb923c', 4);
          window.fx.spawnMassiveEarthChunks(cx, cy, 4, '#fb923c');
        }
      } else if (window.fx) {
        window.fx.addSlashRibbon(this.x, this.y, 108, this.facingAngle + (a.step === 1 ? 1.4 : -0.4), this.facingAngle + (a.step === 1 ? -1.4 : 1.4), '#fb923c', 20, 0.2);
        window.fx.triggerHitstop(26);
        window.fx.triggerShake(5, 0.15);
        window.fx.addShockwave(cx, cy, 70, '#fb923c', 3.5, 0.25);
        window.fx.addStepDust(cx, cy, 4);
        audio.playImpactBoom(0.7);
      }
      this.strike(boss, cx, cy, a.step === 3 ? 126 : 104, [0, 0.85, 0.95, 1.9][a.step], `Hammer Combo ${a.step}`, [0, 9, 10, 24][a.step], 0.10,
        { isStrongMove: a.step === 3, impulseStrength: a.step === 3 ? 1.3 : 0.7 });
    }
    if (p >= 1) {
      this.bodySpinAngle = 0;
      this.jumpZ = 0;
      this.endAct();
    }
  }
  poseKarok(P, k, grip) {
    const tr = Math.sin(performance.now() * 0.06) * (k.phase === 'struggle' ? 1.6 : 0);
    const m = k.meter === undefined ? 0.5 : k.meter;
    if (k.style === 'beam') { this.poseKarokBeam(P, k, m, tr); return; }
    if (k.style === 'smash') { this.poseKarokSmash(P, k, m, tr); return; }
    if (k.phase === 'intro') {
      const t = k.t;
      if (t < 0.45) {
        // sidearm-fling the hammer away
        const wind = hClamp01(t / 0.18), rel = hClamp01((t - 0.18) / 0.15);
        P.rHandLocal = { fwd: -6 + 40 * rel, side: 30 - 30 * rel, up: 48 };
        P.lHandLocal = { fwd: 22, side: -22, up: 46 };
        P.swordTipLocal = { fwd: -40 + 120 * rel, side: 70 - 100 * rel, up: 50 };
        P.torsoYaw = 0.9 * wind - 1.7 * rel;
        P.crouchZ = -5;
      } else {
        const g = hEaseOut((t - 0.45) / 0.4);
        P.rHandLocal = { fwd: hLerp(12, 40, g), side: 8, up: hLerp(40, 58, g) };
        P.lHandLocal = { fwd: hLerp(8, 38, g), side: -8, up: hLerp(36, 54, g) };
        P.swordTipLocal = { fwd: 40, side: 0, up: 56 };
        P.torsoLeanFwd = 8 * g; P.crouchZ = -8 * g;
      }
    } else if (k.phase === 'struggle') {
      P.rHandLocal = { fwd: 38 - (1 - m) * 6, side: 8, up: 58 };
      P.lHandLocal = { fwd: 36 - (1 - m) * 6, side: -8, up: 54 };
      P.swordTipLocal = { fwd: 42, side: 0, up: 58 };
      P.torsoLeanFwd = hLerp(-12, 20, m) + tr * 0.4;
      P.crouchZ = hLerp(-16, -7, m) + tr * 0.3;
      P.headPitchZ = hLerp(-5, 2, m);
      P.torsoYaw = tr * 0.04;
    } else if (k.phase === 'finish') {
      if (k.win) {
        // Cutscene beats (timings shared with karok_clash.js): RIP the blade, RUN to the hammer, GRAB it one-handed,
        // JUMP BACK, TOSS the blade up with the free hand, SMACK it into the boss.
        const W = window.KAROK_WIN || { RIP: 0.5, RUN_END: 1.1, GRAB: 1.1, HOIST_END: 1.3, JUMP_START: 1.3, JUMP_END: 1.9, TOSS: 1.95, SMACK: 2.6 };
        const t = k.t - k.finishAt;
        const blade = { fwd: 10, side: -18, up: 72 };            // the ripped-away sword clutched in the left hand
        if (t < W.RIP) {
          const u = hEaseOut(hClamp01(t / 0.2));
          const sh = Math.sin(t * 60) * 1.4 * (1 - u);
          P.rHandLocal = { fwd: hLerp(40, -4, u), side: hLerp(8, 20, u), up: hLerp(58, 74, u) + sh };
          P.lHandLocal = { fwd: hLerp(38, 0, u), side: hLerp(-8, -18, u), up: hLerp(54, 70, u) };
          P.swordTipLocal = { fwd: hLerp(42, -30, u), side: 0, up: hLerp(58, 66, u) };
          P.torsoLeanFwd = hLerp(0, -14, u); P.crouchZ = -6; P.torsoYaw = 0.5 * u;
        } else if (t < W.GRAB) {
          // charging at the hammer stuck in the dirt, bare right hand reaching down for it
          const s = hClamp01((t - W.RIP) / (W.GRAB - W.RIP)), bob = Math.abs(Math.sin((t - W.RIP) * 14));
          P.lHandLocal = blade;
          P.rHandLocal = { fwd: hLerp(-4, 26, hEaseOut(s)), side: hLerp(20, 24, s), up: hLerp(74, 16, hEaseOut(s)) };
          P.swordTipLocal = { fwd: 30, side: 24, up: 6 };
          P.torsoLeanFwd = hLerp(-14, 20, hEaseOut(s)); P.crouchZ = -9 - 3 * bob; P.torsoYaw = hLerp(0.5, 0, s);
        } else if (t < W.JUMP_START) {
          // one hand, one heave: the slab comes out of the ground and over the shoulder
          const h = hEaseOut(hClamp01((t - W.GRAB) / (W.JUMP_START - W.GRAB)));
          P.lHandLocal = blade;
          P.rHandLocal = { fwd: hLerp(26, -6, h), side: 24, up: hLerp(16, 62, h) };
          P.swordTipLocal = { fwd: hLerp(52, -86, h), side: hLerp(24, 42, h), up: hLerp(8, 114, h) };
          P.torsoLeanFwd = hLerp(20, -10, h); P.crouchZ = hLerp(-12, -6, h); P.torsoYaw = hLerp(0, 0.6, h);
        } else if (t < W.JUMP_END) {
          // backflip-style hop away from the boss, hammer cocked behind
          const s = hClamp01((t - W.JUMP_START) / (W.JUMP_END - W.JUMP_START));
          P.lHandLocal = { fwd: 12, side: -16, up: 62 + 10 * Math.sin(s * Math.PI) };
          P.rHandLocal = { fwd: -8, side: 26, up: 62 };
          P.swordTipLocal = { fwd: -96, side: 44, up: 118 };
          P.torsoLeanFwd = hLerp(-8, -16, Math.sin(s * Math.PI)); P.crouchZ = hLerp(-4, 3, Math.sin(s * Math.PI)); P.torsoYaw = 0.6;
        } else if (t < W.SMACK) {
          // landing; flip the blade up with the left hand, wind the hammer all the way back
          const s = hClamp01((t - W.TOSS) / (W.SMACK - W.TOSS)), land = 1 - hClamp01((t - W.JUMP_END) / 0.12);
          P.lHandLocal = { fwd: 14 + 10 * s, side: -10, up: hLerp(70, 130, hEaseOut(hClamp01(s * 2.2))) };
          P.rHandLocal = { fwd: -8, side: 26, up: 62 };
          P.swordTipLocal = { fwd: -96, side: 44, up: 118 };
          P.torsoLeanFwd = hLerp(-14, -18, s); P.crouchZ = -6 - 8 * land; P.torsoYaw = hLerp(0.6, 0.95, hEaseOut(s));
        } else {
          const sw = hEaseIn(hClamp01((t - W.SMACK) / 0.07)), rec = hEaseOut(hClamp01((t - W.SMACK - 0.12) / 0.55));
          P.lHandLocal = { fwd: 22, side: hLerp(-10, -24, rec), up: hLerp(130, 50, rec) };
          P.rHandLocal = { fwd: hLerp(-8, 34, sw), side: hLerp(26, 6, sw), up: hLerp(62, 92, sw) - 30 * rec };
          P.swordTipLocal = { fwd: hLerp(-96, 112, sw) - 40 * rec, side: hLerp(44, 0, sw), up: hLerp(118, 104, sw) - 70 * rec };
          P.torsoLeanFwd = hLerp(-18, 18, sw) - 8 * rec; P.crouchZ = hLerp(-6, -10, sw); P.torsoYaw = hLerp(0.95, -0.7, sw) * (1 - rec);
        }
      } else {
        P.rHandLocal = { fwd: 10, side: 22, up: 30 };
        P.lHandLocal = { fwd: 10, side: -22, up: 30 };
        P.swordTipLocal = { fwd: 10, side: 40, up: 20 };
        P.torsoLeanFwd = -14; P.crouchZ = -16;
      }
    }
  }

  // Against Cervanth's antlers: the slab is braced flat against the locked horns (same shield pose as a beam); the win is leaping onto his skull and
  // smashing the head into the ground (window.KAROK_SMASH).
  poseKarokSmash(P, k, m, tr) {
    if (k.phase !== 'finish' || !k.win) { this.poseKarokBeam(P, k, m, tr); return; }
    const A = window.KAROK_SMASH || { WRENCH: 0.6, LEAP: 1.5, SMASH: 1.5, END: 2.8 };
    const t = k.t - k.finishAt;
    if (t < A.WRENCH) {
      // heave: both fists under the antlers, the slab on the shoulder
      const u = hEaseOut(hClamp01(t / A.WRENCH));
      P.rHandLocal = { fwd: hLerp(20, 14, u), side: 7, up: hLerp(52, 64, u) }; P.lHandLocal = { fwd: hLerp(22, 16, u), side: -6, up: hLerp(58, 70, u) };
      P.swordTipLocal = { fwd: hLerp(62, 10, u), side: 0, up: hLerp(66, 120, u) };
      P.torsoLeanFwd = hLerp(18, -6, u); P.crouchZ = -8 - 6 * u;
    } else if (t < A.LEAP) {
      // the leap: the slab hauled back over the head
      const u = hEaseOut(hClamp01((t - A.WRENCH) / (A.LEAP - A.WRENCH)));
      P.rHandLocal = { fwd: hLerp(14, -10, u), side: 10, up: hLerp(64, 96, u) }; P.lHandLocal = { fwd: hLerp(16, 8, u), side: -8, up: hLerp(70, 92, u) };
      P.swordTipLocal = { fwd: hLerp(10, -50, u), side: 6, up: hLerp(120, 170, u) };
      P.torsoLeanFwd = hLerp(-6, -14, u); P.crouchZ = 0;
    } else {
      // the smash, then a heavy follow-through
      const u = hEaseOut(hClamp01((t - A.SMASH) / 0.18));
      P.rHandLocal = { fwd: hLerp(-10, 30, u), side: 4, up: hLerp(96, 40, u) }; P.lHandLocal = { fwd: hLerp(8, 32, u), side: -4, up: hLerp(92, 44, u) };
      P.swordTipLocal = { fwd: hLerp(-50, 76, u), side: 0, up: hLerp(170, 8, u) };
      P.torsoLeanFwd = hLerp(-14, 26, u); P.crouchZ = -10 * u;
    }
  }

  // Against a beam (Ignis's Final Flash): the slab is held out flat in front like a shield and driven up the beam; the win is
  // the Grave Anchor (hurl the hammer down the beam, haul her in by its chain). Beat timings: window.KAROK_ANCHOR.
  poseKarokBeam(P, k, m, tr) {
    const shield = (lean, crouch) => {
      P.rHandLocal = { fwd: 20, side: 7, up: 52 + tr * 0.3 };
      P.lHandLocal = { fwd: 22, side: -6, up: 60 + tr * 0.3 };
      P.swordTipLocal = { fwd: 62, side: 0, up: 66 };          // the slab's face square to the beam
      P.torsoLeanFwd = lean; P.crouchZ = crouch; P.headPitchZ = -2; P.torsoYaw = tr * 0.03;
    };
    if (k.phase === 'intro') {
      // swing the hammer up across the body, then brace as the beam lands on it (it shoves you back a step)
      const t = k.t, e = hEaseOut(hClamp01(t / 0.45));
      shield(hLerp(0, 10, e) - (t > 0.62 && t < 0.85 ? 8 : 0), hLerp(-2, -12, e));
      P.torsoYaw = hLerp(0.8, 0, e);
      return;
    }
    if (k.phase === 'struggle') { shield(hLerp(-4, 22, m) + tr * 0.4, hLerp(-16, -8, m) + tr * 0.3); return; }
    if (!k.win) {
      P.rHandLocal = { fwd: 10, side: 22, up: 30 }; P.lHandLocal = { fwd: 10, side: -22, up: 30 };
      P.swordTipLocal = { fwd: 10, side: 40, up: 20 };
      P.torsoLeanFwd = -14; P.crouchZ = -16;
      return;
    }
    const A = window.KAROK_ANCHOR || { BREAK: 0.3, THROW: 0.6, HIT: 0.82, YANK: 1.15, SLAM: 1.6, CATCH: 2.1, END: 2.7 };
    const t = k.t - k.finishAt;
    const chainHands = (lean, crouch, pull) => {          // both fists on the chain
      P.rHandLocal = { fwd: hLerp(24, 2, pull), side: 4, up: hLerp(52, 40, pull) };
      P.lHandLocal = { fwd: hLerp(30, 10, pull), side: -3, up: hLerp(54, 44, pull) };
      P.swordTipLocal = { fwd: 40, side: 0, up: 50 };
      P.torsoLeanFwd = lean; P.crouchZ = crouch;
    };
    if (t < A.BREAK) {
      // shove through the last of the beam
      const u = hEaseOut(hClamp01(t / A.BREAK));
      P.rHandLocal = { fwd: hLerp(20, 32, u), side: 7, up: 54 }; P.lHandLocal = { fwd: hLerp(22, 34, u), side: -6, up: 60 };
      P.swordTipLocal = { fwd: hLerp(62, 80, u), side: 0, up: 66 };
      P.torsoLeanFwd = hLerp(22, 26, u); P.crouchZ = -8;
    } else if (t < A.THROW) {
      // wind up: the slab hauled back over the shoulder, body coiled
      const u = hEaseOut(hClamp01((t - A.BREAK) / (A.THROW - A.BREAK)));
      P.rHandLocal = { fwd: hLerp(32, -6, u), side: hLerp(7, 18, u), up: hLerp(54, 78, u) };
      P.lHandLocal = { fwd: hLerp(34, 14, u), side: hLerp(-6, -16, u), up: hLerp(60, 62, u) };
      P.swordTipLocal = { fwd: hLerp(80, -70, u), side: hLerp(0, 30, u), up: hLerp(66, 120, u) };
      P.torsoLeanFwd = hLerp(26, -10, u); P.torsoYaw = 0.8 * u; P.crouchZ = -8 - 4 * u;
    } else if (t < A.HIT) {
      // release: whole body follows through, the throwing arm out straight (the hammer has left the hand)
      const u = hEaseOut(hClamp01((t - A.THROW) / 0.14));
      P.rHandLocal = { fwd: hLerp(-6, 30, u), side: hLerp(18, 4, u), up: hLerp(78, 56, u) };
      P.lHandLocal = { fwd: 12, side: -18, up: 50 };
      P.swordTipLocal = { fwd: 60, side: 0, up: 56 };
      P.torsoLeanFwd = hLerp(-10, 22, u); P.torsoYaw = hLerp(0.8, -0.5, u); P.crouchZ = -10;
    } else if (t < A.YANK) {
      // grab the chain, plant, lean back
      const u = hEaseOut(hClamp01((t - A.HIT) / (A.YANK - A.HIT)));
      chainHands(hLerp(18, -14, u), hLerp(-10, -16, u), 0.2 * u);
    } else if (t < A.SLAM) {
      // the heave: everything thrown backwards, fists to the hip
      const u = hEaseOut(hClamp01((t - A.YANK) / 0.18));
      chainHands(hLerp(-14, -22, u), -16 + 6 * u, hLerp(0.2, 1, u));
      P.torsoYaw = -0.5 * u;
    } else if (t < A.CATCH) {
      // reeling the hammer back in, hand over hand
      const s = hClamp01((t - A.SLAM) / (A.CATCH - A.SLAM)), hh = Math.sin(s * Math.PI * 6) * 0.5 + 0.5;
      chainHands(-8, -10, 0.4 + 0.5 * hh);
    } else {
      // caught: the slab swung up to rest on the shoulder
      const u = hEaseOut(hClamp01((t - A.CATCH) / 0.3));
      P.rHandLocal = { fwd: hLerp(24, 8, u), side: 10, up: hLerp(52, 66, u) };
      P.lHandLocal = { fwd: hLerp(26, 14, u), side: -6, up: hLerp(50, 58, u) };
      P.swordTipLocal = { fwd: hLerp(60, -40, u), side: hLerp(0, 26, u), up: hLerp(56, 104, u) };
      P.torsoLeanFwd = hLerp(-6, -4, u); P.crouchZ = -4;
    }
  }

  // =========================================================================
  // DRAWING
  // =========================================================================
  draw(ctx) {
    if (this.hp <= 0) { super.draw(ctx); return; }
    this.drawGroundAura(ctx);
    const a = this.act;
    const st = (a && a.kind === 'r') ? (a.stage || 0) : 0;
    // The Gravebreaker is a bulky brute: the whole rig is drawn ~12% bigger, growing further while charging.
    const cfr = (a && a.kind === 'r' && a.phase === 'charge') ? hClamp01(a.charge / HammerPlayer25D.R_STAGE_TIMES[2]) : 0;
    const jx = cfr > 0 ? (Math.random() - 0.5) * (0.3 + cfr * 2.2 + (a.over || 0) * 2) : 0;
    const sc = 1.12 + cfr * 0.085 + (st >= 1 ? (a.over || 0) * 0.025 : 0);
    ctx.save();
    ctx.translate(this.x + jx, this.y);
    ctx.scale(sc, sc);
    ctx.translate(-this.x, -this.y);
    super.draw(ctx);
    ctx.restore();
    this.drawHammerEntity(ctx);
    this.drawActOverlays(ctx);
    this.drawPopFx(ctx);
  }

  drawGroundAura(ctx) {
    const a = this.act;
    const t = performance.now() * 0.004;
    const stage = (a && a.kind === 'r') ? (a.stage || 0) : 0;
    const over = (a && a.kind === 'r') ? (a.over || 0) : 0;
    const overload = this.overloadTimer > 0;
    if (this.bulwarkT > 0) {        // Bulwark: a gold ring on the floor that tightens as the buff runs out
      ctx.save();
      ctx.translate(this.x, this.y); ctx.scale(1, PERSPECTIVE_TILT);
      const k = this.bulwarkT / 10, fl = this.bulwarkT < 2 ? (0.5 + 0.5 * Math.sin(t * 6)) : 1;
      ctx.globalAlpha = 0.5 * fl; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.7 * fl; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      ctx.restore();
    }
    if (!stage && !overload && !(a && a.kind === 't' && a.jumpZ)) {
      if (a && a.kind === 'e' && a.phase === 'hover' && this.isLocal && this.hammerHeld) {
        // leap landing preview
        ctx.save();
        ctx.translate(a.tx, a.ty);
        ctx.scale(1, PERSPECTIVE_TILT);
        ctx.strokeStyle = 'rgba(125,211,252,0.9)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 7]);
        ctx.beginPath(); ctx.arc(0, 0, 138, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(125,211,252,0.14)';
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(1, PERSPECTIVE_TILT);
    const col = overload ? '#ef4444' : (stage >= 3 ? '#ef4444' : (stage === 2 ? '#fb923c' : '#e2e8f0'));
    const pulse = 1 + Math.sin(t * (stage + 2)) * 0.06;
    const radius = (36 + stage * 14 + over * 10) * pulse;
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
    g.addColorStop(0, col + 'aa');
    g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2 + stage;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2); ctx.stroke();
    if (stage >= 2 || overload) {
      // cracked-ground rays
      ctx.lineWidth = 2;
      const rays = 8 + stage * 2;
      for (let i = 0; i < rays; i++) {
        const ang = (i / rays) * Math.PI * 2 + t * 0.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 14, Math.sin(ang) * 14);
        ctx.lineTo(Math.cos(ang) * radius * (0.8 + 0.3 * Math.sin(t * 3 + i)), Math.sin(ang) * radius * (0.8 + 0.3 * Math.sin(t * 3 + i)));
        ctx.stroke();
      }
    }
    ctx.restore();
    if (stage >= 3 || overload) {
      // flame tongues rising around the body
      ctx.save();
      ctx.globalAlpha = 0.75;
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2 + t * 0.6;
        const fx = this.x + Math.cos(ang) * (22 + over * 6);
        const fy = this.y + Math.sin(ang) * (22 + over * 6) * PERSPECTIVE_TILT;
        const h = 26 + Math.sin(t * 5 + i * 1.7) * 9 + over * 14;
        ctx.fillStyle = over > 0.5 ? '#ffffff' : (i % 2 ? '#ef4444' : '#fb923c');
        ctx.beginPath();
        ctx.moveTo(fx - 4, fy);
        ctx.quadraticCurveTo(fx + Math.sin(t * 4 + i) * 5, fy - h * 0.6, fx, fy - h);
        ctx.quadraticCurveTo(fx + 2, fy - h * 0.5, fx + 4, fy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawActOverlays(ctx) {
    const a = this.act;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    if (a && a.kind === 'r' && a.phase === 'charge') {
      // 3-segment stage bar above the head + overcharge bar
      const w = 108, h = 9, x0 = this.x - w / 2, y0 = this.y - 112 - this.jumpZ;
      const times = HammerPlayer25D.R_STAGE_TIMES;
      ctx.fillStyle = 'rgba(8,10,18,0.88)';
      ctx.fillRect(x0 - 3, y0 - 3, w + 6, h + 15);
      const cols = ['#e2e8f0', '#fb923c', '#ef4444'];
      for (let i = 0; i < 3; i++) {
        const sx = x0 + (w / 3) * i + 1.5, sw = w / 3 - 3;
        const from = i === 0 ? 0 : times[i - 1];
        const frac = hClamp01((a.charge - from) / (times[i] - from));
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(sx, y0, sw, h);
        ctx.fillStyle = cols[i];
        ctx.fillRect(sx, y0, sw * frac, h);
        if (frac >= 1) {
          ctx.strokeStyle = cols[i]; ctx.lineWidth = 1.5; ctx.strokeRect(sx, y0, sw, h);
        }
      }
      if (a.stage >= 3) {
        const of = hClamp01(a.over / HammerPlayer25D.R_OVER_MAX);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x0 + 1.5, y0 + h + 2, w - 3, 4);
        ctx.fillStyle = of > 0.8 ? '#ffffff' : '#fde047';
        ctx.fillRect(x0 + 1.5, y0 + h + 2, (w - 3) * of, 4);
      }
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.fillStyle = a.stage >= 3 ? '#fca5a5' : '#fde047';
      ctx.fillText(a.stage === 0 ? 'HOLD [R]…' : (a.stage >= 3 ? 'RELEASE!' : `STAGE ${a.stage}`), this.x, y0 - 6);
    }
    if (a && a.kind === 'f' && a.k > 0) {
      const tier = Math.min(4, Math.ceil(a.k / 3));
      const cols = ['#e2e8f0', '#fde047', '#fb923c', '#ef4444'];
      const baseY = this.y - 124 - this.jumpZ;
      // progress pips
      const gap = 11, x0 = this.x - ((a.max - 1) * gap) / 2;
      for (let i = 0; i < a.max; i++) {
        const lit = i < a.k;
        const tt = Math.min(4, Math.ceil((i + 1) / 3));
        ctx.fillStyle = lit ? cols[tt - 1] : 'rgba(255,255,255,0.16)';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
        const r = (i === a.max - 1 ? 5.5 : 4) + (lit && i === a.k - 1 && a.bt < 0.12 ? 2 : 0);
        ctx.beginPath(); ctx.arc(x0 + i * gap, baseY, r, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
      }
      // timing ring: tap F as it closes into the gold window for a PERFECT
      if (!a.ending && a.k < a.max && a.bt < 1.05) {
        const t0 = a.bt;
        const inWin = t0 >= 0.36 && t0 <= 0.78;
        const rr = t0 < 0.78 ? hLerp(58, 26, hClamp01(t0 / 0.78)) : 26;
        const cy0 = this.y - 44 - this.jumpZ;
        ctx.save();
        ctx.globalAlpha = inWin ? 1 : 0.55;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(this.x, cy0, 26, 26 * PERSPECTIVE_TILT * 1.1, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = inWin ? '#fde047' : '#94a3b8'; ctx.lineWidth = inWin ? 4 : 2.2;
        ctx.beginPath(); ctx.ellipse(this.x, cy0, 26, 26 * PERSPECTIVE_TILT * 1.1, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = inWin ? '#ffffff' : '#cbd5e1'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.ellipse(this.x, cy0, rr, rr * PERSPECTIVE_TILT * 1.1, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }    if (a && a.kind === 'e' && a.phase === 'hover' && this.isLocal) {
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const msg = this.hammerHeld ? (a.needPress ? '[E] LEAP' : 'AIMING…') : '🔨 HAMMER AWAY — HOVERING';
      ctx.strokeText(msg, this.x, this.y - 124 - this.jumpZ);
      ctx.fillStyle = this.hammerHeld ? '#7dd3fc' : '#fca5a5';
      ctx.fillText(msg, this.x, this.y - 124 - this.jumpZ);
    }
    ctx.restore();
  }

  // Comic "BONK" words that slam in with overshoot and speed lines, dizzy stars, and tier-up banners.
  drawPopFx(ctx) {
    const list = this.popFx;
    if (!list || !list.length) return;
    const now = performance.now();
    const words = ['BONK', 'BONK!', 'BOOONK!!', 'KA-BONK!!!'];
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      const age = (now - e.born) / 1000;
      if (age > e.life) { list.splice(i, 1); continue; }
      const u = age / e.life;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      if (e.kind === 'word') {
        const pop = Math.min(1, age / 0.11);
        const back = 1 + 2.7 * Math.pow(pop - 1, 3) + 1.7 * Math.pow(pop - 1, 2);  // easeOutBack
        const s = (e.final ? 1.9 : 1) * Math.max(0.05, back) * (1 - Math.max(0, u - 0.7) * 1.2);
        const rise = age * (e.final ? 14 : 30);
        const alpha = u > 0.72 ? (1 - u) / 0.28 : 1;
        ctx.globalAlpha = alpha;
        ctx.translate(e.x, e.y - rise);
        // speed-line burst
        const spikes = 10 + e.tier * 3;
        const burstR = (24 + e.tier * 12 + (e.final ? 40 : 0)) * (0.5 + 0.9 * Math.min(1, age / 0.18));
        ctx.fillStyle = e.final ? 'rgba(253,224,71,0.85)' : (e.perfect ? 'rgba(253,224,71,0.7)' : 'rgba(255,255,255,0.55)');
        for (let sI = 0; sI < spikes; sI++) {
          const ang = (sI / spikes) * Math.PI * 2 + e.rot * 4;
          const len = burstR * (sI % 2 ? 0.7 : 1.15);
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang - 0.07) * burstR * 0.42, Math.sin(ang - 0.07) * burstR * 0.42);
          ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
          ctx.lineTo(Math.cos(ang + 0.07) * burstR * 0.42, Math.sin(ang + 0.07) * burstR * 0.42);
          ctx.closePath(); ctx.fill();
        }
        ctx.rotate(e.rot * (1 - Math.min(1, age / 0.25)));
        ctx.scale(s, s);
        const txt = e.final ? `WORLD BONK ×${e.k}!!!` : words[e.tier - 1];
        const size = e.final ? 26 : 16 + e.tier * 3.5;
        ctx.font = `900 ${size}px "Impact", "Arial Black", system-ui, sans-serif`;
        ctx.lineWidth = 5.5;
        ctx.strokeStyle = '#1a0a06';
        ctx.strokeText(txt, 0, 0);
        ctx.fillStyle = e.color;
        ctx.fillText(txt, 0, 0);
        if (e.perfect) {
          ctx.font = '900 11px system-ui, sans-serif';
          ctx.lineWidth = 3.5;
          ctx.strokeText('✦ PERFECT ✦', 0, -size * 0.78);
          ctx.fillStyle = '#fde047';
          ctx.fillText('✦ PERFECT ✦', 0, -size * 0.78);
        }
      } else if (e.kind === 'stars' && e.boss) {
        const bx = e.boss.x, by = e.boss.y - 100;
        const alpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        ctx.globalAlpha = alpha;
        for (let sI = 0; sI < e.n; sI++) {
          const ang = (sI / e.n) * Math.PI * 2 + age * 6;
          const sx = bx + Math.cos(ang) * 30, sy = by + Math.sin(ang) * 10 - 4;
          ctx.fillStyle = '#fde047'; ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 1.4;
          ctx.beginPath();
          for (let q = 0; q < 10; q++) {
            const rr = q % 2 ? 3 : 7;
            const aa = (q / 10) * Math.PI * 2 - Math.PI / 2 + age * 3;
            const X = sx + Math.cos(aa) * rr, Y = sy + Math.sin(aa) * rr;
            if (q === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      } else if (e.kind === 'tier') {
        const pop = Math.min(1, age / 0.14);
        ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        ctx.translate(e.x, e.y - age * 26);
        ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
        ctx.font = '900 20px "Impact", "Arial Black", system-ui, sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = '#1a0a06';
        ctx.strokeText(e.text, 0, 0);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, 0, 0);
      }
      ctx.restore();
    }
  }
  hammerHeadScreen() {
    const h = this.hammer;
    return { x: h.x, y: h.y - h.z };
  }

  drawHammerEntity(ctx) {
    const h = this.hammer;
    if (h.mode === 'held') return;
    // ground shadow
    ctx.save();
    const lift = Math.min(1, h.z / 60);
    ctx.fillStyle = `rgba(0,0,0,${0.5 - lift * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, 22 - lift * 6, (22 - lift * 6) * PERSPECTIVE_TILT, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (h.mode === 'grounded') {
      // embedded upright in the floor
      this.drawHammerSprite(ctx, h.x, h.y - 2, -0.35, -1, 54, 0, 1);
      return;
    }
    if (h.mode === 'anchor') {
      // Grave Anchor (a Karok Clash finisher drives it): flying head-first, or hooked on its target; h.dx/h.dy = head direction
      const dx = h.dx || 1, dy = h.dy || 0, L = Math.hypot(dx, dy) || 1;
      const hx = h.x, hy = h.y - h.z;
      this.drawHammerSprite(ctx, hx - dx / L * 76, hy - dy / L * 76, dx, dy, 50, h.glow || 0, 1);
      return;
    }
    // spinning boomerang hammer
    const spinning = true;
    const ang = h.spin;
    const cx = h.x, cy = h.y - h.z - 14;
    if (window.fx && spinning) {
      // faint spin ring
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = '#fdba74';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 40, 40 * 0.55, 0, ang, ang + 2.2);
      ctx.stroke();
      ctx.restore();
    }
    this.drawHammerSprite(ctx, cx, cy, Math.cos(ang), Math.sin(ang) * 0.6, 50, 0, 1);
  }

  // Draws the hammer from its grip: pommel behind the hand, long shaft, then a colossal octagonal slab head
  // (engraved face, thick rim, horn spikes) like the reference art. dx,dy is the screen direction the head points.
  drawHammerSprite(ctx, hx, hy, dx, dy, shaft = 68, glow = 0, scale = 1) {
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const S = scale;
    const V = HAMMER_LOOKS[this.weaponModelId] || HAMMER_LOOKS.hammer_slab;   // appearance follows the equipped hammer
    const tNow = performance.now() * 0.001;
    const ex = hx + dx * shaft * S, ey = hy + dy * shaft * S;       // where the shaft meets the head
    const R = 34 * S;                                                // slab radius
    const cx = ex + dx * R * 0.78, cy = ey + dy * R * 0.78;          // slab centre
    const bx = hx - dx * 16 * S, by = hy - dy * 16 * S;              // pommel end
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // glow halo behind the slab
    if (glow > 0) {
      const gr = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.9);
      const gc = glow >= 3 ? '239,68,68' : (glow === 2 ? '251,146,60' : '226,232,240');
      gr.addColorStop(0, `rgba(${gc},0.7)`);
      gr.addColorStop(1, `rgba(${gc},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.9, 0, Math.PI * 2); ctx.fill();
    }

    // tier-3 Eclipse halo: a gold ring with orbiting gems, drawn behind the head
    if (V.halo) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = V.halo; ctx.globalAlpha = 0.85; ctx.lineWidth = 3 * S;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.32, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5 * S; ctx.setLineDash([6 * S, 9 * S]); ctx.lineDashOffset = -tNow * 30 * S;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = V.haloGem;
      for (let g = 0; g < 3; g++) {
        const a = tNow * 1.3 + g * (Math.PI * 2 / 3);
        ctx.beginPath(); ctx.arc(Math.cos(a) * R * 1.32, Math.sin(a) * R * 1.32, 3.6 * S, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // shaft: dark core, lacquered body, bright edge
    ctx.strokeStyle = V.shaftCore;
    ctx.lineWidth = 19 * S;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = V.shaft;
    ctx.lineWidth = 15 * S;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    // heavy bands wrapped along the shaft
    ctx.strokeStyle = V.bands;
    ctx.lineWidth = 4 * S;
    for (let bI = 1; bI <= 3; bI++) {
      const bt = bI / 4;
      const mx2 = bx + (ex - bx) * bt, my2 = by + (ey - by) * bt;
      ctx.beginPath(); ctx.moveTo(mx2 + dy * 9.5 * S, my2 - dx * 9.5 * S); ctx.lineTo(mx2 - dy * 9.5 * S, my2 + dx * 9.5 * S); ctx.stroke();
    }
    ctx.strokeStyle = V.shaftEdge;
    ctx.lineWidth = 2.4 * S;
    ctx.beginPath(); ctx.moveTo(bx - dy * 2 * S, by + dx * 2 * S); ctx.lineTo(ex - dy * 2 * S, ey + dx * 2 * S); ctx.stroke();
    // pommel knob + grip wraps
    ctx.fillStyle = V.pommel;
    ctx.beginPath(); ctx.arc(bx, by, 12 * S, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = V.pommelRim; ctx.lineWidth = 2 * S; ctx.stroke();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 17 * S;
    ctx.beginPath(); ctx.moveTo(bx + dx * 8 * S, by + dy * 8 * S); ctx.lineTo(bx + dx * 34 * S, by + dy * 34 * S); ctx.stroke();
    // collar at the head
    ctx.strokeStyle = V.collar;
    ctx.lineWidth = 24 * S;
    ctx.beginPath(); ctx.moveTo(ex - dx * 8 * S, ey - dy * 8 * S); ctx.lineTo(ex + dx * 2 * S, ey + dy * 2 * S); ctx.stroke();

    // horn spikes curling off the slab's far corners
    const px = -dy, py = dx; const HK = (V.hornScale || 0.7) * S;
    ctx.fillStyle = V.horn;
    ctx.strokeStyle = V.hornEdge;
    ctx.lineWidth = 2 * HK;
    for (const sgn of [-1, 1]) {
      const bx0 = cx + px * R * 0.62 * sgn + dx * R * 0.3, by0 = cy + py * R * 0.62 * sgn + dy * R * 0.3;
      ctx.beginPath();
      ctx.moveTo(bx0 - dx * 9 * HK, by0 - dy * 9 * HK);
      ctx.quadraticCurveTo(bx0 + px * 38 * HK * sgn, by0 + py * 38 * HK * sgn, bx0 + px * 58 * HK * sgn + dx * 18 * HK, by0 + py * 58 * HK * sgn + dy * 18 * HK);
      ctx.quadraticCurveTo(bx0 + px * 30 * HK * sgn + dx * 12 * HK, by0 + py * 30 * HK * sgn + dy * 12 * HK, bx0 + dx * 12 * HK, by0 + dy * 12 * HK);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // slab: extruded back plate (thickness), then the octagonal face
    const oct = (x, y, r, rot) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = rot + (i / 8) * Math.PI * 2 + Math.PI / 8;
        const X = x + Math.cos(a) * r, Y = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.closePath();
    };
    const rot = Math.atan2(dy, dx);
    const depthX = 19 * S, depthY = 20 * S;
    ctx.fillStyle = V.back;
    oct(cx + depthX, cy + depthY, R, rot); ctx.fill();
    ctx.strokeStyle = V.backEdge; ctx.lineWidth = 2.5 * S; ctx.stroke();
    // connecting side walls
    ctx.fillStyle = V.side;
    for (let i = 0; i < 8; i++) {
      const a0 = rot + (i / 8) * Math.PI * 2 + Math.PI / 8, a1 = rot + ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
      const p0 = [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], p1 = [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R];
      if (Math.sin((a0 + a1) * 0.5) < -0.1 && Math.cos((a0 + a1) * 0.5) < 0.6) continue; // hidden upper-left sides
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p1[0] + depthX, p1[1] + depthY); ctx.lineTo(p0[0] + depthX, p0[1] + depthY);
      ctx.closePath(); ctx.fill();
    }
    // jagged teeth / crown spikes standing off the rim (tier 2 and 3)
    if (V.teeth) {
      ctx.fillStyle = V.teeth; ctx.strokeStyle = V.backEdge; ctx.lineWidth = 1.6 * S;
      for (let i = 0; i < 8; i++) {
        const a = rot + (i / 8) * Math.PI * 2 + Math.PI / 8 + Math.PI / 8;
        const ca = Math.cos(a), sa = Math.sin(a);
        const w = 0.2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a - w) * R * 0.96, cy + Math.sin(a - w) * R * 0.96);
        ctx.lineTo(cx + ca * R * (V.toothLen || 1.28), cy + sa * R * (V.toothLen || 1.28));
        ctx.lineTo(cx + Math.cos(a + w) * R * 0.96, cy + Math.sin(a + w) * R * 0.96);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    // face
    const fg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    fg.addColorStop(0, V.face[0]); fg.addColorStop(0.55, V.face[1]); fg.addColorStop(1, V.face[2]);
    ctx.fillStyle = fg;
    oct(cx, cy, R, rot); ctx.fill();
    ctx.strokeStyle = glow >= 3 ? '#fecaca' : V.rim;
    ctx.lineWidth = 4 * S; ctx.stroke();
    // inner bevel + engraved rune medallion
    ctx.strokeStyle = 'rgba(15,5,3,0.75)';
    ctx.lineWidth = 3 * S;
    oct(cx, cy, R * 0.8, rot); ctx.stroke();
    ctx.strokeStyle = V.rune;
    ctx.lineWidth = 2 * S;
    oct(cx, cy, R * 0.62, rot + Math.PI / 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.1, 0, Math.PI * 2); ctx.fillStyle = glow >= 3 ? '#fecaca' : V.center; ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.32, cy + Math.sin(a) * R * 0.32);
      ctx.lineTo(cx + Math.cos(a) * R * 0.58, cy + Math.sin(a) * R * 0.58);
      ctx.stroke();
    }
    // glowing fissures across the face of the obsidian maul
    if (V.vein) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.6 + Math.sin(tNow * 3) * 0.25;
      ctx.strokeStyle = V.vein; ctx.globalAlpha = pulse; ctx.lineWidth = 2.4 * S;
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.75, cy - R * 0.1); ctx.lineTo(cx - R * 0.35, cy + R * 0.12); ctx.lineTo(cx - R * 0.1, cy - R * 0.08);
      ctx.lineTo(cx + R * 0.3, cy + R * 0.28); ctx.lineTo(cx + R * 0.72, cy + R * 0.05);
      ctx.moveTo(cx + R * 0.1, cy - R * 0.08); ctx.lineTo(cx + R * 0.22, cy - R * 0.55);
      ctx.stroke();
      ctx.restore();
    }
    // corner rivets
    ctx.fillStyle = V.rivet;
    for (let i = 0; i < 8; i++) {
      const a = rot + (i / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88, 2.4 * S, 0, Math.PI * 2); ctx.fill();
    }
    // face shine
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.7, cy - R * 0.25); ctx.lineTo(cx - R * 0.25, cy - R * 0.75); ctx.lineTo(cx + R * 0.2, cy - R * 0.7); ctx.lineTo(cx - R * 0.5, cy);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // =========================================================================
  // UNIQUE GRAVEBREAKER MODEL — bulky crimson plate, fur mantle, spiked pauldrons, bare bearded head.
  // Replaces every Breaker rig part (cloak, legs, waist, cuirass, arms, head) so nothing is shared with the knight.
  // =========================================================================
  furTuft(ctx, x, y, w, n, col1 = '#d9c9a8', col2 = '#9c8764') {
    for (let i = 0; i < n; i++) {
      const fx = x + (i / Math.max(1, n - 1) - 0.5) * w;
      const fy = y + Math.sin(i * 2.3) * 1.2;
      ctx.fillStyle = i % 2 ? col1 : col2;
      ctx.beginPath();
      ctx.moveTo(fx - 2.6, fy);
      ctx.lineTo(fx + (i % 2 ? 1 : -1), fy - 5.2 - (i % 3));
      ctx.lineTo(fx + 2.6, fy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Back: ragged war-strips off the belt and a heavy fur mantle behind the neck.
  drawRigCloak(ctx, J) {
    const { lShoulder: lS, rShoulder: rS, neck, cosR } = J;
    ctx.save();
    // fur mantle behind the shoulders
    const mx = (lS.sx + rS.sx) * 0.5, my = (lS.sy + rS.sy) * 0.5 - 2;
    const span = Math.max(24, Math.abs(rS.sx - lS.sx) + 14);
    ctx.fillStyle = '#7a6548';
    ctx.beginPath(); ctx.ellipse(mx, my + 2, span * 0.62, 8, 0, 0, Math.PI * 2); ctx.fill();
    this.furTuft(ctx, mx, my - 3, span * 1.15, 11);
    // ragged strips following the cape physics (re-used for motion only, drawn as two narrow torn banners)
    if (!this._capePts || this._capePts.length !== this.capeNodes.length) this._capePts = this.capeNodes.map(() => ({ x: 0, y: 0, w: 0 }));
    const pts = this._capePts;
    for (let idx = 0; idx < pts.length; idx++) {
      const n = this.capeNodes[idx];
      const pt = pts[idx];
      if (idx === 0) { pt.x = mx - cosR * 3; pt.y = my + 6; } else { pt.x = n.x; pt.y = this.y + (n.y - this.y) * PERSPECTIVE_TILT - n.z; }
    }
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, d = Math.hypot(dx, dy);
      if (d > 10.5) { pts[i].x = pts[i - 1].x + dx / d * 10.5; pts[i].y = pts[i - 1].y + dy / d * 10.5; }
    }
    for (const off of [-5.5, 5.5]) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const w = 2.2 + i * 0.7;
        const X = pts[i].x + off - w, Y = pts[i].y;
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      const b = pts[pts.length - 1];
      ctx.lineTo(b.x + off - 3, b.y + 7); ctx.lineTo(b.x + off, b.y + 2); ctx.lineTo(b.x + off + 3, b.y + 8);
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x + off + 2.2 + i * 0.7, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = this.lk('cloth','#7f1d12',0.9);
      ctx.fill();
      ctx.strokeStyle = this.lk('accent','#d97706'); ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  // Thick plated legs: crimson cuisse, spiked round knee, wrapped fur-cuffed boot.
  drawRigLeg(ctx, J, side) {
    const hip = side < 0 ? J.lHip : J.rHip;
    const knee = side < 0 ? J.lKnee : J.rKnee;
    const ankle = side < 0 ? J.lAnkle : J.rAnkle;
    const foot = side < 0 ? this.leftFoot : this.rightFoot;
    ctx.save();
    const seg = (a, b, w0, w1, fill, stroke) => {
      const ang = Math.atan2(b.sy - a.sy, b.sx - a.sx), len = Math.hypot(b.sx - a.sx, b.sy - a.sy);
      ctx.save();
      ctx.translate(a.sx, a.sy); ctx.rotate(ang);
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-2, -w0); ctx.lineTo(len + 1, -w1); ctx.lineTo(len + 1, w1); ctx.lineTo(-2, w0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    seg(hip, knee, 7.6, 6.2, this.lk('cloth','#8f2a1a'), '#2a0f08');          // cuisse
    seg(knee, ankle, 6.6, 5.2, this.lk('cloth','#5b1a10',0.64), '#2a0f08');        // greave
    // gold bands on the greave
    const sAng = Math.atan2(ankle.sy - knee.sy, ankle.sx - knee.sx);
    ctx.save(); ctx.translate(knee.sx, knee.sy); ctx.rotate(sAng);
    ctx.strokeStyle = this.lk('accent','#d97706'); ctx.lineWidth = 2;
    const sl = Math.hypot(ankle.sx - knee.sx, ankle.sy - knee.sy);
    for (const f of [0.35, 0.7]) { ctx.beginPath(); ctx.moveTo(sl * f, -5.4); ctx.lineTo(sl * f, 5.4); ctx.stroke(); }
    ctx.restore();
    // boot
    const footAng = foot.angle !== undefined ? foot.angle : J.renderAng;
    const fCos = Math.cos(footAng), fSin = Math.sin(footAng) * PERSPECTIVE_TILT;
    const toe = (foot.pitch || 0) * 4.5;
    ctx.fillStyle = '#2b1a12'; ctx.strokeStyle = '#120a06'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ankle.sx - fCos * 5.5, ankle.sy - fSin * 5.5 - 3);
    ctx.lineTo(ankle.sx + fCos * 11, ankle.sy + fSin * 11 + 1.5 - toe);
    ctx.lineTo(ankle.sx + fCos * 9, ankle.sy + fSin * 9 + 5.5);
    ctx.lineTo(ankle.sx - fCos * 4, ankle.sy + 4.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // fur cuff
    this.furTuft(ctx, ankle.sx, ankle.sy - 3, 12, 5);
    // spiked knee guard
    ctx.fillStyle = this.lk('cloth','#b23a22',1.22); ctx.strokeStyle = '#2a0f08'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(knee.sx, knee.sy, 5.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = this.lk('accent','#d97706');
    ctx.beginPath(); ctx.moveTo(knee.sx - 2, knee.sy - 4.5); ctx.lineTo(knee.sx, knee.sy - 10); ctx.lineTo(knee.sx + 2, knee.sy - 4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Wide war-belt with a rune medallion buckle and hanging plate skirt + fur loin pad.
  drawRigWaist(ctx, J) {
    const { pelvis, cosR, strideDiff } = J;
    ctx.save();
    const sway = Math.sin(this.breathePhase * 1.4) * 0.06 - strideDiff * 0.16;
    // skirt plates
    for (let i = -1; i <= 1; i++) {
      ctx.save();
      ctx.translate(pelvis.sx + i * 7 + cosR * 2, pelvis.sy + 1);
      ctx.rotate(sway + i * 0.12);
      ctx.fillStyle = i === 0 ? this.lk('cloth','#a63a22',1.15) : this.lk('cloth','#7a2214',0.85);
      ctx.strokeStyle = '#2a0f08'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-4.4, 0); ctx.lineTo(4.4, 0); ctx.lineTo(3.6, 15); ctx.lineTo(0, 19); ctx.lineTo(-3.6, 15); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // side hip plates
    for (let s = -1; s <= 1; s += 2) {
      const pt = s < 0 ? J.lHip : J.rHip;
      ctx.save();
      ctx.translate(pt.sx, pt.sy - 2); ctx.rotate(s * 0.3);
      ctx.fillStyle = this.lk('cloth','#8f2a1a'); ctx.strokeStyle = '#2a0f08'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-5.5, -2); ctx.lineTo(5.5, -2); ctx.lineTo(6.5, 9); ctx.lineTo(-6.5, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // belt
    ctx.fillStyle = '#2b1a12'; ctx.strokeStyle = this.lk('accent','#d97706'); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.roundRect(pelvis.sx - 15, pelvis.sy - 5.5, 30, 9, 3); ctx.fill(); ctx.stroke();
    // medallion buckle
    const bx = pelvis.sx + cosR * 4.2;
    ctx.fillStyle = this.lk('accent','#d97706'); ctx.beginPath(); ctx.arc(bx, pelvis.sy - 1, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a140c'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(bx, pelvis.sy - 1, 2.2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Barrel chest in crimson plate: sunburst crest, plate seams, leather bandolier, fur collar.
  drawRigCuirass(ctx, J) {
    const { lShoulder: lS, rShoulder: rS, neck, chest, pelvis, cosR } = J;
    ctx.save();
    const grad = ctx.createLinearGradient(lS.sx, neck.sy - 6, rS.sx, pelvis.sy);
    grad.addColorStop(0, this.lk('cloth','#b8402a',1.3)); grad.addColorStop(0.5, this.lk('cloth','#8f2a1a')); grad.addColorStop(1, this.lk('cloth','#5b1a10',0.64));
    ctx.fillStyle = grad; ctx.strokeStyle = '#2a0f08'; ctx.lineWidth = 2;
    const wx = 13.5;
    ctx.beginPath();
    ctx.moveTo(lS.sx - 3, lS.sy - 2);
    ctx.lineTo(neck.sx, neck.sy - 5);
    ctx.lineTo(rS.sx + 3, rS.sy - 2);
    ctx.lineTo(chest.sx + 16.5, chest.sy + 2);
    ctx.lineTo(pelvis.sx + wx, pelvis.sy - 2);
    ctx.lineTo(pelvis.sx, pelvis.sy + 3);
    ctx.lineTo(pelvis.sx - wx, pelvis.sy - 2);
    ctx.lineTo(chest.sx - 16.5, chest.sy + 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // plate seams (abdomen)
    ctx.strokeStyle = 'rgba(42,15,8,0.8)'; ctx.lineWidth = 1.4;
    for (let i = 1; i <= 3; i++) {
      const y = chest.sy + 2 + i * ((pelvis.sy - chest.sy) / 4);
      ctx.beginPath(); ctx.moveTo(chest.sx - 11 + i, y); ctx.lineTo(chest.sx + 11 - i, y); ctx.stroke();
    }
    // leather bandolier strap
    ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 4.2;
    ctx.beginPath(); ctx.moveTo(lS.sx + 2, lS.sy); ctx.lineTo(pelvis.sx + 11, pelvis.sy - 2); ctx.stroke();
    ctx.strokeStyle = this.lk('accent','#d97706'); ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(lS.sx + 2, lS.sy); ctx.lineTo(pelvis.sx + 11, pelvis.sy - 2); ctx.stroke(); ctx.setLineDash([]);
    // sunburst crest
    const fx = chest.sx + cosR * 4.5, fy = chest.sy + 2;
    ctx.fillStyle = this.lk('accent','#d97706');
    ctx.beginPath(); ctx.arc(fx, fy, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6); ctx.lineTo(fx + Math.cos(a) * 9.5, fy + Math.sin(a) * 9.5); ctx.stroke();
    }
    ctx.fillStyle = this.overloadTimer > 0 ? '#ef4444' : '#4a140c';
    ctx.beginPath(); ctx.arc(fx, fy, 2.4, 0, Math.PI * 2); ctx.fill();
    // fur collar
    ctx.fillStyle = '#8b7355';
    ctx.beginPath(); ctx.ellipse(neck.sx, neck.sy - 1, 13, 5.6, 0, 0, Math.PI * 2); ctx.fill();
    this.furTuft(ctx, neck.sx, neck.sy - 3, 24, 9);
    ctx.restore();
  }

  // Bare muscular arms in huge riveted bracers, spiked fists, and a big horned pauldron.
  drawRigArm(ctx, J, side) {
    const s = side < 0 ? J.lShoulder : J.rShoulder;
    const e = side < 0 ? J.lElbow : J.rElbow;
    const h = side < 0 ? J.lHand : J.rHand;
    ctx.save();
    const limb = (a, b, w0, w1, fill, stroke) => {
      const ang = Math.atan2(b.sy - a.sy, b.sx - a.sx), len = Math.hypot(b.sx - a.sx, b.sy - a.sy);
      ctx.save(); ctx.translate(a.sx, a.sy); ctx.rotate(ang);
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-2, -w0, len + 3, w0 * 2, 3); ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    limb(s, e, 5.8, 5, this.lk('skin','#c58a63'), '#4a2a18');                  // bare upper arm
    limb(e, h, 6.4, 5.4, this.lk('cloth','#8f2a1a'), '#2a0f08');                // riveted bracer
    const fa = Math.atan2(h.sy - e.sy, h.sx - e.sx);
    ctx.save(); ctx.translate(e.sx, e.sy); ctx.rotate(fa);
    ctx.strokeStyle = this.lk('accent','#d97706'); ctx.lineWidth = 1.8;
    const fl = Math.hypot(h.sx - e.sx, h.sy - e.sy);
    ctx.beginPath(); ctx.moveTo(fl * 0.55, -6); ctx.lineTo(fl * 0.55, 6); ctx.stroke();
    ctx.restore();
    // fist
    ctx.fillStyle = this.lk('skin','#c58a63'); ctx.strokeStyle = '#2a0f08'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(h.sx, h.sy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6b7280';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(h.sx + Math.cos(fa) * 4 + i * 2.2 * -Math.sin(fa), h.sy + Math.sin(fa) * 4 + i * 2.2 * Math.cos(fa), 1.5, 0, Math.PI * 2); ctx.fill(); }
    // horned pauldron
    const uAng = Math.atan2(e.sy - s.sy, e.sx - s.sx);
    ctx.save();
    ctx.translate(s.sx, s.sy - 2); ctx.rotate((uAng - Math.PI * 0.5) * 0.25 + side * 0.2);
    ctx.fillStyle = this.lk('cloth','#9b2f1d',1.07); ctx.strokeStyle = '#2a0f08'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 9, 0, Math.PI, Math.PI * 2); ctx.lineTo(13, 3); ctx.quadraticCurveTo(0, 11, -13, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a140c';                                   // horn
    ctx.beginPath(); ctx.moveTo(side * 5, -7); ctx.quadraticCurveTo(side * 16, -10, side * 17, -22); ctx.quadraticCurveTo(side * 9, -14, side * 1, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = this.lk('accent','#d97706');
    for (const sx of [-7, 0, 7]) { ctx.beginPath(); ctx.arc(sx, 1, 1.7, 0, Math.PI * 2); ctx.fill(); }
    this.furTuft(ctx, 0, -6, 20, 7);
    ctx.restore();
    ctx.restore();
  }

  // Bare head: swept dark hair, thick beard, scowling brow, red war-paint stripe. No helmet.
  drawRigHelm(ctx, J) {
    const { head, cosR, sinR } = J;
    ctx.save();
    const hx = head.sx, hy = head.sy;
    const face = sinR > -0.55;
    // hair mass (back/top)
    ctx.fillStyle = this.lk('hair','#1f1410');
    ctx.beginPath(); ctx.ellipse(hx - cosR * 1.2, hy - 1.5, 9.6, 10.4, 0, 0, Math.PI * 2); ctx.fill();
    // topknot trailing with motion
    const tx = this.capeNodes[1] ? this.capeNodes[1].x : hx - cosR * 12;
    ctx.strokeStyle = this.lk('hair','#1f1410'); ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - cosR * 4, hy - 7); ctx.quadraticCurveTo(hx - cosR * 12, hy - 12, tx - cosR * 4 + (hx - tx) * 0.1, hy + 2); ctx.stroke();
    // face
    if (face) {
      ctx.fillStyle = this.lk('skin','#c58a63'); ctx.strokeStyle = '#4a2a18'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(hx + cosR * 2.4, hy + 1, 7.4, 8.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // beard
      ctx.fillStyle = this.lk('hair','#1f1410');
      ctx.beginPath(); ctx.moveTo(hx + cosR * 2.4 - 6.6, hy + 2); ctx.quadraticCurveTo(hx + cosR * 2.4, hy + 15, hx + cosR * 2.4 + 6.6, hy + 2); ctx.quadraticCurveTo(hx + cosR * 2.4, hy + 6, hx + cosR * 2.4 - 6.6, hy + 2); ctx.closePath(); ctx.fill();
      // brow + eyes
      const ex = hx + cosR * 4.6;
      ctx.strokeStyle = this.lk('hair','#1f1410'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex - 5, hy - 2.6); ctx.lineTo(ex - 1, hy - 1.2); ctx.moveTo(ex + 5, hy - 2.6); ctx.lineTo(ex + 1, hy - 1.2); ctx.stroke();
      ctx.fillStyle = this.overloadTimer > 0 ? '#ef4444' : '#f8fafc';
      ctx.fillRect(ex - 4.4, hy - 0.4, 2.6, 1.8); ctx.fillRect(ex + 1.8, hy - 0.4, 2.6, 1.8);
      // war paint
      ctx.strokeStyle = this.lk('accent','#dc2626'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex - 5.5, hy + 2.5); ctx.lineTo(ex + 5.5, hy + 2.5); ctx.stroke();
    }
    // hair front sweep
    ctx.fillStyle = this.lk('hair','#1f1410');
    ctx.beginPath(); ctx.moveTo(hx - 9, hy - 3); ctx.quadraticCurveTo(hx, hy - 15, hx + 9.4, hy - 3); ctx.quadraticCurveTo(hx + 1, hy - 8, hx - 9, hy - 3); ctx.closePath(); ctx.fill();
    // bronze headband
    ctx.strokeStyle = this.lk('accent','#d97706'); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(hx - 8.4, hy - 4); ctx.quadraticCurveTo(hx, hy - 7.5, hx + 8.4, hy - 4); ctx.stroke();
    ctx.restore();
  }
  // Replaces Breaker's greatsword when the rig draws the weapon.
  drawColossalGreatsword(ctx, rHand3D, swordTip3D, activeSlashArc, time) {
    if (!this.hammerHeld) return;
    const a = this.act;
    // Swing trail
    const showVfx = this.isLocal || !window.fx || window.fx.showAllyVfx !== false;
    const swinging = this.state === 'combo' || (a && (a.kind === 'q' || a.kind === 'd' || a.kind === 'f' || a.kind === 'a'));
    if (showVfx && swinging && this.swordTrail.length > 2) {
      ctx.save();
      for (let i = 1; i < this.swordTrail.length; i++) {
        const p0 = this.swordTrail.at(i - 1), p1 = this.swordTrail.at(i);
        if (Math.hypot(p1.tx - p0.tx, p1.ty - p0.ty) > 4) {
          ctx.fillStyle = `rgba(251,146,60,${(i / this.swordTrail.length) * 0.34})`;
          ctx.beginPath();
          ctx.moveTo(p0.hx, p0.hy); ctx.lineTo(p0.tx, p0.ty); ctx.lineTo(p1.tx, p1.ty); ctx.lineTo(p1.hx, p1.hy);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }
    let dx = swordTip3D.sx - rHand3D.sx, dy = swordTip3D.sy - rHand3D.sy;
    const L0 = Math.hypot(dx, dy) || 1;
    dx /= L0; dy /= L0;
    // Weight: the slab's direction is a heavy under-damped spring chasing the pose. It lags behind fast swings,
    // overshoots on stops and sways while walking, instead of snapping rigidly to the hand like a stick.
    {
      const tAng = Math.atan2(dy, dx);
      const nowMs = performance.now();
      const dtS = Math.min(0.05, Math.max(0.001, (nowMs - (this._lagT || nowMs)) / 1000));
      this._lagT = nowMs;
      if (this._lagA === undefined || !Number.isFinite(this._lagA)) { this._lagA = tAng; this._lagV = 0; }
      let diff = tAng - this._lagA;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const stiff = (a && (a.kind === 'f' || a.kind === 'b' || a.kind === 'q')) ? 170 : 95;
      this._lagV += (diff * stiff - this._lagV * 13) * dtS;
      this._lagA += this._lagV * dtS;
      const snap = a ? 0.38 : 0.0;                 // keep strikes readable: blend toward the exact pose during acts
      let fa = this._lagA;
      let d2 = tAng - fa;
      while (d2 > Math.PI) d2 -= Math.PI * 2;
      while (d2 < -Math.PI) d2 += Math.PI * 2;
      fa += d2 * snap;
      dx = Math.cos(fa); dy = Math.sin(fa);
    }
    let glow = 0;
    if (a && a.kind === 'r' && a.phase === 'charge') glow = a.stage;
    if (this.overloadTimer > 0) glow = Math.max(glow, 2);
    let scale = (a && a.kind === 't') ? (a.grow || 1) : 1;
    if (a && a.kind === 'r' && a.phase === 'charge') scale *= 1 + hClamp01(a.charge / HammerPlayer25D.R_STAGE_TIMES[2]) * 0.2 + (a.over || 0) * 0.05;
    // Landing: the pose alone puts the slab beside the feet ([R]) or still in the air ([F]) at the moment of impact, while the hit,
    // the cracks and the crater are in front. Around each impact, bend the hammer so the slab centre meets the floor exactly there.
    let shaft = 56;
    const land = this.hammerLandTarget();
    if (land) {
      const tx = land.x - rHand3D.sx, ty = land.y - rHand3D.sy, tl = Math.hypot(tx, ty) || 1;
      const a0 = Math.atan2(dy, dx);
      let d = Math.atan2(ty, tx) - a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const aa = a0 + d * land.w;
      dx = Math.cos(aa); dy = Math.sin(aa);
      shaft = 56 + (Math.max(0, Math.min(120, tl / scale - 34 * 0.78)) - 56) * land.w;
    }
    this.drawHammerSprite(ctx, rHand3D.sx, rHand3D.sy, dx, dy, shaft, glow, scale);
  }

  // Where (and how strongly) the slab should be pinned to the floor right now: the same points resolveChargeSmash and resolveBonk use.
  hammerLandTarget() {
    const a = this.act;
    if (!a) return null;
    const sm = (v) => { v = hClamp01(v); return v * v * (3 - 2 * v); };
    let D = 0, w = 0, pin = null;
    if (a.kind === 'r' && a.phase === 'smash') {
      const p = hClamp01((a.smashT || 0) / 1.3);
      D = 66;
      w = p < 0.5 ? sm((p - 0.40) / 0.10) : (p < 0.8 ? 1 : 1 - sm((p - 0.8) / 0.2));
      if (a.hit && a.landX !== undefined) pin = { x: a.landX, y: a.landY };
    } else if (a.kind === 'f') {
      D = 98;
      if (a.pending) w = sm(1 - a.pending.t / 0.12);
      else { const s = (performance.now() - (this._bonkAt || 0)) / 1000; w = s < 0.15 ? 1 : 1 - sm((s - 0.15) / 0.15); if (this._bonkPt) pin = this._bonkPt; }
    }
    if (w <= 0.001) return null;
    if (pin) return { x: pin.x, y: pin.y, w };
    return { x: this.x + Math.cos(this.facingAngle) * D, y: this.y + Math.sin(this.facingAngle) * D * PERSPECTIVE_TILT, w };
  }
}

window.HammerPlayer25D = HammerPlayer25D;
if (typeof installClashQte === 'function') installClashQte(HammerPlayer25D);
