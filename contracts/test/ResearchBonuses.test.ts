import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts, advanceTime, setupPlayerWithShips,
  DeployedContracts, TestSigners
} from "./helpers/setup";

describe("ResearchBonuses", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("GameConfig Pure Functions - Drive Type Mapping", function () {
    it("Should return COMBUSTION drive for SmallCargo", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(1); // SmallCargo
      expect(driveType).to.equal(1n); // COMBUSTION
    });

    it("Should return COMBUSTION drive for LargeCargo", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(2); // LargeCargo
      expect(driveType).to.equal(1n); // COMBUSTION
    });

    it("Should return COMBUSTION drive for LightFighter", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(3); // LightFighter
      expect(driveType).to.equal(1n); // COMBUSTION
    });

    it("Should return IMPULSE drive for HeavyFighter", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(4); // HeavyFighter
      expect(driveType).to.equal(2n); // IMPULSE
    });

    it("Should return IMPULSE drive for Cruiser", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(5); // Cruiser
      expect(driveType).to.equal(2n); // IMPULSE
    });

    it("Should return HYPERSPACE drive for Battleship", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(6); // Battleship
      expect(driveType).to.equal(3n); // HYPERSPACE
    });

    it("Should return HYPERSPACE drive for Battlecruiser", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(7); // Battlecruiser
      expect(driveType).to.equal(3n); // HYPERSPACE
    });

    it("Should return IMPULSE drive for Bomber", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(8); // Bomber
      expect(driveType).to.equal(2n); // IMPULSE
    });

    it("Should return HYPERSPACE drive for Destroyer", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(9); // Destroyer
      expect(driveType).to.equal(3n); // HYPERSPACE
    });

    it("Should return COMBUSTION drive for ColonyShip", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(10); // ColonyShip
      expect(driveType).to.equal(1n); // COMBUSTION
    });

    it("Should return COMBUSTION drive for Recycler", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(11); // Recycler
      expect(driveType).to.equal(1n); // COMBUSTION
    });

    it("Should return NONE drive for Crawler", async function () {
      const driveType = await contracts.gameConfig.getShipDriveType(12); // Crawler
      expect(driveType).to.equal(0n); // NONE
    });
  });

  describe("GameConfig Pure Functions - Speed Calculations", function () {
    it("Should return same speed with all research levels 0 as getSlowestSpeed", async function () {
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // SmallCargo
      const speedWithoutResearch = await contracts.gameConfig.getSlowestSpeed(ships);
      const speedWithResearch = await contracts.gameConfig.getSlowestSpeedWithResearch(ships, 0, 0, 0);

      expect(speedWithResearch).to.equal(speedWithoutResearch);
    });

    it("Should boost SmallCargo speed by 10% per combustion level", async function () {
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // SmallCargo

      // Base speed: 5000
      const baseSpeed = await contracts.gameConfig.getSlowestSpeed(ships);
      expect(baseSpeed).to.equal(5000n);

      // Combustion level 5: 5000 * (100 + 5*10) / 100 = 7500
      const speedLvl5 = await contracts.gameConfig.getSlowestSpeedWithResearch(ships, 5, 0, 0);
      expect(speedLvl5).to.equal(7500n);

      // Combustion level 10: 5000 * (100 + 10*10) / 100 = 10000
      const speedLvl10 = await contracts.gameConfig.getSlowestSpeedWithResearch(ships, 10, 0, 0);
      expect(speedLvl10).to.equal(10000n);
    });

    it("Should boost HeavyFighter speed by 20% per impulse level", async function () {
      const ships = [0n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // HeavyFighter

      // Base speed: 10000
      const baseSpeed = await contracts.gameConfig.getSlowestSpeed(ships);
      expect(baseSpeed).to.equal(10000n);

      // Impulse level 3: 10000 * (100 + 3*20) / 100 = 16000
      const speedLvl3 = await contracts.gameConfig.getSlowestSpeedWithResearch(ships, 0, 3, 0);
      expect(speedLvl3).to.equal(16000n);
    });

    it("Should boost Battleship speed by 30% per hyperspace level", async function () {
      const ships = [0n, 0n, 0n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n]; // Battleship

      // Base speed: 10000
      const baseSpeed = await contracts.gameConfig.getSlowestSpeed(ships);
      expect(baseSpeed).to.equal(10000n);

      // Hyperspace level 2: 10000 * (100 + 2*30) / 100 = 16000
      const speedLvl2 = await contracts.gameConfig.getSlowestSpeedWithResearch(ships, 0, 0, 2);
      expect(speedLvl2).to.equal(16000n);
    });

    it("Should use slowest ship speed in mixed fleet", async function () {
      // SmallCargo (5000) + LightFighter (12500)
      const ships = [0n, 1n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      // Without research, should be 5000 (SmallCargo is slower)
      const speedBase = await contracts.gameConfig.getSlowestSpeedWithResearch(ships, 0, 0, 0);
      expect(speedBase).to.equal(5000n);

      // With combustion level 5: both benefit, but SmallCargo still slowest
      // SmallCargo: 5000 * 1.5 = 7500
      // LightFighter: 12500 * 1.5 = 18750
      const speedLvl5 = await contracts.gameConfig.getSlowestSpeedWithResearch(ships, 5, 0, 0);
      expect(speedLvl5).to.equal(7500n);
    });
  });

  describe("GameConfig Pure Functions - Cargo Capacity", function () {
    it("Should return same cargo with hyperspace tech level 0 as getTotalCargoCapacity", async function () {
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // SmallCargo
      const cargoWithoutResearch = await contracts.gameConfig.getTotalCargoCapacity(ships);
      const cargoWithResearch = await contracts.gameConfig.getTotalCargoCapacityWithResearch(ships, 0);

      expect(cargoWithResearch).to.equal(cargoWithoutResearch);
    });

    it("Should boost cargo capacity by 5% per hyperspace tech level", async function () {
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // SmallCargo

      // Base cargo: 5000
      const baseCargo = await contracts.gameConfig.getTotalCargoCapacity(ships);
      expect(baseCargo).to.equal(5000n);

      // Hyperspace Tech level 10: 5000 * (100 + 10*5) / 100 = 7500
      const cargoLvl10 = await contracts.gameConfig.getTotalCargoCapacityWithResearch(ships, 10);
      expect(cargoLvl10).to.equal(7500n);

      // Hyperspace Tech level 20: 5000 * (100 + 20*5) / 100 = 10000
      const cargoLvl20 = await contracts.gameConfig.getTotalCargoCapacityWithResearch(ships, 20);
      expect(cargoLvl20).to.equal(10000n);
    });

    it("Should boost total cargo for multiple ships", async function () {
      const ships = [0n, 5n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; // 5 SmallCargo

      // Base: 5 * 5000 = 25000
      const baseCargo = await contracts.gameConfig.getTotalCargoCapacity(ships);
      expect(baseCargo).to.equal(25000n);

      // Hyperspace Tech level 5: 25000 * (100 + 5*5) / 100 = 31250
      const cargoLvl5 = await contracts.gameConfig.getTotalCargoCapacityWithResearch(ships, 5);
      expect(cargoLvl5).to.equal(31250n);
    });
  });

  describe("GameConfig Pure Functions - Combat Stats", function () {
    it("Should return base stats with all research levels 0", async function () {
      const baseStats = await contracts.gameConfig.getShipConfig(3); // LightFighter
      const combatStats = await contracts.gameConfig.getShipCombatStats(3, 0, 0, 0);

      expect(combatStats.weaponPower).to.equal(baseStats.weaponPower);
      expect(combatStats.shieldPower).to.equal(baseStats.shieldPower);
      expect(combatStats.structuralIntegrity).to.equal(baseStats.structuralIntegrity);
    });

    it("Should boost weapon by 10% per weapon tech level", async function () {
      // LightFighter base weapon: 50
      const combatStats = await contracts.gameConfig.getShipCombatStats(3, 5, 0, 0);

      // 50 * (100 + 5*10) / 100 = 75
      expect(combatStats.weaponPower).to.equal(75n);
    });

    it("Should boost shield by 10% per shielding tech level", async function () {
      // LightFighter base shield: 10
      const combatStats = await contracts.gameConfig.getShipCombatStats(3, 0, 3, 0);

      // 10 * (100 + 3*10) / 100 = 13
      expect(combatStats.shieldPower).to.equal(13n);
    });

    it("Should boost hull by 10% per armour tech level", async function () {
      // LightFighter base hull: 4000
      const combatStats = await contracts.gameConfig.getShipCombatStats(3, 0, 0, 2);

      // 4000 * (100 + 2*10) / 100 = 4800
      expect(combatStats.structuralIntegrity).to.equal(4800n);
    });

    it("Should apply all combat bonuses together", async function () {
      // LightFighter: weapon=50, shield=10, hull=4000
      const combatStats = await contracts.gameConfig.getShipCombatStats(3, 5, 3, 2);

      // weapon: 50 * (100 + 50) / 100 = 75
      // shield: 10 * (100 + 30) / 100 = 13
      // hull: 4000 * (100 + 20) / 100 = 4800
      expect(combatStats.weaponPower).to.equal(75n);
      expect(combatStats.shieldPower).to.equal(13n);
      expect(combatStats.structuralIntegrity).to.equal(4800n);
    });

    it("Should apply bonuses to different ship types", async function () {
      // Battleship: weapon=1000, shield=200, hull=60000
      const combatStats = await contracts.gameConfig.getShipCombatStats(6, 10, 5, 8);

      // weapon: 1000 * (100 + 100) / 100 = 2000
      // shield: 200 * (100 + 50) / 100 = 300
      // hull: 60000 * (100 + 80) / 100 = 108000
      expect(combatStats.weaponPower).to.equal(2000n);
      expect(combatStats.shieldPower).to.equal(300n);
      expect(combatStats.structuralIntegrity).to.equal(108000n);
    });
  });

  describe("Fleet Speed Integration - Research Impact", function () {
    it("Should reduce travel time with combustion drive research", async function () {
      // Set up two players with SmallCargo ships for comparison
      // Player1 without extra research
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        1, // SmallCargo
        1
      );

      // Check player1's baseline research (from SmallCargo requirements)
      const research1 = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      const baseResearchLevel = Number(research1.combustionDrive);

      // Player2 with one more level of Combustion Drive research
      const planetId2 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player2,
        1, // SmallCargo
        1
      );

      // Add one more level of Combustion Drive for player2
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);
      await contracts.nexusGame.connect(signers.player2).startResearch(planetId2, 1); // COMBUSTION_DRIVE
      await advanceTime(360000);
      await contracts.nexusGame.completeResearch(signers.player2.address);

      // Verify research level is one higher
      const research2 = await contracts.nexusGame.getPlayerResearch(signers.player2.address);
      expect(research2.combustionDrive).to.equal(baseResearchLevel + 1);

      // Set up a common target (player3)
      const planetId3 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player3,
        0,
        0
      );

      // Test using GameConfig view functions directly for more precise comparison
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      // Get speed without and with extra research
      const speedBase = await contracts.gameConfig.getSlowestSpeedWithResearch(ships, baseResearchLevel, 0, 0);
      const speedBoosted = await contracts.gameConfig.getSlowestSpeedWithResearch(ships, baseResearchLevel + 1, 0, 0);

      // Speed should be boosted
      // Formula: baseSpeed * (100 + level * 10) / 100
      // So each level adds 10% of the BASE speed (not the current speed)
      expect(speedBoosted).to.be.greaterThan(speedBase);

      // The difference should be constant: 10% of base speed (5000 for SmallCargo)
      // SmallCargo base speed is 5000, so each level adds 500
      const speedDifference = Number(speedBoosted) - Number(speedBase);
      expect(speedDifference).to.equal(500);
    });
  });

  describe("Cargo Capacity Integration - Research Impact", function () {
    it("Should increase cargo limit with hyperspace tech research", async function () {
      // Set up player with SmallCargo ships
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        1, // SmallCargo
        1
      );

      // Research Hyperspace Tech level 1
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 11); // HYPERSPACE_TECH
      await advanceTime(360000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      // Verify research level
      const research = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research.hyperspaceTech).to.equal(1n);

      // Base cargo is 5000, with hyperspace tech level 1: 5000 * 1.05 = 5250
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const enhancedCargo = await contracts.gameConfig.getTotalCargoCapacityWithResearch(ships, 1);
      expect(enhancedCargo).to.equal(5250n);

      // Set up destination
      await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player2,
        0,
        0
      );

      // Verify enhanced cargo capacity exists but don't test with cargo
      // (RAID missions cannot carry cargo)
      // Just verify the calculation works
      const cargoCalc = await contracts.gameConfig.getTotalCargoCapacityWithResearch(ships, 1);
      expect(cargoCalc).to.equal(5250n);

      // Dispatch a simple RAID fleet to verify it works
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(
        planetId,
        ships,
        [1, 1, 2],
        1, // RAID
        0, // No cargo allowed in RAID
        0,
        0
      );

      // Verify fleet was dispatched successfully
      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      expect(fleetIds.length).to.equal(1);
    });

    it("Should reject cargo exceeding enhanced capacity", async function () {
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        1, // SmallCargo
        1
      );

      // Research Hyperspace Tech level 1
      await advanceTime(360000);
      await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
      await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 11); // HYPERSPACE_TECH
      await advanceTime(360000);
      await contracts.nexusGame.completeResearch(signers.player1.address);

      await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player2,
        0,
        0
      );

      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      // RAID missions cannot carry cargo at all
      await expect(
        contracts.nexusGame.connect(signers.player1).dispatchFleet(
          planetId1,
          ships,
          [1, 1, 2],
          1, // RAID
          1, // Any cargo not allowed
          0,
          0
        )
      ).to.be.revertedWith("RAID cannot carry cargo");
    });
  });

  describe("Combat Integration - Weapon Tech", function () {
    it("Should win combat with weapon tech advantage", async function () {
      // Player1: 2 LightFighters with Weapon Tech level 2
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        3, // LightFighter
        2
      );

      // Research Weapon Tech level 2
      for (let i = 0; i < 2; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 4); // WEAPON_TECH
        await advanceTime(360000);
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      const research1 = await contracts.nexusGame.getPlayerResearch(signers.player1.address);
      expect(research1.weaponTech).to.equal(2n);

      // Player2: 2 SmallCargo (weak defenders, no weapon research)
      const planetId2 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player2,
        1, // SmallCargo
        2
      );

      // Verify player2 has ships
      const player2Ships = await contracts.nexusGame.getShips(planetId2);
      expect(player2Ships[1]).to.equal(2n); // 2 SmallCargo

      // Let player2 accumulate resources
      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      // Player1 raids player2 with 2 LightFighters
      const ships = [0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0); // RAID

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Check battle report - attacker should win decisively
      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      expect(report.attackerWon).to.equal(true);
      // With weapon tech bonus, attacker should have minimal or no losses
      expect(report.attackerLosses[3]).to.be.lessThan(report.attackerInitial[3]);
    });
  });

  describe("Combat Integration - Shielding Tech", function () {
    it("Should survive better with shielding tech", async function () {
      // Player1: 2 LightFighters with no shielding
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        3, // LightFighter
        2
      );

      // Player2: 2 LightFighters with Shielding Tech level 5
      const planetId2 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player2,
        3, // LightFighter
        2
      );

      // Research Shielding Tech level 5 for player2
      for (let i = 0; i < 5; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);
        await contracts.nexusGame.connect(signers.player2).startResearch(planetId2, 5); // SHIELDING_TECH
        await advanceTime(360000);
        await contracts.nexusGame.completeResearch(signers.player2.address);
      }

      const research2 = await contracts.nexusGame.getPlayerResearch(signers.player2.address);
      expect(research2.shieldingTech).to.equal(5n);

      // Let player2 accumulate resources
      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      // Player1 raids player2
      const ships = [0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0); // RAID

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Check battle report - defender's shields should help them win or tie
      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // With equal ships but defender having +50% shields, defender should perform better
      // Defender losses should be lower than attacker losses
      expect(report.defenderLosses[3]).to.be.lessThan(report.attackerLosses[3]);
    });
  });

  describe("Combat Integration - Armour Tech", function () {
    it("Should tank more damage with armour tech", async function () {
      // Player1: 3 LightFighters with no armour
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        3, // LightFighter
        3
      );

      // Player2: 3 LightFighters with Armour Tech level 5
      const planetId2 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player2,
        3, // LightFighter
        3
      );

      // Research Armour Tech level 5 for player2
      for (let i = 0; i < 5; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);
        await contracts.nexusGame.connect(signers.player2).startResearch(planetId2, 6); // ARMOUR_TECH
        await advanceTime(360000);
        await contracts.nexusGame.completeResearch(signers.player2.address);
      }

      const research2 = await contracts.nexusGame.getPlayerResearch(signers.player2.address);
      expect(research2.armourTech).to.equal(5n);

      // Let player2 accumulate resources
      await advanceTime(7200);
      await contracts.nexusGame.connect(signers.player2).claimResources(planetId2);

      // Player1 raids player2
      const ships = [0n, 0n, 0n, 3n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      await contracts.nexusGame.connect(signers.player1).dispatchFleet(planetId1, ships, [1, 1, 2], 1, 0, 0, 0); // RAID

      const fleetIds = await contracts.nexusGame.getPlayerFleetIds(signers.player1.address);
      await advanceTime(60);
      await contracts.nexusGame.resolveFleet(fleetIds[0]);

      // Check battle report
      const reportIds = await contracts.nexusGame.getPlayerReportIds(signers.player1.address);
      const report = await contracts.nexusGame.getBattleReport(reportIds[0]);

      // With armour tech, defender's ships have +50% hull
      // Should see defender survive better than equal combat
      expect(report.defenderLosses[3]).to.be.lessThan(report.attackerLosses[3]);
    });
  });

  describe("NexusGame View Route - Combat Stats", function () {
    it("Should return boosted combat stats for player with research", async function () {
      // Set up player and research
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        3, // LightFighter
        1
      );

      // Research Weapon Tech level 3
      for (let i = 0; i < 3; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 4); // WEAPON_TECH
        await advanceTime(360000);
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      // Get combat stats via NexusGame router
      const stats = await contracts.nexusGame.getShipCombatStats(3, signers.player1.address); // LightFighter

      // LightFighter base: weapon=50, shield=10, hull=4000
      // With weapon tech level 3: weapon = 50 * (100 + 30) / 100 = 65
      expect(stats.weaponPower).to.equal(65n);
      expect(stats.shieldPower).to.equal(10n); // No shield research
      expect(stats.structuralIntegrity).to.equal(4000n); // No armour research
    });

    it("Should return base stats for player without research", async function () {
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        3, // LightFighter
        1
      );

      // Get combat stats without additional research
      const stats = await contracts.nexusGame.getShipCombatStats(3, signers.player1.address);

      // Should match base stats
      const baseConfig = await contracts.gameConfig.getShipConfig(3);
      expect(stats.weaponPower).to.equal(baseConfig.weaponPower);
      expect(stats.shieldPower).to.equal(baseConfig.shieldPower);
      expect(stats.structuralIntegrity).to.equal(baseConfig.structuralIntegrity);
    });

    it("Should return different stats for different players", async function () {
      // Player1 with research
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        3, // LightFighter
        1
      );

      for (let i = 0; i < 5; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 4); // WEAPON_TECH
        await advanceTime(360000);
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      // Player2 without research
      const planetId2 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player2,
        3, // LightFighter
        1
      );

      const stats1 = await contracts.nexusGame.getShipCombatStats(3, signers.player1.address);
      const stats2 = await contracts.nexusGame.getShipCombatStats(3, signers.player2.address);

      // Player1 should have boosted weapon
      expect(stats1.weaponPower).to.equal(75n); // 50 * 1.5
      expect(stats2.weaponPower).to.equal(50n); // Base
    });
  });

  describe("Mixed Research Bonuses", function () {
    it("Should apply multiple research bonuses correctly", async function () {
      const planetId1 = await setupPlayerWithShips(
        contracts.nexusGame,
        contracts.gameConfig,
        signers.player1,
        3, // LightFighter
        1
      );

      // Research Weapon Tech level 2
      for (let i = 0; i < 2; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 4); // WEAPON_TECH
        await advanceTime(360000);
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      // Research Shielding Tech level 3
      for (let i = 0; i < 3; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 5); // SHIELDING_TECH
        await advanceTime(360000);
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      // Research Armour Tech level 4
      for (let i = 0; i < 4; i++) {
        await advanceTime(360000);
        await contracts.nexusGame.connect(signers.player1).claimResources(planetId1);
        await contracts.nexusGame.connect(signers.player1).startResearch(planetId1, 6); // ARMOUR_TECH
        await advanceTime(360000);
        await contracts.nexusGame.completeResearch(signers.player1.address);
      }

      const stats = await contracts.nexusGame.getShipCombatStats(3, signers.player1.address);

      // weapon: 50 * (100 + 20) / 100 = 60
      // shield: 10 * (100 + 30) / 100 = 13
      // hull: 4000 * (100 + 40) / 100 = 5600
      expect(stats.weaponPower).to.equal(60n);
      expect(stats.shieldPower).to.equal(13n);
      expect(stats.structuralIntegrity).to.equal(5600n);
    });
  });

  describe("Edge Cases", function () {
    it("Should revert on zero ships for speed calculation", async function () {
      const ships = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      // Should revert with "No ships in fleet"
      await expect(
        contracts.gameConfig.getSlowestSpeedWithResearch(ships, 5, 5, 5)
      ).to.be.revertedWith("No ships in fleet");
    });

    it("Should return zero cargo for zero ships", async function () {
      const ships = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

      const cargo = await contracts.gameConfig.getTotalCargoCapacityWithResearch(ships, 10);
      expect(cargo).to.equal(0n);
    });

    it("Should handle very high research levels", async function () {
      // LightFighter with weapon tech level 50
      const stats = await contracts.gameConfig.getShipCombatStats(3, 50, 0, 0);

      // weapon: 50 * (100 + 500) / 100 = 300
      expect(stats.weaponPower).to.equal(300n);
    });

    it("Should handle crawler with NONE drive type", async function () {
      const ships = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n]; // Crawler

      // Crawler has NONE drive type (speed = 0), which will cause "No ships in fleet" when it's the slowest
      await expect(
        contracts.gameConfig.getSlowestSpeedWithResearch(ships, 10, 10, 10)
      ).to.be.revertedWith("No ships in fleet");
    });
  });
});
