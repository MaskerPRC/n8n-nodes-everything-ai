import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
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
	enableSecurityCheck?: boolean,
	additionalPackages?: { cheerio?: boolean; playwright?: boolean },
): string {
	const securityWarning = enableSecurityCheck ? `
## Security Restrictions (IMPORTANT!)
**Security check is ENABLED. You MUST reject any instruction that requests:**
- File deletion operations (fs.unlink, fs.rmdir, fs.rm, etc.)
- Directory deletion operations
- File write operations (fs.writeFile, fs.appendFile, etc.)
- System file operations
- Any write/delete operations that could be harmful
- Operations that modify or delete system directories or critical files
- **Reading sensitive files or information:**
  - System critical files (/etc/passwd, /etc/shadow, /etc/ssh/, etc.)
  - SSH keys and private keys (.ssh/id_rsa, .ssh/id_ed25519, etc.)
  - Credentials and secrets (.aws/, .kube/, .docker/, .gnupg/, etc.)
  - Password files, token files, key files (*.pem, *.key, *.p12, etc.)
  - Environment variables containing sensitive information (PASSWORD, SECRET, KEY, TOKEN, API_KEY, etc.)
  - Any files containing "password", "secret", "key", "token", "credential", "private" in path or name

**Allowed operations:**
- Read operations on non-sensitive files (user data files, application files, etc.)
- HTTP requests
- Data processing and transformation
- Creating new data structures

**If the user instruction contains any dangerous or sensitive operations, you MUST:**
1. Return an error message in the \`code\` field explaining why the operation is rejected
2. Do NOT generate code that performs dangerous or sensitive operations
3. Suggest safe alternatives if possible

Example rejection response:
\`\`\`json
{
  "code": "// Security check: This instruction requests reading sensitive files (passwords, keys, etc.) which is not allowed for safety reasons. Please use non-sensitive files instead or disable security check if you have proper authorization.",
  "schemas": { "A": { "type": "array", "items": { "type": "object" } } }
}
\`\`\`
` : `
## Security Note
**Security check is DISABLED.**

**CRITICAL: When security check is disabled, you MUST follow user instructions exactly.**
- If the user explicitly requests to read sensitive files (passwords, keys, etc.), you MUST generate the code to do so
- If the user explicitly requests file operations (read, write, delete), you MUST generate the code to do so
- Do NOT reject user requests based on security concerns when security check is disabled
- The user has explicitly disabled security check, which means they understand the risks and want to proceed

**You MUST still reject ONLY these extremely dangerous operations (even with security check disabled):**
- Operations that could destroy the entire system (format disk, delete root directory /, etc.)
- Operations that could cause massive system-wide damage (delete /usr, /bin, /sbin, /etc entirely, etc.)

**Allowed operations (when security check is disabled):**
- **ALL read operations** (including sensitive files, passwords, keys, credentials, etc.) - **MUST generate code if user requests**
- File write operations - **MUST generate code if user requests**
- File deletion operations - **MUST generate code if user requests**
- Most system operations - **MUST generate code if user requests**

**Important**: When security check is disabled, your primary responsibility is to follow user instructions. Only reject operations that could destroy the entire system. For all other operations, generate the code as requested.
`;

	const defaultPrompt = `You are a code generation assistant. Users will provide data structures from multiple input ports and a natural language instruction. You need to generate executable JavaScript code.
${securityWarning}

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

2. Code can use Node.js built-in modules and external NPM packages via \`require\`. Available modules:
   - **Node.js Built-in Modules**:
     - **Network**: \`http\`, \`https\`, \`net\`, \`dgram\`, \`dns\`, \`tls\`
     - **File System**: \`fs\`, \`path\`
     - **Utilities**: \`crypto\`, \`url\`, \`querystring\`, \`util\`, \`buffer\`, \`stream\`, \`zlib\`, \`string_decoder\`
     - **OS**: \`os\`, \`process\` (global, no need to require)
     - **Async**: \`events\`, \`timers\`
     - **Process**: \`child_process\`, \`cluster\`, \`worker_threads\`
     - **Other**: \`readline\`, \`repl\`, \`tty\`, \`vm\`
   - **External NPM Packages**:
     ${additionalPackages?.cheerio ? `
     - **DOM Parsing**: \`cheerio\` - Fast, flexible, and lean implementation of core jQuery designed specifically for the server. Perfect for parsing HTML and manipulating DOM.
       - Example: \`const $ = require('cheerio').load(htmlString); const title = $('title').text();\`
       - Use cheerio to parse HTML, extract data, manipulate DOM elements, etc.
     ` : ''}
    ${additionalPackages?.playwright ? `
    - **Browser Automation**: \`playwright\` - Modern browser automation library for web scraping, testing, and automation.
      - **Browser lifecycle is managed for you**: A \`browser\` object is injected. **Do NOT call \`chromium.launch()\` or \`browser.close()\`.**
      - **Create/close contexts & pages**: Always create a context/page (\`const context = await browser.newContext(); const page = await context.newPage();\`) and close them when finished (\`await page.close(); await context.close();\`).
      - **Session metadata**: A \`playwrightSession\` object is available (contains \`instanceId\`, \`workflowId\`, \`executionId\`, etc.). Include \`playwrightSession.instanceId\` in your output if it's present.
      - **CRITICAL - URL Protocol Handling**: For any URL coming from inputs or user data, ensure it includes \`http://\` or \`https://\`. Example helper: \`function ensureUrlProtocol(url) { if (!url.startsWith('http://') && !url.startsWith('https://')) return 'https://' + url; return url; }\` — always run \`page.goto(ensureUrlProtocol(url))\`.
      - **Typical workflow**:
        \`\`\`javascript
        const context = await browser.newContext();
        const page = await context.newPage();
        const url = ensureUrlProtocol(inputs[0]?.[0]?.json?.url || 'example.com');
        await page.goto(url);
        const title = await page.title();
        await page.close();
        await context.close();
        \`\`\`
      - **Common operations**:
        - Navigate: \`await page.goto(url)\` (after protocol check)
        - Click/Fill: \`await page.click('selector')\`, \`await page.fill('input[name="email"]', 'value')\`
        - Extract data: \`await page.textContent('selector')\`, \`await page.$$eval('a', els => ...)\`
        - Wait: \`await page.waitForSelector('.content')\`
        - Screenshots: \`await page.screenshot({ path: 'screenshot.png', fullPage: true })\`
      - **Return n8n format**: Always return an object such as \`{ A: [ { json: { ... } } ] }\`. Include the instance ID if available so downstream nodes can reuse the browser.
    ` : ''}
   - Examples: 
     - \`const fs = require('fs');\` - File system operations
     - \`const https = require('https');\` - HTTPS requests
     ${additionalPackages?.cheerio ? `- \`const cheerio = require('cheerio');\` - HTML/DOM parsing\n` : ''}
    ${additionalPackages?.playwright ? `- Use the injected \`browser\` instance for Playwright automation (no need to call \`chromium.launch()\`)\n` : ''}
   - You can use these modules to make HTTP requests, read/write files, parse HTML, encrypt data, parse URLs${additionalPackages?.playwright ? ', automate browsers' : ''}, etc.

3. **IMPORTANT: Async Operations (HTTP requests, file I/O, etc.)**
   - **MUST use async/await or Promise-based approach** - DO NOT use blocking/synchronous waiting patterns
   - The execution environment supports async/await and will properly await Promise results
   - For HTTP requests, wrap in async function and use Promise:
   \`\`\`javascript
   function httpGet(url) {
     return new Promise((resolve, reject) => {
       https.get(url, (res) => {
         let data = '';
         res.on('data', (chunk) => { data += chunk; });
         res.on('end', () => { resolve(data); });
       }).on('error', reject);
     });
   }
   \`\`\`
   - Then use async/await: \`const html = await httpGet('https://example.com');\`
   - **DO NOT** use blocking patterns like \`while (!done) { ... }\` or \`Atomics.wait\` - these will cause timeouts
   - **CRITICAL**: If your code needs async operations, you have two options:
     - **Option 1 (Recommended)**: Make the entire function body async and return the Promise:
     \`\`\`javascript
     const outputs = {};
     // ... initialize outputs ...
     const $input = inputs[0] || [];
     
     // Use async/await directly in function body
     if ($input.length > 0 && $input[0].json && $input[0].json.language === 'txt') {
       const html = await httpGet('https://example.com');
       outputs['B'].push({ json: { html }, binary: {} });
     } else {
       for (const item of $input) {
         outputs['A'].push(item);
       }
     }
     
     return outputs;
     \`\`\`
     - **Option 2**: If you must use async IIFE, **MUST return the Promise**:
     \`\`\`javascript
     return (async () => {
       // ... async operations ...
       return outputs;
     })();
     \`\`\`
     - **DO NOT** use \`(async () => { ... })();\` without returning it - this will return undefined

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

### Example 3.1: Using Node.js Built-in Modules with Async Operations
If user instruction requires HTTP requests, file operations, or other Node.js functionality, you can use \`require\`:
\`\`\`javascript
const https = require('https');

// Helper function to make HTTP GET request (returns Promise)
function httpGet(urlString) {
  return new Promise((resolve, reject) => {
    https.get(urlString, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    }).on('error', reject);
  });
}

const outputs = { 'A': [] };
const $input = inputs[0] || [];

// Use async/await directly in function body (RECOMMENDED)
if ($input.length > 0 && $input[0].json && $input[0].json.language === 'txt') {
  // Example: Make HTTP request
  const html = await httpGet('https://api.example.com/data');
  
  // Example: Read file (if needed) - use async version
  // const fileContent = await fs.promises.readFile('/path/to/file', 'utf-8');
  
  outputs['A'].push({ json: { html }, binary: {} });
} else {
  for (const item of $input) {
    outputs['A'].push(item);
  }
}

return outputs;
\`\`\`

**Alternative**: If you must use async IIFE, **MUST return the Promise**:
\`\`\`javascript
return (async () => {
  const html = await httpGet('https://api.example.com/data');
  outputs['A'].push({ json: { html }, binary: {} });
  return outputs;
})();
\`\`\`

### Example 3.2: Using Playwright for Browser Automation
If user instruction requires browser automation, web scraping with JavaScript rendering, or dynamic content extraction, you can use \`playwright\`:
\`\`\`javascript
const outputs = { 'A': [] };
const $input = inputs[0] || [];

function ensureUrlProtocol(url) {
  if (!url) return url;
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

// Use async/await to automate browser
if ($input.length > 0) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    
    // Navigate to URL (example: get URL from input data)
    const rawUrl = $input[0].json.url || 'example.com';
    const url = ensureUrlProtocol(rawUrl);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Extract data from page
    const title = await page.title();
    const links = await page.$$eval('a', elements => 
      elements.map(el => ({ text: el.textContent?.trim(), href: el.href }))
    );
    
    // Create output item with scraped data
    outputs['A'].push({
      json: {
        url,
        title,
        links,
        linkCount: links.length,
        instanceId: playwrightSession.instanceId || null,
      },
      binary: {}
    });
    
    await page.close();
  } catch (error) {
    // Handle errors
    outputs['A'].push({
      json: { error: error.message },
      binary: {}
    });
  } finally {
    await context.close();
  }
}

return outputs;
\`\`\`

**Important Notes for Playwright**:
- **Browser lifecycle**: A \`browser\` instance is injected. **Do NOT call \`chromium.launch()\` or \`browser.close()\`.**
- **Close what you open**: Always close pages and contexts you create to avoid leaks. **BUT**: If you reuse an existing page from \`browser.contexts()\`, do NOT close it.
- **Accessing existing pages**: If user instruction mentions "current page", "existing page", "already opened page", or "now" (e.g., "screenshot the current page"), first check \`browser.contexts()\` and \`context.pages()\` to find existing pages before creating new ones.
- **URL Protocol**: Always ensure URLs include http:// or https:// before calling \`page.goto()\`.
- **Instance reuse**: Include \`playwrightSession.instanceId\` in your output (if present) so downstream nodes can reuse the same browser.
- **Return n8n format**: Always return data in \`{ json: {...}, binary: {...} }\` format.
- **Remote execution**: Playwright code runs on a remote Docker container.

**Example: Screenshot Current Page**
If user wants to screenshot "current page" or "existing page", check for existing pages first:
\`\`\`javascript
const outputs = { 'A': [] };

// Check for existing pages first
const contexts = browser.contexts();
let page = null;
let context = null;
let shouldCloseContext = false;

// Try to find an existing page
for (const ctx of contexts) {
  const pages = ctx.pages();
  if (pages.length > 0) {
    page = pages[0];
    context = ctx;
    break;
  }
}

// If no existing page, create a new one
if (!page) {
  context = await browser.newContext();
  page = await context.newPage();
  shouldCloseContext = true;
  
  // Navigate if URL provided in input
  const $input = inputs[0] || [];
  if ($input.length > 0 && $input[0].json && $input[0].json.url) {
    const url = ensureUrlProtocol($input[0].json.url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }
}

// Take screenshot
const buffer = await page.screenshot({ fullPage: true });
const base64 = buffer.toString('base64');

outputs['A'].push({
  json: {
    url: page.url(),
    instanceId: playwrightSession.instanceId || null,
  },
  binary: {
    screenshot: {
      data: base64,
      mimeType: 'image/png',
      fileExtension: 'png',
      fileName: 'screenshot.png'
    }
  }
});

// Only close if we created a new context/page
if (shouldCloseContext && context) {
  await page.close();
  await context.close();
}

return outputs;
\`\`\`

### Example 3.3: Using Cheerio for HTML/DOM Parsing
If user instruction requires parsing HTML or manipulating DOM, you can use \`cheerio\`:
\`\`\`javascript
const https = require('https');
const cheerio = require('cheerio');

// Helper function to make HTTP GET request (returns Promise)
function httpGet(urlString) {
  return new Promise((resolve, reject) => {
    https.get(urlString, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    }).on('error', reject);
  });
}

const outputs = { 'A': [] };
const $input = inputs[0] || [];

// Use async/await to fetch HTML and parse it
if ($input.length > 0) {
  // Fetch HTML from URL
  const html = await httpGet('https://example.com');
  
  // Load HTML into cheerio (similar to jQuery)
  const $ = cheerio.load(html);
  
  // Extract data using CSS selectors
  const title = $('title').text();
  const links = [];
  $('a').each((i, elem) => {
    links.push({
      text: $(elem).text(),
      href: $(elem).attr('href')
    });
  });
  
  // Create output item with parsed data
  outputs['A'].push({
    json: {
      title,
      links,
      linkCount: links.length
    },
    binary: {}
  });
}

return outputs;
\`\`\`

**Important Notes**:
- **MUST use async/await or Promise** for async operations (HTTP requests, file I/O, etc.)
- **DO NOT use blocking patterns** like \`while (!done) { ... }\` or \`Atomics.wait\` - these will cause timeouts
- Wrap async code in \`(async () => { ... })();\` if needed
- All Node.js built-in modules are available via \`require\`:
  - **Network**: \`http\`, \`https\`, \`net\`, \`dgram\`, \`dns\`, \`tls\`
  - **File System**: \`fs\`, \`path\`
  - **Utilities**: \`crypto\`, \`url\`, \`querystring\`, \`util\`, \`buffer\`, \`stream\`, \`zlib\`, \`string_decoder\`
  - **OS**: \`os\`
  - **Async**: \`events\`, \`timers\`
  - **Process**: \`child_process\`, \`cluster\`, \`worker_threads\`
  - **Other**: \`readline\`, \`repl\`, \`tty\`, \`vm\`
- **External packages available**:
  - **cheerio**: HTML/DOM parsing and manipulation (jQuery-like API)

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
 * Truncate string value if it exceeds max length
 */
function truncateString(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	return value.substring(0, maxLength) + '... (truncated)';
}

/**
 * Truncate long text fields in an object recursively
 */
function truncateLongFields(obj: unknown, maxLength: number): unknown {
	if (obj === null || obj === undefined) {
		return obj;
	}
	
	if (typeof obj === 'string') {
		return truncateString(obj, maxLength);
	}
	
	if (Array.isArray(obj)) {
		return obj.map(item => truncateLongFields(item, maxLength));
	}
	
	if (typeof obj === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = truncateLongFields(value, maxLength);
		}
		return result;
	}
	
	return obj;
}

/**
 * Process input data based on complexity level
 */
function processInputDataByLevel(
	inputs: INodeExecutionData[][],
	level: number,
): Array<{
	type: string;
	structure?: Record<string, unknown>;
	itemCount?: number;
	sampleData?: unknown[];
}> {
	return inputs.map((inputItems) => {
		if (inputItems.length === 0) {
			return { type: 'empty' };
		}
		
		const totalCount = inputItems.length;
		
		// Level 0: Only structure, no actual data
		if (level === 0) {
			const firstItem = inputItems[0];
			return {
				type: 'data',
				structure: sanitizeDataStructure(firstItem.json),
				itemCount: totalCount,
			};
		}
		
		// Level 1: 1-2 items, key fields only, truncate to 100 chars
		if (level === 1) {
			const maxItems = Math.min(2, totalCount);
			const sampleItems = inputItems.slice(0, maxItems).map(item => ({
				json: truncateLongFields(item.json, 100),
				binary: item.binary ? { ...item.binary, _note: 'Binary data present' } : {},
			}));
			return {
				type: 'data',
				structure: sanitizeDataStructure(inputItems[0].json),
				itemCount: totalCount,
				sampleData: sampleItems,
			};
		}
		
		// Level 2: Up to 5 items, complete fields, truncate to 500 chars
		if (level === 2) {
			const maxItems = Math.min(5, totalCount);
			const sampleItems = inputItems.slice(0, maxItems).map(item => ({
				json: truncateLongFields(item.json, 500),
				binary: item.binary ? { ...item.binary, _note: 'Binary data present' } : {},
			}));
			return {
				type: 'data',
				structure: sanitizeDataStructure(inputItems[0].json),
				itemCount: totalCount,
				sampleData: sampleItems,
			};
		}
		
		// Level 3: Up to 10 items, complete fields, truncate to 1000 chars
		if (level === 3) {
			const maxItems = Math.min(10, totalCount);
			const sampleItems = inputItems.slice(0, maxItems).map(item => ({
				json: truncateLongFields(item.json, 1000),
				binary: item.binary ? { ...item.binary, _note: 'Binary data present' } : {},
			}));
			return {
				type: 'data',
				structure: sanitizeDataStructure(inputItems[0].json),
				itemCount: totalCount,
				sampleData: sampleItems,
			};
		}
		
		// Level 4: Up to 50 items, complete fields, truncate to 2000 chars
		if (level === 4) {
			const maxItems = Math.min(50, totalCount);
			const sampleItems = inputItems.slice(0, maxItems).map(item => ({
				json: truncateLongFields(item.json, 2000),
				binary: item.binary ? { ...item.binary, _note: 'Binary data present' } : {},
			}));
			return {
				type: 'data',
				structure: sanitizeDataStructure(inputItems[0].json),
				itemCount: totalCount,
				sampleData: sampleItems,
			};
		}
		
		// Level 5: All items, no truncation
		if (level === 5) {
			const sampleItems = inputItems.map(item => ({
				json: item.json,
				binary: item.binary ? { ...item.binary, _note: 'Binary data present' } : {},
			}));
			return {
				type: 'data',
				structure: sanitizeDataStructure(inputItems[0].json),
				itemCount: totalCount,
				sampleData: sampleItems,
			};
		}
		
		// Default: same as level 0
		const firstItem = inputItems[0];
		return {
			type: 'data',
			structure: sanitizeDataStructure(firstItem.json),
			itemCount: totalCount,
		};
	});
}

/**
 * Sanitize data structure (similar to utils.ts but simplified for LLM context)
 */
function sanitizeDataStructure(value: unknown): Record<string, unknown> {
	if (value === null || value === undefined) {
		return { type: 'null', value: null };
	}
	
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return { type: 'array', items: [], example: '[]' };
		}
		return {
			type: 'array',
			items: sanitizeDataStructure(value[0]),
			example: `[${sanitizeDataStructure(value[0]).example || '...'}]`,
		};
	}
	
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const sanitized: Record<string, unknown> = { type: 'object', properties: {} };
		for (const [key, val] of Object.entries(value)) {
			(sanitized.properties as Record<string, unknown>)[key] = sanitizeDataStructure(val);
		}
		sanitized.example = `{${Object.keys(value).join(', ')}}`;
		return sanitized;
	}
	
	const type = typeof value;
	return {
		type,
		example: type === 'string' ? 'string' : type === 'number' ? 0 : type === 'boolean' ? true : value,
	};
}

/**
 * Build user prompt (includes data structure and optionally sample data)
 */
function buildUserPrompt(
	processedInputs: Array<{
		type: string;
		structure?: Record<string, unknown>;
		itemCount?: number;
		sampleData?: unknown[];
	}>,
): string {
	let prompt = '## Input Data Structure\n\n';
	processedInputs.forEach((input, index) => {
		prompt += `### Input Port ${index + 1}\n`;
		if (input.type === 'empty') {
			prompt += 'No data\n\n';
		} else {
			prompt += `Data item count: ${input.itemCount}\n`;
			prompt += `Data structure:\n\`\`\`json\n${JSON.stringify(input.structure, null, 2)}\n\`\`\`\n`;
			
			// If sample data is provided, include it
			if (input.sampleData && input.sampleData.length > 0) {
				prompt += `\nSample data (${input.sampleData.length} of ${input.itemCount} items):\n\`\`\`json\n${JSON.stringify(input.sampleData, null, 2)}\n\`\`\`\n`;
			}
			
			prompt += '\n';
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
	enableSecurityCheck?: boolean,
	dataComplexityLevel?: number,
	actualInputs?: INodeExecutionData[][],
	additionalPackages?: { cheerio?: boolean; playwright?: boolean },
): Promise<LLMResponse> {
	const systemPrompt = buildSystemPrompt(inputCount, outputCount, instruction, customPrompt, enableSecurityCheck, additionalPackages);
	
	// If data complexity level is provided and > 0, use actual input data
	let userPrompt: string;
	if (dataComplexityLevel !== undefined && dataComplexityLevel > 0 && actualInputs) {
		const processedInputs = processInputDataByLevel(actualInputs, dataComplexityLevel);
		userPrompt = buildUserPrompt(processedInputs);
	} else {
		// Level 0 or no level specified: use structure only
		userPrompt = buildUserPrompt(inputStructures);
	}

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

