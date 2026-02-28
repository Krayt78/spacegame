'use client';

import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

const LoadingSpinner = ({ className }: { className?: string }) => (
  <svg
    className={cn('animate-spin', className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-accent-primary text-bg-primary font-bold',
    'hover:shadow-[0_0_30px_rgba(0,255,136,0.5)]',
    'active:bg-accent-primary/80'
  ),
  secondary: cn(
    'bg-bg-tertiary text-text-primary',
    'border border-accent-secondary/50',
    'hover:border-accent-secondary hover:shadow-[0_0_20px_rgba(0,217,255,0.3)]'
  ),
  danger: cn(
    'bg-accent-danger/20 text-accent-danger',
    'border border-accent-danger/50',
    'hover:bg-accent-danger/30 hover:shadow-[0_0_20px_rgba(255,51,102,0.3)]'
  ),
  ghost: cn(
    'bg-transparent text-text-secondary',
    'hover:text-text-primary hover:bg-bg-tertiary/50'
  ),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs clip-angular-sm',
  md: 'px-5 py-2.5 text-sm clip-angular',
  lg: 'px-8 py-3.5 text-base clip-angular-lg',
};

const iconSizes: Record<ButtonSize, string> = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: isDisabled ? 1 : 1.02 }}
        whileTap={{ scale: isDisabled ? 1 : 0.98 }}
        transition={{ duration: 0.15 }}
        disabled={isDisabled}
        className={cn(
          'relative inline-flex items-center justify-center gap-2',
          'font-mono font-semibold uppercase tracking-wider',
          'transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
          variantStyles[variant],
          sizeStyles[size],
          isDisabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {isLoading ? (
          <LoadingSpinner className={iconSizes[size]} />
        ) : leftIcon ? (
          <span className={cn('flex-shrink-0', iconSizes[size])}>{leftIcon}</span>
        ) : null}

        <span>{children}</span>

        {!isLoading && rightIcon && (
          <span className={cn('flex-shrink-0', iconSizes[size])}>{rightIcon}</span>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
