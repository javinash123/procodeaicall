# Complete Deployment Instructions for AIAgent on AWS EC2

## Files You Have

You have received the following files:

1. **aiagent-deployment.tar.gz** (6.6 MB)
   - Complete production-ready application
   - All dependencies included
   - Compiled frontend and backend

2. **DEPLOYMENT_SUMMARY.txt**
   - Quick reference for deployment details

3. **DEPLOY_TO_EC2.sh**
   - Automated deployment script

4. **This file - DEPLOYMENT_INSTRUCTIONS.md**

---

## Option 1: Automated Deployment (Recommended)

### Prerequisites
- AWS EC2 instance running Ubuntu 20.04 or later
- EC2 instance public IP: 3.208.52.220
- SSH access with your AWS key pair
- Apache already installed or will be installed

### One-Command Deployment

```bash
# Make script executable
chmod +x DEPLOY_TO_EC2.sh

# Run the deployment script
./DEPLOY_TO_EC2.sh /path/to/your-aws-key.pem
```

The script will:
1. Upload the deployment package to your EC2 instance
2. Extract files
3. Install dependencies
4. Configure Apache
5. Set up systemd service

---

## Option 2: Manual Step-by-Step Deployment

### Step 1: Upload Deployment Package to EC2

From your local machine:
```bash
# Using SCP to upload the file
scp -i /path/to/your-aws-key.pem aiagent-deployment.tar.gz ubuntu@3.208.52.220:/tmp/
```

### Step 2: Connect to EC2

```bash
ssh -i /path/to/your-aws-key.pem ubuntu@3.208.52.220
```

### Step 3: Extract and Setup

```bash
# Create application directory
mkdir -p ~/aiagent
cd ~/aiagent

# Extract the deployment package
tar -xzf /tmp/aiagent-deployment.tar.gz
mv aiagent-deployment/* .
mv aiagent-deployment/.* . 2>/dev/null || true

# Set proper permissions
chmod +x start.sh stop.sh
```

### Step 4: Install Node.js (if not already installed)

```bash
# Check if Node.js is installed
node --version

# If not installed, install it
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Step 5: Install Application Dependencies

```bash
cd ~/aiagent
npm install --only=production
```

### Step 6: Configure Environment Variables

```bash
# Edit the environment file
nano .env.production
```

**Required Configuration:**

```
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/aiagent?retryWrites=true&w=majority
SESSION_SECRET=your-secure-random-string-minimum-32-characters-long
```

**How to generate SESSION_SECRET:**
```bash
# On your local machine or server
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 7: Enable Apache Modules

```bash
# Enable required Apache modules
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod headers
sudo a2enmod deflate

# Copy Apache configuration
sudo cp ~/aiagent/aiagent.conf /etc/apache2/sites-available/

# Enable the site
sudo a2ensite aiagent.conf

# Test Apache configuration
sudo apache2ctl configtest
# Should output: Syntax OK

# Restart Apache
sudo systemctl restart apache2
```

### Step 8: Start the Application

```bash
cd ~/aiagent
./start.sh
```

### Step 9: Verify Installation

```bash
# Check if the Node.js process is running
ps aux | grep "node dist"

# Test the backend API
curl http://localhost:5000/api/auth/me
# Should return: {"message":"Unauthorized"}

# View logs
tail -f ~/aiagent/app.log
```

### Step 10: Access the Application

Open your browser and navigate to:
```
http://3.208.52.220/aiagent/
```

---

## Troubleshooting

### Application won't start

**Check logs:**
```bash
tail -f ~/aiagent/app.log
```

**Common issues:**
- MongoDB connection string is incorrect
- .env.production is missing or has wrong values
- Node.js is not installed
- Port 5000 is already in use: `lsof -i :5000`

### Apache proxy issues

**Check Apache error logs:**
```bash
sudo tail -f /var/log/apache2/aiagent_error.log
```

**Verify proxy modules are enabled:**
```bash
apache2ctl -M | grep proxy
# Should show: proxy_module, proxy_http_module
```

**Test internal connection:**
```bash
curl http://127.0.0.1:5000/
```

### MongoDB connection fails

**Test connection string:**
```bash
node -e "require('mongodb').MongoClient.connect('YOUR_MONGODB_URI').then(() => console.log('Connected!')).catch(e => console.error('Failed:', e.message))"
```

---

## Managing the Application

### Check Application Status
```bash
ps aux | grep "node dist"
cat ~/aiagent/app.pid
```

### View Real-time Logs
```bash
tail -f ~/aiagent/app.log
```

### Stop the Application
```bash
~/aiagent/stop.sh
```

### Restart the Application
```bash
~/aiagent/stop.sh
sleep 2
~/aiagent/start.sh
```

### Check Apache Status
```bash
sudo systemctl status apache2
```

### Reload Apache Configuration (without stopping)
```bash
sudo apache2ctl reload
```

---

## Production Recommendations

### 1. Enable HTTPS with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-apache

# Get SSL certificate (auto-configures Apache)
sudo certbot --apache -d 3.208.52.220

# Auto-renewal is enabled by default
```

### 2. Setup Process Manager (PM2)

PM2 will automatically restart the application if it crashes:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create ecosystem config
cat > ~/aiagent/ecosystem.config.js << 'EOF'
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
cd ~/aiagent
pm2 start ecosystem.config.js

# Make it auto-start on reboot
pm2 startup
pm2 save
```

### 3. Setup Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 4. Monitor Logs and Disk Space

```bash
# Check disk usage
df -h

# Rotate old logs
find ~/aiagent -name "*.log" -mtime +30 -delete

# Monitor application logs
watch -n 5 'tail -20 ~/aiagent/app.log'
```

---

## Updating the Application

To deploy a new version:

```bash
# Stop the current version
~/aiagent/stop.sh

# Backup current version
tar -czf ~/aiagent-backup-$(date +%s).tar.gz ~/aiagent/dist

# Extract new build (upload new aiagent-deployment.tar.gz first)
cd ~/aiagent
tar -xzf /tmp/aiagent-deployment.tar.gz
cp -r aiagent-deployment/dist .
cp aiagent-deployment/package.json .
cp aiagent-deployment/package-lock.json .

# Update dependencies
npm install --only=production

# Start the new version
./start.sh
```

---

## Support & Monitoring

### Key Commands Reference

```bash
# Check application process
ps aux | grep "node dist"

# Monitor CPU and memory
top -p $(cat ~/aiagent/app.pid)

# Check open ports
lsof -i :80
lsof -i :5000

# View Apache access logs
sudo tail -f /var/log/apache2/aiagent_access.log

# View Apache error logs
sudo tail -f /var/log/apache2/aiagent_error.log

# Test internal connectivity
curl -v http://127.0.0.1:5000/

# Check available disk space
df -h

# Check system uptime
uptime
```

---

## Security Checklist

- [ ] Changed SESSION_SECRET to a unique value
- [ ] MongoDB URI is from a secure connection
- [ ] Enabled HTTPS with Let's Encrypt
- [ ] Firewall rules are properly configured
- [ ] Regular database backups are configured
- [ ] Application logs are monitored
- [ ] Disk space is monitored
- [ ] Updates are applied regularly

---

## File Structure After Deployment

```
/home/ubuntu/aiagent/
├── dist/
│   ├── public/              # Frontend files
│   │   ├── assets/
│   │   ├── index.html
│   │   └── ...
│   └── index.cjs            # Backend compiled code
├── uploads/                 # User uploaded files
├── .env.production          # Environment configuration
├── package.json
├── package-lock.json
├── start.sh                 # Start script
├── stop.sh                  # Stop script
├── aiagent.conf            # Apache configuration
├── app.log                 # Application logs
├── app.pid                 # Application process ID
└── ecosystem.config.js     # PM2 configuration (if using PM2)
```

---

## What to Do Next

1. **Run deployment** using Option 1 or Option 2
2. **Configure environment** variables (.env.production)
3. **Access the application** at http://3.208.52.220/aiagent/
4. **Test functionality** by creating a user account and logging in
5. **Enable HTTPS** for production security
6. **Setup monitoring** and backups

---

**Your AIAgent application is ready to deploy! Good luck! 🚀**
