'use client';

import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { cn, formatTimeRemaining } from '@/lib/utils';

export type ProgressVariant = 'default' | 'success' | 'warning' | 'danger';

export interface ProgressBarProps {
  progress: number;
  variant?: ProgressVariant;
  label?: string;
  timeRemaining?: number;
  showPercentage?: boolean;
  animated?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const variantConfig: Record<
  ProgressVariant,
  {
    bgClass: string;
    fillClass: string;
    glowColor: string;
    gradient: string;
  }
> = {
  default: {
    bgClass: 'bg-bg-primary',
    fillClass: 'bg-accent-secondary',
    glowColor: 'rgba(0, 217, 255, 0.5)',
    gradient: 'linear-gradient(90deg, #0077aa, #00d9ff, #0077aa)',
  },
  success: {
    bgClass: 'bg-bg-primary',
    fillClass: 'bg-accent-primary',
    glowColor: 'rgba(0, 255, 136, 0.5)',
    gradient: 'linear-gradient(90deg, #00aa55, #00ff88, #00aa55)',
  },
  warning: {
    bgClass: 'bg-bg-primary',
    fillClass: 'bg-accent-warn',
    glowColor: 'rgba(255, 170, 0, 0.5)',
    gradient: 'linear-gradient(90deg, #cc7700, #ffaa00, #cc7700)',
  },
  danger: {
    bgClass: 'bg-bg-primary',
    fillClass: 'bg-accent-danger',
    glowColor: 'rgba(255, 51, 102, 0.5)',
    gradient: 'linear-gradient(90deg, #aa2244, #ff3366, #aa2244)',
  },
};

const sizeStyles = {
  sm: { height: 'h-2', text: 'text-xs', clip: 'clip-angular-sm' },
  md: { height: 'h-4', text: 'text-sm', clip: 'clip-angular' },
  lg: { height: 'h-6', text: 'text-base', clip: 'clip-angular' },
};

export const ProgressBar = ({
  progress,
  variant = 'default',
  label,
  timeRemaining,
  showPercentage = false,
  animated = true,
  size = 'md',
  className,
}: ProgressBarProps) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const config = variantConfig[variant];
  const sizes = sizeStyles[size];

  const springProgress = useSpring(clampedProgress, {
    stiffness: 100,
    damping: 30,
  });

  const progressWidth = useTransform(springProgress, (v) => `${v}%`);

  useEffect(() => {
    springProgress.set(clampedProgress);
  }, [clampedProgress, springProgress]);

  const [displayTime, setDisplayTime] = useState(timeRemaining);

  useEffect(() => {
    if (timeRemaining === undefined) return;

    setDisplayTime(timeRemaining);
    const interval = setInterval(() => {
      setDisplayTime((prev) => (prev !== undefined && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining]);

  return (
    <div
      className={cn('w-full', className)}
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {(label || showPercentage || displayTime !== undefined) && (
        <div className="flex items-center justify-between mb-2">
          {label && (
            <span
              className={cn(
                'font-mono text-text-secondary uppercase tracking-wider',
                sizes.text
              )}
            >
              {label}
            </span>
          )}
          <div className="flex items-center gap-3">
            {displayTime !== undefined && displayTime > 0 && (
              <span className={cn('font-mono text-accent-warn', sizes.text)}>
                {formatTimeRemaining(displayTime)}
              </span>
            )}
            {showPercentage && (
              <motion.span
                className={cn(
                  'font-mono font-bold tabular-nums',
                  sizes.text,
                  config.fillClass.replace('bg-', 'text-')
                )}
              >
                {Math.round(clampedProgress)}%
              </motion.span>
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          'relative overflow-hidden',
          sizes.height,
          sizes.clip,
          config.bgClass,
          'border border-bg-tertiary'
        )}
      >
        <motion.div
          className={cn('absolute inset-y-0 left-0', sizes.clip)}
          style={{
            width: progressWidth,
            background: animated ? config.gradient : undefined,
            backgroundSize: animated ? '200% 100%' : undefined,
            boxShadow: `0 0 15px ${config.glowColor}`,
          }}
        >
          <div
            className={cn(
              'absolute inset-0',
              config.fillClass,
              animated ? 'opacity-0' : 'opacity-100'
            )}
          />
          {animated && (
            <div
              className="absolute inset-0 animate-progress-flow"
              style={{
                background: config.gradient,
                backgroundSize: '200% 100%',
              }}
            />
          )}
        </motion.div>

        {animated && clampedProgress > 0 && (
          <motion.div
            className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{
              x: ['-100%', '400%'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        )}
      </div>
    </div>
  );
};
