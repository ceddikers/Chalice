// =========================================================================
// CLASH_QTE.JS — Class-agnostic 15% HP "Eclipse Sovereign Clash" player side
//
// ANY playable class can take the Final Clash: stand in the blue circle and press [G]. The clash needs nothing
// class-specific (it only uses [W]/[E], position, hp and `state`), so all of it lives here instead of on a class.
//
// To make a new class clash-capable:
//   1. After the class declaration:        installClashQte(MyNewClass);
//   2. In its constructor:                 initClashQteState(this);
//   3. In its update(dt, boss, ...), before the normal per-state logic:
//        this.updateClashRhythmQte(dt, boss);
//        if (this.state === 'clash_lock' && this.updateClashLockState(boss)) return;
//   4. Block skills / movement / dodge while `this.isClashLocked()` is true.
// Classes that forget step 1-2 are still rescued: the boss calls ensureClashCapable(player) before the clash.
// Co-op/remote proxies are just class instances too, so nothing here depends on which class is clashing.
// =========================================================================

function initClashQteState(obj) {
  obj.clashQteActive = false;
  obj.clashBeats = [];
  obj.clashBeatDetails = [];
  obj.clashAttempts = [];
  obj.clashBeatIndex = 0;
  obj.clashBeatTimer = 0;
  obj.clashBeatDuration = 1.05;
  obj.clashAttemptIndex = 0;
  obj.clashSubHitIndex = 0;
  obj.clashCurrentStyle = 'overhead_crush';
  obj.clashLastParryFlash = 0;
  obj.clashLastResult = null;
  obj.clashLastResultTimer = 0;
}

// The shared hold rule: a [T] ultimate that pins the boss in place cannot do so while the boss is inside a mechanic (or its
// lead-in). Each class's castT checks this, plays a short bounce-off instead, and settles the cooldown itself: half back if the
// cast made contact / was in reach, the full cooldown if it whiffed. The Reaper's Voidform T is exempt and never asks.
function ultHoldBlocked(boss) {
  if (!boss) return false;
  if (typeof boss.holdBlocked === 'function') return !!boss.holdBlocked();
  return /_mechanic$|^mech_approach$/.test(boss.state || '');
}
// the bounce itself: a dull clang and a small ring at the point of contact, no floating text
function ultBounceFx(x, y) {
  if (window.audio && audio.playParryClang) audio.playParryClang(false);
  if (window.fx) window.fx.addShockwave(x, y, 70, '#e2e8f0', 4, 0.25);
}
window.ultHoldBlocked = ultHoldBlocked;
window.ultBounceFx = ultBounceFx;

class ClashQteMethods {
  isClashLocked() {
    return !!this.clashQteActive || this.state === 'clash_lock';
  }

  // Per-frame clash_lock state upkeep. Returns true while the player is (still) locked so update() can early-out.
  updateClashLockState(boss) {
    this.jumpZ = 0;
    this.bodySpinAngle = 0;
    this.swordScale = 1.42;
    if (boss) {
      this.facingAngle = Math.atan2((boss.y - this.y) / PERSPECTIVE_TILT, boss.x - this.x);
    }
    if (typeof this.snapFeetToBody === 'function') this.snapFeetToBody();
    if (!boss || boss.state !== 'final_clash_mechanic' || boss.clashPhase !== 'active_clash') {
      this.clearClashRhythmQte();
      this.state = 'idle';
      this.stateTimer = 0;
      this.swordScale = 1.0;
    }
    return true;
  }
  startClashRhythmQte(boss = null, totalDur = 6.5) {
    if (this.hp <= 0) return;
    this.clearEclipseQteAndRoot();
    this.clashQteActive = true;

    // Cinematic Duel: after Vaelgor's one huge opening swing (boss.clashIntroT, no input needed), he hoists the
    // greatsword high and brings it down in 4 swings. Each swing is a short [W]/[E] phrase that lands on the beat
    // the blade connects (ring converges at CLASH_CONTACT_PROG):  W E  ->  E  ->  3-hit flurry  ->  finisher.
    const pickEW = () => (Math.random() < 0.5 ? 'E' : 'W');
    const flipEW = (k) => (k === 'E' ? 'W' : 'E');
    const k1a = pickEW();
    const k1b = flipEW(k1a);
    const k2 = pickEW();
    const k3a = pickEW();
    const k3b = Math.random() < 0.5 ? k3a : flipEW(k3a);
    const k3c = flipEW(k3b);
    const k4 = pickEW();

    this.clashAttempts = [
      {
        title: 'HEAVEN-SPLITTING DESCENT',
        keys: [k1a, k1b],
        durations: [1.25, 0.64],
        styles: ['overhead_crush', 'follow_down']
      },
      {
        title: 'GRAVEFALL',
        keys: [k2],
        durations: [1.10],
        styles: ['overhead_crush']
      },
      {
        title: 'ECLIPSE REND',
        keys: [k3a, k3b, k3c],
        durations: [1.00, 0.60, 0.60],
        styles: ['slash_left', 'slash_right', 'follow_down']
      },
      {
        title: 'SOVEREIGN EXTINCTION',
        keys: [k4],
        durations: [1.40],
        styles: ['extinction_drive']
      }
    ];

    // Flatten into sequential beat descriptors while keeping future attempts hidden in the UI!
    this.clashBeats = [];
    this.clashBeatDetails = [];
    for (let aIdx = 0; aIdx < this.clashAttempts.length; aIdx++) {
      const att = this.clashAttempts[aIdx];
      for (let sIdx = 0; sIdx < att.keys.length; sIdx++) {
        this.clashBeats.push(att.keys[sIdx]);
        this.clashBeatDetails.push({
          key: att.keys[sIdx],
          dur: att.durations[sIdx],
          attemptIdx: aIdx,
          subIdx: sIdx,
          attemptLen: att.keys.length,
          title: att.title,
          style: att.styles[sIdx]
        });
      }
    }

    this.clashBeatIndex = 0;
    this.clashBeatTimer = 0;
    this.clashBeatDuration = this.clashBeatDetails[0].dur;
    this.clashAttemptIndex = 0;
    this.clashSubHitIndex = 0;
    this.clashCurrentStyle = this.clashBeatDetails[0].style;
    this.clashLastParryFlash = 0;
    this.clashLastResult = null;
    this.clashLastResultTimer = 0;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.targetX = this.x;
    this.targetY = this.y;

    if (boss) {
      boss.clashAttemptIndex = 0;
      boss.clashSubHitIndex = 0;
      boss.clashCurrentStyle = this.clashCurrentStyle;
      boss.clashSubProgress = 0;
    }
  }

  clearClashRhythmQte() {
    this.clashQteActive = false;
    this.clashBeats = [];
    this.clashBeatDetails = [];
    this.clashAttempts = [];
    this.clashBeatIndex = 0;
    this.clashBeatTimer = 0;
    this.clashAttemptIndex = 0;
    this.clashSubHitIndex = 0;
    if (this.state === 'clash_lock') {
      this.state = 'idle';
      this.stateTimer = 0;
      this.swordScale = 1.0;
    }
  }

  handleClashRhythmKey(keyChar, boss = null) {
    if (!this.clashQteActive || this.hp <= 0) return false;
    const k = String(keyChar || '').toUpperCase();
    // Rhythm QTE strictly uses [E] and [W]!
    if (k !== 'E' && k !== 'W') return false;

    const expected = this.clashBeats[this.clashBeatIndex];
    const curDetail = (this.clashBeatDetails && this.clashBeatDetails[this.clashBeatIndex]) || null;
    const prog = this.clashBeatTimer / Math.max(0.1, this.clashBeatDuration);

    // Vaelgor's opening swing is pure spectacle: key mashing while it plays is ignored, never punished.
    if (boss && boss.clashIntroT > 0) return true;

    // The blade connects at CLASH_CONTACT_PROG (0.80); chained follow-up swings are shorter so open earlier.
    const minWindow = (curDetail && curDetail.subIdx > 0) ? 0.42 : 0.50;
    if (k === expected && prog >= minWindow && prog <= 0.995) {
      const isPerfect = prog >= 0.68 && prog <= 0.92;
      const completedDetail = curDetail;
      this.clashBeatIndex++;
      this.clashBeatTimer = 0;
      this.clashLastParryFlash = 0.26;
      this.clashLastResult = isPerfect ? 'PERFECT PARRY!' : 'CLASH HOLD!';
      this.clashLastResultTimer = 0.52;

      const nextDetail = (this.clashBeatDetails && this.clashBeatDetails[this.clashBeatIndex]) || null;
      if (nextDetail) {
        this.clashBeatDuration = nextDetail.dur;
        this.clashAttemptIndex = nextDetail.attemptIdx;
        this.clashSubHitIndex = nextDetail.subIdx;
        this.clashCurrentStyle = nextDetail.style;
      }

      if (window.audio) {
        if (typeof window.audio.playQteKeySound === 'function') {
          window.audio.playQteKeySound(true, this.clashBeatIndex + 1);
        }
        window.audio.playParryClang(true);
      }

      if (boss && typeof boss.onClashBeatProgress === 'function') {
        boss.onClashBeatProgress(
          this,
          this.clashBeatIndex,
          false,
          nextDetail ? nextDetail.attemptIdx : 3,
          nextDetail ? nextDetail.subIdx : 0,
          completedDetail ? completedDetail.style : 'overhead_crush',
          nextDetail ? nextDetail.style : 'extinction_drive'
        );
      }

      if (this.clashBeatIndex >= this.clashBeats.length) {
        this.clearClashRhythmQte();
        if (boss && typeof boss.completeFinalClashSuccess === 'function') {
          boss.completeFinalClashSuccess(false);
        }
      }
      return true;
    }

    // Wrong key ([E] vs [W]) or pressed way too early -> QTE Failed -> Boss completes slam and wipes party!
    if (window.audio && typeof window.audio.playQteKeySound === 'function') {
      window.audio.playQteKeySound(false, 0);
    }
    this.clashLastResult = 'GUARD BROKEN!';
    this.clashLastResultTimer = 0.9;
    this.clearClashRhythmQte();
    if (boss && typeof boss.executeFinalClashWipe === 'function') {
      boss.executeFinalClashWipe(false);
    }
    return true;
  }

  updateClashRhythmQte(dt, boss = null) {
    if (this.clashLastResultTimer > 0) {
      this.clashLastResultTimer = Math.max(0, this.clashLastResultTimer - dt);
    }
    if (this.clashLastParryFlash > 0) {
      this.clashLastParryFlash = Math.max(0, this.clashLastParryFlash - dt);
    }
    if (!this.clashQteActive) return;
    // Only the clashing player's own client times the beats. A remote proxy only mirrors clashQteActive from
    // player_state and never had its beat chart started, so timing it here would fire a bogus MISSED -> party wipe.
    if (this.isRemote) return;

    if (!boss || boss.state !== 'final_clash_mechanic' || boss.clashPhase !== 'active_clash') {
      this.clearClashRhythmQte();
      return;
    }

    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.targetX = this.x;
    this.targetY = this.y;

    // Hold the beat chart while Vaelgor plays his opening swing; the boss counts the intro down on every client.
    if (boss.clashIntroT > 0) {
      this.clashBeatTimer = 0;
      boss.clashSubProgress = 0;
      return;
    }

    this.clashBeatTimer += dt;
    const prog = this.clashBeatTimer / Math.max(0.1, this.clashBeatDuration);
    const curDetail = (this.clashBeatDetails && this.clashBeatDetails[this.clashBeatIndex]) || null;
    if (curDetail) {
      this.clashAttemptIndex = curDetail.attemptIdx;
      this.clashSubHitIndex = curDetail.subIdx;
      this.clashCurrentStyle = curDetail.style;
      boss.clashAttemptIndex = curDetail.attemptIdx;
      boss.clashSubHitIndex = curDetail.subIdx;
      boss.clashCurrentStyle = curDetail.style;
      boss.clashSubProgress = Math.max(0, Math.min(1, prog));
    }

    // If an AI bot caught the Clash, the bot executes the [E]/[W] rhythm combos in the sweet spot!
    if (this.isBot && prog >= 0.70 && this.clashBeats[this.clashBeatIndex]) {
      this.handleClashRhythmKey(this.clashBeats[this.clashBeatIndex], boss);
      return;
    }

    // Missed the rhythm beat timeout -> Clash QTE Failed -> Boss completes slam!
    if (this.clashBeatTimer >= this.clashBeatDuration) {
      if (window.audio && typeof window.audio.playQteKeySound === 'function') {
        window.audio.playQteKeySound(false, 0);
      }
      this.clashLastResult = 'MISSED!';
      this.clashLastResultTimer = 0.9;
      this.clearClashRhythmQte();
      if (boss && typeof boss.executeFinalClashWipe === 'function') {
        boss.executeFinalClashWipe(false);
      }
    }
  }
}

function installClashQte(Cls) {
  for (const name of Object.getOwnPropertyNames(ClashQteMethods.prototype)) {
    if (name === 'constructor') continue;
    Object.defineProperty(Cls.prototype, name, Object.getOwnPropertyDescriptor(ClashQteMethods.prototype, name));
  }
}

// Rescue for classes that never opted in: patch the instance's class and init its state on demand.
function ensureClashCapable(player) {
  if (!player) return false;
  if (typeof player.startClashRhythmQte !== 'function') {
    installClashQte(Object.getPrototypeOf(player).constructor);
  }
  if (!Array.isArray(player.clashBeats)) initClashQteState(player);
  return true;
}