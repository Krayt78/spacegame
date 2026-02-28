# Frontend Reference

## Project Structure

```
space-empire/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page (wallet connect)
│   │   ├── layout.tsx            # Root layout with providers
│   │   └── game/
│   │       ├── page.tsx          # Dashboard
│   │       ├── buildings/page.tsx
│   │       ├── shipyard/page.tsx  # TODO
│   │       ├── fleet/page.tsx     # TODO
│   │       ├── galaxy/page.tsx    # TODO
│   │       ├── research/page.tsx  # TODO
│   │       ├── reports/page.tsx   # TODO
│   │       └── onboarding/page.tsx
│   ├── components/
│   │   ├── ui/                   # Base UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   └── index.ts
│   │   ├── layout/               # Layout components
│   │   │   ├── GameLayout.tsx
│   │   │   ├── GameHeader.tsx
│   │   │   ├── Navigation.tsx
│   │   │   └── ResourceHeader.tsx
│   │   ├── game/                 # Game-specific components
│   │   │   └── BuildingCard.tsx
│   │   ├── auth/
│   │   │   └── ProtectedRoute.tsx
│   │   └── providers/
│   │       └── Web3Provider.tsx
│   ├── hooks/
│   │   ├── useNexusGame.ts       # All contract hooks
│   │   └── index.ts
│   ├── lib/
│   │   ├── contracts.ts          # ABIs and addresses
│   │   ├── wagmiConfig.ts        # Chain config
│   │   ├── utils.ts              # Utility functions
│   │   └── gameLogic.ts          # Client-side calculations
│   ├── stores/
│   │   ├── planetStore.ts        # Zustand store (legacy)
│   │   └── userStore.ts
│   ├── types/
│   │   └── game.ts               # TypeScript interfaces
│   └── constants/
│       └── gameConfig.ts         # Game constants
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

// Full width
<Button variant="primary" className="w-full">Submit</Button>
```

### Card

```tsx
import { Card, CardHeader, CardContent } from '@/components/ui';

<Card className="hover:border-[var(--accent-primary)] transition-colors">
  <CardHeader>
    <h3 className="font-display text-lg">Title</h3>
    <p className="text-[var(--text-muted)] text-sm">Subtitle</p>
  </CardHeader>
  <CardContent>
    <p>Content goes here</p>
  </CardContent>
</Card>

// Card without header
<Card>
  <CardContent>
    <p>Simple card content</p>
  </CardContent>
</Card>
```

### ProgressBar

```tsx
import { ProgressBar } from '@/components/ui';

<ProgressBar 
  progress={75}           // 0-100
  variant="primary"       // 'primary' | 'secondary' | 'warning'
  size="md"               // 'sm' | 'md' | 'lg'
  showLabel={true}        // Show percentage label
/>
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

### Navigation Items

Current nav items (in Navigation.tsx):
```typescript
const navItems = [
  { label: 'Overview', href: '/game', icon: Home },
  { label: 'Buildings', href: '/game/buildings', icon: Building2 },
  { label: 'Shipyard', href: '/game/shipyard', icon: Ship },
  { label: 'Fleet', href: '/game/fleet', icon: Rocket },
  { label: 'Galaxy', href: '/game/galaxy', icon: Globe },
  { label: 'Research', href: '/game/research', icon: FlaskConical },
  { label: 'Reports', href: '/game/reports', icon: FileText },
];
```

## Hooks Reference

### Read Hooks

```typescript
// Check if player has a planet
const { hasPlanet, isLoading, isError } = useHasPlanet();

// Get player's planet ID
const { data: planetId } = usePlayerPlanetId();

// Get full planet data (buildings, resources, queue)
const { data: planetData, isLoading } = usePlanetData(planetId);
// planetData = [planet, buildings, resources, queue]

// Get current resources (calculated, not stored)
const { data: resources } = useCurrentResources(planetId);
// resources = [titanium, helium3, darkMatter]

// Get production rates per hour
const { data: production } = useProductionRates(planetId);
// production = [titaniumPerHour, helium3PerHour, darkMatterPerHour, energy]

// Get upgrade cost for building
const { data: cost } = useUpgradeCost(buildingType, currentLevel);
// cost = { titanium, helium3, darkMatter }

// Get build time for upgrade
const { data: buildTime } = useBuildTime(buildingType, currentLevel);
```

### Write Hooks

```typescript
// Claim starter planet
const { claimPlanet, isPending, isConfirming, isSuccess, error, reset } = useClaimStarterPlanet();
claimPlanet('My Planet Name');

// Upgrade a building
const { upgradeBuilding, isPending, isConfirming, isSuccess, error, reset } = useUpgradeBuilding();
upgradeBuilding(BUILDING_TYPE_MAP.titaniumExtractor); // Pass number

// Complete upgrade
const { completeUpgrade, isPending, isConfirming, isSuccess } = useCompleteUpgrade();
completeUpgrade(planetId);

// Cancel upgrade
const { cancelUpgrade, isPending, isConfirming } = useCancelUpgrade();
cancelUpgrade();
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

### Timer/Progress Updates

```tsx
const [progress, setProgress] = useState(0);
const [timeRemaining, setTimeRemaining] = useState(0);

useEffect(() => {
  if (!completionTime || completionTime === 0) return;
  
  const interval = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = completionTime - now;
    
    if (remaining <= 0) {
      setProgress(100);
      setTimeRemaining(0);
      clearInterval(interval);
    } else {
      const totalTime = completionTime - startTime;
      const elapsed = now - startTime;
      setProgress(Math.min(100, (elapsed / totalTime) * 100));
      setTimeRemaining(remaining);
    }
  }, 1000);
  
  return () => clearInterval(interval);
}, [completionTime, startTime]);
```

### Query Invalidation After Mutations

```tsx
const queryClient = useQueryClient();

useEffect(() => {
  if (isSuccess) {
    // Invalidate all contract reads to refetch fresh data
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

## Type Definitions

```typescript
// src/types/game.ts

interface Planet {
  id: string;
  owner: string;
  name: string;
  coordinates: [number, number, number];
  buildings: Buildings;
  resources: Resources;
  production: ResourceProduction;
  lastUpdated: number;
}

interface Buildings {
  titaniumExtractor: number;
  helium3Harvester: number;
  darkMatterCollector: number;
  fusionReactor: number;
  titaniumVault: number;
  helium3Tank: number;
  darkMatterContainment: number;
  assemblyBay: number;
  researchNode: number;
}

interface Resources {
  titanium: number;
  helium3: number;
  darkMatter: number;
  energy: number;
}

interface BuildQueue {
  buildingType: keyof Buildings;
  targetLevel: number;
  startTime: number;
  endTime: number;
}

type FleetMission = 'assault' | 'transfer' | 'station' | 'recon';

interface Fleet {
  id: string;
  owner: string;
  ships: ShipComposition;
  origin: [number, number, number];
  destination: [number, number, number];
  mission: FleetMission;
  departureTime: number;
  arrivalTime: number;
  cargo?: Resources;
}
```

## Adding a New Feature (Checklist)

1. [ ] Define types in `src/types/game.ts`
2. [ ] Add constants to `src/constants/gameConfig.ts`
3. [ ] Update ABI in `src/lib/contracts.ts`
4. [ ] Create hooks in `src/hooks/useNexusGame.ts`
5. [ ] Export hooks from `src/hooks/index.ts`
6. [ ] Create page at `src/app/game/[feature]/page.tsx`
7. [ ] Create components in `src/components/game/`
8. [ ] Update navigation in `src/components/layout/Navigation.tsx`
