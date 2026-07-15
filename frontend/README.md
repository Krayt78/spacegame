This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment configuration

Configuration is supplied through `.env.*` files. Only public values belong in
these files — every variable the browser reads is prefixed `NEXT_PUBLIC_` and is
therefore baked into the client bundle. **Never put a private key, mnemonic, or
any other secret in an env file.**

| File             | Tracked in git    | Used by                                        |
| ---------------- | ----------------- | ---------------------------------------------- |
| `.env.example`   | ✅ yes (template)  | reference for all available variables          |
| `.env.devnet`    | ✅ yes             | `npm run dev:net` (dev server vs. the real paseo-next-v2 chain, DevProvider) |
| `.env.localhost` | ❌ **gitignored**  | `npm run dev:local` (local Hardhat node)       |
| `.env.testnet`   | ❌ **gitignored**  | `npm run dev:testnet` + `scripts/deploy-frontend.sh` (paseo-next-v2 deploy) |

`.env.example` and `.env.devnet` are committed (public values only). The
per-user runtime files — `.env.localhost` and `.env.testnet` — are
**gitignored** so no per-user or secret value lands in the repo. Create whichever
you need by copying the template:

```bash
cp .env.example .env.localhost   # local Hardhat node
cp .env.example .env.testnet     # paseo-next-v2 + bulletin deploy
```

Then set the public values (chain, WS endpoint, deployed contract addresses).
`scripts/deploy-frontend.sh` sources `.env.testnet` by default for the Bulletin
build, so that one file drives both `npm run dev:testnet` and the deploy.

Reference values (paseo-next-v2 — this project's only chain target):

```bash
NEXT_PUBLIC_CHAIN=testnet
NEXT_PUBLIC_HUB_WS_URL=wss://paseo-asset-hub-next-rpc.polkadot.io
# Fill in from contracts/deployments/next-v2.json after deploying:
NEXT_PUBLIC_NEXUS_GAME_ADDRESS=
NEXT_PUBLIC_GAME_CONFIG_ADDRESS=
NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS=
NEXUS_DOTNS_DOMAIN=spacegame.dot
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
