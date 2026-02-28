'use client';

import { Card, CardHeader, CardContent } from '@/components/ui';
import { BattleReportCard } from './BattleReportCard';
import { FileText, Loader2 } from 'lucide-react';

interface BattleReportListProps {
  reportIds: readonly bigint[] | undefined;
  isLoading: boolean;
}

export function BattleReportList({ reportIds, isLoading }: BattleReportListProps) {
  const hasReports = reportIds && reportIds.length > 0;

  return (
    <Card>
      <CardHeader
        title="Battle Reports"
        subtitle={`${reportIds?.length ?? 0} report${reportIds?.length !== 1 ? 's' : ''}`}
      />
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">Loading reports...</p>
          </div>
        ) : !hasReports ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
            <p className="text-[var(--text-muted)]">
              No reports yet. Send fleets on raids to generate reports.
            </p>
          </div>
        ) : (
          reportIds.map((id) => (
            <BattleReportCard
              key={id.toString()}
              reportId={id}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default BattleReportList;
