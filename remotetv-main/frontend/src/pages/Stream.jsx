import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { Device } from 'mediasoup-client';
import './Stream.css';

// Use window.location.origin for API calls (works with nginx reverse proxy)
const SERVER_URL = typeof window !== 'undefined' 
  ? window.location.origin 
  : (import.meta.env.VITE_SERVER_URL || 'https://remotetv.ifocussystec.info');

function Stream() {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [cameraName, setCameraName] = useState('');
  const [deviceIP, setDeviceIP] = useState('');
  const [deviceType, setDeviceType] = useState('samsung_tv');
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [device, setDevice] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  
  // Device management states
  const [savedDevices, setSavedDevices] = useState({});
  const [selectedDevice, setSelectedDevice] = useState('');
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDevice, setNewDevice] = useState({
    cameraName: '',
    deviceIP: '',
    deviceType: 'samsung_tv',
    selectedCameraId: ''
  });
  
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const producerTransportRef = useRef(null);
  const producersRef = useRef({});
  const videoRef = useRef(null);
  const autoRetryTimerRef = useRef(null);
  const isAutoStartingRef = useRef(false);
  const retryAttemptsRef = useRef(0);

  useEffect(() => {
    // Load saved devices from backend
    loadSavedDevices().catch(err => console.error('Error loading devices:', err));
    
    // Get available cameras from the system
    getAvailableCameras();
    
    return () => {
      stopStreaming();
    };
  }, []);

  // Auto-start stream on page load if authenticated and device is selected
  useEffect(() => {
    console.log('🔍 [Auto-start] Checking conditions:', {
      authenticated,
      cameraName,
      hasCameras: availableCameras.length > 0,
      isStreaming,
      isAutoStarting: isAutoStartingRef.current
    });
    
    if (authenticated && cameraName && availableCameras.length > 0 && !isStreaming && !isAutoStartingRef.current) {
      console.log('🚀 [Auto-start] Starting stream automatically on page load...');
      isAutoStartingRef.current = true;
      
      // Wait for socket to be connected
      setTimeout(async () => {
        if (socketRef.current && socketRef.current.connected) {
          try {
            await startStreaming();
            console.log('✅ [Auto-start] Stream started successfully');
          } catch (error) {
            console.error('❌ [Auto-start] Failed to start stream:', error);
            // Schedule retry
            scheduleAutoRetry();
          }
        } else {
          console.log('⚠️ [Auto-start] Socket not connected yet, will retry...');
          scheduleAutoRetry();
        }
      }, 1000);
    }
  }, [authenticated, cameraName, availableCameras, isStreaming]);

  const getAvailableCameras = async () => {
    try {
      // First request camera permission to get proper labels
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Stop the stream immediately, we just needed permission
        stream.getTracks().forEach(track => track.stop());
        console.log('✅ Camera permission granted');
      } catch (permError) {
        console.warn('⚠️ Camera permission not granted yet:', permError);
        // Continue anyway, user will be prompted when starting stream
      }

      // Now enumerate devices (with labels if permission was granted)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(videoDevices);
      
      // Set first camera as default if available and no camera is selected
      if (videoDevices.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoDevices[0].deviceId);
        console.log('📹 Default camera selected:', videoDevices[0].deviceId);
      }
      
      console.log('✅ Available cameras:', videoDevices);
    } catch (error) {
      console.error('❌ Error getting available cameras:', error);
      setError('Failed to get video source list. Please check permissions.');
    }
  };

  const loadSavedDevices = async () => {
    try {
      // Use window.location.origin to ensure correct URL (works with nginx reverse proxy)
      const apiUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/api/devices`
        : `${SERVER_URL}/api/devices`;
      
      console.log('📡 [loadSavedDevices] Fetching devices from:', apiUrl);
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        console.error('❌ [loadSavedDevices] Response not OK:', response.status, response.statusText);
        setSavedDevices({});
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.devices) {
        setSavedDevices(data.devices);
        console.log('✅ Loaded saved devices from backend:', data.devices);
        
        // Check if there's a selected device from previous session
        const lastDevice = sessionStorage.getItem('streamDeviceInfo');
        console.log('🔍 [Auto-auth] Last device from session:', lastDevice);
        if (lastDevice) {
          const deviceInfo = JSON.parse(lastDevice);
          console.log('🔍 [Auto-auth] Device info:', deviceInfo);
          console.log('🔍 [Auto-auth] Available devices:', Object.keys(data.devices));
          
          if (data.devices[deviceInfo.cameraName]) {
            console.log('✅ [Auto-auth] Device found in DB, authenticating...');
            setSelectedDevice(deviceInfo.cameraName);
            setCameraName(deviceInfo.cameraName);
            setDeviceIP(deviceInfo.deviceIP);
            setDeviceType(deviceInfo.deviceType);
            setSelectedCameraId(deviceInfo.selectedCameraId || '');
            
            // Auto-authenticate
            setAuthenticated(true);
            setTimeout(() => initializeSocket(), 100);
          } else {
            console.log('⚠️ [Auto-auth] Device not found in DB, but will still try to authenticate');
            // Even if not in DB, try to authenticate with session data
            setSelectedDevice(deviceInfo.cameraName);
            setCameraName(deviceInfo.cameraName);
            setDeviceIP(deviceInfo.deviceIP);
            setDeviceType(deviceInfo.deviceType);
            setSelectedCameraId(deviceInfo.selectedCameraId || '');
            
            // Auto-authenticate
            setAuthenticated(true);
            setTimeout(() => initializeSocket(), 100);
          }
        } else {
          console.log('❌ [Auto-auth] No device in session storage');
        }
      } else {
        setSavedDevices({});
      }
    } catch (error) {
      console.error('❌ Error loading saved devices:', error);
      console.error('❌ Error details:', error.message, error.stack);
      setSavedDevices({});
    }
  };

  const saveDevice = async () => {
    if (!newDevice.cameraName || !newDevice.deviceIP) {
      setError('Please enter device name and IP address');
      return;
    }

    try {
      // Use window.location.origin to ensure correct URL (works with nginx reverse proxy)
      const apiUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/api/devices`
        : `${SERVER_URL}/api/devices`;
      
      console.log('📡 [saveDevice] Saving device to:', apiUrl);
      console.log('📡 [saveDevice] Device data:', newDevice);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cameraName: newDevice.cameraName,
          deviceIP: newDevice.deviceIP,
          deviceType: newDevice.deviceType,
          selectedCameraId: newDevice.selectedCameraId || availableCameras[0]?.deviceId || ''
        }),
      });

      console.log('📡 [saveDevice] Response status:', response.status, response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [saveDevice] Response not OK:', response.status, errorText);
        setError(`Failed to save device: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json();
      console.log('📡 [saveDevice] Response data:', data);

      if (data.success) {
        const deviceKey = newDevice.cameraName;
        
        // Reload devices from backend
        await loadSavedDevices();
        
        // Select the newly added device
        setSelectedDevice(deviceKey);
        setCameraName(newDevice.cameraName);
        setDeviceIP(newDevice.deviceIP);
        setDeviceType(newDevice.deviceType);
        setSelectedCameraId(newDevice.selectedCameraId || '');
        
        // Reset form
        setNewDevice({
          cameraName: '',
          deviceIP: '',
          deviceType: 'samsung_tv',
          selectedCameraId: ''
        });
        setShowAddDevice(false);
        setError('');
        
        console.log('✅ Device saved to backend and selected:', deviceKey);
      } else {
        console.error('❌ [saveDevice] Save failed:', data.error);
        setError(data.error || 'Failed to save device');
      }
    } catch (error) {
      console.error('❌ Error saving device:', error);
      console.error('❌ Error details:', error.message, error.stack);
      setError(`Failed to save device. Please try again. ${error.message}`);
    }
  };

  const deleteDevice = async (deviceKey) => {
    try {
      const apiUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/api/devices/${encodeURIComponent(deviceKey)}`
        : `${SERVER_URL}/api/devices/${encodeURIComponent(deviceKey)}`;
      
      const response = await fetch(apiUrl, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        // Reload devices from backend
        await loadSavedDevices();
        
        if (selectedDevice === deviceKey) {
          setSelectedDevice('');
          setCameraName('');
          setDeviceIP('');
          setDeviceType('samsung_tv');
          setSelectedCameraId('');
        }
        
        console.log('Device deleted from backend:', deviceKey);
      } else {
        setError(data.error || 'Failed to delete device');
      }
    } catch (error) {
      console.error('Error deleting device:', error);
      setError('Failed to delete device. Please try again.');
    }
  };

  const selectDevice = (deviceKey) => {
    const device = savedDevices[deviceKey];
    if (device) {
      setSelectedDevice(deviceKey);
      setCameraName(device.cameraName);
      setDeviceIP(device.deviceIP);
      setDeviceType(device.deviceType || 'samsung_tv');
      
      // Set camera ID from saved device, or use first available if not saved
      const savedCameraId = device.selectedCameraId;
      if (savedCameraId && availableCameras.some(cam => cam.deviceId === savedCameraId)) {
        setSelectedCameraId(savedCameraId);
        console.log('📹 Using saved camera ID:', savedCameraId);
      } else if (availableCameras.length > 0) {
        const defaultCameraId = availableCameras[0].deviceId;
        setSelectedCameraId(defaultCameraId);
        console.log('📹 No saved camera ID, using default:', defaultCameraId);
        
        // Save the default camera ID to device
        saveDeviceInfo(device.cameraName, device.deviceIP, device.deviceType || 'samsung_tv', defaultCameraId);
      } else {
        setSelectedCameraId('');
        console.warn('⚠️ No cameras available');
      }
      
      // Auto-authenticate and start socket
      setAuthenticated(true);
      setTimeout(() => initializeSocket(), 100);
    }
  };

  const saveDeviceInfo = async (cameraName, deviceIP, deviceType, selectedCameraId) => {
    try {
      const deviceInfo = {
        cameraName,
        deviceIP,
        deviceType,
        selectedCameraId,
        timestamp: Date.now()
      };
      sessionStorage.setItem('streamDeviceInfo', JSON.stringify(deviceInfo));
      
      // Also save to backend
      try {
        const apiUrl = typeof window !== 'undefined' 
          ? `${window.location.origin}/api/devices`
          : `${SERVER_URL}/api/devices`;
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cameraName,
            deviceIP,
            deviceType,
            selectedCameraId
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Reload devices from backend
            await loadSavedDevices();
            console.log('Saved device info to backend:', deviceInfo);
          }
        }
      } catch (error) {
        console.error('Error saving device to backend:', error);
      }
      
      console.log('Saved device info:', deviceInfo);
    } catch (error) {
      console.error('Error saving device info:', error);
    }
  };

  const handleAuthenticate = async (e) => {
    e.preventDefault();
    setError('');

    if (!cameraName.trim()) {
      setError('Please select or add a device');
      return;
    }

    if (!deviceIP.trim()) {
      setError('Device IP address is missing');
      return;
    }

    try {
      const apiUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/api/authenticate-stream`
        : `${SERVER_URL}/api/authenticate-stream`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        setAuthenticated(true);
        saveDeviceInfo(cameraName, deviceIP, deviceType, selectedCameraId);
        initializeSocket();
      } else {
        setError('Invalid password');
      }
    } catch (err) {
      setError('Authentication failed. Please try again.');
      console.error('Authentication error:', err);
    }
  };

  const initializeSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    // Configure socket.io to work with nginx reverse proxy
    socketRef.current = io(SERVER_URL, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity, // Keep reconnecting forever
      timeout: 60000, // 60 seconds to match server
      forceNew: false,
      autoConnect: true,
      // Keep connection alive
      withCredentials: false,
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Connected to server');
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log(`✅ Reconnected to server after ${attemptNumber} attempts`);
      // If streaming was active, the connection should resume
      // WebRTC transports should still be active unless they failed
    });

    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}...`);
    });

    socketRef.current.on('reconnect_error', (error) => {
      console.error('❌ Reconnection error:', error);
    });

    socketRef.current.on('reconnect_failed', () => {
      console.error('❌ Reconnection failed - connection lost permanently');
      if (isStreaming) {
        stopStreaming();
      }
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server. Reason:', reason);
      // Don't stop streaming immediately - wait for reconnection
      // Only stop if it's a permanent disconnect (client disconnect)
      if (reason === 'io client disconnect') {
        console.warn('⚠️ Client disconnected, stopping stream...');
        if (isStreaming) {
          stopStreaming();
        }
      } else {
        // Temporary disconnect (ping timeout, transport error, etc.)
        // Socket.IO will automatically reconnect, so don't stop streaming
        console.log('⏳ Temporary disconnect, will reconnect automatically...');
      }
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });

    socketRef.current.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });
  };

  const startStreaming = async () => {
    try {
      setError('');

      // Get current camera ID from device or use selected one
      let cameraIdToUse = selectedCameraId;
      
      // If no camera ID is selected, try to get it from saved device
      if (!cameraIdToUse && cameraName && savedDevices[cameraName]) {
        cameraIdToUse = savedDevices[cameraName].selectedCameraId;
        if (cameraIdToUse) {
          setSelectedCameraId(cameraIdToUse);
          console.log('📹 Using saved camera ID:', cameraIdToUse);
        }
      }
      
      // If still no camera ID, use first available camera
      if (!cameraIdToUse && availableCameras.length > 0) {
        cameraIdToUse = availableCameras[0].deviceId;
        setSelectedCameraId(cameraIdToUse);
        console.log('📹 Using default camera ID:', cameraIdToUse);
        
        // Save this to device
        if (cameraName && deviceIP) {
          saveDeviceInfo(cameraName, deviceIP, deviceType, cameraIdToUse);
        }
      }

      // Build video constraints
      const videoConstraints = {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
      };
      
      // Use specific camera if we have one (use ideal instead of exact for better compatibility)
      if (cameraIdToUse) {
        // First verify the camera still exists
        const cameraExists = availableCameras.some(cam => cam.deviceId === cameraIdToUse);
        if (cameraExists) {
          videoConstraints.deviceId = { ideal: cameraIdToUse };
          console.log('📹 Requesting specific camera:', cameraIdToUse);
        } else {
          console.warn('⚠️ Saved camera ID not found, using default');
          // Remove invalid camera ID, will use default
          cameraIdToUse = null;
        }
      } else {
        console.warn('⚠️ No camera ID specified, using default');
      }
      
      console.log('📹 Requesting media stream with constraints:', videoConstraints);
      
      let stream;
      try {
        // Try with specific constraints first
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (constraintError) {
        // If OverconstrainedError, try without deviceId constraint
        if (constraintError.name === 'OverconstrainedError' || constraintError.name === 'ConstraintNotSatisfiedError') {
          console.warn('⚠️ Camera constraint failed, trying without device ID:', constraintError);
          
          // Remove deviceId constraint and try again
          const fallbackConstraints = {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          };
          
          stream = await navigator.mediaDevices.getUserMedia({
            video: fallbackConstraints,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          
          // Update camera ID to the actual camera used
          const actualCameraId = stream.getVideoTracks()[0]?.getSettings()?.deviceId;
          if (actualCameraId && cameraName && deviceIP) {
            console.log('📹 Updating camera ID to actual:', actualCameraId);
            setSelectedCameraId(actualCameraId);
            saveDeviceInfo(cameraName, deviceIP, deviceType, actualCameraId);
          }
        } else {
          // Re-throw other errors
          throw constraintError;
        }
      }
      
      console.log('✅ Media stream obtained:', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        videoTrackId: stream.getVideoTracks()[0]?.id,
        videoTrackLabel: stream.getVideoTracks()[0]?.label
      });

      localStreamRef.current = stream;

      // Show video preview immediately
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => {
          console.error('Error playing video:', err);
        });
        console.log('✅ Local video stream attached to preview');
      } else {
        console.warn('⚠️ Video ref not available yet');
      }

      // Check socket connection and wait for it to be stable
      if (!socketRef.current) {
        console.error('❌ Socket ref not available');
        setError('Not connected to server. Please wait and try again.');
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
          localStreamRef.current = null;
        }
        return;
      }

      // Wait for socket to be connected and stable
      const waitForSocket = (maxAttempts = 10) => {
        return new Promise((resolve, reject) => {
          let attempts = 0;
          const checkConnection = () => {
            attempts++;
            if (socketRef.current && socketRef.current.connected) {
              console.log('✅ Socket is connected and stable');
              resolve();
            } else if (attempts >= maxAttempts) {
              reject(new Error('Socket connection timeout'));
            } else {
              console.log(`⏳ Waiting for socket connection... (${attempts}/${maxAttempts})`);
              setTimeout(checkConnection, 200);
            }
          };
          checkConnection();
        });
      };

      try {
        await waitForSocket();
      } catch (error) {
        console.error('❌ Socket connection timeout:', error);
        setError('Failed to establish stable connection to server. Please try again.');
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
          localStreamRef.current = null;
        }
        return;
      }
      
      const newDevice = new Device();

      // Double-check socket is still connected before requesting
      if (!socketRef.current || !socketRef.current.connected) {
        console.error('❌ Socket disconnected before RTP capabilities request');
        setError('Lost connection to server. Please try again.');
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
          localStreamRef.current = null;
        }
        return;
      }

      // Wait a bit for socket to be fully stable after connection
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Final check before requesting
      if (!socketRef.current || !socketRef.current.connected) {
        console.error('❌ Socket disconnected before RTP request');
        setError('Connection lost. Please try again.');
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
          localStreamRef.current = null;
        }
        return;
      }

      console.log('📡 Requesting RTP capabilities from server...');
      console.log('📊 Socket ID:', socketRef.current.id);
      console.log('📊 Socket connected:', socketRef.current.connected);
      
      // Add timeout for RTP capabilities response with connection monitoring
      const rtpCapabilitiesPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error('❌ RTP capabilities request timed out');
          reject(new Error('RTP capabilities request timed out'));
        }, 15000); // 15 second timeout
        
        // Monitor connection state
        const checkConnection = setInterval(() => {
          if (!socketRef.current || !socketRef.current.connected) {
            console.error('❌ Socket disconnected during RTP capabilities request');
            clearInterval(checkConnection);
            clearTimeout(timeout);
            reject(new Error('Socket disconnected during RTP capabilities request'));
          }
        }, 200);
        
        console.log('📤 Emitting getRouterRtpCapabilities event...');
        socketRef.current.emit('getRouterRtpCapabilities', (rtpCapabilities) => {
          console.log('📥 Received RTP capabilities response:', rtpCapabilities ? 'Yes' : 'No');
          clearInterval(checkConnection);
          clearTimeout(timeout);
          if (!rtpCapabilities) {
            reject(new Error('No RTP capabilities received'));
          } else {
            resolve(rtpCapabilities);
          }
        });
      });

      let rtpCapabilities;
      try {
        rtpCapabilities = await rtpCapabilitiesPromise;
        console.log('✅ RTP capabilities received');
      } catch (error) {
        console.error('❌ Failed to get RTP capabilities:', error);
        setError(`Failed to get server capabilities: ${error.message}. Please try again.`);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
          localStreamRef.current = null;
        }
        return;
      }
      
      // Continue with the rest of the setup
        try {
          await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
          setDevice(newDevice);
          console.log('✅ Mediasoup device loaded');

          console.log(`📡 [Stream] Registering stream for ${cameraName}...`);
          socketRef.current.emit(
            'registerStream',
            { cameraName, password: password || '' },
            async (response) => {
              console.log(`📥 [Stream] Register stream response:`, {
                success: response.success,
                message: response.message,
                error: response.error
              });

              if (!response.success) {
                console.error(`❌ [Stream] Register stream failed:`, response.message);
                setError(response.message);
                stopStreaming();
                return;
              }
              console.log(`✅ [Stream] Stream registered successfully for ${cameraName}`);

              console.log(`📡 [Stream] Requesting producer transport creation...`);
              socketRef.current.emit('createProducerTransport', async (params) => {
                console.log(`📥 [Stream] Producer transport params received:`, {
                  id: params.id,
                  hasIceParameters: !!params.iceParameters,
                  hasDtlsParameters: !!params.dtlsParameters,
                  iceCandidatesCount: params.iceCandidates?.length || 0,
                  error: params.error
                });
                if (params.error) {
                  console.error(`❌ [Stream] Error creating producer transport:`, params.error);
                  setError(`Failed to create transport: ${params.error}. Please check your network connection and try again.`);
                  stopStreaming();
                  return;
                }

                console.log(`🔨 [Stream] Creating producer transport with params:`, {
                  id: params.id,
                  iceParameters: params.iceParameters,
                  iceCandidates: params.iceCandidates,
                  hasDtlsParameters: !!params.dtlsParameters
                });

                const producerTransport = newDevice.createSendTransport(params);
                console.log(`✅ [Stream] Producer transport created:`, {
                  id: producerTransport.id,
                  closed: producerTransport.closed,
                  connectionState: producerTransport.connectionState,
                  iceGatheringState: producerTransport.iceGatheringState,
                  initialIceCandidatesCount: params.iceCandidates?.length || 0
                });

                // Note: Initial ICE candidates from params are server candidates
                // They don't need to be added to the transport - the transport will use them automatically
                // We only need to handle client-generated candidates (via icecandidate event)

                producerTransport.on(
                  'connect',
                  async ({ dtlsParameters }, callback, errback) => {
                    console.log(`🔐 [Stream] CONNECT event fired - DTLS handshake needed`);
                    try {
                      console.log(`🔐 [Stream] Sending DTLS parameters to server:`, {
                        role: dtlsParameters.role,
                        fingerprints: dtlsParameters.fingerprints?.length || 0
                      });
                      socketRef.current.emit(
                        'connectProducerTransport',
                        { dtlsParameters },
                        (response) => {
                          console.log(`📥 [Stream] DTLS connect response:`, {
                            success: !response.error,
                            error: response.error
                          });
                          if (response.error) {
                            console.error(`❌ [Stream] Error connecting producer transport DTLS:`, response.error);
                            errback(new Error(response.error));
                          } else {
                            console.log(`✅ [Stream] Producer transport DTLS connected successfully!`);
                            callback();
                          }
                        }
                      );
                    } catch (error) {
                      console.error(`❌ [Stream] Exception in connect handler:`, error);
                      errback(error);
                    }
                  }
                );

                producerTransport.on(
                  'produce',
                  async ({ kind, rtpParameters }, callback, errback) => {
                    console.log(`📹 [Stream] PRODUCE event fired for ${kind}:`, {
                      kind: kind,
                      hasRtpParameters: !!rtpParameters,
                      codecMimeType: rtpParameters?.codecs?.[0]?.mimeType,
                      codecClockRate: rtpParameters?.codecs?.[0]?.clockRate
                    });
                    try {
                      console.log(`📡 [Stream] Emitting produce event to server for ${kind}...`);
                      socketRef.current.emit(
                        'produce',
                        {
                          kind,
                          rtpParameters,
                          cameraName,
                          deviceInfo: {
                            deviceIP,
                            deviceType,
                            cameraName
                          }
                        },
                        (response) => {
                          console.log(`📥 [Stream] Produce response for ${kind}:`, {
                            success: !response.error,
                            producerId: response.id,
                            error: response.error
                          });
                          if (response.error) {
                            console.error(`❌ [Stream] Error producing ${kind}:`, response.error);
                            errback(new Error(response.error));
                          } else {
                            console.log(`✅ [Stream] Producer created successfully for ${kind}, ID: ${response.id}`);
                            callback({ id: response.id });
                          }
                        }
                      );
                    } catch (error) {
                      console.error(`❌ [Stream] Exception in produce handler for ${kind}:`, error);
                      errback(error);
                    }
                  }
                );

                producerTransport.on('connectionstatechange', (state) => {
                  const previousState = producerTransportRef.current?.connectionState;
                  console.log(`🔄 [Stream] PRODUCER CONNECTION STATE CHANGE:`, {
                    previous: previousState,
                    current: state,
                    cameraName: cameraName,
                    timestamp: new Date().toISOString()
                  });

                  if (state === 'connected') {
                    console.log(`✅ [Stream] Producer transport CONNECTED for ${cameraName}! 🎉`);
                    producersRef.current.connected = true;
                  } else if (state === 'failed') {
                    console.error(`❌ [Stream] Producer transport FAILED for ${cameraName}!`);
                    console.error(`❌ [Stream] Transport details:`, {
                      id: producerTransport.id,
                      closed: producerTransport.closed,
                      connectionState: producerTransport.connectionState,
                      iceConnectionState: producerTransport.iceConnectionState,
                      iceGatheringState: producerTransport.iceGatheringState
                    });
                    stopStreaming();
                  } else if (state === 'closed') {
                    console.error(`❌ [Stream] Producer transport CLOSED for ${cameraName}`);
                    stopStreaming();
                  } else if (state === 'connecting') {
                    console.log(`⏳ [Stream] Producer transport CONNECTING for ${cameraName}...`);
                  } else {
                    console.log(`ℹ️ [Stream] Producer transport state: ${state} for ${cameraName}`);
                  }
                });

                producerTransport.on('icestatechange', (state) => {
                  console.log(`🧊 [Stream] PRODUCER ICE GATHERING STATE CHANGE for ${cameraName}:`, {
                    state: state,
                    connectionState: producerTransport.connectionState,
                    iceConnectionState: producerTransport.iceConnectionState,
                    timestamp: new Date().toISOString()
                  });

                  if (state === 'complete') {
                    console.log(`✅ [Stream] Producer ICE gathering COMPLETE for ${cameraName}`);
                  } else if (state === 'new') {
                    console.log(`🆕 [Stream] Producer ICE gathering STARTED for ${cameraName}`);
                  } else if (state === 'gathering') {
                    console.log(`🔄 [Stream] Producer ICE gathering IN PROGRESS for ${cameraName}`);
                  }
                });

                // Handle ICE candidates for producer transport (client -> server)
                producerTransport.on('icecandidate', (event) => {
                  if (event.candidate) {
                    console.log(`🧊 [Stream] PRODUCER ICE CANDIDATE generated (client -> server) for ${cameraName}:`, {
                      foundation: event.candidate.foundation,
                      priority: event.candidate.priority,
                      ip: event.candidate.ip,
                      port: event.candidate.port,
                      type: event.candidate.type,
                      protocol: event.candidate.protocol,
                      timestamp: new Date().toISOString()
                    });
                    socketRef.current.emit('producerIceCandidate', {
                      candidate: event.candidate,
                    });
                    console.log(`📤 [Stream] Producer ICE candidate sent to server for ${cameraName}`);
                  } else {
                    console.log(`🧊 [Stream] Producer ICE gathering complete for ${cameraName} (no more candidates)`);
                    socketRef.current.emit('producerIceCandidate', {
                      candidate: null, // null means ICE gathering is complete
                    });
                  }
                });

                // Monitor ICE connection state (critical for debugging)
                producerTransport.on('iceconnectionstatechange', (state) => {
                  console.log(`🧊 [Stream] PRODUCER ICE CONNECTION STATE CHANGE for ${cameraName}:`, {
                    state: state,
                    transportState: producerTransport.connectionState,
                    timestamp: new Date().toISOString()
                  });

                  if (state === 'connected') {
                    console.log(`✅ [Stream] Producer ICE CONNECTED for ${cameraName}! 🎉`);
                  } else if (state === 'failed') {
                    console.error(`❌ [Stream] Producer ICE FAILED for ${cameraName}!`);
                  } else if (state === 'disconnected') {
                    console.warn(`⚠️ [Stream] Producer ICE DISCONNECTED for ${cameraName}`);
                  } else if (state === 'checking') {
                    console.log(`⏳ [Stream] Producer ICE CHECKING for ${cameraName}...`);
                  }
                });

                // Handle server ICE candidates (server -> client)
                socketRef.current.on('newProducerIceCandidate', ({ candidate }) => {
                  try {
                    console.log(`📥 [Stream] Received ICE candidate from server for ${cameraName}:`, {
                      isNull: candidate === null,
                      candidate: candidate ? {
                        foundation: candidate.foundation,
                        priority: candidate.priority,
                        ip: candidate.ip,
                        port: candidate.port,
                        type: candidate.type,
                        protocol: candidate.protocol
                      } : null,
                      timestamp: new Date().toISOString()
                    });

                    if (candidate === null) {
                      console.log(`🧊 [Stream] Producer ICE gathering complete (from server) for ${cameraName}`);
                    } else {
                      console.log(`🔗 [Stream] Adding server producer ICE candidate for ${cameraName}...`);
                      producerTransport.addRemoteCandidate(candidate);
                      console.log(`✅ [Stream] Successfully added server producer ICE candidate for ${cameraName}`);
                    }
                  } catch (error) {
                    console.error(`❌ [Stream] Error adding server producer ICE candidate for ${cameraName}:`, error.message);
                  }
                });

                producerTransportRef.current = producerTransport;

                // Produce video track
                const videoTrack = stream.getVideoTracks()[0];
                console.log(`📹 [Stream] Video track info:`, {
                  hasTrack: !!videoTrack,
                  trackId: videoTrack?.id,
                  trackLabel: videoTrack?.label,
                  trackEnabled: videoTrack?.enabled,
                  trackReadyState: videoTrack?.readyState,
                  trackSettings: videoTrack?.getSettings()
                });

                if (videoTrack) {
                  console.log(`📹 [Stream] Producing video track...`, {
                    transportState: producerTransport.connectionState,
                    transportId: producerTransport.id
                  });
                  const videoProducer = await producerTransport.produce({
                    track: videoTrack,
                  });
                  producersRef.current.video = videoProducer;
                  console.log(`✅ [Stream] Video producer created:`, {
                    id: videoProducer.id,
                    paused: videoProducer.paused,
                    closed: videoProducer.closed,
                    trackId: videoProducer.track?.id,
                    transportState: producerTransport.connectionState
                  });

                  // Monitor video producer state
                  videoProducer.on('transportclose', () => {
                    console.error(`❌ [Stream] Video producer transport closed for ${cameraName}`);
                  });
                  videoProducer.on('trackended', () => {
                    console.error(`❌ [Stream] Video producer track ended for ${cameraName}`);
                  });
                } else {
                  throw new Error('No video track available');
                }

                // Produce audio track
                const audioTrack = stream.getAudioTracks()[0];
                console.log(`🎵 [Stream] Audio track info:`, {
                  hasTrack: !!audioTrack,
                  trackId: audioTrack?.id,
                  trackLabel: audioTrack?.label,
                  trackEnabled: audioTrack?.enabled,
                  trackReadyState: audioTrack?.readyState
                });

                if (audioTrack) {
                  console.log(`🎵 [Stream] Producing audio track...`);
                  const audioProducer = await producerTransport.produce({
                    track: audioTrack,
                  });
                  producersRef.current.audio = audioProducer;
                  console.log(`✅ [Stream] Audio producer created:`, {
                    id: audioProducer.id,
                    paused: audioProducer.paused,
                    closed: audioProducer.closed,
                    trackId: audioProducer.track?.id,
                    transportState: producerTransport.connectionState
                  });

                  // Monitor audio producer state
                  audioProducer.on('transportclose', () => {
                    console.error(`❌ [Stream] Audio producer transport closed for ${cameraName}`);
                  });
                  audioProducer.on('trackended', () => {
                    console.error(`❌ [Stream] Audio producer track ended for ${cameraName}`);
                  });
                } else {
                  console.warn(`⚠️ [Stream] No audio track available, continuing with video only`);
                }

                // Set streaming state after everything is successful
                console.log(`✅ [Stream] Setting isStreaming to true for ${cameraName}`);
                console.log(`✅ [Stream] Stream started successfully! Summary:`, {
                  cameraName: cameraName,
                  transportId: producerTransport.id,
                  transportState: producerTransport.connectionState,
                  videoProducerId: producersRef.current.video?.id,
                  audioProducerId: producersRef.current.audio?.id,
                  hasVideoProducer: !!producersRef.current.video,
                  hasAudioProducer: !!producersRef.current.audio,
                  timestamp: new Date().toISOString()
                });
                setIsStreaming(true);
                setError(''); // Clear any previous errors
                isAutoStartingRef.current = false; // Reset auto-start flag on success

                // Monitor transport stats periodically and check connection state
                const transportStatsInterval = setInterval(async () => {
                  try {
                    if (producerTransport.closed) {
                      clearInterval(transportStatsInterval);
                      return;
                    }
                    
                    const currentState = producerTransport.connectionState;
                    const iceConnectionState = producerTransport.iceConnectionState;
                    const iceGatheringState = producerTransport.iceGatheringState;
                    
                    console.log(`📊 [Stream] Producer transport stats for ${cameraName}:`, {
                      connectionState: currentState,
                      iceConnectionState: iceConnectionState,
                      iceGatheringState: iceGatheringState,
                      timestamp: new Date().toISOString()
                    });
                    
                    // Check if connection state changed (sometimes event doesn't fire)
                    if (currentState === 'connected' && !producersRef.current.connected) {
                      console.log(`✅ [Stream] Producer transport CONNECTED detected via polling for ${cameraName}!`);
                      producersRef.current.connected = true;
                    } else if (currentState === 'failed' && producersRef.current.connected !== false) {
                      console.error(`❌ [Stream] Producer transport FAILED detected via polling for ${cameraName}!`);
                      producersRef.current.connected = false;
                      // Don't stop streaming immediately - let it try to recover
                    }
                  } catch (e) {
                    if (producerTransport.closed) {
                      clearInterval(transportStatsInterval);
                      return;
                    }
                    console.error(`❌ [Stream] Transport stats error:`, e);
                  }
                }, 3000); // Check every 3 seconds instead of 5

                producerTransport.on('transportclose', () => {
                  console.error(`❌ [Stream] Producer transport closed event for ${cameraName}`);
                  clearInterval(transportStatsInterval);
                });
              });
            }
          );
        } catch (error) {
        console.error('❌ Error loading device:', error);
        setError(`Failed to initialize streaming: ${error.message}`);
          stopStreaming();
        }
    } catch (err) {
      console.error('❌ Error starting stream:', err);
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to access video source. ';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage += 'Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage += 'No camera found. Please connect a camera and try again.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage += 'Camera is being used by another application. Please close other apps and try again.';
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        errorMessage += 'Camera constraints could not be satisfied. Please try again with default settings.';
      } else if (err.message) {
        errorMessage += err.message;
      } else {
        errorMessage += 'Please check permissions and try again.';
      }
      
      setError(errorMessage);
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsStreaming(false);
    }
  };

  // Auto-retry logic for infinite reconnection
  const scheduleAutoRetry = () => {
    // Clear any existing retry timer
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
    }

    // Don't retry if socket is disconnected
    if (!socketRef.current || !socketRef.current.connected) {
      console.log('⚠️ [Auto-retry] Socket not connected, waiting for reconnection...');
      // Check again in 2 seconds
      autoRetryTimerRef.current = setTimeout(() => {
        scheduleAutoRetry();
      }, 2000);
      return;
    }

    retryAttemptsRef.current++;
    console.log(`🔄 [Auto-retry] Attempt ${retryAttemptsRef.current}: Retrying stream in 5 seconds...`);

    autoRetryTimerRef.current = setTimeout(async () => {
      console.log(`🔄 [Auto-retry] Starting retry attempt ${retryAttemptsRef.current}...`);
      
      // Reset retry counter on successful connection
      retryAttemptsRef.current = 0;
      
      try {
        await startStreaming();
        console.log('✅ [Auto-retry] Stream restarted successfully');
      } catch (error) {
        console.error('❌ [Auto-retry] Retry failed:', error);
        // Schedule another retry
        scheduleAutoRetry();
      }
    }, 5000); // Wait 5 seconds before retry
  };

  const stopStreaming = async () => {
    console.log('Stopping streaming...');
    
    // Don't schedule auto-retry if already cleaning up
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
    }
    
    try {
    Object.values(producersRef.current).forEach((producer) => {
        try {
      producer.close();
          console.log('Producer closed:', producer.id);
        } catch (error) {
          console.error('Error closing producer:', error);
        }
    });
    producersRef.current = {};

    if (producerTransportRef.current) {
        try {
      producerTransportRef.current.close();
          console.log('Transport closed');
        } catch (error) {
          console.error('Error closing transport:', error);
        }
      producerTransportRef.current = null;
    }

    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
            console.log('Track stopped:', track.kind);
          } catch (error) {
            console.error('Error stopping track:', error);
          }
        });
      localStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

      await new Promise(resolve => setTimeout(resolve, 500));

    setIsStreaming(false);
      console.log('Streaming stopped successfully');
      
      // Schedule auto-retry after stopping
      console.log('🔄 [Auto-retry] Scheduling automatic stream restart...');
      scheduleAutoRetry();
    } catch (error) {
      console.error('Error in stopStreaming:', error);
      setIsStreaming(false);
      
      // Schedule auto-retry even on error
      scheduleAutoRetry();
    }
  };

  const toggleAudioMute = () => {
    const audioProducer = producersRef.current.audio;
    if (audioProducer) {
      if (isAudioMuted) {
        audioProducer.resume();
        setIsAudioMuted(false);
        console.log('Audio unmuted');
      } else {
        audioProducer.pause();
        setIsAudioMuted(true);
        console.log('Audio muted');
      }
    }
  };

  const handleBackToLogin = () => {
    stopStreaming();
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    navigate('/login');
  };

  // Show device selection screen if not authenticated and no device selected
  if (!authenticated) {
    return (
      <div className="stream-container">
        <div className="stream-card">
          <div className="stream-header">
            <h1>Connect TV Device for Testing</h1>
            <p>Select a device or add a new one to begin remote testing session</p>
          </div>

          {/* Device Selection */}
          <div className="device-selection">
            <div className="device-list-header">
              <h3>Available Devices</h3>
              <button 
                onClick={() => setShowAddDevice(!showAddDevice)}
                className="btn btn-add"
              >
                {showAddDevice ? '❌ Cancel' : '➕ Add Device'}
              </button>
            </div>

            {/* Add Device Form */}
            {showAddDevice && (
              <div className="device-add-form">
            <div className="form-group">
                  <label htmlFor="newCameraName">Device Name</label>
              <input
                type="text"
                    id="newCameraName"
                    value={newDevice.cameraName}
                    onChange={(e) => setNewDevice({...newDevice, cameraName: e.target.value})}
                    placeholder="e.g., Living Room TV"
                required
              />
            </div>
                
            <div className="form-group">
                  <label htmlFor="newDeviceIP">Device IP Address</label>
              <input
                    type="text"
                    id="newDeviceIP"
                    value={newDevice.deviceIP}
                    onChange={(e) => setNewDevice({...newDevice, deviceIP: e.target.value})}
                    placeholder="e.g., 192.168.0.147"
                required
              />
            </div>
                
                <div className="form-group">
                  <label htmlFor="newDeviceType">Device Type</label>
                  <select
                    id="newDeviceType"
                    value={newDevice.deviceType}
                    onChange={(e) => setNewDevice({...newDevice, deviceType: e.target.value})}
                    className="device-select"
                    required
                  >
                    <option value="samsung_tv">Samsung TV</option>
                    <option value="lg_tv">LG TV</option>
                    <option value="android">Android TV</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="newCameraSelect">Camera</label>
                  <select
                    id="newCameraSelect"
                    value={newDevice.selectedCameraId}
                    onChange={(e) => setNewDevice({...newDevice, selectedCameraId: e.target.value})}
                    className="device-select"
                  >
                    {availableCameras.map((camera, index) => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label || `Camera ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-actions">
                  <button onClick={saveDevice} className="btn btn-primary">
                    Save Device
            </button>
                </div>
              </div>
            )}

            {/* Device List */}
            <div className="device-list">
              {Object.keys(savedDevices).length === 0 ? (
                <div className="no-devices">
                  <p>No devices saved. Add a device to get started.</p>
                </div>
              ) : (
                Object.entries(savedDevices).map(([key, device]) => (
                  <div key={key} className={`device-item ${selectedDevice === key ? 'selected' : ''}`}>
                    <div className="device-info" onClick={() => selectDevice(key)}>
                      <h4>{device.cameraName}</h4>
                      <p>{device.deviceIP} • {device.deviceType}</p>
                    </div>
                    <div className="device-actions">
                      <button 
                        onClick={() => deleteDevice(key)}
                        className="btn btn-delete"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
          
          <div className="stream-footer">
            <button onClick={handleBackToLogin} className="btn btn-secondary">
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Streaming interface
  return (
    <div className="stream-container">
      <div className="stream-live">
        <div className="stream-live-header">
          <div>
            <h1>Testing Device: {cameraName}</h1>
            <span className={`status ${isStreaming ? 'live' : ''}`}>
              {isStreaming ? '🔴 LIVE' : '⚫ Offline'}
            </span>
          </div>
          <div className="stream-controls">
            {isStreaming ? (
              <span className="status live">🔴 Live Streaming (Auto-reconnect enabled)</span>
            ) : (
              <span className="status">⏳ Connecting...</span>
            )}
            
            <button onClick={handleBackToLogin} className="btn btn-secondary">
              Exit
            </button>
          </div>
        </div>
        
        {availableCameras.length > 0 && (
          <div className="camera-switcher">
            <label htmlFor="liveCameraSelect">
              📹 Select Video Source: 
            </label>
            <select
              id="liveCameraSelect"
              value={selectedCameraId}
              onChange={async (e) => {
                const newCameraId = e.target.value;
                setSelectedCameraId(newCameraId);
                saveDeviceInfo(cameraName, deviceIP, deviceType, newCameraId);
                
                if (isStreaming) {
                  console.log('Switching camera to:', newCameraId);
                  await stopStreaming();
                  setTimeout(() => startStreaming(), 500);
                }
              }}
              className="camera-switcher-select"
            >
              {availableCameras.map((camera, index) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}
        
        <div className="video-preview">
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline 
            controls={false}
            className="preview-video"
          />
          {!isStreaming && (
            <div className="video-placeholder">
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
              <p>Click "Start Streaming" to begin</p>
            </div>
          )}
        </div>
        {error && <div className="error-message">{error}</div>}
      </div>
    </div>
  );
}

export default Stream;
