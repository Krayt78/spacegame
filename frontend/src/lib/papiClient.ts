import { createClient, type PolkadotClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider/web';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';

const DEFAULT_WS_URL = 'wss://asset-hub-paseo.dotters.network';

let client: PolkadotClient | null = null;
let currentUrl: string | null = null;

/**
 * Singleton PAPI client over the Polkadot Hub TestNet substrate WS endpoint.
 * Used for `pallet_revive::call` extrinsics signed by the host wallet —
 * eth-rpc reads stay on viem; only the substrate-extrinsic write path comes
 * through here.
 */
export function getPapiClient(wsUrl: string = DEFAULT_WS_URL): PolkadotClient {
  if (!client || currentUrl !== wsUrl) {
    if (client) client.destroy();
    client = createClient(withPolkadotSdkCompat(getWsProvider(wsUrl)));
    currentUrl = wsUrl;
  }
  return client;
}

export function getHubWsUrl(): string {
  return process.env.NEXT_PUBLIC_HUB_WS_URL || DEFAULT_WS_URL;
}
