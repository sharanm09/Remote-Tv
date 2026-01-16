import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { TvIcon } from '@heroicons/react/24/outline';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import logo from '../assets/LOGO.png';

export default function Navbar({ 
  username, 
  streams, 
  allDevices,
  selectedCamera, 
  onCameraSelect, 
  onLogout,
  onScreenshot,
  onRecord,
  onStopRecord,
  isRecording,
  recordingMode,
  setRecordingMode,
  onRecordWithMode,
  remoteConnections = {},
  cameraConnections = {}
}) {
  // Convert allDevices object to array - simple and direct
  let devicesArray = [];
  
  if (allDevices && typeof allDevices === 'object' && !Array.isArray(allDevices)) {
    // It's an object, convert to array
    devicesArray = Object.values(allDevices);
  } else if (Array.isArray(allDevices)) {
    // Already an array
    devicesArray = allDevices;
  }

  // DEBUG: Log everything - VERY VISIBLE
  console.log('========== NAVBAR RENDER v3.2 ==========');
  console.log('allDevices:', allDevices);
  console.log('allDevices type:', typeof allDevices);
  console.log('allDevices is array?', Array.isArray(allDevices));
  console.log('allDevices keys:', allDevices ? Object.keys(allDevices) : 'null');
  console.log('allDevices values:', allDevices ? Object.values(allDevices) : 'null');
  console.log('devicesArray length:', devicesArray.length);
  console.log('devicesArray:', devicesArray);
  console.log('=========================================');

  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="navbar-content">
          {/* Logo */}
          <div className="navbar-left">
            <img src={logo} alt="Logo" className="logo-img" />
          </div>

          {/* Connected Device Section - Center */}
          <div className="navbar-center">
            <div className="device-section">
              <div className="connected-device-label">
                <TvIcon className="icon" />
                <span>Connected Device</span>
              </div>
              <div className="camera-selector">
                <Menu as="div" className="relative w-full">
                  <MenuButton className="selector-button">
                    <span className="selected-camera">
                      {selectedCamera || 'Select a device...'}
                    </span>
                    <ChevronDownIcon className="chevron-icon" />
                  </MenuButton>

                  <MenuItems className="dropdown-menu-cameras">
                    {devicesArray.length === 0 ? (
                      <div className="empty-message">No devices found</div>
                    ) : (
                      devicesArray.map((device) => {
                        if (!device || !device.cameraName) {
                          console.log('⚠️ Skipping invalid device:', device);
                          return null;
                        }
                        
                        const deviceName = device.cameraName;
                        const deviceIP = device.deviceIP || '';
                        
                        // Check if this device has an active stream (only for status badge)
                        const hasStream = streams && streams.some(s => {
                          const streamName = typeof s === 'string' ? s : s.cameraName;
                          return streamName === deviceName;
                        });
                        
                        const isRemoteActive = !!remoteConnections[deviceName];
                        const isCameraActive = !!cameraConnections[deviceName];

                        console.log('✅ Rendering device in dropdown:', deviceName, 'hasStream:', hasStream);
                        
                        return (
                          <MenuItem key={deviceName}>
                            {({ active }) => (
                              <button
                                onClick={() => onCameraSelect(deviceName)}
                                className={`menu-item ${active ? 'active' : ''} ${
                                  selectedCamera === deviceName ? 'selected' : ''
                                }`}
                              >
                                <div className="camera-details">
                                  <span className="camera-name">{deviceName}</span>
                                  {deviceIP && (
                                    <span className="camera-ip">{deviceIP}{hasStream ? ' • Live' : ''}</span>
                                  )}
                                  {(isRemoteActive || isCameraActive) && (
                                    <div className="device-status-chips">
                                      {isRemoteActive && (
                                        <span className="status-chip remote" title="Remote connected">
                                          <span className="chip-dot" />
                                          Remote
                                        </span>
                                      )}
                                      {isCameraActive && (
                                        <span className="status-chip camera" title="Camera stream connected">
                                          <span className="chip-dot" />
                                          Camera
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </button>
                            )}
                          </MenuItem>
                        );
                      })
                    )}
                  </MenuItems>
                </Menu>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {onScreenshot && onRecord && (
            <div className="navbar-actions">
              <button
                className="navbar-action-btn screenshot-btn"
                onClick={onScreenshot}
                title="Screenshot"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
              </button>
              
              {!isRecording ? (
                <Menu as="div" className="relative">
                  <MenuButton
                    className="navbar-action-btn record-btn"
                    title="Record"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="5"/>
                    </svg>
                    <ChevronDownIcon className="chevron-icon-xs" />
                  </MenuButton>
                  <MenuItems className="record-dropdown">
                    <MenuItem>
                      <button
                        onClick={() => {
                          if (onRecordWithMode) {
                            onRecordWithMode('video');
                          } else {
                            setRecordingMode('video');
                            onRecord();
                          }
                        }}
                        className={`record-mode-btn ${recordingMode === 'video' ? 'active' : ''}`}
                      >
                        📹 Video
                      </button>
                    </MenuItem>
                    <MenuItem>
                      <button
                        onClick={() => {
                          if (onRecordWithMode) {
                            onRecordWithMode('screen');
                          } else {
                            setRecordingMode('screen');
                            onRecord();
                          }
                        }}
                        className={`record-mode-btn ${recordingMode === 'screen' ? 'active' : ''}`}
                      >
                        🖥️ Screen
                      </button>
                    </MenuItem>
                  </MenuItems>
                </Menu>
              ) : (
                <button
                  className="navbar-action-btn stop-record-btn"
                  onClick={onStopRecord}
                  title={`Stop ${recordingMode === 'screen' ? 'Screen' : 'Video'} Recording`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* User Menu */}
          <div className="navbar-right">
            <Menu as="div" className="relative">
              <MenuButton className="user-button">
                <div className="user-avatar">
                  {username.charAt(0).toUpperCase()}
                </div>
                <span className="username">{username}</span>
                <ChevronDownIcon className="chevron-icon-sm" />
              </MenuButton>

              <MenuItems className="dropdown-menu-right">
                <MenuItem>
                  {({ active }) => (
                    <div className={`menu-item ${active ? 'active' : ''}`}>
                      <span>👤 {username}</span>
                    </div>
                  )}
                </MenuItem>
                <MenuItem>
                  {({ active }) => (
                    <button
                      onClick={onLogout}
                      className={`menu-item logout ${active ? 'active' : ''}`}
                    >
                      <span>🚪 Logout</span>
                    </button>
                  )}
                </MenuItem>
              </MenuItems>
            </Menu>
          </div>
        </div>
      </div>
    </header>
  );
}
