# 🚀 Quick Start Guide - All Systems Running!

## ✅ Current Status

### **All 3 Servers Running:**
- ✅ **Frontend (React + Vite)** → Port `3000` (HTTPS)
- ✅ **Node.js Backend (mediasoup)** → Port `3001` (HTTPS)
- ✅ **Python Backend (Remote Control)** → Port `8000` (HTTP)

---

## 🌐 Access URLs

### **From Computer (localhost):**
- Frontend: `https://localhost:3000`
- Stream Page: `https://localhost:3000/stream`
- Live Page: `https://localhost:3000/live`
- Login Page: `https://localhost:3000/login`

### **From Mobile/Other Devices (same WiFi):**
- Frontend: `https://192.168.0.157:3000`
- Stream: `https://192.168.0.157:3000/stream`
- Live: `https://192.168.0.157:3000/live`

### **Backend APIs:**
- Node.js: `https://192.168.0.157:3001`
- Python: `http://localhost:8000`
- Python Docs: `http://localhost:8000/docs` (API documentation)

---

## 📱 How to Use

### **1. Start Camera Stream + Register Device**

**Open:** `https://localhost:3000/stream` (or with your IP for mobile)

**Fill in the form:**
- **Camera Name**: `Living Room Camera` (or any name)
- **Device IP Address**: `192.168.0.147` (your TV/device IP)
- **Device Type**: Select one:
  - Samsung TV
  - LG TV
  - Android TV
- **Password**: `ifocus@123`

**Click "Authenticate"** → **Click "Start Streaming"**

✅ **What happens:**
- Camera stream starts (mediasoup)
- Device info saved to localStorage
- Ready for remote control!

---

### **2. View Streams**

**Open:** `https://localhost:3000/login`

- Enter your username
- Click "Enter Viewing Room"
- Select camera from sidebar
- ✅ Video appears!

---

### **3. Remote Control (To Be Added)**

Device info is saved! Now you can add remote control buttons to send commands like:

```javascript
// Send command to device
await fetch('http://localhost:8000/send/${sessionId}', {
  method: 'POST',
  body: JSON.stringify({
    msg: {
      type: 'key',
      action: 'up'  // up, down, left, right, enter, back, home, power
    }
  })
});
```

---

## 🔧 Updated Stream Page Features

### **New Fields Added:**

```
┌─────────────────────────────────────┐
│   Start Camera Stream               │
│   Enter credentials to begin        │
│                                     │
│   Camera Name                       │
│   [Front Door Camera    ]          │
│                                     │
│   Device IP Address    ← NEW        │
│   [192.168.0.147       ]          │
│                                     │
│   Device Type          ← NEW        │
│   [Samsung TV ▼        ]          │
│                                     │
│   Stream Password                   │
│   [••••••••••••        ]          │
│                                     │
│   [    Authenticate    ]           │
│                                     │
│   [  Back to Login     ]           │
└─────────────────────────────────────┘
```

---

## 🎮 Available Remote Control Commands

Once connected to a device, you can send:

### **Navigation:**
- `up`, `down`, `left`, `right`
- `enter` (OK button)
- `back`, `home`, `menu`

### **Media:**
- `play`, `pause`, `stop`

### **Volume:**
- `volume_up`, `volume_down`, `mute`

### **System:**
- `power`

### **Numbers:**
- `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`

---

## 📊 System Architecture

```
┌──────────────────────────────────────────────────────┐
│                   User Browser                       │
│  https://localhost:3000 or https://192.168.0.157:3000│
└─────────────┬────────────────────────┬───────────────┘
              │                        │
    Camera Streaming              Remote Control
    (WebRTC/Socket.IO)           (HTTP REST API)
              │                        │
              ↓                        ↓
┌──────────────────────┐  ┌──────────────────────────┐
│ Node.js Backend      │  │  Python Backend          │
│ (Port 3001 HTTPS)    │  │  (Port 8000 HTTP)        │
│                      │  │                          │
│ - mediasoup SFU      │  │  - Device Controllers    │
│ - Camera streams     │  │  - Samsung TV SDK        │
│ - Socket.IO          │  │  - LG TV SDK             │
│ - Authentication     │  │  - Android ADB           │
│                      │  │  - Session Management    │
└──────────────────────┘  └────────────┬─────────────┘
                                       │
                                       ↓
                          ┌────────────────────────────┐
                          │   Physical Devices         │
                          │   - Samsung TV (WebSocket) │
                          │   - LG TV (webOS)          │
                          │   - Android TV (ADB)       │
                          └────────────────────────────┘
```

---

## 🧪 Testing Checklist

### ✅ **Camera Streaming (Already Working)**
- [x] Desktop camera streaming works
- [x] Mobile camera access works (with HTTPS)
- [x] Multiple cameras supported
- [x] Video displays on viewer page
- [x] Real-time stats working

### ✅ **Device Registration (Ready)**
- [x] Stream page collects device info
- [x] Device type selection (Samsung/LG/Android)
- [x] Device IP validation
- [x] Data saved to localStorage

### 🔄 **Remote Control (API Ready, UI Needed)**
- [x] Python API running
- [x] Session management working
- [x] Command routing implemented
- [ ] Remote control UI (to be added to Live page)

---

## 📝 What's Saved

When you authenticate on Stream page, this info is saved to `localStorage`:

```json
{
  "cameraName": "Living Room Camera",
  "deviceIP": "192.168.0.147",
  "deviceType": "samsung_tv"
}
```

This data can be used on Live page to:
1. Connect to device via Python API
2. Send remote control commands
3. Control the device while viewing camera

---

## 🎯 Next Step: Add Remote Control UI

Copy the remote control component from `/frontend/test/src/components/Main.jsx` and integrate into Live page to enable:

```jsx
// In Live.jsx
<aside className="remote-control-sidebar">
  <h3>{deviceInfo.cameraName}</h3>
  <p>{deviceInfo.deviceIP}</p>
  
  {/* D-Pad */}
  <div className="dpad">
    <button onClick={() => sendCommand('key', {action: 'up'})}>↑</button>
    <button onClick={() => sendCommand('key', {action: 'left'})}>←</button>
    <button onClick={() => sendCommand('key', {action: 'enter'})}>OK</button>
    <button onClick={() => sendCommand('key', {action: 'right'})}>→</button>
    <button onClick={() => sendCommand('key', {action: 'down'})}>↓</button>
  </div>
  
  {/* Other buttons */}
  <button onClick={() => sendCommand('key', {action: 'back'})}>Back</button>
  <button onClick={() => sendCommand('key', {action: 'home'})}>Home</button>
  <button onClick={() => sendCommand('key', {action: 'power'})}>Power</button>
</aside>
```

---

## 🐛 Troubleshooting

### **Certificate Warnings (Normal)**
- Accept certificates for both ports 3000 and 3001
- Type `thisisunsafe` on Chrome warning page
- This is expected with self-signed certificates

### **Python API Not Responding**
```bash
# Check if running
lsof -i :8000

# Restart
cd python-backend
source venv/bin/activate
python main.py
```

### **Device Won't Connect**
- Verify device IP is correct
- Ensure device is on same WiFi network
- For Android: Enable network debugging
- For Samsung/LG: Accept pairing prompt on TV

---

## 🎉 Summary

✅ **All systems operational!**
- Camera streaming: Working
- Device registration: Working
- Remote control API: Working
- Mobile access: Working with HTTPS

🔜 **Just need to add:**
- Remote control UI to Live page (easy - just copy from test folder)

**Everything is ready to go!** 🚀

