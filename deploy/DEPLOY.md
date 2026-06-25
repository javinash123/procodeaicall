# NIJVOX — Production Deployment Guide
## Target: AWS EC2 Amazon Linux 2023 + Apache + https://nijvox.com/

---

## 1. Prerequisites on the EC2 instance

```bash
# Install Node.js 20 LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Apache (if not already installed)
sudo dnf install -y httpd mod_ssl

# Enable required Apache modules (add to /etc/httpd/conf/httpd.conf if missing)
sudo dnf install -y mod_proxy mod_proxy_http

# Start & enable Apache
sudo systemctl enable --now httpd
```

---

## 2. Upload the package to the server

From your local machine:
```bash
# Upload the zip
scp nijvox-production.zip ec2-user@<your-ec2-ip>:/tmp/

# SSH into the server
ssh ec2-user@<your-ec2-ip>
```

On the server:
```bash
sudo mkdir -p /var/www/html/nijvox
sudo mkdir -p /var/log/nijvox
sudo chown -R ec2-user:ec2-user /var/www/html/nijvox /var/log/nijvox

cd /var/www/html/nijvox
unzip /tmp/nijvox-production.zip -d .
```

---

## 3. Configure environment variables

```bash
cp .env.example .env
nano .env   # fill in all values
```

**Required values:**
- `MONGODB_URI` — your MongoDB Atlas connection string
- `SESSION_SECRET` — a long random string (e.g. run `openssl rand -hex 32`)
- `OPENAI_API_KEY` — your OpenAI API key

---

## 4. Install production dependencies

```bash
cd /var/www/html/nijvox
npm install --omit=dev
```

---

## 5. Set up PM2 process manager

```bash
cd /var/www/html/nijvox

# Start the app with PM2
pm2 start ecosystem.config.cjs

# Save the PM2 process list so it survives reboots
pm2 save

# Configure PM2 to auto-start on system boot
pm2 startup
# Copy and run the command it prints out (starts with: sudo env ...)
```

Useful PM2 commands:
```bash
pm2 status          # check app status
pm2 logs nijvox     # view live logs
pm2 restart nijvox  # restart the app
pm2 stop nijvox     # stop the app
```

---

## 6. Configure Apache as a reverse proxy

```bash
# Copy the virtual host config
sudo cp nijvox.conf /etc/httpd/conf.d/nijvox.conf

# Enable proxy modules (they should already be enabled on AL2023)
sudo httpd -M | grep proxy

# Test Apache config
sudo apachectl configtest

# Reload Apache
sudo systemctl reload httpd
```

---

## 7. SSL Certificate with Let's Encrypt (Certbot)

```bash
sudo dnf install -y certbot python3-certbot-apache

# Obtain certificate (Apache will be auto-configured)
sudo certbot --apache -d nijvox.com -d www.nijvox.com

# Auto-renewal is set up by Certbot; verify with:
sudo certbot renew --dry-run
```

---

## 8. Open EC2 Security Group ports

In your AWS console, make sure the EC2 security group inbound rules allow:
| Type  | Port | Source    |
|-------|------|-----------|
| HTTP  | 80   | 0.0.0.0/0 |
| HTTPS | 443  | 0.0.0.0/0 |

Do **not** expose port 5000 publicly — it is only accessed by Apache internally.

---

## 9. Seed the database (first deploy only)

```bash
cd /var/www/html/nijvox
node -e "require('./dist/index.cjs')" &   # start app briefly
# Or run seed separately:
npx tsx server/seed.ts
```

Default accounts after seeding:
- Admin: `admin@nijvox.com` / `admin123`
- Test user: `test@example.com` / `test123`

**Change these passwords immediately after first login.**

---

## 10. Directory structure after deployment

```
/var/www/html/nijvox/
├── dist/
│   ├── index.cjs          ← compiled backend
│   └── public/            ← frontend static files
│       ├── index.html
│       └── assets/
├── uploads/               ← file uploads (auto-created)
├── package.json
├── node_modules/
├── .env                   ← your secrets
└── ecosystem.config.cjs   ← PM2 config
```

---

## Updating / Re-deploying

```bash
# On your local machine, run the build and re-zip:
npm run build
cd dist && zip -r ../nijvox-production.zip . && cd ..
zip nijvox-production.zip package.json ecosystem.config.cjs .env.example

# Upload and deploy
scp nijvox-production.zip ec2-user@<your-ec2-ip>:/tmp/
ssh ec2-user@<your-ec2-ip> "cd /var/www/html/nijvox && unzip -o /tmp/nijvox-production.zip && npm install --omit=dev && pm2 restart nijvox"
```
