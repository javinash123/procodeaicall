# NIJVOX — EC2 Deployment Guide (Amazon Linux 2023 + Nginx)

## What's in the package

| File | Purpose |
|------|---------|
| `dist/index.cjs` | Bundled Node.js server (all server deps included — no npm install needed) |
| `dist/public/` | Pre-built React frontend |
| `deploy/.env.production` | Template for all environment variables |
| `deploy/nginx.conf` | Nginx reverse-proxy config (fixes the 401 session bug) |
| `deploy/nijvox.service` | systemd service for auto-start + crash recovery |

---

## Step 1 — Upload the build

```bash
# On your local machine / Replit shell
tar -czf nijvox-dist.tar.gz dist/ deploy/ uploads/

# Upload to EC2
scp -i your-key.pem nijvox-dist.tar.gz ec2-user@YOUR_EC2_IP:/home/ec2-user/
```

## Step 2 — Extract on EC2

```bash
ssh -i your-key.pem ec2-user@YOUR_EC2_IP

mkdir -p /home/ec2-user/nijvox
cd /home/ec2-user/nijvox
tar -xzf ~/nijvox-dist.tar.gz
mkdir -p uploads   # for campaign file uploads
```

## Step 3 — Configure environment

```bash
cp deploy/.env.production .env
nano .env
# Fill in every value marked  ← REQUIRED
```

**Minimum required values:**
- `MONGODB_URI` — your MongoDB Atlas connection string
- `SESSION_SECRET` — 32+ character random string
- `OPENAI_API_KEY` — your OpenAI key
- `RAZORPAY_KEY_ID` — your Razorpay public key (replaces old build-time VITE_RAZORPAY_KEY_ID)
- `RAZORPAY_KEY_SECRET` — your Razorpay secret key

## Step 4 — Install Nginx (if not already)

```bash
sudo dnf install -y nginx
```

## Step 5 — Configure Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/nijvox.conf

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
sudo systemctl enable nginx
```

> **Why this nginx config fixes the 401 errors:** the previous config was missing
> `proxy_set_header X-Forwarded-Proto $scheme`. Without it, Express cannot detect
> that the connection is HTTPS, so it writes the session cookie without validating
> the SSL context, causing cookie-based sessions to break intermittently.
> The config above adds all required headers including WebSocket upgrade support.

## Step 6 — Set up SSL (Let's Encrypt)

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d nijvox.com -d www.nijvox.com
```

## Step 7 — Install Node.js (if not already)

```bash
sudo dnf install -y nodejs   # Node 18+ required
node --version               # should be 18.x or 20.x
```

## Step 8 — Install systemd service

```bash
sudo cp deploy/nijvox.service /etc/systemd/system/nijvox.service
sudo systemctl daemon-reload
sudo systemctl enable nijvox
sudo systemctl start nijvox

# Check it started
sudo systemctl status nijvox
sudo journalctl -u nijvox -f   # live logs
```

---

## Troubleshooting

### Still getting 401 after deployment

1. Confirm nginx config has `proxy_set_header X-Forwarded-Proto $scheme` — reload nginx after adding it.
2. Confirm `.env` has `COOKIE_SECURE=true` and `SESSION_SECRET` is set.
3. Confirm `MONGODB_URI` is correct — sessions are stored in MongoDB. If the URI is wrong, sessions fall back to memory and are lost on restart.
4. Clear browser cookies for nijvox.com and log in again after deploying.

### App crashes on start

```bash
sudo journalctl -u nijvox -n 50
```
Most common causes: missing `SESSION_SECRET`, wrong `MONGODB_URI`, or port already in use.

### Payments not working

- Set `RAZORPAY_KEY_ID` in `.env` on EC2 — **no rebuild needed** (the app now fetches it at runtime).
- Set `RAZORPAY_KEY_SECRET` as well.
- Restart the service: `sudo systemctl restart nijvox`

### WebSocket / AI calling not working

Confirm nginx config has:
```nginx
proxy_set_header Upgrade    $http_upgrade;
proxy_set_header Connection "upgrade";
```
Both `/stream` and `/exotel-stream` paths go through the same proxy block.
