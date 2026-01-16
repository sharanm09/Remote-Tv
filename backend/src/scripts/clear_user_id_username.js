const { sequelize } = require('../config/database');
const Device = require('../models/Device');

/**
 * Migration Script: Clear userId and username from devices
 * This makes devices available for connection by removing user assignments
 * 
 * Usage:
 *   node src/scripts/clear_user_id_username.js [deviceId]
 * 
 * If deviceId is provided, only that device will be updated.
 * If no deviceId is provided, all devices will be updated.
 */

const clearUserIdUsername = async (deviceId = null) => {
    try {
        console.log('🔄 Starting migration: Clear userId and username from devices...');
        
        await sequelize.authenticate();
        console.log('✅ Database connection established');

        let updatedCount;
        
        if (deviceId) {
            // Clear for specific device
            console.log(`📝 Clearing userId and username for device: ${deviceId}`);
            const [count] = await Device.update(
                {
                    userId: null,
                    username: null
                },
                {
                    where: { id: deviceId }
                }
            );
            updatedCount = count;
            console.log(`✅ Updated ${updatedCount} device(s) with ID: ${deviceId}`);
        } else {
            // Clear for all devices
            console.log('📝 Clearing userId and username for all devices...');
            const [count] = await Device.update(
                {
                    userId: null,
                    username: null
                },
                {
                    where: {
                        [sequelize.Op.or]: [
                            { userId: { [sequelize.Op.ne]: null } },
                            { username: { [sequelize.Op.ne]: null } }
                        ]
                    }
                }
            );
            updatedCount = count;
            console.log(`✅ Updated ${updatedCount} device(s)`);
        }

        // Verify the update
        if (deviceId) {
            const device = await Device.findByPk(deviceId);
            if (device) {
                console.log('\n📊 Device after update:');
                console.log({
                    id: device.id,
                    name: device.name,
                    userId: device.userId,
                    username: device.username,
                    status: device.status,
                    isStreaming: device.isStreaming
                });
            } else {
                console.log(`⚠️ Device with ID ${deviceId} not found`);
            }
        }

        console.log('\n✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

// Get deviceId from command line arguments
const deviceId = process.argv[2] || null;

// Run migration
clearUserIdUsername(deviceId);
