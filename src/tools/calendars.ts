import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Auth, calendar_v3 } from 'googleapis'
import { google } from 'googleapis'
import { z } from 'zod'

export function registerCalendarTools(
	server: McpServer,
	_calendar: calendar_v3.Calendar,
	oauth2Client: Auth.OAuth2Client
) {
	// Helper function to get a fresh calendar instance with current credentials
	const getCalendar = () => {
		return google.calendar({ version: 'v3', auth: oauth2Client })
	}
	// Tool: List Calendars
	server.tool('list_calendars', 'List all calendars accessible to the user', {}, async () => {
		try {
			const currentCalendar = getCalendar()
			const response = await currentCalendar.calendarList.list()
			const calendars = response.data.items || []

			const markdown = `# Available Calendars

${
	calendars.length === 0
		? 'No calendars found.'
		: calendars
				.map(
					(cal) => `
## ${cal.summary || 'Untitled Calendar'}
- **ID:** \`${cal.id}\`
- **Description:** ${cal.description || 'No description'}
- **Time Zone:** ${cal.timeZone || 'Not specified'}
- **Access Role:** ${cal.accessRole || 'Unknown'}
- **Primary:** ${cal.primary ? 'Yes' : 'No'}
`
				)
				.join('\n')
}

**Total:** ${calendars.length} calendar${calendars.length !== 1 ? 's' : ''}`

			return {
				content: [{ type: 'text', text: markdown }],
			}
		} catch (e: any) {
			return {
				content: [{ type: 'text', text: `Error listing calendars: ${e.message}` }],
			}
		}
	})

	// Tool: Get Calendar Details
	server.tool(
		'get_calendar',
		'Get detailed information about a specific calendar',
		{
			calendar_id: z
				.string()
				.describe("Calendar ID (use 'primary' for the user's primary calendar)"),
		},
		async ({ calendar_id }) => {
			try {
				const currentCalendar = getCalendar()
				const response = await currentCalendar.calendarList.get({
					calendarId: calendar_id,
				})

				const cal = response.data
				const markdown = `# Calendar Details

## ${cal.summary || 'Untitled Calendar'}
- **ID:** \`${cal.id}\`
- **Description:** ${cal.description || 'No description'}
- **Time Zone:** ${cal.timeZone || 'Not specified'}
- **Access Role:** ${cal.accessRole || 'Unknown'}
- **Primary:** ${cal.primary ? 'Yes' : 'No'}
- **Background Color:** ${cal.backgroundColor || 'Default'}
- **Foreground Color:** ${cal.foregroundColor || 'Default'}
- **Selected:** ${cal.selected ? 'Yes' : 'No'}
- **Summary Override:** ${cal.summaryOverride || 'None'}

## Access Information
- **Access Role:** ${cal.accessRole}
- **Default Reminders:** ${cal.defaultReminders?.length ? cal.defaultReminders.map((r) => `${r.method} (${r.minutes} min)`).join(', ') : 'None'}
- **Notification Settings:** ${cal.notificationSettings?.notifications?.length ? cal.notificationSettings.notifications.map((n) => n.type).join(', ') : 'None'}`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error getting calendar details: ${e.message}` }],
				}
			}
		}
	)

	// Tool: Create Calendar
	server.tool(
		'create_calendar',
		'Create a new calendar',
		{
			summary: z.string().describe('Calendar title/name'),
			description: z.string().optional().describe('Calendar description'),
			time_zone: z.string().optional().describe("Time zone (e.g., 'America/New_York')"),
		},
		async ({ summary, description, time_zone }) => {
			try {
				const currentCalendar = getCalendar()
				const response = await currentCalendar.calendars.insert({
					requestBody: {
						summary,
						description,
						timeZone: time_zone,
					},
				})

				const cal = response.data
				const markdown = `# Calendar Created Successfully

## ${cal.summary}
- **ID:** \`${cal.id}\`
- **Description:** ${cal.description || 'No description'}
- **Time Zone:** ${cal.timeZone || 'Not specified'}
- **ETag:** ${cal.etag}

## Next Steps
- You can now add events to this calendar
- Use the calendar ID \`${cal.id}\` in event operations
- The calendar will appear in your Google Calendar interface`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error creating calendar: ${e.message}` }],
				}
			}
		}
	)

	// Tool: Delete Calendar
	server.tool(
		'delete_calendar',
		'Delete a calendar (cannot delete primary calendar)',
		{
			calendar_id: z.string().describe("Calendar ID to delete (cannot be 'primary')"),
		},
		async ({ calendar_id }) => {
			try {
				if (calendar_id === 'primary') {
					return {
						content: [{ type: 'text', text: '**ERROR:** Cannot delete the primary calendar' }],
					}
				}

				const currentCalendar = getCalendar()
				await currentCalendar.calendars.delete({
					calendarId: calendar_id,
				})

				const markdown = `# Calendar Deleted Successfully

The calendar \`${calendar_id}\` has been permanently deleted.

**WARNING:** This action cannot be undone. All events in this calendar have been permanently removed.`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error deleting calendar: ${e.message}` }],
				}
			}
		}
	)
}
