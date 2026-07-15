# Nexus Protocol

On-chain OGame-style space strategy game on Polkadot AssetHub.

## Repository Structure
- `contracts/` — Hardhat + Solidity (12 contracts, 407 tests)
- `frontend/` — Next.js 16 + React 19 frontend
- `design/` — Game design documents (ships, defenses, research configs)

## Key Architecture Decisions
- Multi-contract pattern to stay under 24KB bytecode limit
- NexusGame.sol is the router; PlanetManager, ShipManager, FleetManager, ResearchManager, DefenseManager, TutorialManager are the managers
- CombatEngine.sol provides combat math; FleetResolver.sol handles fleet resolution logic
- FleetResolver.sol is at 98.8% of the 24KB bytecode limit (24,281/24,576 B — 295 bytes spare). Effectively frozen: any new fleet logic needs the split FIRST
- GameState.sol is the single storage contract; GameConfig.sol holds all constants. (Caveat: TutorialManager.sol holds its own `questCompletion`/`tutorialCompleted` storage, breaking this rule — pre-existing, tracked separately)
- SessionRegistry.sol maps session keys to owners. NexusGame resolves every identity-bearing caller through it via `_player()` (13 call sites), so a session key acts as the player. `resolve()` returns the caller itself when unregistered — that's what keeps plain EOAs working. The registry is IMMUTABLE on the router: replacing it means redeploying the router and all 7 managers, since each holds `router` as an immutable
- Sessions are PGAS-funded and fee-free (ChargePGAS covers `Revive.call` + all-Revive batches ONLY — one non-Revive call in a batch forfeits it). Host mode only; local/EVM mode signs directly. Session keys live in host KV via `SessionKeyManager`
- Frontend reads/writes go through PAPI + @parity/product-sdk-contracts (wagmi removed in Phase G); ABIs come from JSON artifacts via the generated cdm.json (never manually defined)
- Contracts live on paseo-next-v2 Asset Hub (genesis 0xbf0488…, wss://paseo-asset-hub-next-rpc.polkadot.io — NO public eth-rpc; deploy via frontend/scripts/deploy-contracts-nextv2.mjs, addresses in contracts/deployments/next-v2.json)

## Agents Available
- `/solidity-architect` — Architecture review (read-only)
- `/solidity-dev` — Contract implementation
- `/contract-tester` — Test writing and execution
- `/abi-bridge` — ABI sync between contracts and frontend
- `/frontend-dev` — React/Next.js UI development
- `/qa-reviewer` — Final quality gate (read-only)

## Orchestration Commands
- `/change-contract <description>` — Full pipeline: architect → dev → test → bridge → frontend → QA
- `/change-frontend <description>` — Frontend pipeline: dev → QA

## Commands Reference
- Compile contracts: `cd contracts && npx hardhat compile`
- Test contracts: `cd contracts && npx hardhat test`
- Export ABIs: `cd contracts && npm run export-abi`
- Build frontend: `cd frontend && npm run build`
- Dev server: `cd frontend && npm run dev`
- Local chain: `cd contracts && npx hardhat node` (add `--port 8546` + `export LOCALHOST_RPC_URL=http://127.0.0.1:8546` if 8545 is taken by an eth-rpc adapter)
- Deploy local: `cd contracts && npm run deploy:local`
- Seed local test world: `cd contracts && npm run seed:local` (Alice + 4 NPC players: planets, tutorial done, ships, outposts, fleet; then play via `frontend npm run dev:local` → "Play as Alice")
- Skip local timers: `cd contracts && FF_SECONDS=3600 npm run fast-forward`
- Verify PGAS/session prerequisites on the live chain: `cd frontend && node scripts/verify-pgas.mjs` (add `AUTOMAP_SURI=//Alice` to also probe AutoMap)
- Deploy to paseo-next-v2: `cd frontend && node scripts/deploy-contracts-nextv2.mjs dry` then `... deploy` (defaults target next-v2; the genesis assertion aborts on any other chain)
