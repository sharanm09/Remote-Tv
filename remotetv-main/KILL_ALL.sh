#!/bin/bash

# Remote Desktop Camera Control - Kill All Services Script
# This script will stop all running services

echo "🛑 Stopping Remote Desktop Camera Control Services..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Function to kill process by PID if file exists
kill_by_pid_file() {
    local pid_file=$1
    local service_name=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            print_status "Stopping $service_name (PID: $pid)..."
            kill $pid 2>/dev/null
            sleep 1
            # Force kill if still running
            if ps -p $pid > /dev/null 2>&1; then
                print_warning "Force killing $service_name..."
                kill -9 $pid 2>/dev/null
            fi
        else
            print_warning "$service_name process not running"
        fi
        rm -f "$pid_file"
    fi
}

# Kill processes by saved PIDs
kill_by_pid_file ".backend_pid" "Node.js Backend"
kill_by_pid_file ".python_pid" "Python Backend"
kill_by_pid_file ".frontend_pid" "React Frontend"

# Kill any remaining processes by name patterns
print_status "Killing remaining processes..."

# Kill Node.js backend processes
pkill -f "node.*server.js" 2>/dev/null && print_status "Killed Node.js backend processes" || true

# Kill Vite/frontend processes
pkill -f "vite" 2>/dev/null && print_status "Killed Vite/frontend processes" || true

# Kill Python backend processes
pkill -f "python.*main.py" 2>/dev/null && print_status "Killed Python backend processes" || true
pkill -f "uvicorn" 2>/dev/null && print_status "Killed Uvicorn processes" || true

# Kill any npm processes related to our project
pkill -f "npm.*dev" 2>/dev/null && print_status "Killed npm dev processes" || true

# Kill any processes using our ports
print_status "Checking for processes using our ports..."

# Check port 3000 (frontend)
if lsof -ti:3000 > /dev/null 2>&1; then
    print_warning "Killing process on port 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

# Check port 3001 (backend)
if lsof -ti:3001 > /dev/null 2>&1; then
    print_warning "Killing process on port 3001..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
fi

# Check port 8000 (python backend)
if lsof -ti:8000 > /dev/null 2>&1; then
    print_warning "Killing process on port 8000..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
fi

# Wait a moment for processes to fully terminate
sleep 2

print_status "✅ All services stopped successfully!"
print_status "All processes killed and ports freed."

# Clean up any temporary files
rm -f .backend_pid .python_pid .frontend_pid

echo ""
echo "🔄 To start services again, run: ./AUTO_INSTALL_AND_RUN.sh"
