// =========================================================================
// ARMORY.JS — the character screen (I key, or the Armory button).
//   centre   a close-up of your warden, wearing what is equipped, in his everyday stance; drag to turn him
//   left     who they are: class, clears, colours, the materials they carry (+ what this run added)
//   right    the numbers: attack, crit, speed, health, defense — hover a spare item to see what it would change
//   bottom   the bag: weapons (for this class), armor, accessories and cosmetics you own, as slots; click to wear or take off
//   sides    the equipped weapon and armor, and the accessory slots: 2 rings, a necklace, a charm and wings (cosmetic)
// Crafting stays at the forge; this is where you look at yourself and change what you wear (in the hub).
// =========================================================================
(function () {
  if (typeof Game25D === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BAG_SLOTS = 24;
  let el = null, cv = null, c2 = null, timer = null, clone = null, cloneKey = '', yaw = 0, drag = null, lastT = 0, tipEl = null;

  const ICON = {
    sword: '<path d="M14 3l7 0 0 7-9 9-3-3z"/><path d="M9 16l-4 4M5 12l3 3M12 19l-3-3"/>',
    hammer: '<path d="M13 3l8 8-3 3-8-8zM11 9L3 17l4 4 8-8"/>',
    scythe: '<path d="M5 21L17 5"/><path d="M17 5c3-1 5 0 5 3-2-1-4-1-6 1z"/><circle cx="4" cy="21" r="1.5"/>',
    cuffs: '<rect x="3" y="8" width="8" height="9" rx="2"/><rect x="13" y="8" width="8" height="9" rx="2"/><path d="M5 11l2 2-1 2M15 11l2 2-1 2"/>',
    saber: '<path d="M6 20l3-3"/><path d="M8 18l9-12 2-2 1 1-2 2-12 9z"/><path d="M5 21l3-3"/>',
    armor: '<path d="M12 3l7 3v5.5c0 4.6-3 7.7-7 9.5-4-1.8-7-4.9-7-9.5V6z"/><path d="M12 7v10M8.5 10.5h7"/>',
    ring: '<ellipse cx="12" cy="14.5" rx="6" ry="5.5"/><path d="M9.5 7.5L12 4l2.5 3.5L12 10z"/>',
    necklace: '<path d="M5 5c0 8 3 11 7 11s7-3 7-11"/><path d="M12 16l-2.6 3.2L12 22l2.6-2.8z"/>',
    charm: '<path d="M12 3l5 6-5 12-5-12z"/><path d="M7 9h10"/>',
    wings: '<path d="M12 6c-2 4-5 5-9 5 1 4 5 6 9 3 4 3 8 1 9-3-4 0-7-1-9-5z"/><path d="M12 6v8"/>',
    lock: '<rect x="6" y="11" width="12" height="9"/><path d="M9 11V8.2a3 3 0 0 1 6 0V11"/>',
    gold: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/>',
    seal: '<circle cx="12" cy="9.5" r="5.5"/><path d="M8.6 14l-1.6 7 5-2.6 5 2.6-1.6-7"/>',
    shard: '<path d="M12 3l5.5 6.5L12 21 6.5 9.5z"/><path d="M6.5 9.5h11"/>',
    fragment: '<path d="M12 3l7 3v5.5c0 4.6-3 7.7-7 9.5-4-1.8-7-4.9-7-9.5V6z"/><path d="M12 7.5v9"/>',
    essence: '<circle cx="12" cy="12" r="3.8"/><ellipse cx="12" cy="12" rx="9" ry="3.4" transform="rotate(-28 12 12)"/>',
    mobile: '<path d="M4 6h16M12 2v4M6 6v5M18 6v4M12 6v8"/><path d="M8 12.5a2 2 0 1 1-2-2 1.6 1.6 0 0 0 2 2z"/><circle cx="18" cy="12" r="1.6"/><path d="M12 15l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 17.3l2-.3z"/>'
  };
  const MATIMG = { gold: 'gold', seal: 'seal', shard: 'shard', fragment: 'fragment', essence: 'essence', wings: 'wings', porcelain: 'porcelain', thread: 'thread', heart: 'heart', mobile: 'mobile' };
  const matImg = (k) => `<img class="mat-ico" src="game/icons/mat_${MATIMG[k]}.png" alt="">`;
  const svg = (k, color) => MATIMG[k] ? matImg(k) : `<svg viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ''}</svg>`;
  // plain outline icon (an empty wings slot must not show the painted drop icon)
  const lineSvg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ''}</svg>`;
  const MATS = [['gold', 'Gold'], ['vaelgor_seal', 'Eclipse Seal', 'seal'], ['obsidian_shard', 'Obsidian Shard', 'shard'], ['pauldron_fragment', 'Pauldron Fragment', 'fragment'], ['vaelgor_essence', 'Abyssal Essence', 'essence'], ['porcelain_shard', 'Porcelain Shard', 'porcelain'], ['lullaby_thread', 'Lullaby Thread', 'thread'], ['music_box_heart', 'Music-Box Heart', 'heart']];
  const TONE = { 1: '#8f887b', 2: '#d0536a', 3: '#9b84e0', 4: '#e2b23a' };
  const ACC = { ring: 'Ring', necklace: 'Necklace', charm: 'Charm' };
  const isAcc = (it) => !!it && (it.slot === 'ring' || it.slot === 'necklace' || it.slot === 'charm');
  const tierOf = (it) => { const m = /Tier\s*(\d)/i.exec(it.tier || ''); return m ? +m[1] : 1; };
  const g = () => window.game;

  // ---- numbers ---------------------------------------------------------------------------
  function statsOf(weapon, armor) {
    const T = (window.Accessories && g()) ? window.Accessories.totals(g().forge.getEquippedAccessories()) : { atk: 0, crit: 0, haste: 0, hp: 0, def: 0, critdmg: 0, stagger: 0, cdr: 0, gauge: 0 };
    return {
      atk: (weapon ? Math.round((weapon.baseAtk || 0) * (1 + 0.025 * (weapon.enh || 0))) : 0) + T.atk,
      crit: Math.round(20 + (weapon ? (weapon.critBonus || 0) * 100 : 0) + T.crit * 100 + ((window.Reforge && weapon) ? window.Reforge.ENH.CRIT[weapon.enh || 0] : 0)),
      spd: Math.round((weapon ? (weapon.atkSpeedBonus || 0) * 100 : 0) + T.haste * 100 + ((window.Reforge && weapon) ? window.Reforge.ENH.SPEED[weapon.enh || 0] : 0)),
      hp: Math.round((2000 + (armor ? (armor.bonusHp || 0) : 0)) * (1 + 0.03 * (armor ? armor.enh || 0 : 0))) + T.hp,
      def: Math.round((armor ? (armor.bonusDef || 60) : 0) * (1 + 0.03 * (armor ? armor.enh || 0 : 0))) + T.def,
      dr: (window.Reforge && armor) ? window.Reforge.ENH.DR[armor.enh || 0] : 0, wake: (window.Reforge && armor) ? window.Reforge.ENH.WAKE[armor.enh || 0] : 0,
      critdmg: Math.round(T.critdmg * 100), stagger: Math.round(T.stagger * 100), cdr: Math.round(T.cdr * 100), gauge: Math.round(T.gauge * 100)
    };
  }
  function equippedPair() {
    const f = g().forge;
    return { weapon: f.getEquippedWeapon(g().playerClass), armor: f.getEquippedArmor() };
  }
  function bagItems() {
    const f = g().forge, cls = g().playerClass;
    const order = { weapon: 0, armor: 1, ring: 2, necklace: 3, charm: 4 };
    return f.state.inventory.filter(it => it.slot !== 'weapon' || (it.classId || 'breaker') === cls)
      .sort((a, b) => (order[a.slot] - order[b.slot]) || (tierOf(b) - tierOf(a)) || (window.Accessories ? (window.Accessories.RARITY.findIndex(r => r.id === window.Accessories.rarityOf(b).id) - window.Accessories.RARITY.findIndex(r => r.id === window.Accessories.rarityOf(a).id)) : 0));
  }
  // cosmetic wings: Eclipse Wings (Vaelgor, very rare) and Pyre Wings (Ignis Hard, very rare)
  const WINGS = {
    eclipse_wings: { uid: 'wings:eclipse', name: 'Eclipse Wings', tier: 'Cosmetic', desc: 'Dark feathers edged in your accent colour.', color: '#fb923c' },
    pyre_wings: { uid: 'wings:pyre', name: 'Pyre Wings', tier: 'Cosmetic', desc: 'Wings of living flame from the Gilded Pyre.', color: '#f97316' },
    moon_mobile: { uid: 'wings:mobile', name: 'Moon Mobile', tier: 'Cosmetic', desc: 'A little mobile of moons and stars that turns above your head. From the Sealed Nursery (Hard).', color: '#fde68a', ico: 'mobile' }
  };
  const wingsByUid = (uid) => Object.keys(WINGS).find(k => WINGS[k].uid === uid) || null;
  const cosm = () => g().forge.state.cosmetics || {};
  const ownedWings = () => Object.keys(WINGS).filter(k => cosm().owned && cosm().owned[k]);
  const wornWings = () => (WINGS[cosm().wings] ? cosm().wings : null);

  // the five accessory slots: ring, ring, necklace, charm, wings
  function accSlots() {
    const w = g().forge.getEquippedAccessories();
    const rings = w.filter(a => a.slot === 'ring');
    return [
      { kind: 'ring', item: rings[0] || null }, { kind: 'ring', item: rings[1] || null },
      { kind: 'necklace', item: w.find(a => a.slot === 'necklace') || null },
      { kind: 'charm', item: w.find(a => a.slot === 'charm') || null },
      { kind: 'wings', item: wornWings() ? WINGS[wornWings()] : null }
    ];
  }

  // ---- DOM -------------------------------------------------------------------------------
  function build() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'armory-modal';
    el.className = 'modal-window armory-window hidden';
    el.innerHTML = `
      <div class="modal-hdr">
        <div class="hdr-title"><div><div class="vr-kicker" id="ar-class"></div><h2 id="ar-name"></h2></div></div>
        <button class="close-btn" onclick="window.game.closeAllModals()" title="Close (Esc)">×</button>
      </div>
      <div class="ar-main">
        <aside class="ar-left" id="ar-left"></aside>
        <section class="ar-stage">
          <div class="ar-slots left" id="ar-eq"></div>
          <div class="ar-model"><canvas id="ar-canvas" width="360" height="460"></canvas><div class="ar-hint">Drag to turn</div></div>
          <div class="ar-slots right" id="ar-acc"></div>
        </section>
        <aside class="ar-right" id="ar-right"></aside>
      </div>
      <div class="ar-bag-head"><div class="section-label">Armory <small id="ar-bag-note">click a piece to wear it</small></div></div>
      <div class="ar-bag" id="ar-bag"></div>
      <div class="coop-row vr-actions"><button class="nav-btn" id="ar-customize">Customize look</button><button class="nav-btn amber" id="ar-forge">Open the Forge</button></div>`;
    document.body.appendChild(el);
    tipEl = document.createElement('div'); tipEl.id = 'ar-tip'; tipEl.className = 'hidden'; document.body.appendChild(tipEl);
    cv = $('ar-canvas'); c2 = cv.getContext('2d');

    $('ar-forge').addEventListener('click', () => { if (g().mode !== 'hub') { if (window.QoL) window.QoL.toast('The forge is in the hub'); return; } g().openModal('forge-modal'); });
    $('ar-customize').addEventListener('click', () => {
      if (g().mode !== 'hub') { if (window.QoL) window.QoL.toast('Change your look in the hub'); return; }
      const id = g().character && g().character.id;
      if (!id || !window.CharSelect || !window.CharSelect.edit) return;
      g().closeAllModals(); window.CharSelect.edit(id);
    });
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y0: yaw }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (drag) yaw = drag.y0 + (e.clientX - drag.x) * 0.012; });
    const end = () => { drag = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-uid],[data-take]');
      if (t) wear(t.dataset.take || t.dataset.uid);
    });
    el.addEventListener('pointermove', (e) => {
      const t = e.target.closest('[data-uid],[data-acc]');
      if (!t) { hideTip(); return; }
      showTip(t, e.clientX, e.clientY);
    });
    el.addEventListener('pointerleave', hideTip);
    new MutationObserver(() => {
      if (el.classList.contains('hidden')) { clearInterval(timer); timer = null; hideTip(); }
      else { yaw = 0; cloneKey = ''; paint(); if (!timer) { lastT = performance.now(); timer = setInterval(frame, 33); } }
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  function hideTip() { if (tipEl) tipEl.classList.add('hidden'); if (el && g() && !el.classList.contains('hidden')) highlightDelta(null); }

  function statLine(label, v, suffix, delta) {
    const d = delta ? `<em class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}${suffix}</em>` : '';
    return `<div class="ar-stat"><span>${label}</span><b>${v}${suffix}</b>${d}</div>`;
  }
  function itemStatsText(it) {
    return [it.baseAtk ? `ATK ${it.baseAtk}` : '', it.critBonus ? `CRIT +${Math.round(it.critBonus * 100)}%` : '', it.atkSpeedBonus ? `SPEED +${Math.round(it.atkSpeedBonus * 100)}%` : '', it.bonusHp ? `HP +${it.bonusHp}` : '', it.bonusDef ? `DEF +${it.bonusDef}` : ''].filter(Boolean).join(' · ');
  }
  function placeTip(x, y) {
    tipEl.classList.remove('hidden');
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = Math.min(window.innerWidth - w - 8, x + 16) + 'px';
    tipEl.style.top = Math.min(window.innerHeight - h - 8, y + 16) + 'px';
  }
  function accCard(a, worn, canChange) {
    const A = window.Accessories, R = (A && a.slot) ? A.rarityOf(a) : null;
    if (R) {
      const lines = (a.lines || []).map(l => `<span>${esc(A.STATS[l.id].label)}<em style="color:${R.color}">${A.fmt(l)}</em></span>`).join('');
      return `<b style="color:${R.color}">${esc(a.name)}</b><div class="ar-tip-rar" style="color:${R.color}">${R.name} ${esc(a.slot)}</div>` +
        (lines ? `<div class="ar-tip-lines">${lines}</div>` : '<small>No stat lines</small>') +
        `<div class="ar-tip-pass"><b style="color:${a.color || '#b39565'}">Passive</b> ${esc(a.desc || '')}</div>` +
        (worn ? '<small class="ok">Worn · click to take off</small>' : `<small>${canChange ? 'Click to wear' : 'Change gear in the hub'}</small>`);
    }
    return `<b style="color:${a.color || '#b39565'}">${esc(a.name)}</b><small>${esc(a.tier || '')}</small><div class="tt-stats">${esc(a.desc || '')}</div>` +
      (worn ? '<small class="ok">Worn · click to take off</small>' : `<small>${canChange ? 'Click to wear' : 'Change gear in the hub'}</small>`);
  }

  function showTip(t, x, y) {
    const f = g().forge, inHub = g().mode === 'hub';
    if (t.dataset.acc != null) {
      const s = accSlots()[+t.dataset.acc];
      if (s.item) tipEl.innerHTML = accCard(s.item, true, inHub);
      else tipEl.innerHTML = `<b>${s.kind === 'wings' ? 'Wings' : ACC[s.kind]} slot</b><small>${s.kind === 'wings' ? 'Cosmetic. Wings drop very rarely from raid bosses.' : 'Craft ' + ACC[s.kind].toLowerCase() + 's at the forge. Each one has its own passive.'}</small>`;
      placeTip(x, y); return;
    }
    if (wingsByUid(t.dataset.uid)) {
      const id = wingsByUid(t.dataset.uid), W = WINGS[id];
      tipEl.innerHTML = accCard({ name: W.name, tier: 'Cosmetic · Wings', desc: W.desc, color: W.color }, wornWings() === id, inHub);
      placeTip(x, y); return;
    }
    const it = f.state.inventory.find(i => i.uid === t.dataset.uid);
    if (!it) return;
    if (isAcc(it)) { tipEl.innerHTML = accCard(it, !!it.equipped, inHub); placeTip(x, y); return; }
    const eq = equippedPair();
    const cur = it.slot === 'weapon' ? eq.weapon : eq.armor;
    const same = cur && cur.uid === it.uid;
    tipEl.innerHTML = `<b style="color:${TONE[tierOf(it)]}">${esc(it.name)}${it.enh ? ' +' + it.enh : ''}</b><small>${esc(it.tier || '')}</small><div class="tt-stats">${esc(itemStatsText(it)) || 'No bonuses'}</div>` +
      (same ? '<small class="ok">Worn</small>' : (inHub ? '<small>Click to wear</small>' : '<small>Change gear in the hub</small>'));
    highlightDelta(same ? null : it);
    placeTip(x, y);
  }

  // the right-hand stat panel previews the swap while a spare item is hovered
  let lastDeltaUid = '';
  function highlightDelta(it) {
    const key = it ? it.uid : '';
    if (key === lastDeltaUid && $('ar-right').innerHTML) return;
    lastDeltaUid = key;
    const eq = equippedPair();
    const cur = statsOf(eq.weapon, eq.armor);
    let nxt = cur;
    if (it) nxt = it.slot === 'weapon' ? statsOf(it, eq.armor) : statsOf(eq.weapon, it);
    const pass = g().forge.getEquippedAccessories();
    $('ar-right').innerHTML = `
      <div class="section-label">Stats</div>
      ${statLine('Attack', cur.atk, '', nxt.atk - cur.atk)}
      ${statLine('Crit rate', cur.crit, '%', nxt.crit - cur.crit)}
      ${statLine('Attack speed', (cur.spd >= 0 ? '+' : '') + cur.spd, '%', nxt.spd - cur.spd)}
      ${statLine('Max health', cur.hp.toLocaleString('en-US'), '', nxt.hp - cur.hp)}
      ${statLine('Defense', cur.def, '', nxt.def - cur.def)}
      ${cur.dr ? statLine('Damage taken', '-' + cur.dr, '%', 0) : ''}
      ${cur.wake ? statLine('Get-up time', '-' + cur.wake, '%', 0) : ''}
      ${cur.critdmg ? statLine('Crit damage', '+' + cur.critdmg, '%', 0) : ''}
      ${cur.stagger ? statLine('Stagger power', '+' + cur.stagger, '%', 0) : ''}
      ${cur.cdr ? statLine('Cooldown recovery', '+' + cur.cdr, '%', 0) : ''}
      ${cur.gauge ? statLine('Gauge gain', '+' + cur.gauge, '%', 0) : ''}
      <div class="section-label">Wearing</div>
      <div class="ar-worn"><span>${esc(eq.weapon ? eq.weapon.name : 'Nothing')}</span><span>${esc(eq.armor ? eq.armor.name : 'Nothing')}</span></div>
      <div class="section-label">Passives <small style="opacity:.6;font-weight:500">(the same passive twice does not stack)</small></div>
      <div class="ar-pass">${pass.length ? pass.map(a => `<div><b style="color:${a.color || '#b39565'}">${esc(a.name)}</b><span>${esc(a.desc || '')}</span></div>`).join('') : '<span class="none">None yet. Craft accessories at the forge.</span>'}</div>
      <div class="ar-pending">${it ? 'Hover shows the change if you wear ' + esc(it.name) : ''}</div>`;
  }

  function slotHtml(it, kind, big) {
    if (!it) return `<div class="ar-slot empty ${big ? 'big' : ''}" title="${kind}"><i>${svg(kind === 'Weapon' ? (g().playerClass === 'unbound' ? 'cuffs' : g().playerClass === 'arclight' ? 'saber' : g().playerClass === 'reaper' ? 'scythe' : g().playerClass === 'hammer' ? 'hammer' : 'sword') : 'armor')}</i><small>${kind}</small></div>`;
    const t = tierOf(it), acc = isAcc(it);
    const ico = acc ? it.slot : (it.slot === 'armor' ? 'armor' : (it.classId === 'unbound' ? 'cuffs' : it.classId === 'arclight' ? 'saber' : it.classId === 'reaper' ? 'scythe' : it.classId === 'hammer' ? 'hammer' : 'sword'));
    const col = acc ? (it.color || '#b39565') : (it.slot === 'armor' ? (it.trimColor || '#b39565') : (it.weaponColor || '#b39565'));
    if (acc && window.Accessories) {
      const R = window.Accessories.rarityOf(it);
      return `<div class="ar-slot acc-bag ${it.equipped ? 'worn' : ''}" data-uid="${it.uid}" style="--tone:${R.color}"><img src="${window.Accessories.icon(it.slot, R.id)}" alt="">${it.equipped ? '<u></u>' : ''}</div>`;
    }
    return `<div class="ar-slot ${big ? 'big' : ''} ${it.equipped ? 'worn' : ''}" data-uid="${it.uid}" style="--tone:${acc ? col : TONE[t]}">${window.GearIcons && window.GearIcons.src(it) ? `<img class="ar-gear-ico" src="${window.GearIcons.src(it)}" alt="">` : `<i style="color:${col}">${svg(ico, col)}</i>`}<span class="ar-tier">${acc ? '' : (t >= 4 ? 'IV' : 'I'.repeat(t))}</span>${it.equipped ? '<u></u>' : ''}</div>`;
  }
  function wingsBagSlot(id) {
    const W = WINGS[id], on = wornWings() === id;
    return `<div class="ar-slot ${on ? 'worn' : ''}" data-uid="${W.uid}" style="--tone:${W.color}"><i style="color:${W.color}">${svg(W.ico || 'wings', W.color)}</i>${on ? '<u></u>' : ''}</div>`;
  }

  function paint() {
    const G = g(); if (!G || !el) return;
    const f = G.forge, st = f.state, p = G.localPlayer, c = G.character || {};
    const cls = G.playerClass === 'unbound' ? 'Unbound' : G.playerClass === 'arclight' ? 'Arclight' : G.playerClass === 'reaper' ? 'Reaper' : (G.playerClass === 'hammer' ? 'Gravebreaker' : 'Breaker');
    $('ar-class').textContent = cls.toUpperCase();
    $('ar-name').textContent = p.name || c.name || 'Warden';
    const done = st.cleared || {};
    const gain = (window.Cores && window.Cores.tally) || {};
    const inRaid = G.mode === 'raid';
    const mats = MATS.map(([k, name, ico]) => {
      const have = k === 'gold' ? (st.gold || 0) : ((st.materials || {})[k] || 0);
      const add = inRaid ? (gain[k] || 0) : 0;
      return `<div class="ar-mat"><i>${svg(ico || k)}</i><span>${name}</span><b>${have.toLocaleString('en-US')}</b>${add ? `<em>+${add}</em>` : ''}</div>`;
    }).join('');
    const look = p.look || {};
    const sw = ['cloth', 'accent', 'skin', 'hair'].filter(k => look[k]).map(k => `<i style="background:${look[k]}" title="${k}"></i>`).join('');
    $('ar-left').innerHTML = `
      <div class="section-label">Warden</div>
      <div class="ar-row"><span>Class</span><b>${cls}</b></div>
      <div class="ar-row"><span>Raids cleared</span><b>${st.clears || 0}</b></div>
      <div class="ar-row"><span>Vaelgor · Normal</span><b class="${done.normal ? 'ok' : ''}">${done.normal ? 'Cleared' : '—'}</b></div>
      <div class="ar-row"><span>Vaelgor · Hard</span><b class="${done.hard ? 'ok' : ''}">${done.hard ? 'Cleared' : '—'}</b></div>
      <div class="ar-row"><span>Ignis · Normal</span><b class="${done.ignis_normal ? 'ok' : ''}">${done.ignis_normal ? 'Cleared' : '—'}</b></div>
      <div class="ar-row"><span>Ignis · Hard</span><b class="${done.ignis_hard ? 'ok' : ''}">${done.ignis_hard ? 'Cleared' : '—'}</b></div>
      <div class="ar-row"><span>Colours</span><div class="ar-sw">${sw}</div></div>
      <div class="section-label">Carrying${inRaid ? ' <small>green = this run</small>' : ''}</div>
      <div class="ar-mats">${mats}</div>`;
    const eq = equippedPair();
    $('ar-eq').innerHTML = slotHtml(eq.weapon, 'Weapon', true) + slotHtml(eq.armor, 'Armor', true);
    $('ar-acc').innerHTML = accSlots().map((s, i) => {
      if (!s.item) return `<div class="ar-slot acc empty" data-acc="${i}"><i>${lineSvg(s.kind)}</i><small>${s.kind === 'wings' ? 'Wings' : ACC[s.kind]}</small></div>`;
      const col = s.item.color || '#b39565';
      if (window.Accessories && s.kind !== 'wings') { const R = window.Accessories.rarityOf(s.item); return `<div class="ar-slot acc worn" data-acc="${i}" data-take="${s.item.uid}" style="--tone:${R.color}"><img src="${window.Accessories.icon(s.kind, R.id)}" alt=""></div>`; }
      return `<div class="ar-slot acc worn" data-acc="${i}" data-take="${s.item.uid}" style="--tone:${col}"><i style="color:${col}">${svg(s.item.ico || s.kind, col)}</i><u></u></div>`;
    }).join('');
    const items = bagItems();
    let bag = items.map(it => slotHtml(it, '', false)).join('');
    let used = items.length;
    for (const id of ownedWings()) { bag += wingsBagSlot(id); used++; }
    for (let i = used; i < BAG_SLOTS; i++) bag += '<div class="ar-slot vacant"></div>';
    $('ar-bag').innerHTML = bag;
    $('ar-bag-note').textContent = inRaid ? 'gear can only be changed in the hub' : 'click a piece to wear it; click an accessory again to take it off';
    el.classList.toggle('in-raid', inRaid);
    lastDeltaUid = '#';
    highlightDelta(null);
  }

  function wear(uid) {
    const G = g(); if (!G || G.mode !== 'hub') { if (window.QoL) window.QoL.toast('Change gear in the hub'); return; }
    const f = G.forge;
    if (wingsByUid(uid)) { const id = wingsByUid(uid); f.equipWings(wornWings() === id ? null : id); }
    else {
      const it = f.state.inventory.find(i => i.uid === uid);
      if (!it) return;
      if (!isAcc(it) && it.equipped) return;            // weapons and armor: you always wear one
      f.equipItem(uid);
    }
    f.applyEquipmentToPlayer(G.localPlayer);
    G.updateAllUI();
    if (G.renderForgeModal) G.renderForgeModal();
    cloneKey = '';
    paint();
  }

  // ---- the close-up ---------------------------------------------------------------------------
  function ensureClone() {
    const G = g(), p = G.localPlayer, eq = equippedPair();
    const key = [G.playerClass, eq.weapon && eq.weapon.uid, eq.armor && eq.armor.uid, wornWings(), JSON.stringify(p.look || {})].join('|');
    if (clone && key === cloneKey) return clone;
    cloneKey = key;
    const Cls = G.playerClass === 'unbound' ? UnboundPlayer25D : G.playerClass === 'arclight' ? ArclightPlayer25D : G.playerClass === 'reaper' ? ReaperPlayer25D : (G.playerClass === 'hammer' ? HammerPlayer25D : BreakerPlayer25D);
    clone = new Cls('armory', '', 0, 0, false, false);
    clone.look = p.look;
    G.forge.applyEquipmentToPlayer(clone);
    clone.noPlate = true;                       // no floating name or health bar over the close-up
    if (clone.snapFeetToBody) clone.snapFeetToBody();
    return clone;
  }

  function frame() {
    const G = g(); if (!G || !c2) return;
    const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const w = cv.width, h = cv.height;
    c2.clearRect(0, 0, w, h);
    const bg = c2.createRadialGradient(w / 2, h * 0.62, 10, w / 2, h * 0.62, h * 0.7);
    bg.addColorStop(0, 'rgba(88, 62, 40, 0.5)'); bg.addColorStop(0.55, 'rgba(32, 22, 36, 0.35)'); bg.addColorStop(1, 'rgba(8, 6, 12, 0)');
    c2.fillStyle = bg; c2.fillRect(0, 0, w, h);
    try {
      const p = ensureClone();
      if (!drag) yaw += dt * 0.35;
      p.facingAngle = Math.PI * 0.5 + Math.sin(yaw) * 0.9;
      p.breathePhase = (p.breathePhase || 0) + dt * 2;
      c2.save();
      c2.translate(w / 2, h * 0.86);
      c2.scale(3.0, 3.0);
      p.draw(c2);
      c2.restore();
    } catch (e) { /* model not ready */ }
    c2.save(); c2.translate(w / 2, h * 0.86 + 6); c2.scale(1, 0.28); c2.strokeStyle = 'rgba(179,149,101,0.5)'; c2.lineWidth = 2;
    c2.beginPath(); c2.arc(0, 0, 92, 0, Math.PI * 2); c2.stroke(); c2.restore();
  }

  function toggle() {
    build();
    if (window.CharSelect && window.CharSelect.isOpen()) return;
    g().toggleModal('armory-modal');
  }

  window.addEventListener('keydown', (e) => {
    if ((e.key !== 'i' && e.key !== 'I') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    toggle();
  });

  function init() {
    build();
    const btn = $('btn-armory');
    if (btn) btn.addEventListener('click', toggle);
    setInterval(() => { if (el && !el.classList.contains('hidden') && g().mode === 'raid') paint(); }, 600);
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else setTimeout(init, 0);
  window.Armory = { toggle, paint };
})();
