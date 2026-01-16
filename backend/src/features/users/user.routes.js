const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
// const { protect, adminOnly } = require('../../middleware/authMiddleware');

// router.use(protect);
// router.use(adminOnly);

router.post('/', userController.createUser);
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.patch('/:id', userController.updateUser);
router.patch('/:id/status', userController.toggleUserStatus);

module.exports = router;
