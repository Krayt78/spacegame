'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import { FlaskConical, Loader2, XCircle, Clock, Wrench, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { GameLayout } from '@/components/layout';
import { Card, CardHeader, CardContent, Button, ProgressBar } from '@/components/ui';
import {
  useActivePlanetId,
  usePlanetData,
  useCurrentResources,
  useBlockTimestamp,
  usePlayerResearch,
  useResearchQueue,
  useResearchCost,
  useResearchTime,
  useStartResearch,
  useCompleteResearch,
  useCancelResearch,
  RESEARCH_TYPE_MAP,
  RESEARCH_TYPE_REVERSE_MAP,
  type ResearchLevels,
  type ResearchQueueResult,
} from '@/hooks';
import type { Research } from '@/types/game';
import { RESEARCH_NAMES, RESEARCH_CONFIG } from '@/constants/gameConfig';
import { formatTime } from '@/lib/utils';

// Research categories for display grouping
const RESEARCH_CATEGORIES: { title: string; keys: (keyof Research)[] }[] = [
  {
    title: 'Drives & Movement',
    keys: ['combustionDrive', 'impulseDrive', 'hyperspaceDrive'],
  },
  {
    title: 'Combat',
    keys: ['weaponTech', 'shieldingTech', 'armourTech'],
  },
  {
    title: 'Technology',
    keys: ['computerTech', 'stealthSystems'],
  },
  {
    title: 'Advanced',
    keys: ['ionTech', 'hyperspaceTech', 'laserTech', 'plasmaTech'],
  },
  {
    title: 'Colonization',
    keys: ['astrophysics'],
  },
];

// Research Queue component (mirrors BuildQueue)
function ResearchQueueDisplay({
  planetId,
  queue,
  initialTimeRemaining,
  totalDuration,
}: {
  planetId: bigint;
  queue: { researchType: number; targetLevel: number; completionTime: number };
  initialTimeRemaining: number;
  totalDuration: number;
}) {
  const [timeRemaining, setTimeRemaining] = useState(initialTimeRemaining);

  const {
    completeResearch,
    isPending: isCompletePending,
    isConfirming: isCompleteConfirming,
    isSuccess: isCompleteSuccess,
    reset: resetComplete,
  } = useCompleteResearch();

  const {
    cancelResearch,
    isPending: isCancelPending,
    isConfirming: isCancelConfirming,
  } = useCancelResearch();

  useEffect(() => {
    setTimeRemaining(initialTimeRemaining);
  }, [initialTimeRemaining]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = totalDuration > 0
    ? Math.max(0, Math.min(100, ((totalDuration - timeRemaining) / totalDuration) * 100))
    : 0;

  useEffect(() => {
    if (!isCompleteSuccess) return;
    const timer = setTimeout(() => resetComplete(), 2000);
    return () => clearTimeout(timer);
  }, [isCompleteSuccess, resetComplete]);

  const canComplete = timeRemaining === 0;
  const researchKey = RESEARCH_TYPE_REVERSE_MAP[queue.researchType];
  const researchName = researchKey ? RESEARCH_NAMES[researchKey as keyof Research] : 'Research';

  return (
    <Card className="border-[var(--accent-warn)]/30">
      <CardHeader title="Research Queue" subtitle="1 research in progress" />
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 p-3 bg-[var(--bg-tertiary)] rounded-sm">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-[var(--text-primary)]">
                {researchName}
              </span>
              <span className="text-sm text-[var(--accent-warn)]">
                Level {queue.targetLevel}
              </span>
            </div>
            <ProgressBar progress={progress} variant="warning" size="sm" animated />
          </div>
          <div className="flex items-center gap-1 text-sm text-[var(--text-muted)] min-w-[80px]">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{formatTime(timeRemaining)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {canComplete && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => completeResearch()}
              disabled={isCompletePending || isCompleteConfirming}
              isLoading={isCompletePending || isCompleteConfirming}
            >
              Complete Research
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancelResearch(planetId)}
            disabled={isCancelPending || isCancelConfirming}
            isLoading={isCancelPending || isCancelConfirming}
          >
            Cancel (50% refund)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Research item component that fetches its own cost
function ResearchItem({
  researchKey,
  currentLevel,
  researchNodeLevel,
  currentResources,
  hasActiveQueue,
  isResearching,
  onResearch,
}: {
  researchKey: keyof Research;
  currentLevel: number;
  researchNodeLevel: number;
  currentResources: { titanium: number; helium3: number; darkMatter: number };
  hasActiveQueue: boolean;
  isResearching: boolean;
  onResearch: () => void;
}) {
  const researchType = RESEARCH_TYPE_MAP[researchKey] ?? 0;
  const { data: researchCost, isLoading: isLoadingCost } = useResearchCost(researchType, currentLevel);
  const { data: researchTime } = useResearchTime(researchType, currentLevel, researchNodeLevel);

  const canAfford = useMemo(() => {
    if (!researchCost) return false;
    return (
      currentResources.titanium >= Number(researchCost.titanium) &&
      currentResources.helium3 >= Number(researchCost.helium3) &&
      currentResources.darkMatter >= Number(researchCost.darkMatter)
    );
  }, [researchCost, currentResources]);

  const canResearch = canAfford && !hasActiveQueue && !isResearching && researchNodeLevel >= 1;

  const researchConfig = RESEARCH_CONFIG[researchKey as keyof typeof RESEARCH_CONFIG];
  const description = researchConfig?.description;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-[var(--text-primary)]">
            {RESEARCH_NAMES[researchKey]}
          </h3>
          <span className="text-sm text-[var(--accent-primary)]">
            Level {currentLevel}
          </span>
        </div>

        {description && (
          <p className="text-xs text-[var(--text-muted)] italic">{description}</p>
        )}

        <div className="space-y-1">
          <p className="text-xs text-[var(--text-muted)]">Research Cost:</p>
          {isLoadingCost ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : researchCost ? (
            <div className="flex flex-wrap gap-3 text-sm">
              {Number(researchCost.titanium) > 0 && (
                <span className={currentResources.titanium >= Number(researchCost.titanium) ? 'text-[var(--resource-titanium)]' : 'text-[var(--accent-danger)]'}>
                  {Number(researchCost.titanium).toLocaleString()} Ti
                </span>
              )}
              {Number(researchCost.helium3) > 0 && (
                <span className={currentResources.helium3 >= Number(researchCost.helium3) ? 'text-[var(--resource-helium)]' : 'text-[var(--accent-danger)]'}>
                  {Number(researchCost.helium3).toLocaleString()} He3
                </span>
              )}
              {Number(researchCost.darkMatter) > 0 && (
                <span className={currentResources.darkMatter >= Number(researchCost.darkMatter) ? 'text-[var(--resource-dark-matter)]' : 'text-[var(--accent-danger)]'}>
                  {Number(researchCost.darkMatter).toLocaleString()} DM
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">-</p>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs text-[var(--text-muted)]">Research Time:</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {researchTime ? formatTime(Number(researchTime)) : '-'}
          </p>
        </div>

        <Button
          variant={canResearch ? 'primary' : 'secondary'}
          size="sm"
          className="w-full"
          disabled={!canResearch}
          isLoading={isResearching}
          onClick={onResearch}
        >
          {researchNodeLevel < 1
            ? 'Research Node Required'
            : `Research Level ${currentLevel + 1}`}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ResearchPage() {
  const { planetId, isLoading: isLoadingPlanetId } = useActivePlanetId();
  const { data: planetData, isLoading: isLoadingPlanet } = usePlanetData(planetId);
  const { data: currentResourcesData } = useCurrentResources(planetId);
  const { data: researchData } = usePlayerResearch();
  const { data: researchQueueData } = useResearchQueue();
  const { timestamp: blockTimestamp } = useBlockTimestamp();

  const { startResearch, isPending, isConfirming } = useStartResearch();
  const isResearching = isPending || isConfirming;

  // Get Research Node level from buildings
  const researchNodeLevel = useMemo(() => {
    if (!planetData) return 0;
    const [, buildingsData] = planetData;
    return Number(buildingsData.researchNode);
  }, [planetData]);

  // Parse research levels
  const researchLevels = useMemo((): Record<keyof Research, number> | null => {
    if (!researchData) return null;
    const data = researchData as ResearchLevels;
    return {
      combustionDrive: Number(data.combustionDrive),
      impulseDrive: Number(data.impulseDrive),
      hyperspaceDrive: Number(data.hyperspaceDrive),
      weaponTech: Number(data.weaponTech),
      shieldingTech: Number(data.shieldingTech),
      armourTech: Number(data.armourTech),
      computerTech: Number(data.computerTech),
      stealthSystems: Number(data.stealthSystems),
      ionTech: Number(data.ionTech),
      hyperspaceTech: Number(data.hyperspaceTech),
      laserTech: Number(data.laserTech),
      plasmaTech: Number(data.plasmaTech),
      astrophysics: Number(data.astrophysics),
    };
  }, [researchData]);

  // Parse research queue
  const queue = useMemo(() => {
    if (!researchQueueData) return null;
    const [researchType, targetLevel, completionTime] = researchQueueData as ResearchQueueResult;
    return { researchType: Number(researchType), targetLevel: Number(targetLevel), completionTime: Number(completionTime) };
  }, [researchQueueData]);

  const hasActiveQueue = useMemo(() => {
    if (!queue) return false;
    return queue.researchType > 0 && queue.completionTime > 0;
  }, [queue]);

  // Fetch research time from contract for the queued research (for progress bar total duration)
  const queueResearchType = queue ? queue.researchType : 0;
  const queueCurrentLevel = queue ? Math.max(0, queue.targetLevel - 1) : 0;
  const { data: queueResearchTime } = useResearchTime(
    hasActiveQueue ? queueResearchType : 0,
    queueCurrentLevel,
    researchNodeLevel
  );

  const queueTimeInfo = useMemo(() => {
    if (!queue || !hasActiveQueue) return { timeRemaining: 0, totalDuration: 0 };
    const timeRemaining = Math.max(0, queue.completionTime - blockTimestamp);
    const totalDuration = queueResearchTime ? Number(queueResearchTime) : timeRemaining;
    return { timeRemaining, totalDuration };
  }, [queue, hasActiveQueue, blockTimestamp, queueResearchTime]);

  const currentResources = useMemo(() => {
    if (!currentResourcesData) return { titanium: 0, helium3: 0, darkMatter: 0 };
    return {
      titanium: Number(currentResourcesData[0]),
      helium3: Number(currentResourcesData[1]),
      darkMatter: Number(currentResourcesData[2]),
    };
  }, [currentResourcesData]);

  const handleResearch = useCallback(
    (researchKey: keyof Research) => {
      if (!planetId) return;
      const researchType = RESEARCH_TYPE_MAP[researchKey];
      if (researchType) {
        startResearch(planetId, researchType);
      }
    },
    [planetId, startResearch]
  );

  if (isLoadingPlanetId || isLoadingPlanet) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">Loading research data...</p>
          </div>
        </div>
      </GameLayout>
    );
  }

  if (!researchLevels) {
    return (
      <GameLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <XCircle className="w-8 h-8 text-[var(--accent-danger)] mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">Failed to load research data</p>
          </div>
        </div>
      </GameLayout>
    );
  }

  return (
    <GameLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[var(--resource-darkMatter)]/10 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-[var(--resource-darkMatter)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Research Lab
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Unlock advanced technologies
              {researchNodeLevel > 0 && (
                <span className="ml-2 text-[var(--accent-primary)]">
                  (Research Node Level {researchNodeLevel})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Onboarding hint */}
        <div className="p-3 bg-accent-secondary/5 border border-accent-secondary/20 rounded-sm mb-6">
          <p className="text-sm text-text-secondary">
            <span className="text-accent-secondary font-semibold">TIP:</span>{' '}
            Research applies to all your planets. A higher Research Node level reduces research time. Each technology provides unique bonuses.
          </p>
        </div>

        {/* Research Queue */}
        {hasActiveQueue && queue && planetId && (
          <ResearchQueueDisplay
            planetId={planetId}
            queue={queue}
            initialTimeRemaining={queueTimeInfo.timeRemaining}
            totalDuration={queueTimeInfo.totalDuration}
          />
        )}

        {/* Research Node Requirement Check */}
        {researchNodeLevel < 1 && (
          <Card className="border-[var(--accent-warn)]/30">
            <CardContent className="py-6">
              <div className="text-center">
                <Wrench className="w-12 h-12 text-[var(--accent-warn)] mx-auto mb-3" />
                <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-2">
                  Research Node Required
                </h3>
                <p className="text-[var(--text-muted)] mb-4">
                  You need to build a Research Node before you can conduct research.
                </p>
                <Link href="/game/buildings">
                  <Button variant="primary" size="md" leftIcon={<ArrowRight className="w-4 h-4" />}>
                    Go to Buildings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Research cards grouped by category */}
        {researchNodeLevel >= 1 && RESEARCH_CATEGORIES.map((category) => (
          <div key={category.title} className="space-y-3">
            <h2 className="text-lg font-display font-semibold text-[var(--text-secondary)]">
              {category.title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {category.keys.map((researchKey) => (
                <ResearchItem
                  key={researchKey}
                  researchKey={researchKey}
                  currentLevel={researchLevels[researchKey]}
                  researchNodeLevel={researchNodeLevel}
                  currentResources={currentResources}
                  hasActiveQueue={hasActiveQueue}
                  isResearching={isResearching}
                  onResearch={() => handleResearch(researchKey)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </GameLayout>
  );
}
