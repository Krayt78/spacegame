// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GameState.sol";
import "./GameConfig.sol";
import "./FleetResolver.sol";

/**
 * @title FleetManager
 * @notice Manages fleet dispatch and delegates resolution to FleetResolver
 * @dev Called by NexusGame router, writes to GameState
 */
contract FleetManager {

    GameState public immutable gameState;
    GameConfig public immutable gameConfig;
    FleetResolver public immutable fleetResolver;
    address public immutable router;

    uint256 public constant MAX_SHIP_TYPES = 13;
    uint256 public constant MAX_DEFENSE_TYPES = 9;

    event FleetDispatched(
        uint256 indexed fleetId,
        address indexed owner,
        uint16[3] origin,
        uint16[3] destination,
        GameState.FleetMission mission,
        uint32 arrivalTime
    );

    modifier onlyRouter() {
        require(msg.sender == router, "FleetManager: only router");
        _;
    }

    constructor(address _router, address _gameState, address _gameConfig, address _fleetResolver) {
        router = _router;
        gameState = GameState(_gameState);
        gameConfig = GameConfig(_gameConfig);
        fleetResolver = FleetResolver(_fleetResolver);
    }

    // ============ RESEARCH BONUSES ============

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

    function _claimOutpostResources(uint16 galaxy, uint16 system, uint16 position) internal returns (uint256) {
        GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(galaxy, system, position);

        if (outpost.owner == address(0) || outpost.lastCollected == 0) {
            return outpost.storedResources;
        }

        GameConfig.OutpostConfig memory config = gameConfig.getOutpostConfig(outpost.outpostType);
        uint256 elapsed = block.timestamp - outpost.lastCollected;
        uint256 produced = (config.productionRate * gameConfig.productionMultiplier() * elapsed) / (3600 * 100);
        uint256 total = outpost.storedResources + produced;

        if (total > config.storageCap) {
            total = config.storageCap;
        }

        gameState.updateOutpostResources(galaxy, system, position, total, uint32(block.timestamp));

        return total;
    }

    function _claimResourcesInternal(uint256 planetId) internal {
        (uint256 titanium, uint256 helium3, uint256 darkMatter) = fleetResolver.calculateCurrentResources(planetId);
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

    // ============ FLEET RESOLUTION (delegated to FleetResolver) ============

    function resolveFleet(uint256 fleetId) external {
        fleetResolver.resolveFleet(fleetId);
    }

    function completeFleet(uint256 fleetId) external {
        fleetResolver.completeFleet(fleetId);
    }

    // ============ VIEW FUNCTIONS ============

    function calculateCurrentResources(uint256 planetId)
        public view returns (uint256 titanium, uint256 helium3, uint256 darkMatter)
    {
        return fleetResolver.calculateCurrentResources(planetId);
    }

    function calculateOutpostResources(uint16 galaxy, uint16 system, uint16 position)
        external view returns (uint256 currentResources, GameConfig.OutpostType outpostType)
    {
        return fleetResolver.calculateOutpostResources(galaxy, system, position);
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
        return fleetResolver.getOutpost(galaxy, system, position);
    }

    function getSystemOutposts(uint16 galaxy, uint16 system)
        external view returns (
            GameState.RaiderOutpost[5] memory outposts,
            uint256[5] memory currentResources,
            uint256[MAX_SHIP_TYPES][5] memory garrisons
        )
    {
        return fleetResolver.getSystemOutposts(galaxy, system);
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
