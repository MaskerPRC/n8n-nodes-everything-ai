import type { INodeExecutionData } from 'n8n-workflow';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = require('net');

// Mock weak module before loading dnode
// weak 是 dnode 的可选依赖，用于弱引用（内存管理）
// 对于我们的 RPC 场景，弱引用不是必需的，直接 mock 即可

// 使用 Module._load 在更早的阶段拦截 weak 模块加载
const Module = require('module');
const originalLoad = Module._load;

interface PlaywrightExecutionMetadata {
	workflowId?: string;
	workflowName?: string;
	executionId?: string;
	nodeId?: string;
	nodeName?: string;
	keepInstance?: boolean;
	browserInstanceId?: string;
	autoScreenshot?: boolean;
}

// 简单的 weak mock：返回一个函数，返回对象本身（不实现真正的弱引用）
const weakMock = function(obj: unknown) {
	return {
		get: function() {
			return obj;
		}
	};
};

// 在模块加载阶段拦截 weak
Module._load = function(request: string, parent: any) {
	if (request === 'weak') {
		// 先尝试加载 weak-napi（如果已安装），否则使用 mock
		try {
			return require('weak-napi');
		} catch {
			// 返回 mock 模块
			const mockModule = { exports: weakMock };
			return mockModule.exports;
		}
	}
	return originalLoad.apply(this, arguments);
};

// 加载 dnode（此时 weak 已经被 mock）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dnode = require('dnode');

/**
 * Execute code remotely using dnode RPC
 * @param serverUrl - Server URL (e.g., tcp://localhost:5004)
 * @param password - Authentication password
 * @param code - JavaScript code to execute
 * @param inputs - Input data from n8n
 * @returns Promise with execution result
 */
export async function executeRemote(
	serverUrl: string,
	password: string,
	code: string,
	inputs: INodeExecutionData[][],
	metadata?: PlaywrightExecutionMetadata,
): Promise<Record<string, INodeExecutionData[]>> {
	return new Promise((resolve, reject) => {
		// Parse server URL
		const urlMatch = serverUrl.match(/^tcp:\/\/([^:]+):(\d+)$/);
		if (!urlMatch) {
			reject(new Error(`Invalid server URL format: ${serverUrl}. Expected format: tcp://host:port`));
			return;
		}

		const host = urlMatch[1];
		const port = parseInt(urlMatch[2], 10);

		// Create TCP connection
		const stream = net.createConnection(port, host);

		// Handle connection errors
		stream.on('error', (error: Error) => {
			reject(new Error(`Failed to connect to remote server: ${error.message}`));
		});

		// Authenticate
		stream.write(`${password}\n`);

		let authenticated = false;
		let authBuffer = '';

		// Create dnode client (before authentication)
		const d = dnode();
		
		// Handle remote method calls
		d.on('remote', (remote: {
			execute: (
				code: string,
				inputs: INodeExecutionData[][],
				metadata: PlaywrightExecutionMetadata,
				callback: (error: unknown, result: unknown) => void,
			) => void;
		}) => {
			// Call remote execute method
			remote.execute(code, inputs, metadata || {}, (error: unknown, result: unknown) => {
				stream.end();
				if (error) {
					reject(new Error(`Remote execution failed: ${error}`));
				} else {
					resolve(result as Record<string, INodeExecutionData[]>);
				}
			});
		});

		// Handle authentication response
		stream.on('data', (data: Buffer) => {
			if (!authenticated) {
				authBuffer += data.toString();
				if (authBuffer.includes('\n')) {
					const response = authBuffer.split('\n')[0].trim();
					if (response === 'OK') {
						authenticated = true;
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

