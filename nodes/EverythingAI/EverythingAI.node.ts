import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
// Import Node.js built-in modules that can be used in generated code
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as url from 'url';
import * as querystring from 'querystring';
import * as buffer from 'buffer';
import * as stream from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as util from 'util';
import * as zlib from 'zlib';
import * as events from 'events';
import * as child_process from 'child_process';
import * as cluster from 'cluster';
import * as dgram from 'dgram';
import * as dns from 'dns';
import * as net from 'net';
import * as readline from 'readline';
import * as repl from 'repl';
import * as string_decoder from 'string_decoder';
import * as timers from 'timers';
import * as tls from 'tls';
import * as tty from 'tty';
import * as vm from 'vm';
import * as worker_threads from 'worker_threads';
import {
	isNodePrepared,
	saveGeneratedCode,
	loadGeneratedCode,
	loadMeta,
	resetNode,
	extractInputStructures,
	configuredInputs,
	configuredOutputs,
} from './shared/utils';
import { generateCodeWithLLM } from './shared/llm';

export class EverythingAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Everything AI',
		name: 'everythingAi',
		icon: { light: 'file:../../icons/brain.svg', dark: 'file:../../icons/brain.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Multi-input, multi-output, natural language-driven AI node',
		usableAsTool: true,
		defaults: {
			name: 'Everything AI',
		},
		// Use expressions to dynamically configure input/output ports
		// Reference the implementation of n8n Merge node
		// @ts-ignore - Expression strings will be parsed by n8n at runtime
		inputs: `={{(${configuredInputs})($parameter)}}`,
		// @ts-ignore
		outputs: `={{(${configuredOutputs})($parameter)}}`,
		credentials: [
			{
				name: 'openAIApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Number of Inputs',
				name: 'numberInputs',
				type: 'options',
				noDataExpression: true,
				default: 1,
				options: Array.from({ length: 10 }, (_, i) => ({
					name: String(i + 1),
					value: i + 1,
				})),
				validateType: 'number',
				description: 'Select the number of input ports (1-10). After modifying this value, the node will dynamically display the corresponding number of input ports.',
				required: true,
			},
			{
				displayName: 'Number of Outputs',
				name: 'numberOutputs',
				type: 'options',
				noDataExpression: true,
				default: 1,
				options: Array.from({ length: 10 }, (_, i) => ({
					name: String(i + 1),
					value: i + 1,
				})),
				validateType: 'number',
				description: 'Select the number of output ports (1-10). After modifying this value, the node will dynamically display the corresponding number of output ports.',
				required: true,
			},
			{
				displayName: 'Your Requirement',
				name: 'instruction',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder:
					'e.g., When status="paid" in input 1 data, send to output A, otherwise send to output B',
				description:
					'Describe your data processing requirements in natural language. Use numbers 1,2,3... to refer to inputs and uppercase letters A,B,C... to refer to outputs. If you need to modify the logic, just modify this requirement and the node will automatically regenerate the code.',
				required: true,
			},
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getModels',
				},
				default: '',
				description: 'Select the LLM model to use (dynamically loaded from API). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				required: true,
			},
			{
				displayName: 'Custom Model Name',
				name: 'customModel',
				type: 'string',
				default: '',
				description: 'When "Custom" model is selected, enter the model name here',
				displayOptions: {
					show: {
						model: ['custom'],
					},
				},
				required: true,
			},
			{
				displayName: 'Advanced Settings',
				name: 'advanced',
				type: 'collection',
				placeholder: 'Add Advanced Settings',
				default: {},
				options: [
					{
						displayName: 'Custom Prompt Template',
						name: 'customPrompt',
						type: 'string',
						typeOptions: {
							rows: 6,
						},
						default: '',
						description:
							'Custom system prompt template. Leave empty to use the default template. You can use {{instruction}}, {{inputCount}}, {{outputCount}} as placeholders.',
					},
					{
						displayName: 'Force Reset Node',
						name: 'reset',
						type: 'boolean',
						default: false,
						description: 'Whether to force reset the node and clear generated code. Note: The node will automatically reset and regenerate code when the instruction, input count, or output count changes. Use this option only if you want to force a reset without changing any configuration.',
					},
					{
						displayName: 'Enable Security Check',
						name: 'enableSecurityCheck',
						type: 'boolean',
						default: true,
						description: 'When enabled, the node will reject code generation requests that contain dangerous operations such as file deletion, directory deletion, system file operations, or other potentially harmful write/delete operations. Read operations are allowed.',
					},
					{
						displayName: 'Edit Mode',
						name: 'edit',
						type: 'boolean',
						default: false,
						description: 'When enabled, the node will include previously generated code in the context when regenerating, allowing the LLM to modify existing code instead of generating from scratch. When disabled, code is generated completely from scratch.',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					// Get credentials
					const credentials = await this.getCredentials('openAIApi');
					const apiBaseUrl = (credentials.apiBaseUrl as string) || 'https://api.openai.com/v1';
					const apiKey = credentials.apiKey as string;

					if (!apiKey) {
						return [
							{
								name: 'Please configure API Key first',
								value: '',
							},
						];
					}

					// Call OpenAI-format /models API
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${apiBaseUrl}/models`,
						headers: {
							Authorization: `Bearer ${apiKey}`,
						},
					});

					// Parse model list
					const models: INodePropertyOptions[] = [];
					// OpenAI API response format may be { data: [...] } or directly an array
					const modelList = Array.isArray(response) ? response : response.data || [];

					if (Array.isArray(modelList) && modelList.length > 0) {
						// Filter chat models (usually starting with gpt- or claude-, or containing chat/instruct)
						const chatModels = modelList
							.filter((model: { id: string }) => {
								if (!model || !model.id) return false;
								const id = model.id.toLowerCase();
								return (
									id.startsWith('gpt-') ||
									id.startsWith('claude-') ||
									id.includes('chat') ||
									id.includes('instruct') ||
									id.includes('completion')
								);
							})
							.map((model: { id: string; created?: number }) => ({
								name: model.id,
								value: model.id,
								description: `Model ID: ${model.id}`,
							}))
							.sort((a, b) => a.name.localeCompare(b.name));

						models.push(...chatModels);
					}

					// If no models found, return default option
					if (models.length === 0) {
						return [
							{
								name: 'gpt-4o-mini',
								value: 'gpt-4o-mini',
								description: 'Default model (API did not return model list)',
							},
						];
					}

					// Add custom option
					models.push({
						name: 'Custom',
						value: 'custom',
						description: 'Use custom model name',
					});

					return models;
				} catch (error: unknown) {
					// If API call fails, return default model list
					const errorMessage = error instanceof Error ? error.message : String(error);
					return [
						{
							name: `Load failed: ${errorMessage}`,
							value: '',
						},
						{
							name: 'Gpt-4o-Mini (Default)',
							value: 'gpt-4o-mini',
							description: 'Use default model',
						},
						{
							name: 'Custom',
							value: 'custom',
							description: 'Use custom model name',
						},
					];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const workflowId = this.getWorkflow().id || 'default';
		const nodeId = this.getNode().id;

		// Get configuration parameters
		const inputCount = this.getNodeParameter('numberInputs', 0) as number;
		const outputCount = this.getNodeParameter('numberOutputs', 0) as number;
		const instruction = this.getNodeParameter('instruction', 0) as string;
		const modelSelection = this.getNodeParameter('model', 0) as string;
		const customModel = this.getNodeParameter('customModel', 0, '') as string;
		const advanced = this.getNodeParameter('advanced', 0, {}) as {
			customPrompt?: string;
			reset?: boolean;
			enableSecurityCheck?: boolean;
			edit?: boolean;
		};
		const reset = advanced.reset || false;

		// Determine the model name to use
		// If no model is selected (empty string), use default value gpt-4o-mini
		let model = modelSelection;
		if (!model || model === '') {
			model = 'gpt-4o-mini';
		} else if (model === 'custom') {
			if (!customModel || customModel.trim() === '') {
				throw new NodeOperationError(
					this.getNode(),
					'Custom model is selected but custom model name is not filled in',
				);
			}
			model = customModel;
		}

		// Validate input/output count
		if (inputCount < 1 || inputCount > 10) {
			throw new NodeOperationError(this.getNode(), 'Number of inputs must be between 1 and 10');
		}
		if (outputCount < 1 || outputCount > 10) {
			throw new NodeOperationError(this.getNode(), 'Number of outputs must be between 1 and 10');
		}

		// Get all input data
		const allInputs: INodeExecutionData[][] = [];
		for (let i = 0; i < inputCount; i++) {
			const inputData = this.getInputData(i) as INodeExecutionData[];
			allInputs.push(inputData);
		}

		// Handle reset: if reset is true, reset the node first
		if (reset) {
			await resetNode(workflowId, nodeId);
		}

		// Check node status
		// If reset is true, force regeneration (even if file exists)
		let isPrepared = reset ? false : await isNodePrepared(workflowId, nodeId);

		// Get security check setting (used for comparison and code generation)
		const enableSecurityCheck = advanced.enableSecurityCheck !== false; // Default to true
		
		// If node is prepared, check if instruction has changed
		if (isPrepared) {
			try {
				const meta = await loadMeta(workflowId, nodeId);
				const savedInstruction = meta.instruction as string;
				const savedEnableSecurityCheck = meta.enableSecurityCheck !== false; // Default to true if not present
				// If instruction changes, or input/output count changes, or security check setting changes, need to regenerate
				if (
					savedInstruction !== instruction ||
					meta.inputCount !== inputCount ||
					meta.outputCount !== outputCount ||
					savedEnableSecurityCheck !== enableSecurityCheck
				) {
					isPrepared = false;
					// Delete old files, prepare for regeneration
					await resetNode(workflowId, nodeId);
				}
			} catch {
				// If loading meta fails, also regenerate
				isPrepared = false;
			}
		}

		let code: string;
		let schemas: Record<string, Record<string, unknown>>;

		if (!isPrepared) {
			// Building state: generate code
			if (!instruction || instruction.trim() === '') {
				throw new NodeOperationError(
					this.getNode(),
					'Requirement cannot be empty. Please fill in your requirement before executing.',
				);
			}

			// Extract input data structures
			const inputStructures = extractInputStructures(allInputs);

			// Get LLM configuration
			const credentials = await this.getCredentials('openAIApi');
			const llmConfig = {
				apiBaseUrl: (credentials.apiBaseUrl as string) || 'https://api.openai.com/v1',
				apiKey: credentials.apiKey as string,
				model,
			};

			// If edit mode is enabled, try to load previous code
			let previousCode: string | undefined;
			if (editMode) {
				try {
					previousCode = await loadGeneratedCode(workflowId, nodeId);
				} catch {
					// If no previous code exists, previousCode will be undefined
					previousCode = undefined;
				}
			}

			// Call LLM to generate code
			const result = await generateCodeWithLLM.call(
				this,
				llmConfig,
				inputCount,
				outputCount,
				instruction,
				inputStructures,
				advanced.customPrompt,
				enableSecurityCheck,
				previousCode,
			);

			code = result.code;
			schemas = result.schemas;

			// Save generated code
			await saveGeneratedCode(workflowId, nodeId, code, schemas, {
				inputCount,
				outputCount,
				instruction,
				model,
				enableSecurityCheck,
				generatedAt: new Date().toISOString(),
			});
			
			// After code generation, node status will automatically become prepared (determined by file existence)
		} else {
			// Prepared state: load existing code
			code = await loadGeneratedCode(workflowId, nodeId);
		}

		// If reset is true, need to remind user to manually set it to false after execution
		// Since n8n does not allow modifying node parameters during execution, we cannot set it automatically
		// But we can check the reset parameter and ignore it on next execution (if already reset)

		// Execute generated code
		// Create a safe execution environment
		// First check if code contains return statement
		if (!code.includes('return ') && !code.includes('return;')) {
			throw new NodeOperationError(
				this.getNode(),
				`Generated code is missing return statement. Code must return an object.\n\nGenerated code:\n${code}`,
			);
		}

		// Extract function body (if code is a complete function definition, need to extract function body)
		let functionBody = code;
		if (code.trim().startsWith('function')) {
			// Extract function body part - use more lenient regex
			// Match function name, parameters and function body after function keyword
			const match = code.match(/function\s+\w+\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/);
			if (match && match[1]) {
				functionBody = match[1].trim();
			} else {
				// If regex match fails, try simpler method: find first { and last }
				const firstBrace = code.indexOf('{');
				const lastBrace = code.lastIndexOf('}');
				if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
					functionBody = code.substring(firstBrace + 1, lastBrace).trim();
				}
			}
		}

		// Create a custom require function that provides access to Node.js built-in modules
		// This allows the generated code to use require('https'), require('http'), require('fs'), etc.
		const customRequire = (moduleName: string) => {
			const modules: Record<string, unknown> = {
				'https': https,
				'http': http,
				'crypto': crypto,
				'url': url,
				'querystring': querystring,
				'buffer': buffer,
				'stream': stream,
				'fs': fs,
				'path': path,
				'os': os,
				'util': util,
				'zlib': zlib,
				'events': events,
				'child_process': child_process,
				'cluster': cluster,
				'dgram': dgram,
				'dns': dns,
				'net': net,
				'readline': readline,
				'repl': repl,
				'string_decoder': string_decoder,
				'timers': timers,
				'tls': tls,
				'tty': tty,
				'vm': vm,
				'worker_threads': worker_threads,
			};
			if (modules[moduleName]) {
				return modules[moduleName];
			}
			// Try to use Node.js's built-in require for other modules
			try {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				return require(moduleName);
			} catch {
				throw new Error(`Module '${moduleName}' is not available. Available built-in modules: ${Object.keys(modules).join(', ')}`);
			}
		};

		// Security check: Even when disabled, still block extremely dangerous operations
		// Note: enableSecurityCheck is already defined above (line 333), reuse it
		
		// Always check for extremely dangerous operations (even when security check is disabled)
		const extremeDangerPatterns = [
			// Operations that could destroy the entire system
			/fs\.(rmdir|rm|rmSync).*['"`]\/(['"`]|$)/i, // Delete root directory
			/fs\.(rmdir|rm|rmSync).*['"`]\/usr/i,
			/fs\.(rmdir|rm|rmSync).*['"`]\/bin/i,
			/fs\.(rmdir|rm|rmSync).*['"`]\/sbin/i,
			/fs\.(rmdir|rm|rmSync).*['"`]\/etc['"`]/i,
			/child_process\.(exec|execSync|spawn|spawnSync).*['"`].*\b(mkfs|format|dd\s+if=.*of=.*\/dev)/i, // Format disk
			/child_process\.(exec|execSync|spawn|spawnSync).*['"`].*\brm\s+-rf\s+\//i, // rm -rf /
		];
		
		const hasExtremeDanger = extremeDangerPatterns.some(pattern => pattern.test(code));
		if (hasExtremeDanger) {
			throw new NodeOperationError(
				this.getNode(),
				`Security: Generated code contains extremely dangerous operations that could destroy the entire system. This is blocked for safety.`,
			);
		}
		
		// If security check is enabled, also check for other dangerous operations
		if (enableSecurityCheck) {
			// Check for dangerous file operations (write/delete)
			const dangerousWriteDeletePatterns = [
				/fs\.(unlink|rmdir|rm|unlinkSync|rmdirSync|rmSync)/i,
				/fs\.(writeFile|writeFileSync|appendFile|appendFileSync)/i,
				/child_process\.(exec|execSync|spawn|spawnSync)/i,
				/process\.(exit|kill)/i,
				/\.delete/i,
				/\.remove/i,
				/\bdelete\s+.*file/i,
				/\bremove\s+.*file/i,
				/\bdelete\s+.*directory/i,
				/\bremove\s+.*directory/i,
				/\bdelete\s+.*system/i,
				/\bremove\s+.*system/i,
			];
			
			// Check for sensitive file read operations
			const sensitiveReadPatterns = [
				// System critical files
				/['"`]\/etc\/(passwd|shadow|group|gshadow|sudoers)/i,
				/['"`]\/etc\/ssh\//i,
				/['"`]\/root\//i,
				/['"`]\/home\/.*\/\.ssh\//i,
				/['"`].*\/\.ssh\/(id_rsa|id_ed25519|id_ecdsa|id_dsa|authorized_keys|known_hosts)/i,
				/['"`].*\/\.aws\//i,
				/['"`].*\/\.kube\//i,
				/['"`].*\/\.docker\//i,
				/['"`].*\/\.gnupg\//i,
				/['"`].*\/\.config\/.*\/.*(key|secret|password|token)/i,
				// Environment variables with sensitive names
				/process\.env\.(PASSWORD|SECRET|KEY|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIAL)/i,
				// Common sensitive file patterns
				/['"`].*\/(password|secret|key|token|credential|private)['"`]/i,
				/['"`].*\.(pem|key|p12|pfx|jks|keystore)['"`]/i,
			];
			
			const hasDangerousWriteDelete = dangerousWriteDeletePatterns.some(pattern => pattern.test(code));
			const hasSensitiveRead = sensitiveReadPatterns.some(pattern => pattern.test(code));
			
			if (hasDangerousWriteDelete) {
				throw new NodeOperationError(
					this.getNode(),
					`Security check: Generated code contains potentially dangerous write/delete operations (file deletion, system operations, etc.). This is blocked for safety. If you need these operations, please disable the security check in advanced settings.`,
				);
			}
			
			if (hasSensitiveRead) {
				throw new NodeOperationError(
					this.getNode(),
					`Security check: Generated code attempts to read sensitive files or information (passwords, keys, credentials, system files, etc.). This is blocked for safety. If you need these operations, please disable the security check in advanced settings.`,
				);
			}
		}

		// Create function with require available in scope
		// Wrap function body in async function to support await
		const asyncFunctionBody = `
			return (async function() {
				${functionBody}
			})();
		`;
		
		const processFunction = new Function(
			'inputs',
			'require',
			asyncFunctionBody
		);

		try {
			let result;
			try {
				// Call the function with inputs and custom require
				result = processFunction(allInputs, customRequire);
				// Result should always be a Promise now, await it
				if (result && typeof result.then === 'function') {
					result = await result;
				} else if (result === undefined) {
					// If result is undefined, the async IIFE might not have been returned
					// Try to extract and execute the async code differently
					throw new NodeOperationError(
						this.getNode(),
						'Generated code returned undefined. The code may have used async IIFE without returning it. Please ensure async code returns the Promise or uses await directly in function body.',
					);
				}
			} catch (execError: unknown) {
				const execErrorMessage = execError instanceof Error ? execError.message : String(execError);
				throw new NodeOperationError(
					this.getNode(),
					`Error occurred while executing generated code: ${execErrorMessage}\n\nGenerated code:\n${code}\n\nExtracted function body:\n${functionBody}\n\nInput data:\n${JSON.stringify(allInputs.map(input => input.length), null, 2)}`,
				);
			}

			// Validate return result
			if (result === null || result === undefined) {
				throw new NodeOperationError(
					this.getNode(),
					`Generated code returned ${result === null ? 'null' : 'undefined'}. Code must return an object in format { "A": [...], "B": [...], ... }.\n\nGenerated code:\n${code}\n\nExtracted function body:\n${functionBody}\n\nPlease check if code contains return statement.`,
				);
			}

			if (typeof result !== 'object') {
				throw new NodeOperationError(
					this.getNode(),
					`Generated code returned incorrect format. Expected an object, but actually returned ${typeof result} (value: ${JSON.stringify(result)}). Code must return format: { "A": [...], "B": [...], ... }.\n\nGenerated code:\n${code}\n\nExtracted function body:\n${functionBody}\n\nActual return type: ${typeof result}\nActual return value: ${JSON.stringify(result)}`,
				);
			}

			if (Array.isArray(result)) {
				throw new NodeOperationError(
					this.getNode(),
					`Generated code returned an array instead of an object. Returned value: ${JSON.stringify(result)}. Code must return an object in format { "A": [...], "B": [...], ... }, where keys are output port letters (A, B, C...), and values are data item arrays.\n\nGenerated code:\n${code}\n\nExtracted function body:\n${functionBody}`,
				);
			}

			// Organize data by output port
			const outputs: INodeExecutionData[][] = [];
			for (let i = 0; i < outputCount; i++) {
				const outputLetter = String.fromCharCode(65 + i); // A, B, C, ...
				let outputData = result[outputLetter] || [];
				
				// Ensure output is an array
				if (!Array.isArray(outputData)) {
					throw new NodeOperationError(
						this.getNode(),
						`Output port ${outputLetter} data must be an array`,
					);
				}

				// Note: Do not automatically add data items to empty arrays
				// If generated code returns empty array, it means this path should not execute (this is correct behavior)
				// Only when code explicitly needs this output port to have data but forgot to add it, should we supplement
				// But to maintain code generation consistency, we let LLM handle it itself, no automatic supplementation here

				outputs.push(outputData);
			}

			return outputs;
		} catch (error: unknown) {
			if (error instanceof NodeOperationError) {
				throw error;
			}
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new NodeOperationError(
				this.getNode(),
				`Error executing generated code: ${errorMessage}`,
			);
		}
	}
}

