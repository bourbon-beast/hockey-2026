#!/bin/bash

# Deploy script for MHC Squad Tracker (hockey-2026)
# Usage:
#   ./deploy.sh           → build + deploy frontend (hosting) + firestore rules
#   ./deploy.sh --rules   → deploy firestore rules only

set -e

ACCOUNT_EMAIL="steve.g.waters@gmail.com"
DEPLOY_FRONTEND=true
DEPLOY_RULES=true

# Parse args
for arg in "$@"; do
  case $arg in
    --rules) DEPLOY_FRONTEND=false; DEPLOY_RULES=true ;;
  esac
done

echo ""
echo "🏑  MHC Squad Tracker — Deploy"
echo "================================"
echo ""

# Set Google account
echo "🔐 Setting Google account to $ACCOUNT_EMAIL..."
gcloud config set account $ACCOUNT_EMAIL

if ! gcloud auth list --filter="status:ACTIVE" --format="value(account)" | grep -q "$ACCOUNT_EMAIL"; then
  echo "🔑 Account not authenticated. Running gcloud auth login..."
  gcloud auth login $ACCOUNT_EMAIL
fi

# ── Frontend ──────────────────────────────────────────────────────────
if [ "$DEPLOY_FRONTEND" = true ]; then
  echo "📦 Building frontend..."
  npm run build

  echo "🚀 Deploying to Firebase Hosting..."
  firebase deploy --only hosting

  echo "✅ Frontend deployed."
  echo ""
fi

# ── Firestore Rules ──────────────────────────────────────────────────
if [ "$DEPLOY_RULES" = true ]; then
  echo "🔒 Deploying Firestore rules..."
  firebase deploy --only firestore:rules

  echo "✅ Firestore rules deployed."
  echo ""
fi

echo "🎉 Deploy complete!"
echo "🌐 Live app: https://hockey-2026-f521f.web.app"
echo ""
