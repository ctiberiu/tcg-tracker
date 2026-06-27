# Always-on scraper worker

Runs the TCG scraper every 15 minutes on a small Linux box (Oracle Free Tier,
Hetzner, Raspberry Pi, etc.) using a systemd timer — reliable, unlike GitHub
Actions' scheduled cron. The same box will later host the purchase bot.

## Runbook

SSH into the box first:

```bash
chmod 600 /path/to/ssh-key.key            # on your laptop, once
ssh -i /path/to/ssh-key.key ubuntu@<PUBLIC_IP>
```

Then, on the box:

```bash
# 1. Install git, clone the repo
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/ctiberiu/tcg-tracker.git ~/tcg-tracker

# 2. Install Node, deps, Playwright, swap (idempotent)
bash ~/tcg-tracker/worker/bootstrap.sh

# 3. Create the secrets file (same values as the GitHub Actions secrets)
cp ~/tcg-tracker/tcg-tracker/scraper/.env.example ~/tcg-tracker/tcg-tracker/scraper/.env
nano ~/tcg-tracker/tcg-tracker/scraper/.env        # fill in SUPABASE_*, GMAIL_*

# 4. Run once to confirm it works end-to-end
cd ~/tcg-tracker/tcg-tracker/scraper && set -a && . ./.env && set +a && node scraper.js

# 5. Install the 15-minute timer
bash ~/tcg-tracker/worker/install-service.sh
```

## Operating it

```bash
systemctl list-timers tcg-scraper.timer    # next scheduled run
sudo systemctl start tcg-scraper.service   # trigger a run now
journalctl -u tcg-scraper.service -f       # follow logs
journalctl -u tcg-scraper.service -n 50    # last 50 log lines
```

## Updating to latest code

```bash
cd ~/tcg-tracker && git pull
cd tcg-tracker/scraper && npm ci
```

## Notes

- `.env` lives only on the box; it is gitignored and never committed.
- On a 1 GB box, `bootstrap.sh` adds a 2 GB swap file so Chromium has headroom.
- Once this is stable, GitHub Actions can stay as a free manual-trigger fallback,
  or its `schedule:` can be removed to avoid duplicate runs.
