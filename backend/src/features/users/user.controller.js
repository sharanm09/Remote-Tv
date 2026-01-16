const User = require('../../models/User');
const Role = require('../../models/Role');
const bcrypt = require('bcryptjs');

exports.createUser = async (req, res) => {
    try {
        const { email, password, fullName, roleId } = req.body;

        // Basic validation
        if (!email || !password || !fullName || !roleId) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Verify role exists
        const role = await Role.findByPk(roleId);
        if (!role) {
            return res.status(400).json({ message: 'Invalid Role ID' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            email,
            password: hashedPassword,
            displayName: fullName,
            roleId
        });

        // Return user without password
        const userResponse = {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: role.name
        };

        res.status(201).json({ message: 'User created successfully', user: userResponse });
    } catch (error) {
        console.error('Create User Error:', error);
        res.status(500).json({ message: 'Failed to create user' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            include: [{ model: Role, as: 'UserRole' }],
            attributes: { exclude: ['password', 'refreshToken'] }
        });
        res.json({ users });
    } catch (error) {
        console.error('Get Users Error:', error);
        res.status(500).json({ message: 'Failed to fetch users' });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id, {
            include: [{ model: Role, as: 'UserRole' }],
            attributes: { exclude: ['password', 'refreshToken'] }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get User Error:', error);
        res.status(500).json({ message: 'Failed to fetch user' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { email, displayName, roleId } = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify role exists if roleId is provided
        if (roleId) {
            const role = await Role.findByPk(roleId);
            if (!role) {
                return res.status(400).json({ message: 'Invalid Role ID' });
            }
        }

        await user.update({
            email: email || user.email,
            displayName: displayName || user.displayName,
            roleId: roleId || user.roleId
        });

        const updatedUser = await User.findByPk(id, {
            include: [{ model: Role, as: 'UserRole' }],
            attributes: { exclude: ['password', 'refreshToken'] }
        });

        res.json({ message: 'User updated successfully', user: updatedUser });
    } catch (error) {
        console.error('Update User Error:', error);
        res.status(500).json({ message: 'Failed to update user' });
    }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        await user.update({ isActive: !user.isActive });

        const updatedUser = await User.findByPk(id, {
            include: [{ model: Role, as: 'UserRole' }],
            attributes: { exclude: ['password', 'refreshToken'] }
        });

        res.json({
            message: `User ${updatedUser.isActive ? 'activated' : 'deactivated'} successfully`,
            user: updatedUser
        });
    } catch (error) {
        console.error('Toggle User Status Error:', error);
        res.status(500).json({ message: 'Failed to toggle user status' });
    }
};
