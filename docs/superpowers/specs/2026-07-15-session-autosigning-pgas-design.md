# Session Autosigning with PGAS — Design

Date: 2026-07-15
Branch: `session-autosigning-pgas`
Status: Approved, ready for implementation planning

## Goal

One prompt to start playing, then every game action signs silently **and costs
nothing** — no wallet popups mid-game, no native PAS anywhere.

Source material: `gaming-retreat-2026/session-autosigning-with-pgas.md` and its
implementation guide at `gaming-retreat-2026/.claude/skills/session-autosigning/`.

## Starting point: what already exists

Autosigning is **already implemented** in this codebase, in the *proxy* flavor
(ported from Sovereignty):

- `frontend/src/hooks/useNexusSession.ts` — one host prompt batching
  `Balances.transfer_keep_alive(session, 3 PAS)` + `Proxy.add_proxy(Any)`.
- `frontend/src/hooks/useNexusContractWrite.ts:233-336` — per-write, signs
  `Proxy.proxy({ real: main, call: Revive.call(...) })` locally, zero prompts.
- `frontend/src/lib/session/sessionWallet.ts` — homegrown sr25519 keypair via
  `@polkadot-labs/hdkd`, persisted in `sessionStorage`, 2h expiry.

So popups are solved today. What is **not** solved is cost. A player currently
needs roughly **5 native PAS** before they can play (3 PAS session funding +
~2 PAS `add_proxy` deposit), and every action pays a real fee. That is exactly
the "go buy gas tokens first" barrier the design is meant to remove.

Proxy sessions **cannot** be made fee-free: `Proxy.proxy` sits outside the
runtime's `ChargePGAS` filter, and `add_proxy` reserves a native deposit.
Reaching "free" therefore requires migrating to **registry sessions**.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | **Registry sessions**; remove pallet-proxy entirely | Only path to fee-free. The doc's default; proxy is for when contracts can't be touched — ours can. |
| Registry language | **Solidity, in this repo** | Repo is entirely Hardhat/Solidity with 304 tests. The skill's "no ink!" rule targets ink!'s deprecation; Solidity via revive is a first-class PVM target, and NexusGame (Solidity) must call it either way. |
| Live state | **Fresh deploy, re-seed** | Testnet demo world. No migration code, no TutorialManager backfill. |
| Session storage | **Host KV** (`createLocalKvStore`) via `SessionKeyManager` | Survives reload — the UX the feature exists for. |
| Session lifetime | Live-until-revoked on-chain **+ client-side expiry** | Client expiry is UX hygiene that triggers re-setup; it is **not** a security control. Revocation is the real recovery story. |
| Registry expiry logic | **None** | Matches the verified reference; keeps the hot path one O(1) lookup. |

## Chain facts (verified against this repo's metadata, 2026-07-15)

Contracts live on `paseo-next-v2` Asset Hub
(`wss://paseo-asset-hub-next-rpc.polkadot.io`, genesis `0xbf0488…`) — the same
chain the source doc verified against. `.papi/metadata/hub.scale` confirms the
presence of: `AsPgas` signed extension, `Pgas` pallet, `PgasClaimAmount`,
`Assets`, `Revive`, `Utility`, `Proxy`.

| Constant | Value |
|---|---|
| PGAS asset id | `2_000_000_000` |
| PGAS ERC-20 precompile | `0x7735940000000000000000000000000001200000` |
| PGAS claim amount | read from chain (`Pgas.PgasClaimAmount`) — **do not hardcode** |
| Product account derivation index | `PRODUCT_ACCOUNT_INDEX = 0` (`frontend/src/lib/triangle/productIdentifier.ts:36`) |
| ChargePGAS-free calls | `Revive.call` + all-Revive `Utility` batches only |

## Contract design

### New: `contracts/SessionRegistry.sol`

Solidity port of the skill's verified reference. Semantics: one session per
owner, auto-revoke on re-register, reject reused keys, live until revoked.

```solidity
mapping(address => address) public sessionOf;  // owner   → session
mapping(address => address) public ownerOf;    // session → owner

function registerSession(address session) external;  // auto-revokes previous
function revokeSession() external;
function resolve(address account) external view returns (address);
function isSessionKey(address account) external view returns (bool);

error InvalidSessionKey();  error SessionKeyInUse();  error NoActiveSession();
event SessionRegistered(address indexed owner, address indexed session);
event SessionRevoked(address indexed owner, address indexed session);
```

**Load-bearing semantic:** `resolve()` returns `account` itself when
unregistered — never `address(0)`. This is what keeps plain EOAs working and
prevents a caller silently crediting the zero address.

`registerSession` rejects `session == address(0)`, `session == msg.sender`, and
any key ever bound to another owner (`SessionKeyInUse`), so rotation always
means a fresh key.

### Modified: `contracts/NexusGame.sol`

Add an immutable registry reference, one internal helper, and swap
`msg.sender` → `_player()` at the **13 identity-bearing call sites**:
lines 102, 109, 116, 130, 139, 153, 162, 176, 185, 199, 217, 246, 534.

```solidity
ISessionRegistry public immutable sessionRegistry;

constructor(address _gameState, address _gameConfig, address _sessionRegistry)
    Ownable(msg.sender)
{ /* ... */ sessionRegistry = ISessionRegistry(_sessionRegistry); }

function _player() internal view returns (address) {
    return sessionRegistry.resolve(msg.sender);
}
```

**Nothing below the router changes.** No manager reads `msg.sender` to identify
a player — identity is passed down as an explicit `address player` argument and
ownership is validated against it. Managers keep `onlyRouter`.

**Explicitly not resolved:** `completeResearch(address player)`
(`NexusGame.sol:191`) and the other permissionless crank functions
(`completeUpgrade`, `completeShipBuild`, `completeDefenseBuild`,
`resolveFleet`/`completeFleet`). They take their subject from a parameter or
from storage and credit *that* party, never the caller. They already work from
any key and need zero changes.

### Deliberate trade-offs

**`sessionRegistry` is `immutable`, not owner-settable.** A settable registry
would let the owner key repoint resolution at a malicious contract and claim any
player's account — total takeover. Immutable closes that. Cost: replacing the
registry means another full cascade redeploy. Accepted for a ~50-line contract.

**No `address(0)` registry fallback.** `deploy.ts` deploys the registry on every
network including local, so an unset-registry branch would be dead weight that
exists only to be misconfigured.

**Fail closed.** If the registry cross-call reverts, the game call reverts. Never
assume an unknown caller is a main key.

### Bytecode budget

Measured against EIP-170's 24,576 bytes:

- `NexusGame`: 19,358 B (78.8%) — ~5.2 KB headroom. The interface + `_player()`
  helper + 13 call-site swaps is ~200-500 B (the helper is emitted once and
  `CALL`ed, not inlined, at `runs: 1`). Lands ~80%. Fits comfortably.
- `FleetResolver`: 24,281 B (**98.8%** — 295 B from the limit). **Not on this
  change's path** — it contains no `msg.sender` at all. Flagged separately: it is
  effectively frozen and any unrelated fleet work needs the split now.

### Redeploy cascade

`router` is `immutable` in every manager (`PlanetManager.sol:16`,
`TutorialManager.sol:16`, etc.) and `NexusGame` is not behind a proxy, so a new
NexusGame address forces redeploying all 7 managers. Per the "fresh deploy"
decision this is simply a clean `deploy.ts` run + `seed:local` / re-seed; no
migration code. `GameState` (UUPS) is redeployed fresh too.

## Frontend design

### Write path — a large simplification

The current session branch bypasses `ContractManager` **only** because it must
inject the `Proxy` wrapper around the inner `Revive.call`
(`useNexusContractWrite.ts:238`). Registry sessions sign a **plain
`Revive.call`** — precisely what `ContractManager.prepare()` already builds. The
branch collapses to swapping two variables:

```ts
const useSession = library === '@nexus/game' && session?.isReady;
const signer = useSession ? session.signer : hostSigner;
const origin = useSession ? session.ss58Address : address;

const prepared = await fn.prepare(...args, { origin });
return await submitWithBestNonce(prepared, signer, origin);
```

Inherited for free: real dry-run gas estimation, the best-block nonce fix
(`d1bd826`), revert-reason recovery via `fn.query`, the `AccountUnmapped` /
`not complete yet` / `Stale` retry classes, and `invalidateReads`.

**Deletions:**
- `Proxy.proxy` construction and ~35 lines of `ProxyExecuted` event decoding.
- `SESSION_REVIVE_REF_TIME` / `_PROOF_SIZE` / `_STORAGE_DEPOSIT` static weight
  constants (`:26-28`) — the dry-run supplies real values, retiring the
  "Sovereignty defaults" guesswork.
- `sessionWallet.ts` homegrown keypair + `sessionStorage` persistence.
- `useNexusSession.ts` `add_proxy` / `remove_proxy` batches and
  `SESSION_FUNDING_AMOUNT` (3 PAS native).

### Session lifecycle (`useNexusSession.ts`, rewritten)

```
1. PGAS balance check on product account   → nonzero = already granted, skip 2
2. requestResourceAllocation([{ tag: 'SmartContractAllowance',
                                value: PRODUCT_ACCOUNT_INDEX }])
                                           → host prompt, personhood-gated, free
3. SessionKeyManager.getOrCreate()         → silent; mnemonic in host KV
4. Restore validation: registry.sessionOf(productH160) == session.h160Address
                                           → match: resume silently, no prompt
                                           → mismatch: clear + re-run setup
   (compare by bytes, not SS58 strings)
5. Setup batch_all — THE one prompt, fee-free (all-Revive):
     Revive.call(PGAS_ERC20, transfer(session.h160Address, SESSION_PGAS))
     Revive.call(REGISTRY,   registerSession(session.h160Address))
6. Teardown: session-signed PGAS drain (silent, free)
           + product-signed revokeSession() (one prompt)
           + keys.clear()
```

`SESSION_PGAS` (the amount moved to the session key in step 5) is **20% of the
on-chain `Pgas.PgasClaimAmount`** read at setup time, not a hardcoded literal.
At the current claim amount this is ~`10_000_000_000` — matching bloom's
empirical budget — but it tracks the chain if the claim amount changes. PGAS
funds **storage deposits only** (fees are free), so it drains far slower than the
current 3-PAS native budget. The host auto-tops-up the product account, with a
prompt, when it signs all-Revive batches below ~20% of the claim amount.

Rotation = drain → `clear()` → `getOrCreate()` → product-signed
`registerSession(new)`; the registry auto-revokes the old key.

### Key library note

`@parity/product-sdk-keys@0.3.8` depends on `@polkadot-labs/hdkd` — the **same
WASM-free library** `sessionWallet.ts` already uses. It does **not** pull
`@polkadot/keyring` or `@polkadot/wasm-crypto-wasm`, so the Turbopack octal-escape
bug documented at `sessionWallet.ts:25-30` does not apply. `product-sdk-keys` and
`product-sdk-local-storage` are already present as transitive deps; promote both
to direct dependencies.

### Mode handling

Sessions are **host-only**. Local hardhat has no PGAS, no `Revive` extrinsics and
no host, so EVM mode keeps direct wagmi signing. Because `resolve()` returns
`msg.sender` for unregistered EOAs, contracts behave identically there — the
"Play as Alice" local flow is unaffected.

## Open risk (verify first)

**`map_account` is not free** — it is not a `Revive` call, so it falls outside
`ChargePGAS`. If the product account needs an explicit `Revive.map_account`
before its first contract call, the zero-native claim is punctured.

The expected escape is `AutoMap` (`OnNewAccount = pallet_revive::AutoMapper`,
`AutoMap = true`): `claim_pgas` creating the product account should auto-map it,
making the existing `ensureMapped` call an idempotent no-op read. The session key
is likewise auto-mapped on receiving PGAS via the precompile.

**The source skill lists exactly this as its one unvalidated item:** *"Residual:
exercise the precompile-transfer → session-key-signs-first-call path once
end-to-end."*

**Therefore: verify this against the live chain as implementation step 1**,
before contract work. If AutoMap does not fire for the product account, "zero
native" needs rethinking, and that must surface on day one — not after the
contracts are redeployed.

## Testing

- **`SessionRegistry` unit tests:** register + resolve; unmapped address resolves
  to itself; zero-address and self rejection; `SessionKeyInUse` on a reused key;
  rotation auto-revokes the previous session; `revokeSession` clears both
  mappings; `NoActiveSession` on revoking without one.
- **NexusGame session resolution:** register a session key, call
  `upgradeBuilding` **from the session key**, assert the **owner's** planet
  upgraded and the session key owns nothing.
- **Regression:** all 304 existing tests must pass unchanged. They exercise the
  plain-EOA path, which is the guard on `resolve()`'s identity fallback.
- **End-to-end:** full setup batch with a funded account on `paseo-next-v2`,
  then a session-signed game action — closing the doc's residual gap.

## Security notes (carry into user-facing docs)

- A session key is a **bearer credential**. Anyone holding it can act as the
  player, within what the registry authorizes, until revoked.
- Host KV storage is durable but **not a vault** (IndexedDB on desktop, plain
  preferences on Android). A compromised device means a compromised session;
  revocation is the recovery story.
- Client-side expiry is **UX hygiene, not enforcement** — it cannot bind anyone
  holding the key. On-chain `revokeSession()` is the only real control.
- Fund sessions with modest PGAS; drain on teardown.

## Out of scope

- Registry-enforced expiry, method allowlists, spend caps, multi-session
  (extension patterns; add if a need appears).
- "Require main key" gates for sensitive ops — the game currently has no asset
  transfer or account deletion surface.
- A shared cross-game registry (bloom's model). This registry is per-game;
  Nexus owns its policy.
- The `FleetResolver` bytecode split, and `TutorialManager`'s storage-invariant
  violation. Both real, both unrelated — tracked separately.
