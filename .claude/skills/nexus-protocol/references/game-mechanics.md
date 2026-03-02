# Game Mechanics Reference

OGame-inspired formulas and balance decisions for Nexus Protocol.

## Resource System

### Base Resources

| Resource | Role | Acquisition |
|----------|------|-------------|
| Titanium | Primary building material | Titanium Extractor |
| Helium-3 | Advanced tech, ships | Helium-3 Harvester |
| Dark Matter | End-game, special units | Dark Matter Collector |

### Production Formulas

Production per hour for resource buildings:

```
production = baseProduction * level * (productionMultiplier / 100) ^ level
```

Note: The `* level` linear factor ensures good early-game progression.

**Current values:**
| Building | Base Production | Multiplier |
|----------|-----------------|------------|
| Titanium Extractor | 30/hr | 1.1x |
| Helium-3 Harvester | 20/hr | 1.1x |
| Dark Matter Collector | 10/hr | 1.1x |

### Storage Capacity

```
capacity = baseCapacity * (capacityMultiplier / 100) ^ level
```

**Current values:**
| Building | Base Capacity | Multiplier |
|----------|---------------|------------|
| Titanium Vault | 10,000 | 1.5x |
| Helium-3 Tank | 10,000 | 1.5x |
| Dark Matter Containment | 10,000 | 1.5x |

Default capacity (no storage buildings): 100,000

## Building System

### Cost Formulas

```
cost = baseCost * (costMultiplier / 100) ^ level
```

**Current base costs:**
| Building | Titanium | Helium-3 | Dark Matter | Multiplier |
|----------|----------|----------|-------------|------------|
| Titanium Extractor | 60 | 15 | 0 | 1.5x |
| Helium-3 Harvester | 48 | 24 | 0 | 1.6x |
| Dark Matter Collector | 225 | 75 | 0 | 1.5x |
| Titanium Vault | 1000 | 0 | 0 | 2.0x |
| Helium-3 Tank | 1000 | 500 | 0 | 2.0x |
| Dark Matter Containment | 1000 | 1000 | 0 | 2.0x |
| Shipyard | 400 | 200 | 100 | 2.0x |
| Research Node | 200 | 400 | 200 | 2.0x |
| Underground Bunker | 750 | 450 | 0 | 2.0x |

### Build Time Formula

```
buildTime = totalCost / 25
```

Where `totalCost = titaniumCost + helium3Cost + darkMatterCost`

### Building Queue Rules

- One upgrade at a time per planet
- Resources deducted immediately on start
- Cancel refunds 50% of resources
- Anyone can call `completeUpgrade()` after timer

### Underground Bunker

Protects resources from raids. Protection per resource type:

```
protection = 500 * (1.2) ^ level
```

Plunder is capped at 50% of plunderable resources (total - protected).

## Ships (12 Types)

| # | Ship | Role |
|---|------|------|
| 1 | Small Cargo | Transport (5,000 cargo) |
| 2 | Large Cargo | Bulk transport (25,000 cargo) |
| 3 | Light Fighter | Fast attack |
| 4 | Heavy Fighter | Combat |
| 5 | Cruiser | Mid-range combat |
| 6 | Battleship | Heavy combat |
| 7 | Battlecruiser | Anti-cruiser |
| 8 | Bomber | Anti-defense |
| 9 | Destroyer | Capital ship |
| 10 | Colony Ship | Colonization |
| 11 | Recycler | Debris collection |
| 12 | Crawler | Slow resource unit |

### Ship Cost Formula

Ships have fixed per-unit costs (no scaling). Total cost = cost * quantity.

### Ship Build Time Formula

```
shipBuildTime = totalCost * quantity / (25 * (1 + shipyardLevel))
```

Where `totalCost = titaniumCost + helium3Cost + darkMatterCost` per unit.
Higher shipyard level = faster build time.

### Ship Combat Stats

Each ship has: structural integrity, shield power, weapon power, speed, cargo capacity, fuel consumption.
Ships also have combat advantage/disadvantage matrices (e.g., Destroyer is strong vs Light Laser & Battlecruiser).

## Defenses (8 Types)

| # | Defense | Notes |
|---|--------|-------|
| 1 | Rocket Launcher | Basic, cheap |
| 2 | Light Laser | |
| 3 | Heavy Laser | |
| 4 | Ion Cannon | |
| 5 | Gauss Cannon | |
| 6 | Plasma Turret | Most powerful |
| 7 | Small Shield Dome | Limit: 1 per planet |
| 8 | Large Shield Dome | Limit: 1 per planet |

Defense build time uses the same formula as ships (totalCost * quantity / (25 * (1 + shipyardLevel))).

## Research (13 Technologies)

| # | Technology | Effect |
|---|-----------|--------|
| 1 | Combustion Drive | +10% ship speed, unlocks basic ships |
| 2 | Impulse Drive | +20% ship speed, unlocks mid-tier ships |
| 3 | Hyperspace Drive | +30% ship speed, unlocks late-game ships |
| 4 | Weapon Tech | +10% weapon power per level |
| 5 | Shielding Tech | +10% shield power per level |
| 6 | Armour Tech | +10% structural integrity per level |
| 7 | Computer Tech | +1 max active fleet per level |
| 8 | Stealth Systems | Cloaking and electronic warfare |
| 9 | Ion Tech | Enables ion-based weapons |
| 10 | Hyperspace Tech | +5% cargo capacity per level |
| 11 | Laser Tech | Enables laser weapons |
| 12 | Plasma Tech | Enables plasma weapons |
| 13 | Astrophysics | +1 colony slot per 2 levels |

### Research Cost Formula

```
cost = baseCost * (costMultiplier / 100) ^ level
```

### Research Time Formula

```
baseTime = (titaniumCost + helium3Cost) * 3600 / 10000
time = baseTime * 10 / (10 + researchNodeLevel * 3)
minimum = 60 seconds
```

Research is per-player (not per-planet). One research queue at a time.

## Fleet & Combat

### Fleet Missions

| Mission | Description |
|---------|-------------|
| RAID | Attack a planet, plunder resources (up to 50% of plunderable) |
| CAPTURE | Attack a raider outpost to take control |
| MOVE | Transfer ships to another planet |
| COLONIZE | Establish a new colony (requires Colony Ship + Astrophysics research) |

### Fleet Statuses

- TRAVELING — fleet en route to destination
- RETURNING — fleet heading back to origin

### Combat System (6-Round Iterative)

1. Each round: compute total attacker and defender firepower
2. Apply research bonuses: Weapon Tech (+10%/level), Shielding Tech (+10%/level), Armour Tech (+10%/level)
3. Apply combat advantage/disadvantage multipliers between ship types
4. Distribute damage proportionally across enemy units
5. Ships/defenses destroyed when structural integrity depleted
6. Combat ends after 6 rounds or when one side is eliminated
7. Attacker wins if defender has no surviving ships/defenses

### Plunder Rules

- Attacker wins: can steal up to 50% of plunderable resources
- Plunderable = total resources - bunker-protected amount
- Resources capped by fleet cargo capacity

### Raider Outposts

Located at system positions 11-15. Three types:
- Titanium Mine (produces titanium)
- Helium-3 Lab (produces helium-3)
- Dark Matter Refinery (produces dark matter)

Players can CAPTURE outposts, station ships as garrison, and collect accumulated resources.

### Battle Reports

Full battle reports are stored on-chain for both attacker and defender, including:
- Ship/defense counts before and after combat
- Resources plundered
- Combat round details

## Galaxy Structure

### Coordinate System

```
[Galaxy:System:Position]

Example: [1:5:7] = Galaxy 1, System 5, Position 7
```

- **Positions 1-10**: Colonizable planets
- **Positions 11-15**: Raider outpost slots

### Coordinate Assignment

Coordinates are calculated from planet ID:
```solidity
galaxy = (planetId - 1) / 150 + 1
system = ((planetId - 1) % 150) / 10 + 1
position = (planetId - 1) % 10 + 1
```

Each galaxy has 150 systems, each system has 10 planet slots.

## Starting Conditions

**New player receives:**
- 1 planet at next available coordinates
- 500 Titanium
- 500 Helium-3
- 0 Dark Matter
- Titanium Extractor level 1
- Helium-3 Harvester level 1

## Balance Considerations

### Early Game (Levels 1-5)

Focus: Resource production buildings
- Upgrade extractors first
- Save for Shipyard to enable ship construction

### Mid Game (Levels 5-15)

Focus: Infrastructure, ships, and research
- Storage buildings become important
- Shipyard level affects ship build time
- Research Node unlocks technologies
- First fleet for raids

### Late Game (Levels 15+)

Focus: Fleet, expansion, and combat
- Dark Matter becomes bottleneck
- Capital ships require massive resources
- Multiple planets via colonization (Astrophysics research)
- Alliance warfare (future feature)

## Formula Summary

```
// Production (with linear level scaling)
production = baseProduction * level * (multiplier/100)^level

// Building upgrade cost
cost = baseCost * (costMultiplier/100)^level

// Building build time
time = totalCost / 25

// Storage capacity
capacity = baseCapacity * (capacityMultiplier/100)^level

// Bunker protection per resource
protection = 500 * 1.2^level

// Ship/defense build time
time = totalCost * quantity / (25 * (1 + shipyardLevel))

// Research time
time = (titaniumCost + helium3Cost) * 3600 / 10000 * 10 / (10 + researchNodeLevel * 3)
minimum = 60 seconds

// Research cost
cost = baseCost * (costMultiplier/100)^level
```
