import React, { useState } from 'react';
import { X, XCircle, Send } from 'lucide-react';

const RejectModal = ({ isOpen, onClose, onConfirm, requesterName, deviceName }) => {
    const [rejectReason, setRejectReason] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (rejectReason.trim()) {
            onConfirm(rejectReason.trim());
            setRejectReason('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300 border border-red-100">
                <div className="p-1 bg-gradient-to-r from-orange-400 to-red-500"></div>

                <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-red-100 text-red-600 rounded-full shrink-0">
                                <XCircle size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Reject Connection Request</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    Send a message to <span className="font-semibold text-gray-900">{requesterName}</span> about why you're rejecting access to <span className="font-semibold text-blue-600">{deviceName}</span>.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Rejection Message
                            </label>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="E.g., I'm currently using this device for testing. Please try again later..."
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm resize-none"
                                rows={4}
                                autoFocus
                                required
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!rejectReason.trim()}
                                className="px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            >
                                <Send size={16} />
                                Send Rejection
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default RejectModal;
