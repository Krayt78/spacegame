// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GameConfig.sol";

/**
 * @title CombatEngine
 * @notice Resolves combat between attacker ships and defender ships/defenses
 * @dev Extracted from FleetManager to stay under the 24KB bytecode limit
 */
contract CombatEngine {

    GameConfig public immutable gameConfig;

    uint256 public constant MAX_SHIP_TYPES = 13;
    uint256 public constant MAX_DEFENSE_TYPES = 9;
    uint256 private constant ADV_PRECISION = 10000;

    struct CombatResult {
        uint256[13] survivingAttackers;
        uint256[13] survivingDefenders;
        uint256[9] survivingDefenses;
        bool attackerWon;
    }

    struct CombatBonuses {
        uint8 weaponTech;
        uint8 shieldingTech;
        uint8 armourTech;
    }

    constructor(address _gameConfig) {
        gameConfig = GameConfig(_gameConfig);
    }

    function resolveCombat(
        uint256[13] calldata attackerShips,
        uint256[13] calldata defenderShips,
        uint256[9] calldata defenderDefenses,
        CombatBonuses calldata attackerResearch,
        CombatBonuses calldata defenderResearch
    ) external view returns (CombatResult memory) {
        CombatResult memory result;
        for (uint8 i = 0; i < MAX_SHIP_TYPES; i++) {
            result.survivingAttackers[i] = attackerShips[i];
            result.survivingDefenders[i] = defenderShips[i];
        }
        for (uint8 i = 0; i < MAX_DEFENSE_TYPES; i++) {
            result.survivingDefenses[i] = defenderDefenses[i];
        }

        for (uint8 round = 0; round < 6; round++) {
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

            uint256 attackerFirepower = _calculateAttackerFirepower(
                result.survivingAttackers, result.survivingDefenders, result.survivingDefenses,
                defenderTotalUnits, uint256(attackerResearch.weaponTech)
            );

            uint256 defenderFirepower = _calculateDefenderFirepower(
                result.survivingDefenders, result.survivingDefenses,
                result.survivingAttackers, attackerTotalShips,
                uint256(defenderResearch.weaponTech)
            );

            // Apply attacker damage to defender ships
            for (uint8 i = 1; i < MAX_SHIP_TYPES; i++) {
                if (result.survivingDefenders[i] > 0) {
                    GameConfig.ShipConfig memory config = gameConfig.getShipConfig(GameConfig.ShipType(i));
                    uint256 damageShare = (attackerFirepower * result.survivingDefenders[i]) / defenderTotalUnits;
                    uint256 boostedShield = uint256(config.shieldPower) * (100 + uint256(defenderResearch.shieldingTech) * 10) / 100;
                    uint256 boostedHull = uint256(config.structuralIntegrity) * (100 + uint256(defenderResearch.armourTech) * 10) / 100;
                    // Hull is divided by 100 intentionally: hull derives from resource costs and scales
                    // much higher than shields/damage, so it must be scaled down for balanced combat.
                    uint256 defense = boostedShield + boostedHull / 100;
                    uint256 destroyed = damageShare / defense;
                    if (destroyed >= result.survivingDefenders[i]) {
                        result.survivingDefenders[i] = 0;
                    } else {
                        result.survivingDefenders[i] -= destroyed;
                    }
                }
            }

            // Apply attacker damage to defender defenses
            for (uint8 i = 1; i < MAX_DEFENSE_TYPES; i++) {
                if (result.survivingDefenses[i] > 0) {
                    GameConfig.DefenseConfig memory config = gameConfig.getDefenseConfig(GameConfig.DefenseType(i));
                    uint256 damageShare = (attackerFirepower * result.survivingDefenses[i]) / defenderTotalUnits;
                    uint256 boostedShield = uint256(config.shieldPower) * (100 + uint256(defenderResearch.shieldingTech) * 10) / 100;
                    uint256 boostedHull = uint256(config.structuralIntegrity) * (100 + uint256(defenderResearch.armourTech) * 10) / 100;
                    // Hull is divided by 100 intentionally: hull derives from resource costs and scales
                    // much higher than shields/damage, so it must be scaled down for balanced combat.
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
                    // Hull is divided by 100 intentionally: hull derives from resource costs and scales
                    // much higher than shields/damage, so it must be scaled down for balanced combat.
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

        return result;
    }

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

            uint8[13] memory advShipRow = gameConfig.getAdvantageRow(GameConfig.ShipType(i));
            uint8[9] memory advDefRow = gameConfig.getShipVsDefenseAdvantageRow(GameConfig.ShipType(i));

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

    function _calculateDefenderFirepower(
        uint256[MAX_SHIP_TYPES] memory defenderShips,
        uint256[MAX_DEFENSE_TYPES] memory defenderDefenses,
        uint256[MAX_SHIP_TYPES] memory attackerShips,
        uint256 attackerTotalShips,
        uint256 weaponTechLevel
    ) internal view returns (uint256) {
        uint256 totalFirepower = 0;

        // Ship firepower (with ship-vs-ship advantages)
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

        // Defense firepower (no advantages)
        for (uint8 i = 1; i < MAX_DEFENSE_TYPES; i++) {
            if (defenderDefenses[i] == 0) continue;

            GameConfig.DefenseConfig memory config = gameConfig.getDefenseConfig(GameConfig.DefenseType(i));
            uint256 boostedWeapon = uint256(config.weaponPower) * (100 + weaponTechLevel * 10) / 100;
            totalFirepower += defenderDefenses[i] * boostedWeapon;
        }

        return totalFirepower;
    }
}
