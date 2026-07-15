#!/usr/bin/env bash
# ATTS relay TLS front (step 2 of 2). Gives the relay a REAL https URL on a bare-IP droplet using
# Caddy + sslip.io (no domain needed). Run:  curl -sL .../relay/tls.sh | sudo bash
set -euo pipefail
IP=$(curl -s https://ifconfig.me || curl -s https://api.ipify.org)
NAME="${IP//./-}.sslip.io"
echo "== droplet IP: $IP  ->  https://$NAME =="
# relay alive locally?
if ! curl -s -m 5 -X POST http://127.0.0.1:8787 -d x | grep -q 'not a snapshot'; then
  echo "!! relay not answering on 127.0.0.1:8787 — run setup.sh first (systemctl status atts-relay)"; exit 1
fi
# open web ports if ufw is active
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; echo "ufw: opened 80/443"; fi
# install caddy (official repo)
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update >/dev/null && apt-get install -y caddy >/dev/null
fi
printf '%s {\n  reverse_proxy 127.0.0.1:8787\n}\n' "$NAME" > /etc/caddy/Caddyfile
systemctl restart caddy
echo "waiting for the certificate..."; sleep 8
if curl -s -m 15 -X POST "https://$NAME" -d x | grep -q 'not a snapshot'; then
  echo; echo "SUCCESS — the relay's public URL is:  https://$NAME"; echo "Send that URL back to be wired into the game build."
else
  echo "!! https not answering yet — check: journalctl -u caddy -n 20  (and the DO Cloud Firewall in the control panel: allow TCP 80+443)"
fi
