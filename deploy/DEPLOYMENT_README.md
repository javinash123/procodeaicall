# NIJVOX Deployment Guide for AWS EC2 with Apache

This guide explains how to deploy NIJVOX to an AWS EC2 instance with Apache serving the frontend and proxying API requests to the Node.js backend.

## Prerequisites

- AWS EC2 instance with Ubuntu/Amazon Linux
- Apache2 installed and running
- Node.js 18+ installed
- PM2 installed globally (`npm install -g pm2`)
- MongoDB Atlas connection string

## Deployment Structure

```
/var/www/html/aiagent/
├── public/           # Frontend static files (built React app)
│   ├── index.html
│   ├── assets/
│   └── ...
├── dist/
│   └── index.cjs     # Backend compiled code
├── uploads/          # File uploads directory
├── node_modules/     # Production dependencies
├── package.json
├── .env              # Environment variables
└── ecosystem.config.cjs  # PM2 configuration
```

## Step-by-Step Deployment

### 1. Build the Application (on your development machine)

```bash
# Install dependencies
npm install

# Build both frontend and backend
npm run build
```

This creates:
- `dist/public/` - Frontend static files
- `dist/index.cjs` - Backend compiled code

### 2. Prepare Files for Upload

Create a deployment package with these files/folders:
- `dist/` folder (entire folder)
- `package.json`
- `package-lock.json`
- `deploy/ecosystem.config.cjs`
- `deploy/.env.production` (rename to `.env` on server)

### 3. Upload to EC2

```bash
# Using SCP (replace with your EC2 details)
scp -i your-key.pem -r dist package.json package-lock.json deploy/ecosystem.config.cjs ubuntu@3.208.52.220:/tmp/aiagent/
```

### 4. Setup on EC2

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ubuntu@3.208.52.220

# Create application directory
sudo mkdir -p /var/www/html/aiagent
sudo chown -R $USER:$USER /var/www/html/aiagent

# Move files
cp -r /tmp/aiagent/* /var/www/html/aiagent/

# Rename dist/public to public (for Apache serving)
mv /var/www/html/aiagent/dist/public /var/www/html/aiagent/public

# Create uploads directory
mkdir -p /var/www/html/aiagent/uploads
chmod 755 /var/www/html/aiagent/uploads

# Install production dependencies
cd /var/www/html/aiagent
npm install --production

# Create .env file from template
cp deploy/.env.production .env
nano .env  # Edit with your actual values
```

### 5. Configure Environment Variables

Edit `/var/www/html/aiagent/.env`:

```env
MONGODB_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/nijvox?retryWrites=true&w=majority
PORT=6331
NODE_ENV=production
SESSION_SECRET=generate-a-secure-random-string-at-least-32-characters
TRUST_PROXY=true
```

### 6. Setup Apache

```bash
# Enable required Apache modules
sudo a2enmod proxy proxy_http rewrite headers

# Copy Apache configuration
sudo cp /var/www/html/aiagent/deploy/apache-aiagent.conf /etc/apache2/sites-available/aiagent.conf

# Or add to existing default site:
sudo nano /etc/apache2/sites-available/000-default.conf
```

Add this inside your `<VirtualHost *:80>` block:

```apache
# NIJVOX AI Agent Application
Alias /aiagent /var/www/html/aiagent/public

<Directory /var/www/html/aiagent/public>
    Options -Indexes +FollowSymLinks
    AllowOverride All
    Require all granted
    
    RewriteEngine On
    RewriteBase /aiagent/
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /aiagent/index.html [L]
</Directory>

# Proxy API requests to Node.js backend
ProxyPreserveHost On
ProxyPass /aiagent/api http://127.0.0.1:6331/api
ProxyPassReverse /aiagent/api http://127.0.0.1:6331/api
ProxyPass /aiagent/uploads http://127.0.0.1:6331/uploads
ProxyPassReverse /aiagent/uploads http://127.0.0.1:6331/uploads
```

Restart Apache:
```bash
sudo systemctl restart apache2
```

### 7. Start the Backend with PM2

```bash
cd /var/www/html/aiagent

# Create log directory
sudo mkdir -p /var/log/nijvox
sudo chown -R $USER:$USER /var/log/nijvox

# Start with PM2
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# (Follow the instructions it provides)
```

### 8. Verify Deployment

1. Check backend is running:
```bash
pm2 status
curl http://localhost:6331/api/auth/me
```

2. Check Apache configuration:
```bash
sudo apache2ctl configtest
```

3. Access the application:
   - Open browser: http://3.208.52.220/aiagent/

## Troubleshooting

### Backend Issues

```bash
# View PM2 logs
pm2 logs nijvox-backend

# Restart backend
pm2 restart nijvox-backend

# Check if port is in use
sudo netstat -tlnp | grep 6331
```

### Apache Issues

```bash
# Check Apache error logs
sudo tail -f /var/log/apache2/aiagent-error.log

# Test Apache configuration
sudo apache2ctl configtest

# Restart Apache
sudo systemctl restart apache2
```

### Common Issues

1. **502 Bad Gateway**: Backend not running. Check `pm2 status` and start if needed.

2. **404 on refresh**: Apache rewrite rules not working. Ensure mod_rewrite is enabled.

3. **API calls failing**: Check proxy configuration in Apache.

4. **Session issues**: Ensure SESSION_SECRET is set and TRUST_PROXY=true.

## Updating the Application

```bash
# Stop backend
pm2 stop nijvox-backend

# Upload new files
# (repeat scp commands with new build)

# Install any new dependencies
npm install --production

# Restart backend
pm2 restart nijvox-backend

# Clear browser cache if needed
```

## Security Recommendations

1. Enable HTTPS with Let's Encrypt
2. Configure firewall (only allow ports 80, 443, 22)
3. Keep Node.js and dependencies updated
4. Use strong SESSION_SECRET
5. Enable rate limiting in production

## Test Accounts

After deployment, you can seed the database:
```bash
cd /var/www/html/aiagent
node -e "require('./dist/index.cjs')" # Start server first, then in another terminal:
# Run seed script if needed
```

Default accounts:
- Admin: admin@nijvox.com / admin123
- User: test@example.com / test123
