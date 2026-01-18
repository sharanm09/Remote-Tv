import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

const AuthCallbackPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchUserAndRedirect = async () => {
            const token = searchParams.get('token');
            if (!token) {
                toast.error('Authentication check failed. No token received.');
                setTimeout(() => navigate('/login?error=auth_failed'), 2000);
                return;
            }

            try {
                // Store token first to use in request
                localStorage.setItem('token', token);

                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch user details');
                }

                const data = await response.json();
                const { id, role, displayName, email } = data.user;

                // Save all user details to localStorage
                if (id) localStorage.setItem('userId', id);
                if (role) localStorage.setItem('userRole', role);
                if (displayName) localStorage.setItem('userName', displayName);
                if (email) localStorage.setItem('userEmail', email);

                toast.success(`Welcome back, ${displayName}!`);
                setTimeout(() => navigate('/dashboard'), 1500);
            } catch (error) {
                console.error('Auth callback error details:', {
                    message: error.message,
                    stack: error.stack,
                    token: token ? 'Token present' : 'Token missing'
                });

                toast.error(`Login Failed: ${error.message}`);
                localStorage.removeItem('token');
                setTimeout(() => navigate('/login?error=profile_fetch_failed'), 3000);
            }
        };

        fetchUserAndRedirect();
    }, [searchParams, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Toaster position="top-right" reverseOrder={false} />
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <h2 className="text-xl font-semibold text-gray-700">Authenticating...</h2>
                <p className="text-gray-500">Please wait while we log you in.</p>
            </div>
        </div>
    );
};

export default AuthCallbackPage;
