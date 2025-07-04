import { z } from "zod"
import type { Auth } from "googleapis"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export function registerAuthTools(server: McpServer, oauth2Client: Auth.OAuth2Client) {
	// Tool: Generate OAuth URL
	server.tool(
		"generate_oauth_url",
		"Generate OAuth2 authorization URL for user to grant calendar access. User must visit this URL to authorize the application.",
		{
			scopes: z
				.array(z.string())
				.optional()
				.default([
					"https://www.googleapis.com/auth/calendar",
					"https://www.googleapis.com/auth/calendar.events",
				])
				.describe("OAuth2 scopes to request (default: full calendar access)"),
			access_type: z
				.enum(["online", "offline"])
				.optional()
				.default("offline")
				.describe("Access type - 'offline' gets refresh token"),
		},
		async ({ scopes, access_type }) => {
			try {
				const authUrl = oauth2Client.generateAuthUrl({
					access_type,
					scope: scopes,
					include_granted_scopes: true,
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
${scopes.map(scope => `- ${scope}`).join('\n')}

**Note:** This authorization only needs to be done once. The refresh token can be reused for future access.`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error generating OAuth URL: ${e.message}` }],
				}
			}
		},
	)

	// Tool: Exchange Authorization Code
	server.tool(
		"exchange_auth_code",
		"Exchange authorization code for access and refresh tokens. Use this after user has authorized via the OAuth URL.",
		{
			auth_code: z
				.string()
				.describe("Authorization code received from OAuth redirect"),
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
${tokens.refresh_token ? `
**Refresh Token:** \`${tokens.refresh_token}\`

⚠️ **Important:** Save this refresh token securely! You can use it in your MCP configuration to avoid re-authorization:

\`\`\`json
{
  "refreshToken": "${tokens.refresh_token}"
}
\`\`\`
` : '⚠️ **No refresh token received.** This may happen if you\'ve previously authorized this application. To get a new refresh token, revoke access at https://myaccount.google.com/connections and re-authorize.'}

## Next Steps
- Your Google Calendar MCP server is now authenticated and ready to use
- Use calendar and event tools to interact with your Google Calendar
- The access token will be automatically refreshed when needed`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error exchanging authorization code: ${e.message}` }],
				}
			}
		},
	)

	// Tool: Check Authentication Status
	server.tool(
		"check_auth_status",
		"Check the current authentication status and token information",
		{},
		async () => {
			try {
				const credentials = oauth2Client.credentials

				if (!credentials.access_token && !credentials.refresh_token) {
					return {
						content: [
							{
								type: "text",
								text: `# Authentication Status: Not Authenticated

❌ **Status:** No tokens available

## Next Steps:
1. Use \`generate_oauth_url\` to get authorization URL
2. Visit the URL and authorize the application
3. Use \`exchange_auth_code\` with the received code`,
							},
						],
					}
				}

				const hasRefreshToken = !!credentials.refresh_token
				const accessTokenExpiry = credentials.expiry_date
					? new Date(credentials.expiry_date)
					: null
				const isExpired = accessTokenExpiry ? accessTokenExpiry < new Date() : false

				const markdown = `# Authentication Status: ${hasRefreshToken ? 'Authenticated' : 'Partially Authenticated'}

## Token Information
- **Access Token:** ${credentials.access_token ? '✅ Present' : '❌ Missing'}
- **Refresh Token:** ${hasRefreshToken ? '✅ Present' : '❌ Missing'}
- **Token Type:** ${credentials.token_type || 'Bearer'}

## Access Token Status
${accessTokenExpiry ? `- **Expires:** ${accessTokenExpiry.toISOString()}
- **Status:** ${isExpired ? '❌ Expired' : '✅ Valid'}` : '- **Expiry:** Unknown'}

## Authentication Health
${hasRefreshToken 
	? '✅ **Fully Authenticated** - Can access Google Calendar indefinitely' 
	: '⚠️ **Limited Authentication** - May need re-authorization when access token expires'
}

${!hasRefreshToken ? `
## Recommendation
Consider re-authorizing with \`access_type: "offline"\` to get a refresh token for permanent access.
` : ''}`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error checking authentication status: ${e.message}` }],
				}
			}
		},
	)
} 