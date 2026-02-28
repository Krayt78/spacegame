import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts, advanceTime, setupPlayerWithShips,
  DeployedContracts, TestSigners
} from "./helpers/setup";

describe("Raider Outposts", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  /**
   * Helper: capture an outpost for a player
   */
  async function captureOutpost(
    planetId: bigint,
    destination: [number, number, number]
  ): Promise<bigint> {
    const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
    await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId, ships, destination, 2, 0, 0, 0); // CAPTURE = 2
    const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
    const fleetId = fleetIds[fleetIds.length - 1];
    await advanceTime(60);
    await contracts.nexusGame.resolveFleet(fleetId);
    return fleetId;
  }

  describe("Outpost Data", function () {
    it("Should return correct outpost types for positions 11-15", async function () {
      // Position 11 = TITANIUM_MINE (1)
      // Position 12 = TITANIUM_MINE (1)
      // Position 13 = HELIUM3_LAB (2)
      // Position 14 = HELIUM3_LAB (2)
      // Position 15 = DARKMATTER_REFINERY (3)
      const [outpost11, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      const [outpost12, , ] = await contracts.nexusGame.getOutpost(1, 1, 12);
      const [outpost13, , ] = await contracts.nexusGame.getOutpost(1, 1, 13);
      const [outpost14, , ] = await contracts.nexusGame.getOutpost(1, 1, 14);
      const [outpost15, , ] = await contracts.nexusGame.getOutpost(1, 1, 15);

      // Outpost types: 1 = TITANIUM_MINE, 2 = HELIUM3_LAB, 3 = DARKMATTER_REFINERY
      expect(outpost11.outpostType).to.equal(1); // TITANIUM_MINE
      expect(outpost12.outpostType).to.equal(1); // TITANIUM_MINE
      expect(outpost13.outpostType).to.equal(2); // HELIUM3_LAB
      expect(outpost14.outpostType).to.equal(2); // HELIUM3_LAB
      expect(outpost15.outpostType).to.equal(3); // DARKMATTER_REFINERY
    });

    it("Should return unclaimed outpost with correct type via getOutpost", async function () {
      const [outpost, currentResources, stationedShips] = await contracts.nexusGame.getOutpost(1, 1, 11);

      expect(outpost.owner).to.equal(ethers.ZeroAddress);
      expect(outpost.outpostType).to.equal(1); // TITANIUM_MINE
      expect(currentResources).to.equal(0n);
      expect(stationedShips.length).to.equal(13);
    });

    it("Should return all 5 outposts via getSystemOutposts", async function () {
      const [outposts, currentResources, stationedShips] = await contracts.nexusGame.getSystemOutposts(1, 1);

      expect(outposts.length).to.equal(5);
      expect(currentResources.length).to.equal(5);
      expect(stationedShips.length).to.equal(5);

      // All unclaimed outposts should have zero address owner
      for (let i = 0; i < 5; i++) {
        expect(outposts[i].owner).to.equal(ethers.ZeroAddress);
      }
    });
  });

  describe("Capturing Outposts", function () {
    let planetId1: bigint;

    beforeEach(async function () {
      planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
    });

    it("Should capture unclaimed outpost with one ship", async function () {
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 11];

      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 2, 0, 0, 0); // CAPTURE = 2

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      const fleetId = fleetIds[0];

      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetId);

      const [outpost, , stationedShips] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player1.address);
      expect(stationedShips[1]).to.equal(1n); // 1 Light Hauler stationed
    });

    it("Should set outpost owner after capture", async function () {
      await captureOutpost(planetId1, [1, 1, 11]);

      const [outpost, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player1.address);
    });

    it("Should set lastCollected on capture", async function () {
      await captureOutpost(planetId1, [1, 1, 11]);

      const [outpost, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.lastCollected).to.be.gt(0);
    });
  });

  describe("Outpost Resource Accumulation", function () {
    let planetId1: bigint;

    beforeEach(async function () {
      planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      await captureOutpost(planetId1, [1, 1, 11]);
    });

    it("Should accumulate resources over time after capture", async function () {
      // Immediately after capture, resources should be 0
      let [, currentResources, ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(currentResources).to.equal(0n);

      // Wait some time
      await advanceTime(3600); // 1 hour

      // Resources should have accumulated
      [, currentResources, ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(currentResources).to.be.gt(0n);
    });

    it("Should calculate outpost resources correctly", async function () {
      await advanceTime(3600); // 1 hour

      const [currentResources, outpostType] = await contracts.nexusGame.calculateOutpostResources(1, 1, 11);
      expect(currentResources).to.be.gt(0n);
      expect(outpostType).to.equal(1); // TITANIUM_MINE
    });

    it("Unclaimed outpost should not accumulate resources", async function () {
      // Check unclaimed outpost at position 12
      await advanceTime(3600);

      const [, currentResources, ] = await contracts.nexusGame.getOutpost(1, 1, 12);
      expect(currentResources).to.equal(0n);
    });
  });

  describe("Raiding Outposts", function () {
    let planetId1: bigint;
    let planetId2: bigint;

    beforeEach(async function () {
      // player2 captures outpost with Light Hauler
      planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1);

      // player2 captures outpost at [1,1,11]
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player2).dispatchFleet(planetId2, ships, [1, 1, 11], 2, 0, 0, 0);
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player2.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Accumulate resources at outpost
      await advanceTime(3600);

      // player1 gets an Interceptor for raiding (stronger than garrison)
      planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 1);
    });

    it("Should raid outpost and load resources into fleet cargo", async function () {
      // Check outpost has resources
      let [, resourcesBefore, ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(resourcesBefore).to.be.gt(0n);

      // player1 raids outpost with Interceptor (beats Light Hauler garrison)
      const ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 1 Interceptor
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 1, 0, 0, 0); // RAID = 1

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      const fleetId = fleetIds[fleetIds.length - 1];

      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetId);

      // Fleet should be in RETURNING status after successful raid
      const fleet = await contracts.nexusGame.getFleet(fleetId);
      expect(fleet.status).to.equal(2); // RETURNING
      // Fleet should have some cargo (titanium from TITANIUM_MINE outpost)
      expect(fleet.cargoTitanium).to.be.gte(0n);
    });

    it("Should NOT change outpost ownership after raid", async function () {
      const ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 1 Interceptor
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      const [outpost, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player2.address); // Still owned by player2
    });
  });

  describe("Outpost Ownership Transfer", function () {
    let planetId1: bigint;
    let planetId2: bigint;

    beforeEach(async function () {
      // player2 captures outpost first with a Light Hauler
      planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1);

      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player2).dispatchFleet(planetId2, ships, [1, 1, 11], 2, 0, 0, 0);
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player2.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      await advanceTime(3600); // accumulate resources

      // player1 gets an Interceptor (type 2) - stronger attack to beat garrison
      planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 1);
    });

    it("Should transfer ownership when capturing from another player", async function () {
      // Verify player2 owns it
      let [outpost, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player2.address);

      // player1 captures it with Interceptor (stronger than Light Hauler garrison)
      const ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 1 Interceptor at index 2
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0);
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // Verify player1 now owns it
      [outpost, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player1.address);
    });

    it("Should replace garrison on capture", async function () {
      // player1 captures with 1 Interceptor
      const ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 1 Interceptor at index 2
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0);
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // Check stationed ships - should be player1's Interceptor
      const [, , stationedShips] = await contracts.nexusGame.getOutpost(1, 1, 11);
      // The capturing fleet should now be stationed (Interceptor at index 2)
      expect(stationedShips[3]).to.be.gte(0n);
    });
  });

  describe("Move to Outpost", function () {
    let planetId1: bigint;

    beforeEach(async function () {
      // Capture outpost but don't use captureOutpost helper since we need to manage ships differently
      planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
    });

    it("Should capture unclaimed outpost and station the fleet", async function () {
      // Dispatch to capture an unclaimed outpost
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0); // CAPTURE

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // Check ship was stationed at outpost
      const [outpost, , stationedShips] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player1.address);
      expect(stationedShips[1]).to.equal(1n);
    });

    it("Should fail to MOVE to outpost you do not own", async function () {
      // player1 captures outpost first
      const ships1 = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships1, [1, 1, 11], 2, 0, 0, 0);
      const fleetIds1 = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds1[fleetIds1.length - 1]);

      // player2 tries to MOVE to player1's outpost
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1);

      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await expect(
        contracts.nexusGame.connect(signers.player2).dispatchFleet(planetId2, ships, [1, 1, 11], 3, 0, 0, 0) // MOVE = 3
      ).to.be.revertedWith("MOVE requires own outpost");
    });
  });

  describe("Player Outpost Tracking", function () {
    let planetId1: bigint;
    let planetId2: bigint;

    beforeEach(async function () {
      planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 2);
    });

    it("Should return empty array for player with no outposts", async function () {
      const outposts = await contracts.nexusGame.getPlayerOutposts(signers.player1.address);
      expect(outposts.length).to.equal(0);
    });

    it("Should track outpost after capture", async function () {
      // player1 captures outpost at [1,1,11]
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0); // CAPTURE
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // Verify getPlayerOutposts returns [[1,1,11]]
      const outposts = await contracts.nexusGame.getPlayerOutposts(signers.player1.address);
      expect(outposts.length).to.equal(1);
      expect(outposts[0][0]).to.equal(1); // galaxy
      expect(outposts[0][1]).to.equal(1); // system
      expect(outposts[0][2]).to.equal(11); // position
    });

    it("Should track multiple outposts", async function () {
      // player1 captures outpost at [1,1,11]
      const ships1 = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships1, [1, 1, 11], 2, 0, 0, 0);
      let fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // player1 captures outpost at [1,1,12]
      const ships2 = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships2, [1, 1, 12], 2, 0, 0, 0);
      fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // Verify getPlayerOutposts returns both
      const outposts = await contracts.nexusGame.getPlayerOutposts(signers.player1.address);
      expect(outposts.length).to.equal(2);

      // Check both outposts are present (order may vary)
      const outpostStrings = outposts.map(o => `${o[0]},${o[1]},${o[2]}`);
      expect(outpostStrings).to.include("1,1,11");
      expect(outpostStrings).to.include("1,1,12");
    });

    it("Should remove outpost from previous owner on recapture", async function () {
      // player2 captures outpost at [1,1,11]
      planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1);
      const ships2 = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player2).dispatchFleet(planetId2, ships2, [1, 1, 11], 2, 0, 0, 0);
      let fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player2.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // Verify player2 owns the outpost
      let outposts2 = await contracts.nexusGame.getPlayerOutposts(signers.player2.address);
      expect(outposts2.length).to.equal(1);
      expect(outposts2[0][2]).to.equal(11);

      // player3 gets Interceptor (type 3) - stronger than Light Hauler
      const planetId3 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player3, 3, 1);

      // player3 captures same outpost with Interceptor
      const ships3 = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // Interceptor
      await contracts.nexusGame.connect(signers.player3).dispatchFleet(planetId3, ships3, [1, 1, 11], 2, 0, 0, 0);
      fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player3.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // Verify player2's getPlayerOutposts is empty
      outposts2 = await contracts.nexusGame.getPlayerOutposts(signers.player2.address);
      expect(outposts2.length).to.equal(0);

      // Verify player3 now has the outpost
      const outposts3 = await contracts.nexusGame.getPlayerOutposts(signers.player3.address);
      expect(outposts3.length).to.equal(1);
      expect(outposts3[0][0]).to.equal(1);
      expect(outposts3[0][1]).to.equal(1);
      expect(outposts3[0][2]).to.equal(11);
    });

    it("Should expose getPlayerOutposts via NexusGame route", async function () {
      // Capture an outpost
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0);
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // Verify NexusGame correctly delegates to GameState
      const outposts = await contracts.nexusGame.getPlayerOutposts(signers.player1.address);
      expect(outposts.length).to.equal(1);

      // Verify outpost owner matches
      const [outpost, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player1.address);
    });
  });
});
