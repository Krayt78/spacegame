# `@parity/product-sdk-*` — Issues Found During Nexus Protocol Migration

Issues encountered migrating Nexus Protocol (Solidity contracts on `wss://asset-hub-paseo.dotters.network`) from MetaMask/ConnectKit to the Polkadot Triangle stack (`@parity/product-sdk-*` + `@novasamatech/product-sdk` + `polkadot-api` v2). Reported in roughly the order they bit us.

## Environment

| Package | Version |
| --- | --- |
| `@parity/product-sdk-signer` | `0.2.4` |
| `@parity/product-sdk-host` | `0.3.0` |
| `@parity/product-sdk-contracts` | `0.5.0` |
| `@parity/product-sdk-tx` | `0.2.3` |
| `@parity/product-sdk-chain-client` | `0.4.1` |
| `@parity/product-sdk-descriptors` | `0.4.0` |
| `@parity/product-sdk-address` | `0.1.1` |
| `@novasamatech/product-sdk` | `0.6.x` → `0.7.8` (see #3) |
| `polkadot-api` | `^2.0.0` (2.1.3 installed) |

Host: dot.li (production). Chain: Paseo Asset Hub via `wss://asset-hub-paseo.dotters.network`, genesis `0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2`.

---

## 1. `SignerManager.connect()` is destructive even when already connected — multi-mount React apps deadlock

**Severity:** High. Made the app unusable on `/game` (login loop, never settled).

**Where:** `@parity/product-sdk-signer@0.2.4`, `SignerManager.connect()` (dist/index.js:577–588).

**Behavior observed:** Every call to `signerManager.connect(providerType)` unconditionally:
1. Cancels any in-flight connect.
2. Calls `disconnectInternal()` — tears the provider down.
3. `setState({ status: 'connecting' })` — notifies all subscribers.
4. Starts a fresh connect.

In a React app where `useTriangle` (our wrapper) is mounted by ~10+ components on `/game` (every read hook in `useNexusGame.ts` consumes it), each new mount's `useEffect` calls `connect()`, which disconnects and reconnects the live session. Status oscillated `connecting ↔ connected`, `selectedAccount` flickered to null, and the UI never settled — visible as an infinite spinner / login loop.

**Suggested fix:** `connect()` should be idempotent when already in `connected` state with the same `providerType`. Either no-op + return current state, or expose an explicit `reconnect()` for the destructive path.

**Workaround we applied:** module-level promise cache so `connect()` is only called once per page load. Explicit `signIn()` from a user gesture resets the cache.

```ts
let initialConnect: Promise<unknown> | null = null;
function ensureInitialConnect() {
  if (initialConnect) return initialConnect;
  initialConnect = signerManager.connect(PROVIDER_TYPE);
  return initialConnect;
}
```

---

## 2. `SignerManager.subscribe()` doesn't seed the current state

**Severity:** Medium. Reinforces #1 — new mounts can't observe the live state without doing something that triggers a setState.

**Where:** `@parity/product-sdk-signer@0.2.4`, `SignerManager.subscribe()` (dist/index.js:561).

**Behavior observed:** `subscribe(cb)` only fires `cb` on subsequent `setState` calls. Newly mounted React components subscribing after the manager is already connected don't get the current state — they sit on `idleState` until something else changes.

**Suggested fix:** `subscribe(cb)` should fire `cb(this.state)` synchronously on subscribe, like Zustand / Jotai / RxJS BehaviorSubject. Or document explicitly and provide a `getState()` snapshot reader (which exists but isn't called out as required for this pattern).

**Workaround we applied:** every consumer reads `signerManager.getState()` once after subscribing, both at `useState` init and in the effect:

```ts
const [state, setState] = useState(() => signerManager.getState());
useEffect(() => {
  setState(signerManager.getState());
  return signerManager.subscribe(setState);
}, []);
```

---

## 3. `@novasamatech/product-sdk` 0.6 and 0.7 have incompatible `JsonRpcProvider` interfaces; `@parity/product-sdk-host` resolves to whichever is at the top level

**Severity:** Critical. Silent runtime crash. Cost us an hour of debugging across minified bundles.

**Where:**
- `@parity/product-sdk-host@0.3.0`, `getHostProvider()` (dist/index.js:24): `await import('@novasamatech/product-sdk')`.
- `@novasamatech/product-sdk@0.6.x` `papiProvider.js`: `send(message)` does `JSON.parse(message)` and `onMessage(JSON.stringify({...}))` — **string interface** (matches `@polkadot-api/json-rpc-provider@0.0.4`).
- `@novasamatech/product-sdk@0.7.x` `papiProvider.js`: `send(message)` uses `message.id` directly — **object interface** (matches `@polkadot-api/json-rpc-provider@0.2.0`).
- `polkadot-api@2.x` calls `connection.send({jsonrpc:"2.0", ...})` with parsed objects.

**Behavior observed:** With `@parity/product-sdk-signer@0.2.4` (which declares `@novasamatech/product-sdk: ^0.7.8` and gets it nested) AND our app declaring `@novasamatech/product-sdk: ^0.6.12` at the top level, npm installs both:

```
node_modules/@novasamatech/product-sdk                         → 0.6.18
node_modules/@parity/product-sdk-signer/node_modules/
  @novasamatech/product-sdk                                    → 0.7.8
```

`@parity/product-sdk-host`'s `getHostProvider` does a bare `import('@novasamatech/product-sdk')` — resolves to the **top-level 0.6.18**. polkadot-api v2 then calls `provider.send({...})` on 0.6's string-interface provider; the object coerces to `"[object Object]"`; `JSON.parse("[object Object]")` throws:

```
Uncaught SyntaxError: "[object Object]" is not valid JSON
  at JSON.parse (<anonymous>)
  at Object.a [as send] (5edb89a341d9fe01.js:1:23714)
  at Object.send (5edb89a341d9fe01.js:1:25580)
  at request (...)
  at chainHead (...)
```

The host login worked (the host accounts API doesn't go through the polkadot-api provider). The error only surfaces on the first chain RPC — for us, when the user clicked **Claim Planet** and the contracts SDK opened a chainHead subscription for the dry-run.

**Suggested fix:**
- `@parity/product-sdk-host` should either pin the `@novasamatech/product-sdk` major it uses (and refuse to resolve to incompatible versions) or import via a path that always resolves nested.
- The two SDK lines (0.6 string-interface vs 0.7 object-interface) are a breaking change that should be documented prominently in the host README. Detection should fail loudly on version mismatch, not silently call `JSON.parse` on objects.
- Consider a runtime assertion in `papiProvider` 0.6.x: `if (typeof message !== 'string') throw new Error('papiProvider 0.6 requires string-interface json-rpc-provider')`.

**Workaround we applied:** bumped our top-level pin from `^0.6.12` to `^0.7.8` so npm de-duplicates to 0.7.8 everywhere.

---

## 4. `getHostProvider(unsupportedGenesisHash)` returns a non-null shell provider that silently swallows sends

**Severity:** High. Silent failure with no API path to detect.

**Where:** `@parity/product-sdk-host@0.3.0`, `getHostProvider()` returning a provider built by `@novasamatech/product-sdk` `createPapiProvider()`.

**Behavior observed:** When the host doesn't support the requested chain genesis, the returned provider's `send()` is a no-op that logs `"Provider for chain <hash> was not started because Host doesn't support it"` (via `transport.provider.logger.error`) and discards the message. `getHostProvider()` itself returns the provider, not null.

Consumer code can't tell support from non-support without sending a message and seeing nothing happen:

```ts
const provider = await getHostProvider(genesis);
if (provider) {
  return createClient(provider);   // ← looks fine, but every send is /dev/null
}
```

This caused every contract call to hang silently after login worked — we had no errors, just timeouts.

**Suggested fix:**
- `getHostProvider(genesis)` should return `null` (or throw / return `err(...)`) when the host doesn't support the chain.
- Or expose a sync `isChainSupported(genesis): Promise<boolean>` before constructing the provider.
- At minimum, the no-op send should reject the in-flight request with a meaningful error rather than silently logging.

**Workaround we applied:** always use `polkadot-api/ws` directly for our chain, bypass `getHostProvider` entirely.

---

## 5. dot.li only proxies the official Paseo Asset Hub (`0x173cea…`), not other Paseo Asset Hub deployments (e.g. `wss://asset-hub-paseo.dotters.network`, genesis `0xd6eec…`)

**Severity:** Medium for us, may be a general issue for any dApp not using the SDK's blessed chain set.

**Where:** dot.li host, host-side chain registry.

**Behavior observed:** `host_feature_supported` for genesis `0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2` returns false. Our contracts are deployed there because the official Paseo Asset Hub's pallet-revive deployment isn't where we deployed (and re-deploying contracts is expensive).

Same problem with `@parity/product-sdk-descriptors/paseo-asset-hub`: the preset points at `wss://paseo-asset-hub-next-rpc.polkadot.io` (genesis `0x173cea…`), a different chain. The dApp had to maintain its own `.papi/descriptors`.

**Suggested fix:**
- Document which chains dot.li (and other hosts) natively support.
- Provide a way to register custom RPC endpoints with the host (even if just for sign-only, not subscriptions).
- Or document the recommended pattern (we ended up always using direct WS and skipping host RPC routing).

---

## 6. Legacy account signing fails on unsupported chains with a misleading error mentioning "product account id"

**Severity:** High. Blocked us at the last step of the integration.

**Where:** `@novasamatech/product-sdk@0.7.8`, `getLegacyAccountSigner()` → `hostApi.signPayloadWithLegacyAccount()` → host returns `SigningErr::Unknown`.

**Behavior observed:** With `signerManager.connect("host")` exposing legacy accounts (per the recommended happy path), the legacy account's signer is built via `getPolkadotSignerFromPjs(publicKey, signPayload, signRaw)` where `signPayload` calls `host_sign_payload_with_legacy_account`. The host then returns:

```
SigningErr::Unknown: Account can't be derived from product account id
```

Two confusing aspects:

1. We didn't request product-account signing. The error mentions "product account id" anyway, suggesting the host's `host_sign_payload_with_legacy_account` handler internally routes through product-account derivation logic.
2. There's no error code distinguishing "user denied", "host doesn't know this chain", "host doesn't know this account", "permission missing" — everything funnels through `SigningErr::Unknown` with a free-text reason.

**Suggested fix:**
- Stable error codes (`AccountUnknown`, `ChainUnsupported`, `UserRejected`, `PermissionDenied`, `Unknown`) so dApps can branch on them.
- Either fix the misleading "product account id" wording in the legacy code path, or clarify what the actual relationship is between legacy accounts and product-account derivation on the host side.
- Document whether legacy account signing is supposed to work on host-unsupported chains. If not, error early at connect time, not at sign time.

**Workaround we applied:** switched to product accounts (`signerManager.getProductAccount('nexus-protocol.dot', 0)`) and rebuilt the signing path around that. Different H160 from the legacy account — fine pre-launch, would be very painful for any dApp with shipped state.

---

## 7. `requestLogin` (v0.7 protocol) wasn't exposed by the 0.6 SDK line, and the 0.6 → 0.7 jump is breaking (see #3)

**Severity:** Low-medium. Plan-time friction, not a runtime crash.

**Behavior observed:** Migration plan called for `accountsProvider.requestLogin('Sign in to play X')` to trigger the host's native login UI. v0.6 of `@novasamatech/product-sdk` doesn't expose `requestLogin` — we fell back to a "click to retry connect" pattern and relied on the user already being signed into dot.li. Bumping to v0.7 also triggered #3.

**Suggested fix:** Make the version compatibility matrix between `@parity/product-sdk-*`, `@novasamatech/product-sdk`, `@novasamatech/host-api`, and `polkadot-api` explicit in README. Right now you have to read peer dep declarations across 5+ packages to figure out what's compatible with what.

---

## 8. `createChainClient` from `@parity/product-sdk-chain-client` has no direct-WS fallback — unusable in dev mode

**Severity:** Medium. Forced us to bypass the package entirely.

**Where:** `@parity/product-sdk-chain-client@0.4.1`.

**Behavior observed:** The package only constructs a client routed through the host. Running outside a host container (dev mode, local Next.js) means we never see a chain client and can't iterate without a dot.li deploy per change.

**Suggested fix:** Accept an optional `fallbackWsUrl` (or a `getFallbackProvider()` callback) so the same call site works in both host and non-host environments. Most dApps want this; right now everyone has to write the if/else themselves with `polkadot-api/ws`.

---

## 9. polkadot-api v1 → v2 path renames are silently breaking

**Severity:** Low. One-line fix once spotted.

**Behavior observed:** `polkadot-api/ws-provider/web` (the v1 import path documented in older `@parity/product-sdk-*` examples) no longer exists in v2. Moved to `polkadot-api/ws`. The import error was a generic module-not-found; nothing flagged this as a known v1→v2 migration.

**Suggested fix:** Either re-export the old path with a deprecation warning, or document the v1→v2 path changes in a centralized migration note. Right now the v2 release notes don't enumerate path renames that affect downstream packages.

---

## 10. Transitive `@polkadot-api/json-rpc-provider` not hoisted under Turbopack — required adding as a direct dep

**Severity:** Low. One-line fix in package.json.

**Behavior observed:** `@polkadot-api/json-rpc-provider-proxy` (transitive) imports `@polkadot-api/json-rpc-provider`, which Turbopack failed to resolve until we added it as a direct dep.

**Suggested fix:** Either pin it as a direct dep in `@parity/product-sdk-*`, or document the Turbopack hoisting quirk. (Same fix pattern likely applies to other transitive `@polkadot-api/*` packages — we may hit this again.)

---

## 11. Product-account dotNS identifier must match the deployed subdomain, but mismatch surfaces as `"Permission denied"`

**Severity:** High. Caused a "permission denied" dead-end with no actionable path forward; only solvable by spotting an obscure console line in the host's own log.

**Where:** dot.li host (`handleSignPayload`), validated against the dApp's loaded subdomain. The SDK / docs don't surface this constraint.

**Behavior observed:** We followed the migration plan and used `nexus-protocol.dot` as the `dotNsIdentifier` for `signerManager.getProductAccount(id, 0)`. Login + account derivation succeeded (the H160 displayed correctly in the UI, reads worked). On `claimStarterPlanet`, the host returned `"Permission denied"` to the dApp — no phone prompt — and logged in its own console:

```
[nexusprotocol00] handleSignPayload invoked: Object
[nexusprotocol00] handleSignPayload — invalid account[0]=nexus-protocol.dot
[tx] Transaction subscription error { error: "Permission denied" }
```

The dApp was deployed at `https://nexusprotocol00.dot.li`. dot.li expects the dotNS identifier to **match the subdomain** (`nexusprotocol00.dot`). Anything else gets rejected as "invalid account" — but the error returned to the dApp is the generic `"Permission denied"`, not `InvalidAccount` or `IdentifierMismatch`.

This conflated #11 (the permission-denial bug) with the actual cause (identifier mismatch) and sent us down the wrong investigation for half an hour.

**Suggested fix:**
- Return a distinct error variant for identifier mismatch (e.g., `SigningErr::InvalidAccount` or `SigningErr::IdentifierMismatch`), not `Permission denied`.
- Document the subdomain-matching constraint prominently in the product-account onboarding flow. Right now `signerManager.getProductAccount('any-string.dot', 0)` succeeds silently — the rejection only happens at sign time, far from the call site that picked the wrong identifier.
- Even better: `getProductAccount(id)` could return an error immediately if the id doesn't match the current host's expected scope, so dApps fail fast at boot instead of at first tx.
- Consider deriving the identifier automatically from `window.location.hostname` (strip `.li`) when no override is given, so dApps don't have to wire an env var.

**Workaround we applied:** Hardcoded `nexusprotocol00.dot` as the identifier, made it overridable via `NEXT_PUBLIC_DOT_NS_IDENTIFIER` env var, set it in `.env.production` / `.env.testnet`.

---

## 12. ChainSubmit permission denial is silently swallowed; `Ok(false)` is treated as success

**Severity:** High. Caused a silent permanent failure with no UX recovery path.

**Where:** `@parity/product-sdk-signer@0.2.4`, `HostProvider.tryConnect()` (dist/index.js:405–425), and the underlying `RemotePermissionV1` codec in `@novasamatech/host-api`.

**Behavior observed:** On connect, the SDK requests ChainSubmit permission via `sdk.hostApi.permission({ tag: "ChainSubmit", value: void 0 })`. The host's `remote_permission` RPC returns:

```ts
const RemotePermissionV1_response = Result(bool, GenericError);
//                                  ^^^^^^ Ok(true)=granted, Ok(false)=denied
```

So **user denial returns `Ok(false)`, not `Err`**. The SDK's match:

```ts
await sdk.hostApi.permission(request).match(
  () => log2.debug("ChainSubmit permission granted"),      // ← fires on Ok(false) too
  (error) => log2.warn("ChainSubmit permission rejected", ...)
);
```

…only branches on Ok-vs-Err. The bool inside the Ok is never inspected. A user who denies ChainSubmit gets logged as "granted" and the dApp proceeds. On the first transaction sign, the host returns `Permission denied`, **without prompting the user's phone** (because the decision is already cached). The dApp has no way to know it should re-prompt.

Worse: subsequent connects don't re-trigger the permission prompt (the host caches the denial), so the dApp is stuck in this state forever from the user's perspective. The only recovery is for the user to manually find a "connected dApps" panel in dot.li and revoke the cached denial.

We hit this after fixing issues #3 and #6 — Claim Planet failed instantly with `TxSigningRejectedError: Transaction signing was rejected.` / `[tx] Transaction subscription error {error: 'Permission denied'}`, no phone prompt, no signing UI, no actionable error.

**Suggested fix:**
- The SDK must check the bool inside `Ok` and treat `Ok(false)` as a denial, propagating it as an error.
- `HostProvider.connect()` should fail (or expose a `permissionGranted: false` state) if ChainSubmit was denied — currently it silently succeeds and the failure only manifests at the first sign attempt.
- Provide a way to re-request permissions after the initial connect (e.g., `signerManager.requestPermissions()`), since the user may have denied by mistake or revoked later.
- Document the relationship between the `RemotePermission.ChainSubmit` (void / global) and `Permission.ChainSubmit(GenesisHash)` (per-chain) codecs. Both exist in `@novasamatech/host-api`, but only the void variant is wired to an RPC (`remote_permission`); the per-chain variant has no callable transport binding. If per-chain is the future, ship the binding; if it's not, remove the dead codec.

**Workaround for end users (not the dApp):** revoke the cached denial in dot.li → reload → re-prompt. The dApp can't help here.

---

## 13. `StorageDepositNotEnoughFunds` dry-run failure isn't actionable from the SDK's surface

**Severity:** Low. Correct on-chain behavior, but bad first-run UX.

**Where:** `@parity/product-sdk-contracts@0.5.0` `tx()` → dry-run → returns failure with raw dispatch error.

**Behavior observed:** A first-time user with 0 PAS on their SS58 gets a `StorageDepositNotEnoughFunds` dry-run failure that surfaces as an unstyled JSON dispatch-error blob in the UI. The actual cause (need to fund the SS58 from the faucet) isn't expressed anywhere — the dApp has to interpret the variant and surface its own message.

**Suggested fix:** Provide a `formatDispatchError(error): { code, humanMessage, suggestedAction }` helper that maps common revive/system errors to actionable user-facing strings. We'd happily contribute the mapping for the common cases if there's a place for it.

---

## Cross-cutting recommendations

1. **Single source of truth for "what version of X works with version of Y."** A compatibility matrix in the monorepo README would have saved us most of this debugging time.
2. **Surface failures loudly, not quietly.** Issues #3 and #4 both manifested as silent hangs because the layer that detected the problem (`JSON.parse` of an object, host rejection of a chain) didn't propagate up.
3. **Provide a "this is the smallest working example for app X" page**, where app X is "contracts on a non-blessed chain, dev mode + host mode toggle, writes + reads." We ended up reverse-engineering this from `examples/contracts-demo` plus the source code.
4. **Document the legacy-account vs product-account decision matrix.** When does each work? On what chains? With what permission grants? Without this, picking the right one is guesswork until something fails at sign time.

---

## Repro / context

- Repo: this directory.
- Migration plan: [`TRIANGLE_MIGRATION_PLAN.md`](./TRIANGLE_MIGRATION_PLAN.md).
- Phase-1 post-mortem (earlier issues with the host-papp predecessor): [`HOST_SIGNING_PHASE_1_LESSONS.md`](./HOST_SIGNING_PHASE_1_LESSONS.md).
- Working diff for all workarounds: see `frontend/src/hooks/useTriangle.ts`, `frontend/src/hooks/useNexusContractWrite.ts`, `frontend/src/lib/triangle/chainClient.ts`.
