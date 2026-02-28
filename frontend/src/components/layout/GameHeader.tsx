'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, LogOut, ChevronDown, Wallet, Copy, Check, ExternalLink } from 'lucide-react';
import { useAccount, useDisconnect, useEnsName } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { ResourceHeader } from './ResourceHeader';
import { PlanetSelector } from './PlanetSelector';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/stores/userStore';
import { localhost } from '@/lib/wagmiConfig';

interface GameHeaderProps {
  className?: string;
  showResources?: boolean;
}

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function GameHeader({ className, showResources = true }: GameHeaderProps) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const { playerName } = useUserStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const handleCopyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setIsMenuOpen(false);
  };

  const displayName = playerName || ensName || (address ? truncateAddress(address) : 'Unknown');

  const dropdownVariants = {
    hidden: {
      opacity: 0,
      y: -8,
      scale: 0.95,
      transition: { duration: 0.15 },
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 400,
        damping: 25,
      },
    },
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-40 h-[72px]',
        'bg-[var(--bg-secondary)] border-b border-[var(--bg-tertiary)]',
        'shadow-[0_4px_20px_rgba(0,0,0,0.3),0_1px_0_rgba(0,255,136,0.1)]',
        className
      )}
    >
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Left: Logo */}
        <Link
          href="/game"
          className="flex items-center gap-3 group"
        >
          {/* Logo Icon */}
          <div className="relative w-10 h-10 flex items-center justify-center">
            <div className="absolute inset-0 bg-[var(--accent-primary)] opacity-20 rounded-sm rotate-45 group-hover:opacity-30 transition-opacity" />
            <div className="absolute inset-1 bg-[var(--accent-primary)] opacity-10 rounded-sm rotate-45" />
            <span className="relative font-display text-xl text-[var(--accent-primary)] font-bold">
              N
            </span>
          </div>

          {/* Logo Text */}
          <div className="hidden sm:block">
            <h1 className="font-display text-xl font-bold tracking-wider text-[var(--accent-primary)] group-hover:text-glow-primary transition-all">
              NEXUS
            </h1>
            <p className="text-xs text-[var(--text-muted)] tracking-[0.2em] -mt-1">
              PROTOCOL
            </p>
          </div>
        </Link>

        {/* Center: Planet Selector + Resources */}
        {showResources && (
          <div className="hidden md:flex flex-1 justify-center items-center gap-4 max-w-3xl mx-4">
            <PlanetSelector />
            <div className="flex-1 flex justify-center">
              <ResourceHeader />
            </div>
          </div>
        )}

        {/* Right: User Menu */}
        <div ref={menuRef} className="relative">
          {isConnected && address ? (
            <>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-sm',
                  'bg-[var(--bg-tertiary)] border border-transparent',
                  'hover:border-[var(--accent-primary)]/30 hover:shadow-[0_0_15px_rgba(0,255,136,0.1)]',
                  'transition-all duration-200',
                  isMenuOpen && 'border-[var(--accent-primary)]/30'
                )}
              >
                {/* User Avatar */}
                <div className="w-8 h-8 rounded-sm bg-[var(--bg-secondary)] flex items-center justify-center border border-[var(--bg-tertiary)]">
                  <User className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>

                {/* Address */}
                <span className="hidden sm:block font-mono text-sm text-[var(--text-secondary)]">
                  {displayName}
                </span>

                {/* Dropdown Arrow */}
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-[var(--text-muted)] transition-transform duration-200',
                    isMenuOpen && 'rotate-180'
                  )}
                />
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    variants={dropdownVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className={cn(
                      'absolute right-0 top-full mt-2 w-64',
                      'bg-[var(--bg-secondary)] border border-[var(--bg-tertiary)]',
                      'rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.5)]',
                      'overflow-hidden'
                    )}
                  >
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-[var(--bg-tertiary)]">
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className="w-4 h-4 text-[var(--accent-secondary)]" />
                        <span className="text-sm text-[var(--text-secondary)]">
                          Connected Wallet
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-xs text-[var(--text-muted)] truncate flex-1">
                          {address}
                        </p>
                        <button
                          onClick={handleCopyAddress}
                          className="p-1 hover:bg-[var(--bg-tertiary)] rounded-sm transition-colors"
                          title="Copy address"
                        >
                          {copied ? (
                            <Check className="w-3 h-3 text-[var(--accent-primary)]" />
                          ) : (
                            <Copy className="w-3 h-3 text-[var(--text-muted)]" />
                          )}
                        </button>
                        <a
                          href={`${localhost.blockExplorers.default.url}/account/${address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-[var(--bg-tertiary)] rounded-sm transition-colors"
                          title="View on explorer"
                        >
                          <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
                        </a>
                      </div>
                    </div>

                    {/* Network Info */}
                    <div className="px-4 py-2 border-b border-[var(--bg-tertiary)] bg-[var(--bg-tertiary)]/30">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                        <span className="text-xs text-[var(--text-muted)]">
                          {localhost.name}
                        </span>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-1">
                      <Link
                        href="/game/settings"
                        onClick={() => setIsMenuOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2',
                          'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                          'hover:bg-[var(--bg-tertiary)] transition-colors'
                        )}
                      >
                        <Settings className="w-4 h-4" />
                        <span className="text-sm">Settings</span>
                      </Link>

                      <button
                        onClick={handleDisconnect}
                        className={cn(
                          'flex items-center gap-3 w-full px-4 py-2',
                          'text-[var(--accent-danger)] hover:text-[var(--accent-danger)]',
                          'hover:bg-[var(--accent-danger)]/10 transition-colors'
                        )}
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm">Disconnect</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button
                  onClick={show}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-sm',
                    'bg-[var(--accent-primary)] text-[var(--bg-primary)]',
                    'font-medium hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]',
                    'transition-all duration-200 clip-angular-sm'
                  )}
                >
                  <Wallet className="w-4 h-4" />
                  <span className="text-sm">Connect Wallet</span>
                </button>
              )}
            </ConnectKitButton.Custom>
          )}
        </div>
      </div>

      {/* Mobile Resource Bar */}
      {showResources && (
        <div className="md:hidden absolute left-0 right-0 top-full bg-[var(--bg-secondary)]/95 border-b border-[var(--bg-tertiary)] px-4 py-2 backdrop-blur-sm">
          <div className="flex flex-col gap-2">
            <PlanetSelector />
            <ResourceHeader />
          </div>
        </div>
      )}
    </header>
  );
}

export default GameHeader;
