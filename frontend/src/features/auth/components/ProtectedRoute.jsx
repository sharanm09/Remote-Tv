import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ allowedRoles = [] }) => {
    // In a real app, you'd check Redux state or a context here.
    // For now, we'll check localStorage for a token, which our mock login should set.
    // If we want to force the login page first, we can assume no token initially.
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole');
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles.length > 0) {
        const normalizedUserRole = (userRole || '').toLowerCase();
        const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

        if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
            // Redirect based on role if they try to access unauthorized page
            if (normalizedUserRole === 'streamer') {
                return <Navigate to="/stream" replace />;
            }
            return <Navigate to="/dashboard" replace />;
        }
    }

    return <Outlet />;
};

export default ProtectedRoute;
