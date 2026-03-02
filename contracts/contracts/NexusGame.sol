// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GameState.sol";
import "./GameConfig.sol";
import "./PlanetManager.sol";
import "./ShipManager.sol";
import "./FleetManager.sol";
import "./ResearchManager.sol";
import "./DefenseManager.sol";
import "./TutorialManager.sol";

/**
 * @title NexusGame
 * @notice Main entry point (router) for Nexus Protocol
 * @dev Routes all calls to appropriate manager contracts while maintaining backwards-compatible ABI
 */
contract NexusGame is Ownable, ReentrancyGuard {

    // Contract references
    GameState public gameState;
    GameConfig public gameConfig;
    PlanetManager public planetManager;
    ShipManager public shipManager;
    FleetManager public fleetManager;
    ResearchManager public researchManager;
    DefenseManager public defenseManager;
    TutorialManager public tutorialManager;

    // Maximum number of ship types (for ABI compatibility)
    uint256 public constant MAX_SHIP_TYPES = 13;
    uint256 public constant MAX_DEFENSE_TYPES = 9;

    // Re-export enums for ABI compatibility
    enum FleetMission { NONE, RAID, CAPTURE, MOVE, COLONIZE }
    enum FleetStatus { NONE, TRAVELING, RETURNING }

    constructor(address _gameState, address _gameConfig) Ownable(msg.sender) {
        gameState = GameState(_gameState);
        gameConfig = GameConfig(_gameConfig);
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @notice Set manager contract addresses (owner only)
     * @dev Called after managers are deployed
     */
    function updateManagers(
        address _planetManager,
        address _shipManager,
        address _fleetManager
    ) external onlyOwner {
        planetManager = PlanetManager(_planetManager);
        shipManager = ShipManager(_shipManager);
        fleetManager = FleetManager(_fleetManager);
    }

    /**
     * @notice Set ResearchManager contract address (owner only)
     */
    function setResearchManager(address _researchManager) external onlyOwner {
        researchManager = ResearchManager(_researchManager);
    }

    /**
     * @notice Set DefenseManager contract address (owner only)
     */
    function setDefenseManager(address _defenseManager) external onlyOwner {
        defenseManager = DefenseManager(_defenseManager);
    }

    /**
     * @notice Set TutorialManager contract address (owner only)
     */
    function setTutorialManager(address _tutorialManager) external onlyOwner {
        tutorialManager = TutorialManager(_tutorialManager);
    }

    /**
     * @notice Update GameConfig contract address (owner only)
     */
    function updateGameConfig(address newConfigAddress) external onlyOwner {
        gameConfig = GameConfig(newConfigAddress);
    }

    /**
     * @notice Update GameState contract address (owner only)
     */
    function updateGameState(address newStateAddress) external onlyOwner {
        gameState = GameState(newStateAddress);
    }

    // ============ PLANET ROUTES ============

    /**
     * @notice Claim a starter planet (free, one per address)
     */
    function claimStarterPlanet(string calldata planetName) external {
        planetManager.claimStarterPlanet(msg.sender, planetName);
    }

    /**
     * @notice Claim accumulated resources
     */
    function claimResources(uint256 planetId) external {
        planetManager.claimResources(msg.sender, planetId);
    }

    /**
     * @notice Start a building upgrade
     */
    function upgradeBuilding(uint256 planetId, GameConfig.BuildingType buildingType) external nonReentrant {
        planetManager.upgradeBuilding(msg.sender, planetId, buildingType);
    }

    /**
     * @notice Complete building upgrade
     */
    function completeUpgrade(uint256 planetId) external {
        planetManager.completeUpgrade(planetId);
    }

    /**
     * @notice Cancel upgrade and refund resources (50% penalty)
     */
    function cancelUpgrade(uint256 planetId) external {
        planetManager.cancelUpgrade(msg.sender, planetId);
    }

    // ============ SHIP ROUTES ============

    /**
     * @notice Start building ships
     */
    function buildShips(uint256 planetId, GameConfig.ShipType shipType, uint256 quantity) external nonReentrant {
        shipManager.buildShips(msg.sender, planetId, shipType, quantity);
    }

    /**
     * @notice Complete ship build
     */
    function completeShipBuild(uint256 planetId) external {
        shipManager.completeShipBuild(planetId);
    }

    /**
     * @notice Cancel ship build and refund resources (50% penalty)
     */
    function cancelShipBuild(uint256 planetId) external {
        shipManager.cancelShipBuild(msg.sender, planetId);
    }

    // ============ DEFENSE ROUTES ============

    /**
     * @notice Start building defenses
     */
    function buildDefenses(uint256 planetId, GameConfig.DefenseType defenseType, uint256 quantity) external nonReentrant {
        defenseManager.buildDefenses(msg.sender, planetId, defenseType, quantity);
    }

    /**
     * @notice Complete defense build
     */
    function completeDefenseBuild(uint256 planetId) external {
        defenseManager.completeDefenseBuild(planetId);
    }

    /**
     * @notice Cancel defense build and refund resources (50% penalty)
     */
    function cancelDefenseBuild(uint256 planetId) external {
        defenseManager.cancelDefenseBuild(msg.sender, planetId);
    }

    // ============ RESEARCH ROUTES ============

    /**
     * @notice Start researching a technology
     */
    function startResearch(uint256 planetId, GameConfig.ResearchType researchType) external nonReentrant {
        researchManager.startResearch(msg.sender, planetId, researchType);
    }

    /**
     * @notice Complete research
     */
    function completeResearch(address player) external {
        researchManager.completeResearch(player);
    }

    /**
     * @notice Cancel research and refund resources (50% penalty)
     */
    function cancelResearch(uint256 planetId) external {
        researchManager.cancelResearch(msg.sender, planetId);
    }

    // ============ FLEET ROUTES ============

    /**
     * @notice Dispatch a fleet on a mission
     */
    function dispatchFleet(
        uint256 planetId,
        uint256[MAX_SHIP_TYPES] calldata ships,
        uint16[3] calldata destination,
        FleetMission mission,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) external nonReentrant returns (uint256 fleetId) {
        return fleetManager.dispatchFleet(
            msg.sender,
            planetId,
            ships,
            destination,
            GameState.FleetMission(uint8(mission)),
            cargoTitanium,
            cargoHelium3,
            cargoDarkMatter
        );
    }

    /**
     * @notice Dispatch a fleet from an outpost (garrison ships back to planet)
     * @param origin The outpost coordinates [galaxy, system, position]
     * @param ships Ships to dispatch from outpost garrison
     * @param destination The destination coordinates (must be player's own planet)
     * @param cargoTitanium Titanium cargo to load from outpost
     * @param cargoHelium3 Helium-3 cargo to load from outpost
     * @param cargoDarkMatter Dark matter cargo to load from outpost
     */
    function dispatchFleetFromOutpost(
        uint16[3] calldata origin,
        uint256[MAX_SHIP_TYPES] calldata ships,
        uint16[3] calldata destination,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) external nonReentrant returns (uint256 fleetId) {
        return fleetManager.dispatchFleetFromOutpost(
            msg.sender,
            origin,
            ships,
            destination,
            cargoTitanium,
            cargoHelium3,
            cargoDarkMatter
        );
    }

    /**
     * @notice Resolve a fleet that has arrived at its destination
     */
    function resolveFleet(uint256 fleetId) external nonReentrant {
        fleetManager.resolveFleet(fleetId);
    }

    /**
     * @notice Complete a returning fleet
     */
    function completeFleet(uint256 fleetId) external nonReentrant {
        fleetManager.completeFleet(fleetId);
    }

    // ============ VIEW FUNCTION ROUTES ============

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
        return planetManager.getPlanet(planetId);
    }

    /**
     * @notice Get all planets in a system
     */
    function getSystemPlanets(uint16 galaxy, uint16 system)
        external
        view
        returns (GameState.Planet[10] memory)
    {
        return planetManager.getSystemPlanets(galaxy, system);
    }

    /**
     * @notice Calculate current resources based on time elapsed
     */
    function calculateCurrentResources(uint256 planetId)
        external
        view
        returns (uint256 titanium, uint256 helium3, uint256 darkMatter)
    {
        return planetManager.calculateCurrentResources(planetId);
    }

    /**
     * @notice Get current production rates
     */
    function getProductionRates(uint256 planetId)
        external
        view
        returns (uint256 titaniumPerHour, uint256 helium3PerHour, uint256 darkMatterPerHour)
    {
        return planetManager.getProductionRates(planetId);
    }

    /**
     * @notice Check if player can afford an upgrade
     */
    function canAffordUpgrade(uint256 planetId, GameConfig.BuildingType buildingType)
        external
        view
        returns (bool)
    {
        return planetManager.canAffordUpgrade(planetId, buildingType);
    }

    /**
     * @notice Get plunderable resources for a planet (accounts for bunker protection and 50% cap)
     */
    function getPlunderableResources(uint256 planetId)
        external
        view
        returns (uint256 titanium, uint256 helium3, uint256 darkMatter)
    {
        return planetManager.getPlunderableResources(planetId);
    }

    /**
     * @notice Get player's starter planet ID
     */
    function getPlayerPlanetId(address player) external view returns (uint256) {
        return gameState.getPlayerPlanet(player);
    }

    /**
     * @notice Get all planet IDs owned by a player
     */
    function getPlayerPlanets(address player) external view returns (uint256[] memory) {
        return gameState.getPlayerPlanets(player);
    }

    /**
     * @notice Get number of planets owned by a player
     */
    function getPlayerPlanetCount(address player) external view returns (uint256) {
        return gameState.getPlayerPlanetCount(player);
    }

    /**
     * @notice Check if address has claimed a planet
     */
    function hasPlanet(address player) external view returns (bool) {
        return gameState.getPlayerPlanet(player) != 0;
    }

    /**
     * @notice Get all ship counts for a planet
     */
    function getShips(uint256 planetId) external view returns (uint256[MAX_SHIP_TYPES] memory) {
        return shipManager.getShips(planetId);
    }

    /**
     * @notice Get ship count for a specific ship type
     */
    function getShipCount(uint256 planetId, uint8 shipType) external view returns (uint256) {
        return shipManager.getShipCount(planetId, shipType);
    }

    /**
     * @notice Get all defense counts for a planet
     */
    function getDefenses(uint256 planetId) external view returns (uint256[MAX_DEFENSE_TYPES] memory) {
        return defenseManager.getDefenses(planetId);
    }

    /**
     * @notice Get defense count for a specific defense type
     */
    function getDefenseCount(uint256 planetId, uint8 defenseType) external view returns (uint256) {
        return defenseManager.getDefenseCount(planetId, defenseType);
    }

    /**
     * @notice Get a fleet's full data
     */
    function getFleet(uint256 fleetId) external view returns (GameState.Fleet memory) {
        return fleetManager.getFleet(fleetId);
    }

    /**
     * @notice Get all fleet IDs for a player
     */
    function getPlayerFleetIds(address player) external view returns (uint256[] memory) {
        return fleetManager.getPlayerFleetIds(player);
    }

    /**
     * @notice Get number of active fleets for a player
     */
    function getPlayerFleetCount(address player) external view returns (uint256) {
        return fleetManager.getPlayerFleetCount(player);
    }

    /**
     * @notice Get stationed ships at coordinates
     */
    function getStationedShips(uint16[3] calldata coords) external view returns (uint256[MAX_SHIP_TYPES] memory) {
        return fleetManager.getStationedShips(coords);
    }

    /**
     * @notice Get planet ID at specific coordinates
     */
    function getPlanetIdAtCoordinates(uint16 galaxy, uint16 system, uint16 position) external view returns (uint256) {
        return gameState.getCoordinateToPlanet(galaxy, system, position);
    }

    /**
     * @notice Calculate outpost resources
     */
    function calculateOutpostResources(uint16 galaxy, uint16 system, uint16 position)
        external
        view
        returns (uint256 currentResources, GameConfig.OutpostType outpostType)
    {
        return fleetManager.calculateOutpostResources(galaxy, system, position);
    }

    /**
     * @notice Get outpost data at specific coordinates
     */
    function getOutpost(uint16 galaxy, uint16 system, uint16 position)
        external
        view
        returns (
            GameState.RaiderOutpost memory outpost,
            uint256 currentResources,
            uint256[MAX_SHIP_TYPES] memory garrison
        )
    {
        return fleetManager.getOutpost(galaxy, system, position);
    }

    /**
     * @notice Get all outposts in a system (positions 11-15)
     */
    function getSystemOutposts(uint16 galaxy, uint16 system)
        external
        view
        returns (
            GameState.RaiderOutpost[5] memory outposts,
            uint256[5] memory currentResources,
            uint256[MAX_SHIP_TYPES][5] memory garrisons
        )
    {
        return fleetManager.getSystemOutposts(galaxy, system);
    }

    // ============ BATTLE REPORT VIEWS ============

    function getBattleReport(uint256 reportId) external view returns (GameState.BattleReport memory) {
        return fleetManager.getBattleReport(reportId);
    }

    function getPlayerReportIds(address player) external view returns (uint256[] memory) {
        return fleetManager.getPlayerReportIds(player);
    }

    function getPlayerReportCount(address player) external view returns (uint256) {
        return fleetManager.getPlayerReportCount(player);
    }

    function getPlayerRecentReports(address player, uint256 count) external view returns (uint256[] memory) {
        return fleetManager.getPlayerRecentReports(player, count);
    }

    // ============ RESEARCH BONUS VIEWS ============

    /**
     * @notice Get combat stats for a ship type with a player's research bonuses applied
     */
    function getShipCombatStats(GameConfig.ShipType shipType, address player) external view returns (GameConfig.CombatStats memory) {
        GameState.ResearchLevels memory r = gameState.getPlayerResearch(player);
        return gameConfig.getShipCombatStats(shipType, r.weaponTech, r.shieldingTech, r.armourTech);
    }

    // ============ RESEARCH VIEWS ============

    /**
     * @notice Get all research levels for a player
     */
    function getPlayerResearch(address player)
        external
        view
        returns (GameState.ResearchLevels memory)
    {
        return researchManager.getPlayerResearch(player);
    }

    /**
     * @notice Get research queue for a player
     */
    function getResearchQueue(address player)
        external
        view
        returns (GameState.ResearchQueue memory)
    {
        return researchManager.getResearchQueue(player);
    }

    // ============ TUTORIAL ROUTES ============

    /**
     * @notice Claim a tutorial quest reward
     */
    function claimTutorialQuest(uint256 planetId, uint256 questId) external {
        tutorialManager.claimQuest(msg.sender, planetId, questId);
    }

    /**
     * @notice Get full tutorial status for a player
     */
    function getTutorialStatus(address player, uint256 planetId)
        external
        view
        returns (bool[17] memory claimed, bool[17] memory claimable, bool allDone)
    {
        return tutorialManager.getQuestStatus(player, planetId);
    }

    /**
     * @notice Get reward info for a tutorial quest
     */
    function getTutorialQuestReward(uint256 questId)
        external
        view
        returns (uint256 titanium, uint256 helium3, uint256 darkMatter)
    {
        return tutorialManager.getQuestReward(questId);
    }

    // ============ BACKWARDS-COMPATIBLE STORAGE ACCESSORS ============
    // These delegate to GameState for tests that access storage directly

    function planets(uint256 planetId) external view returns (
        address owner,
        uint16[3] memory coordinates,
        string memory name,
        uint32 createdAt,
        bool exists
    ) {
        GameState.Planet memory p = gameState.getPlanet(planetId);
        return (p.owner, p.coordinates, p.name, p.createdAt, p.exists);
    }

    function planetBuildings(uint256 planetId) external view returns (
        uint8 titaniumExtractor,
        uint8 helium3Harvester,
        uint8 darkMatterCollector,
        uint8 titaniumVault,
        uint8 helium3Tank,
        uint8 darkMatterContainment,
        uint8 shipyard,
        uint8 researchNode,
        uint8 undergroundBunker
    ) {
        GameState.Buildings memory b = gameState.getPlanetBuildings(planetId);
        return (
            b.titaniumExtractor,
            b.helium3Harvester,
            b.darkMatterCollector,
            b.titaniumVault,
            b.helium3Tank,
            b.darkMatterContainment,
            b.shipyard,
            b.researchNode,
            b.undergroundBunker
        );
    }

    function planetResources(uint256 planetId) external view returns (
        uint256 titanium,
        uint256 helium3,
        uint256 darkMatter,
        uint32 lastClaimed
    ) {
        GameState.Resources memory r = gameState.getPlanetResources(planetId);
        return (r.titanium, r.helium3, r.darkMatter, r.lastClaimed);
    }

    function buildQueues(uint256 planetId) external view returns (
        GameConfig.BuildingType buildingType,
        uint8 targetLevel,
        uint32 completionTime
    ) {
        GameState.BuildQueue memory q = gameState.getBuildQueue(planetId);
        return (q.buildingType, q.targetLevel, q.completionTime);
    }

    function shipQueues(uint256 planetId) external view returns (
        GameConfig.ShipType shipType,
        uint256 quantity,
        uint32 completionTime
    ) {
        GameState.ShipQueue memory q = gameState.getShipQueue(planetId);
        return (q.shipType, q.quantity, q.completionTime);
    }

    function playerPlanet(address player) external view returns (uint256) {
        return gameState.getPlayerPlanet(player);
    }

    function coordinateToPlanet(uint16 galaxy, uint16 system, uint16 position) external view returns (uint256) {
        return gameState.getCoordinateToPlanet(galaxy, system, position);
    }

    function planetShips(uint256 planetId, uint8 shipType) external view returns (uint256) {
        return gameState.getPlanetShipCount(planetId, shipType);
    }

    function fleets(uint256 fleetId) external view returns (
        uint256 _fleetId,
        address owner,
        uint256 originPlanetId,
        uint16[3] memory origin,
        uint16[3] memory destination,
        GameState.FleetMission mission,
        GameState.FleetStatus status,
        uint32 departureTime,
        uint32 arrivalTime,
        uint32 returnTime,
        uint256[MAX_SHIP_TYPES] memory ships,
        uint256 cargoTitanium,
        uint256 cargoHelium3,
        uint256 cargoDarkMatter
    ) {
        GameState.Fleet memory f = gameState.getFleet(fleetId);
        return (
            f.fleetId,
            f.owner,
            f.originPlanetId,
            f.origin,
            f.destination,
            f.mission,
            f.status,
            f.departureTime,
            f.arrivalTime,
            f.returnTime,
            f.ships,
            f.cargoTitanium,
            f.cargoHelium3,
            f.cargoDarkMatter
        );
    }

    function playerFleets(address player) external view returns (uint256[] memory) {
        return gameState.getPlayerFleets(player);
    }

    function stationedShips(uint16 galaxy, uint16 system, uint16 position) external view returns (uint256[MAX_SHIP_TYPES] memory) {
        return gameState.getStationedShips(galaxy, system, position);
    }

    function raiderOutposts(uint16 galaxy, uint16 system, uint16 position) external view returns (
        address owner,
        GameConfig.OutpostType outpostType,
        uint32 lastCollected,
        uint256 storedResources
    ) {
        GameState.RaiderOutpost memory o = gameState.getRaiderOutpost(galaxy, system, position);
        return (o.owner, o.outpostType, o.lastCollected, o.storedResources);
    }

    function getPlayerOutposts(address player) external view returns (uint16[3][] memory) {
        return gameState.getPlayerOutposts(player);
    }

    function nextPlanetId() external view returns (uint256) {
        return gameState.nextPlanetId();
    }

    function nextFleetId() external view returns (uint256) {
        return gameState.nextFleetId();
    }

    function playerResearch(address player) external view returns (GameState.ResearchLevels memory) {
        return gameState.getPlayerResearch(player);
    }

    function defenseQueues(uint256 planetId) external view returns (
        GameConfig.DefenseType defenseType,
        uint256 quantity,
        uint32 completionTime
    ) {
        GameState.DefenseQueue memory q = gameState.getDefenseQueue(planetId);
        return (q.defenseType, q.quantity, q.completionTime);
    }

    function planetDefenses(uint256 planetId, uint8 defenseType) external view returns (uint256) {
        return gameState.getPlanetDefenseCount(planetId, defenseType);
    }

    function researchQueues(address player) external view returns (
        GameConfig.ResearchType researchType,
        uint8 targetLevel,
        uint32 completionTime
    ) {
        GameState.ResearchQueue memory q = gameState.getResearchQueue(player);
        return (q.researchType, q.targetLevel, q.completionTime);
    }
}
