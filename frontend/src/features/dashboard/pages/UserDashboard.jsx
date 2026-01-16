import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, LayoutGrid, List as ListIcon, Monitor, Bell, Settings, ChevronDown, MoreVertical, Eye, Edit2, Users, ChevronLeft, ChevronRight, MapPin, Hash } from 'lucide-react';
import DeviceCard from '../components/DeviceCard';
import NotificationBell from '../components/NotificationBell';

const UserDashboard = ({ devices, userName, onLogout, userRole, onRequestAccess, currentUserId, notifications = [], onMarkNotificationAsRead, onNotificationClick, onApproveRequest, onRejectRequest }) => {
    const [viewMode, setViewMode] = useState('grid');
    const [currentPage, setCurrentPage] = useState(1);
    const [actionOpenId, setActionOpenId] = useState(null);
    const itemsPerPage = 12;
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    const actionMenuRef = useRef(null);
    const profileMenuRef = useRef(null);

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
                setActionOpenId(null);
            }
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Pagination Logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentDevices = devices.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(devices.length / itemsPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    const toggleActionMenu = (e, id) => {
        e.stopPropagation();
        setActionOpenId(actionOpenId === id ? null : id);
    };

    return (
        <div className="min-h-screen bg-gray-50/50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3 text-blue-600">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                        <Monitor size={20} />
                    </div>
                    <span className="font-bold text-lg text-gray-900">Device Lab</span>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-md text-sm font-medium text-gray-600">
                        <Monitor size={16} />
                        <span>{devices.filter(d => d.status === 'available').length + devices.filter(d => d.status === 'in_use').length}/{devices.length}</span>
                        <span className="text-gray-400">devices</span>
                    </div>
                    <NotificationBell
                        notifications={notifications}
                        onNotificationClick={onNotificationClick}
                        onMarkAsRead={onMarkNotificationAsRead}
                        onApprove={onApproveRequest}
                        onReject={onRejectRequest}
                    />
                    <button className="text-gray-500 hover:text-gray-700">
                        <Settings size={20} />
                    </button>
                    <div className="relative" ref={profileMenuRef}>
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="flex items-center gap-2 pl-2 border-l border-gray-200 hover:bg-gray-50 rounded-lg p-1 transition-colors"
                        >
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold border border-blue-200">
                                {userName.charAt(0).toUpperCase()}U
                            </div>
                            <div className="flex items-center gap-1 text-sm font-medium text-gray-700">
                                {userName}
                                <ChevronDown size={14} className="text-gray-400" />
                            </div>
                        </button>

                        {isProfileOpen && (
                            <div className="absolute right-0 top-12 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="px-4 py-3 border-b border-gray-100">
                                    <p className="text-sm font-medium text-gray-900">{userName}</p>
                                    <p className="text-xs text-gray-500 truncate">user@exe.in</p>
                                </div>
                                <button
                                    onClick={onLogout}
                                    className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                >
                                    Log Out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="p-8 max-w-[1600px] mx-auto">
                <div className="flex flex-col md:flex-row gap-6 mb-6 justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    {/* Left Side: Search, Filters, Stats */}
                    <div className="flex flex-1 items-center gap-6 w-full">
                        {/* Search */}
                        <div className="relative flex-none w-full md:w-96 lg:w-[500px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search devices..."
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            />
                        </div>

                        {/* Filters */}
                        <div className="flex gap-4">
                            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <Filter size={16} />
                                <span className="hidden xl:inline">All Platforms</span>
                                <span className="xl:hidden">Platform</span>
                                <ChevronDown size={14} className="text-gray-400" />
                            </button>
                            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                <span className="hidden xl:inline">All Status</span>
                                <span className="xl:hidden">Status</span>
                                <ChevronDown size={14} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Separator */}
                        <div className="h-8 w-px bg-gray-200 hidden lg:block"></div>

                        {/* Stats */}
                        <div className="hidden lg:flex items-center gap-4 text-sm whitespace-nowrap">
                            <div className="flex items-center gap-3">
                                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium text-xs">
                                    {devices.filter(d => d.status === 'available').length} available
                                </span>
                                <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium text-xs">
                                    {devices.filter(d => d.status === 'in_use').length} in use
                                </span>
                                <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium text-xs">
                                    {devices.filter(d => d.status === 'offline').length} offline
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Actions - NO ADD BUTTON */}
                    <div className="flex items-center gap-4">
                        <div className="flex p-1 bg-gray-100/80 rounded-lg border border-gray-200/60 h-min">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <LayoutGrid size={18} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <ListIcon size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="min-h-[600px] flex flex-col justify-between">
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                            {currentDevices.map(device => (
                                <DeviceCard key={device.id} device={device} userRole={userRole} currentUserId={currentUserId} onRequest={onRequestAccess} />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-4 font-semibold text-gray-700 text-center">Device Code</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700">Device Name</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700">Status</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700">IP Address</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700">Location</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700">Type</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {currentDevices.map((device) => (
                                            <tr key={device.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-center">
                                                        <div className="flex items-center gap-1.5 text-gray-600 font-mono text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 w-fit">
                                                            <Hash size={12} className="text-gray-400" />
                                                            {device.deviceCode}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-gray-100 rounded-lg">
                                                            <Monitor size={18} className="text-gray-600" />
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-900">{device.name}</div>
                                                            <div className="text-xs text-gray-500">{device.model}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${device.status === 'available' ? 'bg-green-100 text-green-700' :
                                                        device.status === 'in_use' ? 'bg-orange-100 text-orange-700' :
                                                            'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {device.status ? device.status.replace('_', ' ') : 'Unknown'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-mono text-gray-600">{device.ip}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-1.5 text-gray-600">
                                                        <MapPin size={14} strokeWidth={2} />
                                                        {device.location}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-600 capitalize">{device.type ? device.type.replace('_', ' ') : 'N/A'}</td>
                                                <td className="px-6 py-4 text-right relative">
                                                    <button
                                                        onClick={(e) => toggleActionMenu(e, device.id)}
                                                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                                                    >
                                                        <MoreVertical size={18} />
                                                    </button>
                                                    {actionOpenId === device.id && (
                                                        <div
                                                            ref={actionMenuRef}
                                                            className="absolute right-6 top-12 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                                                        >
                                                            <button
                                                                onClick={() => window.location.href = `/streaming-view/${device.id}`}
                                                                disabled={!(device.status === 'live' && device.isStreaming === true)}
                                                                className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 ${(device.status === 'live' && device.isStreaming === true) ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 cursor-not-allowed'}`}
                                                            >
                                                                <Monitor size={16} className={(device.status === 'live' && device.isStreaming === true) ? 'text-blue-500' : 'text-gray-300'} />
                                                                {(device.status === 'live' && device.isStreaming === true) ? 'Connect' : 'Device offline'}
                                                            </button>
                                                            <button className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                                                <Eye size={16} className="text-gray-400" /> View Details
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Pagination */}
                    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-6 rounded-xl shadow-sm">
                        <div className="hidden sm:flex flex-1 items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-700">
                                    Showing <span className="font-medium">{indexOfFirstItem + 1}</span> to <span className="font-medium">{Math.min(indexOfLastItem, devices.length)}</span> of <span className="font-medium">{devices.length}</span> results
                                </p>
                            </div>
                            <div>
                                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                                    <button
                                        onClick={() => paginate(Math.max(1, currentPage - 1))}
                                        disabled={currentPage === 1}
                                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="sr-only">Previous</span>
                                        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                    {[...Array(totalPages)].map((_, i) => (
                                        <button
                                            key={i + 1}
                                            onClick={() => paginate(i + 1)}
                                            className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold  focus:z-20 focus:outline-offset-0 ${currentPage === i + 1
                                                ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                                : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                                                }`}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                                        disabled={currentPage === totalPages}
                                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="sr-only">Next</span>
                                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </nav>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default UserDashboard;
