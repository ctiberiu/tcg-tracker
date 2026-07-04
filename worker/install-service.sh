#!/usr/bin/env bash
#
# Installs a systemd timer that runs the scraper every 15 minutes — reliably,
# 24/7, with no dependency on GitHub Actions' (unreliable) cron.
# Run this AFTER bootstrap.sh and AFTER creating the .env file.
#
#   bash ~/tcg-tracker/worker/install-service.sh
#
set -euo pipefail

APP_DIR="$HOME/tcg-tracker"
SCRAPER_DIR="$APP_DIR/tcg-tracker/scraper"
ENV_FILE="$SCRAPER_DIR/.env"
NODE_BIN="$(command -v node)"
USER_NAME="$(whoami)"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Create it first:  cp $SCRAPER_DIR/.env.example $ENV_FILE  && nano $ENV_FILE"
  exit 1
fi

echo "==> Writing systemd unit files"
sudo tee /etc/systemd/system/tcg-scraper.service >/dev/null <<EOF
[Unit]
Description=TCG Tracker scraper (one-shot run)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$USER_NAME
WorkingDirectory=$SCRAPER_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN scraper.js
EOF

sudo tee /etc/systemd/system/tcg-scraper.timer >/dev/null <<EOF
[Unit]
Description=Run TCG scraper every 15 minutes

[Timer]
OnCalendar=*:0/15
# Randomized jitter (up to 3 min) so runs don't hit the exact same clock tick
# every time — a perfectly regular interval from one fixed IP is itself a
# detectable pattern. AccuracySec=1s keeps the delay from being coalesced away.
RandomizedDelaySec=180
AccuracySec=1s
Persistent=true

[Install]
WantedBy=timers.target
EOF

echo "==> Enabling timer"
sudo systemctl daemon-reload
sudo systemctl enable --now tcg-scraper.timer

echo ""
echo "==> Installed. Useful commands:"
echo "    systemctl list-timers tcg-scraper.timer     # when it next runs"
echo "    sudo systemctl start tcg-scraper.service    # run once right now"
echo "    journalctl -u tcg-scraper.service -f        # live logs"
