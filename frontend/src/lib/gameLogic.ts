import type { Buildings, Resources, ResourceProduction, Research, ShipComposition } from '@/types/game';
import { BUILDING_CONFIG, SHIP_CONFIG, RESEARCH_CONFIG, SHIP_DRIVE_MAP, DRIVE_BONUS_PERCENT } from '@/constants/gameConfig';

// Base production values (per hour)
const BASE_PRODUCTION = {
  titanium: 20,
  helium3: 10,
  darkMatter: 0,
};

/**
 * Calculate building cost for a given level
 */
export function getBuildingCost(
  buildingKey: keyof Buildings,
  level: number
): Partial<Resources> {
  const config = BUILDING_CONFIG[buildingKey];
  if (!config) return { titanium: 0, helium3: 0, darkMatter: 0 };

  const factor = Math.pow(config.costMultiplier, level - 1);
  return {
    titanium: Math.floor(config.baseCost.titanium * factor),
    helium3: Math.floor(config.baseCost.helium3 * factor),
    darkMatter: Math.floor(config.baseCost.darkMatter * factor),
  };
}

/**
 * Calculate building construction time in seconds
 */
export function getBuildingTime(
  buildingKey: keyof Buildings,
  level: number,
  shipyardLevel: number
): number {
  const cost = getBuildingCost(buildingKey, level);
  const titaniumCost = cost.titanium ?? 0;
  const helium3Cost = cost.helium3 ?? 0;

  // Base time calculation
  const baseTime = (titaniumCost + helium3Cost) / 2500;

  // Shipyard reduces construction time
  const assemblyReduction = 1 + shipyardLevel * 0.5;

  return Math.max(30, Math.floor((baseTime * 3600) / assemblyReduction));
}

/**
 * Calculate resource production for a planet based on buildings
 */
export function calculateProduction(buildings: Buildings): ResourceProduction {
  const {
    titaniumExtractor,
    helium3Harvester,
    darkMatterCollector,
  } = buildings;

  const titaniumConfig = BUILDING_CONFIG.titaniumExtractor;
  const helium3Config = BUILDING_CONFIG.helium3Harvester;
  const darkMatterConfig = BUILDING_CONFIG.darkMatterCollector;

  // Production formulas
  const titaniumProduction = Math.floor(
    titaniumConfig.baseProduction * titaniumExtractor * Math.pow(titaniumConfig.productionMultiplier, titaniumExtractor)
  );
  const helium3Production = Math.floor(
    helium3Config.baseProduction * helium3Harvester * Math.pow(helium3Config.productionMultiplier, helium3Harvester)
  );
  const darkMatterProduction = Math.floor(
    darkMatterConfig.baseProduction * darkMatterCollector * Math.pow(darkMatterConfig.productionMultiplier, darkMatterCollector)
  );

  return {
    titanium: titaniumProduction + BASE_PRODUCTION.titanium,
    helium3: helium3Production + BASE_PRODUCTION.helium3,
    darkMatter: darkMatterProduction + BASE_PRODUCTION.darkMatter,
  };
}

/**
 * Calculate research cost for a given level
 */
export function getResearchCost(
  researchKey: keyof Research,
  level: number
): Partial<Resources> {
  const config = RESEARCH_CONFIG[researchKey];
  if (!config) return { titanium: 0, helium3: 0, darkMatter: 0 };

  const factor = Math.pow(config.costMultiplier, level - 1);
  return {
    titanium: Math.floor(config.baseCost.titanium * factor),
    helium3: Math.floor(config.baseCost.helium3 * factor),
    darkMatter: Math.floor(config.baseCost.darkMatter * factor),
  };
}

/**
 * Calculate research time in seconds
 */
export function getResearchTime(
  researchKey: keyof Research,
  level: number,
  researchNodeLevel: number
): number {
  const cost = getResearchCost(researchKey, level);
  const titaniumCost = cost.titanium ?? 0;
  const helium3Cost = cost.helium3 ?? 0;

  // Base time calculation based on cost (10x faster: divisor changed from 1000 to 10000)
  const baseTime = (titaniumCost + helium3Cost) / 10000;

  // Research Node reduces research time
  const nodeReduction = 1 + researchNodeLevel * 0.3;

  return Math.max(60, Math.floor((baseTime * 3600) / nodeReduction));
}

/**
 * Calculate ship cost
 */
export function getShipCost(shipKey: keyof ShipComposition): Partial<Resources> {
  const config = SHIP_CONFIG[shipKey];
  if (!config) return { titanium: 0, helium3: 0, darkMatter: 0 };

  return {
    titanium: config.cost.titanium,
    helium3: config.cost.helium3,
    darkMatter: config.cost.darkMatter,
  };
}

/**
 * Calculate ship build time in seconds
 */
export function getShipBuildTime(
  shipKey: keyof ShipComposition,
  shipyardLevel: number
): number {
  const config = SHIP_CONFIG[shipKey as keyof typeof SHIP_CONFIG];
  if (!config) return 0;

  // Shipyard reduces build time
  const assemblyReduction = 1 + shipyardLevel * 0.5;

  // Calculate build time from ship cost (Ti + He3) / 25
  const shipCost = config.cost.titanium + config.cost.helium3;
  const buildTime = shipCost / 25;

  return Math.max(10, Math.floor(buildTime / assemblyReduction));
}

/**
 * Calculate fleet travel time in seconds
 */
export function calculateFleetTravelTime(
  distance: number,
  fleetSpeed: number,
  speedFactor: number = 1000
): number {
  // Simplified travel time calculation
  const baseTime =
    10 + Math.floor((35000 / speedFactor) * Math.sqrt((distance * 10) / fleetSpeed));
  return Math.max(10, baseTime);
}

/**
 * Calculate distance between two coordinates
 */
export function calculateDistance(
  origin: [number, number, number],
  destination: [number, number, number]
): number {
  const [g1, s1, p1] = origin;
  const [g2, s2, p2] = destination;

  if (g1 !== g2) {
    // Different galaxies
    return Math.abs(g2 - g1) * 20000;
  }

  if (s1 !== s2) {
    // Different systems
    return Math.abs(s2 - s1) * 5 * 19 + 2700;
  }

  // Same system, different positions
  return Math.abs(p2 - p1) * 5 + 1000;
}

/**
 * Calculate total fleet fuel (Helium-3) consumption for a given distance.
 * Replicates the contract formula: fuelPerShip = 1 + (baseFuel * distance * 4) / 35000
 * Uses Math.floor to match Solidity's integer division.
 */
export function calculateFleetFuelConsumption(
  selectedShips: Record<string, number>,
  distance: number
): number {
  let totalFuel = 0;

  for (const [shipKey, count] of Object.entries(selectedShips)) {
    if (count > 0) {
      const config = SHIP_CONFIG[shipKey as keyof typeof SHIP_CONFIG];
      if (config && config.fuelConsumption > 0) {
        const fuelPerShip = 1 + Math.floor((config.fuelConsumption * distance * 4) / 35000);
        totalFuel += count * fuelPerShip;
      }
    }
  }

  return totalFuel;
}

/**
 * Calculate total fleet capacity
 */
export function calculateFleetCapacity(ships: ShipComposition): number {
  let capacity = 0;

  Object.entries(ships).forEach(([shipKey, count]) => {
    if (count && count > 0) {
      const config = SHIP_CONFIG[shipKey as keyof typeof SHIP_CONFIG];
      if (config && 'cargoCapacity' in config) {
        capacity += config.cargoCapacity * count;
      }
    }
  });

  return capacity;
}

/**
 * Calculate points from resources spent
 */
export function calculatePoints(resources: Resources): number {
  const { titanium, helium3, darkMatter } = resources;
  return Math.floor((titanium + helium3 + darkMatter * 3) / 1000);
}

/**
 * Update resources based on time elapsed
 */
export function updateResources(
  currentResources: Resources,
  production: ResourceProduction,
  elapsedSeconds: number,
  storage?: { titanium: number; helium3: number; darkMatter: number }
): Resources {
  const hoursElapsed = elapsedSeconds / 3600;

  let newTitanium = currentResources.titanium + production.titanium * hoursElapsed;
  let newHelium3 = currentResources.helium3 + production.helium3 * hoursElapsed;
  let newDarkMatter = currentResources.darkMatter + production.darkMatter * hoursElapsed;

  // Apply storage limits if provided
  if (storage) {
    newTitanium = Math.min(newTitanium, storage.titanium);
    newHelium3 = Math.min(newHelium3, storage.helium3);
    newDarkMatter = Math.min(newDarkMatter, storage.darkMatter);
  }

  return {
    titanium: Math.floor(newTitanium),
    helium3: Math.floor(newHelium3),
    darkMatter: Math.floor(newDarkMatter),
  };
}

/**
 * Calculate storage capacity for a resource type
 */
export function calculateStorageCapacity(
  storageLevel: number,
  baseCapacity: number = 50000
): number {
  return Math.floor(baseCapacity * Math.pow(2, storageLevel));
}

/**
 * Check if player has enough resources
 */
export function hasEnoughResources(
  available: Resources,
  required: Partial<Resources>
): boolean {
  return (
    available.titanium >= (required.titanium ?? 0) &&
    available.helium3 >= (required.helium3 ?? 0) &&
    available.darkMatter >= (required.darkMatter ?? 0)
  );
}

/**
 * Deduct resources from available pool
 */
export function deductResources(
  available: Resources,
  cost: Partial<Resources>
): Resources {
  return {
    titanium: available.titanium - (cost.titanium ?? 0),
    helium3: available.helium3 - (cost.helium3 ?? 0),
    darkMatter: available.darkMatter - (cost.darkMatter ?? 0),
  };
}

/**
 * Get boosted ship speed with drive research bonus
 */
export function getBoostedShipSpeed(
  shipKey: keyof ShipComposition,
  research: Research
): number {
  const config = SHIP_CONFIG[shipKey as keyof typeof SHIP_CONFIG];
  if (!config || config.speed === 0) return 0;

  const driveKey = SHIP_DRIVE_MAP[shipKey];
  if (driveKey === 'none') return config.speed;

  const driveLevel = research[driveKey as keyof Research] || 0;
  const bonusPercent = DRIVE_BONUS_PERCENT[driveKey] || 0;
  return Math.floor(config.speed * (100 + driveLevel * bonusPercent) / 100);
}

/**
 * Get boosted combat stats with research bonuses
 */
export function getBoostedCombatStats(
  shipKey: keyof ShipComposition,
  research: Research
): { weaponPower: number; shieldPower: number; structuralIntegrity: number } {
  const config = SHIP_CONFIG[shipKey as keyof typeof SHIP_CONFIG];
  if (!config) return { weaponPower: 0, shieldPower: 0, structuralIntegrity: 0 };

  return {
    weaponPower: Math.floor(config.weaponPower * (100 + (research.weaponTech || 0) * 10) / 100),
    shieldPower: Math.floor(config.shieldPower * (100 + (research.shieldingTech || 0) * 10) / 100),
    structuralIntegrity: Math.floor(config.structuralIntegrity * (100 + (research.armourTech || 0) * 10) / 100),
  };
}

/**
 * Get boosted cargo capacity with Hyperspace Technology bonus
 */
export function getBoostedCargoCapacity(
  shipKey: keyof ShipComposition,
  research: Research
): number {
  const config = SHIP_CONFIG[shipKey as keyof typeof SHIP_CONFIG];
  if (!config) return 0;

  return Math.floor(config.cargoCapacity * (100 + (research.hyperspaceTech || 0) * 5) / 100);
}

/**
 * Calculate total fleet capacity with optional research bonuses
 */
export function calculateFleetCapacityWithResearch(ships: ShipComposition, research: Research): number {
  let capacity = 0;

  Object.entries(ships).forEach(([shipKey, count]) => {
    if (count && count > 0) {
      capacity += getBoostedCargoCapacity(shipKey as keyof ShipComposition, research) * count;
    }
  });

  return capacity;
}
