// =========================================================================
// INVENTORY.JS — what the character is carrying: materials, gear, and what was picked up this fight.
//   open    I key, or the Inventory button in the dock (works in the hub and in a raid)
// Reads the character's own forge save (game.forge.state); crafting and equipping stay at the forge.
// =========================================================================
(function () {
  if (typeof Game25D === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let el = null, timer = null, lastHtml = '';

  const ICON = {
    gold: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/>',
    vaelgor_seal: '<circle cx="12" cy="9.5" r="5.5"/><path d="M8.6 14l-1.6 7 5-2.6 5 2.6-1.6-7"/>',
    obsidian_shard: '<path d="M12 3l5.5 6.5L12 21 6.5 9.5z"/><path d="M6.5 9.5h11"/>',
    pauldron_fragment: '<path d="M12 3l7 3v5.5c0 4.6-3 7.7-7 9.5-4-1.8-7-4.9-7-9.5V6z"/><path d="M12 7.5v9"/>',
    vaelgor_essence: '<circle cx="12" cy="12" r="3.8"/><ellipse cx="12" cy="12" rx="9" ry="3.4" transform="rotate(-28 12 12)"/>',
    weapon: '<path d="M12 3v13M8 16h8M12 16v5"/>',
    armor: '<path d="M12 3l7 3v5.5c0 4.6-3 7.7-7 9.5-4-1.8-7-4.9-7-9.5V6z"/>'
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ''}</svg>`;
  const MATS = [
    ['gold', 'Gold', 'common', 'Spend it at the forge.'],
    ['vaelgor_seal', 'Eclipse Seal', 'seal', 'Five seals can be exchanged for an Abyssal Essence at the forge.'],
    ['obsidian_shard', 'Obsidian Shard', 'common', 'Forging material.'],
    ['pauldron_fragment', 'Pauldron Fragment', 'uncommon', 'Forging material for the mythic gear.'],
    ['vaelgor_essence', 'Abyssal Essence', 'rare', 'The key material for forging boss gear.']
  ];

  function build() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'inventory-modal';
    el.className = 'modal-window inv-window hidden';
    el.innerHTML = `
      <div class="modal-hdr">
        <div class="hdr-title"><div><div class="vr-kicker" id="inv-who"></div><h2>Inventory</h2></div></div>
        <button class="close-btn" onclick="window.game.closeAllModals()" title="Close (Esc)">×</button>
      </div>
      <div id="inv-body"></div>
      <div class="coop-row vr-actions"><button class="nav-btn amber" id="inv-forge">Open the Forge</button></div>`;
    document.body.appendChild(el);
    $('inv-forge').addEventListener('click', () => {
      const g = window.game;
      if (g.mode !== 'hub') { if (window.QoL) window.QoL.toast('The forge is in the hub'); return; }
      g.openModal('forge-modal');
    });
    new MutationObserver(() => {
      if (el.classList.contains('hidden')) { clearInterval(timer); timer = null; }
      else { paint(true); if (!timer) timer = setInterval(() => paint(false), 400); }
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  function paint(force) {
    const g = window.game;
    if (!el || !g || !g.forge) return;
    const st = g.forge.state, m = st.materials || {};
    const gain = (window.Cores && window.Cores.tally) || {};
    const raid = g.mode === 'raid' || (g.lastClear && window.Cores && window.Cores.victory);
    const tiles = MATS.map(([k, name, tone, tip]) => {
      const have = k === 'gold' ? (st.gold || 0) : (m[k] || 0);
      const add = raid ? (gain[k] || 0) : 0;
      return `<div class="inv-tile ${tone}" title="${esc(tip)}"><div class="iv-ico">${svg(k)}</div><div class="inv-nm">${name}</div><b>${have.toLocaleString('en-US')}</b>${add ? `<em>+${add.toLocaleString('en-US')} this run</em>` : '<em></em>'}</div>`;
    }).join('');
    const cls = g.playerClass;
    const mine = (st.inventory || []).filter(it => it.slot === 'armor' || !it.classId || it.classId === cls);
    const eqW = mine.find(it => it.slot === 'weapon' && it.equipped), eqA = mine.find(it => it.slot === 'armor' && it.equipped);
    const stat = (it) => it ? [it.baseAtk ? `ATK ${it.baseAtk}` : '', it.critBonus ? `CRIT +${Math.round(it.critBonus * 100)}%` : '', it.bonusHp ? `HP +${it.bonusHp}` : '', it.bonusDef ? `DEF +${it.bonusDef}` : ''].filter(Boolean).join(' · ') : '';
    const slot = (label, it, icon) => `<div class="inv-gear"><div class="iv-ico">${it && window.GearIcons && window.GearIcons.src(it) ? `<img class="ar-gear-ico" src="${window.GearIcons.src(it)}" alt="">` : svg(icon)}</div><div><span>${label}</span><b>${it ? esc(it.name) : 'Nothing equipped'}</b><small>${it ? esc(stat(it)) : ''}</small></div></div>`;
    const spare = mine.filter(it => !it.equipped);
    const spareHtml = spare.length ? spare.map(it => `<div class="inv-spare"><b>${esc(it.name)}</b><small>${esc(it.tier || '')}</small></div>`).join('') : '<div class="inv-none">No spare gear</div>';
    const seals = m.vaelgor_seal || 0;
    const html = `
      <div class="section-label">Materials</div>
      <div class="inv-grid">${tiles}</div>
      <div class="inv-seals"><span>Seal exchange</span><div class="inv-bar"><i style="width:${Math.min(100, seals / 5 * 100)}%"></i></div><b>${Math.min(seals, 5)}/5</b></div>
      <div class="section-label">Equipped</div>
      <div class="inv-gearrow">${slot('Weapon', eqW, 'weapon')}${slot('Armor', eqA, 'armor')}</div>
      <div class="section-label">In the armory</div>
      <div class="inv-spares">${spareHtml}</div>`;
    const who = `${esc(g.localPlayer.name || 'Warden')} · ${cls === 'unbound' ? 'Unbound' : cls === 'arclight' ? 'Arclight' : cls === 'reaper' ? 'Reaper' : (cls === 'hammer' ? 'Gravebreaker' : 'Breaker')}`;
    if (!force && html + who === lastHtml) return;
    lastHtml = html + who;
    $('inv-body').innerHTML = html;
    $('inv-who').innerHTML = who;
  }

  function toggle() {
    build();
    const g = window.game;
    if (window.CharSelect && window.CharSelect.isOpen()) return;
    g.toggleModal('inventory-modal');
  }

  window.addEventListener('keydown', (e) => {
    if ((e.key !== 'i' && e.key !== 'I') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    toggle();
  });

  function init() {
    build();
    const btn = $('btn-inventory');
    if (btn) btn.addEventListener('click', toggle);
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else init();
  window.Inventory = { toggle, paint };
})();
