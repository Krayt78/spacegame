'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Circle,
  Lock,
  GraduationCap,
  Gem,
  Sparkles,
  CircleDot,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { isUserRejection } from '@/lib/transactionErrors';
import {
  useTutorialStatus,
  useClaimTutorialQuest,
  usePlayerPlanetId,
  useHasPlanet,
} from '@/hooks/useNexusGame';
import { TUTORIAL_QUESTS, type TutorialQuest } from '@/constants/tutorialQuests';

// ============================================================
// Sub-component: floating reward pop-up that fades out
// ============================================================

interface FloatingRewardProps {
  titanium: number;
  helium3: number;
  darkMatter: number;
  onDone: () => void;
}

function FloatingReward({ titanium, helium3, darkMatter, onDone }: FloatingRewardProps) {
  return (
    <motion.div
      className="absolute right-2 top-0 z-20 flex flex-col items-end gap-0.5 pointer-events-none"
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: -32 }}
      exit={{ opacity: 0, y: -48 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      onAnimationComplete={onDone}
    >
      {titanium > 0 && (
        <span className="font-mono text-xs font-bold text-glow-primary" style={{ color: 'var(--resource-titanium)' }}>
          +{titanium} Ti
        </span>
      )}
      {helium3 > 0 && (
        <span className="font-mono text-xs font-bold" style={{ color: 'var(--resource-helium3)' }}>
          +{helium3} He3
        </span>
      )}
      {darkMatter > 0 && (
        <span className="font-mono text-xs font-bold" style={{ color: 'var(--resource-darkMatter)' }}>
          +{darkMatter} DM
        </span>
      )}
    </motion.div>
  );
}

// ============================================================
// Sub-component: single quest row
// ============================================================

interface QuestRowProps {
  quest: TutorialQuest;
  index: number;
  isClaimed: boolean;
  isClaimable: boolean;
  isClaimingThis: boolean;
  isAnyClaimInProgress: boolean;
  showFloating: boolean;
  onClaim: (questId: number) => void;
  onFloatingDone: () => void;
}

function QuestRow({
  quest,
  index,
  isClaimed,
  isClaimable,
  isClaimingThis,
  isAnyClaimInProgress,
  showFloating,
  onClaim,
  onFloatingDone,
}: QuestRowProps) {
  const borderColor = isClaimed
    ? 'border-[var(--bg-tertiary)]'
    : isClaimable
      ? 'border-[var(--accent-primary)]'
      : 'border-[var(--bg-tertiary)]';

  const bgColor = isClaimable
    ? 'bg-[var(--accent-primary)]/5'
    : 'bg-transparent';

  const glowClass = isClaimable ? 'shadow-[0_0_12px_rgba(0,255,136,0.15)]' : '';

  return (
    <motion.div
      layout
      className={cn(
        'relative border-l-2 px-3 py-2.5 rounded-sm transition-all duration-300',
        borderColor,
        bgColor,
        glowClass,
      )}
    >
      {/* Floating reward animation */}
      <AnimatePresence>
        {showFloating && (
          <FloatingReward
            titanium={quest.reward.titanium}
            helium3={quest.reward.helium3}
            darkMatter={quest.reward.darkMatter}
            onDone={onFloatingDone}
          />
        )}
      </AnimatePresence>

      {/* Quest header row */}
      <div className="flex items-start gap-2 mb-1">
        {/* State icon */}
        <div className="flex-shrink-0 mt-0.5">
          {isClaimed ? (
            <CheckCircle2 className="w-4 h-4 text-glow-primary" style={{ color: 'var(--accent-primary)' }} />
          ) : isClaimable ? (
            <Circle className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          ) : (
            <Lock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>

        {/* Quest name */}
        <span
          className={cn(
            'font-display text-sm font-semibold flex-1 leading-tight',
            isClaimed ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
          )}
        >
          {index + 1}. {quest.name}
        </span>

        {/* Claim button */}
        {isClaimable && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onClaim(quest.id)}
            disabled={isAnyClaimInProgress}
            isLoading={isClaimingThis}
            className="flex-shrink-0 text-[10px] px-2 py-0.5"
          >
            CLAIM
          </Button>
        )}
      </div>

      {/* Description */}
      <p
        className={cn(
          'font-mono text-xs leading-snug ml-5',
          isClaimed ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
        )}
      >
        {quest.description}
      </p>

      {/* Reward row */}
      <div className="flex items-center gap-2 ml-5 mt-1.5">
        {quest.reward.titanium > 0 && (
          <div className="flex items-center gap-0.5">
            <Gem className="w-3 h-3" style={{ color: 'var(--resource-titanium)' }} />
            <span
              className={cn('font-mono text-xs', isClaimed ? 'text-[var(--text-muted)]' : '')}
              style={{ color: isClaimed ? undefined : 'var(--resource-titanium)' }}
            >
              {isClaimed ? '+' : ''}{quest.reward.titanium}
            </span>
          </div>
        )}
        {quest.reward.helium3 > 0 && (
          <div className="flex items-center gap-0.5">
            <Sparkles className="w-3 h-3" style={{ color: 'var(--resource-helium3)' }} />
            <span
              className={cn('font-mono text-xs', isClaimed ? 'text-[var(--text-muted)]' : '')}
              style={{ color: isClaimed ? undefined : 'var(--resource-helium3)' }}
            >
              {isClaimed ? '+' : ''}{quest.reward.helium3}
            </span>
          </div>
        )}
        {quest.reward.darkMatter > 0 && (
          <div className="flex items-center gap-0.5">
            <CircleDot className="w-3 h-3" style={{ color: 'var(--resource-darkMatter)' }} />
            <span
              className={cn('font-mono text-xs', isClaimed ? 'text-[var(--text-muted)]' : '')}
              style={{ color: isClaimed ? undefined : 'var(--resource-darkMatter)' }}
            >
              {isClaimed ? '+' : ''}{quest.reward.darkMatter}
            </span>
          </div>
        )}
      </div>

      {/* Tip text — shown for claimable and locked quests */}
      {!isClaimed && quest.tip && (
        <p
          className={cn(
            'font-mono text-[11px] leading-snug ml-5 mt-1.5',
            'text-[var(--text-muted)]'
          )}
        >
          {quest.tip}
        </p>
      )}
    </motion.div>
  );
}

// ============================================================
// Main component
// ============================================================

export function TutorialSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  // Track which quest just succeeded so we can show the floating reward
  const [floatingQuestId, setFloatingQuestId] = useState<number | null>(null);
  // Track the quest being claimed (for the loading spinner)
  const [pendingQuestId, setPendingQuestId] = useState<number | null>(null);
  // Error message to briefly surface
  const [claimError, setClaimError] = useState<string | null>(null);
  // Whether to show the congratulations banner instead of quests
  const [showCongrats, setShowCongrats] = useState(false);
  // Whether the component should stop rendering entirely
  const [hidden, setHidden] = useState(false);

  const { data: hasPlanetData } = useHasPlanet();
  const { data: rawPlanetId } = usePlayerPlanetId();
  const planetId = rawPlanetId as bigint | undefined;

  const {
    data: rawTutorialData,
    isLoading: isTutorialLoading,
  } = useTutorialStatus(planetId);

  // Cast from wagmi's generic unknown to the tuple the contract returns
  type TutorialStatus = readonly [readonly boolean[], readonly boolean[], boolean];
  const tutorialData = rawTutorialData as TutorialStatus | undefined;

  const {
    claimQuest,
    isPending,
    isConfirming,
    isSuccess,
    error: claimHookError,
    reset,
  } = useClaimTutorialQuest();

  // Derived tutorial state
  const claimed: readonly boolean[] = tutorialData ? tutorialData[0] : Array(16).fill(false);
  const claimable: readonly boolean[] = tutorialData ? tutorialData[1] : Array(16).fill(false);
  const allDone: boolean = tutorialData ? tutorialData[2] : false;

  const claimCount = claimed.filter(Boolean).length;

  // ---- isSuccess: trigger floating animation then reset hook state ----
  const prevIsSuccess = useRef(false);
  useEffect(() => {
    if (isSuccess && !prevIsSuccess.current) {
      // pendingQuestId is still set at this point
      setFloatingQuestId(pendingQuestId);
      setPendingQuestId(null);
      // Reset hook after a short delay so UI can reflect confirmed state
      const timer = setTimeout(() => {
        reset();
      }, 800);
      prevIsSuccess.current = isSuccess;
      return () => clearTimeout(timer);
    }
    prevIsSuccess.current = isSuccess;
    return undefined;
  }, [isSuccess, pendingQuestId, reset]);

  // ---- Error handling ----
  useEffect(() => {
    if (!claimHookError) return;
    setPendingQuestId(null);
    if (isUserRejection(claimHookError as Error)) {
      reset();
      return;
    }
    setClaimError(claimHookError.message ?? 'Transaction failed');
    const timer = setTimeout(() => {
      setClaimError(null);
      reset();
    }, 4000);
    return () => clearTimeout(timer);
  }, [claimHookError, reset]);

  // ---- Watch for allDone to show congratulations ----
  const prevAllDone = useRef(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      setShowCongrats(true);
      prevAllDone.current = allDone;
      const timer = setTimeout(() => {
        setHidden(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
    prevAllDone.current = allDone;
    return undefined;
  }, [allDone]);

  // ---- Claim handler ----
  const handleClaim = (questId: number) => {
    if (planetId === undefined || isPending || isConfirming) return;
    setPendingQuestId(questId);
    claimQuest(planetId as bigint, questId);
  };

  const isAnyClaimInProgress = isPending || isConfirming;

  // ---- Visibility guards ----
  if (!hasPlanetData || hidden) return null;
  // Also hide while loading to avoid flash
  if (isTutorialLoading && !tutorialData) return null;
  // Don't render at all once tutorial was already done before we mounted
  if (allDone && !showCongrats) return null;

  return (
    <div className="hidden lg:block flex-shrink-0">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={cn(
          'relative h-full border-l border-[var(--bg-tertiary)] bg-[var(--bg-secondary)] transition-all duration-300 flex flex-col',
          collapsed ? 'w-12' : 'w-96'
        )}
      >
        {/* ---- Collapsed state: just a toggle button ---- */}
        {collapsed && (
          <div className="flex flex-col items-center pt-4 gap-3">
            <button
              onClick={() => setCollapsed(false)}
              className="w-8 h-8 rounded-sm flex items-center justify-center bg-[var(--bg-tertiary)] hover:bg-[var(--accent-primary)]/10 transition-colors"
              title="Open Commander's Academy"
              aria-label="Expand tutorial sidebar"
            >
              <ChevronLeft className="w-4 h-4 text-[var(--accent-primary)]" />
            </button>
            <GraduationCap className="w-5 h-5 text-[var(--accent-primary)] opacity-60" />
          </div>
        )}

        {/* ---- Expanded state ---- */}
        {!collapsed && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--bg-tertiary)] flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <GraduationCap className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-display text-xs font-bold text-[var(--accent-primary)] tracking-widest uppercase truncate">
                    Commander's Academy
                  </p>
                  <p className="font-mono text-[11px] text-[var(--text-muted)]">
                    {claimCount}/{TUTORIAL_QUESTS.length} Complete
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                className="flex-shrink-0 w-6 h-6 rounded-sm flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-colors"
                aria-label="Collapse tutorial sidebar"
              >
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>
            </div>

            {/* Congratulations overlay */}
            <AnimatePresence>
              {showCongrats && (
                <motion.div
                  key="congrats"
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[var(--bg-secondary)]/95 px-4 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <GraduationCap className="w-10 h-10 mb-3 text-glow-primary" style={{ color: 'var(--accent-primary)' }} />
                  <p className="font-display text-xs font-bold text-[var(--accent-primary)] text-glow-primary mb-2 leading-snug">
                    Congratulations, Commander!
                  </p>
                  <p className="font-mono text-[10px] text-[var(--text-secondary)] leading-snug">
                    You've completed the Academy.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error banner */}
            <AnimatePresence>
              {claimError && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-3 py-2 bg-[var(--accent-danger)]/10 border-b border-[var(--accent-danger)]/30 flex-shrink-0"
                >
                  <p className="font-mono text-[10px] text-[var(--accent-danger)] leading-snug">
                    {claimError}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quest list */}
            <div
              className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5"
              style={{ maxHeight: 'calc(100vh - 72px)' }}
            >
              {TUTORIAL_QUESTS.map((quest: TutorialQuest, index: number) => (
                <QuestRow
                  key={quest.id}
                  quest={quest}
                  index={index}
                  isClaimed={claimed[index] ?? false}
                  isClaimable={claimable[index] ?? false}
                  isClaimingThis={pendingQuestId === quest.id && isAnyClaimInProgress}
                  isAnyClaimInProgress={isAnyClaimInProgress}
                  showFloating={floatingQuestId === quest.id}
                  onClaim={handleClaim}
                  onFloatingDone={() => setFloatingQuestId(null)}
                />
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default TutorialSidebar;
