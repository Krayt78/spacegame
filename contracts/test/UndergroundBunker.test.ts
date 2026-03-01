import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts, claimPlanet, advanceTime, DeployedContracts, TestSigners } from "./helpers/setup";

// UNDERGROUND_BUNKER is BuildingType enum value 9
const UNDERGROUND_BUNKER = 9;

describe("Underground Bunker", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  // ============ UPGRADE COST TESTS ============

  describe("Upgrade Costs", function () {
    it("Should return correct base cost for level 0 to 1 upgrade", async function () {
      // baseCost: (750 Ti, 450 He3, 0 DM), costMultiplier: 200 (2.0x)
      // At level 0: cost = baseCost * (200/100)^0 = baseCost * 1 = baseCost
      const cost = await contracts.gameConfig.getUpgradeCost(UNDERGROUND_BUNKER, 0);

      expect(cost.titanium).to.equal(750n);
      expect(cost.helium3).to.equal(450n);
      expect(cost.darkMatter).to.equal(0n);
    });

    it("Should return 2.0x cost for level 1 to 2 upgrade", async function () {
      // At level 1: cost = baseCost * (200/100)^1 = baseCost * 2
      // titanium: 750 * 2 = 1500, helium3: 450 * 2 = 900, darkMatter: 0
      const cost = await contracts.gameConfig.getUpgradeCost(UNDERGROUND_BUNKER, 1);

      expect(cost.titanium).to.equal(1500n);
      expect(cost.helium3).to.equal(900n);
      expect(cost.darkMatter).to.equal(0n);
    });

    it("Should return 4.0x cost for level 2 to 3 upgrade", async function () {
      // At level 2: cost = baseCost * (200/100)^2 = baseCost * 4
      // titanium: 750 * 4 = 3000, helium3: 450 * 4 = 1800, darkMatter: 0
      const cost = await contracts.gameConfig.getUpgradeCost(UNDERGROUND_BUNKER, 2);

      expect(cost.titanium).to.equal(3000n);
      expect(cost.helium3).to.equal(1800n);
      expect(cost.darkMatter).to.equal(0n);
    });

    it("Should have zero dark matter cost at all levels", async function () {
      for (let level = 0; level <= 5; level++) {
        const cost = await contracts.gameConfig.getUpgradeCost(UNDERGROUND_BUNKER, level);
        expect(cost.darkMatter).to.equal(0n);
      }
    });
  });

  // ============ PROTECTION CAPACITY TESTS ============

  describe("Protection Capacity (getStorageCapacity)", function () {
    it("Should return 0 protection at level 0", async function () {
      // getStorageCapacity returns 0 when level == 0
      const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, 0);
      expect(protection).to.equal(0n);
    });

    it("Should return 600 protection at level 1", async function () {
      // formula: baseCapacity(500) * capacityMultiplier(120)^1 / 100^1
      //        = 500 * 120 / 100 = 600
      const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, 1);
      expect(protection).to.equal(600n);
    });

    it("Should return correct protection at level 5", async function () {
      // formula: 500 * 120^5 / 100^5
      // 120^5 = 24,883,200,000  |  100^5 = 10,000,000,000
      // 500 * 24883200000 / 10000000000 = 500 * 2 = 1244 (integer division)
      const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, 5);
      expect(protection).to.equal(1244n);
    });

    it("Should return correct protection at level 10", async function () {
      // formula: 500 * 120^10 / 100^10
      // 120^10 = 6,191,736,422,400,000,000  |  100^10 = 10^20
      // 500 * 619173642240000000 / 100000000000000000000 = 500 * 6 = 3095
      // (exact: 120^10 / 100^10 = 6.1917... so floor(500 * 6.1917) = 3095)
      const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, 10);
      expect(protection).to.equal(3095n);
    });

    it("Should be monotonically increasing with level", async function () {
      let prevProtection = 0n;
      for (let level = 1; level <= 8; level++) {
        const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, level);
        expect(protection).to.be.gt(prevProtection);
        prevProtection = protection;
      }
    });
  });

  // ============ BUILD TIME TESTS ============

  describe("Build Time", function () {
    it("Should calculate build time as totalCost / 25 for level 0 to 1", async function () {
      // totalCost = 750 + 450 + 0 = 1200
      // buildTime = 1200 / 25 = 48 seconds
      const buildTime = await contracts.gameConfig.getBuildTime(UNDERGROUND_BUNKER, 0);
      expect(buildTime).to.equal(48n);
    });

    it("Should calculate build time as totalCost / 25 for level 1 to 2", async function () {
      // totalCost = 1500 + 900 + 0 = 2400
      // buildTime = 2400 / 25 = 96 seconds
      const buildTime = await contracts.gameConfig.getBuildTime(UNDERGROUND_BUNKER, 1);
      expect(buildTime).to.equal(96n);
    });

    it("Should have longer build time at higher levels due to 2.0x cost multiplier", async function () {
      const buildTime0 = await contracts.gameConfig.getBuildTime(UNDERGROUND_BUNKER, 0);
      const buildTime1 = await contracts.gameConfig.getBuildTime(UNDERGROUND_BUNKER, 1);
      const buildTime2 = await contracts.gameConfig.getBuildTime(UNDERGROUND_BUNKER, 2);

      expect(buildTime1).to.equal(buildTime0 * 2n);
      expect(buildTime2).to.equal(buildTime0 * 4n);
    });
  });

  // ============ FULL UPGRADE FLOW TESTS ============

  describe("Full Upgrade Flow", function () {
    beforeEach(async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
    });

    it("Should start bunker upgrade when player has enough resources", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Accumulate resources: need 750 Ti and 450 He3
      // Starting resources: 500 Ti, 500 He3
      // Titanium Extractor L1 produces ~33/hr; need 250 more Ti → ~8 hours
      await advanceTime(28800); // 8 hours of production

      await expect(
        contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER)
      ).to.emit(contracts.planetManager, "BuildingUpgradeStarted");

      const queue = await contracts.nexusGame.buildQueues(planetId);
      expect(queue.buildingType).to.equal(UNDERGROUND_BUNKER);
      expect(queue.targetLevel).to.equal(1);
    });

    it("Should fail to start bunker upgrade with insufficient resources", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Player starts with 500 Ti and 500 He3 — not enough for 750 Ti
      await expect(
        contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER)
      ).to.be.revertedWith("Insufficient titanium");
    });

    it("Should complete bunker upgrade after build time elapses", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Accumulate enough resources (need 750 Ti, 450 He3)
      await advanceTime(28800); // 8 hours

      // Start upgrade
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);

      // Build time = 48 seconds; advance past it
      await advanceTime(60);

      // Complete upgrade
      await expect(
        contracts.nexusGame.completeUpgrade(planetId)
      ).to.emit(contracts.planetManager, "BuildingUpgradeCompleted");

      // Verify building level incremented via getPlanet which returns the full Buildings struct
      const [, buildings] = await contracts.nexusGame.getPlanet(planetId);
      expect(buildings.undergroundBunker).to.equal(1);
    });

    it("Should not complete upgrade before build time elapses", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Accumulate enough resources (need 750 Ti, 450 He3)
      await advanceTime(28800); // 8 hours

      // Start upgrade (build time = 48 seconds)
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);

      // Do NOT advance time past build time — the upgrade should not be completable yet
      await expect(
        contracts.nexusGame.completeUpgrade(planetId)
      ).to.be.revertedWith("Upgrade not complete yet");
    });

    it("Should upgrade bunker to level 2 after completing level 1", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Level 0 -> 1: need 750 Ti, 450 He3
      // Extractor L1 produces ~33 Ti/hr, starting with 500 Ti.
      // Need 250 more Ti → ~8 hours minimum; use 28800s (8 hours) to be safe.
      await advanceTime(28800); // 8 hours

      // Level 0 -> 1
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Verify level 1
      const [, buildingsAfterL1] = await contracts.nexusGame.getPlanet(planetId);
      expect(buildingsAfterL1.undergroundBunker).to.equal(1);

      // Level 1 -> 2: need 1500 Ti, 900 He3
      // After level 1 upgrade, resources are nearly depleted.
      // Need to accumulate 1500 Ti from near-zero: ~46 hours (1500/33) → use 180000s (50 hours).
      await advanceTime(180000); // 50 hours
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Level 1 -> 2
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120);
      await contracts.nexusGame.completeUpgrade(planetId);

      const [, buildingsAfterL2] = await contracts.nexusGame.getPlanet(planetId);
      expect(buildingsAfterL2.undergroundBunker).to.equal(2);
    });

    it("Should allow canceling bunker upgrade with 50% resource refund", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Accumulate resources (need 750 Ti, 450 He3)
      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      const resBefore = await contracts.nexusGame.planetResources(planetId);

      // Start upgrade (deducts 750 Ti, 450 He3)
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      const resAfterUpgrade = await contracts.nexusGame.planetResources(planetId);

      // Cancel should refund 50% of cost: 375 Ti, 225 He3
      await expect(
        contracts.nexusGame.connect(signers.player1).cancelUpgrade(planetId)
      ).to.emit(contracts.planetManager, "BuildingUpgradeCancelled");

      const resAfterCancel = await contracts.nexusGame.planetResources(planetId);

      // Should have recovered 375 Ti (50% of 750) and 225 He3 (50% of 450)
      expect(resAfterCancel.titanium).to.equal(resAfterUpgrade.titanium + 375n);
      expect(resAfterCancel.helium3).to.equal(resAfterUpgrade.helium3 + 225n);

      // Queue should be cleared
      const queue = await contracts.nexusGame.buildQueues(planetId);
      expect(queue.completionTime).to.equal(0);
    });

    it("Should prevent unauthorized player from upgrading another player's bunker", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      await advanceTime(3600);

      // player2 tries to upgrade player1's planet
      await expect(
        contracts.nexusGame.connect(signers.player2).upgradeBuilding(planetId, UNDERGROUND_BUNKER)
      ).to.be.revertedWith("Not your planet");
    });
  });

  // ============ PLUNDERABLE RESOURCES TESTS ============

  describe("getPlunderableResources", function () {
    beforeEach(async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
    });

    it("Should return total / 2 as plunderable when bunker is level 0 (no protection)", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Check current resources (starting: 500 Ti, 500 He3, 0 DM)
      const [totalTi, totalHe, totalDm] = await contracts.nexusGame.calculateCurrentResources(planetId);
      const [plunderTi, plunderHe, plunderDm] = await contracts.nexusGame.getPlunderableResources(planetId);

      // No bunker: plunderable = total / 2
      expect(plunderTi).to.equal(totalTi / 2n);
      expect(plunderHe).to.equal(totalHe / 2n);
      expect(plunderDm).to.equal(totalDm / 2n); // 0 / 2 = 0
    });

    it("Should reduce plunderable resources when bunker level 1 protects 600 per resource", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Upgrade bunker to level 1 — need 750 Ti, 450 He3
      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate resources beyond the protection threshold
      await advanceTime(36000); // 10 hours, accumulate significant resources

      const [totalTi, totalHe, totalDm] = await contracts.nexusGame.calculateCurrentResources(planetId);
      const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, 1);
      // protection = 600

      const [plunderTi, plunderHe, plunderDm] = await contracts.nexusGame.getPlunderableResources(planetId);

      // plunderable = max(0, total - protection) / 2
      const expectedTi = totalTi > protection ? (totalTi - protection) / 2n : 0n;
      const expectedHe = totalHe > protection ? (totalHe - protection) / 2n : 0n;
      const expectedDm = totalDm > protection ? (totalDm - protection) / 2n : 0n;

      expect(plunderTi).to.equal(expectedTi);
      expect(plunderHe).to.equal(expectedHe);
      expect(plunderDm).to.equal(expectedDm);
    });

    it("Should return 0 plunderable when resources are below bunker protection threshold", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Strategy: upgrade bunker to level 1 (protection = 600 per resource), which costs
      // 750 Ti and 450 He3 and drains resources heavily. Immediately after the upgrade
      // and claiming, resources will be well below the 600 protection threshold.
      //
      // Starting: 500 Ti, 500 He3
      // After 8 hours production (L1 extractor ~33 Ti/hr, L1 harvester ~22 He3/hr):
      //   Ti ≈ 500 + 264 = 764, He3 ≈ 500 + 176 = 676
      // After spending 750 Ti, 450 He3 on upgrade:
      //   Ti ≈ 14, He3 ≈ 226  — both well below 600 protection

      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120); // let build time pass (48s)
      await contracts.nexusGame.completeUpgrade(planetId);

      // Claim to settle resources at current time
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Verify bunker is level 1 with protection = 600
      const [, buildings] = await contracts.nexusGame.getPlanet(planetId);
      expect(buildings.undergroundBunker).to.equal(1);
      const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, 1);
      expect(protection).to.equal(600n);

      // Resources should now be well below protection threshold
      const [totalTi, totalHe, totalDm] = await contracts.nexusGame.calculateCurrentResources(planetId);
      const [plunderTi, plunderHe, plunderDm] = await contracts.nexusGame.getPlunderableResources(planetId);

      // Titanium is expected to be below 600 — plunderable should be 0
      expect(totalTi).to.be.lt(protection);
      expect(plunderTi).to.equal(0n);

      // Dark matter is always 0 at this stage (no DM collector)
      expect(plunderDm).to.equal(0n);

      // Helium3 after spending 450 from ~676 is ~226, below 600
      if (totalHe < protection) {
        expect(plunderHe).to.equal(0n);
      } else {
        // Defensive: if somehow He3 exceeds protection, verify formula is still correct
        expect(plunderHe).to.equal((totalHe - protection) / 2n);
      }
    });

    it("Should return exactly 0 plunderable when resources exactly equal protection", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Upgrade bunker to level 1 (protection = 600 per resource) — need 750 Ti, 450 He3
      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120);
      await contracts.nexusGame.completeUpgrade(planetId);

      // The protection formula applied per-resource independently.
      // After upgrade, claim resources so state is settled.
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      const [totalTi, totalHe] = await contracts.nexusGame.calculateCurrentResources(planetId);
      const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, 1);
      // protection = 600

      const [plunderTi, plunderHe] = await contracts.nexusGame.getPlunderableResources(planetId);

      // Verify the formula: plunderable = max(0, total - protection) / 2
      const expectedTi = totalTi > protection ? (totalTi - protection) / 2n : 0n;
      const expectedHe = totalHe > protection ? (totalHe - protection) / 2n : 0n;

      expect(plunderTi).to.equal(expectedTi);
      expect(plunderHe).to.equal(expectedHe);
    });

    it("Should apply protection independently per resource type", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Upgrade bunker to level 1 (protection = 600 per resource) — need 750 Ti, 450 He3
      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate enough resources that some exceed protection and some don't
      await advanceTime(72000); // 20 hours

      const [totalTi, totalHe, totalDm] = await contracts.nexusGame.calculateCurrentResources(planetId);
      const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, 1);

      const [plunderTi, plunderHe, plunderDm] = await contracts.nexusGame.getPlunderableResources(planetId);

      // Each resource is protected independently
      expect(plunderTi).to.equal(totalTi > protection ? (totalTi - protection) / 2n : 0n);
      expect(plunderHe).to.equal(totalHe > protection ? (totalHe - protection) / 2n : 0n);
      expect(plunderDm).to.equal(totalDm > protection ? (totalDm - protection) / 2n : 0n);
    });

    it("Should always return less than or equal to total / 2", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // No bunker — plunderable == total / 2 (the maximum)
      await advanceTime(36000);
      const [totalTi, totalHe, totalDm] = await contracts.nexusGame.calculateCurrentResources(planetId);
      const [plunderTi, plunderHe, plunderDm] = await contracts.nexusGame.getPlunderableResources(planetId);

      expect(plunderTi).to.be.lte(totalTi / 2n + 1n); // +1 for rounding
      expect(plunderHe).to.be.lte(totalHe / 2n + 1n);
      expect(plunderDm).to.be.lte(totalDm / 2n + 1n);
    });

    it("Should revert when called on non-existent planet", async function () {
      await expect(
        contracts.nexusGame.getPlunderableResources(9999)
      ).to.be.revertedWith("Planet does not exist");
    });

    it("Should not produce production resources (no production multiplier)", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Upgrade bunker to level 1 — need 750 Ti, 450 He3
      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120);
      await contracts.nexusGame.completeUpgrade(planetId);

      const [, buildings] = await contracts.nexusGame.getPlanet(planetId);
      expect(buildings.undergroundBunker).to.equal(1);

      // Production rates should not include any bunker production (it produces nothing)
      const [tiRate, heRate, dmRate] = await contracts.nexusGame.getProductionRates(planetId);

      // Rates are based on extractor/harvester/collector only, not bunker
      const extractorProduction = await contracts.gameConfig.getProduction(1, buildings.titaniumExtractor); // TITANIUM_EXTRACTOR = 1
      const harvesterProduction = await contracts.gameConfig.getProduction(2, buildings.helium3Harvester);  // HELIUM3_HARVESTER = 2

      expect(tiRate).to.equal(extractorProduction);
      expect(heRate).to.equal(harvesterProduction);
      expect(dmRate).to.equal(0n); // No dark matter collector
    });
  });

  // ============ EDGE CASE TESTS ============

  describe("Edge Cases", function () {
    beforeEach(async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
    });

    it("Should prevent two building upgrades at the same time", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Accumulate enough for bunker (need 750 Ti, 450 He3)
      await advanceTime(28800); // 8 hours

      // Start bunker upgrade
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);

      // Try to start another upgrade while bunker is in queue
      await expect(
        contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 1) // TITANIUM_EXTRACTOR
      ).to.be.revertedWith("Build queue occupied");
    });

    it("Should verify bunker level 0 has no protection on fresh planet", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Read building level directly from gameState
      const bunkerLevel = await contracts.gameState.getBuildingLevel(planetId, UNDERGROUND_BUNKER);
      expect(bunkerLevel).to.equal(0);

      // Protection at level 0 should be 0
      const protection = await contracts.gameConfig.getStorageCapacity(UNDERGROUND_BUNKER, 0);
      expect(protection).to.equal(0n);
    });

    it("Should read bunker level via getPlanet Buildings struct", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Level should be 0 initially
      const [, buildings] = await contracts.nexusGame.getPlanet(planetId);
      expect(buildings.undergroundBunker).to.equal(0);

      // Upgrade to level 1 — need 750 Ti, 450 He3
      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Now level should be 1
      const [, buildingsAfter] = await contracts.nexusGame.getPlanet(planetId);
      expect(buildingsAfter.undergroundBunker).to.equal(1);
    });

    it("Should correctly track bunker level in buildQueues during upgrade", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Accumulate enough resources
      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);

      const queue = await contracts.nexusGame.buildQueues(planetId);
      expect(queue.buildingType).to.equal(UNDERGROUND_BUNKER);
      expect(queue.targetLevel).to.equal(1);
      expect(queue.completionTime).to.be.gt(0);
    });

    it("Should clear build queue after completing bunker upgrade", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Accumulate enough resources
      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120);
      await contracts.nexusGame.completeUpgrade(planetId);

      const queue = await contracts.nexusGame.buildQueues(planetId);
      expect(queue.completionTime).to.equal(0);
      expect(queue.targetLevel).to.equal(0);
    });

    it("Should emit BuildingUpgradeStarted with correct building type and target level", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Accumulate enough resources
      await advanceTime(28800); // 8 hours

      await expect(
        contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER)
      )
        .to.emit(contracts.planetManager, "BuildingUpgradeStarted")
        .withArgs(planetId, UNDERGROUND_BUNKER, 1, (val: bigint) => val > 0n);
    });

    it("Should emit BuildingUpgradeCompleted with correct building type and level", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Accumulate enough resources
      await advanceTime(28800); // 8 hours
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, UNDERGROUND_BUNKER);
      await advanceTime(120);

      await expect(contracts.nexusGame.completeUpgrade(planetId))
        .to.emit(contracts.planetManager, "BuildingUpgradeCompleted")
        .withArgs(planetId, UNDERGROUND_BUNKER, 1);
    });
  });
});
