#!/usr/bin/env bash
#
# One-time setup for the always-on scraper worker (Oracle/Hetzner/Pi/any Linux).
# Installs Node 20, the scraper's deps, Playwright Chromium, and a swap file on
# low-RAM boxes. Idempotent — safe to re-run (e.g. to pull latest code).
#
# Usage on a fresh box:
#   sudo apt-get update && sudo apt-get install -y git
#   git clone https://github.com/ctiberiu/tcg-tracker.git ~/tcg-tracker
#   bash ~/tcg-tracker/worker/bootstrap.sh
#
set -euo pipefail

APP_DIR="$HOME/tcg-tracker"
SCRAPER_DIR="$APP_DIR/tcg-tracker/scraper"

echo "==> Base packages"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates

echo "==> Swap (Chromium needs headroom on small-RAM boxes)"
total_mb=$(free -m | awk '/^Mem:/{print $2}')
if [ "$total_mb" -lt 2048 ] && ! sudo swapon --show | grep -q '/swapfile'; then
  echo "    RAM ${total_mb}MB < 2048MB -> creating 2G swapfile"
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "    OK (RAM ${total_mb}MB, or swap already present)"
fi

echo "==> Node.js 20"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "    node $(node -v)"

echo "==> Repo"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone https://github.com/ctiberiu/tcg-tracker.git "$APP_DIR"
fi

echo "==> Scraper dependencies"
cd "$SCRAPER_DIR"
npm ci

echo "==> Playwright Chromium + system libraries"
npx playwright install --with-deps chromium

echo ""
echo "==> Bootstrap complete."
echo "    Next:"
echo "      1) cp $SCRAPER_DIR/.env.example $SCRAPER_DIR/.env   # then fill in secrets"
echo "      2) bash $APP_DIR/worker/install-service.sh          # enable the 15-min timer"
