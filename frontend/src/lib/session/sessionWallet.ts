import { AccountId } from 'polkadot-api';
import { getPolkadotSigner } from 'polkadot-api/signer';
import type { PolkadotSigner } from 'polkadot-api/signer';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';

const SESSION_PREFIX = 'nexus-session-';
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

export const SESSION_MIN_BALANCE = 500_000_000n;

// 3 PAS. Sovereignty's empirically-derived value — 0.3 PAS proved insufficient
// because dry-run is skipped in session mode and Paseo AH bills against the
// default weight limit even when the call is well under it.
export const SESSION_FUNDING_AMOUNT = 30_000_000_000n;

export interface SessionWalletData {
  seed: string;
  address: string;
  mainAddress: string;
  createdAt: number;
  expiresAt: number;
  isReady: boolean;
}

// Pure-JS Sr25519 via @polkadot-labs/hdkd (noble-curves under the hood).
// Avoids @polkadot/keyring + @polkadot/util-crypto, which pull in
// @polkadot/wasm-crypto-wasm — that package embeds WASM bytes inside a
// template literal whose escape sequences get re-emitted by Turbopack with
// `\0[digit]` patterns, which V8 rejects in strict mode ("Octal escape
// sequences are not allowed in template strings"). hdkd's tree is WASM-free.
const accountIdCodec = AccountId();

function u8aToHex(u8: Uint8Array): string {
  let hex = '0x';
  for (let i = 0; i < u8.length; i++) {
    hex += (u8[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToU8a(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomU8a(len: number): Uint8Array {
  const u = new Uint8Array(len);
  crypto.getRandomValues(u);
  return u;
}

// hdkd's createDerive returns a `(path: string) => KeyPair`. An empty path
// gives us the raw sr25519 keypair from the seed — no derivation applied.
function keypairFromSeed(seed: Uint8Array): {
  publicKey: Uint8Array;
  sign: (msg: Uint8Array) => Uint8Array;
} {
  return sr25519CreateDerive(seed)('');
}

export class SessionWalletManager {
  generate(mainAddress: string): SessionWalletData {
    const seed = randomU8a(32);
    const pair = keypairFromSeed(seed);
    const address = accountIdCodec.dec(pair.publicKey);
    const now = Date.now();

    const data: SessionWalletData = {
      seed: u8aToHex(seed),
      address,
      mainAddress,
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS,
      isReady: false,
    };

    this.save(data);
    return data;
  }

  getSigner(data: SessionWalletData): PolkadotSigner {
    const pair = keypairFromSeed(hexToU8a(data.seed));
    return getPolkadotSigner(pair.publicKey, 'Sr25519', async (payload) =>
      pair.sign(payload),
    );
  }

  restore(mainAddress: string): SessionWalletData | null {
    const key = this.storageKey(mainAddress);
    const stored =
      typeof window !== 'undefined' ? sessionStorage.getItem(key) : null;
    if (!stored) return null;

    try {
      const data: SessionWalletData = JSON.parse(stored);
      if (Date.now() > data.expiresAt) {
        this.clear(mainAddress);
        return null;
      }
      return data;
    } catch {
      this.clear(mainAddress);
      return null;
    }
  }

  markReady(mainAddress: string): void {
    const data = this.restore(mainAddress);
    if (data) {
      data.isReady = true;
      this.save(data);
    }
  }

  isReady(mainAddress: string): boolean {
    const data = this.restore(mainAddress);
    return data !== null && data.isReady;
  }

  clear(mainAddress: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(this.storageKey(mainAddress));
  }

  timeRemaining(data: SessionWalletData): number {
    return Math.max(0, data.expiresAt - Date.now());
  }

  private save(data: SessionWalletData): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(
      this.storageKey(data.mainAddress),
      JSON.stringify(data),
    );
  }

  private storageKey(mainAddress: string): string {
    return `${SESSION_PREFIX}${mainAddress.toLowerCase()}`;
  }
}

let _manager: SessionWalletManager | null = null;
export function getSessionWalletManager(): SessionWalletManager {
  if (!_manager) _manager = new SessionWalletManager();
  return _manager;
}
