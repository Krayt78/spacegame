'use client';

import { useState, useMemo } from 'react';
import { useAccount } from 'wagmi';
import {
  Swords,
  Flag,
  Package,
  Rocket,
  Gem,
  Sparkles,
  CircleDot,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  useBattleReport,
  FLEET_MISSION,
  SHIP_TYPE_INDEX,
} from '@/hooks/useNexusGame';
import { formatNumber, formatCoordinates, cn } from '@/lib/utils';

interface BattleReportCardProps {
  reportId: bigint;
}

// Mission icon and color config (same pattern as FleetCard)
const MISSION_CONFIG: Record<number, { icon: typeof Swords; color: string; label: string }> = {
  [FLEET_MISSION.RAID]: { icon: Swords, color: 'var(--accent-danger)', label: 'Raid' },
  [FLEET_MISSION.CAPTURE]: { icon: Flag, color: 'var(--accent-warn)', label: 'Capture' },
  [FLEET_MISSION.MOVE]: { icon: Package, color: 'var(--accent-secondary)', label: 'Move' },
};

const DEFAULT_MISSION_CONFIG = { icon: Rocket, color: 'var(--text-muted)', label: 'Unknown' };

// Ship names mapping (same as FleetCard)
const SHIP_NAMES: Record<number, string> = {
  [SHIP_TYPE_INDEX.SMALL_CARGO]: 'Small Cargo',
  [SHIP_TYPE_INDEX.LIGHT_FIGHTER]: 'Light Fighter',
};

// Report data type from contract
interface BattleReportData {
  reportId: bigint;
  timestamp: number;
  attacker: string;
  defender: string;
  location: readonly [bigint, bigint, bigint];
  mission: number;
  attackerWon: boolean;
  attackerInitial: readonly bigint[];
  attackerLosses: readonly bigint[];
  defenderInitial: readonly bigint[];
  defenderLosses: readonly bigint[];
  lootTitanium: bigint;
  lootHelium3: bigint;
  lootDarkMatter: bigint;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface ShipRow {
  name: string;
  initial: number;
  lost: number;
  surviving: number;
}

function FleetBreakdown({ label, address, isPlayer, ships }: {
  label: string;
  address: string;
  isPlayer: boolean;
  ships: ShipRow[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-display font-semibold text-[var(--text-secondary)]">
          {label}
        </span>
        <span className={cn(
          'text-xs font-mono',
          isPlayer ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
        )}>
          {truncateAddress(address)} {isPlayer && '(You)'}
        </span>
      </div>
      {ships.length > 0 ? (
        <div className="grid grid-cols-4 gap-1 text-xs">
          <span className="text-[var(--text-muted)]">Ship</span>
          <span className="text-[var(--text-muted)] text-right">Initial</span>
          <span className="text-[var(--text-muted)] text-right">Lost</span>
          <span className="text-[var(--text-muted)] text-right">Survived</span>
          {ships.map((ship) => (
            <div key={ship.name} className="contents">
              <span className="text-[var(--text-secondary)]">{ship.name}</span>
              <span className="font-mono text-[var(--text-secondary)] text-right">{formatNumber(ship.initial)}</span>
              <span className={cn(
                'font-mono text-right',
                ship.lost > 0 ? 'text-[var(--accent-danger)]' : 'text-[var(--text-muted)]'
              )}>
                {ship.lost > 0 ? `-${formatNumber(ship.lost)}` : '0'}
              </span>
              <span className={cn(
                'font-mono text-right',
                ship.surviving > 0 ? 'text-[var(--accent-primary)]' : 'text-[var(--accent-danger)]'
              )}>
                {formatNumber(ship.surviving)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <span className="text-xs text-[var(--text-muted)]">No ships</span>
      )}
    </div>
  );
}

export function BattleReportCard({ reportId }: BattleReportCardProps) {
  const { data: rawReportData, isLoading } = useBattleReport(reportId);
  const { address } = useAccount();
  const [expanded, setExpanded] = useState(false);

  // Parse report data
  const report = useMemo(() => {
    if (!rawReportData) return null;
    const data = rawReportData as BattleReportData;
    return {
      reportId: Number(data.reportId),
      timestamp: Number(data.timestamp),
      attacker: data.attacker,
      defender: data.defender,
      location: [Number(data.location[0]), Number(data.location[1]), Number(data.location[2])] as [number, number, number],
      mission: Number(data.mission),
      attackerWon: data.attackerWon,
      attackerInitial: data.attackerInitial,
      attackerLosses: data.attackerLosses,
      defenderInitial: data.defenderInitial,
      defenderLosses: data.defenderLosses,
      lootTitanium: Number(data.lootTitanium),
      lootHelium3: Number(data.lootHelium3),
      lootDarkMatter: Number(data.lootDarkMatter),
    };
  }, [rawReportData]);

  // Determine win/loss from connected player's perspective
  const isPlayerAttacker = address?.toLowerCase() === report?.attacker?.toLowerCase();
  const playerWon = report ? (isPlayerAttacker ? report.attackerWon : !report.attackerWon) : false;

  // Detect if combat actually occurred (defender had a garrison)
  const combatOccurred = useMemo(() => {
    if (!report) return false;
    return report.defenderInitial.some((v) => v > BigInt(0));
  }, [report]);

  // Parse ship arrays into display rows
  const attackerShips = useMemo((): ShipRow[] => {
    if (!report) return [];
    const rows: ShipRow[] = [];
    for (let i = 1; i < 18; i++) {
      const initial = Number(report.attackerInitial[i] || BigInt(0));
      if (initial > 0) {
        const lost = Number(report.attackerLosses[i] || BigInt(0));
        rows.push({
          name: SHIP_NAMES[i] || `Type ${i}`,
          initial,
          lost,
          surviving: initial - lost,
        });
      }
    }
    return rows;
  }, [report]);

  const defenderShips = useMemo((): ShipRow[] => {
    if (!report) return [];
    const rows: ShipRow[] = [];
    for (let i = 1; i < 18; i++) {
      const initial = Number(report.defenderInitial[i] || BigInt(0));
      if (initial > 0) {
        const lost = Number(report.defenderLosses[i] || BigInt(0));
        rows.push({
          name: SHIP_NAMES[i] || `Type ${i}`,
          initial,
          lost,
          surviving: initial - lost,
        });
      }
    }
    return rows;
  }, [report]);

  // Loot check
  const hasLoot = report && (report.lootTitanium > 0 || report.lootHelium3 > 0 || report.lootDarkMatter > 0);

  // Opponent address
  const opponent = report ? (isPlayerAttacker ? report.defender : report.attacker) : '';

  if (isLoading || !report) {
    return (
      <div className="p-4 bg-[var(--bg-tertiary)] rounded-sm animate-pulse">
        <div className="h-4 bg-[var(--bg-secondary)] rounded w-1/3 mb-2"></div>
        <div className="h-3 bg-[var(--bg-secondary)] rounded w-1/2"></div>
      </div>
    );
  }

  const missionConfig = MISSION_CONFIG[report.mission] || DEFAULT_MISSION_CONFIG;
  const MissionIcon = missionConfig.icon;

  return (
    <div
      className={cn(
        'bg-[var(--bg-tertiary)] rounded-sm border-l-2 transition-colors',
        !combatOccurred
          ? 'border-l-[var(--accent-secondary)]'
          : playerWon
            ? 'border-l-[var(--accent-primary)]'
            : 'border-l-[var(--accent-danger)]'
      )}
    >
      {/* Collapsed header — always visible */}
      <div
        className="p-4 flex items-center gap-3 cursor-pointer select-none"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {/* Mission icon */}
        <div
          className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${missionConfig.color}15` }}
        >
          <MissionIcon className="w-4 h-4" style={{ color: missionConfig.color }} />
        </div>

        {/* Summary info */}
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {/* Win/Loss/Raid badge */}
          <span
            className="text-xs px-2 py-0.5 rounded-sm font-semibold shrink-0"
            style={{
              backgroundColor: !combatOccurred
                ? 'var(--accent-secondary)15'
                : playerWon
                  ? 'var(--accent-primary)15'
                  : 'var(--accent-danger)15',
              color: !combatOccurred
                ? 'var(--accent-secondary)'
                : playerWon
                  ? 'var(--accent-primary)'
                  : 'var(--accent-danger)',
            }}
          >
            {!combatOccurred ? 'RAID' : playerWon ? 'WIN' : 'LOSS'}
          </span>

          {/* Mission label */}
          <span className="font-display text-[var(--text-secondary)] shrink-0" style={{ color: missionConfig.color }}>
            {missionConfig.label}
          </span>
          {!combatOccurred && (
            <span className="text-xs text-[var(--text-muted)] italic shrink-0">
              No resistance
            </span>
          )}

          {/* Location */}
          <span className="font-mono text-[var(--text-muted)] shrink-0">
            {formatCoordinates(report.location)}
          </span>

          {/* Opponent */}
          <span className="text-[var(--text-muted)] shrink-0">
            vs {truncateAddress(opponent)}
          </span>

          {/* Loot summary (inline, collapsed only) */}
          {hasLoot && !expanded && (
            <div className="flex gap-2 shrink-0">
              {report.lootTitanium > 0 && (
                <span className="flex items-center gap-1">
                  <Gem className="w-3 h-3" style={{ color: 'var(--resource-titanium)' }} />
                  <span className="font-mono text-xs text-[var(--text-muted)]">{formatNumber(report.lootTitanium)}</span>
                </span>
              )}
              {report.lootHelium3 > 0 && (
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" style={{ color: 'var(--resource-helium3)' }} />
                  <span className="font-mono text-xs text-[var(--text-muted)]">{formatNumber(report.lootHelium3)}</span>
                </span>
              )}
              {report.lootDarkMatter > 0 && (
                <span className="flex items-center gap-1">
                  <CircleDot className="w-3 h-3" style={{ color: 'var(--resource-darkMatter)' }} />
                  <span className="font-mono text-xs text-[var(--text-muted)]">{formatNumber(report.lootDarkMatter)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Timestamp + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-[var(--text-muted)]">
            {formatTimestamp(report.timestamp)}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--bg-secondary)]">
          <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Attacker fleet */}
            <FleetBreakdown
              label="Attacker"
              address={report.attacker}
              isPlayer={isPlayerAttacker}
              ships={attackerShips}
            />

            {/* Defender fleet — show placeholder when no garrison */}
            {combatOccurred ? (
              <FleetBreakdown
                label="Defender"
                address={report.defender}
                isPlayer={!isPlayerAttacker}
                ships={defenderShips}
              />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-display font-semibold text-[var(--text-secondary)]">
                    Defender
                  </span>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {truncateAddress(report.defender)}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-muted)] italic">No garrison — planet was undefended</span>
              </div>
            )}
          </div>

          {/* Loot section */}
          {hasLoot && (
            <div className="space-y-2">
              <span className="text-xs font-display font-semibold text-[var(--text-secondary)]">
                Loot {report.attackerWon ? '(captured by attacker)' : ''}
              </span>
              <div className="flex gap-4 text-sm">
                {report.lootTitanium > 0 && (
                  <div className="flex items-center gap-1">
                    <Gem className="w-3.5 h-3.5" style={{ color: 'var(--resource-titanium)' }} />
                    <span className="font-mono text-[var(--text-secondary)]">{formatNumber(report.lootTitanium)}</span>
                  </div>
                )}
                {report.lootHelium3 > 0 && (
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--resource-helium3)' }} />
                    <span className="font-mono text-[var(--text-secondary)]">{formatNumber(report.lootHelium3)}</span>
                  </div>
                )}
                {report.lootDarkMatter > 0 && (
                  <div className="flex items-center gap-1">
                    <CircleDot className="w-3.5 h-3.5" style={{ color: 'var(--resource-darkMatter)' }} />
                    <span className="font-mono text-[var(--text-secondary)]">{formatNumber(report.lootDarkMatter)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BattleReportCard;
