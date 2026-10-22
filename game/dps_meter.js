// =========================================================================
// DPS_METER.JS — a small draggable damage meter for raids.
//   toggle   H key, or the DPS button in the top bar (state is remembered)
//   move     drag the title bar; the position is remembered and kept on screen. Double-click the title to reset it.
// Reads the same tallies as the results screen (raid_stats.js), so the numbers match the end-of-fight table.
// =========================================================================
(function () {
  if (typeof Game25D === 'undefined') return;
  const KEY = 'newtry1_meter';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let pref = { on: false, x: null, y: null };
  let el = null, body = null, timer = 0;

  try { Object.assign(pref, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) {} };

  function clamp() {
    if (!el) return;
    const w = el.offsetWidth || 230, h = el.offsetHeight || 120;
    if (pref.x === null || pref.y === null) { el.style.left = ''; el.style.top = ''; el.style.right = '16px'; el.style.bottom = ''; el.style.top = '150px'; return; }
    const x = Math.max(0, Math.min(window.innerWidth - w, pref.x));
    const y = Math.max(0, Math.min(window.innerHeight - h, pref.y));
    el.style.right = 'auto'; el.style.left = x + 'px'; el.style.top = y + 'px';
  }

  function build() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'dps-meter';
    el.className = 'hidden';
    el.innerHTML = `<div class="dm-head" title="Drag to move · double-click to reset"><span>Damage</span><em id="dm-time">0:00</em><button class="dm-x" title="Hide (H)">×</button></div><div class="dm-body" id="dm-body"></div>`;
    document.body.appendChild(el);
    body = $('dm-body');
    el.querySelector('.dm-x').addEventListener('click', () => toggle(false));

    const head = el.querySelector('.dm-head');
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
      el.classList.add('drag');
      e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      pref.x = e.clientX - drag.dx; pref.y = e.clientY - drag.dy;
      clamp();
    });
    const end = () => { if (!drag) return; drag = null; el.classList.remove('drag'); const r = el.getBoundingClientRect(); pref.x = r.left; pref.y = r.top; save(); };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    head.addEventListener('dblclick', () => { pref.x = pref.y = null; save(); clamp(); });
    window.addEventListener('resize', clamp);
  }

  function toggle(on) {
    build();
    pref.on = typeof on === 'boolean' ? on : !pref.on;
    save();
    paint();
    if (window.QoL && typeof on !== 'boolean') window.QoL.toast(pref.on ? 'Damage meter on' : 'Damage meter off');
  }

  function paint() {
    const btn = $('btn-dps-meter');
    if (btn) btn.classList.toggle('on', !!pref.on);
    if (!el) return;
    const g = window.game;
    const show = pref.on && g && g.mode === 'raid';
    el.classList.toggle('hidden', !show);
    if (show) { clamp(); render(); }
  }

  function render() {
    const g = window.game, S = window.RaidStats && window.RaidStats.state;
    if (!g || !S || !body) return;
    const t = Math.max(1, S.t);
    const humans = (g.party || []).concat(g.ghosts || []).filter(p => !p.isBot);
    const rows = humans.map(p => {
      const r = S.rows.get(p.id);
      return { name: p.name || 'Warden', cls: p.classId || 'breaker', me: p === g.localPlayer, dmg: r ? r.dmg : 0 };
    }).sort((a, b) => b.dmg - a.dmg);
    const total = rows.reduce((a, r) => a + r.dmg, 0), top = Math.max(1, rows[0] ? rows[0].dmg : 1);
    const n = (v) => Math.round(v).toLocaleString('en-US');
    const html = rows.map(r => `
      <div class="dm-row ${r.cls} ${r.me ? 'me' : ''}">
        <i style="width:${Math.round((r.dmg / top) * 100)}%"></i>
        <b>${esc(r.name)}</b><span>${n(r.dmg / t)}<small>/s</small></span><u>${total ? Math.round(r.dmg / total * 100) : 0}%</u>
      </div>`).join('');
    if (body._h !== html) { body._h = html; body.innerHTML = html; }
    const tm = $('dm-time');
    const txt = window.RaidStats.fmtTime(Math.floor(S.t));
    if (tm && tm.textContent !== txt) tm.textContent = txt;
  }

  const proto = Game25D.prototype;
  const origUpdate = proto.update;
  proto.update = function (dt) {
    origUpdate.call(this, dt);
    timer -= dt;
    if (timer > 0) return;
    timer = 0.25;
    paint();
  };

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'h' && e.key !== 'H') return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (window.CharSelect && window.CharSelect.isOpen()) return;
    toggle();
  });

  function init() {
    build();
    const btn = $('btn-dps-meter');
    if (btn) btn.addEventListener('click', () => toggle());
    paint();
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else init();
  window.DpsMeter = { toggle };
})();
