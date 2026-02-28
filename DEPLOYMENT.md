# Deployment Guide for nijvox.com (AWS Amazon Linux 2023 + Apache)

This project is a full-stack Node.js application (Express + React). To deploy it on your AWS EC2 instance, follow these steps:

## 1. Prerequisites on EC2
Login to your EC2 instance and install the necessary dependencies:
```bash
# Update system
sudo dnf update -y

# Install Node.js (LTS version recommended)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Install PM2 to manage the Node.js process
sudo npm install -g pm2
```

## 2. Database Setup
The app uses MongoDB. You should use a MongoDB Atlas connection string for the easiest setup. Ensure your `MONGODB_URI` is ready.

## 3. Build and Transfer
On Replit, run the build:
```bash
npm run build
```
This creates a `dist` folder. Transfer the following to `/var/www/nijvox` on your EC2:
- `dist/` (Entire folder)
- `package.json`
- `package-lock.json`
- `uploads/` (Empty folder for user uploads)

On EC2:
```bash
cd /var/www/nijvox
npm install --production
```

## 4. Environment Variables
Create a `.env` file in `/var/www/nijvox`:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://... (your link)
SESSION_SECRET=a_strong_random_secret
```

## 5. Running the Application
To run the application in the background and ensure it stays up after a reboot:

```bash
# 1. Start the application with PM2
pm2 start dist/index.cjs --name nijvox --env production

# 2. Save the process list
pm2 save

# 3. Setup PM2 to start on boot
pm2 startup
# (Follow the instruction printed by the command above)
```

**Note:** Always ensure `NODE_ENV=production` is set, otherwise the server will not serve the frontend files and you will see a blank page or a "test" message.

## 6. Apache Reverse Proxy (for nijvox.com)
Create `/etc/httpd/conf.d/nijvox.conf`:
```apache
<VirtualHost *:80>
    ServerName nijvox.com
    ServerAlias www.nijvox.com

    # Ensure proxying is enabled
    ProxyRequests Off
    ProxyPreserveHost On

    # Proxy all requests to Node.js on port 5000
    ProxyPass / http://localhost:5000/
    ProxyPassReverse / http://localhost:5000/

    # Handle WebSockets for potential real-time features
    ProxyPass /socket.io http://localhost:5000/socket.io
    ProxyPassReverse /socket.io http://localhost:5000/socket.io

    # Ensure Apache doesn't try to serve its own files
    DocumentRoot /var/www/nijvox/dist/public
    <Directory /var/www/nijvox/dist/public>
        AllowOverride All
        Require all granted
    </Directory>

    # Optional: Redirect HTTP to HTTPS after SSL setup
    # RewriteEngine On
    # RewriteCond %{HTTPS} off
    # RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</VirtualHost>
```
Restart Apache:
```bash
sudo systemctl restart httpd
```

## 8. Common Issues & Fixes

### "Site can't be reached" or Timeout
1. **Security Groups**: Go to AWS Console > EC2 > Security Groups. Ensure **Port 80 (HTTP)** and **Port 443 (HTTPS)** are open to `0.0.0.0/0`.
2. **Apache Status**: Run `sudo systemctl status httpd`. If it's not "active (running)", run `sudo systemctl start httpd`.
3. **Firewall**: Run `sudo ufw allow 80` and `sudo ufw allow 443` (if using ufw) or `sudo firewall-cmd --permanent --add-service=http` (if using firewalld).

### "502 Bad Gateway" (Apache error)
This usually means Node.js isn't running on port 5000.
1. **Check PM2**: Run `pm2 status`. Ensure `nijvox` is "online".
2. **Check Logs**: Run `pm2 logs nijvox` to see if the app crashed (e.g., due to a wrong MongoDB URI).
3. **SELinux**: On Amazon Linux, run `sudo setsebool -P httpd_can_network_connect 1` to allow Apache to talk to Node.js.

### Blank Page or "Internal Server Error"
1. **NODE_ENV**: Ensure `NODE_ENV=production` is in your `.env` file.
2. **Build Files**: Ensure the `dist/public` folder contains your `index.html` and assets.
