#!/bin/bash

# Deploy script for MHC Squad Tracker (hockey-2026)
# Usage:
#   ./deploy.sh           → build + deploy to PROD (hosting + firestore rules)
#   ./deploy.sh --uat     → build + deploy to UAT (hosting only)
#   ./deploy.sh --rules   → deploy firestore rules to prod only

set -e

ACCOUNT_EMAIL="steve.g.waters@gmail.com"
DEPLOY_FRONTEND=true
DEPLOY_RULES=true
UAT=false

# Parse args
for arg in "$@"; do
  case $arg in
    --rules) DEPLOY_FRONTEND=false; DEPLOY_RULES=true ;;
    --uat)   UAT=true; DEPLOY_RULES=false ;;
  esac
done

echo ""
echo "🏑  MHC Squad Tracker — Deploy"
echo "================================"

if [ "$UAT" = true ]; then
  echo "🧪 Target: UAT"
else
  echo "🚀 Target: PROD"
fi
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
  if [ "$UAT" = true ]; then
    echo "📦 Building frontend (UAT)..."
    npm run build -- --mode uat

    echo "🚀 Deploying to Firebase Hosting (UAT)..."
    firebase deploy --only hosting:uat --project uat

    echo "✅ UAT frontend deployed."
    echo "🌐 UAT app: https://hockey-2026-uat.web.app"
  else
    echo "📦 Building frontend (PROD)..."
    npm run build

    echo "🚀 Deploying to Firebase Hosting (PROD)..."
    firebase deploy --only hosting:prod --project prod

    echo "✅ PROD frontend deployed."
    echo "🌐 Live app: https://hockey-2026-f521f.web.app"
  fi
  echo ""
fi

# ── Firestore Rules (prod only) ───────────────────────────────────────
if [ "$DEPLOY_RULES" = true ]; then
  echo "🔒 Deploying Firestore rules (PROD)..."
  firebase deploy --only firestore:rules --project prod

  echo "✅ Firestore rules deployed."
  echo ""
fi

echo "🎉 Deploy complete!"
echo ""
