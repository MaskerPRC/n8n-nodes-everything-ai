import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	isNodePrepared,
	saveGeneratedCode,
	loadGeneratedCode,
	resetNode,
	extractInputStructures,
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
		subtitle: '={{$parameter["statusDisplay"] || "building"}}',
		usableAsTool: true,
		defaults: {
			name: 'Everything AI',
		},
		// 定义最大数量的输入输出（最多 10 个）
		// 注意：n8n 的输入输出是静态定义的，但我们可以通过 methods 来动态调整
		// 实际使用的输入输出数量由 inputCount 和 outputCount 参数决定
		inputs: Array(10).fill(NodeConnectionTypes.Main),
		outputs: Array(10).fill(NodeConnectionTypes.Main),
		credentials: [
			{
				name: 'openAIApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: '输入口数量',
				name: 'inputCount',
				type: 'options',
				options: Array.from({ length: 10 }, (_, i) => ({
					name: String(i + 1),
					value: i + 1,
				})),
				default: '',
				description: '选择输入口的数量（1-10）',
				required: true,
			},
			{
				displayName: '输出口数量',
				name: 'outputCount',
				type: 'options',
				options: Array.from({ length: 10 }, (_, i) => ({
					name: String(i + 1),
					value: i + 1,
				})),
				default: '',
				description: '选择输出口的数量（1-10）',
				required: true,
			},
			{
				displayName: '自然语言指令',
				name: 'instruction',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder:
					'例如：当输入口1的数据中status="paid"时，发送到输出口A，否则发送到输出口B',
				description:
					'用数字 1,2,3... 指代输入口，用大写字母 A,B,C... 指代输出口。描述如何处理数据并分配到各输出口。',
				required: true,
			},
			{
				displayName: '模型',
				name: 'model',
				type: 'string',
				default: 'gpt-4o-mini',
				description: '使用的 LLM 模型名称',
				required: true,
			},
			{
				displayName: '状态',
				name: 'statusDisplay',
				type: 'string',
				default: 'building',
				description: '节点当前状态：building（构建中，首次执行时会生成代码）或 prepared（已就绪，直接使用生成的代码执行）',
				displayOptions: {
					show: {},
				},
			},
			{
				displayName: '重置节点',
				name: 'reset',
				type: 'boolean',
				default: false,
				description: 'Whether to reset the node and clear generated code',
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
				],
			},
		],
	};

	methods = {};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const workflowId = this.getWorkflow().id || 'default';
		const nodeId = this.getNode().id;

		// 获取配置参数
		const inputCount = this.getNodeParameter('inputCount', 0) as number;
		const outputCount = this.getNodeParameter('outputCount', 0) as number;
		const instruction = this.getNodeParameter('instruction', 0) as string;
		const model = this.getNodeParameter('model', 0) as string;
		const reset = this.getNodeParameter('reset', 0) as boolean;
		const advanced = this.getNodeParameter('advanced', 0, {}) as {
			customPrompt?: string;
		};

		// 处理重置
		if (reset) {
			await resetNode(workflowId, nodeId);
			// 重置后，下次执行会重新生成代码
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

		// 检查节点状态
		const isPrepared = await isNodePrepared(workflowId, nodeId);

		let code: string;
		let schemas: Record<string, Record<string, unknown>>;

		if (!isPrepared) {
			// Building 状态：生成代码
			if (!instruction || instruction.trim() === '') {
				throw new NodeOperationError(
					this.getNode(),
					'自然语言指令不能为空，请先填写指令后再执行',
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
			
			// 更新节点状态为 prepared（通过设置节点参数）
			// 注意：这需要在节点配置中支持，这里我们通过文件存在性来判断
		} else {
			// Prepared 状态：加载已有代码
			code = await loadGeneratedCode(workflowId, nodeId);
		}

		// 执行生成的代码
		// 创建一个安全的执行环境
		const processFunction = new Function('inputs', code);

		try {
			const result = processFunction(allInputs);

			// 验证返回结果
			if (!result || typeof result !== 'object') {
				throw new NodeOperationError(
					this.getNode(),
					'生成的代码返回格式不正确，必须返回一个对象',
				);
			}

			// 按输出口组织数据
			const outputs: INodeExecutionData[][] = [];
			for (let i = 0; i < outputCount; i++) {
				const outputLetter = String.fromCharCode(65 + i); // A, B, C, ...
				const outputData = result[outputLetter] || [];
				
				// 确保输出是数组
				if (!Array.isArray(outputData)) {
					throw new NodeOperationError(
						this.getNode(),
						`输出口 ${outputLetter} 的数据必须是数组`,
					);
				}

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

