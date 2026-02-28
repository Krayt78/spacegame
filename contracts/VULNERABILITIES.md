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

## V-002: Combat Draw = Total Attacker Loss

**Status:** Open
**Severity:** HIGH (Game Balance)

### The Bug

After 6 rounds of combat, if ANY defender unit survives, the attacker loses ALL ships. The code in `FleetManager.sol:1080-1086` zeros out all attacker ships when `attackerWon == false`:

```solidity
result.attackerWon = (defenderRemaining == 0);
if (!result.attackerWon) {
    for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
        result.survivingAttackers[i] = 0;
    }
}
```

### Impact

In OGame, after 6 rounds of combat, both sides keep their surviving units and the attacker retreats. Here, the attacker must achieve a **complete wipe** of all defenders or lose everything. A single surviving defender unit means 100% attacker loss.

This makes attacking extremely risky and defense overpowered. Players are strongly discouraged from attacking unless they have overwhelming force.

### Affected Code

- Combat resolution: `FleetManager.sol:1080-1086`
- RAID handling (attacker loss branch): `FleetManager.sol:636-653`
- CAPTURE handling (attacker loss branch): `FleetManager.sol:826-844`

### Suggested Fix

When `!attackerWon`, keep `result.survivingAttackers` as-is (the per-round calculations already correctly track survivors). Introduce a "draw" outcome where the fleet returns with surviving ships instead of being deleted:

```solidity
result.attackerWon = (defenderRemaining == 0);
// Remove the block that zeros out attacker ships on loss
// Instead, handle "draw" (attacker retreats with survivors) in _resolveRaid/_resolveCapture
```

---

## V-003: Combat Defense Formula — Operator Precedence

**Status:** Open
**Severity:** MEDIUM

### The Issue

The defense calculation in `FleetManager.sol` (lines 1026, 1043, 1060) uses:

```solidity
uint256 defense = boostedShield + boostedHull / 100;
```

Due to operator precedence, this evaluates as `boostedShield + (boostedHull / 100)`, NOT `(boostedShield + boostedHull) / 100`.

### Concrete Example (SmallCargo, no research)

- `boostedShield = 10 * 100/100 = 10`
- `boostedHull = 4000 * 100/100 = 4000`
- **Current:** `defense = 10 + (4000/100) = 50` — shield is 20% of defense
- **Alternative:** `(10 + 4000)/100 = 40` — shield is 0.25% of defense (irrelevant)

### Analysis

The current formula makes shield meaningful relative to hull, which may be intentional. However, it appears across 3 identical blocks without comment. If intentional, it should be documented. If not, it changes combat balance by ~25%.

### Suggestion

Add a comment clarifying intent, or add parentheses if the alternative was intended.

---

## V-004: Raids Can Drain 100% of Planet Resources

**Status:** Open
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

### Suggested Fix

Cap available resources at 50% (or a configurable percentage in GameConfig):

```solidity
availableTitanium = destRes.titanium / 2;
availableHelium3 = destRes.helium3 / 2;
availableDarkMatter = destRes.darkMatter / 2;
```

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

---

## Summary Table

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| V-001 | Coordinate collision / Gas DoS | HIGH | Partially Mitigated |
| V-002 | Combat draw = total attacker loss | HIGH | Open |
| V-003 | Combat defense formula precedence | MEDIUM | Open |
| V-004 | 100% loot on raids | MEDIUM | Open |
| V-005 | addResources bypasses storage caps | LOW | Open (likely by design) |
| V-006 | No emergency pause mechanism | MEDIUM | Open |
| V-007 | No admin timelock / multi-sig | MEDIUM | Open |
| V-008 | Loot rounding (dark matter remainder) | LOW | Open |
| V-009 | Outpost deduction no bounds check | LOW | Open |
