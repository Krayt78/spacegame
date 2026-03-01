import hre from "hardhat";

const ADDRESSES = {
  GameConfig: "0xcde5bacBA284223e957B20e76561a3286658b73a",
  GameState: "0xf362fac151824277Ae7dA651d883B1ce0c311C94",
  NexusGame: "0xD7a6d3842E98c103F7CfBa73c792EE87a925c601",
  PlanetManager: "0x4fE083188417eF2919A1dB10103092A2704ECE4c",
  ShipManager: "0x65AF15dfb2F4467C273908190aE3A7E049b54FdF",
  CombatEngine: "0xcBbe7F84a89e1BfC392aD0371265c2421A7CBc09",
  FleetResolver: "0x42E0a7CB2819a70Fd4a98C20914f24B4592F3612",
  FleetManager: "0xD7df24Fdc4392ECfdf2C032Ea33C50f4D6fE67aF",
  ResearchManager: "0xa7A6eC2ca23b91657a83d0e262C78E3A9A806782",
  DefenseManager: "0x87677B686Ab46934454f8ED2d303f2e42739b7B0",
};

const contracts = [
  {
    name: "GameConfig",
    address: ADDRESSES.GameConfig,
    constructorArguments: [],
  },
  {
    name: "GameState",
    address: ADDRESSES.GameState,
    constructorArguments: [],
  },
  {
    name: "NexusGame",
    address: ADDRESSES.NexusGame,
    constructorArguments: [ADDRESSES.GameState, ADDRESSES.GameConfig],
  },
  {
    name: "PlanetManager",
    address: ADDRESSES.PlanetManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameState, ADDRESSES.GameConfig],
  },
  {
    name: "ShipManager",
    address: ADDRESSES.ShipManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameState, ADDRESSES.GameConfig],
  },
  {
    name: "CombatEngine",
    address: ADDRESSES.CombatEngine,
    constructorArguments: [ADDRESSES.GameConfig],
  },
  {
    name: "FleetResolver",
    address: ADDRESSES.FleetResolver,
    constructorArguments: [ADDRESSES.GameState, ADDRESSES.GameConfig, ADDRESSES.CombatEngine],
  },
  {
    name: "FleetManager",
    address: ADDRESSES.FleetManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameState, ADDRESSES.GameConfig, ADDRESSES.FleetResolver],
  },
  {
    name: "ResearchManager",
    address: ADDRESSES.ResearchManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameState, ADDRESSES.GameConfig],
  },
  {
    name: "DefenseManager",
    address: ADDRESSES.DefenseManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameState, ADDRESSES.GameConfig],
  },
];

async function main() {
  console.log("Verifying Nexus Protocol contracts on Polkadot Hub TestNet...\n");

  let succeeded = 0;
  let failed = 0;
  let alreadyVerified = 0;

  for (const contract of contracts) {
    console.log(`Verifying ${contract.name} at ${contract.address}...`);
    try {
      await hre.run("verify:verify", {
        address: contract.address,
        constructorArguments: contract.constructorArguments,
      });
      console.log(`  ${contract.name} verified!\n`);
      succeeded++;
    } catch (error: any) {
      if (error.message?.includes("Already Verified") || error.message?.includes("already verified")) {
        console.log(`  ${contract.name} is already verified.\n`);
        alreadyVerified++;
      } else {
        console.error(`  Failed to verify ${contract.name}:`, error.message, "\n");
        failed++;
      }
    }
  }

  console.log("=".repeat(50));
  console.log(`Verification complete: ${succeeded} verified, ${alreadyVerified} already verified, ${failed} failed`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
