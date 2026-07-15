import { expect } from "chai";
import { ethers } from "hardhat";
import { SessionRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("SessionRegistry", function () {
  let registry: SessionRegistry;
  let owner: HardhatEthersSigner;
  let session: HardhatEthersSigner;
  let other: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, session, other, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SessionRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  describe("registerSession", function () {
    it("registers a session and resolves it to the owner", async function () {
      await expect(registry.connect(owner).registerSession(session.address))
        .to.emit(registry, "SessionRegistered")
        .withArgs(owner.address, session.address);

      expect(await registry.resolve(session.address)).to.equal(owner.address);
      expect(await registry.sessionOf(owner.address)).to.equal(session.address);
      expect(await registry.ownerOf(session.address)).to.equal(owner.address);
      expect(await registry.isSessionKey(session.address)).to.equal(true);
    });

    it("rejects the zero address", async function () {
      await expect(
        registry.connect(owner).registerSession(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "InvalidSessionKey");
    });

    it("rejects registering yourself as your own session key", async function () {
      await expect(
        registry.connect(owner).registerSession(owner.address)
      ).to.be.revertedWithCustomError(registry, "InvalidSessionKey");
    });

    it("rejects a key already bound to another owner", async function () {
      await registry.connect(owner).registerSession(session.address);
      await expect(
        registry.connect(other).registerSession(session.address)
      ).to.be.revertedWithCustomError(registry, "SessionKeyInUse");
    });

    it("rejects a burned key even for the same owner (rotation needs a fresh key)", async function () {
      await registry.connect(owner).registerSession(session.address);
      await registry.connect(owner).registerSession(other.address);
      await expect(
        registry.connect(owner).registerSession(session.address)
      ).to.be.revertedWithCustomError(registry, "SessionKeyInUse");
    });

    it("rejects a rotated-away key for a DIFFERENT owner too", async function () {
      // You rotate because the key may be compromised. If revoking simply
      // cleared ownerOf, the retired key would look pristine and anyone could
      // claim it.
      await registry.connect(owner).registerSession(session.address);
      await registry.connect(owner).registerSession(other.address);
      await expect(
        registry.connect(stranger).registerSession(session.address)
      ).to.be.revertedWithCustomError(registry, "SessionKeyInUse");
    });

    it("rejects a key retired via revokeSession", async function () {
      await registry.connect(owner).registerSession(session.address);
      await registry.connect(owner).revokeSession();
      await expect(
        registry.connect(owner).registerSession(session.address)
      ).to.be.revertedWithCustomError(registry, "SessionKeyInUse");
    });

    it("auto-revokes the previous session on re-register (rotation)", async function () {
      await registry.connect(owner).registerSession(session.address);

      await expect(registry.connect(owner).registerSession(other.address))
        .to.emit(registry, "SessionRevoked")
        .withArgs(owner.address, session.address)
        .to.emit(registry, "SessionRegistered")
        .withArgs(owner.address, other.address);

      expect(await registry.sessionOf(owner.address)).to.equal(other.address);
      expect(await registry.resolve(other.address)).to.equal(owner.address);
      // The old key is dead: it resolves to itself, not to the owner.
      expect(await registry.resolve(session.address)).to.equal(session.address);
      expect(await registry.isSessionKey(session.address)).to.equal(false);
    });
  });

  describe("revokeSession", function () {
    it("clears both mappings and emits", async function () {
      await registry.connect(owner).registerSession(session.address);

      await expect(registry.connect(owner).revokeSession())
        .to.emit(registry, "SessionRevoked")
        .withArgs(owner.address, session.address);

      expect(await registry.sessionOf(owner.address)).to.equal(
        ethers.ZeroAddress
      );
      expect(await registry.ownerOf(session.address)).to.equal(
        ethers.ZeroAddress
      );
      expect(await registry.resolve(session.address)).to.equal(session.address);
      expect(await registry.isSessionKey(session.address)).to.equal(false);
    });

    it("reverts when there is no active session", async function () {
      await expect(
        registry.connect(owner).revokeSession()
      ).to.be.revertedWithCustomError(registry, "NoActiveSession");
    });

    it("only revokes the caller's own session", async function () {
      await registry.connect(owner).registerSession(session.address);
      await expect(
        registry.connect(stranger).revokeSession()
      ).to.be.revertedWithCustomError(registry, "NoActiveSession");
      expect(await registry.resolve(session.address)).to.equal(owner.address);
    });
  });

  describe("resolve", function () {
    // The load-bearing invariant: never return address(0), or callers would
    // silently credit the zero address for any unregistered caller.
    it("resolves an unregistered address to itself", async function () {
      expect(await registry.resolve(stranger.address)).to.equal(
        stranger.address
      );
    });

    it("resolves the zero address to itself", async function () {
      expect(await registry.resolve(ethers.ZeroAddress)).to.equal(
        ethers.ZeroAddress
      );
    });

    it("resolves an owner (not a session key) to itself", async function () {
      await registry.connect(owner).registerSession(session.address);
      expect(await registry.resolve(owner.address)).to.equal(owner.address);
    });
  });
});
