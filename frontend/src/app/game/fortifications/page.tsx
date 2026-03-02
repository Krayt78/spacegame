'use client';

import { useMemo, useCallback } from 'react';
import { ShieldAlert, Loader2, XCircle, ArrowRight, Wrench } from 'lucide-react';
import Link from 'next/link';
import { GameLayout } from '@/components/layout';
import { Card, CardContent, Button } from '@/components/ui';
import { DefenseQueue, DefenseCard } from '@/components/game';
import {
  useActivePlanetId,
  usePlanetData,
  useCurrentResources,
  useDefenses,
  useDefenseQueue,
  useBuildDefenses,
  useBlockTimestamp,
  useDefenseBuildTime,
  usePlayerResearch,
  DEFENSE_TYPE_MAP,
  DEFENSE_TYPE_INDEX,
  type ResearchLevels,
} from '@/hooks';
import type { Resources, Research, Defense } from '@/types/game';
import { formatNumber } from '@/lib/utils';
import { DEFENSE_CATEGORIES, DEFENSE_ICON_MAP, DEFENSE_NAMES } from '@/constants/gameConfig';

export default function FortificationsPage() {
  // Get data from chain
  const { planetId, isLoading: isLoadingPlanetId } = useActivePlanetId();
  const { data: planetData, isLoading: isLoadingPlanet } = usePlanetData(planetId);
  const { data: currentResourcesData } = useCurrentResources(planetId);
  const { data: defensesData } = useDefenses(planetId);
  const { data: defenseQueueData } = useDefenseQueue(planetId);
  const { data: researchData } = usePlayerResearch();
  const { timestamp: blockTimestamp } = useBlockTimestamp();

  // Build hook
  const { buildDefenses, isPending, isConfirming } = useBuildDefenses();
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
      computerTech: Number(data.computerTech),
      stealthSystems: Number(data.stealthSystems),
      ionTech: Number(data.ionTech),
      hyperspaceTech: Number(data.hyperspaceTech),
      laserTech: Number(data.laserTech),
      plasmaTech: Number(data.plasmaTech),
      astrophysics: Number(data.astrophysics),
    };
  }, [researchData]);

  // Parse defenses data - all 8 types
  const defenses = useMemo((): Defense => {
    if (!defensesData) return {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, ionCannon: 0,
      gaussCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
    };
    return {
      rocketLauncher: Number(defensesData[DEFENSE_TYPE_INDEX.ROCKET_LAUNCHER]),
      lightLaser: Number(defensesData[DEFENSE_TYPE_INDEX.LIGHT_LASER]),
      heavyLaser: Number(defensesData[DEFENSE_TYPE_INDEX.HEAVY_LASER]),
      ionCannon: Number(defensesData[DEFENSE_TYPE_INDEX.ION_CANNON]),
      gaussCannon: Number(defensesData[DEFENSE_TYPE_INDEX.GAUSS_CANNON]),
      plasmaTurret: Number(defensesData[DEFENSE_TYPE_INDEX.PLASMA_TURRET]),
      smallShieldDome: Number(defensesData[DEFENSE_TYPE_INDEX.SMALL_SHIELD_DOME]),
      largeShieldDome: Number(defensesData[DEFENSE_TYPE_INDEX.LARGE_SHIELD_DOME]),
    };
  }, [defensesData]);

  // Parse defense queue data
  const queue = useMemo(() => {
    if (!defenseQueueData) return null;
    return {
      defenseType: Number(defenseQueueData[0]),
      quantity: Number(defenseQueueData[1]),
      completionTime: Number(defenseQueueData[2]),
    };
  }, [defenseQueueData]);

  // Check if there's an active build queue
  const hasActiveQueue = useMemo(() => {
    return queue !== null && queue.defenseType > 0 && queue.completionTime > 0;
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

  // Fetch build time for queued defense
  const queueDefenseType = queue?.defenseType ?? 0;
  const queueQuantity = queue?.quantity ?? 0;
  const shipyardLevel = planet?.shipyardLevel ?? 0;
  const { data: buildTimeData } = useDefenseBuildTime(
    hasActiveQueue ? queueDefenseType : 0,
    queueQuantity,
    shipyardLevel
  );

  // Calculate time remaining and total duration for defense queue
  const queueTimeInfo = useMemo(() => {
    if (!queue || !hasActiveQueue) return { timeRemaining: 0, totalDuration: 0 };
    const completionTime = queue.completionTime;
    const timeRemaining = Math.max(0, completionTime - blockTimestamp);
    const totalDuration = buildTimeData ? Number(buildTimeData) : timeRemaining;
    return { timeRemaining, totalDuration };
  }, [queue, hasActiveQueue, blockTimestamp, buildTimeData]);

  // Handle build click
  const handleBuild = useCallback(
    (defenseKey: string, quantity: number) => {
      if (!planetId) return;
      const defenseType = DEFENSE_TYPE_MAP[defenseKey];
      if (defenseType) {
        buildDefenses(planetId, defenseType, quantity);
      }
    },
    [planetId, buildDefenses]
  );

  // Defenses that the player has built (count > 0)
  const ownedDefenses = useMemo(() => {
    return (Object.entries(defenses) as [keyof Defense, number][]).filter(([, count]) => count > 0);
  }, [defenses]);

  // Loading state
  if (isLoadingPlanetId || isLoadingPlanet) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">Loading fortification data...</p>
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
          <div className="w-10 h-10 rounded-sm bg-[var(--accent-danger)]/10 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-[var(--accent-danger)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Fortifications
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {hasShipyard
                ? `Build planetary defenses on ${planet.name} (Shipyard Level ${planet.shipyardLevel})`
                : `Build a Shipyard to unlock defense construction on ${planet.name}`}
            </p>
          </div>
        </div>

        {/* Onboarding hint */}
        <div className="p-3 bg-accent-secondary/5 border border-accent-secondary/20 rounded-sm mb-6">
          <p className="text-sm text-text-secondary">
            <span className="text-accent-secondary font-semibold">TIP:</span>{' '}
            Defenses protect your planet during enemy attacks. They don&apos;t consume fleet slots and automatically engage attacking fleets.
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
                  You need to build a Shipyard before you can construct defenses.
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

        {/* Defense Build Queue Status */}
        {hasShipyard && hasActiveQueue && queue && planetId && (
          <DefenseQueue
            planetId={planetId}
            queue={queue}
            initialTimeRemaining={queueTimeInfo.timeRemaining}
            totalDuration={queueTimeInfo.totalDuration}
          />
        )}

        {/* Current Defenses */}
        {hasShipyard && ownedDefenses.length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
                Current Defenses
              </h2>
              <p className="text-sm text-[var(--text-muted)]">Defenses deployed on this planet</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ownedDefenses.map(([defenseKey, count]) => {
                const { icon: DefenseIcon, color } = DEFENSE_ICON_MAP[defenseKey];
                return (
                  <Card key={defenseKey}>
                    <CardContent className="p-4 text-center">
                      <DefenseIcon className="w-8 h-8 mx-auto mb-2" style={{ color }} />
                      <p className="text-xs text-[var(--text-muted)] mb-1">{DEFENSE_NAMES[defenseKey]}</p>
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

        {/* Available Defenses - Categorized */}
        {hasShipyard && DEFENSE_CATEGORIES.map((category) => (
          <div key={category.title} className="space-y-3">
            <h2 className="text-lg font-display font-semibold text-[var(--text-secondary)]">
              {category.title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {category.keys.map((defenseKey) => (
                <DefenseCard
                  key={defenseKey}
                  defenseKey={defenseKey}
                  currentCount={defenses[defenseKey]}
                  shipyardLevel={planet.shipyardLevel}
                  currentResources={currentResources}
                  onBuild={(quantity) => handleBuild(defenseKey, quantity)}
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
