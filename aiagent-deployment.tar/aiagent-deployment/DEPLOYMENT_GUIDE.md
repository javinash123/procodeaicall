# AIAgent Application - Production Deployment Guide

## Server Details
- **Server**: AWS EC2 Instance
- **IP Address**: 3.208.52.220
- **URL**: https://nijvox.com/
- **Installation Path**: /home/ubuntu/aiagent/
- **Web Server**: Apache with mod_proxy

---

## Prerequisites

Ensure the following are installed on your EC2 instance:
- Node.js (v18 or higher)
- Apache web server (httpd)
- Apache modules: mod_proxy, mod_proxy_http, mod_headers
- MongoDB connection (cloud or local)

### Install Node.js (if not already installed):
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Enable Apache modules:
```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod headers
sudo a2enmod deflate
sudo systemctl restart apache2
```

---

## Deployment Steps

### 1. Extract and Setup Application Files

```bash
# Create application directory
sudo mkdir -p /home/ubuntu/aiagent
cd /home/ubuntu/aiagent

# Extract the deployment package
sudo tar -xzf aiagent-deployment.tar.gz -C /home/ubuntu/aiagent/

# Set proper permissions
sudo chown -R ubuntu:ubuntu /home/ubuntu/aiagent
chmod +x /home/ubuntu/aiagent/start.sh
chmod +x /home/ubuntu/aiagent/stop.sh
```

### 2. Configure Environment Variables

```bash
# Edit the environment file with your settings
nano /home/ubuntu/aiagent/.env.production
```

**Required Environment Variables:**
- `MONGODB_URI` - Your MongoDB connection string
- `SESSION_SECRET` - Generate a secure random string for sessions
- `NODE_ENV` - Set to "production"
- `PORT` - Set to 5000 (used internally, Apache proxies it)

**Example .env.production:**
```
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/aiagent?retryWrites=true&w=majority
SESSION_SECRET=your-very-long-random-string-here-min-32-chars
```

### 3. Install Dependencies

```bash
cd /home/ubuntu/aiagent
npm install --only=production
```

### 4. Configure Apache

```bash
# Copy Apache configuration
sudo cp /home/ubuntu/aiagent/aiagent.conf /etc/apache2/sites-available/aiagent.conf

# Enable the site
sudo a2ensite aiagent.conf

# Test Apache configuration
sudo apache2ctl configtest

# Restart Apache
sudo systemctl restart apache2
```

### 5. Start the Application

```bash
cd /home/ubuntu/aiagent
./start.sh
```

**Verify the application is running:**
```bash
# Check if process is running
ps aux | grep "node dist/index.cjs"

# Check logs
tail -f /home/ubuntu/aiagent/app.log

# Test the endpoint
curl http://localhost:5000/api/auth/me
```

### 6. Access the Application

Open your browser and navigate to:
```
https://nijvox.com/
```

---

## Managing the Application

### Start Application:
```bash
/home/ubuntu/aiagent/start.sh
```

### Stop Application:
```bash
/home/ubuntu/aiagent/stop.sh
```

### View Live Logs:
```bash
tail -f /home/ubuntu/aiagent/app.log
```

### Check Application Status:
```bash
ps aux | grep "node dist/index.cjs"
cat /home/ubuntu/aiagent/app.pid
```

### Restart Application:
```bash
/home/ubuntu/aiagent/stop.sh
sleep 2
/home/ubuntu/aiagent/start.sh
```

---

## Production Considerations

### 1. Enable HTTPS (SSL/TLS)
```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-apache

# Get SSL certificate
sudo certbot --apache -d nijvox.com

# Auto-renewal is enabled by default
```

### 2. Setup Process Manager (PM2) - Recommended for Production
```bash
# Install PM2 globally
sudo npm install -g pm2

# Create PM2 ecosystem file
cat > /home/ubuntu/aiagent/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'aiagent',
    script: './dist/index.cjs',
    cwd: '/home/ubuntu/aiagent',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    autorestart: true,
    max_memory_restart: '1G',
    error_file: './pm2-error.log',
    out_file: './pm2-out.log'
  }]
};
EOF

# Start with PM2
cd /home/ubuntu/aiagent
pm2 start ecosystem.config.js

# Save PM2 configuration to restart on reboot
pm2 startup
pm2 save
```

### 3. Firewall Configuration
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 4. Monitor Disk Space
```bash
df -h
# Make sure /home/ubuntu has adequate space for logs and uploads
```

### 5. Regular Backups
- Database backups (MongoDB)
- Upload files backup (if stored locally)
- Configuration files backup

---

## Troubleshooting

### Application won't start
1. Check logs: `tail -f /home/ubuntu/aiagent/app.log`
2. Verify .env.production has correct values
3. Check MongoDB connection: `mongosh "mongodb+srv://..."`
4. Ensure Node.js is in PATH: `which node`

### Apache proxy issues
1. Check Apache is running: `sudo systemctl status apache2`
2. Check Apache logs: `sudo tail -f /var/log/apache2/aiagent_error.log`
3. Verify proxy modules: `apache2ctl -M | grep proxy`
4. Test internal connection: `curl http://127.0.0.1:5000/`

### High memory usage
1. Check node process: `ps aux | grep node`
2. Use PM2 for automatic memory management
3. Review logs for errors causing memory leaks

### Database connection errors
1. Verify MongoDB URI is correct
2. Check MongoDB credentials
3. Ensure EC2 security group allows MongoDB port (27017 for local, or your cloud DB IP whitelist)

---

## Performance Optimization

### 1. Enable Compression
Already configured in Apache (aiagent.conf)

### 2. Setup Redis for Sessions (Optional)
```bash
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### 3. Configure CloudFront (Optional)
- Create CloudFront distribution pointing to 3.208.52.220
- Cache /aiagent/assets/ and /uploads/
- Purge cache on new deployments

---

## Updating the Application

To deploy a new version:

```bash
# Stop the application
/home/ubuntu/aiagent/stop.sh

# Backup current version (optional)
tar -czf /home/ubuntu/aiagent-backup-$(date +%s).tar.gz /home/ubuntu/aiagent/dist

# Extract new build
tar -xzf aiagent-deployment.tar.gz -C /home/ubuntu/aiagent/

# Install/update dependencies
cd /home/ubuntu/aiagent
npm install --only=production

# Start the application
./start.sh
```

---

## Useful Commands Reference

```bash
# Check application status
systemctl status aiagent

# View all logs
less /home/ubuntu/aiagent/app.log

# Check port usage
lsof -i :5000

# Monitor resource usage
top -p $(cat /home/ubuntu/aiagent/app.pid)

# Reload Apache config without restart
sudo apache2ctl reload

# Check MongoDB connection
mongosh "your-mongodb-uri"

# Clean up old logs
find /home/ubuntu/aiagent -name "*.log" -mtime +30 -delete
```

---

## Support & Maintenance

- Monitor application logs regularly
- Keep Node.js and dependencies updated
- Set up log rotation to prevent disk space issues
- Regular database backups
- Monitor CPU and memory usage
- Setup alerts for application crashes

---

**Deployment completed! Your AIAgent application is now live at https://nijvox.com/**
