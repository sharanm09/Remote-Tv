# Remote Camera Streaming + Device Control Application

A complete WebRTC-based camera streaming solution with remote device control. Stream from multiple cameras and control Smart TVs/Android devices simultaneously.

## Features

### Camera Streaming
- **Multiple Camera Streams**: Connect and stream from multiple cameras simultaneously
- **Real-time Viewing**: Watch live camera feeds with low latency (video only, no audio)
- **Secure Authentication**: Password-protected streaming (default: `ifocus@123`)
- **Mobile Support**: HTTPS enabled for mobile camera access
- **NAT Traversal**: Coturn TURN/STUN server support for reliable connections

### Device Control
- **Smart TV Control**: Remote control Samsung TV, LG TV, Android TV
- **Device Management**: Save device info (IP, type) during stream setup
- **Remote Interface**: Full D-Pad, volume, power, media controls
- **Session Management**: Persistent connections with token storage

## Architecture

- **Frontend**: React 18 with Vite, mediasoup-client, Socket.IO client
- **Node.js Backend**: Express, Socket.IO, mediasoup (Port 3001 HTTPS)
  - Acts as proxy for Python backend API calls
  - Handles WebRTC signaling and media routing
- **Python Backend**: FastAPI for device control (Port 8000 HTTP)
  - Device control via ADB and TV SDKs
  - Accessed only through Node.js backend (not directly from frontend)
- **Media Server**: mediasoup SFU for handling WebRTC streams
- **Signaling**: Socket.IO for real-time communication
- **Device Control**: Python SDKs for Samsung/LG/Android TV control
- **TURN/STUN**: Coturn server for NAT traversal (optional)

### Request Flow
```
Frontend (Browser)
    ↓ Socket.IO
Node.js Backend
    ↓ HTTP fetch
Python Backend
    ↓ ADB/TV SDK
Device (Android TV/Smart TV)
```

## Quick Start

### **All Servers Currently Running ✅**

1. **Python Backend** - `http://localhost:8000` (Remote Control API)
2. **Node.js Backend** - `https://localhost:3001` (Camera Streaming)
3. **React Frontend** - `https://localhost:3000` (Web Interface)

### **Access Now:**
- Desktop: `https://localhost:3000`
- Mobile (same WiFi): `https://192.168.10.53:3000`

### **Usage:**
1. Go to `/stream` → Enter device info + password → Start streaming
2. Go to `/live` → Login → View camera + Control device with remote

---

## Routes

- `/login` - Viewer login page
- `/live` - Watch camera feeds + remote control device
- `/stream` - Start camera stream + register device (password: `ifocus@123`)

## Prerequisites

- Node.js 16+ and npm
- Modern browser with WebRTC support
- Server with public IP (for production deployment)
- Coturn TURN server (for NAT traversal)

## Installation

### 1. Clone and Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Backend

Create `backend/.env` file:

```env
# Server Configuration
PORT=3001
SERVER_IP=192.168.10.53
STREAM_PASSWORD=ifocus@123

# Python Backend URL (for device control)
PYTHON_BACKEND_URL=http://localhost:8000

# TURN Server (Optional)
TURN_SERVER_URL=turn:your-server-ip:3478
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpassword
```

**Environment Variables:**
- `PORT` - Node.js backend port (default: 3001)
- `SERVER_IP` - Your server's IP address for network access
- `STREAM_PASSWORD` - Password for streaming authentication
- `PYTHON_BACKEND_URL` - Python backend URL for device control (default: http://localhost:8000)
- `TURN_SERVER_URL` - TURN server for NAT traversal (optional)
- `TURN_USERNAME` - TURN server username (optional)
- `TURN_PASSWORD` - TURN server password (optional)

Edit `backend/src/config.js` - Update `announcedIp` with your server's public IP:

```javascript
listenIps: [
  {
    ip: '0.0.0.0',
    announcedIp: 'YOUR_SERVER_PUBLIC_IP', // Replace this
  },
],
```

### 3. Setup Coturn (Optional but Recommended)

```bash
cd coturn
chmod +x install-coturn.sh
sudo ./install-coturn.sh

# Edit coturn config
sudo nano /etc/turnserver.conf
# Update: external-ip and user credentials

# Start coturn
sudo systemctl restart coturn
sudo systemctl enable coturn
```

## Running Locally

### Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

### Production Mode

**Backend:**
```bash
cd backend
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

## Usage

### For Viewers (Watching Cameras)

1. Go to `http://localhost:3000/login`
2. Enter your username
3. Click "Enter Viewing Room"
4. Select cameras from the sidebar to view
5. Multiple cameras can be viewed simultaneously

### For Streamers (Camera Streaming)

1. Go to `http://localhost:3000/stream`
2. Enter camera name (e.g., "Front Door Camera")
3. Enter password: `ifocus@123`
4. Click "Authenticate"
5. Click "Start Streaming"
6. Allow browser camera/microphone permissions

## Deployment

### Deploy on VPS/Cloud Server

1. **Server Requirements:**
   - Ubuntu 20.04+ or similar Linux distribution
   - Node.js 16+
   - Public IP address
   - Open ports: 3000, 3001, 3478, 5349, 10000-20000

2. **Firewall Configuration:**
```bash
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 3001/tcp  # Backend
sudo ufw allow 3478/tcp  # TURN TCP
sudo ufw allow 3478/udp  # TURN UDP
sudo ufw allow 5349/tcp  # TURN TLS
sudo ufw allow 10000:20000/udp  # mediasoup RTC
sudo ufw allow 10000:20000/tcp  # TURN relay
```

3. **Install and Configure:**
```bash
# Clone repository
git clone <your-repo>
cd remote_desktop

# Setup backend
cd backend
npm install
# Configure .env with your server's public IP
npm start

# Setup frontend (in new terminal)
cd frontend
npm install
npm run build
npm run preview

# Setup coturn
cd coturn
sudo ./install-coturn.sh
# Configure and restart
```

4. **Use PM2 for Process Management:**
```bash
npm install -g pm2

# Backend
cd backend
pm2 start src/server.js --name remote-camera-backend

# Frontend (serve build)
cd frontend
npm run build
pm2 serve dist 3000 --name remote-camera-frontend

pm2 save
pm2 startup
```

5. **Setup Nginx Reverse Proxy (Optional):**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Deploy with Docker (Optional)

Create `docker-compose.yml` in the root directory and deploy with Docker.

## Configuration

### Change Stream Password

Edit `backend/.env`:
```env
STREAM_PASSWORD=your_new_password
```

### Adjust Video Quality

In `frontend/src/pages/Stream.jsx`, modify the constraints:
```javascript
video: {
  width: { ideal: 1920 },  // Change resolution
  height: { ideal: 1080 },
  frameRate: { ideal: 30 }, // Change framerate
}
```

### Configure mediasoup Ports

Edit `backend/src/config.js`:
```javascript
worker: {
  rtcMinPort: 10000,  // Adjust port range
  rtcMaxPort: 10100,
}
```

## Troubleshooting

### Camera not connecting
- Check browser permissions for camera/microphone
- Verify TURN server is running: `sudo systemctl status coturn`
- Check firewall allows required ports

### Viewers can't see stream
- Ensure backend `announcedIp` is set to server's public IP
- Verify mediasoup ports (10000-10100) are open
- Check browser console for WebRTC errors

### High latency
- Reduce video quality settings
- Check network bandwidth
- Ensure TURN server is properly configured

### Socket connection fails
- Verify backend is running on port 3001
- Check CORS settings in `backend/src/server.js`
- Ensure frontend proxy is configured in `frontend/vite.config.js`

## Security Notes

- Change default password in production
- Use HTTPS/WSS in production
- Configure proper CORS origins
- Set up SSL certificates for TURN server
- Implement rate limiting
- Add proper authentication/authorization

## Tech Stack

- **Frontend**: React, Vite, mediasoup-client, Socket.IO client
- **Backend**: Node.js, Express, Socket.IO, mediasoup
- **TURN Server**: Coturn
- **Protocol**: WebRTC, Socket.IO

## License

MIT

## Support

For issues and questions, please check the troubleshooting section or open an issue in the repository.

