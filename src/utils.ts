/**
 * Utility functions for the Google Calendar MCP Server
 */

import type { Auth, calendar_v3 } from 'googleapis'
import { google } from 'googleapis'
import { DEFAULT_PORTS, TIME_CONFIG, VALIDATION_PATTERNS } from './constants.js'

/**
 * Create a fresh Google Calendar API client with current credentials
 */
export function createCalendarClient(oauth2Client: Auth.OAuth2Client): calendar_v3.Calendar {
	const credentials = oauth2Client.credentials
	console.log('OAuth2 Client Credentials:', {
		hasAccessToken: !!credentials.access_token,
		hasRefreshToken: !!credentials.refresh_token,
		expiryDate: credentials.expiry_date,
	})
	return google.calendar({ version: 'v3', auth: oauth2Client })
}

/**
 * Format date/time for display
 */
export function formatDateTime(dateTime: string | undefined, isAllDay: boolean = false): string {
	if (!dateTime) return 'Not specified'

	try {
		const date = new Date(dateTime)
		if (isAllDay) {
			return date.toLocaleDateString()
		}
		return date.toLocaleString()
	} catch {
		return dateTime
	}
}

/**
 * Generate ISO string for a date with optional offset
 */
export function generateISOTime(offsetMinutes: number = 0): string {
	const now = new Date()
	const targetTime = new Date(now.getTime() + offsetMinutes * 60 * 1000)
	return targetTime.toISOString()
}

/**
 * Parse date string and return in YYYY-MM-DD format
 */
export function parseDateString(dateString: string): string {
	try {
		return new Date(dateString).toISOString().split('T')[0]
	} catch {
		return dateString
	}
}

/**
 * Parse time string and return in HH:MM format
 */
export function parseTimeString(timeString: string): string {
	try {
		const date = new Date(timeString)
		return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
	} catch {
		return timeString
	}
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
	return VALIDATION_PATTERNS.EMAIL.test(email)
}

/**
 * Validate ISO date format
 */
export function isValidISODate(dateString: string): boolean {
	return VALIDATION_PATTERNS.RFC3339.test(dateString)
}

/**
 * Validate date-only format (YYYY-MM-DD)
 */
export function isValidDateOnly(dateString: string): boolean {
	return VALIDATION_PATTERNS.DATE_ONLY.test(dateString)
}

/**
 * Validate time-only format (HH:MM)
 */
export function isValidTimeOnly(timeString: string): boolean {
	return VALIDATION_PATTERNS.TIME_ONLY.test(timeString)
}

/**
 * Get default time range for event searches
 */
export function getDefaultTimeRange(): { timeMin: string; timeMax: string } {
	const now = new Date()
	return {
		timeMin: new Date(
			now.getTime() - TIME_CONFIG.SEARCH_TIME_RANGE_DAYS.PAST * 24 * 60 * 60 * 1000
		).toISOString(),
		timeMax: new Date(
			now.getTime() + TIME_CONFIG.SEARCH_TIME_RANGE_DAYS.FUTURE * 24 * 60 * 60 * 1000
		).toISOString(),
	}
}

/**
 * Get extended time range for event searches (1 year)
 */
export function getExtendedTimeRange(): { timeMin: string; timeMax: string } {
	const now = new Date()
	return {
		timeMin: new Date(
			now.getTime() - TIME_CONFIG.SEARCH_TIME_RANGE_DAYS.EXTENDED_PAST * 24 * 60 * 60 * 1000
		).toISOString(),
		timeMax: new Date(
			now.getTime() + TIME_CONFIG.SEARCH_TIME_RANGE_DAYS.EXTENDED_FUTURE * 24 * 60 * 60 * 1000
		).toISOString(),
	}
}

/**
 * Filter events by name (case-insensitive partial match)
 */
export function filterEventsByName(
	events: calendar_v3.Schema$Event[],
	eventName: string
): calendar_v3.Schema$Event[] {
	return events.filter((event) => event.summary?.toLowerCase().includes(eventName.toLowerCase()))
}

/**
 * Filter events by date
 */
export function filterEventsByDate(
	events: calendar_v3.Schema$Event[],
	targetDate: string
): calendar_v3.Schema$Event[] {
	return events.filter((event) => {
		const eventDate = event.start?.date || event.start?.dateTime?.split('T')[0]
		return eventDate === targetDate
	})
}

/**
 * Filter events by time
 */
export function filterEventsByTime(
	events: calendar_v3.Schema$Event[],
	targetTime: string
): calendar_v3.Schema$Event[] {
	return events.filter((event) => {
		const eventTime = event.start?.dateTime
		if (!eventTime) return false
		const timePart = `${eventTime.split('T')[1]?.split(':')[0]}:${eventTime.split('T')[1]?.split(':')[1]}`
		return timePart.startsWith(targetTime)
	})
}

/**
 * Filter events by location
 */
export function filterEventsByLocation(
	events: calendar_v3.Schema$Event[],
	location: string
): calendar_v3.Schema$Event[] {
	return events.filter((event) => event.location?.toLowerCase().includes(location.toLowerCase()))
}

/**
 * Create event data object with proper structure
 */
export function createEventData(params: {
	summary: string
	description?: string
	location?: string
	startTime: string
	endTime: string
	allDay?: boolean
	attendees?: string[]
}): calendar_v3.Schema$Event {
	const eventData: calendar_v3.Schema$Event = {
		summary: params.summary,
		description: params.description,
		location: params.location,
	}

	if (params.allDay) {
		eventData.start = { date: parseDateString(params.startTime) }
		eventData.end = { date: parseDateString(params.endTime) }
	} else {
		eventData.start = { dateTime: params.startTime }
		eventData.end = { dateTime: params.endTime }
	}

	if (params.attendees && params.attendees.length > 0) {
		eventData.attendees = params.attendees.map((email) => ({ email }))
	}

	return eventData
}

/**
 * Generate time examples for user reference
 */
export function generateTimeExamples(): {
	current: string
	oneHourLater: string
	tomorrow: string
} {
	const now = new Date()
	return {
		current: now.toISOString(),
		oneHourLater: generateISOTime(60),
		tomorrow: generateISOTime(24 * 60), // 24 hours later
	}
}

/**
 * Extract error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message
	}
	if (typeof error === 'string') {
		return error
	}
	return 'An unknown error occurred'
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const { createServer } = require('node:net')
		const server = createServer()

		server.listen(port, () => {
			server.close(() => resolve(true))
		})

		server.on('error', () => resolve(false))
	})
}

/**
 * Get available port starting from a base port
 */
export async function getAvailablePort(
	basePort: number = DEFAULT_PORTS.MCP_SERVER
): Promise<number> {
	let port = basePort
	while (port < basePort + 100) {
		if (await isPortAvailable(port)) {
			return port
		}
		port++
	}
	throw new Error(`No available ports found starting from ${basePort}`)
}

/**
 * Sanitize user input for display
 */
export function sanitizeInput(input: string): string {
	return input
		.replace(/[<>]/g, '') // Remove potential HTML tags
		.trim()
		.slice(0, 1000) // Limit length
}

/**
 * Format attendees list for display
 */
export function formatAttendees(attendees?: calendar_v3.Schema$EventAttendee[]): string {
	if (!attendees || attendees.length === 0) {
		return 'No attendees'
	}

	return attendees
		.map((attendee) => {
			const name = attendee.displayName || attendee.email || 'Unknown'
			const email = attendee.email || 'No email'
			const response = attendee.responseStatus || 'No response'
			const optional = attendee.optional ? 'Yes' : 'No'

			return `- **${name}** (${email})\n  - Response: ${response}\n  - Optional: ${optional}`
		})
		.join('\n')
}

/**
 * Check if access token is expired
 */
export function isTokenExpired(expiryDate?: number): boolean {
	if (!expiryDate) return false
	return new Date() > new Date(expiryDate)
}

/**
 * Calculate token expiry time
 */
export function calculateTokenExpiry(expiresInSeconds: number): number {
	return Date.now() + expiresInSeconds * 1000
}

/**
 * Get timezone information
 */
export function getTimezoneInfo(): { timezone: string; offset: number } {
	const now = new Date()
	return {
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		offset: now.getTimezoneOffset(),
	}
}
