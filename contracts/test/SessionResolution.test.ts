import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployContracts,
  advanceTime,
  DeployedContracts,
  TestSigners,
} from "./helpers/setup";

// A "session key" here is just another signer acting on the owner's behalf.
describe("Session key resolution through NexusGame", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  it("wires the registry as an immutable on the router", async function () {
    expect(await contracts.nexusGame.sessionRegistry()).to.equal(
      await contracts.sessionRegistry.getAddress()
    );
  });

  it("credits the OWNER when a registered session key acts", async function () {
    const owner = signers.player1;
    const sessionKey = signers.player3;

    // Owner claims a planet with their own key — the plain-EOA path.
    await contracts.nexusGame.connect(owner).claimStarterPlanet("Registry Home");
    const planetId = await contracts.nexusGame.getPlayerPlanetId(owner.address);
    expect(planetId).to.be.gt(0n);

    // Owner authorizes the session key.
    await contracts.sessionRegistry
      .connect(owner)
      .registerSession(sessionKey.address);

    // The SESSION KEY acts. The owner's planet must change.
    // upgradeBuilding only STARTS a timed upgrade, so run the full cycle.
    // completeUpgrade is a permissionless crank — deliberately not resolved.
    const before = await contracts.gameState.getBuildingLevel(planetId, 1);
    await contracts.nexusGame.connect(sessionKey).upgradeBuilding(planetId, 1);
    await advanceTime(3600);
    await contracts.nexusGame.connect(sessionKey).completeUpgrade(planetId);
    const after = await contracts.gameState.getBuildingLevel(planetId, 1);
    expect(after).to.be.gt(before);

    // ...and the session key itself must own nothing.
    expect(
      await contracts.nexusGame.getPlayerPlanetId(sessionKey.address)
    ).to.equal(0n);
  });

  it("rejects an unregistered key acting on someone else's planet", async function () {
    const owner = signers.player1;
    const stranger = signers.player3;

    await contracts.nexusGame.connect(owner).claimStarterPlanet("Not Yours");
    const planetId = await contracts.nexusGame.getPlayerPlanetId(owner.address);

    await expect(
      contracts.nexusGame.connect(stranger).upgradeBuilding(planetId, 1)
    ).to.be.revertedWith("Not your planet");
  });

  it("stops crediting the owner once the session is revoked", async function () {
    const owner = signers.player1;
    const sessionKey = signers.player3;

    await contracts.nexusGame.connect(owner).claimStarterPlanet("Revoke Me");
    const planetId = await contracts.nexusGame.getPlayerPlanetId(owner.address);

    await contracts.sessionRegistry
      .connect(owner)
      .registerSession(sessionKey.address);
    await contracts.nexusGame.connect(sessionKey).upgradeBuilding(planetId, 1);

    await contracts.sessionRegistry.connect(owner).revokeSession();

    // The key now resolves to itself, so ownership checks reject it.
    await expect(
      contracts.nexusGame.connect(sessionKey).upgradeBuilding(planetId, 1)
    ).to.be.revertedWith("Not your planet");
  });

  it("claimStarterPlanet by a session key claims for the OWNER", async function () {
    const owner = signers.player2;
    const sessionKey = signers.player3;

    await contracts.sessionRegistry
      .connect(owner)
      .registerSession(sessionKey.address);
    await contracts.nexusGame
      .connect(sessionKey)
      .claimStarterPlanet("Session Claimed");

    expect(await contracts.nexusGame.getPlayerPlanetId(owner.address)).to.be.gt(
      0n
    );
    expect(
      await contracts.nexusGame.getPlayerPlanetId(sessionKey.address)
    ).to.equal(0n);
  });
});
