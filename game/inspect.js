// =========================================================================
// INSPECT.JS — look at a teammate's gear. Hold Alt and right-click a player: a small menu offers "View inventory", which asks
// that player's game for their character and equipment and shows it in a read-only sheet (weapon, armor, accessories with their
// rolled lines, wings, stats and a turning model of the character).
// Packets: cx_inspect_req {from, to} -> cx_inspect {from, to, data}, relayed by the host like the other cx_* packets.
// =========================================================================
(function () {
  if (typeof Game25D === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const G = () => window.game;
  const NET = () => window.game && window.game.net;
  const A = () => window.Accessories;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, +v || 0));
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  const col = (v, d) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? String(v) : d);

  // ---------------------------------------------------------------- what we send about ourselves
  function snapshot() {
    const g = G(), p = g.localPlayer, f = g.forge;
    const wpn = f.getEquippedWeapon(p.classId || 'breaker'), arm = f.getEquippedArmor();
    return {
      name: str(p.name, 16), cls: (p.classId === 'hammer' || p.classId === 'reaper' || p.classId === 'arclight' || p.classId === 'unbound') ? p.classId : 'breaker', look: p.look || null,
      wings: (p.wings === 'eclipse_wings' || p.wings === 'pyre_wings' || p.wings === 'moon_mobile') ? p.wings : null, armorTier: p.armorTier || 1,
      weapon: wpn ? { name: str(wpn.name, 40), tier: str(wpn.tier, 40), enh: wpn.enh | 0, atk: wpn.baseAtk | 0, model: str(wpn.weaponModelId, 30), color: wpn.weaponColor, glow: wpn.weaponGlow } : null,
      armor: arm ? { name: str(arm.name, 40), tier: str(arm.tier, 40), enh: arm.enh | 0, hp: arm.bonusHp | 0, def: arm.bonusDef | 0 } : null,
      acc: f.getEquippedAccessories().map(a => ({ slot: a.slot, name: str(a.name, 30), rarity: a.rarity || 'common', desc: str(a.desc, 140), color: a.color, lines: (a.lines || []).map(l => ({ id: l.id, v: l.v })) })),
      stats: { atk: p.getTotalAtk ? p.getTotalAtk() : 0, crit: p.critRate || 0, hp: p.maxHp | 0, def: p.bonusDef | 0, haste: p.haste || 0, critdmg: p.critDmgBonus || 0, dr: p.dmgReduction || 0, wake: p.wakeRecovery || 0 }
    };
  }
  // ...and what we accept from others
  function clean(d) {
    if (!d || typeof d !== 'object') return null;
    const S = (A() && A().STATS) || {};
    return {
      name: str(d.name, 16) || 'Warden', cls: (d.cls === 'hammer' || d.cls === 'reaper' || d.cls === 'arclight' || d.cls === 'unbound') ? d.cls : 'breaker',
      look: (window.Characters && d.look) ? window.Characters.cleanLook(d.look, (d.cls === 'hammer' || d.cls === 'reaper' || d.cls === 'arclight' || d.cls === 'unbound') ? d.cls : 'breaker') : null,
      wings: (d.wings === 'eclipse_wings' || d.wings === 'pyre_wings' || d.wings === 'moon_mobile') ? d.wings : null, armorTier: clamp(d.armorTier, 1, 3) | 0 || 1,
      weapon: d.weapon ? { name: str(d.weapon.name, 40), tier: str(d.weapon.tier, 40), enh: clamp(d.weapon.enh, 0, 15) | 0, atk: clamp(d.weapon.atk, 0, 99999) | 0, model: str(d.weapon.model, 30), color: col(d.weapon.color, '#38bdf8'), glow: col(d.weapon.glow, '#0284c7') } : null,
      armor: d.armor ? { name: str(d.armor.name, 40), tier: str(d.armor.tier, 40), enh: clamp(d.armor.enh, 0, 15) | 0, hp: clamp(d.armor.hp, 0, 99999) | 0, def: clamp(d.armor.def, 0, 9999) | 0 } : null,
      acc: (Array.isArray(d.acc) ? d.acc : []).slice(0, 4).map(a => ({
        slot: ['ring', 'necklace', 'charm'].includes(a.slot) ? a.slot : 'ring', name: str(a.name, 30), rarity: ((A() && A().RARITY.some(r => r.id === a.rarity)) ? a.rarity : 'common'),
        desc: str(a.desc, 140), color: col(a.color, '#b39565'),
        lines: (Array.isArray(a.lines) ? a.lines : []).slice(0, 4).filter(l => l && S[l.id]).map(l => ({ id: l.id, v: clamp(l.v, 0, 5000) }))
      })),
      stats: d.stats ? { atk: clamp(d.stats.atk, 0, 99999) | 0, crit: clamp(d.stats.crit, 0, 1), hp: clamp(d.stats.hp, 0, 99999) | 0, def: clamp(d.stats.def, 0, 9999) | 0, haste: clamp(d.stats.haste, 0, 1), critdmg: clamp(d.stats.critdmg, 0, 3), dr: clamp(d.stats.dr, 0, 1), wake: clamp(d.stats.wake, 0, 1) } : null
    };
  }

  // ---------------------------------------------------------------- the sheet
  let el = null, cv = null, c2 = null, timer = null, model = null, modelKey = '', yaw = 0, drag = null, lastT = 0, wantId = null, waitTimer = null, cur = null;
  function build() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'inspect-modal'; el.className = 'modal-window inspect-window hidden';
    el.innerHTML = `
      <div class="modal-hdr"><div class="hdr-title"><div><div class="vr-kicker" id="in-class"></div><h2 id="in-name"></h2></div></div>
        <button class="close-btn" onclick="window.game.closeAllModals()" title="Close (Esc)">×</button></div>
      <div class="in-main">
        <aside class="in-col" id="in-left"></aside>
        <section class="in-model"><canvas id="in-canvas" width="340" height="440"></canvas><div class="ar-hint">Drag to turn</div></section>
        <aside class="in-col" id="in-right"></aside>
      </div>`;
    document.body.appendChild(el);
    cv = $('in-canvas'); c2 = cv.getContext('2d');
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y0: yaw }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (drag) yaw = drag.y0 + (e.clientX - drag.x) * 0.012; });
    const end = () => { drag = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    new MutationObserver(() => {
      if (el.classList.contains('hidden')) { clearInterval(timer); timer = null; wantId = null; }
      else if (!timer) { lastT = performance.now(); timer = setInterval(frame, 33); }
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  const lineRows = (R, lines) => (lines || []).map(l => { const S = A().STATS[l.id]; return `<span>${esc(S.label)}<em style="color:${R.color}">${A().fmt(l)}</em></span>`; }).join('');
  function paint(d, extra) {
    cur = d;
    $('in-class').textContent = (d.cls === 'unbound' ? 'UNBOUND' : d.cls === 'arclight' ? 'ARCLIGHT' : d.cls === 'reaper' ? 'REAPER' : d.cls === 'hammer' ? 'GRAVEBREAKER' : 'BREAKER') + (extra ? ' · ' + extra : '');
    $('in-name').textContent = d.name;
    const w = d.weapon, a = d.armor, s = d.stats;
    const tone = { 1: '#8f887b', 2: '#d0536a', 3: '#9b84e0', 4: '#e2b23a' };
    const tierN = (t) => +((/Tier\s*(\d)/i.exec(t || '') || [0, 1])[1]);
    const gear = (item, kind) => item ? `<div class="in-gear" style="--tone:${tone[tierN(item.tier)]}"><b>${esc(item.name)}${item.enh ? ` <em class="enh-plus">+${item.enh}</em>` : ''}</b><small>${esc(item.tier)}</small></div>` : `<div class="in-gear empty"><b>No ${kind}</b></div>`;
    const stat = (n, v) => `<div class="ar-stat"><span>${n}</span><b>${v}</b></div>`;
    $('in-left').innerHTML = `
      <div class="section-label">Equipment</div>${gear(w, 'weapon')}${gear(a, 'armor')}
      ${d.wings ? (d.wings === 'moon_mobile' ? '<div class="in-gear" style="--tone:#fde68a"><b>Moon Mobile</b><small>Cosmetic</small></div>' : d.wings === 'pyre_wings' ? '<div class="in-gear" style="--tone:#f97316"><b>Pyre Wings</b><small>Cosmetic</small></div>' : '<div class="in-gear" style="--tone:#fb923c"><b>Eclipse Wings</b><small>Cosmetic</small></div>') : ''}
      ${s ? `<div class="section-label">Stats</div>
        ${stat('Attack', s.atk)}${stat('Crit rate', Math.round(s.crit * 100) + '%')}${stat('Max health', s.hp.toLocaleString('en-US'))}${stat('Defense', s.def)}
        ${s.haste ? stat('Attack speed', '+' + Math.round(s.haste * 1000) / 10 + '%') : ''}${s.critdmg ? stat('Crit damage', '+' + Math.round(s.critdmg * 100) + '%') : ''}
        ${s.dr ? stat('Damage taken', '-' + Math.round(s.dr * 1000) / 10 + '%') : ''}${s.wake ? stat('Get-up time', '-' + Math.round(s.wake * 100) + '%') : ''}` : ''}`;
    const accs = d.acc.length ? d.acc.map(x => {
      const R = A().rarityOf(x);
      return `<div class="in-acc" style="--rc:${R.color}"><img src="${A().icon(x.slot, R.id)}" alt="">
        <div><b style="color:${R.color}">${esc(x.name)}</b><small>${R.name} ${esc(x.slot)}</small>
        ${x.lines.length ? `<div class="ar-tip-lines">${lineRows(R, x.lines)}</div>` : ''}<div class="in-pass">${esc(x.desc)}</div></div></div>`;
    }).join('') : '<div class="redeem-note">No accessories worn.</div>';
    $('in-right').innerHTML = `<div class="section-label">Accessories</div>${accs}`;
    modelKey = '';
  }
  function paintMessage(name, msg) {
    $('in-class').textContent = ''; $('in-name').textContent = name || 'Warden';
    $('in-left').innerHTML = `<div class="redeem-note">${esc(msg)}</div>`; $('in-right').innerHTML = ''; cur = null; model = null;
  }

  function ensureModel() {
    if (!cur) return null;
    const key = JSON.stringify([cur.cls, cur.look, cur.wings, cur.armorTier, cur.weapon, cur.armor && cur.armor.enh]);
    if (model && key === modelKey) return model;
    modelKey = key;
    const Cls = cur.cls === 'unbound' ? UnboundPlayer25D : cur.cls === 'arclight' ? ArclightPlayer25D : cur.cls === 'reaper' ? ReaperPlayer25D : (cur.cls === 'hammer' ? HammerPlayer25D : BreakerPlayer25D);
    const m = new Cls('inspect', '', 0, 0, false, false);
    if (cur.look) m.look = cur.look;
    m.wings = cur.wings; m.noPlate = true;
    if (m.setArmorTier) m.setArmorTier(cur.armorTier);
    if (cur.weapon) { m.weaponModelId = cur.weapon.model || m.weaponModelId; m.weaponColor = cur.weapon.color; m.weaponGlow = cur.weapon.glow; m.weaponEnh = cur.weapon.enh; }
    if (m.snapFeetToBody) m.snapFeetToBody();
    model = m; return m;
  }
  function frame() {
    if (!c2) return;
    const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const w = cv.width, h = cv.height; c2.clearRect(0, 0, w, h);
    const bg = c2.createRadialGradient(w / 2, h * 0.62, 10, w / 2, h * 0.62, h * 0.7);
    bg.addColorStop(0, 'rgba(88, 62, 40, 0.5)'); bg.addColorStop(0.55, 'rgba(32, 22, 36, 0.35)'); bg.addColorStop(1, 'rgba(8, 6, 12, 0)');
    c2.fillStyle = bg; c2.fillRect(0, 0, w, h);
    try {
      const p = ensureModel(); if (!p) return;
      if (!drag) yaw += dt * 0.35;
      p.facingAngle = Math.PI * 0.5 + Math.sin(yaw) * 0.9; p.breathePhase = (p.breathePhase || 0) + dt * 2;
      c2.save(); c2.translate(w / 2, h * 0.86); c2.scale(2.8, 2.8); p.draw(c2); c2.restore();
    } catch (e) { /* not ready */ }
    c2.save(); c2.translate(w / 2, h * 0.86 + 6); c2.scale(1, 0.28); c2.strokeStyle = 'rgba(179,149,101,0.5)'; c2.lineWidth = 2; c2.beginPath(); c2.arc(0, 0, 88, 0, Math.PI * 2); c2.stroke(); c2.restore();
  }

  function open(target) {
    build();
    const g = G();
    g.closeAllModals(); g.openModal('inspect-modal');
    if (target.isLocal) { paint(snapshot(), 'you'); return; }
    if (target.isBot || !NET() || !NET().isConnected()) {
      paintMessage(target.name, target.isBot ? 'An AI comrade has no inventory to show.' : 'No connection to this player.'); return;
    }
    wantId = target.id; paintMessage(target.name, 'Asking for their gear…');
    NET().broadcast({ type: 'cx_inspect_req', from: g.localPlayer.id, to: target.id });
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => { if (wantId === target.id) paintMessage(target.name, 'No answer. They may be loading or on an older version.'); }, 3500);
  }

  // ---------------------------------------------------------------- network
  function onNet(d) {
    const g = G(), n = NET(); if (!g || !n) return false;
    if (d.type === 'cx_inspect_req') {
      if (d.to === g.localPlayer.id) n.broadcast({ type: 'cx_inspect', from: g.localPlayer.id, to: d.from, data: snapshot() });
      return true;
    }
    if (d.type === 'cx_inspect') {
      if (d.to === g.localPlayer.id && wantId === d.from) {
        const data = clean(d.data); wantId = null; clearTimeout(waitTimer);
        if (data) paint(data); else paintMessage('Warden', 'That reply was not readable.');
      }
      return true;
    }
    return false;
  }
  const hookNet = () => {
    if (!window.Comms || window.Comms._inspectHooked) return;
    const o = window.Comms.onNet; window.Comms._inspectHooked = true;
    window.Comms.onNet = function (sid, d) { if (d && onNet(d)) return; return o.apply(this, arguments); };
  };

  // ---------------------------------------------------------------- Alt + right-click menu
  let menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function pickPlayer(e) {
    const g = G(); if (!g || !g.party) return null;
    const w = g.camera.screenToWorld(e.clientX, e.clientY, g.canvas.width, g.canvas.height);
    let best = null, bd = 1e9;
    for (const p of g.party) {
      if (!p || p.hidden) continue;
      const dx = w.x - p.x, dy = w.y - (p.y - (p.jumpZ || 0) - 40);
      if (Math.abs(dx) < 36 && Math.abs(dy) < 62) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = p; } }
    }
    return best;
  }
  window.addEventListener('mousedown', (e) => {
    const g = G();
    if (menu && !(e.target.closest && e.target.closest('#cx-ctx'))) closeMenu();
    if (!g || e.target !== g.canvas || e.button !== 2 || !e.altKey) return;
    if (window.CharSelect && window.CharSelect.isOpen()) return;
    const p = pickPlayer(e);
    if (!p) return;
    e.preventDefault(); e.stopImmediatePropagation();
    closeMenu();
    menu = document.createElement('div');
    menu.id = 'cx-ctx';
    menu.innerHTML = `<div class="cx-ctx-h">${esc(p.name || 'Warden')}${p.isLocal ? ' <i>(you)</i>' : ''}</div><button>View inventory</button>`;
    menu.style.left = Math.min(window.innerWidth - 180, e.clientX + 6) + 'px'; menu.style.top = Math.min(window.innerHeight - 90, e.clientY + 6) + 'px';
    document.body.appendChild(menu);
    menu.querySelector('button').addEventListener('click', () => { closeMenu(); open(p); });
  }, true);
  window.addEventListener('contextmenu', (e) => { if (e.altKey && G() && e.target === G().canvas) e.preventDefault(); }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('blur', closeMenu);

  const init = () => { hookNet(); build(); };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init); else init();
  window.Inspect = { open, snapshot, clean, hookNet };
})();
