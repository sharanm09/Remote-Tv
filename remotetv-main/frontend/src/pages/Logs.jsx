import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import './Logs.css';

// Use window.location.origin for API calls (works with nginx reverse proxy)
const SERVER_URL = typeof window !== 'undefined' 
  ? window.location.origin 
  : (import.meta.env.VITE_SERVER_URL || 'https://remotetv.ifocussystec.info');

function Logs() {
  const navigate = useNavigate();
  const { cameraName } = useParams();
  const [username, setUsername] = useState('');
  const [deviceLogs, setDeviceLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const socketRef = useRef(null);
  const logsContainerRef = useRef(null); // Ref for auto-scroll

  // Filter TV device logs - show only actual TV device logs
  const filterTVLogs = (logsText) => {
    if (!logsText) return '';
    
    // Since Python backend now returns only pure TV logs, just filter out any remaining backend messages
    const lines = logsText.split('\n');
    const tvLogLines = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines
      if (!trimmed) continue;
      
      // Skip Python backend logger lines (format: "YYYY-MM-DD HH:MM:SS,mmm - __main__ - ...")
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} - __main__ -/.test(trimmed)) {
        continue;
      }
      
      // Skip Python backend INFO/ERROR messages
      if (/^INFO:|^ERROR:|^WARNING:|^API HIT|^API DONE/.test(trimmed)) {
        continue;
      }
      
      // Skip separator lines
      if (/^=+$/.test(trimmed)) {
        continue;
      }
      
      // Keep all other lines (should be pure TV logs now)
      tvLogLines.push(line);
    }
    
    return tvLogLines.length > 0 ? tvLogLines.join('\n') : 'No TV device logs available';
  };

  // Fetch device logs (same approach as Live.jsx - primarily rely on Socket.IO events)
  const fetchDeviceLogs = async (refresh = false) => {
    if (!socketRef.current) {
      // Don't show error, just return - logs will come via Socket.IO events
      return;
    }
    
    // Use cameraName from URL params (useParams) or from deviceInfo
    const camera = cameraName || deviceInfo?.cameraName;
    
    if (!camera && !sessionId) {
      // Don't show error, logs will come via Socket.IO events when commands are sent
      console.log('⚠️ [Logs] No cameraName or sessionId yet, waiting for Socket.IO events');
      return;
    }
    
    setLogsLoading(true);
    
    // Try with sessionId first, fallback to cameraName from URL params
    const logRequest = sessionId 
      ? { sessionId, maxLines: 200, refresh }
      : { cameraName: camera, maxLines: 200, refresh };
    
    console.log('📡 [Logs] Requesting logs with:', logRequest);
    
    // Try to fetch logs, but if it fails, that's okay - logs will come via Socket.IO events
    socketRef.current.emit('getDeviceLogs', logRequest, (response) => {
      console.log('📥 [Logs] Received logs response:', {
        success: response.success,
        hasLogs: !!response.logs,
        logLength: response.logs ? response.logs.length : 0
      });
      
      if (response.success) {
        // Filter to show only TV device logs
        const filteredLogs = filterTVLogs(response.logs || '');
        console.log('✅ [Logs] Filtered logs length:', filteredLogs.length);
        
        if (filteredLogs && filteredLogs.trim()) {
          setDeviceLogs((prev) => {
            // Append to existing logs if any, otherwise set new
            const current = prev || '';
            return current ? `${current}\n${filteredLogs}` : filteredLogs;
          });
          // Auto-scroll to bottom after state update
          setTimeout(() => {
            if (logsContainerRef.current) {
              logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
            }
          }, 100);
        } else if (response.logs && response.logs.trim()) {
          // If no filtered logs but we have raw logs, use raw logs
          setDeviceLogs((prev) => {
            const current = prev || '';
            return current ? `${current}\n${response.logs}` : response.logs;
          });
          // Auto-scroll to bottom after state update
          setTimeout(() => {
            if (logsContainerRef.current) {
              logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
            }
          }, 100);
        }
        // Don't show error message if no logs - they'll come via Socket.IO
      } else {
        // Don't show error - logs will come via Socket.IO events
        console.log('⚠️ [Logs] getDeviceLogs failed, waiting for Socket.IO events:', response.error);
      }
      setLogsLoading(false);
    });
  };

  // Auto-refresh logs and fetch existing logs when camera/session is available
  useEffect(() => {
    if (!cameraName && !sessionId) {
      console.log('⚠️ [Logs] No cameraName or sessionId available');
      return;
    }
    
    console.log('🔄 [Logs] Starting log fetch for:', { cameraName, sessionId });
    
    // Wait for deviceInfo and sessionId to be loaded first
    const waitAndLoadLogs = () => {
      const effectiveSessionId = sessionId || deviceInfo?.sessionId;
      const effectiveCameraName = cameraName || deviceInfo?.cameraName;
      
      if (!effectiveSessionId && !effectiveCameraName) {
        console.log('⏳ [Logs] Waiting for sessionId or cameraName...');
        setTimeout(waitAndLoadLogs, 500);
        return;
      }
      
      if (socketRef.current && socketRef.current.connected) {
        console.log('✅ [Logs] Socket connected, fetching existing logs...');
        fetchDeviceLogs(true);
      } else {
        console.log('⏳ [Logs] Waiting for socket connection...');
        setTimeout(waitAndLoadLogs, 500);
      }
    };
    
    // Wait a bit for socket and device info to be ready, then load
    setTimeout(waitAndLoadLogs, 1500);
    
    // Auto-refresh interval (only if we have a session or camera)
    const interval = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        const effectiveSessionId = sessionId || deviceInfo?.sessionId;
        const effectiveCameraName = cameraName || deviceInfo?.cameraName;
        
        if (effectiveSessionId || effectiveCameraName) {
          fetchDeviceLogs(true);
        }
      }
    }, 10000); // Refresh every 10 seconds (less frequent than before)
    
    return () => clearInterval(interval);
  }, [cameraName, sessionId, deviceInfo]);

  // Fetch device info and sessionId
  useEffect(() => {
    const fetchDeviceInfo = async () => {
      if (!cameraName) {
        console.log('⚠️ [Logs] No cameraName provided');
        return;
      }
      
      try {
        console.log('📡 [Logs] Fetching device info for:', cameraName);
        const apiUrl = typeof window !== 'undefined' 
          ? `${window.location.origin}/api/stream/${cameraName}/device`
          : `${SERVER_URL}/api/stream/${cameraName}/device`;
        
        console.log('📡 [Logs] Fetching from:', apiUrl);
        const response = await fetch(apiUrl);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ [Logs] Device info received:', data);
          setDeviceInfo(data.deviceInfo);
          const foundSessionId = data.sessionId || null;
          setSessionId(foundSessionId);
          
          // Also try to find sessionId from Python backend
          if (!foundSessionId && socketRef.current && socketRef.current.connected) {
            console.log('🔍 [Logs] No sessionId from stream endpoint, checking Python backend...');
            // Try to find active session via socket
            socketRef.current.emit('checkExistingSession', { 
              deviceData: { 
                cameraName, 
                deviceIP: data.deviceInfo?.deviceIP,
                deviceType: data.deviceInfo?.deviceType 
              } 
            }, (response) => {
              if (response.success && response.exists && response.session) {
                console.log('✅ [Logs] Found session:', response.session.sessionId);
                setSessionId(response.session.sessionId);
              }
            });
          }
        } else {
          console.error('❌ [Logs] Failed to fetch device info:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('❌ [Logs] Error fetching device info:', error);
      }
    };
    
    fetchDeviceInfo();
  }, [cameraName]);

  // Initialize socket connection
  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (!storedUsername) {
      navigate('/login');
      return;
    }
    setUsername(storedUsername);

    // Initialize socket connection
    socketRef.current = io(SERVER_URL, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    socketRef.current.on('connect', () => {
      console.log('✅ [Logs] Socket.IO Connected to server');
      console.log('✅ [Logs] Socket ID:', socketRef.current.id);
      console.log('✅ [Logs] cameraName from URL:', cameraName);
      console.log('✅ [Logs] sessionId:', sessionId);
      
      // Fetch logs immediately when connected - use cameraName from URL params
      if (cameraName) {
        console.log('✅ [Logs] Socket connected, cameraName from URL:', cameraName);
        console.log('✅ [Logs] Will try to fetch logs, but primarily waiting for Socket.IO events');
        setTimeout(() => fetchDeviceLogs(true), 500);
      } else if (sessionId) {
        console.log('✅ [Logs] Socket connected, using sessionId:', sessionId);
        setTimeout(() => fetchDeviceLogs(true), 500);
      } else {
        console.log('⚠️ [Logs] Socket connected but no cameraName or sessionId - waiting for events');
      }
      
      // Also verify the event listener is set up
      console.log('✅ [Logs] Socket.IO event listeners should be active now');
    });
    
    socketRef.current.on('disconnect', () => {
      console.log('⚠️ [Logs] Socket.IO Disconnected from server');
    });
    
    socketRef.current.on('connect_error', (error) => {
      console.error('❌ [Logs] Socket.IO Connection error:', error);
    });
    
    // Verify event listener setup
    console.log('🎧 [Logs] Registering deviceConnectionLog event listener...');

    // Listen for device connection logs from backend (EXACTLY like Live.jsx - no filtering initially)
    socketRef.current.on('deviceConnectionLog', (logData) => {
      console.log('📺 [Logs] Device Log Event Received:', logData.message, logData);
      
      // Accept ALL events for now - same as Live.jsx
      // We can add filtering later if needed, but first ensure events are received
      
      // Add log to device logs display (same logic as Live.jsx)
      if (logData.type === 'connected') {
        const logMessage = `[${new Date(logData.timestamp).toLocaleTimeString()}] ${logData.message}`;
        setDeviceLogs((prev) => {
          const current = prev || '';
          const newLogs = current ? `${current}\n${logMessage}` : logMessage;
          // Auto-scroll to bottom after state update
          setTimeout(() => {
            if (logsContainerRef.current) {
              logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
            }
          }, 100);
          return newLogs;
        });
      } else if (logData.type === 'command') {
        const logMessage = `[${new Date(logData.timestamp).toLocaleTimeString()}] ${logData.message}`;
        setDeviceLogs((prev) => {
          const current = prev || '';
          const newLogs = current ? `${current}\n${logMessage}` : logMessage;
          // Auto-scroll to bottom after state update
          setTimeout(() => {
            if (logsContainerRef.current) {
              logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
            }
          }, 100);
          return newLogs;
        });
      
        // Display TV logs directly - filter them first (same as Live.jsx)
        const tvLogs = logData.logs || '';
        if (tvLogs) {
          // Filter to show only TV device logs
          const filteredLogs = filterTVLogs(tvLogs);
          if (filteredLogs && filteredLogs.trim()) {
            setDeviceLogs((prev) => {
              const current = prev || '';
              // Only append if logs are different (avoid duplicates)
              if (current && current.includes(filteredLogs.trim().substring(0, 50))) {
                return current; // Already have these logs
              }
              const newLogs = current ? `${current}\n${filteredLogs}` : filteredLogs;
              // Auto-scroll to bottom after state update
              setTimeout(() => {
                if (logsContainerRef.current) {
                  logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
                }
              }, 100);
              return newLogs;
            });
          }
        }
      } else if (logData.type === 'tv_logs') {
        // Display TV logs directly - filter them first (same as Live.jsx)
        const tvLogs = logData.logs || '';
        if (tvLogs) {
          // Filter to show only TV device logs
          const filteredLogs = filterTVLogs(tvLogs);
          if (filteredLogs && filteredLogs.trim()) {
            setDeviceLogs((prev) => {
              const current = prev || '';
              // Only append if logs are different (avoid duplicates)
              if (current && current.includes(filteredLogs.trim().substring(0, 50))) {
                return current; // Already have these logs
              }
              const newLogs = current ? `${current}\n${filteredLogs}` : filteredLogs;
              // Auto-scroll to bottom after state update
              setTimeout(() => {
                if (logsContainerRef.current) {
                  logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
                }
              }, 100);
              return newLogs;
            });
          }
        }
      } else if (logData.type === 'error') {
        const logMessage = `[${new Date(logData.timestamp).toLocaleTimeString()}] ${logData.message}: ${logData.error}`;
        setDeviceLogs((prev) => {
          const current = prev || '';
          const newLogs = current ? `${current}\n${logMessage}` : logMessage;
          // Auto-scroll to bottom after state update
          setTimeout(() => {
            if (logsContainerRef.current) {
              logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
            }
          }, 100);
          return newLogs;
        });
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [navigate, cameraName, sessionId]);

  // Auto-scroll to bottom whenever deviceLogs changes
  useEffect(() => {
    if (deviceLogs && logsContainerRef.current) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        if (logsContainerRef.current) {
          logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
      });
    }
  }, [deviceLogs]);

  if (!cameraName) {
    return (
      <div className="logs-page">
        <div className="logs-page-header">
          <button className="back-btn" onClick={() => navigate('/live')}>
            ← Back to Live
          </button>
          <h1>📺 Device Logs</h1>
        </div>
        <div className="logs-page-content">
          <p>No camera selected. Please select a camera from the Live page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="logs-page">
      <div className="logs-page-header">
        <button className="back-btn" onClick={() => navigate('/live')}>
          ← Back to Live
        </button>
        <div className="logs-page-title">
          <h1>📺 Device Logs</h1>
          <div className="logs-device-info">
            <span className="device-name">{cameraName}</span>
            {deviceInfo?.deviceIP && (
              <span className="device-ip">📍 {deviceInfo.deviceIP}</span>
            )}
          </div>
        </div>
        <button
          className="refresh-btn"
          onClick={() => fetchDeviceLogs(true)}
          disabled={logsLoading}
          title="Refresh Logs"
        >
          {logsLoading ? '⏳' : '🔄'}
        </button>
      </div>
      
      <div className="logs-page-content">
        <div className="logs-terminal-fullscreen" ref={logsContainerRef}>
          {logsLoading ? (
            <div className="logs-terminal-loading">Loading logs...</div>
          ) : deviceLogs ? (
            <pre className="logs-terminal-text">{deviceLogs}</pre>
          ) : (
            <div className="logs-terminal-empty">
              {cameraName ? `Waiting for logs for device "${cameraName}". Logs will appear here when commands are sent to the device from the Live page.` : 'No device selected. Logs will appear here when commands are sent.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Logs;
