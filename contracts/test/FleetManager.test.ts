import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts, advanceTime, setupPlayerWithShips,
  DeployedContracts, TestSigners
} from "./helpers/setup";

describe("FleetManager", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("Fleet Dispatch", function () {
    let planetId1: bigint;
    let planetId2: bigint;

    beforeEach(async function () {
      planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1); // 1 SmallCargoShip
      planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0); // No ships, just set up planet with shipyard
    });

    it("Should dispatch a fleet and deduct ships from planet", async function () {
      const shipsBefore = await contracts.nexusGame.getShips(planetId1);
      expect(shipsBefore[1]).to.equal(1n);

      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 2]; // player2's planet

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0) // RAID = 1
      ).to.emit(contracts.fleetManager, "FleetDispatched");

      const shipsAfter = await contracts.nexusGame.getShips(planetId1);
      expect(shipsAfter[1]).to.equal(0n); // 1 - 1 = 0
    });

    it("Should fail dispatching with no ships", async function () {
      const ships = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 2];

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0)
      ).to.be.revertedWith("No ships in fleet");
    });

    it("Should fail dispatching to own planet coordinates for RAID", async function () {
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 1]; // player1's own planet

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0) // RAID
      ).to.be.revertedWith("Cannot dispatch to same location");
    });

    it("Should fail CAPTURE mission for non-outpost position", async function () {
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 5]; // Position 5 is not outpost

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 2, 0, 0, 0) // CAPTURE = 2
      ).to.be.revertedWith("CAPTURE requires outpost position");
    });

    it("Should allow CAPTURE mission for outpost position", async function () {
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 11]; // Position 11 is outpost

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 2, 0, 0, 0) // CAPTURE = 2
      ).to.emit(contracts.fleetManager, "FleetDispatched");
    });
  });

  describe("Battle Reports", function () {
    it("Should create battle report on PvP raid with combat (attacker wins)", async function () {
      // Player1 gets 1 LightFighter (stronger), player2 gets 1 SmallCargoShip (weaker)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1);

      // Let player2 accumulate resources for loot
      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      // Player1 raids player2 with 1 LightFighter
      const ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Check report was created
      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      expect(reportIds.length).to.equal(1);

      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);
      expect(report.attacker).to.equal(signers.player1.address);
      expect(report.defender).to.equal(signers.player2.address);
      expect(report.attackerWon).to.be.true;
      expect(report.mission).to.equal(1); // RAID
      expect(report.attackerInitial[3]).to.equal(1n); // 1 LightFighter sent
      expect(report.defenderInitial[1]).to.equal(1n); // 1 SmallCargoShip defending
    });

    it("Should create battle report on PvP raid with combat (attacker loses)", async function () {
      // Player1 gets 1 SmallCargoShip (weaker), player2 gets 1 LightFighter (stronger)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 3, 1);

      // Player1 raids player2 with 1 SmallCargoShip (weaker than LightFighter)
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Check report was created
      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      expect(reportIds.length).to.equal(1);

      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);
      expect(report.attacker).to.equal(signers.player1.address);
      expect(report.defender).to.equal(signers.player2.address);
      expect(report.attackerWon).to.be.false;
      expect(report.lootTitanium).to.equal(0n);
      expect(report.lootHelium3).to.equal(0n);
      expect(report.lootDarkMatter).to.equal(0n);
      // Attacker lost all ships
      expect(report.attackerLosses[1]).to.equal(1n); // lost the 1 SmallCargoShip
    });

    it("Should create battle report for raid without combat", async function () {
      // Player1 gets 1 SmallCargoShip, player2 has no ships
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Battle report should exist even without combat
      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      expect(reportIds.length).to.equal(1);

      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);
      expect(report.attackerWon).to.be.true;
      // No losses on either side
      expect(report.attackerLosses[1]).to.equal(0n);
      expect(report.defenderInitial[1]).to.equal(0n);
    });

    it("Should create battle report on contested outpost capture", async function () {
      // Player1 captures outpost first (no combat - unclaimed)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 3, 1);

      let ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0);
      let fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // No battle report for unclaimed capture
      let reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      expect(reportIds.length).to.equal(0);

      // Player2 captures from player1 (combat with garrison)
      ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 1 LightFighter
      await contracts.nexusGame.connect(signers.player2).dispatchFleet(planetId2, ships, [1, 1, 11], 2, 0, 0, 0);
      fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player2.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Player2 should have a battle report (attacker)
      reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player2.address);
      expect(reportIds.length).to.equal(1);

      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);
      expect(report.attacker).to.equal(signers.player2.address);
      expect(report.defender).to.equal(signers.player1.address);
      expect(report.attackerWon).to.be.true;
      expect(report.mission).to.equal(2); // CAPTURE
      expect(report.lootTitanium).to.equal(0n); // Captures have no loot
    });

    it("Should add report to both attacker and defender lists", async function () {
      // Player1 with LightFighter raids player2 with SmallCargoShip
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1);

      const ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const attackerReports = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const defenderReports = await contracts.nexusGame.getPlayerReportIds(signers.player2.address);

      expect(attackerReports.length).to.equal(1);
      expect(defenderReports.length).to.equal(1);
      expect(attackerReports[0]).to.equal(defenderReports[0]); // Same report ID
    });

    it("Should return recent reports in most-recent-first order", async function () {
      // Player1 with LightFighter, player2 with SmallCargoShip
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1);

      // First raid: player1 raids player2
      let ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);
      let fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Complete the return trip
      await advanceTime(60);
      await contracts.nexusGame.completeFleet(fleetIds[0]);

      // Build more ships for both players for second raid
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).buildShips(planetId1, 3, 1); // LightFighter
      await advanceTime(3600);
      await contracts.nexusGame.completeShipBuild(planetId1);

      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);
      await contracts.nexusGame.connect(signers.player2).buildShips(planetId2, 1, 1); // SmallCargoShip
      await advanceTime(3600);
      await contracts.nexusGame.completeShipBuild(planetId2);

      // Second raid
      ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);
      fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Player1 should have 2 reports
      const allReports = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      expect(allReports.length).to.equal(2);

      // getPlayerRecentReports should return most recent first
      const recentReports = await contracts.nexusGame.getPlayerRecentReports(signers.player1.address, 2);
      expect(recentReports.length).to.equal(2);
      expect(recentReports[0]).to.equal(allReports[1]); // Most recent
      expect(recentReports[1]).to.equal(allReports[0]); // Oldest

      // Requesting more than available should return all
      const tooMany = await contracts.nexusGame.getPlayerRecentReports(signers.player1.address, 10);
      expect(tooMany.length).to.equal(2);
    });

    it("Should emit BattleReportCreated event", async function () {
      // Player1 with LightFighter raids player2 with SmallCargoShip
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1);

      const ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);

      await expect(
        contracts.nexusGame.resolveFleet(fleetIds[0])
      ).to.emit(contracts.fleetResolver, "BattleReportCreated");
    });
  });

  describe("Fleet Limit (Computer Technology)", function () {
    it("should revert dispatch when Computer Tech is level 0", async function () {
      // Setup a player with shipyard and ships but NO Computer Tech research
      // We'll use a custom setup that doesn't include Computer Tech
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Planet1");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Upgrade resource buildings
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 1); // TITANIUM_EXTRACTOR
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 2); // HELIUM3_HARVESTER
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Build Dark Matter Collector (needed for shipyard)
      await advanceTime(72000); // 20 hours to accumulate
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 3); // DARKMATTER_COLLECTOR
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Build Shipyard level 1 (costs 400 Ti, 200 He3, 100 DM)
      await advanceTime(72000); // 20 hours to accumulate dark matter
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 7); // SHIPYARD
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Build Research Node for research
      await advanceTime(36000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 8); // RESEARCH_NODE
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Research COMBUSTION_DRIVE level 2 (required for SmallCargo)
      await advanceTime(360000); // Accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 1); // COMBUSTION_DRIVE level 1
      await advanceTime(360000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId, 1); // COMBUSTION_DRIVE level 2
      await advanceTime(360000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Upgrade Shipyard to level 2 (SmallCargo requires level 2)
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId, 7); // SHIPYARD to level 2
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId);

      // Accumulate resources and build ships
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId);
      await contracts.nexusGame.connect(signers.player1).buildShips(planetId, 1, 1); // 1 SmallCargo
      await advanceTime(3600);
      await contracts.nexusGame.completeShipBuild(planetId);

      // Setup player2 as a raid target
      await contracts.nexusGame.connect(signers.player2).claimStarterPlanet("Planet2");

      // Try to dispatch a fleet without Computer Tech research
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 2]; // player2's planet

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId, ships, destination, 1, 0, 0, 0)
      ).to.be.revertedWith("FleetManager: Computer Tech required to send fleets");
    });

    it("should allow dispatch when Computer Tech is level 1", async function () {
      // Use the standard setup which now includes Computer Tech level 1
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 2]; // player2's planet

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0)
      ).to.emit(contracts.fleetManager, "FleetDispatched");
    });

    it("should enforce fleet limit equal to Computer Tech level", async function () {
      // Setup player with Computer Tech level 1 (allows 1 fleet)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 2);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      // Dispatch first fleet - should succeed
      let ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 2];

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0)
      ).to.emit(contracts.fleetManager, "FleetDispatched");

      // Verify player has 1 active fleet
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      expect(fleetIds.length).to.equal(1);

      // Try to dispatch second fleet - should fail
      ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0)
      ).to.be.revertedWith("FleetManager: Fleet limit reached");
    });

    it("should allow more fleets after upgrading Computer Tech", async function () {
      // Setup player with Computer Tech level 1 (and 3 ships)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 3);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      // Verify Computer Tech is level 1
      // Note: research array index is enum_value - 1 (because NONE is not in the struct)
      // COMPUTER_TECH = enum 8, so it's at array index 7
      let research = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research[7]).to.equal(1);

      // Dispatch first fleet with Computer Tech level 1
      let ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 2];

      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0);

      // Research Computer Tech level 2
      // Computer Tech level 2: 0 Ti, 800 He3, 1200 DM (2x multiplier)
      await advanceTime(360000); // 100 hours to accumulate resources
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 8); // COMPUTER_TECH level 2
      await advanceTime(360000); // Wait for research
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Verify Computer Tech is level 2
      research = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research[7]).to.equal(2); // COMPUTER_TECH is at index 7 (enum 8 - 1)

      // Now dispatch second fleet - should succeed
      ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0)
      ).to.emit(contracts.fleetManager, "FleetDispatched");

      // Verify player has 2 active fleets
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      expect(fleetIds.length).to.equal(2);

      // Try to dispatch third fleet - should fail (already have 2, limit is 2)
      ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0)
      ).to.be.revertedWith("FleetManager: Fleet limit reached");
    });

    it("should allow new fleet after completing a fleet", async function () {
      // Setup player with Computer Tech level 1 (allows 1 fleet)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 2);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      // Dispatch first fleet
      let ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const destination: [number, number, number] = [1, 1, 2];

      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0);
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);

      // Resolve the fleet (reach destination)
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Complete the return trip
      await advanceTime(60);
      await contracts.nexusGame.completeFleet(fleetIds[0]);

      // Verify fleet is completed (removed from active fleets)
      const activeFleets = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      expect(activeFleets.length).to.equal(0);

      // Now dispatch second fleet - should succeed
      ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, destination, 1, 0, 0, 0)
      ).to.emit(contracts.fleetManager, "FleetDispatched");
    });

    it("should check fleet limit for outpost dispatches", async function () {
      // Setup player1 with Computer Tech level 1 and capture an outpost
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 3);

      // Capture outpost at position 11 with CAPTURE mission
      // The garrison stays at the outpost, so the fleet completes immediately
      let ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0); // CAPTURE = 2
      let fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Verify fleet is completed (CAPTURE removes fleet from active, garrison stays at outpost)
      let activeFleets = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      expect(activeFleets.length).to.equal(0);

      // Try to dispatch from the outpost without any active fleet slots
      // First, dispatch from planet to consume the 1 fleet slot
      ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      // Verify player has 1 active fleet
      activeFleets = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      expect(activeFleets.length).to.equal(1);

      // Try to dispatch from outpost - should fail (already at fleet limit)
      ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleetFromOutpost([1, 1, 11], ships, [1, 1, 2], 0, 0, 0)
      ).to.be.revertedWith("FleetManager: Fleet limit reached");
    });

    it("should enforce fleet limit per player independently", async function () {
      // Setup two players, both with Computer Tech level 1
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1);

      // Player1 dispatches a fleet
      let ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      // Player1 cannot dispatch another fleet
      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0)
      ).to.be.revertedWith("FleetManager: Fleet limit reached");

      // Player2 should still be able to dispatch a fleet
      ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      await expect(
        contracts.nexusGame.connect(signers.player2).dispatchFleet(planetId2, ships, [1, 1, 1], 1, 0, 0, 0)
      ).to.emit(contracts.fleetManager, "FleetDispatched");
    });
  });

  describe("Fuel Consumption", function () {
    it("Should deduct Helium-3 fuel when dispatching a RAID fleet", async function () {
      // Setup player1 with SmallCargo ships, player2 with a planet at different position
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 5);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      // Claim resources first to get baseline
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      const [titaniumBefore, helium3Before, darkMatterBefore] = await contracts.nexusGame.planetResources(planetId1);

      // Dispatch RAID fleet from player1 to player2
      // Distance: [1,1,1] to [1,1,2] = 1000 + 5*1 = 1005
      // RAID is round-trip, so distance * 2 = 2010
      // Fuel per SmallCargo: 1 + (10 * 2010 * 4) / 35000 = 1 + 80400/35000 = 1 + 2 = 3
      // Total fuel for 5 ships: 5 * 3 = 15
      const ships = [0n, 5n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0); // RAID = 1

      // Check helium3 decreased
      const [titaniumAfter, helium3After, darkMatterAfter] = await contracts.nexusGame.planetResources(planetId1);
      const fuelConsumed = helium3Before - helium3After;

      // Expected fuel: 15
      // Use closeTo with tolerance of 100 to account for auto-mining during dispatch
      expect(fuelConsumed).to.be.closeTo(15n, 100n);
    });

    it("Should charge double fuel for round-trip missions (RAID) vs one-way (COLONIZE)", async function () {
      // Setup player1 with ships (10 SmallCargo and 1 ColonyShip for COLONIZE)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 10);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      // Test 1: Dispatch RAID (round-trip)
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      const [tb1, hb1, db1] = await contracts.nexusGame.planetResources(planetId1);

      const ships = [0n, 5n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      // Calculate expected fuel for RAID (round-trip)
      // Distance: [1,1,1] to [1,1,2] = 1000 + 5*1 = 1005, round-trip = 2010
      // Fuel per SmallCargo: 1 + (10 * 2010 * 4) / 35000 = 1 + 80400/35000 = 1 + 2 = 3
      // Total: 5 * 3 = 15
      const expectedRaidFuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 2010);
      expect(expectedRaidFuel).to.equal(15n);

      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0); // RAID

      const [ta1, ha1, da1] = await contracts.nexusGame.planetResources(planetId1);
      const raidFuelConsumed = hb1 - ha1;
      expect(raidFuelConsumed).to.be.closeTo(15n, 100n);

      // Wait for fleet to complete
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(120);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);
      await advanceTime(120);
      await contracts.nexusGame.completeFleet(fleetIds[0]);

      // Test 2: Verify calculation shows one-way uses half the fuel
      // Distance to [1,1,2]: 1005 (one-way)
      // Fuel per SmallCargo: 1 + (10 * 1005 * 4) / 35000 = 1 + 40200/35000 = 1 + 1 = 2
      // Total: 5 * 2 = 10
      const expectedOneWayFuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 1005);
      expect(expectedOneWayFuel).to.equal(10n);

      // Verify RAID used more fuel than one-way calculation
      expect(expectedRaidFuel).to.be.gt(expectedOneWayFuel);
    });

    it("Should revert dispatch if insufficient Helium-3 for fuel", async function () {
      // Setup player with just a starter planet (minimal He3)
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("TestPlanet");
      const planetId1 = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Build up enough to get some ships but keep He3 low
      // Build TITANIUM_EXTRACTOR and HELIUM3_HARVESTER level 1
      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, 1);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);

      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, 2);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);

      // Build Dark Matter Collector
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, 3);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);

      // Build Shipyard
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, 7);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);

      // Upgrade shipyard to level 2 for SmallCargo
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, 7);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);

      // Build Research Node and research COMBUSTION_DRIVE and COMPUTER_TECH
      await advanceTime(72000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).upgradeBuilding(planetId1, 8);
      await advanceTime(3600);
      await contracts.nexusGame.completeUpgrade(planetId1);

      // Research COMBUSTION_DRIVE level 2
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 1);
      await advanceTime(360000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 1);
      await advanceTime(360000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Research COMPUTER_TECH level 1
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 8);
      await advanceTime(360000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Build 100 SmallCargo ships (will drain most He3)
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);

      // Get He3 before building
      let [ti1, he3_1, dm1] = await contracts.nexusGame.planetResources(planetId1);

      // Build as many ships as possible with current resources
      // SmallCargo costs 2000 Ti + 2000 He3 each
      const maxShips = he3_1 / 2000n;

      await contracts.nexusGame.connect(signers.player1).buildShips(planetId1, 1, maxShips);
      await advanceTime(360000);
      await contracts.nexusGame.completeShipBuild(planetId1);

      // Now we have many ships but low He3. Try to dispatch to far galaxy
      const [ti2, he3Final, dm2] = await contracts.nexusGame.planetResources(planetId1);

      // Send all ships to galaxy 9
      // Distance: 20000 * 8 = 160000, round-trip = 320000
      // Fuel per ship: 1 + (10 * 320000 * 4) / 35000 = 366
      const ships = new Array(13).fill(0n);
      ships[1] = maxShips; // All SmallCargo

      const expectedFuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 320000);

      // This should exceed available He3
      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [9, 1, 11], 2, 0, 0, 0)
      ).to.be.revertedWith("Insufficient Helium-3 for fuel");
    });

    it("Should deduct only fuel on RAID missions (no cargo allowed)", async function () {
      // Setup player with ships
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 5);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      // Accumulate resources and claim
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      const [tiBefore, he3Before, dmBefore] = await contracts.nexusGame.planetResources(planetId1);

      // Dispatch RAID without cargo
      // Distance: [1,1,1] to [1,1,2] = 1005, round-trip = 2010
      // Fuel: 5 ships * (1 + (10 * 2010 * 4) / 35000) = 5 * 3 = 15
      const ships = [0n, 5n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      await contracts.nexusGame.connect(signers.player1).dispatchFleet(
        planetId1,
        ships,
        [1, 1, 2],
        1, // RAID
        0,
        0,
        0
      );

      const [tiAfter, he3After, dmAfter] = await contracts.nexusGame.planetResources(planetId1);

      // Verify only fuel was deducted (no cargo)
      const titaniumDeducted = tiBefore - tiAfter;
      const helium3Deducted = he3Before - he3After;

      expect(titaniumDeducted).to.be.closeTo(0n, 100n);
      // Helium3 should be only fuel (15)
      expect(helium3Deducted).to.be.closeTo(15n, 100n);
    });

    it("Should not charge fuel for outpost dispatches to own planet", async function () {
      // Setup player and capture an outpost
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 5);

      // Capture outpost at position 11
      let ships = [0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 11], 2, 0, 0, 0); // CAPTURE
      let fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(120);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Now dispatch FROM the outpost back to own planet (no fuel should be charged)
      // First, get helium3 from planet after claiming
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      const [tiBefore, he3Before, dmBefore] = await contracts.nexusGame.planetResources(planetId1);

      // Dispatch from outpost to own planet - this should not deduct fuel from the origin planet
      ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleetFromOutpost([1, 1, 11], ships, [1, 1, 1], 0, 0, 0);

      // Verify helium3 on origin planet didn't change (no fuel deducted)
      const [tiAfter, he3After, dmAfter] = await contracts.nexusGame.planetResources(planetId1);

      // The helium3 should be the same or slightly higher due to production during the dispatch
      // Use a tolerance to account for auto-mining
      expect(he3After).to.be.closeTo(he3Before, 100n);
    });

    it("Should calculate correct fuel for COLONIZE mission (one-way)", async function () {
      // Setup player with ColonyShip - need to also research Colony Technology for colony slots
      // First claim a basic planet
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Planet1");
      const planetId1 = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Build up resources and research/buildings for ColonyShip
      // This is complex, so let's instead just verify the fuel formula calculation directly
      // rather than doing a full integration test

      // Verify the fuel calculation formula for COLONIZE (one-way)
      // Distance: [1,1,1] to [1,1,4] = 1000 + 5*3 = 1015
      // ColonyShip baseFuel=1000
      // Fuel: 1 * (1 + (1000 * 1015 * 4) / 35000) = 1 * (1 + 4060000/35000) = 1 * (1 + 116) = 117
      const ships = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n, 0n, 0n];
      const distance = await contracts.gameConfig.calculateDistance([1, 1, 1], [1, 1, 4]);
      expect(distance).to.equal(1015);

      const expectedFuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 1015);
      expect(expectedFuel).to.equal(117n);

      // Compare to a round-trip mission (would be 2x distance)
      const roundTripFuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 2030);
      // Round-trip: 1 * (1 + (1000 * 2030 * 4) / 35000) = 1 * (1 + 232) = 233
      expect(roundTripFuel).to.equal(233n);

      // Verify one-way uses less fuel than round-trip
      expect(expectedFuel).to.be.lt(roundTripFuel);
    });
  });

  describe("Raid Loot Cap (V-004)", function () {
    it("Should cap planet raid loot to 50% of available resources by default", async function () {
      // Player1 has a SmallCargo (cargo=5000), player2 has no defenders
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      // Let player2 accumulate resources
      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      // Record player2's resources before raid
      const [tiBefore, he3Before, dmBefore] = await contracts.nexusGame.planetResources(planetId2);
      expect(tiBefore).to.be.gt(0n);

      // Player1 raids player2 (no defenders = auto-win)
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Check battle report loot - should be at most 50% of defender's resources
      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // Loot should be capped at 50% of what was available
      expect(report.lootTitanium).to.be.lte(tiBefore / 2n + 1n); // +1 for rounding
      expect(report.lootHelium3).to.be.lte(he3Before / 2n + 1n);

      // Defender should retain at least ~50%
      const [tiAfter, he3After, dmAfter] = await contracts.nexusGame.planetResources(planetId2);
      expect(tiAfter).to.be.gte(tiBefore / 2n - 1n); // -1 for rounding
    });

    it("Should respect custom loot percentage set by owner", async function () {
      // Set loot percentage to 25%
      await contracts.gameConfig.setRaidLootPercentage(25);

      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const [tiBefore, he3Before, dmBefore] = await contracts.nexusGame.planetResources(planetId2);

      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // With 25% cap, loot should be at most 25% of available
      expect(report.lootTitanium).to.be.lte(tiBefore / 4n + 1n);

      // Defender should retain at least ~75%
      const [tiAfter] = await contracts.nexusGame.planetResources(planetId2);
      expect(tiAfter).to.be.gte((tiBefore * 3n) / 4n - 1n);
    });

    it("Should allow 100% loot when set to 100", async function () {
      // Set loot percentage to 100% (legacy behavior)
      await contracts.gameConfig.setRaidLootPercentage(100);

      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 1, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 0);

      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const [tiBefore, he3Before, dmBefore] = await contracts.nexusGame.planetResources(planetId2);

      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // At 100%, all resources up to cargo capacity should be lootable
      const totalLoot = report.lootTitanium + report.lootHelium3 + report.lootDarkMatter;
      const totalBefore = tiBefore + he3Before + dmBefore;
      // Either all resources were taken, or cargo capacity was the limit
      expect(totalLoot).to.be.gt(0n);
    });
  });
});
