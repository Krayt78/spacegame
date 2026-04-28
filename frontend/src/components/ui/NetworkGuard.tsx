'use client';

/**
 * In host-signing mode there is no wallet network to be on the "wrong" side
 * of — the dApp targets a single chain configured at build time
 * (NEXT_PUBLIC_CHAIN), and signing routes through the Polkadot Host's
 * substrate signer rather than an EVM wallet. Kept as a passthrough
 * component for now so call sites don't need to be edited; we can remove it
 * entirely in a later cleanup pass.
 */
export function NetworkGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
