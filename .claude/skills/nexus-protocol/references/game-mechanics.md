# Game Mechanics Reference

OGame-inspired formulas and balance decisions for Nexus Protocol.

## Resource System

### Base Resources

| Resource | Role | Acquisition |
|----------|------|-------------|
| Titanium | Primary building material | Titanium Extractor |
| Helium-3 | Advanced tech, ships | Helium-3 Harvester |
| Dark Matter | End-game, special units | Dark Matter Collector |
| Energy | Powers buildings | Fusion Reactor (instant) |

### Production Formulas

Production per hour for resource buildings:

```
production = baseProduction × (productionMultiplier / 100) ^ (level - 1)
```

**Current values:**
| Building | Base Production | Multiplier |
|----------|-----------------|------------|
| Titanium Extractor | 30/hr | 1.1x |
| Helium-3 Harvester | 20/hr | 1.1x |
| Dark Matter Collector | 10/hr | 1.1x |
| Fusion Reactor | 20 energy | 1.1x |

**Example progression (Titanium Extractor):**
| Level | Production/hr |
|-------|---------------|
| 1 | 30 |
| 5 | 43 |
| 10 | 70 |
| 15 | 114 |
| 20 | 184 |

### Storage Capacity

```
capacity = baseCapacity × (capacityMultiplier / 100) ^ level
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
cost = baseCost × (costMultiplier / 100) ^ level
```

**Current base costs:**
| Building | Titanium | Helium-3 | Dark Matter | Multiplier |
|----------|----------|----------|-------------|------------|
| Titanium Extractor | 60 | 15 | 0 | 1.5x |
| Helium-3 Harvester | 48 | 24 | 0 | 1.6x |
| Dark Matter Collector | 225 | 75 | 0 | 1.5x |
| Fusion Reactor | 75 | 30 | 0 | 1.5x |
| Titanium Vault | 1000 | 0 | 0 | 2.0x |
| Helium-3 Tank | 1000 | 500 | 0 | 2.0x |
| Dark Matter Containment | 1000 | 1000 | 0 | 2.0x |
| Assembly Bay | 400 | 200 | 100 | 2.0x |
| Research Node | 200 | 400 | 200 | 2.0x |

### Build Time Formula

```
buildTime = baseTime × (level + 1) × totalCost / 1000
```

Where `totalCost = titaniumCost + helium3Cost + darkMatterCost`

**Base times (seconds):**
| Building | Base Time |
|----------|-----------|
| Titanium Extractor | 30 |
| Helium-3 Harvester | 30 |
| Dark Matter Collector | 60 |
| Fusion Reactor | 30 |
| Storage Buildings | 60 |
| Assembly Bay | 120 |
| Research Node | 120 |

### Building Queue Rules

- One upgrade at a time per planet
- Resources deducted immediately on start
- Cancel refunds 50% of resources
- Anyone can call `completeUpgrade()` after timer

## Ships (NOT YET IMPLEMENTED)

### Planned Ship Types

Based on OGame archetypes:

| Ship | Role | Speed | Cargo | Attack | Defense |
|------|------|-------|-------|--------|---------|
| Light Hauler | Transport | Fast | 5,000 | 5 | 10 |
| Heavy Freighter | Bulk transport | Slow | 25,000 | 5 | 25 |
| Interceptor | Scout/Fast attack | Very fast | 50 | 50 | 15 |
| Strike Craft | Combat | Medium | 100 | 100 | 40 |
| Destroyer | Heavy combat | Slow | 500 | 400 | 200 |
| Dreadnought | Capital ship | Very slow | 1,000 | 1,000 | 500 |

### Ship Cost Formula (Planned)

```
shipCost = baseCost  // No scaling, fixed cost per unit
buildTime = baseTime × quantity / (1 + assemblyBayLevel × 0.5)
```

## Research (NOT YET IMPLEMENTED)

### Planned Research Trees

**Propulsion:**
- Impulse Drive → Warp Drive → Quantum Shift Drive

**Combat:**
- Offensive Systems
- Defensive Arrays
- Hull Reinforcement

**Technology:**
- Power Systems
- AI Command Networks
- Stealth Systems

### Research Cost Formula (Planned)

```
cost = baseCost × (1.75) ^ level
time = baseTime × (1.5) ^ level / (1 + researchNodeLevel × 0.25)
```

## Fleet & Combat (NOT YET IMPLEMENTED)

### Fleet Movement

Travel time based on:
- Distance (galaxy/system/position)
- Slowest ship in fleet
- Drive technology levels

```
distance = sqrt((g2-g1)² × 1000000 + (s2-s1)² × 1000 + (p2-p1)²)
speed = baseSpeed × (1 + driveLevel × 0.2)
travelTime = distance / speed
```

### Combat System (Planned)

Round-based combat:
1. Each ship fires at random enemy
2. Damage = attack × (1 + offensiveSystemsLevel × 0.1)
3. Defense reduces damage
4. Ships destroyed when hull depleted
5. Repeat until one side eliminated or 6 rounds

### Plunder Rules (Planned)

- Attacker wins: Take up to 50% of resources (cargo limit)
- Resources capped by fleet cargo capacity
- Debris field created from destroyed ships (30% materials)

## Galaxy Structure

### Coordinate System

```
[Galaxy:System:Position]
  1-5    1-499    1-15

Example: [1:42:7] = Galaxy 1, System 42, Position 7
```

### Current Assignment

Sequential coordinates on planet claim:
```solidity
galaxy = 1;  // Fixed for now
system = (planetId - 1) / 15 + 1;
position = (planetId - 1) % 15 + 1;
```

### Distance Calculation

| Same... | Distance Factor |
|---------|-----------------|
| Position | 5 |
| System | 50 |
| Galaxy | 500 |

## Starting Conditions

**New player receives:**
- 1 planet at next available coordinates
- 500 Titanium
- 500 Helium-3
- 0 Dark Matter
- Titanium Extractor level 1
- Helium-3 Harvester level 1
- Fusion Reactor level 1

## Balance Considerations

### Early Game (Levels 1-5)

Focus: Resource production buildings
- Upgrade extractors first
- Build reactor to maintain energy surplus
- Save for Assembly Bay to speed future builds

### Mid Game (Levels 5-15)

Focus: Infrastructure and ships
- Storage buildings become important
- Assembly Bay essential for reasonable build times
- Research Node unlocks technology
- First fleet for raids

### Late Game (Levels 15+)

Focus: Fleet and expansion
- Dark Matter becomes bottleneck
- Capital ships require massive resources
- Multiple planets (future feature)
- Alliance warfare (future feature)

## Formula Summary

```
// Production
production = base × multiplier^(level-1)

// Cost
cost = baseCost × costMultiplier^level

// Build time
time = baseTime × (level+1) × totalCost / 1000

// Storage
capacity = baseCapacity × capacityMultiplier^level

// Ship build time (planned)
time = baseTime × quantity / (1 + assemblyBayLevel × 0.5)

// Research time (planned)
time = baseTime × 1.5^level / (1 + researchNodeLevel × 0.25)

// Travel time (planned)
time = distance / (baseSpeed × (1 + driveLevel × 0.2))
```
