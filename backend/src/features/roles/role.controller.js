const Role = require('../../models/Role');

exports.createRole = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Role name is required' });
        }

        const existingRole = await Role.findOne({ where: { name } });
        if (existingRole) {
            return res.status(400).json({ message: 'Role already exists' });
        }

        const role = await Role.create({ name });
        res.status(201).json({ message: 'Role created successfully', role });
    } catch (error) {
        console.error('Create Role Error:', error);
        res.status(500).json({ message: 'Failed to create role' });
    }
};

exports.getAllRoles = async (req, res) => {
    try {
        const roles = await Role.findAll();
        res.json({ roles });
    } catch (error) {
        console.error('Get Roles Error:', error);
        res.status(500).json({ message: 'Failed to fetch roles' });
    }
};

exports.getRoleById = async (req, res) => {
    try {
        const { id } = req.params;
        const role = await Role.findByPk(id);

        if (!role) {
            return res.status(404).json({ message: 'Role not found' });
        }

        res.json({ role });
    } catch (error) {
        console.error('Get Role Error:', error);
        res.status(500).json({ message: 'Failed to fetch role' });
    }
};

exports.updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Role name is required' });
        }

        const role = await Role.findByPk(id);
        if (!role) {
            return res.status(404).json({ message: 'Role not found' });
        }

        // Check if name already exists (excluding current role)
        const existingRole = await Role.findOne({ where: { name } });
        if (existingRole && existingRole.id !== parseInt(id)) {
            return res.status(400).json({ message: 'Role name already exists' });
        }

        await role.update({ name });
        res.json({ message: 'Role updated successfully', role });
    } catch (error) {
        console.error('Update Role Error:', error);
        res.status(500).json({ message: 'Failed to update role' });
    }
};
