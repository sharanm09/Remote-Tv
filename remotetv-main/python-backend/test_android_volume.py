#!/usr/bin/env python3
"""
Simple Android TV Volume Test Script
Tests volume up and down functionality on Android TV via ADB

Requirements:
- Python 3.6+
- ADB (Android Debug Bridge) installed and in PATH
- Android TV with ADB enabled on port 5555

Usage:
    python test_android_volume.py <TV_IP_ADDRESS>
    
Example:
    python test_android_volume.py 192.168.1.100
"""

import subprocess
import sys
import time


def check_adb_available():
    """Check if ADB is installed and available"""
    try:
        result = subprocess.run(
            ['adb', 'version'],
            capture_output=True,
            text=True,
            timeout=3
        )
        if result.returncode == 0:
            print(f"✓ ADB found: {result.stdout.strip().split()[0]}")
            return True
        else:
            print("✗ ADB not found or not working")
            return False
    except FileNotFoundError:
        print("✗ ADB not found. Please install Android SDK platform-tools")
        print("  Download from: https://developer.android.com/studio/releases/platform-tools")
        return False
    except Exception as e:
        print(f"✗ Error checking ADB: {e}")
        return False


def connect_to_device(ip, port=5555):
    """Connect to Android TV via ADB"""
    try:
        print(f"\nConnecting to {ip}:{port}...")
        result = subprocess.run(
            ['adb', 'connect', f'{ip}:{port}'],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            # Verify connection
            devices_result = subprocess.run(
                ['adb', 'devices'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if f'{ip}:{port}' in devices_result.stdout and 'device' in devices_result.stdout:
                print(f"✓ Successfully connected to {ip}:{port}")
                return True
            else:
                print(f"✗ Connection failed: Device not listed")
                print(f"  Output: {result.stdout}")
                return False
        else:
            print(f"✗ Connection failed: {result.stderr or result.stdout}")
            return False
            
    except subprocess.TimeoutExpired:
        print("✗ Connection timeout")
        return False
    except Exception as e:
        print(f"✗ Connection error: {e}")
        return False


def send_volume_command(ip, command):
    """Send volume up or down command to Android TV"""
    try:
        keycode = "VOLUME_UP" if command == "up" else "VOLUME_DOWN"
        result = subprocess.run(
            ['adb', '-s', f'{ip}:5555', 'shell', 'input', 'keyevent', keycode],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            return True, "Success"
        else:
            return False, result.stderr.strip() or "Command failed"
            
    except subprocess.TimeoutExpired:
        return False, "Command timeout"
    except Exception as e:
        return False, str(e)


def main():
    """Main test function"""
    print("=" * 60)
    print("Android TV Volume Test Script")
    print("=" * 60)
    
    # Check if IP address provided
    if len(sys.argv) < 2:
        print("\nUsage: python test_android_volume.py <TV_IP_ADDRESS>")
        print("Example: python test_android_volume.py 192.168.1.100")
        sys.exit(1)
    
    tv_ip = sys.argv[1]
    
    # Step 1: Check ADB availability
    print("\n[Step 1] Checking ADB availability...")
    if not check_adb_available():
        sys.exit(1)
    
    # Step 2: Connect to device
    print("\n[Step 2] Connecting to Android TV...")
    if not connect_to_device(tv_ip):
        print("\nTroubleshooting tips:")
        print("  1. Make sure ADB is enabled on your Android TV")
        print("  2. Check if port 5555 is open")
        print("  3. Verify the TV IP address is correct")
        print("  4. Try: adb connect <TV_IP>:5555 manually")
        sys.exit(1)
    
    # Step 3: Test volume commands
    print("\n[Step 3] Testing volume commands...")
    print("\n" + "-" * 60)
    
    # Test volume up
    print("\nTesting VOLUME UP...")
    success, message = send_volume_command(tv_ip, "up")
    if success:
        print("✓ Volume UP command sent successfully")
    else:
        print(f"✗ Volume UP failed: {message}")
    
    time.sleep(1)  # Wait 1 second between commands
    
    # Test volume down
    print("\nTesting VOLUME DOWN...")
    success, message = send_volume_command(tv_ip, "down")
    if success:
        print("✓ Volume DOWN command sent successfully")
    else:
        print(f"✗ Volume DOWN failed: {message}")
    
    print("\n" + "-" * 60)
    print("\n✓ Test completed!")
    print("\nIf you heard the volume change, the test was successful!")
    print("You can run this script multiple times to test repeatedly.")


if __name__ == "__main__":
    main()

