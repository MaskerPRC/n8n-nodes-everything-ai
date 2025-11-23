/* eslint-disable @n8n/community-nodes/no-restricted-imports */
// Note: This node uses Node.js file system APIs for local storage.
// It is designed for self-hosted n8n instances and may not work in n8n Cloud.
import type { INodeExecutionData } from 'n8n-workflow';
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
 * 获取节点的专属目录路径
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
 * 确保目录存在
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
	try {
		await access(dirPath);
	} catch {
		await mkdir(dirPath, { recursive: true });
	}
}

/**
 * 检查节点是否已准备就绪（存在 code.js）
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
 * 保存生成的代码
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
 * 加载生成的代码
 */
export async function loadGeneratedCode(workflowId: string, nodeId: string): Promise<string> {
	const nodeDir = getNodeStoragePath(workflowId, nodeId);
	const codePath = path.join(nodeDir, CODE_FILE_NAME);
	return await readFile(codePath, 'utf-8');
}

/**
 * 加载 schema
 */
export async function loadSchema(workflowId: string, nodeId: string): Promise<Record<string, unknown>> {
	const nodeDir = getNodeStoragePath(workflowId, nodeId);
	const schemaPath = path.join(nodeDir, SCHEMA_FILE_NAME);
	const content = await readFile(schemaPath, 'utf-8');
	return JSON.parse(content);
}

/**
 * 递归删除目录（兼容性更好的实现）
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
		// 如果文件或目录不存在，忽略错误
	}
}

/**
 * 重置节点（删除所有生成的文件）
 */
export async function resetNode(workflowId: string, nodeId: string): Promise<void> {
	const nodeDir = getNodeStoragePath(workflowId, nodeId);
	try {
		await removeDirectory(nodeDir);
	} catch {
		// 如果目录不存在，忽略错误
	}
}

/**
 * 数据脱敏：将真实值替换为类型描述
 */
export function sanitizeData(value: unknown): Record<string, unknown> {
	if (value === null || value === undefined) {
		return { type: 'null', value: null };
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return { type: 'array', items: [], example: '[]' };
		}
		// 取第一个元素作为示例结构
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

	// 基本类型
	const type = typeof value;
	return {
		type,
		example: type === 'string' ? 'string' : type === 'number' ? 0 : type === 'boolean' ? true : value,
	};
}

/**
 * 从输入数据中提取结构信息
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
		// 取第一个 item 作为示例
		const firstItem = inputItems[0];
		return {
			type: 'data',
			structure: sanitizeData(firstItem.json),
			itemCount: inputItems.length,
		};
	});
}

