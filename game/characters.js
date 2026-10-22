// =========================================================================
// CHARACTERS.JS — title screen, character slots, and the character creator.
//
//   title  ->  slots (up to 4 saved characters)  ->  hub
//                      \-> creator: class, name, colours (the hub model is shown behind it)
//
// A character is { id, name, classId, look, created, played }. Each one has its OWN forge save (gear, materials, clears), kept under
// `newtry1_char_<id>_forge`. The very first character created in a browser adopts the old single-save progress, so nothing is lost.
// `look` is { cloth, accent, skin?, hair? } and is sent with the player state so friends see your colours.
// window.CharSelect keeps the old API (isOpen / open) that main.js, hub_scene.js and qol.js already call.
// =========================================================================
(function () {
  const GAME_TITLE = 'CHALICE OF THE BLACK SUN';
  const STORE_KEY = 'newtry1_characters_v1';
  const LEGACY_FORGE = 'newtry1_vindictus_pure_save_v2';
  const LEGACY_PROFILE = 'newtry1_profile';
  const MAX_SLOTS = 4;
  const forgeKey = (id) => `newtry1_char_${id}_forge`;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Deliberately light on detail: the classes should still have things left to discover.
  const CLASSES = {
    breaker: {
      title: 'Breaker', role: 'Greatsword vanguard', accent: '#38bdf8', difficulty: 2,
      blurb: 'Disciplined, heavy-hitting and built around reading the boss. Shatter armor, punish openings, and let the pressure build.',
      perks: ['Armor Fracture weakens the boss with every heavy hit', 'Overpower Surge turns a full gauge into a burst window', 'Parry and counter tools reward good timing']
    },
    hammer: {
      title: 'Gravebreaker', role: 'Charge-hammer bruiser', accent: '#fb923c', difficulty: 4,
      blurb: 'Big swings, bigger payoffs. Crack the boss with Broken stacks, hurl your hammer, and keep your Momentum rolling.',
      perks: ['Broken makes the boss take more damage from everyone', 'Momentum rewards perfect hammer catches', 'Heavy, committal skills with huge impact']
    },
    reaper: {
      title: 'Reaper', role: 'Chain-scythe hunter', accent: '#e11d48', difficulty: 5,
      blurb: 'Fragile, hungry and fast. Feed on the boss to build a shield, spend it in bigger hits, and fill the blood sphere to become something else entirely.',
      perks: ['Drain the boss into a shield, then spend it for damage', 'Lower max HP, higher rewards for staying in the fight', 'A full blood sphere unleashes Voidform']
    },
    arclight: {
      title: 'Arclight', role: 'Mech frame, twin blades & drone', accent: '#38bdf8', difficulty: 4,
      blurb: 'A sleek mech frame with wings, twin wrist-blades that slide out when you strike, and a drone that docks onto your arm as a cannon. Swap between blades and beams on the fly and ride your core as it heats up.',
      perks: ['Twin retractable wrist-blades up close, a drone-cannon at range, swapped with one key', 'Chain blades into beam to fill the Solar core, then fire a gigantic cannon beam', 'A drone that fights beside you and calls down a satellite']
    }
  };
  CLASSES.unbound = {
    title: 'Unbound', role: 'Limiter bracers & restrained power', accent: '#e2e8f0', difficulty: 3,
    blurb: 'Far stronger than anyone here, and bored about it. Stay calm, fight clean, and let a little of it out when it counts.',
    perks: ['Looks harmless on purpose', 'Clean play builds Restraint, and what builds it decides what you release', 'One enormous release instead of a long rotation']
  };
  const ORDER = ['breaker', 'hammer', 'reaper', 'arclight', 'unbound'];
  const SKILL_ORDER = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't'];

  // ---- colours ---------------------------------------------------------------------------------
  const PALETTE = {
    cloth: [['Crimson', '#8f2a1a'], ['Azure', '#1f6ea8'], ['Verdant', '#2f7d46'], ['Violet', '#6d3fb0'], ['Slate', '#566474'], ['Amber', '#b5651d'], ['Teal', '#1d8a86'], ['Rose', '#b0386b']],
    accent: [['Sky', '#38bdf8'], ['Gold', '#f59e0b'], ['Scarlet', '#ef4444'], ['Emerald', '#34d399'], ['Violet', '#a78bfa'], ['Rose', '#fb7185'], ['Bone', '#e5e7eb'], ['Orange', '#fb923c']],
    skin: [['Fair', '#f1d3b8'], ['Light', '#e0ac80'], ['Tan', '#c58a63'], ['Bronze', '#9a6a45'], ['Brown', '#6f4a30'], ['Deep', '#47301f']],
    hair: [['Black', '#1f1410'], ['Brown', '#5a3a22'], ['Auburn', '#a0522d'], ['Blond', '#d6b370'], ['Silver', '#c9c9c9'], ['Ember', '#b4351c']]
  };
  // what each class lets you colour (the Breaker's helm covers his face, so no skin or hair there)
  const GROUPS = {
    breaker: [['cloth', 'Cloak'], ['accent', 'Plume & visor']],
    hammer: [['skin', 'Skin'], ['hair', 'Hair'], ['accent', 'War paint']],      // his armor follows the armor tier you wear
    reaper: [['skin', 'Skin'], ['accent', 'Eye glow']],                         // hood and armor follow the armor tier
    unbound: [['cloth', 'Uniform'], ['skin', 'Skin'], ['hair', 'Hair'], ['accent', 'Eyes & tie']],      // the trim follows the armor tier
    arclight: [['accent', 'Eye & core glow']]                                   // the frame follows the armor tier
  };
  const DEFAULT_LOOK = {
    breaker: { cloth: '#1f6ea8', accent: '#38bdf8' },
    hammer: { accent: '#d97706', skin: '#c58a63', hair: '#1f1410' },
    reaper: { accent: '#fb7185', skin: '#b89c86' },
    unbound: { cloth: '#566474', accent: '#ef4444', skin: '#e0ac80', hair: '#1f1410' },
    arclight: { accent: '#38bdf8' }
  };
  const HEX = /^#[0-9a-f]{6}$/i;
  // Anything that arrives over the network is checked before it is ever used as a colour.
  function cleanLook(look, cls) {
    const base = DEFAULT_LOOK[cls] || DEFAULT_LOOK.breaker, out = {};
    for (const k of Object.keys(base)) out[k] = (look && typeof look[k] === 'string' && HEX.test(look[k])) ? look[k] : base[k];
    return out;
  }

  // ---- storage ---------------------------------------------------------------------------------
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && Array.isArray(s.chars)) return s; } catch (e) {}
    return { chars: [], last: null };
  }
  function save(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }
  const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  function forgeSummary(c) {
    try { const f = JSON.parse(localStorage.getItem(forgeKey(c.id))); return f ? { cleared: f.cleared || {}, clears: f.clears || 0 } : { cleared: {}, clears: 0 }; } catch (e) { return { cleared: {}, clears: 0 }; }
  }

  // ---- state -----------------------------------------------------------------------------------
  let screen = null;       // 'title' | 'slots' | 'create' | null
  let draft = null;        // the character being created / edited
  let editing = false;
  let raf = null, spinTimer = null, savedZoom = 1.05;
  let root = null, bg = null, bgc = null;

  function ensureRoot() {
    if (root) return;
    const old = $('char-select'); if (old) old.remove();
    root = document.createElement('div');
    root.id = 'char-select';
    root.className = 'hidden';
    document.body.appendChild(root);
  }

  function setScreen(name) {
    ensureRoot();
    screen = name;
    root.className = name ? `cx-${name}` : 'hidden';
    document.body.classList.toggle('cs-open', !!name);
    stopBg();
    if (name === 'title' || name === 'slots') startBg();
  }

  // animated eclipse behind the title and the slot list
  function startBg() {
    bg = root.querySelector('canvas.cx-bg');
    if (!bg) return;
    bgc = bg.getContext('2d');
    const loop = () => {
      if (!bg || !bg.isConnected || (screen !== 'title' && screen !== 'slots')) { raf = null; return; }
      const dpr = 1, w = bg.clientWidth || 1280, h = bg.clientHeight || 720;
      if (bg.width !== Math.round(w * dpr) || bg.height !== Math.round(h * dpr)) { bg.width = Math.round(w * dpr); bg.height = Math.round(h * dpr); }
      window.EclipseArt.draw(bgc, bg.width, bg.height, performance.now() * 0.001, screen === 'title' ? { cy: 0.3, r: 0.17 } : { cy: 0.2, r: 0.1, mist: true });
      raf = requestAnimationFrame(loop);
    };
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function stopBg() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  // ---- title -----------------------------------------------------------------------------------
  function showTitle() {
    setScreen('title');
    root.innerHTML = `
      <canvas class="cx-bg"></canvas>
      <div class="cx-title">
        <div class="cx-kicker">A CO-OP BOSS RAID</div>
        <h1>${GAME_TITLE}</h1>
        <button class="cx-start" id="cx-start">Press to begin</button>
      </div>
      <div class="cx-foot">Best with friends · 1–4 players · ${window.CHALICE ? `Chalice ${window.CHALICE.version}` : ''}</div>`;
    startBg();
    $('cx-start').addEventListener('click', showSlots);
  }

  // ---- slots -----------------------------------------------------------------------------------
  function agoText(t) {
    if (!t) return 'New';
    const d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? 'Played today' : d === 1 ? 'Played yesterday' : `Played ${d} days ago`;
  }
  function showSlots() {
    const g = window.game;
    if (g && g.net && g.net.isConnected()) { if (window.QoL) window.QoL.toast('Leave the co-op room before switching characters'); return; }
    if (g && g.mode !== 'hub') return;
    const s = load();
    if (!s.chars.length) { startCreate(); return; }
    setScreen('slots');
    const cards = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const c = s.chars[i];
      if (!c) { cards.push(`<button class="cx-slot empty" data-new="1"><span class="cx-plus">+</span><b>New character</b></button>`); continue; }
      const k = CLASSES[c.classId] || CLASSES.breaker, f = forgeSummary(c);
      const marks = [f.cleared.normal ? 'Normal' : '', f.cleared.hard ? 'Hard' : ''].filter(Boolean);
      const sw = Object.entries(cleanLook(c.look, c.classId)).filter(([key]) => key === 'cloth' || key === 'accent' || key === 'skin').map(([, v]) => `<i style="background:${v}"></i>`).join('');
      cards.push(`
        <div class="cx-slot" data-id="${c.id}" style="--accent:${k.accent}" tabindex="0">
          <canvas class="cx-portrait" width="220" height="250" data-id="${c.id}"></canvas>
          <div class="cx-slot-name">${esc(c.name)}</div>
          <div class="cx-slot-class">${k.title}</div>
          <div class="cx-slot-sw">${sw}</div>
          <div class="cx-slot-meta">${marks.length ? 'Cleared · ' + marks.join(' · ') : 'No raids cleared'}</div>
          <div class="cx-slot-meta dim">${agoText(c.played)}</div>
          <div class="cx-slot-act"><button data-edit="${c.id}">Customize</button><button data-del="${c.id}" class="del">Delete</button></div>
        </div>`);
    }
    root.innerHTML = `
      <canvas class="cx-bg"></canvas>
      <div class="cx-slots-wrap">
        <div class="cx-kicker">${GAME_TITLE}</div>
        <h2>Choose your warden</h2>
        <div class="cx-slots">${cards.join('')}</div>
        <div class="cx-hint">Click a character to enter the sanctum${g && g.mode ? '' : ''}</div>
      </div>`;
    startBg();
    root.querySelectorAll('.cx-slot[data-id]').forEach(el => el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      play(el.dataset.id);
    }));
    root.querySelectorAll('[data-new]').forEach(el => el.addEventListener('click', () => startCreate()));
    root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => startCreate(b.dataset.edit)));
    root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => confirmDelete(b.dataset.del)));
    root.querySelectorAll('canvas.cx-portrait').forEach(cv => {
      const c = s.chars.find(q => q.id === cv.dataset.id);
      drawPortrait(cv, c);
    });
  }

  function confirmDelete(id) {
    const s = load(), c = s.chars.find(q => q.id === id);
    if (!c) return;
    const slot = root.querySelector(`.cx-slot[data-id="${id}"] .cx-slot-act`);
    if (!slot) return;
    slot.innerHTML = `<span class="cx-confirm">Delete ${esc(c.name)} and all their progress?</span><button data-yes class="del">Delete</button><button data-no>Keep</button>`;
    slot.querySelector('[data-yes]').addEventListener('click', () => {
      const st = load();
      st.chars = st.chars.filter(q => q.id !== id);
      if (st.last === id) st.last = null;
      save(st);
      try { localStorage.removeItem(forgeKey(id)); } catch (e) {}
      showSlots();
    });
    slot.querySelector('[data-no]').addEventListener('click', () => showSlots());
  }

  // A small portrait drawn with the real model; if anything about the pose isn't ready we simply leave the card without one.
  function drawPortrait(cv, c) {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    try {
      const Cls = c.classId === 'unbound' ? window.UnboundPlayer25D : c.classId === 'arclight' ? window.ArclightPlayer25D : (c.classId === 'reaper' ? window.ReaperPlayer25D : (c.classId === 'hammer' ? window.HammerPlayer25D : window.BreakerPlayer25D));
      const p = new Cls('portrait', c.name, 0, 0, false, false);
      p.look = cleanLook(c.look, c.classId);
      p.facingAngle = Math.PI * 0.5 - 0.35;
      p.noPlate = true;
      // dress the portrait in what this character actually wears (weapon, armor tier, accessories, wings)
      try { new VindictusForgeSystem(forgeKey(c.id)).applyEquipmentToPlayer(p); } catch (e) { /* default gear */ }
      if (p.snapFeetToBody) p.snapFeetToBody();
      ctx.save();
      ctx.translate(cv.width / 2, cv.height * 0.8);
      const sc = cv.height / (c.classId === 'hammer' ? 260 : (c.classId === 'reaper' ? 240 : (c.classId === 'arclight' ? 215 : (c.classId === 'unbound' ? 200 : 190))));      // the hammer is much taller than the sword
      ctx.scale(sc, sc);
      p.draw(ctx);
    } catch (e) { /* no portrait */ }
    ctx.restore();
  }

  // ---- creator ---------------------------------------------------------------------------------
  // The icon for a skill: the painted PNG (game/icons/skill_<class>_<key>.png) when there is one, otherwise its emoji.
  function skillIcon(cls, k, s) {
    const fall = `<span class="cs-ico-emoji">${s.icon || '•'}</span>`;
    const src = s.img || `game/icons/skill_${cls}_${k}.png`;
    return `<img class="cs-ico" src="${src}" alt="" draggable="false" onerror="this.outerHTML=this.dataset.fb" data-fb="${esc(fall)}">`;
  }

  // The selected class as blocks of text: passive, the [Z] identity, then every skill with its icon, key, cooldown and description.
  function detailHtml(cls) {
    const c = CLASSES[cls], meta = window.SKILL_META && window.SKILL_META[cls];
    if (!c || !meta) return '';
    const dots = Array.from({ length: 5 }, (_, n) => `<i class="${n < c.difficulty ? 'on' : ''}"></i>`).join('');
    const block = (k, s, tag) => `
      <div class="cs-sk">
        <div class="cs-sk-ic">${skillIcon(cls, k, s)}</div>
        <div class="cs-sk-tx">
          <div class="cs-sk-h"><kbd>${tag || (k === 'space' ? 'SPC' : k.toUpperCase())}</kbd><b>${esc(s.name)}</b>${s.cd ? `<em>${esc(s.cd)}</em>` : ''}</div>
          <p>${s.desc}</p>
        </div>
      </div>`;
    const order = SKILL_ORDER.concat(meta.skills.v ? ['v'] : []).filter(k => meta.skills[k]);
    return `
      <div class="cs-d-head" style="--accent:${c.accent}"><div><div class="cs-name-big">${c.title}</div><div class="cs-role">${c.role}</div></div><div class="cs-diff"><span>Complexity</span>${dots}</div></div>
      <p class="cs-blurb">${c.blurb}</p>
      <ul class="cs-perks">${c.perks.map(p => `<li>${p}</li>`).join('')}</ul>
      ${meta.passive ? `<div class="cs-pass"><b>Passive · ${esc(meta.passive.name)}</b><p>${meta.passive.desc}</p></div>` : ''}
      <div class="cs-sk-grid">
        ${meta.skills.z ? block('z', meta.skills.z, 'Z') : ''}
        ${order.map(k => block(k, (meta.blade && meta.blade[k]) ? Object.assign({}, meta.skills[k], meta.blade[k]) : meta.skills[k], k === 'v' ? 'T' : null)).join('')}
      </div>
      ${meta.void ? `<div class="cs-d-sub">Voidform skills</div><div class="cs-sk-grid">${['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'].filter(k => meta.void[k]).map(k => block('v' + k, meta.void[k], k.toUpperCase())).join('')}</div>` : ''}
      ${meta.beam ? `<div class="cs-d-sub">Beam mode skills</div><div class="cs-sk-grid">${['q', 'w', 'e', 'r', 'a', 's', 'f'].filter(k => meta.beam[k]).map(k => block('b' + k, meta.beam[k], k.toUpperCase())).join('')}</div>` : ''}`;
  }

  function startCreate(editId) {
    const g = window.game;
    if (g && g.mode !== 'hub') return;
    const s = load();
    editing = !!editId;
    if (editing) {
      const c = s.chars.find(q => q.id === editId);
      if (!c) return showSlots();
      draft = { id: c.id, name: c.name, classId: c.classId, look: cleanLook(c.look, c.classId) };
    } else {
      if (s.chars.length >= MAX_SLOTS) return showSlots();
      let prof = {}; try { prof = JSON.parse(localStorage.getItem(LEGACY_PROFILE)) || {}; } catch (e) {}
      const cls = (prof.cls === 'hammer' || prof.cls === 'reaper' || prof.cls === 'arclight' || prof.cls === 'unbound') ? prof.cls : 'breaker';
      draft = { id: null, name: s.chars.length ? '' : (prof.name || ''), classId: cls, look: cleanLook(null, cls) };
    }
    setScreen('create');
    savedZoom = (g.camera && g.camera.targetZoom) || 1.05;
    g.camera.targetZoom = 1.35;
    g.closeAllModals();
    paintCreator();
    applyDraft();
    startSpin();
    const nm = $('cs-name'); if (nm && !editing) setTimeout(() => nm.focus(), 50);
  }

  function paintCreator() {
    const cards = ORDER.map(id => {
      const c = CLASSES[id];
      const dots = Array.from({ length: 5 }, (_, n) => `<i class="${n < c.difficulty ? 'on' : ''}"></i>`).join('');
      return `
        <button class="cs-card compact ${draft.classId === id ? 'sel' : ''} ${editing && draft.classId !== id ? 'off' : ''}" data-class="${id}" style="--accent:${c.accent}">
          <div class="cs-head"><div><div class="cs-name-big">${c.title}</div><div class="cs-role">${c.role}</div></div></div>
          <div class="cs-diff"><span>Complexity</span>${dots}</div>
        </button>`;
    }).join('');
    root.innerHTML = `
      <div class="cs-title"><div class="cs-logo">${editing ? 'Customize' : 'New character'}</div><div class="cs-sub">${editing ? 'Change your name and colours' : 'Choose a class, a name and your colours'}</div></div>
      <div class="cs-cards stack" id="cs-cards">${cards}</div>
      <div class="cs-detail" id="cs-detail">${detailHtml(draft.classId)}</div>
      <div class="cs-footer">
        <div class="cx-look" id="cx-look"></div>
        <label class="cs-name"><span>Name</span><input id="cs-name" type="text" maxlength="16" placeholder="Name your warden" autocomplete="off" value="${esc(draft.name)}"></label>
        <div class="cx-btns"><button id="cs-back" class="cx-ghost">Back</button><button id="cs-begin" class="cs-begin">${editing ? 'Save' : 'Create & enter'}</button></div>
        <div class="cs-hint"><kbd>←</kbd> <kbd>→</kbd> class &nbsp;·&nbsp; <kbd>Enter</kbd> confirm &nbsp;·&nbsp; <kbd>Esc</kbd> back</div>
      </div>`;
    root.querySelectorAll('.cs-card').forEach(el => el.addEventListener('click', () => chooseClass(el.dataset.class)));
    $('cs-begin').addEventListener('click', confirmCreate);
    $('cs-back').addEventListener('click', backToSlots);
    $('cs-name').addEventListener('input', (e) => { draft.name = e.target.value.slice(0, 16); if (window.game && window.game.localPlayer) window.game.localPlayer.name = draft.name.trim() || 'New warden'; });
    paintLook();
  }

  function paintLook() {
    const box = $('cx-look');
    if (!box) return;
    box.innerHTML = GROUPS[draft.classId].map(([key, label]) => `
      <div class="cx-grp"><span>${label}</span><div class="cx-sw">${PALETTE[key].map(([nm, hex]) =>
        `<button type="button" class="cx-dot ${draft.look[key].toLowerCase() === hex.toLowerCase() ? 'on' : ''}" data-k="${key}" data-v="${hex}" title="${nm}" style="background:${hex}"></button>`).join('')}</div></div>`).join('');
    box.querySelectorAll('.cx-dot').forEach(b => b.addEventListener('click', () => {
      draft.look[b.dataset.k] = b.dataset.v;
      applyDraft(); paintLook();
    }));
  }

  function chooseClass(cls) {
    if (!CLASSES[cls] || editing || draft.classId === cls) return;
    draft.classId = cls;
    draft.look = cleanLook(null, cls);
    root.querySelectorAll('.cs-card').forEach(el => el.classList.toggle('sel', el.dataset.class === cls));
    const det = $('cs-detail'); if (det) { det.innerHTML = detailHtml(cls); det.scrollTop = 0; }
    applyDraft(); paintLook();
  }

  // show the draft on the real hub model behind the creator
  function applyDraft() {
    const g = window.game;
    if (!g) return;
    if (g.localPlayer) g.localPlayer.look = draft.look;
    if (g.playerClass !== draft.classId) g.setPlayerClass(draft.classId);
    if (g.localPlayer) g.localPlayer.look = draft.look;
  }

  function startSpin() {
    stopSpin();
    const t0 = performance.now();
    spinTimer = setInterval(() => {
      const g = window.game;
      if (!g || !g.localPlayer || screen !== 'create') return;
      g.localPlayer.facingAngle = Math.PI * 0.5 + Math.sin((performance.now() - t0) * 0.0007) * 0.75;
    }, 40);
  }
  function stopSpin() { if (spinTimer) { clearInterval(spinTimer); spinTimer = null; } }

  function backToSlots() {
    const g = window.game;
    stopSpin();
    if (g && g.camera) g.camera.targetZoom = savedZoom || 1.05;
    // put the hub model back to the last character so nothing odd lingers behind the list
    const s = load();
    if (!s.chars.length) { showTitle(); return; }
    showSlots();
  }

  function confirmCreate() {
    const name = ((draft.name || '').trim()).slice(0, 16);
    const nm = $('cs-name');
    if (!name) { if (nm) { nm.classList.remove('bad'); void nm.offsetWidth; nm.classList.add('bad'); nm.focus(); } return; }
    const s = load();
    let c;
    if (editing) {
      c = s.chars.find(q => q.id === draft.id);
      if (!c) return showSlots();
      c.name = name; c.look = cleanLook(draft.look, c.classId);
    } else {
      c = { id: newId(), name, classId: draft.classId, look: cleanLook(draft.look, draft.classId), created: Date.now(), played: 0 };
      // the first character in this browser keeps the progress made before characters existed
      if (!s.chars.length) { try { const old = localStorage.getItem(LEGACY_FORGE); if (old) localStorage.setItem(forgeKey(c.id), old); } catch (e) {} }
      s.chars.push(c);
    }
    save(s);
    play(c.id);
  }

  // ---- entering the game with a character --------------------------------------------------------
  function play(id) {
    const g = window.game;
    const s = load(), c = s.chars.find(q => q.id === id);
    if (!g || !c) return;
    stopSpin();
    // this character's own save
    if (typeof VindictusForgeSystem !== 'undefined') g.forge = new VindictusForgeSystem(forgeKey(c.id));
    const look = cleanLook(c.look, c.classId);
    g.playerName = c.name;
    g.localPlayer.look = look;
    if (g.playerClass !== c.classId) g.setPlayerClass(c.classId);
    const p = g.localPlayer;
    p.look = look; p.name = c.name; p.facingAngle = Math.PI * 0.5;
    g.forge.applyEquipmentToPlayer(p);
    g.character = c;
    c.played = Date.now(); s.last = c.id; save(s);
    try { localStorage.setItem(LEGACY_PROFILE, JSON.stringify({ cls: c.classId, name: c.name })); } catch (e) {}
    setScreen(null);
    g.camera.targetZoom = savedZoom || 1.05;
    if (g.renderForgeModal) g.renderForgeModal();
    g.updateAllUI();
    g.renderPartyFramesHUD();
    const btn = $('btn-class-select');
    if (btn) btn.textContent = c.name;
    if (window.SkillHud) { g._hud = null; window.SkillHud.build(p); }
  }

  // ---- keys --------------------------------------------------------------------------------------
  function onKey(e) {
    if (!screen) return;
    const k = e.key;
    if (screen === 'title') { if (k === 'Enter' || k === ' ') { e.preventDefault(); e.stopPropagation(); showSlots(); } return; }
    if (screen === 'slots') {
      if (k === 'Enter') { const s = load(); const last = s.chars.find(c => c.id === s.last) || s.chars[0]; if (last) { e.preventDefault(); e.stopPropagation(); play(last.id); } }
      return;
    }
    if (screen === 'create') {
      if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmCreate(); return; }
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); backToSlots(); return; }
      if (e.target && e.target.tagName === 'INPUT') return;
      const ci = Math.max(0, ORDER.indexOf(draft && draft.classId));
      if (k === '1') { e.preventDefault(); chooseClass(ORDER[0]); }
      else if (k === '2') { e.preventDefault(); chooseClass(ORDER[1]); }
      else if (k === '3') { e.preventDefault(); chooseClass(ORDER[2]); }
      else if (k === '4') { e.preventDefault(); chooseClass(ORDER[3]); }
      else if (k === 'ArrowLeft') { e.preventDefault(); chooseClass(ORDER[(ci + ORDER.length - 1) % ORDER.length]); }
      else if (k === 'ArrowRight') { e.preventDefault(); chooseClass(ORDER[(ci + 1) % ORDER.length]); }
    }
  }

  window.Characters = { cleanLook, PALETTE, DEFAULT_LOOK, load, GAME_TITLE };
  window.CharSelect = {
    isOpen: () => !!screen,
    open: showSlots,          // the hub's "Characters" button: back to the slot list
    choose: chooseClass,
    edit: (id) => startCreate(id),
    confirm: confirmCreate
  };

  function init() {
    if (!window.game) return;
    ensureRoot();
    window.addEventListener('keydown', onKey, true);
    // clicking anywhere on the title also starts
    root.addEventListener('click', (e) => { if (screen === 'title' && !e.target.closest('#cx-start')) showSlots(); });
    showTitle();
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init); else init();
})();
