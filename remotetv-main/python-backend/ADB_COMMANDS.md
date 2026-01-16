# ADB Commands Reference for Android TV

## Basic Device Commands

### Check Connected Devices
```bash
adb devices
```
Shows all connected Android devices (USB and network)
- `device` = connected and authorized
- `unauthorized` = needs authorization on TV
- `offline` = device not responding

### Connect to Android TV via Network
```bash
adb connect <TV_IP_ADDRESS>:5555
```
Example:
```bash
adb connect 192.168.1.100:5555
```

### Disconnect from Device
```bash
adb disconnect <TV_IP_ADDRESS>:5555
```
Or disconnect all:
```bash
adb disconnect
```

### Check ADB Version
```bash
adb version
```

---

## Volume Control Commands

### Volume Up
```bash
adb shell input keyevent KEYCODE_VOLUME_UP
```
Or shorter:
```bash
adb shell input keyevent 24
```

### Volume Down
```bash
adb shell input keyevent KEYCODE_VOLUME_DOWN
```
Or shorter:
```bash
adb shell input keyevent 25
```

### Mute/Unmute
```bash
adb shell input keyevent KEYCODE_VOLUME_MUTE
```
Or shorter:
```bash
adb shell input keyevent 164
```

### Set Volume Level (0-15)
```bash
adb shell media volume --set 10
```

### Get Current Volume
```bash
adb shell media volume --get
```

---

## Other Useful Commands

### Power Button
```bash
adb shell input keyevent KEYCODE_POWER
```

### Home Button
```bash
adb shell input keyevent KEYCODE_HOME
```

### Back Button
```bash
adb shell input keyevent KEYCODE_BACK
```

### D-Pad Navigation
```bash
adb shell input keyevent KEYCODE_DPAD_UP
adb shell input keyevent KEYCODE_DPAD_DOWN
adb shell input keyevent KEYCODE_DPAD_LEFT
adb shell input keyevent KEYCODE_DPAD_RIGHT
adb shell input keyevent KEYCODE_DPAD_CENTER
```

### Media Controls
```bash
adb shell input keyevent KEYCODE_MEDIA_PLAY_PAUSE
adb shell input keyevent KEYCODE_MEDIA_PLAY
adb shell input keyevent KEYCODE_MEDIA_PAUSE
adb shell input keyevent KEYCODE_MEDIA_STOP
adb shell input keyevent KEYCODE_MEDIA_NEXT
adb shell input keyevent KEYCODE_MEDIA_PREVIOUS
```

### Get Device Info
```bash
adb shell getprop ro.product.model        # TV model
adb shell getprop ro.build.version.release # Android version
adb shell getprop ro.product.manufacturer  # Manufacturer
```

### Reboot TV
```bash
adb reboot
```

### Take Screenshot
```bash
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png
```

### View Logs (Logcat)
```bash
adb logcat                    # Live logs
adb logcat -d                 # Dump all logs
adb logcat -d -t 50           # Last 50 lines
adb logcat -c                 # Clear logs
```

---

## Troubleshooting Commands

### Kill ADB Server (if stuck)
```bash
adb kill-server
adb start-server
```

### Check if ADB is Running
```bash
adb devices -l
```

### Restart ADB Connection
```bash
adb kill-server
adb start-server
adb connect <TV_IP>:5555
```

### Check Network Connection
```bash
adb shell ping -c 3 8.8.8.8
```

---

## Quick Test Sequence

1. **Check if device is connected:**
   ```bash
   adb devices
   ```

2. **If not connected, connect:**
   ```bash
   adb connect 192.168.1.100:5555
   ```

3. **Test volume up:**
   ```bash
   adb shell input keyevent KEYCODE_VOLUME_UP
   ```

4. **Test volume down:**
   ```bash
   adb shell input keyevent KEYCODE_VOLUME_DOWN
   ```

---

## Common Key Codes Reference

| Key | Keycode | Command |
|-----|---------|---------|
| Volume Up | 24 | `KEYCODE_VOLUME_UP` |
| Volume Down | 25 | `KEYCODE_VOLUME_DOWN` |
| Power | 26 | `KEYCODE_POWER` |
| Home | 3 | `KEYCODE_HOME` |
| Back | 4 | `KEYCODE_BACK` |
| Menu | 82 | `KEYCODE_MENU` |
| D-Pad Up | 19 | `KEYCODE_DPAD_UP` |
| D-Pad Down | 20 | `KEYCODE_DPAD_DOWN` |
| D-Pad Left | 21 | `KEYCODE_DPAD_LEFT` |
| D-Pad Right | 22 | `KEYCODE_DPAD_RIGHT` |
| D-Pad Center | 23 | `KEYCODE_DPAD_CENTER` |
| Play/Pause | 85 | `KEYCODE_MEDIA_PLAY_PAUSE` |

---

## Using with Specific Device

If multiple devices are connected, specify which one:
```bash
adb -s <TV_IP>:5555 shell input keyevent KEYCODE_VOLUME_UP
```

Example:
```bash
adb -s 192.168.1.100:5555 shell input keyevent KEYCODE_VOLUME_UP
```

