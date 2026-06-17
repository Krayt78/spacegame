// PAPI-based deployer for the Nexus Protocol contract suite on paseo-next-v2.
//
// Ported from dotrivals/web/deploy-papi.mjs (the proven next-v2 flow). Why not
// hardhat/eth-rpc: next-v2 runs a custom runtime (next-asset-hub-paseo) whose
// pallet-revive metadata no stock eth-rpc binary matches — every
// eth_call/eth_estimateGas/deploy fails with "Metadata error". PAPI fetches
// metadata dynamically, so it has no codegen mismatch. We submit
// Revive.instantiate_with_code directly, signed by the well-known //Alice
// sr25519 key (funded + revive-mapped on next-v2; checked 2026-06-12:
// ~7592 PAS, mapped).
//
// Deploy graph (mirrors contracts/scripts/deploy.ts):
//   GameConfig() → GameState impl() → ERC1967Proxy(impl, initialize()) →
//   NexusGame(state, config) → PlanetManager/ShipManager(game, state, config) →
//   CombatEngine(config) → FleetResolver(state, config, combat) →
//   FleetManager(game, state, config, resolver) →
//   ResearchManager/DefenseManager/TutorialManager(game, state, config)
// then wiring: NexusGame.updateManagers + setResearchManager +
// setDefenseManager + setTutorialManager, GameState.setManager(x, true) ×7.
//
// Modes (argv[2]):
//   dry     — dry-run GameConfig + GameState + proxy instantiates with
//             placeholder addrs, encode-validate txs. Read-only, no submit.
//   deploy  — the real thing. Dry-runs before EVERY submit (fresh weights +
//             real ctor addresses). Writes contracts/deployments/next-v2.json.
//
// Run from frontend/ (module resolution): node scripts/deploy-contracts-nextv2.mjs dry

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient, AccountId } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { getPolkadotSigner } from "polkadot-api/signer";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";
import { encodeAbiParameters, encodeFunctionData, fromHex } from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS = resolve(__dirname, "../../contracts");
// Asset Hub substrate WS. Default = Summit Network AH. Override with
// ASSET_HUB_WS (or the legacy NEXT_WS_URL) to target another chain.
const WS = process.env.ASSET_HUB_WS ?? process.env.NEXT_WS_URL ?? "wss://summit-asset-hub-rpc.polkadot.io";
const MODE = process.argv[2] ?? "dry";
const NETWORK = process.env.DEPLOY_NETWORK ?? "summit";
// Optional genesis assertion (e.g. EXPECT_GENESIS=0xbf0488… for next-v2).
// Unset = accept whatever chain WS points at.
const EXPECT_GENESIS = process.env.EXPECT_GENESIS ?? "";

// Dry-runs pass gas_limit = undefined (None → runtime uses block max).
// Any finite cap risks a phantom OutOfGas: GameConfig's EVM-interpreter
// instantiate needs proof_size ~6.9M, more than the "obvious" 5M cap.
//
// For SUBMISSION, weight_limit must fit the per-extrinsic ceiling
// (queried live 2026-06-12: ref_time 1.6T, proof 8_388_608 — next-v2 runs
// 10MB-PoV blocks, so big EVM instantiates fit where previewnet's ~3.5M
// budget wouldn't).
const MAX_EXTRINSIC = { ref_time: 1_599_875_000_000n, proof_size: 8_388_608n };
const clampWeight = (wr) => ({
  ref_time: wr.ref_time * 2n > MAX_EXTRINSIC.ref_time ? MAX_EXTRINSIC.ref_time : wr.ref_time * 2n,
  proof_size: (wr.proof_size * 12n) / 10n > MAX_EXTRINSIC.proof_size
    ? MAX_EXTRINSIC.proof_size
    : (wr.proof_size * 12n) / 10n,
});
const ONE_PAS = 10_000_000_000n; // 10 decimals

const log = (...a) => console.log(...a);
const bigintReplacer = (_k, v) => (typeof v === "bigint" ? v.toString() : v);

function loadArtifact(relPath, name) {
  const p = resolve(CONTRACTS, `artifacts/${relPath}/${name}.json`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { name, abi: j.abi, code: fromHex(j.bytecode, "bytes") };
}

const A = {
  GameConfig: loadArtifact("contracts/GameConfig.sol", "GameConfig"),
  GameState: loadArtifact("contracts/GameState.sol", "GameState"),
  ERC1967Proxy: loadArtifact("@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol", "ERC1967Proxy"),
  NexusGame: loadArtifact("contracts/NexusGame.sol", "NexusGame"),
  PlanetManager: loadArtifact("contracts/PlanetManager.sol", "PlanetManager"),
  ShipManager: loadArtifact("contracts/ShipManager.sol", "ShipManager"),
  CombatEngine: loadArtifact("contracts/CombatEngine.sol", "CombatEngine"),
  FleetResolver: loadArtifact("contracts/FleetResolver.sol", "FleetResolver"),
  FleetManager: loadArtifact("contracts/FleetManager.sol", "FleetManager"),
  ResearchManager: loadArtifact("contracts/ResearchManager.sol", "ResearchManager"),
  DefenseManager: loadArtifact("contracts/DefenseManager.sol", "DefenseManager"),
  TutorialManager: loadArtifact("contracts/TutorialManager.sol", "TutorialManager"),
};

// Deployer key: MNEMONIC env (sr25519, bare account, no derivation path) if set,
// else the well-known //Alice — dev/local only, NOT funded on summit. Whatever
// is chosen, fund the SS58 printed at startup on the target Asset Hub.
function makeSigner() {
  const phrase = process.env.MNEMONIC?.trim();
  if (phrase) {
    const mini = entropyToMiniSecret(mnemonicToEntropy(phrase));
    const kp = sr25519CreateDerive(mini)("");
    return { signer: getPolkadotSigner(kp.publicKey, "Sr25519", kp.sign), pub: kp.publicKey, label: "MNEMONIC" };
  }
  const mini = entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE));
  const alice = sr25519CreateDerive(mini)("//Alice");
  return { signer: getPolkadotSigner(alice.publicKey, "Sr25519", alice.sign), pub: alice.publicKey, label: "//Alice (dev)" };
}
const { signer: SIGNER, pub: DEPLOYER_PUB, label: DEPLOYER_LABEL } = makeSigner();
const DEPLOYER_SS58 = AccountId().dec(DEPLOYER_PUB);

// EVM deployment convention: constructor args are ABI-encoded and APPENDED to
// the init bytecode; the separate revive `data` field must stay empty or the
// runtime rejects with EvmConstructorNonEmptyData.
const withCtor = (artifact, types, args) => {
  if (!types.length) return artifact.code;
  const argBytes = fromHex(encodeAbiParameters(types.map((t) => ({ type: t })), args), "bytes");
  const out = new Uint8Array(artifact.code.length + argBytes.length);
  out.set(artifact.code, 0);
  out.set(argBytes, artifact.code.length);
  return out;
};
const NO_DATA = new Uint8Array();

async function main() {
  const client = createClient(getWsProvider(WS));
  const api = client.getUnsafeApi();
  const signer = SIGNER;

  async function dryInstantiate(label, initCode) {
    const res = await api.apis.ReviveApi.instantiate(
      DEPLOYER_SS58, 0n, undefined, undefined, { type: "Upload", value: initCode }, NO_DATA, undefined,
    );
    if (!res?.result?.success) {
      throw new Error(`${label} instantiate dry-run FAILED: ${JSON.stringify(res?.result?.value, bigintReplacer)}`);
    }
    const ret = res.result.value;
    const addr = ret.addr ?? ret.account_id ?? ret.account;
    const wr = res.weight_required;
    if (wr.proof_size > MAX_EXTRINSIC.proof_size || wr.ref_time > MAX_EXTRINSIC.ref_time) {
      throw new Error(`${label} needs ${JSON.stringify(wr, bigintReplacer)} — exceeds per-extrinsic max ${JSON.stringify(MAX_EXTRINSIC, bigintReplacer)}`);
    }
    const weight = clampWeight(wr);
    const sd = res.storage_deposit;
    const rawDeposit = sd?.type === "Charge" ? sd.value : 0n;
    const depositLimit = rawDeposit * 3n > 100n * ONE_PAS ? rawDeposit * 3n : 100n * ONE_PAS;
    log(`  [dry] ${label}: addr=${addr} ref_time=${wr.ref_time} proof=${wr.proof_size} deposit=${rawDeposit}`);
    return { addr, weight, depositLimit };
  }

  async function dryCall(label, dest, data) {
    const res = await api.apis.ReviveApi.call(DEPLOYER_SS58, dest, 0n, undefined, undefined, data);
    if (!res?.result?.success) {
      throw new Error(`${label} call dry-run FAILED: ${JSON.stringify(res?.result?.value, bigintReplacer)}`);
    }
    const weight = clampWeight(res.weight_required);
    const sd = res.storage_deposit;
    const rawDeposit = sd?.type === "Charge" ? sd.value : 0n;
    const depositLimit = rawDeposit * 3n > ONE_PAS ? rawDeposit * 3n : ONE_PAS;
    return { weight, depositLimit };
  }

  async function submitInstantiate(label, initCode) {
    const d = await dryInstantiate(label, initCode);
    const r = await api.tx.Revive.instantiate_with_code({
      value: 0n, weight_limit: d.weight, storage_deposit_limit: d.depositLimit,
      code: initCode, data: NO_DATA, salt: undefined,
    }).signAndSubmit(signer);
    if (!r.ok) throw new Error(`${label} instantiate failed: ${JSON.stringify(r.dispatchError, bigintReplacer)}`);
    const ev = r.events.find(
      (e) => e.type === "Revive" && (e.value?.type === "Instantiated" || e.value?.type === "ContractInstantiated"),
    );
    const addr = ev?.value?.value?.contract ?? ev?.value?.value?.address ?? ev?.value?.value?.account ?? d.addr;
    log(`  ✓ ${label} = ${addr}`);
    return addr;
  }

  async function submitCall(label, dest, abi, functionName, args) {
    const data = fromHex(encodeFunctionData({ abi, functionName, args }), "bytes");
    const d = await dryCall(label, dest, data);
    const r = await api.tx.Revive.call({
      dest, value: 0n, weight_limit: d.weight, storage_deposit_limit: d.depositLimit, data,
    }).signAndSubmit(signer);
    if (!r.ok) throw new Error(`${label} failed: ${JSON.stringify(r.dispatchError, bigintReplacer)}`);
    log(`  ✓ ${label}`);
  }

  // Sanity: chain + funds.
  const genesis = await client._request("chainSpec_v1_genesisHash", []).catch(() => "?");
  const acct = await api.query.System.Account.getValue(DEPLOYER_SS58);
  const freePas = Number(acct.data.free) / 1e10;
  log(`network: ${NETWORK}  genesis: ${genesis}`);
  log(`deployer ${DEPLOYER_LABEL} ${DEPLOYER_SS58}: free=${freePas} PAS nonce=${acct.nonce}\n`);
  if (EXPECT_GENESIS && !String(genesis).startsWith(EXPECT_GENESIS)) {
    throw new Error(`unexpected genesis ${genesis} — EXPECT_GENESIS=${EXPECT_GENESIS}`);
  }
  if (MODE === "deploy" && acct.data.free === 0n) {
    throw new Error(`deployer ${DEPLOYER_SS58} has 0 PAS on ${NETWORK} (${WS}) — fund it from the faucet first.`);
  }

  const initData = fromHex(encodeFunctionData({ abi: A.GameState.abi, functionName: "initialize", args: [] }), "bytes");

  if (MODE === "dry") {
    // Validate the EVM-bytecode + ctor-encoding path without submitting.
    // Placeholder addr for chained ctors (encode/gas validation only).
    const cfg = await dryInstantiate("GameConfig", A.GameConfig.code);
    const impl = await dryInstantiate("GameState(impl)", A.GameState.code);
    await dryInstantiate("ERC1967Proxy(GameState)",
      withCtor(A.ERC1967Proxy, ["address", "bytes"], [impl.addr, `0x${Buffer.from(initData).toString("hex")}`]));
    await dryInstantiate("NexusGame",
      withCtor(A.NexusGame, ["address", "address"], [impl.addr, cfg.addr]));
    // The two heavyweights (per CLAUDE.md FleetResolver is at 96% of the
    // EVM 24KB limit) — make sure their instantiates fit the extrinsic cap.
    await dryInstantiate("FleetResolver",
      withCtor(A.FleetResolver, ["address", "address", "address"], [impl.addr, cfg.addr, impl.addr]));
    await dryInstantiate("FleetManager",
      withCtor(A.FleetManager, ["address", "address", "address", "address"], [impl.addr, impl.addr, cfg.addr, impl.addr]));
    // Encode-validate one instantiate + one call tx so field-name drift surfaces now.
    const t1 = api.tx.Revive.instantiate_with_code({
      value: 0n, weight_limit: cfg.weight, storage_deposit_limit: cfg.depositLimit,
      code: A.GameConfig.code, data: NO_DATA, salt: undefined,
    });
    const t2 = api.tx.Revive.call({
      dest: cfg.addr, value: 0n, weight_limit: cfg.weight, storage_deposit_limit: ONE_PAS, data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    });
    for (const [n, t] of [["instantiate", t1], ["call", t2]]) {
      const enc = await t.getEncodedData();
      const bytes = typeof enc?.asBytes === "function" ? enc.asBytes() : enc;
      log(`  encoded ${n} tx OK (${bytes.length} bytes)`);
    }
    log("\nDRY OK — EVM bytecode accepted, encodings valid. Re-run with `deploy` to submit.");
    client.destroy();
    return;
  }

  if (MODE !== "deploy") throw new Error(`unknown mode ${MODE}`);

  // ============ deploy: SUBMITS ============
  log("[1/12] GameConfig");
  const gameConfig = await submitInstantiate("GameConfig", A.GameConfig.code);
  log("[2/12] GameState (implementation)");
  const gameStateImpl = await submitInstantiate("GameState(impl)", A.GameState.code);
  log("[3/12] ERC1967Proxy(GameState, initialize)");
  const gameState = await submitInstantiate("GameState(proxy)",
    withCtor(A.ERC1967Proxy, ["address", "bytes"], [gameStateImpl, `0x${Buffer.from(initData).toString("hex")}`]));
  log("[4/12] NexusGame(state, config)");
  const nexusGame = await submitInstantiate("NexusGame",
    withCtor(A.NexusGame, ["address", "address"], [gameState, gameConfig]));
  log("[5/12] PlanetManager");
  const planetManager = await submitInstantiate("PlanetManager",
    withCtor(A.PlanetManager, ["address", "address", "address"], [nexusGame, gameState, gameConfig]));
  log("[6/12] ShipManager");
  const shipManager = await submitInstantiate("ShipManager",
    withCtor(A.ShipManager, ["address", "address", "address"], [nexusGame, gameState, gameConfig]));
  log("[7/12] CombatEngine(config)");
  const combatEngine = await submitInstantiate("CombatEngine",
    withCtor(A.CombatEngine, ["address"], [gameConfig]));
  log("[8/12] FleetResolver(state, config, combat)");
  const fleetResolver = await submitInstantiate("FleetResolver",
    withCtor(A.FleetResolver, ["address", "address", "address"], [gameState, gameConfig, combatEngine]));
  log("[9/12] FleetManager(game, state, config, resolver)");
  const fleetManager = await submitInstantiate("FleetManager",
    withCtor(A.FleetManager, ["address", "address", "address", "address"], [nexusGame, gameState, gameConfig, fleetResolver]));
  log("[10/12] ResearchManager");
  const researchManager = await submitInstantiate("ResearchManager",
    withCtor(A.ResearchManager, ["address", "address", "address"], [nexusGame, gameState, gameConfig]));
  log("[11/12] DefenseManager");
  const defenseManager = await submitInstantiate("DefenseManager",
    withCtor(A.DefenseManager, ["address", "address", "address"], [nexusGame, gameState, gameConfig]));
  log("[12/12] TutorialManager");
  const tutorialManager = await submitInstantiate("TutorialManager",
    withCtor(A.TutorialManager, ["address", "address", "address"], [nexusGame, gameState, gameConfig]));

  log("\nWiring NexusGame…");
  await submitCall("NexusGame.updateManagers", nexusGame, A.NexusGame.abi, "updateManagers",
    [planetManager, shipManager, fleetManager]);
  await submitCall("NexusGame.setResearchManager", nexusGame, A.NexusGame.abi, "setResearchManager", [researchManager]);
  await submitCall("NexusGame.setDefenseManager", nexusGame, A.NexusGame.abi, "setDefenseManager", [defenseManager]);
  await submitCall("NexusGame.setTutorialManager", nexusGame, A.NexusGame.abi, "setTutorialManager", [tutorialManager]);

  log("Authorizing managers in GameState…");
  for (const [label, addr] of [
    ["PlanetManager", planetManager], ["ShipManager", shipManager], ["FleetManager", fleetManager],
    ["FleetResolver", fleetResolver], ["ResearchManager", researchManager],
    ["DefenseManager", defenseManager], ["TutorialManager", tutorialManager],
  ]) {
    await submitCall(`GameState.setManager(${label})`, gameState, A.GameState.abi, "setManager", [addr, true]);
  }

  const deployments = {
    network: NETWORK,
    rpc: WS,
    genesis,
    deployer: DEPLOYER_SS58,
    contracts: {
      GameConfig: gameConfig,
      GameState: gameState,
      GameStateImplementation: gameStateImpl,
      NexusGame: nexusGame,
      PlanetManager: planetManager,
      ShipManager: shipManager,
      CombatEngine: combatEngine,
      FleetResolver: fleetResolver,
      FleetManager: fleetManager,
      ResearchManager: researchManager,
      DefenseManager: defenseManager,
      TutorialManager: tutorialManager,
    },
    deployedAt: new Date().toISOString(),
  };
  mkdirSync(resolve(CONTRACTS, "deployments"), { recursive: true });
  const outPath = resolve(CONTRACTS, `deployments/${NETWORK}.json`);
  writeFileSync(outPath, JSON.stringify(deployments, null, 2) + "\n");
  log(`\nWrote ${outPath}`);
  log(JSON.stringify(deployments, null, 2));
  client.destroy();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERROR:", e?.message ?? e);
    process.exit(1);
  });
