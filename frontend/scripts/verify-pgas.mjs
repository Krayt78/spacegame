// Live-chain verification for the PGAS session design. Read-only except for
// the optional AutoMap probe, which needs a funded key.
//
//   node scripts/verify-pgas.mjs                      # read-only checks
//   AUTOMAP_SURI=//Alice node scripts/verify-pgas.mjs # + AutoMap probe
//
// Exits non-zero if a REQUIRED invariant fails.
import { createClient, AccountId } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { hub } from '@polkadot-api/descriptors';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy, DEV_PHRASE } from '@polkadot-labs/hdkd-helpers';
import { getPolkadotSigner } from 'polkadot-api/signer';
import { ss58ToH160, ss58Decode } from '@parity/product-sdk-address';

const WS = process.env.NEXT_PUBLIC_HUB_WS_URL ?? 'wss://paseo-asset-hub-next-rpc.polkadot.io';
// u32 on this chain — a JS number, NOT a bigint. papi reports the mismatch as
// the very misleading "Incompatible runtime entry Storage(Assets.Asset)".
const PGAS_ASSET = 2_000_000_000;
const PGAS_ERC20 = '0x7735940000000000000000000000000001200000';

const hexToBytes = (hex) =>
  Uint8Array.from(hex.slice(2).match(/../g).map((b) => parseInt(b, 16)));

/**
 * Compare SS58 addresses by their underlying public key.
 *
 * NEVER compare the strings: the same account renders differently per network
 * prefix (our keys default to 42/generic; this chain hands back prefix 0), so
 * string equality gives false negatives. This is the trap the skill flags and
 * the reason the design says "compare by bytes, not SS58 strings".
 */
const sameAccount = (a, b) => {
  if (!a || !b) return false;
  try {
    const pa = ss58Decode(a).publicKey;
    const pb = ss58Decode(b).publicKey;
    return pa.length === pb.length && pa.every((byte, i) => byte === pb[i]);
  } catch {
    return false;
  }
};

let failed = false;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { failed = true; console.log(`  FAIL  ${m}`); };
const info = (m) => console.log(`  ..    ${m}`);

const client = createClient(getWsProvider(WS));
const api = client.getTypedApi(hub);

console.log(`\nVerifying PGAS design against ${WS}\n`);

// 0. Sanity: are we on the chain the contracts live on?
console.log('0. Chain identity');
try {
  const spec = await client.getChainSpecData();
  info(`chain: ${spec.name}`);
  const finalized = await client.getFinalizedBlock();
  ok(`connected, finalized #${finalized.number}`);
} catch (e) {
  bad(`could not connect: ${e?.message ?? e}`);
}

// 1. PGAS claim amount is readable from chain (we must never hardcode it).
console.log('\n1. Pgas.PgasClaimAmount');
try {
  const claimAmount = await api.constants.Pgas.PgasClaimAmount();
  ok(`claim amount (constant) = ${claimAmount}`);
} catch (e1) {
  try {
    const claimAmount = await api.query.Pgas.PgasClaimAmount.getValue();
    ok(`claim amount (storage) = ${claimAmount}`);
  } catch (e2) {
    bad(`could not read PgasClaimAmount: constant=${e1?.message} storage=${e2?.message}`);
  }
}

// 2. PGAS asset exists and is sufficient (holdable with zero native).
console.log('\n2. Assets.Asset(2_000_000_000)');
let asset = null;
try {
  // Read at BEST, not the default finalized: check 3 compares this supply
  // against a ReviveApi.call dry-run (which runs at best). PGAS burns on every
  // use, so a finalized-vs-best read races and reports a phantom mismatch.
  asset = await api.query.Assets.Asset.getValue(PGAS_ASSET, { at: 'best' });
  if (!asset) bad('PGAS asset not found');
  else {
    ok(`supply=${asset.supply} min_balance=${asset.min_balance} status=${asset.status?.type}`);
    if (asset.is_sufficient === false) bad('PGAS is NOT sufficient — zero-native holding breaks');
    else ok('PGAS is sufficient (holdable with zero native)');
  }
} catch (e) {
  bad(`Assets.Asset query failed: ${e?.message ?? e}`);
}

// 3. The ERC-20 precompile responds and agrees with pallet-assets.
//    Signature (from .papi/descriptors/dist/hub.d.ts):
//      call(origin: SS58String, dest: SizedHex<20>, value: bigint,
//           gas_limit, storage_deposit_limit, input_data: Uint8Array, { at })
//    dest is a HEX STRING and input_data a RAW Uint8Array — passing Binary for
//    either yields "Incompatible runtime entry RuntimeCall(ReviveApi_call)".
console.log('\n3. PGAS ERC-20 precompile totalSupply()');
try {
  const result = await api.apis.ReviveApi.call(
    '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    PGAS_ERC20,
    0n,
    undefined,
    undefined,
    hexToBytes('0x18160ddd'), // totalSupply()
    { at: 'best' },
  );
  const data = result?.result?.value?.data;
  const hex = data?.asHex?.() ?? (data instanceof Uint8Array
    ? '0x' + Buffer.from(data).toString('hex') : undefined);
  if (!hex) bad(`precompile returned no data: ${JSON.stringify(result?.result?.type ?? result)}`);
  else {
    const supply = BigInt(hex);
    ok(`precompile totalSupply = ${supply}`);
    if (asset && supply !== asset.supply) bad(`MISMATCH vs Assets.Asset supply ${asset.supply}`);
    else if (asset) ok('precompile agrees with Assets.Asset supply — address confirmed live');
  }
} catch (e) {
  bad(`ReviveApi.call failed: ${e?.message ?? e}`);
}

// 3b. Confirm how an SS58 account maps to the H160 that keys OriginalAccount.
//     The AutoMap probe depends on this derivation, so validate it against real
//     on-chain entries rather than trusting the helper blindly.
console.log('\n3b. ss58ToH160 derivation vs live OriginalAccount entries');
try {
  const entries = await api.query.Revive.OriginalAccount.getEntries();
  info(`${entries.length} mapped accounts on chain`);
  const sample = entries.slice(0, 5);
  const mismatches = sample.filter(
    (e) => ss58ToH160(e.value).toLowerCase() !== e.keyArgs[0].toLowerCase(),
  );
  if (mismatches.length) {
    bad(`ss58ToH160 disagrees with chain for ${mismatches.length}/${sample.length} sampled entries`);
    for (const m of mismatches.slice(0, 2)) {
      info(`  chain key ${m.keyArgs[0]} but ss58ToH160(${m.value}) = ${ss58ToH160(m.value)}`);
    }
  } else {
    ok(`ss58ToH160 matches the chain for all ${sample.length} sampled entries`);
  }
} catch (e) {
  bad(`OriginalAccount entries query failed: ${e?.message ?? e}`);
}

// 4. THE GATE: does AutoMap fire on account creation?
//    Creating an account via a plain native transfer triggers OnNewAccount ->
//    AutoMapper. If the fresh account then has a Revive.OriginalAccount entry,
//    AutoMap is on and no explicit (non-free) map_account is ever needed.
console.log('\n4. AutoMap probe (Revive.OriginalAccount on a fresh account)');
const suri = process.env.AUTOMAP_SURI;
if (!suri) {
  info('AUTOMAP_SURI unset — skipping.');
  info('THE GATE IS NOT CLOSED until this probe runs and passes.');
} else {
  try {
    const derive = sr25519CreateDerive(
      entropyToMiniSecret(mnemonicToEntropy(process.env.AUTOMAP_MNEMONIC ?? DEV_PHRASE)),
    );
    const funder = derive(suri);
    const funderSigner = getPolkadotSigner(funder.publicKey, 'Sr25519', async (p) => funder.sign(p));
    const funderSs58 = AccountId().dec(funder.publicKey);

    const fresh = derive(`//probe${Date.now()}`);
    const freshSs58 = AccountId().dec(fresh.publicKey);
    info(`funder=${funderSs58}`);
    info(`fresh =${freshSs58}`);

    const funderInfo = await api.query.System.Account.getValue(funderSs58);
    info(`funder free balance = ${funderInfo?.data?.free ?? 0n}`);
    if (!funderInfo || funderInfo.data.free === 0n) {
      bad(`funder ${funderSs58} has no native balance — cannot run the probe. Fund it or use a different AUTOMAP_SURI.`);
    } else {
      const ed = await api.constants.Balances.ExistentialDeposit();
      info(`existential deposit = ${ed}`);

      // OriginalAccount is keyed by H160, NOT by SS58 (verified in 3b).
      const freshH160 = ss58ToH160(freshSs58);
      info(`fresh h160 = ${freshH160}`);

      // Must be unmapped before the account exists — otherwise the probe proves
      // nothing (a pre-existing entry would read as a false pass).
      const before = await api.query.Revive.OriginalAccount.getValue(freshH160);
      info(`OriginalAccount(fresh) before funding: ${before ?? 'none'}`);
      if (before) {
        bad('fresh account was ALREADY mapped — probe is inconclusive, rerun for a new key');
      } else {
        info('submitting Balances.transfer_allow_death…');
        const res = await api.tx.Balances.transfer_allow_death({
          dest: { type: 'Id', value: freshSs58 },
          value: ed * 2n,
        }).signAndSubmit(funderSigner);
        info(`included in block #${res?.block?.number ?? '?'} ok=${res?.ok}`);

        const after = await api.query.Revive.OriginalAccount.getValue(freshH160);
        info(`OriginalAccount(fresh) after funding: ${after ?? 'none'}`);

        if (sameAccount(after, freshSs58)) {
          ok('AutoMap IS ON — fresh account auto-mapped on creation, no map_account needed. GATE CLOSED.');
        } else if (after) {
          bad(`OriginalAccount(fresh) = ${after} which is a DIFFERENT key than ${freshSs58} — gate NOT closed`);
        } else {
          bad('AutoMap did NOT fire. Zero-native premise is broken — STOP and re-plan.');
        }
      }
    }
  } catch (e) {
    bad(`AutoMap probe errored: ${e?.message ?? e}`);
    console.error(e);
  }
}

console.log(failed ? '\nRESULT: FAILURES — do not proceed.\n' : '\nRESULT: all checks passed.\n');
client.destroy();
process.exit(failed ? 1 : 0);
