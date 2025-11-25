/**
 * Playwright Documentation for LLM Code Generation
 * 
 * This file contains documentation and examples for using Playwright in generated code.
 * The documentation is provided to the LLM when Playwright is enabled as an external package.
 */

export const PLAYWRIGHT_DOCUMENTATION = `
## Playwright Browser Automation

Playwright is available for browser automation tasks. The remote execution server launches and manages the browser instance for you:

- A Playwright \`browser\` object is injected automatically. **Never call \`chromium.launch()\` or \`browser.close()\`.**
- Create your own contexts/pages inside the code and close them when finished.
- A \`playwrightSession\` object is available (with \`instanceId\`, \`workflowId\`, \`executionId\`, etc.) so you can understand which browser instance you're using.

### URL Protocol Handling (MANDATORY)

Always ensure URLs include a protocol before calling \`page.goto\`. If missing, prepend \`https://\`.

\`\`\`javascript
function ensureUrlProtocol(url) {
  if (!url) return url;
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

const rawUrl = inputs[0]?.[0]?.json?.url || 'example.com';
const url = ensureUrlProtocol(rawUrl);
await page.goto(url);
\`\`\`

### Common Operations

**1. Navigate and Get Content**
\`\`\`javascript
const context = await browser.newContext();
const page = await context.newPage();

const url = ensureUrlProtocol('example.com');
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });

const html = await page.content();
const title = await page.title();

// Do NOT close page/context unless user explicitly asks
// Keeping pages open allows downstream nodes to access them and enables automatic screenshots
// await page.close();
// await context.close();
\`\`\`

**2. Click / Fill / Extract**
\`\`\`javascript
await page.click('text=Submit', { timeout: 5000 });
await page.fill('input[name="email"]', 'user@example.com', { timeout: 5000 });

const links = await page.$$eval('a', elements =>
  elements.map(el => ({ text: el.textContent?.trim(), href: el.href }))
);
\`\`\`

**2.1. Clipboard Operations (Copy/Paste)**
When working with clipboard, you need to grant permissions and use the browser's clipboard API:
\`\`\`javascript
// Grant clipboard permissions to the context
await context.grantPermissions(['clipboard-read', 'clipboard-write']);

// Click copy button
await page.click('button#copy', { timeout: 5000 });

// Wait a moment for clipboard to be updated
await page.waitForTimeout(100);

// Read clipboard content using browser API
const clipboardText = await page.evaluate(async () => {
  return await navigator.clipboard.readText();
});

// Use the clipboard content
console.log('Copied text:', clipboardText);
\`\`\`

**IMPORTANT**: Clipboard is shared within the same browser context. If you click copy in one node and want to read clipboard in the next node, make sure:
1. Both nodes use the same context (keepContext=true)
2. Grant clipboard permissions: \`await context.grantPermissions(['clipboard-read', 'clipboard-write'])\`
3. Use \`page.evaluate(() => navigator.clipboard.readText())\` to read clipboard, not system clipboard APIs

**3. Screenshots & Waiting**
\`\`\`javascript
await page.waitForSelector('.content', { timeout: 5000 });
await page.screenshot({ path: 'fullpage.png', fullPage: true });
\`\`\`

**4. Waiting for Network Requests (After Clicking Buttons)**
When clicking a button that triggers a network request, always wait for the response with an explicit timeout:
\`\`\`javascript
// Click button and wait for the response
const [response] = await Promise.all([
  page.waitForResponse(response => response.url().includes('/api/data'), { timeout: 5000 }),
  page.click('button#submit', { timeout: 5000 })
]);

// Or wait for navigation after click
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 }),
  page.click('button#submit', { timeout: 5000 })
]);

// Or wait for load state
await page.click('button#submit', { timeout: 5000 });
await page.waitForLoadState('networkidle', { timeout: 5000 });
\`\`\`

**5. All Waiting Operations Must Have Timeout**
**CRITICAL**: All waiting operations MUST have an explicit timeout to avoid hanging. Default is 5 seconds (5000ms) unless user explicitly specifies otherwise:
\`\`\`javascript
// ✅ CORRECT - Always set timeout
await page.waitForSelector('.content', { timeout: 5000 });
await page.waitForResponse(response => response.status() === 200, { timeout: 5000 });
await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
await page.waitForLoadState('networkidle', { timeout: 5000 });

// ❌ WRONG - Missing timeout (will hang if element never appears)
await page.waitForSelector('.content');
await page.waitForResponse(response => response.status() === 200);
await page.waitForNavigation();
\`\`\`

**6. Accessing Existing Pages (Reusing Pages from Previous Nodes)**
**CRITICAL**: ALWAYS check for existing pages first. Only create a new page when the user explicitly says "打开" (open), "访问" (visit), "导航到" (navigate to), etc.
\`\`\`javascript
// ALWAYS check for existing pages first
const contexts = browser.contexts();
let page = null;
let context = null;

// Try to find an existing page
for (const ctx of contexts) {
  const pages = ctx.pages();
  if (pages.length > 0) {
    page = pages[0]; // Use the first available page
    context = ctx;
    break;
  }
}

// Only create new page if user explicitly says to open/navigate
// AND no existing page found
// Do NOT automatically navigate just because input has URL
// Input fields are just data, not navigation instructions
if (!page) {
  // Check if user instruction explicitly mentions navigation
  // Keywords: "打开" (open), "访问" (visit), "导航" (navigate), "去" (go to)
  // If user just says "点击" (click), "填写" (fill), "获取" (get), etc.,
  // do NOT create new page - this means no existing page, so operation will fail
  // But if user says "打开xxx页面" (open xxx page), then create new page
  const userWantsToNavigate = true; // In real code, check user instruction
  
  if (userWantsToNavigate) {
    context = await browser.newContext();
    page = await context.newPage();
    // Only navigate if URL is provided AND user explicitly says to open/navigate
    // Do NOT use input URL automatically - only if user mentions it
    const url = ensureUrlProtocol(inputs[0]?.[0]?.json?.url || 'example.com');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
  }
}

// Now use the page (either existing or newly created)
if (page) {
  const screenshot = await page.screenshot({ fullPage: true });
  // Do NOT close page/context unless user explicitly asks
}
\`\`\`

### Returning Data to n8n

Always return data in the correct n8n structure. Include the Playwright instance ID (if available) so downstream nodes can reuse the browser.

\`\`\`javascript
const outputs = { A: [] };

const context = await browser.newContext();
const page = await context.newPage();

const url = ensureUrlProtocol(inputs[0]?.[0]?.json?.url || 'example.com');
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });

const title = await page.title();

// Do NOT close page/context unless user explicitly asks
// Keeping pages open allows downstream nodes to access them
// await page.close();
// await context.close();

outputs.A.push({
  json: {
    url,
    title,
    instanceId: playwrightSession.instanceId || null,
  },
  binary: {},
});

return outputs;
\`\`\`

### Important Rules

1. **Browser lifecycle**: Use the injected \`browser\`. Do not launch or close it yourself.
2. **Default timeout is 5 seconds (5000ms)**: All Playwright operations (goto, click, fill, waitForSelector, waitForResponse, waitForNavigation, etc.) should use \`{ timeout: 5000 }\` as the default timeout unless the user explicitly specifies a different timeout in their requirements. Only use longer timeouts if the user explicitly requests them (e.g., "wait 30 seconds", "timeout 10 seconds").
3. **CRITICAL - All waiting operations MUST have timeout**: Every waiting operation (waitForSelector, waitForResponse, waitForNavigation, waitForLoadState) MUST include an explicit timeout parameter. Never use waiting operations without timeout as they can hang indefinitely. Default timeout is 5 seconds (5000ms) for short waits, unless user explicitly requests a longer wait time.
4. **Waiting for network requests after clicks**: When clicking buttons that trigger network requests, always use Promise.all() to wait for the response with timeout: \`await Promise.all([page.waitForResponse(...), page.click(...)])\`. This prevents hanging if the request never completes.
5. **CRITICAL - Return data when user asks to "get" or "fetch" content**: When the user instruction contains phrases like "获取" (get), "获取xxx内容" (get xxx content), "提取" (extract), "读取" (read), "获取数据" (get data), "返回" (return), etc., you MUST return that data in the output. The user is explicitly asking you to retrieve and return data, so always include it in the output object (e.g., \`outputs.A.push({ json: { content: ... } })\`).
6. **Clipboard operations**: When working with clipboard (copy/paste), you must:
   - Grant clipboard permissions: \`await context.grantPermissions(['clipboard-read', 'clipboard-write'])\`
   - Use browser clipboard API: \`await page.evaluate(() => navigator.clipboard.readText())\`
   - Clipboard is shared within the same browser context, so if you copy in one node and read in the next, ensure both use the same context (keepContext=true)
7. **Keep pages open by default**: **Do NOT close pages or contexts unless the user explicitly asks to close them.** This allows:
   - Downstream nodes to access the same pages
   - Automatic screenshots to capture the current state
   - Better performance by reusing browser sessions
   Only close when the user instruction explicitly mentions closing, cleaning up, or finishing the page/context.
8. **CRITICAL - Use existing pages by default**: **ALWAYS check for existing pages first before creating new ones.** Only create a new page/context when the user explicitly says "打开" (open), "访问" (visit), "导航到" (navigate to), "去" (go to), or similar navigation commands. If the user just says "点击" (click), "填写" (fill), "获取" (get), etc. without mentioning navigation, use the existing page from the current execution.
   - **Input fields do NOT mean navigation**: Do NOT automatically use input field URLs for navigation unless the user explicitly mentions it in their prompt. Input fields are just data, not navigation instructions.
   - **Default behavior**: If user doesn't say "打开xxx页面" (open xxx page), work on the current page in the current execution's browser context.
   - **Example**: If user says "点击提交按钮" (click submit button), do NOT create a new page or navigate. Just find the existing page and click the button.
9. **URL safety**: Enforce URL protocols with \`ensureUrlProtocol\`.
10. **Return format**: The result must be an object whose keys are output letters (A, B, C...) mapped to arrays of items.
11. **Session reuse**: If \`playwrightSession.instanceId\` is set, include it in your output. Downstream nodes can feed it back in to reuse the same browser.
12. **Remote execution**: Code runs inside a Docker container; file paths are relative to that container.

### Example: Scrape a Website

\`\`\`javascript
const outputs = { A: [] };

function ensureUrlProtocol(url) {
  if (!url) return url;
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

const context = await browser.newContext();
const page = await context.newPage();

const rawUrl = inputs[0]?.[0]?.json?.url || 'example.com';
const url = ensureUrlProtocol(rawUrl);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });

const data = {
  url,
  title: await page.title(),
  headings: await page.$$eval('h1, h2, h3', elements =>
    elements.map(el => el.textContent?.trim()).filter(Boolean)
  ),
  links: await page.$$eval('a', elements =>
    elements.map(el => ({ text: el.textContent?.trim(), href: el.href }))
  ),
  instanceId: playwrightSession.instanceId || null,
};

// Do NOT close page/context unless user explicitly asks
// await page.close();
// await context.close();

outputs.A.push({ json: data, binary: {} });
return outputs;
\`\`\`

### Example: Click Button and Wait for Response

\`\`\`javascript
const outputs = { A: [] };

const context = await browser.newContext();
const page = await context.newPage();

const url = ensureUrlProtocol(inputs[0]?.[0]?.json?.url || 'example.com');
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });

// Click button and wait for the API response
const [response] = await Promise.all([
  page.waitForResponse(response => 
    response.url().includes('/api/submit') && response.status() === 200, 
    { timeout: 5000 }
  ),
  page.click('button#submit', { timeout: 5000 })
]);

// Get response data
const responseData = await response.json();

// Wait for element to appear after response
await page.waitForSelector('.success-message', { timeout: 5000 });

const result = {
  success: true,
  responseData,
  message: await page.textContent('.success-message'),
  instanceId: playwrightSession.instanceId || null,
};

outputs.A.push({ json: result, binary: {} });
return outputs;
\`\`\`

### Example: Fill Form, Submit, and Wait for Navigation

\`\`\`javascript
const outputs = { A: [] };

const context = await browser.newContext();
const page = await context.newPage();

const url = ensureUrlProtocol(inputs[0]?.[0]?.json?.url || 'example.com');
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });

// Fill form fields
await page.fill('input[name="email"]', 'user@example.com', { timeout: 5000 });
await page.fill('input[name="password"]', 'password123', { timeout: 5000 });

// Submit and wait for navigation
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 }),
  page.click('button[type="submit"]', { timeout: 5000 })
]);

// Wait for page to fully load
await page.waitForLoadState('networkidle', { timeout: 5000 });

const result = {
  url: page.url(),
  title: await page.title(),
  instanceId: playwrightSession.instanceId || null,
};

outputs.A.push({ json: result, binary: {} });
return outputs;
\`\`\`

### Example: Copy to Clipboard and Read in Next Node

**Node 1: Click Copy Button**
\`\`\`javascript
const outputs = { A: [] };

// Find or create context (keepContext=true to share clipboard)
const contexts = browser.contexts();
let context = contexts.length > 0 ? contexts[0] : await browser.newContext();
let page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

// Grant clipboard permissions
await context.grantPermissions(['clipboard-read', 'clipboard-write']);

// Navigate if needed
const url = ensureUrlProtocol(inputs[0]?.[0]?.json?.url || 'example.com');
if (page.url() !== url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
}

// Click copy button
await page.click('button#copy', { timeout: 5000 });

// Wait for clipboard to update
await page.waitForTimeout(100);

outputs.A.push({ 
  json: { 
    message: 'Copy button clicked',
    instanceId: playwrightSession.instanceId || null 
  }, 
  binary: {} 
});
return outputs;
\`\`\`

**Node 2: Read Clipboard Content**
\`\`\`javascript
const outputs = { A: [] };

// Use the same context (keepContext=true ensures same context)
const contexts = browser.contexts();
if (contexts.length === 0) {
  throw new Error('No context found. Make sure keepContext=true in previous node.');
}

const context = contexts[0];
const pages = context.pages();
if (pages.length === 0) {
  throw new Error('No page found. Make sure keepPage=true in previous node.');
}

const page = pages[0];

// Grant clipboard permissions (if not already granted)
await context.grantPermissions(['clipboard-read', 'clipboard-write']);

// Read clipboard using browser API
const clipboardText = await page.evaluate(async () => {
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    throw new Error('Failed to read clipboard: ' + error.message);
  }
});

// Return clipboard content
outputs.A.push({ 
  json: { 
    clipboardText,
    instanceId: playwrightSession.instanceId || null 
  }, 
  binary: {} 
});
return outputs;
\`\`\`

**IMPORTANT**: For clipboard to work across nodes:
1. Both nodes must have \`keepContext=true\` (or \`keepPage=true\` which includes keepContext)
2. Grant clipboard permissions: \`await context.grantPermissions(['clipboard-read', 'clipboard-write'])\`
3. Use browser clipboard API: \`await page.evaluate(() => navigator.clipboard.readText())\`
4. Wait a moment after clicking copy: \`await page.waitForTimeout(100)\`
`;

