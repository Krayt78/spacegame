# ABI Mismatch Fix - Ship Building eth_call Errors

## Problem
When building ships, the frontend was making numerous `eth_call` requests that failed with:
```
Error: Transaction reverted without a reason
Contract call: NexusGame#<unrecognized-selector>
```

## Root Cause
The ABI defined in `src/lib/contracts.ts` was **manually created** and had **incorrect function signatures** that didn't match the actual deployed contracts:

### Issue 1: Missing Parameter in `getShipBuildTime`
**Actual Contract Signature:**
```solidity
function getShipBuildTime(uint8 shipType, uint256 quantity, uint8 shipyardLevel)
```

**Incorrect ABI (missing `quantity`):**
```typescript
{
  name: 'getShipBuildTime',
  inputs: [
    { name: 'shipType', type: 'uint8' },
    { name: 'shipyardLevel', type: 'uint8' },  // ❌ Missing quantity parameter!
  ]
}
```

### Issue 2: Missing Functions
The manually defined ABI was also missing several functions that exist in the actual contract, including:
- `getShipConfig(uint8 shipType)` - Returns full ship configuration
- Various public mappings and utility functions

## Why This Caused Errors
When calling a smart contract function, the function selector is computed from the function signature (name + parameter types). If the ABI doesn't match the contract:

1. Wrong signature: `getShipBuildTime(uint8,uint8)` → selector `0xabcd1234`
2. Correct signature: `getShipBuildTime(uint8,uint256,uint8)` → selector `0x12345678`

The contract receives selector `0xabcd1234` but doesn't recognize it → `<unrecognized-selector>` error

## Solution
✅ **Import the actual contract ABIs from the Hardhat artifacts instead of manually defining them**

### Changes Made:

1. **Copied ABI files** from contracts project:
   - `game_project_contracts/artifacts/contracts/NexusGame.sol/NexusGame.json`
   - `game_project_contracts/artifacts/contracts/GameConfig.sol/GameConfig.json`

   → To: `src/contracts/abi/`

2. **Updated `src/lib/contracts.ts`:**
   ```typescript
   // Before: Manually defined ABI with 200+ lines
   export const nexusGameAbi = [ /* manual definitions */ ] as const;

   // After: Import from artifacts
   import NexusGameArtifact from '@/contracts/abi/NexusGame.json';
   export const nexusGameAbi = NexusGameArtifact.abi as const;
   ```

3. **Fixed `useShipBuildTime` hook** in `src/hooks/useNexusGame.ts`:
   - Added missing `quantity` parameter
   - Updated function signature to match contract

## Testing
After this fix, all `eth_call` requests should succeed because the function selectors will now match the actual contract functions.

## Best Practice Going Forward
**Never manually define ABIs** - always import them from:
- Hardhat artifacts (`artifacts/contracts/`)
- Or export them during compilation to a shared location

This ensures the frontend always uses the correct, up-to-date contract interfaces.

## Files Changed
- ✅ `src/lib/contracts.ts` - Import ABIs from artifacts instead of manual definitions
- ✅ `src/hooks/useNexusGame.ts` - Fixed `useShipBuildTime` parameter signature
- ✅ `src/contracts/abi/NexusGame.json` - Added (copied from artifacts)
- ✅ `src/contracts/abi/GameConfig.json` - Added (copied from artifacts)
