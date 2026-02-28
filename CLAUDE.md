# Nexus Protocol

On-chain OGame-style space strategy game on Polkadot AssetHub.

## Repository Structure
- `contracts/` — Hardhat + Solidity (8 contracts, 259+ tests)
- `frontend/` — Next.js 16 + React 19 frontend
- `design/` — Game design documents (ships, defenses, research configs)

## Key Architecture Decisions
- Multi-contract pattern to stay under 24KB bytecode limit
- NexusGame.sol is the router; PlanetManager, ShipManager, FleetManager are the managers
- GameState.sol is the single storage contract; GameConfig.sol holds all constants
- Frontend uses wagmi v3 hooks that import ABIs from JSON artifacts (never manually defined)

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
- Local chain: `cd contracts && npx hardhat node`
- Deploy local: `cd contracts && npm run deploy:local`
