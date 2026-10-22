// =========================================================================
// CRAFTING_VINDICTUS.JS — Pure Vindictus Boss Material & Token Exchange Forge
// NO +15 Enhancement or Enchant Scrolls!
// Features:
//  - 10% Drop Chance for "Vaelgor's Abyssal Essence" on Raid Clear
//  - 100% Guaranteed Drop of 1 "Vaelgor's Eclipse Seal (Token)" per Raid Clear
//  - Token Exchange: Redeem 5 Eclipse Seals -> 1 Vaelgor's Abyssal Essence
//  - Distinct 2.5D Greatsword Models ('warden_steel', 'vaelgor_obsidian', 'black_sun_sovereign')
// =========================================================================

const VINDICTUS_RECIPES = [
  {
    id: 'wpn_eclipse_claymore',
    slot: 'weapon',
    name: 'Vaelgor\'s Obsidian Claymore',
    tier: 'Tier 2 • Abyssal Boss Greatsword',
    weaponModelId: 'vaelgor_obsidian',
    baseAtk: 220,
    critBonus: 0.12,
    atkSpeedBonus: 0.08,
    weaponColor: '#f43f5e',
    weaponGlow: '#e11d48',
    desc: 'A colossal jagged obsidian greatsword with a crimson fuller vein. Changes your Breaker\'s 2.5D weapon model to the Sawtooth Obsidian Claymore.',
    costGold: 1000,
    materials: {
      vaelgor_essence: 1,
      obsidian_shard: 4
    }
  },
  {
    id: 'wpn_sovereign_zweihander',
    slot: 'weapon',
    name: 'Sovereign\'s Black Sun Zweihander',
    tier: 'Tier 3 • Legion Raid Mythic Greatsword',
    weaponModelId: 'black_sun_sovereign',
    baseAtk: 340,
    critBonus: 0.22,
    atkSpeedBonus: 0.15,
    weaponColor: '#c084fc',
    weaponGlow: '#9333ea',
    desc: 'The ultimate Relic Greatsword of the Black Sun with a floating Eclipse Halo crossguard. Changes your Breaker\'s 2.5D weapon model to the Black Sun Zweihander.',
    costGold: 2500,
    materials: {
      vaelgor_essence: 2,
      obsidian_shard: 8,
      pauldron_fragment: 2
    }
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
    desc: 'Pitch-black Gothic dreadplate forged from Vaelgor\'s shattered pauldron and essence. Visually changes your Breaker\'s armor to Crimson-Trimmed Obsidian Plate.',
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
    tier: 'Tier 3 • Legion Raid Mythic Plate',
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
  }
];

class VindictusForgeSystem {
  constructor() {
    this.storageKey = 'newtry1_vindictus_pure_save_v2';
    this.state = {
      gold: 2000,
      clears: 0,
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
  }

  getEquippedWeapon() {
    return this.state.inventory.find(i => i.slot === 'weapon' && i.equipped) || this.state.inventory[0];
  }

  getEquippedArmor() {
    return this.state.inventory.find(i => i.slot === 'armor' && i.equipped);
  }

  applyEquipmentToPlayer(player) {
    if (!player) return;
    const wpn = this.getEquippedWeapon();
    const arm = this.getEquippedArmor();

    if (wpn) {
      player.baseAtk = wpn.baseAtk;
      player.bonusAtk = 0;
      player.critRate = 0.25 + (wpn.critBonus || 0);
      player.atkSpeedMult = 1.0 + (wpn.atkSpeedBonus || 0);
      player.weaponModelId = wpn.weaponModelId || 'warden_steel';
      player.weaponColor = wpn.weaponColor || '#38bdf8';
      player.weaponGlow = wpn.weaponGlow || '#0284c7';
    }

    if (arm) {
      player.maxHp = 2000 + (arm.bonusHp || 0);
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
        // 22% Bounty Roll: +1 Pauldron Fragment + 900 Bonus Gold + 2 Shards
        loot.pauldron_fragment += 1;
        loot.gold += 900;
        loot.obsidian_shard += 2;
        loot.bonusCores.push({
          source: coreLabel,
          tier: 'GILDED CORE',
          color: '#38bdf8',
          rewardText: '+1 Pauldron Fragment, +2 Shards & +900G'
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

  canCraftRecipe(recipe) {
    if (this.state.gold < recipe.costGold) return false;
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

    this.state.gold -= recipe.costGold;
    for (const [mat, req] of Object.entries(recipe.materials)) {
      this.state.materials[mat] -= req;
    }

    this.state.inventory.forEach(item => {
      if (item.slot === recipe.slot) item.equipped = false;
    });

    const newItem = {
      uid: 'item_' + Date.now() + '_' + Math.floor(Math.random() * 999),
      recipeId: recipe.id,
      slot: recipe.slot,
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

    this.state.inventory.push(newItem);
    this.save();
    audio.playForgeAnvil(true);
    return {
      ok: true,
      item: newItem,
      msg: `🔨 Forged & Equipped: ${newItem.name}! Your 2.5D Greatsword/Armor model has been updated!`
    };
  }

  equipItem(uid) {
    const target = this.state.inventory.find(i => i.uid === uid);
    if (!target) return;
    this.state.inventory.forEach(i => {
      if (i.slot === target.slot) i.equipped = (i.uid === uid);
    });
    this.save();
    audio.playForgeAnvil(true);
  }
}

window.VINDICTUS_RECIPES = VINDICTUS_RECIPES;
window.VindictusForgeSystem = VindictusForgeSystem;
