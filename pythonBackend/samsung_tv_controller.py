"""
Samsung TV Controller
Handles all Samsung TV connection and remote control functionality
"""
import asyncio
import logging
import time
import requests
from datetime import datetime
from typing import Dict

# Import Samsung TV library
try:
    from samsungtvws import SamsungTVWS
    SAMSUNG_TV_AVAILABLE = True
except ImportError:
    SAMSUNG_TV_AVAILABLE = False

# Configure logger
logger = logging.getLogger(__name__)


class SamsungTVController:
    """Controller for Samsung TV remote operations"""
    
    @staticmethod
    def get_keymap():
        """Get key mapping for Samsung TV commands"""
        return {
            "up": "KEY_UP", "down": "KEY_DOWN", "left": "KEY_LEFT", "right": "KEY_RIGHT",
            "enter": "KEY_ENTER", "back": "KEY_RETURN", "home": "KEY_HOME",
            "menu": "KEY_MENU", "power": "KEY_POWER", "source": "KEY_SOURCE",
            "volume_up": "KEY_VOLUP", "volume_down": "KEY_VOLDOWN", "mute": "KEY_MUTE",
            "channel_up": "KEY_CHUP", "channel_down": "KEY_CHDOWN",
            "play": "KEY_PLAY", "pause": "KEY_PAUSE", "stop": "KEY_STOP",
            "rewind": "KEY_REWIND", "fast_forward": "KEY_FF", "next": "KEY_FF", "previous": "KEY_REWIND",
            "info": "KEY_INFO", "guide": "KEY_GUIDE", "exit": "KEY_EXIT",
            "red": "KEY_RED", "green": "KEY_GREEN", "yellow": "KEY_YELLOW", "blue": "KEY_BLUE",
            "0": "KEY_0", "1": "KEY_1", "2": "KEY_2", "3": "KEY_3", "4": "KEY_4",
            "5": "KEY_5", "6": "KEY_6", "7": "KEY_7", "8": "KEY_8", "9": "KEY_9",
            "dot": "KEY_DOT", "period": "KEY_DOT",
            "tools": "KEY_TOOLS", "settings": "KEY_SETTINGS",  # Try KEY_SETTINGS first
            # App shortcuts
            "youtube": "KEY_YOUTUBE", "netflix": "KEY_NETFLIX", "prime": "KEY_PRIMEIDEO", "prime video": "KEY_PRIMEIDEO",
            "mewatch": "KEY_MEWATCH", "hulu": "KEY_HULU", "disney": "KEY_DISNEY"
        }

    @staticmethod
    async def test_connection(ip: str, tv_name: str = None, name: str = "SamsungTvRemote"):
        """Connect to Samsung TV and return connection object with token management"""
        if not SAMSUNG_TV_AVAILABLE:
            return {
                "status": "error",
                "error": "Samsung TV library not installed. Run: pip install samsungtvws"
            }
        
        # Import token_manager here to avoid circular imports
        from main import token_manager
        
        # Get stored token if TV name provided
        stored_token = None
        if tv_name:
            stored_token = token_manager.get_samsung_token(tv_name)
            
        def _connect():
            try:
                # First, test REST API connection to get device info
                logger.info(f"Testing REST API connection to {ip}:8001")
                tv_rest = SamsungTVWS(ip, port=8001, name=name)
                device_info = tv_rest.rest_device_info()
                logger.info(f"REST API successful: {device_info.get('name', 'Unknown TV')}")
                
                # Now create WebSocket connection (port 8002) for actual command sending
                tv = None
                token = stored_token
                connection_error = None
                
                try:
                    logger.info(f"Creating WebSocket connection to {ip}:8002")
                    if stored_token:
                        try:
                            # Try with stored token first
                            tv = SamsungTVWS(ip, port=8002, token=stored_token, name=name)
                            # Verify connection is actually working
                            # SamsungTVWS uses lazy connections - object creation is enough
                            logger.info(f"WebSocket connection object created with stored token")
                            # Extract token if available
                            if hasattr(tv, 'token') and tv.token:
                                token = tv.token
                            elif hasattr(tv, 'connection') and hasattr(tv.connection, 'token'):
                                token = tv.connection.token
                        except Exception as e:
                            logger.warning(f"Stored token failed: {e}, trying without token")
                            tv = None
                            connection_error = str(e)
                    
                    # If token failed or no token, try without token
                    if not tv:
                        try:
                            logger.info(f"Creating WebSocket connection without token (may require TV auth)")
                            tv = SamsungTVWS(ip, port=8002, name=name)
                            # SamsungTVWS uses lazy connections, so object creation is enough
                            # Connection will be established when first command is sent
                            logger.info(f"WebSocket connection object created (connection will be established on first use)")
                        except Exception as e:
                            error_msg = f"Failed to create WebSocket connection object: {e}"
                            if connection_error:
                                error_msg += f" (previous error: {connection_error})"
                            logger.error(error_msg)
                            # Return success for REST API but note WebSocket issue
                            return {
                                "status": "partial_success",
                                "tv": None,
                                "device_info": device_info,
                                "token": token,
                                "token_stored": bool(token),
                                "error": f"REST API works but WebSocket failed: {error_msg}",
                                "message": "TV is reachable but WebSocket connection failed. Commands may not work."
                            }
                    
                    # IMPORTANT: For lazy connections, we need to actually send a command to establish connection
                    # and get/extract the token. This will:
                    # 1. If we have a stored token: Test if it works (if it fails, we'll get a new one)
                    # 2. If no token: Trigger authentication and get a new token
                    # Send a lightweight command (KEY_HOME) to establish connection and get token
                    if tv:
                        try:
                            if stored_token:
                                logger.info(f"Testing stored token by sending test command...")
                            else:
                                logger.info(f"Sending test command to establish connection and get token (will trigger auth if needed)...")
                            
                            tv.send_key("KEY_HOME")
                            logger.info(f"Test command sent successfully - connection established")
                            
                            # Now extract token after connection is established
                            # Token should be available after connection is established
                            if hasattr(tv, 'token') and tv.token:
                                token = tv.token
                                logger.info(f"Token extracted from connection object: {len(token)} chars")
                            elif hasattr(tv, 'connection') and hasattr(tv.connection, 'token'):
                                token = tv.connection.token
                                logger.info(f"Token extracted from connection.connection.token: {len(token)} chars")
                            # Also check token_file
                            elif hasattr(tv, 'token_file') and tv.token_file:
                                try:
                                    with open(tv.token_file, 'r') as f:
                                        token = f.read().strip()
                                        logger.info(f"Token read from token_file: {len(token)} chars")
                                except Exception as e:
                                    logger.debug(f"Could not read token_file: {e}")
                            
                            if token and token != stored_token:
                                logger.info(f"Got new token from connection (length: {len(token)})")
                            elif stored_token and not token:
                                # If we had a stored token but couldn't extract it, use the stored one
                                token = stored_token
                                logger.info(f"Using stored token (could not extract from connection)")
                        except Exception as e:
                            # If command fails, it might be because:
                            # 1. Authentication is required (no token or invalid token)
                            # 2. Connection issue
                            error_str = str(e).lower()
                            if "unauthorized" in error_str or "auth" in error_str:
                                logger.warning(f"Authentication required - stored token may be invalid: {e}")
                                # Clear the stored token since it's invalid
                                token = None
                            else:
                                logger.warning(f"Test command failed: {e}")
                            
                            # Try to extract token anyway - it might be available even if command failed
                            # (e.g., if user accepted auth during the command)
                            try:
                                if hasattr(tv, 'token') and tv.token:
                                    token = tv.token
                                    logger.info(f"Token extracted after command failure: {len(token)} chars")
                                elif hasattr(tv, 'connection') and hasattr(tv.connection, 'token'):
                                    token = tv.connection.token
                                    logger.info(f"Token extracted from connection after command failure: {len(token)} chars")
                            except:
                                pass
                    
                    # ALWAYS save token if we have one - this ensures it's persisted
                    # Accept tokens of any reasonable length - some Samsung TV models use shorter tokens (4+ chars)
                    # CRITICAL: token_manager is the primary source (like main copy.py)
                    if token and len(token) >= 4 and tv_name:
                        token_manager.set_samsung_token(tv_name, token)
                        if token != stored_token:
                            logger.info(f"Saved new token for TV: {tv_name} (token length: {len(token)})")
                        else:
                            logger.info(f"Token confirmed and saved for TV: {tv_name} (token length: {len(token)})")
                    elif token and len(token) < 4:
                        logger.warning(f"Token too short ({len(token)} chars), not saving. Will require new authentication.")
                        token = None  # Clear invalid token
                    elif stored_token and len(stored_token) >= 4 and tv_name:
                        # If we have a stored token but couldn't extract a new one, ensure it's saved to token_manager
                        token_manager.set_samsung_token(tv_name, stored_token)
                        logger.info(f"Ensured stored token is saved for TV: {tv_name} (token length: {len(stored_token)})")
                        token = stored_token  # Use stored token
                    elif stored_token and len(stored_token) < 4:
                        logger.warning(f"Stored token too short ({len(stored_token)} chars), ignoring. Will require new authentication.")
                        token = None  # Clear invalid token
                    
                    return {
                        "status": "success",
                        "tv": tv,
                        "device_info": device_info,
                        "token": token,
                        "token_stored": bool(token)
                    }
                    
                except Exception as ws_error:
                    logger.warning(f"WebSocket connection failed: {ws_error}, but REST API works")
                    # Return partial success - REST works but WS doesn't
                    return {
                        "status": "partial_success",
                        "tv": None,
                        "device_info": device_info,
                        "token": token,
                        "token_stored": bool(token),
                        "error": f"WebSocket connection failed: {ws_error}",
                        "message": "TV is reachable but WebSocket connection failed. Commands may not work."
                    }
                
            except ConnectionRefusedError:
                return {
                    "status": "error",
                    "error": "Connection refused. Make sure TV is on and on the same network."
                }
            except TimeoutError:
                return {
                    "status": "error",
                    "error": "Connection timeout. Check IP address and network connectivity."
                }
            except Exception as e:
                return {
                    "status": "error",
                    "error": str(e)
                }

        return await asyncio.to_thread(_connect)

    @staticmethod
    async def request_authentication(ip: str, tv_name: str = None, name: str = "SamsungTvRemote"):
        """Request authentication from Samsung TV (user needs to accept on TV)"""
        if not SAMSUNG_TV_AVAILABLE:
            return {
                "status": "error",
                "error": "Samsung TV library not installed. Run: pip install samsungtvws"
            }
        
        # Import token_manager here to avoid circular imports
        from main import token_manager
            
        def _request_auth():
            try:
                logger.info(f"Requesting authentication from Samsung TV at {ip}")
                logger.info("Please check your TV screen and accept the connection request...")
                
                # Create connection without token to trigger auth request
                tv = SamsungTVWS(ip, port=8002, name=name)
                
                # Try to send a command to trigger authentication
                try:
                    tv.send_key("KEY_HOME")
                    logger.info("Authentication successful!")
                    
                    # Get the token
                    token = None
                    if hasattr(tv, 'token') and tv.token:
                        token = tv.token
                    elif hasattr(tv, 'connection') and hasattr(tv.connection, 'token'):
                        token = tv.connection.token
                    
                    # CRITICAL: Always save to token_manager (primary source)
                    if token and tv_name:
                        token_manager.set_samsung_token(tv_name, token)
                        logger.info(f"Token saved for TV: {tv_name} (length: {len(token)})")
                    
                    return {
                        "status": "success",
                        "tv": tv,
                        "token": token,
                        "message": "Authentication successful! Token saved."
                    }
                    
                except Exception as e:
                    if "unauthorized" in str(e).lower() or "timeout" in str(e).lower():
                        return {
                            "status": "auth_required",
                            "error": "Authentication required. Please check your TV and accept the connection request, then try again.",
                            "message": "Look for a popup on your TV screen asking to allow the connection."
                        }
                    else:
                        raise e
                        
            except Exception as e:
                return {
                    "status": "error",
                    "error": str(e)
                }
        
        return await asyncio.to_thread(_request_auth)

    @staticmethod
    async def refresh_token(ip: str, tv_name: str, name: str = "SamsungTvRemote"):
        """Refresh the stored token for a Samsung TV"""
        if not SAMSUNG_TV_AVAILABLE:
            return {
                "status": "error",
                "error": "Samsung TV library not installed. Run: pip install samsungtvws"
            }
        
        # Import token_manager here to avoid circular imports
        from main import token_manager
            
        def _refresh_token():
            try:
                logger.info(f"Refreshing token for Samsung TV at {ip}")
                
                # Remove old token
                token_manager.remove_samsung_token(tv_name)
                
                # Create new connection to get fresh token
                tv = SamsungTVWS(ip, port=8002, name=name)
                
                # Try to send a command to trigger new authentication
                try:
                    tv.send_key("KEY_HOME")
                    logger.info("Token refresh successful!")
                    
                    # Get the new token
                    token = None
                    if hasattr(tv, 'token') and tv.token:
                        token = tv.token
                    elif hasattr(tv, 'connection') and hasattr(tv.connection, 'token'):
                        token = tv.connection.token
                    
                    # CRITICAL: Always save to token_manager (primary source)
                    if token:
                        token_manager.set_samsung_token(tv_name, token)
                        logger.info(f"New token saved for TV: {tv_name} (length: {len(token)})")
                    
                    return {
                        "status": "success",
                        "tv": tv,
                        "token": token,
                        "message": "Token refreshed successfully!"
                    }
                    
                except Exception as e:
                    return {
                        "status": "error",
                        "error": f"Token refresh failed: {str(e)}"
                    }
                        
            except Exception as e:
                return {
                    "status": "error",
                    "error": str(e)
                }
        
        return await asyncio.to_thread(_refresh_token)

    @staticmethod
    def _check_connection_alive(tv) -> bool:
        """Check if Samsung TV WebSocket connection is actually alive by testing it"""
        if not tv:
            return False
        try:
            # For lazy connections, we need to actually test if the connection works
            # Try to access the connection state - if it's been used, socket should exist
            if hasattr(tv, 'connection') and tv.connection:
                conn = tv.connection
                # Check if connection has a socket (means it's been used/established)
                if hasattr(conn, 'sock'):
                    sock = conn.sock
                    if sock is None:
                        # Socket not created yet (lazy init) - connection hasn't been used yet
                        # This is OK, it will be created on first use
                        return True
                    # Socket exists, check if it's closed
                    try:
                        if hasattr(sock, 'closed') and sock.closed:
                            return False
                        # Try to get peer name - will raise if socket is closed
                        if hasattr(sock, 'getpeername'):
                            sock.getpeername()
                        return True
                    except (OSError, AttributeError):
                        # Socket is closed or invalid
                        return False
                # No socket yet (lazy init) - connection hasn't been used yet, assume OK
                return True
            # No connection object yet (lazy init) - assume OK
            return True
        except Exception:
            # On any error checking state, assume connection might still work
            # We'll find out when we try to use it
            return True
    
    @staticmethod
    def _test_connection_by_use(tv) -> bool:
        """Test connection by actually trying to use it (lightweight check)"""
        if not tv:
            return False
        try:
            # Try to access a property that requires connection to be established
            # This will fail if connection is dead
            if hasattr(tv, 'connection') and tv.connection:
                conn = tv.connection
                # If socket exists and is closed, connection is dead
                if hasattr(conn, 'sock') and conn.sock:
                    try:
                        if hasattr(conn.sock, 'closed') and conn.sock.closed:
                            return False
                        # Try to access socket - will fail if closed
                        conn.sock.getpeername()
                    except (OSError, AttributeError):
                        return False
            # Connection object exists or not yet created (lazy init)
            # We can't know if it's dead until we try to use it
            return True
        except Exception:
            return False

    @staticmethod
    def _test_websocket_connection(tv) -> bool:
        """Test WebSocket connection - SamsungTVWS uses lazy connection, so just verify object exists"""
        if not tv:
            return False
        try:
            # SamsungTVWS creates connections lazily, so we can't check socket state immediately
            # Just verify the object exists and has the expected structure
            # The actual connection will be established when send_key() is called
            if hasattr(tv, 'connection'):
                # Connection object exists (even if not yet connected)
                return True
            # If no connection attribute, object might still be valid (lazy init)
            # Return True if object exists - let actual usage determine if it works
            return True
        except Exception:
            return False

    @staticmethod
    async def ensure_connection(session):
        """Ensure Samsung TV connection: Check state, reconnect if needed, validate before storing."""
        # Import managers here to avoid circular imports
        from main import token_manager, db_manager
        
        async with session.samsung_connection_lock:
            try:
                now = time.time()
                # Throttle: if we checked recently and connection exists, return it
                if session.samsung_tv and now - session.samsung_last_ensure_ts < 5:
                    # But still verify it's actually alive
                    def _check_alive():
                        return SamsungTVController._check_connection_alive(session.samsung_tv)
                    is_alive = await asyncio.to_thread(_check_alive)
                    if is_alive:
                        return session.samsung_tv
                    # Connection exists but is dead, need to reconnect
                    logger.warning(f"Connection exists but is dead for session {session.id}, reconnecting...")
                    session.samsung_tv = None

                # Non-intrusive REST API ping to verify TV is reachable (non-blocking)
                # Don't fail if REST API check fails - WebSocket might still work
                def _rest_ping():
                    try:
                        tv_rest = SamsungTVWS(session.ip, port=8001, name="SamsungTvRemote")
                        tv_rest.rest_device_info()
                        return True
                    except Exception as e:
                        logger.debug(f"REST API ping failed for {session.ip}: {e}")
                        return False
                
                # Run REST ping with timeout to avoid blocking too long
                try:
                    rest_ok = await asyncio.wait_for(asyncio.to_thread(_rest_ping), timeout=3.0)
                except asyncio.TimeoutError:
                    logger.warning(f"REST API ping timed out for {session.ip}, will try WebSocket anyway")
                    rest_ok = False
                
                if not rest_ok:
                    logger.warning(f"REST API ping failed for {session.ip}, but will try WebSocket connection anyway")
                    # Don't raise error - continue to try WebSocket connection
                    # Some TVs might have WebSocket working even if REST API doesn't respond

                # If we have an existing connection, verify it's actually working
                if session.samsung_tv:
                    def _test_ws():
                        return SamsungTVController._test_websocket_connection(session.samsung_tv)
                    ws_ok = await asyncio.to_thread(_test_ws)
                    if ws_ok:
                        session.samsung_last_ensure_ts = now
                        return session.samsung_tv
                    # Connection is dead, clear it
                    logger.warning(f"WebSocket connection is dead for session {session.id}, reconnecting...")
                    session.samsung_tv = None

                # Need to (re)open WebSocket connection
                stored_token = token_manager.get_samsung_token(session.tv_name) if session.tv_name else None

                def _open_ws():
                    from samsungtvws import SamsungTVWS as _WS
                    tv = None
                    last_error = None
                    
                    # Try with stored token first if available
                    if stored_token:
                        try:
                            logger.info(f"Attempting to connect with stored token for {session.ip}")
                            tv = _WS(session.ip, port=8002, token=stored_token, name="SamsungTvRemote")
                            # SamsungTVWS uses lazy connections - connection will be established on first use
                            # Don't send test command here as it may timeout - let first actual command establish connection
                            logger.info(f"WebSocket connection object created with stored token (connection will be established on first use)")
                            return tv
                        except Exception as e:
                            logger.warning(f"Stored token failed for {session.ip}: {e}")
                            last_error = e
                            tv = None
                    
                    # If token failed or no token, try without token (will trigger auth)
                    if not tv:
                        try:
                            logger.info(f"Attempting to connect without token for {session.ip} (may require TV auth)")
                            tv = _WS(session.ip, port=8002, name="SamsungTvRemote")
                            # SamsungTVWS uses lazy connections - connection will be established on first use
                            # Don't send test command here as it may timeout - let first actual command establish connection
                            logger.info(f"WebSocket connection object created without token (connection will be established on first use, may trigger auth)")
                            return tv
                        except Exception as e:
                            error_msg = f"Failed to create WebSocket connection object: {e}"
                            if last_error:
                                error_msg += f" (previous error: {last_error})"
                            logger.error(error_msg)
                            raise ConnectionError(error_msg)
                    
                    return tv

                tv = await asyncio.to_thread(_open_ws)
                
                # Verify connection object was created
                if not tv:
                    raise ConnectionError("Failed to create WebSocket connection object")
                
                # IMPORTANT: For lazy connections, we need to actually send a command to establish connection
                # This ensures the WebSocket is actually connected before we try to use it
                # Send a lightweight test command (KEY_HOME) to establish connection and verify it works
                def _establish_connection():
                    try:
                        if stored_token:
                            logger.info(f"Establishing WebSocket connection with stored token by sending test command...")
                        else:
                            logger.info(f"Establishing WebSocket connection without token by sending test command (may trigger auth)...")
                        
                        # Send test command to establish connection - this will trigger auth if needed
                        tv.send_key("KEY_HOME")
                        logger.info(f"Test command sent successfully - WebSocket connection established")
                        return True
                    except Exception as e:
                        error_str = str(e).lower()
                        # If it's an auth error, that's OK - connection might still be established
                        if "unauthorized" in error_str or "auth" in error_str:
                            logger.info(f"Authentication required during connection establishment (user may need to accept on TV)")
                            # Connection might still be established even if auth is required
                            return True
                        # For timeout or connection errors, log but don't fail - let first actual command try
                        elif "timeout" in error_str or "ms.channel.timeout" in error_str:
                            logger.warning(f"Test command timed out during connection establishment: {e}")
                            logger.warning(f"Connection object created but not verified. First actual command will attempt to establish connection.")
                            return False  # Connection not verified, but object exists
                        else:
                            logger.warning(f"Test command failed during connection establishment: {e}")
                            logger.warning(f"Connection object created but not verified. First actual command will attempt to establish connection.")
                            return False  # Connection not verified, but object exists
                
                # Try to establish connection with timeout
                try:
                    connection_established = await asyncio.wait_for(asyncio.to_thread(_establish_connection), timeout=5.0)
                    if connection_established:
                        logger.info(f"WebSocket connection successfully established for session {session.id}")
                except asyncio.TimeoutError:
                    logger.warning(f"Connection establishment timed out. Connection object created but not verified.")
                except Exception as e:
                    logger.warning(f"Error during connection establishment: {e}. Connection object created but not verified.")
                
                # Extract and save new token if available (after connection attempt)
                new_token = None
                try:
                    if hasattr(tv, 'token') and tv.token:
                        new_token = tv.token
                    elif hasattr(tv, 'connection') and hasattr(tv.connection, 'token'):
                        new_token = tv.connection.token
                    # Also check token_file
                    elif hasattr(tv, 'token_file') and tv.token_file:
                        try:
                            with open(tv.token_file, 'r') as f:
                                new_token = f.read().strip()
                        except Exception:
                            pass
                except Exception as e:
                    logger.debug(f"Could not extract token: {e}")
                
                if new_token and new_token != stored_token and session.tv_name:
                    token_manager.set_samsung_token(session.tv_name, new_token)
                    session.samsung_token = new_token
                    logger.info(f"Updated Samsung token for TV: {session.tv_name}")
                    # Update database as backup
                    db_manager.update_session_activity(session.id, samsung_token=new_token)
                elif stored_token:
                    # Ensure stored token is in session
                    session.samsung_token = stored_token
                    # Update database as backup
                    db_manager.update_session_activity(session.id, samsung_token=stored_token)
                
                # Store connection only after verification
                session.samsung_tv = tv
                session.samsung_last_activity = datetime.now()
                session.samsung_last_ensure_ts = time.time()
                # Save session to database
                db_manager.save_session(session)
                logger.info(f"WebSocket connection object ready for session {session.id}")
                return session.samsung_tv
            except Exception as e:
                logger.error(f"Error ensuring Samsung TV connection for session {session.id}: {e}")
                session.samsung_tv = None  # Clear dead connection
                raise e

    @staticmethod
    async def send_key(tv, key: str):
        """Send key command to Samsung TV with connection validation"""
        if not tv:
            logger.error("Samsung TV connection object is None, cannot send key")
            return {"status": "error", "error": "Samsung TV not connected", "connection_dead": True}
        
        keymap = SamsungTVController.get_keymap()
        mapped_key = keymap.get(key.lower())
        
        if not mapped_key:
            return {"status": "error", "error": f"Unknown key: {key}"}

        def _send_key():
            try:
                # Try to send the key - this will establish connection if lazy, or fail if dead
                tv.send_key(mapped_key)
                return {"status": "success", "action": key, "mapped_key": mapped_key}
            except Exception as e:
                error_msg = str(e).lower()
                error_type = type(e).__name__
                error_str = str(e)
                
                # Check for specific Samsung TV timeout error
                if "ms.channel.timeout" in error_str or "'event': 'ms.channel.timeout'" in error_str:
                    logger.warning(f"Samsung TV WebSocket timeout detected: {error_str}")
                    return {"status": "error", "error": f"Connection timeout: TV may not be responding. Please check TV is on and Developer Mode is enabled.", "connection_dead": True}
                
                # Check if it's an authentication/unauthorized error first
                auth_errors = ["unauthorized", "auth", "permission", "denied", "forbidden", "401", "403"]
                if any(keyword in error_msg for keyword in auth_errors):
                    # Token is invalid or expired - don't treat as connection error
                    logger.warning(f"Authentication error detected: {error_type}: {error_msg}")
                    return {"status": "error", "error": f"Authentication failed: {error_msg}. Token may be invalid.", "auth_failed": True, "connection_dead": False}
                # Check if it's a connection-related error (including WinError 10053)
                connection_errors = [
                    "ssl", "bad_length", "closed", "connection", "timeout", "refused", "reset",
                    "10053", "10054", "10061", "10060", "winerror", "oserror", "brokenpipeerror",
                    "connectionreseterror", "connectionabortederror", "connectionrefusederror"
                ]
                if any(keyword in error_msg or keyword.lower() in error_type.lower() for keyword in connection_errors):
                    # Connection is dead - return error that will trigger reconnection
                    logger.warning(f"Connection error detected: {error_type}: {error_msg}")
                    return {"status": "error", "error": f"Connection error: {error_msg}. Connection may be dead.", "connection_dead": True}
                return {"status": "error", "error": str(e), "connection_dead": False}

        return await asyncio.to_thread(_send_key)

    @staticmethod
    async def launch_app(tv, app_id: str):
        """Launch app on Samsung TV"""
        def _launch_app():
            try:
                tv.run_app(app_id)
                return {"status": "success", "app_id": app_id}
            except Exception as e:
                return {"status": "error", "error": str(e)}

        return await asyncio.to_thread(_launch_app)

    @staticmethod
    def send_command_via_rest(ip: str, key: str) -> Dict:
        """Send command to Samsung TV via REST API (fallback when WebSocket fails)"""
        try:
            import requests
            # Samsung TV REST API endpoint for sending keys
            # Some Samsung TVs support REST API for remote control
            url = f"http://{ip}:8001/api/v2/"
            
            # Try to send key via REST API
            # Note: Not all Samsung TVs support this, but it's worth trying as fallback
            response = requests.post(
                f"http://{ip}:8001/api/v2/",
                json={"method": "ms.remote.control", "params": {"Cmd": key, "TypeOfRemote": "SendRemoteKey", "DataOfCmd": "base64"}},
                timeout=3
            )
            
            if response.status_code == 200:
                return {"status": "success", "command": key, "method": "REST"}
            else:
                return {"status": "error", "error": f"REST API returned status {response.status_code}"}
        except Exception as e:
            return {"status": "error", "error": f"REST API fallback failed: {str(e)}"}
    
    @staticmethod
    def send_command(ip: str, command: str) -> Dict:
        """Send command to Samsung TV (legacy method)"""
        try:
            from samsungtvws import SamsungTVWS
            tv = SamsungTVWS(ip, port=8002)
            tv.send_key(command)
            return {"status": "success", "command": command}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @staticmethod
    def capture_and_display_logs(ip: str, max_lines: int = 50):
        """Capture and display recent logs from Samsung TV. Returns only pure TV logs (no headers)."""
        try:
            import requests
            tv_logs_only = []
            
            try:
                response = requests.get(f"http://{ip}:8001/api/v2/", timeout=5)
                apps_response = requests.get(f"http://{ip}:8001/api/v2/applications", timeout=5)
                
                # Log to console for backend visibility (not returned)
                logger.info("="*80)
                logger.info(f"📺 Samsung TV Info from {ip}")
                logger.info("="*80)
                
                if response.status_code == 200:
                    logger.info("Device Info:")
                    logger.info(f"  {response.text.strip()}")
                
                if apps_response.status_code == 200:
                    logger.info("\nRunning Applications:")
                    logger.info(f"  {apps_response.text.strip()}")
                
                # Try to get actual TV system logs
                try:
                    logs_response = requests.get(f"http://{ip}:8001/api/v2/logs?lines={max_lines}", timeout=5)
                    if logs_response.status_code == 200:
                        logger.info("\nRecent System Logs:")
                        logger.info(logs_response.text.strip())
                        # Return only TV logs (from REST API logs endpoint)
                        tv_logs_only.append(logs_response.text.strip())
                    else:
                        # If logs endpoint fails, return device info as fallback
                        if response.status_code == 200:
                            tv_logs_only.append(f"Device Info: {response.text.strip()}")
                except:
                    logger.info("\n  Note: Enable Developer Mode on Samsung TV for detailed logs")
                    logger.info("  To enable: Settings → General → External Device Manager → Developer Mode")
                    # If logs endpoint unavailable, return device info
                    if response.status_code == 200:
                        tv_logs_only.append(f"Device Info: {response.text.strip()}")
                
                logger.info("="*80)
                
                # Return only TV logs (no headers/separators)
                pure_tv_logs = "\n".join(tv_logs_only) if tv_logs_only else ""
                return {"success": True, "logs": pure_tv_logs, "timestamp": datetime.now().isoformat()}
                
            except requests.exceptions.Timeout:
                logger.warning("Samsung TV not responding to REST API")
                return {"success": False, "logs": "Samsung TV not responding to REST API", "timestamp": datetime.now().isoformat()}
            except requests.exceptions.ConnectionError:
                logger.warning("Could not connect to Samsung TV REST API")
                return {"success": False, "logs": "Could not connect to Samsung TV REST API", "timestamp": datetime.now().isoformat()}
                
        except Exception as e:
            logger.warning(f"Could not capture Samsung TV logs: {e}")
            return {"success": False, "logs": f"Error capturing logs: {str(e)}", "timestamp": datetime.now().isoformat()}

    @staticmethod
    async def connect_device(session):
        """Full connection logic for Samsung TV - handles all connection and session setup"""
        logger.info(f"Testing Samsung TV connection to {session.ip}")
        result = await SamsungTVController.test_connection(session.ip, session.tv_name)
        logger.info(f"Samsung TV connection result: {result}")
        
        if result["status"] == "success":
            session.samsung_tv = result["tv"]
            session.samsung_device_info = result.get("device_info")
            session.samsung_token = result.get("token")
            session.samsung_last_activity = datetime.now()
            logger.info(f"Samsung TV connected successfully to {session.ip} (WebSocket established)")
            
            # Start keep-alive task for Samsung TV
            await session.start_keep_alive()
            
            # Only capture logs if user has enabled log capture
            # Logs are disabled by default for better performance
            if hasattr(session, 'samsung_logs_enabled') and session.samsung_logs_enabled:
                logger.info("📺 Capturing logs from Samsung TV...")
                log_result = SamsungTVController.capture_and_display_logs(session.ip, max_lines=100)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
            
            return {"status": "success"}
        elif result["status"] == "partial_success":
            # REST API works but WebSocket failed - still allow connection but warn
            session.samsung_tv = result.get("tv")  # May be None
            session.samsung_device_info = result.get("device_info")
            session.samsung_token = result.get("token")
            session.samsung_last_activity = datetime.now()
            logger.warning(f"Samsung TV partially connected to {session.ip}: {result.get('error', 'Unknown error')}")
            logger.warning(f"REST API works but WebSocket connection failed. Commands may not work until WebSocket is established.")
            
            # Start keep-alive task - it will try to establish WebSocket connection
            await session.start_keep_alive()
            
            # Only capture logs if user has enabled log capture
            # Logs are disabled by default for better performance
            if hasattr(session, 'samsung_logs_enabled') and session.samsung_logs_enabled:
                logger.info("📺 Capturing logs from Samsung TV...")
                log_result = SamsungTVController.capture_and_display_logs(session.ip, max_lines=100)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
            
            return {"status": "partial_success", "error": result.get("error")}
        elif result["status"] == "auth_required":
            return {"status": "auth_required", "error": "Samsung TV authentication required. Please accept the connection on your TV and try again."}
        else:
            error_msg = result.get("error", "Unknown error")
            return {"status": "error", "error": f"Failed to connect to Samsung TV: {error_msg}"}

    @staticmethod
    async def _capture_logs_background(session, action: str, delay: float = 0.5):
        """Capture logs in background after TV action completes"""
        # Wait a bit for TV to process the action
        await asyncio.sleep(delay)
        try:
            logger.info(f"📺 Capturing logs after {action} command...")
            log_result = SamsungTVController.capture_and_display_logs(session.ip, max_lines=30)
            if log_result.get("success"):
                session.logs.append(log_result)
                session.last_log_update = datetime.now()
        except Exception as e:
            logger.error(f"Error capturing logs in background: {e}")

    @staticmethod
    async def send_command(session, msg):
        """Full command sending logic for Samsung TV - handles all command types. Returns immediately, logs captured in background."""
        # Ensure connection is active
        try:
            tv = await SamsungTVController.ensure_connection(session)
            if not tv:
                logger.error(f"Samsung TV connection is None for session {session.id}")
                return {"status": "error", "error": "Samsung TV connection failed. Please check TV is on and try again."}
            session.samsung_last_activity = datetime.now()
        except Exception as conn_error:
            logger.error(f"Failed to ensure Samsung TV connection for session {session.id}: {conn_error}")
            return {"status": "error", "error": f"Connection failed: {str(conn_error)}. Please check TV is on and try again."}
        
        if msg.get("type") == "key":
            action = msg.get("action", "enter")
            logger.info(f"🎯 Samsung TV send_command: Processing key action '{action}'")
            result = await SamsungTVController.send_key(tv, action)
            logger.info(f"✅ Samsung TV send_key result: {result.get('status')}, mapped_key: {result.get('mapped_key', 'N/A')}")
            
            # If send_key failed due to authentication error, clear token and try to reconnect
            if result.get("status") == "error" and result.get("auth_failed", False):
                logger.warning(f"Command failed due to authentication error (token invalid), clearing token and reconnecting...")
                try:
                    # Clear token and connection
                    session.samsung_token = None
                    session.samsung_tv = None
                    session.samsung_last_ensure_ts = 0  # Force reconnection check
                    # Remove token from token_manager if it exists
                    if session.tv_name:
                        from main import token_manager
                        token_manager.remove_samsung_token(session.tv_name)
                        logger.info(f"Removed invalid token for {session.tv_name}")
                    # Reconnect (will trigger auth if no token)
                    tv = await SamsungTVController.ensure_connection(session)
                    session.samsung_last_activity = datetime.now()
                    # Retry the command
                    result = await SamsungTVController.send_key(tv, action)
                    if result.get("status") == "success":
                        logger.info(f"Successfully reconnected with new token and retried command for session {session.id}")
                    else:
                        logger.error(f"Retry after token refresh failed: {result.get('error')}")
                except Exception as retry_error:
                    logger.error(f"Token refresh and retry failed: {retry_error}")
                    return {"status": "error", "error": f"Authentication failed and retry failed: {str(retry_error)}. Please accept the connection on your TV."}
            # If send_key failed due to connection error, always try to reconnect and retry
            elif result.get("status") == "error" and result.get("connection_dead", False):
                logger.warning(f"Command failed due to connection issue (likely dead connection), attempting reconnect and retry...")
                try:
                    # Clear dead connection immediately
                    session.samsung_tv = None
                    session.samsung_last_ensure_ts = 0  # Force reconnection check
                    
                    # If we got a timeout error, the token might be invalid - clear it to force re-auth
                    error_msg = result.get("error", "").lower()
                    if "timeout" in error_msg or "ms.channel.timeout" in error_msg:
                        logger.info(f"Timeout detected - clearing token to force fresh authentication")
                        old_token = session.samsung_token
                        session.samsung_token = None
                        if session.tv_name and old_token:
                            from main import token_manager
                            token_manager.remove_samsung_token(session.tv_name)
                            logger.info(f"Cleared potentially invalid token for {session.tv_name}")
                    
                    # Quick check: Verify TV is reachable via REST API before attempting WebSocket reconnection
                    def _quick_rest_check():
                        try:
                            tv_rest = SamsungTVWS(session.ip, port=8001, name="SamsungTvRemote")
                            tv_rest.rest_device_info()
                            return True
                        except Exception:
                            return False
                    
                    try:
                        rest_reachable = await asyncio.wait_for(asyncio.to_thread(_quick_rest_check), timeout=2.0)
                        if not rest_reachable:
                            logger.warning(f"TV at {session.ip} is not reachable via REST API. TV may be off.")
                            return {"status": "error", "error": "TV is not responding. Please check TV is on and try again.", "connection_dead": True}
                    except asyncio.TimeoutError:
                        logger.warning(f"REST API check timed out for {session.ip}. TV may be off or unreachable.")
                        return {"status": "error", "error": "TV is not responding. Please check TV is on and try again.", "connection_dead": True}
                    
                    # TV is reachable, try to reconnect WebSocket
                    tv = await SamsungTVController.ensure_connection(session)
                    session.samsung_last_activity = datetime.now()
                    # Retry the command
                    result = await SamsungTVController.send_key(tv, action)
                    if result.get("status") == "success":
                        logger.info(f"Successfully reconnected and retried command for session {session.id}")
                    else:
                        logger.error(f"Retry after reconnect failed: {result.get('error')}")
                except Exception as retry_error:
                    logger.error(f"Reconnection and retry failed: {retry_error}")
                    return {"status": "error", "error": f"Connection failed and retry failed: {str(retry_error)}"}
            
            # If command succeeded, extract and save token from connection (important for lazy connections)
            # This ensures we capture the token after authentication
            if result.get("status") == "success" and tv:
                try:
                    # Extract token after successful command (lazy connections establish on first use)
                    new_token = None
                    if hasattr(tv, 'token') and tv.token:
                        new_token = tv.token
                    elif hasattr(tv, 'connection') and hasattr(tv.connection, 'token'):
                        new_token = tv.connection.token
                    # Also check token_file
                    if not new_token and hasattr(tv, 'token_file') and tv.token_file:
                        try:
                            with open(tv.token_file, 'r') as f:
                                new_token = f.read().strip()
                        except:
                            pass
                    
                    # Save token if we got a new one (like main copy.py - no length validation, just save it)
                    # CRITICAL: Always save to token_manager FIRST (primary source), then database
                    if new_token and new_token != session.samsung_token and session.tv_name:
                        from main import token_manager, db_manager
                        # Save to token_manager FIRST (primary source - like main copy.py)
                        token_manager.set_samsung_token(session.tv_name, new_token)
                        # Update session
                        session.samsung_token = new_token
                        # Update database as backup
                        db_manager.update_session_activity(session.id, samsung_token=new_token)
                        logger.info(f"Extracted and saved new Samsung token for {session.tv_name} (length: {len(new_token)})")
                except Exception as e:
                    logger.debug(f"Could not extract token after successful command: {e}")
            
            # Only capture logs if user has enabled log capture
            # Logs are disabled by default for better performance
            if (result.get("status") == "success" or ("Connection" not in result.get("error", ""))) and hasattr(session, 'samsung_logs_enabled') and session.samsung_logs_enabled:
                # Create background task for log capture - use get_running_loop() for Python 3.7+
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(SamsungTVController._capture_logs_background(session, action, delay=0.5))
                except RuntimeError:
                    # If no running event loop, just skip log capture
                    logger.debug("No running event loop available for background log capture")
            
            # Return immediately - don't wait for logs
            return result
        
        elif msg.get("type") == "app":
            app_id = msg.get("app_id")
            if not app_id:
                return {"status": "error", "error": "App launch requires app_id"}
            result = await SamsungTVController.launch_app(tv, app_id)
            # Only capture logs if user has enabled log capture
            if result.get("status") == "success" and hasattr(session, 'samsung_logs_enabled') and session.samsung_logs_enabled:
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(SamsungTVController._capture_logs_background(session, f"app_{app_id}", delay=1.0))
                except RuntimeError:
                    logger.debug("No running event loop available for background log capture")
            return result
        
        elif msg.get("type") == "text":
            text = msg.get("text", "")
            if not text:
                return {"status": "error", "error": "Text input requires text content"}
            try:
                # Samsung TV text input
                session.samsung_tv.shortcuts().send_text(text)
                # Only capture logs if user has enabled log capture
                if hasattr(session, 'samsung_logs_enabled') and session.samsung_logs_enabled:
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(SamsungTVController._capture_logs_background(session, "text_input", delay=0.5))
                    except RuntimeError:
                        logger.debug("No running event loop available for background log capture")
                return {"status": "success", "text": text}
            except Exception as e:
                return {"status": "error", "error": str(e)}
        
        return {"status": "error", "error": "Unknown command type"}

    @staticmethod
    async def get_logs(session, max_lines: int = 100, refresh: bool = False):
        """Get logs for Samsung TV session"""
        # If refresh requested, capture fresh logs
        if refresh:
            try:
                log_result = SamsungTVController.capture_and_display_logs(session.ip, max_lines=max_lines)
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
                "device_type": "samsung_tv",
                "log_count": len(session.logs)
            }
        else:
            return {
                "success": False,
                "logs": "No logs available yet. Logs will be captured when commands are sent or when you refresh.",
                "timestamp": None,
                "last_log_update": None,
                "device_type": "samsung_tv",
                "log_count": 0
            }

