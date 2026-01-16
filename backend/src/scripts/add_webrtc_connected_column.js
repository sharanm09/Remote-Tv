const { sequelize } = require('../config/database');
const mysql = require('mysql2/promise');

async function addWebRTCConnectedColumn() {
    let connection;
    try {
        // Get database connection info from sequelize config
        const dbName = process.env.DB_NAME || 'remotetv';
        const dbUser = process.env.DB_USER || 'root';
        const dbPassword = process.env.DB_PASSWORD || 'radhe123';
        const dbHost = process.env.DB_HOST || 'localhost';
        const dbPort = process.env.DB_PORT || 3306;

        console.log('📊 Connecting to database...');
        connection = await mysql.createConnection({
            host: dbHost,
            port: dbPort,
            user: dbUser,
            password: dbPassword,
            database: dbName
        });

        console.log('✅ Connected to database');

        // Check if column already exists
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'devices' 
            AND COLUMN_NAME = 'webrtcConnected'
        `, [dbName]);

        const columnExists = columns.length > 0;

        // Add webrtcConnected column if it doesn't exist
        if (!columnExists) {
            console.log('➕ Adding webrtcConnected column...');
            try {
                await connection.query(`
                    ALTER TABLE devices 
                    ADD COLUMN webrtcConnected BOOLEAN DEFAULT FALSE NOT NULL AFTER connectedViewerName
                `);
                console.log('✅ Added webrtcConnected column');
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log('ℹ️  webrtcConnected column already exists');
                } else {
                    throw err;
                }
            }
        } else {
            console.log('ℹ️  webrtcConnected column already exists');
        }

        console.log('\n✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding column:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

addWebRTCConnectedColumn();
