# AIAgent Application - Production Build

This is a complete production-ready build of the AIAgent application for deployment on AWS EC2 with Apache.

## Package Contents

- **dist/** - Compiled frontend (React/Vite) and backend (Express/Node.js)
- **uploads/** - Directory for user-uploaded files
- **.env.production** - Environment configuration template
- **aiagent.conf** - Apache virtual host configuration
- **start.sh** - Application startup script
- **stop.sh** - Application stop script
- **package.json** - Node.js dependencies manifest
- **package-lock.json** - Locked dependency versions
- **DEPLOYMENT_GUIDE.md** - Complete deployment instructions
- **QUICK_START.md** - 5-minute quick start guide

## System Requirements

- **Server**: AWS EC2 (t3.medium or larger recommended)
- **OS**: Ubuntu 20.04+ or Amazon Linux 2
- **Node.js**: v18.0.0 or higher
- **Web Server**: Apache 2.4+
- **Database**: MongoDB 5.0+ (cloud or self-hosted)
- **Disk Space**: Minimum 2GB free space

## What's Included

### Application Features
- User authentication with session management
- Lead management system
- Campaign creation and tracking
- Appointment scheduling
- Dashboard with analytics charts
- Notes system for tracking information
- File upload support for knowledge bases
- Real-time activity logging
- Admin panel for user management

### Production Optimizations
- Minified frontend bundle (~320KB gzipped)
- Optimized images and assets
- Session management with secure cookies
- CORS configuration for proxy
- Database connection pooling
- Request compression
- Static file caching headers

## Getting Started

1. **Read QUICK_START.md** for 5-minute deployment
2. **Read DEPLOYMENT_GUIDE.md** for detailed information
3. **Configure .env.production** with your settings
4. **Run deployment steps** from QUICK_START.md

## Support

For issues or questions, refer to the troubleshooting section in DEPLOYMENT_GUIDE.md

## Build Information

- **Build Date**: December 20, 2024
- **Build Tool**: Vite + TypeScript
- **Framework**: React 19 + Express.js
- **Database**: MongoDB with Mongoose
- **Frontend Size**: ~1.4MB (uncompressed), ~319KB (gzipped)
- **Backend Size**: ~2.3MB (single file bundle)

---

**Ready to deploy? Start with QUICK_START.md**
