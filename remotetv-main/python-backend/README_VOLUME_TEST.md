# Android TV Volume Test - Quick Setup

## For Another System - What to Install:

### ✅ Required (2 things only):

1. **Python 3.6+** 
   - Download: https://www.python.org/downloads/
   - Check: `python --version`

2. **ADB (Android Debug Bridge)**
   - Download: https://developer.android.com/studio/releases/platform-tools
   - Extract ZIP file
   - Add to PATH (see instructions below)
   - Check: `adb version`

### 📦 No Python Packages Needed!
The script uses only Python's built-in libraries - no pip install required!

---

## Quick Install Steps:

### Windows:
1. Install Python from python.org (check "Add to PATH" during install)
2. Download Platform Tools ZIP from Android website
3. Extract to `C:\platform-tools` (or any folder)
4. Add to PATH:
   - Press `Win + R`, type `sysdm.cpl`, press Enter
   - Click "Environment Variables"
   - Under "System Variables", select "Path" → "Edit"
   - Click "New" → Add: `C:\platform-tools`
   - Click OK on all dialogs
5. **Restart your terminal/command prompt**
6. Test: Open new terminal, type `adb version`

### Mac/Linux:
```bash
# Mac (using Homebrew)
brew install android-platform-tools

# Linux (Ubuntu/Debian)
sudo apt-get install android-tools-adb
```

---

## Files to Copy:
Just copy `test_android_volume.py` to the other system - that's it!

---

## Usage:
```bash
python test_android_volume.py 192.168.1.100
```

Replace `192.168.1.100` with your Android TV's IP address.

---

## Troubleshooting:

**"ADB not found"**
- Make sure ADB is in your PATH
- On Windows, restart terminal after adding to PATH
- Test with: `adb version`

**"Connection failed"**
- Ensure Android TV has ADB enabled (port 5555)
- TV and computer must be on same network
- Try: `adb connect <TV_IP>:5555` manually

**"Python not found"**
- Windows: Try `python3` or `py` instead of `python`
- Make sure Python is installed and in PATH

