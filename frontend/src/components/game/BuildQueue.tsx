'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { Card, CardHeader, CardContent, Button, ProgressBar } from '@/components/ui';
import {
  useCompleteUpgrade,
  useCancelUpgrade,
  BUILDING_TYPE_REVERSE_MAP,
  type BuildQueue as BuildQueueType,
} from '@/hooks/useNexusGame';
import { formatTime } from '@/lib/utils';

interface BuildQueueProps {
  planetId: bigint;
  queue: BuildQueueType;
  initialTimeRemaining: number;
  totalDuration: number;
}

export function BuildQueue({ planetId, queue, initialTimeRemaining, totalDuration }: BuildQueueProps) {
  // Progress tracking state
  const [upgradeTimeRemaining, setUpgradeTimeRemaining] = useState(initialTimeRemaining);

  // Upgrade hooks
  const {
    completeUpgrade,
    isPending: isCompletePending,
    isConfirming: isCompleteConfirming,
    isSuccess: isCompleteSuccess,
    reset: resetComplete,
  } = useCompleteUpgrade();

  const {
    cancelUpgrade,
    isPending: isCancelPending,
    isConfirming: isCancelConfirming,
  } = useCancelUpgrade();

  // Reset time remaining when initialTimeRemaining changes
  useEffect(() => {
    setUpgradeTimeRemaining(initialTimeRemaining);
  }, [initialTimeRemaining]);

  // Countdown timer - ticks down every second
  useEffect(() => {
    const interval = setInterval(() => {
      setUpgradeTimeRemaining((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate progress based on total duration
  const upgradeProgress = totalDuration > 0
    ? Math.max(0, Math.min(100, ((totalDuration - upgradeTimeRemaining) / totalDuration) * 100))
    : 0;

  // Reset complete state after success
  useEffect(() => {
    if (!isCompleteSuccess) return;
    const timer = setTimeout(() => resetComplete(), 2000);
    return () => clearTimeout(timer);
  }, [isCompleteSuccess, resetComplete]);

  // Button handlers
  const handleCompleteUpgrade = useCallback(() => {
    completeUpgrade(planetId);
  }, [completeUpgrade, planetId]);

  const handleCancelUpgrade = useCallback(() => {
    cancelUpgrade(planetId);
  }, [cancelUpgrade, planetId]);

  const canCompleteUpgrade = upgradeTimeRemaining === 0;

  return (
    <Card className="border-[var(--accent-warn)]/30">
      <CardHeader
        title="Build Queue"
        subtitle="1 building in progress"
      />
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 p-3 bg-[var(--bg-tertiary)] rounded-sm">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-[var(--text-primary)]">
                {BUILDING_TYPE_REVERSE_MAP[Number(queue.buildingType)] || 'Building'}
              </span>
              <span className="text-sm text-[var(--accent-warn)]">
                Level {Number(queue.targetLevel)}
              </span>
            </div>
            <ProgressBar
              progress={upgradeProgress}
              variant="warning"
              size="sm"
              animated
            />
          </div>
          <div className="flex items-center gap-1 text-sm text-[var(--text-muted)] min-w-[80px]">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{formatTime(upgradeTimeRemaining)}</span>
          </div>
        </div>

        {/* Complete/Cancel buttons */}
        <div className="flex gap-2">
          {canCompleteUpgrade && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleCompleteUpgrade}
              disabled={isCompletePending || isCompleteConfirming}
              isLoading={isCompletePending || isCompleteConfirming}
            >
              Complete Upgrade
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelUpgrade}
            disabled={isCancelPending || isCancelConfirming}
            isLoading={isCancelPending || isCancelConfirming}
          >
            Cancel (50% refund)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default BuildQueue;
