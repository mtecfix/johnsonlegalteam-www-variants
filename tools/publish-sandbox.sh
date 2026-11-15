#!/usr/bin/env bash
# Publish the sandbox to GitHub Pages via the gh-pages branch (branch-based Pages).
# Uses the same exclude list as .github/workflows/deploy-pages.yml so backend files never get published.
# Usage: GITHUB_TOKEN=... tools/publish-sandbox.sh
set -euo pipefail
: "${GITHUB_TOKEN:?GITHUB_TOKEN must be set}"
REPO_URL="https://github.com/mtecfix/johnsonlegalteam-www-variants"
ROOT="$(git rev-parse --show-toplevel)"
SRC_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

# Pull the --exclude list straight from the workflow so the two never drift apart.
mapfile -t EXCLUDES < <(grep -oE "\-\-exclude '[^']+'" "$ROOT/.github/workflows/deploy-pages.yml" | sed -E "s/--exclude '([^']+)'/--exclude=\1/")
[ "${#EXCLUDES[@]}" -gt 5 ] || { echo "exclude list not found in workflow" >&2; exit 1; }
rsync -a "${EXCLUDES[@]}" --exclude=tools "$ROOT/" "$BUILD/"
touch "$BUILD/.nojekyll"

for forbidden in lambda docs api .env.example user-profiles-schema.sql portal-api; do
  [ ! -e "$BUILD/$forbidden" ] || { echo "refusing to publish: $forbidden present" >&2; exit 1; }
done

cd "$BUILD"
git init -q -b gh-pages
git -c user.name=mtecfix -c user.email=mtecfix@users.noreply.github.com add -A
git -c user.name=mtecfix -c user.email=mtecfix@users.noreply.github.com commit -q -m "Publish sandbox from main@${SRC_SHA}"
git push -q --force "https://x-access-token:${GITHUB_TOKEN}@${REPO_URL#https://}" gh-pages:gh-pages
echo "published main@${SRC_SHA} to gh-pages"
