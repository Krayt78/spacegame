import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Buildings, Resources } from '@/types/game';
import { BUILDING_CONFIG } from '@/constants/gameConfig';

/**
 * Combines class names using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with commas as thousands separators
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(Math.floor(num));
}

/**
 * Format large numbers compactly (12450 → "12.4k")
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toLocaleString();
}

/**
 * Format coordinates as a string [G:S:P]
 */
export function formatCoordinates(coords: [number, number, number]): string {
  return `[${coords[0]}:${coords[1]}:${coords[2]}]`;
}

/**
 * Calculate time remaining in a human-readable format
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return '00:00:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return [hours, minutes, secs]
    .map(v => v.toString().padStart(2, '0'))
    .join(':');
}

/**
 * Format seconds to human-readable time string (150 → "2m 30s")
 */
export function formatTime(seconds: number): string {
  if (seconds <= 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

/**
 * Convert camelCase to Title Case
 */
export function camelToTitle(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Calculate upgrade cost for a building
 */
export function calculateUpgradeCost(
  buildingKey: keyof Buildings,
  currentLevel: number
): Resources {
  const config = BUILDING_CONFIG[buildingKey];
  const multiplier = Math.pow(config.costMultiplier, currentLevel);

  return {
    titanium: Math.floor(config.baseCost.titanium * multiplier),
    helium3: Math.floor(config.baseCost.helium3 * multiplier),
    darkMatter: Math.floor(config.baseCost.darkMatter * multiplier),
  };
}

/**
 * Calculate production for resource buildings
 */
export function calculateProduction(
  buildingKey: keyof Buildings,
  level: number
): number {
  const config = BUILDING_CONFIG[buildingKey];

  if (!('baseProduction' in config) || level === 0) return 0;

  return Math.floor(
    config.baseProduction * level * Math.pow(config.productionMultiplier, level)
  );
}

/**
 * Calculate storage capacity for storage buildings
 */
export function calculateStorageCapacity(
  buildingKey: keyof Buildings,
  level: number
): number {
  const config = BUILDING_CONFIG[buildingKey];

  if (!('baseCapacity' in config) || level === 0) return 0;

  return Math.floor(
    config.baseCapacity * Math.pow(config.capacityMultiplier, level)
  );
}

/**
 * Check if player can afford an upgrade
 */
export function canAffordUpgrade(
  currentResources: Resources,
  cost: Resources
): boolean {
  return (
    currentResources.titanium >= cost.titanium &&
    currentResources.helium3 >= cost.helium3 &&
    currentResources.darkMatter >= cost.darkMatter
  );
}

/**
 * Calculate build time in seconds
 */
export function calculateBuildTime(
  buildingKey: keyof Buildings,
  currentLevel: number
): number {
  const config = BUILDING_CONFIG[buildingKey];
  const baseCost = config.baseCost.titanium + config.baseCost.helium3 + config.baseCost.darkMatter;
  // Base time scales with level and cost
  return Math.floor((baseCost * (currentLevel + 1) * 0.5) / 10) * 10 || 30;
}
