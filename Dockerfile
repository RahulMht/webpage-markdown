# ---- build stage ----
FROM node:20-slim AS build

# Puppeteer needs a few extra libs that aren't in the slim image
RUN apt-get update && apt-get install -y \
        libnss3 libatk1.0-0 libx11-xcb1 libxcomposite1 \
        libxdamage1 libxrandr2 libgtk-3-0 libgbm1 \
        libpango-1.0-0 libcairo2 fonts-liberation \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package metadata first for better layer caching
COPY package.json package-lock.json* ./

# Only install production deps
RUN npm ci --omit=dev

# Copy the actual source
COPY . .

# ---- runtime stage ----
FROM node:20-slim

# Same libraries needed at runtime for Chromium
RUN apt-get update && apt-get install -y \
        libnss3 libatk1.0-0 libx11-xcb1 libxcomposite1 \
        libxdamage1 libxrandr2 libgtk-3-0 libgbm1 \
        libpango-1.0-0 libcairo2 fonts-liberation \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules from the build stage
COPY --from=build /app /app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["npm", "start"]
