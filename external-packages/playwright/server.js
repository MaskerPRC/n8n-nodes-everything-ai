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
const { randomUUID } = require('crypto');
const { chromium } = require('playwright');

// Configuration
const PORT = process.env.PORT || 5004;
const PASSWORD = process.env.PASSWORD || 'default-password-change-me';

// Store active browser instances (for cleanup on shutdown)
const browserInstances = new Map();

function cleanupBrowserInstance(instanceId, reason) {
	const instance = browserInstances.get(instanceId);
	if (instance) {
		browserInstances.delete(instanceId);
		if (instance.browser && instance.browser.isConnected()) {
			instance.browser.close().catch((error) => {
				console.error(`Failed to close browser for instance ${instanceId}:`, error);
			});
		}
	}
	if (reason) {
		console.log(`Browser instance ${instanceId} removed: ${reason}`);
	}
}

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
	async execute(code, inputs, metadataOrCallback, maybeCallback) {
		let metadata = {};
		let callback = maybeCallback;
		if (typeof metadataOrCallback === 'function') {
			callback = metadataOrCallback;
		} else if (metadataOrCallback && typeof metadataOrCallback === 'object') {
			metadata = metadataOrCallback;
		}

		if (typeof callback !== 'function') {
			throw new Error('Callback function is required');
		}

		console.log('Execute called with code length:', code.length);
		try {
			const executionContext = {
				workflowId: metadata.workflowId || 'unknown-workflow',
				workflowName: metadata.workflowName || '',
				executionId: metadata.executionId || randomUUID(),
				nodeId: metadata.nodeId || '',
				nodeName: metadata.nodeName || '',
				keepInstance: metadata.keepInstance === true,
				requestedInstanceId:
					typeof metadata.browserInstanceId === 'string' && metadata.browserInstanceId.trim() !== ''
						? metadata.browserInstanceId.trim()
						: undefined,
			};

			let activeInstanceId = executionContext.requestedInstanceId;
			let browserRecord;
			let createdNewInstance = false;
			let shouldCloseAfterExecution = false;

			if (activeInstanceId) {
				browserRecord = browserInstances.get(activeInstanceId);
				if (!browserRecord || !browserRecord.browser?.isConnected()) {
					if (browserRecord) {
						browserInstances.delete(activeInstanceId);
					}
					callback(`Browser instance '${activeInstanceId}' not found or already closed`, null);
					return;
				}
			} else {
				console.log('Launching new Playwright browser instance...');
				const browser = await chromium.launch({ headless: true });
				browserRecord = {
					browser,
					createdAt: Date.now(),
					workflowId: executionContext.workflowId,
					executionId: executionContext.executionId,
				};
				createdNewInstance = true;
				if (executionContext.keepInstance) {
					activeInstanceId = randomUUID();
					browserInstances.set(activeInstanceId, browserRecord);
					console.log(`Created persistent browser instance ${activeInstanceId}`);
				} else {
					shouldCloseAfterExecution = true;
				}
			}

			if (!browserRecord || !browserRecord.browser) {
				callback('Failed to obtain browser instance', null);
				return;
			}

			// Create a safe execution context with Playwright available
			// Return playwright object with chromium property
			const playwrightModule = { chromium };
			const safeRequire = (moduleName) => {
				if (moduleName === 'playwright') {
					return playwrightModule;
				}
				throw new Error(`Module '${moduleName}' is not allowed. Only 'playwright' is available.`);
			};

			// Wrap code in async function
			// A Playwright browser instance is injected via environment.browser
			const asyncCode = `
				return (async function() {
					const browser = environment.browser;
					const playwrightSession = environment.session;
					${code}
				})();
			`;

			// Execute code in isolated context
			console.log('Executing code...');
			const func = new Function('require', 'inputs', 'environment', asyncCode);
			const environment = {
				browser: browserRecord.browser,
				session: {
					instanceId: activeInstanceId,
					workflowId: executionContext.workflowId,
					workflowName: executionContext.workflowName,
					executionId: executionContext.executionId,
					nodeId: executionContext.nodeId,
					nodeName: executionContext.nodeName,
					keepInstance: executionContext.keepInstance,
					reused: Boolean(executionContext.requestedInstanceId),
				},
			};
			const result = await func(safeRequire, inputs, environment);
			console.log('Code executed successfully, result:', typeof result);

			if (shouldCloseAfterExecution) {
				await browserRecord.browser.close().catch((error) => {
					console.error('Failed to close browser after execution:', error);
				});
			}

			if (!executionContext.keepInstance && createdNewInstance && activeInstanceId) {
				browserInstances.delete(activeInstanceId);
				activeInstanceId = undefined;
			}

			let responsePayload = result;
			if (!responsePayload || typeof responsePayload !== 'object') {
				responsePayload = { output1: [], __rawResult: responsePayload };
			}

			const instanceIdToReturn = executionContext.keepInstance
				? activeInstanceId
				: executionContext.requestedInstanceId;
			if (instanceIdToReturn && typeof responsePayload === 'object') {
				responsePayload.__playwrightInstanceId = instanceIdToReturn;
			}

			callback(null, responsePayload);
		} catch (error) {
			console.error('Execution error:', error);
			if (browserRecord && browserRecord.browser && browserRecord.browser.isConnected()) {
				if (!executionContext.requestedInstanceId || createdNewInstance) {
					browserRecord.browser.close().catch((closeError) => {
						console.error('Failed to close browser after error:', closeError);
					});
				}
			}
			if (createdNewInstance && activeInstanceId) {
				browserInstances.delete(activeInstanceId);
			}
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
				console.log('Received password attempt');
				if (password === PASSWORD) {
					authenticated = true;
					console.log('Authentication successful, setting up dnode');
					socket.write('OK\n');
					
					// After authentication, create dnode server for this connection
					dnodeServer = dnode(service);
					
					// Remove the 'data' listener for authentication BEFORE piping
					socket.removeAllListeners('data');
					
					// Pipe dnode server to socket and vice versa
					dnodeServer.pipe(socket).pipe(dnodeServer);
					
					// The remaining data (if any) will be handled by dnode through the pipe
					const remainingData = buffer.substring(buffer.indexOf('\n') + 1);
					if (remainingData) {
						// Feed remaining data to dnode
						socket.unshift(Buffer.from(remainingData));
					}
					buffer = '';
				} else {
					console.log('Authentication failed');
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
		for (const instanceId of browserInstances.keys()) {
			cleanupBrowserInstance(instanceId, 'Shutdown');
		}
		process.exit(0);
	});
});

process.on('SIGINT', () => {
	console.log('SIGINT received, shutting down gracefully...');
	server.close(() => {
		for (const instanceId of browserInstances.keys()) {
			cleanupBrowserInstance(instanceId, 'Shutdown');
		}
		process.exit(0);
	});
});
