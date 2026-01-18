import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client'; // Import socket.io-client
import StreamerDashboard from '../../dashboard/pages/StreamerDashboard';

const StreamPage = () => {
    const navigate = useNavigate();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);

    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
    const userName = localStorage.getItem('userName') || 'User';
    const currentUserId = localStorage.getItem('userId');

    const fetchDevices = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');

            if (!token) {
                navigate('/login');
                return;
            }

            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/devices`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            if (response.status === 401) {
                localStorage.clear();
                navigate('/login');
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to fetch devices');
            }

            const data = await response.json();
            setDevices(data.devices || []);
        } catch (error) {
            console.error('Error fetching devices:', error);
            setDevices([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
    }, []);

    // Real-time Device Status Updates
    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        socket.on('device-status-update', (updatedDevice) => {
            console.log('⚡ [StreamPage] Real-time update received:', updatedDevice);
            setDevices(prevDevices =>
                prevDevices.map(device =>
                    device.id === updatedDevice.deviceId
                        ? { ...device, status: updatedDevice.status, isStreaming: updatedDevice.isStreaming, username: updatedDevice.username }
                        : device
                )
            );
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const handleLogout = async () => {
        try {
            await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userName');
            window.location.href = '/login';
        }
    };

    return (
        <StreamerDashboard
            devices={devices}
            loading={loading}
            userName={userName}
            onLogout={handleLogout}
            userRole={userRole}
            currentUserId={currentUserId}
        />
    );
};

export default StreamPage;
