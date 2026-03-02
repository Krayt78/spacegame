# Contracts Reference

## Contract Architecture

10 contracts in a multi-contract pattern (all under 24KB bytecode limit):

| Contract | Role | Size |
|----------|------|------|
| NexusGame.sol | Router — delegates all calls to managers | 17.01 KB |
| GameState.sol | Single storage contract for all state | 18.90 KB |
| GameConfig.sol | All costs, rates, formulas, enums | 10.56 KB |
| PlanetManager.sol | Planets, buildings, resources | 11.96 KB |
| ShipManager.sol | Ship building queue | 7.87 KB |
| FleetManager.sol | Fleet dispatch, movement, outposts | 21.43 KB |
| FleetResolver.sol | Fleet resolution, combat integration, loot | 23.13 KB |
| CombatEngine.sol | 6-round iterative combat math | 5.86 KB |
| ResearchManager.sol | Research queue, 13 technologies | 7.21 KB |
| DefenseManager.sol | Defense building, 8 types | 8.02 KB |

Access control:
- Managers use `onlyRouter` modifier (only NexusGame can call them)
- GameState uses `onlyManager` modifier (only authorized managers can write)

## Deployed Addresses

```typescript
// Local development (Hardhat)
export const NEXUS_GAME_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
export const GAME_CONFIG_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

// Update these after testnet deployment
```

## Enums (GameConfig.sol)

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

enum ShipType {
    NONE,              // 0
    SmallCargo,        // 1
    LargeCargo,        // 2
    LightFighter,      // 3
    HeavyFighter,      // 4
    Cruiser,           // 5
    Battleship,        // 6
    Battlecruiser,     // 7
    Bomber,            // 8
    Destroyer,         // 9
    ColonyShip,        // 10
    Recycler,          // 11
    Crawler            // 12
}

enum DefenseType {
    NONE,              // 0
    RocketLauncher,    // 1
    LightLaser,        // 2
    HeavyLaser,        // 3
    IonCannon,         // 4
    GaussCannon,       // 5
    PlasmaTurret,      // 6
    SmallShieldDome,   // 7
    LargeShieldDome    // 8
}

enum ResearchType {
    NONE,                   // 0
    COMBUSTION_DRIVE,       // 1
    IMPULSE_DRIVE,          // 2
    HYPERSPACE_DRIVE,       // 3
    WEAPON_TECH,            // 4
    SHIELDING_TECH,         // 5
    ARMOUR_TECH,            // 6
    COMPUTER_TECH,          // 7
    STEALTH_SYSTEMS,        // 8
    ION_TECH,               // 9
    HYPERSPACE_TECH,        // 10
    LASER_TECH,             // 11
    PLASMA_TECH,            // 12
    ASTROPHYSICS            // 13
}

enum OutpostType {
    NONE,                   // 0
    TITANIUM_MINE,          // 1
    HELIUM3_LAB,            // 2
    DARKMATTER_REFINERY     // 3
}
```

```solidity
// In NexusGame.sol and GameState.sol
enum FleetMission { NONE, RAID, CAPTURE, MOVE, COLONIZE }
enum FleetStatus { NONE, TRAVELING, RETURNING }
```

## Key Structs (GameState.sol)

```solidity
struct Planet {
    address owner;
    uint16[3] coordinates;  // [galaxy, system, position]
    string name;
    uint32 createdAt;
    bool exists;
}

struct Buildings {
    uint8 titaniumExtractor;
    uint8 helium3Harvester;
    uint8 darkMatterCollector;
    uint8 titaniumVault;
    uint8 helium3Tank;
    uint8 darkMatterContainment;
    uint8 shipyard;
    uint8 researchNode;
    uint8 undergroundBunker;
}

struct Resources {
    uint256 titanium;
    uint256 helium3;
    uint256 darkMatter;
    uint32 lastClaimed;
}

struct BuildQueue {
    GameConfig.BuildingType buildingType;
    uint8 targetLevel;
    uint32 completionTime;
}

struct ShipQueue {
    GameConfig.ShipType shipType;
    uint256 quantity;
    uint32 completionTime;
}

struct DefenseQueue {
    GameConfig.DefenseType defenseType;
    uint256 quantity;
    uint32 completionTime;
}

struct ResearchLevels {
    uint8 combustionDrive;
    uint8 impulseDrive;
    uint8 hyperspaceDrive;
    uint8 weaponTech;
    uint8 shieldingTech;
    uint8 armourTech;
    uint8 computerTech;
    uint8 stealthSystems;
    uint8 ionTech;
    uint8 hyperspaceTech;
    uint8 laserTech;
    uint8 plasmaTech;
    uint8 astrophysics;
}

struct ResearchQueue {
    GameConfig.ResearchType researchType;
    uint8 targetLevel;
    uint32 completionTime;
}

struct Fleet {
    address owner;
    uint256 originPlanetId;
    uint16[3] destination;
    FleetMission mission;
    FleetStatus status;
    uint256[13] ships;       // Fixed-size array indexed by ShipType
    uint256 departureTime;
    uint256 arrivalTime;
    uint256 cargoTitanium;
    uint256 cargoHelium3;
    uint256 cargoDarkMatter;
}

struct RaiderOutpost {
    GameConfig.OutpostType outpostType;
    address controller;
    uint256[13] garrisonShips;
    uint256 titaniumStored;
    uint256 helium3Stored;
    uint256 darkMatterStored;
    uint32 lastCollected;
    bool exists;
}

struct BattleReport {
    address attacker;
    address defender;
    uint256 attackerPlanetId;
    uint16[3] defenderCoords;
    uint256[13] attackerShipsBefore;
    uint256[13] defenderShipsBefore;
    uint256[9] defenderDefensesBefore;
    uint256[13] attackerShipsAfter;
    uint256[13] defenderShipsAfter;
    uint256[9] defenderDefensesAfter;
    uint256 titaniumPlundered;
    uint256 helium3Plundered;
    uint256 darkMatterPlundered;
    bool attackerWon;
    uint32 timestamp;
}
```

## NexusGame.sol — Router API

### Write Functions

```solidity
// === Planet ===
function claimStarterPlanet(string calldata planetName) external;

// === Resources ===
function claimResources(uint256 planetId) external;

// === Buildings ===
function upgradeBuilding(uint256 planetId, GameConfig.BuildingType buildingType) external;
function completeUpgrade(uint256 planetId) external;
function cancelUpgrade(uint256 planetId) external;

// === Ships ===
function buildShips(uint256 planetId, GameConfig.ShipType shipType, uint256 quantity) external;
function completeShipBuild(uint256 planetId) external;
function cancelShipBuild(uint256 planetId) external;

// === Defenses ===
function buildDefenses(uint256 planetId, GameConfig.DefenseType defenseType, uint256 quantity) external;
function completeDefenseBuild(uint256 planetId) external;
function cancelDefenseBuild(uint256 planetId) external;

// === Research ===
function startResearch(uint256 planetId, GameConfig.ResearchType researchType) external;
function completeResearch(address player) external;
function cancelResearch(uint256 planetId) external;

// === Fleet ===
function dispatchFleet(
    uint256 originPlanetId,
    uint16[3] calldata destination,
    uint8 mission,
    uint256[13] calldata ships,
    uint256 cargoTitanium, uint256 cargoHelium3, uint256 cargoDarkMatter
) external;
function dispatchFleetFromOutpost(
    uint16[3] calldata outpostCoords,
    uint16[3] calldata destination,
    uint8 mission,
    uint256[13] calldata ships
) external;
function resolveFleet(uint256 fleetId) external;
function completeFleet(uint256 fleetId) external;
```

### Read Functions

```solidity
// === Planet Data ===
function getPlanet(uint256 planetId) external view returns (Planet, Buildings, Resources, BuildQueue);
function getSystemPlanets(uint16 galaxy, uint16 system) external view returns (uint256[10] memory);
function getPlayerPlanetId(address player) external view returns (uint256);
function getPlayerPlanets(address player) external view returns (uint256[] memory);
function getPlayerPlanetCount(address player) external view returns (uint256);
function hasPlanet(address player) external view returns (bool);
function getPlanetIdAtCoordinates(uint16 galaxy, uint16 system, uint16 position) external view returns (uint256);

// === Resources ===
function calculateCurrentResources(uint256 planetId) external view returns (uint256 titanium, uint256 helium3, uint256 darkMatter);
function getProductionRates(uint256 planetId) external view returns (uint256 titaniumPerHour, uint256 helium3PerHour, uint256 darkMatterPerHour);
function canAffordUpgrade(uint256 planetId, GameConfig.BuildingType buildingType) external view returns (bool);
function getPlunderableResources(uint256 planetId) external view returns (uint256 titanium, uint256 helium3, uint256 darkMatter);

// === Ships & Defenses ===
function getShips(uint256 planetId) external view returns (uint256[13] memory);
function getShipCount(uint256 planetId, uint8 shipType) external view returns (uint256);
function getDefenses(uint256 planetId) external view returns (uint256[9] memory);
function getDefenseCount(uint256 planetId, uint8 defenseType) external view returns (uint256);
function getShipCombatStats(GameConfig.ShipType shipType, address player) external view returns (GameConfig.CombatStats memory);

// === Fleet ===
function getFleet(uint256 fleetId) external view returns (GameState.Fleet memory);
function getPlayerFleetIds(address player) external view returns (uint256[] memory);
function getPlayerFleetCount(address player) external view returns (uint256);
function getStationedShips(uint16[3] calldata coords) external view returns (uint256[13] memory);

// === Research ===
function getPlayerResearch(address player) external view returns (GameState.ResearchLevels memory);
function getResearchQueue(address player) external view returns (GameState.ResearchQueue memory);

// === Outposts ===
function getOutpost(uint16 galaxy, uint16 system, uint16 position) external view returns (GameState.RaiderOutpost memory);
function getSystemOutposts(uint16 galaxy, uint16 system) external view returns (GameState.RaiderOutpost[5] memory);
function calculateOutpostResources(uint16 galaxy, uint16 system, uint16 position) external view returns (uint256 titanium, uint256 helium3, uint256 darkMatter);
function getPlayerOutposts(address player) external view returns (uint16[3][] memory);

// === Battle Reports ===
function getBattleReport(uint256 reportId) external view returns (GameState.BattleReport memory);
function getPlayerReportIds(address player) external view returns (uint256[] memory);
function getPlayerReportCount(address player) external view returns (uint256);
function getPlayerRecentReports(address player, uint256 count) external view returns (uint256[] memory);
```

## Frontend ABI Usage

ABIs are imported from JSON artifacts — NEVER manually defined:

```typescript
import NexusGameArtifact from '@/contracts/abi/NexusGame.json';
import GameConfigArtifact from '@/contracts/abi/GameConfig.json';

export const nexusGameAbi = NexusGameArtifact.abi as const;
export const gameConfigAbi = GameConfigArtifact.abi as const;
```

ABIs are exported via `npm run export-abi` in the contracts directory and placed in `frontend/src/contracts/abi/`.

## Adding New Contract Functions

When adding new functions to the contract:

1. **Add to the appropriate Manager** with proper access control (`onlyRouter`)
2. **Add the route in NexusGame.sol** that delegates to the manager
3. **Add storage in GameState.sol** if new state is needed (`onlyManager`)
4. **Add config in GameConfig.sol** if new constants/formulas are needed
5. **Compile**: `npx hardhat compile` and check all contracts stay under 24KB
6. **Export ABI**: `npm run export-abi` in contracts dir
7. **Copy ABI** to `frontend/src/contracts/abi/`
8. **Create hook** in `frontend/src/hooks/useNexusGame.ts`
9. **Update types** in `frontend/src/types/game.ts` if needed
