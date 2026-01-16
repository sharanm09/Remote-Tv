import React, { useState } from 'react';
import { X, Check, XCircle } from 'lucide-react';

const IncomingRequestModal = ({ isOpen, request, onApprove, onReject }) => {
    const [role, setRole] = useState('approve'); // approve | reject
    const [rejectReason, setRejectReason] = useState('');

    if (!isOpen || !request) return null;

    const handleReject = () => {
        onReject(request.requestId, rejectReason);
        setRejectReason('');
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300 border border-red-100">
                <div className="p-1 bg-gradient-to-r from-orange-400 to-red-500"></div>

                <div className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="p-3 bg-orange-100 text-orange-600 rounded-full shrink-0">
                            <span className="font-bold text-lg">!</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Device Request Received</h3>
                            <p className="text-sm text-gray-600 mt-1">
                                <span className="font-semibold text-gray-900">{request.requesterName}</span> wants to use <span className="font-semibold text-blue-600">{request.deviceName}</span>.
                            </p>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-6">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Message</span>
                        <p className="text-sm text-gray-800 mt-1 italic">"{request.message}"</p>
                    </div>

                    {role === 'reject' ? (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Rejection</label>
                            <input
                                type="text"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="E.g., In the middle of testing..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                                autoFocus
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setRole('approve')} // Go back
                                    className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleReject}
                                    disabled={!rejectReason.trim()}
                                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                                >
                                    Confirm Reject
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                onClick={() => setRole('reject')}
                                className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-gray-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 font-medium transition-all flex items-center justify-center gap-2"
                            >
                                <XCircle size={18} />
                                Reject
                            </button>
                            <button
                                onClick={() => onApprove(request.requestId)}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-green-600 text-white hover:bg-green-700 font-medium shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
                            >
                                <Check size={18} />
                                Approve & Release
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default IncomingRequestModal;
