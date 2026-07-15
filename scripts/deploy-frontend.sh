#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse flags
DOMAIN=""
ENV_FILE=""
# Bulletin environment id (polkadot-app-deploy --env). Drives BOTH the Bulletin RPC
# and the Asset Hub RPC used for DotNS register/content-set, plus the bundled
# DotNS contract addresses. Run `npx @parity/polkadot-app-deploy --list-environments`
# for the full list (paseo-next-v2, summit, …). Resolution: --net > shell
# BULLETIN_ENV > env-file BULLETIN_ENV > 'summit' (Web3 Summit Network).
BULLETIN_ENV="${BULLETIN_ENV:-}"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain|-d) DOMAIN="$2"; shift 2 ;;
        --env|-e) ENV_FILE="$2"; shift 2 ;;
        --net|-n) BULLETIN_ENV="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--domain <name.dot>] [--env <file>] [--net <env-id>]"
            echo ""
            echo "Builds the Nexus Protocol frontend as a static export and"
            echo "deploys it to IPFS via the Polkadot Bulletin Chain. Registers"
            echo "or updates the DotNS record so https://<name>.dot.li resolves"
            echo "to the new CID."
            echo ""
            echo "  --domain <name.dot>   DotNS basename (default: spacegame.dot)"
            echo "  --env <file>          env file to source for the build"
            echo "                        (default: frontend/.env.testnet)"
            echo "  --net <env-id>        Bulletin/DotNS environment (default: summit)."
            echo "                        See 'npx @parity/polkadot-app-deploy --list-environments'."
            exit 0
            ;;
        *) echo "Unknown argument: $1"; echo "Run with --help for usage."; exit 1 ;;
    esac
done

# Capture the --domain override before sourcing the env file. After sourcing
# we resolve: --domain > shell NEXUS_DOTNS_DOMAIN > env-file NEXUS_DOTNS_DOMAIN
# > default. This lets `.env.<target>` own the deploy target alongside the
# in-bundle DOT_NS_IDENTIFIER, so one file drives both.
DOMAIN_OVERRIDE="$DOMAIN"
# Same for the network: --net (or shell BULLETIN_ENV) must beat an env-file
# BULLETIN_ENV, which would otherwise clobber it when the file is sourced.
BULLETIN_ENV_OVERRIDE="$BULLETIN_ENV"

echo "=== Deploy Nexus Protocol Frontend to Bulletin Chain ==="
echo ""

# Deployed via @parity/polkadot-app-deploy (CLI: polkadot-app-deploy / pad),
# invoked through npx — no global install or IPFS Kubo needed (we pass
# --js-merkle). Two ways to authorize the DotNS register/content-set:
#   1. QR sign-in: run `npx -y @parity/polkadot-app-deploy login` once, scan the
#      QR with the Polkadot mobile app. Then deploy with NO mnemonic — a local
#      worker registers + uploads and transfers the name to your signed-in
#      account (testnet default; zero mobile signatures during deploy).
#   2. MNEMONIC: set it in the env file (or shell) to sign as that owner key.

# Resolve which env file to source (default: .env.testnet). The env file is the
# single source of truth for this environment: it carries the build config
# (NEXT_PUBLIC_*), the deploy domain (NEXUS_DOTNS_DOMAIN) AND the deployer key
# (MNEMONIC) — same as `npm run dev:<mode>`.
if [ -z "$ENV_FILE" ]; then
    ENV_FILE="$ROOT_DIR/frontend/.env.testnet"
fi

# Remember any explicit shell MNEMONIC so it wins over an empty env-file field.
PRE_MNEMONIC="${MNEMONIC:-}"

if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
    echo "[0/2] Sourcing env vars from $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
else
    echo "[0/2] No env file found — contract addresses + MNEMONIC must already be in your shell."
    echo "      The build will fail with 'CONTRACTS NOT CONFIGURED' if NEXT_PUBLIC_NEXUS_GAME_ADDRESS"
    echo "      and NEXT_PUBLIC_GAME_CONFIG_ADDRESS aren't set."
fi

# An explicit shell MNEMONIC overrides an empty `MNEMONIC=` in the env file.
if [ -z "${MNEMONIC:-}" ] && [ -n "$PRE_MNEMONIC" ]; then
    MNEMONIC="$PRE_MNEMONIC"
fi

# Fall back to the hardhat-vars MNEMONIC if the env file didn't supply one.
if [ -z "${MNEMONIC:-}" ]; then
    HARDHAT_VARS_FILE="${HARDHAT_VARS_FILE:-}"
    if [ -z "${HARDHAT_VARS_FILE:-}" ]; then
        HARDHAT_VARS_FILE="$(
            node -e "const fs=require('fs');const os=require('os');const path=require('path');const home=os.homedir();const cand=[process.env.HARDHAT_VARS_FILE,path.join(home,'Library/Preferences/hardhat-nodejs/vars.json'),path.join(home,'.config/hardhat-nodejs/vars.json')].filter(Boolean);for(const p of cand){try{fs.accessSync(p,fs.constants.R_OK);process.stdout.write(p);process.exit(0);}catch{}}"
        )"
    fi
    if [ -n "${HARDHAT_VARS_FILE:-}" ] && [ -f "$HARDHAT_VARS_FILE" ]; then
        MNEMONIC=$(node -e "try{const v=require('$HARDHAT_VARS_FILE');process.stdout.write(v.vars.MNEMONIC??'')}catch(e){}" 2>/dev/null || true)
    fi
fi
echo ""

# Resolve deploy domain + network now that the env file has been sourced.
DOMAIN="${DOMAIN_OVERRIDE:-${NEXUS_DOTNS_DOMAIN:-spacegame.dot}}"
BULLETIN_ENV="${BULLETIN_ENV_OVERRIDE:-${BULLETIN_ENV:-summit}}"
echo "  Network: $BULLETIN_ENV"
echo "  Domain:  $DOMAIN"
echo "  URL:     https://$DOMAIN.li"
# The product identifier is runtime-derived from window.location since Phase 7
# (handles both <label>.dot.li and <label>.app.dot.li schemes), so the env var
# is an optional override — but if it IS set, a mismatch with the deploy domain
# still means the host rejects signing on the deployed page.
if [ -n "${NEXT_PUBLIC_DOT_NS_IDENTIFIER:-}" ] && [ "$NEXT_PUBLIC_DOT_NS_IDENTIFIER" != "$DOMAIN" ]; then
    echo ""
    echo "  WARNING: NEXT_PUBLIC_DOT_NS_IDENTIFIER=$NEXT_PUBLIC_DOT_NS_IDENTIFIER"
    echo "           does not match deploy domain $DOMAIN."
    echo "           dot.li will reject host signing on the deployed page."
    echo "           Unset it to let the dApp derive the identifier at runtime."
fi
echo ""

# Build frontend (static export → frontend/out/)
echo "[1/2] Building frontend (static export)..."
cd "$ROOT_DIR/frontend"
npm install --silent
npm run build:static
echo "  Build output: frontend/out/"
echo ""

OUT_DIR="$ROOT_DIR/frontend/out"
if [ ! -d "$OUT_DIR" ]; then
    echo "ERROR: expected static output at $OUT_DIR but it doesn't exist."
    echo "Did 'npm run build:static' succeed? Check next.config.ts has STATIC_EXPORT handling."
    exit 1
fi

# Deploy to Bulletin Chain via @parity/polkadot-app-deploy.
#
# - --js-merkle: pure-JS CAR merkleization, so no IPFS Kubo binary is required.
# - No MNEMONIC needed if you've run `polkadot-app-deploy login` (QR sign-in);
#   if MNEMONIC is set it's used as the DotNS owner key instead.
# - 3 attempts: the tool has a 5-min WS heartbeat watchdog that kills the
#   connection if the Bulletin RPC pauses mid-upload; a fresh process gets a
#   fresh WS. (Pattern from Sovereignty/ignite deploy.yml.)
# - 8GB heap: WS-reconnect retries can OOM the default 2GB Node heap.
if [ -z "${MNEMONIC:-}" ]; then
    echo "  No MNEMONIC set — using the QR sign-in session."
    echo "  (If this fails with an auth error, run: npx -y @parity/polkadot-app-deploy login)"
    echo ""
fi
echo "[2/2] Deploying to Bulletin Chain (env: $BULLETIN_ENV)..."
export NODE_OPTIONS="--max-old-space-size=8192"
ATTEMPTS=3
for attempt in $(seq 1 $ATTEMPTS); do
    if MNEMONIC="${MNEMONIC:-}" npx -y '@parity/polkadot-app-deploy@^0.11.0' --env "$BULLETIN_ENV" --js-merkle "$OUT_DIR" "$DOMAIN"; then
        exit 0
    fi
    if [ "$attempt" -lt "$ATTEMPTS" ]; then
        echo ""
        echo "  Deploy attempt $attempt/$ATTEMPTS failed — retrying in 30s..."
        sleep 30
    fi
done
echo "ERROR: deploy failed after $ATTEMPTS attempts."
exit 1
