import { create } from 'zustand';
import type { Planet, BuildQueue, Buildings } from '@/types/game';
import { STARTING_BUILDINGS } from '@/constants/gameConfig';
import { calculateUpgradeCost, canAffordUpgrade, calculateBuildTime } from '@/lib/utils';

interface PlanetState {
  currentPlanet: Planet | null;
  buildQueue: BuildQueue[];
  setPlanet: (planet: Planet) => void;
  updateResources: (resources: Partial<Planet['resources']>) => void;
  addToBuildQueue: (item: BuildQueue) => void;
  removeFromBuildQueue: (buildingType: keyof Buildings) => void;
  tickResources: () => void;
  processBuildQueue: () => void;
  startUpgrade: (buildingKey: keyof Buildings) => boolean;
}

// Mock planet for development with more resources for testing
const mockPlanet: Planet = {
  id: 'planet-1',
  owner: '0x1234...5678',
  name: 'Genesis Node',
  coordinates: [1, 1, 1],
  buildings: {
    ...STARTING_BUILDINGS,
    titaniumExtractor: 3,
    helium3Harvester: 2,
  },
  resources: {
    titanium: 12450,
    helium3: 8920,
    darkMatter: 520,
  },
  production: {
    titanium: 125,
    helium3: 89,
    darkMatter: 0,
  },
  lastUpdated: Date.now(),
};

export const usePlanetStore = create<PlanetState>((set, get) => ({
  currentPlanet: mockPlanet,
  buildQueue: [],

  setPlanet: (planet) => set({ currentPlanet: planet }),

  updateResources: (resources) =>
    set((state) => ({
      currentPlanet: state.currentPlanet
        ? {
            ...state.currentPlanet,
            resources: { ...state.currentPlanet.resources, ...resources },
          }
        : null,
    })),

  addToBuildQueue: (item) =>
    set((state) => ({ buildQueue: [...state.buildQueue, item] })),

  removeFromBuildQueue: (buildingType) =>
    set((state) => ({
      buildQueue: state.buildQueue.filter((item) => item.buildingType !== buildingType),
    })),

  // Simulate resource production (will be replaced with blockchain data)
  tickResources: () =>
    set((state) => {
      if (!state.currentPlanet) return state;

      const now = Date.now();
      const timeDiff = (now - state.currentPlanet.lastUpdated) / 1000 / 3600; // hours

      const newResources = {
        titanium: Math.floor(
          state.currentPlanet.resources.titanium +
            state.currentPlanet.production.titanium * timeDiff
        ),
        helium3: Math.floor(
          state.currentPlanet.resources.helium3 +
            state.currentPlanet.production.helium3 * timeDiff
        ),
        darkMatter: Math.floor(
          state.currentPlanet.resources.darkMatter +
            state.currentPlanet.production.darkMatter * timeDiff
        ),
      };

      return {
        currentPlanet: {
          ...state.currentPlanet,
          resources: newResources,
          lastUpdated: now,
        },
      };
    }),

  // Process build queue - complete buildings that are done
  processBuildQueue: () =>
    set((state) => {
      if (!state.currentPlanet || state.buildQueue.length === 0) return state;

      const now = Date.now();
      const completedBuildings: BuildQueue[] = [];
      const remainingQueue: BuildQueue[] = [];

      state.buildQueue.forEach((item) => {
        if (item.endTime <= now) {
          completedBuildings.push(item);
        } else {
          remainingQueue.push(item);
        }
      });

      if (completedBuildings.length === 0) return state;

      // Update building levels for completed buildings
      const newBuildings = { ...state.currentPlanet.buildings };
      completedBuildings.forEach((item) => {
        newBuildings[item.buildingType] = item.targetLevel;
      });

      return {
        currentPlanet: {
          ...state.currentPlanet,
          buildings: newBuildings,
        },
        buildQueue: remainingQueue,
      };
    }),

  // Start a building upgrade
  startUpgrade: (buildingKey: keyof Buildings) => {
    const state = get();
    if (!state.currentPlanet) return false;

    const currentLevel = state.currentPlanet.buildings[buildingKey];
    const cost = calculateUpgradeCost(buildingKey, currentLevel);

    // Check if already upgrading this building
    if (state.buildQueue.some((item) => item.buildingType === buildingKey)) {
      return false;
    }

    // Check if can afford
    if (!canAffordUpgrade(state.currentPlanet.resources, cost)) {
      return false;
    }

    const buildTime = calculateBuildTime(buildingKey, currentLevel);
    const now = Date.now();

    set({
      currentPlanet: {
        ...state.currentPlanet,
        resources: {
          ...state.currentPlanet.resources,
          titanium: state.currentPlanet.resources.titanium - cost.titanium,
          helium3: state.currentPlanet.resources.helium3 - cost.helium3,
          darkMatter: state.currentPlanet.resources.darkMatter - cost.darkMatter,
        },
      },
      buildQueue: [
        ...state.buildQueue,
        {
          buildingType: buildingKey,
          targetLevel: currentLevel + 1,
          startTime: now,
          endTime: now + buildTime * 1000,
        },
      ],
    });

    return true;
  },
}));
