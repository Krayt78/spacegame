import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts, DeployedContracts, TestSigners } from "./helpers/setup";

describe("GameState", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("Access Control", function () {
    it("Should prevent direct manager calls from non-router", async function () {
      await expect(
        contracts.planetManager.connect(signers.player1).claimStarterPlanet(signers.player1.address, "Test")
      ).to.be.revertedWith("PlanetManager: only router");
    });

    it("Should prevent direct GameState writes from non-managers", async function () {
      await expect(
        contracts.gameState.connect(signers.player1).createPlanet(1, signers.player1.address, [1, 1, 1], "Test")
      ).to.be.revertedWith("GameState: not authorized manager");
    });

    it("Should allow owner to authorize new managers", async function () {
      const [, , , , newManager] = await ethers.getSigners();
      await contracts.gameState.setManager(newManager.address, true);
      expect(await contracts.gameState.authorizedManagers(newManager.address)).to.be.true;
    });

    it("Should prevent unauthorized address from calling setManager", async function () {
      const [, , , , newManager] = await ethers.getSigners();
      await expect(
        contracts.gameState.connect(signers.player1).setManager(newManager.address, true)
      ).to.be.reverted;
    });

    it("Should allow owner to revoke manager authorization", async function () {
      const [, , , , newManager] = await ethers.getSigners();
      await contracts.gameState.setManager(newManager.address, true);
      expect(await contracts.gameState.authorizedManagers(newManager.address)).to.be.true;

      await contracts.gameState.setManager(newManager.address, false);
      expect(await contracts.gameState.authorizedManagers(newManager.address)).to.be.false;
    });
  });

  describe("UUPS Upgradeability", function () {
    it("Should have owner set correctly via initialize", async function () {
      expect(await contracts.gameState.owner()).to.equal(signers.owner.address);
    });

    it("Should have counters initialized to 1", async function () {
      expect(await contracts.gameState.nextPlanetId()).to.equal(1);
      expect(await contracts.gameState.nextFleetId()).to.equal(1);
      expect(await contracts.gameState.nextReportId()).to.equal(1);
    });

    it("Should prevent calling initialize twice", async function () {
      await expect(
        contracts.gameState.initialize()
      ).to.be.reverted;
    });

    it("Should allow owner to upgrade implementation", async function () {
      // Create some state first
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Test Planet");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);
      expect(planetId).to.be.gt(0);

      // Deploy new implementation
      const GameStateV2 = await ethers.getContractFactory("GameState");
      const newImpl = await GameStateV2.deploy();
      await newImpl.waitForDeployment();

      // Upgrade via proxy
      await contracts.gameState.upgradeToAndCall(
        await newImpl.getAddress(),
        "0x"
      );

      // Verify state survived the upgrade
      const planetIdAfter = await contracts.nexusGame.playerPlanet(signers.player1.address);
      expect(planetIdAfter).to.equal(planetId);

      const planet = await contracts.gameState.getPlanet(planetId);
      expect(planet.owner).to.equal(signers.player1.address);
      expect(planet.name).to.equal("Test Planet");
    });

    it("Should prevent non-owner from upgrading", async function () {
      const GameStateV2 = await ethers.getContractFactory("GameState");
      const newImpl = await GameStateV2.deploy();
      await newImpl.waitForDeployment();

      await expect(
        contracts.gameState.connect(signers.player1).upgradeToAndCall(
          await newImpl.getAddress(),
          "0x"
        )
      ).to.be.reverted;
    });

    it("Should preserve all state types after upgrade", async function () {
      // Create planet and set up some state
      await contracts.nexusGame.connect(signers.player1).claimStarterPlanet("Upgrade Test");
      const planetId = await contracts.nexusGame.playerPlanet(signers.player1.address);

      // Check buildings exist
      const buildingsBefore = await contracts.gameState.getPlanetBuildings(planetId);
      expect(buildingsBefore.titaniumExtractor).to.equal(1);

      // Check resources exist
      const resourcesBefore = await contracts.gameState.getPlanetResources(planetId);
      expect(resourcesBefore.titanium).to.be.gt(0);

      // Upgrade
      const GameStateV2 = await ethers.getContractFactory("GameState");
      const newImpl = await GameStateV2.deploy();
      await newImpl.waitForDeployment();
      await contracts.gameState.upgradeToAndCall(await newImpl.getAddress(), "0x");

      // Verify buildings preserved
      const buildingsAfter = await contracts.gameState.getPlanetBuildings(planetId);
      expect(buildingsAfter.titaniumExtractor).to.equal(buildingsBefore.titaniumExtractor);

      // Verify resources preserved
      const resourcesAfter = await contracts.gameState.getPlanetResources(planetId);
      expect(resourcesAfter.titanium).to.equal(resourcesBefore.titanium);

      // Verify manager authorization preserved
      expect(await contracts.gameState.authorizedManagers(
        await contracts.planetManager.getAddress()
      )).to.be.true;
    });
  });
});
