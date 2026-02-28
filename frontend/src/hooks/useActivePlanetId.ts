'use client';

import { useEffect } from 'react';
import { useUserStore } from '@/stores/userStore';
import { usePlayerPlanetId } from './useNexusGame';

/**
 * Returns the active planet ID for the current session.
 * - Uses selectedPlanetId from userStore if set
 * - Falls back to the starter planet from getPlayerPlanetId()
 * - Auto-initializes selectedPlanetId on first load
 */
export function useActivePlanetId() {
  const { selectedPlanetId, setSelectedPlanetId } = useUserStore();
  const { data: starterPlanetId, isLoading, error } = usePlayerPlanetId();

  // Auto-initialize: when we have the starter planet but no selection yet, set it
  useEffect(() => {
    const planetIdBigInt = starterPlanetId as bigint | undefined;
    if (!selectedPlanetId && planetIdBigInt && planetIdBigInt > BigInt(0)) {
      setSelectedPlanetId(planetIdBigInt.toString());
    }
  }, [selectedPlanetId, starterPlanetId, setSelectedPlanetId]);

  // Derive the active planet ID
  let planetId: bigint | undefined;
  if (selectedPlanetId) {
    planetId = BigInt(selectedPlanetId);
  } else {
    const planetIdBigInt = starterPlanetId as bigint | undefined;
    if (planetIdBigInt && planetIdBigInt > BigInt(0)) {
      planetId = planetIdBigInt;
    }
  }

  return {
    planetId,
    isLoading: isLoading && !selectedPlanetId,
    error,
  };
}
