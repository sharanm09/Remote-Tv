import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, Check, XCircle } from 'lucide-react';

const NotificationBell = ({ notifications, onNotificationClick, onMarkAsRead, onApprove, onReject }) => {
    const [isOpen, setIsOpen] = useState(false);
    const bellRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (bellRef.current && !bellRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div className="relative" ref={bellRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-gray-500 hover:text-gray-700 relative transition-colors"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 block h-2 w-2 rounded-full ring-2 ring-white bg-red-500 transform translate-x-1/4 -translate-y-1/4"></span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-12 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell size={32} className="mx-auto text-gray-300 mb-2" />
                                <p className="text-sm text-gray-500">No notifications</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${!notification.read ? 'bg-blue-50/50' : ''}`}
                                        onClick={() => {
                                            onNotificationClick?.(notification);
                                            if (!notification.read) {
                                                onMarkAsRead?.(notification.id);
                                            }
                                        }}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${!notification.read ? 'bg-blue-500' : 'bg-transparent'}`}></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <p className="text-sm font-medium text-gray-900">
                                                        {notification.type === 'connection_request' ? 'Connection Request' : 'Request'}
                                                    </p>
                                                    <span className="text-xs text-gray-400 whitespace-nowrap">
                                                        {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-600 mb-1">
                                                    <span className="font-semibold">{notification.requesterName}</span> requested to connect to <span className="font-semibold text-blue-600">{notification.deviceName}</span>
                                                </p>
                                                {notification.message && (
                                                    <p className="text-xs text-gray-500 italic mt-1 bg-gray-50 p-2 rounded border-l-2 border-blue-200">
                                                        "{notification.message}"
                                                    </p>
                                                )}
                                                {notification.status === 'pending' && (
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onApprove?.(notification);
                                                            }}
                                                            className="flex-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors flex items-center justify-center gap-1"
                                                        >
                                                            <Check size={12} />
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onReject?.(notification);
                                                            }}
                                                            className="flex-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors flex items-center justify-center gap-1"
                                                        >
                                                            <XCircle size={12} />
                                                            Reject
                                                        </button>
                                                    </div>
                                                )}
                                                {notification.status === 'approved' && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 mt-1">
                                                        Approved
                                                    </span>
                                                )}
                                                {notification.status === 'rejected' && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 mt-1">
                                                        Rejected
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
