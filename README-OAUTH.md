# Google Calendar MCP with OAuth 2.1 Frictionless Authentication

This implementation provides a complete OAuth 2.1 compliant authentication system for MCP (Model Context Protocol) servers, specifically designed for Google Calendar integration with frictionless user experience.

## Architecture Overview

```
┌─────────────────┐    OAuth 2.1     ┌──────────────────┐    OAuth 2.0     ┌─────────────┐
│   MCP Client    │◄─────────────────►│  Auth Bridge     │◄─────────────────►│   Google     │
│   (Claude)      │   PKCE + Resource │  (OAuth 2.1)     │   Standard Flow  │   OAuth      │
└─────────────────┘                  └──────────────────┘                  └─────────────┘
         │                                     │
         │              JWT Token              │
         └─────────────────────────────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │   MCP Server     │
                  │  (gcal-mcp)      │
                  │  Token Validator │
                  └──────────────────┘
```

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+ 
- Google Cloud Console project with Calendar API enabled
- Google OAuth 2.0 credentials

### 2. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Calendar API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:3001/auth/google/callback`
7. Copy the Client ID and Client Secret

### 3. Installation

```bash
# Clone and setup
git clone <your-repo>
cd gcal-mcp

# Install dependencies for all services
cd auth-server && npm install
cd ../mcp-http-server && npm install  
cd ../client-integration && npm install
```

### 4. Configuration

#### Authorization Server
```bash
cd auth-server
cp env.example .env
# Edit .env with your Google OAuth credentials
```

#### MCP Server
```bash
cd mcp-http-server
cp env.example .env
# Edit .env with your configuration
```

#### Client Integration
```bash
cd client-integration
cp env.example .env
# Edit .env with your configuration
```

### 5. Running the System

**Terminal 1 - Authorization Server:**
```bash
cd auth-server
npm run dev
# Runs on http://localhost:3001
```

**Terminal 2 - MCP Server:**
```bash
cd mcp-http-server
npm run dev
# Runs on http://localhost:3002
```

**Terminal 3 - Client Demo:**
```bash
cd client-integration
npm run dev
# Demonstrates the complete flow
```

## 🔐 Security Features

### OAuth 2.1 Compliance
- **PKCE (S256)** mandatory for all authorization flows
- **Resource parameter** binding tokens to specific MCP servers
- **Audience validation** preventing token confusion attacks
- **No implicit flows** - authorization code flow only
- **Bearer tokens** only in Authorization headers

### Token Security
- **JWT tokens** with RS256 signatures
- **Short-lived access tokens** (1 hour default)
- **Automatic refresh** with secure token rotation
- **Audience validation** ensuring tokens only work for intended services
- **Scope enforcement** with least-privilege access

### User Experience
- **Automatic browser opening** for authorization
- **Local callback server** capturing authorization codes
- **Seamless token refresh** without user interaction
- **Secure credential storage** (configurable backends)

## API Endpoints

### Authorization Server (Port 3001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/oauth-authorization-server` | GET | OAuth 2.1 discovery metadata |
| `/.well-known/jwks.json` | GET | Public keys for JWT verification |
| `/register` | POST | Dynamic client registration |
| `/authorize` | GET | OAuth authorization endpoint |
| `/auth/google/callback` | GET | Google OAuth callback handler |
| `/token` | POST | Token exchange endpoint |

### MCP Server (Port 3002)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/oauth-protected-resource` | GET | Protected resource metadata |
| `/mcp/initialize` | POST | Initialize MCP session |
| `/mcp/tools/list` | POST | List available tools |
| `/mcp/tools/call` | POST | Execute MCP tools |

## MCP Tools Available

### Calendar Management
- **`list_calendars`** - List user's calendars
- **`get_events`** - Retrieve calendar events
- **`create_event`** - Create new calendar events
- **`update_event`** - Modify existing events
- **`delete_event`** - Remove calendar events

### Scope Requirements
- **`calendar.read`** - Required for listing calendars
- **`calendar.events.read`** - Required for reading events
- **`calendar.events.write`** - Required for creating/updating/deleting events

## 🔄 Authentication Flow

### 1. Client Registration
```typescript
// Automatic dynamic registration
const client = await oauthClient.registerClient({
  client_name: 'My MCP Client',
  redirect_uris: ['http://localhost:8080/callback']
});
```

### 2. Authorization Flow
```typescript
// Generate PKCE parameters
const { code_verifier, code_challenge } = generatePKCE();

// Build authorization URL
const authUrl = `${authServer}/authorize?` + new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: redirectUri,
  scope: 'calendar.read calendar.write',
  state: randomState,
  code_challenge,
  code_challenge_method: 'S256',
  resource: mcpServerUrl
});

// Open browser automatically
await open(authUrl);
```

### 3. Token Exchange
```typescript
// Exchange authorization code for tokens
const tokens = await fetch(`${authServer}/token`, {
  method: 'POST',
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
    resource: mcpServerUrl
  })
});
```

### 4. MCP Requests
```typescript
// Make authenticated requests to MCP server
const response = await fetch(`${mcpServer}/mcp/tools/call`, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'get_events',
    arguments: { calendarId: 'primary' }
  })
});
```

## 🧪 Testing the Implementation

### Manual Testing
1. Start all three services
2. Run the client integration demo
3. Browser should open automatically for Google OAuth
4. Complete Google authentication
5. Client should automatically receive tokens
6. MCP tools should execute successfully

### Automated Testing
```bash
# Test authorization server
curl http://localhost:3001/.well-known/oauth-authorization-server

# Test MCP server (requires valid token)
curl -H "Authorization: Bearer <token>" http://localhost:3002/mcp/tools/list
```

## 🔧 Configuration Options

### Environment Variables

#### Authorization Server
```bash
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_SERVER_PORT=3001
AUTH_SERVER_ISSUER=http://localhost:3001
```

#### MCP Server
```bash
MCP_SERVER_PORT=3002
MCP_RESOURCE_ID=http://localhost:3002
AUTH_SERVER_JWKS_URI=http://localhost:3001/.well-known/jwks.json
```

#### Client Integration
```bash
AUTH_SERVER_URL=http://localhost:3001
MCP_SERVER_URL=http://localhost:3002
MCP_RESOURCE_ID=http://localhost:3002
```

## 🚨 Security Considerations

### Production Deployment
- **Use HTTPS** for all endpoints
- **Secure token storage** (Redis, database)
- **Rate limiting** on all endpoints
- **CORS configuration** for production domains
- **Session management** with secure cookies
- **Audit logging** for all authentication events

### Token Management
- **Short token lifetimes** (1 hour access, 24 hour refresh)
- **Automatic cleanup** of expired tokens
- **Token revocation** on security incidents
- **Audience validation** on every request
- **Scope enforcement** with least privilege

### Monitoring
- **Authentication success/failure rates**
- **Token usage patterns**
- **Suspicious activity detection**
- **Geographic access monitoring**
- **Failed authorization attempts**

## 🔄 Token Refresh Flow

```typescript
// Automatic token refresh
async function getValidToken() {
  if (isTokenExpired(accessToken)) {
    const newTokens = await refreshAccessToken(refreshToken);
    accessToken = newTokens.access_token;
    refreshToken = newTokens.refresh_token;
  }
  return accessToken;
}
```

## 📊 Error Handling

### Common Error Responses
```json
{
  "error": "invalid_token",
  "error_description": "Token validation failed"
}

{
  "error": "insufficient_scope", 
  "error_description": "This operation requires 'calendar.write' scope",
  "required_scope": "calendar.write",
  "granted_scopes": ["calendar.read"]
}
```

## Benefits of This Implementation

### For Users
- **Zero configuration** - no manual setup required
- **Automatic browser opening** for seamless authentication
- **Secure token management** with automatic refresh
- **Familiar Google OAuth** experience

### For Developers
- **OAuth 2.1 compliance** with modern security standards
- **PKCE security** preventing authorization code interception
- **Resource binding** preventing token confusion attacks
- **Scope-based access control** with least privilege
- **Audience validation** ensuring token security

### For Organizations
- **Enterprise-ready** with proper security controls
- **Audit logging** for compliance requirements
- **Token isolation** between different services
- **Scalable architecture** supporting multiple MCP servers

## 🔮 Future Enhancements

- **Multi-tenant support** for enterprise deployments
- **Advanced scope management** with fine-grained permissions
- **Token binding** for high-security environments
- **Federated identity** integration with enterprise SSO
- **Real-time token revocation** with WebSocket notifications

This implementation provides a production-ready foundation for secure MCP authentication while maintaining the frictionless user experience that makes AI tools truly useful.
