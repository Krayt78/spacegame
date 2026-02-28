import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts, claimPlanet, advanceTime, setupPlayerWithShipyard,
  DeployedContracts, TestSigners
} from "./helpers/setup";

describe("DefenseManager", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("Defense Building Requirements", function () {
    it("Should require shipyard level 1 to build defenses", async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1) // RocketLauncher
      ).to.be.revertedWith("Insufficient shipyard level");
    });

    it("Should reject invalid defense type", async function () {
      await claimPlanet(contracts.nexusGame, signers.player2, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player2.address);

      await expect(
        contracts.nexusGame.connect(signers.player2).buildDefenses(planetId, 0, 1) // NONE
      ).to.be.revertedWith("Invalid defense type");
    });

    it("Should reject zero quantity", async function () {
      await claimPlanet(contracts.nexusGame, signers.player3, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player3.address);

      await expect(
        contracts.nexusGame.connect(signers.player3).buildDefenses(planetId, 1, 0)
      ).to.be.revertedWith("Quantity must be greater than 0");
    });

    it("Should reject building without sufficient shipyard level", async function () {
      const planetId = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player1);

      // LightLaser requires shipyard level 2 (player only has level 1)
      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 2, 1) // LightLaser
      ).to.be.revertedWith("Insufficient shipyard level");
    });
  });

  describe("Defense Research Requirements", function () {
    let planetId: bigint;

    beforeEach(async function () {
      planetId = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player1);
    });

    it("Should reject building LightLaser without LASER_TECH level 3", async function () {
      // Upgrade shipyard to level 2 first
      await advanceTime(360000); // 100 hours for resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 7); // SHIPYARD
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // LightLaser requires LASER_TECH (type 12) level 3
      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 2, 1) // LightLaser
      ).to.be.revertedWith("Missing research requirement 1");
    });

    it("Should allow building RocketLauncher without research", async function () {
      // RocketLauncher requires only shipyard level 1, no research
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1) // RocketLauncher
      ).to.emit(contracts.defenseManager, "DefenseBuildStarted");
    });
  });

  describe("Defense Building with Shipyard", function () {
    let planetId: bigint;

    beforeEach(async function () {
      planetId = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player1);
    });

    it("Should allow building defenses with sufficient resources", async function () {
      const quantity = 1n;

      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, quantity) // RocketLauncher
      ).to.emit(contracts.defenseManager, "DefenseBuildStarted");

      const queue = await contracts.nexusGame.defenseQueues(planetId);
      expect(queue.quantity).to.equal(quantity);
      expect(queue.defenseType).to.equal(1); // RocketLauncher
      expect(queue.completionTime).to.be.gt(0);
    });

    it("Should deduct correct resources for defense build", async function () {
      const quantity = 1n;

      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      const resBefore = await contracts.nexusGame.planetResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, quantity); // RocketLauncher

      const resAfter = await contracts.nexusGame.planetResources(planetId);

      // RocketLauncher costs 2000 titanium, 0 helium3, 0 dark matter per unit
      const expectedTitaniumDeduction = 2000n * quantity;

      expect(resBefore.titanium - resAfter.titanium).to.equal(expectedTitaniumDeduction);
      expect(resBefore.helium3 - resAfter.helium3).to.equal(0n);
      expect(resBefore.darkMatter - resAfter.darkMatter).to.equal(0n);
    });

    it("Should prevent building defenses without sufficient resources", async function () {
      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1000000) // RocketLauncher, huge quantity
      ).to.be.revertedWith("Insufficient titanium");
    });

    it("Should complete defense build and add defenses to planet", async function () {
      const quantity = 2n;

      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, quantity); // RocketLauncher

      await advanceTime(300);

      await expect(
        contracts.nexusGame.completeDefenseBuild(planetId)
      ).to.emit(contracts.defenseManager, "DefenseBuildCompleted");

      const defenses = await contracts.nexusGame.getDefenses(planetId);
      expect(defenses[1]).to.equal(quantity); // RocketLauncher at index 1
      expect(defenses[0]).to.equal(0n); // NONE
    });

    it("Should not complete defense build before time is up", async function () {
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1);

      await expect(
        contracts.nexusGame.completeDefenseBuild(planetId)
      ).to.be.revertedWith("Defense build not complete yet");
    });

    it("Should prevent multiple defense builds at once", async function () {
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1); // RocketLauncher

      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1) // Another RocketLauncher
      ).to.be.revertedWith("Defense queue occupied");
    });

    it("Should allow canceling defense build with 50% refund", async function () {
      const quantity = 1n;

      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      const resBefore = await contracts.nexusGame.planetResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, quantity); // RocketLauncher
      const resAfterBuild = await contracts.nexusGame.planetResources(planetId);

      await expect(
        contracts.nexusGame.connect(signers.player1).cancelDefenseBuild(planetId)
      ).to.emit(contracts.defenseManager, "DefenseBuildCancelled");

      const resAfterCancel = await contracts.nexusGame.planetResources(planetId);

      // Should have 50% refund: RocketLauncher costs 2000 Ti
      const costPerUnit = 2000n;
      const totalCost = costPerUnit * quantity;
      const refund = totalCost / 2n;

      expect(resAfterCancel.titanium).to.equal(resAfterBuild.titanium + refund);
    });

    it("Should calculate build time based on shipyard level", async function () {
      const quantity = 1n;
      const shipyardLevel = 1; // Shipyard is at level 1

      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, quantity); // RocketLauncher

      const queue = await contracts.nexusGame.defenseQueues(planetId);
      const currentTime = (await ethers.provider.getBlock('latest'))?.timestamp || 0;

      // Formula: totalCost / (25 * (1 + shipyardLevel))
      // RocketLauncher cost: 2000 + 0 + 0 = 2000
      const totalCost = 2000 * Number(quantity);
      const expectedBuildTime = totalCost / (25 * (1 + shipyardLevel));

      expect(Number(queue.completionTime) - currentTime).to.be.closeTo(expectedBuildTime, 5);
    });
  });

  describe("Shield Dome Limits", function () {
    let planetId: bigint;

    beforeEach(async function () {
      planetId = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player1);
    });

    it("Should allow building one SmallShieldDome", async function () {
      // Research SHIELDING_TECH level 2 (required for SmallShieldDome)
      // First need Research Node

      // Start research SHIELDING_TECH level 1
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Start research SHIELDING_TECH level 2
      await advanceTime(360000); // Accumulate more resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Accumulate resources for SmallShieldDome (10000 Ti, 10000 He3)
      await advanceTime(720000); // 200 hours to accumulate enough
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 7, 1) // SmallShieldDome
      ).to.emit(contracts.defenseManager, "DefenseBuildStarted");

      await advanceTime(500);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      const defenses = await contracts.nexusGame.getDefenses(planetId);
      expect(defenses[7]).to.equal(1n); // SmallShieldDome at index 7
    });

    it("Should prevent building more than one SmallShieldDome", async function () {
      // Research SHIELDING_TECH level 2
      // Start research SHIELDING_TECH level 1
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Start research SHIELDING_TECH level 2
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Build first SmallShieldDome
      await advanceTime(720000); // Accumulate enough resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 7, 1); // SmallShieldDome
      await advanceTime(500);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      // Try to build second SmallShieldDome
      await advanceTime(720000); // Accumulate more resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 7, 1) // SmallShieldDome
      ).to.be.revertedWith("Defense limit reached");
    });

    it("Should prevent building more than one SmallShieldDome in a single batch", async function () {
      // Research SHIELDING_TECH level 2
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Start research SHIELDING_TECH level 1
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Start research SHIELDING_TECH level 2
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Try to build 2 SmallShieldDomes at once
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 7, 2) // 2x SmallShieldDome
      ).to.be.revertedWith("Defense limit reached");
    });

    it("Should allow unlimited RocketLaunchers", async function () {
      // Build 3 RocketLaunchers first (3 * 2000 = 6000 Ti)
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 3);
      await advanceTime(500);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      let defenses = await contracts.nexusGame.getDefenses(planetId);
      expect(defenses[1]).to.equal(3n);

      // Build another 3 RocketLaunchers
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 3);
      await advanceTime(500);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      defenses = await contracts.nexusGame.getDefenses(planetId);
      expect(defenses[1]).to.equal(6n); // Total 6 RocketLaunchers
    });

    it("Should have separate limits for SmallShieldDome and LargeShieldDome", async function () {
      // This test verifies that SmallShieldDome and LargeShieldDome have separate limits
      // (both can exist on the same planet, one of each)

      // Research SHIELDING_TECH level 1 through 6 (for LargeShieldDome)
      // Base cost: 200 Ti, 600 He3, multiplier 2x per level
      // Level 6 cost: 6400 Ti, 19200 He3
      // He3 production at level 2: ~56/hr, need ~343 hrs for max level
      for (let i = 0; i < 6; i++) {
        await advanceTime(2880000); // 800 hours - enough to accumulate even at highest levels
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH
        await advanceTime(360000); // 100 hours - wait for research
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      // Upgrade shipyard to level 6 (required for LargeShieldDome)
      for (let lvl = 1; lvl < 6; lvl++) {
        await advanceTime(2880000); // 800 hours
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
        await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 7); // SHIPYARD
        await advanceTime(360000); // 100 hours
        await contracts.nexusGame.completeUpgrade(planetId);
      }

      // Build SmallShieldDome (10000 Ti, 10000 He3)
      await advanceTime(2880000); // 800 hours
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 7, 1); // SmallShieldDome
      await advanceTime(3600);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      // Build LargeShieldDome (50000 Ti, 50000 He3 - different limit, should succeed)
      await advanceTime(2880000); // 800 hours
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 8, 1); // LargeShieldDome
      await advanceTime(3600);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      const defenses = await contracts.nexusGame.getDefenses(planetId);
      expect(defenses[7]).to.equal(1n); // SmallShieldDome
      expect(defenses[8]).to.equal(1n); // LargeShieldDome
    });
  });

  describe("Defense Storage", function () {
    it("Should have MAX_DEFENSE_TYPES equal to 9", async function () {
      const maxDefenseTypes = await contracts.nexusGame.MAX_DEFENSE_TYPES();
      expect(maxDefenseTypes).to.equal(9n);
    });

    it("Should return array of 9 elements from getDefenses", async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      const defenses = await contracts.nexusGame.getDefenses(planetId);
      expect(defenses.length).to.equal(9);
    });

    it("Should allow getDefenseCount for valid defense types", async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Valid defense type (RocketLauncher = 1)
      const rocketCount = await contracts.nexusGame.getDefenseCount(planetId, 1);
      expect(rocketCount).to.equal(0n);

      // Valid defense type (LightLaser = 2)
      const laserCount = await contracts.nexusGame.getDefenseCount(planetId, 2);
      expect(laserCount).to.equal(0n);
    });

    it("Should reject getDefenseCount for invalid defense types", async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Invalid defense type 0 (NONE)
      await expect(
        contracts.nexusGame.getDefenseCount(planetId, 0)
      ).to.be.revertedWith("GameState: invalid defense type");

      // Invalid defense type >= MAX_DEFENSE_TYPES
      await expect(
        contracts.nexusGame.getDefenseCount(planetId, 9)
      ).to.be.revertedWith("GameState: invalid defense type");
    });
  });

  describe("Defense Queue Conflicts", function () {
    let planetId: bigint;

    beforeEach(async function () {
      planetId = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player1);
    });

    it("Should allow defense build even when ship build queue is occupied", async function () {
      // setupPlayerWithShipyard gives us Research Node and Computer Tech
      // We need to research COMBUSTION_DRIVE for LightFighter

      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 1); // COMBUSTION_DRIVE
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Start building a LightFighter
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, 1); // LightFighter

      // Ship queue is occupied, but defense queue is separate - should succeed
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1) // RocketLauncher
      ).to.emit(contracts.defenseManager, "DefenseBuildStarted");
    });

    it("Should clear defense queue after completion", async function () {
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1);

      let queue = await contracts.nexusGame.defenseQueues(planetId);
      expect(queue.completionTime).to.be.gt(0);

      await advanceTime(500);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      queue = await contracts.nexusGame.defenseQueues(planetId);
      expect(queue.completionTime).to.equal(0); // Queue cleared
    });

    it("Should clear defense queue after cancellation", async function () {
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1);

      let queue = await contracts.nexusGame.defenseQueues(planetId);
      expect(queue.completionTime).to.be.gt(0);

      await contracts.nexusGame.connect(signers.player1).cancelDefenseBuild(planetId);

      queue = await contracts.nexusGame.defenseQueues(planetId);
      expect(queue.completionTime).to.equal(0); // Queue cleared
    });

    it("Should allow new defense build after queue is cleared", async function () {
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Build first defense
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1);
      await advanceTime(500);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      // Build second defense
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1)
      ).to.emit(contracts.defenseManager, "DefenseBuildStarted");
    });
  });

  describe("Defense Build Time Formula", function () {
    let planetId: bigint;

    beforeEach(async function () {
      planetId = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player1);
    });

    it("Should calculate build time correctly for single unit", async function () {
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      const quantity = 1n;
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, quantity); // RocketLauncher

      const queue = await contracts.nexusGame.defenseQueues(planetId);
      const currentTime = (await ethers.provider.getBlock('latest'))?.timestamp || 0;

      // Formula: totalCost / (25 * (1 + shipyardLevel))
      // RocketLauncher: 2000 Ti + 0 He3 + 0 DM = 2000
      // Shipyard level 1: buildTime = 2000 / (25 * 2) = 40 seconds
      const expectedBuildTime = 40;

      expect(Number(queue.completionTime) - currentTime).to.be.closeTo(expectedBuildTime, 5);
    });

    it("Should scale build time with quantity", async function () {
      // Build 5 rockets instead of 10 to avoid resource issues
      await advanceTime(720000); // Need resources for 5 rockets
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      const quantity = 5n;
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, quantity); // RocketLauncher

      const queue = await contracts.nexusGame.defenseQueues(planetId);
      const currentTime = (await ethers.provider.getBlock('latest'))?.timestamp || 0;

      // 5 RocketLaunchers: 10000 / (25 * 2) = 200 seconds
      const expectedBuildTime = 200;

      expect(Number(queue.completionTime) - currentTime).to.be.closeTo(expectedBuildTime, 5);
    });

    it("Should reduce build time with higher shipyard level", async function () {
      // Upgrade shipyard to level 2
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 7); // SHIPYARD
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      const quantity = 1n;
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, quantity); // RocketLauncher

      const queue = await contracts.nexusGame.defenseQueues(planetId);
      const currentTime = (await ethers.provider.getBlock('latest'))?.timestamp || 0;

      // Shipyard level 2: buildTime = 2000 / (25 * 3) = ~26.67 seconds
      const expectedBuildTime = Math.floor(2000 / (25 * 3));

      expect(Number(queue.completionTime) - currentTime).to.be.closeTo(expectedBuildTime, 5);
    });

    it("Should calculate build time for expensive defenses", async function () {
      // Build SmallShieldDome (10000 Ti + 10000 He3 = 20000 total cost)
      // First research SHIELDING_TECH level 2
      for (let i = 0; i < 2; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH
        await advanceTime(3600);
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      await advanceTime(720000); // Accumulate enough resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 7, 1); // SmallShieldDome

      const queue = await contracts.nexusGame.defenseQueues(planetId);
      const currentTime = (await ethers.provider.getBlock('latest'))?.timestamp || 0;

      // SmallShieldDome: 20000 / (25 * 2) = 400 seconds
      const expectedBuildTime = 400;

      expect(Number(queue.completionTime) - currentTime).to.be.closeTo(expectedBuildTime, 5);
    });
  });

  describe("Defense Access Control", function () {
    let planetId1: bigint;
    let planetId2: bigint;

    beforeEach(async function () {
      planetId1 = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player1);
      planetId2 = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player2);
    });

    it("Should not allow building defenses on another player's planet", async function () {
      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId2, 1, 1)
      ).to.be.revertedWith("Not your planet");
    });

    it("Should not allow canceling another player's defense build", async function () {
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);
      await contracts.nexusGame.connect(signers.player2).buildDefenses(planetId2, 1, 1);

      await expect(
        contracts.nexusGame.connect(signers.player1).cancelDefenseBuild(planetId2)
      ).to.be.revertedWith("Not your planet");
    });

    it("Should allow anyone to complete defense build when timer expires", async function () {
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId1, 1, 1);

      await advanceTime(500);

      // player2 can complete player1's defense build
      await expect(
        contracts.nexusGame.connect(signers.player2).completeDefenseBuild(planetId1)
      ).to.emit(contracts.defenseManager, "DefenseBuildCompleted");

      const defenses = await contracts.nexusGame.getDefenses(planetId1);
      expect(defenses[1]).to.equal(1n);
    });
  });

  describe("Defense Refund Mechanics", function () {
    let planetId: bigint;

    beforeEach(async function () {
      planetId = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player1);
    });

    it("Should refund 50% of titanium for RocketLauncher", async function () {
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      const resBefore = await contracts.nexusGame.planetResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1);
      const resAfterBuild = await contracts.nexusGame.planetResources(planetId);

      await contracts.nexusGame.connect(signers.player1).cancelDefenseBuild(planetId);
      const resAfterCancel = await contracts.nexusGame.planetResources(planetId);

      // RocketLauncher costs 2000 Ti, refund should be 1000 Ti
      expect(resAfterCancel.titanium - resAfterBuild.titanium).to.equal(1000n);
    });

    it("Should refund 50% of all resources for mixed-cost defenses", async function () {
      // Build LightLaser (1500 Ti, 500 He3)
      // First need shipyard level 2 and LASER_TECH level 3

      // Upgrade shipyard to level 2
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 7); // SHIPYARD
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Research LASER_TECH level 3
      for (let i = 0; i < 3; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 12); // LASER_TECH
        await advanceTime(3600);
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 2, 1); // LightLaser
      const resAfterBuild = await contracts.nexusGame.planetResources(planetId);

      await contracts.nexusGame.connect(signers.player1).cancelDefenseBuild(planetId);
      const resAfterCancel = await contracts.nexusGame.planetResources(planetId);

      // LightLaser costs 1500 Ti, 500 He3
      // Refund should be 750 Ti, 250 He3
      expect(resAfterCancel.titanium - resAfterBuild.titanium).to.equal(750n);
      expect(resAfterCancel.helium3 - resAfterBuild.helium3).to.equal(250n);
    });

    it("Should refund proportionally for multiple units", async function () {
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 5); // 5 RocketLaunchers
      const resAfterBuild = await contracts.nexusGame.planetResources(planetId);

      await contracts.nexusGame.connect(signers.player1).cancelDefenseBuild(planetId);
      const resAfterCancel = await contracts.nexusGame.planetResources(planetId);

      // 5 RocketLaunchers cost 10000 Ti, refund should be 5000 Ti
      expect(resAfterCancel.titanium - resAfterBuild.titanium).to.equal(5000n);
    });
  });

  describe("Edge Cases", function () {
    let planetId: bigint;

    beforeEach(async function () {
      planetId = await setupPlayerWithShipyard(contracts.nexusGame, contracts.gameConfig, signers.player1);
    });

    it("Should not allow completing non-existent defense build", async function () {
      await expect(
        contracts.nexusGame.completeDefenseBuild(planetId)
      ).to.be.revertedWith("No defense build in queue");
    });

    it("Should not allow canceling non-existent defense build", async function () {
      await expect(
        contracts.nexusGame.connect(signers.player1).cancelDefenseBuild(planetId)
      ).to.be.revertedWith("No defense build in queue");
    });

    it("Should handle building multiple different defense types sequentially", async function () {
      // Build RocketLaunchers
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 5);
      await advanceTime(500);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      // Upgrade shipyard and research for LightLaser
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 7);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      for (let i = 0; i < 3; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 12);
        await advanceTime(3600);
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      // Build LightLasers
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 2, 3);
      await advanceTime(500);
      await contracts.nexusGame.completeDefenseBuild(planetId);

      const defenses = await contracts.nexusGame.getDefenses(planetId);
      expect(defenses[1]).to.equal(5n); // RocketLaunchers
      expect(defenses[2]).to.equal(3n); // LightLasers
    });

    it("Should auto-claim resources before building defenses", async function () {
      // Don't manually claim resources, let auto-claim happen
      await advanceTime(360000);

      // Should not revert due to auto-claim
      await expect(
        contracts.nexusGame.connect(signers.player1).buildDefenses(planetId, 1, 1)
      ).to.emit(contracts.defenseManager, "DefenseBuildStarted");
    });
  });
});
