import React, { useState, useRef, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';
import { Monitor, Bell, Users, LayoutDashboard, Settings, LogOut, Menu, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const AdminLayout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const profileMenuRef = useRef(null);
    const userEmail = localStorage.getItem('userName') || 'admin@exe.in'; // userName actually stores the email
    const displayName = userEmail.split('@')[0].charAt(0).toUpperCase() + userEmail.split('@')[0].slice(1); // Extract name from email
    const userRole = localStorage.getItem('userRole') || 'Admin';

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        try {
            await fetch(`${API_BASE_URL}/auth/logout`, {
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

    const isActive = (path) => location.pathname === path;

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
        { icon: Users, label: 'Users & Roles', path: '/manage' },
        { icon: Settings, label: 'Settings', path: '/settings' }
    ];

    const handleMenuItemClick = (path) => {
        navigate(path);
        setIsMobileMenuOpen(false);
    };

    return (
        <div className="min-h-screen bg-gray-50/50">
            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Mobile Sidebar Drawer */}
            <aside className={`fixed top-0 left-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col z-50 transform transition-transform duration-300 lg:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}>
                {/* Close button */}
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <span className="font-bold text-lg text-gray-900">Menu</span>
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-600" />
                    </button>
                </div>

                {/* Sidebar Content */}
                <nav className="flex-1 p-4">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        return (
                            <button
                                key={item.path}
                                onClick={() => handleMenuItemClick(item.path)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all mb-2 ${active
                                    ? 'bg-blue-50 text-blue-600 font-medium'
                                    : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                <Icon size={20} className={active ? 'text-blue-600' : 'text-gray-500'} />
                                <span className="text-sm">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Logout at bottom */}
                <div className="p-4 border-t border-gray-200">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-all"
                    >
                        <LogOut size={20} />
                        <span className="text-sm font-medium">Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-30">
                    <div className="flex items-center gap-4">
                        {/* Mobile Menu Icon - Only visible on small screens */}
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <Menu size={24} className="text-gray-600" />
                        </button>

                        {/* Logo */}
                        <div className="flex items-center gap-3 text-blue-600 cursor-pointer" onClick={() => navigate('/dashboard')}>
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                                <Monitor size={20} />
                            </div>
                            <span className="font-bold text-lg text-gray-900">Device Lab</span>
                        </div>
                    </div>

                    {/* Right Side: Nav Links + Bell + Settings + Profile */}
                    <div className="flex items-center gap-4">
                        {/* Navigation - Only visible on desktop */}
                        <nav className="hidden lg:flex items-center gap-2">
                            <button
                                onClick={() => navigate('/dashboard')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive('/dashboard')
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                Dashboard
                            </button>
                            <button
                                onClick={() => navigate('/manage')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive('/manage')
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                Users & Roles
                            </button>
                        </nav>

                        <button className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <Bell size={20} />
                        </button>

                        {/* Settings Icon - Only visible on desktop */}
                        <button
                            onClick={() => navigate('/settings')}
                            className="hidden lg:block text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <Settings size={20} />
                        </button>

                        {/* Profile Section - Desktop only */}
                        <div className="hidden lg:block relative" ref={profileMenuRef}>
                            <button
                                onClick={() => setIsProfileOpen(!isProfileOpen)}
                                className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors"
                            >
                                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold border-2 border-blue-200">
                                    {displayName.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-gray-700">{displayName}</span>
                            </button>

                            {/* Profile Dropdown */}
                            {isProfileOpen && (
                                <div className="absolute right-0 top-14 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-2 overflow-hidden">
                                    <div className="px-4 py-2.5 border-b border-gray-100">
                                        <p className="text-xs text-gray-500">{userEmail}</p>
                                        <p className="text-xs text-gray-400">Role: {userRole}</p>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                    >
                                        <LogOut size={16} />
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Profile DP - Mobile only */}
                        <div className="lg:hidden w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold border-2 border-blue-200 cursor-pointer hover:border-blue-300 transition-colors">
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main>
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
