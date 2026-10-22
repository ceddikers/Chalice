// =========================================================================
// DAMAGE_CHART.JS — the "Detailed damage chart" on the end-of-run screens.
// Pick a player; see how much of their damage came from each ability, with hits, crit rate, average and best hit.
// Data comes from RaidStats (raid_stats.js), which tallies every hit by ability and shares the host's tally with the party.
// =========================================================================
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = (v) => Math.round(v).toLocaleString('en-US');
  const COLORS = ['#e8c46a', '#f0788c', '#7dd3fc', '#a3e635', '#c4a3ff', '#fb923c', '#5eead4', '#f9a8d4', '#fde047', '#94a3b8'];
  const S = { el: null, res: null, sel: null };

  const css = `
  .dc { position: fixed; inset: 0; z-index: 340; display: grid; place-items: center; background: rgba(4, 3, 8, 0.82); }
  .dc.hidden { display: none; }
  .dc-panel { width: min(900px, 94vw); max-height: 90vh; overflow: auto; padding: 18px 22px 20px; background: linear-gradient(180deg, #14101c, #0b0911); border: 1px solid #5b4a2c; box-shadow: 0 20px 60px rgba(0,0,0,0.7); color: #e6dcc6; font-family: var(--f-body, Arial, sans-serif); }
  .dc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .dc-head h2 { margin: 0; font-family: var(--f-serif, Georgia, serif); font-size: 22px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #f2e8d0; }
  .dc-head small { display: block; font-family: var(--f-cond, Arial, sans-serif); font-size: 12px; letter-spacing: 2.4px; color: #b8975a; }
  .dc-x { width: 34px; height: 34px; font-size: 22px; line-height: 1; color: #d8cdb0; background: rgba(20,15,28,0.9); border: 1px solid rgba(168,137,90,0.45); cursor: pointer; }
  .dc-x:hover { background: rgba(70,40,40,0.9); }
  .dc-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
  .dc-tab { padding: 7px 14px; font: 600 14px var(--f-serif, Georgia, serif); color: #cfc6af; background: rgba(28,21,40,0.8); border: 1px solid rgba(120,100,160,0.3); border-left: 4px solid #38bdf8; cursor: pointer; }
  .dc-tab.hammer { border-left-color: #fb923c; }
  .dc-tab.reaper { border-left-color: #e11d48; }
  .dc-tab.arclight { border-left-color: #38bdf8; }
  .dc-tab.unbound { border-left-color: #e2e8f0; }
  .dc-tab.on { background: rgba(70,48,100,0.65); border-color: #b8975a; color: #fff; }
  .dc-tab small { margin-left: 8px; font-size: 12px; color: #9a9078; }
  .dc-sum { display: flex; flex-wrap: wrap; border: 1px solid rgba(168,137,90,0.3); margin-bottom: 12px; }
  .dc-sum > div { flex: 1 1 110px; padding: 8px 14px; border-right: 1px solid rgba(168,137,90,0.25); }
  .dc-sum > div:last-child { border-right: 0; }
  .dc-sum span { display: block; font: 600 11.5px var(--f-cond, Arial, sans-serif); letter-spacing: 2px; text-transform: uppercase; color: #9a9078; }
  .dc-sum b { font: 600 20px var(--f-serif, Georgia, serif); color: #f2e8d0; }
  .dc-stack { display: flex; height: 22px; margin-bottom: 14px; border: 1px solid rgba(255,255,255,0.12); background: #0a0810; }
  .dc-stack i { display: block; height: 100%; }
  .dc-tbl { width: 100%; border-collapse: collapse; }
  .dc-tbl th { padding: 6px 8px; text-align: right; font: 600 12px var(--f-cond, Arial, sans-serif); letter-spacing: 1.8px; text-transform: uppercase; color: #b8975a; border-bottom: 1px solid rgba(168,137,90,0.4); }
  .dc-tbl th:first-child { text-align: left; }
  .dc-tbl td { padding: 7px 8px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06); font-variant-numeric: tabular-nums; font-size: 14px; }
  .dc-tbl td.ab { text-align: left; min-width: 230px; }
  .dc-tbl td.ab div { display: flex; align-items: center; gap: 8px; font: 600 14px var(--f-serif, Georgia, serif); color: #efe6cf; }
  .dc-tbl td.ab i { width: 10px; height: 10px; flex: 0 0 auto; }
  .dc-tbl td.ab u { display: block; height: 4px; margin-top: 5px; text-decoration: none; opacity: 0.85; }
  .dc-tbl td small { color: #8f8670; margin-left: 4px; }
  .dc-empty { padding: 26px; text-align: center; color: #9a9078; }
  `;

  function build() {
    if (S.el) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const el = document.createElement('div'); el.className = 'dc hidden';
    el.innerHTML = '<div class="dc-panel"></div>';
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.body.appendChild(el);
    addEventListener('keydown', (e) => { if (!el.classList.contains('hidden') && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
    S.el = el;
  }

  function paint() {
    const res = S.res, panel = S.el.querySelector('.dc-panel');
    const rows = (res && res.rows) || [];
    const me = (window.game && window.game.localPlayer && window.game.localPlayer.id) || null;
    if (!S.sel || !rows.some(r => r.id === S.sel)) S.sel = (rows.find(r => r.id === me) || rows[0] || {}).id;
    const r = rows.find(x => x.id === S.sel);
    const tabs = rows.map(x => `<button class="dc-tab ${x.classId === 'hammer' || x.classId === 'reaper' || x.classId === 'arclight' || x.classId === 'unbound' ? x.classId : ''} ${x.id === S.sel ? 'on' : ''}" data-id="${esc(x.id)}">${esc(x.name)}<small>${n(x.dmg)}</small></button>`).join('');
    let body = '<div class="dc-empty">No damage was recorded.</div>';
    if (r) {
      const skills = r.skills || [];
      const total = Math.max(1, r.dmg || skills.reduce((a, s) => a + s.dmg, 0));
      const hits = skills.reduce((a, s) => a + s.hits, 0), crits = skills.reduce((a, s) => a + s.crits, 0);
      const top = Math.max(1, ...skills.map(s => s.dmg));
      if (!skills.length) body = '<div class="dc-empty">No ability breakdown for this run.</div>';
      else body = `
        <div class="dc-sum">
          <div><span>Total damage</span><b>${n(r.dmg)}</b></div>
          <div><span>DPS</span><b>${n(r.dps || 0)}</b></div>
          <div><span>Hits</span><b>${n(hits)}</b></div>
          <div><span>Crit rate</span><b>${hits ? Math.round(crits / hits * 100) : 0}%</b></div>
          <div><span>Best hit</span><b>${n(Math.max(0, ...skills.map(s => s.max)))}</b></div>
        </div>
        <div class="dc-stack">${skills.map((s, i) => `<i title="${esc(s.name)}" style="width:${(s.dmg / total * 100).toFixed(2)}%;background:${COLORS[i % COLORS.length]}"></i>`).join('')}</div>
        <table class="dc-tbl"><thead><tr><th>Ability</th><th>Damage</th><th>Share</th><th>Hits</th><th>Crit</th><th>Avg hit</th><th>Best</th></tr></thead><tbody>
        ${skills.map((s, i) => `<tr>
          <td class="ab"><div><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(s.name)}</div><u style="width:${(s.dmg / top * 100).toFixed(1)}%;background:${COLORS[i % COLORS.length]}"></u></td>
          <td>${n(s.dmg)}</td><td>${Math.round(s.dmg / total * 100)}%</td><td>${n(s.hits)}</td>
          <td>${s.hits ? Math.round(s.crits / s.hits * 100) : 0}%</td><td>${n(s.hits ? s.dmg / s.hits : 0)}</td><td>${n(s.max)}</td></tr>`).join('')}
        </tbody></table>`;
    }
    panel.innerHTML = `<div class="dc-head"><div><small>END OF RUN</small><h2>Detailed damage chart</h2></div><button class="dc-x" title="Close (Esc)">×</button></div>
      <div class="dc-tabs">${tabs}</div>${body}`;
    panel.querySelector('.dc-x').onclick = close;
    panel.querySelectorAll('.dc-tab').forEach(b => b.onclick = () => { S.sel = b.dataset.id; paint(); });
  }

  function open(res) {
    build();
    S.res = res || (window.RaidStats && (window.RaidStats.get() || window.RaidStats.compile())) || null;
    S.el.classList.remove('hidden'); paint();
  }
  function close() { if (S.el) S.el.classList.add('hidden'); }

  window.DamageChart = { open, close };
})();
