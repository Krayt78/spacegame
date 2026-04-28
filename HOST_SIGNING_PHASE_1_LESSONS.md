# Host-Signing Phase 1 — Post-Mortem & Lessons Learned

The first phase of the host-signing migration ([HOST_SIGNING_PLAN.md](./HOST_SIGNING_PLAN.md)) — auth bootstrap on the landing page using the Polkadot Host (dot.li / Spektr) account — shipped as `frontend/src/hooks/useHostAddress.ts` + `useSpektrAccounts.ts` + a rewired landing page. Reads now use the host's revive-mapped H160 as the player address. End state: the dApp at `https://my-nexus42.dot.li` detects authentication, redirects through `/game` → `/game/onboarding`, and renders the onboarding form.

This is the friction we hit getting there, the root cause for each, and what to remember next time.

---

## The seven problems

### 1. "CONTRACTS NOT CONFIGURED" overlay on every page

**Symptom:** After the first DotNS deploy, the landing page rendered the dev-time "Contracts Not Configured" warning instead of normal content.

**Root cause:** The static export evaluates `NEXT_PUBLIC_*` env vars **at build time** and bakes their values into the JS chunks. `npm run build:static` (= `STATIC_EXPORT=1 next build`) didn't source any env file, so contract addresses were empty strings in the bundle.

**Fix:** `scripts/deploy-frontend.sh` now sources `frontend/.env.testnet` (or `.env.production` as fallback) via `set -a; . "$ENV_FILE"; set +a` before invoking the build.

**Lesson:** Static exports are environment-frozen at build time. **There is no runtime env**. Treat every `NEXT_PUBLIC_*` like a build-time constant and make sure the build pipeline sees it. Adding a `--env <file>` override flag to the deploy script is cheap insurance.

---

### 2. "WRONG NETWORK" full-screen block

**Symptom:** Once the host paired and we redirected to `/game`, NetworkGuard rendered "Wrong Network — Required: Polkadot Hub TestNet (ID 420420417), Current: ID 31337".

**Root cause:** Two-part:
1. We removed wagmi connectors (the host signer isn't a wagmi connector). With **no connector**, wagmi's `useChainId()` falls back to `chains[0]` from the config.
2. `wagmiConfig.ts` listed `[localhost, polkadotHubTestnet]` — so `chains[0]` was `localhost (31337)`, even though the build was for testnet.

**Fix:**
- Order `chains` based on `NEXT_PUBLIC_CHAIN` so the active chain is always at index 0.
- Make `NetworkGuard` a passthrough — there is no "wallet network" to be wrong about in host-signing mode; the dApp targets a single chain configured at build time.

**Lesson:** When you remove all wagmi connectors, every wagmi hook that reads "current network" silently falls back to `chains[0]`. Audit those hooks. Consider whether the guards (NetworkGuard, switch-network buttons, useEnsName, useDisconnect) still make conceptual sense.

---

### 3. Black screen #1: React error #418 (hydration mismatch)

**Symptom:** After the redirect from `/`, the entire page went black. Console: `Minified React error #418`.

**Root cause:** Static export pre-renders the HTML at build time with **no `window`** → `isInHost()` returned `'standalone'` → page rendered the "Open in Polkadot Host" CTA. That HTML was baked into `out/index.html`. On the client inside dot.li's iframe, `isInHost()` returned `'web-iframe'` → first React render produced "Awaiting host pairing…". React compared the two trees, saw a mismatch at the root, and **aborted hydration of the entire page**, unmounting everything → black.

**Fix:** Gate browser-only conditionals behind a `mounted` flag in `useHostAddress`. The hook returns SSR-safe defaults (`isInHost: false`, `isConnecting: true`) until its first `useEffect` flips `mounted = true`. The first client render now matches the static HTML; the post-mount re-render is a normal state update, not a hydration check.

**Lesson:** `static export + client-only branching = hydration land mine`. Anything that depends on `window`, `document`, `iframe-self`, or any other browser API **cannot** be allowed to differ between SSR and the first client render. The pattern:
```ts
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return /* SSR-safe defaults */;
return /* real client values */;
```

---

### 4. Black screen #2: `return null` during route transitions

**Symptom:** Hydration was fixed but the page still went black after auth — except now `[useHasPlanet] address: 0xed654c…, hasPlanet: false` showed in the console. So data was loading. Where was the UI?

**Root cause:** `ProtectedRoute` had `if (hasPlanet !== true && pathname !== '/game/onboarding') return null`. The intent was "we're transitioning, render nothing for one frame." But Next App Router + static export + dot.li service worker has a route-swap window that's **seconds long**, not frames. `null` rendered for the entire transition → black.

**Fix:** Replace every `return null` transition path with the loading spinner. Now the user sees "Loading game data…" → "Redirecting…" → onboarding form, never an empty DOM.

**Lesson:** `return null` in transitional states works in dev (~16ms) but fails on slow paths (cold service worker, P2P CID fetch, multi-second IPFS resolution). Always render *something* during a transition. Use `null` only when you genuinely mean "this component never produces output", never as a placeholder.

---

### 5. Black screen #3 (would-be): `trailingSlash: true` mis-routing

**Symptom:** Suspected, never directly confirmed in production — but `trailingSlash: true` makes `router.push('/game')` not match the canonical `/game/`, which the dot.li service worker may not handle.

**Root cause:** Set in `next.config.ts` on a hunch when adding `output: 'export'`. The Next docs even recommend it for some IPFS setups, but it interferes with App Router client-side navigation against a static manifest served via service worker.

**Fix:** Removed.

**Lesson:** `trailingSlash` is one of those flags whose effects depend on the host. If your static export needs it, your hosting setup is probably non-standard — drill into what's actually rejecting the trailing-slash-less form before adding the flag.

---

### 6. Stale CID — "the deploy didn't update anything"

**Symptom:** After redeploying, the browser logged `RESOLVED my-nexus42.dot ... -> bafybeic3c4...` — same CID as the previous run, even though the deploy script clearly printed a new `bafybeiexlca…`.

**Root cause:** dot.li's host shell caches the resolved subdomain → CID mapping in the service worker / IndexedDB / localStorage. Hard reload (`Ctrl+Shift+R`) busts the page cache but **not** the SW's subdomain-resolution cache.

**Fix (per session):** Open in incognito, or:
```js
caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
localStorage.clear();
indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
location.reload();
```

**Lesson:** When iterating against a service-worker-served app, always verify the exact CID resolved by the browser matches the CID just deployed. The deploy log is the source of truth; the browser may be lying.

---

### 7. "Page didn't react when I authenticated" — `ext.subscribe` no-shows

**Symptom:** dot.li's internal log showed:
```
[dot.li auth] sessions subscription fired, count: 1
[dot.li auth] authenticated Object
```
But the dApp stayed on "Waiting for you to pair…" indefinitely. `useSpektrAccounts` never re-rendered.

**Root cause:** `polkadot-api/pjs-signer`'s `connectInjectedExtension(name)` returns an extension object with `.subscribe(cb)` that wraps the underlying `window.injectedWeb3[name].accounts.subscribe(cb)`. We registered the callback. But **`@novasamatech/product-sdk`'s Spektr injection appears to fire that subscription only at initial subscribe time** — when dot.li's session list changes after the dApp has loaded, the change does not propagate through this channel.

**Fix:** Keep the PJS subscribe as the primary channel (it's correct and free when it works), AND poll `ext.getAccounts()` once a second as a safety net. If the polled list differs from the cached snapshot, push an update.

**Lesson:** Subscriptions across third-party JS bridges are not reliable. Treat them as best-effort, and pair them with a low-frequency poll. One wasted function call per second is much cheaper than a stuck UI.

---

## Cross-cutting takeaways

### Trust the deploy log, not the browser
For each fix, "did this work?" can only be answered after confirming the browser is running the new bundle. Two ways to know:
1. The deploy script's printed CID matches the `RESOLVED ... ->` line in dot.li's console
2. The frame counter / commit hash baked into the bundle is the new one

If either is off, your fix isn't being tested — you're testing the previous build.

### SSR + browser-only state needs a mounted gate
If any branching in your render depends on `window`, `document`, `navigator`, iframe state, or storage — gate it on a `mounted` flag and return SSR-safe defaults until after the first effect. This was the load-bearing fix. Even the cleverest app architecture won't survive #418 unmounting your entire root.

### Prefer "render something" over `return null` for transitions
On slow paths, the gap can be seconds. The user should always see *something* — a spinner, a status string, a placeholder. Reserve `null` for "this component genuinely has nothing to show in this state, and that's correct."

### Static-export + service-worker host = aggressive cache audit
Test every change in incognito or after a full SW + storage clear. Don't trust your normal browser session. The set of caches in play (browser HTTP, service worker, dot.li's CID cache, Helia's block store, archive cache, React Query) is large enough that one of them will catch you out.

### Wagmi without connectors has surprising defaults
- `useChainId()` falls back to `chains[0]`
- `useAccount()` returns undefined for everything
- `useReadContract` still works (uses transport directly)
- `useWriteContract` will throw at submit time
- `useEnsName`, `useDisconnect`, `useSwitchChain` are conceptually meaningless and should probably be removed

### dot.li resolution is build-time, not runtime
The CID baked into `<name>.dot` on chain is what dot.li resolves to. Updating the dApp means: rebuild → upload to IPFS → update DotNS contenthash → wait for chain finality → wait for dot.li SW to refresh its cache. Each step has its own timing. Plan iteration cycles around this.

---

## Files that ended up in Phase 1

**New:**
- `frontend/src/lib/host/hostEnv.ts` — `isInHost()` / `detectHostEnvironment()`
- `frontend/src/lib/host/addressMapping.ts` — sr25519 AccountId → revive-mapped H160
- `frontend/src/lib/host/pappAdapter.ts` — singleton `@novasamatech/host-papp` adapter (PWallet QR pairing infra; not used in Phase 1 but ready for Phase 2)
- `frontend/src/hooks/useSpektrAccounts.ts` — singleton hook over `@novasamatech/product-sdk`'s Spektr iframe injection, with polling fallback
- `frontend/src/hooks/useHostAddress.ts` — wagmi-`useAccount`-shaped shim with mounted gate
- `frontend/public/papp-metadata.json` — required by host-papp's confirmation screen
- `scripts/deploy-frontend.sh` — env-aware static-export → IPFS + DotNS publisher
- `HOST_SIGNING_PLAN.md`, `HOST_SIGNING_PHASE_1_LESSONS.md` (this file)

**Modified:**
- `frontend/next.config.ts` — `STATIC_EXPORT=1` gate for `output: "export"` + `images.unoptimized`; webpack `asyncWebAssembly` experiment for `verifiablejs`
- `frontend/package.json` — added host-papp / product-sdk / statement-store / polkadot-api / qrcode.react; `build:static` script
- `frontend/src/lib/wagmiConfig.ts` — bare `createConfig`, no connectors, active chain at index 0
- `frontend/src/components/providers/Web3Provider.tsx` — drops `ConnectKitProvider`
- `frontend/src/components/auth/ProtectedRoute.tsx` — spinner instead of null on transitions
- `frontend/src/components/ui/NetworkGuard.tsx` — passthrough
- `frontend/src/app/page.tsx` — host-environment-aware landing page
- `frontend/src/components/layout/{GameHeader,GameLayout}.tsx`, `frontend/src/components/game/BattleReportCard.tsx`, `frontend/src/app/game/{settings,galaxy}/page.tsx`, `frontend/src/hooks/useNexusGame.ts` — all swapped from wagmi `useAccount` to the `useHostAddress` shim
- `.gitignore` — `frontend/out/`

**What still works:** every read hook (`useHasPlanet`, `usePlanetData`, `useCurrentResources`, etc.) via wagmi's HTTP transport, keyed by the host's revive-mapped H160.

**What does not work yet (deliberately):** every write. `useWriteContract` calls have no signer because we removed connectors. They will throw at submit time. Fixing this is Phase 2 — replace the write path with `pallet_revive::call` extrinsics signed by the host's substrate signer (proven on `Krayt78/polkadot-stack-template @ experiment/pwallet-host-signing`).
