# ---- build/deps stage ------------------------------------------------
FROM node:20-slim AS deps

# Install libs needed by Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 libgtk-3-0 libgbm1 \
    libpango-1.0-0 libcairo2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Download the matching Chromium binary once during build
RUN npx puppeteer browsers install chrome

# ---- runtime stage ---------------------------------------------------
FROM node:20-slim

# Same system libs for Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 libgtk-3-0 libgbm1 \
    libpango-1.0-0 libcairo2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy app source
COPY index.js ./index.js

# Copy node_modules and the downloaded browser cache
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /root/.cache/puppeteer /root/.cache/puppeteer

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "index.js"]
