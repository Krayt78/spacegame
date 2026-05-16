'use client';

import NextLink from 'next/link';
import type { ComponentProps } from 'react';

import { appendCurrentParams } from '@/lib/hostNav';

/**
 * Drop-in replacement for `next/link`'s `Link` that re-attaches the
 * current `window.location.search` + `.hash` to the target href so dot.li's
 * sandbox params (`chainBackend`, etc.) survive client-side navigation.
 *
 * Without this, every Link click drops the query string and dot.li shows
 * its "Invalid sandbox URL — Missing required URL param `chainBackend`"
 * page instead of routing to the next dApp page.
 *
 * Only handles the common case where `href` is a string. If you need
 * Next.js's `UrlObject` href form, fall back to `next/link` directly and
 * manage params yourself.
 */
type Props = Omit<ComponentProps<typeof NextLink>, 'href'> & {
  href: string;
};

export function HostLink({ href, ...rest }: Props) {
  return <NextLink href={appendCurrentParams(href)} {...rest} />;
}
