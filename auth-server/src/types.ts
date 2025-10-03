export interface ClientRegistration {
	client_id: string
	client_name: string
	redirect_uris: string[]
	grant_types: string[]
	response_types: string[]
	scope: string
	created_at: Date
}

export interface AuthorizationRequest {
	client_id: string
	response_type: 'code'
	redirect_uri: string
	scope: string
	state: string
	code_challenge: string
	code_challenge_method: 'S256'
	resource: string
}

export interface TokenRequest {
	grant_type: 'authorization_code' | 'refresh_token'
	code?: string
	redirect_uri?: string
	client_id: string
	code_verifier?: string
	refresh_token?: string
	resource: string
}

export interface TokenResponse {
	access_token: string
	token_type: 'Bearer'
	expires_in: number
	refresh_token?: string
	scope: string
}

export interface JWTPayload {
	iss: string // issuer
	sub: string // subject (user ID)
	aud: string // audience (resource)
	exp: number // expiration
	iat: number // issued at
	scope: string
	client_id: string
	auth_time: number
}

export interface GoogleUserInfo {
	id: string
	email: string
	name: string
	picture?: string
	verified_email: boolean
}
