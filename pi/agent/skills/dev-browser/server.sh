#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Parse command line arguments
HEADLESS=false
DETACH=false
LOG_FILE="/tmp/dev-browser.log"
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --headless) HEADLESS=true ;;
        --detach) DETACH=true ;;
        --log)
            LOG_FILE="$2"
            shift
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

if [[ "$DETACH" == true ]]; then
    echo "Starting dev-browser server in background..."
    nohup bash -c "cd \"$SCRIPT_DIR\" && npm install && HEADLESS=$HEADLESS npx tsx scripts/start-server.ts" > "$LOG_FILE" 2>&1 </dev/null &
    echo "Dev-browser server started (PID $!)"
    echo "Log: $LOG_FILE"
    exit 0
fi

echo "Installing dependencies..."
npm install

echo "Starting dev-browser server..."
export HEADLESS=$HEADLESS
npx tsx scripts/start-server.ts
