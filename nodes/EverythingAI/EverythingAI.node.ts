import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
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
		description: '多入多出、自然语言驱动的 AI 节点',
		usableAsTool: true,
		defaults: {
			name: 'Everything AI',
		},
		// 使用表达式动态配置输入输出端口
		// 参考 n8n Merge 节点的实现方式
		// @ts-ignore - 表达式字符串在运行时会被 n8n 解析
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
				displayName: '输入口数量',
				name: 'numberInputs',
				type: 'options',
				noDataExpression: true,
				default: 1,
				options: Array.from({ length: 10 }, (_, i) => ({
					name: String(i + 1),
					value: i + 1,
				})),
				validateType: 'number',
				description: '选择输入口的数量（1-10）。修改此值后，节点会动态显示相应数量的输入端口。',
				required: true,
			},
			{
				displayName: '输出口数量',
				name: 'numberOutputs',
				type: 'options',
				noDataExpression: true,
				default: 1,
				options: Array.from({ length: 10 }, (_, i) => ({
					name: String(i + 1),
					value: i + 1,
				})),
				validateType: 'number',
				description: '选择输出口的数量（1-10）。修改此值后，节点会动态显示相应数量的输出端口。',
				required: true,
			},
			{
				displayName: '你的需求',
				name: 'instruction',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder:
					'例如：当输入口1的数据中status="paid"时，发送到输出口A，否则发送到输出口B',
				description:
					'用自然语言描述你的数据处理需求。用数字 1,2,3... 指代输入口，用大写字母 A,B,C... 指代输出口。如果需要修改逻辑，只需修改此需求即可，节点会自动重新生成代码。',
				required: true,
			},
			{
				displayName: '模型 Name or ID',
				name: 'model',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getModels',
				},
				default: '',
				description: '选择使用的 LLM 模型（从 API 动态加载）. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				required: true,
			},
			{
				displayName: '自定义模型名称',
				name: 'customModel',
				type: 'string',
				default: '',
				description: '当选择"自定义"模型时，在此输入模型名称',
				displayOptions: {
					show: {
						model: ['custom'],
					},
				},
				required: true,
			},
			{
				displayName: '高级设置',
				name: 'advanced',
				type: 'collection',
				placeholder: '添加高级设置',
				default: {},
				options: [
					{
						displayName: '自定义 Prompt 模板',
						name: 'customPrompt',
						type: 'string',
						typeOptions: {
							rows: 6,
						},
						default: '',
						description:
							'自定义系统 Prompt 模板。留空则使用默认模板。可以使用 {{instruction}}, {{inputCount}}, {{outputCount}} 作为占位符。',
					},
					{
						displayName: '强制重置节点',
						name: 'reset',
						type: 'boolean',
						default: false,
						description: 'Whether to force reset the node and clear generated code. Note: The node will automatically reset and regenerate code when the instruction, input count, or output count changes. Use this option only if you want to force a reset without changing any configuration.',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					// 获取 credentials
					const credentials = await this.getCredentials('openAIApi');
					const apiBaseUrl = (credentials.apiBaseUrl as string) || 'https://api.openai.com/v1';
					const apiKey = credentials.apiKey as string;

					if (!apiKey) {
						return [
							{
								name: '请先配置 API Key',
								value: '',
							},
						];
					}

					// 调用 OpenAI 格式的 /models API
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${apiBaseUrl}/models`,
						headers: {
							Authorization: `Bearer ${apiKey}`,
						},
					});

					// 解析模型列表
					const models: INodePropertyOptions[] = [];
					// OpenAI API 返回格式可能是 { data: [...] } 或直接是数组
					const modelList = Array.isArray(response) ? response : response.data || [];

					if (Array.isArray(modelList) && modelList.length > 0) {
						// 过滤出 chat 模型（通常以 gpt- 或 claude- 开头，或者包含 chat/instruct）
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
								description: `模型 ID: ${model.id}`,
							}))
							.sort((a, b) => a.name.localeCompare(b.name));

						models.push(...chatModels);
					}

					// 如果没有找到模型，返回默认选项
					if (models.length === 0) {
						return [
							{
								name: 'gpt-4o-mini',
								value: 'gpt-4o-mini',
								description: '默认模型（API 未返回模型列表）',
							},
						];
					}

					// 添加自定义选项
					models.push({
						name: '自定义',
						value: 'custom',
						description: '使用自定义模型名称',
					});

					return models;
				} catch (error: unknown) {
					// 如果 API 调用失败，返回默认模型列表
					const errorMessage = error instanceof Error ? error.message : String(error);
					return [
						{
							name: `加载失败: ${errorMessage}`,
							value: '',
						},
						{
							name: 'Gpt-4o-Mini (默认)',
							value: 'gpt-4o-mini',
							description: '使用默认模型',
						},
						{
							name: '自定义',
							value: 'custom',
							description: '使用自定义模型名称',
						},
					];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const workflowId = this.getWorkflow().id || 'default';
		const nodeId = this.getNode().id;

		// 获取配置参数
		const inputCount = this.getNodeParameter('numberInputs', 0) as number;
		const outputCount = this.getNodeParameter('numberOutputs', 0) as number;
		const instruction = this.getNodeParameter('instruction', 0) as string;
		const modelSelection = this.getNodeParameter('model', 0) as string;
		const customModel = this.getNodeParameter('customModel', 0, '') as string;
		const advanced = this.getNodeParameter('advanced', 0, {}) as {
			customPrompt?: string;
			reset?: boolean;
		};
		const reset = advanced.reset || false;

		// 确定使用的模型名称
		// 如果未选择模型（空字符串），使用默认值 gpt-4o-mini
		let model = modelSelection;
		if (!model || model === '') {
			model = 'gpt-4o-mini';
		} else if (model === 'custom') {
			if (!customModel || customModel.trim() === '') {
				throw new NodeOperationError(
					this.getNode(),
					'选择了自定义模型，但未填写自定义模型名称',
				);
			}
			model = customModel;
		}

		// 验证输入输出数量
		if (inputCount < 1 || inputCount > 10) {
			throw new NodeOperationError(this.getNode(), '输入口数量必须在 1-10 之间');
		}
		if (outputCount < 1 || outputCount > 10) {
			throw new NodeOperationError(this.getNode(), '输出口数量必须在 1-10 之间');
		}

		// 获取所有输入口的数据
		const allInputs: INodeExecutionData[][] = [];
		for (let i = 0; i < inputCount; i++) {
			const inputData = this.getInputData(i) as INodeExecutionData[];
			allInputs.push(inputData);
		}

		// 处理重置：如果 reset 为 true，先重置节点
		if (reset) {
			await resetNode(workflowId, nodeId);
		}

		// 检查节点状态
		// 如果 reset 为 true，强制重新生成（即使文件存在）
		let isPrepared = reset ? false : await isNodePrepared(workflowId, nodeId);

		// 如果节点已准备，检查指令是否发生变化
		if (isPrepared) {
			try {
				const meta = await loadMeta(workflowId, nodeId);
				const savedInstruction = meta.instruction as string;
				// 如果指令发生变化，或者输入输出数量发生变化，需要重新生成
				if (
					savedInstruction !== instruction ||
					meta.inputCount !== inputCount ||
					meta.outputCount !== outputCount
				) {
					isPrepared = false;
					// 删除旧文件，准备重新生成
					await resetNode(workflowId, nodeId);
				}
			} catch {
				// 如果加载 meta 失败，也重新生成
				isPrepared = false;
			}
		}

		let code: string;
		let schemas: Record<string, Record<string, unknown>>;

		if (!isPrepared) {
			// Building 状态：生成代码
			if (!instruction || instruction.trim() === '') {
				throw new NodeOperationError(
					this.getNode(),
					'需求不能为空，请先填写你的需求后再执行',
				);
			}

			// 提取输入数据结构
			const inputStructures = extractInputStructures(allInputs);

			// 获取 LLM 配置
			const credentials = await this.getCredentials('openAIApi');
			const llmConfig = {
				apiBaseUrl: (credentials.apiBaseUrl as string) || 'https://api.openai.com/v1',
				apiKey: credentials.apiKey as string,
				model,
			};

			// 调用 LLM 生成代码
			const result = await generateCodeWithLLM.call(
				this,
				llmConfig,
				inputCount,
				outputCount,
				instruction,
				inputStructures,
				advanced.customPrompt,
			);

			code = result.code;
			schemas = result.schemas;

			// 保存生成的代码
			await saveGeneratedCode(workflowId, nodeId, code, schemas, {
				inputCount,
				outputCount,
				instruction,
				model,
				generatedAt: new Date().toISOString(),
			});
			
			// 代码生成后，节点状态会自动变为 prepared（通过文件存在性来判断）
		} else {
			// Prepared 状态：加载已有代码
			code = await loadGeneratedCode(workflowId, nodeId);
		}

		// 如果 reset 为 true，在执行完成后需要提醒用户手动设置为 false
		// 由于 n8n 不允许在执行时修改节点参数，我们无法自动设置
		// 但可以通过检查 reset 参数并在下次执行时忽略它（如果已经重置过）

		// 执行生成的代码
		// 创建一个安全的执行环境
		// 先检查代码中是否包含 return 语句
		if (!code.includes('return ') && !code.includes('return;')) {
			throw new NodeOperationError(
				this.getNode(),
				`生成的代码缺少 return 语句。代码必须返回一个对象。\n\n生成的代码：\n${code}`,
			);
		}

		// 提取函数体（如果 code 是完整的函数定义，需要提取函数体）
		let functionBody = code;
		if (code.trim().startsWith('function')) {
			// 提取函数体部分 - 使用更宽松的正则表达式
			// 匹配 function 关键字后的函数名、参数和函数体
			const match = code.match(/function\s+\w+\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/);
			if (match && match[1]) {
				functionBody = match[1].trim();
			} else {
				// 如果正则匹配失败，尝试更简单的方法：找到第一个 { 和最后一个 }
				const firstBrace = code.indexOf('{');
				const lastBrace = code.lastIndexOf('}');
				if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
					functionBody = code.substring(firstBrace + 1, lastBrace).trim();
				}
			}
		}

		const processFunction = new Function('inputs', functionBody);

		try {
			let result;
			try {
				result = processFunction(allInputs);
			} catch (execError: unknown) {
				const execErrorMessage = execError instanceof Error ? execError.message : String(execError);
				throw new NodeOperationError(
					this.getNode(),
					`执行生成的代码时发生错误: ${execErrorMessage}\n\n生成的代码：\n${code}\n\n提取的函数体：\n${functionBody}\n\n输入数据：\n${JSON.stringify(allInputs.map(input => input.length), null, 2)}`,
				);
			}

			// 验证返回结果
			if (result === null || result === undefined) {
				throw new NodeOperationError(
					this.getNode(),
					`生成的代码返回了 ${result === null ? 'null' : 'undefined'}。代码必须返回一个对象，格式为 { "A": [...], "B": [...], ... }。\n\n生成的代码：\n${code}\n\n提取的函数体：\n${functionBody}\n\n请检查代码是否包含 return 语句。`,
				);
			}

			if (typeof result !== 'object') {
				throw new NodeOperationError(
					this.getNode(),
					`生成的代码返回格式不正确。期望返回一个对象，但实际返回了 ${typeof result} (值: ${JSON.stringify(result)})。代码必须返回格式：{ "A": [...], "B": [...], ... }。\n\n生成的代码：\n${code}\n\n提取的函数体：\n${functionBody}\n\n实际返回类型：${typeof result}\n实际返回值：${JSON.stringify(result)}`,
				);
			}

			if (Array.isArray(result)) {
				throw new NodeOperationError(
					this.getNode(),
					`生成的代码返回了数组而不是对象。返回的值：${JSON.stringify(result)}。代码必须返回一个对象，格式为 { "A": [...], "B": [...], ... }，其中键是输出口字母（A, B, C...），值是数据项数组。\n\n生成的代码：\n${code}\n\n提取的函数体：\n${functionBody}`,
				);
			}

			// 按输出口组织数据
			const outputs: INodeExecutionData[][] = [];
			for (let i = 0; i < outputCount; i++) {
				const outputLetter = String.fromCharCode(65 + i); // A, B, C, ...
				let outputData = result[outputLetter] || [];
				
				// 确保输出是数组
				if (!Array.isArray(outputData)) {
					throw new NodeOperationError(
						this.getNode(),
						`输出口 ${outputLetter} 的数据必须是数组`,
					);
				}

				// 注意：不要自动为空数组添加数据项
				// 如果生成的代码返回空数组，说明该路径不应该执行（这是正确的行为）
				// 只有当代码明确需要该输出口有数据但忘记添加时，才需要补充
				// 但为了保持代码生成的一致性，我们让 LLM 自己处理，这里不做自动补充

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
				`执行生成的代码时出错: ${errorMessage}`,
			);
		}
	}
}

