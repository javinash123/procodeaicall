# NIJVOX - EC2 Deployment

## Files
- `dist/index.cjs` — compiled backend (Node.js)
- `dist/public/` — compiled frontend (served as static files)
- `package.json` — production dependencies only
- `.env.production` — fill in your values

## Steps on EC2

1. Upload and extract this package on your EC2 instance

2. Install Node.js dependencies:
   ```bash
   npm install --omit=dev
   ```

3. Copy and configure environment:
   ```bash
   cp .env.production .env
   nano .env   # fill in MONGODB_URI and SESSION_SECRET
   ```

4. Create uploads directory:
   ```bash
   mkdir -p uploads
   ```

5. Start the app:
   ```bash
   npm start
   # or with pm2:
   pm2 start dist/index.cjs --name nijvox --env production
   ```

## Nginx config snippet
```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## Notes
- The app serves on PORT 5000 by default
- WebSocket paths: /stream and /exotel-stream
- File uploads go to ./uploads/ (relative to working directory)
- SESSION_SECRET must be a long random string (not the default)
