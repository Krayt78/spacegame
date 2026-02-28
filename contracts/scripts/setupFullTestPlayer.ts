import { ethers } from "hardhat";

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  // Target building levels for main player
  TARGET_BUILDINGS: {
    titaniumExtractor: 5,
    helium3Harvester: 5,
    darkMatterCollector: 3,
    titaniumVault: 3,
    helium3Tank: 3,
    darkMatterContainment: 2,
    shipyard: 3,
    researchNode: 2,
  },

  // Target resources (10k each)
  TARGET_RESOURCES: {
    titanium: 10000n,
    helium3: 10000n,
    darkMatter: 10000n,
  },

  // Target research levels for main player
  TARGET_RESEARCH: {
    computerTech: 2,    // Required for fleet dispatch (level = max concurrent fleets)
    combustionDrive: 1, // Speed bonus for combustion ships
    weaponTech: 1,      // +10% attack per level
    shieldingTech: 1,   // +10% shields per level
  },

  // Fleet composition
  FLEET: {
    lightHaulers: 3, // 3 x 5000 cargo = 15000 total
    interceptors: 5, // 5 x 50 attack = 250 total attack
  },

  // Create target player for attack testing
  CREATE_TARGET_PLAYER: true,

  // Target player configuration
  TARGET_PLAYER: {
    resources: {
      titanium: 5000n,
      helium3: 5000n,
      darkMatter: 1000n,
    },
    interceptors: 2, // Minimal defenses
  },
};

// Ship type constants
const ShipType = {
  SmallCargoShip: 1,
  LightFighter: 3,
};

// Research type constants (from GameConfig.ResearchType enum)
const ResearchType = {
  COMBUSTION_DRIVE: 1,
  IMPULSE_DRIVE: 2,
  HYPERSPACE_DRIVE: 3,
  WEAPON_TECH: 4,
  SHIELDING_TECH: 5,
  ARMOUR_TECH: 6,
  POWER_SYSTEMS: 7,
  COMPUTER_TECH: 8,
  STEALTH_SYSTEMS: 9,
  ION_TECH: 10,
  HYPERSPACE_TECH: 11,
  LASER_TECH: 12,
  PLASMA_TECH: 13,
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
  console.log("\n[1/8] Deploying Contracts...");

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
  console.log(`\n[2/8] Claiming planet "${planetName}"...`);
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
  console.log("\n[3/8] Setting up buildings...");

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
  console.log(`    Shipyard:               Level ${CONFIG.TARGET_BUILDINGS.shipyard}`);
  console.log(`    Research Node:          Level ${CONFIG.TARGET_BUILDINGS.researchNode}`);
}

async function setupResearch(
  gameState: any,
  player: any
): Promise<void> {
  console.log("\n[4/8] Setting up research...");

  const researchEntries: { name: string; type: number; level: number }[] = [
    { name: "Computer Tech", type: ResearchType.COMPUTER_TECH, level: CONFIG.TARGET_RESEARCH.computerTech },
    { name: "Combustion Drive", type: ResearchType.COMBUSTION_DRIVE, level: CONFIG.TARGET_RESEARCH.combustionDrive },
    { name: "Weapon Tech", type: ResearchType.WEAPON_TECH, level: CONFIG.TARGET_RESEARCH.weaponTech },
    { name: "Shielding Tech", type: ResearchType.SHIELDING_TECH, level: CONFIG.TARGET_RESEARCH.shieldingTech },
  ];

  for (const entry of researchEntries) {
    for (let i = 0; i < entry.level; i++) {
      await gameState.incrementResearchLevel(player.address, entry.type);
    }
    if (entry.level > 0) {
      console.log(`    ${entry.name}:          Level ${entry.level}`);
    }
  }

  console.log(`  Max concurrent fleets: ${CONFIG.TARGET_RESEARCH.computerTech}`);
}

async function setupResources(
  gameState: any,
  planetId: bigint
): Promise<void> {
  console.log("\n[5/8] Setting up resources...");

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
  console.log("\n[6/8] Setting up fleet...");

  // Add SmallCargoShips (Light Haulers)
  if (CONFIG.FLEET.lightHaulers > 0) {
    await gameState.addPlanetShips(planetId, ShipType.SmallCargoShip, CONFIG.FLEET.lightHaulers);
    console.log(`  Added ${CONFIG.FLEET.lightHaulers} SmallCargoShips (Light Haulers)`);
  }

  // Add LightFighters (Interceptors)
  if (CONFIG.FLEET.interceptors > 0) {
    await gameState.addPlanetShips(planetId, ShipType.LightFighter, CONFIG.FLEET.interceptors);
    console.log(`  Added ${CONFIG.FLEET.interceptors} LightFighters (Interceptors)`);
  }

  const totalCargo = CONFIG.FLEET.lightHaulers * 5000 + CONFIG.FLEET.interceptors * 50;
  const totalAttack = CONFIG.FLEET.lightHaulers * 5 + CONFIG.FLEET.interceptors * 50;

  console.log("  Fleet ready:");
  console.log(`    Total Cargo Capacity: ${totalCargo}`);
  console.log(`    Total Attack Power:   ${totalAttack}`);
}

// ============================================================
// TARGET PLAYER SETUP
// ============================================================

async function setupTargetPlayer(
  nexusGame: any,
  gameState: any,
  targetPlayer: any
): Promise<bigint> {
  console.log("\n[7/8] Setting up target player for attacks...");
  console.log(`  Target Player: ${truncateAddress(targetPlayer.address)}`);

  // Claim planet for target
  await nexusGame.connect(targetPlayer).claimStarterPlanet("Target Colony");
  const targetPlanetId = await nexusGame.playerPlanet(targetPlayer.address);

  const [targetPlanet] = await nexusGame.getPlanet(targetPlanetId);
  console.log(`  Planet ID: ${targetPlanetId}`);
  console.log(`  Coordinates: [${targetPlanet.coordinates[0]}:${targetPlanet.coordinates[1]}:${targetPlanet.coordinates[2]}]`);

  // Set resources for target
  const currentBlock = await ethers.provider.getBlock("latest");
  const lastClaimed = currentBlock?.timestamp || Math.floor(Date.now() / 1000);

  await gameState.setPlanetResources(
    targetPlanetId,
    CONFIG.TARGET_PLAYER.resources.titanium,
    CONFIG.TARGET_PLAYER.resources.helium3,
    CONFIG.TARGET_PLAYER.resources.darkMatter,
    lastClaimed
  );

  console.log("  Target resources:");
  console.log(`    Titanium:     ${CONFIG.TARGET_PLAYER.resources.titanium}`);
  console.log(`    Helium-3:     ${CONFIG.TARGET_PLAYER.resources.helium3}`);
  console.log(`    Dark Matter:  ${CONFIG.TARGET_PLAYER.resources.darkMatter}`);

  // Add minimal defenses
  if (CONFIG.TARGET_PLAYER.interceptors > 0) {
    await gameState.addPlanetShips(targetPlanetId, ShipType.LightFighter, CONFIG.TARGET_PLAYER.interceptors);
    console.log(`  Target defenses: ${CONFIG.TARGET_PLAYER.interceptors} LightFighters`);
  }

  return targetPlanetId;
}

// ============================================================
// SUMMARY DISPLAY
// ============================================================

async function displaySummary(
  nexusGame: any,
  player: any,
  planetId: bigint,
  targetPlayer?: any,
  targetPlanetId?: bigint
): Promise<void> {
  console.log("\n[8/8] Setup Summary");
  console.log("=".repeat(60));

  // Get main player data
  const [planet, buildings, resources] = await nexusGame.getPlanet(planetId);
  const ships = await nexusGame.getShips(planetId);
  const [titaniumRate, helium3Rate, darkMatterRate] = await nexusGame.getProductionRates(planetId);

  console.log("\n>>> MAIN PLAYER <<<");
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
  console.log(`    Combustion Drive: Level ${research.combustionDrive}`);
  console.log(`    Weapon Tech:      Level ${research.weaponTech}`);
  console.log(`    Shielding Tech:   Level ${research.shieldingTech}`);

  console.log("\n  Fleet:");
  console.log(`    SmallCargoShips: ${ships[1]} (Cargo: ${Number(ships[1]) * 5000})`);
  console.log(`    LightFighters:   ${ships[3]} (Attack: ${Number(ships[3]) * 50})`);

  if (targetPlayer && targetPlanetId) {
    const [targetPlanet, , targetResources] = await nexusGame.getPlanet(targetPlanetId);
    const targetShips = await nexusGame.getShips(targetPlanetId);

    console.log("\n>>> TARGET PLAYER <<<");
    console.log(`  Name:        ${targetPlanet.name}`);
    console.log(`  Planet ID:   ${targetPlanetId}`);
    console.log(`  Coordinates: [${targetPlanet.coordinates[0]}:${targetPlanet.coordinates[1]}:${targetPlanet.coordinates[2]}]`);
    console.log(`  Owner:       ${targetPlayer.address}`);
    console.log(`  Resources:   ${targetResources.titanium} Ti, ${targetResources.helium3} He3, ${targetResources.darkMatter} DM`);
    console.log(`  Defenses:    ${targetShips[3]} LightFighters`);
  }

  console.log("\n>>> AVAILABLE TEST ACTIONS <<<");
  console.log("  Outpost Capture (same system):");
  console.log(`    [${planet.coordinates[0]}:${planet.coordinates[1]}:11] - Titanium Mine`);
  console.log(`    [${planet.coordinates[0]}:${planet.coordinates[1]}:12] - Titanium Mine`);
  console.log(`    [${planet.coordinates[0]}:${planet.coordinates[1]}:13] - Helium-3 Lab`);
  console.log(`    [${planet.coordinates[0]}:${planet.coordinates[1]}:14] - Helium-3 Lab`);
  console.log(`    [${planet.coordinates[0]}:${planet.coordinates[1]}:15] - Dark Matter Refinery`);

  if (targetPlanetId) {
    const [targetPlanet] = await nexusGame.getPlanet(targetPlanetId);
    console.log("\n  Attack/Supply Target:");
    console.log(`    RAID target at [${targetPlanet.coordinates[0]}:${targetPlanet.coordinates[1]}:${targetPlanet.coordinates[2]}]`);
    console.log(`    MOVE resources to target (supply mission)`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Setup complete! Ready for testing.");
  console.log("=".repeat(60));
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("   NEXUS PROTOCOL - Full Test Player Setup");
  console.log("=".repeat(60));

  // Get signers
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const player = signers[1];
  const targetPlayer = signers[2];

  console.log(`\nDeployer: ${truncateAddress(deployer.address)}`);
  console.log(`Player:   ${truncateAddress(player.address)}`);
  if (CONFIG.CREATE_TARGET_PLAYER) {
    console.log(`Target:   ${truncateAddress(targetPlayer.address)}`);
  }

  // Step 1: Deploy contracts
  const { gameState, nexusGame } = await deployContracts();

  // Step 2: Claim planet for main player
  const planetId = await claimPlanet(nexusGame, player, "Test Command");

  // Step 3: Setup buildings (direct state manipulation)
  await setupBuildings(gameState, deployer, planetId);

  // Step 4: Setup research (required for fleet dispatch)
  await setupResearch(gameState, player);

  // Step 5: Setup resources
  await setupResources(gameState, planetId);

  // Step 6: Setup fleet
  await setupFleet(gameState, planetId);

  // Step 7: Optional target player
  let targetPlanetId: bigint | undefined;
  if (CONFIG.CREATE_TARGET_PLAYER) {
    targetPlanetId = await setupTargetPlayer(nexusGame, gameState, targetPlayer);
  } else {
    console.log("\n[7/8] Skipping target player setup (disabled in config)");
  }

  // Revoke deployer's temporary manager access
  await gameState.setManager(deployer.address, false);

  // Step 8: Display summary
  await displaySummary(
    nexusGame,
    player,
    planetId,
    CONFIG.CREATE_TARGET_PLAYER ? targetPlayer : undefined,
    targetPlanetId
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
