'use client';

import { contractsConfigured } from '@/lib/contracts';

/**
 * Renders a full-screen warning when contract addresses are missing from env vars.
 * Shown instead of the game UI so developers get immediate, actionable feedback
 * rather than chasing silent query failures.
 */
export function ContractConfigWarning({ children }: { children: React.ReactNode }) {
  if (contractsConfigured) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-bg-card border border-status-danger/40 p-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-status-danger text-2xl">!!</span>
          <h2 className="font-display text-lg font-bold text-status-danger uppercase tracking-wider">
            Contracts Not Configured
          </h2>
        </div>

        <p className="text-text-secondary text-sm leading-relaxed mb-4">
          The game cannot connect to smart contracts because the required environment
          variables are missing.
        </p>

        <div className="bg-bg-primary border border-bg-tertiary p-4 mb-4 font-mono text-xs text-text-muted">
          <p className="text-text-secondary mb-2"># 1. Deploy contracts</p>
          <p className="text-accent-primary">cd game_project_contracts</p>
          <p className="text-accent-primary mb-3">npm run deploy:local</p>
          <p className="text-text-secondary mb-2"># 2. Copy addresses to .env.local</p>
          <p className="text-accent-primary">NEXT_PUBLIC_NEXUS_GAME_ADDRESS=0x...</p>
          <p className="text-accent-primary mb-3">NEXT_PUBLIC_GAME_CONFIG_ADDRESS=0x...</p>
          <p className="text-text-secondary mb-2"># 3. Restart the dev server</p>
          <p className="text-accent-primary">npm run dev</p>
        </div>

        <p className="text-text-muted text-xs">
          See <span className="text-text-secondary">.env.example</span> for all available configuration options.
        </p>
      </div>
    </div>
  );
}
