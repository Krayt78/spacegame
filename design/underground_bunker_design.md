# Underground Bunker — Building Design Spec

## Nexus Protocol — New Building Type

---

## Concept

The **Underground Bunker** is a defensive building that protects a fixed amount of each resource from being plundered during raids. Resources stored in the bunker are automatically hidden — players don't need to manually deposit them. When an attacker wins a raid, they can only steal from resources *above* the bunker's protection threshold.

This is a staple mechanic in strategy games and is essential before implementing the combat/raid system.

---

## Research: How Other Games Handle This

### Travian — "Cranny"

| Aspect | Details |
|--------|---------|
| Max level | 10 |
| Protection at Lv1 | 200 of each resource (×4 types = 800 total) |
| Protection at Lv10 | 2,000 of each resource (8,000 total) |
| Scaling | ~linear (200 → 2,000 over 10 levels) |
| Build cost Lv1 | 40 wood, 50 clay, 30 iron, 10 wheat (130 total) |
| Build cost Lv10 | 370 wood, 460 clay, 275 iron, 90 wheat (1,195 total) |
| Special rules | Teutons bypass 20% of cranny; Gauls get 1.5× capacity |
| Stackable? | Yes — you can build multiple crannies after hitting Lv10 |
| Can be destroyed? | No (hidden from catapults, only hit by random targeting) |

**Key takeaway:** Cheap to build, low protection per unit, but stackable. Designed so players always have *some* protection but can never make themselves fully raid-proof without massive investment.

### Tribal Wars — "Hiding Place"

| Aspect | Details |
|--------|---------|
| Max level | 10 |
| Protection at Lv1 | 150 of each resource (×3 types = 450 total) |
| Protection at Lv10 | 2,000 of each resource (6,000 total) |
| Scaling | Roughly linear |
| Cost | Very cheap early, moderate at max |
| Stackable? | No — one per village |
| Special | Scouts cannot detect what's hidden |

**Key takeaway:** Simple, non-stackable. One building per village, max protection is modest — keeps early-game players safe but doesn't prevent meaningful raiding in mid/late game.

### Clash of Clans — "Treasury" (Clan Castle)

| Aspect | Details |
|--------|---------|
| Protection | Only 3% of Treasury contents can be stolen |
| Capacity | Scales with Town Hall level |
| Source | Only stores bonus loot (war, star bonus, clan games) |
| Loot cap | Regular storages have a % cap based on TH level (e.g. TH13 cap = 550k) |

**Key takeaway:** Different model — CoC uses percentage-based loot caps rather than a fixed protection amount. Attackers can only steal a % of stored resources, with a hard cap. The Treasury is a separate ultra-safe storage for bonus loot.

### OGame — No Bunker Building

OGame notably has **no dedicated bunker/cranny building**. The primary defense against resource theft is:
- Fleet-saving (sending resources away before attacks)
- Spending resources before being raided
- The 50% plunder cap (attackers can take at most 50% of surface resources)
- Storage buildings only affect max capacity, not protection

**Key takeaway:** OGame relies on player activity and fleet management rather than passive protection. This is widely considered one of OGame's pain points — inactive players become "farms" with no recourse.

---

## Design Principles for Nexus Protocol

Based on the research, here's the philosophy:

1. **Every player should have meaningful passive protection** — unlike OGame, we don't want inactive players to be completely stripped clean.
2. **Protection should NOT make raiding pointless** — the bunker protects a baseline, not everything. Active raiders should still profit from targets with large resource stockpiles.
3. **Single building, not stackable** — like Tribal Wars, one per planet. Simpler on-chain (less gas, less complexity).
4. **Protection scales with level but remains modest relative to production** — at high levels, the bunker should protect roughly 4-8 hours of resource production, enough to cover overnight/offline periods but not enough to hoard freely.
5. **All three resources protected equally** — the bunker hides X of each resource type.

---

## Building Specification

### Enum Addition

```solidity
enum BuildingType {
    NONE,                    // 0
    TITANIUM_EXTRACTOR,      // 1
    HELIUM3_HARVESTER,       // 2
    DARKMATTER_COLLECTOR,    // 3
    TITANIUM_VAULT,          // 4
    HELIUM3_TANK,            // 5
    DARKMATTER_CONTAINMENT,  // 6
    SHIPYARD,                // 7
    RESEARCH_NODE,           // 8
    UNDERGROUND_BUNKER       // 9
}
```

### Protection Per Level

Protection formula: `baseProtection × protectionMultiplier ^ level`

**Base protection:** 500 per resource type
**Protection multiplier:** 1.2× per level

Production uses the formula `baseProduction × level × (productionMultiplier/100) ^ level`, which grows aggressively due to the extra `level` multiplier (effective ~1.2–1.4× per level early, settling to ~1.16× late). The bunker's 1.2× growth can't keep up with the combined exponential + linear production scaling, so protection coverage naturally drops from ~18 hours early game and **stabilizes around 4–5 hours** from mid game onward.

| Level | Protected per resource | Total protected (×3) | Ti production/hr | Hours covered |
|-------|----------------------|---------------------|-----------------|---------------|
| 1 | 600 | 1,800 | 33 | ~18.2 hrs |
| 2 | 720 | 2,160 | 73 | ~9.9 hrs |
| 3 | 864 | 2,592 | 120 | ~7.2 hrs |
| 4 | 1,037 | 3,110 | 176 | ~5.9 hrs |
| 5 | 1,244 | 3,733 | 242 | ~5.2 hrs |
| 6 | 1,493 | 4,479 | 319 | ~4.7 hrs |
| 7 | 1,792 | 5,375 | 409 | ~4.4 hrs |
| 8 | 2,150 | 6,450 | 515 | ~4.2 hrs |
| 9 | 2,580 | 7,740 | 637 | ~4.1 hrs |
| 10 | 3,096 | 9,288 | 778 | ~4.0 hrs |
| 12 | 4,458 | 13,374 | 1,130 | ~3.9 hrs |
| 15 | 7,704 | 23,111 | 1,880 | ~4.1 hrs |
| 20 | 19,169 | 57,507 | 4,037 | ~4.7 hrs |

The curve drops quickly in the early levels (18h → 5h by level 5) then **plateaus around 4 hours** through mid and late game. This means the bunker consistently covers a short break or work session, but never a full night's sleep — players must spend or protect resources before logging off for extended periods.

### Plunder Scenarios

**Mid-game (Level 10 buildings, Level 10 bunker):**

| Offline duration | Accumulated | Protected | Plunderable (50% cap) |
|-----------------|-------------|-----------|----------------------|
| 4 hours | 3,112 | 3,096 | 8 (nothing worth raiding) |
| 8 hours | 6,225 | 3,096 | 1,565 |
| 12 hours | 9,337 | 3,096 | 3,121 |
| 24 hours | 18,675 | 3,096 | 7,790 |

**Early-mid game (Level 5 buildings, Level 5 bunker):**

| Offline duration | Accumulated | Protected | Plunderable (50% cap) |
|-----------------|-------------|-----------|----------------------|
| 4 hours | 966 | 1,244 | 0 (fully safe) |
| 8 hours | 1,933 | 1,244 | 344 |
| 12 hours | 2,899 | 1,244 | 827 |
| 24 hours | 5,798 | 1,244 | 2,277 |

A 4-hour break is safe at every stage. An 8-hour sleep exposes modest loot. Extended inactivity (24h+) makes you a profitable target — exactly the dynamic we want.

### Build Costs

Follows the same cost formula as other buildings: `baseCost × costMultiplier ^ level`

The bunker uses a **2.0× cost multiplier** — the same as storage buildings and the most expensive tier. This makes upgrading the bunker a substantial investment that directly competes with spending on production or military buildings.

| Resource | Base Cost | Cost Multiplier |
|----------|-----------|-----------------|
| Titanium | 750 | 2.0× |
| Helium-3 | 450 | 2.0× |
| Dark Matter | 0 | 2.0× |

| Level | Titanium | Helium-3 | Total | Equivalent to... |
|-------|----------|----------|-------|------------------|
| 1 | 1,500 | 900 | 2,400 | ~2 Ti Extractor upgrades |
| 2 | 3,000 | 1,800 | 4,800 | |
| 3 | 6,000 | 3,600 | 9,600 | |
| 5 | 24,000 | 14,400 | 38,400 | Several building upgrades |
| 10 | 768,000 | 460,800 | 1,228,800 | Major investment |
| 15 | 24,576,000 | 14,745,600 | 39,321,600 | Massive late-game cost |

At every level, upgrading the bunker costs significantly more than the value of resources it protects. Players must weigh the long-term insurance value against immediate economic growth. This is the intended "guns vs butter" tradeoff.

### Build Time

Uses the standard formula: `totalCost / 25` (seconds)

---

## Contract Implementation

### GameConfig.sol Additions

```solidity
// In getBuildingCosts() - add case for UNDERGROUND_BUNKER
case BuildingType.UNDERGROUND_BUNKER:
    baseTitanium = 750;
    baseHelium3 = 450;
    baseDarkMatter = 0;
    costMultiplier = 200; // 2.0x

// In getBuildTime() - add base time
case BuildingType.UNDERGROUND_BUNKER:
    baseTime = 90;

// New function
function getBunkerProtection(uint8 level) external pure returns (uint256) {
    if (level == 0) return 0;
    // 500 * 1.2^level
    uint256 baseProtection = 500;
    uint256 multiplier = 120; // 1.2x as 120/100
    return baseProtection * _pow(multiplier, level) / _pow(100, level);
}
```

### NexusGame.sol Additions

```solidity
// In Buildings struct, add:
uint8 undergroundBunker;

// In _getBuildingLevel() switch, add:
case GameConfig.BuildingType.UNDERGROUND_BUNKER:
    return buildings[planetId].undergroundBunker;

// In _setBuildingLevel() switch, add:
case GameConfig.BuildingType.UNDERGROUND_BUNKER:
    buildings[planetId].undergroundBunker = level;

// New view function for raid calculation
function getBunkerProtection(uint256 planetId) external view returns (
    uint256 titaniumProtected,
    uint256 helium3Protected,
    uint256 darkMatterProtected
) {
    uint8 level = buildings[planetId].undergroundBunker;
    uint256 protection = gameConfig.getBunkerProtection(level);
    return (protection, protection, protection);
}

// Used by future raid/combat system:
function getPlunderableResources(uint256 planetId) external view returns (
    uint256 titanium,
    uint256 helium3,
    uint256 darkMatter
) {
    (uint256 totalTi, uint256 totalHe, uint256 totalDm) = calculateCurrentResources(planetId);
    uint256 protection = gameConfig.getBunkerProtection(buildings[planetId].undergroundBunker);

    // Plunderable = max(0, total - protected) × 50% (OGame-style 50% cap)
    titanium = totalTi > protection ? (totalTi - protection) / 2 : 0;
    helium3 = totalHe > protection ? (totalHe - protection) / 2 : 0;
    darkMatter = totalDm > protection ? (totalDm - protection) / 2 : 0;
}
```

---

## Frontend Integration

### Building Key Map Update

```typescript
const BUILDING_TYPE_MAP: Record<string, number> = {
  // ... existing entries ...
  undergroundBunker: 10,
};
```

### Display Info

| Property | Value |
|----------|-------|
| Name | Underground Bunker |
| Icon/Emoji | 🏗️ or 🛡️ |
| Category | Defense |
| Description | "Deep beneath the planet's surface, reinforced vaults protect your most critical resources from enemy raids. The deeper you dig, the more you can hide." |
| Short description | "Protects resources from being plundered during raids." |

### UI Additions

On the Buildings page, show a new card with:
- Current protection amount per resource
- Next level protection amount
- Upgrade cost & time
- A visual indicator of "safe" vs "exposed" resources on the dashboard

On the Dashboard resource display, optionally show:
```
Titanium: 5,230 (🛡️ 2,242 protected)
```

---

## Balance Rationale

### Why 1.2× protection growth?

With the new production formula (`base × level × 1.1^level`), production effectively grows at ~1.2–1.4× per level early and ~1.16× late. The bunker's fixed 1.2× multiplier can't match the combined exponential + linear scaling of production, so protection coverage naturally erodes:

- **Level 1:** Covers ~18 hours — brand new players are almost fully safe for a day.
- **Level 3-5:** Covers ~5-7 hours — solid protection for a work session or afternoon away.
- **Level 10+:** Stabilizes at ~4 hours — covers a short break, but not overnight. Players must actively manage resources.

The ~4 hour plateau is the sweet spot: it's enough that casual players don't feel punished for stepping away, but short enough that raiding remains consistently profitable against anyone who isn't actively spending.

### Why 2.0× cost multiplier?

At every stage, upgrading the bunker costs substantially more than upgrading a production building. A player choosing to upgrade their bunker from level 5 to 6 (cost: ~48,000 resources) could instead upgrade multiple extractors. This forces a genuine strategic decision — do you invest in growth or security?

### Comparison to Travian's Cranny

Travian's cranny at max level protects 2,000 per resource. Our bunker at level 10 protects ~3,096 per resource — higher in absolute terms, but covering only ~4 hours of our much higher production rates. Both games end up in a similar design space: the bunker protects a few hours of production, not a full stockpile.

### Raid Profitability

The plunder scenarios show the intended dynamic clearly:

- **4h break:** Fully safe at all stages. No one profits from raiding an active player.
- **8h sleep:** Modest loot exposed (~344 at Lv5, ~1,565 at Lv10). Barely worth a raid unless the attacker is nearby.
- **24h+ inactive:** Significant loot exposed (~2,277 at Lv5, ~7,790 at Lv10). Profitable target — this is where raiding thrives.

Players who log in regularly and spend their resources are safe. Players who hoard or go inactive become farms. This rewards active play without being punishing.

---

## Future Considerations

- **Espionage interaction**: Scouts could report a planet's bunker level, letting raiders calculate whether an attack is profitable.
- **Research bonus**: A future "Fortification" research could add +10% bunker capacity per level.
- **Bunker bypass**: Late-game special ships or abilities could ignore a percentage of bunker protection (like Travian's Teuton bonus).
- **Visual feedback**: Show the bunker as a depth indicator on the planet view — deeper = higher level.