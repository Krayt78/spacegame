'use client';

import { useEffect } from 'react';
import { useUserStore } from '@/stores/userStore';
import { usePlayerPlanetId, usePlayerPlanets } from './useNexusGame';

/**
 * Returns the active planet ID for the current session.
 * - Uses selectedPlanetId from userStore if set AND still owned by the player
 * - Falls back to the starter planet from getPlayerPlanetId()
 * - Auto-initializes selectedPlanetId on first load
 *
 * The selection is persisted in localStorage per ORIGIN, not per chain or
 * account — switching chain (e.g. paseo → local hardhat) or account can leave
 * a stale id pointing at someone else's planet, making every write revert
 * "Not your planet" while the UI happily renders the foreign planet's data.
 * Guard: once the owned-planets list is loaded, a selection outside it is
 * reset to the starter planet.
 */
export function useActivePlanetId() {
  const { selectedPlanetId, setSelectedPlanetId } = useUserStore();
  const { data: starterPlanetId, isLoading, error } = usePlayerPlanetId();
  const { data: ownedPlanetsData } = usePlayerPlanets();

  const ownedPlanets = ownedPlanetsData as readonly bigint[] | undefined;
  const selectionIsForeign =
    !!selectedPlanetId &&
    ownedPlanets !== undefined &&
    !ownedPlanets.some((id) => id.toString() === selectedPlanetId);

  useEffect(() => {
    const starter = starterPlanetId as bigint | undefined;
    // Auto-initialize: when we have the starter planet but no selection yet
    if (!selectedPlanetId && starter && starter > BigInt(0)) {
      setSelectedPlanetId(starter.toString());
      return;
    }
    // Self-heal: persisted selection isn't ours (stale chain/account)
    if (selectionIsForeign) {
      console.warn(
        `[useActivePlanetId] selected planet ${selectedPlanetId} is not owned by the connected account — resetting to starter planet`,
      );
      setSelectedPlanetId(starter && starter > BigInt(0) ? starter.toString() : null);
    }
  }, [selectedPlanetId, starterPlanetId, selectionIsForeign, setSelectedPlanetId]);

  // Derive the active planet ID (treat a foreign selection as unset so the UI
  // never renders another player's planet while the effect resets the store)
  let planetId: bigint | undefined;
  if (selectedPlanetId && !selectionIsForeign) {
    planetId = BigInt(selectedPlanetId);
  } else {
    const starter = starterPlanetId as bigint | undefined;
    if (starter && starter > BigInt(0)) {
      planetId = starter;
    }
  }

  return {
    planetId,
    isLoading: isLoading && !selectedPlanetId,
    error,
  };
}
