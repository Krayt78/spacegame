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
│                      Frontend (space-empire)                 │
│  Next.js 16 + React 19 + wagmi + viem + ConnectKit          │
│  ├── /app/game/*        → Game pages                        │
│  ├── /hooks/*           → Contract interaction hooks        │
│  ├── /components/*      → UI components                     │
│  └── /lib/contracts.ts  → ABIs + addresses                  │
└─────────────────────────┬───────────────────────────────────┘
                          │ JSON-RPC
┌─────────────────────────▼───────────────────────────────────┐
│                 Smart Contracts (Solidity)                   │
│  ├── NexusGame.sol      → Core game logic                   │
│  └── GameConfig.sol     → Tunable parameters (costs, rates) │
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

### Adding New Features to NexusGame.sol

1. **Define structs** at the top with other structs
2. **Add storage mappings** with existing mappings
3. **Create events** following naming: `EntityAction(indexed id, ...params)`
4. **Add modifiers** if needed for access control
5. **Implement functions** following existing patterns:

```solidity
function doSomething(uint256 planetId) external nonReentrant {
    require(planets[planetId].owner == msg.sender, "Not planet owner");
    // ... logic
    emit SomethingDone(planetId, ...);
}
```

### Cost/Production Formulas (GameConfig.sol)
```solidity
// Cost scales exponentially: baseCost * (multiplier/100)^level
cost = baseCost * _pow(costMultiplier, level) / _pow(100, level);

// Production scales: baseProduction * (multiplier/100)^(level-1)
production = baseProduction * _pow(productionMultiplier, level - 1) / _pow(100, level - 1);
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

1. Create file at `src/app/game/[feature]/page.tsx`
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

**Resource display:**
```tsx
<div className="flex items-center gap-2">
  <span className="text-2xl">💎</span>
  <span className="font-mono text-[var(--resource-titanium)]">
    {formatNumber(amount)}
  </span>
</div>
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
| Contract ABIs | `space-empire/src/lib/contracts.ts` |
| Wagmi hooks | `space-empire/src/hooks/useNexusGame.ts` |
| Game types | `space-empire/src/types/game.ts` |
| UI components | `space-empire/src/components/ui/` |
| Game components | `space-empire/src/components/game/` |
| Game config constants | `space-empire/src/constants/gameConfig.ts` |
| Utility functions | `space-empire/src/lib/utils.ts` |
| Smart contracts | `contracts/` (separate repo) |

## Implementation Status

### ✅ Implemented
- Planet claiming (one per player)
- Building system (9 types, upgrade queue)
- Resource production & accumulation
- Building upgrade/complete/cancel
- Frontend: Dashboard, Buildings, Onboarding

### 🔲 Not Implemented
- Ships & Shipyard
- Fleet movement & missions
- Combat system
- Research tree
- Galaxy view
- Multi-planet expansion
- Alliances
- Messaging/Reports

## Reference Files

For detailed information, see:
- [contracts.md](references/contracts.md) - Full contract ABIs and function signatures
- [frontend.md](references/frontend.md) - Component library and hook patterns
- [game-mechanics.md](references/game-mechanics.md) - OGame-style formulas and balance
