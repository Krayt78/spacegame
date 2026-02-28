'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  padding?: CardPadding;
  glow?: boolean;
  showGrid?: boolean;
  children: ReactNode;
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const paddingStyles: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'md', glow = false, showGrid = false, className, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        whileHover={glow ? { boxShadow: '0 0 30px rgba(0, 255, 136, 0.2)' } : undefined}
        className={cn(
          'relative',
          'bg-bg-card border border-bg-tertiary',
          'clip-angular',
          showGrid && 'bg-grid',
          paddingStyles[padding],
          'transition-shadow duration-300',
          className
        )}
        {...props}
      >
        {showGrid && (
          <div className="scanlines absolute inset-0 pointer-events-none opacity-30" />
        )}
        <div className="relative z-10">{children}</div>
      </motion.div>
    );
  }
);

Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ title, subtitle, action, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-between',
          'pb-4 mb-4 border-b border-bg-tertiary',
          className
        )}
        {...props}
      >
        {children || (
          <>
            <div>
              {title && (
                <h3 className="font-display text-lg font-bold text-text-primary uppercase tracking-wider">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-sm text-text-muted mt-1">{subtitle}</p>
              )}
            </div>
            {action && <div>{action}</div>}
          </>
        )}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('text-text-secondary', className)} {...props}>
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-3',
          'pt-4 mt-4 border-t border-bg-tertiary',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';
