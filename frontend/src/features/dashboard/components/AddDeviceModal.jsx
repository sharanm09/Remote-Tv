import React, { useState } from 'react';
import { X, Monitor, Check, ChevronDown } from 'lucide-react';

const BACKEND_OPTIONS = [
    { label: 'Local Development', url: 'http://localhost:3000' },
    { label: 'Cloud Environment', url: 'https://cloud-dev.remotetv.com' },
    { label: 'Staging Server', url: 'https://staging.remotetv.com' },
    { label: 'Production', url: 'https://app.remotetv.com' },
    { label: 'Custom URL', url: '' }
];

const AddDeviceModal = ({ isOpen, onClose, onDeviceAdded }) => {
    const [formData, setFormData] = useState({
        name: '',
        model: '',
        type: 'Android TV',
        osVersion: '',
        ipAddress: '',
        backendUrl: BACKEND_OPTIONS[0].url,
        status: 'offline'
    });
    const [backendSystem, setBackendSystem] = useState(BACKEND_OPTIONS[0]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleBackendSelect = (option) => {
        setBackendSystem(option);
        if (option.label !== 'Custom URL') {
            setFormData(prev => ({ ...prev, backendUrl: option.url }));
        } else {
            setFormData(prev => ({ ...prev, backendUrl: '' }));
        }
        setIsDropdownOpen(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('Not authenticated');
                return;
            }

            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/devices`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: formData.name,
                    type: formData.type,
                    model: formData.model,
                    status: 'offline',
                    location: null,
                    specifications: {
                        osVersion: formData.osVersion,
                        ipAddress: formData.ipAddress,
                        backendUrl: formData.backendUrl
                    }
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to add device');
            }

            onDeviceAdded && onDeviceAdded();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-visible">
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-gray-100">
                    <div className="flex gap-4">
                        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-blue-200">
                            <Monitor size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 leading-tight">Add New Device</h2>
                            <p className="text-sm text-gray-500 mt-1">Configure a new TV device for testing.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-6">
                        {/* Device Name */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Device Name</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Living Room TV"
                                required
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            />
                        </div>

                        {/* Model */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Model</label>
                            <input
                                type="text"
                                name="model"
                                value={formData.model}
                                onChange={handleChange}
                                placeholder="Sony Bravia XR-55A80K"
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Operating System */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Operating System</label>
                            <div className="relative">
                                <select
                                    name="type"
                                    value={formData.type}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium appearance-none"
                                >
                                    <option value="Android TV">Android TV</option>
                                    <option value="LG WebOS">LG WebOS</option>
                                    <option value="Samsung Tizen">Samsung Tizen</option>
                                    <option value="Apple tvOS">Apple tvOS</option>
                                    <option value="Vidaa">Vidaa</option>
                                    <option value="Roku">Roku</option>
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                                    <ChevronDown size={16} />
                                </div>
                            </div>
                        </div>

                        {/* OS Version */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">OS Version</label>
                            <input
                                type="text"
                                name="osVersion"
                                value={formData.osVersion}
                                onChange={handleChange}
                                placeholder="Android TV 12"
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            />
                        </div>
                    </div>

                    {/* IP Address */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-gray-700">IP Address</label>
                        <input
                            type="text"
                            name="ipAddress"
                            value={formData.ipAddress}
                            onChange={handleChange}
                            placeholder="192.168.1.100"
                            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                        />
                    </div>

                    {/* Backend System - Custom Dropdown */}
                    <div className="space-y-1.5 relative">
                        <label className="text-sm font-semibold text-gray-700">Backend System</label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-left focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium flex items-center justify-between"
                            >
                                <span>{backendSystem.label}</span>
                                <ChevronDown size={16} className={`text-gray-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown Menu */}
                            {isDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-20 py-2 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                                    {BACKEND_OPTIONS.map((option) => (
                                        <button
                                            key={option.label}
                                            type="button"
                                            onClick={() => handleBackendSelect(option)}
                                            className={`w-full px-4 py-2.5 text-left text-sm font-medium flex items-center justify-between transition-colors
                                                ${backendSystem.label === option.label
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-700 hover:bg-gray-50'
                                                }`}
                                        >
                                            {option.label}
                                            {backendSystem.label === option.label && (
                                                <Check size={16} />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Backend URL */}
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 transition-all">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Backend URL:</label>
                            {backendSystem.label === 'Custom URL' ? (
                                <input
                                    type="text"
                                    name="backendUrl"
                                    value={formData.backendUrl}
                                    onChange={handleChange}
                                    placeholder="Enter custom backend URL..."
                                    className="w-full bg-transparent border-b border-gray-300 py-1 text-sm font-mono text-gray-900 focus:outline-none focus:border-blue-500 placeholder:text-gray-400/70"
                                    autoFocus
                                />
                            ) : (
                                <div className="font-mono text-sm text-gray-800">{formData.backendUrl}</div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Adding...' : 'Add Device'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddDeviceModal;
