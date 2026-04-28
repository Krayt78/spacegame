'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useHasPlanet } from '@/hooks/useNexusGame';
import { useHostAddress } from '@/hooks/useHostAddress';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isConnected, isConnecting, isReconnecting } = useHostAddress();
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

  // Show loading state while checking connection or planet status
  // Skip planet check loading for onboarding page (it has its own loading state)
  if (isConnecting || isReconnecting || (isConnected && checkingPlanet && pathname !== '/game/onboarding')) {
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
            {isConnecting || isReconnecting ? 'Connecting to network...' : 'Loading game data...'}
          </p>
        </motion.div>
      </div>
    );
  }

  // Show nothing while redirecting
  if (!isConnected) {
    return null;
  }

  // Show nothing while redirecting to onboarding
  if (hasPlanet !== true && pathname !== '/game/onboarding') {
    return null;
  }

  return <>{children}</>;
}
