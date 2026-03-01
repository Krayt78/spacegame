// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GameState.sol";
import "./GameConfig.sol";
import "./CombatEngine.sol";

/**
 * @title FleetResolver
 * @notice Handles fleet resolution, completion, and outpost operations
 * @dev Extracted from FleetManager to stay under the 24KB bytecode limit
 */
contract FleetResolver {

    GameState public immutable gameState;
    GameConfig public immutable gameConfig;
    CombatEngine public immutable combatEngine;

    uint256 public constant MAX_SHIP_TYPES = 13;
    uint256 public constant MAX_DEFENSE_TYPES = 9;

    struct BattleReportParams {
        address attacker;
        address defender;
        uint16[3] location;
        GameState.FleetMission mission;
        uint256[13] attackerInitial;
        uint256[13] attackerSurviving;
        uint256[13] defenderInitial;
        uint256[13] defenderSurviving;
        uint256[9] defenderDefensesInitial;
        uint256[9] defenderDefensesSurviving;
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

    constructor(address _gameState, address _gameConfig, address _combatEngine) {
        gameState = GameState(_gameState);
        gameConfig = GameConfig(_gameConfig);
        combatEngine = CombatEngine(_combatEngine);
    }

    // ============ FLEET RESOLUTION ============

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

        CombatEngine.CombatResult memory result;

        uint256[3] memory loot;

        if (garrisonTotal > 0) {
            combatOccurred = true;
            result = combatEngine.resolveCombat(
                fleet.ships, garrison, defenses,
                CombatEngine.CombatBonuses(atkBonuses.weaponTech, atkBonuses.shieldingTech, atkBonuses.armourTech),
                CombatEngine.CombatBonuses(defBonuses.weaponTech, defBonuses.shieldingTech, defBonuses.armourTech)
            );
            attackerWon = result.attackerWon;

            gameState.updateFleetShips(fleetId, result.survivingAttackers);
            _setGarrisonAt(fleet.destination, result.survivingDefenders);
            _setDefensesAt(fleet.destination, result.survivingDefenses);

            if (attackerWon) {
                loot = _calculateAndApplyLoot(fleetId, fleet, result.survivingAttackers, atkBonuses);
            }
        } else {
            attackerWon = true;
            result.survivingAttackers = fleet.ships;
            loot = _calculateAndApplyLoot(fleetId, fleet, result.survivingAttackers, atkBonuses);
        }

        // Battle report
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
            brp.attackerWon = attackerWon;
            brp.lootTitanium = loot[0];
            brp.lootHelium3 = loot[1];
            brp.lootDarkMatter = loot[2];
            _createBattleReport(brp);
        }

        uint256 attackerRemaining = 0;
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            attackerRemaining += result.survivingAttackers[i];
        }

        if (attackerRemaining == 0) {
            gameState.deleteFleet(fleetId);
        } else {
            uint32 slowestSpeed = gameConfig.getSlowestSpeedWithResearch(
                result.survivingAttackers, atkBonuses.combustionDrive, atkBonuses.impulseDrive, atkBonuses.hyperspaceDrive
            );
            uint32 returnTravelTime = gameConfig.calculateTravelTime(fleet.destination, fleet.origin, slowestSpeed);
            gameState.updateFleetReturnTime(fleetId, uint32(block.timestamp) + returnTravelTime);
            gameState.updateFleetStatus(fleetId, GameState.FleetStatus.RETURNING);
        }

        return (combatOccurred, attackerWon);
    }

    function _resolveCapture(uint256 fleetId, GameState.Fleet memory fleet) internal returns (bool combatOccurred, bool attackerWon) {
        GameState.RaiderOutpost memory outpost = _getOrInitOutpost(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
        address previousOwner = outpost.owner;

        uint256[MAX_SHIP_TYPES] memory garrison = _getGarrisonAt(fleet.destination);
        uint256[MAX_DEFENSE_TYPES] memory emptyDefenses;
        uint256 garrisonTotal = 0;
        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            garrisonTotal += garrison[i];
        }

        ResearchBonuses memory atkBonuses = _getResearchBonuses(fleet.owner);
        ResearchBonuses memory defBonuses;
        if (previousOwner != address(0)) {
            defBonuses = _getResearchBonuses(previousOwner);
        }

        if (garrisonTotal > 0) {
            combatOccurred = true;
            CombatEngine.CombatResult memory result = combatEngine.resolveCombat(
                fleet.ships, garrison, emptyDefenses,
                CombatEngine.CombatBonuses(atkBonuses.weaponTech, atkBonuses.shieldingTech, atkBonuses.armourTech),
                CombatEngine.CombatBonuses(defBonuses.weaponTech, defBonuses.shieldingTech, defBonuses.armourTech)
            );

            attackerWon = result.attackerWon;

            if (result.attackerWon) {
                _setGarrisonAt(fleet.destination, result.survivingAttackers);
                gameState.setOutpostOwner(fleet.destination[0], fleet.destination[1], fleet.destination[2], fleet.owner, uint32(block.timestamp));
                emit OutpostCaptured(fleet.destination, previousOwner, fleet.owner);
            } else {
                _setGarrisonAt(fleet.destination, result.survivingDefenders);
                gameState.updateFleetShips(fleetId, result.survivingAttackers);
            }

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
                brp.attackerWon = attackerWon;
                _createBattleReport(brp);
            }

            if (!attackerWon) {
                uint256 attackerRemaining = 0;
                for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
                    attackerRemaining += result.survivingAttackers[i];
                }

                if (attackerRemaining == 0) {
                    gameState.deleteFleet(fleetId);
                } else {
                    uint32 slowestSpeed = gameConfig.getSlowestSpeedWithResearch(
                        result.survivingAttackers, atkBonuses.combustionDrive, atkBonuses.impulseDrive, atkBonuses.hyperspaceDrive
                    );
                    uint32 returnTravelTime = gameConfig.calculateTravelTime(fleet.destination, fleet.origin, slowestSpeed);
                    gameState.updateFleetReturnTime(fleetId, uint32(block.timestamp) + returnTravelTime);
                    gameState.updateFleetStatus(fleetId, GameState.FleetStatus.RETURNING);
                }
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

                for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
                    if (fleet.ships[i] > 0) {
                        gameState.addPlanetShips(destPlanetId, i, fleet.ships[i]);
                    }
                }
            }
        } else if (_isOutpostPosition(fleet.destination[2])) {
            _claimOutpostResources(fleet.destination[0], fleet.destination[1], fleet.destination[2]);

            GameState.RaiderOutpost memory outpost = gameState.getRaiderOutpost(fleet.destination[0], fleet.destination[1], fleet.destination[2]);

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

            uint256[MAX_SHIP_TYPES] memory currentGarrison = gameState.getStationedShips(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
            for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
                currentGarrison[i] += fleet.ships[i];
            }
            _setGarrisonAt(fleet.destination, currentGarrison);
        }

        gameState.deleteFleet(fleetId);
    }

    function _resolveColonize(uint256 fleetId, GameState.Fleet memory fleet) internal {
        uint256 existingPlanet = gameState.getCoordinateToPlanet(fleet.destination[0], fleet.destination[1], fleet.destination[2]);
        if (existingPlanet != 0) {
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

        uint256[MAX_SHIP_TYPES] memory remainingShips = fleet.ships;
        remainingShips[uint256(GameConfig.ShipType.ColonyShip)] -= 1;

        uint256 newPlanetId = gameState.incrementNextPlanetId();
        gameState.createPlanet(newPlanetId, fleet.owner, fleet.destination, "Colony");
        gameState.setPlanetResources(newPlanetId, 0, 0, 0, uint32(block.timestamp));

        for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
            if (remainingShips[i] > 0) {
                gameState.addPlanetShips(newPlanetId, i, remainingShips[i]);
            }
        }

        if (fleet.cargoTitanium > 0 || fleet.cargoHelium3 > 0 || fleet.cargoDarkMatter > 0) {
            gameState.addResources(newPlanetId, fleet.cargoTitanium, fleet.cargoHelium3, fleet.cargoDarkMatter);
        }

        emit PlanetColonized(fleet.owner, newPlanetId, fleet.destination);

        gameState.deleteFleet(fleetId);
    }

    // ============ FLEET COMPLETION ============

    function completeFleet(uint256 fleetId) external {
        GameState.Fleet memory fleet = gameState.getFleet(fleetId);
        require(fleet.fleetId != 0, "Fleet does not exist");
        require(fleet.status == GameState.FleetStatus.RETURNING, "Fleet not returning");
        require(block.timestamp >= fleet.returnTime, "Fleet has not returned");

        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            if (fleet.ships[i] > 0) {
                gameState.addPlanetShips(fleet.originPlanetId, i, fleet.ships[i]);
            }
        }

        _claimResourcesInternal(fleet.originPlanetId);
        gameState.addResources(fleet.originPlanetId, fleet.cargoTitanium, fleet.cargoHelium3, fleet.cargoDarkMatter);

        emit FleetCompleted(fleetId, fleet.cargoTitanium, fleet.cargoHelium3, fleet.cargoDarkMatter);

        gameState.deleteFleet(fleetId);
    }

    // ============ LOOT HELPERS ============

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

    // ============ RESEARCH BONUSES ============

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
