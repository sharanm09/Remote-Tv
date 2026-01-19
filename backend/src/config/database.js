// const { Sequelize } = require('sequelize');
// const mysql = require('mysql2/promise'); // Needed for raw query
// const path = require('path');
// require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// const dbName = process.env.DB_NAME || 'remotetv';
// const dbUser = process.env.DB_USER || 'root';
// const dbPassword = process.env.DB_PASSWORD || 'radhe123';
// const dbHost = process.env.DB_HOST || 'localhost';
// const dbPort = process.env.DB_PORT || 3306;

// // Function to create DB if not exists
// async function initializeDatabase() {
//     try {
//         const connection = await mysql.createConnection({
//             host: dbHost,
//             port: dbPort,
//             user: dbUser,
//             password: dbPassword,
//         });
//         await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
//         await connection.end();
//         console.log(`✅ Database ${dbName} checked/created successfully.`);
//     } catch (error) {
//         console.error('❌ Error creating database:', error);
//     }
// }

// // Call initialization (async, but we export sequelize instance which will retry connection)
// // Call initialization (async, but we export sequelize instance which will retry connection)
// initializeDatabase();

// const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
//     host: dbHost,
//     dialect: 'mysql',
//     port: dbPort,
//     logging: false,
//     pool: {
//         max: 5,
//         min: 0,
//         acquire: 30000,
//         idle: 10000
//     }
// });

// module.exports = { sequelize, initializeDatabase };


const { Sequelize } = require('sequelize');
const mysql = require('mysql2/promise');
const path = require('path');

// Load dotenv ONLY when NOT running on Cloud Run
// K_SERVICE is automatically set by Cloud Run
if (!process.env.K_SERVICE) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;
const dbSocket = process.env.DB_SOCKET; // ✅ Cloud Run Unix socket

// Debug logging
console.log('🔍 DB Connection Debug:', {
  hasSocket: !!dbSocket,
  socket: dbSocket,
  hasHost: !!dbHost,
  host: dbHost,
  port: dbPort,
  user: dbUser ? `${dbUser.substring(0, 3)}***` : undefined,
  dbName: dbName
});

// ---------- CREATE DB IF NOT EXISTS ----------
async function initializeDatabase() {
  try {
    const connectionConfig = dbSocket
      ? {
          user: dbUser,
          password: dbPassword,
          socketPath: dbSocket, // ✅ Cloud Run
        }
      : {
          host: dbHost || 'localhost',
          port: dbPort || 3306,
          user: dbUser,
          password: dbPassword, // ✅ Local / VM
        };

    const connection = await mysql.createConnection(connectionConfig);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.end();

    console.log(`✅ Database ${dbName} checked/created successfully`);
  } catch (error) {
    console.error('❌ Error creating database:', error);
  }
}

initializeDatabase();

// ---------- SEQUELIZE INSTANCE ----------
// When using socket, we must NOT include host/port in config
const sequelizeConfig = dbSocket
  ? {
      dialect: 'mysql',
      dialectOptions: {
        socketPath: dbSocket, // ✅ Cloud Run - socket path in dialectOptions
      },
      // Explicitly set host/port to null to prevent Sequelize from using them
      host: null,
      port: null,
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    }
  : {
      host: dbHost || 'localhost',
      port: dbPort || 3306,
      dialect: 'mysql',
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    };

console.log('📦 Sequelize Config:', JSON.stringify({
  usingSocket: !!dbSocket,
  dialect: sequelizeConfig.dialect,
  dialectOptions: sequelizeConfig.dialectOptions,
  host: sequelizeConfig.host,
  port: sequelizeConfig.port
}, null, 2));

const sequelize = new Sequelize(dbName, dbUser, dbPassword, sequelizeConfig);

// Test connection immediately
sequelize.authenticate()
  .then(() => {
    console.log('✅ Sequelize connection authenticated successfully');
  })
  .catch((err) => {
    console.error('❌ Sequelize authentication failed:', err.message);
    console.error('   Error details:', {
      code: err.original?.code,
      errno: err.original?.errno,
      address: err.original?.address,
      port: err.original?.port
    });
  });

module.exports = { sequelize, initializeDatabase };

