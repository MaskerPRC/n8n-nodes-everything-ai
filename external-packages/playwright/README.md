# Playwright Remote Execution Server

This directory contains the Docker setup for running Playwright browser automation in a remote execution environment.

## Quick Start

### 1. Pull the Docker Image

```bash
docker pull loopsaaage/playwright-remote-execution-server:latest
```

### 2. Run the Container

```bash
docker run -d -p 5004:5004 -e PASSWORD=your-secure-password --name playwright-server loopsaaage/playwright-remote-execution-server:latest
```

### 3. Configure in N8N

In your Everything AI node settings:

- **Enable Playwright**: Check the "Playwright" option
- **Remote Execution Server URL**: 
  - If N8N is running in Docker: `tcp://host.docker.internal:5004`
  - If N8N is running locally: `tcp://localhost:5004`
  - If N8N is on a remote server: `tcp://your-server-ip:5004`
- **Remote Execution Password**: Enter the password you set when running the container

## Image Variants

- **`latest`** (2.13GB): Full Playwright with all browsers (Chromium, Firefox, WebKit)
- **`lightweight`** (1.27GB): Only Chromium browser (40% smaller)

To use the lightweight version:

```bash
docker pull loopsaaage/playwright-remote-execution-server:lightweight
docker run -d -p 5004:5004 -e PASSWORD=your-password --name playwright-server loopsaaage/playwright-remote-execution-server:lightweight
```

## Usage in AI-Generated Code

Once configured, you can use Playwright in your natural language instructions:

```
Open https://example.com, get the page title, and return it in output A
```

The AI will generate code like:

```javascript
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://example.com');
const title = await page.title();
await browser.close();
return { outputA: [{ json: { title } }] };
```

## Building from Source

If you want to build the image yourself:

```bash
cd external-packages/playwright
docker build -t playwright-remote-execution-server:latest .
```

## Security Notes

- Always use a strong password for the `PASSWORD` environment variable
- The server listens on port 5004 by default
- Consider using Docker networks to isolate the container
- The server only executes code sent from authenticated clients

## Troubleshooting

### Connection Issues

- Ensure the container is running: `docker ps | grep playwright`
- Check container logs: `docker logs playwright-server`
- Verify port mapping: `docker port playwright-server`

### Weak Module Errors

If you see weak module errors, ensure you're using the latest version of the node package (v1.10.3+), which includes fixes for dnode compatibility.

