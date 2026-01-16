const { sequelize } = require('../config/database');
const mysql = require('mysql2/promise');

async function addConnectedViewerColumns() {
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

        // Check if columns already exist
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'devices' 
            AND COLUMN_NAME IN ('connectedViewerId', 'connectedViewerName')
        `, [dbName]);

        const existingColumns = columns.map(col => col.COLUMN_NAME);

        // Add connectedViewerId column if it doesn't exist
        if (!existingColumns.includes('connectedViewerId')) {
            console.log('➕ Adding connectedViewerId column...');
            try {
                await connection.query(`
                    ALTER TABLE devices 
                    ADD COLUMN connectedViewerId VARCHAR(255) NULL AFTER username
                `);
                console.log('✅ Added connectedViewerId column');
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log('ℹ️  connectedViewerId column already exists');
                } else {
                    throw err;
                }
            }
        } else {
            console.log('ℹ️  connectedViewerId column already exists');
        }

        // Add connectedViewerName column if it doesn't exist
        if (!existingColumns.includes('connectedViewerName')) {
            console.log('➕ Adding connectedViewerName column...');
            try {
                await connection.query(`
                    ALTER TABLE devices 
                    ADD COLUMN connectedViewerName VARCHAR(255) NULL AFTER connectedViewerId
                `);
                console.log('✅ Added connectedViewerName column');
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log('ℹ️  connectedViewerName column already exists');
                } else {
                    throw err;
                }
            }
        } else {
            console.log('ℹ️  connectedViewerName column already exists');
        }

        console.log('\n✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding columns:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

addConnectedViewerColumns();
