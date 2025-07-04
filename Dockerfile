FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build the application with Smithery CLI
RUN npm run build

# Start the MCP server from built output
CMD ["node", ".smithery/index.cjs"] 