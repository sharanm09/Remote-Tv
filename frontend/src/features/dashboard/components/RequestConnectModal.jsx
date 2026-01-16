import React, { useState } from 'react';
import { X, AlertCircle, Send } from 'lucide-react';

const RequestConnectModal = ({ isOpen, onClose, onConfirm, deviceName, connectedViewerName }) => {
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!note.trim()) {
            alert('Please enter a note/message');
            return;
        }
        setIsSubmitting(true);
        await onConfirm(note);
        setIsSubmitting(false);
        setNote(''); // Reset note after sending
    };

    const handleClose = () => {
        setNote('');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900">Request to Connect</h3>
                    <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="flex-shrink-0">
                            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                                <AlertCircle size={20} className="text-orange-600" />
                            </div>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-gray-700 mb-2">
                                {connectedViewerName ? (
                                    <>
                                        <span className="font-semibold">{connectedViewerName}</span> is currently connected to <span className="font-semibold text-blue-600">{deviceName}</span>.
                                    </>
                                ) : (
                                    <>
                                        Someone is currently connected to <span className="font-semibold text-blue-600">{deviceName}</span>.
                                    </>
                                )}
                            </p>
                            <p className="text-sm font-medium text-gray-900 mb-1">
                                Are you sure you want to send a connection request?
                            </p>
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Note / Message <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Enter your reason for requesting access (e.g., 'Need to test a critical bug', 'Reviewing a feature')"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px] text-sm resize-none"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">This message will be sent to the connected user</p>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting || !note.trim()}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>Sending...</>
                            ) : (
                                <>
                                    <Send size={16} />
                                    Send Request
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RequestConnectModal;
