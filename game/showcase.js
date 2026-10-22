// =========================================================================
// SHOWCASE.JS — drives showcase.html: every class plays through its abilities on the hub training dummy, with a
// panel to flip between the CURRENT look and the PROPOSED one (showcase_style.js), pick a class, and slow time down.
// Saves are never written: showcase.html swaps localStorage writes for an in-memory copy before the game loads.
// =========================================================================
(function () {
  const S = window.ShowcaseStyle;
  const CLASSES = [
    { id: 'breaker', name: 'Breaker' }, { id: 'hammer', name: 'Gravebreaker' }, { id: 'reaper', name: 'Reaper' },
    { id: 'arclight', name: 'Arclight' }, { id: 'unbound', name: 'Unbound' }
  ];
  // one entry per beat: k = key ('basic' = held left click), hold = seconds before release, taps = extra presses, spam = seconds of mashing
  const SEQ = {
    breaker: [{ k: 'basic' }, { k: 'q' }, { k: 'w' }, { k: 'e' }, { k: 'r', hold: 0.6 }, { k: 'a' }, { k: 's' }, { k: 'd' }, { k: 'f' }, { k: 'z' }, { k: 't' }, { k: 'space' }],
    hammer: [{ k: 'basic' }, { k: 'q', taps: [0.5, 1.0] }, { k: 'w' }, { k: 'e', taps: [0.75] }, { k: 'r', hold: 1.5 }, { k: 'a' }, { k: 's' }, { k: 'd' }, { k: 'f', spam: 2.2 }, { k: 'z' }, { k: 't' }, { k: 'space' }],
    reaper: [{ k: 'basic' }, { k: 'q' }, { k: 'w' }, { k: 'e' }, { k: 'r' }, { k: 'a' }, { k: 's' }, { k: 'd' }, { k: 'f' }, { k: 't' },
      { k: 'z' }, { k: 'q', form: 'void' }, { k: 'w', form: 'void' }, { k: 'e', form: 'void' }, { k: 'r', form: 'void' }, { k: 'a', form: 'void' },
      { k: 's', form: 'void' }, { k: 'd', form: 'void' }, { k: 'f', form: 'void' }, { k: 't', form: 'void' }],
    arclight: [{ k: 'basic' }, { k: 'q' }, { k: 'w' }, { k: 'e' }, { k: 'r' }, { k: 'a' }, { k: 's' }, { k: 'd' }, { k: 'f' }, { k: 'z', set: { heat: 100 } }, { k: 't' },
      { k: 'x' }, { k: 'basic', mode: 1 }, { k: 'q', mode: 1 }, { k: 'w', mode: 1 }, { k: 'e', mode: 1 }, { k: 'r', mode: 1 }, { k: 's', mode: 1 }, { k: 'f', mode: 1 }, { k: 'x', mode: 1 }],
    unbound: [{ k: 'basic' }, { k: 'q' }, { k: 'w' }, { k: 'e' }, { k: 'r' }, { k: 'a' }, { k: 's' }, { k: 'd' }, { k: 'f' }, { k: 't' }, { k: 'space' },
      // Release takes the form of whatever filled the meter: dodges (beam), skills (press), counters (hell)
      { k: 'z', label: 'Release (dodge-built)', set: { restraint: 100, tally: { dodge: 5, counter: 0, skill: 0 } } },
      { k: 'z', label: 'Release (skill-built)', set: { restraint: 100, tally: { dodge: 0, counter: 0, skill: 5 } } },
      { k: 'z', label: 'Release (counter-built)', set: { restraint: 100, tally: { dodge: 0, counter: 5, skill: 0 } } }]
  };

  const st = { cls: 0, step: -1, phase: 'idle', t: 0, playAll: true, paused: false, home: { x: 95, y: 40 }, misses: [] };
  window.__showcase = st;     // for debugging: st.misses lists casts that did not go off

  function skillName(clsId, b) {
    if (b.label) return b.label;
    if (b.k === 'basic') return 'Basic attack combo';
    if (b.k === 'space') return 'Evade Dash';
    const m = window.SKILL_META && window.SKILL_META[clsId];
    const table = b.form === 'void' && m && m.void ? m.void : m && m.skills;
    let n = (table && table[b.k] && table[b.k].name) || b.k.toUpperCase();
    if (n.includes(' / ')) n = n.split(' / ')[b.mode ? 1 : 0];
    return b.form === 'void' ? n + ' (Voidform)' : n;
  }

  // ---- panel -------------------------------------------------------------------------------------------------
  const css = `
  #sc-panel{position:fixed;left:14px;top:14px;z-index:9999;width:258px;padding:14px 14px 12px;border-radius:12px;
    background:rgba(10,14,24,.88);border:1px solid rgba(148,163,184,.25);color:#e2e8f0;font:13px/1.35 Cabin,system-ui,sans-serif;
    box-shadow:0 10px 30px rgba(0,0,0,.45)}
  #sc-panel h1{margin:0 0 2px;font:600 17px Cinzel,Georgia,serif;letter-spacing:.04em;color:#facc15}
  #sc-panel .sub{color:#94a3b8;font-size:11.5px;margin-bottom:10px}
  #sc-panel .lbl{margin:10px 0 5px;color:#94a3b8;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
  #sc-panel .row{display:flex;flex-wrap:wrap;gap:5px}
  #sc-panel button{all:unset;cursor:pointer;padding:5px 9px;border-radius:7px;background:#1e293b;border:1px solid #334155;font-size:12.5px}
  #sc-panel button:hover{border-color:#64748b}
  #sc-panel button.on{background:#facc15;color:#111827;border-color:#facc15;font-weight:600}
  #sc-ab{display:flex;margin-top:2px}
  #sc-ab button{flex:1;text-align:center;padding:8px 0;font-weight:600;font-size:13.5px}
  #sc-ab button:first-child{border-radius:7px 0 0 7px}#sc-ab button:last-child{border-radius:0 7px 7px 0}
  #sc-panel label{display:flex;align-items:center;gap:7px;margin:3px 0;cursor:pointer}
  #sc-panel label input{accent-color:#facc15}
  #sc-now{margin-top:10px;padding:9px 10px;border-radius:8px;background:#0f172a;border:1px solid #1e293b}
  #sc-now .c{color:#94a3b8;font-size:11.5px}#sc-now .s{font-weight:600;font-size:15px;color:#f8fafc}
  #sc-now kbd{display:inline-block;min-width:16px;text-align:center;padding:0 5px;margin-right:6px;border-radius:4px;background:#334155;font:600 11.5px system-ui}
  #sc-panel .hint{margin-top:8px;color:#64748b;font-size:11px}`;

  function buildPanel() {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const el = document.createElement('div'); el.id = 'sc-panel';
    el.innerHTML = `
      <h1>Animation Showcase</h1>
      <div class="sub">Every class on the training dummy. After is what the game uses now.</div>
      <div id="sc-ab"><button data-ab="0">Before</button><button data-ab="1">After</button></div>
      <div class="lbl">Polish parts</div>
      <label><input type="checkbox" data-f="smooth" checked> Smooth pose blending</label>
      <label><input type="checkbox" data-f="model" checked> One-silhouette models</label>
      <label><input type="checkbox" data-f="fx" checked> Smears, particles, impacts</label>
      <div class="lbl">Class</div>
      <div class="row" id="sc-cls"></div>
      <div class="row" style="margin-top:5px"><button id="sc-all">Play all classes</button><button id="sc-replay">Replay skill</button><button id="sc-pause">Pause</button></div>
      <div class="lbl">Speed</div>
      <div class="row" id="sc-spd"><button data-s="1">1×</button><button data-s="0.5">0.5×</button><button data-s="0.25">0.25×</button></div>
      <div id="sc-now"><div class="c" id="sc-now-c">Loading…</div><div class="s" id="sc-now-s"></div></div>
      <div class="hint">V flips Before / After. 0.25× is the best way to judge blends and smears.</div>`;
    document.body.appendChild(el);
    const clsRow = el.querySelector('#sc-cls');
    CLASSES.forEach((c, i) => {
      const b = document.createElement('button'); b.textContent = c.name; b.dataset.i = i;
      b.onclick = () => { st.playAll = false; startClass(i); paint(); };
      clsRow.appendChild(b);
    });
    el.querySelector('#sc-all').onclick = () => { st.playAll = true; startClass(0); paint(); };
    el.querySelector('#sc-replay').onclick = () => { if (st.step >= 0) { st.step--; st.phase = 'next'; st.t = 0; } };
    el.querySelector('#sc-pause').onclick = () => { st.paused = !st.paused; paint(); };
    el.querySelectorAll('#sc-ab button').forEach(b => b.onclick = () => setAB(b.dataset.ab === '1'));
    el.querySelectorAll('input[data-f]').forEach(cb => cb.onchange = () => { S.flags[cb.dataset.f] = cb.checked; paint(); });
    el.querySelectorAll('#sc-spd button').forEach(b => b.onclick = () => { S.flags.speed = +b.dataset.s; paint(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'v' || e.key === 'V') { e.stopImmediatePropagation(); setAB(!isProposed()); } }, true);
  }

  const saved = { smooth: true, model: true, fx: true };
  const isProposed = () => S.flags.smooth || S.flags.model || S.flags.fx;
  function setAB(on) {
    if (!on) { Object.assign(saved, { smooth: S.flags.smooth, model: S.flags.model, fx: S.flags.fx }); S.flags.smooth = S.flags.model = S.flags.fx = false; }
    else { if (!saved.smooth && !saved.model && !saved.fx) Object.assign(saved, { smooth: true, model: true, fx: true }); Object.assign(S.flags, saved); }
    paint();
  }

  function paint() {
    const el = document.getElementById('sc-panel'); if (!el) return;
    const prop = isProposed();
    el.querySelectorAll('#sc-ab button').forEach(b => b.classList.toggle('on', (b.dataset.ab === '1') === prop));
    el.querySelectorAll('input[data-f]').forEach(cb => { cb.checked = !!S.flags[cb.dataset.f]; });
    el.querySelectorAll('#sc-cls button').forEach(b => b.classList.toggle('on', +b.dataset.i === st.cls && !st.playAll));
    el.querySelector('#sc-all').classList.toggle('on', st.playAll);
    el.querySelector('#sc-pause').textContent = st.paused ? 'Resume' : 'Pause';
    el.querySelectorAll('#sc-spd button').forEach(b => b.classList.toggle('on', +b.dataset.s === S.flags.speed));
    const c = CLASSES[st.cls], b = SEQ[c.id][st.step];
    document.getElementById('sc-now-c').textContent = `${c.name} · ${Math.max(0, st.step) + 1} / ${SEQ[c.id].length}`;
    document.getElementById('sc-now-s').innerHTML = b ? `<kbd>${b.k === 'basic' ? 'LMB' : b.k === 'space' ? 'SPC' : b.k.toUpperCase()}</kbd>${skillName(c.id, b)}` : '';
  }

  // ---- driver ------------------------------------------------------------------------------------------------
  const g = () => window.game;
  function startClass(i) {
    const G = g();
    st.cls = i; st.step = -1; st.phase = 'next'; st.t = 0;
    if (G.mode !== 'hub') G.enterHub();
    if (G.playerClass !== CLASSES[i].id) G.setPlayerClass(CLASSES[i].id);
    home(true);
  }

  function home(force) {
    const G = g(), lp = G.localPlayer, d = G.hubDummy;
    if (!lp) return;
    if (force || Math.hypot(lp.x - st.home.x, lp.y - st.home.y) > 50) {
      lp.x = st.home.x; lp.y = st.home.y;
      if (lp.snapFeetToBody) lp.snapFeetToBody();
    }
    lp.facingAngle = lp.moveAngle = Math.atan2(d.y - lp.y, d.x - lp.x);
  }

  function aim() { const G = g(), d = G.hubDummy; G.mouseWorldX = d.x; G.mouseWorldY = d.y; return d; }
  function fire(k) {
    const G = g(), lp = G.localPlayer, d = aim();
    if (k === 'basic') return lp.triggerBasicAttack(d.x, d.y);
    if (lp.cds) for (const key in lp.cds) lp.cds[key] = 0;
    let ok = false;
    try { ok = lp.triggerSkill(k, d.x, d.y, d); } catch (e) { console.warn('[showcase]', k, e); }
    if (!ok) { try { ok = lp.triggerSkill(k, d.x, d.y, d, true); } catch (e) { console.warn('[showcase]', k, e); } }   // gauge-gated skills (Z, T) fire as if already paid for
    if (!ok) st.misses.push(lp.classId + ':' + k);
    return ok;
  }
  const busy = (lp) => !!lp.act || (typeof lp.canAct === 'function' && !lp.canAct()) || (lp.state && lp.state !== 'idle' && lp.state !== 'walk');

  function tick(dt) {
    const G = g(), lp = G && G.localPlayer;
    if (!lp || st.phase === 'idle') return;
    lp.hp = lp.maxHp;
    if (G.camera) { G.camera.maxZoom = Math.max(G.camera.maxZoom, 1.7); G.camera.targetZoom = 1.7; }
    if (st.paused) return;
    st.t += dt;
    const seq = SEQ[CLASSES[st.cls].id];
    const b = seq[st.step];
    if (st.phase === 'next') {
      if (st.t < 0.55) return;
      st.step++;
      if (st.step >= seq.length) {
        if (st.playAll) { startClass((st.cls + 1) % CLASSES.length); paint(); return; }
        st.step = 0;
      }
      home(false);
      const nb = seq[st.step];
      st.phase = 'cast'; st.t = 0; st.taps = (nb.taps || []).slice(); st.released = false;
      if (nb.set) for (const key in nb.set) lp[key] = typeof nb.set[key] === 'object' ? { ...nb.set[key] } : nb.set[key];   // fill the gauge this beat needs
      fire(nb.k);
      paint();
      return;
    }
    if (st.phase === 'cast') {
      aim();
      if (b.k === 'basic' && st.t < 2.4) fire('basic');
      if (st.taps.length && st.t >= st.taps[0]) { st.taps.shift(); fire(b.k); }
      if (b.spam && st.t < b.spam && Math.floor(st.t / 0.12) !== Math.floor((st.t - dt) / 0.12)) fire(b.k);
      if (b.hold && !st.released && st.t >= b.hold) { st.released = true; lp.releaseSkill && lp.releaseSkill(b.k); }
      if (!b.hold && !st.released && st.t > 0.05) { st.released = true; lp.releaseSkill && lp.releaseSkill(b.k); }
      const minT = b.k === 'basic' ? 2.6 : (b.hold || 0) + 0.3;
      if ((st.t > minT && !busy(lp)) || st.t > 9) { st.phase = 'next'; st.t = 0; }
    }
  }

  function boot() {
    const G = g();
    if (!G || !G.localPlayer || !G.hubDummy) return setTimeout(boot, 200);
    for (const id of ['char-select', 'reconnect-overlay', 'top-nav-bar', 'hub-hint', 'bottom-action-hud', 'party-frames']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    document.title = 'Chalice · Animation Showcase';
    if (window.CharSelect) { try { window.CharSelect.close && window.CharSelect.close(); } catch (e) {} window.CharSelect.isOpen = () => false; }   // the dummy hides while it is "open"
    if (G.forge) G.forge.save = () => {};
    // keep the close-ups clean: no station sign over the dummy, no damage numbers
    for (const s of G.hubStations || []) if (/DUMMY/.test(s.name || '')) { s.name = ''; s.subtitle = ''; }
    if (window.fx) window.fx.addFloatingText = () => {};
    // slow motion + the driver both run on game time
    const protoUpdate = Object.getPrototypeOf(G).update;
    // Pause freezes the whole scene so Current / Proposed can be compared on one pose
    G.update = function (dt) { const d = st.paused ? 0 : dt * S.flags.speed; protoUpdate.call(this, d); try { tick(d); } catch (e) { console.warn('[showcase]', e); } };
    buildPanel();
    startClass(0);
    paint();
  }
  setTimeout(boot, 600);     // boot() itself waits until the game, the player and the dummy exist
})();
