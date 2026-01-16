const { sequelize } = require('../config/database');
const Device = require('../models/Device');

const devices = [
    {
        name: 'LG Smart TV',
        type: 'LG WebOS',
        model: 'LG OLED C3 55"',
        status: 'offline',
        location: null,
        assignedTo: null,
        userId: null,
        username: null,
        sessionId: null,
        sessionTime: null,
        specifications: {
            osVersion: 'webOS 23',
            ipAddress: '192.168.1.101',
            backendUrl: 'http://localhost:3000'
        },
        notes: null
    },
    {
        name: 'Samsung QLED TV',
        type: 'Samsung Tizen',
        model: 'Samsung QN90C 65"',
        status: 'offline',
        location: null,
        assignedTo: null,
        userId: null,
        username: null,
        sessionId: null,
        sessionTime: null,
        specifications: {
            osVersion: 'Tizen 7.0',
            ipAddress: '192.168.1.102',
            backendUrl: 'http://localhost:3000'
        },
        notes: null
    },
    {
        name: 'Android TV Box',
        type: 'Android TV',
        model: 'Sony Bravia XR-55A80K',
        status: 'offline',
        location: null,
        assignedTo: null,
        userId: null,
        username: null,
        sessionId: null,
        sessionTime: null,
        specifications: {
            osVersion: 'Android TV 12',
            ipAddress: '192.168.1.103',
            backendUrl: 'http://localhost:3000'
        },
        notes: null
    },
    {
        name: 'TCL Roku TV',
        type: 'Roku',
        model: 'TCL 6-Series 65"',
        status: 'offline',
        location: null,
        assignedTo: null,
        userId: null,
        username: null,
        sessionId: null,
        sessionTime: null,
        specifications: {
            osVersion: 'Roku TV OS 12',
            ipAddress: '192.168.1.104',
            backendUrl: 'http://localhost:3000'
        },
        notes: null
    }
];

async function seedDevices() {
    try {
        // Connect to database
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Sync models (this will create tables if they don't exist)
        await sequelize.sync({ force: true }); // force: true will drop existing tables
        console.log('✅ Database synced (existing data cleared)');

        // Insert devices
        await Device.bulkCreate(devices);
        console.log(`✅ Successfully seeded ${devices.length} devices`);

        // Display seeded devices
        console.log('\n📺 Seeded Devices:');
        devices.forEach((device, index) => {
            console.log(`${index + 1}. ${device.name} (${device.type}) - ${device.specifications.ipAddress}`);
        });

        // Close connection
        await sequelize.close();
        console.log('\n✅ Database connection closed');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding devices:', error);
        process.exit(1);
    }
}

seedDevices();
