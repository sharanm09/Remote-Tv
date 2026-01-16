const Device = require('../../models/Device');
const { Op } = require('sequelize');

// Create a new device (Admin only)
const createDevice = async (req, res) => {
    try {
        const { name, type, model, serialNumber, status, location, assignedTo, specifications, notes } = req.body;

        // Validate required fields
        if (!name || !type) {
            return res.status(400).json({ message: 'Name and type are required' });
        }

        // Create device
        const device = await Device.create({
            name,
            type,
            model,
            serialNumber,
            status: status || 'offline', // Default to 'offline' (valid status: 'live', 'in_use', 'offline')
            location,
            assignedTo,
            specifications,
            notes,
            isStreaming: false, // Initialize streaming flag
            connectedViewerId: null, // Initialize connected viewer fields
            connectedViewerName: null,
            webrtcConnected: false // Initialize WebRTC connection status
        });

        // Remove connectedViewerId and connectedViewerName from response
        const deviceResponse = device.toJSON();
        delete deviceResponse.connectedViewerId;
        delete deviceResponse.connectedViewerName;

        res.status(201).json({
            message: 'Device created successfully',
            device: deviceResponse
        });
    } catch (error) {
        console.error('Create device error:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ message: 'Serial number already exists' });
        }
        res.status(500).json({ message: 'Error creating device', error: error.message });
    }
};

// Get all devices with pagination, search, and filters
const getAllDevices = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            search = '',
            status = '',
            type = '',
            location = ''
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build where clause for filters
        const whereClause = {};

        // Search by name, model, or serial number
        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { model: { [Op.like]: `%${search}%` } },
                { serialNumber: { [Op.like]: `%${search}%` } }
            ];
        }

        // Filter by status
        if (status) {
            whereClause.status = status;
        }

        // Filter by type
        if (type) {
            whereClause.type = type;
        }

        // Filter by location
        if (location) {
            whereClause.location = { [Op.like]: `%${location}%` };
        }

        // Get devices with pagination - exclude connectedViewerId and connectedViewerName
        const { count, rows: devices } = await Device.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: offset,
            order: [['createdAt', 'DESC']],
            attributes: {
                exclude: ['connectedViewerId', 'connectedViewerName']
            }
        });

        res.status(200).json({
            devices,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(count / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get devices error:', error);
        res.status(500).json({ message: 'Error fetching devices', error: error.message });
    }
};

// Get device by ID
const getDeviceById = async (req, res) => {
    try {
        const { id } = req.params;

        const device = await Device.findByPk(id, {
            attributes: {
                exclude: ['connectedViewerId', 'connectedViewerName']
            }
        });

        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        res.status(200).json({ device });
    } catch (error) {
        console.error('Get device error:', error);
        res.status(500).json({ message: 'Error fetching device', error: error.message });
    }
};

// Update device (Admin only)
const updateDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, model, serialNumber, status, location, assignedTo, specifications, notes } = req.body;

        const device = await Device.findByPk(id);

        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        // Update device
        await device.update({
            name: name || device.name,
            type: type || device.type,
            model: model !== undefined ? model : device.model,
            serialNumber: serialNumber !== undefined ? serialNumber : device.serialNumber,
            status: status || device.status,
            location: location !== undefined ? location : device.location,
            assignedTo: assignedTo !== undefined ? assignedTo : device.assignedTo,
            specifications: specifications !== undefined ? specifications : device.specifications,
            notes: notes !== undefined ? notes : device.notes
        });

        // Remove connectedViewerId and connectedViewerName from response
        const deviceResponse = device.toJSON();
        delete deviceResponse.connectedViewerId;
        delete deviceResponse.connectedViewerName;

        res.status(200).json({
            message: 'Device updated successfully',
            device: deviceResponse
        });
    } catch (error) {
        console.error('Update device error:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ message: 'Serial number already exists' });
        }
        res.status(500).json({ message: 'Error updating device', error: error.message });
    }
};

// Delete device (Admin only)
const deleteDevice = async (req, res) => {
    try {
        const { id } = req.params;

        const device = await Device.findByPk(id);

        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        await device.destroy();

        res.status(200).json({ message: 'Device deleted successfully' });
    } catch (error) {
        console.error('Delete device error:', error);
        res.status(500).json({ message: 'Error deleting device', error: error.message });
    }
};

// Clear connected viewer (when viewer disconnects)
// Note: Can be called without auth when using sendBeacon (browser close)
const clearConnectedViewer = async (req, res) => {
    try {
        const { id } = req.params;

        const device = await Device.findByPk(id);

        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        console.log(`🧹 Clearing viewer and user info from device ${id}`);

        // Clear viewer connection AND userId/username to make device available for other users
        // Keep status, isStreaming, streamerSocketId intact (streaming can continue)
        await device.update({
            connectedViewerId: null,
            connectedViewerName: null,
            webrtcConnected: false,
            userId: null,
            username: null
            // NOTE: We intentionally do NOT update:
            // - status (keep as 'live' if streaming)
            // - isStreaming (keep as true if streaming)
            // - streamerSocketId (keep streamer connection)
        });

        // Broadcast update via socket if available
        if (req.io) {
            req.io.emit('device-status-update', {
                deviceId: device.id,
                connectedViewerId: null,
                connectedViewerName: null,
                webrtcConnected: false,
                userId: null,
                username: null
                // NOTE: We don't broadcast status/isStreaming changes
                // so streaming continues and device remains available
            });
        }

        // Remove connectedViewerId and connectedViewerName from response
        const deviceResponse = device.toJSON();
        delete deviceResponse.connectedViewerId;
        delete deviceResponse.connectedViewerName;

        res.status(200).json({ message: 'Connected viewer cleared successfully', device: deviceResponse });
    } catch (error) {
        console.error('Clear connected viewer error:', error);
        res.status(500).json({ message: 'Error clearing connected viewer', error: error.message });
    }
};

// Admin: Stop streaming for a device
const adminStopStreaming = async (req, res) => {
    try {
        const { id } = req.params;
        const adminName = req.user?.displayName || req.user?.email || 'Admin';

        const device = await Device.findByPk(id);

        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        console.log(`🛑 Admin ${adminName} stopping streaming for device ${id}`);

        // Update device status
        await device.update({
            isStreaming: false,
            status: 'offline',
            userId: null,
            username: null,
            connectedViewerId: null,
            connectedViewerName: null,
            webrtcConnected: false
            // Keep streamerSocketId to notify streamer
        });

        // Broadcast update
        if (req.io) {
            req.io.emit('device-status-update', {
                deviceId: device.id,
                status: 'offline',
                isStreaming: false,
                userId: null,
                username: null,
                connectedViewerId: null,
                connectedViewerName: null,
                webrtcConnected: false
            });

            // Notify streamer to stop streaming
            if (device.streamerSocketId) {
                req.io.to(device.streamerSocketId).emit('admin-stopped-streaming', {
                    deviceId: device.id,
                    adminName
                });
            }

            // Notify all viewers to disconnect
            req.io.to(device.id).emit('admin-disconnected-device', {
                deviceId: device.id,
                adminName,
                message: 'Admin has disconnected the connection device'
            });
        }

        const deviceResponse = device.toJSON();
        delete deviceResponse.connectedViewerId;
        delete deviceResponse.connectedViewerName;

        res.status(200).json({ message: 'Streaming stopped successfully', device: deviceResponse });
    } catch (error) {
        console.error('Admin stop streaming error:', error);
        res.status(500).json({ message: 'Error stopping streaming', error: error.message });
    }
};

// Admin: Disconnect device (clear viewer and user, but keep streaming if active)
const adminDisconnectDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const adminName = req.user?.displayName || req.user?.email || 'Admin';

        const device = await Device.findByPk(id);

        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        console.log(`🔌 Admin ${adminName} disconnecting device ${id}`);

        // Clear viewer and user info, but keep streaming status
        await device.update({
            userId: null,
            username: null,
            connectedViewerId: null,
            connectedViewerName: null,
            webrtcConnected: false
            // Keep isStreaming, status, streamerSocketId if streaming
        });

        // Broadcast update
        if (req.io) {
            req.io.emit('device-status-update', {
                deviceId: device.id,
                userId: null,
                username: null,
                connectedViewerId: null,
                connectedViewerName: null,
                webrtcConnected: false
            });

            // Notify viewers to disconnect
            req.io.to(device.id).emit('admin-disconnected-device', {
                deviceId: device.id,
                adminName,
                message: 'Admin has disconnected the connection device'
            });
        }

        const deviceResponse = device.toJSON();
        delete deviceResponse.connectedViewerId;
        delete deviceResponse.connectedViewerName;

        res.status(200).json({ message: 'Device disconnected successfully', device: deviceResponse });
    } catch (error) {
        console.error('Admin disconnect device error:', error);
        res.status(500).json({ message: 'Error disconnecting device', error: error.message });
    }
};

module.exports = {
    createDevice,
    getAllDevices,
    getDeviceById,
    updateDevice,
    deleteDevice,
    clearConnectedViewer,
    adminStopStreaming,
    adminDisconnectDevice
};
