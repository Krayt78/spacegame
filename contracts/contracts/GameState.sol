// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./GameConfig.sol";

/**
 * @title GameState
 * @notice Centralized storage contract for Nexus Protocol
 * @dev Holds all game state with access-controlled setters for manager contracts
 */
contract GameState is Ownable {

    // Maximum number of ship types (for fixed-size arrays)
    uint256 public constant MAX_SHIP_TYPES = 13;

    // Maximum number of defense types (for fixed-size arrays)
    uint256 public constant MAX_DEFENSE_TYPES = 9;

    // ============ ENUMS ============

    enum FleetMission { NONE, RAID, CAPTURE, MOVE, COLONIZE }
    enum FleetStatus { NONE, TRAVELING, RETURNING }

    // ============ STRUCTS ============

    struct Planet {
        address owner;
        uint16[3] coordinates; // [galaxy, system, position]
        string name;
        uint32 createdAt;
        bool exists;
    }

    struct Buildings {
        uint8 titaniumExtractor;
        uint8 helium3Harvester;
        uint8 darkMatterCollector;
        uint8 titaniumVault;
        uint8 helium3Tank;
        uint8 darkMatterContainment;
        uint8 shipyard;
        uint8 researchNode;
        uint8 undergroundBunker;
    }

    struct Resources {
        uint256 titanium;
        uint256 helium3;
        uint256 darkMatter;
        uint32 lastClaimed;
    }

    struct BuildQueue {
        GameConfig.BuildingType buildingType;
        uint8 targetLevel;
        uint32 completionTime;
    }

    struct ShipQueue {
        GameConfig.ShipType shipType;
        uint256 quantity;
        uint32 completionTime;
    }

    struct DefenseQueue {
        GameConfig.DefenseType defenseType;
        uint256 quantity;
        uint32 completionTime;
    }

    struct Fleet {
        uint256 fleetId;
        address owner;
        uint256 originPlanetId;
        uint16[3] origin;
        uint16[3] destination;
        FleetMission mission;
        FleetStatus status;
        uint32 departureTime;
        uint32 arrivalTime;
        uint32 returnTime;
        uint256[MAX_SHIP_TYPES] ships;
        uint256 cargoTitanium;
        uint256 cargoHelium3;
        uint256 cargoDarkMatter;
    }

    struct RaiderOutpost {
        address owner;
        GameConfig.OutpostType outpostType;
        uint32 lastCollected;
        uint256 storedResources;
    }

    struct BattleReport {
        uint256 reportId;
        uint32 timestamp;
        address attacker;
        address defender;
        uint16[3] location;
        FleetMission mission;
        bool attackerWon;
        uint256[MAX_SHIP_TYPES] attackerInitial;
        uint256[MAX_SHIP_TYPES] attackerLosses;
        uint256[MAX_SHIP_TYPES] defenderInitial;
        uint256[MAX_SHIP_TYPES] defenderLosses;
        uint256[MAX_DEFENSE_TYPES] defenderDefensesInitial;
        uint256[MAX_DEFENSE_TYPES] defenderDefensesLosses;
        uint256 lootTitanium;
        uint256 lootHelium3;
        uint256 lootDarkMatter;
    }

    struct ResearchLevels {
        uint8 combustionDrive;     // was impulseDrive
        uint8 impulseDrive;        // was warpDrive
        uint8 hyperspaceDrive;     // was quantumShiftDrive
        uint8 weaponTech;          // was offensiveSystems
        uint8 shieldingTech;       // was defensiveArrays
        uint8 armourTech;          // was hullReinforcement
        uint8 computerTech;        // was aiCommandNetworks
        uint8 stealthSystems;      // kept
        uint8 ionTech;             // NEW
        uint8 hyperspaceTech;      // NEW
        uint8 laserTech;           // NEW
        uint8 plasmaTech;          // NEW
        uint8 astrophysics;        // NEW - colony slots
    }

    struct ResearchQueue {
        GameConfig.ResearchType researchType;
        uint8 targetLevel;
        uint32 completionTime;
    }

    // ============ STORAGE ============

    uint256 public nextPlanetId = 1;
    uint256 public nextFleetId = 1;

    // Planet storage
    mapping(uint256 => Planet) internal _planets;
    mapping(uint256 => Buildings) internal _planetBuildings;
    mapping(uint256 => Resources) internal _planetResources;
    mapping(uint256 => BuildQueue) internal _buildQueues;
    mapping(address => uint256) internal _playerPlanet; // starter planet (backwards compat)
    mapping(address => uint256[]) internal _playerPlanets; // all planets owned by player
    mapping(uint16 => mapping(uint16 => mapping(uint16 => uint256))) internal _coordinateToPlanet;

    // Ship storage
    mapping(uint256 => uint256[MAX_SHIP_TYPES]) internal _planetShips;
    mapping(uint256 => ShipQueue) internal _shipQueues;

    // Defense storage
    mapping(uint256 => uint256[MAX_DEFENSE_TYPES]) internal _planetDefenses;
    mapping(uint256 => DefenseQueue) internal _defenseQueues;

    // Fleet storage
    mapping(uint256 => Fleet) internal _fleets;
    mapping(address => uint256[]) internal _playerFleets;

    // Stationed ships at coordinates (for outposts)
    mapping(uint16 => mapping(uint16 => mapping(uint16 => uint256[MAX_SHIP_TYPES]))) internal _stationedShips;

    // Raider outposts
    mapping(uint16 => mapping(uint16 => mapping(uint16 => RaiderOutpost))) internal _raiderOutposts;

    // Player outpost tracking (reverse mapping: player → outpost coordinates)
    mapping(address => uint16[3][]) internal _playerOutposts;

    // Battle reports
    uint256 public nextReportId = 1;
    mapping(uint256 => BattleReport) internal _battleReports;
    mapping(address => uint256[]) internal _playerReports;

    // Research storage (per-player, not per-planet)
    mapping(address => ResearchLevels) internal _playerResearch;
    mapping(address => ResearchQueue) internal _researchQueues;

    // ============ ACCESS CONTROL ============

    mapping(address => bool) public authorizedManagers;

    modifier onlyManager() {
        require(authorizedManagers[msg.sender], "GameState: not authorized manager");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setManager(address manager, bool authorized) external onlyOwner {
        authorizedManagers[manager] = authorized;
    }

    // ============ PLANET GETTERS ============

    function getPlanet(uint256 planetId) external view returns (Planet memory) {
        return _planets[planetId];
    }

    function getPlanetBuildings(uint256 planetId) external view returns (Buildings memory) {
        return _planetBuildings[planetId];
    }

    function getPlanetResources(uint256 planetId) external view returns (Resources memory) {
        return _planetResources[planetId];
    }

    function getBuildQueue(uint256 planetId) external view returns (BuildQueue memory) {
        return _buildQueues[planetId];
    }

    function getPlayerPlanet(address player) external view returns (uint256) {
        return _playerPlanet[player];
    }

    function getCoordinateToPlanet(uint16 galaxy, uint16 system, uint16 position) external view returns (uint256) {
        return _coordinateToPlanet[galaxy][system][position];
    }

    function getPlayerPlanets(address player) external view returns (uint256[] memory) {
        return _playerPlanets[player];
    }

    function getPlayerPlanetCount(address player) external view returns (uint256) {
        return _playerPlanets[player].length;
    }

    function playerOwnsPlanet(address player, uint256 planetId) external view returns (bool) {
        return _planets[planetId].exists && _planets[planetId].owner == player;
    }

    function planetExists(uint256 planetId) external view returns (bool) {
        return _planets[planetId].exists;
    }

    function getPlanetOwner(uint256 planetId) external view returns (address) {
        return _planets[planetId].owner;
    }

    function getPlanetCoordinates(uint256 planetId) external view returns (uint16[3] memory) {
        return _planets[planetId].coordinates;
    }

    function getBuildingLevel(uint256 planetId, GameConfig.BuildingType buildingType) external view returns (uint8) {
        Buildings storage buildings = _planetBuildings[planetId];

        if (buildingType == GameConfig.BuildingType.TITANIUM_EXTRACTOR) return buildings.titaniumExtractor;
        if (buildingType == GameConfig.BuildingType.HELIUM3_HARVESTER) return buildings.helium3Harvester;
        if (buildingType == GameConfig.BuildingType.DARKMATTER_COLLECTOR) return buildings.darkMatterCollector;
        if (buildingType == GameConfig.BuildingType.TITANIUM_VAULT) return buildings.titaniumVault;
        if (buildingType == GameConfig.BuildingType.HELIUM3_TANK) return buildings.helium3Tank;
        if (buildingType == GameConfig.BuildingType.DARKMATTER_CONTAINMENT) return buildings.darkMatterContainment;
        if (buildingType == GameConfig.BuildingType.SHIPYARD) return buildings.shipyard;
        if (buildingType == GameConfig.BuildingType.RESEARCH_NODE) return buildings.researchNode;
        if (buildingType == GameConfig.BuildingType.UNDERGROUND_BUNKER) return buildings.undergroundBunker;

        revert("GameState: invalid building type");
    }

    // ============ SHIP GETTERS ============

    function getPlanetShips(uint256 planetId) external view returns (uint256[MAX_SHIP_TYPES] memory) {
        return _planetShips[planetId];
    }

    function getPlanetShipCount(uint256 planetId, uint8 shipType) external view returns (uint256) {
        require(shipType > 0 && shipType < MAX_SHIP_TYPES, "GameState: invalid ship type");
        return _planetShips[planetId][shipType];
    }

    function getShipQueue(uint256 planetId) external view returns (ShipQueue memory) {
        return _shipQueues[planetId];
    }

    // ============ DEFENSE GETTERS ============

    function getPlanetDefenses(uint256 planetId) external view returns (uint256[MAX_DEFENSE_TYPES] memory) {
        return _planetDefenses[planetId];
    }

    function getPlanetDefenseCount(uint256 planetId, uint8 defenseType) external view returns (uint256) {
        require(defenseType > 0 && defenseType < MAX_DEFENSE_TYPES, "GameState: invalid defense type");
        return _planetDefenses[planetId][defenseType];
    }

    function getDefenseQueue(uint256 planetId) external view returns (DefenseQueue memory) {
        return _defenseQueues[planetId];
    }

    // ============ FLEET GETTERS ============

    function getFleet(uint256 fleetId) external view returns (Fleet memory) {
        require(_fleets[fleetId].fleetId != 0, "GameState: fleet does not exist");
        return _fleets[fleetId];
    }

    function fleetExists(uint256 fleetId) external view returns (bool) {
        return _fleets[fleetId].fleetId != 0;
    }

    function getPlayerFleets(address player) external view returns (uint256[] memory) {
        return _playerFleets[player];
    }

    function getPlayerFleetCount(address player) external view returns (uint256) {
        return _playerFleets[player].length;
    }

    function getStationedShips(uint16 galaxy, uint16 system, uint16 position) external view returns (uint256[MAX_SHIP_TYPES] memory) {
        return _stationedShips[galaxy][system][position];
    }

    // ============ OUTPOST GETTERS ============

    function getRaiderOutpost(uint16 galaxy, uint16 system, uint16 position) external view returns (RaiderOutpost memory) {
        return _raiderOutposts[galaxy][system][position];
    }

    function getPlayerOutposts(address player) external view returns (uint16[3][] memory) {
        return _playerOutposts[player];
    }

    // ============ BATTLE REPORT GETTERS ============

    function getBattleReport(uint256 reportId) external view returns (BattleReport memory) {
        require(_battleReports[reportId].reportId != 0, "Report does not exist");
        return _battleReports[reportId];
    }

    function getPlayerReportIds(address player) external view returns (uint256[] memory) {
        return _playerReports[player];
    }

    function getPlayerReportCount(address player) external view returns (uint256) {
        return _playerReports[player].length;
    }

    function getPlayerRecentReports(address player, uint256 count) external view returns (uint256[] memory) {
        uint256[] storage allReports = _playerReports[player];
        uint256 total = allReports.length;
        if (count > total) count = total;

        uint256[] memory recent = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = allReports[total - 1 - i];
        }
        return recent;
    }

    // ============ PLANET SETTERS (onlyManager) ============

    function createPlanet(
        uint256 planetId,
        address owner,
        uint16[3] memory coordinates,
        string memory name
    ) external onlyManager {
        require(_coordinateToPlanet[coordinates[0]][coordinates[1]][coordinates[2]] == 0, "Coordinate already occupied");
        _planets[planetId] = Planet({
            owner: owner,
            coordinates: coordinates,
            name: name,
            createdAt: uint32(block.timestamp),
            exists: true
        });
        // Set starter planet if this is the player's first planet
        if (_playerPlanet[owner] == 0) {
            _playerPlanet[owner] = planetId;
        }
        _playerPlanets[owner].push(planetId);
        _coordinateToPlanet[coordinates[0]][coordinates[1]][coordinates[2]] = planetId;
    }

    function incrementNextPlanetId() external onlyManager returns (uint256) {
        return nextPlanetId++;
    }

    function setPlanetBuildings(uint256 planetId, Buildings memory buildings) external onlyManager {
        _planetBuildings[planetId] = buildings;
    }

    function incrementBuildingLevel(uint256 planetId, GameConfig.BuildingType buildingType) external onlyManager {
        Buildings storage buildings = _planetBuildings[planetId];

        if (buildingType == GameConfig.BuildingType.TITANIUM_EXTRACTOR) buildings.titaniumExtractor++;
        else if (buildingType == GameConfig.BuildingType.HELIUM3_HARVESTER) buildings.helium3Harvester++;
        else if (buildingType == GameConfig.BuildingType.DARKMATTER_COLLECTOR) buildings.darkMatterCollector++;
        else if (buildingType == GameConfig.BuildingType.TITANIUM_VAULT) buildings.titaniumVault++;
        else if (buildingType == GameConfig.BuildingType.HELIUM3_TANK) buildings.helium3Tank++;
        else if (buildingType == GameConfig.BuildingType.DARKMATTER_CONTAINMENT) buildings.darkMatterContainment++;
        else if (buildingType == GameConfig.BuildingType.SHIPYARD) buildings.shipyard++;
        else if (buildingType == GameConfig.BuildingType.RESEARCH_NODE) buildings.researchNode++;
        else if (buildingType == GameConfig.BuildingType.UNDERGROUND_BUNKER) buildings.undergroundBunker++;
        else revert("GameState: invalid building type");
    }

    function setPlanetResources(
        uint256 planetId,
        uint256 titanium,
        uint256 helium3,
        uint256 darkMatter,
        uint32 lastClaimed
    ) external onlyManager {
        _planetResources[planetId] = Resources({
            titanium: titanium,
            helium3: helium3,
            darkMatter: darkMatter,
            lastClaimed: lastClaimed
        });
    }

    function deductResources(
        uint256 planetId,
        uint256 titanium,
        uint256 helium3,
        uint256 darkMatter
    ) external onlyManager {
        Resources storage res = _planetResources[planetId];
        res.titanium -= titanium;
        res.helium3 -= helium3;
        res.darkMatter -= darkMatter;
    }

    function addResources(
        uint256 planetId,
        uint256 titanium,
        uint256 helium3,
        uint256 darkMatter
    ) external onlyManager {
        Resources storage res = _planetResources[planetId];
        res.titanium += titanium;
        res.helium3 += helium3;
        res.darkMatter += darkMatter;
    }

    function setBuildQueue(
        uint256 planetId,
        GameConfig.BuildingType buildingType,
        uint8 targetLevel,
        uint32 completionTime
    ) external onlyManager {
        _buildQueues[planetId] = BuildQueue({
            buildingType: buildingType,
            targetLevel: targetLevel,
            completionTime: completionTime
        });
    }

    function clearBuildQueue(uint256 planetId) external onlyManager {
        delete _buildQueues[planetId];
    }

    // ============ SHIP SETTERS (onlyManager) ============

    function addPlanetShips(uint256 planetId, uint8 shipType, uint256 quantity) external onlyManager {
        _planetShips[planetId][shipType] += quantity;
    }

    function deductPlanetShips(uint256 planetId, uint8 shipType, uint256 quantity) external onlyManager {
        require(_planetShips[planetId][shipType] >= quantity, "GameState: insufficient ships");
        _planetShips[planetId][shipType] -= quantity;
    }

    function setPlanetShips(uint256 planetId, uint256[MAX_SHIP_TYPES] memory ships) external onlyManager {
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            _planetShips[planetId][i] = ships[i];
        }
    }

    function setShipQueue(
        uint256 planetId,
        GameConfig.ShipType shipType,
        uint256 quantity,
        uint32 completionTime
    ) external onlyManager {
        _shipQueues[planetId] = ShipQueue({
            shipType: shipType,
            quantity: quantity,
            completionTime: completionTime
        });
    }

    function clearShipQueue(uint256 planetId) external onlyManager {
        delete _shipQueues[planetId];
    }

    // ============ DEFENSE SETTERS (onlyManager) ============

    function addPlanetDefenses(uint256 planetId, uint8 defenseType, uint256 quantity) external onlyManager {
        _planetDefenses[planetId][defenseType] += quantity;
    }

    function deductPlanetDefenses(uint256 planetId, uint8 defenseType, uint256 quantity) external onlyManager {
        require(_planetDefenses[planetId][defenseType] >= quantity, "GameState: insufficient defenses");
        _planetDefenses[planetId][defenseType] -= quantity;
    }

    function setPlanetDefenses(uint256 planetId, uint256[MAX_DEFENSE_TYPES] memory defenses) external onlyManager {
        for (uint8 i = 0; i < MAX_DEFENSE_TYPES; i++) {
            _planetDefenses[planetId][i] = defenses[i];
        }
    }

    function setDefenseQueue(
        uint256 planetId,
        GameConfig.DefenseType defenseType,
        uint256 quantity,
        uint32 completionTime
    ) external onlyManager {
        _defenseQueues[planetId] = DefenseQueue({
            defenseType: defenseType,
            quantity: quantity,
            completionTime: completionTime
        });
    }

    function clearDefenseQueue(uint256 planetId) external onlyManager {
        delete _defenseQueues[planetId];
    }

    // ============ FLEET SETTERS (onlyManager) ============

    function createFleet(Fleet memory fleet) external onlyManager returns (uint256) {
        uint256 fleetId = nextFleetId++;
        Fleet storage stored = _fleets[fleetId];

        stored.fleetId = fleetId;
        stored.owner = fleet.owner;
        stored.originPlanetId = fleet.originPlanetId;
        stored.origin = fleet.origin;
        stored.destination = fleet.destination;
        stored.mission = fleet.mission;
        stored.status = fleet.status;
        stored.departureTime = fleet.departureTime;
        stored.arrivalTime = fleet.arrivalTime;
        stored.returnTime = fleet.returnTime;
        stored.cargoTitanium = fleet.cargoTitanium;
        stored.cargoHelium3 = fleet.cargoHelium3;
        stored.cargoDarkMatter = fleet.cargoDarkMatter;

        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            stored.ships[i] = fleet.ships[i];
        }

        _playerFleets[fleet.owner].push(fleetId);
        return fleetId;
    }

    function updateFleetStatus(uint256 fleetId, FleetStatus status) external onlyManager {
        _fleets[fleetId].status = status;
    }

    function updateFleetReturnTime(uint256 fleetId, uint32 returnTime) external onlyManager {
        _fleets[fleetId].returnTime = returnTime;
    }

    function updateFleetCargo(
        uint256 fleetId,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) external onlyManager {
        _fleets[fleetId].cargoTitanium = cargoTitanium;
        _fleets[fleetId].cargoHelium3 = cargoHelium3;
        _fleets[fleetId].cargoDarkMatter = cargoDarkMatter;
    }

    function updateFleetShips(uint256 fleetId, uint256[MAX_SHIP_TYPES] memory ships) external onlyManager {
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            _fleets[fleetId].ships[i] = ships[i];
        }
    }

    function deleteFleet(uint256 fleetId) external onlyManager {
        address owner = _fleets[fleetId].owner;

        // Remove from playerFleets array
        uint256[] storage ids = _playerFleets[owner];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == fleetId) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                break;
            }
        }

        delete _fleets[fleetId];
    }

    // ============ STATIONED SHIPS SETTERS (onlyManager) ============

    function setStationedShips(
        uint16 galaxy,
        uint16 system,
        uint16 position,
        uint256[MAX_SHIP_TYPES] memory ships
    ) external onlyManager {
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            _stationedShips[galaxy][system][position][i] = ships[i];
        }
    }

    function addStationedShips(
        uint16 galaxy,
        uint16 system,
        uint16 position,
        uint256[MAX_SHIP_TYPES] memory ships
    ) external onlyManager {
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            _stationedShips[galaxy][system][position][i] += ships[i];
        }
    }

    // ============ OUTPOST SETTERS (onlyManager) ============

    function setRaiderOutpost(
        uint16 galaxy,
        uint16 system,
        uint16 position,
        RaiderOutpost memory outpost
    ) external onlyManager {
        _raiderOutposts[galaxy][system][position] = outpost;
    }

    function initOutpost(
        uint16 galaxy,
        uint16 system,
        uint16 position,
        GameConfig.OutpostType outpostType
    ) external onlyManager {
        RaiderOutpost storage outpost = _raiderOutposts[galaxy][system][position];
        if (outpost.outpostType == GameConfig.OutpostType.NONE) {
            outpost.outpostType = outpostType;
        }
    }

    function setOutpostOwner(
        uint16 galaxy,
        uint16 system,
        uint16 position,
        address owner,
        uint32 lastCollected
    ) external onlyManager {
        RaiderOutpost storage outpost = _raiderOutposts[galaxy][system][position];
        address previousOwner = outpost.owner;

        // Update reverse mapping: remove from previous owner
        if (previousOwner != address(0) && previousOwner != owner) {
            uint16[3][] storage prevList = _playerOutposts[previousOwner];
            for (uint256 i = 0; i < prevList.length; i++) {
                if (prevList[i][0] == galaxy && prevList[i][1] == system && prevList[i][2] == position) {
                    prevList[i] = prevList[prevList.length - 1];
                    prevList.pop();
                    break;
                }
            }
        }

        // Update reverse mapping: add to new owner
        if (owner != address(0) && previousOwner != owner) {
            _playerOutposts[owner].push([galaxy, system, position]);
        }

        outpost.owner = owner;
        outpost.lastCollected = lastCollected;
    }

    function updateOutpostResources(
        uint16 galaxy,
        uint16 system,
        uint16 position,
        uint256 storedResources,
        uint32 lastCollected
    ) external onlyManager {
        RaiderOutpost storage outpost = _raiderOutposts[galaxy][system][position];
        outpost.storedResources = storedResources;
        outpost.lastCollected = lastCollected;
    }

    function addOutpostResources(
        uint16 galaxy,
        uint16 system,
        uint16 position,
        uint256 amount
    ) external onlyManager {
        _raiderOutposts[galaxy][system][position].storedResources += amount;
    }

    function deductOutpostResources(
        uint16 galaxy,
        uint16 system,
        uint16 position,
        uint256 amount
    ) external onlyManager {
        _raiderOutposts[galaxy][system][position].storedResources -= amount;
    }

    // ============ RESEARCH GETTERS ============

    function getPlayerResearch(address player) external view returns (ResearchLevels memory) {
        return _playerResearch[player];
    }

    function getResearchQueue(address player) external view returns (ResearchQueue memory) {
        return _researchQueues[player];
    }

    function getResearchLevel(address player, GameConfig.ResearchType researchType) external view returns (uint8) {
        ResearchLevels storage research = _playerResearch[player];

        if (researchType == GameConfig.ResearchType.COMBUSTION_DRIVE) return research.combustionDrive;
        if (researchType == GameConfig.ResearchType.IMPULSE_DRIVE) return research.impulseDrive;
        if (researchType == GameConfig.ResearchType.HYPERSPACE_DRIVE) return research.hyperspaceDrive;
        if (researchType == GameConfig.ResearchType.WEAPON_TECH) return research.weaponTech;
        if (researchType == GameConfig.ResearchType.SHIELDING_TECH) return research.shieldingTech;
        if (researchType == GameConfig.ResearchType.ARMOUR_TECH) return research.armourTech;
        if (researchType == GameConfig.ResearchType.COMPUTER_TECH) return research.computerTech;
        if (researchType == GameConfig.ResearchType.STEALTH_SYSTEMS) return research.stealthSystems;
        if (researchType == GameConfig.ResearchType.ION_TECH) return research.ionTech;
        if (researchType == GameConfig.ResearchType.HYPERSPACE_TECH) return research.hyperspaceTech;
        if (researchType == GameConfig.ResearchType.LASER_TECH) return research.laserTech;
        if (researchType == GameConfig.ResearchType.PLASMA_TECH) return research.plasmaTech;
        if (researchType == GameConfig.ResearchType.ASTROPHYSICS) return research.astrophysics;

        revert("GameState: invalid research type");
    }

    // ============ RESEARCH SETTERS (onlyManager) ============

    function setResearchQueue(
        address player,
        GameConfig.ResearchType researchType,
        uint8 targetLevel,
        uint32 completionTime
    ) external onlyManager {
        _researchQueues[player] = ResearchQueue({
            researchType: researchType,
            targetLevel: targetLevel,
            completionTime: completionTime
        });
    }

    function clearResearchQueue(address player) external onlyManager {
        delete _researchQueues[player];
    }

    function incrementResearchLevel(address player, GameConfig.ResearchType researchType) external onlyManager {
        ResearchLevels storage research = _playerResearch[player];

        if (researchType == GameConfig.ResearchType.COMBUSTION_DRIVE) research.combustionDrive++;
        else if (researchType == GameConfig.ResearchType.IMPULSE_DRIVE) research.impulseDrive++;
        else if (researchType == GameConfig.ResearchType.HYPERSPACE_DRIVE) research.hyperspaceDrive++;
        else if (researchType == GameConfig.ResearchType.WEAPON_TECH) research.weaponTech++;
        else if (researchType == GameConfig.ResearchType.SHIELDING_TECH) research.shieldingTech++;
        else if (researchType == GameConfig.ResearchType.ARMOUR_TECH) research.armourTech++;
        else if (researchType == GameConfig.ResearchType.COMPUTER_TECH) research.computerTech++;
        else if (researchType == GameConfig.ResearchType.STEALTH_SYSTEMS) research.stealthSystems++;
        else if (researchType == GameConfig.ResearchType.ION_TECH) research.ionTech++;
        else if (researchType == GameConfig.ResearchType.HYPERSPACE_TECH) research.hyperspaceTech++;
        else if (researchType == GameConfig.ResearchType.LASER_TECH) research.laserTech++;
        else if (researchType == GameConfig.ResearchType.PLASMA_TECH) research.plasmaTech++;
        else if (researchType == GameConfig.ResearchType.ASTROPHYSICS) research.astrophysics++;
        else revert("GameState: invalid research type");
    }

    // ============ BATTLE REPORT SETTERS (onlyManager) ============

    function createBattleReport(BattleReport memory report) external onlyManager returns (uint256) {
        uint256 reportId = nextReportId++;
        report.reportId = reportId;

        BattleReport storage stored = _battleReports[reportId];
        stored.reportId = reportId;
        stored.timestamp = report.timestamp;
        stored.attacker = report.attacker;
        stored.defender = report.defender;
        stored.location = report.location;
        stored.mission = report.mission;
        stored.attackerWon = report.attackerWon;
        stored.lootTitanium = report.lootTitanium;
        stored.lootHelium3 = report.lootHelium3;
        stored.lootDarkMatter = report.lootDarkMatter;

        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            stored.attackerInitial[i] = report.attackerInitial[i];
            stored.attackerLosses[i] = report.attackerLosses[i];
            stored.defenderInitial[i] = report.defenderInitial[i];
            stored.defenderLosses[i] = report.defenderLosses[i];
        }

        for (uint8 i = 0; i < MAX_DEFENSE_TYPES; i++) {
            stored.defenderDefensesInitial[i] = report.defenderDefensesInitial[i];
            stored.defenderDefensesLosses[i] = report.defenderDefensesLosses[i];
        }

        _playerReports[report.attacker].push(reportId);
        if (report.defender != address(0)) {
            _playerReports[report.defender].push(reportId);
        }

        return reportId;
    }
}
