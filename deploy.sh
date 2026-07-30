#!/bin/bash
set -e

# ImageQuiz Deploy Script（零依賴 Node app：無 npm install、無 build step）
# Usage:
#   ./deploy.sh                      — full deploy (bump + rsync + pm2 restart)
#   ./deploy.sh [major|minor|patch]  — force version bump level
#   不在同網路時：REMOTE_HOST=100.85.142.38 ./deploy.sh

REMOTE_USER="${REMOTE_USER:-gary}"
REMOTE_HOST="${REMOTE_HOST:-192.168.1.11}"
REMOTE_DIR="/Users/gary/imagequiz-dist"
PORT=3025
PM2_NAME="imagequiz"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_OPTS="-i $SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=no"
BUMP=""

for arg in "$@"; do
  case "$arg" in
    major|minor|patch) BUMP=$arg ;;
  esac
done

cd "$(dirname "$0")"

# ── 前置檢查 ──────────────────────────────────────────────────
echo "🧪 [0/4] Syntax check…"
node --check server.js
for f in public/js/*.js; do node --check "$f"; done

# ── Version bump (SemVer) ────────────────────────────────────
CURRENT_VER=$(node -p "require('./package.json').version")

if [ -z "$BUMP" ]; then
  LAST_TAG=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo "")
  SUBJECTS=$(git log ${LAST_TAG:+$LAST_TAG..}HEAD --pretty=%s 2>/dev/null || echo "")
  BUMP=patch
  echo "$SUBJECTS" | grep -qE '^(breaking:|[a-z]+(\([^)]*\))?!:)' && BUMP=major
  if [ "$BUMP" = "patch" ]; then
    echo "$SUBJECTS" | grep -qE '^feat(\([^)]*\))?:' && BUMP=minor
  fi
fi

IFS=. read -r MA MI PA <<< "$CURRENT_VER"
PA=${PA:-0}
case "$BUMP" in
  major) MA=$((MA+1)); MI=0; PA=0 ;;
  minor) MI=$((MI+1)); PA=0 ;;
  *)     PA=$((PA+1)) ;;
esac
NEXT_VER="$MA.$MI.$PA"
BUILD=$(( $(git rev-list --count HEAD 2>/dev/null || echo 0) + 1 ))

sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEXT_VER\"/" package.json
sed -i '' "s/\"build\": \"[^\"]*\"/\"build\": \"$BUILD\"/" package.json
echo "🔢 Version: v$CURRENT_VER → v$NEXT_VER ($BUMP) | Build: $BUILD"

# ── Git commit + push ────────────────────────────────────────
echo "📝 [1/4] Committing to git…"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "deploy ImageQuiz v$NEXT_VER (build $BUILD) $(date '+%Y-%m-%d %H:%M')"
  git tag "v$NEXT_VER"
fi
if git remote | grep -q origin; then
  git push origin main --tags 2>/dev/null || echo "   (git push skipped)"
fi

# ── rsync（只送 runtime 檔；.env 與 DB 留在 MBP 不覆蓋）────────
echo "📦 [2/4] Syncing to MBP…"
ssh $SSH_OPTS $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"
rsync -az --delete -e "ssh $SSH_OPTS" \
  --exclude '.DS_Store' \
  server.js package.json ./public \
  $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

# ── PM2 restart ──────────────────────────────────────────────
echo "🚀 [3/4] Restarting PM2…"
ssh $SSH_OPTS $REMOTE_USER@$REMOTE_HOST "
  zsh -lic '
  export NVM_DIR=\"\$HOME/.nvm\"; source \$NVM_DIR/nvm.sh
  mkdir -p \$HOME/db/imagequiz
  cd $REMOTE_DIR
  PORT=$PORT pm2 restart $PM2_NAME --update-env 2>/dev/null || \
    PORT=$PORT pm2 start $REMOTE_DIR/server.js --name $PM2_NAME --cwd $REMOTE_DIR
  pm2 save --force
  '
"

# ── Verify ───────────────────────────────────────────────────
echo "🔍 [4/4] Verifying…"
sleep 2
HEALTH=$(ssh $SSH_OPTS $REMOTE_USER@$REMOTE_HOST "curl -s http://127.0.0.1:$PORT/api/health" || echo "")
echo "   $HEALTH"
echo "$HEALTH" | grep -q "\"version\":\"$NEXT_VER\"" || { echo "❌ 線上版本不符（期望 $NEXT_VER）"; exit 1; }

echo ""
echo "✅ Deploy complete → ImageQuiz v$NEXT_VER (port $PORT) → https://imagequiz.visadelab.xyz"
