import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { Search, Filter, Plus, MoreVertical, Eye, Edit2, ChevronLeft, ChevronRight, Users as UsersIcon, Shield } from 'lucide-react';
import AdminLayout from '../../../components/layout/AdminLayout';
import AddUserModal from '../../users/components/AddUserModal';
import AddRoleModal from '../../roles/components/AddRoleModal';
import ViewUserModal from '../../users/components/ViewUserModal';
import EditUserModal from '../../users/components/EditUserModal';
import ViewRoleModal from '../../roles/components/ViewRoleModal';
import EditRoleModal from '../../roles/components/EditRoleModal';

const UserRoleManagement = () => {
    const [activeTab, setActiveTab] = useState('users');
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [currentUserEmail, setCurrentUserEmail] = useState(localStorage.getItem('userName') || '');

    // Action modals
    const [isViewUserModalOpen, setIsViewUserModalOpen] = useState(false);
    const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
    const [isViewRoleModalOpen, setIsViewRoleModalOpen] = useState(false);
    const [isEditRoleModalOpen, setIsEditRoleModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedRole, setSelectedRole] = useState(null);

    // Dropdown state
    const [actionMenuId, setActionMenuId] = useState(null);
    const actionMenuRef = useRef(null);

    const itemsPerPage = 10;

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
                setActionMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch Users
    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/users`, {
                credentials: 'include'
            });
            const data = await response.json();
            setUsers(data.users || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch Roles
    const fetchRoles = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/roles`, {
                credentials: 'include'
            });
            const data = await response.json();
            setRoles(data.roles || []);
        } catch (error) {
            console.error('Failed to fetch roles:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'users') {
            fetchUsers();
        } else {
            fetchRoles();
        }
        setCurrentPage(1);
        setSearchQuery('');
    }, [activeTab]);

    // Filter data based on search
    const filteredUsers = users.filter(user =>
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredRoles = roles.filter(role =>
        role.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Pagination
    const currentData = activeTab === 'users' ? filteredUsers : filteredRoles;
    const totalPages = Math.ceil(currentData.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = currentData.slice(indexOfFirstItem, indexOfLastItem);

    const handleUserAdded = () => {
        setIsAddUserModalOpen(false);
        fetchUsers();
    };

    const handleRoleAdded = () => {
        setIsAddRoleModalOpen(false);
        fetchRoles();
    };

    const handleUserUpdated = () => {
        fetchUsers();
    };

    const handleRoleUpdated = () => {
        fetchRoles();
    };

    const toggleUserStatus = async (userId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/users/${userId}/status`, {
                method: 'PATCH',
                credentials: 'include'
            });

            if (response.ok) {
                fetchUsers();
            }
        } catch (error) {
            console.error('Failed to toggle user status:', error);
        }
        setActionMenuId(null);
    };

    const handleViewUser = (user) => {
        setSelectedUser(user);
        setIsViewUserModalOpen(true);
        setActionMenuId(null);
    };

    const handleEditUser = (user) => {
        setSelectedUser(user);
        setIsEditUserModalOpen(true);
        setActionMenuId(null);
    };

    const handleViewRole = (role) => {
        setSelectedRole(role);
        setIsViewRoleModalOpen(true);
        setActionMenuId(null);
    };

    const handleEditRole = (role) => {
        setSelectedRole(role);
        setIsEditRoleModalOpen(true);
        setActionMenuId(null);
    };

    return (
        <AdminLayout>
            <div className="p-8">
                <div className="max-w-[1600px] mx-auto">
                    {/* Header */}
                    <div className="mb-6">
                        <h1 className="text-3xl font-bold text-gray-900">User & Role Management</h1>
                        <p className="text-gray-500 mt-1">Manage system users and roles</p>
                    </div>

                    {/* Tabs */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div className="border-b border-gray-200">
                            <div className="flex">
                                <button
                                    onClick={() => setActiveTab('users')}
                                    className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 ${activeTab === 'users'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <UsersIcon size={20} />
                                    Users ({users.length})
                                </button>
                                <button
                                    onClick={() => setActiveTab('roles')}
                                    className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 ${activeTab === 'roles'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <Shield size={20} />
                                    Roles ({roles.length})
                                </button>
                            </div>
                        </div>

                        {/* Toolbar */}
                        <div className="p-4 flex items-center justify-between gap-4 border-b border-gray-200">
                            <div className="flex items-center gap-4 flex-1">
                                {/* Search */}
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder={`Search ${activeTab}...`}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    />
                                </div>

                                {/* Filter Button */}
                                <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    <Filter size={16} />
                                    Filter
                                </button>
                            </div>

                            {/* Add Button */}
                            <button
                                onClick={() => activeTab === 'users' ? setIsAddUserModalOpen(true) : setIsAddRoleModalOpen(true)}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                <Plus size={18} />
                                Add {activeTab === 'users' ? 'User' : 'Role'}
                            </button>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            {loading ? (
                                <div className="p-12 text-center text-gray-500">Loading...</div>
                            ) : currentItems.length === 0 ? (
                                <div className="p-12 text-center text-gray-500">
                                    No {activeTab} found
                                </div>
                            ) : activeTab === 'users' ? (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-4 font-semibold text-gray-700">Name</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700">Email</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700">Role</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700">Status</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {currentItems.map((user) => (
                                            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900">{user.displayName}</div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-600">{user.email}</td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                        {user.UserRole?.name || 'N/A'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                        }`}>
                                                        {user.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right relative">
                                                    <button
                                                        onClick={() => setActionMenuId(actionMenuId === user.id ? null : user.id)}
                                                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all"
                                                    >
                                                        <MoreVertical size={18} />
                                                    </button>
                                                    {actionMenuId === user.id && (
                                                        <div
                                                            ref={actionMenuRef}
                                                            className="absolute right-6 top-12 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 overflow-hidden"
                                                        >
                                                            <button
                                                                onClick={() => handleViewUser(user)}
                                                                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                            >
                                                                <Eye size={16} className="text-gray-400" /> View
                                                            </button>
                                                            <button
                                                                onClick={() => handleEditUser(user)}
                                                                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                            >
                                                                <Edit2 size={16} className="text-gray-400" /> Edit
                                                            </button>
                                                            {user.email !== localStorage.getItem('userName') && (
                                                                <button
                                                                    onClick={() => toggleUserStatus(user.id)}
                                                                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${user.isActive ? 'text-red-600' : 'text-green-600'
                                                                        }`}
                                                                >
                                                                    {user.isActive ? 'Deactivate' : 'Activate'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-4 font-semibold text-gray-700">Role Name</th>
                                            <th className="px-6 py-4 font-semibold text-gray-700 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {currentItems.map((role) => (
                                            <tr key={role.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900">{role.name}</div>
                                                </td>
                                                <td className="px-6 py-4 text-right relative">
                                                    <button
                                                        onClick={() => setActionMenuId(actionMenuId === role.id ? null : role.id)}
                                                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all"
                                                    >
                                                        <MoreVertical size={18} />
                                                    </button>
                                                    {actionMenuId === role.id && (
                                                        <div
                                                            ref={actionMenuRef}
                                                            className="absolute right-6 top-12 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 overflow-hidden"
                                                        >
                                                            <button
                                                                onClick={() => handleViewRole(role)}
                                                                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                            >
                                                                <Eye size={16} className="text-gray-400" /> View
                                                            </button>
                                                            <button
                                                                onClick={() => handleEditRole(role)}
                                                                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                            >
                                                                <Edit2 size={16} className="text-gray-400" /> Edit
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Pagination */}
                        {!loading && currentItems.length > 0 && (
                            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
                                <div className="text-sm text-gray-700">
                                    Showing <span className="font-medium">{indexOfFirstItem + 1}</span> to{' '}
                                    <span className="font-medium">{Math.min(indexOfLastItem, currentData.length)}</span> of{' '}
                                    <span className="font-medium">{currentData.length}</span> results
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <div className="flex items-center gap-1">
                                        {[...Array(totalPages)].map((_, i) => (
                                            <button
                                                key={i + 1}
                                                onClick={() => setCurrentPage(i + 1)}
                                                className={`px-3 py-1 rounded text-sm font-medium transition-all ${currentPage === i + 1
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                                    }`}
                                            >
                                                {i + 1}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <AddUserModal
                isOpen={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
                onUserAdded={handleUserAdded}
            />
            <AddRoleModal
                isOpen={isAddRoleModalOpen}
                onClose={() => setIsAddRoleModalOpen(false)}
                onRoleAdded={handleRoleAdded}
            />
            <ViewUserModal
                isOpen={isViewUserModalOpen}
                onClose={() => setIsViewUserModalOpen(false)}
                user={selectedUser}
            />
            <EditUserModal
                isOpen={isEditUserModalOpen}
                onClose={() => setIsEditUserModalOpen(false)}
                user={selectedUser}
                onUserUpdated={handleUserUpdated}
            />
            <ViewRoleModal
                isOpen={isViewRoleModalOpen}
                onClose={() => setIsViewRoleModalOpen(false)}
                role={selectedRole}
            />
            <EditRoleModal
                isOpen={isEditRoleModalOpen}
                onClose={() => setIsEditRoleModalOpen(false)}
                role={selectedRole}
                onRoleUpdated={handleRoleUpdated}
            />
        </AdminLayout>
    );
};

export default UserRoleManagement;
