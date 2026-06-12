'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReadContract } from '@/hooks/useReadContractPapi';
import { useHostAddress as useAccount } from '@/hooks/useHostAddress';
import { useNexusContractWrite } from '@/hooks/useNexusContractWrite';
import { getTypedApi } from '@/lib/triangle/chainClient';
import {
  NEXUS_GAME_ADDRESS,
  GAME_CONFIG_ADDRESS,
  nexusGameAbi,
  gameConfigAbi,
} from '@/lib/contracts';

// Kept for legacy options-object compat with `useNexusContractWrite` call
// sites. The helper ignores `contractAddress` / `abi`; the typed CDM manifest
// drives the contract surface now.
const nexusGameAbiTyped: unknown = nexusGameAbi;

// ========== Contract Type Definitions ==========

/** Planet struct from NexusGame contract */
export interface Planet {
  owner: `0x${string}`;
  coordinates: readonly [number, number, number]; // [galaxy, system, planet]
  name: string;
  createdAt: number;
  exists: boolean;
}

/** Buildings struct from NexusGame contract */
export interface Buildings {
  titaniumExtractor: number;
  helium3Harvester: number;
  darkMatterCollector: number;
  titaniumVault: number;
  helium3Tank: number;
  darkMatterContainment: number;
  shipyard: number;
  researchNode: number;
  undergroundBunker: number;
}

/** Resources struct from NexusGame contract */
export interface Resources {
  titanium: bigint;
  helium3: bigint;
  darkMatter: bigint;
  lastClaimed: number;
}

/** BuildQueue struct from NexusGame contract */
export interface BuildQueue {
  buildingType: number;
  targetLevel: number;
  completionTime: number;
}

/** ShipQueue struct from NexusGame contract */
export interface ShipQueue {
  shipType: number;
  quantity: bigint;
  completionTime: number;
}

// ========== Fleet Type Definitions ==========

/** Fleet mission enum (matches contract NexusGame.FleetMission) */
export const FLEET_MISSION = { NONE: 0, RAID: 1, CAPTURE: 2, MOVE: 3, COLONIZE: 4 } as const;
export const FLEET_MISSION_NAMES: Record<number, string> = {
  0: 'None', 1: 'Raid', 2: 'Capture', 3: 'Move', 4: 'Colonize',
};

/** Fleet status enum (matches contract NexusGame.FleetStatus) */
export const FLEET_STATUS = { NONE: 0, TRAVELING: 1, RETURNING: 2 } as const;
export const FLEET_STATUS_NAMES: Record<number, string> = {
  0: 'None', 1: 'Traveling', 2: 'Returning',
};

/** Outpost type enum (matches contract GameConfig.OutpostType) */
export const OUTPOST_TYPE = { NONE: 0, TITANIUM_MINE: 1, HELIUM3_LAB: 2, DARKMATTER_REFINERY: 3 } as const;
export const OUTPOST_TYPE_NAMES: Record<number, string> = {
  0: 'None', 1: 'Titanium Mine', 2: 'Helium-3 Lab', 3: 'Dark Matter Refinery',
};

/** Outpost resource type mapping (which resource does each outpost produce) */
export const OUTPOST_RESOURCE_MAP: Record<number, 'titanium' | 'helium3' | 'darkMatter'> = {
  1: 'titanium',
  2: 'helium3',
  3: 'darkMatter',
};

/** Maximum number of ship types (matches contract MAX_SHIP_TYPES) */
export const MAX_SHIP_TYPES = 13;

/** Ship type indices (matches contract ShipType enum) */
export const SHIP_TYPE_INDEX = {
  NONE: 0,
  SMALL_CARGO: 1,
  LARGE_CARGO: 2,
  LIGHT_FIGHTER: 3,
  HEAVY_FIGHTER: 4,
  CRUISER: 5,
  BATTLESHIP: 6,
  BATTLECRUISER: 7,
  BOMBER: 8,
  DESTROYER: 9,
  COLONY_SHIP: 10,
  RECYCLER: 11,
  CRAWLER: 12,
} as const;

/** Production rates from getProductionRates */
export interface ProductionRates {
  titaniumPerHour: bigint;
  helium3PerHour: bigint;
  darkMatterPerHour: bigint;
}

/** Cost struct from GameConfig (used for upgrade and ship costs) */
export interface Cost {
  titanium: bigint;
  helium3: bigint;
  darkMatter: bigint;
}

/** Return type for getPlanet */
export type GetPlanetResult = readonly [Planet, Buildings, Resources, BuildQueue, ShipQueue];

/** Return type for calculateCurrentResources */
export type CurrentResources = readonly [bigint, bigint, bigint];

/** Return type for getProductionRates */
export type ProductionRatesResult = readonly [bigint, bigint, bigint];

/** Return type for getShips - fixed-size array of 13 ship counts */
export type ShipsResult = readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

/** Return type for shipQueues */
export type ShipQueueResult = readonly [number, bigint, number];

// ========== Logging Helpers ==========
const getTimestamp = () => new Date().toISOString();

// ========== Building Type Mapping ==========
// Maps frontend building keys to contract enum values
export const BUILDING_TYPE_MAP: Record<string, number> = {
  titaniumExtractor: 1,
  helium3Harvester: 2,
  darkMatterCollector: 3,
  titaniumVault: 4,
  helium3Tank: 5,
  darkMatterContainment: 6,
  shipyard: 7,
  researchNode: 8,
  undergroundBunker: 9,
};

// Reverse mapping: contract enum to frontend key
export const BUILDING_TYPE_REVERSE_MAP: Record<number, string> = {
  1: 'titaniumExtractor',
  2: 'helium3Harvester',
  3: 'darkMatterCollector',
  4: 'titaniumVault',
  5: 'helium3Tank',
  6: 'darkMatterContainment',
  7: 'shipyard',
  8: 'researchNode',
  9: 'undergroundBunker',
};

// ========== Ship Type Mapping ==========
export const SHIP_TYPE_MAP: Record<string, number> = {
  smallCargo: 1,
  largeCargo: 2,
  lightFighter: 3,
  heavyFighter: 4,
  cruiser: 5,
  battleship: 6,
  battlecruiser: 7,
  bomber: 8,
  destroyer: 9,
  colonyShip: 10,
  recycler: 11,
  crawler: 12,
};

export const SHIP_TYPE_REVERSE_MAP: Record<number, string> = {
  1: 'smallCargo',
  2: 'largeCargo',
  3: 'lightFighter',
  4: 'heavyFighter',
  5: 'cruiser',
  6: 'battleship',
  7: 'battlecruiser',
  8: 'bomber',
  9: 'destroyer',
  10: 'colonyShip',
  11: 'recycler',
  12: 'crawler',
};

// ========== Read Hooks ==========

/**
 * Hook to check if the current connected user has a planet
 */
export function useHasPlanet() {
  const { address } = useAccount();

  const result = useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'hasPlanet',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  });

  // Debug logging - only log when not loading
  useEffect(() => {
    if (result.isLoading) return;
    console.log(`[${getTimestamp()}] [useHasPlanet]`, {
      address,
      hasPlanet: result.data,
      error: result.error?.message,
    });
  }, [address, result.data, result.isLoading, result.error]);

  return {
    ...result,
    hasPlanet: result.data,
  };
}

/**
 * Hook to get the player's planet ID
 */
export function usePlayerPlanetId() {
  const { address } = useAccount();

  const result = useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerPlanetId',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  });

  // Debug logging - only log when not loading
  useEffect(() => {
    if (result.isLoading) return;
    console.log(`[${getTimestamp()}] [usePlayerPlanetId]`, {
      address,
      planetId: result.data?.toString(),
      error: result.error?.message,
    });
  }, [address, result.data, result.isLoading, result.error]);

  return result;
}

/**
 * Hook to get all planet IDs owned by the connected player
 */
export function usePlayerPlanets() {
  const { address } = useAccount();

  const result = useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerPlanets',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  });

  useEffect(() => {
    if (result.isLoading) return;
    console.log(`[${getTimestamp()}] [usePlayerPlanets]`, {
      address,
      planetIds: result.data ? (result.data as readonly bigint[]).map(id => id.toString()) : undefined,
      error: result.error?.message,
    });
  }, [address, result.data, result.isLoading, result.error]);

  return result;
}

/**
 * Hook to get the number of planets owned by the connected player
 */
export function usePlayerPlanetCount() {
  const { address } = useAccount();

  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerPlanetCount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  });
}

/**
 * Hook to get full planet data (buildings, resources, queue)
 */
export function usePlanetData(planetId: bigint | undefined) {
  const result = useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlanet',
    args: planetId !== undefined ? [planetId] : undefined,
    query: {
      enabled: planetId !== undefined && planetId > BigInt(0) && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: GetPlanetResult | undefined };

  // Debug logging - only log when not loading
  useEffect(() => {
    if (result.isLoading) return;
    if (result.data) {
      const [planet, buildings, resources, queue] = result.data as GetPlanetResult;
      console.log(`[${getTimestamp()}] [usePlanetData]`, {
        planetId: planetId?.toString(),
        planet: {
          name: planet.name,
          owner: planet.owner,
          coords: `[${planet.coordinates[0]}:${planet.coordinates[1]}:${planet.coordinates[2]}]`,
        },
        buildings: {
          titaniumExtractor: Number(buildings.titaniumExtractor),
          helium3Harvester: Number(buildings.helium3Harvester),
          darkMatterCollector: Number(buildings.darkMatterCollector),
          titaniumVault: Number(buildings.titaniumVault),
          helium3Tank: Number(buildings.helium3Tank),
          darkMatterContainment: Number(buildings.darkMatterContainment),
          shipyard: Number(buildings.shipyard),
          researchNode: Number(buildings.researchNode),
          undergroundBunker: Number(buildings.undergroundBunker),
        },
        resources: {
          titanium: Number(resources.titanium),
          helium3: Number(resources.helium3),
          darkMatter: Number(resources.darkMatter),
        },
        queue: {
          buildingType: Number(queue.buildingType),
          targetLevel: Number(queue.targetLevel),
          completionTime: Number(queue.completionTime),
        },
        error: result.error?.message,
      });
    } else if (result.error) {
      console.log(`[${getTimestamp()}] [usePlanetData]`, {
        planetId: planetId?.toString(),
        data: null,
        error: result.error?.message,
      });
    }
  }, [planetId, result.data, result.isLoading, result.error]);

  return result;
}

/**
 * Hook to calculate current resources (with time-based accumulation)
 */
export function useCurrentResources(planetId: bigint | undefined) {
  const result = useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'calculateCurrentResources',
    args: planetId !== undefined ? [planetId] : undefined,
    // Force fresh blockchain state to get current block.timestamp
    // If we dont do that wagmi/view will cache the state and alweays uise the same
    // so the timestamp would never change
    blockTag: 'pending',
    query: {
      enabled: planetId !== undefined && planetId > BigInt(0) && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: CurrentResources | undefined };

  // Debug logging - only log when not loading
  useEffect(() => {
    if (result.isLoading) return;
    if (result.data) {
      const [titanium, helium3, darkMatter] = result.data as CurrentResources;
      console.log(`[${getTimestamp()}] [useCurrentResources]`, {
        planetId: planetId?.toString(),
        titanium: Number(titanium),
        helium3: Number(helium3),
        darkMatter: Number(darkMatter),
        error: result.error?.message,
      });
    } else if (result.error) {
      console.log(`[${getTimestamp()}] [useCurrentResources]`, {
        planetId: planetId?.toString(),
        data: null,
        error: result.error?.message,
      });
    }
  }, [planetId, result.data, result.isLoading, result.error]);

  return result;
}

/**
 * Hook to get production rates per hour
 */
export function useProductionRates(planetId: bigint | undefined) {
  const result = useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getProductionRates',
    args: planetId !== undefined ? [planetId] : undefined,
    query: {
      enabled: planetId !== undefined && planetId > BigInt(0) && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: ProductionRatesResult | undefined };

  // Debug logging - only log when not loading
  useEffect(() => {
    if (result.isLoading) return;
    if (result.data) {
      const [titaniumProd, helium3Prod, darkMatterProd] = result.data as readonly [bigint, bigint, bigint];
      console.log(`[${getTimestamp()}] [useProductionRates]`, {
        planetId: planetId?.toString(),
        titaniumProd: Number(titaniumProd),
        helium3Prod: Number(helium3Prod),
        darkMatterProd: Number(darkMatterProd),
        error: result.error?.message,
      });
    } else if (result.error) {
      console.log(`[${getTimestamp()}] [useProductionRates]`, {
        planetId: planetId?.toString(),
        data: null,
        error: result.error?.message,
      });
    }
  }, [planetId, result.data, result.isLoading, result.error]);

  return result;
}

/**
 * Hook to get the global production multiplier (100 = 1x, 200 = 2x)
 */
export function useProductionMultiplier() {
  return useReadContract({
    address: GAME_CONFIG_ADDRESS,
    abi: gameConfigAbi,
    functionName: 'productionMultiplier',
    query: {
      enabled: !!GAME_CONFIG_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: bigint | undefined };
}

/**
 * Hook to get upgrade cost from GameConfig contract
 */
export function useUpgradeCost(buildingType: number, currentLevel: number) {
  const result = useReadContract({
    address: GAME_CONFIG_ADDRESS,
    abi: gameConfigAbi,
    functionName: 'getUpgradeCost',
    args: [buildingType, currentLevel],
    query: {
      enabled: buildingType > 0 && !!GAME_CONFIG_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: Cost | undefined };

  // Debug logging - only log when not loading
  useEffect(() => {
    if (result.isLoading) return;
    if (result.data || result.error) {
      const cost = result.data as Cost | undefined;
      console.log(`[${getTimestamp()}] [useUpgradeCost]`, {
        buildingType,
        buildingName: BUILDING_TYPE_REVERSE_MAP[buildingType],
        currentLevel,
        cost: cost ? {
          titanium: Number(cost.titanium),
          helium3: Number(cost.helium3),
          darkMatter: Number(cost.darkMatter),
        } : null,
        error: result.error?.message,
      });
    }
  }, [buildingType, currentLevel, result.data, result.isLoading, result.error]);

  return result;
}

/**
 * Hook to get build time from GameConfig contract
 */
export function useBuildTime(buildingType: number, currentLevel: number) {
  const result = useReadContract({
    address: GAME_CONFIG_ADDRESS,
    abi: gameConfigAbi,
    functionName: 'getBuildTime',
    args: [buildingType, currentLevel],
    query: {
      enabled: buildingType > 0 && !!GAME_CONFIG_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: bigint | undefined };

  // Debug logging - only log when not loading
  useEffect(() => {
    if (result.isLoading) return;
    if (result.data || result.error) {
      console.log(`[${getTimestamp()}] [useBuildTime]`, {
        buildingType,
        buildingName: BUILDING_TYPE_REVERSE_MAP[buildingType],
        currentLevel,
        buildTimeSeconds: result.data ? Number(result.data) : null,
        error: result.error?.message,
      });
    }
  }, [buildingType, currentLevel, result.data, result.isLoading, result.error]);

  return result;
}

// ========== Write Hooks ==========

/**
 * Hook to claim a starter planet, signed by the Polkadot Host's substrate
 * account through `pallet_revive::call`. msg.sender is the host account's
 * revive-mapped H160 (= the same address useHasPlanet etc. read against).
 *
 * On the first claim per host account, this also fires `Revive.map_account`
 * one time — the user will see two phone prompts back-to-back. Subsequent
 * claims (or any other Revive::call from the same account) are one prompt.
 */
export function useClaimStarterPlanet() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: [
        'hasPlanet',
        'getPlayerPlanetId',
        'getPlayerPlanets',
        'getPlayerPlanetCount',
      ],
    },
    'useClaimStarterPlanet',
  );

  const claimPlanet = (planetName: string) => call('claimStarterPlanet', [planetName]);

  return { claimPlanet, ...state };
}

/**
 * Hook to upgrade a building
 */
export function useUpgradeBuilding() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['getPlanet', 'calculateCurrentResources'],
    },
    'useUpgradeBuilding',
  );

  const upgradeBuilding = (planetId: bigint, buildingType: number) =>
    call('upgradeBuilding', [planetId, buildingType]);

  return { upgradeBuilding, ...state };
}

/**
 * Hook to complete a building upgrade
 */
export function useCompleteUpgrade() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['getPlanet', 'getProductionRates', 'getTutorialStatus'],
    },
    'useCompleteUpgrade',
  );

  const completeUpgrade = (planetId: bigint) => call('completeUpgrade', [planetId]);

  return { completeUpgrade, ...state };
}

/**
 * Hook to cancel a building upgrade (50% refund)
 */
export function useCancelUpgrade() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['getPlanet', 'calculateCurrentResources'],
    },
    'useCancelUpgrade',
  );

  const cancelUpgrade = (planetId: bigint) => call('cancelUpgrade', [planetId]);

  return { cancelUpgrade, ...state };
}

/**
 * Hook to claim accumulated resources
 */
export function useClaimResources() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['calculateCurrentResources'],
    },
    'useClaimResources',
  );

  const claimResources = (planetId: bigint) => call('claimResources', [planetId]);

  return { claimResources, ...state };
}

// ========== Ship Read Hooks ==========

/**
 * Hook to get ship counts for a planet
 * Returns uint256[13] - index by SHIP_TYPE_INDEX values
 * result.data[1] = Small Cargo Ships, result.data[2] = Large Cargo Ships, etc.
 */
export function useShips(planetId: bigint | undefined) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getShips',
    args: planetId !== undefined ? [planetId] : undefined,
    query: {
      enabled: !!planetId && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: ShipsResult | undefined };
}

/**
 * Hook to get active ship build queue for a planet
 */
export function useShipQueue(planetId: bigint | undefined) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'shipQueues',
    args: planetId !== undefined ? [planetId] : undefined,
    query: {
      enabled: !!planetId && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: ShipQueueResult | undefined };
}

/**
 * Hook to get ship cost from GameConfig contract
 */
export function useShipCost(shipType: number) {
  return useReadContract({
    address: GAME_CONFIG_ADDRESS,
    abi: gameConfigAbi,
    functionName: 'getShipCost',
    args: [shipType],
    query: { enabled: shipType > 0 },
  }) as ReturnType<typeof useReadContract> & { data: Cost | undefined };
}

/**
 * Hook to get ship build time from GameConfig contract
 */
export function useShipBuildTime(shipType: number, quantity: number, shipyardLevel: number) {
  return useReadContract({
    address: GAME_CONFIG_ADDRESS,
    abi: gameConfigAbi,
    functionName: 'getShipBuildTime',
    args: [shipType, BigInt(quantity), shipyardLevel],
    query: { enabled: shipType > 0 && shipyardLevel > 0 && quantity > 0 },
  }) as ReturnType<typeof useReadContract> & { data: bigint | undefined };
}

// ========== Ship Write Hooks ==========

/**
 * Hook to build ships
 */
export function useBuildShips() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['shipQueues', 'getShips', 'calculateCurrentResources'],
    },
    'useBuildShips',
  );

  const buildShips = (planetId: bigint, shipType: number, quantity: number) =>
    call('buildShips', [planetId, shipType, BigInt(quantity)]);

  return { buildShips, ...state };
}

/**
 * Hook to complete ship build
 */
export function useCompleteShipBuild() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['shipQueues', 'getShips', 'getTutorialStatus'],
    },
    'useCompleteShipBuild',
  );

  const completeShipBuild = (planetId: bigint) => call('completeShipBuild', [planetId]);

  return { completeShipBuild, ...state };
}

/**
 * Hook to cancel ship build
 */
export function useCancelShipBuild() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['shipQueues', 'calculateCurrentResources'],
    },
    'useCancelShipBuild',
  );

  const cancelShipBuild = (planetId: bigint) => call('cancelShipBuild', [planetId]);

  return { cancelShipBuild, ...state };
}

// ========== Defense Type Mapping ==========

/** Maximum number of defense types (matches contract MAX_DEFENSE_TYPES) */
export const MAX_DEFENSE_TYPES = 9;

/** Defense type indices (matches contract DefenseType enum) */
export const DEFENSE_TYPE_INDEX = {
  NONE: 0,
  ROCKET_LAUNCHER: 1,
  LIGHT_LASER: 2,
  HEAVY_LASER: 3,
  ION_CANNON: 4,
  GAUSS_CANNON: 5,
  PLASMA_TURRET: 6,
  SMALL_SHIELD_DOME: 7,
  LARGE_SHIELD_DOME: 8,
} as const;

export const DEFENSE_TYPE_MAP: Record<string, number> = {
  rocketLauncher: 1,
  lightLaser: 2,
  heavyLaser: 3,
  ionCannon: 4,
  gaussCannon: 5,
  plasmaTurret: 6,
  smallShieldDome: 7,
  largeShieldDome: 8,
};

export const DEFENSE_TYPE_REVERSE_MAP: Record<number, string> = {
  1: 'rocketLauncher',
  2: 'lightLaser',
  3: 'heavyLaser',
  4: 'ionCannon',
  5: 'gaussCannon',
  6: 'plasmaTurret',
  7: 'smallShieldDome',
  8: 'largeShieldDome',
};

/** Return type for getDefenses - fixed-size array of 9 defense counts */
export type DefensesResult = readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

/** Return type for defenseQueues */
export type DefenseQueueResult = readonly [number, bigint, number];

// ========== Defense Read Hooks ==========

/**
 * Hook to get defense counts for a planet
 * Returns uint256[9] - index by DEFENSE_TYPE_INDEX values
 */
export function useDefenses(planetId: bigint | undefined) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getDefenses',
    args: planetId !== undefined ? [planetId] : undefined,
    query: {
      enabled: !!planetId && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: DefensesResult | undefined };
}

/**
 * Hook to get active defense build queue for a planet
 */
export function useDefenseQueue(planetId: bigint | undefined) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'defenseQueues',
    args: planetId !== undefined ? [planetId] : undefined,
    query: {
      enabled: !!planetId && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: DefenseQueueResult | undefined };
}

/**
 * Hook to get defense build time from GameConfig contract
 */
export function useDefenseBuildTime(defenseType: number, quantity: number, shipyardLevel: number) {
  return useReadContract({
    address: GAME_CONFIG_ADDRESS,
    abi: gameConfigAbi,
    functionName: 'getDefenseBuildTime',
    args: [defenseType, BigInt(quantity), shipyardLevel],
    query: { enabled: defenseType > 0 && shipyardLevel > 0 && quantity > 0 },
  }) as ReturnType<typeof useReadContract> & { data: bigint | undefined };
}

// ========== Defense Write Hooks ==========

/**
 * Hook to build defenses
 */
export function useBuildDefenses() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['defenseQueues', 'getDefenses', 'calculateCurrentResources'],
    },
    'useBuildDefenses',
  );

  const buildDefenses = (planetId: bigint, defenseType: number, quantity: number) =>
    call('buildDefenses', [planetId, defenseType, BigInt(quantity)]);

  return { buildDefenses, ...state };
}

/**
 * Hook to complete defense build
 */
export function useCompleteDefenseBuild() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['defenseQueues', 'getDefenses'],
    },
    'useCompleteDefenseBuild',
  );

  const completeDefenseBuild = (planetId: bigint) => call('completeDefenseBuild', [planetId]);

  return { completeDefenseBuild, ...state };
}

/**
 * Hook to cancel defense build
 */
export function useCancelDefenseBuild() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['defenseQueues', 'calculateCurrentResources'],
    },
    'useCancelDefenseBuild',
  );

  const cancelDefenseBuild = (planetId: bigint) => call('cancelDefenseBuild', [planetId]);

  return { cancelDefenseBuild, ...state };
}

// ========== Galaxy/System Read Hooks ==========

/** Planet data returned from getSystemPlanets */
export interface SystemPlanet {
  owner: `0x${string}`;
  coordinates: readonly [number, number, number];
  name: string;
  createdAt: number;
  exists: boolean;
}

/** Return type for getSystemPlanets - array of 10 planets (positions 1-10) */
export type SystemPlanetsResult = readonly SystemPlanet[];

/**
 * Hook to get all planets in a specific galaxy system
 */
export function useSystemPlanets(galaxy: number, system: number) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getSystemPlanets',
    args: [galaxy, system],
    query: {
      enabled: galaxy > 0 && system > 0 && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: SystemPlanetsResult | undefined };
}

// ========== Fleet Read Hooks ==========

/**
 * Hook to get all active fleet IDs for the connected player
 */
export function usePlayerFleetIds() {
  const { address } = useAccount();
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerFleetIds',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
      refetchOnMount: 'always',
    },
  }) as ReturnType<typeof useReadContract> & { data: readonly bigint[] | undefined };
}

/**
 * Hook to get full fleet data by ID
 */
export function useFleet(fleetId: bigint | undefined) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getFleet',
    args: fleetId !== undefined ? [fleetId] : undefined,
    query: {
      enabled: fleetId !== undefined && !!NEXUS_GAME_ADDRESS,
    },
  });
}

/**
 * Hook to get number of active fleets for the connected player
 */
export function usePlayerFleetCount() {
  const { address } = useAccount();
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerFleetCount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
      refetchOnMount: 'always',
    },
  }) as ReturnType<typeof useReadContract> & { data: bigint | undefined };
}

/**
 * Hook to get stationed ships at coordinates (used for outpost garrisons)
 */
export function useStationedShips(galaxy: number, system: number, position: number) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getStationedShips',
    args: [[galaxy, system, position]],
    query: {
      enabled: galaxy > 0 && system > 0 && position > 0 && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: readonly bigint[] | undefined };
}

/**
 * Hook to get full outpost data including calculated resources and garrison
 * Returns tuple: [RaiderOutpost, currentResources, garrison]
 */
export function useOutpost(galaxy: number, system: number, position: number) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getOutpost',
    args: [galaxy, system, position],
    query: {
      enabled: galaxy > 0 && system > 0 && position >= 11 && position <= 15 && !!NEXUS_GAME_ADDRESS,
    },
  });
}

/**
 * Hook to get all 5 outposts in a system (positions 11-15)
 * Returns tuple: [RaiderOutpost[5], currentResources[5], garrison[5][13]]
 */
export function useSystemOutposts(galaxy: number, system: number) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getSystemOutposts',
    args: [galaxy, system],
    query: {
      enabled: galaxy > 0 && system > 0 && !!NEXUS_GAME_ADDRESS,
    },
  });
}

/**
 * Hook to calculate outpost resources without full outpost data
 * Returns tuple: [currentResources, outpostType]
 */
export function useCalculateOutpostResources(galaxy: number, system: number, position: number) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'calculateOutpostResources',
    args: [galaxy, system, position],
    query: {
      enabled: galaxy > 0 && system > 0 && position >= 11 && position <= 15 && !!NEXUS_GAME_ADDRESS,
    },
  });
}

/**
 * Hook to get all outpost coordinates owned by the connected player
 * Returns uint16[3][] — array of [galaxy, system, position] tuples
 */
export function usePlayerOutposts() {
  const { address } = useAccount();

  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerOutposts',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  });
}

// ========== Fleet Write Hooks ==========

/**
 * Hook to dispatch a fleet on a mission (RAID, CAPTURE, or MOVE)
 */
export function useDispatchFleet() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: [
        'getPlayerFleetIds',
        'getPlayerFleetCount',
        'getShips',
        'calculateCurrentResources',
      ],
    },
    'useDispatchFleet',
  );

  const dispatchFleet = (
    planetId: bigint,
    ships: bigint[],
    destination: [number, number, number],
    mission: number,
    cargoTitanium: bigint,
    cargoHelium3: bigint,
    cargoDarkMatter: bigint,
  ) =>
    call('dispatchFleet', [
      planetId,
      ships,
      destination,
      mission,
      cargoTitanium,
      cargoHelium3,
      cargoDarkMatter,
    ]);

  return { dispatchFleet, ...state };
}

/**
 * Hook to dispatch a fleet FROM an outpost TO the player's home planet
 * Used for withdrawing ships and resources from captured outposts
 */
export function useDispatchFleetFromOutpost() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: [
        'getPlayerFleetIds',
        'getPlayerFleetCount',
        'getStationedShips',
        'getOutpost',
        'getSystemOutposts',
        'calculateOutpostResources',
      ],
    },
    'useDispatchFleetFromOutpost',
  );

  const dispatchFleetFromOutpost = (
    origin: [number, number, number],
    ships: bigint[],
    destination: [number, number, number],
    cargoTitanium: bigint,
    cargoHelium3: bigint,
    cargoDarkMatter: bigint,
  ) =>
    call('dispatchFleetFromOutpost', [
      origin,
      ships,
      destination,
      cargoTitanium,
      cargoHelium3,
      cargoDarkMatter,
    ]);

  return { dispatchFleetFromOutpost, ...state };
}

/**
 * Hook to resolve a fleet that has arrived at its destination
 * Anyone can call this (not restricted to fleet owner)
 */
export function useResolveFleet() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: [
        'getPlayerFleetIds',
        'getPlayerFleetCount',
        'getFleet',
        'getShips',
        'getStationedShips',
        'getOutpost',
        'getSystemOutposts',
        'getPlayerOutposts',
        'calculateCurrentResources',
        'calculateOutpostResources',
        'getPlayerReportIds',
        'getPlayerReportCount',
        'getPlayerRecentReports',
        'getPlayerPlanets',
        'getPlayerPlanetCount',
        'getSystemPlanets',
      ],
    },
    'useResolveFleet',
  );

  const resolveFleet = (fleetId: bigint) => call('resolveFleet', [fleetId]);

  return { resolveFleet, ...state };
}

/**
 * Hook to complete a returning fleet (ships and cargo return home)
 * Only for RAID missions that are in RETURNING status
 */
export function useCompleteFleet() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: [
        'getPlayerFleetIds',
        'getPlayerFleetCount',
        'getFleet',
        'getShips',
        'calculateCurrentResources',
        'getPlayerReportIds',
        'getPlayerReportCount',
        'getPlayerRecentReports',
      ],
    },
    'useCompleteFleet',
  );

  const completeFleet = (fleetId: bigint) => call('completeFleet', [fleetId]);

  return { completeFleet, ...state };
}

// ========== Battle Report Read Hooks ==========

export function useBattleReport(reportId: bigint | undefined) {
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getBattleReport',
    args: reportId !== undefined ? [reportId] : undefined,
    query: {
      enabled: reportId !== undefined && !!NEXUS_GAME_ADDRESS,
    },
  });
}

export function usePlayerReportIds() {
  const { address } = useAccount();
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerReportIds',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  });
}

export function usePlayerReportCount() {
  const { address } = useAccount();
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerReportCount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  });
}

export function usePlayerRecentReports(count: number = 10) {
  const { address } = useAccount();
  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerRecentReports',
    args: address ? [address, BigInt(count)] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  });
}

// ========== Research Type Mapping ==========
export const RESEARCH_TYPE_MAP: Record<string, number> = {
  combustionDrive: 1,
  impulseDrive: 2,
  hyperspaceDrive: 3,
  weaponTech: 4,
  shieldingTech: 5,
  armourTech: 6,
  computerTech: 7,
  stealthSystems: 8,
  ionTech: 9,
  hyperspaceTech: 10,
  laserTech: 11,
  plasmaTech: 12,
  astrophysics: 13,
};

export const RESEARCH_TYPE_REVERSE_MAP: Record<number, string> = {
  1: 'combustionDrive',
  2: 'impulseDrive',
  3: 'hyperspaceDrive',
  4: 'weaponTech',
  5: 'shieldingTech',
  6: 'armourTech',
  7: 'computerTech',
  8: 'stealthSystems',
  9: 'ionTech',
  10: 'hyperspaceTech',
  11: 'laserTech',
  12: 'plasmaTech',
  13: 'astrophysics',
};

/** ResearchLevels struct from GameState contract */
export interface ResearchLevels {
  combustionDrive: number;
  impulseDrive: number;
  hyperspaceDrive: number;
  weaponTech: number;
  shieldingTech: number;
  armourTech: number;
  computerTech: number;
  stealthSystems: number;
  ionTech: number;
  hyperspaceTech: number;
  laserTech: number;
  plasmaTech: number;
  astrophysics: number;
}

/** ResearchQueue struct from GameState contract */
export interface ResearchQueueData {
  researchType: number;
  targetLevel: number;
  completionTime: number;
}

/** Return type for researchQueues backwards-compatible accessor */
export type ResearchQueueResult = readonly [number, number, number];

// ========== Research Read Hooks ==========

/**
 * Hook to get all research levels for the connected player
 */
export function usePlayerResearch() {
  const { address } = useAccount();

  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getPlayerResearch',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: ResearchLevels | undefined };
}

/**
 * Hook to get the research queue for the connected player
 */
export function useResearchQueue() {
  const { address } = useAccount();

  return useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'researchQueues',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!NEXUS_GAME_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: ResearchQueueResult | undefined };
}

/**
 * Hook to get research cost from GameConfig contract
 */
export function useResearchCost(researchType: number, currentLevel: number) {
  return useReadContract({
    address: GAME_CONFIG_ADDRESS,
    abi: gameConfigAbi,
    functionName: 'getResearchCost',
    args: [researchType, currentLevel],
    query: {
      enabled: researchType > 0 && !!GAME_CONFIG_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: Cost | undefined };
}

/**
 * Hook to get research time from GameConfig contract
 */
export function useResearchTime(researchType: number, currentLevel: number, researchNodeLevel: number) {
  return useReadContract({
    address: GAME_CONFIG_ADDRESS,
    abi: gameConfigAbi,
    functionName: 'getResearchTime',
    args: [researchType, currentLevel, researchNodeLevel],
    query: {
      enabled: researchType > 0 && researchNodeLevel > 0 && !!GAME_CONFIG_ADDRESS,
    },
  }) as ReturnType<typeof useReadContract> & { data: bigint | undefined };
}

// ========== Research Write Hooks ==========

/**
 * Hook to start researching a technology
 */
export function useStartResearch() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['getPlayerResearch', 'researchQueues', 'calculateCurrentResources'],
    },
    'useStartResearch',
  );

  const startResearch = (planetId: bigint, researchType: number) =>
    call('startResearch', [planetId, researchType]);

  return { startResearch, ...state };
}

/**
 * Hook to complete research
 */
export function useCompleteResearch() {
  const { address } = useAccount();
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['getPlayerResearch', 'researchQueues', 'getTutorialStatus'],
    },
    'useCompleteResearch',
  );

  const completeResearch = () => {
    if (!address) return;
    return call('completeResearch', [address]);
  };

  return { completeResearch, ...state };
}

/**
 * Hook to cancel research (50% refund)
 */
export function useCancelResearch() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['getPlayerResearch', 'researchQueues', 'calculateCurrentResources'],
    },
    'useCancelResearch',
  );

  const cancelResearch = (planetId: bigint) => call('cancelResearch', [planetId]);

  return { cancelResearch, ...state };
}

// ========== Blockchain Utility Hooks ==========

/**
 * Hook to get current blockchain timestamp
 *
 * WHY THIS EXISTS:
 * When testing locally with Hardhat, we use time.increase() to advance the blockchain
 * time (e.g., to skip build times). This causes the blockchain's block.timestamp to
 * diverge from real wall-clock time. If we use Date.now(), build timers show incorrect
 * values (e.g., 96 hours instead of seconds) because the contract's completionTime is
 * based on the advanced blockchain timestamp.
 *
 * IMPORTANT: We use blockTag: 'pending' to get the current simulated time.
 * Without this, useBlock returns the last MINED block's timestamp, which doesn't
 * advance until a new transaction is made (problematic on local Hardhat networks).
 */
export function useBlockTimestamp() {
  // Substrate-side equivalent of wagmi's useBlock({ blockTag: 'pending' }):
  // pallet_timestamp's `Timestamp.Now` storage (milliseconds) at best block,
  // refetched once per block-ish interval. Contract completionTimes are
  // computed from chain time, so read the chain rather than Date.now() to
  // stay consistent when they diverge.
  const { data: nowMs } = useQuery({
    queryKey: ['chain', 'timestampNow'],
    refetchInterval: 6_000,
    staleTime: 0,
    queryFn: async () => {
      const api = (await getTypedApi()) as unknown as {
        query: { Timestamp: { Now: { getValue: () => Promise<bigint> } } };
      };
      return api.query.Timestamp.Now.getValue();
    },
  });

  const timestamp =
    nowMs !== undefined ? Math.floor(Number(nowMs) / 1000) : Math.floor(Date.now() / 1000);

  return { timestamp };
}

// ========== Tutorial Hooks ==========

/**
 * Hook to get the full tutorial quest status for the current player
 */
export function useTutorialStatus(planetId: bigint | undefined) {
  const { address } = useAccount();

  const result = useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getTutorialStatus',
    args: address && planetId !== undefined ? [address, planetId] : undefined,
    query: {
      enabled: !!address && planetId !== undefined && !!NEXUS_GAME_ADDRESS,
    },
  });

  useEffect(() => {
    if (result.isLoading) return;
    console.log(`[${getTimestamp()}] [useTutorialStatus]`, {
      address,
      planetId: planetId?.toString(),
      data: result.data,
      error: result.error?.message,
    });
  }, [address, planetId, result.data, result.isLoading, result.error]);

  return result;
}

/**
 * Hook to claim a tutorial quest reward
 */
export function useClaimTutorialQuest() {
  const { call, ...state } = useNexusContractWrite(
    {
      contractAddress: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbiTyped,
      invalidate: ['getTutorialStatus', 'calculateCurrentResources', 'getPlanet'],
    },
    'useClaimTutorialQuest',
  );

  const claimQuest = (planetId: bigint, questId: number) =>
    call('claimTutorialQuest', [planetId, BigInt(questId)]);

  return { claimQuest, ...state };
}
