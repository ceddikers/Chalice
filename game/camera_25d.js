// =========================================================================
// CAMERA_25D.JS — 2.5D Isometric Camera, Hitstop, 3D Boulders, Crescent Waves
// & Dimensional Slash FX Engine (Built from scratch for weighty 2.5D combat)
// =========================================================================

const PERSPECTIVE_TILT = 0.62;

// 15% HP Final Clash cinematic timing (shared by boss pose, camera, HUD and the QTE in breaker_25d.js).
const CLASH_INTRO_DUR = 2.4;        // Vaelgor's opening haymaker + sword hoist, no input needed
const CLASH_INTRO_IMPACT_P = 0.5;   // fraction of the intro at which the first swing connects
const CLASH_CONTACT_PROG = 0.8;     // fraction of a QTE beat at which the blade connects (the ring converges here)
const CLASH_WIPE_SLAM_T = 0.5;      // fail: seconds of sword-hoist before the slam

// Deterministic 0..1 hash of (string id, integer salt). Used instead of Math.random() for gameplay-relevant
// randomness that every co-op client must compute identically without a network packet.
function netHash01(id, salt) {
  let h = 2166136261 ^ (salt | 0);
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
window.netHash01 = netHash01;

// Cheap "glow" for the current path: a wide translucent stroke under the real stroke.
// Replaces ctx.shadowBlur, which re-blurs the shape's whole bounding box every frame and is one of the
// slowest Canvas2D operations (it was used on every player's sword, gem and visor each frame).
function fakeGlow(ctx, color, width, alpha = 0.35) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

// Bound an effect array by dropping its oldest entries (prevents unbounded growth during VFX-heavy phases).
function capOldest(arr, max) {
  if (arr.length > max) arr.splice(0, arr.length - max);
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.masterGain = null;
    this.sfxBus = null;
    this.reverbBus = null;
    this.musicBus = null;
    this.musicFilter = null;

    // Procedural Multi-Phase Soundtrack State ('none', 'hub', 'phase1', 'cutscene', 'phase2', 'mechanic')
    this.musicMode = 'none';
    this.musicStep = 0;
    this.musicTimer = null;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneGain = null;
    this.lastVoiceTime = 0;

    // Custom MP3 Soundtrack & Voice Line Banks (sounds/Vaelgor/*.mp3)
    this.musicTracks = {};
    this.activeMusicKey = null;
    this.voiceClips = {};
    this.currentVoiceAudio = null;
    this.currentVoiceKey = null;
    this.currentVoicePriority = 0;
    this.voiceSubtitleText = '';
    this.voiceSubtitleTimer = 0;
    this.voiceSubtitleMaxTimer = 0;
    this.assetsLoaded = false;

    // Exact Voice Line Metadata (MP3 File, Spoken Transcript, Exact Duration & Interruption Priority)
    this.voiceMetadata = {
      intro_01: {
        src: 'game/sounds/Vaelgor/vaelgor_intro_01.mp3',
        text: '"Step forth into the darkness... and be judged."',
        duration: 4.94,
        priority: 3,
        volume: 0.96
      },
      p2_cutscene: {
        src: 'game/sounds/Vaelgor/vaelgor_p2_cutscene.mp3',
        text: '"Kneel before the Black Sun... and despair!"',
        duration: 4.39,
        priority: 3,
        volume: 0.96
      },
      mech_iaido: {
        src: 'game/sounds/Vaelgor/vaelgor_mech_iaido.mp3',
        text: '"Your shadow belongs to the abyss."',
        duration: 4.08,
        priority: 2,
        volume: 0.95
      },
      mech_ambush: {
        src: 'game/sounds/Vaelgor/vaelgor_mech_ambush.mp3',
        text: '"Perish!"',
        duration: 1.26,
        priority: 2,
        volume: 0.95
      },
      mech_clock: {
        src: 'game/sounds/Vaelgor/vaelgor_mech_clock.mp3',
        text: '"The constellation turns... Stand and face oblivion!"',
        duration: 4.78,
        priority: 2,
        volume: 0.96
      },
      wipe_cast: {
        src: 'game/sounds/Vaelgor/vaelgor_wipe_cast.mp3',
        text: '"Extinction comes!"',
        duration: 2.22,
        priority: 3,
        volume: 0.98
      },
      pauldron_crack: {
        src: 'game/sounds/Vaelgor/vaelgor_pauldron_crack.mp3',
        text: '"Impudent insect!"',
        duration: 2.15,
        priority: 2,
        volume: 0.95
      },
      stagger_01: {
        src: 'game/sounds/Vaelgor/vaelgor_stagger_01.mp3',
        text: '"Ghh... Rrrgh!"',
        duration: 3.19,
        priority: 1,
        volume: 0.92
      },
      countered_01: {
        src: 'game/sounds/Vaelgor/vaelgor_countered_01.mp3',
        text: '"Ugh!"',
        duration: 1.68,
        priority: 1,
        volume: 0.92
      },
      pale_eclipse: {
        src: 'game/sounds/Vaelgor/vaelgor_light_of_pale.mp3',
        text: '"The light of the Pale Eclipse strips away all sanctuary... Face your judgment!"',
        duration: 5.84,
        priority: 3,
        volume: 0.97
      },
      ascension: {
        src: 'game/sounds/Vaelgor/vaelgor_back_insects.mp3',
        text: '"Back, insects! My blade devours the Eclipse — and my flesh ascends beyond mortality!"',
        duration: 7.28,
        priority: 3,
        volume: 0.97
      },
      spirit_bomb: {
        src: 'game/sounds/Vaelgor/vaelgor_spirit_bomb.mp3',
        text: '"Eclipse, share your energy with me!"',
        duration: 3.12,
        priority: 3,
        volume: 0.97
      },
      phase_break: { src: 'game/sounds/Vaelgor/vaelgor_phase_break.mp3', text: '', duration: 1.12, priority: 2, volume: 0.95 },
      counter_break: { src: 'game/sounds/Vaelgor/vaelgor_counter_break.mp3', text: '', duration: 1.28, priority: 2, volume: 0.95 },
      counter_break_2: { src: 'game/sounds/Vaelgor/vaelgor_counter_break_2.mp3', text: '', duration: 1.52, priority: 2, volume: 0.95 },
      hrah_1: { src: 'game/sounds/Vaelgor/vaelgor_hrah_1.mp3', text: '', duration: 1.04, priority: 1, volume: 0.9 },
      hrah_2: { src: 'game/sounds/Vaelgor/vaelgor_hrah_2.mp3', text: '', duration: 1.28, priority: 1, volume: 0.9 },
      hrah_3: { src: 'game/sounds/Vaelgor/vaelgor_hrah_3.mp3', text: '', duration: 1.28, priority: 1, volume: 0.9 },
      death: {
        src: 'game/sounds/Vaelgor/vaelgor_death.mp3',
        text: '"Ugh... The eclipse... is eternal..."',
        duration: 4.24,
        priority: 4,
        volume: 0.98
      }
    };
  }

  preloadVaelgorAudio() {
    if (this.assetsLoaded) return;
    this.assetsLoaded = true;

    const musicFiles = {
      phase1: 'game/sounds/Vaelgor/vaelgor_music_1.mp3',
      phase2: 'game/sounds/Vaelgor/vaelgor_blood_moon_music.mp3',
      mechanic: 'game/sounds/Vaelgor/vaelgor_puzzle_tension_music.mp3'
    };
    for (const [key, src] of Object.entries(musicFiles)) {
      const a = new Audio(src);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0.42;
      this.musicTracks[key] = a;
    }

    for (const [key, meta] of Object.entries(this.voiceMetadata)) {
      if (!meta.lazy) this.makeVoiceClip(key, meta);
    }
  }

  // Other bosses register their clips in voiceMetadata with `lazy: true`; they load when that boss's raid starts
  // (preloadVoiceGroup) or on first play, so a Vaelgor run never downloads them.
  makeVoiceClip(key, meta) {
    if (this.voiceClips[key]) return this.voiceClips[key];
    const a = new Audio(meta.src);
    a.preload = 'auto';
    a.volume = meta.volume || 0.94;
    a.addEventListener('ended', () => {
      if (this.currentVoiceAudio === a) {
        this.currentVoiceAudio = null;
        this.currentVoiceKey = null;
        this.currentVoicePriority = 0;
      }
      this.syncMp3MusicPlayback();
    });
    this.voiceClips[key] = a;
    return a;
  }

  preloadVoiceGroup(prefix) {
    for (const [key, meta] of Object.entries(this.voiceMetadata)) {
      if (key.startsWith(prefix)) this.makeVoiceClip(key, meta);
    }
  }

  // A boss can bring its own soundtrack: boss.musicFiles = { key: src } and boss.musicKeyFor(baseKey) -> key ('phase1' | 'phase2' | 'mechanic' in)
  bossMusicKey(baseKey) {
    const g = window.game, b = g && g.mode === 'raid' && g.boss;
    if (!baseKey || !b || typeof b.musicKeyFor !== 'function' || !b.musicFiles) return baseKey;
    const key = b.musicKeyFor(baseKey);
    const src = key && b.musicFiles[key];
    if (!src) return baseKey;
    if (!this.musicTracks[key]) {
      const a = new Audio(src);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0.42;
      this.musicTracks[key] = a;
    }
    return key;
  }

  init() {
    // Called by every SFX method (many times per frame in combat), so only do real work when something changes.
    let changed = !this._initDone;
    this.preloadVaelgorAudio();
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.setupAudioGraph();
        changed = true;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
      changed = true;
    }
    // Music state changes and voice-clip end events call syncMp3MusicPlayback() themselves.
    if (changed) this.syncMp3MusicPlayback();
    this._initDone = true;
  }

  setupAudioGraph() {
    if (!this.ctx) return;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.90;
    this.masterGain.connect(this.ctx.destination);

    // Direct Dry SFX Bus
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.92;
    this.sfxBus.connect(this.masterGain);

    // Abyssal Cathedral Convolution Reverb Bus (1.85s rich dark stone hall decay)
    this.reverbBus = this.ctx.createGain();
    this.reverbBus.gain.value = 0.34;
    try {
      const conv = this.ctx.createConvolver();
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * 1.85);
      const imp = this.ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = imp.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          // Early cathedral stone reflections + smooth dark tail
          const early = (i < rate * 0.08 && i % 420 < 12) ? 0.55 : 0;
          d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) + early) * 0.5;
        }
      }
      conv.buffer = imp;
      const revFilter = this.ctx.createBiquadFilter();
      revFilter.type = 'lowpass';
      revFilter.frequency.value = 2200;
      this.reverbBus.connect(conv);
      conv.connect(revFilter);
      revFilter.connect(this.masterGain);
    } catch (e) {
      this.reverbBus.connect(this.masterGain);
    }

    // Dynamic Music Bus with Lowpass Ducking Filter (used for Hub atmospheric drone)
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 3400;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.36;
    this.musicFilter.connect(this.musicBus);
    this.musicBus.connect(this.masterGain);

    this.startMusicScheduler();
  }

  getOut() {
    return this.sfxBus || (this.ctx ? this.ctx.destination : null);
  }

  connectWithReverb(node, reverbSend = 0.35) {
    const out = this.getOut();
    if (!out) return;
    node.connect(out);
    if (this.reverbBus && reverbSend > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverbSend;
      node.connect(send);
      send.connect(this.reverbBus);
    }
  }

  // =========================================================================
  // DYNAMIC MP3 + PROCEDURAL SOUNDTRACK CONTROLLER
  // =========================================================================
  isVoicePlaying() {
    return !!(this.currentVoiceAudio && !this.currentVoiceAudio.paused && !this.currentVoiceAudio.ended);
  }

  syncMp3MusicPlayback() {
    this.preloadVaelgorAudio();
    const mode = this.musicMode;

    // Map game music state to MP3 track key & target volume (ducks during cutscenes or active boss voice lines so voice lines shine!)
    let targetKey = null;
    let targetVol = 0.42;
    if (mode === 'phase1') {
      targetKey = 'phase1';
      targetVol = 0.42;
    } else if (mode === 'phase2') {
      targetKey = 'phase2';
      targetVol = 0.44;
    } else if (mode === 'mechanic') {
      targetKey = 'mechanic';
      targetVol = 0.46;
    } else if (mode === 'cutscene') {
      const isAwakened = window.game && window.game.boss && window.game.boss.awakened;
      targetKey = isAwakened ? 'phase2' : 'phase1';
      targetVol = 0.20; // Duck music during opening/awakening cutscenes so Vaelgor's voice cuts through!
    }
    this.activeMusicBase = targetKey;
    const bossKey = this.bossMusicKey(targetKey);
    this._bossMusicKey = bossKey !== targetKey ? bossKey : null;
    targetKey = bossKey;

    if (targetKey && this.isVoicePlaying()) {
      targetVol = Math.min(targetVol, 0.22);
    }

    for (const [key, track] of Object.entries(this.musicTracks)) {
      if (!track) continue;
      if (this.muted || key !== targetKey) {
        if (!track.paused) {
          track.pause();
          if (mode === 'hub' || mode === 'none') {
            track.currentTime = 0;
          }
        }
      } else {
        track.volume = targetVol;
        if (track.paused) {
          track.play().catch(() => {});
        }
      }
    }
    this.activeMusicKey = targetKey;
  }

  setMusicState(mode) {
    if (this.musicMode === mode) {
      // same mode, but a boss's own track choice can move on inside it (e.g. a later phase)
      const g = window.game, b = g && g.mode === 'raid' && g.boss;
      if (this._bossMusicKey && b && typeof b.musicKeyFor === 'function') {
        const base = this.activeMusicBase;
        if (base && b.musicKeyFor(base) !== this._bossMusicKey) this.syncMp3MusicPlayback();
      }
      return;
    }
    this.musicMode = mode;
    this.syncMp3MusicPlayback();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.musicFilter) {
      const targetFreq = (mode === 'hub') ? 1400 : 1200;
      this.musicFilter.frequency.setTargetAtTime(targetFreq, now, 0.25);
    }
    if (this.musicBus) {
      const targetGain = (mode === 'hub') ? 0.18 : 0.001;
      this.musicBus.gain.setTargetAtTime(targetGain, now, 0.25);
    }
  }

  startMusicScheduler() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    // 16th-note pulse at ~136 BPM (110ms per step) — drives Hub atmospheric pad when not in raid
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      this.tickMusicStep();
    }, 110);
  }

  tickMusicStep() {
    const step = this.musicStep % 32;
    this.musicStep++;

    if (this.musicMode === 'hub') {
      // Atmospheric Sanctum of Rocheste Cathedral Drone + Distant Forge Chime
      if (step === 0 || step === 16) {
        const root = step === 0 ? 73.42 : 65.41; // D2 -> C2
        this.playOrchestralPad(root, 1.7, 0.10, 'sine');
        this.playOrchestralPad(root * 1.5, 1.6, 0.06, 'triangle');
      }
      if (step === 12 && Math.random() < 0.45) {
        this.playBellTone(587.33, 0.85, 0.035);
      }
      return;
    }

    // When in raid ('phase1', 'phase2', 'mechanic', 'cutscene'), custom MP3 tracks handle the music!
    if (this.activeMusicKey && this.musicTracks[this.activeMusicKey]) {
      return;
    }

    if (this.musicMode === 'mechanic') {
      // High-Tension Mechanic Heartbeat + Abyssal Ticking Clock
      if (step % 8 === 0) {
        this.playWarDrum(46, 0.28, 0.38);
      } else if (step % 8 === 2) {
        this.playWarDrum(38, 0.22, 0.24);
      }
      if (step % 4 === 0) {
        this.playBellTone(step % 8 === 0 ? 880 : 659.25, 0.14, 0.05);
      }
      if (step === 0) {
        this.playOrchestralPad(36.71, 1.8, 0.18, 'sawtooth');
      }
      return;
    }

    if (this.musicMode === 'phase1' || this.musicMode === 'phase2') {
      const isP2 = (this.musicMode === 'phase2');
      // D Minor / Phrygian Dark Raid Ostinato (D2, D2, F2, E2, Bb1, A1, C#2, D2)
      const bassScale = [73.42, 73.42, 87.31, 82.41, 58.27, 55.00, 69.30, 73.42];
      const barIdx = Math.floor(this.musicStep / 32) % 4;

      // Driving Cello / Low Brass Staccato Ostinato
      if (step % 2 === 0 || (isP2 && step % 4 === 3)) {
        const noteIdx = Math.floor(step / 4) % bassScale.length;
        const freq = bassScale[noteIdx] * (barIdx === 3 && step >= 24 ? 1.122 : 1.0);
        this.playCelloOstinato(freq, isP2 ? 0.19 : 0.16, isP2 ? 0.20 : 0.15);
      }

      // War Drums & Metallic Anvil Beats
      if (step % 8 === 0 || (isP2 && step % 8 === 6)) {
        this.playWarDrum(48, 0.26, isP2 ? 0.34 : 0.25);
      }
      if (step % 8 === 4) {
        this.playMetallicPerc(isP2 ? 0.14 : 0.09);
      }

      // Phase 2 Awakened: Gothic Choir Chords & Crimson Brass Lead Melody!
      if (isP2) {
        if (step === 0) {
          const chords = [
            [146.83, 174.61, 220.0],  // Dm
            [155.56, 196.00, 233.08], // EbMaj
            [116.54, 146.83, 174.61], // Bb
            [138.59, 164.81, 220.0]   // A7
          ];
          this.playGothicChoirChord(chords[barIdx], 3.2, 0.14);
        }
        if (step % 4 === 0) {
          const leadNotes = [293.66, 349.23, 329.63, 311.13, 293.66, 440.0, 392.0, 349.23];
          const lFreq = leadNotes[(Math.floor(step / 4) + barIdx * 2) % leadNotes.length];
          this.playOrchestralPad(lFreq, 0.38, 0.09, 'sawtooth');
        }
      } else if (step === 0 && barIdx % 2 === 0) {
        this.playOrchestralPad(146.83, 2.8, 0.08, 'triangle');
      }
    }
  }

  playCelloOstinato(freq, dur, vol) {
    if (!this.ctx || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.5, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.8, now + dur);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicFilter);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  playWarDrum(freq, dur, vol) {
    if (!this.ctx || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 2.1, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.musicFilter);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  playMetallicPerc(vol) {
    if (!this.ctx || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    [520, 780, 1190].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, now);
      g.gain.setValueAtTime(vol / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(g);
      g.connect(this.musicFilter);
      osc.start(now);
      osc.stop(now + 0.095);
    });
  }

  playOrchestralPad(freq, dur, vol, type = 'sawtooth') {
    if (!this.ctx || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    filter.type = 'lowpass';
    filter.frequency.value = 950;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + Math.min(0.25, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicFilter);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playGothicChoirChord(freqs, dur, vol) {
    if (!this.ctx || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    freqs.forEach((f) => {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const formant1 = this.ctx.createBiquadFilter();
      const formant2 = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(f * 0.996, now);
      osc2.frequency.setValueAtTime(f * 1.004, now);

      // 'Ah' / 'Oh' Choir Vowel Formants
      formant1.type = 'bandpass';
      formant1.frequency.value = 680;
      formant1.Q.value = 4.5;
      formant2.type = 'bandpass';
      formant2.frequency.value = 1150;
      formant2.Q.value = 5.0;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + Math.min(0.45, dur * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc1.connect(formant1);
      osc2.connect(formant1);
      osc1.connect(formant2);
      osc2.connect(formant2);
      formant1.connect(gain);
      formant2.connect(gain);
      gain.connect(this.musicFilter);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + dur + 0.02);
      osc2.stop(now + dur + 0.02);
    });
  }

  playBellTone(freq, dur, vol) {
    if (!this.ctx || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.musicFilter);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  // =========================================================================
  // VAELGOR CUSTOM MP3 VOICE LINES (sounds/Vaelgor/*.mp3)
  // =========================================================================
  playBossVoiceClip(clipKey, volume = null, forceInterrupt = false) {
    if (this.muted || !clipKey) return;
    this.preloadVaelgorAudio();
    const meta = this.voiceMetadata[clipKey] || null;
    const clip = this.voiceClips[clipKey] || (meta ? this.makeVoiceClip(clipKey, meta) : null);
    if (!clip) return;

    const newPriority = meta ? (meta.priority || 1) : 1;
    // Prevent lower-priority grunts (e.g. stagger_01 / countered_01) from cutting off higher-priority spoken lines (e.g. pauldron_crack, wipe_cast, or mechanic invocations) while still playing!
    if (
      !forceInterrupt &&
      this.currentVoiceAudio &&
      !this.currentVoiceAudio.paused &&
      !this.currentVoiceAudio.ended &&
      this.currentVoiceKey !== clipKey &&
      newPriority < this.currentVoicePriority
    ) {
      return;
    }

    try {
      // Stop any currently playing boss voice line so lines never talk over each other
      if (this.currentVoiceAudio && this.currentVoiceAudio !== clip && !this.currentVoiceAudio.paused) {
        this.currentVoiceAudio.pause();
        this.currentVoiceAudio.currentTime = 0;
      }
      clip.volume = volume !== null ? volume : (meta && meta.volume ? meta.volume : 0.95);
      clip.currentTime = 0;
      this.currentVoiceAudio = clip;
      this.currentVoiceKey = clipKey;
      this.currentVoicePriority = newPriority;

      if (meta && meta.text) {
        const known = Number.isFinite(clip.duration) && clip.duration > 0.3;
        const dur = known ? clip.duration : (meta.duration || 2.5);
        this.voiceSubtitleText = meta.text;
        this.voiceSubtitleMaxTimer = dur + 0.35;
        this.voiceSubtitleTimer = dur + 0.35;
        // first play of a clip that hasn't loaded yet: stretch the subtitle to the real length once it is known
        if (!known) {
          clip.addEventListener('loadedmetadata', () => {
            if (this.currentVoiceAudio !== clip || this.voiceSubtitleText !== meta.text || !(clip.duration > 0.3)) return;
            this.voiceSubtitleMaxTimer = clip.duration + 0.35;
            this.voiceSubtitleTimer = Math.max(0, clip.duration + 0.35 - (clip.currentTime || 0));
          }, { once: true });
        }
      }

      this.syncMp3MusicPlayback();
      clip.play().catch(() => {});
    } catch (e) {}
  }

  updateVoiceSubtitle(dt) {
    if (this.voiceSubtitleTimer > 0) {
      this.voiceSubtitleTimer = Math.max(0, this.voiceSubtitleTimer - dt);
      if (this.voiceSubtitleTimer <= 0) {
        this.voiceSubtitleText = '';
      }
    }
    if (this.currentVoiceAudio && (this.currentVoiceAudio.paused || this.currentVoiceAudio.ended)) {
      this.currentVoiceAudio = null;
      this.currentVoiceKey = null;
      this.currentVoicePriority = 0;
      this.syncMp3MusicPlayback();
    }
  }

  playBossVoice(lineText, mood = 'roar') {
    if (this.muted) return;
    if (lineText && this.voiceClips && this.voiceClips[lineText]) {
      this.playBossVoiceClip(lineText);
      return;
    }
    if (mood === 'attack') {
      // three grunt takes, never the same one twice in a row
      let k;
      do { k = 'hrah_' + (1 + Math.floor(Math.random() * 3)); } while (k === this._lastHrah);
      this._lastHrah = k;
      this.playBossVoiceClip(k);
    } else if (mood === 'stagger') {
      this.playBossVoiceClip('stagger_01');
    } else if (mood === 'cutscene') {
      this.playBossVoiceClip('p2_cutscene');
    }
  }

  playBreakerGrunt(heavy = false) {
    // Player grunts remain disabled
  }

  // =========================================================================
  // LAYERED MEATY COMBAT & TELEGRAPH SFX
  // =========================================================================
  playHitConfirm(opts = {}) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const isCrit = !!opts.isCrit;
    const isHeavy = !!opts.isHeavy;
    const posType = opts.posType || 'normal';

    // Layer 1: Meaty Sub-Bass Flesh/Armor Punch
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(isHeavy ? 155 : 125, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + (isHeavy ? 0.22 : 0.14));
    subGain.gain.setValueAtTime(isHeavy ? 0.52 : 0.34, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.23 : 0.15));
    sub.connect(subGain);
    this.connectWithReverb(subGain, 0.25);
    sub.start(now);
    sub.stop(now + 0.24);

    // Layer 2: Metallic Armor Crunch Burst
    const crunchDur = isHeavy ? 0.14 : 0.09;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.getDecayNoiseBuffer(crunchDur, 1.8);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(posType === 'head' ? 980 : (posType === 'back' ? 1450 : 1150), now);
    bp.Q.value = 1.8;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(isCrit ? 0.38 : 0.24, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + crunchDur);
    noise.connect(bp);
    bp.connect(nGain);
    this.connectWithReverb(nGain, 0.20);
    noise.start(now);

    // Layer 3: Crit / Positional Harmonic Bite
    if (isCrit || posType === 'back' || posType === 'head') {
      const ring = this.ctx.createOscillator();
      const rGain = this.ctx.createGain();
      ring.type = 'triangle';
      const baseF = posType === 'head' ? 740 : (isCrit ? 1320 : 1040);
      ring.frequency.setValueAtTime(baseF, now);
      ring.frequency.exponentialRampToValueAtTime(baseF * 1.45, now + 0.09);
      rGain.gain.setValueAtTime(isCrit ? 0.18 : 0.11, now);
      rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      ring.connect(rGain);
      this.connectWithReverb(rGain, 0.35);
      ring.start(now);
      ring.stop(now + 0.13);
    }
  }

  // Iconic Lost Ark-style Blue Counter-Flash Warning Sting!
  playCounterFlashCue() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [1174.66, 1760.0, 2349.32].forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.028);
      osc.frequency.exponentialRampToValueAtTime(f * 1.06, now + idx * 0.028 + 0.28);
      gain.gain.setValueAtTime(0.16 / (idx + 1), now + idx * 0.028);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.028 + 0.30);
      osc.connect(gain);
      this.connectWithReverb(gain, 0.55);
      osc.start(now + idx * 0.028);
      osc.stop(now + idx * 0.028 + 0.32);
    });
  }

  // Time-Dilated Bass Drop + Crystalline Shatter when [D] Counter or Stagger Break succeeds!
  playCounterSuccessBoom() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Seismic Sub-Drop
    const sub = this.ctx.createOscillator();
    const sGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(210, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.65);
    sGain.gain.setValueAtTime(0.68, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
    sub.connect(sGain);
    this.connectWithReverb(sGain, 0.60);
    sub.start(now);
    sub.stop(now + 0.70);

    // Resonant Crystalline Bell Chord
    [587.33, 880.0, 1174.66, 1760.0, 2637.02].forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.98, now + 0.75);
      g.gain.setValueAtTime(0.18 / (idx + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
      osc.connect(g);
      this.connectWithReverb(g, 0.75);
      osc.start(now);
      osc.stop(now + 0.80);
    });
  }

  playArmoredStep(intensity = 0.7) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(88 * intensity + 24, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 0.11);
    gain.gain.setValueAtTime(0.16 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    this.connectWithReverb(gain, 0.15);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playScrapeSpark() {
    if (this.muted || Math.random() > 0.35) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2100 + Math.random() * 1400, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.035);
    gain.gain.setValueAtTime(0.018, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    this.connectWithReverb(gain, 0.12);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playSwordSlash(heavy = false, pitchMult = 1.0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = heavy ? 0.36 : 0.22;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.getDecayNoiseBuffer(dur, 1.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((heavy ? 280 : 480) * pitchMult, now);
    filter.frequency.exponentialRampToValueAtTime((heavy ? 1150 : 1650) * pitchMult, now + dur * 0.45);
    filter.frequency.exponentialRampToValueAtTime(140, now + dur);
    filter.Q.value = 2.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.42 : 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    this.connectWithReverb(gain, heavy ? 0.35 : 0.18);
    noise.start(now);
  }

  playImpactBoom(scale = 1.0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145 * scale, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.48 * scale);
    gain.gain.setValueAtTime(Math.min(0.75, 0.48 * scale), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.50 * scale);
    osc.connect(gain);
    this.connectWithReverb(gain, 0.48);
    osc.start(now);
    osc.stop(now + 0.52 * scale);
  }

  playSwordPlant() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Heavy metallic thud + bedrock crunch
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    osc.connect(gain);
    this.connectWithReverb(gain, 0.40);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  playParryClang(highPitch = false) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = highPitch ? [820, 1480, 2240, 3120] : [540, 890, 1340, 2120];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.88, now + 0.45);
      gain.gain.setValueAtTime(0.12 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      this.connectWithReverb(gain, 0.45);
      osc.start(now);
      osc.stop(now + 0.46);
    });
  }

  playDimensionalSlash(step = 1) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const baseFreq = 420 + step * 95;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq * 2.2, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.35, now + 0.16);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    this.connectWithReverb(gain, 0.38);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playForgeAnvil(success = true) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const base = success ? [660, 990, 1320, 1980] : [240, 190, 140];
    base.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = success ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(f, now + idx * 0.06);
      osc.frequency.exponentialRampToValueAtTime(f * (success ? 1.05 : 0.65), now + idx * 0.06 + 0.35);
      gain.gain.setValueAtTime(0.15, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.36);
      osc.connect(gain);
      this.connectWithReverb(gain, 0.40);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.38);
    });
  }

  playQteKeySound(success = true, stepIdx = 0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (success) {
      const notes = [523.25, 659.25, 783.99, 987.77, 1318.51];
      const freq = notes[Math.min(notes.length - 1, Math.max(0, stepIdx))];
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + 0.14);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      this.connectWithReverb(gain, 0.35);
      osc.start(now);
      osc.stop(now + 0.17);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(195, now);
      osc.frequency.exponentialRampToValueAtTime(82, now + 0.28);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
      osc.connect(gain);
      this.connectWithReverb(gain, 0.35);
      osc.start(now);
      osc.stop(now + 0.31);
    }
  }

  playEclipseBell() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Deep, haunting cathedral eclipse bell (layered inharmonic partials + sub-drop)
    const freqs = [110, 220, 329.63, 466.16, 659.25];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.985, now + 1.8);
      const amp = 0.24 / (1 + idx * 0.55);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.85);
      osc.connect(gain);
      this.connectWithReverb(gain, 0.55);
      osc.start(now);
      osc.stop(now + 1.9);
    });
  }

  // Decaying white-noise buffers are immutable once filled, so cache them by (duration, curve) instead of
  // allocating + filling thousands of random samples on every swing/hit sound.
  getDecayNoiseBuffer(dur, curve) {
    if (!this._noiseCache) this._noiseCache = new Map();
    const key = `${Math.round(dur * 1000)}:${curve}`;
    let buf = this._noiseCache.get(key);
    if (!buf) {
      const sampleRate = this.ctx.sampleRate || 44100;
      const len = Math.max(1, Math.floor(sampleRate * dur));
      buf = this.ctx.createBuffer(1, len, sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, curve);
      }
      this._noiseCache.set(key, buf);
    }
    return buf;
  }

  playNoise(dur = 0.22, filterFreq = 1000, filterType = 'bandpass', vol = 0.25, reverbSend = 0.25) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.getDecayNoiseBuffer(dur, 1.45);

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType || 'bandpass';
    filter.frequency.setValueAtTime(filterFreq || 1000, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(140, (filterFreq || 1000) * 0.35), now + dur);
    filter.Q.value = 1.1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, vol), now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    src.connect(filter);
    filter.connect(gain);
    this.connectWithReverb(gain, reverbSend);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  playDashWhoosh() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // High-velocity abyssal wind/dash whoosh + low transient thump
    this.playNoise(0.26, 1100, 'bandpass', 0.30, 0.25);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.22);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    this.connectWithReverb(gain, 0.28);
    osc.start(now);
    osc.stop(now + 0.25);
  }
}

const audio = new SoundEngine();

// =========================================================================
// CAMERA 2.5D — Smooth Tracking, Zoom-Punch, Cutscene Focus & Projection
// =========================================================================
class Camera25D {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.zoom = 1.05;
    this.targetZoom = 1.05;
    this.minZoom = 0.72;
    this.maxZoom = 1.75;
    this.angle = 0;
    this.targetAngle = 0;

    // Dynamic Zoom-Punch spring for visceral heavy impacts & counters!
    this.zoomPunch = 0;
    this.zoomPunchVel = 0;

    // Cinematic Cutscene Camera Override (Pans & zooms onto Boss during Phase 2 Awakening!)
    this.cinematicTimer = 0;
    this.cinematicMaxTimer = 0;
    this.cinematicTargetX = 0;
    this.cinematicTargetY = 0;
    this.cinematicZoom = 1.34;
    this.cinematicTitle = '';
    this.cinematicSubtitle = '';
    this.cinematicQuote = '';

    this.shakeTime = 0;
    this.shakeDur = 0.25;
    this.shakeMag = 0;
    this.shakeOffX = 0;
    this.shakeOffY = 0;

    // Weighty Hitstop freeze timer (in seconds)
    this.hitstopTimer = 0;

    // Screen-Edge Anime Impact Frame (Speed-Lines & Chromatic Rim Pulse — Zero center-screen glare!)
    this.impactFrameTimer = 0;
    this.impactFrameMax = 0.09;
    this.impactFrameColor = '#f43f5e';

    // Fixed-pool zero-lag atmospheric raid embers (28 motes, no shadowBlur)
    this.ambientEmbers = [];
    for (let i = 0; i < 28; i++) {
      this.ambientEmbers.push({
        nx: Math.random(),
        ny: Math.random(),
        spdY: 0.04 + Math.random() * 0.09,
        driftX: (Math.random() - 0.5) * 0.04,
        size: 1.4 + Math.random() * 2.2,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  triggerImpactFrame(color = '#f43f5e', dur = 0.09) {
    this.impactFrameColor = color;
    this.impactFrameMax = Math.max(0.04, dur);
    this.impactFrameTimer = Math.max(this.impactFrameTimer, dur);
  }

  triggerShake(mag = 12, dur = 0.3) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeDur = Math.max(0.05, dur);
    this.shakeTime = Math.max(this.shakeTime, dur);
  }

  triggerHitstop(ms = 65) {
    this.hitstopTimer = Math.max(this.hitstopTimer, ms * 0.001);
  }

  triggerZoomPunch(amount = 0.075) {
    this.zoomPunch = Math.max(this.zoomPunch, amount);
  }

  startCinematicCutscene(targetX, targetY, duration = 4.45, zoom = 1.34, title = '', subtitle = '', quote = '') {
    this.cinematicTargetX = targetX;
    this.cinematicTargetY = targetY;
    this.cinematicMaxTimer = duration;
    this.cinematicTimer = duration;
    this.cinematicZoom = zoom;
    this.cinematicTitle = title;
    this.cinematicSubtitle = subtitle;
    this.cinematicQuote = quote;
  }

  update(dt, focusX, focusY, mouseScreenX, mouseScreenY, viewW, viewH, disableMouseLead = false) {
    if (typeof audio !== 'undefined' && audio && typeof audio.updateVoiceSubtitle === 'function') {
      audio.updateVoiceSubtitle(dt);
    }

    if (this.impactFrameTimer > 0) {
      this.impactFrameTimer = Math.max(0, this.impactFrameTimer - dt);
    }

    for (let i = 0; i < this.ambientEmbers.length; i++) {
      const em = this.ambientEmbers[i];
      em.ny -= em.spdY * dt;
      em.nx += em.driftX * dt;
      em.phase += dt * 3.2;
      if (em.ny < -0.04) {
        em.ny = 1.04;
        em.nx = Math.random();
      }
      if (em.nx < -0.04) em.nx = 1.04;
      if (em.nx > 1.04) em.nx = -0.04;
    }

    // Decay Zoom-Punch smoothly
    if (this.zoomPunch > 0.0005 || Math.abs(this.zoomPunchVel) > 0.0005) {
      this.zoomPunchVel += (-this.zoomPunch * 110 - this.zoomPunchVel * 14) * dt;
      this.zoomPunch += this.zoomPunchVel * dt;
      if (this.zoomPunch < 0) this.zoomPunch = 0;
    } else {
      this.zoomPunch = 0;
      this.zoomPunchVel = 0;
    }

    // A single NaN (mouse not seen yet, a bad focus point, a zero-size view) would stick in x / y / zoom forever and
    // leave the screen black, so bad inputs are replaced and a poisoned camera is snapped back.
    viewW = Math.max(1, viewW || 0); viewH = Math.max(1, viewH || 0);     // minimised / zero-size window: 0 / 0 made the lead NaN
    if (!Number.isFinite(mouseScreenX)) mouseScreenX = viewW * 0.5;
    if (!Number.isFinite(mouseScreenY)) mouseScreenY = viewH * 0.5;
    if (Number.isFinite(focusX) && Number.isFinite(focusY)) {
      if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) { this.x = focusX; this.y = focusY; }
    } else {
      focusX = Number.isFinite(this.x) ? this.x : 0;
      focusY = Number.isFinite(this.y) ? this.y : 0;
    }
    if (!Number.isFinite(this.zoom) || this.zoom <= 0.05) this.zoom = 1.05;
    if (!Number.isFinite(this.targetZoom) || this.targetZoom <= 0.05) this.targetZoom = 1.05;
    if (!Number.isFinite(this.zoomPunch)) { this.zoomPunch = 0; this.zoomPunchVel = 0; }
    if (!Number.isFinite(this.angle)) this.angle = 0;

    if (this.cinematicTimer > 0) {
      this.cinematicTimer = Math.max(0, this.cinematicTimer - dt);
      this.targetX = this.cinematicTargetX;
      this.targetY = this.cinematicTargetY;
      const followSpeed = Math.min(1, dt * 6.5);
      this.x += (this.targetX - this.x) * followSpeed;
      this.y += (this.targetY - this.y) * followSpeed;
      const desiredZoom = this.cinematicZoom + this.zoomPunch;
      this.zoom += (desiredZoom - this.zoom) * Math.min(1, dt * 5.5);
      this.angle += (0 - this.angle) * Math.min(1, dt * 8.0);
    } else {
      const leadX = disableMouseLead ? 0 : (((mouseScreenX - viewW * 0.5) / (viewW * 0.5)) * 42);
      const leadY = disableMouseLead ? 0 : (((mouseScreenY - viewH * 0.5) / (viewH * 0.5)) * 28);

      this.targetX = focusX + leadX;
      this.targetY = focusY + leadY;

      const followSpeed = Math.min(1, dt * (disableMouseLead ? 9.5 : 7.5));
      this.x += (this.targetX - this.x) * followSpeed;
      this.y += (this.targetY - this.y) * followSpeed;
      const desiredZoom = this.targetZoom + this.zoomPunch;
      this.zoom += (desiredZoom - this.zoom) * Math.min(1, dt * 8.5);
      const desiredAngle = this.targetAngle || 0;
      this.angle += (desiredAngle - this.angle) * Math.min(1, dt * 8.5);
      if (Math.abs(this.angle) < 0.0004 && Math.abs(desiredAngle) < 0.0004) {
        this.angle = 0;
      }
    }

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const decay = this.shakeTime / this.shakeDur;
      this.shakeOffX = (Math.random() * 2 - 1) * this.shakeMag * decay;
      this.shakeOffY = (Math.random() * 2 - 1) * this.shakeMag * decay;
    } else {
      this.shakeOffX = 0;
      this.shakeOffY = 0;
      this.shakeMag = 0;
    }
  }

  applyTransform(ctx, viewW, viewH) {
    ctx.translate(viewW * 0.5 + this.shakeOffX, viewH * 0.5 + this.shakeOffY);
    if (Math.abs(this.angle) > 0.0005) {
      ctx.rotate(this.angle);
    }
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  screenToWorld(sx, sy, viewW, viewH) {
    let dx = (sx - viewW * 0.5 - this.shakeOffX);
    let dy = (sy - viewH * 0.5 - this.shakeOffY);
    if (Math.abs(this.angle) > 0.0005) {
      const cosA = Math.cos(-this.angle);
      const sinA = Math.sin(-this.angle);
      const rx = dx * cosA - dy * sinA;
      const ry = dx * sinA + dy * cosA;
      dx = rx;
      dy = ry;
    }
    const wx = dx / this.zoom + this.x;
    const wy = dy / this.zoom + this.y;
    return { x: wx, y: wy };
  }

  drawCinematicOverlay(ctx, viewW, viewH) {
    // 0. Zero-Lag Atmospheric Raid Embers & Screen-Edge Impact Speed-Lines
    const g = window.game;
    if (g && g.mode === 'raid' && g.boss) {
      const b = g.boss;
      const isClock = (b.state === 'horizon_mechanic');
      const isPaleArena = !!b.finalPhaseArena;
      const isAwakened = !!b.awakened;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Batched rising embers (1 fill call per color group, 0 shadowBlur!)
      const primaryCol = isPaleArena
        ? 'rgba(226, 232, 240, 0.42)'
        : (isClock ? 'rgba(192, 132, 252, 0.36)' : (isAwakened ? 'rgba(244, 63, 94, 0.34)' : 'rgba(148, 163, 184, 0.20)'));
      const coreCol = isPaleArena
        ? 'rgba(192, 132, 252, 0.58)'
        : (isClock ? 'rgba(240, 249, 255, 0.55)' : (isAwakened ? 'rgba(254, 240, 138, 0.48)' : 'rgba(226, 232, 240, 0.32)'));
      ctx.fillStyle = primaryCol;
      ctx.beginPath();
      for (let i = 0; i < this.ambientEmbers.length; i++) {
        const em = this.ambientEmbers[i];
        const sx = em.nx * viewW + Math.sin(em.phase) * 12;
        const sy = em.ny * viewH;
        const r = em.size * (isPaleArena || isAwakened || isClock ? 1.25 : 0.9);
        ctx.moveTo(sx + r, sy);
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
      }
      ctx.fill();

      ctx.fillStyle = coreCol;
      ctx.beginPath();
      for (let i = 0; i < this.ambientEmbers.length; i += 2) {
        const em = this.ambientEmbers[i];
        const sx = em.nx * viewW + Math.sin(em.phase) * 12;
        const sy = em.ny * viewH;
        const r = em.size * 0.5;
        ctx.moveTo(sx + r, sy);
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
      }
      ctx.fill();

      // Screen-Edge Anime Impact Frame (Speed-Lines around perimeter on heavy crits/counters/slams)
      if (this.impactFrameTimer > 0) {
        const a = Math.min(1, this.impactFrameTimer / (this.impactFrameMax || 0.09));
        const cx = viewW * 0.5;
        const cy = viewH * 0.5;
        const outerR = Math.hypot(cx, cy);
        const innerR = outerR * (0.64 + (1 - a) * 0.14);

        ctx.strokeStyle = this.impactFrameColor;
        ctx.globalAlpha = a * 0.55;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        const spikes = 28;
        for (let s = 0; s < spikes; s++) {
          const ang = (s / spikes) * Math.PI * 2 + (s % 2 === 0 ? 0.03 : -0.02);
          const rIn = innerR + ((s * 17) % 5) * 18;
          ctx.moveTo(cx + Math.cos(ang) * rIn, cy + Math.sin(ang) * rIn);
          ctx.lineTo(cx + Math.cos(ang) * outerR, cy + Math.sin(ang) * outerR);
        }
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = a * 0.38;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let s = 0; s < spikes; s += 2) {
          const ang = (s / spikes) * Math.PI * 2 + 0.015;
          const rIn = innerR + 28;
          ctx.moveTo(cx + Math.cos(ang) * rIn, cy + Math.sin(ang) * rIn);
          ctx.lineTo(cx + Math.cos(ang) * outerR, cy + Math.sin(ang) * outerR);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.cinematicTimer > 0) {
      const prog = 1.0 - (this.cinematicTimer / (this.cinematicMaxTimer || 4.45));
      // Smooth letterbox bar slide-in and slide-out
      let barFrac = 1.0;
      if (prog < 0.12) barFrac = prog / 0.12;
      else if (prog > 0.88) barFrac = Math.max(0, (1.0 - prog) / 0.12);
      const barH = Math.round(viewH * 0.115 * barFrac);

      ctx.save();
      // Crimson Vignette Edge Glow
      const vig = ctx.createRadialGradient(viewW * 0.5, viewH * 0.5, viewH * 0.25, viewW * 0.5, viewH * 0.5, viewW * 0.72);
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(0.75, `rgba(136, 19, 55, ${0.22 * barFrac})`);
      vig.addColorStop(1, `rgba(5, 5, 10, ${0.72 * barFrac})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, viewW, viewH);

      // Top & Bottom Widescreen Letterbox Bars
      ctx.fillStyle = '#030408';
      ctx.fillRect(0, 0, viewW, barH);
      ctx.fillRect(0, viewH - barH, viewW, barH);

      ctx.strokeStyle = `rgba(244, 63, 94, ${0.65 * barFrac})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, barH);
      ctx.lineTo(viewW, barH);
      ctx.moveTo(0, viewH - barH);
      ctx.lineTo(viewW, viewH - barH);
      ctx.stroke();

      // Cinematic Boss Awakening Typography & Voice Subtitle
      if (barFrac > 0.25) {
        const textAlpha = Math.min(1, (barFrac - 0.25) / 0.5);
        ctx.globalAlpha = textAlpha;
        ctx.textAlign = 'center';

        if (this.cinematicTitle) {
          ctx.font = '900 26px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = '#fda4af';
          ctx.shadowColor = '#e11d48';
          ctx.shadowBlur = 18;
          ctx.fillText(this.cinematicTitle, viewW * 0.5, barH + 38);
        }
        if (this.cinematicSubtitle) {
          ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = '#fef08a';
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 8;
          ctx.fillText(this.cinematicSubtitle, viewW * 0.5, barH + 60);
        }
        const quoteStr = (typeof audio !== 'undefined' && audio && audio.voiceSubtitleText)
          ? audio.voiceSubtitleText
          : this.cinematicQuote;
        if (quoteStr) {
          ctx.font = 'italic 700 17px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = '#f8fafc';
          ctx.shadowColor = '#e11d48';
          ctx.shadowBlur = 14;
          ctx.fillText(quoteStr, viewW * 0.5, viewH - barH - 22);
        }
      }
      ctx.restore();
      return;
    }

    // Active Combat Boss Voice Line Subtitle Banner (syncs with every Vaelgor MP3 voice clip!)
    if (typeof audio !== 'undefined' && audio && audio.voiceSubtitleTimer > 0 && audio.voiceSubtitleText) {
      const rem = audio.voiceSubtitleTimer;
      const maxT = audio.voiceSubtitleMaxTimer || 2.5;
      const elapsed = maxT - rem;
      const fadeIn = Math.min(1, elapsed / 0.16);
      const fadeOut = Math.min(1, rem / 0.30);
      const alpha = Math.max(0, Math.min(1, fadeIn * fadeOut));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.font = 'italic 700 15px "Segoe UI", system-ui, sans-serif';
      const spk = (window.game && window.game.boss && window.game.boss.speakerName) || 'VAELGOR';
      const textStr = `${spk}: ${audio.voiceSubtitleText}`;
      const metrics = ctx.measureText(textStr);
      const padX = 20;
      const boxW = Math.max(240, metrics.width + padX * 2);
      const boxH = 32;
      const boxX = viewW * 0.5 - boxW * 0.5;
      const boxY = viewH - 134;

      ctx.fillStyle = 'rgba(6, 9, 17, 0.84)';
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(boxX, boxY, boxW, boxH, 6);
      } else {
        ctx.rect(boxX, boxY, boxW, boxH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fda4af';
      ctx.shadowColor = '#e11d48';
      ctx.shadowBlur = 10;
      ctx.fillText(textStr, viewW * 0.5, boxY + 21);
      ctx.restore();
    }
  }
}

// =========================================================================
// ARENA FX ENGINE — 3D Boulders, Tectonic Fissures, Sonic Boom Rings,
// Crescent Wave Projectiles, Dimensional Cuts & Afterimages
// =========================================================================
class ArenaFX {
  constructor(camera) {
    this.camera = camera;
    this.showAllyVfx = true;
    try {
      const saved = localStorage.getItem('eclipse_show_ally_vfx');
      if (saved !== null) this.showAllyVfx = (saved !== 'false');
    } catch (e) {}
    this.sourceIsAlly = false; // Set to true while updating non-local allies/bots so their shakes never affect local camera and their VFX can be toggled!
    this.sparks = [];
    this.earthChunks = [];     // 3D airborne spinning rock boulders!
    this.scorchMarks = [];
    this.shockwaves = [];
    this.sonicRings = [];      // Mach compression rings for [A] Iron Tackle & [T] Omnislash
    this.footprints = [];
    this.fissures = [];
    this.afterimages = [];     // Pose-preserving silhouette ghosts
    this.dimensionalSlashes = [];
    this.slashRibbons = [];    // 2.5D sweeping crescent sword ribbons (zero shadowBlur!)
    this.impactFlares = [];    // 4/8-point anime impact starbursts (zero shadowBlur!)
    this.lightningBolts = [];  // Jagged abyssal/solar lightning bolts (zero shadowBlur!)
    this.crescentWaves = [];   // [R] Getsuga Crescent Wave projectiles
    this.riftLines = [];
    this.skySwords = [];
    this.pillars = [];
    this.floatingTexts = [];
    this.screenCuts = [];
    this.moveOrders = [];
    this.screenFlashTimer = 0;
    this.screenFlashMax = 0.22;
    this.screenFlashColor = '#38bdf8';
  }

  setShowAllyVfx(enabled) {
    this.showAllyVfx = !!enabled;
    try {
      localStorage.setItem('eclipse_show_ally_vfx', this.showAllyVfx ? 'true' : 'false');
    } catch (e) {}
    if (!this.showAllyVfx) {
      this.sparks = this.sparks.filter(x => !x.isAlly);
      this.earthChunks = this.earthChunks.filter(x => !x.isAlly);
      this.scorchMarks = this.scorchMarks.filter(x => !x.isAlly);
      this.shockwaves = this.shockwaves.filter(x => !x.isAlly);
      this.sonicRings = this.sonicRings.filter(x => !x.isAlly);
      this.fissures = this.fissures.filter(x => !x.isAlly);
      this.afterimages = this.afterimages.filter(x => !x.isAlly);
      this.dimensionalSlashes = this.dimensionalSlashes.filter(x => !x.isAlly);
      this.slashRibbons = this.slashRibbons.filter(x => !x.isAlly);
      this.impactFlares = this.impactFlares.filter(x => !x.isAlly);
      this.lightningBolts = this.lightningBolts.filter(x => !x.isAlly);
      this.pillars = this.pillars.filter(x => !x.isAlly);
    }
  }

  triggerShake(mag = 12, dur = 0.3) {
    // Never let ally/bot moves shake the local player's screen!
    if (this.sourceIsAlly) return;
    if (this.camera) this.camera.triggerShake(mag, dur);
  }

  triggerHitstop(ms = 65) {
    if (this.sourceIsAlly) return;
    if (this.camera) this.camera.triggerHitstop(ms);
  }

  triggerZoomPunch(amount = 0.075) {
    if (this.sourceIsAlly) return;
    if (this.camera) this.camera.triggerZoomPunch(amount);
  }

  triggerImpactFrame(color = '#f43f5e', dur = 0.09) {
    if (this.sourceIsAlly) return;
    if (this.camera && typeof this.camera.triggerImpactFrame === 'function') {
      this.camera.triggerImpactFrame(color, dur);
    }
  }

  triggerScreenFlash(color = '#38bdf8', dur = 0.22) {
    // Full-screen color flash disabled per user preference
    this.screenFlashTimer = 0;
  }

  // Spawn a 2.5D sweeping crescent slash ribbon (rendered with 'lighter' blending & zero shadowBlur!)
  addSlashRibbon(x, y, a3, a4, a5 = 92, a6 = '#38bdf8', a7 = 24, a8 = 0.28, a9 = 28, a10 = 28) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    let startAngle = 0;
    let endAngle = Math.PI;
    let radius = 92;
    let color = '#38bdf8';
    let thickness = 24;
    let duration = 0.28;
    let zOffset = 28;

    // Auto-detect signature: (x, y, radius, startAngle, endAngle, ...) vs (x, y, startAngle, endAngle, radius, ...)
    if (typeof a3 === 'number' && Math.abs(a3) > 15) {
      radius = Math.max(18, Math.abs(a3));
      startAngle = Number(a4) || 0;
      endAngle = Number(a5) || 0;
      if (typeof a6 === 'string') {
        // Signature: (x, y, radius, startAngle, endAngle, color, thickness, duration, zOffset)
        color = a6;
        thickness = (typeof a7 === 'number' && a7 > 0) ? a7 : 24;
        duration = (typeof a8 === 'number' && a8 > 0) ? a8 : 0.28;
        zOffset = (typeof a9 === 'number') ? a9 : 28;
      } else {
        // Signature: (x, y, radius, startAngle, endAngle, thickness, color, coreColor, duration, zOffset)
        thickness = (typeof a6 === 'number' && a6 > 0) ? a6 : 24;
        color = (typeof a7 === 'string') ? a7 : '#e11d48';
        duration = (typeof a9 === 'number' && a9 > 0) ? a9 : ((typeof a8 === 'number' && a8 > 0) ? a8 : 0.28);
        zOffset = (typeof a10 === 'number') ? a10 : 28;
      }
    } else {
      // Signature: (x, y, startAngle, endAngle, radius, color, thickness, duration, zOffset)
      startAngle = Number(a3) || 0;
      endAngle = Number(a4) || 0;
      radius = (typeof a5 === 'number' && Math.abs(a5) > 0) ? Math.max(18, Math.abs(a5)) : 92;
      color = (typeof a6 === 'string') ? a6 : '#38bdf8';
      thickness = (typeof a7 === 'number' && a7 > 0) ? a7 : 24;
      duration = (typeof a8 === 'number' && a8 > 0) ? a8 : 0.28;
      zOffset = (typeof a9 === 'number') ? a9 : 28;
    }

    this.slashRibbons.push({
      x: Number(x) || 0,
      y: Number(y) || 0,
      startAngle,
      endAngle,
      radius,
      color,
      thickness,
      zOffset,
      life: duration,
      maxLife: duration,
      isAlly: this.sourceIsAlly
    });
    if (this.slashRibbons.length > 28) this.slashRibbons.shift();
  }

  // Spawn a sharp 4/8-point anime impact starburst flare (zero shadowBlur!)
  addImpactStarburst(x, y, a3 = '#facc15', a4 = 1.0, a5 = 0.24, a6 = 32, a7 = 0.24) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    let color = '#facc15';
    let scale = 1.0;
    let duration = 0.24;
    let zOffset = 28;
    let rot = (Math.random() - 0.5) * 0.45;

    if (typeof a3 === 'number') {
      // Pixel radius passed as 3rd arg: e.g. (x, y, radius, color, ...)
      scale = Math.max(0.35, Math.min(3.2, Math.abs(a3) / 52));
      color = (typeof a4 === 'string') ? a4 : '#facc15';
      if (typeof a5 === 'string') {
        // Signature: (x, y, radius, color, coreColor, duration, spikes)
        duration = (typeof a6 === 'number' && a6 > 0 && a6 <= 2.0) ? a6 : 0.24;
        zOffset = 24;
      } else {
        // Signature: (x, y, radius, color, spikes, rot, duration)
        if (typeof a6 === 'number') rot = a6;
        duration = (typeof a7 === 'number' && a7 > 0 && a7 <= 2.0) ? a7 : 0.24;
        zOffset = 24;
      }
    } else {
      // Signature: (x, y, color, scale, duration, zOffset)
      color = (typeof a3 === 'string') ? a3 : '#facc15';
      scale = (typeof a4 === 'number' && a4 > 0) ? Math.min(3.5, a4) : 1.0;
      duration = (typeof a5 === 'number' && a5 > 0 && a5 <= 2.0) ? a5 : 0.24;
      zOffset = (typeof a6 === 'number') ? a6 : 32;
    }

    this.impactFlares.push({
      x: Number(x) || 0,
      y: Number(y) || 0,
      color,
      scale,
      zOffset,
      rot,
      life: duration,
      maxLife: duration,
      isAlly: this.sourceIsAlly
    });
    if (this.impactFlares.length > 32) this.impactFlares.shift();
  }

  // Spawn a jagged 2-pass lightning bolt between two points (or from sky to floor)
  addLightningBolt(x1, y1, x2, y2, color = '#f43f5e', a6 = 0.25, a7 = 3.0) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    let duration = 0.25;
    let width = 3.0;
    // Support both (..., color, duration, width) and (..., color, width, duration)
    if (typeof a6 === 'number' && typeof a7 === 'number') {
      if (a6 > 1.0 && a7 <= 1.0) {
        width = a6;
        duration = Math.max(0.08, a7);
      } else {
        duration = Math.max(0.08, a6);
        width = Math.max(1.0, a7);
      }
    }
    const pts = [];
    const segs = 7;
    const dx = (Number(x2) || 0) - (Number(x1) || 0);
    const dy = (Number(y2) || 0) - (Number(y1) || 0);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const spread = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * Math.min(38, len * 0.16);
      pts.push({
        x: x1 + dx * t + nx * spread,
        y: y1 + dy * t + ny * spread
      });
    }
    this.lightningBolts.push({
      pts,
      color: (typeof color === 'string') ? color : '#f43f5e',
      width,
      life: duration,
      maxLife: duration,
      isAlly: this.sourceIsAlly
    });
    if (this.lightningBolts.length > 28) this.lightningBolts.shift();
  }

  addMoveOrder(x, y, color = '#22c55e') {
    this.moveOrders.push({ x, y, rad: 4, maxRad: 28, life: 0.45, maxLife: 0.45, color });
  }

  // Spawn 3D Erupting Earth Boulders that fly up on Z-axis and bounce on the floor!
  spawnMassiveEarthChunks(x, y, count = 8, color = '#fb923c') {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const spd = 65 + Math.random() * 165;
      this.earthChunks.push({
        x: x + (Math.random() - 0.5) * 24,
        y: y + (Math.random() - 0.5) * 16,
        z: 4 + Math.random() * 10,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * PERSPECTIVE_TILT,
        vz: 160 + Math.random() * 210,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 12,
        size: 7 + Math.random() * 9,
        life: 0.85 + Math.random() * 0.45,
        maxLife: 1.3,
        glowColor: color,
        isAlly: this.sourceIsAlly
      });
    }
    capOldest(this.earthChunks, 96);
  }

  // Spawn Supersonic Mach Boom Rings along a dash or Omnislash trajectory
  addSonicBoomRings(x1, y1, x2, y2, count = 5, color = '#38bdf8') {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    for (let i = 1; i <= count; i++) {
      const frac = i / (count + 1);
      this.sonicRings.push({
        x: x1 + (x2 - x1) * frac,
        y: y1 + (y2 - y1) * frac,
        angle: ang,
        rad: 8,
        maxRad: 36 + i * 5,
        life: 0.35,
        maxLife: 0.35,
        color,
        isAlly: this.sourceIsAlly
      });
    }
    capOldest(this.sonicRings, 48);
  }

  addDimensionalSlash(x1, y1, x2, y2, color = '#38bdf8', duration = 0.65) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    this.dimensionalSlashes.push({
      x1, y1, x2, y2,
      color,
      life: duration,
      maxLife: duration,
      isAlly: this.sourceIsAlly
    });
    capOldest(this.dimensionalSlashes, 16);
  }

  spawnCrescentWave(x, y, angle, damage, stagger, owner, isBossWave = false, isPerfect = false) {
    const isAlly = !isBossWave && ((owner && !owner.isLocal) || this.sourceIsAlly);
    this.crescentWaves.push({
      x, y,
      vx: Math.cos(angle) * (isBossWave ? 460 : (isPerfect ? 720 : 620)),
      vy: Math.sin(angle) * (isBossWave ? 460 : (isPerfect ? 720 : 620)) * PERSPECTIVE_TILT,
      angle,
      damage,
      stagger,
      owner,
      isBossWave,
      isPerfect,
      isAlly,
      radius: isBossWave ? 64 : (isPerfect ? 96 : 78),
      life: isBossWave ? 1.35 : (isPerfect ? 1.05 : 0.92),
      maxLife: isBossWave ? 1.35 : (isPerfect ? 1.05 : 0.92),
      hitSet: new Set()
    });
  }

  // Spawn a gargantuan Execution Greatsword that locks onto a player's position and crashes down from the sky!
  spawnColossalExecutionSword(x, y, delay = 0.78) {
    this.skySwords.push({
      x, y,
      z: 620,
      delay,
      maxDelay: delay,
      state: 'telegraph',
      life: 2.1,
      isColossal: true,
      radius: 78
    });
  }

  addDragSparks(x, y, baseAngle, count = 3, crimson = false, customColor = null) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    for (let i = 0; i < count; i++) {
      const ang = baseAngle + Math.PI + (Math.random() - 0.5) * 1.4;
      const spd = 55 + Math.random() * 165;
      let col = customColor;
      if (!col) {
        col = crimson
          ? (Math.random() < 0.6 ? '#f43f5e' : '#fb7185')
          : (Math.random() < 0.5 ? '#fb923c' : '#fde047');
      }
      this.sparks.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 4,
        z: 2 + Math.random() * 8,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.6,
        vz: 55 + Math.random() * 125,
        life: 0.25 + Math.random() * 0.35,
        maxLife: 0.55,
        size: 1.8 + Math.random() * 2.4,
        color: col,
        isAlly: this.sourceIsAlly
      });
    }
  }

  addStepDust(x, y, count = 6) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 14 + Math.random() * 34;
      this.sparks.push({
        x, y, z: 1,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * PERSPECTIVE_TILT,
        vz: 12 + Math.random() * 24,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        size: 2.5 + Math.random() * 2.5,
        color: 'rgba(148, 163, 184, 0.45)',
        isDust: true,
        isAlly: this.sourceIsAlly
      });
    }
  }

  addScorchSegment(x1, y1, x2, y2, awakened = false) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    if (Math.hypot(x2 - x1, y2 - y1) < 2) return;
    this.scorchMarks.push({
      x1, y1, x2, y2,
      life: 2.4,
      maxLife: 2.4,
      awakened,
      isAlly: this.sourceIsAlly
    });
    if (this.scorchMarks.length > 100) this.scorchMarks.shift();
  }

  addFootprint(x, y, angle) {
    this.footprints.push({ x, y, angle, life: 3.5, maxLife: 3.5 });
    if (this.footprints.length > 28) this.footprints.shift();
  }

  addShockwave(x, y, maxRadius = 110, color = '#f43f5e', lineWidth = 4, duration = 0.52) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    this.shockwaves.push({
      x, y,
      radius: 8,
      maxRadius,
      life: duration,
      maxLife: duration,
      color,
      lineWidth,
      isAlly: this.sourceIsAlly
    });
    capOldest(this.shockwaves, 48);
  }

  addFissureLine(x1, y1, x2, y2, color = '#f59e0b', width = 4.5) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    const pts = [];
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const jitter = (i === 0 || i === steps) ? 0 : (Math.random() - 0.5) * 22;
      pts.push({
        x: x1 + (x2 - x1) * t + jitter,
        y: y1 + (y2 - y1) * t + jitter * PERSPECTIVE_TILT
      });
    }
    this.fissures.push({ pts, life: 2.1, maxLife: 2.1, color, width, isAlly: this.sourceIsAlly });
    capOldest(this.fissures, 24);
  }

  addAfterimage(x, y, facingAngle, color = '#38bdf8', swordAngle = null) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    this.afterimages.push({
      x, y, facingAngle,
      swordAngle: swordAngle !== null ? swordAngle : facingAngle,
      life: 0.48,
      maxLife: 0.48,
      color,
      isAlly: this.sourceIsAlly
    });
    capOldest(this.afterimages, 32);
  }

  addRiftLine(x1, y1, x2, y2, delay = 0.55) {
    this.riftLines.push({
      x1, y1, x2, y2,
      timer: delay,
      erupted: false,
      life: 0.65,
      maxLife: 0.65
    });
  }

  spawnSkySword(x, y, delay = 0.4) {
    this.skySwords.push({
      x, y,
      z: 420,
      delay,
      state: 'telegraph',
      life: 1.65
    });
  }

  detonateAllLodgedSwords() {
    for (const s of this.skySwords) {
      if (s.state === 'lodged') {
        s.state = 'detonating';
        s.life = 0.45;
        this.addPillar(s.x, s.y, 34, '#e11d48', 0.55);
        this.addShockwave(s.x, s.y, 78, '#f43f5e', 3.5);
        this.addDragSparks(s.x, s.y, 0, 10, true);
      }
    }
    audio.playImpactBoom(1.45);
    this.triggerShake(18, 0.45);
  }

  addPillar(x, y, radius = 32, color = '#f43f5e', duration = 0.55) {
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    this.pillars.push({
      x, y, radius, color,
      life: duration,
      maxLife: duration,
      isAlly: this.sourceIsAlly
    });
    capOldest(this.pillars, 24);
  }

  addFloatingText(x, y, text, color = '#ffffff', size = 15) {
    // Ally damage numbers count as ally VFX too (they were ignoring the toggle).
    if (this.sourceIsAlly && !this.showAllyVfx) return;
    if (window.PopupText && window.PopupText.hide(text)) return;      // quiet text (Settings > Interface > Extra popup text)
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 18,
      y,
      vy: -42,
      text,
      color,
      size,
      life: 1.35,
      maxLife: 1.35,
      isAlly: this.sourceIsAlly
    });
    capOldest(this.floatingTexts, 40);
  }

  update(dt, raidEntities = null, boss = null) {
    if (this.screenFlashTimer > 0) {
      this.screenFlashTimer = Math.max(0, this.screenFlashTimer - dt);
    }
    for (let i = this.moveOrders.length - 1; i >= 0; i--) {
      const m = this.moveOrders[i];
      m.life -= dt;
      m.rad += (m.maxRad - m.rad) * dt * 9;
      if (m.life <= 0) this.moveOrders.splice(i, 1);
    }

    // Update 3D Airborne Earth Boulders
    for (let i = this.earthChunks.length - 1; i >= 0; i--) {
      const c = this.earthChunks[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.earthChunks.splice(i, 1);
        continue;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.vz -= 480 * dt;
      c.rot += c.vRot * dt;
      if (c.z < 0) {
        c.z = 0;
        c.vx *= 0.55;
        c.vy *= 0.55;
        c.vz = Math.abs(c.vz) * 0.42;
      }
    }

    // Update Sonic Boom Rings
    for (let i = this.sonicRings.length - 1; i >= 0; i--) {
      const sr = this.sonicRings[i];
      sr.life -= dt;
      sr.rad += (sr.maxRad - sr.rad) * dt * 11;
      if (sr.life <= 0) this.sonicRings.splice(i, 1);
    }

    // Update Dimensional Slashes
    for (let i = this.dimensionalSlashes.length - 1; i >= 0; i--) {
      this.dimensionalSlashes[i].life -= dt;
      if (this.dimensionalSlashes[i].life <= 0) this.dimensionalSlashes.splice(i, 1);
    }

    // Update 2.5D Sweeping Slash Ribbons
    for (let i = this.slashRibbons.length - 1; i >= 0; i--) {
      this.slashRibbons[i].life -= dt;
      if (this.slashRibbons[i].life <= 0) this.slashRibbons.splice(i, 1);
    }

    // Update Impact Starburst Flares
    for (let i = this.impactFlares.length - 1; i >= 0; i--) {
      this.impactFlares[i].life -= dt;
      if (this.impactFlares[i].life <= 0) this.impactFlares.splice(i, 1);
    }

    // Update Jagged Lightning Bolts
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      this.lightningBolts[i].life -= dt;
      if (this.lightningBolts[i].life <= 0) this.lightningBolts.splice(i, 1);
    }

    // Update [R] Crescent Wave Projectiles (Player & Boss Crimson Waves)
    for (let i = this.crescentWaves.length - 1; i >= 0; i--) {
      const cw = this.crescentWaves[i];
      cw.life -= dt;
      if (cw.life <= 0) {
        this.crescentWaves.splice(i, 1);
        continue;
      }
      cw.x += cw.vx * dt;
      cw.y += cw.vy * dt;
      if (Math.random() < 0.7 && (!cw.isAlly || this.showAllyVfx)) {
        const prevAlly = this.sourceIsAlly;
        this.sourceIsAlly = !!cw.isAlly;
        const spkCol = cw.isBossWave ? '#f43f5e' : (cw.isPerfect ? '#facc15' : '#38bdf8');
        this.addDragSparks(cw.x, cw.y - 18, cw.angle, 1, cw.isBossWave, spkCol);
        this.sourceIsAlly = prevAlly;
      }
      if (cw.isBossWave) {
        if (raidEntities) {
          for (const ent of raidEntities) {
            if (ent.hp > 0 && !cw.hitSet.has(ent.id) && Math.hypot(ent.x - cw.x, ent.y - cw.y) < cw.radius) {
              cw.hitSet.add(ent.id);
              ent.takeDamage(cw.damage || 210, 'Abyssal Crescent Wave', {
                power: 'medium',
                sourceX: cw.x - Math.cos(cw.angle) * 40,
                sourceY: cw.y - Math.sin(cw.angle) * 40 * PERSPECTIVE_TILT,
                pushDist: 95
              });
              this.addShockwave(ent.x, ent.y, 85, '#f43f5e', 4);
              this.addImpactStarburst(ent.x, ent.y, '#f43f5e', 1.1, 0.24, 28);
            }
          }
        }
      } else if (boss) {
        if (typeof boss.checkPlayerHitAnchors === 'function') {
          boss.checkPlayerHitAnchors(cw.x, cw.y, cw.radius);
        }
        if (boss.hp > 0 && !cw.hitSet.has('boss') && Math.hypot(boss.x - cw.x, boss.y - cw.y) < cw.radius + 32) {
          cw.hitSet.add('boss');
          const prevAlly = this.sourceIsAlly;
          this.sourceIsAlly = !!cw.isAlly;
          if (cw.owner) {
            const coeff = cw.isPerfect ? 4.10 : 2.75;
            cw.owner.dealHitToBoss(boss, coeff, 'Crescent Wave [R]', false, cw.stagger, cw.isPerfect, {
              isStrongMove: true,
              forceCrit: cw.isPerfect,
              impulseStrength: cw.isPerfect ? 1.5 : 1.0,
              hitX: cw.x,
              hitY: cw.y
            });
            cw.owner.addOverpower(cw.isPerfect ? 32 : 20);
          }
          const waveCol = cw.isPerfect ? '#facc15' : '#38bdf8';
          this.addShockwave(boss.x, boss.y, cw.isPerfect ? 150 : 115, waveCol, 5);
          this.addImpactStarburst(boss.x, boss.y, waveCol, cw.isPerfect ? 1.45 : 1.15, 0.26, 34);
          this.addDragSparks(boss.x, boss.y - 25, cw.angle, 20, false, waveCol);
          audio.playImpactBoom(cw.isPerfect ? 1.35 : 1.1);
          this.sourceIsAlly = prevAlly;
        }
      }
    }

    if (this.sparks.length > 180) {
      this.sparks.splice(0, this.sparks.length - 180);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (!p.isDust) p.vz -= 290 * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vx *= 0.6;
        p.vy *= 0.6;
        p.vz = Math.abs(p.vz) * 0.35;
      }
    }

    for (let i = this.scorchMarks.length - 1; i >= 0; i--) {
      this.scorchMarks[i].life -= dt;
      if (this.scorchMarks[i].life <= 0) this.scorchMarks.splice(i, 1);
    }

    for (let i = this.footprints.length - 1; i >= 0; i--) {
      this.footprints[i].life -= dt;
      if (this.footprints[i].life <= 0) this.footprints.splice(i, 1);
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const prog = 1 - sw.life / sw.maxLife;
      sw.radius = 8 + (sw.maxRadius - 8) * Math.pow(prog, 0.62);
    }

    for (let i = this.fissures.length - 1; i >= 0; i--) {
      this.fissures[i].life -= dt;
      if (this.fissures[i].life <= 0) this.fissures.splice(i, 1);
    }

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].life -= dt;
      if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
    }

    for (let i = this.riftLines.length - 1; i >= 0; i--) {
      const rl = this.riftLines[i];
      if (!rl.erupted) {
        rl.timer -= dt;
        if (rl.timer <= 0) {
          rl.erupted = true;
          audio.playImpactBoom(0.85);
          this.triggerShake(8, 0.2);
          this.addLightningBolt(rl.x1, rl.y1 - 12, rl.x2, rl.y2 - 12, '#f43f5e', 0.26, 3.2);
          // Each entity is hit at most ONCE per eruption (the 5 sample points overlap, so without this a player standing
          // in the rift was hit up to 4x = 600 damage instead of 150).
          const riftHit = new Set();
          for (let s = 0; s <= 4; s++) {
            const t = s / 4;
            const rx = rl.x1 + (rl.x2 - rl.x1) * t;
            const ry = rl.y1 + (rl.y2 - rl.y1) * t;
            this.addDragSparks(rx, ry, 0, 6, true);
            if (raidEntities) {
              for (const ent of raidEntities) {
                if (ent.hp > 0 && !riftHit.has(ent) && Math.hypot(ent.x - rx, ent.y - ry) < 48) {
                  riftHit.add(ent);
                  ent.takeDamage(150, 'Shadow Rift', {
                    power: 'light',
                    sourceX: rx,
                    sourceY: ry,
                    pushDist: 55
                  });
                }
              }
            }
          }
        }
      } else {
        rl.life -= dt;
        if (rl.life <= 0) this.riftLines.splice(i, 1);
      }
    }

    for (let i = this.skySwords.length - 1; i >= 0; i--) {
      const s = this.skySwords[i];
      if (s.state === 'telegraph') {
        s.delay -= dt;
        if (s.delay <= 0) {
          s.state = 'falling';
          audio.playSwordSlash(s.isColossal, s.isColossal ? 0.75 : 1.0);
        }
      } else if (s.state === 'falling') {
        s.z -= (s.isColossal ? 2150 : 1650) * dt;
        if (s.z <= 0) {
          s.z = 0;
          s.state = 'lodged';
          if (s.isColossal) {
            audio.playImpactBoom(1.55);
            audio.playSwordPlant();
            this.triggerShake(18, 0.35);
            this.triggerImpactFrame('#f43f5e', 0.11);
            this.addShockwave(s.x, s.y, 115, '#e11d48', 5.5);
            this.addShockwave(s.x, s.y, 68, '#ffffff', 3.5);
            this.addPillar(s.x, s.y, 38, '#e11d48', 0.55);
            this.addImpactStarburst(s.x, s.y, '#f43f5e', 1.65, 0.28, 16);
            this.addLightningBolt(s.x + (Math.random() - 0.5) * 40, s.y - 340, s.x, s.y, '#fda4af', 0.28, 3.8);
            this.spawnMassiveEarthChunks(s.x, s.y, 7, '#f43f5e');
            for (let c = 0; c < 3; c++) {
              const fa = (c * Math.PI * 2) / 3 + Math.random() * 0.4;
              this.addFissureLine(s.x, s.y, s.x + Math.cos(fa) * 95, s.y + Math.sin(fa) * 95 * PERSPECTIVE_TILT, '#e11d48', 4.0);
            }
            if (raidEntities) {
              for (const ent of raidEntities) {
                if (ent.hp > 0 && Math.hypot(ent.x - s.x, (ent.y - s.y) / PERSPECTIVE_TILT) < (s.radius || 78)) {
                  ent.takeDamage(285, 'Sword of Damocles (Execution)', {
                    power: 'heavy',
                    sourceX: s.x,
                    sourceY: s.y,
                    pushDist: 145
                  });
                }
              }
            }
          } else {
            audio.playImpactBoom(0.75);
            this.triggerShake(6, 0.14);
            this.addShockwave(s.x, s.y, 48, '#f43f5e', 2.5);
            this.addImpactStarburst(s.x, s.y, '#f43f5e', 0.9, 0.2, 12);
            this.addDragSparks(s.x, s.y, 0, 8, true);
            if (raidEntities) {
              for (const ent of raidEntities) {
                if (ent.hp > 0 && Math.hypot(ent.x - s.x, (ent.y - s.y) / PERSPECTIVE_TILT) < 42) {
                  ent.takeDamage(155, 'Graveyard Greatsword', {
                    power: 'light',
                    sourceX: s.x,
                    sourceY: s.y,
                    pushDist: 55
                  });
                }
              }
            }
          }
        }
      } else if (s.state === 'lodged' || s.state === 'detonating') {
        s.life -= dt;
        if (s.life <= 0) this.skySwords.splice(i, 1);
      }
    }

    for (let i = this.pillars.length - 1; i >= 0; i--) {
      this.pillars[i].life -= dt;
      if (this.pillars[i].life <= 0) this.pillars.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.93;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }

    for (let i = this.screenCuts.length - 1; i >= 0; i--) {
      this.screenCuts[i].life -= dt;
      if (this.screenCuts[i].life <= 0) this.screenCuts.splice(i, 1);
    }
  }

  drawGroundEffects(ctx) {
    // Move order rings
    for (const m of this.moveOrders) {
      const a = Math.max(0, m.life / m.maxLife);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(1, PERSPECTIVE_TILT);
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = a * 0.85;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, m.rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Footprints
    for (const fp of this.footprints) {
      const alpha = (fp.life / fp.maxLife) * 0.28;
      ctx.save();
      ctx.translate(fp.x, fp.y);
      ctx.scale(1, PERSPECTIVE_TILT);
      ctx.rotate(fp.angle);
      ctx.fillStyle = `rgba(5, 8, 15, ${alpha})`;
      ctx.strokeStyle = `rgba(148, 163, 184, ${alpha * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-7, -4, 14, 8, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Scorch marks from dragged greatsword
    for (const sm of this.scorchMarks) {
      if (sm.isAlly && !this.showAllyVfx) continue;
      const alpha = sm.life / sm.maxLife;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = sm.awakened
        ? `rgba(225, 29, 72, ${alpha * 0.65})`
        : `rgba(249, 115, 22, ${alpha * 0.55})`;
      ctx.lineWidth = 6 * alpha;
      ctx.beginPath();
      ctx.moveTo(sm.x1, sm.y1);
      ctx.lineTo(sm.x2, sm.y2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(254, 240, 138, ${alpha * 0.78})`;
      ctx.lineWidth = 2.0 * alpha;
      ctx.beginPath();
      ctx.moveTo(sm.x1, sm.y1);
      ctx.lineTo(sm.x2, sm.y2);
      ctx.stroke();
      ctx.restore();
    }

    // Tectonic jagged fissures (Zero-ShadowBlur 2-Pass Additive Glow)
    for (const f of this.fissures) {
      if (f.isAlly && !this.showAllyVfx) continue;
      const alpha = Math.max(0, Math.min(1, f.life / f.maxLife));
      const w = (f.width || 4.5) * alpha;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      f.pts.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      // Outer magma/energy aura pass
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = alpha * 0.42;
      ctx.lineWidth = w * 2.6;
      ctx.stroke();
      // Mid vivid pass
      ctx.globalAlpha = alpha * 0.9;
      ctx.lineWidth = w;
      ctx.stroke();
      // White-hot core pass
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = alpha * 0.95;
      ctx.lineWidth = Math.max(1.2, 1.8 * alpha);
      ctx.stroke();
      ctx.restore();
    }

    // Skyward Sword Telegraphs on floor (Supports Standard & Colossal Execution Greatswords!)
    for (const s of this.skySwords) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(1, PERSPECTIVE_TILT);
      const rad = s.isColossal ? (s.radius || 78) : 38;
      if (s.state === 'telegraph' || s.state === 'falling') {
        const prog = s.maxDelay ? Math.max(0, 1 - s.delay / s.maxDelay) : 0.7;
        ctx.fillStyle = s.isColossal ? 'rgba(225, 29, 72, 0.28)' : 'rgba(225, 29, 72, 0.22)';
        ctx.strokeStyle = s.isColossal ? '#fda4af' : '#f43f5e';
        ctx.lineWidth = s.isColossal ? 3.2 : 2;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Shrinking/filling lock-on ring & crosshairs for Colossal Execution Sword!
        if (s.isColossal) {
          ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
          ctx.beginPath();
          ctx.arc(0, 0, rad * prog, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-rad * 0.85, 0);
          ctx.lineTo(rad * 0.85, 0);
          ctx.moveTo(0, -rad * 0.85);
          ctx.lineTo(0, rad * 0.85);
          ctx.stroke();
        }
      } else if (s.state === 'lodged') {
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.65)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, s.isColossal ? 84 : 58, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // Delayed Rift Slash Lines (Zero-ShadowBlur Additive Eruption)
    for (const rl of this.riftLines) {
      ctx.save();
      if (!rl.erupted) {
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.75)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(rl.x1, rl.y1);
        ctx.lineTo(rl.x2, rl.y2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const a = Math.max(0, Math.min(1, rl.life / rl.maxLife));
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(rl.x1, rl.y1);
        ctx.lineTo(rl.x2, rl.y2);
        ctx.strokeStyle = '#f43f5e';
        ctx.globalAlpha = a * 0.45;
        ctx.lineWidth = 28 * a;
        ctx.stroke();
        ctx.strokeStyle = '#e11d48';
        ctx.globalAlpha = a * 0.9;
        ctx.lineWidth = 14 * a;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = a * 0.95;
        ctx.lineWidth = 4.5 * a;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Shockwave rings (Zero-ShadowBlur 2-Pass Additive Glow)
    for (const sw of this.shockwaves) {
      if (sw.isAlly && !this.showAllyVfx) continue;
      const alpha = Math.max(0, Math.min(1, sw.life / sw.maxLife));
      const lw = sw.lineWidth * alpha + 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(sw.x, sw.y);
      ctx.scale(1, PERSPECTIVE_TILT);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, sw.radius), 0, Math.PI * 2);
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = alpha * 0.38;
      ctx.lineWidth = lw * 2.4;
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.92;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = alpha * 0.7;
      ctx.lineWidth = Math.max(1.2, lw * 0.35);
      ctx.stroke();
      ctx.restore();
    }

    // Supersonic Mach Boom Rings (Zero-ShadowBlur Additive Glow)
    for (const sr of this.sonicRings) {
      if (sr.isAlly && !this.showAllyVfx) continue;
      const a = Math.max(0, Math.min(1, sr.life / sr.maxLife));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(sr.x, sr.y - 24);
      ctx.rotate(sr.angle);
      ctx.scale(0.42, 1.0);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, sr.rad), 0, Math.PI * 2);
      ctx.strokeStyle = sr.color;
      ctx.globalAlpha = a * 0.38;
      ctx.lineWidth = 9 * a;
      ctx.stroke();
      ctx.globalAlpha = a * 0.88;
      ctx.lineWidth = 3.8 * a;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = a * 0.75;
      ctx.lineWidth = 1.4 * a;
      ctx.stroke();
      ctx.restore();
    }

    // Silhouette Afterimages (Zero-ShadowBlur Additive Phantom Silhouette)
    for (const ai of this.afterimages) {
      if (ai.isAlly && !this.showAllyVfx) continue;
      const a = Math.max(0, Math.min(1, (ai.life / ai.maxLife) * 0.58));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(ai.x, ai.y - 32);
      ctx.globalAlpha = a;
      ctx.fillStyle = ai.color || '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(16, -10);
      ctx.lineTo(11, 30);
      ctx.lineTo(-11, 30);
      ctx.lineTo(-16, -10);
      ctx.closePath();
      ctx.fill();

      // Ghost Greatsword slash line (2-pass glow)
      if (!ai.noSword) {
      const gx = Math.cos(ai.swordAngle) * 78;
      const gy = Math.sin(ai.swordAngle) * 78 * PERSPECTIVE_TILT;
      ctx.lineCap = 'round';
      ctx.strokeStyle = ai.color || '#38bdf8';
      ctx.globalAlpha = a * 0.65;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(gx, gy);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = a * 0.95;
      ctx.lineWidth = 3.8;
      ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawForegroundSparks(ctx) {
    // 1. Travelling 2.5D Crescent Wave Projectiles (Zero-ShadowBlur Multi-Pass Additive)
    for (const cw of this.crescentWaves) {
      if (cw.isAlly && !this.showAllyVfx) continue;
      if (cw.getsuga && typeof this.drawGetsugaWave === 'function') { this.drawGetsugaWave(ctx, cw); continue; }   // Vaelgor's Eclipse Getsuga (karok_clash.js)
      const a = Math.max(0, Math.min(1, (cw.life / cw.maxLife) * 1.4));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cw.x, cw.y - 24);
      ctx.rotate(cw.angle);
      ctx.lineCap = 'round';

      const mainCol = cw.isBossWave ? '#f43f5e' : (cw.isPerfect ? '#facc15' : '#38bdf8');
      const outerCol = cw.isBossWave ? '#9f1239' : (cw.isPerfect ? '#f59e0b' : '#0284c7');
      const baseW = cw.isBossWave ? 18 : (cw.isPerfect ? 22 : 16);
      const arcRad = cw.isBossWave ? 58 : (cw.isPerfect ? 82 : 68);

      // Soft outer bloom pass
      ctx.strokeStyle = outerCol;
      ctx.globalAlpha = a * 0.45;
      ctx.lineWidth = baseW * 2.1;
      ctx.beginPath();
      ctx.arc(-18, 0, arcRad, -1.08, 1.08);
      ctx.stroke();

      // Main vivid crescent pass
      ctx.strokeStyle = mainCol;
      ctx.globalAlpha = a * 0.92;
      ctx.lineWidth = baseW;
      ctx.beginPath();
      ctx.arc(-18, 0, arcRad, -1.05, 1.05);
      ctx.stroke();

      // Inner White-Hot Core Crescent
      ctx.strokeStyle = cw.isBossWave ? '#fecdd3' : '#ffffff';
      ctx.globalAlpha = a;
      ctx.lineWidth = cw.isPerfect ? 8 : 6;
      ctx.beginPath();
      ctx.arc(-14, 0, arcRad, -0.92, 0.92);
      ctx.stroke();
      ctx.restore();
    }

    // 1b. 2.5D Sweeping Sword Slash Ribbons (Zero-ShadowBlur Additive Crescent Trails!)
    if (this.slashRibbons.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const sr of this.slashRibbons) {
        if (sr.isAlly && !this.showAllyVfx) continue;
        const a = Math.max(0, Math.min(1, sr.life / (sr.maxLife || 0.28)));
        const prog = 1 - a;
        const baseRad = Math.max(18, Math.abs(Number(sr.radius) || 92));
        const baseThick = Math.max(4, Math.abs(Number(sr.thickness) || 24));
        const rOuter = Math.max(14, baseRad * (0.92 + prog * 0.14));
        const rInner = Math.max(4, Math.min(rOuter - 3, rOuter - baseThick * Math.pow(a, 0.65)));
        const ccw = sr.endAngle < sr.startAngle;
        const steps = 14;
        ctx.save();
        ctx.translate(sr.x, sr.y - (Number(sr.zOffset) || 28));
        ctx.scale(1, PERSPECTIVE_TILT);

        // Outer vivid energy ribbon
        ctx.globalAlpha = a * 0.82;
        ctx.fillStyle = (typeof sr.color === 'string') ? sr.color : '#38bdf8';
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const ang = sr.startAngle + (sr.endAngle - sr.startAngle) * t;
          const taper = Math.sin(t * Math.PI);
          const rad = rInner + (rOuter - rInner) * (0.35 + 0.65 * taper);
          const px = Math.cos(ang) * rad;
          const py = Math.sin(ang) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        for (let i = steps; i >= 0; i--) {
          const t = i / steps;
          const ang = sr.startAngle + (sr.endAngle - sr.startAngle) * t;
          const px = Math.cos(ang) * rInner;
          const py = Math.sin(ang) * rInner;
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // Inner white-hot leading razor edge
        ctx.globalAlpha = a * 0.95;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.8, 4.2 * a);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(4, rOuter - 2), sr.startAngle + (sr.endAngle - sr.startAngle) * 0.18, sr.endAngle, ccw);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // 2. Dimensional Slashes (Anime X-Cut & Omnislash Reality Fractures - Zero-ShadowBlur 3-Pass Additive)
    if (this.dimensionalSlashes.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const ds of this.dimensionalSlashes) {
        if (ds.isAlly && !this.showAllyVfx) continue;
        const a = Math.max(0, Math.min(1, ds.life / ds.maxLife));
        ctx.beginPath();
        ctx.moveTo(ds.x1, ds.y1 - 26);
        ctx.lineTo(ds.x2, ds.y2 - 26);
        // Outer wide bloom
        ctx.strokeStyle = ds.color;
        ctx.globalAlpha = a * 0.36;
        ctx.lineWidth = 26 * a;
        ctx.stroke();
        // Mid vivid cut
        ctx.globalAlpha = a * 0.92;
        ctx.lineWidth = 10.5 * a;
        ctx.stroke();
        // Razor white core
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = a;
        ctx.lineWidth = 3.5 * a;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. 3D Erupting Earth Boulders (Earthbreaker [W], Titan's Wrath [F], Omnislash [T])
    for (const c of this.earthChunks) {
      if (c.isAlly && !this.showAllyVfx) continue;
      const alpha = Math.min(1, (c.life / c.maxLife) * 1.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      // Ground shadow under boulder
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.size * 0.8, c.size * 0.8 * PERSPECTIVE_TILT, 0, 0, Math.PI * 2);
      ctx.fill();

      // Airborne 3D Rock Polygon
      ctx.translate(c.x, c.y - c.z);
      ctx.rotate(c.rot);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = c.glowColor;
      ctx.lineWidth = 2;
      const s = c.size;
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.6);
      ctx.lineTo(0, -s);
      ctx.lineTo(s, -s * 0.4);
      ctx.lineTo(s * 0.8, s * 0.7);
      ctx.lineTo(-s * 0.6, s * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 4. Raining & Lodged Spectral Obsidian Greatswords (Including Gargantuan Execution Swords!)
    for (const s of this.skySwords) {
      if (s.state === 'telegraph') continue;
      const alpha = s.state === 'lodged' ? Math.min(1, s.life * 1.5) : 1.0;
      const tipY = s.y - s.z;
      const scale = s.isColossal ? 2.45 : 1.0;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(s.x, tipY);
      ctx.scale(scale, scale);

      ctx.fillStyle = '#090d16';
      ctx.strokeStyle = s.isColossal ? '#fef08a' : '#fda4af';
      ctx.lineWidth = 2.0;

      // Massive Obsidian Blade Body
      ctx.beginPath();
      ctx.moveTo(-7.5, -76);
      ctx.lineTo(7.5, -76);
      ctx.lineTo(10, -45);
      ctx.lineTo(5.5, -16);
      ctx.lineTo(0, 0);
      ctx.lineTo(-5.5, -16);
      ctx.lineTo(-10, -45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing Molten Crimson Fuller Core
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(0, -70);
      ctx.lineTo(0, -18);
      ctx.stroke();

      // Swept Execution Crossguard & Pommel
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-22, -74);
      ctx.lineTo(0, -82);
      ctx.lineTo(22, -74);
      ctx.lineTo(0, -76);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, -82);
      ctx.lineTo(0, -100);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Vertical Abyssal / Golden Orbital Pillars
    for (const pil of this.pillars) {
      if (pil.isAlly && !this.showAllyVfx) continue;
      const a = pil.life / pil.maxLife;
      ctx.save();
      ctx.globalAlpha = a * 0.88;
      const grad = ctx.createLinearGradient(pil.x - pil.radius, 0, pil.x + pil.radius, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.25, pil.color);
      grad.addColorStop(0.5, '#ffffff');
      grad.addColorStop(0.75, pil.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(pil.x - pil.radius, pil.y - 460, pil.radius * 2, 460);
      ctx.restore();
    }

    // 6. Zero-ShadowBlur Additive Pass: 3D Sparks, Impact Starbursts & Crackling Lightning Bolts
    ctx.save();
    for (const p of this.sparks) {
      if (p.isAlly && !this.showAllyVfx) continue;
      const alpha = Math.min(1, p.life / p.maxLife);
      const sy = p.y - p.z;
      ctx.globalCompositeOperation = p.isDust ? 'source-over' : 'lighter';
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, sy, Math.max(0.5, p.size), 0, Math.PI * 2);
      ctx.fill();
      if (!p.isDust && p.size > 2.0) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillRect(p.x - 0.8, sy - 0.8, 1.6, 1.6);
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    // 6b. 4/8-Point Anime Impact Starburst Flares
    for (const fl of this.impactFlares) {
      if (fl.isAlly && !this.showAllyVfx) continue;
      const a = Math.max(0, Math.min(1, fl.life / (fl.maxLife || 0.24)));
      const baseScale = Math.max(0.25, Number(fl.scale) || 1.0);
      const sc = baseScale * (0.65 + (1 - a) * 0.75);
      const rLong = 48 * sc;
      const rDiag = 24 * sc;
      const rCore = 7.5 * sc * a;
      ctx.save();
      ctx.translate(fl.x, fl.y - (Number(fl.zOffset) || 28));
      ctx.rotate(Number(fl.rot) || 0);

      // Outer colored 8-point starburst
      ctx.globalAlpha = a * 0.92;
      ctx.fillStyle = (typeof fl.color === 'string') ? fl.color : '#facc15';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        const r = (i % 2 === 0) ? rLong : rDiag;
        const px = Math.cos(ang) * r;
        const py = Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        const midAng = ang + Math.PI / 8;
        ctx.lineTo(Math.cos(midAng) * rCore, Math.sin(midAng) * rCore);
      }
      ctx.closePath();
      ctx.fill();

      // White-hot inner 4-point diamond core
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        const r = rLong * 0.56;
        if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
        const midAng = ang + Math.PI / 4;
        ctx.lineTo(Math.cos(midAng) * (rCore * 0.55), Math.sin(midAng) * (rCore * 0.55));
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 6c. Jagged 2-Pass Lightning Bolts (Outer Glow + White-Hot Core, Zero shadowBlur)
    for (const lb of this.lightningBolts) {
      if (lb.isAlly && !this.showAllyVfx) continue;
      const a = Math.max(0, Math.min(1, lb.life / (lb.maxLife || 0.25)));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = a * 0.72;
      ctx.strokeStyle = (typeof lb.color === 'string') ? lb.color : '#f43f5e';
      ctx.lineWidth = Math.max(1.5, (Number(lb.width) || 3.0) * 3.2 * a);
      ctx.beginPath();
      lb.pts.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, (Number(lb.width) || 3.0) * 0.9 * a);
      ctx.stroke();
    }
    ctx.restore();

    // 7. Screen-Wide Dimensional Cuts (Zero-ShadowBlur Additive Cuts)
    if (this.screenCuts.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const sc of this.screenCuts) {
        const a = Math.max(0, Math.min(1, sc.life));
        ctx.beginPath();
        ctx.moveTo(sc.x1, sc.y1);
        ctx.lineTo(sc.x2, sc.y2);
        ctx.strokeStyle = '#e11d48';
        ctx.globalAlpha = a * 0.45;
        ctx.lineWidth = 14 * a;
        ctx.stroke();
        ctx.strokeStyle = '#fda4af';
        ctx.globalAlpha = a * 0.95;
        ctx.lineWidth = 5.5 * a;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = a;
        ctx.lineWidth = 2.0 * a;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 8. Floating Combat Text (Crisp Stroke Outline instead of expensive per-text shadowBlur)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const ft of this.floatingTexts) {
      const a = Math.min(1, (ft.life / ft.maxLife) * 1.4);
      ctx.globalAlpha = a;
      ctx.font = `800 ${ft.size}px 'Segoe UI', system-ui, sans-serif`;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.lineWidth = 3.5;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }
}

window.PERSPECTIVE_TILT = PERSPECTIVE_TILT;
window.audio = audio;
window.Camera25D = Camera25D;
window.ArenaFX = ArenaFX;
