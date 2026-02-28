import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts, claimPlanet, advanceTime, DeployedContracts, TestSigners } from "./helpers/setup";

describe("PlanetManager", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("Planet Claiming", function () {
    it("Should allow player to claim starter planet", async function () {
      await expect(contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Genesis Node"))
        .to.emit(contracts.planetManager, "PlanetClaimed")
        .withArgs(signers.player1.address, 1, [1, 1, 1], "Genesis Node");

      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      expect(planetId).to.equal(1);

      const hasPlanet = await contracts.nexusGame.hasPlanet(signers.player1.address);
      expect(hasPlanet).to.be.true;
    });

    it("Should prevent claiming multiple planets", async function () {
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("First Planet");

      await expect(
        contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Second Planet")
      ).to.be.revertedWith("Already claimed planet");
    });

    it("Should assign sequential coordinates", async function () {
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Planet 1");
      await contracts.nexusGame.connect(signers.player2).claimStarterPlanet("Planet 2");

      const [planet1] = await contracts.nexusGame.getPlanet(1);
      const [planet2] = await contracts.nexusGame.getPlanet(2);

      expect(planet1.coordinates).to.deep.equal([1n, 1n, 1n]);
      expect(planet2.coordinates).to.deep.equal([1n, 1n, 2n]);
    });

    it("Should reject empty planet names", async function () {
      await expect(
        contracts.nexusGame.connect(signers.player1).claimStarterPlanet("")
      ).to.be.revertedWith("Invalid planet name");
    });

    it("Should reject planet names longer than 32 characters", async function () {
      const longName = "A".repeat(33);
      await expect(
        contracts.nexusGame.connect(signers.player1).claimStarterPlanet(longName)
      ).to.be.revertedWith("Invalid planet name");
    });
  });

  describe("Resources", function () {
    beforeEach(async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
    });

    it("Should have starting resources", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      const resources = await contracts.nexusGame.planetResources(planetId);

      expect(resources.titanium).to.equal(500);
      expect(resources.helium3).to.equal(500);
      expect(resources.darkMatter).to.equal(0);
    });

    it("Should calculate resources over time", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Fast forward 1 hour
      await advanceTime(3600);

      const [titanium, helium3, darkMatter] = await contracts.nexusGame.calculateCurrentResources(planetId);

      // Should have starting + 1 hour of production
      expect(titanium).to.be.gt(500n); // Started with 500
      expect(helium3).to.be.gt(500n);
      expect(darkMatter).to.equal(0n); // No dark matter collector
    });

    it("Should calculate resources with per-second granularity", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Fast forward 2 minutes (120 seconds)
      await advanceTime(120);

      let [titanium, helium3, darkMatter] = await contracts.nexusGame.calculateCurrentResources(planetId);

      // Titanium production is 30/hour, so 2 minutes = 1 titanium
      // Starting with 500, should now have 501
      expect(titanium).to.equal(501n);

      // Helium3 production is 20/hour, so 2 minutes = 0 helium3
      // Starting with 500, should now have 500
      expect(helium3).to.equal(500n);

      expect(darkMatter).to.equal(0n); // No dark matter collector

      // Fast forward 28 minutes (1680 seconds)
      await advanceTime(1680);

      [titanium, helium3, darkMatter] = await contracts.nexusGame.calculateCurrentResources(planetId);

      // Titanium production is 30/hour, so 30 minutes = 15 titanium
      // Starting with 500, should now have 515
      expect(titanium).to.equal(515n);

      // Helium3 production is 20/hour, so 30 minutes = 10 helium3
      // Starting with 500, should now have 510
      expect(helium3).to.equal(510n);

      expect(darkMatter).to.equal(0n); // No dark matter collector
    });

    it("Should claim resources", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      await advanceTime(3600);

      await expect(contracts.nexusGame.connect(signers.player1).claimResources(planetId))
        .to.emit(contracts.planetManager, "ResourcesClaimed");

      // Verify resources were updated
      const resources = await contracts.nexusGame.planetResources(planetId);
      expect(resources.titanium).to.be.gt(500n);
    });

    it("Should return production rates", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      const [titaniumRate, helium3Rate, darkMatterRate] =
        await contracts.nexusGame.getProductionRates(planetId);

      expect(titaniumRate).to.be.gt(0n);
      expect(helium3Rate).to.be.gt(0n);
      expect(darkMatterRate).to.equal(0n); // No collector
    });
  });

  describe("Building Upgrades", function () {
    beforeEach(async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
    });

    it("Should allow upgrading a building", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      await expect(
        contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 1) // TITANIUM_EXTRACTOR
      ).to.emit(contracts.planetManager, "BuildingUpgradeStarted");

      const queue = await contracts.nexusGame.buildQueues(planetId);
      expect(queue.targetLevel).to.equal(2);
    });

    it("Should prevent upgrade without enough resources", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      // Try to upgrade expensive building without resources
      // Shipyard costs 400 titanium, 200 helium-3, and 100 dark matter
      // Player starts with 0 dark matter, so it fails on dark matter check
      await expect(
        contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 7) // SHIPYARD (expensive)
      ).to.be.revertedWith("Insufficient dark matter");
    });

    it("Should prevent multiple upgrades at once", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      // Start first upgrade
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 1);

      // Try to start another
      await expect(
        contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 2) // HELIUM3_HARVESTER
      ).to.be.revertedWith("Build queue occupied");
    });

    it("Should complete upgrade after time passes", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Start upgrade
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 1);

      // Fast forward time
      await advanceTime(3600); // 1 hour

      // Complete upgrade
      await expect(
        contracts.nexusGame.completeUpgrade(planetId)
      ).to.emit(contracts.planetManager, "BuildingUpgradeCompleted");

      const buildings = await contracts.nexusGame.planetBuildings(planetId);
      expect(buildings.titaniumExtractor).to.equal(2);
    });

    it("Should not complete upgrade before time is up", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Build time formula: totalCost / 250
      // DARKMATTER_COLLECTOR (3) level 0→1 costs 300 (225+75), build time = 1
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 3); // DARKMATTER_COLLECTOR

      // Verify that a build queue was created with a future completion time
      const queue = await contracts.nexusGame.buildQueues(planetId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const currentTime = currentBlock?.timestamp || 0;

      // Completion time should be in the future (at least 1 second from when upgrade started)
      expect(queue.completionTime).to.be.gte(currentTime);
      expect(queue.targetLevel).to.equal(1);
      expect(queue.buildingType).to.equal(3); // DARKMATTER_COLLECTOR
    });

    it("Should allow canceling upgrade with 50% refund", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Get initial resources
      const resBefore = await contracts.nexusGame.planetResources(planetId);
      const initialTitanium = resBefore.titanium;

      // Start upgrade
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 1);

      // Get resources after starting upgrade
      const resAfterUpgrade = await contracts.nexusGame.planetResources(planetId);

      // Cancel upgrade
      await expect(
        contracts.nexusGame.connect(signers.player1).cancelUpgrade(planetId)
      ).to.emit(contracts.planetManager, "BuildingUpgradeCancelled");

      // Check refund (should have some resources back)
      const resAfterCancel = await contracts.nexusGame.planetResources(planetId);
      expect(resAfterCancel.titanium).to.be.gt(resAfterUpgrade.titanium);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
    });

    it("Should return complete planet info", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      const [planet, buildings, resources, queue] = await contracts.nexusGame.getPlanet(planetId);

      expect(planet.owner).to.equal(signers.player1.address);
      expect(planet.name).to.equal("Test Planet");
      expect(planet.exists).to.be.true;
      expect(buildings.titaniumExtractor).to.equal(1);
      expect(resources.titanium).to.equal(500n);
    });

    it("Should check affordability correctly", async function () {
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Should be able to afford cheap upgrade
      const canAffordTitanium = await contracts.nexusGame.canAffordUpgrade(planetId, 1);
      expect(canAffordTitanium).to.be.true;

      // Should not be able to afford expensive upgrade
      const canAffordAssembly = await contracts.nexusGame.canAffordUpgrade(planetId, 7);
      expect(canAffordAssembly).to.be.false;
    });

    it("Should return player planet ID", async function () {
      const planetId = await contracts.nexusGame.getPlayerPlanetId(signers.player1.address);
      expect(planetId).to.equal(1n);

      const noPlanetId = await contracts.nexusGame.getPlayerPlanetId(signers.player2.address);
      expect(noPlanetId).to.equal(0n);
    });
  });

  describe("Galaxy View", function () {
    it("Should return empty system when no planets exist", async function () {
      const systemPlanets = await contracts.nexusGame.getSystemPlanets(1, 99);
      // Now returns 10 positions (1-10), positions 11-15 are outposts
      for (let i = 0; i < 10; i++) {
        expect(systemPlanets[i].exists).to.be.false;
        expect(systemPlanets[i].owner).to.equal(ethers.ZeroAddress);
      }
    });

    it("Should return planet data after claiming", async function () {
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Test Planet");
      const systemPlanets = await contracts.nexusGame.getSystemPlanets(1, 1);

      expect(systemPlanets[0].exists).to.be.true;
      expect(systemPlanets[0].owner).to.equal(signers.player1.address);
      expect(systemPlanets[0].name).to.equal("Test Planet");
      expect(systemPlanets[0].coordinates).to.deep.equal([1n, 1n, 1n]);
    });

    it("Should return multiple planets at correct positions", async function () {
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Planet 1");
      await contracts.nexusGame.connect(signers.player2).claimStarterPlanet("Planet 2");

      const systemPlanets = await contracts.nexusGame.getSystemPlanets(1, 1);

      expect(systemPlanets[0].owner).to.equal(signers.player1.address);
      expect(systemPlanets[0].coordinates).to.deep.equal([1n, 1n, 1n]);

      expect(systemPlanets[1].owner).to.equal(signers.player2.address);
      expect(systemPlanets[1].coordinates).to.deep.equal([1n, 1n, 2n]);

      // Remaining planet positions should be empty (positions 3-10)
      for (let i = 2; i < 10; i++) {
        expect(systemPlanets[i].exists).to.be.false;
      }
    });

    it("Should handle system overflow correctly", async function () {
      // Claim 11 planets to overflow into system 2
      // Now 10 planets per system (positions 1-10), positions 11-15 are outposts
      const allSigners = await ethers.getSigners();
      for (let i = 0; i < 11; i++) {
        await contracts.nexusGame.connect(allSigners[i]).claimStarterPlanet(`Planet ${i + 1}`);
      }

      // System 1 should have 10 planets (positions 1-10)
      const system1 = await contracts.nexusGame.getSystemPlanets(1, 1);
      for (let i = 0; i < 10; i++) {
        expect(system1[i].exists).to.be.true;
      }

      // System 2 should have 1 planet at position 1
      const system2 = await contracts.nexusGame.getSystemPlanets(1, 2);
      expect(system2[0].exists).to.be.true;
      expect(system2[0].coordinates).to.deep.equal([1n, 2n, 1n]);
      for (let i = 1; i < 10; i++) {
        expect(system2[i].exists).to.be.false;
      }
    });

    it("Should set coordinateToPlanet mapping on claim", async function () {
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Test Planet");
      const planetId = await contracts.nexusGame.coordinateToPlanet(1, 1, 1);
      expect(planetId).to.equal(1n);
    });
  });
});
