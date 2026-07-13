'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useRouter } from '@/lib/hostNav';
import { motion } from 'framer-motion';
import { useHasPlanet } from '@/hooks/useNexusGame';
import { useAccount } from '@/hooks/useAccount';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isConnected, isConnecting, isReconnecting } = useAccount();
  const { hasPlanet, isLoading: checkingPlanet, isError } = useHasPlanet();

  useEffect(() => {
    // Only redirect if we've finished checking connection status
    if (!isConnecting && !isReconnecting && !isConnected) {
      router.push('/');
      return;
    }

    // Skip planet check if already on onboarding page
    if (pathname === '/game/onboarding') return;

    // Redirect to onboarding if connected but no planet (or if we can't verify)
    // hasPlanet !== true covers: false, undefined, or error cases
    if (isConnected && !checkingPlanet && hasPlanet !== true) {
      router.push('/game/onboarding');
    }
  }, [isConnected, isConnecting, isReconnecting, hasPlanet, checkingPlanet, isError, pathname, router]);

  // Show a loading state any time we're transitioning rather than ready
  // to render children. Returning `null` here causes a black-screen window
  // while a redirect is in flight (Next App Router + static export can take
  // seconds to swap routes), so always render the spinner instead.
  const shouldShowLoading =
    isConnecting ||
    isReconnecting ||
    !isConnected ||
    (isConnected && checkingPlanet && pathname !== '/game/onboarding') ||
    (isConnected && hasPlanet !== true && pathname !== '/game/onboarding');

  if (shouldShowLoading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-accent-primary/20 rounded-sm rotate-45 animate-pulse" />
            <div className="absolute inset-2 bg-accent-primary/10 rounded-sm rotate-45" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 border-2 border-transparent border-t-accent-primary rounded-full"
            />
          </div>
          <p className="font-display text-lg text-text-secondary tracking-wide">
            {isConnecting || isReconnecting
              ? 'Connecting to network...'
              : !isConnected
              ? 'Waiting for host pairing...'
              : checkingPlanet
              ? 'Loading game data...'
              : 'Redirecting...'}
          </p>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
