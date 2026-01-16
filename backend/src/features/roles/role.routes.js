const express = require('express');
const router = express.Router();
const roleController = require('./role.controller');
const { protect, adminOnly } = require('../../middleware/authMiddleware'); // Approximating middleware location

// Protect all routes
// router.use(protect); // Uncomment if middleware exists
// router.use(adminOnly); // Uncomment if middleware exists

router.post('/', roleController.createRole);
router.get('/', roleController.getAllRoles);
router.get('/:id', roleController.getRoleById);
router.patch('/:id', roleController.updateRole);

module.exports = router;
