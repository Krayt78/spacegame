import { ethers } from "hardhat";

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  // Target building levels — shipyard 4 required for colony ship
  TARGET_BUILDINGS: {
    titaniumExtractor: 5,
    helium3Harvester: 5,
    darkMatterCollector: 3,
    titaniumVault: 3,
    helium3Tank: 3,
    darkMatterContainment: 3,
    shipyard: 4,      // Required for ColonyShip
    researchNode: 3,   // Faster research
  },

  // Target resources — enough to build colony ship + carry startup cargo
  TARGET_RESOURCES: {
    titanium: 50000n,
    helium3: 50000n,
    darkMatter: 30000n,
  },

  // Target research levels
  TARGET_RESEARCH: {
    computerTech: 2,      // Fleet dispatch + 2 concurrent fleets
    impulseDrive: 3,      // Required for ColonyShip
    astrophysics: 2,      // Grants 1 colony slot (level / 2)
    combustionDrive: 1,   // Speed bonus for combustion ships
  },

  // Fleet composition
  FLEET: {
    colonyShips: 1,      // The colony ship itself
    smallCargo: 2,       // Escort with extra cargo (2 x 5000 = 10000)
    lightFighters: 3,    // Protection (3 x 50 attack = 150)
  },

  // Suggested cargo for colonization mission
  SUGGESTED_CARGO: {
    titanium: 5000n,
    helium3: 5000n,
    darkMatter: 2000n,
  },
};

// Ship type constants (from GameConfig.ShipType enum)
const ShipType = {
  SmallCargo: 1,
  LargeCargo: 2,
  LightFighter: 3,
  ColonyShip: 10,
};

// Research type constants (from GameConfig.ResearchType enum)
const ResearchType = {
  COMBUSTION_DRIVE: 1,
  IMPULSE_DRIVE: 2,
  HYPERSPACE_DRIVE: 3,
  WEAPON_TECH: 4,
  SHIELDING_TECH: 5,
  ARMOUR_TECH: 6,
  COMPUTER_TECH: 7,
  STEALTH_SYSTEMS: 8,
  ION_TECH: 9,
  HYPERSPACE_TECH: 10,
  LASER_TECH: 11,
  PLASMA_TECH: 12,
  ASTROPHYSICS: 13,
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ============================================================
// CONTRACT DEPLOYMENT
// ============================================================

async function deployContracts() {
  console.log("\n[1/7] Deploying Contracts...");

  // 1. Deploy GameConfig
  const GameConfig = await ethers.getContractFactory("GameConfig");
  const gameConfig = await GameConfig.deploy();
  await gameConfig.waitForDeployment();
  console.log(`  GameConfig: ${await gameConfig.getAddress()}`);

  // 2. Deploy GameState
  const GameState = await ethers.getContractFactory("GameState");
  const gameState = await GameState.deploy();
  await gameState.waitForDeployment();
  console.log(`  GameState: ${await gameState.getAddress()}`);

  // 3. Deploy NexusGame (Router)
  const NexusGame = await ethers.getContractFactory("NexusGame");
  const nexusGame = await NexusGame.deploy(
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await nexusGame.waitForDeployment();
  console.log(`  NexusGame: ${await nexusGame.getAddress()}`);

  // 4. Deploy PlanetManager
  const PlanetManager = await ethers.getContractFactory("PlanetManager");
  const planetManager = await PlanetManager.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await planetManager.waitForDeployment();
  console.log(`  PlanetManager: ${await planetManager.getAddress()}`);

  // 5. Deploy ShipManager
  const ShipManager = await ethers.getContractFactory("ShipManager");
  const shipManager = await ShipManager.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await shipManager.waitForDeployment();
  console.log(`  ShipManager: ${await shipManager.getAddress()}`);

  // 6. Deploy FleetManager
  const FleetManager = await ethers.getContractFactory("FleetManager");
  const fleetManager = await FleetManager.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await fleetManager.waitForDeployment();
  console.log(`  FleetManager: ${await fleetManager.getAddress()}`);

  // 7. Deploy ResearchManager
  const ResearchManager = await ethers.getContractFactory("ResearchManager");
  const researchManager = await ResearchManager.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await researchManager.waitForDeployment();
  console.log(`  ResearchManager: ${await researchManager.getAddress()}`);

  // 8. Deploy DefenseManager
  const DefenseManager = await ethers.getContractFactory("DefenseManager");
  const defenseManager = await DefenseManager.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await defenseManager.waitForDeployment();
  console.log(`  DefenseManager: ${await defenseManager.getAddress()}`);

  // 9. Configure NexusGame with managers
  await nexusGame.updateManagers(
    await planetManager.getAddress(),
    await shipManager.getAddress(),
    await fleetManager.getAddress()
  );
  await nexusGame.setResearchManager(await researchManager.getAddress());
  await nexusGame.setDefenseManager(await defenseManager.getAddress());

  // 10. Authorize managers in GameState
  await gameState.setManager(await planetManager.getAddress(), true);
  await gameState.setManager(await shipManager.getAddress(), true);
  await gameState.setManager(await fleetManager.getAddress(), true);
  await gameState.setManager(await researchManager.getAddress(), true);
  await gameState.setManager(await defenseManager.getAddress(), true);

  console.log("  Managers configured and authorized");

  return { gameConfig, gameState, nexusGame, planetManager, shipManager, fleetManager, researchManager, defenseManager };
}

// ============================================================
// PLANET SETUP
// ============================================================

async function claimPlanet(
  nexusGame: any,
  player: any,
  planetName: string
): Promise<bigint> {
  console.log(`\n[2/7] Claiming planet "${planetName}"...`);
  console.log(`  Player: ${truncateAddress(player.address)}`);

  await nexusGame.connect(player).claimStarterPlanet(planetName);
  const planetId = await nexusGame.playerPlanet(player.address);

  const [planet] = await nexusGame.getPlanet(planetId);
  console.log(`  Planet ID: ${planetId}`);
  console.log(`  Coordinates: [${planet.coordinates[0]}:${planet.coordinates[1]}:${planet.coordinates[2]}]`);

  return planetId;
}

async function setupBuildings(
  gameState: any,
  deployer: any,
  planetId: bigint
): Promise<void> {
  console.log("\n[3/7] Setting up buildings...");

  // Authorize deployer as manager for direct state manipulation
  await gameState.setManager(deployer.address, true);

  // Set buildings directly
  await gameState.setPlanetBuildings(planetId, CONFIG.TARGET_BUILDINGS);

  console.log("  Buildings set:");
  console.log(`    Titanium Extractor:     Level ${CONFIG.TARGET_BUILDINGS.titaniumExtractor}`);
  console.log(`    Helium-3 Harvester:     Level ${CONFIG.TARGET_BUILDINGS.helium3Harvester}`);
  console.log(`    Dark Matter Collector:  Level ${CONFIG.TARGET_BUILDINGS.darkMatterCollector}`);
  console.log(`    Titanium Vault:         Level ${CONFIG.TARGET_BUILDINGS.titaniumVault}`);
  console.log(`    Helium-3 Tank:          Level ${CONFIG.TARGET_BUILDINGS.helium3Tank}`);
  console.log(`    DM Containment:         Level ${CONFIG.TARGET_BUILDINGS.darkMatterContainment}`);
  console.log(`    Shipyard:               Level ${CONFIG.TARGET_BUILDINGS.shipyard} (ColonyShip requirement: 4)`);
  console.log(`    Research Node:          Level ${CONFIG.TARGET_BUILDINGS.researchNode}`);
}

async function setupResearch(
  gameState: any,
  player: any
): Promise<void> {
  console.log("\n[4/7] Setting up research...");

  const researchEntries: { name: string; type: number; level: number }[] = [
    { name: "Computer Tech", type: ResearchType.COMPUTER_TECH, level: CONFIG.TARGET_RESEARCH.computerTech },
    { name: "Impulse Drive", type: ResearchType.IMPULSE_DRIVE, level: CONFIG.TARGET_RESEARCH.impulseDrive },
    { name: "Astrophysics", type: ResearchType.ASTROPHYSICS, level: CONFIG.TARGET_RESEARCH.astrophysics },
    { name: "Combustion Drive", type: ResearchType.COMBUSTION_DRIVE, level: CONFIG.TARGET_RESEARCH.combustionDrive },
  ];

  for (const entry of researchEntries) {
    for (let i = 0; i < entry.level; i++) {
      await gameState.incrementResearchLevel(player.address, entry.type);
    }
    if (entry.level > 0) {
      console.log(`    ${entry.name}: Level ${entry.level}`);
    }
  }

  const maxColonies = Math.floor(CONFIG.TARGET_RESEARCH.astrophysics / 2);
  console.log(`  Max concurrent fleets: ${CONFIG.TARGET_RESEARCH.computerTech}`);
  console.log(`  Colony slots available: ${maxColonies}`);
}

async function setupResources(
  gameState: any,
  planetId: bigint
): Promise<void> {
  console.log("\n[5/7] Setting up resources...");

  const currentBlock = await ethers.provider.getBlock("latest");
  const lastClaimed = currentBlock?.timestamp || Math.floor(Date.now() / 1000);

  await gameState.setPlanetResources(
    planetId,
    CONFIG.TARGET_RESOURCES.titanium,
    CONFIG.TARGET_RESOURCES.helium3,
    CONFIG.TARGET_RESOURCES.darkMatter,
    lastClaimed
  );

  console.log("  Resources set:");
  console.log(`    Titanium:     ${CONFIG.TARGET_RESOURCES.titanium}`);
  console.log(`    Helium-3:     ${CONFIG.TARGET_RESOURCES.helium3}`);
  console.log(`    Dark Matter:  ${CONFIG.TARGET_RESOURCES.darkMatter}`);
}

async function setupFleet(
  gameState: any,
  planetId: bigint
): Promise<void> {
  console.log("\n[6/7] Setting up fleet...");

  // Add Colony Ship
  if (CONFIG.FLEET.colonyShips > 0) {
    await gameState.addPlanetShips(planetId, ShipType.ColonyShip, CONFIG.FLEET.colonyShips);
    console.log(`  Added ${CONFIG.FLEET.colonyShips} ColonyShip(s) (Cargo: ${CONFIG.FLEET.colonyShips * 7500})`);
  }

  // Add SmallCargoShips (escort)
  if (CONFIG.FLEET.smallCargo > 0) {
    await gameState.addPlanetShips(planetId, ShipType.SmallCargo, CONFIG.FLEET.smallCargo);
    console.log(`  Added ${CONFIG.FLEET.smallCargo} SmallCargoShip(s) (Cargo: ${CONFIG.FLEET.smallCargo * 5000})`);
  }

  // Add LightFighters (protection)
  if (CONFIG.FLEET.lightFighters > 0) {
    await gameState.addPlanetShips(planetId, ShipType.LightFighter, CONFIG.FLEET.lightFighters);
    console.log(`  Added ${CONFIG.FLEET.lightFighters} LightFighter(s) (Attack: ${CONFIG.FLEET.lightFighters * 50})`);
  }

  const totalCargo =
    CONFIG.FLEET.colonyShips * 7500 +
    CONFIG.FLEET.smallCargo * 5000 +
    CONFIG.FLEET.lightFighters * 50;

  console.log("  Fleet ready:");
  console.log(`    Total Cargo Capacity: ${totalCargo}`);
  console.log(`    Total Attack Power:   ${CONFIG.FLEET.smallCargo * 5 + CONFIG.FLEET.lightFighters * 50}`);
}

// ============================================================
// SUMMARY DISPLAY
// ============================================================

async function displaySummary(
  nexusGame: any,
  player: any,
  planetId: bigint
): Promise<void> {
  console.log("\n[7/7] Setup Summary");
  console.log("=".repeat(60));

  // Get main player data
  const [planet, buildings, resources] = await nexusGame.getPlanet(planetId);
  const ships = await nexusGame.getShips(planetId);
  const [titaniumRate, helium3Rate, darkMatterRate] = await nexusGame.getProductionRates(planetId);

  console.log("\n>>> COLONIZER PLAYER <<<");
  console.log(`  Name:        ${planet.name}`);
  console.log(`  Planet ID:   ${planetId}`);
  console.log(`  Coordinates: [${planet.coordinates[0]}:${planet.coordinates[1]}:${planet.coordinates[2]}]`);
  console.log(`  Owner:       ${player.address}`);

  console.log("\n  Buildings:");
  console.log(`    Titanium Extractor:     Level ${buildings.titaniumExtractor}`);
  console.log(`    Helium-3 Harvester:     Level ${buildings.helium3Harvester}`);
  console.log(`    Dark Matter Collector:  Level ${buildings.darkMatterCollector}`);
  console.log(`    Titanium Vault:         Level ${buildings.titaniumVault}`);
  console.log(`    Helium-3 Tank:          Level ${buildings.helium3Tank}`);
  console.log(`    DM Containment:         Level ${buildings.darkMatterContainment}`);
  console.log(`    Shipyard:               Level ${buildings.shipyard}`);
  console.log(`    Research Node:          Level ${buildings.researchNode}`);

  console.log("\n  Resources:");
  console.log(`    Titanium:     ${resources.titanium}`);
  console.log(`    Helium-3:     ${resources.helium3}`);
  console.log(`    Dark Matter:  ${resources.darkMatter}`);

  console.log("\n  Production Rates (per hour):");
  console.log(`    Titanium:     ${titaniumRate}/hr`);
  console.log(`    Helium-3:     ${helium3Rate}/hr`);
  console.log(`    Dark Matter:  ${darkMatterRate}/hr`);

  const research = await nexusGame.getPlayerResearch(player.address);
  console.log("\n  Research:");
  console.log(`    Computer Tech:    Level ${research.computerTech} (max ${research.computerTech} concurrent fleets)`);
  console.log(`    Impulse Drive:    Level ${research.impulseDrive} (ColonyShip requirement: 3)`);
  console.log(`    Astrophysics:     Level ${research.astrophysics} (colony slots: ${Number(research.astrophysics) / 2})`);
  console.log(`    Combustion Drive: Level ${research.combustionDrive}`);

  console.log("\n  Fleet:");
  console.log(`    ColonyShips:     ${ships[10]} (Cargo: ${Number(ships[10]) * 7500})`);
  console.log(`    SmallCargoShips: ${ships[1]} (Cargo: ${Number(ships[1]) * 5000})`);
  console.log(`    LightFighters:   ${ships[3]} (Attack: ${Number(ships[3]) * 50})`);

  // Show colonization targets — empty planet positions in the same system
  const galaxy = planet.coordinates[0];
  const system = planet.coordinates[1];
  const playerPos = Number(planet.coordinates[2]);

  console.log("\n>>> COLONIZATION TARGETS <<<");
  console.log("  Empty planet positions in same system (positions 1-10):");
  for (let pos = 1; pos <= 10; pos++) {
    if (pos === playerPos) continue; // Skip own position
    const existingPlanet = await nexusGame.coordinateToPlanet(galaxy, system, pos);
    if (Number(existingPlanet) === 0) {
      console.log(`    [${galaxy}:${system}:${pos}] - AVAILABLE`);
    }
  }

  console.log("\n>>> SUGGESTED COLONIZE DISPATCH <<<");
  console.log("  Ships: 1 ColonyShip + 2 SmallCargo + 3 LightFighters");
  console.log(`  Cargo: ${CONFIG.SUGGESTED_CARGO.titanium} Ti, ${CONFIG.SUGGESTED_CARGO.helium3} He3, ${CONFIG.SUGGESTED_CARGO.darkMatter} DM`);
  console.log("  Mission: COLONIZE (enum value 4)");
  console.log("  Note: 1 ColonyShip is consumed on arrival, remaining ships dock at new colony");

  console.log("\n" + "=".repeat(60));
  console.log("Setup complete! Ready for colonization testing.");
  console.log("=".repeat(60));
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("   NEXUS PROTOCOL - Colonization Test Setup");
  console.log("=".repeat(60));

  // Get signers
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const player = signers[1];

  console.log(`\nDeployer: ${truncateAddress(deployer.address)}`);
  console.log(`Player:   ${truncateAddress(player.address)}`);

  // Step 1: Deploy contracts
  const { gameState, nexusGame } = await deployContracts();

  // Step 2: Claim planet for main player
  const planetId = await claimPlanet(nexusGame, player, "Homeworld Prime");

  // Step 3: Setup buildings (direct state manipulation)
  await setupBuildings(gameState, deployer, planetId);

  // Step 4: Setup research (Impulse Drive 3 + Astrophysics 2 + Computer Tech 2)
  await setupResearch(gameState, player);

  // Step 5: Setup resources
  await setupResources(gameState, planetId);

  // Step 6: Setup fleet (includes colony ship)
  await setupFleet(gameState, planetId);

  // Revoke deployer's temporary manager access
  await gameState.setManager(deployer.address, false);

  // Step 7: Display summary
  await displaySummary(nexusGame, player, planetId);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
