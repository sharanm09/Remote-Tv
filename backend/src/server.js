const express = require('express');
const cors = require('cors');
const passport = require('passport');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize, initializeDatabase } = require('./config/database');
const seedDatabase = require('./config/seed');
const authRoutes = require('./features/auth/auth.routes');
require('./config/passport')(passport); // Load Passport Config

// ... (rest of imports)

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 5000;
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const { v4: uuidv4 } = require('uuid');

// WebSocket Signaling & Real-time Status
const roomStreamers = {}; // { deviceId: streamerSocketId }
const pendingCleanups = {}; // { deviceId: timeoutId }
const socketToDeviceMap = {}; // { socketId: { deviceId, userId, isStreamer, isViewer } } - Track all socket connections

// Device Logs Storage (In-Memory, No DB)
const deviceLogs = {}; // { [deviceId]: Array<{ id, timestamp, message, type, userId }> }
const sessionToDeviceMap = {}; // { [sessionId]: deviceId } - Map Python session to deviceId
const MAX_LOGS_PER_DEVICE = 100; // Keep last 100 logs per device

const Device = require('./models/Device'); // Import Device Model

io.on('connection', (socket) => {
    console.log('👤 New client connected:', socket.id);

    socket.on('join-stream', async ({ deviceId, isStreamer, streamId, userId }) => {
        socket.join(deviceId);
        
        // Track socket-to-device mapping for immediate cleanup on disconnect
        if (!socketToDeviceMap[socket.id]) {
            socketToDeviceMap[socket.id] = [];
        }
        socketToDeviceMap[socket.id].push({ deviceId, userId, isStreamer, isViewer: !isStreamer });

        if (isStreamer) {
            let isResume = false;

            // CANCEL PENDING CLEANUP if streamers reconnects (refresh)
            if (pendingCleanups[deviceId]) {
                console.log(`♻️ Streamer returned for device ${deviceId}. Cancelling cleanup.`);
                clearTimeout(pendingCleanups[deviceId]);
                delete pendingCleanups[deviceId];
                isResume = true;
            }

            roomStreamers[deviceId] = { socketId: socket.id, streamId };
            console.log(`📡 Streamer ${socket.id} (streamId: ${streamId}) joined room: ${deviceId}`);

            // UPDATE DB: Mark device as streaming with Session ID
            try {
                const User = require('./models/User'); // Import User Model
                let streamerName = 'Unknown User';

                if (userId) {
                    try {
                        // Fetch user by ID properly (handle both UUID and string formats)
                        const user = await User.findOne({ where: { id: userId } });
                    if (user) {
                            streamerName = user.displayName || user.email || 'Unknown User';
                            console.log(`✅ Found streamer user: ${streamerName} (ID: ${userId})`);
                        } else {
                            console.warn(`⚠️ Streamer user not found for ID: ${userId}`);
                        }
                    } catch (userErr) {
                        console.error(`❌ Error fetching streamer user ${userId}:`, userErr.message);
                    }
                }

                // Keep device as offline until streamer clicks "Go Live"
                // Don't change status to 'in_use' - let it stay offline so others can connect
                // Keep userId and username as null (will remain null when streaming starts)
                const updatePayload = {
                    status: 'offline', // Keep offline until Go Live is clicked
                    streamerSocketId: socket.id,
                    userId: null, // Keep null - don't set userId when streamer joins
                    username: null, // Keep null - don't set username when streamer joins
                    isStreaming: false // Not streaming yet
                };

                let currentSessionId;
                let currentIsStreaming;

                if (isResume) {
                    // RESUME: Keep existing Session ID and Streaming status
                    const currentDevice = await Device.findByPk(deviceId);
                    currentSessionId = currentDevice.sessionId;
                    currentIsStreaming = currentDevice.isStreaming;
                    // If resuming and was streaming, keep status as live
                    if (currentIsStreaming) {
                        updatePayload.status = 'live';
                        updatePayload.isStreaming = true;
                    }
                    console.log(`🔄 Resuming Session: ${currentSessionId} (Streaming: ${currentIsStreaming})`);
                } else {
                    // NEW SESSION: Keep device offline, don't reserve it
                    currentSessionId = uuidv4();
                    currentIsStreaming = false;

                    updatePayload.sessionId = currentSessionId;
                    updatePayload.sessionTime = new Date().toISOString();
                    updatePayload.isStreaming = false;
                    updatePayload.status = 'offline'; // Keep offline until Go Live

                    console.log(`✨ New Session Created: ${currentSessionId} - Device remains offline until Go Live`);
                }

                await Device.update(updatePayload, { where: { id: deviceId } });
                console.log(`✅ Device ${deviceId} prepared by ${streamerName} (offline until Go Live)`);

                // Broadcast status update to ALL clients
                io.emit('device-status-update', {
                    deviceId,
                    status: 'offline', // Keep offline until Go Live
                    isStreaming: false, // Not streaming yet
                    streamerSocketId: socket.id,
                    userId: null, // Keep null when streamer joins
                    username: null, // Keep null when streamer joins
                    sessionId: currentSessionId
                });

            } catch (err) {
                console.error(`❌ Failed to update device status: ${err.message}`);
            }

        } else {
            console.log(`📡 Viewer ${socket.id} (userId: ${userId}) joined room: ${deviceId}`);
            
            // Track connected viewer - PREVENT MULTIPLE VIEWERS
            try {
                const device = await Device.findByPk(deviceId);
                // Check if device has an active streamer (streamerSocketId exists) OR is live and streaming
                const hasActiveStreamer = device && (device.streamerSocketId || (device.status === 'live' && device.isStreaming));
                
                if (hasActiveStreamer) {
                    // Check if someone is already connected
                    if (device.connectedViewerId && device.connectedViewerId !== userId) {
                        console.log(`⚠️ Device ${deviceId} already has a viewer connected: ${device.connectedViewerName} (${device.connectedViewerId})`);
                        socket.emit('viewer-rejected', { 
                            reason: `Device is already in use by ${device.connectedViewerName || 'another user'}` 
                        });
                        return; // Prevent this viewer from connecting
                    }
                    
                    // First viewer connecting or same viewer reconnecting - track them
                    // Fetch user details by ID properly
                    const User = require('./models/User');
                    let viewerName = 'Unknown User';
                    let viewerUserId = userId || null;
                    
                    if (userId) {
                        try {
                            // Try to find user by ID (handle both UUID and string formats)
                            const user = await User.findOne({ 
                                where: { id: userId } 
                            });
                            if (user) {
                                viewerName = user.displayName || user.email || 'Unknown User';
                                viewerUserId = user.id; // Ensure we have the correct userId
                                console.log(`✅ Found user: ${viewerName} (ID: ${viewerUserId})`);
                            } else {
                                console.warn(`⚠️ User not found for ID: ${userId}`);
                            }
                        } catch (userErr) {
                            console.error(`❌ Error fetching user ${userId}:`, userErr.message);
                        }
                    }
                    
                    // Update device with viewer info AND userId/username
                    await Device.update({
                        connectedViewerId: viewerUserId,
                        connectedViewerName: viewerName,
                        webrtcConnected: false, // Not connected yet, will be updated when WebRTC connects
                        userId: viewerUserId, // Update userId with viewer's ID
                        username: viewerName // Update username with viewer's name
                    }, { where: { id: deviceId } });
                    
                    // Broadcast update
                    io.emit('device-status-update', {
                        deviceId,
                        connectedViewerId: viewerUserId,
                        connectedViewerName: viewerName,
                        webrtcConnected: false,
                        userId: viewerUserId,
                        username: viewerName
                    });
                    
                    console.log(`✅ Viewer ${viewerName} (${viewerUserId}) connected to device ${deviceId} - userId and username updated`);
                }
            } catch (err) {
                console.error(`❌ Failed to track viewer: ${err.message}`);
            }
            
            if (roomStreamers[deviceId]) {
                console.log(`🔔 Notifying new viewer ${socket.id} that streamer is present`);
                socket.emit('streamer-present');
            }
        }
    });

    socket.on('streamer-ready', async ({ deviceId, streamId, userId }) => {
        console.log(`🚀 Streamer ${socket.id} (streamId: ${streamId}, userId: ${userId}) in room ${deviceId} clicked GO LIVE!`);

        // UPDATE DB: Mark device as LIVE streaming
        try {
            // Get current device to find userId
            const device = await Device.findByPk(deviceId);
            if (!device) {
                console.error(`❌ Device ${deviceId} not found`);
                return;
            }

            // Fetch user details - use userId from socket or device
            const User = require('./models/User');
            let streamerName = 'Unknown User';
            let streamerUserId = userId || device.userId || streamId; // Use userId from socket, or device, or streamId as fallback

            // Fetch user details by ID
            if (streamerUserId) {
                try {
                    const user = await User.findOne({ where: { id: streamerUserId } });
                    if (user) {
                        streamerName = user.displayName || user.email || 'Unknown User';
                        streamerUserId = user.id;
                        console.log(`✅ Fetched streamer user: ${streamerName} (ID: ${streamerUserId})`);
                    } else {
                        console.warn(`⚠️ User not found for ID: ${streamerUserId}`);
                        // Keep existing username if available
                        if (device.username && device.username !== 'Unknown User') {
                            streamerName = device.username;
                        }
                    }
                } catch (userErr) {
                    console.error(`❌ Error fetching streamer user ${streamerUserId}:`, userErr.message);
                    // Keep existing username if available
                    if (device.username && device.username !== 'Unknown User') {
                        streamerName = device.username;
                    }
                }
            } else {
                console.warn(`⚠️ No userId available for streamer ${socket.id}`);
                // Keep existing username if available
                if (device.username && device.username !== 'Unknown User') {
                    streamerName = device.username;
                }
            }

            // Update device with streaming status - KEEP userId and username as null
            await Device.update({
                isStreaming: true,
                status: 'live', // Viewers need 'live' status to see "Connect" button
                userId: null, // Keep userId as null when streaming starts
                username: null // Keep username as null when streaming starts
            }, { where: { id: deviceId } });

            // Broadcast status update to ALL clients - userId and username remain null
            io.emit('device-status-update', {
                deviceId,
                status: 'live',
                isStreaming: true, // NOW it is live
                streamerSocketId: socket.id,
                userId: null, // Keep null when streaming
                username: null, // Keep null when streaming
                connectedViewerId: device.connectedViewerId,
                connectedViewerName: device.connectedViewerName
            });
            console.log(`✅ Device ${deviceId} is now LIVE streaming (userId and username kept as null)`);

        } catch (err) {
            console.error(`❌ Failed to update device live status: ${err.message}`);
        }

        socket.to(deviceId).emit('streamer-ready', { streamId });
    });

    socket.on('request-connection', ({ deviceId }) => {
        const streamer = roomStreamers[deviceId];
        if (streamer) {
            console.log(`🔔 Viewer ${socket.id} requesting session from streamer ${streamer.socketId}`);
            io.to(streamer.socketId).emit('viewer-joined', { socketId: socket.id });
        }
    });

    socket.on('streamer-heartbeat', ({ deviceId }) => {
        socket.to(deviceId).emit('stream-heartbeat');
    });

    // Handle viewer WebRTC connection status updates
    socket.on('viewer-webrtc-connected', async ({ deviceId, userId }) => {
        console.log(`✅ Viewer ${userId} WebRTC connected to device ${deviceId}`);
        try {
            const device = await Device.findByPk(deviceId);
            if (device && device.connectedViewerId === userId) {
                // Fetch user details to ensure we have the correct name
                const User = require('./models/User');
                let viewerName = device.connectedViewerName || 'Unknown User';
                if (userId) {
                    try {
                        const user = await User.findOne({ where: { id: userId } });
                        if (user) {
                            viewerName = user.displayName || user.email || 'Unknown User';
                        }
                    } catch (userErr) {
                        console.error(`❌ Error fetching user ${userId}:`, userErr.message);
                    }
                }
                
                // Update device to mark WebRTC as connected
                await Device.update({
                    connectedViewerId: userId, // Keep viewer ID
                    connectedViewerName: viewerName, // Update with fetched name
                    webrtcConnected: true // Mark WebRTC as connected
                }, { where: { id: deviceId } });

                // Broadcast update
                io.emit('device-status-update', {
                    deviceId,
                    connectedViewerId: userId,
                    connectedViewerName: viewerName,
                    webrtcConnected: true,
                    userId: userId, // Include userId
                    username: viewerName // Include username
                });
            }
        } catch (err) {
            console.error(`❌ Failed to update viewer WebRTC status: ${err.message}`);
        }
    });

    socket.on('viewer-webrtc-disconnected', async ({ deviceId, userId }) => {
        console.log(`❌ Viewer ${userId} WebRTC disconnected from device ${deviceId}`);
        try {
            const device = await Device.findByPk(deviceId);
            if (device && device.connectedViewerId === userId) {
                // Clear connected viewer when WebRTC disconnects
                await Device.update({
                    connectedViewerId: null,
                    connectedViewerName: null,
                    webrtcConnected: false
                }, { where: { id: deviceId } });

                // Broadcast update
                io.emit('device-status-update', {
                    deviceId,
                    connectedViewerId: null,
                    connectedViewerName: null,
                    webrtcConnected: false,
                    userId: null, // Clear userId when viewer disconnects
                    username: null // Clear username when viewer disconnects
                });
            }
        } catch (err) {
            console.error(`❌ Failed to update viewer WebRTC disconnect: ${err.message}`);
        }
    });

    socket.on('streamer-stopped', async ({ deviceId }) => {
        console.log(`🛑 Streamer ${socket.id} stopped streaming for device ${deviceId}`);
        
        // Update device status to offline when streaming stops
        try {
            await Device.update({
                isStreaming: false,
                status: 'offline', // Set to offline when streaming stops
                connectedViewerId: null,
                connectedViewerName: null
            }, { where: { id: deviceId } });

            // Broadcast status update to ALL clients
            io.emit('device-status-update', {
                deviceId,
                status: 'offline',
                isStreaming: false,
                streamerSocketId: null,
                userId: null, // Clear userId when streamer stops
                username: null,
                connectedViewerId: null,
                connectedViewerName: null,
                webrtcConnected: false
            });
            console.log(`✅ Device ${deviceId} is now offline (streaming stopped)`);
        } catch (err) {
            console.error(`❌ Failed to update device offline status: ${err.message}`);
        }
    });

    // WebRTC Signaling
    socket.on('offer', ({ to, offer, deviceId }) => {
        const streamer = roomStreamers[deviceId];
        const target = to === 'streamer' ? (streamer ? streamer.socketId : null) : to;
        console.log(`📡 Routing offer from ${socket.id} to ${target || 'unknown'} (deviceId: ${deviceId})`);
        if (target) {
            socket.to(target).emit('offer', { from: socket.id, offer, deviceId });
        }
    });

    socket.on('answer', ({ to, answer, deviceId }) => {
        const streamer = roomStreamers[deviceId];
        const target = to === 'streamer' ? (streamer ? streamer.socketId : null) : to;
        console.log(`📡 Routing answer from ${socket.id} to ${target || 'unknown'} (deviceId: ${deviceId})`);
        if (target) {
            socket.to(target).emit('answer', { from: socket.id, answer, deviceId });
        }
    });

    socket.on('ice-candidate', ({ to, candidate, deviceId }) => {
        const streamer = roomStreamers[deviceId];
        const target = to === 'streamer' ? (streamer ? streamer.socketId : null) : to;
        if (target) {
            socket.to(target).emit('ice-candidate', { from: socket.id, candidate, deviceId });
        }
    });

    // ===== Remote Control Handlers (Python Backend Proxy) =====
    
    // Check existing session for device
    socket.on('checkExistingSession', async ({ deviceData }, callback) => {
        try {
            console.log('🔍 [Backend] Checking existing session for device:', deviceData);
            const response = await fetch(`${PYTHON_BACKEND_URL}/sessions/check/${deviceData.deviceIP}?device_type=${deviceData.deviceType}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ [Backend] Session check result:', data.exists ? 'Found existing' : 'No existing session');
                console.log('📋 [Backend] Session data:', JSON.stringify(data, null, 2));
                callback({ success: true, ...data });
            } else {
                const errorText = await response.text();
                console.error('❌ [Backend] Session check failed:', response.status, errorText);
                callback({ success: false, exists: false, error: errorText });
            }
        } catch (error) {
            console.error('❌ [Backend] Error checking existing session:', error.message);
            callback({ success: false, exists: false, error: error.message });
        }
    });
    
    // Connect to device for remote control
    socket.on('connectDevice', async ({ deviceData }, callback) => {
        try {
            console.log(`🔗 [Backend] Forwarding device connection request to Python backend for ${deviceData.cameraName}:`, {
                deviceIP: deviceData.deviceIP,
                deviceType: deviceData.deviceType,
                cameraName: deviceData.cameraName,
                pythonBackendUrl: PYTHON_BACKEND_URL
            });
            
            const response = await fetch(`${PYTHON_BACKEND_URL}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: deviceData.deviceIP,
                    device_type: deviceData.deviceType,
                    tv_name: deviceData.cameraName
                }),
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });
            
            console.log(`📥 [Backend] Python backend response for ${deviceData.cameraName}:`, {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ [Backend] Device connected via Python backend for ${deviceData.cameraName}:`, {
                    sessionId: data.sessionId,
                    deviceIP: deviceData.deviceIP,
                    fullResponse: JSON.stringify(data, null, 2)
                });
                
                // Verify sessionId exists
                if (!data.sessionId) {
                    console.error('❌ [Backend] No sessionId in response from Python backend:', data);
                    callback({ 
                        success: false, 
                        error: 'No sessionId returned from Python backend. Response: ' + JSON.stringify(data)
                    });
                    return;
                }
                
                // Map sessionId to deviceId (using cameraName as deviceId)
                const deviceId = deviceData.cameraName || deviceData.deviceIP;
                sessionToDeviceMap[data.sessionId] = deviceId;
                
                // Initialize logs array for this device if not exists
                if (!deviceLogs[deviceId]) {
                    deviceLogs[deviceId] = [];
                }
                
                // Add connection log
                const logEntry = {
                    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toISOString(),
                    message: `Session Started - Connected to ${deviceData.cameraName}`,
                    type: 'info',
                    userId: null
                };
                deviceLogs[deviceId].push(logEntry);
                
                // Keep only last MAX_LOGS_PER_DEVICE logs
                if (deviceLogs[deviceId].length > MAX_LOGS_PER_DEVICE) {
                    deviceLogs[deviceId] = deviceLogs[deviceId].slice(-MAX_LOGS_PER_DEVICE);
                }
                
                // Emit device connection log to ALL connected clients via Socket.IO (broadcast)
                console.log('📤 [Backend] Broadcasting deviceConnectionLog (connected) to all clients:', deviceData.cameraName);
                io.emit('deviceConnectionLog', {
                    type: 'connected',
                    message: `✅ Device connected: ${deviceData.cameraName} (${deviceData.deviceIP})`,
                    sessionId: data.sessionId,
                    cameraName: deviceData.cameraName,
                    deviceInfo: {
                        cameraName: deviceData.cameraName,
                        deviceIP: deviceData.deviceIP,
                        deviceType: deviceData.deviceType
                    },
                    timestamp: new Date().toISOString()
                });
                
                // Emit device-specific log event (only to users viewing this device)
                io.emit(`device-log-${deviceId}`, logEntry);
                
                console.log('📤 [Backend] Sending success callback to frontend with sessionId:', data.sessionId);
                callback({ success: true, sessionId: data.sessionId });
            } else {
                const errorText = await response.text();
                console.error(`❌ [Backend] Python backend connection failed for ${deviceData.cameraName}:`, {
                    status: response.status,
                    statusText: response.statusText,
                    errorText: errorText,
                    deviceIP: deviceData.deviceIP,
                    pythonBackendUrl: PYTHON_BACKEND_URL
                });
                callback({ 
                    success: false, 
                    error: `Python backend error (${response.status}): ${errorText || response.statusText}` 
                });
            }
        } catch (error) {
            console.error(`❌ [Backend] Error connecting to Python backend for ${deviceData?.cameraName || 'unknown'}:`, {
                error: error.message,
                stack: error.stack,
                code: error.code,
                deviceIP: deviceData?.deviceIP,
                pythonBackendUrl: PYTHON_BACKEND_URL
            });
            
            let errorMessage = error.message;
            if (error.name === 'AbortError') {
                errorMessage = `Connection to Python backend timed out.`;
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage = `Cannot connect to Python backend at ${PYTHON_BACKEND_URL}. Is it running?`;
            } else if (error.code === 'ENOTFOUND') {
                errorMessage = `Python backend host not found: ${PYTHON_BACKEND_URL}`;
            }
            
            callback({ success: false, error: errorMessage });
        }
    });

    // Disconnect from device
    socket.on('disconnectDevice', async ({ sessionId }, callback) => {
        try {
            console.log('Forwarding disconnect request to Python backend:', sessionId);
            const response = await fetch(`${PYTHON_BACKEND_URL}/disconnect/${sessionId}`, {
                method: 'POST'
            });
            
            if (response.ok) {
                console.log('✅ Device disconnected via Python backend');
                
                // Get deviceId before disconnecting
                const deviceId = sessionToDeviceMap[sessionId];
                
                // Add disconnect log if deviceId exists
                if (deviceId && deviceLogs[deviceId]) {
                    const logEntry = {
                        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        timestamp: new Date().toISOString(),
                        message: `Session Ended - Disconnected from device`,
                        type: 'info',
                        userId: null
                    };
                    
                    deviceLogs[deviceId].push(logEntry);
                    
                    // Keep only last MAX_LOGS_PER_DEVICE logs
                    if (deviceLogs[deviceId].length > MAX_LOGS_PER_DEVICE) {
                        deviceLogs[deviceId] = deviceLogs[deviceId].slice(-MAX_LOGS_PER_DEVICE);
                    }
                    
                    // Emit device-specific log event
                    io.emit(`device-log-${deviceId}`, logEntry);
                }
                
                // Clean up session mapping
                delete sessionToDeviceMap[sessionId];
                
                callback({ success: true });
            } else {
                const errorText = await response.text();
                console.error('❌ Python backend disconnect failed:', errorText);
                callback({ success: false, error: 'Failed to disconnect from device' });
            }
        } catch (error) {
            console.error('Error disconnecting from Python backend:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Send remote control command
    socket.on('sendRemoteCommand', async ({ sessionId, type, params }, callback) => {
        try {
            console.log('📥 [Backend] Received sendRemoteCommand event:', { sessionId, type, params });
            
            if (!sessionId) {
                console.error('❌ [Backend] No sessionId provided in sendRemoteCommand');
                callback({ success: false, error: 'Session ID is required' });
                return;
            }

            const commandPayload = { type, ...params };
            console.log('📤 [Backend] Forwarding remote command to Python backend:', { sessionId, type, params, fullPayload: commandPayload, pythonBackendUrl: `${PYTHON_BACKEND_URL}/send/${sessionId}` });
            
            // Get deviceId from sessionId mapping
            const deviceId = sessionToDeviceMap[sessionId];
            console.log('📋 [Backend] DeviceId from mapping:', deviceId);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            let response;
            try {
                response = await fetch(`${PYTHON_BACKEND_URL}/send/${sessionId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        msg: commandPayload
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    console.error('❌ [Backend] Python backend request timeout:', fetchError);
                    callback({ success: false, error: 'Request timeout - TV may be unresponsive' });
                    return;
                }
                throw fetchError;
            }
            
            console.log('📡 [Backend] Python backend response status:', response.status, response.statusText);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ [Backend] Command sent via Python backend:', { command: commandPayload, result: data });
                
                // Check if Python backend returned an error indicating TV is disconnected
                if (data.status === 'error' && (data.error?.includes('off') || data.error?.includes('unreachable') || data.error?.includes('not connected'))) {
                    console.warn('⚠️ [Backend] Python backend indicates TV is disconnected:', data.error);
                    callback({
                        success: false,
                        error: data.error || 'TV is off or unreachable',
                        connected: false
                    });
                    return;
                }
                
                // Determine log type and message
                let logType = 'action';
                let logMessage = '';
                
                if (type === 'key' && params?.action) {
                    logMessage = `Button Press: ${params.action.toUpperCase()} - Navigation confirmed`;
                } else if (type === 'key' && params?.key) {
                    logMessage = `Navigation: ${params.key.toUpperCase()}`;
                } else if (type === 'app' && params?.app) {
                    logType = 'success';
                    logMessage = `App Launched: ${params.app} - Launch time: ${data.launchTime || 'N/A'}`;
                } else {
                    logMessage = `Command sent: ${type} ${params.action || params.key || ''}`;
                }
                
                // Add log entry to device logs (only if deviceId is found)
                if (deviceId) {
                    if (!deviceLogs[deviceId]) {
                        deviceLogs[deviceId] = [];
                    }
                    
                    const logEntry = {
                        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        timestamp: new Date().toISOString(),
                        message: logMessage,
                        type: logType,
                        userId: socketToDeviceMap[socket.id]?.userId || null
                    };
                    
                    deviceLogs[deviceId].push(logEntry);
                    
                    // Keep only last MAX_LOGS_PER_DEVICE logs
                    if (deviceLogs[deviceId].length > MAX_LOGS_PER_DEVICE) {
                        deviceLogs[deviceId] = deviceLogs[deviceId].slice(-MAX_LOGS_PER_DEVICE);
                    }
                    
                    // Emit device-specific log event (only to users viewing this device)
                    io.emit(`device-log-${deviceId}`, logEntry);
                }
                
                // Emit command log to ALL connected clients via Socket.IO (broadcast) - keep for backward compatibility
                console.log('📤 [Backend] Broadcasting deviceConnectionLog (command) to all clients:', type, params.action);
                io.emit('deviceConnectionLog', {
                    type: 'command',
                    message: `✅ Command sent: ${type} ${params.action || ''}`,
                    command: { type, ...params },
                    result: data,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                });
                
                // Automatically fetch and emit TV logs after command is sent
                try {
                    // First, get session info to get cameraName
                    let tvCameraName = null;
                    try {
                        const sessionResponse = await fetch(`${PYTHON_BACKEND_URL}/sessions/${sessionId}`);
                        if (sessionResponse.ok) {
                            const sessionData = await sessionResponse.json();
                            tvCameraName = sessionData?.tv_name || sessionData?.deviceInfo?.cameraName;
                            console.log('📡 [Backend] Session data for cameraName:', tvCameraName);
                        }
                    } catch (sessionErr) {
                        console.warn('⚠️ [Backend] Could not fetch session for cameraName:', sessionErr.message);
                    }
                    
                    const logsResponse = await fetch(`${PYTHON_BACKEND_URL}/sessions/${sessionId}/logs?max_lines=30&refresh=true`);
                    if (logsResponse.ok) {
                        const logsData = await logsResponse.json();
                        if (logsData.success && logsData.logs) {
                            // Emit TV logs to ALL connected clients via Socket.IO (broadcast)
                            console.log('📤 [Backend] Broadcasting deviceConnectionLog (tv_logs) to all clients. Logs length:', logsData.logs ? logsData.logs.length : 0, 'cameraName:', tvCameraName);
                            io.emit('deviceConnectionLog', {
                                type: 'tv_logs',
                                message: `📺 TV Logs (after ${type} ${params.action || ''}):`,
                                logs: logsData.logs,
                                sessionId: sessionId,
                                cameraName: tvCameraName,
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                } catch (logError) {
                    console.warn('⚠️ [Backend] Could not fetch logs after command:', logError.message);
                }
                
                callback({ success: true, data });
            } else {
                const errorText = await response.text();
                console.error('❌ Python backend command failed:', errorText);
                
                // Emit error log to ALL connected clients via Socket.IO (broadcast)
                console.log('📤 [Backend] Broadcasting deviceConnectionLog (error) to all clients:', type, params.action);
                io.emit('deviceConnectionLog', {
                    type: 'error',
                    message: `❌ Command failed: ${type} ${params.action || ''}`,
                    error: errorText,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                });
                
                callback({ success: false, error: 'Failed to send command' });
            }
        } catch (error) {
            console.error('Error sending command to Python backend:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Get device logs
    socket.on('getDeviceLogs', async ({ sessionId, cameraName, maxLines, refresh }, callback) => {
        try {
            let logSessionId = sessionId;
            
            // If no sessionId but cameraName provided, try to find active session
            if (!logSessionId && cameraName) {
                console.log('🔍 [Backend] No sessionId provided, checking for active session with cameraName:', cameraName);
                
                try {
                    // Query Python backend for sessions by tv_name (cameraName)
                    const sessionsResponse = await fetch(`${PYTHON_BACKEND_URL}/sessions?tv_name=${encodeURIComponent(cameraName)}`);
                    console.log('📡 [Backend] Querying sessions endpoint:', `${PYTHON_BACKEND_URL}/sessions?tv_name=${encodeURIComponent(cameraName)}`);
                    
                    if (sessionsResponse.ok) {
                        const sessions = await sessionsResponse.json();
                        console.log('📥 [Backend] Sessions response:', sessions);
                        
                        if (sessions && sessions.sessions && sessions.sessions.length > 0 && sessions.sessions[0].sessionId) {
                            logSessionId = sessions.sessions[0].sessionId;
                            console.log('✅ [Backend] Found active session for cameraName:', cameraName, 'sessionId:', logSessionId);
                        } else {
                            console.warn('⚠️ [Backend] No active session found for cameraName:', cameraName);
                            console.warn('⚠️ [Backend] Sessions returned:', sessions);
                        }
                    } else {
                        const errorText = await sessionsResponse.text();
                        console.warn('⚠️ [Backend] Failed to query sessions:', sessionsResponse.status, errorText);
                    }
                } catch (err) {
                    console.error('❌ [Backend] Error finding session by cameraName:', err.message);
                    console.error('❌ [Backend] Error stack:', err.stack);
                }
            }
            
            if (!logSessionId) {
                console.error('❌ [Backend] No sessionId found. cameraName provided:', cameraName);
                console.error('❌ [Backend] Cannot fetch logs without sessionId');
                callback({ 
                    success: false, 
                    error: `No active session found for device: ${cameraName || 'unknown'}. Please connect to the device first.` 
                });
                return;
            }
            
            console.log('Fetching device logs from Python backend:', { sessionId: logSessionId, cameraName, maxLines, refresh });
            const response = await fetch(
                `${PYTHON_BACKEND_URL}/sessions/${logSessionId}/logs?max_lines=${maxLines || 100}&refresh=${refresh || false}`
            );
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Logs fetched via Python backend:', {
                    success: data.success,
                    hasLogs: !!data.logs,
                    logLength: data.logs ? data.logs.length : 0,
                    logCount: data.log_count || 0
                });
                
                // Also emit logs directly to ALL connected clients via Socket.IO (broadcast)
                if (data.success && data.logs) {
                    console.log('📤 [Backend] Broadcasting TV logs via Socket.IO to all clients:', {
                        logLength: data.logs.length,
                        logCount: data.log_count || 0,
                        cameraName: cameraName
                    });
                    
                    io.emit('deviceConnectionLog', {
                        type: 'tv_logs',
                        message: '📺 TV Device Logs:',
                        logs: data.logs,
                        sessionId: logSessionId,
                        cameraName: cameraName,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    console.warn('⚠️ [Backend] No logs to emit:', {
                        success: data.success,
                        hasLogs: !!data.logs,
                        logCount: data.log_count || 0
                    });
                }
                
                callback({ success: true, ...data });
            } else {
                const errorText = await response.text();
                console.error('❌ Python backend logs fetch failed:', errorText);
                callback({ success: false, error: 'Failed to fetch logs' });
            }
        } catch (error) {
            console.error('Error fetching logs from Python backend:', error);
            callback({ success: false, error: error.message });
        }
    });

    socket.on('disconnect', async () => {
        console.log('👤 Client disconnected:', socket.id);

        // Get all device connections for this socket
        const connections = socketToDeviceMap[socket.id] || [];
        delete socketToDeviceMap[socket.id];

        // Process each device connection this socket was part of
        for (const connection of connections) {
            const { deviceId, userId, isStreamer, isViewer } = connection;

            if (isStreamer) {
                // 1. Handle Streamer Disconnect
                console.log(`🛑 Streamer disconnected from device ${deviceId}...`);
                
                // Cancel any pending cleanup for this device
                if (pendingCleanups[deviceId]) {
                    clearTimeout(pendingCleanups[deviceId]);
                    delete pendingCleanups[deviceId];
                }

                // Remove from room streamers
                if (roomStreamers[deviceId] && roomStreamers[deviceId].socketId === socket.id) {
                delete roomStreamers[deviceId];
                io.to(deviceId).emit('streamer-disconnected');
                }

                // DELAY cleanup to allow for refresh/reconnection
                // If streamer reconnects within 2 seconds, cleanup will be cancelled
                console.log(`⏳ Scheduling cleanup for device ${deviceId} in 2 seconds (allowing time for refresh/reconnection)...`);
                pendingCleanups[deviceId] = setTimeout(async () => {
                    console.log(`🧹 Executing delayed cleanup for device ${deviceId}...`);
                    try {
                        // Check if streamer reconnected (cleanup was cancelled)
                        const currentDevice = await Device.findByPk(deviceId);
                        if (currentDevice && currentDevice.streamerSocketId && currentDevice.streamerSocketId !== socket.id) {
                            console.log(`✅ Streamer reconnected to device ${deviceId} - skipping cleanup`);
                            delete pendingCleanups[deviceId];
                            return;
                        }

                        // No reconnection detected - proceed with cleanup
                        await Device.update({
                            isStreaming: false,
                            status: 'offline',
                            streamerSocketId: null,
                            userId: null,
                            username: null,
                            sessionId: null,
                            sessionTime: null,
                            streamerId: null,
                            streamerName: null,
                            streamerSessionId: null,
                            // Also clear viewer since streamer is gone
                            connectedViewerId: null,
                            connectedViewerName: null,
                            webrtcConnected: false
                        }, { where: { id: deviceId } });

                        io.emit('device-status-update', {
                            deviceId,
                            status: 'offline',
                            isStreaming: false,
                            streamerSocketId: null,
                            userId: null,
                            username: null,
                            connectedViewerId: null,
                            connectedViewerName: null,
                            webrtcConnected: false
                        });
                        console.log(`✅ Device ${deviceId} cleaned up - streamer disconnected`);
                        delete pendingCleanups[deviceId];
                    } catch (err) {
                        console.error(`❌ Error cleaning up streamer from device ${deviceId}:`, err);
                        delete pendingCleanups[deviceId];
                    }
                }, 2000); // 2 second delay to allow refresh/reconnection

            } else if (isViewer) {
                // 2. Handle Viewer Disconnect - Clear viewer AND userId/username
                console.log(`👁️ Viewer disconnected from device ${deviceId}. Clearing viewer and user info...`);
                
                try {
                    const device = await Device.findByPk(deviceId);
                    if (device && device.connectedViewerId === userId) {
                        // Clear viewer connection AND userId/username to make device available
                        // Keep status, isStreaming, streamerSocketId intact (streaming can continue)
                        await Device.update({
                            connectedViewerId: null,
                            connectedViewerName: null,
                            webrtcConnected: false,
                            userId: null,
                            username: null
                            // NOTE: We intentionally do NOT update:
                            // - status (keep as 'live' if streaming)
                            // - isStreaming (keep as true if streaming)
                            // - streamerSocketId (keep streamer connection)
                        }, { where: { id: deviceId } });

                        io.emit('device-status-update', {
                            deviceId,
                            connectedViewerId: null,
                            connectedViewerName: null,
                            webrtcConnected: false,
                            userId: null,
                            username: null
                            // NOTE: We don't broadcast status/isStreaming changes
                            // so streaming continues and device remains available
                        });
                        console.log(`✅ Device ${deviceId} viewer and user info cleared - device available for other users`);
                    }
                } catch (err) {
                    console.error(`❌ Error cleaning up viewer from device ${deviceId}:`, err);
                }
            }
        }

        // If no mapping found, try fallback cleanup (for backwards compatibility)
        if (connections.length === 0) {
            console.log(`⚠️ No mapping found for socket ${socket.id}, attempting fallback cleanup...`);
            
            // Check if this was a streamer (fallback)
            try {
                const device = await Device.findOne({ where: { streamerSocketId: socket.id } });
                if (device) {
                    console.log(`🛑 Fallback: Streamer disconnected from ${device.id}. Cleaning up...`);
                    await Device.update({
                        isStreaming: false,
                        status: 'offline',
                        streamerSocketId: null,
                        userId: null,
                        username: null,
                        sessionId: null,
                        sessionTime: null,
                        connectedViewerId: null,
                        connectedViewerName: null
                        }, { where: { id: device.id } });

                        io.emit('device-status-update', {
                            deviceId: device.id,
                            status: 'offline',
                            isStreaming: false,
                            streamerSocketId: null,
                            username: null,
                            connectedViewerId: null,
                            connectedViewerName: null,
                            webrtcConnected: false
                        });
                }
                    } catch (err) {
                console.error(`❌ Fallback cleanup error:`, err);
            }
        }
    });
});

const cookieParser = require('cookie-parser');

// Middleware
app.use((req, res, next) => {
    req.io = io; // Attach socket io instance
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Headers Origin:', req.headers['origin']);
    next();
});

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'CSRF-Token', 'X-XSRF-TOKEN', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Debug Middleware to check cookies
app.use((req, res, next) => {
    console.log('Cookies:', req.cookies);
    next();
});
app.use(passport.initialize());

// Models
require('./models/DeviceRequest');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', require('./features/users/user.routes'));
app.use('/api/roles', require('./features/roles/role.routes'));
app.use('/api/devices', require('./features/devices/device.routes'));
app.use('/api/requests', require('./features/requests/request.routes'));

// Health Check
app.get('/', (req, res) => {
    res.send('RemoteTv Backend is running');
});

// Database Connection & Server Start
const startServer = async () => {
    try {
        await initializeDatabase();
        // Use sync without alter to avoid "Too many keys" error on existing tables
        await sequelize.sync({ alter: false });
        console.log('✅ Database connected and synced');

        // Seed database
        await seedDatabase();

        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Database connection failed:', err);
    }
};

startServer();

