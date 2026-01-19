import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft, RefreshCw, Volume2, Volume1, VolumeX, Camera, Video as VideoIcon, X, RotateCcw, Bell
} from 'lucide-react';
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import TVRemote from '../components/TVRemote';
import NotificationBell from '../../dashboard/components/NotificationBell';
import ActionLogs from '../components/ActionLogs';

const StreamViewPage = () => {
    const { deviceId } = useParams();
    const navigate = useNavigate();
    const remoteVideoRef = useRef(null);
    const socketRef = useRef(null);
    const peerConnection = useRef(null);
    const videoDropdownRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordingChunksRef = useRef([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [device, setDevice] = useState(null);
    const [sessionTime, setSessionTime] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [showRecordDropdown, setShowRecordDropdown] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingMode, setRecordingMode] = useState(null); // 'full' or 'tv'
    const [isMuted, setIsMuted] = useState(true);
    const [notifications, setNotifications] = useState([]);

    // Remote control state
    const [remoteSessionId, setRemoteSessionId] = useState(null);
    const [isRemoteConnected, setIsRemoteConnected] = useState(false);

    // Action logs state
    const [actionLogs, setActionLogs] = useState([]);

    const fetchDeviceDetails = async () => {
        try {
            const token = localStorage.getItem('token');
            console.log('🔍 [StreamView] Attempting to fetch device details. Token present:', !!token);

            if (!token) {
                console.error('❌ [StreamView] No token found in localStorage');
                setError('Authentication required. Please login again.');
                return;
            }

            const url = `${import.meta.env.VITE_API_BASE_URL}/devices/${deviceId}`;
            addActionLog(`Fetching device details from: ${url}`, 'info');

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                console.error('❌ [StreamView] API returned 401 Unauthorized');
                setError('Your session has expired. Please login again.');
                return;
            }

            if (response.ok) {
                const data = await response.json();
                console.log('✅ [StreamView] Device details fetched successfully:', data.device.name);
                setDevice(data.device);
            }
        } catch (err) {
            console.error('❌ [StreamView] Error fetching device:', err);
        }
    };

    useEffect(() => {
        fetchDeviceDetails();

        // Reset loading state when component mounts/reconnects
        setLoading(true);
        setError(null);
        setIsConnected(false);

        // Get user details from localStorage (saved during login)
        const userId = localStorage.getItem('userId');
        const userName = localStorage.getItem('userName') || '';
        const userEmail = localStorage.getItem('userEmail') || '';
        const currentUserId = userId; // Store for use in socket listeners

        // Validate user details from localStorage
        if (!userId) {
            console.error('❌ Missing userId in localStorage');
            setError('Authentication required. Please login again.');
            setLoading(false);
            return;
        }

        console.log('✅ Using user details from localStorage:', {
            id: userId,
            name: userName,
            email: userEmail
        });

        // Connect to socket using userId from localStorage
        // Create fresh socket connection
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        socketRef.current = io(import.meta.env.VITE_SOCKET_URL);

        // Wait for socket to connect before emitting
        socketRef.current.on('connect', () => {
            console.log('✅ Socket.IO connected');
            socketRef.current.emit('join-stream', {
                deviceId,
                isStreamer: false,
                userId: userId // Use userId from localStorage
            });
        });

        // Create fresh peer connection (close old one if exists)
        if (peerConnection.current) {
            try {
                peerConnection.current.close();
            } catch (e) {
                console.error('Error closing old peer connection:', e);
            }
        }

        peerConnection.current = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Setup peer connection handlers
        const setupPeerConnectionHandlers = (verifiedUserId) => {
            if (!peerConnection.current) return;

            peerConnection.current.oniceconnectionstatechange = () => {
                const state = peerConnection.current.iceConnectionState;
                console.log('🧊 ICE Connection State:', state);
                const wasConnected = isConnected;

                if (state === 'connected' || state === 'completed') {
                    setIsConnected(true);
                    // Notify backend that WebRTC connection is established
                    if (!wasConnected && socketRef.current) {
                        console.log('✅ WebRTC connected - notifying backend');
                        socketRef.current.emit('viewer-webrtc-connected', { deviceId, userId: verifiedUserId });
                    }

                    // Ensure video plays when connection is established
                    if (remoteVideoRef.current && remoteVideoRef.current.srcObject && remoteVideoRef.current.paused) {
                        console.log('▶️ Attempting to play video after connection established');
                        remoteVideoRef.current.play().catch(err => {
                            console.error('Error playing video after connection:', err);
                        });
                    }
                } else {
                    setIsConnected(false);
                    // Notify backend that WebRTC connection is lost
                    if (wasConnected && socketRef.current) {
                        console.log('❌ WebRTC disconnected - notifying backend');
                        socketRef.current.emit('viewer-webrtc-disconnected', { deviceId, userId: verifiedUserId });
                    }
                }
                if (state === 'failed') {
                    setError('ICE Connection failed. Check network components.');
                }
            };

            peerConnection.current.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('📤 Sending ICE candidate to streamer');
                    if (socketRef.current) {
                        socketRef.current.emit('ice-candidate', {
                            to: 'streamer',
                            candidate: event.candidate,
                            deviceId
                        });
                    }
                }
            };

            peerConnection.current.ontrack = (event) => {
                console.log('🎥 Received remote track:', event);
                console.log('📹 Track details:', {
                    kind: event.track.kind,
                    id: event.track.id,
                    enabled: event.track.enabled,
                    readyState: event.track.readyState,
                    streams: event.streams.length
                });

                if (event.streams && event.streams.length > 0 && remoteVideoRef.current) {
                    console.log('✅ Setting video source from stream');
                    const stream = event.streams[0];
                    remoteVideoRef.current.srcObject = stream;

                    // Clear loading immediately when stream is attached
                    setLoading(false);
                    setError(null);
                    console.log('✅ Video stream attached to element');

                    // Explicitly play the video
                    const playPromise = remoteVideoRef.current.play();
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            console.log('✅ Video playback started successfully');
                            setLoading(false); // Ensure loading is cleared
                        }).catch(err => {
                            console.error('❌ Error playing video:', err);
                            // Try unmuting and playing again (some browsers require user interaction)
                            remoteVideoRef.current.muted = true;
                            remoteVideoRef.current.play().then(() => {
                                console.log('✅ Video playback started after unmuting');
                                setLoading(false);
                            }).catch(err2 => {
                                console.error('❌ Still failed to play video:', err2);
                                setError('Video loaded but failed to play. Please interact with the page.');
                                setLoading(false);
                            });
                        });
                    } else {
                        // If play() returns undefined, video should auto-play
                        setLoading(false);
                    }
                } else {
                    console.warn('⚠️ No streams in track event or video element missing');
                }
            };
        };

        // Set up peer connection handlers
        setupPeerConnectionHandlers(userId);

        // Setup socket event handlers
        const setupSocketEventHandlers = (verifiedUserId) => {
            if (!socketRef.current) return;

            socketRef.current.on('offer', async ({ from, offer }) => {
                console.log('📨 Received offer from streamer:', from);
                console.log('📋 Offer details:', { type: offer.type, sdp: offer.sdp?.substring(0, 100) });
                try {
                    // Ensure peer connection exists
                    if (!peerConnection.current) {
                        console.log('⚠️ Peer connection missing, recreating...');
                        peerConnection.current = new RTCPeerConnection({
                            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                        });

                        // Re-setup event handlers
                        peerConnection.current.ontrack = (event) => {
                            console.log('🎥 Received remote track:', event);
                            console.log('📹 Track details:', {
                                kind: event.track.kind,
                                id: event.track.id,
                                enabled: event.track.enabled,
                                readyState: event.track.readyState,
                                streams: event.streams.length
                            });

                            if (event.streams && event.streams.length > 0 && remoteVideoRef.current) {
                                console.log('✅ Setting video source from stream');
                                remoteVideoRef.current.srcObject = event.streams[0];
                                setLoading(false);
                                setError(null);
                                console.log('✅ Video stream attached to element');

                                // Play the video
                                remoteVideoRef.current.play().catch(err => {
                                    console.error('Error playing video:', err);
                                });
                            } else {
                                console.warn('⚠️ No streams in track event');
                            }
                        };

                        peerConnection.current.oniceconnectionstatechange = () => {
                            const state = peerConnection.current.iceConnectionState;
                            console.log('🧊 ICE Connection State:', state);
                            if (state === 'connected' || state === 'completed') {
                                setIsConnected(true);
                                if (socketRef.current) {
                                    socketRef.current.emit('viewer-webrtc-connected', { deviceId, userId: verifiedUserId });
                                }
                            } else {
                                setIsConnected(false);
                            }
                            if (state === 'failed') {
                                setError('ICE Connection failed. Check network components.');
                                setLoading(false);
                            }
                        };
                    }

                    console.log('📥 Setting remote description...');
                    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
                    console.log('✅ Remote description set');

                    console.log('📝 Creating answer...');
                    const answer = await peerConnection.current.createAnswer();
                    console.log('✅ Answer created');

                    console.log('📤 Setting local description...');
                    await peerConnection.current.setLocalDescription(answer);
                    console.log('✅ Local description set');

                    console.log('📨 Sending answer to streamer');
                    socketRef.current.emit('answer', { to: from, answer, deviceId });
                    setLoading(true); // Show loading while establishing connection
                } catch (err) {
                    console.error('❌ Error handling offer:', err);
                    setError(`Failed to establish connection: ${err.message}`);
                    setLoading(false);
                }
            });

            socketRef.current.on('ice-candidate', ({ candidate }) => {
                console.log('📨 Received ICE candidate from streamer');
                if (candidate) {
                    peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate))
                        .catch(e => console.error('❌ Error adding candidate:', e));
                }
            });

            socketRef.current.on('streamer-disconnected', () => {
                console.log('⚠️ Streamer disconnected');
                setError('Streamer disconnected');
                setLoading(false);
                setIsConnected(false);
                // Clear video source
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = null;
                }
                // Close peer connection
                if (peerConnection.current) {
                    try {
                        peerConnection.current.close();
                        peerConnection.current = null;
                    } catch (e) {
                        console.error('Error closing peer connection on disconnect:', e);
                    }
                }
            });

            socketRef.current.on('streamer-ready', () => {
                console.log('📡 Streamer is now ready. Requesting connection...');
                setLoading(true); // Show loading while establishing connection
                setError(null);
                socketRef.current.emit('request-connection', { deviceId });
            });

            socketRef.current.on('streamer-present', () => {
                console.log('📡 Streamer is already present in room. Checking status...');
                setLoading(true); // Show loading while establishing connection
                setError(null);
                socketRef.current.emit('request-connection', { deviceId });
            });

            socketRef.current.on('viewer-rejected', ({ reason }) => {
                console.log('⚠️ Viewer connection rejected:', reason);
                setError(reason || 'Device is already in use by another user');
                setLoading(false);
                // Navigate back to dashboard after a delay
                setTimeout(() => {
                    navigate('/dashboard');
                }, 3000);
            });

            socketRef.current.on('stream-heartbeat', () => {
                console.log('💓 Stream heartbeat received from streamer');
            });

            // Listen for connection requests (when user is the streamer or connected viewer)
            if (verifiedUserId) {
                socketRef.current.on(`request-received-${verifiedUserId}`, (request) => {
                    console.log('🔔 Request Received:', request);

                    // Add to notifications list
                    const notification = {
                        id: request.requestId || Date.now().toString(),
                        type: 'connection_request',
                        requesterName: request.requesterName || 'Unknown User',
                        deviceName: request.deviceName || device?.name || 'Device',
                        message: request.message || '',
                        timestamp: request.timestamp || new Date().toISOString(),
                        status: 'pending',
                        read: false,
                        requestId: request.requestId,
                        deviceId: request.deviceId || deviceId
                    };

                    setNotifications(prev => [notification, ...prev]);

                    // Optional: Play sound notification
                    new Audio('/notification.mp3').play().catch(e => console.log('Audio play failed', e));
                });
            }

            // Listen for force disconnect (when request is approved)
            if (verifiedUserId) {
                socketRef.current.on(`force-disconnect-${verifiedUserId}`, ({ deviceId: disconnectedDeviceId }) => {
                    console.log('⚠️ Force disconnect received for device:', disconnectedDeviceId);
                    if (disconnectedDeviceId === deviceId) {
                        // Clear viewer connection
                        const clearViewer = async () => {
                            try {
                                const token = localStorage.getItem('token');
                                if (token) {
                                    await fetch(`${import.meta.env.VITE_API_BASE_URL}/devices/${deviceId}/clear-viewer`, {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                        }
                                    });
                                    console.log('✅ Viewer cleared from device');
                                }
                            } catch (err) {
                                console.error('❌ Error clearing viewer:', err);
                            }
                        };

                        clearViewer();

                        // Close peer connection
                        if (peerConnection.current) {
                            try {
                                peerConnection.current.close();
                                peerConnection.current = null;
                            } catch (e) {
                                console.error('Error closing peer connection:', e);
                            }
                        }

                        // Navigate to dashboard
                        navigate('/dashboard');
                    }
                });
            }

            // Listen for admin disconnect
            socketRef.current.on('admin-disconnected-device', ({ deviceId: disconnectedDeviceId, adminName, message }) => {
                console.log('⚠️ Admin disconnected device:', disconnectedDeviceId);
                if (disconnectedDeviceId === deviceId) {
                    // Show notification
                    toast.error(message || `Admin (${adminName}) has disconnected the connection device`, {
                        duration: 5000,
                        position: 'top-center'
                    });

                    // Clear viewer connection
                    const clearViewer = async () => {
                        try {
                            const token = localStorage.getItem('token');
                            if (token) {
                                await fetch(`${import.meta.env.VITE_API_BASE_URL}/devices/${deviceId}/clear-viewer`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    }
                                });
                                console.log('✅ Viewer cleared from device');
                            }
                        } catch (err) {
                            console.error('❌ Error clearing viewer:', err);
                        }
                    };

                    clearViewer();

                    // Disconnect remote control
                    if (remoteSessionId) {
                        disconnectDevice();
                    }

                    // Close peer connection
                    if (peerConnection.current) {
                        try {
                            peerConnection.current.close();
                            peerConnection.current = null;
                        } catch (e) {
                            console.error('Error closing peer connection:', e);
                        }
                    }

                    // Navigate to dashboard
                    setTimeout(() => {
                        navigate('/dashboard');
                    }, 1000);
                }
            });
        };

        // Set up socket event handlers
        setupSocketEventHandlers(userId);

        // Listen for device-specific logs (filtered by deviceId)
        const currentDeviceId = device?.name || device?.id; // Use device name as deviceId (matches backend)
        if (currentDeviceId && socketRef.current) {
            const deviceLogHandler = (logEntry) => {
                console.log('📋 [StreamView] Received device log:', logEntry);
                // Add log for current device only (backend already filters by deviceId)
                addActionLog(logEntry.message, logEntry.type || 'info');
            };

            socketRef.current.on(`device-log-${currentDeviceId}`, deviceLogHandler);

            // Cleanup listener on unmount
            return () => {
                if (socketRef.current) {
                    socketRef.current.off(`device-log-${currentDeviceId}`, deviceLogHandler);
                }
            };
        }


        const handleClickOutside = (event) => {
            if (videoDropdownRef.current && !videoDropdownRef.current.contains(event.target)) {
                setShowRecordDropdown(false);
            }
        };

        const timer = setInterval(() => {
            setSessionTime(prev => prev + 1);
        }, 1000);

        document.addEventListener('mousedown', handleClickOutside);

        // Handle browser close/tab close - cleanup immediately
        const handleBeforeUnload = async () => {
            console.log('🛑 Browser closing - cleaning up viewer...');
            // Clear viewer immediately using fetch with keepalive (more reliable than sendBeacon for POST)
            const token = localStorage.getItem('token');
            if (token) {
                // Use fetch with keepalive for reliable cleanup on browser close
                fetch(`${import.meta.env.VITE_API_BASE_URL}/devices/${deviceId}/clear-viewer`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({}),
                    keepalive: true // Ensures request completes even if page closes
                }).catch(err => console.error('Error clearing viewer on close:', err));
            } else {
                // Try without auth (for sendBeacon fallback)
                fetch(`${import.meta.env.VITE_API_BASE_URL}/devices/${deviceId}/clear-viewer`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({}),
                    keepalive: true
                }).catch(err => console.error('Error clearing viewer on close (no auth):', err));
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('pagehide', handleBeforeUnload);

        return () => {
            // Cleanup on unmount (user closes tab/window)
            console.log('🧹 Cleaning up viewer page...');

            // Remove event listeners
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('pagehide', handleBeforeUnload);

            clearInterval(timer);
            document.removeEventListener('mousedown', handleClickOutside);

            // Clear connected viewer immediately when viewer disconnects
            const clearViewer = async () => {
                try {
                    const token = localStorage.getItem('token');
                    if (token) {
                        await fetch(`${import.meta.env.VITE_API_BASE_URL}/devices/${deviceId}/clear-viewer`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        console.log('✅ Viewer cleared from device');
                    }
                } catch (err) {
                    console.error('❌ Error clearing viewer:', err);
                }
            };

            // Clear viewer before closing connections
            clearViewer();

            // Close peer connection
            if (peerConnection.current) {
                try {
                    peerConnection.current.close();
                } catch (e) {
                    console.error('Error closing peer connection:', e);
                }
            }

            // Stop any active recording
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try {
                    mediaRecorderRef.current.stop();
                } catch (e) {
                    console.error('Error stopping recorder:', e);
                }
            }

            // Disconnect socket last
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [deviceId]);

    const downloadImage = (dataUrl, filename) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadVideo = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(link);
    };

    const startRecording = async (mode) => {
        try {
            let stream;
            if (mode === 'full') {
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: "always" },
                    audio: true
                });
            } else {
                // TV Screen mode - capture from the video element
                if (!remoteVideoRef.current) return;
                stream = remoteVideoRef.current.captureStream();
            }

            recordingChunksRef.current = [];
            const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9'
            });

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordingChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' });
                downloadVideo(blob, `${mode}-recording-${Date.now()}.webm`);

                // Stop all tracks in the stream if it was a display capture
                if (mode === 'full') {
                    stream.getTracks().forEach(track => track.stop());
                }

                setIsRecording(false);
                setRecordingMode(null);
            };

            mediaRecorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);
            setRecordingMode(mode);
            setShowRecordDropdown(false);
        } catch (err) {
            console.error('❌ Error starting recording:', err);
            alert('Could not start recording. Please ensure you grant necessary permissions.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
    };

    const toggleAudio = () => {
        if (remoteVideoRef.current) {
            const newMutedState = !isMuted;
            remoteVideoRef.current.muted = newMutedState;
            setIsMuted(newMutedState);
            console.log('🔊 Audio toggled:', newMutedState ? 'Muted' : 'Unmuted');
        }
    };

    const captureTVScreen = () => {
        if (!remoteVideoRef.current) return;
        const video = remoteVideoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        downloadImage(canvas.toDataURL('image/png'), `tv-screen-${Date.now()}.png`);
    };

    const formatTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleMarkNotificationAsRead = (notificationId) => {
        setNotifications(prev => prev.map(n =>
            n.id === notificationId ? { ...n, read: true } : n
        ));
    };

    const handleNotificationClick = (notification) => {
        // Mark as read when clicked
        if (!notification.read) {
            handleMarkNotificationAsRead(notification.id);
        }
    };

    const handleApproveRequest = async (notification) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/requests/respond`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ requestId: notification.requestId, status: 'approved' })
            });

            if (response.ok) {
                setNotifications(prev => prev.map(n =>
                    n.id === notification.id ? { ...n, status: 'approved', read: true } : n
                ));
            }
        } catch (error) {
            console.error('Error approving request:', error);
        }
    };

    const handleRejectRequest = async (notification) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/requests/respond`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ requestId: notification.requestId, status: 'rejected', reason: 'No reason provided' })
            });

            if (response.ok) {
                setNotifications(prev => prev.map(n =>
                    n.id === notification.id ? { ...n, status: 'rejected', read: true } : n
                ));
            }
        } catch (error) {
            console.error('Error rejecting request:', error);
        }
    };

    // ========== ACTION LOGS FUNCTIONS ==========
    const addActionLog = (message, type = 'info') => {
        const currentDeviceId = device?.name || device?.id; // Use device name as deviceId

        const newLog = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
            message,
            type,
            deviceId: currentDeviceId
        };
        setActionLogs(prev => [...prev, newLog]);
    };

    // ========== REMOTE CONTROL FUNCTIONS ==========

    // Check session status from Python backend
    const checkSessionStatus = async (sessionId) => {
        if (!sessionId) return false;

        try {
            const url = `${import.meta.env.VITE_PYTHON_BACKEND_URL}/sessions/${sessionId}/status`;
            // Log full API URL to UI as requested
            addActionLog(`Checking session status API: ${url}`, 'info');
            // Only log this if debugging is needed, otherwise it might be too noisy. 
            // But since user asked for "which api it is calling", we will log it on failure or initial check.
            console.log(`🔍 [Frontend] Checking status at: ${url}`);

            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const isConnected = data.connected === true && data.status === 'connected';
                console.log('📊 [Frontend] Session status check:', { sessionId, isConnected, status: data.status });
                if (isConnected) {
                    // Only log on change or initial connection to avoid spamming, but for now log verbose for debugging
                    // addActionLog(`TV verification: Connected (Status: ${data.status})`, 'success'); 
                }
                return isConnected;
            } else {
                console.warn('⚠️ [Frontend] Session status check failed:', response.status);
                addActionLog(`TV verification failed: Session status check returned ${response.status}`, 'warning');
                return false;
            }
        } catch (error) {
            console.error('❌ [Frontend] Error checking session status:', error);
            return false;
        }
    };

    // Check existing session for device
    const checkExistingSession = async (deviceData) => {
        if (!socketRef.current) {
            console.error('❌ Socket not available for session check');
            return false;
        }

        return new Promise((resolve) => {
            console.log('🔍 [Frontend] Checking existing session for device:', deviceData);
            socketRef.current.emit('checkExistingSession', { deviceData }, async (response) => {
                console.log('📥 [Frontend] Session check response:', response);
                if (response && response.success && response.exists && response.session) {
                    const sessionId = response.session.sessionId;
                    console.log('✅ [Frontend] Found existing session:', sessionId);

                    // Verify TV is actually connected before marking as connected
                    const isConnected = await checkSessionStatus(sessionId);
                    if (isConnected) {
                        setRemoteSessionId(sessionId);
                        setIsRemoteConnected(true);
                        const userName = localStorage.getItem('userName') || 'User';
                        addActionLog(`Session Started - Connected to ${device?.name || 'Device'}`, 'info');
                        resolve(true);
                    } else {
                        console.warn('⚠️ [Frontend] Existing session found but TV is not connected');
                        setRemoteSessionId(null);
                        setIsRemoteConnected(false);
                        addActionLog('TV is off or unreachable. Please turn on the TV and reconnect.', 'error');
                        resolve(false);
                    }
                } else {
                    console.log('ℹ️ [Frontend] No existing session found');
                    resolve(false);
                }
            });
        });
    };

    // Connect to device via Python API (through Node.js backend)
    const connectToDevice = async (deviceData) => {
        if (!socketRef.current) {
            console.error('❌ Socket not available');
            return false;
        }

        return new Promise((resolve) => {
            addActionLog(`Initiating connection to ${deviceData.deviceType} at ${deviceData.deviceIP}...`, 'info');
            console.log('🔗 [Frontend] Connecting to device for remote control:', deviceData);

            socketRef.current.emit('connectDevice', { deviceData }, async (response) => {
                console.log('📥 [Frontend] Received connection response:', response);

                if (response && response.success && response.sessionId) {
                    const sessionId = response.sessionId;
                    console.log('✅ [Frontend] Connected to device for remote control. SessionId:', sessionId);
                    addActionLog(`Socket connection successful. Session ID: ${sessionId}`, 'success');
                    addActionLog('Verifying TV status...', 'info');

                    // Verify TV is actually connected before marking as connected
                    const isConnected = await checkSessionStatus(sessionId);
                    if (isConnected) {
                        setRemoteSessionId(sessionId);
                        setIsRemoteConnected(true);
                        const userName = localStorage.getItem('userName') || 'User';
                        addActionLog(`Session Verified - User: ${userName} connected to TV`, 'success');
                        resolve(true);
                    } else {
                        console.warn('⚠️ [Frontend] Connection established but TV is not reachable');
                        setRemoteSessionId(sessionId); // Keep sessionId for retry
                        setIsRemoteConnected(false);
                        addActionLog('Connection established but TV is off or unreachable. Please turn on the TV.', 'warning');
                        resolve(false);
                    }
                } else {
                    console.error('❌ [Frontend] Failed to connect to device:', response?.error || 'Unknown error');
                    console.error('❌ [Frontend] Full response:', response);
                    setRemoteSessionId(null);
                    setIsRemoteConnected(false);
                    addActionLog(`Connection failed: ${response?.error || 'Unknown error'}`, 'error');
                    resolve(false);
                }
            });

            // Add timeout to detect if callback never fires
            setTimeout(() => {
                if (!remoteSessionId) {
                    console.warn('⚠️ [Frontend] Connection timeout - no response received after 15 seconds');
                }
            }, 15000);
        });
    };

    // Send remote control command (through Node.js backend)
    const sendRemoteCommand = async (type, params) => {
        console.log('📤 [Frontend] sendRemoteCommand called:', { type, params, remoteSessionId, hasSocket: !!socketRef.current, socketConnected: socketRef.current?.connected });

        if (!remoteSessionId || !socketRef.current) {
            console.error('❌ [Frontend] No active remote session. SessionId:', remoteSessionId, 'Socket:', !!socketRef.current);
            addActionLog('Command failed - No active remote session', 'error');
            setIsRemoteConnected(false);
            return;
        }

        // Don't block on connection check - just send the command and let backend handle it
        // This is faster and allows commands to go through even if check is slow
        checkSessionStatus(remoteSessionId).then((isConnected) => {
            if (!isConnected) {
                console.warn('⚠️ [Frontend] TV connection check failed, but still sending command');
                setIsRemoteConnected(false);
            } else {
                setIsRemoteConnected(true);
            }
        }).catch(err => {
            console.warn('⚠️ [Frontend] Connection check error:', err);
        });

        console.log('📤 [Frontend] Emitting sendRemoteCommand socket event:', { type, params, sessionId: remoteSessionId });

        // Add log for button press
        if (type === 'key' && params?.action) {
            const actionName = params.action.toUpperCase();
            addActionLog(`Button Press: ${actionName}`, 'action');
        } else if (type === 'key' && params?.key) {
            const keyName = params.key.toUpperCase();
            addActionLog(`Navigation: ${keyName}`, 'action');
        }

        return new Promise((resolve) => {
            if (!socketRef.current || !socketRef.current.connected) {
                console.error('❌ [Frontend] Socket not connected, cannot send command');
                addActionLog('Socket not connected', 'error');
                setIsRemoteConnected(false);
                resolve();
                return;
            }

            socketRef.current.emit('sendRemoteCommand', { sessionId: remoteSessionId, type, params }, (response) => {
                console.log('📥 [Frontend] Command response received:', response);
                if (response && response.success) {
                    console.log('✅ [Frontend] Command sent successfully:', type, params);
                    // Log success for app launches
                    if (type === 'app' && params?.app) {
                        addActionLog(`App Launched: ${params.app} - Launch time: ${response.launchTime || 'N/A'}`, 'success');
                    }
                } else {
                    console.error('❌ [Frontend] Command failed:', response?.error || 'Unknown error', response);
                    addActionLog(`Command failed: ${response?.error || 'Unknown error'}`, 'error');

                    // If error indicates TV is disconnected, update status
                    if (response?.error && (response.error.includes('off') || response.error.includes('unreachable') || response.error.includes('not connected'))) {
                        setIsRemoteConnected(false);
                    }
                }
                resolve();
            });

            // Add timeout to detect if callback never fires
            setTimeout(() => {
                console.warn('⚠️ [Frontend] Command response timeout - no response after 5 seconds');
            }, 5000);
        });
    };

    // Disconnect from device (user-initiated)
    const disconnectDevice = async () => {
        if (!remoteSessionId || !socketRef.current) return;

        return new Promise((resolve) => {
            socketRef.current.emit('disconnectDevice', { sessionId: remoteSessionId }, async (response) => {
                if (response.success) {
                    console.log('✅ Disconnected from device');
                    setRemoteSessionId(null);
                    setIsRemoteConnected(false);

                    // Clear viewer connection
                    try {
                        const token = localStorage.getItem('token');
                        if (token) {
                            await fetch(`${import.meta.env.VITE_API_BASE_URL}/devices/${deviceId}/clear-viewer`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            console.log('✅ Viewer cleared from device');
                        }
                    } catch (err) {
                        console.error('❌ Error clearing viewer:', err);
                    }

                    // Close peer connection
                    if (peerConnection.current) {
                        try {
                            peerConnection.current.close();
                            peerConnection.current = null;
                        } catch (e) {
                            console.error('Error closing peer connection:', e);
                        }
                    }

                    // Show notification
                    toast.success('Disconnected from device successfully', {
                        duration: 3000,
                        position: 'top-center'
                    });

                    // Navigate to dashboard
                    setTimeout(() => {
                        navigate('/dashboard');
                    }, 1000);
                } else {
                    console.error('❌ Disconnect error:', response.error);
                    toast.error('Failed to disconnect from device', {
                        duration: 3000,
                        position: 'top-center'
                    });
                }
                resolve();
            });
        });
    };

    // Periodic status polling to detect when TV turns off
    useEffect(() => {
        if (!remoteSessionId || !isRemoteConnected) {
            return;
        }

        const pollInterval = setInterval(async () => {
            const isConnected = await checkSessionStatus(remoteSessionId);
            if (!isConnected && isRemoteConnected) {
                console.warn('⚠️ [Frontend] TV connection lost during polling');
                setIsRemoteConnected(false);
                addActionLog('TV is off or unreachable. Please turn on the TV and reconnect.', 'error');
            } else if (isConnected && !isRemoteConnected) {
                console.log('✅ [Frontend] TV connection restored');
                setIsRemoteConnected(true);
                addActionLog('TV connection restored', 'success');
            }
        }, 10000); // Poll every 10 seconds

        return () => {
            clearInterval(pollInterval);
        };
    }, [remoteSessionId, isRemoteConnected]);

    // Auto-connect to device when component loads and socket is ready
    useEffect(() => {
        if (!device || !device.specifications?.ipAddress || !socketRef.current) {
            return;
        }

        const deviceTypeMap = {
            'LG WebOS': 'lg_tv',
            'Samsung Tizen': 'samsung_tv',
            'Android TV': 'android',
            'Apple tvOS': 'apple_tv',
            'Roku': 'roku'
        };

        const deviceData = {
            deviceIP: device.specifications.ipAddress,
            deviceType: deviceTypeMap[device.type] || 'android',
            cameraName: device.name
        };

        // Function to attempt connection
        const attemptConnection = () => {
            if (socketRef.current && socketRef.current.connected) {
                console.log('🔌 [Frontend] Auto-connecting to device for remote control:', deviceData);

                // First check for existing session, then connect if needed
                checkExistingSession(deviceData).then((hasSession) => {
                    if (!hasSession) {
                        console.log('🔄 [Frontend] No existing session, connecting to device...');
                        connectToDevice(deviceData).then((connected) => {
                            if (connected) {
                                console.log('✅ [Frontend] Successfully connected to device for remote control');
                            } else {
                                console.error('❌ [Frontend] Failed to connect to device');
                            }
                        }).catch(err => {
                            console.error('❌ [Frontend] Auto-connect error:', err);
                        });
                    } else {
                        console.log('✅ [Frontend] Using existing session for remote control');
                    }
                }).catch(err => {
                    console.error('❌ [Frontend] Error checking existing session:', err);
                });
            } else {
                console.log('⏳ [Frontend] Waiting for socket connection before connecting remote...');
            }
        };

        // If socket is already connected, connect immediately
        if (socketRef.current.connected) {
            attemptConnection();
        } else {
            // Wait for socket to connect
            socketRef.current.once('connect', () => {
                console.log('✅ Socket connected, now connecting remote...');
                attemptConnection();
            });
        }
    }, [device?.id, device?.specifications?.ipAddress]);

    if (error) {
        return (
            <div className="h-screen bg-black flex flex-col items-center justify-center text-white p-6">
                <div className="bg-red-500/10 border border-red-500 p-8 rounded-2xl text-center max-w-md shadow-2xl">
                    <p className="text-xl font-bold text-red-500 mb-4">{error}</p>
                    <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-white text-black rounded-lg font-bold hover:bg-gray-200 transition-colors">Return to Dashboard</button>
                </div>
            </div>
        );
    }



    return (
        <div className="min-h-screen flex flex-col bg-[#F9FAFB] font-sans">
            <Toaster position="top-center" />
            {/* Header */}
            <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-30 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">Device Lab</span>
                        <span className="text-gray-300">/</span>
                        <span className="text-gray-900 font-bold">{device?.name || 'Loading...'}</span>
                    </div>
                </div>

                {/* Header Timer, Notifications & End Button */}
                <div className="flex items-center gap-3">
                    {/* Notification Bell */}
                    <NotificationBell
                        notifications={notifications}
                        onNotificationClick={handleNotificationClick}
                        onMarkAsRead={handleMarkNotificationAsRead}
                        onApprove={handleApproveRequest}
                        onReject={handleRejectRequest}
                    />

                    <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="p-1 bg-white rounded shadow-sm">
                            <RefreshCw size={10} className="text-indigo-600 animate-spin-slow" />
                        </div>
                        <span className="text-[11px] font-mono font-bold text-gray-600">{formatTime(sessionTime)}</span>
                    </div>
                    <button
                        onClick={async () => {
                            // User-initiated disconnect
                            await disconnectDevice();
                        }}
                        className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all active:scale-95 uppercase tracking-wider"
                    >
                        End
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-y-auto">
                {/* Top Section: Video and Sidebar */}
                <div className="flex overflow-hidden" style={{ alignItems: 'stretch' }}>
                    {/* Video Player Section */}
                    <main className="flex-1 relative flex flex-col p-4 overflow-hidden" style={{ minHeight: 0 }}>
                        <div className="flex items-center justify-between mb-4 shrink-0">
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-3">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    <h2 className="text-sm font-bold text-gray-900">{device?.name || 'Device'}</h2>
                                    <span className="px-2 py-0.5 bg-gray-100 text-[9px] font-bold text-gray-500 rounded uppercase tracking-wider">{device?.type || 'Android TV'}</span>
                                </div>
                                <p className="text-[10px] font-mono font-bold text-gray-400 ml-5">{device?.location || '192.168.1.101'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {isRecording && (
                                    <div className="flex items-center gap-2 mr-1 px-2 py-1 bg-red-50 rounded-lg border border-red-100 animate-in fade-in zoom-in-95 duration-300">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></div>
                                        <span className="text-[9px] font-black text-red-600 uppercase tracking-tighter">REC {recordingMode === 'full' ? 'Full' : 'TV'}</span>
                                        <button
                                            onClick={stopRecording}
                                            className="ml-1 px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white text-[9px] font-bold rounded shadow-sm transition-all active:scale-95 uppercase"
                                        >
                                            Stop
                                        </button>
                                    </div>
                                )}
                                <button className="p-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-600 transition-all active:scale-90 shadow-sm border border-indigo-100/50">
                                    <RotateCcw size={18} />
                                </button>
                                <button
                                    onClick={toggleAudio}
                                    className={`p-2 rounded-lg transition-all active:scale-90 shadow-sm border ${!isMuted ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-indigo-50 text-indigo-600 border-indigo-100/50'}`}
                                    title={isMuted ? "Unmute" : "Mute"}
                                >
                                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="relative h-[660px] bg-black rounded-[1.5rem] overflow-hidden shadow-xl border-[3px] border-gray-900 group">
                            {loading && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 text-white/50 transition-all duration-500">
                                    <div className="relative mb-4">
                                        <RefreshCw size={40} className="animate-spin text-indigo-500 opacity-50" />
                                    </div>
                                    <p className="text-xs font-medium tracking-wide">Streaming from {device?.name || 'Device'}</p>
                                </div>
                            )}
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                muted={isMuted}
                                className="w-full h-full object-contain bg-black"
                                onLoadedMetadata={() => {
                                    console.log('📹 Video metadata loaded');
                                    setLoading(false);
                                }}
                                onCanPlay={() => {
                                    console.log('▶️ Video can play');
                                    setLoading(false);
                                    if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                                        remoteVideoRef.current.play().catch(err => {
                                            console.error('Error in onCanPlay play():', err);
                                        });
                                    }
                                }}
                                onPlay={() => {
                                    console.log('▶️ Video started playing');
                                    setLoading(false);
                                }}
                                onError={(e) => {
                                    console.error('❌ Video error:', e);
                                    setError('Video playback error. Please refresh the page.');
                                    setLoading(false);
                                }}
                            />
                        </div>
                    </main>

                    {/* Right Sidebar - Controls */}
                    <aside className="w-[300px] bg-white border-l border-gray-200 flex flex-col z-20 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.01)] overflow-hidden">
                        {/* Sidebar Header/Status - Compact */}
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div className="flex flex-col gap-2">
                                {/* Streaming Status */}
                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${isConnected ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                                        Streaming
                                    </span>
                                </div>
                                {/* Remote Connected Status */}
                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${isRemoteConnected ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isRemoteConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${isRemoteConnected ? 'text-green-600' : 'text-red-600'}`}>
                                        Remote
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={captureTVScreen}
                                    className="p-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-600 transition-all active:scale-90 shadow-sm border border-indigo-100/50"
                                >
                                    <Camera size={18} />
                                </button>

                                <div className="relative" ref={videoDropdownRef}>
                                    <button
                                        onClick={() => !isRecording && setShowRecordDropdown(!showRecordDropdown)}
                                        className={`p-2 rounded-lg transition-all shadow-sm border ${isRecording
                                            ? 'bg-red-50 text-red-400 border-red-100 cursor-not-allowed opacity-50'
                                            : showRecordDropdown
                                                ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                                : 'bg-indigo-50 text-indigo-600 border-indigo-100/50 hover:bg-indigo-100'
                                            }`}
                                        disabled={isRecording}
                                    >
                                        <VideoIcon size={18} />
                                    </button>

                                    {showRecordDropdown && !isRecording && (
                                        <div className="absolute top-full right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="px-3 py-1 mb-1 border-b border-gray-50">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Record Mode</span>
                                            </div>
                                            <button
                                                onClick={() => startRecording('full')}
                                                className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                Full Screen View
                                            </button>
                                            <button
                                                onClick={() => startRecording('tv')}
                                                className="w-full px-4 py-2 text-left text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                TV Stream Only
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* New TV Remote UI Component */}
                        <div className="flex-1 overflow-hidden flex items-start justify-center">
                            <TVRemote
                                onCommand={sendRemoteCommand}
                                isConnected={isRemoteConnected}
                                device={device}
                            />
                        </div>
                    </aside>
                </div>

                {/* Bottom Section: Action Logs - Full Width */}
                <div className="w-full border-t border-gray-200 bg-white">
                    <ActionLogs
                        logs={actionLogs}
                        onClearLogs={() => setActionLogs([])}
                        onExportLogs={(logs) => {
                            const logText = logs.map(log => {
                                const date = new Date(log.timestamp);
                                const hours = date.getHours().toString().padStart(2, '0');
                                const minutes = date.getMinutes().toString().padStart(2, '0');
                                const seconds = date.getSeconds().toString().padStart(2, '0');
                                const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
                                return `[${hours}:${minutes}:${seconds}.${milliseconds}] ${log.message}`;
                            }).join('\n');
                            const blob = new Blob([logText], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `action-logs-${Date.now()}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                    />
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #F3F4F6;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #E5E7EB;
                }
            `}} />
        </div>
    );
};

export default StreamViewPage;
