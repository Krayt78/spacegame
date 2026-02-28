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
});
