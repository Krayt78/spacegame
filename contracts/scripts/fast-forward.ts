import { ethers, network } from "hardhat";

/**
 * Fast-forward the local hardhat chain's clock so timer-gated actions
 * (completeUpgrade / completeShipBuild / completeResearch / resolveFleet /
 * completeFleet) become executable without waiting in real time.
 *
 * Usage:
 *   FF_SECONDS=7200 npx hardhat run scripts/fast-forward.ts --network localhost
 * (default: 3600 = 1 hour)
 */
async function main() {
  const seconds = Number(process.env.FF_SECONDS ?? 3600);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`FF_SECONDS must be a positive number, got "${process.env.FF_SECONDS}"`);
  }
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
  const block = await ethers.provider.getBlock("latest");
  console.log(`Advanced chain time by ${seconds}s → block ${block!.number}, timestamp ${block!.timestamp}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
