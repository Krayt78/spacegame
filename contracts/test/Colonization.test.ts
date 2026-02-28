import { expect } from "chai";
import { deployContracts, DeployedContracts, TestSigners, claimPlanet, advanceTime, setupPlayerWithShips } from "./helpers/setup";

describe("Colonization", function () {
  let contracts: DeployedContracts;
  let signers: TestSigners;

  beforeEach(async function () {
    ({ contracts, signers } = await deployContracts());
  });

  describe("Astrophysics Research", function () {
    it("Should allow researching Astrophysics", async function () {
      const { nexusGame, gameConfig } = contracts;
      const { player1 } = signers;

      // Setup player with shipyard (which includes Research Node + Computer Tech)
      const planetId = await setupPlayerWithShips(nexusGame, gameConfig, player1, 0, 0);

      // Accumulate resources for Astrophysics (4000 Ti, 8000 He3, 4000 DM)
      // DM is bottleneck: 4000 / 10 DM/hr = 400 hours
      await advanceTime(1800000); // 500 hours
      await nexusGame.connect(player1).claimResources(planetId);

      // Research Astrophysics (type 14)
      await nexusGame.connect(player1).startResearch(planetId, 14);
      await advanceTime(360000);
      await nexusGame.completeResearch(player1.address);

      // Check level is 1
      const research = await contracts.gameState.getPlayerResearch(player1.address);
      expect(research.astrophysics).to.equal(1);
    });

    it("Should calculate max colonies correctly", async function () {
      const { gameConfig } = contracts;

      expect(await gameConfig.getMaxColonies(0)).to.equal(0);
      expect(await gameConfig.getMaxColonies(1)).to.equal(0);
      expect(await gameConfig.getMaxColonies(2)).to.equal(1);
      expect(await gameConfig.getMaxColonies(3)).to.equal(1);
      expect(await gameConfig.getMaxColonies(4)).to.equal(2);
      expect(await gameConfig.getMaxColonies(5)).to.equal(2);
      expect(await gameConfig.getMaxColonies(6)).to.equal(3);
    });
  });

  describe("Multi-planet Tracking", function () {
    it("Should track player planets correctly after claiming starter", async function () {
      const { nexusGame, gameState } = contracts;
      const { player1 } = signers;

      const planetId = await claimPlanet(nexusGame, player1, "HomeWorld");

      // Check multi-planet tracking
      const planets = await gameState.getPlayerPlanets(player1.address);
      expect(planets.length).to.equal(1);
      expect(planets[0]).to.equal(planetId);

      // Check ownership
      expect(await gameState.playerOwnsPlanet(player1.address, planetId)).to.be.true;
      expect(await gameState.getPlayerPlanetCount(player1.address)).to.equal(1);
    });
  });

  describe("Colonize Mission Dispatch", function () {
    let planet1Id: bigint;

    beforeEach(async function () {
      const { nexusGame, gameConfig } = contracts;
      const { player1 } = signers;

      // Setup player1 with ColonyShip (type 10) — requires Shipyard 4 + Impulse Drive 3
      planet1Id = await setupPlayerWithShips(nexusGame, gameConfig, player1, 10, 1);

      // Research Astrophysics to level 2 (grants 1 colony slot)
      for (let i = 0; i < 2; i++) {
        await advanceTime(2880000); // 800 hours - DM at 10/hr is bottleneck
        await nexusGame.connect(player1).claimResources(planet1Id);
        await nexusGame.connect(player1).startResearch(planet1Id, 14); // ASTROPHYSICS
        await advanceTime(360000);
        await nexusGame.completeResearch(player1.address);
      }
    });

    it("Should dispatch a COLONIZE fleet to an empty position", async function () {
      const { nexusGame } = contracts;
      const { player1 } = signers;

      // Create ship array with 1 colony ship
      const ships = new Array(13).fill(0);
      ships[10] = 1; // ColonyShip

      // Dispatch to [1, 2, 5] — an empty planet position
      const tx = await nexusGame.connect(player1).dispatchFleet(
        planet1Id, ships, [1, 2, 5], 4, 0, 0, 0 // mission 4 = COLONIZE
      );
      await expect(tx).to.emit(contracts.fleetManager, "FleetDispatched");
    });

    it("Should reject COLONIZE without colony ship", async function () {
      const { nexusGame } = contracts;
      const { player1 } = signers;

      // Dispatch with ships array that has no colony ship (validation checks before deduction)
      const ships = new Array(13).fill(0);
      ships[3] = 1; // LightFighter in array, no colony ship

      await expect(
        nexusGame.connect(player1).dispatchFleet(planet1Id, ships, [1, 2, 5], 4, 0, 0, 0)
      ).to.be.revertedWith("COLONIZE requires colony ship");
    });

    it("Should reject COLONIZE to occupied position", async function () {
      const { nexusGame } = contracts;
      const { player1, player2 } = signers;

      // Player2 claims a planet (which will be at a sequential position)
      await claimPlanet(nexusGame, player2, "OtherPlanet");
      const p2PlanetId = await nexusGame.playerPlanet(player2.address);
      const p2Coords = await contracts.gameState.getPlanetCoordinates(p2PlanetId);

      const ships = new Array(13).fill(0);
      ships[10] = 1; // ColonyShip

      // Try to colonize the position where player2's planet is
      await expect(
        nexusGame.connect(player1).dispatchFleet(
          planet1Id, ships, [p2Coords[0], p2Coords[1], p2Coords[2]], 4, 0, 0, 0
        )
      ).to.be.revertedWith("Position already occupied");
    });

    it("Should reject COLONIZE to outpost position", async function () {
      const { nexusGame } = contracts;
      const { player1 } = signers;

      const ships = new Array(13).fill(0);
      ships[10] = 1; // ColonyShip

      await expect(
        nexusGame.connect(player1).dispatchFleet(planet1Id, ships, [1, 2, 11], 4, 0, 0, 0)
      ).to.be.revertedWith("COLONIZE requires planet position");
    });

    it("Should reject COLONIZE without colony slots", async function () {
      const { nexusGame, gameConfig } = contracts;
      const { player1 } = signers;

      // Player has Astrophysics level 2 = 1 colony slot
      // Build 2 colony ships
      await advanceTime(720000);
      await nexusGame.connect(player1).claimResources(planet1Id);
      await nexusGame.connect(player1).buildShips(planet1Id, 10, 1);
      await advanceTime(360000);
      await nexusGame.completeShipBuild(planet1Id);

      // First colonize should work
      const ships1 = new Array(13).fill(0);
      ships1[10] = 1;
      await nexusGame.connect(player1).dispatchFleet(planet1Id, ships1, [1, 3, 5], 4, 0, 0, 0);

      // Resolve first fleet
      const fleetIds = await contracts.gameState.getPlayerFleets(player1.address);
      await advanceTime(3600);
      await nexusGame.resolveFleet(fleetIds[0]);

      // Now try second colonize — should fail (1 colony used, max 1)
      const ships2 = new Array(13).fill(0);
      ships2[10] = 1;
      await expect(
        nexusGame.connect(player1).dispatchFleet(planet1Id, ships2, [1, 4, 5], 4, 0, 0, 0)
      ).to.be.revertedWith("No colony slots available");
    });

    it("Should allow cargo on COLONIZE missions", async function () {
      const { nexusGame } = contracts;
      const { player1 } = signers;

      await advanceTime(360000);
      await nexusGame.connect(player1).claimResources(planet1Id);

      const ships = new Array(13).fill(0);
      ships[10] = 1; // ColonyShip (7500 cargo capacity)

      // Dispatch with cargo
      const tx = await nexusGame.connect(player1).dispatchFleet(
        planet1Id, ships, [1, 2, 5], 4, 1000, 1000, 0
      );
      await expect(tx).to.emit(contracts.fleetManager, "FleetDispatched");
    });
  });

  describe("Colonize Resolution", function () {
    let planet1Id: bigint;

    beforeEach(async function () {
      const { nexusGame, gameConfig } = contracts;
      const { player1 } = signers;

      // Setup player with colony ship + some fighters
      planet1Id = await setupPlayerWithShips(nexusGame, gameConfig, player1, 10, 1);

      // Research Astrophysics to level 2
      for (let i = 0; i < 2; i++) {
        await advanceTime(720000);
        await nexusGame.connect(player1).claimResources(planet1Id);
        await nexusGame.connect(player1).startResearch(planet1Id, 14);
        await advanceTime(720000);
        await nexusGame.completeResearch(player1.address);
      }

      // Research Combustion Drive (needed for LightFighter)
      await advanceTime(2880000);
      await nexusGame.connect(player1).claimResources(planet1Id);
      await nexusGame.connect(player1).startResearch(planet1Id, 1); // COMBUSTION_DRIVE
      await advanceTime(360000);
      await nexusGame.completeResearch(player1.address);

      // Build extra ships: 3 light fighters
      await advanceTime(360000);
      await nexusGame.connect(player1).claimResources(planet1Id);
      await nexusGame.connect(player1).buildShips(planet1Id, 3, 3); // 3 LightFighters
      await advanceTime(3600);
      await nexusGame.completeShipBuild(planet1Id);
    });

    it("Should create a new planet on successful colonization", async function () {
      const { nexusGame, gameState, fleetManager } = contracts;
      const { player1 } = signers;

      const ships = new Array(13).fill(0);
      ships[10] = 1; // ColonyShip
      ships[3] = 2;  // 2 LightFighters

      const dest: [number, number, number] = [1, 3, 5];
      await nexusGame.connect(player1).dispatchFleet(planet1Id, ships, dest, 4, 0, 0, 0);

      // Advance past travel time and resolve
      const fleetIds = await gameState.getPlayerFleets(player1.address);
      const fleet = await gameState.getFleet(fleetIds[0]);
      await advanceTime(Number(fleet.arrivalTime - fleet.departureTime) + 1);

      await expect(nexusGame.resolveFleet(fleetIds[0]))
        .to.emit(fleetManager, "PlanetColonized");

      // Check new planet exists
      const newPlanetId = await gameState.getCoordinateToPlanet(1, 3, 5);
      expect(newPlanetId).to.not.equal(0);

      // Check planet ownership
      const planet = await gameState.getPlanet(newPlanetId);
      expect(planet.owner).to.equal(player1.address);
      expect(planet.name).to.equal("Colony");

      // Check player has 2 planets
      expect(await gameState.getPlayerPlanetCount(player1.address)).to.equal(2);
      const playerPlanets = await gameState.getPlayerPlanets(player1.address);
      expect(playerPlanets.length).to.equal(2);

      // Check colony is bare (no buildings)
      const buildings = await gameState.getPlanetBuildings(newPlanetId);
      expect(buildings.titaniumExtractor).to.equal(0);
      expect(buildings.shipyard).to.equal(0);

      // Check colony has no starting resources (bare planet)
      const resources = await gameState.getPlanetResources(newPlanetId);
      expect(resources.titanium).to.equal(0);
      expect(resources.helium3).to.equal(0);
    });

    it("Should consume exactly 1 colony ship and station remaining ships", async function () {
      const { nexusGame, gameState } = contracts;
      const { player1 } = signers;

      const ships = new Array(13).fill(0);
      ships[10] = 1; // 1 ColonyShip
      ships[3] = 2;  // 2 LightFighters

      await nexusGame.connect(player1).dispatchFleet(planet1Id, ships, [1, 3, 5], 4, 0, 0, 0);

      const fleetIds = await gameState.getPlayerFleets(player1.address);
      const fleet = await gameState.getFleet(fleetIds[0]);
      await advanceTime(Number(fleet.arrivalTime - fleet.departureTime) + 1);
      await nexusGame.resolveFleet(fleetIds[0]);

      // Check ships at new planet
      const newPlanetId = await gameState.getCoordinateToPlanet(1, 3, 5);
      const planetShips = await gameState.getPlanetShips(newPlanetId);

      // Colony ship consumed, 2 light fighters remain
      expect(planetShips[10]).to.equal(0); // No colony ships
      expect(planetShips[3]).to.equal(2);  // 2 light fighters
    });

    it("Should deposit cargo at the new colony", async function () {
      const { nexusGame, gameState } = contracts;
      const { player1 } = signers;

      await advanceTime(360000);
      await nexusGame.connect(player1).claimResources(planet1Id);

      const ships = new Array(13).fill(0);
      ships[10] = 1; // ColonyShip (7500 cargo)

      await nexusGame.connect(player1).dispatchFleet(
        planet1Id, ships, [1, 3, 5], 4, 2000, 1000, 500
      );

      const fleetIds = await gameState.getPlayerFleets(player1.address);
      const fleet = await gameState.getFleet(fleetIds[0]);
      await advanceTime(Number(fleet.arrivalTime - fleet.departureTime) + 1);
      await nexusGame.resolveFleet(fleetIds[0]);

      const newPlanetId = await gameState.getCoordinateToPlanet(1, 3, 5);
      const resources = await gameState.getPlanetResources(newPlanetId);
      expect(resources.titanium).to.equal(2000);
      expect(resources.helium3).to.equal(1000);
      expect(resources.darkMatter).to.equal(500);
    });

    it("Should delete fleet after successful colonization (no return trip)", async function () {
      const { nexusGame, gameState } = contracts;
      const { player1 } = signers;

      const ships = new Array(13).fill(0);
      ships[10] = 1;

      await nexusGame.connect(player1).dispatchFleet(planet1Id, ships, [1, 3, 5], 4, 0, 0, 0);

      const fleetIds = await gameState.getPlayerFleets(player1.address);
      const fleet = await gameState.getFleet(fleetIds[0]);
      await advanceTime(Number(fleet.arrivalTime - fleet.departureTime) + 1);
      await nexusGame.resolveFleet(fleetIds[0]);

      // Fleet should be deleted
      expect(await gameState.getPlayerFleetCount(player1.address)).to.equal(0);
    });

    it("Should return fleet if destination was colonized during travel", async function () {
      const { nexusGame, gameState, gameConfig, fleetManager } = contracts;
      const { player1, player2 } = signers;

      // Setup player2 with colony ship + astrophysics
      const planet2Id = await setupPlayerWithShips(nexusGame, gameConfig, player2, 10, 1);
      for (let i = 0; i < 2; i++) {
        await advanceTime(2880000); // 800 hours - DM at 10/hr is bottleneck
        await nexusGame.connect(player2).claimResources(planet2Id);
        await nexusGame.connect(player2).startResearch(planet2Id, 14);
        await advanceTime(360000);
        await nexusGame.completeResearch(player2.address);
      }

      // Both players dispatch to same empty position
      const dest: [number, number, number] = [1, 5, 5];
      const ships1 = new Array(13).fill(0);
      ships1[10] = 1;
      const ships2 = new Array(13).fill(0);
      ships2[10] = 1;

      await nexusGame.connect(player1).dispatchFleet(planet1Id, ships1, dest, 4, 0, 0, 0);
      await nexusGame.connect(player2).dispatchFleet(planet2Id, ships2, dest, 4, 0, 0, 0);

      // Advance time and resolve player1's fleet first
      await advanceTime(360000);

      const p1Fleets = await gameState.getPlayerFleets(player1.address);
      await nexusGame.resolveFleet(p1Fleets[0]);

      // Player1 successfully colonized
      expect(await gameState.getCoordinateToPlanet(1, 5, 5)).to.not.equal(0);

      // Now resolve player2's fleet — should fail and return
      const p2Fleets = await gameState.getPlayerFleets(player2.address);
      await expect(nexusGame.resolveFleet(p2Fleets[0]))
        .to.emit(fleetManager, "ColonizationFailed");

      // Player2's fleet should be in RETURNING status
      const p2Fleet = await gameState.getFleet(p2Fleets[0]);
      expect(p2Fleet.status).to.equal(2); // RETURNING

      // Player2 should still be able to complete their returning fleet
      await advanceTime(360000);
      await nexusGame.completeFleet(p2Fleets[0]);

      // Colony ship should be returned to origin planet
      const p2Ships = await gameState.getPlanetShips(planet2Id);
      expect(p2Ships[10]).to.equal(1); // Colony ship returned
    });
  });

  describe("Multi-planet Interactions", function () {
    it("Should allow building on a colony planet", async function () {
      const { nexusGame, gameState, gameConfig } = contracts;
      const { player1 } = signers;

      // Setup and colonize
      const planet1Id = await setupPlayerWithShips(nexusGame, gameConfig, player1, 10, 1);
      for (let i = 0; i < 2; i++) {
        await advanceTime(720000);
        await nexusGame.connect(player1).claimResources(planet1Id);
        await nexusGame.connect(player1).startResearch(planet1Id, 14);
        await advanceTime(720000);
        await nexusGame.completeResearch(player1.address);
      }

      // Send colony ship with resources (ColonyShip has 7500 cargo capacity)
      await advanceTime(360000);
      await nexusGame.connect(player1).claimResources(planet1Id);
      const ships = new Array(13).fill(0);
      ships[10] = 1;
      await nexusGame.connect(player1).dispatchFleet(
        planet1Id, ships, [1, 3, 5], 4, 3000, 3000, 0
      );

      const fleetIds = await gameState.getPlayerFleets(player1.address);
      const fleet = await gameState.getFleet(fleetIds[0]);
      await advanceTime(Number(fleet.arrivalTime - fleet.departureTime) + 1);
      await nexusGame.resolveFleet(fleetIds[0]);

      const colonyId = await gameState.getCoordinateToPlanet(1, 3, 5);

      // Build Titanium Extractor on colony (costs 60 Ti, 15 He3)
      await nexusGame.connect(player1).upgradeBuilding(colonyId, 1);
      await advanceTime(3600);
      await nexusGame.completeUpgrade(colonyId);

      const buildings = await gameState.getPlanetBuildings(colonyId);
      expect(buildings.titaniumExtractor).to.equal(1);
    });

    it("Should reject operations on other player's planet", async function () {
      const { nexusGame } = contracts;
      const { player1, player2 } = signers;

      const planet1Id = await claimPlanet(nexusGame, player1, "Planet1");
      await claimPlanet(nexusGame, player2, "Planet2");

      // Player2 tries to claim resources on player1's planet
      await expect(
        nexusGame.connect(player2).claimResources(planet1Id)
      ).to.be.revertedWith("Not your planet");
    });
  });

  describe("Coordinate Collision Protection", function () {
    it("createPlanet should revert when coordinate is already occupied", async function () {
      const { gameState } = contracts;
      const { owner, player1 } = signers;

      // Authorize owner as a manager so it can call createPlanet directly
      await gameState.setManager(owner.address, true);

      // Create a planet at (1,1,1)
      await gameState.createPlanet(999, player1.address, [1, 1, 1], "Test");

      // Attempting to create another planet at the same coordinate must revert
      await expect(
        gameState.createPlanet(1000, player1.address, [1, 1, 1], "Duplicate")
      ).to.be.revertedWith("Coordinate already occupied");
    });

    it("claimStarterPlanet should skip coordinates occupied by colonized planets", async function () {
      const { nexusGame, gameState } = contracts;
      const { owner, player1, player2 } = signers;

      // Player1 claims their starter planet — gets planetId=1 at (1,1,1)
      await claimPlanet(nexusGame, player1, "HomeWorld");
      const p1PlanetId = await nexusGame.playerPlanet(player1.address);
      const p1Coords = await gameState.getPlanetCoordinates(p1PlanetId);
      expect(p1Coords[0]).to.equal(1);
      expect(p1Coords[1]).to.equal(1);
      expect(p1Coords[2]).to.equal(1);

      // Authorize owner as a manager so it can call createPlanet directly
      await gameState.setManager(owner.address, true);

      // Pre-occupy (1,1,2) — the coordinate that planetId=2 would normally receive —
      // using a high ID that does not conflict with the sequential counter
      await gameState.createPlanet(999, owner.address, [1, 1, 2], "Colonized");

      // Player2 claims their starter planet; the while-loop must skip (1,1,2)
      await claimPlanet(nexusGame, player2, "SkipMe");
      const p2PlanetId = await nexusGame.playerPlanet(player2.address);
      const p2Coords = await gameState.getPlanetCoordinates(p2PlanetId);

      // Planet should have landed on (1,1,3), not the occupied (1,1,2)
      expect(p2Coords[0]).to.equal(1);
      expect(p2Coords[1]).to.equal(1);
      expect(p2Coords[2]).to.equal(3);

      // Verify the pre-placed colonized planet at (1,1,2) was not overwritten
      const occupantAtBlocked = await gameState.getCoordinateToPlanet(1, 1, 2);
      expect(occupantAtBlocked).to.equal(999n);
    });

    it("claimStarterPlanet should skip multiple consecutive occupied coordinates", async function () {
      const { nexusGame, gameState } = contracts;
      const { owner, player1, player2 } = signers;

      // Player1 claims their starter planet — gets planetId=1 at (1,1,1)
      await claimPlanet(nexusGame, player1, "HomeWorld");
      const p1PlanetId = await nexusGame.playerPlanet(player1.address);
      const p1Coords = await gameState.getPlanetCoordinates(p1PlanetId);
      expect(p1Coords[0]).to.equal(1);
      expect(p1Coords[1]).to.equal(1);
      expect(p1Coords[2]).to.equal(1);

      // Authorize owner as a manager so it can call createPlanet directly
      await gameState.setManager(owner.address, true);

      // Pre-occupy both (1,1,2) and (1,1,3) to force the loop to skip two slots
      await gameState.createPlanet(998, owner.address, [1, 1, 2], "Blocked1");
      await gameState.createPlanet(997, owner.address, [1, 1, 3], "Blocked2");

      // Player2 claims their starter planet; the while-loop must skip (1,1,2) and (1,1,3)
      await claimPlanet(nexusGame, player2, "FarAway");
      const p2PlanetId = await nexusGame.playerPlanet(player2.address);
      const p2Coords = await gameState.getPlanetCoordinates(p2PlanetId);

      // Planet should have landed on (1,1,4), skipping two consecutive occupied slots
      expect(p2Coords[0]).to.equal(1);
      expect(p2Coords[1]).to.equal(1);
      expect(p2Coords[2]).to.equal(4);

      // Verify the pre-placed planets are still intact
      expect(await gameState.getCoordinateToPlanet(1, 1, 2)).to.equal(998n);
      expect(await gameState.getCoordinateToPlanet(1, 1, 3)).to.equal(997n);
    });
  });
});
