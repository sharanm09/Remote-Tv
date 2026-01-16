import React, { useState } from 'react';
import { Search, Filter, Plus, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import AdminLayout from '../../../components/layout/AdminLayout';
import DeviceCard from '../components/DeviceCard';
import AddDeviceModal from '../components/AddDeviceModal';
import EditDeviceModal from '../components/EditDeviceModal';

const AdminDashboard = ({ devices, loading, pagination, filters, setFilters, fetchDevices }) => {
    const [isAddDeviceModalOpen, setIsAddDeviceModalOpen] = useState(false);
    const [isEditDeviceModalOpen, setIsEditDeviceModalOpen] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [searchInput, setSearchInput] = useState(filters.search || '');

    // Handle search
    const handleSearch = (e) => {
        const value = e.target.value;
        setSearchInput(value);

        // Debounce search
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => {
            setFilters({ ...filters, search: value });
            fetchDevices(1, { ...filters, search: value });
        }, 500);
    };

    // Handle filter change
    const handleFilterChange = (filterType, value) => {
        const newFilters = { ...filters, [filterType]: value };
        setFilters(newFilters);
        fetchDevices(1, newFilters);
    };

    // Handle pagination
    const handlePageChange = (newPage) => {
        fetchDevices(newPage, filters);
    };

    // Calculate stats
    const stats = {
        live: devices.filter(d => d.status === 'live').length,
        in_use: devices.filter(d => d.status === 'in_use').length,
        offline: devices.filter(d => d.status === 'offline').length
    };

    // Handle edit device
    const handleEditDevice = (device) => {
        setSelectedDevice(device);
        setIsEditDeviceModalOpen(true);
    };

    // Handle delete device
    const handleDeleteDevice = async (deviceId) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Not authenticated');
                return;
            }

            const response = await fetch(`http://localhost:5000/api/devices/${deviceId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to delete device');
            }

            // Refresh device list
            fetchDevices(pagination.page, filters);
        } catch (error) {
            alert(`Error deleting device: ${error.message}`);
        }
    };

    // Handle stop streaming
    const handleStopStreaming = async (deviceId) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Not authenticated');
                return;
            }

            const response = await fetch(`http://localhost:5000/api/devices/${deviceId}/stop-streaming`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to stop streaming');
            }

            // Refresh device list
            fetchDevices(pagination.page, filters);
        } catch (error) {
            alert(`Error stopping streaming: ${error.message}`);
        }
    };

    // Handle disconnect device
    const handleDisconnectDevice = async (deviceId) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Not authenticated');
                return;
            }

            const response = await fetch(`http://localhost:5000/api/devices/${deviceId}/disconnect`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to disconnect device');
            }

            // Refresh device list
            fetchDevices(pagination.page, filters);
        } catch (error) {
            alert(`Error disconnecting device: ${error.message}`);
        }
    };

    // Handle device updated
    const handleDeviceUpdated = () => {
        setIsEditDeviceModalOpen(false);
        setSelectedDevice(null);
        fetchDevices(pagination.page, filters);
    };

    return (
        <AdminLayout>
            <main className="p-8 max-w-[1600px] mx-auto">
                {/* Header with Search and Filters */}
                <div className="flex flex-col md:flex-row gap-6 mb-6 justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    {/* Left Side: Search, Filters, Stats */}
                    <div className="flex flex-1 items-center gap-6 w-full flex-wrap">
                        {/* Search */}
                        <div className="relative flex-none w-full md:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search devices..."
                                value={searchInput}
                                onChange={handleSearch}
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            />
                        </div>

                        {/* Filters */}
                        <div className="flex gap-4">
                            <select
                                value={filters.type || ''}
                                onChange={(e) => handleFilterChange('type', e.target.value)}
                                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                            >
                                <option value="">All Platforms</option>
                                <option value="Android TV">Android TV</option>
                                <option value="LG WebOS">LG WebOS</option>
                                <option value="Samsung Tizen">Samsung Tizen</option>
                                <option value="Apple tvOS">Apple tvOS</option>
                                <option value="Vidaa">Vidaa</option>
                                <option value="Roku">Roku</option>
                            </select>
                        </div>

                        {/* Stats */}
                        <div className="hidden lg:flex items-center gap-3 text-sm">
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium text-xs">
                                {stats.live} live
                            </span>
                            <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium text-xs">
                                {stats.in_use} in use
                            </span>
                            <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium text-xs">
                                {stats.offline} offline
                            </span>
                        </div>
                    </div>

                    {/* Right Side: Add Device Button */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsAddDeviceModalOpen(true)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <Plus size={18} />
                            Add Device
                        </button>
                    </div>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                )}

                {/* Devices Grid */}
                {!loading && devices.length > 0 && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                            {devices.map((device) => (
                                <DeviceCard
                                    key={device.id}
                                    device={device}
                                    userRole="admin"
                                    onEdit={handleEditDevice}
                                    onDelete={handleDeleteDevice}
                                    onStopStreaming={handleStopStreaming}
                                    onDisconnectDevice={handleDisconnectDevice}
                                />
                            ))}
                        </div>

                        {/* Pagination */}
                        {pagination.totalPages > 1 && (
                            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                                <div className="text-sm text-gray-600">
                                    Showing <span className="font-semibold">{devices.length}</span> of{' '}
                                    <span className="font-semibold">{pagination.total}</span> devices
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handlePageChange(pagination.page - 1)}
                                        disabled={pagination.page === 1}
                                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>

                                    <div className="flex items-center gap-1">
                                        {[...Array(pagination.totalPages)].map((_, idx) => {
                                            const pageNum = idx + 1;
                                            // Show first, last, current, and adjacent pages
                                            if (
                                                pageNum === 1 ||
                                                pageNum === pagination.totalPages ||
                                                (pageNum >= pagination.page - 1 && pageNum <= pagination.page + 1)
                                            ) {
                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => handlePageChange(pageNum)}
                                                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${pageNum === pagination.page
                                                            ? 'bg-blue-600 text-white'
                                                            : 'hover:bg-gray-100 text-gray-700'
                                                            }`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                );
                                            } else if (
                                                pageNum === pagination.page - 2 ||
                                                pageNum === pagination.page + 2
                                            ) {
                                                return <span key={pageNum} className="px-2 text-gray-400">...</span>;
                                            }
                                            return null;
                                        })}
                                    </div>

                                    <button
                                        onClick={() => handlePageChange(pagination.page + 1)}
                                        disabled={pagination.page === pagination.totalPages}
                                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Empty State */}
                {!loading && devices.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Search size={32} className="text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No devices found</h3>
                        <p className="text-gray-500 mb-6">Try adjusting your search or filters</p>
                        <button
                            onClick={() => {
                                setSearchInput('');
                                setFilters({ search: '', status: '', type: '', location: '' });
                                fetchDevices(1, { search: '', status: '', type: '', location: '' });
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                            Clear Filters
                        </button>
                    </div>
                )}
            </main>

            {/* Add Device Modal */}
            {isAddDeviceModalOpen && (
                <AddDeviceModal
                    isOpen={isAddDeviceModalOpen}
                    onClose={() => setIsAddDeviceModalOpen(false)}
                    onDeviceAdded={() => {
                        setIsAddDeviceModalOpen(false);
                        fetchDevices(pagination.page, filters);
                    }}
                />
            )}

            {/* Edit Device Modal */}
            {isEditDeviceModalOpen && selectedDevice && (
                <EditDeviceModal
                    isOpen={isEditDeviceModalOpen}
                    onClose={() => {
                        setIsEditDeviceModalOpen(false);
                        setSelectedDevice(null);
                    }}
                    onDeviceUpdated={handleDeviceUpdated}
                    device={selectedDevice}
                />
            )}
        </AdminLayout>
    );
};

export default AdminDashboard;
