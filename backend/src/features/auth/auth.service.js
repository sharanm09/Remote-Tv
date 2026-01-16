const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Role = require('../../models/Role');

class AuthService {
    generateTokens(user) {
        const role = user.UserRole ? user.UserRole.name : user.role; // Handle both loaded association and direct string fallback if needed
        const accessToken = jwt.sign(
            { id: user.id, email: user.email, role: role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
        );
        const refreshToken = jwt.sign(
            { id: user.id },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
        );
        return { accessToken, refreshToken };
    }

    async registerUser({ email, password, fullName }) {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            throw new Error('User already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const ADMIN_EMAILS = ['admin@qwikhire.ai', 'admin@exe.in'];
        let roleName = 'QA';
        // Check for Admin
        if (ADMIN_EMAILS.includes(email)) {
            roleName = 'Admin';
        } else if (email === 'stream@exe.in') {
            roleName = 'Streamer';
        }

        const role = await Role.findOne({ where: { name: roleName } });
        if (!role) {
            throw new Error(`Role ${roleName} not found`);
        }

        const user = await User.create({
            email,
            password: hashedPassword,
            displayName: fullName || email.split('@')[0],
            roleId: role.id
        });

        // Reload user with Role
        await user.reload({
            include: [{ model: Role, as: 'UserRole' }]
        });

        const tokens = this.generateTokens(user);
        user.refreshToken = tokens.refreshToken;
        await user.save();

        return {
            ...tokens,
            user: {
                id: user.id,
                email: user.email,
                role: user.UserRole ? user.UserRole.name : null,
                displayName: user.displayName
            }
        };
    }

    async loginUser({ email, password }) {
        const user = await User.findOne({
            where: { email },
            include: [{ model: Role, as: 'UserRole' }]
        });
        if (!user || !user.password) {
            throw new Error('Invalid credentials');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new Error('Invalid credentials');
        }

        const tokens = this.generateTokens(user);
        user.refreshToken = tokens.refreshToken;
        await user.save();

        return {
            ...tokens,
            user: {
                id: user.id,
                email: user.email,
                role: user.UserRole ? user.UserRole.name : null,
                displayName: user.displayName
            }
        };
    }

    async refreshUserToken(token) {
        if (!token) throw new Error('No refresh token provided');

        try {
            const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
            const user = await User.findByPk(decoded.id, {
                include: [{ model: Role, as: 'UserRole' }]
            });

            if (!user || user.refreshToken !== token) {
                throw new Error('Invalid refresh token');
            }

            const tokens = this.generateTokens(user);
            user.refreshToken = tokens.refreshToken;
            await user.save();

            return { ...tokens };
        } catch (error) {
            throw new Error('Invalid or expired refresh token');
        }
    }

    async getUserById(id) {
        const user = await User.findByPk(id, {
            include: [{ model: Role, as: 'UserRole' }]
        });
        if (!user) throw new Error('User not found');
        return {
            id: user.id,
            email: user.email,
            role: user.UserRole ? user.UserRole.name : null,
            displayName: user.displayName
        };
    }
}

module.exports = new AuthService();
