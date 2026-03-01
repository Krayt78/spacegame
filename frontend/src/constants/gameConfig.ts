import type { Buildings, ShipComposition, Research, Resources, Defense } from '@/types/game';
import type { LucideIcon } from 'lucide-react';
import {
  Rocket,
  Zap,
  Swords,
  Shield,
  Anchor,
  Crosshair,
  Bomb,
  Target,
  Globe,
  Recycle,
  Bug,
  Truck,
  Flame,
  Radiation,
  Magnet,
  CircleDot as Dome,
} from 'lucide-react';

// Building costs and production rates
export const BUILDING_CONFIG = {
  titaniumExtractor: {
    baseCost: { titanium: 60, helium3: 15, darkMatter: 0 },
    costMultiplier: 1.5,
    baseProduction: 30, // per hour per level
    productionMultiplier: 1.1,
  },
  helium3Harvester: {
    baseCost: { titanium: 48, helium3: 24, darkMatter: 0 },
    costMultiplier: 1.6,
    baseProduction: 20,
    productionMultiplier: 1.1,
  },
  darkMatterCollector: {
    baseCost: { titanium: 225, helium3: 75, darkMatter: 0 },
    costMultiplier: 1.5,
    baseProduction: 10,
    productionMultiplier: 1.1,
  },
  titaniumVault: {
    baseCost: { titanium: 1000, helium3: 0, darkMatter: 0 },
    costMultiplier: 2.0,
    baseCapacity: 10000,
    capacityMultiplier: 1.5,
  },
  helium3Tank: {
    baseCost: { titanium: 1000, helium3: 500, darkMatter: 0 },
    costMultiplier: 2.0,
    baseCapacity: 10000,
    capacityMultiplier: 1.5,
  },
  darkMatterContainment: {
    baseCost: { titanium: 1000, helium3: 1000, darkMatter: 0 },
    costMultiplier: 2.0,
    baseCapacity: 10000,
    capacityMultiplier: 1.5,
  },
  shipyard: {
    baseCost: { titanium: 400, helium3: 200, darkMatter: 100 },
    costMultiplier: 2.0,
  },
  researchNode: {
    baseCost: { titanium: 200, helium3: 400, darkMatter: 200 },
    costMultiplier: 2.0,
  },
  undergroundBunker: {
    baseCost: { titanium: 750, helium3: 450, darkMatter: 0 },
    costMultiplier: 2.0,
    baseCapacity: 500,
    capacityMultiplier: 1.2,
  },
} as const;

// Maximum number of ship types (matches contract MAX_SHIP_TYPES)
export const MAX_SHIP_TYPES = 13;

// Ship type indices (matches contract ShipType enum)
export const SHIP_TYPE_INDEX = {
  NONE: 0,
  SMALL_CARGO: 1,
  LARGE_CARGO: 2,
  LIGHT_FIGHTER: 3,
  HEAVY_FIGHTER: 4,
  CRUISER: 5,
  BATTLESHIP: 6,
  BATTLECRUISER: 7,
  BOMBER: 8,
  DESTROYER: 9,
  COLONY_SHIP: 10,
  RECYCLER: 11,
  CRAWLER: 12,
} as const;

// Ship type mapping for contract calls (frontend key to contract enum)
export const SHIP_TYPE_MAP: Record<string, number> = {
  smallCargo: 1,
  largeCargo: 2,
  lightFighter: 3,
  heavyFighter: 4,
  cruiser: 5,
  battleship: 6,
  battlecruiser: 7,
  bomber: 8,
  destroyer: 9,
  colonyShip: 10,
  recycler: 11,
  crawler: 12,
};

// Ship costs and stats
export const SHIP_CONFIG = {
  smallCargo: {
    cost: { titanium: 2000, helium3: 2000, darkMatter: 0 },
    structuralIntegrity: 4000,
    shieldPower: 10,
    weaponPower: 5,
    speed: 5000,
    cargoCapacity: 5000,
    fuelConsumption: 10,
    description: 'Small cargo transport for moving resources',
  },
  largeCargo: {
    cost: { titanium: 6000, helium3: 6000, darkMatter: 0 },
    structuralIntegrity: 12000,
    shieldPower: 25,
    weaponPower: 5,
    speed: 7500,
    cargoCapacity: 25000,
    fuelConsumption: 50,
    description: 'Large cargo transport for bulk resource movement',
  },
  lightFighter: {
    cost: { titanium: 3000, helium3: 1000, darkMatter: 0 },
    structuralIntegrity: 4000,
    shieldPower: 10,
    weaponPower: 50,
    speed: 12500,
    cargoCapacity: 50,
    fuelConsumption: 20,
    description: 'Fast attack craft for raids and reconnaissance',
  },
  heavyFighter: {
    cost: { titanium: 6000, helium3: 4000, darkMatter: 0 },
    structuralIntegrity: 10000,
    shieldPower: 25,
    weaponPower: 150,
    speed: 10000,
    cargoCapacity: 100,
    fuelConsumption: 75,
    description: 'Heavy combat fighter with increased firepower',
  },
  cruiser: {
    cost: { titanium: 20000, helium3: 7000, darkMatter: 2000 },
    structuralIntegrity: 27000,
    shieldPower: 50,
    weaponPower: 400,
    speed: 15000,
    cargoCapacity: 800,
    fuelConsumption: 300,
    description: 'Multi-role combat vessel',
  },
  battleship: {
    cost: { titanium: 45000, helium3: 15000, darkMatter: 0 },
    structuralIntegrity: 60000,
    shieldPower: 200,
    weaponPower: 1000,
    speed: 10000,
    cargoCapacity: 1500,
    fuelConsumption: 500,
    description: 'Heavy battleship with massive firepower',
  },
  battlecruiser: {
    cost: { titanium: 30000, helium3: 40000, darkMatter: 15000 },
    structuralIntegrity: 70000,
    shieldPower: 400,
    weaponPower: 700,
    speed: 10000,
    cargoCapacity: 750,
    fuelConsumption: 250,
    description: 'Fast capital ship with balanced stats',
  },
  bomber: {
    cost: { titanium: 50000, helium3: 25000, darkMatter: 15000 },
    structuralIntegrity: 75000,
    shieldPower: 500,
    weaponPower: 1000,
    speed: 4000,
    cargoCapacity: 500,
    fuelConsumption: 1000,
    description: 'Specialized attack ship for destroying defenses',
  },
  destroyer: {
    cost: { titanium: 60000, helium3: 50000, darkMatter: 15000 },
    structuralIntegrity: 110000,
    shieldPower: 500,
    weaponPower: 2000,
    speed: 5000,
    cargoCapacity: 2000,
    fuelConsumption: 1000,
    description: 'Capital ship killer with devastating weapons',
  },
  colonyShip: {
    cost: { titanium: 10000, helium3: 20000, darkMatter: 10000 },
    structuralIntegrity: 30000,
    shieldPower: 100,
    weaponPower: 50,
    speed: 2500,
    cargoCapacity: 7500,
    fuelConsumption: 1000,
    description: 'Colonization vessel for establishing new outposts',
  },
  recycler: {
    cost: { titanium: 10000, helium3: 6000, darkMatter: 2000 },
    structuralIntegrity: 16000,
    shieldPower: 10,
    weaponPower: 1,
    speed: 2000,
    cargoCapacity: 20000,
    fuelConsumption: 300,
    description: 'Salvage ship for collecting debris fields',
  },
  crawler: {
    cost: { titanium: 2000, helium3: 2000, darkMatter: 1000 },
    structuralIntegrity: 4000,
    shieldPower: 1,
    weaponPower: 1,
    speed: 0,
    cargoCapacity: 0,
    fuelConsumption: 0,
    description: 'Surface crawler that boosts resource production',
  },
} as const;

// Research costs
export const RESEARCH_CONFIG = {
  combustionDrive: {
    baseCost: { titanium: 400, helium3: 0, darkMatter: 600 },
    costMultiplier: 2.0,
    description: 'Increases speed of small cargo, large cargo, light fighter, colony ship, and recycler by 10% per level',
  },
  impulseDrive: {
    baseCost: { titanium: 2000, helium3: 4000, darkMatter: 600 },
    costMultiplier: 2.0,
    description: 'Increases speed of heavy fighter, cruiser, and bomber by 20% per level',
  },
  hyperspaceDrive: {
    baseCost: { titanium: 10000, helium3: 20000, darkMatter: 6000 },
    costMultiplier: 2.0,
    description: 'Increases speed of battleship, battlecruiser, and destroyer by 30% per level',
  },
  weaponTech: {
    baseCost: { titanium: 800, helium3: 200, darkMatter: 0 },
    costMultiplier: 2.0,
    description: 'Increases ship weapon damage by 10% per level',
  },
  shieldingTech: {
    baseCost: { titanium: 200, helium3: 600, darkMatter: 0 },
    costMultiplier: 2.0,
    description: 'Increases ship shield strength by 10% per level',
  },
  armourTech: {
    baseCost: { titanium: 1000, helium3: 0, darkMatter: 0 },
    costMultiplier: 2.0,
    description: 'Increases hull armor strength by 10% per level',
  },
  powerSystems: {
    baseCost: { titanium: 0, helium3: 800, darkMatter: 400 },
    costMultiplier: 2.0,
    description: 'Advanced power distribution for fleet operations',
  },
  computerTech: {
    baseCost: { titanium: 0, helium3: 400, darkMatter: 600 },
    costMultiplier: 2.0,
    description: 'Each level allows 1 additional simultaneous fleet',
  },
  stealthSystems: {
    baseCost: { titanium: 200, helium3: 1000, darkMatter: 200 },
    costMultiplier: 2.0,
    description: 'Reduces fleet detection chance',
  },
  ionTech: {
    baseCost: { titanium: 1000, helium3: 300, darkMatter: 100 },
    costMultiplier: 2.0,
    description: 'Ion weapons for disabling ships',
  },
  hyperspaceTech: {
    baseCost: { titanium: 0, helium3: 4000, darkMatter: 2000 },
    costMultiplier: 2.0,
    description: 'Increases cargo capacity of all ships by 5% per level',
  },
  laserTech: {
    baseCost: { titanium: 200, helium3: 100, darkMatter: 0 },
    costMultiplier: 2.0,
    description: 'Laser weapon systems',
  },
  plasmaTech: {
    baseCost: { titanium: 2000, helium3: 4000, darkMatter: 1000 },
    costMultiplier: 2.0,
    description: 'Advanced plasma weaponry',
  },
  astrophysics: {
    baseCost: { titanium: 4000, helium3: 8000, darkMatter: 4000 },
    costMultiplier: 1.75,
    description: 'Each 2 levels allows colonization of 1 additional planet',
  },
} as const;

// Drive type mapping: which drive research affects each ship's speed
export const SHIP_DRIVE_MAP: Record<keyof ShipComposition, 'combustionDrive' | 'impulseDrive' | 'hyperspaceDrive' | 'none'> = {
  smallCargo: 'combustionDrive',
  largeCargo: 'combustionDrive',
  lightFighter: 'combustionDrive',
  heavyFighter: 'impulseDrive',
  cruiser: 'impulseDrive',
  battleship: 'hyperspaceDrive',
  battlecruiser: 'hyperspaceDrive',
  bomber: 'impulseDrive',
  destroyer: 'hyperspaceDrive',
  colonyShip: 'combustionDrive',
  recycler: 'combustionDrive',
  crawler: 'none',
};

// Speed bonus percentage per research level for each drive type
export const DRIVE_BONUS_PERCENT: Record<string, number> = {
  combustionDrive: 10,
  impulseDrive: 20,
  hyperspaceDrive: 30,
};

// Research bonus descriptions for display
export const RESEARCH_BONUS_INFO: Partial<Record<keyof Research, { bonusPerLevel: number; bonusUnit: string; description: string }>> = {
  combustionDrive: { bonusPerLevel: 10, bonusUnit: '%', description: 'base speed for combustion ships' },
  impulseDrive: { bonusPerLevel: 20, bonusUnit: '%', description: 'base speed for impulse ships' },
  hyperspaceDrive: { bonusPerLevel: 30, bonusUnit: '%', description: 'base speed for hyperspace ships' },
  weaponTech: { bonusPerLevel: 10, bonusUnit: '%', description: 'base weapon strength' },
  shieldingTech: { bonusPerLevel: 10, bonusUnit: '%', description: 'base shield value' },
  armourTech: { bonusPerLevel: 10, bonusUnit: '%', description: 'base hull strength' },
  hyperspaceTech: { bonusPerLevel: 5, bonusUnit: '%', description: 'cargo capacity' },
  computerTech: { bonusPerLevel: 1, bonusUnit: '', description: 'fleet slot' },
  astrophysics: { bonusPerLevel: 0.5, bonusUnit: '', description: 'colony slot (per 2 levels)' },
};

// Starting resources for new players
export const STARTING_RESOURCES: Resources = {
  titanium: 500,
  helium3: 500,
  darkMatter: 0,
};

// Starting buildings for new players
export const STARTING_BUILDINGS: Buildings = {
  titaniumExtractor: 1,
  helium3Harvester: 1,
  darkMatterCollector: 0,
  titaniumVault: 0,
  helium3Tank: 0,
  darkMatterContainment: 0,
  shipyard: 0,
  researchNode: 0,
  undergroundBunker: 0,
};

// Game constants
export const UNIVERSE_SIZE = {
  galaxies: 10,
  systems: 499,
  positions: 15,
};

export const BUILD_TIME_MULTIPLIER = 1.0; // Adjust for faster/slower building
export const RESEARCH_TIME_MULTIPLIER = 1.0;

// Building names for display
export const BUILDING_NAMES: Record<keyof Buildings, string> = {
  titaniumExtractor: 'Titanium Extractor',
  helium3Harvester: 'Helium-3 Harvester',
  darkMatterCollector: 'Dark Matter Collector',
  titaniumVault: 'Titanium Vault',
  helium3Tank: 'Helium-3 Tank',
  darkMatterContainment: 'Dark Matter Containment',
  shipyard: 'Shipyard',
  researchNode: 'Research Node',
  undergroundBunker: 'Underground Bunker',
};

// Research names for display
export const RESEARCH_NAMES: Record<keyof Research, string> = {
  combustionDrive: 'Combustion Drive',
  impulseDrive: 'Impulse Drive',
  hyperspaceDrive: 'Hyperspace Drive',
  weaponTech: 'Weapon Technology',
  shieldingTech: 'Shielding Technology',
  armourTech: 'Armour Technology',
  powerSystems: 'Power Systems',
  computerTech: 'Computer Technology',
  stealthSystems: 'Stealth Systems',
  ionTech: 'Ion Technology',
  hyperspaceTech: 'Hyperspace Technology',
  laserTech: 'Laser Technology',
  plasmaTech: 'Plasma Technology',
  astrophysics: 'Astrophysics',
};

// Ship requirements (matches contract GameConfig.sol shipRequirements)
export const SHIP_REQUIREMENTS: Record<keyof ShipComposition, {
  shipyardLevel: number;
  research: { key: keyof Research; level: number }[];
}> = {
  lightFighter:  { shipyardLevel: 1, research: [{ key: 'combustionDrive', level: 1 }] },
  smallCargo:    { shipyardLevel: 2, research: [{ key: 'combustionDrive', level: 2 }] },
  heavyFighter:  { shipyardLevel: 3, research: [{ key: 'impulseDrive', level: 2 }, { key: 'armourTech', level: 2 }] },
  largeCargo:    { shipyardLevel: 4, research: [{ key: 'combustionDrive', level: 6 }] },
  colonyShip:    { shipyardLevel: 4, research: [{ key: 'impulseDrive', level: 3 }] },
  recycler:      { shipyardLevel: 4, research: [{ key: 'combustionDrive', level: 6 }, { key: 'shieldingTech', level: 2 }] },
  cruiser:       { shipyardLevel: 5, research: [{ key: 'impulseDrive', level: 4 }, { key: 'ionTech', level: 2 }] },
  crawler:       { shipyardLevel: 5, research: [{ key: 'combustionDrive', level: 4 }, { key: 'armourTech', level: 4 }, { key: 'laserTech', level: 4 }] },
  battleship:    { shipyardLevel: 7, research: [{ key: 'hyperspaceDrive', level: 4 }] },
  battlecruiser: { shipyardLevel: 8, research: [{ key: 'hyperspaceDrive', level: 5 }, { key: 'hyperspaceTech', level: 5 }, { key: 'laserTech', level: 12 }] },
  bomber:        { shipyardLevel: 8, research: [{ key: 'impulseDrive', level: 6 }, { key: 'plasmaTech', level: 5 }] },
  destroyer:     { shipyardLevel: 9, research: [{ key: 'hyperspaceDrive', level: 6 }, { key: 'hyperspaceTech', level: 5 }] },
};

// Ship categories for display grouping
export const SHIP_CATEGORIES: { title: string; keys: (keyof ShipComposition)[] }[] = [
  { title: 'Transport', keys: ['smallCargo', 'largeCargo'] },
  { title: 'Combat', keys: ['lightFighter', 'heavyFighter', 'cruiser'] },
  { title: 'Capital Ships', keys: ['battleship', 'battlecruiser', 'bomber', 'destroyer'] },
  { title: 'Special', keys: ['colonyShip', 'recycler', 'crawler'] },
];

// Ship icon and color mapping
export const SHIP_ICON_MAP: Record<keyof ShipComposition, { icon: LucideIcon; color: string }> = {
  smallCargo:    { icon: Rocket,     color: 'var(--accent-secondary)' },
  largeCargo:    { icon: Truck,      color: 'var(--accent-secondary)' },
  lightFighter:  { icon: Zap,        color: 'var(--accent-warn)' },
  heavyFighter:  { icon: Swords,     color: 'var(--accent-warn)' },
  cruiser:       { icon: Shield,     color: 'var(--accent-primary)' },
  battleship:    { icon: Anchor,     color: 'var(--accent-danger)' },
  battlecruiser: { icon: Crosshair,  color: 'var(--accent-danger)' },
  bomber:        { icon: Bomb,       color: 'var(--accent-danger)' },
  destroyer:     { icon: Target,     color: 'var(--accent-danger)' },
  colonyShip:    { icon: Globe,      color: 'var(--accent-primary)' },
  recycler:      { icon: Recycle,    color: 'var(--accent-secondary)' },
  crawler:       { icon: Bug,        color: 'var(--text-muted)' },
};

// Ship names for display
export const SHIP_NAMES: Record<keyof ShipComposition, string> = {
  smallCargo: 'Small Cargo',
  largeCargo: 'Large Cargo',
  lightFighter: 'Light Fighter',
  heavyFighter: 'Heavy Fighter',
  cruiser: 'Cruiser',
  battleship: 'Battleship',
  battlecruiser: 'Battlecruiser',
  bomber: 'Bomber',
  destroyer: 'Destroyer',
  colonyShip: 'Colony Ship',
  recycler: 'Recycler',
  crawler: 'Crawler',
};

// ========== Defense Configuration ==========

export const DEFENSE_CONFIG: Record<keyof Defense, {
  cost: { titanium: number; helium3: number; darkMatter: number };
  structuralIntegrity: number;
  shieldPower: number;
  weaponPower: number;
  limit: number;
  description: string;
}> = {
  rocketLauncher: {
    cost: { titanium: 2000, helium3: 0, darkMatter: 0 },
    structuralIntegrity: 2000, shieldPower: 20, weaponPower: 80, limit: 0,
    description: 'Basic ballistic defense. Cheap and effective against light fighters.',
  },
  lightLaser: {
    cost: { titanium: 1500, helium3: 500, darkMatter: 0 },
    structuralIntegrity: 2000, shieldPower: 25, weaponPower: 100, limit: 0,
    description: 'Energy-based defense with improved accuracy over rockets.',
  },
  heavyLaser: {
    cost: { titanium: 6000, helium3: 2000, darkMatter: 0 },
    structuralIntegrity: 8000, shieldPower: 100, weaponPower: 250, limit: 0,
    description: 'High-powered laser capable of damaging cruisers.',
  },
  ionCannon: {
    cost: { titanium: 5000, helium3: 3000, darkMatter: 0 },
    structuralIntegrity: 8000, shieldPower: 500, weaponPower: 150, limit: 0,
    description: 'Disruptive ion weapon with strong shielding.',
  },
  gaussCannon: {
    cost: { titanium: 20000, helium3: 15000, darkMatter: 2000 },
    structuralIntegrity: 35000, shieldPower: 200, weaponPower: 1100, limit: 0,
    description: 'Electromagnetic accelerator that fires devastating projectiles.',
  },
  plasmaTurret: {
    cost: { titanium: 50000, helium3: 50000, darkMatter: 30000 },
    structuralIntegrity: 100000, shieldPower: 300, weaponPower: 3000, limit: 0,
    description: 'Top-tier weapon platform dealing massive damage.',
  },
  smallShieldDome: {
    cost: { titanium: 10000, helium3: 10000, darkMatter: 0 },
    structuralIntegrity: 20000, shieldPower: 2000, weaponPower: 1, limit: 1,
    description: 'Planetary shield generator providing base-level protection.',
  },
  largeShieldDome: {
    cost: { titanium: 50000, helium3: 50000, darkMatter: 0 },
    structuralIntegrity: 100000, shieldPower: 10000, weaponPower: 1, limit: 1,
    description: 'Advanced shield generator with massive defensive capability.',
  },
};

// Defense requirements (matches contract GameConfig.sol defenseRequirements)
export const DEFENSE_REQUIREMENTS: Record<keyof Defense, {
  shipyardLevel: number;
  research: { key: keyof Research; level: number }[];
}> = {
  rocketLauncher:  { shipyardLevel: 1, research: [] },
  lightLaser:      { shipyardLevel: 2, research: [{ key: 'laserTech', level: 3 }] },
  heavyLaser:      { shipyardLevel: 4, research: [{ key: 'laserTech', level: 6 }] },
  ionCannon:       { shipyardLevel: 4, research: [{ key: 'ionTech', level: 4 }] },
  gaussCannon:     { shipyardLevel: 6, research: [{ key: 'weaponTech', level: 3 }, { key: 'shieldingTech', level: 1 }] },
  plasmaTurret:    { shipyardLevel: 8, research: [{ key: 'plasmaTech', level: 7 }] },
  smallShieldDome: { shipyardLevel: 1, research: [{ key: 'shieldingTech', level: 2 }] },
  largeShieldDome: { shipyardLevel: 6, research: [{ key: 'shieldingTech', level: 6 }] },
};

// Defense categories for display grouping
export const DEFENSE_CATEGORIES: { title: string; keys: (keyof Defense)[] }[] = [
  { title: 'Weapons', keys: ['rocketLauncher', 'lightLaser', 'heavyLaser', 'ionCannon', 'gaussCannon', 'plasmaTurret'] },
  { title: 'Shields', keys: ['smallShieldDome', 'largeShieldDome'] },
];

// Defense icon and color mapping
export const DEFENSE_ICON_MAP: Record<keyof Defense, { icon: LucideIcon; color: string }> = {
  rocketLauncher:  { icon: Rocket,    color: 'var(--accent-warn)' },
  lightLaser:      { icon: Zap,       color: 'var(--accent-warn)' },
  heavyLaser:      { icon: Flame,     color: 'var(--accent-danger)' },
  ionCannon:       { icon: Radiation, color: 'var(--accent-primary)' },
  gaussCannon:     { icon: Magnet,    color: 'var(--accent-danger)' },
  plasmaTurret:    { icon: Target,    color: 'var(--accent-danger)' },
  smallShieldDome: { icon: Shield,    color: 'var(--accent-primary)' },
  largeShieldDome: { icon: Dome,      color: 'var(--accent-primary)' },
};

// Defense names for display
export const DEFENSE_NAMES: Record<keyof Defense, string> = {
  rocketLauncher: 'Rocket Launcher',
  lightLaser: 'Light Laser',
  heavyLaser: 'Heavy Laser',
  ionCannon: 'Ion Cannon',
  gaussCannon: 'Gauss Cannon',
  plasmaTurret: 'Plasma Turret',
  smallShieldDome: 'Small Shield Dome',
  largeShieldDome: 'Large Shield Dome',
};
