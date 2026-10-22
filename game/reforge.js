// =========================================================================
// REFORGE.JS — the forge's gold-and-material sinks.
//
//   ENHANCE  weapons and armor, +1 to +15. +1-5 never fail, +6-10 can fail (nothing lost but the cost), +11-15 are long shots, and
//            from +13 up a failure also costs a level. Each failed try at +6 or higher adds a little to the next try (pity).
//            Weapon: +2.5% ATK per level. Armor: +3% max health and +3% defense per level.
//   REROLL   Legendary accessories only. Each of the 4 lines can be rerolled 5 times on its own, and the whole piece can be
//            rerolled 5 times (locking lines is free). So a bad line can take up to 10 tries.
//   UPGRADE  3 accessories of the same slot and rarity become 1 random accessory of that slot, one rarity higher.
// =========================================================================
(function () {
  if (typeof VindictusForgeSystem === 'undefined') return;
  const F = VindictusForgeSystem.prototype;
  const A = () => window.Accessories;
  const isAcc = (s) => s === 'ring' || s === 'necklace' || s === 'charm';

  const MAX_ENH = 15, WEAPON_PER = 0.025, ARMOR_PER = 0.03;
  const RATE = [0, 1, 1, 1, 1, 1, 0.80, 0.70, 0.60, 0.50, 0.40, 0.10, 0.08, 0.06, 0.04, 0.03];
  const PITY_STEP = 0.04, PITY_CAP = 0.20, PITY_GUARANTEE = 10;   // every failure adds 4% (up to +20%); after 10 straight failures the next try always works
  // weapons also gain crit rate and attack speed from +6: slowly at first, then faster and faster from +10 (percent points, cumulative)
  const ENH_CRIT = [0, 0, 0, 0, 0, 0, 0.5, 1, 1.5, 2, 3, 4.5, 6.5, 9, 12, 16];
  // armor from +6: damage taken is cut a little, and you get up from a knockdown (and can wake-up roll again) sooner
  const ENH_DR = [0, 0, 0, 0, 0, 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6.5, 8, 10];
  const ENH_WAKE = [0, 0, 0, 0, 0, 0, 2, 4, 6, 8, 12, 16, 21, 27, 34, 40];
  const ENH_SPEED = [0, 0, 0, 0, 0, 0, 0.5, 1, 1.5, 2, 3, 4, 5.5, 7.5, 10, 13];
  const LINE_REROLLS = 5, FULL_REROLLS = 5;
  const REROLL_LINE = { gold: 2000, obsidian_shard: 3 };
  const REROLL_FULL = { gold: 5000, pauldron_fragment: 4 };
  const UPGRADE_COST = { uncommon: { gold: 1500 }, rare: { gold: 3500 }, epic: { gold: 8000 }, legendary: { gold: 20000, vaelgor_essence: 1 } };

  // what going from level L-1 to L costs
  function enhCost(L) {
    const c = {};
    c.gold = L <= 5 ? 100 * L : (L <= 10 ? 800 + 300 * (L - 6) : 2000 + 600 * (L - 11));
    c.obsidian_shard = L <= 5 ? L : (L <= 10 ? 6 + 2 * (L - 6) : 10);
    if (L >= 6) c.pauldron_fragment = L <= 10 ? 1 + Math.floor((L - 6) / 2) : 3 + (L - 11);
    if (L >= 13) c.vaelgor_essence = L - 12;
    return c;
  }
  const enhRate = (item) => { const L = (item.enh || 0) + 1; if (L >= 6 && (item.pity || 0) >= PITY_GUARANTEE) return 1; return Math.min(1, RATE[L] + (L >= 6 ? Math.min(PITY_CAP, (item.pity || 0) * PITY_STEP) : 0)); };
  const NAMES = { gold: 'Gold', obsidian_shard: 'Obsidian Shard', pauldron_fragment: 'Pauldron Fragment', vaelgor_essence: 'Abyssal Essence', vaelgor_seal: 'Eclipse Seal' };

  function canPay(f, cost) { for (const [k, v] of Object.entries(cost)) { const have = k === 'gold' ? f.state.gold : (f.state.materials[k] || 0); if (have < v) return false; } return true; }
  function pay(f, cost) { for (const [k, v] of Object.entries(cost)) { if (k === 'gold') f.state.gold -= v; else f.state.materials[k] -= v; } }
  const sfx = (ok) => { try { audio.playForgeAnvil(ok); } catch (e) {} };

  F.enhCost = (L) => enhCost(L);
  F.enhanceItem = function (uid) {
    const it = this.state.inventory.find(i => i.uid === uid);
    if (!it || (it.slot !== 'weapon' && it.slot !== 'armor')) return { ok: false, msg: 'That cannot be enhanced.' };
    if ((it.enh || 0) >= MAX_ENH) return { ok: false, msg: 'Already at +' + MAX_ENH + '.' };
    const L = (it.enh || 0) + 1, cost = enhCost(L);
    if (!canPay(this, cost)) { sfx(false); return { ok: false, msg: 'Not enough gold or materials.' }; }
    pay(this, cost);
    const rate = enhRate(it);
    if (Math.random() < rate) {
      it.enh = L; it.pity = 0; this.save(); sfx(true);
      return { ok: true, success: true, msg: `${it.name} is now +${L}.` };
    }
    it.pity = (it.pity || 0) + 1;
    let msg = `The enhancement to +${L} failed.`;
    if (L >= 13) { it.enh = Math.max(10, it.enh - 1); msg += ` ${it.name} dropped to +${it.enh}.`; }
    else if (L >= 6) msg += ' Nothing was lost but the materials; the next try is a little more likely.';
    this.save(); sfx(false);
    return { ok: true, success: false, msg };
  };

  // ---- rerolls (Legendary accessories) ----
  function initReroll(it) { if (!it.rrLeft) { it.rrLeft = (it.lines || []).map(() => LINE_REROLLS); it.fullLeft = FULL_REROLLS; } }
  F.rerollLine = function (uid, idx) {
    const it = this.state.inventory.find(i => i.uid === uid);
    if (!it || !isAcc(it.slot) || it.rarity !== 'legendary') return { ok: false, msg: 'Only Legendary accessories can be rerolled.' };
    initReroll(it);
    if (!(it.rrLeft[idx] > 0)) return { ok: false, msg: 'No rerolls left on that line.' };
    if (!canPay(this, REROLL_LINE)) { sfx(false); return { ok: false, msg: 'Not enough gold or materials.' }; }
    pay(this, REROLL_LINE);
    const old = it.lines[idx]; it.lines[idx] = A().rollLine(); it.rrLeft[idx]--;
    this.save(); sfx(true);
    return { ok: true, msg: `${A().lineText(old)}  ➔  ${A().lineText(it.lines[idx])}` };
  };
  F.rerollAll = function (uid, locks) {
    const it = this.state.inventory.find(i => i.uid === uid);
    if (!it || !isAcc(it.slot) || it.rarity !== 'legendary') return { ok: false, msg: 'Only Legendary accessories can be rerolled.' };
    initReroll(it);
    if (!(it.fullLeft > 0)) return { ok: false, msg: 'No full rerolls left.' };
    const open = it.lines.map((l, i) => i).filter(i => !(locks && locks[i]));
    if (!open.length) return { ok: false, msg: 'Every line is locked.' };
    if (!canPay(this, REROLL_FULL)) { sfx(false); return { ok: false, msg: 'Not enough gold or materials.' }; }
    pay(this, REROLL_FULL);
    for (const i of open) it.lines[i] = A().rollLine();
    it.fullLeft--;
    this.save(); sfx(true);
    return { ok: true, msg: `Rerolled ${open.length} line${open.length === 1 ? '' : 's'}.` };
  };

  // ---- rarity upgrade ----
  F.upgradeAccessories = function (uids) {
    const items = (uids || []).map(u => this.state.inventory.find(i => i.uid === u));
    if (items.length !== 3 || items.some(i => !i || !isAcc(i.slot))) return { ok: false, msg: 'Pick three accessories.' };
    const slot = items[0].slot, rar = items[0].rarity || 'common';
    if (items.some(i => i.slot !== slot || (i.rarity || 'common') !== rar)) return { ok: false, msg: 'They must share a slot and a rarity.' };
    const ri = A().RARITY.findIndex(r => r.id === rar);
    if (ri >= A().RARITY.length - 1) return { ok: false, msg: 'Already Legendary.' };
    const next = A().RARITY[ri + 1], cost = UPGRADE_COST[next.id];
    if (!canPay(this, cost)) { sfx(false); return { ok: false, msg: 'Not enough gold or materials.' }; }
    pay(this, cost);
    this.state.inventory = this.state.inventory.filter(i => !uids.includes(i.uid));
    const pool = (window.VINDICTUS_RECIPES || []).filter(r => r.slot === slot);
    const recipe = pool[Math.floor(Math.random() * pool.length)];
    const lines = []; for (let i = 0; i < next.lines; i++) lines.push(A().rollLine());
    const acc = { uid: 'item_' + Date.now() + '_' + Math.floor(Math.random() * 99999), recipeId: recipe.id, slot: recipe.slot, name: recipe.name, tier: recipe.tier, passive: recipe.passive, desc: recipe.desc, color: recipe.color, equipped: false, rarity: next.id, lines };
    this.state.inventory.push(acc);
    this.save(); sfx(true);
    return { ok: true, item: acc, msg: `Three ${A().rarityOf({ rarity: rar }).name} pieces became ${/^[AEIOU]/.test(next.name) ? 'an' : 'a'} ${next.name} ${acc.name}.` };
  };

  // ---- enhancement reaches the player (loaded before accessories.js so its totals add on top) ----
  const oApply = F.applyEquipmentToPlayer;
  F.applyEquipmentToPlayer = function (player) {
    oApply.call(this, player);
    if (!player) return;
    const wpn = this.getEquippedWeapon(player.classId || 'breaker'), arm = this.getEquippedArmor();
    player._enhHaste = 0;
    player.weaponEnh = wpn && wpn.enh ? wpn.enh : 0;
    player.dmgReduction = arm && arm.enh ? ENH_DR[arm.enh] / 100 : 0;
    player.wakeRecovery = arm && arm.enh ? ENH_WAKE[arm.enh] / 100 : 0;
    if (wpn && wpn.enh) {
      player.baseAtk = Math.round(wpn.baseAtk * (1 + WEAPON_PER * wpn.enh));
      player.critRate += ENH_CRIT[wpn.enh] / 100;
      player.atkSpeedMult += ENH_SPEED[wpn.enh] / 100;
      player._enhHaste = ENH_SPEED[wpn.enh] / 100;
    }
    if (arm && arm.enh) {
      player.maxHp = Math.round(player.maxHp * (1 + ARMOR_PER * arm.enh));
      player.bonusDef = Math.round(player.bonusDef * (1 + ARMOR_PER * arm.enh));
      player.hp = Math.min(player.maxHp, player.hp || player.maxHp);
    }
  };

  // ---- UI ----------------------------------------------------------------------------------------------
  const esc = (x) => String(x == null ? '' : x).replace(/[<>&"]/g, '');
  const st = { mode: 'enhance', sel: null, locks: {}, up: [] };
  const costTags = (f, cost) => Object.entries(cost).map(([k, v]) => {
    const have = k === 'gold' ? f.state.gold : (f.state.materials[k] || 0);
    return `<span class="req-tag ${have >= v ? 'ok' : 'missing'}" data-tip="mat:${k}">${k === 'gold' ? '' : ''}${NAMES[k]} ${k === 'gold' ? v.toLocaleString() : have + '/' + v}</span>`;
  }).join('');
  const label = (it) => esc(it.name) + (it.enh ? ` <b class="enh-plus">+${it.enh}</b>` : '');

  function renderEnhance(g, f) {
    const cls = g.playerClass || 'breaker';
    const items = f.state.inventory.filter(i => (i.slot === 'weapon' && (i.classId || 'breaker') === cls) || i.slot === 'armor');
    return items.map(it => {
      const L = (it.enh || 0) + 1, maxed = (it.enh || 0) >= MAX_ENH;
      const cost = maxed ? {} : enhCost(L), rate = maxed ? 0 : enhRate(it);
      const per = it.slot === 'weapon' ? WEAPON_PER : ARMOR_PER;
      const e0 = it.enh || 0;
      const eff = it.slot === 'weapon' ? `ATK ${Math.round(it.baseAtk * (1 + per * e0))}${maxed ? '' : ' ➔ ' + Math.round(it.baseAtk * (1 + per * L))}` +
          ((L >= 6 || e0 >= 6) ? ` · Crit +${ENH_CRIT[e0]}%${maxed ? '' : ' ➔ +' + ENH_CRIT[L] + '%'} · Speed +${ENH_SPEED[e0]}%${maxed ? '' : ' ➔ +' + ENH_SPEED[L] + '%'}` : '')
        : `HP/DEF +${Math.round(per * 100 * e0)}%${maxed ? '' : ' ➔ +' + Math.round(per * 100 * L) + '%'}` +
          ((L >= 6 || e0 >= 6) ? ` · Dmg taken -${ENH_DR[e0]}%${maxed ? '' : ' ➔ -' + ENH_DR[L] + '%'} · Get-up time -${ENH_WAKE[e0]}%${maxed ? '' : ' ➔ -' + ENH_WAKE[L] + '%'}` : '');
      const pct = (rate >= 1 && L >= 6) ? 'Guaranteed' : (Math.round(rate * 1000) / 10) + '%';
      const risk = L >= 13 ? 'A failure also costs a level.' : (L >= 6 ? 'A failure costs only the materials.' : 'Cannot fail.');
      return `<div class="recipe-card ${it.equipped ? 't2' : ''}">
        <div class="recipe-top"><div class="recipe-icon">${it.slot === 'weapon' ? '🗡️' : '🛡️'}</div>
        <div class="recipe-titles"><div class="recipe-name">${label(it)}</div><div class="recipe-tier">${esc(it.tier || '')}${it.equipped ? ' · equipped' : ''}</div></div></div>
        <div class="recipe-stats"><span>${eff}</span>${maxed ? '<span>MAX</span>' : `<span class="rf-rate">+${L}: ${pct}</span>`}</div>
        ${maxed ? '' : `<div class="recipe-desc">${risk}${(it.pity || 0) && L >= 6 ? ` Pity +${Math.round(Math.min(PITY_CAP, it.pity * PITY_STEP) * 100)}% (${it.pity}/${PITY_GUARANTEE} tries to a guaranteed success).` : ''}</div><div class="recipe-reqs">${costTags(f, cost)}</div>`}
        <button class="forge-craft-btn ${maxed || !canPay(f, cost) ? 'disabled' : ''}" onclick="Reforge.act('enhance','${it.uid}')">${maxed ? 'Maxed' : 'Enhance to +' + L}</button></div>`;
    }).join('') || '<div class="redeem-note">Nothing to enhance.</div>';
  }

  function renderReroll(g, f) {
    const legs = f.state.inventory.filter(i => isAcc(i.slot) && i.rarity === 'legendary');
    if (!legs.length) return '<div class="redeem-note rf-empty">Only Legendary accessories can be rerolled. Forge or upgrade one first.</div>';
    if (!st.sel || !legs.some(i => i.uid === st.sel)) { st.sel = legs[0].uid; st.locks = {}; }
    const it = legs.find(i => i.uid === st.sel); initReroll(it);
    const R = A().rarityOf(it);
    const pick = legs.map(l => `<div class="rf-pick ${l.uid === st.sel ? 'on' : ''}" onclick="Reforge.pick('${l.uid}')"><img class="acc-ico sm" src="${A().icon(l.slot, 'legendary')}" alt=""><span>${esc(l.name)}</span></div>`).join('');
    const rows = it.lines.map((l, i) => {
      const left = it.rrLeft[i], q = A().quality(l);
      return `<div class="rf-line"><label class="rf-lock"><input type="checkbox" ${st.locks[i] ? 'checked' : ''} onchange="Reforge.lock(${i},this.checked)"><span>Lock</span></label>
        <span class="rf-ltxt" style="color:${q > 0.75 ? '#fdba74' : q < 0.25 ? '#9ca3af' : '#e8dcc0'}">${A().lineText(l)}</span>
        <button class="rf-btn ${left > 0 && canPay(f, REROLL_LINE) ? '' : 'disabled'}" onclick="Reforge.act('line','${it.uid}',${i})">Reroll <small>${left}/${LINE_REROLLS}</small></button></div>`;
    }).join('');
    const openN = it.lines.filter((l, i) => !st.locks[i]).length;
    return `<div class="rf-picks">${pick}</div>
      <div class="recipe-card rf-detail" style="--rc:${R.color}">
        <div class="recipe-top"><div class="recipe-icon"><img class="acc-ico" src="${A().icon(it.slot, 'legendary')}" alt=""></div>
        <div class="recipe-titles"><div class="recipe-name" style="color:${R.color}">${esc(it.name)}</div><div class="recipe-tier">Legendary ${esc(it.slot)}</div></div></div>
        <div class="rf-lines">${rows}</div>
        <div class="recipe-desc">Line reroll: ${costTags(f, REROLL_LINE)}</div>
        <button class="forge-craft-btn ${it.fullLeft > 0 && openN > 0 && canPay(f, REROLL_FULL) ? '' : 'disabled'}" onclick="Reforge.act('all','${it.uid}')">Reroll ${openN} unlocked line${openN === 1 ? '' : 's'} <small>(${it.fullLeft}/${FULL_REROLLS} left)</small></button>
        <div class="recipe-reqs">${costTags(f, REROLL_FULL)}</div></div>`;
  }

  function renderUpgrade(g, f) {
    const accs = f.state.inventory.filter(i => isAcc(i.slot));
    const first = accs.find(i => i.uid === st.up[0]);
    st.up = st.up.filter(u => accs.some(i => i.uid === u));
    const sel = st.up.map(u => accs.find(i => i.uid === u));
    const slot = sel[0] && sel[0].slot, rar = sel[0] && (sel[0].rarity || 'common');
    const ri = rar ? A().RARITY.findIndex(r => r.id === rar) : -1;
    const next = ri >= 0 && ri < 4 ? A().RARITY[ri + 1] : null;
    const cost = next ? UPGRADE_COST[next.id] : null;
    const grid = accs.map(i => {
      const R = A().rarityOf(i), on = st.up.includes(i.uid);
      const ok = !sel.length || (i.slot === slot && (i.rarity || 'common') === rar);
      return `<div class="rf-tile ${on ? 'on' : ''} ${ok ? '' : 'dim'}" style="--rc:${R.color}" onclick="Reforge.up('${i.uid}')" title="${esc(i.name)} (${R.name})${i.equipped ? ' — worn' : ''}"><img src="${A().icon(i.slot, R.id)}" alt=""><small>${esc(i.name)}</small>${i.equipped ? '<u></u>' : ''}</div>`;
    }).join('') || '<div class="redeem-note">You have no accessories yet.</div>';
    const ready = sel.length === 3 && next && canPay(f, cost);
    return `<div class="redeem-note rf-help">Pick three accessories of the same slot and rarity. They become one random ${slot ? esc(slot) : 'accessory'} of the next rarity${next ? ' (<b style="color:' + next.color + '">' + next.name + '</b>)' : ''}.</div>
      <div class="rf-grid">${grid}</div>
      <div class="rf-uprow"><span>${sel.length}/3 chosen</span>${cost ? costTags(f, cost) : ''}
      <button class="forge-craft-btn ${ready ? '' : 'disabled'}" onclick="Reforge.act('upgrade')">Upgrade${next ? ' to ' + next.name : ''}</button></div>`;
  }

  const Reforge = {
    PITY: { STEP: PITY_STEP, CAP: PITY_CAP, GUARANTEE: PITY_GUARANTEE }, NAMES,
    ENH: { MAX: MAX_ENH, RATE, WEAPON_PER, ARMOR_PER, CRIT: ENH_CRIT, SPEED: ENH_SPEED, DR: ENH_DR, WAKE: ENH_WAKE }, label, enhRate, enhCost,
    render(g, el) {
      const f = g.forge;
      const modes = [['reroll', 'Reroll'], ['upgrade', 'Upgrade']];
      if (st.mode === 'enhance') st.mode = 'reroll';   // enhancing lives in the Enhancement hub now (enhance_hub.js)
      const body = st.mode === 'reroll' ? renderReroll(g, f) : renderUpgrade(g, f);
      el.innerHTML = `<div class="rf-modes">${modes.map(([k, n]) => `<button class="${st.mode === k ? 'on' : ''}" onclick="Reforge.mode('${k}')">${n}</button>`).join('')}</div>${body}`;
    },
    mode(m) { st.mode = m; refresh(); },
    pick(uid) { st.sel = uid; st.locks = {}; refresh(); },
    lock(i, v) { st.locks[i] = !!v; refresh(); },
    up(uid) { const k = st.up.indexOf(uid); if (k >= 0) st.up.splice(k, 1); else { const f = window.game.forge, it = f.state.inventory.find(i => i.uid === uid), first = f.state.inventory.find(i => i.uid === st.up[0]); if (first && (first.slot !== it.slot || (first.rarity || 'common') !== (it.rarity || 'common'))) st.up = []; if (st.up.length < 3) st.up.push(uid); } refresh(); },
    act(kind, uid, idx) {
      const f = window.game.forge; let r;
      if (kind === 'enhance') r = f.enhanceItem(uid);
      else if (kind === 'line') r = f.rerollLine(uid, idx);
      else if (kind === 'all') r = f.rerollAll(uid, st.locks);
      else if (kind === 'upgrade') { r = f.upgradeAccessories(st.up.slice()); if (r.ok) st.up = []; }
      if (r) window.game.setForgeFeedback(r.msg, r.ok && r.success !== false);
      window.game.updateAllUI();
    }
  };
  function refresh() { if (window.game) window.game.renderForgeModal(); }
  window.Reforge = Reforge;
})();
