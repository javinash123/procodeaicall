================================================================================
                    AIAGENT PRODUCTION BUILD PACKAGE
================================================================================

BUILD INFORMATION:
- Build Date: December 21, 2025
- Version: 1.0.0
- Deployment URL: http://3.208.52.220/aiagent/

QUICK START:
1. Extract: tar -xzf aiagent-production-build.tar.gz
2. Install: npm install --production
3. Configure: Create .env file (see instructions below)
4. Run: node dist/index.cjs

================================================================================
STEP-BY-STEP DEPLOYMENT GUIDE
================================================================================

STEP 1: Upload to Server
-----------------------
Transfer the aiagent-production-build.tar.gz file to your AWS EC2 instance:
  scp aiagent-production-build.tar.gz ec2-user@3.208.52.220:/var/www/

STEP 2: Extract the Build
-------------------------
SSH into your server and extract:
  cd /var/www
  tar -xzf aiagent-production-build.tar.gz
  cd aiagent/

STEP 3: Install Dependencies
----------------------------
  npm install --production

STEP 4: Create Environment File
-------------------------------
Create a .env file in /var/www/aiagent/ with these variables:

  NODE_ENV=production
  PORT=3000
  MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/aiagent?retryWrites=true&w=majority
  SESSION_SECRET=your-secure-random-secret-key-here

Replace the values:
- MONGODB_URI: Your MongoDB connection string
- SESSION_SECRET: Generate a random secure key (e.g., using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

STEP 5: Start the Application
-----------------------------
Option A - Direct Start:
  node dist/index.cjs

Option B - Using PM2 (Recommended for Production):
  npm install -g pm2
  pm2 start dist/index.cjs --name "aiagent"
  pm2 save
  pm2 startup

STEP 6: Verify Apache Configuration
-----------------------------------
Your Apache VirtualHost should already be configured to proxy to port 3000.
If needed, the configuration should look like:

  <Location /aiagent>
    ProxyPass http://localhost:3000/
    ProxyPassReverse http://localhost:3000/
  </Location>

Then reload Apache:
  sudo systemctl reload apache2

================================================================================
WHAT'S INCLUDED IN THIS BUILD
================================================================================

✅ Frontend Build (dist/public/)
   - React application compiled and optimized
   - All pages configured for /aiagent/ base path
   - Static assets minified and gzipped
   - Ready to serve behind Apache proxy

✅ Backend Server (dist/index.cjs + server/)
   - Express.js server compiled
   - API routes for authentication, campaigns, leads, notes, appointments
   - MongoDB integration ready
   - Session management configured
   - Serves both API and static frontend

✅ Routing Configuration
   - After login: Redirects to http://3.208.52.220/aiagent/dashboard/
   - NOT to http://3.208.52.220/dashboard/
   - All routes properly prefixed with /aiagent/

================================================================================
VERIFICATION CHECKLIST
================================================================================

After deployment, verify the following URLs work:

1. Home Page:
   http://3.208.52.220/aiagent/
   Expected: Landing page with features, pricing, etc.

2. Login Page:
   http://3.208.52.220/aiagent/login
   Expected: Login form

3. Dashboard (after successful login):
   http://3.208.52.220/aiagent/dashboard/
   Expected: Main application dashboard with campaigns, leads, notes

4. API Health Check:
   curl http://3.208.52.220/api/auth/me
   Expected: 401 Unauthorized (if not logged in)

================================================================================
TROUBLESHOOTING
================================================================================

PROBLEM: "Cannot find module" errors
SOLUTION: 
  - Run: npm install --production
  - Ensure all dependencies are installed
  - Check Node.js version: node --version (should be 16+)

PROBLEM: Blank white page at /aiagent/
SOLUTION:
  - Check if Node.js app is running: ps aux | grep node
  - Test direct connection: curl http://localhost:3000/
  - Check application logs for errors
  - Verify MongoDB connection string in .env

PROBLEM: Redirects to wrong URL after login
SOLUTION: Already fixed in this build!
  - Uses wouter routing with /aiagent base path
  - No code changes needed
  - If still having issues, check browser cache (Ctrl+Shift+Del)

PROBLEM: Styling not loading
SOLUTION:
  - Clear browser cache completely
  - Check Apache proxy headers are correct
  - Verify dist/public/ folder exists and has assets
  - Check browser console for 404 errors

PROBLEM: API calls failing
SOLUTION:
  - Verify MongoDB MONGODB_URI is correct in .env
  - Check NODE_ENV=production is set
  - Test MongoDB connection: node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('Connected')).catch(e => console.log(e))"
  - Verify SESSION_SECRET is set

================================================================================
MONITORING & LOGS
================================================================================

If running directly (without PM2):
  - Output goes to console
  - Redirect to file: node dist/index.cjs >> app.log 2>&1 &

If using PM2:
  - View logs: pm2 logs aiagent
  - View specific line count: pm2 logs aiagent --lines 100
  - Clear logs: pm2 flush

Check error logs for MongoDB, validation, or routing issues.

================================================================================
FEATURES INCLUDED
================================================================================

✅ Authentication System (Login/Register)
✅ Campaign Management (Create, Edit, Delete, Search)
✅ Lead Management (Import, Track, Update Status)
✅ Appointment Scheduling
✅ Notes with DataTable Display
✅ Analytics Dashboard
✅ Admin Panel
✅ Dark/Light Theme Toggle
✅ Responsive Design
✅ Real-time Validation

All features are production-ready and tested.

================================================================================
SECURITY NOTES
================================================================================

- SESSION_SECRET: Use a strong, random value. Never use default values.
- MONGODB_URI: Keep your connection string secret. Don't commit to git.
- NODE_ENV=production: Ensures optimizations and security headers
- API requests: Use HTTPS in production (configure in Apache)

================================================================================
BUILD STATISTICS
================================================================================

Frontend Bundle Size:
- JavaScript: ~319 KB gzipped
- CSS: ~17.7 KB gzipped
- Total Assets: ~3.3 MB (including images)

Backend:
- Compiled server: ~2.3 MB
- All dependencies: ~500 MB (in node_modules after npm install)

Performance:
- Production optimized
- Minified and tree-shaken code
- Asset compression enabled

================================================================================
SUPPORT & QUESTIONS
================================================================================

If you encounter any issues:
1. Check the TROUBLESHOOTING section above
2. Review application logs: pm2 logs aiagent
3. Verify environment variables in .env
4. Test MongoDB connectivity
5. Verify Apache proxy configuration

Built on: Express.js + React + MongoDB + Vite
Deployment: AWS EC2 + Apache + Node.js

