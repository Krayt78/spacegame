import { ethers } from "hardhat";
import { NexusGame, GameConfig, GameState, PlanetManager, ShipManager, FleetManager, ResearchManager, DefenseManager, CombatEngine, FleetResolver, TutorialManager, SessionRegistry } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export interface DeployedContracts {
  nexusGame: NexusGame;
  gameConfig: GameConfig;
  gameState: GameState;
  planetManager: PlanetManager;
  shipManager: ShipManager;
  combatEngine: CombatEngine;
  fleetResolver: FleetResolver;
  fleetManager: FleetManager;
  researchManager: ResearchManager;
  defenseManager: DefenseManager;
  tutorialManager: TutorialManager;
  sessionRegistry: SessionRegistry;
}

export interface TestSigners {
  owner: HardhatEthersSigner;
  player1: HardhatEthersSigner;
  player2: HardhatEthersSigner;
  player3: HardhatEthersSigner;
}

/**
 * Deploy all contracts and configure them.
 * Call this in beforeEach for each test file.
 */
export async function deployContracts(): Promise<{ contracts: DeployedContracts; signers: TestSigners }> {
  const [owner, player1, player2, player3] = await ethers.getSigners();

  // Deploy GameConfig
  const GameConfigFactory = await ethers.getContractFactory("GameConfig");
  const gameConfig = await GameConfigFactory.deploy();
  await gameConfig.waitForDeployment();

  // Deploy GameState behind UUPS proxy
  const GameStateFactory = await ethers.getContractFactory("GameState");
  const gameStateImpl = await GameStateFactory.deploy();
  await gameStateImpl.waitForDeployment();

  const ERC1967ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
  const initData = GameStateFactory.interface.encodeFunctionData("initialize");
  const gameStateProxy = await ERC1967ProxyFactory.deploy(
    await gameStateImpl.getAddress(),
    initData
  );
  await gameStateProxy.waitForDeployment();

  const gameState = GameStateFactory.attach(await gameStateProxy.getAddress()) as GameState;

  // Deploy SessionRegistry (must precede NexusGame — the router holds it as an
  // immutable). Every test deploys it so the plain-EOA path exercises
  // resolve()'s identity fallback, which is the regression guard for sessions.
  const SessionRegistryFactory = await ethers.getContractFactory("SessionRegistry");
  const sessionRegistry = await SessionRegistryFactory.deploy();
  await sessionRegistry.waitForDeployment();

  // Deploy NexusGame (Router)
  const NexusGameFactory = await ethers.getContractFactory("NexusGame");
  const nexusGame = await NexusGameFactory.deploy(
    await gameState.getAddress(),
    await gameConfig.getAddress(),
    await sessionRegistry.getAddress()
  );
  await nexusGame.waitForDeployment();

  // Deploy PlanetManager
  const PlanetManagerFactory = await ethers.getContractFactory("PlanetManager");
  const planetManager = await PlanetManagerFactory.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await planetManager.waitForDeployment();

  // Deploy ShipManager
  const ShipManagerFactory = await ethers.getContractFactory("ShipManager");
  const shipManager = await ShipManagerFactory.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await shipManager.waitForDeployment();

  // Deploy CombatEngine
  const CombatEngineFactory = await ethers.getContractFactory("CombatEngine");
  const combatEngine = await CombatEngineFactory.deploy(
    await gameConfig.getAddress()
  );
  await combatEngine.waitForDeployment();

  // Deploy FleetResolver
  const FleetResolverFactory = await ethers.getContractFactory("FleetResolver");
  const fleetResolver = await FleetResolverFactory.deploy(
    await gameState.getAddress(),
    await gameConfig.getAddress(),
    await combatEngine.getAddress()
  );
  await fleetResolver.waitForDeployment();

  // Deploy FleetManager
  const FleetManagerFactory = await ethers.getContractFactory("FleetManager");
  const fleetManager = await FleetManagerFactory.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress(),
    await fleetResolver.getAddress()
  );
  await fleetManager.waitForDeployment();

  // Deploy ResearchManager
  const ResearchManagerFactory = await ethers.getContractFactory("ResearchManager");
  const researchManager = await ResearchManagerFactory.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await researchManager.waitForDeployment();

  // Deploy DefenseManager
  const DefenseManagerFactory = await ethers.getContractFactory("DefenseManager");
  const defenseManager = await DefenseManagerFactory.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await defenseManager.waitForDeployment();

  // Deploy TutorialManager
  const TutorialManagerFactory = await ethers.getContractFactory("TutorialManager");
  const tutorialManager = await TutorialManagerFactory.deploy(
    await nexusGame.getAddress(),
    await gameState.getAddress(),
    await gameConfig.getAddress()
  );
  await tutorialManager.waitForDeployment();

  // Configure NexusGame with managers
  await nexusGame.updateManagers(
    await planetManager.getAddress(),
    await shipManager.getAddress(),
    await fleetManager.getAddress()
  );
  await nexusGame.setResearchManager(await researchManager.getAddress());
  await nexusGame.setDefenseManager(await defenseManager.getAddress());
  await nexusGame.setTutorialManager(await tutorialManager.getAddress());

  // Authorize managers in GameState
  await gameState.setManager(await planetManager.getAddress(), true);
  await gameState.setManager(await shipManager.getAddress(), true);
  await gameState.setManager(await fleetManager.getAddress(), true);
  await gameState.setManager(await fleetResolver.getAddress(), true);
  await gameState.setManager(await researchManager.getAddress(), true);
  await gameState.setManager(await defenseManager.getAddress(), true);
  await gameState.setManager(await tutorialManager.getAddress(), true);

  return {
    contracts: { nexusGame, gameConfig, gameState, planetManager, shipManager, combatEngine, fleetResolver, fleetManager, researchManager, defenseManager, tutorialManager, sessionRegistry },
    signers: { owner, player1, player2, player3 },
  };
}

/**
 * Helper: claim a planet for a player
 */
export async function claimPlanet(
  nexusGame: NexusGame,
  player: HardhatEthersSigner,
  name: string
): Promise<bigint> {
  await nexusGame.connect(player).claimStarterPlanet(name);
  return nexusGame.playerPlanet(player.address);
}

/**
 * Helper: advance time and mine a block
 */
export async function advanceTime(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

/**
 * Helper: build up a player with a shipyard and ships.
 * Upgrades resource buildings, builds shipyard, accumulates resources, builds ships.
 * Returns the planetId.
 */
export async function setupPlayerWithShips(
  nexusGame: NexusGame,
  gameConfig: GameConfig,
  player: HardhatEthersSigner,
  shipType: number,
  quantity: number
): Promise<bigint> {
  await nexusGame.connect(player).claimStarterPlanet(`Planet-${player.address.slice(0, 6)}`);
  const planetId = await nexusGame.playerPlanet(player.address);

  // Upgrade Titanium Extractor to level 2
  await advanceTime(3600);
  await nexusGame.connect(player).claimResources(planetId);
  await nexusGame.connect(player).upgradeBuilding(planetId, 1); // TITANIUM_EXTRACTOR
  await advanceTime(3600);
  await nexusGame.completeUpgrade(planetId);

  // Upgrade Helium-3 Harvester to level 2
  await advanceTime(3600);
  await nexusGame.connect(player).claimResources(planetId);
  await nexusGame.connect(player).upgradeBuilding(planetId, 2); // HELIUM3_HARVESTER
  await advanceTime(3600);
  await nexusGame.completeUpgrade(planetId);

  // Build Dark Matter Collector level 1
  await advanceTime(72000); // 20 hours
  await nexusGame.connect(player).claimResources(planetId);
  await nexusGame.connect(player).upgradeBuilding(planetId, 3); // DARKMATTER_COLLECTOR
  await advanceTime(3600);
  await nexusGame.completeUpgrade(planetId);

  // Accumulate resources
  await advanceTime(72000); // 20 hours
  await nexusGame.connect(player).claimResources(planetId);

  // Build Shipyard level 1
  await nexusGame.connect(player).upgradeBuilding(planetId, 7); // SHIPYARD
  await advanceTime(3600);
  await nexusGame.completeUpgrade(planetId);

  // Build Research Node level 1 (needed for any research)
  await advanceTime(36000); // 10 hours to accumulate
  await nexusGame.connect(player).claimResources(planetId);
  await nexusGame.connect(player).upgradeBuilding(planetId, 8); // RESEARCH_NODE
  await advanceTime(3600);
  await nexusGame.completeUpgrade(planetId);

  // Research Computer Tech level 1 (required for fleet dispatch)
  // Computer Tech: 0 Ti, 400 He3, 600 DM
  // Dark Matter production is slow, need to accumulate more
  await advanceTime(72000); // 20 hours to accumulate enough dark matter (10/hr * 20 = 200 DM)
  await nexusGame.connect(player).claimResources(planetId);

  // Check if we have enough resources, if not wait more
  // DM Collector level 1 produces 10/hr, so need 60 hours for 600 DM
  await advanceTime(144000); // 40 more hours (total 60 hours)
  await nexusGame.connect(player).claimResources(planetId);

  await nexusGame.connect(player).startResearch(planetId, 7); // COMPUTER_TECH
  await advanceTime(3600); // Wait for research to complete
  await nexusGame.completeResearch(player.address);

  // If ship type specified, fulfill prerequisites
  if (shipType > 0) {
    const reqs = await gameConfig.getShipRequirements(shipType);

    // Research prerequisites
    const researchReqs = [
      { type: Number(reqs.researchReq1), level: Number(reqs.researchLevel1) },
      { type: Number(reqs.researchReq2), level: Number(reqs.researchLevel2) },
      { type: Number(reqs.researchReq3), level: Number(reqs.researchLevel3) },
    ];

    for (const req of researchReqs) {
      if (req.type > 0) { // Not NONE
        for (let lvl = 0; lvl < req.level; lvl++) {
          await advanceTime(2880000); // 800 hours - accumulate resources (high-level research is expensive)
          await nexusGame.connect(player).claimResources(planetId);
          await nexusGame.connect(player).startResearch(planetId, req.type);
          await advanceTime(360000); // 100 hours - wait for research
          await nexusGame.completeResearch(player.address);
        }
      }
    }

    // Upgrade Shipyard to required level (currently at 1)
    const requiredShipyard = Number(reqs.shipyardLevel);
    for (let lvl = 1; lvl < requiredShipyard; lvl++) {
      await advanceTime(360000); // accumulate resources
      await nexusGame.connect(player).claimResources(planetId);
      await nexusGame.connect(player).upgradeBuilding(planetId, 7); // SHIPYARD
      await advanceTime(360000); // wait for upgrade
      await nexusGame.completeUpgrade(planetId);
    }
  }

  // Accumulate lots of resources for ship building
  await advanceTime(360000); // 100 hours
  await nexusGame.connect(player).claimResources(planetId);

  // Build ships if requested
  if (quantity > 0) {
    await nexusGame.connect(player).buildShips(planetId, shipType, quantity);
    await advanceTime(3600);
    await nexusGame.completeShipBuild(planetId);
  }

  return planetId;
}

/**
 * Helper: setup a player with a shipyard but optional ship building.
 * Lighter version for tests that just need a basic planet with shipyard.
 */
export async function setupPlayerWithShipyard(
  nexusGame: NexusGame,
  gameConfig: GameConfig,
  player: HardhatEthersSigner
): Promise<bigint> {
  return setupPlayerWithShips(nexusGame, gameConfig, player, 0, 0);
}
