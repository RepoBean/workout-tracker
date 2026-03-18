#!/bin/bash

# Start Workout App (production mode)
# Usage: ./start.sh

set -e
cd "$(dirname "$0")"

echo "Building frontend..."
(cd frontend && npm run build)

echo "Building backend..."
(cd backend && npm run build)

echo ""
echo "Starting server on http://localhost:3002..."
cd backend && npm start
