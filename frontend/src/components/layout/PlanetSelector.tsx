'use client';

import { usePlayerPlanets, usePlanetData } from '@/hooks/useNexusGame';
import { useActivePlanetId } from '@/hooks/useActivePlanetId';
import { useUserStore } from '@/stores/userStore';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';

interface PlanetOptionProps {
  planetId: bigint;
  isActive: boolean;
}

function PlanetOption({ planetId }: PlanetOptionProps) {
  const { data: planetData } = usePlanetData(planetId);

  if (!planetData) {
    return (
      <option value={planetId.toString()}>
        Loading...
      </option>
    );
  }

  const [planet] = planetData;
  const coords = `[${Number(planet.coordinates[0])}:${Number(planet.coordinates[1])}:${Number(planet.coordinates[2])}]`;

  return (
    <option value={planetId.toString()}>
      {planet.name} {coords}
    </option>
  );
}

interface PlanetSelectorProps {
  className?: string;
}

export function PlanetSelector({ className }: PlanetSelectorProps) {
  const { data: planetIds } = usePlayerPlanets();
  const { planetId: activePlanetId } = useActivePlanetId();
  const { setSelectedPlanetId } = useUserStore();

  // Only show if player owns more than 1 planet
  const planetIdArray = planetIds as readonly bigint[] | undefined;
  if (!planetIdArray || planetIdArray.length <= 1) {
    return null;
  }

  const handlePlanetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPlanetId = e.target.value;
    setSelectedPlanetId(newPlanetId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn('flex items-center gap-2', className)}
    >
      <Globe className="w-4 h-4 text-[var(--accent-secondary)] flex-shrink-0" />
      <select
        value={activePlanetId?.toString() ?? ''}
        onChange={handlePlanetChange}
        className={cn(
          'bg-[var(--bg-tertiary)] border border-[var(--bg-tertiary)]',
          'rounded-sm px-3 py-1.5',
          'font-mono text-sm text-[var(--text-primary)]',
          'focus:border-[var(--accent-primary)] focus:outline-none',
          'hover:border-[var(--accent-primary)]/30',
          'transition-all duration-200',
          'cursor-pointer'
        )}
        title="Select active planet"
      >
        {planetIdArray.map((id) => (
          <PlanetOption
            key={id.toString()}
            planetId={id}
            isActive={activePlanetId?.toString() === id.toString()}
          />
        ))}
      </select>
    </motion.div>
  );
}

export default PlanetSelector;
