// =========================================================================
// RAID_SELECT.JS — the raid selection menu (opened by the hub's chalice gate and the Raid Select button).
//   left   the raid list (Vaelgor now; the others are teasers) with cleared marks
//   centre a live Vaelgor idling in front of the eclipse
//   right  difficulty (Normal / Hard), what each means, your party, and Enter
//   bottom the items that can drop, tagged by how likely they are on the chosen difficulty
// Only the host (or a solo player) can enter; guests see the menu and follow the host's choice.
// =========================================================================
(function () {
  if (typeof Game25D === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  let modal = null, cv = null, c2 = null, preview = null, raf = null, lastT = 0;

  const FIRST_CLEAR_BONUS = { normal: 3, hard: 4 };    // extra cores the first time a character clears each difficulty
  const BASE_CORES = { normal: 3, hard: 6 };

  const DIFF_TEXT = {
    normal: { lines: ['One revive per player', '{B} deals 30% less damage', 'Enrage timer: 9:30 (+0:35 per extra player)', 'Failed mechanics hurt instead of wiping, and come back once'] },
    hard: { lines: ['No revives', '{B} at full strength', 'Enrage timer: 5:30'] }
  };
  // the raids on offer (Malakor is still a teaser)
  const RAIDS = {
    vaelgor: { name: 'Vaelgor', role: 'Warden of the Obsidian Eclipse', line: 'Obsidian Eclipse · 1–4 players', key: (d) => d },
    ignis: { name: 'Ignis Vane', role: 'The Pyre Diva', line: 'The Gilded Pyre · 1–4 players', key: (d) => 'ignis_' + d },
    hush: { name: 'Hush', role: 'The Lullaby Warden', line: 'The Sealed Nursery · Solo', key: (d) => 'hush_' + d, solo: true }
  };
  // Hush has her own loot: porcelain and thread for the Tier 4 Lullaby arms, and a Hard-only cosmetic
  const HUSH_REWARDS = [
    ['heart', 'Music-Box Heart', 'Rare', 'Rare', 'rare', 'The key material for the Lullaby arms. A rare core announces itself with a pillar of light.'],
    ['coin', 'Gold', 'Common', 'Common', 'common', 'Spend it at Fergus\'s forge.'],
    ['porcelain', 'Porcelain Shard', 'Common', 'Common', 'common', 'Forging material for the Lullaby arms.'],
    ['thread', 'Lullaby Thread', 'Uncommon', 'Uncommon', 'uncommon', 'Forging material for the Lullaby arms. Breaking her key or her mask drops more.'],
    ['moon', 'Moon Mobile', 'Very rare', 'Hard only', 'rare', 'A cosmetic mobile of moons and stars that turns over your head. Only on Hard, and it glows when it drops.'],
    ['sword', 'Lullaby arms', 'Forge', 'Forge', 'forge', 'Tier 4 weapons, forged from a Tier 3 weapon and her materials.']
  ];
  let pick = 'vaelgor';

  // Simple line icons (24x24, stroked with the tile's tone) instead of emoji
  const ICON = {
    seal: '<circle cx="12" cy="9.5" r="5.5"/><path d="M8.6 14l-1.6 7 5-2.6 5 2.6-1.6-7"/>',
    coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/>',
    shard: '<path d="M12 3l5.5 6.5L12 21 6.5 9.5z"/><path d="M6.5 9.5h11"/>',
    fragment: '<path d="M12 3l7 3v5.5c0 4.6-3 7.7-7 9.5-4-1.8-7-4.9-7-9.5V6z"/><path d="M12 7.5v9"/>',
    essence: '<circle cx="12" cy="12" r="3.8"/><ellipse cx="12" cy="12" rx="9" ry="3.4" transform="rotate(-28 12 12)"/>',
    sword: '<path d="M12 3v13M8 16h8M12 16v5"/>',
    crown: '<path d="M4 18.5V8.5l4.5 4L12 5.5l3.5 7 4.5-4v10z"/>',
    lock: '<rect x="6" y="11" width="12" height="9"/><path d="M9 11V8.2a3 3 0 0 1 6 0V11"/>',
    wings: '<path d="M12 20V9"/><path d="M12 9C9 4 5 4 2.5 5.5 4 10 7 14 12 16"/><path d="M12 9c3-5 7-5 9.5-3.5C20 10 17 14 12 16"/>',
    eclipse: '<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="8.5" opacity="0.55"/>',
    moon: '<path d="M15.5 4.5a7.5 7.5 0 1 0 4 12.5 6 6 0 1 1-4-12.5z"/><path d="M12 2v2.5"/>',
    heart: '<path d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10z"/><path d="M12 9.5v4M10 11.5h4"/>',
    porcelain: '<path d="M5 9l6-5 8 4-2 9-8 3-5-6z"/><path d="M11 4l-1 7 7 6M10 11l-5 4"/>',
    thread: '<ellipse cx="12" cy="6" rx="6" ry="2"/><ellipse cx="12" cy="18" rx="6" ry="2"/><path d="M7 7.5v9M17 7.5v9M7 10l10 2M7 13l10 2"/>',
    nursery: '<path d="M4 20V10l8-6 8 6v10z"/><path d="M14.5 13a2.5 2.5 0 1 1-2.5-2.6 2 2 0 0 0 2.5 2.6z"/>',
    flame: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.3 3.6-8.3 1.5 1.8 1.6 3.4 1.3 4.8 1.6-1.4 2.7-4 2.2-7.3 3.4 2.4 5.9 6.1 5.9 10.3 0 3.9-2.5 6.7-6.5 6.7z"/><path d="M12 21c-1.7 0-2.8-1.1-2.8-2.8 0-1.6 1.2-2.6 2-4 .9 1.1 2 1.7 2.7 2.8.6 1.6-.2 4-1.9 4z"/>'
  };
  const MATIMG = { seal: 'seal', coin: 'gold', shard: 'shard', fragment: 'fragment', essence: 'essence', wings: 'wings', heart: 'heart', porcelain: 'porcelain', thread: 'thread', moon: 'mobile' };
  const svg = (k) => MATIMG[k] ? `<img class="mat-ico" src="game/icons/mat_${MATIMG[k]}.png" alt="">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

  // icon, name, tag(hard), tag(normal), tone class, tooltip
  const REWARDS = [
    ['seal', 'Eclipse Seal', 'Guaranteed', 'Chance', 'seal', 'Five seals can be exchanged for an Abyssal Essence at the forge.'],
    ['coin', 'Gold', 'Common', 'Common', 'common', 'Spend it at Fergus\'s forge.'],
    ['shard', 'Obsidian Shard', 'Common', 'Common', 'common', 'Forging material.'],
    ['fragment', 'Pauldron Fragment', 'Uncommon', 'Uncommon', 'uncommon', 'Forging material for the mythic gear.'],
    ['essence', 'Abyssal Essence', 'Rare', 'Rare', 'rare', 'The key material for forging boss gear. A rare core announces itself with a pillar of light.'],
    ['wings', 'Eclipse Wings', 'Very rare', 'Very rare', 'rare', 'A cosmetic pair of wings. A tiny chance on every clear, and it glows orange when it drops.'],
    ['sword', 'Obsidian arms', 'Forge', 'Forge', 'forge', 'Tier 2 weapons and armor, crafted from drops.'],
    ['crown', 'Black Sun arms', 'Forge', 'Forge', 'forge', 'Tier 3 mythic weapons and armor, crafted from drops.']
  ];

  function cleared(g) { return (g && g.forge && g.forge.state && g.forge.state.cleared) || {}; }

  function build() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'raid-modal';
    modal.className = 'modal-window raid-window hidden';
    modal.innerHTML = `
      <div class="rs-head">
        <div><div class="rs-kicker">CHALICE RAID</div><h2>Select a raid</h2></div>
        <button class="close-btn" onclick="window.game.closeAllModals()" title="Close (Esc)">×</button>
      </div>
      <div class="rs-body">
        <aside class="rs-list">
          <div class="rs-item sel" data-raid="vaelgor"><div class="rs-thumb">${svg('eclipse')}</div><div><b>Vaelgor</b><small id="rs-clear-vaelgor">Obsidian Eclipse · 1–4 players</small></div></div>
          <div class="rs-item locked"><div class="rs-thumb">${svg('lock')}</div><div><b>Malakor</b><small>Coming soon</small></div></div>
          <div class="rs-item" data-raid="ignis"><div class="rs-thumb">${svg('flame')}</div><div><b>Ignis Vane</b><small id="rs-clear-ignis">The Gilded Pyre · 1–4 players</small></div></div>
          <div class="rs-item" data-raid="hush"><div class="rs-thumb">${svg('nursery')}</div><div><b>Hush</b><small id="rs-clear-hush">The Sealed Nursery · Solo</small></div></div>
        </aside>
        <section class="rs-stage">
          <canvas id="rs-canvas" width="640" height="440"></canvas>
          <div class="rs-plate"><div class="rs-name">Vaelgor</div><div class="rs-role">Warden of the Obsidian Eclipse</div></div>
        </section>
        <aside class="rs-info">
          <div class="rs-label">Difficulty</div>
          <div class="rs-diff" id="rs-diff"><button class="diff-btn" data-d="normal">Normal<i class="rs-tick" data-t="normal"></i></button><button class="diff-btn" data-d="hard">Hard<i class="rs-tick" data-t="hard"></i></button></div>
          <ul class="rs-lines" id="rs-lines"></ul>
          <div class="rs-cores"><span>Reward</span><b id="rs-core-count"></b></div>
          <div class="rs-first" id="rs-first"></div>
          <label class="rs-skip" id="rs-skip-row" title="Shortens the cinematic cutscenes for everyone in this raid. Only this raid: it unticks itself."><input type="checkbox" id="rs-skip"> Skip cutscenes</label>
          <div class="rs-label">Party</div>
          <div id="rs-party" class="rs-party"></div>
          <button id="rs-enter" class="rs-enter">Enter</button>
          <div id="rs-note"></div>
        </aside>
      </div>
      <div class="rs-rewards">
        <div class="rs-label">Expected rewards</div>
        <div class="rs-row" id="rs-reward-row"></div>
      </div>`;
    document.body.appendChild(modal);
    cv = $('rs-canvas');
    c2 = cv.getContext('2d');

    modal.querySelectorAll('.diff-btn').forEach(b => b.addEventListener('click', () => { window.game.requestDifficulty(b.dataset.d); refresh(); }));
    $('rs-enter').addEventListener('click', enter);
    // Skip cutscenes never carries over: it unticks whenever the menu opens, another raid is picked, or a raid starts
    modal.querySelectorAll('.rs-item').forEach(it => it.addEventListener('click', () => {
      clearSkip();
      if (it.dataset.raid && !(window.game && window.game.net && window.game.net.isClient())) { pick = it.dataset.raid; refresh(); }
    }));
    // the preview only runs while the menu is visible
    new MutationObserver(() => { if (modal.classList.contains('hidden')) stop(); else { clearSkip(); refresh(); start(); } }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('keydown', (e) => {
      if (!modal || modal.classList.contains('hidden')) return;
      if (e.key === 'Enter') { e.preventDefault(); enter(); }
    });
  }

  function clearSkip() { const c = $('rs-skip'); if (c) c.checked = false; }

  function refresh() {
    const g = window.game;
    if (!modal || !g) return;
    const d = g.difficulty === 'hard' ? 'hard' : 'normal';
    const done = cleared(g);
    const R = RAIDS[pick] || RAIDS.vaelgor;
    modal.querySelectorAll('.rs-item[data-raid]').forEach(it => it.classList.toggle('sel', it.dataset.raid === pick));
    modal.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('on', b.dataset.d === d));
    modal.querySelectorAll('.rs-tick').forEach(t => { t.textContent = done[R.key(t.dataset.t)] ? 'Cleared' : ''; });
    $('rs-lines').innerHTML = DIFF_TEXT[d].lines.map(l => `<li>${l.replace('{B}', R.name)}</li>`).join('');
    $('rs-core-count').textContent = `${BASE_CORES[d]} loot cores`;
    const first = !done[R.key(d)];
    $('rs-first').innerHTML = first ? `<span>First clear</span><b>+${FIRST_CLEAR_BONUS[d]} cores</b>` : `<span>First clear</span><b class="got">Claimed</b>`;
    $('rs-first').classList.toggle('got', !first);
    for (const id in RAIDS) {
      const el = $('rs-clear-' + id), k = RAIDS[id].key;
      if (el) el.textContent = done[k('hard')] ? 'Cleared on Hard' : done[k('normal')] ? 'Cleared on Normal' : RAIDS[id].line;
    }
    const nm = modal.querySelector('.rs-name'), rl = modal.querySelector('.rs-role');
    if (nm) nm.textContent = R.name;
    if (rl) rl.textContent = R.role;
    // Ignis shares Vaelgor's loot, except her rare cosmetic: her own Pyre Wings, Hard only
    const rewards = pick === 'hush' ? HUSH_REWARDS : pick === 'ignis'
      ? REWARDS.map(r => r[0] === 'wings' ? ['wings', 'Pyre Wings', 'Very rare', 'Hard only', 'rare', 'Her own cosmetic wings of living flame. Only on Hard, and it glows orange when it drops.'] : r)
      : REWARDS;
    $('rs-reward-row').innerHTML = rewards.map(([icon, name, hardTag, normalTag, cls, tip]) => {
      const tag = d === 'hard' ? hardTag : normalTag;
      return `<div class="rs-reward ${cls} ${tag === 'Chance' ? 'chance' : ''}" title="${tip}"><div class="rs-ico">${svg(icon)}</div><div class="rs-rname">${name}</div><div class="rs-rtag">${tag}</div></div>`;
    }).join('');
    const party = (g.party || []).filter(p => !p.isBot);
    $('rs-party').innerHTML = party.map(p => `<div class="rs-member"><b>${(p.name || 'Warden').replace(/[<>&]/g, '')}</b><i>${p.classId === 'unbound' ? 'Unbound' : p.classId === 'arclight' ? 'Arclight' : p.classId === 'reaper' ? 'Reaper' : (p.classId === 'hammer' ? 'Gravebreaker' : 'Breaker')}</i>${p.isLocal ? '<em>you</em>' : ''}</div>`).join('') || '<div class="rs-member"><b>Just you</b></div>';
    const client = g.net && g.net.isClient();
    const btn = $('rs-enter');
    const soloBlocked = !!(R.solo && g.net && g.net.isConnected && g.net.isConnected());
    btn.disabled = !!client || soloBlocked;
    btn.textContent = client ? 'Waiting for the host' : (soloBlocked ? 'Solo only' : 'Enter');
    $('rs-note').textContent = client ? 'The host picks the difficulty and starts the raid.' : (soloBlocked ? 'Hush is a solo raid: leave the party to enter.' : (R.solo ? 'Solo raid: no party, no AI comrades.' : ''));
    if (R.solo) $('rs-party').innerHTML = '<div class="rs-member"><b>Just you</b></div>';
    modal.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('locked', !!client));
    const skip = $('rs-skip');
    if (skip) { skip.disabled = !!client; $('rs-skip-row').classList.toggle('locked', !!client); }
  }

  function enter() {
    const g = window.game;
    if (!g || (g.net && g.net.isClient())) return;
    const skip = $('rs-skip');
    g._pendingSkip = !!(skip && skip.checked);       // used once by the next enterRaidGate (main.js), then cleared
    g._pendingRaid = pick;                           // which raid (main.js enterRaidGate; sent to guests in start_raid)
    clearSkip();
    if ((RAIDS[pick] || {}).solo) {                  // a solo raid: never with a party, and no ready check
      if (g.net && g.net.isConnected && g.net.isConnected()) { g._pendingRaid = null; refresh(); return; }
      g.closeAllModals();
      g.enterRaidGate(true);
      return;
    }
    if (window.Comms && window.Comms.beginReady()) return;     // friends in the room: ready check, then a countdown
    g.closeAllModals();
    g.enterRaidGate(true);
  }

  // ---- the live stage ---------------------------------------------------------
  function drawFrame(dt) {
    if (!c2) return;
    const w = cv.width, h = cv.height, t = performance.now() * 0.001;
    if (pick === 'ignis' && typeof IgnisVaneBoss !== 'undefined') {
      try {
        drawPyreStage(c2, w, h, t);
        if (!previewIg) previewIg = new IgnisVaneBoss(0, 0);
        c2.save(); c2.translate(w * 0.5, h * 0.88); const s = h / 250; c2.scale(s, s);
        previewIg.drawPreview(c2);
        c2.restore();
      } catch (e) { /* the backdrop alone is still a fine stage */ }
      return;
    }
    if (pick === 'hush' && typeof HushBoss !== 'undefined') {
      try {
        drawNurseryStage(c2, w, h, t);
        if (!previewHs) previewHs = new HushBoss(0, 0);
        c2.save(); c2.translate(w * 0.5, h * 0.9); const s = h / 260; c2.scale(s, s);
        previewHs.drawPreview(c2);
        c2.restore();
      } catch (e) { /* the backdrop alone is still a fine stage */ }
      return;
    }
    window.EclipseArt.draw(c2, w, h, t);
    try {
      if (!preview && typeof VaelgorRaidBoss !== 'undefined') preview = new VaelgorRaidBoss(0, 0);
      if (preview) {
        preview.hp = preview.maxHp; preview.state = 'idle'; preview.aiCooldown = 9999; preview.stateTimer = 9999;
        preview.facingAngle = Math.PI * 0.5;
        preview.update(dt || 1 / 60, [], { x: 0, y: 0 }, 500);
        preview.x = 0; preview.y = 0; preview.vx = 0; preview.vy = 0;
        c2.save();
        c2.translate(w * 0.52, h * 0.86);
        const s = h / 235;
        c2.scale(s, s);
        preview.draw(c2);
        c2.restore();
      }
    } catch (e) { /* the backdrop alone is still a fine stage */ }
  }

  // Ignis's stage for the preview: red velvet curtains, a gold proscenium, a spotlight on the boards, cinders rising
  let previewIg = null;
  // Hush's nursery for the preview: night wallpaper, the moon window, a mobile turning, a round rug in moonlight
  let previewHs = null;
  function drawNurseryStage(c, w, h, t) {
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1230'); bg.addColorStop(0.72, '#16204a'); bg.addColorStop(1, '#05060f');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(160,180,255,0.05)';
    for (let x = 0; x < w; x += 48) c.fillRect(x, 0, 16, h * 0.72);
    // the window and the moon
    const wx = w * 0.5, wy = h * 0.08, ww = 120, wh = 170;
    c.save();
    c.beginPath(); c.moveTo(wx - ww / 2, wy + wh); c.lineTo(wx - ww / 2, wy + ww / 2); c.arc(wx, wy + ww / 2, ww / 2, Math.PI, 0); c.lineTo(wx + ww / 2, wy + wh); c.closePath();
    c.fillStyle = '#0a1233'; c.fill();
    c.save(); c.clip();
    const halo = c.createRadialGradient(wx + 14, wy + 56, 10, wx + 14, wy + 56, 70);
    halo.addColorStop(0, 'rgba(220,230,255,0.4)'); halo.addColorStop(1, 'rgba(220,230,255,0)');
    c.fillStyle = halo; c.fillRect(wx - ww, wy, ww * 2, wh);
    c.fillStyle = '#eef2ff'; c.beginPath(); c.arc(wx + 14, wy + 56, 24, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0a1233'; c.beginPath(); c.arc(wx + 26, wy + 50, 21, 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = '#e9e1c8'; c.lineWidth = 6; c.stroke();
    c.restore();
    // the mobile turning above
    for (let i = 0; i < 5; i++) {
      const a = t * 0.3 + i * Math.PI * 2 / 5, x = w * 0.5 + Math.cos(a) * w * 0.22, y = h * 0.1 + Math.sin(a) * 8 + (i % 2) * 18;
      c.strokeStyle = 'rgba(220,225,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, y); c.stroke();
      c.fillStyle = i % 2 ? '#f5e7b0' : '#c7d2fe'; c.beginPath(); c.arc(x, y + 6, 6, 0, Math.PI * 2); c.fill();
    }
    // floor and the round rug in a shaft of moonlight
    c.fillStyle = '#2b2236'; c.fillRect(0, h * 0.72, w, h * 0.28);
    c.fillStyle = '#e9e1c8'; c.fillRect(0, h * 0.72 - 4, w, 6);
    c.save(); c.translate(w * 0.5, h * 0.9); c.scale(1, 0.3);
    c.fillStyle = '#1f3570'; c.beginPath(); c.arc(0, 0, w * 0.36, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e9e1c8'; c.beginPath(); c.arc(0, 0, w * 0.32, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a4a8f'; c.beginPath(); c.arc(0, 0, w * 0.27, 0, Math.PI * 2); c.fill();
    c.restore();
    c.save(); c.globalCompositeOperation = 'lighter';
    const sh = c.createLinearGradient(0, wy + wh * 0.5, 0, h * 0.95);
    sh.addColorStop(0, 'rgba(190,205,255,0.12)'); sh.addColorStop(1, 'rgba(190,205,255,0)');
    c.fillStyle = sh; c.beginPath(); c.moveTo(wx - 50, wy + wh * 0.5); c.lineTo(wx + 50, wy + wh * 0.5); c.lineTo(wx + 170, h * 0.95); c.lineTo(wx - 130, h * 0.95); c.closePath(); c.fill();
    c.restore();
  }
  function drawPyreStage(c, w, h, t) {
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#16040a'); bg.addColorStop(0.7, '#2a0710'); bg.addColorStop(1, '#0b0204');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    for (const sg of [-1, 1]) {
      const x0 = sg < 0 ? 0 : w, x1 = w / 2 + sg * w * 0.2;
      const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#3a0610'); g.addColorStop(1, '#8a1026');
      c.fillStyle = g; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x1, 0); c.quadraticCurveTo(x1 + sg * 30, h * 0.5, x1 - sg * 20, h * 0.8); c.lineTo(x0, h * 0.8); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2;
      for (let k = 1; k < 7; k++) { const xx = x0 + (x1 - x0) * k / 7; c.beginPath(); c.moveTo(xx, 0); c.quadraticCurveTo(xx + sg * 10, h * 0.45, xx, h * 0.8); c.stroke(); }
    }
    c.fillStyle = '#5a0a18'; c.fillRect(0, 0, w, h * 0.12);
    c.strokeStyle = '#d4a017'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, h * 0.12); c.lineTo(w, h * 0.12); c.stroke();
    // the boards and a spotlight
    c.fillStyle = '#2c160d'; c.fillRect(0, h * 0.8, w, h * 0.2);
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; for (let y = h * 0.8; y < h; y += 10) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.globalCompositeOperation = 'lighter';
    const sp = c.createRadialGradient(w / 2, h * 0.88, 5, w / 2, h * 0.88, w * 0.3);
    sp.addColorStop(0, 'rgba(255,230,180,0.35)'); sp.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = sp; c.beginPath(); c.ellipse(w / 2, h * 0.88, w * 0.3, h * 0.08, 0, 0, Math.PI * 2); c.fill();
    const cone = c.createLinearGradient(w / 2, 0, w / 2, h * 0.88);
    cone.addColorStop(0, 'rgba(255,240,200,0.0)'); cone.addColorStop(1, 'rgba(255,240,200,0.12)');
    c.fillStyle = cone; c.beginPath(); c.moveTo(w / 2 - 20, 0); c.lineTo(w / 2 + 20, 0); c.lineTo(w / 2 + w * 0.28, h * 0.88); c.lineTo(w / 2 - w * 0.28, h * 0.88); c.closePath(); c.fill();
    for (let i = 0; i < 40; i++) {
      const x = (i * 137.5) % w, y = h - ((t * (20 + (i % 5) * 9) + i * 31) % h);
      c.fillStyle = `rgba(255,${130 + (i % 4) * 25},60,${0.4 + 0.3 * Math.sin(t * 3 + i)})`; c.fillRect(x, y, 2, 2);
    }
    c.globalCompositeOperation = 'source-over';
  }

  function loop(now) {
    raf = null;
    if (!modal || modal.classList.contains('hidden')) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastT) * 0.001)); lastT = now;
    drawFrame(dt);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  Game25D.prototype.openRaidSelect = function () {
    if (this.mode !== 'hub') return;
    build();
    this.openModal('raid-modal');
  };

  window.RaidSelect = { build, refresh, drawFrame, enter, FIRST_CLEAR_BONUS, BASE_CORES };
  const init = () => { if (window.game) build(); };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init); else init();
})();
