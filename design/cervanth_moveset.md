# Cervanth, the Antlered Colossus: moveset by phase

Design doc (rev 4). **BUILT 2026-10-22** (see "As built" at the bottom). Numbers are starting values to tune.

## Decisions so far
- **Gear tier:** same as Vaelgor.
- **HP:** below Hush (241.5k). Starting value **220k**, to tune with the DPS baseline.
- **Loot:** maybe Bone Wings, a Hard-only cosmetic in the wings slot (like Pyre Wings and Moon Mobile). Not final.
- **Karok Clash win:** the Gravebreaker smashes his head into the ground with the hammer.
- **Enrage:** plain enrage, no closing arena. Hard 330s, Normal 570s + 35s per extra human (same as the other bosses). When the timer runs out his damage jumps to 2.2x.
- **Gauge:** none.
- **Audio:** later. No voice. Synth SFX only.
- **Reference art:** looked up (below).

## Rules this follows
- Tells are visual, audio or voice only. No text banners or instructions.
- Action, reaction and teamwork checks only. No logic puzzles, no safe-tile reads.
- Player-facing text says "break damage".
- Normal: a failed mechanic comes back once. Hard: it wipes. Final phase hits 1.5x.
- Everything co-op synced in the same change, scaled for 1 to 4 players, with a solo version of every team mechanic.
- Fire and ember use the anime-flame style (`flame_art.js`), never shiny glow.
- One silent discovery mechanic.
- **Every pattern and mechanic has its own startup**: its own pose, its own sound and its own visual cue. No two share them, and they run at different speeds so they can be told apart even in a crowd.

## Fantasy
A skeletal stag as tall as a house. It hunts the party. Weight, charges, antlers that matter. A crimson ember heart sits in the open ribs. The antlers are the break points.

**Arena:** the Hollow Glade. A round clearing of pale dead trees and bone. His charges crack the floor and the cracks stay.

**Look references** (searched 2026-10-22; results were thin, so I'm using the traits, not copying a design): jagged, asymmetrical, claw-pointed antlers; skeletal anatomy with stretched flesh clinging; blade-like hooves; exposed ribs on a quadruped. The ember heart uses `flame_art.js` flat colour bands. Sources: [Abyssal Stag](https://www.cgtrader.com/3d-models/character/fantasy-character/abyssal-stag), [Nightmarish Stag Abomination](https://marketplace.secondlife.com/p/Nightmarish-Stag-Abomination-Eldritch-Deer-Horror-Creature/27939851), [Undead Hound Pack](https://marketplace.secondlife.com/p/Undead-Hound-Pack-Skeletal-Feral-Horror-Creatures/27939849?lang=ja-JP).

---

## Regular patterns, each with its own startup

| # | Pattern | Startup pose | Startup sound | Startup visual | Speed | Rebuke | Counter |
|---|---------|--------------|---------------|----------------|-------|--------|---------|
| 1 | Antler Sweep | Swings his head away to the far side, antlers drawn back | Three quick bone rattles | Antler tips flicker crimson | Medium (0.7s) | Yes | No |
| 2 | Gore Thrust | Front hoof scrapes twice, body sinks low, head drops | One long metallic scrape per scrape | Dust kicks up; the heart dims | Slow (0.9s) | No (super armor) | Yes, on the last scrape |
| 3 | Hoof Combo | Rocks on his hind legs like a pendulum, front hooves lift in turn | A heavy thud before each stomp | Ribs shake loose bone dust | Medium | First stomp only | No |
| 4 | Tine Rain | Head tilts up, antlers spread wide | A rising run of bone clicks | The tines light up one by one, base to tip, like a crown; each target sees a bone shadow growing under them | Long fuse (1s per target) | No | No |
| 5 | Rear-up Stomp | Full rear on his hind legs, front legs curled, chest open | A deep rumble that climbs | The heart flares white-red | Slow (1.2s) | No | No |
| 6 | Stampede | Paws with alternating hooves, head sweeps left and right as if sighting | A drum roll of hoof beats that speeds up | Cracks race along the lane ahead of him | Slow (1.5s) | No | No |
| 7 | Mantle Lash | Spins his hips away, body turns 90 degrees | A single whip-crack snap | The mantle strips lift and flare | Fast (0.5s) | Yes | No |
| 8 | Hollow Howl | Head arches back, jaw drops wide | A hollow inhale, like wind through a pipe | Dust and the mantle are pulled toward him before the blast | Medium (1.0s) | No | No |
| 9 (P3) | Marrow Spit | Neck coils into an S, ribs heave like a cough | A wet bubbling gurgle | The throat glows crimson | Medium | No | No |

Break points: left antler, right antler (each: snaps off, he flinches, Tine Rain loses half its tines; both = a long stagger). The heart is a third, open only during the 50% mechanic.

**Rebuke table** (per-boss data for `RebukeBoss.install`, `t` = swing progress): Antler Sweep 2 points, Hoof Combo first stomp, Mantle Lash 1 point. Everything else, including every mechanic, is refused automatically.

---

## Phase 1: The Hunt (100% to 70%)
Rotation: Antler Sweep, Gore Thrust, Hoof Combo, one Tine Rain wave, an occasional Stampede. Nothing overlaps, so each startup can be learned alone.

### 75% mechanic: The Hollow Herd (dodge dance)
- **Startup:** he backs to the edge, lowers his head, and a hunting horn blasts. Ghost stags rise from the floor at the arena rim.
- Ghost stags charge across in telegraphed lanes, a few at a time, speeding up. Pure dodge: each lane shows its own pale hoofprints just before its ghost runs. No lane is "the safe one".
- Fail on Normal: the herd runs once more. Hard: wipe. Solo: fewer lanes at once.

## Phase 2: The Rut (70% to 40%)
Chained moves (Gore Thrust into Antler Sweep), two Tine Rain waves, Stampede with narrowing pillars, Hollow Howl paired with Tine Rain. If an antler is broken, the matching tines are gone but Gore Thrust gets an extra lunge.

**Discovery mechanic (silent): the Echo.** About 20 seconds after a Stampede, a pale ghost of the same stampede runs the same lane with no tell. Players learn it; nothing explains it.

### 50% mechanic: Heart Exposed (stagger check)
- **Startup:** he rears, a bell tone sounds, and the ribs split open with a crack that spreads across the floor. The heart pulses in time with a heartbeat that gets louder.
- The team must deal enough break damage to the heart before it closes. A wordless pulse readout fills as they do.
- Success: a long stagger, both antlers brittle. Fail on Normal: a heart-burst wave once. Hard: wipe. Solo: required damage scales to one player.

## Phase 3: The Cage (40% to 15%)
Phase 2 moves, glowing heart-burst cracks as floor hazards, plus Marrow Spit and a reverse follow-up on Antler Sweep.

### 35% mechanic: Cage of Tines (tower soak)
- **Startup:** he slams both antlers into the ground with a deep crunch, the screen shakes, and bone towers grow one after another.
- Each tower needs K players inside or it explodes. K scales: 4 players 1 per tower; 3 players 1 on three towers; 2 players run between towers; solo, the towers fade after one soak.
- Fail on Normal: the explosion hits everyone once and the towers reset. Hard: wipe. Success: his next stagger is longer.

## Phase 4: Last Charge (15% to 0%), final phase at 1.5x
- **Startup:** he roars and the whole floor cracks outward from him; the heart burns brighter.
- He chains Stampedes, each aimed at a different player, with Gore Thrust between them. Tine Rain falls on a steady beat.
- The finale is a last wall crash that stuns him for a long window. No Final Clash.

---

## Karok Clash
- Pattern `pat_antler_lock`, forced by the S taunt. **Startup:** he charges the Karok player, drops his head and locks antlers with a bone-on-steel crack.
- Tug-of-war as in the other bosses (Karok style `antler`, needs lane tell and clash positions).
- **Win:** the Gravebreaker hauls the antlers up, leaps onto his skull and smashes his head into the ground with the hammer. He lies stunned for the usual Karok stagger window. Own animation, not borrowed.

## Class-interaction checklist (ships with the boss)
| Item | Cervanth's version |
|------|--------------------|
| Rebuke | Table above; rebuked pose, shove, glint cue; Careful (5s immune, 10s resistant) |
| Stagger pose | Front knees buckle, head drops to the ground |
| Flinch pose | Head and antlers jerk back |
| Rebuked pose | Head snaps up and away |
| Broken-part pose | Antler snaps and spins off, white flash, shard burst |
| Blue-flash counter | Gore Thrust, last scrape, Vaelgor's blue chest ring |
| Holds / Unbound toss | Allowed outside mechanics, he stays in his normal stagger pose; holds bounce off during mechanics |
| Co-op | Pattern start with target ids and seed; Herd lane order; Echo timing; tower positions and soak counts; antler and heart break progress; phase gates; Stampede lane and wall stun; Karok lock state; `rebuke_request` / `rebuke`; Careful in `boss_sync` |

## Files
`boss_cervanth.js`, `boss_cervanth_pats.js` (patterns, rebuke table), `boss_cervanth_rig.js` (quadruped rig from the preview), `boss_cervanth_stage.js` (Hollow Glade, telegraphs), plus raid_select entry, loot hooks, Bone Wings art, changelog and version bump.

## Still open
1. Bone Wings: confirm, and Hard-only like the others?
2. The 220k HP number.
3. Music, later.


---

## As built (2026-10-22)

Files: `game/boss_cervanth.js` (logic, 4 mechanics, Karok smash), `boss_cervanth_pats.js` (9 patterns, rebuke table), `boss_cervanth_rig.js` (quadruped rig and every pose), `boss_cervanth_stage.js` (Hollow Glade, telegraphs, ghosts, towers, effects). Wired into `index.html`, `main.js` (raid pick, banner), `raid_select.js` (menu entry and preview), `network_coop.js` (raid id, `cervanth_*` events), `difficulty.js`, `crafting_vindictus.js` (loot), `karok_clash.js` and `hammer_25d.js` (the `smash` clash style and the hammer pose).

Differences from the plan:
- **Hollow Herd** has no fail state of its own: every ghost hits hard (440 on Normal, 560 on Hard), so a bad read means being hit, not a retry or wipe. It ends after the last wave and gives the usual mechanic shield.
- **Heart Exposed and Cage of Tines** follow the standard rule: Normal blasts the party and comes back once about 20s later; Hard wipes. Verified.
- **Cage of Tines** towers: solo 2, two players 3, three or four players 4 (ripening staggered so a small party can hop between them).
- **HP** 220,000 (x1.85 per extra player, like the others). Enrage Hard 5:30, Normal from `difficulty.js`; damage x2.2 after.
- **Loot** is Vaelgor's table without the Eclipse Wings. **Bone Wings are not built yet** (they need a shared wings drawing and an armory entry).
- **Echo** is host-rolled and broadcast as `cervanth_echo`; every client runs the ghost.
- **Audio**: all synth (`CervanthBoss.SFX`). No music files and no voice yet.
- Also fixed: the victory screen's title always said Vaelgor; it now names the boss that fell.

Verified in the browser (solo, stepped by hand): every pattern's startup and hit, all four mechanics (success and Normal/Hard fail), final phase and double stampede, the Echo, antler breaks, Rebuke, counter window, the Karok clash start to finish with a Gravebreaker, intro, death and loot, and a simulated guest client. Not verified: a real two-machine co-op fight, Hard-mode feel and balance, and any of it by ear (the sounds are synth and unheard by me).
