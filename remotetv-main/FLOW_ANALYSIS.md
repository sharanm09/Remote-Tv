# Complete Flow Analysis: Frontend → Node.js Backend → Python Backend

## Current Configuration

### 1. **Frontend (React)**
- **File**: `frontend/src/pages/Live.jsx`
- **Connection**: Socket.IO client
- **Server URL**: `VITE_SERVER_URL` or `http://localhost:3001`
- **Connection Code**:
  ```javascript
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
  socketRef.current = io(SERVER_URL);
  ```

### 2. **Node.js Backend (Express + Socket.IO)**
- **File**: `backend/src/server.js`
- **Port**: `3001` (HTTPS)
- **Python Backend URL**: 
  ```javascript
  const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  ```
- **Socket.IO Events for Python API**:
  - `checkExistingSession` → Python API `/sessions/check/{ip}`
  - `connectDevice` → Python API `POST /sessions`
  - `disconnectDevice` → Python API `POST /disconnect/{session_id}`
  - `sendRemoteCommand` → Python API `POST /send/{session_id}`

### 3. **Python Backend (FastAPI)**
- **File**: `frontend/src/main.py` (should be in separate backend folder)
- **Port**: `5042` (HTTPS if SSL certs exist, else HTTP)
- **Code**:
  ```python
  if os.path.exists(ssl_keyfile) and os.path.exists(ssl_certfile):
      uvicorn.run(app, host="0.0.0.0", port=5042, ssl_keyfile=ssl_keyfile, ssl_certfile=ssl_certfile)
  else:
      uvicorn.run(app, host="0.0.0.0", port=5042)
  ```

---

## ⚠️ PORT MISMATCH ISSUE

**Problem Identified**:
- Python backend runs on port **5042**
- Node.js backend expects Python backend on port **8000** (default)
- Docker Compose maps port **8000:8000** for Python backend

**This means**:
- If `PYTHON_BACKEND_URL` is not set correctly, Node.js will try to connect to `http://localhost:8000` but Python is running on port `5042`
- This will cause connection failures!

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND (Live.jsx)                                             │
│ - Socket.IO Client                                              │
│ - Connects to: http://localhost:3001 (Node.js Backend)         │
└─────────────────────────┬───────────────────────────────────────┘
                          │ Socket.IO Events
                          │ • checkExistingSession
                          │ • connectDevice
                          │ • disconnectDevice
                          │ • sendRemoteCommand
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ NODE.JS BACKEND (server.js:3001)                               │
│ - Socket.IO Server                                              │
│ - Express REST API                                              │
│ - Receives Socket.IO events from Frontend                       │
│ - Proxies to Python backend via HTTP fetch                     │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP fetch()
                          │ PYTHON_BACKEND_URL (default: http://localhost:8000)
                          │ But Python runs on port 5042!
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ PYTHON BACKEND (main.py:5042)                                  │
│ - FastAPI                                                        │
│ - Handles device control                                        │
│ - Returns JSON responses                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Flow Example: Sending Remote Command

### Step 1: User Clicks Button (Frontend)
```javascript
// Live.jsx - Line ~1168
<button onClick={() => sendCommand('key', { action: 'up' })}>▲</button>

// Calls sendCommand function (Line ~590)
const sendCommand = async (type, params) => {
  socketRef.current.emit('sendRemoteCommand', { 
    sessionId, 
    type,      // 'key'
    params     // { action: 'up' }
  }, callback);
};
```

### Step 2: Frontend → Node.js Backend (Socket.IO)
```javascript
// Live.jsx
socketRef.current.emit('sendRemoteCommand', { 
  sessionId: 'uuid-123',
  type: 'key',
  params: { action: 'up' }
}, (response) => {
  // Callback receives response from Node.js backend
});
```

**Transport**: WebSocket (Socket.IO protocol)  
**Destination**: `http://localhost:3001` (Node.js backend Socket.IO server)

### Step 3: Node.js Backend Receives Event
```javascript
// server.js - Line ~405
socket.on('sendRemoteCommand', async ({ sessionId, type, params }, callback) => {
  console.log('Forwarding remote command to Python backend:', { sessionId, type, params });
  
  // Makes HTTP request to Python backend
  const response = await fetch(`${PYTHON_BACKEND_URL}/send/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg: { type, ...params }  // { type: 'key', action: 'up' }
    })
  });
  
  const data = await response.json();
  callback({ success: true, data });  // Send back to frontend via Socket.IO
});
```

**Transport**: HTTP fetch  
**URL**: `${PYTHON_BACKEND_URL}/send/${sessionId}`  
**Default URL**: `http://localhost:8000/send/${sessionId}` ⚠️ **But Python runs on 5042!**

### Step 4: Python Backend Processes Request
```python
# main.py - Line ~1497
@app.post("/send/{session_id}")
async def send_command_to_device(session_id: str, payload: Payload):
    session = session_manager.get_session(session_id)
    msg = payload.msg  # { type: 'key', action: 'up' }
    
    if session.device_type == DeviceType.SAMSUNG_TV:
        tv = await SamsungTVController.ensure_connection(session)
        result = await SamsungTVController.send_key(tv, msg.get("action"))
        return result  # {"status": "success", "action": "up", ...}
```

**Endpoint**: `POST /send/{session_id}`  
**Port**: `5042` (but Node.js tries to connect to `8000`!)

### Step 5: Response Flow Back
```
Python Backend (5042) 
  ↓ HTTP Response: {"status": "success", ...}
Node.js Backend (3001) 
  ↓ Socket.IO callback: callback({ success: true, data })
Frontend (Live.jsx) 
  ↓ Response handler: console.log('✅ Command sent')
```

---

## Connection Flow: Device Connection

### Step 1: Frontend Loads Device Info
```javascript
// Live.jsx - Line ~479
const response = await fetch(`${SERVER_URL}/api/stream/${cameraName}/device`);
const data = await response.json();
setDeviceInfo(data.deviceInfo);  // { deviceIP, deviceType, cameraName }
```

**Endpoint**: `GET /api/stream/:cameraName/device` (Node.js REST API)

### Step 2: Frontend Checks Existing Session
```javascript
// Live.jsx - Line ~487
const hasExistingSession = await checkExistingSession(data.deviceInfo);

// checkExistingSession (Line ~570)
socketRef.current.emit('checkExistingSession', { deviceData }, (response) => {
  // Checks if session exists
});
```

**Socket.IO Event**: `checkExistingSession`  
**Frontend → Node.js**: Socket.IO

### Step 3: Node.js Backend Checks Python API
```javascript
// server.js - Line ~331
socket.on('checkExistingSession', async ({ deviceData }, callback) => {
  const response = await fetch(
    `${PYTHON_BACKEND_URL}/sessions/check/${deviceData.deviceIP}?device_type=${deviceData.deviceType}`
  );
  const data = await response.json();
  callback({ success: true, ...data });
});
```

**HTTP Request**: `GET ${PYTHON_BACKEND_URL}/sessions/check/{ip}?device_type={type}`  
**Node.js → Python**: HTTP fetch

### Step 4: Python Backend Checks Session
```python
# main.py - Line ~1345
@app.get("/sessions/check/{ip}")
async def check_existing_session(ip: str, device_type: str = None):
    sessions = session_manager.list_all()
    for session in sessions:
        if session["ip"] == ip and session["device_type"] == device_type:
            if session["status"] == "connected":
                return {"exists": True, "session": session}
    return {"exists": False}
```

**Endpoint**: `GET /sessions/check/{ip}`  
**Port**: `5042`

### Step 5: If No Session, Connect Device
```javascript
// Live.jsx - Line ~551
await connectToDevice(data.deviceInfo);

// connectToDevice (Line ~556)
socketRef.current.emit('connectDevice', { deviceData }, (response) => {
  setSessionId(response.sessionId);
});
```

**Socket.IO Event**: `connectDevice`  
**Frontend → Node.js**: Socket.IO

### Step 6: Node.js Backend Connects to Python
```javascript
// server.js - Line ~352
socket.on('connectDevice', async ({ deviceData }, callback) => {
  const response = await fetch(`${PYTHON_BACKEND_URL}/sessions`, {
    method: 'POST',
    body: JSON.stringify({
      ip: deviceData.deviceIP,
      device_type: deviceData.deviceType,
      tv_name: deviceData.cameraName
    })
  });
  callback({ success: true, sessionId: data.sessionId });
});
```

**HTTP Request**: `POST ${PYTHON_BACKEND_URL}/sessions`  
**Node.js → Python**: HTTP fetch

### Step 7: Python Backend Creates Session
```python
# main.py - Line ~1380
@app.post("/sessions", response_model=SessionResponse)
async def connect_device(req: ConnectRequest):
    session_id = str(uuid.uuid4())
    session = Session(session_id, req.ip, req.device_type, req.tv_name)
    session_manager.add_session(session)
    # ... connect to device ...
    return SessionResponse(
        sessionId=session_id,
        status=SessionStatus.CONNECTED
    )
```

**Endpoint**: `POST /sessions`  
**Port**: `5042`

---

## Configuration Issues & Fixes

### Issue 1: Port Mismatch
**Problem**: Python runs on `5042` but Node.js expects `8000`

**Fix Options**:

1. **Change Python Backend Port to 8000**:
   ```python
   # main.py - Line 1985, 1988
   uvicorn.run(app, host="0.0.0.0", port=8000)  # Change from 5042 to 8000
   ```

2. **Set Environment Variable**:
   ```bash
   # In Node.js backend .env or environment
   PYTHON_BACKEND_URL=http://localhost:5042
   ```

3. **Update Docker Compose**:
   ```yaml
   python-backend:
     ports:
       - "5042:5042"  # Instead of 8000:8000
   ```

### Issue 2: Protocol Mismatch (HTTP vs HTTPS)
**Problem**: Python can run with HTTPS (if SSL certs exist) but Node.js tries HTTP

**Fix**: Ensure consistent protocol:
```javascript
// If Python uses HTTPS on 5042
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'https://localhost:5042';
```

### Issue 3: Docker Network Communication
**Problem**: In Docker, services use service names, not `localhost`

**Fix**: Use Docker service name:
```javascript
// In Docker Compose, Node.js backend should use:
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://python-backend:5042';
```

---

## Summary

✅ **Frontend → Node.js**: Socket.IO (WebSocket) - **Working**  
✅ **Node.js → Python**: HTTP fetch - **Configured but port mismatch**  
⚠️ **Port Issue**: Python runs on `5042`, Node.js expects `8000`  
⚠️ **Need to fix**: Either change Python port or set `PYTHON_BACKEND_URL` environment variable

**Recommended Fix**:
1. Set `PYTHON_BACKEND_URL=http://localhost:5042` in Node.js backend environment
2. OR change Python backend to run on port `8000` to match default

