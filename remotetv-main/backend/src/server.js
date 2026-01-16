require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const socketIO = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');
const {
  createWorker,
  createRouter,
  createWebRtcTransport,
  getRouter,
} = require('./mediasoup');

const app = express();

// HTTP server - nginx handles HTTPS/SSL
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  // Increase timeouts to prevent disconnections
  pingTimeout: 60000, // 60 seconds - how long to wait for pong
  pingInterval: 25000, // 25 seconds - how often to send ping
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  // Connection options
  maxHttpBufferSize: 1e8, // 100MB
  connectTimeout: 45000, // 45 seconds
});

app.use(cors());
app.use(express.json());

const STREAM_PASSWORD = process.env.STREAM_PASSWORD || 'ifocus@123';
const PORT = process.env.PORT || 3001;
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

// Store active streams and their transports
const streams = new Map(); // cameraName -> { producers, transport, socketId, deviceInfo }
const viewers = new Map(); // socketId -> { consumers, transports }

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || '217.21.90.204',
  user: process.env.DB_USER || 'u635298195_remotetv',
  password: process.env.DB_PASSWORD || 'PC7ByIq5uC@',
  database: process.env.DB_NAME || 'u635298195_remotetv',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let dbPool = null;

// Initialize database connection
async function initDatabase() {
  try {
    dbPool = mysql.createPool(dbConfig);
    // Test connection
    const connection = await dbPool.getConnection();
    console.log('✅ Database connected successfully');
    
    // Create devices table if it doesn't exist
    await connection.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        camera_name VARCHAR(255) UNIQUE NOT NULL,
        device_ip VARCHAR(255) NOT NULL,
        device_type VARCHAR(50) DEFAULT 'samsung_tv',
        selected_camera_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_camera_name (camera_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    
    connection.release();
    console.log('✅ Devices table ready');
    
    // Migrate devices from JSON file to database if JSON file exists
    await migrateDevicesFromJson();
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    // Fallback to JSON file if database fails
    console.log('⚠️  Falling back to JSON file storage');
    return false;
  }
}


// Helper functions for device management (Database)
async function loadDevices() {
  try {
    if (!dbPool) {
      // Fallback to JSON
      return loadDevicesFromFile();
    }
    const [rows] = await dbPool.query('SELECT * FROM devices');
    const devices = {};
    rows.forEach(row => {
      devices[row.camera_name] = {
        cameraName: row.camera_name,
        deviceIP: row.device_ip,
        deviceType: row.device_type,
        selectedCameraId: row.selected_camera_id || '',
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
      };
    });
    return devices;
  } catch (error) {
    console.error('Error loading devices from database:', error);
    return loadDevicesFromFile();
  }
}

async function saveDevice(device) {
  try {
    if (!dbPool) {
      // Fallback to JSON
      return saveDeviceToFile(device);
    }
    await dbPool.query(`
      INSERT INTO devices (camera_name, device_ip, device_type, selected_camera_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        device_ip = VALUES(device_ip),
        device_type = VALUES(device_type),
        selected_camera_id = VALUES(selected_camera_id),
        updated_at = NOW()
    `, [device.cameraName, device.deviceIP, device.deviceType || 'samsung_tv', device.selectedCameraId || '']);
    return true;
  } catch (error) {
    console.error('Error saving device to database:', error);
    return saveDeviceToFile(device);
  }
}

async function deleteDevice(cameraName) {
  try {
    if (!dbPool) {
      // Fallback to JSON
      return deleteDeviceFromFile(cameraName);
    }
    await dbPool.query('DELETE FROM devices WHERE camera_name = ?', [cameraName]);
    return true;
  } catch (error) {
    console.error('Error deleting device from database:', error);
    return deleteDeviceFromFile(cameraName);
  }
}

// Fallback functions (JSON file)
const DEVICES_FILE = path.join(__dirname, 'devices.json');

// Migrate devices from JSON file to database - called during initDatabase
async function migrateDevicesFromJson() {
  try {
    if (!fs.existsSync(DEVICES_FILE)) {
      console.log('No JSON devices file found, skipping migration');
      return;
    }
    
    const jsonDevices = loadDevicesFromFile();
    if (Object.keys(jsonDevices).length === 0) {
      console.log('No devices in JSON file, skipping migration');
      return;
    }
    
    console.log(`Found ${Object.keys(jsonDevices).length} device(s) in JSON file, migrating to database...`);
    
    // Check which devices already exist in database
    const [existingRows] = await dbPool.query('SELECT camera_name FROM devices');
    const existingDevices = new Set(existingRows.map(row => row.camera_name));
    
    // Migrate devices that don't exist in database
    let migratedCount = 0;
    for (const [cameraName, device] of Object.entries(jsonDevices)) {
      if (!existingDevices.has(cameraName)) {
        await dbPool.query(`
          INSERT INTO devices (camera_name, device_ip, device_type, selected_camera_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NOW())
        `, [
          device.cameraName,
          device.deviceIP,
          device.deviceType || 'samsung_tv',
          device.selectedCameraId || '',
          device.createdAt ? new Date(device.createdAt) : new Date()
        ]);
        migratedCount++;
        console.log(`  ✅ Migrated device: ${cameraName}`);
      }
    }
    
    if (migratedCount > 0) {
      console.log(`✅ Successfully migrated ${migratedCount} device(s) from JSON to database`);
      // Optionally backup the JSON file
      const backupPath = `${DEVICES_FILE}.backup.${Date.now()}`;
      fs.copyFileSync(DEVICES_FILE, backupPath);
      console.log(`  📁 JSON file backed up to: ${backupPath}`);
    } else {
      console.log('✅ All devices already in database, no migration needed');
    }
  } catch (error) {
    console.error('❌ Error migrating devices from JSON:', error.message);
    // Don't fail initialization if migration fails
  }
}

function loadDevicesFromFile() {
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      const data = fs.readFileSync(DEVICES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading devices from file:', error);
  }
  return {};
}

function saveDeviceToFile(device) {
  try {
    const devices = loadDevicesFromFile();
    devices[device.cameraName] = {
      cameraName: device.cameraName,
      deviceIP: device.deviceIP,
      deviceType: device.deviceType || 'samsung_tv',
      selectedCameraId: device.selectedCameraId || '',
      createdAt: device.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving device to file:', error);
    return false;
  }
}

function deleteDeviceFromFile(cameraName) {
  try {
    const devices = loadDevicesFromFile();
    delete devices[cameraName];
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error deleting device from file:', error);
    return false;
  }
}

// Initialize database and mediasoup
(async () => {
  await initDatabase();
  try {
  await createWorker();
  await createRouter();
  console.log('Mediasoup initialized');
  } catch (error) {
    console.error('Mediasoup initialization failed:', error.message);
  }
})();

// REST API endpoints
app.get('/api/streams', (req, res) => {
  const streamList = Array.from(streams.entries()).map(([cameraName, streamData]) => ({
    cameraName,
    active: true,
    deviceInfo: streamData.deviceInfo || null,
  }));
  res.json(streamList);
});

// Get device info for a specific stream
app.get('/api/stream/:cameraName/device', (req, res) => {
  const { cameraName } = req.params;
  const stream = streams.get(cameraName);
  
  if (stream && stream.deviceInfo) {
    res.json({ 
      success: true, 
      deviceInfo: stream.deviceInfo 
    });
  } else {
    res.status(404).json({ 
      success: false, 
      message: 'Device info not found for this camera' 
    });
  }
});

// Device Management API Endpoints

// Get all saved devices
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await loadDevices();
    res.json({ success: true, devices });
  } catch (error) {
    console.error('Error getting devices:', error);
    res.status(500).json({ success: false, error: 'Failed to get devices' });
  }
});

// Add or update a device
app.post('/api/devices', async (req, res) => {
  try {
    const { cameraName, deviceIP, deviceType, selectedCameraId } = req.body;
    
    if (!cameraName || !deviceIP) {
      return res.status(400).json({ 
        success: false, 
        error: 'cameraName and deviceIP are required' 
      });
    }
    
    const device = {
      cameraName,
      deviceIP,
      deviceType: deviceType || 'samsung_tv',
      selectedCameraId: selectedCameraId || ''
    };
    
    if (await saveDevice(device)) {
      console.log(`Device saved: ${cameraName}`);
      const devices = await loadDevices();
      res.json({ success: true, device: devices[cameraName] });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save device' });
    }
  } catch (error) {
    console.error('Error adding device:', error);
    res.status(500).json({ success: false, error: 'Failed to add device' });
  }
});

// Update a device
app.put('/api/devices/:deviceName', async (req, res) => {
  try {
    const { deviceName } = req.params;
    const { deviceIP, deviceType, selectedCameraId } = req.body;
    
    const devices = await loadDevices();
    
    if (!devices[deviceName]) {
      return res.status(404).json({ 
        success: false, 
        error: 'Device not found' 
      });
    }
    
    const device = {
      cameraName: deviceName,
      deviceIP: deviceIP || devices[deviceName].deviceIP,
      deviceType: deviceType || devices[deviceName].deviceType,
      selectedCameraId: selectedCameraId !== undefined ? selectedCameraId : devices[deviceName].selectedCameraId,
      createdAt: devices[deviceName].createdAt
    };
    
    if (await saveDevice(device)) {
      console.log(`Device updated: ${deviceName}`);
      const updatedDevices = await loadDevices();
      res.json({ success: true, device: updatedDevices[deviceName] });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update device' });
    }
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({ success: false, error: 'Failed to update device' });
  }
});

// Delete a device
app.delete('/api/devices/:deviceName', async (req, res) => {
  try {
    const { deviceName } = req.params;
    const devices = await loadDevices();
    
    if (!devices[deviceName]) {
      return res.status(404).json({ 
        success: false, 
        error: 'Device not found' 
      });
    }
    
    if (await deleteDevice(deviceName)) {
      console.log(`Device deleted: ${deviceName}`);
      res.json({ success: true, message: 'Device deleted successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to delete device' });
    }
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ success: false, error: 'Failed to delete device' });
  }
});

app.post('/api/authenticate-stream', (req, res) => {
  const { password } = req.body;
  if (password === STREAM_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// Socket.IO signaling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Get RTP capabilities
  socket.on('getRouterRtpCapabilities', (callback) => {
    try {
    const router = getRouter();
      if (router && router.rtpCapabilities) {
        console.log('✅ Returning RTP capabilities from router');
    callback(router.rtpCapabilities);
      } else {
        console.error('❌ Router not available yet, waiting...');
        // Wait a bit for router to initialize
        setTimeout(() => {
          const router2 = getRouter();
          if (router2 && router2.rtpCapabilities) {
            console.log('✅ Returning RTP capabilities after wait');
            callback(router2.rtpCapabilities);
          } else {
            console.error('❌ Router still not available');
            // Return minimal valid structure as fallback
            callback({
              codecs: [
                {
                  kind: 'audio',
                  mimeType: 'audio/opus',
                  clockRate: 48000,
                  channels: 2
                },
                {
                  kind: 'video',
                  mimeType: 'video/VP8',
                  clockRate: 90000
                }
              ],
              headerExtensions: [],
              fecMechanisms: []
            });
          }
        }, 500);
      }
    } catch (error) {
      console.error('Error getting RTP capabilities:', error);
      // Return minimal valid structure as fallback
      callback({
        codecs: [
          {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2
          },
          {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000
          }
        ],
        headerExtensions: [],
        fecMechanisms: []
      });
    }
  });


  // Connect producer transport
  socket.on('connectProducerTransport', async ({ dtlsParameters }, callback) => {
    try {
      if (!socket.producerTransport) {
        console.error(`❌ [Backend] Producer transport not found for socket ${socket.id}`);
        callback({ error: 'Transport not found' });
        return;
      }

      console.log(`🔐 [Backend] Connecting producer transport DTLS for socket ${socket.id}:`, {
        transportId: socket.producerTransport.id,
        role: dtlsParameters.role,
        fingerprintsCount: dtlsParameters.fingerprints?.length || 0,
        transportState: socket.producerTransport.connectionState
      });

      await socket.producerTransport.connect({ dtlsParameters });
      console.log(`✅ [Backend] Producer transport DTLS connected for socket ${socket.id}:`, {
        transportId: socket.producerTransport.id,
        connectionState: socket.producerTransport.connectionState,
        timestamp: new Date().toISOString()
      });
      callback({ success: true });
    } catch (error) {
      console.error(`❌ [Backend] Error connecting producer transport DTLS for socket ${socket.id}:`, {
        error: error.message,
        stack: error.stack,
        transportId: socket.producerTransport?.id,
        transportState: socket.producerTransport?.connectionState
      });
      callback({ error: error.message });
    }
  });

  // Handle producer ICE candidates
  socket.on('producerIceCandidate', async ({ candidate }) => {
    try {
      if (!socket.producerTransport) {
        console.warn(`⚠️ [Backend] Producer transport not found for ICE candidate from socket ${socket.id}`);
        return;
      }
      
      if (candidate === null) {
        console.log(`🧊 [Backend] Producer ICE gathering complete (client side) for socket ${socket.id}`);
      } else {
        console.log(`🔗 [Backend] Adding producer ICE candidate from client for socket ${socket.id}:`, {
          foundation: candidate.foundation,
          priority: candidate.priority,
          ip: candidate.ip,
          port: candidate.port,
          type: candidate.type,
          protocol: candidate.protocol,
          transportState: socket.producerTransport.connectionState
        });
        await socket.producerTransport.addRemoteCandidate(candidate);
        console.log(`✅ [Backend] Producer ICE candidate added successfully for socket ${socket.id}`);
      }
    } catch (error) {
      console.error(`❌ [Backend] Error adding producer ICE candidate for socket ${socket.id}:`, {
        error: error.message,
        candidate: candidate ? {
          ip: candidate.ip,
          port: candidate.port,
          type: candidate.type
        } : null,
        transportState: socket.producerTransport?.connectionState
      });
    }
  });

  // Create WebRTC transport for producer (camera)
  socket.on('createProducerTransport', async (callback) => {
    try {
      console.log(`🔨 [Backend] Creating producer transport for socket ${socket.id}...`);
      const transport = await createWebRtcTransport();
      
      socket.producerTransport = transport;

      console.log(`✅ [Backend] Producer transport created:`, {
        id: transport.id,
        socketId: socket.id,
        connectionState: transport.connectionState,
        iceGatheringState: transport.iceGatheringState
      });

      // Monitor connection state changes
      transport.on('connectionstatechange', (state) => {
        console.log(`🔄 [Backend] PRODUCER transport connection state change for socket ${socket.id}:`, {
          previous: transport.connectionState,
          current: state,
          transportId: transport.id,
          timestamp: new Date().toISOString()
        });

        if (state === 'connected') {
          console.log(`✅ [Backend] Producer transport CONNECTED for socket ${socket.id}`);
        } else if (state === 'failed') {
          console.error(`❌ [Backend] Producer transport FAILED for socket ${socket.id}:`, {
            transportId: transport.id,
            connectionState: transport.connectionState,
            iceConnectionState: transport.iceConnectionState,
            iceGatheringState: transport.iceGatheringState
          });
        } else if (state === 'closed') {
          console.error(`❌ [Backend] Producer transport CLOSED for socket ${socket.id}`);
        } else if (state === 'connecting') {
          console.log(`⏳ [Backend] Producer transport CONNECTING for socket ${socket.id}...`);
        }
      });

      transport.on('icestatechange', (state) => {
        console.log(`🧊 [Backend] PRODUCER transport ICE state change for socket ${socket.id}:`, {
          state: state,
          timestamp: new Date().toISOString()
        });
      });

      // Send ICE candidates as they are gathered
      transport.on('icecandidate', (event) => {
        if (event.candidate) {
          console.log(`🧊 [Backend] PRODUCER ICE candidate generated for socket ${socket.id}:`, {
            foundation: event.candidate.foundation,
            priority: event.candidate.priority,
            ip: event.candidate.ip,
            port: event.candidate.port,
            type: event.candidate.type,
            protocol: event.candidate.protocol
          });
          socket.emit('newProducerIceCandidate', {
            candidate: event.candidate,
          });
        } else {
          console.log(`🧊 [Backend] Producer ICE gathering complete for socket ${socket.id}`);
          socket.emit('newProducerIceCandidate', {
            candidate: null, // Signal completion
          });
        }
      });

      // Wait for ICE gathering to complete before sending candidates
      transport.on('icegatheringstatechange', (iceGatheringState) => {
        console.log(`🧊 [Backend] Producer transport ICE gathering state change for socket ${socket.id}:`, {
          state: iceGatheringState,
          candidatesCount: transport.iceCandidates?.length || 0
        });
        if (iceGatheringState === 'complete') {
          console.log(`🧊 [Backend] Producer ICE gathering complete, sending final candidates for socket ${socket.id}`);
          socket.emit('newProducerIceCandidate', {
            candidate: null, // Signal completion
            iceCandidates: transport.iceCandidates,
          });
        }
      });

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates || [],
        dtlsParameters: transport.dtlsParameters,
      });

      console.log(`📤 [Backend] Producer transport params sent to client for socket ${socket.id}:`, {
        id: transport.id,
        hasIceParameters: !!transport.iceParameters,
        hasDtlsParameters: !!transport.dtlsParameters,
        iceCandidatesCount: transport.iceCandidates?.length || 0
      });
    } catch (error) {
      console.error(`❌ [Backend] Error creating producer transport for socket ${socket.id}:`, error);
      callback({ error: error.message });
    }
  });

  // Produce media (from camera)
  socket.on('produce', async ({ kind, rtpParameters, cameraName, deviceInfo }, callback) => {
    try {
      const producer = await socket.producerTransport.produce({
        kind,
        rtpParameters,
      });

      console.log(`Producer created for ${cameraName} [kind:${kind}]`);

      // Store stream info with device info
      if (!streams.has(cameraName)) {
        streams.set(cameraName, {
          producers: {},
          transport: socket.producerTransport,
          socketId: socket.id,
          deviceInfo: deviceInfo || null,
        });
      } else {
        // Update device info if provided
        if (deviceInfo) {
          streams.get(cameraName).deviceInfo = deviceInfo;
        }
      }

      streams.get(cameraName).producers[kind] = producer;

      producer.on('transportclose', () => {
        console.log(`Producer transport closed for ${cameraName}`);
        const stream = streams.get(cameraName);
        if (stream && stream.producers[kind]) {
          delete stream.producers[kind];
        }
      });

      callback({ id: producer.id });

      // Notify all viewers about new stream
      socket.broadcast.emit('newStream', { cameraName });
    } catch (error) {
      console.error('Error producing:', error);
      callback({ error: error.message });
    }
  });

  // Create WebRTC transport for consumer (viewer)
  socket.on('createConsumerTransport', async ({ cameraName }, callback) => {
    try {
      console.log(`🔨 [Backend] Creating consumer transport for ${cameraName} (socket ${socket.id})...`);
      const transport = await createWebRtcTransport();
      
      if (!viewers.has(socket.id)) {
        viewers.set(socket.id, {
          transports: {},
          consumers: {},
        });
      }

      if (!viewers.get(socket.id).transports[cameraName]) {
        viewers.get(socket.id).transports[cameraName] = {};
      }

      viewers.get(socket.id).transports[cameraName].transport = transport;

      console.log(`✅ [Backend] Consumer transport created for ${cameraName}:`, {
        id: transport.id,
        socketId: socket.id,
        connectionState: transport.connectionState,
        iceGatheringState: transport.iceGatheringState
      });

      // Monitor connection state changes
      transport.on('connectionstatechange', (state) => {
        console.log(`🔄 [Backend] CONSUMER transport connection state change for ${cameraName} (socket ${socket.id}):`, {
          previous: transport.connectionState,
          current: state,
          transportId: transport.id,
          timestamp: new Date().toISOString()
        });

        if (state === 'connected') {
          console.log(`✅ [Backend] Consumer transport CONNECTED for ${cameraName} (socket ${socket.id})`);
        } else if (state === 'failed') {
          console.error(`❌ [Backend] Consumer transport FAILED for ${cameraName} (socket ${socket.id}):`, {
            transportId: transport.id,
            connectionState: transport.connectionState,
            iceConnectionState: transport.iceConnectionState,
            iceGatheringState: transport.iceGatheringState
          });
        } else if (state === 'closed') {
          console.error(`❌ [Backend] Consumer transport CLOSED for ${cameraName} (socket ${socket.id})`);
        } else if (state === 'connecting') {
          console.log(`⏳ [Backend] Consumer transport CONNECTING for ${cameraName} (socket ${socket.id})...`);
        }
      });

      transport.on('icestatechange', (state) => {
        console.log(`🧊 [Backend] CONSUMER transport ICE state change for ${cameraName} (socket ${socket.id}):`, {
          state: state,
          timestamp: new Date().toISOString()
        });
      });

      // Wait for ICE gathering to complete before sending candidates
      transport.on('icegatheringstatechange', (iceGatheringState) => {
        console.log(`🧊 [Backend] Consumer transport ICE gathering state change for ${cameraName} (socket ${socket.id}):`, {
          state: iceGatheringState,
          candidatesCount: transport.iceCandidates?.length || 0
        });
        if (iceGatheringState === 'complete') {
          console.log(`🧊 [Backend] Consumer ICE gathering complete, sending final candidates for ${cameraName} (socket ${socket.id})`);
          // Send all collected candidates
          socket.emit('newConsumerIceCandidate', {
            cameraName,
            candidate: null, // Signal completion
            iceCandidates: transport.iceCandidates,
          });
        }
      });

      // Send ICE candidates as they are gathered
      transport.on('icecandidate', (event) => {
        if (event.candidate) {
          console.log(`🧊 [Backend] CONSUMER ICE candidate generated for ${cameraName} (socket ${socket.id}):`, {
            foundation: event.candidate.foundation,
            priority: event.candidate.priority,
            ip: event.candidate.ip,
            port: event.candidate.port,
            type: event.candidate.type,
            protocol: event.candidate.protocol
          });
          socket.emit('newConsumerIceCandidate', {
            cameraName,
            candidate: event.candidate,
          });
        } else {
          console.log(`🧊 [Backend] Consumer ICE gathering complete (no more candidates) for ${cameraName} (socket ${socket.id})`);
        }
      });

      // Send initial transport info
      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates || [],
        dtlsParameters: transport.dtlsParameters,
      });

      console.log(`📤 [Backend] Consumer transport params sent to client for ${cameraName} (socket ${socket.id}):`, {
        id: transport.id,
        hasIceParameters: !!transport.iceParameters,
        hasDtlsParameters: !!transport.dtlsParameters,
        iceCandidatesCount: transport.iceCandidates?.length || 0
      });
    } catch (error) {
      console.error(`❌ [Backend] Error creating consumer transport for ${cameraName} (socket ${socket.id}):`, error);
      callback({ error: error.message });
    }
  });

  // Handle consumer ICE candidate from client
  socket.on('consumerIceCandidate', async ({ cameraName, candidate }) => {
    try {
      const viewer = viewers.get(socket.id);
      if (!viewer || !viewer.transports[cameraName] || !viewer.transports[cameraName].transport) {
        console.warn(`⚠️ [Backend] Consumer transport not found for ICE candidate from ${cameraName} (socket ${socket.id})`);
        return;
      }

      const transport = viewer.transports[cameraName].transport;

      if (candidate === null) {
        console.log(`🧊 [Backend] Consumer ICE gathering complete (client side) for ${cameraName} (socket ${socket.id})`);
      } else {
        console.log(`🔗 [Backend] Adding consumer ICE candidate from client for ${cameraName} (socket ${socket.id}):`, {
          foundation: candidate.foundation,
          priority: candidate.priority,
          ip: candidate.ip,
          port: candidate.port,
          type: candidate.type,
          protocol: candidate.protocol,
          transportState: transport.connectionState
        });
        await transport.addRemoteCandidate(candidate);
        console.log(`✅ [Backend] Consumer ICE candidate added successfully for ${cameraName} (socket ${socket.id})`);
      }
    } catch (error) {
      console.error(`❌ [Backend] Error adding consumer ICE candidate for ${cameraName} (socket ${socket.id}):`, {
        error: error.message,
        candidate: candidate ? {
          ip: candidate.ip,
          port: candidate.port,
          type: candidate.type
        } : null,
        transportState: viewers.get(socket.id)?.transports[cameraName]?.transport?.connectionState
      });
    }
  });

  // Connect consumer transport
  socket.on(
    'connectConsumerTransport',
    async ({ cameraName, dtlsParameters }, callback) => {
      try {
        const viewer = viewers.get(socket.id);
        if (!viewer || !viewer.transports[cameraName] || !viewer.transports[cameraName].transport) {
          console.error(`❌ [Backend] Consumer transport not found for ${cameraName} (socket ${socket.id})`);
          callback({ error: 'Transport not found' });
          return;
        }
        const transport = viewer.transports[cameraName].transport;

        console.log(`🔐 [Backend] Connecting consumer transport DTLS for ${cameraName} (socket ${socket.id}):`, {
          transportId: transport.id,
          role: dtlsParameters.role,
          fingerprintsCount: dtlsParameters.fingerprints?.length || 0,
          transportState: transport.connectionState
        });

        await transport.connect({ dtlsParameters });
        console.log(`✅ [Backend] Consumer transport DTLS connected for ${cameraName} (socket ${socket.id}):`, {
          transportId: transport.id,
          connectionState: transport.connectionState,
          timestamp: new Date().toISOString()
        });
        callback({ success: true });
      } catch (error) {
        console.error(`❌ [Backend] Error connecting consumer transport DTLS for ${cameraName} (socket ${socket.id}):`, {
          error: error.message,
          stack: error.stack,
          transportId: viewer?.transports[cameraName]?.transport?.id,
          transportState: viewer?.transports[cameraName]?.transport?.connectionState
        });
        callback({ error: error.message });
      }
    }
  );

  // Consume media (for viewer)
  socket.on('consume', async ({ cameraName, rtpCapabilities }, callback) => {
    try {
      const stream = streams.get(cameraName);
      if (!stream) {
        callback({ error: 'Stream not found' });
        return;
      }

      const router = getRouter();
      const viewer = viewers.get(socket.id);
      const transport = viewer.transports[cameraName].transport;

      const consumersData = [];

      // Consume video and audio
      for (const [kind, producer] of Object.entries(stream.producers)) {
        if (
          router.canConsume({
            producerId: producer.id,
            rtpCapabilities,
          })
        ) {
          const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true, // Start paused, will resume after client is ready
          });

          console.log(`Consumer created for ${cameraName} [kind:${kind}]`);

          if (!viewer.consumers[cameraName]) {
            viewer.consumers[cameraName] = {};
          }
          viewer.consumers[cameraName][kind] = consumer;

          consumer.on('transportclose', () => {
            console.log('Consumer transport closed');
          });

          consumer.on('producerclose', () => {
            console.log('Consumer producer closed');
            socket.emit('producerClosed', { cameraName, kind });
          });

          consumersData.push({
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          });
        }
      }

      callback({ consumers: consumersData });
    } catch (error) {
      console.error('Error consuming:', error);
      callback({ error: error.message });
    }
  });

  // Resume consumer (to start receiving media)
  socket.on('resumeConsumer', async ({ cameraName, consumerId }, callback) => {
    try {
      const viewer = viewers.get(socket.id);
      if (!viewer || !viewer.consumers[cameraName]) {
        callback({ error: 'Consumer not found' });
        return;
      }

      // Find and resume the consumer by ID
      let consumerFound = false;
      for (const [kind, consumer] of Object.entries(viewer.consumers[cameraName])) {
        if (consumer && consumer.id === consumerId) {
          await consumer.resume();
          console.log(`Consumer resumed for ${cameraName} [kind:${kind}, id:${consumerId}]`);
          callback({ success: true });
          consumerFound = true;
          return;
        }
      }

      if (!consumerFound) {
        console.error(`Consumer ID ${consumerId} not found for ${cameraName}. Available consumers:`, 
          Object.keys(viewer.consumers[cameraName] || {}));
        callback({ error: 'Consumer ID not found' });
      }
    } catch (error) {
      console.error('Error resuming consumer:', error);
      callback({ error: error.message });
    }
  });

  // Get active streams
  socket.on('getStreams', (callback) => {
    const streamList = Array.from(streams.keys()).map((cameraName) => {
      const streamData = streams.get(cameraName);
      return {
      cameraName,
      active: true,
        deviceInfo: streamData?.deviceInfo || null,
      };
    });
    callback(streamList);
  });

  // Register camera stream
  socket.on('registerStream', ({ cameraName, password }, callback) => {
    // Password is optional - user may have already authenticated via HTTP
    if (password && password !== STREAM_PASSWORD) {
      callback({ success: false, message: 'Invalid password' });
      return;
    }

    callback({ success: true });
  });

  // ===== Remote Control Handlers (Python Backend Proxy) =====
  
  // Check existing session for device
  socket.on('checkExistingSession', async ({ deviceData }, callback) => {
    try {
      console.log('Checking existing session for device:', deviceData);
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${PYTHON_BACKEND_URL}/sessions/check/${deviceData.deviceIP}?device_type=${deviceData.deviceType}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Session check result:', data.exists ? 'Found existing' : 'No existing session');
        callback({ success: true, ...data });
      } else {
        console.error('❌ Session check failed:', response.statusText);
        callback({ success: false, exists: false });
      }
    } catch (error) {
      console.error('Error checking existing session:', error);
      callback({ success: false, exists: false });
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
      
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${PYTHON_BACKEND_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: deviceData.deviceIP,
          device_type: deviceData.deviceType,
          tv_name: deviceData.cameraName
        }),
        timeout: 10000 // 10 second timeout
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
          deviceIP: deviceData.deviceIP
        });
        
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
        errno: error.errno,
        syscall: error.syscall,
        deviceIP: deviceData?.deviceIP,
        pythonBackendUrl: PYTHON_BACKEND_URL
      });
      
      let errorMessage = error.message;
      if (error.code === 'ECONNREFUSED') {
        errorMessage = `Cannot connect to Python backend at ${PYTHON_BACKEND_URL}. Is it running?`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = `Connection to Python backend timed out.`;
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
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${PYTHON_BACKEND_URL}/disconnect/${sessionId}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        console.log('✅ Device disconnected via Python backend');
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
      console.log('Forwarding remote command to Python backend:', { sessionId, type, params });
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${PYTHON_BACKEND_URL}/send/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg: { type, ...params }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Command sent via Python backend:', data);
        
        // Emit command log to ALL connected clients via Socket.IO (broadcast)
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
      const fetch = (await import('node-fetch')).default;
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
            
            if (sessions && sessions.length > 0 && sessions[0].sessionId) {
              logSessionId = sessions[0].sessionId;
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

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // Clean up producer
    for (const [cameraName, stream] of streams.entries()) {
      if (stream.socketId === socket.id) {
        console.log(`Removing stream: ${cameraName}`);
        for (const producer of Object.values(stream.producers)) {
          producer.close();
        }
        stream.transport.close();
        streams.delete(cameraName);
        io.emit('streamEnded', { cameraName });
      }
    }

    // Clean up consumer
    const viewer = viewers.get(socket.id);
    if (viewer) {
      for (const [cameraName, consumers] of Object.entries(viewer.consumers)) {
        for (const consumer of Object.values(consumers)) {
          consumer.close();
        }
      }
      for (const [cameraName, transportData] of Object.entries(viewer.transports)) {
        if (transportData.transport) {
          transportData.transport.close();
        }
      }
      viewers.delete(socket.id);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const serverIP = process.env.SERVER_IP || '127.0.0.1';
  console.log(`🌐 HTTP Server running on port ${PORT} (nginx handles HTTPS)`);
  console.log(`Local access: http://127.0.0.1:${PORT}`);
  console.log(`Network access: http://${serverIP}:${PORT}`);
  console.log(`Public access: https://remotetv.ifocussystec.info (via nginx)`);
  console.log(`Stream password: ${STREAM_PASSWORD}`);
  console.log(`Python backend URL: ${PYTHON_BACKEND_URL}`);
});

