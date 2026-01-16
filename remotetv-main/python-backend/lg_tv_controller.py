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
    def _luna_call(client, uri, payload="{}"):
        """Make a Luna service call via WebOS client"""
        try:
            # Try to use client's request method if available
            if hasattr(client, 'request'):
                response = client.request(uri, payload)
                return response
            # Alternative: try to send raw message
            elif hasattr(client, 'send'):
                import json
                message = {
                    "type": "request",
                    "uri": uri,
                    "payload": json.loads(payload) if isinstance(payload, str) else payload
                }
                response = client.send(message)
                return response
            else:
                return None
        except Exception as e:
            logger.debug(f"Luna call failed for {uri}: {e}")
            return None
    
    @staticmethod
    def capture_and_display_logs(client, max_lines: int = 50):
        """Capture and display recent logs from LG TV using WebOS connection. Returns logs as string.
        Tries ALL alternate methods to get system info and diagnostic data without SSH."""
        try:
            log_content = []
            methods_tried = []
            methods_successful = []
            
            logger.info("="*80)
            logger.info(f"📺 LG TV Diagnostic Info - Trying All Available Methods")
            logger.info("="*80)
            log_content.append("="*80)
            log_content.append(f"📺 LG TV Diagnostic Info - Trying All Available Methods")
            log_content.append("="*80)
            
            # Method 1: SystemControl.info() - Basic system info
            try:
                from pywebostv.controls import SystemControl, ApplicationControl
                
                system = SystemControl(client)
                app_ctrl = ApplicationControl(client)
                
                methods_tried.append("SystemControl.info()")
                try:
                    system_info = system.info()
                    if system_info:
                        log_content.append("\n=== Method 1: SystemControl.info() ===")
                        log_content.append(f"✅ SUCCESS")
                        log_content.append(f"System Info: {system_info}")
                        methods_successful.append("SystemControl.info()")
                        logger.info(f"✅ SystemControl.info() - SUCCESS: {system_info}")
                except Exception as e:
                    log_content.append("\n=== Method 1: SystemControl.info() ===")
                    log_content.append(f"❌ FAILED: {str(e)[:100]}")
                    logger.info(f"❌ SystemControl.info() - FAILED: {e}")
                
                # Method 2: ApplicationControl - Get apps and current app
                methods_tried.append("ApplicationControl.list_apps()")
                try:
                    apps = app_ctrl.list_apps()
                    log_content.append("\n=== Method 2: ApplicationControl.list_apps() ===")
                    log_content.append(f"✅ SUCCESS - Found {len(apps) if apps else 0} apps")
                    if apps:
                        for i, app in enumerate(apps[:10], 1):  # Show first 10 apps
                            if hasattr(app, 'get'):
                                app_id = app.get('id', 'Unknown')
                                app_name = app.get('title', app.get('name', 'Unknown'))
                            else:
                                app_id = getattr(app, 'id', 'Unknown')
                                app_name = getattr(app, 'title', getattr(app, 'name', 'Unknown'))
                            log_content.append(f"  App {i}: {app_name} ({app_id})")
                    methods_successful.append("ApplicationControl.list_apps()")
                    logger.info(f"✅ ApplicationControl.list_apps() - SUCCESS: {len(apps) if apps else 0} apps")
                except Exception as e:
                    log_content.append("\n=== Method 2: ApplicationControl.list_apps() ===")
                    log_content.append(f"❌ FAILED: {str(e)[:100]}")
                    logger.info(f"❌ ApplicationControl.list_apps() - FAILED: {e}")
                
                # Method 3: Get current app
                methods_tried.append("ApplicationControl.get_current()")
                try:
                    current_app = app_ctrl.get_current()
                    log_content.append("\n=== Method 3: ApplicationControl.get_current() ===")
                    log_content.append(f"✅ SUCCESS")
                    log_content.append(f"Current App: {current_app}")
                    methods_successful.append("ApplicationControl.get_current()")
                    logger.info(f"✅ ApplicationControl.get_current() - SUCCESS: {current_app}")
                except Exception as e:
                    log_content.append("\n=== Method 3: ApplicationControl.get_current() ===")
                    log_content.append(f"❌ FAILED: {str(e)[:100]}")
                    logger.info(f"❌ ApplicationControl.get_current() - FAILED: {e}")
                
            except Exception as e:
                log_content.append(f"\n❌ Failed to initialize WebOS controls: {str(e)[:100]}")
                logger.error(f"Failed to initialize WebOS controls: {e}")
            
            # Method 4: Luna Service Calls - Try multiple Luna endpoints
            luna_services = [
                ('com.webos.service.tv.getSystemInfo', '{}'),
                ('com.webos.service.tv.systemproperty', '{}'),
                ('com.webos.service.systemservice.getSystemInfo', '{}'),
                ('com.webos.service.config.getConfigs', '{"configNames":["com.webos.service.tv.systemproperty"]}'),
                ('com.webos.service.tv.display.getStatus', '{}'),
                ('com.webos.service.tv.signal.getStatus', '{}'),
                ('com.webos.service.tv.input.getStatus', '{}'),
                ('com.webos.service.tv.channel.getCurrentChannel', '{}'),
                ('com.webos.service.tv.audio.getStatus', '{}'),
                ('com.webos.service.tv.power.getStatus', '{}'),
                ('com.webos.service.tv.externalinput.getList', '{}'),
                ('com.webos.service.tv.window.getStatus', '{}'),
            ]
            
            log_content.append("\n=== Method 4: Luna Service Calls ===")
            for service_name, payload in luna_services:
                methods_tried.append(f"Luna: {service_name}")
                try:
                    # Try via luna-send command first
                    result = subprocess.run(
                        ['luna-send', '-i', f'hb://{client.host}', f'luna://{service_name}', payload],
                        capture_output=True,
                        text=True,
                        timeout=3
                    )
                    if result.returncode == 0 and result.stdout.strip():
                        log_content.append(f"✅ {service_name}: {result.stdout.strip()[:200]}")
                        methods_successful.append(f"Luna: {service_name}")
                        logger.info(f"✅ Luna {service_name} - SUCCESS")
                    else:
                        log_content.append(f"❌ {service_name}: No response or error")
                except FileNotFoundError:
                    # luna-send not available, try via WebOS client
                    try:
                        response = LGTVController._luna_call(client, f"luna://{service_name}", payload)
                        if response:
                            log_content.append(f"✅ {service_name}: {str(response)[:200]}")
                            methods_successful.append(f"Luna: {service_name}")
                            logger.info(f"✅ Luna {service_name} - SUCCESS (via client)")
                        else:
                            log_content.append(f"❌ {service_name}: No response")
                    except Exception as e:
                        log_content.append(f"❌ {service_name}: {str(e)[:80]}")
                except Exception as e:
                    log_content.append(f"❌ {service_name}: {str(e)[:80]}")
            
            # Method 5: Try to get WebSocket connection info
            methods_tried.append("WebSocket Connection Info")
            try:
                if hasattr(client, 'host'):
                    log_content.append("\n=== Method 5: WebSocket Connection Info ===")
                    log_content.append(f"✅ TV IP: {client.host}")
                    log_content.append(f"✅ Connection: Active")
                    if hasattr(client, 'connection') and client.connection:
                        log_content.append(f"✅ Connection object exists")
                    methods_successful.append("WebSocket Connection Info")
                    logger.info("✅ WebSocket Connection Info - SUCCESS")
            except Exception as e:
                log_content.append("\n=== Method 5: WebSocket Connection Info ===")
                log_content.append(f"❌ FAILED: {str(e)[:100]}")
            
            # Method 6: Try SSH (will fail but we try anyway)
            methods_tried.append("SSH journalctl")
            tv_logs_only = ""
            try:
                logger.info("\n=== Method 6: SSH journalctl ===")
                result = subprocess.run(
                    ['ssh', '-o', 'ConnectTimeout=2', '-o', 'StrictHostKeyChecking=no', 
                     f'root@{client.host}', 'journalctl', '-n', str(max_lines), '--no-pager'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0 and result.stdout.strip():
                    log_content.append("\n=== Method 6: SSH journalctl ===")
                    log_content.append(f"✅ SUCCESS - Got system logs")
                    log_content.append(result.stdout.strip())
                    tv_logs_only = result.stdout.strip()
                    methods_successful.append("SSH journalctl")
                    logger.info("✅ SSH journalctl - SUCCESS")
                else:
                    log_content.append("\n=== Method 6: SSH journalctl ===")
                    log_content.append(f"❌ FAILED: SSH not available (expected)")
            except Exception as e:
                log_content.append("\n=== Method 6: SSH journalctl ===")
                log_content.append(f"❌ FAILED: {str(e)[:100]} (expected - SSH not available)")
            
            # Summary
            log_content.append("\n" + "="*80)
            log_content.append("SUMMARY")
            log_content.append("="*80)
            log_content.append(f"Methods Tried: {len(methods_tried)}")
            log_content.append(f"Methods Successful: {len(methods_successful)}")
            log_content.append(f"\nSuccessful Methods:")
            for method in methods_successful:
                log_content.append(f"  ✅ {method}")
            log_content.append(f"\nFailed Methods:")
            for method in methods_tried:
                if method not in methods_successful:
                    log_content.append(f"  ❌ {method}")
            
            logger.info("="*80)
            logger.info(f"Summary: {len(methods_successful)}/{len(methods_tried)} methods successful")
            
            # Return logs: prefer SSH if available, otherwise return all collected info
            if tv_logs_only:
                return {"success": True, "logs": tv_logs_only, "timestamp": datetime.now().isoformat()}
            else:
                webos_logs = "\n".join(log_content)
                return {"success": True, "logs": webos_logs, "timestamp": datetime.now().isoformat()}
                
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
    async def ensure_connection(session):
        """Ensure LG TV connection: Check state, reconnect if needed, validate before storing."""
        # Import managers here to avoid circular imports
        from main import token_manager, db_manager
        
        # Check if connection exists and is valid
        if session.lg_client and session.lg_controls:
            try:
                # Test if connection is still alive by checking client state
                def _check_alive():
                    try:
                        # Try to access a simple property to see if connection is alive
                        if hasattr(session.lg_client, 'connection') and session.lg_client.connection:
                            # Connection object exists, assume it's alive
                            return True
                        return False
                    except Exception:
                        return False
                
                is_alive = await asyncio.to_thread(_check_alive)
                if is_alive:
                    logger.debug(f"Reusing existing LG TV connection for session {session.id}")
                    return session.lg_controls
                else:
                    logger.warning(f"LG TV connection exists but appears dead for session {session.id}, reconnecting...")
                    session.lg_client = None
                    session.lg_controls = None
            except Exception as e:
                logger.warning(f"Error checking LG TV connection for session {session.id}: {e}, reconnecting...")
                session.lg_client = None
                session.lg_controls = None
        
        # Connection doesn't exist or is dead, need to recreate
        # Use stored client_key from session first, then fall back to token_manager
        stored_client_key = None
        if hasattr(session, 'lg_client_key') and session.lg_client_key:
            stored_client_key = session.lg_client_key
            logger.info(f"Using client key from session for {session.ip}")
        elif session.tv_name:
            # Fall back to token_manager if session doesn't have key
            stored_client_key = token_manager.get_lg_client_key(session.tv_name)
            if stored_client_key:
                logger.info(f"Using stored client key from token_manager for {session.tv_name}")
                session.lg_client_key = stored_client_key  # Update session with key
        
        # Reconnect using test_connection which handles key validation
        logger.info(f"Reconnecting to LG TV at {session.ip}...")
        result = await LGTVController.test_connection(session.ip, session.tv_name)
        
        if result["status"] == "success":
            session.lg_client = result["client"]
            session.lg_controls = result["controls"]
            new_client_key = result.get("client_key")
            if new_client_key:
                session.lg_client_key = new_client_key
                # Save to database
                db_manager.update_session_activity(session.id, lg_client_key=new_client_key)
            logger.info(f"LG TV connection re-established for session {session.id}")
            return session.lg_controls
        else:
            error_msg = result.get("error", "Unknown error")
            logger.error(f"Failed to reconnect LG TV for session {session.id}: {error_msg}")
            raise ConnectionError(f"Failed to connect to LG TV: {error_msg}")

    @staticmethod
    async def send_command(session, msg):
        """Full command sending logic for LG TV - optimized for immediate response.
        Command is sent immediately to TV, response returns right after sending.
        Logs are captured asynchronously in background without blocking."""
        # Ensure connection is active
        try:
            controls = await LGTVController.ensure_connection(session)
        except Exception as conn_error:
            logger.error(f"Failed to ensure LG TV connection for session {session.id}: {conn_error}")
            return {"status": "error", "error": f"Connection failed: {str(conn_error)}. Please check TV is on and try again."}
        
        if msg.get("type") == "key":
            action = msg.get("action", "enter")
            
            # Send command immediately - this executes the TV action
            # asyncio.to_thread makes this non-blocking for the event loop
            result = await LGTVController.send_key(controls, action)
            
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

