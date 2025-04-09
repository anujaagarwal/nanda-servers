# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and config files
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript to JavaScript
RUN npm run build

# Stage 2: Create the final production image
FROM node:18-alpine

WORKDIR /app

# Copy package files again
COPY package.json package-lock.json* ./

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Copy compiled code from the builder stage
COPY --from=builder /app/dist ./dist

# Copy .env file (consider injecting secrets at runtime instead for production)
# COPY .env ./

# Expose the port the app runs on (as defined in src/server.ts or .env)
# Defaulting to 8000 if not set in .env
EXPOSE 8000

# Command to run the compiled JavaScript application
CMD ["node", "dist/server.js"] 