'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Globe, Rocket, AlertCircle, Check, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { GameHeader } from '@/components/layout/GameHeader';
import { useHasPlanet, useClaimStarterPlanet } from '@/hooks/useNexusGame';
import { cn } from '@/lib/utils';

export default function OnboardingPage() {
  const router = useRouter();
  const [planetName, setPlanetName] = useState('');
  const [nameError, setNameError] = useState('');

  const { data: hasPlanet, isLoading: checkingPlanet } = useHasPlanet();
  const { claimPlanet, isPending, isConfirming, isSuccess, error, reset } = useClaimStarterPlanet();

  // Redirect if user already has a planet
  useEffect(() => {
    if (hasPlanet === true) {
      router.push('/game');
    }
  }, [hasPlanet, router]);

  // Redirect after successful claim
  useEffect(() => {
    if (!isSuccess) return;
    const timer = setTimeout(() => router.push('/game'), 2000);
    return () => clearTimeout(timer);
  }, [isSuccess, router]);

  const validateName = (name: string): string => {
    if (name.length === 0) return 'Planet name is required';
    if (name.length > 32) return 'Planet name must be 32 characters or less';
    return '';
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setPlanetName(name);
    if (nameError) {
      setNameError(validateName(name));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateName(planetName);
    if (error) {
      setNameError(error);
      return;
    }
    setNameError('');
    claimPlanet(planetName);
  };

  // Get current transaction status
  const getStatus = () => {
    if (isSuccess) return { text: 'Planet claimed successfully!', icon: Check, color: 'text-accent-primary' };
    if (isConfirming) return { text: 'Confirming transaction...', icon: Loader2, color: 'text-accent-secondary' };
    if (isPending) return { text: 'Confirm in your wallet...', icon: Loader2, color: 'text-accent-warning' };
    return null;
  };

  const status = getStatus();
  const isProcessing = isPending || isConfirming;

  // Show loading while checking planet status
  if (checkingPlanet) {
    return (
      <>
        <GameHeader showResources={false} />
        <div className="min-h-screen bg-bg-primary flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-16 h-16 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-accent-primary/20 rounded-sm rotate-45 animate-pulse" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 border-2 border-transparent border-t-accent-primary rounded-full"
              />
            </div>
            <p className="font-display text-lg text-text-secondary tracking-wide">
              Checking planet status...
            </p>
          </motion.div>
        </div>
      </>
    );
  }

  return (
    <>
      <GameHeader showResources={false} />
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
        <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <Card glow showGrid padding="lg">
          <CardHeader>
            <div className="text-center w-full">
              <div className="w-20 h-20 mx-auto mb-4 relative">
                <div className="absolute inset-0 bg-accent-primary/20 rounded-full animate-pulse" />
                <div className="absolute inset-2 bg-accent-primary/10 rounded-full" />
                <Globe className="absolute inset-0 m-auto w-10 h-10 text-accent-primary" />
              </div>
              <h1 className="font-display text-2xl font-bold text-text-primary uppercase tracking-wider">
                Welcome, Commander
              </h1>
              <p className="text-text-muted mt-2">
                Claim your starter planet to begin your galactic conquest
              </p>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="planetName"
                  className="block text-sm font-mono text-text-secondary uppercase tracking-wider mb-2"
                >
                  Planet Name
                </label>
                <input
                  id="planetName"
                  type="text"
                  value={planetName}
                  onChange={handleNameChange}
                  disabled={isProcessing || isSuccess}
                  placeholder="Enter your planet name..."
                  maxLength={32}
                  className={cn(
                    'w-full px-4 py-3 bg-bg-tertiary border rounded-sm',
                    'font-mono text-text-primary placeholder:text-text-muted',
                    'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-all duration-200',
                    nameError ? 'border-accent-danger' : 'border-bg-tertiary'
                  )}
                />
                <div className="flex justify-between mt-2">
                  {nameError ? (
                    <span className="text-xs text-accent-danger flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {nameError}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="text-xs text-text-muted">
                    {planetName.length}/32
                  </span>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-accent-danger/10 border border-accent-danger/30 rounded-sm"
                >
                  <p className="text-sm text-accent-danger flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error.message || 'Transaction failed. Please try again.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => reset()}
                    className="text-xs text-accent-danger/70 hover:text-accent-danger mt-2 underline"
                  >
                    Dismiss
                  </button>
                </motion.div>
              )}

              {status && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'p-3 border rounded-sm flex items-center gap-3',
                    isSuccess
                      ? 'bg-accent-primary/10 border-accent-primary/30'
                      : 'bg-accent-secondary/10 border-accent-secondary/30'
                  )}
                >
                  <status.icon
                    className={cn(
                      'w-5 h-5 flex-shrink-0',
                      status.color,
                      !isSuccess && 'animate-spin'
                    )}
                  />
                  <span className={cn('text-sm font-mono', status.color)}>
                    {status.text}
                  </span>
                </motion.div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isProcessing}
                disabled={isProcessing || isSuccess || !planetName.trim()}
                leftIcon={!isProcessing && !isSuccess ? <Rocket className="w-5 h-5" /> : undefined}
                className="w-full"
              >
                {isSuccess ? 'Launching...' : 'Claim Planet'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-text-muted text-xs mt-6">
          Your starter planet is free to claim. One planet per wallet address.
        </p>
        </motion.div>
      </div>
    </>
  );
}
