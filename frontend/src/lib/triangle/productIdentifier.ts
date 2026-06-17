/**
 * dotNS identifier the host uses to derive our app-scoped product account —
 * the keypair the host signs with on every chain, including chains it hasn't
 * been explicitly told about (which is why we use product accounts instead of
 * legacy accounts; see PARITY_SDK_ISSUES.md #6).
 *
 * dot.li authorizes signing only when the identifier equals `<label>.dot`
 * for the subdomain the dApp is loaded from; mismatch surfaces as a generic
 * "Permission denied" (PARITY_SDK_ISSUES.md #11). We therefore derive it
 * from `window.location` at call time, handling BOTH dot.li URL schemes:
 *   spacegame.dot.li      → spacegame.dot   (legacy scheme)
 *   spacegame.app.dot.li  → spacegame.dot   (current scheme —
 *     the `.app` segment must be stripped too, or the host rejects
 *     createTransaction with PermissionDenied; ignite/Sovereignty fix)
 * `NEXT_PUBLIC_DOT_NS_IDENTIFIER` remains as an explicit override for odd
 * deployments; off dot.li (e.g. Polkadot Desktop pointing elsewhere) we
 * fall back to the canonical production identifier.
 *
 * Only called client-side (from the host provider factory at connect time),
 * so there's no SSR/hydration concern with reading `window` here.
 *
 * The H160 derived from this product account is DIFFERENT from the legacy
 * account's H160 — any pre-existing testnet planets stored under the
 * legacy H160 are orphaned. Acceptable pre-launch per the migration plan.
 */
export function computeProductIdentifier(): string {
  const override = process.env.NEXT_PUBLIC_DOT_NS_IDENTIFIER;
  if (override) return override;
  if (typeof window === 'undefined') return 'spacegame.dot';
  const host = window.location.host;
  return host.endsWith('.dot.li')
    ? host.replace(/\.li$/, '').replace(/\.app\.dot$/, '.dot')
    : 'spacegame.dot';
}

export const PRODUCT_ACCOUNT_INDEX = 0;
