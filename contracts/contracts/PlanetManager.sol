// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GameState.sol";
import "./GameConfig.sol";

/**
 * @title PlanetManager
 * @notice Manages planet claiming, resources, and building upgrades
 * @dev Called by NexusGame router, writes to GameState
 */
contract PlanetManager {

    GameState public immutable gameState;
    GameConfig public immutable gameConfig;
    address public immutable router;

    // Events
    event PlanetClaimed(address indexed player, uint256 indexed planetId, uint16[3] coordinates, string name);
    event ResourcesClaimed(uint256 indexed planetId, uint256 titanium, uint256 helium3, uint256 darkMatter);
    event BuildingUpgradeStarted(uint256 indexed planetId, GameConfig.BuildingType buildingType, uint8 newLevel, uint32 completionTime);
    event BuildingUpgradeCompleted(uint256 indexed planetId, GameConfig.BuildingType buildingType, uint8 newLevel);
    event BuildingUpgradeCancelled(uint256 indexed planetId, GameConfig.BuildingType buildingType);

    modifier onlyRouter() {
        require(msg.sender == router, "PlanetManager: only router");
        _;
    }

    constructor(address _router, address _gameState, address _gameConfig) {
        router = _router;
        gameState = GameState(_gameState);
        gameConfig = GameConfig(_gameConfig);
    }

    // ============ PLANET MANAGEMENT ============

    /**
     * @notice Claim a starter planet (free, one per address)
     * @param player The player claiming the planet
     * @param planetName Custom name for the planet
     */
    function claimStarterPlanet(address player, string calldata planetName) external onlyRouter {
        require(gameState.getPlayerPlanet(player) == 0, "Already claimed planet");
        require(bytes(planetName).length > 0 && bytes(planetName).length <= 32, "Invalid planet name");

        uint256 planetId = gameState.incrementNextPlanetId();

        // Assign sequential coordinates (150 planets per galaxy, positions 1-10 only, 11-15 are for outposts)
        // Skip coordinates already occupied by colonized planets
        uint16 galaxy;
        uint16 system;
        uint16 position;
        while (true) {
            galaxy = uint16((planetId - 1) / 150 + 1);
            system = uint16(((planetId - 1) % 150) / 10 + 1);
            position = uint16((planetId - 1) % 10 + 1);

            if (gameState.getCoordinateToPlanet(galaxy, system, position) == 0) {
                break;
            }
            planetId = gameState.incrementNextPlanetId();
        }

        // Create planet in GameState
        gameState.createPlanet(planetId, player, [galaxy, system, position], planetName);

        // Initialize starting buildings
        gameState.setPlanetBuildings(planetId, GameState.Buildings({
            titaniumExtractor: 1,
            helium3Harvester: 1,
            darkMatterCollector: 0,
            titaniumVault: 0,
            helium3Tank: 0,
            darkMatterContainment: 0,
            shipyard: 0,
            researchNode: 0,
            undergroundBunker: 0
        }));

        // Initialize starting resources
        GameConfig.Cost memory starting = gameConfig.getStartingResources();
        gameState.setPlanetResources(
            planetId,
            starting.titanium,
            starting.helium3,
            starting.darkMatter,
            uint32(block.timestamp)
        );

        emit PlanetClaimed(player, planetId, [galaxy, system, position], planetName);
    }

    // ============ RESOURCE MANAGEMENT ============

    /**
     * @notice Calculate current resources based on time elapsed
     * @dev View function - doesn't update state
     */
    function calculateCurrentResources(uint256 planetId)
        public
        view
        returns (uint256 titanium, uint256 helium3, uint256 darkMatter)
    {
        require(gameState.planetExists(planetId), "Planet does not exist");

        GameState.Resources memory res = gameState.getPlanetResources(planetId);
        GameState.Buildings memory buildings = gameState.getPlanetBuildings(planetId);

        // Time elapsed since last claim (in seconds)
        uint256 timeElapsed = block.timestamp - res.lastClaimed;

        // Get production rates (per hour)
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

        // Calculate accumulated resources
        titanium = res.titanium + (titaniumProd * timeElapsed) / 3600;
        helium3 = res.helium3 + (helium3Prod * timeElapsed) / 3600;
        darkMatter = res.darkMatter + (darkMatterProd * timeElapsed) / 3600;

        // Cap at storage capacity
        uint256 titaniumCap = _getStorageCapacity(GameConfig.BuildingType.TITANIUM_VAULT, buildings.titaniumVault);
        uint256 helium3Cap = _getStorageCapacity(GameConfig.BuildingType.HELIUM3_TANK, buildings.helium3Tank);
        uint256 darkMatterCap = _getStorageCapacity(GameConfig.BuildingType.DARKMATTER_CONTAINMENT, buildings.darkMatterContainment);

        if (titanium > titaniumCap) titanium = titaniumCap;
        if (helium3 > helium3Cap) helium3 = helium3Cap;
        if (darkMatter > darkMatterCap) darkMatter = darkMatterCap;
    }

    /**
     * @notice Internal helper for storage capacity
     */
    function _getStorageCapacity(GameConfig.BuildingType buildingType, uint8 level)
        internal
        view
        returns (uint256)
    {
        if (level == 0) return 100000; // Default cap if no storage
        return gameConfig.getStorageCapacity(buildingType, level);
    }

    /**
     * @notice Claim accumulated resources (updates timestamp)
     * @param player The player claiming resources
     */
    function claimResources(address player, uint256 planetId) external onlyRouter {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");

        _claimResourcesInternal(planetId);
    }

    /**
     * @notice Internal resource claiming for a specific planet
     */
    function _claimResourcesInternal(uint256 planetId) internal {
        (uint256 titanium, uint256 helium3, uint256 darkMatter) = calculateCurrentResources(planetId);

        gameState.setPlanetResources(planetId, titanium, helium3, darkMatter, uint32(block.timestamp));

        emit ResourcesClaimed(planetId, titanium, helium3, darkMatter);
    }

    /**
     * @notice Public version for other managers to call
     * @dev Anyone can call this - it just updates resources to current time
     */
    function claimResourcesForPlanet(uint256 planetId) external {
        require(gameState.planetExists(planetId), "Planet does not exist");
        _claimResourcesInternal(planetId);
    }

    /**
     * @notice Get current production rates
     */
    function getProductionRates(uint256 planetId)
        external
        view
        returns (uint256 titaniumPerHour, uint256 helium3PerHour, uint256 darkMatterPerHour)
    {
        require(gameState.planetExists(planetId), "Planet does not exist");

        GameState.Buildings memory buildings = gameState.getPlanetBuildings(planetId);

        titaniumPerHour = gameConfig.getProduction(GameConfig.BuildingType.TITANIUM_EXTRACTOR, buildings.titaniumExtractor);
        helium3PerHour = gameConfig.getProduction(GameConfig.BuildingType.HELIUM3_HARVESTER, buildings.helium3Harvester);
        darkMatterPerHour = gameConfig.getProduction(GameConfig.BuildingType.DARKMATTER_COLLECTOR, buildings.darkMatterCollector);
    }

    /**
     * @notice Calculate plunderable resources for a planet (used by raid system)
     * @dev Plunderable = max(0, total - bunkerProtection) / 2
     */
    function getPlunderableResources(uint256 planetId)
        external
        view
        returns (uint256 titanium, uint256 helium3, uint256 darkMatter)
    {
        (uint256 totalTi, uint256 totalHe, uint256 totalDm) = calculateCurrentResources(planetId);
        uint8 bunkerLevel = gameState.getBuildingLevel(planetId, GameConfig.BuildingType.UNDERGROUND_BUNKER);
        uint256 protection = gameConfig.getStorageCapacity(GameConfig.BuildingType.UNDERGROUND_BUNKER, bunkerLevel);

        titanium = totalTi > protection ? (totalTi - protection) / 2 : 0;
        helium3 = totalHe > protection ? (totalHe - protection) / 2 : 0;
        darkMatter = totalDm > protection ? (totalDm - protection) / 2 : 0;
    }

    // ============ BUILDING MANAGEMENT ============

    /**
     * @notice Start a building upgrade
     * @param player The player upgrading
     * @param buildingType The building to upgrade
     */
    function upgradeBuilding(address player, uint256 planetId, GameConfig.BuildingType buildingType) external onlyRouter {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");
        require(buildingType != GameConfig.BuildingType.NONE, "Invalid building type");

        // Check no building in queue
        GameState.BuildQueue memory queue = gameState.getBuildQueue(planetId);
        require(queue.completionTime == 0, "Build queue occupied");

        // Auto-claim resources first
        _claimResourcesInternal(planetId);

        // Get current building level
        uint8 currentLevel = gameState.getBuildingLevel(planetId, buildingType);
        require(currentLevel < 255, "Max level reached");

        // Get upgrade cost
        GameConfig.Cost memory cost = gameConfig.getUpgradeCost(buildingType, currentLevel);

        // Check resources
        GameState.Resources memory res = gameState.getPlanetResources(planetId);
        require(res.titanium >= cost.titanium, "Insufficient titanium");
        require(res.helium3 >= cost.helium3, "Insufficient helium-3");
        require(res.darkMatter >= cost.darkMatter, "Insufficient dark matter");

        // Deduct resources
        gameState.deductResources(planetId, cost.titanium, cost.helium3, cost.darkMatter);

        // Calculate build time
        uint256 buildTime = gameConfig.getBuildTime(buildingType, currentLevel);
        uint32 completionTime = uint32(block.timestamp + buildTime);

        // Add to queue
        gameState.setBuildQueue(planetId, buildingType, currentLevel + 1, completionTime);

        emit BuildingUpgradeStarted(planetId, buildingType, currentLevel + 1, completionTime);
    }

    /**
     * @notice Complete building upgrade (auto-called or manual)
     * @dev Can be called by anyone when timer is up
     */
    function completeUpgrade(uint256 planetId) external {
        require(gameState.planetExists(planetId), "Planet does not exist");

        GameState.BuildQueue memory queue = gameState.getBuildQueue(planetId);
        require(queue.completionTime != 0, "No upgrade in queue");
        require(block.timestamp >= queue.completionTime, "Upgrade not complete yet");

        // Increment building level
        gameState.incrementBuildingLevel(planetId, queue.buildingType);

        emit BuildingUpgradeCompleted(planetId, queue.buildingType, queue.targetLevel);

        // Clear queue
        gameState.clearBuildQueue(planetId);
    }

    /**
     * @notice Cancel upgrade and refund resources (50% penalty)
     * @param player The player cancelling
     */
    function cancelUpgrade(address player, uint256 planetId) external onlyRouter {
        require(gameState.playerOwnsPlanet(player, planetId), "Not your planet");

        GameState.BuildQueue memory queue = gameState.getBuildQueue(planetId);
        require(queue.completionTime != 0, "No upgrade in queue");

        // Get cost and refund 50%
        uint8 currentLevel = gameState.getBuildingLevel(planetId, queue.buildingType);
        GameConfig.Cost memory cost = gameConfig.getUpgradeCost(queue.buildingType, currentLevel);

        gameState.addResources(planetId, cost.titanium / 2, cost.helium3 / 2, cost.darkMatter / 2);

        emit BuildingUpgradeCancelled(planetId, queue.buildingType);

        // Clear queue
        gameState.clearBuildQueue(planetId);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get all planets in a system for galaxy map view
     */
    function getSystemPlanets(uint16 galaxy, uint16 system)
        external
        view
        returns (GameState.Planet[10] memory systemPlanets)
    {
        for (uint16 pos = 1; pos <= 10; pos++) {
            uint256 planetId = gameState.getCoordinateToPlanet(galaxy, system, pos);
            if (planetId != 0) {
                GameState.Planet memory planet = gameState.getPlanet(planetId);
                if (planet.exists) {
                    systemPlanets[pos - 1] = planet;
                }
            }
        }
    }

    /**
     * @notice Get complete planet info
     */
    function getPlanet(uint256 planetId)
        external
        view
        returns (
            GameState.Planet memory planet,
            GameState.Buildings memory buildings,
            GameState.Resources memory resources,
            GameState.BuildQueue memory queue,
            GameState.ShipQueue memory shipQueue
        )
    {
        require(gameState.planetExists(planetId), "Planet does not exist");

        return (
            gameState.getPlanet(planetId),
            gameState.getPlanetBuildings(planetId),
            gameState.getPlanetResources(planetId),
            gameState.getBuildQueue(planetId),
            gameState.getShipQueue(planetId)
        );
    }

    /**
     * @notice Check if player can afford an upgrade
     */
    function canAffordUpgrade(uint256 planetId, GameConfig.BuildingType buildingType)
        external
        view
        returns (bool)
    {
        require(gameState.planetExists(planetId), "Planet does not exist");

        uint8 currentLevel = gameState.getBuildingLevel(planetId, buildingType);
        GameConfig.Cost memory cost = gameConfig.getUpgradeCost(buildingType, currentLevel);

        (uint256 titanium, uint256 helium3, uint256 darkMatter) = calculateCurrentResources(planetId);

        return titanium >= cost.titanium &&
               helium3 >= cost.helium3 &&
               darkMatter >= cost.darkMatter;
    }
}
