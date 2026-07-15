'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { isHostMode } from '@/lib/mode';
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

/**
 * Sessions are a HOST-mode feature: a local session key signs game calls
 * directly and NexusGame resolves it to the player through the SessionRegistry,
 * so the host never prompts mid-game and PGAS makes it fee-free. EVM mode has
 * no such concept — the injected wallet signs each tx — so the disabled value
 * below stands in, and the host hooks (which drive a 10s chain poll and depend
 * on `useTriangle`) are never called.
 */
const DISABLED_SESSION: SessionContextValue = {
  status: 'idle',
  session: null,
  isSettingUp: false,
  isEnding: false,
  error: null,
  startSession: async () => {},
  endSession: async () => {},
  health: {
    status: 'none',
    timeLeftMs: 0,
    balance: null,
    registrationOk: null,
    actionsLeft: null,
  },
};

function HostSessionProvider({ children }: { children: ReactNode }) {
  const session = useNexusSession();
  const health = useNexusSessionHealth(session.session);

  const value: SessionContextValue = { ...session, health };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  if (!isHostMode) {
    return (
      <SessionContext.Provider value={DISABLED_SESSION}>
        {children}
      </SessionContext.Provider>
    );
  }
  return <HostSessionProvider>{children}</HostSessionProvider>;
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSessionContext must be used within a <SessionProvider>');
  }
  return ctx;
}
