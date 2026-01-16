# Remote Desktop Control System - Architecture Flow

## System Overview

A 3-tier architecture for remote camera streaming and device control, consisting of:
1. React Frontend (Browser-based UI)
2. Node.js Backend (WebRTC Signaling and API Gateway)
3. Python Backend (Device Control Engine)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER (Browser)                          │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │   Login Page     │  │   Live Page      │  │  Stream Page     │   │
│  │   (Login.jsx)    │  │   (Live.jsx)     │  │  (Stream.jsx)    │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘   │
│         │                      │                        │              │
│         └──────────────────────┼────────────────────────┘              │
│                                │                                        │
│                    ┌───────────▼───────────┐                          │
│                    │   React App (App.jsx) │                          │
│                    │   - Socket.IO Client  │                          │
│                    │   - mediasoup-client │                          │
│                    └───────────┬───────────┘                          │
└────────────────────────────────┼──────────────────────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │   Socket.IO (WebSocket)   │
                    │   HTTP/REST API           │
                    └─────────────┬─────────────┘
                                 │
┌─────────────────────────────────▼──────────────────────────────────────┐
│                    NODE.JS BACKEND LAYER                                │
│                    (Express + Socket.IO + mediasoup)                   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  server.js (Port 3001)                                       │    │
│  │  - Socket.IO Server                                           │    │
│  │  - Express REST API                                           │    │
│  │  - WebRTC Signaling                                           │    │
│  │  - Device Management (MySQL/JSON)                             │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                              │                                         │
│  ┌───────────────────────────▼──────────────────────────┐            │
│  │  mediasoup.js                                          │            │
│  │  - WebRTC SFU (Selective Forwarding Unit)             │            │
│  │  - Router & Transport Management                        │            │
│  │  - Producer/Consumer Handling                          │            │
│  └────────────────────────────────────────────────────────┘            │
│                              │                                         │
│                    ┌─────────▼─────────┐                               │
│                    │  HTTP fetch()     │                               │
│                    │  (API Proxy)     │                               │
│                    └─────────┬─────────┘                               │
└──────────────────────────────┼────────────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   HTTP REST API       │
                    │   (JSON)              │
                    └───────────┬───────────┘
                                │
┌─────────────────────────────────▼──────────────────────────────────────┐
│                    PYTHON BACKEND LAYER                                │
│                    (FastAPI - Device Control)                          │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  main.py (Port 5042)                                         │    │
│  │  - FastAPI REST API                                           │    │
│  │  - Session Management                                         │    │
│  │  - Device Controllers                                         │    │
│  │  - Token Management                                           │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                              │                                         │
│  ┌───────────────────────────▼──────────────────────────┐            │
│  │  Device Controllers                                    │            │
│  │  - SamsungTVController                                 │            │
│  │  - LGTVController                                      │            │
│  │  - AndroidController (ADB)                            │            │
│  │  - RokuController                                      │            │
│  └────────────────────────────────────────────────────────┘            │
└────────────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Device Protocols    │
                    └───────────┬───────────┘
                                │
┌─────────────────────────────────▼──────────────────────────────────────┐
│                         DEVICE LAYER                                    │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ Samsung TV   │  │   LG TV      │  │ Android TV    │               │
│  │ (WebSocket)  │  │  (WebOS API) │  │   (ADB)       │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Frontend Layer (React)

Technology Stack:
- React 18 with Vite
- Socket.IO Client
- mediasoup-client (WebRTC)
- React Router

Key Components:
- App.jsx - Main router
- Live.jsx - Video viewing and remote control UI
- Stream.jsx - Camera streaming setup
- Login.jsx - User authentication

Responsibilities:
- User interface rendering
- WebRTC media consumption (video playback)
- Remote control UI (D-pad, buttons, text input)
- Real-time communication via Socket.IO
- Device logs display

### 2. Node.js Backend Layer

Technology Stack:
- Express.js (REST API)
- Socket.IO (WebSocket signaling)
- mediasoup (WebRTC SFU)
- MySQL2 (Device storage)

Key Files:
- server.js - Main server, Socket.IO handlers, API endpoints
- mediasoup.js - WebRTC router and transport management
- config.js - mediasoup configuration

Responsibilities:
- WebRTC signaling (ICE candidates, DTLS, SDP)
- Media routing (SFU - Selective Forwarding Unit)
- Device management (CRUD operations)
- API gateway (proxies requests to Python backend)
- Stream management (producer/consumer lifecycle)

Port: 3001 (HTTPS via nginx)

### 3. Python Backend Layer

Technology Stack:
- FastAPI (REST API)
- pywebostv (LG TV control)
- samsungtvws (Samsung TV control)
- ADB - Android Debug Bridge (Android TV control)

Key File:
- main.py - FastAPI app, device controllers, session management

Responsibilities:
- Device connection management
- Remote control command execution
- Session lifecycle (connect, maintain, disconnect)
- Token/pairing management (Samsung/LG TVs)
- Device logs capture and retrieval

Port: 5042 (HTTPS if SSL certs exist, else HTTP)

## Why Python Backend is Deployed Locally

The Python backend must be deployed on the local network where the TVs/devices are located for the following reasons:

1. Network Access: The Python backend needs direct network access to the local TV devices. TVs are typically on private local networks (192.168.x.x) and are not accessible from external networks.

2. ADB Requirements: For Android TV control, ADB (Android Debug Bridge) requires direct network connectivity to the device. ADB communicates over local network IP addresses (typically port 5555) and cannot work through firewalls or NAT without complex port forwarding.

3. TV SDK Limitations: Samsung TV and LG TV SDKs (samsungtvws and pywebostv) require the control application to be on the same local network as the TV for initial pairing and ongoing control.

4. Low Latency: Local deployment ensures minimal latency for remote control commands, providing responsive user experience.

5. Security: Keeping the control backend local reduces exposure of device control interfaces to the internet.

## Python Backend Deployment Architecture

The Python backend is designed to be deployed independently with a static IP address:

1. Static IP Configuration: The Python backend runs on a machine with a static IP address (e.g., 192.168.1.100) on the local network where TVs are located.

2. Node.js Connection: The Node.js backend (which can be deployed on a cloud server or remote location) connects to the Python backend using its static IP address via HTTP/HTTPS.

3. Environment Variable: Node.js backend uses the PYTHON_BACKEND_URL environment variable to point to the Python backend's static IP:
   PYTHON_BACKEND_URL=http://192.168.1.100:5042

4. Flexible Deployment: To connect TVs in any environment, simply deploy the Python backend in that environment:
   - Install Python backend on a local machine in the target network
   - Configure static IP or use DHCP reservation
   - Update Node.js backend's PYTHON_BACKEND_URL to point to the new Python backend
   - Python backend will automatically discover and connect to TVs on its local network

5. Multiple Environments: You can have multiple Python backends deployed in different locations, each controlling TVs in their respective local networks, all connecting to the same Node.js backend.

## ADB (Android Debug Bridge) Details

ADB is used for controlling Android TV devices:

1. Connection Methods:
   - USB Connection: Direct USB cable connection for initial setup
   - WiFi Connection: ADB over WiFi (port 5555) for wireless control
   - Pairing: Some devices require pairing code for WiFi ADB

2. ADB Commands Used:
   - adb connect IP:5555 - Connect to Android device over network
   - adb pair IP:PORT CODE - Pair with device using pairing code
   - adb shell input keyevent KEYCODE - Send key events to device
   - adb logcat - Capture device logs

3. Android TV Control:
   - Key events: D-pad navigation, home, back, menu buttons
   - Text input: Virtual keyboard input
   - App launching: Launch applications by package name
   - Log capture: Real-time logcat output for debugging

4. Device Detection:
   - Checks if device responds to ADB on port 5555
   - Verifies device is listed in adb devices output
   - Distinguishes Android devices from Samsung/LG TVs

5. TCL TV Support:
   - Special handling for TCL TVs which use ADB over WiFi
   - Supports both standard ADB and SDB (Samsung Debug Bridge) for Tizen-based TCL TVs

## Data Flow: Remote Control Command

Example: User clicks "Up" button on remote

1. USER ACTION
   Live.jsx: User clicks Up button
   sendCommand('key', { action: 'up' })

2. FRONTEND TO NODE.JS (Socket.IO)
   socket.emit('sendRemoteCommand', {
     sessionId: 'uuid-123',
     type: 'key',
     params: { action: 'up' }
   })
   Protocol: WebSocket (Socket.IO)
   Destination: ws://server:3001/socket.io/

3. NODE.JS BACKEND (server.js)
   socket.on('sendRemoteCommand', async ({ sessionId, type, params }, callback) => {
     const response = await fetch(`${PYTHON_BACKEND_URL}/send/${sessionId}`, {
       method: 'POST',
       body: JSON.stringify({ msg: { type, ...params } })
     });
     callback({ success: true, data: await response.json() });
   })
   Protocol: HTTP fetch
   Destination: http://python-backend-static-ip:5042/send/{sessionId}

4. PYTHON BACKEND (main.py)
   @app.post("/send/{session_id}")
   async def send_command_to_device(session_id: str, payload: Payload):
     session = session_manager.get_session(session_id)
     if session.device_type == DeviceType.SAMSUNG_TV:
       tv = await SamsungTVController.ensure_connection(session)
       result = await SamsungTVController.send_key(tv, 'KEY_UP')
       return result
     elif session.device_type == DeviceType.ANDROID:
       result = AndroidController.adb_shell(session.ip, ['input', 'keyevent', 'DPAD_UP'])
       return result
   Protocol: Device-specific (WebSocket for Samsung, WebOS API for LG, ADB for Android)

5. DEVICE
   Samsung TV receives KEY_UP command
   TV navigates up
   
   OR
   
   Android TV receives DPAD_UP via ADB
   TV navigates up

6. RESPONSE FLOW (Reverse)
   Python Backend returns: { "status": "success", "action": "up" }
   Node.js Backend forwards via Socket.IO callback
   Frontend receives: console.log('Command sent')

## Data Flow: Video Streaming

Example: User views camera stream

1. USER ACTION
   Live.jsx: User selects camera from dropdown
   startViewing(cameraName)

2. FRONTEND TO NODE.JS (Socket.IO)
   socket.emit('getRouterRtpCapabilities')
   Receive router RTP capabilities
   socket.emit('createConsumerTransport', { cameraName })
   Receive transport parameters (ICE, DTLS)

3. FRONTEND (WebRTC Setup)
   mediasoup-client creates WebRTC transport
   Exchange ICE candidates via Socket.IO
   Establish DTLS connection
   socket.emit('consume', { cameraName, rtpCapabilities })
   Receive consumer parameters

4. NODE.JS BACKEND (mediasoup)
   Creates consumer transport
   Creates consumer from existing producer
   Returns consumer RTP parameters

5. FRONTEND (Media Playback)
   Creates MediaStream from consumer track
   Attaches to video element
   Video plays in browser

6. MEDIA FLOW (WebRTC)
   Producer (camera) to mediasoup Router to Consumer (viewer)
   Protocol: WebRTC (RTP/SRTP over UDP)
   Codec: VP8/VP9/H264 (video), Opus (audio)

## Session Management Flow

Device Connection Lifecycle

1. DEVICE DISCOVERY
   Frontend loads devices from: GET /api/devices
   Node.js queries MySQL/JSON file
   Returns: { cameraName, deviceIP, deviceType }

2. SESSION CHECK
   Frontend: socket.emit('checkExistingSession', { deviceData })
   Node.js: fetch(`${PYTHON_BACKEND_URL}/sessions/check/{ip}`)
   Python: Checks if active session exists
   Returns: { exists: true/false, session: {...} }

3. CONNECTION (if no session)
   Frontend: socket.emit('connectDevice', { deviceData })
   Node.js: fetch(`${PYTHON_BACKEND_URL}/sessions`, { method: 'POST' })
   Python: 
   - Creates Session object
   - Connects to device (Samsung/LG/Android via ADB)
   - Stores tokens/keys if needed
   - Returns: { sessionId, status: 'connected' }

4. SESSION MAINTENANCE
   Python: Keep-alive pings (Samsung TV every 30s)
   Session stored in memory (SessionManager)
   Tokens stored in files (tokens/samsung_tokens.json, tokens/lg_tokens.json)
   ADB connections maintained via periodic keep-alive

5. DISCONNECTION
   Frontend: socket.emit('disconnectDevice', { sessionId })
   Node.js: fetch(`${PYTHON_BACKEND_URL}/disconnect/{sessionId}`, { method: 'POST' })
   Python:
   - Closes device connections
   - Disconnects ADB if Android device
   - Cancels keep-alive tasks
   - Removes session from SessionManager

## API Endpoints Summary

### Node.js Backend (Port 3001)

REST API:
- GET /api/devices - List all devices
- POST /api/devices - Add/update device
- PUT /api/devices/:deviceName - Update device
- DELETE /api/devices/:deviceName - Delete device
- GET /api/streams - List active streams
- GET /api/stream/:cameraName/device - Get device info for stream

Socket.IO Events:
- getRouterRtpCapabilities - Get WebRTC capabilities
- createProducerTransport - Create producer transport (camera)
- createConsumerTransport - Create consumer transport (viewer)
- produce - Start producing media
- consume - Start consuming media
- checkExistingSession - Check if device session exists
- connectDevice - Connect to device (proxies to Python)
- disconnectDevice - Disconnect from device (proxies to Python)
- sendRemoteCommand - Send remote control command (proxies to Python)
- getDeviceLogs - Get device logs (proxies to Python)

### Python Backend (Port 5042)

REST API:
- POST /sessions - Create device session
- GET /sessions/check/{ip} - Check existing session
- GET /sessions/{session_id}/status - Get session status
- GET /sessions/{session_id}/logs - Get device logs
- POST /send/{session_id} - Send remote control command
- POST /disconnect/{session_id} - Disconnect session
- GET /sessions - List all sessions
- GET /tokens/samsung - Get Samsung TV tokens
- GET /tokens/lg - Get LG TV tokens
- POST /samsung/authenticate - Authenticate Samsung TV
- POST /android/pair - Pair Android device via ADB
- POST /android/connect - Connect to Android device via ADB
- POST /android/enable-wifi - Enable WiFi ADB on Android device
- GET /detect/{ip} - Detect device type
- GET /health - Health check

## Technology Stack Summary

Layer | Technology | Purpose
------|-----------|--------
Frontend | React 18 | UI rendering
 | Vite | Build tool
 | Socket.IO Client | Real-time communication
 | mediasoup-client | WebRTC client
 | React Router | Navigation
Node.js Backend | Express | REST API
 | Socket.IO | WebSocket signaling
 | mediasoup | WebRTC SFU
 | MySQL2 | Device storage
Python Backend | FastAPI | Device control API
 | pywebostv | LG TV control
 | samsungtvws | Samsung TV control
 | ADB (Android Debug Bridge) | Android TV control
 | subprocess | ADB command execution
Infrastructure | nginx | Reverse proxy, SSL
 | Coturn | TURN/STUN server
 | Docker | Containerization (optional)

## Port Configuration

Service | Port | Protocol | Purpose
--------|------|----------|--------
React Frontend | 3000 | HTTPS | Web UI
Node.js Backend | 3001 | HTTPS | API and Signaling
Python Backend | 5042 | HTTP/HTTPS | Device Control
ADB (Android) | 5555 | TCP | Android Debug Bridge
Coturn TURN | 3478 | UDP/TCP | NAT Traversal
Coturn TLS | 5349 | TCP | Secure TURN
mediasoup RTC | 10000-20000 | UDP | WebRTC Media

## Key Design Patterns

1. API Gateway Pattern: Node.js acts as gateway, proxying device control requests to Python backend
2. SFU Architecture: mediasoup uses Selective Forwarding Unit (one-to-many streaming)
3. Session Management: Python backend maintains device sessions with keep-alive
4. Token Management: Persistent storage of TV authentication tokens
5. Separation of Concerns: 
   - Node.js handles WebRTC/media
   - Python handles device control
   - Frontend handles UI/UX
6. Local Deployment Pattern: Python backend deployed locally for direct device access

## Security Considerations

- HTTPS/WSS: All connections use SSL/TLS in production
- Password Protection: Stream authentication required
- Token Storage: Secure storage of device tokens
- CORS: Configured for cross-origin requests
- Session Isolation: Each device session is isolated
- Local Network Isolation: Python backend on local network reduces attack surface

## Scalability Notes

- Horizontal Scaling: Multiple mediasoup workers can be spawned
- Load Balancing: nginx can distribute requests
- Database: MySQL for persistent device storage
- Stateless API: Python backend is stateless (sessions in memory)
- Distributed Python Backends: Multiple Python backends can be deployed in different locations

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    nginx (Port 443)                     │
│              (SSL Termination, Reverse Proxy)           │
└───────────────┬───────────────────┬───────────────────┘
                │                   │
    ┌───────────▼────────┐  ┌───────▼──────────┐
    │  React Frontend    │  │  Node.js Backend │
    │  (Port 3000)       │  │  (Port 3001)     │
    └────────────────────┘  └────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  Python Backend     │
                          │  (Static IP:        │
                          │   192.168.1.100:5042)│
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │   Local Network     │
                          └──────────┬──────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
    ┌───────▼────────┐      ┌────────▼────────┐      ┌────────▼────────┐
    │  Samsung TV    │      │    LG TV        │      │  Android TV     │
    │  192.168.1.50  │      │  192.168.1.51   │      │ 192.168.1.52:5555│
    └────────────────┘      └─────────────────┘      └─────────────────┘
```

## Environment Variables

### Node.js Backend (.env)
```
PORT=3001
SERVER_IP=192.168.10.53
STREAM_PASSWORD=ifocus@123
PYTHON_BACKEND_URL=http://192.168.1.100:5042
DB_HOST=217.21.90.204
DB_USER=u635298195_remotetv
DB_PASSWORD=PC7ByIq5uC@
DB_NAME=u635298195_remotetv
```

### Python Backend
- Runs on port 5042 (configurable in main.py)
- SSL certificates: frontend/key.pem, frontend/cert.pem (optional)
- Must be deployed on local network with static IP
- Configured to access local TV devices

## Deployment Flexibility

To connect TVs in any environment:

1. Deploy Python Backend Locally:
   - Install Python backend on a machine in the target network
   - Configure static IP address or use DHCP reservation
   - Ensure Python backend can reach TVs on local network
   - Install required dependencies (ADB, TV SDKs)

2. Update Node.js Configuration:
   - Set PYTHON_BACKEND_URL to point to the new Python backend's static IP
   - Node.js backend will automatically route device control requests

3. Multiple Locations:
   - Deploy separate Python backends in each location
   - Each Python backend controls TVs in its local network
   - All Python backends connect to the same Node.js backend
   - Frontend can control TVs across all locations

4. Benefits:
   - No need to expose TV control interfaces to internet
   - Low latency for remote control commands
   - Secure local network communication
   - Easy to add new locations by deploying Python backend

## Conclusion

This architecture provides:
- Real-time video streaming via WebRTC
- Remote device control via Python SDKs and ADB
- Scalable SFU via mediasoup
- Separation of concerns (media vs. control)
- Persistent device management via MySQL
- Secure communication via HTTPS/WSS
- Flexible deployment with local Python backends
- Support for multiple device types (Samsung TV, LG TV, Android TV via ADB)

The system is designed for production use with proper error handling, logging, and scalability considerations. The Python backend's local deployment ensures direct access to TV devices while maintaining security and low latency.
