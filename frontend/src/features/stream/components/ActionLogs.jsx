import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Mail, Download, Trash2, Filter } from 'lucide-react';

const ActionLogs = ({ logs = [], onClearLogs, onExportLogs }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState('all'); // 'all', 'action', 'info', 'error', 'success'

    // Auto-scroll disabled - user will manually scroll when needed

    const getLogType = (message) => {
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes('error') || lowerMsg.includes('failed')) return 'error';
        if (lowerMsg.includes('success') || lowerMsg.includes('launched') || lowerMsg.includes('connected')) return 'success';
        if (lowerMsg.includes('button') || lowerMsg.includes('navigation') || lowerMsg.includes('app')) return 'action';
        return 'info';
    };

    const getLogColor = (type) => {
        switch (type) {
            case 'error': return 'border-red-500';
            case 'success': return 'border-green-500';
            case 'action': return 'border-blue-500';
            case 'info': return 'border-gray-300';
            default: return 'border-gray-300';
        }
    };

    const getTextColor = (type) => {
        switch (type) {
            case 'error': return 'text-red-600';
            case 'success': return 'text-green-600';
            case 'action': return 'text-blue-600';
            default: return 'text-gray-700';
        }
    };

    const filteredLogs = filter === 'all' 
        ? logs 
        : logs.filter(log => {
            const type = getLogType(log.message);
            return type === filter;
        });

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
        return `[${hours}:${minutes}:${seconds}.${milliseconds}]`;
    };

    const handleExport = () => {
        if (onExportLogs) {
            onExportLogs(filteredLogs);
        } else {
            // Default export behavior
            const logText = filteredLogs.map(log => 
                `${formatTimestamp(log.timestamp)} ${log.message}`
            ).join('\n');
            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `action-logs-${Date.now()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const handleClear = () => {
        if (window.confirm('Are you sure you want to clear all logs?')) {
            if (onClearLogs) {
                onClearLogs();
            }
        }
    };

    return (
        <div className="bg-white">
            {/* Header */}
            <div 
                className="px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                        Action Logs ({logs.length})
                    </span>
                    {isOpen ? (
                        <ChevronUp size={16} className="text-gray-400" />
                    ) : (
                        <ChevronDown size={16} className="text-gray-400" />
                    )}
                </div>
                
                <div className="flex items-center gap-2">
                    {/* Status Indicator Circles */}
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    </div>
                    
                    {/* Action Icons */}
                    {isOpen && (
                        <div className="flex items-center gap-1 ml-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Mail/notification action - can be customized
                                }}
                                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                                title="Notifications"
                            >
                                <Mail size={14} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleExport();
                                }}
                                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                                title="Download Logs"
                            >
                                <Download size={14} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleClear();
                                }}
                                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600 transition-colors"
                                title="Clear Logs"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            {isOpen && (
                <div className="border-t border-gray-100 flex flex-col" style={{ minHeight: '400px', maxHeight: '600px' }}>
                    {/* Filter Buttons */}
                    <div className="px-6 py-2 flex items-center gap-2 border-b border-gray-100 shrink-0">
                        {['all', 'action', 'info', 'error', 'success'].map((filterType) => (
                            <button
                                key={filterType}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setFilter(filterType);
                                }}
                                className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-colors ${
                                    filter === filterType
                                        ? 'bg-gray-800 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Logs List - Scrollable Container */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ minHeight: '350px' }}>
                        {filteredLogs.length === 0 ? (
                            <div className="px-6 py-8 text-center text-gray-400 text-xs" style={{ minHeight: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                No logs available
                            </div>
                        ) : (
                            <div className="py-2">
                                {/* All Logs Section (if filter is 'all') */}
                                {filter === 'all' && (
                                    <>
                                        {filteredLogs.map((log, index) => {
                                            const logType = getLogType(log.message);
                                            const borderColor = getLogColor(logType);
                                            const textColor = getTextColor(logType);
                                            
                                            return (
                                                <div
                                                    key={log.id || index}
                                                    className="px-6 py-2.5 border-l-2 hover:bg-gray-50 transition-colors"
                                                    style={{ borderLeftColor: borderColor.includes('red') ? '#ef4444' : 
                                                                        borderColor.includes('green') ? '#22c55e' :
                                                                        borderColor.includes('blue') ? '#3b82f6' : '#d1d5db' }}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">
                                                            {formatTimestamp(log.timestamp)}
                                                        </span>
                                                        <span className={`text-xs ${textColor} flex-1`}>
                                                            {log.message}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                                
                                {/* Separated by Type Sections (if filter is 'all') */}
                                {filter === 'all' && (
                                    <>
                                        {/* Success Logs Section */}
                                        {logs.filter(log => getLogType(log.message) === 'success').length > 0 && (
                                            <div className="mt-4 border-t border-gray-200 pt-4">
                                                <div className="px-6 pb-2">
                                                    <h3 className="text-xs font-bold text-green-600 uppercase tracking-wider">
                                                        Success ({logs.filter(log => getLogType(log.message) === 'success').length})
                                                    </h3>
                                                </div>
                                                {logs.filter(log => getLogType(log.message) === 'success').map((log, index) => (
                                                    <div
                                                        key={log.id || index}
                                                        className="px-6 py-2.5 border-l-2 border-green-500 hover:bg-gray-50 transition-colors"
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">
                                                                {formatTimestamp(log.timestamp)}
                                                            </span>
                                                            <span className="text-xs text-green-600 flex-1">
                                                                {log.message}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {/* Error Logs Section */}
                                        {logs.filter(log => getLogType(log.message) === 'error').length > 0 && (
                                            <div className="mt-4 border-t border-gray-200 pt-4">
                                                <div className="px-6 pb-2">
                                                    <h3 className="text-xs font-bold text-red-600 uppercase tracking-wider">
                                                        Error ({logs.filter(log => getLogType(log.message) === 'error').length})
                                                    </h3>
                                                </div>
                                                {logs.filter(log => getLogType(log.message) === 'error').map((log, index) => (
                                                    <div
                                                        key={log.id || index}
                                                        className="px-6 py-2.5 border-l-2 border-red-500 hover:bg-gray-50 transition-colors"
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">
                                                                {formatTimestamp(log.timestamp)}
                                                            </span>
                                                            <span className="text-xs text-red-600 flex-1">
                                                                {log.message}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {/* Action Logs Section */}
                                        {logs.filter(log => getLogType(log.message) === 'action').length > 0 && (
                                            <div className="mt-4 border-t border-gray-200 pt-4">
                                                <div className="px-6 pb-2">
                                                    <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                                                        Action ({logs.filter(log => getLogType(log.message) === 'action').length})
                                                    </h3>
                                                </div>
                                                {logs.filter(log => getLogType(log.message) === 'action').map((log, index) => (
                                                    <div
                                                        key={log.id || index}
                                                        className="px-6 py-2.5 border-l-2 border-blue-500 hover:bg-gray-50 transition-colors"
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">
                                                                {formatTimestamp(log.timestamp)}
                                                            </span>
                                                            <span className="text-xs text-blue-600 flex-1">
                                                                {log.message}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {/* Info Logs Section */}
                                        {logs.filter(log => getLogType(log.message) === 'info').length > 0 && (
                                            <div className="mt-4 border-t border-gray-200 pt-4">
                                                <div className="px-6 pb-2">
                                                    <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                                                        Info ({logs.filter(log => getLogType(log.message) === 'info').length})
                                                    </h3>
                                                </div>
                                                {logs.filter(log => getLogType(log.message) === 'info').map((log, index) => (
                                                    <div
                                                        key={log.id || index}
                                                        className="px-6 py-2.5 border-l-2 border-gray-300 hover:bg-gray-50 transition-colors"
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">
                                                                {formatTimestamp(log.timestamp)}
                                                            </span>
                                                            <span className="text-xs text-gray-700 flex-1">
                                                                {log.message}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                                
                                {/* Filtered View (when specific filter is selected) */}
                                {filter !== 'all' && (
                                    <>
                                        {filteredLogs.map((log, index) => {
                                            const logType = getLogType(log.message);
                                            const borderColor = getLogColor(logType);
                                            const textColor = getTextColor(logType);
                                            
                                            return (
                                                <div
                                                    key={log.id || index}
                                                    className="px-6 py-2.5 border-l-2 hover:bg-gray-50 transition-colors"
                                                    style={{ borderLeftColor: borderColor.includes('red') ? '#ef4444' : 
                                                                    borderColor.includes('green') ? '#22c55e' :
                                                                    borderColor.includes('blue') ? '#3b82f6' : '#d1d5db' }}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">
                                                            {formatTimestamp(log.timestamp)}
                                                        </span>
                                                        <span className={`text-xs ${textColor} flex-1`}>
                                                            {log.message}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #F3F4F6;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #E5E7EB;
                }
            `}} />
        </div>
    );
};

export default ActionLogs;
