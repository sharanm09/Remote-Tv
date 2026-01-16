const authService = require('./auth.service');

exports.googleLoginCallback = async (req, res) => {
    // Generate tokens
    const { accessToken, refreshToken } = authService.generateTokens(req.user);

    // Save refresh token to DB
    req.user.refreshToken = refreshToken;
    await req.user.save();

    // Set Refresh Token Cookie
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${accessToken}`);
};

exports.register = async (req, res) => {
    try {
        const result = await authService.registerUser(req.body);

        // Set Refresh Token Cookie
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({
            message: 'User registered successfully',
            token: result.accessToken, // Send only Access Token
            user: result.user
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const result = await authService.loginUser(req.body);

        // Set Refresh Token Cookie
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            message: 'Login successful',
            token: result.accessToken, // Send only Access Token
            user: result.user
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ message: error.message });
    }
};

exports.refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

        const result = await authService.refreshUserToken(refreshToken);

        // Update Refresh Token Cookie (Rotation)
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({ token: result.accessToken });
    } catch (error) {
        res.clearCookie('refreshToken');
        res.status(403).json({ message: error.message });
    }
};

exports.getMe = async (req, res) => {
    try {
        // req.user is populated by authMiddleware or passport
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const user = await authService.getUserById(req.user.id);
        res.json({ user });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

exports.logout = async (req, res) => {
    console.log('➡️ [Auth API] Logout request received');
    try {
        console.log('   [Auth API] Clearing refreshToken cookie...');
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax'
        });

        console.log('✅ [Auth API] Logout successful');
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('❌ [Auth API] Logout error:', error);
        res.status(500).json({ message: 'Logout failed' });
    }
};
