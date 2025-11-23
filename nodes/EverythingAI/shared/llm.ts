import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

interface LLMConfig {
	apiBaseUrl: string;
	apiKey: string;
	model: string;
}

interface LLMResponse {
	code: string;
	schemas: Record<string, any>;
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

## 代码要求
1. 代码必须是一个 JavaScript 函数，函数签名如下：
   \`\`\`javascript
   function process(inputs) {
     // inputs 是一个数组，inputs[0] 对应输入口 1，inputs[1] 对应输入口 2，以此类推
     // 每个 inputs[i] 是一个数组，包含该输入口的所有数据项
     // 每个数据项是一个对象，包含 json 属性（实际数据）
     
     // 返回一个对象，键为输出口字母（'A', 'B', 'C'...），值为该输出口的数据数组
     return {
       'A': [...],  // 输出口 A 的数据
       'B': [...],  // 输出口 B 的数据
       // ...
     };
   }
   \`\`\`

2. 代码必须是纯 JavaScript，不能使用 Node.js 特定的模块（如 fs, path 等）

3. 返回格式必须是 JSON，包含两个字段：
   - \`code\`: 生成的 JavaScript 代码字符串（不包含函数定义，只包含函数体内容）
   - \`schemas\`: 对象，键为输出口字母（'A', 'B', 'C'...），值为该输出口的数据结构描述

## 示例
如果用户指令是"当输入口1的数据中status='paid'时发送到A，否则发送到B"，且输入口1的数据结构是 {status: string, amount: number}，那么代码应该是：
\`\`\`javascript
const outputs = { 'A': [], 'B': [] };
for (const item of inputs[0]) {
  if (item.json.status === 'paid') {
    outputs['A'].push(item);
  } else {
    outputs['B'].push(item);
  }
}
return outputs;
\`\`\`

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
function buildUserPrompt(inputStructures: any[]): string {
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
	inputStructures: any[],
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
	} catch (error: any) {
		if (error.response) {
			throw new NodeOperationError(
				this.getNode(),
				`LLM API 调用失败: ${error.response.status} ${error.response.statusText} - ${JSON.stringify(error.response.data)}`,
			);
		}
		throw new NodeOperationError(this.getNode(), `LLM 调用失败: ${error.message}`);
	}
}

