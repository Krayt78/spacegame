---
name: nexus-protocol
description: >
  Development guide for Nexus Protocol, an on-chain OGame-style space strategy game on Polkadot AssetHub.
  Use when working on Solidity contracts (NexusGame.sol, GameConfig.sol), Next.js/React frontend with wagmi/viem,
  game mechanics (buildings, resources, ships, research, fleets, combat), or UI components.
  Triggers on: Nexus Protocol, space game, OGame, buildings, resources, ships, fleets, planets, titanium, helium-3, dark matter.
---

# Nexus Protocol Development Guide

On-chain space strategy game inspired by OGame, built on Polkadot AssetHub.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (frontend/)                    │
│  Next.js 16 + React 19 + wagmi v3 + viem v2 + ConnectKit   │
│  ├── /app/game/*          → 9 Game pages                   │
│  ├── /hooks/*             → 54 contract interaction hooks   │
│  ├── /components/game/*   → 15 game components              │
│  └── /lib/contracts.ts    → ABIs + addresses                │
└─────────────────────────────┬───────────────────────────────┘
                              │ JSON-RPC
┌─────────────────────────────▼───────────────────────────────┐
│              Smart Contracts (10 Solidity files)             │
│  NexusGame.sol       → Router (delegates to managers)       │
│  GameState.sol       → Single storage contract              │
│  GameConfig.sol      → All costs, rates, enums, formulas    │
│  PlanetManager.sol   → Planets, buildings, resources        │
│  ShipManager.sol     → Ship building queue                  │
│  FleetManager.sol    → Fleet dispatch, movement, outposts   │
│  FleetResolver.sol   → Fleet resolution, combat integration │
│  CombatEngine.sol    → 6-round iterative combat math        │
│  ResearchManager.sol → Research queue (13 technologies)     │
│  DefenseManager.sol  → Defense building (8 types)           │
└─────────────────────────────────────────────────────────────┘
```

## Quick Reference

### Resources
| Resource | Variable | Production Building | Storage Building |
|----------|----------|---------------------|------------------|
| Titanium | `titanium` | Titanium Extractor | Titanium Vault |
| Helium-3 | `helium3` | Helium-3 Harvester | Helium-3 Tank |
| Dark Matter | `darkMatter` | Dark Matter Collector | Dark Matter Containment |

### Building Type Enum (Contract)
```solidity
enum BuildingType {
    NONE,                    // 0
    TITANIUM_EXTRACTOR,      // 1
    HELIUM3_HARVESTER,       // 2
    DARKMATTER_COLLECTOR,    // 3
    TITANIUM_VAULT,          // 4
    HELIUM3_TANK,            // 5
    DARKMATTER_CONTAINMENT,  // 6
    SHIPYARD,                // 7
    RESEARCH_NODE,           // 8
    UNDERGROUND_BUNKER       // 9
}
```

### Frontend Building Key Map
```typescript
const BUILDING_TYPE_MAP: Record<string, number> = {
  titaniumExtractor: 1,
  helium3Harvester: 2,
  darkMatterCollector: 3,
  titaniumVault: 4,
  helium3Tank: 5,
  darkMatterContainment: 6,
  shipyard: 7,
  researchNode: 8,
  undergroundBunker: 9,
};
```

## Contract Patterns

### Multi-Contract Router Pattern
NexusGame.sol is the router. All calls go through it and are delegated to the appropriate manager.
Managers use `onlyRouter` modifier. GameState uses `onlyManager` modifier.

### Adding New Features to the Contracts

1. **Add implementation** in the appropriate Manager contract
2. **Add route** in NexusGame.sol that delegates to the manager
3. **Add storage** in GameState.sol if needed
4. **Add config** in GameConfig.sol if needed
5. **Compile** and check all contracts stay under 24KB
6. **Export ABIs** via `npm run export-abi`

```solidity
// Manager function pattern
function doSomething(uint256 planetId, ...) external onlyRouter {
    // ... logic
    emit SomethingDone(planetId, ...);
}

// Router delegation pattern
function doSomething(uint256 planetId, ...) external nonReentrant {
    manager.doSomething(planetId, ...);
}
```

### Cost/Production Formulas (GameConfig.sol)
```solidity
// Cost scales exponentially: baseCost * (multiplier/100)^level
cost = baseCost * _pow(costMultiplier, level) / _pow(100, level);

// Production includes linear level factor: baseProduction * level * (multiplier/100)^level
production = (baseProduction * level * _pow(productionMultiplier, level)) / _pow(100, level);

// Build time: totalCost / 25
buildTime = totalCost / 25;

// Ship build time: totalCost * qty / (25 * (1 + shipyardLevel))
shipBuildTime = totalCost * quantity / (25 * (1 + shipyardLevel));
```

## Frontend Patterns

### Creating a New Hook (useNexusGame.ts pattern)

```typescript
// READ hook
export function useFeatureData(param: bigint | undefined) {
  const result = useReadContract({
    address: NEXUS_GAME_ADDRESS,
    abi: nexusGameAbi,
    functionName: 'getFeature',
    args: param !== undefined ? [param] : undefined,
    query: { enabled: !!param && !!NEXUS_GAME_ADDRESS },
  });
  return result;
}

// WRITE hook
export function useDoAction() {
  const queryClient = useQueryClient();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const doAction = (param: bigint) => {
    writeContract({
      address: NEXUS_GAME_ADDRESS,
      abi: nexusGameAbi,
      functionName: 'doAction',
      args: [param],
    });
  };

  // Invalidate queries on success
  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['readContract'] });
    }
  }, [isSuccess, queryClient]);

  return { doAction, isPending, isConfirming, isSuccess, error, reset };
}
```

### Creating a New Page

1. Create file at `frontend/src/app/game/[feature]/page.tsx`
2. Use `'use client';` directive
3. Wrap with `<GameLayout>` component
4. Follow existing page structure:

```typescript
'use client';

import { GameLayout } from '@/components/layout';
import { Card, CardHeader, CardContent, Button } from '@/components/ui';
import { usePlayerPlanetId, usePlanetData } from '@/hooks';

export default function FeaturePage() {
  const { data: planetId } = usePlayerPlanetId();
  const { data: planetData, isLoading } = usePlanetData(planetId as bigint);

  if (isLoading) {
    return <GameLayout><LoadingState /></GameLayout>;
  }

  return (
    <GameLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-display text-[var(--accent-primary)]">
          Feature Title
        </h1>
        {/* Content */}
      </div>
    </GameLayout>
  );
}
```

### UI Component Patterns

**Card with header:**
```tsx
<Card>
  <CardHeader>
    <h3 className="font-display text-lg">Title</h3>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

**Action button:**
```tsx
<Button
  variant="primary"
  onClick={handleAction}
  disabled={isPending || isConfirming}
  isLoading={isPending || isConfirming}
>
  Action Label
</Button>
```

## CSS Variables (Design System)

```css
/* Colors */
--bg-primary: #0a0e1a;
--bg-secondary: #0f1424;
--bg-tertiary: #141a2e;
--accent-primary: #00ff88;      /* Green - primary actions */
--accent-secondary: #00d4ff;    /* Cyan - secondary elements */
--accent-tertiary: #a855f7;     /* Purple - special */
--accent-warn: #ff6b35;         /* Orange - warnings */
--text-primary: #e2e8f0;
--text-secondary: #94a3b8;
--text-muted: #64748b;

/* Resources */
--resource-titanium: #60a5fa;   /* Blue */
--resource-helium3: #34d399;    /* Green */
--resource-darkMatter: #a78bfa; /* Purple */
```

## File Locations

| Purpose | Location |
|---------|----------|
| Contract ABIs | `frontend/src/contracts/abi/` (JSON artifacts) |
| ABI imports | `frontend/src/lib/contracts.ts` |
| Wagmi hooks | `frontend/src/hooks/useNexusGame.ts` |
| Active planet hook | `frontend/src/hooks/useActivePlanetId.ts` |
| Game types | `frontend/src/types/game.ts` |
| UI components | `frontend/src/components/ui/` |
| Game components | `frontend/src/components/game/` |
| Game config constants | `frontend/src/constants/gameConfig.ts` |
| Utility functions | `frontend/src/lib/utils.ts` |
| Smart contracts | `contracts/contracts/` |

## Implementation Status

### Fully Implemented
- Planet claiming (one per player, plus colonization for additional planets)
- Building system (9 types including Underground Bunker, upgrade queue)
- Resource production & accumulation (with linear level scaling)
- Ship system (12 ship types, build queue)
- Defense system (8 defense types, build queue, shield dome limits)
- Research tree (13 technologies, per-player research)
- Fleet mechanics (RAID, CAPTURE, MOVE, COLONIZE missions)
- Combat engine (6-round iterative combat with research bonuses and advantage matrices)
- Raider outposts (3 types at positions 11-15)
- Battle reports (on-chain storage)
- Galaxy view with 3D system scene
- Frontend: All 9 game pages (buildings, shipyard, fortifications, fleet, galaxy, research, reports, settings, onboarding)

### Not Yet Implemented
- Alliances
- Messaging between players
- Leaderboards/rankings

## Reference Files

For detailed information, see:
- [contracts.md](references/contracts.md) - Full contract ABIs, structs, and function signatures
- [frontend.md](references/frontend.md) - Component library, hook patterns, and project structure
- [game-mechanics.md](references/game-mechanics.md) - OGame-style formulas and balance
