# Known Vulnerabilities

Catalogue of identified contract vulnerabilities, their status, and possible fixes.

---

## V-001: Coordinate Collision Between Starter Planets and Colonization

**Status:** Partially Mitigated

### The Bug

`GameState.createPlanet()` blindly overwrites `_coordinateToPlanet[galaxy][system][position]` with no occupancy check. Two code paths create planets:

1. **`claimStarterPlanet()`** — assigns coordinates deterministically from `nextPlanetId` using a formula
2. **`_resolveColonize()`** — creates planets at player-chosen coordinates

If a player colonizes a coordinate that the starter formula will later assign, the mapping gets silently overwritten. The colonized planet becomes orphaned (exists in `_planets` but unreachable via coordinate lookup).

### Attack Scenario

1. Colonizer dispatches fleet to `(1, 3, 5)` — a future starter slot
2. Colonization resolves, planet created at that coordinate
3. New player calls `claimStarterPlanet()` → overwrites the coordinate mapping
4. Colonizer's planet is now orphaned — still exists but unreachable

### Current Mitigation

1. **`GameState.createPlanet()`** now reverts if the coordinate is already occupied (`require` guard)
2. **`PlanetManager.claimStarterPlanet()`** now loops to skip occupied coordinates, incrementing `nextPlanetId` until it finds an empty slot

### Remaining Risk: Gas DoS

The skip loop in `claimStarterPlanet()` calls `incrementNextPlanetId()` + `getCoordinateToPlanet()` for each occupied slot. If an attacker colonizes 100+ consecutive future starter slots, the loop would consume too much gas and `claimStarterPlanet()` would revert — effectively blocking new player registration.

Each colonization requires a Colony Ship + Astrophysics research + fleet travel time, so mass-blocking is expensive but not impossible for a well-resourced player.

### Possible Full Fixes (Not Yet Implemented)

| Approach | Description | Tradeoff |
|----------|-------------|----------|
| **Loop cap + fallback** | Limit the skip loop to N iterations; if all are occupied, revert with a clear error and let an admin advance `nextPlanetId` past the blocked range | Simple but requires admin intervention |
| **Restrict colonization targets** | Prevent colonizing coordinates that fall within the predictable starter grid range | Limits gameplay — players can't colonize near starters |
| **Separate coordinate spaces** | Reserve positions 1-10 exclusively for starters, 11-15 for colonies (or vice versa) | Major gameplay change, reduces available slots |
| **Coordinate reservation on dispatch** | Reserve the coordinate when a colonization fleet is dispatched; `claimStarterPlanet` checks reservations too | Most thorough but adds storage overhead and cleanup logic |
| **Non-deterministic starter coords** | Replace the formula with hash-based probing for empty slots | Breaks organized galaxy layout |
| **Store `nextStarterSlot` separately** | Decouple the starter coordinate pointer from `nextPlanetId` so an admin or the contract itself can advance it past blocked ranges without burning IDs | Clean separation but adds a new state variable |

---

## V-003: Combat Defense Formula — Operator Precedence

**Status:** Resolved (By Design)
**Severity:** MEDIUM

### The Issue

The defense calculation in `CombatEngine.sol` (lines 85, 102, 119) uses:

```solidity
uint256 defense = boostedShield + boostedHull / 100;
```

Due to operator precedence, this evaluates as `boostedShield + (boostedHull / 100)`, NOT `(boostedShield + boostedHull) / 100`.

### Resolution

The operator precedence is **intentional**. Hull values derive from resource costs used to build the unit and scale much higher than shields or damage values. Dividing hull by 100 brings it into a balanced range relative to shields and firepower. Without this scaling, hull would dominate the defense calculation and make shields irrelevant.

Clarifying comments have been added to all three occurrences in `CombatEngine.sol`.

---

## V-004: Raids Can Drain 100% of Planet Resources

**Status:** Resolved
**Severity:** MEDIUM (Game Balance)

### The Issue

When raiding a planet (`FleetManager.sol:730-738`), ALL resources are available as loot (up to cargo capacity):

```solidity
availableTitanium = destRes.titanium;
availableHelium3 = destRes.helium3;
availableDarkMatter = destRes.darkMatter;
```

In OGame, only 50% of stored resources can be looted. Without a loot cap, a single successful raid can completely drain a player.

### Combined Impact with V-002

The 100%-loss-on-defense rule and 100%-loot-on-attack create a volatile win/lose dynamic where combat outcomes are extremely one-sided.

### Resolution

Added `raidLootPercentage` config in `GameConfig.sol` (default 50%). Applied in `FleetResolver.sol:_calculateAndApplyLoot()` to cap available loot for both planet and outpost raids:

```solidity
uint256 lootPct = gameConfig.raidLootPercentage();
availableTitanium = (availableTitanium * lootPct) / 100;
availableHelium3 = (availableHelium3 * lootPct) / 100;
availableDarkMatter = (availableDarkMatter * lootPct) / 100;
```

Owner can adjust via `setRaidLootPercentage(1-100)`.

---

## V-005: addResources() Bypasses Storage Capacity

**Status:** Open
**Severity:** LOW (Design Decision)

### The Issue

When a fleet returns with cargo/loot, `GameState.addResources()` (line 424-434) adds resources without checking storage capacity:

```solidity
function addResources(...) external onlyManager {
    res.titanium += titanium;
    res.helium3 += helium3;
    res.darkMatter += darkMatter;
}
```

Meanwhile, `calculateCurrentResources()` in PlanetManager caps production at storage capacity. This means fleet-delivered resources can exceed storage caps.

### Analysis

This matches OGame behavior (fleet resources bypass storage) and is likely intentional. Should be documented with a comment confirming intent.

---

## V-006: No Emergency Pause Mechanism

**Status:** Open
**Severity:** MEDIUM (Operational)

### The Issue

If a critical exploit is discovered in production, there is no way to halt game operations. All entry points in `NexusGame.sol` are permanently open.

### Suggested Fix

Add OpenZeppelin's `Pausable` to NexusGame with `whenNotPaused` modifiers on state-changing functions.

---

## V-007: No Timelock / Multi-sig on Admin Operations

**Status:** Open
**Severity:** MEDIUM (Operational)

### The Issue

The owner of `NexusGame.sol` can instantly redirect all game state to new contracts via `updateManagers()`, `updateGameState()`, `updateGameConfig()`. If the owner key is compromised, an attacker could:

- Replace GameState with a malicious contract
- Replace managers to steal resources or manipulate game state
- Change GameConfig to break game balance

### Suggested Fix

Add a timelock (e.g., 48h delay) on critical admin operations, or require multi-sig approval.

---

## V-008: Loot Rounding — Dark Matter Gets Remainder

**Status:** Open
**Severity:** LOW

### The Issue

When cargo exceeds capacity (`FleetManager.sol:758-764`), resources are distributed proportionally. Dark matter gets the remainder:

```solidity
loot[2] = cargoCapacity - loot[0] - loot[1];
if (loot[2] > availableDarkMatter) {
    loot[2] = availableDarkMatter;
}
```

When dark matter must be capped to `availableDarkMatter`, the freed cargo space is NOT redistributed to titanium/helium. Minor resource loss for the attacker (~1-2 units due to integer rounding).

### Impact

Negligible in practice.

---

## V-009: Outpost Resource Deduction — No Explicit Bounds Check

**Status:** Open
**Severity:** LOW

### The Issue

`GameState.sol:695`:

```solidity
_raiderOutposts[galaxy][system][position].storedResources -= amount;
```

Relies on Solidity 0.8 checked arithmetic for underflow protection. While safe (reverts on underflow), the generic panic error provides no diagnostic information.

### Suggested Fix

Add explicit require:

```solidity
require(_raiderOutposts[galaxy][system][position].storedResources >= amount, "Insufficient outpost resources");
_raiderOutposts[galaxy][system][position].storedResources -= amount;
```

---

## V-010: MOVE Fleet TOCTOU — Outpost Ownership Not Checked at Resolution

**Status:** Open
**Severity:** HIGH

### The Issue

`FleetResolver._resolveMove()` (line 297-320) delivers ships and cargo to an outpost **without re-checking ownership**. Ownership is validated only at dispatch time (`FleetManager._validateFleetDispatch()` line 297).

```solidity
// At resolution — NO ownership check
} else if (_isOutpostPosition(fleet.destination[2])) {
    gameState.addOutpostResources(..., cargoAmount);
    currentGarrison[i] += fleet.ships[i];
    _setGarrisonAt(fleet.destination, currentGarrison);
}
```

### Attack Scenario

1. Player A owns outpost at (1,1,11), dispatches MOVE fleet with 100 LightFighters + 50,000 titanium cargo
2. Player B sends CAPTURE fleet to (1,1,11) and captures the outpost before Player A's fleet arrives
3. Player A's fleet resolves — ships and cargo are delivered to Player B's outpost
4. Player B gains 100 free LightFighters in garrison + 50,000 titanium

### Suggested Fix

Re-validate ownership at resolution time in `_resolveMove`. If ownership changed, convert to RETURNING status:

```solidity
GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(...);
if (outpost.owner != fleet.owner) {
    // Ownership changed — fleet returns home with cargo
    gameState.updateFleetStatus(fleetId, GameState.FleetStatus.RETURNING);
    return;
}
```

---

## V-011: Crawlers Deployable in Fleets as Cheap Damage Absorbers

**Status:** Open
**Severity:** MEDIUM (Game Balance)

### The Issue

Crawlers have `speed: 0`, `cargoCapacity: 0`, `weaponPower: 1`, `structuralIntegrity: 4000`. The `getSlowestSpeedWithResearch` function (`GameConfig.sol:1352`) skips speed=0 ships, so Crawlers in a mixed fleet travel at the speed of the slowest non-Crawler ship.

In combat, Crawlers absorb damage proportionally (`damageShare = firepower * unitCount / totalUnits`), acting as cheap meat shields (cost: 2000/2000/1000 vs LightFighter: 3000/1000/0 for the same 4000 hull).

### Impact

- Distorts combat balance — mass Crawlers protect valuable ships cheaply
- Crawlers in OGame are planet-bound production boosters, not fleet units
- No validation prevents including Crawlers in `dispatchFleet`

### Suggested Fix

In `_validateFleetDispatch`, reject Crawlers:

```solidity
require(ships[uint256(GameConfig.ShipType.Crawler)] == 0, "Crawlers cannot be dispatched");
```

---

## V-012: Building Cost Overflow — Effective Cap ~47, Not 255

**Status:** Open
**Severity:** MEDIUM

### The Issue

`PlanetManager.upgradeBuilding()` checks `require(currentLevel < 255)`, but `GameConfig.getUpgradeCost()` uses `_pow(costMultiplier, currentLevel)` where `costMultiplier` is typically 150.

```solidity
uint256 multiplier = _pow(config.costMultiplier, currentLevel); // 150^48 > uint256 max
```

`_pow(150, 48)` exceeds `uint256` max (~1.15e77), causing an opaque arithmetic overflow panic. The actual building cap is ~level 47, but the error is a generic panic with no explanation.

### Impact

- Players can't upgrade past ~level 47 with a confusing revert (no clear error message)
- The `require(currentLevel < 255)` check is misleading
- Different buildings may have different effective caps depending on their `costMultiplier`

### Suggested Fix

Cap building level explicitly at a reasonable max with a clear error, or use a safe cost formula:

```solidity
require(currentLevel < MAX_BUILDING_LEVEL, "Max building level reached");
```

---

## V-013: Colonization Allows Unbounded Galaxy/System Coordinates

**Status:** Open
**Severity:** MEDIUM

### The Issue

COLONIZE validation in `_validateFleetDispatch` (`FleetManager.sol:307-318`) only checks:

1. `_isPlanetPosition(destination[2])` — position is 1-10
2. `getCoordinateToPlanet() == 0` — position is empty

No validation on `destination[0]` (galaxy) or `destination[1]` (system) bounds. Players can colonize at coordinates like `[65535, 65535, 1]`, which lie outside the starter planet formula range.

### Impact

- Creates orphaned galaxies that only the colonizer can access
- Galaxy map UI may not handle extreme coordinate values
- Breaks the organized galaxy layout (150 planets per galaxy, 10 per system)
- Also applies to RAID/MOVE/CAPTURE — no galaxy/system bounds on any mission

### Suggested Fix

Add bounds validation to `_validateFleetDispatch`:

```solidity
require(destination[0] >= 1 && destination[0] <= MAX_GALAXY, "Invalid galaxy");
require(destination[1] >= 1 && destination[1] <= MAX_SYSTEM, "Invalid system");
```

---

## V-014: Combat Division by Zero if Ship/Defense Config Has Low Hull

**Status:** Open
**Severity:** MEDIUM

### The Issue

CombatEngine computes `destroyed = damageShare / defense` where `defense = boostedShield + boostedHull / 100`. If a unit has `structuralIntegrity < 100` and `shieldPower == 0`, then `defense = 0 + 0 = 0`, causing a division by zero revert.

```solidity
uint256 defense = boostedShield + boostedHull / 100;
uint256 destroyed = damageShare / defense; // REVERTS if defense == 0
```

### Current State

All current ship/defense configs have `structuralIntegrity >= 4000`, so this is safe with current values. However, if the `GameConfig` owner later modifies ship stats (e.g., sets a unit to `structuralIntegrity: 50, shieldPower: 0`), **all combat** involving that unit would permanently revert.

### Suggested Fix

Add a minimum defense floor:

```solidity
uint256 defense = boostedShield + boostedHull / 100;
if (defense == 0) defense = 1;
```

---

## V-015: Fleet Destination Position 16+ Silently Accepted

**Status:** Open
**Severity:** LOW-MEDIUM

### The Issue

In `_validateFleetDispatch`, RAID/CAPTURE/MOVE missions validate positions 1-10 (planets) and 11-15 (outposts), but positions 16-65535 fall through with **no validation**:

```solidity
if (_isPlanetPosition(destination[2])) {        // 1-10
    // validate planet/outpost
} else if (_isOutpostPosition(destination[2])) { // 11-15
    // validate outpost
}
// Positions 16-65535: NO VALIDATION — silently accepted
```

A fleet dispatched to position 16+ passes validation, consumes fuel, and completes a round trip to an empty location.

### Suggested Fix

Add an `else revert` clause for all mission types:

```solidity
} else {
    revert("Invalid destination position");
}
```

---

## V-016: `uint32` Timestamp Truncation in Build/Travel Times

**Status:** Open
**Severity:** LOW

### The Issue

Multiple locations cast `block.timestamp + buildTime` to `uint32`:

```solidity
uint32 completionTime = uint32(block.timestamp + buildTime);
```

`uint32` max is 4,294,967,295 (February 7, 2106). If the sum exceeds this, the value silently wraps, potentially producing a past timestamp that allows immediate completion.

Similarly, `calculateTravelTime` returns `uint32(time)` (`GameConfig.sol:1114`).

### Impact

Theoretical until 2106 for normal operations. Extremely high `buildTime` values from high building levels (before the V-012 overflow cap) could potentially trigger this sooner.

---

## V-017: No Debris Field or Recovery From Combat Losses

**Status:** Open
**Severity:** LOW (Game Design)

### The Issue

When ships are destroyed in combat, they vanish entirely. In OGame, 30% of metal+crystal costs of destroyed ships become a debris field that Recyclers can collect.

### Combined Impact

Combined with V-004 (100% loot on raids) and V-002 (total attacker loss on draw), combat outcomes are extremely punitive:

- Attacker wins: defender loses all resources + all ships
- Defender wins or draw: attacker loses all ships, no recovery
- No debris field means Recyclers have no purpose

This creates a "cold war" meta where combat is rarely worth the risk, stifling active gameplay.

---

## Non-Vulnerabilities (Investigated and Cleared)

### Ship Deduction Order in dispatchFleet — NOT A BUG

Ships are deducted before fuel validation (`FleetManager.sol:225-228`), but if fuel validation reverts, the ENTIRE transaction rolls back atomically. No state is persisted on revert. The ordering is safe.

### Complete Functions Callable by Anyone — BY DESIGN

`completeUpgrade()`, `completeShipBuild()`, `completeDefenseBuild()`, `completeResearch()` are intentionally callable by any address. They only succeed when the timer has expired. This enables gas sponsoring and helper bots. Code comments confirm: "Can be called by anyone when timer is up."

### Reentrancy on Complete Functions — NOT EXPLOITABLE

These functions lack `nonReentrant` but make no external calls to untrusted contracts (only to GameState/GameConfig which are trusted).

### Division by Zero in Combat — PROTECTED

Advantage values default to 1 when not found, preventing division by zero in firepower calculations.

---

## Design Observations (Not Bugs)

1. **Crawler production bonus not implemented** — Design docs mention +0.02% boost per Crawler, but no such bonus exists in GameConfig or production calculations.

2. **Espionage Technology not implemented** — Design docs reference it as a researchable tech, but it's absent from the ResearchType enum.

3. **Research is per-player, not per-planet** — Only one active research queue per player across all planets. Deliberate design choice.

4. **Colonized planets have no initial buildings** — New colonies start with zero-level everything. Buildings default to 0 in uninitialized storage. Players must build from scratch.

5. **Defenses have no combat advantages** — Ships have advantage matrices (`_advantage` mapping in GameConfig), but defense firepower in CombatEngine is flat (`CombatEngine.sol:241-248`). In OGame, defenses have rapid-fire against certain ships.

6. **Single build queue per type** — Each planet has exactly one queue for buildings, ships, and defenses. Queuing multiple ship batches requires waiting for each to complete. By-design but limits gameplay flow.

---

## Summary Table

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| V-001 | Coordinate collision / Gas DoS | HIGH | Partially Mitigated |
| V-002 | Combat draw = total attacker loss | HIGH | Open |
| V-003 | Combat defense formula precedence | MEDIUM | Resolved (By Design) |
| V-004 | 100% loot on raids | MEDIUM | Resolved |
| V-005 | addResources bypasses storage caps | LOW | Open (likely by design) |
| V-006 | No emergency pause mechanism | MEDIUM | Open |
| V-007 | No admin timelock / multi-sig | MEDIUM | Open |
| V-008 | Loot rounding (dark matter remainder) | LOW | Open |
| V-009 | Outpost deduction no bounds check | LOW | Open |
| V-010 | MOVE fleet delivers to captured outpost (TOCTOU) | HIGH | Open |
| V-011 | Crawlers deployable as cheap fleet shields | MEDIUM | Open |
| V-012 | Building level cap ~47 due to `_pow` overflow | MEDIUM | Open |
| V-013 | Unbounded galaxy/system in colonization | MEDIUM | Open |
| V-014 | Combat division by zero if unit hull < 100 | MEDIUM | Open |
| V-015 | Fleet destination position 16+ silently accepted | LOW-MEDIUM | Open |
| V-016 | `uint32` timestamp truncation | LOW | Open |
| V-017 | No debris field or combat loss recovery | LOW | Open |
