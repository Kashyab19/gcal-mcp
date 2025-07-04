# Google Calendar MCP Server

A Model Context Protocol (MCP) server for interacting with Google Calendar API, built for [Smithery](https://smithery.ai/).

## Features

- **OAuth2 Authentication**: Complete OAuth2 flow for secure Google Calendar access
- **Calendar Management**: List, create, and delete calendars
- **Event Operations**: Create, read, update, and delete calendar events
- **Comprehensive Event Details**: Support for attendees, reminders, locations, and more
- **All-Day Event Support**: Handle both timed and all-day events
- **Search Functionality**: Search events by text and time ranges

## Prerequisites

Before using this MCP server, you need:

1. **Node.js 18+** installed
2. **Google Cloud Console project** with Calendar API enabled
3. **OAuth2 credentials** (Client ID and Client Secret)

## Google Cloud Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### 2. Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" user type
3. Fill in the required information:
   - App name: "Your App Name"
   - User support email: Your email
   - Developer contact information: Your email
4. Add scopes (optional for testing):
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`

### 3. Create OAuth2 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Web application"
4. Add authorized redirect URIs:
   - `http://localhost:3000/oauth2callback`
5. Download the JSON file and note your Client ID and Client Secret

## Installation

### Using Smithery CLI

```bash
npm install -g @smithery/cli
npm create smithery
```

Or clone this repository:

```bash
git clone <repository-url>
cd google-calendar-mcp
npm install
```

## Configuration

Configure the MCP server with your Google OAuth2 credentials:

```json
{
  "clientId": "your-google-client-id.apps.googleusercontent.com",
  "clientSecret": "your-google-client-secret",
  "redirectUri": "http://localhost:3000/oauth2callback",
  "refreshToken": "optional-refresh-token-for-permanent-access"
}
```

### Configuration Parameters

- **`clientId`** (required): Google OAuth2 Client ID from Google Cloud Console
- **`clientSecret`** (required): Google OAuth2 Client Secret from Google Cloud Console  
- **`redirectUri`** (optional): OAuth2 redirect URI (default: `http://localhost:3000/oauth2callback`)
- **`refreshToken`** (optional): Pre-existing refresh token for permanent access

## Usage

### Development

```bash
npx @smithery/cli dev
```

### Authentication Flow

1. **Generate OAuth URL**:
   ```
   Tool: generate_oauth_url
   ```

2. **Visit the URL** and authorize the application

3. **Exchange Authorization Code**:
   ```
   Tool: exchange_auth_code
   Parameters: { "auth_code": "code-from-redirect" }
   ```

4. **Save the refresh token** for future use in your configuration

### Available Tools

#### Authentication Tools

- **`generate_oauth_url`** - Generate OAuth2 authorization URL
- **`exchange_auth_code`** - Exchange authorization code for tokens  
- **`check_auth_status`** - Check current authentication status

#### Calendar Management

- **`list_calendars`** - List all accessible calendars
- **`get_calendar`** - Get detailed calendar information
- **`create_calendar`** - Create a new calendar
- **`delete_calendar`** - Delete a calendar (except primary)

#### Event Management

- **`list_events`** - List events with filtering options
- **`get_event`** - Get detailed event information
- **`create_event`** - Create a new event
- **`update_event`** - Update an existing event
- **`delete_event`** - Delete an event

### Example Usage

#### Create an Event

```typescript
Tool: create_event
Parameters: {
  "calendar_id": "primary",
  "summary": "Team Meeting", 
  "description": "Weekly sync meeting",
  "start_time": "2024-01-15T10:00:00Z",
  "end_time": "2024-01-15T11:00:00Z",
  "location": "Conference Room A",
  "attendees": ["colleague@company.com"],
  "timezone": "America/New_York"
}
```

#### List Upcoming Events

```typescript
Tool: list_events
Parameters: {
  "calendar_id": "primary",
  "time_min": "2024-01-15T00:00:00Z",
  "time_max": "2024-01-22T23:59:59Z",
  "max_results": 20
}
```

## Security Best Practices

1. **Store credentials securely** - Never commit OAuth2 credentials to version control
2. **Use refresh tokens** - Configure `access_type: "offline"` to get refresh tokens
3. **Limit scopes** - Only request necessary Calendar API scopes
4. **Monitor usage** - Keep track of API usage in Google Cloud Console

## Error Handling

The MCP server provides detailed error messages for common issues:

- **Authentication errors** - Clear guidance on OAuth2 setup
- **API quota limits** - Information about rate limiting
- **Permission errors** - Help with scope and access issues
- **Invalid parameters** - Validation errors with helpful descriptions

## Development

### Project Structure

```
google-calendar-mcp/
├── src/
│   ├── index.ts           # Main MCP server entry point
│   └── tools/
│       ├── auth.ts        # Authentication tools
│       ├── calendars.ts   # Calendar management tools
│       └── events.ts      # Event management tools
├── package.json
├── smithery.yaml
└── README.md
```

### Building

```bash
npx @smithery/cli build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- **Documentation**: [Smithery Documentation](https://smithery.ai/docs)
- **Google Calendar API**: [Google Calendar API Reference](https://developers.google.com/calendar/api/v3/reference)
- **Issues**: Submit issues via GitHub

## Related Projects

- [Smithery CLI](https://www.npmjs.com/package/@smithery/cli)
- [Model Context Protocol](https://github.com/modelcontextprotocol/specification)
- [Google APIs Node.js Client](https://github.com/googleapis/google-api-nodejs-client) 