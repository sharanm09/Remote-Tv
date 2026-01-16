import React, { useState } from 'react';
import { Monitor, Smartphone, Laptop, User, Cpu, HardDrive, Edit2, Trash2, MoreVertical, Power, PowerOff } from 'lucide-react';
import RequestConnectModal from './RequestConnectModal';

const DeviceCard = ({ device, userRole, currentUserId, onRequest, onEdit, onDelete, onStopStreaming, onDisconnectDevice }) => {
    const {
        id,
        name,
        type,
        model,
        status,
        userId,
        username,
        sessionId,
        sessionTime,
        // New Fields
        streamerId,
        streamerName,
        streamerSessionId,
        qaUserId,
        qaUserName,
        qaSessionId,
        connectedViewerId,
        connectedViewerName,
        webrtcConnected = false, // Default to false if not set
        specifications = {}
    } = device;

    const [showRequestModal, setShowRequestModal] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);

    // Derived State
    const isLive = status === 'live' && device.isStreaming === true; // Only live when streaming is active
    const isInUse = status === 'in_use' && device.isStreaming === true; // Only in_use when actually streaming
    const isOffline = status === 'offline' || (status === 'live' && !device.isStreaming) || (status === 'in_use' && !device.isStreaming); // Offline if not streaming (even if status is in_use or live)
    const isOccupied = (status === 'live' && device.isStreaming) || (status === 'in_use' && device.isStreaming); // Only occupied when actually streaming
    // Check if device has active streamer or connected viewer - ONLY when actually streaming
    // hasActiveUser should be true only if:
    // 1. Device is actually streaming (isLive or isOccupied) AND has a streamerSocketId
    // 2. OR has a connectedViewerId (someone is actively viewing)
    const hasActiveUser = (isLive || isOccupied) && (device.streamerSocketId || device.connectedViewerId);

    // Status Colors - Show offline if status is live but not streaming
    const getStatusColor = (status) => {
        const actualStatus = (status === 'live' && !device.isStreaming) ? 'offline' : status;
        switch (actualStatus) {
            case 'live': return 'bg-green-500';
            case 'in_use': return 'bg-orange-400';
            case 'offline': return 'bg-red-500';
            default: return 'bg-gray-400';
        }
    };

    const getStatusText = (status) => {
        const actualStatus = (status === 'live' && !device.isStreaming) ? 'offline' : status;
        switch (actualStatus) {
            case 'live': return 'Live';
            case 'in_use': return 'In Use';
            case 'offline': return 'Offline';
            default: return status;
        }
    };

    // Device Icon based on type
    const getDeviceIcon = (type) => {
        const lowerType = type?.toLowerCase() || '';
        if (lowerType.includes('android') || lowerType.includes('samsung') || lowerType.includes('lg') || lowerType.includes('roku')) {
            return <Monitor size={28} className="text-blue-600" strokeWidth={2} />;
        }
        return <Monitor size={28} className="text-blue-600" strokeWidth={2} />;
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col h-full transition-all duration-200 hover:shadow-lg hover:border-gray-300">
            {/* Header section */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex gap-4">
                    {/* Device Icon */}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gray-50">
                        {getDeviceIcon(type)}
                    </div>

                    {/* Device Info */}
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-base leading-tight truncate mb-1">
                            {name}
                        </h3>
                        <p className="text-xs text-gray-500 truncate font-medium">
                            {model || 'No model specified'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                {/* Status Indicator Dot */}
                <div className={`w-3 h-3 rounded-full ${getStatusColor(status)} shrink-0 mt-1`}></div>
                    
                    {/* Admin Actions Menu */}
                    {userRole === 'admin' && (
                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowActionsMenu(!showActionsMenu);
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Device Actions"
                            >
                                <MoreVertical size={16} />
                            </button>
                            
                            {showActionsMenu && (
                                <>
                                    <div 
                                        className="fixed inset-0 z-10" 
                                        onClick={() => setShowActionsMenu(false)}
                                    ></div>
                                    <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowActionsMenu(false);
                                                onEdit && onEdit(device);
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        >
                                            <Edit2 size={14} />
                                            Edit
                                        </button>
                                        {device.isStreaming && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowActionsMenu(false);
                                                    if (window.confirm(`Are you sure you want to stop streaming for "${name}"?`)) {
                                                        onStopStreaming && onStopStreaming(device.id);
                                                    }
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2"
                                            >
                                                <PowerOff size={14} />
                                                Stop Streaming
                                            </button>
                                        )}
                                        {(device.userId || device.connectedViewerId) && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowActionsMenu(false);
                                                    if (window.confirm(`Are you sure you want to disconnect "${name}"?`)) {
                                                        onDisconnectDevice && onDisconnectDevice(device.id);
                                                    }
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                            >
                                                <Power size={14} />
                                                Disconnect Device
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowActionsMenu(false);
                                                if (window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
                                                    onDelete && onDelete(device.id);
                                                }
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                        >
                                            <Trash2 size={14} />
                                            Delete
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Type & Status Badges */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                {/* Type Badge */}
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-[10px] font-semibold uppercase tracking-wide border border-blue-200">
                    {type}
                </span>

                {/* Status Tag - Show offline if status is live but not streaming */}
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide border
                    ${(status === 'live' && device.isStreaming) ? 'bg-green-50 text-green-700 border-green-200' :
                        status === 'in_use' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            (status === 'offline' || (status === 'live' && !device.isStreaming)) ? 'bg-red-50 text-red-700 border-red-200' :
                                'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {getStatusText(status)}
                </span>
            </div>

            {/* Details Section */}
            <div className="space-y-2.5 mb-4 text-sm flex-1">

                {/* Assignments / Status Details */}
                {(isOccupied || qaUserId || streamerId) && (
                    <div className="space-y-1.5 pt-2 border-t border-gray-100">
                        {/* QA User Details */}
                        {qaUserName && (
                            <div className="flex items-center gap-3 text-purple-600">
                                <User size={16} className="shrink-0" strokeWidth={2} />
                                <span className="text-xs font-medium truncate">QA: {qaUserName}</span>
                            </div>
                        )}

                        {/* Streamer Details */}
                        {streamerName && (
                            <div className="flex items-center gap-3 text-orange-600">
                                <Monitor size={16} className="shrink-0" strokeWidth={2} />
                                <span className="text-xs font-medium truncate">Streamer: {streamerName}</span>
                            </div>
                        )}

                        {/* ID Debug / Display */}
                        {(qaUserId || streamerId) && (
                            <div className="text-[11px] text-gray-400 font-mono">
                                ID: {qaUserId || streamerId}
                            </div>
                        )}
                        {(qaSessionId || streamerSessionId) && (
                            <div className="text-[10px] text-gray-300 font-mono truncate">
                                Sess: {qaSessionId || streamerSessionId}
                            </div>
                        )}

                        {/* Generic Fallback (Legacy) */}
                        {!qaUserName && !streamerName && username && (
                            <div className="flex items-center gap-3 text-gray-600">
                                <User size={16} className="shrink-0" strokeWidth={2} />
                                <span className="text-xs font-medium truncate">{username}</span>
                            </div>
                        )}

                        {/* Connected Viewer Details */}
                        {connectedViewerName && connectedViewerId && isLive && (
                            <div className="flex items-center gap-3 text-blue-600 pt-1 border-t border-blue-100">
                                <User size={16} className="shrink-0" strokeWidth={2} />
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs font-medium truncate">Viewer: {connectedViewerName}</span>
                                    <div className="text-[10px] text-blue-400 font-mono truncate">ID: {connectedViewerId}</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Specifications */}
                {specifications && Object.keys(specifications).length > 0 && (
                    <div className="pt-2 border-t border-gray-100 space-y-1.5">
                        {specifications.osVersion && (
                            <div className="flex items-center gap-2 text-gray-600">
                                <Monitor size={14} className="text-gray-400" />
                                <span className="text-[11px]">OS: {specifications.osVersion}</span>
                            </div>
                        )}
                        {specifications.ipAddress && (
                            <div className="flex items-center gap-2 text-gray-600">
                                <Cpu size={14} className="text-gray-400" />
                                <span className="text-[11px] font-mono">{specifications.ipAddress}</span>
                            </div>
                        )}
                        {specifications.backendUrl && (
                            <div className="flex items-center gap-2 text-gray-600">
                                <HardDrive size={14} className="text-gray-400" />
                                <span className="text-[11px] font-mono truncate">{specifications.backendUrl}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Actions Footer */}
            <div className="mt-auto pt-3 border-t border-gray-100">
                {userRole === 'streamer' ? (
                    <>
                        {isOccupied && device.isStreaming ? (
                            // Only show occupied if actually streaming
                            (currentUserId && (device.userId === currentUserId || device.userId === Number(currentUserId))) ? ( // Check if current user is the streamer
                                <button
                                    onClick={() => window.location.href = `/streaming/${id}`}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-sm hover:shadow active:scale-[0.98]"
                                >
                                    Continue Streaming
                                </button>
                            ) : (
                                <div className="w-full bg-orange-100 border-orange-200 text-orange-700 border font-medium py-2.5 rounded-lg text-center text-sm flex items-center justify-center gap-2 select-none">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
                                    </span>
                                    Streaming ({username || 'Unknown'})
                                </div>
                            )
                        ) : (
                            // Device is offline or not streaming - show Start Streaming button
                            <button
                                onClick={() => window.location.href = `/streaming/${id}`}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-sm hover:shadow active:scale-[0.98]"
                            >
                                Start Streaming
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        {/* Simple logic: 
                            - If device has userId/username AND current user is not that user → Show "Request to Connect"
                            - If device has no userId/username OR current user is the owner → Show "Connect" (only if live and streaming)
                            - If device is offline → Show "Device offline"
                        */}
                        {(() => {
                            // Check if device has a user assigned
                            const hasUser = device.userId && device.username;
                            // Check if current user is the device owner
                            const isCurrentUserOwner = currentUserId && (device.userId === currentUserId || device.userId === Number(currentUserId));
                            
                            // If device is offline, show offline button
                            if (isOffline || !isLive || !device.isStreaming) {
                                return (
                                    <button
                                        disabled
                                        className="w-full bg-gray-50 border border-gray-200 text-gray-500 font-medium py-2.5 rounded-lg text-center text-sm cursor-not-allowed"
                                    >
                                        Device offline
                                    </button>
                                );
                            }
                            
                            // If device has user AND current user is not the owner → Request to Connect
                            if (hasUser && !isCurrentUserOwner) {
                                return (
                                    <>
                            <button
                                            onClick={() => setShowRequestModal(true)}
                                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-sm hover:shadow active:scale-[0.98]"
                            >
                                            Request to Connect
                            </button>
                                        <RequestConnectModal
                                            isOpen={showRequestModal}
                                            onClose={() => setShowRequestModal(false)}
                                            onConfirm={async (note) => {
                                                await onRequest?.(device, note);
                                                setShowRequestModal(false);
                                            }}
                                            deviceName={name}
                                            connectedViewerName={connectedViewerName || username || 'Unknown User'}
                                        />
                                    </>
                                );
                            }
                            
                            // If device has no user OR current user is the owner → Connect
                            return (
                                <button
                                    onClick={() => window.location.href = `/streaming-view/${id}`}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-sm hover:shadow active:scale-[0.98]"
                                >
                                    Connect
                                </button>
                            );
                        })()}
                    </>
                )}
            </div>
        </div>
    );
};

export default DeviceCard;
