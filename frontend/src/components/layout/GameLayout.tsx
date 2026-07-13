'use client';

import { ReactNode, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from '@/hooks/useAccount';
import { GameHeader } from './GameHeader';
import { Navigation } from './Navigation';
import { usePlanetStore } from '@/stores/planetStore';
import { TutorialSidebar } from '@/components/game/TutorialSidebar';
import { cn } from '@/lib/utils';

interface GameLayoutProps {
  children: ReactNode;
  className?: string;
}

export function GameLayout({ children, className }: GameLayoutProps) {
  const { address, isConnected } = useAccount();
  const { currentPlanet, setPlanet } = usePlanetStore();

  // Initialize mock data on mount (for development)
  // TODO: Replace with actual blockchain data fetch when smart contracts are deployed
  useEffect(() => {
    if (isConnected && address && !currentPlanet) {
      setPlanet({
        id: 'planet-1',
        owner: address,
        name: 'Genesis Node',
        coordinates: [1, 1, 1],
        buildings: {
          titaniumExtractor: 1,
          helium3Harvester: 1,
          darkMatterCollector: 0,
          titaniumVault: 0,
          helium3Tank: 0,
          darkMatterContainment: 0,
          shipyard: 0,
          researchNode: 0,
          undergroundBunker: 0,
        },
        resources: {
          titanium: 12450,
          helium3: 89200,
          darkMatter: 4520,
        },
        production: {
          titanium: 1250,
          helium3: 890,
          darkMatter: 45,
        },
        lastUpdated: Date.now(),
      });
    }
  }, [isConnected, address, currentPlanet, setPlanet]);

  const contentVariants = {
    initial: { opacity: 0, y: 10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: 'easeOut' as const,
      },
    },
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] bg-grid">
      {/* Scanline Effect Overlay */}
      <div className="fixed inset-0 pointer-events-none scanlines opacity-30 z-50" />

      {/* Header */}
      <GameHeader />

      {/* Main Layout */}
      <div className="flex">
        {/* Sidebar Navigation */}
        <Navigation />

        {/* Main Content Area */}
        <main
          className={cn(
            'flex-1 min-h-[calc(100vh-72px)]',
            'p-4 lg:p-6 xl:p-8',
            'overflow-x-hidden'
          )}
        >
          <motion.div
            variants={contentVariants}
            initial="initial"
            animate="animate"
            className={cn(
              'max-w-7xl mx-auto',
              className
            )}
          >
            {children}
          </motion.div>
        </main>

        {/* Tutorial Quest Sidebar */}
        <TutorialSidebar />
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--bg-tertiary)] bg-[var(--bg-secondary)]/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-4">
              <span>Nexus Protocol v0.1.0</span>
              <span className="hidden sm:inline">|</span>
              <span className="hidden sm:inline">Powered by Polkadot</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="#"
                className="hover:text-[var(--accent-primary)] transition-colors"
              >
                Documentation
              </a>
              <a
                href="#"
                className="hover:text-[var(--accent-primary)] transition-colors"
              >
                Discord
              </a>
              <a
                href="#"
                className="hover:text-[var(--accent-primary)] transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default GameLayout;
