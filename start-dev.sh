#!/bin/bash

# Start Workout App (frontend + backend)
# Usage: ./start-dev.sh

cd "$(dirname "$0")"

echo "Starting backend on http://localhost:3002..."
(cd backend && npm run dev) &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:5174..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "✓ App running:"
echo "  Frontend: http://localhost:5174"
echo "  Backend:  http://localhost:3002"
echo ""
echo "Press Ctrl+C to stop both servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
