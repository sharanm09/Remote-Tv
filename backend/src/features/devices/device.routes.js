const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../../middleware/authMiddleware');
const {
    createDevice,
    getAllDevices,
    getDeviceById,
    updateDevice,
    deleteDevice,
    clearConnectedViewer,
    adminStopStreaming,
    adminDisconnectDevice
} = require('./device.controller');

// Middleware to check if user is admin
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role && req.user.role.toLowerCase() === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
};

// Middleware to check if user is admin or streamer
const adminOrStreamer = (req, res, next) => {
    const role = (req.user && req.user.role) ? req.user.role.toLowerCase() : '';
    if (role === 'admin' || role === 'streamer') {
        next();
    } else {
        return res.status(403).json({ message: 'Access denied. Admin or Streamer only.' });
    }
};

// Get all devices with pagination, search, and filters (accessible to all authenticated users)
router.get('/', isAuthenticated, getAllDevices);

// Get device by ID (accessible to all authenticated users)
router.get('/:id', isAuthenticated, getDeviceById);

// Create device (Admin only)
router.post('/', isAuthenticated, adminOnly, createDevice);

// Update device (Admin or Streamer)
router.patch('/:id', isAuthenticated, adminOrStreamer, updateDevice);

// Clear connected viewer (can be called without auth for browser close cleanup via sendBeacon)
// For sendBeacon from browser close, we allow unauthenticated requests
router.post('/:id/clear-viewer', (req, res, next) => {
    // If no auth token, allow it (for sendBeacon on browser close)
    // Otherwise check authentication
    if (req.headers.authorization) {
        return isAuthenticated(req, res, next);
    }
    next();
}, clearConnectedViewer);

// Delete device (Admin only)
router.delete('/:id', isAuthenticated, adminOnly, deleteDevice);

// Admin: Stop streaming (Admin only)
router.post('/:id/stop-streaming', isAuthenticated, adminOnly, adminStopStreaming);

// Admin: Disconnect device (Admin only)
router.post('/:id/disconnect', isAuthenticated, adminOnly, adminDisconnectDevice);

module.exports = router;
