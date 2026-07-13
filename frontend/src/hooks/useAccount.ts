'use client';

import { useAccount as useWagmiAccount } from 'wagmi';

import { APP_MODE } from '@/lib/mode';
import { useHostAddress } from '@/hooks/useHostAddress';

/**
 * Mode-routed account hook. Returns the H160 the contracts see as `address`
 * plus the substrate SS58 (`ss58Address`, host mode only) and connection
 * flags. Consumers across the app destructure some subset of
 * `{ address, ss58Address, isConnected, isConnecting }` — this normalizes both
 * transports onto that shape.
 *
 *  - host mode → `useHostAddress()` (the revive-mapped H160 of the Host
 *    product account; `ss58Address` is the real SS58).
 *  - evm mode  → wagmi's `useAccount()` (the injected-wallet H160; there is no
 *    substrate identity, so `ss58Address` is always undefined).
 */
export type NexusAccount = {
  address: `0x${string}` | undefined;
  ss58Address: string | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
};

function useEvmAccount(): NexusAccount {
  const a = useWagmiAccount();
  return {
    address: a.address,
    ss58Address: undefined,
    isConnected: a.isConnected,
    isConnecting: a.isConnecting,
    isReconnecting: a.isReconnecting,
  };
}

// `useHostAddress` returns a superset of `NexusAccount` (it also carries
// isInHost / isReady / isReconnecting), which is structurally assignable here.
export const useAccount: () => NexusAccount =
  APP_MODE === 'host' ? useHostAddress : useEvmAccount;
