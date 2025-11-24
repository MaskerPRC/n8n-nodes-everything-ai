/**
 * Playwright Documentation for LLM Code Generation
 * 
 * This file contains documentation and examples for using Playwright in generated code.
 * The documentation is provided to the LLM when Playwright is enabled as an external package.
 */

export const PLAYWRIGHT_DOCUMENTATION = `
## Playwright Browser Automation

Playwright is available for browser automation tasks. When using Playwright in your generated code, the code will be executed on a remote Docker container.

### Basic Usage

\`\`\`javascript
const { chromium, firefox, webkit } = require('playwright');

// Launch browser
const browser = await chromium.launch({ headless: true });

// Create a new page
const page = await browser.newPage();

// Navigate to a URL
await page.goto('https://example.com');

// Get page title
const title = await page.title();

// Take a screenshot
await page.screenshot({ path: 'screenshot.png' });

// Close browser
await browser.close();
\`\`\`

### Common Operations

**1. Navigate and Get Content:**
\`\`\`javascript
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://example.com');
const content = await page.content(); // Get full HTML
const text = await page.textContent('body'); // Get text content
await browser.close();
\`\`\`

**2. Click Elements:**
\`\`\`javascript
// Click by text
await page.click('text=Submit');

// Click by selector
await page.click('button#submit');

// Click by role
await page.getByRole('button', { name: 'Submit' }).click();
\`\`\`

**3. Fill Forms:**
\`\`\`javascript
await page.fill('input[name="email"]', 'user@example.com');
await page.fill('input[name="password"]', 'password123');
await page.click('button[type="submit"]');
\`\`\`

**4. Extract Data:**
\`\`\`javascript
// Get text from element
const heading = await page.textContent('h1');

// Get attribute
const href = await page.getAttribute('a', 'href');

// Get multiple elements
const links = await page.$$eval('a', elements => 
  elements.map(el => ({ text: el.textContent, href: el.href }))
);
\`\`\`

**5. Wait for Elements:**
\`\`\`javascript
// Wait for selector
await page.waitForSelector('.content');

// Wait for text
await page.waitForSelector('text=Loading complete');

// Wait for navigation
await page.waitForNavigation();
\`\`\`

**6. Screenshots:**
\`\`\`javascript
// Full page screenshot
await page.screenshot({ path: 'fullpage.png', fullPage: true });

// Element screenshot
const element = await page.$('.content');
await element.screenshot({ path: 'element.png' });
\`\`\`

### Integration with n8n Data Format

When using Playwright in n8n, you must return data in the correct format:

\`\`\`javascript
const { chromium } = require('playwright');
const outputs = { 'A': [] };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://example.com');

// Extract data
const title = await page.title();
const links = await page.$$eval('a', elements => 
  elements.map(el => ({ text: el.textContent, href: el.href }))
);

await browser.close();

// Return in n8n format
outputs['A'].push({
  json: {
    title,
    links,
    linkCount: links.length
  },
  binary: {}
});

return outputs;
\`\`\`

### Important Notes

1. **Always close the browser**: Use \`await browser.close()\` to free resources
2. **Use headless mode**: Set \`headless: true\` for server environments
3. **Handle errors**: Wrap browser operations in try-catch blocks
4. **Return n8n format**: Always return data in \`{ json: {...}, binary: {...} }\` format
5. **Remote execution**: Playwright code runs on a remote Docker container, so file paths are relative to the container
6. **Async/await required**: All Playwright operations are async and must use await

### Example: Scrape a Website

\`\`\`javascript
const { chromium } = require('playwright');
const outputs = { 'A': [] };

try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://example.com');
  
  // Extract data
  const data = {
    title: await page.title(),
    headings: await page.$$eval('h1, h2, h3', elements => 
      elements.map(el => el.textContent)
    ),
    links: await page.$$eval('a', elements => 
      elements.map(el => ({ text: el.textContent, href: el.href }))
    )
  };
  
  await browser.close();
  
  // Return in n8n format
  outputs['A'].push({
    json: data,
    binary: {}
  });
} catch (error) {
  // Handle errors
  outputs['A'].push({
    json: { error: error.message },
    binary: {}
  });
}

return outputs;
\`\`\`
`;

