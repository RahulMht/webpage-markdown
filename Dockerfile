# ─────────────────────────────────────────────────────────
# Lightweight Node 20 image with the puppeteer deps baked in
FROM node:20-slim

# Puppeteer needs a handful of system libs for headless Chrome
RUN apt-get update && apt-get install -y \
    ca-certificates wget \
    fonts-liberation libatk-bridge2.0-0 libatk1.0-0 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 \
    libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxrandr2 libxrender1 libxtst6 xdg-utils \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# copy source
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
