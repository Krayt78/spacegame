// Import ABIs (exported as plain ABI arrays, not full artifacts)
import nexusGameAbi from '@/contracts/abi/NexusGame.json';
import gameConfigAbi from '@/contracts/abi/GameConfig.json';

// Contract addresses
export const NEXUS_GAME_ADDRESS = process.env.NEXT_PUBLIC_NEXUS_GAME_ADDRESS as `0x${string}`;
export const GAME_CONFIG_ADDRESS = process.env.NEXT_PUBLIC_GAME_CONFIG_ADDRESS as `0x${string}`;

// Runtime validation — surface missing config early so devs don't chase silent failures
const missingVars: string[] = [];
if (!process.env.NEXT_PUBLIC_NEXUS_GAME_ADDRESS) missingVars.push('NEXT_PUBLIC_NEXUS_GAME_ADDRESS');
if (!process.env.NEXT_PUBLIC_GAME_CONFIG_ADDRESS) missingVars.push('NEXT_PUBLIC_GAME_CONFIG_ADDRESS');

if (missingVars.length > 0) {
  console.warn(
    `[Nexus Protocol] Missing contract address env vars: ${missingVars.join(', ')}.\n` +
    `Copy .env.example to .env.local and fill in the deployed contract addresses.\n` +
    `See game_project_contracts/deployments/latest.json after running deploy.`
  );
}

/** true when both contract addresses are set — use to gate UI that depends on contracts */
export const contractsConfigured = !!(
  process.env.NEXT_PUBLIC_NEXUS_GAME_ADDRESS &&
  process.env.NEXT_PUBLIC_GAME_CONFIG_ADDRESS
);

export { nexusGameAbi, gameConfigAbi };
