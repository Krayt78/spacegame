'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Rocket,
  Swords,
  Flag,
  Package,
  Globe,
  Plus,
  Minus,
  Gem,
  Sparkles,
  CircleDot,
  AlertTriangle,
  Fuel,
} from 'lucide-react';
import { useReadContracts } from 'wagmi';
import { Card, CardHeader, CardContent, Button, ProgressBar } from '@/components/ui';
import {
  useDispatchFleet,
  useDispatchFleetFromOutpost,
  usePlayerOutposts,
  usePlayerPlanets,
  useShips,
  useCurrentResources,
  useStationedShips,
  useCalculateOutpostResources,
  FLEET_MISSION,
  SHIP_TYPE_INDEX,
  OUTPOST_TYPE_NAMES,
  OUTPOST_RESOURCE_MAP,
} from '@/hooks/useNexusGame';
import type { GetPlanetResult } from '@/hooks/useNexusGame';
import { NEXUS_GAME_ADDRESS, nexusGameAbi } from '@/lib/contracts';
import { SHIP_CONFIG, SHIP_NAMES, SHIP_ICON_MAP, SHIP_TYPE_MAP, MAX_SHIP_TYPES } from '@/constants/gameConfig';
import { calculateDistance, calculateFleetFuelConsumption } from '@/lib/gameLogic';
import { formatNumber, cn } from '@/lib/utils';
import type { Ships } from '@/types/game';

interface FleetDispatchFormProps {
  currentFleets: number;
  maxFleets: number;
  computerTechLevel: number;
}

type OwnedLocation = {
  label: string;
  coords: [number, number, number];
  type: 'planet' | 'colony' | 'outpost';
  planetId?: bigint;
};

// Ship type configuration - all dispatchable ships (excludes crawler which has speed=0)
const SHIP_TYPES = (Object.keys(SHIP_CONFIG) as Array<keyof typeof SHIP_CONFIG>)
  .filter(key => SHIP_CONFIG[key].speed > 0) // Filter out crawler (speed=0)
  .map(key => ({
    key,
    index: SHIP_TYPE_MAP[key],
    name: SHIP_NAMES[key],
    icon: SHIP_ICON_MAP[key].icon,
    color: SHIP_ICON_MAP[key].color,
  }));

// Mission configuration
const MISSIONS = [
  {
    id: FLEET_MISSION.RAID,
    label: 'Raid',
    icon: Swords,
    color: 'var(--accent-danger)',
    description: 'Attack a target and steal resources. Fleet returns home with plunder.',
  },
  {
    id: FLEET_MISSION.CAPTURE,
    label: 'Capture',
    icon: Flag,
    color: 'var(--accent-warn)',
    description: 'Capture an outpost (positions 11-15). Ships stay stationed at the outpost.',
  },
  {
    id: FLEET_MISSION.MOVE,
    label: 'Move',
    icon: Package,
    color: 'var(--accent-secondary)',
    description: 'Transfer ships and cargo to your outpost. Ships stay at destination.',
  },
  {
    id: FLEET_MISSION.COLONIZE,
    label: 'Colonize',
    icon: Globe,
    color: 'var(--accent-primary)',
    description: 'Establish a new colony. Requires 1 Colony Ship. Remaining ships and cargo stay at new planet.',
  },
];

const EMPTY_SHIPS: Ships = {
  smallCargo: 0, largeCargo: 0, lightFighter: 0, heavyFighter: 0,
  cruiser: 0, battleship: 0, battlecruiser: 0, bomber: 0,
  destroyer: 0, colonyShip: 0, recycler: 0, crawler: 0,
};

const EMPTY_SELECTED: Record<string, number> = {
  smallCargo: 0, largeCargo: 0, lightFighter: 0, heavyFighter: 0,
  cruiser: 0, battleship: 0, battlecruiser: 0, bomber: 0,
  destroyer: 0, colonyShip: 0, recycler: 0,
};

export function FleetDispatchForm({
  currentFleets,
  maxFleets,
  computerTechLevel,
}: FleetDispatchFormProps) {

  // Fetch player's outposts for origin and MOVE destination selectors
  const { data: playerOutpostsRaw } = usePlayerOutposts();
  const playerOutposts = playerOutpostsRaw as readonly (readonly [number, number, number])[] | undefined;

  // Fetch all planet IDs owned by player (home + colonies)
  const { data: allPlanetIds } = usePlayerPlanets();

  const planetIds = useMemo(() => {
    if (!allPlanetIds) return [];
    return allPlanetIds as readonly bigint[];
  }, [allPlanetIds]);

  // Batch-fetch planet data for ALL owned planets via multicall
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allPlanetDataResults } = useReadContracts({
    contracts: planetIds.map(id => ({
      address: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbi as any,
      functionName: 'getPlanet',
      args: [id],
    })),
    query: { enabled: planetIds.length > 0 },
  });

  // Build list of owned locations (planets + colonies + outposts) used for both origin and destination
  const ownedLocations = useMemo(() => {
    const locations: OwnedLocation[] = [];

    // Add all planets (home + colonies) from batch-fetch results
    if (allPlanetDataResults) {
      allPlanetDataResults.forEach((result, idx) => {
        if (result.status === 'success' && result.result) {
          const [planet] = result.result as unknown as GetPlanetResult;
          const [g, s, p] = [
            Number(planet.coordinates[0]),
            Number(planet.coordinates[1]),
            Number(planet.coordinates[2]),
          ];
          // First planet in allPlanetIds is always the home planet
          const type = idx === 0 ? 'planet' : 'colony';
          locations.push({
            label: `${idx === 0 ? 'Planet' : planet.name} [${g}:${s}:${p}]`,
            coords: [g, s, p],
            type: type as 'planet' | 'colony',
            planetId: planetIds[idx],
          });
        }
      });
    }

    // Add player's outposts
    if (playerOutposts) {
      for (const outpost of playerOutposts) {
        const [g, s, p] = [Number(outpost[0]), Number(outpost[1]), Number(outpost[2])];
        // Derive outpost type from position (11-12: Titanium Mine, 13-14: Helium-3 Lab, 15: Dark Matter Refinery)
        const outpostType = p <= 12 ? 1 : p <= 14 ? 2 : 3;
        const typeName = OUTPOST_TYPE_NAMES[outpostType] || 'Outpost';
        locations.push({
          label: `${typeName} [${g}:${s}:${p}]`,
          coords: [g, s, p],
          type: 'outpost',
        });
      }
    }

    return locations;
  }, [allPlanetDataResults, planetIds, playerOutposts]);

  // Planets/colonies only (valid destinations when dispatching from outpost)
  const planetDestinations = useMemo(() =>
    ownedLocations.filter(loc => loc.type !== 'outpost'),
    [ownedLocations]
  );

  // Origin selector state (index into ownedLocations, 0 = home planet)
  const [originIndex, setOriginIndex] = useState(0);

  // Guard against stale originIndex if outposts change
  const safeOriginIndex = originIndex < ownedLocations.length ? originIndex : 0;
  const selectedOrigin = ownedLocations[safeOriginIndex] ?? null;
  const isFromOutpost = selectedOrigin?.type === 'outpost';
  const outpostCoords: [number, number, number] | null = isFromOutpost ? selectedOrigin.coords : null;
  const originPlanetId: bigint | undefined = selectedOrigin?.planetId;

  // Fetch stationed ships at selected outpost (hook self-disables when coords are 0)
  const { data: stationedShipsData } = useStationedShips(
    outpostCoords?.[0] ?? 0,
    outpostCoords?.[1] ?? 0,
    outpostCoords?.[2] ?? 0,
  );

  // Fetch outpost resources (hook self-disables when coords are invalid)
  const { data: outpostResourcesData } = useCalculateOutpostResources(
    outpostCoords?.[0] ?? 0,
    outpostCoords?.[1] ?? 0,
    outpostCoords?.[2] ?? 0,
  );

  // Fetch ships for the selected planet/colony origin (self-disables for outpost origins)
  const { data: originShipsData } = useShips(isFromOutpost ? undefined : originPlanetId);

  // Fetch resources for the selected planet/colony origin (self-disables for outpost origins)
  const { data: originResourcesData } = useCurrentResources(isFromOutpost ? undefined : originPlanetId);

  // Effective ships available at the selected origin
  const effectiveShips = useMemo((): Ships => {
    if (isFromOutpost) {
      if (!stationedShipsData) return EMPTY_SHIPS;
      const data = stationedShipsData as readonly bigint[];
      return {
        smallCargo: Number(data[SHIP_TYPE_INDEX.SMALL_CARGO] || BigInt(0)),
        largeCargo: Number(data[SHIP_TYPE_INDEX.LARGE_CARGO] || BigInt(0)),
        lightFighter: Number(data[SHIP_TYPE_INDEX.LIGHT_FIGHTER] || BigInt(0)),
        heavyFighter: Number(data[SHIP_TYPE_INDEX.HEAVY_FIGHTER] || BigInt(0)),
        cruiser: Number(data[SHIP_TYPE_INDEX.CRUISER] || BigInt(0)),
        battleship: Number(data[SHIP_TYPE_INDEX.BATTLESHIP] || BigInt(0)),
        battlecruiser: Number(data[SHIP_TYPE_INDEX.BATTLECRUISER] || BigInt(0)),
        bomber: Number(data[SHIP_TYPE_INDEX.BOMBER] || BigInt(0)),
        destroyer: Number(data[SHIP_TYPE_INDEX.DESTROYER] || BigInt(0)),
        colonyShip: Number(data[SHIP_TYPE_INDEX.COLONY_SHIP] || BigInt(0)),
        recycler: Number(data[SHIP_TYPE_INDEX.RECYCLER] || BigInt(0)),
        crawler: Number(data[SHIP_TYPE_INDEX.CRAWLER] || BigInt(0)),
      };
    }
    if (!originShipsData) return EMPTY_SHIPS;
    return {
      smallCargo: Number(originShipsData[SHIP_TYPE_INDEX.SMALL_CARGO] || BigInt(0)),
      largeCargo: Number(originShipsData[SHIP_TYPE_INDEX.LARGE_CARGO] || BigInt(0)),
      lightFighter: Number(originShipsData[SHIP_TYPE_INDEX.LIGHT_FIGHTER] || BigInt(0)),
      heavyFighter: Number(originShipsData[SHIP_TYPE_INDEX.HEAVY_FIGHTER] || BigInt(0)),
      cruiser: Number(originShipsData[SHIP_TYPE_INDEX.CRUISER] || BigInt(0)),
      battleship: Number(originShipsData[SHIP_TYPE_INDEX.BATTLESHIP] || BigInt(0)),
      battlecruiser: Number(originShipsData[SHIP_TYPE_INDEX.BATTLECRUISER] || BigInt(0)),
      bomber: Number(originShipsData[SHIP_TYPE_INDEX.BOMBER] || BigInt(0)),
      destroyer: Number(originShipsData[SHIP_TYPE_INDEX.DESTROYER] || BigInt(0)),
      colonyShip: Number(originShipsData[SHIP_TYPE_INDEX.COLONY_SHIP] || BigInt(0)),
      recycler: Number(originShipsData[SHIP_TYPE_INDEX.RECYCLER] || BigInt(0)),
      crawler: Number(originShipsData[SHIP_TYPE_INDEX.CRAWLER] || BigInt(0)),
    };
  }, [isFromOutpost, originShipsData, stationedShipsData]);

  // Effective resources available at the selected origin
  const effectiveResources = useMemo(() => {
    if (isFromOutpost) {
      if (!outpostResourcesData || !outpostCoords) return { titanium: 0, helium3: 0, darkMatter: 0 };
      const [resourceAmount, outpostTypeEnum] = outpostResourcesData as [bigint, number];
      const amount = Number(resourceAmount);
      const outpostType = Number(outpostTypeEnum);
      const resourceKey = OUTPOST_RESOURCE_MAP[outpostType];
      return {
        titanium: resourceKey === 'titanium' ? amount : 0,
        helium3: resourceKey === 'helium3' ? amount : 0,
        darkMatter: resourceKey === 'darkMatter' ? amount : 0,
      };
    }
    if (!originResourcesData) return { titanium: 0, helium3: 0, darkMatter: 0 };
    return {
      titanium: Number(originResourcesData[0] || BigInt(0)),
      helium3: Number(originResourcesData[1] || BigInt(0)),
      darkMatter: Number(originResourcesData[2] || BigInt(0)),
    };
  }, [isFromOutpost, originResourcesData, outpostResourcesData, outpostCoords]);

  // Selected MOVE destination index (into ownedLocations)
  const [moveDestIndex, setMoveDestIndex] = useState(0);

  // Ship selection state - initialize all ship types to 0
  const [selectedShips, setSelectedShips] = useState<Record<string, number>>({ ...EMPTY_SELECTED });

  // Mission type
  const [mission, setMission] = useState<number>(FLEET_MISSION.RAID);

  // Cargo (only for MOVE mission)
  const [cargoTitanium, setCargoTitanium] = useState(0);
  const [cargoHelium3, setCargoHelium3] = useState(0);
  const [cargoDarkMatter, setCargoDarkMatter] = useState(0);

  // Dispatch hooks - both called unconditionally (React hook rules)
  const {
    dispatchFleet,
    isPending: isPendingPlanet,
    isConfirming: isConfirmingPlanet,
    isSuccess: isSuccessPlanet,
    error: errorPlanet,
    reset: resetPlanet,
  } = useDispatchFleet();

  const {
    dispatchFleetFromOutpost,
    isPending: isPendingOutpost,
    isConfirming: isConfirmingOutpost,
    isSuccess: isSuccessOutpost,
    error: errorOutpost,
    reset: resetOutpost,
  } = useDispatchFleetFromOutpost();

  // Unified dispatch state based on origin type
  const isPending = isFromOutpost ? isPendingOutpost : isPendingPlanet;
  const isConfirming = isFromOutpost ? isConfirmingOutpost : isConfirmingPlanet;
  const isSuccess = isFromOutpost ? isSuccessOutpost : isSuccessPlanet;
  const error = isFromOutpost ? errorOutpost : errorPlanet;
  const reset = isFromOutpost ? resetOutpost : resetPlanet;

  // Reset selected ships, cargo, and destination when origin changes
  useEffect(() => {
    setSelectedShips({ ...EMPTY_SELECTED });
    setCargoTitanium(0);
    setCargoHelium3(0);
    setCargoDarkMatter(0);
    setMoveDestIndex(0);
  }, [safeOriginIndex]);

  // Force mission to MOVE when dispatching from outpost
  useEffect(() => {
    if (isFromOutpost) {
      setMission(FLEET_MISSION.MOVE);
    }
  }, [isFromOutpost]);

  // Reset cargo when mission changes away from MOVE
  useEffect(() => {
    if (mission !== FLEET_MISSION.MOVE) {
      setCargoTitanium(0);
      setCargoHelium3(0);
      setCargoDarkMatter(0);
    }
  }, [mission]);

  // Reset form on success
  useEffect(() => {
    if (!isSuccess) return;

    setSelectedShips({ ...EMPTY_SELECTED });
    setCargoTitanium(0);
    setCargoHelium3(0);
    setCargoDarkMatter(0);
    const timer = setTimeout(() => reset(), 2000);
    return () => clearTimeout(timer);
  }, [isSuccess, reset]);

  // Calculate total ships selected
  const totalShipsSelected = useMemo(() => {
    return Object.values(selectedShips).reduce((sum, count) => sum + count, 0);
  }, [selectedShips]);

  // Calculate cargo capacity across all ship types
  const totalCargoCapacity = useMemo(() => {
    return SHIP_TYPES.reduce((total, shipType) => {
      const count = selectedShips[shipType.key] ?? 0;
      const capacity = SHIP_CONFIG[shipType.key as keyof typeof SHIP_CONFIG].cargoCapacity;
      return total + (count * capacity);
    }, 0);
  }, [selectedShips]);

  // Calculate fuel cost
  const fuelCost = useMemo(() => {
    if (totalShipsSelected === 0 || isFromOutpost) return 0;

    const origin: [number, number, number] = selectedOrigin?.coords ?? [1, 1, 1];
    const destList = isFromOutpost ? planetDestinations : ownedLocations;
    const dest: [number, number, number] = destList[moveDestIndex]?.coords ?? [1, 1, 1];

    if (origin[0] === dest[0] && origin[1] === dest[1] && origin[2] === dest[2]) return 0;

    const baseDistance = calculateDistance(origin, dest);
    const effectiveDistance = (mission === FLEET_MISSION.RAID || mission === FLEET_MISSION.CAPTURE)
      ? baseDistance * 2
      : baseDistance;

    return calculateFleetFuelConsumption(selectedShips, effectiveDistance);
  }, [totalShipsSelected, isFromOutpost, selectedOrigin, moveDestIndex, ownedLocations, planetDestinations, mission, selectedShips]);

  const hasEnoughFuel = effectiveResources.helium3 >= fuelCost;

  const totalCargoLoaded = cargoTitanium + cargoHelium3 + cargoDarkMatter;
  const cargoPercentage = totalCargoCapacity > 0 ? (totalCargoLoaded / totalCargoCapacity) * 100 : 0;

  // Validation
  const validation = useMemo(() => {
    const errors: string[] = [];

    // Fleet limit check
    if (computerTechLevel === 0) {
      errors.push('Computer Technology level 0: Cannot dispatch fleets. Research Computer Tech first.');
    } else if (currentFleets >= maxFleets) {
      errors.push(`Fleet limit reached (${currentFleets}/${maxFleets}). Research Computer Tech to increase limit.`);
    }

    // At least one ship selected
    if (totalShipsSelected === 0) {
      errors.push('Select at least one ship');
    }

    // Check ship availability against effective ships
    for (const shipType of SHIP_TYPES) {
      const selected = selectedShips[shipType.key] || 0;
      const available = effectiveShips[shipType.key as keyof Ships] || 0;
      if (selected > available) {
        errors.push(`Not enough ${shipType.name}s (have ${available})`);
      }
    }

    // Determine effective origin and destination
    const effectiveOrigin: [number, number, number] = selectedOrigin?.coords ?? [1, 1, 1];

    const destList = isFromOutpost ? planetDestinations : ownedLocations;
    const effectiveDest: [number, number, number] = destList[moveDestIndex]?.coords ?? [1, 1, 1];

    // Cannot dispatch to same location
    if (effectiveOrigin[0] === effectiveDest[0] &&
        effectiveOrigin[1] === effectiveDest[1] &&
        effectiveOrigin[2] === effectiveDest[2]) {
      errors.push('Cannot dispatch to same location');
    }

    // Mission-specific validation (only relevant when dispatching from planet)
    if (!isFromOutpost) {
      if (mission === FLEET_MISSION.CAPTURE) {
        const destPos = effectiveDest[2];
        if (destPos < 11 || destPos > 15) {
          errors.push('Capture requires outpost position (11-15)');
        }
      }
    }

    if (mission === FLEET_MISSION.MOVE || mission === FLEET_MISSION.COLONIZE || isFromOutpost) {
      // Cargo validation
      if (totalCargoLoaded > totalCargoCapacity) {
        errors.push('Cargo exceeds fleet capacity');
      }
      if (cargoTitanium > effectiveResources.titanium) {
        errors.push('Insufficient Titanium');
      }
      if (cargoHelium3 > effectiveResources.helium3) {
        errors.push('Insufficient Helium-3');
      }
      if (cargoDarkMatter > effectiveResources.darkMatter) {
        errors.push('Insufficient Dark Matter');
      }
    }

    if (mission === FLEET_MISSION.COLONIZE) {
      if ((selectedShips.colonyShip ?? 0) < 1) {
        errors.push('Colonization requires at least 1 Colony Ship');
      }
    }

    // Fuel validation (only for non-outpost dispatches)
    if (!isFromOutpost && fuelCost > 0 && effectiveResources.helium3 < fuelCost) {
      errors.push(`Insufficient Helium-3 for fuel (need ${formatNumber(fuelCost)}, have ${formatNumber(effectiveResources.helium3)})`);
    }

    return { isValid: errors.length === 0, errors };
  }, [
    computerTechLevel,
    currentFleets,
    maxFleets,
    totalShipsSelected,
    selectedShips,
    effectiveShips,
    isFromOutpost,
    outpostCoords,
    selectedOrigin,
    mission,
    moveDestIndex,
    ownedLocations,
    totalCargoLoaded,
    totalCargoCapacity,
    cargoTitanium,
    cargoHelium3,
    cargoDarkMatter,
    effectiveResources,
    fuelCost,
  ]);

  // Ship selection handlers (use effectiveShips for limits)
  const incrementShip = useCallback((key: string) => {
    setSelectedShips((prev) => ({
      ...prev,
      [key]: Math.min((prev[key] || 0) + 1, effectiveShips[key as keyof typeof effectiveShips] || 0),
    }));
  }, [effectiveShips]);

  const decrementShip = useCallback((key: string) => {
    setSelectedShips((prev) => ({
      ...prev,
      [key]: Math.max((prev[key] || 0) - 1, 0),
    }));
  }, []);

  const setMaxShips = useCallback((key: string) => {
    setSelectedShips((prev) => ({
      ...prev,
      [key]: effectiveShips[key as keyof typeof effectiveShips] || 0,
    }));
  }, [effectiveShips]);

  // Dispatch handler
  const handleDispatch = useCallback(() => {
    if (!validation.isValid) return;

    // Build 13-element ships array for contract (MAX_SHIP_TYPES)
    const shipsArray: bigint[] = new Array(MAX_SHIP_TYPES).fill(BigInt(0)) as bigint[];

    // Populate all ship types
    shipsArray[SHIP_TYPE_INDEX.SMALL_CARGO] = BigInt(selectedShips.smallCargo ?? 0);
    shipsArray[SHIP_TYPE_INDEX.LARGE_CARGO] = BigInt(selectedShips.largeCargo ?? 0);
    shipsArray[SHIP_TYPE_INDEX.LIGHT_FIGHTER] = BigInt(selectedShips.lightFighter ?? 0);
    shipsArray[SHIP_TYPE_INDEX.HEAVY_FIGHTER] = BigInt(selectedShips.heavyFighter ?? 0);
    shipsArray[SHIP_TYPE_INDEX.CRUISER] = BigInt(selectedShips.cruiser ?? 0);
    shipsArray[SHIP_TYPE_INDEX.BATTLESHIP] = BigInt(selectedShips.battleship ?? 0);
    shipsArray[SHIP_TYPE_INDEX.BATTLECRUISER] = BigInt(selectedShips.battlecruiser ?? 0);
    shipsArray[SHIP_TYPE_INDEX.BOMBER] = BigInt(selectedShips.bomber ?? 0);
    shipsArray[SHIP_TYPE_INDEX.DESTROYER] = BigInt(selectedShips.destroyer ?? 0);
    shipsArray[SHIP_TYPE_INDEX.COLONY_SHIP] = BigInt(selectedShips.colonyShip ?? 0);
    shipsArray[SHIP_TYPE_INDEX.RECYCLER] = BigInt(selectedShips.recycler ?? 0);

    if (isFromOutpost && outpostCoords) {
      // Dispatch from outpost to own planet (MOVE only, no mission param)
      const destList = planetDestinations;
      const destination: [number, number, number] = destList[moveDestIndex]?.coords ?? [1, 1, 1];
      dispatchFleetFromOutpost(
        outpostCoords,
        shipsArray,
        destination,
        BigInt(cargoTitanium),
        BigInt(cargoHelium3),
        BigInt(cargoDarkMatter),
      );
    } else if (originPlanetId) {
      // Dispatch from planet/colony
      const destination: [number, number, number] = ownedLocations[moveDestIndex]?.coords ?? [1, 1, 1];

      dispatchFleet(
        originPlanetId,
        shipsArray,
        destination,
        mission,
        BigInt((mission === FLEET_MISSION.MOVE || mission === FLEET_MISSION.COLONIZE) ? cargoTitanium : 0),
        BigInt((mission === FLEET_MISSION.MOVE || mission === FLEET_MISSION.COLONIZE) ? cargoHelium3 : 0),
        BigInt((mission === FLEET_MISSION.MOVE || mission === FLEET_MISSION.COLONIZE) ? cargoDarkMatter : 0),
      );
    }
  }, [
    validation.isValid,
    selectedShips,
    isFromOutpost,
    outpostCoords,
    originPlanetId,
    mission,
    moveDestIndex,
    ownedLocations,
    cargoTitanium,
    cargoHelium3,
    cargoDarkMatter,
    dispatchFleet,
    dispatchFleetFromOutpost,
  ]);

  const isDisabled = !validation.isValid || isPending || isConfirming;

  // Show loading state while planet data is being fetched
  if (ownedLocations.length === 0) {
    return (
      <Card>
        <CardHeader title="Dispatch Fleet" subtitle="Loading your planets..." />
        <CardContent>
          <p className="text-center py-4 text-[var(--text-muted)]">Loading planet data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Dispatch Fleet"
        subtitle="Select origin and destination to deploy your ships"
      />
      <CardContent className="space-y-6">
        {/* Fleet Limit Indicator */}
        <div className={`p-3 rounded-sm ${
          computerTechLevel === 0
            ? 'bg-[var(--accent-danger)]/10 border border-[var(--accent-danger)]/30'
            : currentFleets >= maxFleets
            ? 'bg-[var(--accent-warn)]/10 border border-[var(--accent-warn)]/30'
            : 'bg-[var(--bg-tertiary)]'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Fleet Capacity</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {computerTechLevel === 0 ? (
                  <span className="text-[var(--accent-danger)]">Computer Tech required to dispatch fleets</span>
                ) : currentFleets >= maxFleets ? (
                  <span className="text-[var(--accent-warn)]">Fleet limit reached - research Computer Tech to increase</span>
                ) : (
                  <span>Active fleets: {currentFleets} / {maxFleets}</span>
                )}
              </p>
            </div>
            <div className={`font-mono text-2xl font-bold ${
              computerTechLevel === 0
                ? 'text-[var(--accent-danger)]'
                : currentFleets >= maxFleets
                ? 'text-[var(--accent-warn)]'
                : 'text-[var(--accent-primary)]'
            }`}>
              {currentFleets}/{maxFleets}
            </div>
          </div>
          {computerTechLevel > 0 && (
            <ProgressBar
              progress={(currentFleets / Math.max(maxFleets, 1)) * 100}
              variant={currentFleets >= maxFleets ? 'danger' : 'default'}
              size="sm"
              className="mt-2"
            />
          )}
        </div>

        {/* Origin Selector */}
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">Dispatch from:</p>
          <select
            value={safeOriginIndex}
            onChange={(e) => setOriginIndex(Number(e.target.value))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-3 py-2 font-mono text-sm text-[var(--accent-primary)] focus:outline-none focus:border-[var(--accent-primary)] appearance-none cursor-pointer"
          >
            {ownedLocations.map((loc, idx) => (
              <option key={idx} value={idx}>
                {loc.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ship Selection */}
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">Select ships to dispatch:</p>
          {SHIP_TYPES.map((shipType) => {
            const available = effectiveShips[shipType.key as keyof Ships] || 0;
            const selected = selectedShips[shipType.key] || 0;
            const ShipIcon = shipType.icon;

            if (available === 0) return null;

            return (
              <div
                key={shipType.key}
                className="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-sm flex items-center justify-center"
                    style={{ backgroundColor: `${shipType.color}15` }}
                  >
                    <ShipIcon className="w-5 h-5" style={{ color: shipType.color }} />
                  </div>
                  <div>
                    <span className="font-display text-[var(--text-primary)]">{shipType.name}</span>
                    <span className="text-[var(--text-muted)] text-sm ml-2">(available: {available})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => decrementShip(shipType.key)}
                    disabled={selected <= 0}
                    className="w-8 h-8 p-0"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="font-mono w-8 text-center text-[var(--text-primary)]">{selected}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => incrementShip(shipType.key)}
                    disabled={selected >= available}
                    className="w-8 h-8 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMaxShips(shipType.key)}
                    disabled={selected >= available}
                  >
                    Max
                  </Button>
                </div>
              </div>
            );
          })}
          {totalShipsSelected === 0 && Object.values(effectiveShips).every(count => count === 0) && (
            <p className="text-center py-4 text-[var(--text-muted)]">
              {isFromOutpost
                ? 'No ships stationed at this outpost.'
                : 'No ships available. Build ships in the Shipyard first.'}
            </p>
          )}
        </div>

        {/* Destination */}
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">Select destination:</p>
          {(() => {
            const destList = isFromOutpost ? planetDestinations : ownedLocations;
            return (
              <select
                value={moveDestIndex}
                onChange={(e) => setMoveDestIndex(Number(e.target.value))}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-3 py-2 font-mono text-sm text-[var(--accent-primary)] focus:outline-none focus:border-[var(--accent-primary)] appearance-none cursor-pointer"
              >
                {destList.map((dest, idx) => (
                  <option key={idx} value={idx}>
                    {dest.label}
                  </option>
                ))}
              </select>
            );
          })()}
        </div>

        {/* Mission Type - only show when dispatching from planet */}
        {!isFromOutpost && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">Mission type:</p>
            <div className="grid grid-cols-3 gap-3">
              {MISSIONS.map((m) => {
                const MissionIcon = m.icon;
                const isSelected = mission === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMission(m.id)}
                    className={cn(
                      'p-3 rounded-sm border transition-all duration-200 text-left',
                      isSelected
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
                        : 'border-[var(--bg-tertiary)] bg-[var(--bg-tertiary)] hover:border-[var(--text-muted)]'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MissionIcon className="w-4 h-4" style={{ color: m.color }} />
                      <span className="font-display text-sm font-semibold text-[var(--text-primary)]">
                        {m.label}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2">{m.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Cargo Section (MOVE, COLONIZE, or outpost dispatch) */}
        {(mission === FLEET_MISSION.MOVE || mission === FLEET_MISSION.COLONIZE || isFromOutpost) && (
          <div className="space-y-3 p-4 bg-[var(--bg-tertiary)] rounded-sm">
            <p className="text-sm text-[var(--text-muted)]">Load cargo:</p>
            <div className="grid grid-cols-3 gap-4">
              {/* Titanium */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Gem className="w-3.5 h-3.5" style={{ color: 'var(--resource-titanium)' }} />
                  <label className="text-xs text-[var(--text-muted)]">Titanium</label>
                </div>
                <input
                  type="number"
                  min={0}
                  max={effectiveResources.titanium}
                  value={cargoTitanium}
                  onChange={(e) => setCargoTitanium(Math.max(0, Math.min(effectiveResources.titanium, parseInt(e.target.value) || 0)))}
                  className={cn(
                    'w-full bg-[var(--bg-secondary)] border rounded px-2 py-1.5 font-mono text-sm focus:outline-none',
                    cargoTitanium > effectiveResources.titanium
                      ? 'border-[var(--accent-danger)] text-[var(--accent-danger)]'
                      : 'border-[var(--border-primary)] text-[var(--text-primary)] focus:border-[var(--accent-primary)]'
                  )}
                />
                <p className="text-xs text-[var(--text-muted)]">
                  Available: {formatNumber(effectiveResources.titanium)}
                </p>
              </div>

              {/* Helium-3 */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--resource-helium3)' }} />
                  <label className="text-xs text-[var(--text-muted)]">Helium-3</label>
                </div>
                <input
                  type="number"
                  min={0}
                  max={effectiveResources.helium3}
                  value={cargoHelium3}
                  onChange={(e) => setCargoHelium3(Math.max(0, Math.min(effectiveResources.helium3, parseInt(e.target.value) || 0)))}
                  className={cn(
                    'w-full bg-[var(--bg-secondary)] border rounded px-2 py-1.5 font-mono text-sm focus:outline-none',
                    cargoHelium3 > effectiveResources.helium3
                      ? 'border-[var(--accent-danger)] text-[var(--accent-danger)]'
                      : 'border-[var(--border-primary)] text-[var(--text-primary)] focus:border-[var(--accent-primary)]'
                  )}
                />
                <p className="text-xs text-[var(--text-muted)]">
                  Available: {formatNumber(effectiveResources.helium3)}
                </p>
              </div>

              {/* Dark Matter */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <CircleDot className="w-3.5 h-3.5" style={{ color: 'var(--resource-darkMatter)' }} />
                  <label className="text-xs text-[var(--text-muted)]">Dark Matter</label>
                </div>
                <input
                  type="number"
                  min={0}
                  max={effectiveResources.darkMatter}
                  value={cargoDarkMatter}
                  onChange={(e) => setCargoDarkMatter(Math.max(0, Math.min(effectiveResources.darkMatter, parseInt(e.target.value) || 0)))}
                  className={cn(
                    'w-full bg-[var(--bg-secondary)] border rounded px-2 py-1.5 font-mono text-sm focus:outline-none',
                    cargoDarkMatter > effectiveResources.darkMatter
                      ? 'border-[var(--accent-danger)] text-[var(--accent-danger)]'
                      : 'border-[var(--border-primary)] text-[var(--text-primary)] focus:border-[var(--accent-primary)]'
                  )}
                />
                <p className="text-xs text-[var(--text-muted)]">
                  Available: {formatNumber(effectiveResources.darkMatter)}
                </p>
              </div>
            </div>

            {/* Cargo capacity bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Cargo capacity:</span>
                <span className={cn(
                  'font-mono',
                  totalCargoLoaded > totalCargoCapacity
                    ? 'text-[var(--accent-danger)]'
                    : 'text-[var(--text-secondary)]'
                )}>
                  {formatNumber(totalCargoLoaded)} / {formatNumber(totalCargoCapacity)}
                </span>
              </div>
              <ProgressBar
                progress={Math.min(100, cargoPercentage)}
                variant={totalCargoLoaded > totalCargoCapacity ? 'danger' : 'default'}
                size="sm"
              />
            </div>
          </div>
        )}

        {/* Fuel Cost Section */}
        {!isFromOutpost && totalShipsSelected > 0 && (
          <div className="space-y-2 p-4 bg-[var(--bg-tertiary)] rounded-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4" style={{ color: 'var(--resource-helium3)' }} />
                <span className="text-sm text-[var(--text-muted)]">Fuel Cost</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--resource-helium3)' }} />
                <span className={cn(
                  'font-mono text-sm font-semibold',
                  hasEnoughFuel
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--accent-danger)]'
                )}>
                  {formatNumber(fuelCost)}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  / {formatNumber(effectiveResources.helium3)} He-3
                </span>
              </div>
            </div>
            {(mission === FLEET_MISSION.RAID || mission === FLEET_MISSION.CAPTURE) && (
              <p className="text-xs text-[var(--accent-warn)]">
                {mission === FLEET_MISSION.RAID ? 'Raid' : 'Capture'} missions use double fuel (round-trip)
              </p>
            )}
            {!hasEnoughFuel && (
              <p className="text-xs text-[var(--accent-danger)]">
                Not enough Helium-3 for fuel!
              </p>
            )}
          </div>
        )}

        {/* Validation Errors */}
        {!validation.isValid && validation.errors.length > 0 && !isSuccess && (
          <div className="flex items-start gap-2 p-3 bg-[var(--accent-danger)]/10 rounded-sm">
            <AlertTriangle className="w-4 h-4 text-[var(--accent-danger)] flex-shrink-0 mt-0.5" />
            <div className="text-sm text-[var(--accent-danger)]">
              {validation.errors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-[var(--accent-danger)]/10 rounded-sm">
            <AlertTriangle className="w-4 h-4 text-[var(--accent-danger)] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--accent-danger)]">
              {(error as Error).message?.includes('user rejected')
                ? 'Transaction rejected'
                : (error as Error).message || 'Transaction failed'}
            </p>
          </div>
        )}

        {/* Success Message */}
        {isSuccess && (
          <div className="flex items-center gap-2 p-3 bg-[var(--accent-primary)]/10 rounded-sm">
            <Rocket className="w-4 h-4 text-[var(--accent-primary)]" />
            <p className="text-sm text-[var(--accent-primary)]">
              Fleet dispatched successfully!
            </p>
          </div>
        )}

        {/* Dispatch Button */}
        <Button
          variant="primary"
          size="lg"
          onClick={handleDispatch}
          disabled={isDisabled}
          isLoading={isPending || isConfirming}
          leftIcon={<Rocket className="w-4 h-4" />}
          className="w-full"
        >
          {isPending || isConfirming
            ? 'Dispatching...'
            : isFromOutpost
            ? 'Withdraw to Planet'
            : 'Dispatch Fleet'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default FleetDispatchForm;
