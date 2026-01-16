# Android TV Volume Test - Setup Guide

## What You Need to Install on Another System

### 1. Python 3.6 or Higher
- **Windows**: Download from https://www.python.org/downloads/
- **Mac**: Usually pre-installed, or download from python.org
- **Linux**: Usually pre-installed, or install via package manager:
  ```bash
  sudo apt-get install python3  # Ubuntu/Debian
  sudo yum install python3       # CentOS/RHEL
  ```

### 2. ADB (Android Debug Bridge)
This is the only external tool needed. The script uses Python's built-in libraries only.

#### Windows:
1. Download **Platform Tools** from: https://developer.android.com/studio/releases/platform-tools
2. Extract the ZIP file
3. Add the folder to your system PATH:
   - Right-click "This PC" → Properties → Advanced system settings
   - Click "Environment Variables"
   - Under "System Variables", find "Path" and click "Edit"
   - Click "New" and add the path to the platform-tools folder (e.g., `C:\platform-tools`)
   - Click OK on all dialogs
4. Restart your terminal/command prompt
5. Verify: Open new terminal and type `adb version`

#### Mac:
```bash
# Using Homebrew (recommended)
brew install android-platform-tools

# Or download manually from:
# https://developer.android.com/studio/releases/platform-tools
# Then add to PATH in ~/.zshrc or ~/.bash_profile:
# export PATH=$PATH:/path/to/platform-tools
```

#### Linux:
```bash
# Ubuntu/Debian
sudo apt-get install android-tools-adb

# Or download from:
# https://developer.android.com/studio/releases/platform-tools
# Then add to PATH in ~/.bashrc:
# export PATH=$PATH:/path/to/platform-tools
```

### 3. Verify Installation
Open a terminal/command prompt and run:
```bash
python --version    # Should show Python 3.6+
adb version         # Should show ADB version
```

## Files Needed
Just copy these files to the other system:
- `test_android_volume.py` - The main script
- No other files needed!

## Usage
```bash
python test_android_volume.py <TV_IP_ADDRESS>
```

Example:
```bash
python test_android_volume.py 192.168.1.100
```

## Troubleshooting

### "ADB not found"
- Make sure ADB is installed and in your PATH
- Try running `adb version` manually
- On Windows, you may need to restart your terminal after adding to PATH

### "Connection failed"
- Make sure your Android TV has ADB enabled on port 5555
- Check that your TV and computer are on the same network
- Verify the IP address is correct
- Try connecting manually: `adb connect <TV_IP>:5555`

### "Python not found"
- Make sure Python is installed
- On Windows, you might need to use `python3` instead of `python`
- On some systems, use `py` command instead

