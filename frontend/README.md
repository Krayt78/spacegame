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

| File              | Tracked in git | Used by                                  |
| ----------------- | -------------- | ---------------------------------------- |
| `.env.example`    | ✅ yes (template) | reference for all available variables |
| `.env.localhost`  | ❌ **gitignored** | `npm run dev:local` (local Hardhat node) |
| `.env.testnet`    | ❌ **gitignored** | `npm run dev:testnet` (Polkadot Hub TestNet) |
| `.env.production` | ❌ **gitignored** | `npm run build` (production build)     |

### Setting up the env files

Only `.env.example` is committed. The runtime files (`.env.localhost`,
`.env.testnet`, `.env.production`) are **gitignored** so that no one can
accidentally commit a secret through them. Create whichever you need locally by
copying the template and filling in the values:

```bash
cp .env.example .env.localhost   # local Hardhat node
cp .env.example .env.testnet     # Polkadot Hub TestNet
cp .env.example .env.production  # production build
```

Then set the public values (chain, RPC/WS endpoints, deployed contract
addresses). For a Vercel deployment, set the same `NEXT_PUBLIC_*` variables in
the **Vercel dashboard → Settings → Environment Variables** instead — they take
precedence and you don't need a local `.env.production` at all.

Reference values (testnet):

```bash
NEXT_PUBLIC_CHAIN=testnet
NEXT_PUBLIC_POLKADOT_HUB_RPC_URL=https://eth-rpc-testnet.polkadot.io
NEXT_PUBLIC_HUB_WS_URL=wss://paseo-asset-hub-next-rpc.polkadot.io
NEXT_PUBLIC_NEXUS_GAME_ADDRESS=0x64e619ea4d8a593c68533c0feaf3e36d3666495b
NEXT_PUBLIC_GAME_CONFIG_ADDRESS=0xa4fe17ea7595fc50e55319f46c54cf8c7b34b3e3
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
