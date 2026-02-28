# Contracts Reference

## Deployed Addresses

```typescript
// Local development (Hardhat)
export const NEXUS_GAME_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
export const GAME_CONFIG_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

// Update these after testnet deployment
```

## NexusGame.sol - Full ABI

### Structs

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
    uint8 fusionReactor;
    uint8 titaniumVault;
    uint8 helium3Tank;
    uint8 darkMatterContainment;
    uint8 assemblyBay;
    uint8 researchNode;
}

struct Resources {
    uint256 titanium;
    uint256 helium3;
    uint256 darkMatter;
    uint32 lastClaimed;  // Timestamp
}

struct BuildQueue {
    GameConfig.BuildingType buildingType;
    uint8 targetLevel;
    uint32 completionTime;
}
```

### Events

```solidity
event PlanetClaimed(address indexed player, uint256 indexed planetId, uint16[3] coordinates, string name);
event ResourcesClaimed(uint256 indexed planetId, uint256 titanium, uint256 helium3, uint256 darkMatter);
event BuildingUpgradeStarted(uint256 indexed planetId, GameConfig.BuildingType buildingType, uint8 newLevel, uint32 completionTime);
event BuildingUpgradeCompleted(uint256 indexed planetId, GameConfig.BuildingType buildingType, uint8 newLevel);
event BuildingUpgradeCancelled(uint256 indexed planetId, GameConfig.BuildingType buildingType);
```

### Read Functions

```solidity
// Check if address has a planet
function hasPlanet(address player) external view returns (bool);

// Get player's planet ID (returns 0 if none)
function playerPlanet(address player) external view returns (uint256);

// Convenience wrapper for playerPlanet
function getPlayerPlanetId(address player) external view returns (uint256);

// Get complete planet data
function getPlanet(uint256 planetId) external view returns (
    Planet memory planet,
    Buildings memory buildings,
    Resources memory resources,
    BuildQueue memory queue
);

// Calculate current resources (includes pending production, doesn't claim)
function calculateCurrentResources(uint256 planetId) external view returns (
    uint256 titanium,
    uint256 helium3,
    uint256 darkMatter
);

// Get production rates per hour
function getProductionRates(uint256 planetId) external view returns (
    uint256 titaniumPerHour,
    uint256 helium3PerHour,
    uint256 darkMatterPerHour,
    uint256 energy
);
```

### Write Functions

```solidity
// Claim starter planet (one per address)
function claimStarterPlanet(string memory planetName) external;

// Start building upgrade (deducts resources, starts timer)
function upgradeBuilding(GameConfig.BuildingType buildingType) external;

// Complete upgrade after timer expires (anyone can call)
function completeUpgrade(uint256 planetId) external;

// Cancel in-progress upgrade (50% resource refund)
function cancelUpgrade() external;

// Claim accumulated resources (updates lastClaimed timestamp)
function claimResources() external;
```

## GameConfig.sol - Full ABI

### Enums

```solidity
enum BuildingType {
    NONE,                    // 0
    TITANIUM_EXTRACTOR,      // 1
    HELIUM3_HARVESTER,       // 2
    DARKMATTER_COLLECTOR,    // 3
    FUSION_REACTOR,          // 4
    TITANIUM_VAULT,          // 5
    HELIUM3_TANK,            // 6
    DARKMATTER_CONTAINMENT,  // 7
    ASSEMBLY_BAY,            // 8
    RESEARCH_NODE            // 9
}
```

### Structs

```solidity
struct Cost {
    uint256 titanium;
    uint256 helium3;
    uint256 darkMatter;
}

struct BuildingConfig {
    Cost baseCost;
    uint16 costMultiplier;       // x100 (150 = 1.5x)
    uint256 baseProduction;      // per hour
    uint16 productionMultiplier; // x100
    uint256 baseCapacity;        // for storage
    uint16 capacityMultiplier;   // x100
    uint16 baseTime;             // seconds
}
```

### Read Functions

```solidity
// Get starting resources for new players
function getStartingResources() external view returns (Cost memory);

// Calculate upgrade cost for building at current level
function getUpgradeCost(BuildingType buildingType, uint8 currentLevel) external view returns (Cost memory);

// Get production per hour for building at level
function getProduction(BuildingType buildingType, uint8 level) external view returns (uint256);

// Get storage capacity for storage building at level
function getStorageCapacity(BuildingType buildingType, uint8 level) external view returns (uint256);

// Get build time in seconds
function getBuildTime(BuildingType buildingType, uint8 currentLevel) external view returns (uint256);
```

## Frontend ABI Definitions

```typescript
// In src/lib/contracts.ts

export const nexusGameAbi = [
  // hasPlanet
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'hasPlanet',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // getPlayerPlanetId
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'getPlayerPlanetId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // getPlanet - returns tuple of (Planet, Buildings, Resources, BuildQueue)
  {
    inputs: [{ name: 'planetId', type: 'uint256' }],
    name: 'getPlanet',
    outputs: [
      {
        name: 'planet',
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'coordinates', type: 'uint16[3]' },
          { name: 'name', type: 'string' },
          { name: 'createdAt', type: 'uint32' },
          { name: 'exists', type: 'bool' },
        ],
      },
      {
        name: 'buildings',
        type: 'tuple',
        components: [
          { name: 'titaniumExtractor', type: 'uint8' },
          { name: 'helium3Harvester', type: 'uint8' },
          { name: 'darkMatterCollector', type: 'uint8' },
          { name: 'fusionReactor', type: 'uint8' },
          { name: 'titaniumVault', type: 'uint8' },
          { name: 'helium3Tank', type: 'uint8' },
          { name: 'darkMatterContainment', type: 'uint8' },
          { name: 'assemblyBay', type: 'uint8' },
          { name: 'researchNode', type: 'uint8' },
        ],
      },
      {
        name: 'resources',
        type: 'tuple',
        components: [
          { name: 'titanium', type: 'uint256' },
          { name: 'helium3', type: 'uint256' },
          { name: 'darkMatter', type: 'uint256' },
          { name: 'lastClaimed', type: 'uint32' },
        ],
      },
      {
        name: 'queue',
        type: 'tuple',
        components: [
          { name: 'buildingType', type: 'uint8' },
          { name: 'targetLevel', type: 'uint8' },
          { name: 'completionTime', type: 'uint32' },
        ],
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // calculateCurrentResources
  {
    inputs: [{ name: 'planetId', type: 'uint256' }],
    name: 'calculateCurrentResources',
    outputs: [
      { name: 'titanium', type: 'uint256' },
      { name: 'helium3', type: 'uint256' },
      { name: 'darkMatter', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // getProductionRates
  {
    inputs: [{ name: 'planetId', type: 'uint256' }],
    name: 'getProductionRates',
    outputs: [
      { name: 'titaniumPerHour', type: 'uint256' },
      { name: 'helium3PerHour', type: 'uint256' },
      { name: 'darkMatterPerHour', type: 'uint256' },
      { name: 'energy', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // claimStarterPlanet
  {
    inputs: [{ name: 'planetName', type: 'string' }],
    name: 'claimStarterPlanet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // upgradeBuilding
  {
    inputs: [{ name: 'buildingType', type: 'uint8' }],
    name: 'upgradeBuilding',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // completeUpgrade
  {
    inputs: [{ name: 'planetId', type: 'uint256' }],
    name: 'completeUpgrade',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // cancelUpgrade
  {
    inputs: [],
    name: 'cancelUpgrade',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // claimResources
  {
    inputs: [],
    name: 'claimResources',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
```

## Adding New Contract Functions

When adding new functions to the contract:

1. **Add to Solidity contract** with proper access control
2. **Export ABI** using `npm run export-abi` in contracts repo
3. **Update `src/lib/contracts.ts`** with new ABI entries
4. **Create hook** in `src/hooks/useNexusGame.ts`
5. **Update types** in `src/types/game.ts` if needed

### Example: Adding Ship Building

```solidity
// In NexusGame.sol
struct Ship {
    uint8 shipType;
    uint256 quantity;
}

struct ShipQueue {
    uint8 shipType;
    uint256 quantity;
    uint32 completionTime;
}

mapping(uint256 => Ship[]) public planetShips;
mapping(uint256 => ShipQueue) public shipQueues;

event ShipBuildStarted(uint256 indexed planetId, uint8 shipType, uint256 quantity, uint32 completionTime);
event ShipBuildCompleted(uint256 indexed planetId, uint8 shipType, uint256 quantity);

function buildShips(uint8 shipType, uint256 quantity) external nonReentrant {
    uint256 planetId = playerPlanet[msg.sender];
    require(planetId != 0, "No planet owned");
    require(shipQueues[planetId].completionTime == 0, "Ship queue busy");
    // ... cost deduction, queue setup
}
```
