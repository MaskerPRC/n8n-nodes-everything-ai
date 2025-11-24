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
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

const html = await page.content();
const title = await page.title();

await page.close();
await context.close();
\`\`\`

**2. Click / Fill / Extract**
\`\`\`javascript
await page.click('text=Submit');
await page.fill('input[name="email"]', 'user@example.com');

const links = await page.$$eval('a', elements =>
  elements.map(el => ({ text: el.textContent?.trim(), href: el.href }))
);
\`\`\`

**3. Screenshots & Waiting**
\`\`\`javascript
await page.waitForSelector('.content');
await page.screenshot({ path: 'fullpage.png', fullPage: true });
\`\`\`

**4. Accessing Existing Pages (Reusing Pages from Previous Nodes)**
If the user instruction mentions "current page", "existing page", or "already opened page", check for existing pages first:
\`\`\`javascript
// Check if there are any existing contexts and pages
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

// If no existing page found, create a new one
if (!page) {
  context = await browser.newContext();
  page = await context.newPage();
  // Navigate to URL if needed
  const url = ensureUrlProtocol(inputs[0]?.[0]?.json?.url || 'example.com');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
}

// Now use the page (either existing or newly created)
const screenshot = await page.screenshot({ fullPage: true });

// Only close if we created a new context/page
if (context && !contexts.includes(context)) {
  await page.close();
  await context.close();
}
\`\`\`

### Returning Data to n8n

Always return data in the correct n8n structure. Include the Playwright instance ID (if available) so downstream nodes can reuse the browser.

\`\`\`javascript
const outputs = { A: [] };

const context = await browser.newContext();
const page = await context.newPage();

const url = ensureUrlProtocol(inputs[0]?.[0]?.json?.url || 'example.com');
await page.goto(url);

const title = await page.title();

await page.close();
await context.close();

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
2. **Close what you open**: Always close pages and contexts you create to avoid leaks. **BUT**: If you reuse an existing page from \`browser.contexts()\`, do NOT close it - it belongs to another node.
3. **Accessing existing pages**: If user instruction mentions "current page", "existing page", "already opened page", or "now" (e.g., "screenshot the current page"), first check \`browser.contexts()\` and \`context.pages()\` to find existing pages before creating new ones.
4. **URL safety**: Enforce URL protocols with \`ensureUrlProtocol\`.
5. **Return format**: The result must be an object whose keys are output letters (A, B, C...) mapped to arrays of items.
6. **Session reuse**: If \`playwrightSession.instanceId\` is set, include it in your output. Downstream nodes can feed it back in to reuse the same browser.
7. **Remote execution**: Code runs inside a Docker container; file paths are relative to that container.

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
await page.goto(url);

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

await page.close();
await context.close();

outputs.A.push({ json: data, binary: {} });
return outputs;
\`\`\`
`;

