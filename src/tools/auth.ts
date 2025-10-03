import crypto from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Auth } from 'googleapis'
import { z } from 'zod'

export function registerAuthTools(server: McpServer, oauth2Client: Auth.OAuth2Client) {
	// Check if OAuth 2.1 is enabled
	const isOAuth21Enabled = process.env.OAUTH21_ENABLED === 'true'

	if (isOAuth21Enabled) {
		// OAuth 2.1: Provide automatic authentication
		server.tool(
			'authenticate',
			'Automatically authenticate with Google Calendar using Single Sign-On',
			{
				scopes: z
					.array(z.string())
					.optional()
					.default([
						'https://www.googleapis.com/auth/calendar',
						'https://www.googleapis.com/auth/calendar.events',
					])
					.describe('OAuth2 scopes to request (default: full calendar access)'),
				access_type: z
					.enum(['online', 'offline'])
					.optional()
					.default('offline')
					.describe("Access type - 'offline' gets refresh token"),
			},
			async ({ scopes, access_type }) => {
				try {
					// OAuth 2.1: Automatic authentication
					const authServerUrl = process.env.OAUTH21_AUTH_SERVER_URL || 'http://localhost:3082'
					const resourceId = process.env.OAUTH21_RESOURCE_ID || 'http://localhost:8081'

					// Check if auth server is running
					try {
						const response = await fetch(`${authServerUrl}/.well-known/oauth-authorization-server`)
						if (!response.ok) {
							throw new Error('Auth server not responding')
						}
					} catch (_error) {
						return {
							content: [
								{
									type: 'text',
									text: `OAuth 2.1 Auth Server is not running. Please start it first:\n\n\`cd auth-server && npm run dev\``,
								},
							],
						}
					}

					// Perform OAuth 2.1 flow
					try {
						// Step 1: Register client dynamically
						const clientRegistrationResponse = await fetch(`${authServerUrl}/register`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								client_name: 'Google Calendar MCP Client',
								redirect_uris: ['http://localhost:8081/callback'],
								grant_types: ['authorization_code', 'refresh_token'],
								response_types: ['code'],
							}),
						})

						if (!clientRegistrationResponse.ok) {
							throw new Error('Failed to register OAuth 2.1 client')
						}

						const clientData = (await clientRegistrationResponse.json()) as { client_id: string }
						const clientId = clientData.client_id

						// Step 2: Generate PKCE parameters
						const codeVerifier = generateCodeVerifier()
						const codeChallenge = await generateCodeChallenge(codeVerifier)
						const state = generateRandomString()

						// Step 3: Build authorization URL
						const authUrl = new URL(`${authServerUrl}/authorize`)
						authUrl.searchParams.set('client_id', clientId)
						authUrl.searchParams.set('response_type', 'code')
						authUrl.searchParams.set('redirect_uri', 'http://localhost:8081/callback')
						authUrl.searchParams.set('scope', scopes.join(' '))
						authUrl.searchParams.set('state', state)
						authUrl.searchParams.set('code_challenge', codeChallenge)
						authUrl.searchParams.set('code_challenge_method', 'S256')
						authUrl.searchParams.set('resource', resourceId)

						// Step 4: Open browser and wait for callback
						const { exec } = await import('node:child_process')
						const { promisify } = await import('node:util')
						const execAsync = promisify(exec)

						// Open browser
						await execAsync(`open "${authUrl.toString()}"`)

						// Start callback server
						const callbackServer = await startCallbackServer()

						// Wait for callback
						const authCode = await waitForCallback(callbackServer, state)

						// Step 5: Exchange code for tokens
						const tokenResponse = await fetch(`${authServerUrl}/token`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								grant_type: 'authorization_code',
								code: authCode,
								redirect_uri: 'http://localhost:8081/callback',
								client_id: clientId,
								code_verifier: codeVerifier,
								resource: resourceId,
							}),
						})

						if (!tokenResponse.ok) {
							throw new Error('Failed to exchange authorization code for tokens')
						}

						const tokens = (await tokenResponse.json()) as {
							access_token: string
							refresh_token?: string
							token_type: string
						}

						// Store tokens in OAuth2 client
						// Note: These are JWT tokens from our auth server, not Google tokens
						// For OAuth 2.1, we need to use the auth server's Google tokens
						console.log('OAuth 2.1: Received tokens from auth server:', {
							hasAccessToken: !!tokens.access_token,
							hasRefreshToken: !!tokens.refresh_token,
							tokenType: tokens.token_type,
						})

						// For OAuth 2.1, we need to get the actual Google tokens from the auth server
						// The JWT tokens are for authenticating with our auth server
						// We need to get the actual Google tokens for API calls

						// Get the actual Google tokens from the auth server
						const googleTokensResponse = await fetch(`${authServerUrl}/google-tokens`, {
							method: 'GET',
							headers: {
								Authorization: `Bearer ${tokens.access_token}`,
							},
						})

						console.log('Google tokens response status:', googleTokensResponse.status)

						if (!googleTokensResponse.ok) {
							const errorText = await googleTokensResponse.text()
							console.error('Failed to get Google tokens:', errorText)
							throw new Error(`Failed to get Google tokens from auth server: ${errorText}`)
						}

						const googleTokens = (await googleTokensResponse.json()) as {
							access_token: string
							refresh_token?: string
							token_type: string
							expiry_date?: number
						}
						console.log('Received Google tokens:', {
							hasAccessToken: !!googleTokens.access_token,
							hasRefreshToken: !!googleTokens.refresh_token,
						})

						// Store the actual Google tokens in OAuth2 client
						oauth2Client.setCredentials({
							access_token: googleTokens.access_token,
							refresh_token: googleTokens.refresh_token,
							token_type: googleTokens.token_type,
							expiry_date: googleTokens.expiry_date,
						})

						return {
							content: [
								{
									type: 'text',
									text: `# ✅ OAuth 2.1 Authentication Successful!

**Authentication Complete!** You are now authenticated with Google Calendar.

## 🔑 Token Information
- **Access Token**: ✅ Present
- **Refresh Token**: ✅ Present  
- **Expires In**: ${(tokens as any).expires_in || 'Unknown'} seconds

## 🛠️ Available Tools
- \`list_calendars\` - List your calendars
- \`list_events\` - List calendar events
- \`create_event\` - Create new events
- \`create_event_now\` - Create events starting now
- \`update_event\` - Update existing events
- \`delete_event\` - Delete events by name/details
- \`get_current_time\` - Get current system time

**🎉 You're ready to use Google Calendar!**`,
								},
							],
						}
					} catch (authError: any) {
						return {
							content: [
								{ type: 'text', text: `OAuth 2.1 Authentication failed: ${authError.message}` },
							],
						}
					}
				} catch (e: any) {
					return {
						content: [{ type: 'text', text: `Error in OAuth 2.1 flow: ${e.message}` }],
					}
				}
			}
		)
	} else {
		// Legacy OAuth: Manual authentication flow
		server.tool(
			'generate_oauth_url',
			'Generate OAuth2 authorization URL for user to grant calendar access. User must visit this URL to authorize the application.',
			{
				scopes: z
					.array(z.string())
					.optional()
					.default([
						'https://www.googleapis.com/auth/calendar',
						'https://www.googleapis.com/auth/calendar.events',
					])
					.describe('OAuth2 scopes to request (default: full calendar access)'),
				access_type: z
					.enum(['online', 'offline'])
					.optional()
					.default('offline')
					.describe("Access type - 'offline' gets refresh token"),
			},
			async ({ scopes, access_type }) => {
				try {
					const authUrl = oauth2Client.generateAuthUrl({
						access_type,
						scope: scopes,
					})

					const markdown = `# OAuth2 Authorization Required

To access Google Calendar data, please visit the following URL and authorize the application:

## Authorization URL
[${authUrl}](${authUrl})

## Steps:
1. Click the URL above or copy and paste it into your browser
2. Sign in with your Google account
3. Grant the requested permissions
4. Copy the authorization code from the redirect URL
5. Use the \`exchange_auth_code\` tool with the authorization code to get tokens

## Requested Scopes:
${scopes.map((scope) => `- ${scope}`).join('\n')}

**Note:** This authorization only needs to be done once. The refresh token can be reused for future access.`

					return {
						content: [{ type: 'text', text: markdown }],
					}
				} catch (e: any) {
					return {
						content: [{ type: 'text', text: `Error generating OAuth URL: ${e.message}` }],
					}
				}
			}
		)
	}

	// Tool: Exchange Authorization Code
	server.tool(
		'exchange_auth_code',
		'Exchange authorization code for access and refresh tokens. Use this after user has authorized via the OAuth URL.',
		{
			auth_code: z.string().describe('Authorization code received from OAuth redirect'),
		},
		async ({ auth_code }) => {
			try {
				const { tokens } = await oauth2Client.getToken(auth_code)
				oauth2Client.setCredentials(tokens)

				const markdown = `# OAuth2 Token Exchange Successful

## Access Token
- **Expires:** ${tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'Unknown'}
- **Type:** ${tokens.token_type || 'Bearer'}

## Refresh Token
${
	tokens.refresh_token
		? `
**Refresh Token:** \`${tokens.refresh_token}\`

**IMPORTANT:** Save this refresh token securely! You can use it in your MCP configuration to avoid re-authorization:

\`\`\`json
{
  "refreshToken": "${tokens.refresh_token}"
}
\`\`\`
`
		: "**WARNING:** No refresh token received. This may happen if you've previously authorized this application. To get a new refresh token, revoke access at https://myaccount.google.com/connections and re-authorize."
}

## Next Steps
- Your Google Calendar MCP server is now authenticated and ready to use
- Use calendar and event tools to interact with your Google Calendar
- The access token will be automatically refreshed when needed`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error exchanging authorization code: ${e.message}` }],
				}
			}
		}
	)

	// Tool: Check Authentication Status
	server.tool(
		'check_auth_status',
		'Check the current authentication status and token information',
		{},
		async () => {
			try {
				const credentials = oauth2Client.credentials

				// Debug: Log current credentials
				console.log('check_auth_status - Current credentials:', {
					hasAccessToken: !!credentials.access_token,
					hasRefreshToken: !!credentials.refresh_token,
					expiryDate: credentials.expiry_date,
				})

				if (!credentials.access_token && !credentials.refresh_token) {
					return {
						content: [
							{
								type: 'text',
								text: `# Authentication Status: Not Authenticated

**Status:** No tokens available

## Next Steps:
1. Use \`generate_oauth_url\` to get authorization URL
2. Visit the URL and authorize the application
3. Use \`exchange_auth_code\` with the received code`,
							},
						],
					}
				}

				const hasRefreshToken = !!credentials.refresh_token
				const accessTokenExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : null
				const isExpired = accessTokenExpiry ? accessTokenExpiry < new Date() : false

				const markdown = `# Authentication Status: ${hasRefreshToken ? 'Authenticated' : 'Partially Authenticated'}

## Token Information
- **Access Token:** ${credentials.access_token ? 'Present' : 'Missing'}
- **Refresh Token:** ${hasRefreshToken ? 'Present' : 'Missing'}
- **Token Type:** ${credentials.token_type || 'Bearer'}

## Access Token Status
${
	accessTokenExpiry
		? `- **Expires:** ${accessTokenExpiry.toISOString()}
- **Status:** ${isExpired ? 'Expired' : 'Valid'}`
		: '- **Expiry:** Unknown'
}

## Authentication Health
${
	hasRefreshToken
		? '**Fully Authenticated** - Can access Google Calendar indefinitely'
		: '**Limited Authentication** - May need re-authorization when access token expires'
}

${
	!hasRefreshToken
		? `
## Recommendation
Consider re-authorizing with \`access_type: "offline"\` to get a refresh token for permanent access.
`
		: ''
}`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error checking authentication status: ${e.message}` }],
				}
			}
		}
	)
}

// Helper functions for OAuth 2.1 PKCE flow
function generateCodeVerifier(): string {
	return crypto.randomBytes(32).toString('base64url')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
	const hash = crypto.createHash('sha256').update(verifier).digest()
	return hash.toString('base64url')
}

function generateRandomString(): string {
	return crypto.randomBytes(16).toString('hex')
}

async function startCallbackServer(): Promise<any> {
	const express = await import('express')
	const app = express.default()

	const server = app.listen(8081, 'localhost')

	return new Promise((resolve) => {
		server.on('listening', () => {
			resolve(server)
		})
	})
}

async function waitForCallback(server: any, expectedState: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => {
				server.close()
				reject(new Error('Authentication timeout - no callback received'))
			},
			5 * 60 * 1000
		) // 5 minutes

		server.on('request', (req: any, res: any) => {
			if (req.url.startsWith('/callback')) {
				const url = new URL(req.url, `http://localhost:${(server.address() as any).port}`)
				const code = url.searchParams.get('code')
				const state = url.searchParams.get('state')
				const error = url.searchParams.get('error')

				clearTimeout(timeout)

				if (error) {
					res.writeHead(400, { 'Content-Type': 'text/html' })
					res.end(`
						<!DOCTYPE html>
						<html lang="en">
						<head>
							<meta charset="UTF-8">
							<meta name="viewport" content="width=device-width, initial-scale=1.0">
							<title>OAuth Error - Google Calendar MCP</title>
							<style>
								* {
									margin: 0;
									padding: 0;
									box-sizing: border-box;
								}
								
								body {
									font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
									background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
									color: #ffffff;
									min-height: 100vh;
									display: flex;
									align-items: center;
									justify-content: center;
									padding: 20px;
								}
								
								.container {
									background: rgba(255, 255, 255, 0.05);
									backdrop-filter: blur(10px);
									border: 1px solid rgba(239, 68, 68, 0.2);
									border-radius: 16px;
									padding: 48px 32px;
									text-align: center;
									max-width: 480px;
									width: 100%;
									box-shadow: 0 8px 32px rgba(239, 68, 68, 0.1);
								}
								
								.icon {
									width: 64px;
									height: 64px;
									margin: 0 auto 24px;
									background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
									border-radius: 50%;
									display: flex;
									align-items: center;
									justify-content: center;
									font-size: 28px;
									color: white;
									box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3);
								}
								
								h1 {
									font-size: 28px;
									font-weight: 700;
									margin-bottom: 12px;
									color: #ffffff;
								}
								
								p {
									font-size: 16px;
									color: #b0b0b0;
									line-height: 1.6;
									margin-bottom: 16px;
								}
								
								.error-detail {
									background: rgba(239, 68, 68, 0.1);
									border: 1px solid rgba(239, 68, 68, 0.2);
									border-radius: 8px;
									padding: 12px 16px;
									font-size: 14px;
									color: #ef4444;
									margin: 16px 0;
									font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
								}
								
								.retry-hint {
									font-size: 14px;
									color: #808080;
									font-style: italic;
								}
								
								@keyframes fadeIn {
									from { opacity: 0; transform: translateY(20px); }
									to { opacity: 1; transform: translateY(0); }
								}
								
								.container {
									animation: fadeIn 0.6s ease-out;
								}
							</style>
						</head>
						<body>
							<div class="container">
								<div class="icon">🔒</div>
								<h1>OAuth Error</h1>
								<p>There was an issue with the OAuth authentication process.</p>
								<div class="error-detail">Error: ${error}</div>
								<p class="retry-hint">Please try the authentication process again.</p>
							</div>
						</body>
						</html>
					`)
					server.close()
					reject(new Error(`OAuth error: ${error}`))
					return
				}

				if (!code || state !== expectedState) {
					res.writeHead(400, { 'Content-Type': 'text/html' })
					res.end(`
						<!DOCTYPE html>
						<html lang="en">
						<head>
							<meta charset="UTF-8">
							<meta name="viewport" content="width=device-width, initial-scale=1.0">
							<title>Authentication Failed - Google Calendar MCP</title>
							<style>
								* {
									margin: 0;
									padding: 0;
									box-sizing: border-box;
								}
								
								body {
									font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
									background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
									color: #ffffff;
									min-height: 100vh;
									display: flex;
									align-items: center;
									justify-content: center;
									padding: 20px;
								}
								
								.container {
									background: rgba(255, 255, 255, 0.05);
									backdrop-filter: blur(10px);
									border: 1px solid rgba(239, 68, 68, 0.2);
									border-radius: 16px;
									padding: 48px 32px;
									text-align: center;
									max-width: 480px;
									width: 100%;
									box-shadow: 0 8px 32px rgba(239, 68, 68, 0.1);
								}
								
								.icon {
									width: 64px;
									height: 64px;
									margin: 0 auto 24px;
									background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
									border-radius: 50%;
									display: flex;
									align-items: center;
									justify-content: center;
									font-size: 28px;
									color: white;
									box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3);
								}
								
								h1 {
									font-size: 28px;
									font-weight: 700;
									margin-bottom: 12px;
									color: #ffffff;
								}
								
								p {
									font-size: 16px;
									color: #b0b0b0;
									line-height: 1.6;
									margin-bottom: 16px;
								}
								
								.status {
									display: inline-flex;
									align-items: center;
									background: rgba(239, 68, 68, 0.1);
									border: 1px solid rgba(239, 68, 68, 0.2);
									border-radius: 8px;
									padding: 8px 16px;
									font-size: 14px;
									font-weight: 500;
									color: #ef4444;
									margin-bottom: 24px;
								}
								
								.status::before {
									content: '✗';
									margin-right: 8px;
									font-weight: bold;
								}
								
								.retry-hint {
									font-size: 14px;
									color: #808080;
									font-style: italic;
								}
								
								@keyframes fadeIn {
									from { opacity: 0; transform: translateY(20px); }
									to { opacity: 1; transform: translateY(0); }
								}
								
								.container {
									animation: fadeIn 0.6s ease-out;
								}
							</style>
						</head>
						<body>
							<div class="container">
								<div class="icon">⚠️</div>
								<h1>Authentication Failed</h1>
								<div class="status">Invalid authorization</div>
								<p>There was an issue with the authentication process. This may be due to an invalid state or missing authorization code.</p>
								<p class="retry-hint">Please try the authentication process again.</p>
							</div>
						</body>
						</html>
					`)
					server.close()
					reject(new Error('Invalid authorization code or state mismatch'))
					return
				}

				res.writeHead(200, { 'Content-Type': 'text/html' })
				res.end(`
					<!DOCTYPE html>
					<html lang="en">
					<head>
						<meta charset="UTF-8">
						<meta name="viewport" content="width=device-width, initial-scale=1.0">
						<title>Authentication Successful - Google Calendar MCP</title>
						<style>
							* {
								margin: 0;
								padding: 0;
								box-sizing: border-box;
							}
							
							body {
								font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
								background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
								color: #ffffff;
								min-height: 100vh;
								display: flex;
								align-items: center;
								justify-content: center;
								padding: 20px;
							}
							
							.container {
								background: rgba(255, 255, 255, 0.05);
								backdrop-filter: blur(10px);
								border: 1px solid rgba(255, 255, 255, 0.1);
								border-radius: 16px;
								padding: 48px 32px;
								text-align: center;
								max-width: 480px;
								width: 100%;
								box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
							}
							
							.icon {
								width: 64px;
								height: 64px;
								margin: 0 auto 24px;
								background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
								border-radius: 50%;
								display: flex;
								align-items: center;
								justify-content: center;
								font-size: 28px;
								color: white;
								box-shadow: 0 4px 16px rgba(255, 107, 53, 0.3);
							}
							
							h1 {
								font-size: 28px;
								font-weight: 700;
								margin-bottom: 12px;
								background: linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%);
								-webkit-background-clip: text;
								-webkit-text-fill-color: transparent;
								background-clip: text;
							}
							
							p {
								font-size: 16px;
								color: #b0b0b0;
								line-height: 1.6;
								margin-bottom: 32px;
							}
							
							.status {
								display: inline-flex;
								align-items: center;
								background: rgba(34, 197, 94, 0.1);
								border: 1px solid rgba(34, 197, 94, 0.2);
								border-radius: 8px;
								padding: 8px 16px;
								font-size: 14px;
								font-weight: 500;
								color: #22c55e;
								margin-bottom: 24px;
							}
							
							.status::before {
								content: '✓';
								margin-right: 8px;
								font-weight: bold;
							}
							
							.close-hint {
								font-size: 14px;
								color: #808080;
								font-style: italic;
							}
							
							@keyframes fadeIn {
								from { opacity: 0; transform: translateY(20px); }
								to { opacity: 1; transform: translateY(0); }
							}
							
							.container {
								animation: fadeIn 0.6s ease-out;
							}
							
							.icon {
								animation: fadeIn 0.8s ease-out 0.2s both;
							}
							
							h1 {
								animation: fadeIn 0.8s ease-out 0.4s both;
							}
							
							p, .status {
								animation: fadeIn 0.8s ease-out 0.6s both;
							}
						</style>
					</head>
					<body>
						<div class="container">
							<div class="icon">🔐</div>
							<h1>Authentication Successful!</h1>
							<div class="status">Connected to Google Calendar</div>
							<p>Your Google Calendar MCP server is now authenticated and ready to use. You can close this window and return to your application.</p>
							<p class="close-hint">This window will close automatically...</p>
						</div>
						<script>
							// Auto-close after 3 seconds
							setTimeout(() => {
								window.close();
							}, 3000);
						</script>
					</body>
					</html>
				`)
				server.close()
				resolve(code)
			}
		})
	})
}
