import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import * as fs from "fs";
import * as path from "path";

/**
 * Setup contracts - Load existing or deploy new
 */
async function setupContracts() {
  console.log("\n[1/6] Setting up contracts...");

  // Try loading existing deployment
  const deploymentPath = path.join(__dirname, "..", "deployments", "latest.json");

  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));

    // Verify contracts exist at these addresses
    const gameConfigCode = await ethers.provider.getCode(deployment.contracts.GameConfig);
    const nexusGameCode = await ethers.provider.getCode(deployment.contracts.NexusGame);

    if (gameConfigCode !== "0x" && nexusGameCode !== "0x") {
      const gameConfig = await ethers.getContractAt("GameConfig", deployment.contracts.GameConfig);
      const nexusGame = await ethers.getContractAt("NexusGame", deployment.contracts.NexusGame);
      console.log(`  Using existing deployment from latest.json`);
      console.log(`  GameConfig: ${deployment.contracts.GameConfig}`);
      console.log(`  NexusGame: ${deployment.contracts.NexusGame}`);
      return { gameConfig, nexusGame };
    } else {
      console.log("  Deployment file found but contracts don't exist on this network.");
    }
  }

  // Deploy new contracts
  console.log("  Deploying new contracts...");
  const GameConfig = await ethers.getContractFactory("GameConfig");
  const gameConfig = await GameConfig.deploy();
  await gameConfig.waitForDeployment();
  const gameConfigAddress = await gameConfig.getAddress();

  const GameState = await ethers.getContractFactory("GameState");
  const gameState = await GameState.deploy();
  await gameState.waitForDeployment();
  const gameStateAddress = await gameState.getAddress();

  const NexusGame = await ethers.getContractFactory("NexusGame");
  const nexusGame = await NexusGame.deploy(gameStateAddress, gameConfigAddress);
  await nexusGame.waitForDeployment();
  const nexusGameAddress = await nexusGame.getAddress();

  // Deploy managers
  const PlanetManager = await ethers.getContractFactory("PlanetManager");
  const planetManager = await PlanetManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await planetManager.waitForDeployment();

  const ShipManager = await ethers.getContractFactory("ShipManager");
  const shipManager = await ShipManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await shipManager.waitForDeployment();

  const FleetManager = await ethers.getContractFactory("FleetManager");
  const fleetManager = await FleetManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await fleetManager.waitForDeployment();

  const ResearchManager = await ethers.getContractFactory("ResearchManager");
  const researchManager = await ResearchManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await researchManager.waitForDeployment();

  const DefenseManager = await ethers.getContractFactory("DefenseManager");
  const defenseManager = await DefenseManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await defenseManager.waitForDeployment();

  // Configure NexusGame with managers
  await nexusGame.updateManagers(
    await planetManager.getAddress(),
    await shipManager.getAddress(),
    await fleetManager.getAddress()
  );
  await nexusGame.setResearchManager(await researchManager.getAddress());
  await nexusGame.setDefenseManager(await defenseManager.getAddress());

  // Authorize managers in GameState
  await gameState.setManager(await planetManager.getAddress(), true);
  await gameState.setManager(await shipManager.getAddress(), true);
  await gameState.setManager(await fleetManager.getAddress(), true);
  await gameState.setManager(await researchManager.getAddress(), true);
  await gameState.setManager(await defenseManager.getAddress(), true);

  console.log(`  GameConfig: ${gameConfigAddress}`);
  console.log(`  GameState: ${gameStateAddress}`);
  console.log(`  NexusGame: ${nexusGameAddress}`);

  return { gameConfig, nexusGame };
}

/**
 * Claim starter planet for test player
 */
async function claimPlanet(nexusGame: any) {
  console.log("\n[2/6] Claiming planet...");

  const signers = await ethers.getSigners();
  const player = signers[1]; // Second account (index 1)

  console.log(`  Player address: ${player.address}`);

  const tx = await nexusGame.connect(player).claimStarterPlanet("Test Colony");
  await tx.wait();

  const planetId = await nexusGame.playerPlanet(player.address);
  const [planet] = await nexusGame.getPlanet(planetId);

  console.log(`  Planet ID: ${planetId}`);
  console.log(`  Coordinates: Galaxy ${planet.coordinates[0]}, System ${planet.coordinates[1]}, Position ${planet.coordinates[2]}`);
  console.log(`  Galaxy Map Location: Go to Galaxy ${planet.coordinates[0]}, System ${planet.coordinates[1]} to find this planet`);
  console.log(`  Planet name: ${planet.name}`);

  return { player, planetId };
}

/**
 * Upgrade a single building level
 */
async function upgradeBuilding(
  nexusGame: any,
  player: any,
  planetId: bigint,
  buildingType: number,
  buildingName: string,
  targetLevel: number
) {
  console.log(`  Upgrading ${buildingName} to level ${targetLevel}...`);

  // Accumulate resources
  await time.increase(3600); // 1 hour
  await nexusGame.connect(player).claimResources(planetId);

  // Start upgrade
  await nexusGame.connect(player).upgradeBuilding(planetId, buildingType);

  // Get build time from queue
  const queue = await nexusGame.buildQueues(planetId);
  const currentBlock = await ethers.provider.getBlock("latest");
  const buildTime = Number(queue.completionTime) - (currentBlock?.timestamp || 0);

  // Advance time past completion
  await time.increase(buildTime + 1);

  // Complete upgrade
  await nexusGame.completeUpgrade(planetId);

  console.log(`    ${buildingName} upgraded to level ${targetLevel} ✓`);
}

/**
 * Upgrade all production buildings to target levels
 */
async function upgradeProductionBuildings(nexusGame: any, player: any, planetId: bigint) {
  console.log("\n[3/6] Upgrading production buildings...");

  // Titanium Extractor: Level 1 → 3
  await upgradeBuilding(nexusGame, player, planetId, 1, "Titanium Extractor", 2);
  await upgradeBuilding(nexusGame, player, planetId, 1, "Titanium Extractor", 3);

  // Helium-3 Harvester: Level 1 → 3
  await upgradeBuilding(nexusGame, player, planetId, 2, "Helium-3 Harvester", 2);
  await upgradeBuilding(nexusGame, player, planetId, 2, "Helium-3 Harvester", 3);

  // Dark Matter Collector: Level 0 → 1 (needs 20hr accumulation)
  console.log("  Accumulating resources for Dark Matter Collector...");
  await time.increase(20 * 3600); // 20 hours
  await upgradeBuilding(nexusGame, player, planetId, 3, "Dark Matter Collector", 1);
}

/**
 * Build shipyard to level 1
 */
async function buildShipyard(nexusGame: any, player: any, planetId: bigint) {
  console.log("\n[4/6] Building Shipyard...");

  // Accumulate dark matter and other resources
  console.log("  Accumulating resources for Shipyard (20 hours)...");
  await time.increase(20 * 3600);
  await nexusGame.connect(player).claimResources(planetId);

  // Build shipyard
  await upgradeBuilding(nexusGame, player, planetId, 8, "Shipyard", 1);

  console.log("  Shipyard built! Ready for ship construction ✓");
}

/**
 * Accumulate resources for 24 hours
 */
async function accumulateResources(nexusGame: any, player: any, planetId: bigint) {
  console.log("\n[5/6] Accumulating resources...");

  console.log("  Advancing time by 48 hours...");
  await time.increase(48 * 3600);

  console.log("  Claiming accumulated resources...");
  await nexusGame.connect(player).claimResources(planetId);

  console.log("  Resources claimed ✓");
}

/**
 * Display final state summary
 */
async function displaySummary(nexusGame: any, gameConfig: any, planetId: bigint) {
  console.log("\n[6/6] Final State Summary");
  console.log("─".repeat(60));

  // Get all planet data
  const [planet, buildings, resources] = await nexusGame.getPlanet(planetId);
  const [titaniumRate, helium3Rate, darkMatterRate] =
    await nexusGame.getProductionRates(planetId);

  // Display buildings
  console.log("\nBuildings:");
  console.log(`  Titanium Extractor:     Level ${buildings.titaniumExtractor}`);
  console.log(`  Helium-3 Harvester:     Level ${buildings.helium3Harvester}`);
  console.log(`  Dark Matter Collector:  Level ${buildings.darkMatterCollector}`);
  console.log(`  Shipyard:               Level ${buildings.shipyard}`);

  // Display resources
  console.log("\nResources:");
  console.log(`  Titanium:      ${ethers.formatUnits(resources.titanium, 0)}`);
  console.log(`  Helium-3:      ${ethers.formatUnits(resources.helium3, 0)}`);
  console.log(`  Dark Matter:   ${ethers.formatUnits(resources.darkMatter, 0)}`);

  // Display production rates
  console.log("\nProduction Rates (per hour):");
  console.log(`  Titanium:      ${titaniumRate}/hr`);
  console.log(`  Helium-3:      ${helium3Rate}/hr`);
  console.log(`  Dark Matter:   ${darkMatterRate}/hr`);

  // Display ship costs
  console.log("\nAvailable Ships:");
  const lightHaulerCost = await gameConfig.getShipCost(1);
  const interceptorCost = await gameConfig.getShipCost(2);
  console.log(`  Light Hauler:   ${lightHaulerCost.titanium} Ti, ${lightHaulerCost.helium3} He`);
  console.log(`  Interceptor:    ${interceptorCost.titanium} Ti, ${interceptorCost.helium3} He`);
}

/**
 * Main function - orchestrates the entire setup
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Setting up Test Player for Nexus Protocol");
  console.log("=".repeat(60));

  // Section 1: Setup & Deploy Contracts
  const { gameConfig, nexusGame } = await setupContracts();

  // Section 2: Claim Planet
  const { player, planetId } = await claimPlanet(nexusGame);

  // Section 3: Upgrade Production Buildings
  await upgradeProductionBuildings(nexusGame, player, planetId);

  // Section 4: Build Shipyard
  await buildShipyard(nexusGame, player, planetId);

  // Section 5: Accumulate Resources
  await accumulateResources(nexusGame, player, planetId);

  // Section 6: Summary
  await displaySummary(nexusGame, gameConfig, planetId);

  console.log("\n" + "=".repeat(60));
  console.log("Test player setup complete!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
