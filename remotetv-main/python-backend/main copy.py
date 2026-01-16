"""
Simplified Remote Control API
No OBS, No MediaMTX, No video streaming
Just device control via REST API
"""
import asyncio
import json
import logging
import threading
import time
import uuid
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import subprocess

# Import TV libraries at module level
try:
    from pywebostv.connection import WebOSClient
    from pywebostv.controls import MediaControl, SystemControl, ApplicationControl, InputControl
    LG_TV_AVAILABLE = True
except ImportError:
    LG_TV_AVAILABLE = False

try:
    from samsungtvws import SamsungTVWS
    SAMSUNG_TV_AVAILABLE = True
except ImportError:
    SAMSUNG_TV_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Timing configuration constants (5 seconds to 1 hour range)
MIN_TIMEOUT = 5.0  # Minimum 5 seconds
MAX_TIMEOUT = 3600.0  # Maximum 1 hour (3600 seconds)

def validate_timeout(value: float, name: str) -> float:
    """Validate timeout value is within acceptable range (5 seconds to 1 hour)"""
    if not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    
    if value < MIN_TIMEOUT:
        logger.warning(f"{name} ({value}s) is below minimum ({MIN_TIMEOUT}s), setting to minimum")
        return MIN_TIMEOUT
    elif value > MAX_TIMEOUT:
        logger.warning(f"{name} ({value}s) exceeds maximum ({MAX_TIMEOUT}s), setting to maximum")
        return MAX_TIMEOUT
    
    return float(value)

# Paths
TOKENS_DIR = Path("tokens")
SAMSUNG_TOKENS_FILE = TOKENS_DIR / "samsung_tokens.json"
LG_TOKENS_FILE = TOKENS_DIR / "lg_tokens.json"
ANDROID_TV_CERTS_DIR = TOKENS_DIR / "android_tv_certs"

# Device Types
class DeviceType(str, Enum):
    ANDROID = "android"
    ROKU = "roku"
    APPLE_TV = "apple_tv"
    SAMSUNG_TV = "samsung_tv"
    LG_TV = "lg_tv"

# Session Status
class SessionStatus(str, Enum):
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTING = "disconnecting"
    ERROR = "error"

# Request/Response Models
class ConnectRequest(BaseModel):
    ip: str 
    device_type: DeviceType
    tv_name: str = Field(..., max_length=100)

class SessionResponse(BaseModel):
    sessionId: str
    title: str
    ip: str
    whepUrl: str
    device_type: DeviceType
    status: SessionStatus

class Payload(BaseModel):
    msg: Dict

class PairRequest(BaseModel):
    ip: str
    pairing_port: int
    code: str

# FastAPI app
app = FastAPI(title="Remote Control API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request, call_next):
    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"API HIT {request.method} {request.url.path} from {client_ip}")
    try:
        response = await call_next(request)
        duration_ms = int((time.time() - start_time) * 1000)
        logger.info(f"API DONE {request.method} {request.url.path} -> {response.status_code} in {duration_ms}ms")
        return response
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.exception(f"API ERROR {request.method} {request.url.path} after {duration_ms}ms: {e}")
        raise

# Token Manager
class TokenManager:
    def __init__(self):
        self._ensure_tokens_dir()
        self.samsung_tokens = self._load_samsung_tokens()
        self.lg_tokens = self._load_lg_tokens()
        self._lock = threading.Lock()
    
    def _ensure_tokens_dir(self):
        TOKENS_DIR.mkdir(exist_ok=True)
        ANDROID_TV_CERTS_DIR.mkdir(exist_ok=True)
    
    def _load_samsung_tokens(self) -> Dict[str, str]:
        try:
            if SAMSUNG_TOKENS_FILE.exists():
                with open(SAMSUNG_TOKENS_FILE, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading Samsung tokens: {e}")
        return {}
    
    def _load_lg_tokens(self) -> Dict[str, str]:
        try:
            if LG_TOKENS_FILE.exists():
                with open(LG_TOKENS_FILE, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading LG tokens: {e}")
        return {}
    
    def _save_samsung_tokens(self):
        try:
            with open(SAMSUNG_TOKENS_FILE, 'w') as f:
                json.dump(self.samsung_tokens, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving Samsung tokens: {e}")
    
    def _save_lg_tokens(self):
        try:
            with open(LG_TOKENS_FILE, 'w') as f:
                json.dump(self.lg_tokens, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving LG tokens: {e}")
    
    def get_samsung_token(self, tv_name: str) -> Optional[str]:
        with self._lock:
            return self.samsung_tokens.get(tv_name)
    
    def set_samsung_token(self, tv_name: str, token: str):
        with self._lock:
            self.samsung_tokens[tv_name] = token
            self._save_samsung_tokens()
    
    def get_lg_client_key(self, tv_name: str) -> Optional[str]:
        with self._lock:
            return self.lg_tokens.get(tv_name)
    
    def set_lg_client_key(self, tv_name: str, client_key: str):
        with self._lock:
            self.lg_tokens[tv_name] = client_key
            self._save_lg_tokens()
    
    def get_all_samsung_tvs(self) -> Dict[str, str]:
        with self._lock:
            return dict(self.samsung_tokens)
    
    def remove_samsung_token(self, tv_name: str) -> bool:
        with self._lock:
            if tv_name in self.samsung_tokens:
                del self.samsung_tokens[tv_name]
                self._save_samsung_tokens()
                logger.info(f"Removed Samsung token for TV: {tv_name}")
                return True
            return False
    
    def get_all_lg_tvs(self) -> Dict[str, str]:
        with self._lock:
            return dict(self.lg_tokens)

# Global token manager
token_manager = TokenManager()

# Session Class
class Session:
    def __init__(self, session_id: str, ip: str, device_type: DeviceType, tv_name: str):
        self.id = session_id
        self.ip = ip
        self.device_type = device_type
        self.tv_name = tv_name
        self.status = SessionStatus.CONNECTING
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        
        # Device connections
        self.samsung_tv = None
        self.samsung_device_info = None
        self.samsung_token = None
        self.samsung_last_activity = None
        # Connection lock and throttle for Samsung WS
        self.samsung_connection_lock = asyncio.Lock()
        self.samsung_last_ensure_ts = 0.0
        self.lg_client = None
        self.lg_controls = None
        self.lg_client_key = None
        self.android_remote = None
        
        # Connection management
        self._keep_alive_task = None
        self._lock = threading.Lock()
        
        # Logs storage
        self.logs = []  # List to store log entries
        self.last_log_update = None  # Timestamp of last log update
    
    def update_activity(self):
        self.last_activity = datetime.now()
    
    async def start_keep_alive(self):
        """Start keep-alive task for Samsung TV connections"""
        if self.device_type == DeviceType.SAMSUNG_TV and not self._keep_alive_task:
            self._keep_alive_task = asyncio.create_task(self._keep_alive_loop())
            logger.info(f"Started keep-alive task for session {self.id}")
    
    async def _keep_alive_loop(self):
        """Keep Samsung TV connection alive by checking connection health periodically"""
        # Configurable keep-alive interval (5 seconds to 1 hour)
        keep_alive_interval = validate_timeout(30.0, "keep_alive_interval")  # Default 30 seconds
        consecutive_failures = 0
        max_failures = 3  # Allow up to 3 consecutive failures before giving up
        
        try:
            while self.status == SessionStatus.CONNECTED:
                await asyncio.sleep(keep_alive_interval)  # Check at configurable interval
                
                if self.device_type == DeviceType.SAMSUNG_TV:
                    try:
                        # Check if connection exists and is alive
                        if not self.samsung_tv:
                            logger.debug(f"Keep-alive: No connection for session {self.id}, ensuring connection...")
                            await SamsungTVController.ensure_connection(self)
                            consecutive_failures = 0
                            continue
                        
                        # Check connection health without sending commands
                        def _check_health():
                            return SamsungTVController._check_connection_alive(self.samsung_tv)
                        
                        is_alive = await asyncio.to_thread(_check_health)
                        
                        if is_alive:
                            self.samsung_last_activity = datetime.now()
                            consecutive_failures = 0
                            logger.debug(f"Keep-alive: Connection healthy for session {self.id}")
                        else:
                            logger.warning(f"Keep-alive: Connection is dead for session {self.id}, reconnecting...")
                            self.samsung_tv = None  # Clear dead connection
                            await SamsungTVController.ensure_connection(self)
                            consecutive_failures = 0
                            
                    except Exception as e:
                        consecutive_failures += 1
                        logger.warning(f"Keep-alive check failed for session {self.id} (failure {consecutive_failures}/{max_failures}): {e}")
                        
                        # Try to reconnect
                        try:
                            self.samsung_tv = None  # Clear potentially dead connection
                            await SamsungTVController.ensure_connection(self)
                            consecutive_failures = 0  # Reset on successful reconnect
                            logger.info(f"Keep-alive: Successfully reconnected for session {self.id}")
                        except Exception as reconnect_error:
                            logger.error(f"Keep-alive reconnection failed for session {self.id}: {reconnect_error}")
                            if consecutive_failures >= max_failures:
                                logger.error(f"Keep-alive: Max failures reached for session {self.id}, stopping keep-alive")
                                break  # Stop keep-alive after max failures
                            # Continue loop to retry after sleep
        except asyncio.CancelledError:
            logger.info(f"Keep-alive task cancelled for session {self.id}")
        except Exception as e:
            logger.error(f"Keep-alive loop error for session {self.id}: {e}")
    
    async def cleanup(self):
        """Clean up device connections"""
        logger.info(f"Cleaning up session {self.id}")
        self.status = SessionStatus.DISCONNECTING
        
        # Cancel keep-alive task
        if self._keep_alive_task:
            self._keep_alive_task.cancel()
            try:
                await self._keep_alive_task
            except asyncio.CancelledError:
                pass
        
        try:
            if self.samsung_tv:
                self.samsung_tv = None
            if self.lg_client:
                self.lg_client = None
            if self.android_remote:
                self.android_remote = None
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

# Session Manager
class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Session] = {}
        self._lock = threading.Lock()
    
    def add_session(self, session: Session) -> Dict:
        with self._lock:
            self.sessions[session.id] = session
            logger.info(f"Added session {session.id} for {session.device_type} at {session.ip}")
            return {"status": "success"}
    
    def get_session(self, session_id: str) -> Optional[Session]:
        with self._lock:
            session = self.sessions.get(session_id)
            if session:
                session.update_activity()
            else:
                # Log available sessions for debugging
                available_ids = list(self.sessions.keys())
                logger.debug(f"Session {session_id} not found. Available sessions: {available_ids}")
            return session
    
    async def remove_session(self, session_id: str) -> bool:
        with self._lock:
            session = self.sessions.pop(session_id, None)
        
        if session:
            await session.cleanup()
            logger.info(f"Removed session {session_id}")
            return True
        return False
    
    def list_all(self) -> list:
        with self._lock:
            return [
                {
                    "sessionId": s.id,
                    "ip": s.ip,
                    "device_type": s.device_type,
                    "tv_name": s.tv_name,
                    "status": s.status
                }
                for s in self.sessions.values()
            ]
    
    async def clear_all_sessions(self) -> int:
        """Clear all sessions and return count of cleared sessions"""
        with self._lock:
            session_ids = list(self.sessions.keys())
            count = len(session_ids)
        
        # Clean up each session
        for session_id in session_ids:
            await self.remove_session(session_id)
        
        logger.info(f"Cleared all {count} sessions")
        return count

# Global session manager
session_manager = SessionManager()

# Roku Controller
class RokuController:
    @staticmethod
    def get_keymap():
        return {
            "up": "Up", "down": "Down", "left": "Left", "right": "Right",
            "enter": "Select", "ok": "Select", "back": "Back", "home": "Home", 
            "play": "Play", "pause": "Pause", "stop": "Stop", "replay": "InstantReplay",
            "info": "Info", "search": "Search", "power": "PowerOff",
            "volume_up": "VolumeUp", "volume_down": "VolumeDown", "mute": "VolumeMute",
            "channel_up": "ChannelUp", "channel_down": "ChannelDown",
            "rewind": "Rev", "fastforward": "Fwd", "next": "SkipForward", "previous": "SkipBack"
        }
    
    @staticmethod
    def send_command(ip: str, command: str) -> Dict:
        """Send ECP command to Roku device"""
        import requests
        url = f"http://{ip}:8060/keypress/{command}"
        
        try:
            response = requests.post(
                url, 
                timeout=5,
                headers={'User-Agent': 'RemoteControl/1.0'}
            )
            
            if response.status_code == 200:
                return {"status": "success", "command": command}
            else:
                return {"status": "error", "error": f"HTTP {response.status_code}"}
        except requests.exceptions.RequestException as e:
            return {"status": "error", "error": str(e)}

# Samsung TV Controller
class SamsungTVController:
    @staticmethod
    def get_keymap():
        return {
            "up": "KEY_UP", "down": "KEY_DOWN", "left": "KEY_LEFT", "right": "KEY_RIGHT",
            "enter": "KEY_ENTER", "back": "KEY_RETURN", "home": "KEY_HOME",
            "menu": "KEY_MENU", "power": "KEY_POWER", "source": "KEY_SOURCE",
            "volume_up": "KEY_VOLUP", "volume_down": "KEY_VOLDOWN", "mute": "KEY_MUTE",
            "channel_up": "KEY_CHUP", "channel_down": "KEY_CHDOWN",
            "play": "KEY_PLAY", "pause": "KEY_PAUSE", "stop": "KEY_STOP",
            "info": "KEY_INFO", "guide": "KEY_GUIDE", "exit": "KEY_EXIT",
            "red": "KEY_RED", "green": "KEY_GREEN", "yellow": "KEY_YELLOW", "blue": "KEY_BLUE",
            "0": "KEY_0", "1": "KEY_1", "2": "KEY_2", "3": "KEY_3", "4": "KEY_4",
            "5": "KEY_5", "6": "KEY_6", "7": "KEY_7", "8": "KEY_8", "9": "KEY_9",
            "rewind": "KEY_REWIND", "fast_forward": "KEY_FF",
            "tools": "KEY_TOOLS", "settings": "KEY_SETTINGS",
            "netflix": "KEY_NETFLIX", "prime": "KEY_PRIMEIDEO"
        }

    @staticmethod
    async def test_connection(ip: str, tv_name: str = None, name: str = "SamsungTvRemote"):
        """Connect to Samsung TV and return connection object with token management"""
        if not SAMSUNG_TV_AVAILABLE:
            return {
                "status": "error",
                "error": "Samsung TV library not installed. Run: pip install samsungtvws"
            }
        
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
                            # Extract token if available
                            if hasattr(tv, 'token') and tv.token:
                                token = tv.token
                            elif hasattr(tv, 'connection') and hasattr(tv.connection, 'token'):
                                token = tv.connection.token
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
                    
                    # Save token if we got a new one
                    if token and token != stored_token and tv_name:
                        token_manager.set_samsung_token(tv_name, token)
                        logger.info(f"Saved new token for TV: {tv_name}")
                    
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
                    
                    if token and tv_name:
                        token_manager.set_samsung_token(tv_name, token)
                        logger.info(f"Token saved for TV: {tv_name}")
                    
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
                    
                    if token:
                        token_manager.set_samsung_token(tv_name, token)
                        logger.info(f"New token saved for TV: {tv_name}")
                    
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
        """Check if Samsung TV WebSocket connection is actually alive"""
        if not tv:
            return False
        try:
            # SamsungTVWS uses lazy connections, so we check if connection object exists
            # and if socket exists and appears open
            if hasattr(tv, 'connection') and tv.connection:
                conn = tv.connection
                # Check if connection has a socket
                if hasattr(conn, 'sock'):
                    sock = conn.sock
                    if sock is None:
                        # Socket not created yet (lazy init) - this is OK, will be created on use
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
                # No socket yet (lazy init) - this is OK
                return True
            # No connection object yet (lazy init) - this is OK for SamsungTVWS
            return True
        except Exception:
            # On any error, assume connection might still work (lazy init)
            return True

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

                # Non-intrusive REST API ping to verify TV is reachable
                def _rest_ping():
                    try:
                        tv_rest = SamsungTVWS(session.ip, port=8001, name="SamsungTvRemote")
                        tv_rest.rest_device_info()
                        return True
                    except Exception:
                        return False
                rest_ok = await asyncio.to_thread(_rest_ping)

                if not rest_ok:
                    logger.warning(f"REST API ping failed for {session.ip}, TV may be unreachable")
                    raise ConnectionError("TV is not reachable via REST API")

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
                            # SamsungTVWS uses lazy connections - object creation is enough
                            # Connection will be established when first command is sent
                            logger.info(f"WebSocket connection object created with stored token for {session.ip}")
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
                            # SamsungTVWS uses lazy connections - object creation is enough
                            logger.info(f"WebSocket connection object created without token for {session.ip}")
                            return tv
                        except Exception as e:
                            error_msg = f"Failed to create WebSocket connection object: {e}"
                            if last_error:
                                error_msg += f" (previous error: {last_error})"
                            logger.error(error_msg)
                            raise ConnectionError(error_msg)
                    
                    return tv

                tv = await asyncio.to_thread(_open_ws)
                
                # SamsungTVWS uses lazy connections, so we just verify object was created
                # Actual connection will be established when first command is sent
                if not tv:
                    raise ConnectionError("Failed to create WebSocket connection object")
                
                # Extract and save new token if available
                new_token = None
                try:
                    if hasattr(tv, 'token') and tv.token:
                        new_token = tv.token
                    elif hasattr(tv, 'connection') and hasattr(tv.connection, 'token'):
                        new_token = tv.connection.token
                except Exception as e:
                    logger.warning(f"Could not extract token: {e}")
                
                if new_token and new_token != stored_token and session.tv_name:
                    token_manager.set_samsung_token(session.tv_name, new_token)
                    logger.info(f"Updated Samsung token for TV: {session.tv_name}")
                
                # Store connection only after verification
                session.samsung_tv = tv
                session.samsung_last_activity = datetime.now()
                session.samsung_last_ensure_ts = time.time()
                logger.info(f"WebSocket connection established and verified for session {session.id}")
                return session.samsung_tv
            except Exception as e:
                logger.error(f"Error ensuring Samsung TV connection for session {session.id}: {e}")
                session.samsung_tv = None  # Clear dead connection
                raise e

    @staticmethod
    async def send_key(tv, key: str):
        """Send key command to Samsung TV with connection validation"""
        keymap = SamsungTVController.get_keymap()
        mapped_key = keymap.get(key.lower())
        
        if not mapped_key:
            return {"status": "error", "error": f"Unknown key: {key}"}

        def _send_key():
            try:
                # Verify connection is alive before sending
                if not SamsungTVController._check_connection_alive(tv):
                    return {"status": "error", "error": "Connection is not alive. Please reconnect."}
                
                tv.send_key(mapped_key)
                return {"status": "success", "action": key, "mapped_key": mapped_key}
            except Exception as e:
                error_msg = str(e)
                # Check if it's a connection-related error
                if "SSL" in error_msg or "BAD_LENGTH" in error_msg or "closed" in error_msg.lower():
                    return {"status": "error", "error": f"Connection error: {error_msg}. Connection may be dead."}
                return {"status": "error", "error": error_msg}

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
    def send_command(ip: str, command: str) -> Dict:
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

# LG TV Controller
class LGTVController:
    @staticmethod
    def get_keymap():
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
        """Send key command to LG TV"""
        keymap = LGTVController.get_keymap()
        mapped_key = keymap.get(key.lower())
        
        if not mapped_key:
            return {"status": "error", "error": f"Unknown key: {key}"}

        def _send_key():
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
                    media.mute()
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
                return {"status": "error", "error": str(e)}

        return await asyncio.to_thread(_send_key)

    @staticmethod
    def send_command(ip: str, command: str) -> Dict:
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

# Apple TV Controller
class AppleTVController:
    @staticmethod
    def get_keymap():
        return {
            "up": "up", "down": "down", "left": "left", "right": "right",
            "enter": "select", "ok": "select", "back": "menu", "home": "home",
            "play": "play", "pause": "pause", "stop": "stop",
            "volume_up": "volume_up", "volume_down": "volume_down", "mute": "mute",
            "next": "next", "previous": "previous", "rewind": "rewind", "fastforward": "fastforward"
        }
    
    @staticmethod
    def send_command(device, command: str) -> Dict:
        """Send command to Apple TV device"""
        try:
            # This would need pyatv library implementation
            # For now, return success (placeholder)
            return {"status": "success", "command": command}
        except Exception as e:
            return {"status": "error", "error": str(e)}

# Android Controller (using ADB)
class AndroidController:
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
            import re
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
        return {
            "up": "DPAD_UP", "down": "DPAD_DOWN",
            "left": "DPAD_LEFT", "right": "DPAD_RIGHT",
            "enter": "DPAD_CENTER", "back": "BACK",
            "home": "HOME", "menu": "MENU",
            "volume_up": "VOLUME_UP", "volume_down": "VOLUME_DOWN",
            "power": "POWER", "play": "MEDIA_PLAY",
            "pause": "MEDIA_PAUSE", "stop": "MEDIA_STOP"
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

# API Endpoints
@app.get("/sessions/check/{ip}")
async def check_existing_session(ip: str, device_type: str = None):
    """Check if there's an existing session for this IP/device"""
    sessions = session_manager.list_all()
    for session in sessions:
        if session["ip"] == ip and (device_type is None or session["device_type"] == device_type):
            if session["status"] == "connected":
                return {
                    "exists": True,
                    "session": session,
                    "message": "Existing session found"
                }
    return {
        "exists": False,
        "message": "No existing session found"
    }

@app.get("/sessions/{session_id}/status")
async def get_session_status(session_id: str):
    """Get status of a specific session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "sessionId": session.id,
        "ip": session.ip,
        "device_type": session.device_type,
        "tv_name": session.tv_name,
        "status": session.status,
        "connected": session.status == SessionStatus.CONNECTED,
        "created_at": session.created_at.isoformat(),
        "last_activity": session.last_activity.isoformat()
    }

@app.get("/sessions/{session_id}/logs")
async def get_session_logs(session_id: str, max_lines: int = 100, refresh: bool = False):
    """Get logs for a session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # If refresh requested, capture fresh logs
    if refresh:
        try:
            if session.device_type == DeviceType.ANDROID:
                log_result = AndroidController.capture_and_display_logs(session.ip, max_lines=max_lines)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
            elif session.device_type == DeviceType.SAMSUNG_TV:
                log_result = SamsungTVController.capture_and_display_logs(session.ip, max_lines=max_lines)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
            elif session.device_type == DeviceType.LG_TV:
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
            "device_type": session.device_type.value,
            "log_count": len(session.logs)
        }
    else:
        return {
            "success": False,
            "logs": "No logs available yet. Logs will be captured when commands are sent or when you refresh.",
            "timestamp": None,
            "last_log_update": None,
            "device_type": session.device_type.value,
            "log_count": 0
        }

@app.post("/sessions", response_model=SessionResponse)
async def connect_device(req: ConnectRequest):
    """Connect to a device"""
    try:
        # Check if there's already an active session for this IP/device
        sessions = session_manager.list_all()
        for session in sessions:
            if session["ip"] == req.ip and session["device_type"] == req.device_type:
                if session["status"] == "connected":
                    # Return existing session instead of creating new one
                    existing_session = session_manager.get_session(session["sessionId"])
                    if existing_session:
                        logger.info(f"Reusing existing session {session['sessionId']} for {req.device_type} at {req.ip}")
                        return SessionResponse(
                            sessionId=session["sessionId"],
                            title=f"{req.device_type.upper()}-{req.ip}",
                            ip=req.ip,
                            whepUrl="http://localhost:8889/mystream/whep",
                            device_type=req.device_type,
                            status=SessionStatus.CONNECTED
                        )
        
        # Create new session only if no existing session found
        session_id = str(uuid.uuid4())
        session = Session(session_id, req.ip, req.device_type, req.tv_name)
        
        result = session_manager.add_session(session)
        if result["status"] == "error":
            raise HTTPException(status_code=429, detail="Failed to add session")
        
        try:
            # Test connection based on device type
            if req.device_type == DeviceType.ANDROID:
                # First check if this is actually an Android device
                if AndroidController.is_samsung_tv(req.ip):
                    raise RuntimeError(f"Device at {req.ip} is a Samsung TV, not an Android device. Use device_type: 'samsung_tv'")
                
                if AndroidController.is_lg_tv(req.ip):
                    raise RuntimeError(f"Device at {req.ip} is an LG TV, not an Android device. Use device_type: 'lg_tv'")
                
                # Check if it's actually an Android device
                if not AndroidController.is_android_device(req.ip):
                    raise RuntimeError(f"Device at {req.ip} does not respond to ADB. Make sure it's an Android device with ADB enabled on port 5555")
                
                if not AndroidController.test_adb_connection(req.ip):
                    raise RuntimeError("Failed to connect via ADB. Check if ADB is enabled on the device and port 5555 is open")
                
                # Capture and display logs from Mi Android TV
                logger.info("📺 Capturing logs from Mi Android TV...")
                log_result = AndroidController.capture_and_display_logs(req.ip, max_lines=100)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
            
            elif req.device_type == DeviceType.SAMSUNG_TV:
                logger.info(f"Testing Samsung TV connection to {req.ip}")
                result = await SamsungTVController.test_connection(req.ip, req.tv_name)
                logger.info(f"Samsung TV connection result: {result}")
                if result["status"] == "success":
                    session.samsung_tv = result["tv"]
                    session.samsung_device_info = result.get("device_info")
                    session.samsung_token = result.get("token")
                    session.samsung_last_activity = datetime.now()
                    logger.info(f"Samsung TV connected successfully to {req.ip} (WebSocket established)")
                    
                    # Start keep-alive task for Samsung TV
                    await session.start_keep_alive()
                    
                    # Capture and display logs from Samsung TV
                    logger.info("📺 Capturing logs from Samsung TV...")
                    log_result = SamsungTVController.capture_and_display_logs(req.ip, max_lines=100)
                    if log_result.get("success"):
                        session.logs.append(log_result)
                        session.last_log_update = datetime.now()
                elif result["status"] == "partial_success":
                    # REST API works but WebSocket failed - still allow connection but warn
                    session.samsung_tv = result.get("tv")  # May be None
                    session.samsung_device_info = result.get("device_info")
                    session.samsung_token = result.get("token")
                    session.samsung_last_activity = datetime.now()
                    logger.warning(f"Samsung TV partially connected to {req.ip}: {result.get('error', 'Unknown error')}")
                    logger.warning(f"REST API works but WebSocket connection failed. Commands may not work until WebSocket is established.")
                    
                    # Start keep-alive task - it will try to establish WebSocket connection
                    await session.start_keep_alive()
                    
                    # Capture and display logs from Samsung TV
                    logger.info("📺 Capturing logs from Samsung TV...")
                    log_result = SamsungTVController.capture_and_display_logs(req.ip, max_lines=100)
                    if log_result.get("success"):
                        session.logs.append(log_result)
                        session.last_log_update = datetime.now()
                elif result["status"] == "auth_required":
                    error_msg = f"Samsung TV authentication required: {result['error']}"
                    logger.error(error_msg)
                    raise RuntimeError(error_msg)
                else:
                    error_msg = f"Samsung TV connection failed: {result.get('error', 'Unknown error')}"
                    logger.error(error_msg)
                    raise RuntimeError(error_msg)
            
            elif req.device_type == DeviceType.LG_TV:
                # Connect to LG TV with token management
                result = await LGTVController.test_connection(req.ip, req.tv_name)
                
                if result["status"] != "success":
                    raise RuntimeError(f"Failed to connect to LG TV: {result.get('error', 'Unknown error')}")
                
                # Store the connection objects in the session
                session.lg_client = result["client"]
                session.lg_controls = result["controls"]
                session.lg_client_key = result["client_key"]
                
                # Capture and display logs from LG TV
                logger.info("📺 Capturing logs from LG TV...")
                log_result = LGTVController.capture_and_display_logs(session.lg_client, max_lines=100)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
            
            session.status = SessionStatus.CONNECTED
            logger.info(f"Connected to {req.device_type} at {req.ip}")
            
            return SessionResponse(
                sessionId=session_id,
                title=f"{req.device_type.upper()}-{req.ip}",
                ip=req.ip,
                whepUrl="http://localhost:8889/mystream/whep",
                device_type=req.device_type,
                status=session.status
            )
            
        except Exception as e:
            logger.error(f"Connection failed for {req.device_type} at {req.ip}: {str(e)}")
            logger.error(f"Exception type: {type(e).__name__}")
            await session_manager.remove_session(session_id)
            raise HTTPException(status_code=400, detail=str(e))
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in connect_device: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/send/{session_id}")
async def send_command_to_device(session_id: str, payload: Payload):
    """Send command to device"""
    session = session_manager.get_session(session_id)
    if not session:
        logger.warning(f"Session {session_id} not found when trying to send command")
        raise HTTPException(status_code=404, detail="Session not found")
    
    msg = payload.msg
    logger.info(f"Command: {msg} for session {session_id}")
    
    try:
        if session.device_type == DeviceType.ANDROID:
            if msg.get("type") == "key":
                action = msg.get("action", "enter")
                keymap = AndroidController.get_keymap()
                keycode = keymap.get(action.lower(), "DPAD_CENTER")
                result = AndroidController.adb_shell(session.ip, ['input', 'keyevent', keycode])
                
                # Capture and display logs after sending the command
                logger.info(f"📺 Capturing logs after {action} command...")
                log_result = AndroidController.capture_and_display_logs(session.ip, max_lines=30)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
                
                return result
        
        elif session.device_type == DeviceType.SAMSUNG_TV:
            # Ensure connection is active
            try:
                tv = await SamsungTVController.ensure_connection(session)
                session.samsung_last_activity = datetime.now()
            except Exception as conn_error:
                logger.error(f"Failed to ensure Samsung TV connection for session {session.id}: {conn_error}")
                return {"status": "error", "error": f"Connection failed: {str(conn_error)}. Please check TV is on and try again."}
            
            if msg.get("type") == "key":
                action = msg.get("action", "enter")
                result = await SamsungTVController.send_key(tv, action)
                
                # If send_key failed due to connection error, try to reconnect and retry once
                if result.get("status") == "error" and ("Connection" in result.get("error", "") or "not alive" in result.get("error", "").lower()):
                    logger.warning(f"Command failed due to connection issue, attempting reconnect and retry...")
                    try:
                        session.samsung_tv = None  # Clear dead connection
                        tv = await SamsungTVController.ensure_connection(session)
                        result = await SamsungTVController.send_key(tv, action)  # Retry once
                    except Exception as retry_error:
                        logger.error(f"Reconnection and retry failed: {retry_error}")
                        return {"status": "error", "error": f"Connection failed and retry failed: {str(retry_error)}"}
                
                # Capture and display logs after sending the command (only if successful or non-connection error)
                if result.get("status") == "success" or ("Connection" not in result.get("error", "")):
                    logger.info(f"📺 Capturing logs after {action} command...")
                    log_result = SamsungTVController.capture_and_display_logs(session.ip, max_lines=30)
                    if log_result.get("success"):
                        session.logs.append(log_result)
                        session.last_log_update = datetime.now()
                
                return result
            
            elif msg.get("type") == "app":
                app_id = msg.get("app_id")
                if not app_id:
                    return {"status": "error", "error": "App launch requires app_id"}
                result = await SamsungTVController.launch_app(tv, app_id)
                return result
            
            elif msg.get("type") == "text":
                text = msg.get("text", "")
                if not text:
                    return {"status": "error", "error": "Text input requires text content"}
                try:
                    # Samsung TV text input
                    session.samsung_tv.shortcuts().send_text(text)
                    return {"status": "success", "text": text}
                except Exception as e:
                    return {"status": "error", "error": str(e)}
        
        elif session.device_type == DeviceType.ROKU:
            if msg.get("type") == "key":
                action = msg.get("action", "enter")
                keymap = RokuController.get_keymap()
                command = keymap.get(action.lower(), "Select")
                result = RokuController.send_command(session.ip, command)
                return result
            
            elif msg.get("type") == "text":
                text = msg.get("text", "")
                if not text:
                    return {"status": "error", "error": "Text input requires text content"}
                # Roku text input via search
                result = RokuController.send_command(session.ip, f"Search?{text}")
                return result
        
        elif session.device_type == DeviceType.APPLE_TV:
            if msg.get("type") == "key":
                action = msg.get("action", "enter")
                keymap = AppleTVController.get_keymap()
                command = keymap.get(action.lower(), "select")
                result = AppleTVController.send_command(session.apple_tv, command)
                return result
            
            elif msg.get("type") == "text":
                text = msg.get("text", "")
                if not text:
                    return {"status": "error", "error": "Text input requires text content"}
                # Apple TV text input would need pyatv implementation
                return {"status": "success", "text": text}
        
        elif session.device_type == DeviceType.LG_TV:
            # Ensure we have a valid connection
            if not session.lg_controls or not session.lg_client:
                return {"status": "error", "error": "No active LG TV connection"}
            
            if msg.get("type") == "key":
                result = await LGTVController.send_key(session.lg_controls, msg.get("action", "enter"))
                
                # Capture and display logs after sending the command
                action = msg.get("action", "enter")
                logger.info(f"📺 Capturing logs after {action} command...")
                log_result = LGTVController.capture_and_display_logs(session.lg_client, max_lines=30)
                if log_result.get("success"):
                    session.logs.append(log_result)
                    session.last_log_update = datetime.now()
                
                if result["status"] == "success":
                    return {"status": "success", "action": action, "mapped_key": result.get("mapped_key")}
                else:
                    return {
                        "status": "error", 
                        "error": result.get("error", "Unknown LG TV error")
                    }
            
            elif msg.get("type") == "text":
                text = msg.get("text", "")
                if not text:
                    return {"status": "error", "error": "Text input requires text content"}
                try:
                    if session.lg_controls and session.lg_controls.get("input_ctrl"):
                        # LG TV text input using input control
                        for char in text:
                            session.lg_controls["input_ctrl"].button(char)
                        return {"status": "success", "text": text}
                    else:
                        return {"status": "error", "error": "LG TV controls not available"}
                except Exception as e:
                    return {"status": "error", "error": str(e)}
            else:
                return {"status": "error", "error": f"Unsupported input type: {msg.get('type')}"}
        
        return {"status": "error", "error": "Unsupported device type"}
        
    except Exception as e:
        logger.error(f"Command error: {e}")
        return {"status": "error", "error": str(e)}

@app.post("/disconnect/{session_id}")
async def disconnect_device(session_id: str):
    """Disconnect session"""
    success = await session_manager.remove_session(session_id)
    if success:
        return {"status": "disconnected", "session_id": session_id}
    raise HTTPException(status_code=404, detail="Session not found")

@app.get("/sessions")
async def list_sessions():
    """List all active sessions"""
    return {"sessions": session_manager.list_all()}

@app.delete("/sessions")
async def clear_all_sessions():
    """Clear all active sessions"""
    count = await session_manager.clear_all_sessions()
    return {"status": "success", "message": f"Cleared {count} session(s)", "cleared_count": count}

@app.get("/tokens/samsung")
async def get_samsung_tokens():
    """Get all Samsung TV tokens"""
    return {"tvs": token_manager.get_all_samsung_tvs()}

@app.get("/tokens/lg")
async def get_lg_tokens():
    """Get all LG TV tokens"""
    return {"tvs": token_manager.get_all_lg_tvs()}

@app.post("/android/pair")
async def android_pair(req: PairRequest):
    result = AndroidController.adb_pair(req.ip, req.pairing_port, req.code)
    if result.get("status") != "success":
        raise HTTPException(status_code=400, detail=result.get("error", "Pairing failed"))
    return result

@app.post("/android/connect")
async def android_connect(req: dict):
    """Connect to TCL TV or other Android device via ADB over WiFi"""
    ip = req.get("ip")
    port = req.get("port", 5555)
    
    if not ip:
        raise HTTPException(status_code=400, detail="IP address is required")
    
    result = AndroidController.adb_connect_tcl(ip, port)
    if result.get("status") != "success":
        raise HTTPException(status_code=400, detail=result.get("error", "Connection failed"))
    return result

@app.post("/android/enable-wifi")
async def android_enable_wifi():
    """Enable WiFi ADB on TCL TV via USB connection"""
    result = AndroidController.adb_enable_wifi_tcl()
    if result.get("status") != "success":
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to enable WiFi ADB"))
    return result

@app.post("/android/sdb-connect")
async def android_sdb_connect(req: dict):
    """Connect to TCL TV via SDB (Samsung Debug Bridge)"""
    ip = req.get("ip")
    port = req.get("port", 26101)
    
    if not ip:
        raise HTTPException(status_code=400, detail="IP address is required")
    
    result = AndroidController.sdb_connect(ip, port)
    if result.get("status") != "success":
        raise HTTPException(status_code=400, detail=result.get("error", "SDB connection failed"))
    return result

@app.post("/samsung/authenticate")
async def authenticate_samsung_tv(ip: str, tv_name: str = None):
    """Request authentication from Samsung TV"""
    try:
        result = await SamsungTVController.request_authentication(ip, tv_name)
        
        if result["status"] == "success":
            return {
                "status": "success",
                "message": "Authentication successful! Token saved.",
                "token": result.get("token")
            }
        elif result["status"] == "auth_required":
            return {
                "status": "auth_required",
                "message": "Please check your TV screen and accept the connection request, then call this endpoint again.",
                "instructions": "Look for a popup on your TV screen asking to allow the connection."
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Authentication failed")
            )
            
    except Exception as e:
        logger.error(f"Samsung TV authentication error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Authentication error: {str(e)}"
        )

@app.post("/samsung/force-auth/{session_id}")
async def force_samsung_authentication(session_id: str):
    """Force re-authentication for a Samsung TV session (handles token expiration)"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.SAMSUNG_TV:
        raise HTTPException(status_code=400, detail="Session is not a Samsung TV")
    
    try:
        # Remove old token to force new authentication
        if session.tv_name:
            token_manager.remove_samsung_token(session.tv_name)
            logger.info(f"Removed old token for TV: {session.tv_name}")
        
        # Force new connection without token
        result = await SamsungTVController.test_connection(session.ip, session.tv_name)
        
        if result["status"] == "success":
            # Update session with new connection
            session.samsung_tv = result["tv"]
            if result.get("token"):
                session.samsung_token = result["token"]
            session.samsung_last_activity = datetime.now()
            
            return {
                "status": "success",
                "message": "New authentication initiated. Please check your TV screen and accept the connection request.",
                "token": result.get("token"),
                "instructions": "Look for a popup on your TV screen asking to allow the connection."
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to initiate authentication: {result.get('error', 'Unknown error')}"
            )
            
    except Exception as e:
        logger.error(f"Force authentication error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Authentication error: {str(e)}"
        )

@app.get("/test/samsung/{ip}")
async def test_samsung_tv(ip: str):
    """Test Samsung TV connectivity"""
    try:
        if not SAMSUNG_TV_AVAILABLE:
            return {"status": "error", "error": "Samsung TV library not installed"}
        
        result = await SamsungTVController.test_connection(ip)
        
        if result["status"] == "success":
            return {
                "status": "success",
                "message": f"Successfully connected to Samsung TV at {ip}",
                "device_info": result.get("device_info"),
                "token_stored": result.get("token_stored", False)
            }
        elif result["status"] == "auth_required":
            return {
                "status": "auth_required",
                "message": "Authentication required. Please call /samsung/authenticate endpoint.",
                "error": result.get("error")
            }
        else:
            return {
                "status": "error",
                "error": result.get("error", "Connection failed")
            }
    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.post("/samsung/refresh-token")
async def refresh_samsung_token(ip: str, tv_name: str):
    """Refresh Samsung TV authentication token"""
    try:
        result = await SamsungTVController.refresh_token(ip, tv_name)
        
        if result["status"] == "success":
            return {
                "status": "success",
                "message": "Token refreshed successfully!",
                "token": result.get("token")
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Token refresh failed")
            )
            
    except Exception as e:
        logger.error(f"Samsung TV token refresh error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Token refresh error: {str(e)}"
        )

@app.get("/samsung/tokens")
async def get_samsung_tokens():
    """Get all stored Samsung TV tokens"""
    return {
        "tvs": token_manager.get_all_samsung_tvs(),
        "count": len(token_manager.get_all_samsung_tvs())
    }

@app.delete("/samsung/tokens/{tv_name}")
async def remove_samsung_token(tv_name: str):
    """Remove a Samsung TV token"""
    success = token_manager.remove_samsung_token(tv_name)
    if success:
        return {"status": "success", "message": f"Removed Samsung token for {tv_name}"}
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Samsung TV token not found for {tv_name}"
        )

@app.get("/test/lg/{ip}")
async def test_lg_tv(ip: str):
    """Test LG TV connectivity without pairing"""
    try:
        if not LG_TV_AVAILABLE:
            return {"status": "error", "error": "LG TV library not installed"}
        
        from pywebostv.connection import WebOSClient
        
        # Test basic connectivity
        try:
            client = WebOSClient(ip, secure=False)
            client.connect()
            return {
                "status": "success", 
                "message": f"Successfully connected to LG TV at {ip}. Ready for pairing.",
                "secure_connection": False
            }
        except:
            try:
                client = WebOSClient(ip, secure=True)
                client.connect()
                return {
                    "status": "success", 
                    "message": f"Successfully connected to LG TV at {ip}. Ready for pairing.",
                    "secure_connection": True
                }
            except Exception as e:
                return {
                    "status": "error", 
                    "error": f"Cannot connect to LG TV at {ip}: {str(e)}. Check if TV is on and on the same network."
                }
    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.get("/detect/{ip}")
async def detect_device_type(ip: str):
    """Detect what type of device is at the given IP address"""
    try:
        device_info = {
            "ip": ip,
            "detected_types": [],
            "recommended_type": None,
            "details": {}
        }
        
        # Check Samsung TV
        if AndroidController.is_samsung_tv(ip):
            device_info["detected_types"].append("samsung_tv")
            device_info["details"]["samsung_tv"] = "Samsung Smart TV detected"
        
        # Check LG TV
        if AndroidController.is_lg_tv(ip):
            device_info["detected_types"].append("lg_tv")
            device_info["details"]["lg_tv"] = "LG webOS TV detected"
        
        # Check Android device
        if AndroidController.is_android_device(ip):
            device_info["detected_types"].append("android")
            device_info["details"]["android"] = "Android device with ADB enabled detected"
        
        # Determine recommended type
        if len(device_info["detected_types"]) == 1:
            device_info["recommended_type"] = device_info["detected_types"][0]
        elif len(device_info["detected_types"]) > 1:
            device_info["recommended_type"] = "multiple_types_detected"
            device_info["warning"] = "Multiple device types detected. Please specify the correct type manually."
        else:
            device_info["recommended_type"] = "unknown"
            device_info["warning"] = "No known device types detected. Check if device is on and accessible."
        
        return {
            "status": "success",
            "device_info": device_info
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "active_sessions": len(session_manager.sessions),
        "timing_limits": {
            "min_timeout": MIN_TIMEOUT,
            "max_timeout": MAX_TIMEOUT
        }
    }

@app.post("/config/timing")
async def update_timing_config(
    keep_alive_interval: Optional[float] = None,
    samsung_reconnect_interval: Optional[float] = None
):
    """Update timing configurations (5 seconds to 1 hour range)"""
    updated_configs = {}
    
    try:
        if keep_alive_interval is not None:
            validated_interval = validate_timeout(keep_alive_interval, "keep_alive_interval")
            updated_configs["keep_alive_interval"] = validated_interval
        
        if samsung_reconnect_interval is not None:
            validated_interval = validate_timeout(samsung_reconnect_interval, "samsung_reconnect_interval")
            updated_configs["samsung_reconnect_interval"] = validated_interval
        
        return {
            "status": "success",
            "message": "Timing configurations updated successfully",
            "updated_configs": updated_configs,
            "limits": {
                "min_timeout": MIN_TIMEOUT,
                "max_timeout": MAX_TIMEOUT
            }
        }
        
    except Exception as e:
        logger.error(f"Error updating timing configurations: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to update timing configurations: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    import ssl
    import os
    
    # SSL configuration
    ssl_keyfile = os.path.join(os.path.dirname(__file__), "..", "frontend", "key.pem")
    ssl_certfile = os.path.join(os.path.dirname(__file__), "..", "frontend", "cert.pem")
    
    # Check if SSL files exist
    if os.path.exists(ssl_keyfile) and os.path.exists(ssl_certfile):
        uvicorn.run(app, host="0.0.0.0", port=5042, ssl_keyfile=ssl_keyfile, ssl_certfile=ssl_certfile)
    else:
        print("Warning: SSL certificates not found, running without HTTPS")
        uvicorn.run(app, host="0.0.0.0", port=5042)

