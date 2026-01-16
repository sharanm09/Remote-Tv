const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');

const seedDatabase = async () => {
    try {
        console.log('🌱 Starting database seeding...');

        // 1. Create Roles First
        const rolesToCreate = ['admin', 'streamer', 'user'];
        const roles = {};

        for (const roleName of rolesToCreate) {
            const [role] = await Role.findOrCreate({
                where: { name: roleName },
                defaults: { name: roleName }
            });
            roles[roleName] = role;
            console.log(`✅ Role checked/created: ${roleName} (${role.id})`);
        }

        // 2. Map Roles and Create Users
        const hashedPassword = await bcrypt.hash('Admin@123', 10);

        const usersToCreate = [
            {
                email: 'admin@exe.in',
                displayName: 'Admin User',
                roleName: 'admin'
            },
            {
                email: 'stream@exe.in',
                displayName: 'Streamer User',
                roleName: 'streamer'
            },
            {
                email: 'user@exe.in',
                displayName: 'Regular User',
                roleName: 'user'
            }
        ];

        for (const userData of usersToCreate) {
            const targetRole = roles[userData.roleName];
            if (!targetRole) {
                console.warn(`⚠️ Role ${userData.roleName} not found, skipping user ${userData.email}`);
                continue;
            }

            const [user, created] = await User.findOrCreate({
                where: { email: userData.email },
                defaults: {
                    displayName: userData.displayName,
                    email: userData.email,
                    password: hashedPassword,
                    roleId: targetRole.id,
                    isActive: true
                }
            });

            if (created) {
                console.log(`✅ User created: ${userData.email} with role ${userData.roleName}`);
            } else {
                // Optionally update roleId if it changed or user already exists
                if (user.roleId !== targetRole.id) {
                    user.roleId = targetRole.id;
                    await user.save();
                    console.log(`✅ User role updated: ${userData.email} to ${userData.roleName}`);
                } else {
                    console.log(`ℹ️ User already exists: ${userData.email}`);
                }
            }
        }

        console.log('✅ Database seeding complete!');
    } catch (error) {
        console.error('❌ Error during seeding:', error);
    }
};

module.exports = seedDatabase;
