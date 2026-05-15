# Nexus Protocol → `@parity/product-sdk` migration plan

> **Supersedes** [`HOST_SIGNING_PLAN.md`](./HOST_SIGNING_PLAN.md) and the earlier `host-api-wrapper`-only draft of this document.
>
> The earlier drafts wired the `@novasamatech/host-api-wrapper` primitives by hand. This plan moves up one abstraction layer to **`@parity/product-sdk-*`** (Parity-published, sits on top of the triangle stack) which already encapsulates everything we were about to hand-roll: dry-run + map-account, typed contract calls, signer management, chain-client routing, host detection, and the `ChainSubmit` permission gate.
>
> The Phase 1 lessons in [`HOST_SIGNING_PHASE_1_LESSONS.md`](./HOST_SIGNING_PHASE_1_LESSONS.md) still apply (hydration `mounted` gate, no `return null` during transitions, dot.li service-worker cache audit after every deploy, env vars baked at build time for static export).

## What `@parity/product-sdk` is, in one paragraph

`paritytech/product-sdk` is an Apache-2.0 monorepo of TypeScript packages published under `@parity/product-sdk-*` (current version 0.5.0). It wraps the v0.7 triangle stack (`@novasamatech/host-api-wrapper`, etc.) and adds typed, ergonomic APIs for the exact things this project needs: pallet-revive contract calls with dry-run preflight + automatic account mapping, multi-provider signer management with subscribe-pattern state, host-routed PAPI client, and a `cdm.json` manifest format that pins each contract to an address + ABI per target chain, with codegen producing full TypeScript types for every method call.

| Package | Replaces in our codebase |
| --- | --- |
| `@parity/product-sdk-contracts` | `frontend/src/hooks/useReviveCall.ts`, `useReviveContractWrite.ts`, ABI imports from `lib/contracts.ts` |
| `@parity/product-sdk-signer` | `frontend/src/hooks/useSpektrAccounts.ts`, `useHostAddress.ts`, `useHostSigner.ts` (never built) |
| `@parity/product-sdk-chain-client` | `frontend/src/lib/papiClient.ts` |
| `@parity/product-sdk-host` | `frontend/src/lib/host/hostEnv.ts`, `frontend/src/lib/host/pappAdapter.ts` |
| `@parity/product-sdk-address` | `frontend/src/lib/host/addressMapping.ts` (`accountIdToH160` → `deriveH160`) |
| `@parity/product-sdk-descriptors` | The `npx papi add hub` / `.papi/descriptors` step from the old plan (built-in descriptors for Paseo Asset Hub) |
| `@parity/product-sdk-tx` | The dry-run + `signSubmitAndWatch` flow inside `useReviveCall.ts` |

## What stays the same

- The contracts. Still EVM-on-AssetHub, called via `pallet_revive::call`. No redeploy.
- The architectural decision: writes are substrate extrinsics signed by the host's account; `msg.sender` is the revive-mapped H160 of that account.
- The H160-divergence caveat: the host's revive-mapped H160 ≠ a MetaMask-derived H160 from the same seed. Pre-launch this is fine.
- Read hooks. They keep going through wagmi's HTTP transport against the eth-rpc proxy for now. (`@parity/product-sdk-contracts` *does* expose `.query()` which would let us move reads onto host-routed PAPI too — see Phase G, deferred.)

## What goes away

- `frontend/src/hooks/useSpektrAccounts.ts` — the singleton, polling-fallback, PJS-subscribe machinery is replaced by `SignerManager` with its native subscribe pattern.
- `frontend/src/hooks/useReviveCall.ts` — the `map_account` + dry-run + `signSubmitAndWatch` flow lives inside `Contract<T>.<method>.tx(...)` and `ensureContractAccountMapped`.
- `frontend/src/hooks/useReviveContractWrite.ts` — `.tx()` already returns `{ ok, block, txHash, dispatchError }`; we wrap it once with React state, not per-hook.
- `frontend/src/lib/host/addressMapping.ts` — replaced by `deriveH160` from `@parity/product-sdk-address`. Each `SignerAccount` from `SignerManager` already carries `h160Address` populated.
- `frontend/src/lib/host/pappAdapter.ts` — only needed for PWallet QR pairing, which `dot.li` handles internally.
- The `papi add` / `.papi/descriptors` build step — `@parity/product-sdk-descriptors/paseo-asset-hub` ships maintained descriptors.
- The manual `ChainSubmit` permission gate that was Phase D — `HostProvider` requests it by default in `connect()`.

## Decisions (confirmed)

1. **DotNS identifier**: `'nexus-protocol.dot'`, derivation index `0`.
2. **Login reason string** (shown in host UI): `"Sign in to play Nexus Protocol"`.
3. **ConnectKit teardown**: tear out connectkit & wagmi connectors **immediately** after Phase 3 ships green on testnet — do not wait a stabilization week.
4. **PAPI-only reads (Phase G)**: deferred. Reads stay on wagmi + eth-rpc for this migration.

## Phasing

```
Phase 1 — SDK install + cdm.json + codegen
       │
       ▼
Phase 2 — SignerManager + ContractManager wiring (auth + chain client)
       │
       ▼
Phase 3 — Migrate every write hook (one ContractManager call each)
       │
       ▼
Phase 4 — Tear out connectkit + wagmi connectors
```

Each arrow is a hard gate: don't start phase N+1 until N is verified inside `dot.li` with a real phone-paired account.

---

### Phase 1 — SDK install, `cdm.json`, codegen (½ day)

**Goal.** Get the `@parity/product-sdk-*` packages installed, write a `cdm.json` for our two deployed contracts, run codegen so calls are fully typed. **No runtime wiring yet.**

**Dependency changes** (`frontend/package.json`). Replace v0.6 entries:
- Add `@parity/product-sdk-contracts@^0.5`, `@parity/product-sdk-signer@^0.2`, `@parity/product-sdk-chain-client@^0.4`, `@parity/product-sdk-host@^0.x`, `@parity/product-sdk-descriptors@^0.x`, `@parity/product-sdk-tx@^0.2`, `@parity/product-sdk-address@^0.x`.
- The `@parity/product-sdk-*` packages declare `optionalDependencies` on `@novasamatech/product-sdk` and `@novasamatech/host-api` — keep both installed (`@novasamatech/product-sdk@^0.7` is what the host package dynamically imports at runtime to talk to the host).
- Remove `connectkit`, `wagmi` connectors (kept for reads — see Phase 4 below for the full strip).
- Remove `qrcode.react` if `host-papp` is dropped.

**Versions to verify before installing** (these packages are at 0.x; pin exact versions in `package.json`):
- Check the published version of each `@parity/product-sdk-*` package on npm.
- If any are unpublished, fall back to git/workspace install or vendor them locally. **This is the highest-risk single thing in the plan — check first, don't assume.**

**Create** `frontend/cdm.json`. Schema:

```jsonc
{
  "targets": {
    "nexus-paseo-hub": {
      "asset-hub": "wss://paseo-asset-hub-next-rpc.polkadot.io"
    }
  },
  "contracts": {
    "nexus-paseo-hub": {
      "@nexus/game": {
        "version": 0,
        "address": "<NEXT_PUBLIC_NEXUS_GAME_ADDRESS at deploy time>",
        "abi": [ /* copy from frontend/src/contracts/abi/NexusGame.json */ ]
      },
      "@nexus/config": {
        "version": 0,
        "address": "<NEXT_PUBLIC_GAME_CONFIG_ADDRESS at deploy time>",
        "abi": [ /* copy from frontend/src/contracts/abi/GameConfig.json */ ]
      }
    }
  }
}
```

The target key `nexus-paseo-hub` is a short identifier; `ContractManager` defaults to the first target unless told otherwise via `options.targetHash`.

**Decide deploy-time address injection**. Two options:
- **(A)** Generate `cdm.json` from `contracts/deployments/latest.json` in `scripts/deploy-frontend.sh` (preferred — single source of truth).
- **(B)** Hand-edit `cdm.json` per environment. Simpler now, easier to drift later.

Pick **A**. Wire it into the deploy script; the existing `set -a; . .env.testnet; set +a` step becomes a `node scripts/generate-cdm.mjs` step.

**Run codegen**. Create `frontend/scripts/generate-contract-types.mjs`:

```ts
import { generateContractTypes, resolveContractTypeInputs } from "@parity/product-sdk-contracts/codegen";
import { writeFileSync } from "node:fs";

const resolved = await resolveContractTypeInputs([
  { library: "@nexus/game",   abiPath: "./src/contracts/abi/NexusGame.json" },
  { library: "@nexus/config", abiPath: "./src/contracts/abi/GameConfig.json" },
]);
writeFileSync(".cdm/contracts.d.ts", generateContractTypes(resolved));
```

Add to `tsconfig.json`'s `include`: `".cdm/**/*.d.ts"`. Add to `.gitignore`: `.cdm/`. Wire as a `prebuild` script.

**Acceptance**:
- `npm install` succeeds; no missing-peer-dep warnings beyond what we choose to ignore.
- `npm run prebuild` (or whatever we name the codegen) writes `.cdm/contracts.d.ts`.
- A throwaway test file like `const m: ContractManager; m.getContract("@nexus/game").upgradeBuilding.tx;` — the IDE shows full parameter typing from the ABI. No runtime code yet.

**Risks**:
- Packages not yet on public npm. Mitigation: spike before everything else; if missing, file an internal ticket and fall back to the `host-api-wrapper`-only plan.
- `cdm.json` address divergence across environments. Mitigation: option (A) above — generate it.
- ABI shape mismatch with what `viem` expects. Mitigation: our existing `frontend/src/contracts/abi/*.json` are already viem-compatible — the same JSON drives wagmi today.

---

### Phase 2 — Wire `SignerManager` + chain client + `ContractManager` (1 day)

**Goal.** All four pieces of plumbing live as singletons; one React hook exposes them to the UI. End of phase, sign-in works and we have a `ContractManager` instance bound to the connected account, but **no write hook has been migrated yet**.

**New** `frontend/src/lib/triangle/signerManager.ts`:

```ts
import { SignerManager } from "@parity/product-sdk-signer";

// ss58Prefix 0 = Polkadot generic. Paseo Asset Hub accepts the same encoding.
// dappName is used as a persistence key for the selected-account preference.
export const signerManager = new SignerManager({
  ss58Prefix: 0,
  dappName: "nexus-protocol",
});
```

**New** `frontend/src/lib/triangle/chainClient.ts`:

```ts
import { getChainAPI } from "@parity/product-sdk-chain-client";

// Singleton wrapped in a memoized promise so concurrent boots share the same client.
let cached: ReturnType<typeof getChainAPI<"paseo">> | null = null;
export function getChain() {
  if (!cached) cached = getChainAPI("paseo");
  return cached;
}
```

`getChainAPI("paseo")` ships built-in descriptors + RPC endpoints (`wss://paseo-asset-hub-next-rpc.polkadot.io`) and auto-detects the host environment: inside `dot.li` it routes through the host's substrate connection; standalone it falls back to direct WS. **No genesis-hash constant to maintain** — it's in the descriptor.

**New** `frontend/src/lib/triangle/contractManager.ts`:

```ts
import { ContractManager, ensureContractAccountMapped } from "@parity/product-sdk-contracts";
import { paseo_asset_hub } from "@parity/product-sdk-descriptors/paseo-asset-hub";

import cdmJson from "../../cdm.json";
import { getChain } from "./chainClient.js";
import { signerManager } from "./signerManager.js";

let cached: ContractManager | null = null;
export async function getContractManager(): Promise<ContractManager> {
  if (cached) return cached;
  const chain = await getChain();
  cached = ContractManager.fromClient(cdmJson as never, chain.raw.assetHub, paseo_asset_hub, {
    signerManager,
  });
  return cached;
}

/** Call once after the user has selected their product account. */
export async function ensureMapped(address: string, signer: import("polkadot-api").PolkadotSigner) {
  const m = await getContractManager();
  await ensureContractAccountMapped(m.getRuntime(), address, signer);
}
```

`ContractManager.fromClient(...)` builds a `ContractRuntime` that runs the `ReviveApi.call` dry-run through PAPI's unsafe API path — sidestepping compatibility-token drift if the descriptor lags a runtime upgrade. Pass `signerManager` so contract handles resolve signer + origin from the currently-selected account automatically.

`ensureContractAccountMapped` does the one-time `Revive.map_account` extrinsic with the `OriginalAccount` short-circuit. We call it once after sign-in.

**New** `frontend/src/hooks/useTriangle.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import { isInsideContainerSync } from "@parity/product-sdk-host";
import type { SignerState } from "@parity/product-sdk-signer";

import { signerManager } from "@/lib/triangle/signerManager";
import { ensureMapped, getContractManager } from "@/lib/triangle/contractManager";

const initial: SignerState = {
  status: "disconnected", accounts: [], selectedAccount: null,
  activeProvider: null, error: null,
};

export function useTriangle() {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<SignerState>(initial);
  useEffect(() => {
    setMounted(true);
    return signerManager.subscribe(setState);
  }, []);

  // Mapped once per account.
  useEffect(() => {
    const acc = state.selectedAccount;
    if (!acc || state.activeProvider !== "host") return;
    const signer = signerManager.getSigner();
    if (signer) ensureMapped(acc.address, signer).catch(console.error);
  }, [state.selectedAccount, state.activeProvider]);

  if (!mounted) {
    return { ...initial, address: undefined, h160: undefined, ready: false };
  }

  return {
    ...state,
    /** SS58 of the selected account. */
    address: state.selectedAccount?.address,
    /** revive-mapped H160 of the selected account. */
    h160: state.selectedAccount?.h160Address as `0x${string}` | undefined,
    /** Returns the typed ContractManager. Caller awaits this in event handlers. */
    getContracts: getContractManager,
    /** Connect / login entry point. */
    signIn: () => signerManager.connect("host"),
    isInHost: isInsideContainerSync(),
    ready: state.status === "connected" && !!state.selectedAccount,
  };
}
```

The `mounted` gate from Phase 1 of the old plan stays — `isInsideContainerSync()` reads `window`, which would break SSR hydration without it.

**Rewire** `frontend/src/app/page.tsx`:

```tsx
const { ready, isInHost, signIn, status } = useTriangle();

if (!isInHost) return <OpenInPolkadotHostMessage />;
if (status === "disconnected") return (
  <button onClick={signIn}>Sign in to play Nexus Protocol</button>
);
if (!ready) return <Spinner label="Connecting…" />;
// redirect to /game or /game/onboarding based on useHasPlanet(h160)
```

`signerManager.connect("host")` internally calls `accountsProvider.requestLogin('Sign in to play Nexus Protocol')` (set the reason via `SignerManagerOptions.dappName`-related configuration; if the SDK doesn't expose it directly, call `accountsProvider.requestLogin(reason)` once via `getHostProvider` before `connect()`).

**Important: product account vs legacy account.** `SignerManager.connect("host")` exposes the user's *legacy* accounts (the ones the user imported). For an app-scoped account (`'nexus-protocol.dot'`), we instead want:

```ts
const hostProvider = signerManager.getProvider("host") as HostProvider;
const productAccount = await hostProvider.getProductAccount("nexus-protocol.dot", 0);
// productAccount.value.h160Address is what reads/writes target
// productAccount.value.getSigner() is the PolkadotSigner
```

If we go the product-account route, we **don't** use `signerManager.selectAccount(legacyAccount)`; we set the contract manager's defaults directly:

```ts
contractManager.setDefaults({
  origin: productAccount.value.address,
  signer: productAccount.value.getSigner(),
});
```

**Open question to resolve in this phase**: do we want product accounts (app-scoped, recommended by the protocol — same direction the old plan went) or to expose the host's regular account directly? The previous decision was product accounts; carry that forward.

**Rewire** `frontend/src/components/auth/ProtectedRoute.tsx` to gate on `useTriangle().ready` instead of `useAccount()` from wagmi. Keep the spinner-instead-of-`null` lesson from Phase 1.

**Replace** `frontend/src/hooks/useHostAddress.ts` with a re-export of `useTriangle` so the eight or so existing call sites don't move:

```ts
export const useHostAddress = () => {
  const t = useTriangle();
  return {
    address: t.h160,
    ss58Address: t.address,
    isConnected: t.ready,
    isConnecting: t.status === "connecting",
    isReconnecting: false,
    isInHost: t.isInHost,
    isReady: t.ready,
  };
};
```

**Delete**:
- `frontend/src/hooks/useSpektrAccounts.ts`
- `frontend/src/lib/host/addressMapping.ts` (callers now use `t.h160` from `useTriangle`)
- `frontend/src/lib/host/pappAdapter.ts` (PWallet QR pairing not needed inside `dot.li`)
- `frontend/src/lib/papiClient.ts` (replaced by `chainClient.ts`)
- `frontend/src/lib/host/hostEnv.ts` (replaced by `isInsideContainerSync` from the SDK)

**Acceptance**:
- Standalone browser → "Open in Polkadot Host" message, no MetaMask prompt.
- Inside host, signed out → "Sign in to play Nexus Protocol" button → host's native login UI → automatic redirect.
- Inside host, signed in already → skip login UI, go straight to `/game`.
- The H160 from `useTriangle().h160` matches what existing read hooks (`useHasPlanet` etc.) query the contracts with. **No state migration needed** because the H160 derivation is the same algorithm Phase 1 of the old plan used.
- The first sign-in fires one phone prompt for `Revive.map_account`; subsequent sessions don't.

**Risks**:
- `requestLogin` may not be wired on the live `dot.li` build. The `HostProvider.connect()` path may return a generic "host unavailable" error if so. Smoke-test this isolated before relying on it.
- `getChainAPI("paseo")` connects to `wss://paseo-asset-hub-next-rpc.polkadot.io` standalone. Confirm that's the same chain our contracts are deployed to (genesis hash `0x173cea9df45656cf612c8b8ece56e04e9a693c69cfaac47d3628dae735067af8` — checked into the SDK).
- SSR hydration mismatches around `isInsideContainerSync()`. Mitigation: the `mounted` gate in `useTriangle` is non-negotiable.

---

### Phase 3 — Migrate the write hooks (1 day, mostly mechanical)

**Goal.** Every write hook in `useNexusGame.ts` becomes a 3-line wrapper around a typed `Contract<T>.<method>.tx()` call.

Pattern (replaces every previous `useWriteContract` / `useReviveContractWrite` hook):

```ts
// frontend/src/hooks/useNexusContractWrite.ts
"use client";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getContractManager } from "@/lib/triangle/contractManager";
import { useTriangle } from "@/hooks/useTriangle";

type State = {
  hash?: `0x${string}`;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error?: Error;
};

const idle: State = { isPending: false, isConfirming: false, isSuccess: false };

export function useNexusContractWrite(invalidate: string[] = []) {
  const qc = useQueryClient();
  const { ready } = useTriangle();
  const [s, setS] = useState<State>(idle);

  const reset = useCallback(() => setS(idle), []);

  const call = useCallback(
    async (library: "@nexus/game" | "@nexus/config", method: string, args: readonly unknown[]) => {
      if (!ready) return setS({ ...idle, error: new Error("Not signed in") });
      setS({ ...idle, isPending: true });
      try {
        const m = await getContractManager();
        const contract = m.getContract(library as never) as Record<string, { tx: (...a: unknown[]) => Promise<{ ok: boolean; txHash?: string; dispatchError?: unknown }> }>;
        setS({ isPending: false, isConfirming: true, isSuccess: false });
        const result = await contract[method].tx(...args);
        if (!result.ok) throw new Error(`Tx failed: ${JSON.stringify(result.dispatchError)}`);
        setS({ hash: result.txHash as `0x${string}`, isPending: false, isConfirming: false, isSuccess: true });
        for (const fn of invalidate) qc.invalidateQueries({ queryKey: ["readContract", { functionName: fn }] });
      } catch (e) {
        setS({ ...idle, error: e instanceof Error ? e : new Error(String(e)) });
      }
    },
    [ready, qc, invalidate],
  );

  return { ...s, call, reset };
}
```

Each per-action hook then collapses to:

```ts
export function useUpgradeBuilding() {
  const { call, ...state } = useNexusContractWrite(["getPlanet", "calculateCurrentResources"]);
  return {
    upgradeBuilding: (planetId: bigint, buildingType: number) =>
      call("@nexus/game", "upgradeBuilding", [planetId, buildingType]),
    ...state,
  };
}
```

**Walk through the file in this order**:

1. `useClaimStarterPlanet` → `call("@nexus/game", "claimStarterPlanet", [planetName])`, invalidate `hasPlanet, getPlayerPlanetId, getPlayerPlanets, getPlayerPlanetCount`
2. `useUpgradeBuilding`, `useCompleteUpgrade`, `useCancelUpgrade`
3. `useClaimResources`
4. `useBuildShips`, `useCompleteShipBuild`, `useCancelShipBuild`
5. `useStartResearch`, `useCompleteResearch`, `useCancelResearch`
6. `useBuildDefenses`, `useCompleteDefenseBuild`, `useCancelDefenseBuild`
7. `useDispatchFleet`, `useDispatchFleetFromOutpost`, `useResolveFleet`, `useCompleteFleet`
8. `useClaimTutorialQuest`

The codegen from Phase 1 gives us full typing on every `.tx()` arg list — `claimStarterPlanet` expects `string`, `upgradeBuilding` expects `[bigint, number]`, etc. — straight from the Solidity ABI, no manual maintenance.

Delete `frontend/src/hooks/useReviveCall.ts` and `frontend/src/hooks/useReviveContractWrite.ts` when this phase is complete.

**Per-hook acceptance**:
- Existing UI button still works (no call-site changes needed — return shape is preserved).
- One phone signing prompt per action (two on the very first write per session, due to `ensureContractAccountMapped`).
- queryClient invalidations fire after best-block inclusion.
- On-chain effect verified via Blockscout / read-hook re-fetch.

**Risks**:
- The cast through `Record<string, ...>` defeats the codegen typing inside the helper, but each per-action hook above keeps the call site typed. If we want the helper fully typed, generate a `WriteHookFactory<L extends ContractLibrary>(library: L)` indexed by `Contracts[L]` from the codegen output. Worth doing if we end up with many ad-hoc writes.
- Map-account race: `ensureContractAccountMapped` is best-effort idempotent (reads `Revive.OriginalAccount` first). If the user fires a write before the post-sign-in `ensureMapped` effect resolves, the first `.tx()` dry-run will throw `ContractDryRunFailedError` with `AccountNotMapped`. Mitigation: keep the post-sign-in `ensureMapped` synchronous — gate `ready` on its resolution, not just on `state.selectedAccount`.

---

### Phase 4 — Tear out connectkit & wagmi connectors (1 sitting)

**Goal.** Strip dead code immediately once Phase 3 is green. **No stabilization wait.**

Changes:
- Remove `connectkit` from `frontend/package.json`.
- Remove `ConnectKitProvider` from `frontend/src/components/providers/Web3Provider.tsx`.
- Reduce `frontend/src/lib/wagmiConfig.ts` to transports-only (no connectors). Reads via `useReadContract` keep working through the HTTP transport. The chain list still needs the active chain at index 0 (Phase 1 lesson #2).
- Drop env vars: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` and anything only the connectors used.
- Settings page: drop the "Connected Wallet — connector name" row.
- Drop or no-op `frontend/src/components/ui/NetworkGuard.tsx` (already a passthrough since Phase 1 of the old plan).
- Remove `useEnsName`, `useDisconnect`, `useSwitchChain` call sites — meaningless without connectors.

**Acceptance**:
- `npm run build:static` succeeds with `connectkit` removed.
- The deployed bundle is meaningfully smaller — `connectkit` + WalletConnect pulls ~600KB.
- No console errors about missing connectors / project IDs.
- All read hooks (`useHasPlanet`, `usePlanetData`, etc.) still work.

---

### Phase G — Migrate reads onto `Contract.query()` (**DEFERRED**)

Out of scope for this migration. Reads stay on wagmi + eth-rpc. If/when we want to drop the eth-rpc dependency entirely, every `useReadContract` becomes:

```ts
const m = await getContractManager();
const { value } = await m.getContract("@nexus/game").hasPlanet.query(h160);
```

That gives us host-routed reads + the same typed surface as the writes. Big diff (~30 hooks) but each one is mechanical. Schedule only if eth-rpc-proxy reliability becomes a problem.

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| `@parity/product-sdk-*` packages not yet on public npm | Spike `npm install` *first*. If unpublished, fall back to vendored packages or file an internal request before scheduling Phase 2. |
| `dot.li` build hasn't wired `handleRequestLogin` | Smoke-test `signerManager.connect("host")` in isolation before Phase 2. If missing, gate the new flow behind a build flag. |
| `cdm.json` address divergence across local/testnet/mainnet | Generate `cdm.json` from `contracts/deployments/latest.json` in the deploy script. Don't hand-edit. |
| ABI shape drift between Hardhat's emit and viem's expectations | Our existing `frontend/src/contracts/abi/*.json` already drives wagmi/viem — known good. |
| Map-account race on first write per session | Block `ready=true` in `useTriangle` until `ensureContractAccountMapped` resolves. |
| H160 divergence from MetaMask testnet state | Pre-launch this is fine. Wipe testnet contract state if needed. |
| SSR / static-export hydration mismatches (React #418) | Keep the `mounted` gate in `useTriangle`. Don't relax it. |
| dot.li service-worker / CID caching | After every deploy, confirm the resolved CID in the browser matches the just-deployed CID (Phase 1 lesson #6). |
| Single product-account assumption (`('nexus-protocol.dot', 0)`) | Hard-code 0 and document it. Multi-account support is available via `derivationIndex` if/when needed. |
| Next 16 + Turbopack + transitive WASM | Existing webpack `asyncWebAssembly` setting in `next.config.ts` carries forward unchanged. |
| `@parity/product-sdk` is 0.5.0 — fast-moving | Pin exact versions in `package.json`. Re-pin deliberately when upgrading. |

---

## Files changed by phase

**New** (this migration creates):
- `frontend/cdm.json` (Phase 1) — contract manifest, generated from deploy artifacts
- `frontend/scripts/generate-cdm.mjs` (Phase 1) — generates `cdm.json` from `contracts/deployments/latest.json`
- `frontend/scripts/generate-contract-types.mjs` (Phase 1) — runs SDK codegen → `.cdm/contracts.d.ts`
- `frontend/.cdm/contracts.d.ts` (Phase 1, gitignored) — typed-contract augmentation
- `frontend/src/lib/triangle/signerManager.ts` (Phase 2)
- `frontend/src/lib/triangle/chainClient.ts` (Phase 2)
- `frontend/src/lib/triangle/contractManager.ts` (Phase 2)
- `frontend/src/hooks/useTriangle.ts` (Phase 2)
- `frontend/src/hooks/useNexusContractWrite.ts` (Phase 3) — shared helper

**Rewritten** (existing files, replaced wholesale):
- `frontend/src/hooks/useHostAddress.ts` (Phase 2) — thin re-export of `useTriangle`
- `frontend/src/hooks/useNexusGame.ts` (Phase 3) — every write hook becomes a 3-line wrapper
- `frontend/src/app/page.tsx` (Phase 2) — sign-in button via `useTriangle().signIn()`
- `frontend/src/components/auth/ProtectedRoute.tsx` (Phase 2) — gate on `useTriangle().ready`
- `frontend/src/components/providers/Web3Provider.tsx` (Phase 4) — drop ConnectKitProvider
- `frontend/src/lib/wagmiConfig.ts` (Phase 4) — transports-only
- `frontend/package.json` (Phase 1 + Phase 4) — dep swap + connectkit removal
- `scripts/deploy-frontend.sh` (Phase 1) — add cdm.json generation step

**Deleted**:
- `frontend/src/hooks/useSpektrAccounts.ts` (Phase 2)
- `frontend/src/hooks/useReviveCall.ts` (Phase 3)
- `frontend/src/hooks/useReviveContractWrite.ts` (Phase 3)
- `frontend/src/lib/host/addressMapping.ts` (Phase 2)
- `frontend/src/lib/host/hostEnv.ts` (Phase 2)
- `frontend/src/lib/host/pappAdapter.ts` (Phase 2)
- `frontend/src/lib/papiClient.ts` (Phase 2)

**Untouched**:
- `frontend/src/hooks/useNexusGame.ts` *read hooks* — every `useReadContract`-based hook keeps wagmi/HTTP/eth-rpc
- `frontend/src/contracts/abi/*.json` — same files, now also referenced from `cdm.json`
- All Solidity contracts; the contract test suite
- `frontend/src/lib/contracts.ts` — env-driven address exports stay for read hooks (writes go through `cdm.json` instead)

---

## Reference

- `@parity/product-sdk` monorepo: `paritytech/product-sdk` (this is the SDK we're targeting)
- `@parity/product-sdk-contracts` README: `product-sdk/product-sdk/packages/contracts/README.md` (in the local checkout) — full ContractManager / `cdm.json` / codegen docs
- `@parity/product-sdk-signer` source: `product-sdk/product-sdk/packages/signer/src/` — `SignerManager`, `HostProvider`, `DevProvider`
- `@parity/product-sdk-chain-client` source: `product-sdk/product-sdk/packages/chain-client/src/presets.ts` — Paseo Asset Hub RPCs and built-in descriptor wiring
- Working reference: `product-sdk/product-sdk/examples/contracts-demo/src/main.ts` — full end-to-end flow against a real Paseo Asset Hub contract
- Underlying triangle stack (transitively used): `paritytech/triangle-js-sdks` v0.7.8
- Phase 1 post-mortem (still load-bearing): [`HOST_SIGNING_PHASE_1_LESSONS.md`](./HOST_SIGNING_PHASE_1_LESSONS.md)
