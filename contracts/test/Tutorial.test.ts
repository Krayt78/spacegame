import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts,
  claimPlanet,
  advanceTime,
  setupPlayerWithShips,
  DeployedContracts,
  TestSigners,
} from "./helpers/setup";

// Building type enum values (matches GameConfig.BuildingType)
const BUILDING = {
  TITANIUM_EXTRACTOR: 1,
  HELIUM3_HARVESTER: 2,
  DARKMATTER_COLLECTOR: 3,
  TITANIUM_VAULT: 4,
  HELIUM3_TANK: 5,
  DARKMATTER_CONTAINMENT: 6,
  SHIPYARD: 7,
  RESEARCH_NODE: 8,
};

// Research type enum values (matches GameConfig.ResearchType)
const RESEARCH = {
  COMBUSTION_DRIVE: 1,
};

// Ship type enum values
const SHIP = {
  LIGHT_FIGHTER: 3,
};

// Quest rewards (16 quests total)
const QUEST_REWARDS = [
  { titanium: 100n, helium3: 50n, darkMatter: 0n },       // Quest 0: Power Up
  { titanium: 100n, helium3: 50n, darkMatter: 0n },       // Quest 1: Fuel Reserves
  { titanium: 100n, helium3: 50n, darkMatter: 0n },       // Quest 2: Into the Void
  { titanium: 350n, helium3: 100n, darkMatter: 100n },    // Quest 3: Growing Economy
  { titanium: 400n, helium3: 50n, darkMatter: 200n },     // Quest 4: Dark Expansion
  { titanium: 500n, helium3: 50n, darkMatter: 100n },     // Quest 5: Industrial Might
  { titanium: 500n, helium3: 250n, darkMatter: 100n },    // Quest 6: Dark Mastery
  { titanium: 250n, helium3: 450n, darkMatter: 200n },    // Quest 7: The Forge
  { titanium: 450n, helium3: 50n, darkMatter: 300n },     // Quest 8: Knowledge is Power
  { titanium: 700n, helium3: 300n, darkMatter: 0n },      // Quest 9: First Research
  { titanium: 800n, helium3: 300n, darkMatter: 0n },      // Quest 10: Economic Powerhouse
  { titanium: 500n, helium3: 150n, darkMatter: 0n },      // Quest 11: Dark Dominion
  { titanium: 1100n, helium3: 100n, darkMatter: 0n },     // Quest 12: Titanium Empire
  { titanium: 3200n, helium3: 1200n, darkMatter: 0n },    // Quest 13: Safe Storage
  { titanium: 12500n, helium3: 4500n, darkMatter: 0n },   // Quest 14: Maiden Voyage
  { titanium: 5000n, helium3: 3000n, darkMatter: 1000n }, // Quest 15: Battle Ready
];

/**
 * Upgrade a building to a target level starting from its current level.
 * Accumulates resources before each upgrade and waits for completion.
 */
async function upgradeToLevel(
  nexusGame: DeployedContracts["nexusGame"],
  player: TestSigners["player1"],
  planetId: bigint,
  buildingType: number,
  targetLevel: number,
  currentLevel: number = 0
): Promise<void> {
  for (let lvl = currentLevel; lvl < targetLevel; lvl++) {
    await advanceTime(72000); // 20 hours to accumulate resources
    await nexusGame.connect(player).claimResources(planetId);
    await nexusGame.connect(player).upgradeBuilding(planetId, buildingType);
    await advanceTime(3600);
    await nexusGame.completeUpgrade(planetId);
  }
}

describe("TutorialManager", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  // ============ QUEST 0: POWER UP ============

  describe("Quest 0: Power Up (titaniumExtractor >= 2)", function () {
    let planetId: bigint;

    beforeEach(async function () {
      planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
    });

    it("Should claim quest 0 after upgrading Titanium Extractor to level 2", async function () {
      // Starter planet has titaniumExtractor = 1, upgrade to 2
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const resBefore = await contracts.nexusGame.planetResources(planetId);
      const reward = QUEST_REWARDS[0];

      const tx = await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0);

      // Verify QuestClaimed event from tutorialManager
      await expect(tx)
        .to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 0, reward.titanium, reward.helium3, reward.darkMatter);

      // Verify resources increased by reward amount
      const resAfter = await contracts.nexusGame.planetResources(planetId);
      expect(resAfter.titanium).to.equal(resBefore.titanium + reward.titanium);
      expect(resAfter.helium3).to.equal(resBefore.helium3 + reward.helium3);
      expect(resAfter.darkMatter).to.equal(resBefore.darkMatter + reward.darkMatter);
    });

    it("Should show quest 0 as claimed in getTutorialStatus after claiming", async function () {
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[0]).to.be.true;
    });

    it("Should show quest 0 as claimable before claiming (condition met)", async function () {
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const [claimed, claimable, allDone] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[0]).to.be.false;
      expect(claimable[0]).to.be.true;
      expect(allDone).to.be.false;
    });

    it("Should NOT be claimable with titaniumExtractor at level 1 (starter level)", async function () {
      const [, claimable, ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      // Starter planet has titaniumExtractor = 1, need >= 2
      expect(claimable[0]).to.be.false;
    });

    it("Should revert when trying to claim quest 0 without meeting condition", async function () {
      // Starter planet has titaniumExtractor = 1, quest requires >= 2
      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ CANNOT DOUBLE-CLAIM ============

  describe("Cannot double-claim a quest", function () {
    it("Should revert when claiming an already-claimed quest", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Upgrade titaniumExtractor to 2 to satisfy quest 0
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Claim quest 0 once — succeeds
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0);

      // Attempt to claim quest 0 again — should revert
      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0)
      ).to.be.revertedWith("TutorialManager: quest already claimed");
    });

    it("Should show quest as claimed (not claimable) in status after double-claim attempt", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0);

      const [claimed, claimable, ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[0]).to.be.true;
      // Once claimed, claimable should be false (not re-claimable)
      expect(claimable[0]).to.be.false;
    });
  });

  // ============ CANNOT CLAIM UNMET CONDITION ============

  describe("Cannot claim quest with unmet condition", function () {
    it("Should revert when claiming quest 7 (shipyard) without a shipyard", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      // Starter planet has no shipyard

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 7)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should revert when claiming quest 2 (darkMatterCollector) without one", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      // Starter planet has no dark matter collector

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 2)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should revert when claiming quest 14 (LightFighter) without ships", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 14)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ NON-LINEAR CLAIMING ============

  describe("Non-linear quest claiming", function () {
    it("Should allow claiming quest 7 (shipyard) before quest 0", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Build a shipyard (needs DM collector first for resources)
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate resources
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Build shipyard
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.SHIPYARD);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const reward = QUEST_REWARDS[7];

      // Claim quest 7 directly, skipping quests 0-6
      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 7)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 7, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[7]).to.be.true;
      // Earlier quests still unclaimed
      expect(claimed[0]).to.be.false;
      expect(claimed[1]).to.be.false;
    });

    it("Should allow claiming quests in any order", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Build dark matter collector — satisfies quest 2
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Claim quest 2 first
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 2);

      // Then satisfy and claim quest 0
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[0]).to.be.true;
      expect(claimed[2]).to.be.true;
      expect(claimed[1]).to.be.false;
    });
  });

  // ============ PLANET OWNERSHIP CHECK ============

  describe("Planet ownership check", function () {
    it("Should revert when player2 tries to claim quest using player1's planetId", async function () {
      const planetId1 = await claimPlanet(contracts.nexusGame, signers.player1, "Planet One");
      await claimPlanet(contracts.nexusGame, signers.player2, "Planet Two");

      // player2 tries to claim quest 0 for player1's planet
      await expect(
        contracts.nexusGame.connect(signers.player2).claimTutorialQuest(planetId1, 0)
      ).to.be.revertedWith("TutorialManager: not your planet");
    });

    it("Should revert when a player with no planet tries to claim a quest with planetId 0", async function () {
      // signers.player3 has no planet
      await expect(
        contracts.nexusGame.connect(signers.player3).claimTutorialQuest(0, 0)
      ).to.be.revertedWith("TutorialManager: not your planet");
    });
  });

  // ============ INVALID QUEST ID ============

  describe("Invalid quest ID", function () {
    it("Should revert when claiming quest 16 (out of bounds)", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 16)
      ).to.be.revertedWith("TutorialManager: invalid quest");
    });

    it("Should revert when claiming quest 100 (far out of bounds)", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 100)
      ).to.be.revertedWith("TutorialManager: invalid quest");
    });

    it("Should accept quest 15 as valid (last valid quest ID)", async function () {
      // Just verify the revert is not "invalid quest" but something else (condition not met)
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 15)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ QUEST 4: DARK EXPANSION ============

  describe("Quest 4: Dark Expansion (darkMatterCollector >= 2)", function () {
    it("Should claim quest 4 after upgrading Dark Matter Collector to level 2", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Build Dark Matter Collector to level 1
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate resources for level 2 upgrade
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Upgrade to level 2
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const reward = QUEST_REWARDS[4];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 4)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 4, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[4]).to.be.true;
    });

    it("Should NOT be claimable with darkMatterCollector at level 1", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Build DM collector to level 1 only
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Quest 4 requires >= 2, so this should fail
      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 4)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ QUEST 13: SAFE STORAGE (OR CONDITION) ============

  describe("Quest 13: Safe Storage (storage building OR condition)", function () {
    it("Should claim quest 13 by building only a Titanium Vault", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Titanium Vault costs 1000 Ti, 0 He3. Starter has 500 Ti + level-1 extractor (30 Ti/hr).
      // Accumulate for 20 hours (30 Ti/hr * 20 = 600 Ti) → total ~1100 Ti before build.
      await advanceTime(72000); // 20 hours
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Build Titanium Vault (costs 1000 Ti, 0 He3, 0 DM)
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_VAULT);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const reward = QUEST_REWARDS[13];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 13)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 13, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[13]).to.be.true;
    });

    it("Should claim quest 13 with only a Helium-3 Tank", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Helium-3 Tank costs 1000 Ti, 500 He3. Accumulate 20 hours first.
      await advanceTime(72000); // 20 hours
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Build Helium-3 Tank (costs 1000 Ti, 500 He3, 0 DM)
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.HELIUM3_TANK);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const reward = QUEST_REWARDS[13];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 13)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 13, reward.titanium, reward.helium3, reward.darkMatter);
    });

    it("Should revert for quest 13 when no storage buildings exist", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      // No storage buildings built on starter planet

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 13)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ QUEST 9: FIRST RESEARCH (COMBUSTION DRIVE) ============

  describe("Quest 9: First Research (combustionDrive >= 1)", function () {
    it("Should claim quest 9 after researching Combustion Drive", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Build DM collector to get dark matter
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate enough resources for Research Node (200 Ti, 400 He3, 200 DM)
      await advanceTime(100000); // ~28 hours, produces enough DM at 10/hr
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Build Research Node
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.RESEARCH_NODE);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate resources for Combustion Drive research
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Research Combustion Drive (type 1)
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, RESEARCH.COMBUSTION_DRIVE);
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Verify research is complete
      const research = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research.combustionDrive).to.equal(1);

      const reward = QUEST_REWARDS[9];

      // Claim quest 9
      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 9)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 9, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[9]).to.be.true;
    });

    it("Should revert for quest 9 without Combustion Drive research", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 9)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should check research per-player, not per-planet", async function () {
      // Player1 completes research, player2 should not be able to claim quest 9
      const planetId1 = await claimPlanet(contracts.nexusGame, signers.player1, "Planet One");
      const planetId2 = await claimPlanet(contracts.nexusGame, signers.player2, "Planet Two");

      // Setup player1 research node
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);
      await advanceTime(100000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, BUILDING.RESEARCH_NODE);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);

      // Player1 researches Combustion Drive
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, RESEARCH.COMBUSTION_DRIVE);
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Player2 should still fail (their own research is 0)
      await expect(
        contracts.nexusGame.connect(signers.player2).claimTutorialQuest(planetId2, 9)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ QUEST 3: GROWING ECONOMY (AND CONDITION) ============

  describe("Quest 3: Growing Economy (titaniumExtractor >= 3 AND helium3Harvester >= 3)", function () {
    it("Should revert when only titaniumExtractor >= 3 (helium3Harvester still at 1)", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Upgrade titaniumExtractor to level 3 (from starter level 1)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 3, 1);

      // Quest 3 requires BOTH Ti >= 3 AND He3 >= 3, but He3 is still at 1
      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 3)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should revert when only helium3Harvester >= 3 (titaniumExtractor at 1)", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Upgrade helium3Harvester to level 3 (from starter level 1)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 3, 1);

      // Quest 3 requires BOTH, but Ti extractor is still at 1
      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 3)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should claim quest 3 when both titaniumExtractor >= 3 AND helium3Harvester >= 3", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Upgrade titaniumExtractor to level 3 (from 1)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 3, 1);
      // Upgrade helium3Harvester to level 3 (from 1)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 3, 1);

      const reward = QUEST_REWARDS[3];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 3)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 3, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[3]).to.be.true;
    });

    it("Should show claimable=true in status when both conditions are met", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 3, 1);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 3, 1);

      const [, claimable, ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimable[3]).to.be.true;
    });
  });

  // ============ QUEST 5: INDUSTRIAL MIGHT (AND CONDITION) ============

  describe("Quest 5: Industrial Might (titaniumExtractor >= 4 AND helium3Harvester >= 4)", function () {
    it("Should revert when only titaniumExtractor >= 4 (helium3Harvester still at 1)", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 4, 1);

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 5)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should revert when only helium3Harvester >= 4 (titaniumExtractor at 1)", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 4, 1);

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 5)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should claim quest 5 when both titaniumExtractor >= 4 AND helium3Harvester >= 4", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 4, 1);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 4, 1);

      const reward = QUEST_REWARDS[5];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 5)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 5, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[5]).to.be.true;
    });
  });

  // ============ QUEST 6: DARK MASTERY ============

  describe("Quest 6: Dark Mastery (darkMatterCollector >= 3)", function () {
    it("Should claim quest 6 after upgrading Dark Matter Collector to level 3", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.DARKMATTER_COLLECTOR, 3, 0);

      const reward = QUEST_REWARDS[6];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 6)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 6, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[6]).to.be.true;
    });

    it("Should revert for quest 6 when darkMatterCollector is only at level 2", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.DARKMATTER_COLLECTOR, 2, 0);

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 6)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ QUEST 10: ECONOMIC POWERHOUSE (AND CONDITION) ============

  describe("Quest 10: Economic Powerhouse (titaniumExtractor >= 5 AND helium3Harvester >= 5)", function () {
    it("Should revert when only titaniumExtractor >= 5 (helium3Harvester at 1)", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 5, 1);

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 10)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should revert when only helium3Harvester >= 5 (titaniumExtractor at 1)", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 5, 1);

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 10)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should claim quest 10 when both titaniumExtractor >= 5 AND helium3Harvester >= 5", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 5, 1);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 5, 1);

      const reward = QUEST_REWARDS[10];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 10)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 10, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[10]).to.be.true;
    });
  });

  // ============ QUEST 11: DARK DOMINION ============

  describe("Quest 11: Dark Dominion (darkMatterCollector >= 4)", function () {
    it("Should claim quest 11 after upgrading Dark Matter Collector to level 4", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.DARKMATTER_COLLECTOR, 4, 0);

      const reward = QUEST_REWARDS[11];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 11)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 11, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[11]).to.be.true;
    });

    it("Should revert for quest 11 when darkMatterCollector is only at level 3", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.DARKMATTER_COLLECTOR, 3, 0);

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 11)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ QUEST 12: TITANIUM EMPIRE ============

  describe("Quest 12: Titanium Empire (titaniumExtractor >= 6)", function () {
    it("Should claim quest 12 after upgrading Titanium Extractor to level 6", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 6, 1);

      const reward = QUEST_REWARDS[12];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 12)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 12, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[12]).to.be.true;
    });

    it("Should revert for quest 12 when titaniumExtractor is only at level 5", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 5, 1);

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 12)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ QUEST STATUS VIEW ============

  describe("getTutorialStatus view function", function () {
    it("Should return correct claimed/claimable arrays after claiming some quests", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Initially: no claims, no conditions met except starter planet has Ti=1 (quest 0 needs >= 2)
      let [claimed, claimable, allDone] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      for (let i = 0; i < 16; i++) {
        expect(claimed[i]).to.be.false;
      }
      expect(allDone).to.be.false;

      // Upgrade Ti extractor to 2 — quest 0 becomes claimable
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      [, claimable, ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimable[0]).to.be.true;
      // He3 harvester is still at 1, so quest 1 not yet claimable
      expect(claimable[1]).to.be.false;

      // Claim quest 0
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0);

      [claimed, claimable, allDone] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[0]).to.be.true;
      // Quest 0 is now claimed so claimable[0] should be false
      expect(claimable[0]).to.be.false;
      expect(allDone).to.be.false;
    });

    it("Should return all claimed=false for a brand new player", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      const [claimed, , allDone] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      for (let i = 0; i < 16; i++) {
        expect(claimed[i]).to.be.false;
      }
      expect(allDone).to.be.false;
    });

    it("Should track quest status independently per player", async function () {
      const planetId1 = await claimPlanet(contracts.nexusGame, signers.player1, "Planet One");
      const planetId2 = await claimPlanet(contracts.nexusGame, signers.player2, "Planet Two");

      // Player1 upgrades Ti extractor and claims quest 0
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId1, 0);

      // Player2 should have no quests claimed
      const [claimed1, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId1);
      const [claimed2, , ] = await contracts.nexusGame.getTutorialStatus(signers.player2.address, planetId2);

      expect(claimed1[0]).to.be.true;
      expect(claimed2[0]).to.be.false;
    });
  });

  // ============ QUEST REWARD VIEW ============

  describe("getTutorialQuestReward view function", function () {
    it("Should return correct rewards for all 16 quests", async function () {
      for (let i = 0; i < 16; i++) {
        const [ti, he3, dm] = await contracts.nexusGame.getTutorialQuestReward(i);
        const expected = QUEST_REWARDS[i];
        expect(ti).to.equal(expected.titanium, `Quest ${i} titanium mismatch`);
        expect(he3).to.equal(expected.helium3, `Quest ${i} helium3 mismatch`);
        expect(dm).to.equal(expected.darkMatter, `Quest ${i} darkMatter mismatch`);
      }
    });

    it("Should revert for invalid quest ID (16+)", async function () {
      await expect(
        contracts.nexusGame.getTutorialQuestReward(16)
      ).to.be.revertedWith("TutorialManager: invalid quest");
    });

    it("Should return correct reward for quest 15 (largest DM reward)", async function () {
      const [ti, he3, dm] = await contracts.nexusGame.getTutorialQuestReward(15);
      expect(ti).to.equal(5000n);
      expect(he3).to.equal(3000n);
      expect(dm).to.equal(1000n);
    });
  });

  // ============ QUESTS 14 & 15: SHIP-BASED QUESTS ============

  describe("Quest 14: Maiden Voyage (LightFighter >= 1)", function () {
    it("Should claim quest 14 after building 1 LightFighter", async function () {
      const planetId = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        SHIP.LIGHT_FIGHTER,
        1
      );

      const ships = await contracts.nexusGame.getShips(planetId);
      expect(ships[SHIP.LIGHT_FIGHTER]).to.equal(1n);

      const reward = QUEST_REWARDS[14];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 14)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 14, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[14]).to.be.true;
    });

    it("Should show quest 14 as claimable when condition is met", async function () {
      const planetId = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        SHIP.LIGHT_FIGHTER,
        1
      );

      const [, claimable, ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimable[14]).to.be.true;
    });
  });

  describe("Quest 15: Battle Ready (LightFighter >= 5)", function () {
    it("Should claim quest 15 after building 5 LightFighters", async function () {
      const planetId = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        SHIP.LIGHT_FIGHTER,
        5
      );

      const ships = await contracts.nexusGame.getShips(planetId);
      expect(ships[SHIP.LIGHT_FIGHTER]).to.equal(5n);

      const reward = QUEST_REWARDS[15];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 15)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 15, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[15]).to.be.true;
    });

    it("Should revert for quest 15 when only 4 LightFighters exist", async function () {
      const planetId = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        SHIP.LIGHT_FIGHTER,
        4
      );

      const ships = await contracts.nexusGame.getShips(planetId);
      expect(ships[SHIP.LIGHT_FIGHTER]).to.equal(4n);

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 15)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });

    it("Should allow claiming quest 14 and quest 15 independently with 5 fighters", async function () {
      const planetId = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        SHIP.LIGHT_FIGHTER,
        5
      );

      // Both quests should be claimable
      const [, claimable, ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimable[14]).to.be.true;
      expect(claimable[15]).to.be.true;

      // Claim quest 14 first
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 14);
      // Claim quest 15
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 15);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[14]).to.be.true;
      expect(claimed[15]).to.be.true;
    });
  });

  // ============ ALL QUESTS COMPLETED ============

  describe("All quests completed — tutorial completion", function () {
    it("Should complete all 16 quests, emit TutorialCompleted, set tutorialCompleted=true, and prevent further claims", async function () {
      // Use setupPlayerWithShips to get 5 LightFighters + research + shipyard + research node
      // This covers quests 7, 8, 9, 14, 15 prerequisites (shipyard, research node, combustion drive, ships)
      const planetId = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        SHIP.LIGHT_FIGHTER,
        5
      );

      // At this point we have:
      // - titaniumExtractor >= 2 (from setup)  -> quest 0 claimable
      // - helium3Harvester >= 2 (from setup)   -> quest 1 claimable
      // - darkMatterCollector >= 1 (from setup) -> quest 2 claimable
      // - shipyard >= 1 (from setup)            -> quest 7 claimable
      // - researchNode >= 1 (from setup)        -> quest 8 claimable
      // - combustionDrive >= 1 (from setup)     -> quest 9 claimable
      // - LightFighters = 5                     -> quests 14 and 15 claimable

      // Need for quest 3: Ti >= 3 AND He3 >= 3 (setup gives level 2 each, upgrade one more)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 3, 2);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 3, 2);

      // Need for quest 4: darkMatterCollector >= 2 (setup gives level 1, upgrade to 2)
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Need for quest 5: Ti >= 4 AND He3 >= 4 (upgrade from 3 to 4)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 4, 3);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 4, 3);

      // Need for quest 6: darkMatterCollector >= 3 (upgrade from 2 to 3)
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Need for quest 10: Ti >= 5 AND He3 >= 5 (upgrade from 4 to 5)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 5, 4);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 5, 4);

      // Need for quest 11: darkMatterCollector >= 4 (upgrade from 3 to 4)
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Need for quest 12: Ti >= 6 (upgrade from 5 to 6)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 6, 5);

      // Need for quest 13: any storage building >= 1 — build Titanium Vault
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_VAULT);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Verify all conditions are met by checking claimable status
      const [, claimable, ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      for (let i = 0; i < 16; i++) {
        expect(claimable[i]).to.be.true;
      }

      // Claim quests 0 through 14 (non-final)
      for (let questId = 0; questId < 15; questId++) {
        await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, questId);
      }

      // Claiming quest 15 (the final quest) should emit both QuestClaimed and TutorialCompleted
      const lastReward = QUEST_REWARDS[15];
      const tx = await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 15);

      await expect(tx)
        .to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 15, lastReward.titanium, lastReward.helium3, lastReward.darkMatter);

      await expect(tx)
        .to.emit(contracts.tutorialManager, "TutorialCompleted")
        .withArgs(signers.player1.address);

      // tutorialCompleted mapping should be true
      const isCompleted = await contracts.tutorialManager.tutorialCompleted(signers.player1.address);
      expect(isCompleted).to.be.true;

      // getTutorialStatus should show allDone = true
      const [claimedFinal, , allDone] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(allDone).to.be.true;
      for (let i = 0; i < 16; i++) {
        expect(claimedFinal[i]).to.be.true;
      }

      // Any further claim attempt should revert with "tutorial already completed"
      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0)
      ).to.be.revertedWith("TutorialManager: tutorial already completed");
    });

    it("Should not emit TutorialCompleted until the final quest is claimed", async function () {
      const planetId = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        SHIP.LIGHT_FIGHTER,
        5
      );

      // Upgrade buildings for quests 3, 4, 5, 6, 10, 11, 12, 13
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 3, 2);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 3, 2);
      // DM collector from level 1 to level 2 (for quest 4)
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      // Ti and He3 from 3 to 4 (for quest 5)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 4, 3);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 4, 3);
      // DM collector from 2 to 3 (for quest 6)
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      // Ti and He3 from 4 to 5 (for quest 10)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 5, 4);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 5, 4);
      // DM collector from 3 to 4 (for quest 11)
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      // Ti from 5 to 6 (for quest 12)
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 6, 5);
      // Build Titanium Vault (for quest 13)
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_VAULT);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Claim quests 0-14 (15 out of 16)
      for (let questId = 0; questId < 15; questId++) {
        await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, questId);
      }

      // tutorialCompleted should still be false
      const isCompleted = await contracts.tutorialManager.tutorialCompleted(signers.player1.address);
      expect(isCompleted).to.be.false;

      // allDone should still be false
      const [, , allDone] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(allDone).to.be.false;
    });
  });

  // ============ QUEST 1: FUEL RESERVES ============

  describe("Quest 1: Fuel Reserves (helium3Harvester >= 2)", function () {
    it("Should claim quest 1 after upgrading Helium-3 Harvester to level 2", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Starter planet has helium3Harvester = 1, upgrade to 2
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.HELIUM3_HARVESTER);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const reward = QUEST_REWARDS[1];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 1)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 1, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[1]).to.be.true;
    });

    it("Should NOT be claimable with helium3Harvester at level 1 (starter level)", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 1)
      ).to.be.revertedWith("TutorialManager: quest condition not met");
    });
  });

  // ============ QUEST 2: INTO THE VOID ============

  describe("Quest 2: Into the Void (darkMatterCollector >= 1)", function () {
    it("Should claim quest 2 after building a Dark Matter Collector", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Build Dark Matter Collector (costs 225 Ti, 75 He3, 0 DM — affordable from start)
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const reward = QUEST_REWARDS[2];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 2)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 2, reward.titanium, reward.helium3, reward.darkMatter);

      const [claimed, , ] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(claimed[2]).to.be.true;
    });
  });

  // ============ QUEST 7: THE FORGE ============

  describe("Quest 7: The Forge (shipyard >= 1)", function () {
    it("Should claim quest 7 after building a Shipyard", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Build DM collector first for resource ramp-up
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate for Shipyard (costs 400 Ti, 200 He3, 100 DM)
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.SHIPYARD);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const reward = QUEST_REWARDS[7];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 7)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 7, reward.titanium, reward.helium3, reward.darkMatter);
    });
  });

  // ============ QUEST 8: KNOWLEDGE IS POWER ============

  describe("Quest 8: Knowledge is Power (researchNode >= 1)", function () {
    it("Should claim quest 8 after building a Research Node", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Build DM collector first
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate for Research Node (costs 200 Ti, 400 He3, 200 DM)
      await advanceTime(100000); // ~28 hours
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.RESEARCH_NODE);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const reward = QUEST_REWARDS[8];

      await expect(
        contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 8)
      ).to.emit(contracts.tutorialManager, "QuestClaimed")
        .withArgs(signers.player1.address, 8, reward.titanium, reward.helium3, reward.darkMatter);
    });
  });

  // ============ REWARD ACCUMULATION ============

  describe("Resource rewards accumulate correctly", function () {
    it("Should correctly add all quest rewards on top of existing resources", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Claim 2 quests in sequence and verify cumulative resource increases

      // Setup quest 0: upgrade Ti extractor to 2
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      const resBeforeQ0 = await contracts.nexusGame.planetResources(planetId);

      // Claim quest 0
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0);
      const resAfterQ0 = await contracts.nexusGame.planetResources(planetId);

      expect(resAfterQ0.titanium - resBeforeQ0.titanium).to.equal(QUEST_REWARDS[0].titanium);
      expect(resAfterQ0.helium3 - resBeforeQ0.helium3).to.equal(QUEST_REWARDS[0].helium3);

      // Setup quest 1: upgrade He3 harvester to 2
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.HELIUM3_HARVESTER);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      const resBeforeQ1 = await contracts.nexusGame.planetResources(planetId);

      // Claim quest 1
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 1);
      const resAfterQ1 = await contracts.nexusGame.planetResources(planetId);

      expect(resAfterQ1.titanium - resBeforeQ1.titanium).to.equal(QUEST_REWARDS[1].titanium);
      expect(resAfterQ1.helium3 - resBeforeQ1.helium3).to.equal(QUEST_REWARDS[1].helium3);
    });
  });

  // ============ questCompletion BITMASK ============

  describe("questCompletion bitmask integrity", function () {
    it("Should correctly store bitmask for multiple claimed quests", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");

      // Claim quest 0 (upgrade Ti extractor to 2)
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0);

      // After claiming quest 0: bit 0 set → bitmask = 1
      let bitmask = await contracts.tutorialManager.questCompletion(signers.player1.address);
      expect(bitmask).to.equal(1n); // bit 0

      // Claim quest 1 (upgrade He3 harvester to 2)
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.HELIUM3_HARVESTER);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 1);

      // After claiming quests 0 and 1: bits 0 and 1 set → bitmask = 3
      bitmask = await contracts.tutorialManager.questCompletion(signers.player1.address);
      expect(bitmask).to.equal(3n); // bits 0 + 1

      // Claim quest 2 (build DM collector)
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 2);

      // Bits 0, 1, 2 set → bitmask = 7
      bitmask = await contracts.tutorialManager.questCompletion(signers.player1.address);
      expect(bitmask).to.equal(7n); // bits 0 + 1 + 2
    });

    it("Should keep bitmasks independent between players", async function () {
      const planetId1 = await claimPlanet(contracts.nexusGame, signers.player1, "Planet One");
      const planetId2 = await claimPlanet(contracts.nexusGame, signers.player2, "Planet Two");

      // Player1 claims quest 0
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId1, 0);

      const bitmask1 = await contracts.tutorialManager.questCompletion(signers.player1.address);
      const bitmask2 = await contracts.tutorialManager.questCompletion(signers.player2.address);

      expect(bitmask1).to.equal(1n);
      expect(bitmask2).to.equal(0n);
    });

    it("Should have bitmask equal to (1 << 16) - 1 = 65535 when all quests are claimed", async function () {
      // Use setupPlayerWithShips for 5 LightFighters then build all required structures
      const planetId = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        SHIP.LIGHT_FIGHTER,
        5
      );

      // Upgrade to satisfy all quest conditions
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 3, 2);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 3, 2);
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 4, 3);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 4, 3);
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 5, 4);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.HELIUM3_HARVESTER, 5, 4);
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await upgradeToLevel(contracts.nexusGame, signers.player1, planetId, BUILDING.TITANIUM_EXTRACTOR, 6, 5);
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_VAULT);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Claim all 16 quests
      for (let questId = 0; questId < 16; questId++) {
        await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, questId);
      }

      const bitmask = await contracts.tutorialManager.questCompletion(signers.player1.address);
      expect(bitmask).to.equal(65535n); // (1 << 16) - 1
    });
  });

  // ============ FULL TUTORIAL FLOW (STARTING RESOURCES ONLY) ============

  describe("Full tutorial flow without waiting — complete tutorial using starting resources + quest rewards", function () {
    it("Should complete the entire tutorial from start to Q15 using only starting resources plus quest rewards", async function () {
      const planetId = await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      // Start: 500 Ti, 500 He3, 0 DM, Ti Ext 1, He3 Harv 1

      // Step 1: upgrade Ti Ext to 2, claim Q0
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 0);

      // Step 2: upgrade He3 Harv to 2, claim Q1
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.HELIUM3_HARVESTER);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 1);

      // Step 3: build DM Collector to level 1, claim Q2
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 2);

      // Step 4: upgrade Ti Ext to 3 and He3 Harv to 3, claim Q3
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.HELIUM3_HARVESTER);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 3);

      // Step 5: upgrade DM Collector to level 2, claim Q4
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 4);

      // Step 6: upgrade Ti Ext to 4 and He3 Harv to 4, claim Q5
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.HELIUM3_HARVESTER);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 5);

      // Step 7: upgrade DM Collector to level 3, claim Q6
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 6);

      // Step 8: build Shipyard, claim Q7
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.SHIPYARD);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 7);

      // Step 9: build Research Node, claim Q8
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.RESEARCH_NODE);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 8);

      // Step 10: research Combustion Drive, claim Q9
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, RESEARCH.COMBUSTION_DRIVE);
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 9);

      // Step 11: upgrade Ti Ext to 5 and He3 Harv to 5, claim Q10
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.HELIUM3_HARVESTER);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 10);

      // Step 12: upgrade DM Collector to level 4, claim Q11
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.DARKMATTER_COLLECTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 11);

      // Step 13: upgrade Ti Ext to 6, claim Q12
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_EXTRACTOR);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 12);

      // Step 14: build Titanium Vault (storage), claim Q13
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, BUILDING.TITANIUM_VAULT);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 13);

      // Step 15: build 1 LightFighter, claim Q14
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, SHIP.LIGHT_FIGHTER, 1);
      await advanceTime(3600);
      await contracts.nexusGame.completeShipBuild(planetId);
      await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 14);

      // Step 16: build 4 more LightFighters (total 5), claim Q15
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, SHIP.LIGHT_FIGHTER, 4);
      await advanceTime(3600);
      await contracts.nexusGame.completeShipBuild(planetId);
      const finalTx = await contracts.nexusGame.connect(signers.player1).claimTutorialQuest(planetId, 15);

      // Verify TutorialCompleted is emitted on Q15
      await expect(finalTx)
        .to.emit(contracts.tutorialManager, "TutorialCompleted")
        .withArgs(signers.player1.address);

      // tutorialCompleted should be true
      const isCompleted = await contracts.tutorialManager.tutorialCompleted(signers.player1.address);
      expect(isCompleted).to.be.true;

      // All 16 quests should be claimed
      const [claimedFinal, , allDone] = await contracts.nexusGame.getTutorialStatus(signers.player1.address, planetId);
      expect(allDone).to.be.true;
      for (let i = 0; i < 16; i++) {
        expect(claimedFinal[i]).to.be.true;
      }
    });
  });
});
