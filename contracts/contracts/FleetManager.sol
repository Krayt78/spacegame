// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GameState.sol";
import "./GameConfig.sol";

/**
 * @title FleetManager
 * @notice Manages fleet dispatch, combat resolution, and outposts
 * @dev Called by NexusGame router, writes to GameState
 */
contract FleetManager {

    GameState public immutable gameState;
    GameConfig public immutable gameConfig;
    address public immutable router;

    uint256 public constant MAX_SHIP_TYPES = 13;
    uint256 public constant MAX_DEFENSE_TYPES = 9;
    uint256 private constant ADV_PRECISION = 10000;

    // Events
    event FleetDispatched(
        uint256 indexed fleetId,
        address indexed owner,
        uint16[3] origin,
        uint16[3] destination,
        GameState.FleetMission mission,
        uint32 arrivalTime
    );

    event FleetResolved(
        uint256 indexed fleetId,
        GameState.FleetMission mission,
        bool combatOccurred,
        bool attackerWon
    );

    event FleetCompleted(
        uint256 indexed fleetId,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    );

    event OutpostCaptured(
        uint16[3] coordinates,
        address indexed previousOwner,
        address indexed newOwner
    );

    event OutpostResourcesCollected(
        uint16[3] coordinates,
        address indexed collector,
        uint256 amount
    );

    event BattleReportCreated(
        uint256 indexed reportId,
        address indexed attacker,
        address indexed defender,
        bool attackerWon
    );

    event PlanetColonized(
        address indexed player,
        uint256 indexed planetId,
        uint16[3] coordinates
    );

    event ColonizationFailed(
        uint256 indexed fleetId,
        address indexed player,
        uint16[3] destination
    );

    modifier onlyRouter() {
        require(msg.sender == router, "FleetManager: only router");
        _;
    }

    constructor(address _router, address _gameState, address _gameConfig) {
        router = _router;
        gameState = GameState(_gameState);
        gameConfig = GameConfig(_gameConfig);
    }

    // ============ RESEARCH BONUSES ============

    struct CombatResult {
        uint256[MAX_SHIP_TYPES] survivingAttackers;
        uint256[MAX_SHIP_TYPES] survivingDefenders;
        uint256[MAX_DEFENSE_TYPES] survivingDefenses;
        bool attackerWon;
    }

    struct BattleReportParams {
        address attacker;
        address defender;
        uint16[3] location;
        GameState.FleetMission mission;
        uint256[MAX_SHIP_TYPES] attackerInitial;
        uint256[MAX_SHIP_TYPES] attackerSurviving;
        uint256[MAX_SHIP_TYPES] defenderInitial;
        uint256[MAX_SHIP_TYPES] defenderSurviving;
        uint256[MAX_DEFENSE_TYPES] defenderDefensesInitial;
        uint256[MAX_DEFENSE_TYPES] defenderDefensesSurviving;
        bool attackerWon;
        uint256 lootTitanium;
        uint256 lootHelium3;
        uint256 lootDarkMatter;
    }

    struct ResearchBonuses {
        uint8 weaponTech;
        uint8 shieldingTech;
        uint8 armourTech;
        uint8 combustionDrive;
        uint8 impulseDrive;
        uint8 hyperspaceDrive;
        uint8 hyperspaceTech;
    }

    function _getResearchBonuses(address player) internal view returns (ResearchBonuses memory) {
        GameState.ResearchLevels memory r = gameState.getPlayerResearch(player);
        return ResearchBonuses({
            weaponTech: r.weaponTech,
            shieldingTech: r.shieldingTech,
            armourTech: r.armourTech,
            combustionDrive: r.combustionDrive,
            impulseDrive: r.impulseDrive,
            hyperspaceDrive: r.hyperspaceDrive,
            hyperspaceTech: r.hyperspaceTech
        });
    }

    // ============ RESOURCE HELPERS ============

    function calculateCurrentResources(uint256 planetId)
        public
        view
        returns (uint256 titanium, uint256 helium3, uint256 darkMatter)
    {
        require(gameState.planetExists(planetId), "Planet does not exist");

        GameState.Resources memory res = gameState.getPlanetResources(planetId);
        GameState.Buildings memory buildings = gameState.getPlanetBuildings(planetId);

        uint256 timeElapsed = block.timestamp - res.lastClaimed;

        uint256 titaniumProd = gameConfig.getProduction(
            GameConfig.BuildingType.TITANIUM_EXTRACTOR,
            buildings.titaniumExtractor
        );
        uint256 helium3Prod = gameConfig.getProduction(
            GameConfig.BuildingType.HELIUM3_HARVESTER,
            buildings.helium3Harvester
        );
        uint256 darkMatterProd = gameConfig.getProduction(
            GameConfig.BuildingType.DARKMATTER_COLLECTOR,
            buildings.darkMatterCollector
        );

        titanium = res.titanium + (titaniumProd * timeElapsed) / 3600;
        helium3 = res.helium3 + (helium3Prod * timeElapsed) / 3600;
        darkMatter = res.darkMatter + (darkMatterProd * timeElapsed) / 3600;

        uint256 titaniumCap = _getStorageCapacity(GameConfig.BuildingType.TITANIUM_VAULT, buildings.titaniumVault);
        uint256 helium3Cap = _getStorageCapacity(GameConfig.BuildingType.HELIUM3_TANK, buildings.helium3Tank);
        uint256 darkMatterCap = _getStorageCapacity(GameConfig.BuildingType.DARKMATTER_CONTAINMENT, buildings.darkMatterContainment);

        if (titanium > titaniumCap) titanium = titaniumCap;
        if (helium3 > helium3Cap) helium3 = helium3Cap;
        if (darkMatter > darkMatterCap) darkMatter = darkMatterCap;
    }

    function _getStorageCapacity(GameConfig.BuildingType buildingType, uint8 level)
        internal
        view
        returns (uint256)
    {
        if (level == 0) return 100000;
        return gameConfig.getStorageCapacity(buildingType, level);
    }

    function _claimResourcesInternal(uint256 planetId) internal {
        (uint256 titanium, uint256 helium3, uint256 darkMatter) = calculateCurrentResources(planetId);
        gameState.setPlanetResources(planetId, titanium, helium3, darkMatter, uint32(block.timestamp));
    }

    // ============ POSITION HELPERS ============

    function _isPlanetPosition(uint16 position) internal pure returns (bool) {
        return position >= 1 && position <= 10;
    }

    function _isOutpostPosition(uint16 position) internal pure returns (bool) {
        return position >= 11 && position <= 15;
    }

    // ============ FLEET DISPATCH ============

    /**
     * @notice Dispatch a fleet on a mission
     */
    function dispatchFleet(
        address player,
        uint256 planetId,
        uint256[MAX_SHIP_TYPES] calldata ships,
        uint16[3] calldata destination,
        GameState.FleetMission mission,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) external onlyRouter returns (uint256 fleetId) {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");

        // Validate
        _validateFleetDispatch(player, ships, destination, mission, planetId, cargoTitanium, cargoHelium3, cargoDarkMatter);

        // Get origin coordinates
        uint16[3] memory origin = gameState.getPlanetCoordinates(planetId);

        // Deduct ships from planet
        _deductShipsFromPlanet(planetId, ships);

        // Deduct fuel (Helium-3) based on fleet composition, distance, and mission type
        _calculateAndDeductFuel(planetId, ships, origin, destination, mission);

        // Handle cargo for MOVE and COLONIZE missions
        if (mission == GameState.FleetMission.MOVE || mission == GameState.FleetMission.COLONIZE) {
            _handleMoveCargo(player, planetId, ships, cargoTitanium, cargoHelium3, cargoDarkMatter);
        }

        // Create and store fleet
        fleetId = _createFleet(player, planetId, origin, destination, mission, ships, cargoTitanium, cargoHelium3, cargoDarkMatter);

        return fleetId;
    }

    /**
     * @notice Dispatch a fleet from an outpost (garrison ships) back to a planet
     * @dev Only MOVE mission allowed, destination must be player's own planet
     * @param player The player address
     * @param origin The outpost coordinates [galaxy, system, position]
     * @param ships Ships to dispatch from outpost garrison
     * @param destination The destination coordinates (player's planet)
     * @param cargoTitanium Titanium cargo to load from outpost
     * @param cargoHelium3 Helium-3 cargo to load from outpost
     * @param cargoDarkMatter Dark matter cargo to load from outpost
     */
    function dispatchFleetFromOutpost(
        address player,
        uint16[3] calldata origin,
        uint256[MAX_SHIP_TYPES] calldata ships,
        uint16[3] calldata destination,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) external onlyRouter returns (uint256 fleetId) {
        // NOTE: No fuel deduction for outpost dispatches. Outposts have a single resource
        // type, so only Helium-3 Labs would have fuel. May be revisited in a future version.

        // 1. Check Computer Technology research level for fleet limit
        uint8 computerTech = gameState.getResearchLevel(player, GameConfig.ResearchType.COMPUTER_TECH);
        require(computerTech > 0, "FleetManager: Computer Tech required to send fleets");
        require(gameState.getPlayerFleetCount(player) < uint256(computerTech), "FleetManager: Fleet limit reached");

        // 2. Validate origin is an outpost position (11-15)
        require(_isOutpostPosition(origin[2]), "Origin must be outpost position");

        // 3. Validate player owns the outpost
        GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(origin[0], origin[1], origin[2]);
        require(outpost.owner == player, "Player does not own this outpost");

        // 4. Validate destination is player's own planet
        require(_isPlanetPosition(destination[2]), "Destination must be planet position");
        uint256 destPlanetId = gameState.getCoordinateToPlanet(destination[0], destination[1], destination[2]);
        require(destPlanetId != 0, "Destination planet does not exist");
        require(gameState.getPlanetOwner(destPlanetId) == player, "Destination must be own planet");

        // 5. Validate not dispatching to same location
        require(
            origin[0] != destination[0] ||
            origin[1] != destination[1] ||
            origin[2] != destination[2],
            "Cannot dispatch to same location"
        );

        // 6. Validate fleet has ships
        uint256 totalShips = 0;
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            totalShips += ships[i];
        }
        require(totalShips > 0, "No ships in fleet");

        // 7. Validate and deduct ships from outpost garrison
        uint256[MAX_SHIP_TYPES] memory garrison = gameState.getStationedShips(origin[0], origin[1], origin[2]);
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            if (ships[i] > 0) {
                require(garrison[i] >= ships[i], "Insufficient ships at outpost");
                garrison[i] -= ships[i];
            }
        }
        gameState.setStationedShips(origin[0], origin[1], origin[2], garrison);

        // 8. Handle cargo loading from outpost
        if (cargoTitanium > 0 || cargoHelium3 > 0 || cargoDarkMatter > 0) {
            _handleOutpostCargo(player, origin, outpost.outpostType, ships, cargoTitanium, cargoHelium3, cargoDarkMatter);
        }

        // 9. Create fleet (using destination planetId as originPlanetId for landing logic)
        // Note: MOVE missions don't return, so originPlanetId is used for resolution at destination
        fleetId = _createFleet(
            player,
            destPlanetId,
            origin,
            destination,
            GameState.FleetMission.MOVE,
            ships,
            cargoTitanium,
            cargoHelium3,
            cargoDarkMatter
        );

        return fleetId;
    }

    function _validateFleetDispatch(
        address player,
        uint256[MAX_SHIP_TYPES] calldata ships,
        uint16[3] calldata destination,
        GameState.FleetMission mission,
        uint256 planetId,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) internal view {
        // Check Computer Technology research level for fleet limit
        uint8 computerTech = gameState.getResearchLevel(player, GameConfig.ResearchType.COMPUTER_TECH);
        require(computerTech > 0, "FleetManager: Computer Tech required to send fleets");
        require(gameState.getPlayerFleetCount(player) < uint256(computerTech), "FleetManager: Fleet limit reached");

        // Require at least one ship
        uint256 totalShips = 0;
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            totalShips += ships[i];
        }
        require(totalShips > 0, "No ships in fleet");

        require(mission != GameState.FleetMission.NONE, "Invalid mission");

        uint16[3] memory origin = gameState.getPlanetCoordinates(planetId);

        require(
            origin[0] != destination[0] ||
            origin[1] != destination[1] ||
            origin[2] != destination[2],
            "Cannot dispatch to same location"
        );

        if (mission == GameState.FleetMission.RAID) {
            require(cargoTitanium == 0 && cargoHelium3 == 0 && cargoDarkMatter == 0, "RAID cannot carry cargo");

            if (_isPlanetPosition(destination[2])) {
                uint256 destPlanetId = gameState.getCoordinateToPlanet(destination[0], destination[1], destination[2]);
                require(destPlanetId != 0, "Cannot raid empty position");
                require(gameState.getPlanetOwner(destPlanetId) != player, "Cannot raid own planet");
            } else if (_isOutpostPosition(destination[2])) {
                GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(destination[0], destination[1], destination[2]);
                GameConfig.OutpostType outpostType = outpost.outpostType;
                if (outpostType == GameConfig.OutpostType.NONE) {
                    outpostType = gameConfig.getOutpostTypeForPosition(destination[2]);
                }
                require(outpostType != GameConfig.OutpostType.NONE, "Invalid outpost position");
                require(outpost.owner != address(0), "Cannot raid unclaimed outpost");
                require(outpost.owner != player, "Cannot raid own outpost");
            }
        } else if (mission == GameState.FleetMission.CAPTURE) {
            require(_isOutpostPosition(destination[2]), "CAPTURE requires outpost position");
            require(cargoTitanium == 0 && cargoHelium3 == 0 && cargoDarkMatter == 0, "CAPTURE cannot carry cargo");

            GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(destination[0], destination[1], destination[2]);
            require(outpost.owner != player, "Cannot capture own outpost");
        } else if (mission == GameState.FleetMission.MOVE) {
            if (_isPlanetPosition(destination[2])) {
                uint256 destPlanetId = gameState.getCoordinateToPlanet(destination[0], destination[1], destination[2]);
                require(destPlanetId != 0 && gameState.getPlanetOwner(destPlanetId) == player, "MOVE requires own planet");
            } else if (_isOutpostPosition(destination[2])) {
                GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(destination[0], destination[1], destination[2]);
                require(outpost.owner == player, "MOVE requires own outpost");

                if (outpost.outpostType == GameConfig.OutpostType.TITANIUM_MINE) {
                    require(cargoHelium3 == 0 && cargoDarkMatter == 0, "Outpost only accepts matching resource");
                } else if (outpost.outpostType == GameConfig.OutpostType.HELIUM3_LAB) {
                    require(cargoTitanium == 0 && cargoDarkMatter == 0, "Outpost only accepts matching resource");
                } else if (outpost.outpostType == GameConfig.OutpostType.DARKMATTER_REFINERY) {
                    require(cargoTitanium == 0 && cargoHelium3 == 0, "Outpost only accepts matching resource");
                }
            }
        } else if (mission == GameState.FleetMission.COLONIZE) {
            // Must have at least 1 colony ship
            require(ships[uint256(GameConfig.ShipType.ColonyShip)] >= 1, "COLONIZE requires colony ship");
            // Destination must be a planet position (1-10)
            require(_isPlanetPosition(destination[2]), "COLONIZE requires planet position");
            // Destination must be unoccupied
            require(gameState.getCoordinateToPlanet(destination[0], destination[1], destination[2]) == 0, "Position already occupied");
            // Check colony slot availability
            uint8 astrophysicsLevel = gameState.getResearchLevel(player, GameConfig.ResearchType.ASTROPHYSICS);
            uint256 maxColonies = gameConfig.getMaxColonies(astrophysicsLevel);
            uint256 currentColonies = gameState.getPlayerPlanetCount(player) - 1; // subtract starter planet
            require(currentColonies < maxColonies, "No colony slots available");
        }

        // Check player has enough ships
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            if (ships[i] > 0) {
                require(gameState.getPlanetShipCount(planetId, i) >= ships[i], "Insufficient ships");
            }
        }
    }

    function _deductShipsFromPlanet(uint256 planetId, uint256[MAX_SHIP_TYPES] calldata ships) internal {
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            if (ships[i] > 0) {
                gameState.deductPlanetShips(planetId, i, ships[i]);
            }
        }
    }

    function _calculateAndDeductFuel(
        uint256 planetId,
        uint256[MAX_SHIP_TYPES] calldata ships,
        uint16[3] memory origin,
        uint16[3] calldata destination,
        GameState.FleetMission mission
    ) internal returns (uint256 fuelCost) {
        uint256 distance = gameConfig.calculateDistance(origin, destination);

        // Round-trip missions use double distance for fuel
        if (mission == GameState.FleetMission.RAID || mission == GameState.FleetMission.CAPTURE) {
            distance = distance * 2;
        }

        uint256[MAX_SHIP_TYPES] memory shipsMemory;
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            shipsMemory[i] = ships[i];
        }

        fuelCost = gameConfig.calculateFleetFuelConsumption(shipsMemory, distance);

        if (fuelCost > 0) {
            _claimResourcesInternal(planetId);

            GameState.Resources memory res = gameState.getPlanetResources(planetId);
            require(res.helium3 >= fuelCost, "Insufficient Helium-3 for fuel");

            gameState.deductResources(planetId, 0, fuelCost, 0);
        }
    }

    function _handleMoveCargo(
        address player,
        uint256 planetId,
        uint256[MAX_SHIP_TYPES] calldata ships,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) internal {
        _claimResourcesInternal(planetId);

        GameState.Resources memory res = gameState.getPlanetResources(planetId);
        require(res.titanium >= cargoTitanium, "Insufficient titanium cargo");
        require(res.helium3 >= cargoHelium3, "Insufficient helium-3 cargo");
        require(res.darkMatter >= cargoDarkMatter, "Insufficient dark matter cargo");

        uint256[MAX_SHIP_TYPES] memory shipsMemory;
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            shipsMemory[i] = ships[i];
        }
        uint8 hyperspaceTech = gameState.getResearchLevel(player, GameConfig.ResearchType.HYPERSPACE_TECH);
        uint256 cargoCapacity = gameConfig.getTotalCargoCapacityWithResearch(shipsMemory, hyperspaceTech);
        require(cargoTitanium + cargoHelium3 + cargoDarkMatter <= cargoCapacity, "Cargo exceeds capacity");

        gameState.deductResources(planetId, cargoTitanium, cargoHelium3, cargoDarkMatter);
    }

    /**
     * @notice Handle cargo loading from an outpost for fleet dispatch
     * @dev Validates cargo matches outpost type and deducts from outpost resources
     */
    function _handleOutpostCargo(
        address player,
        uint16[3] calldata origin,
        GameConfig.OutpostType outpostType,
        uint256[MAX_SHIP_TYPES] calldata ships,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) internal {
        // Claim accumulated resources first
        uint256 availableResources = _claimOutpostResources(origin[0], origin[1], origin[2]);

        // Validate cargo matches outpost type (outposts only have one resource type)
        uint256 requestedCargo = 0;
        if (outpostType == GameConfig.OutpostType.TITANIUM_MINE) {
            require(cargoHelium3 == 0 && cargoDarkMatter == 0, "Outpost only has titanium");
            requestedCargo = cargoTitanium;
        } else if (outpostType == GameConfig.OutpostType.HELIUM3_LAB) {
            require(cargoTitanium == 0 && cargoDarkMatter == 0, "Outpost only has helium-3");
            requestedCargo = cargoHelium3;
        } else if (outpostType == GameConfig.OutpostType.DARKMATTER_REFINERY) {
            require(cargoTitanium == 0 && cargoHelium3 == 0, "Outpost only has dark matter");
            requestedCargo = cargoDarkMatter;
        }

        // Validate sufficient resources at outpost
        require(requestedCargo <= availableResources, "Insufficient resources at outpost");

        // Validate cargo capacity
        uint256[MAX_SHIP_TYPES] memory shipsMemory;
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            shipsMemory[i] = ships[i];
        }
        uint8 hyperspaceTech = gameState.getResearchLevel(player, GameConfig.ResearchType.HYPERSPACE_TECH);
        uint256 cargoCapacity = gameConfig.getTotalCargoCapacityWithResearch(shipsMemory, hyperspaceTech);
        require(cargoTitanium + cargoHelium3 + cargoDarkMatter <= cargoCapacity, "Cargo exceeds capacity");

        // Deduct resources from outpost
        if (requestedCargo > 0) {
            gameState.deductOutpostResources(origin[0], origin[1], origin[2], requestedCargo);
        }
    }

    function _createFleet(
        address player,
        uint256 planetId,
        uint16[3] memory origin,
        uint16[3] calldata destination,
        GameState.FleetMission mission,
        uint256[MAX_SHIP_TYPES] calldata ships,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) internal returns (uint256 fleetId) {
        uint256[MAX_SHIP_TYPES] memory shipsMemory;
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            shipsMemory[i] = ships[i];
        }
        ResearchBonuses memory bonuses = _getResearchBonuses(player);
        uint32 slowestSpeed = gameConfig.getSlowestSpeedWithResearch(
            shipsMemory,
            bonuses.combustionDrive,
            bonuses.impulseDrive,
            bonuses.hyperspaceDrive
        );
        uint32 travelTime = gameConfig.calculateTravelTime(origin, destination, slowestSpeed);
        uint32 arrivalTime = uint32(block.timestamp) + travelTime;

        GameState.Fleet memory fleet = GameState.Fleet({
            fleetId: 0, // Will be set by GameState
            owner: player,
            originPlanetId: planetId,
            origin: origin,
            destination: destination,
            mission: mission,
            status: GameState.FleetStatus.TRAVELING,
            departureTime: uint32(block.timestamp),
            arrivalTime: arrivalTime,
            returnTime: 0,
            ships: shipsMemory,
            cargoTitanium: cargoTitanium,
            cargoHelium3: cargoHelium3,
            cargoDarkMatter: cargoDarkMatter
        });

        fleetId = gameState.createFleet(fleet);

        emit FleetDispatched(fleetId, player, origin, destination, mission, arrivalTime);

        return fleetId;
    }

    // ============ FLEET RESOLUTION ============

    /**
     * @notice Resolve a fleet that has arrived at its destination
     */
    function resolveFleet(uint256 fleetId) external {
        GameState.Fleet memory fleet = gameState.getFleet(fleetId);
        require(fleet.fleetId != 0, "Fleet does not exist");
        require(fleet.status == GameState.FleetStatus.TRAVELING, "Fleet not traveling");
        require(block.timestamp >= fleet.arrivalTime, "Fleet has not arrived");

        bool combatOccurred = false;
        bool attackerWon = false;

        if (fleet.mission == GameState.FleetMission.RAID) {
            (combatOccurred, attackerWon) = _resolveRaid(fleetId, fleet);
        } else if (fleet.mission == GameState.FleetMission.CAPTURE) {
            (combatOccurred, attackerWon) = _resolveCapture(fleetId, fleet);
        } else if (fleet.mission == GameState.FleetMission.MOVE) {
            _resolveMove(fleetId, fleet);
        } else if (fleet.mission == GameState.FleetMission.COLONIZE) {
            _resolveColonize(fleetId, fleet);
        }

        emit FleetResolved(fleetId, fleet.mission, combatOccurred, attackerWon);
    }

    function _resolveRaid(uint256 fleetId, GameState.Fleet memory fleet) internal returns (bool combatOccurred, bool attackerWon) {
        uint256[MAX_SHIP_TYPES] memory garrison = _getGarrisonAt(fleet.destination);
        uint256[MAX_DEFENSE_TYPES] memory defenses = _getDefensesAt(fleet.destination);

        uint256 garrisonTotal = _countDefenderUnits(garrison, defenses);

        address defender = _getDefenderAddress(fleet.destination);

        ResearchBonuses memory atkBonuses = _getResearchBonuses(fleet.owner);
        ResearchBonuses memory defBonuses;
        if (defender != address(0)) {
            defBonuses = _getResearchBonuses(defender);
        }

        CombatResult memory result;

        if (garrisonTotal > 0) {
            combatOccurred = true;
            result = _resolveCombat(fleet.ships, garrison, defenses, atkBonuses, defBonuses);
            attackerWon = result.attackerWon;

            if (attackerWon) {
                gameState.updateFleetShips(fleetId, result.survivingAttackers);
                _setGarrisonAt(fleet.destination, result.survivingDefenders);
                _setDefensesAt(fleet.destination, result.survivingDefenses);
            } else {
                {
                    BattleReportParams memory brp;
                    brp.attacker = fleet.owner;
                    brp.defender = defender;
                    brp.location = fleet.destination;
                    brp.mission = GameState.FleetMission.RAID;
                    brp.attackerInitial = fleet.ships;
                    brp.attackerSurviving = result.survivingAttackers;
                    brp.defenderInitial = garrison;
                    brp.defenderSurviving = result.survivingDefenders;
                    brp.defenderDefensesInitial = defenses;
                    brp.defenderDefensesSurviving = result.survivingDefenses;
                    brp.attackerWon = false;
                    _createBattleReport(brp);
                }
                gameState.deleteFleet(fleetId);
                return (combatOccurred, attackerWon);
            }
        } else {
            attackerWon = true;
            result.survivingAttackers = fleet.ships;
        }

        // Loot and return
        uint256[3] memory loot = _calculateAndApplyLoot(fleetId, fleet, result.survivingAttackers, atkBonuses);

        {
            BattleReportParams memory brp;
            brp.attacker = fleet.owner;
            brp.defender = defender;
            brp.location = fleet.destination;
            brp.mission = GameState.FleetMission.RAID;
            brp.attackerInitial = fleet.ships;
            brp.attackerSurviving = result.survivingAttackers;
            brp.defenderInitial = garrison;
            brp.defenderSurviving = result.survivingDefenders;
            brp.defenderDefensesInitial = defenses;
            brp.defenderDefensesSurviving = result.survivingDefenses;
            brp.attackerWon = true;
            brp.lootTitanium = loot[0];
            brp.lootHelium3 = loot[1];
            brp.lootDarkMatter = loot[2];
            _createBattleReport(brp);
        }

        // Set return trip
        uint32 slowestSpeed = gameConfig.getSlowestSpeedWithResearch(
            result.survivingAttackers, atkBonuses.combustionDrive, atkBonuses.impulseDrive, atkBonuses.hyperspaceDrive
        );
        uint32 returnTravelTime = gameConfig.calculateTravelTime(fleet.destination, fleet.origin, slowestSpeed);
        gameState.updateFleetReturnTime(fleetId, uint32(block.timestamp) + returnTravelTime);
        gameState.updateFleetStatus(fleetId, GameState.FleetStatus.RETURNING);

        return (combatOccurred, attackerWon);
    }

    function _countDefenderUnits(
        uint256[MAX_SHIP_TYPES] memory garrison,
        uint256[MAX_DEFENSE_TYPES] memory defenses
    ) internal pure returns (uint256 total) {
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            total += garrison[i];
        }
        for (uint8 i = 1; i < MAX_DEFENSE_TYPES; i++) {
            total += defenses[i];
        }
    }

    function _getDefenderAddress(uint16[3] memory destination) internal view returns (address defender) {
        if (_isPlanetPosition(destination[2])) {
            uint256 defPlanetId = gameState.getCoordinateToPlanet(destination[0], destination[1], destination[2]);
            if (defPlanetId != 0) {
                return gameState.getPlanetOwner(defPlanetId);
            }
        } else if (_isOutpostPosition(destination[2])) {
            GameState.RaiderOutpost memory defOutpost = gameState.getRaiderOutpost(destination[0], destination[1], destination[2]);
            return defOutpost.owner;
        }
        return address(0);
    }

    function _calculateAndApplyLoot(
        uint256 fleetId,
        GameState.Fleet memory fleet,
        uint256[MAX_SHIP_TYPES] memory survivingAttackers,
        ResearchBonuses memory atkBonuses
    ) internal returns (uint256[3] memory loot) {
        uint256 cargoCapacity = gameConfig.getTotalCargoCapacityWithResearch(survivingAttackers, atkBonuses.hyperspaceTech);

        uint256 availableTitanium = 0;
        uint256 availableHelium3 = 0;
        uint256 availableDarkMatter = 0;

        if (_isPlanetPosition(fleet.destination[2])) {
            uint256 destPlanetId = gameState.getCoordinateToPlanet(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
            if (destPlanetId != 0) {
                _claimResourcesInternal(destPlanetId);
                GameState.Resources memory destRes = gameState.getPlanetResources(destPlanetId);
                availableTitanium = destRes.titanium;
                availableHelium3 = destRes.helium3;
                availableDarkMatter = destRes.darkMatter;
            }
        } else if (_isOutpostPosition(fleet.destination[2])) {
            GameState.RaiderOutpost memory outpost = _getOrInitOutpost(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
            uint256 outpostResources = _claimOutpostResources(fleet.destination[0], fleet.destination[1], fleet.destination[2]);

            if (outpost.outpostType == GameConfig.OutpostType.TITANIUM_MINE) {
                availableTitanium = outpostResources;
            } else if (outpost.outpostType == GameConfig.OutpostType.HELIUM3_LAB) {
                availableHelium3 = outpostResources;
            } else if (outpost.outpostType == GameConfig.OutpostType.DARKMATTER_REFINERY) {
                availableDarkMatter = outpostResources;
            }
        }

        uint256 totalAvailable = availableTitanium + availableHelium3 + availableDarkMatter;
        if (totalAvailable > 0) {
            if (totalAvailable <= cargoCapacity) {
                loot[0] = availableTitanium;
                loot[1] = availableHelium3;
                loot[2] = availableDarkMatter;
            } else {
                loot[0] = (availableTitanium * cargoCapacity) / totalAvailable;
                loot[1] = (availableHelium3 * cargoCapacity) / totalAvailable;
                loot[2] = cargoCapacity - loot[0] - loot[1];
                if (loot[2] > availableDarkMatter) {
                    loot[2] = availableDarkMatter;
                }
            }

            gameState.updateFleetCargo(fleetId, loot[0], loot[1], loot[2]);

            if (_isPlanetPosition(fleet.destination[2])) {
                uint256 destPlanetId = gameState.getCoordinateToPlanet(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
                if (destPlanetId != 0) {
                    gameState.deductResources(destPlanetId, loot[0], loot[1], loot[2]);
                }
            } else if (_isOutpostPosition(fleet.destination[2])) {
                uint256 totalLooted = loot[0] + loot[1] + loot[2];
                gameState.deductOutpostResources(fleet.destination[0], fleet.destination[1], fleet.destination[2], totalLooted);
                emit OutpostResourcesCollected(fleet.destination, fleet.owner, totalLooted);
            }
        }
    }

    function _resolveCapture(uint256 fleetId, GameState.Fleet memory fleet) internal returns (bool combatOccurred, bool attackerWon) {
        // Initialize outpost if needed
        GameState.RaiderOutpost memory outpost = _getOrInitOutpost(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
        address previousOwner = outpost.owner;

        uint256[MAX_SHIP_TYPES] memory garrison = _getGarrisonAt(fleet.destination);
        uint256[MAX_DEFENSE_TYPES] memory emptyDefenses; // Outposts have no defenses
        uint256 garrisonTotal = 0;
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            garrisonTotal += garrison[i];
        }

        // Get research bonuses for combat
        ResearchBonuses memory atkBonuses = _getResearchBonuses(fleet.owner);
        ResearchBonuses memory defBonuses;
        if (previousOwner != address(0)) {
            defBonuses = _getResearchBonuses(previousOwner);
        }

        if (garrisonTotal > 0) {
            combatOccurred = true;
            CombatResult memory result = _resolveCombat(fleet.ships, garrison, emptyDefenses, atkBonuses, defBonuses);

            attackerWon = result.attackerWon;

            if (result.attackerWon) {
                _setGarrisonAt(fleet.destination, result.survivingAttackers);
                gameState.setOutpostOwner(fleet.destination[0], fleet.destination[1], fleet.destination[2], fleet.owner, uint32(block.timestamp));
                emit OutpostCaptured(fleet.destination, previousOwner, fleet.owner);
                {
                    BattleReportParams memory brp;
                    brp.attacker = fleet.owner;
                    brp.defender = previousOwner;
                    brp.location = fleet.destination;
                    brp.mission = GameState.FleetMission.CAPTURE;
                    brp.attackerInitial = fleet.ships;
                    brp.attackerSurviving = result.survivingAttackers;
                    brp.defenderInitial = garrison;
                    brp.defenderSurviving = result.survivingDefenders;
                    brp.defenderDefensesInitial = emptyDefenses;
                    brp.defenderDefensesSurviving = result.survivingDefenses;
                    brp.attackerWon = true;
                    _createBattleReport(brp);
                }
            } else {
                _setGarrisonAt(fleet.destination, result.survivingDefenders);
                {
                    BattleReportParams memory brp;
                    brp.attacker = fleet.owner;
                    brp.defender = previousOwner;
                    brp.location = fleet.destination;
                    brp.mission = GameState.FleetMission.CAPTURE;
                    brp.attackerInitial = fleet.ships;
                    // brp.attackerSurviving is zero-initialized (attacker lost)
                    brp.defenderInitial = garrison;
                    brp.defenderSurviving = result.survivingDefenders;
                    brp.defenderDefensesInitial = emptyDefenses;
                    brp.defenderDefensesSurviving = result.survivingDefenses;
                    brp.attackerWon = false;
                    _createBattleReport(brp);
                }
                gameState.deleteFleet(fleetId);
                return (combatOccurred, attackerWon);
            }
        } else {
            attackerWon = true;
            _setGarrisonAt(fleet.destination, fleet.ships);
            gameState.setOutpostOwner(fleet.destination[0], fleet.destination[1], fleet.destination[2], fleet.owner, uint32(block.timestamp));
            emit OutpostCaptured(fleet.destination, previousOwner, fleet.owner);
        }

        gameState.deleteFleet(fleetId);
        return (combatOccurred, attackerWon);
    }

    function _resolveMove(uint256 fleetId, GameState.Fleet memory fleet) internal {
        if (_isPlanetPosition(fleet.destination[2])) {
            uint256 destPlanetId = gameState.getCoordinateToPlanet(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
            if (destPlanetId != 0) {
                _claimResourcesInternal(destPlanetId);
                gameState.addResources(destPlanetId, fleet.cargoTitanium, fleet.cargoHelium3, fleet.cargoDarkMatter);

                // Add ships to planet
                for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
                    if (fleet.ships[i] > 0) {
                        gameState.addPlanetShips(destPlanetId, i, fleet.ships[i]);
                    }
                }
            }
        } else if (_isOutpostPosition(fleet.destination[2])) {
            _claimOutpostResources(fleet.destination[0], fleet.destination[1], fleet.destination[2]);

            GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(fleet.destination[0], fleet.destination[1], fleet.destination[2]);

            // Add matching cargo
            uint256 cargoAmount = 0;
            if (outpost.outpostType == GameConfig.OutpostType.TITANIUM_MINE) {
                cargoAmount = fleet.cargoTitanium;
            } else if (outpost.outpostType == GameConfig.OutpostType.HELIUM3_LAB) {
                cargoAmount = fleet.cargoHelium3;
            } else if (outpost.outpostType == GameConfig.OutpostType.DARKMATTER_REFINERY) {
                cargoAmount = fleet.cargoDarkMatter;
            }

            if (cargoAmount > 0) {
                gameState.addOutpostResources(fleet.destination[0], fleet.destination[1], fleet.destination[2], cargoAmount);
            }

            // Add ships to stationed
            uint256[MAX_SHIP_TYPES] memory currentGarrison = gameState.getStationedShips(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
            for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
                currentGarrison[i] += fleet.ships[i];
            }
            _setGarrisonAt(fleet.destination, currentGarrison);
        }

        gameState.deleteFleet(fleetId);
    }

    function _resolveColonize(uint256 fleetId, GameState.Fleet memory fleet) internal {
        // Re-validate destination is still unoccupied (race condition during travel)
        uint256 existingPlanet = gameState.getCoordinateToPlanet(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
        if (existingPlanet != 0) {
            // Destination was colonized by someone else during travel — return fleet to origin
            ResearchBonuses memory bonuses = _getResearchBonuses(fleet.owner);
            uint32 slowestSpeed = gameConfig.getSlowestSpeedWithResearch(
                fleet.ships, bonuses.combustionDrive, bonuses.impulseDrive, bonuses.hyperspaceDrive
            );
            uint32 returnTravelTime = gameConfig.calculateTravelTime(fleet.destination, fleet.origin, slowestSpeed);
            gameState.updateFleetReturnTime(fleetId, uint32(block.timestamp) + returnTravelTime);
            gameState.updateFleetStatus(fleetId, GameState.FleetStatus.RETURNING);
            emit ColonizationFailed(fleetId, fleet.owner, fleet.destination);
            return;
        }

        // Consume 1 colony ship
        uint256[MAX_SHIP_TYPES] memory remainingShips = fleet.ships;
        remainingShips[uint256(GameConfig.ShipType.ColonyShip)] -= 1;

        // Create the new planet
        uint256 newPlanetId = gameState.incrementNextPlanetId();
        gameState.createPlanet(newPlanetId, fleet.owner, fleet.destination, "Colony");

        // Initialize bare planet resources (lastClaimed = now, zero resources)
        gameState.setPlanetResources(newPlanetId, 0, 0, 0, uint32(block.timestamp));

        // Station remaining ships at the new planet
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            if (remainingShips[i] > 0) {
                gameState.addPlanetShips(newPlanetId, i, remainingShips[i]);
            }
        }

        // Deposit cargo at the new planet
        if (fleet.cargoTitanium > 0 || fleet.cargoHelium3 > 0 || fleet.cargoDarkMatter > 0) {
            gameState.addResources(newPlanetId, fleet.cargoTitanium, fleet.cargoHelium3, fleet.cargoDarkMatter);
        }

        emit PlanetColonized(fleet.owner, newPlanetId, fleet.destination);

        gameState.deleteFleet(fleetId);
    }

    // ============ FLEET COMPLETION ============

    /**
     * @notice Complete a returning fleet (RAID or failed COLONIZE)
     */
    function completeFleet(uint256 fleetId) external {
        GameState.Fleet memory fleet = gameState.getFleet(fleetId);
        require(fleet.fleetId != 0, "Fleet does not exist");
        require(fleet.status == GameState.FleetStatus.RETURNING, "Fleet not returning");
        require(block.timestamp >= fleet.returnTime, "Fleet has not returned");

        // Return ships to origin planet
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            if (fleet.ships[i] > 0) {
                gameState.addPlanetShips(fleet.originPlanetId, i, fleet.ships[i]);
            }
        }

        // Deposit cargo
        _claimResourcesInternal(fleet.originPlanetId);
        gameState.addResources(fleet.originPlanetId, fleet.cargoTitanium, fleet.cargoHelium3, fleet.cargoDarkMatter);

        emit FleetCompleted(fleetId, fleet.cargoTitanium, fleet.cargoHelium3, fleet.cargoDarkMatter);

        gameState.deleteFleet(fleetId);
    }

    // ============ COMBAT ============

    function _resolveCombat(
        uint256[MAX_SHIP_TYPES] memory attackerShips,
        uint256[MAX_SHIP_TYPES] memory defenderShips,
        uint256[MAX_DEFENSE_TYPES] memory defenderDefenses,
        ResearchBonuses memory attackerResearch,
        ResearchBonuses memory defenderResearch
    ) internal view returns (CombatResult memory) {
        CombatResult memory result;
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            result.survivingAttackers[i] = attackerShips[i];
            result.survivingDefenders[i] = defenderShips[i];
        }
        for (uint8 i = 0; i < MAX_DEFENSE_TYPES; i++) {
            result.survivingDefenses[i] = defenderDefenses[i];
        }

        for (uint8 round = 0; round < 6; round++) {
            // Count surviving units
            uint256 attackerTotalShips = 0;
            uint256 defenderTotalUnits = 0;
            for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
                attackerTotalShips += result.survivingAttackers[i];
                defenderTotalUnits += result.survivingDefenders[i];
            }
            for (uint8 i = 1; i < MAX_DEFENSE_TYPES; i++) {
                defenderTotalUnits += result.survivingDefenses[i];
            }

            if (attackerTotalShips == 0 || defenderTotalUnits == 0) {
                break;
            }

            // Calculate attacker firepower (ships vs ships+defenses, with advantages against both)
            uint256 attackerFirepower = _calculateAttackerFirepower(
                result.survivingAttackers, result.survivingDefenders, result.survivingDefenses,
                defenderTotalUnits, uint256(attackerResearch.weaponTech)
            );

            // Calculate defender firepower (ships with advantages + defenses without advantages)
            uint256 defenderFirepower = _calculateDefenderFirepower(
                result.survivingDefenders, result.survivingDefenses,
                result.survivingAttackers, attackerTotalShips,
                uint256(defenderResearch.weaponTech)
            );

            // Apply attacker damage to defender ships (proportional to unit share)
            for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
                if (result.survivingDefenders[i] > 0) {
                    GameConfig.ShipConfig memory config = gameConfig.getShipConfig(GameConfig.ShipType(i));
                    uint256 damageShare = (attackerFirepower * result.survivingDefenders[i]) / defenderTotalUnits;
                    uint256 boostedShield = uint256(config.shieldPower) * (100 + uint256(defenderResearch.shieldingTech) * 10) / 100;
                    uint256 boostedHull = uint256(config.structuralIntegrity) * (100 + uint256(defenderResearch.armourTech) * 10) / 100;
                    uint256 defense = boostedShield + boostedHull / 100;
                    uint256 destroyed = damageShare / defense;
                    if (destroyed >= result.survivingDefenders[i]) {
                        result.survivingDefenders[i] = 0;
                    } else {
                        result.survivingDefenders[i] -= destroyed;
                    }
                }
            }

            // Apply attacker damage to defender defenses (proportional to unit share)
            for (uint8 i = 1; i < MAX_DEFENSE_TYPES; i++) {
                if (result.survivingDefenses[i] > 0) {
                    GameConfig.DefenseConfig memory config = gameConfig.getDefenseConfig(GameConfig.DefenseType(i));
                    uint256 damageShare = (attackerFirepower * result.survivingDefenses[i]) / defenderTotalUnits;
                    uint256 boostedShield = uint256(config.shieldPower) * (100 + uint256(defenderResearch.shieldingTech) * 10) / 100;
                    uint256 boostedHull = uint256(config.structuralIntegrity) * (100 + uint256(defenderResearch.armourTech) * 10) / 100;
                    uint256 defense = boostedShield + boostedHull / 100;
                    uint256 destroyed = damageShare / defense;
                    if (destroyed >= result.survivingDefenses[i]) {
                        result.survivingDefenses[i] = 0;
                    } else {
                        result.survivingDefenses[i] -= destroyed;
                    }
                }
            }

            // Apply defender damage to attacker ships
            for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
                if (result.survivingAttackers[i] > 0) {
                    GameConfig.ShipConfig memory config = gameConfig.getShipConfig(GameConfig.ShipType(i));
                    uint256 damageShare = (defenderFirepower * result.survivingAttackers[i]) / attackerTotalShips;
                    uint256 boostedShield = uint256(config.shieldPower) * (100 + uint256(attackerResearch.shieldingTech) * 10) / 100;
                    uint256 boostedHull = uint256(config.structuralIntegrity) * (100 + uint256(attackerResearch.armourTech) * 10) / 100;
                    uint256 defense = boostedShield + boostedHull / 100;
                    uint256 destroyed = damageShare / defense;
                    if (destroyed >= result.survivingAttackers[i]) {
                        result.survivingAttackers[i] = 0;
                    } else {
                        result.survivingAttackers[i] -= destroyed;
                    }
                }
            }
        }

        // Attacker wins if ALL defender units (ships + defenses) are gone
        uint256 defenderRemaining = 0;
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            defenderRemaining += result.survivingDefenders[i];
        }
        for (uint8 i = 1; i < MAX_DEFENSE_TYPES; i++) {
            defenderRemaining += result.survivingDefenses[i];
        }

        result.attackerWon = (defenderRemaining == 0);

        if (!result.attackerWon) {
            for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
                result.survivingAttackers[i] = 0;
            }
        }

        return result;
    }

    /**
     * @notice Calculate attacker firepower against both ships and defenses
     * @dev Considers ship-vs-ship and ship-vs-defense advantages
     */
    function _calculateAttackerFirepower(
        uint256[MAX_SHIP_TYPES] memory ships,
        uint256[MAX_SHIP_TYPES] memory targetShips,
        uint256[MAX_DEFENSE_TYPES] memory targetDefenses,
        uint256 totalTargets,
        uint256 weaponTechLevel
    ) internal view returns (uint256) {
        uint256 totalFirepower = 0;

        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            if (ships[i] == 0) continue;

            GameConfig.ShipConfig memory config = gameConfig.getShipConfig(GameConfig.ShipType(i));
            uint256 boostedWeapon = uint256(config.weaponPower) * (100 + weaponTechLevel * 10) / 100;

            // Load advantage rows (ship-vs-ship and ship-vs-defense)
            uint8[13] memory advShipRow = gameConfig.getAdvantageRow(GameConfig.ShipType(i));
            uint8[9] memory advDefRow = gameConfig.getShipVsDefenseAdvantageRow(GameConfig.ShipType(i));

            // Check if any advantage exists against any target
            bool hasAdv = false;
            for (uint8 j = 1; j < MAX_SHIP_TYPES; j++) {
                if (advShipRow[j] > 1 && targetShips[j] > 0) {
                    hasAdv = true;
                    break;
                }
            }
            if (!hasAdv) {
                for (uint8 j = 1; j < MAX_DEFENSE_TYPES; j++) {
                    if (advDefRow[j] > 1 && targetDefenses[j] > 0) {
                        hasAdv = true;
                        break;
                    }
                }
            }

            if (!hasAdv) {
                totalFirepower += ships[i] * boostedWeapon;
            } else {
                // Expected shots model across both ship and defense targets
                uint256 denominator = 0;
                for (uint8 j = 1; j < MAX_SHIP_TYPES; j++) {
                    if (targetShips[j] > 0) {
                        uint256 adv = advShipRow[j] > 1 ? uint256(advShipRow[j]) : 1;
                        denominator += targetShips[j] * ADV_PRECISION / adv;
                    }
                }
                for (uint8 j = 1; j < MAX_DEFENSE_TYPES; j++) {
                    if (targetDefenses[j] > 0) {
                        uint256 adv = advDefRow[j] > 1 ? uint256(advDefRow[j]) : 1;
                        denominator += targetDefenses[j] * ADV_PRECISION / adv;
                    }
                }
                totalFirepower += ships[i] * boostedWeapon * totalTargets * ADV_PRECISION / denominator;
            }
        }

        return totalFirepower;
    }

    /**
     * @notice Calculate defender firepower from ships (with advantages) and defenses (no advantages)
     */
    function _calculateDefenderFirepower(
        uint256[MAX_SHIP_TYPES] memory defenderShips,
        uint256[MAX_DEFENSE_TYPES] memory defenderDefenses,
        uint256[MAX_SHIP_TYPES] memory attackerShips,
        uint256 attackerTotalShips,
        uint256 weaponTechLevel
    ) internal view returns (uint256) {
        uint256 totalFirepower = 0;

        // Ship firepower (with ship-vs-ship advantages, no defense targets for defenders)
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            if (defenderShips[i] == 0) continue;

            GameConfig.ShipConfig memory config = gameConfig.getShipConfig(GameConfig.ShipType(i));
            uint256 boostedWeapon = uint256(config.weaponPower) * (100 + weaponTechLevel * 10) / 100;

            uint8[13] memory advRow = gameConfig.getAdvantageRow(GameConfig.ShipType(i));

            bool hasAdv = false;
            for (uint8 j = 1; j < MAX_SHIP_TYPES; j++) {
                if (advRow[j] > 1 && attackerShips[j] > 0) {
                    hasAdv = true;
                    break;
                }
            }

            if (!hasAdv) {
                totalFirepower += defenderShips[i] * boostedWeapon;
            } else {
                uint256 denominator = 0;
                for (uint8 j = 1; j < MAX_SHIP_TYPES; j++) {
                    if (attackerShips[j] > 0) {
                        uint256 adv = advRow[j] > 1 ? uint256(advRow[j]) : 1;
                        denominator += attackerShips[j] * ADV_PRECISION / adv;
                    }
                }
                totalFirepower += defenderShips[i] * boostedWeapon * attackerTotalShips * ADV_PRECISION / denominator;
            }
        }

        // Defense firepower (no advantages, simple count * weapon)
        for (uint8 i = 1; i < MAX_DEFENSE_TYPES; i++) {
            if (defenderDefenses[i] == 0) continue;

            GameConfig.DefenseConfig memory config = gameConfig.getDefenseConfig(GameConfig.DefenseType(i));
            uint256 boostedWeapon = uint256(config.weaponPower) * (100 + weaponTechLevel * 10) / 100;
            totalFirepower += defenderDefenses[i] * boostedWeapon;
        }

        return totalFirepower;
    }

    // ============ GARRISON HELPERS ============

    function _getGarrisonAt(uint16[3] memory coords) internal view returns (uint256[MAX_SHIP_TYPES] memory) {
        if (_isPlanetPosition(coords[2])) {
            uint256 planetId = gameState.getCoordinateToPlanet(coords[0], coords[1], coords[2]);
            if (planetId != 0) {
                return gameState.getPlanetShips(planetId);
            }
        }
        return gameState.getStationedShips(coords[0], coords[1], coords[2]);
    }

    function _setGarrisonAt(uint16[3] memory coords, uint256[MAX_SHIP_TYPES] memory ships) internal {
        if (_isPlanetPosition(coords[2])) {
            uint256 planetId = gameState.getCoordinateToPlanet(coords[0], coords[1], coords[2]);
            if (planetId != 0) {
                gameState.setPlanetShips(planetId, ships);
                return;
            }
        }
        gameState.setStationedShips(coords[0], coords[1], coords[2], ships);
    }

    function _getDefensesAt(uint16[3] memory coords) internal view returns (uint256[MAX_DEFENSE_TYPES] memory) {
        if (_isPlanetPosition(coords[2])) {
            uint256 planetId = gameState.getCoordinateToPlanet(coords[0], coords[1], coords[2]);
            if (planetId != 0) {
                return gameState.getPlanetDefenses(planetId);
            }
        }
        // Outposts have no defenses
        uint256[MAX_DEFENSE_TYPES] memory empty;
        return empty;
    }

    function _setDefensesAt(uint16[3] memory coords, uint256[MAX_DEFENSE_TYPES] memory defenses) internal {
        if (_isPlanetPosition(coords[2])) {
            uint256 planetId = gameState.getCoordinateToPlanet(coords[0], coords[1], coords[2]);
            if (planetId != 0) {
                gameState.setPlanetDefenses(planetId, defenses);
            }
        }
        // Outposts have no defenses, nothing to set
    }

    // ============ OUTPOST HELPERS ============

    function _getOrInitOutpost(uint16 galaxy, uint16 system, uint16 position) internal returns (GameState.RaiderOutpost memory) {
        GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(galaxy, system, position);
        if (outpost.outpostType == GameConfig.OutpostType.NONE) {
            GameConfig.OutpostType outpostType = gameConfig.getOutpostTypeForPosition(position);
            gameState.initOutpost(galaxy, system, position, outpostType);
            outpost.outpostType = outpostType;
        }
        return outpost;
    }

    function _claimOutpostResources(uint16 galaxy, uint16 system, uint16 position) internal returns (uint256) {
        GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(galaxy, system, position);

        if (outpost.owner == address(0) || outpost.lastCollected == 0) {
            return outpost.storedResources;
        }

        GameConfig.OutpostConfig memory config = gameConfig.getOutpostConfig(outpost.outpostType);
        uint256 elapsed = block.timestamp - outpost.lastCollected;
        uint256 produced = (config.productionRate * elapsed) / 3600;
        uint256 total = outpost.storedResources + produced;

        if (total > config.storageCap) {
            total = config.storageCap;
        }

        gameState.updateOutpostResources(galaxy, system, position, total, uint32(block.timestamp));

        return total;
    }

    // ============ BATTLE REPORT HELPERS ============

    function _createBattleReport(BattleReportParams memory p) internal {
        uint256[MAX_SHIP_TYPES] memory attackerLosses;
        uint256[MAX_SHIP_TYPES] memory defenderLosses;
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            attackerLosses[i] = p.attackerInitial[i] - p.attackerSurviving[i];
            defenderLosses[i] = p.defenderInitial[i] - p.defenderSurviving[i];
        }

        uint256[MAX_DEFENSE_TYPES] memory defenderDefensesLosses;
        for (uint8 i = 0; i < MAX_DEFENSE_TYPES; i++) {
            defenderDefensesLosses[i] = p.defenderDefensesInitial[i] - p.defenderDefensesSurviving[i];
        }

        GameState.BattleReport memory report = GameState.BattleReport({
            reportId: 0,
            timestamp: uint32(block.timestamp),
            attacker: p.attacker,
            defender: p.defender,
            location: p.location,
            mission: p.mission,
            attackerWon: p.attackerWon,
            attackerInitial: p.attackerInitial,
            attackerLosses: attackerLosses,
            defenderInitial: p.defenderInitial,
            defenderLosses: defenderLosses,
            defenderDefensesInitial: p.defenderDefensesInitial,
            defenderDefensesLosses: defenderDefensesLosses,
            lootTitanium: p.lootTitanium,
            lootHelium3: p.lootHelium3,
            lootDarkMatter: p.lootDarkMatter
        });

        uint256 reportId = gameState.createBattleReport(report);
        emit BattleReportCreated(reportId, p.attacker, p.defender, p.attackerWon);
    }

    // ============ VIEW FUNCTIONS ============

    function calculateOutpostResources(uint16 galaxy, uint16 system, uint16 position)
        external view returns (uint256 currentResources, GameConfig.OutpostType outpostType)
    {
        GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(galaxy, system, position);

        if (outpost.outpostType == GameConfig.OutpostType.NONE) {
            outpostType = gameConfig.getOutpostTypeForPosition(position);
            return (0, outpostType);
        }

        outpostType = outpost.outpostType;

        if (outpost.owner == address(0)) {
            return (outpost.storedResources, outpostType);
        }

        GameConfig.OutpostConfig memory config = gameConfig.getOutpostConfig(outpost.outpostType);
        uint256 elapsed = block.timestamp - outpost.lastCollected;
        uint256 produced = (config.productionRate * elapsed) / 3600;
        uint256 total = outpost.storedResources + produced;

        if (total > config.storageCap) {
            total = config.storageCap;
        }

        return (total, outpostType);
    }

    function getFleet(uint256 fleetId) external view returns (GameState.Fleet memory) {
        return gameState.getFleet(fleetId);
    }

    function getPlayerFleetIds(address player) external view returns (uint256[] memory) {
        return gameState.getPlayerFleets(player);
    }

    function getPlayerFleetCount(address player) external view returns (uint256) {
        return gameState.getPlayerFleetCount(player);
    }

    function getStationedShips(uint16[3] calldata coords) external view returns (uint256[MAX_SHIP_TYPES] memory) {
        return gameState.getStationedShips(coords[0], coords[1], coords[2]);
    }

    function getOutpost(uint16 galaxy, uint16 system, uint16 position)
        external view returns (
            GameState.RaiderOutpost memory outpost,
            uint256 currentResources,
            uint256[MAX_SHIP_TYPES] memory garrison
        )
    {
        outpost = gameState.getRaiderOutpost(galaxy, system, position);

        if (outpost.outpostType == GameConfig.OutpostType.NONE) {
            outpost.outpostType = gameConfig.getOutpostTypeForPosition(position);
        }

        (currentResources, ) = this.calculateOutpostResources(galaxy, system, position);
        garrison = gameState.getStationedShips(galaxy, system, position);

        return (outpost, currentResources, garrison);
    }

    function getSystemOutposts(uint16 galaxy, uint16 system)
        external view returns (
            GameState.RaiderOutpost[5] memory outposts,
            uint256[5] memory currentResources,
            uint256[MAX_SHIP_TYPES][5] memory garrisons
        )
    {
        for (uint16 i = 0; i < 5; i++) {
            uint16 position = i + 11;
            outposts[i] = gameState.getRaiderOutpost(galaxy, system, position);

            if (outposts[i].outpostType == GameConfig.OutpostType.NONE) {
                outposts[i].outpostType = gameConfig.getOutpostTypeForPosition(position);
            }

            (currentResources[i], ) = this.calculateOutpostResources(galaxy, system, position);
            garrisons[i] = gameState.getStationedShips(galaxy, system, position);
        }
    }

    function getBattleReport(uint256 reportId) external view returns (GameState.BattleReport memory) {
        return gameState.getBattleReport(reportId);
    }

    function getPlayerReportIds(address player) external view returns (uint256[] memory) {
        return gameState.getPlayerReportIds(player);
    }

    function getPlayerReportCount(address player) external view returns (uint256) {
        return gameState.getPlayerReportCount(player);
    }

    function getPlayerRecentReports(address player, uint256 count) external view returns (uint256[] memory) {
        return gameState.getPlayerRecentReports(player, count);
    }
}
