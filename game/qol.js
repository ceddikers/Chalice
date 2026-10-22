// =========================================================================
// QOL.JS — small quality-of-life features. Loaded last; touches nothing in the fight logic.
//   • releasing every held key / mouse button when the window loses focus (no more stuck charge or stuck walking after alt-tab)
//   • mute button + [M], and the Ally VFX choice, remembered between sessions
//   • a live connection badge (ping to the host, or who is connected) and "connected / disconnected" toasts
//   • copy-room-code with feedback, an invite link (?join=CODE) that fills in and joins after the class screen
// =========================================================================
(function () {
  const KEY = 'newtry1_settings';
  const $ = (id) => document.getElementById(id);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  // ---- toast ------------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    let el = $('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---- clipboard --------------------------------------------------------
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try {                                   // older / insecure contexts
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  async function copyRoom(kind, btn) {
    const g = window.game;
    const code = g && g.net && g.net.roomId;
    if (!code || !(g.net.isHost && g.net.peer)) { toast('Host a room first'); return; }
    const text = kind === 'link' ? `${location.origin}${location.pathname}?join=${code}` : code;
    const ok = await copyText(text);
    toast(ok ? (kind === 'link' ? 'Invite link copied' : `Room code ${code} copied`) : 'Could not copy. Select the code by hand.');
    if (ok && btn) { const old = btn.textContent; btn.textContent = '✅ Copied'; setTimeout(() => { btn.textContent = old; }, 1400); }
  }

  // ---- mute -------------------------------------------------------------
  function applyMute() {
    if (typeof audio === 'undefined') return;
    audio.muted = !!S.muted;
    try {
      if (audio.masterGain) audio.masterGain.gain.value = S.muted ? 0 : 0.9;
      if (typeof audio.syncMp3MusicPlayback === 'function') audio.syncMp3MusicPlayback();
    } catch (e) {}
    const btn = $('btn-mute');
    if (btn) { btn.textContent = S.muted ? 'Sound off' : 'Sound'; btn.title = S.muted ? 'Sound is off  [M]' : 'Mute sound  [M]'; }
  }
  function toggleMute() { S.muted = !S.muted; save(); applyMute(); toast(S.muted ? 'Sound off' : 'Sound on'); }

  // ---- stuck-input protection --------------------------------------------
  function releaseAll() {
    const g = window.game;
    if (!g) return;
    const held = Array.from(g.keysDown || []);
    if (g.keysDown) g.keysDown.clear();
    g.leftMouseDown = false;
    g.rightMouseDown = false;
    for (const k of held) {
      try { if (g.localPlayer && typeof g.localPlayer.releaseSkill === 'function') g.localPlayer.releaseSkill(k); } catch (e) {}
    }
  }

  // ---- connection badge -----------------------------------------------------
  let lastPeers = 0;
  function updateBadge() {
    const g = window.game, net = g && g.net;
    const el = $('net-badge');
    if (!net || !el) return;
    const peers = net.connectedPeers ? net.connectedPeers.size : 0;
    if (peers !== lastPeers) {
      if (peers > lastPeers) toast(net.isHost ? 'A player joined your room' : 'Connected to the host');
      else toast(net.isHost ? 'A player left' : 'Disconnected from the host');
      lastPeers = peers;
    }
    if (!peers) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    let ms = 0, label;
    if (net.isHost) {
      for (const v of net.peerRtt.values()) ms = Math.max(ms, v || 0);
      label = `📡 Host · ${peers + 1} players` + (ms ? ` · ${Math.round(ms)} ms` : '');
    } else {
      ms = net.rtt || 0;
      label = `🔗 ${ms ? Math.round(ms) + ' ms' : 'connecting…'}`;
    }
    el.textContent = label;
    el.className = 'net-badge ' + (!ms ? '' : ms < 90 ? 'good' : ms < 180 ? 'ok' : 'bad');
  }

  // ---- mouse buttons: right-click moves (default) or left-click moves ------------------
  function setSwap(on, quiet) {
    S.swapMouse = !!on; save();
    const g = window.game;
    if (g) { g.swapMouse = S.swapMouse; g.leftMouseDown = false; g.rightMouseDown = false; }
    const mv = S.swapMouse ? 'LMB' : 'RMB', at = S.swapMouse ? 'RMB' : 'LMB';
    for (const [id, t] of [['ctl-move', mv], ['ctl-atk', at], ['hint-move', mv], ['hint-atk', at]]) { const e = $(id); if (e) e.textContent = t; }
    if (!quiet) toast(S.swapMouse ? 'Left-click moves, right-click attacks' : 'Right-click moves, left-click attacks');
  }

  // ---- settings panel -------------------------------------------------------
  function buildSettings(g) {
    if ($('settings-modal')) return;
    const el = document.createElement('div');
    el.id = 'settings-modal';
    el.className = 'modal-window settings-window hidden';
    el.innerHTML = `
      <div class="modal-hdr">
        <div class="hdr-title"><div class="hdr-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg></div><div><h2>Settings</h2><div class="hdr-sub">Saved on this device</div></div></div>
        <button class="close-btn" onclick="window.game.closeAllModals()" title="Close (Esc)">×</button>
      </div>
      <div class="set-row"><div><b>Screen shake</b><small>How hard the screen shakes on big hits</small></div>
        <div class="set-seg" data-key="shake"><button data-v="1">Full</button><button data-v="0.5">Half</button><button data-v="0">Off</button></div></div>
      <div class="set-row"><div><b>Flashes &amp; zoom punches</b><small>Reduced makes impacts calmer</small></div>
        <div class="set-seg" data-key="calm"><button data-v="0">Normal</button><button data-v="1">Reduced</button></div></div>
      <div class="set-row"><div><b>Mouse buttons</b><small>Which button moves your character</small></div>
        <div class="set-seg" data-key="mouse"><button data-v="rmb">Right-click</button><button data-v="lmb">Left-click</button></div></div>
      <div class="set-row"><div><b>Sound</b><small>Also on the [M] key</small></div>
        <div class="set-seg" data-key="sound"><button data-v="on">On</button><button data-v="off">Off</button></div></div>
      <div class="set-row"><div><b>Ally effects</b><small>Hide teammates' skill effects to save FPS</small></div>
        <div class="set-seg" data-key="vfx"><button data-v="on">Show</button><button data-v="off">Hide</button></div></div>
      <div class="section-label">Controls</div>
      <div class="ctrl-grid">
        <span><kbd id="ctl-move">RMB</kbd> Move</span><span><kbd id="ctl-atk">LMB</kbd> Attack</span>
        <span><kbd>Q W E R</kbd> Skills</span><span><kbd>A S D F</kbd> Skills</span>
        <span><kbd>T</kbd> Ultimate</span><span><kbd>Z</kbd> Class gauge</span>
        <span><kbd>Space</kbd> Evade</span><span><kbd>G</kbd> Forge / interact</span>
        <span><kbd>C</kbd> Co-op</span><span><kbd>M</kbd> Mute</span>
        <span><kbd>Esc</kbd> Close menus</span><span><kbd>Wheel</kbd> Zoom</span>
      </div>
      <div class="set-foot"><button class="nav-btn" id="btn-reset-settings">Reset to defaults</button></div>`;
    document.body.appendChild(el);

    const refresh = () => {
      const cur = {
        shake: String(S.shake == null ? 1 : S.shake),
        calm: String(S.calm ? 1 : 0),
        mouse: S.swapMouse ? 'lmb' : 'rmb',
        sound: S.muted ? 'off' : 'on',
        vfx: (g.fx && g.fx.showAllyVfx === false) ? 'off' : 'on'   // the real state: Performance mode and the top-bar button change it too
      };
      el.querySelectorAll('.set-seg').forEach(seg => {
        seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === cur[seg.dataset.key]));
      });
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.set-seg button');
      if (!b) return;
      const key = b.parentNode.dataset.key, v = b.dataset.v;
      if (key === 'shake') { S.shake = parseFloat(v); save(); }
      else if (key === 'calm') { S.calm = v === '1'; save(); }
      else if (key === 'mouse') { setSwap(v === 'lmb'); }
      else if (key === 'sound') { const wantMuted = v === 'off'; if (!!S.muted !== wantMuted) toggleMute(); }
      else if (key === 'vfx') { const wantOn = v === 'on'; if ((g.fx.showAllyVfx !== false) !== wantOn) g.toggleAllyVfx(); }
      refresh();
    });
    $('btn-reset-settings').addEventListener('click', () => {
      S.shake = 1; S.calm = false; setSwap(false, true);
      if (S.muted) toggleMute();
      if (g.fx.showAllyVfx === false) g.toggleAllyVfx();
      save(); refresh(); toast('Settings reset');
    });
    // refresh whenever it opens (mute / VFX can also change from the top bar or [M])
    new MutationObserver(() => { if (!el.classList.contains('hidden')) refresh(); }).observe(el, { attributes: true, attributeFilter: ['class'] });
    refresh();

    const vfx = $('btn-toggle-ally-vfx');
    if (vfx && !$('btn-settings')) {
      const b = document.createElement('button');
      b.className = 'nav-btn'; b.id = 'btn-settings'; b.textContent = 'Settings'; b.title = 'Settings';
      b.addEventListener('click', () => g.toggleModal('settings-modal'));
      vfx.parentNode.appendChild(b);
    }
  }

  function init() {
    if (!window.game) return;
    const g = window.game;

    // remembered settings
    setSwap(!!S.swapMouse, true);
    if (S.allyVfx === false && g.fx && typeof g.fx.setShowAllyVfx === 'function') { g.fx.setShowAllyVfx(false); g.syncAllyVfxButtons(); }
    const origToggle = g.toggleAllyVfx.bind(g);
    g.toggleAllyVfx = function () { origToggle(); S.allyVfx = !(g.fx && g.fx.showAllyVfx === false); save(); };

    // mute button next to Ally VFX
    const vfx = $('btn-toggle-ally-vfx');
    if (vfx && !$('btn-mute')) {
      const b = document.createElement('button');
      b.className = 'nav-btn'; b.id = 'btn-mute';
      b.addEventListener('click', toggleMute);
      vfx.parentNode.insertBefore(b, vfx);
    }
    applyMute();
    if (typeof audio !== 'undefined' && typeof audio.init === 'function') {      // the audio graph is built on first click: re-apply then
      const origInit = audio.init.bind(audio);
      audio.init = function () { const r = origInit.apply(null, arguments); if (S.muted && audio.masterGain) audio.masterGain.gain.value = 0; return r; };
    }
    window.addEventListener('keydown', (e) => {
      if (e.repeat || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) return;
      if (e.key === 'm' || e.key === 'M') toggleMute();
    });

    // focus loss
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

    // connection badge
    const badge = document.createElement('div');
    badge.id = 'net-badge'; badge.className = 'net-badge hidden';
    document.body.appendChild(badge);
    setInterval(updateBadge, 1000);

    // comfort options: scale or silence camera shake, calm down impact flashes / zoom punches
    const cam = g.camera;
    if (cam) {
      const oShake = cam.triggerShake.bind(cam);
      cam.triggerShake = function (mag, dur) { const k = S.shake == null ? 1 : S.shake; if (k <= 0) return; return oShake(mag * k, dur); };
      if (typeof cam.triggerImpactFrame === 'function') {
        const oImp = cam.triggerImpactFrame.bind(cam);
        cam.triggerImpactFrame = function () { if (S.calm) return; return oImp.apply(null, arguments); };
      }
      if (typeof cam.triggerZoomPunch === 'function') {
        const oZoom = cam.triggerZoomPunch.bind(cam);
        cam.triggerZoomPunch = function (a) { return oZoom(S.calm ? a * 0.4 : a); };
      }
    }
    buildSettings(g);

    // copy buttons
    const cc = $('btn-copy-code'), cl = $('btn-copy-link');
    if (cc) cc.addEventListener('click', () => copyRoom('code', cc));
    if (cl) cl.addEventListener('click', () => copyRoom('link', cl));

    // invite link: ?join=CODE fills the box and joins as soon as the class screen is done
    const join = (new URLSearchParams(location.search).get('join') || '').trim().toUpperCase();
    if (join) {
      const input = $('join-code-input');
      if (input) input.value = join;
      let waiting = true;
      const iv = setInterval(() => {
        if (window.CharSelect && window.CharSelect.isOpen()) return;
        clearInterval(iv);
        if (!waiting) return;
        waiting = false;
        const st = $('coop-status');
        g.net.joinRoom(join, (msg) => { if (st) st.textContent = msg; toast(msg); });
      }, 300);
    }
  }

  window.QoL = { toast, copyText, toggleMute, releaseAll };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init);
  else init();
})();
