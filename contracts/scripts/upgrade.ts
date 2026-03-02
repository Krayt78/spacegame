import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Upgrade script for Nexus Protocol
 *
 * Redeploys logic contracts (GameConfig, managers, etc.) while preserving
 * player data stored in GameState. The existing NexusGame router is updated
 * to point to the new contracts.
 *
 * IMPORTANT: This script assumes GameState's storage layout has NOT changed.
 * If GameState structs changed (e.g., added/removed fields), you must either:
 *   1. Deploy a fresh GameState (data wipe), or
 *   2. Implement a proxy pattern for GameState (future improvement)
 *
 * Usage:
 *   npx hardhat run scripts/upgrade.ts --network <network>
 *
 * Environment variables:
 *   DEPLOYMENT_FILE - Path to deployment JSON (default: deployments/latest.json)
 *   UPGRADE_GAMECONFIG - Set to "true" to redeploy GameConfig (default: true)
 *   UPGRADE_PLANET_MANAGER - Set to "true" to redeploy PlanetManager (default: true)
 *   UPGRADE_SHIP_MANAGER - Set to "true" to redeploy ShipManager (default: true)
 *   UPGRADE_FLEET_MANAGER - Set to "true" to redeploy FleetManager (default: true)
 *   UPGRADE_RESEARCH_MANAGER - Set to "true" to redeploy ResearchManager (default: true)
 *   UPGRADE_DEFENSE_MANAGER - Set to "true" to redeploy DefenseManager (default: true)
 *   UPGRADE_COMBAT_ENGINE - Set to "true" to redeploy CombatEngine (default: true)
 *   UPGRADE_FLEET_RESOLVER - Set to "true" to redeploy FleetResolver (default: true)
 *   UPGRADE_GAME_STATE - Set to "true" to redeploy GameState (WARNING: data wipe!)
 *   DRY_RUN - Set to "true" to simulate without executing transactions
 */

interface DeploymentInfo {
  network: string;
  chainId: number;
  deployer: string;
  contracts: {
    GameConfig: string;
    GameState: string;
    NexusGame: string;
    PlanetManager: string;
    ShipManager: string;
    CombatEngine: string;
    FleetResolver: string;
    FleetManager: string;
    ResearchManager: string;
    DefenseManager: string;
  };
  timestamp: string;
}

function shouldUpgrade(envVar: string, defaultVal: boolean = true): boolean {
  const val = process.env[envVar];
  if (val === undefined) return defaultVal;
  return val.toLowerCase() === "true";
}

async function main() {
  const dryRun = process.env.DRY_RUN === "true";
  const deploymentFile = process.env.DEPLOYMENT_FILE ||
    path.join(__dirname, "..", "deployments", "latest.json");

  // ── Load existing deployment ──────────────────────────────────────
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}\nRun a full deploy first.`);
  }

  const existing: DeploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Nexus Protocol — Contract Upgrade");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Network:    ${existing.network} (chainId: ${existing.chainId})`);
  console.log(`  Deployed:   ${existing.timestamp}`);
  console.log(`  Dry run:    ${dryRun}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // ── Determine what to upgrade ─────────────────────────────────────
  const upgradeGameState = shouldUpgrade("UPGRADE_GAME_STATE", false);
  const upgradeGameConfig = shouldUpgrade("UPGRADE_GAMECONFIG");
  const upgradePlanetManager = shouldUpgrade("UPGRADE_PLANET_MANAGER");
  const upgradeShipManager = shouldUpgrade("UPGRADE_SHIP_MANAGER");
  const upgradeFleetManager = shouldUpgrade("UPGRADE_FLEET_MANAGER");
  const upgradeResearchManager = shouldUpgrade("UPGRADE_RESEARCH_MANAGER");
  const upgradeDefenseManager = shouldUpgrade("UPGRADE_DEFENSE_MANAGER");
  const upgradeCombatEngine = shouldUpgrade("UPGRADE_COMBAT_ENGINE");
  const upgradeFleetResolver = shouldUpgrade("UPGRADE_FLEET_RESOLVER");

  if (upgradeGameState) {
    console.log("⚠️  WARNING: UPGRADE_GAME_STATE=true — this will WIPE all player data!");
    console.log("   All planets, buildings, resources, fleets, and research will be lost.");
    console.log("   Press Ctrl+C within 5 seconds to abort...\n");
    if (!dryRun) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Track new addresses (start with existing, overwrite as we deploy)
  const addresses = { ...existing.contracts };

  // ── Connect to existing contracts ─────────────────────────────────
  const nexusGame = await ethers.getContractAt("NexusGame", existing.contracts.NexusGame);
  let gameState = await ethers.getContractAt("GameState", existing.contracts.GameState);

  // ── Step 1: GameState (only if explicitly requested — DATA WIPE) ─
  if (upgradeGameState) {
    console.log("[1/9] Deploying NEW GameState (⚠️  DATA WIPE)...");
    if (!dryRun) {
      const GameState = await ethers.getContractFactory("GameState");
      const newGameState = await GameState.deploy();
      await newGameState.waitForDeployment();
      addresses.GameState = await newGameState.getAddress();
      gameState = newGameState;
      console.log("  ✓ GameState deployed to:", addresses.GameState);
    } else {
      console.log("  (dry run — skipped)");
    }
  } else {
    console.log("[1/9] GameState — keeping existing:", addresses.GameState);
  }

  // ── Step 2: GameConfig ────────────────────────────────────────────
  if (upgradeGameConfig) {
    console.log("[2/9] Deploying new GameConfig...");
    if (!dryRun) {
      const GameConfig = await ethers.getContractFactory("GameConfig");
      const newGameConfig = await GameConfig.deploy();
      await newGameConfig.waitForDeployment();
      addresses.GameConfig = await newGameConfig.getAddress();
      console.log("  ✓ GameConfig deployed to:", addresses.GameConfig);
    } else {
      console.log("  (dry run — skipped)");
    }
  } else {
    console.log("[2/9] GameConfig — keeping existing:", addresses.GameConfig);
  }

  // ── Step 3: PlanetManager ────────────────────────────────────────
  if (upgradePlanetManager) {
    console.log("[3/9] Deploying new PlanetManager...");
    if (!dryRun) {
      const PlanetManager = await ethers.getContractFactory("PlanetManager");
      const pm = await PlanetManager.deploy(
        existing.contracts.NexusGame,
        addresses.GameState,
        addresses.GameConfig
      );
      await pm.waitForDeployment();
      addresses.PlanetManager = await pm.getAddress();
      console.log("  ✓ PlanetManager deployed to:", addresses.PlanetManager);
    } else {
      console.log("  (dry run — skipped)");
    }
  } else {
    console.log("[3/9] PlanetManager — keeping existing:", addresses.PlanetManager);
  }

  // ── Step 4: ShipManager ──────────────────────────────────────────
  if (upgradeShipManager) {
    console.log("[4/9] Deploying new ShipManager...");
    if (!dryRun) {
      const ShipManager = await ethers.getContractFactory("ShipManager");
      const sm = await ShipManager.deploy(
        existing.contracts.NexusGame,
        addresses.GameState,
        addresses.GameConfig
      );
      await sm.waitForDeployment();
      addresses.ShipManager = await sm.getAddress();
      console.log("  ✓ ShipManager deployed to:", addresses.ShipManager);
    } else {
      console.log("  (dry run — skipped)");
    }
  } else {
    console.log("[4/9] ShipManager — keeping existing:", addresses.ShipManager);
  }

  // ── Step 5: CombatEngine ─────────────────────────────────────────
  if (upgradeCombatEngine) {
    console.log("[5/9] Deploying new CombatEngine...");
    if (!dryRun) {
      const CombatEngine = await ethers.getContractFactory("CombatEngine");
      const ce = await CombatEngine.deploy(addresses.GameConfig);
      await ce.waitForDeployment();
      addresses.CombatEngine = await ce.getAddress();
      console.log("  ✓ CombatEngine deployed to:", addresses.CombatEngine);
    } else {
      console.log("  (dry run — skipped)");
    }
  } else {
    console.log("[5/9] CombatEngine — keeping existing:", addresses.CombatEngine);
  }

  // ── Step 6: FleetResolver ────────────────────────────────────────
  if (upgradeFleetResolver) {
    console.log("[6/9] Deploying new FleetResolver...");
    if (!dryRun) {
      const FleetResolver = await ethers.getContractFactory("FleetResolver");
      const fr = await FleetResolver.deploy(
        addresses.GameState,
        addresses.GameConfig,
        addresses.CombatEngine
      );
      await fr.waitForDeployment();
      addresses.FleetResolver = await fr.getAddress();
      console.log("  ✓ FleetResolver deployed to:", addresses.FleetResolver);
    } else {
      console.log("  (dry run — skipped)");
    }
  } else {
    console.log("[6/9] FleetResolver — keeping existing:", addresses.FleetResolver);
  }

  // ── Step 7: FleetManager ─────────────────────────────────────────
  if (upgradeFleetManager) {
    console.log("[7/9] Deploying new FleetManager...");
    if (!dryRun) {
      const FleetManager = await ethers.getContractFactory("FleetManager");
      const fm = await FleetManager.deploy(
        existing.contracts.NexusGame,
        addresses.GameState,
        addresses.GameConfig,
        addresses.FleetResolver
      );
      await fm.waitForDeployment();
      addresses.FleetManager = await fm.getAddress();
      console.log("  ✓ FleetManager deployed to:", addresses.FleetManager);
    } else {
      console.log("  (dry run — skipped)");
    }
  } else {
    console.log("[7/9] FleetManager — keeping existing:", addresses.FleetManager);
  }

  // ── Step 8: ResearchManager ──────────────────────────────────────
  if (upgradeResearchManager) {
    console.log("[8/9] Deploying new ResearchManager...");
    if (!dryRun) {
      const ResearchManager = await ethers.getContractFactory("ResearchManager");
      const rm = await ResearchManager.deploy(
        existing.contracts.NexusGame,
        addresses.GameState,
        addresses.GameConfig
      );
      await rm.waitForDeployment();
      addresses.ResearchManager = await rm.getAddress();
      console.log("  ✓ ResearchManager deployed to:", addresses.ResearchManager);
    } else {
      console.log("  (dry run — skipped)");
    }
  } else {
    console.log("[8/9] ResearchManager — keeping existing:", addresses.ResearchManager);
  }

  // ── Step 9: DefenseManager ───────────────────────────────────────
  if (upgradeDefenseManager) {
    console.log("[9/9] Deploying new DefenseManager...");
    if (!dryRun) {
      const DefenseManager = await ethers.getContractFactory("DefenseManager");
      const dm = await DefenseManager.deploy(
        existing.contracts.NexusGame,
        addresses.GameState,
        addresses.GameConfig
      );
      await dm.waitForDeployment();
      addresses.DefenseManager = await dm.getAddress();
      console.log("  ✓ DefenseManager deployed to:", addresses.DefenseManager);
    } else {
      console.log("  (dry run — skipped)");
    }
  } else {
    console.log("[9/9] DefenseManager — keeping existing:", addresses.DefenseManager);
  }

  // ── Wire up: update NexusGame router ──────────────────────────────
  console.log("\n── Wiring up NexusGame router ──");

  if (!dryRun) {
    // Update GameState reference if it changed
    if (addresses.GameState !== existing.contracts.GameState) {
      console.log("Updating GameState reference in NexusGame...");
      const tx = await nexusGame.updateGameState(addresses.GameState);
      await tx.wait();
      console.log("  ✓ GameState updated");
    }

    // Update GameConfig reference if it changed
    if (addresses.GameConfig !== existing.contracts.GameConfig) {
      console.log("Updating GameConfig reference in NexusGame...");
      const tx = await nexusGame.updateGameConfig(addresses.GameConfig);
      await tx.wait();
      console.log("  ✓ GameConfig updated");
    }

    // Update managers if any changed
    if (
      addresses.PlanetManager !== existing.contracts.PlanetManager ||
      addresses.ShipManager !== existing.contracts.ShipManager ||
      addresses.FleetManager !== existing.contracts.FleetManager
    ) {
      console.log("Updating managers (Planet, Ship, Fleet) in NexusGame...");
      const tx = await nexusGame.updateManagers(
        addresses.PlanetManager,
        addresses.ShipManager,
        addresses.FleetManager
      );
      await tx.wait();
      console.log("  ✓ Managers updated");
    }

    if (addresses.ResearchManager !== existing.contracts.ResearchManager) {
      console.log("Updating ResearchManager in NexusGame...");
      const tx = await nexusGame.setResearchManager(addresses.ResearchManager);
      await tx.wait();
      console.log("  ✓ ResearchManager updated");
    }

    if (addresses.DefenseManager !== existing.contracts.DefenseManager) {
      console.log("Updating DefenseManager in NexusGame...");
      const tx = await nexusGame.setDefenseManager(addresses.DefenseManager);
      await tx.wait();
      console.log("  ✓ DefenseManager updated");
    }
  } else {
    console.log("  (dry run — skipped)");
  }

  // ── Wire up: authorize new managers in GameState ──────────────────
  console.log("\n── Updating GameState authorization ──");

  if (!dryRun) {
    // Build list of (address, shouldAuthorize) changes
    const authChanges: { name: string; oldAddr: string; newAddr: string }[] = [
      { name: "PlanetManager", oldAddr: existing.contracts.PlanetManager, newAddr: addresses.PlanetManager },
      { name: "ShipManager", oldAddr: existing.contracts.ShipManager, newAddr: addresses.ShipManager },
      { name: "FleetManager", oldAddr: existing.contracts.FleetManager, newAddr: addresses.FleetManager },
      { name: "FleetResolver", oldAddr: existing.contracts.FleetResolver, newAddr: addresses.FleetResolver },
      { name: "ResearchManager", oldAddr: existing.contracts.ResearchManager, newAddr: addresses.ResearchManager },
      { name: "DefenseManager", oldAddr: existing.contracts.DefenseManager, newAddr: addresses.DefenseManager },
    ];

    for (const { name, oldAddr, newAddr } of authChanges) {
      if (oldAddr !== newAddr) {
        // Authorize new manager
        console.log(`Authorizing new ${name} (${newAddr})...`);
        let tx = await gameState.setManager(newAddr, true);
        await tx.wait();

        // Revoke old manager
        console.log(`Revoking old ${name} (${oldAddr})...`);
        tx = await gameState.setManager(oldAddr, false);
        await tx.wait();

        console.log(`  ✓ ${name} swapped`);
      }
    }
  } else {
    console.log("  (dry run — skipped)");
  }

  // ── Save updated deployment info ──────────────────────────────────
  const network = await ethers.provider.getNetwork();
  const updatedDeployment: DeploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: addresses,
    timestamp: new Date().toISOString(),
  };

  // Back up previous deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const backupName = `deployment-${existing.timestamp.replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, backupName),
    JSON.stringify(existing, null, 2)
  );
  console.log(`\nPrevious deployment backed up to: deployments/${backupName}`);

  fs.writeFileSync(
    path.join(deploymentsDir, "latest.json"),
    JSON.stringify(updatedDeployment, null, 2)
  );

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Upgrade complete!");
  console.log("═══════════════════════════════════════════════════════════");

  const changedContracts = Object.entries(addresses).filter(
    ([key, addr]) => addr !== existing.contracts[key as keyof typeof existing.contracts]
  );

  if (changedContracts.length === 0) {
    console.log("  No contracts were changed.");
  } else {
    console.log("  Changed contracts:");
    for (const [name, addr] of changedContracts) {
      const oldAddr = existing.contracts[name as keyof typeof existing.contracts];
      console.log(`    ${name}:`);
      console.log(`      old: ${oldAddr}`);
      console.log(`      new: ${addr}`);
    }
  }

  console.log("\n  Unchanged contracts:");
  const unchangedContracts = Object.entries(addresses).filter(
    ([key, addr]) => addr === existing.contracts[key as keyof typeof existing.contracts]
  );
  for (const [name, addr] of unchangedContracts) {
    console.log(`    ${name}: ${addr}`);
  }

  console.log("\nDeployment saved to: deployments/latest.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
