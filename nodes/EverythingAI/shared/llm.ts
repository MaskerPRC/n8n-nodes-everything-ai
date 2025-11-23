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
     // 遍历输入数据时，直接使用 inputs[0], inputs[1] 等
     // 例如：for (const item of inputs[0]) { ... }
     // 如果需要，也可以定义变量：const $input = inputs[0]; 然后使用 $input
     
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
// 使用 inputs[0] 或 $input 都可以，$input 等同于 inputs[0]
const $input = inputs[0];
for (const item of $input) {
  if (item.json.status === 'paid') {
    outputs['A'].push(item);  // 保持完整的 item 对象结构 { json: {...}, binary: {...} }
  } else {
    outputs['B'].push(item);  // 保持完整的 item 对象结构 { json: {...}, binary: {...} }
  }
}
return outputs;
\`\`\`

### 示例 1.1：使用 $input 变量（推荐）
如果用户指令是"将所有输入口1的数据输出到A"，代码应该是：
\`\`\`javascript
const outputs = { 'A': [] };
// 定义 $input 变量，指向第一个输入口的数据
const $input = inputs[0];
// 遍历所有数据项
for (const item of $input) {
  outputs['A'].push(item);  // 保持完整的 item 对象结构
}
return outputs;
\`\`\`

注意：
- 必须初始化所有输出口，即使某些输出口可能为空数组
- 推荐使用 \`const $input = inputs[0];\` 来定义 $input 变量，使代码更符合 n8n 风格
- $input 等同于 inputs[0]，表示第一个输入口的所有数据项数组

### 示例 2：修改数据
如果用户指令是"给输入口1的所有数据添加新字段myNewField=1，然后输出到A"，代码应该是：
\`\`\`javascript
const outputs = { 'A': [] };
// 直接使用 inputs[0] 遍历数据
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

### 示例 4：条件路由但不转发数据（重要！）
如果用户指令是"如果第一个item的language是txt，走B路线（啥数据也别转发）"，代码应该是：
\`\`\`javascript
const outputs = { 'A': [], 'B': [] };
const $input = inputs[0] || [];

if ($input.length > 0 && $input[0].json && $input[0].json.language === 'txt') {
  // 走 B 路线，但不转发数据
  // 注意：即使不转发数据，B 输出口也必须至少有一个空数据项，否则流程不会继续
  outputs['B'].push({ json: {}, binary: {} });
} else {
  // 其他情况，转发到 A
  for (const item of $input) {
    outputs['A'].push(item);
  }
  // 如果 A 没有数据，也要至少有一个空数据项
  if (outputs['A'].length === 0) {
    outputs['A'].push({ json: {}, binary: {} });
  }
}

return outputs;
\`\`\`

**关键点**：即使某个输出口不转发任何数据，也必须至少输出一个空数据项 \`{ json: {}, binary: {} }\`，这样 n8n 流程才能继续执行。

## 重要提醒
- **必须返回一个对象**，不能返回数组、null、undefined 或其他类型
- 返回对象的格式：\`{ "A": [...], "B": [...], ... }\`，键是输出口字母，值是数据项数组
- **所有输出口都必须有数据**，即使某个输出口不转发任何数据，也必须至少包含一个空数据项：\`[{ json: {}, binary: {} }]\`
- 这样做的目的是确保 n8n 流程能够继续执行，即使某个输出口没有实际数据
- 数据项必须保持 \`{ json: {...}, binary: {...} }\` 格式
- 从输入获取的数据项，必须完整保留（包括 json 和 binary）
- 创建新数据项时，必须同时包含 json 和 binary 字段
- 不要只返回 json 对象，必须返回完整的数据项对象
- 访问输入数据：直接使用 \`inputs[0]\` 访问第一个输入口，\`inputs[1]\` 访问第二个输入口，以此类推
- 如果需要，可以定义变量：\`const $input = inputs[0];\`，但这不是必须的
- **最后必须使用 return 语句返回对象**，例如：\`return outputs;\`

## 返回格式示例
正确的返回格式：
\`\`\`javascript
return {
  'A': [{ json: {...}, binary: {...} }, ...],
  'B': [{ json: {...}, binary: {...} }, ...]
};
\`\`\`

错误的返回格式（不要这样做）：
- \`return [];\` ❌ 不能返回数组
- \`return null;\` ❌ 不能返回 null
- \`return outputs['A'];\` ❌ 不能只返回单个输出口的数据

请严格按照用户指令和数据结构生成代码。`;

	if (customPrompt) {
		// 替换占位符
		return customPrompt
			.replace(/\{\{instruction\}\}/g, instruction)
			.replace(/\{\{inputCount\}\}/g, inputCount.toString())
			.replace(/\{\{outputCount\}\}/g, outputCount.toString())
			.replace(/\{\{numberOfInputs\}\}/g, inputCount.toString())
			.replace(/\{\{numberOfOutputs\}\}/g, outputCount.toString());
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
		// 确保代码最后有 return 语句
		let codeBody = parsed.code.trim();
		
		// 检查是否包含 return 语句（排除注释中的 return）
		const hasReturn = /return\s+/.test(codeBody) || codeBody.includes('return outputs');
		
		if (!hasReturn) {
			// 如果没有 return 语句，添加默认的 return
			// 初始化所有输出口
			let initCode = 'const outputs = {};\n';
			for (let i = 0; i < outputCount; i++) {
				const letter = String.fromCharCode(65 + i);
				initCode += `  outputs['${letter}'] = [];\n`;
			}
			// 如果代码中已经有 outputs 的定义，就不重复初始化
			if (!codeBody.includes('outputs')) {
				codeBody = initCode + codeBody;
			}
			// 确保最后有 return
			if (!codeBody.trim().endsWith('return outputs;') && !codeBody.trim().endsWith('return outputs')) {
				codeBody += '\nreturn outputs;';
			}
		}
		
		const fullCode = `function process(inputs) {
  ${codeBody}
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

