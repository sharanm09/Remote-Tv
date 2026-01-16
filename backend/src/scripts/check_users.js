const { sequelize } = require('../config/database');
const User = require('../models/User');
const Role = require('../models/Role');

async function checkUsers() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        const users = await User.findAll({
            include: [{ model: Role, as: 'UserRole' }]
        });

        console.log(`Found ${users.length} users:`);
        users.forEach(u => {
            console.log(`- ${u.email} (Role: ${u.UserRole ? u.UserRole.name : 'None'})`);
            console.log(`  Password Hash: ${u.password.substring(0, 10)}...`);
        });

    } catch (error) {
        console.error('Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

checkUsers();
