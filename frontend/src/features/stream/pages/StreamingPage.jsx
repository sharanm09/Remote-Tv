import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL, SOCKET_URL } from '../../../config/api';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Monitor, RefreshCw, Cast, Video, VideoOff } from 'lucide-react';
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';

const StreamingPage = () => {
    const { deviceId } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const socketRef = useRef(null);
    const peerConnections = useRef({}); // { socketId: RTCPeerConnection }

    // State
    const [camera, setCamera] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamStatus, setStreamStatus] = useState('idle');
    const [permissionStatus, setPermissionStatus] = useState('checking');
    const [cameraList, setCameraList] = useState([]);
    const [activeStream, setActiveStream] = useState(null);
    const [device, setDevice] = useState(null);

    // Refs for socket listeners to avoid stale state
    const isStreamingRef = useRef(false);
    const activeStreamRef = useRef(null);

    const stopMediaTracks = (stream) => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };

    const fetchDeviceDetails = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/devices/${deviceId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setDevice(data.device);
            }
        } catch (error) {
            console.error('Error fetching device:', error);
        }
    };

    const updateDeviceStatus = async (status) => {
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API_BASE_URL}/devices/${deviceId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });
        } catch (error) {
            console.error('Error updating status:', error);
        }
    };

    const checkPermissionsAndGetCameras = async () => {
        setPermissionStatus('checking');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stopMediaTracks(stream);
            setPermissionStatus('granted');
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            setCameraList(videoDevices);
            if (videoDevices.length > 0 && !camera) {
                setCamera(videoDevices[0].deviceId);
            }
        } catch (error) {
            console.error("Error accessing camera:", error);
            setPermissionStatus('denied');
        }
    };

    useEffect(() => {
        fetchDeviceDetails();
        checkPermissionsAndGetCameras();

        const userId = localStorage.getItem('userId');
        console.log('🔌 [Socket] Connecting to:', SOCKET_URL);
        socketRef.current = io(SOCKET_URL);
        socketRef.current.emit('join-stream', { deviceId, isStreamer: true, streamId: userId, userId: userId });

        // Handle browser close/tab close - cleanup immediately
        // BUT: Don't cleanup on refresh - let backend handle reconnection
        const handleBeforeUnload = (e) => {
            // Check if this is a refresh (navigation) vs actual close
            // If it's a refresh, the page will reload and reconnect, so don't cleanup
            const isRefresh = e.persisted || (performance.navigation && performance.navigation.type === 1);

            if (isRefresh) {
                console.log('🔄 Page refresh detected - skipping cleanup, will reconnect');
                return; // Don't cleanup on refresh
            }

            console.log('🛑 Browser closing - cleaning up stream...');
            if (isStreamingRef.current && socketRef.current) {
                // Try to send cleanup signal (may not always work on browser close)
                try {
                    socketRef.current.emit('streamer-stopped', { deviceId });
                } catch (e) {
                    console.error('Error sending cleanup signal:', e);
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('pagehide', handleBeforeUnload);

        socketRef.current.on('viewer-joined', async ({ socketId }) => {
            console.log('👤 New viewer joined:', socketId);
            console.log('📊 Current State Check:', { isStreaming: isStreamingRef.current, hasStream: !!activeStreamRef.current });

            if (isStreamingRef.current && activeStreamRef.current) {
                console.log('🚀 Initiating connection to new viewer');
                const pc = createPeerConnection(socketId);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socketRef.current.emit('offer', { to: socketId, offer, deviceId });
            } else {
                console.log('⏳ Skipping connection initiation: Streamer not yet active');
            }
        });

        socketRef.current.on('answer', async ({ from, answer }) => {
            console.log('📨 Received answer from viewer:', from);
            const pc = peerConnections.current[from];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        socketRef.current.on('ice-candidate', ({ from, candidate }) => {
            console.log('📨 Received ICE candidate from viewer:', from);
            const pc = peerConnections.current[from];
            if (pc) {
                pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error('❌ Error adding ICE candidate:', e));
            }
        });

        // Listen for force disconnect (when request is approved)
        if (userId) {
            const userIdStr = String(userId);
            socketRef.current.on(`force-disconnect-${userIdStr}`, ({ deviceId: disconnectedDeviceId }) => {
                console.log('⚠️ Force disconnect received for device:', disconnectedDeviceId);
                if (disconnectedDeviceId === deviceId) {
                    // Stop streaming
                    if (isStreamingRef.current) {
                        setIsStreaming(false);
                        isStreamingRef.current = false;
                        updateDeviceStatus('offline');
                        if (socketRef.current) {
                            socketRef.current.emit('streamer-stopped', { deviceId });
                        }
                    }

                    // Stop media tracks
                    if (activeStream) {
                        stopMediaTracks(activeStream);
                        setActiveStream(null);
                        activeStreamRef.current = null;
                    }

                    // Close all peer connections
                    Object.values(peerConnections.current).forEach(pc => {
                        try {
                            pc.close();
                        } catch (e) {
                            console.error('Error closing peer connection:', e);
                        }
                    });
                    peerConnections.current = {};

                    // Navigate to dashboard
                    navigate('/dashboard');
                }
            });
        }

        // Listen for admin stop streaming
        socketRef.current.on('admin-stopped-streaming', ({ deviceId: stoppedDeviceId, adminName }) => {
            console.log('⚠️ Admin stopped streaming for device:', stoppedDeviceId);
            if (stoppedDeviceId === deviceId) {
                // Show notification
                toast.error(`Admin (${adminName}) has stopped streaming`, {
                    duration: 5000,
                    position: 'top-center'
                });

                // Stop streaming
                if (isStreamingRef.current) {
                    setIsStreaming(false);
                    isStreamingRef.current = false;
                    updateDeviceStatus('offline');
                    if (socketRef.current) {
                        socketRef.current.emit('streamer-stopped', { deviceId });
                    }
                }

                // Stop media tracks
                if (activeStream) {
                    stopMediaTracks(activeStream);
                    setActiveStream(null);
                    activeStreamRef.current = null;
                }

                // Close all peer connections
                Object.values(peerConnections.current).forEach(pc => {
                    try {
                        pc.close();
                    } catch (e) {
                        console.error('Error closing peer connection:', e);
                    }
                });
                peerConnections.current = {};

                // Navigate to dashboard
                setTimeout(() => {
                    navigate('/dashboard');
                }, 1000);
            }
        });

        // For streamers, when a new viewer joins, we might get a request?
        // Actually, viewers will send their join but wait for the streamer or vice versa.
        // Simplified flow: Viewers send an offer, Streamer answers.

        return () => {
            // Cleanup on unmount
            // BUT: If this is a refresh, the backend will handle reconnection
            // So we add a small delay to allow reconnection before cleanup
            console.log('🧹 Cleaning up streaming page...');

            // Remove event listeners
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('pagehide', handleBeforeUnload);

            // Check if this might be a refresh (navigation)
            const isLikelyRefresh = performance.navigation.type === 1; // TYPE_RELOAD

            if (isLikelyRefresh) {
                console.log('🔄 Likely refresh detected - delaying cleanup to allow reconnection...');
                // Give backend time to detect reconnection before cleaning up
                setTimeout(() => {
                    // Only cleanup if socket is still disconnected (refresh failed)
                    if (!socketRef.current || !socketRef.current.connected) {
                        console.log('🛑 Cleanup after refresh delay - socket not reconnected');
                        if (activeStream) {
                            stopMediaTracks(activeStream);
                        }
                        if (isStreamingRef.current) {
                            updateDeviceStatus('offline');
                            if (socketRef.current) {
                                socketRef.current.emit('streamer-stopped', { deviceId });
                            }
                        }
                        Object.values(peerConnections.current).forEach(pc => {
                            try {
                                pc.close();
                            } catch (e) {
                                console.error('Error closing peer connection:', e);
                            }
                        });
                        peerConnections.current = {};
                        if (socketRef.current) {
                            socketRef.current.disconnect();
                        }
                    } else {
                        console.log('✅ Socket reconnected - skipping cleanup');
                    }
                }, 2000); // 2 second delay to allow reconnection
            } else {
                // Not a refresh - cleanup immediately
                console.log('🛑 Page close detected - cleaning up immediately...');
                if (activeStream) {
                    stopMediaTracks(activeStream);
                }
                if (isStreamingRef.current) {
                    updateDeviceStatus('offline');
                    if (socketRef.current) {
                        socketRef.current.emit('streamer-stopped', { deviceId });
                    }
                }
                Object.values(peerConnections.current).forEach(pc => {
                    try {
                        pc.close();
                    } catch (e) {
                        console.error('Error closing peer connection:', e);
                    }
                });
                peerConnections.current = {};
                if (socketRef.current) {
                    socketRef.current.disconnect();
                }
            }
        };
    }, [deviceId]);

    const createPeerConnection = (socketId) => {
        console.log('🌐 Creating new PeerConnection for viewer:', socketId);
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        peerConnections.current[socketId] = pc;

        // Add tracks BEFORE creating offer (critical for proper WebRTC negotiation)
        if (activeStreamRef.current) {
            console.log('🎥 Adding local tracks to PeerConnection');
            activeStreamRef.current.getTracks().forEach(track => {
                console.log(`➕ Adding track: ${track.kind} (${track.id})`);
                pc.addTrack(track, activeStreamRef.current);
            });
            console.log(`✅ Added ${activeStreamRef.current.getTracks().length} tracks to peer connection`);
        } else {
            console.warn('⚠️ No active stream available when creating peer connection');
        }

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`🧊 ICE State for ${socketId}:`, state);
            if (state === 'connected' || state === 'completed') {
                console.log(`✅ Peer connection established with viewer ${socketId}`);
            } else if (state === 'failed') {
                console.error(`❌ Peer connection failed with viewer ${socketId}`);
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📤 Sending ICE candidate to viewer:', socketId);
                socketRef.current.emit('ice-candidate', {
                    to: socketId,
                    candidate: event.candidate,
                    deviceId
                });
            } else {
                console.log('✅ All ICE candidates sent to viewer:', socketId);
            }
        };

        return pc;
    };

    useEffect(() => {
        const startCameraStream = async () => {
            if (!camera) return;
            if (activeStream) stopMediaTracks(activeStream);
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: camera } },
                    audio: true
                });
                setActiveStream(stream);
                activeStreamRef.current = stream;
                // Update existing connections if any
                Object.values(peerConnections.current).forEach(pc => {
                    stream.getTracks().forEach(track => pc.addTrack(track, stream));
                });
            } catch (err) {
                console.error("Failed to start camera stream", err);
            }
        };

        if (camera && permissionStatus === 'granted') {
            startCameraStream();
        }
    }, [camera, permissionStatus]);

    useEffect(() => {
        if (activeStream && videoRef.current) {
            videoRef.current.srcObject = activeStream;
        }
    }, [activeStream]);

    useEffect(() => {
        let heartbeat;
        if (isStreaming) {
            heartbeat = setInterval(() => {
                if (socketRef.current) {
                    console.log('💓 Streamer heartbeat sent');
                    socketRef.current.emit('streamer-heartbeat', { deviceId });
                }
            }, 5000);
        }
        return () => clearInterval(heartbeat);
    }, [isStreaming, deviceId]);

    const handleToggleStream = async () => {
        if (!camera) return;

        if (isStreaming) {
            console.log('🛑 Stopping Broadcast...');
            setIsStreaming(false);
            isStreamingRef.current = false;
            setStreamStatus('idle');
            // Close all connections
            Object.values(peerConnections.current).forEach(pc => pc.close());
            peerConnections.current = {};
            // Update device status to offline when streaming stops
            await updateDeviceStatus('offline');
            // Notify backend that streaming has stopped
            if (socketRef.current) {
                socketRef.current.emit('streamer-stopped', { deviceId });
            }
        } else {
            console.log('🔴 GO LIVE clicked! Initializing broadcast...');
            setStreamStatus('connecting');
            // Wait for actual stream to be active before marking as live
            setTimeout(async () => {
                if (activeStreamRef.current) {
                    setIsStreaming(true);
                    isStreamingRef.current = true;
                    setStreamStatus('active');
                    console.log('📡 Emitting streamer-ready signal to socket');
                    // Don't set status to 'live' here - let backend handle it when streamer-ready is received
                    // Backend will set status to 'live' only after confirming streaming is active
                    if (socketRef.current) {
                        const userId = localStorage.getItem('userId');
                        socketRef.current.emit('streamer-ready', { deviceId, streamId: userId, userId: userId });
                    }
                } else {
                    console.error('❌ No active stream available');
                    setStreamStatus('idle');
                }
            }, 1000);
        }
    };

    if (!device) return <div className="bg-black h-screen flex items-center justify-center text-white">Loading device...</div>;

    return (
        <div className="h-screen flex flex-col bg-black overflow-hidden relative font-sans">
            <Toaster position="top-center" />
            <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-20 shrink-0 shadow-sm">
                <div className="flex items-center gap-6">
                    <button onClick={() => navigate(-1)} className="p-2.5 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-900 transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex items-center gap-4 border-l border-gray-200 pl-6 h-10">
                        <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                            <Monitor size={20} />
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-gray-900 leading-tight">{device.name}</h1>
                            <p className="text-xs text-gray-500 font-medium">Broadcasting live from browser</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 border border-gray-200">
                        <div className="px-3 text-gray-500"><Video size={18} /></div>
                        <select
                            value={camera}
                            onChange={(e) => setCamera(e.target.value)}
                            disabled={permissionStatus !== 'granted'}
                            className="h-10 bg-transparent border-none text-sm text-gray-900 font-medium focus:ring-0 cursor-pointer min-w-[200px]"
                        >
                            {cameraList.map((cam) => (
                                <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${cam.deviceId.slice(0, 5)}...`}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handleToggleStream}
                        disabled={!camera || streamStatus === 'connecting' || permissionStatus !== 'granted'}
                        className={`h-12 px-8 font-semibold rounded-xl flex items-center gap-2.5 transition-all shadow-sm ${isStreaming ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}
                    >
                        {streamStatus === 'connecting' ? <RefreshCw size={20} className="animate-spin" /> : isStreaming ? 'Stop Broadcast' : 'Go Live'}
                    </button>
                </div>
            </header>

            <main className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                {activeStream ? (
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                ) : (
                    <div className="text-center text-white/50">
                        <VideoOff size={48} className="mx-auto mb-4 opacity-20" />
                        <p>Camera source required</p>
                    </div>
                )}

                {isStreaming && (
                    <div className="absolute top-8 left-8 bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 animate-pulse shadow-xl">
                        <div className="w-2.5 h-2.5 bg-white rounded-full" /> LIVE
                    </div>
                )}
            </main>
        </div>
    );
};

export default StreamingPage;
