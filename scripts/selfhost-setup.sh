#!/usr/bin/env bash
# open-seo self-host setup — run INSIDE a Codespace on JStrain1/open-seo.
#
# Does everything tedious for you:
#   - installs deps (Node 22.6+)
#   - Cloudflare auth + bootstrap (you authorize once in the browser)
#   - takes your DataForSEO key from a HIDDEN prompt (paste the ready-made
#     Base64, OR enter login+password and it encodes for you), writes
#     .env.selfhost  (the secret never leaves this box)
#   - deploys to Cloudflare
#
# Usage:  bash scripts/selfhost-setup.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "==> [1/5] Node + dependencies"
corepack enable || true
if ! node -e 'process.exit((process.versions.node.split(".").map(Number)[0]||0) >= 22 ? 0 : 1)' 2>/dev/null; then
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"; nvm install 22; nvm use 22
  else
    echo "!! Node 22.6+ required. Switch Node versions and re-run." >&2; exit 1
  fi
fi
pnpm install

echo "==> [2/5] Cloudflare login (a URL/browser will appear — authorize it, and enable the access:write scope)"
pnpm alchemy login
pnpm alchemy cloudflare bootstrap

echo "==> [3/5] DataForSEO credential"
echo "    If DataForSEO gave you a ready-made Base64 string (in the credentials email or on the"
echo "    API Access page), paste it now. Otherwise leave it blank to enter login + password."
echo "    Input is hidden and stays in this Codespace — written straight into .env.selfhost."
read -rsp "    DataForSEO Base64 credential (or blank): " DFS_B64; echo
if [ -z "${DFS_B64}" ]; then
  read -rp  "    DataForSEO API login (email): " DFS_LOGIN
  read -rsp "    DataForSEO API password: " DFS_PASS; echo
  DFS_B64="$(printf '%s' "${DFS_LOGIN}:${DFS_PASS}" | base64)"
  unset DFS_PASS
fi
DFS_B64="$(printf '%s' "$DFS_B64" | tr -d '[:space:]')"   # strip stray whitespace/newlines from a paste

read -rp "    Login email for Cloudflare Access [josh@sortedmate.com]: " ACCESS_EMAIL
ACCESS_EMAIL="${ACCESS_EMAIL:-josh@sortedmate.com}"

echo "==> [4/5] Writing .env.selfhost"
[ -f .env.selfhost ] || cp .env.selfhost.example .env.selfhost
{
  grep -vE '^(DATAFORSEO_API_KEY|ACCESS_ALLOWED_EMAILS)=' .env.selfhost 2>/dev/null || true
  echo "DATAFORSEO_API_KEY=${DFS_B64}"
  echo "ACCESS_ALLOWED_EMAILS=${ACCESS_EMAIL}"
} > .env.selfhost.tmp && mv .env.selfhost.tmp .env.selfhost
unset DFS_B64
echo "    done (.env.selfhost is git-ignored — it will not be committed/pushed)."

echo "==> [5/5] Deploying to Cloudflare"
pnpm deploy:selfhost --yes

echo ""
echo "==> Finished. Open the Worker URL printed above and sign in via Cloudflare Access."
echo "    Then tell Claude and it will verify D1 / KV / R2 / Workers via the connector."
