// Sync contract addresses from contracts/deployments/latest.json into
// .env.localhost so `npm run dev:local` always talks to the CURRENT local
// deployment. Hardhat addresses depend on the deployer nonce, so every
// fresh `deploy:local` on a fresh node produces new ones — without this
// sync the frontend would silently point at stale (empty) addresses.
//
// Runs as the first step of `npm run dev:local`, BEFORE env-cmd loads the
// file. No-ops with a warning if there's no local deployment yet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(frontendDir, '.env.localhost');
const deploymentPath = path.resolve(frontendDir, '..', 'contracts', 'deployments', 'latest.json');

if (!fs.existsSync(deploymentPath)) {
  console.warn(
    '[sync-local-env] contracts/deployments/latest.json not found — run `npm run deploy:local` in contracts/ first. Keeping existing .env.localhost addresses.',
  );
  process.exit(0);
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
if (deployment.chainId !== 31337) {
  console.warn(
    `[sync-local-env] latest.json is for chainId ${deployment.chainId}, not localhost (31337) — leaving .env.localhost untouched.`,
  );
  process.exit(0);
}

const updates = {
  NEXT_PUBLIC_NEXUS_GAME_ADDRESS: deployment.contracts.NexusGame,
  NEXT_PUBLIC_GAME_CONFIG_ADDRESS: deployment.contracts.GameConfig,
};

let env = fs.readFileSync(envPath, 'utf8');
for (const [key, value] of Object.entries(updates)) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  env = re.test(env) ? env.replace(re, line) : `${env.trimEnd()}\n${line}\n`;
}
fs.writeFileSync(envPath, env);
console.log(
  `[sync-local-env] .env.localhost → NexusGame ${updates.NEXT_PUBLIC_NEXUS_GAME_ADDRESS}, GameConfig ${updates.NEXT_PUBLIC_GAME_CONFIG_ADDRESS}`,
);
