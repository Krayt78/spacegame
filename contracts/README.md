# Nexus Protocol - Smart Contracts

On-chain space strategy game built on Polkadot AssetHub.

## Architecture

The game uses a multi-contract architecture to stay under Solidity's 24KB bytecode limit:

```
┌─────────────────────────────────────────────────────┐
│              NexusGame.sol (Router)                 │
│      Entry point - routes calls to managers         │
└───────────┬──────────────┬──────────────┬───────────┘
            │              │              │
     ┌──────▼─────┐  ┌─────▼─────┐  ┌─────▼──────┐
     │  Planet    │  │   Ship    │  │   Fleet    │
     │  Manager   │  │  Manager  │  │  Manager   │
     └──────┬─────┘  └─────┬─────┘  └─────┬──────┘
            │              │              │
            └──────────────┼──────────────┘
                           │
                    ┌──────▼──────┐
                    │  GameState  │
                    │  (storage)  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ GameConfig  │
                    │  (config)   │
                    └─────────────┘
```

## Contracts

| Contract | Size | Description |
|----------|------|-------------|
| NexusGame.sol | 11.53 KB | Router - entry point, routes to managers |
| GameState.sol | 12.00 KB | Centralized storage with access control |
| GameConfig.sol | 5.19 KB | Game configuration (costs, rates) |
| PlanetManager.sol | 11.22 KB | Planet, building, resource logic |
| ShipManager.sol | 6.66 KB | Ship building logic |
| FleetManager.sol | 22.73 KB | Fleet, combat, outpost logic |

**Total: ~69 KB** (split across 6 contracts, all under 24KB limit)

## Setup

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Test

```bash
npm test
```

## Deploy

The deployment script handles the multi-contract setup automatically:

1. Deploy GameConfig (configuration)
2. Deploy GameState (storage)
3. Deploy NexusGame (router)
4. Deploy managers (PlanetManager, ShipManager, FleetManager)
5. Configure managers in NexusGame
6. Authorize managers in GameState

Local network:
```bash
# Terminal 1
npm run node

# Terminal 2
npm run deploy:local
```

Polkadot Hub TestNet:
```bash
# Copy .env.example to .env and fill in your private key
cp .env.example .env

# Deploy
npm run deploy:testnet
```

## Export ABIs

```bash
npm run export-abi
```

ABIs will be saved to `/abi` directory for frontend integration.

## Game Mechanics

### Resources
- **Titanium** - Common structural material
- **Helium-3** - Rare isotope for advanced tech
- **Dark Matter** - Exotic fuel source
- **Energy** - Powers buildings (calculated, not stored)

### Buildings

| Building | Type | Description |
|----------|------|-------------|
| Titanium Extractor | Production | Produces titanium |
| Helium-3 Harvester | Production | Produces helium-3 |
| Dark Matter Collector | Production | Produces dark matter |
| Fusion Reactor | Production | Generates energy |
| Titanium Vault | Storage | Stores titanium |
| Helium-3 Tank | Storage | Stores helium-3 |
| Dark Matter Containment | Storage | Stores dark matter |
| Shipyard | Facility | Builds ships |
| Research Node | Facility | Enables research |

### Upgrade Flow
1. Player calls `upgradeBuilding(buildingType)`
2. Contract checks resources and adds to build queue
3. After time passes, anyone can call `completeUpgrade(planetId)`
4. Building level increments

### Key Functions

All functions are called through NexusGame (router):

```solidity
// Claim your starter planet
claimStarterPlanet(string name)

// Start a building upgrade
upgradeBuilding(BuildingType buildingType)

// Complete upgrade when timer is done
completeUpgrade(uint256 planetId)

// Cancel upgrade (50% resource refund)
cancelUpgrade()

// Claim accumulated resources
claimResources()

// Build ships (requires Shipyard level 1)
buildShips(ShipType shipType, uint256 quantity)

// Complete ship build when timer is done
completeShipBuild(uint256 planetId)

// Dispatch a fleet on a mission
dispatchFleet(ships, destination, mission, cargo)

// View current resources (without claiming)
calculateCurrentResources(uint256 planetId)

// Get complete planet info
getPlanet(uint256 planetId)
```

## Project Structure

```
contracts/
  GameConfig.sol      # Game configuration (costs, rates)
  GameState.sol       # Centralized storage with access control
  NexusGame.sol       # Router (entry point for all interactions)
  PlanetManager.sol   # Planet, building, resource logic
  ShipManager.sol     # Ship building logic
  FleetManager.sol    # Fleet, combat, outpost logic
scripts/
  deploy.ts           # Multi-contract deployment script
  exportABI.js        # ABI export utility
test/
  NexusGame.test.ts   # Test suite (57 tests)
deployments/          # Deployment artifacts
abi/                  # Exported ABIs
```

## License

MIT
