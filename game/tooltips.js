// =========================================================================
// TOOLTIPS.JS — one in-game tooltip for the forge: materials, currencies and the gear on offer.
// Put data-tip="mat:vaelgor_essence" or data-tip="rec:<recipe id>" on any element; hovering shows the card.
// Every card ends with "Where to obtain".
// =========================================================================
(function () {
  const MATS = {
    gold: { name: 'Gold', tone: '#e8c46a', ico: 'gold', desc: 'The coin of the Chalice. Spent on forging, enhancing, rerolling and upgrades.',
      where: ['Vaelgor clears: a flat purse on victory (Hard pays more)', 'Gold and Gilded cores in the loot'] },
    vaelgor_seal: { name: 'Eclipse Seal', tone: '#6fa8cf', ico: 'seal', desc: 'A token of the Black Sun. Five of them can be traded to Fergus for an Abyssal Essence.',
      where: ['Vaelgor on Hard: one guaranteed per clear', 'Vaelgor on Normal: a chance per clear', 'Trade 5 at the Seal Exchange for an Abyssal Essence'] },
    vaelgor_essence: { name: 'Abyssal Essence', tone: '#e08a3c', ico: 'essence', desc: 'The key material for boss gear and for the highest enhancements and Legendary upgrades.',
      where: ['Rare drop from Vaelgor (a pillar of light marks it)', 'Trade 5 Eclipse Seals at the Seal Exchange'] },
    obsidian_shard: { name: 'Obsidian Shard', tone: '#9a948a', ico: 'shard', desc: 'Jagged glass from Vaelgor\'s armour. The everyday forging and enhancing material.',
      where: ['Common drop from Vaelgor'] },
    pauldron_fragment: { name: 'Pauldron Fragment', tone: '#84a78f', ico: 'fragment', desc: 'A piece of the pauldron Vaelgor loses mid-fight. Needed for mythic gear, rerolls and higher enhancements.',
      where: ['Uncommon drop from Vaelgor', 'Breaking his pauldrons helps the drop'] },
    porcelain_shard: { name: 'Porcelain Shard', tone: '#c7d2fe', ico: 'porcelain', desc: 'A chip of glazed white porcelain with a blue painted edge. The everyday material for the Lullaby arms.',
      where: ['Common drop from Hush (solo raid)'] },
    lullaby_thread: { name: 'Lullaby Thread', tone: '#f472b6', ico: 'thread', desc: 'A spool of rose thread that never quite stops humming. Needed for the Lullaby arms.',
      where: ['Hush on Hard: one guaranteed per clear', 'Hush on Normal: a chance per clear', 'Breaking her key or her mask helps the drop'] },
    music_box_heart: { name: 'Music-Box Heart', tone: '#f5c542', ico: 'heart', desc: 'The tiny brass works of a music box, still turning. The key material for the Tier 4 Lullaby arms.',
      where: ['Rare drop from Hush (a pillar of light marks it)'] }
  };
  const esc = (x) => String(x == null ? '' : x).replace(/[<>&"]/g, '');
  const rows = (arr) => arr.map(w => `<li>${esc(w)}</li>`).join('');
  const where = (arr) => `<div class="tp-where"><b>Where to obtain</b><ul>${rows(arr)}</ul></div>`;

  function matCard(k) {
    const m = MATS[k]; if (!m) return '';
    const g = window.game, have = g && g.forge ? (k === 'gold' ? g.forge.state.gold : (g.forge.state.materials[k] || 0)) : 0;
    return `<div class="tp-head"><img class="mat-ico" src="game/icons/mat_${m.ico}.png" alt=""><div><b style="color:${m.tone}">${m.name}</b><i>Material · you have ${have.toLocaleString()}</i></div></div>
      <p>${m.desc}</p>${where(m.where)}`;
  }

  function recCard(id) {
    const r = (window.VINDICTUS_RECIPES || []).find(x => x.id === id); if (!r) return '';
    const acc = r.slot === 'ring' || r.slot === 'necklace' || r.slot === 'charm';
    const stats = r.slot === 'weapon'
      ? [`ATK ${r.baseAtk}`, `Crit +${Math.round((r.critBonus || 0) * 100)}%`, `Speed +${Math.round((r.atkSpeedBonus || 0) * 100)}%`]
      : (r.slot === 'armor' ? [`HP +${r.bonusHp}`, `DEF +${r.bonusDef}`] : []);
    const need = Object.entries(r.materials || {}).map(([k, v]) => `${(MATS[k] || { name: k }).name} x${v}`);
    const src = ['Forged at Fergus\'s Forge (this window)', 'Needs: ' + need.join(', ') + ' and ' + (r.costGold || 0).toLocaleString() + ' gold'];
    if (r.consumes) src.push('Forged from your ' + ((window.VINDICTUS_RECIPES || []).find(x => x.id === r.consumes) || { name: 'Tier 3 weapon' }).name + ', which is used up (a third of its enhancement carries over)');
    src.push('The materials drop from ' + (r.source ? r.source.replace(/ drops$/, '') : 'Vaelgor') + ' (hover them in the bar above)');
    return `<div class="tp-head"><div><b>${esc(r.name)}</b><i>${esc(r.tier || '')}</i></div></div>
      ${stats.length ? `<div class="tp-stats">${stats.map(s => `<span>${s}</span>`).join('')}</div>` : ''}
      ${acc ? `<p class="tp-pass">Passive <small>(the same passive worn twice does not stack)</small></p>` : ''}
      <p class="tp-flavor">${esc(r.desc || '')}</p>${where(src)}`;
  }

  let el = null;
  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'tip-pop';
    document.body.appendChild(el);
    return el;
  }
  function html(spec) {
    const i = (spec || '').indexOf(':'); if (i < 0) return '';
    const kind = spec.slice(0, i), key = spec.slice(i + 1);
    return kind === 'mat' ? matCard(key) : kind === 'rec' ? recCard(key) : '';
  }
  function place(e) {
    const t = ensure(), pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    const w = t.offsetWidth, h = t.offsetHeight;
    if (x + w > innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > innerHeight - 8) y = innerHeight - h - 8;
    t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
  }
  document.addEventListener('mouseover', (e) => {
    const n = e.target.closest && e.target.closest('[data-tip]');
    if (!n) return;
    const h = html(n.getAttribute('data-tip'));
    if (!h) return;
    const t = ensure(); t.innerHTML = h; t.classList.add('show'); place(e);
  });
  document.addEventListener('mousemove', (e) => { if (el && el.classList.contains('show')) place(e); });
  document.addEventListener('mouseout', (e) => {
    const n = e.target.closest && e.target.closest('[data-tip]');
    if (n && el) el.classList.remove('show');
  });
  document.addEventListener('click', () => { if (el) el.classList.remove('show'); }, true);

  window.Tips = { html, MATS };
})();
