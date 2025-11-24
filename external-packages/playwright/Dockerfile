# Dockerfile for Playwright Remote Execution Server
# This Dockerfile uses Microsoft's official Playwright Docker image
# which already includes Playwright and all browser binaries

# Use Microsoft's official Playwright image
# Available tags: mcr.microsoft.com/playwright:latest (or specific version like v1.55.0-noble)
FROM mcr.microsoft.com/playwright:latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies (dnode for RPC communication)
# Install weak-napi as optional dependency for dnode compatibility
# Install specific playwright version that matches the Docker image
RUN npm install --production && npm install playwright@1.46.1 && npm install weak-napi --save-optional || true

# Expose the RPC server port (default: 5004)
EXPOSE 5004

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5004

# Create weak module mock for dnode compatibility
RUN echo "module.exports = function(obj, callback) { return { get: function() { return obj; } }; };" > /app/node_modules/weak.js

# Copy application files
COPY server.js ./

# Health check (optional - can be removed if not needed)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#     CMD node -e "require('net').createConnection(5004, 'localhost', () => process.exit(0)).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "server.js"]

