import { getTypedApi } from '@/lib/triangle/chainClient';

/**
 * PGAS: the personhood-gated gas asset. Sufficient (holdable with zero native)
 * and burnable. The runtime's ChargePGAS extension pays fees from a signer's
 * PGAS balance for Revive calls and all-Revive batches ONLY — one non-Revive
 * call in a batch forfeits it for the whole extrinsic.
 *
 * Constants below are live-verified against paseo-next-v2 (2026-07-15) by
 * `scripts/verify-pgas.mjs`.
 */

/**
 * A JS number, NOT a bigint — the asset id is a u32. Passing 2_000_000_000n
 * makes papi throw "Incompatible runtime entry Storage(Assets.Asset)", which
 * looks like a stale-descriptor problem and isn't.
 */
export const PGAS_ASSET_ID = 2_000_000_000;

/**
 * PGAS ERC-20 precompile: asset id as 4 BE bytes ++ 12 zero bytes ++ prefix
 * 0x0120 ++ 2 zero bytes. Confirmed live: totalSupply() equals Assets.Asset supply.
 *
 * ONLY USABLE FOR RECIPIENTS pallet-revive CAN RESOLVE — i.e. accounts already in
 * `Revive.OriginalAccount`. That's the product account (mapped when claim_pgas
 * created it), so the teardown drain uses this and stays free (a lone Revive
 * call → ChargePGAS covers it).
 *
 * DO NOT use it to fund a fresh session key. A session key's H160 is
 * keccak256(pubkey)[12..] — one-way — so pallet-revive cannot resolve it to the
 * key and instead credits the `h160 ++ 0xEE*12` fallback, an account with no
 * private key. The key then signs from its SS58, ChargePGAS reads 0 there, and
 * the pool rejects with Invalid::Payment. Use `Assets.transfer` to the SS58
 * instead — see useNexusSession's setup batch.
 */
export const PGAS_ERC20 = '0x7735940000000000000000000000000001200000' as const;

/**
 * PGAS as a fee-asset Location, for paying a non-Revive tx through the
 * DOT↔PGAS AssetConversion pool (papi's `asset:` option → the chain's
 * `ChargeAssetTxPayment` extension). Shape matches the live pool key.
 *
 * This is what makes the setup batch cost zero native despite containing
 * `Assets.transfer`, which is not ChargePGAS-eligible.
 */
export const PGAS_FEE_LOCATION = {
  parents: 0,
  interior: {
    type: 'X2' as const,
    value: [
      { type: 'PalletInstance' as const, value: 50 },
      { type: 'GeneralIndex' as const, value: BigInt(PGAS_ASSET_ID) },
    ],
  },
};

/** Fraction of the on-chain claim amount moved to the session key. */
const SESSION_FUNDING_RATIO_PCT = 20n;

/** Hex string → raw bytes. ReviveApi.call wants Uint8Array, not Binary. */
export const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from((hex.slice(2).match(/../g) ?? []).map((b) => parseInt(b, 16)));

/** Raw bytes (or a papi Binary) → hex string. */
export const bytesToHex = (data: unknown): string | undefined => {
  const asBinary = data as { asHex?: () => string } | undefined;
  if (typeof asBinary?.asHex === 'function') return asBinary.asHex();
  if (data instanceof Uint8Array) {
    return `0x${Array.from(data)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;
  }
  return undefined;
};

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

/**
 * PGAS decimals, read from asset metadata.
 *
 * Live-verified: PGAS has NO metadata set on paseo-next-v2 — empty name/symbol
 * and decimals = 0 — so balances render raw. Read it anyway rather than
 * hardcoding: if metadata is ever set, formatting follows automatically.
 */
export async function getPgasDecimals(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (await getTypedApi()) as any;
  const meta = await api.query.Assets.Metadata.getValue(PGAS_ASSET_ID);
  return meta?.decimals ?? 0;
}
