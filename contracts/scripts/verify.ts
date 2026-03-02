import hre from "hardhat";

const ADDRESSES = {
  GameConfig: "0x7F41b7fC8DBF2909A596E2751680efccb7d189F9",
  GameStateImplementation: "0xc30a907A2A459b5ad073D28bD8EA32B24aEdbB37",
  GameStateProxy: "0xb6fBecfF75577b71c76eB2ca22C6f8471a513d9d",
  NexusGame: "0xD2E15C81512238A3BFC38E37d4fb32B647f50450",
  PlanetManager: "0x3003Bf65c45c2bEF2712d44a46CDF69d9B9EE6F9",
  ShipManager: "0x6ECE387fe3eb38E37acc9cCF8bDfE84589f7e9F7",
  CombatEngine: "0x7288605e6FEF8c1A44d8D7401Ae20cf1438EEb51",
  FleetResolver: "0x3B00F589Fbc5f70BB6E3B3c0e09E0ad2d77BCA3B",
  FleetManager: "0x1d5a7D8a2579f5d222DF99ddAeF06D1b05Dc0033",
  ResearchManager: "0xc7fbD88E298a5e356a73296e4364d9081262FbF6",
  DefenseManager: "0xd34F8a1b61F625d576387169b7CCD159bD7decEF",
  TutorialManager: "0xbF80F9ec005ec043b5512f77Df5e1F073776AB19",
};

const contracts = [
  {
    name: "GameConfig",
    address: ADDRESSES.GameConfig,
    constructorArguments: [],
  },
  {
    name: "GameState",
    address: ADDRESSES.GameStateImplementation,
    constructorArguments: [],
  },
  {
    name: "NexusGame",
    address: ADDRESSES.NexusGame,
    constructorArguments: [ADDRESSES.GameStateProxy, ADDRESSES.GameConfig],
  },
  {
    name: "PlanetManager",
    address: ADDRESSES.PlanetManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameStateProxy, ADDRESSES.GameConfig],
  },
  {
    name: "ShipManager",
    address: ADDRESSES.ShipManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameStateProxy, ADDRESSES.GameConfig],
  },
  {
    name: "CombatEngine",
    address: ADDRESSES.CombatEngine,
    constructorArguments: [ADDRESSES.GameConfig],
  },
  {
    name: "FleetResolver",
    address: ADDRESSES.FleetResolver,
    constructorArguments: [ADDRESSES.GameStateProxy, ADDRESSES.GameConfig, ADDRESSES.CombatEngine],
  },
  {
    name: "FleetManager",
    address: ADDRESSES.FleetManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameStateProxy, ADDRESSES.GameConfig, ADDRESSES.FleetResolver],
  },
  {
    name: "ResearchManager",
    address: ADDRESSES.ResearchManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameStateProxy, ADDRESSES.GameConfig],
  },
  {
    name: "DefenseManager",
    address: ADDRESSES.DefenseManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameStateProxy, ADDRESSES.GameConfig],
  },
  {
    name: "TutorialManager",
    address: ADDRESSES.TutorialManager,
    constructorArguments: [ADDRESSES.NexusGame, ADDRESSES.GameStateProxy, ADDRESSES.GameConfig],
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
