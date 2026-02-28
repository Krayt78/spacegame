'use client';

import { Card, CardHeader, CardContent } from '@/components/ui';
import { FleetCard } from './FleetCard';
import { Rocket } from 'lucide-react';

interface FleetListProps {
  fleetIds: readonly bigint[] | undefined;
  blockTimestamp: number;
}

export function FleetList({ fleetIds, blockTimestamp }: FleetListProps) {
  const hasFleets = fleetIds && fleetIds.length > 0;

  return (
    <Card>
      <CardHeader
        title="Active Fleets"
        subtitle={`${fleetIds?.length ?? 0} fleet${fleetIds?.length !== 1 ? 's' : ''} in motion`}
      />
      <CardContent className="space-y-3">
        {!hasFleets ? (
          <div className="text-center py-8">
            <Rocket className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
            <p className="text-[var(--text-muted)]">
              No active fleets. Dispatch a fleet above to get started.
            </p>
          </div>
        ) : (
          fleetIds.map((fleetId) => (
            <FleetCard
              key={fleetId.toString()}
              fleetId={fleetId}
              blockTimestamp={blockTimestamp}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default FleetList;
