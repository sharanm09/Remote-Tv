const jwt = require('jsonwebtoken');

exports.isAuthenticated = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        console.log('❌ [Auth Middleware] No token found in Authorization header');
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey');
        req.user = decoded;
        next();
    } catch (error) {
        console.log('❌ [Auth Middleware] JWT Verification failed:', error.message);
        return res.status(401).json({ message: 'Invalid token' });
    }
};
