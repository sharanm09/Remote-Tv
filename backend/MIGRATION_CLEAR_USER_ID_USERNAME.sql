-- Migration: Clear userId and username from devices
-- This makes devices available for connection by removing user assignments

-- Clear userId and username for all devices (or specific device)
-- Option 1: Clear for all devices
UPDATE devices 
SET userId = NULL, username = NULL 
WHERE userId IS NOT NULL OR username IS NOT NULL;

-- Option 2: Clear for specific device (uncomment and use device ID)
-- UPDATE devices 
-- SET userId = NULL, username = NULL 
-- WHERE id = '4f65d71a-fce2-478b-96c9-d2a92e72af8d';

-- Verify the update
SELECT id, name, userId, username, status, isStreaming 
FROM devices 
WHERE id = '4f65d71a-fce2-478b-96c9-d2a92e72af8d';
