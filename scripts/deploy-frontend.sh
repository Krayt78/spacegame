#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse flags
DOMAIN=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain|-d) DOMAIN="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--domain <name.dot>]"
            echo ""
            echo "Builds the Nexus Protocol frontend as a static export and"
            echo "deploys it to IPFS via the Polkadot Bulletin Chain. Registers"
            echo "or updates the DotNS record so https://<name>.dot.li resolves"
            echo "to the new CID."
            exit 0
            ;;
        *) echo "Unknown argument: $1"; echo "Usage: $0 [--domain <name.dot>]"; exit 1 ;;
    esac
done

# Domain to deploy to — flag > env var > default
DOMAIN="${DOMAIN:-${NEXUS_DOTNS_DOMAIN:-nexusprotocol00.dot}}"

echo "=== Deploy Nexus Protocol Frontend to Bulletin Chain ==="
echo "  Domain: $DOMAIN"
echo "  URL:    https://$DOMAIN.li"
echo ""

# Check prerequisites
if ! command -v bulletin-deploy &>/dev/null; then
    echo "ERROR: bulletin-deploy not installed."
    echo "Run: npm install -g bulletin-deploy"
    exit 1
fi

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

# Deploy to Bulletin Chain
echo "[2/2] Deploying to Bulletin Chain..."
if [ -n "${MNEMONIC:-}" ]; then
    MNEMONIC="$MNEMONIC" bulletin-deploy "$OUT_DIR" "$DOMAIN"
else
    bulletin-deploy "$OUT_DIR" "$DOMAIN"
fi
