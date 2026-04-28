# Polkadot Host Account Signing — Migration Plan

Goal: replace MetaMask / Talisman EVM signing with **Polkadot Host account signing** via `pallet_revive::call`. Reads stay on viem / eth-rpc; only writes change. Same architecture proven on `Krayt78/polkadot-stack-template @ experiment/pwallet-host-signing`.

## Why this works at all

EVM contracts deployed via `pallet-revive` accept calls from two ingress paths:

1. **eth-rpc proxy** — RLP-signed Ethereum tx (today's MetaMask path).
2. **Substrate extrinsic** `pallet_revive.call(...)` — sr25519/ed25519/ecdsa signed by any substrate account. The contract executes with `msg.sender = revive-mapped H160` of that account.

Polkadot Host (dot.li / Spektr) signs **substrate extrinsics with sr25519**, not Ethereum tx with secp256k1. So instead of asking the host to do something it can't, we route writes through path (2). Reads unchanged.

## Critical caveat — read this before anything else

The H160 the host produces (revive-mapped from the substrate AccountId) is **different from any MetaMask/Talisman-derived H160 from the same seed**. Game state under a player's MetaMask H160 stays orphaned when they switch to host signing.

**Pre-launch**: trivial, just pick the host H160 as canonical. Wipe testnet contract state if needed.
**Post-launch**: would require an on-chain migration path or a hard cutover. Not in scope for this plan.

## Phasing — go slow, validate each step

### Phase 0 — proof on stack-template (DONE)
Reference implementation lives at `Krayt78/polkadot-stack-template @ experiment/pwallet-host-signing`. End-to-end host-account → `Revive::call(createClaim)` working. All decisions below trace back to that branch.

### Phase 1 — Auth bootstrap on the landing page
**Scope**: detect "is the user already authenticated via the Polkadot Host?". If yes → `/game` (or `/game/onboarding` if no planet). If no → show a "Open this in Polkadot Host (dot.li)" message and wait. **No transaction signing yet.** No code changes to `useNexusGame.ts` writes. ConnectKit / wagmi connectors stay in for now so existing reads don't break.

**Files to add**:
- `frontend/src/lib/host/hostEnv.ts` — `isInHost()` (iframe / `__HOST_WEBVIEW_MARK__` detection)
- `frontend/src/lib/host/pappAdapter.ts` — singleton `createPappAdapter` from `@novasamatech/host-papp` pinned to `SS_PASEO_STABLE_STAGE_ENDPOINTS` (the default endpoint is dead)
- `frontend/src/hooks/useSpektrAccounts.ts` — singleton hook that injects + connects Spektr via `@novasamatech/product-sdk`, exposes the `InjectedPolkadotAccount[]` to React
- `frontend/public/papp-metadata.json` — `{ name: "Nexus Protocol", icon: "/icon-256.png" }`
- `frontend/public/icon-256.png` — 256x256 logo (required by host-papp confirmation screen)

**Files to modify**:
- `frontend/package.json` — add `@novasamatech/host-papp@0.6.18`, `@novasamatech/product-sdk@0.6.12`, `@novasamatech/statement-store@0.6.18`, `polkadot-api@^1.23.3`, `qrcode.react@^4.2.0`. Add devDeps `vite-plugin-wasm` and `vite-plugin-top-level-await`.
- `frontend/next.config.ts` — wire equivalents of vite-plugin-wasm + top-level-await. Next 16 with Turbopack handles WASM via `experimental.serverComponentsExternalPackages` or webpack config; verify host-papp's `verifiablejs` builds.
- `frontend/src/app/page.tsx` — replace ConnectKit CTA with this logic:
  ```
  on mount:
    if !isInHost() → show "Open in Polkadot Host" message + dot.li link
    else useSpektrAccounts() — wait for status === "connected"
      if accounts[0] exists:
        useHasPlanet(address = mapped H160)
          if hasPlanet → router.push('/game')
          else → router.push('/game/onboarding')
      else → "Pair a Polkadot account inside this Host"
  ```
- `frontend/src/components/auth/ProtectedRoute.tsx` — same gate based on `useSpektrAccounts` instead of `useAccount` from wagmi

**Acceptance**:
- Standalone browser → "Please open inside Polkadot Host (dot.li)" — no MetaMask prompt
- Inside dot.li with a paired account → automatic redirect to `/game` or `/game/onboarding`
- `useHasPlanet`, `useReadContract` etc. still work — they query by the `address` we now derive from the Spektr account's revive-mapped H160 (use `accountIdToH160()` from the stack-template branch)
- All existing write calls still throw / no-op (Phase 2's job)

**Risk to watch**: `useAccount()` from wagmi is used in ~8 places (GameHeader, BattleReportCard, GameLayout, settings page, NetworkGuard, page.tsx, ProtectedRoute, game/settings/page.tsx). For Phase 1 we need a shim that returns `{ address: <mapped H160>, isConnected: <bool> }` from the Spektr account, OR do the call-site rewrite. Recommend: write `frontend/src/hooks/useHostAddress.ts` that mirrors wagmi's `useAccount` shape and edit every call site to use it. Keeps the diff focused.

**Estimate**: 1 sitting. Mostly mechanical once the shim is in place.

### Phase 2 — Migrate `claimStarterPlanet` (template tx)
**Scope**: rewire just `useClaimStarterPlanet` to use `pallet_revive::call`. Validate end-to-end. **All other writes still on the old wagmi path.** This is the integration template every other write will copy.

**Files to add**:
- `frontend/src/hooks/useHostAccount.ts` — adapter wrapping `UserSession.signPayload` / `signRaw` (host-papp `ResultAsync` shape) into PJS shape, then calling `getPolkadotSignerFromPjs(ss58, signPayload, signRaw)` to expose a PAPI `PolkadotSigner`
- `frontend/src/hooks/useReviveCall.ts` — copy verbatim from stack-template branch, adjust the import from `@polkadot-api/descriptors` to whatever we name nexus's chain (next bullet)
- `frontend/src/lib/host/addressMapping.ts` — `accountIdToH160` (sr25519 AccountId → revive-mapped H160; mirrors stack-template `web/src/pages/AccountsPage.tsx:34-44`)

**Build setup**:
- Generate PAPI descriptors against Polkadot Hub TestNet:
  ```
  cd frontend
  npx papi add hub -w wss://testnet-passet-hub.polkadot.io
  npx papi
  ```
  (The exact URL depends on which Hub TestNet variant your contracts deploy to. Verify by querying the same chain that `services.polkadothub-rpc.com/testnet` proxies — they must share the genesis hash.)
- `frontend/src/lib/papiClient.ts` — singleton PAPI client over `getWsProvider(...)`

**Files to modify**:
- `frontend/src/hooks/useNexusGame.ts` — modify only `useClaimStarterPlanet`:
  - Drop `useWriteContract` for this hook
  - Build `Revive.call({ dest: NEXUS_GAME_ADDRESS as H160, value: 0n, ..., data: encodeFunctionData({ abi, functionName: 'claimStarterPlanet', args: [planetName] }) })`
  - Sign via the host-derived `PolkadotSigner` from `useHostAccount`
  - Use `signSubmitAndWatch` with `{ at: "best" }` for any storage / runtime API reads (the gotcha that bit us at the very end of stack-template debugging — see commit `0418637`)
  - Auto-fire `Revive.map_account` on first use, poll `OriginalAccount[h160]` at `{ at: "best" }` to confirm
  - Expose the same return shape `{ claimPlanet, isPending, isConfirming, isSuccess, error, reset }` so `frontend/src/app/game/onboarding/page.tsx` doesn't need to change

**Acceptance**:
- Open dot.li, paired host account
- New player visits `/game/onboarding`, types a planet name, clicks Claim
- First time only: phone prompt for `Revive.map_account`, sign on phone
- Phone prompt for `Revive.call(claimStarterPlanet)`, sign on phone
- Status text walks through `signed → broadcasted → in best block → claim done`
- Re-running `useHasPlanet` returns true → redirect to `/game`
- The new planet's owner == revive-mapped H160 of the host's substrate account (verify on Blockscout)

**Risk to watch**: dry-run will fail with `AccountUnmapped` if `OriginalAccount.getValue` reads finalized state (default in PAPI 1.x) right after `map_account` lands in the best block. **Always pass `{ at: "best" }` to storage queries and runtime API calls in this code path.** This is the single non-obvious thing in the whole migration; budget time to remember it.

**Estimate**: half a day if Phase 1 lands cleanly. Most of the work is the boilerplate, not the conceptual leap.

### Phase 3 — Roll the rest of the writes (one at a time)
**Scope**: every other `useWriteContract` in `useNexusGame.ts`. There are 20 total. Suggested order:

1. **`useUpgradeBuilding`** — exercises non-trivial args, uses queryClient invalidation
2. **`useCompleteUpgrade`**, **`useCancelUpgrade`** — paired with the above
3. **`useClaimResources`** — high-frequency call, good stress test
4. **`useBuildShips`** — different contract surface
5. **`useStartResearch`**, **`useCompleteResearch`**, **`useCancelResearch`** — research flow
6. **`useBuildDefenses`**, **`useUpgradeDefense`**, **`useCancelDefenseUpgrade`** — defense flow
7. **`useSendFleet`**, **`useRecallFleet`** — fleet flow
8. **Whatever's left** — sweep up

**Pattern for each** (after Phase 2 establishes the template):
- Replace `useWriteContract` body with a call to a generic helper, e.g.:
  ```ts
  const { call } = useReviveContractWrite(NEXUS_GAME_ADDRESS, nexusGameAbi);
  // inside the action:
  await call('upgradeBuilding', [planetId, buildingType], { onProgress });
  ```
- Keep return shape identical to what the page expects so callers don't change

**Acceptance per hook**:
- Existing UI button still works
- Phone signing prompt fires once (or twice on first use due to `map_account`)
- Status string walks through stages
- queryClient invalidations fire after best-block inclusion
- On-chain effect verified via Blockscout / read hook re-fetch

**Estimate**: 30-60 min per hook once the helper is in place. ~1-2 days for all 20.

### Phase 4 — Remove the EVM-signing scaffolding
**Scope**: only after Phase 3 is fully stable.

- Remove `connectkit` from `package.json` and `Web3Provider`
- Reduce wagmi config to no connectors (transports only, for reads via `useReadContract`)
- Or remove wagmi entirely — replace `useReadContract` usages with PAPI `apis.ReviveApi.call` view-mode calls
- Remove env vars: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` and friends
- `Settings` page: drop "Connected Wallet — connector name" since it's always Polkadot Host now

**Estimate**: 1 sitting after Phase 3.

## Dependencies between phases

```
Phase 0 (DONE) ──▶ Phase 1 (auth bootstrap)
                       │
                       ▼
                   Phase 2 (claimStarterPlanet)
                       │
                       ▼
                   Phase 3 (rest of writes, 20 hooks)
                       │
                       ▼
                   Phase 4 (cleanup)
```

Each arrow is a hard gate: don't start phase N+1 until N is verified on testnet with a real phone-paired account.

## What stays unchanged

- All Solidity contracts. No re-deploy required (same `pallet_revive` ABI surface).
- `useReadContract` calls (for now). Reads via eth-rpc continue working.
- All UI components except the connect button and the auth gates.
- Test suite for contracts (`contracts/test/*`).

## What's likely to surprise us

1. **Hub TestNet's substrate WS endpoint.** `services.polkadothub-rpc.com/testnet` is the eth-rpc proxy — useful for reads. We need the underlying substrate WS for PAPI. Verify the right URL before generating descriptors. Likely candidates: `wss://testnet-passet-hub.polkadot.io`, `wss://asset-hub-paseo.dotters.network`. Wrong URL → genesis-hash mismatch on every signed extrinsic.

2. **PAPI descriptors out of date.** If Hub TestNet runtime upgrades after we generate descriptors, calls may decode wrong or fail validation. Re-run `npx papi update` periodically; bake into CI.

3. **Existing player state.** As above — host H160 differs from MetaMask H160. If any tester's nexus game state lives under their MetaMask H160 on testnet, it's effectively gone after the cutover. Communicate this clearly.

4. **Gas / fee handling.** `Revive.call` charges fees in the substrate native token (PAS), not as ETH gas. The user needs PAS in their host substrate account, NOT on the H160. Currently the faucet hands out testnet tokens to substrate accounts — OK. But document this: telling a user "send testnet ETH to my MetaMask address" is wrong now.

5. **Next 16 + Turbopack vs WASM.** Stack-template uses Vite where the wasm + top-level-await plugins are mature. Next 16's Turbopack handling of `verifiablejs`'s WASM module is unverified. If it breaks, fallback to webpack config or switch the whole frontend to Vite — but the latter is not in scope.

6. **Contract size budgets.** Already at 96% of 24KB on `FleetResolver.sol` per CLAUDE.md. Nothing in this migration touches contracts, but flagging because the migration may incentivize new contract logic that the budget can't absorb.

## Reference: stack-template branch

When in doubt, `git diff origin/master..ba3255b -- web/src/` and `git show 0418637 -- web/src/hooks/useReviveCall.ts` on `Krayt78/polkadot-stack-template` show the working version of every primitive in this plan. Treat it as the executable spec.

Key commits:
- `163a114` — initial host-papp plumbing + reviveCall
- `ba3255b` — host-shell account preference + signer picker
- `716ec08` — live tx-progress (signSubmitAndWatch instead of signAndSubmit)
- `0418637` — `{ at: "best" }` fix for the storage-vs-finalization gap (the actually-load-bearing one)
