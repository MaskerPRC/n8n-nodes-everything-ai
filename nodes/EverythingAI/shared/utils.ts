/* eslint-disable @n8n/community-nodes/no-restricted-imports */
// Note: This node uses Node.js file system APIs for local storage.
// It is designed for self-hosted n8n instances and may not work in n8n Cloud.
import type { INodeExecutionData, INodeParameters } from 'n8n-workflow';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);

const NODE_DIR_NAME = 'everythingAI';
const CODE_FILE_NAME = 'code.js';
const SCHEMA_FILE_NAME = 'schema.json';
const META_FILE_NAME = 'meta.json';

/**
 * Get node's dedicated directory path
 */
export function getNodeStoragePath(workflowId: string, nodeId: string): string {
	/* eslint-disable @n8n/community-nodes/no-restricted-globals */
	const userHome = process.env.HOME || process.env.USERPROFILE || process.cwd();
	/* eslint-enable @n8n/community-nodes/no-restricted-globals */
	const n8nDir = path.join(userHome, '.n8n');
	const nodeDir = path.join(n8nDir, NODE_DIR_NAME, workflowId, nodeId);
	return nodeDir;
}

/**
 * Ensure directory exists
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
	try {
		await access(dirPath);
	} catch {
		await mkdir(dirPath, { recursive: true });
	}
}

/**
 * Check if node is prepared (code.js exists)
 */
export async function isNodePrepared(workflowId: string, nodeId: string): Promise<boolean> {
	const nodeDir = getNodeStoragePath(workflowId, nodeId);
	const codePath = path.join(nodeDir, CODE_FILE_NAME);
	try {
		await access(codePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Save generated code
 */
export async function saveGeneratedCode(
	workflowId: string,
	nodeId: string,
	code: string,
	schema: Record<string, unknown>,
	meta: Record<string, unknown>,
): Promise<void> {
	const nodeDir = getNodeStoragePath(workflowId, nodeId);
	await ensureDirectoryExists(nodeDir);

	const codePath = path.join(nodeDir, CODE_FILE_NAME);
	const schemaPath = path.join(nodeDir, SCHEMA_FILE_NAME);
	const metaPath = path.join(nodeDir, META_FILE_NAME);

	await writeFile(codePath, code, 'utf-8');
	await writeFile(schemaPath, JSON.stringify(schema, null, 2), 'utf-8');
	await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Load generated code
 */
export async function loadGeneratedCode(workflowId: string, nodeId: string): Promise<string> {
	const nodeDir = getNodeStoragePath(workflowId, nodeId);
	const codePath = path.join(nodeDir, CODE_FILE_NAME);
	return await readFile(codePath, 'utf-8');
}

/**
 * Load schema
 */
export async function loadSchema(workflowId: string, nodeId: string): Promise<Record<string, unknown>> {
	const nodeDir = getNodeStoragePath(workflowId, nodeId);
	const schemaPath = path.join(nodeDir, SCHEMA_FILE_NAME);
	const content = await readFile(schemaPath, 'utf-8');
	return JSON.parse(content);
}

/**
 * Load meta information
 */
export async function loadMeta(workflowId: string, nodeId: string): Promise<Record<string, unknown>> {
	const nodeDir = getNodeStoragePath(workflowId, nodeId);
	const metaPath = path.join(nodeDir, META_FILE_NAME);
	const content = await readFile(metaPath, 'utf-8');
	return JSON.parse(content);
}

/**
 * Recursively delete directory (more compatible implementation)
 */
async function removeDirectory(dirPath: string): Promise<void> {
	try {
		const stats = await stat(dirPath);
		if (!stats.isDirectory()) {
			await unlink(dirPath);
			return;
		}

		const files = await readdir(dirPath);
		for (const file of files) {
			const filePath = path.join(dirPath, file);
			await removeDirectory(filePath);
		}
		await rmdir(dirPath);
	} catch {
		// If file or directory doesn't exist, ignore error
	}
}

/**
 * Reset node (delete all generated files)
 */
export async function resetNode(workflowId: string, nodeId: string): Promise<void> {
	const nodeDir = getNodeStoragePath(workflowId, nodeId);
	try {
		await removeDirectory(nodeDir);
	} catch {
		// If directory doesn't exist, ignore error
	}
}

/**
 * Data sanitization: replace real values with type descriptions
 */
export function sanitizeData(value: unknown): Record<string, unknown> {
	if (value === null || value === undefined) {
		return { type: 'null', value: null };
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return { type: 'array', items: [], example: '[]' };
		}
		// Take first element as example structure
		return {
			type: 'array',
			items: sanitizeData(value[0]),
			example: `[${sanitizeData(value[0]).example || '...'}]`,
		};
	}

	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const sanitized: Record<string, unknown> = { type: 'object', properties: {} };
		for (const [key, val] of Object.entries(value)) {
			(sanitized.properties as Record<string, unknown>)[key] = sanitizeData(val);
		}
		sanitized.example = `{${Object.keys(value).join(', ')}}`;
		return sanitized;
	}

	// Basic types
	const type = typeof value;
	return {
		type,
		example: type === 'string' ? 'string' : type === 'number' ? 0 : type === 'boolean' ? true : value,
	};
}

/**
 * Extract structure information from input data
 */
export function extractInputStructures(inputs: INodeExecutionData[][]): Array<{
	type: string;
	structure?: Record<string, unknown>;
	itemCount?: number;
}> {
	return inputs.map((inputItems) => {
		if (inputItems.length === 0) {
			return { type: 'empty' };
		}
		// Take first item as example
		const firstItem = inputItems[0];
		return {
			type: 'data',
			structure: sanitizeData(firstItem.json),
			itemCount: inputItems.length,
		};
	});
}

/**
 * Configure input ports (for dynamic input ports)
 * Reference n8n Merge node implementation
 */
export const configuredInputs = (parameters: INodeParameters) => {
	const numberInputs = (parameters.numberInputs as number) || 1;
	return Array.from({ length: numberInputs }, (_, i) => ({
		type: 'main',
		displayName: `Input ${(i + 1).toString()}`,
	}));
};

/**
 * Configure output ports (for dynamic output ports)
 */
export const configuredOutputs = (parameters: INodeParameters) => {
	const numberOutputs = (parameters.numberOutputs as number) || 1;
	return Array.from({ length: numberOutputs }, (_, i) => ({
		type: 'main',
		displayName: `Output ${String.fromCharCode(65 + i)}`, // A, B, C, ...
	}));
};

