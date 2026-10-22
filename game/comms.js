// =========================================================================
// COMMS.JS — talking to each other and keeping a session smooth.
//   pings          tap the scroll wheel (middle click): a marker appears for everyone, with your name
//   emote wheel    hold Alt and left-click: a wheel of eight lines (edit them in Settings > Controls); Alt+1..8 sends one directly
//   ready check    the host's Enter opens a ready check when friends are in the room, then a 3-2-1
//   reconnect      a guest who loses the host retries automatically and is dropped back into the raid
//   solo pause     Esc in a solo raid pauses
//   quick retries  the boss intro is skipped when you retry with the same party
// Packets are named cx_* and relayed by the host (see network_coop.js).
// =========================================================================
(function () {
  if (typeof Game25D === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m) => { if (window.QoL) window.QoL.toast(m); };
  const G = () => window.game;
  const NET = () => window.game && window.game.net;
  const AUD = () => (typeof audio !== 'undefined' ? audio : null);
  const COLORS = ['#38bdf8', '#fb923c', '#a3e635', '#f472b6'];
  const colorOf = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const findPlayer = (id) => ((G() && G().party) || []).find(p => p.id === id) || null;

  const pings = [];     // { x, y, t, name, color }
  const bubbles = [];   // { id, text, t, color }

  // ------------------------------------------------------------------ pings
  function beep(freq) {
    try {
      const a = AUD(); if (!a || !a.ctx || a.muted) return;
      const o = a.ctx.createOscillator(), gn = a.ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      gn.gain.setValueAtTime(0.0001, a.ctx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.12, a.ctx.currentTime + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, a.ctx.currentTime + 0.16);
      o.connect(gn); gn.connect(a.sfxBus || a.ctx.destination);
      o.start(); o.stop(a.ctx.currentTime + 0.18);
    } catch (e) {}
  }
  let lastPing = 0;
  function sendPing(x, y) {
    const g = G(), now = performance.now();
    if (!g || now - lastPing < 450) return;
    lastPing = now;
    const p = g.localPlayer;
    addPing(x, y, p.name, colorOf(p.id), true);
    if (NET() && NET().isConnected()) NET().broadcast({ type: 'cx_ping', pid: p.id, name: p.name, x: Math.round(x), y: Math.round(y) });
  }
  function addPing(x, y, name, color, own) {
    pings.push({ x, y, t: 0, name: String(name || 'Warden').slice(0, 16), color });
    while (pings.length > 8) pings.shift();
    beep(own ? 740 : 620);
  }

  // ------------------------------------------------------------------ emotes
  function sendEmote(text) {
    const g = G();
    if (!g || !text) return;
    const p = g.localPlayer;
    addBubble(p.id, text, colorOf(p.id));
    if (NET() && NET().isConnected()) NET().broadcast({ type: 'cx_emote', pid: p.id, text: String(text).slice(0, 24) });
  }
  function addBubble(id, text, color) {
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].id === id) bubbles.splice(i, 1);
    bubbles.push({ id, text: String(text).slice(0, 24), t: 0, color });
    beep(520);
  }

  // the wheel
  let wheel = null, wheelState = null;
  function lines() { return (window.SettingsPlus && window.SettingsPlus.emotes()) || ['Nice!', 'Thank you', 'Help!', 'Wait for me', 'On me', 'Stagger now', 'Sorry', 'Good game']; }
  function openWheel(cx, cy) {
    closeWheel();
    wheel = document.createElement('div');
    wheel.id = 'emote-wheel';
    const L = lines();
    wheel.style.left = cx + 'px'; wheel.style.top = cy + 'px';
    wheel.innerHTML = '<i class="ew-dot"></i>' + L.map((t, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      return `<span class="ew-slot" data-i="${i}" style="left:${Math.round(Math.cos(a) * 96)}px;top:${Math.round(Math.sin(a) * 96)}px"><kbd>${i + 1}</kbd>${esc(t)}</span>`;
    }).join('');
    document.body.appendChild(wheel);
    wheelState = { cx, cy, sel: -1 };
  }
  function moveWheel(x, y) {
    if (!wheel) return;
    const dx = x - wheelState.cx, dy = y - wheelState.cy;
    let sel = -1;
    if (Math.hypot(dx, dy) > 26) {
      const a = Math.atan2(dy, dx) + Math.PI / 2;
      sel = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
    }
    if (sel !== wheelState.sel) {
      wheelState.sel = sel;
      wheel.querySelectorAll('.ew-slot').forEach(s => s.classList.toggle('on', +s.dataset.i === sel));
    }
  }
  function closeWheel(send) {
    if (!wheel) return;
    const sel = wheelState.sel;
    wheel.remove(); wheel = null; wheelState = null;
    if (send && sel >= 0) sendEmote(lines()[sel]);
  }

  // ------------------------------------------------------------------ ready check + countdown
  let ready = null;      // { rid, list: [{id,name,ok}], host }
  let cdTimer = null;
  function readyModal() {
    let el = $('ready-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ready-modal'; el.className = 'cx-overlay hidden';
      el.innerHTML = '<div class="cx-panel"><div class="vr-kicker">CHALICE RAID</div><h2>Ready check</h2><div id="rc-list"></div><div class="rc-btns" id="rc-btns"></div></div>';
      document.body.appendChild(el);
    }
    return el;
  }
  function paintReady() {
    const el = readyModal();
    if (!ready) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('rc-list').innerHTML = ready.list.map(r => `<div class="rc-row ${r.ok ? 'ok' : ''}"><b>${esc(r.name)}</b><span>${r.ok ? 'Ready' : 'Waiting'}</span></div>`).join('');
    const me = G().localPlayer.id;
    const mine = ready.list.find(r => r.id === me);
    const btns = [];
    if (!ready.host && mine && !mine.ok) btns.push('<button class="forge-craft-btn" data-a="ready">Ready</button>');
    else if (!ready.host) btns.push('<span class="rc-wait">Waiting for the others…</span>');
    if (ready.host) { btns.push('<button class="forge-craft-btn" data-a="go">Start now</button>'); btns.push('<button class="nav-btn" data-a="cancel">Cancel</button>'); }
    $('rc-btns').innerHTML = btns.join('');
  }
  function beginReady() {
    const g = G(), n = NET();
    if (ready && ready.host) return true;      // already waiting on a ready check: swallow the extra click
    if (!g || !n || !n.isHost || !n.isConnected() || ready) return false;
    const list = (g.party || []).filter(p => !p.isBot).map(p => ({ id: p.id, name: p.name || 'Warden', ok: !!p.isLocal }));
    if (list.length < 2) return false;
    ready = { rid: Date.now(), list, host: true };
    n.broadcast({ type: 'cx_ready_check', rid: ready.rid, list, relay: false });
    g.closeAllModals();
    paintReady();
    checkAllReady();
    return true;
  }
  function checkAllReady() {
    if (!ready || !ready.host) return;
    if (ready.list.every(r => r.ok)) startCountdown(true);
  }
  function startCountdown(isHost) {
    if (cdTimer) return;
    const n = NET();
    if (isHost && n) n.broadcast({ type: 'cx_countdown', relay: false });
    ready = null; paintReady();
    let k = 3;
    const el = $('countdown') || (() => { const d = document.createElement('div'); d.id = 'countdown'; document.body.appendChild(d); return d; })();
    const tick = () => {
      if (k <= 0) {
        clearInterval(cdTimer); cdTimer = null; el.classList.remove('show');
        if (isHost) { G().closeAllModals(); G().enterRaidGate(true); }
        return;
      }
      el.textContent = k; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      beep(k === 1 ? 880 : 660);
      k--;
    };
    tick(); cdTimer = setInterval(tick, 1000);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#ready-modal [data-a]'); if (!b || !ready) return;
    const a = b.dataset.a, n = NET();
    if (a === 'ready') { n.broadcast({ type: 'cx_ready_reply', rid: ready.rid, pid: G().localPlayer.id, relay: false }); const me = ready.list.find(r => r.id === G().localPlayer.id); if (me) me.ok = true; paintReady(); }
    else if (a === 'go') startCountdown(true);
    else if (a === 'cancel') { n.broadcast({ type: 'cx_ready_cancel', relay: false }); ready = null; paintReady(); }
  });

  // ------------------------------------------------------------------ incoming
  function onNet(senderId, d) {
    const g = G(), n = NET();
    if (!g || !d) return;
    if (d.type === 'cx_ping') addPing(d.x, d.y, d.name, colorOf(d.pid), false);
    else if (d.type === 'cx_emote') addBubble(d.pid, d.text, colorOf(d.pid));
    else if (d.type === 'cx_ready_check') { if (!n.isHost) { ready = { rid: d.rid, list: d.list || [], host: false }; paintReady(); } }
    else if (d.type === 'cx_ready_state') { if (ready && !n.isHost) { ready.list = d.list || ready.list; paintReady(); } }
    else if (d.type === 'cx_ready_reply') {
      if (ready && ready.host && d.rid === ready.rid) {
        const r = ready.list.find(x => x.id === d.pid); if (r) r.ok = true;
        n.broadcast({ type: 'cx_ready_state', rid: ready.rid, list: ready.list, relay: false });
        paintReady(); checkAllReady();
      }
    }
    else if (d.type === 'cx_ready_cancel') { if (!n.isHost) { ready = null; paintReady(); toast('The host cancelled the ready check'); } }
    else if (d.type === 'cx_countdown') { if (!n.isHost) { ready = null; paintReady(); startCountdown(false); } }
  }

  // ------------------------------------------------------------------ drawing (world space, after the effects)
  if (typeof ArenaFX !== 'undefined') {
    const oDraw = ArenaFX.prototype.drawForegroundSparks;
    ArenaFX.prototype.drawForegroundSparks = function (ctx) {
      oDraw.call(this, ctx);
      if (!pings.length && !bubbles.length) return;
      const dt = 1 / 60;
      const T = PERSPECTIVE_TILT;
      for (let i = pings.length - 1; i >= 0; i--) {
        const p = pings[i]; p.t += dt;
        if (p.t > 4.2) { pings.splice(i, 1); continue; }
        const a = Math.min(1, (4.2 - p.t) / 0.8), k = (p.t * 1.1) % 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.globalAlpha = a;
        ctx.save(); ctx.scale(1, T);
        ctx.strokeStyle = p.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 14 + k * 40, 0, Math.PI * 2); ctx.globalAlpha = a * (1 - k); ctx.stroke();
        ctx.globalAlpha = a; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        const bob = Math.sin(p.t * 6) * 3;
        ctx.fillStyle = p.color; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -6 + bob); ctx.lineTo(-9, -24 + bob); ctx.lineTo(9, -24 + bob); ctx.closePath(); ctx.stroke(); ctx.fill();
        ctx.font = '600 13px "Barlow Condensed", "Segoe UI", sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(p.name, 0, -30 + bob); ctx.fillStyle = '#fff'; ctx.fillText(p.name, 0, -30 + bob);
        ctx.restore();
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.t += dt;
        const pl = findPlayer(b.id);
        if (b.t > 3.6 || !pl) { if (b.t > 3.6 || !pl) bubbles.splice(i, 1); continue; }
        const a = Math.min(1, (3.6 - b.t) / 0.5, b.t / 0.12 + 0.1);
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.font = '600 15px "Cabin", "Segoe UI", sans-serif';
        const w = ctx.measureText(b.text).width + 20, x = pl.x, y = pl.y - 124 - Math.min(8, b.t * 40);
        ctx.fillStyle = 'rgba(10,9,14,0.92)'; ctx.strokeStyle = b.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(x - w / 2, y - 14, w, 26); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 5, y + 12); ctx.lineTo(x, y + 19); ctx.lineTo(x + 5, y + 12); ctx.fillStyle = 'rgba(10,9,14,0.92)'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f1ede0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.text, x, y);
        ctx.restore();
      }
    };
  }

  // ------------------------------------------------------------------ input
  window.addEventListener('mousedown', (e) => {
    const g = G();
    if (!g || e.target !== g.canvas) return;
    if (window.CharSelect && window.CharSelect.isOpen()) return;
    if (e.button === 1) {
      e.preventDefault(); e.stopImmediatePropagation();
      const w = g.camera.screenToWorld(e.clientX, e.clientY, g.canvas.width, g.canvas.height);
      sendPing(w.x, w.y);
    } else if (e.button === 0 && e.altKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      openWheel(e.clientX, e.clientY);
    }
  }, true);
  window.addEventListener('mousemove', (e) => { if (wheel) moveWheel(e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => { if (wheel) closeWheel(true); });
  window.addEventListener('auxclick', (e) => { if (e.button === 1 && e.target === (G() && G().canvas)) e.preventDefault(); });
  window.addEventListener('blur', () => closeWheel(false));
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (window.CharSelect && window.CharSelect.isOpen()) return;
    if (e.altKey && /^[1-8]$/.test(e.key)) { e.preventDefault(); sendEmote(lines()[+e.key - 1]); }
  });

  // ------------------------------------------------------------------ solo pause
  function modalOpen() { return [...document.querySelectorAll('.modal-window')].some(m => !m.classList.contains('hidden')); }
  function pauseOverlay() {
    let el = $('pause-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pause-overlay'; el.className = 'cx-overlay hidden';
      el.innerHTML = '<div class="cx-panel"><div class="vr-kicker">PAUSED</div><h2>Take a breath</h2><div class="rc-btns"><button class="forge-craft-btn" id="ps-resume">Resume</button><button class="nav-btn" id="ps-hub">Return to hub</button></div><div class="rc-wait">Esc to resume</div></div>';
      document.body.appendChild(el);
      $('ps-resume').addEventListener('click', resume);
      $('ps-hub').addEventListener('click', () => { resume(); G().enterHub(); });
    }
    return el;
  }
  function pause() {
    const g = G(); if (!g || g.paused) return;
    g.paused = true;
    pauseOverlay().classList.remove('hidden');
    if (window.QoL) window.QoL.releaseAll();
    const a = AUD();
    try { if (a && a.ctx) a.ctx.suspend(); for (const t of Object.values((a && a.musicTracks) || {})) if (t && !t.paused) { t.pause(); t._wasPlaying = true; } if (a && a.currentVoiceAudio && !a.currentVoiceAudio.paused) { a.currentVoiceAudio.pause(); a._voiceWas = true; } } catch (e) {}
  }
  function resume() {
    const g = G(); if (!g || !g.paused) return;
    g.paused = false;
    pauseOverlay().classList.add('hidden');
    g.lastTime = performance.now();
    const a = AUD();
    try { if (a && a.ctx) a.ctx.resume(); if (a && a._voiceWas && a.currentVoiceAudio) a.currentVoiceAudio.play().catch(() => {}); if (a) { a._voiceWas = false; a.syncMp3MusicPlayback(); } } catch (e) {}
  }
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return;
    const g = G(); if (!g) return;
    if (g.paused) { e.preventDefault(); e.stopImmediatePropagation(); resume(); return; }
    if (g.mode === 'raid' && !NET().isConnected() && !modalOpen() && !(window.CharSelect && window.CharSelect.isOpen()) && g.boss && g.boss.hp > 0 && !g.raidVictoryShown && !g.defeatShown) {
      e.preventDefault(); e.stopImmediatePropagation(); pause();
    }
  }, true);
  const protoU = Game25D.prototype.update;
  Game25D.prototype.update = function (dt) { if (this.paused) return; return protoU.call(this, dt); };

  // ------------------------------------------------------------------ retries skip the intro (same party only)
  // per raid too: having seen Vaelgor's intro must not skip Ignis's
  const partyKey = (g) => (g.raidId || 'vaelgor') + ':' + (g.party || []).filter(p => !p.isBot).map(p => p.id).sort().join('|');
  Object.defineProperty(Game25D.prototype, 'introSeen', {
    get() { return !!this._introParty && this._introParty === partyKey(this); },
    set(v) { this._introParty = v ? partyKey(this) : null; }
  });
  const protoEnter = Game25D.prototype.enterRaidGate;
  Game25D.prototype.enterRaidGate = function () {
    const r = protoEnter.apply(this, arguments);
    this.paused = false;
    this._introParty = partyKey(this);     // from now on this party counts as having seen it
    return r;
  };
  if (typeof VaelgorRaidBoss !== 'undefined') {
    const oIntro = VaelgorRaidBoss.prototype.triggerIntroCutscene;
    VaelgorRaidBoss.prototype.triggerIntroCutscene = function () {
      const g = G();
      const skip = g && !(g.boss && (g.boss.practiceClockMode || g.boss.practiceFinalPhaseMode || g.boss.practiceFinalClashMode)) &&
        (g.skipCutscenes || (NET().isClient() ? g._skipIntro : g.introSeen));
      if (skip) { this.state = 'idle'; this.stateTimer = 0; this.aiCooldown = 0.9; this.patStep = 0; return; }
      return oIntro.apply(this, arguments);
    };
  }

  // ------------------------------------------------------------------ reconnect
  let lastCode = '', wasClient = false, tries = 0, rcTimer = 0, giveUp = false;
  function reconnectOverlay() {
    let el = $('reconnect-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'reconnect-overlay'; el.className = 'cx-overlay hidden';
      el.innerHTML = '<div class="cx-panel"><div class="vr-kicker">CONNECTION LOST</div><h2>Reconnecting…</h2><div class="rc-wait" id="rc-info"></div><div class="rc-btns"><button class="nav-btn" id="rc-stop">Stop trying</button></div></div>';
      document.body.appendChild(el);
      $('rc-stop').addEventListener('click', () => { giveUp = true; wasClient = false; el.classList.add('hidden'); });
    }
    return el;
  }
  function watchConnection() {
    const n = NET(); if (!n) return;
    if (!n.joinRoom._wrapped) {
      const oJoin = n.joinRoom.bind(n);
      n.joinRoom = function (code) { if (code) lastCode = String(code).trim().toUpperCase(); return oJoin.apply(null, arguments); };
      n.joinRoom._wrapped = true;
    }
    const client = n.isClient();
    const el = reconnectOverlay();
    if (client) {
      wasClient = true; giveUp = false;
      if (!el.classList.contains('hidden')) { el.classList.add('hidden'); toast('Back in the room'); }
      tries = 0;
      return;
    }
    if (wasClient && !giveUp && lastCode && !n.isConnected()) {
      el.classList.remove('hidden');
      rcTimer -= 1;
      if (rcTimer <= 0 && tries < 12) {
        tries++; rcTimer = 5;
        $('rc-info').textContent = `Trying ${lastCode} (attempt ${tries} of 12)`;
        try { n.joinRoom(lastCode, () => {}); } catch (e) {}
      } else if (tries >= 12 && rcTimer <= 0) {
        $('rc-info').textContent = 'Could not get back in. Ask the host for the room code and join again.';
        wasClient = false;
      }
    }
  }
  setInterval(watchConnection, 1000);

  window.Comms = { onNet, beginReady, sendPing, sendEmote, pause, resume, pings, bubbles };
})();
