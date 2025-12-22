# Production Deployment Instructions for AWS EC2

## Server Configuration
- **URL:** http://3.208.52.220/aiagent/
- **Server Path:** /var/www/aiagent/
- **Node Port:** 3000 (internal, behind Apache)

## What's Included in Build
- ✅ Frontend React build (dist/public/) - compiled and optimized
- ✅ Backend Express.js server (dist/index.cjs + server/)
- ✅ All dependencies configured
- ✅ MongoDB integration ready
- ✅ Routing configured for `/aiagent/` base path

## Deployment Steps

### 1. Extract Build on Server
```bash
cd /var/www
tar -xzf aiagent-production-build.tar.gz
```

### 2. Install Dependencies
```bash
cd /var/www/aiagent
npm install --production
```

### 3. Configure Environment Variables
Create `.env` file in `/var/www/aiagent/`:
```
NODE_ENV=production
PORT=3000
MONGODB_URI=your_mongodb_connection_string
SESSION_SECRET=your_secure_session_secret
```

### 4. Start Application
```bash
# Option A: Direct start
node dist/index.cjs

# Option B: Using PM2 (recommended for production)
pm2 start dist/index.cjs --name "aiagent"
pm2 save
pm2 startup
```

### 5. Apache Configuration (Already Done)
Your Apache proxy should forward `/aiagent/*` to `http://localhost:3000/*`

Example Apache config (if needs updating):
```apache
<Location /aiagent>
  ProxyPass http://localhost:3000/
  ProxyPassReverse http://localhost:3000/
</Location>
```

## Key Features Already Configured

✅ **Routing Base Path:** `/aiagent/`
- After login: Redirects to `http://3.208.52.220/aiagent/dashboard/`
- All public pages: `/aiagent/`, `/aiagent/features`, `/aiagent/pricing`, etc.

✅ **Frontend Build:** Optimized React + Vite
- Minified CSS and JS
- Asset optimization
- Configured for subdirectory serving

✅ **Backend:** Express.js Server
- Serves API on `/api/*` routes
- Serves static frontend files
- MongoDB ready for production
- Session management configured

## Database Setup

If using MongoDB Atlas:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/aiagent?retryWrites=true&w=majority
```

## Verification

After deployment, test:
1. **Home Page:** http://3.208.52.220/aiagent/
2. **Login:** http://3.208.52.220/aiagent/login
3. **Dashboard (after login):** http://3.208.52.220/aiagent/dashboard/

## File Structure

```
/var/www/aiagent/
├── dist/
│   ├── index.cjs          # Compiled server
│   └── public/            # Frontend build (HTML, CSS, JS)
├── server/                # Server source files
├── package.json           # Dependencies
├── .env                   # Environment variables (CREATE THIS)
└── node_modules/          # Dependencies (installed)
```

## Troubleshooting

**Issue:** Blank page at `/aiagent/`
- Solution: Ensure Node.js app is running on port 3000
- Check: `curl http://localhost:3000/`

**Issue:** API calls failing
- Check: MongoDB connection string in `.env`
- Verify: Port 3000 is accessible from Apache

**Issue:** Styling/JS not loading
- Clear browser cache (Ctrl+Shift+Del)
- Verify Apache proxy headers are correct

**Issue:** Redirects to wrong path
- Already fixed in build! Uses wouter base path `/aiagent`
- Verify Apache config forwards to root `/`

## Logs

Check application logs:
```bash
# If running directly
tail -f nohup.out

# If using PM2
pm2 logs aiagent
```

## Performance Notes

- Frontend is minified and optimized
- Bundle size: ~1.1 MB gzipped JavaScript
- Images compressed and optimized
- Ready for production use

---
**Build Date:** 2025-12-21
**Node Version Required:** 16+
**NPM Version Required:** 8+
