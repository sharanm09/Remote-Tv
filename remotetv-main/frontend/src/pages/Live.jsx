import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { Device } from 'mediasoup-client';
import Navbar from '../components/Navbar';
import '../components/Navbar.css';
import './Live.css';

// Use window.location.origin for API calls (works with nginx reverse proxy)
const SERVER_URL = typeof window !== 'undefined' 
  ? window.location.origin 
  : (import.meta.env.VITE_SERVER_URL || 'https://remotetv.ifocussystec.info');

function Live() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [streams, setStreams] = useState([]);
  const [allDevices, setAllDevices] = useState({}); // All devices from database
  const [selectedCameras, setSelectedCameras] = useState(new Set());
  const [device, setDevice] = useState(null);
  const socketRef = useRef(null);
  const consumersRef = useRef({});
  const videoRefs = useRef({});
  const remoteConnectionsRef = useRef({}); // Track remote connections per device
  const sessionIdsRef = useRef({}); // Track session IDs per device
  
  // Remote control state
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [sessionIds, setSessionIds] = useState({});
  const [remoteConnections, setRemoteConnections] = useState({});
  const [cameraConnections, setCameraConnections] = useState({});
  const [currentCamera, setCurrentCamera] = useState(null);
  const [isRemotePanelOpen, setIsRemotePanelOpen] = useState(true);
  const [remoteTextInput, setRemoteTextInput] = useState('');
  const [deviceLogs, setDeviceLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [videoRotation, setVideoRotation] = useState(() => {
    const saved = localStorage.getItem('videoRotation');
    return saved ? parseInt(saved) : 0;
  });
  const [videoScale, setVideoScale] = useState(() => {
    const saved = localStorage.getItem('videoScale');
    return saved ? parseInt(saved) : 100; // 100% = normal size, can go 50-200%
  });
  const [isAudioMuted, setIsAudioMuted] = useState(true); // Muted by default for autoplay compatibility
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingMode, setRecordingMode] = useState('video'); // 'video' or 'screen'
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const recordingActiveRef = useRef(false);
  const drawIntervalRef = useRef(null);
  const screenStreamRef = useRef(null);
  const updateSessionForCamera = useCallback((cameraName, newSessionId) => {
    if (!cameraName || !newSessionId) return;

    sessionIdsRef.current = {
      ...sessionIdsRef.current,
      [cameraName]: newSessionId,
    };

    setSessionIds((prev) => {
      if (prev[cameraName] === newSessionId) {
        return prev;
      }
      return { ...prev, [cameraName]: newSessionId };
    });
  }, []);

  const clearSessionForCamera = useCallback((cameraName) => {
    if (!cameraName || !sessionIdsRef.current[cameraName]) {
      return;
    }

    const updatedRef = { ...sessionIdsRef.current };
    delete updatedRef[cameraName];
    sessionIdsRef.current = updatedRef;

    setSessionIds((prev) => {
      if (!prev[cameraName]) {
        return prev;
      }
      const updated = { ...prev };
      delete updated[cameraName];
      return updated;
    });
  }, []);

  const currentSessionId = currentCamera ? sessionIds[currentCamera] || null : null;
  const logsContainerRef = useRef(null); // Ref for logs terminal container
  const isCameraConnected = currentCamera ? Boolean(cameraConnections[currentCamera]) : false;
  const isRemoteConnectedForCurrent = currentCamera ? Boolean(remoteConnections[currentCamera]) : false;

  // Save rotation to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('videoRotation', videoRotation.toString());
  }, [videoRotation]);

  // Save scale to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('videoScale', videoScale.toString());
  }, [videoScale]);

  // Update muted state on all video elements when isAudioMuted changes
  useEffect(() => {
    Object.keys(videoRefs.current).forEach(camName => {
      const videoElement = videoRefs.current[camName];
      if (videoElement) {
        videoElement.muted = isAudioMuted;
      }
    });
  }, [isAudioMuted]);

  // Rotate video by 90 degrees clockwise
  const rotateVideo = () => {
    setVideoRotation((prev) => (prev + 90) % 360);
  };

  // Handle scale slider change
  const handleScaleChange = (e) => {
    setVideoScale(parseInt(e.target.value));
  };

  // Toggle audio mute
  const toggleAudioMute = (cameraName) => {
    const newMutedState = !isAudioMuted;
    setIsAudioMuted(newMutedState);
    
    // Update all active video elements
    Object.keys(videoRefs.current).forEach(camName => {
      const videoElement = videoRefs.current[camName];
      if (videoElement) {
        videoElement.muted = newMutedState;
      }
    });
    
    console.log(`Audio ${newMutedState ? 'muted' : 'unmuted'} for all streams`);
  };

  // Start screen recording (alternative to video stream recording)
  const startScreenRecording = async (cameraName) => {
    console.log('📺 startScreenRecording called for:', cameraName);
    try {
      // Request screen capture permission
      console.log('🖥️ Requesting screen capture via getDisplayMedia...');
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      screenStreamRef.current = screenStream;

      // Check for codec support and fallback
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }
      }

      const mediaRecorder = new MediaRecorder(screenStream, {
        mimeType: mimeType,
        videoBitsPerSecond: 2500000
      });

      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop screen stream tracks
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
        }

        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `screen_recording_${cameraName}_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
        }
      };

      // Handle user stopping screen share
      screenStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);
      setRecordingMode('screen');

      // Timer for recording duration
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      console.log('Screen recording started for', cameraName);
    } catch (error) {
      console.error('Error starting screen recording:', error);
      if (error.name === 'NotAllowedError') {
        alert('Screen recording permission was denied. Please allow screen sharing.');
      } else {
        alert('Failed to start screen recording. Your browser may not support screen capture.');
      }
      setIsRecording(false);
    }
  };

  // Start recording using canvas to avoid flickering
  const startRecording = async (cameraName, mode = null) => {
    // Use provided mode or fallback to state
    const actualMode = mode || recordingMode;
    console.log('🎬 Start recording called:', { cameraName, providedMode: mode, actualMode, currentRecordingMode: recordingMode });
    
    // If screen recording mode, use screen capture instead
    if (actualMode === 'screen') {
      console.log('📺 Starting screen recording...');
      await startScreenRecording(cameraName);
      return;
    }
    
    console.log('🎥 Starting video recording...');
    // If mode was provided, update state
    if (mode) {
      setRecordingMode(mode);
    }

    const videoElement = videoRefs.current[cameraName];
    if (!videoElement || !videoElement.srcObject || videoElement.readyState !== 4) {
      console.error('No video stream available for recording');
      alert('Video is not ready. Please wait for the stream to load.');
      return;
    }

    try {
      // Create canvas for smooth frame capture
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      
      canvasRef.current = canvas;
      recordedChunksRef.current = [];
      recordingActiveRef.current = true;

      // Get canvas stream - captureStream automatically handles frame capture
      // Using lower FPS to reduce CPU load and prevent display flickering
      const canvasStream = canvas.captureStream(24); // 24fps - smooth recording without display impact
      canvasStreamRef.current = canvasStream;

      // Function to draw video frame to canvas (called periodically)
      const drawFrame = () => {
        if (!recordingActiveRef.current || !canvasRef.current || !videoElement || videoElement.readyState !== 4) {
          return;
        }

        // Clear and draw to canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Apply transformations if needed
        if (videoRotation !== 0 || videoScale !== 100) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          if (videoRotation !== 0) {
            ctx.rotate((videoRotation * Math.PI) / 180);
          }
          if (videoScale !== 100) {
            const scale = videoScale / 100;
            ctx.scale(scale, scale);
          }
          ctx.translate(-canvas.width / 2, -canvas.height / 2);
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        } else {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        }
      };

      // Use setInterval with optimal timing to update canvas (matches captureStream FPS)
      // This reduces visual interference with the main video display
      drawIntervalRef.current = setInterval(() => {
        if (recordingActiveRef.current) {
          drawFrame();
        } else {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
      }, 1000 / 24); // ~41.67ms per frame (24fps)

      // Check for codec support and fallback
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }
      }

      // Create MediaRecorder with canvas stream
      const mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType: mimeType,
        videoBitsPerSecond: 2000000 // 2 Mbps - good quality without overloading
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop recording loop
        recordingActiveRef.current = false;
        
        // Stop drawing interval
        if (drawIntervalRef.current) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
        
        // Stop animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }

        // Stop canvas stream tracks
        if (canvasStreamRef.current) {
          canvasStreamRef.current.getTracks().forEach(track => track.stop());
          canvasStreamRef.current = null;
        }

        // Clean up canvas
        canvasRef.current = null;

        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording_${cameraName}_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
        }
      };

      // Start recording with timeslice of 100ms for smooth playback
      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);

      // Timer for recording duration
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      console.log('Recording started for', cameraName);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording. Your browser may not support recording.');
      setIsRecording(false);
    }
  };

  // Stop recording
  const stopRecording = () => {
    recordingActiveRef.current = false;
    
    // Stop drawing interval (for video mode)
    if (drawIntervalRef.current) {
      clearInterval(drawIntervalRef.current);
      drawIntervalRef.current = null;
    }
    
    // Stop animation frame (for video mode)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Stop screen stream (for screen mode)
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  };

  // Capture screenshot
  const captureScreenshot = (cameraName) => {
    const videoElement = videoRefs.current[cameraName];
    if (!videoElement || videoElement.readyState !== 4) {
      console.error('Video not ready for screenshot');
      alert('Video is not ready. Please wait for the stream to load.');
      return;
    }

    try {
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');

      // Apply rotation and scale transformations if needed
      if (videoRotation !== 0 || videoScale !== 100) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        if (videoRotation !== 0) {
          ctx.rotate((videoRotation * Math.PI) / 180);
        }
        if (videoScale !== 100) {
          const scale = videoScale / 100;
          ctx.scale(scale, scale);
        }
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        // Draw video frame without transformations
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      }

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `screenshot_${cameraName}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log('Screenshot captured for', cameraName);
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      alert('Failed to capture screenshot.');
    }
  };

  // Load devices on mount (before socket connection)
  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      console.log('🚀 [useEffect] Loading devices immediately on mount');
      const loadDevices = async () => {
        try {
          // Ensure we're using the correct origin
          const apiUrl = typeof window !== 'undefined' 
            ? `${window.location.origin}/api/devices`
            : `${SERVER_URL}/api/devices`;
          
          console.log('📡 [useEffect] Fetching devices from:', apiUrl);
          console.log('📡 [useEffect] Window origin:', typeof window !== 'undefined' ? window.location.origin : 'N/A');
          console.log('📡 [useEffect] SERVER_URL:', SERVER_URL);
          
          const response = await fetch(apiUrl, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          console.log('📡 [useEffect] Response status:', response.status, response.ok);
          
          if (response.ok) {
            const data = await response.json();
            console.log('📡 [useEffect] Devices response:', data);
            
            if (data.success && data.devices) {
              console.log('✅ [useEffect] Setting devices:', data.devices);
              console.log('✅ [useEffect] Device count:', Object.keys(data.devices).length);
              setAllDevices(data.devices);
            } else {
              console.warn('⚠️ [useEffect] No devices in response or success is false');
            }
          } else {
            console.error('❌ [useEffect] Response not OK:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('❌ [useEffect] Error response:', errorText);
          }
        } catch (error) {
          console.error('❌ [useEffect] Error loading devices:', error);
          console.error('❌ [useEffect] Error details:', error.message, error.stack);
        }
      };
      
      loadDevices();
    }
  }, []); // Run once on mount

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recordingActiveRef.current = false;
      
      if (drawIntervalRef.current) {
        clearInterval(drawIntervalRef.current);
      }
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      
      if (canvasStreamRef.current) {
        canvasStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);
  

  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (!storedUsername) {
      navigate('/login');
      return;
    }
    setUsername(storedUsername);

    // Initialize socket connection - Configure for nginx reverse proxy
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
      console.log('✅ Connected to server');
      loadAllDevices(); // Load all devices from database
      loadStreams(); // Load active streams
    });

    // Listen for device connection logs from backend
    socketRef.current.on('deviceConnectionLog', (logData) => {
      console.log('📺 [Device Log]', logData.message, logData);
      
      // Add log to device logs display
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
      } else if (logData.type === 'tv_logs') {
        // Display TV logs directly - filter them first
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
      } else if (logData.type === 'connected') {
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
      }
    });

    // Also load devices immediately if socket is already connected
    if (socketRef.current && socketRef.current.connected) {
      console.log('Socket already connected, loading devices immediately');
      loadAllDevices();
      loadStreams();
    }

    socketRef.current.on('newStream', ({ cameraName }) => {
      console.log('New stream available:', cameraName);
      loadStreams();
    });

    socketRef.current.on('streamEnded', ({ cameraName }) => {
      console.log('Stream ended:', cameraName);
      setStreams((prev) => prev.filter((s) => s.cameraName !== cameraName));
      setSelectedCameras((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cameraName);
        return newSet;
      });
    });

    socketRef.current.on('producerClosed', ({ cameraName }) => {
      console.log('Producer closed:', cameraName);
      if (videoRefs.current[cameraName]) {
        videoRefs.current[cameraName].srcObject = null;
      }
    });

    // Handle incoming ICE candidates from server
    socketRef.current.on('newConsumerIceCandidate', ({ cameraName, candidate }) => {
      try {
        const consumerData = consumersRef.current[cameraName];
        if (consumerData && consumerData.transport) {
          if (candidate === null) {
            // ICE gathering complete
            console.log(`ICE gathering complete for consumer ${cameraName}`);
          } else if (candidate) {
            console.log(`Adding server ICE candidate for consumer ${cameraName}:`, candidate);
            consumerData.transport.addRemoteCandidate(candidate);
          }
        }
      } catch (error) {
        console.error(`Error adding server ICE candidate for ${cameraName}:`, error);
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [navigate]);

  // Load device info for the currently selected camera from backend
  useEffect(() => {
    const fetchDeviceInfo = async (cameraName) => {
      try {
        // First check if device exists in allDevices
        let deviceData = allDevices[cameraName];
        
        if (!deviceData) {
          // Try to fetch from stream endpoint
          const response = await fetch(`${SERVER_URL}/api/stream/${cameraName}/device`);
          if (response.ok) {
            const data = await response.json();
            deviceData = data.deviceInfo;
          }
        }
        
        if (deviceData) {
          console.log('✅ Device info loaded:', deviceData);
          setDeviceInfo(deviceData);
          setCurrentCamera(cameraName);
          
          // Ensure remote is connected for this device
          if (!remoteConnectionsRef.current[cameraName]) {
            await connectRemoteForDevice(deviceData);
          }
        } else {
          // Try to find in allDevices
          const foundDevice = Object.values(allDevices).find(d => d.cameraName === cameraName);
          if (foundDevice) {
            setDeviceInfo(foundDevice);
            setCurrentCamera(cameraName);
            await connectRemoteForDevice(foundDevice);
          } else {
            console.log('No device info found for camera:', cameraName);
            setDeviceInfo(null);
            clearSessionForCamera(cameraName);
            delete remoteConnectionsRef.current[cameraName];
            setRemoteConnections((prev) => {
              if (!prev[cameraName]) {
                return prev;
              }
              const updated = { ...prev };
              delete updated[cameraName];
              return updated;
            });
          }
        }
      } catch (error) {
        console.error('Error fetching device info:', error);
        setDeviceInfo(null);
      }
    };
    
    if (selectedCameras.size > 0) {
      // Get the first selected camera
      const selectedCameraName = Array.from(selectedCameras)[0];
      setCurrentCamera(selectedCameraName);
      console.log('Selected camera:', selectedCameraName);
      
      // Fetch device info
      fetchDeviceInfo(selectedCameraName);
    } else {
      // No camera selected - but don't disconnect if we have a device selected for remote
      if (!currentCamera || !deviceInfo) {
        setCurrentCamera(null);
        setDeviceInfo(null);
      }
    }
  }, [selectedCameras, allDevices]);

  // Disconnect from device
  const disconnectDevice = async () => {
    const cameraName = deviceInfo?.cameraName || currentCamera;
    const activeSessionId = cameraName ? (sessionIdsRef.current[cameraName] || currentSessionId) : null;

    if (!activeSessionId || !socketRef.current) return;
    
    return new Promise((resolve) => {
      socketRef.current.emit('disconnectDevice', { sessionId: activeSessionId }, (response) => {
        if (response.success) {
          console.log('Disconnected from device');
          if (cameraName) {
            delete remoteConnectionsRef.current[cameraName];
            setRemoteConnections((prev) => {
              if (!prev[cameraName]) {
                return prev;
              }
              const updated = { ...prev };
              delete updated[cameraName];
              return updated;
            });
            clearSessionForCamera(cameraName);
          }
        } else {
          console.error('Disconnect error:', response.error);
        }
        resolve();
      });
    });
  };

  // Connect to device via Python API (through Node.js backend)
  const connectToDevice = async (deviceData) => {
    if (!socketRef.current) return false;
    
    return new Promise((resolve) => {
      console.log('Connecting to device for remote control:', deviceData);
      socketRef.current.emit('connectDevice', { deviceData }, (response) => {
        if (response.success) {
          updateSessionForCamera(deviceData?.cameraName, response.sessionId);
          console.log('✅ Connected to device for remote control:', response.sessionId);
          resolve(true);
        } else {
          console.error('❌ Failed to connect to device:', response.error);
          if (deviceData?.cameraName) {
            clearSessionForCamera(deviceData.cameraName);
          }
          resolve(false);
        }
      });
    });
  };

  // Check if session already exists for this device (via Node.js backend)
  const checkExistingSession = async (deviceData) => {
    if (!socketRef.current) return false;
    
    return new Promise((resolve) => {
      console.log('Checking existing session for device:', deviceData);
      socketRef.current.emit('checkExistingSession', { deviceData }, (response) => {
        if (response.success && response.exists && response.session) {
          console.log('✅ Found existing session:', response.session.sessionId);
          updateSessionForCamera(deviceData?.cameraName, response.session.sessionId);
          resolve(true); // Session exists
        } else {
          console.log('No existing session found');
          if (deviceData?.cameraName) {
            clearSessionForCamera(deviceData.cameraName);
          }
          resolve(false); // No existing session
        }
      });
    });
  };

  // Send remote control command (through Node.js backend)
  const sendCommand = async (type, params) => {
    if (!currentSessionId || !socketRef.current) {
      console.error('No active remote session');
      return;
    }

    return new Promise((resolve) => {
      socketRef.current.emit('sendRemoteCommand', { sessionId: currentSessionId, type, params }, (response) => {
        if (response.success) {
          console.log('✅ Command sent:', type, params);
        } else {
          console.error('❌ Command failed:', response.error);
        }
        resolve();
      });
    });
  };

  // Handle remote text input
  const handleRemoteSendText = () => {
    if (remoteTextInput.trim()) {
      sendCommand('text', { text: remoteTextInput.trim() });
      setRemoteTextInput('');
    }
  };

  // Filter TV device logs - now logs come clean from backend, but filter as safety net
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

  // Fetch device logs
  const fetchDeviceLogs = async (refresh = false) => {
    if (!socketRef.current) {
      setDeviceLogs('Error: Socket not connected');
      return;
    }
    
    // Use cameraName/deviceName if sessionId is not available
    const cameraName = currentCamera || deviceInfo?.cameraName;
    if (!cameraName && !currentSessionId) {
      setDeviceLogs('Error: No camera selected or session available');
      return;
    }
    
    setLogsLoading(true);
    
    // Try with sessionId first, fallback to cameraName
    const logRequest = currentSessionId 
      ? { sessionId: currentSessionId, maxLines: 100, refresh }
      : { cameraName, maxLines: 100, refresh };
    
    console.log('📡 [Live] Requesting logs with:', logRequest);
    
    socketRef.current.emit('getDeviceLogs', logRequest, (response) => {
      console.log('📥 [Live] Received logs response:', {
        success: response.success,
        hasLogs: !!response.logs,
        logLength: response.logs ? response.logs.length : 0
      });
      
      if (response.success) {
        // Filter to show only TV device logs
        const filteredLogs = filterTVLogs(response.logs || '');
        console.log('✅ [Live] Filtered logs length:', filteredLogs.length);
        
        if (filteredLogs && filteredLogs.trim()) {
          setDeviceLogs(filteredLogs);
          // Auto-scroll to bottom after state update
          setTimeout(() => {
            if (logsContainerRef.current) {
              logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
            }
          }, 100);
        } else {
          // If no filtered logs but we have raw logs, use raw logs
          if (response.logs && response.logs.trim()) {
            setDeviceLogs(response.logs);
            // Auto-scroll to bottom after state update
            setTimeout(() => {
              if (logsContainerRef.current) {
                logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
              }
            }, 100);
          } else {
            setDeviceLogs('No TV logs available yet. Logs will appear here when commands are sent.');
          }
        }
      } else {
        console.error('❌ [Live] Failed to fetch logs:', response.error);
        setDeviceLogs(`Error: ${response.error || 'Failed to fetch logs'}`);
      }
      setLogsLoading(false);
    });
  };

  // Load logs in terminal view
  const loadLogsInTerminal = async () => {
    setLogsLoading(true);
    try {
      // Fetch fresh logs
      await fetchDeviceLogs(true);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  // Navigate to logs page
  const openLogsInNewTab = () => {
    const camera = currentCamera || deviceInfo?.cameraName;
    if (camera) {
      // Open in new tab
      const logsUrl = `${window.location.origin}/logs/${encodeURIComponent(camera)}`;
      window.open(logsUrl, '_blank');
    } else {
      console.warn('No camera selected for logs');
    }
  };

  // Auto-load logs when camera is selected
  useEffect(() => {
    if (currentCamera || deviceInfo?.cameraName) {
      console.log('🔄 [Auto-load logs] Camera selected:', currentCamera || deviceInfo?.cameraName);
      
      // Wait a bit for remote connection to establish, then load logs
      const timer = setTimeout(() => {
        if (socketRef.current && socketRef.current.connected) {
          console.log('✅ [Auto-load logs] Socket connected, loading logs...');
          loadLogsInTerminal();
        } else {
          console.log('⏳ [Auto-load logs] Waiting for socket connection...');
          // Retry after socket connects
          const checkSocket = setInterval(() => {
            if (socketRef.current && socketRef.current.connected) {
              console.log('✅ [Auto-load logs] Socket connected, loading logs...');
              loadLogsInTerminal();
              clearInterval(checkSocket);
            }
          }, 500);
          
          // Cleanup after 10 seconds
          setTimeout(() => clearInterval(checkSocket), 10000);
        }
      }, 2000); // Wait 2 seconds after camera selection
      
      return () => clearTimeout(timer);
    }
  }, [currentCamera, deviceInfo]);

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

  // Load all devices from database
  const loadAllDevices = async () => {
    try {
      // Use window.location.origin to ensure correct URL (works with nginx reverse proxy)
      const apiUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/api/devices`
        : `${SERVER_URL}/api/devices`;
      
      console.log('📡 [loadAllDevices] Fetching devices from:', apiUrl);
      console.log('📡 [loadAllDevices] Window origin:', typeof window !== 'undefined' ? window.location.origin : 'N/A');
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      console.log('📡 [loadAllDevices] Response status:', response.status, response.ok);
      
      if (!response.ok) {
        console.error('❌ [loadAllDevices] Response not OK:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('❌ [loadAllDevices] Error response:', errorText);
        setAllDevices({});
        return;
      }
      
      const data = await response.json();
      console.log('📡 [loadAllDevices] Response data:', data);
      console.log('📡 [loadAllDevices] data.success:', data.success);
      console.log('📡 [loadAllDevices] data.devices:', data.devices);
      
      if (data.success && data.devices) {
        console.log('✅ Loaded all devices from database:', data.devices);
        console.log('✅ Device count:', Object.keys(data.devices).length);
        setAllDevices(data.devices);
        
        // Auto-connect remote control for all devices
        Object.values(data.devices).forEach(device => {
          connectRemoteForDevice(device);
        });
      } else {
        console.warn('⚠️ [loadAllDevices] No devices found or data.success is false');
        console.warn('⚠️ [loadAllDevices] data:', data);
        setAllDevices({});
      }
    } catch (error) {
      console.error('❌ Error loading devices:', error);
      console.error('❌ Error details:', error.message, error.stack);
      setAllDevices({});
    }
  };

  // Connect remote control for a device (without requiring stream)
  const connectRemoteForDevice = async (device) => {
    try {
      if (!device || remoteConnectionsRef.current[device.cameraName]) {
        // Already connected
        return;
      }

      // Check if session already exists for this device
      const hasExistingSession = await checkExistingSession(device);
      let remoteConnected = false;
      
      if (!hasExistingSession) {
        console.log(`Connecting remote control for device: ${device.cameraName}`);
        remoteConnected = await connectToDevice(device);
      } else {
        console.log(`Remote control already connected for: ${device.cameraName}`);
        remoteConnected = true;
      }
      
      if (remoteConnected) {
        remoteConnectionsRef.current[device.cameraName] = true;
        setRemoteConnections((prev) => ({
          ...prev,
          [device.cameraName]: true,
        }));
      }
    } catch (error) {
      console.error(`Error connecting remote for ${device.cameraName}:`, error);
    }
  };

  const loadStreams = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('getStreams', async (streamList) => {
      console.log('Live.jsx: streams from server:', streamList);
        setStreams(streamList);
      // Auto-select first stream if none selected yet
      if (streamList && streamList.length > 0 && selectedCameras.size === 0) {
        const first = streamList[0]?.cameraName || streamList[0];
        if (first) {
          try {
            await startViewing(first);
          } catch (e) {
            console.error('Failed to auto-start viewing', e);
          }
        }
      }
    });
  };

  const initializeDevice = async () => {
    if (device) return device;

    const newDevice = new Device();
    
    return new Promise((resolve, reject) => {
      socketRef.current.emit('getRouterRtpCapabilities', async (rtpCapabilities) => {
        try {
          await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
          setDevice(newDevice);
          resolve(newDevice);
        } catch (error) {
          console.error('Error loading device:', error);
          reject(error);
        }
      });
    });
  };

  const handleCameraSelect = async (cameraName) => {
    // Clear previous selections
    selectedCameras.forEach((cam) => {
      if (cam !== cameraName) {
        stopViewing(cam);
      }
    });
    
    // Toggle the selected camera
    if (selectedCameras.has(cameraName)) {
      stopViewing(cameraName);
    } else {
      await startViewing(cameraName);
    }
  };

  const startViewing = async (cameraName) => {
    try {
      // Stop viewing if already viewing this camera
      if (selectedCameras.has(cameraName)) {
        stopViewing(cameraName);
        // Wait a bit for cleanup
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      const currentDevice = await initializeDevice();

      // Create consumer transport
      socketRef.current.emit(
        'createConsumerTransport',
        { cameraName },
        async (params) => {
          if (params.error) {
            console.error('Error creating consumer transport:', params.error);
            return;
          }

          // Check if transport already exists and close it
          if (consumersRef.current[cameraName] && consumersRef.current[cameraName].transport) {
            try {
              consumersRef.current[cameraName].transport.close();
            } catch (e) {
              console.warn('Error closing existing transport:', e);
            }
          }

          const consumerTransport = currentDevice.createRecvTransport(params);

          let connectCalled = false;
          consumerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
            if (connectCalled) {
              console.warn(`Connect already called for ${cameraName}, ignoring duplicate`);
              return;
            }
            connectCalled = true;
            console.log(`Consumer transport connect event for ${cameraName}, sending DTLS parameters...`);
            socketRef.current.emit(
              'connectConsumerTransport',
              { cameraName, dtlsParameters },
              (response) => {
                if (response.error) {
                  console.error(`❌ Error connecting consumer transport for ${cameraName}:`, response.error);
                  connectCalled = false; // Reset on error so it can retry
                  errback(new Error(response.error));
                } else {
                  console.log(`✅ Consumer transport DTLS connected for ${cameraName}`);
                  callback();
                }
              }
            );
          });

          consumerTransport.on('connectionstatechange', (state) => {
            console.log(`Consumer transport CONNECTION state for ${cameraName}:`, state);
            if (state === 'connected') {
              console.log(`✅ Consumer transport connected for ${cameraName}`);
              setCameraConnections((prev) => ({
                ...prev,
                [cameraName]: true,
              }));
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              console.error(`❌ Consumer transport ${state} for ${cameraName}`);
              setCameraConnections((prev) => {
                if (!prev[cameraName]) {
                  return prev;
                }
                const updated = { ...prev };
                delete updated[cameraName];
                return updated;
              });
            }
          });

          consumerTransport.on('icestatechange', (state) => {
            console.log(`Consumer transport ICE state for ${cameraName}:`, state);
          });

          consumerTransport.on('icecandidate', (event) => {
            if (event.candidate) {
              console.log(`Consumer ICE candidate for ${cameraName}:`, event.candidate);
              // Send ICE candidate to server
              socketRef.current.emit('consumerIceCandidate', {
                cameraName,
                candidate: event.candidate,
              });
            }
          });

          // Log transport stats
          const statsInterval = setInterval(async () => {
            try {
              // Check if transport is closed before getting stats
              if (consumerTransport.closed) {
                clearInterval(statsInterval);
                return;
              }
              const stats = await consumerTransport.getStats();
              console.log(`Consumer transport stats for ${cameraName}:`, {
                connectionState: consumerTransport.connectionState,
                iceConnectionState: consumerTransport.iceConnectionState,
                iceGatheringState: consumerTransport.iceGatheringState,
              });
            } catch (e) {
              // Silently ignore errors if transport is closed
              if (consumerTransport.closed) {
                clearInterval(statsInterval);
                return;
              }
              console.error('Transport stats error:', e);
            }
          }, 5000);
          
          // Clean up interval when transport closes
          consumerTransport.on('transportclose', () => {
            clearInterval(statsInterval);
          });

          // Store transport reference for ICE candidate handling
          if (!consumersRef.current[cameraName]) {
            consumersRef.current[cameraName] = {
              transport: consumerTransport,
              consumers: [],
              mediaStream: null,
            };
          } else {
            consumersRef.current[cameraName].transport = consumerTransport;
          }

          // Add camera to selected list first to render video element
          setSelectedCameras((prev) => new Set([...prev, cameraName]));

          // Consume media
          socketRef.current.emit(
            'consume',
            {
              cameraName,
              rtpCapabilities: currentDevice.rtpCapabilities,
            },
            async (response) => {
              if (response.error) {
                console.error('Error consuming:', response.error);
                return;
              }

              const mediaStream = new MediaStream();

              for (const consumerData of response.consumers) {
                const consumer = await consumerTransport.consume({
                  id: consumerData.id,
                  producerId: consumerData.producerId,
                  kind: consumerData.kind,
                  rtpParameters: consumerData.rtpParameters,
                });

                console.log(`Created ${consumerData.kind} consumer for ${cameraName}`, {
                  id: consumer.id,
                  paused: consumer.paused,
                  track: consumer.track
                });

                // Resume consumer on server side (this is critical for mediasoup!)
                socketRef.current.emit(
                  'resumeConsumer',
                  { cameraName, consumerId: consumer.id },
                  (response) => {
                    if (response.error) {
                      console.error(`Error resuming ${consumerData.kind} consumer:`, response.error);
                    } else {
                      console.log(`✅ Server-side consumer resumed for ${cameraName} [${consumerData.kind}]`);
                    }
                  }
                );

                console.log(`Adding ${consumerData.kind} track to stream for ${cameraName}`);
                mediaStream.addTrack(consumer.track);

                if (!consumersRef.current[cameraName]) {
                  consumersRef.current[cameraName] = {
                    transport: consumerTransport,
                    consumers: [],
                    mediaStream: null,
                  };
                }
                consumersRef.current[cameraName].consumers.push(consumer);

                // Monitor consumer stats
                const consumerStatsInterval = setInterval(async () => {
                  if (consumer.closed) {
                    clearInterval(consumerStatsInterval);
                    return;
                  }
                  try {
                    const stats = await consumer.getStats();
                    stats.forEach(report => {
                      if (report.type === 'inbound-rtp' && report.kind === consumerData.kind) {
                        console.log(`${consumerData.kind} stats for ${cameraName}:`, {
                          packetsReceived: report.packetsReceived,
                          packetsLost: report.packetsLost,
                          bytesReceived: report.bytesReceived,
                          framesDecoded: report.framesDecoded,
                          framesDropped: report.framesDropped
                        });
                      }
                    });
                  } catch (e) {
                    // Silently ignore errors if consumer is closed
                    if (consumer.closed) {
                      clearInterval(consumerStatsInterval);
                      return;
                    }
                    console.error('Stats error:', e);
                  }
                }, 3000);

                // Clean up on unmount
                consumer.on('close', () => {
                  clearInterval(consumerStatsInterval);
                });
              }

              // Store the media stream
              consumersRef.current[cameraName].mediaStream = mediaStream;

              console.log(`MediaStream tracks for ${cameraName}:`, mediaStream.getTracks().length);

              // Attach stream to video element once it's ready
              const attachStream = () => {
              if (videoRefs.current[cameraName]) {
                  const videoEl = videoRefs.current[cameraName];
                  
                  // Check if stream is already attached
                  if (videoEl.srcObject === mediaStream) {
                    console.log(`Stream already attached to video element for ${cameraName}`);
                    return;
                  }
                  
                  console.log(`Attaching stream to video element for ${cameraName}`);
                  
                  // Debug track info
                  mediaStream.getTracks().forEach(track => {
                    console.log(`Track ${track.kind}:`, {
                      id: track.id,
                      enabled: track.enabled,
                      muted: track.muted,
                      readyState: track.readyState,
                      label: track.label
                    });
                  });
                  
                  videoEl.srcObject = mediaStream;
                  videoEl.muted = isAudioMuted;
                  
                  // Add event listeners for debugging (only once)
                  if (!videoEl.hasAttribute('data-listeners-added')) {
                    videoEl.setAttribute('data-listeners-added', 'true');
                    
                    videoEl.onloadedmetadata = () => {
                      console.log(`Video metadata loaded for ${cameraName}`, {
                        videoWidth: videoEl.videoWidth,
                        videoHeight: videoEl.videoHeight,
                        duration: videoEl.duration
                      });
                    };
                    
                    videoEl.onloadeddata = () => {
                      console.log(`Video data loaded for ${cameraName}`);
                    };
                    
                    videoEl.onplay = () => {
                      console.log(`Video playing for ${cameraName}`);
                    };
                    
                    videoEl.onerror = (e) => {
                      console.error(`Video error for ${cameraName}:`, e);
                    };
                  }
                  
                  // Explicitly play the video
                  videoEl.play()
                    .then(() => {
                      console.log(`✅ Video play() succeeded for ${cameraName}`);
                    })
                    .catch(err => {
                      console.error('❌ Error playing video:', err);
                    });
                } else {
                  // Retry after a short delay if video element isn't ready yet
                  setTimeout(attachStream, 100);
                }
              };
              
              // Wait for video element to be ready (use setTimeout to allow React to render)
              setTimeout(attachStream, 100);
            }
          );
        }
      );
    } catch (error) {
      console.error('Error starting viewing:', error);
    }
  };

  const stopViewing = (cameraName) => {
    // Stop recording if active
    if (isRecording && mediaRecorderRef.current) {
      stopRecording();
    }

    const consumerData = consumersRef.current[cameraName];
    if (consumerData) {
      consumerData.consumers.forEach((consumer) => consumer.close());
      consumerData.transport.close();
      delete consumersRef.current[cameraName];
    }

    setCameraConnections((prev) => {
      if (!prev[cameraName]) {
        return prev;
      }
      const updated = { ...prev };
      delete updated[cameraName];
      return updated;
    });

    if (videoRefs.current[cameraName]) {
      videoRefs.current[cameraName].srcObject = null;
    }

    setSelectedCameras((prev) => {
      const newSet = new Set(prev);
      newSet.delete(cameraName);
      return newSet;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    navigate('/login');
  };

  return (
    <div className="live-container">
      {/* Navbar with Camera Selector */}
      <Navbar
        username={username}
        streams={streams}
        allDevices={allDevices}
        selectedCamera={currentCamera}
        onCameraSelect={handleCameraSelect}
        onLogout={handleLogout}
        onScreenshot={() => currentCamera && captureScreenshot(currentCamera)}
        onRecord={() => currentCamera && startRecording(currentCamera)}
        onStopRecord={stopRecording}
        isRecording={isRecording}
        recordingMode={recordingMode}
        setRecordingMode={setRecordingMode}
        onRecordWithMode={(mode) => currentCamera && startRecording(currentCamera, mode)}
        remoteConnections={remoteConnections}
        cameraConnections={cameraConnections}
      />

      <div className="live-content">
        {/* Toggle Remote Panel Button - Always show when device exists */}
        {deviceInfo && (
          <button 
            className="toggle-remote-btn"
            onClick={() => setIsRemotePanelOpen(!isRemotePanelOpen)}
            title={isRemotePanelOpen ? 'Close Remote Control' : 'Open Remote Control'}
            style={{
              right: isRemotePanelOpen ? '255px' : '20px' // 280px - 25px = 255px for junction
            }}
          >
            {isRemotePanelOpen ? '►' : '📺'}
          </button>
        )}

        {/* Main Video Area */}
        <main className={`video-area ${isRemotePanelOpen && deviceInfo ? 'with-remote' : 'full-width'}`}>
          {selectedCameras.size === 0 ? (
            <div className="empty-state">
              <svg
                width="120"
                height="120"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              >
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <h2>No camera selected</h2>
              <p>Select a device from the dropdown to start viewing</p>
            </div>
          ) : (
            Array.from(selectedCameras).map((cameraName) => (
              <div key={cameraName} className="video-container">
                <video
                  ref={(el) => {
                    if (el) {
                      videoRefs.current[cameraName] = el;
                      // If there's already a stream, attach it
                      const consumerData = consumersRef.current[cameraName];
                      if (consumerData && consumerData.mediaStream) {
                        // Only attach if not already attached or different stream
                        if (el.srcObject !== consumerData.mediaStream) {
                          console.log(`Attaching stream to video element for ${cameraName}`);
                          el.muted = isAudioMuted;
                          el.playsInline = true;
                          el.autoplay = true;
                          el.srcObject = consumerData.mediaStream;
                          el.play().catch(err => {
                            console.error('Error playing video:', err);
                          });
                        }
                      }
                    }
                  }}
                  autoPlay
                  muted={isAudioMuted}
                  playsInline
                  className="video-element"
                  style={{ 
                    transform: `rotate(${videoRotation}deg) scale(${videoScale / 100})`,
                    transformOrigin: 'center center'
                  }}
                />
              </div>
            ))
          )}
        </main>

        {/* Remote Control Sidebar - Collapsible */}
        {deviceInfo && (
          <aside className={`remote-sidebar ${isRemotePanelOpen ? 'open' : 'closed'}`}>
            <div className="remote-header">
              <h3>Device Control</h3>
              {(isRemoteConnectedForCurrent || isCameraConnected) && (
                <div className="remote-status-group">
                  {isRemoteConnectedForCurrent && (
                    <span className="status-chip remote" title="Remote connected">
                      <span className="chip-dot" />
                      Remote
                    </span>
                  )}
                  {isCameraConnected && (
                    <span className="status-chip camera" title="Camera stream connected">
                      <span className="chip-dot" />
                      Camera
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Mini Video Controls */}
            <div className="mini-video-controls">
              <button
                className={`mini-control-btn ${isAudioMuted ? 'mute-btn' : 'audio-btn'}`}
                onClick={() => toggleAudioMute(currentCamera)}
                title={isAudioMuted ? 'Unmute' : 'Mute'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {isAudioMuted ? (
                    <>
                      <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                      <line x1="23" y1="9" x2="17" y2="15"/>
                      <line x1="17" y1="9" x2="23" y2="15"/>
                    </>
                  ) : (
                    <>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    </>
                  )}
                </svg>
              </button>

              <button
                className="mini-control-btn rotate-btn"
                onClick={rotateVideo}
                title={`Rotate (${videoRotation}°)`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
              </button>

              <div className="mini-zoom-control">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="range"
                  min="50"
                  max="200"
                  step="10"
                  value={videoScale}
                  onChange={handleScaleChange}
                  className="mini-zoom-slider"
                  title={`Zoom: ${videoScale}%`}
                />
                <span className="mini-zoom-value">{videoScale}%</span>
              </div>
            </div>

            <div className="remote-controls">
              {/* D-Pad Navigation with Power Button */}
              <div className="dpad">
                <div className="dpad-row">
                  <div></div>
                  <button 
                    className="remote-btn"
                    onClick={() => sendCommand('key', { action: 'up' })}
                    disabled={!isRemoteConnectedForCurrent}
                  >
                    ▲
                  </button>
                  <div></div>
                </div>
                <div className="dpad-row">
                  <button 
                    className="remote-btn"
                    onClick={() => sendCommand('key', { action: 'left' })}
                    disabled={!isRemoteConnectedForCurrent}
                  >
                    ◄
                  </button>
                  <button 
                    className="remote-btn ok-btn"
                    onClick={() => sendCommand('key', { action: 'enter' })}
                    disabled={!isRemoteConnectedForCurrent}
                  >
                    OK
                  </button>
                  <button 
                    className="remote-btn"
                    onClick={() => sendCommand('key', { action: 'right' })}
                    disabled={!isRemoteConnectedForCurrent}
                  >
                    ►
                  </button>
                  {/* Power Button next to right arrow */}
                  <button 
                    className="remote-btn power-btn-side"
                    onClick={() => sendCommand('key', { action: 'power' })}
                    disabled={!isRemoteConnectedForCurrent}
                    title="Power"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                      <line x1="12" y1="2" x2="12" y2="12"/>
                    </svg>
                  </button>
                </div>
                <div className="dpad-row">
                  <div></div>
                  <button 
                    className="remote-btn"
                    onClick={() => sendCommand('key', { action: 'down' })}
                    disabled={!isRemoteConnectedForCurrent}
                  >
                    ▼
                  </button>
                  <div></div>
                </div>
              </div>

              {/* Main Control Buttons */}
              <div className="control-buttons">
                <button 
                  className="remote-btn"
                  onClick={() => sendCommand('key', { action: 'back' })}
                  disabled={!isRemoteConnectedForCurrent}
                >
                  Back
                </button>
                <button 
                  className="remote-btn"
                  onClick={() => sendCommand('key', { action: 'home' })}
                  disabled={!isRemoteConnectedForCurrent}
                >
                  Home
                </button>
                <button 
                  className="remote-btn"
                  onClick={() => sendCommand('key', { action: 'menu' })}
                  disabled={!isRemoteConnectedForCurrent}
                >
                  Menu
                </button>
              </div>

              {/* Volume Controls */}
              <div className="volume-controls">
                <button 
                  className="remote-btn"
                  onClick={() => sendCommand('key', { action: 'volume_up' })}
                disabled={!isRemoteConnectedForCurrent}
                  title="Volume Up"
                >
                  Vol+
                </button>
                <button 
                  className="remote-btn"
                  onClick={() => sendCommand('key', { action: 'volume_down' })}
              disabled={!isRemoteConnectedForCurrent}
                  title="Volume Down"
                >
                  Vol-
                </button>
                <button 
                  className="remote-btn"
                  onClick={() => sendCommand('key', { action: 'mute' })}
                  disabled={!isRemoteConnectedForCurrent}
                  title="Mute"
                >
                  Mute
                </button>
              </div>

              {/* Media Controls */}
              <div className="media-controls">
                <button 
                  className="remote-btn"
                  onClick={() => sendCommand('key', { action: 'play' })}
                  disabled={!isRemoteConnectedForCurrent}
                  title="Play"
                >
                  ▶
                </button>
                <button 
                  className="remote-btn"
                  onClick={() => sendCommand('key', { action: 'pause' })}
                  disabled={!isRemoteConnectedForCurrent}
                  title="Pause"
                >
                  ⏸
                </button>
                <button 
                  className="remote-btn"
                  onClick={() => sendCommand('key', { action: 'stop' })}
                  disabled={!isRemoteConnectedForCurrent}
                  title="Stop"
                >
                  ⏹
                </button>
              </div>
              {/* Number Pad - 3 columns with 0 centered */}
              <div className="number-pad">
                <div className="number-grid">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null].map((num, index) =>
                    num === null ? (
                      <div key={index} className="number-empty" />
                    ) : (
                      <button
                        key={index}
                        className="remote-btn number-btn"
                        onClick={() => sendCommand('key', { action: String(num) })}
                        disabled={!isRemoteConnectedForCurrent}
                        title={`Number ${num}`}
                      >
                        {num}
                      </button>
                    )
                  )}
                </div>
              </div>
              {/* Text Input - Fixed at bottom */}
              <div className="text-input-section">
                <input
                  type="text"
                  className="text-input"
                  placeholder="Type text..."
                  value={remoteTextInput}
                  onChange={(e) => setRemoteTextInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleRemoteSendText()}
                      disabled={!isRemoteConnectedForCurrent}
                />
                <button
                  className="send-btn"
                  onClick={handleRemoteSendText}
                  disabled={!isRemoteConnectedForCurrent || !remoteTextInput.trim()}
                  title="Send Text"
                >
                  Send
                </button>
              </div>

              {/* Device Logs Terminal - Below remote controls */}
              <div className="logs-terminal-section">
                <div className="logs-terminal-header">
                  <span className="logs-terminal-title">
                    📺 Device Logs
                    <button
                      className="logs-open-icon-btn"
                      onClick={openLogsInNewTab}
                      disabled={!currentCamera && !deviceInfo}
                      title="Open logs in new page"
                    >
                      🔗
                    </button>
                  </span>
                  <div className="logs-terminal-actions">
                    <button
                      className="logs-refresh-btn"
                      onClick={loadLogsInTerminal}
                      disabled={(!currentCamera && !deviceInfo) || logsLoading}
                      title="Refresh Logs"
                    >
                      {logsLoading ? '⏳' : '🔄'}
                    </button>
                  </div>
                </div>
                <div className="logs-terminal-container" ref={logsContainerRef}>
                  {logsLoading ? (
                    <div className="logs-terminal-loading">Loading logs...</div>
                  ) : deviceLogs ? (
                    <pre className="logs-terminal-text">{deviceLogs}</pre>
                  ) : (
                    <div className="logs-terminal-empty">
                      {currentCamera || deviceInfo ? 'Click refresh to load logs' : 'Select a camera first'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}

      </div>
    </div>
  );
}

export default Live;

