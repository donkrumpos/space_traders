# Themisto Runbook — Space Traders Deploy (M5)

Deployed 2026-07-08. The game lives at **https://siegeperilousstudio.com**.

## The one-screen version

| What | Where |
|---|---|
| Game URL | https://siegeperilousstudio.com (first visit asks pilot name + family secret) |
| Family secret | NOT in this public repo — read it on themisto: `grep FAMILY_SECRET /etc/systemd/system/space-traders.service` (change it there, then `daemon-reload` + restart). Since 2026-09-02 the server **refuses to start** if the env var is missing (no more dev-secret fallback) |
| VPS | themisto = ServaRica, `162.250.190.20`, ssh port `3465`, user `don` |
| Ssh from any of Foggy's machines | `ssh themisto` (Host block in `~/.ssh/config`; key auth only) |
| Game files | `/var/www/siegeperilous` (git checkout of donkrumpos/space_traders, main) |
| World database | `/var/lib/space-traders/world.db` (SQLite; pilots, world snapshot, save backups) |
| Service | `space-traders.service` (systemd, runs as don, node on `127.0.0.1:8378`) |
| Web tier | Apache vhost `siegeperilousstudio.com.conf` — static files + `/ws` → `mod_proxy_wstunnel` → node |
| TLS | Let's Encrypt via certbot (`--apache`), auto-renews |

## Update the game (after new commits on main)

```bash
ssh themisto 'cd /var/www/siegeperilous && git pull && npm install --omit=dev --no-audit --no-fund && sudo systemctl restart space-traders'
```

Static files are picked up on page reload; the restart only matters when
`server/` or `js/sim/` changed. Player saves and the world live in
`/var/lib/space-traders/world.db`, outside the repo — updates never touch them.

## Service management

```bash
ssh themisto 'systemctl status space-traders'          # is it up
ssh themisto 'sudo journalctl -u space-traders -n 50'  # logs (one line per connect/save)
ssh themisto 'sudo systemctl restart space-traders'    # restart (players auto-reconnect ≤30s)
```

If the server is down, the game still works — every client falls back to
offline solo on its local save and syncs back up on reconnect.

Supervision: the unit already has `Restart=always` + `RestartSec=3`, so a
crashed node process comes back on its own; systemd also starts it on boot
(`WantedBy=multi-user.target`). `journalctl -u space-traders` is the crash
history.

## Backups (added 2026-09-02)

Two layers, no credentials on the VPS:

1. **On-box, daily** — don's crontab runs the repo's backup script (SQLite
   online-backup API, safe against a live server; never copy `world.db` +
   `-wal` by hand):

   ```
   17 3 * * * cd /var/www/siegeperilous && /usr/bin/node server/backup.mjs >> /var/lib/space-traders/backup.log 2>&1
   ```

   Output: `/var/lib/space-traders/backups/world-YYYYMMDD-HHMMSS.db.gz`,
   rotated to the newest 30 (`BACKUP_KEEP` env to change).

2. **Off-box, daily pull** — Foggy's Mac pulls the backup dir via the
   existing `themisto` ssh alias (launchd agent
   `~/Library/LaunchAgents/com.spacetraders.backup-pull.plist`, runs at
   09:00 or on next wake):

   ```bash
   rsync -az themisto:/var/lib/space-traders/backups/ ~/Backups/space-traders/
   ```

   Check it's alive: `ls -la ~/Backups/space-traders/` — newest file should
   be ≤ a day or two old whenever the laptop has been awake.

**Restore:** `sudo systemctl stop space-traders`, then
`gunzip -c world-<stamp>.db.gz > /var/lib/space-traders/world.db` (remove any
stale `world.db-wal`/`-shm` first), then start. Pilot saves also have
last-20 rotating backups inside the db itself (`backups` table).

## Changing the family secret

Edit `/etc/systemd/system/space-traders.service` → `Environment=FAMILY_SECRET=...`,
then `sudo systemctl daemon-reload && sudo systemctl restart space-traders`.
Each browser re-prompts on next connect (or visit once with `?secret=NEWSECRET`).

## DNS (as of 2026-07-08)

- `siegeperilousstudio.com` — **Hover** DNS: `A @ → 162.250.190.20`. No `www`
  record yet; add `A www → 162.250.190.20` and re-run certbot with
  `-d siegeperilousstudio.com -d www.siegeperilousstudio.com` if wanted.
- `cal.yonderartland.com` — **Cloudflare** (yonderartland.com zone):
  `A cal → 162.250.190.20`, **DNS only (grey cloud)** — keep it grey or
  Let's Encrypt renewals break. This record was lost in the June 2026
  Cloudflare nameserver move, which silently killed calendar sync from
  2026-05-21 until re-added 2026-07-08.

## Access recovery (learned the hard way, 2026-07-08)

The box only accepts **key auth** (`PasswordAuthentication` off, `PermitRootLogin` off).

- **Any machine with a GitHub-registered key gets in**: don's
  `authorized_keys` includes the output of `https://github.com/donkrumpos.keys`.
  New machine → add its key to GitHub → from an existing session run
  `curl -s https://github.com/donkrumpos.keys >> /home/don/.ssh/authorized_keys`.
- **Locked out completely**: ServaRica panel → reset root password → open the
  VNC/HTML5 console (it has a paste-to-VM box) → log in as root at the
  console (console login is unaffected by the sshd root ban) → re-run the
  curl line above.
- Host key changes after a provider rebuild will trip
  `REMOTE HOST IDENTIFICATION HAS CHANGED` on Macs with stale entries:
  `ssh-keygen -R "[162.250.190.20]:3465"` then reconnect — but verify the box
  is really ours first (e.g. carolemmons.net still serves from that IP with a
  valid cert).
- `don` has passwordless sudo via `/etc/sudoers.d/don-nopasswd` (added for
  automated deploys 2026-07-08; delete that file to require passwords again).

## What else lives on themisto (don't break it)

Debian 12, 4 cores / 10G RAM. Apache serves ~12 vhosts (carolemmons.net,
donkrumpos.com, stormroot.quest, widdershins.ink, understory.ink, yndr.art,
catandgrin.com, krumpos.org, wildkrumpos.com, yonderartland legacy, cal.*),
plus MariaDB + PHP-FPM (WordPress sites), exim4, fail2ban, and **Radicale**
(the family CalDAV server — `radicale.service`, storage git-synced to
github.com/donkrumpos/family-calendar every 15 min via cron).

The game's idle cost is ~nil: the world sim fully sleeps when no pilots are
connected.

## First-visit setup on a family machine

1. Open https://siegeperilousstudio.com
2. Pilot name: `Dad` or `Arthur` (this is the save identity — pick once, keep it)
3. Family secret: the one in the systemd unit (see table above — Dad knows it)
4. An existing local save uploads as that pilot's server character on first
   connect; afterwards the newest save wins across machines (a backup is
   written before any overwrite, both server-side and in the browser).
