'use client';

import { useMemo } from 'react';
import { useActivePlanetId, usePlanetData, useCurrentResources, useProductionRates, useBlockTimestamp, useBuildTime, useShipQueue, useShipBuildTime } from '@/hooks';
import { GameLayout } from '@/components/layout';
import { BuildQueue, ShipQueue } from '@/components/game';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { formatNumber, calculateStorageCapacity } from '@/lib/utils';

function ResourceCard({ label, emoji, amount, cap, productionRate, colorVar }: {
  label: string;
  emoji: string;
  amount: number;
  cap: number;
  productionRate: number;
  colorVar: string;
}) {
  const ratio = amount / cap;
  const amountColor = ratio >= 0.95
    ? 'var(--accent-danger)'
    : ratio >= 0.80
      ? 'var(--accent-warn)'
      : colorVar;
  const barColor = ratio >= 0.95
    ? 'var(--accent-danger)'
    : ratio >= 0.80
      ? 'var(--accent-warn)'
      : 'var(--accent-primary)';

  return (
    <Card className="transition-colors" style={{ '--hover-border': colorVar } as React.CSSProperties}>
      <CardContent>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{emoji}</span>
          <div>
            <p className="text-[var(--text-muted)] text-sm">{label}</p>
          </div>
        </div>
        <p className="text-3xl font-mono mb-1" style={{ color: amountColor }}>
          {formatNumber(amount)}
        </p>
        <p className="text-[var(--text-muted)] text-sm mb-2">
          / {formatNumber(cap)}
        </p>
        {/* Capacity bar */}
        <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(ratio * 100, 100)}%`,
              backgroundColor: barColor,
            }}
          />
        </div>
        <p className="text-[var(--accent-primary)] text-sm">
          +{productionRate}/hr
        </p>
      </CardContent>
    </Card>
  );
}

export default function GameDashboard() {
  const { planetId, isLoading: loadingPlanetId } = useActivePlanetId();
  const { data: planetData, isLoading: loadingPlanet } = usePlanetData(planetId);
  const { data: resources } = useCurrentResources(planetId);
  const { data: production } = useProductionRates(planetId);

  // Get queue from planetData
  const queue = planetData ? planetData[3] : null;
  const hasActiveQueue = queue && Number(queue.completionTime) > 0;

  // Get block timestamp for time calculations
  const { timestamp: blockTimestamp } = useBlockTimestamp();

  // Fetch the actual build time from the contract for the queued building
  const queueBuildingType = queue ? Number(queue.buildingType) : 0;
  const queueCurrentLevel = queue ? Math.max(0, Number(queue.targetLevel) - 1) : 0;
  const { data: buildTimeData } = useBuildTime(
    hasActiveQueue ? queueBuildingType : 0,
    queueCurrentLevel
  );

  // Fetch ship queue data
  const { data: shipQueueData } = useShipQueue(planetId);

  // Parse ship queue and check active status
  const shipQueue = useMemo(() => {
    if (!shipQueueData) return null;
    return {
      shipType: Number(shipQueueData[0]),
      quantity: Number(shipQueueData[1]),
      completionTime: Number(shipQueueData[2]),
    };
  }, [shipQueueData]);

  const hasActiveShipQueue = shipQueue && shipQueue.shipType > 0 && shipQueue.completionTime > 0;

  // Fetch ship build time for progress calculation
  const shipyardLevel = planetData ? Number(planetData[1].shipyard) : 0;
  const { data: shipBuildTimeData } = useShipBuildTime(
    hasActiveShipQueue ? shipQueue.shipType : 0,
    hasActiveShipQueue ? shipQueue.quantity : 0,
    shipyardLevel
  );

  // Calculate time remaining and total duration for ship queue
  const shipQueueTimeInfo = useMemo(() => {
    if (!shipQueue || !hasActiveShipQueue) return { timeRemaining: 0, totalDuration: 0 };
    const completionTime = shipQueue.completionTime;
    const timeRemaining = Math.max(0, completionTime - blockTimestamp);
    const totalDuration = shipBuildTimeData ? Number(shipBuildTimeData) : timeRemaining;
    return { timeRemaining, totalDuration };
  }, [shipQueue, hasActiveShipQueue, blockTimestamp, shipBuildTimeData]);

  // Calculate time remaining and total duration for build queue
  const queueTimeInfo = useMemo(() => {
    if (!queue || !hasActiveQueue) return { timeRemaining: 0, totalDuration: 0 };
    const completionTime = Number(queue.completionTime);
    const timeRemaining = Math.max(0, completionTime - blockTimestamp);
    const totalDuration = buildTimeData ? Number(buildTimeData) : timeRemaining;
    return { timeRemaining, totalDuration };
  }, [queue, hasActiveQueue, blockTimestamp, buildTimeData]);

  // Show loading state
  if (loadingPlanetId || loadingPlanet) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-[var(--text-secondary)]">Loading command center...</p>
        </div>
      </GameLayout>
    );
  }

  // No planet data
  if (!planetData) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-[var(--text-secondary)]">No planet data available</p>
        </div>
      </GameLayout>
    );
  }

  const [planet, buildings, storedResources] = planetData;
  const [titaniumProd, helium3Prod, darkMatterProd] = production || [BigInt(0), BigInt(0), BigInt(0)];

  // Use live resources if available, otherwise fallback to stored
  const currentTitanium = resources?.[0] || storedResources.titanium;
  const currentHelium3 = resources?.[1] || storedResources.helium3;
  const currentDarkMatter = resources?.[2] || storedResources.darkMatter;

  // Storage caps
  const DEFAULT_STORAGE_CAP = 100000;
  const titaniumCap = Number(buildings.titaniumVault) === 0
    ? DEFAULT_STORAGE_CAP
    : calculateStorageCapacity('titaniumVault', Number(buildings.titaniumVault));
  const helium3Cap = Number(buildings.helium3Tank) === 0
    ? DEFAULT_STORAGE_CAP
    : calculateStorageCapacity('helium3Tank', Number(buildings.helium3Tank));
  const darkMatterCap = Number(buildings.darkMatterContainment) === 0
    ? DEFAULT_STORAGE_CAP
    : calculateStorageCapacity('darkMatterContainment', Number(buildings.darkMatterContainment));

  // Calculate total building levels for stats
  const totalBuildingLevels =
    Number(buildings.titaniumExtractor) +
    Number(buildings.helium3Harvester) +
    Number(buildings.darkMatterCollector) +
    Number(buildings.titaniumVault) +
    Number(buildings.helium3Tank) +
    Number(buildings.darkMatterContainment) +
    Number(buildings.shipyard) +
    Number(buildings.researchNode);

  return (
    <GameLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-display text-[var(--accent-primary)] mb-2">Command Center</h1>
          <p className="text-[var(--text-secondary)]">
            {planet.name} • Coordinates [{planet.coordinates[0]}:{planet.coordinates[1]}:{planet.coordinates[2]}]
          </p>
        </div>

        {/* Build Queue Status */}
        {hasActiveQueue && queue && planetId && (
          <BuildQueue
            planetId={planetId}
            queue={queue}
            initialTimeRemaining={queueTimeInfo.timeRemaining}
            totalDuration={queueTimeInfo.totalDuration}
          />
        )}

        {/* Ship Build Queue Status */}
        {hasActiveShipQueue && shipQueue && planetId && (
          <ShipQueue
            planetId={planetId}
            queue={shipQueue}
            initialTimeRemaining={shipQueueTimeInfo.timeRemaining}
            totalDuration={shipQueueTimeInfo.totalDuration}
          />
        )}

        {/* Resource Overview */}
        <div>
          <h2 className="text-xl font-display text-[var(--accent-secondary)] mb-4">Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Titanium */}
            <ResourceCard
              label="Titanium"
              emoji="💎"
              amount={Number(currentTitanium)}
              cap={titaniumCap}
              productionRate={Number(titaniumProd)}
              colorVar="var(--resource-titanium)"
            />

            {/* Helium-3 */}
            <ResourceCard
              label="Helium-3"
              emoji="🔮"
              amount={Number(currentHelium3)}
              cap={helium3Cap}
              productionRate={Number(helium3Prod)}
              colorVar="var(--resource-helium3)"
            />

            {/* Dark Matter */}
            <ResourceCard
              label="Dark Matter"
              emoji="⚫"
              amount={Number(currentDarkMatter)}
              cap={darkMatterCap}
              productionRate={Number(darkMatterProd)}
              colorVar="var(--resource-darkMatter)"
            />

          </div>
        </div>

        {/* Empire Stats */}
        <div>
          <h2 className="text-xl font-display text-[var(--accent-secondary)] mb-4">Empire Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader title="Infrastructure" />
              <CardContent>
                <p className="text-4xl font-mono text-[var(--accent-primary)] mb-1">
                  {totalBuildingLevels}
                </p>
                <p className="text-[var(--text-muted)] text-sm">Total building levels</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Production" />
              <CardContent>
                <p className="text-4xl font-mono text-[var(--accent-primary)] mb-1">
                  {Number(titaniumProd) + Number(helium3Prod) + Number(darkMatterProd)}
                </p>
                <p className="text-[var(--text-muted)] text-sm">Total resources/hr</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Fleet Power" />
              <CardContent>
                <p className="text-4xl font-mono text-[var(--text-muted)] mb-1">
                  0
                </p>
                <p className="text-[var(--text-muted)] text-sm">No ships built yet</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Building Overview */}
        <div>
          <h2 className="text-xl font-display text-[var(--accent-secondary)] mb-4">Infrastructure Overview</h2>
          <Card>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-[var(--text-muted)] text-sm mb-1">Titanium Extractor</p>
                  <p className="text-xl font-mono">Level {Number(buildings.titaniumExtractor)}</p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)] text-sm mb-1">Helium-3 Harvester</p>
                  <p className="text-xl font-mono">Level {Number(buildings.helium3Harvester)}</p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)] text-sm mb-1">Dark Matter Collector</p>
                  <p className="text-xl font-mono">Level {Number(buildings.darkMatterCollector)}</p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)] text-sm mb-1">Shipyard</p>
                  <p className="text-xl font-mono">Level {Number(buildings.shipyard)}</p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)] text-sm mb-1">Research Node</p>
                  <p className="text-xl font-mono">Level {Number(buildings.researchNode)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </GameLayout>
  );
}
