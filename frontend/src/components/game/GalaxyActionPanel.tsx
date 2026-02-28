'use client';

import { useMemo } from 'react';
import { Swords, Flag, Package, ArrowLeft, Globe } from 'lucide-react';
import { Button } from '@/components/ui';
import { FLEET_MISSION } from '@/hooks/useNexusGame';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Frontend-only action type for withdrawing from outpost
export const FLEET_ACTION_WITHDRAW = 99;

interface SelectedData {
  owner: string;
  coordinates: [number, number, number];
  name: string;
  exists: boolean;
  isOutpost: boolean;
  outpostType?: number;
  garrison?: readonly bigint[];
  storedResources?: bigint;
}

interface GalaxyActionPanelProps {
  selectedData: SelectedData | null;
  playerAddress: string | undefined;
  onAction: (mission: number, coordinates: [number, number, number]) => void;
  disabled?: boolean;
}

export function GalaxyActionPanel({
  selectedData,
  playerAddress,
  onAction,
  disabled = false,
}: GalaxyActionPanelProps) {
  const actions = useMemo(() => {
    if (!selectedData) return { showCapture: false, showRaid: false, showMove: false, showWithdraw: false, showColonize: false };

    const isOwned = selectedData.exists;
    const isOwnedByPlayer = isOwned &&
      playerAddress &&
      selectedData.owner.toLowerCase() === playerAddress.toLowerCase();
    const isOwnedByEnemy = isOwned && !isOwnedByPlayer;
    const isOutpost = selectedData.isOutpost;
    const isUnclaimed = isOutpost && (!isOwned || selectedData.owner === ZERO_ADDRESS);
    const isEmptyPlanetSlot = !isOutpost && !isOwned;

    // Check if outpost has ships to withdraw
    const hasGarrison = selectedData.garrison?.some(count => Number(count) > 0);

    return {
      showCapture: isUnclaimed || (isOutpost && isOwnedByEnemy),
      showRaid: isOwnedByEnemy,
      showMove: isOwnedByPlayer && !isOutpost, // Only for planets (sending TO outpost from planet page)
      showWithdraw: isOwnedByPlayer && isOutpost && hasGarrison, // Withdraw FROM outpost
      showColonize: isEmptyPlanetSlot,
      isEmptySlot: isEmptyPlanetSlot,
    };
  }, [selectedData, playerAddress]);

  if (!selectedData) return null;

  const { showCapture, showRaid, showMove, showWithdraw, showColonize } = actions;

  // No actions if nothing to show
  if (!showCapture && !showRaid && !showMove && !showWithdraw && !showColonize) return null;

  return (
    <div className="mt-4 pt-4 border-t border-[var(--bg-tertiary)]">
      <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-3">
        Actions
      </p>
      <div className="flex flex-wrap gap-2">
        {showCapture && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Flag className="w-4 h-4" />}
            onClick={() => onAction(FLEET_MISSION.CAPTURE, selectedData.coordinates)}
            disabled={disabled}
          >
            Capture
          </Button>
        )}
        {showRaid && (
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Swords className="w-4 h-4" />}
            onClick={() => onAction(FLEET_MISSION.RAID, selectedData.coordinates)}
            disabled={disabled}
          >
            Raid
          </Button>
        )}
        {showMove && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Package className="w-4 h-4" />}
            onClick={() => onAction(FLEET_MISSION.MOVE, selectedData.coordinates)}
            disabled={disabled}
          >
            Move
          </Button>
        )}
        {showWithdraw && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => onAction(FLEET_ACTION_WITHDRAW, selectedData.coordinates)}
            disabled={disabled}
          >
            Withdraw
          </Button>
        )}
        {showColonize && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Globe className="w-4 h-4" />}
            onClick={() => onAction(FLEET_MISSION.COLONIZE, selectedData.coordinates)}
            disabled={disabled}
          >
            Colonize
          </Button>
        )}
      </div>
    </div>
  );
}
