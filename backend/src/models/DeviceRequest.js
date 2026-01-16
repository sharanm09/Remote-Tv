const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DeviceRequest = sequelize.define('DeviceRequest', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    deviceId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    requesterId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    targetUserId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
    },
    rejectionReason: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'device_requests',
    timestamps: true
});

module.exports = DeviceRequest;
