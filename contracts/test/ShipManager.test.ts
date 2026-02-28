import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts, claimPlanet, advanceTime, setupPlayerWithShipyard, setupPlayerWithShips,
  DeployedContracts, TestSigners
} from "./helpers/setup";

describe("ShipManager", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("Ship Building Requirements", function () {
    let planetId: bigint;

    beforeEach(async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
    });

    it("Should require shipyard level 1 to build ships", async function () {
      await expect(
        contracts.nexusGame.connect(signers.player1).buildShips(planetId, 1, 1) // SmallCargoShip
      ).to.be.revertedWith("Insufficient shipyard level");
    });

    it("Should reject invalid ship type", async function () {
      await expect(
        contracts.nexusGame.connect(signers.player1).buildShips(planetId, 0, 1) // NONE
      ).to.be.revertedWith("Invalid ship type");
    });

    it("Should reject zero quantity", async function () {
      await expect(
        contracts.nexusGame.connect(signers.player1).buildShips(planetId, 1, 0)
      ).to.be.revertedWith("Quantity must be greater than 0");
    });
  });

  describe("Ship Building with Shipyard", function () {
    let planetId: bigint;

    beforeEach(async function () {
      // Setup with LightFighter prerequisites (Shipyard 1, Combustion Drive 1)
      planetId = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 0);
    });

    it("Should allow building ships with sufficient resources", async function () {
      const quantity = 1n;

      await expect(
        contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, quantity) // LightFighter
      ).to.emit(contracts.shipManager, "ShipBuildStarted");

      const queue = await contracts.nexusGame.shipQueues(planetId);
      expect(queue.quantity).to.equal(quantity);
      expect(queue.shipType).to.equal(3); // LightFighter
      expect(queue.completionTime).to.be.gt(0);
    });

    it("Should deduct correct resources for ship build", async function () {
      const quantity = 1n;
      const resBefore = await contracts.nexusGame.planetResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, quantity); // LightFighter

      const resAfter = await contracts.nexusGame.planetResources(planetId);

      // LightFighter costs 3000 titanium, 1000 helium3 per ship
      const expectedTitaniumDeduction = 3000n * quantity;
      const expectedHelium3Deduction = 1000n * quantity;

      expect(resBefore.titanium - resAfter.titanium).to.equal(expectedTitaniumDeduction);
      expect(resBefore.helium3 - resAfter.helium3).to.equal(expectedHelium3Deduction);
    });

    it("Should prevent building ships without sufficient resources", async function () {
      await expect(
        contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, 1000000) // LightFighter, huge quantity
      ).to.be.revertedWith("Insufficient titanium");
    });

    it("Should complete ship build and add ships to planet", async function () {
      const quantity = 1n;

      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, quantity); // LightFighter

      await advanceTime(300);

      await expect(
        contracts.nexusGame.completeShipBuild(planetId)
      ).to.emit(contracts.shipManager, "ShipBuildCompleted");

      const ships = await contracts.nexusGame.getShips(planetId);
      expect(ships[3]).to.equal(quantity); // LightFighter at index 3
      expect(ships[1]).to.equal(0n); // SmallCargo at index 1
      expect(ships[0]).to.equal(0n); // NONE
    });

    it("Should not complete ship build before time is up", async function () {
      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, 1);

      await expect(
        contracts.nexusGame.completeShipBuild(planetId)
      ).to.be.revertedWith("Ship build not complete yet");
    });

    it("Should prevent multiple ship builds at once", async function () {
      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, 1); // LightFighter

      await expect(
        contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, 1) // Another LightFighter
      ).to.be.revertedWith("Ship queue occupied");
    });

    it("Should allow canceling ship build with 50% refund", async function () {
      const quantity = 1n;
      const resBefore = await contracts.nexusGame.planetResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, quantity); // LightFighter
      const resAfterBuild = await contracts.nexusGame.planetResources(planetId);

      await expect(
        contracts.nexusGame.connect(signers.player1).cancelShipBuild(planetId)
      ).to.emit(contracts.shipManager, "ShipBuildCancelled");

      const resAfterCancel = await contracts.nexusGame.planetResources(planetId);

      // Should have 50% refund: LightFighter costs 3000 Ti
      const costPerShip = 3000n;
      const totalCost = costPerShip * quantity;
      const refund = totalCost / 2n;

      expect(resAfterCancel.titanium).to.equal(resAfterBuild.titanium + refund);
    });

    it("Should build different ship types", async function () {
      // Build LightFighter
      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, 1); // LightFighter

      await advanceTime(500);
      await contracts.nexusGame.completeShipBuild(planetId);

      const ships = await contracts.nexusGame.getShips(planetId);
      expect(ships[3]).to.equal(1n); // LightFighter at index 3
      expect(ships[1]).to.equal(0n); // SmallCargo at index 1
    });

    it("Should calculate build time based on shipyard level", async function () {
      const quantity = 1n;
      const shipyardLevel = 1; // Shipyard is at level 1

      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, quantity); // LightFighter

      const queue = await contracts.nexusGame.shipQueues(planetId);
      const currentTime = (await ethers.provider.getBlock('latest'))?.timestamp || 0;
      // Formula: totalCost / (25 * (1 + shipyardLevel))
      // LightFighter cost: 3000 + 1000 + 0 = 4000
      const totalCost = 4000 * Number(quantity);
      const expectedBuildTime = totalCost / (25 * (1 + shipyardLevel));

      expect(Number(queue.completionTime) - currentTime).to.be.closeTo(expectedBuildTime, 5);
    });

    it("Should return ship queue in getPlanet", async function () {
      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, 1);

      const [planet, buildings, resources, buildQueue, shipQueue] = await contracts.nexusGame.getPlanet(planetId);

      expect(shipQueue.shipType).to.equal(3); // LightFighter
      expect(shipQueue.quantity).to.equal(1n);
      expect(shipQueue.completionTime).to.be.gt(0);
    });
  });

  describe("Ship Storage", function () {
    it("Should have MAX_SHIP_TYPES equal to 13", async function () {
      const maxShipTypes = await contracts.nexusGame.MAX_SHIP_TYPES();
      expect(maxShipTypes).to.equal(13n);
    });

    it("Should return array of 13 elements from getShips", async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      const ships = await contracts.nexusGame.getShips(planetId);
      expect(ships.length).to.equal(13);
    });

    it("Should allow getShipCount for valid ship types", async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Valid ship type (SmallCargoShip = 1)
      const smallCargoCount = await contracts.nexusGame.getShipCount(planetId, 1);
      expect(smallCargoCount).to.equal(0n);

      // Valid ship type (LightFighter = 3)
      const lightFighterCount = await contracts.nexusGame.getShipCount(planetId, 3);
      expect(lightFighterCount).to.equal(0n);
    });

    it("Should reject getShipCount for invalid ship types", async function () {
      await claimPlanet(contracts.nexusGame, signers.player1, "Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Invalid ship type 0 (NONE)
      await expect(
        contracts.nexusGame.getShipCount(planetId, 0)
      ).to.be.revertedWith("GameState: invalid ship type");

      // Invalid ship type >= MAX_SHIP_TYPES
      await expect(
        contracts.nexusGame.getShipCount(planetId, 13)
      ).to.be.revertedWith("GameState: invalid ship type");
    });
  });
});
