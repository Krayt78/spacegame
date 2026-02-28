# Defense Stats Reference — Nexus Protocol Design Document

This document contains all stats for the 8 defense structures in Nexus Protocol.

---

## Defense Stats Overview

| Defense | Titanium | Helium-3 | Dark Matter | Structural Integrity | Shield | Weapon | Limit |
|---|---|---|---|---|---|---|---|
| Rocket Launcher | 2,000 | 0 | 0 | 2,000 | 20 | 80 | — |
| Light Laser | 1,500 | 500 | 0 | 2,000 | 25 | 100 | — |
| Heavy Laser | 6,000 | 2,000 | 0 | 8,000 | 100 | 250 | — |
| Ion Cannon | 5,000 | 3,000 | 0 | 8,000 | 500 | 150 | — |
| Gauss Cannon | 20,000 | 15,000 | 2,000 | 35,000 | 200 | 1,100 | — |
| Plasma Turret | 50,000 | 50,000 | 30,000 | 100,000 | 300 | 3,000 | — |
| Small Shield Dome | 10,000 | 10,000 | 0 | 20,000 | 2,000 | 1 | 1 |
| Large Shield Dome | 50,000 | 50,000 | 0 | 100,000 | 10,000 | 1 | 1 |

---

## Prerequisites (Buildings & Research)

| Defense | Shipyard | Other Requirements |
|---|---|---|
| Rocket Launcher | 1 | — |
| Light Laser | 2 | Laser Tech 3 |
| Heavy Laser | 4 | Laser Tech 6 |
| Ion Cannon | 4 | Ion Tech 4 |
| Gauss Cannon | 6 | Weapon Tech 3, Shielding Tech 1 |
| Plasma Turret | 8 | Plasma Tech 7 |
| Small Shield Dome | 1 | Shielding Tech 2 |
| Large Shield Dome | 6 | Shielding Tech 6 |

---

## Advantage / Disadvantage Tables

### Advantage — This defense fires multiple times AGAINST others

| Defense | Advantage Against |
|---|---|
| **Rocket Launcher** | None |
| **Light Laser** | None |
| **Heavy Laser** | None |
| **Ion Cannon** | None |
| **Gauss Cannon** | None |
| **Plasma Turret** | None |
| **Small Shield Dome** | None |
| **Large Shield Dome** | None |

### Disadvantage — Others fire multiple times AGAINST this defense

| Defense | Disadvantage From |
|---|---|
| **Rocket Launcher** | Cruiser: 10, Bomber: 20 |
| **Light Laser** | Destroyer: 10, Bomber: 20 |
| **Heavy Laser** | Bomber: 10 |
| **Ion Cannon** | Bomber: 10 |
| **Gauss Cannon** | Bomber: 5 |
| **Plasma Turret** | Bomber: 5 |
| **Small Shield Dome** | — |
| **Large Shield Dome** | — |

---

## Detailed Defense Profiles

### Light Defenses

#### Rocket Launcher
- **Cost:** 2,000 Titanium / 0 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 1
- **Structural Integrity:** 2,000
- **Shield Power:** 20
- **Weapon Power:** 80
- **Advantage Against:** None
- **Disadvantage From:** Cruiser (10), Bomber (20)

#### Light Laser
- **Cost:** 1,500 Titanium / 500 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 2, Laser Tech 3
- **Structural Integrity:** 2,000
- **Shield Power:** 25
- **Weapon Power:** 100
- **Advantage Against:** None
- **Disadvantage From:** Destroyer (10), Bomber (20)

---

### Heavy Defenses

#### Heavy Laser
- **Cost:** 6,000 Titanium / 2,000 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 4, Laser Tech 6
- **Structural Integrity:** 8,000
- **Shield Power:** 100
- **Weapon Power:** 250
- **Advantage Against:** None
- **Disadvantage From:** Bomber (10)

#### Ion Cannon
- **Cost:** 5,000 Titanium / 3,000 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 4, Ion Tech 4
- **Structural Integrity:** 8,000
- **Shield Power:** 500
- **Weapon Power:** 150
- **Advantage Against:** None
- **Disadvantage From:** Bomber (10)

#### Gauss Cannon
- **Cost:** 20,000 Titanium / 15,000 Helium-3 / 2,000 Dark Matter
- **Prerequisites:** Shipyard 6, Weapon Tech 3, Shielding Tech 1
- **Structural Integrity:** 35,000
- **Shield Power:** 200
- **Weapon Power:** 1,100
- **Advantage Against:** None
- **Disadvantage From:** Bomber (5)

#### Plasma Turret
- **Cost:** 50,000 Titanium / 50,000 Helium-3 / 30,000 Dark Matter
- **Prerequisites:** Shipyard 8, Plasma Tech 7
- **Structural Integrity:** 100,000
- **Shield Power:** 300
- **Weapon Power:** 3,000
- **Advantage Against:** None
- **Disadvantage From:** Bomber (5)

---

### Shield Domes

#### Small Shield Dome
- **Cost:** 10,000 Titanium / 10,000 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 1, Shielding Tech 2
- **Structural Integrity:** 20,000
- **Shield Power:** 2,000
- **Weapon Power:** 1
- **Limit:** 1 per planet
- **Advantage Against:** None
- **Disadvantage From:** —

#### Large Shield Dome
- **Cost:** 50,000 Titanium / 50,000 Helium-3 / 0 Dark Matter
- **Prerequisites:** Shipyard 6, Shielding Tech 6
- **Structural Integrity:** 100,000
- **Shield Power:** 10,000
- **Weapon Power:** 1
- **Limit:** 1 per planet
- **Advantage Against:** None
- **Disadvantage From:** —

---

## Design Notes

- **Structural Integrity** = Titanium cost + Helium-3 cost (same formula as ships)
- **Hull Points** = Structural Integrity / 10
- **Disadvantage formula:** If value is N, the attacking ship's chance to fire again after hitting this defense = (N-1)/N
- **Defenses are stationary** — they have no speed, cargo capacity, or fuel consumption
- **Shield Domes** are limited to 1 of each type per planet
- **No advantage entries** — defenses do not have advantage against any ship type
- **Bomber** is the primary counter to planetary defenses, with advantage against all weapon emplacements
- **Cruiser** has advantage (10) specifically against Rocket Launchers; **Destroyer** has advantage (10) against Light Lasers
- **Defenses cannot be sent on missions** — they are permanently bound to their planet