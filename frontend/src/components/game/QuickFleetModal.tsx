'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Swords,
  Flag,
  Package,
  Globe,
  X,
  Plus,
  Minus,
  Gem,
  Sparkles,
  CircleDot,
  AlertTriangle,
  Fuel,
} from 'lucide-react';
import { Card, CardHeader, CardContent, Button, ProgressBar } from '@/components/ui';
import {
  useDispatchFleet,
  useDispatchFleetFromOutpost,
  usePlayerOutposts,
  useStationedShips,
  useCalculateOutpostResources,
  FLEET_MISSION,
  SHIP_TYPE_INDEX,
  OUTPOST_TYPE_NAMES,
  OUTPOST_RESOURCE_MAP,
} from '@/hooks/useNexusGame';
import { SHIP_CONFIG, SHIP_NAMES, SHIP_ICON_MAP, SHIP_TYPE_MAP, MAX_SHIP_TYPES } from '@/constants/gameConfig';
import { calculateDistance, calculateFleetFuelConsumption } from '@/lib/gameLogic';
import { formatNumber, cn } from '@/lib/utils';
import { isUserRejection } from '@/lib/transactionErrors';
import type { Ships } from '@/types/game';

interface QuickFleetModalProps {
  isOpen: boolean;
  onClose: () => void;
  mission: number;
  destination: [number, number, number];
  destinationName: string;
  planetId: bigint;
  ships: Ships;
  currentResources: { titanium: number; helium3: number; darkMatter: number };
  planetCoordinates: [number, number, number];
  isFromOutpost?: boolean;
  outpostOrigin?: [number, number, number];
  outpostType?: number;
  currentFleets?: number;
  maxFleets?: number;
  computerTechLevel?: number;
}

// Ship type configuration - all dispatchable ships (exclude crawler which has speed=0)
const SHIP_TYPES = Object.entries(SHIP_CONFIG)
  .filter(([, config]) => config.speed > 0) // Filter out crawler (speed=0)
  .map(([key]) => {
    const shipKey = key as keyof Ships;
    return {
      key: shipKey,
      index: SHIP_TYPE_MAP[key],
      name: SHIP_NAMES[shipKey],
      icon: SHIP_ICON_MAP[shipKey].icon,
      color: SHIP_ICON_MAP[shipKey].color,
    };
  });

// Mission configuration
const MISSIONS: Record<number, { label: string; icon: typeof Swords; color: string; description: string }> = {
  [FLEET_MISSION.RAID]: {
    label: 'Raid',
    icon: Swords,
    color: 'var(--accent-danger)',
    description: 'Attack and steal resources. Fleet returns home with plunder.',
  },
  [FLEET_MISSION.CAPTURE]: {
    label: 'Capture',
    icon: Flag,
    color: 'var(--accent-warn)',
    description: 'Capture this outpost. Ships will garrison there.',
  },
  [FLEET_MISSION.MOVE]: {
    label: 'Move',
    icon: Package,
    color: 'var(--accent-secondary)',
    description: 'Transfer ships and cargo. Ships stay at destination.',
  },
  [FLEET_MISSION.COLONIZE]: {
    label: 'Colonize',
    icon: Globe,
    color: 'var(--accent-primary)',
    description: 'Establish a new colony. Requires 1 Colony Ship. Remaining ships and cargo stay at new planet.',
  },
};

// Resource icons
const RESOURCE_CONFIG = [
  { key: 'titanium' as const, name: 'Titanium', icon: CircleDot, color: '#d97706' },
  { key: 'helium3' as const, name: 'Helium-3', icon: Sparkles, color: '#3b82f6' },
  { key: 'darkMatter' as const, name: 'Dark Matter', icon: Gem, color: '#8b5cf6' },
];

export function QuickFleetModal({
  isOpen,
  onClose,
  mission,
  destination,
  destinationName,
  planetId,
  ships,
  currentResources,
  planetCoordinates,
  isFromOutpost = false,
  outpostOrigin,
  outpostType,
  currentFleets = 0,
  maxFleets = 0,
  computerTechLevel = 0,
}: QuickFleetModalProps) {

  // Fetch player's outposts for origin selector (MOVE missions)
  const { data: playerOutpostsRaw } = usePlayerOutposts();
  const playerOutposts = playerOutpostsRaw as readonly (readonly [number, number, number])[] | undefined;

  // Build list of owned locations (planet + outposts), excluding the destination
  const ownedLocations = useMemo(() => {
    const locations: { label: string; coords: [number, number, number]; isOutpost: boolean }[] = [];

    // Add player's home planet
    locations.push({
      label: `Planet [${planetCoordinates[0]}:${planetCoordinates[1]}:${planetCoordinates[2]}]`,
      coords: planetCoordinates,
      isOutpost: false,
    });

    // Add player's outposts
    if (playerOutposts) {
      for (const outpost of playerOutposts) {
        const [g, s, p] = [Number(outpost[0]), Number(outpost[1]), Number(outpost[2])];
        const outpostType = p <= 12 ? 1 : p <= 14 ? 2 : 3;
        const typeName = OUTPOST_TYPE_NAMES[outpostType] || 'Outpost';
        locations.push({
          label: `${typeName} [${g}:${s}:${p}]`,
          coords: [g, s, p],
          isOutpost: true,
        });
      }
    }

    // Filter out the destination so you can't send from the same location
    return locations.filter(loc =>
      !(loc.coords[0] === destination[0] && loc.coords[1] === destination[1] && loc.coords[2] === destination[2])
    );
  }, [planetCoordinates, playerOutposts, destination]);

  // Origin selector state (index into ownedLocations)
  const [originIndex, setOriginIndex] = useState(0);

  // Guard against stale originIndex
  const safeOriginIndex = originIndex < ownedLocations.length ? originIndex : 0;
  const selectedOrigin = ownedLocations[safeOriginIndex];
  const isMoveFromOutpost = mission === FLEET_MISSION.MOVE && !isFromOutpost && selectedOrigin?.isOutpost;
  const moveOutpostCoords: [number, number, number] | null = isMoveFromOutpost && selectedOrigin ? selectedOrigin.coords : null;

  // Fetch stationed ships at selected outpost origin (for MOVE from outpost)
  const { data: stationedShipsData } = useStationedShips(
    moveOutpostCoords?.[0] ?? 0,
    moveOutpostCoords?.[1] ?? 0,
    moveOutpostCoords?.[2] ?? 0,
  );

  // Fetch outpost resources when origin is an outpost
  const { data: outpostResourcesData } = useCalculateOutpostResources(
    moveOutpostCoords?.[0] ?? 0,
    moveOutpostCoords?.[1] ?? 0,
    moveOutpostCoords?.[2] ?? 0,
  );

  // Effective ships based on selected origin
  const effectiveShips = useMemo((): Ships => {
    if (!isMoveFromOutpost) return ships;
    if (!stationedShipsData) return {
      smallCargo: 0, largeCargo: 0, lightFighter: 0, heavyFighter: 0,
      cruiser: 0, battleship: 0, battlecruiser: 0, bomber: 0,
      destroyer: 0, colonyShip: 0, recycler: 0, crawler: 0,
    };
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
  }, [isMoveFromOutpost, ships, stationedShipsData]);

  // Effective resources based on selected origin
  const effectiveResources = useMemo(() => {
    if (!isMoveFromOutpost) return currentResources;
    if (!outpostResourcesData || !moveOutpostCoords) return { titanium: 0, helium3: 0, darkMatter: 0 };
    const [resourceAmount, outpostTypeEnum] = outpostResourcesData as [bigint, number];
    const amount = Number(resourceAmount);
    const outpostType = Number(outpostTypeEnum);
    const resourceKey = OUTPOST_RESOURCE_MAP[outpostType];
    return {
      titanium: resourceKey === 'titanium' ? amount : 0,
      helium3: resourceKey === 'helium3' ? amount : 0,
      darkMatter: resourceKey === 'darkMatter' ? amount : 0,
    };
  }, [isMoveFromOutpost, currentResources, outpostResourcesData, moveOutpostCoords]);

  // Ship selection state - initialize all ship types to 0
  const [selectedShips, setSelectedShips] = useState<Record<keyof Ships, number>>({
    smallCargo: 0,
    largeCargo: 0,
    lightFighter: 0,
    heavyFighter: 0,
    cruiser: 0,
    battleship: 0,
    battlecruiser: 0,
    bomber: 0,
    destroyer: 0,
    colonyShip: 0,
    recycler: 0,
    crawler: 0,
  });

  // Cargo (only for MOVE mission)
  const [cargoTitanium, setCargoTitanium] = useState(0);
  const [cargoHelium3, setCargoHelium3] = useState(0);
  const [cargoDarkMatter, setCargoDarkMatter] = useState(0);

  // Dispatch hooks - use appropriate one based on mode
  const dispatchFromPlanet = useDispatchFleet();
  const dispatchFromOutpost = useDispatchFleetFromOutpost();

  // Select the active hook based on mode
  const useOutpostHook = isFromOutpost || isMoveFromOutpost;
  const {
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  } = useOutpostHook ? dispatchFromOutpost : dispatchFromPlanet;

  // Reset form when modal opens/closes or mission changes
  useEffect(() => {
    if (isOpen) {
      setSelectedShips({
        smallCargo: 0,
        largeCargo: 0,
        lightFighter: 0,
        heavyFighter: 0,
        cruiser: 0,
        battleship: 0,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        colonyShip: 0,
        recycler: 0,
        crawler: 0,
      });
      setCargoTitanium(0);
      setCargoHelium3(0);
      setCargoDarkMatter(0);
      setOriginIndex(0);
      reset();
    }
  }, [isOpen, mission, reset]);

  // Close modal on success
  useEffect(() => {
    if (!isSuccess) return;

    const timer = setTimeout(() => {
      onClose();
      reset();
    }, 1500);
    return () => clearTimeout(timer);
  }, [isSuccess, onClose, reset]);

  // Calculate total ships selected
  const totalShipsSelected = useMemo(() => {
    return Object.values(selectedShips).reduce((sum, count) => sum + count, 0);
  }, [selectedShips]);

  // Calculate cargo capacity across all ship types
  const totalCargoCapacity = useMemo(() => {
    return Object.entries(selectedShips).reduce((total, [shipKey, count]) => {
      const config = SHIP_CONFIG[shipKey as keyof Ships];
      if (config) {
        return total + (count * config.cargoCapacity);
      }
      return total;
    }, 0);
  }, [selectedShips]);

  // Calculate fuel cost
  const fuelCost = useMemo(() => {
    if (totalShipsSelected === 0 || isFromOutpost) return 0;

    const origin: [number, number, number] = isMoveFromOutpost && moveOutpostCoords
      ? moveOutpostCoords
      : planetCoordinates;

    if (origin[0] === destination[0] && origin[1] === destination[1] && origin[2] === destination[2]) return 0;

    const baseDistance = calculateDistance(origin, destination);
    const effectiveDistance = (mission === FLEET_MISSION.RAID || mission === FLEET_MISSION.CAPTURE)
      ? baseDistance * 2
      : baseDistance;

    return calculateFleetFuelConsumption(selectedShips, effectiveDistance);
  }, [totalShipsSelected, isFromOutpost, isMoveFromOutpost, moveOutpostCoords, planetCoordinates, destination, mission, selectedShips]);

  const hasEnoughFuel = effectiveResources.helium3 >= fuelCost;

  const totalCargoLoaded = cargoTitanium + cargoHelium3 + cargoDarkMatter;
  const cargoPercentage = totalCargoCapacity > 0 ? (totalCargoLoaded / totalCargoCapacity) * 100 : 0;

  // Validation
  const validation = useMemo(() => {
    const errors: string[] = [];

    // Fleet limit check (enforced by contract for both planet and outpost dispatches)
    if (computerTechLevel === 0) {
      errors.push('Computer Technology level 0: Cannot dispatch fleets. Research Computer Tech first.');
    } else if (currentFleets >= maxFleets) {
      errors.push(`Fleet limit reached (${currentFleets}/${maxFleets}). Research Computer Tech to increase limit.`);
    }

    if (totalShipsSelected === 0) {
      errors.push('Select at least one ship');
    }

    for (const shipType of SHIP_TYPES) {
      const selected = selectedShips[shipType.key] || 0;
      const available = effectiveShips[shipType.key] || 0;
      if (selected > available) {
        errors.push(`Not enough ${shipType.name}s (have ${available})`);
      }
    }

    if (mission === FLEET_MISSION.MOVE || mission === FLEET_MISSION.COLONIZE) {
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
      errors.push(`Insufficient Helium-3 for fuel (need ${formatNumber(fuelCost)})`);
    }

    return { isValid: errors.length === 0, errors };
  }, [
    isFromOutpost,
    computerTechLevel,
    currentFleets,
    maxFleets,
    totalShipsSelected,
    selectedShips,
    effectiveShips,
    mission,
    totalCargoLoaded,
    totalCargoCapacity,
    cargoTitanium,
    cargoHelium3,
    cargoDarkMatter,
    effectiveResources,
    fuelCost,
  ]);

  // Ship selection handlers
  const incrementShip = useCallback((key: keyof Ships) => {
    setSelectedShips((prev) => ({
      ...prev,
      [key]: Math.min((prev[key] || 0) + 1, effectiveShips[key] || 0),
    }));
  }, [effectiveShips]);

  const decrementShip = useCallback((key: keyof Ships) => {
    setSelectedShips((prev) => ({
      ...prev,
      [key]: Math.max((prev[key] || 0) - 1, 0),
    }));
  }, []);

  const setMaxShips = useCallback((key: keyof Ships) => {
    setSelectedShips((prev) => ({
      ...prev,
      [key]: effectiveShips[key] || 0,
    }));
  }, [effectiveShips]);

  const setMaxCargo = useCallback((resourceKey: 'titanium' | 'helium3' | 'darkMatter') => {
    const available = effectiveResources[resourceKey] || 0;
    const currentCargo = resourceKey === 'titanium' ? cargoTitanium :
                         resourceKey === 'helium3' ? cargoHelium3 : cargoDarkMatter;
    const remainingCapacity = totalCargoCapacity - totalCargoLoaded + currentCargo;
    const maxAmount = Math.min(available, remainingCapacity);

    if (resourceKey === 'titanium') setCargoTitanium(maxAmount);
    else if (resourceKey === 'helium3') setCargoHelium3(maxAmount);
    else setCargoDarkMatter(maxAmount);
  }, [effectiveResources, totalCargoCapacity, totalCargoLoaded, cargoTitanium, cargoHelium3, cargoDarkMatter]);

  // Dispatch handler
  const handleDispatch = useCallback(() => {
    if (!validation.isValid) return;

    // Create ships array with MAX_SHIP_TYPES entries, populate all ship types
    const shipsArray: bigint[] = new Array(MAX_SHIP_TYPES).fill(BigInt(0)) as bigint[];
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
    shipsArray[SHIP_TYPE_INDEX.CRAWLER] = BigInt(selectedShips.crawler ?? 0);

    if (isFromOutpost && outpostOrigin) {
      // Withdraw mode: Dispatch FROM outpost TO planet
      dispatchFromOutpost.dispatchFleetFromOutpost(
        outpostOrigin,
        shipsArray,
        destination,
        BigInt(cargoTitanium),
        BigInt(cargoHelium3),
        BigInt(cargoDarkMatter),
      );
    } else if (isMoveFromOutpost && moveOutpostCoords) {
      // MOVE from outpost origin (selected via dropdown)
      dispatchFromOutpost.dispatchFleetFromOutpost(
        moveOutpostCoords,
        shipsArray,
        destination,
        BigInt(cargoTitanium),
        BigInt(cargoHelium3),
        BigInt(cargoDarkMatter),
      );
    } else {
      // Dispatch FROM planet (existing behavior)
      dispatchFromPlanet.dispatchFleet(
        planetId,
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
    outpostOrigin,
    isMoveFromOutpost,
    moveOutpostCoords,
    destination,
    mission,
    cargoTitanium,
    cargoHelium3,
    cargoDarkMatter,
    dispatchFromOutpost,
    dispatchFromPlanet,
    planetId,
  ]);

  if (!isOpen) return null;

  const missionConfig = MISSIONS[mission];
  const isDisabled = !validation.isValid || isPending || isConfirming;
  // Check if any dispatchable ships are available (exclude crawler)
  const hasShips = Object.entries(effectiveShips).some(([key, count]) => {
    const config = SHIP_CONFIG[key as keyof Ships];
    return config && config.speed > 0 && count > 0;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader
          title={isFromOutpost ? 'Withdraw from Outpost' : (missionConfig?.label || 'Fleet Action')}
          subtitle={isFromOutpost ? 'Transfer ships and cargo back to your planet.' : missionConfig?.description}
          action={
            <Button variant="ghost" size="sm" onClick={onClose} className="w-8 h-8 p-0">
              <X className="w-4 h-4" />
            </Button>
          }
        />

        <CardContent className="space-y-5">
          {/* Target Info */}
          <div className="p-3 bg-[var(--bg-tertiary)] rounded-sm">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
              {isFromOutpost ? 'Destination' : 'Target'}
            </p>
            <div className="flex items-center justify-between">
              <span className="font-display text-[var(--text-primary)]">
                {destinationName || 'Unknown'}
              </span>
              <span className="font-mono text-[var(--accent-secondary)]">
                [{destination[0]}:{destination[1]}:{destination[2]}]
              </span>
            </div>
          </div>

          {/* Origin Info */}
          {mission === FLEET_MISSION.MOVE && !isFromOutpost && ownedLocations.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">From:</p>
              <select
                value={safeOriginIndex}
                onChange={(e) => {
                  setOriginIndex(Number(e.target.value));
                  // Reset ship selection when origin changes
                  setSelectedShips({
                    smallCargo: 0, largeCargo: 0, lightFighter: 0, heavyFighter: 0,
                    cruiser: 0, battleship: 0, battlecruiser: 0, bomber: 0,
                    destroyer: 0, colonyShip: 0, recycler: 0, crawler: 0,
                  });
                  setCargoTitanium(0);
                  setCargoHelium3(0);
                  setCargoDarkMatter(0);
                }}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--bg-tertiary)] rounded px-3 py-2 font-mono text-sm text-[var(--accent-primary)] focus:outline-none focus:border-[var(--accent-primary)] appearance-none cursor-pointer"
              >
                {ownedLocations.map((loc, idx) => (
                  <option key={idx} value={idx}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={`text-xs ${isFromOutpost ? 'p-3 bg-[var(--accent-secondary)]/10 rounded-sm' : ''} text-[var(--text-muted)]`}>
              <span className="uppercase tracking-wider">From: </span>
              <span className={`font-mono ${isFromOutpost ? 'text-[var(--accent-secondary)]' : ''}`}>
                [{isFromOutpost && outpostOrigin ? `${outpostOrigin[0]}:${outpostOrigin[1]}:${outpostOrigin[2]}` : `${planetCoordinates[0]}:${planetCoordinates[1]}:${planetCoordinates[2]}`}]
              </span>
              {isFromOutpost && (
                <span className="ml-2 text-[var(--accent-secondary)]">(Your Outpost)</span>
              )}
            </div>
          )}

          {/* Ship Selection */}
          {hasShips ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">Select ships:</p>
              {SHIP_TYPES.map((shipType) => {
                const available = effectiveShips[shipType.key] || 0;
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
                        className="w-8 h-8 rounded-sm flex items-center justify-center"
                        style={{ backgroundColor: `${shipType.color}15` }}
                      >
                        <ShipIcon className="w-4 h-4" style={{ color: shipType.color }} />
                      </div>
                      <div>
                        <span className="font-display text-sm text-[var(--text-primary)]">{shipType.name}</span>
                        <span className="text-[var(--text-muted)] text-xs ml-2">({available})</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => decrementShip(shipType.key)}
                        disabled={selected <= 0}
                        className="w-7 h-7 p-0"
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="font-mono w-8 text-center text-sm text-[var(--text-primary)]">{selected}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => incrementShip(shipType.key)}
                        disabled={selected >= available}
                        className="w-7 h-7 p-0"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMaxShips(shipType.key)}
                        disabled={selected >= available}
                        className="text-xs"
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 bg-[var(--bg-tertiary)] rounded-sm text-center">
              <p className="text-[var(--text-muted)]">No ships available</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Build ships in the Shipyard first.</p>
            </div>
          )}

          {/* Cargo Section (MOVE or COLONIZE) */}
          {(mission === FLEET_MISSION.MOVE || mission === FLEET_MISSION.COLONIZE) && hasShips && totalShipsSelected > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--text-muted)]">
                  {isFromOutpost ? 'Withdraw cargo:' : 'Cargo:'}
                </p>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  {formatNumber(totalCargoLoaded)} / {formatNumber(totalCargoCapacity)}
                </span>
              </div>

              <ProgressBar
                progress={cargoPercentage}
                variant={cargoPercentage > 100 ? 'danger' : 'default'}
                size="sm"
              />

              {/* Filter resources based on outpost type when withdrawing */}
              {RESOURCE_CONFIG
                .filter((resource) => {
                  if (!isFromOutpost && !isMoveFromOutpost) return true; // Show all for planet dispatch
                  // For outpost, only show the matching resource type
                  if (isFromOutpost) {
                    const resourceMap: Record<number, string> = { 1: 'titanium', 2: 'helium3', 3: 'darkMatter' };
                    return resourceMap[outpostType || 0] === resource.key;
                  }
                  // For move from outpost origin, show all (outpost resources are already filtered in effectiveResources)
                  return true;
                })
                .map((resource) => {
                const available = effectiveResources[resource.key] || 0;
                const ResourceIcon = resource.icon;
                const cargo = resource.key === 'titanium' ? cargoTitanium :
                              resource.key === 'helium3' ? cargoHelium3 : cargoDarkMatter;
                const setCargo = resource.key === 'titanium' ? setCargoTitanium :
                                 resource.key === 'helium3' ? setCargoHelium3 : setCargoDarkMatter;

                return (
                  <div
                    key={resource.key}
                    className="flex items-center justify-between p-2 bg-[var(--bg-tertiary)] rounded-sm"
                  >
                    <div className="flex items-center gap-2">
                      <ResourceIcon className="w-4 h-4" style={{ color: resource.color }} />
                      <span className="text-sm text-[var(--text-primary)]">{resource.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">({formatNumber(available)})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={Math.min(available, totalCargoCapacity - totalCargoLoaded + cargo)}
                        value={cargo}
                        onChange={(e) => setCargo(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-24 bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded px-2 py-1 text-sm font-mono text-right text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMaxCargo(resource.key)}
                        disabled={cargo >= Math.min(available, totalCargoCapacity - totalCargoLoaded + cargo)}
                        className="text-xs"
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fuel Cost */}
          {!isFromOutpost && totalShipsSelected > 0 && (
            <div className="p-3 bg-[var(--bg-tertiary)] rounded-sm space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Fuel className="w-3.5 h-3.5" style={{ color: 'var(--resource-helium3)' }} />
                  <span className="text-xs text-[var(--text-muted)]">Fuel Cost</span>
                </div>
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" style={{ color: 'var(--resource-helium3)' }} />
                  <span className={cn(
                    'font-mono text-sm',
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
                <p className="text-[10px] text-[var(--accent-warn)]">
                  Round-trip fuel (2x distance)
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
          {validation.errors.length > 0 && totalShipsSelected > 0 && !isSuccess && (
            <div className="p-3 bg-[var(--accent-danger)]/10 border border-[var(--accent-danger)]/30 rounded-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--accent-danger)] mt-0.5" />
                <div className="space-y-1">
                  {validation.errors.map((err, i) => (
                    <p key={i} className="text-sm text-[var(--accent-danger)]">{err}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Transaction Error */}
          {error && (
            <div className={cn(
              'p-3 border rounded-sm',
              isUserRejection(error)
                ? 'bg-[var(--text-muted)]/10 border-[var(--text-muted)]/30'
                : 'bg-[var(--accent-danger)]/10 border-[var(--accent-danger)]/30'
            )}>
              <p className={cn(
                'text-sm',
                isUserRejection(error) ? 'text-[var(--text-muted)]' : 'text-[var(--accent-danger)]'
              )}>
                {isUserRejection(error)
                  ? 'Transaction cancelled. You can try again when ready.'
                  : `Transaction failed: ${error.message?.slice(0, 100)}`}
              </p>
            </div>
          )}

          {/* Success Message */}
          {isSuccess && (
            <div className="p-3 bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 rounded-sm">
              <p className="text-sm text-[var(--accent-primary)]">
                {isFromOutpost ? 'Withdrawal initiated successfully!' : 'Fleet dispatched successfully!'}
              </p>
            </div>
          )}

          {/* Dispatch Button */}
          <Button
            variant="primary"
            size="md"
            onClick={handleDispatch}
            disabled={isDisabled || !hasShips}
            isLoading={isPending || isConfirming}
            className="w-full"
          >
            {isPending ? 'Confirm in Wallet...' :
             isConfirming ? (isFromOutpost ? 'Withdrawing...' : 'Dispatching...') :
             isFromOutpost ? 'Withdraw to Planet' : `Dispatch ${missionConfig?.label || 'Fleet'}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
