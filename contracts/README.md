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

### Buildings

| Building | Type | Description |
|----------|------|-------------|
| Titanium Extractor | Production | Produces titanium |
| Helium-3 Harvester | Production | Produces helium-3 |
| Dark Matter Collector | Production | Produces dark matter |
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



Contract	Address
GameConfig	0xcde5bacBA284223e957B20e76561a3286658b73a
GameState	0xf362fac151824277Ae7dA651d883B1ce0c311C94
NexusGame	0xD7a6d3842E98c103F7CfBa73c792EE87a925c601
PlanetManager	0x4fE083188417eF2919A1dB10103092A2704ECE4c
ShipManager	0x65AF15dfb2F4467C273908190aE3A7E049b54FdF
CombatEngine	0xcBbe7F84a89e1BfC392aD0371265c2421A7CBc09
FleetResolver	0x42E0a7CB2819a70Fd4a98C20914f24B4592F3612
FleetManager	0xD7df24Fdc4392ECfdf2C032Ea33C50f4D6fE67aF
ResearchManager	0xa7A6eC2ca23b91657a83d0e262C78E3A9A806782
DefenseManager	0x87677B686Ab46934454f8ED2d303f2e42739b7B0