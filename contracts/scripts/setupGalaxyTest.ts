import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Planet names for System 1 (positions 1-10 only, 11-15 are outposts)
const SYSTEM_1_NAMES = [
  "Nova Prime",
  "Helios Station",
  "Frozen Abyss",
  "Red Tempest",
  "Quantum Drift",
  "Shadow Reach",
  "Iron Bastion",
  "Nebula's Edge",
  "Plasma Core",
  "Void Haven",
];

// Planet names for System 2
const SYSTEM_2_NAMES = ["Pioneer's Landing", "Far Horizon"];

// Building type enum values (from GameConfig)
const BuildingType = {
  TITANIUM_EXTRACTOR: 1,
  HELIUM3_HARVESTER: 2,
  DARKMATTER_COLLECTOR: 3,
  SHIPYARD: 7,
};

/**
 * Helper: Truncate address for display
 */
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Helper: Upgrade a building and wait for completion
 */
async function upgradeAndComplete(
  nexusGame: any,
  player: any,
  planetId: bigint,
  buildingType: number,
  buildingName: string,
  targetLevel: number
) {
  // Accumulate some resources first
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

  console.log(`      ${buildingName} -> Level ${targetLevel}`);
}

/**
 * Section 1: Deploy Contracts (Multi-Contract Architecture)
 */
async function deployContracts() {
  console.log("\n" + "=".repeat(60));
  console.log("Section 1: Deploying Contracts");
  console.log("=".repeat(60));

  // 1. Deploy GameConfig
  const GameConfig = await ethers.getContractFactory("GameConfig");
  const gameConfig = await GameConfig.deploy();
  await gameConfig.waitForDeployment();
  const gameConfigAddress = await gameConfig.getAddress();
  console.log(`  GameConfig: ${gameConfigAddress}`);

  // 2. Deploy GameState
  const GameState = await ethers.getContractFactory("GameState");
  const gameState = await GameState.deploy();
  await gameState.waitForDeployment();
  const gameStateAddress = await gameState.getAddress();
  console.log(`  GameState: ${gameStateAddress}`);

  // 3. Deploy NexusGame (Router)
  const NexusGame = await ethers.getContractFactory("NexusGame");
  const nexusGame = await NexusGame.deploy(gameStateAddress, gameConfigAddress);
  await nexusGame.waitForDeployment();
  const nexusGameAddress = await nexusGame.getAddress();
  console.log(`  NexusGame: ${nexusGameAddress}`);

  // 4. Deploy PlanetManager
  const PlanetManager = await ethers.getContractFactory("PlanetManager");
  const planetManager = await PlanetManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await planetManager.waitForDeployment();
  const planetManagerAddress = await planetManager.getAddress();
  console.log(`  PlanetManager: ${planetManagerAddress}`);

  // 5. Deploy ShipManager
  const ShipManager = await ethers.getContractFactory("ShipManager");
  const shipManager = await ShipManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await shipManager.waitForDeployment();
  const shipManagerAddress = await shipManager.getAddress();
  console.log(`  ShipManager: ${shipManagerAddress}`);

  // 6. Deploy FleetManager
  const FleetManager = await ethers.getContractFactory("FleetManager");
  const fleetManager = await FleetManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await fleetManager.waitForDeployment();
  const fleetManagerAddress = await fleetManager.getAddress();
  console.log(`  FleetManager: ${fleetManagerAddress}`);

  // 7. Deploy ResearchManager
  const ResearchManager = await ethers.getContractFactory("ResearchManager");
  const researchManager = await ResearchManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await researchManager.waitForDeployment();
  const researchManagerAddress = await researchManager.getAddress();
  console.log(`  ResearchManager: ${researchManagerAddress}`);

  // 8. Deploy DefenseManager
  const DefenseManager = await ethers.getContractFactory("DefenseManager");
  const defenseManager = await DefenseManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await defenseManager.waitForDeployment();
  const defenseManagerAddress = await defenseManager.getAddress();
  console.log(`  DefenseManager: ${defenseManagerAddress}`);

  // 9. Configure NexusGame with managers
  console.log("  Configuring managers...");
  await nexusGame.updateManagers(planetManagerAddress, shipManagerAddress, fleetManagerAddress);
  await nexusGame.setResearchManager(researchManagerAddress);
  await nexusGame.setDefenseManager(defenseManagerAddress);

  // 10. Authorize managers in GameState
  await gameState.setManager(planetManagerAddress, true);
  await gameState.setManager(shipManagerAddress, true);
  await gameState.setManager(fleetManagerAddress, true);
  await gameState.setManager(researchManagerAddress, true);
  await gameState.setManager(defenseManagerAddress, true);
  console.log("  Managers configured and authorized");

  return {
    gameConfig,
    gameState,
    nexusGame,
    gameConfigAddress,
    gameStateAddress,
    nexusGameAddress,
  };
}

/**
 * Section 2: Claim Planets for System 1 (10 planets, positions 1-10)
 * Positions 11-15 are raider outposts
 */
async function claimSystem1Planets(nexusGame: any) {
  console.log("\n" + "=".repeat(60));
  console.log("Section 2: Claiming Planets for System [1:1]");
  console.log("=".repeat(60));

  const signers = await ethers.getSigners();
  const playerData: { signer: any; planetId: bigint; name: string; position: number }[] = [];

  for (let i = 0; i < 10; i++) {
    const player = signers[i + 1]; // signers[1] through signers[10]
    const planetName = SYSTEM_1_NAMES[i];

    const tx = await nexusGame.connect(player).claimStarterPlanet(planetName);
    await tx.wait();

    const planetId = await nexusGame.playerPlanet(player.address);
    const position = i + 1;

    playerData.push({
      signer: player,
      planetId,
      name: planetName,
      position,
    });

    console.log(
      `  Player ${i + 1}: ${truncateAddress(player.address)} claimed "${planetName}" at [1:1:${position}]`
    );
  }

  return playerData;
}

/**
 * Section 3: Advance Time & Build Up a Few Players
 */
async function buildUpPlayers(
  nexusGame: any,
  playerData: { signer: any; planetId: bigint; name: string; position: number }[]
) {
  console.log("\n" + "=".repeat(60));
  console.log("Section 3: Building Up Notable Players");
  console.log("=".repeat(60));

  // Player 1 (signer[1]) - "Nova Prime"
  const player1 = playerData[0];
  console.log(`\n  Building up "${player1.name}" [1:1:${player1.position}]...`);

  // Accumulate resources for 10 hours first
  console.log("    Accumulating resources (10 hours)...");
  await time.increase(10 * 3600);
  await nexusGame.connect(player1.signer).claimResources(player1.planetId);

  // Upgrade Titanium Extractor to level 3
  await upgradeAndComplete(
    nexusGame,
    player1.signer,
    player1.planetId,
    BuildingType.TITANIUM_EXTRACTOR,
    "Titanium Extractor",
    2
  );
  await upgradeAndComplete(
    nexusGame,
    player1.signer,
    player1.planetId,
    BuildingType.TITANIUM_EXTRACTOR,
    "Titanium Extractor",
    3
  );

  // Upgrade Helium-3 Harvester to level 2
  await upgradeAndComplete(
    nexusGame,
    player1.signer,
    player1.planetId,
    BuildingType.HELIUM3_HARVESTER,
    "Helium-3 Harvester",
    2
  );

  // Need Dark Matter Collector first to produce DM for Shipyard
  // Cost: 225 Ti + 75 He3
  console.log("    Accumulating resources for Dark Matter Collector (10 hours)...");
  await time.increase(10 * 3600);
  await nexusGame.connect(player1.signer).claimResources(player1.planetId);

  // Build Dark Matter Collector level 1
  await upgradeAndComplete(
    nexusGame,
    player1.signer,
    player1.planetId,
    BuildingType.DARKMATTER_COLLECTOR,
    "Dark Matter Collector",
    1
  );

  // Now accumulate for Shipyard (needs 400 Ti + 200 He3 + 100 DM)
  // DM production at level 1: 10/hr, so need 10+ hours for 100 DM
  console.log("    Accumulating resources for Shipyard (15 hours)...");
  await time.increase(15 * 3600);
  await nexusGame.connect(player1.signer).claimResources(player1.planetId);

  // Build Shipyard level 1
  await upgradeAndComplete(
    nexusGame,
    player1.signer,
    player1.planetId,
    BuildingType.SHIPYARD,
    "Shipyard",
    1
  );

  console.log(`  "${player1.name}" ready with Shipyard!`);

  // Accumulate resources for ship building
  console.log("    Accumulating resources for ships (50 hours)...");
  await time.increase(50 * 3600);
  await nexusGame.connect(player1.signer).claimResources(player1.planetId);

  // Build 1 SmallCargoShip for capturing outpost
  console.log("    Building 1 SmallCargoShip...");
  await nexusGame.connect(player1.signer).buildShips(player1.planetId, 1, 1); // ShipType.SmallCargoShip = 1
  const shipQueue = await nexusGame.shipQueues(player1.planetId);
  const currentBlock = await ethers.provider.getBlock("latest");
  const shipBuildTime = Number(shipQueue.completionTime) - (currentBlock?.timestamp || 0);
  await time.increase(shipBuildTime + 1);
  await nexusGame.completeShipBuild(player1.planetId);
  console.log("      SmallCargoShip built!");

  // Capture outpost at [1:1:11] (Titanium Mine)
  console.log("    Capturing outpost at [1:1:11]...");
  const captureShips = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 1 SmallCargoShip (13 elements)
  const captureDestination: [number, number, number] = [1, 1, 11];
  await nexusGame.connect(player1.signer).dispatchFleet(player1.planetId, captureShips, captureDestination, 2, 0, 0, 0); // CAPTURE = 2

  // Get fleet and wait for arrival
  const fleetIds = await nexusGame.getPlayerFleetIds(player1.signer.address);
  const fleet = await nexusGame.getFleet(fleetIds[0]);
  const arrivalWait = Number(fleet.arrivalTime) - (await ethers.provider.getBlock("latest"))!.timestamp;
  await time.increase(arrivalWait + 1);

  // Resolve fleet (captures outpost)
  await nexusGame.resolveFleet(fleetIds[0]);
  console.log("      Outpost [1:1:11] captured!");

  // Advance time to accumulate outpost resources
  console.log("    Advancing time 10 hours for outpost resource accumulation...");
  await time.increase(10 * 3600);

  // Player 2 (signer[2]) - "Helios Station"
  const player2 = playerData[1];
  console.log(`\n  Building up "${player2.name}" [1:1:${player2.position}]...`);

  // Accumulate resources
  console.log("    Accumulating resources (5 hours)...");
  await time.increase(5 * 3600);
  await nexusGame.connect(player2.signer).claimResources(player2.planetId);

  // Upgrade Titanium Extractor to level 2
  await upgradeAndComplete(
    nexusGame,
    player2.signer,
    player2.planetId,
    BuildingType.TITANIUM_EXTRACTOR,
    "Titanium Extractor",
    2
  );

  console.log(`  "${player2.name}" has upgraded production!`);

  // Advance time by 24 hours so all players accumulate resources
  console.log("\n  Advancing time 24 hours for resource accumulation...");
  await time.increase(24 * 3600);

  // Claim resources for the built-up players
  await nexusGame.connect(player1.signer).claimResources(player1.planetId);
  await nexusGame.connect(player2.signer).claimResources(player2.planetId);

  console.log("  Resource accumulation complete!");
}

/**
 * Section 4: Claim a Few Planets in System 2
 */
async function claimSystem2Planets(nexusGame: any) {
  console.log("\n" + "=".repeat(60));
  console.log("Section 4: Claiming Planets for System [1:2]");
  console.log("=".repeat(60));

  const signers = await ethers.getSigners();
  const system2Players: { signer: any; planetId: bigint; name: string; position: number }[] = [];

  for (let i = 0; i < 2; i++) {
    const player = signers[11 + i]; // signers[11] and signers[12] (after the 10 from system 1)
    const planetName = SYSTEM_2_NAMES[i];

    const tx = await nexusGame.connect(player).claimStarterPlanet(planetName);
    await tx.wait();

    const planetId = await nexusGame.playerPlanet(player.address);
    const position = i + 1;

    system2Players.push({
      signer: player,
      planetId,
      name: planetName,
      position,
    });

    console.log(
      `  Player ${16 + i}: ${truncateAddress(player.address)} claimed "${planetName}" at [1:2:${position}]`
    );
  }

  return system2Players;
}

/**
 * Section 5: Verify with getSystemPlanets
 */
async function verifySystemPlanets(nexusGame: any) {
  console.log("\n" + "=".repeat(60));
  console.log("Section 5: Verifying System Planets");
  console.log("=".repeat(60));

  // Verify System [1:1] - Planets (positions 1-10)
  console.log("\n  System [1:1] Planets (positions 1-10):");
  const system1 = await nexusGame.getSystemPlanets(1, 1);

  for (let i = 0; i < 10; i++) {
    const planet = system1[i];
    if (planet.exists) {
      console.log(
        `    Position ${i + 1}: "${planet.name}" (owner: ${truncateAddress(planet.owner)})`
      );
    } else {
      console.log(`    Position ${i + 1}: Empty`);
    }
  }

  // Verify System [1:1] - Outposts (positions 11-15)
  console.log("\n  System [1:1] Outposts (positions 11-15):");
  const [outposts, currentResources, ] = await nexusGame.getSystemOutposts(1, 1);
  // OutpostType enum: 0=NONE, 1=TITANIUM_MINE, 2=HELIUM3_LAB, 3=DARKMATTER_REFINERY
  const outpostTypeNames = ["NONE", "Titanium Mine", "Helium-3 Lab", "Dark Matter Refinery"];

  for (let i = 0; i < 5; i++) {
    const position = i + 11;
    const outpost = outposts[i];
    const resources = currentResources[i];
    const typeName = outpostTypeNames[Number(outpost.outpostType)] || "Unknown";

    if (outpost.owner !== "0x0000000000000000000000000000000000000000") {
      console.log(
        `    Position ${position}: ${typeName} (owner: ${truncateAddress(outpost.owner)}, resources: ${resources})`
      );
    } else {
      console.log(`    Position ${position}: ${typeName} (unclaimed)`);
    }
  }

  // Verify System [1:2] - Planets
  console.log("\n  System [1:2] Planets (positions 1-10):");
  const system2 = await nexusGame.getSystemPlanets(1, 2);

  for (let i = 0; i < 10; i++) {
    const planet = system2[i];
    if (planet.exists) {
      console.log(
        `    Position ${i + 1}: "${planet.name}" (owner: ${truncateAddress(planet.owner)})`
      );
    } else {
      console.log(`    Position ${i + 1}: Empty`);
    }
  }
}

/**
 * Section 6: Display Summary
 */
async function displaySummary(
  nexusGame: any,
  gameConfigAddress: string,
  gameStateAddress: string,
  nexusGameAddress: string,
  playerData: { signer: any; planetId: bigint; name: string; position: number }[]
) {
  console.log("\n" + "=".repeat(60));
  console.log("Section 6: Galaxy Test Setup Complete!");
  console.log("=".repeat(60));

  console.log("\nContracts:");
  console.log(`  GameConfig: ${gameConfigAddress}`);
  console.log(`  GameState:  ${gameStateAddress}`);
  console.log(`  NexusGame:  ${nexusGameAddress}`);

  console.log("\nSystem Status:");
  console.log("  System [1:1]: 10/10 planet positions filled");
  console.log("  System [1:1]: 1/5 outposts captured (position 11)");
  console.log("  System [1:2]: 2/10 planet positions filled");

  // Get details for notable players
  const player1 = playerData[0];
  const player2 = playerData[1];

  const [, buildings1] = await nexusGame.getPlanet(player1.planetId);
  const [, buildings2] = await nexusGame.getPlanet(player2.planetId);

  // Get outpost status
  const [, outpostResources, outpostGarrison] = await nexusGame.getOutpost(1, 1, 11);

  console.log("\nNotable Players:");
  console.log(
    `  ${player1.name} [1:1:1] - Shipyard Lvl ${buildings1.shipyard}, ` +
      `Ti Extractor Lvl ${buildings1.titaniumExtractor}`
  );
  console.log(
    `    Captured Outpost [1:1:11] - Titanium Mine with ${outpostResources} resources, ${outpostGarrison[1]} SmallCargoShip garrisoned`
  );
  console.log(
    `  ${player2.name} [1:1:2] - Ti Extractor Lvl ${buildings2.titaniumExtractor}`
  );

  console.log("\nConnect with any of these accounts to test the galaxy map.");
  console.log(`Recommended: Import signer[1] into MetaMask to see "${player1.name}"`);
  console.log(`  Address: ${player1.signer.address}`);

  console.log("\n" + "=".repeat(60));
}

/**
 * Main function - orchestrates the entire setup
 */
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("       GALAXY MAP TEST SETUP - NEXUS PROTOCOL");
  console.log("=".repeat(60));

  // Section 1: Deploy Contracts
  const { nexusGame, gameConfigAddress, gameStateAddress, nexusGameAddress } = await deployContracts();

  // Section 2: Claim Planets for System 1
  const playerData = await claimSystem1Planets(nexusGame);

  // Section 3: Build Up Notable Players
  await buildUpPlayers(nexusGame, playerData);

  // Section 4: Claim Planets for System 2
  await claimSystem2Planets(nexusGame);

  // Section 5: Verify System Planets
  await verifySystemPlanets(nexusGame);

  // Section 6: Summary
  await displaySummary(nexusGame, gameConfigAddress, gameStateAddress, nexusGameAddress, playerData);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
