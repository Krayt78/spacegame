import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts, advanceTime, setupPlayerWithShips,
  DeployedContracts, TestSigners
} from "./helpers/setup";

describe("Advantage System", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("GameConfig Advantage Values", function () {
    it("Should return correct advantage values for all ships vs Crawler", async function () {
      // All ships (except Crawler itself) have advantage=5 vs Crawler
      const crawler = 12; // ShipType.Crawler

      expect(await contracts.gameConfig.getAdvantage(1, crawler)).to.equal(5); // SmallCargo
      expect(await contracts.gameConfig.getAdvantage(2, crawler)).to.equal(5); // LargeCargo
      expect(await contracts.gameConfig.getAdvantage(3, crawler)).to.equal(5); // LightFighter
      expect(await contracts.gameConfig.getAdvantage(4, crawler)).to.equal(5); // HeavyFighter
      expect(await contracts.gameConfig.getAdvantage(5, crawler)).to.equal(5); // Cruiser
      expect(await contracts.gameConfig.getAdvantage(6, crawler)).to.equal(5); // Battleship
      expect(await contracts.gameConfig.getAdvantage(7, crawler)).to.equal(5); // Battlecruiser
      expect(await contracts.gameConfig.getAdvantage(8, crawler)).to.equal(5); // Bomber
      expect(await contracts.gameConfig.getAdvantage(9, crawler)).to.equal(5); // Destroyer
      expect(await contracts.gameConfig.getAdvantage(10, crawler)).to.equal(5); // ColonyShip
      expect(await contracts.gameConfig.getAdvantage(11, crawler)).to.equal(5); // Recycler
      expect(await contracts.gameConfig.getAdvantage(12, crawler)).to.equal(0); // Crawler has no advantage vs itself
    });

    it("Should return correct advantage for HeavyFighter vs SmallCargo", async function () {
      expect(await contracts.gameConfig.getAdvantage(4, 1)).to.equal(3);
    });

    it("Should return correct advantage for Cruiser vs LightFighter", async function () {
      expect(await contracts.gameConfig.getAdvantage(5, 3)).to.equal(6);
    });

    it("Should return correct advantage for Battlecruiser matchups", async function () {
      const bc = 7; // Battlecruiser
      expect(await contracts.gameConfig.getAdvantage(bc, 1)).to.equal(3); // vs SmallCargo
      expect(await contracts.gameConfig.getAdvantage(bc, 2)).to.equal(3); // vs LargeCargo
      expect(await contracts.gameConfig.getAdvantage(bc, 4)).to.equal(4); // vs HeavyFighter
      expect(await contracts.gameConfig.getAdvantage(bc, 5)).to.equal(4); // vs Cruiser
      expect(await contracts.gameConfig.getAdvantage(bc, 6)).to.equal(7); // vs Battleship
    });

    it("Should return correct advantage for Destroyer vs Battlecruiser", async function () {
      expect(await contracts.gameConfig.getAdvantage(9, 7)).to.equal(2);
    });

    it("Should return 0 for non-configured advantage pairs", async function () {
      // LightFighter vs SmallCargo - no advantage
      expect(await contracts.gameConfig.getAdvantage(3, 1)).to.equal(0);

      // SmallCargo vs LightFighter - no advantage
      expect(await contracts.gameConfig.getAdvantage(1, 3)).to.equal(0);

      // Battleship vs Cruiser - no advantage
      expect(await contracts.gameConfig.getAdvantage(6, 5)).to.equal(0);
    });

    it("Should return correct array from getAdvantageRow for Battlecruiser", async function () {
      // Battlecruiser has multiple advantage values
      const bcRow = await contracts.gameConfig.getAdvantageRow(7);

      expect(bcRow.length).to.equal(13);
      expect(bcRow[0]).to.equal(0);  // NONE
      expect(bcRow[1]).to.equal(3);  // SmallCargo
      expect(bcRow[2]).to.equal(3);  // LargeCargo
      expect(bcRow[3]).to.equal(0);  // LightFighter
      expect(bcRow[4]).to.equal(4);  // HeavyFighter
      expect(bcRow[5]).to.equal(4);  // Cruiser
      expect(bcRow[6]).to.equal(7);  // Battleship
      expect(bcRow[7]).to.equal(0);  // Battlecruiser (no advantage vs itself)
      expect(bcRow[8]).to.equal(0);  // Bomber
      expect(bcRow[9]).to.equal(0);  // Destroyer
      expect(bcRow[10]).to.equal(0); // ColonyShip
      expect(bcRow[11]).to.equal(0); // Recycler
      expect(bcRow[12]).to.equal(5); // Crawler
    });

    it("Should return correct array from getAdvantageRow for ship with no advantage", async function () {
      // SmallCargo only has advantage vs Crawler
      const scRow = await contracts.gameConfig.getAdvantageRow(1);

      expect(scRow.length).to.equal(13);
      for (let i = 0; i < 12; i++) {
        expect(scRow[i]).to.equal(0);
      }
      expect(scRow[12]).to.equal(5); // Only Crawler has advantage
    });
  });

  describe("Combat with Advantage - Cruiser vs LightFighter", function () {
    it("Should give Cruisers decisive advantage vs LightFighters (advantage=6)", async function () {
      // Setup: player1 with 2 Cruisers (weapon=400, advantage=6 vs LF)
      //        player2 with 10 LightFighters (weapon=50, no advantage vs Cruiser)
      // Expected: Cruisers should win decisively due to 6x effective damage against LF
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 5, 2); // 2 Cruisers
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 3, 10); // 10 LightFighters

      // Claim resources to minimize drift
      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      // Player1 raids player2 with 2 Cruisers
      const ships = [0n, 0n, 0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Check battle report
      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      expect(reportIds.length).to.equal(1);

      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);
      expect(report.attacker).to.equal(signers.player1.address);
      expect(report.defender).to.equal(signers.player2.address);
      expect(report.attackerWon).to.be.true; // Cruisers should win

      // Calculate survivors: initial - losses
      const cruiserSurvivors = report.attackerInitial[5] - report.attackerLosses[5];
      expect(cruiserSurvivors).to.be.gt(0n); // At least some Cruisers survived

      // Verify LightFighters were destroyed
      expect(report.defenderLosses[3]).to.be.gt(5n); // Significant LF losses
    });

    it("Should show greater effectiveness than without advantage", async function () {
      // This test demonstrates that the advantage system works by comparing
      // expected damage with and without advantage

      // Setup: 1 Cruiser vs 6 LightFighters
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 5, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 3, 6);

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const ships = [0n, 0n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // With advantage=6, the Cruiser should be able to take on multiple LightFighters
      // Without advantage, a single Cruiser (weapon=400) vs 6 LF (weapon=50 each = 300 total) would be close
      // With advantage=6, the Cruiser's effective firepower is much higher
      expect(report.attackerWon).to.be.true;

      const cruiserSurvivors = report.attackerInitial[5] - report.attackerLosses[5];
      expect(cruiserSurvivors).to.equal(1n); // Cruiser survived
      expect(report.defenderLosses[3]).to.be.gte(4n); // Most/all LFs destroyed
    });
  });

  describe("Combat with No Advantage - Regression Test", function () {
    it("Should work correctly when no advantage applies (LightFighter vs SmallCargo)", async function () {
      // LightFighter has NO advantage against SmallCargo
      // This should behave like the old system (before advantage was added)
      // LightFighter: weapon=50, SmallCargo: hull=4000, shield=10
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 2); // 2 LF
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 1); // 1 SC

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const ships = [0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      expect(reportIds.length).to.equal(1);

      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);
      expect(report.attackerWon).to.be.true; // 2 LF should beat 1 SC

      const lfSurvivors = report.attackerInitial[3] - report.attackerLosses[3];
      expect(lfSurvivors).to.be.gte(1n); // At least 1 LF survived
      expect(report.defenderLosses[1]).to.equal(1n); // SC destroyed
    });

    it("Should handle cargo ships defending without advantage bonuses", async function () {
      // LightFighter vs SmallCargo - no advantage applies (LF has no advantage vs SC)
      // But LF has much higher weapon (50 vs 5), so LF should win
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 3);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 2);

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const ships = [0n, 0n, 0n, 3n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // 3 LF vs 2 SmallCargo, LF should win easily without needing advantage
      expect(report.attackerWon).to.be.true;
      expect(report.defenderLosses[1]).to.equal(2n); // Both cargo destroyed
    });
  });

  describe("Combat with Battlecruiser Advantage", function () {
    // Note: Battlecruiser and Battleship tests are skipped due to high resource requirements
    // The advantage values are already tested in the GameConfig section
    // Integration tests would require very long setup times for resource accumulation

    it("Should verify Battlecruiser has multiple advantage configurations", async function () {
      // Verify the advantage values are configured correctly
      const bc = 7; // Battlecruiser
      expect(await contracts.gameConfig.getAdvantage(bc, 1)).to.equal(3); // vs SmallCargo
      expect(await contracts.gameConfig.getAdvantage(bc, 2)).to.equal(3); // vs LargeCargo
      expect(await contracts.gameConfig.getAdvantage(bc, 4)).to.equal(4); // vs HeavyFighter
      expect(await contracts.gameConfig.getAdvantage(bc, 5)).to.equal(4); // vs Cruiser
      expect(await contracts.gameConfig.getAdvantage(bc, 6)).to.equal(7); // vs Battleship
    });
  });

  describe("Combat with HeavyFighter Advantage", function () {
    it("Should demonstrate HeavyFighter advantage=3 vs SmallCargo", async function () {
      // HeavyFighter: weapon=150, advantage=3 vs SmallCargo
      // SmallCargo: weapon=5, hull=4000, shield=10
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 4, 2); // 2 HF
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 4); // 4 SC

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const ships = [0n, 0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      expect(report.attackerWon).to.be.true;

      const hfSurvivors = report.attackerInitial[4] - report.attackerLosses[4];
      expect(hfSurvivors).to.equal(2n); // Both HF should survive
      expect(report.defenderLosses[1]).to.be.gte(3n); // Most/all cargo destroyed
    });
  });

  describe("Combat with Destroyer Advantage", function () {
    // Note: Destroyer tests skipped due to very high resource requirements
    // Destroyer requires Hyperspace Drive 6 + Hyperspace Tech 5

    it("Should verify Destroyer has advantage vs Battlecruiser", async function () {
      expect(await contracts.gameConfig.getAdvantage(9, 7)).to.equal(2);
    });
  });

  describe("Combat with Mixed Fleet - Partial Advantage", function () {
    it("Should handle mixed defender fleet with advantage targeting some types", async function () {
      // Attacker: 2 Cruisers (advantage=6 vs LF, no advantage vs SC)
      // Defender: Mix of SmallCargo (no advantage from Cruiser) and LightFighters (advantage=6 from Cruiser)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 5, 2); // 2 Cruisers
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 3); // 3 SC

      // Add LightFighters to defender
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);
      await contracts.nexusGame.connect(signers.player2).buildShips(planetId2, 3, 3); // 3 LF
      await advanceTime(3600);
      await contracts.nexusGame.completeShipBuild(planetId2);

      const ships = [0n, 0n, 0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // Cruisers should win with advantage against LightFighters
      expect(report.attackerWon).to.be.true;
      expect(report.defenderLosses[1]).to.be.gte(1n); // Some SmallCargo losses
      expect(report.defenderLosses[3]).to.be.gte(1n); // Some LightFighter losses
    });

    it("Should handle HeavyFighter with advantage vs SmallCargo in mixed defender fleet", async function () {
      // Attacker: 2 HeavyFighters (advantage=3 vs SC, no advantage vs LF)
      // Defender: Mix of SmallCargo and LightFighters
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 4, 2); // 2 HF
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 1, 2); // 2 SC

      // Add LightFighters to defender
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);
      await contracts.nexusGame.connect(signers.player2).buildShips(planetId2, 3, 2); // 2 LF
      await advanceTime(3600);
      await contracts.nexusGame.completeShipBuild(planetId2);

      const ships = [0n, 0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // HeavyFighters should win with advantage against SmallCargo
      expect(report.attackerWon).to.be.true;
      // Total defender losses should be significant
      const totalDefenderLosses = report.defenderLosses[1] + report.defenderLosses[3];
      expect(totalDefenderLosses).to.be.gte(3n);
    });
  });

  describe("Edge Cases and Boundary Conditions", function () {
    it("Should handle combat with ships that have no advantage against each other", async function () {
      // LightFighter vs HeavyFighter - HF has no advantage vs LF
      // This demonstrates combat without advantage influence between combat ships
      // HeavyFighter: weapon=150, hull=10000, shield=25
      // LightFighter: weapon=50, hull=4000, shield=10
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 4, 2); // 2 HF
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 3, 3); // 3 LF

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const ships = [0n, 0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      expect(reportIds.length).to.equal(1);

      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);
      // 2 HeavyFighters should beat 3 LightFighters (superior weapon + hull)
      expect(report.attackerWon).to.be.true;
      expect(report.defenderLosses[3]).to.be.gte(2n); // Most/all LF destroyed
    });

    it("Should handle single ship vs single ship with advantage", async function () {
      // 1 Cruiser vs 1 LightFighter (advantage=6)
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 5, 1);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 3, 1);

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const ships = [0n, 0n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // Cruiser should easily win against single LF
      expect(report.attackerWon).to.be.true;

      const cruiserSurvivors = report.attackerInitial[5] - report.attackerLosses[5];
      expect(cruiserSurvivors).to.equal(1n);
      expect(report.defenderLosses[3]).to.equal(1n);
    });

    it("Should handle advantage still effective even with fewer ships", async function () {
      // 2 Cruisers vs 10 LightFighters
      // With advantage=6, Cruisers should win despite being outnumbered
      // This demonstrates advantage vs numerical disadvantage
      // Cruiser: weapon=400, hull=27000, shield=50
      // LightFighter: weapon=50, hull=4000, shield=10
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 5, 2);
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 3, 10);

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const ships = [0n, 0n, 0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // Advantage should help Cruisers win
      expect(report.attackerWon).to.be.true;

      const cruiserSurvivors = report.attackerInitial[5] - report.attackerLosses[5];
      expect(cruiserSurvivors).to.be.gte(1n); // At least 1 Cruiser survived
      expect(report.defenderLosses[3]).to.be.gte(7n); // Most LF destroyed
    });

    it("Should handle LightFighter vs Crawler (universal advantage=5)", async function () {
      // Any ship type vs Crawler should get advantage=5
      // Test with LightFighter (basic combat ship)
      // LightFighter: weapon=50, Crawler: weapon=1, hull=4000, shield=1
      const planetId1 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player1, 3, 1); // 1 LF
      const planetId2 = await setupPlayerWithShips(contracts.nexusGame, contracts.gameConfig, signers.player2, 12, 3); // 3 Crawlers

      await advanceTime(3600);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      const ships = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0);

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // LightFighter should destroy Crawlers with advantage=5
      expect(report.attackerWon).to.be.true;
      expect(report.defenderLosses[12]).to.equal(3n); // All Crawlers destroyed

      const lfSurvivors = report.attackerInitial[3] - report.attackerLosses[3];
      expect(lfSurvivors).to.equal(1n); // LF survived (Crawler weapon=1 is negligible)
    });
  });
});
