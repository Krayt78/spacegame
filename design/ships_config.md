# Ship Stats Reference — Nexus Protocol Design Document

This document contains all stats for the 12 ship types in Nexus Protocol.

---

## Ship Stats Overview

| Ship | Titanium | Helium-3 | Dark Matter | Structural Integrity | Shield | Weapon | Speed | Cargo | Fuel |
|---|---|---|---|---|---|---|---|---|---|
| Small Cargo | 2,000 | 2,000 | 0 | 4,000 | 10 | 5 | 5,000 | 5,000 | 10 |
| Large Cargo | 6,000 | 6,000 | 0 | 12,000 | 25 | 5 | 7,500 | 25,000 | 50 |
| Light Fighter | 3,000 | 1,000 | 0 | 4,000 | 10 | 50 | 12,500 | 50 | 20 |
| Heavy Fighter | 6,000 | 4,000 | 0 | 10,000 | 25 | 150 | 10,000 | 100 | 75 |
| Cruiser | 20,000 | 7,000 | 2,000 | 27,000 | 50 | 400 | 15,000 | 800 | 300 |
| Battleship | 45,000 | 15,000 | 0 | 60,000 | 200 | 1,000 | 10,000 | 1,500 | 500 |
| Battlecruiser | 30,000 | 40,000 | 15,000 | 70,000 | 400 | 700 | 10,000 | 750 | 250 |
| Bomber | 50,000 | 25,000 | 15,000 | 75,000 | 500 | 1,000 | 4,000 | 500 | 1,000 |
| Destroyer | 60,000 | 50,000 | 15,000 | 110,000 | 500 | 2,000 | 5,000 | 2,000 | 1,000 |
| Colony Ship | 10,000 | 20,000 | 10,000 | 30,000 | 100 | 50 | 2,500 | 7,500 | 1,000 |
| Recycler | 10,000 | 6,000 | 2,000 | 16,000 | 10 | 1 | 2,000 | 20,000 | 300 |
| Crawler | 2,000 | 2,000 | 1,000 | 4,000 | 1 | 1 | 0 | 0 | 0 |

---

## Prerequisites (Buildings & Research)

| Ship | Shipyard | Engine Requirement | Other Requirements |
|---|---|---|---|
| Small Cargo | 2 | Combustion Drive 2 | — |
| Large Cargo | 4 | Combustion Drive 6 | — |
| Light Fighter | 1 | Combustion Drive 1 | — |
| Heavy Fighter | 3 | Impulse Drive 2 | Armour Tech 2 |
| Cruiser | 5 | Impulse Drive 4 | Ion Tech 2 |
| Battleship | 7 | Hyperspace Drive 4 | — |
| Battlecruiser | 8 | Hyperspace Drive 5 | Hyperspace Tech 5, Laser Tech 12 |
| Bomber | 8 | Impulse Drive 6 | Plasma Tech 5 |
| Destroyer | 9 | Hyperspace Drive 6 | Hyperspace Tech 5 |
| Colony Ship | 4 | Impulse Drive 3 | — |
| Recycler | 4 | Combustion Drive 6 | Shielding Tech 2 |
| Crawler | 5 | Combustion Drive 4 | Armour Tech 4, Laser Tech 4 |

---

## Advantage / Disadvantage Tables

### Advantage — THIS ship fires multiple times AGAINST others

| Ship | Advantage Against |
|---|---|
| **Small Cargo** | Crawler: 5 |
| **Large Cargo** | Crawler: 5 |
| **Light Fighter** | Crawler: 5 |
| **Heavy Fighter** | Crawler: 5, Small Cargo: 3 |
| **Cruiser** | Crawler: 5, Light Fighter: 6, Rocket Launcher: 10 |
| **Battleship** | Crawler: 5 |
| **Battlecruiser** | Crawler: 5, Small Cargo: 3, Large Cargo: 3, Heavy Fighter: 4, Cruiser: 4, Battleship: 7 |
| **Bomber** | Crawler: 5, Rocket Launcher: 20, Light Laser: 20, Heavy Laser: 10, Ion Cannon: 10, Gauss Cannon: 5, Plasma Turret: 5 |
| **Destroyer** | Crawler: 5, Light Laser: 10, Battlecruiser: 2 |
| **Colony Ship** | Crawler: 5 |
| **Recycler** | Crawler: 5 |
| **Crawler** | None |

### Disadvantage — Others fire multiple times AGAINST this ship

| Ship | Disadvantage From |
|---|---|
| **Small Cargo** | Heavy Fighter: 3, Battlecruiser: 3 |
| **Large Cargo** | Battlecruiser: 3 |
| **Light Fighter** | Cruiser: 6 |
| **Heavy Fighter** | Battlecruiser: 4 |
| **Cruiser** | Battlecruiser: 4 |
| **Battleship** | Battlecruiser: 7 |
| **Battlecruiser** | Destroyer: 2 |
| **Bomber** | — |
| **Destroyer** | — |
| **Colony Ship** | — |
| **Recycler** | — |
| **Crawler** | All ships: 5 |

---

## Detailed Ship Profiles

### Transport Ships

#### Small Cargo Ship
- **Cost:** 2,000 Titanium / 2,000 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 2, Combustion Drive 2
- **Structural Integrity:** 4,000
- **Shield Power:** 10
- **Weapon Power:** 5
- **Base Speed:** 5,000
- **Cargo Capacity:** 5,000
- **Fuel Consumption:** 10
- **Advantage Against:** Crawler (5)
- **Disadvantage From:** Heavy Fighter (3), Battlecruiser (3)

#### Large Cargo Ship
- **Cost:** 6,000 Titanium / 6,000 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 4, Combustion Drive 6
- **Structural Integrity:** 12,000
- **Shield Power:** 25
- **Weapon Power:** 5
- **Base Speed:** 7,500
- **Cargo Capacity:** 25,000
- **Fuel Consumption:** 50
- **Advantage Against:** Crawler (5)
- **Disadvantage From:** Battlecruiser (3)

---

### Fighter Type Crafts

#### Light Fighter
- **Cost:** 3,000 Titanium / 1,000 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 1, Combustion Drive 1
- **Structural Integrity:** 4,000
- **Shield Power:** 10
- **Weapon Power:** 50
- **Base Speed:** 12,500
- **Cargo Capacity:** 50
- **Fuel Consumption:** 20
- **Advantage Against:** Crawler (5)
- **Disadvantage From:** Cruiser (6)

#### Heavy Fighter
- **Cost:** 6,000 Titanium / 4,000 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 3, Impulse Drive 2, Armour Tech 2
- **Structural Integrity:** 10,000
- **Shield Power:** 25
- **Weapon Power:** 150
- **Base Speed:** 10,000
- **Cargo Capacity:** 100
- **Fuel Consumption:** 75
- **Advantage Against:** Crawler (5), Small Cargo (3)
- **Disadvantage From:** Battlecruiser (4)

---

### Line Ships

#### Cruiser
- **Cost:** 20,000 Titanium / 7,000 Helium-3 / 2,000 Dark Matter
- **Prerequisites:** Shipyard 5, Impulse Drive 4, Ion Tech 2
- **Structural Integrity:** 27,000
- **Shield Power:** 50
- **Weapon Power:** 400
- **Base Speed:** 15,000
- **Cargo Capacity:** 800
- **Fuel Consumption:** 300
- **Advantage Against:** Crawler (5), Light Fighter (6), Rocket Launcher (10)
- **Disadvantage From:** Battlecruiser (4)

#### Battleship
- **Cost:** 45,000 Titanium / 15,000 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 7, Hyperspace Drive 4
- **Structural Integrity:** 60,000
- **Shield Power:** 200
- **Weapon Power:** 1,000
- **Base Speed:** 10,000
- **Cargo Capacity:** 1,500
- **Fuel Consumption:** 500
- **Advantage Against:** Crawler (5)
- **Disadvantage From:** Battlecruiser (7)

#### Battlecruiser
- **Cost:** 30,000 Titanium / 40,000 Helium-3 / 15,000 Dark Matter
- **Prerequisites:** Shipyard 8, Hyperspace Drive 5, Hyperspace Tech 5, Laser Tech 12
- **Structural Integrity:** 70,000
- **Shield Power:** 400
- **Weapon Power:** 700
- **Base Speed:** 10,000
- **Cargo Capacity:** 750
- **Fuel Consumption:** 250
- **Advantage Against:** Crawler (5), Small Cargo (3), Large Cargo (3), Heavy Fighter (4), Cruiser (4), Battleship (7)
- **Disadvantage From:** Destroyer (2)

#### Bomber
- **Cost:** 50,000 Titanium / 25,000 Helium-3 / 15,000 Dark Matter
- **Prerequisites:** Shipyard 8, Impulse Drive 6, Plasma Tech 5
- **Structural Integrity:** 75,000
- **Shield Power:** 500
- **Weapon Power:** 1,000
- **Base Speed:** 4,000
- **Cargo Capacity:** 500
- **Fuel Consumption:** 1,000
- **Advantage Against:** Crawler (5), Rocket Launcher (20), Light Laser (20), Heavy Laser (10), Ion Cannon (10), Gauss Cannon (5), Plasma Turret (5)
- **Disadvantage From:** —

#### Destroyer
- **Cost:** 60,000 Titanium / 50,000 Helium-3 / 15,000 Dark Matter
- **Prerequisites:** Shipyard 9, Hyperspace Drive 6, Hyperspace Tech 5
- **Structural Integrity:** 110,000
- **Shield Power:** 500
- **Weapon Power:** 2,000
- **Base Speed:** 5,000
- **Cargo Capacity:** 2,000
- **Fuel Consumption:** 1,000
- **Advantage Against:** Crawler (5), Light Laser (10), Battlecruiser (2)
- **Disadvantage From:** —

---

### Special Ships

#### Colony Ship
- **Cost:** 10,000 Titanium / 20,000 Helium-3 / 10,000 Dark Matter
- **Prerequisites:** Shipyard 4, Impulse Drive 3
- **Structural Integrity:** 30,000
- **Shield Power:** 100
- **Weapon Power:** 50
- **Base Speed:** 2,500
- **Cargo Capacity:** 7,500
- **Fuel Consumption:** 1,000
- **Advantage Against:** Crawler (5)
- **Disadvantage From:** —

#### Recycler
- **Cost:** 10,000 Titanium / 6,000 Helium-3 / 2,000 Dark Matter
- **Prerequisites:** Shipyard 4, Combustion Drive 6, Shielding Tech 2
- **Structural Integrity:** 16,000
- **Shield Power:** 10
- **Weapon Power:** 1
- **Base Speed:** 2,000
- **Cargo Capacity:** 20,000
- **Fuel Consumption:** 300
- **Advantage Against:** Crawler (5)
- **Disadvantage From:** —

#### Crawler
- **Cost:** 2,000 Titanium / 2,000 Helium-3 / 1,000 Dark Matter
- **Prerequisites:** Shipyard 5, Combustion Drive 4, Armour Tech 4, Laser Tech 4
- **Structural Integrity:** 4,000
- **Shield Power:** 1
- **Weapon Power:** 1
- **Base Speed:** 0 (cannot move)
- **Cargo Capacity:** 0
- **Fuel Consumption:** 0
- **Production Bonus:** +0.02% Titanium, Helium-3, Dark Matter per crawler
- **Max Active Crawlers:** (Titanium Mine lvl + Helium-3 Mine lvl + Dark Matter Syn lvl) × 8
- **Advantage Against:** None
- **Disadvantage From:** All ships (5)

---

## Design Notes

- **Structural Integrity** = Titanium cost + Helium-3 cost
- **Hull Points** = Structural Integrity / 10
- **Advantage formula:** If value is N, the chance to fire again after hitting that target = (N-1)/N
- **Energy has been removed** from Nexus Protocol — balance is handled through building costs alone
- Defense structure advantage values (Rocket Launcher, Lasers, etc.) included where relevant for potential defense system design