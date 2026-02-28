'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, ArrowRight, Rocket, Swords, Flag, Package, Globe, Gem, Sparkles, CircleDot } from 'lucide-react';
import { Button, ProgressBar } from '@/components/ui';
import {
  useFleet,
  useResolveFleet,
  useCompleteFleet,
  FLEET_MISSION,
  FLEET_STATUS,
  FLEET_STATUS_NAMES,
  SHIP_TYPE_REVERSE_MAP,
} from '@/hooks/useNexusGame';
import { formatTime, formatNumber, formatCoordinates } from '@/lib/utils';
import { SHIP_NAMES as SHIP_NAME_MAP } from '@/constants/gameConfig';
import type { ShipComposition } from '@/types/game';

interface FleetCardProps {
  fleetId: bigint;
  blockTimestamp: number;
}

// Mission icon and color config
const MISSION_CONFIG: Record<number, { icon: typeof Swords; color: string; label: string }> = {
  [FLEET_MISSION.RAID]: { icon: Swords, color: 'var(--accent-danger)', label: 'Raid' },
  [FLEET_MISSION.CAPTURE]: { icon: Flag, color: 'var(--accent-warn)', label: 'Capture' },
  [FLEET_MISSION.MOVE]: { icon: Package, color: 'var(--accent-secondary)', label: 'Move' },
  [FLEET_MISSION.COLONIZE]: { icon: Globe, color: 'var(--accent-primary)', label: 'Colonize' },
};

// Default mission config fallback
const DEFAULT_MISSION_CONFIG = { icon: Rocket, color: 'var(--text-muted)', label: 'Unknown' };

// Ship names mapping - dynamically built from constants
const FLEET_SHIP_NAMES: Record<number, string> = {};
for (const [indexStr, key] of Object.entries(SHIP_TYPE_REVERSE_MAP)) {
  FLEET_SHIP_NAMES[Number(indexStr)] = SHIP_NAME_MAP[key as keyof ShipComposition];
}

// Fleet data type from contract
interface FleetData {
  fleetId: bigint;
  owner: string;
  originPlanetId: bigint;
  origin: readonly [bigint, bigint, bigint];
  destination: readonly [bigint, bigint, bigint];
  mission: bigint;
  status: bigint;
  departureTime: bigint;
  arrivalTime: bigint;
  returnTime: bigint;
  ships: readonly bigint[];
  cargoTitanium: bigint;
  cargoHelium3: bigint;
  cargoDarkMatter: bigint;
}

export function FleetCard({ fleetId, blockTimestamp }: FleetCardProps) {
  const { data: rawFleetData, isLoading } = useFleet(fleetId);
  const fleetData = rawFleetData as FleetData | undefined;

  const {
    resolveFleet,
    isPending: isResolvePending,
    isConfirming: isResolveConfirming,
  } = useResolveFleet();

  const {
    completeFleet,
    isPending: isCompletePending,
    isConfirming: isCompleteConfirming,
  } = useCompleteFleet();

  // Parse fleet data
  const fleet = useMemo(() => {
    if (!fleetData) return null;
    return {
      fleetId: Number(fleetData.fleetId),
      owner: fleetData.owner,
      originPlanetId: Number(fleetData.originPlanetId),
      origin: [Number(fleetData.origin[0]), Number(fleetData.origin[1]), Number(fleetData.origin[2])] as [number, number, number],
      destination: [Number(fleetData.destination[0]), Number(fleetData.destination[1]), Number(fleetData.destination[2])] as [number, number, number],
      mission: Number(fleetData.mission),
      status: Number(fleetData.status),
      departureTime: Number(fleetData.departureTime),
      arrivalTime: Number(fleetData.arrivalTime),
      returnTime: Number(fleetData.returnTime),
      ships: fleetData.ships,
      cargoTitanium: Number(fleetData.cargoTitanium),
      cargoHelium3: Number(fleetData.cargoHelium3),
      cargoDarkMatter: Number(fleetData.cargoDarkMatter),
    };
  }, [fleetData]);

  // Calculate target time based on status
  const targetTime = useMemo(() => {
    if (!fleet) return 0;
    if (fleet.status === FLEET_STATUS.TRAVELING) {
      return fleet.arrivalTime;
    }
    if (fleet.status === FLEET_STATUS.RETURNING) {
      return fleet.returnTime;
    }
    return 0;
  }, [fleet]);

  // Calculate total duration for progress bar
  const totalDuration = useMemo(() => {
    if (!fleet) return 0;
    if (fleet.status === FLEET_STATUS.TRAVELING) {
      return fleet.arrivalTime - fleet.departureTime;
    }
    if (fleet.status === FLEET_STATUS.RETURNING) {
      return fleet.returnTime - fleet.arrivalTime;
    }
    return 0;
  }, [fleet]);

  // Calculate initial time remaining based on block timestamp
  const initialTimeRemaining = useMemo(() => {
    return Math.max(0, targetTime - blockTimestamp);
  }, [targetTime, blockTimestamp]);

  // Local countdown state
  const [timeRemaining, setTimeRemaining] = useState(initialTimeRemaining);

  // Sync with blockchain timestamp changes
  useEffect(() => {
    setTimeRemaining(initialTimeRemaining);
  }, [initialTimeRemaining]);

  // Tick down every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate progress
  const progress = totalDuration > 0
    ? Math.min(100, Math.max(0, ((totalDuration - timeRemaining) / totalDuration) * 100))
    : 0;

  // Status checks
  const isTraveling = fleet?.status === FLEET_STATUS.TRAVELING;
  const isReturning = fleet?.status === FLEET_STATUS.RETURNING;
  const hasArrived = timeRemaining === 0;

  // Build ship summary
  const shipSummary = useMemo(() => {
    if (!fleet) return 'No ships';
    const parts: string[] = [];
    for (let i = 1; i < 18; i++) {
      const count = Number(fleet.ships[i]);
      if (count > 0) {
        parts.push(`${count}x ${FLEET_SHIP_NAMES[i] || `Type ${i}`}`);
      }
    }
    return parts.join(', ') || 'No ships';
  }, [fleet]);

  // Check if has cargo
  const hasCargo = fleet && (fleet.cargoTitanium > 0 || fleet.cargoHelium3 > 0 || fleet.cargoDarkMatter > 0);

  // Action handlers
  const handleResolve = useCallback(() => {
    resolveFleet(fleetId);
  }, [resolveFleet, fleetId]);

  const handleComplete = useCallback(() => {
    completeFleet(fleetId);
  }, [completeFleet, fleetId]);

  if (isLoading || !fleet) {
    return (
      <div className="p-4 bg-[var(--bg-tertiary)] rounded-sm animate-pulse">
        <div className="h-4 bg-[var(--bg-secondary)] rounded w-1/3 mb-2"></div>
        <div className="h-3 bg-[var(--bg-secondary)] rounded w-1/2"></div>
      </div>
    );
  }

  const missionConfig = MISSION_CONFIG[fleet.mission] || DEFAULT_MISSION_CONFIG;
  const MissionIcon = missionConfig.icon;

  return (
    <div className="p-4 bg-[var(--bg-tertiary)] rounded-sm space-y-3">
      {/* Header: Mission type and status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-sm flex items-center justify-center"
            style={{ backgroundColor: `${missionConfig.color}15` }}
          >
            <MissionIcon className="w-4 h-4" style={{ color: missionConfig.color }} />
          </div>
          <div>
            <span className="font-display font-semibold text-[var(--text-primary)]" style={{ color: missionConfig.color }}>
              {missionConfig.label}
            </span>
            <span className="text-[var(--text-muted)] text-sm ml-2">Fleet #{fleet.fleetId}</span>
          </div>
        </div>
        <span
          className="text-xs px-2 py-1 rounded-sm"
          style={{
            backgroundColor: isReturning ? 'var(--accent-primary)15' : 'var(--accent-warn)15',
            color: isReturning ? 'var(--accent-primary)' : 'var(--accent-warn)',
          }}
        >
          {FLEET_STATUS_NAMES[fleet.status]}
        </span>
      </div>

      {/* Origin → Destination */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-[var(--text-secondary)]">
          {formatCoordinates(fleet.origin)}
        </span>
        <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
        <span className="font-mono text-[var(--text-secondary)]">
          {formatCoordinates(fleet.destination)}
        </span>
      </div>

      {/* Ships */}
      <div className="flex items-center gap-2 text-sm">
        <Rocket className="w-4 h-4 text-[var(--text-muted)]" />
        <span className="text-[var(--text-secondary)]">{shipSummary}</span>
      </div>

      {/* Cargo (if any) */}
      {hasCargo && (
        <div className="flex gap-3 text-sm">
          {fleet.cargoTitanium > 0 && (
            <div className="flex items-center gap-1">
              <Gem className="w-3.5 h-3.5" style={{ color: 'var(--resource-titanium)' }} />
              <span className="font-mono text-[var(--text-secondary)]">{formatNumber(fleet.cargoTitanium)}</span>
            </div>
          )}
          {fleet.cargoHelium3 > 0 && (
            <div className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--resource-helium3)' }} />
              <span className="font-mono text-[var(--text-secondary)]">{formatNumber(fleet.cargoHelium3)}</span>
            </div>
          )}
          {fleet.cargoDarkMatter > 0 && (
            <div className="flex items-center gap-1">
              <CircleDot className="w-3.5 h-3.5" style={{ color: 'var(--resource-darkMatter)' }} />
              <span className="font-mono text-[var(--text-secondary)]">{formatNumber(fleet.cargoDarkMatter)}</span>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1">
        <ProgressBar
          progress={progress}
          variant={isReturning ? 'success' : 'warning'}
          size="sm"
          animated={!hasArrived}
        />
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-muted)]">
            {hasArrived ? (isReturning ? 'Arrived home' : 'Arrived at destination') : 'In transit'}
          </span>
          <div className="flex items-center gap-1 text-[var(--text-muted)]">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono">{formatTime(timeRemaining)}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {/* Resolve button - when fleet has arrived at destination and is TRAVELING */}
        {isTraveling && hasArrived && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleResolve}
            disabled={isResolvePending || isResolveConfirming}
            isLoading={isResolvePending || isResolveConfirming}
          >
            Resolve Fleet
          </Button>
        )}

        {/* Complete button - when fleet has returned home and is RETURNING */}
        {isReturning && hasArrived && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleComplete}
            disabled={isCompletePending || isCompleteConfirming}
            isLoading={isCompletePending || isCompleteConfirming}
          >
            Complete Fleet
          </Button>
        )}
      </div>
    </div>
  );
}

export default FleetCard;
