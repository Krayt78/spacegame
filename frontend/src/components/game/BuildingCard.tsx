'use client';

import { useMemo } from 'react';
import {
  Gem,
  Sparkles,
  CircleDot,
  ArrowUp,
  Clock,
  Loader2,
  Warehouse,
  Factory,
  FlaskConical,
  Wrench,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { Button } from '@/components/ui';
import { ProgressBar } from '@/components/ui';
import type { Buildings, Resources } from '@/types/game';
import { BUILDING_NAMES } from '@/constants/gameConfig';
import {
  cn,
  formatNumber,
  formatTime,
  calculateUpgradeCost,
  calculateProduction,
  calculateStorageCapacity,
  canAffordUpgrade,
  calculateBuildTime,
} from '@/lib/utils';

interface BuildingCardProps {
  buildingKey: keyof Buildings;
  currentLevel: number;
  currentResources: Resources;
  onUpgrade: () => void;
  isUpgrading: boolean;
  isQueueBlocked?: boolean;
  upgradeProgress?: number;
  upgradeTimeRemaining?: number;
}

// Building icons based on type
const getBuildingIcon = (buildingKey: keyof Buildings) => {
  switch (buildingKey) {
    case 'titaniumExtractor':
      return { icon: Gem, color: 'var(--resource-titanium)' };
    case 'helium3Harvester':
      return { icon: Sparkles, color: 'var(--resource-helium3)' };
    case 'darkMatterCollector':
      return { icon: CircleDot, color: 'var(--resource-darkMatter)' };
    case 'titaniumVault':
    case 'helium3Tank':
    case 'darkMatterContainment':
      return { icon: Warehouse, color: 'var(--accent-secondary)' };
    case 'shipyard':
      return { icon: Wrench, color: 'var(--accent-warn)' };
    case 'researchNode':
      return { icon: FlaskConical, color: 'var(--accent-tertiary)' };
    default:
      return { icon: Factory, color: 'var(--text-secondary)' };
  }
};

// Get building description based on type
const getBuildingDescription = (buildingKey: keyof Buildings): string => {
  switch (buildingKey) {
    case 'titaniumExtractor':
      return 'Extracts titanium from planetary core';
    case 'helium3Harvester':
      return 'Harvests helium-3 from atmosphere';
    case 'darkMatterCollector':
      return 'Collects exotic dark matter particles';
    case 'titaniumVault':
      return 'Stores titanium reserves';
    case 'helium3Tank':
      return 'Contains pressurized helium-3';
    case 'darkMatterContainment':
      return 'Safely contains dark matter';
    case 'shipyard':
      return 'Reduces ship construction time';
    case 'researchNode':
      return 'Accelerates research progress';
    default:
      return 'Planetary infrastructure';
  }
};

// Check if building is a production building
const isProductionBuilding = (buildingKey: keyof Buildings): boolean => {
  return ['titaniumExtractor', 'helium3Harvester', 'darkMatterCollector'].includes(buildingKey);
};

// Check if building is a storage building
const isStorageBuilding = (buildingKey: keyof Buildings): boolean => {
  return ['titaniumVault', 'helium3Tank', 'darkMatterContainment'].includes(buildingKey);
};

interface ResourceCostProps {
  type: 'titanium' | 'helium3' | 'darkMatter';
  cost: number;
  available: number;
}

function ResourceCost({ type, cost, available }: ResourceCostProps) {
  if (cost === 0) return null;

  const canAfford = available >= cost;
  const icons = {
    titanium: Gem,
    helium3: Sparkles,
    darkMatter: CircleDot,
  };
  const colors = {
    titanium: 'var(--resource-titanium)',
    helium3: 'var(--resource-helium3)',
    darkMatter: 'var(--resource-darkMatter)',
  };

  const Icon = icons[type];

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-sm',
        canAfford ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--accent-danger)]/10'
      )}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: colors[type] }} />
      <span
        className={cn(
          'font-mono text-xs',
          canAfford ? 'text-[var(--text-secondary)]' : 'text-[var(--accent-danger)]'
        )}
      >
        {formatNumber(cost)}
      </span>
    </div>
  );
}

export function BuildingCard({
  buildingKey,
  currentLevel,
  currentResources,
  onUpgrade,
  isUpgrading,
  isQueueBlocked = false,
  upgradeProgress = 0,
  upgradeTimeRemaining = 0,
}: BuildingCardProps) {
  const { icon: BuildingIcon, color: iconColor } = getBuildingIcon(buildingKey);
  const buildingName = BUILDING_NAMES[buildingKey];
  const description = getBuildingDescription(buildingKey);

  const upgradeCost = useMemo(
    () => calculateUpgradeCost(buildingKey, currentLevel),
    [buildingKey, currentLevel]
  );

  const canAfford = useMemo(
    () => canAffordUpgrade(currentResources, upgradeCost),
    [currentResources, upgradeCost]
  );

  const buildTime = useMemo(
    () => calculateBuildTime(buildingKey, currentLevel),
    [buildingKey, currentLevel]
  );

  // Production info for production buildings
  const currentProduction = isProductionBuilding(buildingKey)
    ? calculateProduction(buildingKey, currentLevel)
    : null;
  const nextProduction = isProductionBuilding(buildingKey)
    ? calculateProduction(buildingKey, currentLevel + 1)
    : null;

  // Storage info for storage buildings
  const currentCapacity = isStorageBuilding(buildingKey)
    ? calculateStorageCapacity(buildingKey, currentLevel)
    : null;
  const nextCapacity = isStorageBuilding(buildingKey)
    ? calculateStorageCapacity(buildingKey, currentLevel + 1)
    : null;

  return (
    <Card
      glow={canAfford && !isUpgrading}
      className={cn(
        'relative overflow-hidden transition-all duration-300',
        isUpgrading && 'ring-1 ring-[var(--accent-warn)]/50'
      )}
    >
      {/* Upgrading Overlay */}
      {isUpgrading && (
        <div className="absolute inset-0 bg-[var(--bg-primary)]/80 z-10 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-[var(--accent-warn)] animate-spin mb-2" />
          <p className="text-sm text-[var(--accent-warn)] font-medium mb-2">
            Upgrading to Level {currentLevel + 1}
          </p>
          <div className="w-3/4">
            <ProgressBar
              progress={upgradeProgress}
              variant="warning"
              timeRemaining={upgradeTimeRemaining}
              size="sm"
            />
          </div>
        </div>
      )}

      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Left: Icon and Level */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-14 h-14 rounded-sm flex items-center justify-center"
              style={{ backgroundColor: `${iconColor}15` }}
            >
              <BuildingIcon className="w-7 h-7" style={{ color: iconColor }} />
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">Level</p>
              <p
                className="font-display text-2xl font-bold"
                style={{ color: currentLevel > 0 ? iconColor : 'var(--text-muted)' }}
              >
                {currentLevel}
              </p>
            </div>
          </div>

          {/* Right: Info */}
          <div className="flex-1 min-w-0">
            {/* Name and Description */}
            <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-0.5">
              {buildingName}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">{description}</p>

            {/* Production/Capacity Info */}
            {currentProduction !== null && nextProduction !== null && (
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="text-[var(--text-muted)]">Production:</span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {formatNumber(currentProduction)}/hr
                </span>
                <ArrowUp className="w-3 h-3 text-[var(--accent-primary)]" />
                <span className="font-mono text-[var(--accent-primary)]">
                  {formatNumber(nextProduction)}/hr
                </span>
                <span className="text-[var(--accent-primary)]">
                  (+{formatNumber(nextProduction - currentProduction)})
                </span>
              </div>
            )}

            {currentCapacity !== null && nextCapacity !== null && (
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="text-[var(--text-muted)]">Capacity:</span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {formatNumber(currentCapacity)}
                </span>
                <ArrowUp className="w-3 h-3 text-[var(--accent-primary)]" />
                <span className="font-mono text-[var(--accent-primary)]">
                  {formatNumber(nextCapacity)}
                </span>
              </div>
            )}

            {/* Upgrade Cost */}
            <div className="mb-3">
              <p className="text-xs text-[var(--text-muted)] mb-1.5">
                Upgrade to Level {currentLevel + 1}:
              </p>
              <div className="flex flex-wrap gap-1.5">
                <ResourceCost
                  type="titanium"
                  cost={upgradeCost.titanium}
                  available={currentResources.titanium}
                />
                <ResourceCost
                  type="helium3"
                  cost={upgradeCost.helium3}
                  available={currentResources.helium3}
                />
                <ResourceCost
                  type="darkMatter"
                  cost={upgradeCost.darkMatter}
                  available={currentResources.darkMatter}
                />
              </div>
            </div>

            {/* Build Time and Upgrade Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTime(buildTime)}</span>
              </div>

              <Button
                variant={canAfford && !isQueueBlocked ? 'primary' : 'ghost'}
                size="sm"
                onClick={onUpgrade}
                disabled={!canAfford || isUpgrading || isQueueBlocked}
                isLoading={isUpgrading}
                leftIcon={<ArrowUp className="w-4 h-4" />}
              >
                {isUpgrading ? 'Upgrading...' : isQueueBlocked ? 'Queue Busy' : 'Upgrade'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BuildingCard;
