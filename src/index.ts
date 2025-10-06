#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { google } from 'googleapis'
import { z } from 'zod'
import { ERROR_MESSAGES, OAUTH21_CONFIG, SERVER_CONFIG } from './constants.js'
import { registerAuthTools } from './tools/auth.js'
import { registerCalendarTools } from './tools/calendars.js'
import { registerEventTools } from './tools/events.js'

// Check if OAuth 2.1 is enabled at build time
const isOAuth21Enabled = process.env.OAUTH21_ENABLED === 'true'

export const configSchema = isOAuth21Enabled
	? z.object({
		clientId: z
			.string()
			.optional()
			.describe('Google OAuth2 Client ID (not needed with OAuth 2.1)'),
		clientSecret: z
			.string()
			.optional()
			.describe('Google OAuth2 Client Secret (not needed with OAuth 2.1)'),
		redirectUri: z
			.string()
			.optional()
			.describe('OAuth2 redirect URI (not needed with OAuth 2.1)'),
		refreshToken: z.string().optional().describe('Optional: Pre-existing refresh token'),
	})
	: z.object({
		clientId: z.string().describe('Google OAuth2 Client ID from Google Cloud Console'),
		clientSecret: z.string().describe('Google OAuth2 Client Secret from Google Cloud Console'),
		redirectUri: z
			.string()
			.default('http://localhost:8082/oauth2callback')
			.describe('OAuth2 redirect URI'),
		refreshToken: z.string().optional().describe('Optional: Pre-existing refresh token'),
	})

// OAuth 2.1 Integration
const oauth21Config = isOAuth21Enabled
	? {
		authServerUrl: process.env.OAUTH21_AUTH_SERVER_URL || OAUTH21_CONFIG.DEFAULT_AUTH_SERVER_URL,
		resourceId: process.env.OAUTH21_RESOURCE_ID || OAUTH21_CONFIG.DEFAULT_RESOURCE_ID,
		autoAuth: process.env.OAUTH21_AUTO_AUTH === 'true',
	}
	: null

export default function ({ config }: { config: z.infer<typeof configSchema> }) {
	try {
		console.log(`Starting ${SERVER_CONFIG.NAME}...`)

		// Check for OAuth 2.1 integration
		if (isOAuth21Enabled && oauth21Config) {
			console.log('OAuth 2.1 Integration Detected!')
			console.log(`   Auth Server: ${oauth21Config.authServerUrl}`)
			console.log(`   Resource ID: ${oauth21Config.resourceId}`)
			console.log(`   Auto Auth: ${oauth21Config.autoAuth}`)
		}

		// Create a new MCP server
		const server = new McpServer({
			name: SERVER_CONFIG.NAME,
			version: SERVER_CONFIG.VERSION,
		})

		// Initialize OAuth2 client (or OAuth 2.1 proxy)
		let oauth2Client
		if (isOAuth21Enabled && oauth21Config) {
			// Use OAuth 2.1 with real Google credentials for API calls
			// The auth server will handle the OAuth 2.1 flow
			oauth2Client = new google.auth.OAuth2(
				process.env.GOOGLE_CLIENT_ID || config.clientId || 'placeholder',
				process.env.GOOGLE_CLIENT_SECRET || config.clientSecret || 'placeholder',
				oauth21Config.authServerUrl + OAUTH21_CONFIG.DEFAULT_CALLBACK_URI
			)
			console.log('Using OAuth 2.1 with Google credentials')
		} else if (config.clientId && config.clientSecret) {
			// Use legacy Google OAuth
			oauth2Client = new google.auth.OAuth2(
				config.clientId,
				config.clientSecret,
				config.redirectUri
			)
			console.log('Using Legacy Google OAuth')
		} else {
			throw new Error(ERROR_MESSAGES.AUTHENTICATION.MISSING_CREDENTIALS)
		}

		// Set refresh token if provided
		if (config.refreshToken) {
			oauth2Client.setCredentials({
				refresh_token: config.refreshToken,
			})
		}

		// Initialize Google Calendar API client
		const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

		// Register tools
		console.log('Registering tools...')
		registerAuthTools(server, oauth2Client)
		console.log('   Auth tools registered')

		registerCalendarTools(server, calendar, oauth2Client)
		console.log('   Calendar tools registered')

		registerEventTools(server, calendar, oauth2Client)
		console.log('   Event tools registered')

		console.log('MCP Server ready!')

		return server.server
	} catch (e) {
		console.error('Error initializing MCP server:', e)
		throw e
	}
}
