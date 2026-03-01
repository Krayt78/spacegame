// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title GameConfig
 * @notice Stores all game configuration parameters (costs, production rates, build times)
 * @dev Separate contract for easy balancing without redeploying main game logic
 */
contract GameConfig is Ownable {

    // Building type enum
    enum BuildingType {
        NONE,
        TITANIUM_EXTRACTOR,
        HELIUM3_HARVESTER,
        DARKMATTER_COLLECTOR,
        TITANIUM_VAULT,
        HELIUM3_TANK,
        DARKMATTER_CONTAINMENT,
        SHIPYARD,
        RESEARCH_NODE,
        UNDERGROUND_BUNKER
    }

    // Ship types - index maps directly to position in fixed-size arrays
    // MAX_SHIP_TYPES = 13 in NexusGame.sol
    enum ShipType {
        NONE,              // 0
        SmallCargo,        // 1
        LargeCargo,        // 2
        LightFighter,      // 3
        HeavyFighter,      // 4
        Cruiser,           // 5
        Battleship,        // 6
        Battlecruiser,     // 7
        Bomber,            // 8
        Destroyer,         // 9
        ColonyShip,        // 10
        Recycler,          // 11
        Crawler            // 12
    }

    // Defense types - index maps directly to position in fixed-size arrays
    // MAX_DEFENSE_TYPES = 9 in GameState.sol
    enum DefenseType {
        NONE,              // 0
        RocketLauncher,    // 1
        LightLaser,        // 2
        HeavyLaser,        // 3
        IonCannon,         // 4
        GaussCannon,       // 5
        PlasmaTurret,      // 6
        SmallShieldDome,   // 7
        LargeShieldDome    // 8
    }

    // Outpost types for raider outposts at positions 11-15
    enum OutpostType {
        NONE,                   // 0
        TITANIUM_MINE,          // 1
        HELIUM3_LAB,            // 2
        DARKMATTER_REFINERY     // 3
    }

    // Drive types for speed research bonuses
    enum DriveType {
        NONE,       // 0 - No drive (Crawler)
        COMBUSTION, // 1 - +10%/level
        IMPULSE,    // 2 - +20%/level
        HYPERSPACE  // 3 - +30%/level
    }

    // Research types
    enum ResearchType {
        NONE,                   // 0
        COMBUSTION_DRIVE,       // 1
        IMPULSE_DRIVE,          // 2
        HYPERSPACE_DRIVE,       // 3
        WEAPON_TECH,            // 4
        SHIELDING_TECH,         // 5
        ARMOUR_TECH,            // 6
        POWER_SYSTEMS,          // 7
        COMPUTER_TECH,          // 8
        STEALTH_SYSTEMS,        // 9
        ION_TECH,               // 10
        HYPERSPACE_TECH,        // 11
        LASER_TECH,             // 12
        PLASMA_TECH,            // 13
        ASTROPHYSICS            // 14
    }

    // Cost structure
    struct Cost {
        uint256 titanium;
        uint256 helium3;
        uint256 darkMatter;
    }

    // Building configuration
    struct BuildingConfig {
        Cost baseCost;
        uint16 costMultiplier;    // multiplied by 100 (150 = 1.5x)
        uint256 baseProduction;   // per hour (for resource buildings)
        uint16 productionMultiplier; // multiplied by 100
        uint256 baseCapacity;     // for storage buildings
        uint16 capacityMultiplier;
    }

    // Ship configuration
    struct ShipConfig {
        Cost cost;
        uint32 structuralIntegrity;
        uint16 shieldPower;
        uint16 weaponPower;
        uint32 speed;
        uint32 cargoCapacity;
        uint16 fuelConsumption;
    }

    // Combat stats with research bonuses applied
    struct CombatStats {
        uint256 weaponPower;
        uint256 shieldPower;
        uint256 structuralIntegrity;
    }

    // Outpost configuration
    struct OutpostConfig {
        uint256 productionRate;  // per hour
        uint256 storageCap;
    }

    // Research configuration
    struct ResearchConfig {
        Cost baseCost;
        uint16 costMultiplier;    // multiplied by 100 (200 = 2.0x)
    }

    // Defense configuration
    struct DefenseConfig {
        Cost cost;
        uint32 structuralIntegrity;
        uint16 shieldPower;
        uint16 weaponPower;
        uint8 limit; // 0 = unlimited, 1 = max 1 per planet
    }

    // Defense requirements
    struct DefenseRequirements {
        uint8 shipyardLevel;
        ResearchType researchReq1;
        uint8 researchLevel1;
        ResearchType researchReq2;
        uint8 researchLevel2;
    }

    // Ship requirements
    struct ShipRequirements {
        uint8 shipyardLevel;
        ResearchType researchReq1;
        uint8 researchLevel1;
        ResearchType researchReq2;
        uint8 researchLevel2;
        ResearchType researchReq3;
        uint8 researchLevel3;
    }

    // Storage: buildingType => config
    mapping(BuildingType => BuildingConfig) public buildingConfigs;

    // Storage: shipType => config
    mapping(ShipType => ShipConfig) public shipConfigs;

    // Storage: outpostType => config
    mapping(OutpostType => OutpostConfig) public outpostConfigs;

    // Storage: researchType => config
    mapping(ResearchType => ResearchConfig) public researchConfigs;

    // Storage: shipType => requirements
    mapping(ShipType => ShipRequirements) internal shipRequirements;

    // Storage: attacker shipType => target shipType => advantage value
    mapping(ShipType => mapping(ShipType => uint8)) internal _advantage;

    // Storage: defenseType => config
    mapping(DefenseType => DefenseConfig) public defenseConfigs;

    // Storage: defenseType => requirements
    mapping(DefenseType => DefenseRequirements) internal defenseRequirements;

    // Storage: attacker shipType => target defenseType => advantage value
    mapping(ShipType => mapping(DefenseType => uint8)) internal _shipVsDefenseAdvantage;

    // Starting resources for new players
    Cost internal _startingResources;

    // Speed factor for travel time calculation (higher = faster travel)
    uint256 public speedFactor = 1000;

    // Percentage of resources available as raid loot (50 = 50%)
    uint256 public raidLootPercentage = 50;

    constructor() Ownable(msg.sender) {
        _initializeConfigs();
    }

    function _initializeConfigs() private {
        // Titanium Extractor
        buildingConfigs[BuildingType.TITANIUM_EXTRACTOR] = BuildingConfig({
            baseCost: Cost(60, 15, 0),
            costMultiplier: 150, // 1.5x per level
            baseProduction: 30,
            productionMultiplier: 110, // 1.1x per level
            baseCapacity: 0,
            capacityMultiplier: 0
        });

        // Helium-3 Harvester
        buildingConfigs[BuildingType.HELIUM3_HARVESTER] = BuildingConfig({
            baseCost: Cost(48, 24, 0),
            costMultiplier: 160,
            baseProduction: 20,
            productionMultiplier: 110,
            baseCapacity: 0,
            capacityMultiplier: 0
        });

        // Dark Matter Collector
        buildingConfigs[BuildingType.DARKMATTER_COLLECTOR] = BuildingConfig({
            baseCost: Cost(225, 75, 0),
            costMultiplier: 150,
            baseProduction: 10,
            productionMultiplier: 110,
            baseCapacity: 0,
            capacityMultiplier: 0
        });

        // Titanium Vault
        buildingConfigs[BuildingType.TITANIUM_VAULT] = BuildingConfig({
            baseCost: Cost(1000, 0, 0),
            costMultiplier: 200,
            baseProduction: 0,
            productionMultiplier: 0,
            baseCapacity: 10000,
            capacityMultiplier: 150
        });

        // Helium-3 Tank
        buildingConfigs[BuildingType.HELIUM3_TANK] = BuildingConfig({
            baseCost: Cost(1000, 500, 0),
            costMultiplier: 200,
            baseProduction: 0,
            productionMultiplier: 0,
            baseCapacity: 10000,
            capacityMultiplier: 150
        });

        // Dark Matter Containment
        buildingConfigs[BuildingType.DARKMATTER_CONTAINMENT] = BuildingConfig({
            baseCost: Cost(1000, 1000, 0),
            costMultiplier: 200,
            baseProduction: 0,
            productionMultiplier: 0,
            baseCapacity: 10000,
            capacityMultiplier: 150
        });

        // Shipyard
        buildingConfigs[BuildingType.SHIPYARD] = BuildingConfig({
            baseCost: Cost(400, 200, 100),
            costMultiplier: 200,
            baseProduction: 0,
            productionMultiplier: 0,
            baseCapacity: 0,
            capacityMultiplier: 0
        });

        // Research Node
        buildingConfigs[BuildingType.RESEARCH_NODE] = BuildingConfig({
            baseCost: Cost(200, 400, 200),
            costMultiplier: 200,
            baseProduction: 0,
            productionMultiplier: 0,
            baseCapacity: 0,
            capacityMultiplier: 0
        });

        // Underground Bunker — protects resources from raids
        // Protection per resource = baseCapacity × (capacityMultiplier/100)^level = 500 × 1.2^level
        buildingConfigs[BuildingType.UNDERGROUND_BUNKER] = BuildingConfig({
            baseCost: Cost(750, 450, 0),
            costMultiplier: 200,
            baseProduction: 0,
            productionMultiplier: 0,
            baseCapacity: 500,
            capacityMultiplier: 120
        });

        // Starting resources
        _startingResources = Cost(500, 500, 0);

        // Ship configurations from design document
        shipConfigs[ShipType.SmallCargo] = ShipConfig({
            cost: Cost(2000, 2000, 0),
            structuralIntegrity: 4000,
            shieldPower: 10,
            weaponPower: 5,
            speed: 5000,
            cargoCapacity: 5000,
            fuelConsumption: 10
        });

        shipConfigs[ShipType.LargeCargo] = ShipConfig({
            cost: Cost(6000, 6000, 0),
            structuralIntegrity: 12000,
            shieldPower: 25,
            weaponPower: 5,
            speed: 7500,
            cargoCapacity: 25000,
            fuelConsumption: 50
        });

        shipConfigs[ShipType.LightFighter] = ShipConfig({
            cost: Cost(3000, 1000, 0),
            structuralIntegrity: 4000,
            shieldPower: 10,
            weaponPower: 50,
            speed: 12500,
            cargoCapacity: 50,
            fuelConsumption: 20
        });

        shipConfigs[ShipType.HeavyFighter] = ShipConfig({
            cost: Cost(6000, 4000, 0),
            structuralIntegrity: 10000,
            shieldPower: 25,
            weaponPower: 150,
            speed: 10000,
            cargoCapacity: 100,
            fuelConsumption: 75
        });

        shipConfigs[ShipType.Cruiser] = ShipConfig({
            cost: Cost(20000, 7000, 2000),
            structuralIntegrity: 27000,
            shieldPower: 50,
            weaponPower: 400,
            speed: 15000,
            cargoCapacity: 800,
            fuelConsumption: 300
        });

        shipConfigs[ShipType.Battleship] = ShipConfig({
            cost: Cost(45000, 15000, 0),
            structuralIntegrity: 60000,
            shieldPower: 200,
            weaponPower: 1000,
            speed: 10000,
            cargoCapacity: 1500,
            fuelConsumption: 500
        });

        shipConfigs[ShipType.Battlecruiser] = ShipConfig({
            cost: Cost(30000, 40000, 15000),
            structuralIntegrity: 70000,
            shieldPower: 400,
            weaponPower: 700,
            speed: 10000,
            cargoCapacity: 750,
            fuelConsumption: 250
        });

        shipConfigs[ShipType.Bomber] = ShipConfig({
            cost: Cost(50000, 25000, 15000),
            structuralIntegrity: 75000,
            shieldPower: 500,
            weaponPower: 1000,
            speed: 4000,
            cargoCapacity: 500,
            fuelConsumption: 1000
        });

        shipConfigs[ShipType.Destroyer] = ShipConfig({
            cost: Cost(60000, 50000, 15000),
            structuralIntegrity: 110000,
            shieldPower: 500,
            weaponPower: 2000,
            speed: 5000,
            cargoCapacity: 2000,
            fuelConsumption: 1000
        });

        shipConfigs[ShipType.ColonyShip] = ShipConfig({
            cost: Cost(10000, 20000, 10000),
            structuralIntegrity: 30000,
            shieldPower: 100,
            weaponPower: 50,
            speed: 2500,
            cargoCapacity: 7500,
            fuelConsumption: 1000
        });

        shipConfigs[ShipType.Recycler] = ShipConfig({
            cost: Cost(10000, 6000, 2000),
            structuralIntegrity: 16000,
            shieldPower: 10,
            weaponPower: 1,
            speed: 2000,
            cargoCapacity: 20000,
            fuelConsumption: 300
        });

        shipConfigs[ShipType.Crawler] = ShipConfig({
            cost: Cost(2000, 2000, 1000),
            structuralIntegrity: 4000,
            shieldPower: 1,
            weaponPower: 1,
            speed: 0,
            cargoCapacity: 0,
            fuelConsumption: 0
        });

        // Outpost configurations
        // Titanium Mine: 100 per hour, 10000 storage cap
        outpostConfigs[OutpostType.TITANIUM_MINE] = OutpostConfig({
            productionRate: 100,
            storageCap: 10000
        });

        // Helium-3 Lab: 60 per hour, 6000 storage cap
        outpostConfigs[OutpostType.HELIUM3_LAB] = OutpostConfig({
            productionRate: 60,
            storageCap: 6000
        });

        // Dark Matter Refinery: 30 per hour, 3000 storage cap
        outpostConfigs[OutpostType.DARKMATTER_REFINERY] = OutpostConfig({
            productionRate: 30,
            storageCap: 3000
        });

        // Research configurations (all 2.0x cost multiplier per level)
        researchConfigs[ResearchType.COMBUSTION_DRIVE] = ResearchConfig({
            baseCost: Cost(400, 0, 600),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.IMPULSE_DRIVE] = ResearchConfig({
            baseCost: Cost(2000, 4000, 600),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.HYPERSPACE_DRIVE] = ResearchConfig({
            baseCost: Cost(10000, 20000, 6000),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.WEAPON_TECH] = ResearchConfig({
            baseCost: Cost(800, 200, 0),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.SHIELDING_TECH] = ResearchConfig({
            baseCost: Cost(200, 600, 0),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.ARMOUR_TECH] = ResearchConfig({
            baseCost: Cost(1000, 0, 0),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.POWER_SYSTEMS] = ResearchConfig({
            baseCost: Cost(0, 800, 400),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.COMPUTER_TECH] = ResearchConfig({
            baseCost: Cost(0, 400, 600),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.STEALTH_SYSTEMS] = ResearchConfig({
            baseCost: Cost(200, 1000, 200),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.ION_TECH] = ResearchConfig({
            baseCost: Cost(1000, 300, 100),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.HYPERSPACE_TECH] = ResearchConfig({
            baseCost: Cost(0, 4000, 2000),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.LASER_TECH] = ResearchConfig({
            baseCost: Cost(200, 100, 0),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.PLASMA_TECH] = ResearchConfig({
            baseCost: Cost(2000, 4000, 1000),
            costMultiplier: 200
        });

        researchConfigs[ResearchType.ASTROPHYSICS] = ResearchConfig({
            baseCost: Cost(4000, 8000, 4000),
            costMultiplier: 175
        });

        // Ship requirements (shipyard level + up to 3 research prerequisites)
        shipRequirements[ShipType.SmallCargo] = ShipRequirements({
            shipyardLevel: 2,
            researchReq1: ResearchType.COMBUSTION_DRIVE,
            researchLevel1: 2,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.LargeCargo] = ShipRequirements({
            shipyardLevel: 4,
            researchReq1: ResearchType.COMBUSTION_DRIVE,
            researchLevel1: 6,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.LightFighter] = ShipRequirements({
            shipyardLevel: 1,
            researchReq1: ResearchType.COMBUSTION_DRIVE,
            researchLevel1: 1,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.HeavyFighter] = ShipRequirements({
            shipyardLevel: 3,
            researchReq1: ResearchType.IMPULSE_DRIVE,
            researchLevel1: 2,
            researchReq2: ResearchType.ARMOUR_TECH,
            researchLevel2: 2,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.Cruiser] = ShipRequirements({
            shipyardLevel: 5,
            researchReq1: ResearchType.IMPULSE_DRIVE,
            researchLevel1: 4,
            researchReq2: ResearchType.ION_TECH,
            researchLevel2: 2,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.Battleship] = ShipRequirements({
            shipyardLevel: 7,
            researchReq1: ResearchType.HYPERSPACE_DRIVE,
            researchLevel1: 4,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.Battlecruiser] = ShipRequirements({
            shipyardLevel: 8,
            researchReq1: ResearchType.HYPERSPACE_DRIVE,
            researchLevel1: 5,
            researchReq2: ResearchType.HYPERSPACE_TECH,
            researchLevel2: 5,
            researchReq3: ResearchType.LASER_TECH,
            researchLevel3: 12
        });

        shipRequirements[ShipType.Bomber] = ShipRequirements({
            shipyardLevel: 8,
            researchReq1: ResearchType.IMPULSE_DRIVE,
            researchLevel1: 6,
            researchReq2: ResearchType.PLASMA_TECH,
            researchLevel2: 5,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.Destroyer] = ShipRequirements({
            shipyardLevel: 9,
            researchReq1: ResearchType.HYPERSPACE_DRIVE,
            researchLevel1: 6,
            researchReq2: ResearchType.HYPERSPACE_TECH,
            researchLevel2: 5,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.ColonyShip] = ShipRequirements({
            shipyardLevel: 4,
            researchReq1: ResearchType.IMPULSE_DRIVE,
            researchLevel1: 3,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.Recycler] = ShipRequirements({
            shipyardLevel: 4,
            researchReq1: ResearchType.COMBUSTION_DRIVE,
            researchLevel1: 6,
            researchReq2: ResearchType.SHIELDING_TECH,
            researchLevel2: 2,
            researchReq3: ResearchType.NONE,
            researchLevel3: 0
        });

        shipRequirements[ShipType.Crawler] = ShipRequirements({
            shipyardLevel: 5,
            researchReq1: ResearchType.COMBUSTION_DRIVE,
            researchLevel1: 4,
            researchReq2: ResearchType.ARMOUR_TECH,
            researchLevel2: 4,
            researchReq3: ResearchType.LASER_TECH,
            researchLevel3: 4
        });

        // Advantage values (ship-vs-ship only, from design doc)
        // All ships vs Crawler: 5
        _advantage[ShipType.SmallCargo][ShipType.Crawler] = 5;
        _advantage[ShipType.LargeCargo][ShipType.Crawler] = 5;
        _advantage[ShipType.LightFighter][ShipType.Crawler] = 5;
        _advantage[ShipType.HeavyFighter][ShipType.Crawler] = 5;
        _advantage[ShipType.Cruiser][ShipType.Crawler] = 5;
        _advantage[ShipType.Battleship][ShipType.Crawler] = 5;
        _advantage[ShipType.Battlecruiser][ShipType.Crawler] = 5;
        _advantage[ShipType.Bomber][ShipType.Crawler] = 5;
        _advantage[ShipType.Destroyer][ShipType.Crawler] = 5;
        _advantage[ShipType.ColonyShip][ShipType.Crawler] = 5;
        _advantage[ShipType.Recycler][ShipType.Crawler] = 5;

        // HeavyFighter advantages
        _advantage[ShipType.HeavyFighter][ShipType.SmallCargo] = 3;

        // Cruiser advantages
        _advantage[ShipType.Cruiser][ShipType.LightFighter] = 6;

        // Battlecruiser advantages
        _advantage[ShipType.Battlecruiser][ShipType.SmallCargo] = 3;
        _advantage[ShipType.Battlecruiser][ShipType.LargeCargo] = 3;
        _advantage[ShipType.Battlecruiser][ShipType.HeavyFighter] = 4;
        _advantage[ShipType.Battlecruiser][ShipType.Cruiser] = 4;
        _advantage[ShipType.Battlecruiser][ShipType.Battleship] = 7;

        // Destroyer advantages
        _advantage[ShipType.Destroyer][ShipType.Battlecruiser] = 2;

        // Defense configurations from design document
        defenseConfigs[DefenseType.RocketLauncher] = DefenseConfig({
            cost: Cost(2000, 0, 0),
            structuralIntegrity: 2000,
            shieldPower: 20,
            weaponPower: 80,
            limit: 0
        });

        defenseConfigs[DefenseType.LightLaser] = DefenseConfig({
            cost: Cost(1500, 500, 0),
            structuralIntegrity: 2000,
            shieldPower: 25,
            weaponPower: 100,
            limit: 0
        });

        defenseConfigs[DefenseType.HeavyLaser] = DefenseConfig({
            cost: Cost(6000, 2000, 0),
            structuralIntegrity: 8000,
            shieldPower: 100,
            weaponPower: 250,
            limit: 0
        });

        defenseConfigs[DefenseType.IonCannon] = DefenseConfig({
            cost: Cost(5000, 3000, 0),
            structuralIntegrity: 8000,
            shieldPower: 500,
            weaponPower: 150,
            limit: 0
        });

        defenseConfigs[DefenseType.GaussCannon] = DefenseConfig({
            cost: Cost(20000, 15000, 2000),
            structuralIntegrity: 35000,
            shieldPower: 200,
            weaponPower: 1100,
            limit: 0
        });

        defenseConfigs[DefenseType.PlasmaTurret] = DefenseConfig({
            cost: Cost(50000, 50000, 30000),
            structuralIntegrity: 100000,
            shieldPower: 300,
            weaponPower: 3000,
            limit: 0
        });

        defenseConfigs[DefenseType.SmallShieldDome] = DefenseConfig({
            cost: Cost(10000, 10000, 0),
            structuralIntegrity: 20000,
            shieldPower: 2000,
            weaponPower: 1,
            limit: 1
        });

        defenseConfigs[DefenseType.LargeShieldDome] = DefenseConfig({
            cost: Cost(50000, 50000, 0),
            structuralIntegrity: 100000,
            shieldPower: 10000,
            weaponPower: 1,
            limit: 1
        });

        // Defense requirements (shipyard level + up to 2 research prerequisites)
        defenseRequirements[DefenseType.RocketLauncher] = DefenseRequirements({
            shipyardLevel: 1,
            researchReq1: ResearchType.NONE,
            researchLevel1: 0,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0
        });

        defenseRequirements[DefenseType.LightLaser] = DefenseRequirements({
            shipyardLevel: 2,
            researchReq1: ResearchType.LASER_TECH,
            researchLevel1: 3,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0
        });

        defenseRequirements[DefenseType.HeavyLaser] = DefenseRequirements({
            shipyardLevel: 4,
            researchReq1: ResearchType.LASER_TECH,
            researchLevel1: 6,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0
        });

        defenseRequirements[DefenseType.IonCannon] = DefenseRequirements({
            shipyardLevel: 4,
            researchReq1: ResearchType.ION_TECH,
            researchLevel1: 4,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0
        });

        defenseRequirements[DefenseType.GaussCannon] = DefenseRequirements({
            shipyardLevel: 6,
            researchReq1: ResearchType.WEAPON_TECH,
            researchLevel1: 3,
            researchReq2: ResearchType.SHIELDING_TECH,
            researchLevel2: 1
        });

        defenseRequirements[DefenseType.PlasmaTurret] = DefenseRequirements({
            shipyardLevel: 8,
            researchReq1: ResearchType.PLASMA_TECH,
            researchLevel1: 7,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0
        });

        defenseRequirements[DefenseType.SmallShieldDome] = DefenseRequirements({
            shipyardLevel: 1,
            researchReq1: ResearchType.SHIELDING_TECH,
            researchLevel1: 2,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0
        });

        defenseRequirements[DefenseType.LargeShieldDome] = DefenseRequirements({
            shipyardLevel: 6,
            researchReq1: ResearchType.SHIELDING_TECH,
            researchLevel1: 6,
            researchReq2: ResearchType.NONE,
            researchLevel2: 0
        });

        // Ship-vs-Defense advantage values (from design doc)
        // Cruiser vs RocketLauncher: 10
        _shipVsDefenseAdvantage[ShipType.Cruiser][DefenseType.RocketLauncher] = 10;

        // Destroyer vs LightLaser: 10
        _shipVsDefenseAdvantage[ShipType.Destroyer][DefenseType.LightLaser] = 10;

        // Bomber advantages against defenses
        _shipVsDefenseAdvantage[ShipType.Bomber][DefenseType.RocketLauncher] = 20;
        _shipVsDefenseAdvantage[ShipType.Bomber][DefenseType.LightLaser] = 20;
        _shipVsDefenseAdvantage[ShipType.Bomber][DefenseType.HeavyLaser] = 10;
        _shipVsDefenseAdvantage[ShipType.Bomber][DefenseType.IonCannon] = 10;
        _shipVsDefenseAdvantage[ShipType.Bomber][DefenseType.GaussCannon] = 5;
        _shipVsDefenseAdvantage[ShipType.Bomber][DefenseType.PlasmaTurret] = 5;
    }

    /**
     * @notice Get starting resources for new players
     */
    function getStartingResources() external view returns (Cost memory) {
        return _startingResources;
    }

    /**
     * @notice Calculate upgrade cost for a building
     * @param buildingType The building type
     * @param currentLevel Current building level (0-indexed)
     * @return Cost structure with titanium, helium3, darkMatter
     */
    function getUpgradeCost(BuildingType buildingType, uint8 currentLevel)
        external
        view
        returns (Cost memory)
    {
        BuildingConfig memory config = buildingConfigs[buildingType];

        // Cost = baseCost * (multiplier/100) ^ level
        uint256 multiplier = _pow(config.costMultiplier, currentLevel);

        return Cost({
            titanium: (config.baseCost.titanium * multiplier) / _pow(100, currentLevel),
            helium3: (config.baseCost.helium3 * multiplier) / _pow(100, currentLevel),
            darkMatter: (config.baseCost.darkMatter * multiplier) / _pow(100, currentLevel)
        });
    }

    /**
     * @notice Calculate production rate for resource buildings
     * @param buildingType The building type
     * @param level Building level
     * @return Production per hour
     */
    function getProduction(BuildingType buildingType, uint8 level)
        external
        view
        returns (uint256)
    {
        if (level == 0) return 0;

        BuildingConfig memory config = buildingConfigs[buildingType];

        // Production = baseProduction * level * (multiplier/100) ^ level
        uint256 multiplier = _pow(config.productionMultiplier, level);
        return (config.baseProduction * level * multiplier) / _pow(100, level);
    }

    /**
     * @notice Calculate storage capacity for storage buildings
     */
    function getStorageCapacity(BuildingType buildingType, uint8 level)
        external
        view
        returns (uint256)
    {
        if (level == 0) return 0;

        BuildingConfig memory config = buildingConfigs[buildingType];

        uint256 multiplier = _pow(config.capacityMultiplier, level);
        return (config.baseCapacity * multiplier) / _pow(100, level);
    }

    /**
     * @notice Calculate build time for upgrades
     */
    function getBuildTime(BuildingType buildingType, uint8 currentLevel)
        external
        view
        returns (uint256)
    {
        // Formula: totalCost / 25
        Cost memory cost = this.getUpgradeCost(buildingType, currentLevel);
        uint256 totalCost = cost.titanium + cost.helium3 + cost.darkMatter;

        return totalCost / 25;
    }

    /**
     * @notice Update building config (owner only, for game balancing)
     */
    function updateBuildingConfig(
        BuildingType buildingType,
        BuildingConfig memory newConfig
    ) external onlyOwner {
        buildingConfigs[buildingType] = newConfig;
    }

    /**
     * @notice Update speed factor (owner only, for game balancing)
     */
    function setSpeedFactor(uint256 _speedFactor) external onlyOwner {
        require(_speedFactor > 0, "Speed factor must be positive");
        speedFactor = _speedFactor;
    }

    /**
     * @notice Update raid loot percentage cap (owner only, for game balancing)
     */
    function setRaidLootPercentage(uint256 _raidLootPercentage) external onlyOwner {
        require(_raidLootPercentage > 0 && _raidLootPercentage <= 100, "Percentage must be 1-100");
        raidLootPercentage = _raidLootPercentage;
    }

    /**
     * @notice Get ship cost
     * @param shipType The ship type
     * @return Cost structure with titanium, helium3, darkMatter
     */
    function getShipCost(ShipType shipType)
        external
        view
        returns (Cost memory)
    {
        return shipConfigs[shipType].cost;
    }

    /**
     * @notice Calculate ship build time based on quantity and shipyard level
     * @param shipType The ship type
     * @param quantity Number of ships to build
     * @param shipyardLevel Current shipyard level
     * @return Build time in seconds
     */
    function getShipBuildTime(ShipType shipType, uint256 quantity, uint8 shipyardLevel)
        external
        view
        returns (uint256)
    {
        require(shipyardLevel > 0, "Shipyard required");
        ShipConfig memory config = shipConfigs[shipType];

        // Formula: totalCost / (25 * (1 + shipyardLevel))
        // Higher shipyard level = faster build time
        uint256 totalCost = (config.cost.titanium + config.cost.helium3 + config.cost.darkMatter) * quantity;
        return totalCost / (25 * (1 + uint256(shipyardLevel)));
    }

    /**
     * @notice Get complete ship configuration
     * @param shipType The ship type
     * @return ShipConfig structure
     */
    function getShipConfig(ShipType shipType)
        external
        view
        returns (ShipConfig memory)
    {
        return shipConfigs[shipType];
    }

    /**
     * @notice Get ship requirements
     * @param shipType The ship type
     * @return ShipRequirements structure
     */
    function getShipRequirements(ShipType shipType)
        external
        view
        returns (ShipRequirements memory)
    {
        return shipRequirements[shipType];
    }

    /**
     * @notice Get advantage value for attacker vs target
     * @return Advantage value (0 = no advantage)
     */
    function getAdvantage(ShipType attacker, ShipType target)
        external
        view
        returns (uint8)
    {
        return _advantage[attacker][target];
    }

    /**
     * @notice Get all advantage values for one attacker type
     * @return Array of advantage values indexed by target ShipType (0-12)
     */
    function getAdvantageRow(ShipType attacker)
        external
        view
        returns (uint8[13] memory)
    {
        uint8[13] memory row;
        for (uint8 i = 0; i < 13; i++) {
            row[i] = _advantage[attacker][ShipType(i)];
        }
        return row;
    }

    // ============ DEFENSE FUNCTIONS ============

    /**
     * @notice Get defense cost
     */
    function getDefenseCost(DefenseType defenseType) external view returns (Cost memory) {
        return defenseConfigs[defenseType].cost;
    }

    /**
     * @notice Get complete defense configuration
     */
    function getDefenseConfig(DefenseType defenseType) external view returns (DefenseConfig memory) {
        return defenseConfigs[defenseType];
    }

    /**
     * @notice Get defense requirements
     */
    function getDefenseRequirements(DefenseType defenseType) external view returns (DefenseRequirements memory) {
        return defenseRequirements[defenseType];
    }

    /**
     * @notice Calculate defense build time based on quantity and shipyard level
     */
    function getDefenseBuildTime(DefenseType defenseType, uint256 quantity, uint8 shipyardLevel)
        external view returns (uint256)
    {
        require(shipyardLevel > 0, "Shipyard required");
        DefenseConfig memory config = defenseConfigs[defenseType];
        uint256 totalCost = (config.cost.titanium + config.cost.helium3 + config.cost.darkMatter) * quantity;
        return totalCost / (25 * (1 + uint256(shipyardLevel)));
    }

    /**
     * @notice Get combat stats for a defense type with research bonuses applied
     */
    function getDefenseCombatStats(
        DefenseType defenseType,
        uint8 weaponTechLevel,
        uint8 shieldingTechLevel,
        uint8 armourTechLevel
    ) external view returns (CombatStats memory) {
        DefenseConfig memory config = defenseConfigs[defenseType];
        return CombatStats({
            weaponPower: uint256(config.weaponPower) * (100 + uint256(weaponTechLevel) * 10) / 100,
            shieldPower: uint256(config.shieldPower) * (100 + uint256(shieldingTechLevel) * 10) / 100,
            structuralIntegrity: uint256(config.structuralIntegrity) * (100 + uint256(armourTechLevel) * 10) / 100
        });
    }

    /**
     * @notice Get ship-vs-defense advantage value
     */
    function getShipVsDefenseAdvantage(ShipType attacker, DefenseType target) external view returns (uint8) {
        return _shipVsDefenseAdvantage[attacker][target];
    }

    /**
     * @notice Get all ship-vs-defense advantage values for one attacker type
     * @return Array of advantage values indexed by target DefenseType (0-8)
     */
    function getShipVsDefenseAdvantageRow(ShipType attacker) external view returns (uint8[9] memory) {
        uint8[9] memory row;
        for (uint8 i = 0; i < 9; i++) {
            row[i] = _shipVsDefenseAdvantage[attacker][DefenseType(i)];
        }
        return row;
    }

    /**
     * @notice Update ship config (owner only, for game balancing)
     */
    function updateShipConfig(
        ShipType shipType,
        ShipConfig memory newConfig
    ) external onlyOwner {
        shipConfigs[shipType] = newConfig;
    }

    /**
     * @notice Calculate travel time using OGame-style formula
     * @param origin The origin coordinates [galaxy, system, position]
     * @param destination The destination coordinates [galaxy, system, position]
     * @param slowestSpeed The speed of the slowest ship in the fleet
     * @return Travel time in seconds
     * @dev Distance is hierarchical (only highest-tier coordinate difference matters):
     *   - Same system: 1000 + 5 * |pos2 - pos1|
     *   - Same galaxy, different system: 2700 + 95 * |sys2 - sys1|
     *   - Different galaxy: 20000 * |gal2 - gal1|
     * Flight time = 10 + 35000 * sqrt(distance * 10 / speed) / speedFactor
     */
    /**
     * @notice Calculate distance between two coordinates using OGame hierarchical formula
     * @param origin The origin coordinates [galaxy, system, position]
     * @param destination The destination coordinates [galaxy, system, position]
     * @return distance The calculated distance
     */
    function calculateDistance(
        uint16[3] memory origin,
        uint16[3] memory destination
    ) public pure returns (uint256 distance) {
        if (origin[0] != destination[0]) {
            uint16 diff = origin[0] > destination[0] ? origin[0] - destination[0] : destination[0] - origin[0];
            distance = uint256(diff) * 20000;
        } else if (origin[1] != destination[1]) {
            uint16 diff = origin[1] > destination[1] ? origin[1] - destination[1] : destination[1] - origin[1];
            distance = 2700 + uint256(diff) * 95;
        } else {
            uint16 diff = origin[2] > destination[2] ? origin[2] - destination[2] : destination[2] - origin[2];
            distance = 1000 + uint256(diff) * 5;
        }
    }

    function calculateTravelTime(
        uint16[3] memory origin,
        uint16[3] memory destination,
        uint32 slowestSpeed
    ) external view returns (uint32) {
        uint256 distance = calculateDistance(origin, destination);

        // OGame flight time: 10 + 35000 * sqrt(distance * 10 / speed) / speedFactor
        uint256 SCALE = 1e8;
        uint256 innerScaled = (distance * 10 * SCALE) / uint256(slowestSpeed);
        uint256 sqrtResult = Math.sqrt(innerScaled);
        uint256 time = 10 + (35000 * sqrtResult) / (speedFactor * 1e4);

        return uint32(time);
    }

    /**
     * @notice Calculate total fuel (Helium-3) consumption for a fleet over a given distance
     * @param ships Array of ship counts indexed by ShipType
     * @param distance The travel distance (from calculateDistance)
     * @return totalFuel Total fuel consumed in Helium-3 units
     * @dev OGame formula at 100% speed: fuelPerShip = 1 + (baseFuel * distance * 4) / 35000
     */
    function calculateFleetFuelConsumption(
        uint256[13] memory ships,
        uint256 distance
    ) external view returns (uint256 totalFuel) {
        for (uint8 i = 1; i < 13; i++) {
            if (ships[i] > 0) {
                uint16 baseFuel = shipConfigs[ShipType(i)].fuelConsumption;
                if (baseFuel > 0) {
                    uint256 fuelPerShip = 1 + (uint256(baseFuel) * distance * 4) / 35000;
                    totalFuel += ships[i] * fuelPerShip;
                }
            }
        }
    }

    /**
     * @notice Get the slowest ship speed from a ship composition
     * @param ships Array of ship counts indexed by ShipType
     * @return The speed of the slowest ship type that has at least one ship
     */
    function getSlowestSpeed(uint256[13] memory ships) external view returns (uint32) {
        uint32 slowest = type(uint32).max;
        for (uint8 i = 1; i < 13; i++) {
            if (ships[i] > 0) {
                uint32 speed = shipConfigs[ShipType(i)].speed;
                if (speed < slowest) {
                    slowest = speed;
                }
            }
        }
        require(slowest != type(uint32).max, "No ships in fleet");
        return slowest;
    }

    /**
     * @notice Calculate total cargo capacity for a fleet
     * @param ships Array of ship counts indexed by ShipType
     * @return Total cargo capacity
     */
    function getTotalCargoCapacity(uint256[13] memory ships) external view returns (uint256) {
        uint256 total = 0;
        for (uint8 i = 1; i < 13; i++) {
            if (ships[i] > 0) {
                total += ships[i] * uint256(shipConfigs[ShipType(i)].cargoCapacity);
            }
        }
        return total;
    }

    // ============ OUTPOST FUNCTIONS ============

    /**
     * @notice Get outpost configuration
     * @param outpostType The outpost type
     * @return OutpostConfig structure
     */
    function getOutpostConfig(OutpostType outpostType)
        external
        view
        returns (OutpostConfig memory)
    {
        return outpostConfigs[outpostType];
    }

    /**
     * @notice Get outpost production rate
     * @param outpostType The outpost type
     * @return Production rate per hour
     */
    function getOutpostProduction(OutpostType outpostType)
        external
        view
        returns (uint256)
    {
        return outpostConfigs[outpostType].productionRate;
    }

    /**
     * @notice Get outpost storage capacity
     * @param outpostType The outpost type
     * @return Storage capacity
     */
    function getOutpostStorageCap(OutpostType outpostType)
        external
        view
        returns (uint256)
    {
        return outpostConfigs[outpostType].storageCap;
    }

    /**
     * @notice Get outpost type for a given position
     * @param position The position in the system (1-15)
     * @return The outpost type (NONE for positions 1-10)
     */
    function getOutpostTypeForPosition(uint16 position) external pure returns (OutpostType) {
        if (position == 11) return OutpostType.TITANIUM_MINE;
        if (position == 12) return OutpostType.TITANIUM_MINE;
        if (position == 13) return OutpostType.HELIUM3_LAB;
        if (position == 14) return OutpostType.HELIUM3_LAB;
        if (position == 15) return OutpostType.DARKMATTER_REFINERY;
        return OutpostType.NONE;
    }

    // ============ RESEARCH FUNCTIONS ============

    /**
     * @notice Calculate research cost for a given research type and current level
     * @param researchType The research type
     * @param currentLevel Current research level (0-indexed)
     * @return Cost structure with titanium, helium3, darkMatter
     */
    function getResearchCost(ResearchType researchType, uint8 currentLevel)
        external
        view
        returns (Cost memory)
    {
        ResearchConfig memory config = researchConfigs[researchType];

        // Cost = baseCost * (multiplier/100) ^ level
        uint256 multiplier = _pow(config.costMultiplier, currentLevel);

        return Cost({
            titanium: (config.baseCost.titanium * multiplier) / _pow(100, currentLevel),
            helium3: (config.baseCost.helium3 * multiplier) / _pow(100, currentLevel),
            darkMatter: (config.baseCost.darkMatter * multiplier) / _pow(100, currentLevel)
        });
    }

    /**
     * @notice Calculate research time based on cost and Research Node level
     * @param researchType The research type
     * @param currentLevel Current research level
     * @param researchNodeLevel Current Research Node building level
     * @return Research time in seconds (minimum 60)
     */
    function getResearchTime(ResearchType researchType, uint8 currentLevel, uint8 researchNodeLevel)
        external
        view
        returns (uint256)
    {
        require(researchNodeLevel > 0, "Research Node required");
        Cost memory cost = this.getResearchCost(researchType, currentLevel);

        // baseTime = (titanium + helium3) * 3600 / 10000
        uint256 baseTime = (cost.titanium + cost.helium3) * 3600 / 10000;

        // nodeReduction = 1 + researchNodeLevel * 0.3 = (10 + researchNodeLevel * 3) / 10
        uint256 time = baseTime * 10 / (10 + uint256(researchNodeLevel) * 3);

        return time < 60 ? 60 : time;
    }

    /**
     * @notice Get research configuration
     * @param researchType The research type
     * @return ResearchConfig structure
     */
    function getResearchConfig(ResearchType researchType)
        external
        view
        returns (ResearchConfig memory)
    {
        return researchConfigs[researchType];
    }

    // ============ RESEARCH BONUS FUNCTIONS ============

    /**
     * @notice Get the drive type for a ship
     * @param shipType The ship type
     * @return The drive type used by this ship
     */
    function getShipDriveType(ShipType shipType) external pure returns (DriveType) {
        return _getShipDriveType(shipType);
    }

    function _getShipDriveType(ShipType shipType) internal pure returns (DriveType) {
        if (shipType == ShipType.SmallCargo) return DriveType.COMBUSTION;
        if (shipType == ShipType.LargeCargo) return DriveType.COMBUSTION;
        if (shipType == ShipType.LightFighter) return DriveType.COMBUSTION;
        if (shipType == ShipType.HeavyFighter) return DriveType.IMPULSE;
        if (shipType == ShipType.Cruiser) return DriveType.IMPULSE;
        if (shipType == ShipType.Battleship) return DriveType.HYPERSPACE;
        if (shipType == ShipType.Battlecruiser) return DriveType.HYPERSPACE;
        if (shipType == ShipType.Bomber) return DriveType.IMPULSE;
        if (shipType == ShipType.Destroyer) return DriveType.HYPERSPACE;
        if (shipType == ShipType.ColonyShip) return DriveType.COMBUSTION;
        if (shipType == ShipType.Recycler) return DriveType.COMBUSTION;
        return DriveType.NONE; // Crawler and NONE
    }

    function _applyDriveBonus(
        ShipType shipType,
        uint32 baseSpeed,
        uint8 combustionLevel,
        uint8 impulseLevel,
        uint8 hyperspaceLevel
    ) internal pure returns (uint32) {
        DriveType drive = _getShipDriveType(shipType);
        if (drive == DriveType.COMBUSTION) {
            return uint32(uint256(baseSpeed) * (100 + uint256(combustionLevel) * 10) / 100);
        } else if (drive == DriveType.IMPULSE) {
            return uint32(uint256(baseSpeed) * (100 + uint256(impulseLevel) * 20) / 100);
        } else if (drive == DriveType.HYPERSPACE) {
            return uint32(uint256(baseSpeed) * (100 + uint256(hyperspaceLevel) * 30) / 100);
        }
        return baseSpeed;
    }

    /**
     * @notice Get the slowest ship speed with drive research bonuses applied
     * @param ships Array of ship counts indexed by ShipType
     * @param combustionLevel Player's Combustion Drive research level
     * @param impulseLevel Player's Impulse Drive research level
     * @param hyperspaceLevel Player's Hyperspace Drive research level
     * @return The effective speed of the slowest ship type
     */
    function getSlowestSpeedWithResearch(
        uint256[13] memory ships,
        uint8 combustionLevel,
        uint8 impulseLevel,
        uint8 hyperspaceLevel
    ) external view returns (uint32) {
        uint32 slowest = type(uint32).max;
        for (uint8 i = 1; i < 13; i++) {
            if (ships[i] > 0) {
                uint32 baseSpeed = shipConfigs[ShipType(i)].speed;
                if (baseSpeed == 0) continue; // Crawler - skip
                uint32 boostedSpeed = _applyDriveBonus(ShipType(i), baseSpeed, combustionLevel, impulseLevel, hyperspaceLevel);
                if (boostedSpeed < slowest) {
                    slowest = boostedSpeed;
                }
            }
        }
        require(slowest != type(uint32).max, "No ships in fleet");
        return slowest;
    }

    /**
     * @notice Calculate total cargo capacity with Hyperspace Technology bonus
     * @param ships Array of ship counts indexed by ShipType
     * @param hyperspaceTechLevel Player's Hyperspace Technology research level
     * @return Total boosted cargo capacity
     */
    function getTotalCargoCapacityWithResearch(
        uint256[13] memory ships,
        uint8 hyperspaceTechLevel
    ) external view returns (uint256) {
        uint256 total = 0;
        for (uint8 i = 1; i < 13; i++) {
            if (ships[i] > 0) {
                uint256 baseCargo = uint256(shipConfigs[ShipType(i)].cargoCapacity);
                uint256 boosted = baseCargo * (100 + uint256(hyperspaceTechLevel) * 5) / 100;
                total += ships[i] * boosted;
            }
        }
        return total;
    }

    /**
     * @notice Get combat stats for a ship type with research bonuses applied
     * @param shipType The ship type
     * @param weaponTechLevel Player's Weapon Technology level
     * @param shieldingTechLevel Player's Shielding Technology level
     * @param armourTechLevel Player's Armour Technology level
     * @return CombatStats with boosted values
     */
    function getShipCombatStats(
        ShipType shipType,
        uint8 weaponTechLevel,
        uint8 shieldingTechLevel,
        uint8 armourTechLevel
    ) external view returns (CombatStats memory) {
        ShipConfig memory config = shipConfigs[shipType];
        return CombatStats({
            weaponPower: uint256(config.weaponPower) * (100 + uint256(weaponTechLevel) * 10) / 100,
            shieldPower: uint256(config.shieldPower) * (100 + uint256(shieldingTechLevel) * 10) / 100,
            structuralIntegrity: uint256(config.structuralIntegrity) * (100 + uint256(armourTechLevel) * 10) / 100
        });
    }

    /**
     * @notice Get maximum number of colonies allowed based on Astrophysics level
     * @param astrophysicsLevel Player's Astrophysics research level
     * @return Maximum number of additional colonies (not counting starter planet)
     */
    function getMaxColonies(uint8 astrophysicsLevel) external pure returns (uint256) {
        return uint256(astrophysicsLevel) / 2;
    }

    // Helper: Integer power function
    function _pow(uint256 base, uint256 exponent) private pure returns (uint256) {
        if (exponent == 0) return 1;

        uint256 result = base;
        for (uint256 i = 1; i < exponent; i++) {
            result = result * base;
        }
        return result;
    }
}
