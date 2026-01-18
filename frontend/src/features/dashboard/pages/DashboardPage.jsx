import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client'; // Import socket.io-client
import AdminDashboard from './AdminDashboard';
import UserDashboard from './UserDashboard';
import StreamerDashboard from './StreamerDashboard';
import SendRequestModal from '../components/SendRequestModal';
import IncomingRequestModal from '../components/IncomingRequestModal';
import RejectModal from '../components/RejectModal';
import { toast } from 'react-hot-toast';

const DashboardPage = () => {
    const navigate = useNavigate();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 12,
        total: 0,
        totalPages: 0
    });
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        type: '',
        location: ''
    });

    // Request System State
    const [requestModal, setRequestModal] = useState({ isOpen: false, device: null });
    const [incomingRequest, setIncomingRequest] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [rejectModal, setRejectModal] = useState({ isOpen: false, notification: null });

    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
    const userName = localStorage.getItem('userName') || 'User';
    const currentUserId = localStorage.getItem('userId');

    // Debug logging
    console.log('DashboardPage - User Role:', userRole);
    console.log('DashboardPage - User Name:', userName);

    // Fetch devices from API
    const fetchDevices = async (page = 1, searchFilters = filters) => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');

            if (!token) {
                navigate('/login');
                return;
            }

            // Build query string
            const params = new URLSearchParams({
                page: page.toString(),
                limit: pagination.limit.toString(),
                ...(searchFilters.search && { search: searchFilters.search }),
                ...(searchFilters.status && { status: searchFilters.status }),
                ...(searchFilters.type && { type: searchFilters.type }),
                ...(searchFilters.location && { location: searchFilters.location })
            });

            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/devices?${params}`, {
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
            setPagination(data.pagination || { page: 1, limit: 12, total: 0, totalPages: 0 });
        } catch (error) {
            console.error('Error fetching devices:', error);
            setDevices([]);
        } finally {
            setLoading(false);
        }
    };

    // Fetch devices on component mount
    useEffect(() => {
        fetchDevices(pagination.page, filters);
    }, []);

    // Real-time Updates & Request System using Socket.IO
    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        // 1. Device Status Updates
        socket.on('device-status-update', (updatedDevice) => {
            console.log('⚡ Real-time update received:', updatedDevice);
            setDevices(prevDevices =>
                prevDevices.map(device =>
                    device.id === updatedDevice.deviceId
                        ? {
                            ...device,
                            status: updatedDevice.status !== undefined ? updatedDevice.status : device.status,
                            isStreaming: updatedDevice.isStreaming !== undefined ? updatedDevice.isStreaming : device.isStreaming,
                            userId: updatedDevice.userId !== undefined ? updatedDevice.userId : device.userId,
                            username: updatedDevice.username !== undefined ? updatedDevice.username : device.username,
                            connectedViewerId: updatedDevice.connectedViewerId !== undefined ? updatedDevice.connectedViewerId : device.connectedViewerId,
                            connectedViewerName: updatedDevice.connectedViewerName !== undefined ? updatedDevice.connectedViewerName : device.connectedViewerName,
                            webrtcConnected: updatedDevice.webrtcConnected !== undefined ? updatedDevice.webrtcConnected : device.webrtcConnected,
                            streamerSocketId: updatedDevice.streamerSocketId !== undefined ? updatedDevice.streamerSocketId : device.streamerSocketId
                        }
                        : device
                )
            );
        });

        if (currentUserId) {
            // Ensure currentUserId is a string for consistent event name matching
            const currentUserIdStr = String(currentUserId);
            const eventName = `request-received-${currentUserIdStr}`;

            console.log(`🔔 Setting up notification listener for event: ${eventName}`);
            console.log(`🔔 Current User ID: ${currentUserIdStr} (type: ${typeof currentUserIdStr})`);

            // 2. Incoming Requests (For Owner) - Add to notifications
            socket.on(eventName, (request) => {
                console.log('🔔 Request Received:', request);
                console.log('🔔 Event name that triggered:', eventName);
                setIncomingRequest(request);

                // Add to notifications list
                const notification = {
                    id: request.requestId || Date.now().toString(),
                    type: 'connection_request',
                    requesterName: request.requesterName || 'Unknown User',
                    deviceName: request.deviceName || 'Device',
                    message: request.message || '',
                    timestamp: request.timestamp || new Date().toISOString(),
                    status: 'pending',
                    read: false,
                    requestId: request.requestId,
                    deviceId: request.deviceId
                };

                setNotifications(prev => [notification, ...prev]);
                console.log('✅ Notification added to list. Total notifications:', notifications.length + 1);

                // Optional: Play sound or shows system notification
                new Audio('/notification.mp3').play().catch(e => console.log('Audio play failed', e)); // Placeholder
            });

            // Also listen to all request-received events for debugging
            socket.onAny((eventName, ...args) => {
                if (eventName.startsWith('request-received-')) {
                    console.log(`🔍 Debug: Received event ${eventName}`, args);
                }
            });

            // 3. Request Responses (For Requester) - Update notification
            socket.on(`request-response-${currentUserId}`, ({ status, deviceId, reason, requestId }) => {
                const statusDetails = status === 'approved' ? 'Approved! You can now access the device.' : `Rejected. Reason: ${reason}`;

                // Update notification status
                if (requestId) {
                    setNotifications(prev => prev.map(n =>
                        n.requestId === requestId
                            ? { ...n, status, read: true }
                            : n
                    ));
                }

                if (status === 'approved') {
                    toast.success(statusDetails, { duration: 5000 });
                    fetchDevices(); // Refresh to see updated status (free)
                } else {
                    toast.error(statusDetails, { duration: 5000 });
                }
            });

            // 4. Force Disconnect (When request approved)
            socket.on(`force-disconnect-${currentUserId}`, ({ deviceId }) => {
                toast.loading('Your session has ended. Releasing device...', { duration: 3000 });
                // If we are on the streaming page for this device, user interaction will stop anyway due to logic.
                // But we should refresh the list.
                fetchDevices();
            });
        }

        return () => {
            socket.disconnect();
        };
    }, [currentUserId]);

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
            localStorage.removeItem('userId');
            window.location.href = '/login';
        }
    };

    // Redirect streamer to /stream if they somehow reach here
    useEffect(() => {
        if (userRole === 'streamer') {
            navigate('/stream');
        }
    }, [userRole, navigate]);

    // Request Handling
    const handleRequestAccess = async (device, note) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/requests/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    deviceId: device.id,
                    requesterId: currentUserId,
                    message: note || 'Requesting access to connect'
                })
            });

            if (response.ok) {
                toast.success('Request sent successfully!');
            } else {
                const data = await response.json();
                toast.error(data.message || 'Failed to send request.');
            }
        } catch (error) {
            console.error('Send Request Error:', error);
            toast.error('Network error sending request.');
        }
    };

    const handleRespondRequest = async (requestId, status, reason = null) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/requests/respond`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ requestId, status, reason })
            });

            if (response.ok) {
                setIncomingRequest(null);
                setRejectModal({ isOpen: false, notification: null });

                // Update notification status
                setNotifications(prev => prev.map(n =>
                    n.requestId === requestId
                        ? { ...n, status, read: true }
                        : n
                ));

                if (status === 'approved') {
                    toast.success('Request approved. User connection cleared. Stream continues.');
                    // Refresh devices to show updated status (userId/username cleared)
                    fetchDevices();
                    // NOTE: We do NOT navigate away or force disconnect
                    // Stream continues running, only userId/username are cleared
                } else {
                    toast.success('Rejection message sent to requester.');
                    fetchDevices();
                }
            } else {
                const data = await response.json();
                toast.error(data.message || 'Failed to respond.');
            }
        } catch (error) {
            console.error('Respond Error:', error);
            toast.error('Network error responding.');
        }
    };

    const handleMarkNotificationAsRead = (notificationId) => {
        setNotifications(prev => prev.map(n =>
            n.id === notificationId ? { ...n, read: true } : n
        ));
    };

    const handleNotificationClick = (notification) => {
        if (notification.status === 'pending' && notification.type === 'connection_request') {
            setIncomingRequest({
                requestId: notification.requestId,
                requesterName: notification.requesterName,
                deviceName: notification.deviceName,
                message: notification.message
            });
        }
    };

    // Render dashboard based on role
    if (userRole === 'admin') {
        return (
            <AdminDashboard
                devices={devices}
                loading={loading}
                pagination={pagination}
                filters={filters}
                setFilters={setFilters}
                fetchDevices={fetchDevices}
                userName={userName}
                onLogout={handleLogout}
                userRole={userRole}
            />
        );
    } else if (userRole === 'streamer') {
        return (
            <StreamerDashboard
                devices={devices}
                loading={loading}
                userName={userName}
                onLogout={handleLogout}
                userRole={userRole}
            />
        );
    }

    return (
        <>
            <UserDashboard
                devices={devices}
                userName={userName}
                onLogout={handleLogout}
                userRole={userRole}
                currentUserId={currentUserId}
                onRequestAccess={handleRequestAccess}
                notifications={notifications}
                onMarkNotificationAsRead={handleMarkNotificationAsRead}
                onNotificationClick={handleNotificationClick}
                onApproveRequest={(notification) => {
                    handleRespondRequest(notification.requestId, 'approved');
                }}
                onRejectRequest={(notification) => {
                    setRejectModal({ isOpen: true, notification });
                }}
            />

            {/* Modals */}
            <SendRequestModal
                isOpen={requestModal.isOpen}
                onClose={() => setRequestModal({ isOpen: false, device: null })}
                onSend={(message) => handleRequestAccess(requestModal.device, message)}
                deviceName={requestModal.device?.name}
            />

            <IncomingRequestModal
                isOpen={!!incomingRequest}
                request={incomingRequest}
                onApprove={(id) => {
                    handleRespondRequest(id, 'approved');
                }}
                onReject={(id, reason) => {
                    handleRespondRequest(id, 'rejected', reason);
                }}
            />

            <RejectModal
                isOpen={rejectModal.isOpen}
                onClose={() => setRejectModal({ isOpen: false, notification: null })}
                onConfirm={(reason) => {
                    if (rejectModal.notification) {
                        handleRespondRequest(rejectModal.notification.requestId, 'rejected', reason);
                    }
                }}
                requesterName={rejectModal.notification?.requesterName || 'User'}
                deviceName={rejectModal.notification?.deviceName || 'Device'}
            />
        </>
    );
};

export default DashboardPage;
