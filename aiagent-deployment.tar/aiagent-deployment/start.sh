#!/bin/bash

# AIAgent Application Startup Script
# This script starts the Express server with proper environment variables

# Exit on error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directory where the app is installed
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$APP_DIR/app.log"
PID_FILE="$APP_DIR/app.pid"

echo -e "${YELLOW}Starting AIAgent Application...${NC}"

# Check if app is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo -e "${RED}Application is already running (PID: $OLD_PID)${NC}"
        exit 1
    fi
fi

# Load environment variables
if [ -f "$APP_DIR/.env.production" ]; then
    export $(cat "$APP_DIR/.env.production" | xargs)
else
    echo -e "${RED}Error: .env.production file not found!${NC}"
    exit 1
fi

# Start the application
cd "$APP_DIR"
nohup node dist/index.cjs > "$LOG_FILE" 2>&1 &
APP_PID=$!
echo $APP_PID > "$PID_FILE"

echo -e "${GREEN}Application started successfully (PID: $APP_PID)${NC}"
echo -e "${GREEN}Log file: $LOG_FILE${NC}"
echo -e "${YELLOW}Access the app at: http://3.208.52.220/aiagent/${NC}"
