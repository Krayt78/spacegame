'use client';

import { Rocket, Loader2 } from 'lucide-react';
import { GameLayout } from '@/components/layout';
import { FleetDispatchForm, FleetList } from '@/components/game';
import {
  usePlayerFleetIds,
  usePlayerFleetCount,
  usePlayerResearch,
  useBlockTimestamp,
} from '@/hooks/useNexusGame';

export default function FleetPage() {
  // Fetch active fleet IDs
  const { data: fleetIds, isLoading: isFleetIdsLoading } = usePlayerFleetIds();

  // Fetch fleet count for limit check
  const { data: fleetCount } = usePlayerFleetCount();

  // Fetch player research for Computer Tech (fleet limit)
  const { data: researchData } = usePlayerResearch();

  // Fetch block timestamp for countdown calculations
  const { timestamp: blockTimestamp } = useBlockTimestamp();

  // Calculate fleet limit from Computer Tech research
  const computerTechLevel = researchData?.computerTech ?? 0;
  const maxFleets = computerTechLevel;
  const currentFleets = Number(fleetCount ?? BigInt(0));

  // Loading state
  const isLoading = isFleetIdsLoading;

  if (isLoading) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">Loading fleet data...</p>
          </div>
        </div>
      </GameLayout>
    );
  }

  return (
    <GameLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-[var(--accent-warn)]/10 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-[var(--accent-warn)]" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                Fleet Command
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                Manage and deploy your fleet
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Fleet Limit</p>
            <p className="font-mono text-xl font-bold" style={{
              color: currentFleets >= maxFleets ? 'var(--accent-danger)' : 'var(--accent-primary)'
            }}>
              {currentFleets} / {maxFleets}
            </p>
            {computerTechLevel === 0 && (
              <p className="text-xs text-[var(--accent-warn)] mt-1">Research Computer Tech!</p>
            )}
          </div>
        </div>

        {/* Section 1: Dispatch Fleet */}
        <FleetDispatchForm
          currentFleets={currentFleets}
          maxFleets={maxFleets}
          computerTechLevel={computerTechLevel}
        />

        {/* Section 2: Active Fleets */}
        <FleetList
          fleetIds={fleetIds}
          blockTimestamp={blockTimestamp}
        />

      </div>
    </GameLayout>
  );
}
