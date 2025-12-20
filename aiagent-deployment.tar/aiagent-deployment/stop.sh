#!/bin/bash

# Stop script for AIAgent Application

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$APP_DIR/app.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        rm "$PID_FILE"
        echo "Application stopped successfully"
    else
        echo "Application is not running"
        rm "$PID_FILE"
    fi
else
    echo "PID file not found. Application may not be running."
fi
