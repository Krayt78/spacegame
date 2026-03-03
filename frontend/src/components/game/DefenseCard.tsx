'use client';

import { useMemo, useState } from 'react';
import {
  Gem,
  Sparkles,
  CircleDot,
  Clock,
  Swords,
  Shield,
  Heart,
  Plus,
  Minus,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { Button } from '@/components/ui';
import type { Resources, Defense, Research } from '@/types/game';
import { DEFENSE_CONFIG, DEFENSE_ICON_MAP, DEFENSE_NAMES, DEFENSE_REQUIREMENTS, RESEARCH_NAMES } from '@/constants/gameConfig';
import { cn, formatNumber, formatTime } from '@/lib/utils';

interface DefenseCardProps {
  defenseKey: keyof Defense;
  currentCount: number;
  shipyardLevel: number;
  currentResources: Resources;
  onBuild: (quantity: number) => void;
  isBuilding: boolean;
  isQueueBlocked?: boolean;
  researchLevels?: Record<keyof Research, number> | null;
}

interface ResourceCostProps {
  type: 'titanium' | 'helium3' | 'darkMatter';
  cost: number;
  available: number;
}

function ResourceCost({ type, cost, available }: ResourceCostProps) {
  if (cost === 0) return null;

  const canAfford = available >= cost;
  const icons = {
    titanium: Gem,
    helium3: Sparkles,
    darkMatter: CircleDot,
  };
  const colors = {
    titanium: 'var(--resource-titanium)',
    helium3: 'var(--resource-helium3)',
    darkMatter: 'var(--resource-darkMatter)',
  };

  const Icon = icons[type];

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-sm',
        canAfford ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--accent-danger)]/10'
      )}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: colors[type] }} />
      <span
        className={cn(
          'font-mono text-xs',
          canAfford ? 'text-[var(--text-secondary)]' : 'text-[var(--accent-danger)]'
        )}
      >
        {formatNumber(cost)}
      </span>
    </div>
  );
}

export function DefenseCard({
  defenseKey,
  currentCount,
  shipyardLevel,
  currentResources,
  onBuild,
  isBuilding,
  isQueueBlocked = false,
  researchLevels,
}: DefenseCardProps) {
  const [quantity, setQuantity] = useState(1);
  const { icon: DefenseIcon, color: iconColor } = DEFENSE_ICON_MAP[defenseKey];
  const defenseName = DEFENSE_NAMES[defenseKey];
  const config = DEFENSE_CONFIG[defenseKey];
  const requirements = DEFENSE_REQUIREMENTS[defenseKey];

  // Check requirements
  const meetsShipyardReq = shipyardLevel >= requirements.shipyardLevel;
  const researchMet = requirements.research.every(
    (req) => (researchLevels?.[req.key] ?? 0) >= req.level
  );
  const isUnlocked = meetsShipyardReq && researchMet;

  // Shield dome limit check
  const isAtLimit = config.limit > 0 && currentCount >= config.limit;
  const maxQuantity = config.limit > 0 ? Math.max(1, config.limit - currentCount) : 999;

  // Calculate total cost based on quantity
  const totalCost = useMemo(
    () => ({
      titanium: config.cost.titanium * quantity,
      helium3: config.cost.helium3 * quantity,
      darkMatter: config.cost.darkMatter * quantity,
    }),
    [config.cost, quantity]
  );

  const canAfford = useMemo(
    () =>
      currentResources.titanium >= totalCost.titanium &&
      currentResources.helium3 >= totalCost.helium3 &&
      currentResources.darkMatter >= totalCost.darkMatter,
    [currentResources, totalCost]
  );

  // Estimate build time
  const buildTime = useMemo(() => {
    const defenseCost = config.cost.titanium + config.cost.helium3 + config.cost.darkMatter;
    return quantity * (defenseCost / (25 * (1 + shipyardLevel)));
  }, [quantity, shipyardLevel, config.cost]);

  const handleIncrement = () => {
    setQuantity((prev) => Math.min(prev + 1, maxQuantity));
  };

  const handleDecrement = () => {
    setQuantity((prev) => Math.max(prev - 1, 1));
  };

  const handleBuild = () => {
    onBuild(quantity);
  };

  const isQuantityDisabled = !isUnlocked || isBuilding || isQueueBlocked || isAtLimit || shipyardLevel < 1;
  const isDisabled = isQuantityDisabled || !canAfford;

  return (
    <Card
      glow={isUnlocked && canAfford && !isDisabled}
      className={cn(
        'relative overflow-hidden transition-all duration-300',
        isBuilding && 'ring-1 ring-[var(--accent-warn)]/50',
        !isUnlocked && 'opacity-70'
      )}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Left: Icon and Count */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-14 h-14 rounded-sm flex items-center justify-center"
              style={{ backgroundColor: `${iconColor}15` }}
            >
              {isUnlocked ? (
                <DefenseIcon className="w-7 h-7" style={{ color: iconColor }} />
              ) : (
                <Lock className="w-7 h-7 text-[var(--text-muted)]" />
              )}
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">Built</p>
              <p
                className="font-display text-2xl font-bold"
                style={{ color: currentCount > 0 ? iconColor : 'var(--text-muted)' }}
              >
                {currentCount}
              </p>
            </div>
          </div>

          {/* Right: Info */}
          <div className="flex-1 min-w-0">
            {/* Name and Description */}
            <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-0.5">
              {defenseName}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">{config.description}</p>

            {/* Stats Grid - 3 stats for defenses */}
            <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="text-[var(--text-muted)]">Weapon:</span>
                <span className="font-mono text-[var(--text-secondary)]">{formatNumber(config.weaponPower)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="text-[var(--text-muted)]">Shield:</span>
                <span className="font-mono text-[var(--text-secondary)]">{formatNumber(config.shieldPower)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="text-[var(--text-muted)]">Hull:</span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {formatNumber(config.structuralIntegrity)}
                </span>
              </div>
            </div>

            {/* Limit Warning */}
            {isAtLimit && (
              <div className="mb-3 p-2 bg-[var(--accent-warn)]/10 rounded-sm border border-[var(--accent-warn)]/20 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--accent-warn)]" />
                <span className="text-xs text-[var(--accent-warn)]">Max {config.limit} per planet</span>
              </div>
            )}

            {/* Requirements (shown when locked) */}
            {!isUnlocked && (
              <div className="mb-3 p-2 bg-[var(--accent-danger)]/5 rounded-sm border border-[var(--accent-danger)]/20">
                <p className="text-xs font-semibold text-[var(--accent-danger)] mb-1">Requirements:</p>
                <p className={cn(
                  'text-xs',
                  meetsShipyardReq ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                )}>
                  {meetsShipyardReq ? '\u2713' : '\u2717'} Shipyard Level {requirements.shipyardLevel}
                  {!meetsShipyardReq && ` (current: ${shipyardLevel})`}
                </p>
                {requirements.research.map((req) => {
                  const currentLvl = researchLevels?.[req.key] ?? 0;
                  const met = currentLvl >= req.level;
                  return (
                    <p key={req.key} className={cn(
                      'text-xs',
                      met ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                    )}>
                      {met ? '\u2713' : '\u2717'} {RESEARCH_NAMES[req.key]} Lv.{req.level}
                      {!met && ` (current: ${currentLvl})`}
                    </p>
                  );
                })}
              </div>
            )}

            {/* Quantity Selector (only when unlocked and not at limit) */}
            {isUnlocked && !isAtLimit && (
              <div className="mb-3">
                <p className="text-xs text-[var(--text-muted)] mb-1.5">Quantity to build:</p>
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDecrement}
                    disabled={quantity <= 1 || isQuantityDisabled}
                    className="w-8 h-8 p-0"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <input
                    type="number"
                    min="1"
                    max={maxQuantity}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(maxQuantity, parseInt(e.target.value) || 1)))}
                    disabled={isQuantityDisabled}
                    className="w-16 h-8 text-center bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded text-[var(--text-primary)] font-mono text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleIncrement}
                    disabled={quantity >= maxQuantity || isQuantityDisabled}
                    className="w-8 h-8 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Total Cost */}
                <p className="text-xs text-[var(--text-muted)] mb-1.5">
                  Total cost ({quantity} defense{quantity > 1 ? 's' : ''}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <ResourceCost
                    type="titanium"
                    cost={totalCost.titanium}
                    available={currentResources.titanium}
                  />
                  <ResourceCost
                    type="helium3"
                    cost={totalCost.helium3}
                    available={currentResources.helium3}
                  />
                  <ResourceCost
                    type="darkMatter"
                    cost={totalCost.darkMatter}
                    available={currentResources.darkMatter}
                  />
                </div>
              </div>
            )}

            {/* Build Time and Build Button */}
            <div className="flex items-center justify-between">
              {isUnlocked && !isAtLimit && (
                <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTime(buildTime)}</span>
                </div>
              )}

              <Button
                variant={isUnlocked && canAfford && !isDisabled ? 'primary' : 'ghost'}
                size="sm"
                onClick={handleBuild}
                disabled={isDisabled}
                isLoading={isBuilding}
                className={!isUnlocked || isAtLimit ? 'ml-auto' : ''}
              >
                {!isUnlocked
                  ? 'Locked'
                  : isAtLimit
                  ? 'Limit Reached'
                  : isBuilding
                  ? 'Building...'
                  : isQueueBlocked
                  ? 'Queue Busy'
                  : `Build ${quantity}`}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DefenseCard;
