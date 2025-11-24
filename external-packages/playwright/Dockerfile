# Dockerfile for Playwright Remote Execution Server
# This Dockerfile uses Microsoft's official Playwright Docker image
# which already includes Playwright and all browser binaries

# Use Microsoft's official Playwright image
# Available tags: mcr.microsoft.com/playwright:v1.40.0-noble (or latest)
FROM mcr.microsoft.com/playwright:v1.40.0-noble

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies (dnode for RPC communication)
RUN npm install --production

# Expose the RPC server port (default: 5004)
EXPOSE 5004

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5004

# Copy application files
COPY server.js ./

# Health check (optional - can be removed if not needed)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#     CMD node -e "require('net').createConnection(5004, 'localhost', () => process.exit(0)).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "server.js"]

