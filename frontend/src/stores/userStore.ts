import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Game-specific user preferences (wallet state is handled by wagmi)
interface UserPreferences {
  playerName: string | null;
  hasClaimedStarterPlanet: boolean;
  selectedPlanetId: string | null;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

interface UserState extends UserPreferences {
  setPlayerName: (name: string) => void;
  setHasClaimedStarterPlanet: (claimed: boolean) => void;
  setSelectedPlanetId: (planetId: string | null) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  resetPreferences: () => void;
}

const defaultPreferences: UserPreferences = {
  playerName: null,
  hasClaimedStarterPlanet: false,
  selectedPlanetId: null,
  soundEnabled: true,
  notificationsEnabled: true,
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      ...defaultPreferences,

      setPlayerName: (name) => set({ playerName: name }),
      setHasClaimedStarterPlanet: (claimed) => set({ hasClaimedStarterPlanet: claimed }),
      setSelectedPlanetId: (planetId) => set({ selectedPlanetId: planetId }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      resetPreferences: () => set(defaultPreferences),
    }),
    {
      name: 'nexus-protocol-user',
      partialize: (state) => ({
        playerName: state.playerName,
        hasClaimedStarterPlanet: state.hasClaimedStarterPlanet,
        selectedPlanetId: state.selectedPlanetId,
        soundEnabled: state.soundEnabled,
        notificationsEnabled: state.notificationsEnabled,
      }),
    }
  )
);
