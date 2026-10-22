// =========================================================================
// ENHANCE_HUB.JS — "The Black Anvil": the enhancement screen (+1 to +15), its own full-screen place instead of a forge tab.
//
// The result is rolled by forge.enhanceItem() the moment you press the button, but the screen keeps showing the old level while
// the ritual plays:
//   0.0 - 1.9s  CHARGE   runes ignite one after another and the item rises (identical for every outcome)
//   1.9 - 3.1s  THE TELL  a pass warms to white-gold and the embers stream IN; a failure flickers red, cracks and the embers scatter
//   3.1 - 3.4s  STRIKE   the hammer falls
//   3.4 - 5.2s  RESULT   burst + the new level, or shards + the fail text
// Sound: game/sounds/enhance/enhance_success.mp3 and enhance_fail.mp3 (5.2s each, see the timeline above) are used when present;
// otherwise a small synthesised version plays.
// =========================================================================
(function () {
  const T_TELL = 1.9, T_STRIKE = 3.1, T_RESULT = 3.4, T_END = 5.2;
  const g = () => window.game;
  const RF = () => window.Reforge;
  const esc = (x) => String(x == null ? '' : x).replace(/[<>&"]/g, '');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  const S = { open: false, uid: null, anim: null, parts: [], raf: 0, last: 0, shake: 0, flash: 0, ready: {}, W: 0, H: 0, dpr: 1, canvas: null, ctx: null, root: null, t: 0, lastResult: null };

  // ---------------------------------------------------------------- data helpers
  function items() {
    const f = g().forge, cls = g().playerClass || 'breaker';
    return f.state.inventory.filter(i => (i.slot === 'weapon' && (i.classId || 'breaker') === cls) || i.slot === 'armor');
  }
  const sel = () => { const l = items(); return l.find(i => i.uid === S.uid) || l.find(i => i.equipped) || l[0] || null; };
  const have = (k) => { const f = g().forge; return k === 'gold' ? f.state.gold : (f.state.materials[k] || 0); };
  const canPay = (c) => Object.entries(c).every(([k, v]) => have(k) >= v);
  const tierOf = (it) => /Tier 4/.test(it.tier || '') ? 4 : /Tier 3/.test(it.tier || '') ? 3 : /Tier 2/.test(it.tier || '') ? 2 : 1;
  const TONE = { 1: '#9fb0c8', 2: '#e0566e', 3: '#b99cff', 4: '#f5c542' };

  function statRows(it, L) {
    const R = RF().ENH, e0 = it.enh || 0, maxed = e0 >= R.MAX;
    const rows = [];
    const row = (n, a, b) => rows.push([n, a, maxed ? null : b]);
    if (it.slot === 'weapon') {
      row('Attack', Math.round(it.baseAtk * (1 + R.WEAPON_PER * e0)), Math.round(it.baseAtk * (1 + R.WEAPON_PER * L)));
      if (L >= 6 || e0 >= 6) { row('Crit rate', '+' + R.CRIT[e0] + '%', '+' + R.CRIT[L] + '%'); row('Attack speed', '+' + R.SPEED[e0] + '%', '+' + R.SPEED[L] + '%'); }
    } else {
      row('Health', '+' + Math.round(R.ARMOR_PER * 100 * e0) + '%', '+' + Math.round(R.ARMOR_PER * 100 * L) + '%');
      row('Defense', '+' + Math.round(R.ARMOR_PER * 100 * e0) + '%', '+' + Math.round(R.ARMOR_PER * 100 * L) + '%');
      if (L >= 6 || e0 >= 6) { row('Damage taken', '-' + R.DR[e0] + '%', '-' + R.DR[L] + '%'); row('Get-up time', '-' + R.WAKE[e0] + '%', '-' + R.WAKE[L] + '%'); }
    }
    return rows;
  }

  // ---------------------------------------------------------------- DOM
  function build() {
    if (S.root) return;
    const r = document.createElement('div');
    r.id = 'eh'; r.className = 'eh hidden';
    r.innerHTML = `
      <canvas id="eh-cv"></canvas>
      <header class="eh-top">
        <div class="eh-title"><small>FERGUS'S FORGE</small><h2>The Black Anvil</h2></div>
        <div class="eh-cur" id="eh-cur"></div>
        <button class="eh-x" id="eh-x" title="Close (Esc)">×</button>
      </header>
      <aside class="eh-list" id="eh-list"></aside>
      <aside class="eh-info" id="eh-info"></aside>
      <div class="eh-hint" id="eh-hint"></div>`;
    document.body.appendChild(r);
    S.root = r; S.canvas = r.querySelector('#eh-cv'); S.ctx = S.canvas.getContext('2d');
    r.querySelector('#eh-x').onclick = close;
    addEventListener('keydown', (e) => { if (S.open && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
    addEventListener('resize', () => { if (S.open) fit(); });
    S.canvas.addEventListener('click', () => { if (S.anim && S.anim.t > T_RESULT + 0.3) S.anim.t = T_END; });
  }

  function fit() {
    S.dpr = Math.min(1.25, window.devicePixelRatio || 1);
    S.W = innerWidth; S.H = innerHeight;
    S.canvas.width = Math.round(S.W * S.dpr); S.canvas.height = Math.round(S.H * S.dpr);
    S.canvas.style.width = S.W + 'px'; S.canvas.style.height = S.H + 'px';
    paintStatics();
  }

  function renderPanels() {
    const f = g().forge, list = items(), it = sel();
    if (it) S.uid = it.uid;
    const cur = [['gold', 'mat_gold'], ['vaelgor_essence', 'mat_essence'], ['obsidian_shard', 'mat_shard'], ['pauldron_fragment', 'mat_fragment']];
    S.root.querySelector('#eh-cur').innerHTML = cur.map(([k, ic]) => `<div class="cur" data-tip="mat:${k}"><img class="mat-ico" src="game/icons/${ic}.png" alt=""><b>${have(k).toLocaleString()}</b></div>`).join('');

    S.root.querySelector('#eh-list').innerHTML = `<div class="eh-lab">Your gear</div>` + (list.map(i => {
      const ph = S.anim && S.anim.uid === i.uid && S.anim.t < T_RESULT;
      return `<button class="eh-item ${i.uid === S.uid ? 'on' : ''} t${tierOf(i)}" data-uid="${i.uid}" ${S.anim ? 'disabled' : ''}>
        <span class="eh-ic ${i.slot}">${i.slot === 'weapon' ? (i.classId === 'unbound' ? '✋' : i.classId === 'arclight' ? '✦' : i.classId === 'reaper' ? '☽' : i.classId === 'hammer' ? '⚒' : '⚔') : '🛡'}</span>
        <span class="eh-nm"><b>${esc(i.name)}</b><i>${i.equipped ? 'Equipped' : esc((i.tier || '').split('•')[0])}</i></span>
        <em class="${(ph ? S.anim.from : i.enh || 0) >= 6 ? 'hot' : ''}">+${ph ? S.anim.from : (i.enh || 0)}</em></button>`;
    }).join('') || '<div class="eh-empty">Nothing to enhance yet.</div>');
    S.root.querySelectorAll('.eh-item').forEach(b => b.onclick = () => { S.uid = b.dataset.uid; S.lastResult = null; renderPanels(); });

    const info = S.root.querySelector('#eh-info');
    if (!it) { info.innerHTML = ''; return; }
    const shown = (S.anim && S.anim.t < T_RESULT) ? S.anim.from : (it.enh || 0);
    const max = RF().ENH.MAX, maxed = shown >= max, L = shown + 1;
    const cost = maxed ? {} : RF().enhCost(L);
    const probe = Object.assign({}, it, { enh: shown });
    const hold = S.anim && S.anim.t < T_RESULT ? S.anim.pre : null;
    const rate = maxed ? 0 : (hold ? hold.rate : RF().enhRate(probe));
    const guaranteed = !maxed && rate >= 1;
    const pct = maxed ? 0 : Math.round(rate * 1000) / 10;
    const pity = hold ? hold.pity : (it.pity || 0), PY = RF().PITY;
    const rows = statRows(Object.assign({}, it, { enh: shown }), L).map(([n, a, b]) => `<div class="eh-row"><span>${n}</span><b>${a}</b>${b == null ? '' : `<i>➜</i><b class="up">${b}</b>`}</div>`).join('');
    const risk = maxed ? 'Fully enhanced.' : L >= 13 ? 'A failure also costs a level (never below +10).' : L >= 6 ? 'A failure costs only the materials.' : 'Cannot fail.';
    const payable = canPay(cost);
    const costs = Object.entries(cost).map(([k, v]) => `<span class="req-tag ${have(k) >= v ? 'ok' : 'missing'}" data-tip="mat:${k}">${k === 'gold' ? '<img class="mat-ico sm" src="game/icons/mat_gold.png" alt=""> ' + v.toLocaleString() : RF().NAMES[k] + ' ' + have(k) + '/' + v}</span>`).join('');
    const busy = !!S.anim;
    info.innerHTML = `
      <div class="eh-lab">Enhancement</div>
      <div class="eh-name t${tierOf(it)}">${esc(it.name)}</div>
      <div class="eh-lv"><span>+${shown}</span>${maxed ? '<em>MAX</em>' : `<i>➜</i><span class="nx">+${L}</span>`}</div>
      <div class="eh-rows">${rows}</div>
      ${maxed ? '' : `<div class="eh-rate ${guaranteed ? 'g' : pct < 15 ? 'low' : ''}"><div><span>Chance</span><b>${guaranteed ? (L >= 6 ? 'Guaranteed' : '100%') : pct + '%'}</b></div><div class="bar"><u style="width:${guaranteed ? 100 : pct}%"></u></div></div>
      <div class="eh-pity">${L >= 6 ? `Pity ${pity}/${PY.GUARANTEE}${pity ? ` · +${Math.round(Math.min(PY.CAP, pity * PY.STEP) * 100)}% chance` : ''}${pity >= PY.GUARANTEE ? ' · next try is guaranteed' : ''}` : ''}</div>
      <div class="eh-risk">${risk}</div><div class="eh-costs">${costs}</div>`}
      <button class="eh-go ${maxed || !payable || busy ? 'off' : ''}" id="eh-go">${busy ? 'The anvil rings…' : maxed ? 'Maxed' : 'Enhance to +' + L}</button>`;
    const go = info.querySelector('#eh-go');
    go.onclick = () => { if (!maxed && payable && !busy) start(it); };
    const lr = S.lastResult;
    S.root.querySelector('#eh-hint').textContent = busy ? '' : lr ? lr : 'Choose a piece, then strike the anvil.';
  }

  // ---------------------------------------------------------------- the ritual
  function start(it) {
    const f = g().forge, from = it.enh || 0, L = from + 1;
    // roll now (this also pays the cost); mute the plain anvil clang, the hub has its own sounds
    const pre = { rate: RF().enhRate(it), pity: it.pity || 0 };   // what the panel keeps showing until the result is revealed
    const a = window.audio, o = a && a.playForgeAnvil; if (a) a.playForgeAnvil = () => {};
    let r; try { r = f.enhanceItem(it.uid); } finally { if (a) a.playForgeAnvil = o; }
    if (!r || !r.ok) { S.lastResult = (r && r.msg) || 'Could not enhance.'; renderPanels(); return; }
    const ok = r.success !== false, to = it.enh || 0;
    S.anim = { pre, uid: it.uid, from, to, ok, drop: !ok && to < from, t: 0, struck: false, shown: false, L, name: it.name, tier: tierOf(it), slot: it.slot, cls: it.classId };
    S.parts.length = 0; S.flash = 0; S.shake = 0;
    playSound(ok);
    renderPanels();
  }

  function finish() {
    const a = S.anim; if (!a) return;
    S.lastResult = a.ok ? `${a.name} is now +${a.to}.` : `The enhancement to +${a.L} failed.${a.drop ? ` It fell to +${a.to}.` : ''}`;
    S.anim = null;
    try { g().updateAllUI(); } catch (e) {}
    renderPanels();
  }

  // ---------------------------------------------------------------- sound
  function loadFiles() {
    for (const k of ['success', 'fail']) {
      if (S.ready[k] !== undefined) continue;
      S.ready[k] = null;
      const a = new Audio('game/sounds/enhance/enhance_' + k + '.mp3'); a.preload = 'auto';
      a.addEventListener('canplaythrough', () => { S.ready[k] = a; }, { once: true });
      a.addEventListener('error', () => { S.ready[k] = false; }, { once: true });
    }
  }
  function playSound(ok) {
    const f = S.ready[ok ? 'success' : 'fail'];
    if (f) { try { f.currentTime = 0; f.volume = 0.9; f.play(); return; } catch (e) {} }
    synth(ok);
  }
  function synth(ok) {
    const a = window.audio; if (!a) return;
    try { a.init(); } catch (e) {}
    const c = a.ctx; if (!c) return;
    const out = a.sfxBus || c.destination, t0 = c.currentTime + 0.02;
    const tone = (type, f0, f1, t, d, v, to) => { const o = c.createOscillator(), gn = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0 + t); o.frequency.exponentialRampToValueAtTime(f1, t0 + t + d); gn.gain.setValueAtTime(0.0001, t0 + t); gn.gain.exponentialRampToValueAtTime(v, t0 + t + Math.min(0.08, d / 3)); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + t + d); o.connect(gn); gn.connect(to || out); o.start(t0 + t); o.stop(t0 + t + d + 0.05); };
    const noise = (t, d, v, hp) => { const n = Math.floor(c.sampleRate * d), b = c.createBuffer(1, n, c.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2); const s = c.createBufferSource(), fl = c.createBiquadFilter(), gn = c.createGain(); s.buffer = b; fl.type = 'highpass'; fl.frequency.value = hp; gn.gain.value = v; s.connect(fl); fl.connect(gn); gn.connect(out); s.start(t0 + t); };
    tone('sawtooth', 70, 420, 0, T_TELL, 0.07);                                   // charge: a low rising drone
    for (let i = 0; i < 6; i++) tone('triangle', 330 + i * 90, 330 + i * 90, i * 0.3, 0.25, 0.04);   // runes igniting
    if (ok) { tone('sine', 523, 523, T_TELL + 0.1, 0.9, 0.09); tone('sine', 659, 659, T_TELL + 0.4, 0.9, 0.09); tone('sine', 784, 784, T_TELL + 0.7, 1.0, 0.09); }
    else { tone('sawtooth', 190, 96, T_TELL + 0.1, 1.1, 0.08); tone('square', 140, 70, T_TELL + 0.3, 0.9, 0.04); }
    tone('sine', 120, 38, T_STRIKE, 0.5, 0.5); noise(T_STRIKE, 0.35, 0.5, 600);       // the hammer fall
    if (ok) { for (let i = 0; i < 7; i++) tone('sine', 880 + i * 160, 880 + i * 160, T_RESULT + i * 0.07, 0.8, 0.05); }
    else { noise(T_RESULT, 0.9, 0.35, 2500); tone('sine', 220, 55, T_RESULT, 1.2, 0.18); }
  }

  // ---------------------------------------------------------------- drawing
  // Performance: nothing in the per-frame path uses shadowBlur or builds a gradient. The background, vignette and light rays are
  // painted once per resize, glows are pre-rendered sprites, the item is baked once into a sprite, and the particle count is capped.
  const spriteCache = {};
  function glowSprite(color, size) {
    const k = color + '|' + size; if (spriteCache[k]) return spriteCache[k];
    const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
    const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    x.fillStyle = gr; x.fillRect(0, 0, size, size);
    return (spriteCache[k] = c);
  }
  const GL = { amber: 'rgba(255,177,90,1)', violet: 'rgba(192,132,252,1)', red: 'rgba(255,69,96,1)', cream: 'rgba(255,217,160,1)', white: 'rgba(255,255,255,1)', steel: 'rgba(154,163,189,1)', gold: 'rgba(255,233,168,1)' };
  const glow = (name, size) => glowSprite(GL[name] || name, size || 64);

  function burst(x, y, n, col, spd, life, size, grav) {
    for (let i = 0; i < n && S.parts.length < 320; i++) { const a = Math.random() * TAU, v = spd * (0.35 + Math.random() * 0.8); S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.6 + Math.random() * 0.8), col, grav: grav || 0, kind: 'b' }); }
  }

  // ---- the item sprite: the real model of the piece being enhanced, painted once ----------------------------------------
  const sprites = {};
  function spriteFor(it) {
    const key = [it.uid, it.weaponModelId, it.armorTint, it.trimColor, it.tier, it.classId, S.cls].join('|');
    if (sprites[key]) return sprites[key];
    const PX = 1.5, CW = 360, CH = 460;
    const c = document.createElement('canvas'); c.width = CW * PX; c.height = CH * PX; const x = c.getContext('2d');
    x.scale(PX, PX);
    try {
      if (it.slot === 'weapon' && (it.classId || 'breaker') === 'hammer' && typeof HammerPlayer25D !== 'undefined') {
        // the very same hammer sprite the Gravebreaker carries
        const h = new HammerPlayer25D('enh', '', 0, 0, false, false); h.weaponModelId = it.weaponModelId || 'hammer_slab';
        x.save(); x.translate(CW / 2 + 12, CH - 36); x.scale(2.05, 2.05);
        h.drawHammerSprite(x, 0, 0, 0.0001, -1, 74, 0, 1);
        x.restore();
      } else if (it.slot === 'weapon' && (it.classId || 'breaker') === 'reaper' && typeof ReaperPlayer25D !== 'undefined') {
        // the very same chain scythe the Reaper carries
        const rp = new ReaperPlayer25D('enh', '', 0, 0, false, false); rp.weaponModelId = it.weaponModelId || 'scythe_bone';
        x.save(); x.translate(CW / 2 - 40, CH - 80); rp.drawScytheSprite(x, 250); x.restore();
      } else if (it.slot === 'weapon' && (it.classId || 'breaker') === 'unbound' && typeof UnboundPlayer25D !== 'undefined') {
        // the very same bracers the Unbound wears
        const up = new UnboundPlayer25D('enh', '', 0, 0, false, false); up.weaponModelId = it.weaponModelId || 'brc_iron';
        x.save(); x.translate(CW / 2, CH - 150); up.drawCuffSprite(x, 250); x.restore();
      } else if (it.slot === 'weapon' && (it.classId || 'breaker') === 'arclight' && typeof ArclightPlayer25D !== 'undefined') {
        // the very same laser saber the Arclight carries
        const ap = new ArclightPlayer25D('enh', '', 0, 0, false, false); ap.weaponModelId = it.weaponModelId || 'arc_prototype';
        x.save(); x.translate(CW / 2, CH - 90); ap.drawSaberSprite(x, 240); x.restore();
      } else if (it.slot === 'weapon') {
        drawBreakerSword(x, it, CW / 2, CH - 24);
      } else {
        // armor: the character wearing it, front on, exactly as in the game
        const Cls = (S.cls === 'unbound' && typeof UnboundPlayer25D !== 'undefined') ? UnboundPlayer25D : (S.cls === 'arclight' && typeof ArclightPlayer25D !== 'undefined') ? ArclightPlayer25D : (S.cls === 'reaper' && typeof ReaperPlayer25D !== 'undefined') ? ReaperPlayer25D : (S.cls === 'hammer' && typeof HammerPlayer25D !== 'undefined') ? HammerPlayer25D : BreakerPlayer25D;
        const p = new Cls('enh', '', 0, 0, false, false);
        p.look = g().localPlayer && g().localPlayer.look;
        const tier = tierOf(it); if (typeof p.setArmorTier === 'function') p.setArmorTier(tier);
        p.armorTint = it.armorTint || p.armorTint; p.trimColor = it.trimColor || p.trimColor;
        p.noPlate = true; p.facingAngle = Math.PI * 0.5; if (p.snapFeetToBody) p.snapFeetToBody();
        x.save(); x.translate(CW / 2, CH - 52); x.scale(2.9, 2.9); p.draw(x); x.restore();
      }
    } catch (e) { /* the model is not ready: leave the sprite blank rather than break the screen */ }
    return (sprites[key] = { c, w: CW, h: CH });
  }

  // The Breaker greatswords, with the same shapes and colours as the in-game models (see breaker_25d.js drawSword)
  function drawBreakerSword(x, it, cx, base) {
    const id = it.weaponModelId || 'warden_steel', len = 92, S2 = 3.0;
    const wcol = it.weaponColor || '#38bdf8', trim = it.trimColor || '#fbbf24';
    x.save(); x.translate(cx, base); x.rotate(-Math.PI / 2); x.scale(S2, S2); x.translate(27, 0);   // grip at the bottom, tip up
    x.lineJoin = 'round';
    // grip and pommel
    x.fillStyle = '#0f172a'; x.strokeStyle = trim; x.lineWidth = 1.6; x.beginPath(); x.roundRect(-20, -2.5, 20, 5, 1.5); x.fill(); x.stroke();
    x.fillStyle = wcol; x.beginPath(); x.arc(-22, 0, 4.2, 0, TAU); x.fill(); x.stroke();
    const glowStroke = (col, w, al) => { if (typeof fakeGlow === 'function') fakeGlow(x, col, w, al); };
    if (id === 'warden_steel') {
      x.fillStyle = '#1e293b'; x.strokeStyle = '#fbbf24'; x.lineWidth = 1.8; x.beginPath(); x.roundRect(-1, -14, 7, 28, 2); x.fill(); x.stroke();
      x.fillStyle = '#1e293b'; x.strokeStyle = '#7dd3fc'; x.lineWidth = 2.0;
      x.beginPath(); x.moveTo(6, -8.5); x.lineTo(len - 16, -7.5); x.lineTo(len, 0); x.lineTo(len - 16, 7.5); x.lineTo(6, 8.5); x.closePath();
      glowStroke('#0284c7', 9); x.fill(); x.stroke();
      x.strokeStyle = '#38bdf8'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(14, -2.5); x.lineTo(len * 0.78, -2.0); x.moveTo(14, 2.5); x.lineTo(len * 0.78, 2.0); x.stroke();
    } else if (id === 'vaelgor_obsidian') {
      x.fillStyle = '#090b10'; x.strokeStyle = '#fda4af'; x.lineWidth = 1.8;
      x.beginPath(); x.moveTo(0, -19); x.lineTo(9, -6); x.lineTo(9, 6); x.lineTo(0, 19); x.lineTo(-4, 12); x.lineTo(2, 0); x.lineTo(-4, -12); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#090b10'; x.strokeStyle = '#f43f5e'; x.lineWidth = 2.0;
      x.beginPath(); x.moveTo(6, -7.5); x.lineTo(24, -11.5); x.lineTo(28, -7.0); x.lineTo(46, -10.5); x.lineTo(50, -6.5); x.lineTo(len - 18, -6.0); x.lineTo(len, 0); x.lineTo(len - 18, 6.0); x.lineTo(26, 9.5); x.lineTo(6, 7.5); x.closePath();
      glowStroke('#e11d48', 11); x.fill(); x.stroke();
      x.strokeStyle = '#fda4af'; x.lineWidth = 2.8; x.beginPath(); x.moveTo(10, 0); x.lineTo(len * 0.84, 0); glowStroke('#f43f5e', 8, 0.45); x.stroke();
    } else if (id === 'lullaby_porcelain') {
      x.fillStyle = '#c9973a'; x.strokeStyle = '#6e4f17'; x.lineWidth = 1.4;
      for (const sg of [-1, 1]) { x.beginPath(); x.ellipse(7, sg * 11, 4.2, 6.2, 0, 0, TAU); x.fill(); x.stroke(); }
      const bg = x.createLinearGradient(8, -12, 8, 12); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.45, '#eef0f7'); bg.addColorStop(1, '#a9b2c8');
      x.fillStyle = bg; x.strokeStyle = '#1e2a52'; x.lineWidth = 1.8;
      x.beginPath(); x.moveTo(10, -9.5); x.quadraticCurveTo(len * 0.45, -13.5, len - 12, -7); x.lineTo(len + 7, 0); x.lineTo(len - 12, 7); x.quadraticCurveTo(len * 0.45, 13.5, 10, 9.5); x.closePath();
      glowStroke('#fde68a', 8, 0.5); x.fill(); x.stroke();
      x.strokeStyle = '#2a4a8f'; x.lineWidth = 3; x.beginPath(); x.moveTo(16, 0); x.lineTo(len * 0.8, 0); x.stroke();
      x.strokeStyle = '#f5c542'; x.lineWidth = 1.5; x.beginPath();
      x.moveTo(len * 0.32, -11); x.lineTo(len * 0.36, -4); x.lineTo(len * 0.33, 2); x.lineTo(len * 0.38, 11);
      x.moveTo(len * 0.62, -9); x.lineTo(len * 0.58, -2); x.lineTo(len * 0.63, 4); x.lineTo(len * 0.6, 9);
      glowStroke('#fde68a', 6, 0.6); x.stroke();
    } else {   // black_sun_sovereign
      x.fillStyle = '#05050a'; x.strokeStyle = '#fde047'; x.lineWidth = 2.0; x.beginPath(); x.arc(8, 0, 13, 0, TAU); glowStroke('#c084fc', 12); x.fill(); x.stroke();
      const bg = x.createLinearGradient(8, -10, len, 10); bg.addColorStop(0, '#090b10'); bg.addColorStop(0.5, '#3b0764'); bg.addColorStop(1, '#f43f5e');
      x.fillStyle = bg; x.strokeStyle = '#fde047'; x.lineWidth = 2.2;
      x.beginPath(); x.moveTo(8, -10.5); x.lineTo(32, -13.0); x.lineTo(len - 14, -7.5); x.lineTo(len + 6, 0); x.lineTo(len - 14, 7.5); x.lineTo(32, 13.0); x.lineTo(8, 10.5); x.closePath();
      glowStroke('#c084fc', 10); x.fill(); x.stroke();
      x.strokeStyle = '#ffffff'; x.lineWidth = 3.2; x.beginPath(); x.moveTo(16, 0); x.lineTo(len * 0.88, 0); glowStroke('#c084fc', 9, 0.4); x.stroke();
    }
    x.restore();
  }

  // ---- static layers, painted on resize ------------------------------------------------------------------------------
  function paintStatics() {
    const W = S.W, H = S.H, dpr = S.dpr;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
    S.bg = mk(W * dpr, H * dpr); let x = S.bg.getContext('2d'); x.scale(dpr, dpr);
    const bg = x.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#2a1230'); bg.addColorStop(0.45, '#120a1e'); bg.addColorStop(1, '#040308'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
    S.vig = mk(W * dpr, H * dpr); x = S.vig.getContext('2d'); x.scale(dpr, dpr);
    const vg = x.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.35, W * 0.5, H * 0.46, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
    // light rays: one square image that is simply rotated each frame
    const RS = 900; S.rays = mk(RS, RS); x = S.rays.getContext('2d'); x.translate(RS / 2, RS / 2);
    for (let i = 0; i < 14; i++) { x.rotate(TAU / 14); const g2 = x.createLinearGradient(0, 0, 0, -RS / 2); g2.addColorStop(0, 'rgba(190,110,255,0.16)'); g2.addColorStop(1, 'rgba(190,110,255,0)'); x.fillStyle = g2; x.beginPath(); x.moveTo(-14, 0); x.lineTo(14, 0); x.lineTo(60, -RS / 2); x.lineTo(-60, -RS / 2); x.fill(); }
    // dais + anvil (they never move)
    S.dais = mk(640, 200); x = S.dais.getContext('2d'); x.translate(320, 70);
    for (let i = 0; i < 4; i++) { x.fillStyle = ['#1a1424', '#221a30', '#2a2038', '#14101c'][i]; x.beginPath(); x.ellipse(0, i * 6, 300 - i * 22, 78 - i * 5, 0, 0, TAU); x.fill(); }
    x.strokeStyle = 'rgba(180,140,255,0.35)'; x.lineWidth = 2; x.beginPath(); x.ellipse(0, 0, 296, 76, 0, 0, TAU); x.stroke();
    S.anvil = mk(220, 110); x = S.anvil.getContext('2d'); x.translate(110, 36);
    x.fillStyle = '#0d0a14'; x.strokeStyle = 'rgba(200,170,255,0.5)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(-96, -30); x.lineTo(96, -30); x.lineTo(70, -8); x.lineTo(34, -2); x.lineTo(44, 34); x.lineTo(70, 40); x.lineTo(70, 54); x.lineTo(-70, 54); x.lineTo(-70, 40); x.lineTo(-44, 34); x.lineTo(-34, -2); x.lineTo(-70, -8); x.closePath(); x.fill(); x.stroke();
  }

  function frame(now) {
    if (!S.open) return;
    S.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; S.t += dt;
    const ctx = S.ctx, W = S.W, H = S.H, dpr = S.dpr, t = S.t;
    const it = sel(), a = S.anim;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(S.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = W * 0.5, cy = H * 0.46;
    // slow light rays (a rotated pre-rendered image)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.05); ctx.globalCompositeOperation = 'lighter';
    const rs = Math.max(W, H) * 1.5; ctx.drawImage(S.rays, -rs / 2, -rs / 2, rs, rs); ctx.restore();

    // outcome-driven state
    const ok = a ? a.ok : true, tl = a ? a.t : 0;
    const tell = a ? clamp((tl - T_TELL) / 0.6, 0, 1) : 0;                  // 0 neutral .. 1 fully read
    const charge = a ? clamp(tl / T_TELL, 0, 1) : 0;
    const resP = a ? clamp((tl - T_RESULT) / 1.0, 0, 1) : 0;
    let shx = 0, shy = 0;
    if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 30); shx = (Math.random() - 0.5) * S.shake; shy = (Math.random() - 0.5) * S.shake; }
    ctx.save(); ctx.translate(shx, shy);

    ctx.drawImage(S.dais, cx - 320, cy + 150 - 70);
    ctx.drawImage(S.anvil, cx - 110, cy + 120 - 36);

    // ---- rune ring (15 notches, flattened for perspective)
    const lvShown = it ? (a ? a.from : (it.enh || 0)) : 0;
    const ringR = 240, flat = 0.28, ringY = cy + 128;
    ctx.save(); ctx.translate(cx, ringY);
    for (let i = 0; i < 15; i++) {
      const ang = -Math.PI / 2 + (i / 15) * TAU, px = Math.cos(ang) * ringR, py = Math.sin(ang) * ringR * flat;
      const lit = i < lvShown, target = i === lvShown, burning = a && target && charge > 0.1;
      let col = lit ? (i >= 5 ? '#ff9a3c' : '#e8c46a') : 'rgba(110,90,150,0.45)', size = lit ? 9 : 6.5, gl = lit ? (i >= 5 ? 'amber' : 'cream') : null;
      if (burning) { const flick = 0.5 + 0.5 * Math.sin(t * (10 + charge * 18)); const good = ok || tell < 0.2; col = good ? `rgba(255,${Math.round(200 + 55 * flick)},120,1)` : `rgba(255,${Math.round(60 + 80 * flick)},90,1)`; size = 7 + 7 * charge; gl = good ? 'amber' : 'red'; }
      if (gl) { const gs = size * 5; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8; ctx.drawImage(glow(gl, 64), px - gs / 2, py - gs / 2, gs, gs); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, size, 0, TAU); ctx.fill();
      if (i === 4 || i === 9) { ctx.strokeStyle = 'rgba(255,200,120,0.4)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, size + 5, 0, TAU); ctx.stroke(); }
    }
    // the sweeping arc that charges around the ring (a wide faint stroke under a thin bright one: no blur needed)
    if (a && tl < T_STRIKE) {
      const p = clamp(tl / T_STRIKE, 0, 1), end = -Math.PI / 2 + p * TAU * 2;
      let r = 255, gC = 190, bC = 90, al = 0.95;
      if (tell > 0) { if (ok) { gC = 210 + 45 * tell; bC = 120 + 135 * tell; } else if (Math.sin(t * 40) > 0) { r = 255; gC = 60; bC = 80; } else { r = 70; gC = 20; bC = 40; al = 0.9; } }
      const c1 = `rgba(${Math.round(r)},${Math.round(gC)},${Math.round(bC)},`;
      ctx.lineCap = 'round';
      ctx.strokeStyle = c1 + '0.25)'; ctx.lineWidth = 14 + 6 * charge; ctx.beginPath(); ctx.ellipse(0, 0, ringR, ringR * flat, 0, end - 1.6, end); ctx.stroke();
      ctx.strokeStyle = c1 + al + ')'; ctx.lineWidth = 3 + 3 * charge; ctx.beginPath(); ctx.ellipse(0, 0, ringR, ringR * flat, 0, end - 1.6, end); ctx.stroke();
    }
    ctx.restore();

    // ---- the item
    if (it) {
      const sp = spriteFor(it);
      let ix = cx, iy = cy - 100 + Math.sin(t * 1.6) * 6, jit = { x: 0, y: 0 }, crack = 0, alpha = 1, scale = 1, halo = (lvShown >= 6 ? 'amber' : 'violet'), haloA = 0.55;
      if (a) {
        iy -= 40 * Math.sin(Math.min(1, tl / 1.2) * Math.PI / 2);                // it rises to the anvil
        halo = 'amber'; haloA = 0.5 + 0.25 * Math.sin(t * (6 + charge * 14));
        if (tell > 0) {
          if (ok) { halo = 'gold'; haloA = 0.6 + 0.4 * tell; iy -= 6 * tell; }
          else { halo = Math.sin(t * 36) > 0 ? 'red' : 'steel'; haloA = 0.55; jit = { x: (Math.random() - 0.5) * 7 * tell, y: (Math.random() - 0.5) * 5 * tell }; crack = tell; }
        } else { jit = { x: (Math.random() - 0.5) * 1.6 * charge, y: 0 }; }
        if (tl >= T_STRIKE && tl < T_RESULT) { iy += 18 * Math.sin(((tl - T_STRIKE) / (T_RESULT - T_STRIKE)) * Math.PI); }
        if (tl >= T_RESULT && !ok) alpha = clamp(1 - resP * 2.4, 0, 1);
        if (tl >= T_RESULT && ok) scale = 1 + 0.12 * Math.sin(Math.min(1, resP * 2) * Math.PI);
      }
      const sw = sp.w * scale * 0.95, sh = sp.h * scale * 0.95, hx = ix + jit.x, hy = iy + jit.y;
      // halo behind the piece (a pre-rendered glow, tinted by the state)
      const hs = Math.max(sw, sh) * 1.25;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, haloA) * alpha; ctx.drawImage(glow(halo, 128), hx - hs / 2, hy - hs / 2 - 20, hs, hs);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
      ctx.drawImage(sp.c, hx - sw / 2, hy - sh * 0.62, sw, sh);
      ctx.globalAlpha = 1;
      if (crack > 0) {   // a failure: red cracks race across the piece
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const seeds = [[-8, -150, -30, -80, -12, -10, -36, 60], [14, -130, 4, -70, 22, -5, 8, 70], [-40, -40, 0, -26, 30, -42]];
        for (const [w, al] of [[7, 0.25], [2.6, 0.95]]) {
          ctx.strokeStyle = `rgba(255,60,85,${al * crack * alpha})`; ctx.lineWidth = w;
          for (const s of seeds) { ctx.beginPath(); ctx.moveTo(hx + s[0], hy + s[1]); const n = Math.max(2, Math.ceil(crack * (s.length / 2))); for (let i = 1; i < n; i++) ctx.lineTo(hx + s[i * 2], hy + s[i * 2 + 1]); ctx.stroke(); }
        }
      }
      S.itemPos = { x: hx, y: hy };
    }

    // ---- embers: spawn, steer, draw as pre-rendered glows
    const spawnRate = a ? 30 + 70 * charge : 10;
    for (let i = 0; i < spawnRate * dt && S.parts.length < 220; i++) {
      const ang = Math.random() * TAU, rr = 120 + Math.random() * 280;
      S.parts.push({ x: cx + Math.cos(ang) * rr, y: cy + 140 + Math.sin(ang) * rr * 0.34, vx: 0, vy: -30 - Math.random() * 60, life: 2.5, max: 2.5, size: 1.4 + Math.random() * 2.2, col: Math.random() < 0.5 ? 'amber' : 'violet', kind: 'e' });
    }
    ctx.globalCompositeOperation = 'lighter';
    const ip0 = S.itemPos || { x: cx, y: cy };
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i]; p.life -= dt;
      if (p.life <= 0) { S.parts[i] = S.parts[S.parts.length - 1]; S.parts.pop(); continue; }
      if (p.kind === 'e') {
        if (a && tell > 0 && ok) { p.vx += (ip0.x - p.x) * 2.2 * dt; p.vy += (ip0.y - p.y) * 2.2 * dt; p.vx *= 0.97; p.vy *= 0.97; }
        else if (a && tell > 0 && !ok) { p.vx += (p.x - ip0.x) * 0.9 * dt; p.vy += (p.y - ip0.y) * 0.5 * dt - 40 * dt; p.col = 'red'; }
        else p.vy -= 10 * dt;
      } else p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const al = clamp(p.life / p.max, 0, 1), gs = p.size * (p.kind === 'b' ? 0.6 + al * 0.8 : 1) * 6;
      ctx.globalAlpha = p.kind === 'e' ? Math.min(1, al * 2) * 0.85 : al;
      ctx.drawImage(glow(p.col, 32), p.x - gs / 2, p.y - gs / 2, gs, gs);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // ---- timeline events
    if (a) {
      a.t += dt;
      const ip = S.itemPos || { x: cx, y: cy };
      if (!a.struck && a.t >= T_STRIKE) {
        a.struck = true; S.shake = 18; S.flash = 0.55;
        burst(cx, cy + 118, 30, 'cream', 520, 0.7, 3, 120);
        S.rings = (S.rings || []); S.rings.push({ x: cx, y: cy + 128, r: 20, v: 700, life: 0.7, max: 0.7, col: '255,220,150' });
      }
      if (!a.shown && a.t >= T_RESULT) {
        a.shown = true;
        if (a.ok) { S.flash = 1; S.shake = 14; burst(ip.x, ip.y, 80, 'gold', 640, 1.3, 3.4, 60); burst(ip.x, ip.y, 40, 'white', 420, 0.9, 2.4, 0); S.rings.push({ x: cx, y: cy + 128, r: 20, v: 900, life: 1.1, max: 1.1, col: '255,235,170' }); }
        else { S.flash = 0.5; S.shake = 22; burst(ip.x, ip.y, 50, 'steel', 420, 1.6, 3.6, 520); burst(ip.x, ip.y, 30, 'red', 360, 1.1, 2.4, 300); S.rings.push({ x: cx, y: cy + 128, r: 20, v: 520, life: 0.9, max: 0.9, col: '255,60,90' }); }
        try { g().updateAllUI(); } catch (e) {}
        renderPanels();
      }
      if (a.t >= T_END) finish();
    }
    // shock rings
    if (S.rings) for (let i = S.rings.length - 1; i >= 0; i--) {
      const r = S.rings[i]; r.life -= dt; if (r.life <= 0) { S.rings.splice(i, 1); continue; }
      r.r += r.v * dt; const al = r.life / r.max;
      ctx.strokeStyle = `rgba(${r.col},${al})`; ctx.lineWidth = 6 * al + 1; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, TAU); ctx.stroke();
    }

    // ---- result text (a wide faint outline under the fill gives the glow, no blur)
    if (a && a.t >= T_RESULT) {
      const p = clamp((a.t - T_RESULT) / 0.35, 0, 1), s = 1 + (1 - p) * 0.9, fade = a.t > T_END - 0.5 ? clamp((T_END - a.t) / 0.5, 0, 1) : 1;
      ctx.save(); ctx.translate(cx, cy + 285); ctx.scale(s, s); ctx.globalAlpha = p * fade; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      const big = a.ok ? '+' + a.to : 'FAILED', sub = a.ok ? (a.to >= 13 ? 'LEGENDARY FORGING' : a.to >= 10 ? 'MASTERWORK' : 'ENHANCED') : (a.drop ? 'DROPPED TO +' + a.to : 'THE METAL WOULD NOT TAKE');
      ctx.font = (a.ok ? '700 84px' : '700 60px') + ' Cinzel, Georgia, serif';
      ctx.strokeStyle = a.ok ? 'rgba(255,200,96,0.35)' : 'rgba(255,43,74,0.35)'; ctx.lineWidth = 14; ctx.strokeText(big, 0, 0);
      ctx.fillStyle = a.ok ? '#fff1c4' : '#ff8294'; ctx.fillText(big, 0, 0);
      ctx.font = '600 18px "Barlow Condensed", Arial, sans-serif'; ctx.fillStyle = a.ok ? '#ffd98a' : '#d9a6b0'; ctx.fillText(sub, 0, a.ok ? 30 : 28);
      ctx.restore();
    }
    ctx.restore();

    // ---- flash + vignette
    if (S.flash > 0) { ctx.fillStyle = `rgba(255,248,230,${S.flash * 0.55})`; ctx.fillRect(0, 0, W, H); S.flash = Math.max(0, S.flash - dt * 1.8); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = a && tell > 0 && !ok ? 0.75 : 0.55; ctx.drawImage(S.vig, 0, 0); ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- open / close
  function open(uid) {
    build(); loadFiles();
    S.open = true; S.anim = null; S.parts.length = 0; S.lastResult = null; S.rings = []; S.cls = g().playerClass || 'breaker';
    if (uid) S.uid = uid;
    S.root.classList.remove('hidden'); fit(); renderPanels();
    S.last = 0; cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(frame);
  }
  function close() {
    if (!S.open) return;
    if (S.anim) { S.anim.t = Math.max(S.anim.t, T_END); finish(); }
    S.open = false; cancelAnimationFrame(S.raf);
    S.root.classList.add('hidden');
    try { g().updateAllUI(); g().renderForgeModal(); } catch (e) {}
  }

  // the hub covers the whole window, so the world behind it does not need to be painted while it is open
  if (typeof Game25D !== 'undefined') {
    const oDraw = Game25D.prototype.draw;
    Game25D.prototype.draw = function (...a) { if (S.open) return; return oDraw.apply(this, a); };
  }

  window.EnhanceHub = { open, close, isOpen: () => S.open, _frame: frame, T: { T_TELL, T_STRIKE, T_RESULT, T_END }, _S: S };
})();
