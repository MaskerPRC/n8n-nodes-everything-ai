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
// Each instance contains: browser, contexts (if keepContext), pages (if keepPage)
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
			// keepPage defaults to keepContext (if keepPage is true, keepContext is also true)
			const keepPage = metadata.keepPage === true;
			const keepContext = metadata.keepContext === true || keepPage;
			
			const executionContext = {
				workflowId: metadata.workflowId || 'unknown-workflow',
				workflowName: metadata.workflowName || '',
				executionId: metadata.executionId || randomUUID(),
				nodeId: metadata.nodeId || '',
				nodeName: metadata.nodeName || '',
				keepContext: keepContext,
				keepPage: keepPage,
				autoScreenshot: metadata.autoScreenshot === true,
			};

			let activeInstanceId = null;
			let browserRecord = null;
			let createdNewInstance = false;
			let shouldCloseAfterExecution = false;

			// Auto-find instance by workflowId and executionId
			// This allows nodes in the same workflow execution to automatically share browser instances
			for (const [instanceId, record] of browserInstances.entries()) {
				if (record.workflowId === executionContext.workflowId && 
					record.executionId === executionContext.executionId &&
					record.browser?.isConnected()) {
					activeInstanceId = instanceId;
					browserRecord = record;
					console.log(`Found existing browser instance ${activeInstanceId} for workflow ${executionContext.workflowId}, execution ${executionContext.executionId}`);
					break;
				}
			}
			
			// If no existing instance found, create a new one
			if (!browserRecord) {
				console.log('Launching new Playwright browser instance...');
				const browser = await chromium.launch({ headless: true });
				browserRecord = {
					browser,
					createdAt: Date.now(),
					workflowId: executionContext.workflowId,
					executionId: executionContext.executionId,
					keepContext: executionContext.keepContext,
					keepPage: executionContext.keepPage,
				};
				createdNewInstance = true;
				if (executionContext.keepContext) {
					activeInstanceId = randomUUID();
					browserInstances.set(activeInstanceId, browserRecord);
					console.log(`Created persistent browser instance ${activeInstanceId} (keepContext=${executionContext.keepContext}, keepPage=${executionContext.keepPage})`);
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
			
			// List of Node.js built-in modules (core modules)
			const builtInModules = [
				'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
				'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http',
				'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
				'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
				'string_decoder', 'timers', 'tls', 'trace_events', 'tty', 'url', 'util',
				'v8', 'vm', 'worker_threads', 'zlib'
			];
			
			const safeRequire = (moduleName) => {
				// Allow playwright module
				if (moduleName === 'playwright') {
					return playwrightModule;
				}
				
				// Allow all Node.js built-in modules
				if (builtInModules.includes(moduleName)) {
					return require(moduleName);
				}
				
				// Block all other modules (npm packages, local files, etc.)
				throw new Error(`Module '${moduleName}' is not allowed. Only Node.js built-in modules and 'playwright' are available.`);
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
					keepContext: executionContext.keepContext,
					keepPage: executionContext.keepPage,
					reused: !createdNewInstance,
				},
			};
			const result = await func(safeRequire, inputs, environment);
			console.log('Code executed successfully, result:', typeof result);

			// Auto-screenshot: Take screenshots of all open pages if enabled
			if (executionContext.autoScreenshot && browserRecord.browser && browserRecord.browser.isConnected()) {
				try {
					const contexts = browserRecord.browser.contexts();
					const screenshots = [];
					
					for (const context of contexts) {
						const pages = context.pages();
						for (let i = 0; i < pages.length; i++) {
							const page = pages[i];
							try {
								const buffer = await page.screenshot({ fullPage: true });
								const base64 = buffer.toString('base64');
								screenshots.push({
									contextIndex: contexts.indexOf(context),
									pageIndex: i,
									url: page.url(),
									data: base64,
								});
							} catch (screenshotError) {
								console.error(`Failed to screenshot page ${i} in context ${contexts.indexOf(context)}:`, screenshotError);
							}
						}
					}
					
					// Add screenshots to result if any were taken
					if (screenshots.length > 0) {
						if (!result || typeof result !== 'object') {
							result = {};
						}
						
						// Ensure result has output structure
						if (!result.output1 && !result.A) {
							result.A = [];
						}
						
						const outputKey = result.A ? 'A' : 'output1';
						if (!result[outputKey] || !Array.isArray(result[outputKey])) {
							result[outputKey] = [];
						}
						
						// Add screenshot to first output item, or create new item
						let outputItem = result[outputKey][0];
						if (!outputItem) {
							outputItem = { json: {}, binary: {} };
							result[outputKey].push(outputItem);
						}
						
						if (!outputItem.binary) {
							outputItem.binary = {};
						}
						
						// Add screenshots to binary data
						if (screenshots.length === 1) {
							// Single screenshot: use simple key
							outputItem.binary.screenshot = {
								data: screenshots[0].data,
								mimeType: 'image/png',
								fileExtension: 'png',
								fileName: 'screenshot.png',
							};
							if (outputItem.json) {
								outputItem.json.screenshotUrl = screenshots[0].url;
							}
						} else {
							// Multiple screenshots: use indexed keys
							for (let i = 0; i < screenshots.length; i++) {
								const screenshot = screenshots[i];
								outputItem.binary[`screenshot_${i}`] = {
									data: screenshot.data,
									mimeType: 'image/png',
									fileExtension: 'png',
									fileName: `screenshot_${i}.png`,
								};
							}
							if (outputItem.json) {
								outputItem.json.screenshotCount = screenshots.length;
								outputItem.json.screenshotUrls = screenshots.map(s => s.url);
							}
						}
						
						console.log(`Auto-screenshot: Captured ${screenshots.length} screenshot(s)`);
					}
				} catch (autoScreenshotError) {
					console.error('Auto-screenshot failed:', autoScreenshotError);
					// Don't fail the execution if screenshot fails
				}
			}

			// Manage context and page lifecycle based on keepContext and keepPage settings
			if (browserRecord.browser && browserRecord.browser.isConnected()) {
				const contexts = browserRecord.browser.contexts();
				
				if (!executionContext.keepContext) {
					// Close all contexts (this will close all pages)
					for (const context of contexts) {
						try {
							await context.close();
							console.log(`Closed context (keepContext=false)`);
						} catch (error) {
							console.error('Failed to close context:', error);
						}
					}
					// Close browser
					await browserRecord.browser.close().catch((error) => {
						console.error('Failed to close browser after execution:', error);
					});
					// Remove from Map if instance exists
					if (activeInstanceId) {
						browserInstances.delete(activeInstanceId);
						console.log(`Browser instance ${activeInstanceId} closed and removed (keepContext=false)`);
						activeInstanceId = undefined;
					}
				} else if (!executionContext.keepPage) {
					// Keep context but close all pages
					for (const context of contexts) {
						const pages = context.pages();
						for (const page of pages) {
							try {
								await page.close();
								console.log(`Closed page (keepPage=false, keepContext=true)`);
							} catch (error) {
								console.error('Failed to close page:', error);
							}
						}
					}
				} else {
					// keepPage=true: keep both context and pages
					console.log(`Keeping context and pages (keepPage=true, keepContext=true)`);
				}
			}
			
			if (shouldCloseAfterExecution && (!executionContext.keepContext)) {
				// Fallback: close if shouldCloseAfterExecution is true (for newly created instances without keepContext)
				if (browserRecord.browser && browserRecord.browser.isConnected()) {
					await browserRecord.browser.close().catch((error) => {
						console.error('Failed to close browser after execution:', error);
					});
				}
			}

			let responsePayload = result;
			if (!responsePayload || typeof responsePayload !== 'object') {
				responsePayload = { output1: [], __rawResult: responsePayload };
			}

			// Only return instance ID if keepContext is true (browser/context stays alive)
			// If keepContext is false, browser is closed, so don't return instance ID
			const instanceIdToReturn = executionContext.keepContext ? activeInstanceId : undefined;
			if (instanceIdToReturn && typeof responsePayload === 'object') {
				responsePayload.__playwrightInstanceId = instanceIdToReturn;
			}

			callback(null, responsePayload);
		} catch (error) {
			console.error('Execution error:', error);
			// Close browser/context/page if keepContext is false (regardless of whether instance was reused or newly created)
			if (!executionContext.keepContext) {
				if (browserRecord && browserRecord.browser && browserRecord.browser.isConnected()) {
					// Close all contexts first
					const contexts = browserRecord.browser.contexts();
					for (const context of contexts) {
						try {
							await context.close();
						} catch (closeError) {
							console.error('Failed to close context after error:', closeError);
						}
					}
					// Then close browser
					browserRecord.browser.close().catch((closeError) => {
						console.error('Failed to close browser after error:', closeError);
					});
				}
				// Remove from Map if instance exists
				if (activeInstanceId) {
					browserInstances.delete(activeInstanceId);
					console.log(`Browser instance ${activeInstanceId} closed and removed after error (keepContext=false)`);
				}
			} else if (!executionContext.keepPage) {
				// Keep context but close pages on error
				if (browserRecord && browserRecord.browser && browserRecord.browser.isConnected()) {
					const contexts = browserRecord.browser.contexts();
					for (const context of contexts) {
						const pages = context.pages();
						for (const page of pages) {
							try {
								await page.close();
							} catch (closeError) {
								console.error('Failed to close page after error:', closeError);
							}
						}
					}
				}
			}
			if (createdNewInstance && activeInstanceId && !executionContext.keepContext) {
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
