# Frontend Reference

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Landing page (wallet connect)
│   │   ├── layout.tsx                # Root layout with providers
│   │   └── game/
│   │       ├── layout.tsx            # Game layout wrapper
│   │       ├── page.tsx              # Dashboard
│   │       ├── buildings/page.tsx    # Building upgrades
│   │       ├── shipyard/page.tsx     # Ship construction
│   │       ├── fortifications/page.tsx # Defense building
│   │       ├── fleet/page.tsx        # Fleet dispatch + active fleets
│   │       ├── galaxy/page.tsx       # 3D galaxy map
│   │       ├── research/page.tsx     # Research tree
│   │       ├── reports/page.tsx      # Battle reports
│   │       ├── settings/page.tsx     # Settings
│   │       └── onboarding/page.tsx   # New player planet claiming
│   ├── components/
│   │   ├── ui/                       # Base UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── ResourceDisplay.tsx
│   │   │   ├── ContractConfigWarning.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── NetworkGuard.tsx
│   │   │   └── index.ts
│   │   ├── layout/                   # Layout components
│   │   │   ├── GameLayout.tsx
│   │   │   ├── GameHeader.tsx
│   │   │   ├── Navigation.tsx
│   │   │   ├── ResourceHeader.tsx
│   │   │   ├── PlanetSelector.tsx
│   │   │   └── index.ts
│   │   ├── game/                     # Game-specific components
│   │   │   ├── BuildingCard.tsx
│   │   │   ├── BuildQueue.tsx
│   │   │   ├── ShipCard.tsx
│   │   │   ├── ShipQueue.tsx
│   │   │   ├── DefenseCard.tsx
│   │   │   ├── DefenseQueue.tsx
│   │   │   ├── FleetDispatchForm.tsx
│   │   │   ├── FleetCard.tsx
│   │   │   ├── FleetList.tsx
│   │   │   ├── QuickFleetModal.tsx
│   │   │   ├── GalaxyActionPanel.tsx
│   │   │   ├── SystemScene.tsx       # Three.js system view
│   │   │   ├── BattleReportCard.tsx
│   │   │   ├── BattleReportList.tsx
│   │   │   └── index.ts
│   │   ├── auth/
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── index.ts
│   │   └── providers/
│   │       ├── Web3Provider.tsx
│   │       └── index.ts
│   ├── hooks/
│   │   ├── useNexusGame.ts           # All contract interaction hooks (54 hooks)
│   │   ├── useActivePlanetId.ts      # Multi-planet selection
│   │   └── index.ts
│   ├── lib/
│   │   ├── contracts.ts              # ABIs and addresses
│   │   ├── wagmiConfig.ts            # Chain config
│   │   ├── utils.ts                  # Utility functions
│   │   ├── gameLogic.ts              # Client-side calculations
│   │   └── transactionErrors.ts      # Error parsing
│   ├── stores/
│   │   ├── planetStore.ts            # Zustand store
│   │   └── userStore.ts
│   ├── types/
│   │   └── game.ts                   # TypeScript interfaces
│   └── constants/
│       └── gameConfig.ts             # Game constants (names, configs, costs)
```

## UI Components

### Button

```tsx
import { Button } from '@/components/ui';

// Variants: 'primary' | 'secondary' | 'ghost' | 'danger'
// Sizes: 'sm' | 'md' | 'lg'

<Button variant="primary" size="md" onClick={fn} disabled={false} isLoading={false}>
  Click Me
</Button>
```

### Card

```tsx
import { Card, CardHeader, CardContent } from '@/components/ui';

<Card className="hover:border-[var(--accent-primary)] transition-colors">
  <CardHeader>
    <h3 className="font-display text-lg">Title</h3>
  </CardHeader>
  <CardContent>
    <p>Content goes here</p>
  </CardContent>
</Card>
```

### ProgressBar

```tsx
import { ProgressBar } from '@/components/ui';

<ProgressBar
  progress={75}
  variant="primary"
  size="md"
  showLabel={true}
/>
```

### ResourceDisplay

```tsx
import { ResourceDisplay } from '@/components/ui';

// Displays resource amounts with color-coded styling
```

## Layout Components

### GameLayout

Wraps all game pages with header, navigation, and resource display.

```tsx
import { GameLayout } from '@/components/layout';

export default function MyPage() {
  return (
    <GameLayout>
      <div className="space-y-6">
        {/* Page content */}
      </div>
    </GameLayout>
  );
}
```

### PlanetSelector

Allows players with multiple planets (via colonization) to switch active planet.

### Navigation Items

Current nav items (in Navigation.tsx):
```typescript
const navItems = [
  { label: 'Overview', href: '/game', icon: Home },
  { label: 'Buildings', href: '/game/buildings', icon: Building2 },
  { label: 'Shipyard', href: '/game/shipyard', icon: Ship },
  { label: 'Fortifications', href: '/game/fortifications', icon: ShieldAlert },
  { label: 'Fleet', href: '/game/fleet', icon: Rocket },
  { label: 'Galaxy', href: '/game/galaxy', icon: Globe },
  { label: 'Research', href: '/game/research', icon: FlaskConical },
  { label: 'Reports', href: '/game/reports', icon: FileText },
];
```

## Hooks Reference (frontend/src/hooks/useNexusGame.ts)

### Planet Hooks

```typescript
const { hasPlanet, isLoading } = useHasPlanet();
const { data: planetId } = usePlayerPlanetId();
const { data: planets } = usePlayerPlanets();          // All player planets
const { data: count } = usePlayerPlanetCount();
const { data: planetData } = usePlanetData(planetId);  // [planet, buildings, resources, queue]
```

### Resource Hooks

```typescript
const { data: resources } = useCurrentResources(planetId);  // [titanium, helium3, darkMatter]
const { data: production } = useProductionRates(planetId);   // [perHour, perHour, perHour]
const { data: cost } = useUpgradeCost(buildingType, level);
const { data: time } = useBuildTime(buildingType, level);
```

### Building Hooks (Write)

```typescript
const { claimPlanet, isPending, isConfirming, isSuccess } = useClaimStarterPlanet();
const { upgradeBuilding, ... } = useUpgradeBuilding();
const { completeUpgrade, ... } = useCompleteUpgrade();
const { cancelUpgrade, ... } = useCancelUpgrade();
const { claimResources, ... } = useClaimResources();
```

### Ship Hooks

```typescript
const { data: ships } = useShips(planetId);           // uint256[13] array
const { data: queue } = useShipQueue(planetId);        // ShipQueue struct
const { data: cost } = useShipCost(shipType);
const { data: time } = useShipBuildTime(shipType, quantity, shipyardLevel);
const { buildShips, ... } = useBuildShips();
const { completeShipBuild, ... } = useCompleteShipBuild();
const { cancelShipBuild, ... } = useCancelShipBuild();
```

### Defense Hooks

```typescript
const { data: defenses } = useDefenses(planetId);      // uint256[9] array
const { data: queue } = useDefenseQueue(planetId);
const { data: time } = useDefenseBuildTime(defenseType, quantity, shipyardLevel);
const { buildDefenses, ... } = useBuildDefenses();
const { completeDefenseBuild, ... } = useCompleteDefenseBuild();
const { cancelDefenseBuild, ... } = useCancelDefenseBuild();
```

### Research Hooks

```typescript
const { data: research } = usePlayerResearch();         // ResearchLevels struct
const { data: queue } = useResearchQueue();
const { data: cost } = useResearchCost(researchType, level);
const { data: time } = useResearchTime(researchType, level, nodeLevel);
const { startResearch, ... } = useStartResearch();
const { completeResearch, ... } = useCompleteResearch();
const { cancelResearch, ... } = useCancelResearch();
```

### Fleet Hooks

```typescript
const { data: fleetIds } = usePlayerFleetIds();
const { data: fleet } = useFleet(fleetId);
const { data: count } = usePlayerFleetCount();
const { data: stationed } = useStationedShips(galaxy, system, position);
const { dispatchFleet, ... } = useDispatchFleet();
const { dispatchFleetFromOutpost, ... } = useDispatchFleetFromOutpost();
const { resolveFleet, ... } = useResolveFleet();
const { completeFleet, ... } = useCompleteFleet();
```

### Galaxy & Outpost Hooks

```typescript
const { data: planets } = useSystemPlanets(galaxy, system);
const { data: outpost } = useOutpost(galaxy, system, position);
const { data: outposts } = useSystemOutposts(galaxy, system);
const { data: resources } = useCalculateOutpostResources(galaxy, system, position);
const { data: playerOutposts } = usePlayerOutposts();
```

### Battle Report Hooks

```typescript
const { data: report } = useBattleReport(reportId);
const { data: reportIds } = usePlayerReportIds();
const { data: count } = usePlayerReportCount();
const { data: recentIds } = usePlayerRecentReports(10);
```

### Utility Hooks

```typescript
const { data: timestamp } = useBlockTimestamp();
const activePlanetId = useActivePlanetId();  // From useActivePlanetId.ts
```

### Hook State Pattern

All write hooks follow this pattern:
```typescript
const {
  actionFn,      // Function to call
  isPending,     // Transaction being prepared
  isConfirming,  // Waiting for blockchain confirmation
  isSuccess,     // Transaction confirmed
  error,         // Error object if failed
  reset,         // Reset state for retry
} = useWriteHook();
```

## Common Patterns

### Loading States

```tsx
if (isLoading) {
  return (
    <GameLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
      </div>
    </GameLayout>
  );
}
```

### Error Handling

```tsx
{error && (
  <Card className="border-[var(--accent-warn)]">
    <CardContent>
      <div className="flex items-center gap-2 text-[var(--accent-warn)]">
        <AlertCircle className="w-5 h-5" />
        <span>{error.message}</span>
      </div>
    </CardContent>
  </Card>
)}
```

### Transaction Status

```tsx
const getStatus = () => {
  if (isSuccess) return { text: 'Success!', icon: CheckCircle, color: 'text-green-400' };
  if (isConfirming) return { text: 'Confirming...', icon: Loader2, color: 'text-yellow-400' };
  if (isPending) return { text: 'Waiting for wallet...', icon: Loader2, color: 'text-blue-400' };
  return null;
};
```

### Query Invalidation After Mutations

```tsx
const queryClient = useQueryClient();

useEffect(() => {
  if (isSuccess) {
    queryClient.invalidateQueries({ queryKey: ['readContract'] });
  }
}, [isSuccess, queryClient]);
```

## Utility Functions

```typescript
import { formatNumber, formatTime, formatCoordinates, cn } from '@/lib/utils';

formatNumber(12450)           // "12,450"
formatTime(3661)              // "1h 1m"
formatCoordinates([1, 5, 3])  // "[1:5:3]"
cn('base-class', condition && 'conditional-class')  // Tailwind class merge
```

## Adding a New Feature (Checklist)

1. [ ] Define types in `frontend/src/types/game.ts`
2. [ ] Add constants to `frontend/src/constants/gameConfig.ts`
3. [ ] Update ABI: `npm run export-abi` in contracts, copy to `frontend/src/contracts/abi/`
4. [ ] Create hooks in `frontend/src/hooks/useNexusGame.ts`
5. [ ] Export hooks from `frontend/src/hooks/index.ts`
6. [ ] Create page at `frontend/src/app/game/[feature]/page.tsx`
7. [ ] Create components in `frontend/src/components/game/`
8. [ ] Update navigation in `frontend/src/components/layout/Navigation.tsx`
