#!/bin/bash

# Deploy script for MHC Squad Tracker (hockey-2026)
# Usage:
#   ./deploy.sh              → build + deploy frontend to PROD
#   ./deploy.sh --uat        → build + deploy frontend to UAT
#   ./deploy.sh --all        → build + deploy frontend + functions to PROD
#   ./deploy.sh --all --uat  → build + deploy frontend + functions to UAT
#   ./deploy.sh --functions  → deploy both Cloud Functions to PROD
#   ./deploy.sh --functions --uat  → deploy both Cloud Functions to UAT
#   ./deploy.sh --fn syncHv  → deploy single function to PROD
#   ./deploy.sh --fn syncHv --uat  → deploy single function to UAT
#   ./deploy.sh --rules      → deploy Firestore rules to PROD only

set -e

ACCOUNT_EMAIL="steve.g.waters@gmail.com"
DEPLOY_FRONTEND=true
DEPLOY_RULES=true
DEPLOY_FUNCTIONS=false
SINGLE_FN=""
UAT=false

# Parse args
for arg in "$@"; do
  case $arg in
    --all)       DEPLOY_FRONTEND=true; DEPLOY_FUNCTIONS=true; DEPLOY_RULES=false ;;
    --rules)     DEPLOY_FRONTEND=false; DEPLOY_RULES=true ;;
    --uat)       UAT=true; DEPLOY_RULES=false ;;
    --functions) DEPLOY_FRONTEND=false; DEPLOY_RULES=false; DEPLOY_FUNCTIONS=true ;;
    --fn)        DEPLOY_FRONTEND=false; DEPLOY_RULES=false; DEPLOY_FUNCTIONS=true ;;
    syncHv|syncLadder|syncUnavailability|confirmUnavailabilitySync) SINGLE_FN=$arg ;;
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

# ── Cloud Functions ───────────────────────────────────────────────────
if [ "$DEPLOY_FUNCTIONS" = true ]; then
  if [ -n "$SINGLE_FN" ]; then
    FN_TARGET="functions:$SINGLE_FN"
    echo "⚡ Deploying function: $SINGLE_FN"
  else
    FN_TARGET="functions"
    echo "⚡ Deploying all Cloud Functions..."
  fi

  if [ "$UAT" = true ]; then
    echo "🧪 Target: UAT"
    firebase deploy --only "$FN_TARGET" --project uat
    echo "✅ Function(s) deployed to UAT."
  else
    echo "🚀 Target: PROD"
    firebase deploy --only "$FN_TARGET" --project prod
    echo "✅ Function(s) deployed to PROD."
  fi
  echo ""
fi

echo "🎉 Deploy complete!"
echo ""
