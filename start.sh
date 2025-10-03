#!/bin/bash

# Google Calendar MCP OAuth 2.1 System Startup Script

echo "Starting Google Calendar MCP OAuth 2.1 System..."

# Check if required directories exist
if [ ! -d "auth-server" ]; then
    echo "Required directories not found. Please ensure you're in the gcal-mcp directory."
    exit 1
fi

# Check if .env files exist
if [ ! -f "auth-server/.env" ]; then
    echo "auth-server/.env not found. Please copy from env.example and configure."
    echo "   cp auth-server/env.example auth-server/.env"
    echo "   Edit auth-server/.env with your Google OAuth credentials"
    exit 1
fi

echo "Environment files found"

# Install dependencies if needed
echo "Checking dependencies..."

if [ ! -d "auth-server/node_modules" ]; then
    echo "Installing auth-server dependencies..."
    cd auth-server && npm install && cd ..
fi

if [ ! -d "node_modules" ]; then
    echo "Installing gcal-mcp dependencies..."
    npm install
fi

echo "Dependencies ready"

# Start services in background
echo "Starting Authorization Server (port 3082)..."
cd auth-server
AUTH_SERVER_PORT=3082 npm run dev &
AUTH_PID=$!
cd ..

sleep 3

echo "Starting MCP Server with OAuth 2.1..."
export OAUTH21_ENABLED=true
export OAUTH21_AUTH_SERVER_URL=http://localhost:3082
export OAUTH21_RESOURCE_ID=http://localhost:3081
export OAUTH21_AUTO_AUTH=true
npm run dev &
MCP_PID=$!

echo ""
echo "All services started!"
echo ""
echo "Service URLs:"
echo "   Authorization Server: http://localhost:3082"
echo "   MCP Server: Standard MCP protocol"
echo "   Discovery: http://localhost:3082/.well-known/oauth-authorization-server"
echo ""
echo "The MCP server will use OAuth 2.1 authentication automatically."
echo "Connect your MCP client to this server."
echo ""
echo "To stop all services, press Ctrl+C or run:"
echo "   kill $AUTH_PID $MCP_PID"
echo ""

# Wait for user interrupt
trap "echo ''; echo 'Stopping all services...'; kill $AUTH_PID $MCP_PID 2>/dev/null; echo 'All services stopped.'; exit 0" INT

# Keep script running
wait
