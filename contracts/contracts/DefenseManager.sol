// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GameState.sol";
import "./GameConfig.sol";

/**
 * @title DefenseManager
 * @notice Manages defense building and defense queues
 * @dev Called by NexusGame router, writes to GameState
 */
contract DefenseManager {

    GameState public immutable gameState;
    GameConfig public immutable gameConfig;
    address public immutable router;

    // Events
    event DefenseBuildStarted(uint256 indexed planetId, GameConfig.DefenseType defenseType, uint256 quantity, uint32 completionTime);
    event DefenseBuildCompleted(uint256 indexed planetId, GameConfig.DefenseType defenseType, uint256 quantity);
    event DefenseBuildCancelled(uint256 indexed planetId, GameConfig.DefenseType defenseType, uint256 quantity);

    modifier onlyRouter() {
        require(msg.sender == router, "DefenseManager: only router");
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

    // ============ DEFENSE MANAGEMENT ============

    /**
     * @notice Start building defenses
     * @param player The player building defenses
     * @param planetId The planet to build on
     * @param defenseType The type of defense to build
     * @param quantity Number of defenses to build
     */
    function buildDefenses(address player, uint256 planetId, GameConfig.DefenseType defenseType, uint256 quantity) external onlyRouter {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");
        require(defenseType != GameConfig.DefenseType.NONE, "Invalid defense type");
        require(quantity > 0, "Quantity must be greater than 0");

        // Check defense prerequisites
        GameState.Buildings memory buildings = gameState.getPlanetBuildings(planetId);
        GameConfig.DefenseRequirements memory reqs = gameConfig.getDefenseRequirements(defenseType);
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

        // Check per-planet limit (shield domes)
        GameConfig.DefenseConfig memory config = gameConfig.getDefenseConfig(defenseType);
        if (config.limit > 0) {
            uint256 currentCount = gameState.getPlanetDefenseCount(planetId, uint8(defenseType));
            require(currentCount + quantity <= config.limit, "Defense limit reached");
        }

        // Check no defense build in queue
        GameState.DefenseQueue memory queue = gameState.getDefenseQueue(planetId);
        require(queue.completionTime == 0, "Defense queue occupied");

        // Auto-claim resources first
        _claimResourcesInternal(planetId);

        // Calculate total cost
        uint256 totalTitanium = config.cost.titanium * quantity;
        uint256 totalHelium3 = config.cost.helium3 * quantity;
        uint256 totalDarkMatter = config.cost.darkMatter * quantity;

        // Check resources
        GameState.Resources memory res = gameState.getPlanetResources(planetId);
        require(res.titanium >= totalTitanium, "Insufficient titanium");
        require(res.helium3 >= totalHelium3, "Insufficient helium-3");
        require(res.darkMatter >= totalDarkMatter, "Insufficient dark matter");

        // Deduct resources
        gameState.deductResources(planetId, totalTitanium, totalHelium3, totalDarkMatter);

        // Calculate build time
        uint256 buildTime = gameConfig.getDefenseBuildTime(defenseType, quantity, buildings.shipyard);
        uint32 completionTime = uint32(block.timestamp + buildTime);

        // Add to queue
        gameState.setDefenseQueue(planetId, defenseType, quantity, completionTime);

        emit DefenseBuildStarted(planetId, defenseType, quantity, completionTime);
    }

    /**
     * @notice Complete defense build (auto-called or manual)
     * @dev Can be called by anyone when timer is up
     */
    function completeDefenseBuild(uint256 planetId) external {
        require(gameState.planetExists(planetId), "Planet does not exist");

        GameState.DefenseQueue memory queue = gameState.getDefenseQueue(planetId);
        require(queue.completionTime != 0, "No defense build in queue");
        require(block.timestamp >= queue.completionTime, "Defense build not complete yet");

        // Add defenses to planet
        uint8 defenseTypeIndex = uint8(queue.defenseType);
        gameState.addPlanetDefenses(planetId, defenseTypeIndex, queue.quantity);

        emit DefenseBuildCompleted(planetId, queue.defenseType, queue.quantity);

        // Clear queue
        gameState.clearDefenseQueue(planetId);
    }

    /**
     * @notice Cancel defense build and refund resources (50% penalty)
     * @param player The player cancelling
     */
    function cancelDefenseBuild(address player, uint256 planetId) external onlyRouter {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");

        GameState.DefenseQueue memory queue = gameState.getDefenseQueue(planetId);
        require(queue.completionTime != 0, "No defense build in queue");

        // Get cost and refund 50%
        GameConfig.Cost memory unitCost = gameConfig.getDefenseCost(queue.defenseType);
        uint256 refundTitanium = (unitCost.titanium * queue.quantity) / 2;
        uint256 refundHelium3 = (unitCost.helium3 * queue.quantity) / 2;
        uint256 refundDarkMatter = (unitCost.darkMatter * queue.quantity) / 2;

        gameState.addResources(planetId, refundTitanium, refundHelium3, refundDarkMatter);

        emit DefenseBuildCancelled(planetId, queue.defenseType, queue.quantity);

        // Clear queue
        gameState.clearDefenseQueue(planetId);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get all defense counts for a planet
     */
    function getDefenses(uint256 planetId)
        external
        view
        returns (uint256[9] memory)
    {
        require(gameState.planetExists(planetId), "Planet does not exist");
        return gameState.getPlanetDefenses(planetId);
    }

    /**
     * @notice Get defense count for a specific defense type
     */
    function getDefenseCount(uint256 planetId, uint8 defenseType)
        external
        view
        returns (uint256)
    {
        require(gameState.planetExists(planetId), "Planet does not exist");
        return gameState.getPlanetDefenseCount(planetId, defenseType);
    }
}
