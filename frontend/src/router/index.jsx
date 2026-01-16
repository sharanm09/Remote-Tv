import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ProtectedRoute from '../features/auth/components/ProtectedRoute';

// Lazy Load Pages
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'));
const DashboardPage = lazy(() => import('../features/dashboard/pages/DashboardPage'));
const UsersPage = lazy(() => import('../features/users/pages/UsersPage'));
const ProfilePage = lazy(() => import('../features/profile/pages/ProfilePage'));
const RolesPage = lazy(() => import('../features/roles/pages/RolesPage'));
const StreamPage = lazy(() => import('../features/stream/pages/StreamPage'));
const StreamingPage = lazy(() => import('../features/stream/pages/StreamingPage'));
const AuthCallbackPage = lazy(() => import('../features/auth/pages/AuthCallbackPage'));
const UserRoleManagement = lazy(() => import('../features/admin/pages/UserRoleManagement'));
const StreamViewPage = lazy(() => import('../features/stream/pages/StreamViewPage'));

const router = createBrowserRouter([
    {
        path: '/login',
        element: (
            <Suspense fallback={<LoadingSpinner />}>
                <LoginPage />
            </Suspense>
        ),
    },
    {
        path: '/auth/callback',
        element: (
            <Suspense fallback={<LoadingSpinner />}>
                <AuthCallbackPage />
            </Suspense>
        ),
    },
    {
        element: <ProtectedRoute allowedRoles={['admin', 'qa', 'user']} />,
        children: [
            {
                path: '/dashboard',
                element: (
                    <Suspense fallback={<LoadingSpinner />}>
                        <DashboardPage />
                    </Suspense>
                ),
            },
            {
                path: '/profile',
                element: (
                    <Suspense fallback={<LoadingSpinner />}>
                        <ProfilePage />
                    </Suspense>
                ),
            },
            {
                path: '/streaming-view/:deviceId',
                element: (
                    <Suspense fallback={<LoadingSpinner />}>
                        <StreamViewPage />
                    </Suspense>
                ),
            },
        ],
    },
    {
        element: <ProtectedRoute allowedRoles={['admin']} />,
        children: [
            {
                path: '/users',
                element: (
                    <Suspense fallback={<LoadingSpinner />}>
                        <UsersPage />
                    </Suspense>
                ),
            },
            {
                path: '/roles',
                element: (
                    <Suspense fallback={<LoadingSpinner />}>
                        <RolesPage />
                    </Suspense>
                ),
            },
            {
                path: '/manage',
                element: (
                    <Suspense fallback={<LoadingSpinner />}>
                        <UserRoleManagement />
                    </Suspense>
                ),
            },
        ],
    },
    {
        element: <ProtectedRoute allowedRoles={['admin', 'streamer']} />,
        children: [
            {
                path: '/stream',
                element: (
                    <Suspense fallback={<LoadingSpinner />}>
                        <StreamPage />
                    </Suspense>
                ),
            },
            {
                path: '/streaming/:deviceId',
                element: (
                    <Suspense fallback={<LoadingSpinner />}>
                        <StreamingPage />
                    </Suspense>
                ),
            },
        ],
    },
    {
        path: '/',
        element: <Navigate to="/dashboard" replace />,
    },
    {
        path: '*',
        element: <Navigate to="/dashboard" replace />,
    }
]);

export default router;
