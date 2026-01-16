import React from 'react';
import { X, Lock, AlertCircle } from 'lucide-react';

const RequestAccessModal = ({ isOpen, onClose, deviceName, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden">
                <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600">
                        <Lock size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Request Access?</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        You are about to request control of <span className="font-semibold text-gray-700">{deviceName}</span>. The current user will be notified.
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
                        >
                            Submit
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RequestAccessModal;
