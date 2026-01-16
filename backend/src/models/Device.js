const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Device = sequelize.define('Device', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true,
            isIn: [['Android TV', 'LG WebOS', 'Samsung Tizen', 'Apple tvOS', 'Vidaa', 'Roku']]
        }
    },
    model: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'offline',
        validate: {
            isIn: [['live', 'in_use', 'offline']]
        }
    },
    location: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isStreaming: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false
    },
    streamerSocketId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    assignedTo: {
        type: DataTypes.STRING,
        allowNull: true
    },
    userId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    username: {
        type: DataTypes.STRING,
        allowNull: true
    },
    connectedViewerId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    connectedViewerName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    webrtcConnected: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false
    },
    sessionId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    sessionTime: {
        type: DataTypes.STRING,
        allowNull: true
    },
    specifications: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'devices',
    timestamps: true
});

module.exports = Device;
