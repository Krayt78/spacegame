import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts, claimPlanet, advanceTime,
  DeployedContracts, TestSigners
} from "./helpers/setup";

describe("ResearchManager", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  /**
   * Helper: setup a player with a Research Node level 1 and accumulated resources.
   * Steps: claim planet → build DM collector → accumulate → build Research Node → accumulate.
   */
  async function setupPlayerWithResearchNode(
    player: typeof signers.player1
  ): Promise<bigint> {
    await contracts.nexusGame.connect(player).claimStarterPlanet(`Planet-${player.address.slice(0, 6)}`);
    const planetId = await contracts.nexusGame.playerPlanet(player.address);

    // Build Dark Matter Collector (cost: 225 Ti, 75 He3, 0 DM) - affordable with starting resources
    await contracts.nexusGame.connect(player).upgradeBuilding(planetId, 3); // DARKMATTER_COLLECTOR
    await advanceTime(60);
    await contracts.nexusGame.completeUpgrade(planetId);

    // Accumulate resources (need 200 DM for Research Node at 10/hr → ~25 hours)
    await advanceTime(100000); // ~27 hours
    await contracts.nexusGame.connect(player).claimResources(planetId);

    // Build Research Node (cost: 200 Ti, 400 He3, 200 DM)
    await contracts.nexusGame.connect(player).upgradeBuilding(planetId, 8); // RESEARCH_NODE
    await advanceTime(60);
    await contracts.nexusGame.completeUpgrade(planetId);

    // Accumulate lots of resources for research
    await advanceTime(360000); // 100 hours
    await contracts.nexusGame.connect(player).claimResources(planetId);

    return planetId;
  }

  describe("Research Requirements", function () {
    it("Should fail without a planet", async function () {
      await expect(
        contracts.nexusGame.connect(signers.player1).startResearch(1, 1) // planetId 1 (not owned by player), IMPULSE_DRIVE
      ).to.be.revertedWith("Not your planet");
    });

    it("Should fail without Research Node", async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      await expect(
        contracts.nexusGame.connect(signers.player1).startResearch(planetId, 1) // IMPULSE_DRIVE
      ).to.be.revertedWith("Research Node level 1 required");
    });

    it("Should reject ResearchType NONE", async function () {
      const planetId = await setupPlayerWithResearchNode(signers.player1);

      await expect(
        contracts.nexusGame.connect(signers.player1).startResearch(planetId, 0) // NONE
      ).to.be.revertedWith("Invalid research type");
    });
  });

  describe("Research with Research Node", function () {
    let planetId: bigint;

    beforeEach(async function () {
      planetId = await setupPlayerWithResearchNode(signers.player1);
    });

    it("Should start research with sufficient resources", async function () {
      // Armour Tech: 1000 Ti, 0 He3, 0 DM
      await expect(
        contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6) // ARMOUR_TECH
      ).to.emit(contracts.researchManager, "ResearchStarted");

      const queue = await contracts.nexusGame.researchQueues(signers.player1.address);
      expect(queue.researchType).to.equal(6); // ARMOUR_TECH
      expect(queue.targetLevel).to.equal(1);
      expect(queue.completionTime).to.be.gt(0);
    });

    it("Should deduct correct resources", async function () {
      const resBefore = await contracts.nexusGame.planetResources(planetId);

      // Shielding Tech: 200 Ti, 600 He3, 0 DM
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH

      const resAfter = await contracts.nexusGame.planetResources(planetId);

      // Resource deduction should match base cost for level 0→1
      expect(resBefore.titanium - resAfter.titanium).to.equal(200n);
      expect(resBefore.helium3 - resAfter.helium3).to.equal(600n);
    });

    it("Should fail if research queue is occupied", async function () {
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6); // ARMOUR_TECH

      await expect(
        contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5) // SHIELDING_TECH
      ).to.be.revertedWith("Research queue occupied");
    });

    it("Should fail with insufficient resources", async function () {
      // Hyperspace Drive costs 10000 Ti, 20000 He3, 6000 DM - very expensive
      await expect(
        contracts.nexusGame.connect(signers.player1).startResearch(planetId, 3) // HYPERSPACE_DRIVE
      ).to.be.revertedWith("Insufficient titanium");
    });

    it("Should complete research after time passes", async function () {
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6); // ARMOUR_TECH

      // Advance past completion time
      await advanceTime(10000);

      await expect(
        contracts.nexusGame.completeResearch(signers.player1.address)
      ).to.emit(contracts.researchManager, "ResearchCompleted");

      // Verify research level incremented
      const research = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research.armourTech).to.equal(1);
    });

    it("Should not complete research before time is up", async function () {
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6); // ARMOUR_TECH

      await expect(
        contracts.nexusGame.completeResearch(signers.player1.address)
      ).to.be.revertedWith("Research not complete yet");
    });

    it("Should cancel research with 50% refund", async function () {
      const resBefore = await contracts.nexusGame.planetResources(planetId);

      // Armour Tech: 1000 Ti, 0 He3, 0 DM
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6); // ARMOUR_TECH
      const resAfterStart = await contracts.nexusGame.planetResources(planetId);

      await expect(
        contracts.nexusGame.connect(signers.player1).cancelResearch(planetId)
      ).to.emit(contracts.researchManager, "ResearchCancelled");

      const resAfterCancel = await contracts.nexusGame.planetResources(planetId);

      // Should get 50% refund: 500 Ti back
      expect(resAfterCancel.titanium).to.equal(resAfterStart.titanium + 500n);

      // Queue should be cleared
      const queue = await contracts.nexusGame.researchQueues(signers.player1.address);
      expect(queue.completionTime).to.equal(0);
    });

    it("Should upgrade research to level 2 with scaled costs", async function () {
      // Level 1: Armour Tech costs 1000 Ti
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6); // ARMOUR_TECH
      await advanceTime(10000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      const research = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research.armourTech).to.equal(1);

      // Level 2: costs 1000 * 2.0 = 2000 Ti (costMultiplier 200 = 2.0x)
      // Claim resources first to minimize drift from auto-claim in startResearch
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      const resBefore = await contracts.nexusGame.planetResources(planetId);

      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6); // ARMOUR_TECH level 2

      const resAfter = await contracts.nexusGame.planetResources(planetId);
      // Small tolerance for 1 second of production between claim and startResearch
      expect(resBefore.titanium - resAfter.titanium).to.be.closeTo(2000n, 1n);

      await advanceTime(100000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      const research2 = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research2.armourTech).to.equal(2);
    });

    it("Should track research levels independently per player", async function () {
      // Setup player2 with Research Node
      const planetId2 = await setupPlayerWithResearchNode(signers.player2);

      // Player1 researches Armour Tech
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6);
      await advanceTime(10000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Player2 researches Shielding Tech
      await contracts.nexusGame.connect(signers.player2).startResearch(planetId2, 5);
      await advanceTime(10000);
      await contracts.nexusGame.completeResearch(signers.player2.address);

      // Verify independent tracking
      const research1 = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research1.armourTech).to.equal(1);
      expect(research1.shieldingTech).to.equal(0);

      const research2 = await contracts.nexusGame.getPlayerResearch(signers.player2.address);
      expect(research2.armourTech).to.equal(0);
      expect(research2.shieldingTech).to.equal(1);
    });

    it("Should calculate research time based on Research Node level", async function () {
      // Shielding Tech: baseCost 200 Ti + 600 He3 = 800 total (for time calc)
      // Research Node level 1
      // Formula: (Ti + He3) * 3600 / 10000 / (1 + researchNodeLevel * 0.3)
      // = 800 * 3600 / 10000 / (1 + 1 * 0.3)
      // = 800 * 0.36 / 1.3
      // = 288 / 1.3
      // = 221 seconds (Solidity: 288 * 10 / 13 = 221)
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 5); // SHIELDING_TECH

      const queue = await contracts.nexusGame.researchQueues(signers.player1.address);
      const currentTime = (await ethers.provider.getBlock('latest'))?.timestamp || 0;
      const researchDuration = Number(queue.completionTime) - currentTime;

      // Expected: 221 seconds (with some tolerance for block timestamps)
      expect(researchDuration).to.be.closeTo(221, 5);
    });

    it("Should allow anyone to complete research", async function () {
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6); // ARMOUR_TECH
      await advanceTime(10000);

      // Player2 completes player1's research
      await expect(
        contracts.nexusGame.connect(signers.player2).completeResearch(signers.player1.address)
      ).to.emit(contracts.researchManager, "ResearchCompleted");

      const research = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research.armourTech).to.equal(1);
    });

    it("Should return research queue via view function", async function () {
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 6); // ARMOUR_TECH

      const queue = await contracts.nexusGame.getResearchQueue(signers.player1.address);
      expect(queue.researchType).to.equal(6);
      expect(queue.targetLevel).to.equal(1);
      expect(queue.completionTime).to.be.gt(0);
    });
  });
});
