#!/bin/bash

# Start All Services Script for RemoteTv
# This script starts Backend, Frontend, and Python Backend in separate terminal windows

echo "🚀 Starting all RemoteTv services..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📁 Working directory: $SCRIPT_DIR"
echo ""

# Function to check if port is in use
check_port() {
    lsof -i:$1 >/dev/null 2>&1
    return $?
}

# Function to kill existing processes on ports
cleanup_ports() {
    echo "🧹 Cleaning up existing processes..."
    echo ""
    
    if check_port 5000; then
        echo "${YELLOW}⚠️  Port 5000 (Backend) is in use${NC}"
        lsof -ti:5000 | xargs kill -9 2>/dev/null
        sleep 1
    fi
    
    if check_port 3000; then
        echo "${YELLOW}⚠️  Port 3000 (Frontend) is in use${NC}"
        lsof -ti:3000 | xargs kill -9 2>/dev/null
        sleep 1
    fi
    
    if check_port 8000; then
        echo "${YELLOW}⚠️  Port 8000 (Python Backend) is in use${NC}"
        lsof -ti:8000 | xargs kill -9 2>/dev/null
        sleep 1
    fi
    
    echo "${GREEN}✅ Cleanup complete${NC}"
    echo ""
    sleep 2
}

# Cleanup existing processes
cleanup_ports

# Function to open new Terminal window and run command
open_terminal() {
    local title=$1
    local command=$2
    local directory=$3
    
    # Open new Terminal window with the command
    osascript -e "tell application \"Terminal\"" \
              -e "activate" \
              -e "do script \"cd '$directory' && clear && echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && echo '$title' && echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && echo '' && $command\"" \
              -e "end tell" > /dev/null 2>&1
}

# Check if directories exist
if [ ! -d "backend" ]; then
    echo "${RED}❌ Error: backend directory not found${NC}"
    exit 1
fi

if [ ! -d "frontend" ]; then
    echo "${RED}❌ Error: frontend directory not found${NC}"
    exit 1
fi

if [ ! -d "pythonBackend" ]; then
    echo "${RED}❌ Error: pythonBackend directory not found${NC}"
    exit 1
fi

# Start Python Backend (Port 8000)
echo "${BLUE}🐍 Starting Python Backend (Port 8000)...${NC}"
PYTHON_DIR="$SCRIPT_DIR/pythonBackend"
PYTHON_CMD="python3 main.py || python main.py"

open_terminal "🐍 Python Backend (Port 8000)" "$PYTHON_CMD" "$PYTHON_DIR"
sleep 2

if check_port 8000; then
    echo "${GREEN}✅ Python Backend started on http://localhost:8000${NC}"
else
    echo "${YELLOW}⏳ Python Backend starting... (may take a few seconds)${NC}"
fi
echo ""

# Start Node.js Backend (Port 5000)
echo "${BLUE}⚙️  Starting Node.js Backend (Port 5000)...${NC}"
BACKEND_DIR="$SCRIPT_DIR/backend"
BACKEND_CMD="npm run dev"

open_terminal "⚙️  Node.js Backend (Port 5000)" "$BACKEND_CMD" "$BACKEND_DIR"
sleep 3

if check_port 5000; then
    echo "${GREEN}✅ Node.js Backend started on http://localhost:5000${NC}"
else
    echo "${YELLOW}⏳ Node.js Backend starting... (may take a few seconds)${NC}"
fi
echo ""

# Start React Frontend (Port 3000)
echo "${BLUE}🎨 Starting React Frontend (Port 3000)...${NC}"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
FRONTEND_CMD="npm run dev"

open_terminal "🎨 React Frontend (Port 3000)" "$FRONTEND_CMD" "$FRONTEND_DIR"
sleep 3

if check_port 3000; then
    echo "${GREEN}✅ React Frontend started on http://localhost:3000${NC}"
else
    echo "${YELLOW}⏳ React Frontend starting... (may take a few seconds)${NC}"
fi
echo ""

# Final status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${GREEN}🎉 All services started in separate terminal windows!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 Access URLs:"
echo "   ${GREEN}Frontend:${NC}        http://localhost:3000"
echo "   ${GREEN}Node.js Backend:${NC}  http://localhost:5000"
echo "   ${GREEN}Python Backend:${NC}   http://localhost:8000"
echo "   ${GREEN}Python API Docs:${NC}  http://localhost:8000/docs"
echo ""
echo "💡 Tip: Check the terminal windows for logs and status"
echo "   Each service runs in its own terminal window"
echo ""
echo "🛑 To stop all services:"
echo "   - Close the terminal windows, or"
echo "   - Press Ctrl+C in each terminal window"
echo ""
