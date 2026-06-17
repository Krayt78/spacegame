#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse flags
DOMAIN=""
ENV_FILE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain|-d) DOMAIN="$2"; shift 2 ;;
        --env|-e) ENV_FILE="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--domain <name.dot>] [--env <file>]"
            echo ""
            echo "Builds the Nexus Protocol frontend as a static export and"
            echo "deploys it to IPFS via the Polkadot Bulletin Chain. Registers"
            echo "or updates the DotNS record so https://<name>.dot.li resolves"
            echo "to the new CID."
            echo ""
            echo "  --domain <name.dot>   DotNS basename (default: spacegame.dot)"
            echo "  --env <file>          env file to source for the build"
            echo "                        (default: frontend/.env.testnet, falling back"
            echo "                        to frontend/.env.production if testnet missing)"
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

echo "=== Deploy Nexus Protocol Frontend to Bulletin Chain ==="
echo ""

# bulletin-deploy is invoked through npx with a >=0.7.12 pin (see [2/2]):
# Bulletin Chain switched to an expiration-based authorization model on
# 2026-05-07 (paritytech/bulletin-deploy#263) and older releases fail with
# "Authorization was finalized but not applied". npx ignores any stale
# global install, so there's no version to check here.

# Check prerequisites
if ! command -v ipfs &>/dev/null; then
    echo "ERROR: IPFS Kubo not installed (required by bulletin-deploy)."
    echo "Linux: see https://docs.ipfs.tech/install/command-line/"
    echo "macOS: brew install ipfs && ipfs init"
    exit 1
fi

# Read MNEMONIC from hardhat vars if not set in environment.
HARDHAT_VARS_FILE="${HARDHAT_VARS_FILE:-}"
if [ -z "${HARDHAT_VARS_FILE:-}" ]; then
    HARDHAT_VARS_FILE="$(
        node -e "const fs=require('fs');const os=require('os');const path=require('path');const home=os.homedir();const cand=[process.env.HARDHAT_VARS_FILE,path.join(home,'Library/Preferences/hardhat-nodejs/vars.json'),path.join(home,'.config/hardhat-nodejs/vars.json')].filter(Boolean);for(const p of cand){try{fs.accessSync(p,fs.constants.R_OK);process.stdout.write(p);process.exit(0);}catch{}}"
    )"
fi

if [ -z "${MNEMONIC:-}" ] && [ -n "${HARDHAT_VARS_FILE:-}" ] && [ -f "$HARDHAT_VARS_FILE" ]; then
    MNEMONIC=$(node -e "try{const v=require('$HARDHAT_VARS_FILE');process.stdout.write(v.vars.MNEMONIC??'')}catch(e){}" 2>/dev/null || true)
fi

# Resolve which env file to bake into the static build.
if [ -z "$ENV_FILE" ]; then
    if [ -f "$ROOT_DIR/frontend/.env.testnet" ]; then
        ENV_FILE="$ROOT_DIR/frontend/.env.testnet"
    elif [ -f "$ROOT_DIR/frontend/.env.production" ]; then
        ENV_FILE="$ROOT_DIR/frontend/.env.production"
    fi
fi

if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
    echo "[0/2] Sourcing env vars from $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
else
    echo "[0/2] No env file found — contract addresses must already be in your shell."
    echo "      The build will fail with 'CONTRACTS NOT CONFIGURED' if NEXT_PUBLIC_NEXUS_GAME_ADDRESS"
    echo "      and NEXT_PUBLIC_GAME_CONFIG_ADDRESS aren't set."
fi
echo ""

# Resolve deploy domain now that the env file has been sourced.
DOMAIN="${DOMAIN_OVERRIDE:-${NEXUS_DOTNS_DOMAIN:-spacegame.dot}}"
echo "  Domain: $DOMAIN"
echo "  URL:    https://$DOMAIN.li"
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

# Deploy to Bulletin Chain.
#
# - npx pin '>=0.7.12': Bulletin's expiration-based auth model (2026-05-07);
#   older releases fail with "Authorization was finalized but not applied".
# - 3 attempts: bulletin-deploy hard-codes a 5-min WS heartbeat watchdog that
#   kills the connection if the Bulletin RPC pauses mid-upload; a fresh process
#   gets a fresh WS. (Pattern from Sovereignty/ignite deploy.yml.)
# - 8GB heap: WS-reconnect retries can OOM the default 2GB Node heap with
#   buffered subscription state.
echo "[2/2] Deploying to Bulletin Chain..."
export NODE_OPTIONS="--max-old-space-size=8192"
ATTEMPTS=3
for attempt in $(seq 1 $ATTEMPTS); do
    if MNEMONIC="${MNEMONIC:-}" npx -y 'bulletin-deploy@>=0.7.12' "$OUT_DIR" "$DOMAIN"; then
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
