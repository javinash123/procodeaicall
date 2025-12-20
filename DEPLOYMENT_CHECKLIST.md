# Deployment Checklist

## Pre-Deployment

- [ ] AWS EC2 instance running (3.208.52.220)
- [ ] SSH key pair downloaded and saved securely
- [ ] Downloaded `aiagent-deployment.tar.gz` from Replit
- [ ] Read DEPLOYMENT_INSTRUCTIONS.md
- [ ] MongoDB connection string ready
- [ ] Decided on deployment method (automated or manual)

## Deployment

- [ ] Uploaded aiagent-deployment.tar.gz to EC2
- [ ] Connected to EC2 via SSH
- [ ] Extracted deployment package
- [ ] Node.js v18+ installed on EC2
- [ ] Apache web server installed
- [ ] Configured .env.production with:
  - [ ] MONGODB_URI
  - [ ] SESSION_SECRET (generated securely)
- [ ] Installed npm dependencies
- [ ] Enabled Apache proxy modules
- [ ] Copied Apache configuration
- [ ] Restarted Apache
- [ ] Started the application with ./start.sh

## Verification

- [ ] Node.js process is running: `ps aux | grep "node dist"`
- [ ] Backend responds to API: `curl http://localhost:5000/api/auth/me`
- [ ] Apache is running: `sudo systemctl status apache2`
- [ ] Firewall allows HTTP (port 80): `sudo ufw status`
- [ ] Application loads in browser: http://3.208.52.220/aiagent/
- [ ] Can create user account
- [ ] Can login successfully
- [ ] Dashboard loads with data
- [ ] Navigation works between pages
- [ ] Notes system works
- [ ] Campaigns can be created

## Post-Deployment

- [ ] Enabled HTTPS with Let's Encrypt (production)
- [ ] Setup PM2 for auto-restart (optional but recommended)
- [ ] Configured firewall rules (SSH, HTTP, HTTPS)
- [ ] Setup log rotation (optional)
- [ ] Configured database backups (MongoDB)
- [ ] Setup monitoring/alerts (optional)
- [ ] Documented access credentials securely
- [ ] Tested disaster recovery process

## Maintenance

- [ ] Set reminder to update Node.js packages
- [ ] Set reminder to backup MongoDB
- [ ] Monitor disk space regularly
- [ ] Review application logs for errors
- [ ] Monitor CPU and memory usage
- [ ] Setup automated SSL renewal (if using Let's Encrypt)

## Security

- [ ] SESSION_SECRET is unique and secure
- [ ] .env.production is NOT in git repository
- [ ] HTTPS is enabled (production)
- [ ] Firewall is enabled
- [ ] SSH key is not shared
- [ ] MongoDB connection is encrypted
- [ ] Regular database backups exist
- [ ] Application logs are monitored

---

**Mark items as completed and date each phase.**

Deployment Date: _______________
Production Live Date: _______________
