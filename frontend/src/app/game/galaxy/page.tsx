'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { GameLayout } from '@/components/layout';
import { Card, CardHeader, CardContent, Button } from '@/components/ui';
import { SystemScene, PlanetData, GalaxyActionPanel, QuickFleetModal, FLEET_ACTION_WITHDRAW } from '@/components/game';
import { useActivePlanetId, usePlanetData, useSystemPlanets, useSystemOutposts, useShips, useCurrentResources, usePlayerFleetCount, usePlayerResearch, OUTPOST_TYPE_NAMES, OUTPOST_RESOURCE_MAP, SHIP_TYPE_INDEX, SHIP_TYPE_REVERSE_MAP, FLEET_MISSION } from '@/hooks';
import { Globe, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import type { Ships, ShipComposition } from '@/types/game';
import { SHIP_NAMES } from '@/constants/gameConfig';

// Constants for galaxy limits
const MAX_GALAXIES = 10;
const MAX_SYSTEMS = 499;
const POSITIONS_COUNT = 15;

// Truncate address for display
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function GalaxyPage() {
  const { address } = useAccount();
  const { planetId } = useActivePlanetId();
  const { data: planetData, isLoading: loadingPlanet } = usePlanetData(planetId);

  // Navigation state
  const [galaxy, setGalaxy] = useState(1);
  const [system, setSystem] = useState(1);
  const [systemInputValue, setSystemInputValue] = useState('1');
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);

  // Modal state for fleet actions
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<number>(FLEET_MISSION.RAID);
  const [isWithdrawMode, setIsWithdrawMode] = useState(false);

  // Get system planets data (positions 1-10)
  const { data: systemPlanetsData, isLoading: loadingPlanets } = useSystemPlanets(galaxy, system);

  // Get system outposts data (positions 11-15)
  const { data: systemOutpostsData, isLoading: loadingOutposts } = useSystemOutposts(galaxy, system);

  // Get player's ships and resources for fleet dispatch
  const { data: shipsData } = useShips(planetId);
  const { data: resourcesData } = useCurrentResources(planetId);

  // Get fleet count and research data for fleet limit
  const { data: fleetCount } = usePlayerFleetCount();
  const { data: researchData } = usePlayerResearch();

  // Calculate fleet limit from Computer Tech research
  const computerTechLevel = researchData?.computerTech ?? 0;
  const maxFleets = computerTechLevel;
  const currentFleets = Number(fleetCount ?? BigInt(0));

  // Parse ships and resources for the modal
  const playerShips = useMemo((): Ships => ({
    smallCargo: Number(shipsData?.[SHIP_TYPE_INDEX.SMALL_CARGO] ?? 0),
    largeCargo: Number(shipsData?.[SHIP_TYPE_INDEX.LARGE_CARGO] ?? 0),
    lightFighter: Number(shipsData?.[SHIP_TYPE_INDEX.LIGHT_FIGHTER] ?? 0),
    heavyFighter: Number(shipsData?.[SHIP_TYPE_INDEX.HEAVY_FIGHTER] ?? 0),
    cruiser: Number(shipsData?.[SHIP_TYPE_INDEX.CRUISER] ?? 0),
    battleship: Number(shipsData?.[SHIP_TYPE_INDEX.BATTLESHIP] ?? 0),
    battlecruiser: Number(shipsData?.[SHIP_TYPE_INDEX.BATTLECRUISER] ?? 0),
    bomber: Number(shipsData?.[SHIP_TYPE_INDEX.BOMBER] ?? 0),
    destroyer: Number(shipsData?.[SHIP_TYPE_INDEX.DESTROYER] ?? 0),
    colonyShip: Number(shipsData?.[SHIP_TYPE_INDEX.COLONY_SHIP] ?? 0),
    recycler: Number(shipsData?.[SHIP_TYPE_INDEX.RECYCLER] ?? 0),
    crawler: Number(shipsData?.[SHIP_TYPE_INDEX.CRAWLER] ?? 0),
  }), [shipsData]);

  const playerResources = useMemo(() => ({
    titanium: Number(resourcesData?.[0] ?? 0),
    helium3: Number(resourcesData?.[1] ?? 0),
    darkMatter: Number(resourcesData?.[2] ?? 0),
  }), [resourcesData]);

  // Player's coordinates for fleet dispatch
  const playerCoordinates = useMemo((): [number, number, number] => {
    if (!planetData) return [1, 1, 1];
    const [planet] = planetData;
    return [
      Number(planet.coordinates[0]),
      Number(planet.coordinates[1]),
      Number(planet.coordinates[2]),
    ];
  }, [planetData]);

  // Combined loading state
  const loadingSystem = loadingPlanets || loadingOutposts;

  // Initialize galaxy/system from player's coordinates once loaded
  useEffect(() => {
    if (planetData) {
      const [planet] = planetData;
      const playerGalaxy = Number(planet.coordinates[0]);
      const playerSystem = Number(planet.coordinates[1]);
      if (playerGalaxy > 0 && playerSystem > 0) {
        setGalaxy(playerGalaxy);
        setSystem(playerSystem);
        setSystemInputValue(playerSystem.toString());
      }
    }
  }, [planetData]);

  // Process planets and outposts for the scene
  const positions = useMemo(() => {
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

    return Array.from({ length: POSITIONS_COUNT }, (_, i) => {
      const position = i + 1;

      // Positions 1-10 are planets
      if (position <= 10) {
        const planet = systemPlanetsData?.[i];
        if (!planet || !planet.exists) {
          return {
            owner: ZERO_ADDRESS,
            coordinates: [galaxy, system, position] as [number, number, number],
            name: '',
            createdAt: 0,
            exists: false,
            isOutpost: false,
          };
        }
        return {
          owner: planet.owner,
          coordinates: [
            Number(planet.coordinates[0]),
            Number(planet.coordinates[1]),
            Number(planet.coordinates[2]),
          ] as [number, number, number],
          name: planet.name,
          createdAt: Number(planet.createdAt),
          exists: planet.exists,
          isOutpost: false,
        };
      }

      // Positions 11-15 are outposts
      const outpostIndex = position - 11; // 0-4
      // systemOutpostsData returns: [outposts[5], currentResources[5], garrisons[5][10]]
      const outpostsTuple = systemOutpostsData as readonly [
        readonly { owner: string; outpostType: number; lastCollected: bigint; storedResources: bigint }[],
        readonly bigint[],
        readonly (readonly bigint[])[]
      ] | undefined;
      const outpostsArray = outpostsTuple?.[0];
      const resourcesArray = outpostsTuple?.[1];
      const garrisonsArray = outpostsTuple?.[2];

      const outpost = outpostsArray?.[outpostIndex];
      const currentResources = resourcesArray?.[outpostIndex];
      const garrison = garrisonsArray?.[outpostIndex];

      // Outpost exists if it has a non-zero owner
      const hasOwner = !!(outpost?.owner && outpost.owner !== ZERO_ADDRESS);

      // Default outpost type based on position (11=titanium, 12=helium3, 13=darkmatter)
      const defaultOutpostType = position === 11 ? 1 : position === 12 ? 2 : position === 13 ? 3 : 0;

      return {
        owner: outpost?.owner || ZERO_ADDRESS,
        coordinates: [galaxy, system, position] as [number, number, number],
        name: OUTPOST_TYPE_NAMES[outpost?.outpostType ?? defaultOutpostType] || '',
        createdAt: 0,
        exists: hasOwner,
        isOutpost: true,
        outpostType: outpost?.outpostType ?? defaultOutpostType,
        storedResources: currentResources ?? BigInt(0),
        garrison: garrison,
      };
    });
  }, [systemPlanetsData, systemOutpostsData, galaxy, system]);

  // Selected position data (planet or outpost)
  const selectedData = selectedPosition ? positions[selectedPosition - 1] : null;
  const isSelectedMine = selectedData?.exists &&
    address &&
    selectedData.owner.toLowerCase() === address.toLowerCase();

  // Navigation handlers
  const handleGalaxyChange = (delta: number) => {
    const newGalaxy = Math.max(1, Math.min(MAX_GALAXIES, galaxy + delta));
    setGalaxy(newGalaxy);
    setSelectedPosition(null);
  };

  const handleSystemChange = (delta: number) => {
    const newSystem = Math.max(1, Math.min(MAX_SYSTEMS, system + delta));
    setSystem(newSystem);
    setSystemInputValue(newSystem.toString());
    setSelectedPosition(null);
  };

  const handleSystemInputChange = (value: string) => {
    setSystemInputValue(value);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= MAX_SYSTEMS) {
      setSystem(num);
      setSelectedPosition(null);
    }
  };

  const handleGoToMySystem = () => {
    if (planetData) {
      const [planet] = planetData;
      const playerGalaxy = Number(planet.coordinates[0]);
      const playerSystem = Number(planet.coordinates[1]);
      if (playerGalaxy > 0 && playerSystem > 0) {
        setGalaxy(playerGalaxy);
        setSystem(playerSystem);
        setSystemInputValue(playerSystem.toString());
        setSelectedPosition(null);
      }
    }
  };

  const handlePlanetSelect = (position: number, _planet: PlanetData | null) => {
    setSelectedPosition(position);
  };

  // Handle action button click from GalaxyActionPanel
  const handleAction = (mission: number, _coordinates: [number, number, number]) => {
    // Check if this is a withdraw action (moving FROM outpost TO planet)
    const isWithdraw = mission === FLEET_ACTION_WITHDRAW;
    setIsWithdrawMode(isWithdraw);
    setSelectedMission(isWithdraw ? FLEET_MISSION.MOVE : mission);
    setIsModalOpen(true);
  };

  // Helper to get outpost resources (only the matching type based on outpost type)
  const getOutpostResources = (data: typeof selectedData) => {
    const amount = Number(data?.storedResources ?? 0);
    const type = data?.outpostType ?? 0;
    return {
      titanium: type === 1 ? amount : 0,
      helium3: type === 2 ? amount : 0,
      darkMatter: type === 3 ? amount : 0,
    };
  };

  // Check if player has their own planet loaded for the My System button
  const hasPlayerCoordinates = planetData && planetData[0].coordinates[0] > 0;

  // Loading state
  if (loadingPlanet) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-[var(--text-secondary)]">Loading galaxy map...</p>
        </div>
      </GameLayout>
    );
  }

  return (
    <GameLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[var(--resource-helium3)]/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-[var(--resource-helium3)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Galaxy Map
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Explore the universe
            </p>
          </div>
        </div>

        {/* Navigation Bar */}
        <Card padding="sm">
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              {/* Galaxy Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] text-sm">Galaxy:</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGalaxyChange(-1)}
                    disabled={galaxy <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-mono text-lg text-[var(--accent-primary)] min-w-[2rem] text-center">
                    {galaxy}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGalaxyChange(1)}
                    disabled={galaxy >= MAX_GALAXIES}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* System Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] text-sm">System:</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSystemChange(-1)}
                    disabled={system <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <input
                    type="number"
                    min={1}
                    max={MAX_SYSTEMS}
                    value={systemInputValue}
                    onChange={(e) => handleSystemInputChange(e.target.value)}
                    className="w-16 bg-[var(--bg-tertiary)] border border-[var(--bg-tertiary)] rounded px-2 py-1 font-mono text-center text-[var(--accent-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSystemChange(1)}
                    disabled={system >= MAX_SYSTEMS}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* My System Button */}
              {hasPlayerCoordinates && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGoToMySystem}
                  leftIcon={<Home className="w-4 h-4" />}
                >
                  My System
                </Button>
              )}

              {/* Current coordinates display */}
              <div className="ml-auto text-[var(--text-muted)] text-sm font-mono">
                [{galaxy}:{system}:*]
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Three.js Scene */}
          <div className="lg:col-span-2">
            <Card padding="none">
              {loadingSystem ? (
                <div className="h-[500px] lg:h-[60vh] flex items-center justify-center">
                  <p className="text-[var(--text-secondary)]">Loading system...</p>
                </div>
              ) : (
                <SystemScene
                  planets={positions}
                  playerAddress={address}
                  onPlanetSelect={handlePlanetSelect}
                  selectedPosition={selectedPosition}
                />
              )}
            </Card>
          </div>

          {/* Details Panel */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader
                title={selectedData?.isOutpost ? "Outpost Details" : "Planet Details"}
                subtitle="Select a position to view details"
              />
              <CardContent>
                {selectedPosition && selectedData ? (
                  selectedData.isOutpost ? (
                    // Outpost Details (positions 11-15)
                    <div className="space-y-4">
                      {/* Outpost Type */}
                      <div>
                        <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                          Type
                        </p>
                        <p className="text-lg font-display text-[var(--text-primary)]" style={{
                          color: selectedData.outpostType === 1 ? '#d97706' :
                                 selectedData.outpostType === 2 ? '#3b82f6' :
                                 selectedData.outpostType === 3 ? '#8b5cf6' : 'inherit'
                        }}>
                          {OUTPOST_TYPE_NAMES[selectedData.outpostType || 0]}
                        </p>
                      </div>

                      {/* Owner */}
                      <div>
                        <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                          Owner
                        </p>
                        <p className="font-mono text-sm text-[var(--text-secondary)]">
                          {selectedData.exists ? truncateAddress(selectedData.owner) : 'Unclaimed'}
                        </p>
                      </div>

                      {/* Coordinates */}
                      <div>
                        <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                          Coordinates
                        </p>
                        <p className="font-mono text-[var(--accent-secondary)]">
                          [{selectedData.coordinates[0]}:{selectedData.coordinates[1]}:{selectedData.coordinates[2]}]
                        </p>
                      </div>

                      {/* Stored Resources */}
                      <div>
                        <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                          Stored Resources
                        </p>
                        <p className="font-mono text-[var(--text-primary)]" style={{
                          color: selectedData.outpostType === 1 ? '#d97706' :
                                 selectedData.outpostType === 2 ? '#3b82f6' :
                                 selectedData.outpostType === 3 ? '#8b5cf6' : 'inherit'
                        }}>
                          {Number(selectedData.storedResources || 0).toLocaleString()} {OUTPOST_RESOURCE_MAP[selectedData.outpostType || 0] || ''}
                        </p>
                      </div>

                      {/* Garrison */}
                      {selectedData.garrison && (
                        <div>
                          <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                            Garrison
                          </p>
                          {(() => {
                            const totalShips = selectedData.garrison.reduce((sum, count) => sum + Number(count), 0);
                            if (totalShips === 0) {
                              return <p className="text-[var(--text-muted)] text-sm">No ships stationed</p>;
                            }
                            return (
                              <div className="space-y-1">
                                <p className="font-mono text-[var(--text-primary)]">{totalShips} ships total</p>
                                <div className="text-xs text-[var(--text-secondary)]">
                                  {(Object.entries(SHIP_TYPE_INDEX) as [string, number][])
                                    .filter(([key, idx]) => key !== 'NONE' && Number(selectedData.garrison?.[idx] || 0) > 0)
                                    .map(([key, idx]) => {
                                      const shipKey = SHIP_TYPE_REVERSE_MAP[idx];
                                      const name = shipKey ? SHIP_NAMES[shipKey as keyof ShipComposition] : key;
                                      return (
                                        <p key={idx}>{name}: {Number(selectedData.garrison![idx])}</p>
                                      );
                                    })
                                  }
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Ownership Badge */}
                      {selectedData.exists ? (
                        isSelectedMine ? (
                          <div className="mt-4 px-3 py-2 bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 rounded">
                            <p className="text-[var(--accent-primary)] text-sm font-semibold">
                              This is your outpost
                            </p>
                          </div>
                        ) : null
                      ) : (
                        <div className="mt-4 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--bg-tertiary)] rounded">
                          <p className="text-[var(--text-muted)] text-sm">
                            Available for capture
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <GalaxyActionPanel
                        selectedData={selectedData}
                        playerAddress={address}
                        onAction={handleAction}
                        disabled={!planetId}
                      />
                    </div>
                  ) : selectedData.exists ? (
                    // Planet Details (positions 1-10) - occupied
                    <div className="space-y-4">
                      {/* Planet Name */}
                      <div>
                        <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                          Name
                        </p>
                        <p className="text-lg font-display text-[var(--text-primary)]">
                          {selectedData.name}
                        </p>
                      </div>

                      {/* Owner */}
                      <div>
                        <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                          Owner
                        </p>
                        <p className="font-mono text-sm text-[var(--text-secondary)]">
                          {truncateAddress(selectedData.owner)}
                        </p>
                      </div>

                      {/* Coordinates */}
                      <div>
                        <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                          Coordinates
                        </p>
                        <p className="font-mono text-[var(--accent-secondary)]">
                          [{selectedData.coordinates[0]}:{selectedData.coordinates[1]}:{selectedData.coordinates[2]}]
                        </p>
                      </div>

                      {/* Position */}
                      <div>
                        <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                          Position
                        </p>
                        <p className="font-mono text-[var(--text-primary)]">
                          {selectedPosition} / {POSITIONS_COUNT}
                        </p>
                      </div>

                      {/* Your Planet Badge */}
                      {isSelectedMine && (
                        <div className="mt-4 px-3 py-2 bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 rounded">
                          <p className="text-[var(--accent-primary)] text-sm font-semibold">
                            This is your planet
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <GalaxyActionPanel
                        selectedData={selectedData}
                        playerAddress={address}
                        onAction={handleAction}
                        disabled={!planetId}
                      />
                    </div>
                  ) : (
                    // Planet slot - empty
                    <div className="space-y-4">
                      <div>
                        <p className="text-lg font-display text-[var(--text-muted)]">
                          Empty - Position {selectedPosition}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-1">
                          Coordinates
                        </p>
                        <p className="font-mono text-[var(--accent-secondary)]">
                          [{galaxy}:{system}:{selectedPosition}]
                        </p>
                      </div>
                      <p className="text-[var(--text-muted)] text-sm">
                        No planet at this position. This slot is available for colonization.
                      </p>

                      {/* Action Buttons */}
                      <GalaxyActionPanel
                        selectedData={selectedData}
                        playerAddress={address}
                        onAction={handleAction}
                        disabled={!planetId}
                      />
                    </div>
                  )
                ) : (
                  <p className="text-[var(--text-muted)]">
                    Click on a position in the system view to see its details.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Position Indicators */}
        <Card>
          <CardHeader title="System Positions" subtitle="Click to select a position" />
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {positions.map((posData, index) => {
                const position = index + 1;
                const isMine = posData.exists &&
                  address &&
                  posData.owner.toLowerCase() === address.toLowerCase();
                const isOccupied = posData.exists && !isMine;
                const isSelected = selectedPosition === position;
                const isOutpost = posData.isOutpost;

                // Get outpost-specific color
                const getOutpostColor = () => {
                  if (!isOutpost) return null;
                  switch (posData.outpostType) {
                    case 1: return '#d97706'; // Titanium - orange
                    case 2: return '#3b82f6'; // Helium-3 - blue
                    case 3: return '#8b5cf6'; // Dark Matter - purple
                    default: return '#6b7280';
                  }
                };
                const outpostColor = getOutpostColor();

                // Get title for tooltip
                const getTitle = () => {
                  if (isOutpost) {
                    const typeName = OUTPOST_TYPE_NAMES[posData.outpostType || 0];
                    return posData.exists
                      ? `${typeName} (Owned)`
                      : `${typeName} (Unclaimed)`;
                  }
                  return posData.exists ? posData.name : `Empty - Position ${position}`;
                };

                return (
                  <button
                    key={position}
                    onClick={() => handlePlanetSelect(position, posData.exists ? posData : null)}
                    className={`
                      w-10 h-10 flex items-center justify-center font-mono text-sm
                      border transition-all duration-200
                      ${isOutpost ? 'rounded-sm' : 'rounded'}
                      ${isSelected
                        ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary)]/20 text-[var(--accent-secondary)]'
                        : isMine
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] shadow-[0_0_10px_rgba(0,255,136,0.3)]'
                          : isOccupied
                            ? isOutpost
                              ? 'bg-opacity-20'
                              : 'border-[var(--bg-tertiary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                            : isOutpost
                              ? 'border-dashed bg-[var(--bg-primary)] hover:border-opacity-100'
                              : 'border-[var(--bg-tertiary)] bg-[var(--bg-primary)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                      }
                    `}
                    style={isOutpost && !isSelected && !isMine ? {
                      borderColor: outpostColor || undefined,
                      color: outpostColor || undefined,
                      backgroundColor: isOccupied ? `${outpostColor}20` : undefined,
                    } : undefined}
                    title={getTitle()}
                  >
                    {position}
                  </button>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-[var(--text-muted)]">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-[var(--accent-primary)] bg-[var(--accent-primary)]/20" />
                <span>Yours</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-[var(--bg-tertiary)] bg-[var(--bg-tertiary)]" />
                <span>Occupied</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-[var(--bg-tertiary)] bg-[var(--bg-primary)]" />
                <span>Empty</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-sm border border-dashed border-[#d97706] bg-[var(--bg-primary)]" />
                <span>Outpost</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-[var(--accent-secondary)] bg-[var(--accent-secondary)]/20" />
                <span>Selected</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Fleet Modal */}
      {selectedData && (
        <QuickFleetModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setIsWithdrawMode(false);
          }}
          mission={selectedMission}
          destination={isWithdrawMode ? playerCoordinates : selectedData.coordinates}
          destinationName={isWithdrawMode ? (planetData?.[0]?.name || 'Home Planet') : (selectedData.name || `Position ${selectedPosition}`)}
          planetId={planetId!}
          ships={isWithdrawMode ? {
            smallCargo: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.SMALL_CARGO] ?? 0),
            largeCargo: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.LARGE_CARGO] ?? 0),
            lightFighter: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.LIGHT_FIGHTER] ?? 0),
            heavyFighter: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.HEAVY_FIGHTER] ?? 0),
            cruiser: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.CRUISER] ?? 0),
            battleship: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.BATTLESHIP] ?? 0),
            battlecruiser: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.BATTLECRUISER] ?? 0),
            bomber: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.BOMBER] ?? 0),
            destroyer: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.DESTROYER] ?? 0),
            colonyShip: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.COLONY_SHIP] ?? 0),
            recycler: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.RECYCLER] ?? 0),
            crawler: Number(selectedData.garrison?.[SHIP_TYPE_INDEX.CRAWLER] ?? 0),
          } : playerShips}
          currentResources={isWithdrawMode ? getOutpostResources(selectedData) : playerResources}
          planetCoordinates={playerCoordinates}
          isFromOutpost={isWithdrawMode}
          outpostOrigin={isWithdrawMode ? selectedData.coordinates : undefined}
          outpostType={isWithdrawMode ? selectedData.outpostType : undefined}
          currentFleets={currentFleets}
          maxFleets={maxFleets}
          computerTechLevel={computerTechLevel}
        />
      )}
    </GameLayout>
  );
}
