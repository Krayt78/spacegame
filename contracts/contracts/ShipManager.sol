// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GameState.sol";
import "./GameConfig.sol";

/**
 * @title ShipManager
 * @notice Manages ship building and ship queues
 * @dev Called by NexusGame router, writes to GameState
 */
contract ShipManager {

    GameState public immutable gameState;
    GameConfig public immutable gameConfig;
    address public immutable router;

    // Events
    event ShipBuildStarted(uint256 indexed planetId, GameConfig.ShipType shipType, uint256 quantity, uint32 completionTime);
    event ShipBuildCompleted(uint256 indexed planetId, GameConfig.ShipType shipType, uint256 quantity);
    event ShipBuildCancelled(uint256 indexed planetId, GameConfig.ShipType shipType, uint256 quantity);

    modifier onlyRouter() {
        require(msg.sender == router, "ShipManager: only router");
        _;
    }

    constructor(address _router, address _gameState, address _gameConfig) {
        router = _router;
        gameState = GameState(_gameState);
        gameConfig = GameConfig(_gameConfig);
    }

    // ============ RESOURCE HELPERS ============

    /**
     * @notice Calculate current resources based on time elapsed
     * @dev Duplicated from PlanetManager to avoid cross-contract calls
     */
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

    // ============ SHIP MANAGEMENT ============

    /**
     * @notice Start building ships
     * @param player The player building ships
     * @param shipType The type of ship to build
     * @param quantity Number of ships to build
     */
    function buildShips(address player, uint256 planetId, GameConfig.ShipType shipType, uint256 quantity) external onlyRouter {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");
        require(shipType != GameConfig.ShipType.NONE, "Invalid ship type");
        require(quantity > 0, "Quantity must be greater than 0");

        // Check ship prerequisites
        GameState.Buildings memory buildings = gameState.getPlanetBuildings(planetId);
        GameConfig.ShipRequirements memory reqs = gameConfig.getShipRequirements(shipType);
        require(buildings.shipyard >= reqs.shipyardLevel, "Insufficient shipyard level");

        // Check research prerequisites
        if (reqs.researchReq1 != GameConfig.ResearchType.NONE) {
            require(
                gameState.getResearchLevel(player, reqs.researchReq1) >= reqs.researchLevel1,
                "Missing research requirement 1"
            );
        }
        if (reqs.researchReq2 != GameConfig.ResearchType.NONE) {
            require(
                gameState.getResearchLevel(player, reqs.researchReq2) >= reqs.researchLevel2,
                "Missing research requirement 2"
            );
        }
        if (reqs.researchReq3 != GameConfig.ResearchType.NONE) {
            require(
                gameState.getResearchLevel(player, reqs.researchReq3) >= reqs.researchLevel3,
                "Missing research requirement 3"
            );
        }

        // Check no ship build in queue
        GameState.ShipQueue memory queue = gameState.getShipQueue(planetId);
        require(queue.completionTime == 0, "Ship queue occupied");

        // Auto-claim resources first
        _claimResourcesInternal(planetId);

        // Get ship cost and calculate total cost
        GameConfig.Cost memory unitCost = gameConfig.getShipCost(shipType);
        uint256 totalTitanium = unitCost.titanium * quantity;
        uint256 totalHelium3 = unitCost.helium3 * quantity;
        uint256 totalDarkMatter = unitCost.darkMatter * quantity;

        // Check resources
        GameState.Resources memory res = gameState.getPlanetResources(planetId);
        require(res.titanium >= totalTitanium, "Insufficient titanium");
        require(res.helium3 >= totalHelium3, "Insufficient helium-3");
        require(res.darkMatter >= totalDarkMatter, "Insufficient dark matter");

        // Deduct resources
        gameState.deductResources(planetId, totalTitanium, totalHelium3, totalDarkMatter);

        // Calculate build time
        uint256 buildTime = gameConfig.getShipBuildTime(shipType, quantity, buildings.shipyard);
        uint32 completionTime = uint32(block.timestamp + buildTime);

        // Add to queue
        gameState.setShipQueue(planetId, shipType, quantity, completionTime);

        emit ShipBuildStarted(planetId, shipType, quantity, completionTime);
    }

    /**
     * @notice Complete ship build (auto-called or manual)
     * @dev Can be called by anyone when timer is up
     */
    function completeShipBuild(uint256 planetId) external {
        require(gameState.planetExists(planetId), "Planet does not exist");

        GameState.ShipQueue memory queue = gameState.getShipQueue(planetId);
        require(queue.completionTime != 0, "No ship build in queue");
        require(block.timestamp >= queue.completionTime, "Ship build not complete yet");

        // Add ships to planet
        uint8 shipTypeIndex = uint8(queue.shipType);
        gameState.addPlanetShips(planetId, shipTypeIndex, queue.quantity);

        emit ShipBuildCompleted(planetId, queue.shipType, queue.quantity);

        // Clear queue
        gameState.clearShipQueue(planetId);
    }

    /**
     * @notice Cancel ship build and refund resources (50% penalty)
     * @param player The player cancelling
     */
    function cancelShipBuild(address player, uint256 planetId) external onlyRouter {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");

        GameState.ShipQueue memory queue = gameState.getShipQueue(planetId);
        require(queue.completionTime != 0, "No ship build in queue");

        // Get cost and refund 50%
        GameConfig.Cost memory unitCost = gameConfig.getShipCost(queue.shipType);
        uint256 refundTitanium = (unitCost.titanium * queue.quantity) / 2;
        uint256 refundHelium3 = (unitCost.helium3 * queue.quantity) / 2;
        uint256 refundDarkMatter = (unitCost.darkMatter * queue.quantity) / 2;

        gameState.addResources(planetId, refundTitanium, refundHelium3, refundDarkMatter);

        emit ShipBuildCancelled(planetId, queue.shipType, queue.quantity);

        // Clear queue
        gameState.clearShipQueue(planetId);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get all ship counts for a planet
     */
    function getShips(uint256 planetId)
        external
        view
        returns (uint256[13] memory)
    {
        require(gameState.planetExists(planetId), "Planet does not exist");
        return gameState.getPlanetShips(planetId);
    }

    /**
     * @notice Get ship count for a specific ship type
     */
    function getShipCount(uint256 planetId, uint8 shipType)
        external
        view
        returns (uint256)
    {
        require(gameState.planetExists(planetId), "Planet does not exist");
        return gameState.getPlanetShipCount(planetId, shipType);
    }
}
