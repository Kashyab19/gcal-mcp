#!/usr/bin/env node
import http from 'node:http'
import url from 'node:url'

const PORT = 8081

const server = http.createServer((req, res) => {
	const parsedUrl = url.parse(req.url || '', true)

	if (parsedUrl.pathname === '/oauth2callback') {
		const code = parsedUrl.query.code
		const error = parsedUrl.query.error

		if (error) {
			res.writeHead(400, { 'Content-Type': 'text/html' })
			res.end(`
        <html>
          <head><title>OAuth Error</title></head>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #d32f2f;">ERROR: OAuth Error</h1>
            <p><strong>Error:</strong> ${error}</p>
            <p>You can close this window and try again.</p>
            <p><small>This window will close automatically in 10 seconds...</small></p>
          </body>
        </html>
      `)
			console.error('ERROR: OAuth error:', error)
			setTimeout(() => process.exit(1), 10000)
			return
		}

		if (code) {
			res.writeHead(200, { 'Content-Type': 'text/html' })
			res.end(`
        <html>
          <head><title>OAuth Success</title></head>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #2e7d32;">SUCCESS: OAuth Success!</h1>
            <p><strong>Authorization code received:</strong></p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; word-break: break-all; font-family: monospace; border: 1px solid #ddd;">
              ${code}
            </div>
            <p><strong>Next steps:</strong></p>
            <ol>
              <li>Copy the authorization code above</li>
              <li>Use it with the <code>exchange_auth_code</code> tool in your MCP client</li>
              <li>You can close this window now</li>
            </ol>
            <p><small>This window will close automatically in 30 seconds...</small></p>
          </body>
        </html>
      `)
			console.log('SUCCESS: Authorization Code:', code)
			console.log('\nINFO: Next steps:')
			console.log('1. Copy the authorization code above')
			console.log('2. Use it with the exchange_auth_code tool in your MCP client')
			console.log('3. You can close this window now')
			setTimeout(() => process.exit(0), 30000)
		} else {
			res.writeHead(400, { 'Content-Type': 'text/html' })
			res.end(`
        <html>
          <head><title>OAuth Error</title></head>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #d32f2f;">ERROR: OAuth Error</h1>
            <p>No authorization code received</p>
            <p>You can close this window and try again.</p>
            <p><small>This window will close automatically in 10 seconds...</small></p>
          </body>
        </html>
      `)
			console.error('ERROR: No authorization code received')
			setTimeout(() => process.exit(1), 10000)
		}
	} else {
		res.writeHead(404, { 'Content-Type': 'text/plain' })
		res.end('Not Found')
	}
})

server.listen(PORT, 'localhost', () => {
	console.log(`OAuth callback server running on http://localhost:${PORT}`)
	console.log(`Waiting for OAuth callback at: http://localhost:${PORT}/oauth2callback`)
	console.log('\nTo test the OAuth flow:')
	console.log('1. Use the generate_oauth_url tool in your MCP client')
	console.log('2. Visit the generated URL in your browser')
	console.log('3. Authorize the application')
	console.log('4. The callback server will capture the code automatically')
	console.log('\nServer is ready and waiting...')
})

server.on('error', (err) => {
	if (err.code === 'EADDRINUSE') {
		console.error(
			`ERROR: Port ${PORT} is already in use. Please stop any other services using this port.`
		)
	} else {
		console.error('ERROR: Server error:', err)
	}
	process.exit(1)
})
