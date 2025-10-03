import { google } from 'googleapis'
import type { GoogleUserInfo } from './types.js'

export class GoogleAuthService {
	private oauth2Client: any
	private clientId: string
	private clientSecret: string
	private redirectUri: string

	constructor(clientId: string, clientSecret: string, redirectUri: string) {
		this.clientId = clientId
		this.clientSecret = clientSecret
		this.redirectUri = redirectUri
		this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
	}

	/**
	 * Generate Google OAuth authorization URL
	 */
	generateAuthUrl(state: string): string {
		const scopes = [
			'https://www.googleapis.com/auth/calendar',
			'https://www.googleapis.com/auth/calendar.events',
			'https://www.googleapis.com/auth/userinfo.email',
			'https://www.googleapis.com/auth/userinfo.profile',
		]

		return this.oauth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: scopes,
			state: state,
			prompt: 'consent', // Force consent screen to get refresh token
		})
	}

	/**
	 * Exchange authorization code for Google tokens
	 */
	async exchangeCodeForTokens(code: string): Promise<{
		access_token: string
		refresh_token?: string
		token_type: string
		expiry_date?: number
	}> {
		try {
			// Create a fresh OAuth client for each request to avoid credential conflicts
			const freshOAuth2Client = new google.auth.OAuth2(
				this.clientId,
				this.clientSecret,
				this.redirectUri
			)

			const { tokens } = await freshOAuth2Client.getToken(code)
			freshOAuth2Client.setCredentials(tokens)

			return {
				access_token: tokens.access_token!,
				refresh_token: tokens.refresh_token,
				token_type: tokens.token_type || 'Bearer',
				expiry_date: tokens.expiry_date,
			}
		} catch (error) {
			console.error('Google token exchange error:', error)
			throw new Error(`Failed to exchange authorization code: ${error}`)
		}
	}

	/**
	 * Get user information from Google
	 */
	async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
		try {
			// Create a fresh OAuth client for each request
			const freshOAuth2Client = new google.auth.OAuth2(
				this.clientId,
				this.clientSecret,
				this.redirectUri
			)

			freshOAuth2Client.setCredentials({ access_token: accessToken })
			const oauth2 = google.oauth2({ version: 'v2', auth: freshOAuth2Client })

			const response = await oauth2.userinfo.get()
			const userInfo = response.data

			return {
				id: userInfo.id!,
				email: userInfo.email!,
				name: userInfo.name!,
				picture: userInfo.picture,
				verified_email: userInfo.verified_email || false,
			}
		} catch (error) {
			console.error('Google user info error:', error)
			throw new Error(`Failed to get user info: ${error}`)
		}
	}

	/**
	 * Refresh Google access token
	 */
	async refreshAccessToken(
		refreshToken: string
	): Promise<{ access_token: string; expires_in: number }> {
		try {
			this.oauth2Client.setCredentials({ refresh_token: refreshToken })
			const { credentials } = await this.oauth2Client.refreshAccessToken()

			return {
				access_token: credentials.access_token!,
				expires_in: credentials.expiry_date
					? Math.floor((credentials.expiry_date - Date.now()) / 1000)
					: 3600,
			}
		} catch (error) {
			throw new Error(`Failed to refresh access token: ${error}`)
		}
	}
}
