import { Keccak256, getSs58AddressInfo } from '@polkadot-api/substrate-bindings';

/**
 * Map a substrate AccountId32 (or SS58 address) to the H160 used by
 * pallet-revive when the call originates from a substrate-signed extrinsic.
 *
 * Eth-derived accounts are detected by the trailing `0xEE` padding pattern
 * that pallet-revive produces when an Eth address is wrapped into AccountId32.
 * Everything else is hashed with keccak256 and truncated to 20 bytes.
 */
export function accountIdToH160(addressOrAccountId: string): `0x${string}` {
  let pub: Uint8Array | null = null;

  if (addressOrAccountId.startsWith('0x')) {
    const hex = addressOrAccountId.slice(2);
    if (hex.length === 64) {
      pub = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        pub[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
    }
  } else {
    const info = getSs58AddressInfo(addressOrAccountId);
    if (info.isValid) pub = info.publicKey;
  }

  if (!pub || pub.length !== 32) {
    return '0x0000000000000000000000000000000000000000';
  }

  const isEthDerived = pub.slice(20).every((b) => b === 0xee);
  const ethBytes = isEthDerived ? pub.slice(0, 20) : Keccak256(pub).slice(-20);
  const hex = Array.from(ethBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}`;
}
