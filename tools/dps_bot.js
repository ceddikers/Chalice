// DPS TEST BOT (dev tool, not shipped). Load it in the game page, then run a class:
//   (0,eval)(await (await fetch('tools/dps_bot.js',{cache:'reload'})).text());
//   await __setup('reaper');                       // fresh page recommended per class (reload first)
//   await __run('current', 'front', 50, 0.30);     // -> damage per second
// Modes: 'old' (front/back bonus on every hit), 'current' (only head-flagged hits), 'new' (proposed Front/Back lists, back crit = 4th arg).
// Sides: 'front' | 'back' of the boss. window.__hack = 'overload' keeps a Gravebreaker in Overload nearly all the time.
// The boss is frozen and unkillable, the player is invulnerable; the rotation is a simple priority list, so use the numbers to compare rule sets, not as real DPS.
window.__setup = async function (cls) {
  localStorage.clear();
  const g = window.game; g.setPlayerClass(cls); g.enterRaidGate(false);
  await new Promise(r => setTimeout(r, 1800));
  const p = g.localPlayer, b = g.boss;
  if (!g.__origUpdate) { g.__origUpdate = g.update; g.update = function (dt) { if (window.__sim) return; return g.__origUpdate.call(this, dt); }; }
  let pr = Object.getPrototypeOf(p); while (pr && !Object.prototype.hasOwnProperty.call(pr, 'computePositionalBonus')) pr = Object.getPrototypeOf(pr);
  if (!pr.__patched) {
    pr.__patched = true; pr.__origC = pr.computePositionalBonus; pr.__origD = pr.dealHitToBoss;
    pr.dealHitToBoss = function (boss, coeff, name, head, ...rest) { this.__real = !!head; this.__nm = name; if (window.__posMode === 'live') return pr.__origD.call(this, boss, coeff, name, head, ...rest); return pr.__origD.call(this, boss, coeff, name, true, ...rest); };   // 'live' = the game's own rules
    const FR = /^(Earthbreaker|Bedrock Uppercut|Empowered Titan|Titan's Wrath)|Charge Smash|^Bonk|Abyss Cataclysm Detonation|Zenith Dive|Convergence Burst|Overcharge Flare/;
    const BK = /Reaping Arc|Spin Stomp|Lethal Spin|Eclipse Harvest|Harvest Slam|Maw Lunge|Lance Shot|Cross Slash/;
    pr.computePositionalBonus = function (boss) {
      const real = this.__real, nm = this.__nm || '', base = pr.__origC.call(this, boss, real);
      const neutral = { mult: 1, type: base.type, color: '#f8fafc', staggerMult: 1 };
      const m = window.__posMode;
      if (m === 'live') return base;
      if (m === 'old') return base;
      if (m === 'current') return real ? base : neutral;
      if (m === 'new') {
        if (real && FR.test(nm)) return base.type === 'head' ? base : neutral;
        if (BK.test(nm)) return base.type === 'back' ? { mult: 1.25, type: 'back', color: base.color, critBonus: window.__backCrit, staggerMult: 1.15 } : neutral;
        return neutral;
      }
      return neutral;
    };
  }
  b.update = function () {}; b.maxHp = 1e13; b.hp = 1e13;
  return { cls: p.classId || 'breaker', boss: !!b };
};
window.__run = async function (mode, side, secs, backCrit) {
  window.__posMode = mode; window.__backCrit = backCrit || 0.30;
  const g = window.game, p = g.localPlayer, b = g.boss;
  p.act = null; p.state = 'idle'; for (const k in p.cds) { try { p.cds[k] = 0; } catch (e) {} }
  p.shield = 0; p.blood = 0; p.heat = 0; p.marks = 0; p.chain = 0; p.chainT = 0; p.chainKey = ''; if (p.hammer) { p.hammer.mode = 'held'; }
  p.momentum = 0; p.overloadTimer = 0; p.hp = p.maxHp; b.hp = 1e13; b.stagger = 0; b.state = 'idle';
  const a = b.facingAngle + (side === 'back' ? Math.PI : 0);
  const sx = b.x + Math.cos(a) * 115, sy = b.y + Math.sin(a) * 115 * 0.6;
  const cid = p.classId || 'breaker';
  const order = ({ breaker: ['f', 'w', 's', 'q', 'a'], hammer: window.__broken ? ['z', 'r', 'f', 'e', 'q', 'a'] : ['r', 'f', 'e', 'q', 'a'], reaper: ['r', 'w', 'e', 'q', 'f', 's', 'd'], arclight: ['z', 'r', 'f', 'w', 'e', 'q', 's'], unbound: ['z', 'f', 'e', 'r', 'w', 'q', 'd'] })[cid];
  g.camera.screenToWorld = function () { return { x: b.x, y: b.y }; };
  let seq = 'R'; const log = window.__log = { r: 0, f: 0, x: 0, maxBonks: 0, maxStage: 0, maxOver: 0 };
  window.__sim = true; let start = null, t = 0, nextRefresh = 0; const dt = 1 / 60, total = secs + 2;
  while (t < total) {
    for (let i = 0; i < 120 && t < total; i++, t += dt) {
      p.hIframes = 10; p.hp = p.maxHp; b.stagger = 0; p.x = sx; p.y = sy; p.targetX = sx; p.targetY = sy;
      if (window.__hack === 'overload' && cid === 'hammer') {
        p.overloadTimer = 8;                                       // always in Overload...
        if (t >= nextRefresh) { p.cds.r = 0; p.cds.f = 0; nextRefresh = t + 8; }   // ...and every recast refreshes R and F
        p.momentum = 300;
      }
      if (window.__broken) { b.brokenStacks = 3; b.brokenTimer = 10; b.brokenLockout = 0; }   // boss always carries 3 Broken stacks
      if (start === null && t >= 2) start = b.hp;
      if (window.__hack === 'cycle' && cid === 'hammer') {
        // Scripted Gravebreaker loop: R held to FULL overcharge -> F pressed as fast as allowed (12 bonks with 3 Broken) -> [X] Overload -> repeat. No Shatter.
        p.momentum = 300;
        const act = p.act;
        if (!act) {
          if (seq === 'R') { p.triggerSkill('r', b.x, b.y, b); seq = 'F'; log.r++; }
          else if (seq === 'F') { p.triggerSkill('f', b.x, b.y, b); seq = 'X'; log.f++; }
          else if (seq === 'X') { p.triggerSkill('x', b.x, b.y, b); seq = 'R'; log.x++; }
        } else if (act.kind === 'f') { p.triggerSkill('f', b.x, b.y, b); log.maxBonks = Math.max(log.maxBonks, act.k); }
        else if (act.kind === 'r' && act.phase === 'charge') { log.maxStage = Math.max(log.maxStage, act.stage); log.maxOver = Math.max(log.maxOver, act.over); }
      } else {
        if (cid === 'hammer' && p.act && p.act.kind === 'r' && p.act.t > 0.9 && !p.act.released) p.releaseSkill('r');
        if (!p.act && p.canAct && p.canAct()) { let done = false; for (const k of order) { if (p.triggerSkill(k, b.x, b.y, b)) { done = true; break; } } if (!done) p.triggerBasicAttack(b.x, b.y); }
        else if (!p.act) p.triggerBasicAttack(b.x, b.y);
      }
      g.__origUpdate.call(g, dt);
      // equalise the R charge animation: Overload doubles the charge speed, cancel it so the animation lasts the same either way
      if (window.__hack === 'cycle' && cid === 'hammer' && p.act && p.act.kind === 'r' && p.act.phase === 'charge' && p.overloadTimer > 0) p.act.charge -= dt;
    }
    await new Promise(r => setTimeout(r, 0));
  }
  window.__sim = false;
  return Math.round((start - b.hp) / secs);
};
