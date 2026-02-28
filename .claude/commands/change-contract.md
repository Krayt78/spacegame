---
description: Orchestrate a contract logic change through the full pipeline (architect → dev → test → bridge → frontend → QA)
---

The user wants to make a contract logic change: $ARGUMENTS

Execute this pipeline in order. Each step must succeed before moving to the next.

## Step 1: Architecture Review
Use the **solidity-architect** agent to:
- Analyze the requested change
- Identify which contracts are affected
- Check bytecode size risk
- Provide implementation recommendation

## Step 2: Implementation
Use the **solidity-dev** agent to:
- Implement the change following the architect's recommendation
- Compile with `npx hardhat compile`
- Verify all contracts stay under 24KB
- Export ABIs if function signatures changed

## Step 3: Testing
Use the **contract-tester** agent to:
- Write tests for the new/modified behavior
- Run the full test suite: `npx hardhat test`
- Ensure zero regressions
- Report coverage for the changed code

## Step 4: ABI Bridge
Use the **abi-bridge** agent to:
- Sync any ABI changes to the frontend
- Update hooks, types, and constants if needed
- Verify contract addresses

## Step 5: Frontend Update
Use the **frontend-dev** agent to:
- Update any UI elements affected by the contract change
- Handle new data fields, changed types, or new interactions
- Verify the frontend compiles: `cd space-empire && npm run build`

## Step 6: Final Review
Use the **qa-reviewer** agent to:
- Run both test suites
- Check all checklists
- Report any issues found
- Give final go/no-go

Report the result of each step before proceeding to the next.