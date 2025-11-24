/**
 * Playwright Remote Execution Server
 * 
 * This server provides remote execution capabilities for Playwright browser automation.
 * It uses dnode for RPC communication.
 * 
 * Based on Playwright MCP (Model Context Protocol) but adapted for direct code execution
 * rather than MCP tool calls.
 * 
 * Usage:
 *   1. Build the Docker image: docker build -t playwright-server .
 *   2. Run the container: docker run -d -p 5004:5004 -e PASSWORD=your-password --name playwright-server playwright-server
 *   3. Configure the password in the environment variable
 */

const dnode = require('dnode');
const net = require('net');
const { chromium, firefox, webkit } = require('playwright');

// Configuration
const PORT = process.env.PORT || 5004;
const PASSWORD = process.env.PASSWORD || 'default-password-change-me';

// Store active browser instances (for cleanup on shutdown)
const browsers = new Map();

/**
 * Remote execution service
 */
const service = {
	/**
	 * Execute Playwright code remotely
	 * @param {string} code - JavaScript code to execute
	 * @param {Array} inputs - Input data from n8n
	 * @param {Function} callback - Callback function
	 */
	async execute(code, inputs, callback) {
		try {
			// Create a safe execution context with Playwright available
			const safeRequire = (moduleName) => {
				if (moduleName === 'playwright') {
					return { chromium, firefox, webkit };
				}
				throw new Error(`Module '${moduleName}' is not allowed. Only 'playwright' is available.`);
			};

			// Wrap code in async function
			const asyncCode = `
				return (async function() {
					const { chromium, firefox, webkit } = require('playwright');
					${code}
				})();
			`;

			// Execute code in isolated context
			const func = new Function('require', 'inputs', asyncCode);
			const result = await func(safeRequire, inputs);

			callback(null, result);
		} catch (error) {
			callback(error.message || String(error), null);
		}
	},

	/**
	 * Health check
	 */
	health(callback) {
		callback(null, { status: 'ok', timestamp: new Date().toISOString() });
	},
};

/**
 * Create RPC server with authentication
 */
const server = net.createServer((socket) => {
	let authenticated = false;
	let buffer = '';
	let dnodeServer = null;

	socket.on('data', (data) => {
		if (!authenticated) {
			buffer += data.toString();
			if (buffer.includes('\n')) {
				const password = buffer.split('\n')[0].trim();
				if (password === PASSWORD) {
					authenticated = true;
					socket.write('OK\n');
					
					// After authentication, create dnode server for this connection
					dnodeServer = dnode(service);
					
					// Pipe dnode server to socket and vice versa
					dnodeServer.pipe(socket).pipe(dnodeServer);
					
					// Remove the 'data' listener for authentication
					socket.removeAllListeners('data');
					
					// The remaining data (if any) will be handled by dnode through the pipe
				} else {
					socket.write('AUTH_FAILED\n');
					socket.end();
				}
				buffer = '';
			}
		}
	});
	
	socket.on('end', () => {
		if (dnodeServer) {
			dnodeServer.end();
		}
	});
	
	socket.on('error', (error) => {
		console.error('Socket error:', error);
	});
});

/**
 * Start server
 */
server.listen(PORT, () => {
	console.log(`Playwright Remote Execution Server listening on port ${PORT}`);
	console.log(`Password: ${PASSWORD}`);
	console.log('Ready to accept connections');
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
	console.log('SIGTERM received, shutting down gracefully...');
	server.close(() => {
		// Close all browser instances
		for (const browser of browsers.values()) {
			browser.close().catch(console.error);
		}
		process.exit(0);
	});
});

process.on('SIGINT', () => {
	console.log('SIGINT received, shutting down gracefully...');
	server.close(() => {
		for (const browser of browsers.values()) {
			browser.close().catch(console.error);
		}
		process.exit(0);
	});
});
