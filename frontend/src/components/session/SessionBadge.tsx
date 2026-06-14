'use client';

import { useState } from 'react';
import { Zap, ZapOff, Loader2, AlertTriangle } from 'lucide-react';

import { useSessionContext } from '@/contexts/SessionContext';
import { Button } from '@/components/ui';
import { SESSION_FUNDING_AMOUNT } from '@/lib/session/sessionWallet';
import { cn } from '@/lib/utils';

const PAS_DECIMALS = 10n ** 10n;

function formatPas(planck: bigint): string {
  const whole = planck / PAS_DECIMALS;
  const frac = (planck % PAS_DECIMALS) / 10_000_000n; // 3 decimals
  return `${whole}.${frac.toString().padStart(3, '0')}`;
}

function formatTimeLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function SessionBadge() {
  const {
    status,
    session,
    isSettingUp,
    isEnding,
    error,
    startSession,
    endSession,
    health,
  } = useSessionContext();
  const [showConfirm, setShowConfirm] = useState(false);

  // Hide until we know what to show — avoids a "Start session" flash before
  // the manager has finished restoring from sessionStorage.
  if (status === 'idle' && session === null && !error) {
    return (
      <div className="flex items-center">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Zap />}
          onClick={() => setShowConfirm(true)}
          isLoading={isSettingUp}
        >
          Start session
        </Button>
        {showConfirm && (
          <SessionStartConfirm
            onConfirm={async () => {
              setShowConfirm(false);
              await startSession();
            }}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </div>
    );
  }

  if (status === 'setup_pending') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-tertiary)] rounded-sm text-xs font-mono">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-secondary)]" />
        <span className="text-[var(--text-secondary)]">Setting up session…</span>
      </div>
    );
  }

  if (status === 'failed' || error) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono text-[var(--accent-danger)]">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Session failed</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => startSession()}
          isLoading={isSettingUp}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Zap />}
        onClick={() => startSession()}
        isLoading={isSettingUp}
      >
        Session expired — restart
      </Button>
    );
  }

  // status === 'ready'
  const degraded =
    health.status === 'low-balance' ||
    health.status === 'low-time' ||
    health.status === 'delegation-broken';

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-mono',
          degraded
            ? 'bg-[var(--accent-warn)]/10 border border-[var(--accent-warn)]/40 text-[var(--accent-warn)]'
            : 'bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)]',
        )}
        title={
          health.balance !== null
            ? `${formatPas(health.balance)} PAS · ${health.actionsLeft ?? '?'} actions left`
            : undefined
        }
      >
        <Zap className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          Session · {formatTimeLeft(health.timeLeftMs)}
        </span>
        <span className="sm:hidden">{formatTimeLeft(health.timeLeftMs)}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<ZapOff />}
        onClick={() => endSession()}
        isLoading={isEnding}
      >
        End
      </Button>
    </div>
  );
}

function SessionStartConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="max-w-md w-full mx-4 p-6 bg-[var(--bg-secondary)] border border-[var(--bg-tertiary)] rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-bold text-[var(--accent-primary)] mb-3">
          Start gasless session
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
          Approve one transaction now and every game action for the next 2 hours
          will execute without a host prompt.
        </p>
        <div className="text-xs font-mono text-[var(--text-muted)] mb-5 space-y-1">
          <div>
            <span className="text-[var(--text-secondary)]">Funding:</span>{' '}
            {formatPas(SESSION_FUNDING_AMOUNT)} PAS (held in session wallet, spent
            on fees)
          </div>
          <div>
            <span className="text-[var(--text-secondary)]">Proxy deposit:</span> ~1 PAS
            (refunded when you end the session)
          </div>
          <div>
            <span className="text-[var(--text-secondary)]">Duration:</span> 2 hours
            (session keys are cleared when you close the tab)
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" size="md" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={onConfirm}>
            Approve &amp; start
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SessionBadge;
