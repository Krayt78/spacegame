'use client';

import { GameLayout } from '@/components/layout';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <GameLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[var(--text-muted)]/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-[var(--text-muted)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Settings
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Configure your game preferences
            </p>
          </div>
        </div>

        <Card>
          <CardHeader title="Preferences" subtitle="Customize your experience" />
          <CardContent>
            <p className="text-[var(--text-muted)]">
              Settings interface coming soon...
            </p>
          </CardContent>
        </Card>
      </div>
    </GameLayout>
  );
}
