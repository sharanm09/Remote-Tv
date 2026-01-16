"""
Android TV Controller
Handles all Android TV connection and remote control functionality using ADB
"""
import asyncio
import logging
import re
import subprocess
import requests
from datetime import datetime
from typing import Dict

# Configure logger
logger = logging.getLogger(__name__)


class AndroidController:
    """Controller for Android TV remote operations using ADB"""
    
    @staticmethod
    def is_android_device(ip: str) -> bool:
        """Check if device at IP is likely an Android device (not Samsung/LG TV)"""
        try:
            # Check if it responds to ADB on port 5555
            result = subprocess.run(
                ['adb', 'connect', f'{ip}:5555'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                # Check if device is listed in ADB devices
                devices_result = subprocess.run(
                    ['adb', 'devices'],
                    capture_output=True,
                    text=True,
                    timeout=3
                )
                
                if f'{ip}:5555' in devices_result.stdout and 'device' in devices_result.stdout:
                    return True
            
            return False
            
        except Exception:
            return False
    
    @staticmethod
    def is_samsung_tv(ip: str) -> bool:
        """Check if device at IP is a Samsung TV"""
        try:
            import requests
            # Check Samsung TV REST API
            response = requests.get(f"http://{ip}:8001/api/v2/", timeout=3)
            return response.status_code == 200 and "Samsung" in response.text
        except:
            return False
    
    @staticmethod
    def is_lg_tv(ip: str) -> bool:
        """Check if device at IP is an LG TV"""
        try:
            import requests
            # Check LG TV webOS API
            response = requests.get(f"http://{ip}:3000/", timeout=3)
            return response.status_code == 200
        except:
            return False
    
    @staticmethod
    def test_adb_connection(ip: str) -> bool:
        """Test ADB connection to Android device with better error handling"""
        try:
            # First check if ADB is available
            adb_check = subprocess.run(['adb', 'version'], capture_output=True, timeout=3)
            if adb_check.returncode != 0:
                logger.warning("ADB not found or not working")
                return False
            
            # Try to connect to the device
            result = subprocess.run(
                ['adb', 'connect', f'{ip}:5555'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                # Verify the connection by checking if device is listed
                devices_result = subprocess.run(
                    ['adb', 'devices'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if f'{ip}:5555' in devices_result.stdout and 'device' in devices_result.stdout:
                    logger.info(f"Successfully connected to Android device at {ip}")
                    return True
                else:
                    logger.warning(f"ADB connected but device not properly listed: {ip}")
                    return False
            else:
                logger.warning(f"ADB connection failed to {ip}: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.warning(f"ADB connection timeout for {ip}")
            return False
        except FileNotFoundError:
            logger.warning("ADB command not found. Please install Android SDK platform-tools")
            return False
        except Exception as e:
            logger.warning(f"ADB connection error for {ip}: {e}")
            return False
    
    @staticmethod
    def adb_shell(ip: str, args: list) -> Dict:
        """Execute ADB shell command with better error handling"""
        try:
            # First ensure device is connected
            if not AndroidController.test_adb_connection(ip):
                return {"status": "error", "error": "Device not connected via ADB"}
            
            result = subprocess.run(
                ['adb', '-s', f'{ip}:5555', 'shell'] + args,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return {"status": "success", "output": result.stdout.strip()}
            else:
                return {"status": "error", "error": result.stderr.strip() or "ADB command failed"}
                
        except subprocess.TimeoutExpired:
            return {"status": "error", "error": "ADB command timeout"}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @staticmethod
    def adb_pair(ip: str, pairing_port: int, code: str) -> Dict:
        """Pair with Android device using ADB pairing"""
        try:
            target = f"{ip}:{pairing_port}"
            result = subprocess.run(
                ['adb', 'pair', target, code],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return {"status": "success", "message": result.stdout.strip() or "Paired"}
            return {"status": "error", "error": (result.stderr or result.stdout or "adb pair failed").strip()}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @staticmethod
    def adb_connect_tcl(ip: str, port: int = 5555) -> Dict:
        """Connect to TCL TV via ADB over WiFi (no pairing code needed)"""
        try:
            target = f"{ip}:{port}"
            result = subprocess.run(
                ['adb', 'connect', target],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return {"status": "success", "message": result.stdout.strip() or "Connected"}
            return {"status": "error", "error": (result.stderr or result.stdout or "adb connect failed").strip()}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @staticmethod
    def adb_enable_wifi_tcl() -> Dict:
        """Enable WiFi ADB on TCL TV via USB connection"""
        try:
            # Check if device is connected via USB
            devices_result = subprocess.run(
                ['adb', 'devices'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if "device" not in devices_result.stdout:
                return {"status": "error", "error": "No USB device detected. Connect TV via USB first."}
            
            # Enable TCP/IP mode on port 5555
            tcpip_result = subprocess.run(
                ['adb', 'tcpip', '5555'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if tcpip_result.returncode != 0:
                return {"status": "error", "error": f"Failed to enable TCP/IP mode: {tcpip_result.stderr}"}
            
            # Get TV's IP address
            ip_result = subprocess.run(
                ['adb', 'shell', 'ip', 'addr', 'show', 'wlan0'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if ip_result.returncode != 0:
                return {"status": "error", "error": f"Failed to get IP address: {ip_result.stderr}"}
            
            # Extract IP from output
            ip_match = re.search(r'inet (\d+\.\d+\.\d+\.\d+)', ip_result.stdout)
            if not ip_match:
                return {"status": "error", "error": "Could not extract IP address from TV"}
            
            tv_ip = ip_match.group(1)
            
            return {
                "status": "success", 
                "message": "WiFi ADB enabled successfully",
                "tv_ip": tv_ip,
                "port": 5555,
                "next_step": f"Now connect via: adb connect {tv_ip}:5555"
            }
            
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @staticmethod
    def sdb_connect(ip: str, port: int = 26101) -> Dict:
        """Connect to TCL TV via SDB (Samsung Debug Bridge)"""
        try:
            target = f"{ip}:{port}"
            result = subprocess.run(
                [r'C:\tizen-studio\tools\sdb.exe', 'connect', target],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return {"status": "success", "message": result.stdout.strip() or "Connected via SDB"}
            return {"status": "error", "error": (result.stderr or result.stdout or "sdb connect failed").strip()}
        except FileNotFoundError:
            return {"status": "error", "error": "SDB not found. Please install Tizen Studio first."}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @staticmethod
    def sdb_shell(ip: str, args: list) -> Dict:
        """Execute SDB shell command on TCL TV"""
        try:
            target = f"{ip}:26101"
            result = subprocess.run(
                [r'C:\tizen-studio\tools\sdb.exe', '-s', target, 'shell'] + args,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return {"status": "success", "output": result.stdout.strip()}
            return {"status": "error", "error": result.stderr.strip() or "SDB command failed"}
        except FileNotFoundError:
            return {"status": "error", "error": "SDB not found. Please install Tizen Studio first."}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @staticmethod
    def get_keymap():
        """Get key mapping for Android TV commands - comprehensive mapping for all remote buttons"""
        return {
            # Navigation (DPAD keys)
            "up": "DPAD_UP",
            "down": "DPAD_DOWN",
            "left": "DPAD_LEFT",
            "right": "DPAD_RIGHT",
            "enter": "DPAD_CENTER",
            "ok": "DPAD_CENTER",
            
            # System buttons
            "back": "BACK",
            "home": "HOME",
            "menu": "MENU",
            "power": "POWER",
            "settings": "SETTINGS",
            
            # Volume controls
            "volume_up": "VOLUME_UP",
            "volume_down": "VOLUME_DOWN",
            "mute": "VOLUME_MUTE",
            
            # Channel controls
            "channel_up": "CHANNEL_UP",
            "channel_down": "CHANNEL_DOWN",
            
            # Media playback
            "play": "MEDIA_PLAY",
            "pause": "MEDIA_PAUSE",
            "stop": "MEDIA_STOP",
            "rewind": "MEDIA_REWIND",
            "fast_forward": "MEDIA_FAST_FORWARD",
            "next": "MEDIA_NEXT",
            "previous": "MEDIA_PREVIOUS",
            
            # Number pad
            "0": "0", "1": "1", "2": "2", "3": "3",
            "4": "4", "5": "5", "6": "6", "7": "7",
            "8": "8", "9": "9",
            "dot": "PERIOD",
            "period": "PERIOD",
            
            # Color buttons (Android TV color buttons)
            "red": "PROG_RED",
            "green": "PROG_GREEN",
            "yellow": "PROG_YELLOW",
            "blue": "PROG_BLUE",
            
            # App shortcuts (handled separately via _launch_app)
            "youtube": "YOUTUBE", "netflix": "NETFLIX",
            "prime": "PRIME", "prime video": "PRIME",
            "mewatch": "MEWATCH", "hulu": "HULU", "disney": "DISNEY"
        }
    
    @staticmethod
    def capture_and_display_logs(ip: str, max_lines: int = 50):
        """Capture and display recent logs from Android TV. Returns only pure TV logs (no headers)."""
        try:
            result = subprocess.run(
                ['adb', '-s', f'{ip}:5555', 'logcat', '-d', '-t', str(max_lines)],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0 and result.stdout.strip():
                # Log to console for backend visibility (not returned)
                logger.info("="*80)
                logger.info(f"📺 Mi Android TV Logs from {ip} (Last {max_lines} lines)")
                logger.info("="*80)
                logger.info(result.stdout.strip())
                logger.info("="*80)
                
                # Return only pure TV logs (no headers/separators)
                pure_tv_logs = result.stdout.strip()
                
                return {"success": True, "logs": pure_tv_logs, "timestamp": datetime.now().isoformat()}
            else:
                logger.info("No logs available or device not connected")
                return {"success": False, "logs": "No logs available or device not connected", "timestamp": datetime.now().isoformat()}
                
        except Exception as e:
            logger.warning(f"Could not capture logs: {e}")
            return {"success": False, "logs": f"Error capturing logs: {str(e)}", "timestamp": datetime.now().isoformat()}

    @staticmethod
    async def connect_device(session):
        """Full connection logic for Android TV - handles all connection and session setup"""
        logger.info(f"Testing Android TV connection to {session.ip}")
        
        # First check if ADB is available
        try:
            adb_check = subprocess.run(['adb', 'version'], capture_output=True, timeout=3)
            if adb_check.returncode != 0:
                error_msg = "ADB (Android Debug Bridge) is not installed or not working. Please install Android SDK platform-tools."
                logger.error(error_msg)
                return {"status": "error", "error": error_msg}
        except FileNotFoundError:
            error_msg = "ADB command not found. Please install Android SDK platform-tools and add it to your PATH."
            logger.error(error_msg)
            return {"status": "error", "error": error_msg}
        except Exception as e:
            error_msg = f"Error checking ADB: {str(e)}"
            logger.error(error_msg)
            return {"status": "error", "error": error_msg}
        
        # First check if this is actually an Android device
        if AndroidController.is_samsung_tv(session.ip):
            return {"status": "error", "error": f"Device at {session.ip} is a Samsung TV, not an Android device. Use device_type: 'samsung_tv'"}
        
        if AndroidController.is_lg_tv(session.ip):
            return {"status": "error", "error": f"Device at {session.ip} is an LG TV, not an Android device. Use device_type: 'lg_tv'"}
        
        # Check if it's actually an Android device
        logger.info(f"Checking if {session.ip} is an Android device...")
        is_android = await asyncio.to_thread(AndroidController.is_android_device, session.ip)
        if not is_android:
            error_msg = (
                f"Device at {session.ip} does not respond to ADB. Please check:\n\n"
                f"1. TV is powered ON\n"
                f"2. ADB debugging is enabled on the TV:\n"
                f"   Settings → Device Preferences → About → Click 'Build' 7 times to enable Developer Options\n"
                f"   Then: Settings → Device Preferences → Developer Options → Enable 'ADB debugging'\n"
                f"   Also enable 'Network debugging' or 'Wireless debugging'\n"
                f"3. TV is on the same network as this computer\n"
                f"4. IP address {session.ip} is correct\n"
                f"5. For Mi TV: Enable 'ADB over network' in Developer Options"
            )
            logger.error(error_msg)
            return {"status": "error", "error": error_msg}
        
        # Test ADB connection
        logger.info(f"Testing ADB connection to {session.ip}...")
        connection_ok = await asyncio.to_thread(AndroidController.test_adb_connection, session.ip)
        if not connection_ok:
            error_msg = (
                f"Failed to connect via ADB to {session.ip}. Please check:\n\n"
                f"1. ADB debugging is enabled on the TV\n"
                f"2. Network debugging/Wireless debugging is enabled\n"
                f"3. TV is on the same network\n"
                f"4. Port 5555 is not blocked by firewall\n"
                f"5. Try: adb connect {session.ip}:5555 (from terminal to test)"
            )
            logger.error(error_msg)
            return {"status": "error", "error": error_msg}
        
        logger.info(f"Android TV connected successfully to {session.ip}")
        
        # Only capture logs if user has enabled log capture
        # Logs are disabled by default for better performance
        if hasattr(session, 'android_logs_enabled') and session.android_logs_enabled:
            logger.info("📺 Capturing logs from Mi Android TV...")
            log_result = AndroidController.capture_and_display_logs(session.ip, max_lines=100)
            if log_result.get("success"):
                session.logs.append(log_result)
                session.last_log_update = datetime.now()
        
        return {"status": "success"}

    @staticmethod
    async def _capture_logs_background(session, action: str, delay: float = 0.5):
        """Capture logs in background after TV action completes"""
        # Wait a bit for TV to process the action
        await asyncio.sleep(delay)
        try:
            logger.info(f"📺 Capturing logs after {action} command...")
            log_result = AndroidController.capture_and_display_logs(session.ip, max_lines=30)
            if log_result.get("success"):
                session.logs.append(log_result)
                session.last_log_update = datetime.now()
        except Exception as e:
            logger.error(f"Error capturing logs in background: {e}")

    @staticmethod
    async def send_command(session, msg):
        """Full command sending logic for Android TV - handles all command types. Returns immediately, logs captured in background."""
        # Ensure connection is active before sending commands
        try:
            connection_ok = await asyncio.to_thread(AndroidController.test_adb_connection, session.ip)
            if not connection_ok:
                logger.warning(f"ADB connection lost for {session.ip}, attempting to reconnect...")
                # Try to reconnect
                connection_ok = await asyncio.to_thread(AndroidController.test_adb_connection, session.ip)
                if not connection_ok:
                    return {"status": "error", "error": "Device not connected via ADB. Please check connection."}
        except Exception as conn_error:
            logger.error(f"Error checking ADB connection: {conn_error}")
            return {"status": "error", "error": f"Connection error: {str(conn_error)}"}
        
        if msg.get("type") == "key":
            action = msg.get("action", "enter")
            keymap = AndroidController.get_keymap()
            keycode = keymap.get(action.lower())
            
            if not keycode:
                return {"status": "error", "error": f"Unknown key: {action}"}
            
            # Special handling for app shortcuts (YouTube, Netflix, etc.)
            if action.lower() in ["youtube", "netflix", "prime", "prime video", "mewatch", "hulu", "disney"]:
                result = await asyncio.to_thread(AndroidController._launch_app, session.ip, action.lower())
            else:
                # Standard key event - use key name directly (ADB accepts key names)
                result = await asyncio.to_thread(AndroidController.adb_shell, session.ip, ['input', 'keyevent', keycode])
            
            # If command failed due to connection error, try to reconnect and retry once
            if result.get("status") == "error" and "not connected" in result.get("error", "").lower():
                logger.warning(f"Command failed due to connection issue, attempting reconnect and retry...")
                try:
                    connection_ok = await asyncio.to_thread(AndroidController.test_adb_connection, session.ip)
                    if connection_ok:
                        # Retry the command with same method
                        if action.lower() in ["youtube", "netflix", "prime", "prime video", "mewatch", "hulu", "disney"]:
                            result = await asyncio.to_thread(AndroidController._launch_app, session.ip, action.lower())
                        else:
                            result = await asyncio.to_thread(AndroidController.adb_shell, session.ip, ['input', 'keyevent', keycode])
                        if result.get("status") == "success":
                            logger.info(f"Successfully reconnected and retried command for session {session.id}")
                except Exception as retry_error:
                    logger.error(f"Reconnection and retry failed: {retry_error}")
                    return {"status": "error", "error": f"Connection failed and retry failed: {str(retry_error)}"}
            
            # Only capture logs if user has enabled log capture
            # Logs are disabled by default for better performance
            if result.get("status") == "success" and hasattr(session, 'android_logs_enabled') and session.android_logs_enabled:
                # Create background task for log capture - don't await it
                asyncio.create_task(AndroidController._capture_logs_background(session, action, delay=0.5))
            
            # Return immediately - don't wait for logs
            return result
        
        elif msg.get("type") == "text":
            text = msg.get("text", "")
            if not text:
                return {"status": "error", "error": "Text input requires text content"}
            # Android TV text input
            result = await asyncio.to_thread(AndroidController.adb_shell, session.ip, ['input', 'text', text])
            return result
        
        return {"status": "error", "error": "Unknown command type"}
    
    @staticmethod
    def _launch_app(ip: str, app_name: str) -> Dict:
        """Launch app on Android TV using ADB intent"""
        app_packages = {
            "youtube": "com.google.android.youtube.tv",
            "netflix": "com.netflix.ninja",
            "prime": "com.amazon.amazonvideo.livingroom",
            "prime video": "com.amazon.amazonvideo.livingroom",
            "mewatch": "sg.mediacorp.toggle",
            "hulu": "com.hulu.plus",
            "disney": "com.disney.disneyplus"
        }
        
        package = app_packages.get(app_name.lower())
        if not package:
            return {"status": "error", "error": f"Unknown app: {app_name}"}
        
        try:
            # Launch app using intent
            result = subprocess.run(
                ['adb', '-s', f'{ip}:5555', 'shell', 'am', 'start', '-n', f'{package}/.MainActivity'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return {"status": "success", "app": app_name, "package": package}
            else:
                # Try alternative launch method
                result2 = subprocess.run(
                    ['adb', '-s', f'{ip}:5555', 'shell', 'monkey', '-p', package, '-c', 'android.intent.category.LAUNCHER', '1'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result2.returncode == 0:
                    return {"status": "success", "app": app_name, "package": package}
                else:
                    return {"status": "error", "error": f"Failed to launch {app_name}: {result2.stderr or result.stderr}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @staticmethod
    async def get_logs(session, max_lines: int = 100, refresh: bool = False):
        """Get logs for Android TV session"""
        # If refresh requested, capture fresh logs
        if refresh:
            try:
                log_result = AndroidController.capture_and_display_logs(session.ip, max_lines=max_lines)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
            except Exception as e:
                logger.error(f"Error refreshing logs: {e}")
        
        # Return latest logs from session.logs (only pure TV logs, no headers)
        if session.logs:
            # Get most recent log entry
            latest_logs = session.logs[-1]
            # Combine all logs from last 5 entries - they are already clean (no headers)
            all_tv_logs = []
            for log_entry in session.logs[-5:]:  # Last 5 entries
                tv_logs = log_entry.get("logs", "").strip()
                if tv_logs:  # Only add non-empty logs
                    all_tv_logs.append(tv_logs)
            
            # Join with double newline to separate different log captures
            combined_tv_logs = "\n\n".join(all_tv_logs)
            
            return {
                "success": True,
                "logs": combined_tv_logs if combined_tv_logs else "No TV logs available yet.",
                "timestamp": latest_logs.get("timestamp"),
                "last_log_update": session.last_log_update.isoformat() if session.last_log_update else None,
                "device_type": "android",
                "log_count": len(session.logs)
            }
        else:
            return {
                "success": False,
                "logs": "No logs available yet. Logs will be captured when commands are sent or when you refresh.",
                "timestamp": None,
                "last_log_update": None,
                "device_type": "android",
                "log_count": 0
            }

