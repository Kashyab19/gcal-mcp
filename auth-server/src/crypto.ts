import crypto from 'crypto'
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose'

export class CryptoService {
	private privateKey: any
	private publicKey: any

	constructor() {
		// Generate RSA key pair for JWT signing using jose
		this.generateKeys()
	}

	private async generateKeys() {
		const { publicKey, privateKey } = await generateKeyPair('RS256')
		this.privateKey = privateKey
		this.publicKey = publicKey
	}

	/**
	 * Generate PKCE code verifier and challenge
	 */
	generatePKCE(): { code_verifier: string; code_challenge: string } {
		const code_verifier = crypto.randomBytes(96).toString('base64url').slice(0, 128)

		const code_challenge = crypto.createHash('sha256').update(code_verifier).digest('base64url')

		return { code_verifier, code_challenge }
	}

	/**
	 * Verify PKCE code challenge
	 */
	verifyPKCE(code_verifier: string, code_challenge: string): boolean {
		const computed_challenge = crypto.createHash('sha256').update(code_verifier).digest('base64url')

		return computed_challenge === code_challenge
	}

	/**
	 * Generate random state parameter
	 */
	generateState(): string {
		return crypto.randomBytes(32).toString('base64url')
	}

	/**
	 * Generate client ID
	 */
	generateClientId(): string {
		return crypto.randomBytes(16).toString('hex')
	}

	/**
	 * Sign JWT token
	 */
	async signJWT(payload: any): Promise<string> {
		if (!this.privateKey) {
			await this.generateKeys()
		}

		return await new SignJWT(payload)
			.setProtectedHeader({ alg: 'RS256' })
			.setIssuedAt()
			.setExpirationTime('1h')
			.sign(this.privateKey)
	}

	/**
	 * Verify JWT token
	 */
	async verifyJWT(token: string): Promise<any> {
		if (!this.publicKey) {
			await this.generateKeys()
		}

		const { payload } = await jwtVerify(token, this.publicKey)
		return payload
	}

	/**
	 * Get public key for JWKS endpoint
	 */
	async getPublicKeyJWK(): Promise<any> {
		if (!this.publicKey) {
			await this.generateKeys()
		}

		return await exportJWK(this.publicKey)
	}
}
