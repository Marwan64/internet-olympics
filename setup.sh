#!/usr/bin/env bash
set -e

echo ""
echo "🏆 Internet Olympics — Setup Script"
echo "====================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install v18+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js v18+ required (found v${NODE_VERSION})"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# Backend
echo ""
echo "📦 Installing backend dependencies..."
cd backend
cp -n .env.example .env 2>/dev/null || true
npm install
echo "✅ Backend ready"
cd ..

# Frontend
echo ""
echo "📦 Installing frontend dependencies..."
cd frontend
cp -n .env.example .env.local 2>/dev/null || true
npm install
echo "✅ Frontend ready"
cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TO RUN LOCALLY (two terminals):"
echo ""
echo "  Terminal 1 (backend):"
echo "    cd backend && npm run dev"
echo ""
echo "  Terminal 2 (frontend):"
echo "    cd frontend && npm run dev"
echo ""
echo "  Then open: http://localhost:3000"
echo ""
echo "  TO RUN WITH DOCKER:"
echo "    docker compose up --build"
echo ""
echo "  Then open: http://localhost:3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
