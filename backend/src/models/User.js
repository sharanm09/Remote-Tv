const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    googleId: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
    },
    displayName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    password: {
        type: DataTypes.STRING,
        allowNull: true // Null allowed for Google SSO users
    },
    roleId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'roles',
            key: 'id'
        }
    },
    refreshToken: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'users',
    timestamps: true,
    underscored: true
});

const Role = require('./Role');

User.belongsTo(Role, { foreignKey: 'roleId', as: 'UserRole' });
Role.hasMany(User, { foreignKey: 'roleId' });

module.exports = User;
