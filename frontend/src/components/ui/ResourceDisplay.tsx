'use client';

import { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { cn, formatNumber } from '@/lib/utils';

export type ResourceType = 'titanium' | 'helium3' | 'darkMatter';

export interface ResourceDisplayProps {
  type: ResourceType;
  amount: number;
  productionRate?: number;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const resourceConfig: Record<
  ResourceType,
  {
    icon: string;
    label: string;
    colorClass: string;
    glowClass: string;
  }
> = {
  titanium: {
    icon: '🔩',
    label: 'Titanium',
    colorClass: 'text-resource-titanium',
    glowClass: 'glow-titanium',
  },
  helium3: {
    icon: '⚗️',
    label: 'Helium-3',
    colorClass: 'text-resource-helium3',
    glowClass: 'glow-helium3',
  },
  darkMatter: {
    icon: '🌀',
    label: 'Dark Matter',
    colorClass: 'text-resource-darkMatter',
    glowClass: 'glow-darkMatter',
  },
};

const sizeStyles = {
  sm: {
    container: 'gap-2',
    icon: 'text-lg',
    amount: 'text-lg',
    rate: 'text-xs',
  },
  md: {
    container: 'gap-3',
    icon: 'text-2xl',
    amount: 'text-2xl',
    rate: 'text-sm',
  },
  lg: {
    container: 'gap-4',
    icon: 'text-3xl',
    amount: 'text-4xl',
    rate: 'text-base',
  },
};

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

const AnimatedNumber = ({ value, className }: AnimatedNumberProps) => {
  const springValue = useSpring(value, {
    stiffness: 100,
    damping: 30,
    mass: 1,
  });

  const displayValue = useTransform(springValue, (latest) =>
    formatNumber(Math.floor(latest))
  );

  useEffect(() => {
    springValue.set(value);
  }, [value, springValue]);

  return <motion.span className={className}>{displayValue}</motion.span>;
};

export const ResourceDisplay = ({
  type,
  amount,
  productionRate,
  showIcon = true,
  size = 'md',
  className,
}: ResourceDisplayProps) => {
  const config = resourceConfig[type];
  const sizes = sizeStyles[size];

  return (
    <div
      className={cn('inline-flex items-center', sizes.container, className)}
      role="status"
      aria-label={`${config.label}: ${formatNumber(amount)}${
        productionRate !== undefined ? ` (${productionRate >= 0 ? '+' : ''}${formatNumber(productionRate)}/hr)` : ''
      }`}
    >
      {showIcon && (
        <span className={sizes.icon} role="img" aria-hidden="true">
          {config.icon}
        </span>
      )}

      <div className="flex flex-col">
        <AnimatedNumber
          value={amount}
          className={cn(
            'font-mono font-bold tabular-nums',
            sizes.amount,
            config.colorClass
          )}
        />

        {productionRate !== undefined && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              'font-mono tabular-nums',
              sizes.rate,
              productionRate >= 0 ? 'text-accent-primary' : 'text-accent-danger'
            )}
          >
            {productionRate >= 0 ? '+' : ''}
            {formatNumber(productionRate)}/hr
          </motion.span>
        )}
      </div>
    </div>
  );
};
