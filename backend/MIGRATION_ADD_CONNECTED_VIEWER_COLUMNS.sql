-- Migration: Add connectedViewerId and connectedViewerName columns to devices table
-- Run this SQL in your MySQL database

USE remotetv;

-- Add connectedViewerId column if it doesn't exist
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS connectedViewerId VARCHAR(255) NULL AFTER username;

-- Add connectedViewerName column if it doesn't exist  
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS connectedViewerName VARCHAR(255) NULL AFTER connectedViewerId;
