'use client';

import { useEffect, useState } from 'react';
import {
  connectInjectedExtension,
  type InjectedPolkadotAccount,
} from 'polkadot-api/pjs-signer';
import { injectSpektrExtension, SpektrExtensionName } from '@novasamatech/product-sdk';
import { isInHost } from '@/lib/host/hostEnv';

export type SpektrStatus =
  | 'detecting'
  | 'injecting'
  | 'connected'
  | 'unavailable'
  | 'failed';

export type SpektrSnapshot = {
  status: SpektrStatus;
  accounts: InjectedPolkadotAccount[];
};

let cachedSnapshot: SpektrSnapshot = {
  status: 'detecting',
  accounts: [],
};
let initPromise: Promise<void> | null = null;
let unsub: (() => void) | null = null;
const subscribers = new Set<(snap: SpektrSnapshot) => void>();

function notify() {
  for (const cb of subscribers) cb(cachedSnapshot);
}

function setSnapshot(next: Partial<SpektrSnapshot>) {
  cachedSnapshot = { ...cachedSnapshot, ...next };
  notify();
}

async function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isInHost()) {
      setSnapshot({ status: 'unavailable', accounts: [] });
      return;
    }
    setSnapshot({ status: 'injecting' });
    try {
      let injected = false;
      for (let i = 0; i < 10; i++) {
        if (await injectSpektrExtension()) {
          injected = true;
          break;
        }
        if (i < 9) await new Promise((r) => setTimeout(r, 500));
      }
      if (!injected) {
        setSnapshot({ status: 'failed' });
        return;
      }
      const ext = await connectInjectedExtension(SpektrExtensionName);
      const accounts = ext.getAccounts();
      setSnapshot({ status: 'connected', accounts });
      unsub?.();
      unsub = ext.subscribe((updated) => {
        setSnapshot({ accounts: updated });
      });
    } catch (e) {
      console.error('[useSpektrAccounts] init failed:', e);
      setSnapshot({ status: 'failed' });
    }
  })();
  return initPromise;
}

/**
 * Reactive view of accounts injected by the Polkadot Host shell (dot.li
 * exposes them via @novasamatech/product-sdk's Spektr injection).
 *
 * Init runs once globally; multiple components share the same accounts list
 * and the same wallet-side subscription.
 */
export function useSpektrAccounts(): SpektrSnapshot {
  const [snap, setSnap] = useState<SpektrSnapshot>(cachedSnapshot);
  useEffect(() => {
    subscribers.add(setSnap);
    setSnap(cachedSnapshot);
    ensureInit();
    return () => {
      subscribers.delete(setSnap);
    };
  }, []);
  return snap;
}
