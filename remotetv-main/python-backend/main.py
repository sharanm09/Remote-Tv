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
import sqlite3
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

# Import TV Controllers
from samsung_tv_controller import SamsungTVController
from lg_tv_controller import LGTVController
from apple_tv_controller import AppleTVController
from android_controller import AndroidController

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
DB_FILE = Path("sessions.db")

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
        self.lg_logs_enabled = False  # LG TV log capture disabled by default for performance
        self.samsung_logs_enabled = False  # Samsung TV log capture disabled by default for performance
        self.android_logs_enabled = False  # Android TV log capture disabled by default for performance
        self.android_remote = None
        
        # Connection management
        self._keep_alive_task = None
        self._lock = threading.Lock()
        
        # Logs storage
        self.logs = []  # List to store log entries
        self.last_log_update = None  # Timestamp of last log update
    
    def update_activity(self):
        self.last_activity = datetime.now()
        # Update database
        db_manager.update_session_activity(self.id, self.status.value)
    
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
                        
                        # Test connection by trying a lightweight operation
                        # For SamsungTVWS, we can't easily test without sending a command
                        # So we check socket state if connection has been used
                        def _check_health():
                            return SamsungTVController._test_connection_by_use(self.samsung_tv)
                        
                        is_alive = await asyncio.to_thread(_check_health)
                        
                        if is_alive:
                            # Connection appears OK, but for lazy connections we can't be 100% sure
                            # until we use it. Just update activity time.
                            self.samsung_last_activity = datetime.now()
                            consecutive_failures = 0
                            logger.debug(f"Keep-alive: Connection appears healthy for session {self.id}")
                        else:
                            logger.warning(f"Keep-alive: Connection appears dead for session {self.id}, reconnecting...")
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

# Database Manager for Session Persistence
class DatabaseManager:
    def __init__(self, db_file: Path):
        self.db_file = db_file
        self._lock = threading.Lock()
        self._init_db()
    
    def _init_db(self):
        """Initialize database tables"""
        with sqlite3.connect(self.db_file) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    ip TEXT NOT NULL,
                    device_type TEXT NOT NULL,
                    tv_name TEXT,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_activity TEXT NOT NULL,
                    samsung_token TEXT,
                    lg_client_key TEXT,
                    data TEXT
                )
            """)
            conn.commit()
    
    def save_session(self, session: 'Session'):
        """Save session to database"""
        with self._lock:
            try:
                with sqlite3.connect(self.db_file) as conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO sessions 
                        (session_id, ip, device_type, tv_name, status, created_at, last_activity, samsung_token, lg_client_key, data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        session.id,
                        session.ip,
                        session.device_type.value,
                        session.tv_name,
                        session.status.value,
                        session.created_at.isoformat(),
                        session.last_activity.isoformat(),
                        session.samsung_token,
                        session.lg_client_key,
                        json.dumps({})  # Store additional data if needed
                    ))
                    conn.commit()
            except Exception as e:
                logger.error(f"Error saving session to database: {e}")
    
    def load_sessions(self) -> Dict[str, dict]:
        """Load all sessions from database"""
        sessions = {}
        with self._lock:
            try:
                with sqlite3.connect(self.db_file) as conn:
                    conn.row_factory = sqlite3.Row
                    cursor = conn.execute("SELECT * FROM sessions")
                    for row in cursor.fetchall():
                        sessions[row['session_id']] = {
                            'session_id': row['session_id'],
                            'ip': row['ip'],
                            'device_type': row['device_type'],
                            'tv_name': row['tv_name'],
                            'status': row['status'],
                            'created_at': row['created_at'],
                            'last_activity': row['last_activity'],
                            'samsung_token': row['samsung_token'],
                            'lg_client_key': row['lg_client_key']
                        }
            except Exception as e:
                logger.error(f"Error loading sessions from database: {e}")
        return sessions
    
    def delete_session(self, session_id: str):
        """Delete session from database"""
        with self._lock:
            try:
                with sqlite3.connect(self.db_file) as conn:
                    conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
                    conn.commit()
            except Exception as e:
                logger.error(f"Error deleting session from database: {e}")
    
    def update_session_activity(self, session_id: str, status: str = None, samsung_token: str = None, lg_client_key: str = None):
        """Update session activity timestamp and optional fields"""
        with self._lock:
            try:
                with sqlite3.connect(self.db_file) as conn:
                    updates = ["last_activity = ?"]
                    params = [datetime.now().isoformat()]
                    
                    if status:
                        updates.append("status = ?")
                        params.append(status)
                    if samsung_token is not None:
                        updates.append("samsung_token = ?")
                        params.append(samsung_token)
                    if lg_client_key is not None:
                        updates.append("lg_client_key = ?")
                        params.append(lg_client_key)
                    
                    params.append(session_id)
                    conn.execute(f"UPDATE sessions SET {', '.join(updates)} WHERE session_id = ?", params)
                    conn.commit()
            except Exception as e:
                logger.error(f"Error updating session in database: {e}")

# Global database manager
db_manager = DatabaseManager(DB_FILE)

# Session Manager
class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Session] = {}
        self._lock = threading.Lock()
        # Load sessions from database on startup
        self._load_sessions_from_db()
    
    def _load_sessions_from_db(self):
        """Load sessions from database on startup and recreate Session objects"""
        try:
            db_sessions = db_manager.load_sessions()
            logger.info(f"Loading {len(db_sessions)} sessions from database")
            
            with self._lock:
                for session_id, session_data in db_sessions.items():
                    try:
                        # Parse device_type
                        device_type = DeviceType(session_data['device_type'])
                        
                        # Recreate Session object
                        session = Session(
                            session_id=session_data['session_id'],
                            ip=session_data['ip'],
                            device_type=device_type,
                            tv_name=session_data['tv_name'] or ""
                        )
                        
                        # Restore session state from database
                        session.status = SessionStatus(session_data['status'])
                        
                        # Parse timestamps
                        if session_data['created_at']:
                            session.created_at = datetime.fromisoformat(session_data['created_at'])
                        if session_data['last_activity']:
                            session.last_activity = datetime.fromisoformat(session_data['last_activity'])
                        
                        # Restore tokens
                        # CRITICAL: Always restore to token_manager FIRST (primary source), then session
                        if session_data.get('samsung_token'):
                            session.samsung_token = session_data['samsung_token']
                            # CRITICAL: Save to token_manager (primary source) - this ensures it's available for ensure_connection
                            if session.tv_name:
                                token_manager.set_samsung_token(session.tv_name, session.samsung_token)
                                logger.info(f"Restored Samsung token for session {session_id} to token_manager (length: {len(session.samsung_token)})")
                            else:
                                logger.info(f"Restored Samsung token for session {session_id} (no tv_name, not saved to token_manager)")
                        if session_data.get('lg_client_key'):
                            session.lg_client_key = session_data['lg_client_key']
                            # Also save to token_manager so it's available for fallback
                            if session.tv_name:
                                token_manager.set_lg_client_key(session.tv_name, session.lg_client_key)
                            logger.info(f"Restored LG client key for session {session_id}")
                        
                        # Add to sessions dictionary
                        self.sessions[session_id] = session
                        logger.info(f"Restored session {session_id} for {device_type.value} at {session_data['ip']}")
                        
                    except Exception as e:
                        logger.error(f"Error restoring session {session_id} from database: {e}")
                        continue
            
            logger.info(f"Successfully restored {len(self.sessions)} sessions from database")
        except Exception as e:
            logger.error(f"Error loading sessions from database: {e}")
    
    def add_session(self, session: Session) -> Dict:
        with self._lock:
            self.sessions[session.id] = session
            logger.info(f"Added session {session.id} for {session.device_type} at {session.ip}")
            # Save to database
            db_manager.save_session(session)
            return {"status": "success"}
    
    def get_session(self, session_id: str) -> Optional[Session]:
        with self._lock:
            session = self.sessions.get(session_id)
            if session:
                session.update_activity()
                # Update database
                db_manager.update_session_activity(session_id, session.status.value)
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
            # Remove from database
            db_manager.delete_session(session_id)
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
        
        # Also clear database
        try:
            with sqlite3.connect(DB_FILE) as conn:
                conn.execute("DELETE FROM sessions")
                conn.commit()
            logger.info(f"Cleared all sessions from database")
        except Exception as e:
            logger.error(f"Error clearing database: {e}")
        
        logger.info(f"Cleared all {count} sessions from memory and database")
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

# TV Controllers moved to separate files:
# - samsung_tv_controller.py
# - lg_tv_controller.py
# - apple_tv_controller.py
# - android_controller.py

# Health check functions to verify TV is actually on
async def verify_tv_connection(session: Session) -> bool:
    """Verify if TV is actually on and reachable"""
    try:
        if session.device_type == DeviceType.SAMSUNG_TV:
            # Check Samsung TV REST API
            def _check_samsung():
                try:
                    from samsungtvws import SamsungTVWS
                    tv_rest = SamsungTVWS(session.ip, port=8001, name="SamsungTvRemote")
                    tv_rest.rest_device_info()
                    return True
                except Exception as e:
                    logger.debug(f"Samsung TV connection check failed for {session.ip}: {e}")
                    return False
            try:
                return await asyncio.wait_for(asyncio.to_thread(_check_samsung), timeout=5.0)
            except asyncio.TimeoutError:
                logger.debug(f"Samsung TV connection check timeout for {session.ip}")
                return False
        
        elif session.device_type == DeviceType.LG_TV:
            # Check LG TV WebOS connection with timeout
            def _check_lg():
                try:
                    from pywebostv.connection import WebOSClient
                    client = WebOSClient(session.ip, secure=True)
                    # Try to connect (connect() doesn't accept timeout, so we rely on asyncio timeout)
                    client.connect()
                    client.close()
                    return True
                except Exception as e:
                    logger.debug(f"LG TV connection check failed for {session.ip}: {e}")
                    return False
            try:
                return await asyncio.wait_for(asyncio.to_thread(_check_lg), timeout=5.0)
            except asyncio.TimeoutError:
                logger.debug(f"LG TV connection check timeout for {session.ip}")
                return False
        
        elif session.device_type == DeviceType.ANDROID:
            # Check Android ADB connection
            return AndroidController.test_adb_connection(session.ip)
        
        # For other device types, return True (assume connected)
        return True
    except Exception as e:
        logger.warning(f"Error verifying TV connection for session {session.id}: {e}")
        return False

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
    """Get status of a specific session - verifies TV is actually on"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Verify TV is actually on if status is connected
    if session.status == SessionStatus.CONNECTED:
        is_connected = await verify_tv_connection(session)
        if not is_connected:
            # TV is off, update session status to disconnected
            session.status = SessionStatus.DISCONNECTING
            session.update_activity()
            logger.info(f"TV at {session.ip} is off, updating session {session_id} status to disconnected")
            # Clean up the session
            await session_manager.remove_session(session_id)
            return {
                "sessionId": session.id,
                "ip": session.ip,
                "device_type": session.device_type,
                "tv_name": session.tv_name,
                "status": "disconnected",
                "connected": False,
                "message": "TV is off or unreachable",
                "created_at": session.created_at.isoformat(),
                "last_activity": session.last_activity.isoformat()
            }
    
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
    
    # Get logs from appropriate controller - all logic is in controller files
    if session.device_type == DeviceType.ANDROID:
        return await AndroidController.get_logs(session, max_lines, refresh)
    elif session.device_type == DeviceType.SAMSUNG_TV:
        return await SamsungTVController.get_logs(session, max_lines, refresh)
    elif session.device_type == DeviceType.LG_TV:
        return await LGTVController.get_logs(session, max_lines, refresh)
    else:
        return {
            "success": False,
            "logs": "Logs not available for this device type",
            "timestamp": None,
            "last_log_update": None,
            "device_type": session.device_type.value,
            "log_count": 0
        }

@app.post("/sessions/{session_id}/lg/logs/enable")
async def enable_lg_logs(session_id: str):
    """Enable log capture for LG TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.LG_TV:
        raise HTTPException(status_code=400, detail="This endpoint is only for LG TV sessions")
    
    session.lg_logs_enabled = True
    logger.info(f"Log capture enabled for LG TV session {session_id}")
    
    return {
        "status": "success",
        "message": "Log capture enabled for LG TV",
        "logs_enabled": True
    }

@app.post("/sessions/{session_id}/lg/logs/disable")
async def disable_lg_logs(session_id: str):
    """Disable log capture for LG TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.LG_TV:
        raise HTTPException(status_code=400, detail="This endpoint is only for LG TV sessions")
    
    session.lg_logs_enabled = False
    logger.info(f"Log capture disabled for LG TV session {session_id}")
    
    return {
        "status": "success",
        "message": "Log capture disabled for LG TV",
        "logs_enabled": False
    }

@app.get("/sessions/{session_id}/lg/logs/status")
async def get_lg_logs_status(session_id: str):
    """Get log capture status for LG TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.LG_TV:
        raise HTTPException(status_code=400, detail="This endpoint is only for LG TV sessions")
    
    logs_enabled = getattr(session, 'lg_logs_enabled', False)
    
    return {
        "status": "success",
        "logs_enabled": logs_enabled,
        "message": "Log capture is enabled" if logs_enabled else "Log capture is disabled"
    }

@app.post("/sessions/{session_id}/samsung/logs/enable")
async def enable_samsung_logs(session_id: str):
    """Enable log capture for Samsung TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.SAMSUNG_TV:
        raise HTTPException(status_code=400, detail="This endpoint is only for Samsung TV sessions")
    
    session.samsung_logs_enabled = True
    logger.info(f"Log capture enabled for Samsung TV session {session_id}")
    
    return {
        "status": "success",
        "message": "Log capture enabled for Samsung TV",
        "logs_enabled": True
    }

@app.post("/sessions/{session_id}/samsung/logs/disable")
async def disable_samsung_logs(session_id: str):
    """Disable log capture for Samsung TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.SAMSUNG_TV:
        raise HTTPException(status_code=400, detail="This endpoint is only for Samsung TV sessions")
    
    session.samsung_logs_enabled = False
    logger.info(f"Log capture disabled for Samsung TV session {session_id}")
    
    return {
        "status": "success",
        "message": "Log capture disabled for Samsung TV",
        "logs_enabled": False
    }

@app.get("/sessions/{session_id}/samsung/logs/status")
async def get_samsung_logs_status(session_id: str):
    """Get log capture status for Samsung TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.SAMSUNG_TV:
        raise HTTPException(status_code=400, detail="This endpoint is only for Samsung TV sessions")
    
    logs_enabled = getattr(session, 'samsung_logs_enabled', False)
    
    return {
        "status": "success",
        "logs_enabled": logs_enabled,
        "message": "Log capture is enabled" if logs_enabled else "Log capture is disabled"
    }

@app.post("/sessions/{session_id}/android/logs/enable")
async def enable_android_logs(session_id: str):
    """Enable log capture for Android TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.ANDROID:
        raise HTTPException(status_code=400, detail="This endpoint is only for Android TV sessions")
    
    session.android_logs_enabled = True
    logger.info(f"Log capture enabled for Android TV session {session_id}")
    
    return {
        "status": "success",
        "message": "Log capture enabled for Android TV",
        "logs_enabled": True
    }

@app.post("/sessions/{session_id}/android/logs/disable")
async def disable_android_logs(session_id: str):
    """Disable log capture for Android TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.ANDROID:
        raise HTTPException(status_code=400, detail="This endpoint is only for Android TV sessions")
    
    session.android_logs_enabled = False
    logger.info(f"Log capture disabled for Android TV session {session_id}")
    
    return {
        "status": "success",
        "message": "Log capture disabled for Android TV",
        "logs_enabled": False
    }

@app.get("/sessions/{session_id}/android/logs/status")
async def get_android_logs_status(session_id: str):
    """Get log capture status for Android TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.ANDROID:
        raise HTTPException(status_code=400, detail="This endpoint is only for Android TV sessions")
    
    logs_enabled = getattr(session, 'android_logs_enabled', False)
    
    return {
        "status": "success",
        "logs_enabled": logs_enabled,
        "message": "Log capture is enabled" if logs_enabled else "Log capture is disabled"
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
                    # Verify TV is actually on before reusing session
                    existing_session = session_manager.get_session(session["sessionId"])
                    if existing_session:
                        is_connected = await verify_tv_connection(existing_session)
                        if is_connected:
                            logger.info(f"Reusing existing session {session['sessionId']} for {req.device_type} at {req.ip}")
                            return SessionResponse(
                                sessionId=session["sessionId"],
                                title=f"{req.device_type.upper()}-{req.ip}",
                                ip=req.ip,
                                whepUrl="http://localhost:8889/mystream/whep",
                                device_type=req.device_type,
                                status=SessionStatus.CONNECTED
                            )
                        else:
                            # TV is off, remove old session and create new one
                            logger.info(f"TV at {req.ip} is off, removing old session and creating new connection")
                            await session_manager.remove_session(session["sessionId"])
                            break
        
        # Create new session only if no existing session found
        session_id = str(uuid.uuid4())
        session = Session(session_id, req.ip, req.device_type, req.tv_name)
        
        result = session_manager.add_session(session)
        if result["status"] == "error":
            raise HTTPException(status_code=429, detail="Failed to add session")
        
        try:
            # Connect device based on device type - all logic is in controller files
            if req.device_type == DeviceType.ANDROID:
                result = await AndroidController.connect_device(session)
                if result["status"] != "success":
                    session.status = SessionStatus.ERROR
                    raise HTTPException(status_code=500, detail=result.get("error", "Connection failed"))
            
            elif req.device_type == DeviceType.SAMSUNG_TV:
                result = await SamsungTVController.connect_device(session)
                if result["status"] == "auth_required":
                    session.status = SessionStatus.ERROR
                    raise HTTPException(status_code=401, detail=result.get("error", "Authentication required"))
                elif result["status"] not in ["success", "partial_success"]:
                    session.status = SessionStatus.ERROR
                    raise HTTPException(status_code=500, detail=result.get("error", "Connection failed"))
            
            elif req.device_type == DeviceType.LG_TV:
                result = await LGTVController.connect_device(session)
                if result["status"] != "success":
                    session.status = SessionStatus.ERROR
                    raise HTTPException(status_code=500, detail=result.get("error", "Connection failed"))
            
            elif req.device_type == DeviceType.APPLE_TV:
                # Apple TV connection logic would go here
                logger.info(f"Apple TV connection for {req.ip} (placeholder)")
            
            elif req.device_type == DeviceType.ROKU:
                # Roku connection logic would go here
                logger.info(f"Roku connection for {req.ip} (placeholder)")
            
            # Mark session as connected
            session.status = SessionStatus.CONNECTED
            session.update_activity()
            
            return SessionResponse(
                sessionId=session.id,
                title=f"{req.device_type.upper()}-{req.ip}",
                ip=req.ip,
                whepUrl="http://localhost:8889/mystream/whep",
                device_type=req.device_type,
                status=session.status
            )
            
        except HTTPException:
            raise
        except Exception as e:
            session.status = SessionStatus.ERROR
            session.update_activity()
            logger.error(f"Error connecting to device: {e}")
            raise HTTPException(status_code=500, detail=str(e))
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in connect_device: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
        # Send command to appropriate controller - all logic is in controller files
        if session.device_type == DeviceType.ANDROID:
            return await AndroidController.send_command(session, msg)
        elif session.device_type == DeviceType.SAMSUNG_TV:
            return await SamsungTVController.send_command(session, msg)
        elif session.device_type == DeviceType.LG_TV:
            return await LGTVController.send_command(session, msg)
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
            return await AppleTVController.send_command_async(session, msg)
        
        return {"status": "error", "error": "Unknown command type or device type"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending command: {e}")
        return {"status": "error", "error": str(e)}

@app.post("/disconnect/{session_id}")
async def disconnect_device(session_id: str):
    """Disconnect session"""
    success = await session_manager.remove_session(session_id)
    if success:
        return {"status": "disconnected", "session_id": session_id}
    else:
        raise HTTPException(status_code=404, detail="Session not found")

@app.get("/sessions")
async def list_sessions():
    """List all active sessions - verifies each session's TV is actually on"""
    all_sessions = session_manager.list_all()
    verified_sessions = []
    
    for session_data in all_sessions:
        session = session_manager.get_session(session_data["sessionId"])
        if not session:
            continue
        
        # If status is connected, verify TV is actually on
        if session.status == SessionStatus.CONNECTED:
            is_connected = await verify_tv_connection(session)
            if not is_connected:
                # TV is off, update session status
                session.status = SessionStatus.DISCONNECTING
                session.update_activity()
                logger.info(f"TV at {session.ip} is off, updating session {session.id} status")
                # Clean up the session
                await session_manager.remove_session(session.id)
                # Add to list with disconnected status
                verified_sessions.append({
                    "sessionId": session.id,
                    "ip": session.ip,
                    "device_type": session.device_type,
                    "tv_name": session.tv_name,
                    "status": "disconnected"
                })
                continue
        
        verified_sessions.append(session_data)
    
    return {"sessions": verified_sessions}

@app.delete("/sessions")
async def clear_all_sessions():
    """Clear all active sessions"""
    count = await session_manager.clear_all_sessions()
    return {"status": "cleared", "count": count}

# Token management endpoints
@app.get("/tokens/samsung")
async def get_samsung_tokens():
    """Get all Samsung TV tokens"""
    return {"tvs": token_manager.get_all_samsung_tvs()}

@app.get("/tokens/lg")
async def get_lg_tokens():
    """Get all LG TV tokens"""
    return {"tvs": token_manager.get_all_lg_tvs()}

# Android endpoints
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
        raise HTTPException(status_code=400, detail="IP address required")
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
        raise HTTPException(status_code=400, detail="IP address required")
    result = AndroidController.sdb_connect(ip, port)
    if result.get("status") != "success":
        raise HTTPException(status_code=400, detail=result.get("error", "SDB connection failed"))
    return result

# Samsung TV endpoints
@app.post("/samsung/authenticate")
async def authenticate_samsung_tv(ip: str, tv_name: str = None):
    """Request authentication from Samsung TV"""
    try:
        result = await SamsungTVController.request_authentication(ip, tv_name)
        if result.get("status") == "success":
            return {"status": "success", "message": result.get("message", "Authentication successful")}
        elif result.get("status") == "auth_required":
            raise HTTPException(status_code=401, detail=result.get("error", "Authentication required"))
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Authentication failed"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/samsung/force-auth/{session_id}")
async def force_samsung_auth(session_id: str):
    """Force re-authentication for Samsung TV session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.device_type != DeviceType.SAMSUNG_TV:
        raise HTTPException(status_code=400, detail="Session is not a Samsung TV session")
    
    try:
        # Clear existing connection and token
        session.samsung_tv = None
        session.samsung_token = None
        
        # Request new authentication
        result = await SamsungTVController.request_authentication(session.ip, session.tv_name)
        if result.get("status") == "success":
            session.samsung_tv = result.get("tv")
            session.samsung_token = result.get("token")
            session.status = SessionStatus.CONNECTED
            session.update_activity()
            return {"status": "success", "message": "Re-authentication successful"}
        elif result.get("status") == "auth_required":
            session.status = SessionStatus.ERROR
            session.update_activity()
            raise HTTPException(status_code=401, detail=result.get("error", "Authentication required"))
        else:
            session.status = SessionStatus.ERROR
            session.update_activity()
            raise HTTPException(status_code=500, detail=result.get("error", "Authentication failed"))
    except HTTPException:
        raise
    except Exception as e:
        session.status = SessionStatus.ERROR
        session.update_activity()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/test/samsung/{ip}")
async def test_samsung_connection(ip: str, tv_name: str = None):
    """Test Samsung TV connection"""
    result = await SamsungTVController.test_connection(ip, tv_name)
    return result

@app.post("/samsung/refresh-token")
async def refresh_samsung_token(ip: str, tv_name: str):
    """Refresh Samsung TV token"""
    if not tv_name:
        raise HTTPException(status_code=400, detail="TV name is required")
        result = await SamsungTVController.refresh_token(ip, tv_name)
    if result.get("status") != "success":
        raise HTTPException(status_code=500, detail=result.get("error", "Token refresh failed"))
    return result

@app.get("/samsung/tokens")
async def get_samsung_tokens_list():
    """Get all Samsung TV tokens"""
    return {"tvs": token_manager.get_all_samsung_tvs()}

@app.delete("/samsung/tokens/{tv_name}")
async def delete_samsung_token(tv_name: str):
    """Delete Samsung TV token"""
    success = token_manager.remove_samsung_token(tv_name)
    if success:
        return {"status": "deleted", "tv_name": tv_name}
    else:
        raise HTTPException(status_code=404, detail="Token not found")

@app.get("/test/lg/{ip}")
async def test_lg_connection(ip: str, tv_name: str = None):
    """Test LG TV connection"""
    result = await LGTVController.test_connection(ip, tv_name)
    return result

@app.get("/detect/{ip}")
async def detect_device_type(ip: str):
    """Detect device type at IP address"""
    try:
        # Check for Samsung TV
        if AndroidController.is_samsung_tv(ip):
            return {"device_type": "samsung_tv", "ip": ip}
        
        # Check for LG TV
        if AndroidController.is_lg_tv(ip):
            return {"device_type": "lg_tv", "ip": ip}
        
        # Check for Android device
        if AndroidController.is_android_device(ip):
            return {"device_type": "android", "ip": ip}
        
        return {"device_type": "unknown", "ip": ip, "message": "Could not detect device type"}
    except Exception as e:
        return {"device_type": "unknown", "ip": ip, "error": str(e)}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "sessions": len(session_manager.sessions),
        "timestamp": datetime.now().isoformat()
    }

@app.post("/config/timing")
async def update_timing_config(
    keep_alive_interval: float = None,
    samsung_reconnect_interval: float = None
):
    """Update timing configuration for connections"""
    try:
        updated_configs = {}
        
        if keep_alive_interval is not None:
            validated_interval = validate_timeout(keep_alive_interval, "keep_alive_interval")
            updated_configs["keep_alive_interval"] = validated_interval
        
        if samsung_reconnect_interval is not None:
            validated_interval = validate_timeout(samsung_reconnect_interval, "samsung_reconnect_interval")
            updated_configs["samsung_reconnect_interval"] = validated_interval
        
        if not updated_configs:
            raise HTTPException(status_code=400, detail="No configuration parameters provided")
        
        return {
            "status": "success",
            "updated_configs": updated_configs,
            "message": "Timing configurations updated successfully"
            }
    except HTTPException:
        raise
    except Exception as e:
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
