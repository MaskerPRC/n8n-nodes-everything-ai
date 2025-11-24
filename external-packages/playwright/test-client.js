/**
 * Test client for Playwright Remote Execution Server
 * This test uses the same connection method as the N8N node
 */

// Use dnode from project root to avoid weak module compilation issues
const path = require('path');
const projectRoot = path.resolve(__dirname, '../..');
const dnode = require(path.join(projectRoot, 'node_modules', 'dnode'));
const net = require('net');

// Configuration - same as N8N node would use
const SERVER_URL = process.env.SERVER_URL || 'tcp://localhost:5004';
const PASSWORD = process.env.PASSWORD || 'test-password-123';

function buildMetadata(label, options = {}) {
	return {
		workflowId: 'test-workflow',
		workflowName: 'Playwright Test Workflow',
		executionId: `${label}-${Date.now()}`,
		nodeId: `node-${label}`,
		nodeName: `Test ${label}`,
		keepInstance: options.keepInstance === true,
		browserInstanceId: options.browserInstanceId,
	};
}

/**
 * Execute code remotely using dnode RPC (same as N8N node)
 */
function executeRemote(serverUrl, password, code, inputs, metadata = {}) {
	return new Promise((resolve, reject) => {
		// Parse server URL
		const urlMatch = serverUrl.match(/^tcp:\/\/([^:]+):(\d+)$/);
		if (!urlMatch) {
			reject(new Error(`Invalid server URL format: ${serverUrl}. Expected format: tcp://host:port`));
			return;
		}

		const host = urlMatch[1];
		const port = parseInt(urlMatch[2], 10);

		console.log(`Connecting to ${host}:${port}...`);

		// Create TCP connection
		const stream = net.createConnection(port, host);

		// Handle connection errors
		stream.on('error', (error) => {
			reject(new Error(`Failed to connect to remote server: ${error.message}`));
		});

		// Authenticate
		stream.write(`${password}\n`);

		let authenticated = false;
		let authBuffer = '';

		// Create dnode client (before authentication)
		const d = dnode();
		
		// Handle remote method calls
		d.on('remote', (remote) => {
			console.log('Remote methods available:', Object.keys(remote));
			
			// Test health check first
			if (remote.health) {
				remote.health((error, result) => {
					if (error) {
						console.error('Health check failed:', error);
					} else {
						console.log('Health check result:', result);
					}
				});
			}

			// Call remote execute method with timeout
			console.log('Executing code...');
			const executeTimeout = setTimeout(() => {
				stream.end();
				reject(new Error('Execution timeout after 60 seconds'));
			}, 60000);

			remote.execute(code, inputs, metadata, (error, result) => {
				clearTimeout(executeTimeout);
				stream.end();
				if (error) {
					reject(new Error(`Remote execution failed: ${error}`));
				} else {
					resolve(result);
				}
			});
		});

		// Handle authentication response
		stream.on('data', (data) => {
			if (!authenticated) {
				authBuffer += data.toString();
				if (authBuffer.includes('\n')) {
					const response = authBuffer.split('\n')[0].trim();
					if (response === 'OK') {
						authenticated = true;
						console.log('Authentication successful!');
						
						// After authentication, pipe dnode through the stream
						// Remove the authentication data from buffer
						const remainingData = authBuffer.substring(authBuffer.indexOf('\n') + 1);
						authBuffer = '';
						
						// Pipe dnode through the stream
						d.pipe(stream).pipe(d);
						
						// If there's remaining data after authentication, feed it to dnode
						if (remainingData) {
							stream.unshift(Buffer.from(remainingData));
						}
					} else if (response === 'AUTH_FAILED') {
						stream.end();
						reject(new Error('Authentication failed: Invalid password'));
					}
				}
			}
		});

		// Handle connection close
		stream.on('close', () => {
			if (!authenticated) {
				reject(new Error('Connection closed before authentication'));
			}
		});

		// Timeout after 30 seconds
		setTimeout(() => {
			if (!authenticated) {
				stream.end();
				reject(new Error('Connection timeout'));
			}
		}, 30000);
	});
}

/**
 * Test 1: Simple test - just return a value (no browser)
 */
async function test1() {
	console.log('\n=== Test 1: Simple return value (no browser) ===');
	const code = `
		return { message: 'Hello from remote execution', timestamp: new Date().toISOString() };
	`;

	try {
		const startTime = Date.now();
		const result = await executeRemote(
			SERVER_URL,
			PASSWORD,
			code,
			[],
			buildMetadata('test1'),
		);
		const duration = Date.now() - startTime;
		console.log(`Test 1 Result (took ${duration}ms):`, JSON.stringify(result, null, 2));
	} catch (error) {
		console.error('Test 1 Error:', error.message);
	}
}

/**
 * Test 2: Simple Playwright code - get page title (with timeout)
 */
async function test2() {
	console.log('\n=== Test 2: Get page title (simple) ===');
	const code = `
		function ensureUrlProtocol(url) {
			if (!url) return url;
			url = url.trim();
			if (!url.startsWith('http://') && !url.startsWith('https://')) {
				return 'https://' + url;
			}
			return url;
		}

		const context = await browser.newContext();
		try {
			const page = await context.newPage();
			const url = ensureUrlProtocol('example.com');
			await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
			const title = await page.title();
			await page.close();
			return { title, success: true, instanceId: playwrightSession.instanceId || null };
		} catch (error) {
			throw error;
		} finally {
			await context.close();
		}
	`;

	try {
		const startTime = Date.now();
		const result = await executeRemote(
			SERVER_URL,
			PASSWORD,
			code,
			[],
			buildMetadata('test2'),
		);
		const duration = Date.now() - startTime;
		console.log(`Test 2 Result (took ${duration}ms):`, JSON.stringify(result, null, 2));
	} catch (error) {
		console.error('Test 2 Error:', error.message);
	}
}

/**
 * Test 3: Return n8n format output (simplified)
 */
async function test3() {
	console.log('\n=== Test 3: Return n8n format output ===');
	const code = `
		// Return in n8n format without browser
		return {
			output1: [
				{
					json: {
						message: 'Test from remote execution',
						timestamp: new Date().toISOString(),
						test: true
					}
				}
			]
		};
	`;

	try {
		const startTime = Date.now();
		const result = await executeRemote(
			SERVER_URL,
			PASSWORD,
			code,
			[],
			buildMetadata('test3'),
		);
		const duration = Date.now() - startTime;
		console.log(`Test 3 Result (took ${duration}ms):`, JSON.stringify(result, null, 2));
	} catch (error) {
		console.error('Test 3 Error:', error.message);
	}
}

/**
 * Run all tests
 */
async function runTests() {
	console.log('Starting Playwright Remote Execution Server Tests');
	console.log(`Server URL: ${SERVER_URL}`);
	console.log(`Password: ${PASSWORD.replace(/./g, '*')}`);
	
	// Wait a bit for server to be ready
	await new Promise(resolve => setTimeout(resolve, 2000));

	try {
		await test1();
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		await test2();
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		await test3();
		
		console.log('\n=== All tests completed ===');
	} catch (error) {
		console.error('Test suite error:', error);
		process.exit(1);
	}
}

// Run tests
runTests().catch(console.error);

