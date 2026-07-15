import { createLocalKvStore, type LocalKvStore } from '@parity/product-sdk-local-storage';
import { SessionKeyManager, type DerivedAccount } from '@parity/product-sdk-keys';

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
 * the recovery story. The user-facing warning lives in SessionBadge's consent
 * modal.
 *
 * HOST-ONLY. `createLocalKvStore` throws outside a host container, so every
 * read path here degrades to "no session" rather than propagating. Only the
 * explicit setup path (getOrCreateSessionKey) surfaces the error, because
 * there the user asked for a session and deserves to know why it failed.
 */

const STORE_PREFIX = 'nexus-protocol';
// Namespaced per product-account index so dev multi-account setups don't share
// a session key.
const KEY_NAME = `session-${PRODUCT_ACCOUNT_INDEX}`;
const CREATED_AT_KEY = `${KEY_NAME}-created-at`;

/**
 * Client-side session lifetime. This is UX hygiene, NOT a security control:
 * it cannot bind anyone actually holding the key, it just prompts a re-setup
 * so stale sessions don't linger. Only on-chain revocation is enforcement.
 */
export const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000;

/** The session key material. Aliased from the SDK so the shapes can't drift. */
export type SessionAccount = DerivedAccount;

/**
 * A live session: the key plus its client-side lifetime. Replaces the old
 * `SessionWalletData`. `expiresAt` keeps SessionBadge's countdown working —
 * but remember it's UX only; the chain doesn't know about it.
 */
export interface NexusSession extends SessionAccount {
  createdAt: number;
  expiresAt: number;
}

let _store: LocalKvStore | null = null;
let _keys: SessionKeyManager | null = null;

/** Throws outside a host container — see `tryGetStore` for the safe read path. */
async function getStore(): Promise<LocalKvStore> {
  if (!_store) _store = await createLocalKvStore({ prefix: STORE_PREFIX });
  return _store;
}

/** null instead of throwing when host storage isn't available. */
async function tryGetStore(): Promise<LocalKvStore | null> {
  try {
    return await getStore();
  } catch {
    return null;
  }
}

export async function getSessionKeys(): Promise<SessionKeyManager> {
  if (!_keys) {
    _keys = new SessionKeyManager({ store: await getStore(), name: KEY_NAME });
  }
  return _keys;
}

/**
 * Create a session key, or return the existing one. Silent — never prompts.
 * Throws if host storage is unavailable: this is only called from explicit
 * session setup, where a silent failure would be worse than an error.
 */
export async function getOrCreateSessionKey(): Promise<SessionAccount> {
  const keys = await getSessionKeys();
  // getOrCreate() returns { mnemonic, account } — the useful fields are on
  // .account. Only the mnemonic is persisted.
  const { account } = await keys.getOrCreate();
  return account;
}

/**
 * The stored session key, or null.
 *
 * NEVER trust this without on-chain validation — a persisted key can outlive
 * its registration (and vice versa). Callers must check
 * registry.sessionOf(owner) against it before use. See useNexusSession.
 */
export async function getStoredSessionKey(): Promise<SessionAccount | null> {
  const store = await tryGetStore();
  if (!store) return null;
  const keys = await getSessionKeys();
  const stored = await keys.get();
  return stored?.account ?? null;
}

export async function clearSessionKey(): Promise<void> {
  const store = await tryGetStore();
  if (!store) return;
  const keys = await getSessionKeys();
  await keys.clear();
  await store.remove(CREATED_AT_KEY);
}

export async function getSessionCreatedAt(): Promise<number | null> {
  const store = await tryGetStore();
  if (!store) return null;
  const raw = await store.get(CREATED_AT_KEY);
  const ts = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(ts) ? ts : null;
}

export async function setSessionCreatedAt(ts: number): Promise<void> {
  const store = await getStore();
  await store.set(CREATED_AT_KEY, String(ts));
}

/** Attach client-side lifetime to a bare key. */
export function toSession(
  account: SessionAccount,
  createdAt: number,
): NexusSession {
  return { ...account, createdAt, expiresAt: createdAt + SESSION_EXPIRY_MS };
}
