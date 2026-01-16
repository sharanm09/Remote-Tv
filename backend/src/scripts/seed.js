const { sequelize, initializeDatabase } = require('../config/database');
const Role = require('../models/Role');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
    try {
        console.log('Ensure Database exists...');
        await initializeDatabase();

        console.log('Syncing database...');
        await sequelize.sync({ force: true }); // WARNING: This drops tables!
        console.log('Database synced.');

        console.log('Seeding roles...');
        const roles = await Role.bulkCreate([
            { name: 'Admin' },
            { name: 'QA' },
            { name: 'Streamer' }
        ]);
        console.log('Roles seeded.');

        const adminRole = roles.find(r => r.name === 'Admin');
        const qaRole = roles.find(r => r.name === 'QA');
        const streamerRole = roles.find(r => r.name === 'Streamer');

        console.log('Seeding users...');
        const passwordHash = await bcrypt.hash('Admin@123', 10);

        await User.bulkCreate([
            {
                email: 'admin@exe.in',
                password: passwordHash,
                displayName: 'Admin User',
                roleId: adminRole.id
            },
            {
                email: 'user@exe.in',
                password: passwordHash,
                displayName: 'QA User',
                roleId: qaRole.id
            },
            {
                email: 'stream@exe.in',
                password: passwordHash,
                displayName: 'Streamer User',
                roleId: streamerRole.id
            }
        ]);
        console.log('Users seeded.');

        console.log('Database seeding completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seedDatabase();
