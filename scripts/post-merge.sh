#!/bin/bash
set -e

# Install frontend dependencies (yarn)
cd frontend && yarn install --frozen-lockfile 2>/dev/null || yarn install
cd ..

# Install backend Python dependencies (if requirements.txt changed)
if [ -f backend/requirements.txt ]; then
  pip install --user -r backend/requirements.txt --quiet 2>/dev/null || true
fi

echo "Post-merge setup complete"
