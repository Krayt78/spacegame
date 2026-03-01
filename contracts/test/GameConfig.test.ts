import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts, DeployedContracts, TestSigners } from "./helpers/setup";

describe("GameConfig", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("Resource & Building Config", function () {
    it("Should return starting resources", async function () {
      const starting = await contracts.gameConfig.getStartingResources();
      expect(starting.titanium).to.equal(500n);
      expect(starting.helium3).to.equal(500n);
      expect(starting.darkMatter).to.equal(0n);
    });

    it("Should calculate upgrade costs", async function () {
      const cost = await contracts.gameConfig.getUpgradeCost(1, 0); // TITANIUM_EXTRACTOR level 0
      expect(cost.titanium).to.equal(60n);
      expect(cost.helium3).to.equal(15n);
    });

    it("Should calculate production rates", async function () {
      const production = await contracts.gameConfig.getProduction(1, 1); // TITANIUM_EXTRACTOR level 1
      expect(production).to.equal(30n);
    });

    it("Should return zero production for level 0", async function () {
      const production = await contracts.gameConfig.getProduction(1, 0);
      expect(production).to.equal(0n);
    });
  });

  describe("Ship Config", function () {
    it("Should return ship costs", async function () {
      const smallCargoCost = await contracts.gameConfig.getShipCost(1); // SmallCargoShip
      expect(smallCargoCost.titanium).to.equal(2000n);
      expect(smallCargoCost.helium3).to.equal(2000n);
      expect(smallCargoCost.darkMatter).to.equal(0n);

      const lightFighterCost = await contracts.gameConfig.getShipCost(3); // LightFighter
      expect(lightFighterCost.titanium).to.equal(3000n);
      expect(lightFighterCost.helium3).to.equal(1000n);
      expect(lightFighterCost.darkMatter).to.equal(0n);
    });

    it("Should return ship configuration", async function () {
      const config = await contracts.gameConfig.getShipConfig(1); // SmallCargoShip
      expect(config.cargoCapacity).to.equal(5000);
      expect(config.speed).to.equal(5000);
      expect(config.weaponPower).to.equal(5);
      expect(config.shieldPower).to.equal(10);
      expect(config.structuralIntegrity).to.equal(4000);
      expect(config.fuelConsumption).to.equal(10);
    });

    it("Should calculate ship build time correctly", async function () {
      // Formula: totalCost / (250 * (1 + shipyardLevel))
      // SmallCargoShip cost: 2000 titanium + 2000 helium3 + 0 darkMatter = 4000
      const quantity = 10;
      const shipyardLevel = 1;

      const buildTime = await contracts.gameConfig.getShipBuildTime(1, quantity, shipyardLevel);
      const totalCost = 4000 * quantity; // 4000 per ship
      const expectedTime = totalCost / (25 * (1 + shipyardLevel));

      expect(buildTime).to.equal(expectedTime);
    });

    it("Should reject ship build time for shipyard level 0", async function () {
      await expect(
        contracts.gameConfig.getShipBuildTime(1, 1, 0)
      ).to.be.revertedWith("Shipyard required");
    });
  });

  describe("Travel Time (OGame Formula)", function () {
    it("Should calculate same-system travel time correctly", async function () {
      // Position 1 to 2, SmallCargo speed 5000
      // distance = 1000 + 5 * 1 = 1005
      // innerScaled = 1005 * 10 * 1e8 / 5000 = 201000000
      // sqrt(201000000) = 14177
      // time = 10 + 35000 * 14177 / (1000 * 10000) = 10 + 49 = 59
      const time = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [1, 1, 2], 5000);
      expect(time).to.equal(59);
    });

    it("Should calculate same-galaxy cross-system travel time correctly", async function () {
      // System 1 to 3, SmallCargo speed 5000
      // distance = 2700 + 95 * 2 = 2890
      const time = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [1, 3, 1], 5000);
      // Should be longer than same-system
      expect(time).to.be.gt(59);
    });

    it("Should calculate cross-galaxy travel time correctly", async function () {
      // Galaxy 1 to 2, SmallCargo speed 5000
      // distance = 20000
      const time = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [2, 1, 1], 5000);
      // Should be much longer
      expect(time).to.be.gt(100);
    });

    it("Should use hierarchical distance (galaxy ignores system/position)", async function () {
      const time1 = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [2, 1, 1], 5000);
      const time2 = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [2, 5, 8], 5000);
      // Both should be identical: same galaxy difference, system/position ignored
      expect(time1).to.equal(time2);
    });

    it("Should use hierarchical distance (system ignores position)", async function () {
      const time1 = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [1, 3, 1], 5000);
      const time2 = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [1, 3, 8], 5000);
      // Both should be identical: same system difference, position ignored
      expect(time1).to.equal(time2);
    });

    it("Should produce shorter travel time for faster ships", async function () {
      const slowTime = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [1, 1, 5], 5000);
      const fastTime = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [1, 1, 5], 15000);
      expect(fastTime).to.be.lt(slowTime);
    });

    it("Should allow owner to update speedFactor", async function () {
      const defaultFactor = await contracts.gameConfig.speedFactor();
      expect(defaultFactor).to.equal(1000);

      // Get travel time with default factor
      const time1 = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [1, 3, 1], 5000);

      // Double the speed factor (halves travel time contribution)
      await contracts.gameConfig.setSpeedFactor(2000);
      const time2 = await contracts.gameConfig.calculateTravelTime([1, 1, 1], [1, 3, 1], 5000);

      // time2 should be shorter than time1 (the +10 base stays, but sqrt portion halves)
      expect(time2).to.be.lt(time1);
    });

    it("Should reject zero speedFactor", async function () {
      await expect(
        contracts.gameConfig.setSpeedFactor(0)
      ).to.be.revertedWith("Speed factor must be positive");
    });

    it("Should reject non-owner setting speedFactor", async function () {
      await expect(
        contracts.gameConfig.connect(signers.player1).setSpeedFactor(500)
      ).to.be.reverted;
    });
  });

  describe("Raid Loot Percentage", function () {
    it("Should have default raidLootPercentage of 50", async function () {
      const pct = await contracts.gameConfig.raidLootPercentage();
      expect(pct).to.equal(50);
    });

    it("Should allow owner to update raidLootPercentage", async function () {
      await contracts.gameConfig.setRaidLootPercentage(75);
      const pct = await contracts.gameConfig.raidLootPercentage();
      expect(pct).to.equal(75);
    });

    it("Should reject zero raidLootPercentage", async function () {
      await expect(
        contracts.gameConfig.setRaidLootPercentage(0)
      ).to.be.revertedWith("Percentage must be 1-100");
    });

    it("Should reject raidLootPercentage over 100", async function () {
      await expect(
        contracts.gameConfig.setRaidLootPercentage(101)
      ).to.be.revertedWith("Percentage must be 1-100");
    });

    it("Should reject non-owner setting raidLootPercentage", async function () {
      await expect(
        contracts.gameConfig.connect(signers.player1).setRaidLootPercentage(75)
      ).to.be.reverted;
    });
  });

  describe("Distance Calculation", function () {
    it("Should calculate same-system distance correctly", async function () {
      // Position 1 to 5, distance = 1000 + 5 * 4 = 1020
      const distance = await contracts.gameConfig.calculateDistance([1, 1, 1], [1, 1, 5]);
      expect(distance).to.equal(1020);
    });

    it("Should calculate cross-system distance correctly", async function () {
      // System 1 to 5, distance = 2700 + 95 * 4 = 3080
      const distance = await contracts.gameConfig.calculateDistance([1, 1, 1], [1, 5, 1]);
      expect(distance).to.equal(3080);
    });

    it("Should calculate cross-galaxy distance correctly", async function () {
      // Galaxy 1 to 3, distance = 20000 * 2 = 40000
      const distance = await contracts.gameConfig.calculateDistance([1, 1, 1], [3, 1, 1]);
      expect(distance).to.equal(40000);
    });

    it("Should calculate same coordinates distance", async function () {
      // Same position, distance = 1000 + 5 * 0 = 1000
      const distance = await contracts.gameConfig.calculateDistance([1, 1, 1], [1, 1, 1]);
      expect(distance).to.equal(1000);
    });

    it("Should use hierarchical distance (galaxy diff ignores system/position)", async function () {
      const distance1 = await contracts.gameConfig.calculateDistance([1, 1, 1], [2, 1, 1]);
      const distance2 = await contracts.gameConfig.calculateDistance([1, 1, 1], [2, 5, 8]);
      // Both should be identical: same galaxy difference, system/position ignored
      expect(distance1).to.equal(distance2);
      expect(distance1).to.equal(20000);
    });

    it("Should use hierarchical distance (system diff ignores position)", async function () {
      const distance1 = await contracts.gameConfig.calculateDistance([1, 1, 1], [1, 3, 1]);
      const distance2 = await contracts.gameConfig.calculateDistance([1, 1, 1], [1, 3, 8]);
      // Both should be identical: same system difference, position ignored
      expect(distance1).to.equal(distance2);
      expect(distance1).to.equal(2890); // 2700 + 95 * 2
    });
  });

  describe("Fleet Fuel Consumption", function () {
    it("Should calculate fuel for single SmallCargo at short distance", async function () {
      // SmallCargo baseFuel=10, distance=1005 (adjacent positions)
      // fuelPerShip = 1 + (10 * 1005 * 4) / 35000 = 1 + 40200/35000 = 1 + 1 = 2 (integer division)
      const ships = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const fuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 1005);
      expect(fuel).to.equal(2n);
    });

    it("Should calculate fuel for single Destroyer at cross-galaxy distance", async function () {
      // Destroyer baseFuel=1000, distance=40000
      // fuelPerShip = 1 + (1000 * 40000 * 4) / 35000 = 1 + 160000000/35000 = 1 + 4571 = 4572
      const ships = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n, 0n, 0n, 0n];
      const fuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 40000);
      expect(fuel).to.equal(4572n);
    });

    it("Should calculate fuel for mixed fleet at cross-system distance", async function () {
      // 10 SmallCargo + 5 LightFighter, distance=3080
      // SmallCargo: 10 * (1 + (10 * 3080 * 4) / 35000) = 10 * (1 + 123200/35000) = 10 * (1 + 3) = 40
      // LightFighter: 5 * (1 + (20 * 3080 * 4) / 35000) = 5 * (1 + 246400/35000) = 5 * (1 + 7) = 40
      // Total = 80
      const ships = [0n, 10n, 0n, 5n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const fuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 3080);
      expect(fuel).to.equal(80n);
    });

    it("Should return zero fuel for Crawler only (baseFuel=0)", async function () {
      // Crawler has baseFuel=0, so fuel should always be 0 regardless of distance
      const ships = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 5n];
      const fuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 10000);
      expect(fuel).to.equal(0n);
    });

    it("Should calculate minimum fuel (1 per ship) at zero distance", async function () {
      // At distance=0, fuelPerShip = 1 + (baseFuel * 0 * 4) / 35000 = 1 + 0 = 1
      // 3 SmallCargo + 2 LightFighter = 5 ships total, 5 fuel
      const ships = [0n, 3n, 0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
      const fuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 0);
      expect(fuel).to.equal(5n);
    });

    it("Should handle large fleets with high fuel consumption", async function () {
      // 100 Battleships, baseFuel=500, distance=20000 (cross-galaxy)
      // fuelPerShip = 1 + (500 * 20000 * 4) / 35000 = 1 + 40000000/35000 = 1 + 1142 = 1143
      // Total = 100 * 1143 = 114300
      const ships = [0n, 0n, 0n, 0n, 0n, 0n, 100n, 0n, 0n, 0n, 0n, 0n, 0n];
      const fuel = await contracts.gameConfig.calculateFleetFuelConsumption(ships, 20000);
      expect(fuel).to.equal(114300n);
    });
  });
});
