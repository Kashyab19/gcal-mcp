#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { google } from "googleapis"
import { z } from "zod"
import { registerCalendarTools } from "./tools/calendars.js"
import { registerEventTools } from "./tools/events.js"
import { registerAuthTools } from "./tools/auth.js"

export const configSchema = z.object({
	clientId: z
		.string()
		.describe(
			"Google OAuth2 Client ID from Google Cloud Console (APIs & Services > Credentials)",
		),
	clientSecret: z
		.string()
		.describe(
			"Google OAuth2 Client Secret from Google Cloud Console",
		),
	redirectUri: z
		.string()
		.default("http://localhost:3000/oauth2callback")
		.describe(
			"OAuth2 redirect URI (must match the one configured in Google Cloud Console)",
		),
	refreshToken: z
		.string()
		.optional()
		.describe(
			"Optional: Pre-existing refresh token for accessing user's calendar data",
		),
})

export default function ({ config }: { config: z.infer<typeof configSchema> }) {
	try {
		console.log("Starting Google Calendar MCP Server...")

		// Create a new MCP server
		const server = new McpServer({
			name: "Google Calendar MCP Server",
			version: "1.0.0",
		})

		// Initialize OAuth2 client
		const oauth2Client = new google.auth.OAuth2(
			config.clientId,
			config.clientSecret,
			config.redirectUri
		)

		// Set refresh token if provided
		if (config.refreshToken) {
			oauth2Client.setCredentials({
				refresh_token: config.refreshToken,
			})
		}

		// Initialize Google Calendar API client
		const calendar = google.calendar({ version: "v3", auth: oauth2Client })

		// Register tool groups
		registerAuthTools(server, oauth2Client)
		registerCalendarTools(server, calendar, oauth2Client)
		registerEventTools(server, calendar, oauth2Client)

		return server.server
	} catch (e) {
		console.error(e)
		throw e
	}
} 