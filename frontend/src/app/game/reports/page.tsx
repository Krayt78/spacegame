'use client';

import { GameLayout } from '@/components/layout';
import { BattleReportList } from '@/components/game';
import { usePlayerReportCount, usePlayerRecentReports } from '@/hooks/useNexusGame';
import { FileText, Loader2 } from 'lucide-react';

export default function ReportsPage() {
  const { data: reportCount, isLoading: isCountLoading } = usePlayerReportCount();
  const { data: reportIds, isLoading: isReportsLoading } = usePlayerRecentReports(20);

  const isLoading = isCountLoading || isReportsLoading;
  const count = Number(reportCount ?? 0);

  if (isLoading) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">Loading battle reports...</p>
          </div>
        </div>
      </GameLayout>
    );
  }

  return (
    <GameLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[var(--text-secondary)]/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Battle Reports
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {count} report{count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <BattleReportList
          reportIds={reportIds as readonly bigint[] | undefined}
          isLoading={false}
        />
      </div>
    </GameLayout>
  );
}
