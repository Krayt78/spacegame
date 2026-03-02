'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { Card, CardHeader, CardContent, Button, ProgressBar } from '@/components/ui';
import {
  useCompleteResearch,
  useCancelResearch,
  RESEARCH_TYPE_REVERSE_MAP,
} from '@/hooks/useNexusGame';
import { RESEARCH_NAMES } from '@/constants/gameConfig';
import { formatTime } from '@/lib/utils';
import type { Research } from '@/types/game';

interface ResearchQueueProps {
  planetId: bigint;
  queue: { researchType: number; targetLevel: number; completionTime: number };
  initialTimeRemaining: number;
  totalDuration: number;
}

export function ResearchQueue({ planetId, queue, initialTimeRemaining, totalDuration }: ResearchQueueProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTimeRemaining);

  const {
    completeResearch,
    isPending: isCompletePending,
    isConfirming: isCompleteConfirming,
    isSuccess: isCompleteSuccess,
    reset: resetComplete,
  } = useCompleteResearch();

  const {
    cancelResearch,
    isPending: isCancelPending,
    isConfirming: isCancelConfirming,
  } = useCancelResearch();

  useEffect(() => {
    setTimeRemaining(initialTimeRemaining);
  }, [initialTimeRemaining]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = totalDuration > 0
    ? Math.max(0, Math.min(100, ((totalDuration - timeRemaining) / totalDuration) * 100))
    : 0;

  useEffect(() => {
    if (!isCompleteSuccess) return;
    const timer = setTimeout(() => resetComplete(), 2000);
    return () => clearTimeout(timer);
  }, [isCompleteSuccess, resetComplete]);

  const canComplete = timeRemaining === 0;
  const researchKey = RESEARCH_TYPE_REVERSE_MAP[queue.researchType];
  const researchName = researchKey ? RESEARCH_NAMES[researchKey as keyof Research] : 'Research';

  return (
    <Card className="border-[var(--accent-warn)]/30">
      <CardHeader title="Research Queue" subtitle="1 research in progress" />
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 p-3 bg-[var(--bg-tertiary)] rounded-sm">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-[var(--text-primary)]">
                {researchName}
              </span>
              <span className="text-sm text-[var(--accent-warn)]">
                Level {queue.targetLevel}
              </span>
            </div>
            <ProgressBar progress={progress} variant="warning" size="sm" animated />
          </div>
          <div className="flex items-center gap-1 text-sm text-[var(--text-muted)] min-w-[80px]">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{formatTime(timeRemaining)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {canComplete && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => completeResearch()}
              disabled={isCompletePending || isCompleteConfirming}
              isLoading={isCompletePending || isCompleteConfirming}
            >
              Complete Research
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancelResearch(planetId)}
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

export default ResearchQueue;
