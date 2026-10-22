// =========================================================================
// CRAFTING_VINDICTUS.JS — Pure Vindictus Boss Material & Token Exchange Forge
// NO +15 Enhancement or Enchant Scrolls!
// Features:
//  - 10% Drop Chance for "Vaelgor's Abyssal Essence" on Raid Clear
//  - 100% Guaranteed Drop of 1 "Vaelgor's Eclipse Seal (Token)" per Raid Clear
//  - Token Exchange: Redeem 5 Eclipse Seals -> 1 Vaelgor's Abyssal Essence
//  - Distinct 2.5D Greatsword Models ('warden_steel', 'vaelgor_obsidian', 'black_sun_sovereign')
// =========================================================================

// Chance that Vaelgor's death burst includes an Abyssal Essence core. Lower this to make Essence rarer.
const ESSENCE_DROP_CHANCE = 0.075;   // chance EACH core has to be the Abyssal Essence on Hard (Normal is half). First hit wins; a player gets at most 1 Essence per run.
// Normal difficulty: the chance one of its 3 cores is an Eclipse Seal, and how much of the Hard Essence chance it keeps.
const NORMAL_TOKEN_CHANCE = 0.40;
const NORMAL_ESSENCE_FACTOR = 0.5;
const WINGS_DROP_CHANCE = 0.01;    // chance per clear that one of the cores is the Eclipse Wings (cosmetic, once per character)
const ACC_DROP_CHANCE = 0.06;      // chance EACH filler core has to be an accessory on Hard (Normal is half). At most ACC_DROP_MAX accessories per clear.
const ACC_DROP_MAX = 2;
const KEEPER_DOUBLE_SEAL = 0.5;    // Keeper's Ring: chance a Seal core holds 2 Seals
const FORTUNE_ESSENCE_BONUS = 0.025;   // Fortune's Eye: added to the per-core Essence chance
const FORTUNE_ACC_FACTOR = 1.25;       // Fortune's Eye: multiplies the per-core accessory chance

const VINDICTUS_RECIPES = [
  {
    id: 'wpn_eclipse_claymore',
    slot: 'weapon',
    classId: 'breaker',
    name: 'Vaelgor\'s Obsidian Claymore',
    tier: 'Tier 2 • Abyssal Boss Greatsword',
    weaponModelId: 'vaelgor_obsidian',
    baseAtk: 220,
    critBonus: 0.12,
    atkSpeedBonus: 0.08,
    weaponColor: '#f43f5e',
    weaponGlow: '#e11d48',
    desc: 'A colossal jagged obsidian greatsword with a crimson fuller vein.',
    costGold: 1000,
    materials: {
      vaelgor_essence: 1,
      obsidian_shard: 4
    }
  },
  {
    id: 'wpn_sovereign_zweihander',
    slot: 'weapon',
    classId: 'breaker',
    name: 'Sovereign\'s Black Sun Zweihander',
    tier: 'Tier 3 • Chalice Raid Mythic Greatsword',
    weaponModelId: 'black_sun_sovereign',
    baseAtk: 340,
    critBonus: 0.22,
    atkSpeedBonus: 0.15,
    weaponColor: '#c084fc',
    weaponGlow: '#9333ea',
    desc: 'The ultimate Relic Greatsword of the Black Sun with a floating Eclipse Halo crossguard.',
    costGold: 2500,
    materials: {
      vaelgor_essence: 2,
      obsidian_shard: 8,
      pauldron_fragment: 2
    }
  },
  // ---- Gravebreaker (charge hammer) weapons: same tiers, their own models (see HAMMER_LOOKS in hammer_25d.js) ----
  {
    id: 'wpn_hammer_obsidian_maul',
    slot: 'weapon',
    classId: 'hammer',
    name: 'Vaelgor\'s Obsidian Maul',
    tier: 'Tier 2 • Abyssal Boss Hammer',
    weaponModelId: 'hammer_obsidian',
    baseAtk: 220,
    critBonus: 0.12,
    atkSpeedBonus: 0.08,
    weaponColor: '#f43f5e',
    weaponGlow: '#e11d48',
    desc: 'A slab of black volcanic glass with a bleeding crimson vein and jagged teeth along its rim.',
    costGold: 1000,
    materials: {
      vaelgor_essence: 1,
      obsidian_shard: 4
    }
  },
  {
    id: 'wpn_hammer_sovereign_wrecker',
    slot: 'weapon',
    classId: 'hammer',
    name: 'Sovereign\'s Black Sun Wrecker',
    tier: 'Tier 3 • Chalice Raid Mythic Hammer',
    weaponModelId: 'hammer_sovereign',
    baseAtk: 340,
    critBonus: 0.22,
    atkSpeedBonus: 0.15,
    weaponColor: '#c084fc',
    weaponGlow: '#9333ea',
    desc: 'A void-and-gold crown of a hammer with a burning Eclipse halo orbiting its head.',
    costGold: 2500,
    materials: {
      vaelgor_essence: 2,
      obsidian_shard: 8,
      pauldron_fragment: 2
    }
  },
  // ---- Reaper (chain scythe) weapons: same tiers, their own models (see SCYTHE in reaper_rig.js) ----
  {
    id: 'wpn_reaper_obsidian_scythe',
    slot: 'weapon',
    classId: 'reaper',
    name: 'Vaelgor\'s Obsidian Reaver',
    tier: 'Tier 2 • Abyssal Boss Scythe',
    weaponModelId: 'scythe_obsidian',
    baseAtk: 220,
    critBonus: 0.12,
    atkSpeedBonus: 0.08,
    weaponColor: '#f43f5e',
    weaponGlow: '#e11d48',
    desc: 'A serrated blade of black glass with crimson veins, on a spiked chain.',
    costGold: 1000,
    materials: {
      vaelgor_essence: 1,
      obsidian_shard: 4
    }
  },
  {
    id: 'wpn_reaper_sovereign_scythe',
    slot: 'weapon',
    classId: 'reaper',
    name: 'Sovereign\'s Black Sun Harvester',
    tier: 'Tier 3 • Chalice Raid Mythic Scythe',
    weaponModelId: 'scythe_sovereign',
    baseAtk: 340,
    critBonus: 0.22,
    atkSpeedBonus: 0.15,
    weaponColor: '#c084fc',
    weaponGlow: '#9333ea',
    desc: 'A void-and-gold crescent on a golden chain, an Eclipse ring burning around the blade.',
    costGold: 2500,
    materials: {
      vaelgor_essence: 2,
      obsidian_shard: 8,
      pauldron_fragment: 2
    }
  },
  // ---- Arclight (laser saber / beam cannon) weapons: same tiers, their own models (see SABER in arclight_rig.js) ----
  {
    id: 'wpn_arclight_photon_saber',
    slot: 'weapon',
    classId: 'arclight',
    name: 'Vaelgor\'s Photon Saber',
    tier: 'Tier 2 • Abyssal Boss Saber',
    weaponModelId: 'arc_photon',
    baseAtk: 220,
    critBonus: 0.12,
    atkSpeedBonus: 0.08,
    weaponColor: '#a78bfa',
    weaponGlow: '#8b5cf6',
    desc: 'Black wrist emitters projecting crackling violet blades.',
    costGold: 1000,
    materials: {
      vaelgor_essence: 1,
      obsidian_shard: 4
    }
  },
  {
    id: 'wpn_arclight_sovereign_saber',
    slot: 'weapon',
    classId: 'arclight',
    name: 'Sovereign\'s Black Sun Lightblade',
    tier: 'Tier 3 • Chalice Raid Mythic Saber',
    weaponModelId: 'arc_sovereign',
    baseAtk: 340,
    critBonus: 0.22,
    atkSpeedBonus: 0.15,
    weaponColor: '#f9a8d4',
    weaponGlow: '#f472b6',
    desc: 'Pearl-and-gold emitters projecting broad blades of rose-gold light with a halo riding them.',
    costGold: 2500,
    materials: {
      vaelgor_essence: 2,
      obsidian_shard: 8,
      pauldron_fragment: 2
    }
  },
  // ---- Unbound (limiter bracers) weapons: same tiers, their own models (see CUFF in unbound_rig.js) ----
  {
    id: 'wpn_unbound_abyss_limiters',
    slot: 'weapon',
    classId: 'unbound',
    name: 'Vaelgor\'s Obsidian Limiters',
    tier: 'Tier 2 • Abyssal Boss Bracers',
    weaponModelId: 'brc_abyss',
    baseAtk: 220,
    critBonus: 0.12,
    atkSpeedBonus: 0.08,
    weaponColor: '#fda4af',
    weaponGlow: '#e11d48',
    desc: 'Black glass cuffs veined with crimson. They were never made to hold anything back.',
    costGold: 1000,
    materials: {
      vaelgor_essence: 1,
      obsidian_shard: 4
    }
  },
  {
    id: 'wpn_unbound_sovereign_shackles',
    slot: 'weapon',
    classId: 'unbound',
    name: 'Sovereign\'s Black Sun Shackles',
    tier: 'Tier 3 • Chalice Raid Mythic Bracers',
    weaponModelId: 'brc_sovereign',
    baseAtk: 340,
    critBonus: 0.22,
    atkSpeedBonus: 0.15,
    weaponColor: '#fde68a',
    weaponGlow: '#a78bfa',
    desc: 'Void-black bands edged in gold and violet. The cracks keep spreading.',
    costGold: 2500,
    materials: {
      vaelgor_essence: 2,
      obsidian_shard: 8,
      pauldron_fragment: 2
    }
  },
  // ---- Tier 4: the Lullaby arms, from Hush (the solo raid). Each is forged FROM that class's Tier 3 weapon (consumed; a third of
  // its enhancement carries over) plus her materials. Porcelain white, Delft blue, gold kintsugi seams. ----
  {
    id: 'wpn_lullaby_greatsword', slot: 'weapon', classId: 'breaker', name: 'Lullaby Greatsword', tier: 'Tier 4 • Sealed Nursery Greatsword',
    weaponModelId: 'lullaby_porcelain', baseAtk: 400, critBonus: 0.26, atkSpeedBonus: 0.17, weaponColor: '#e0e7ff', weaponGlow: '#f5c542',
    desc: 'A porcelain blade mended with gold. Its fuller hums a lullaby when it cuts.', costGold: 4000, source: 'Hush drops',
    consumes: 'wpn_sovereign_zweihander', materials: { music_box_heart: 2, porcelain_shard: 10, lullaby_thread: 4 }
  },
  {
    id: 'wpn_hammer_lullaby', slot: 'weapon', classId: 'hammer', name: 'Lullaby Music-Box Maul', tier: 'Tier 4 • Sealed Nursery Hammer',
    weaponModelId: 'hammer_lullaby', baseAtk: 400, critBonus: 0.26, atkSpeedBonus: 0.17, weaponColor: '#e0e7ff', weaponGlow: '#f5c542',
    desc: 'A music box the size of an anvil, glazed white and blue, its brass key still turning.', costGold: 4000, source: 'Hush drops',
    consumes: 'wpn_hammer_sovereign_wrecker', materials: { music_box_heart: 2, porcelain_shard: 10, lullaby_thread: 4 }
  },
  {
    id: 'wpn_reaper_lullaby', slot: 'weapon', classId: 'reaper', name: 'Lullaby Needle-Scythe', tier: 'Tier 4 • Sealed Nursery Scythe',
    weaponModelId: 'scythe_lullaby', baseAtk: 400, critBonus: 0.26, atkSpeedBonus: 0.17, weaponColor: '#e0e7ff', weaponGlow: '#f5c542',
    desc: 'A crescent of porcelain on a chain of silver thread, cracked and mended in gold.', costGold: 4000, source: 'Hush drops',
    consumes: 'wpn_reaper_sovereign_scythe', materials: { music_box_heart: 2, porcelain_shard: 10, lullaby_thread: 4 }
  },
  {
    id: 'wpn_arclight_lullaby', slot: 'weapon', classId: 'arclight', name: 'Lullaby Moonblade', tier: 'Tier 4 • Sealed Nursery Saber',
    weaponModelId: 'arc_lullaby', baseAtk: 400, critBonus: 0.26, atkSpeedBonus: 0.17, weaponColor: '#c7d2fe', weaponGlow: '#f5c542',
    desc: 'Porcelain emitters projecting pale moonlight blades with a gold edge.', costGold: 4000, source: 'Hush drops',
    consumes: 'wpn_arclight_sovereign_saber', materials: { music_box_heart: 2, porcelain_shard: 10, lullaby_thread: 4 }
  },
  {
    id: 'wpn_unbound_lullaby', slot: 'weapon', classId: 'unbound', name: 'Lullaby Mended Cuffs', tier: 'Tier 4 • Sealed Nursery Bracers',
    weaponModelId: 'brc_lullaby', baseAtk: 400, critBonus: 0.26, atkSpeedBonus: 0.17, weaponColor: '#e0e7ff', weaponGlow: '#f5c542',
    desc: 'White porcelain bands, broken and mended in gold more times than anyone can count.', costGold: 4000, source: 'Hush drops',
    consumes: 'wpn_unbound_sovereign_shackles', materials: { music_box_heart: 2, porcelain_shard: 10, lullaby_thread: 4 }
  },
  {
    id: 'arm_eclipse_cuirass',
    slot: 'armor',
    name: 'Obsidian Eclipse Dreadplate Set',
    tier: 'Tier 2 • Abyssal Heavy Plate',
    bonusHp: 1200,
    bonusDef: 140,
    armorTint: '#090b10',
    trimColor: '#f43f5e',
    desc: 'Pitch-black Gothic dreadplate forged from Vaelgor\'s shattered pauldron and essence.',
    costGold: 1200,
    materials: {
      vaelgor_essence: 1,
      obsidian_shard: 5,
      pauldron_fragment: 1
    }
  },
  {
    id: 'arm_sovereign_plate',
    slot: 'armor',
    name: 'Sovereign\'s Astral Warplate Set',
    tier: 'Tier 3 • Chalice Raid Mythic Plate',
    bonusHp: 2200,
    bonusDef: 240,
    armorTint: '#2e1065',
    trimColor: '#fde047',
    desc: 'Regal Void-and-Gold Warplate worn by conquerors of the Eclipse Cathedral.',
    costGold: 2400,
    materials: {
      vaelgor_essence: 2,
      obsidian_shard: 8,
      pauldron_fragment: 2
    }
  },

  // ---- accessories: 2 rings, 1 necklace, 1 charm worn at a time. Each has one passive (see passives.js); you can own as many of each as you like,
  // but wearing the same passive twice does not stack. They also drop from Vaelgor's death burst (see rollBurstLoot). ----
  {
    id: 'acc_ember_signet', slot: 'ring', passive: 'ember_signet', name: 'Ember Signet', tier: 'Tier 2 • Vaelgor Ring', color: '#fb923c',
    desc: 'Clearing a mechanic also gives you an extra shield worth 15% of your health.',
    costGold: 800, materials: { vaelgor_seal: 3, obsidian_shard: 4 }
  },
  {
    id: 'acc_wrathstone_ring', slot: 'ring', passive: 'wrathstone', name: 'Wrathstone Ring', tier: 'Tier 2 • Vaelgor Ring', color: '#f43f5e',
    desc: 'Your class gauge fills 20% faster.',
    costGold: 1200, materials: { obsidian_shard: 6, pauldron_fragment: 2 }
  },
  {
    id: 'acc_keepers_ring', slot: 'ring', passive: 'keepers_ring', name: 'Keeper\'s Ring', tier: 'Tier 2 • Vaelgor Ring', color: '#38bdf8',
    desc: 'Eclipse Seal cores have a 50% chance to hold 2 Seals.',
    costGold: 600, materials: { vaelgor_seal: 5 }
  },
  {
    id: 'acc_quarry_ring', slot: 'ring', passive: 'quarry_ring', name: 'Quarry Ring', tier: 'Tier 2 • Vaelgor Ring', color: '#f97316',
    desc: 'Your hits deal 20% more break damage (the damage that breaks boss parts).',
    costGold: 1000, materials: { pauldron_fragment: 3, obsidian_shard: 4 }
  },
  {
    id: 'acc_finishers_ring', slot: 'ring', passive: 'finishers_ring', name: 'Finisher\'s Ring', tier: 'Tier 2 • Vaelgor Ring', color: '#ef4444',
    desc: 'You deal 12% more damage while the boss is below 35% health.',
    costGold: 1500, materials: { obsidian_shard: 6, vaelgor_seal: 2 }
  },
  {
    id: 'acc_adrenaline_band', slot: 'ring', passive: 'adrenaline_band', name: 'Adrenaline Band', tier: 'Tier 3 • Vaelgor Ring', color: '#22d3ee',
    desc: 'Every skill you use builds Adrenaline (up to 6 stacks, lasting 7s): +2% damage per stack, and +10% crit chance at 6 stacks.',
    costGold: 2000, materials: { pauldron_fragment: 4, obsidian_shard: 6, vaelgor_seal: 2 }
  },
  {
    id: 'acc_warding_torc', slot: 'necklace', passive: 'warding_torc', name: 'Warding Torc', tier: 'Tier 3 • Vaelgor Necklace', color: '#a78bfa',
    desc: 'While you have a shield up, you take 10% less damage.',
    costGold: 1800, materials: { vaelgor_essence: 1, obsidian_shard: 6 }
  },
  {
    id: 'acc_breakpoint_chain', slot: 'necklace', passive: 'breakpoint', name: 'Breakpoint Chain', tier: 'Tier 3 • Vaelgor Necklace', color: '#facc15',
    desc: 'Your hits deal 12% more stagger damage.',
    costGold: 1400, materials: { pauldron_fragment: 4, obsidian_shard: 8 }
  },
  {
    id: 'acc_second_wind_locket', slot: 'necklace', passive: 'second_wind', name: 'Second Wind Locket', tier: 'Tier 3 • Vaelgor Necklace', color: '#4ade80',
    desc: 'Once per fight, a hit that would kill you leaves you at 1 health and untouchable for 2.5s. It cannot stop instant-wipe mechanics.',
    costGold: 2200, materials: { vaelgor_essence: 1, pauldron_fragment: 3 }
  },
  {
    id: 'acc_shatterpoint_pendant', slot: 'necklace', passive: 'shatterpoint', name: 'Shatterpoint Pendant', tier: 'Tier 3 • Vaelgor Necklace', color: '#e879f9',
    desc: 'When the boss is staggered, you gain 8s of +10% damage and +10% cooldown recovery.',
    costGold: 1600, materials: { pauldron_fragment: 4, obsidian_shard: 6 }
  },
  {
    id: 'acc_gilders_charm', slot: 'charm', passive: 'gilders_charm', name: 'Gilder\'s Charm', tier: 'Tier 2 • Vaelgor Charm', color: '#fde047',
    desc: 'Gold cores pay out 50% more.',
    costGold: 2500, materials: { vaelgor_seal: 2 }
  },
  {
    id: 'acc_menders_sigil', slot: 'charm', passive: 'menders_sigil', name: 'Mender\'s Sigil', tier: 'Tier 2 • Vaelgor Charm', color: '#86efac',
    desc: 'When a boss part breaks, you heal 10% of your max health.',
    costGold: 1800, materials: { vaelgor_seal: 2, pauldron_fragment: 3 }
  },
  {
    id: 'acc_fortunes_eye', slot: 'charm', passive: 'fortunes_eye', name: 'Fortune\'s Eye', tier: 'Tier 3 • Vaelgor Charm', color: '#a3e635',
    desc: 'Every core has +25% accessory drop chance and +2.5% chance to be an Abyssal Essence.',
    costGold: 3000, materials: { vaelgor_essence: 1, vaelgor_seal: 3 }
  }
];
window.ACC_SLOTS = { ring: 2, necklace: 1, charm: 1 };

class VindictusForgeSystem {
  constructor(storageKey) {
    this.storageKey = storageKey || 'newtry1_vindictus_pure_save_v2';
    this.state = {
      gold: 2000,
      clears: 0,
      cosmetics: { owned: {}, wings: null },   // wings: the id currently worn
      cleared: {},           // difficulties this character has cleared at least once ({ normal, hard })
      materials: {
        vaelgor_seal: 3,       // Guaranteed Token drop (5 Seals = 1 Essence!)
        vaelgor_essence: 0,    // 10% Rare Drop from Vaelgor (or redeemed via 5 Seals)
        obsidian_shard: 5,     // Common drop from Vaelgor
        pauldron_fragment: 1   // Vindictus Part-Break bonus drop
      },
      inventory: [
        {
          uid: 'starter_warden_gs',
          recipeId: 'starter',
          slot: 'weapon',
          name: 'Azure Warden Slab-Greatsword',
          tier: 'Tier 1 • Vanguard Standard Issue',
          weaponModelId: 'warden_steel',
          baseAtk: 140,
          critBonus: 0.05,
          atkSpeedBonus: 0.0,
          weaponColor: '#38bdf8',
          weaponGlow: '#0284c7',
          classId: 'breaker',
          equipped: true
        },
        {
          uid: 'starter_gravebreaker_slab',
          recipeId: 'starter_hammer',
          slot: 'weapon',
          classId: 'hammer',
          name: 'Gravebreaker\'s Iron Slab',
          tier: 'Tier 1 • Vanguard Standard Issue',
          weaponModelId: 'hammer_slab',
          baseAtk: 140,
          critBonus: 0.05,
          atkSpeedBonus: 0.0,
          weaponColor: '#fb923c',
          weaponGlow: '#ea580c',
          equipped: true
        },
        {
          uid: 'starter_reaper_scythe',
          recipeId: 'starter_reaper',
          slot: 'weapon',
          classId: 'reaper',
          name: 'Bonewrapped Chain Scythe',
          tier: 'Tier 1 • Vanguard Standard Issue',
          weaponModelId: 'scythe_bone',
          baseAtk: 140,
          critBonus: 0.05,
          atkSpeedBonus: 0.0,
          weaponColor: '#e11d48',
          weaponGlow: '#7f1d1d',
          equipped: true
        },
        {
          uid: 'starter_arclight_saber',
          recipeId: 'starter_arclight',
          slot: 'weapon',
          classId: 'arclight',
          name: 'Prototype Laser Saber',
          tier: 'Tier 1 • Vanguard Standard Issue',
          weaponModelId: 'arc_prototype',
          baseAtk: 140,
          critBonus: 0.05,
          atkSpeedBonus: 0.0,
          weaponColor: '#38bdf8',
          weaponGlow: '#0ea5e9',
          equipped: true
        },
        {
          uid: 'starter_unbound_cuffs',
          recipeId: 'starter_unbound',
          slot: 'weapon',
          classId: 'unbound',
          name: 'Plain Limiter Cuffs',
          tier: 'Tier 1 • Vanguard Standard Issue',
          weaponModelId: 'brc_iron',
          baseAtk: 140,
          critBonus: 0.05,
          atkSpeedBonus: 0.0,
          weaponColor: '#cbd5e1',
          weaponGlow: '#94a3b8',
          equipped: true
        },
        {
          uid: 'starter_warden_plate',
          recipeId: 'starter_arm',
          slot: 'armor',
          name: 'Vanguard Heavy Half-Plate',
          tier: 'Tier 1 • Vanguard Standard Issue',
          bonusHp: 600,
          bonusDef: 60,
          armorTint: '#1e293b',
          trimColor: '#fbbf24',
          equipped: true
        }
      ]
    };
    this.load();
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {}
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.materials && parsed.inventory) {
          this.state = parsed;
        }
      }
    } catch (e) {}
    this.migrate();
  }

  // Older saves predate per-class weapons: tag every weapon with its class and make sure the Gravebreaker has a starter hammer.
  migrate() {
    const inv = this.state.inventory;
    if (!this.state.cosmetics) this.state.cosmetics = { owned: {}, wings: null };
    for (const it of inv) {
      if (it.slot === 'weapon' && !it.classId) {
        const rec = VINDICTUS_RECIPES.find(r => r.id === it.recipeId);
        it.classId = (rec && rec.classId) || 'breaker';
      }
    }
    if (!inv.some(i => i.slot === 'weapon' && i.classId === 'hammer')) {
      inv.push({
        uid: 'starter_gravebreaker_slab', recipeId: 'starter_hammer', slot: 'weapon', classId: 'hammer',
        name: 'Gravebreaker\'s Iron Slab', tier: 'Tier 1 • Vanguard Standard Issue', weaponModelId: 'hammer_slab',
        baseAtk: 140, critBonus: 0.05, atkSpeedBonus: 0.0, weaponColor: '#fb923c', weaponGlow: '#ea580c', equipped: true
      });
    }
    if (!inv.some(i => i.slot === 'weapon' && i.classId === 'reaper')) {
      inv.push({
        uid: 'starter_reaper_scythe', recipeId: 'starter_reaper', slot: 'weapon', classId: 'reaper',
        name: 'Bonewrapped Chain Scythe', tier: 'Tier 1 • Vanguard Standard Issue', weaponModelId: 'scythe_bone',
        baseAtk: 140, critBonus: 0.05, atkSpeedBonus: 0.0, weaponColor: '#e11d48', weaponGlow: '#7f1d1d', equipped: true
      });
    }
    if (!inv.some(i => i.slot === 'weapon' && i.classId === 'arclight')) {
      inv.push({
        uid: 'starter_arclight_saber', recipeId: 'starter_arclight', slot: 'weapon', classId: 'arclight',
        name: 'Prototype Laser Saber', tier: 'Tier 1 • Vanguard Standard Issue', weaponModelId: 'arc_prototype',
        baseAtk: 140, critBonus: 0.05, atkSpeedBonus: 0.0, weaponColor: '#38bdf8', weaponGlow: '#0ea5e9', equipped: true
      });
    }
    if (!inv.some(i => i.slot === 'weapon' && i.classId === 'unbound')) {
      inv.push({
        uid: 'starter_unbound_cuffs', recipeId: 'starter_unbound', slot: 'weapon', classId: 'unbound',
        name: 'Plain Limiter Cuffs', tier: 'Tier 1 • Vanguard Standard Issue', weaponModelId: 'brc_iron',
        baseAtk: 140, critBonus: 0.05, atkSpeedBonus: 0.0, weaponColor: '#cbd5e1', weaponGlow: '#94a3b8', equipped: true
      });
    }
    // exactly one equipped weapon per class
    for (const cls of ['breaker', 'hammer', 'reaper', 'arclight', 'unbound']) {
      const ws = inv.filter(i => i.slot === 'weapon' && i.classId === cls);
      if (ws.length && !ws.some(w => w.equipped)) ws[0].equipped = true;
    }
  }

  getEquippedWeapon(classId = 'breaker') {
    const ws = this.state.inventory.filter(i => i.slot === 'weapon' && (i.classId || 'breaker') === classId);
    return ws.find(i => i.equipped) || ws[0] || this.state.inventory[0];
  }

  getEquippedAccessories() {
    return this.state.inventory.filter(i => (i.slot === 'ring' || i.slot === 'necklace' || i.slot === 'charm') && i.equipped);
  }

  hasPassive(id) {
    return this.getEquippedAccessories().some(a => a.passive === id);
  }

  getEquippedArmor() {
    return this.state.inventory.find(i => i.slot === 'armor' && i.equipped);
  }

  applyEquipmentToPlayer(player) {
    if (!player) return;
    const wpn = this.getEquippedWeapon(player.classId || 'breaker');
    const arm = this.getEquippedArmor();

    if (wpn) {
      player.baseAtk = wpn.baseAtk;
      player.bonusAtk = 0;
      player.critRate = 0.20 + (wpn.critBonus || 0);
      player.atkSpeedMult = 1.0 + (wpn.atkSpeedBonus || 0);
      player.weaponModelId = wpn.weaponModelId || 'warden_steel';
      player.weaponColor = wpn.weaponColor || '#38bdf8';
      player.weaponGlow = wpn.weaponGlow || '#0284c7';
    }

    const armTier = arm ? ((/Tier\s*(\d)/i.exec(arm.tier || '') || [0, 1])[1] | 0) : 1;
    if (typeof player.setArmorTier === 'function') player.setArmorTier(armTier);
    player.passives = {};
    for (const a of this.getEquippedAccessories()) player.passives[a.passive] = true;
    player.wings = (this.state.cosmetics && this.state.cosmetics.wings) || null;

    if (arm) {
      player.maxHp = Math.round((2000 + (arm.bonusHp || 0)) * (player.hpScale || 1));   // the Reaper trades max HP for the Umbral Shield
      player.hp = Math.min(player.maxHp, player.hp || player.maxHp);
      player.bonusDef = arm.bonusDef || 60;
      player.armorTint = arm.armorTint || '#1e293b';
      player.trimColor = arm.trimColor || '#fbbf24';
    }
  }

  // =========================================================================
  // VINDICTUS RAID CLEAR LOOT ROLL + DUAL PAULDRON BONUS CORES:
  // - Base Clear: +1 Vaelgor's Eclipse Seal, 10% Abyssal Essence, 3-4 Shards
  // - Part-Break Bonus Cores: Breaking Left Pauldron (+1 Core) & Right Pauldron (+1 Core)
  //   Each Bonus Core rolls a randomized reward table at the end of the raid!
  // =========================================================================
  grantRaidClearLoot(leftPauldronBroken = false, rightPauldronBroken = false) {
    this.state.clears = (this.state.clears || 0) + 1;

    // 10% chance to drop Vaelgor's Abyssal Essence on the base clear
    const essenceRoll = Math.random();
    const droppedEssence = essenceRoll < 0.10 ? 1 : 0;

    const loot = {
      gold: 1200,
      vaelgor_seal: 1, // Base guaranteed Token
      vaelgor_essence: droppedEssence,
      essenceRollPct: Math.round(essenceRoll * 100),
      obsidian_shard: 3 + Math.floor(Math.random() * 2),
      pauldron_fragment: 0,
      bonusCores: []
    };

    const brokenSides = [];
    if (leftPauldronBroken) brokenSides.push('LEFT PAULDRON CORE');
    if (rightPauldronBroken) brokenSides.push('RIGHT PAULDRON CORE');

    for (const coreLabel of brokenSides) {
      const r = Math.random();
      if (r < 0.18) {
        // 18% Jackpot Roll: Mythic Abyssal Essence + 1 Pauldron Fragment!
        loot.vaelgor_essence += 1;
        loot.pauldron_fragment += 1;
        loot.bonusCores.push({
          source: coreLabel,
          tier: 'MYTHIC JACKPOT',
          color: '#f43f5e',
          rewardText: '+1 Abyssal Essence & +1 Pauldron Fragment'
        });
      } else if (r < 0.50) {
        // 32% High Roll: +1 Bonus Eclipse Seal + 1 Pauldron Fragment
        loot.vaelgor_seal += 1;
        loot.pauldron_fragment += 1;
        loot.bonusCores.push({
          source: coreLabel,
          tier: 'ECLIPSE CORE',
          color: '#c084fc',
          rewardText: '+1 Eclipse Seal & +1 Pauldron Fragment'
        });
      } else if (r < 0.78) {
        // 28% Forging Roll: +2 Pauldron Fragments + 3 Obsidian Shards
        loot.pauldron_fragment += 2;
        loot.obsidian_shard += 3;
        loot.bonusCores.push({
          source: coreLabel,
          tier: 'ARMORSMITH CORE',
          color: '#fbbf24',
          rewardText: '+2 Pauldron Fragments & +3 Obsidian Shards'
        });
      } else {
        // 22% Bounty Roll: +1 Pauldron Fragment + 1800 Bonus Gold + 2 Shards
        loot.pauldron_fragment += 1;
        loot.gold += 1800;
        loot.obsidian_shard += 2;
        loot.bonusCores.push({
          source: coreLabel,
          tier: 'GILDED CORE',
          color: '#38bdf8',
          rewardText: '+1 Pauldron Fragment, +2 Shards & +1800G'
        });
      }
    }

    this.state.gold += loot.gold;
    this.state.materials.vaelgor_seal = (this.state.materials.vaelgor_seal || 0) + loot.vaelgor_seal;
    this.state.materials.vaelgor_essence = (this.state.materials.vaelgor_essence || 0) + loot.vaelgor_essence;
    this.state.materials.obsidian_shard = (this.state.materials.obsidian_shard || 0) + loot.obsidian_shard;
    this.state.materials.pauldron_fragment = (this.state.materials.pauldron_fragment || 0) + loot.pauldron_fragment;

    this.save();
    return loot;
  }

  // =========================================================================
  // CORE DROPS (see cores.js). Break cores fall during the fight; the boss bursts into more when it dies. Each
  // core carries a reward that is applied when its OWNER walks over it.
  // =========================================================================
  // Returns true when this is the character's first clear on that difficulty (which pays out bonus cores).
  registerClear(mode = 'normal') {
    this.state.clears = (this.state.clears || 0) + 1;
    const done = this.state.cleared || (this.state.cleared = {});
    const first = !done[mode];
    done[mode] = true;
    this.save();
    return first;
  }

  // A pauldron-break core. Rolled when the pauldron breaks so every player can see its rarity colour.
  rollBreakCore(source, noEssence = false, raid = 'vaelgor') {
    let r = Math.random();
    if (raid === 'hush') {
      // her key / mask cores: the jackpot is a Music-Box Heart
      if (noEssence && r < 0.18) r = 0.18 + Math.random() * 0.32;
      if (r < 0.18) return { source, tier: 'MYTHIC JACKPOT', color: '#f5c542', rewardText: '+1 Music-Box Heart & +1 Lullaby Thread', rewards: { music_box_heart: 1, lullaby_thread: 1 } };
      if (r < 0.50) return { source, tier: 'LULLABY CORE', color: '#f472b6', rewardText: '+2 Lullaby Thread', rewards: { lullaby_thread: 2 } };
      if (r < 0.78) return { source, tier: 'PORCELAIN CORE', color: '#e0e7ff', rewardText: '+1 Lullaby Thread & +3 Porcelain Shards', rewards: { lullaby_thread: 1, porcelain_shard: 3 } };
      return { source, tier: 'GILDED CORE', color: '#38bdf8', rewardText: '+1 Lullaby Thread, +2 Shards & +1800G', rewards: { lullaby_thread: 1, gold: 1800, porcelain_shard: 2 } };
    }
    if (noEssence && r < 0.18) r = 0.18 + Math.random() * 0.32;     // this run already has its one Essence: a would-be Mythic becomes an Eclipse Core
    if (r < 0.18) {
      return { source, tier: 'MYTHIC JACKPOT', color: '#f43f5e', rewardText: '+1 Abyssal Essence & +1 Pauldron Fragment', rewards: { vaelgor_essence: 1, pauldron_fragment: 1 } };
    } else if (r < 0.50) {
      return { source, tier: 'ECLIPSE CORE', color: '#c084fc', rewardText: '+1 Eclipse Seal & +1 Pauldron Fragment', rewards: { vaelgor_seal: 1, pauldron_fragment: 1 } };
    } else if (r < 0.78) {
      return { source, tier: 'ARMORSMITH CORE', color: '#fbbf24', rewardText: '+2 Pauldron Fragments & +3 Obsidian Shards', rewards: { pauldron_fragment: 2, obsidian_shard: 3 } };
    }
    return { source, tier: 'GILDED CORE', color: '#38bdf8', rewardText: '+1 Pauldron Fragment, +2 Shards & +1800G', rewards: { pauldron_fragment: 1, gold: 1800, obsidian_shard: 2 } };
  }

  // What the boss bursts into on death: one core per reward. The essence core exists only if the roll hits.
  // Every core looks the same until it is picked up; what is inside is rolled per core. One core is always the guaranteed
  // Eclipse Seal token, the Essence core only exists if the essence roll hits, and the rest are random fillers.
  //   HARD   6 cores, the Eclipse Seal is guaranteed (pauldron breaks add up to 2 more, see cores.js)
  //   NORMAL 3 cores, no guaranteed seal (NORMAL_TOKEN_CHANCE to get one), Essence at NORMAL_ESSENCE_FACTOR of the Hard odds
  // raid: which boss died. Ignis shares Vaelgor's loot (same tier) but her rare cosmetic is her own Pyre Wings, Hard only.
  rollBurstLoot(mode = 'hard', extra = 0, noEssence = false, raid = 'vaelgor') {
    if (raid === 'hush') return this.rollHushBurst(mode, extra, noEssence);
    const hard = mode !== 'normal';
    const wingsCore = raid === 'ignis'
      ? (hard ? { kind: 'pyre_wings', rewards: { cosmetic_pyre_wings: 1 } } : null)
      : (raid === 'cervanth' ? (hard ? { kind: 'bone_wings', rewards: { cosmetic_bone_wings: 1 } } : null) : { kind: 'wings', rewards: { cosmetic_eclipse_wings: 1 } });
    const cores = [];
    const total = (hard ? 6 : 3) + extra;                         // extra = first-clear bonus cores
    // Keeper's Ring: a Seal core has a 50% chance to hold 2 Seals
    if (hard || Math.random() < NORMAL_TOKEN_CHANCE) cores.push({ kind: 'seal', rewards: { vaelgor_seal: (this.hasPassive('keepers_ring') && Math.random() < KEEPER_DOUBLE_SEAL) ? 2 : 1 } });
    // Rare drops are checked core by core (the seal core never carries one). EVERY core has ESSENCE_DROP_CHANCE (halved on Normal) to be
    // the Abyssal Essence, but the first core to hit takes it and no other core can, so a clear gives at most one Essence. noEssence is set
    // when a pauldron core already gave this player their Essence this run (one per player per run). The Eclipse Wings stay about
    // WINGS_DROP_CHANCE per clear (spread over the cores, also at most one).
    const rollable = Math.max(1, total - cores.length);
    // Fortune's Eye: +2.5% Essence chance and x1.25 accessory chance on every core
    const eye = this.hasPassive('fortunes_eye');
    const perEssence = (ESSENCE_DROP_CHANCE + (eye ? FORTUNE_ESSENCE_BONUS : 0)) * (hard ? 1 : NORMAL_ESSENCE_FACTOR);
    const perAcc = ACC_DROP_CHANCE * (eye ? FORTUNE_ACC_FACTOR : 1) * (hard ? 1 : NORMAL_ESSENCE_FACTOR);
    const perWings = 1 - Math.pow(1 - WINGS_DROP_CHANCE, 1 / rollable);
    let essenceDropped = !!noEssence, wingsDropped = false, accDropped = 0;
    const hadEssence = essenceDropped;
    const accPool = VINDICTUS_RECIPES.filter(r => r.slot === 'ring' || r.slot === 'necklace' || r.slot === 'charm');
    while (cores.length < total) {
      if (!essenceDropped && Math.random() < perEssence) { cores.push({ kind: 'essence', rewards: { vaelgor_essence: 1 } }); essenceDropped = true; continue; }
      if (wingsCore && !wingsDropped && Math.random() < perWings) { cores.push({ kind: wingsCore.kind, rewards: Object.assign({}, wingsCore.rewards) }); wingsDropped = true; continue; }
      // an accessory: a random one, with a rarity from the drop table (never Common). At most ACC_DROP_MAX per clear.
      if (accDropped < ACC_DROP_MAX && window.Accessories && accPool.length && Math.random() < perAcc) {
        const recipe = accPool[Math.floor(Math.random() * accPool.length)];
        const roll = window.Accessories.rollDrop();
        const R = window.Accessories.rarityOf(roll);
        cores.push({ kind: 'accessory', essence: R.id === 'legendary', color: R.color, rewards: { accessory: { recipeId: recipe.id, rarity: roll.rarity, lines: roll.lines } } });
        accDropped++;
        continue;
      }
      const r = Math.random();
      if (r < 0.5) {
        const g = 300 + Math.floor(Math.random() * 6) * 100;     // 300-800 gold
        cores.push({ kind: 'gold', rewards: { gold: g } });
      } else if (r < 0.9) {
        cores.push({ kind: 'shard', rewards: { obsidian_shard: 1 + Math.floor(Math.random() * 2) } });
      } else {
        cores.push({ kind: 'fragment', rewards: { pauldron_fragment: 1 } });
      }
    }
    for (let i = cores.length - 1; i > 0; i--) {                    // shuffle: position says nothing about contents
      const j = Math.floor(Math.random() * (i + 1));
      [cores[i], cores[j]] = [cores[j], cores[i]];
    }
    return { cores, essenceRollPct: null, essenceDropped: essenceDropped && !hadEssence };
  }

  // Hush (solo): her own table. One core is her Lullaby Thread (guaranteed on Hard), the Music-Box Heart is the rare key material
  // (same odds as the Abyssal Essence, at most one per run), the Moon Mobile is her Hard-only cosmetic, and the rest are gold,
  // Porcelain Shards and the odd thread. Accessories drop from the same shared pool.
  rollHushBurst(mode = 'hard', extra = 0, noHeart = false) {
    const hard = mode !== 'normal';
    const cores = [];
    const total = (hard ? 6 : 3) + extra;
    if (hard || Math.random() < NORMAL_TOKEN_CHANCE) cores.push({ kind: 'thread', rewards: { lullaby_thread: 1 } });
    const rollable = Math.max(1, total - cores.length);
    const eye = this.hasPassive('fortunes_eye');
    const perHeart = (ESSENCE_DROP_CHANCE + (eye ? FORTUNE_ESSENCE_BONUS : 0)) * (hard ? 1 : NORMAL_ESSENCE_FACTOR);
    const perAcc = ACC_DROP_CHANCE * (eye ? FORTUNE_ACC_FACTOR : 1) * (hard ? 1 : NORMAL_ESSENCE_FACTOR);
    const perMobile = hard ? 1 - Math.pow(1 - WINGS_DROP_CHANCE, 1 / rollable) : 0;
    let heart = !!noHeart, mobile = false, accDropped = 0;
    const hadHeart = heart;
    const accPool = VINDICTUS_RECIPES.filter(r => r.slot === 'ring' || r.slot === 'necklace' || r.slot === 'charm');
    while (cores.length < total) {
      if (!heart && Math.random() < perHeart) { cores.push({ kind: 'heart', rewards: { music_box_heart: 1 } }); heart = true; continue; }
      if (!mobile && Math.random() < perMobile) { cores.push({ kind: 'moon_mobile', rewards: { cosmetic_moon_mobile: 1 } }); mobile = true; continue; }
      if (accDropped < ACC_DROP_MAX && window.Accessories && accPool.length && Math.random() < perAcc) {
        const recipe = accPool[Math.floor(Math.random() * accPool.length)];
        const roll = window.Accessories.rollDrop();
        const R = window.Accessories.rarityOf(roll);
        cores.push({ kind: 'accessory', essence: R.id === 'legendary', color: R.color, rewards: { accessory: { recipeId: recipe.id, rarity: roll.rarity, lines: roll.lines } } });
        accDropped++;
        continue;
      }
      const r = Math.random();
      if (r < 0.45) cores.push({ kind: 'gold', rewards: { gold: 300 + Math.floor(Math.random() * 6) * 100 } });
      else if (r < 0.88) cores.push({ kind: 'porcelain', rewards: { porcelain_shard: 1 + Math.floor(Math.random() * 2) } });
      else cores.push({ kind: 'thread', rewards: { lullaby_thread: 1 } });
    }
    for (let i = cores.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cores[i], cores[j]] = [cores[j], cores[i]]; }
    return { cores, essenceRollPct: null, essenceDropped: heart && !hadHeart };
  }

  applyRewards(rewards) {
    const m = this.state.materials;
    for (const [k, v] of Object.entries(rewards || {})) {
      if (k === 'accessory') this.addAccessory(v);
      else if (k === 'gold') this.state.gold += v;
      else if (k === 'cosmetic_eclipse_wings' || k === 'cosmetic_pyre_wings' || k === 'cosmetic_bone_wings' || k === 'cosmetic_moon_mobile') {
        const id = k.slice('cosmetic_'.length);
        const c = this.state.cosmetics || (this.state.cosmetics = { owned: {}, wings: null });
        if (c.owned[id]) this.state.gold += 5000;      // a second pair is worth gold instead
        else { c.owned[id] = true; if (!c.wings) c.wings = id; }
      } else m[k] = (m[k] || 0) + v;
    }
    this.save();
  }

  // A dropped accessory: { recipeId, rarity, lines } goes straight to the inventory (not worn).
  addAccessory(spec) {
    const recipe = VINDICTUS_RECIPES.find(r => r.id === (spec && spec.recipeId));
    if (!recipe) return null;
    const item = {
      uid: 'item_' + Date.now() + '_' + Math.floor(Math.random() * 99999), recipeId: recipe.id, slot: recipe.slot, name: recipe.name,
      tier: recipe.tier, passive: recipe.passive, desc: recipe.desc, color: recipe.color, equipped: false,
      rarity: spec.rarity || 'uncommon', lines: (spec.lines || []).map(l => ({ id: l.id, v: l.v }))
    };
    this.state.inventory.push(item);
    this.save();
    return item;
  }

  // =========================================================================
  // TOKEN PITY EXCHANGE: Redeem 5 Vaelgor's Eclipse Seals -> 1 Abyssal Essence!
  // =========================================================================
  redeemSealsForEssence() {
    const haveSeals = this.state.materials.vaelgor_seal || 0;
    if (haveSeals < 5) {
      audio.playForgeAnvil(false);
      return {
        ok: false,
        msg: `Requires 5 Vaelgor's Eclipse Seals to redeem 1 Abyssal Essence! (You currently have ${haveSeals}/5 Seals)`
      };
    }

    this.state.materials.vaelgor_seal -= 5;
    this.state.materials.vaelgor_essence = (this.state.materials.vaelgor_essence || 0) + 1;
    this.save();
    audio.playForgeAnvil(true);
    return {
      ok: true,
      msg: `✨ Redeemed 5 Eclipse Seals for +1 Vaelgor's Abyssal Essence!`
    };
  }

  // the Tier 3 weapon a Tier 4 recipe is forged from (the equipped one if it is that, otherwise the best-enhanced copy)
  consumedItemFor(recipe) {
    if (!recipe || !recipe.consumes) return null;
    const c = this.state.inventory.filter(i => i.recipeId === recipe.consumes);
    return c.find(i => i.equipped) || c.sort((a, b) => (b.enh || 0) - (a.enh || 0))[0] || null;
  }

  canCraftRecipe(recipe) {
    if (this.state.gold < recipe.costGold) return false;
    if (recipe.consumes && !this.consumedItemFor(recipe)) return false;
    for (const [mat, req] of Object.entries(recipe.materials)) {
      if ((this.state.materials[mat] || 0) < req) return false;
    }
    return true;
  }

  craftRecipe(recipeId) {
    const recipe = VINDICTUS_RECIPES.find(r => r.id === recipeId);
    if (!recipe || !this.canCraftRecipe(recipe)) {
      audio.playForgeAnvil(false);
      return { ok: false, msg: 'Insufficient Boss Materials or Gold!' };
    }

    const isAcc = recipe.slot === 'ring' || recipe.slot === 'necklace' || recipe.slot === 'charm';
    this.state.gold -= recipe.costGold;
    for (const [mat, req] of Object.entries(recipe.materials)) {
      this.state.materials[mat] -= req;
    }
    if (isAcc) {
      const acc = { uid: 'item_' + Date.now() + '_' + Math.floor(Math.random() * 999), recipeId: recipe.id, slot: recipe.slot, name: recipe.name, tier: recipe.tier, passive: recipe.passive, desc: recipe.desc, color: recipe.color, equipped: false };
      this.state.inventory.push(acc);
      this.equipItem(acc.uid);
      return { ok: true, item: acc, msg: 'Forged ' + acc.name + '. ' + acc.desc };
    }

    // Upgrading a weapon to a higher tier keeps a third of its enhancement (rounded down): a +15 Tier 2 becomes a +5 Tier 3.
    // It carries from the weapon of that class you have equipped right now; the old weapon itself is left untouched.
    const tierNum = (t) => { const m = /Tier\s*(\d)/.exec(t || ''); return m ? +m[1] : 1; };
    let carriedEnh = 0;
    const base = this.consumedItemFor(recipe);
    if (base) {
      // forged FROM the Tier 3 weapon: it is used up, and a third of its enhancement carries over
      carriedEnh = Math.floor((base.enh || 0) / 3);
      this.state.inventory = this.state.inventory.filter(i => i !== base);
    } else if (recipe.slot === 'weapon') {
      const cls = recipe.classId || 'breaker';
      const old = this.state.inventory.find(i => i.slot === 'weapon' && i.equipped && (i.classId || 'breaker') === cls);
      if (old && tierNum(old.tier) < tierNum(recipe.tier)) carriedEnh = Math.floor((old.enh || 0) / 3);
    }

    this.state.inventory.forEach(item => {
      if (item.slot === recipe.slot && (recipe.slot !== 'weapon' || (item.classId || 'breaker') === (recipe.classId || 'breaker'))) item.equipped = false;
    });

    const newItem = {
      uid: 'item_' + Date.now() + '_' + Math.floor(Math.random() * 999),
      recipeId: recipe.id,
      slot: recipe.slot,
      classId: recipe.slot === 'weapon' ? (recipe.classId || 'breaker') : undefined,
      name: recipe.name,
      tier: recipe.tier,
      weaponModelId: recipe.weaponModelId || 'vaelgor_obsidian',
      baseAtk: recipe.baseAtk || 0,
      critBonus: recipe.critBonus || 0,
      atkSpeedBonus: recipe.atkSpeedBonus || 0,
      bonusHp: recipe.bonusHp || 0,
      bonusDef: recipe.bonusDef || 0,
      weaponColor: recipe.weaponColor || '#f43f5e',
      weaponGlow: recipe.weaponGlow || '#e11d48',
      armorTint: recipe.armorTint || '#090b10',
      trimColor: recipe.trimColor || '#f43f5e',
      equipped: true
    };
    if (carriedEnh > 0) { newItem.enh = carriedEnh; newItem.pity = 0; }

    this.state.inventory.push(newItem);
    this.save();
    audio.playForgeAnvil(true);
    return {
      ok: true,
      item: newItem,
      msg: `🔨 Forged & Equipped: ${newItem.name}${carriedEnh ? ` +${carriedEnh} (a third of your old weapon's enhancement carried over)` : ''}!`
    };
  }

  equipItem(uid) {
    const target = this.state.inventory.find(i => i.uid === uid);
    if (!target) return;
    if (target.slot === 'ring' || target.slot === 'necklace' || target.slot === 'charm') {
      // accessories toggle; a full slot gives up its oldest piece
      if (target.equipped) { target.equipped = false; this.save(); return; }
      const limit = (window.ACC_SLOTS && window.ACC_SLOTS[target.slot]) || 1;
      const worn = this.state.inventory.filter(i => i.slot === target.slot && i.equipped);
      while (worn.length >= limit) worn.shift().equipped = false;
      target.equipped = true;
      this.save();
      try { audio.playForgeAnvil(true); } catch (e) {}
      return;
    }
    this.state.inventory.forEach(i => {
      // weapons are per class: equipping a hammer never unequips the Breaker's sword
      const sameGroup = i.slot === target.slot && (i.slot !== 'weapon' || (i.classId || 'breaker') === (target.classId || 'breaker'));
      if (sameGroup) i.equipped = (i.uid === uid);
    });
    this.save();
    audio.playForgeAnvil(true);
  }

  equipWings(id) {
    const c = this.state.cosmetics || (this.state.cosmetics = { owned: {}, wings: null });
    if (id && !c.owned[id]) return false;
    c.wings = id || null;
    this.save();
    return true;
  }
}
window.VINDICTUS_RECIPES = VINDICTUS_RECIPES;
window.VindictusForgeSystem = VindictusForgeSystem;
