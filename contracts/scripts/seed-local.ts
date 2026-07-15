import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seed a playable local test world on an already-deployed localhost game
 * (run `npm run deploy:local` first — this script attaches to the addresses
 * in deployments/latest.json rather than deploying its own copy, so the
 * frontend and the seed operate on the SAME contracts).
 *
 * What it creates:
 *  - Alice (hardhat account #0, also the deployer/owner): finished tutorial,
 *    high-level buildings, broad research, a large ship roster, defenses,
 *    an owned outpost, and one fleet in flight (CAPTURE of a nearby outpost).
 *  - 4 NPC players (hardhat accounts #1–#4): claimed starter planets,
 *    finished tutorial, a few ships, and one occupied outpost each.
 *
 * Seeding uses the GameState owner backdoor (`setManager(deployer, true)`)
 * for instant state, but the tutorial has NO skip — each of the 17 quests is
 * genuinely claimed through the router once the seeded state satisfies its
 * condition. Safe to re-run: claims and outposts are guarded, setters just
 * overwrite.
 */

// ---- enums (numeric indices from GameConfig.sol) ----
const Ship = {
  SmallCargo: 1, LargeCargo: 2, LightFighter: 3, HeavyFighter: 4,
  Cruiser: 5, Battleship: 6, Battlecruiser: 7, Bomber: 8,
  Destroyer: 9, ColonyShip: 10, Recycler: 11, Crawler: 12,
} as const;
const Research = {
  CombustionDrive: 1, ImpulseDrive: 2, HyperspaceDrive: 3, WeaponTech: 4,
  ShieldingTech: 5, ArmourTech: 6, ComputerTech: 7, IonTech: 9,
  Astrophysics: 13,
} as const;
const Defense = { RocketLauncher: 1, LightLaser: 2, SmallShieldDome: 7 } as const;
const MISSION_CAPTURE = 2;
const TOTAL_QUESTS = 17;

// Full Buildings struct — ethers v6 needs every component present.
function buildings(b: Partial<Record<string, number>>) {
  return {
    titaniumExtractor: b.titaniumExtractor ?? 0,
    helium3Harvester: b.helium3Harvester ?? 0,
    darkMatterCollector: b.darkMatterCollector ?? 0,
    titaniumVault: b.titaniumVault ?? 0,
    helium3Tank: b.helium3Tank ?? 0,
    darkMatterContainment: b.darkMatterContainment ?? 0,
    shipyard: b.shipyard ?? 0,
    researchNode: b.researchNode ?? 0,
    undergroundBunker: b.undergroundBunker ?? 0,
    __reserved10: 0, __reserved11: 0, __reserved12: 0, __reserved13: 0,
    __reserved14: 0, __reserved15: 0, __reserved16: 0,
  };
}

function ships13(counts: Partial<Record<number, number>>): bigint[] {
  const arr = new Array<bigint>(13).fill(0n);
  for (const [idx, n] of Object.entries(counts)) arr[Number(idx)] = BigInt(n ?? 0);
  return arr;
}

// Outpost positions are 11–15; type derives from position (11,12=Ti mine,
// 13,14=He3 lab, 15=DM refinery).
function outpostTypeFor(position: number): number {
  if (position <= 12) return 1;
  if (position <= 14) return 2;
  return 3;
}

async function now(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", "latest.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments/latest.json not found — run `npm run deploy:local` first.");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 31337) {
    throw new Error(`This seed script is localhost-only (chainId 31337), got ${net.chainId}.`);
  }
  if ((await ethers.provider.getCode(deployment.contracts.NexusGame)) === "0x") {
    throw new Error(
      "No code at the NexusGame address from deployments/latest.json — is the hardhat node fresh? Run `npm run deploy:local` again.",
    );
  }

  const nexusGame = await ethers.getContractAt("NexusGame", deployment.contracts.NexusGame);
  const gameState = await ethers.getContractAt("GameState", deployment.contracts.GameState);

  const signers = await ethers.getSigners();
  const alice = signers[0]; // deployer + owner + "our" account
  const npcs = signers.slice(1, 5);
  const npcNames = ["Vega Station", "Kessler Reach", "Tycho Bastion", "Oberon Drift"];

  console.log(`Seeding local world on NexusGame ${deployment.contracts.NexusGame}`);
  console.log(`  Alice: ${alice.address}`);

  // ---- open the seeding backdoor ----
  await (await gameState.setManager(alice.address, true)).wait();

  try {
    // =========================================================
    // Shared per-player setup
    // =========================================================
    type PlayerSpec = {
      signer: (typeof signers)[number];
      planetName: string;
      buildings: ReturnType<typeof buildings>;
      research: Partial<Record<number, number>>;
      ships: Partial<Record<number, number>>;
      resources: [bigint, bigint, bigint];
    };

    const npcSpec = (i: number): PlayerSpec => ({
      signer: npcs[i],
      planetName: npcNames[i],
      // Satisfies every tutorial quest condition (q0–q16).
      buildings: buildings({
        titaniumExtractor: 6, helium3Harvester: 5, darkMatterCollector: 4,
        titaniumVault: 2, helium3Tank: 1, shipyard: 2, researchNode: 1,
      }),
      research: { [Research.CombustionDrive]: 1, [Research.ComputerTech]: 1 },
      ships: { [Ship.LightFighter]: 8, [Ship.SmallCargo]: 3 },
      resources: [30_000n, 25_000n, 8_000n],
    });

    const aliceSpec: PlayerSpec = {
      signer: alice,
      planetName: "Nexus Prime",
      buildings: buildings({
        titaniumExtractor: 12, helium3Harvester: 10, darkMatterCollector: 8,
        titaniumVault: 8, helium3Tank: 8, darkMatterContainment: 6,
        shipyard: 8, researchNode: 6, undergroundBunker: 3,
      }),
      research: {
        [Research.CombustionDrive]: 6, [Research.ImpulseDrive]: 4,
        [Research.HyperspaceDrive]: 2, [Research.WeaponTech]: 4,
        [Research.ShieldingTech]: 4, [Research.ArmourTech]: 4,
        [Research.ComputerTech]: 4, [Research.IonTech]: 2,
        [Research.Astrophysics]: 4,
      },
      ships: {
        [Ship.SmallCargo]: 20, [Ship.LargeCargo]: 10, [Ship.LightFighter]: 50,
        [Ship.HeavyFighter]: 20, [Ship.Cruiser]: 10, [Ship.Battleship]: 5,
        [Ship.Battlecruiser]: 3, [Ship.Bomber]: 2, [Ship.Destroyer]: 2,
        [Ship.ColonyShip]: 2, [Ship.Recycler]: 5, [Ship.Crawler]: 5,
      },
      // Vault/tank/containment level 8 caps at ~256k — stay under it.
      resources: [200_000n, 200_000n, 120_000n],
    };

    const players = [aliceSpec, ...npcs.map((_, i) => npcSpec(i))];
    const planetIds = new Map<string, bigint>();
    const planetCoords = new Map<string, [number, number, number]>();

    for (const spec of players) {
      const addr = spec.signer.address;
      const label = addr === alice.address ? "Alice" : spec.planetName;

      // 1. Starter planet through the real flow (assigns coords, initializes state)
      if (!(await nexusGame.hasPlanet(addr))) {
        await (await nexusGame.connect(spec.signer).claimStarterPlanet(spec.planetName)).wait();
      }
      const planetId: bigint = await nexusGame.getPlayerPlanetId(addr);
      planetIds.set(addr, planetId);
      const planet = await gameState.getPlanet(planetId);
      const [g, s, p] = [Number(planet.coordinates[0]), Number(planet.coordinates[1]), Number(planet.coordinates[2])];
      planetCoords.set(addr, [g, s, p]);

      // 2. Instant progression via the backdoor
      await (await gameState.setPlanetBuildings(planetId, spec.buildings)).wait();
      for (const [type, level] of Object.entries(spec.research)) {
        const current = Number(await gameState.getResearchLevel(addr, Number(type)));
        for (let l = current; l < (level ?? 0); l++) {
          await (await gameState.incrementResearchLevel(addr, Number(type))).wait();
        }
      }
      const currentShips: bigint[] = [...(await gameState.getPlanetShips(planetId))];
      for (const [type, qty] of Object.entries(spec.ships)) {
        const target = BigInt(qty ?? 0);
        const current = currentShips[Number(type)];
        if (current < target) {
          await (await gameState.addPlanetShips(planetId, Number(type), target - current)).wait();
        }
      }

      // 3. Tutorial — claim all 17 quests for real (no on-chain skip exists)
      const [claimed] = await nexusGame.getTutorialStatus(addr, planetId);
      for (let q = 0; q < TOTAL_QUESTS; q++) {
        if (claimed[q]) continue;
        await (await nexusGame.connect(spec.signer).claimTutorialQuest(planetId, q)).wait();
      }

      // 4. Exact resources last (quest rewards would otherwise skew them)
      await (
        await gameState.setPlanetResources(planetId, spec.resources[0], spec.resources[1], spec.resources[2], await now())
      ).wait();

      console.log(
        `  ${label}: planet #${planetId} [${g}:${s}:${p}], tutorial done, ` +
        `${Object.values(spec.ships).reduce((a, b) => a + (b ?? 0), 0)} ships`,
      );
    }

    // =========================================================
    // Outposts — one occupied per player, garrisoned
    // =========================================================
    // All early planets land in galaxy 1; spread owners across the outpost
    // band (positions 11–15) of systems 1 and 2.
    const outpostAssignments: Array<{ owner: string; label: string; coords: [number, number, number]; garrison: number }> = [
      { owner: alice.address, label: "Alice", coords: [1, 1, 11], garrison: 15 },
      { owner: npcs[0].address, label: npcNames[0], coords: [1, 1, 13], garrison: 10 },
      { owner: npcs[1].address, label: npcNames[1], coords: [1, 1, 15], garrison: 10 },
      { owner: npcs[2].address, label: npcNames[2], coords: [1, 2, 11], garrison: 10 },
      { owner: npcs[3].address, label: npcNames[3], coords: [1, 2, 14], garrison: 10 },
    ];
    for (const { owner, label, coords, garrison } of outpostAssignments) {
      const [g, s, p] = coords;
      await (await gameState.initOutpost(g, s, p, outpostTypeFor(p))).wait();
      const existing = await gameState.getRaiderOutpost(g, s, p);
      if (existing.owner.toLowerCase() !== owner.toLowerCase()) {
        await (await gameState.setOutpostOwner(g, s, p, owner, await now())).wait();
      }
      await (await gameState.setStationedShips(g, s, p, ships13({ [Ship.LightFighter]: garrison }))).wait();
      console.log(`  Outpost [${g}:${s}:${p}] (type ${outpostTypeFor(p)}) → ${label}, ${garrison} fighters garrisoned`);
    }

    // =========================================================
    // Alice extras: defenses + one fleet in flight
    // =========================================================
    const alicePlanet = planetIds.get(alice.address)!;
    await (await gameState.addPlanetDefenses(alicePlanet, Defense.RocketLauncher, 20)).wait();
    await (await gameState.addPlanetDefenses(alicePlanet, Defense.LightLaser, 10)).wait();
    await (await gameState.addPlanetDefenses(alicePlanet, Defense.SmallShieldDome, 1)).wait();

    // CAPTURE mission against the unowned outpost at [1:1:12] — shows up as a
    // TRAVELING fleet in the UI, resolvable once arrivalTime passes (use
    // scripts/fast-forward.ts to skip ahead).
    const fleetCount: bigint = await nexusGame.getPlayerFleetCount(alice.address);
    if (fleetCount === 0n) {
      const tx = await nexusGame.connect(alice).dispatchFleet(
        alicePlanet,
        ships13({ [Ship.LightFighter]: 10, [Ship.SmallCargo]: 2 }),
        [1, 1, 12],
        MISSION_CAPTURE,
        0, 0, 0,
      );
      await tx.wait();
      console.log("  Alice: fleet dispatched → CAPTURE outpost [1:1:12] (fast-forward to resolve)");
    } else {
      console.log(`  Alice: already has ${fleetCount} fleet(s) — skipping dispatch`);
    }
  } finally {
    // ---- always close the backdoor ----
    await (await gameState.setManager(alice.address, false)).wait();
  }

  console.log("\nSeed complete. Play as Alice (hardhat account #0) via `npm run dev:local` in frontend/.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
