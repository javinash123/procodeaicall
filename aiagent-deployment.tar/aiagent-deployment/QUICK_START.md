# AIAgent - Quick Start Guide

## Pre-Deployment Checklist

- [ ] Node.js v18+ installed on your EC2
- [ ] Apache web server installed
- [ ] MongoDB connection string ready
- [ ] AWS security group allows ports 22, 80, 443
- [ ] SSH access to EC2 instance

---

## 5-Minute Deployment

### Step 1: Connect to EC2
```bash
ssh -i your-key.pem ubuntu@3.208.52.220
```

### Step 2: Extract Package
```bash
cd /tmp
# Upload aiagent-deployment.tar.gz file, then:
tar -xzf aiagent-deployment.tar.gz
sudo mkdir -p /home/ubuntu/aiagent
sudo cp -r aiagent-deployment/* /home/ubuntu/aiagent/
sudo chown -R ubuntu:ubuntu /home/ubuntu/aiagent
```

### Step 3: Configure Environment
```bash
cd /home/ubuntu/aiagent
nano .env.production

# Edit these values:
# MONGODB_URI=your-mongodb-connection-string
# SESSION_SECRET=generate-a-random-string-32chars-min
```

### Step 4: Install Apache Config
```bash
sudo cp /home/ubuntu/aiagent/aiagent.conf /etc/apache2/sites-available/
sudo a2ensite aiagent
sudo a2enmod proxy proxy_http headers
sudo systemctl restart apache2
```

### Step 5: Install Dependencies & Start
```bash
cd /home/ubuntu/aiagent
npm install --only=production
./start.sh
```

### Step 6: Verify It's Running
```bash
curl http://localhost:5000/api/auth/me
# Should return 401 Unauthorized (which is expected)

# Access in browser:
# https://nijvox.com/
```

---

## Troubleshooting Quick Commands

```bash
# Check if Node app is running
ps aux | grep "node dist"

# View logs in real-time
tail -f /home/ubuntu/aiagent/app.log

# Stop the app
/home/ubuntu/aiagent/stop.sh

# Start the app
/home/ubuntu/aiagent/start.sh

# Check Apache status
sudo systemctl status apache2

# View Apache errors
sudo tail -f /var/log/apache2/aiagent_error.log
```

---

## Port Information

- **Node.js App runs on**: localhost:5000 (internal)
- **Apache listens on**: 0.0.0.0:80 (public)
- **Access path**: https://nijvox.com/
- **MongoDB**: Configure in .env.production

---

For detailed information, see **DEPLOYMENT_GUIDE.md**
