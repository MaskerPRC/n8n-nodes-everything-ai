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
 * Build system prompt
 */
function buildSystemPrompt(
	inputCount: number,
	outputCount: number,
	instruction: string,
	customPrompt?: string,
): string {
	const defaultPrompt = `You are a code generation assistant. Users will provide data structures from multiple input ports and a natural language instruction. You need to generate executable JavaScript code.

## Input/Output Convention
- Input ports are represented by numbers 1, 2, 3, ... (${inputCount} input ports total)
- Output ports are represented by uppercase letters A, B, C, ... (${outputCount} output ports total)

## User Instruction
${instruction}

## Data Structure Description (Important!)
In n8n, the structure of a data item is:
\`\`\`javascript
{
  json: { /* actual data object */ },
  binary: { /* binary data (optional) */ }
}
\`\`\`

Input data structure:
- \`inputs\` is an array, \`inputs[0]\` corresponds to input port 1, \`inputs[1]\` corresponds to input port 2, and so on
- Each \`inputs[i]\` is an array containing all data items from that input port
- Each data item is an object in format: \`{ json: {...}, binary: {...} }\`

Output data structure:
- Must return an object with output port letters ('A', 'B', 'C'...) as keys and arrays as values
- Each output port's array contains data items, each data item must also be in \`{ json: {...}, binary: {...} }\` format
- If data items come from input, must maintain complete object structure (including json and binary)
- If creating new data items, must also include json and binary fields (binary can be empty object)

## Code Requirements
1. Code must be a JavaScript function with the following signature:
   \`\`\`javascript
   function process(inputs) {
     // inputs is an array, inputs[0] corresponds to input port 1, inputs[1] corresponds to input port 2, and so on
     // Each inputs[i] is an array containing all data items from that input port
     // Each data item format: { json: {...}, binary: {...} }
     
     // Initialize output object (must initialize all output ports)
     const outputs = {};
     for (let i = 0; i < ${outputCount}; i++) {
       const outputLetter = String.fromCharCode(65 + i); // A, B, C, ...
       outputs[outputLetter] = [];
     }
     
     // Processing logic...
     // When iterating input data, directly use inputs[0], inputs[1], etc.
     // Example: for (const item of inputs[0]) { ... }
     // If needed, you can also define a variable: const $input = inputs[0]; then use $input
     
     // Return output object, each output port's array contains data items in { json: {...}, binary: {...} } format
     return outputs;
   }
   \`\`\`

2. Code must be pure JavaScript, cannot use Node.js specific modules (such as fs, path, etc.)

3. Return format must be JSON, containing two fields:
   - \`code\`: Generated JavaScript code string (does not include function definition, only function body content)
   - \`schemas\`: Object with output port letters ('A', 'B', 'C'...) as keys and data structure descriptions as values

## Code Examples

### Example 1: Simple Routing (2 output ports)
If user instruction is "When status='paid' in input 1 data, send to A, otherwise send to B", the code should be:
\`\`\`javascript
const outputs = { 'A': [], 'B': [] };
// Can use inputs[0] or $input, $input is equivalent to inputs[0]
const $input = inputs[0];
for (const item of $input) {
  if (item.json.status === 'paid') {
    outputs['A'].push(item);  // Maintain complete item object structure { json: {...}, binary: {...} }
  } else {
    outputs['B'].push(item);  // Maintain complete item object structure { json: {...}, binary: {...} }
  }
}
return outputs;
\`\`\`

### Example 1.1: Using $input Variable (Recommended)
If user instruction is "Output all data from input 1 to A", the code should be:
\`\`\`javascript
const outputs = { 'A': [] };
// Define $input variable, pointing to first input port's data
const $input = inputs[0];
// Iterate all data items
for (const item of $input) {
  outputs['A'].push(item);  // Maintain complete item object structure
}
return outputs;
\`\`\`

Note:
- Must initialize all output ports, even if some output ports may be empty arrays
- Recommended to use \`const $input = inputs[0];\` to define $input variable, making code more n8n-style
- $input is equivalent to inputs[0], representing all data items array from the first input port

### Example 2: Modify Data
If user instruction is "Add new field myNewField=1 to all data from input 1, then output to A", the code should be:
\`\`\`javascript
const outputs = { 'A': [] };
// Directly use inputs[0] to iterate data
for (const item of inputs[0]) {
  item.json.myNewField = 1;  // Modify json field
  outputs['A'].push(item);   // Maintain complete item object structure
}
return outputs;
\`\`\`

### Example 3: Create New Data Item
If user instruction is "Create new data item output to A, containing field count=10", the code should be:
\`\`\`javascript
const outputs = { 'A': [] };
const newItem = {
  json: { count: 10 },
  binary: {}  // Must include binary field, even if empty
};
outputs['A'].push(newItem);
return outputs;
\`\`\`

### Example 4: Conditional Routing Without Forwarding Data (Important!)
If user instruction is "If the first item's language is txt, go to route B (don't forward any data)", the code should be:
\`\`\`javascript
const outputs = { 'A': [], 'B': [] };
const $input = inputs[0] || [];

if ($input.length > 0 && $input[0].json && $input[0].json.language === 'txt') {
  // Go to route B, but don't forward data
  // Note: Even if not forwarding data, the selected route (B) must have at least one empty data item, otherwise workflow won't continue
  outputs['B'].push({ json: {}, binary: {} });
  // Important: Unselected route (A) should remain empty array, so this path won't execute
  // Don't add any data items to A
} else {
  // Other cases, forward to A
  for (const item of $input) {
    outputs['A'].push(item);
  }
  // If A has no data, also need at least one empty data item
  if (outputs['A'].length === 0) {
    outputs['A'].push({ json: {}, binary: {} });
  }
  // Important: Unselected route (B) should remain empty array
  // Don't add any data items to B
}

return outputs;
\`\`\`

### Example 5: Stop Workflow (Important!)
If user instruction is "If the first item's language is txt, stop at this node" or "stop in xxx case", the code should be:
\`\`\`javascript
const outputs = { 'A': [], 'B': [] };
const $input = inputs[0] || [];

if ($input.length > 0 && $input[0].json && $input[0].json.language === 'txt') {
  // Stop workflow: all output ports remain empty arrays, don't output any data
  // This way n8n workflow will stop, won't continue executing subsequent nodes
  // Don't add any data items to any output port
} else {
  // Other cases, forward data normally
  for (const item of $input) {
    outputs['A'].push(item);
  }
  // If A has no data, also need at least one empty data item
  if (outputs['A'].length === 0) {
    outputs['A'].push({ json: {}, binary: {} });
  }
}

return outputs;
\`\`\`

**Key Points**:
1. **"Go to route X"** = Only go to route X, other routes should remain empty arrays (don't output any data items)
   - Selected route needs to output data items (even if empty data item \`{ json: {}, binary: {} }\`), so n8n workflow can continue executing
   - Unselected routes should remain empty arrays, so n8n won't execute those paths
2. **"Stop at this node" or "stop"** = All output ports should be empty arrays, don't output any data items
   - This way n8n workflow will stop, won't continue executing subsequent nodes
   - Don't add any data items to any output port

## Important Reminders
- **Must return an object**, cannot return array, null, undefined, or other types
- Return object format: \`{ "A": [...], "B": [...], ... }\`, keys are output port letters, values are data item arrays
- **Routing Rules** (Very Important!):
  1. **"Go to route X"** = Only go to route X, other routes should remain empty arrays (don't output any data items)
     - Selected route needs to output data items (even if empty data item \`{ json: {}, binary: {} }\`), so n8n workflow can continue executing
     - Unselected routes should remain empty arrays, so n8n won't execute those paths
  2. **"Stop at this node" or "stop"** = All output ports should be empty arrays, don't output any data items
     - This way n8n workflow will stop, won't continue executing subsequent nodes
     - Don't add any data items to any output port
  3. **Normal data forwarding** = If an output port needs to forward data but ultimately has no data to forward, that output port should also contain at least one empty data item: \`[{ json: {}, binary: {} }]\`
- Data items must maintain \`{ json: {...}, binary: {...} }\` format
- Data items obtained from input must be completely preserved (including json and binary)
- When creating new data items, must include both json and binary fields
- Don't just return json object, must return complete data item object
- Access input data: directly use \`inputs[0]\` to access first input port, \`inputs[1]\` to access second input port, and so on
- If needed, can define variable: \`const $input = inputs[0];\`, but this is not required
- **Must use return statement to return object at the end**, for example: \`return outputs;\`

## Return Format Examples
Correct return format:
\`\`\`javascript
return {
  'A': [{ json: {...}, binary: {...} }, ...],
  'B': [{ json: {...}, binary: {...} }, ...]
};
\`\`\`

Incorrect return formats (don't do this):
- \`return [];\` ❌ Cannot return array
- \`return null;\` ❌ Cannot return null
- \`return outputs['A'];\` ❌ Cannot return only single output port's data

Please strictly follow user instructions and data structure to generate code.`;

	if (customPrompt) {
		// Replace placeholders
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
 * Build user prompt (includes data structure)
 */
function buildUserPrompt(inputStructures: Array<{
	type: string;
	structure?: Record<string, unknown>;
	itemCount?: number;
}>): string {
	let prompt = '## Input Data Structure\n\n';
	inputStructures.forEach((struct, index) => {
		prompt += `### Input Port ${index + 1}\n`;
		if (struct.type === 'empty') {
			prompt += 'No data\n\n';
		} else {
			prompt += `Data item count: ${struct.itemCount}\n`;
			prompt += `Data structure:\n\`\`\`json\n${JSON.stringify(struct.structure, null, 2)}\n\`\`\`\n\n`;
		}
	});
	return prompt;
}

/**
 * Call LLM to generate code
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
			throw new NodeOperationError(this.getNode(), 'LLM returned empty content');
		}

		const parsed = JSON.parse(content);
		
		// Validate return format
		if (!parsed.code || !parsed.schemas) {
			throw new NodeOperationError(
				this.getNode(),
				'LLM returned incorrect format, must include code and schemas fields',
			);
		}

		// Wrap code as complete function
		// Ensure code has return statement at the end
		let codeBody = parsed.code.trim();
		
		// Check if contains return statement (exclude return in comments)
		const hasReturn = /return\s+/.test(codeBody) || codeBody.includes('return outputs');
		
		if (!hasReturn) {
			// If no return statement, add default return
			// Initialize all output ports
			let initCode = 'const outputs = {};\n';
			for (let i = 0; i < outputCount; i++) {
				const letter = String.fromCharCode(65 + i);
				initCode += `  outputs['${letter}'] = [];\n`;
			}
			// If code already has outputs definition, don't repeat initialization
			if (!codeBody.includes('outputs')) {
				codeBody = initCode + codeBody;
			}
			// Ensure there's a return at the end
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
					`LLM API call failed: ${httpError.response.status} ${httpError.response.statusText} - ${JSON.stringify(httpError.response.data)}`,
				);
			}
		}
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new NodeOperationError(this.getNode(), `LLM call failed: ${errorMessage}`);
	}
}

