const DeviceRequest = require('../../models/DeviceRequest');
const Device = require('../../models/Device');
const User = require('../../models/User');

// Send a Request
exports.sendRequest = async (req, res) => {
    try {
        const { deviceId, requesterId, message } = req.body;

        const device = await Device.findByPk(deviceId);
        if (!device) return res.status(404).json({ message: 'Device not found' });

        // Use connectedViewerId if available (for connection requests), otherwise use userId (for device access requests)
        const targetUserId = device.connectedViewerId || device.userId;
        if (!targetUserId) return res.status(400).json({ message: 'Device is not currently occupied or no one is connected' });

        const request = await DeviceRequest.create({
            deviceId,
            requesterId,
            targetUserId: targetUserId,
            message,
            status: 'pending'
        });

        // Fetch requester details for the notification
        const requester = await User.findByPk(requesterId);

        // Emit Socket Event to the target user (connected viewer or device owner)
        if (req.io) {
            // Convert targetUserId to string to ensure type consistency
            const targetUserIdStr = String(targetUserId);
            
            // Send notification to the target user (connected viewer or device owner)
            req.io.emit(`request-received-${targetUserIdStr}`, {
                requestId: request.id,
                requesterId: requesterId,
                requesterName: requester ? requester.displayName : 'Unknown User',
                deviceName: device.name,
                deviceId: deviceId,
                message: message || 'Requesting access to connect',
                timestamp: new Date().toISOString()
            });
            console.log(`📬 Notification sent to user ${targetUserIdStr} (type: ${typeof targetUserIdStr}) for request ${request.id}`);
            console.log(`📬 Event name: request-received-${targetUserIdStr}`);
        } else {
            console.error('❌ req.io is not available - cannot send notification');
        }

        res.status(201).json({ message: 'Request sent successfully', request });
    } catch (error) {
        console.error('Send Request Error:', error);
        res.status(500).json({ message: 'Failed to send request' });
    }
};

// Respond to Request (Approve/Reject)
exports.respondRequest = async (req, res) => {
    try {
        const { requestId, status, reason } = req.body; // status: 'approved' | 'rejected'

        const request = await DeviceRequest.findByPk(requestId);
        if (!request) return res.status(404).json({ message: 'Request not found' });

        request.status = status;
        if (reason) request.rejectionReason = reason;
        await request.save();

        if (status === 'approved') {
            // RELEASE DEVICE logic - Only clear userId and username, keep stream running
            const device = await Device.findByPk(request.deviceId);
            if (device) {
                // Only clear userId and username - DO NOT affect streaming status
                await device.update({
                    userId: null,
                    username: null
                    // NOTE: We intentionally do NOT update:
                    // - status (keep as 'live' if streaming)
                    // - isStreaming (keep as true if streaming)
                    // - streamerSocketId (keep streamer connection)
                    // - sessionId, sessionTime (keep session info)
                    // - assignedTo (keep assignment)
                    // - connectedViewerId, connectedViewerName, webrtcConnected (keep viewer info if exists)
                });

                // Broadcast status update - only userId/username changes
                if (req.io) {
                    req.io.emit('device-status-update', {
                        deviceId: device.id,
                        userId: null,
                        username: null
                        // NOTE: We don't broadcast status/isStreaming changes
                        // so streaming continues and device remains available
                    });
                }

                // DO NOT force disconnect - stream continues running
                // The user can manually disconnect if needed
            }
        }

        // Notify Requester - Convert requesterId to string for consistent event name matching
        if (req.io) {
            const requesterIdStr = String(request.requesterId);
            req.io.emit(`request-response-${requesterIdStr}`, {
                requestId,
                status,
                reason,
                deviceId: request.deviceId
            });
            console.log(`📬 Response sent to requester ${requesterIdStr} (type: ${typeof requesterIdStr}) for request ${requestId}`);
            console.log(`📬 Event name: request-response-${requesterIdStr}`);
        }

        res.json({ message: `Request ${status}`, request });

    } catch (error) {
        console.error('Respond Request Error:', error);
        res.status(500).json({ message: 'Failed to respond to request' });
    }
};

// Get Pending Requests for Current User
exports.getPendingRequests = async (req, res) => {
    try {
        const { userId } = req.params;
        const requests = await DeviceRequest.findAll({
            where: { targetUserId: userId, status: 'pending' },
            include: [{ model: Device, attributes: ['name'] }]
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch requests' });
    }
};
