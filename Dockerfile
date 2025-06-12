# ---- dependencies ----
FROM node:20-slim AS deps

# Install system packages for Chromium used by Puppeteer
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 libgtk-3-0 libgbm1 \
    libpango-1.0-0 libcairo2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./

# Install only production dependencies; package-lock.json is optional
RUN npm install --omit=dev

# ---- runtime ----
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 libgtk-3-0 libgbm1 \
    libpango-1.0-0 libcairo2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copy deps and source
COPY --from=deps /app/node_modules ./node_modules
COPY index.js ./index.js

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "index.js"]
