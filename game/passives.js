// =========================================================================
// PASSIVES.JS — what the accessories do. (Their recipes live in crafting_vindictus.js; the player gets a `passives` map from
// forge.applyEquipmentToPlayer, so a passive is just "if (player.passives.x) ...". Wearing the same passive twice does NOT stack.)
//
//   ember_signet     mechanic clears give a 15% extra shield                      -> difficulty.js (the shield grant)
//   wrathstone       class gauge fills 20% faster (Overpower / Momentum / Blood / Solar Charge)   -> here
//   keepers_ring     Eclipse Seal cores have a 50% chance to hold 2 Seals         -> crafting_vindictus.js (rollBurstLoot)
//   quarry_ring      +20% break damage (the part-break gain of your hits)         -> here (boss receiveDamage)
//   finishers_ring   +12% damage while the boss is under 35% HP                   -> here (outDmgMult)
//   adrenaline_band  each skill cast = a stack (max 6, 7s): +2% dmg each, +10% crit at 6   -> here
//   warding_torc     10% less damage taken while a shield is up                   -> here
//   breakpoint       +12% stagger damage on your hits                             -> here
//   second_wind      once per fight a lethal hit leaves you at 1 HP and untouchable for 2.5s   -> here
//   shatterpoint     boss staggered: 8s of +10% damage and +10% cooldown recovery -> here
//   gilders_charm    gold cores pay 50% more                                      -> cores.js (collect)
//   menders_sigil    a boss part breaking heals you 10% of max HP                 -> here
//   fortunes_eye     +25% accessory drop chance, +2.5% Essence chance per core    -> crafting_vindictus.js (rollBurstLoot)
// =========================================================================
(function () {
  const has = (p, id) => !!(p && p.passives && p.passives[id]);
  const ADR_MAX = 6, ADR_TIME = 7, SHATTER_TIME = 8, SW_INVULN = 2.5;

  // ---- class gauge: Wrathstone (every class has one) ----
  if (typeof BreakerPlayer25D !== 'undefined') {
    const oOver = BreakerPlayer25D.prototype.addOverpower;
    if (oOver) BreakerPlayer25D.prototype.addOverpower = function (amount) { return oOver.call(this, has(this, 'wrathstone') ? amount * 1.2 : amount); };
  }
  if (typeof HammerPlayer25D !== 'undefined') {
    const oMom = HammerPlayer25D.prototype.addMomentum;
    if (oMom) HammerPlayer25D.prototype.addMomentum = function (v) { return oMom.call(this, has(this, 'wrathstone') ? v * 1.2 : v); };
  }
  if (typeof ReaperPlayer25D !== 'undefined') {
    const oBlood = ReaperPlayer25D.prototype.gainBlood;
    if (oBlood) ReaperPlayer25D.prototype.gainBlood = function (v) { return oBlood.call(this, (v > 0 && has(this, 'wrathstone')) ? v * 1.2 : v); };
  }
  if (typeof ArclightPlayer25D !== 'undefined') {
    const oHeat = ArclightPlayer25D.prototype.addHeat;
    if (oHeat) ArclightPlayer25D.prototype.addHeat = function (v) { return oHeat.call(this, (v > 0 && has(this, 'wrathstone')) ? v * 1.2 : v); };
  }

  if (typeof UnboundPlayer25D !== 'undefined') {
    const oRes = UnboundPlayer25D.prototype.addRestraint;
    if (oRes) UnboundPlayer25D.prototype.addRestraint = function (v, s) { return oRes.call(this, (v > 0 && has(this, 'wrathstone')) ? v * 1.2 : v, s); };
  }

  const popText = (p, txt, col) => { if (window.fx) window.fx.addFloatingText(p.x, p.y - 84, txt, col, 13); };
  function healLocal(frac) {
    const g = window.game, p = g && g.localPlayer;
    if (!p || p.hp <= 0) return;
    const add = Math.round(p.maxHp * frac);
    p.hp = Math.min(p.maxHp, p.hp + add);
    popText(p, '+' + add, '#86efac');
  }

  if (typeof BreakerPlayer25D !== 'undefined') {
    const B = BreakerPlayer25D.prototype;

    // ---- damage taken: Warding Torc and Second Wind Locket ----
    const oTake = B.takeDamage;
    B.takeDamage = function (raw, src, opts) {
      const lethal = !!(opts && opts.forceLethal);
      if (this.isLocal && this.swInvuln > 0 && !lethal) return;                     // Second Wind: untouchable window
      // not for the instant-wipe mechanics (those are handled by difficulty.js)
      if (this.isLocal && has(this, 'warding_torc') && this.shield > 0 && raw < 50000 && !lethal) raw = raw * 0.9;
      const wasAlive = this.hp > 0;
      const r = oTake.call(this, raw, src, opts);
      if (this.isLocal && wasAlive && this.hp <= 0 && !lethal && raw < 50000 && has(this, 'second_wind')) {
        const boss = window.game && window.game.boss;
        if (this._swBoss !== boss) {                                                // once per fight
          this._swBoss = boss;
          this.hp = 1; if (this.state === 'dead') this.state = 'idle';
          this.stateTimer = 0; this.jumpZ = 0;
          this.swInvuln = SW_INVULN; this.hIframes = Math.max(this.hIframes || 0, SW_INVULN);
          popText(this, 'SECOND WIND', '#4ade80');
          if (window.fx) window.fx.addShockwave(this.x, this.y, 140, '#4ade80', 5, 0.5);
        }
      }
      return r;
    };

    // ---- outgoing damage and crit from conditional / timed passives (read by dealHitToBoss) ----
    B.outDmgMult = function (boss) {
      if (!this.passives) return 1;
      let m = 1;
      if (this.passives.finishers_ring && boss && boss.maxHp > 0 && boss.hp / boss.maxHp < 0.35) m *= 1.12;
      if (this.passives.adrenaline_band && this.adrStacks > 0) m *= 1 + 0.02 * this.adrStacks;
      if (this.passives.shatterpoint && this.shatterT > 0) m *= 1.10;
      return m;
    };
    B.passiveCrit = function () { return (this.passives && this.passives.adrenaline_band && this.adrStacks >= ADR_MAX) ? 0.10 : 0; };

    // timers (counted once per frame whatever the class: a subclass calling super must not tick twice)
    const tickWrap = (P) => {
      const o = P.prototype._updateInternal;
      if (!o) return;
      P.prototype._updateInternal = function (dt, ...rest) {
        if (this._ptick) return o.call(this, dt, ...rest);
        this._ptick = true;
        try {
          if (this.isLocal && dt > 0) {
            if (this.adrT > 0) { this.adrT -= dt; if (this.adrT <= 0) { this.adrT = 0; this.adrStacks = 0; } }
            if (this.shatterT > 0) this.shatterT = Math.max(0, this.shatterT - dt);
            if (this.swInvuln > 0) this.swInvuln = Math.max(0, this.swInvuln - dt);
            this.tempCdr = (this.shatterT > 0 && has(this, 'shatterpoint')) ? 0.10 : 0;
          }
          return o.call(this, dt, ...rest);
        } finally { this._ptick = false; }
      };
    };

    // ---- Adrenaline Band: every skill you start (its cooldown starts) is a stack ----
    const castWrap = (P) => {
      const o = P.prototype.triggerSkill;
      if (!o) return;
      P.prototype.triggerSkill = function (key, ...rest) {
        if (!this.isLocal || !has(this, 'adrenaline_band') || typeof key !== 'string') return o.call(this, key, ...rest);
        const k = key.toLowerCase(), before = (this.cds && this.cds[k]) || 0;
        const res = o.call(this, key, ...rest);
        if (res && 'qwerasdf'.includes(k) && this.cds && (this.cds[k] || 0) > before + 0.2) {
          const was = this.adrStacks || 0;
          this.adrStacks = Math.min(ADR_MAX, was + 1);
          this.adrT = ADR_TIME;
          if (this.adrStacks === ADR_MAX && was < ADR_MAX) popText(this, 'ADRENALINE MAX', '#22d3ee');
        }
        return res;
      };
    };
    for (const P of [BreakerPlayer25D, window.HammerPlayer25D, window.ReaperPlayer25D, window.ArclightPlayer25D, window.UnboundPlayer25D]) if (P) { tickWrap(P); castWrap(P); }
  }

  // ---- the boss side: break damage, stagger, part breaks, staggers ----
  if (typeof VaelgorRaidBoss !== 'undefined') {
    const BP = VaelgorRaidBoss.prototype;
    const oHit = BP.receiveDamage;
    BP.receiveDamage = function (dmg, staggerAmt, attacker, hitOpts) {
      if (attacker && attacker.isLocal) {
        if (has(attacker, 'breakpoint') && staggerAmt > 0) staggerAmt = staggerAmt * 1.12;
        if (has(attacker, 'quarry_ring') && hitOpts) {             // Quarry Ring: +20% break damage
          const base = hitOpts.partBreakMult !== undefined ? hitOpts.partBreakMult : (hitOpts.isStrongMove ? 1 : 0);
          if (base > 0) hitOpts = Object.assign({}, hitOpts, { partBreakMult: base * 1.2 });
        }
      }
      return oHit.call(this, dmg, staggerAmt, attacker, hitOpts);
    };

    const oBreak = BP.breakPauldron;                                // Mender's Sigil: a boss part breaks
    if (oBreak) BP.breakPauldron = function (side, fromNetwork) {
      const was = side === 'left' ? this.leftPauldronBroken : this.rightPauldronBroken;
      const r = oBreak.apply(this, arguments);
      const now = side === 'left' ? this.leftPauldronBroken : this.rightPauldronBroken;
      if (!was && now && has(window.game && window.game.localPlayer, 'menders_sigil')) healLocal(0.10);
      return r;
    };

    const oStag = BP.enterStaggerState;                             // Shatterpoint Pendant: the boss is staggered
    if (oStag) BP.enterStaggerState = function (bannerText) {
      const r = oStag.apply(this, arguments);
      const me = window.game && window.game.localPlayer;
      if (bannerText !== '@none' && has(me, 'shatterpoint') && me.hp > 0) { me.shatterT = SHATTER_TIME; popText(me, 'SHATTERPOINT', '#e879f9'); }
      return r;
    };
  }
})();
