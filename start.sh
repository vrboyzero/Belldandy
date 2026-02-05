#!/bin/bash

echo "[Belldandy Launcher] Initialization..."

# Check Node
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found. Please install Node.js v22+"
    exit 1
fi

# Check PNPM
if ! command -v pnpm &> /dev/null; then
    echo "[INFO] pnpm not found. Enabling via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
fi

# Install Dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing dependencies..."
    corepack pnpm install
fi

# Generate Token
export SETUP_TOKEN="setup-$(date +%s)-${RANDOM}"
export AUTO_OPEN_BROWSER="true"

# Force Server to use this token
export BELLDANDY_AUTH_MODE="token"
export BELLDANDY_AUTH_TOKEN="$SETUP_TOKEN"

echo "[INFO] Magic Token: $SETUP_TOKEN"

while true; do
    echo ""
    echo "[Belldandy Launcher] Starting Gateway..."
    echo ""

    # Load .env.local if exists (to pick up saved settings)
    if [ -f ".env.local" ]; then
        echo "[INFO] Loading .env.local..."
        set -o allexport
        source .env.local
        set +o allexport
    fi

    corepack pnpm dev:gateway
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 100 ]; then
        echo ""
        echo "[Belldandy Launcher] Restarting requested..."
        sleep 2
    else
        echo ""
        echo "[Belldandy Launcher] Gateway exited (code $EXIT_CODE)."
        break
    fi
done
