import { z } from "zod"
import type { calendar_v3 } from "googleapis"
import type { Auth } from "googleapis"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export function registerEventTools(
	server: McpServer,
	calendar: calendar_v3.Calendar,
	oauth2Client: Auth.OAuth2Client,
) {
	// Tool: List Events
	server.tool(
		"list_events",
		"List events from a calendar within a specified time range",
		{
			calendar_id: z
				.string()
				.default("primary")
				.describe("Calendar ID (use 'primary' for user's primary calendar)"),
			time_min: z
				.string()
				.optional()
				.describe("Start time (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')"),
			time_max: z
				.string()
				.optional()
				.describe("End time (ISO 8601 format, e.g., '2024-01-31T23:59:59Z')"),
			max_results: z
				.number()
				.optional()
				.default(10)
				.describe("Maximum number of events to return (default: 10)"),
			single_events: z
				.boolean()
				.optional()
				.default(true)
				.describe("Whether to expand recurring events into individual occurrences"),
			order_by: z
				.enum(["startTime", "updated"])
				.optional()
				.default("startTime")
				.describe("How to order the events"),
			q: z
				.string()
				.optional()
				.describe("Free text search terms"),
		},
		async ({ calendar_id, time_min, time_max, max_results, single_events, order_by, q }) => {
			try {
				if (!oauth2Client.credentials.access_token && !oauth2Client.credentials.refresh_token) {
					return {
						content: [
							{
								type: "text",
								text: "❌ **Authentication Required**: Please authenticate first using `generate_oauth_url` and `exchange_auth_code` tools.",
							},
						],
					}
				}

				const response = await calendar.events.list({
					calendarId: calendar_id,
					timeMin: time_min,
					timeMax: time_max,
					maxResults: max_results,
					singleEvents: single_events,
					orderBy: order_by,
					q: q,
				})

				const events = response.data.items || []

				if (events.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `📅 **No events found** in the specified time range${q ? ` matching "${q}"` : ""}.`,
							},
						],
					}
				}

				let markdown = `# 📅 Calendar Events (${events.length} found)\n\n`

				if (q) {
					markdown += `**Search:** "${q}"\n`
				}
				if (time_min || time_max) {
					markdown += `**Time Range:** ${time_min || 'Start'} → ${time_max || 'End'}\n`
				}
				markdown += `**Calendar:** ${calendar_id}\n\n---\n\n`

				events.forEach((event, index) => {
					const start = event.start?.dateTime || event.start?.date
					const end = event.end?.dateTime || event.end?.date
					const isAllDay = !event.start?.dateTime

					markdown += `## ${index + 1}. ${event.summary || "Untitled Event"}${isAllDay ? " 📅" : " ⏰"}\n\n`
					markdown += `- **Event ID:** \`${event.id}\`\n`
					markdown += `- **Status:** ${event.status || "Unknown"}\n`

					if (start) {
						if (isAllDay) {
							markdown += `- **Date:** ${new Date(start).toLocaleDateString()}\n`
						} else {
							markdown += `- **Start:** ${new Date(start).toLocaleString()}\n`
							if (end) {
								markdown += `- **End:** ${new Date(end).toLocaleString()}\n`
							}
						}
					}

					if (event.location) {
						markdown += `- **Location:** ${event.location}\n`
					}

					if (event.description) {
						const truncatedDesc = event.description.length > 100
							? event.description.substring(0, 100) + "..."
							: event.description
						markdown += `- **Description:** ${truncatedDesc}\n`
					}

					if (event.attendees && event.attendees.length > 0) {
						markdown += `- **Attendees:** ${event.attendees.length} person${event.attendees.length > 1 ? 's' : ''}\n`
					}

					if (event.recurringEventId) {
						markdown += `- **Recurring Event ID:** \`${event.recurringEventId}\`\n`
					}

					if (event.htmlLink) {
						markdown += `- **[View in Google Calendar](${event.htmlLink})**\n`
					}

					markdown += `\n`
				})

				markdown += `---\n\n**💡 Tip:** Use event IDs with other event tools to modify or delete specific events.`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error listing events: ${e.message}` }],
				}
			}
		},
	)

	// Tool: Get Event Details
	server.tool(
		"get_event",
		"Get detailed information about a specific event",
		{
			calendar_id: z
				.string()
				.default("primary")
				.describe("Calendar ID containing the event"),
			event_id: z
				.string()
				.describe("Event ID to retrieve"),
		},
		async ({ calendar_id, event_id }) => {
			try {
				if (!oauth2Client.credentials.access_token && !oauth2Client.credentials.refresh_token) {
					return {
						content: [
							{
								type: "text",
								text: "❌ **Authentication Required**: Please authenticate first using `generate_oauth_url` and `exchange_auth_code` tools.",
							},
						],
					}
				}

				const response = await calendar.events.get({
					calendarId: calendar_id,
					eventId: event_id,
				})

				const event = response.data
				const start = event.start?.dateTime || event.start?.date
				const end = event.end?.dateTime || event.end?.date
				const isAllDay = !event.start?.dateTime

				let markdown = `# 📅 Event Details

## ${event.summary || "Untitled Event"}

### Basic Information
- **Event ID:** \`${event.id}\`
- **Status:** ${event.status || "Unknown"}
- **Created:** ${event.created ? new Date(event.created).toLocaleString() : "Unknown"}
- **Updated:** ${event.updated ? new Date(event.updated).toLocaleString() : "Unknown"}

### Time & Location
`

				if (start) {
					if (isAllDay) {
						markdown += `- **All-day event on:** ${new Date(start).toLocaleDateString()}\n`
					} else {
						markdown += `- **Start:** ${new Date(start).toLocaleString()}\n`
						if (end) {
							markdown += `- **End:** ${new Date(end).toLocaleString()}\n`
						}
						if (event.start?.timeZone) {
							markdown += `- **Timezone:** ${event.start.timeZone}\n`
						}
					}
				}

				if (event.location) {
					markdown += `- **Location:** ${event.location}\n`
				}

				if (event.description) {
					markdown += `\n### Description\n${event.description}\n`
				}

				if (event.attendees && event.attendees.length > 0) {
					markdown += `\n### Attendees (${event.attendees.length})\n`
					event.attendees.forEach(attendee => {
						const status = attendee.responseStatus
						const statusEmoji = status === "accepted" ? "✅" 
							: status === "declined" ? "❌"
							: status === "tentative" ? "❓"
							: "⏳"
						markdown += `- ${statusEmoji} ${attendee.displayName || attendee.email || "Unknown"}`
						if (attendee.organizer) markdown += " (Organizer)"
						if (attendee.optional) markdown += " (Optional)"
						markdown += "\n"
					})
				}

				if (event.reminders?.useDefault === false && event.reminders?.overrides) {
					markdown += `\n### Reminders\n`
					event.reminders.overrides.forEach(reminder => {
						markdown += `- ${reminder.method}: ${reminder.minutes} minutes before\n`
					})
				} else if (event.reminders?.useDefault) {
					markdown += `\n### Reminders\nUsing default calendar reminders\n`
				}

				if (event.recurrence) {
					markdown += `\n### Recurrence\n`
					event.recurrence.forEach(rule => {
						markdown += `- ${rule}\n`
					})
				}

				if (event.conferenceData?.entryPoints) {
					markdown += `\n### Conference Details\n`
					event.conferenceData.entryPoints.forEach(entry => {
						if (entry.entryPointType === "video") {
							markdown += `- **Video Call:** [Join Meeting](${entry.uri})\n`
						} else if (entry.entryPointType === "phone") {
							markdown += `- **Phone:** ${entry.label || entry.uri}\n`
						}
					})
				}

				if (event.htmlLink) {
					markdown += `\n### Links\n- **[View in Google Calendar](${event.htmlLink})**\n`
				}

				markdown += `\n---\n\n**ETag:** \`${event.etag}\`\n**Kind:** ${event.kind}`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error getting event details: ${e.message}` }],
				}
			}
		},
	)

	// Tool: Create Event
	server.tool(
		"create_event",
		"Create a new calendar event",
		{
			calendar_id: z
				.string()
				.default("primary")
				.describe("Calendar ID where the event will be created"),
			summary: z
				.string()
				.describe("Event title/summary"),
			description: z
				.string()
				.optional()
				.describe("Event description"),
			start_time: z
				.string()
				.describe("Start time (ISO 8601 format, e.g., '2024-01-15T10:00:00Z' or '2024-01-15' for all-day)"),
			end_time: z
				.string()
				.describe("End time (ISO 8601 format, e.g., '2024-01-15T11:00:00Z' or '2024-01-15' for all-day)"),
			location: z
				.string()
				.optional()
				.describe("Event location"),
			attendees: z
				.array(z.string())
				.optional()
				.describe("List of attendee email addresses"),
			timezone: z
				.string()
				.optional()
				.describe("Timezone for the event (e.g., 'America/New_York')"),
			all_day: z
				.boolean()
				.optional()
				.default(false)
				.describe("Whether this is an all-day event"),
		},
		async ({ calendar_id, summary, description, start_time, end_time, location, attendees, timezone, all_day }) => {
			try {
				if (!oauth2Client.credentials.access_token && !oauth2Client.credentials.refresh_token) {
					return {
						content: [
							{
								type: "text",
								text: "❌ **Authentication Required**: Please authenticate first using `generate_oauth_url` and `exchange_auth_code` tools.",
							},
						],
					}
				}

				const eventBody: calendar_v3.Schema$Event = {
					summary,
					description,
					location,
				}

				// Handle time formatting
				if (all_day) {
					eventBody.start = { date: start_time.split('T')[0] }
					eventBody.end = { date: end_time.split('T')[0] }
				} else {
					eventBody.start = { 
						dateTime: start_time,
						timeZone: timezone 
					}
					eventBody.end = { 
						dateTime: end_time,
						timeZone: timezone 
					}
				}

				// Handle attendees
				if (attendees && attendees.length > 0) {
					eventBody.attendees = attendees.map(email => ({ email }))
				}

				const response = await calendar.events.insert({
					calendarId: calendar_id,
					requestBody: eventBody,
				})

				const newEvent = response.data

				const markdown = `# ✅ Event Created Successfully

## ${newEvent.summary}

### Event Details
- **Event ID:** \`${newEvent.id}\`
- **Status:** ${newEvent.status}
- **Created:** ${newEvent.created ? new Date(newEvent.created).toLocaleString() : "Just now"}

### Time & Location
${all_day 
	? `- **All-day event:** ${new Date(start_time).toLocaleDateString()}`
	: `- **Start:** ${new Date(start_time).toLocaleString()}
- **End:** ${new Date(end_time).toLocaleString()}`
}
${location ? `- **Location:** ${location}` : ""}

${attendees && attendees.length > 0 ? `### Attendees
${attendees.map(email => `- ${email}`).join('\n')}` : ""}

### Links
- **[View in Google Calendar](${newEvent.htmlLink})**

---

**💡 Tip:** Save the event ID \`${newEvent.id}\` to modify or delete this event later.`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error creating event: ${e.message}` }],
				}
			}
		},
	)

	// Tool: Update Event
	server.tool(
		"update_event",
		"Update an existing calendar event",
		{
			calendar_id: z
				.string()
				.default("primary")
				.describe("Calendar ID containing the event"),
			event_id: z
				.string()
				.describe("Event ID to update"),
			summary: z
				.string()
				.optional()
				.describe("New event title/summary"),
			description: z
				.string()
				.optional()
				.describe("New event description"),
			start_time: z
				.string()
				.optional()
				.describe("New start time (ISO 8601 format)"),
			end_time: z
				.string()
				.optional()
				.describe("New end time (ISO 8601 format)"),
			location: z
				.string()
				.optional()
				.describe("New event location"),
			status: z
				.enum(["confirmed", "cancelled", "tentative"])
				.optional()
				.describe("Event status"),
		},
		async ({ calendar_id, event_id, summary, description, start_time, end_time, location, status }) => {
			try {
				if (!oauth2Client.credentials.access_token && !oauth2Client.credentials.refresh_token) {
					return {
						content: [
							{
								type: "text",
								text: "❌ **Authentication Required**: Please authenticate first using `generate_oauth_url` and `exchange_auth_code` tools.",
							},
						],
					}
				}

				// First get the existing event
				const existingEvent = await calendar.events.get({
					calendarId: calendar_id,
					eventId: event_id,
				})

				const updateBody: calendar_v3.Schema$Event = { ...existingEvent.data }

				// Update only provided fields
				if (summary !== undefined) updateBody.summary = summary
				if (description !== undefined) updateBody.description = description
				if (location !== undefined) updateBody.location = location
				if (status !== undefined) updateBody.status = status

				if (start_time !== undefined) {
					updateBody.start = { dateTime: start_time }
				}
				if (end_time !== undefined) {
					updateBody.end = { dateTime: end_time }
				}

				const response = await calendar.events.update({
					calendarId: calendar_id,
					eventId: event_id,
					requestBody: updateBody,
				})

				const updatedEvent = response.data

				const markdown = `# ✅ Event Updated Successfully

## ${updatedEvent.summary}

### Updated Event Details
- **Event ID:** \`${updatedEvent.id}\`
- **Status:** ${updatedEvent.status}
- **Last Updated:** ${updatedEvent.updated ? new Date(updatedEvent.updated).toLocaleString() : "Just now"}

### Current Information
- **Start:** ${updatedEvent.start?.dateTime ? new Date(updatedEvent.start.dateTime).toLocaleString() : updatedEvent.start?.date}
- **End:** ${updatedEvent.end?.dateTime ? new Date(updatedEvent.end.dateTime).toLocaleString() : updatedEvent.end?.date}
${updatedEvent.location ? `- **Location:** ${updatedEvent.location}` : ""}
${updatedEvent.description ? `- **Description:** ${updatedEvent.description}` : ""}

### Links
- **[View in Google Calendar](${updatedEvent.htmlLink})**

---

**💡 Changes have been saved and will appear in Google Calendar immediately.`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error updating event: ${e.message}` }],
				}
			}
		},
	)

	// Tool: Delete Event
	server.tool(
		"delete_event",
		"Delete a calendar event",
		{
			calendar_id: z
				.string()
				.default("primary")
				.describe("Calendar ID containing the event"),
			event_id: z
				.string()
				.describe("Event ID to delete"),
		},
		async ({ calendar_id, event_id }) => {
			try {
				if (!oauth2Client.credentials.access_token && !oauth2Client.credentials.refresh_token) {
					return {
						content: [
							{
								type: "text",
								text: "❌ **Authentication Required**: Please authenticate first using `generate_oauth_url` and `exchange_auth_code` tools.",
							},
						],
					}
				}

				// Get event details before deletion for confirmation
				const eventDetails = await calendar.events.get({
					calendarId: calendar_id,
					eventId: event_id,
				})

				await calendar.events.delete({
					calendarId: calendar_id,
					eventId: event_id,
				})

				const deletedEvent = eventDetails.data

				const markdown = `# ✅ Event Deleted Successfully

## ${deletedEvent.summary || "Untitled Event"}

### Deleted Event Information
- **Event ID:** \`${event_id}\`
- **Calendar:** ${calendar_id}
- **Date/Time:** ${deletedEvent.start?.dateTime 
	? new Date(deletedEvent.start.dateTime).toLocaleString()
	: deletedEvent.start?.date || "Unknown"
}

### ⚠️ Important Notes
- This event has been permanently deleted
- All attendees will be notified of the cancellation
- This action cannot be undone

---

**💡 The event will no longer appear in Google Calendar for you or any attendees.`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error deleting event: ${e.message}` }],
				}
			}
		},
	)
} 