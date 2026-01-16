# API Documentation for main.py

This document provides a comprehensive overview of all APIs available in the Remote Control API (main.py).

## Base URL
- **Development**: `http://localhost:5042` or `https://localhost:5042` (if SSL enabled)

---

## Session Management APIs

### 1. **POST /sessions**
**Description**: Connect to a device and create a session

**Request Body**:
```json
{
  "ip": "192.168.1.100",
  "device_type": "android|roku|apple_tv|samsung_tv|lg_tv",
  "tv_name": "Living Room TV"
}
```

**Response** (Success - 200):
```json
{
  "sessionId": "uuid-string",
  "title": "ANDROID-192.168.1.100",
  "ip": "192.168.1.100",
  "whepUrl": "http://localhost:8889/mystream/whep",
  "device_type": "android",
  "status": "connected"
}
```

**Response** (Error - 400/500):
- Returns HTTPException with error details

---

### 2. **GET /sessions**
**Description**: List all active sessions

**Response** (Success - 200):
```json
{
  "sessions": [
    {
      "sessionId": "uuid-string",
      "ip": "192.168.1.100",
      "device_type": "android",
      "tv_name": "Living Room TV",
      "status": "connected"
    }
  ]
}
```

---

### 3. **GET /sessions/{session_id}/status**
**Description**: Get status of a specific session

**Response** (Success - 200):
```json
{
  "sessionId": "uuid-string",
  "ip": "192.168.1.100",
  "device_type": "android",
  "tv_name": "Living Room TV",
  "status": "connected",
  "connected": true,
  "created_at": "2024-01-01T12:00:00",
  "last_activity": "2024-01-01T12:05:00"
}
```

**Response** (Error - 404):
- `{"detail": "Session not found"}`

---

### 4. **GET /sessions/check/{ip}**
**Description**: Check if there's an existing session for an IP/device

**Query Parameters**:
- `device_type` (optional): Filter by device type

**Response** (Success - 200):
```json
{
  "exists": true,
  "session": {
    "sessionId": "uuid-string",
    "ip": "192.168.1.100",
    "device_type": "android",
    "tv_name": "Living Room TV",
    "status": "connected"
  },
  "message": "Existing session found"
}
```

**OR**

```json
{
  "exists": false,
  "message": "No existing session found"
}
```

---

### 5. **POST /disconnect/{session_id}**
**Description**: Disconnect a session

**Response** (Success - 200):
```json
{
  "status": "disconnected",
  "session_id": "uuid-string"
}
```

**Response** (Error - 404):
- `{"detail": "Session not found"}`

---

### 6. **POST /send/{session_id}**
**Description**: Send command to device

**Request Body**:
```json
{
  "msg": {
    "type": "key|app|text",
    "action": "enter|up|down|left|right|home|back|power|...",
    "app_id": "string (for type=app)",
    "text": "string (for type=text)"
  }
}
```

**Response** (Success - 200):
```json
{
  "status": "success",
  "action": "enter",
  "mapped_key": "DPAD_CENTER"
}
```

**Response** (Error - 200 with error status):
```json
{
  "status": "error",
  "error": "Session not found"
}
```

---

## Android Device APIs

### 7. **POST /android/pair**
**Description**: Pair Android device via ADB

**Request Body**:
```json
{
  "ip": "192.168.1.100",
  "pairing_port": 12345,
  "code": "123456"
}
```

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Paired"
}
```

**Response** (Error - 400):
- HTTPException with error details

---

### 8. **POST /android/connect**
**Description**: Connect to TCL TV or Android device via ADB over WiFi

**Request Body**:
```json
{
  "ip": "192.168.1.100",
  "port": 5555
}
```

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Connected"
}
```

**Response** (Error - 400):
- HTTPException with error details

---

### 9. **POST /android/enable-wifi**
**Description**: Enable WiFi ADB on TCL TV via USB connection

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "WiFi ADB enabled successfully",
  "tv_ip": "192.168.1.100",
  "port": 5555,
  "next_step": "Now connect via: adb connect 192.168.1.100:5555"
}
```

**Response** (Error - 400):
- HTTPException with error details

---

### 10. **POST /android/sdb-connect**
**Description**: Connect to TCL TV via SDB (Samsung Debug Bridge)

**Request Body**:
```json
{
  "ip": "192.168.1.100",
  "port": 26101
}
```

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Connected via SDB"
}
```

**Response** (Error - 400):
- HTTPException with error details

---

## Samsung TV APIs

### 11. **POST /samsung/authenticate**
**Description**: Request authentication from Samsung TV

**Query Parameters**:
- `ip` (required): IP address of Samsung TV
- `tv_name` (optional): Name to save token

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Authentication successful! Token saved.",
  "token": "token-string"
}
```

**OR** (Auth Required):
```json
{
  "status": "auth_required",
  "message": "Please check your TV screen and accept the connection request, then call this endpoint again.",
  "instructions": "Look for a popup on your TV screen asking to allow the connection."
}
```

**Response** (Error - 400/500):
- HTTPException with error details

---

### 12. **POST /samsung/force-auth/{session_id}**
**Description**: Force re-authentication for Samsung TV session

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "New authentication initiated. Please check your TV screen and accept the connection request.",
  "token": "token-string",
  "instructions": "Look for a popup on your TV screen asking to allow the connection."
}
```

**Response** (Error - 400/404/500):
- HTTPException with error details

---

### 13. **GET /test/samsung/{ip}**
**Description**: Test Samsung TV connectivity

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Successfully connected to Samsung TV at 192.168.1.100",
  "device_info": {...},
  "token_stored": true
}
```

**OR** (Auth Required):
```json
{
  "status": "auth_required",
  "message": "Authentication required. Please call /samsung/authenticate endpoint.",
  "error": "error details"
}
```

**OR** (Error):
```json
{
  "status": "error",
  "error": "Connection failed"
}
```

---

### 14. **POST /samsung/refresh-token**
**Description**: Refresh Samsung TV authentication token

**Query Parameters**:
- `ip` (required): IP address
- `tv_name` (required): TV name

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Token refreshed successfully!",
  "token": "new-token-string"
}
```

**Response** (Error - 400/500):
- HTTPException with error details

---

### 15. **GET /samsung/tokens**
**Description**: Get all stored Samsung TV tokens

**Response** (Success - 200):
```json
{
  "tvs": {
    "Living Room TV": "token-string",
    "Bedroom TV": "token-string"
  },
  "count": 2
}
```

---

### 16. **DELETE /samsung/tokens/{tv_name}**
**Description**: Remove a Samsung TV token

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Removed Samsung token for Living Room TV"
}
```

**Response** (Error - 404):
- HTTPException: Token not found

---

## LG TV APIs

### 17. **GET /test/lg/{ip}**
**Description**: Test LG TV connectivity without pairing

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Successfully connected to LG TV at 192.168.1.100. Ready for pairing.",
  "secure_connection": true
}
```

**Response** (Error - 200):
```json
{
  "status": "error",
  "error": "Cannot connect to LG TV at 192.168.1.100: ..."
}
```

---

### 18. **GET /tokens/lg**
**Description**: Get all LG TV tokens

**Response** (Success - 200):
```json
{
  "tvs": {
    "Living Room TV": "client-key-string",
    "Bedroom TV": "client-key-string"
  }
}
```

---

## Token Management APIs

### 19. **GET /tokens/samsung**
**Description**: Get all Samsung TV tokens (alias for /samsung/tokens)

**Response** (Success - 200):
```json
{
  "tvs": {
    "Living Room TV": "token-string"
  }
}
```

---

## Device Detection API

### 20. **GET /detect/{ip}**
**Description**: Detect what type of device is at the given IP address

**Response** (Success - 200):
```json
{
  "status": "success",
  "device_info": {
    "ip": "192.168.1.100",
    "detected_types": ["samsung_tv", "android"],
    "recommended_type": "samsung_tv",
    "details": {
      "samsung_tv": "Samsung Smart TV detected",
      "android": "Android device with ADB enabled detected"
    }
  }
}
```

**OR** (Multiple types):
```json
{
  "status": "success",
  "device_info": {
    "ip": "192.168.1.100",
    "detected_types": ["samsung_tv", "android"],
    "recommended_type": "multiple_types_detected",
    "warning": "Multiple device types detected. Please specify the correct type manually.",
    "details": {...}
  }
}
```

**OR** (Unknown):
```json
{
  "status": "success",
  "device_info": {
    "ip": "192.168.1.100",
    "detected_types": [],
    "recommended_type": "unknown",
    "warning": "No known device types detected. Check if device is on and accessible.",
    "details": {}
  }
}
```

**Response** (Error):
```json
{
  "status": "error",
  "error": "error message"
}
```

---

## System/Health APIs

### 21. **GET /health**
**Description**: Health check endpoint

**Response** (Success - 200):
```json
{
  "status": "healthy",
  "active_sessions": 2,
  "timing_limits": {
    "min_timeout": 5.0,
    "max_timeout": 3600.0
  }
}
```

---

### 22. **POST /config/timing**
**Description**: Update timing configurations (5 seconds to 1 hour range)

**Request Body** (all optional):
```json
{
  "keep_alive_interval": 30.0,
  "samsung_reconnect_interval": 60.0
}
```

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Timing configurations updated successfully",
  "updated_configs": {
    "keep_alive_interval": 30.0,
    "samsung_reconnect_interval": 60.0
  },
  "limits": {
    "min_timeout": 5.0,
    "max_timeout": 3600.0
  }
}
```

**Response** (Error - 400):
- HTTPException with error details

---

## Device Type Support

### Supported Device Types:
- **android**: Android devices via ADB
- **roku**: Roku devices via ECP
- **apple_tv**: Apple TV (placeholder implementation)
- **samsung_tv**: Samsung Smart TVs via SamsungTVWS
- **lg_tv**: LG webOS TVs via pywebostv

### Supported Commands:
- **Navigation**: up, down, left, right, enter, ok, back, home
- **Media**: play, pause, stop, rewind, fastforward, next, previous
- **Volume**: volume_up, volume_down, mute
- **Power**: power
- **Input**: text (for text input)
- **Apps**: app (with app_id for launching apps)

---

## Error Responses

All endpoints may return HTTP error status codes:
- **400**: Bad Request - Invalid input or operation failed
- **404**: Not Found - Session or resource not found
- **429**: Too Many Requests - Session limit reached
- **500**: Internal Server Error - Server-side error

Error responses typically follow this format:
```json
{
  "detail": "Error message description"
}
```

---

## Notes

1. **Session Management**: Sessions are stored in memory and will be lost on server restart
2. **Token Storage**: Tokens are persisted in `tokens/` directory
3. **Keep-Alive**: Samsung TV connections have automatic keep-alive mechanism
4. **SSL Support**: API supports HTTPS if SSL certificates are present
5. **CORS**: All origins are allowed for CORS
6. **Logging**: All API requests are logged with timing information

