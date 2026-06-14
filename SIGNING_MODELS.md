# Signing Models: Host Allowance vs Session Wallet

Nexus Protocol is an OGame-style strategy game where almost every player action
(build a mine, queue a ship, start research) is a **smart-contract write**. A naive
flow that prompts the user to sign every single transaction is unusable for this kind
of game. The codebase therefore implements **two distinct mechanisms** that reduce or
eliminate per-write prompts.

This document explains how each works, how they differ, and the trade-offs between them.

---

## TL;DR

| | **Host Allowance** | **Session Wallet** |
|---|---|---|
| What it is | A host-managed auto-signing budget | An on-chain proxy delegation to an ephemeral key |
| Where signing happens | In the Polkadot Host (off-chain) | In the browser, locally (no host involvement) |
| Setup cost | 1 host permission prompt | 1 on-chain transaction (fund + `add_proxy`) |
| Per-write prompts | 0, up to ~1000 calls | 0, until expiry |
| Key custody | Host holds the key | Frontend holds an ephemeral keypair |
| Funding | Host pays fees | Session key must be funded (30 PAS) from main account |
| Lifetime | Until budget exhausted / re-auth | 2 hours, or until tab closes / revoked |
| Scope | All writes | `@nexus/game` writes only |
| Status | Requested at connect; the implicit fallback path | Fully implemented; the primary opt-in UX path |

Both coexist in the current code. The allowance is requested automatically on connect;
the session wallet is an explicit opt-in ("Start session") that, when active, takes over
all game writes.

---

## 1. Host Allowance (`requestResourceAllocation`)

This is the **"Allowance request"** dialog the host shows on connect — the one reading
*"Sign transactions automatically / Sign up to 1000 smart-contract calls automatically."*

### How it works

When the user connects via the Polkadot Host, the `onConnect` callback in the signer
manager asks the host for two resource allocations:

`frontend/src/lib/triangle/signerManager.ts`
```ts
const AUTO_SIGN_CALL_BUDGET = 1000;

onConnect: async (_account, { requestResourceAllocation, signal }) => {
  const requested = [
    { tag: "AutoSigning", value: undefined },
    { tag: "SmartContractAllowance", value: AUTO_SIGN_CALL_BUDGET },
  ] as const;
  const outcomes = await requestResourceAllocation([...requested]);
  // ...logs Allocated / NotAvailable per item
};
```

These map directly to the dialog text:

- **`AutoSigning`** → *"Sign transactions automatically"*. Currently returns
  `NotAvailable` on the live `paseo-next-v2` host — requested for future use.
- **`SmartContractAllowance: 1000`** → *"Sign up to 1000 smart-contract calls
  automatically"*. This is the lever doing the real work today, and it is required to
  unblock `AuthorizeCall` on the chain's `pallet_revive`.

### Mechanics

- It is a **host-level permission grant**, not a blockchain transaction. Nothing is
  written on-chain.
- The host keeps the master signing key. Approving the allowance tells the host it may
  sign up to 1000 contract calls on the user's behalf without prompting per call.
- The 1000 budget is sized to cover a full play session. Once exhausted, the host
  re-prompts.
- The "Allocating…" button state is the host processing the grant in the background.

### When it's used

When **no session is active**, writes fall through to the standard `ContractManager`
path, which signs via the host and consumes this allowance budget:

`frontend/src/hooks/useNexusContractWrite.ts` (fallback path)
```ts
const contract = manager.getContract(library);
const result = await fn.tx(...args, { signer }); // host signs; respects allowance budget
```

---

## 2. Session Wallet (`pallet_proxy` delegation)

The session wallet is the app's own zero-prompt mechanism. Instead of asking the host to
auto-sign, it creates a throwaway keypair in the browser and authorizes it on-chain to
act **as a proxy** for the main account.

### Step by step

**A. Generate an ephemeral keypair** — `frontend/src/lib/session/sessionWallet.ts`
- 32 random bytes from `crypto.getRandomValues()` seed a pure-JS Sr25519 keypair
  (`@polkadot-labs/hdkd`, no WASM).
- The seed is stored as hex in `sessionStorage`, keyed `nexus-session-<mainAddress>`.
- The seed is **never sent to the host** — it lives only in the browser tab.

```ts
const seed = randomU8a(32);
const pair = keypairFromSeed(seed);
const data: SessionWalletData = {
  seed: u8aToHex(seed),
  address,                                 // SS58 of the session key
  mainAddress,                             // the player's real account
  createdAt: now,
  expiresAt: now + SESSION_DURATION_MS,    // 2 hours
  isReady: false,                          // true only after on-chain delegation confirms
};
```

**B. Fund + delegate in one batched transaction** — `frontend/src/hooks/useNexusSession.ts`

A single `Utility.batch_all` is signed **once** by the main account (one host prompt):

```ts
const fundCall = api.tx.Balances.transfer_keep_alive({
  dest: { type: 'Id', value: wallet.address },
  value: SESSION_FUNDING_AMOUNT,           // 30 PAS — pays the session key's fees
});
const addProxyCall = api.tx.Proxy.add_proxy({
  delegate: { type: 'Id', value: wallet.address },
  proxy_type: { type: 'Any', value: undefined },
  delay: 0,
});
const batch = api.tx.Utility.batch_all({ calls: [fundCall.decodedCall, addProxyCall.decodedCall] });
result = await batch.signAndSubmit(hostSigner);
manager.markReady(address);                // only after on-chain confirmation
```

On-chain, this funds the session key and registers it as an `Any` proxy of the main
account. (Retries once on `BadProof` for stale host metadata right after page load.)

**C. Sign writes locally, with zero prompts** — `frontend/src/hooks/useNexusContractWrite.ts`

While a session is ready and unexpired, game writes take the session path:

```ts
const useSessionPath =
  library === '@nexus/game' &&
  sessionData?.isReady === true &&
  sessionManager.timeRemaining(sessionData) > 0;
```

The contract call is encoded, wrapped in `Revive.call(...)` with conservative weight
limits, then wrapped again in `Proxy.proxy({ real: main, call: inner })` and signed by
the **session key locally** — the host is never involved:

```ts
const sessionSigner = sessionManager.getSigner(sessionData);
const result = await proxied.signAndSubmit(sessionSigner); // no prompt
```

At runtime `pallet_proxy` flips the origin to `real: main`, so the contract sees
`msg.sender = main` — identical to the host-signed path. The code checks both the outer
`ExtrinsicFailed` and the inner `Proxy.ProxyExecuted` result for success.

> Note: the session path **skips the dry-run** that the host path performs, which is why
> it uses fixed conservative weight limits (`SESSION_REVIVE_REF_TIME`, etc.) instead.

**D. Lifetime & expiry**
- `SESSION_DURATION_MS = 2 hours`. On restore past `expiresAt`, the session is cleared.
- A health monitor polls roughly every second for local expiry and on-chain balance;
  the UI shows "Session expired — restart" when time runs out.
- Storage is `sessionStorage`, so closing the tab ends the session.
- Revocation is explicit (`Proxy.remove_proxy`) or by timeout/tab close.

### Relevant constants
```
SESSION_DURATION_MS            = 2h
SESSION_FUNDING_AMOUNT         = 30 PAS
SESSION_MIN_BALANCE            = 0.05 PAS (health threshold)
APPROX_COST_PER_ACTION         ≈ 60,000,000 planck per write
```

---

## 3. Differences at a glance

| Aspect | Host Allowance | Session Wallet |
|---|---|---|
| Mechanism | Off-chain host budget | On-chain `pallet_proxy` delegation |
| Setup | 1 host permission prompt, no chain write | 1 on-chain tx (fund + `add_proxy`) |
| Who signs writes | The host | The browser-held session key |
| Per-write prompts | 0 (up to budget) | 0 (until expiry) |
| Re-prompt trigger | Budget exhausted (~1000) / re-auth | Session expiry (2h) / tab close |
| Key custody | Host holds the key | Frontend holds an ephemeral key |
| On-chain footprint | None | `Proxy.Proxies` entry + refundable deposit |
| Funding / fees | Host pays | Session key must be funded (30 PAS); fees from its balance |
| Scope | All writes (`@nexus/game` + `@nexus/config`) | `@nexus/game` only |
| Dry-run before sign | Yes (standard flow) | No (conservative fixed weights) |
| Revocation | Host-side; auto on tab close | Explicit `remove_proxy` or timeout |

---

## 4. Pros & cons

### Host Allowance

**Pros**
- No on-chain setup and no token funding — the host pays all fees.
- Works for every write, including admin `@nexus/config` calls.
- Budget persists across a tab close; re-prompts only after ~1000 writes.
- Standard dry-run path catches weight/revert issues before submitting.

**Cons**
- Still prompts again once the budget is exhausted.
- Entirely dependent on host behavior; `SmartContractAllowance` must be granted, and
  `AutoSigning` is not yet available on `paseo-next-v2`.
- No user-facing way to revoke mid-session (resets only on re-auth).
- The host holds the signing key — less user custody.

### Session Wallet

**Pros**
- True zero-prompt gameplay for the full 2-hour window after a single setup approval.
- Player keeps custody: the key is ephemeral, browser-local, and never sent to the host.
- Ephemeral + funded with a bounded amount (30 PAS) limits blast radius if compromised.
- Independent of host auto-signing support — works even where `AutoSigning` is unavailable.

**Cons**
- Requires an on-chain setup tx and ties up 30 PAS of liquidity for the session.
- Limited to `@nexus/game` writes by design.
- Mid-game expiry forces a restart (re-fund + re-delegate).
- Skips the dry-run, so it relies on conservative hardcoded weight limits.
- The seed sits in `sessionStorage`; a compromised tab exposes pending writes until expiry.

---

## 5. How they fit together (practical flow)

1. **Connect** → host grants `SmartContractAllowance(1000)`. Writes are auto-signed by
   the host until the budget runs out.
2. **Start session** (opt-in) → one setup prompt funds and delegates a session key. All
   `@nexus/game` writes are then signed locally with **zero prompts** for 2 hours.
3. **End / expire session** → writes fall back to the host allowance path.
4. **Budget exhausted** → the host re-prompts.

In short: the **allowance** is the always-on fallback that keeps casual play smooth; the
**session wallet** is the opt-in path that makes active play completely prompt-free at the
cost of an on-chain setup and some locked liquidity.

---

## File reference

| File | Role |
|---|---|
| `frontend/src/lib/triangle/signerManager.ts` | Requests the host allowance on connect |
| `frontend/src/lib/triangle/productIdentifier.ts` | Derives the dotNS identifier (the app name in the dialog) |
| `frontend/src/lib/session/sessionWallet.ts` | Session keypair generation, storage, lifetime |
| `frontend/src/hooks/useNexusSession.ts` | Session setup (fund + `add_proxy` batch) |
| `frontend/src/hooks/useNexusSessionHealth.ts` | Periodic balance / delegation / expiry polling |
| `frontend/src/hooks/useNexusContractWrite.ts` | Write dispatch: session path vs host fallback |
| `frontend/src/components/.../SessionBadge.tsx` | Session control UI |
