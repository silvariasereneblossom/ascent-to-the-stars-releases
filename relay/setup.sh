#!/usr/bin/env bash
# ATTS relay bootstrap for the DigitalOcean droplet. Run as root (or with sudo):
#   curl -sL https://raw.githubusercontent.com/silvariasereneblossom/ascent-to-the-stars-releases/main/relay/setup.sh | sudo bash
# Then it prompts once for the GitHub PAT (typed or pasted in YOUR ssh terminal).
set -euo pipefail
RAW="https://raw.githubusercontent.com/silvariasereneblossom/ascent-to-the-stars-releases/main/relay"
command -v node >/dev/null || { echo "installing node..."; curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null && apt-get install -y nodejs >/dev/null; }
mkdir -p /opt/atts-relay
curl -fsSL "$RAW/server.js" -o /opt/atts-relay/server.js
curl -fsSL "$RAW/atts-relay.service" -o /etc/systemd/system/atts-relay.service
if [ ! -s /etc/atts-relay.env ]; then
  echo -n "Paste the GitHub PAT (fine-grained, ascent-to-the-stars-releases, Contents RW): "
  read -r PAT
  printf 'GITHUB_TOKEN=%s\n' "$PAT" > /etc/atts-relay.env
  chmod 600 /etc/atts-relay.env
fi
systemctl daemon-reload
systemctl enable --now atts-relay
sleep 1
systemctl --no-pager -l status atts-relay | head -5
echo
echo "Relay is up on port 8787. NOW PUT HTTPS IN FRONT (required):"
echo "  - existing nginx site:  location /atts-relay/ { proxy_pass http://127.0.0.1:8787/; client_max_body_size 2m; }"
echo "  - or Caddy (auto-TLS):  caddy reverse-proxy --from relay.YOURDOMAIN --to :8787"
echo "Test: curl -s -X POST https://<your-url> -d x   ->  {\"ok\":false,\"error\":\"not a snapshot\"}"
