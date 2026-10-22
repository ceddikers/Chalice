// =========================================================================
// ACCESSORIES.JS — rarities and rolled stat lines for rings, necklaces and charms.
//
//   Every accessory keeps its passive (see passives.js) and also rolls a rarity when it is forged:
//     Common      0 stat lines      Rare       2 stat lines      Legendary  4 stat lines
//     Uncommon    1 stat line       Epic       3 stat lines
//   Each line picks a stat by weight (HP / DEF / ATK are the common duds, crit and attack speed the good ones) and rolls its own
//   value inside that stat's range. Lines may repeat; every one rolls separately.
//
// Items: { rarity, lines: [{ id, v }] }. Items forged before this existed count as Common with no lines.
// =========================================================================
(function () {
  const RARITY = [
    { id: 'common',    name: 'Common',    lines: 0, color: '#9ca3af', w: 38 },
    { id: 'uncommon',  name: 'Uncommon',  lines: 1, color: '#4ade80', w: 29 },
    { id: 'rare',      name: 'Rare',      lines: 2, color: '#60a5fa', w: 20 },
    { id: 'epic',      name: 'Epic',      lines: 3, color: '#c084fc', w: 10 },
    { id: 'legendary', name: 'Legendary', lines: 4, color: '#fb923c', w: 3 }
  ];
  // kind 'n' = whole number, 'p' = percent (stored as a fraction). cap = most a character can get from accessories in total.
  const STATS = {
    hp:      { label: 'Max health',      w: 20, min: 120, max: 320, kind: 'n' },
    def:     { label: 'Defense',         w: 20, min: 10,  max: 28,  kind: 'n' },
    atk:     { label: 'Attack',          w: 20, min: 6,   max: 16,  kind: 'n' },
    crit:    { label: 'Crit rate',       w: 10, min: 0.015, max: 0.04, kind: 'p', cap: 0.30 },
    critdmg: { label: 'Crit damage',     w: 10, min: 0.04,  max: 0.10, kind: 'p', cap: 0.60 },
    haste:   { label: 'Attack speed',    w: 10, min: 0.015, max: 0.04, kind: 'p', cap: 0.25 },
    stagger: { label: 'Stagger power',   w: 4,  min: 0.04,  max: 0.10, kind: 'p', cap: 0.40 },
    cdr:     { label: 'Cooldown recovery', w: 3, min: 0.03, max: 0.07, kind: 'p', cap: 0.25 },
    gauge:   { label: 'Gauge gain',      w: 3,  min: 0.05,  max: 0.12, kind: 'p', cap: 0.40 }
  };
  const PITY_AT = 6;   // forges in a row without an Epic or better; the next one is a guaranteed Epic

  const wpick = (arr) => { let t = 0; for (const x of arr) t += x.w; let r = Math.random() * t; for (const x of arr) { r -= x.w; if (r <= 0) return x; } return arr[arr.length - 1]; };
  const rarityOf = (it) => RARITY.find(r => r.id === (it && it.rarity)) || RARITY[0];

  function rollLine() {
    const ids = Object.keys(STATS);
    const id = wpick(ids.map(k => ({ k, w: STATS[k].w }))).k;
    const S = STATS[id];
    let v = S.min + Math.random() * (S.max - S.min);
    v = S.kind === 'n' ? Math.round(v) : Math.round(v * 1000) / 1000;
    return { id, v };
  }
  function rollItem(pity) {
    let r = (pity >= PITY_AT) ? RARITY[3] : wpick(RARITY);
    const lines = [];
    for (let i = 0; i < r.lines; i++) lines.push(rollLine());
    return { rarity: r.id, lines };
  }
  // A dropped accessory (from Vaelgor's death burst) never rolls Common. Table: Uncommon 45, Rare 30, Epic 20, Legendary 5.
  const DROP_TABLE = [['uncommon', 45], ['rare', 30], ['epic', 20], ['legendary', 5]];
  function rollDrop() {
    let r = Math.random() * 100, id = 'uncommon';
    for (const [rid, w] of DROP_TABLE) { r -= w; if (r <= 0) { id = rid; break; } }
    const R = RARITY.find(x => x.id === id);
    const lines = [];
    for (let i = 0; i < R.lines; i++) lines.push(rollLine());
    return { rarity: id, lines };
  }
  const fmt = (l) => { const S = STATS[l.id]; return S ? (S.kind === 'n' ? '+' + l.v : '+' + (Math.round(l.v * 1000) / 10) + '%') : ''; };
  const lineText = (l) => (STATS[l.id] ? `${fmt(l)} ${STATS[l.id].label}` : '');
  // how good a roll is, 0-1 (for colouring)
  const quality = (l) => { const S = STATS[l.id]; return S ? (l.v - S.min) / ((S.max - S.min) || 1) : 0; };

  function totals(items) {
    const T = { hp: 0, def: 0, atk: 0, crit: 0, critdmg: 0, haste: 0, stagger: 0, cdr: 0, gauge: 0 };
    for (const it of items || []) for (const l of (it.lines || [])) if (l && l.id in T) T[l.id] += l.v;
    for (const k in T) { const c = STATS[k].cap; if (c != null) T[k] = Math.min(c, T[k]); }
    return T;
  }
  const icon = (slot, rarity) => `game/icons/acc_${slot}_${rarity || 'common'}.png`;

  window.Accessories = { RARITY, STATS, rarityOf, rollItem, rollLine, rollDrop, DROP_TABLE, fmt, lineText, quality, totals, icon, PITY_AT };

  // ---- the forge --------------------------------------------------------------------------------
  if (typeof VindictusForgeSystem !== 'undefined') {
    const F = VindictusForgeSystem.prototype;
    const isAcc = (s) => s === 'ring' || s === 'necklace' || s === 'charm';

    // forging an accessory rolls it; you can own several of the same one now
    const oCraft = F.craftRecipe;
    F.craftRecipe = function (recipeId) {
      const recipe = (window.VINDICTUS_RECIPES || []).find(r => r.id === recipeId);
      if (!recipe || !isAcc(recipe.slot)) return oCraft.call(this, recipeId);
      if (!this.canCraftRecipe(recipe)) { try { audio.playForgeAnvil(false); } catch (e) {} return { ok: false, msg: 'Insufficient Boss Materials or Gold!' }; }
      this.state.gold -= recipe.costGold;
      for (const [m, n] of Object.entries(recipe.materials)) this.state.materials[m] -= n;
      const pity = this.state.accPity || 0;
      const roll = rollItem(pity);
      const R = rarityOf(roll);
      this.state.accPity = (roll.rarity === 'epic' || roll.rarity === 'legendary') ? 0 : pity + 1;
      const acc = {
        uid: 'item_' + Date.now() + '_' + Math.floor(Math.random() * 99999), recipeId: recipe.id, slot: recipe.slot, name: recipe.name,
        tier: recipe.tier, passive: recipe.passive, desc: recipe.desc, color: recipe.color, equipped: false, rarity: roll.rarity, lines: roll.lines
      };
      this.state.inventory.push(acc);
      this.equipItem(acc.uid);
      try { audio.playForgeAnvil(true); } catch (e) {}
      return { ok: true, item: acc, msg: `Forged ${/^[AEIOU]/i.test(R.name) ? 'an' : 'a'} ${R.name} ${acc.name}${roll.lines.length ? ': ' + roll.lines.map(lineText).join(', ') : ''}.` };
    };

    // the stats reach the player: undo last time's contribution, let the base apply, add the new totals
    const oApply = F.applyEquipmentToPlayer;
    F.applyEquipmentToPlayer = function (player) {
      if (!player) return;
      // pieces you already own always show their recipe's current name and passive text (passives get reworked now and then)
      for (const it of this.state.inventory) {
        if (!isAcc(it.slot)) continue;
        const rc = (window.VINDICTUS_RECIPES || []).find(r => r.id === it.recipeId);
        if (rc) { it.desc = rc.desc; it.name = rc.name; it.tier = rc.tier; it.color = rc.color; it.passive = rc.passive; }
      }
      const oldMax = player.maxHp, oldHp = player.hp;
      const prev = player._acc;
      if (prev) {
        player.bonusAtk = (player.bonusAtk || 0) - prev.atk; player.maxHp -= prev.hp; player.bonusDef -= prev.def;
        player.critRate -= prev.crit; player.atkSpeedMult -= prev.haste;
      }
      oApply.call(this, player);
      const T = totals(this.getEquippedAccessories());
      player._acc = T;
      player.bonusAtk = (player.bonusAtk || 0) + T.atk;
      player.maxHp += T.hp;
      // a Max health line heals you for what it adds (taking it off only trims you down to the new maximum)
      const gained = (oldMax > 0 && oldHp > 0) ? Math.max(0, player.maxHp - oldMax) : 0;
      player.hp = Math.min(player.maxHp, (oldHp > 0 ? oldHp : player.maxHp) + gained);
      player.bonusDef += T.def;
      player.critRate += T.crit;
      player.atkSpeedMult += T.haste;
      player.critDmgBonus = T.critdmg; player.haste = T.haste + (player._enhHaste || 0); player.cdrBonus = T.cdr;
      player.staggerPow = T.stagger; player.gaugeGain = T.gauge;
    };
  }

  // ---- combat hooks ---------------------------------------------------------------------------------
  // Attack speed also quickens skills (not the sword combo, which already uses atkSpeedMult, and never parries, dodges or cinematics).
  // Cooldown recovery is applied to the cooldown tick inside breaker_25d.js; attack speed adds half of itself there too.
  function hasteScale(P, test) {
    const o = P.prototype._updateInternal;
    P.prototype._updateInternal = function (dt, ...rest) {
      const h = this.haste || 0;
      if (h > 0 && !this._hs && dt > 0 && test(this)) {
        this._rawDt = dt; this._hs = true;
        try { return o.call(this, dt * (1 + h), ...rest); } finally { this._hs = false; this._rawDt = undefined; }
      }
      return o.call(this, dt, ...rest);
    };
  }
  if (typeof BreakerPlayer25D !== 'undefined') {
    hasteScale(BreakerPlayer25D, (p) => !(p instanceof (window.HammerPlayer25D || Object)) && !(p instanceof (window.ReaperPlayer25D || Object)) && !(p instanceof (window.ArclightPlayer25D || Object)) && !(p instanceof (window.UnboundPlayer25D || Object)) && !/^(idle|walk|dead|hit_|wakeup|space_dash|e_bulwark|t_|clash|combo)/.test(p.state || 'idle'));
    const oOver = BreakerPlayer25D.prototype.addOverpower;
    BreakerPlayer25D.prototype.addOverpower = function (amount) { return oOver.call(this, amount * (1 + (this.gaugeGain || 0))); };
  }
  if (typeof HammerPlayer25D !== 'undefined') {
    hasteScale(HammerPlayer25D, (p) => !!p.act && p.act.kind !== 'd' && p.act.kind !== 't');
    const oMom = HammerPlayer25D.prototype.addMomentum;
    if (oMom) HammerPlayer25D.prototype.addMomentum = function (v) { return oMom.call(this, v * (1 + (this.gaugeGain || 0))); };
  }
  if (typeof ReaperPlayer25D !== 'undefined') {
    hasteScale(ReaperPlayer25D, (p) => !!p.act && p.act.kind !== 'd' && p.act.kind !== 't' && p.act.kind !== 'tv' && p.act.kind !== 'z');
    const oBlood = ReaperPlayer25D.prototype.gainBlood;     // gauge gain works for every class: the Reaper's gauge is the blood sphere
    if (oBlood) ReaperPlayer25D.prototype.gainBlood = function (v) { return oBlood.call(this, v > 0 ? v * (1 + (this.gaugeGain || 0)) : v); };
  }
  if (typeof ArclightPlayer25D !== 'undefined') {
    hasteScale(ArclightPlayer25D, (p) => !!p.act && p.act.kind !== 'd' && p.act.kind !== 't' && p.act.kind !== 'z');
    const oHeat = ArclightPlayer25D.prototype.addHeat;      // ...and the Arclight's is the Solar Charge
    if (oHeat) ArclightPlayer25D.prototype.addHeat = function (v) { return oHeat.call(this, v > 0 ? v * (1 + (this.gaugeGain || 0)) : v); };
  }
  if (typeof UnboundPlayer25D !== 'undefined') {
    hasteScale(UnboundPlayer25D, (p) => !!p.act && p.act.kind !== 'd' && p.act.kind !== 't' && p.act.kind !== 'z');
    const oRes = UnboundPlayer25D.prototype.addRestraint;   // ...and the Unbound's is Restraint
    if (oRes) UnboundPlayer25D.prototype.addRestraint = function (v, s) { return oRes.call(this, v > 0 ? v * (1 + (this.gaugeGain || 0)) : v, s); };
  }
  if (typeof VaelgorRaidBoss !== 'undefined') {
    const oHit = VaelgorRaidBoss.prototype.receiveDamage;
    VaelgorRaidBoss.prototype.receiveDamage = function (dmg, staggerAmt, attacker, hitOpts) {
      if (attacker && attacker.isLocal && attacker.staggerPow && staggerAmt > 0) staggerAmt = staggerAmt * (1 + attacker.staggerPow);
      return oHit.call(this, dmg, staggerAmt, attacker, hitOpts);
    };
  }
})();
