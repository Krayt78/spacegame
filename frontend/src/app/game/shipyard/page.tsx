'use client';

import { useMemo, useCallback } from 'react';
import { Wrench, Loader2, XCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { GameLayout } from '@/components/layout';
import { Card, CardContent, Button } from '@/components/ui';
import { ShipQueue, ShipCard } from '@/components/game';
import {
  useActivePlanetId,
  usePlanetData,
  useCurrentResources,
  useShips,
  useShipQueue,
  useBuildShips,
  useBlockTimestamp,
  useShipBuildTime,
  usePlayerResearch,
  SHIP_TYPE_MAP,
  SHIP_TYPE_INDEX,
  type ResearchLevels,
} from '@/hooks';
import type { Resources, Research, Ships } from '@/types/game';
import { formatNumber } from '@/lib/utils';
import { SHIP_CATEGORIES, SHIP_ICON_MAP, SHIP_NAMES } from '@/constants/gameConfig';

export default function ShipyardPage() {
  // Get data from chain
  const { planetId, isLoading: isLoadingPlanetId } = useActivePlanetId();
  const { data: planetData, isLoading: isLoadingPlanet } = usePlanetData(planetId);
  const { data: currentResourcesData } = useCurrentResources(planetId);
  const { data: shipsData } = useShips(planetId);
  const { data: shipQueueData } = useShipQueue(planetId);
  const { data: researchData } = usePlayerResearch();
  const { timestamp: blockTimestamp } = useBlockTimestamp();

  // Build hook
  const { buildShips, isPending, isConfirming } = useBuildShips();
  const isBuilding = isPending || isConfirming;

  // Parse planet data
  const planet = useMemo(() => {
    if (!planetData) return null;
    const [planetInfo, buildings] = planetData;
    return {
      name: planetInfo.name,
      shipyardLevel: Number(buildings.shipyard),
    };
  }, [planetData]);

  // Parse research levels
  const researchLevels = useMemo((): Record<keyof Research, number> | null => {
    if (!researchData) return null;
    const data = researchData as ResearchLevels;
    return {
      combustionDrive: Number(data.combustionDrive),
      impulseDrive: Number(data.impulseDrive),
      hyperspaceDrive: Number(data.hyperspaceDrive),
      weaponTech: Number(data.weaponTech),
      shieldingTech: Number(data.shieldingTech),
      armourTech: Number(data.armourTech),
      powerSystems: Number(data.powerSystems),
      computerTech: Number(data.computerTech),
      stealthSystems: Number(data.stealthSystems),
      ionTech: Number(data.ionTech),
      hyperspaceTech: Number(data.hyperspaceTech),
      laserTech: Number(data.laserTech),
      plasmaTech: Number(data.plasmaTech),
      astrophysics: Number(data.astrophysics),
    };
  }, [researchData]);

  // Parse ships data - all 12 types
  const ships = useMemo((): Ships => {
    if (!shipsData) return {
      smallCargo: 0, largeCargo: 0, lightFighter: 0, heavyFighter: 0,
      cruiser: 0, battleship: 0, battlecruiser: 0, bomber: 0,
      destroyer: 0, colonyShip: 0, recycler: 0, crawler: 0,
    };
    return {
      smallCargo: Number(shipsData[SHIP_TYPE_INDEX.SMALL_CARGO]),
      largeCargo: Number(shipsData[SHIP_TYPE_INDEX.LARGE_CARGO]),
      lightFighter: Number(shipsData[SHIP_TYPE_INDEX.LIGHT_FIGHTER]),
      heavyFighter: Number(shipsData[SHIP_TYPE_INDEX.HEAVY_FIGHTER]),
      cruiser: Number(shipsData[SHIP_TYPE_INDEX.CRUISER]),
      battleship: Number(shipsData[SHIP_TYPE_INDEX.BATTLESHIP]),
      battlecruiser: Number(shipsData[SHIP_TYPE_INDEX.BATTLECRUISER]),
      bomber: Number(shipsData[SHIP_TYPE_INDEX.BOMBER]),
      destroyer: Number(shipsData[SHIP_TYPE_INDEX.DESTROYER]),
      colonyShip: Number(shipsData[SHIP_TYPE_INDEX.COLONY_SHIP]),
      recycler: Number(shipsData[SHIP_TYPE_INDEX.RECYCLER]),
      crawler: Number(shipsData[SHIP_TYPE_INDEX.CRAWLER]),
    };
  }, [shipsData]);

  // Parse ship queue data
  const queue = useMemo(() => {
    if (!shipQueueData) return null;
    return {
      shipType: Number(shipQueueData[0]),
      quantity: Number(shipQueueData[1]),
      completionTime: Number(shipQueueData[2]),
    };
  }, [shipQueueData]);

  // Check if there's an active build queue
  const hasActiveQueue = useMemo(() => {
    return queue !== null && queue.shipType > 0 && queue.completionTime > 0;
  }, [queue]);

  // Parse current resources
  const currentResources = useMemo((): Resources => {
    if (!currentResourcesData) return { titanium: 0, helium3: 0, darkMatter: 0 };
    return {
      titanium: Number(currentResourcesData[0]),
      helium3: Number(currentResourcesData[1]),
      darkMatter: Number(currentResourcesData[2]),
    };
  }, [currentResourcesData]);

  // Fetch build time for queued ship
  const queueShipType = queue?.shipType ?? 0;
  const queueQuantity = queue?.quantity ?? 0;
  const shipyardLevel = planet?.shipyardLevel ?? 0;
  const { data: buildTimeData } = useShipBuildTime(
    hasActiveQueue ? queueShipType : 0,
    queueQuantity,
    shipyardLevel
  );

  // Calculate time remaining and total duration for ship queue
  const queueTimeInfo = useMemo(() => {
    if (!queue || !hasActiveQueue) return { timeRemaining: 0, totalDuration: 0 };
    const completionTime = queue.completionTime;
    const timeRemaining = Math.max(0, completionTime - blockTimestamp);
    const totalDuration = buildTimeData ? Number(buildTimeData) : timeRemaining;
    return { timeRemaining, totalDuration };
  }, [queue, hasActiveQueue, blockTimestamp, buildTimeData]);

  // Handle build click
  const handleBuild = useCallback(
    (shipKey: string, quantity: number) => {
      if (!planetId) return;
      const shipType = SHIP_TYPE_MAP[shipKey];
      if (shipType) {
        buildShips(planetId, shipType, quantity);
      }
    },
    [planetId, buildShips]
  );

  // Ships that the player owns (count > 0)
  const ownedShips = useMemo(() => {
    return (Object.entries(ships) as [keyof Ships, number][]).filter(([, count]) => count > 0);
  }, [ships]);

  // Loading state
  if (isLoadingPlanetId || isLoadingPlanet) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">Loading shipyard data...</p>
          </div>
        </div>
      </GameLayout>
    );
  }

  // No planet data
  if (!planet) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <XCircle className="w-8 h-8 text-[var(--accent-danger)] mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">Failed to load planet data</p>
          </div>
        </div>
      </GameLayout>
    );
  }

  const hasShipyard = planet.shipyardLevel > 0;

  return (
    <GameLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[var(--accent-warn)]/10 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-[var(--accent-warn)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Shipyard
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {hasShipyard
                ? `Construct ships for your fleet on ${planet.name} (Level ${planet.shipyardLevel})`
                : `Build a Shipyard to unlock ship construction on ${planet.name}`}
            </p>
          </div>
        </div>

        {/* Onboarding hint */}
        <div className="p-3 bg-accent-secondary/5 border border-accent-secondary/20 rounded-sm mb-6">
          <p className="text-sm text-text-secondary">
            <span className="text-accent-secondary font-semibold">TIP:</span>{' '}
            Ships require a Shipyard to build. Higher shipyard levels unlock more advanced ships. You can build one ship type at a time.
          </p>
        </div>

        {/* Shipyard Requirement Check */}
        {!hasShipyard && (
          <Card className="border-[var(--accent-warn)]/30">
            <CardContent className="py-6">
              <div className="text-center">
                <Wrench className="w-12 h-12 text-[var(--accent-warn)] mx-auto mb-3" />
                <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-2">
                  Shipyard Required
                </h3>
                <p className="text-[var(--text-muted)] mb-4">
                  You need to build a Shipyard before you can construct ships.
                </p>
                <Link href="/game/buildings">
                  <Button variant="primary" size="md" leftIcon={<ArrowRight className="w-4 h-4" />}>
                    Go to Buildings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ship Build Queue Status */}
        {hasShipyard && hasActiveQueue && queue && planetId && (
          <ShipQueue
            planetId={planetId}
            queue={queue}
            initialTimeRemaining={queueTimeInfo.timeRemaining}
            totalDuration={queueTimeInfo.totalDuration}
          />
        )}

        {/* Current Fleet */}
        {hasShipyard && ownedShips.length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
                Current Fleet
              </h2>
              <p className="text-sm text-[var(--text-muted)]">Ships available on this planet</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ownedShips.map(([shipKey, count]) => {
                const { icon: ShipIcon, color } = SHIP_ICON_MAP[shipKey];
                return (
                  <Card key={shipKey}>
                    <CardContent className="p-4 text-center">
                      <ShipIcon className="w-8 h-8 mx-auto mb-2" style={{ color }} />
                      <p className="text-xs text-[var(--text-muted)] mb-1">{SHIP_NAMES[shipKey]}</p>
                      <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
                        {formatNumber(count)}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Available Ships - Categorized */}
        {hasShipyard && SHIP_CATEGORIES.map((category) => (
          <div key={category.title} className="space-y-3">
            <h2 className="text-lg font-display font-semibold text-[var(--text-secondary)]">
              {category.title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {category.keys.map((shipKey) => (
                <ShipCard
                  key={shipKey}
                  shipKey={shipKey}
                  currentCount={ships[shipKey]}
                  shipyardLevel={planet.shipyardLevel}
                  currentResources={currentResources}
                  onBuild={(quantity) => handleBuild(shipKey, quantity)}
                  isBuilding={isBuilding}
                  isQueueBlocked={hasActiveQueue}
                  researchLevels={researchLevels}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </GameLayout>
  );
}
