'use client';

import { createContext, useContext, type ReactNode } from 'react';

import {
  useNexusSession,
  type UseNexusSessionResult,
} from '@/hooks/useNexusSession';
import {
  useNexusSessionHealth,
  type SessionHealth,
} from '@/hooks/useNexusSessionHealth';

/**
 * Shared session + health state.
 *
 * `useNexusSession` holds React state (not just the singleton manager) and
 * `useNexusSessionHealth` runs its own polling loop, so calling them in more
 * than one component both double-polls the chain AND splits the session state
 * (one copy wouldn't see a session started in another). This provider runs
 * each hook exactly once and hands the result to every consumer, keeping a
 * single source of truth and a single 10s poll.
 */
export interface SessionContextValue extends UseNexusSessionResult {
  health: SessionHealth;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useNexusSession();
  const health = useNexusSessionHealth(session.session);

  const value: SessionContextValue = { ...session, health };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSessionContext must be used within a <SessionProvider>');
  }
  return ctx;
}
