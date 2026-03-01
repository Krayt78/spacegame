import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Deploying Nexus Protocol contracts (Multi-Contract Architecture)...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // 1. Deploy GameConfig first (unchanged)
  console.log("\n1. Deploying GameConfig...");
  const GameConfig = await ethers.getContractFactory("GameConfig");
  const gameConfig = await GameConfig.deploy();
  await gameConfig.waitForDeployment();
  const gameConfigAddress = await gameConfig.getAddress();
  console.log("GameConfig deployed to:", gameConfigAddress);

  // 2. Deploy GameState
  console.log("\n2. Deploying GameState...");
  const GameState = await ethers.getContractFactory("GameState");
  const gameState = await GameState.deploy();
  await gameState.waitForDeployment();
  const gameStateAddress = await gameState.getAddress();
  console.log("GameState deployed to:", gameStateAddress);

  // 3. Deploy NexusGame (Router) with GameState and GameConfig
  console.log("\n3. Deploying NexusGame (Router)...");
  const NexusGame = await ethers.getContractFactory("NexusGame");
  const nexusGame = await NexusGame.deploy(gameStateAddress, gameConfigAddress);
  await nexusGame.waitForDeployment();
  const nexusGameAddress = await nexusGame.getAddress();
  console.log("NexusGame deployed to:", nexusGameAddress);

  // 4. Deploy PlanetManager
  console.log("\n4. Deploying PlanetManager...");
  const PlanetManager = await ethers.getContractFactory("PlanetManager");
  const planetManager = await PlanetManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await planetManager.waitForDeployment();
  const planetManagerAddress = await planetManager.getAddress();
  console.log("PlanetManager deployed to:", planetManagerAddress);

  // 5. Deploy ShipManager
  console.log("\n5. Deploying ShipManager...");
  const ShipManager = await ethers.getContractFactory("ShipManager");
  const shipManager = await ShipManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await shipManager.waitForDeployment();
  const shipManagerAddress = await shipManager.getAddress();
  console.log("ShipManager deployed to:", shipManagerAddress);

  // 6. Deploy CombatEngine
  console.log("\n6. Deploying CombatEngine...");
  const CombatEngine = await ethers.getContractFactory("CombatEngine");
  const combatEngine = await CombatEngine.deploy(gameConfigAddress);
  await combatEngine.waitForDeployment();
  const combatEngineAddress = await combatEngine.getAddress();
  console.log("CombatEngine deployed to:", combatEngineAddress);

  // 7. Deploy FleetResolver
  console.log("\n7. Deploying FleetResolver...");
  const FleetResolver = await ethers.getContractFactory("FleetResolver");
  const fleetResolver = await FleetResolver.deploy(gameStateAddress, gameConfigAddress, combatEngineAddress);
  await fleetResolver.waitForDeployment();
  const fleetResolverAddress = await fleetResolver.getAddress();
  console.log("FleetResolver deployed to:", fleetResolverAddress);

  // 8. Deploy FleetManager
  console.log("\n8. Deploying FleetManager...");
  const FleetManager = await ethers.getContractFactory("FleetManager");
  const fleetManager = await FleetManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress, fleetResolverAddress);
  await fleetManager.waitForDeployment();
  const fleetManagerAddress = await fleetManager.getAddress();
  console.log("FleetManager deployed to:", fleetManagerAddress);

  // 9. Deploy ResearchManager
  console.log("\n9. Deploying ResearchManager...");
  const ResearchManager = await ethers.getContractFactory("ResearchManager");
  const researchManager = await ResearchManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await researchManager.waitForDeployment();
  const researchManagerAddress = await researchManager.getAddress();
  console.log("ResearchManager deployed to:", researchManagerAddress);

  // 10. Deploy DefenseManager
  console.log("\n10. Deploying DefenseManager...");
  const DefenseManager = await ethers.getContractFactory("DefenseManager");
  const defenseManager = await DefenseManager.deploy(nexusGameAddress, gameStateAddress, gameConfigAddress);
  await defenseManager.waitForDeployment();
  const defenseManagerAddress = await defenseManager.getAddress();
  console.log("DefenseManager deployed to:", defenseManagerAddress);

  // 11. Configure NexusGame with managers
  console.log("\n11. Configuring NexusGame with managers...");
  await nexusGame.updateManagers(planetManagerAddress, shipManagerAddress, fleetManagerAddress);
  await nexusGame.setResearchManager(researchManagerAddress);
  await nexusGame.setDefenseManager(defenseManagerAddress);
  console.log("Managers configured in NexusGame");

  // 12. Authorize managers in GameState
  console.log("\n12. Authorizing managers in GameState...");
  await gameState.setManager(planetManagerAddress, true);
  console.log("PlanetManager authorized");
  await gameState.setManager(shipManagerAddress, true);
  console.log("ShipManager authorized");
  await gameState.setManager(fleetManagerAddress, true);
  console.log("FleetManager authorized");
  await gameState.setManager(fleetResolverAddress, true);
  console.log("FleetResolver authorized");
  await gameState.setManager(researchManagerAddress, true);
  console.log("ResearchManager authorized");
  await gameState.setManager(defenseManagerAddress, true);
  console.log("DefenseManager authorized");

  // Save deployment info
  const network = await ethers.provider.getNetwork();
  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: {
      GameConfig: gameConfigAddress,
      GameState: gameStateAddress,
      NexusGame: nexusGameAddress,
      PlanetManager: planetManagerAddress,
      ShipManager: shipManagerAddress,
      CombatEngine: combatEngineAddress,
      FleetResolver: fleetResolverAddress,
      FleetManager: fleetManagerAddress,
      ResearchManager: researchManagerAddress,
      DefenseManager: defenseManagerAddress,
    },
    timestamp: new Date().toISOString(),
  };

  console.log("\nDeployment Summary:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Ensure deployments directory exists
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save to file
  fs.writeFileSync(
    path.join(deploymentsDir, "latest.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\nDeployment complete! Info saved to deployments/latest.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
