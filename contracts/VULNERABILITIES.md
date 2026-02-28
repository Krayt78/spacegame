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
