'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { Card, CardHeader, CardContent, Button, ProgressBar } from '@/components/ui';
import {
  useCompleteDefenseBuild,
  useCancelDefenseBuild,
  DEFENSE_TYPE_REVERSE_MAP,
} from '@/hooks/useNexusGame';
import { DEFENSE_NAMES } from '@/constants/gameConfig';
import { formatTime } from '@/lib/utils';

interface DefenseQueueProps {
  planetId: bigint;
  queue: { defenseType: number; quantity: number; completionTime: number };
  initialTimeRemaining: number;
  totalDuration: number;
}

export function DefenseQueue({ planetId, queue, initialTimeRemaining, totalDuration }: DefenseQueueProps) {
  // Progress tracking state
  const [buildTimeRemaining, setBuildTimeRemaining] = useState(initialTimeRemaining);

  // Defense build hooks
  const {
    completeDefenseBuild,
    isPending: isCompletePending,
    isConfirming: isCompleteConfirming,
    isSuccess: isCompleteSuccess,
    reset: resetComplete,
  } = useCompleteDefenseBuild();

  const {
    cancelDefenseBuild,
    isPending: isCancelPending,
    isConfirming: isCancelConfirming,
  } = useCancelDefenseBuild();

  // Reset time remaining when initialTimeRemaining changes
  useEffect(() => {
    setBuildTimeRemaining(initialTimeRemaining);
  }, [initialTimeRemaining]);

  // Countdown timer - ticks down every second
  useEffect(() => {
    const interval = setInterval(() => {
      setBuildTimeRemaining((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate progress based on total duration
  const buildProgress = totalDuration > 0
    ? Math.max(0, Math.min(100, ((totalDuration - buildTimeRemaining) / totalDuration) * 100))
    : 0;

  // Reset complete state after success
  useEffect(() => {
    if (!isCompleteSuccess) return;
    const timer = setTimeout(() => resetComplete(), 2000);
    return () => clearTimeout(timer);
  }, [isCompleteSuccess, resetComplete]);

  // Button handlers
  const handleCompleteDefenseBuild = useCallback(() => {
    completeDefenseBuild(planetId);
  }, [completeDefenseBuild, planetId]);

  const handleCancelDefenseBuild = useCallback(() => {
    cancelDefenseBuild(planetId);
  }, [cancelDefenseBuild, planetId]);

  const canCompleteDefenseBuild = buildTimeRemaining === 0;

  // Get defense name from reverse map
  const defenseKey = DEFENSE_TYPE_REVERSE_MAP[queue.defenseType];
  const defenseName = defenseKey ? DEFENSE_NAMES[defenseKey as keyof typeof DEFENSE_NAMES] : 'Defense';

  return (
    <Card className="border-[var(--accent-warn)]/30">
      <CardHeader
        title="Build Queue"
        subtitle="Defense construction in progress"
      />
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 p-3 bg-[var(--bg-tertiary)] rounded-sm">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-[var(--text-primary)]">
                {defenseName}
              </span>
              <span className="text-sm text-[var(--accent-warn)]">
                Quantity: {queue.quantity}
              </span>
            </div>
            <ProgressBar
              progress={buildProgress}
              variant="warning"
              size="sm"
              animated
            />
          </div>
          <div className="flex items-center gap-1 text-sm text-[var(--text-muted)] min-w-[80px]">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{formatTime(buildTimeRemaining)}</span>
          </div>
        </div>

        {/* Complete/Cancel buttons */}
        <div className="flex gap-2">
          {canCompleteDefenseBuild && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleCompleteDefenseBuild}
              disabled={isCompletePending || isCompleteConfirming}
              isLoading={isCompletePending || isCompleteConfirming}
            >
              Complete Build
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelDefenseBuild}
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

export default DefenseQueue;
