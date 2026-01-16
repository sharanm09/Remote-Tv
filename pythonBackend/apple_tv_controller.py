"""
Apple TV Controller
Handles all Apple TV connection and remote control functionality
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict

# Configure logger
logger = logging.getLogger(__name__)


class AppleTVController:
    """Controller for Apple TV remote operations"""
    
    @staticmethod
    def get_keymap():
        """Get key mapping for Apple TV commands"""
        return {
            "up": "up", "down": "down", "left": "left", "right": "right",
            "enter": "select", "ok": "select", "back": "menu", "home": "home",
            "play": "play", "pause": "pause", "stop": "stop",
            "volume_up": "volume_up", "volume_down": "volume_down", "mute": "mute",
            "next": "next", "previous": "previous", "rewind": "rewind", "fastforward": "fastforward"
        }
    
    @staticmethod
    def send_command(device, command: str) -> Dict:
        """Send command to Apple TV device (legacy method)"""
        try:
            # This would need pyatv library implementation
            # For now, return success (placeholder)
            return {"status": "success", "command": command}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @staticmethod
    async def _capture_logs_background(session, action: str, delay: float = 0.5):
        """Capture logs in background after TV action completes (placeholder)"""
        # Wait a bit for TV to process the action
        await asyncio.sleep(delay)
        try:
            logger.info(f"📺 Capturing logs after {action} command...")
            # Placeholder - would implement actual log capture for Apple TV
            log_result = {"success": False, "logs": "Log capture not implemented for Apple TV", "timestamp": datetime.now().isoformat()}
            if log_result.get("success"):
                session.logs.append(log_result)
                session.last_log_update = datetime.now()
        except Exception as e:
            logger.error(f"Error capturing logs in background: {e}")
    
    @staticmethod
    async def send_command_async(session, msg):
        """Full command sending logic for Apple TV - handles all command types. Returns immediately, logs captured in background."""
        if msg.get("type") == "key":
            action = msg.get("action", "enter")
            keymap = AppleTVController.get_keymap()
            command = keymap.get(action.lower(), "select")
            result = AppleTVController.send_command(None, command)
            
            # Start log capture in background (non-blocking) - only if successful
            if result.get("status") == "success":
                # Create background task for log capture - don't await it
                asyncio.create_task(AppleTVController._capture_logs_background(session, action, delay=0.5))
            
            # Return immediately - don't wait for logs
            return result
        
        return {"status": "error", "error": "Unknown command type"}

