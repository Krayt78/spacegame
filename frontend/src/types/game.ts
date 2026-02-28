// Core game types for Nexus Protocol

export interface Planet {
  id: string;
  owner: string;
  name: string;
  coordinates: [number, number, number]; // galaxy, system, position
  buildings: Buildings;
  resources: Resources;
  production: ResourceProduction;
  lastUpdated: number; // timestamp for resource calculation
}

export interface Buildings {
  // Resource Production
  titaniumExtractor: number;
  helium3Harvester: number;
  darkMatterCollector: number;

  // Storage
  titaniumVault: number;
  helium3Tank: number;
  darkMatterContainment: number;

  // Facilities
  shipyard: number;
  researchNode: number;
}

export interface Resources {
  titanium: number;
  helium3: number;
  darkMatter: number;
}

export interface ResourceProduction {
  titanium: number; // per hour
  helium3: number; // per hour
  darkMatter: number; // per hour
}

export interface Fleet {
  id: string;
  owner: string;
  ships: ShipComposition;
  origin: [number, number, number];
  destination: [number, number, number];
  mission: FleetMission;
  departureTime: number;
  arrivalTime: number;
  cargo?: Resources;
}

export interface ShipComposition {
  smallCargo?: number;
  largeCargo?: number;
  lightFighter?: number;
  heavyFighter?: number;
  cruiser?: number;
  battleship?: number;
  battlecruiser?: number;
  bomber?: number;
  destroyer?: number;
  colonyShip?: number;
  recycler?: number;
  crawler?: number;
}

export type FleetMission = 'assault' | 'transfer' | 'station' | 'recon';

export interface Research {
  // Drives & Movement
  combustionDrive: number;
  impulseDrive: number;
  hyperspaceDrive: number;

  // Weapons & Defense
  weaponTech: number;
  shieldingTech: number;
  armourTech: number;

  // Technology
  powerSystems: number;
  computerTech: number;
  stealthSystems: number;
  ionTech: number;
  hyperspaceTech: number;
  laserTech: number;
  plasmaTech: number;
  astrophysics: number;
}

export interface Player {
  address: string; // wallet address
  name: string;
  planets: string[]; // planet IDs
  research: Research;
  totalPoints: number;
}

export interface BuildQueue {
  buildingType: keyof Buildings;
  targetLevel: number;
  startTime: number;
  endTime: number;
}

export interface ShipQueue {
  shipType: number;
  quantity: number;
  completionTime: number;
}

export interface Ships {
  smallCargo: number;
  largeCargo: number;
  lightFighter: number;
  heavyFighter: number;
  cruiser: number;
  battleship: number;
  battlecruiser: number;
  bomber: number;
  destroyer: number;
  colonyShip: number;
  recycler: number;
  crawler: number;
}

export interface Defense {
  rocketLauncher: number;
  lightLaser: number;
  heavyLaser: number;
  ionCannon: number;
  gaussCannon: number;
  plasmaTurret: number;
  smallShieldDome: number;
  largeShieldDome: number;
}

export interface ProductionQueue {
  shipType: keyof ShipComposition;
  quantity: number;
  startTime: number;
  endTime: number;
}

export interface CombatReport {
  id: string;
  timestamp: number;
  attacker: {
    name: string;
    fleet: ShipComposition;
    losses: ShipComposition;
  };
  defender: {
    name: string;
    fleet: ShipComposition;
    losses: ShipComposition;
  };
  result: 'attacker_win' | 'defender_win' | 'draw';
  plunder: Resources;
  debrisField: Resources;
}
