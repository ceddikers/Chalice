// =========================================================================
// SETTINGS_PLUS.JS — turns the settings panel into tabs and adds:
//   Audio      music / effects / boss-voice volume sliders
//   Controls   rebindable skill keys, the emote wheel's eight lines
//   Interface  UI scale, HUD opacity, FPS counter, performance mode
//   Data       back up / restore characters (they live in this browser's storage)
// Also remembers the last room code you joined or hosted. Loaded after qol.js (which builds the panel).
// =========================================================================
(function () {
  const KEY = 'newtry1_settings2';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DEFAULT_EMOTES = ['Nice!', 'Thank you', 'Help!', 'Wait for me', 'On me', 'Stagger now', 'Sorry', 'Good game'];
  const D = { music: 0.8, sfx: 1, voice: 1, scale: 1, alpha: 1, fps: false, perf: false, glow: true, extraText: false, env: 'auto', binds: {}, emotes: DEFAULT_EMOTES.slice() };

  // QUIET TEXT. The game used to float a word over your head for everything (class names, "SYNC", "MOMENTUM +1", "BULWARK" ...) on top of
  // the skill bar, status icons and gauges that already show it. Those are hidden now. Damage numbers, results (PARRY!, PERFECT, MISSED!),
  // warnings about why a skill did not fire, loot and mechanic instructions stay. Settings > Interface > Extra popup text brings them all back.
  const QUIET = [
    /^(🔷|🩸|🔨|⚔️|✋)\s*(ARCLIGHT|REAPER|GRAVEBREAKER|BREAKER|UNBOUND) \(/,                                                  // the class name when you switch
    /SOLAR CANNON READY|^LOCKED|^MARKED x|^SYNC$|^CHAIN x|^FULL CHAIN$|^BEAM$|^SABER$|^LOCK-ON x|^MARK BURST|^OVERHEAT$/,  // Arclight: gauge, chain, marks, mode
    /MOMENTUM (\+1|FULL)|^Bulwark fades$|^BULWARK$|^\[E\] LEAP|ROAR!|BROKEN ×|OVERLOAD!|HOIST COUNTER/,                // Gravebreaker: state echoes
    /VOIDFORM|^Q ready$|^The form fades$/,                                                                           // Reaper
    /^SHATTERPOINT$|^ADRENALINE MAX$|ECLIPSE QTE PASSED|ABYSSAL ROOT! ALLIES BREAK/,                                 // passives and root echoes
    /BERSERK: THE OBSIDIAN|THE ECLIPSE AWAKENS|^ECLIPSE JUDGMENT|PALE ECLIPSE SANCTUARY|ECLIPSE DEVOURING|SOVEREIGN FLESH|FINAL PHASE — ECLIPSE SOVEREIGN|ASTRAL ECHOES EMPOWER|CLASH LOCKED|RAID WIPE/   // boss announcements
  ];
  window.PopupText = { QUIET, hide(text) { const S = window.SettingsPlus && window.SettingsPlus.get && window.SettingsPlus.get(); if (S && S.extraText) return false; const t = String(text || ''); return QUIET.some(r => r.test(t)); } };
  let S = Object.assign({}, D, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
  if (!Array.isArray(S.emotes) || S.emotes.length !== 8) S.emotes = DEFAULT_EMOTES.slice();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const toast = (m) => { if (window.QoL) window.QoL.toast(m); };

  // ------------------------------------------------------------------ key bindings
  const LOGICAL = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z', 'space'];
  const RESERVED = new Set(['g', 'c', 'i', 'm', 'h', 'p', 'escape', 'tab', 'enter', 'shift', 'alt', 'control', 'meta', 'capslock']);
  const physOf = (l) => (S.binds && S.binds[l]) || (l === 'space' ? ' ' : l);
  const Keybinds = {
    rev: {},
    rebuild() {
      this.rev = {};
      for (const l of LOGICAL) this.rev[physOf(l)] = l;
    },
    // physical key -> skill it triggers ('' = nothing; non-skill keys pass through)
    map(raw) {
      if (this.rev[raw] !== undefined) return this.rev[raw];
      if (raw === ' ' || LOGICAL.includes(raw)) return '';          // that key was given to another skill
      return raw;
    },
    label(l) { const p = physOf(l); return p === ' ' ? 'SPC' : p.length === 1 ? p.toUpperCase() : p.toUpperCase().slice(0, 4); },
    set(l, phys) {
      // swapping: whoever had this key gets the old one
      const other = LOGICAL.find(x => x !== l && physOf(x) === phys);
      const mine = physOf(l);
      S.binds = S.binds || {};
      S.binds[l] = phys;
      if (other) S.binds[other] = mine;
      save(); this.rebuild(); relabelHud();
    },
    reset() { S.binds = {}; save(); this.rebuild(); relabelHud(); },
    LOGICAL
  };
  Keybinds.rebuild();
  window.Keybinds = Keybinds;

  function relabelHud() {
    document.querySelectorAll('.skill-slot').forEach(s => {
      const k = s.querySelector('.skill-key');
      if (k && s.dataset.skill) { const l = Keybinds.label(s.dataset.skill); if (k.textContent !== l) k.textContent = l; }   // only when it changed: this runs from a MutationObserver
    });
  }

  // ------------------------------------------------------------------ audio
  const AUD = () => (typeof audio !== 'undefined' ? audio : null);
  function applyAudio() {
    const a = AUD();
    if (!a) return;
    try {
      if (a.sfxBus) { if (a._sfxBase == null) a._sfxBase = a.sfxBus.gain.value || 1; a.sfxBus.gain.value = a._sfxBase * S.sfx; }
      if (typeof a.syncMp3MusicPlayback === 'function') a.syncMp3MusicPlayback();
    } catch (e) {}
  }
  function installAudio() {
    const a = AUD();
    if (!a || a._volInstalled) return;
    a._volInstalled = true;
    const oSync = a.syncMp3MusicPlayback.bind(a);
    a.syncMp3MusicPlayback = function () {
      const r = oSync.apply(null, arguments);
      for (const t of Object.values(a.musicTracks || {})) if (t && !t.paused) t.volume = Math.max(0, Math.min(1, t.volume * S.music));
      return r;
    };
    const oVoice = a.playBossVoiceClip.bind(a);
    a.playBossVoiceClip = function () {
      const r = oVoice.apply(null, arguments);
      const c = a.currentVoiceAudio;
      if (c) c.volume = Math.max(0, Math.min(1, c.volume * S.voice));
      return r;
    };
    const oInit = a.init.bind(a);
    a.init = function () { const r = oInit.apply(null, arguments); applyAudio(); return r; };
    applyAudio();
  }

  // ------------------------------------------------------------------ interface
  let fpsEl = null, fpsFrames = 0, fpsT = 0;
  function applyUi() {
    document.documentElement.style.setProperty('--ui-scale', S.scale);
    document.documentElement.style.setProperty('--ui-alpha', S.alpha);
    if (S.fps && !fpsEl) { fpsEl = document.createElement('div'); fpsEl.id = 'fps-badge'; document.body.appendChild(fpsEl); }
    if (fpsEl) fpsEl.style.display = S.fps ? '' : 'none';
    applyPerf();
  }
  let perfPrev = null;
  function applyPerf() {
    const g = window.game;
    if (!g || !g.fx) return;
    if (S.perf) {
      if (perfPrev === null) perfPrev = g.fx.showAllyVfx !== false;
      if (typeof g.fx.setShowAllyVfx === 'function') { g.fx.setShowAllyVfx(false); if (g.syncAllyVfxButtons) g.syncAllyVfxButtons(); }
      document.body.classList.add('lowfx');
    } else if (perfPrev !== null) {
      if (typeof g.fx.setShowAllyVfx === 'function') { g.fx.setShowAllyVfx(perfPrev); if (g.syncAllyVfxButtons) g.syncAllyVfxButtons(); }
      perfPrev = null;
      document.body.classList.remove('lowfx');
    }
  }
  function tickFps(dt) {
    if (!S.fps || !fpsEl) return;
    fpsFrames++; fpsT += dt;
    if (fpsT >= 0.5) { fpsEl.textContent = Math.round(fpsFrames / fpsT) + ' fps'; fpsFrames = 0; fpsT = 0; }
  }

  // ------------------------------------------------------------------ backup / restore
  function exportData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('newtry1_') === 0) data[k] = localStorage.getItem(k);
    }
    const blob = new Blob([JSON.stringify({ app: 'newtry1', version: 1, saved: new Date().toISOString(), data }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chalice-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    try { const mt = JSON.parse(localStorage.getItem('newtry1_savemeta')) || {}; mt.lastBackup = Date.now(); localStorage.setItem('newtry1_savemeta', JSON.stringify(mt)); } catch (e) {} paintSaveStatus(); toast('Backup saved to your downloads');
  }
  function importData(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!j || j.app !== 'newtry1' || typeof j.data !== 'object') throw new Error('not a backup');
        let chars = 0;
        // characters are merged by id (the backup wins for the same character); everything else is restored as it was
        const incoming = j.data['newtry1_characters_v1'] ? JSON.parse(j.data['newtry1_characters_v1']) : null;
        const have = (() => { try { return JSON.parse(localStorage.getItem('newtry1_characters_v1')) || { chars: [] }; } catch (e) { return { chars: [] }; } })();
        if (incoming && Array.isArray(incoming.chars)) {
          const byId = new Map(have.chars.map(c => [c.id, c]));
          for (const c of incoming.chars) { byId.set(c.id, c); chars++; }
          have.chars = [...byId.values()].slice(0, 4);
          have.last = incoming.last || have.last;
          localStorage.setItem('newtry1_characters_v1', JSON.stringify(have));
        }
        for (const [k, v] of Object.entries(j.data)) {
          if (k.indexOf('newtry1_') !== 0 || k === 'newtry1_characters_v1' || typeof v !== 'string') continue;
          localStorage.setItem(k, v);
        }
        toast(`Restored ${chars} character${chars === 1 ? '' : 's'}. Reloading…`);
        setTimeout(() => location.reload(), 900);
      } catch (e) { toast('That file is not a valid backup'); }
    };
    r.readAsText(file);
  }

  // ------------------------------------------------------------------ the panel
  function tabify() {
    const m = $('settings-modal');
    if (!m || m.dataset.tabs) return;
    m.dataset.tabs = '1';
    m.classList.add('settings-tabs');
    const rows = [...m.querySelectorAll(':scope > .set-row')];
    const row = (k) => rows.find(r => { const s = r.querySelector('.set-seg'); return s && s.dataset.key === k; });
    const ctrlLabel = m.querySelector(':scope > .section-label'), ctrlGrid = m.querySelector(':scope > .ctrl-grid'), foot = m.querySelector(':scope > .set-foot');
    const mk = (id) => { const d = document.createElement('div'); d.className = 'st-pane'; d.dataset.pane = id; return d; };
    const panes = { general: mk('general'), audio: mk('audio'), controls: mk('controls'), interface: mk('interface'), data: mk('data') };

    for (const k of ['shake', 'calm', 'mouse', 'vfx']) { const r = row(k); if (r) panes.general.appendChild(r); }
    const snd = row('sound'); if (snd) panes.audio.appendChild(snd);

    const slider = (id, label, hint, key, min, max, step, fmt) => `
      <div class="set-row"><div><b>${label}</b><small>${hint}</small></div>
        <div class="set-slide"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${S[key]}"><span id="${id}-v">${fmt(S[key])}</span></div></div>`;
    const pct = (v) => Math.round(v * 100) + '%';
    panes.audio.insertAdjacentHTML('beforeend',
      slider('sp-music', 'Music', 'The battle themes', 'music', 0, 1, 0.05, pct) +
      slider('sp-sfx', 'Effects', 'Hits, skills and footsteps', 'sfx', 0, 1, 0.05, pct) +
      slider('sp-voice', 'Boss voice', 'Vaelgor\'s spoken lines', 'voice', 0, 1, 0.05, pct));

    panes.interface.insertAdjacentHTML('beforeend',
      slider('sp-scale', 'UI size', 'Skill bar, boss bar, party and buttons', 'scale', 0.8, 1.4, 0.05, pct) +
      slider('sp-alpha', 'HUD opacity', 'How solid the on-screen panels are', 'alpha', 0.4, 1, 0.05, pct) +
      `<div class="set-row"><div><b>FPS counter</b><small>A small number in the top-left corner</small></div>
        <div class="set-seg" data-key="fps"><button data-v="on">Show</button><button data-v="off">Hide</button></div></div>
       <div class="set-row"><div><b>Performance mode</b><small>Hides teammates' skill effects. Helps on slower computers</small></div>
        <div class="set-seg" data-key="perf"><button data-v="on">On</button><button data-v="off">Off</button></div></div>
       <div class="set-row"><div><b>Arena scenery</b><small>The cathedral, sky and pillars around the Vaelgor fight. Auto turns it down if the game is running slowly. Off is the plain floor.</small></div>
        <div class="set-seg" data-key="env"><button data-v="auto">Auto</button><button data-v="full">Full</button><button data-v="simple">Simple</button><button data-v="off">Off</button></div></div>
       <div class="set-row"><div><b>Weapon glow</b><small>The shine on enhanced weapons (+6 and up), yours and your teammates'</small></div>
        <div class="set-seg" data-key="glow"><button data-v="on">On</button><button data-v="off">Off</button></div></div>
       <div class="set-row"><div><b>Extra popup text</b><small>Words that float over your head for things the skill bar and status icons already show (class names, SYNC, MOMENTUM, BULWARK...). Off keeps the screen clean; damage numbers and results always show.</small></div>
        <div class="set-seg" data-key="extraText"><button data-v="on">On</button><button data-v="off">Off</button></div></div>`);

    panes.controls.insertAdjacentHTML('beforeend', `
      <div class="section-label">Skill keys <small>click a key, then press the new one</small></div>
      <div class="kb-grid" id="kb-grid"></div>
      <div class="set-foot"><button class="nav-btn" id="kb-reset">Reset keys</button></div>
      <div class="section-label">Emote wheel <small>Alt + left-click opens it; Alt + 1–8 sends a line. Middle-click pings.</small></div>
      <div class="emo-grid" id="emo-grid"></div>`);
    if (ctrlLabel) panes.controls.appendChild(ctrlLabel);
    if (ctrlGrid) panes.controls.appendChild(ctrlGrid);

    panes.data.insertAdjacentHTML('beforeend', `
      <div class="set-row"><div><b>Where your characters are saved</b><small id="sp-status">…</small></div></div>
      <div class="set-row"><div><b>Back up characters</b><small>Saves every character, their gear and your settings to a file. Do this before clearing browser data or switching computers.</small></div>
        <button class="nav-btn amber" id="sp-export">Save backup</button></div>
      <div class="set-row"><div><b>Restore from a backup</b><small>Adds the characters from a backup file. A character that exists in both is replaced by the backup's copy.</small></div>
        <button class="nav-btn" id="sp-import">Choose file</button><input type="file" id="sp-file" accept=".json,application/json" hidden></div>`);

    if (foot) panes.data.appendChild(foot);

    const bar = document.createElement('div');
    bar.className = 'st-tabs';
    const names = [['general', 'General'], ['audio', 'Audio'], ['controls', 'Controls'], ['interface', 'Interface'], ['data', 'Data']];
    bar.innerHTML = names.map(([id, n]) => `<button data-t="${id}">${n}</button>`).join('');
    const hdr = m.querySelector('.modal-hdr');
    hdr.insertAdjacentElement('afterend', bar);
    for (const id of Object.keys(panes)) m.appendChild(panes[id]);
    const show = (id) => {
      bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
      for (const [k, p] of Object.entries(panes)) p.style.display = k === id ? '' : 'none';
      try { sessionStorage.setItem('sp_tab', id); } catch (e) {}
    };
    bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.t); });
    let first = 'general'; try { first = sessionStorage.getItem('sp_tab') || 'general'; } catch (e) {}
    show(panes[first] ? first : 'general');

    // sliders
    const bindSlider = (id, key, fmt, after) => {
      const el = $(id); if (!el) return;
      el.addEventListener('input', () => { S[key] = parseFloat(el.value); $(id + '-v').textContent = fmt(S[key]); save(); after(); });
    };
    bindSlider('sp-music', 'music', pct, applyAudio);
    bindSlider('sp-sfx', 'sfx', pct, applyAudio);
    bindSlider('sp-voice', 'voice', pct, () => { const c = AUD() && AUD().currentVoiceAudio; if (c) c.volume = Math.max(0, Math.min(1, 0.95 * S.voice)); });
    bindSlider('sp-scale', 'scale', pct, applyUi);
    bindSlider('sp-alpha', 'alpha', pct, applyUi);

    // on/off segs
    const paintSegs = () => {
      m.querySelectorAll('.set-seg[data-key="fps"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'on') === !!S.fps));
      m.querySelectorAll('.set-seg[data-key="perf"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'on') === !!S.perf));
      m.querySelectorAll('.set-seg[data-key="glow"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'on') === (S.glow !== false)));
      m.querySelectorAll('.set-seg[data-key="env"] button').forEach(b => b.classList.toggle('on', b.dataset.v === (S.env || 'auto')));
      m.querySelectorAll('.set-seg[data-key="extraText"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'on') === !!S.extraText));
    };
    m.addEventListener('click', (e) => {
      const b = e.target.closest('.set-seg button'); if (!b) return;
      const key = b.parentNode.dataset.key;
      if (key === 'fps') { S.fps = b.dataset.v === 'on'; save(); applyUi(); paintSegs(); }
      else if (key === 'glow') { S.glow = b.dataset.v === 'on'; save(); paintSegs(); }
      else if (key === 'extraText') { S.extraText = b.dataset.v === 'on'; save(); paintSegs(); }
      else if (key === 'env') { S.env = b.dataset.v; save(); paintSegs(); }
      else if (key === 'perf') { S.perf = b.dataset.v === 'on'; save(); applyUi(); paintSegs(); }
    });
    paintSegs();

    // key bindings
    const paintKeys = () => {
      const g = window.game, cls = g && g.playerClass || 'breaker';
      const meta = window.SKILL_META && window.SKILL_META[cls] && window.SKILL_META[cls].skills || {};
      $('kb-grid').innerHTML = LOGICAL.map(l => {
        const nm = meta[l] ? (meta[l].name || meta[l].short || '') : '';
        return `<div class="kb-row"><span>${l === 'space' ? 'Evade' : 'Skill ' + l.toUpperCase()}<small>${esc(nm)}</small></span><button class="kb-key" data-l="${l}">${esc(Keybinds.label(l))}</button></div>`;
      }).join('');
    };
    let listening = null;
    $('kb-grid').addEventListener('click', (e) => {
      const b = e.target.closest('.kb-key'); if (!b) return;
      listening = b.dataset.l; b.textContent = 'press a key'; b.classList.add('listen');
    });
    window.addEventListener('keydown', (e) => {
      if (!listening) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const raw = e.key.toLowerCase();
      const l = listening; listening = null;
      if (raw === 'escape') { paintKeys(); return; }
      if (RESERVED.has(raw) || (raw.length > 1 && raw !== ' ')) { toast('That key is used for something else'); paintKeys(); return; }
      Keybinds.set(l, raw);
      paintKeys();
    }, true);
    $('kb-reset').addEventListener('click', () => { Keybinds.reset(); paintKeys(); toast('Keys reset'); });
    paintKeys();
    new MutationObserver(() => { if (!m.classList.contains('hidden')) { paintKeys(); paintSegs(); } }).observe(m, { attributes: true, attributeFilter: ['class'] });

    // emote lines
    const eg = $('emo-grid');
    eg.innerHTML = S.emotes.map((t, i) => `<label><span>${i + 1}</span><input type="text" maxlength="24" data-i="${i}" value="${esc(t)}"></label>`).join('');
    eg.addEventListener('input', (e) => {
      const i = e.target.dataset && e.target.dataset.i; if (i == null) return;
      S.emotes[+i] = e.target.value.slice(0, 24) || DEFAULT_EMOTES[+i]; save();
    });

    paintSaveStatus();
    new MutationObserver(() => { if (!m.classList.contains('hidden')) paintSaveStatus(); }).observe(m, { attributes: true, attributeFilter: ['class'] });
    $('sp-export').addEventListener('click', exportData);
    $('sp-import').addEventListener('click', () => $('sp-file').click());
    $('sp-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) importData(f); e.target.value = ''; });
  }

  // ------------------------------------------------------------------ last room code
  function rememberRoom() {
    const g = window.game, input = $('join-code-input');
    try { const last = localStorage.getItem('newtry1_lastroom'); if (input && !input.value && last) input.value = last; } catch (e) {}
    if (!g || !g.net) return;
    const oJoin = g.net.joinRoom.bind(g.net);
    g.net.joinRoom = function (code) { try { localStorage.setItem('newtry1_lastroom', String(code || '').trim().toUpperCase()); } catch (e) {} return oJoin.apply(null, arguments); };
  }

  // ------------------------------------------------------------------ save safeguards
  // Characters live in this browser's storage for THIS address only. These checks make a loss visible instead of silent:
  // ask the browser to keep the data, keep a second copy to heal a corrupted/blanked entry, show where it is saved, and nudge a backup.
  const META = 'newtry1_savemeta', CH = 'newtry1_characters_v1', CH2 = 'newtry1_characters_v1_copy';
  const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const charCount = () => { const c = readJson(CH); return c && Array.isArray(c.chars) ? c.chars.length : 0; };
  function safeguards() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    const meta = readJson(META) || {};
    // heal: the entry is gone or empty but the second copy is fine -> restore it
    const copy = readJson(CH2);
    if (charCount() === 0 && copy && Array.isArray(copy.chars) && copy.chars.length) {
      try { localStorage.setItem(CH, JSON.stringify(copy)); toast(`Recovered ${copy.chars.length} character${copy.chars.length === 1 ? '' : 's'} from the safety copy. Reloading…`); setTimeout(() => location.reload(), 1200); return; } catch (e) {}
    }
    const n = charCount();
    if (n > 0) { try { localStorage.setItem(CH2, localStorage.getItem(CH)); } catch (e) {} }
    const where = location.origin + location.pathname.replace(/[^/]*$/, '');
    if (meta.where && meta.where !== where && n === 0) setTimeout(() => toast('This copy of the game is opened from a different place than before, so your old characters are not here. Settings > Data > Restore, or open the old one.'), 2500);
    else if (!meta.seen && n === 0) setTimeout(() => toast('No characters here yet. If you had some in an older version: Settings > Data > Restore from a backup.'), 2500);
    else if (n > 0 && (!meta.lastBackup || Date.now() - meta.lastBackup > 5 * 86400000)) setTimeout(() => toast('Tip: Settings > Data > Save backup keeps your characters safe between versions.'), 4000);
    meta.where = where; meta.seen = true; try { localStorage.setItem(META, JSON.stringify(meta)); } catch (e) {}
  }
  function paintSaveStatus() {
    const el = $('sp-status'); if (!el) return;
    const n = charCount(), meta = readJson(META) || {};
    const bk = meta.lastBackup ? new Date(meta.lastBackup).toLocaleDateString() : 'never';
    el.textContent = `${window.CHALICE ? `Chalice ${window.CHALICE.version} · ` : ''}${n} character${n === 1 ? '' : 's'} saved at ${location.origin + location.pathname.replace(/[^/]*$/, '')} · last backup: ${bk}`;
  }

  function init() {
    const g = window.game;
    if (!g) return;
    safeguards();
    installAudio();
    const oUpdate = Game25D.prototype.update;
    Game25D.prototype.update = function (dt) { tickFps(dt); return oUpdate.call(this, dt); };
    const hud = $('bottom-action-hud');
    if (hud) new MutationObserver(relabelHud).observe(hud, { childList: true, subtree: true });
    relabelHud();
    tabify();
    applyUi();
    rememberRoom();
  }
  window.SettingsPlus = { get: () => S, emotes: () => S.emotes.slice(), save, applyAudio };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else setTimeout(init, 0);
})();
