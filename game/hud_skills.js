// =========================================================================
// HUD_SKILLS.JS — Class-driven skill bar: QWER over ASDF, [T] off to the side, a class "identity" widget for [Z]
// above them, and hover tooltips (name, description, Stagger / Destructive / Counter tags).
//
// A class plugs in by registering metadata:   window.SKILL_META.<classId> = { identity:{...}, passive:{...}, skills:{ q:{...}, ... } }
// and the Game calls SkillHud.build(player) whenever the local class changes. Slot / cooldown element ids stay
// `slot-<key>` / `cd-<key>` so the realtime HUD loop in main.js keeps working unchanged.
// =========================================================================

window.SKILL_META = window.SKILL_META || {};

// FRONT / BACK skills. Matched by hit name (the names in the damage chart) inside Breaker's dealHitToBoss.
//   front: lands from the boss's front -> +35% damage and +45% stagger, and (if strong) can crack the pauldrons. Neutral from any other side. The hit must also be flagged `head`.
//   back:  lands from behind -> +25% damage, +backCrit crit chance, +15% stagger. Back hits never crack pauldrons. Neutral from any other side.
//   Every other hit is neutral from any side. baseBonus is a flat damage bonus on EVERY hit (replaces the old always-on front/back bonus).
window.HIT_POSITION = {
  baseBonus: 1.06,
  backCrit: 0.30,
  front: /^(Earthbreaker|Bedrock Uppercut|Empowered Titan|Titan's Wrath)|Charge Smash|^Bonk|Abyss Cataclysm Detonation|Zenith Dive|Convergence Burst|Overcharge Flare|Blade Storm|Solar Cannon Finale/,
  back: /Reaping Arc|Spin Stomp|Lethal Spin|Eclipse Harvest|Harvest Slam|Maw Lunge|Lance Shot|Cross Slash/
};

// stagger: 'none' | 'low' | 'medium' | 'high'.  destructive: can break boss parts.  counter: counters blue boss flashes.
window.SKILL_META.breaker = {
  title: 'BREAKER',
  identity: { name: 'Overpower Surge', icon: '🔥', key: 'Z', kind: 'breaker_gauge' },
  passive: {
    name: 'Armor Fracture',
    desc: 'Heavy hits ([W] [A] [S] [D]) lay Fracture on the boss (max 3). Each new stack feeds your Overpower gauge, and [F] Titan\'s Wrath detonates them for +35% damage per stack and refunds Overpower. During Surge, hits lay 2 stacks and detonations deal +50% per stack.'
  },
  skills: {
    q: { name: 'Spin Lunge', icon: '🌀', short: 'Spin', stagger: 'medium', destructive: true, counter: false, cd: '5.5s',
         desc: 'Lunge into a full-body whirlwind and finish with a weighty slam. Ends in a shoulder-rest pose and trims [W] and [A] cooldowns by 1.5s.' },
    w: { name: 'Earthbreaker', icon: '☄️', short: 'Leap', stagger: 'high', destructive: true, counter: false, position: 'front', cd: '9s',
         desc: 'Parabolic leap that ruptures the ground on landing. Instantly ready after [A] Iron Tackle.' },
    e: { name: 'Bulwark Parry', icon: '🛡️', short: 'Parry', stagger: 'none', destructive: false, counter: false, cd: '7s',
         desc: 'Brace the greatsword. Parrying an attack refreshes and empowers [F] and refunds half of this cooldown.' },
    r: { name: 'Crescent Wave', icon: '🌙', short: 'Crescent', stagger: 'high', destructive: true, counter: false, cd: '10s',
         desc: 'Hold to charge a getsuga-style wave. Release inside the sweet spot for a perfect, larger wave.' },
    a: { name: 'Iron Tackle', icon: '🐗', short: 'Tackle', stagger: 'high', destructive: true, counter: false, cd: '7s',
         desc: 'Supersonic shoulder rush. Refreshes [W] and primes it for +25% damage.' },
    s: { name: 'Bedrock Uppercut', icon: '⚡', short: 'Uppercut', stagger: 'medium', destructive: true, counter: false, position: 'front', cd: '8s',
         desc: 'Drag the blade through the bedrock into a heavenward uppercut.' },
    d: { name: 'Counter Cleave', icon: '💠', short: 'Counter', stagger: 'high', destructive: true, counter: true, cd: '8s',
         desc: 'Counters blue-flash boss patterns for a massive stagger chunk. A successful counter refunds half the cooldown.' },
    f: { name: "Titan's Wrath", icon: '🌋', short: 'Wrath', stagger: 'high', destructive: true, counter: false, position: 'front', cd: '14s',
         desc: 'Colossal overhead slam. Instantly refreshed and empowered by a successful [E] parry.' },
    t: { name: 'Omnislash: Extinction Cleave', icon: '⚔️', short: 'Omnislash', stagger: 'high', destructive: true, counter: false, cd: '3m',
         desc: 'Ten-cut cinematic ultimate. Holds the boss in place and leaves a downed window behind.' },
    space: { name: 'Evade Dash', icon: '💨', short: 'Evade', stagger: 'none', destructive: false, counter: false, cd: '5.5s',
         desc: 'Unstoppable dash with full i-frames. Also a wake-up roll when knocked down.' },
    z: { name: 'Overpower Surge', icon: '🔥', short: 'Surge', stagger: 'none', destructive: false, counter: false, cd: '45s',
         desc: 'Spend a full Overpower gauge for 14s of increased damage, speed, cooldown recovery and a shield. Fracture hits lay 2 stacks, detonations hit harder, and every Crescent Wave is a perfect release. Overpower is built by Fracture, parries, counters and your skill chain.' }
  }
};

// the Breaker's skills have painted icons (icons/skill_breaker_<key>.png)
for (const k of ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 't', 'z', 'space']) {
  const sk = window.SKILL_META.breaker.skills[k];
  if (sk) sk.img = 'game/icons/skill_breaker_' + k + '.png';
}
const SKILL_HUD_ROW_1 = ['q', 'w', 'e', 'r'];
const SKILL_HUD_ROW_2 = ['a', 's', 'd', 'f'];

const SkillHud = {
  _tip: null,

  _tag(label, value, cls) {
    return `<span class="tt-tag ${cls}"><i>${label}</i>${value}</span>`;
  },

  _tooltipHtml(key, s) {
    const stag = s.stagger || 'none';
    const stagLabel = stag === 'none' ? '—' : stag.charAt(0).toUpperCase() + stag.slice(1);
    const keyLabel = key === 'space' ? 'SPACE' : key.toUpperCase();
    return `
      <div class="tt-head"><span class="tt-key">${keyLabel}</span><span class="tt-name">${s.name}</span></div>
      <div class="tt-desc">${s.desc}</div>
      ${s.follow ? `<div class="tt-follow"><div class="tt-follow-h">Follow-ups</div>${s.follow.map(l => `<p>${l}</p>`).join('')}</div>` : ''}
      <div class="tt-tags">
        ${this._tag('Stagger', stagLabel, 'stag-' + stag)}
        ${this._tag('Destructive', s.destructive ? 'Yes' : 'No', s.destructive ? 'yes' : 'no')}
        ${this._tag('Counter', s.counter ? 'Yes' : 'No', s.counter ? 'yes counter' : 'no')}
        ${s.position ? this._tag('Position', s.position === 'front' ? 'Front' : 'Back', 'yes') : ''}
      </div>
      ${s.cd ? `<div class="tt-cd">Cooldown: ${s.cd}</div>` : ''}`;
  },

  _slotHtml(key, s, extraClass = '') {
    const keyLabel = key === 'space' ? 'SPC' : key.toUpperCase();
    return `
      <div class="skill-slot ${s.img ? 'has-img ' : ''}${extraClass}" id="slot-${key}" data-skill="${key}" onclick="window.game.useSkill('${key}')">
        <span class="skill-key">${keyLabel}</span>
        <span class="skill-icon">${s.img ? `<img src="${s.img}" alt="" draggable="false">` : s.icon}</span>
        <span class="skill-name">${s.short || s.name}</span>
        <div class="cd-overlay" id="cd-${key}"></div>
      </div>`;
  },

  _identityHtml(meta, player) {
    const z = meta.skills.z;
    if (meta.identity.kind === 'hammer_momentum') {
      return `
        <div class="identity-zone hammer-zone">
          ${this._slotHtml('z', z, 'identity')}
          <div class="momentum-wrap">
            <div class="momentum-title"><span>MOMENTUM</span><span id="mom-hint">Shatter [Z] · Overload [X]</span></div>
            <div class="momentum-pips">
              <div class="mom-pip"><div class="mom-fill" id="mom-fill-0"></div></div>
              <div class="mom-pip"><div class="mom-fill" id="mom-fill-1"></div></div>
              <div class="mom-pip"><div class="mom-fill" id="mom-fill-2"></div></div>
            </div>
            <div class="momentum-status" id="mom-status">Build Momentum with perfect catches, counters and heavy smashes.</div>
          </div>
          <div class="broken-wrap" data-passive="1">
            <div class="broken-title">BROKEN</div>
            <div class="broken-pips"><span id="brk-0"></span><span id="brk-1"></span><span id="brk-2"></span></div>
            <div class="broken-time" id="brk-time">—</div>
          </div>
        </div>`;
    }
    return `
      <div class="identity-zone">
        ${this._slotHtml('z', z, 'identity')}
        <div class="momentum-wrap">
          <div class="res-track">
            <div class="res-fill" id="hud-overpower-fill" style="background:linear-gradient(90deg,#0284c7,#38bdf8);width:0%"></div>
            <div class="res-text" id="hud-overpower-text">OVERPOWER: 0%</div>
          </div>
        </div>
        <div class="broken-wrap fracture-wrap" data-passive="1">
          <div class="broken-title">FRACTURE</div>
          <div class="broken-pips"><span id="frac-0"></span><span id="frac-1"></span><span id="frac-2"></span></div>
        </div>
      </div>`;
  },

  getMeta(player) {
    return window.SKILL_META[(player && player.classId) || 'breaker'] || window.SKILL_META.breaker;
  },

  build(player) {
    const root = document.getElementById('bottom-action-hud');
    if (!root) return;
    const meta = this.getMeta(player);
    const S = meta.skills;
    root.innerHTML = `
      ${this._identityHtml(meta, player)}
      <div class="resource-bars-row">
        <div class="res-track">
          <div class="res-fill hp" id="hud-hp-fill"></div>
          <div class="res-text" id="hud-hp-text">2400 / 2400</div>
        </div>
      </div>
      <div class="skill-layout">
        <div class="skill-grid">
          <div class="skill-bar-row">${SKILL_HUD_ROW_1.map(k => this._slotHtml(k, S[k])).join('')}</div>
          <div class="skill-bar-row">${SKILL_HUD_ROW_2.map(k => this._slotHtml(k, S[k])).join('')}</div>
        </div>
        <div class="skill-side">
          ${this._slotHtml('t', S.t, 'ultimate')}
          ${this._slotHtml('space', S.space, 'small')}
        </div>
      </div>`;
    root.dataset.cls = (player && player.classId) || 'breaker';

    // Tooltips: one shared floating element, positioned above whichever slot is hovered.
    if (!this._tip) {
      this._tip = document.createElement('div');
      this._tip.id = 'skill-tooltip';
      document.body.appendChild(this._tip);
    }
    const tip = this._tip;
    const show = (slot) => {
      const key = slot.dataset.skill;
      const s = S[key];
      if (!s) return;
      tip.innerHTML = this._tooltipHtml(key, s);
      tip.classList.add('show');
      const r = slot.getBoundingClientRect();
      const tw = tip.offsetWidth;
      const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 10)}px`;
    };
    root.querySelectorAll('.skill-slot').forEach(slot => {
      slot.addEventListener('mouseenter', () => show(slot));
      slot.addEventListener('mouseleave', () => tip.classList.remove('show'));
    });
    const passive = root.querySelector('[data-passive]');
    if (passive && meta.passive) {
      passive.addEventListener('mouseenter', () => {
        tip.innerHTML = `
          <div class="tt-head"><span class="tt-key">PASSIVE</span><span class="tt-name">${meta.passive.name}</span></div>
          <div class="tt-desc">${meta.passive.desc}</div>`;
        tip.classList.add('show');
        const r = passive.getBoundingClientRect();
        const tw = tip.offsetWidth;
        tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px`;
        tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 10)}px`;
      });
      passive.addEventListener('mouseleave', () => tip.classList.remove('show'));
    }
  }
};

window.SkillHud = SkillHud;
