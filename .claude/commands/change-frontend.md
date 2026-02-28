---
description: Orchestrate a frontend change through the pipeline (dev → QA)
---

The user wants to make a frontend change: $ARGUMENTS

## Step 1: Implementation
Use the **frontend-dev** agent to:
- Implement the requested UI/UX change
- Ensure it follows the design system
- Verify it compiles: `cd space-empire && npm run build`

## Step 2: Review
Use the **qa-reviewer** agent to:
- Verify TypeScript compilation
- Check component consistency
- Validate contract interaction correctness (if applicable)
- Give final go/no-go