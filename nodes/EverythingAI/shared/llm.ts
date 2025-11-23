import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

interface LLMConfig {
	apiBaseUrl: string;
	apiKey: string;
	model: string;
}

interface LLMResponse {
	code: string;
	schemas: Record<string, Record<string, unknown>>;
}

/**
 * 构建系统 Prompt
 */
function buildSystemPrompt(
	inputCount: number,
	outputCount: number,
	instruction: string,
	customPrompt?: string,
): string {
	const defaultPrompt = `你是一个代码生成助手。用户会提供多个输入口的数据结构和一条自然语言指令，你需要生成可执行的 JavaScript 代码。

## 输入输出约定
- 输入口用数字 1, 2, 3, ... 表示（共 ${inputCount} 个输入口）
- 输出口用大写字母 A, B, C, ... 表示（共 ${outputCount} 个输出口）

## 用户指令
${instruction}

## 数据结构说明（重要！）
在 n8n 中，数据项的结构是：
\`\`\`javascript
{
  json: { /* 实际数据对象 */ },
  binary: { /* 二进制数据（可选）*/ }
}
\`\`\`

输入数据结构：
- \`inputs\` 是一个数组，\`inputs[0]\` 对应输入口 1，\`inputs[1]\` 对应输入口 2，以此类推
- 每个 \`inputs[i]\` 是一个数组，包含该输入口的所有数据项
- 每个数据项是一个对象，格式为：\`{ json: {...}, binary: {...} }\`

输出数据结构：
- 必须返回一个对象，键为输出口字母（'A', 'B', 'C'...），值为数组
- 每个输出口的数组包含数据项，每个数据项也必须是 \`{ json: {...}, binary: {...} }\` 格式
- 如果数据项来自输入，必须保持完整的对象结构（包括 json 和 binary）
- 如果创建新数据项，也必须包含 json 和 binary 字段（binary 可以为空对象）

## 代码要求
1. 代码必须是一个 JavaScript 函数，函数签名如下：
   \`\`\`javascript
   function process(inputs) {
     // inputs 是一个数组，inputs[0] 对应输入口 1，inputs[1] 对应输入口 2，以此类推
     // 每个 inputs[i] 是一个数组，包含该输入口的所有数据项
     // 每个数据项格式：{ json: {...}, binary: {...} }
     
     // 初始化输出对象（必须初始化所有输出口）
     const outputs = {};
     for (let i = 0; i < ${outputCount}; i++) {
       const outputLetter = String.fromCharCode(65 + i); // A, B, C, ...
       outputs[outputLetter] = [];
     }
     
     // 处理逻辑...
     // 遍历输入数据时，使用 for...of 循环
     // 例如：for (const item of inputs[0]) { ... }
     
     // 返回输出对象，每个输出口的数组包含 { json: {...}, binary: {...} } 格式的数据项
     return outputs;
   }
   \`\`\`

2. 代码必须是纯 JavaScript，不能使用 Node.js 特定的模块（如 fs, path 等）

3. 返回格式必须是 JSON，包含两个字段：
   - \`code\`: 生成的 JavaScript 代码字符串（不包含函数定义，只包含函数体内容）
   - \`schemas\`: 对象，键为输出口字母（'A', 'B', 'C'...），值为该输出口的数据结构描述

## 代码示例

### 示例 1：简单路由（2个输出口）
如果用户指令是"当输入口1的数据中status='paid'时发送到A，否则发送到B"，代码应该是：
\`\`\`javascript
const outputs = { 'A': [], 'B': [] };
for (const item of inputs[0]) {
  if (item.json.status === 'paid') {
    outputs['A'].push(item);  // 保持完整的 item 对象结构 { json: {...}, binary: {...} }
  } else {
    outputs['B'].push(item);  // 保持完整的 item 对象结构 { json: {...}, binary: {...} }
  }
}
return outputs;
\`\`\`

注意：必须初始化所有输出口，即使某些输出口可能为空数组。

### 示例 2：修改数据
如果用户指令是"给输入口1的所有数据添加新字段myNewField=1，然后输出到A"，代码应该是：
\`\`\`javascript
const outputs = { 'A': [] };
for (const item of inputs[0]) {
  item.json.myNewField = 1;  // 修改 json 字段
  outputs['A'].push(item);   // 保持完整的 item 对象结构
}
return outputs;
\`\`\`

### 示例 3：创建新数据项
如果用户指令是"创建新数据项输出到A，包含字段count=10"，代码应该是：
\`\`\`javascript
const outputs = { 'A': [] };
const newItem = {
  json: { count: 10 },
  binary: {}  // 必须包含 binary 字段，即使为空
};
outputs['A'].push(newItem);
return outputs;
\`\`\`

## 重要提醒
- 数据项必须保持 \`{ json: {...}, binary: {...} }\` 格式
- 从输入获取的数据项，必须完整保留（包括 json 和 binary）
- 创建新数据项时，必须同时包含 json 和 binary 字段
- 不要只返回 json 对象，必须返回完整的数据项对象

请严格按照用户指令和数据结构生成代码。`;

	if (customPrompt) {
		// 替换占位符
		return customPrompt
			.replace(/\{\{instruction\}\}/g, instruction)
			.replace(/\{\{inputCount\}\}/g, inputCount.toString())
			.replace(/\{\{outputCount\}\}/g, outputCount.toString());
	}
	return defaultPrompt;
}

/**
 * 构建用户 Prompt（包含数据结构）
 */
function buildUserPrompt(inputStructures: Array<{
	type: string;
	structure?: Record<string, unknown>;
	itemCount?: number;
}>): string {
	let prompt = '## 输入数据结构\n\n';
	inputStructures.forEach((struct, index) => {
		prompt += `### 输入口 ${index + 1}\n`;
		if (struct.type === 'empty') {
			prompt += '无数据\n\n';
		} else {
			prompt += `数据项数量: ${struct.itemCount}\n`;
			prompt += `数据结构:\n\`\`\`json\n${JSON.stringify(struct.structure, null, 2)}\n\`\`\`\n\n`;
		}
	});
	return prompt;
}

/**
 * 调用 LLM 生成代码
 */
export async function generateCodeWithLLM(
	this: IExecuteFunctions,
	config: LLMConfig,
	inputCount: number,
	outputCount: number,
	instruction: string,
	inputStructures: Array<{
		type: string;
		structure?: Record<string, unknown>;
		itemCount?: number;
	}>,
	customPrompt?: string,
): Promise<LLMResponse> {
	const systemPrompt = buildSystemPrompt(inputCount, outputCount, instruction, customPrompt);
	const userPrompt = buildUserPrompt(inputStructures);

	const requestBody = {
		model: config.model,
		messages: [
			{
				role: 'system',
				content: systemPrompt,
			},
			{
				role: 'user',
				content: userPrompt,
			},
		],
		temperature: 0.1,
		response_format: { type: 'json_object' },
	};

	const baseUrl = config.apiBaseUrl || 'https://api.openai.com/v1';
	const url = `${baseUrl}/chat/completions`;

	try {
		const response = await this.helpers.httpRequest({
			method: 'POST',
			url,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: requestBody,
			json: true,
		});

		const content = response.choices?.[0]?.message?.content;
		if (!content) {
			throw new NodeOperationError(this.getNode(), 'LLM 返回内容为空');
		}

		const parsed = JSON.parse(content);
		
		// 验证返回格式
		if (!parsed.code || !parsed.schemas) {
			throw new NodeOperationError(
				this.getNode(),
				'LLM 返回格式不正确，必须包含 code 和 schemas 字段',
			);
		}

		// 包装代码为完整函数
		const fullCode = `function process(inputs) {
  ${parsed.code}
}`;

		return {
			code: fullCode,
			schemas: parsed.schemas,
		};
	} catch (error: unknown) {
		if (error && typeof error === 'object' && 'response' in error) {
			const httpError = error as { response?: { status?: number; statusText?: string; data?: unknown } };
			if (httpError.response) {
				throw new NodeOperationError(
					this.getNode(),
					`LLM API 调用失败: ${httpError.response.status} ${httpError.response.statusText} - ${JSON.stringify(httpError.response.data)}`,
				);
			}
		}
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new NodeOperationError(this.getNode(), `LLM 调用失败: ${errorMessage}`);
	}
}

