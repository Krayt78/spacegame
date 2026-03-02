'use client';

import { useMemo, useCallback } from 'react';
import { Building2, Loader2, XCircle } from 'lucide-react';
import { GameLayout } from '@/components/layout';
import { Card, CardContent, Button } from '@/components/ui';
import { BuildQueue as BuildQueueComponent } from '@/components/game';
import {
  useActivePlanetId,
  usePlanetData,
  useUpgradeCost,
  useCurrentResources,
  useUpgradeBuilding,
  useBlockTimestamp,
  useBuildTime,
  useProductionMultiplier,
  BUILDING_TYPE_MAP,
  type BuildQueue as BuildQueueData,
} from '@/hooks';
import type { Buildings, ShipComposition } from '@/types/game';
import { BUILDING_NAMES, SHIP_REQUIREMENTS, SHIP_NAMES } from '@/constants/gameConfig';
import { formatTime, formatNumber, calculateProduction, calculateStorageCapacity } from '@/lib/utils';

// All building keys
const ALL_BUILDINGS: (keyof Buildings)[] = [
  'titaniumExtractor',
  'helium3Harvester',
  'darkMatterCollector',
  'titaniumVault',
  'helium3Tank',
  'darkMatterContainment',
  'shipyard',
  'researchNode',
  'undergroundBunker',
];

// Building category helpers
const PRODUCTION_BUILDINGS: (keyof Buildings)[] = [
  'titaniumExtractor', 'helium3Harvester', 'darkMatterCollector',
];
const STORAGE_BUILDINGS: (keyof Buildings)[] = [
  'titaniumVault', 'helium3Tank', 'darkMatterContainment',
];
const BUILDING_RESOURCE_LABELS: Partial<Record<keyof Buildings, string>> = {
  titaniumExtractor: 'Titanium',
  helium3Harvester: 'Helium-3',
  darkMatterCollector: 'Dark Matter',
  titaniumVault: 'Titanium',
  helium3Tank: 'Helium-3',
  darkMatterContainment: 'Dark Matter',
};

const DEFAULT_STORAGE_CAP = 100000;

type BuildingBonus =
  | { type: 'production'; resource: string; currentRate: number; nextRate: number }
  | { type: 'storage'; resource: string; currentCapacity: number; nextCapacity: number }
  | { type: 'shipyard'; unlockedCount: number; nextUnlock: string[] }
  | { type: 'research'; reductionPercent: number; nextReductionPercent: number }
  | { type: 'bunker'; currentProtection: number; nextProtection: number }
  | { type: 'none' };

function getBuildingBonus(buildingKey: keyof Buildings, level: number, productionMultiplier: number = 100): BuildingBonus {
  const resource = BUILDING_RESOURCE_LABELS[buildingKey] ?? '';

  if (PRODUCTION_BUILDINGS.includes(buildingKey)) {
    return {
      type: 'production',
      resource,
      currentRate: calculateProduction(buildingKey, level, productionMultiplier),
      nextRate: calculateProduction(buildingKey, level + 1, productionMultiplier),
    };
  }

  if (STORAGE_BUILDINGS.includes(buildingKey)) {
    return {
      type: 'storage',
      resource,
      currentCapacity: level === 0 ? DEFAULT_STORAGE_CAP : calculateStorageCapacity(buildingKey, level),
      nextCapacity: calculateStorageCapacity(buildingKey, level + 1),
    };
  }

  if (buildingKey === 'shipyard') {
    const unlockedCount = Object.entries(SHIP_REQUIREMENTS)
      .filter(([, req]) => req.shipyardLevel <= level)
      .length;
    const nextUnlock = Object.entries(SHIP_REQUIREMENTS)
      .filter(([, req]) => req.shipyardLevel === level + 1)
      .map(([key]) => SHIP_NAMES[key as keyof ShipComposition]);
    return { type: 'shipyard', unlockedCount, nextUnlock };
  }

  if (buildingKey === 'researchNode') {
    const reductionPercent = level === 0
      ? 0
      : Math.round((level * 3) / (10 + level * 3) * 1000) / 10;
    const nextLevel = level + 1;
    const nextReductionPercent = Math.round((nextLevel * 3) / (10 + nextLevel * 3) * 1000) / 10;
    return { type: 'research', reductionPercent, nextReductionPercent };
  }

  if (buildingKey === 'undergroundBunker') {
    const currentProtection = level === 0 ? 0 : calculateStorageCapacity('undergroundBunker', level);
    const nextProtection = calculateStorageCapacity('undergroundBunker', level + 1);
    return { type: 'bunker', currentProtection, nextProtection };
  }

  return { type: 'none' };
}

function BuildingBonusDisplay({ buildingKey, level, productionMultiplier = 100 }: { buildingKey: keyof Buildings; level: number; productionMultiplier?: number }) {
  const bonus = useMemo(() => getBuildingBonus(buildingKey, level, productionMultiplier), [buildingKey, level, productionMultiplier]);

  if (bonus.type === 'none') return null;

  return (
    <div className="space-y-1">
      {bonus.type === 'production' && (
        <div className="text-sm">
          <span className="text-[var(--text-muted)] text-xs">Production: </span>
          <span className="text-[var(--text-secondary)]">
            {bonus.currentRate > 0
              ? `${formatNumber(bonus.currentRate)} ${bonus.resource}/hr`
              : 'None'}
          </span>
          <span className="text-xs text-[var(--accent-primary)] ml-2">
            → {formatNumber(bonus.nextRate)}/hr
          </span>
        </div>
      )}

      {bonus.type === 'storage' && (
        <div className="text-sm">
          <span className="text-[var(--text-muted)] text-xs">Capacity: </span>
          <span className="text-[var(--text-secondary)]">
            {formatNumber(bonus.currentCapacity)} {bonus.resource}
            {level === 0 && (
              <span className="text-xs text-[var(--text-muted)] ml-1">(default)</span>
            )}
          </span>
          <span className="text-xs text-[var(--accent-primary)] ml-2">
            → {formatNumber(bonus.nextCapacity)}
          </span>
        </div>
      )}

      {bonus.type === 'shipyard' && (
        <div className="text-sm space-y-0.5">
          <div>
            <span className="text-[var(--text-muted)] text-xs">Ships: </span>
            <span className="text-[var(--text-secondary)]">
              {level === 0 ? 'None unlocked' : `${bonus.unlockedCount} type${bonus.unlockedCount !== 1 ? 's' : ''} unlocked`}
            </span>
          </div>
          {bonus.nextUnlock.length > 0 && (
            <p className="text-xs text-[var(--accent-primary)]">
              Next: {bonus.nextUnlock.join(', ')}
            </p>
          )}
        </div>
      )}

      {bonus.type === 'research' && (
        <div className="text-sm">
          <span className="text-[var(--text-muted)] text-xs">Speed: </span>
          <span className="text-[var(--text-secondary)]">
            {level === 0 ? 'No reduction' : `${bonus.reductionPercent}% faster`}
          </span>
          <span className="text-xs text-[var(--accent-primary)] ml-2">
            → {bonus.nextReductionPercent}%
          </span>
        </div>
      )}

      {bonus.type === 'bunker' && (
        <div className="text-sm">
          <span className="text-[var(--text-muted)] text-xs">Protection: </span>
          <span className="text-[var(--text-secondary)]">
            {bonus.currentProtection > 0
              ? `${formatNumber(bonus.currentProtection)} per resource`
              : 'None'}
          </span>
          <span className="text-xs text-[var(--accent-primary)] ml-2">
            → {formatNumber(bonus.nextProtection)}/resource
          </span>
        </div>
      )}
    </div>
  );
}

// Calculate upgrade time from cost (total cost / 10)
function calculateUpgradeTime(cost: { titanium: bigint; helium3: bigint; darkMatter: bigint } | undefined): number {
  if (!cost) return 0;
  const totalCost = Number(cost.titanium) + Number(cost.helium3) + Number(cost.darkMatter);
  return totalCost / 25;
}

// Building item component that fetches its own upgrade cost
function BuildingItem({
  buildingKey,
  currentLevel,
  currentResources,
  hasActiveQueue,
  isUpgrading,
  onUpgrade,
  productionMultiplier = 100,
}: {
  buildingKey: keyof Buildings;
  currentLevel: number;
  currentResources: { titanium: number; helium3: number; darkMatter: number };
  hasActiveQueue: boolean;
  isUpgrading: boolean;
  onUpgrade: () => void;
  productionMultiplier?: number;
}) {
  const buildingType = BUILDING_TYPE_MAP[buildingKey] ?? 0;
  const { data: upgradeCost, isLoading: isLoadingCost } = useUpgradeCost(buildingType, currentLevel);

  const upgradeTime = useMemo(() => calculateUpgradeTime(upgradeCost), [upgradeCost]);

  // Check if player can afford the upgrade
  const canAfford = useMemo(() => {
    if (!upgradeCost) return false;
    return (
      currentResources.titanium >= Number(upgradeCost.titanium) &&
      currentResources.helium3 >= Number(upgradeCost.helium3) &&
      currentResources.darkMatter >= Number(upgradeCost.darkMatter)
    );
  }, [upgradeCost, currentResources]);

  // Button enabled when: can afford AND no active queue AND not currently upgrading
  const canUpgrade = canAfford && !hasActiveQueue && !isUpgrading;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Building name and level */}
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-[var(--text-primary)]">
            {BUILDING_NAMES[buildingKey]}
          </h3>
          <span className="text-sm text-[var(--accent-primary)]">
            Level {currentLevel}
          </span>
        </div>

        {/* Current bonus */}
        <BuildingBonusDisplay buildingKey={buildingKey} level={currentLevel} productionMultiplier={productionMultiplier} />

        {/* Upgrade cost */}
        <div className="space-y-1">
          <p className="text-xs text-[var(--text-muted)]">Upgrade Cost:</p>
          {isLoadingCost ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : upgradeCost ? (
            <div className="flex flex-wrap gap-3 text-sm">
              <span className={currentResources.titanium >= Number(upgradeCost.titanium) ? 'text-[var(--resource-titanium)]' : 'text-[var(--accent-danger)]'}>
                {Number(upgradeCost.titanium).toLocaleString()} Ti
              </span>
              <span className={currentResources.helium3 >= Number(upgradeCost.helium3) ? 'text-[var(--resource-helium)]' : 'text-[var(--accent-danger)]'}>
                {Number(upgradeCost.helium3).toLocaleString()} He3
              </span>
              <span className={currentResources.darkMatter >= Number(upgradeCost.darkMatter) ? 'text-[var(--resource-dark-matter)]' : 'text-[var(--accent-danger)]'}>
                {Number(upgradeCost.darkMatter).toLocaleString()} DM
              </span>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">-</p>
          )}
        </div>

        {/* Upgrade time */}
        <div className="space-y-1">
          <p className="text-xs text-[var(--text-muted)]">Upgrade Time:</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {upgradeTime > 0 ? formatTime(Math.ceil(upgradeTime)) : '-'}
          </p>
        </div>

        {/* Upgrade button */}
        <Button
          variant={canUpgrade ? 'primary' : 'secondary'}
          size="sm"
          className="w-full"
          disabled={!canUpgrade}
          isLoading={isUpgrading}
          onClick={onUpgrade}
        >
          Upgrade to Level {currentLevel + 1}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function BuildingsPage() {
  // Get planet data from chain
  const { planetId, isLoading: isLoadingPlanetId } = useActivePlanetId();
  const { data: planetData, isLoading: isLoadingPlanet } = usePlanetData(planetId);
  const { data: currentResourcesData } = useCurrentResources(planetId);
  const { timestamp: blockTimestamp } = useBlockTimestamp();
  const { data: prodMultiplier } = useProductionMultiplier();
  const productionMultiplier = prodMultiplier ? Number(prodMultiplier) : 100;

  // Upgrade hook
  const { upgradeBuilding, isPending, isConfirming } = useUpgradeBuilding();
  const isUpgrading = isPending || isConfirming;

  // Parse planet data to get building levels
  const buildings = useMemo(() => {
    if (!planetData) return null;
    const [, buildingsData] = planetData;
    return {
      titaniumExtractor: Number(buildingsData.titaniumExtractor),
      helium3Harvester: Number(buildingsData.helium3Harvester),
      darkMatterCollector: Number(buildingsData.darkMatterCollector),
      titaniumVault: Number(buildingsData.titaniumVault),
      helium3Tank: Number(buildingsData.helium3Tank),
      darkMatterContainment: Number(buildingsData.darkMatterContainment),
      shipyard: Number(buildingsData.shipyard),
      researchNode: Number(buildingsData.researchNode),
      undergroundBunker: Number(buildingsData.undergroundBunker),
    } as Buildings;
  }, [planetData]);

  // Get build queue data
  const queue = useMemo((): BuildQueueData | null => {
    if (!planetData) return null;
    const [, , , queueData] = planetData;
    return queueData;
  }, [planetData]);

  // Check if there's an active build queue
  const hasActiveQueue = useMemo(() => {
    if (!queue) return false;
    return Number(queue.buildingType) > 0 && Number(queue.completionTime) > 0;
  }, [queue]);

  // Fetch the actual build time from the contract for the queued building
  // currentLevel = targetLevel - 1 (we're upgrading FROM this level)
  const queueBuildingType = queue ? Number(queue.buildingType) : 0;
  const queueCurrentLevel = queue ? Math.max(0, Number(queue.targetLevel) - 1) : 0;
  const { data: buildTimeData } = useBuildTime(
    hasActiveQueue ? queueBuildingType : 0,
    queueCurrentLevel
  );

  // Calculate time remaining and total duration for build queue
  const queueTimeInfo = useMemo(() => {
    if (!queue || !hasActiveQueue) return { timeRemaining: 0, totalDuration: 0 };
    const completionTime = Number(queue.completionTime);
    const timeRemaining = Math.max(0, completionTime - blockTimestamp);
    // Use the actual build time from the contract as totalDuration
    // This ensures progress bar works correctly even after page reload
    const totalDuration = buildTimeData ? Number(buildTimeData) : timeRemaining;

    return { timeRemaining, totalDuration };
  }, [queue, hasActiveQueue, blockTimestamp, buildTimeData]);

  // Parse current resources
  const currentResources = useMemo(() => {
    if (!currentResourcesData) return { titanium: 0, helium3: 0, darkMatter: 0 };
    return {
      titanium: Number(currentResourcesData[0]),
      helium3: Number(currentResourcesData[1]),
      darkMatter: Number(currentResourcesData[2]),
    };
  }, [currentResourcesData]);

  // Handle upgrade click
  const handleUpgrade = useCallback(
    (buildingKey: keyof Buildings) => {
      if (!planetId) return;
      const buildingType = BUILDING_TYPE_MAP[buildingKey];
      if (buildingType) {
        upgradeBuilding(planetId, buildingType);
      }
    },
    [planetId, upgradeBuilding]
  );

  // Loading state
  if (isLoadingPlanetId || isLoadingPlanet) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">Loading planet data...</p>
          </div>
        </div>
      </GameLayout>
    );
  }

  // No planet data
  if (!buildings) {
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

  return (
    <GameLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[var(--accent-primary)]/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[var(--accent-primary)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Buildings
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Construct and upgrade planetary structures
            </p>
          </div>
        </div>

        {/* Onboarding hint */}
        <div className="p-3 bg-accent-secondary/5 border border-accent-secondary/20 rounded-sm mb-6">
          <p className="text-sm text-text-secondary">
            <span className="text-accent-secondary font-semibold">TIP:</span>{' '}
            Extractors produce resources over time. Vaults increase storage capacity. The Shipyard unlocks ship construction, and the Research Node enables technology upgrades.
          </p>
        </div>

        {/* Build Queue Status */}
        {hasActiveQueue && queue && planetId && (
          <BuildQueueComponent
            planetId={planetId}
            queue={queue}
            initialTimeRemaining={queueTimeInfo.timeRemaining}
            totalDuration={queueTimeInfo.totalDuration}
          />
        )}

        {/* Buildings grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ALL_BUILDINGS.map((buildingKey) => (
            <BuildingItem
              key={buildingKey}
              buildingKey={buildingKey}
              currentLevel={buildings[buildingKey]}
              currentResources={currentResources}
              hasActiveQueue={hasActiveQueue}
              isUpgrading={isUpgrading}
              onUpgrade={() => handleUpgrade(buildingKey)}
              productionMultiplier={productionMultiplier}
            />
          ))}
        </div>
      </div>
    </GameLayout>
  );
}
