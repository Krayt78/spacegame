// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GameState.sol";
import "./GameConfig.sol";

/**
 * @title ResearchManager
 * @notice Manages research upgrades (per-player, not per-planet)
 * @dev Called by NexusGame router, writes to GameState
 */
contract ResearchManager {

    GameState public immutable gameState;
    GameConfig public immutable gameConfig;
    address public immutable router;

    // Events
    event ResearchStarted(address indexed player, GameConfig.ResearchType researchType, uint8 targetLevel, uint32 completionTime);
    event ResearchCompleted(address indexed player, GameConfig.ResearchType researchType, uint8 newLevel);
    event ResearchCancelled(address indexed player, GameConfig.ResearchType researchType);

    modifier onlyRouter() {
        require(msg.sender == router, "ResearchManager: only router");
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

    // ============ RESEARCH MANAGEMENT ============

    /**
     * @notice Start researching a technology
     * @param player The player starting research
     * @param researchType The research type to upgrade
     */
    function startResearch(address player, uint256 planetId, GameConfig.ResearchType researchType) external onlyRouter {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");
        require(researchType != GameConfig.ResearchType.NONE, "Invalid research type");

        // Check Research Node exists
        GameState.Buildings memory buildings = gameState.getPlanetBuildings(planetId);
        require(buildings.researchNode >= 1, "Research Node level 1 required");

        // Check no active research queue
        GameState.ResearchQueue memory queue = gameState.getResearchQueue(player);
        require(queue.completionTime == 0, "Research queue occupied");

        // Auto-claim resources first
        _claimResourcesInternal(planetId);

        // Get current research level and calculate cost
        uint8 currentLevel = gameState.getResearchLevel(player, researchType);
        require(currentLevel < 255, "Max research level reached");

        GameConfig.Cost memory cost = gameConfig.getResearchCost(researchType, currentLevel);

        // Check resources
        GameState.Resources memory res = gameState.getPlanetResources(planetId);
        require(res.titanium >= cost.titanium, "Insufficient titanium");
        require(res.helium3 >= cost.helium3, "Insufficient helium-3");
        require(res.darkMatter >= cost.darkMatter, "Insufficient dark matter");

        // Deduct resources
        gameState.deductResources(planetId, cost.titanium, cost.helium3, cost.darkMatter);

        // Calculate research time
        uint256 researchTime = gameConfig.getResearchTime(researchType, currentLevel, buildings.researchNode);
        uint32 completionTime = uint32(block.timestamp + researchTime);

        // Set research queue
        uint8 targetLevel = currentLevel + 1;
        gameState.setResearchQueue(player, researchType, targetLevel, completionTime);

        emit ResearchStarted(player, researchType, targetLevel, completionTime);
    }

    /**
     * @notice Complete research (can be called by anyone when timer is up)
     * @param player The player whose research to complete
     */
    function completeResearch(address player) external {
        GameState.ResearchQueue memory queue = gameState.getResearchQueue(player);
        require(queue.completionTime != 0, "No research in queue");
        require(block.timestamp >= queue.completionTime, "Research not complete yet");

        // Increment research level
        gameState.incrementResearchLevel(player, queue.researchType);

        emit ResearchCompleted(player, queue.researchType, queue.targetLevel);

        // Clear queue
        gameState.clearResearchQueue(player);
    }

    /**
     * @notice Cancel research and refund 50% of resources
     * @param player The player cancelling research
     */
    function cancelResearch(address player, uint256 planetId) external onlyRouter {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");

        GameState.ResearchQueue memory queue = gameState.getResearchQueue(player);
        require(queue.completionTime != 0, "No research in queue");

        // Calculate 50% refund based on what was paid (targetLevel - 1 = currentLevel at time of start)
        uint8 levelWhenStarted = queue.targetLevel - 1;
        GameConfig.Cost memory cost = gameConfig.getResearchCost(queue.researchType, levelWhenStarted);
        uint256 refundTitanium = cost.titanium / 2;
        uint256 refundHelium3 = cost.helium3 / 2;
        uint256 refundDarkMatter = cost.darkMatter / 2;

        gameState.addResources(planetId, refundTitanium, refundHelium3, refundDarkMatter);

        emit ResearchCancelled(player, queue.researchType);

        // Clear queue
        gameState.clearResearchQueue(player);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get all research levels for a player
     */
    function getPlayerResearch(address player)
        external
        view
        returns (GameState.ResearchLevels memory)
    {
        return gameState.getPlayerResearch(player);
    }

    /**
     * @notice Get research queue for a player
     */
    function getResearchQueue(address player)
        external
        view
        returns (GameState.ResearchQueue memory)
    {
        return gameState.getResearchQueue(player);
    }
}
