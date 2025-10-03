import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Auth, calendar_v3 } from 'googleapis'
import { z } from 'zod'
import { TOOL_NAMES } from '../constants.js'
import { safeAsyncOperation } from '../errors.js'
import { createCalendarClient, generateTimeExamples, getTimezoneInfo } from '../utils.js'

export function registerEventTools(
	server: McpServer,
	_calendar: calendar_v3.Calendar,
	oauth2Client: Auth.OAuth2Client
) {
	// Helper function to get a fresh calendar instance with current credentials
	const getCalendar = () => createCalendarClient(oauth2Client)
	// Tool: Get Current Time
	server.tool(
		TOOL_NAMES.EVENTS.GET_CURRENT_TIME,
		'Get the current system date and time for creating events',
		{},
		async () => {
			return safeAsyncOperation(async () => {
				const now = new Date()
				const examples = generateTimeExamples()
				const timezoneInfo = getTimezoneInfo()

				const markdown = `# Current System Time

## UTC Time (ISO 8601)
- **ISO String:** \`${examples.current}\`
- **UTC Date:** ${now.toUTCString()}

## Local Time
- **Local String:** ${now.toString()}
- **Local Date:** ${now.toLocaleDateString()}
- **Local Time:** ${now.toLocaleTimeString()}

## For Event Creation
When creating events, use the ISO format:
- **Current UTC:** \`${examples.current}\`
- **Example 1 hour from now:** \`${examples.oneHourLater}\`
- **Example tomorrow same time:** \`${examples.tomorrow}\`

## Time Zone Info
- **System Timezone:** ${timezoneInfo.timezone}
- **UTC Offset:** ${timezoneInfo.offset} minutes`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			}, 'get current time')
		}
	)

	// Tool: List Events
	server.tool(
		TOOL_NAMES.EVENTS.LIST,
		'List events from a calendar with optional filtering',
		{
			calendar_id: z.string().default('primary').describe("Calendar ID (default: 'primary')"),
			time_min: z.string().optional().describe('Lower bound for event start time (RFC3339 format)'),
			time_max: z.string().optional().describe('Upper bound for event start time (RFC3339 format)'),
			max_results: z.number().default(10).describe('Maximum number of events to return'),
			order_by: z
				.enum(['startTime', 'updated'])
				.default('startTime')
				.describe('Order of events returned'),
		},
		async ({ calendar_id, time_min, time_max, max_results, order_by }) => {
			try {
				const currentCalendar = getCalendar()
				const response = await currentCalendar.events.list({
					calendarId: calendar_id,
					timeMin: time_min,
					timeMax: time_max,
					maxResults: max_results,
					singleEvents: true,
					orderBy: order_by,
				})

				const events = response.data.items || []
				const markdown = `# Calendar Events

${
	events.length === 0
		? 'No events found for the specified criteria.'
		: events
				.map(
					(event) => `
## ${event.summary || 'Untitled Event'}
- **ID:** \`${event.id}\`
- **Start:** ${event.start?.dateTime || event.start?.date || 'Not specified'}
- **End:** ${event.end?.dateTime || event.end?.date || 'Not specified'}
- **Location:** ${event.location || 'Not specified'}
- **Description:** ${event.description || 'No description'}
- **Status:** ${event.status || 'Unknown'}
- **HTML Link:** ${event.htmlLink || 'Not available'}
${event.attendees ? `- **Attendees:** ${event.attendees.map((a) => a.email || a.displayName || 'Unknown').join(', ')}` : ''}
`
				)
				.join('\n')
}

**Total:** ${events.length} event${events.length !== 1 ? 's' : ''}`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error listing events: ${e.message}` }],
				}
			}
		}
	)

	// Tool: Get Event Details
	server.tool(
		'get_event',
		'Get detailed information about a specific event',
		{
			calendar_id: z.string().default('primary').describe("Calendar ID (default: 'primary')"),
			event_id: z.string().describe('Event ID'),
		},
		async ({ calendar_id, event_id }) => {
			try {
				const currentCalendar = getCalendar()
				const response = await currentCalendar.events.get({
					calendarId: calendar_id,
					eventId: event_id,
				})

				const event = response.data
				const markdown = `# Event Details

## ${event.summary || 'Untitled Event'}
- **ID:** \`${event.id}\`
- **Start:** ${event.start?.dateTime || event.start?.date || 'Not specified'}
- **End:** ${event.end?.dateTime || event.end?.date || 'Not specified'}
- **Location:** ${event.location || 'Not specified'}
- **Description:** ${event.description || 'No description'}
- **Status:** ${event.status || 'Unknown'}
- **Created:** ${event.created ? new Date(event.created).toISOString() : 'Unknown'}
- **Updated:** ${event.updated ? new Date(event.updated).toISOString() : 'Unknown'}
- **HTML Link:** ${event.htmlLink || 'Not available'}

## Attendees
${
	event.attendees?.length
		? event.attendees
				.map(
					(attendee) => `
- **${attendee.displayName || attendee.email || 'Unknown'}** (${attendee.email || 'No email'})
  - Response: ${attendee.responseStatus || 'No response'}
  - Optional: ${attendee.optional ? 'Yes' : 'No'}
`
				)
				.join('')
		: 'No attendees'
}

## Reminders
${
	event.reminders?.overrides?.length
		? event.reminders.overrides
				.map(
					(reminder) => `
- **${reminder.method}:** ${reminder.minutes} minutes before
`
				)
				.join('')
		: 'No custom reminders'
}`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error getting event details: ${e.message}` }],
				}
			}
		}
	)

	// Tool: Create Event for Now
	server.tool(
		'create_event_now',
		'Create an event starting now or at a specific time relative to now',
		{
			calendar_id: z.string().default('primary').describe("Calendar ID (default: 'primary')"),
			summary: z.string().describe('Event title'),
			description: z.string().optional().describe('Event description'),
			location: z.string().optional().describe('Event location'),
			attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
			duration_minutes: z.number().default(60).describe('Duration of the event in minutes'),
			start_offset_minutes: z
				.number()
				.default(0)
				.describe(
					'Minutes to add to current time for start (0 = start now, 30 = start in 30 minutes)'
				),
		},
		async ({
			calendar_id,
			summary,
			description,
			location,
			attendees,
			duration_minutes,
			start_offset_minutes,
		}) => {
			try {
				const now = new Date()
				const startTime = new Date(now.getTime() + start_offset_minutes * 60 * 1000)
				const endTime = new Date(startTime.getTime() + duration_minutes * 60 * 1000)

				const eventData: any = {
					summary,
					description,
					location,
					start: { dateTime: startTime.toISOString() },
					end: { dateTime: endTime.toISOString() },
				}

				if (attendees && attendees.length > 0) {
					eventData.attendees = attendees.map((email) => ({ email }))
				}

				const currentCalendar = getCalendar()
				const response = await currentCalendar.events.insert({
					calendarId: calendar_id,
					requestBody: eventData,
				})

				const event = response.data
				const markdown = `# Event Created Successfully

## ${event.summary}
- **ID:** \`${event.id}\`
- **Start:** ${event.start?.dateTime || 'Not specified'}
- **End:** ${event.end?.dateTime || 'Not specified'}
- **Duration:** ${duration_minutes} minutes
- **Location:** ${event.location || 'Not specified'}
- **Description:** ${event.description || 'No description'}
- **Status:** ${event.status || 'Unknown'}
- **HTML Link:** ${event.htmlLink || 'Not available'}

## Time Details
- **Created at:** ${now.toISOString()}
- **Starts:** ${startTime.toLocaleString()}
- **Ends:** ${endTime.toLocaleString()}

## Next Steps
- The event has been added to your calendar
- Attendees will receive email invitations (if specified)
- You can view the event in Google Calendar using the HTML link above`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error creating event: ${e.message}` }],
				}
			}
		}
	)

	// Tool: Create Event
	server.tool(
		'create_event',
		'Create a new calendar event',
		{
			calendar_id: z.string().default('primary').describe("Calendar ID (default: 'primary')"),
			summary: z.string().describe('Event title'),
			description: z.string().optional().describe('Event description'),
			start_time: z.string().describe('Start time (RFC3339 format)'),
			end_time: z.string().describe('End time (RFC3339 format)'),
			location: z.string().optional().describe('Event location'),
			attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
			all_day: z.boolean().default(false).describe('Whether this is an all-day event'),
		},
		async ({
			calendar_id,
			summary,
			description,
			start_time,
			end_time,
			location,
			attendees,
			all_day,
		}) => {
			try {
				const eventData: any = {
					summary,
					description,
					location,
				}

				if (all_day) {
					eventData.start = { date: start_time.split('T')[0] }
					eventData.end = { date: end_time.split('T')[0] }
				} else {
					eventData.start = { dateTime: start_time }
					eventData.end = { dateTime: end_time }
				}

				if (attendees && attendees.length > 0) {
					eventData.attendees = attendees.map((email) => ({ email }))
				}

				const currentCalendar = getCalendar()
				const response = await currentCalendar.events.insert({
					calendarId: calendar_id,
					requestBody: eventData,
				})

				const event = response.data
				const markdown = `# Event Created Successfully

## ${event.summary}
- **ID:** \`${event.id}\`
- **Start:** ${event.start?.dateTime || event.start?.date || 'Not specified'}
- **End:** ${event.end?.dateTime || event.end?.date || 'Not specified'}
- **Location:** ${event.location || 'Not specified'}
- **Description:** ${event.description || 'No description'}
- **Status:** ${event.status || 'Unknown'}
- **HTML Link:** ${event.htmlLink || 'Not available'}

## Next Steps
- The event has been added to your calendar
- Attendees will receive email invitations (if specified)
- You can view the event in Google Calendar using the HTML link above`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error creating event: ${e.message}` }],
				}
			}
		}
	)

	// Tool: Update Event
	server.tool(
		'update_event',
		'Update an existing calendar event',
		{
			calendar_id: z.string().default('primary').describe("Calendar ID (default: 'primary')"),
			event_id: z.string().describe('Event ID to update'),
			summary: z.string().optional().describe('New event title'),
			description: z.string().optional().describe('New event description'),
			start_time: z.string().optional().describe('New start time (RFC3339 format)'),
			end_time: z.string().optional().describe('New end time (RFC3339 format)'),
			location: z.string().optional().describe('New event location'),
			attendees: z.array(z.string()).optional().describe('New list of attendee email addresses'),
		},
		async ({
			calendar_id,
			event_id,
			summary,
			description,
			start_time,
			end_time,
			location,
			attendees,
		}) => {
			try {
				// First get the existing event
				const currentCalendar = getCalendar()
				const existingEvent = await currentCalendar.events.get({
					calendarId: calendar_id,
					eventId: event_id,
				})

				const eventData = { ...existingEvent.data }

				// Update fields if provided
				if (summary !== undefined) eventData.summary = summary
				if (description !== undefined) eventData.description = description
				if (location !== undefined) eventData.location = location
				if (start_time !== undefined) {
					eventData.start = eventData.start?.date
						? { date: start_time.split('T')[0] }
						: { dateTime: start_time }
				}
				if (end_time !== undefined) {
					eventData.end = eventData.end?.date
						? { date: end_time.split('T')[0] }
						: { dateTime: end_time }
				}
				if (attendees !== undefined) {
					eventData.attendees = attendees.map((email) => ({ email }))
				}

				const response = await currentCalendar.events.update({
					calendarId: calendar_id,
					eventId: event_id,
					requestBody: eventData,
				})

				const event = response.data
				const markdown = `# Event Updated Successfully

## ${event.summary}
- **ID:** \`${event.id}\`
- **Start:** ${event.start?.dateTime || event.start?.date || 'Not specified'}
- **End:** ${event.end?.dateTime || event.end?.date || 'Not specified'}
- **Location:** ${event.location || 'Not specified'}
- **Description:** ${event.description || 'No description'}
- **Status:** ${event.status || 'Unknown'}
- **HTML Link:** ${event.htmlLink || 'Not available'}

## Changes Applied
- Event details have been updated
- Attendees will receive updated invitations (if changed)
- The event will appear updated in Google Calendar`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error updating event: ${e.message}` }],
				}
			}
		}
	)

	// Tool: Find Events by Name
	server.tool(
		'find_events_by_name',
		'Find events by name or partial name match',
		{
			calendar_id: z.string().default('primary').describe("Calendar ID (default: 'primary')"),
			event_name: z.string().describe('Event name or partial name to search for'),
			time_min: z
				.string()
				.optional()
				.describe('Search events from this time (ISO format, defaults to 7 days ago)'),
			time_max: z
				.string()
				.optional()
				.describe('Search events until this time (ISO format, defaults to 30 days from now)'),
		},
		async ({ calendar_id, event_name, time_min, time_max }) => {
			try {
				const currentCalendar = getCalendar()

				// Set default time range if not provided
				const now = new Date()
				const defaultTimeMin =
					time_min || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
				const defaultTimeMax =
					time_max || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

				const response = await currentCalendar.events.list({
					calendarId: calendar_id,
					timeMin: defaultTimeMin,
					timeMax: defaultTimeMax,
					singleEvents: true,
					orderBy: 'startTime',
				})

				const events = response.data.items || []
				const matchingEvents = events.filter((event) =>
					event.summary?.toLowerCase().includes(event_name.toLowerCase())
				)

				if (matchingEvents.length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: `No events found matching "${event_name}" in the specified time range.`,
							},
						],
					}
				}

				const markdown = `# Events Found Matching "${event_name}"

Found ${matchingEvents.length} event(s) with similar names:

${matchingEvents
	.map(
		(event, index) => `
## Option ${index + 1}: ${event.summary}
- **ID:** \`${event.id}\`
- **Start:** ${event.start?.dateTime || event.start?.date || 'Not specified'}
- **End:** ${event.end?.dateTime || event.end?.date || 'Not specified'}
- **Location:** ${event.location || 'Not specified'}
- **Description:** ${event.description || 'No description'}
- **Status:** ${event.status || 'Unknown'}
- **HTML Link:** ${event.htmlLink || 'Not available'}
`
	)
	.join('\n')}

## Next Steps
To delete a specific event, use the \`delete_event\` tool with the exact Event ID from above.
To get more details about a specific event, use the \`get_event\` tool with the Event ID.`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error searching for events: ${e.message}` }],
				}
			}
		}
	)

	// Tool: Delete Event (User-Friendly)
	server.tool(
		'delete_event',
		'Delete a calendar event by providing identifying information (name, date, location)',
		{
			calendar_id: z.string().default('primary').describe("Calendar ID (default: 'primary')"),
			event_name: z.string().describe('Event name or partial name to delete'),
			start_date: z
				.string()
				.optional()
				.describe('Event start date (YYYY-MM-DD) - helps identify the correct event'),
			start_time: z
				.string()
				.optional()
				.describe(
					"Event start time (HH:MM format like '14:30') - helps identify the correct event"
				),
			location: z.string().optional().describe('Event location - helps identify the correct event'),
			force_delete: z
				.boolean()
				.default(false)
				.describe(
					'If true, delete the first matching event without showing options (use with caution)'
				),
		},
		async ({ calendar_id, event_name, start_date, start_time, location, force_delete }) => {
			try {
				const currentCalendar = getCalendar()

				// Search for events with matching name
				const response = await currentCalendar.events.list({
					calendarId: calendar_id,
					timeMin: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
					timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
					singleEvents: true,
					orderBy: 'startTime',
				})

				const events = response.data.items || []
				let matchingEvents = events.filter((event) =>
					event.summary?.toLowerCase().includes(event_name.toLowerCase())
				)

				// Filter by start date if provided
				if (start_date) {
					matchingEvents = matchingEvents.filter((event) => {
						const eventDate = event.start?.date || event.start?.dateTime?.split('T')[0]
						return eventDate === start_date
					})
				}

				// Filter by start time if provided
				if (start_time) {
					matchingEvents = matchingEvents.filter((event) => {
						const eventTime = event.start?.dateTime
						if (!eventTime) return false
						const timePart = `${eventTime.split('T')[1]?.split(':')[0]}:${eventTime.split('T')[1]?.split(':')[1]}`
						return timePart.startsWith(start_time)
					})
				}

				// Filter by location if provided
				if (location) {
					matchingEvents = matchingEvents.filter((event) =>
						event.location?.toLowerCase().includes(location.toLowerCase())
					)
				}

				if (matchingEvents.length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: `# No Events Found

No events found matching your criteria:
- **Name:** "${event_name}"
${start_date ? `- **Date:** ${start_date}\n` : ''}${start_time ? `- **Time:** ${start_time}\n` : ''}${location ? `- **Location:** ${location}\n` : ''}

## Suggestions:
1. Try using a partial name match
2. Use \`find_events_by_name\` to search for similar events
3. Check if you're looking in the correct calendar`,
							},
						],
					}
				}

				if (matchingEvents.length > 1 && !force_delete) {
					const markdown = `# Multiple Events Found - Please Choose One

Found ${matchingEvents.length} events matching your criteria:

${matchingEvents
	.map(
		(event, index) => `
## Option ${index + 1}: ${event.summary}
- **Start:** ${event.start?.dateTime || event.start?.date || 'Not specified'}
- **End:** ${event.end?.dateTime || event.end?.date || 'Not specified'}
- **Location:** ${event.location || 'Not specified'}
- **Description:** ${event.description || 'No description'}
`
	)
	.join('\n')}

## To Delete a Specific Event:
1. **Add more details** to narrow down the search:
   - \`start_date\`: "2024-10-02" 
   - \`start_time\`: "14:30"
   - \`location\`: "Conference Room A"

2. **Or use force_delete=true** to delete the first match (use with caution)

## Example:
\`\`\`
delete_event
event_name: "Team Meeting"
start_date: "2024-10-02"
start_time: "14:30"
\`\`\``

					return {
						content: [{ type: 'text', text: markdown }],
					}
				}

				// Exactly one match or force_delete is true
				const eventToDelete = matchingEvents[0]

				// Show what we're about to delete
				const _confirmationMarkdown = `# Confirming Event Deletion

## Event to be deleted:
- **Title:** ${eventToDelete.summary || 'Untitled Event'}
- **Start:** ${eventToDelete.start?.dateTime || eventToDelete.start?.date || 'Not specified'}
- **End:** ${eventToDelete.end?.dateTime || eventToDelete.end?.date || 'Not specified'}
- **Location:** ${eventToDelete.location || 'Not specified'}
- **Description:** ${eventToDelete.description || 'No description'}

**WARNING: This action cannot be undone!**

Proceeding with deletion...`

				// Delete the event
				await currentCalendar.events.delete({
					calendarId: calendar_id,
					eventId: eventToDelete.id!,
				})

				const markdown = `# Event Deleted Successfully

## Deleted Event Details:
- **Title:** ${eventToDelete.summary || 'Untitled Event'}
- **Start:** ${eventToDelete.start?.dateTime || eventToDelete.start?.date || 'Not specified'}
- **End:** ${eventToDelete.end?.dateTime || eventToDelete.end?.date || 'Not specified'}
- **Location:** ${eventToDelete.location || 'Not specified'}

**WARNING:** This action cannot be undone. The event has been removed from all attendees' calendars.

## Next Steps:
- The event has been permanently deleted
- Attendees will no longer see this event in their calendars
- If this was the wrong event, you can recreate it using \`create_event\``

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [
						{
							type: 'text',
							text: `# Error Deleting Event

**Error:** ${e.message}

## Troubleshooting:
1. Make sure the event name is spelled correctly
2. Check if you're using the right calendar
3. Try using \`find_events_by_name\` to search for the event first
4. Verify the date and time format (YYYY-MM-DD for date, HH:MM for time)`,
						},
					],
				}
			}
		}
	)

	// Tool: Delete Event by ID (for advanced users)
	server.tool(
		'delete_event_by_id',
		'Delete a calendar event by its exact ID (for advanced users who know the event ID)',
		{
			calendar_id: z.string().default('primary').describe("Calendar ID (default: 'primary')"),
			event_id: z.string().describe('Exact Event ID to delete'),
		},
		async ({ calendar_id, event_id }) => {
			try {
				const currentCalendar = getCalendar()

				// First get the event details to show what we're deleting
				const eventResponse = await currentCalendar.events.get({
					calendarId: calendar_id,
					eventId: event_id,
				})

				const event = eventResponse.data

				// Now delete the event
				await currentCalendar.events.delete({
					calendarId: calendar_id,
					eventId: event_id,
				})

				const markdown = `# Event Deleted Successfully

## Deleted Event Details:
- **Title:** ${event.summary || 'Untitled Event'}
- **ID:** \`${event.id}\`
- **Start:** ${event.start?.dateTime || event.start?.date || 'Not specified'}
- **End:** ${event.end?.dateTime || event.end?.date || 'Not specified'}
- **Location:** ${event.location || 'Not specified'}

**WARNING:** This action cannot be undone. The event has been removed from all attendees' calendars.`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [
						{
							type: 'text',
							text: `# Error Deleting Event

**Error:** ${e.message}

## Troubleshooting:
- Make sure the event ID is correct
- Check if the event still exists
- Verify you're using the right calendar`,
						},
					],
				}
			}
		}
	)

	// Tool: Delete Event by Name (with confirmation)
	server.tool(
		'delete_event_by_name',
		'Delete an event by name with additional details to avoid ambiguity',
		{
			calendar_id: z.string().default('primary').describe("Calendar ID (default: 'primary')"),
			event_name: z.string().describe('Event name to delete'),
			start_date: z
				.string()
				.optional()
				.describe('Event start date (YYYY-MM-DD) to help identify the correct event'),
			location: z.string().optional().describe('Event location to help identify the correct event'),
		},
		async ({ calendar_id, event_name, start_date, location }) => {
			try {
				const currentCalendar = getCalendar()

				// Search for events with matching name
				const response = await currentCalendar.events.list({
					calendarId: calendar_id,
					timeMin: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
					timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
					singleEvents: true,
					orderBy: 'startTime',
				})

				const events = response.data.items || []
				let matchingEvents = events.filter((event) =>
					event.summary?.toLowerCase().includes(event_name.toLowerCase())
				)

				// Filter by start date if provided
				if (start_date) {
					matchingEvents = matchingEvents.filter((event) => {
						const eventDate = event.start?.date || event.start?.dateTime?.split('T')[0]
						return eventDate === start_date
					})
				}

				// Filter by location if provided
				if (location) {
					matchingEvents = matchingEvents.filter((event) =>
						event.location?.toLowerCase().includes(location.toLowerCase())
					)
				}

				if (matchingEvents.length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: `No events found matching the criteria:\n- Name: "${event_name}"\n${start_date ? `- Start Date: ${start_date}\n` : ''}${location ? `- Location: ${location}\n` : ''}\n\nTry using \`find_events_by_name\` to search for similar events.`,
							},
						],
					}
				}

				if (matchingEvents.length > 1) {
					const markdown = `# Multiple Events Found - Please Be More Specific

Found ${matchingEvents.length} events matching your criteria:

${matchingEvents
	.map(
		(event, index) => `
## Option ${index + 1}: ${event.summary}
- **ID:** \`${event.id}\`
- **Start:** ${event.start?.dateTime || event.start?.date || 'Not specified'}
- **End:** ${event.end?.dateTime || event.end?.date || 'Not specified'}
- **Location:** ${event.location || 'Not specified'}
`
	)
	.join('\n')}

## To Delete a Specific Event:
1. Use \`delete_event\` with the exact Event ID, OR
2. Use \`delete_event_by_name\` with more specific criteria (location, exact date, etc.)`

					return {
						content: [{ type: 'text', text: markdown }],
					}
				}

				// Exactly one match - proceed with deletion
				const eventToDelete = matchingEvents[0]

				await currentCalendar.events.delete({
					calendarId: calendar_id,
					eventId: eventToDelete.id!,
				})

				const markdown = `# Event Deleted Successfully

## Deleted Event Details:
- **Title:** ${eventToDelete.summary || 'Untitled Event'}
- **ID:** \`${eventToDelete.id}\`
- **Start:** ${eventToDelete.start?.dateTime || eventToDelete.start?.date || 'Not specified'}
- **End:** ${eventToDelete.end?.dateTime || eventToDelete.end?.date || 'Not specified'}
- **Location:** ${eventToDelete.location || 'Not specified'}

**WARNING:** This action cannot be undone. The event has been removed from all attendees' calendars.`

				return {
					content: [{ type: 'text', text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: 'text', text: `Error deleting event: ${e.message}` }],
				}
			}
		}
	)
}
