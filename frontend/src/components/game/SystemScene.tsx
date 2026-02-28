'use client';

import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';

export interface PlanetData {
  owner: string;
  coordinates: [number, number, number];
  name: string;
  createdAt: number;
  exists: boolean;
  // Outpost-specific fields (positions 11-15)
  isOutpost?: boolean;
  outpostType?: number; // 1=Titanium, 2=Helium-3, 3=Dark Matter
}

interface SystemSceneProps {
  planets: Array<{
    owner: string;
    coordinates: [number, number, number];
    name: string;
    createdAt: number;
    exists: boolean;
    isOutpost?: boolean;
    outpostType?: number;
  }>;
  playerAddress: string | undefined;
  onPlanetSelect: (position: number, planet: PlanetData | null) => void;
  selectedPosition: number | null;
}

// Outpost type names for hover labels
const OUTPOST_TYPE_LABELS: Record<number, string> = {
  0: 'Outpost',
  1: 'Titanium Mine',
  2: 'Helium-3 Lab',
  3: 'Dark Matter Refinery',
};

// Outpost colors based on type
const OUTPOST_COLORS: Record<number, string> = {
  0: '#6b7280', // Gray for unknown
  1: '#d97706', // Orange for Titanium
  2: '#3b82f6', // Blue for Helium-3
  3: '#8b5cf6', // Purple for Dark Matter
};

// Calculate orbital radius for each position (1-15)
function getOrbitalRadius(position: number): number {
  return 3 + position * 1.8;
}

// Golden angle distribution for planet positions
function getPlanetAngle(position: number): number {
  return (position * 137.5 * Math.PI) / 180;
}

// Get position on orbital ring
function getPlanetPosition(position: number): [number, number, number] {
  const radius = getOrbitalRadius(position);
  const angle = getPlanetAngle(position);
  return [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
}

// Sun component with pulsing glow effect
function Sun() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const scale = 1 + Math.sin(clock.elapsedTime * 2) * 0.05;
    if (meshRef.current) {
      meshRef.current.scale.setScalar(scale);
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(scale * 1.5);
    }
  });

  return (
    <group>
      {/* Main sun sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshBasicMaterial color="#ffaa33" />
      </mesh>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.8, 32, 32]} />
        <meshBasicMaterial color="#ff8800" transparent opacity={0.3} />
      </mesh>
      {/* Point light from sun */}
      <pointLight color="#ffcc66" intensity={2} distance={100} />
      {/* Ambient light for the scene - ensures planets far from sun are still visible */}
      <ambientLight intensity={0.35} />
    </group>
  );
}

// Orbital ring component
function OrbitalRing({ position }: { position: number }) {
  const radius = getOrbitalRadius(position);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.02, 8, 64]} />
      <meshBasicMaterial color="#1a2744" transparent opacity={0.6} />
    </mesh>
  );
}

// Planet component
interface PlanetProps {
  position: number;
  planetData: PlanetData | null;
  isPlayerPlanet: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

function Planet({ position, planetData, isPlayerPlanet, isSelected, onSelect }: PlanetProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const pos = getPlanetPosition(position);
  const exists = planetData?.exists;
  const isOtherPlayer = exists && !isPlayerPlanet;

  // Determine planet appearance with improved visibility
  // Your planet: largest and brightest
  // Other players: clearly visible, moderate size
  // Empty: very small and subtle (nearly invisible)
  const planetSize = exists
    ? (isPlayerPlanet ? 0.55 : 0.45)
    : 0.08;

  // Color palette:
  // Player: bright green (#00ff88)
  // Other players: warm rocky tone for visibility (#c4956a)
  // Empty: very dark, nearly invisible
  const planetColor = exists
    ? (isPlayerPlanet ? '#00ff88' : '#c4956a')
    : '#0d1220';

  // Emissive colors for self-lighting (visible even far from sun)
  const getEmissiveColor = () => {
    if (isPlayerPlanet && exists) return '#00ff88';
    if (isOtherPlayer) return '#c4956a';
    if (hovered) return '#ffffff';
    return '#000000';
  };

  const getEmissiveIntensity = () => {
    if (isPlayerPlanet && exists) return 0.5;
    if (isOtherPlayer) return 0.35;
    if (hovered) return 0.2;
    return 0;
  };

  // Animate selection ring
  useFrame(({ clock }) => {
    if (ringRef.current && (isSelected || (isPlayerPlanet && exists) || isOtherPlayer)) {
      ringRef.current.rotation.z = clock.elapsedTime * 2;
    }
  });

  // Determine if we should show the orbital ring
  const showRing = isSelected || (isPlayerPlanet && exists) || isOtherPlayer;

  // Ring color: selected = bright cyan, player = green, other players = subtle cyan
  const getRingColor = () => {
    if (isSelected) return '#00d4ff';
    if (isPlayerPlanet) return '#00ff88';
    return '#00d4ff';
  };

  const getRingOpacity = () => {
    if (isSelected) return 0.9;
    if (isPlayerPlanet) return 0.8;
    return 0.4; // Subtle ring for other players
  };

  return (
    <group position={pos}>
      {/* Planet mesh */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[planetSize, 16, 16]} />
        <meshStandardMaterial
          color={planetColor}
          emissive={getEmissiveColor()}
          emissiveIntensity={getEmissiveIntensity()}
        />
      </mesh>

      {/* Outer glow for occupied planets (makes them more visible) */}
      {exists && (
        <mesh>
          <sphereGeometry args={[planetSize * 1.3, 16, 16]} />
          <meshBasicMaterial
            color={isPlayerPlanet ? '#00ff88' : '#4a9eff'}
            transparent
            opacity={isPlayerPlanet ? 0.15 : 0.1}
          />
        </mesh>
      )}

      {/* Selection/highlight ring for all occupied planets */}
      {showRing && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[planetSize + 0.15, 0.03, 8, 32]} />
          <meshBasicMaterial
            color={getRingColor()}
            transparent
            opacity={getRingOpacity()}
          />
        </mesh>
      )}

      {/* Hover label */}
      {hovered && (
        <Html
          position={[0, planetSize + 0.5, 0]}
          center
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              background: 'rgba(10, 14, 26, 0.9)',
              border: '1px solid #00ff88',
              padding: '4px 8px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#e2e8f0',
            }}
          >
            {exists ? planetData?.name : `Empty - Position ${position}`}
          </div>
        </Html>
      )}
    </group>
  );
}

// Outpost component (positions 11-15)
interface OutpostProps {
  position: number;
  outpostData: PlanetData | null;
  isPlayerOutpost: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

function Outpost({ position, outpostData, isPlayerOutpost, isSelected, onSelect }: OutpostProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const pos = getPlanetPosition(position);
  const exists = outpostData?.exists;
  const outpostType = outpostData?.outpostType || 0;

  // Always show outpost with decent size - slightly larger when owned
  const outpostSize = exists
    ? (isPlayerOutpost ? 0.5 : 0.4)
    : 0.3; // Larger base size for visibility

  // Always use the type color for visibility
  const outpostColor = OUTPOST_COLORS[outpostType] || OUTPOST_COLORS[0];

  // Emissive settings - always emit some light for visibility
  const getEmissiveColor = () => {
    if (isPlayerOutpost && exists) return '#00ff88';
    return outpostColor; // Always emit the type color
  };

  const getEmissiveIntensity = () => {
    if (isPlayerOutpost && exists) return 0.8;
    if (exists) return 0.6;
    if (hovered) return 0.5;
    return 0.35; // Base emissive for unclaimed outposts
  };

  // Animate rotation and selection ring
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.elapsedTime * 0.5;
      meshRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.1;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = clock.elapsedTime * 2;
    }
  });

  // Always show ring for outposts (they're always visible points of interest)
  const showRing = true;

  // Ring color
  const getRingColor = () => {
    if (isSelected) return '#00d4ff';
    if (isPlayerOutpost && exists) return '#00ff88';
    return outpostColor;
  };

  const getRingOpacity = () => {
    if (isSelected) return 0.9;
    if (isPlayerOutpost && exists) return 0.8;
    if (exists) return 0.6;
    return 0.4; // Visible ring for unclaimed outposts too
  };

  return (
    <group position={pos}>
      {/* Outpost mesh - octahedron shape */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <octahedronGeometry args={[outpostSize, 0]} />
        <meshStandardMaterial
          color={outpostColor}
          emissive={getEmissiveColor()}
          emissiveIntensity={getEmissiveIntensity()}
        />
      </mesh>

      {/* Outer glow - always visible for outposts */}
      <mesh>
        <octahedronGeometry args={[outpostSize * 1.4, 0]} />
        <meshBasicMaterial
          color={isPlayerOutpost ? '#00ff88' : outpostColor}
          transparent
          opacity={isPlayerOutpost && exists ? 0.25 : exists ? 0.2 : 0.15}
        />
      </mesh>

      {/* Selection/highlight ring */}
      {showRing && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[outpostSize + 0.12, 0.025, 8, 32]} />
          <meshBasicMaterial
            color={getRingColor()}
            transparent
            opacity={getRingOpacity()}
          />
        </mesh>
      )}

      {/* Hover label */}
      {hovered && (
        <Html
          position={[0, outpostSize + 0.5, 0]}
          center
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              background: 'rgba(10, 14, 26, 0.9)',
              border: `1px solid ${outpostColor}`,
              padding: '4px 8px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#e2e8f0',
            }}
          >
            {OUTPOST_TYPE_LABELS[outpostType]} {exists ? '(Owned)' : '(Unclaimed)'}
          </div>
        </Html>
      )}
    </group>
  );
}

// Main scene content
function SceneContent({
  planets,
  playerAddress,
  onPlanetSelect,
  selectedPosition,
}: SystemSceneProps) {
  // Process positions array - ensure we have 15 positions
  const processedPositions = useMemo(() => {
    const result: (PlanetData | null)[] = Array(15).fill(null);
    planets.forEach((planet, index) => {
      if (index < 15) {
        // Include data for both planets and outposts (even if not "exists" for outposts display)
        result[index] = {
          owner: planet.owner,
          coordinates: planet.coordinates,
          name: planet.name,
          createdAt: planet.createdAt,
          exists: planet.exists,
          isOutpost: planet.isOutpost,
          outpostType: planet.outpostType,
        };
      }
    });
    return result;
  }, [planets]);

  return (
    <>
      {/* Star background */}
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      {/* Sun at center */}
      <Sun />

      {/* Orbital rings */}
      {Array.from({ length: 15 }, (_, i) => (
        <OrbitalRing key={`ring-${i + 1}`} position={i + 1} />
      ))}

      {/* Planets (positions 1-10) and Outposts (positions 11-15) */}
      {processedPositions.map((posData, index) => {
        const position = index + 1;
        const isPlayerOwned = posData?.exists &&
          playerAddress &&
          posData.owner.toLowerCase() === playerAddress.toLowerCase();

        // Render outpost for positions 11-15
        if (posData?.isOutpost) {
          return (
            <Outpost
              key={`outpost-${position}`}
              position={position}
              outpostData={posData}
              isPlayerOutpost={!!isPlayerOwned}
              isSelected={selectedPosition === position}
              onSelect={() => onPlanetSelect(position, posData)}
            />
          );
        }

        // Render planet for positions 1-10
        return (
          <Planet
            key={`planet-${position}`}
            position={position}
            planetData={posData?.exists ? posData : null}
            isPlayerPlanet={!!isPlayerOwned}
            isSelected={selectedPosition === position}
            onSelect={() => onPlanetSelect(position, posData?.exists ? posData : null)}
          />
        );
      })}

      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        minDistance={15}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={Math.PI / 6}
      />
    </>
  );
}

export function SystemScene({
  planets,
  playerAddress,
  onPlanetSelect,
  selectedPosition,
}: SystemSceneProps) {
  return (
    <div className="w-full h-[500px] lg:h-[60vh] rounded-lg overflow-hidden" style={{ background: '#0a0e1a' }}>
      <Canvas
        camera={{
          position: [25, 20, 25],
          fov: 45,
        }}
        gl={{ antialias: true }}
      >
        <SceneContent
          planets={planets}
          playerAddress={playerAddress}
          onPlanetSelect={onPlanetSelect}
          selectedPosition={selectedPosition}
        />
      </Canvas>
    </div>
  );
}

export default SystemScene;
