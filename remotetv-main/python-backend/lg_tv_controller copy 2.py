"""
LG TV Controller
Handles all LG TV connection and remote control functionality
"""
import asyncio
import logging
import subprocess
from datetime import datetime
from typing import Dict

# Import LG TV library
try:
    from pywebostv.connection import WebOSClient
    from pywebostv.controls import MediaControl, SystemControl, ApplicationControl, InputControl
    LG_TV_AVAILABLE = True
except ImportError:
    LG_TV_AVAILABLE = False

# Configure logger
logger = logging.getLogger(__name__)


class LGTVController:
    """Controller for LG TV remote operations"""
    
    @staticmethod
    def get_keymap():
        """Get key mapping for LG TV commands"""
        return {
            "up": "UP", "down": "DOWN", "left": "LEFT", "right": "RIGHT",
            "enter": "ENTER", "back": "BACK", "home": "HOME",
            "menu": "MENU", "power": "POWER", "source": "INPUT",
            "volume_up": "VOLUMEUP", "volume_down": "VOLUMEDOWN", "mute": "MUTE",
            "channel_up": "CHANNELUP", "channel_down": "CHANNELDOWN",
            "play": "PLAY", "pause": "PAUSE", "stop": "STOP",
            "info": "INFO", "guide": "GUIDE", "exit": "EXIT",
            "red": "RED", "green": "GREEN", "yellow": "YELLOW", "blue": "BLUE",
            "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
            "5": "5", "6": "6", "7": "7", "8": "8", "9": "9"
        }

    @staticmethod
    async def test_connection(ip: str, tv_name: str = None):
        """Connect to LG TV and return connection objects with token management"""
        if not LG_TV_AVAILABLE:
            return {
                "status": "error",
                "error": "LG TV library not installed. Run: pip install pywebostv"
            }
        
        # Import token_manager here to avoid circular imports
        from main import token_manager
        
        # Get stored client key if TV name provided
        stored_client_key = None
        if tv_name:
            stored_client_key = token_manager.get_lg_client_key(tv_name)
        
        def _connect():
            try:
                # Create client with or without stored key
                if stored_client_key:
                    store = {"client_key": stored_client_key}
                    client = WebOSClient(ip, secure=True)
                    client.connect()
                    logger.info(f"Using stored client key for LG TV: {tv_name}")
                    
                    # Try to register with existing key
                    for status in client.register(store):
                        if status == WebOSClient.REGISTERED:
                            break
                        elif status == WebOSClient.PROMPTED:
                            # Key is invalid, need new pairing
                            client.close()
                            client = WebOSClient(ip, secure=True)
                            client.connect()
                            store = {}
                            logger.info("Stored key invalid, requesting new pairing")
                            for status in client.register(store):
                                if status == WebOSClient.PROMPTED:
                                    print("Please accept the pairing request on your LG TV")
                                elif status == WebOSClient.REGISTERED:
                                    break
                            break
                else:
                    # No key provided, do initial pairing
                    client = WebOSClient(ip, secure=True)
                    client.connect()
                    logger.info("No stored key found, requesting new pairing")
                    
                    store = {}
                    for status in client.register(store):
                        if status == WebOSClient.PROMPTED:
                            print("Please accept the pairing request on your LG TV")
                        elif status == WebOSClient.REGISTERED:
                            break

                # Create control objects
                media = MediaControl(client)
                system = SystemControl(client)
                app_ctrl = ApplicationControl(client)
                input_ctrl = InputControl(client)
                input_ctrl.connect_input()
                
                # Store client key if we got a new one and TV name provided
                new_client_key = store.get("client_key")
                if tv_name and new_client_key and new_client_key != stored_client_key:
                    token_manager.set_lg_client_key(tv_name, new_client_key)

                return {
                    "status": "success",
                    "client": client,
                    "controls": {
                        "media": media,
                        "system": system,
                        "app_ctrl": app_ctrl,
                        "input_ctrl": input_ctrl
                    },
                    "client_key": new_client_key,
                    "key_stored": bool(tv_name and new_client_key)
                }
                
            except Exception as e:
                return {
                    "status": "error",
                    "error": str(e)
                }

        return await asyncio.to_thread(_connect)

    @staticmethod
    async def send_key(controls, key: str):
        """Send key command to LG TV - optimized for immediate response"""
        keymap = LGTVController.get_keymap()
        mapped_key = keymap.get(key.lower())
        
        if not mapped_key:
            return {"status": "error", "error": f"Unknown key: {key}"}

        def _send_key():
            """Execute the key command synchronously - called in thread"""
            try:
                input_ctrl = controls["input_ctrl"]
                media = controls["media"]
                system = controls["system"]
                
                # Handle directional keys
                if mapped_key == "UP":
                    input_ctrl.up()
                elif mapped_key == "DOWN":
                    input_ctrl.down()
                elif mapped_key == "LEFT":
                    input_ctrl.left()
                elif mapped_key == "RIGHT":
                    input_ctrl.right()
                elif mapped_key == "ENTER":
                    input_ctrl.ok()
                elif mapped_key == "BACK":
                    input_ctrl.back()
                elif mapped_key == "HOME":
                    input_ctrl.home()
                elif mapped_key == "MENU":
                    input_ctrl.menu()
                elif mapped_key == "POWER":
                    system.power_off()
                elif mapped_key == "VOLUMEUP":
                    media.volume_up()
                elif mapped_key == "VOLUMEDOWN":
                    media.volume_down()
                elif mapped_key == "MUTE":
                    # Mute functionality - use simple toggle without checking status first (faster)
                    try:
                        # Direct mute toggle - pywebostv mute() toggles the state
                        # This is faster than checking status first
                        media.mute(True)  # This will toggle mute state
                    except Exception as mute_error:
                        # Fallback: try button press if mute method fails
                        try:
                            input_ctrl.button("mute")
                        except Exception as btn_error:
                            logger.error(f"Mute error - mute method: {mute_error}, button: {btn_error}")
                            raise mute_error
                elif mapped_key == "PLAY":
                    media.play()
                elif mapped_key == "PAUSE":
                    media.pause()
                elif mapped_key == "STOP":
                    media.stop()
                elif mapped_key == "INFO":
                    input_ctrl.info()
                elif mapped_key == "GUIDE":
                    input_ctrl.guide()
                elif mapped_key == "EXIT":
                    input_ctrl.exit()
                elif mapped_key in ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]:
                    input_ctrl.number(int(mapped_key))
                elif mapped_key in ["RED", "GREEN", "YELLOW", "BLUE"]:
                    input_ctrl.color(mapped_key.lower())
                else:
                    # Generic button press
                    input_ctrl.button(mapped_key)
                
                return {"status": "success", "mapped_key": mapped_key}
                
            except Exception as e:
                error_msg = f"{type(e).__name__}: {str(e)}"
                logger.error(f"Error sending key '{key}' (mapped: '{mapped_key}'): {error_msg}")
                return {"status": "error", "error": error_msg}

        # Execute command in thread pool for non-blocking execution
        # This allows the command to execute while we return immediately
        return await asyncio.to_thread(_send_key)

    @staticmethod
    def send_command(ip: str, command: str) -> Dict:
        """Send command to LG TV (legacy method)"""
        try:
            from pywebostv.connection import WebOSClient
            from pywebostv.controls import InputControl
            
            client = WebOSClient(ip, secure=True)
            client.connect()
            
            store = {}
            for status in client.register(store):
                if status == WebOSClient.PROMPTED:
                    print("Please accept the pairing request on your LG TV")
                elif status == WebOSClient.REGISTERED:
                    break
            
            input_ctrl = InputControl(client)
            input_ctrl.connect_input()
            input_ctrl.button(command)
            
            return {"status": "success", "command": command}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @staticmethod
    def capture_and_display_logs(client, max_lines: int = 50):
        """Capture and display recent logs from LG TV using WebOS connection. Returns logs as string."""
        # LG TV logs are disabled - return empty logs
        return {"success": True, "logs": "LG TV logs are currently disabled.", "timestamp": datetime.now().isoformat()}
        
        # Disabled code below - LG TV logs not available without SSH support
        try:
            log_content = []
            
            logger.info("="*80)
            logger.info(f"📺 LG TV Info from Connected TV")
            logger.info("="*80)
            log_content.append("="*80)
            log_content.append(f"📺 LG TV Info from Connected TV")
            log_content.append("="*80)
            
            # Try to get system information using WebOS services
            try:
                from pywebostv.controls import SystemControl, ApplicationControl
                
                system = SystemControl(client)
                app_ctrl = ApplicationControl(client)
                
                # Get app list
                try:
                    apps = app_ctrl.list_apps()
                    logger.info("Running Applications:")
                    log_content.append("Running Applications:")
                    if apps:
                        for app in apps[:5]:  # Show first 5 apps
                            # Handle both dict and object formats
                            if hasattr(app, 'get'):
                                app_id = app.get('id', 'Unknown')
                                app_name = app.get('title', 'Unknown')
                            else:
                                # Try to access as attributes
                                app_id = getattr(app, 'id', 'Unknown')
                                app_name = getattr(app, 'title', getattr(app, 'name', 'Unknown'))
                            logger.info(f"  - {app_name} ({app_id})")
                            log_content.append(f"  - {app_name} ({app_id})")
                    else:
                        logger.info("  No applications listed")
                        log_content.append("  No applications listed")
                except Exception as e:
                    logger.info(f"  Could not get app list: {str(e)[:50]}")
                    log_content.append(f"  Could not get app list: {str(e)[:50]}")
                
                logger.info("\nSystem Information:")
                logger.info(f"  WebOS Connection: Active")
                logger.info(f"  Developer Mode: Enabled on TV")
                log_content.append("\nSystem Information:")
                log_content.append(f"  WebOS Connection: Active")
                log_content.append(f"  Developer Mode: Enabled on TV")
                
                # Try to get additional system info using WebOS Luna service
                try:
                    result = subprocess.run(
                        ['luna-send', '-i', f'hb://{client.host}', 'luna://com.webos.service.tv/getSystemInfo', '{}'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if result.returncode == 0:
                        logger.info(f"  System Info: {result.stdout.strip()[:100]}")
                        log_content.append(f"  System Info: {result.stdout.strip()[:100]}")
                except:
                    pass
                
                # Try to get system state/logs via WebOS API
                try:
                    logger.info("\nWebOS System State:")
                    log_content.append("\nWebOS System State:")
                    # Try to get current app info
                    try:
                        current_app = app_ctrl.get_current()
                        if current_app:
                            logger.info(f"  Current App: {current_app}")
                            log_content.append(f"  Current App: {current_app}")
                    except:
                        pass
                    
                    # Try to get system info
                    try:
                        system_info = system.info()
                        if system_info:
                            logger.info(f"  System Info: {system_info}")
                            log_content.append(f"  System Info: {system_info}")
                    except:
                        pass
                    
                except Exception as e:
                    logger.info(f"  Could not get system state: {str(e)[:50]}")
                    log_content.append(f"  Could not get system state: {str(e)[:50]}")
                
                # Try SSH as final attempt to get pure TV logs
                tv_logs_only = ""
                try:
                    logger.info("\nAttempting to get logs via SSH...")
                    result = subprocess.run(
                        ['ssh', '-o', 'ConnectTimeout=2', '-o', 'StrictHostKeyChecking=no', 
                         f'root@{client.host}', 'journalctl', '-n', str(max_lines), '--no-pager'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    
                    if result.returncode == 0 and result.stdout.strip():
                        logger.info("Recent System Logs (via SSH):")
                        logger.info(result.stdout.strip())
                        # Store only TV logs (from SSH journalctl)
                        tv_logs_only = result.stdout.strip()
                    else:
                        logger.info("  Note: SSH connection not configured")
                        logger.info("  To enable SSH logs: Settings → General → Developer Mode → Enable SSH")
                        logger.info("  Using WebOS API connection for debugging (working)")
                except FileNotFoundError:
                    logger.info("  Note: SSH client not installed on this computer")
                    logger.info("  Install OpenSSH client for full log access")
                except subprocess.TimeoutExpired:
                    logger.info("  Note: SSH connection timeout")
                    logger.info("  To enable SSH: Settings → General → Developer Mode → Enable SSH")
                except Exception as e:
                    logger.info(f"  Note: SSH unavailable - using WebOS connection")
                    logger.info(f"  Details: {str(e)[:40]}")
                
            except Exception as e:
                logger.info(f"  Could not get system info: {str(e)[:50]}")
            
            logger.info("="*80)
            
            # Return only TV logs from SSH if available (no headers/metadata)
            return {"success": True, "logs": tv_logs_only if tv_logs_only else "", "timestamp": datetime.now().isoformat()}
                
        except Exception as e:
            logger.warning(f"Could not capture LG TV logs: {e}")
            return {"success": False, "logs": f"Error capturing logs: {str(e)}", "timestamp": datetime.now().isoformat()}

    @staticmethod
    async def connect_device(session):
        """Full connection logic for LG TV - handles all connection and session setup"""
        logger.info(f"Testing LG TV connection to {session.ip}")
        result = await LGTVController.test_connection(session.ip, session.tv_name)
        logger.info(f"LG TV connection result: {result}")
        
        if result["status"] == "success":
            session.lg_client = result["client"]
            session.lg_controls = result["controls"]
            session.lg_client_key = result.get("client_key")
            logger.info(f"LG TV connected successfully to {session.ip}")
            
            # Only capture logs if user has enabled log capture
            # Logs are disabled by default for better performance
            if hasattr(session, 'lg_logs_enabled') and session.lg_logs_enabled:
                logger.info("📺 Capturing logs from LG TV...")
                log_result = LGTVController.capture_and_display_logs(session.lg_client, max_lines=100)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
            
            return {"status": "success"}
        else:
            error_msg = result.get("error", "Unknown error")
            return {"status": "error", "error": f"Failed to connect to LG TV: {error_msg}"}

    @staticmethod
    async def _capture_logs_background(session, action: str, delay: float = 0.5):
        """Capture logs in background after TV action completes"""
        # Wait a bit for TV to process the action
        await asyncio.sleep(delay)
        try:
            if session.lg_client:
                logger.info(f"📺 Capturing logs after {action} command...")
                log_result = LGTVController.capture_and_display_logs(session.lg_client, max_lines=30)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
        except Exception as e:
            logger.error(f"Error capturing logs in background: {e}")

    @staticmethod
    async def send_command(session, msg):
        """Full command sending logic for LG TV - optimized for immediate response.
        Command is sent immediately to TV, response returns right after sending.
        Logs are captured asynchronously in background without blocking."""
        if msg.get("type") == "key":
            action = msg.get("action", "enter")
            if not session.lg_controls:
                return {"status": "error", "error": "LG TV not connected"}
            
            # Send command immediately - this executes the TV action
            # asyncio.to_thread makes this non-blocking for the event loop
            result = await LGTVController.send_key(session.lg_controls, action)
            
            # Only capture logs if user has enabled log capture
            # Logs are disabled by default for better performance
            if result.get("status") == "success" and hasattr(session, 'lg_logs_enabled') and session.lg_logs_enabled:
                # Create background task for log capture - don't await it
                asyncio.create_task(LGTVController._capture_logs_background(session, action, delay=0.3))
            
            # Return immediately after sending command - don't wait for logs
            return result
        
        return {"status": "error", "error": "Unknown command type"}

    @staticmethod
    async def get_logs(session, max_lines: int = 100, refresh: bool = False):
        """Get logs for LG TV session"""
        # If refresh requested, capture fresh logs
        if refresh:
            try:
                if session.lg_client:
                    log_result = LGTVController.capture_and_display_logs(session.lg_client, max_lines=max_lines)
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
                "device_type": "lg_tv",
                "log_count": len(session.logs)
            }
        else:
            return {
                "success": False,
                "logs": "No logs available yet. Logs will be captured when commands are sent or when you refresh.",
                "timestamp": None,
                "last_log_update": None,
                "device_type": "lg_tv",
                "log_count": 0
            }

