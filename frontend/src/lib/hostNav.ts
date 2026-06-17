'use client';

import { useRouter as useNextRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * dot.li launches the dApp at a URL like
 *   `https://spacegame.dot.li/?chainBackend=...&...`
 * The `chainBackend` (and friends) query params tell the host shell which
 * backend the sandbox should talk to. dot.li's outer shell **validates these
 * params on every navigation it sees** — if they're missing, you get an
 * "Invalid sandbox URL — Missing required URL param `chainBackend`" page
 * instead of your dApp.
 *
 * Next.js client-side navigation (`<Link>` or `router.push("/path")`) drops
 * the search string by default. That's how every in-app link manages to
 * break the sandbox.
 *
 * `appendCurrentParams` re-attaches the current `window.location.search` and
 * `window.location.hash` to a navigation target unless the target already
 * has its own. Used by the `Link` and `useRouter` wrappers below so every
 * call site stays in the sandbox without thinking about it.
 */
function appendCurrentParams(href: string): string {
  if (typeof window === 'undefined') return href;
  // If the caller already specified query or hash, leave it alone.
  if (href.includes('?') || href.includes('#')) return href;
  const { search, hash } = window.location;
  if (!search && !hash) return href;
  return `${href}${search}${hash}`;
}

/**
 * Drop-in replacement for `useRouter()` from `next/navigation` that
 * preserves dot.li sandbox params on `push` and `replace`. `back`/`forward`/
 * `refresh`/`prefetch` are forwarded untouched.
 */
export function useRouter() {
  const router = useNextRouter();
  const push = useCallback(
    (href: string, options?: Parameters<typeof router.push>[1]) =>
      router.push(appendCurrentParams(href), options),
    [router],
  );
  const replace = useCallback(
    (href: string, options?: Parameters<typeof router.replace>[1]) =>
      router.replace(appendCurrentParams(href), options),
    [router],
  );
  return useMemo(
    () => ({
      ...router,
      push,
      replace,
    }),
    [router, push, replace],
  );
}

/**
 * Same as `appendCurrentParams` but exposed for the `Link` wrapper. Kept
 * inline in the wrapper file (not re-exported here) because Next's Link
 * needs to be a separate client component anyway.
 */
export { appendCurrentParams };
