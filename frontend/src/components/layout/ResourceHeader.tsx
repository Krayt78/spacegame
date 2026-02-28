'use client';

import { useActivePlanetId, useCurrentResources, useProductionRates, usePlanetData } from '@/hooks';
import { formatNumber, formatCompactNumber, calculateStorageCapacity } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Gem,
  Sparkles,
  CircleDot,
} from 'lucide-react';

type ResourceType = 'titanium' | 'helium3' | 'darkMatter';

interface ResourceConfig {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  color: string;
  glowColor: string;
}

const resourceConfig: Record<ResourceType, ResourceConfig> = {
  titanium: {
    icon: Gem,
    label: 'Titanium',
    color: 'var(--resource-titanium)',
    glowColor: 'rgba(139, 157, 195, 0.5)',
  },
  helium3: {
    icon: Sparkles,
    label: 'Helium-3',
    color: 'var(--resource-helium3)',
    glowColor: 'rgba(255, 107, 157, 0.5)',
  },
  darkMatter: {
    icon: CircleDot,
    label: 'Dark Matter',
    color: 'var(--resource-darkMatter)',
    glowColor: 'rgba(147, 51, 234, 0.5)',
  },
};

interface ResourceItemProps {
  type: ResourceType;
  amount: number;
  productionRate: number;
  cap?: number;
  isLast?: boolean;
}

function getCapColor(amount: number, cap: number | undefined): string | undefined {
  if (cap === undefined) return undefined;
  const ratio = amount / cap;
  if (ratio >= 0.95) return 'var(--accent-danger)';
  if (ratio >= 0.80) return 'var(--accent-warn)';
  return undefined;
}

function ResourceItem({ type, amount, productionRate, cap, isLast }: ResourceItemProps) {
  const config = resourceConfig[type];
  const Icon = config.icon;
  const isPositive = productionRate >= 0;
  const capColor = getCapColor(amount, cap);

  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-sm hover:bg-[var(--bg-tertiary)] transition-colors cursor-default group"
        title={`${config.label}: ${formatNumber(amount)}${cap !== undefined ? ` / ${formatNumber(cap)}` : ''} (${isPositive ? '+' : ''}${formatNumber(productionRate)}/hr)`}
      >
        <Icon
          className="w-4 h-4 flex-shrink-0 transition-all duration-200 group-hover:drop-shadow-[0_0_6px_currentColor]"
          style={{ color: config.color }}
        />
        <span
          className="font-mono text-sm font-medium tabular-nums"
          style={{ color: capColor ?? config.color }}
        >
          {formatNumber(amount)}
          {cap !== undefined && (
            <span className="text-[var(--text-muted)] text-xs">
              {' / '}{formatCompactNumber(cap)}
            </span>
          )}
        </span>
        <span
          className={cn(
            'font-mono text-xs tabular-nums hidden sm:inline opacity-70',
            isPositive ? 'text-[var(--accent-primary)]' : 'text-[var(--accent-danger)]'
          )}
        >
          ({isPositive ? '+' : ''}{formatNumber(productionRate)})
        </span>
      </motion.div>

      {!isLast && (
        <div className="hidden md:block w-px h-4 bg-[var(--bg-tertiary)]" />
      )}
    </div>
  );
}

interface ResourceHeaderProps {
  className?: string;
}

const DEFAULT_STORAGE_CAP = 100000;

function getStorageCap(buildingKey: 'titaniumVault' | 'helium3Tank' | 'darkMatterContainment', level: number): number {
  return level === 0 ? DEFAULT_STORAGE_CAP : calculateStorageCapacity(buildingKey, level);
}

export function ResourceHeader({ className }: ResourceHeaderProps) {
  const { planetId } = useActivePlanetId();
  const { data: resources } = useCurrentResources(planetId);
  const { data: production } = useProductionRates(planetId);
  const { data: planetData } = usePlanetData(planetId);

  if (!resources || !production) {
    return (
      <div className={cn('flex items-center gap-2 text-[var(--text-muted)]', className)}>
        <span className="text-sm animate-pulse">Loading resources...</span>
      </div>
    );
  }

  const [titanium, helium3, darkMatter] = resources;
  const [titaniumProd, helium3Prod, darkMatterProd] = production;

  const buildings = planetData ? planetData[1] : null;
  const titaniumCap = buildings ? getStorageCap('titaniumVault', Number(buildings.titaniumVault)) : undefined;
  const helium3Cap = buildings ? getStorageCap('helium3Tank', Number(buildings.helium3Tank)) : undefined;
  const darkMatterCap = buildings ? getStorageCap('darkMatterContainment', Number(buildings.darkMatterContainment)) : undefined;

  const resourceData: { type: ResourceType; amount: number; productionRate: number; cap?: number }[] = [
    { type: 'titanium', amount: Number(titanium), productionRate: Number(titaniumProd), cap: titaniumCap },
    { type: 'helium3', amount: Number(helium3), productionRate: Number(helium3Prod), cap: helium3Cap },
    { type: 'darkMatter', amount: Number(darkMatter), productionRate: Number(darkMatterProd), cap: darkMatterCap },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-center gap-1 md:gap-2 flex-wrap justify-center',
        className
      )}
    >
      {resourceData.map((resource, index) => (
        <ResourceItem
          key={resource.type}
          type={resource.type}
          amount={resource.amount}
          productionRate={resource.productionRate}
          cap={resource.cap}
          isLast={index === resourceData.length - 1}
        />
      ))}
    </motion.div>
  );
}

export default ResourceHeader;
