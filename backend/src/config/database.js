const { Sequelize } = require('sequelize');
const mysql = require('mysql2/promise'); // Needed for raw query
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const dbName = process.env.DB_NAME || 'remotetv';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || 'radhe123';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 3306;

// Function to create DB if not exists
async function initializeDatabase() {
    try {
        const connection = await mysql.createConnection({
            host: dbHost,
            port: dbPort,
            user: dbUser,
            password: dbPassword,
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
        await connection.end();
        console.log(`✅ Database ${dbName} checked/created successfully.`);
    } catch (error) {
        console.error('❌ Error creating database:', error);
    }
}

// Call initialization (async, but we export sequelize instance which will retry connection)
// Call initialization (async, but we export sequelize instance which will retry connection)
// initializeDatabase();

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
    host: dbHost,
    dialect: 'mysql',
    port: dbPort,
    logging: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});

module.exports = { sequelize, initializeDatabase };
