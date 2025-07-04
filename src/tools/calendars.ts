import { z } from "zod"
import type { calendar_v3 } from "googleapis"
import type { Auth } from "googleapis"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

function checkAuthentication(oauth2Client: Auth.OAuth2Client) {
	if (!oauth2Client.credentials.access_token && !oauth2Client.credentials.refresh_token) {
		throw new Error("Authentication required. Please authenticate first using `generate_oauth_url` and `exchange_auth_code` tools.")
	}
}

export function registerCalendarTools(
	server: McpServer,
	calendar: calendar_v3.Calendar,
	oauth2Client: Auth.OAuth2Client,
) {
	// Tool: List Calendars
	server.tool(
		"list_calendars",
		"List all calendars accessible to the authenticated user",
		{
			show_hidden: z
				.boolean()
				.optional()
				.default(false)
				.describe("Whether to show hidden calendars"),
		},
		async ({ show_hidden }) => {
			try {
				// Check authentication only when tool is invoked
				checkAuthentication(oauth2Client)

				const response = await calendar.calendarList.list({
					showHidden: show_hidden,
				})

				const calendars = response.data.items || []

				if (calendars.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "📅 **No calendars found**\n\nThe authenticated user has no accessible calendars.",
							},
						],
					}
				}

				let markdown = `# 📅 User Calendars (${calendars.length} found)\n\n`

				calendars.forEach((cal, index) => {
					const isPrimary = cal.primary ? " 🌟 **Primary**" : ""
					const access = cal.accessRole
						? ` | **Access:** ${cal.accessRole}`
						: ""
					const hidden = cal.hidden ? " | ⛔ **Hidden**" : ""

					markdown += `## ${index + 1}. ${cal.summary || "Untitled Calendar"}${isPrimary}\n\n`
					markdown += `- **ID:** \`${cal.id}\`\n`
					markdown += `- **Description:** ${cal.description || "No description"}\n`
					markdown += `- **Timezone:** ${cal.timeZone || "Unknown"}\n`
					markdown += `- **Color:** ${cal.colorId ? `Color ID ${cal.colorId}` : "Default"}${access}${hidden}\n`

					if (cal.defaultReminders && cal.defaultReminders.length > 0) {
						markdown += `- **Default Reminders:**\n`
						cal.defaultReminders.forEach(reminder => {
							markdown += `  - ${reminder.method}: ${reminder.minutes} minutes before\n`
						})
					}

					markdown += `\n`
				})

				markdown += `---\n\n**💡 Tip:** Use the calendar ID with event tools to manage events in specific calendars.`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error listing calendars: ${e.message}` }],
				}
			}
		},
	)

	// Tool: Get Calendar Details
	server.tool(
		"get_calendar",
		"Get detailed information about a specific calendar",
		{
			calendar_id: z
				.string()
				.describe("Calendar ID (use 'primary' for user's primary calendar)"),
		},
		async ({ calendar_id }) => {
			try {
				// Check authentication only when tool is invoked
				checkAuthentication(oauth2Client)

				const response = await calendar.calendars.get({
					calendarId: calendar_id,
				})

				const cal = response.data

				const markdown = `# 📅 Calendar Details

## ${cal.summary || "Untitled Calendar"}

### Basic Information
- **Calendar ID:** \`${cal.id}\`
- **Description:** ${cal.description || "No description"}
- **Location:** ${cal.location || "Not specified"}
- **Timezone:** ${cal.timeZone || "Unknown"}

### Configuration
- **Conference Properties:** ${cal.conferenceProperties?.allowedConferenceSolutionTypes?.length ? cal.conferenceProperties.allowedConferenceSolutionTypes.join(", ") : "None configured"}

### Links
- **ETag:** \`${cal.etag}\`
- **Kind:** ${cal.kind}

---

**💡 Use this calendar ID (\`${cal.id}\`) with event management tools to create, read, update, or delete events.**`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error getting calendar details: ${e.message}` }],
				}
			}
		},
	)

	// Tool: Create Calendar
	server.tool(
		"create_calendar",
		"Create a new calendar",
		{
			summary: z.string().describe("Calendar name/title"),
			description: z
				.string()
				.optional()
				.describe("Calendar description"),
			location: z
				.string()
				.optional()
				.describe("Calendar location"),
			timezone: z
				.string()
				.optional()
				.describe("Calendar timezone (e.g., 'America/New_York')"),
		},
		async ({ summary, description, location, timezone }) => {
			try {
				// Check authentication only when tool is invoked
				checkAuthentication(oauth2Client)

				const response = await calendar.calendars.insert({
					requestBody: {
						summary,
						description,
						location,
						timeZone: timezone,
					},
				})

				const newCalendar = response.data

				const markdown = `# ✅ Calendar Created Successfully

## ${newCalendar.summary}

### Details
- **Calendar ID:** \`${newCalendar.id}\`
- **Description:** ${newCalendar.description || "No description"}
- **Location:** ${newCalendar.location || "Not specified"}
- **Timezone:** ${newCalendar.timeZone || "Default"}

### Next Steps
- Use calendar ID \`${newCalendar.id}\` to manage events in this calendar
- The calendar should now appear in your Google Calendar interface
- You can set permissions using Google Calendar sharing settings

---

**💡 Tip:** Save the calendar ID for future reference when creating events.`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error creating calendar: ${e.message}` }],
				}
			}
		},
	)

	// Tool: Delete Calendar
	server.tool(
		"delete_calendar",
		"Delete a calendar (WARNING: This will delete all events in the calendar)",
		{
			calendar_id: z
				.string()
				.describe("Calendar ID to delete (cannot delete primary calendar)"),
		},
		async ({ calendar_id }) => {
			try {
				// Check authentication only when tool is invoked
				checkAuthentication(oauth2Client)

				if (calendar_id === "primary") {
					return {
						content: [
							{
								type: "text",
								text: "❌ **Error**: Cannot delete the primary calendar. You can only delete secondary calendars you've created.",
							},
						],
					}
				}

				await calendar.calendars.delete({
					calendarId: calendar_id,
				})

				const markdown = `# ✅ Calendar Deleted Successfully

The calendar with ID \`${calendar_id}\` has been permanently deleted.

## ⚠️ Important Notes
- All events in this calendar have been permanently deleted
- This action cannot be undone
- The calendar will no longer appear in your Google Calendar interface

---

**💡 Tip:** Use \`list_calendars\` to verify the calendar has been removed.`

				return {
					content: [{ type: "text", text: markdown }],
				}
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error deleting calendar: ${e.message}` }],
				}
			}
		},
	)
} 