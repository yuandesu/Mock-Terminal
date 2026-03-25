#!/bin/bash
# deploy.sh — Commit and push to GitHub
# Usage: ./deploy.sh "your commit message"
#        ./deploy.sh              (uses auto-generated message)

set -e

cd "$(dirname "$0")"

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "Error: not a git repository. Run 'git init' first."
  exit 1
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to commit, working tree clean."
  exit 0
fi

MSG="${1:-update $(date '+%Y-%m-%d %H:%M')}"

git add .
git commit -m "$MSG"
git push
echo ""
echo "✓ Deployed: $MSG"
