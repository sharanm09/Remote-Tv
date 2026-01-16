import React, { useState } from 'react';
import { Power, Volume2, VolumeX, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Square, Play, Pause, ChevronFirst, ChevronLast, Home, Menu, Settings, RotateCcw, ArrowLeft } from 'lucide-react';

export default function TVRemote({ onCommand, isConnected, device }) {
    const [neonButton, setNeonButton] = useState(null);

    const handleCommand = (type, action, buttonId) => {
        if (!isConnected) {
            console.warn('⚠️ Remote not connected. Cannot send command.');
            return;
        }
        if (onCommand) {
            // Format: { type: 'key', params: { action: 'power' } }
            console.log('📤 [Remote] Sending command:', type, action);
            onCommand(type, { action });
            
            // Trigger neon light effect
            if (buttonId) {
                setNeonButton(buttonId);
                setTimeout(() => setNeonButton(null), 300); // Remove glow after 300ms
            }
        }
    };

    const handleTextCommand = (text) => {
        if (!isConnected) {
            console.warn('⚠️ Remote not connected. Cannot send text.');
            return;
        }
        if (onCommand) {
            onCommand('text', { text });
        }
    };

    const handleAppShortcut = (appName, buttonId) => {
        if (!isConnected) {
            console.warn('⚠️ Remote not connected. Cannot launch app.');
            return;
        }
        if (onCommand) {
            // Map app names to lowercase keys that match the keymap
            const appKeyMap = {
                'YouTube': 'youtube',
                'Netflix': 'netflix',
                'meWatch': 'mewatch',
                'Prime Video': 'prime'
            };
            const appKey = appKeyMap[appName] || appName.toLowerCase();
            console.log('📤 [Remote] Launching app:', appName, '-> key:', appKey);
            // Send as key command (TVs have dedicated app keys)
            onCommand('key', { action: appKey });
            
            // Trigger neon light effect
            if (buttonId) {
                setNeonButton(buttonId);
                setTimeout(() => setNeonButton(null), 300);
            }
        }
    };
    return (
        <div className="flex flex-col items-center w-full bg-[#F9FAFB] pb-3">
            {/* Connection Status Indicator - Removed (moved to top header) */}
            <div className="w-[240px] bg-[#1A1A1A] rounded-[3rem] shadow-2xl py-[12px] px-5 border-[4px] border-[#2A2A2A]">

                {/* Row 1: Power, LED Light Indicator, Mute */}
                <div className="grid grid-cols-3 gap-2.5 mb-2 px-1">
                    <button 
                        onClick={() => handleCommand('key', 'power', 'power')}
                        disabled={!isConnected}
                        className={`bg-red-500 hover:bg-red-600 rounded-lg w-9 h-9 mx-auto flex items-center justify-center shadow-md active:scale-90 transition-all text-white ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Power"
                    >
                        <Power className="w-4 h-4" />
                    </button>
                    <div className="flex items-center justify-center">
                        {/* Small Round LED Light Indicator */}
                        <div className={`w-2 h-2 rounded-full transition-all duration-300 ${neonButton ? 'bg-green-500 led-blink' : 'bg-gray-400'}`}></div>
                    </div>
                    <button 
                        onClick={() => handleCommand('key', 'mute', 'mute')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 rounded-lg w-9 h-9 mx-auto flex items-center justify-center shadow-sm active:scale-95 transition-all text-gray-900 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Mute"
                    >
                        <VolumeX className="w-4 h-4" />
                    </button>
                </div>

                {/* Row 2: Navigation Pad (D-pad + OK) */}
                <div className="mb-5">
                    <div className="grid grid-cols-3 gap-2 px-1">
                        <div></div>
                        <button 
                            onClick={() => handleCommand('key', 'up', 'up')}
                            disabled={!isConnected}
                            className={`bg-white hover:bg-gray-100 rounded-lg p-2.5 flex items-center justify-center transition-all text-gray-900 active:scale-90 shadow-sm ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Up"
                        >
                            <ChevronUp className="w-5 h-5" />
                        </button>
                        <div></div>

                        <button 
                            onClick={() => handleCommand('key', 'left', 'left')}
                            disabled={!isConnected}
                            className={`bg-white hover:bg-gray-100 rounded-lg p-2.5 flex items-center justify-center transition-all text-gray-900 active:scale-90 shadow-sm ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Left"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={() => handleCommand('key', 'enter', 'ok')}
                            disabled={!isConnected}
                            className={`bg-indigo-600 hover:bg-indigo-500 rounded-full p-3.5 flex items-center justify-center shadow-lg active:scale-90 transition-all ring-4 ring-[#2A2A2A] ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="OK/Enter"
                        >
                            <span className="text-white font-black text-[10px]">OK</span>
                        </button>
                        <button 
                            onClick={() => handleCommand('key', 'right', 'right')}
                            disabled={!isConnected}
                            className={`bg-white hover:bg-gray-100 rounded-lg p-2.5 flex items-center justify-center transition-all text-gray-900 active:scale-90 shadow-sm ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Right"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>

                        <div></div>
                        <button 
                            onClick={() => handleCommand('key', 'down', 'down')}
                            disabled={!isConnected}
                            className={`bg-white hover:bg-gray-100 rounded-lg p-2.5 flex items-center justify-center transition-all text-gray-900 active:scale-90 shadow-sm ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Down"
                        >
                            <ChevronDown className="w-5 h-5" />
                        </button>
                        <div></div>
                    </div>
                </div>

                {/* Row 3: Vertical Volume and Channel Row */}
                <div className="grid grid-cols-2 gap-6 mb-5 px-8">
                    {/* Volume Control */}
                    <div className="flex flex-col items-center bg-white rounded-[1.4rem] p-1 shadow-md overflow-hidden">
                        <button 
                        onClick={() => handleCommand('key', 'volume_up', 'vol-up')}
                            disabled={!isConnected}
                            className={`w-full h-8 hover:bg-gray-100 rounded-t-2xl transition-all active:scale-90 flex items-center justify-center ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Volume Up"
                        >
                            <span className="text-gray-900 font-black text-lg">+</span>
                        </button>
                        <div className="h-4 flex items-center justify-center w-full">
                            <span className="text-[8px] font-black text-gray-400 tracking-widest uppercase">VOL</span>
                        </div>
                        <button 
                            onClick={() => handleCommand('key', 'volume_down', 'vol-down')}
                            disabled={!isConnected}
                            className={`w-full h-8 hover:bg-gray-100 rounded-b-2xl transition-all active:scale-90 flex items-center justify-center ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Volume Down"
                        >
                            <span className="text-gray-900 font-black text-lg">−</span>
                        </button>
                    </div>

                    {/* Channel Control */}
                    <div className="flex flex-col items-center bg-white rounded-[1.4rem] p-1 shadow-md overflow-hidden">
                        <button 
                            onClick={() => handleCommand('key', 'channel_up', 'ch-up')}
                            disabled={!isConnected}
                            className={`w-full h-8 hover:bg-gray-100 rounded-t-2xl transition-all active:scale-90 flex items-center justify-center ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Channel Up"
                        >
                            <span className="text-gray-900 font-bold text-[9px] uppercase leading-none">CH+</span>
                        </button>
                        <div className="h-4 flex items-center justify-center w-full">
                            <span className="text-[8px] font-black text-gray-400 tracking-widest uppercase">PAGE</span>
                        </div>
                        <button 
                            onClick={() => handleCommand('key', 'channel_down', 'ch-down')}
                            disabled={!isConnected}
                            className={`w-full h-8 hover:bg-gray-100 rounded-b-2xl transition-all active:scale-90 flex items-center justify-center ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Channel Down"
                        >
                            <span className="text-gray-900 font-bold text-[9px] uppercase leading-none">CH−</span>
                        </button>
                    </div>
                </div>

                {/* Row 4: Playback Controls */}
                <div className="grid grid-cols-4 gap-2 mb-5 px-1">
                    <button 
                        onClick={() => handleCommand('key', 'rewind', 'rewind')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 p-2 rounded-lg flex items-center justify-center transition-all group active:scale-90 shadow-sm ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Previous/Rewind"
                    >
                        <ChevronFirst className="w-4.5 h-4.5 text-gray-900" />
                    </button>
                    <button 
                        onClick={() => handleCommand('key', 'play', 'play')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 p-2 rounded-lg flex items-center justify-center transition-all group active:scale-90 shadow-sm ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Play"
                    >
                        <Play className="w-4.5 h-4.5 text-gray-900" fill="currentColor" />
                    </button>
                    <button 
                        onClick={() => handleCommand('key', 'stop', 'stop')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 p-2 rounded-lg flex items-center justify-center transition-all group active:scale-90 shadow-sm ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Stop"
                    >
                        <Square className="w-3.5 h-3.5 text-gray-900" fill="currentColor" />
                    </button>
                    <button 
                        onClick={() => handleCommand('key', 'fast_forward', 'ff')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 p-2 rounded-lg flex items-center justify-center transition-all group active:scale-90 shadow-sm ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Next/Fast Forward"
                    >
                        <ChevronLast className="w-4.5 h-4.5 text-gray-900" />
                    </button>
                </div>

                {/* Row 5: App Shortcuts (4 buttons in a row) */}
                <div className="grid grid-cols-4 gap-1.5 mb-3 px-1">
                    <button 
                        onClick={() => handleAppShortcut('YouTube', 'youtube')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 h-[24px] rounded-md flex items-center justify-center shadow-md active:scale-95 transition-all overflow-hidden p-0.5 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="YouTube"
                    >
                        <img src="/images/shortcuts/youtube_text.png" alt="YouTube" className="w-full h-full object-contain scale-[2.1]" />
                    </button>
                    <button 
                        onClick={() => handleAppShortcut('Netflix', 'netflix')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 h-[24px] rounded-md flex items-center justify-center shadow-md active:scale-95 transition-all overflow-hidden p-0.5 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Netflix"
                    >
                        <img src="/images/shortcuts/netflix_text.png" alt="Netflix" className="w-full h-full object-contain scale-[1.7]" />
                    </button>
                    <button 
                        onClick={() => handleAppShortcut('meWatch', 'mewatch')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 h-[24px] rounded-md flex items-center justify-center shadow-md active:scale-95 transition-all overflow-hidden p-0.5 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="meWatch"
                    >
                        <img src="/images/shortcuts/mewatch_text.png" alt="meWatch" className="w-full h-full object-contain scale-[2]" />
                    </button>
                    <button 
                        onClick={() => handleAppShortcut('Prime Video', 'prime')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 h-[24px] rounded-md flex items-center justify-center shadow-md active:scale-95 transition-all overflow-hidden p-0.5 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Prime Video"
                    >
                        <img src="/images/shortcuts/prime_original.png" alt="Prime Video" className="w-full h-full object-contain scale-[1.8]" />
                    </button>
                </div>

                {/* Row 6: Back, Home and Settings Buttons (3 buttons in a row) */}
                <div className="grid grid-cols-3 gap-1.5 mb-5 px-1">
                    <button 
                        onClick={() => handleCommand('key', 'back', 'back')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 rounded-lg py-[6px] text-gray-900 text-sm font-black shadow-sm active:scale-90 transition-all border border-gray-100 flex items-center justify-center ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Back"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => handleCommand('key', 'home', 'home')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 rounded-lg py-[6px] text-gray-900 text-sm font-black shadow-sm active:scale-90 transition-all border border-gray-100 flex items-center justify-center ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Home"
                    >
                        <Home className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => handleCommand('key', 'settings', 'settings')}
                        disabled={!isConnected}
                        className={`bg-white hover:bg-gray-100 rounded-lg py-[6px] text-gray-900 text-sm font-black shadow-sm active:scale-90 transition-all border border-gray-100 flex items-center justify-center ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Settings"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </div>

                {/* Row 7: Number Pad & Menu */}
                <div className="grid grid-cols-3 gap-1.5 mb-5 px-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, 'MENU'].map((item) => {
                        const buttonId = item === 'MENU' ? 'menu' : item === '.' ? 'dot' : `num-${item}`;
                        return (
                        <button
                            key={item}
                            onClick={() => {
                                if (item === 'MENU') {
                                        handleCommand('key', 'menu', 'menu');
                                } else if (item === '.') {
                                        handleCommand('key', 'dot', 'dot');
                                } else {
                                        handleCommand('key', String(item), buttonId);
                                }
                            }}
                            disabled={!isConnected}
                                className={`bg-white hover:bg-gray-100 rounded-lg py-[6px] text-gray-900 text-sm font-black shadow-sm active:scale-90 transition-all border border-gray-100 flex items-center justify-center ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={item === 'MENU' ? 'Menu' : item === '.' ? 'Dot' : `Number ${item}`}
                        >
                                {item === '.' ? '•' : item === 'MENU' ? <span className="text-[7px] font-black tracking-tighter">MENU</span> : item}
                        </button>
                        );
                    })}
                </div>

                {/* Row 8: Color Buttons */}
                <div className="grid grid-cols-4 gap-3 px-2">
                    <button 
                        onClick={() => handleCommand('key', 'red', 'red')}
                        disabled={!isConnected}
                        className={`bg-red-500 hover:bg-red-600 h-2.5 rounded-full shadow-md transition-all active:scale-95 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Red Button"
                    ></button>
                    <button 
                        onClick={() => handleCommand('key', 'blue', 'blue')}
                        disabled={!isConnected}
                        className={`bg-blue-500 hover:bg-blue-600 h-2.5 rounded-full shadow-md transition-all active:scale-95 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Blue Button"
                    ></button>
                    <button 
                        onClick={() => handleCommand('key', 'yellow', 'yellow')}
                        disabled={!isConnected}
                        className={`bg-yellow-400 hover:bg-yellow-500 h-2.5 rounded-full shadow-md transition-all active:scale-95 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Yellow Button"
                    ></button>
                    <button 
                        onClick={() => handleCommand('key', 'green', 'green')}
                        disabled={!isConnected}
                        className={`bg-green-500 hover:bg-green-600 h-2.5 rounded-full shadow-md transition-all active:scale-95 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Green Button"
                    ></button>
                </div>
            </div>
            
            {/* LED Blink CSS Styles */}
            <style>{`
                .led-blink {
                    animation: led-blink 0.3s ease-out;
                    box-shadow: 0 0 8px #22c55e, 0 0 12px #22c55e;
                }
                @keyframes led-blink {
                    0% { 
                        opacity: 0.3;
                        box-shadow: 0 0 2px #22c55e;
                    }
                    50% { 
                        opacity: 1;
                        box-shadow: 0 0 10px #22c55e, 0 0 15px #22c55e;
                    }
                    100% { 
                        opacity: 0.3;
                        box-shadow: 0 0 2px #22c55e;
                    }
                }
            `}</style>
        </div>
    );
}
