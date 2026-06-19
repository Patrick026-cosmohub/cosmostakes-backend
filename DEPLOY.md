# Backend Relay Deployment — `api.cosmostakes.com`

Secure HTTPS relay on a Vultr VPS so the Lovable frontend can call Juwa
without exposing provider credentials.

- **VPS IP:** `45.76.230.232`
- **Relay domain:** `api.cosmostakes.com`
- **Relay URL (set in Lovable):** `https://api.cosmostakes.com/juwa`
- **Upstream relay port:** `127.0.0.1:8787`

---

## 1. DNS

In Vultr DNS, create an A record:

| Type | Name | Value         | TTL |
| ---- | ---- | ------------- | --- |
| A    | api  | 45.76.230.232 | 300 |

Verify:

```bash
dig +short api.cosmostakes.com
# → 45.76.230.232
```

Wait until it resolves before continuing — Caddy needs it for Let's Encrypt.

---

## 2. Server prep (Ubuntu 22.04 / 24.04)

```bash
ssh root@45.76.230.232

apt update && apt -y upgrade
apt -y install curl ufw debian-keyring debian-archive-keyring apt-transport-https

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt -y install nodejs

# Caddy
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt -y install caddy

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

---

## 3. Relay application

```bash
mkdir -p /opt/relay
```

Create `/opt/relay/relay.mjs`:

```javascript
import http from 'node:http';
import { createHash } from 'node:crypto';

const PORT = 8787;
const SECRET = process.env.RELAY_SECRET;
const JUWA_BASE = process.env.JUWA_BASE_URL; // e.g. https://agent.juwa777.com
const SKEW_SECONDS = 300;

if (!SECRET || !JUWA_BASE) {
  console.error('Missing RELAY_SECRET or JUWA_BASE_URL');
  process.exit(1);
}

function sign(ts, body) {
  return createHash('sha256').update(`${ts}.${body}.${SECRET}`).digest('hex');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || req.url !== '/juwa') {
      res.writeHead(404); return res.end('not found');
    }

    const ts = req.headers['x-relay-timestamp'];
    const sig = req.headers['x-relay-signature'];
    if (!ts || !sig) { res.writeHead(401); return res.end('missing auth'); }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > SKEW_SECONDS) {
      res.writeHead(401); return res.end('stale');
    }

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');

    if (sign(ts, body) !== sig) {
      res.writeHead(401); return res.end('bad signature');
    }

    const payload = JSON.parse(body);
    const targetUrl = payload.url || `${JUWA_BASE.replace(/\/$/, '')}${payload.path}`;
    const target = new URL(targetUrl);
    const allowed = new URL(JUWA_BASE);

    if (target.origin !== allowed.origin) {
      res.writeHead(400); return res.end('invalid upstream');
    }

    const formFields = payload.fields || payload.form;
    if (!formFields || typeof formFields !== 'object') {
      res.writeHead(400); return res.end('invalid form');
    }

    const upstream = await fetch(target.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(formFields).toString(),
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json',
    });
    res.end(text);
  } catch (err) {
    console.error(err);
    res.writeHead(500); res.end('relay error');
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`relay on :${PORT}`));
```

---

## 4. systemd service

Create `/etc/systemd/system/relay.service`:

```ini
[Unit]
Description=Juwa Relay
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/relay
ExecStart=/usr/bin/node /opt/relay/relay.mjs
Restart=always
RestartSec=3

# --- Secrets (replace placeholders) ---
Environment=RELAY_SECRET=REPLACE_WITH_STRONG_SECRET
Environment=JUWA_BASE_URL=https://agent.juwa777.com
Environment=JUWA_AGENT_USERNAME=your_agent_username
Environment=JUWA_AGENT_PASSWORD=your_agent_password

[Install]
WantedBy=multi-user.target
```

Lock down the unit file (it contains secrets):

```bash
chmod 600 /etc/systemd/system/relay.service
```

Generate a strong `RELAY_SECRET` and paste into the unit:

```bash
openssl rand -hex 32
```

The **same** value must be stored in Lovable as `RELAY_SECRET`.

Enable and start:

```bash
systemctl daemon-reload
systemctl enable --now relay
systemctl status relay --no-pager
```

---

## 5. Caddy configuration

Replace `/etc/caddy/Caddyfile` with:

```caddy
api.cosmostakes.com {
    reverse_proxy /juwa 127.0.0.1:8787
}
```

Reload Caddy (auto-issues a Let's Encrypt cert):

```bash
systemctl reload caddy
journalctl -u caddy -n 50 --no-pager
```

Verify TLS:

```bash
curl -i https://api.cosmostakes.com/juwa
# Expect 401 (missing auth headers) — proves HTTPS + relay are reachable.
```

---

## 6. Lovable frontend secrets

Set in Lovable (Backend → Secrets):

| Key            | Value                              |
| -------------- | ---------------------------------- |
| `RELAY_URL`    | `https://api.cosmostakes.com/juwa` |
| `RELAY_SECRET` | (same value as on the VPS)         |

The server function in `src/routes/api/public/juwa/-_helpers.server.ts`
signs requests with HMAC-SHA256 (`x-relay-timestamp` + `x-relay-signature`)
and POSTs them to `RELAY_URL`.

---

## 7. Whitelist with Juwa

Give Juwa support the VPS IP to whitelist:

```
45.76.230.232
```

Once whitelisted, test from the Lovable portal — the username should appear.

---

## 8. Operations

```bash
# Logs
journalctl -u relay -f
journalctl -u caddy -f

# Restart after env changes
systemctl daemon-reload && systemctl restart relay

# Rotate RELAY_SECRET: update both the systemd unit and the Lovable secret,
# then `systemctl restart relay`.
```
