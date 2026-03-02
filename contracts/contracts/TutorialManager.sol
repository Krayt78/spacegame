// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GameState.sol";
import "./GameConfig.sol";

/**
 * @title TutorialManager
 * @notice Manages the tutorial quest system for new players
 * @dev Stores quest state locally, reads game state from GameState, grants rewards via addResources
 */
contract TutorialManager {

    GameState public immutable gameState;
    GameConfig public immutable gameConfig;
    address public immutable router;

    uint256 public constant TOTAL_QUESTS = 16;

    struct QuestReward {
        uint256 titanium;
        uint256 helium3;
        uint256 darkMatter;
    }

    // Per-player quest completion bitmask (bit N = quest N claimed)
    mapping(address => uint256) public questCompletion;

    // Per-player tutorial completed flag
    mapping(address => bool) public tutorialCompleted;

    // Quest rewards (set in constructor)
    QuestReward[16] private _questRewards;

    event QuestClaimed(address indexed player, uint256 indexed questId, uint256 titanium, uint256 helium3, uint256 darkMatter);
    event TutorialCompleted(address indexed player);

    modifier onlyRouter() {
        require(msg.sender == router, "TutorialManager: only router");
        _;
    }

    constructor(address _router, address _gameState, address _gameConfig) {
        router = _router;
        gameState = GameState(_gameState);
        gameConfig = GameConfig(_gameConfig);

        // Quest 0: Power Up — Titanium Extractor >= 2
        _questRewards[0] = QuestReward(100, 50, 0);
        // Quest 1: Fuel Reserves — Helium-3 Harvester >= 2
        _questRewards[1] = QuestReward(100, 50, 0);
        // Quest 2: Into the Void — Dark Matter Collector >= 1
        _questRewards[2] = QuestReward(100, 50, 0);
        // Quest 3: Growing Economy — Ti Extractor >= 3 AND He3 Harvester >= 3
        _questRewards[3] = QuestReward(350, 100, 100);
        // Quest 4: Dark Expansion — Dark Matter Collector >= 2
        _questRewards[4] = QuestReward(400, 50, 200);
        // Quest 5: Industrial Might — Ti Extractor >= 4 AND He3 Harvester >= 4
        _questRewards[5] = QuestReward(500, 50, 100);
        // Quest 6: Dark Mastery — Dark Matter Collector >= 3
        _questRewards[6] = QuestReward(500, 250, 100);
        // Quest 7: The Forge — Shipyard >= 1
        _questRewards[7] = QuestReward(250, 450, 200);
        // Quest 8: Knowledge is Power — Research Node >= 1
        _questRewards[8] = QuestReward(450, 50, 300);
        // Quest 9: First Research — Combustion Drive >= 1
        _questRewards[9] = QuestReward(700, 300, 0);
        // Quest 10: Economic Powerhouse — Ti Extractor >= 5 AND He3 Harvester >= 5
        _questRewards[10] = QuestReward(800, 300, 0);
        // Quest 11: Dark Dominion — Dark Matter Collector >= 4
        _questRewards[11] = QuestReward(500, 150, 0);
        // Quest 12: Titanium Empire — Ti Extractor >= 6
        _questRewards[12] = QuestReward(1100, 100, 0);
        // Quest 13: Safe Storage — Any storage building >= 1
        _questRewards[13] = QuestReward(3200, 1200, 0);
        // Quest 14: Maiden Voyage — Own >= 1 Light Fighter
        _questRewards[14] = QuestReward(12500, 4500, 0);
        // Quest 15: Battle Ready — Own >= 5 Light Fighters
        _questRewards[15] = QuestReward(5000, 3000, 1000);
    }

    // ============ QUEST CLAIMING ============

    /**
     * @notice Claim a completed quest's reward
     * @param player The player claiming the quest
     * @param planetId The player's planet to receive rewards
     * @param questId 0-indexed quest number (0-9)
     */
    function claimQuest(address player, uint256 planetId, uint256 questId) external onlyRouter {
        require(questId < TOTAL_QUESTS, "TutorialManager: invalid quest");
        require(!tutorialCompleted[player], "TutorialManager: tutorial already completed");
        require(gameState.playerOwnsPlanet(player, planetId), "TutorialManager: not your planet");
        require((questCompletion[player] & (1 << questId)) == 0, "TutorialManager: quest already claimed");

        require(_isQuestConditionMet(player, planetId, questId), "TutorialManager: quest condition not met");

        // Mark quest as claimed
        questCompletion[player] |= (1 << questId);

        // Grant resource rewards
        QuestReward memory reward = _questRewards[questId];
        if (reward.titanium > 0 || reward.helium3 > 0 || reward.darkMatter > 0) {
            gameState.addResources(planetId, reward.titanium, reward.helium3, reward.darkMatter);
        }

        emit QuestClaimed(player, questId, reward.titanium, reward.helium3, reward.darkMatter);

        // Check if ALL quests are now complete
        if (questCompletion[player] == (1 << TOTAL_QUESTS) - 1) {
            tutorialCompleted[player] = true;
            emit TutorialCompleted(player);
        }
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get full quest status for a player
     * @return claimed Array of booleans — true if quest reward has been claimed
     * @return claimable Array of booleans — true if quest condition is met but not yet claimed
     * @return allDone Whether the entire tutorial is complete
     */
    function getQuestStatus(address player, uint256 planetId)
        external
        view
        returns (bool[16] memory claimed, bool[16] memory claimable, bool allDone)
    {
        allDone = tutorialCompleted[player];
        uint256 mask = questCompletion[player];

        for (uint256 i = 0; i < TOTAL_QUESTS; i++) {
            claimed[i] = (mask & (1 << i)) != 0;
            if (!claimed[i] && !allDone) {
                claimable[i] = _isQuestConditionMet(player, planetId, i);
            }
        }
    }

    /**
     * @notice Get reward info for a specific quest
     */
    function getQuestReward(uint256 questId) external view returns (uint256 titanium, uint256 helium3, uint256 darkMatter) {
        require(questId < TOTAL_QUESTS, "TutorialManager: invalid quest");
        QuestReward memory r = _questRewards[questId];
        return (r.titanium, r.helium3, r.darkMatter);
    }

    // ============ INTERNAL ============

    function _isQuestConditionMet(address player, uint256 planetId, uint256 questId)
        internal
        view
        returns (bool)
    {
        if (questId <= 8) {
            GameState.Buildings memory b = gameState.getPlanetBuildings(planetId);

            if (questId == 0) return b.titaniumExtractor >= 2;
            if (questId == 1) return b.helium3Harvester >= 2;
            if (questId == 2) return b.darkMatterCollector >= 1;
            if (questId == 3) return b.titaniumExtractor >= 3 && b.helium3Harvester >= 3;
            if (questId == 4) return b.darkMatterCollector >= 2;
            if (questId == 5) return b.titaniumExtractor >= 4 && b.helium3Harvester >= 4;
            if (questId == 6) return b.darkMatterCollector >= 3;
            if (questId == 7) return b.shipyard >= 1;
            if (questId == 8) return b.researchNode >= 1;
        }

        if (questId == 9) {
            GameState.ResearchLevels memory r = gameState.getPlayerResearch(player);
            return r.combustionDrive >= 1;
        }

        if (questId >= 10 && questId <= 13) {
            GameState.Buildings memory b = gameState.getPlanetBuildings(planetId);

            if (questId == 10) return b.titaniumExtractor >= 5 && b.helium3Harvester >= 5;
            if (questId == 11) return b.darkMatterCollector >= 4;
            if (questId == 12) return b.titaniumExtractor >= 6;
            if (questId == 13) return b.titaniumVault >= 1 || b.helium3Tank >= 1 || b.darkMatterContainment >= 1;
        }

        if (questId == 14) {
            return gameState.getPlanetShipCount(planetId, 3) >= 1;
        }

        if (questId == 15) {
            return gameState.getPlanetShipCount(planetId, 3) >= 5;
        }

        return false;
    }
}
