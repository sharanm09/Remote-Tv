# Remote Desktop Deployment Guide

## 📍 Deployment Locations on VM

### Main Application Directory
```
/root/remote_desktop/
```

### Frontend Deployment
- **Source Code:** `/root/remote_desktop/frontend/`
- **Built Files:** `/root/remote_desktop/frontend/dist/`
- **Served By:** Nginx (static files)
- **Public URL:** `https://remotetv.ifocussystec.info`
- **Nginx Config:** `/etc/nginx/sites-available/remotetv`

### Backend Deployment
- **Source Code:** `/root/remote_desktop/backend/`
- **Entry Point:** `/root/remote_desktop/backend/src/server.js`
- **Running Via:** PM2 process `camera-backend`
- **Working Directory:** `/root/remote_desktop/backend`
- **Port:** `4001` (localhost)
- **PM2 Process ID:** Check with `pm2 status`

## 🌐 How It Works

### Frontend
- Built React application in `/root/remote_desktop/frontend/dist/`
- Served directly by Nginx as static files
- Accessible at: `https://remotetv.ifocussystec.info`

### Backend
- Node.js backend running via PM2
- Process name: `camera-backend`
- Listens on: `localhost:4001`
- Proxied through Nginx:
  - API: `https://remotetv.ifocussystec.info/api` → `http://localhost:4001/api`
  - Socket.IO: `https://remotetv.ifocussystec.info/socket.io` → `http://localhost:4001/socket.io`

### Nginx Reverse Proxy
- Configuration: `/etc/nginx/sites-available/remotetv`
- Enabled via symlink: `/etc/nginx/sites-enabled/remotetv`
- Handles:
  - HTTPS termination (ports 80/443)
  - Frontend static file serving
  - Backend API proxying
  - Socket.IO WebSocket proxying

## 📝 Quick Commands

### Check Status
```bash
# PM2 status
pm2 status

# Check backend logs
pm2 logs camera-backend

# Check nginx status
systemctl status nginx

# Check ports
ss -tlnp | grep -E ':(4001|443|80)'
```

### Deploy Updates

#### Frontend
```bash
# 1. Copy updated files
scp frontend/src/** root@72.60.101.240:/root/remote_desktop/frontend/src/

# 2. Build on server
ssh root@72.60.101.240 "cd /root/remote_desktop/frontend && npm run build"

# 3. Set permissions
ssh root@72.60.101.240 "chmod -R 755 /root/remote_desktop/frontend/dist"
```

#### Backend
```bash
# 1. Copy updated files
scp backend/src/** root@72.60.101.240:/root/remote_desktop/backend/src/

# 2. Restart PM2 process
ssh root@72.60.101.240 "cd /root/remote_desktop/backend && pm2 restart camera-backend"
```

### Restart Services
```bash
# Restart backend
pm2 restart camera-backend

# Restart nginx
systemctl restart nginx

# Restart all PM2 processes
pm2 restart all
```

### View Logs
```bash
# Backend logs
pm2 logs camera-backend

# Nginx error logs
tail -f /var/log/nginx/error.log

# Nginx access logs
tail -f /var/log/nginx/access.log
```

## 🔧 Configuration Files

### Backend
- **Config:** `/root/remote_desktop/backend/src/config.js`
  - Mediasoup configuration
  - `announcedIp`: Server public IP (72.60.101.240)
- **Server:** `/root/remote_desktop/backend/src/server.js`
- **Devices JSON:** `/root/remote_desktop/backend/src/devices.json` (fallback, uses database)

### Frontend
- **Config:** `/root/remote_desktop/frontend/vite.config.js`
- **Source Files:** `/root/remote_desktop/frontend/src/`
- **Build Output:** `/root/remote_desktop/frontend/dist/`

### Nginx
- **Main Config:** `/etc/nginx/nginx.conf`
- **Site Config:** `/etc/nginx/sites-available/remotetv`
- **Enabled Link:** `/etc/nginx/sites-enabled/remotetv`
- **SSL Certificates:** `/etc/nginx/ssl/`
  - `certificate.crt`
  - `private.key`
  - `ca_bundle.crt`

## 🌍 Environment Details

### Server
- **IP:** `72.60.101.240`
- **Domain:** `remotetv.ifocussystec.info`
- **OS:** Linux (Ubuntu/Debian based)
- **User:** `root`

### Ports
- **80:** HTTP (redirects to HTTPS)
- **443:** HTTPS (nginx)
- **4001:** Backend (localhost only, proxied through nginx)
- **9000:** Not used (PM2 frontend service removed, using nginx)

### Services
- **Nginx:** Systemd service (`systemctl`)
- **Backend:** PM2 process (`camera-backend`)
- **Database:** MySQL (external: 217.21.90.204)
- **Python Backend:** External API (106.51.69.50:5042)

## 📊 Monitoring

### Check Service Health
```bash
# PM2 status
pm2 status

# Check if backend is responding
curl -s http://localhost:4001/api/devices | head -5

# Check if frontend is accessible
curl -k -s https://localhost/ | head -5

# Check nginx
nginx -t  # Test configuration
```

### Resource Usage
```bash
# PM2 monitoring
pm2 monit

# System resources
htop  # or top

# Disk space
df -h
```

## 🔄 Deployment Workflow

1. **Update Source Files**
   - Frontend: Update files in `frontend/src/`
   - Backend: Update files in `backend/src/`

2. **Copy to Server**
   - Use `scp` or `rsync` to copy files to VM

3. **Build/Install**
   - Frontend: Run `npm run build` to create `dist/`
   - Backend: Restart PM2 process (auto-installs if needed)

4. **Set Permissions**
   - Frontend: `chmod -R 755 dist/`
   - Backend: Already handled by PM2

5. **Restart Services**
   - Backend: `pm2 restart camera-backend`
   - Nginx: `systemctl restart nginx` (only if config changed)

## 🚨 Troubleshooting

### Backend Not Responding
```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs camera-backend

# Restart backend
pm2 restart camera-backend

# Check if port 4001 is listening
ss -tlnp | grep 4001
```

### Frontend Not Loading
```bash
# Check if dist folder exists
ls -la /root/remote_desktop/frontend/dist/

# Check nginx config
nginx -t

# Check nginx logs
tail -f /var/log/nginx/error.log

# Restart nginx
systemctl restart nginx
```

### API Not Working
```bash
# Test backend directly
curl http://localhost:4001/api/devices

# Test through nginx
curl -k https://localhost/api/devices

# Check nginx proxy config
grep -A 5 "location /api" /etc/nginx/sites-available/remotetv
```

### SSL Issues
```bash
# Check SSL certificates
ls -la /etc/nginx/ssl/

# Test SSL
openssl s_client -connect remotetv.ifocussystec.info:443

# Renew certificates (if using Let's Encrypt)
certbot renew
```

## 📋 Important Notes

- **No PM2 Frontend Service:** Frontend is served directly by Nginx from `dist/` folder
- **Backend Port:** Only accessible via localhost (4001), proxied through nginx
- **Database:** Uses external MySQL database, not local
- **Python Backend:** External service for device remote control
- **SSL:** Configured with certificates in `/etc/nginx/ssl/`
- **Auto-retry:** Stream page has auto-retry logic for reconnection

## 🔐 Security

- HTTPS enforced via nginx (HTTP redirects to HTTPS)
- Backend only accessible via nginx proxy (not exposed directly)
- SSL certificates configured
- Firewall: Only ports 80, 443 open to public

---

**Last Updated:** November 3, 2025
**Server:** 72.60.101.240
**Domain:** remotetv.ifocussystec.info

