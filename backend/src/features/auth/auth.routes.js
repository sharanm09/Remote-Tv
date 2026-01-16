const express = require('express');
const passport = require('passport');
const authController = require('./auth.controller');

const router = express.Router();

// 1. Google Login
// 1. Google Login
router.get('/login/google',
    passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })
);

// 2. Google Callback
router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: process.env.FRONTEND_URL || 'http://localhost:3000/login',
        session: false
    }),
    authController.googleLoginCallback
);

// 3. Local Registration
router.post('/register', authController.register);

// 4. Local Login
router.post('/login', authController.login);

const authMiddleware = require('../../middleware/authMiddleware');

// 5. Get Current User
router.get('/me', authMiddleware.isAuthenticated, authController.getMe);

// 6. Refresh Token
router.post('/refresh-token', authController.refreshToken);

// 7. Logout
router.post('/logout', authController.logout);

module.exports = router;
