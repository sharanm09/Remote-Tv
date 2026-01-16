# LG TV Connection Fix - Instructions

## Issue
LG TV connection is being refused with error: `[Errno 61] Connection refused`

## Root Cause
The LG TV is refusing connections on ports 3000/3001 because "Mobile TV On" is not enabled in the TV settings.

## Solution

### Step 1: Enable "Mobile TV On" on LG TV
1. On your LG TV, navigate to: **Settings → General → External Devices → Mobile TV On**
2. Turn **Mobile TV On** to **ON**
3. **Restart the TV** (power cycle - turn off and on)

### Step 2: Restart Python Backend
The backend code has been updated with:
- Better error messages
- Dual connection attempts (secure/non-secure)
- Improved diagnostics

**You need to restart the Python backend** for the changes to take effect:

```bash
# Stop the current backend (Ctrl+C if running in terminal)
# Then restart it:
cd pythonBackend
python main.py
# OR if using uvicorn:
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Step 3: Verify Connection
After restarting the backend and enabling "Mobile TV On":
1. Try connecting to the LG TV again
2. Check the backend logs - you should see:
   - "Attempting secure connection (port 3001)" or
   - "Attempting non-secure connection (port 3000)"
3. If connection succeeds, you'll see "Connection established" messages
4. If pairing is needed, accept the pairing request on your TV screen

## Technical Details

### Ports Used
- **Port 3000**: Non-secure WebOS connection
- **Port 3001**: Secure WebOS connection (TLS)
- **Port 8080**: TV is reachable here, but this is NOT the remote control port

### Why Port 8080 Doesn't Work
Port 8080 is typically used for LG TV's web interface or other services, but **WebOSClient requires ports 3000 or 3001** for remote control. These ports only open when "Mobile TV On" is enabled.

### Connection Flow
1. Backend tries secure connection (port 3001) first
2. If that fails, tries non-secure connection (port 3000)
3. If both fail, shows detailed error message with troubleshooting steps

## Troubleshooting

If connection still fails after enabling "Mobile TV On":

1. **Check TV is ON** (not in standby)
2. **Verify IP address** is correct (192.168.0.202)
3. **Check network** - TV and computer must be on same network
4. **Try restarting TV** after enabling Mobile TV On
5. **Check firewall** - ensure ports 3000/3001 are not blocked
6. **Check backend logs** for detailed error messages

## Error Messages

The updated code now provides detailed error messages that include:
- Which ports were attempted (3000/3001)
- Step-by-step instructions to enable Mobile TV On
- Network troubleshooting steps

If you see the old error message ("Connection refused. Make sure TV is on..."), it means the backend hasn't been restarted with the new code.
