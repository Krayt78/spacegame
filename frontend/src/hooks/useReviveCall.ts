'use client';

import { type Abi, type Address, encodeFunctionData } from 'viem';
import { Binary, FixedSizeBinary, type PolkadotSigner } from 'polkadot-api';
import { hub } from '@polkadot-api/descriptors';
import { getPapiClient, getHubWsUrl } from '@/lib/papiClient';

export type ReviveCallParams = {
  signer: PolkadotSigner;
  originSs58: string;
  contractAddress: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
  /** Optional progress callback so the UI can show 'broadcast', 'in block', etc. */
  onProgress?: (stage: string) => void;
};

function h160ToBytes(addr: string): FixedSizeBinary<20> {
  const hex = addr.startsWith('0x') ? addr.slice(2) : addr;
  if (hex.length !== 40) {
    throw new Error(`Expected 20-byte H160, got ${hex.length / 2} bytes`);
  }
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return FixedSizeBinary.fromBytes(bytes);
}

/**
 * Submit a tx and watch progress (broadcast → best-block → finalized). Resolves
 * at "in best block" (~6s) so the UI updates fast; we DON'T wait for full
 * finalization (~30s on Paseo). Returns the same `{ ok, txHash, dispatchError }`
 * shape signAndSubmit produces.
 */
async function watchSubmit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: { signSubmitAndWatch: (signer: PolkadotSigner) => any },
  signer: PolkadotSigner,
  onStage: (stage: string) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ ok: boolean; txHash: string; dispatchError?: any }> {
  return new Promise((resolve, reject) => {
    const sub = tx.signSubmitAndWatch(signer).subscribe({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (e: any) => {
        if (e.type === 'signed') onStage('signed by wallet');
        else if (e.type === 'broadcasted') onStage('broadcasted to network');
        else if (e.type === 'txBestBlocksState') {
          if (e.found) {
            onStage(`included in best block ${String(e.block.hash).slice(0, 10)}…`);
            sub.unsubscribe();
            resolve({
              ok: e.ok,
              txHash: e.txHash,
              dispatchError: e.dispatchError,
            });
          } else {
            onStage('waiting for inclusion…');
          }
        }
      },
      error: (err: unknown) => reject(err),
    });
  });
}

/**
 * One-time mapping of an sr25519 AccountId32 → H160 in pallet-revive's address
 * mapper. Required before that account can be the origin of `Revive.call`.
 *
 * IMPORTANT: queries run at `{ at: 'best' }` because `signSubmitAndWatch`
 * resolves at best-block but PAPI defaults to finalized — the latter is
 * ~30s behind on Paseo, which makes a freshly-applied map_account look
 * unmapped to the dry-run that follows.
 */
export async function mapAccountIfNeeded(
  signer: PolkadotSigner,
  originSs58: string,
  onProgress?: (stage: string) => void,
): Promise<FixedSizeBinary<20>> {
  const client = getPapiClient(getHubWsUrl());
  const api = client.getTypedApi(hub);
  const mappedH160 = await api.apis.ReviveApi.address(originSs58, { at: 'best' });
  const existing = await api.query.Revive.OriginalAccount.getValue(mappedH160, {
    at: 'best',
  });
  if (existing) {
    onProgress?.('Account already mapped, skipping registration');
    return mappedH160;
  }
  onProgress?.('Mapping account (one-time)…');
  const tx = api.tx.Revive.map_account();
  const result = await watchSubmit(tx, signer, (s) => onProgress?.(`map_account: ${s}`));
  if (!result.ok) {
    const err = result.dispatchError;
    const alreadyMapped =
      err?.type === 'Module' &&
      err?.value?.type === 'Revive' &&
      err?.value?.value?.type === 'AccountAlreadyMapped';
    if (!alreadyMapped) {
      throw new Error(`Revive.map_account failed: ${JSON.stringify(err)}`);
    }
  }
  // Confirm the mapping is visible at "best" before returning. map_account
  // landed in the best block, but a small propagation window can still trip
  // the next runtime API call.
  for (let i = 0; i < 6; i++) {
    const seen = await api.query.Revive.OriginalAccount.getValue(mappedH160, {
      at: 'best',
    });
    if (seen) return mappedH160;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Revive.map_account: mapping did not appear in storage within 6s');
}

/**
 * Submit an EVM contract call by wrapping it in a substrate `pallet_revive::call`
 * extrinsic and signing it with a substrate (sr25519) signer. The contract sees
 * `msg.sender` as the revive-mapped H160 of the substrate account.
 *
 * Steps:
 *   1. Ensure the substrate origin is registered with the address mapper.
 *   2. Encode the call data via viem (using the contract ABI).
 *   3. Dry-run via ReviveApi.call (at: best) for gas + storage estimate;
 *      catch contract reverts before signing.
 *   4. Build Revive.call with the dry-run-derived limits.
 *   5. signSubmitAndWatch with the host's PolkadotSigner.
 */
export async function reviveCall(params: ReviveCallParams) {
  const { signer, originSs58, contractAddress, abi, functionName, args, onProgress } =
    params;
  const value = params.value ?? BigInt(0);

  await mapAccountIfNeeded(signer, originSs58, onProgress);

  const callData = encodeFunctionData({
    abi,
    functionName,
    args: args as readonly unknown[] as never,
  });
  const data = Binary.fromHex(callData);
  const dest = h160ToBytes(contractAddress);

  const client = getPapiClient(getHubWsUrl());
  const api = client.getTypedApi(hub);

  const dryRun = await api.apis.ReviveApi.call(
    originSs58,
    dest,
    value,
    undefined,
    undefined,
    data,
    { at: 'best' },
  );
  if (!dryRun.result.success) {
    const err = dryRun.result.value;
    throw new Error(`Revive dry-run failed: ${JSON.stringify(err)}`);
  }

  const weight_limit = {
    ref_time: dryRun.weight_required.ref_time,
    proof_size: dryRun.weight_required.proof_size,
  };
  const storage_deposit_limit =
    dryRun.storage_deposit.type === 'Charge' ? dryRun.storage_deposit.value : BigInt(0);

  const tx = api.tx.Revive.call({
    dest,
    value,
    weight_limit,
    storage_deposit_limit,
    data,
  });

  onProgress?.(`Submitting Revive.call (${functionName})…`);
  const result = await watchSubmit(tx, signer, (s) => onProgress?.(`call: ${s}`));
  return { result, dryRun };
}
