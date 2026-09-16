#!/usr/bin/env bash
# Starts the CampusPulse API. Run from anywhere:  bash backend/start.sh
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env found — copying .env.example. Edit it with your PostgreSQL password!"
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  echo "Installing backend dependencies…"
  npm install
fi

npm run dev
