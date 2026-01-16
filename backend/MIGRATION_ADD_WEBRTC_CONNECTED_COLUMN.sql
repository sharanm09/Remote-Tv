-- Migration: Add webrtcConnected column to devices table
-- Run this SQL in your MySQL database

USE remotetv;

-- Add webrtcConnected column if it doesn't exist
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS webrtcConnected BOOLEAN DEFAULT FALSE NOT NULL AFTER connectedViewerName;
