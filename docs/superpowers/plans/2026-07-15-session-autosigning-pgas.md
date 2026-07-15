# Session Autosigning with PGAS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pallet-proxy session path with registry sessions so a player signs once, then plays silently and fee-free with zero native PAS.

**Architecture:** A new Solidity `SessionRegistry` maps session keys → owners. `NexusGame` (the router, and the only contract that reads `msg.sender` for identity) resolves every caller through it at 13 call sites; nothing below the router changes. The frontend drops `Proxy.proxy` and signs plain `Revive.call` with a local session key, which is fee-free under the runtime's `ChargePGAS` filter.

**Tech Stack:** Hardhat + Solidity 0.8.24, ethers v6, chai. Next.js 16 + React 19, polkadot-api (PAPI), `@parity/product-sdk-{keys,local-storage,contracts,tx,host}`, viem (`encodeFunctionData` only).

**Spec:** `docs/superpowers/specs/2026-07-15-session-autosigning-pgas-design.md`

## Global Constraints

- Branch: `session-autosigning-pgas`. Never commit to `main` or `trinity-version`.
- Target chain: `paseo-next-v2` Asset Hub, `wss://paseo-asset-hub-next-rpc.polkadot.io`, genesis `0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f`.
- PGAS asset id: `2_000_000_000` — **a JS `number`, not a bigint**. It's a `u32`. Passing `2_000_000_000n` makes papi throw `Incompatible runtime entry Storage(Assets.Asset)`, which reads like a stale-descriptor problem and is not. (Verified in Task 1.)
- PGAS ERC-20 precompile: `0x7735940000000000000000000000000001200000` — **confirmed live** in Task 1: its `totalSupply()` equals `Assets.Asset` supply.

**`ReviveApi.call` calling convention** (from `.papi/descriptors/dist/hub.d.ts`, confirmed live in Task 1). Getting any of these wrong yields the same misleading `Incompatible runtime entry RuntimeCall(ReviveApi_call)`:

```
call(origin: SS58String,      // ss58 string
     dest: SizedHex<20>,      // HEX STRING — not Binary, not bytes
     value: bigint,
     gas_limit, storage_deposit_limit,
     input_data: Uint8Array,  // RAW Uint8Array — not Binary
     { at: 'best' })
```

- **Compare SS58 addresses by public key bytes, never as strings.** This chain returns accounts at prefix 0; our keys default to prefix 42, so string equality gives false negatives on the same account. Use `ss58Decode(a).publicKey` from `@parity/product-sdk-address`. (Task 1 hit this.)
- **Read at `{ at: 'best' }` when comparing against a dry-run.** Storage defaults to *finalized*; `ReviveApi.call` runs at *best*. PGAS burns on use, so mixing the two flakes intermittently. (Task 1 hit this.)
- `Revive.OriginalAccount` is keyed by **H160**, not SS58; value is the SS58 account. Derive with `ss58ToH160()` from `@parity/product-sdk-address` — verified against live entries in Task 1.
- PGAS has **no asset metadata set**: `Assets.Metadata(2_000_000_000)` returns empty name/symbol and `decimals = 0`. Balances are therefore displayed raw.
- PGAS claim amount: **always read from chain** (`Pgas.PgasClaimAmount`). Never hardcode.
- `SESSION_PGAS` funding = **20% of the on-chain claim amount**, computed at setup time.
- Product account derivation index: `PRODUCT_ACCOUNT_INDEX = 0` (`frontend/src/lib/triangle/productIdentifier.ts:36`).
- ChargePGAS is fee-free **only** for `Revive.call` and `Utility` batches where *every* inner call is Revive. One non-Revive call forfeits it for the whole extrinsic.
- `resolve()` returns the account itself when unregistered — **never `address(0)`**.
- EIP-170 bytecode limit is 24,576 B. `FleetResolver` is at 24,281 B (98.8%) — do not add a byte to it.
- All **388** existing contract tests must pass unchanged at every commit. (CLAUDE.md says 304 — that figure is stale; 388 is the measured baseline as of 2026-07-15.)
- Contract tests: `cd contracts && npx hardhat test`. Frontend build: `cd frontend && npm run build`.

---

### Task 1: Live-chain spike — verify AutoMap (GATE) — ✅ DONE, GATE CLOSED (2026-07-15)

This is a **verification spike, not TDD**. It closes the spec's one open risk before any code is built on it. `Revive.map_account` is not a `Revive.call`, so it falls outside `ChargePGAS` — if the product account needs an explicit mapping call, the zero-native premise is broken.

Encouraging prior evidence, already gathered from `frontend/.papi/metadata/hub.scale`: the pallet docs say *"Noop when `Config::AutoMap` is enabled, as accounts are automatically mapped on creation via `AutoMapper`"*. That describes the pallet's capability — this task confirms the **live runtime's config value**.

**Files:**
- Create: `frontend/scripts/verify-pgas.mjs`

**Interfaces:**
- Produces: nothing consumed by later tasks. This is a gate — its verdict decides whether Tasks 2-9 proceed as written.

- [x] **Step 1: Write the spike script**

> **Superseded — the authoritative script is the committed
> `frontend/scripts/verify-pgas.mjs` (`fc7d80e`).** The draft below is kept only
> as a record of what was intended; it contains three bugs the real run found
> and fixed (bigint asset id, `Binary` where `ReviveApi.call` wants a hex string
> and raw bytes, and `OriginalAccount` keyed by SS58 instead of H160). Read the
> committed file, not this. The corrections are folded into Global Constraints.

Create `frontend/scripts/verify-pgas.mjs`:

```js
// Live-chain verification for the PGAS session design. Read-only except for
// the optional AutoMap probe, which needs a funded key.
//
//   node scripts/verify-pgas.mjs                      # read-only checks
//   AUTOMAP_SURI=//Alice node scripts/verify-pgas.mjs # + AutoMap probe
//
// Exits non-zero if a REQUIRED invariant fails.
import { createClient, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { hub } from '@polkadot-api/descriptors';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { AccountId } from 'polkadot-api';

const WS = process.env.NEXT_PUBLIC_HUB_WS_URL ?? 'wss://paseo-asset-hub-next-rpc.polkadot.io';
const PGAS_ASSET = 2_000_000_000n;
const PGAS_ERC20 = '0x7735940000000000000000000000000001200000';

let failed = false;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { failed = true; console.log(`  FAIL  ${m}`); };
const info = (m) => console.log(`  ..    ${m}`);

const client = createClient(getWsProvider(WS));
const api = client.getTypedApi(hub);

console.log(`\nVerifying PGAS design against ${WS}\n`);

// 1. PGAS claim amount is readable from chain (we must never hardcode it).
console.log('1. Pgas.PgasClaimAmount');
let claimAmount;
try {
  claimAmount = await api.constants.Pgas.PgasClaimAmount();
  ok(`claim amount = ${claimAmount}`);
} catch {
  try {
    claimAmount = await api.query.Pgas.PgasClaimAmount.getValue();
    ok(`claim amount (storage) = ${claimAmount}`);
  } catch (e) {
    bad(`could not read PgasClaimAmount: ${e?.message ?? e}`);
  }
}

// 2. PGAS asset exists and is sufficient (holdable with zero native).
console.log('\n2. Assets.Asset(2_000_000_000)');
const asset = await api.query.Assets.Asset.getValue(PGAS_ASSET);
if (!asset) bad('PGAS asset not found');
else {
  ok(`supply=${asset.supply} min_balance=${asset.min_balance} status=${asset.status?.type}`);
  if (asset.is_sufficient === false) bad('PGAS is NOT sufficient — zero-native holding breaks');
  else ok('PGAS is sufficient');
}

// 3. The ERC-20 precompile responds and agrees with pallet-assets.
//    (Descriptor-less getUnsafeApi() fails compat on ReviveApi.call for this
//    chain — use the generated `hub` descriptor, as we do here.)
console.log('\n3. PGAS ERC-20 precompile totalSupply()');
try {
  const result = await api.apis.ReviveApi.call(
    AccountId().enc('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'),
    Binary.fromHex(PGAS_ERC20),
    0n,
    undefined,
    undefined,
    Binary.fromHex('0x18160ddd'), // totalSupply()
  );
  const hex = result?.result?.value?.data?.asHex?.();
  if (!hex) bad(`precompile returned no data: ${JSON.stringify(result?.result?.type)}`);
  else {
    const supply = BigInt(hex);
    ok(`precompile totalSupply = ${supply}`);
    if (asset && supply !== asset.supply) bad(`MISMATCH vs Assets.Asset supply ${asset.supply}`);
    else ok('precompile agrees with Assets.Asset supply');
  }
} catch (e) {
  bad(`ReviveApi.call failed: ${e?.message ?? e}`);
}

// 4. THE GATE: does AutoMap fire on account creation?
//    Creating an account via a plain native transfer triggers OnNewAccount ->
//    AutoMapper. If the fresh account then has a Revive.OriginalAccount entry,
//    AutoMap is on and no explicit (non-free) map_account is ever needed.
console.log('\n4. AutoMap probe (Revive.OriginalAccount on a fresh account)');
const suri = process.env.AUTOMAP_SURI;
if (!suri) {
  info('AUTOMAP_SURI unset — skipping. Re-run with AUTOMAP_SURI=//Alice to close the gate.');
  info('THE GATE IS NOT CLOSED until this probe runs and passes.');
} else {
  const derive = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(
    process.env.AUTOMAP_MNEMONIC ?? 'bottom drive obey lake curtain smoke basket hold race lonely fit walk',
  )));
  const funder = derive(suri);
  const funderSigner = getPolkadotSigner(funder.publicKey, 'Sr25519', async (p) => funder.sign(p));
  const funderSs58 = AccountId().dec(funder.publicKey);

  const fresh = derive(`//probe-${Date.now()}`);
  const freshSs58 = AccountId().dec(fresh.publicKey);
  info(`funder=${funderSs58}`);
  info(`fresh =${freshSs58}`);

  const ed = await api.constants.Balances.ExistentialDeposit();
  await api.tx.Balances.transfer_allow_death({
    dest: { type: 'Id', value: freshSs58 },
    value: ed * 2n,
  }).signAndSubmit(funderSigner);
  info(`funded fresh account with ${ed * 2n}`);

  const mapped = await api.query.Revive.OriginalAccount.getEntries();
  const hit = mapped.some((e) => AccountId().dec(e.value) === freshSs58);
  if (hit) ok('AutoMap IS ON — fresh account auto-mapped, no map_account needed. GATE CLOSED.');
  else bad('AutoMap did NOT fire. Zero-native premise is broken — STOP and re-plan.');
}

console.log(failed ? '\nRESULT: FAILURES — do not proceed.\n' : '\nRESULT: all checks passed.\n');
client.destroy();
process.exit(failed ? 1 : 0);
```

- [x] **Step 2: Run the read-only checks**

```bash
cd frontend && node scripts/verify-pgas.mjs
```

Expected: checks 1-3 PASS — a readable claim amount, PGAS present and sufficient, and a precompile `totalSupply` that matches `Assets.Asset`. Check 4 reports "GATE IS NOT CLOSED".

If check 3 fails, the precompile address in the spec is wrong — stop and re-derive it (asset id `2_000_000_000` as 4 BE bytes ++ 12 zero bytes ++ `0x0120` ++ 2 zero bytes).

- [x] **Step 3: Close the gate with the AutoMap probe** — ✅ **PASSED**

Result recorded 2026-07-15 against `paseo-next-v2` (reproduced across runs):

```
OriginalAccount(fresh) before funding: none
included in block #1719468 ok=true
OriginalAccount(fresh) after funding:  13VJRTgGBiPc1o3gHgevMJapdmNTWSPqkTWJG28sFi8PNYRP
PASS  AutoMap IS ON — fresh account auto-mapped on creation, no map_account
      needed. GATE CLOSED.
```

Also confirmed live: `PgasClaimAmount = 50_000_000_000`; PGAS sufficient with
`min_balance = 10_000_000`, status Live; the ERC-20 precompile's `totalSupply()`
equals `Assets.Asset` supply (**address confirmed**); `ss58ToH160` matches the
chain's `OriginalAccount` keying on every sampled entry.

**Tasks 2-9 proceed as written.**

Needs a key with native PAS on paseo-next-v2. Per `frontend/.env.devnet`, `//Alice` is expected to be funded there.

```bash
cd frontend && AUTOMAP_SURI=//Alice node scripts/verify-pgas.mjs
```

Expected: `PASS  AutoMap IS ON — fresh account auto-mapped, no map_account needed. GATE CLOSED.`

**This is a hard gate.** If it prints `FAIL AutoMap did NOT fire`, **stop and report to the user** — the spec's zero-native premise is broken and Tasks 2-9 need rework before any contract is touched. Do not proceed on the assumption it will work out.

If `//Alice` is unfunded, report that rather than skipping the gate: an unclosed gate is a blocker, not a formality.

- [x] **Step 4: Commit**

```bash
git add frontend/scripts/verify-pgas.mjs
git commit -m "Add live-chain PGAS/AutoMap verification spike

Closes the design's one open risk: map_account isn't ChargePGAS-eligible, so
zero-native play depends on AutoMap firing for the product account."
```

---

### Task 2: SessionRegistry contract — ✅ DONE (2026-07-15)

> **Implemented with one deliberate divergence from the code below:** a
> `isRetiredKey` mapping. The draft (copied from the skill's Rust reference)
> deletes `ownerOf[previous]` on rotation, which makes a retired key
> re-registerable — contradicting the reference's own documented "reject
> reused keys ... even the same owner re-registering a burned key". The TDD
> test caught it. See the committed `contracts/contracts/SessionRegistry.sol`
> and the design doc. Result: 14 tests passing, 986 bytes (4% of EIP-170).

**Files:**
- Create: `contracts/contracts/SessionRegistry.sol`
- Create: `contracts/contracts/ISessionRegistry.sol`
- Test: `contracts/test/SessionRegistry.test.ts`

**Interfaces:**
- Produces: `SessionRegistry` with `registerSession(address)`, `revokeSession()`, `resolve(address) → address`, `isSessionKey(address) → bool`, public mappings `sessionOf(address) → address` and `ownerOf(address) → address`; errors `InvalidSessionKey`, `SessionKeyInUse`, `NoActiveSession`; events `SessionRegistered(address indexed owner, address indexed session)`, `SessionRevoked(address indexed owner, address indexed session)`. `ISessionRegistry` exposes `resolve` and `isSessionKey` — Task 3 consumes it.

- [x] **Step 1: Write the failing tests**

Create `contracts/test/SessionRegistry.test.ts`:

```typescript
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
      await expect(registry.connect(owner).registerSession(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, "InvalidSessionKey");
    });

    it("rejects registering yourself as your own session key", async function () {
      await expect(registry.connect(owner).registerSession(owner.address))
        .to.be.revertedWithCustomError(registry, "InvalidSessionKey");
    });

    it("rejects a key already bound to another owner", async function () {
      await registry.connect(owner).registerSession(session.address);
      await expect(registry.connect(other).registerSession(session.address))
        .to.be.revertedWithCustomError(registry, "SessionKeyInUse");
    });

    it("rejects a burned key even for the same owner (rotation needs a fresh key)", async function () {
      await registry.connect(owner).registerSession(session.address);
      await registry.connect(owner).registerSession(other.address);
      await expect(registry.connect(owner).registerSession(session.address))
        .to.be.revertedWithCustomError(registry, "SessionKeyInUse");
    });

    it("auto-revokes the previous session on re-register (rotation)", async function () {
      await registry.connect(owner).registerSession(session.address);

      await expect(registry.connect(owner).registerSession(other.address))
        .to.emit(registry, "SessionRevoked").withArgs(owner.address, session.address)
        .to.emit(registry, "SessionRegistered").withArgs(owner.address, other.address);

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

      expect(await registry.sessionOf(owner.address)).to.equal(ethers.ZeroAddress);
      expect(await registry.ownerOf(session.address)).to.equal(ethers.ZeroAddress);
      expect(await registry.resolve(session.address)).to.equal(session.address);
      expect(await registry.isSessionKey(session.address)).to.equal(false);
    });

    it("reverts when there is no active session", async function () {
      await expect(registry.connect(owner).revokeSession())
        .to.be.revertedWithCustomError(registry, "NoActiveSession");
    });

    it("only revokes the caller's own session", async function () {
      await registry.connect(owner).registerSession(session.address);
      await expect(registry.connect(stranger).revokeSession())
        .to.be.revertedWithCustomError(registry, "NoActiveSession");
      expect(await registry.resolve(session.address)).to.equal(owner.address);
    });
  });

  describe("resolve", function () {
    // The load-bearing invariant: never return address(0), or callers would
    // silently credit the zero address for any unregistered caller.
    it("resolves an unregistered address to itself", async function () {
      expect(await registry.resolve(stranger.address)).to.equal(stranger.address);
    });

    it("resolves the zero address to itself", async function () {
      expect(await registry.resolve(ethers.ZeroAddress)).to.equal(ethers.ZeroAddress);
    });

    it("resolves an owner (not a session key) to itself", async function () {
      await registry.connect(owner).registerSession(session.address);
      expect(await registry.resolve(owner.address)).to.equal(owner.address);
    });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```bash
cd contracts && npx hardhat test test/SessionRegistry.test.ts
```

Expected: FAIL — `HH701: Artifact for contract "SessionRegistry" not found`.

- [x] **Step 3: Write the interface**

Create `contracts/contracts/ISessionRegistry.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ISessionRegistry
 * @notice Read surface game contracts use to resolve a caller to the player it
 *         acts for. Deliberately minimal: the router only ever reads.
 */
interface ISessionRegistry {
    function resolve(address account) external view returns (address);
    function isSessionKey(address account) external view returns (bool);
}
```

- [x] **Step 4: Write the implementation**

Create `contracts/contracts/SessionRegistry.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SessionRegistry
 * @notice Maps ephemeral session keys to owner accounts so game contracts can
 *         resolve a session-signed caller back to the player it acts for.
 * @dev Solidity port of the reference registry in the session-autosigning skill
 *      (gaming-retreat-2026/.claude/skills/session-autosigning/).
 *
 *      Semantics: one session per owner; re-registering auto-revokes the
 *      previous key; a key ever bound to an owner can never be reused, so
 *      rotation always means a fresh key; sessions live until revoked.
 *
 *      No expiry on-chain — that is per-game policy, and keeping it out holds
 *      the hot path (`resolve`, called on every game action) to one O(1)
 *      lookup. The frontend's client-side expiry is UX hygiene, NOT a security
 *      control: revocation is the only real one.
 *
 *      A session key is a BEARER CREDENTIAL. Anyone holding it can act as the
 *      player until revoked.
 */
contract SessionRegistry {
    /// @notice owner => active session key. address(0) = no active session.
    mapping(address => address) public sessionOf;

    /// @notice session key => owner. address(0) = not a session key.
    mapping(address => address) public ownerOf;

    error InvalidSessionKey();
    error SessionKeyInUse();
    error NoActiveSession();

    event SessionRegistered(address indexed owner, address indexed session);
    event SessionRevoked(address indexed owner, address indexed session);

    /**
     * @notice Register `session` as the caller's session key.
     * @dev Any previous session of the caller is revoked first. A key that has
     *      ever been bound to any owner is rejected.
     */
    function registerSession(address session) external {
        address owner = msg.sender;
        if (session == address(0) || session == owner) revert InvalidSessionKey();
        if (ownerOf[session] != address(0)) revert SessionKeyInUse();

        address previous = sessionOf[owner];
        if (previous != address(0)) {
            delete ownerOf[previous];
            emit SessionRevoked(owner, previous);
        }

        sessionOf[owner] = session;
        ownerOf[session] = owner;
        emit SessionRegistered(owner, session);
    }

    /// @notice Revoke the caller's active session key.
    function revokeSession() external {
        address owner = msg.sender;
        address session = sessionOf[owner];
        if (session == address(0)) revert NoActiveSession();

        delete sessionOf[owner];
        delete ownerOf[session];
        emit SessionRevoked(owner, session);
    }

    /**
     * @notice Resolve an address to the player it acts for.
     * @dev A registered session key resolves to its owner; anything else
     *      resolves to ITSELF.
     *
     *      Never returns address(0). This is load-bearing: it is what lets
     *      plain EOAs keep working unchanged, and what stops a caller silently
     *      crediting the zero address for an unregistered sender.
     */
    function resolve(address account) external view returns (address) {
        address owner = ownerOf[account];
        return owner == address(0) ? account : owner;
    }

    /// @notice True if `account` is currently registered as someone's session key.
    function isSessionKey(address account) external view returns (bool) {
        return ownerOf[account] != address(0);
    }
}
```

- [x] **Step 5: Run tests to verify they pass**

```bash
cd contracts && npx hardhat test test/SessionRegistry.test.ts
```

Expected: PASS — 14 passing.

- [x] **Step 6: Confirm no regression**

```bash
cd contracts && npx hardhat test
```

Expected: 388 + 14 = **402 passing**. Nothing else touches the registry yet.

- [x] **Step 7: Commit**

```bash
git add contracts/contracts/SessionRegistry.sol contracts/contracts/ISessionRegistry.sol contracts/test/SessionRegistry.test.ts
git commit -m "Add SessionRegistry contract

Maps session keys to owners so game contracts can resolve a session-signed
caller back to the player. One session per owner, auto-revoke on re-register,
reused keys rejected, live until revoked.

resolve() returns the account itself when unregistered, never address(0) —
that's what keeps plain EOAs working and stops callers crediting address(0)."
```

---

### Task 3: NexusGame resolves callers through the registry — ✅ DONE (2026-07-15)

> **Result:** 407 passing (388 existing + 14 registry + 5 resolution), zero
> failures. NexusGame 19,358 → 19,744 bytes (80.3% of EIP-170, +386 B — inside
> the predicted 200-500 B). FleetResolver untouched at 98.8%.
>
> **Four corrections the drafted test code below got wrong** (the committed
> `test/SessionResolution.test.ts` is authoritative):
> - `getPlayerPlanetId(address)` lives on **NexusGame**, not GameState
>   (GameState has `getPlayerPlanet`). Existing tests use the router.
> - `BuildingType.NONE = 0`, so building type `0` reverts "Invalid building
>   type" — use `1` (TITANIUM_EXTRACTOR), as existing tests do.
> - `upgradeBuilding` only STARTS a timed upgrade; the level doesn't move until
>   `advanceTime` + `completeUpgrade`. The test now runs the full cycle.
> - **Do not bulk-rewrite `msg.sender` with sed/scripts:** it rewrites the
>   occurrence inside `_player()` itself, producing
>   `resolve(_player())` — infinite recursion on every call. After the swap,
>   exactly two `msg.sender` must remain: `Ownable(msg.sender)` and the one
>   inside `_player()`.

**Files:**
- Modify: `contracts/contracts/NexusGame.sol` (imports, storage, constructor at `:40`, and the 13 `msg.sender` sites at `:102, :109, :116, :130, :139, :153, :162, :176, :185, :199, :217, :246, :534`)
- Modify: `contracts/test/helpers/setup.ts` (`:5-17` interface, `:54-59` NexusGame deploy, `:152` return)
- Test: `contracts/test/SessionResolution.test.ts`

**Interfaces:**
- Consumes: `ISessionRegistry` and `SessionRegistry` from Task 2.
- Produces: `NexusGame` constructor becomes `constructor(address _gameState, address _gameConfig, address _sessionRegistry)`. `NexusGame.sessionRegistry()` → `address` (public immutable). `DeployedContracts` in `test/helpers/setup.ts` gains `sessionRegistry: SessionRegistry`. Tasks 4 and 9 depend on the new constructor arity.

- [x] **Step 1: Write the failing test**

Create `contracts/test/SessionResolution.test.ts`:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts, DeployedContracts, TestSigners } from "./helpers/setup";

// A "session key" here is just another signer acting on the owner's behalf.
describe("Session key resolution through NexusGame", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  it("wires the registry as an immutable on the router", async function () {
    expect(await contracts.nexusGame.sessionRegistry())
      .to.equal(await contracts.sessionRegistry.getAddress());
  });

  it("credits the OWNER when a registered session key acts", async function () {
    const owner = signers.player1;
    const sessionKey = signers.player3;

    // Owner claims a planet with their own key — the plain-EOA path.
    await contracts.nexusGame.connect(owner).claimStarterPlanet("Registry Home");
    const planetId = await contracts.gameState.getPlayerPlanetId(owner.address);
    expect(planetId).to.be.gt(0n);

    // Owner authorizes the session key.
    await contracts.sessionRegistry.connect(owner).registerSession(sessionKey.address);

    // The SESSION KEY acts. The owner's planet must change.
    const before = await contracts.gameState.getBuildingLevel(planetId, 0);
    await contracts.nexusGame.connect(sessionKey).upgradeBuilding(planetId, 0);
    const after = await contracts.gameState.getBuildingLevel(planetId, 0);
    expect(after).to.be.gt(before);

    // ...and the session key itself must own nothing.
    expect(await contracts.gameState.getPlayerPlanetId(sessionKey.address)).to.equal(0n);
  });

  it("rejects an unregistered key acting on someone else's planet", async function () {
    const owner = signers.player1;
    const stranger = signers.player3;

    await contracts.nexusGame.connect(owner).claimStarterPlanet("Not Yours");
    const planetId = await contracts.gameState.getPlayerPlanetId(owner.address);

    await expect(contracts.nexusGame.connect(stranger).upgradeBuilding(planetId, 0))
      .to.be.revertedWith("Not your planet");
  });

  it("stops crediting the owner once the session is revoked", async function () {
    const owner = signers.player1;
    const sessionKey = signers.player3;

    await contracts.nexusGame.connect(owner).claimStarterPlanet("Revoke Me");
    const planetId = await contracts.gameState.getPlayerPlanetId(owner.address);

    await contracts.sessionRegistry.connect(owner).registerSession(sessionKey.address);
    await contracts.nexusGame.connect(sessionKey).upgradeBuilding(planetId, 0);

    await contracts.sessionRegistry.connect(owner).revokeSession();

    // The key now resolves to itself, so ownership checks reject it.
    await expect(contracts.nexusGame.connect(sessionKey).upgradeBuilding(planetId, 0))
      .to.be.revertedWith("Not your planet");
  });

  it("claimStarterPlanet by a session key claims for the OWNER", async function () {
    const owner = signers.player2;
    const sessionKey = signers.player3;

    await contracts.sessionRegistry.connect(owner).registerSession(sessionKey.address);
    await contracts.nexusGame.connect(sessionKey).claimStarterPlanet("Session Claimed");

    expect(await contracts.gameState.getPlayerPlanetId(owner.address)).to.be.gt(0n);
    expect(await contracts.gameState.getPlayerPlanetId(sessionKey.address)).to.equal(0n);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
cd contracts && npx hardhat test test/SessionResolution.test.ts
```

Expected: FAIL — `contracts.sessionRegistry` is undefined and `nexusGame.sessionRegistry` is not a function.

- [x] **Step 3: Add the registry to NexusGame**

In `contracts/contracts/NexusGame.sol`, add the import after the existing `TutorialManager` import (currently line 13):

```solidity
import "./ISessionRegistry.sol";
```

Add the immutable alongside the other contract references (after `TutorialManager public tutorialManager;`, currently line 29):

```solidity
    /**
     * @notice Session registry used to resolve session-signed callers to players.
     * @dev IMMUTABLE ON PURPOSE. A settable registry would let the owner key
     *      repoint caller resolution at a malicious contract and claim any
     *      player's account — a total takeover. The cost of immutability is
     *      that replacing the registry means redeploying the router and every
     *      manager (each holds `router` as an immutable). That trade is
     *      deliberate; see the design doc.
     */
    ISessionRegistry public immutable sessionRegistry;
```

Replace the constructor (currently lines 40-43):

```solidity
    constructor(
        address _gameState,
        address _gameConfig,
        address _sessionRegistry
    ) Ownable(msg.sender) {
        require(_sessionRegistry != address(0), "NexusGame: registry required");
        gameState = GameState(_gameState);
        gameConfig = GameConfig(_gameConfig);
        sessionRegistry = ISessionRegistry(_sessionRegistry);
    }

    /**
     * @notice The player this call acts for.
     * @dev A registered session key resolves to its owner; any other caller
     *      resolves to itself, so plain EOAs behave exactly as before.
     *
     *      Fails closed: if the registry cross-call reverts, this call reverts.
     *      Never assume an unresolvable caller is a main key.
     *
     *      Use this for every identity-bearing entrypoint. Do NOT use it in the
     *      permissionless crank functions (completeResearch, completeUpgrade,
     *      completeShipBuild, completeDefenseBuild, resolveFleet, completeFleet)
     *      — they take their subject from a parameter or from storage and
     *      credit that party, never the caller.
     */
    function _player() internal view returns (address) {
        return sessionRegistry.resolve(msg.sender);
    }
```

- [x] **Step 4: Swap the 13 identity-bearing call sites**

In `contracts/contracts/NexusGame.sol`, replace `msg.sender` with `_player()` at exactly these 13 sites. **Do not touch line 40's `Ownable(msg.sender)`** — that is the deployer, not a player.

| Line | Before | After |
|---|---|---|
| 102 | `planetManager.claimStarterPlanet(msg.sender, planetName);` | `planetManager.claimStarterPlanet(_player(), planetName);` |
| 109 | `planetManager.claimResources(msg.sender, planetId);` | `planetManager.claimResources(_player(), planetId);` |
| 116 | `planetManager.upgradeBuilding(msg.sender, planetId, buildingType);` | `planetManager.upgradeBuilding(_player(), planetId, buildingType);` |
| 130 | `planetManager.cancelUpgrade(msg.sender, planetId);` | `planetManager.cancelUpgrade(_player(), planetId);` |
| 139 | `shipManager.buildShips(msg.sender, planetId, shipType, quantity);` | `shipManager.buildShips(_player(), planetId, shipType, quantity);` |
| 153 | `shipManager.cancelShipBuild(msg.sender, planetId);` | `shipManager.cancelShipBuild(_player(), planetId);` |
| 162 | `defenseManager.buildDefenses(msg.sender, planetId, defenseType, quantity);` | `defenseManager.buildDefenses(_player(), planetId, defenseType, quantity);` |
| 176 | `defenseManager.cancelDefenseBuild(msg.sender, planetId);` | `defenseManager.cancelDefenseBuild(_player(), planetId);` |
| 185 | `researchManager.startResearch(msg.sender, planetId, researchType);` | `researchManager.startResearch(_player(), planetId, researchType);` |
| 199 | `researchManager.cancelResearch(msg.sender, planetId);` | `researchManager.cancelResearch(_player(), planetId);` |
| 217 | `msg.sender,` (arg to `fleetManager.dispatchFleet`) | `_player(),` |
| 246 | `msg.sender,` (arg to `fleetManager.dispatchFleetFromOutpost`) | `_player(),` |
| 534 | `tutorialManager.claimQuest(msg.sender, planetId, questId);` | `tutorialManager.claimQuest(_player(), planetId, questId);` |

Verify none remain:

```bash
cd contracts && grep -n "msg.sender" contracts/NexusGame.sol
```

Expected: exactly one hit — `Ownable(msg.sender)` in the constructor.

- [x] **Step 5: Update the shared test fixture**

All 388 existing tests deploy through this fixture, so it must learn the new constructor.

In `contracts/test/helpers/setup.ts`, add `SessionRegistry` to the typechain import (line 2), then add to the `DeployedContracts` interface (after `tutorialManager: TutorialManager;`, line 16):

```typescript
  sessionRegistry: SessionRegistry;
```

Insert the registry deploy immediately **before** the NexusGame deploy (before line 53's comment), and pass it in:

```typescript
  // Deploy SessionRegistry (must exist before NexusGame — the router holds it
  // as an immutable).
  const SessionRegistryFactory = await ethers.getContractFactory("SessionRegistry");
  const sessionRegistry = await SessionRegistryFactory.deploy();
  await sessionRegistry.waitForDeployment();

  // Deploy NexusGame (Router)
  const NexusGameFactory = await ethers.getContractFactory("NexusGame");
  const nexusGame = await NexusGameFactory.deploy(
    await gameState.getAddress(),
    await gameConfig.getAddress(),
    await sessionRegistry.getAddress()
  );
  await nexusGame.waitForDeployment();
```

Add `sessionRegistry` to the returned `contracts` object (line 152):

```typescript
    contracts: { nexusGame, gameConfig, gameState, planetManager, shipManager, combatEngine, fleetResolver, fleetManager, researchManager, defenseManager, tutorialManager, sessionRegistry },
```

- [x] **Step 6: Run the new tests**

```bash
cd contracts && npx hardhat test test/SessionResolution.test.ts
```

Expected: PASS — 5 passing.

- [x] **Step 7: Run the full suite — the real regression gate**

```bash
cd contracts && npx hardhat test
```

Expected: **407 passing** (388 existing + 14 registry + 5 resolution), zero failures. The 388 exercise the plain-EOA path, which is the guard on `resolve()`'s identity fallback. If any of them fail, `resolve()` is not returning the caller for unregistered addresses — fix that before continuing.

- [x] **Step 8: Check the bytecode budget**

```bash
cd contracts && npx hardhat compile && node -e "
const a = require('./artifacts/contracts/NexusGame.sol/NexusGame.json');
const n = (a.deployedBytecode.length - 2) / 2;
console.log('NexusGame:', n, 'bytes —', ((n / 24576) * 100).toFixed(1) + '% of EIP-170');
console.log(n > 24576 ? 'OVER LIMIT' : 'OK');
"
```

Expected: roughly 19,500-19,900 bytes (~80%), comfortably under. It was 19,358 B (78.8%) before. If it somehow exceeds 24,576, stop and report.

- [x] **Step 9: Commit**

```bash
git add contracts/contracts/NexusGame.sol contracts/test/helpers/setup.ts contracts/test/SessionResolution.test.ts
git commit -m "NexusGame: resolve callers through the SessionRegistry

Swap msg.sender -> _player() at the 13 identity-bearing call sites so a
registered session key acts as its owner. Nothing below the router changes:
managers already take an explicit address player and validate ownership
against it.

Crank functions (completeResearch et al) are deliberately NOT resolved — they
take their subject from a parameter and credit that party, not the caller.

The registry is immutable: a settable one would let the owner key repoint
resolution at a malicious contract and take over any account."
```

---

### Task 4: Deploy script and ABI pipeline — ✅ DONE (2026-07-15)

> **Verified:** local deploy places SessionRegistry before NexusGame and writes
> it to `deployments/latest.json`; `sync-local-env` propagates it to
> `.env.localhost`; `export-abi` emits the exact documented surface; `cdm.json`
> carries `@nexus/session`; frontend typechecks and builds. The paseo-next-v2
> deployer dry-runs clean against the live chain with the 3-arg constructor
> (`DRY OK — EVM bytecode accepted`).
>
> **Notes for later tasks:**
> - The nextv2 deployer needs `ASSET_HUB_WS=wss://paseo-asset-hub-next-rpc.polkadot.io`
>   and `DEPLOY_NETWORK=next-v2` — it defaults to **summit**, and without them it
>   silently hangs connecting to the wrong chain. Task 9 must pass these.
> - `seed-local.ts` needed **no change** — it reads addresses from the
>   deployment JSON rather than constructing NexusGame. Task 9's flagged risk
>   does not materialise; verified by a full seed run.
> - `.env.testnet` is gitignored (it holds a deployer mnemonic), so its
>   `NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS` line is local-only and must be set by
>   hand on each machine. `.env.devnet` is tracked and carries it.

**Files:**
- Modify: `contracts/scripts/deploy.ts` (`:39-45`)
- Modify: `contracts/scripts/exportABI.js` (`:14`)
- Modify: `scripts/deploy-contracts/deploy-nextv2.mjs` (`:101-104` artifact map, plus the NexusGame constructor args and the wiring section)
- Modify: `frontend/scripts/generate-cdm.mjs` (`:31-32`, `:58-59`, `:68-85`)
- Modify: `frontend/src/lib/contracts.ts`
- Modify: `frontend/.env.devnet`, `frontend/.env.testnet`
- Modify: `frontend/scripts/sync-local-env.mjs`

**Interfaces:**
- Consumes: `SessionRegistry` (Task 2), NexusGame's 3-arg constructor (Task 3).
- Produces: `NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS` env var; `SESSION_REGISTRY_ADDRESS` and `sessionRegistryAbi` exported from `frontend/src/lib/contracts.ts`; `@nexus/session` library in `cdm.json`; `SessionRegistry` in `contracts/deployments/*.json`. Tasks 5-7 consume these.

- [x] **Step 1: Deploy the registry before NexusGame**

In `contracts/scripts/deploy.ts`, insert before the NexusGame block (line 39) and update the NexusGame deploy:

```typescript
  // 2b. Deploy SessionRegistry — must precede NexusGame, which holds it as an
  //     immutable. Session keys registered here resolve to their owner in the
  //     router.
  console.log("\n2b. Deploying SessionRegistry...");
  const SessionRegistry = await ethers.getContractFactory("SessionRegistry");
  const sessionRegistry = await SessionRegistry.deploy();
  await sessionRegistry.waitForDeployment();
  const sessionRegistryAddress = await sessionRegistry.getAddress();
  console.log("SessionRegistry deployed to:", sessionRegistryAddress);

  // 3. Deploy NexusGame (Router) with GameState, GameConfig and SessionRegistry
  console.log("\n3. Deploying NexusGame (Router)...");
  const NexusGame = await ethers.getContractFactory("NexusGame");
  const nexusGame = await NexusGame.deploy(
    gameStateAddress,
    gameConfigAddress,
    sessionRegistryAddress
  );
```

Add `SessionRegistry: sessionRegistryAddress,` to the `contracts` object written into the deployments JSON, alongside the existing entries.

- [x] **Step 2: Export the registry ABI**

In `contracts/scripts/exportABI.js`, line 14:

```javascript
const contracts = ['NexusGame', 'GameConfig', 'SessionRegistry'];
```

- [x] **Step 2b: Teach the paseo-next-v2 deployer about the registry**

`scripts/deploy-contracts/deploy-nextv2.mjs` (moved from frontend/ on 2026-07-15) is the **real** deploy path for
paseo-next-v2 (`contracts/scripts/deploy.ts` is hardhat/local). It hardcodes the
deploy order and constructor args, so it will produce a broken deployment against
the 3-arg NexusGame unless updated. Task 9 depends on this.

Read it first — it's ~18KB and has its own conventions (constructor args are
ABI-encoded and **appended to the code blob**, per the note at `:132`):

```bash
sed -n '95,150p' scripts/deploy-contracts/deploy-nextv2.mjs
```

Add `SessionRegistry` to the artifact map alongside the existing entries (`:101-104`):

```javascript
  SessionRegistry: loadArtifact("contracts/SessionRegistry.sol", "SessionRegistry"),
```

Then, following the file's existing deploy-and-encode pattern: deploy
`SessionRegistry` (no constructor args) **before** NexusGame, and append its
address to NexusGame's encoded constructor args, which become
`(gameState, gameConfig, sessionRegistry)`. Update the header comment at `:13-14`
to reflect the new order:

```
//   GameConfig() → GameState impl() → ERC1967Proxy(impl, initialize()) →
//   SessionRegistry() → NexusGame(state, config, sessionRegistry) →
//   PlanetManager/ShipManager(game, state, config) →
```

Also add `SessionRegistry` to whatever the script writes into
`contracts/deployments/next-v2.json`.

Verify with the script's own dry-run mode before spending a real deploy (see the
`dry` mode note at `:22`):

```bash
cd scripts/deploy-contracts && npm run dry
```

Expected: the dry-run resolves all artifacts including `SessionRegistry` and
reports no encoding errors.

- [x] **Step 3: Add the registry to the CDM manifest**

In `frontend/scripts/generate-cdm.mjs`, add alongside the existing address reads (lines 31-32):

```javascript
const sessionRegistryAddress = process.env.NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS;
```

Alongside the existing ABI reads (lines 58-59):

```javascript
const sessionRegistryAbi = readAbi("src/contracts/abi/SessionRegistry.json");
```

Add `"@nexus/session": 0,` to `dependencies`, and to `contracts`:

```javascript
    "@nexus/session": {
      version: 0,
      address: sessionRegistryAddress || ZERO,
      abi: sessionRegistryAbi,
    },
```

Add `session=${short(sessionRegistryAddress)}` to the closing `console.log`.

- [x] **Step 4: Export the address and ABI to the app**

In `frontend/src/lib/contracts.ts`, mirror the existing `NEXUS_GAME_ADDRESS` pattern exactly:

```typescript
import sessionRegistryAbi from '@/contracts/abi/SessionRegistry.json';

export const SESSION_REGISTRY_ADDRESS = process.env
  .NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS as `0x${string}`;
```

Add to the `missingVars` check, to `contractsConfigured`, and to the export list:

```typescript
if (!process.env.NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS) missingVars.push('NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS');
```

```typescript
export { nexusGameAbi, gameConfigAbi, sessionRegistryAbi };
```

- [x] **Step 5: Add the env var**

Add to `frontend/.env.devnet` and `frontend/.env.testnet` (address filled in by Task 9's deploy; `sync-local-env.mjs` fills it for local):

```
# SessionRegistry — session keys resolve to their owner through this contract.
NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS=
```

In `frontend/scripts/sync-local-env.mjs`, add the registry to the `updates` map so a fresh local deploy syncs it too:

```javascript
const updates = {
  NEXT_PUBLIC_NEXUS_GAME_ADDRESS: deployment.contracts.NexusGame,
  NEXT_PUBLIC_GAME_CONFIG_ADDRESS: deployment.contracts.GameConfig,
  NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS: deployment.contracts.SessionRegistry,
};
```

and extend the closing log so a wrong address is visible at a glance:

```javascript
console.log(
  `[sync-local-env] .env.localhost → NexusGame ${updates.NEXT_PUBLIC_NEXUS_GAME_ADDRESS}, ` +
    `GameConfig ${updates.NEXT_PUBLIC_GAME_CONFIG_ADDRESS}, ` +
    `SessionRegistry ${updates.NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS}`,
);
```

The existing loop appends any key missing from `.env.localhost`, so no separate edit to that file is needed.

- [x] **Step 6: Verify the pipeline end-to-end**

```bash
cd contracts && npx hardhat compile && npm run export-abi
ls -la ../frontend/src/contracts/abi/SessionRegistry.json
```

Expected: the file exists and contains `registerSession`, `revokeSession`, `resolve`, `isSessionKey`, `sessionOf`, `ownerOf`.

```bash
cd frontend && NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000001 \
  NEXT_PUBLIC_NEXUS_GAME_ADDRESS=0x64e619ea4d8a593c68533c0feaf3e36d3666495b \
  NEXT_PUBLIC_GAME_CONFIG_ADDRESS=0xa4fe17ea7595fc50e55319f46c54cf8c7b34b3e3 \
  node scripts/generate-cdm.mjs && node -e "
const cdm = require('./cdm.json');
console.log('libraries:', Object.keys(cdm.contracts).join(', '));
console.log('session address:', cdm.contracts['@nexus/session'].address);
"
```

Expected: `libraries: @nexus/game, @nexus/config, @nexus/session` and the session address echoed back.

- [x] **Step 7: Commit**

```bash
git add contracts/scripts/deploy.ts contracts/scripts/exportABI.js frontend/scripts/generate-cdm.mjs frontend/scripts/sync-local-env.mjs frontend/src/lib/contracts.ts frontend/src/contracts/abi/SessionRegistry.json frontend/.env.devnet frontend/.env.testnet
git commit -m "Deploy + ABI pipeline for SessionRegistry

Registry deploys before NexusGame (the router holds it as an immutable) and
flows through export-abi -> cdm.json as @nexus/session."
```

---

### Task 5: Session key module on product-sdk — ✅ DONE (2026-07-15)

> **SDK surface verified against the real .d.ts, and it matches the plan:**
> `SessionKeyManager({ store, name })` with `create/get/getOrCreate/fromMnemonic/clear`,
> returning `{ mnemonic, account }`; `LocalKvStore` has `get/set/remove/getJSON/setJSON`.
>
> **Two deviations from the draft below:**
> - `SessionAccount` is now an alias of the SDK's exported `DerivedAccount`
>   rather than a hand-rolled duplicate — the shapes were identical, and an
>   alias can't drift.
> - `createLocalKvStore` **throws outside a host container** (documented in its
>   .d.ts). All read paths (`getStoredSessionKey`, `getSessionCreatedAt`,
>   `clearSessionKey`) now degrade to null/no-op via a `tryGetStore` helper;
>   only `getOrCreateSessionKey`/`setSessionCreatedAt` propagate, since there
>   the user explicitly asked for a session. This matters for Task 7, which
>   calls `getStoredSessionKey` on the write path.
>
> `toSession()` also lives here (not in useNexusSession) so Task 8's health hook
> can import it without a hook dependency.

Replace the homegrown keypair/`sessionStorage` wallet with `SessionKeyManager` + host KV, so a session survives a page reload.

**Files:**
- Create: `frontend/src/lib/session/sessionKeys.ts`
- Modify: `frontend/package.json`
- Delete: `frontend/src/lib/session/sessionWallet.ts` (in Task 9, once nothing imports it)

**Interfaces:**
- Produces:
  - `SessionAccount = { publicKey: Uint8Array; ss58Address: string; h160Address: \`0x${string}\`; signer: PolkadotSigner }`
  - `NexusSession extends SessionAccount { createdAt: number; expiresAt: number }` — the shape `useNexusSession().session` exposes and `useNexusSessionHealth` consumes. It replaces the old `SessionWalletData`, keeping an `expiresAt` field so the badge's countdown keeps working.
  - `getSessionKeys(): Promise<SessionKeyManager>`
  - `getOrCreateSessionKey(): Promise<SessionAccount>`
  - `getStoredSessionKey(): Promise<SessionAccount | null>`
  - `clearSessionKey(): Promise<void>`
  - `SESSION_EXPIRY_MS: number` (2h), `getSessionCreatedAt(): Promise<number | null>`, `setSessionCreatedAt(ts: number): Promise<void>`
- Tasks 6, 7 and 8 consume these.

- [x] **Step 1: Promote the SDK packages to direct dependencies**

Both are already installed as transitive deps; this makes the dependency explicit.

```bash
cd frontend && npm install --save @parity/product-sdk-keys@0.3.8 @parity/product-sdk-local-storage@0.2.7
```

Expected: `package.json` gains both under `dependencies`, no other version churn.

`@parity/product-sdk-keys@0.3.8` depends on `@polkadot-labs/hdkd` — the **same WASM-free library** `sessionWallet.ts` already used. It does **not** pull `@polkadot/keyring` or `@polkadot/wasm-crypto-wasm`, so the Turbopack octal-escape bug documented at `sessionWallet.ts:25-30` does not apply here.

- [x] **Step 2: Write the module**

Create `frontend/src/lib/session/sessionKeys.ts`:

```typescript
import { createLocalKvStore } from '@parity/product-sdk-local-storage';
import { SessionKeyManager } from '@parity/product-sdk-keys';
import type { PolkadotSigner } from 'polkadot-api';

import { PRODUCT_ACCOUNT_INDEX } from '@/lib/triangle/productIdentifier';

/**
 * Session keys on product-sdk. Replaces the homegrown hdkd + sessionStorage
 * wallet: the mnemonic now lives in host KV (IndexedDB on desktop, plain
 * preferences on Android) so a session survives a page reload — the whole
 * point of "sign once".
 *
 * SECURITY: host KV is durable but NOT a vault, and a session key is a BEARER
 * CREDENTIAL — anyone holding it can act as the player until revoked. Assume a
 * compromised device means a compromised session; on-chain revokeSession() is
 * the recovery story.
 */

const STORE_PREFIX = 'nexus-protocol';
// Namespaced per product-account index so dev multi-account setups don't
// share a session key.
const KEY_NAME = `session-${PRODUCT_ACCOUNT_INDEX}`;
const CREATED_AT_KEY = `${KEY_NAME}-created-at`;

/**
 * Client-side session lifetime. This is UX hygiene, NOT a security control:
 * it cannot bind anyone actually holding the key, it just prompts a re-setup
 * so stale sessions don't linger. Only on-chain revocation is enforcement.
 */
export const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000;

export interface SessionAccount {
  publicKey: Uint8Array;
  ss58Address: string;
  h160Address: `0x${string}`;
  signer: PolkadotSigner;
}

/**
 * A live session: the key plus its client-side lifetime. Replaces the old
 * `SessionWalletData`. `expiresAt` keeps SessionBadge's countdown working —
 * but remember it's UX only; the chain doesn't know about it.
 */
export interface NexusSession extends SessionAccount {
  createdAt: number;
  expiresAt: number;
}

let _store: Awaited<ReturnType<typeof createLocalKvStore>> | null = null;
let _keys: SessionKeyManager | null = null;

async function getStore() {
  if (!_store) _store = await createLocalKvStore({ prefix: STORE_PREFIX });
  return _store;
}

export async function getSessionKeys(): Promise<SessionKeyManager> {
  if (!_keys) {
    _keys = new SessionKeyManager({ store: await getStore(), name: KEY_NAME });
  }
  return _keys;
}

/** Create a session key, or return the existing one. Silent — never prompts. */
export async function getOrCreateSessionKey(): Promise<SessionAccount> {
  const keys = await getSessionKeys();
  // getOrCreate() returns { mnemonic, account } — the useful fields are on
  // .account. Only the mnemonic is persisted.
  const { account } = await keys.getOrCreate();
  return account as SessionAccount;
}

/**
 * The stored session key, or null.
 *
 * NEVER trust this without on-chain validation — a persisted key can outlive
 * its registration (and vice versa). Callers must check
 * registry.sessionOf(owner) against it before use. See useNexusSession.
 */
export async function getStoredSessionKey(): Promise<SessionAccount | null> {
  const keys = await getSessionKeys();
  const stored = await keys.get();
  return (stored?.account as SessionAccount) ?? null;
}

export async function clearSessionKey(): Promise<void> {
  const keys = await getSessionKeys();
  await keys.clear();
  const store = await getStore();
  await store.remove(CREATED_AT_KEY);
}

export async function getSessionCreatedAt(): Promise<number | null> {
  const store = await getStore();
  const raw = await store.get(CREATED_AT_KEY);
  const ts = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(ts) ? ts : null;
}

export async function setSessionCreatedAt(ts: number): Promise<void> {
  const store = await getStore();
  await store.set(CREATED_AT_KEY, String(ts));
}
```

- [x] **Step 3: Verify it typechecks and the KV API matches**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors from `sessionKeys.ts`.

If `store.get`/`set`/`remove` don't exist, inspect the real surface and adapt — do not guess:

```bash
cd frontend && cat node_modules/@parity/product-sdk-local-storage/dist/index.d.ts
cat node_modules/@parity/product-sdk-keys/dist/index.d.ts
```

- [x] **Step 4: Commit**

```bash
git add frontend/src/lib/session/sessionKeys.ts frontend/package.json frontend/package-lock.json
git commit -m "Add session key module on product-sdk keys + host KV

Replaces the homegrown hdkd/sessionStorage wallet. Mnemonic lives in host KV
so a session survives a reload. product-sdk-keys uses the same WASM-free hdkd
library, so the Turbopack octal-escape bug doesn't apply."
```

---

### Task 6: Session lifecycle — PGAS claim, setup batch, restore, teardown — ✅ DONE (2026-07-15)

> **Corrections found while implementing:**
> - `requestResourceAllocation` returns `AllocationOutcome[]` (each with
>   `.tag: "Allocated" | "Rejected" | "NotAvailable"`), **not** the `Result` the
>   skill's recipe implies. Check `outcomes[0].tag === 'Allocated'`.
> - `SmartContractAllowance` **is** a valid variant (`value: number`), but
>   grepping `@parity/product-sdk-host` for it finds NOTHING — the type is
>   codec-derived from `@novasamatech/host-api`
>   (`protocol/v1/resourceAllocation`), which defines
>   StatementStoreAllowance / BulletinAllowance / SmartContractAllowance /
>   AutoSigning. Don't conclude it's missing from a grep; let tsc decide.
> - **`GameHeader.tsx` is a session consumer the Task 8 file list misses.** It
>   used `session?.isReady` (gone — `session` is non-null only after on-chain
>   validation, so presence IS readiness) and carries PAS-specific copy that is
>   now wrong. The type fix landed here; **its copy is Task 8's job.**
> - `usePlayerBalance.ts` mentions sessions only in comments — no coupling.
>
> **Known state at this commit: the tree does NOT typecheck.** `SessionContext`
> still passes `NexusSession` to a health hook typed for `SessionWalletData`.
> Task 8 resolves it. This is the plan's intended sequencing, not an accident.

**Files:**
- Rewrite: `frontend/src/hooks/useNexusSession.ts`
- Create: `frontend/src/lib/session/pgas.ts`

**Interfaces:**
- Consumes: Task 5's `sessionKeys.ts`; Task 4's `SESSION_REGISTRY_ADDRESS` + `sessionRegistryAbi`.
- Produces:
  - `frontend/src/lib/session/pgas.ts`: `PGAS_ASSET_ID = 2_000_000_000` (**number, not bigint**), `PGAS_ERC20 = '0x7735940000000000000000000000000001200000'`, `hexToBytes(hex: string): Uint8Array`, `getPgasBalance(ss58: string): Promise<bigint>`, `getPgasClaimAmount(): Promise<bigint>`, `getSessionFundingAmount(): Promise<bigint>`
  - `readSessionOf(ownerSs58: string): Promise<string | null>` — **exported**, because Task 8's health hook polls it to check registration. Takes SS58 (not H160) and derives the H160 internally; returns null when there's no active session.
  - `useNexusSession(): UseNexusSessionResult` keeps its existing external shape — `{ status, session, isSettingUp, isEnding, error, startSession, endSession }`, `status: 'idle' | 'setup_pending' | 'ready' | 'failed' | 'expired'` — but `session` is now `NexusSession | null` (was `SessionWalletData | null`). `SessionContext` consumes this unchanged.
- Task 7 consumes `getStoredSessionKey`; Task 8 consumes `NexusSession`, `getPgasBalance`, `getSessionFundingAmount` and `readSessionOf`.

- [x] **Step 1: Write the PGAS helper**

Create `frontend/src/lib/session/pgas.ts`:

```typescript
import { getTypedApi } from '@/lib/triangle/chainClient';

/** Hex string → raw bytes. ReviveApi.call wants Uint8Array, not Binary. */
export const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from((hex.slice(2).match(/../g) ?? []).map((b) => parseInt(b, 16)));

/**
 * PGAS: the personhood-gated gas asset. Sufficient (holdable with zero native)
 * and burnable. The runtime's ChargePGAS extension pays fees from a signer's
 * PGAS balance for Revive calls and all-Revive batches ONLY — one non-Revive
 * call in a batch forfeits it for the whole extrinsic.
 */
/**
 * A JS number, NOT a bigint — the asset id is a u32. Passing 2_000_000_000n
 * makes papi throw "Incompatible runtime entry Storage(Assets.Asset)", which
 * looks like a stale-descriptor problem and isn't. (Verified in Task 1.)
 */
export const PGAS_ASSET_ID = 2_000_000_000;

/**
 * PGAS ERC-20 precompile: asset id as 4 BE bytes ++ 12 zero bytes ++ prefix
 * 0x0120 ++ 2 zero bytes. Transfers MUST go through this, not Assets.transfer,
 * which would break the all-Revive rule and forfeit fee-free status.
 *
 * Confirmed live in Task 1: totalSupply() here equals Assets.Asset supply.
 */
export const PGAS_ERC20 = '0x7735940000000000000000000000000001200000' as const;

/** Fraction of the on-chain claim amount moved to the session key. */
const SESSION_FUNDING_RATIO_PCT = 20n;

export async function getPgasBalance(ss58: string): Promise<bigint> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (await getTypedApi()) as any;
  // `at: 'best'` — storage defaults to finalized, which lags the head by ~30s
  // on this chain. A session's PGAS moves at best-block speed, so a finalized
  // read reports stale balances right after setup.
  const account = await api.query.Assets.Account.getValue(PGAS_ASSET_ID, ss58, {
    at: 'best',
  });
  return account?.balance ?? 0n;
}

/** Read from chain — never hardcode; the runtime can change it. */
export async function getPgasClaimAmount(): Promise<bigint> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (await getTypedApi()) as any;
  try {
    return await api.constants.Pgas.PgasClaimAmount();
  } catch {
    return await api.query.Pgas.PgasClaimAmount.getValue();
  }
}

/**
 * How much PGAS to move to the session key. Fees are free, so this funds
 * STORAGE DEPOSITS only — it drains far slower than the old 3-PAS native
 * budget did.
 */
export async function getSessionFundingAmount(): Promise<bigint> {
  const claim = await getPgasClaimAmount();
  return (claim * SESSION_FUNDING_RATIO_PCT) / 100n;
}
```

- [x] **Step 2: Rewrite the session hook**

Replace `frontend/src/hooks/useNexusSession.ts` entirely:

```typescript
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Binary } from 'polkadot-api';
import { encodeFunctionData, erc20Abi, type Abi } from 'viem';
import { requestResourceAllocation } from '@parity/product-sdk-host';
import { ss58ToH160, ss58Decode } from '@parity/product-sdk-address';

import { useTriangle } from '@/hooks/useTriangle';
import { getTypedApi } from '@/lib/triangle/chainClient';
import { PRODUCT_ACCOUNT_INDEX } from '@/lib/triangle/productIdentifier';
import { SESSION_REGISTRY_ADDRESS, sessionRegistryAbi } from '@/lib/contracts';
import { hexToBytes } from '@/lib/session/pgas';
import {
  getOrCreateSessionKey, getStoredSessionKey, clearSessionKey,
  getSessionCreatedAt, setSessionCreatedAt,
  SESSION_EXPIRY_MS, type SessionAccount, type NexusSession,
} from '@/lib/session/sessionKeys';
import {
  PGAS_ERC20, getPgasBalance, getSessionFundingAmount,
} from '@/lib/session/pgas';

// Registry sessions with PGAS-paid (free) fees.
//
// Setup: ONE host prompt for an all-Revive batch_all — which is why it's
// fee-free (ChargePGAS covers Revive calls and all-Revive batches only):
//   1. Revive.call(PGAS_ERC20, transfer(session, SESSION_PGAS))
//   2. Revive.call(REGISTRY,   registerSession(session))
//
// Per write (useNexusContractWrite): zero prompts, zero fees. The session key
// signs a plain Revive.call; NexusGame resolves it to the owner through the
// registry.
//
// This replaces the old pallet_proxy flavor, which could never be fee-free:
// Proxy.proxy sits outside the ChargePGAS filter and add_proxy reserves a
// native deposit.

export type SessionStatus = 'idle' | 'setup_pending' | 'ready' | 'failed' | 'expired';

export interface UseNexusSessionResult {
  status: SessionStatus;
  session: NexusSession | null;
  isSettingUp: boolean;
  isEnding: boolean;
  error: string | null;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
}

/** Attach client-side lifetime to a bare key. */
function toSession(account: SessionAccount, createdAt: number): NexusSession {
  return { ...account, createdAt, expiresAt: createdAt + SESSION_EXPIRY_MS };
}

/**
 * Read registry.sessionOf(owner) via a dry-run — no submission, no fee.
 * Exported: the health hook polls this to detect a broken registration.
 *
 * Takes the owner's SS58 and derives the H160 the contract will see as
 * msg.sender. `ss58ToH160` is the right derivation — Task 1 verified it against
 * the chain's own Revive.OriginalAccount entries.
 *
 * Returns the session key's H160, or null when there is no active session
 * (the registry's zero-address sentinel reads back as 0x000…0).
 */
export async function readSessionOf(ownerSs58: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (await getTypedApi()) as any;
  const ownerH160 = ss58ToH160(ownerSs58);
  const data = encodeFunctionData({
    abi: sessionRegistryAbi as Abi,
    functionName: 'sessionOf',
    args: [ownerH160],
  });
  // Signature confirmed live in Task 1 — see Global Constraints. `dest` is a
  // hex STRING and `input_data` a RAW Uint8Array; passing Binary for either
  // throws "Incompatible runtime entry RuntimeCall(ReviveApi_call)".
  const res = await api.apis.ReviveApi.call(
    ownerSs58,                      // origin: ss58 string
    SESSION_REGISTRY_ADDRESS,       // dest: hex string
    0n,
    undefined,
    undefined,
    hexToBytes(data),               // input_data: raw Uint8Array
    { at: 'best' },
  );
  const raw = res?.result?.value?.data;
  const hex: string | undefined =
    raw?.asHex?.() ??
    (raw instanceof Uint8Array
      ? `0x${Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')}`
      : undefined);
  if (!hex || hex.length < 42) return null;
  // ABI-encoded address: 32 bytes, right-aligned.
  const session = `0x${hex.slice(-40)}`;
  return /^0x0{40}$/.test(session) ? null : session;
}

export function useNexusSession(): UseNexusSessionResult {
  const { ready, address, getSigner } = useTriangle();

  const [session, setSession] = useState<NexusSession | null>(null);
  const [expired, setExpired] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // setState is async, so two near-simultaneous startSession() calls (an
  // effect + a click) could both clear isSettingUp.
  const inFlightRef = useRef(false);

  // Restore: a stored key is only trustworthy if the chain agrees it's
  // registered. A persisted key can outlive its registration and vice versa.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!address) { setSession(null); return; }
      const stored = await getStoredSessionKey();
      if (!stored || cancelled) { setSession(null); return; }

      const createdAt = await getSessionCreatedAt();
      if (!createdAt || Date.now() - createdAt > SESSION_EXPIRY_MS) {
        setExpired(!!createdAt);
        setSession(null);
        return;
      }

      try {
        const onChain = await readSessionOf(address);
        // Compare by bytes, not SS58 strings (prefix differences).
        const matches = onChain?.toLowerCase() === stored.h160Address.toLowerCase();
        if (cancelled) return;
        if (matches) { setSession(toSession(stored, createdAt)); setExpired(false); }
        else {
          console.warn('[nexus.session] stored key is not registered on-chain — clearing');
          await clearSessionKey();
          setSession(null);
        }
      } catch (e) {
        console.warn('[nexus.session] restore validation failed:', e);
        if (!cancelled) setSession(null);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  const status: SessionStatus = session
    ? 'ready'
    : isSettingUp ? 'setup_pending'
    : expired ? 'expired'
    : error ? 'failed'
    : 'idle';

  const startSession = useCallback(async () => {
    if (!ready || !address) { setError('Sign in before starting a session.'); return; }
    if (inFlightRef.current) return;

    const hostSigner = getSigner();
    if (!hostSigner) { setError('Host signer unavailable.'); return; }

    inFlightRef.current = true;
    setIsSettingUp(true);
    setError(null);

    try {
      // 1. PGAS onto the product account. A non-zero balance means the
      //    allowance was already granted — skip the prompt (bloom's trick).
      const balance = await getPgasBalance(address);
      if (balance === 0n) {
        const result = await requestResourceAllocation([
          { tag: 'SmartContractAllowance', value: PRODUCT_ACCOUNT_INDEX },
        ]);
        console.info('[nexus.session] PGAS allocation:', result);
        if (await getPgasBalance(address) === 0n) {
          throw new Error('PGAS allocation did not land — is this account personhood-verified?');
        }
      }

      // 2. Session key (silent).
      const key = await getOrCreateSessionKey();
      console.info('[nexus.session] session key\n  main:   ', address, '\n  session:', key.ss58Address);

      // 3. The one prompt: an all-Revive batch_all, therefore fee-free.
      const funding = await getSessionFundingAmount();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (await getTypedApi()) as any;

      const fundData = encodeFunctionData({
        abi: erc20Abi, functionName: 'transfer',
        args: [key.h160Address, funding],
      });
      const registerData = encodeFunctionData({
        abi: sessionRegistryAbi as Abi, functionName: 'registerSession',
        args: [key.h160Address],
      });

      // dest is SizedHex<20> (a hex string) in the current metadata, not bytes
      // — see the note in useNexusContractWrite. data is Uint8Array.
      const reviveCall = (dest: string, data: string) =>
        api.tx.Revive.call({
          dest,
          value: 0n,
          weight_limit: { ref_time: 500_000_000_000n, proof_size: 2_000_000n },
          storage_deposit_limit: 10_000_000_000n,
          data: Binary.fromHex(data),
        });

      const batch = api.tx.Utility.batch_all({
        calls: [
          reviveCall(PGAS_ERC20, fundData).decodedCall,
          reviveCall(SESSION_REGISTRY_ADDRESS, registerData).decodedCall,
        ],
      });

      type SubmitResult = {
        block?: { number?: number };
        events?: Array<{ type: string; value?: { type?: string } }>;
      };
      const result = (await batch.signAndSubmit(hostSigner)) as SubmitResult;

      const failedEvent = (result.events ?? []).find(
        (e) => e.type === 'System' && e.value?.type === 'ExtrinsicFailed',
      );
      if (failedEvent) throw new Error('Setup batch reverted on-chain.');

      // Confirm the chain agrees before declaring the session usable.
      const onChain = await readSessionOf(address);
      if (onChain?.toLowerCase() !== key.h160Address.toLowerCase()) {
        throw new Error('Setup batch landed but the session is not registered.');
      }

      const createdAt = Date.now();
      await setSessionCreatedAt(createdAt);
      setSession(toSession(key, createdAt));
      setExpired(false);
      console.info(`[nexus.session] ready — block #${result.block?.number ?? '?'}`);
    } catch (e) {
      console.error('[nexus.session] startSession failed:', e);
      setError(e instanceof Error ? e.message : 'Session setup failed.');
      await clearSessionKey();
      setSession(null);
    } finally {
      setIsSettingUp(false);
      inFlightRef.current = false;
    }
  }, [ready, address, getSigner]);

  const endSession = useCallback(async () => {
    if (!address) return;
    setIsEnding(true);
    try {
      const hostSigner = getSigner();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (await getTypedApi()) as any;

      const reviveCall = (dest: string, data: string) =>
        api.tx.Revive.call({
          dest, value: 0n,
          weight_limit: { ref_time: 500_000_000_000n, proof_size: 2_000_000n },
          storage_deposit_limit: 10_000_000_000n,
          data: Binary.fromHex(data),
        });

      // Drain the session's PGAS back (silent, fee-free, session-signed).
      // The account is sufficient-asset-only, so there's no ED to strand.
      if (session) {
        try {
          const remaining = await getPgasBalance(session.ss58Address);
          if (remaining > 0n) {
            const drain = encodeFunctionData({
              abi: erc20Abi, functionName: 'transfer',
              args: [address as `0x${string}`, remaining],
            });
            await reviveCall(PGAS_ERC20, drain).signAndSubmit(session.signer);
          }
        } catch (e) {
          console.warn('[nexus.session] PGAS drain failed; revoking anyway:', e);
        }
      }

      // Sever the on-chain link (one prompt). This is the ONLY real control —
      // it instantly de-authorizes a leaked key.
      if (hostSigner) {
        try {
          const revoke = encodeFunctionData({
            abi: sessionRegistryAbi as Abi, functionName: 'revokeSession', args: [],
          });
          await reviveCall(SESSION_REGISTRY_ADDRESS, revoke).signAndSubmit(hostSigner);
        } catch (e) {
          console.warn('[nexus.session] revokeSession failed; clearing local state anyway:', e);
        }
      }
    } finally {
      await clearSessionKey();
      setSession(null);
      setExpired(false);
      setIsEnding(false);
    }
  }, [address, getSigner, session]);

  return { status, session, isSettingUp, isEnding, error, startSession, endSession };
}
```

- [x] **Step 3: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors from `useNexusSession.ts` or `pgas.ts`. Errors in `useNexusContractWrite.ts` / `SessionBadge.tsx` / `useNexusSessionHealth.ts` about the removed `sessionWallet` exports are **expected here** — Tasks 7 and 8 fix them.

If `requestResourceAllocation`'s signature or the `SmartContractAllowance` tag shape doesn't match, check the real surface rather than guessing:

```bash
cd frontend && cat node_modules/@parity/product-sdk-host/dist/index.d.ts | grep -A 20 "requestResourceAllocation\|SmartContractAllowance"
```

- [x] **Step 4: Commit**

```bash
git add frontend/src/hooks/useNexusSession.ts frontend/src/lib/session/pgas.ts
git commit -m "Session lifecycle: PGAS claim + all-Revive setup batch

One host prompt for an all-Revive batch_all (fee-free under ChargePGAS):
fund the session key via the PGAS ERC-20 precompile, then registerSession.
Restore validates the stored key against registry.sessionOf before trusting
it. Teardown drains PGAS then revokes.

Replaces the pallet_proxy flavor, which couldn't be fee-free."
```

---

### Task 7: Write path — drop the proxy wrapper — ✅ DONE (2026-07-15)

> **Result: 60 insertions, 133 deletions (net −73).** The prediction held —
> registry sessions sign exactly what ContractManager already builds, so the
> ~100-line Proxy branch and its ProxyExecuted decoding collapsed into a
> signer/origin swap.
>
> Also dropped: `Binary` and `encodeFunctionData` imports (only the proxy
> wrapper needed them) and the three `SESSION_REVIVE_*` weight constants — the
> dry-run supplies real values now. Keep `type Abi`: the EVM hook still uses it.
>
> Documented in the hook: `address` is the PLAYER, `origin` is whoever signs;
> they differ exactly when a session is active. The stored key is not
> re-validated on every write (useNexusSession validates on restore, the health
> hook polls) — a mid-session revoke elsewhere surfaces as a loud "Not your
> planet" revert with reason recovery, not silent misattribution.

The payoff task. The old session branch bypassed `ContractManager` **only** to inject the `Proxy` wrapper (`useNexusContractWrite.ts:238`). A registry session signs a plain `Revive.call` — exactly what `ContractManager.prepare()` already builds — so ~100 lines collapse into swapping the signer and origin, and the session path inherits dry-run gas, the best-block nonce fix, revert-reason recovery and the retry classes for free.

**Files:**
- Modify: `frontend/src/hooks/useNexusContractWrite.ts` (delete `:13`, `:21-30`, `:233-336`; edit the call in `:364-384`)

**Interfaces:**
- Consumes: Task 5's `getStoredSessionKey`, `getSessionCreatedAt`, `SESSION_EXPIRY_MS`.
- Produces: no API change — `useNexusContractWrite` keeps its wagmi-shaped `{ hash, isPending, isConfirming, isSuccess, error, reset }`.

- [x] **Step 1: Delete the proxy machinery**

In `frontend/src/hooks/useNexusContractWrite.ts`:

1. Delete the import at line 13 (`getSessionWalletManager`) and the `const sessionManager = ...` at line 30.
2. Delete the three static weight constants and their comment (lines 21-28: `SESSION_REVIVE_REF_TIME`, `SESSION_REVIVE_PROOF_SIZE`, `SESSION_REVIVE_STORAGE_DEPOSIT`). The dry-run supplies real values now, retiring the Sovereignty-defaults guesswork.
3. Delete the entire session branch — from the `// Session path:` comment at line 233 through the closing `}` of `if (useSessionPath && sessionData) { ... }` at line 336. This removes the `Proxy.proxy` construction and the `ProxyExecuted` event decoding.

Add the new import alongside the others:

```typescript
import {
  getStoredSessionKey, getSessionCreatedAt, SESSION_EXPIRY_MS,
} from '@/lib/session/sessionKeys';
```

- [x] **Step 2: Route the session key through the normal path**

Four precise edits in `useNexusContractWriteHost`'s `callImpl`.

**(a)** At line ~205, rename the host signer so the two are distinguishable:

```typescript
      const hostSigner = getSigner();
      if (!hostSigner) {
        setS({ ...idleState, error: new Error('No signer available') });
        return;
      }
```

**(b)** Replace the `justMapped` + `ensureMapped` block (lines ~226-231, the first
thing inside the `try`) with session resolution followed by the same mapping
logic, now keyed on `origin`:

```typescript
        // Session path: a registered session key signs a plain Revive.call and
        // NexusGame resolves it to this player through the registry. That's
        // exactly what ContractManager builds — so unlike the old pallet_proxy
        // flavor, no bypass is needed. Just a different signer and origin, and
        // we inherit dry-run gas sizing, the best-block nonce fix,
        // revert-reason recovery and the retry classes.
        //
        // Limited to '@nexus/game': '@nexus/config' writes are admin-only and
        // don't benefit from prompt-free UX.
        let signer = hostSigner;
        let origin = address;

        if (library === '@nexus/game') {
          const key = await getStoredSessionKey();
          const createdAt = key ? await getSessionCreatedAt() : null;
          const live =
            !!key && !!createdAt && Date.now() - createdAt <= SESSION_EXPIRY_MS;
          if (key && live) {
            signer = key.signer;
            origin = key.ss58Address;
          }
        }

        // Was this origin's first write per process? If so we may have just
        // submitted Revive.map_account and need to retry the dry-run below,
        // because best-block inclusion doesn't always propagate to the runtime
        // API view (`ReviveApi.call`) immediately.
        //
        // With AutoMap on (verified in Task 1) both the product account and the
        // session key are already mapped — the session key auto-maps on
        // receiving PGAS — so this is normally just an idempotent storage read.
        let justMapped = false;
        if (!mappedAddresses.has(origin)) {
          await ensureMapped(origin, signer);
          mappedAddresses.add(origin);
          justMapped = true;
        }
```

**(c)** In the retry block (lines ~372-373), swap `address` for `origin` in both
the dry-run and the submit:

```typescript
              const prepared = await fn.prepare(...args, { origin });
              return await submitWithBestNonce(prepared, signer, origin);
```

**(d)** In the revert-reason recovery below it (line ~390), same swap:

```typescript
            const rerun = await fn.query(...args, { origin });
```

Leave every other use of `address` alone — the "Not signed in" guard and the
`invalidateReads` helper are about the player, not the signer.

- [x] **Step 3: Typecheck and build**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors from `useNexusContractWrite.ts`. Errors remain in `SessionBadge.tsx` / `useNexusSessionHealth.ts` until Task 8.

Confirm the proxy machinery is gone:

```bash
cd frontend && grep -n "Proxy\.proxy\|ProxyExecuted\|SESSION_REVIVE_\|sessionWallet" src/hooks/useNexusContractWrite.ts
```

Expected: no output.

- [x] **Step 4: Commit**

```bash
git add frontend/src/hooks/useNexusContractWrite.ts
git commit -m "Write path: session keys sign plain Revive.call

Registry sessions sign exactly what ContractManager already builds, so the
pallet_proxy bypass and its ProxyExecuted decoding are gone — the session path
is now just a different signer + origin, and inherits dry-run gas sizing, the
best-block nonce fix, revert-reason recovery and the retry classes.

Drops the static SESSION_REVIVE_* weight guesses: the dry-run gives real
values."
```

---

### Task 8: Session UI — PGAS balance and registration health — ✅ DONE (2026-07-15)

> **Typecheck/lint/build green again** — the Task 6-8 type migration is complete.
>
> **A display bug tsc could not catch:** `GameHeader` formatted the session
> balance with `formatPas` (divide by 1e10). That balance is now PGAS with
> decimals = 0, so it would have rendered `0.000` forever while labelled "PAS".
> Both are `bigint`, so only reading the render caught it. Session balance now
> uses viem's `formatUnits(v, pgasDecimals)`; `formatPas` is documented as
> NATIVE-ONLY. Wallet balance legitimately stays PAS.
>
> Dropped the hand-rolled formatter in favour of viem's `formatUnits` (already a
> dependency) rather than duplicating one across two components.
>
> **Copy fixed in two places, not one.** SessionBadge's modal promised a proxy
> deposit and tab-scoped keys; GameHeader claimed "Your own PAS is only needed
> to start a session" and "— needed to start a session". All false now. The
> bearer-credential warning went into the consent modal, which is the spec's
> "carry the security notes into user-facing docs" requirement.

The health hook currently polls `System.Account` (native balance) and
`Proxy.Proxies` (delegation). Both are proxy-era concepts. They become: PGAS
balance, and whether the registry still lists our key.

**Files:**
- Modify: `frontend/src/hooks/useNexusSessionHealth.ts`
- Modify: `frontend/src/contexts/SessionContext.tsx`
- Modify: `frontend/src/components/session/SessionBadge.tsx`
- Modify: `frontend/src/lib/session/pgas.ts` (add `getPgasDecimals`)

**Interfaces:**
- Consumes: Task 6's `NexusSession`, `getPgasBalance`, `getSessionFundingAmount`, `readSessionOf`.
- Produces: `useNexusSessionHealth(session: NexusSession | null): SessionHealth` where
  `SessionHealth = { status: SessionHealthStatus; timeLeftMs: number; balance: bigint | null; registrationOk: boolean | null; actionsLeft: number | null }`
  and `SessionHealthStatus = 'none' | 'restoring' | 'ok' | 'low-time' | 'low-balance' | 'registration-broken' | 'expired'`.
  **Changes from the current shape:** `delegationOk` → `registrationOk`, `'delegation-broken'` → `'registration-broken'`, and `proxyCount` is **removed** (it counted orphan proxy deposits — no analog exists now). `SessionContext.DISABLED_SESSION` must match.
- `getPgasDecimals(): Promise<number>` added to `pgas.ts`.

- [x] **Step 1: Add a decimals reader to pgas.ts**

Append to `frontend/src/lib/session/pgas.ts`:

```typescript
/** PGAS decimals, read from asset metadata — don't hardcode; it's a chain fact. */
export async function getPgasDecimals(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (await getTypedApi()) as any;
  const meta = await api.query.Assets.Metadata.getValue(PGAS_ASSET_ID);
  return meta?.decimals ?? 0;
}
```

- [x] **Step 2: Rewrite the health hook**

Replace `frontend/src/hooks/useNexusSessionHealth.ts` entirely. It keeps the
existing polling/ticking structure — only the two chain reads change:

```typescript
'use client';

import { useEffect, useState } from 'react';

import { useTriangle } from '@/hooks/useTriangle';
import { readSessionOf } from '@/hooks/useNexusSession';
import { getPgasBalance, getSessionFundingAmount } from '@/lib/session/pgas';
import type { NexusSession } from '@/lib/session/sessionKeys';

const POLL_INTERVAL_MS = 10_000;
const TICK_INTERVAL_MS = 1_000;

/**
 * Rough PGAS drawn per action. Fees are FREE under ChargePGAS, so this is
 * storage deposit only — which makes it both small and lumpy (an action that
 * writes no new storage costs nothing). Treat "actions left" as a soft
 * indicator, not a budget.
 *
 * CALIBRATE THIS from the Task 9 end-to-end run: watch the session's PGAS
 * balance across a few upgrades and set it to the observed average.
 */
const APPROX_DEPOSIT_PER_ACTION = 10_000_000n;

export type SessionHealthStatus =
  | 'none'
  | 'restoring'
  | 'ok'
  | 'low-time'
  | 'low-balance'
  | 'registration-broken'
  | 'expired';

export interface SessionHealth {
  status: SessionHealthStatus;
  timeLeftMs: number;
  /** Session's PGAS balance (not native). Funds storage deposits only. */
  balance: bigint | null;
  /** Does the registry still resolve our key to this player? */
  registrationOk: boolean | null;
  actionsLeft: number | null;
}

/**
 * Periodic health monitor for a registry session.
 *
 * Polls every 10s:
 *   - Assets.Account(PGAS, session)  → session's PGAS balance
 *   - registry.sessionOf(main)       → confirms our key is still registered
 *                                      (replaces the old Proxy.Proxies check)
 *
 * Ticks every 1s for a live countdown of the session's local expiry. That
 * expiry is UX only — the chain doesn't enforce it.
 */
export function useNexusSessionHealth(
  session: NexusSession | null,
): SessionHealth {
  const { ready, address } = useTriangle();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [funding, setFunding] = useState<bigint | null>(null);
  const [registrationOk, setRegistrationOk] = useState<boolean | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [session]);

  useEffect(() => {
    if (!session || !address) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const bal = await getPgasBalance(session.ss58Address);
        if (!cancelled) setBalance(bal);
      } catch (err) {
        console.warn('[nexus.sessionHealth] PGAS balance query failed:', err);
        if (!cancelled) setBalance(null);
      }

      try {
        const onChain = await readSessionOf(address);
        // Compare H160 bytes, case-insensitively.
        const ok = onChain?.toLowerCase() === session.h160Address.toLowerCase();
        if (!cancelled) setRegistrationOk(ok);
      } catch (err) {
        console.warn('[nexus.sessionHealth] registry query failed:', err);
        if (!cancelled) setRegistrationOk(null);
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [session, address]);

  // Funding target is a chain constant — fetch once per session.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    getSessionFundingAmount()
      .then((f) => { if (!cancelled) setFunding(f); })
      .catch(() => { if (!cancelled) setFunding(null); });
    return () => { cancelled = true; };
  }, [session]);

  if (!session) {
    return {
      status: ready ? 'none' : 'restoring',
      timeLeftMs: 0,
      balance: null,
      registrationOk: null,
      actionsLeft: null,
    };
  }

  const timeLeftMs = Math.max(0, session.expiresAt - now);
  const actionsLeft =
    balance !== null
      ? Math.max(0, Number(balance / APPROX_DEPOSIT_PER_ACTION))
      : null;

  let status: SessionHealthStatus = 'ok';
  if (timeLeftMs <= 0) status = 'expired';
  else if (registrationOk === false) status = 'registration-broken';
  else if (balance !== null && funding !== null && balance < funding / 5n)
    status = 'low-balance';
  else if (timeLeftMs < 15 * 60 * 1000) status = 'low-time';

  return { status, timeLeftMs, balance, registrationOk, actionsLeft };
}
```

- [x] **Step 3: Update the context's disabled value**

`SessionContext.DISABLED_SESSION` hardcodes the health shape, so it breaks on the
field changes. In `frontend/src/contexts/SessionContext.tsx`, replace the
`health` block inside `DISABLED_SESSION`:

```typescript
  health: {
    status: 'none',
    timeLeftMs: 0,
    balance: null,
    registrationOk: null,
    actionsLeft: null,
  },
```

Also fix the now-stale doc comment above it — it describes `pallet_proxy`:

```typescript
/**
 * Sessions are a HOST-mode feature: a local session key signs game calls
 * directly and NexusGame resolves it to the player through the SessionRegistry,
 * so the host never prompts mid-game and PGAS makes it fee-free. EVM mode has
 * no such concept — the injected wallet signs each tx — so the disabled value
 * below stands in, and the host hooks (which drive a 10s chain poll and depend
 * on `useTriangle`) are never called.
 */
```

- [x] **Step 4: Update the badge**

In `frontend/src/components/session/SessionBadge.tsx`:

1. Replace the `SESSION_FUNDING_AMOUNT` import from `@/lib/session/sessionWallet` with:

```typescript
import { getSessionFundingAmount, getPgasDecimals } from '@/lib/session/pgas';
```

2. Replace the `PAS_DECIMALS` / `formatPas` block with a PGAS formatter. Decimals are a chain fact, so read them rather than hardcoding:

```typescript
function formatUnits(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = ((value % base) * 1000n) / base; // 3 dp
  return `${whole}.${frac.toString().padStart(3, '0')}`;
}
```

3. In `SessionBadgeInner`, fetch decimals once and use them in the tooltip, replacing the `formatPas(health.balance)` call:

```typescript
  const [pgasDecimals, setPgasDecimals] = useState<number | null>(null);
  useEffect(() => { getPgasDecimals().then(setPgasDecimals).catch(() => setPgasDecimals(null)); }, []);
```

```typescript
        title={
          health.balance !== null && pgasDecimals !== null
            ? `${formatUnits(health.balance, pgasDecimals)} PGAS · ~${health.actionsLeft ?? '?'} actions left`
            : undefined
        }
```

4. Update the `degraded` check for the renamed status:

```typescript
  const degraded =
    health.status === 'low-balance' ||
    health.status === 'low-time' ||
    health.status === 'registration-broken';
```

5. Fix the stale comment above the idle branch — sessions restore from host KV now, not `sessionStorage`:

```typescript
  // Hide until we know what to show — avoids a "Start session" flash before
  // the restore + on-chain validation has finished.
```

- [x] **Step 5: Rewrite the confirm modal copy — it is now actively wrong**

`SessionStartConfirm` currently promises a proxy deposit and tab-scoped keys.
Both are false under the new design, and one of them is a security claim. This is
the spec's *"carry the security notes into user-facing docs"* requirement: the
bearer-credential caveat belongs where the user actually consents.

Replace the modal body (heading through the detail list):

```tsx
        <h2 className="font-display text-lg font-bold text-[var(--accent-primary)] mb-3">
          Start free session
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
          Approve one transaction now and every game action for the next 2 hours
          will execute with no prompt and no fees.
        </p>
        <div className="text-xs font-mono text-[var(--text-muted)] mb-5 space-y-1">
          <div>
            <span className="text-[var(--text-secondary)]">Cost:</span> free —
            fees are paid in PGAS, which the host mints for verified persons
          </div>
          <div>
            <span className="text-[var(--text-secondary)]">Native tokens:</span>{' '}
            none needed
          </div>
          <div>
            <span className="text-[var(--text-secondary)]">Duration:</span> 2 hours,
            and the session survives a page reload
          </div>
          <div className="text-[var(--accent-warn)] pt-1 leading-relaxed">
            The session key is stored on this device and can act for you until you
            end the session. Don&apos;t start one on a device you don&apos;t trust.
          </div>
        </div>
```

- [x] **Step 6: Typecheck and build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: both clean. This is the first point where the whole frontend compiles against the new session stack.

Confirm no proxy-era references survive in the session UI:

```bash
cd frontend && grep -rn "delegationOk\|delegation-broken\|proxyCount\|SESSION_FUNDING_AMOUNT\|formatPas" src/
```

Expected: no output.

- [x] **Step 7: Commit**

```bash
git add frontend/src/hooks/useNexusSessionHealth.ts frontend/src/contexts/SessionContext.tsx frontend/src/components/session/SessionBadge.tsx frontend/src/lib/session/pgas.ts
git commit -m "Session UI: PGAS balance and registry registration health

Health now polls the session's PGAS balance and registry.sessionOf instead of
native balance and Proxy.Proxies. delegationOk -> registrationOk; proxyCount
drops (it counted orphan proxy deposits — no analog now).

Rewrites the consent modal, which promised a proxy deposit and tab-scoped
keys — both false now. Adds the bearer-credential caveat where the user
actually consents."
```

---

### Task 9: Delete dead code, deploy, verify end-to-end

**Files:**
- Delete: `frontend/src/lib/session/sessionWallet.ts`
- Modify: `contracts/scripts/seed-local.ts` (only if it constructs NexusGame directly)
- Modify: `frontend/.env.devnet`, `frontend/.env.testnet`, `contracts/deployments/next-v2.json`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 2-8.

- [ ] **Step 1: Delete the old wallet**

```bash
cd frontend && grep -rn "sessionWallet" src/ ; echo "---"
```

Expected: no output. If anything still imports it, fix that first.

```bash
cd frontend && git rm src/lib/session/sessionWallet.ts
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 2: Full contract suite**

```bash
cd contracts && npx hardhat test
```

Expected: **407 passing**, zero failures.

- [ ] **Step 3: Local deploy + seed**

```bash
cd contracts && npx hardhat node --port 8546 &
sleep 5
LOCALHOST_RPC_URL=http://127.0.0.1:8546 npm run deploy:local
LOCALHOST_RPC_URL=http://127.0.0.1:8546 npm run seed:local
```

Expected: deploy logs `SessionRegistry deployed to: 0x…` before `NexusGame deployed to: 0x…`, and the seed completes. If `seed-local.ts` constructs NexusGame directly it will fail on the new 3-arg constructor — fix it to deploy/pass a registry, mirroring `test/helpers/setup.ts`.

- [ ] **Step 4: Verify the local app (EVM mode — no sessions)**

Sessions are host-only: local hardhat has no PGAS, no `Revive` extrinsics, no host. This step proves `resolve()`'s identity fallback keeps plain EOAs working.

```bash
cd frontend && npm run dev:local
```

In the browser: "Play as Alice", then upgrade a building. Expected: it succeeds exactly as before. The session UI should not appear.

- [ ] **Step 5: Deploy to paseo-next-v2**

This uses the deployer updated in Task 4 Step 2b. Dry-run first — a real deploy
costs tokens and a wrong constructor arg means doing the whole cascade again:

```bash
cd scripts/deploy-contracts && npm install
npm run dry
npm run deploy
```

Expected: fresh addresses for all contracts including `SessionRegistry`. Write them into `contracts/deployments/next-v2.json`, then update `NEXT_PUBLIC_NEXUS_GAME_ADDRESS`, `NEXT_PUBLIC_GAME_CONFIG_ADDRESS` and `NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS` in both `frontend/.env.devnet` and `frontend/.env.testnet`.

Per the "fresh deploy" decision this is a clean deploy: player state and tutorial progress from the 2026-06-12 deployment are intentionally not migrated.

- [ ] **Step 6: The end-to-end run — closes the doc's residual gap**

This is the validation the source doc lists as outstanding: *"a full end-to-end run of the setup batch with funded accounts."*

```bash
cd frontend && npm run dev:testnet
```

In the browser, with a personhood-verified product account:

1. Sign in. Start a session. Expect **exactly one** host prompt for the setup batch (plus one for the PGAS claim if this account has never claimed).
2. Confirm the batch succeeded and PGAS landed on the session key.
3. Play several actions — upgrade a building, build ships, start research. Expect **zero prompts** and **zero fees**.
4. Reload the page. Expect the session to resume with **no prompt** (host KV + on-chain validation).
5. End the session. Expect the PGAS drain to be silent and one prompt for `revokeSession`.
6. Try one more action. Expect it to fall back to the host-signed path (prompting), because the key no longer resolves.

Record the observed result — including a failure — rather than assuming. If any step prompts or charges when it shouldn't, that is a finding to report, not to work around.

- [ ] **Step 7: Update CLAUDE.md**

In the "Key Architecture Decisions" section, replace the stale contract count and record the session model:

```markdown
- `contracts/` — Hardhat + Solidity (12 contracts, 407 tests)
- SessionRegistry.sol maps session keys to owners; NexusGame resolves every
  identity-bearing caller through it via `_player()`, so a session key acts as
  the player. The registry is immutable on the router — replacing it means
  redeploying the router and every manager (each holds `router` as immutable).
- Sessions are PGAS-funded and fee-free (ChargePGAS covers Revive calls and
  all-Revive batches only). Host mode only; local/EVM mode signs directly.
```

- [ ] **Step 8: Commit and push**

```bash
git add -A
git commit -m "Remove pallet-proxy session wallet; deploy registry sessions

Deletes the homegrown session wallet. Fresh deploy of the registry, router and
all 7 managers on paseo-next-v2 (router is immutable in every manager, so the
redeploy cascades)."
git push -u origin session-autosigning-pgas
```

---

## Notes for the implementer

**Task 1 is a gate, not a formality.** If AutoMap doesn't fire, the zero-native premise is broken and Tasks 2-9 need rework. Report it; don't route around it.

**The 388 existing tests are the real safety net** for Task 3. They exercise the plain-EOA path, which is exactly what `resolve()`'s identity fallback must preserve. If they fail, the fallback is wrong.

**Don't touch FleetResolver.** It's at 24,281 of 24,576 bytes (98.8%) — 295 bytes from the limit. It contains no `msg.sender` and needs nothing from this work.

**Two known-stale items this plan deliberately doesn't fix** (flagged during design, tracked separately): `FleetResolver` needs a bytecode split before any unrelated fleet work, and `TutorialManager` holds its own storage in violation of the "managers never have their own storage" rule.

**When an SDK surface doesn't match this plan, read the `.d.ts` and adapt** — `product-sdk` is pre-1.0 and moves. The plan's shapes come from the skill's reference recipes, not from executing this exact code against these exact versions.
