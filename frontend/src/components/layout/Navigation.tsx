'use client';

import React, { useState, useEffect, memo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Building2,
  Ship,
  ShieldAlert,
  Rocket,
  Globe,
  FlaskConical,
  FileText,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: 'Overview', href: '/game', icon: Home },
  { label: 'Buildings', href: '/game/buildings', icon: Building2 },
  { label: 'Shipyard', href: '/game/shipyard', icon: Ship },
  { label: 'Fortifications', href: '/game/fortifications', icon: ShieldAlert },
  { label: 'Fleet', href: '/game/fleet', icon: Rocket },
  { label: 'Galaxy', href: '/game/galaxy', icon: Globe },
  { label: 'Research', href: '/game/research', icon: FlaskConical },
  { label: 'Reports', href: '/game/reports', icon: FileText },
];

interface NavContentProps {
  isCollapsed: boolean;
  isActive: (href: string) => boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

// Extracted as a separate memoized component to prevent animation replay on parent re-renders
const NavContent = memo(function NavContent({
  isCollapsed,
  isActive,
  setIsCollapsed,
}: NavContentProps) {
  return (
    <nav className="flex flex-col h-full">
      {/* Nav Items */}
      <ul className="flex-1 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 px-4 py-3 mx-2 rounded-sm transition-all duration-200',
                  'hover:bg-[var(--bg-tertiary)] hover:shadow-[0_0_15px_rgba(0,255,136,0.1)]',
                  active && [
                    'bg-[var(--bg-tertiary)]',
                    'border-l-4 border-[var(--accent-primary)]',
                    'shadow-[0_0_20px_rgba(0,255,136,0.15)]',
                    'ml-0 rounded-l-none',
                  ],
                  !active && 'border-l-4 border-transparent ml-0',
                  isCollapsed && 'justify-center px-2'
                )}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 transition-colors duration-200 flex-shrink-0',
                    active
                      ? 'text-[var(--accent-primary)] drop-shadow-[0_0_8px_var(--accent-primary)]'
                      : 'text-[var(--text-secondary)] group-hover:text-[var(--accent-primary)]'
                  )}
                />
                {!isCollapsed && (
                  <span
                    className={cn(
                      'font-medium transition-colors duration-200',
                      active
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                    )}
                  >
                    {item.label}
                  </span>
                )}
                {active && !isCollapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Collapse Toggle - Desktop Only */}
      <div className="hidden lg:block border-t border-[var(--bg-tertiary)] p-4">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 rounded-sm',
            'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            'hover:bg-[var(--bg-tertiary)] transition-colors duration-200',
            isCollapsed && 'justify-center'
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
});

interface NavigationProps {
  className?: string;
}

export function Navigation({ className }: NavigationProps) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const isActive = useCallback((href: string) => {
    if (href === '/game') {
      return pathname === '/game';
    }
    return pathname.startsWith(href);
  }, [pathname]);

  const sidebarVariants = {
    open: {
      x: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 30,
      },
    },
    closed: {
      x: '-100%',
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 30,
      },
    },
  };

  const overlayVariants = {
    open: { opacity: 1 },
    closed: { opacity: 0 },
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className={cn(
          'lg:hidden fixed top-4 left-4 z-50 p-2 rounded-sm',
          'bg-[var(--bg-secondary)] border border-[var(--bg-tertiary)]',
          'text-[var(--text-secondary)] hover:text-[var(--accent-primary)]',
          'transition-colors duration-200',
          isMobileOpen && 'opacity-0 pointer-events-none'
        )}
        aria-label="Open navigation menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Mobile Navigation Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              variants={overlayVariants}
              initial="closed"
              animate="open"
              exit="closed"
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />

            {/* Mobile Sidebar */}
            <motion.aside
              variants={sidebarVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className={cn(
                'lg:hidden fixed left-0 top-0 bottom-0 z-50 w-64',
                'bg-[var(--bg-secondary)] border-r border-[var(--bg-tertiary)]',
                'shadow-[4px_0_20px_rgba(0,0,0,0.5)]'
              )}
            >
              {/* Mobile Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--bg-tertiary)]">
                <span className="font-display text-lg text-[var(--accent-primary)]">
                  Navigation
                </span>
                <button
                  onClick={() => setIsMobileOpen(false)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label="Close navigation menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <NavContent
                isCollapsed={isCollapsed}
                isActive={isActive}
                setIsCollapsed={setIsCollapsed}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: isCollapsed ? 72 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          'hidden lg:flex flex-col',
          'bg-[var(--bg-secondary)] border-r border-[var(--bg-tertiary)]',
          'min-h-[calc(100vh-72px)]',
          className
        )}
      >
        <NavContent
          isCollapsed={isCollapsed}
          isActive={isActive}
          setIsCollapsed={setIsCollapsed}
        />
      </motion.aside>
    </>
  );
}

export default Navigation;
