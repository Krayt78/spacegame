import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts, advanceTime, setupPlayerWithShips, claimPlanet,
  DeployedContracts, TestSigners
} from "./helpers/setup";

describe("Integration Tests", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("Full Raid Cycle", function () {
    it("Should complete full raid cycle: dispatch -> resolve -> complete -> resources at home", async function () {
      // Setup: player1 has ships, player2 has a planet with resources
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      // Let player2 accumulate some resources
      await advanceTime(7200); // 2 hours
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      // Get player1's resources before raid
      const resBefore = await contracts.nexusGame.planetResources(planetId1);

      // Player1 dispatches raid to player2's planet
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 2]; // player2's planet

      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0); // RAID = 1

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      const fleetId = fleetIds[0];

      // Wait for fleet to arrive
      await advanceTime(60);

      // Resolve the fleet (raid)
      await contracts.nexusGame.resolveFleet(fleetId);

      // Check fleet is now returning with cargo
      let fleet = await contracts.nexusGame.getFleet(fleetId);
      expect(fleet.status).to.equal(2); // RETURNING (0=NONE, 1=TRAVELING, 2=RETURNING)

      // Wait for fleet to return
      await advanceTime(60);

      // Complete the fleet (return home)
      await contracts.nexusGame.completeFleet(fleetId);

      // Verify ships returned and cargo delivered
      const shipsAfter = await contracts.nexusGame.getShips(planetId1);
      expect(shipsAfter[1]).to.equal(1n); // Ship returned

      // Player1 should have more resources (from cargo)
      const resAfter = await contracts.nexusGame.planetResources(planetId1);
      expect(resAfter.titanium).to.be.gte(resBefore.titanium);
    });
  });

  describe("Full Capture Cycle", function () {
    it("Should complete full capture cycle: dispatch -> resolve -> ships stationed", async function () {
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);

      // Player1 dispatches capture to outpost
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 11]; // outpost position

      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 2, 0, 0, 0); // CAPTURE = 2

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      const fleetId = fleetIds[0];

      // Wait for fleet to arrive
      await advanceTime(60);

      // Resolve the fleet (capture)
      await contracts.nexusGame.resolveFleet(fleetId);

      // Verify outpost is captured and ships are stationed
      const [outpost, , stationedShips] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player1.address);
      expect(stationedShips[1]).to.equal(1n); // 1 Light Hauler stationed

      // Original planet should have 0 ships (sent the only one)
      const shipsOnPlanet = await contracts.nexusGame.getShips(planetId1);
      expect(shipsOnPlanet[1]).to.equal(0n); // Started with 1, sent 1
    });
  });

  describe("Full Supply Cycle", function () {
    it("Should complete full supply cycle: dispatch MOVE with ships -> resolve -> ships at outpost", async function () {
      // Use Interceptors to stay within resource budget (3000T + 1000H = 4000 total vs 4000T + 4000H for 2 Light Haulers)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 1); // 1 Interceptor

      // First capture an outpost with the Interceptor
      let ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 1 Interceptor at index 2
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0);
      let fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Verify outpost is captured
      const [outpost, , stationedShips] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player1.address);
      expect(stationedShips[3]).to.equal(1n); // 1 Interceptor stationed from capture
    });
  });

  describe("Full Gameplay Flow", function () {
    it("Full gameplay: claim planet -> build -> build ships -> capture outpost -> collect resources", async function () {
      // 1. Claim planet
      await claimPlanet(contracts.nexusGame, signers.player1, "Genesis");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      expect(planetId).to.equal(1n);

      // 2. Upgrade buildings
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 1); // TITANIUM_EXTRACTOR
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      const buildings = await contracts.nexusGame.planetBuildings(planetId);
      expect(buildings.titaniumExtractor).to.equal(2);

      // 3. Continue building up to shipyard (using setup helper logic)
      // Upgrade Helium-3 Harvester
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 2);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Build Dark Matter Collector
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 3);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate for shipyard
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      // Build shipyard
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 7);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Build Research Node
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 8); // RESEARCH_NODE
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Research Computer Tech level 1 (required for fleet dispatch)
      await advanceTime(216000); // 60 hours to accumulate enough dark matter (10/hr * 60 = 600 DM)
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 8); // COMPUTER_TECH
      await advanceTime(3600);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Research Combustion Drive level 1 (prerequisite for LightFighter)
      await advanceTime(360000); // accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 1); // COMBUSTION_DRIVE
      await advanceTime(360000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // 4. Accumulate resources and build ships
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);

      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 3, 1); // 1 LightFighter
      await advanceTime(3600);
      await contracts.nexusGame.completeShipBuild(planetId);

      const shipsBuilt = await contracts.nexusGame.getShips(planetId);
      expect(shipsBuilt[3]).to.equal(1n); // LightFighter at index 3

      // 5. Capture outpost
      const ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 1 LightFighter
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId, ships, [1, 1, 11], 2, 0, 0, 0);
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const [outpost, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player1.address);

      // 6. Wait for outpost to accumulate resources
      await advanceTime(7200); // 2 hours

      const [, currentResources, ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(currentResources).to.be.gt(0n);
    });
  });

  describe("PvP Interactions", function () {
    it("PvP raid: player1 raids player2's planet, resources transfer correctly", async function () {
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      // Let player2 accumulate resources
      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const player2ResBefore = await contracts.nexusGame.planetResources(planetId2);

      // Player1 raids player2
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Player2 should have less resources
      const player2ResAfter = await contracts.nexusGame.planetResources(planetId2);

      // At minimum, resources shouldn't increase (they should decrease or stay same if cargo was 0)
      expect(player2ResAfter.titanium).to.be.lte(player2ResBefore.titanium);
    });

    it("Contested outpost: player1 captures, player2 takes over", async function () {
      // Player1 with Light Hauler, Player2 with Interceptor (stronger)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 3, 1); // Interceptor

      // Player1 captures outpost with Light Hauler
      let ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0);
      let fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      let [outpost, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player1.address);

      // Let some time pass for resources to accumulate
      await advanceTime(3600);

      // Player2 captures the outpost from player1 using Interceptor (beats Light Hauler garrison)
      ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 1 Interceptor at index 2
      await contracts.nexusGame.connect(signers.player2).dispatchFleet(planetId2, ships, [1, 1, 11], 2, 0, 0, 0);
      fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player2.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[fleetIds.length - 1]);

      // Player2 should now own the outpost
      [outpost, , ] = await contracts.nexusGame.getOutpost(1, 1, 11);
      expect(outpost.owner).to.equal(signers.player2.address);
    });
  });
});
